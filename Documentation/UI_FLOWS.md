
---

# File 5: `04_UI_FLOWS.md`

```md
# UI Flows and Screens

## 1. `/counter` — Top-up counter
### Login
- Staff logs in with Supabase Auth.
- Only `counter` or `admin` roles allowed.

### Create new card
Fields:
- Optional attendee name
- Initial tokens: ₹10, ₹20, ₹50, ₹100, ₹200, ₹500, custom
- Payment method: Cash / UPI
- Optional UPI reference

Actions:
- Create wallet
- Show QR code and public code
- Print card/slip

### Top up existing card
- Scan QR or enter public code
- Show current balance
- Enter tokens
- Payment method
- Confirm
- Show new balance

### Refund unused tokens
- Scan QR or enter public code
- Show current balance
- Enter refund tokens
- Payment method
- Confirm
- Show new balance

### Recent top-ups
- Last 20 top-ups/refunds at this counter.

---

## 2. `/stall` — Stall volunteer page
### Login
- Staff logs in.
- Only `stall` or `admin` roles allowed.
- Stall volunteer is linked to one stall wallet.

### Charge flow
1. Tap “Scan card”.
2. Camera scans attendee QR.
3. Show attendee public code and current balance.
4. Amount buttons: ₹10, ₹20, ₹50, ₹100, custom.
5. Tap amount.
6. Confirm screen: “Charge ₹50 from CARD-XXXX to Stall Name?”
7. Call `spend` RPC.
8. Success screen: new attendee balance, new stall balance.
9. “Undo last charge” button active for 30 seconds.

### Error states
- Insufficient balance.
- Wallet not found.
- Duplicate request.
- Network error: show “Retry” and keep amount visible.

### Offline fallback
- If network fails, show “Record on paper” reminder.
- Admin can enter missed sales later as manual ledger entries.

---

## 3. `/dashboard` — Live dashboard
### Top section
- Grand total tokens
- Grand total ₹ value
- Total transactions
- Number of active stalls

### Leaderboard
Table columns:
- Rank
- Stall name
- Tokens earned
- ₹ value
- Transaction count

### Recent feed
- Last 20 sales: “Stall A +₹50”, timestamp.

### Chart
- Tokens per hour, if data available.

### Realtime
- Subscribe to `ledger` inserts and `wallets` updates.
- Update totals without page refresh.

---

## 4. `/admin` — Organizer page
### Stalls
- Add stall
- Edit stall
- Deactivate stall
- Assign stall volunteer

### Staff
- Add counter/stall/admin user
- Deactivate user

### Ledger
- Filter by stall, date, kind, staff
- View full transaction
- Reverse transaction with reason

### Export
- CSV export of ledger
- CSV export of per-stall totals

### Settings
- Token value: 1 token = ₹?
- Refund policy
- Public/private dashboard

---

## 5. QR card generation
- Counter prints a card/slip with:
  - Carnival name
  - Public code
  - QR code containing only the public code
  - Optional attendee name
- QR code should be large enough to scan quickly.
- Use `qrcode` JS library in browser.

## 6. QR scanning
- Use `html5-qrcode` or `@zxing/browser`.
- Ask for camera permission.
- Scan only QR format.
- On success, stop camera and show result.
- Provide manual code entry fallback.