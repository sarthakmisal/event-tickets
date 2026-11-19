import { HOLD_MINUTES } from './constants';
import type { BookingStatus, EventStatus } from './constants';

/** Seats left once paid tickets and still-active pending holds are counted. */
export function seatsRemaining(capacity: number, sold: number, held: number): number {
  return Math.max(0, capacity - sold - held);
}

export function holdExpiresAt(now: Date): Date {
  return new Date(now.getTime() + HOLD_MINUTES * 60_000);
}

export function isHoldActive(status: BookingStatus, expiresAt: Date | null, now: Date): boolean {
  return status === 'PENDING' && expiresAt !== null && expiresAt.getTime() > now.getTime();
}

const DEFAULT_EVENT_DURATION_MS = 12 * 3_600_000;

/** An event accepts bookings while published and not yet over (no end time = 12h after start). */
export function isEventOpen(
  status: EventStatus,
  startsAt: Date,
  endsAt: Date | null,
  now: Date,
): boolean {
  const end = endsAt ?? new Date(startsAt.getTime() + DEFAULT_EVENT_DURATION_MS);
  return status === 'PUBLISHED' && end.getTime() > now.getTime();
}

export const bookingTotal = (pricePaise: number, quantity: number): number => pricePaise * quantity;
