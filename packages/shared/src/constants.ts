export const ROLES = ['OWNER', 'ORGANISER', 'GATE_STAFF'] as const;
export type Role = (typeof ROLES)[number];

export const EVENT_STATUSES = ['DRAFT', 'PUBLISHED', 'CANCELLED'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const BOOKING_STATUSES = ['PENDING', 'PAID', 'EXPIRED', 'CANCELLED'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** ISSUED = never scanned, INSIDE = entered, EXITED = left (may re-enter), VOID = cancelled. */
export const TICKET_STATES = ['ISSUED', 'INSIDE', 'EXITED', 'VOID'] as const;
export type TicketState = (typeof TICKET_STATES)[number];

export const SCAN_MODES = ['ENTRY', 'EXIT'] as const;
export type ScanMode = (typeof SCAN_MODES)[number];

export const MESSAGE_STATUSES = ['QUEUED', 'SENDING', 'SENT', 'FAILED'] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const PAYMENT_PROVIDERS = ['mock', 'razorpay'] as const;
export type PaymentProviderName = (typeof PAYMENT_PROVIDERS)[number];

/** How long seats stay reserved while the customer pays. */
export const HOLD_MINUTES = 15;
export const MAX_TICKETS_PER_BOOKING = 10;
export const BPS_DENOMINATOR = 10_000;
export const MAX_COMMISSION_BPS = 5_000;

export const TICKET_CODE_LENGTH = 10;
/** Crockford base32 — no I, L, O, U so codes survive being read aloud or typed. */
export const TICKET_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
