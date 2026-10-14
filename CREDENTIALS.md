# Dunes Carnival — Default Login Credentials

This document contains all default login credentials for staff, volunteers, and administrators across the 2-day carnival.

> [!NOTE]
> Attendees (customers) never register or log into the website. They are issued physical or phone-saved QR badges at the counters. The credentials below are strictly for carnival staff and volunteers.

---

## 🔑 User Credentials Table

| Role | Name / Station | Login Email | Default Password | Target Portal (Auto-Redirect) |
| :--- | :--- | :--- | :--- | :--- |
| **Admin** | Super Administrator | `admin@carnival.com` | `Admin@Dunes2026` | `/admin.html` |
| **Counter Staff** | Main Counter (Gate 1) | `counter1@carnival.com` | `Counter@Dunes2026` | `/counter.html` |
| **Counter Staff** | Express Counter (Gate 2) | `counter2@carnival.com` | `Counter@Dunes2026` | `/counter.html` |
| **Stall Volunteer** | Chaat & Street Food | `stall.chaat@carnival.com` | `Stall@Dunes2026` | `/stall.html` |
| **Stall Volunteer** | Beverages & Mocktails | `stall.drinks@carnival.com` | `Stall@Dunes2026` | `/stall.html` |
| **Stall Volunteer** | Ring Toss & Carnival Games | `stall.games@carnival.com` | `Stall@Dunes2026` | `/stall.html` |
| **Stall Volunteer** | Dunes Official Merch | `stall.merch@carnival.com` | `Stall@Dunes2026` | `/stall.html` |
| **Stall Volunteer** | Desserts & Ice Cream | `stall.desserts@carnival.com` | `Stall@Dunes2026` | `/stall.html` |

---

## 🚀 How to Provision These Users in Supabase

You can provision all of the above accounts, stalls, and assigned wallets in **under 10 seconds** using either Option A (recommended) or Option B.

### Option A: 1-Click Automated SQL Seed (Recommended)
1. Open your [Supabase Project Dashboard](https://supabase.com/dashboard).
2. Go to **SQL Editor** from the left navigation.
3. First ensure you have run [`supabase/schema.sql`](supabase/schema.sql).
4. Copy and paste the entire content of [`supabase/seed_users.sql`](supabase/seed_users.sql) into a new SQL query tab.
5. Click **Run**.
6. All 8 accounts, 5 stalls, and wallet assignments are instantly created and ready to log in immediately!

---

### Option B: Manual Creation via Supabase Dashboard
If you prefer creating accounts manually or want custom passwords:
1. In Supabase Dashboard, go to **Authentication** $\rightarrow$ **Users** $\rightarrow$ Click **Add User** $\rightarrow$ **Create User**.
2. Enter the Email and Password (toggle *Auto Confirm User* on).
3. Copy the created User's **User UID**.
4. Go to **Table Editor** $\rightarrow$ `profiles` table $\rightarrow$ **Insert Row**:
   - `id`: `<User UID>`
   - `email`: `<user's email>`
   - `display_name`: `<Staff Name>`
   - `role`: `admin`, `counter`, or `stall`
   - `active`: `true`

---

## 🧭 Portal Permissions & Access Flow

- **Login (`/` or `/index.html`)**:
  - Staff enter their email and password.
  - The system checks their profile in Supabase and redirects them automatically:
    - `admin` $\rightarrow$ `/admin.html`
    - `counter` $\rightarrow$ `/counter.html`
    - `stall` $\rightarrow$ `/stall.html`

- **Admin Portal (`/admin.html`)**:
  - Add/edit stalls and assign volunteer accounts.
  - View master ledger with instant filters (date, stall, kind).
  - Reverse erroneous transactions.
  - Export CSVs for accounting and audits.

- **Counter Portal (`/counter.html`)**:
  - Issue new attendee cards (Cash or UPI) with printable QR code.
  - Top-up tokens for existing attendee cards.
  - Process unspent token refunds.
  - View real-time counter intake history.

- **Stall Portal (`/stall.html`)**:
  - Camera QR scanner (with native BarcodeDetector + ZXing fallback) and manual code entry.
  - Instant token deduction for food, drinks, and games.
  - 30-second undo window for accidental double taps.
  - Live shift earnings counter.

- **Live Dashboard (`/dashboard.html`)**:
  - Can be projected onto carnival LED screens or opened by supervisors.
  - Real-time token velocity, hourly spending bar chart, and top stall leaderboard.

---

> [!TIP]
> **Production Recommendation:** For production use, please change the passwords in `supabase/seed_users.sql` before running, or reset them in the Supabase Auth dashboard after the event setup.
