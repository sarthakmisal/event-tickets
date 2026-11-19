import { Router } from 'express';
import { actorOf, requireRole } from '../auth/auth.middleware';
import type { DashboardService } from './dashboard.service';

export function createDashboardRouter(service: DashboardService) {
  const router = Router();
  router.get('/', requireRole('OWNER', 'ORGANISER'), async (req, res) => {
    res.json({ dashboard: await service.summary(actorOf(req)) });
  });
  return router;
}
