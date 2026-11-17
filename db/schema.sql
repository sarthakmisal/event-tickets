-- Event Tickets: PostgreSQL schema (idempotent, safe to re-run)

CREATE TABLE IF NOT EXISTS organisers (
  id              bigserial PRIMARY KEY,
  name            text        NOT NULL,
  fee_percent     numeric(5,2) NOT NULL DEFAULT 0 CHECK (fee_percent >= 0 AND fee_percent <= 100),
  wa_number       text,
  wa_connected    boolean     NOT NULL DEFAULT false,
  wa_api_key_enc  text,                       -- AES-256-GCM, never returned by the API
  wa_auto_send    boolean     NOT NULL DEFAULT false,
  wa_attach_image boolean     NOT NULL DEFAULT true,
  wa_message      text        NOT NULL DEFAULT E'Hi {{name}}, your ticket for {{event}} is confirmed.\n\nTicket: {{ticketCode}}\nPersons: {{quantity}}\nAmount: {{amount}}\nWhen: {{date}}\nWhere: {{venue}}\n\nShow this at the gate: {{ticketUrl}}\n\n{{organiser}}',
  contact_address text        NOT NULL DEFAULT '',
  contact_phone   text        NOT NULL DEFAULT '',
  contact_email   text        NOT NULL DEFAULT '',
  gstin           text        NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id            bigserial PRIMARY KEY,
  organiser_id  bigint      NOT NULL REFERENCES organisers(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  email         text        NOT NULL,
  password_hash text        NOT NULL,
  role          text        NOT NULL CHECK (role IN ('admin','staff')),
  is_active     boolean     NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_org_idx ON users (organiser_id);

CREATE TABLE IF NOT EXISTS events (
  id                bigserial PRIMARY KEY,
  organiser_id      bigint        NOT NULL REFERENCES organisers(id) ON DELETE CASCADE,
  slug              text          NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name              text          NOT NULL,
  venue             text          NOT NULL,
  description       text          NOT NULL DEFAULT '',
  starts_at         timestamptz   NOT NULL,
  price             numeric(10,2) NOT NULL CHECK (price >= 0),
  max_per_booking   int           NOT NULL DEFAULT 10 CHECK (max_per_booking >= 1),
  capacity          int           NOT NULL DEFAULT 0 CHECK (capacity >= 0),   -- 0 = no limit
  ask_names         boolean       NOT NULL DEFAULT false,
  is_open           boolean       NOT NULL DEFAULT true,
  created_at        timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_org_start_idx ON events (organiser_id, starts_at DESC);

CREATE TABLE IF NOT EXISTS bookings (
  id             bigserial PRIMARY KEY,
  event_id       bigint        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  code           text          NOT NULL UNIQUE,
  customer_name  text          NOT NULL,
  phone          text          NOT NULL,
  quantity       int           NOT NULL CHECK (quantity >= 1),
  amount         numeric(10,2) NOT NULL CHECK (amount >= 0),
  status         text          NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled')),
  attendee_names jsonb         NOT NULL DEFAULT '[]'::jsonb,
  payment_ref    text,
  created_at     timestamptz   NOT NULL DEFAULT now(),
  paid_at        timestamptz,
  checked_in_at  timestamptz,
  checked_in_by  bigint        REFERENCES users(id) ON DELETE SET NULL,
  CHECK (checked_in_at IS NULL OR status = 'paid')
);
CREATE INDEX IF NOT EXISTS bookings_event_idx   ON bookings (event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bookings_created_idx ON bookings (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS bookings_payment_ref_uq ON bookings (payment_ref) WHERE payment_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS payouts (
  id            bigserial PRIMARY KEY,
  organiser_id  bigint        NOT NULL REFERENCES organisers(id) ON DELETE CASCADE,
  amount        numeric(12,2) NOT NULL CHECK (amount > 0),
  paid_at       timestamptz   NOT NULL DEFAULT now(),
  note          text          NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS payouts_org_idx ON payouts (organiser_id);
