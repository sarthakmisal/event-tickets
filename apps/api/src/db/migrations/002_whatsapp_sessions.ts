import { sql } from 'kysely';
import type { Kysely } from 'kysely';

/** Linked-device (QR) WhatsApp sessions. owner_key is 'platform' or an organiser id. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create table whatsapp_sessions (
      owner_key text primary key,
      creds text not null,
      registered boolean not null default false,
      phone text,
      updated_at timestamptz not null default now()
    );
    create table whatsapp_auth_keys (
      owner_key text not null references whatsapp_sessions(owner_key) on delete cascade,
      type text not null,
      id text not null,
      value text not null,
      primary key (owner_key, type, id)
    );
  `.execute(db);
}
