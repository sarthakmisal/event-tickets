import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { sql } from 'kysely';
import request from 'supertest';
import { createRazorpayGateway } from '../src/integrations/payments/razorpay.gateway';
import {
  booking,
  client,
  inDays,
  ORGANISER,
  OWNER,
  payAndConfirm,
  publishEvent,
  setup,
} from './helpers';
import type { Client, TestCtx } from './helpers';

let ctx: TestCtx;
let owner: Client;
let organiser: Client;
let anon: Client;

beforeAll(async () => {
  ctx = await setup();
  owner = await client(ctx.app).login(OWNER);
  organiser = await client(ctx.app).login(ORGANISER);
  anon = client(ctx.app);
});
afterAll(() => ctx.close());

describe('paid booking', () => {
  it('holds seats, takes payment, splits commission, issues tickets and queues WhatsApp', async () => {
    const eventId = await publishEvent(organiser, { pricePaise: 49_900, capacity: 5 });

    const created = await anon.post(
      `/api/public/events/${eventId}/bookings`,
      booking(2, { attendeeNames: ['Asha'] }),
    );
    expect(created.status).toBe(201);
    expect(created.body.booking.status).toBe('PENDING');
    expect(created.body.booking.amountPaise).toBe(99_800);
    expect(created.body.payment.provider).toBe('mock');
    expect((await anon.get(`/api/public/events/${eventId}`)).body.event.remaining).toBe(3);

    const confirmed = await payAndConfirm(anon, created.body);
    expect(confirmed.status).toBe(200);
    const paid = confirmed.body.booking;
    expect(paid.status).toBe('PAID');
    expect(paid.platformFeePaise).toBe(9_980); // 10% commission
    expect(paid.organiserSharePaise).toBe(89_820);
    expect(paid.tickets.map((t: { attendeeName: string }) => t.attendeeName)).toEqual([
      'Asha',
      'Test Customer +1',
    ]);

    await ctx.jobs['whatsapp-outbox']!.run();
    const message = ctx.sent.find((m) => m.body.includes(paid.id));
    expect(message?.toPhone).toBe('919876500000');
    expect(message?.body).toContain(`/b/${paid.id}?t=${created.body.accessToken}`);
  });

  it('confirming twice is idempotent (no duplicate tickets or messages)', async () => {
    const eventId = await publishEvent(organiser, { capacity: 5 });
    const created = (await anon.post(`/api/public/events/${eventId}/bookings`, booking(2))).body;
    await payAndConfirm(anon, created);
    const again = await payAndConfirm(anon, created);
    expect(again.body.booking.tickets).toHaveLength(2);
    const { rows } = await sql<{ n: number }>`
      select count(*)::int as n from messages where booking_id = ${created.booking.id}
    `.execute(ctx.db);
    expect(rows[0]?.n).toBe(1);
  });

  it('rejects a forged payment signature', async () => {
    const eventId = await publishEvent(organiser);
    const created = (await anon.post(`/api/public/events/${eventId}/bookings`, booking())).body;
    const res = await anon.post(
      `/api/public/bookings/${created.booking.id}/confirm?t=${created.accessToken}`,
      {
        providerOrderId: created.payment.orderId,
        providerPaymentId: 'pay_fake',
        signature: 'deadbeef',
      },
    );
    expect(res.status).toBe(400);
    const view = await anon.get(
      `/api/public/bookings/${created.booking.id}?t=${created.accessToken}`,
    );
    expect(view.body.booking.status).toBe('PENDING');
  });

  it('needs the booking token to read a booking', async () => {
    const eventId = await publishEvent(organiser);
    const created = (await anon.post(`/api/public/events/${eventId}/bookings`, booking())).body;
    expect(
      (await anon.get(`/api/public/bookings/${created.booking.id}?t=wrong-token-wrong-token`))
        .status,
    ).toBe(404);
  });
});

