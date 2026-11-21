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

| Command                                                 |                                                                              |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `npm test`                                              | Shared unit tests + API integration tests (needs PostgreSQL, see below)      |
| `npm run typecheck` / `npm run lint` / `npm run format` |                                                                              |
| `npm start`                                             | Dev: API + web together. With `NODE_ENV=production`: migrate + run built app |
| `npm run build`                                         | API bundle (`apps/api/dist`) + web (`apps/web/dist`)                         |
| `npm run start:prod`                                    | Production mode locally (after `npm run build`)                              |

API tests use `TEST_DATABASE_URL` (default `postgres://evt:evt@localhost:5432/event_tickets_test`). **They drop and recreate the `public` schema of that database**, so never point it at real data.

## Going live (one project, one process)

The API serves the built web panel too, so the whole product is a single Node service on one URL.

1. Host settings: **Build** `npm install --include=dev && npm run build` · **Start** `npm start` · **Health check** `/healthz`.
2. Environment: `NODE_ENV=production`, `DATABASE_URL` (Neon), strong `APP_SECRET` (32+ chars), `PUBLIC_WEB_URL=https://<your-domain>`, `TRUST_PROXY=1`, `PAYMENT_PROVIDER=razorpay` with `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (the app refuses to start in production with the mock provider), optional `SEED_PASSWORD`.
3. `npm start` in production applies pending DB migrations, then starts the server. The first time, run `npm run db:seed` once (or create your owner row) to get a login.
4. In the Razorpay dashboard add a webhook to `https://<your-domain>/api/webhooks/razorpay` for `payment.captured`, using the same secret.
5. Run a single instance (it also runs the hold-expiry and WhatsApp jobs), or set `ENABLE_JOBS=false` on extra ones.

Try it locally first: `npm run build` then `npm run start:prod` (reads `.env`, serves everything on `http://localhost:3000`).

## What is intentionally not built yet

- **Payout split / settlement.** Each paid booking stores the platform fee and organiser share; actually paying organisers is manual for now.
- **Real WhatsApp sending.** Messages are queued, retried and tracked; only the `console` provider exists. Add an adapter in `apps/api/src/integrations/whatsapp/` implementing `WhatsAppProvider` (the unofficial gateway now, the official Cloud API later) and select it in `app.ts`.
- **Refunds.** Cancelled events and late payments with no seat left are flagged `needsRefund`; the refund itself is done in Razorpay.
