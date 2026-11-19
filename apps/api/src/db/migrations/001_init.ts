import { sql } from 'kysely';
import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create table organisers (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      phone text not null,
      email text not null,
      commission_bps integer not null check (commission_bps between 0 and 5000),
      active boolean not null default true,
      created_at timestamptz not null default now()
    );

    create table users (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      phone text not null unique,
      email text,
      password_hash text not null,
      role text not null check (role in ('OWNER','ORGANISER','GATE_STAFF')),
      organiser_id uuid references organisers(id) on delete restrict,
      active boolean not null default true,
      pw_version integer not null default 0,
      created_at timestamptz not null default now(),
      check ((role = 'OWNER') = (organiser_id is null) or role = 'GATE_STAFF')
    );
    create unique index users_email_key on users (lower(email)) where email is not null;

    create table events (
      id uuid primary key default gen_random_uuid(),
      organiser_id uuid not null references organisers(id) on delete restrict,
      title text not null,
      description text not null default '',
      venue text not null,
      starts_at timestamptz not null,
      ends_at timestamptz,
      price_paise integer not null check (price_paise >= 0),
      capacity integer not null check (capacity > 0),
      status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','CANCELLED')),
      commission_bps integer not null check (commission_bps between 0 and 5000),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index events_organiser_idx on events (organiser_id, starts_at desc);

    create table bookings (
      id uuid primary key default gen_random_uuid(),
      event_id uuid not null references events(id) on delete restrict,
      customer_name text not null,
      customer_phone text not null,
      quantity integer not null check (quantity > 0),
      attendee_names jsonb not null default '[]'::jsonb,
      amount_paise integer not null check (amount_paise >= 0),
      status text not null check (status in ('PENDING','PAID','EXPIRED','CANCELLED')),
      hold_expires_at timestamptz,
      access_token text not null,
      platform_fee_paise integer not null default 0,
      organiser_share_paise integer not null default 0,
      needs_refund boolean not null default false,
      paid_at timestamptz,
      created_at timestamptz not null default now()
    );
    create index bookings_event_idx on bookings (event_id, status);
    create index bookings_pending_idx on bookings (hold_expires_at) where status = 'PENDING';

    create table tickets (
      id uuid primary key default gen_random_uuid(),
      booking_id uuid not null references bookings(id) on delete cascade,
      event_id uuid not null references events(id) on delete restrict,
      code text not null unique,
      attendee_name text not null,
      state text not null default 'ISSUED' check (state in ('ISSUED','INSIDE','EXITED','VOID')),
      -- clock_timestamp (not now) so tickets of one booking keep their insert order
      created_at timestamptz not null default clock_timestamp(),
      updated_at timestamptz not null default now()
    );
    create index tickets_event_state_idx on tickets (event_id, state);
    create index tickets_booking_idx on tickets (booking_id);

    create table scan_logs (
      id uuid primary key default gen_random_uuid(),
      event_id uuid references events(id) on delete set null,
      ticket_id uuid references tickets(id) on delete set null,
      code text not null,
      mode text not null check (mode in ('ENTRY','EXIT')),
      ok boolean not null,
      reason text,
      scanned_by uuid not null references users(id) on delete restrict,
      created_at timestamptz not null default now()
    );
    create index scan_logs_event_idx on scan_logs (event_id, created_at desc);

    create table payments (
      id uuid primary key default gen_random_uuid(),
      booking_id uuid not null references bookings(id) on delete cascade,
      provider text not null,
      provider_order_id text not null unique,
      provider_payment_id text unique,
      amount_paise integer not null check (amount_paise >= 0),
      status text not null default 'CREATED' check (status in ('CREATED','CAPTURED','FAILED')),
      created_at timestamptz not null default now()
    );

    create table messages (
      id uuid primary key default gen_random_uuid(),
      booking_id uuid references bookings(id) on delete cascade,
      template text not null,
      to_phone text not null,
      body text not null,
      status text not null default 'QUEUED' check (status in ('QUEUED','SENDING','SENT','FAILED')),
      attempts integer not null default 0,
      next_attempt_at timestamptz not null default now(),
      locked_at timestamptz,
      last_error text,
      created_at timestamptz not null default now(),
      sent_at timestamptz
    );
    create unique index messages_booking_template_key on messages (booking_id, template) where booking_id is not null;
    create index messages_due_idx on messages (next_attempt_at) where status in ('QUEUED','SENDING');
  `.execute(db);
}
