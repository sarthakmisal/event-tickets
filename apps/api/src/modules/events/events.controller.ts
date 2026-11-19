import { Router } from 'express';
import { createEventSchema, updateEventSchema } from '@et/shared';
import { idParam, parseBody } from '../../shared/http';
import { actorOf, requireRole } from '../auth/auth.middleware';
import type { EventsService } from './events.service';

export function createEventsRouter(service: EventsService) {
  const router = Router();
  router.use(requireRole('OWNER', 'ORGANISER'));

  router.get('/', async (req, res) => {
    res.json({ events: await service.list(actorOf(req)) });
  });

  router.post('/', requireRole('ORGANISER'), async (req, res) => {
    const event = await service.create(actorOf(req), parseBody(createEventSchema, req.body));
    res.status(201).json({ event });
  });

  router.get('/:id', async (req, res) => {
    res.json({ event: await service.get(actorOf(req), idParam(req)) });
  });

  router.patch('/:id', async (req, res) => {
    const event = await service.update(
      actorOf(req),
      idParam(req),
      parseBody(updateEventSchema, req.body),
    );
    res.json({ event });
  });

  return router;
}
