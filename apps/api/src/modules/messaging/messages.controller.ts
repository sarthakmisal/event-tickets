import { Router } from 'express';
import { idParam } from '../../shared/http';
import { actorOf, requireRole } from '../auth/auth.middleware';
import type { MessagingService } from './messaging.service';

export function createMessagesRouter(service: MessagingService) {
  const router = Router();
  router.use(requireRole('OWNER', 'ORGANISER'));

  router.get('/', async (req, res) => {
    res.json({ messages: await service.list(actorOf(req)) });
  });

  router.post('/:id/resend', async (req, res) => {
    res.json({ message: await service.resend(actorOf(req), idParam(req)) });
  });

  return router;
}
