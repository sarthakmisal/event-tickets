import { sql } from 'kysely';
import request from 'supertest';
import type { Express } from 'express';
import { buildApp } from '../src/app';
import type { AppDeps } from '../src/app';
import { loadEnv } from '../src/config/env';
import type { Env } from '../src/config/env';
import { createDb } from '../src/db/client';
import { migrateToLatest } from '../src/db/migrate';
import { seed } from '../src/db/seed';
import type { Db } from '../src/db/schema';
import type { Job } from '../src/jobs/scheduler';
import { createLogger } from '../src/shared/logger';

export const PASSWORD = 'Passw0rd!!';
export const OWNER = '7498605559';
export const ORGANISER = '9000000001';
export const GATE = '9000000002';

export interface TestCtx {
  app: Express;
  db: Db;
  env: Env;
  jobs: Record<string, Job>;
  /** Messages the fake WhatsApp provider delivered. */
  sent: { toPhone: string; body: string }[];
  /** Make the next N WhatsApp sends fail. */
  failSends: (n: number) => void;
  /** Move the app clock forward. */
  advance: (ms: number) => void;
  close: () => Promise<void>;
}

export const testEnv = (extra: Record<string, string> = {}): Env =>
  loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL:
      process.env.TEST_DATABASE_URL ?? 'postgres://evt:evt@localhost:5432/event_tickets_test',
    APP_SECRET: 'test-secret-test-secret-test-secret-123',
    BCRYPT_COST: '4',
    ...extra,
  });

/** Fresh schema + seed data + app wired to a fake clock and a fake WhatsApp provider. */
export async function setup(
  overrides: Partial<AppDeps> = {},
  envExtra: Record<string, string> = {},
): Promise<TestCtx> {
  const env = testEnv(envExtra);
  const db = createDb(env.DATABASE_URL);
  await sql`drop schema public cascade; create schema public;`.execute(db);
  await migrateToLatest(db);
  await seed(db, {
    password: PASSWORD,
    ownerName: 'Owner',
    ownerEmail: 'owner@example.com',
    bcryptCost: 4,
  });

  let offset = 0;
  let failures = 0;
  const sent: TestCtx['sent'] = [];
  const { app, jobs } = buildApp({
    env,
    db,
    log: createLogger('silent'),
    clock: () => new Date(Date.now() + offset),
    whatsapp: {
      name: 'fake',
      send: async (m) => {
        if (failures > 0) {
          failures -= 1;
          throw new Error('provider down');
        }
        sent.push(m);
      },
    },
    ...overrides,
  });
  return {
    app,
    db,
    env,
    jobs: Object.fromEntries(jobs.map((j) => [j.name, j])),
    sent,
    failSends: (n) => {
      failures = n;
    },
    advance: (ms) => {
      offset += ms;
    },
    close: () => db.destroy(),
  };
}

type Method = 'get' | 'post' | 'patch';

/** A cookie-carrying HTTP client that always sends the CSRF header. */
export function client(app: Express) {
  const agent = request.agent(app);
  const call = (method: Method, url: string, body?: object) => {
    const req = agent[method](url).set('X-Requested-With', 'fetch');
    return body ? req.send(body) : req;
  };
  return {
    get: (url: string) => call('get', url),
    post: (url: string, body: object = {}) => call('post', url, body),
    patch: (url: string, body: object = {}) => call('patch', url, body),
    async login(login: string, password = PASSWORD) {
      const res = await call('post', '/api/auth/login', { login, password });
      if (res.status !== 200) throw new Error(`login failed for ${login}: ${res.status}`);
      return this;
    },
  };
}

export type Client = ReturnType<typeof client>;

export const inDays = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString();

/** Organiser creates and publishes an event; returns its id. */
export async function publishEvent(
  organiser: Client,
  fields: { title?: string; pricePaise?: number; capacity?: number } = {},
): Promise<string> {
  const created = await organiser.post('/api/events', {
    title: fields.title ?? 'Test Event',
    venue: 'Test Venue',
    startsAt: inDays(3),
    pricePaise: fields.pricePaise ?? 50_000,
    capacity: fields.capacity ?? 10,
  });
  if (created.status !== 201)
    throw new Error(`create event failed: ${JSON.stringify(created.body)}`);
  const id = created.body.event.id as string;
  const published = await organiser.patch(`/api/events/${id}`, { status: 'PUBLISHED' });
  if (published.status !== 200)
    throw new Error(`publish failed: ${JSON.stringify(published.body)}`);
  return id;
}

export const booking = (quantity = 1, extra: object = {}) => ({
  customerName: 'Test Customer',
  customerPhone: '9876500000',
  quantity,
  ...extra,
});

/** Runs the mock checkout for a freshly created booking and confirms it, like the browser does. */
export async function payAndConfirm(
  anon: Client,
  created: { booking: { id: string }; payment: { orderId: string }; accessToken: string },
) {
  const pay = await anon.post('/api/public/dev/mock-pay', { orderId: created.payment.orderId });
  return anon.post(
    `/api/public/bookings/${created.booking.id}/confirm?t=${created.accessToken}`,
    pay.body,
  );
}
