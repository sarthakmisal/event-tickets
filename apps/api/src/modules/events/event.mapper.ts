import { isEventOpen, seatsRemaining } from '@et/shared';
import type { EventDto, PublicEventDto } from '@et/shared';
import { MAX_TICKETS_PER_BOOKING } from '@et/shared';
import type { EventWithCounts } from './events.repository';

export const toEventDto = (e: EventWithCounts): EventDto => ({
  id: e.id,
  organiserId: e.organiser_id,
  organiserName: e.organiser_name,
  title: e.title,
  description: e.description,
  venue: e.venue,
  startsAt: e.starts_at.toISOString(),
  endsAt: e.ends_at?.toISOString() ?? null,
  pricePaise: e.price_paise,
  capacity: e.capacity,
  status: e.status,
  commissionBps: e.commission_bps,
  sold: e.sold,
  held: e.held,
  remaining: seatsRemaining(e.capacity, e.sold, e.held),
  inside: e.inside,
});

/** The customer-facing view: no commission, headcount or other internals. */
export const toPublicEventDto = (e: EventWithCounts, now: Date): PublicEventDto => ({
  id: e.id,
  title: e.title,
  description: e.description,
  venue: e.venue,
  startsAt: e.starts_at.toISOString(),
  endsAt: e.ends_at?.toISOString() ?? null,
  pricePaise: e.price_paise,
  remaining: seatsRemaining(e.capacity, e.sold, e.held),
  maxPerBooking: MAX_TICKETS_PER_BOOKING,
  organiserName: e.organiser_name,
  open: isEventOpen(e.status, e.starts_at, e.ends_at, now),
});
