import {
  formatINR,
  MESSAGE_TEMPLATES,
  renderTemplate,
  seatsRemaining,
  splitCommission,
} from '@et/shared';
import type { Db, Executor } from '../../db/schema';
import type { Clock } from '../../shared/clock';
import { AppError, notFound } from '../../shared/errors';
import type { Logger } from '../../shared/logger';
import { eventsRepository } from '../events/events.repository';
import type { EventRow } from '../events/events.repository';
import { messagesRepository } from '../messaging/messages.repository';
import { paymentsRepository } from '../payments/payments.repository';
import { ticketsRepository } from '../tickets/tickets.repository';
import { bookingsRepository } from './bookings.repository';
import type { BookingRow } from './bookings.repository';

const when = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Kolkata',
});

export interface SettleInput {
  orderId: string;
  paymentId: string;
  /** Present on webhooks; checked against the order so a mismatched capture is never accepted. */
  amountPaise?: number;
}

/**
 * The single place where a booking becomes PAID: splits the commission, issues tickets and
 * queues the WhatsApp message. Used by free bookings, checkout confirmation and webhooks.
 */
export function createFulfilmentService(db: Db, clock: Clock, webUrl: string, log: Logger) {
  const attendeeName = (booking: BookingRow, index: number): string =>
    booking.attendee_names[index]?.trim() ||
    (index === 0 ? booking.customer_name : `${booking.customer_name} +${index}`);

  /** Must run inside the transaction that holds the event and booking row locks. */
  async function fulfil(trx: Executor, event: EventRow, booking: BookingRow): Promise<void> {
    const now = clock();
    const { platformFeePaise, organiserSharePaise } = splitCommission(
      booking.amount_paise,
      event.commission_bps,
    );
    await bookingsRepository(trx).update(booking.id, {
      status: 'PAID',
      paid_at: now,
      hold_expires_at: null,
      platform_fee_paise: platformFeePaise,
      organiser_share_paise: organiserSharePaise,
    });
    const names = Array.from({ length: booking.quantity }, (_, i) => attendeeName(booking, i));
    await ticketsRepository(trx).issue(booking.id, event.id, names);
    await messagesRepository(trx).enqueue({
      booking_id: booking.id,
      template: 'BOOKING_CONFIRMED',
      to_phone: `91${booking.customer_phone}`,
      body: renderTemplate(MESSAGE_TEMPLATES.BOOKING_CONFIRMED, {
        name: booking.customer_name,
        event: event.title,
        quantity: booking.quantity,
        amount: booking.amount_paise === 0 ? 'Free' : formatINR(booking.amount_paise),
        when: when.format(event.starts_at),
        venue: event.venue,
        link: `${webUrl.replace(/\/$/, '')}/b/${booking.id}?t=${booking.access_token}`,
      }),
    });
  }

  /** Idempotent: safe to call from both the checkout confirmation and the webhook, in any order. */
  async function settlePayment(input: SettleInput): Promise<string> {
    return db.transaction().execute(async (trx) => {
      const unlocked = await paymentsRepository(trx).findByOrderId(input.orderId);
      if (!unlocked) throw notFound('Payment');
      const preview = await bookingsRepository(trx).findById(unlocked.booking_id);
      if (!preview) throw notFound('Booking');

      // Lock order is always event -> booking -> payment, matching the booking flow.
      const event = await eventsRepository(trx).lockById(preview.event_id);
      const booking = await bookingsRepository(trx).lockById(preview.id);
      const payment = await paymentsRepository(trx).lockByOrderId(input.orderId);
      if (!event || !booking || !payment) throw notFound('Payment');

      if (payment.status === 'CAPTURED') return booking.id;
      if (input.amountPaise !== undefined && input.amountPaise !== payment.amount_paise) {
        log.error(
          { orderId: input.orderId, got: input.amountPaise, want: payment.amount_paise },
          'payment amount mismatch',
        );
        throw new AppError(400, 'PAYMENT_FAILED', 'Payment amount does not match the order');
      }
      await paymentsRepository(trx).markCaptured(payment.id, input.paymentId);
      if (booking.status === 'PAID') return booking.id;

      const now = clock();
      const holdLive =
        booking.status === 'PENDING' &&
        booking.hold_expires_at !== null &&
        booking.hold_expires_at > now;
      if (!holdLive) {
        // Paid after the hold lapsed: honour it only if seats are still free; otherwise flag a refund.
        const { sold, held } = await bookingsRepository(trx).occupancy(event.id, now);
        const canHonour =
          booking.status !== 'CANCELLED' &&
          event.status === 'PUBLISHED' &&
          seatsRemaining(event.capacity, sold, held) >= booking.quantity;
        if (!canHonour) {
          await bookingsRepository(trx).update(booking.id, { needs_refund: true });
          return booking.id;
        }
      }
      await fulfil(trx, event, booking);
      return booking.id;
    });
  }

  return { fulfil, settlePayment };
}

export type FulfilmentService = ReturnType<typeof createFulfilmentService>;
