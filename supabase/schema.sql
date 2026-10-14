-- ═══════════════════════════════════════════════════════════════════
-- Dunes Carnival — Supabase Database Schema + RPC Functions
-- Run this entire file in the Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ─── Extensions ──────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Helper: random public code ──────────────────────────────────
CREATE OR REPLACE FUNCTION generate_public_code()
RETURNS text LANGUAGE sql AS $$
  SELECT 'CARD-' || upper(substring(encode(gen_random_bytes(6), 'hex'), 1, 8));
$$;

-- ─── Tables ───────────────────────────────────────────────────────

-- Profiles (linked to Supabase Auth users)
CREATE TABLE IF NOT EXISTS profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         text,
  display_name  text,
  role          text NOT NULL CHECK (role IN ('admin', 'counter', 'stall')),
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Stalls
CREATE TABLE IF NOT EXISTS stalls (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Stall wallets (one per stall)
CREATE TABLE IF NOT EXISTS stall_wallets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stall_id         uuid NOT NULL REFERENCES stalls(id) ON DELETE CASCADE,
  balance          bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),
  txn_count        integer NOT NULL DEFAULT 0,
  assigned_user_id uuid REFERENCES profiles(id),
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Attendee wallets
CREATE TABLE IF NOT EXISTS attendee_wallets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_code text NOT NULL UNIQUE DEFAULT generate_public_code(),
  name        text,
  balance     bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Immutable ledger
