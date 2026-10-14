# Build, Test, and Deploy Plan

## Phase 1 — Supabase setup
1. Create Supabase project.
2. Run SQL from `03_DATABASE_RPC.md`.
3. Enable Realtime on `ledger`, `wallets`, `public_feed`.
4. Create first admin user in Supabase Auth.
5. Insert profile row with role `admin`.
6. Test RPC functions with SQL editor.

## Phase 2 — Frontend base
1. Create Vite vanilla JS project.
2. Install `@supabase/supabase-js`.
3. Add env vars.
4. Create Supabase client.
5. Build login page for staff.

## Phase 3 — Counter page
1. Create card form.
2. Top-up form.
3. Refund form.
4. QR display and print.
5. Test with fake tokens.

## Phase 4 — Stall page
1. Login and role check.
2. QR scanner.
3. Amount buttons.
4. Confirm and call `spend`.
5. Show success and undo.
6. Test insufficient balance and duplicate request.

## Phase 5 — Dashboard
1. Grand total.
2. Per-stall leaderboard.
3. Recent feed.
4. Realtime subscription.
5. Test with multiple browser tabs.

## Phase 6 — Admin
1. Stall CRUD.
2. Staff CRUD.
3. Ledger view.
4. CSV export.
5. Reverse transaction.

## Phase 7 — Event prep
1. Print QR cards.
2. Create all stall wallets.
3. Create all staff accounts.
4. Test on real phones using venue Wi-Fi/mobile data.
5. Dry run with 3 mock stalls.
6. Export ledger backup every 1–2 hours.

## Acceptance tests
- [ ] Counter can create card with ₹100 tokens.
- [ ] Counter can top up card to ₹200.
- [ ] Attendee balance becomes 200.
- [ ] Stall scans card and charges ₹50.
- [ ] Attendee balance becomes 150.
- [ ] Stall balance becomes 50.
- [ ] Dashboard updates within 2 seconds.
- [ ] Duplicate spend request does not double-charge.
- [ ] Spend beyond balance fails.
- [ ] Counter can refund ₹50.
- [ ] Attendee balance becomes 100.
- [ ] Admin sees full ledger.
- [ ] CSV export matches ledger.
- [ ] Anon user cannot read private tables.
- [ ] Stall volunteer cannot charge from another stall.
- [ ] Realtime works on 20+ open tabs.

## Deployment
- Frontend: Cloudflare Pages / Netlify / Vercel.
- Env vars set in host dashboard.
- Supabase project active day before event.
- Realtime connection count checked.
- Backup plan: CSV export every 1–2 hours.
- Fallback: paper log at stalls if network fails.

## Risks and mitigations
| Risk | Mitigation |
|---|---|
| UPI account limit/freeze | Use college official account, accept cash, larger top-ups, rotate counters |
| Network failure at stall | Paper fallback, manual admin entry later |
| Double scan | Idempotency key + atomic RPC + undo window |
| Duplicate webhook | Not applicable, no gateway |
| Refund disputes | Immutable ledger, reversal entries, admin audit |
| Supabase free tier pause | Open project day before, keep active |
| Realtime connection limit | Only staff/dashboard use realtime, attendees do not open site |
| Card cloning | Long random codes, optional PIN for large balances |
| Cash mismatch | Reconcile: cash collected = tokens sold; ledger shows all movements |