import { Router } from 'express';
import { phoneSchema } from '@et/shared';
import { z } from 'zod';
import { parseBody } from '../../shared/http';
import { actorOf, requireRole } from '../auth/auth.middleware';
import type { WhatsAppService } from './whatsapp.service';

const testSchema = z.object({ phone: phoneSchema });

export function createWhatsAppRouter(service: WhatsAppService) {
  const router = Router();
  router.use(requireRole('OWNER', 'ORGANISER'));

  router.get('/', (req, res) => {
    res.json({ whatsapp: service.status(actorOf(req)) });
  });

  router.post('/connect', async (req, res) => {
    res.json({ whatsapp: await service.connect(actorOf(req)) });
  });

  router.post('/disconnect', async (req, res) => {
    res.json({ whatsapp: await service.disconnect(actorOf(req)) });
  });

  router.post('/test', async (req, res) => {
    const { phone } = parseBody(testSchema, req.body);
    await service.sendTest(actorOf(req), phone);
    res.json({ ok: true });
  });

  return router;
}
