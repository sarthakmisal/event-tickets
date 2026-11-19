import type { BookingDto, TicketDto } from '@et/shared';
import type { TicketRow } from '../tickets/tickets.repository';
import type { BookingWithEvent } from './bookings.repository';

export const toTicketDto = (t: TicketRow): TicketDto => ({
  id: t.id,
  code: t.code,
  attendeeName: t.attendee_name,
  state: t.state,
});

export const toBookingDto = (b: BookingWithEvent, tickets: TicketRow[]): BookingDto => ({
  id: b.id,
  eventId: b.event_id,
  eventTitle: b.event_title,
  customerName: b.customer_name,
  customerPhone: b.customer_phone,
  quantity: b.quantity,
  amountPaise: b.amount_paise,
  platformFeePaise: b.platform_fee_paise,
  organiserSharePaise: b.organiser_share_paise,
  status: b.status,
  needsRefund: b.needs_refund,
  holdExpiresAt: b.hold_expires_at?.toISOString() ?? null,
  paidAt: b.paid_at?.toISOString() ?? null,
  createdAt: b.created_at.toISOString(),
  tickets: tickets.filter((t) => t.booking_id === b.id).map(toTicketDto),
});
