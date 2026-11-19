import { bookingTotal, holdExpiresAt, isEventOpen, seatsRemaining } from '@et/shared';
import type {
  BookingDto,
  ConfirmPaymentInput,
  CreateBookingInput,
  CreatedBookingDto,
  PaymentIntentDto,
  PublicBookingDto,
} from '@et/shared';
import type { Db } from '../../db/schema';
import type { PaymentGateway } from '../../integrations/payments/gateway';
import type { Clock } from '../../shared/clock';
import { randomToken, safeEqual } from '../../shared/crypto';
import { AppError, badRequest, notFound } from '../../shared/errors';
import type { Actor } from '../auth/actor';
import { organiserScope } from '../auth/actor';
import { toPublicEventDto } from '../events/event.mapper';
import { eventsRepository } from '../events/events.repository';
import { paymentsRepository } from '../payments/payments.repository';
import { ticketsRepository } from '../tickets/tickets.repository';
import { toBookingDto } from './booking.mapper';
import { bookingsRepository } from './bookings.repository';
import type { BookingWithEvent } from './bookings.repository';
import type { FulfilmentService } from './fulfilment.service';

export function createBookingsService(
  db: Db,
  gateway: PaymentGateway,
  fulfilment: FulfilmentService,
  clock: Clock,
) {
  async function withTickets(booking: BookingWithEvent): Promise<BookingDto> {
    const tickets = await ticketsRepository(db).listByBookingIds([booking.id]);
    return toBookingDto(booking, tickets);
  }

  async function loadWithToken(id: string, token: string): Promise<BookingWithEvent> {
    const booking = await bookingsRepository(db).findById(id);
    if (!booking || !safeEqual(booking.access_token, token)) throw notFound('Booking');
    return booking;
  }

  async function publicView(booking: BookingWithEvent): Promise<PublicBookingDto> {
    const event = await eventsRepository(db).findWithCounts(booking.event_id, clock());
    if (!event) throw notFound('Event');
    return { booking: await withTickets(booking), event: toPublicEventDto(event, clock()) };
  }

  return {
    /** Reserves seats (row-locked, so concurrent buyers can't oversell) and opens a payment order. */
    async create(eventId: string, input: CreateBookingInput): Promise<CreatedBookingDto> {
      const now = clock();
      const accessToken = randomToken();

      const { booking, amountPaise } = await db.transaction().execute(async (trx) => {
        const event = await eventsRepository(trx).lockById(eventId);
        if (!event || !isEventOpen(event.status, event.starts_at, event.ends_at, now)) {
          throw notFound('Event');
        }
        const { sold, held } = await bookingsRepository(trx).occupancy(event.id, now);
        const remaining = seatsRemaining(event.capacity, sold, held);
        if (input.quantity > remaining) {
          throw new AppError(
            409,
            'SOLD_OUT',
            remaining === 0 ? 'Sold out' : `Only ${remaining} ticket(s) left`,
            'quantity',
          );
        }
        const amount = bookingTotal(event.price_paise, input.quantity);
        const row = await bookingsRepository(trx).insert({
          event_id: event.id,
          customer_name: input.customerName,
          customer_phone: input.customerPhone,
          quantity: input.quantity,
          attendee_names: JSON.stringify(input.attendeeNames),
          amount_paise: amount,
          status: amount === 0 ? 'PAID' : 'PENDING',
          hold_expires_at: amount === 0 ? null : holdExpiresAt(now),
          access_token: accessToken,
        });
        if (amount === 0) await fulfilment.fulfil(trx, event, row);
        return { booking: row, amountPaise: amount };
      });

      const full = await bookingsRepository(db).findById(booking.id);
      if (!full) throw notFound('Booking');
      if (amountPaise === 0) {
        return { booking: await withTickets(full), payment: null, accessToken };
      }

      // The gateway call happens outside the transaction so the event lock is never held on the network.
      let payment: PaymentIntentDto;
      try {
        const { orderId } = await gateway.createOrder({ amountPaise, receipt: booking.id });
        await paymentsRepository(db).insert({
          booking_id: booking.id,
          provider: gateway.name,
          provider_order_id: orderId,
          amount_paise: amountPaise,
        });
        payment = { provider: gateway.name, orderId, amountPaise, keyId: gateway.publicKeyId };
      } catch (err) {
        await bookingsRepository(db).update(booking.id, {
          status: 'CANCELLED',
          hold_expires_at: null,
        });
        throw err;
      }
      return { booking: await withTickets(full), payment, accessToken };
    },

    /** Browser-side confirmation after checkout. The webhook may also land; settle is idempotent. */
    async confirm(
      bookingId: string,
      token: string,
      input: ConfirmPaymentInput,
    ): Promise<PublicBookingDto> {
      const booking = await loadWithToken(bookingId, token);
      const payment = await paymentsRepository(db).findByOrderId(input.providerOrderId);
      if (!payment || payment.booking_id !== booking.id)
        throw badRequest('Order does not belong to this booking');
      const valid = gateway.verifyCheckout({
        orderId: input.providerOrderId,
        paymentId: input.providerPaymentId,
        signature: input.signature,
      });
      if (!valid) throw new AppError(400, 'PAYMENT_FAILED', 'Payment could not be verified');
      await fulfilment.settlePayment({
        orderId: input.providerOrderId,
        paymentId: input.providerPaymentId,
      });
      return this.getPublic(bookingId, token);
    },

    async getPublic(bookingId: string, token: string): Promise<PublicBookingDto> {
      return publicView(await loadWithToken(bookingId, token));
    },

    /** Bookings visible to the actor (owner: all; organiser: own events). */
    async list(actor: Actor, filter: { eventId?: string }): Promise<BookingDto[]> {
      const rows = await bookingsRepository(db).list({
        organiserId: organiserScope(actor),
        eventId: filter.eventId,
        limit: 200,
      });
      const tickets = await ticketsRepository(db).listByBookingIds(rows.map((b) => b.id));
      return rows.map((b) => toBookingDto(b, tickets));
    },

    async expireStaleHolds(): Promise<number> {
      return bookingsRepository(db).expireStaleHolds(clock());
    },
  };
}

export type BookingsService = ReturnType<typeof createBookingsService>;
