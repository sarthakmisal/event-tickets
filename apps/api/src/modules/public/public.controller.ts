import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { confirmPaymentSchema, createBookingSchema } from '@et/shared';
import { idParam, parseBody } from '../../shared/http';
import type { BookingsService } from '../bookings/bookings.service';
import type { EventsService } from '../events/events.service';
import type { TicketsService } from '../tickets/tickets.service';

const tokenQuery = z.object({ t: z.string().min(10).max(100) });

interface PublicDeps {
  events: EventsService;
  bookings: BookingsService;
  tickets: TicketsService;
  /** Present only with the mock payment provider, for the development checkout. */
  mockPay?: (orderId: string) => {
    providerOrderId: string;
    providerPaymentId: string;
    signature: string;
  };
  limitRequests: boolean;
}

/** Customer-facing endpoints: no login, protected by unguessable booking/ticket tokens. */
export function createPublicRouter({
  events,
  bookings,
  tickets,
  mockPay,
  limitRequests,
}: PublicDeps) {
  const router = Router();

  const bookingLimiter = rateLimit({
    windowMs: 60_000,
    limit: limitRequests ? 20 : 1_000_000,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down' } },
  });

  router.get('/events', async (_req, res) => {
    res.json({ events: await events.listPublic() });
  });

  router.get('/events/:id', async (req, res) => {
    res.json({ event: await events.getPublic(idParam(req)) });
  });

  router.post('/events/:id/bookings', bookingLimiter, async (req, res) => {
    const created = await bookings.create(idParam(req), parseBody(createBookingSchema, req.body));
    res.status(201).json(created);
  });

  router.get('/bookings/:id', async (req, res) => {
    const { t } = parseBody(tokenQuery, req.query);
    res.json(await bookings.getPublic(idParam(req), t));
  });

  router.post('/bookings/:id/confirm', bookingLimiter, async (req, res) => {
    const { t } = parseBody(tokenQuery, req.query);
    res.json(await bookings.confirm(idParam(req), t, parseBody(confirmPaymentSchema, req.body)));
  });

  router.get('/tickets/:code', async (req, res) => {
    res.json(await tickets.view(String(req.params.code)));
  });

  if (mockPay) {
    router.post('/dev/mock-pay', (req, res) => {
      const { orderId } = parseBody(
        z.object({ orderId: z.string().startsWith('order_mock_') }),
        req.body,
      );
      res.json(mockPay(orderId));
    });
  }

  return router;
}
