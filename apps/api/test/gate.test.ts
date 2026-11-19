import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

let ctx: TestCtx;
let organiser: Client;
let gate: Client;
let anon: Client;

beforeAll(async () => {
  ctx = await setup();
  organiser = await client(ctx.app).login(ORGANISER);
  gate = await client(ctx.app).login(GATE);
  anon = client(ctx.app);
});
afterAll(() => ctx.close());

async function paidTickets(quantity: number, eventId?: string) {
  const id = eventId ?? (await publishEvent(organiser, { capacity: 20 }));
  const created = (await anon.post(`/api/public/events/${id}/bookings`, booking(quantity))).body;
  const paid = (await payAndConfirm(anon, created)).body.booking;
  return { eventId: id, codes: paid.tickets.map((t: { code: string }) => t.code) as string[] };
}

const scan = (who: Client, code: string, mode: 'ENTRY' | 'EXIT', eventId?: string) =>
  who.post('/api/gate/scan', { code, mode, eventId }).then((r) => r.body.result);

describe('gate check-in / check-out', () => {
  it('runs the full entry → exit → re-entry cycle and tracks headcount', async () => {
    const { eventId, codes } = await paidTickets(2);
    const [a, b] = codes as [string, string];

    expect(await scan(gate, a, 'ENTRY', eventId)).toMatchObject({ ok: true, inside: 1 });
    expect(await scan(gate, b, 'ENTRY', eventId)).toMatchObject({ ok: true, inside: 2 });
    expect(await scan(gate, a, 'ENTRY', eventId)).toMatchObject({
      ok: false,
      reason: 'ALREADY_INSIDE',
    });
    expect(await scan(gate, a, 'EXIT', eventId)).toMatchObject({ ok: true, inside: 1 });
    expect(await scan(gate, a, 'EXIT', eventId)).toMatchObject({
      ok: false,
      reason: 'ALREADY_EXITED',
    });
    expect(await scan(gate, a, 'ENTRY', eventId)).toMatchObject({ ok: true, inside: 2 }); // re-entry
    expect((await organiser.get(`/api/events/${eventId}`)).body.event.inside).toBe(2);
  });

  it('rejects exit for a ticket that never entered', async () => {
    const { codes } = await paidTickets(1);
    expect(await scan(gate, codes[0]!, 'EXIT')).toMatchObject({
      ok: false,
      reason: 'NEVER_ENTERED',
    });
  });

  it('accepts the QR link or a lowercase code, and rejects unknown codes', async () => {
    const { codes } = await paidTickets(2);
    expect(
      await scan(gate, `https://tickets.example/t/${codes[0]!.toLowerCase()}`, 'ENTRY'),
    ).toMatchObject({ ok: true });
    expect(await scan(gate, '0000000000', 'ENTRY')).toMatchObject({
      ok: false,
      reason: 'NOT_FOUND',
    });
    expect(await scan(gate, 'garbage', 'ENTRY')).toMatchObject({ ok: false, reason: 'NOT_FOUND' });
  });

  it('refuses a ticket at the wrong event', async () => {
    const { codes } = await paidTickets(1);
    const other = await publishEvent(organiser);
    expect(await scan(gate, codes[0]!, 'ENTRY', other)).toMatchObject({
      ok: false,
      reason: 'WRONG_EVENT',
    });
    expect(await scan(gate, codes[0]!, 'ENTRY')).toMatchObject({ ok: true });
  });

  it('lets only one of many simultaneous scans of a ticket through', async () => {
    const { codes } = await paidTickets(1);
    const results = await Promise.all(
      Array.from({ length: 8 }, () => scan(gate, codes[0]!, 'ENTRY')),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => r.reason === 'ALREADY_INSIDE')).toHaveLength(7);
  });

  it('blocks entry once the event is cancelled', async () => {
    const { eventId, codes } = await paidTickets(1);
    await organiser.patch(`/api/events/${eventId}`, { status: 'CANCELLED' });
    expect(await scan(gate, codes[0]!, 'ENTRY')).toMatchObject({
      ok: false,
      reason: 'EVENT_NOT_ACTIVE',
    });
  });

  it('hides another organiser’s tickets from gate staff', async () => {
    const owner = await client(ctx.app).login(OWNER);
    await owner.post('/api/organisers', {
      name: 'Rival',
      phone: '9222222222',
      email: 'r@example.com',
      password: 'Passw0rd!!',
      commissionBps: 500,
    });
    const rival = await client(ctx.app).login('9222222222');
    const rivalEvent = await publishEvent(rival, { capacity: 5 });
    const { codes } = await paidTickets(1, rivalEvent);
    expect(await scan(gate, codes[0]!, 'ENTRY')).toMatchObject({ ok: false, reason: 'NOT_FOUND' });
    expect(await scan(owner, codes[0]!, 'ENTRY')).toMatchObject({ ok: true }); // owner can scan anything
    expect(
      ((await gate.get('/api/gate/events')).body.events as { id: string }[]).some(
        (e) => e.id === rivalEvent,
      ),
    ).toBe(false);
  });

  it('audits every scan, including rejected ones', async () => {
    const { eventId, codes } = await paidTickets(1);
    await scan(gate, codes[0]!, 'ENTRY', eventId);
    await scan(gate, codes[0]!, 'ENTRY', eventId);
    const logs = (await gate.get(`/api/gate/events/${eventId}/scans`)).body.scans as {
      ok: boolean;
      reason: string | null;
      scannedBy: string;
    }[];
    expect(logs.map((l) => l.ok)).toEqual([false, true]);
    expect(logs[0]).toMatchObject({ reason: 'ALREADY_INSIDE', scannedBy: 'Gate Staff' });
  });
});

