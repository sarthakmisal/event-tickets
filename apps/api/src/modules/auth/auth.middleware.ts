import type { Request, RequestHandler } from 'express';
import type { Role } from '@et/shared';
import { forbidden } from '../../shared/errors';
import type { Actor } from './actor';
import type { AuthService } from './auth.service';

export const SESSION_COOKIE = 'et_session';

const actors = new WeakMap<Request, Actor>();

/** The authenticated actor for this request; only valid behind `authenticate`. */
export function actorOf(req: Request): Actor {
  const actor = actors.get(req);
  if (!actor) throw new Error('actorOf() called on a route without authenticate middleware');
  return actor;
}

export const authenticate =
  (auth: AuthService): RequestHandler =>
  async (req, _res, next) => {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    actors.set(req, await auth.authenticate(cookies?.[SESSION_COOKIE]));
    next();
  };

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!roles.includes(actorOf(req).role)) throw forbidden();
    next();
  };