CREATE TABLE IF NOT EXISTS ledger (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             text NOT NULL CHECK (kind IN ('create','top_up','spend','refund','reverse')),
  attendee_wallet_id uuid REFERENCES attendee_wallets(id),
  stall_wallet_id  uuid REFERENCES stall_wallets(id),
  tokens           bigint NOT NULL CHECK (tokens > 0),
  payment_method   text,
  upi_ref          text,
  idempotency_key  text UNIQUE,
  note             text,
  created_by       uuid REFERENCES auth.users(id),
  created_by_email text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Idempotency index (prevent duplicate spend requests)
CREATE UNIQUE INDEX IF NOT EXISTS ledger_idempotency_key_idx
  ON ledger (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Settings (single row)
CREATE TABLE IF NOT EXISTS settings (
  id               integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  token_value      numeric NOT NULL DEFAULT 1,
  refund_policy    text DEFAULT 'Refunds available until closing.',
  dashboard_public boolean NOT NULL DEFAULT false,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
INSERT INTO settings DEFAULT VALUES ON CONFLICT (id) DO NOTHING;


-- ─── Views ────────────────────────────────────────────────────────

-- Public attendee wallet view (only expose what's needed for scanning)
CREATE OR REPLACE VIEW attendee_wallets_public AS
  SELECT id, public_code, name, balance
  FROM attendee_wallets
  WHERE active = true;

-- Dashboard stats
CREATE OR REPLACE VIEW dashboard_stats AS
  SELECT
    COALESCE(SUM(CASE WHEN kind = 'spend' THEN tokens ELSE 0 END), 0) AS total_tokens_sold,
    COUNT(CASE WHEN kind = 'spend' THEN 1 END) AS total_txns,
    (SELECT COUNT(*) FROM stall_wallets WHERE active = true AND balance > 0) AS active_stalls
  FROM ledger;

-- Stall leaderboard
CREATE OR REPLACE VIEW stall_leaderboard AS
  SELECT
    sw.id AS stall_wallet_id,
    s.name AS stall_name,
    COALESCE(sw.balance, 0) AS tokens_earned,
    COALESCE(sw.txn_count, 0) AS txn_count
  FROM stall_wallets sw
  JOIN stalls s ON s.id = sw.stall_id
  WHERE sw.active = true
  ORDER BY tokens_earned DESC;

-- Public feed (recent spend transactions)
CREATE OR REPLACE VIEW public_feed AS
  SELECT
    l.id,
    l.tokens,
    l.created_at,
    s.name AS stall_name
  FROM ledger l
  JOIN stall_wallets sw ON sw.id = l.stall_wallet_id
  JOIN stalls s ON s.id = sw.stall_id
  WHERE l.kind = 'spend'
  ORDER BY l.created_at DESC;

-- Tokens per hour
CREATE OR REPLACE VIEW tokens_per_hour AS
  SELECT
    date_trunc('hour', created_at) AS hour,
    SUM(tokens) AS tokens
  FROM ledger
  WHERE kind = 'spend'
  GROUP BY 1
  ORDER BY 1;


-- ─── Enable Realtime ──────────────────────────────────────────────
-- Run these in Supabase Dashboard → Database → Replication, or:
ALTER PUBLICATION supabase_realtime ADD TABLE ledger;
ALTER PUBLICATION supabase_realtime ADD TABLE stall_wallets;
ALTER PUBLICATION supabase_realtime ADD TABLE attendee_wallets;


-- ─── RPC Functions ────────────────────────────────────────────────
-- All mutations go through these SECURITY DEFINER functions.
-- Direct table writes from the frontend are denied via RLS.

-- 1. CREATE ATTENDEE WALLET + first top-up ──────────────────────
CREATE OR REPLACE FUNCTION create_attendee_wallet(
  p_name           text DEFAULT NULL,
  p_tokens         bigint DEFAULT 0,
  p_payment_method text DEFAULT 'cash',
  p_upi_ref        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id   uuid;
  v_public_code text;
  v_user_id     uuid := auth.uid();
  v_email       text;
BEGIN
  -- Role check
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id AND role IN ('counter','admin') AND active = true) THEN
    RAISE EXCEPTION 'Unauthorized: counter or admin role required.';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;

  -- Create wallet
  INSERT INTO attendee_wallets (name, balance)
  VALUES (p_name, GREATEST(p_tokens, 0))
  RETURNING id, public_code INTO v_wallet_id, v_public_code;

  -- Ledger entry
  IF p_tokens > 0 THEN
    INSERT INTO ledger (kind, attendee_wallet_id, tokens, payment_method, upi_ref, created_by, created_by_email)
    VALUES ('create', v_wallet_id, p_tokens, p_payment_method, p_upi_ref, v_user_id, v_email);
  END IF;

  RETURN jsonb_build_object('wallet_id', v_wallet_id, 'public_code', v_public_code);
END;
$$;

-- 2. TOP UP ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION top_up(
  p_public_code    text,
  p_tokens         bigint,
  p_payment_method text DEFAULT 'cash',
  p_upi_ref        text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id uuid;
  v_new_bal   bigint;
  v_user_id   uuid := auth.uid();
  v_email     text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id AND role IN ('counter','admin') AND active = true) THEN
    RAISE EXCEPTION 'Unauthorized.';
  END IF;
  IF p_tokens <= 0 THEN RAISE EXCEPTION 'Tokens must be positive.'; END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;

  -- Atomic update
  UPDATE attendee_wallets
  SET balance = balance + p_tokens
  WHERE public_code = p_public_code AND active = true
  RETURNING id, balance INTO v_wallet_id, v_new_bal;

  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Card not found: %', p_public_code;
  END IF;

  INSERT INTO ledger (kind, attendee_wallet_id, tokens, payment_method, upi_ref, created_by, created_by_email)
  VALUES ('top_up', v_wallet_id, p_tokens, p_payment_method, p_upi_ref, v_user_id, v_email);

  RETURN v_new_bal;
END;
$$;

-- 3. SPEND (charge from attendee to stall) ────────────────────
CREATE OR REPLACE FUNCTION spend(
  p_public_code    text,
  p_stall_wallet_id uuid,
  p_tokens         bigint,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attendee_id   uuid;
  v_attendee_bal  bigint;
  v_stall_bal     bigint;
  v_ledger_id     uuid;
  v_user_id       uuid := auth.uid();
  v_email         text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id AND role IN ('stall','admin') AND active = true) THEN
    RAISE EXCEPTION 'Unauthorized.';
  END IF;

  -- Stall ownership check (stall role can only charge from their own stall)
  IF EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id AND role = 'stall') THEN
    IF NOT EXISTS (
      SELECT 1 FROM stall_wallets
      WHERE id = p_stall_wallet_id AND assigned_user_id = v_user_id AND active = true
    ) THEN
      RAISE EXCEPTION 'You are not assigned to this stall.';
    END IF;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;

  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT l.id, aw.balance, sw.balance
    INTO v_ledger_id, v_attendee_bal, v_stall_bal
    FROM ledger l
    JOIN attendee_wallets aw ON aw.id = l.attendee_wallet_id
    JOIN stall_wallets sw ON sw.id = l.stall_wallet_id
    WHERE l.idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ledger_id', v_ledger_id,
        'attendee_balance', v_attendee_bal,
        'stall_balance', v_stall_bal
      );
    END IF;
  END IF;

  IF p_tokens <= 0 THEN RAISE EXCEPTION 'Tokens must be positive.'; END IF;

  -- Debit attendee (with balance check)
  UPDATE attendee_wallets
  SET balance = balance - p_tokens
  WHERE public_code = p_public_code AND active = true AND balance >= p_tokens
  RETURNING id, balance INTO v_attendee_id, v_attendee_bal;

  IF v_attendee_id IS NULL THEN
    -- Check if card exists at all
    IF NOT EXISTS (SELECT 1 FROM attendee_wallets WHERE public_code = p_public_code) THEN
      RAISE EXCEPTION 'Card not found: %', p_public_code;
    ELSE
      RAISE EXCEPTION 'Insufficient balance.';
    END IF;
  END IF;

  -- Credit stall
  UPDATE stall_wallets
  SET balance = balance + p_tokens, txn_count = txn_count + 1
  WHERE id = p_stall_wallet_id AND active = true
  RETURNING balance INTO v_stall_bal;

  IF v_stall_bal IS NULL THEN
    RAISE EXCEPTION 'Stall wallet not found or inactive.';
  END IF;

  -- Ledger
  INSERT INTO ledger (kind, attendee_wallet_id, stall_wallet_id, tokens, idempotency_key, created_by, created_by_email)
  VALUES ('spend', v_attendee_id, p_stall_wallet_id, p_tokens, p_idempotency_key, v_user_id, v_email)
  RETURNING id INTO v_ledger_id;

  RETURN jsonb_build_object(
    'ledger_id', v_ledger_id,
    'attendee_balance', v_attendee_bal,
    'stall_balance', v_stall_bal
  );
END;
$$;

-- 4. REFUND UNUSED ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION refund_unused(
  p_public_code    text,
  p_tokens         bigint,
  p_payment_method text DEFAULT 'cash'
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id uuid;
  v_new_bal   bigint;
  v_user_id   uuid := auth.uid();
  v_email     text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id AND role IN ('counter','admin') AND active = true) THEN
    RAISE EXCEPTION 'Unauthorized.';
  END IF;
  IF p_tokens <= 0 THEN RAISE EXCEPTION 'Tokens must be positive.'; END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;

  UPDATE attendee_wallets
  SET balance = balance - p_tokens
  WHERE public_code = p_public_code AND active = true AND balance >= p_tokens
  RETURNING id, balance INTO v_wallet_id, v_new_bal;

  IF v_wallet_id IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM attendee_wallets WHERE public_code = p_public_code) THEN
      RAISE EXCEPTION 'Card not found: %', p_public_code;
    ELSE
      RAISE EXCEPTION 'Insufficient balance for refund.';
    END IF;
  END IF;

  INSERT INTO ledger (kind, attendee_wallet_id, tokens, payment_method, created_by, created_by_email)
  VALUES ('refund', v_wallet_id, p_tokens, p_payment_method, v_user_id, v_email);

  RETURN v_new_bal;
END;
$$;

-- 5. REVERSE ENTRY (admin / undo) ─────────────────────────────
CREATE OR REPLACE FUNCTION reverse_entry(
  p_ledger_id uuid,
  p_reason    text DEFAULT 'Manual reversal by admin'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry       ledger%ROWTYPE;
  v_user_id     uuid := auth.uid();
  v_email       text;
BEGIN
  -- Admin or stall (for undo-within-30s)
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id AND role IN ('admin','stall') AND active = true) THEN
    RAISE EXCEPTION 'Unauthorized.';
  END IF;

  SELECT * INTO v_entry FROM ledger WHERE id = p_ledger_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ledger entry not found.'; END IF;
  IF v_entry.kind NOT IN ('spend','top_up') THEN
    RAISE EXCEPTION 'Can only reverse spend or top_up entries.';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;

  IF v_entry.kind = 'spend' THEN
    -- Refund tokens to attendee
    UPDATE attendee_wallets SET balance = balance + v_entry.tokens WHERE id = v_entry.attendee_wallet_id;
    -- Debit stall
    UPDATE stall_wallets
    SET balance = GREATEST(balance - v_entry.tokens, 0), txn_count = GREATEST(txn_count - 1, 0)
    WHERE id = v_entry.stall_wallet_id;
  ELSIF v_entry.kind = 'top_up' THEN
    UPDATE attendee_wallets SET balance = GREATEST(balance - v_entry.tokens, 0) WHERE id = v_entry.attendee_wallet_id;
  END IF;

  -- Record reversal
  INSERT INTO ledger (kind, attendee_wallet_id, stall_wallet_id, tokens, note, created_by, created_by_email)
  VALUES ('reverse', v_entry.attendee_wallet_id, v_entry.stall_wallet_id, v_entry.tokens, p_reason, v_user_id, v_email);
END;
$$;


-- ─── Row Level Security ───────────────────────────────────────────
ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE stalls            ENABLE ROW LEVEL SECURITY;
ALTER TABLE stall_wallets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendee_wallets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger            ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings          ENABLE ROW LEVEL SECURITY;

-- Deny all direct writes from anon/authenticated (mutations go through RPC)
-- Profiles: users can read their own, admin can read all
CREATE POLICY "profiles_read_own"     ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_admin_read"   ON profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "profiles_no_write"     ON profiles FOR INSERT WITH CHECK (false);
CREATE POLICY "profiles_admin_update" ON profiles FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Stalls: authenticated staff can read, only admin can write
CREATE POLICY "stalls_staff_read"  ON stalls FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "stalls_admin_write" ON stalls FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Stall wallets: staff can read own wallet, admin can read all
CREATE POLICY "sw_own_read" ON stall_wallets FOR SELECT USING (
  assigned_user_id = auth.uid() OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','counter'))
);
CREATE POLICY "sw_admin_write" ON stall_wallets FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Attendee wallets: counter/admin can read (for top-up/refund)
CREATE POLICY "aw_counter_read" ON attendee_wallets FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('counter','admin','stall'))
);
-- No direct writes allowed — only through RPC

-- Ledger: authenticated staff can read, no direct writes
CREATE POLICY "ledger_staff_read" ON ledger FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','counter','stall'))
);
-- No direct writes — only through RPC

-- Settings: admin manages
CREATE POLICY "settings_admin" ON settings FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "settings_staff_read" ON settings FOR SELECT USING (auth.role() = 'authenticated');


-- ─── Trigger: auto-create profile on user signup ──────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'role', 'stall'))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── Grant execute permissions ────────────────────────────────────
GRANT EXECUTE ON FUNCTION create_attendee_wallet TO authenticated;
GRANT EXECUTE ON FUNCTION top_up TO authenticated;
GRANT EXECUTE ON FUNCTION spend TO authenticated;
GRANT EXECUTE ON FUNCTION refund_unused TO authenticated;
GRANT EXECUTE ON FUNCTION reverse_entry TO authenticated;

-- ─── Grant view access to authenticated users ──────────────────────
GRANT SELECT ON attendee_wallets_public TO authenticated;
GRANT SELECT ON dashboard_stats TO authenticated;
GRANT SELECT ON stall_leaderboard TO authenticated;
GRANT SELECT ON public_feed TO authenticated;
GRANT SELECT ON tokens_per_hour TO authenticated;
