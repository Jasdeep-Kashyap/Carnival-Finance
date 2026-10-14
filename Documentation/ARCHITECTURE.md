# Technical Architecture

## Components
1. **Supabase Postgres** — wallets, ledger, profiles, stalls.
2. **Supabase Auth** — staff login only. Attendees do not log in.
3. **Supabase RPC functions** — all mutations: top-up, spend, refund, reverse.
4. **Supabase Realtime** — dashboard and stall pages subscribe to ledger/wallet changes.
5. **Static frontend** — separate pages for counter, stall, dashboard, admin.
6. **QR scanner** — browser camera scanner on stall page.
7. **QR generator** — counter/admin prints attendee cards.

## Data flow
### Top-up
Attendee pays cash/UPI at counter → counter staff opens `/counter` → enters amount → RPC `top_up` or `create_attendee_wallet` → ledger row + wallet balance update → Realtime pushes to dashboard.

### Spend
Stall volunteer opens `/stall` → scans attendee QR → enters amount → RPC `spend` → atomic transfer from attendee wallet to stall wallet → ledger row + balances update → Realtime pushes to dashboard and stall page.

### Refund
Attendee goes to counter with unused balance → counter staff opens `/counter` → scans card → enters refund amount → RPC `refund_unused` → ledger row + wallet balance decreases → cash/UPI paid back manually.

## Security model
- Supabase RLS enabled on all tables.
- Direct table writes denied for anon/authenticated.
- All mutations through `security definer` RPC functions.
- RPC functions check `auth.uid()` against `profiles.role`.
- Counter: can create wallets, top up, refund.
- Stall: can spend only from their assigned stall wallet.
- Admin: can do everything, including reverse entries.
- Dashboard: authenticated read-only, or admin view.

## Realtime model
- Stall page subscribes to its own wallet updates and recent ledger inserts.
- Dashboard subscribes to `ledger` inserts and `wallets` updates.
- If public leaderboard is needed, use a read-only dashboard account rather than exposing private tables to anon.

## Hosting
- Frontend: Cloudflare Pages / Netlify / Vercel.
- Env vars:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Never put `SUPABASE_SERVICE_ROLE_KEY` in frontend.

## Free-tier considerations
- Supabase free tier: ~200 concurrent realtime connections, 2M realtime messages/month, 500 MB DB, 5 GB egress, pauses after 1 week inactivity.
- Keep realtime usage to stalls, counters, admin, and dashboard only.
- Attendees never open the site.
- Export ledger CSV every 1–2 hours during event.
- Open the Supabase project the day before to prevent pause.
- Check current Supabase limits before event.