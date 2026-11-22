import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BufferJSON } from '@whiskeysockets/baileys';
import { createAuthStore } from '../src/integrations/whatsapp/qr/auth-store';
import { fakeSocketFactory, tick } from './fake-whatsapp';
import {
  booking,
  client,
  GATE,
  ORGANISER,
  OWNER,
  payAndConfirm,
  publishEvent,
  setup,
} from './helpers';
import type { Client, TestCtx } from './helpers';

const { factory, sockets } = fakeSocketFactory();
let ctx: TestCtx;
let owner: Client;
let organiser: Client;
let gate: Client;
let anon: Client;

beforeAll(async () => {
  ctx = await setup(
    { whatsapp: undefined, whatsappSocket: factory },
    { WHATSAPP_PROVIDER: 'qr', WHATSAPP_MIN_GAP_SECONDS: '0' },
  );
  owner = await client(ctx.app).login(OWNER);
  organiser = await client(ctx.app).login(ORGANISER);
  gate = await client(ctx.app).login(GATE);
  anon = client(ctx.app);
});
afterAll(async () => {
  ctx.whatsappQr?.stopAll();
  await ctx.close();
});

const status = async (who: Client) => (await who.get('/api/whatsapp')).body.whatsapp;

/** A paid booking, then the outbox runs once. Returns the booking's message. */
async function bookAndDeliver(eventId: string) {
  const created = (await anon.post(`/api/public/events/${eventId}/bookings`, booking(1))).body;
  await payAndConfirm(anon, created);
  await ctx.jobs['whatsapp-outbox']!.run();
  const messages = (await organiser.get('/api/messages')).body.messages as {
    bookingId: string;
    status: string;
    attempts: number;
    lastError: string | null;
  }[];
  return messages.find((m) => m.bookingId === created.booking.id)!;
}

describe('linking a number by QR', () => {
  it('shows the platform number state to the owner and is closed to gate staff', async () => {
    expect(await status(owner)).toMatchObject({
      supported: true,
      scope: 'PLATFORM',
      state: 'DISCONNECTED',
      qr: null,
    });
    expect((await gate.get('/api/whatsapp')).status).toBe(403);
    expect((await anon.get('/api/whatsapp')).status).toBe(401);
  });

  it('connect -> QR -> scanned -> connected, then test message goes out', async () => {
    const connecting = (await owner.post('/api/whatsapp/connect')).body.whatsapp;
    expect(connecting.state).toBe('CONNECTING');
    expect(sockets).toHaveLength(1);

    sockets[0]!.emit({ qr: 'QR-STRING-1' });
    expect(await status(owner)).toMatchObject({ state: 'QR', qr: 'QR-STRING-1' });

    // WhatsApp closes the socket with "restart required" right after a successful scan.
    sockets[0]!.emit({ connection: 'close', closeCode: 515 });
    await tick();
    expect(sockets).toHaveLength(2);
    sockets[0]!.emit({ connection: 'open', userPhone: '911111111111' }); // stale socket is ignored
    expect((await status(owner)).state).toBe('CONNECTING');

    sockets[1]!.emit({ connection: 'open', userPhone: '919876543210' });
    expect(await status(owner)).toMatchObject({
      state: 'CONNECTED',
      phone: '919876543210',
      qr: null,
    });

    const test = await owner.post('/api/whatsapp/test', { phone: '9822222222' });
    expect(test.status).toBe(200);
    expect(sockets[1]!.sent[0]).toMatchObject({ jid: '9822222222@s.whatsapp.net' });
    expect(sockets[1]!.sent[0]!.text).toContain('Test message');

    expect((await owner.post('/api/whatsapp/test', { phone: '123' })).status).toBe(400);
    sockets[1]!.onWhatsApp = false;
    const missing = await owner.post('/api/whatsapp/test', { phone: '9822222222' });
    expect(missing.status).toBe(400);
    expect(missing.body.error.message).toContain('not on WhatsApp');
    sockets[1]!.onWhatsApp = true;
  });

  it('refuses a test while not connected', async () => {
    const res = await organiser.post('/api/whatsapp/test', { phone: '9822222222' });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('Connect your WhatsApp number first');
  });
});