describe('staff management', () => {
  it('organiser adds gate staff who can scan; staff can be disabled', async () => {
    const created = await organiser.post('/api/staff', {
      name: 'Door Two',
      phone: '9333333333',
      password: 'Passw0rd!!',
    });
    expect(created.status).toBe(201);
    const door = await client(ctx.app).login('9333333333');
    expect((await door.get('/api/gate/events')).status).toBe(200);
    await organiser.patch(`/api/staff/${created.body.staff.id}`, { active: false });
    expect((await door.get('/api/gate/events')).status).toBe(401);
  });
});

describe('messaging outbox', () => {
  it('retries failed sends with backoff, then delivers; manual resend works', async () => {
    await ctx.jobs['whatsapp-outbox']!.run(); // drain messages left by earlier tests
    const { eventId } = await paidTickets(1);
    ctx.failSends(1);
    const before = ctx.sent.length;
    await ctx.jobs['whatsapp-outbox']!.run();
    const failed = (await organiser.get('/api/messages')).body.messages.find(
      (m: { attempts: number }) => m.attempts === 1,
    );
    expect(failed).toMatchObject({ status: 'QUEUED', lastError: 'provider down' });
    expect(ctx.sent.length).toBe(before);

    await ctx.jobs['whatsapp-outbox']!.run(); // backoff not elapsed → nothing happens
    expect(ctx.sent.length).toBe(before);
    ctx.advance(3 * 60_000);
    await ctx.jobs['whatsapp-outbox']!.run();
    expect(ctx.sent.length).toBe(before + 1);

    const resent = await organiser.post(`/api/messages/${failed.id}/resend`);
    expect(resent.body.message.status).toBe('QUEUED');
    expect(eventId).toBeTruthy();
  });

  it('gives up after repeated failures and flags the message', async () => {
    await paidTickets(1);
    ctx.failSends(100);
    for (let i = 0; i < 6; i += 1) {
      await ctx.jobs['whatsapp-outbox']!.run();
      ctx.advance(40 * 60_000);
    }
    ctx.failSends(0);
    const messages = (await organiser.get('/api/messages')).body.messages as {
      status: string;
      attempts: number;
    }[];
    expect(messages.some((m) => m.status === 'FAILED' && m.attempts === 5)).toBe(true);
  });
});
