-- ═══════════════════════════════════════════════════════════════════
-- Dunes Carnival — Seed Users & Demo Stalls
-- Run this in the Supabase SQL Editor AFTER running schema.sql
-- ═══════════════════════════════════════════════════════════════════

-- Ensure pgcrypto is enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Function to safely insert an auth user + profile
CREATE OR REPLACE FUNCTION create_carnival_user(
  p_email text,
  p_password text,
  p_role text,
  p_display_name text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid;
  v_encrypted_pw text;
BEGIN
  -- Check if user already exists
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    v_encrypted_pw := crypt(p_password, gen_salt('bf'));

    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      p_email,
      v_encrypted_pw,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('display_name', p_display_name, 'role', p_role),
      now(),
      now()
    );
  END IF;

  -- Upsert into public.profiles
  INSERT INTO public.profiles (id, email, display_name, role, active)
  VALUES (v_user_id, p_email, p_display_name, p_role, true)
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      display_name = EXCLUDED.display_name,
      role = EXCLUDED.role,
      active = true;

  RETURN v_user_id;
END;
$$;

DO $$
DECLARE
  admin_uid   uuid;
  counter1_uid uuid;
  counter2_uid uuid;
  stall1_uid  uuid;
  stall2_uid  uuid;
  stall3_uid  uuid;
  stall4_uid  uuid;
  stall5_uid  uuid;

  s1_id uuid;
  s2_id uuid;
  s3_id uuid;
  s4_id uuid;
  s5_id uuid;
BEGIN
  -- 1. Create Admin
  admin_uid := create_carnival_user('admin@carnival.com', 'Admin@Dunes2026', 'admin', 'Super Admin');

  -- 2. Create Counter Staff
  counter1_uid := create_carnival_user('counter1@carnival.com', 'Counter@Dunes2026', 'counter', 'Main Counter (Gate 1)');
  counter2_uid := create_carnival_user('counter2@carnival.com', 'Counter@Dunes2026', 'counter', 'Express Counter (Gate 2)');

  -- 3. Create Stall Volunteers
  stall1_uid := create_carnival_user('stall.chaat@carnival.com', 'Stall@Dunes2026', 'stall', 'Chaat & Snacks Staff');
  stall2_uid := create_carnival_user('stall.drinks@carnival.com', 'Stall@Dunes2026', 'stall', 'Beverages Staff');
  stall3_uid := create_carnival_user('stall.games@carnival.com', 'Stall@Dunes2026', 'stall', 'Games Arena Staff');
  stall4_uid := create_carnival_user('stall.merch@carnival.com', 'Stall@Dunes2026', 'stall', 'Merch Store Staff');
  stall5_uid := create_carnival_user('stall.desserts@carnival.com', 'Stall@Dunes2026', 'stall', 'Desserts & Ice Cream Staff');

  -- 4. Create default stalls if not exist
  INSERT INTO public.stalls (name, active) VALUES ('Chaat & Street Food', true) RETURNING id INTO s1_id;
  INSERT INTO public.stalls (name, active) VALUES ('Beverages & Mocktails', true) RETURNING id INTO s2_id;
  INSERT INTO public.stalls (name, active) VALUES ('Ring Toss & Carnival Games', true) RETURNING id INTO s3_id;
  INSERT INTO public.stalls (name, active) VALUES ('Dunes Official Merch', true) RETURNING id INTO s4_id;
  INSERT INTO public.stalls (name, active) VALUES ('Desserts & Ice Cream', true) RETURNING id INTO s5_id;

  -- 5. Create stall wallets and assign stall volunteers
  INSERT INTO public.stall_wallets (stall_id, balance, assigned_user_id, active)
  VALUES (s1_id, 0, stall1_uid, true);

  INSERT INTO public.stall_wallets (stall_id, balance, assigned_user_id, active)
  VALUES (s2_id, 0, stall2_uid, true);

  INSERT INTO public.stall_wallets (stall_id, balance, assigned_user_id, active)
  VALUES (s3_id, 0, stall3_uid, true);

  INSERT INTO public.stall_wallets (stall_id, balance, assigned_user_id, active)
  VALUES (s4_id, 0, stall4_uid, true);

  INSERT INTO public.stall_wallets (stall_id, balance, assigned_user_id, active)
  VALUES (s5_id, 0, stall5_uid, true);

  RAISE NOTICE 'Dunes Carnival Seed Completed Successfully!';
END;
$$;
