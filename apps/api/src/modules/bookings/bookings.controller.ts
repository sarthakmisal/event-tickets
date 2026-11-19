import { Router } from 'express';
import { z } from 'zod';
import { parseBody } from '../../shared/http';
import { actorOf, requireRole } from '../auth/auth.middleware';
import type { BookingsService } from './bookings.service';

const filterSchema = z.object({ eventId: z.string().uuid().optional() });

/** Panel view of bookings (owner: all, organiser: own events). Customer-facing routes are in /public. */
export function createBookingsRouter(service: BookingsService) {
  const router = Router();
  router.use(requireRole('OWNER', 'ORGANISER'));

  router.get('/', async (req, res) => {
    const filter = parseBody(filterSchema, req.query);
    res.json({ bookings: await service.list(actorOf(req), filter) });
  });

  return router;
}
