# Carnival Token Revenue System — Antigravity Spec README

## Project
A real-time revenue dashboard for a college carnival. Attendees top up tokens at a counter using cash or UPI. They receive a QR card/wristband. Stalls scan the card and charge tokens. The dashboard updates live with stall earnings, grand total, and recent transactions.

## Critical decision
There is **no payment gateway integration**.
The website does **not** detect UPI payments.
Money enters only at the top-up counter. Everything after that is internal token movement inside Supabase.

## Stack
- Database/Auth/Realtime/RPC: Supabase
- Frontend: static HTML + JavaScript, preferably Vite + vanilla JS
- Hosting: Cloudflare Pages, Netlify, Vercel, or GitHub Pages
- QR scanning: browser JS library, e.g. `html5-qrcode` or `@zxing/browser`
- QR generation: browser JS library, e.g. `qrcode`

## Non-goals
- No Razorpay/Cashfree/PayU integration.
- No automatic UPI payment detection.
- No bank SMS reading.
- No attendee login.
- No native mobile app.
- No custom WebSocket server.

## How Antigravity should use these specs
Read all files in `/specs` before coding.
Build in the order given in `05_BUILD_TEST_DEPLOY.md`.
Do not invent payment gateway code.
Use Supabase RPC functions for all mutations.
Never expose the Supabase service role key in frontend code.
Use the anon key only.
All money/token mutations must go through database functions, not direct table updates from the browser.