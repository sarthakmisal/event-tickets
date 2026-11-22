import type { ColumnType, Generated, Kysely, Transaction } from 'kysely';
import type {
  BookingStatus,
  EventStatus,
  MessageStatus,
  PaymentProviderName,
  Role,
  ScanMode,
  TicketState,
} from '@et/shared';

export interface OrganisersTable {
  id: Generated<string>;
  name: string;
  phone: string;
  email: string;
  commission_bps: number;
  active: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface UsersTable {
  id: Generated<string>;
  name: string;
  phone: string;
  email: string | null;
  password_hash: string;
  role: Role;
  organiser_id: string | null;
  active: Generated<boolean>;
  /** Bumped on password change so older session tokens stop working. */
  pw_version: Generated<number>;
  created_at: Generated<Date>;
}

export interface EventsTable {
  id: Generated<string>;
  organiser_id: string;
  title: string;
  description: Generated<string>;
  venue: string;
  starts_at: Date;
  ends_at: Date | null;
  price_paise: number;
  capacity: number;
  status: Generated<EventStatus>;
  /** Snapshot of the organiser's commission when the event was created. */
  commission_bps: number;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface BookingsTable {
  id: Generated<string>;
  event_id: string;
  customer_name: string;
  customer_phone: string;
  quantity: number;
  /** jsonb: read as string[], written as a JSON string. */
  attendee_names: ColumnType<string[], string | undefined, string>;
  amount_paise: number;
  status: BookingStatus;
  hold_expires_at: Date | null;
  access_token: string;
  platform_fee_paise: Generated<number>;
  organiser_share_paise: Generated<number>;
  needs_refund: Generated<boolean>;
  paid_at: Date | null;
  created_at: Generated<Date>;
}

export interface TicketsTable {
  id: Generated<string>;
  booking_id: string;
  event_id: string;
  code: string;
  attendee_name: string;
  state: Generated<TicketState>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ScanLogsTable {
  id: Generated<string>;
  event_id: string | null;
  ticket_id: string | null;
  code: string;
  mode: ScanMode;
  ok: boolean;
  reason: string | null;
  scanned_by: string;
  created_at: Generated<Date>;
}

export type PaymentStatus = 'CREATED' | 'CAPTURED' | 'FAILED';

export interface PaymentsTable {
  id: Generated<string>;
  booking_id: string;
  provider: PaymentProviderName;
  provider_order_id: string;
  provider_payment_id: string | null;
  amount_paise: number;
  status: Generated<PaymentStatus>;
  created_at: Generated<Date>;
}

export interface MessagesTable {
  id: Generated<string>;
  booking_id: string | null;
  template: string;
  to_phone: string;
  body: string;
  status: Generated<MessageStatus>;
  attempts: Generated<number>;
  next_attempt_at: Generated<Date>;
  locked_at: Date | null;
  last_error: string | null;
  created_at: Generated<Date>;
  sent_at: Date | null;
}

export interface WhatsappSessionsTable {
  owner_key: string;
  /** Baileys credentials, serialised with BufferJSON. */
  creds: string;
  registered: Generated<boolean>;
  phone: string | null;
  updated_at: Generated<Date>;
}

export interface WhatsappAuthKeysTable {
  owner_key: string;
  type: string;
  id: string;
  /** Serialised with BufferJSON. */
  value: string;
}

export interface Database {
  organisers: OrganisersTable;
  users: UsersTable;
  events: EventsTable;
  bookings: BookingsTable;
  tickets: TicketsTable;
  scan_logs: ScanLogsTable;
  payments: PaymentsTable;
  messages: MessagesTable;
  whatsapp_sessions: WhatsappSessionsTable;
  whatsapp_auth_keys: WhatsappAuthKeysTable;
}

export type Db = Kysely<Database>;
/** Repositories accept either, so the same code runs inside or outside a transaction. */
export type Executor = Kysely<Database> | Transaction<Database>;
