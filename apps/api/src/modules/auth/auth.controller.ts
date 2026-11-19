import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { changePasswordSchema, loginSchema } from '@et/shared';
import { parseBody } from '../../shared/http';
import { actorOf, authenticate, SESSION_COOKIE } from './auth.middleware';
import type { AuthService } from './auth.service';
import { SESSION_HOURS } from './auth.service';

export function createAuthRouter(
  auth: AuthService,
  opts: { secureCookie: boolean; limitLogins: boolean },
) {
  const router = Router();

  // Only failed attempts count, so legitimate users are never locked out by their own successes.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: opts.limitLogins ? 10 : 1_000_000,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } },
  });

  router.post('/login', loginLimiter, async (req, res) => {
    const { login, password } = parseBody(loginSchema, req.body);
    const { token, user } = await auth.login(login, password);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: opts.secureCookie,
      maxAge: SESSION_HOURS * 3_600_000,
      path: '/',
    });
    res.json({ user });
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  router.get('/me', authenticate(auth), async (req, res) => {
    res.json({ user: await auth.me(actorOf(req)) });
  });

  router.post('/password', authenticate(auth), async (req, res) => {
    const { currentPassword, newPassword } = parseBody(changePasswordSchema, req.body);
    await auth.changePassword(actorOf(req), currentPassword, newPassword);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  return router;
}
