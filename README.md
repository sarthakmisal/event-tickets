# Event Tickets: organiser panel

Express + PostgreSQL backend with the responsive organiser panel (dashboard, events, team, settings, gate scanner).

## Run

```bash
npm install
cp .env.example .env          # fill DATABASE_URL and APP_SECRET (loaded automatically)
npm run db:migrate            # creates tables (idempotent)
npm run db:seed               # optional demo data; prints one-time passwords
npm start                     # http://localhost:3000
npm test                      # needs a Postgres database, see TEST_DATABASE_URL below
```

Tests use `TEST_DATABASE_URL` (default `postgres://evt:evt@localhost:5432/event_tickets_test`) and **truncate its tables**. Never point it at real data.

## Layout

| Path | What |
|---|---|
| `db/schema.sql` | organisers, users, events, bookings, payouts |
| `src/routes/*.js` | auth, admin (overview + events), team, settings, scan, public, webhooks |
| `src/whatsapp.js` | kwskit adapter and template renderer |
| `public/` | the panel (`index.html`, `app.css`, `app.js`), served by Express |

## API summary

Admin (cookie session, header `X-Requested-With: fetch` on writes):

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/me`
- `GET /api/overview`, `GET|POST /api/events`, `GET|PATCH|DELETE /api/events/:slug`, `GET /api/events/:slug/qr.png`
- `GET|POST /api/team`, `PATCH /api/team/:id`, `POST /api/team/:id/password`
- `GET /api/settings`, `PUT /api/settings/{delivery|contact|api-key}`, `GET /api/settings/wa-status`, `POST /api/settings/test-message`
- `POST /api/scan` (admin and gate staff)

Public (no login), for your booking page:

- `GET /api/public/events/:slug`, `POST /api/public/events/:slug/bookings`
- `GET /api/public/tickets/:code`, `GET /api/public/tickets/:code/qr.png`

Payment confirmation:

- `POST /api/webhooks/payment` with `x-signature: hex(HMAC_SHA256(rawBody, PAYMENT_WEBHOOK_SECRET))` and body `{ "bookingCode", "paymentRef", "amount" }`. Idempotent. Marks the booking paid and, if auto-send is on, sends the WhatsApp ticket.

## Things you must wire yourself

1. **Payment gateway.** Bookings are created as `pending`. Call the webhook above from your gateway's success callback (or adapt `src/routes/webhooks.js` to the gateway's own signature scheme, for example Razorpay).
2. **kwskit.** `src/whatsapp.js` posts to `KWSKIT_BASE_URL + /messages`. Adjust the path and body to your kwskit docs. Until `KWSKIT_BASE_URL` is set, test messages return a clear 503.
3. **Public booking page** (`/e/:slug`) and **ticket page** (`/t/:code`) are not part of this panel. The QR codes and WhatsApp links point to them.

## Behaviour worth knowing

- Capacity: paid tickets plus pending bookings from the last 30 minutes count against capacity; the event row is locked during booking, so concurrent buyers cannot oversell.
- Check-in is one atomic `UPDATE`, so two phones scanning the same ticket cannot both pass.
- Disabling a member or changing their password ends their live sessions immediately.
- Camera scanning uses the browser `BarcodeDetector` API (Chrome/Android). Other browsers fall back to typing the code.
- Login failures are rate limited (10 per 15 minutes per IP); set `TRUST_PROXY` behind a proxy so the real IP is used.
