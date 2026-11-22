import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import type { Express } from 'express';
import type { Env } from './config/env';
import type { Db } from './db/schema';
import { createMockGateway } from './integrations/payments/mock.gateway';
import { createRazorpayGateway } from './integrations/payments/razorpay.gateway';
import type { PaymentGateway } from './integrations/payments/gateway';
import { createWhatsAppProvider } from './integrations/whatsapp';
import { createBaileysSocket } from './integrations/whatsapp/qr/baileys-socket';
import { createAuthStore } from './integrations/whatsapp/qr/auth-store';
import { createQrWhatsApp } from './integrations/whatsapp/qr/manager';
import type { QrWhatsApp } from './integrations/whatsapp/qr/manager';
import type { SocketFactory } from './integrations/whatsapp/qr/types';
import { createWhatsAppRouter } from './modules/whatsapp/whatsapp.controller';
import { createWhatsAppService } from './modules/whatsapp/whatsapp.service';
import type { WhatsAppProvider } from './integrations/whatsapp/provider';
import type { Job } from './jobs/scheduler';
import { createAuthRouter } from './modules/auth/auth.controller';
import { authenticate } from './modules/auth/auth.middleware';
import { createAuthService } from './modules/auth/auth.service';
import { createBookingsRouter } from './modules/bookings/bookings.controller';
import { createBookingsService } from './modules/bookings/bookings.service';
import { createFulfilmentService } from './modules/bookings/fulfilment.service';
import { createDashboardRouter } from './modules/dashboard/dashboard.controller';
import { createDashboardService } from './modules/dashboard/dashboard.service';
import { createEventsRouter } from './modules/events/events.controller';
import { createEventsService } from './modules/events/events.service';
import { createGateRouter } from './modules/gate/gate.controller';
import { createGateService } from './modules/gate/gate.service';
import { createMessagesRouter } from './modules/messaging/messages.controller';
import { createMessagingService } from './modules/messaging/messaging.service';
import { createOrganisersRouter } from './modules/organisers/organisers.controller';
import { createOrganisersService } from './modules/organisers/organisers.service';
import { createWebhooksRouter } from './modules/payments/webhooks.controller';
import { createPublicRouter } from './modules/public/public.controller';
import { createTicketsService } from './modules/tickets/tickets.service';
import { createStaffRouter } from './modules/users/staff.controller';
import { createStaffService } from './modules/users/staff.service';
import { usersRepository } from './modules/users/users.repository';
import type { Clock } from './shared/clock';
import { systemClock } from './shared/clock';
import { createErrorHandler, notFoundHandler, requireCsrfHeader } from './shared/http';
import { serveWeb } from './shared/web';
import type { Logger } from './shared/logger';

export interface AppDeps {
  env: Env;
  db: Db;
  log: Logger;
  clock?: Clock;
  /** Test seams: override the real integrations. */
  gateway?: PaymentGateway;
  whatsapp?: WhatsAppProvider;
  /** Test seam for WHATSAPP_PROVIDER=qr: replaces the real Baileys connection. */
  whatsappSocket?: SocketFactory;
  /** Built React panel (apps/web/dist). When set, the API serves it too: one process, one URL. */
  webDist?: string;
}

export interface BuiltApp {
  app: Express;
  /** Background work (hold expiry, WhatsApp outbox). Started by main.ts, driven directly in tests. */
  jobs: Job[];
  /** Linked-number manager when WHATSAPP_PROVIDER=qr (main.ts resumes saved sessions and stops them). */
  whatsappQr: QrWhatsApp | null;
}

