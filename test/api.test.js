'use strict';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://evt:evt@localhost:5432/event_tickets_test';
process.env.APP_SECRET = 'test-secret-test-secret-test-secret-123';
process.env.PAYMENT_WEBHOOK_SECRET = 'whsec_test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db');
const { createApp } = require('../src/server');

let server, base;
const PW = 'correct-horse-9';

function client() {
  let cookie = '';
  const call = async (method, url, body, headers = {}) => {
    const h = { 'X-Requested-With': 'fetch', ...headers };
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (cookie) h.Cookie = cookie;
    const res = await fetch(base + url, { method, headers: h, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
    const ct = res.headers.get('content-type') || '';
    return { status: res.status, body: ct.includes('json') ? await res.json() : null };
  };
  return { call, get: (u) => call('GET', u), post: (u, b) => call('POST', u, b ?? {}), put: (u, b) => call('PUT', u, b), patch: (u, b) => call('PATCH', u, b) };
}
const login = async (email, password = PW) => { const c = client(); const r = await c.post('/api/auth/login', { email, password }); return { c, r }; };
const signed = (obj) => { const raw = JSON.stringify(obj); return { raw, sig: crypto.createHmac('sha256', 'whsec_test').update(raw).digest('hex') }; };

test.before(async () => {
  await pool.query(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));
  await pool.query('TRUNCATE organisers, users, events, bookings, payouts RESTART IDENTITY CASCADE');
  const hash = await bcrypt.hash(PW, 4);
  const o1 = (await pool.query("INSERT INTO organisers (name, fee_percent) VALUES ('Jivan Mhaske', 10) RETURNING id")).rows[0].id;
  const o2 = (await pool.query("INSERT INTO organisers (name) VALUES ('Other Org') RETURNING id")).rows[0].id;
  const u = async (org, name, email, role, active = true) => (await pool.query(
    'INSERT INTO users (organiser_id,name,email,password_hash,role,is_active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [org, name, email, hash, role, active])).rows[0].id;
  await u(o1, 'jivan', 'jivan@gmail.com', 'admin');
  await u(o1, 'vishal', 'vishal@gmail.com', 'staff');
  await u(o1, 'sarthak', 'sarthak@gmail.com', 'staff', false);
  await u(o2, 'other', 'other@gmail.com', 'admin');
  const ev = async (org, slug, name, at, price, cap) => (await pool.query(
    'INSERT INTO events (organiser_id,slug,name,venue,starts_at,price,capacity) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id', [org, slug, name, 'Venue', at, price, cap])).rows[0].id;
  const diwali = await ev(o1, 'diwali-night', 'Diwali night', '2026-10-26T14:39:00Z', 1, 0);
  const jag = await ev(o1, 'jagran', 'Jagran', '2099-01-01T10:00:00Z', 1000, 5);
  await ev(o1, 'paid-fest', 'Paid fest', '2099-02-01T10:00:00Z', 250, 0);
  await ev(o1, 'free-fest', 'Free fest', '2099-03-01T10:00:00Z', 0, 0);
  await ev(o2, 'other-event', 'Other event', '2099-01-01T10:00:00Z', 50, 0);
  const bk = (evId, code, status, checked) => pool.query(
    `INSERT INTO bookings (event_id,code,customer_name,phone,quantity,amount,status,paid_at,checked_in_at,created_at)
     VALUES ($1,$2,'Guest','9975608006',1,$3,$4, CASE WHEN $4='paid' THEN now() END, $5, now() - interval '3 days')`,
    [evId, code, status === 'paid' ? 1 : 1000, status, checked ? new Date() : null]);
  await bk(diwali, 'DIWA-0001', 'paid', true);
  await bk(diwali, 'DIWA-0002', 'paid', false);
  for (let i = 0; i < 6; i++) await bk(jag, `JAGR-000${i}`, 'pending', false);
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { server.close(); await pool.end(); });

test('auth: wrong password, disabled user, success, /me', async () => {
  assert.equal((await login('jivan@gmail.com', 'nope')).r.status, 401);
  assert.equal((await login('nobody@x.com')).r.status, 401);
  const dis = await login('sarthak@gmail.com');
  assert.equal(dis.r.status, 403);
  const { c, r } = await login('JIVAN@gmail.com');
  assert.equal(r.status, 200);
  assert.equal(r.body.user.role, 'admin');
  assert.equal(r.body.org.fee, '10% platform fee');
  assert.equal((await c.get('/api/me')).body.user.email, 'jivan@gmail.com');
  assert.equal((await client().get('/api/me')).status, 401);
});

test('csrf: state-changing request without the custom header is rejected', async () => {
  const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 403);
});

test('overview: totals, fee and payout are computed in SQL', async () => {
  const { c } = await login('jivan@gmail.com');
  const { body } = await c.get('/api/overview');
  assert.deepEqual([body.totals.sold, body.totals.checked, body.totals.sales, body.totals.paidBookings], [2, 1, 2, 2]);
  assert.deepEqual([body.totals.pending, body.totals.pendingAmt], [6, 6000]);
  assert.equal(body.totals.fee, 0.2);
  assert.equal(body.totals.share, 1.8);
  assert.equal(body.totals.pendingPayout, 1.8);
  const d = body.events.find((e) => e.id === 'diwali-night');
  assert.deepEqual(d.stats, { sold: 2, checked: 1, sales: 2 });
  assert.equal(body.bookings.length, 8);
  await pool.query("INSERT INTO payouts (organiser_id, amount) VALUES (1, 1)");
  assert.equal((await c.get('/api/overview')).body.totals.pendingPayout, 0.8);
});

test('events: validation, duplicate slug, create, patch, delete rules, tenant isolation', async () => {
  const { c } = await login('jivan@gmail.com');
  const good = { name: 'Garba', slug: 'garba-2026', date: '2099-05-01T14:00:00.000Z', venue: 'Hall', price: 499, max: 10, cap: 0, askNames: true, open: true };
  let r = await c.post('/api/events', { ...good, slug: 'Bad Slug' });
  assert.equal(r.status, 400); assert.equal(r.body.field, 'slug');
  r = await c.post('/api/events', { ...good, price: -5 });
  assert.equal(r.status, 400); assert.equal(r.body.field, 'price');
  r = await c.post('/api/events', { ...good, slug: 'diwali-night' });
  assert.equal(r.status, 409); assert.equal(r.body.field, 'slug');
  r = await c.post('/api/events', good);
  assert.equal(r.status, 201); assert.equal(r.body.event.id, 'garba-2026'); assert.equal(r.body.event.askNames, true);
  r = await c.patch('/api/events/garba-2026', { open: false });
  assert.equal(r.body.event.open, false);
  assert.equal((await c.call('DELETE', '/api/events/garba-2026')).status, 200);
  assert.equal((await c.call('DELETE', '/api/events/diwali-night')).status, 409);
  assert.equal((await c.get('/api/events/other-event')).status, 404);
  assert.equal((await c.patch('/api/events/other-event', { open: false })).status, 404);
  r = await c.patch('/api/events/diwali-night', { cap: 1 });
  assert.equal(r.status, 400);
});

test('public booking: validation, capacity holds, free events confirm immediately', async () => {
  const pub = client();
  assert.equal((await pub.get('/api/public/events/paid-fest')).body.bookable, true);
  assert.equal((await pub.post('/api/public/events/paid-fest/bookings', { name: 'A', phone: '123', quantity: 1 })).status, 400);
  assert.equal((await pub.post('/api/public/events/paid-fest/bookings', { name: 'A', phone: '9975608006', quantity: 11 })).status, 400);
  const r = await pub.post('/api/public/events/paid-fest/bookings', { name: 'Asha', phone: '9975608006', quantity: 2 });
  assert.equal(r.status, 201); assert.equal(r.body.status, 'pending'); assert.equal(r.body.amount, 500);
  assert.match(r.body.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const free = await pub.post('/api/public/events/free-fest/bookings', { name: 'Raj', phone: '8468846479', quantity: 1 });
  assert.equal(free.body.status, 'paid');
  // jagran: capacity 5, seeded pending bookings are old so they do not hold seats
  for (let i = 0; i < 5; i++) assert.equal((await pub.post('/api/public/events/jagran/bookings', { name: 'X', phone: '9975608006', quantity: 1 })).status, 201);
  const over = await pub.post('/api/public/events/jagran/bookings', { name: 'X', phone: '9975608006', quantity: 1 });
  assert.equal(over.status, 409);
  assert.equal((await pub.get('/api/public/events/jagran')).body.bookable, false);
  assert.equal((await pub.post('/api/public/events/diwali-night/bookings', { name: 'X', phone: '9975608006', quantity: 1 })).status, 409); // ended
});

test('concurrent bookings never oversell a capped event', async () => {
  await pool.query("INSERT INTO events (organiser_id,slug,name,venue,starts_at,price,capacity) VALUES (1,'tiny','Tiny','V','2099-06-01T10:00:00Z',10,3)");
  const pub = client();
  const rs = await Promise.all(Array.from({ length: 8 }, () => pub.post('/api/public/events/tiny/bookings', { name: 'C', phone: '9975608006', quantity: 1 })));
  assert.equal(rs.filter((r) => r.status === 201).length, 3);
  assert.equal(rs.filter((r) => r.status === 409).length, 5);
});

test('payment webhook: signature, amount, idempotency', async () => {
  const pub = client();
  const b = (await pub.post('/api/public/events/paid-fest/bookings', { name: 'Pay', phone: '9975608006', quantity: 1 })).body;
  const hook = (obj, sig) => { const s = signed(obj); return pub.call('POST', '/api/webhooks/payment', s.raw, { 'x-signature': sig === undefined ? s.sig : sig }); };
  assert.equal((await hook({ bookingCode: b.code, paymentRef: 'pay_1', amount: 250 }, 'deadbeef')).status, 401);
  assert.equal((await hook({ bookingCode: b.code, paymentRef: 'pay_1', amount: 1 })).status, 409);
  assert.equal((await hook({ bookingCode: 'ZZZZ-9999', paymentRef: 'pay_x', amount: 250 })).status, 404);
  let r = await hook({ bookingCode: b.code, paymentRef: 'pay_1', amount: 250 });
  assert.equal(r.status, 200); assert.equal(r.body.status, 'paid');
  r = await hook({ bookingCode: b.code, paymentRef: 'pay_1', amount: 250 });
  assert.equal(r.status, 200); assert.equal(r.body.duplicate, true);
  assert.equal((await hook({ bookingCode: b.code, paymentRef: 'pay_2', amount: 250 })).status, 409);
  assert.equal((await pub.get(`/api/public/tickets/${b.code}`)).status, 200);
  const png = await fetch(`${base}/api/public/tickets/${b.code}/qr.png`);
  assert.equal(png.headers.get('content-type'), 'image/png');
  assert.equal((await pub.get('/api/public/tickets/JAGR-0000')).status, 404); // pending tickets are not public
});

test('scan: ok, already, unpaid, notfound, tenant isolation, one winner under concurrency', async () => {
  const { c: staff } = await login('vishal@gmail.com');
  let r = await staff.post('/api/scan', { code: 'diwa-0002' });
  assert.equal(r.body.result, 'ok'); assert.equal(r.body.event, 'Diwali night');
  r = await staff.post('/api/scan', { code: 'DIWA-0002' });
  assert.equal(r.body.result, 'already'); assert.equal(r.body.by, 'vishal');
  assert.equal((await staff.post('/api/scan', { code: 'JAGR-0001' })).body.result, 'unpaid');
  assert.equal((await staff.post('/api/scan', { code: 'NOPE-0000' })).body.result, 'notfound');
  const { c: other } = await login('other@gmail.com');
  assert.equal((await other.post('/api/scan', { code: 'DIWA-0001' })).body.result, 'notfound');

  await pool.query("INSERT INTO bookings (event_id,code,customer_name,phone,quantity,amount,status,paid_at) VALUES (1,'RACE-0001','R','9975608006',1,1,'paid',now())");
  const rs = await Promise.all(Array.from({ length: 6 }, () => staff.post('/api/scan', { code: 'RACE-0001' })));
  assert.equal(rs.filter((x) => x.body.result === 'ok').length, 1);
  assert.equal(rs.filter((x) => x.body.result === 'already').length, 5);
});

test('roles: staff are limited to scanning', async () => {
  const { c: staff } = await login('vishal@gmail.com');
  for (const u of ['/api/overview', '/api/events', '/api/team', '/api/settings']) assert.equal((await staff.get(u)).status, 403, u);
  assert.equal((await staff.post('/api/events', {})).status, 403);
});

test('team: add, duplicate email, self-protection, disable kicks out live sessions, password change invalidates sessions', async () => {
  const { c: admin } = await login('jivan@gmail.com');
  let r = await admin.post('/api/team', { name: 'Neha', email: 'neha@x.com', password: 'short', role: 'staff' });
  assert.equal(r.status, 400);
  r = await admin.post('/api/team', { name: 'Neha', email: 'neha@x.com', password: 'longenough1', role: 'staff' });
  assert.equal(r.status, 201); const id = r.body.member.id;
  assert.equal((await admin.post('/api/team', { name: 'Neha 2', email: 'NEHA@x.com', password: 'longenough1', role: 'staff' })).status, 409);
  const list = (await admin.get('/api/team')).body.members;
  const me = list.find((m) => m.email === 'jivan@gmail.com');
  assert.equal(me.you, true);
  assert.equal((await admin.patch(`/api/team/${me.id}`, { active: false })).status, 400);

  const { c: neha } = await login('neha@x.com', 'longenough1');
  assert.equal((await neha.get('/api/me')).status, 200);
  await admin.post(`/api/team/${id}/password`, { password: 'brand-new-pass' });
  assert.equal((await neha.get('/api/me')).status, 401);                       // old session dead
  const { c: neha2 } = await login('neha@x.com', 'brand-new-pass');
  assert.equal((await neha2.get('/api/me')).status, 200);
  await admin.patch(`/api/team/${id}`, { active: false });
  assert.equal((await neha2.get('/api/me')).status, 403);                      // disabled immediately
  assert.equal((await login('neha@x.com', 'brand-new-pass')).r.status, 403);
  const { c: other } = await login('other@gmail.com');
  assert.equal((await other.patch(`/api/team/${id}`, { active: true })).status, 404);
});

test('settings: unknown template field, contact validation, API key is encrypted and never returned', async () => {
  const { c } = await login('jivan@gmail.com');
  let r = await c.put('/api/settings/delivery', { autoSend: true, attachImg: false, msg: 'Hi {{name}} {{bogus}}' });
  assert.equal(r.status, 400); assert.equal(r.body.field, 'msg');
  r = await c.put('/api/settings/delivery', { autoSend: true, attachImg: false, msg: 'Hi {{name}}, see {{ticketUrl}}' });
  assert.equal(r.body.settings.autoSend, true); assert.equal(r.body.settings.attachImg, false);
  assert.equal((await c.put('/api/settings/contact', { gstin: 'bad', phone: '', email: '' })).status, 400);
  r = await c.put('/api/settings/contact', { address: 'Ahilyanagar', phone: '+91 97302 03351', email: 'hi@x.com', gstin: '22aaaaa0000a1z5' });
  assert.equal(r.body.settings.gstin, '22AAAAA0000A1Z5');
  assert.equal((await c.post('/api/settings/test-message', { phone: '9975608006' })).status, 400); // no key yet
  r = await c.put('/api/settings/api-key', { apiKey: 'sk_live_super_secret' });
  assert.equal(r.body.settings.apiKeySaved, true);
  assert.ok(!JSON.stringify(r.body).includes('sk_live'));
  const row = (await pool.query('SELECT wa_api_key_enc FROM organisers WHERE id = 1')).rows[0].wa_api_key_enc;
  assert.ok(row && !row.includes('sk_live'));
  assert.equal((await c.post('/api/settings/test-message', { phone: '9975608006' })).status, 503); // provider URL not configured
});

test('event QR image is served to the owner only', async () => {
  const { c } = await login('jivan@gmail.com');
  const res = await fetch(`${base}/api/events/diwali-night/qr.png`, { headers: { Cookie: (await (async () => { const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, body: JSON.stringify({ email: 'jivan@gmail.com', password: PW }) }); return r.headers.get('set-cookie').split(';')[0]; })()) } });
  assert.equal(res.status, 200); assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal((await c.get('/api/events/other-event/qr.png')).status, 404);
  assert.equal((await fetch(`${base}/api/events/diwali-night/qr.png`)).status, 401);
});

test('static panel and CSP are served', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal((await fetch(base + '/app.js')).status, 200);
});
