# Product Requirements Document

## 1. Problem
A college carnival has many stalls. Organizers want real-time revenue per stall and overall. Student volunteers cannot use a payment gateway because accounts are personal, not merchant. UPI payments to stalls cannot be detected automatically by a website.

## 2. Solution
Use a token wallet system.

### Flow
1. Attendee goes to a top-up counter.
2. Pays cash or UPI.
3. Counter staff creates/tops up a token wallet.
4. Attendee receives a QR card/wristband with a unique code.
5. At a stall, volunteer scans the attendee QR.
6. Volunteer enters/selects amount.
7. Tokens move from attendee wallet to stall wallet.
8. Dashboard updates live.

## 3. Users
- **Attendee:** no login. Holds a QR card. Spends tokens.
- **Counter staff:** logs in. Creates cards, tops up, refunds unused tokens.
- **Stall volunteer:** logs in. Scans cards, charges tokens, can undo recent mistake.
- **Admin/organizer:** logs in. Manages stalls, staff, ledger, reports, CSV export.
- **Dashboard viewer:** read-only. Can be shown on a big screen.

## 4. Core requirements
- Each attendee has a unique unguessable public code.
- Each stall has a wallet.
- All token movements are recorded in an immutable ledger.
- Balances are updated atomically to prevent double-spend.
- Duplicate requests must be idempotent.
- Dashboard shows live grand total, per-stall totals, transaction count, recent feed.
- Admin can export CSV.
- Refunds and corrections are recorded as new ledger entries, never by editing old ones.

## 5. Success metrics
- A top-up takes under 15 seconds.
- A stall charge takes under 5 seconds.
- Dashboard updates within 2 seconds of a charge.
- No double-spend under normal network conditions.
- CSV export matches ledger totals.
- System works for 2–4k attendees and 30–60 stalls on Supabase free tier, with only staff/dashboard using realtime.

## 6. Acceptance criteria
- Counter can create a card with initial tokens.
- Counter can top up an existing card.
- Counter can refund unused tokens.
- Stall can scan a card and charge tokens.
- Stall cannot charge more than attendee balance.
- Duplicate charge request does not double-charge.
- Dashboard updates live.
- Admin can see full ledger and export CSV.
- Anon users cannot read private tables.
- Staff can only perform actions allowed by their role.