/** Composition root: wires repositories -> services -> controllers. No business logic here. */
export function buildApp({
  env,
  db,
  log,
  clock = systemClock,
  webDist,
  ...overrides
}: AppDeps): BuiltApp {
  const isProd = env.NODE_ENV === 'production';
  const mock = createMockGateway(env.APP_SECRET);
  const gateway =
    overrides.gateway ??
    (env.PAYMENT_PROVIDER === 'razorpay'
      ? createRazorpayGateway({
          keyId: env.RAZORPAY_KEY_ID ?? '',
          keySecret: env.RAZORPAY_KEY_SECRET ?? '',
          webhookSecret: env.RAZORPAY_WEBHOOK_SECRET ?? '',
        })
      : mock);
  const whatsappQr =
    env.WHATSAPP_PROVIDER === 'qr' && !overrides.whatsapp
      ? createQrWhatsApp({
          store: createAuthStore(db),
          createSocket: overrides.whatsappSocket ?? createBaileysSocket,
          log,
          minGapMs: env.WHATSAPP_MIN_GAP_SECONDS * 1000,
          dailyLimit: env.WHATSAPP_DAILY_LIMIT,
        })
      : null;
  const whatsapp = overrides.whatsapp ?? whatsappQr?.provider ?? createWhatsAppProvider(env, log);

  const auth = createAuthService(usersRepository(db), {
    secret: env.APP_SECRET,
    bcryptCost: env.BCRYPT_COST,
  });
  const fulfilment = createFulfilmentService(db, clock, env.PUBLIC_WEB_URL, log);
  const bookings = createBookingsService(db, gateway, fulfilment, clock);
  const events = createEventsService(db, clock);
  const messaging = createMessagingService(db, whatsapp, clock, log);
  const limitRequests = env.NODE_ENV !== 'test';

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          // Razorpay Checkout loads a script, an iframe and a few beacons from its own domains.
          'script-src': ["'self'", 'https://checkout.razorpay.com'],
          'frame-src': ['https://api.razorpay.com', 'https://checkout.razorpay.com'],
          'connect-src': ["'self'", 'https://api.razorpay.com', 'https://lumberjack.razorpay.com'],
          'img-src': ["'self'", 'data:', 'https://*.razorpay.com'],
          'form-action': ["'self'", 'https://api.razorpay.com'],
          // Only force https when the public site is https (it breaks plain-http localhost).
          'upgrade-insecure-requests': env.PUBLIC_WEB_URL.startsWith('https:') ? [] : null,
        },
      },
    }),
  );
  app.get('/healthz', (_req, res) => res.json({ ok: true }));

  // Webhooks first: they need the raw body and carry their own signature auth (no CSRF header).
  app.use('/api/webhooks', createWebhooksRouter(gateway, fulfilment));

  app.use('/api', express.json({ limit: '100kb' }), cookieParser(), requireCsrfHeader);
  app.use(
    '/api/auth',
    createAuthRouter(auth, { secureCookie: isProd, limitLogins: limitRequests }),
  );
  app.use(
    '/api/public',
    createPublicRouter({
      events,
      bookings,
      tickets: createTicketsService(db),
      mockPay: gateway.name === 'mock' && !isProd ? mock.simulatePayment : undefined,
      limitRequests,
    }),
  );

  const protectedApi = express.Router();
  protectedApi.use(authenticate(auth));
  protectedApi.use('/dashboard', createDashboardRouter(createDashboardService(db, clock)));
  protectedApi.use('/organisers', createOrganisersRouter(createOrganisersService(db, auth)));
  protectedApi.use('/events', createEventsRouter(events));
  protectedApi.use('/bookings', createBookingsRouter(bookings));
  protectedApi.use('/staff', createStaffRouter(createStaffService(usersRepository(db), auth)));
  protectedApi.use('/messages', createMessagesRouter(messaging));
  protectedApi.use('/whatsapp', createWhatsAppRouter(createWhatsAppService(whatsappQr)));
  protectedApi.use('/gate', createGateRouter(createGateService(db, clock)));
  app.use('/api', protectedApi);

  if (webDist) serveWeb(app, webDist);
  app.use(notFoundHandler);
  app.use(createErrorHandler(log));

  const jobs: Job[] = [
    { name: 'expire-holds', everyMs: 60_000, run: () => bookings.expireStaleHolds() },
    { name: 'whatsapp-outbox', everyMs: 10_000, run: () => messaging.processDue() },
  ];
  return { app, jobs, whatsappQr };
}
