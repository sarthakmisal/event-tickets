import { Router } from 'express';
import { z } from 'zod';
import { createStaffSchema } from '@et/shared';
import { idParam, parseBody } from '../../shared/http';
import { actorOf, requireRole } from '../auth/auth.middleware';
import type { StaffService } from './staff.service';

const setActiveSchema = z.object({ active: z.boolean() });

export function createStaffRouter(service: StaffService) {
  const router = Router();
  router.use(requireRole('OWNER', 'ORGANISER'));

  router.get('/', async (req, res) => {
    res.json({ staff: await service.list(actorOf(req)) });
  });

  router.post('/', async (req, res) => {
    const staff = await service.create(actorOf(req), parseBody(createStaffSchema, req.body));
    res.status(201).json({ staff });
  });

  router.patch('/:id', async (req, res) => {
    const { active } = parseBody(setActiveSchema, req.body);
    res.json({ staff: await service.setActive(actorOf(req), idParam(req), active) });
  });

  return router;
}
