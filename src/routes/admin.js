'use strict';
const router = require('express').Router();
const QRCode = require('qrcode');
const config = require('../config');
const db = require('../db');
const v = require('../validate');
const shape = require('../shape');
const { requireAuth, requireAdmin } = require('../auth');
const { HttpError, wrap } = require('../errors');

router.use(requireAuth, requireAdmin);

const EVENT_SELECT = `
  SELECT e.*, COALESCE(s.sold,0) AS sold, COALESCE(s.checked,0) AS checked, COALESCE(s.sales,0) AS sales
    FROM events e
    LEFT JOIN (
      SELECT event_id,
             SUM(quantity) FILTER (WHERE status='paid')                                  AS sold,
             SUM(quantity) FILTER (WHERE status='paid' AND checked_in_at IS NOT NULL)    AS checked,
             SUM(amount)   FILTER (WHERE status='paid')                                  AS sales
        FROM bookings GROUP BY event_id) s ON s.event_id = e.id`;

const BOOKING_SELECT = `
  SELECT b.*, e.slug, u.name AS checked_in_by_name
    FROM bookings b JOIN events e ON e.id = b.event_id LEFT JOIN users u ON u.id = b.checked_in_by`;

async function getEvent(orgId, slug) {
  const { rows } = await db.query(`${EVENT_SELECT} WHERE e.organiser_id = $1 AND e.slug = $2`, [orgId, slug]);
  if (!rows[0]) throw new HttpError(404, 'Event not found.');
  return rows[0];
}

/* ---------- dashboard ---------- */
router.get('/overview', wrap(async (req, res) => {
  const org = req.user.orgId;
  const [events, bookings, t, payouts] = await Promise.all([
    db.query(`${EVENT_SELECT} WHERE e.organiser_id = $1 ORDER BY e.starts_at DESC`, [org]),
    db.query(`${BOOKING_SELECT} WHERE e.organiser_id = $1 ORDER BY b.created_at DESC LIMIT 100`, [org]),
    db.query(`SELECT
        COALESCE(SUM(b.quantity) FILTER (WHERE b.status='paid'),0)                                AS sold,
        COALESCE(SUM(b.quantity) FILTER (WHERE b.status='paid' AND b.checked_in_at IS NOT NULL),0) AS checked,
        COALESCE(SUM(b.amount)   FILTER (WHERE b.status='paid'),0)                                AS sales,
        COUNT(*)                 FILTER (WHERE b.status='paid')                                   AS paid_bookings,
        COUNT(*)                 FILTER (WHERE b.status='pending')                                AS pending,
        COALESCE(SUM(b.amount)   FILTER (WHERE b.status='pending'),0)                             AS pending_amount,
        COUNT(*)                                                                                  AS all_bookings
      FROM bookings b JOIN events e ON e.id = b.event_id WHERE e.organiser_id = $1`, [org]),
    db.query('SELECT COALESCE(SUM(amount),0) AS received FROM payouts WHERE organiser_id = $1', [org]),
  ]);
  const r = t.rows[0];
  const fee = Math.round(r.sales * req.user.feePercent) / 100;
  const share = Math.round((r.sales - fee) * 100) / 100;
  const received = payouts.rows[0].received;
  res.json({
    events: events.rows.map(shape.event),
    bookings: bookings.rows.map(shape.booking),
    totals: {
      sold: r.sold, checked: r.checked, sales: r.sales, paidBookings: r.paid_bookings, pending: r.pending,
      pendingAmt: r.pending_amount, allBookings: r.all_bookings, fee, share, received,
      pendingPayout: Math.max(0, Math.round((share - received) * 100) / 100),
    },
  });
}));

/* ---------- events ---------- */
router.get('/events', wrap(async (req, res) => {
  const { rows } = await db.query(`${EVENT_SELECT} WHERE e.organiser_id = $1 ORDER BY e.starts_at DESC`, [req.user.orgId]);
  res.json({ events: rows.map(shape.event) });
}));