describe('capacity', () => {
  it('never oversells under concurrent bookings', async () => {
    const eventId = await publishEvent(organiser, { capacity: 5 });
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        anon.post(`/api/public/events/${eventId}/bookings`, booking(1)),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    const rejected = results.filter((r) => r.status === 409);
    expect(rejected).toHaveLength(7);
    expect(rejected[0]?.body.error.code).toBe('SOLD_OUT');
  });

  it('frees seats when a hold expires, and honours a late payment only if seats remain', async () => {
    const eventId = await publishEvent(organiser, { capacity: 2 });
    const first = (await anon.post(`/api/public/events/${eventId}/bookings`, booking(2))).body;
    expect((await anon.post(`/api/public/events/${eventId}/bookings`, booking(1))).status).toBe(
      409,
    );

    ctx.advance(16 * 60_000); // hold lapses
    const second = (await anon.post(`/api/public/events/${eventId}/bookings`, booking(2))).body;
    expect(second.booking.status).toBe('PENDING');
    expect(await ctx.jobs['expire-holds']!.run()).toBeGreaterThanOrEqual(1);

    // First customer pays late while the second still holds the seats: refund flagged, no tickets.
    const late = await payAndConfirm(anon, first);
    expect(late.body.booking.status).toBe('EXPIRED');
    expect(late.body.booking.needsRefund).toBe(true);
    expect(late.body.booking.tickets).toHaveLength(0);

    // Second customer's payment succeeds normally.
    expect((await payAndConfirm(anon, second)).body.booking.status).toBe('PAID');
  });

  it('honours a late payment when seats are still free', async () => {
    const eventId = await publishEvent(organiser, { capacity: 2 });
    const created = (await anon.post(`/api/public/events/${eventId}/bookings`, booking(1))).body;
    ctx.advance(20 * 60_000);
    const res = await payAndConfirm(anon, created);
    expect(res.body.booking.status).toBe('PAID');
    expect(res.body.booking.needsRefund).toBe(false);
  });

  it('confirms a free event immediately with tickets', async () => {
    const eventId = await publishEvent(organiser, { pricePaise: 0, capacity: 3 });
    const res = await anon.post(`/api/public/events/${eventId}/bookings`, booking(2));
    expect(res.body.payment).toBeNull();
    expect(res.body.booking.status).toBe('PAID');
    expect(res.body.booking.tickets).toHaveLength(2);
  });

  it('does not expose draft, cancelled or unknown events', async () => {
    const draft = (
      await organiser.post('/api/events', {
        title: 'Hidden draft',
        venue: 'Venue',
        startsAt: inDays(2),
        pricePaise: 100,
        capacity: 5,
      })
    ).body.event.id;
    expect((await anon.post(`/api/public/events/${draft}/bookings`, booking())).status).toBe(404);
    expect((await anon.get(`/api/public/events/${draft}`)).status).toBe(404);
    const list = (await anon.get('/api/public/events')).body.events as { title: string }[];
    expect(list.some((e) => e.title === 'Hidden draft')).toBe(false);
  });
});

describe('commission', () => {
  it('uses the rate snapshotted on the event, not the organiser’s current rate', async () => {
    const eventId = await publishEvent(organiser, { pricePaise: 10_000, capacity: 5 });
    const orgId = (await owner.get('/api/organisers')).body.organisers.find(
      (o: { phone: string }) => o.phone === ORGANISER,
    ).id;
    await owner.patch(`/api/organisers/${orgId}`, { commissionBps: 2500 });

    const created = (await anon.post(`/api/public/events/${eventId}/bookings`, booking(1))).body;
    const paid = (await payAndConfirm(anon, created)).body.booking;
    expect(paid.platformFeePaise).toBe(1_000); // still 10%

    const newer = await publishEvent(organiser, { pricePaise: 10_000, capacity: 5 });
    const created2 = (await anon.post(`/api/public/events/${newer}/bookings`, booking(1))).body;
    expect((await payAndConfirm(anon, created2)).body.booking.platformFeePaise).toBe(2_500);
    await owner.patch(`/api/organisers/${orgId}`, { commissionBps: 1000 });
  });

  it('shows platform totals to the owner and only own totals to the organiser', async () => {
    const platform = (await owner.get('/api/dashboard')).body.dashboard;
    const own = (await organiser.get('/api/dashboard')).body.dashboard;
    expect(platform.scope).toBe('platform');
    expect(platform.platformFeePaise + platform.organiserSharePaise).toBe(platform.grossPaise);
    expect(own.scope).toBe('organiser');
    expect(own.grossPaise).toBeGreaterThan(0);
  });
});

