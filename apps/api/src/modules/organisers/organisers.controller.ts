import { Router } from 'express';
import { createOrganiserSchema, updateOrganiserSchema } from '@et/shared';
import { idParam, parseBody } from '../../shared/http';
import { requireRole } from '../auth/auth.middleware';
import type { OrganisersService } from './organisers.service';

export function createOrganisersRouter(service: OrganisersService) {
  const router = Router();
  router.use(requireRole('OWNER'));

  router.get('/', async (_req, res) => {
    res.json({ organisers: await service.list() });
  });

  router.post('/', async (req, res) => {
    const organiser = await service.create(parseBody(createOrganiserSchema, req.body));
    res.status(201).json({ organiser });
  });

  router.patch('/:id', async (req, res) => {
    const organiser = await service.update(
      idParam(req),
      parseBody(updateOrganiserSchema, req.body),
    );
    res.json({ organiser });
  });

  return router;
}
