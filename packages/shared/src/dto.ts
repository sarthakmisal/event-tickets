import type {
  BookingStatus,
  EventStatus,
  MessageStatus,
  PaymentProviderName,
  Role,
  ScanMode,
  TicketState,
} from './constants';
import type { ScanRejection } from './ticket';

/** Dates travel as ISO-8601 strings. */
export type IsoDate = string;

export interface UserDto {
  id: string;
  name: string;
  role: Role;
  phone: string;
  email: string | null;
  organiserId: string | null;
  organiserName: string | null;
  active: boolean;
}

export interface OrganiserDto {
  id: string;
  name: string;
  phone: string;
  email: string;
  commissionBps: number;
  active: boolean;
  eventCount: number;
  createdAt: IsoDate;
}

export interface EventDto {
  id: string;
  organiserId: string;
  organiserName: string;
  title: string;
  description: string;
  venue: string;
  startsAt: IsoDate;
  endsAt: IsoDate | null;
  pricePaise: number;
  capacity: number;
  status: EventStatus;
  commissionBps: number;
  sold: number;
  held: number;
  remaining: number;
  inside: number;
}

export interface TicketDto {
  id: string;
  code: string;
  attendeeName: string;
  state: TicketState;
}

export interface BookingDto {
  id: string;
  eventId: string;
  eventTitle: string;
  customerName: string;
  customerPhone: string;
  quantity: number;
  amountPaise: number;
  platformFeePaise: number;
  organiserSharePaise: number;
  status: BookingStatus;
  needsRefund: boolean;
  holdExpiresAt: IsoDate | null;
  paidAt: IsoDate | null;
  createdAt: IsoDate;
  tickets: TicketDto[];
}

export interface MessageDto {
  id: string;
  bookingId: string | null;
  toPhone: string;
  body: string;
  status: MessageStatus;
  attempts: number;
  lastError: string | null;
  createdAt: IsoDate;
  sentAt: IsoDate | null;
}

export type WhatsAppConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'QR' | 'CONNECTED';

/** Linked-number status for the signed-in owner (platform number) or organiser (their own). */
export interface WhatsAppStatusDto {
  /** False when the server is not running the QR sender; the panel hides the card. */
  supported: boolean;
  scope: 'PLATFORM' | 'ORGANISER';
  state: WhatsAppConnectionState;
  /** Raw QR string to render while state is QR. */
  qr: string | null;
  phone: string | null;
  /** Why the last connection attempt ended (shown to the user), if it did. */
  error: string | null;
  /** Organisers only: true when the platform number will send for them until they link their own. */
  fallbackConnected: boolean;
}

export interface ScanResultDto {
  ok: boolean;
  mode: ScanMode;
  code: string;
  reason: ScanRejection | null;
  message: string;
  attendeeName: string | null;
  eventTitle: string | null;
  inside: number | null;
}

export interface ScanLogDto {
  id: string;
  code: string;
  mode: ScanMode;
  ok: boolean;
  reason: ScanRejection | null;
  attendeeName: string | null;
  scannedBy: string;
  createdAt: IsoDate;
}

export interface DashboardDto {
  scope: 'platform' | 'organiser';
  grossPaise: number;
  platformFeePaise: number;
  organiserSharePaise: number;
  paidBookings: number;
  ticketsSold: number;
  liveEvents: number;
  inside: number;
  organisers: number | null;
  pendingMessages: number;
}

export interface PublicEventDto {
  id: string;
  title: string;
  description: string;
  venue: string;
  startsAt: IsoDate;
  endsAt: IsoDate | null;
  pricePaise: number;
  remaining: number;
  maxPerBooking: number;
  organiserName: string;
  open: boolean;
}

export interface PaymentIntentDto {
  provider: PaymentProviderName;
  orderId: string;
  amountPaise: number;
  /** Razorpay public key id; null for the mock provider. */
  keyId: string | null;
}

export interface CreatedBookingDto {
  booking: BookingDto;
  /** null when the booking is free and was confirmed immediately. */
  payment: PaymentIntentDto | null;
  accessToken: string;
}

export interface PublicBookingDto {
  booking: BookingDto;
  event: PublicEventDto;
}

export interface TicketViewDto {
  ticket: TicketDto;
  eventTitle: string;
  venue: string;
  startsAt: IsoDate;
}