describe('event lifecycle and access', () => {
  it('cancelling an event flags refunds, voids tickets and stops sales', async () => {
    const eventId = await publishEvent(organiser, { capacity: 5 });
    const paid = (
      await payAndConfirm(
        anon,
        (await anon.post(`/api/public/events/${eventId}/bookings`, booking(1))).body,
      )
    ).body;
    const pending = (await anon.post(`/api/public/events/${eventId}/bookings`, booking(1))).body;

    expect((await organiser.patch(`/api/events/${eventId}`, { status: 'CANCELLED' })).status).toBe(
      200,
    );

    const bookings = (await organiser.get(`/api/bookings?eventId=${eventId}`)).body.bookings;
    const p = bookings.find((b: { id: string }) => b.id === paid.booking.id);
    expect(p.needsRefund).toBe(true);
    expect(p.tickets[0].state).toBe('VOID');
    expect(bookings.find((b: { id: string }) => b.id === pending.booking.id).status).toBe(
      'CANCELLED',
    );
    expect((await anon.post(`/api/public/events/${eventId}/bookings`, booking())).status).toBe(404);
    expect((await organiser.patch(`/api/events/${eventId}`, { title: 'Renamed' })).status).toBe(
      409,
    );
  });

  it('blocks unpublishing after sales and shrinking capacity below seats taken', async () => {
    const eventId = await publishEvent(organiser, { capacity: 5 });
    await payAndConfirm(
      anon,
      (await anon.post(`/api/public/events/${eventId}/bookings`, booking(3))).body,
    );
    expect((await organiser.patch(`/api/events/${eventId}`, { status: 'DRAFT' })).status).toBe(409);
    expect((await organiser.patch(`/api/events/${eventId}`, { capacity: 2 })).status).toBe(409);
    expect((await organiser.patch(`/api/events/${eventId}`, { capacity: 3 })).status).toBe(200);
  });

  it('keeps organisers out of each other’s events', async () => {
    const eventId = await publishEvent(organiser);
    await owner.post('/api/organisers', {
      name: 'Rival',
      phone: '9222222222',
      email: 'rival@example.com',
      password: 'Passw0rd!!',
      commissionBps: 500,
    });
    const rival = await client(ctx.app).login('9222222222');
    expect((await rival.get(`/api/events/${eventId}`)).status).toBe(404);
    expect((await rival.patch(`/api/events/${eventId}`, { title: 'Hijack' })).status).toBe(404);
    expect((await rival.get('/api/events')).body.events).toHaveLength(0);
    expect((await rival.get(`/api/bookings?eventId=${eventId}`)).body.bookings).toHaveLength(0);
  });

  it('validates input', async () => {
    const bad = await organiser.post('/api/events', {
      title: 'x',
      venue: 'V',
      startsAt: 'nope',
      pricePaise: -1,
      capacity: 0,
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION');
    const eventId = await publishEvent(organiser);
    expect((await anon.post(`/api/public/events/${eventId}/bookings`, booking(99))).status).toBe(
      400,
    );
    expect(
      (
        await anon.post(`/api/public/events/${eventId}/bookings`, {
          ...booking(1),
          customerPhone: '123',
        })
      ).status,
    ).toBe(400);
  });
});

describe('razorpay webhook', () => {
  const secrets = { keyId: 'rzp_test_x', keySecret: 'key-secret', webhookSecret: 'whsec' };
  let wh: TestCtx;
  let whAnon: Client;

  beforeAll(async () => {
    await ctx.close();
    const real = createRazorpayGateway(secrets);
    let n = 0;
    // Real signature/webhook logic; only the outbound order call (needs internet) is stubbed.
    wh = await setup({
      gateway: { ...real, createOrder: async () => ({ orderId: `order_rzp_${(n += 1)}` }) },
    });
    whAnon = client(wh.app);
    ctx = wh;
  });

  const signed = (body: object, secret = secrets.webhookSecret) => {
    const raw = JSON.stringify(body);
    return { raw, sig: createHmac('sha256', secret).update(raw).digest('hex') };
  };
  const capturedEvent = (orderId: string, amount: number) => ({
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_123', order_id: orderId, amount } } },
  });
  const post = (raw: string, sig: string) =>
    request(wh.app)
      .post('/api/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', sig)
      .send(raw);

  it('settles the booking from a signed capture (even without the browser confirm)', async () => {
    const org = await client(wh.app).login(ORGANISER);
    const eventId = await publishEvent(org, { pricePaise: 20_000, capacity: 5 });
    const created = (await whAnon.post(`/api/public/events/${eventId}/bookings`, booking(2))).body;
    expect(created.payment.keyId).toBe('rzp_test_x');

    const { raw, sig } = signed(capturedEvent(created.payment.orderId, 40_000));
    expect((await post(raw, sig)).status).toBe(200);
    expect((await post(raw, sig)).status).toBe(200); // retry from Razorpay is harmless

    const view = await whAnon.get(
      `/api/public/bookings/${created.booking.id}?t=${created.accessToken}`,
    );
    expect(view.body.booking.status).toBe('PAID');
    expect(view.body.booking.tickets).toHaveLength(2);
  });

  it('rejects bad signatures and mismatched amounts', async () => {
    const org = await client(wh.app).login(ORGANISER);
    const eventId = await publishEvent(org, { pricePaise: 20_000, capacity: 5 });
    const created = (await whAnon.post(`/api/public/events/${eventId}/bookings`, booking(1))).body;

    const forged = signed(capturedEvent(created.payment.orderId, 20_000), 'wrong-secret');
    expect((await post(forged.raw, forged.sig)).status).toBe(400);

    const cheap = signed(capturedEvent(created.payment.orderId, 100));
    expect((await post(cheap.raw, cheap.sig)).status).toBe(400);
    const view = await whAnon.get(
      `/api/public/bookings/${created.booking.id}?t=${created.accessToken}`,
    );
    expect(view.body.booking.status).toBe('PENDING');
  });
});