router.get('/events/:slug', wrap(async (req, res) => {
  const ev = await getEvent(req.user.orgId, req.params.slug);
  const { rows } = await db.query(`${BOOKING_SELECT} WHERE b.event_id = $1 ORDER BY b.created_at DESC LIMIT 1000`, [ev.id]);
  res.json({ event: shape.event(ev), bookings: rows.map(shape.booking) });
}));

/* Booking QR: encodes the public booking link, e.g. https://yourdomain/e/diwali-night */
router.get('/events/:slug/qr.png', wrap(async (req, res) => {
  const ev = await getEvent(req.user.orgId, req.params.slug);
  const base = config.publicUrl || `${req.protocol}://${req.get('host')}`;
  const png = await QRCode.toBuffer(`${base}/e/${ev.slug}`, { width: 720, margin: 2, errorCorrectionLevel: 'M' });
  res.type('png').send(png);
}));

router.post('/events', wrap(async (req, res) => {
  const b = req.body || {};
  const row = {
    name: v.str(b.name, 'name', { max: 120, label: 'an event name' }),
    slug: v.slug(b.slug),
    startsAt: v.date(b.date),
    venue: v.str(b.venue, 'venue', { max: 200, label: 'the venue' }),
    desc: v.optStr(b.desc, 'desc', 2000),
    price: v.money(b.price, 'price', 'Price'),
    max: v.int(b.max, 'max', { min: 1, max: 100, label: 'Max persons per booking' }),
    cap: v.int(b.cap, 'cap', { min: 0, max: 1e6, label: 'Total capacity' }),
    askNames: v.bool(!!b.askNames, 'askNames'),
    open: v.bool(b.open === undefined ? true : b.open, 'open'),
  };
  try {
    await db.query(
      `INSERT INTO events (organiser_id, slug, name, venue, description, starts_at, price, max_per_booking, capacity, ask_names, is_open)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [req.user.orgId, row.slug, row.name, row.venue, row.desc, row.startsAt, row.price, row.max, row.cap, row.askNames, row.open]);
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'This link is already used. Try another.', 'slug');
    throw e;
  }
  res.status(201).json({ event: shape.event(await getEvent(req.user.orgId, row.slug)) });
}));

router.patch('/events/:slug', wrap(async (req, res) => {
  const ev = await getEvent(req.user.orgId, req.params.slug);
  const b = req.body || {};
  const sets = [], vals = [];
  const add = (col, val) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };
  if ('open' in b) add('is_open', v.bool(b.open, 'open'));
  if ('name' in b) add('name', v.str(b.name, 'name', { max: 120 }));
  if ('venue' in b) add('venue', v.str(b.venue, 'venue', { max: 200 }));
  if ('desc' in b) add('description', v.optStr(b.desc, 'desc', 2000));
  if ('date' in b) add('starts_at', v.date(b.date));
  if ('price' in b) add('price', v.money(b.price, 'price'));
  if ('max' in b) add('max_per_booking', v.int(b.max, 'max', { min: 1, max: 100 }));
  if ('cap' in b) {
    const cap = v.int(b.cap, 'cap', { min: 0, max: 1e6 });
    if (cap > 0 && cap < ev.sold) throw new HttpError(400, `Capacity cannot be below the ${ev.sold} tickets already sold.`, 'cap');
    add('capacity', cap);
  }
  if ('askNames' in b) add('ask_names', v.bool(b.askNames, 'askNames'));
  if (!sets.length) throw new HttpError(400, 'Nothing to update.');
  vals.push(ev.id);
  await db.query(`UPDATE events SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
  res.json({ event: shape.event(await getEvent(req.user.orgId, req.params.slug)) });
}));

router.delete('/events/:slug', wrap(async (req, res) => {
  const ev = await getEvent(req.user.orgId, req.params.slug);
  const { rows } = await db.query('SELECT COUNT(*) AS n FROM bookings WHERE event_id = $1', [ev.id]);
  if (rows[0].n > 0) throw new HttpError(409, 'This event has bookings. Close it for booking instead of deleting it.');
  await db.query('DELETE FROM events WHERE id = $1', [ev.id]);
  res.json({ ok: true });
}));

module.exports = router;
