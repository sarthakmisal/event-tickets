# Event Tickets

Multi-organiser event ticketing: the **platform owner** appoints **organisers**, organisers run **events**, customers **book and pay**, and **gate staff** scan a per-person QR for **entry and exit**. Ticket confirmations go out on WhatsApp.

Design, diagrams and decisions: [`docs/DESIGN.md`](docs/DESIGN.md).

## Layout

| Path              | What                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| `packages/shared` | Business rules used by both API and UI: commission split, gate state machine, capacity, validation schemas, DTO types |
| `apps/api`        | Express + Kysely + PostgreSQL. Tests run against a real database                                                      |
| `apps/web`        | React panel (owner, organiser, gate) and customer booking pages                                                       |

## Run it

Needs Node 20+ and PostgreSQL 14+.

```bash
npm install
cp .env.example .env            # set DATABASE_URL and APP_SECRET (32+ random chars)
npm run db:migrate
npm run db:seed                 # prints the sign-in details once
npm run dev:api                 # http://localhost:3000
npm run dev:web                 # http://localhost:5173 (proxies /api to :3000)
```

Sign in with the phone numbers the seed prints (owner `7498605559`, organiser `9000000001`, gate staff `9000000002`). Customers book at `/e`.

`PAYMENT_PROVIDER=mock` (default outside production) shows a test checkout, so everything works without a Razorpay account. `WHATSAPP_PROVIDER=console` prints messages to the API log.

## Demo without a database

```bash
npm run build:demo        # -> apps/web/dist-demo/index.html, one self-contained file
```

Open it in any browser. It runs the same UI on an in-memory API that reuses the real business rules (same validation, commission split, seat limits, gate state machine and error messages). A control dock lets you switch role, jump the clock to expire seat holds, and make WhatsApp fail to see retries. Data resets on refresh.

## Scripts

| Command                                                 |                                                                         |
| ------------------------------------------------------- | ----------------------------------------------------------------------- |
| `npm test`                                              | Shared unit tests + API integration tests (needs PostgreSQL, see below) |
| `npm run typecheck` / `npm run lint` / `npm run format` |                                                                         |
| `npm run build`                                         | API bundle (`apps/api/dist/main.js`) + web (`apps/web/dist`)            |

API tests use `TEST_DATABASE_URL` (default `postgres://evt:evt@localhost:5432/event_tickets_test`). **They drop and recreate the `public` schema of that database**, so never point it at real data.

## Going live

1. `NODE_ENV=production`, strong `APP_SECRET`, `TRUST_PROXY=1` behind a proxy, `PUBLIC_WEB_URL` set to your site.
2. `PAYMENT_PROVIDER=razorpay` with `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (the app refuses to start in production with the mock provider).
3. In the Razorpay dashboard add a webhook to `https://<your-domain>/api/webhooks/razorpay` for the `payment.captured` event, using the same secret.
4. Serve the web build and the API **on the same domain** (e.g. nginx: `/` static, `/api` proxied to the API). Sessions are same-site cookies.
5. Run `npm run db:migrate`, then `node apps/api/dist/main.js`. The process also runs the hold-expiry and WhatsApp jobs; run a single instance, or set `ENABLE_JOBS=false` on extra ones.

## What is intentionally not built yet

- **Payout split / settlement.** Each paid booking stores the platform fee and organiser share; actually paying organisers is manual for now.
- **Real WhatsApp sending.** Messages are queued, retried and tracked; only the `console` provider exists. Add an adapter in `apps/api/src/integrations/whatsapp/` implementing `WhatsAppProvider` (the unofficial gateway now, the official Cloud API later) and select it in `app.ts`.
- **Refunds.** Cancelled events and late payments with no seat left are flagged `needsRefund`; the refund itself is done in Razorpay.