describe('who sends a booking confirmation', () => {
  let eventId: string;
  beforeAll(async () => {
    eventId = await publishEvent(organiser, { capacity: 30 });
  });

  it('uses the platform number until the organiser links their own', async () => {
    expect(await status(organiser)).toMatchObject({
      scope: 'ORGANISER',
      state: 'DISCONNECTED',
      fallbackConnected: true,
    });
    const before = sockets[1]!.sent.length;
    const message = await bookAndDeliver(eventId);
    expect(message.status).toBe('SENT');
    expect(sockets[1]!.sent.length).toBe(before + 1);
    expect(sockets[1]!.sent.at(-1)!.text).toContain('is confirmed');
  });

  it("uses the organiser's own number once linked", async () => {
    await organiser.post('/api/whatsapp/connect');
    const own = sockets.at(-1)!;
    own.emit({ connection: 'open', userPhone: '919000000001' });
    expect((await status(organiser)).state).toBe('CONNECTED');

    const platformBefore = sockets[1]!.sent.length;
    const message = await bookAndDeliver(eventId);
    expect(message.status).toBe('SENT');
    expect(own.sent).toHaveLength(1);
    expect(sockets[1]!.sent.length).toBe(platformBefore);
  });

  it('keeps messages queued (no attempts burned) while no number is connected, then delivers', async () => {
    await organiser.post('/api/whatsapp/disconnect');
    await owner.post('/api/whatsapp/disconnect');
    expect((await status(owner)).state).toBe('DISCONNECTED');

    const queued = await bookAndDeliver(eventId);
    expect(queued).toMatchObject({
      status: 'QUEUED',
      attempts: 0,
      lastError: 'WhatsApp number is not connected',
    });

    await owner.post('/api/whatsapp/connect');
    sockets.at(-1)!.emit({ connection: 'open', userPhone: '919876543210' });
    ctx.advance(61_000);
    await ctx.jobs['whatsapp-outbox']!.run();
    const messages = (await organiser.get('/api/messages')).body.messages as {
      status: string;
    }[];
    expect(messages.every((m) => m.status === 'SENT')).toBe(true);
  });
});

describe('session lifecycle', () => {
  it('disconnect unlinks the device and forgets the session', async () => {
    const live = sockets.at(-1)!;
    await owner.post('/api/whatsapp/disconnect');
    expect(live.loggedOut).toBe(true);
    expect(live.closed).toBe(true);
    const rows = await ctx.db.selectFrom('whatsapp_sessions').selectAll().execute();
    expect(rows).toHaveLength(0);
  });

  it('resumes linked numbers after a restart without a new QR', async () => {
    await owner.post('/api/whatsapp/connect');
    sockets.at(-1)!.emit({ connection: 'open', userPhone: '919876543210' });
    await tick(50); // markRegistered write
    ctx.whatsappQr!.stopAll();
    expect((await status(owner)).state).toBe('DISCONNECTED');

    const count = sockets.length;
    await ctx.whatsappQr!.startSaved();
    expect(sockets).toHaveLength(count + 1);
    sockets.at(-1)!.emit({ connection: 'open', userPhone: '919876543210' });
    expect((await status(owner)).state).toBe('CONNECTED');
  });

  it('logging out from the phone clears the session and does not reconnect', async () => {
    const count = sockets.length;
    sockets.at(-1)!.emit({ connection: 'close', closeCode: 401 });
    await tick(50);
    expect((await status(owner)).state).toBe('DISCONNECTED');
    expect(sockets).toHaveLength(count);
    expect(await ctx.db.selectFrom('whatsapp_sessions').selectAll().execute()).toHaveLength(0);
  });

  it('gives up when a QR is never scanned', async () => {
    await owner.post('/api/whatsapp/connect');
    const count = sockets.length;
    sockets.at(-1)!.emit({ qr: 'QR-2' });
    sockets.at(-1)!.emit({ connection: 'close', closeCode: 408 });
    await tick(50);
    expect((await status(owner)).state).toBe('DISCONNECTED');
    expect(sockets).toHaveLength(count);
  });
});

describe('auth store', () => {
  it('round-trips signal keys including binary buffers, and cascades on clear', async () => {
    const store = createAuthStore(ctx.db);
    const auth = await store.load('probe');
    const key = { private: Buffer.from([1, 2, 3]), public: Buffer.from([4, 5, 6]) };
    await auth.state.keys.set({ 'pre-key': { '7': key } });
    const read = await auth.state.keys.get('pre-key', ['7', '8']);
    expect(Buffer.from(read['7']!.private)).toEqual(key.private);
    expect(read['8']).toBeUndefined();

    await auth.state.keys.set({ 'pre-key': { '7': null } });
    expect((await auth.state.keys.get('pre-key', ['7']))['7']).toBeUndefined();

    await auth.state.keys.set({ 'pre-key': { '9': key } });
    await store.clear('probe');
    const left = await ctx.db.selectFrom('whatsapp_auth_keys').selectAll().execute();
    expect(left.filter((r) => r.owner_key === 'probe')).toHaveLength(0);
    expect(typeof BufferJSON.replacer).toBe('function');
  });
});
