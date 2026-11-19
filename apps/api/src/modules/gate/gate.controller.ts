import { Router } from 'express';
import { scanSchema } from '@et/shared';
import { idParam, parseBody } from '../../shared/http';
import { actorOf } from '../auth/auth.middleware';
import type { GateService } from './gate.service';

/** Open to every signed-in role; scoping is applied inside the service. */
export function createGateRouter(service: GateService) {
  const router = Router();

  router.get('/events', async (req, res) => {
    res.json({ events: await service.events(actorOf(req)) });
  });

  router.post('/scan', async (req, res) => {
    res.json({ result: await service.scan(actorOf(req), parseBody(scanSchema, req.body)) });
  });

  router.get('/events/:id/scans', async (req, res) => {
    res.json({ scans: await service.recent(actorOf(req), idParam(req)) });
  });

  return router;
}
