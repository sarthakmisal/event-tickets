'use strict';
const router = require('express').Router();
const QRCode = require('qrcode');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const v = require('../validate');
const { ticketCode } = require('../crypto');
const { HttpError, wrap } = require('../errors');

const bookLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many bookings from this network. Try again later.' } });

const HOLD = `status = 'paid' OR (status = 'pending' AND created_at > now() - interval '30 minutes')`;

router.get('/public/events/:slug', wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT e.slug, e.name, e.venue, e.description, e.starts_at, e.price, e.max_per_booking, e.capacity, e.ask_names, e.is_open,
            o.name AS organiser, o.contact_address, o.contact_phone, o.contact_email, o.gstin,
            (SELECT COALESCE(SUM(quantity),0) FROM bookings WHERE event_id = e.id AND (${HOLD})) AS taken
       FROM events e JOIN organisers o ON o.id = e.organiser_id WHERE e.slug = $1`, [req.params.slug]);
  const e = rows[0];
  if (!e) throw new HttpError(404, 'Event not found.');
  const ended = e.starts_at < new Date();
  res.json({
    id: e.slug, name: e.name, venue: e.venue, desc: e.description, date: e.starts_at, price: e.price,
    max: e.max_per_booking, askNames: e.ask_names, organiser: e.organiser,
    bookable: e.is_open && !ended && (!e.capacity || e.taken < e.capacity),
    remaining: e.capacity ? Math.max(0, e.capacity - e.taken) : null,
    contact: { address: e.contact_address, phone: e.contact_phone, email: e.contact_email, gstin: e.gstin },
  });
}));

/* Creates a pending booking. Free events are confirmed immediately; paid ones wait for the payment webhook. */
router.post('/public/events/:slug/bookings', bookLimiter, wrap(async (req, res) => {
  const b = req.body || {};
  const name = v.str(b.name, 'name', { max: 80, label: 'your name' });
  const phone = v.phone10(b.phone);
  const qty = v.int(b.quantity, 'quantity', { min: 1, max: 100, label: 'Persons' });

  const out = await db.tx(async (c) => {
    const ev = (await c.query('SELECT * FROM events WHERE slug = $1 FOR UPDATE', [req.params.slug])).rows[0];
    if (!ev) throw new HttpError(404, 'Event not found.');
    if (!ev.is_open || ev.starts_at < new Date()) throw new HttpError(409, 'Bookings are closed for this event.');
    if (qty > ev.max_per_booking) throw new HttpError(400, `You can book up to ${ev.max_per_booking} persons at a time.`, 'quantity');
    let attendees = [];
    if (ev.ask_names) {
      if (!Array.isArray(b.attendeeNames) || b.attendeeNames.length !== qty) throw new HttpError(400, 'Enter a name for every person.', 'attendeeNames');
      attendees = b.attendeeNames.map((n) => v.str(n, 'attendeeNames', { max: 80, label: 'a name for every person' }));
    }
    if (ev.capacity) {
      const taken = (await c.query(`SELECT COALESCE(SUM(quantity),0) AS n FROM bookings WHERE event_id = $1 AND (${HOLD})`, [ev.id])).rows[0].n;
      if (taken + qty > ev.capacity) throw new HttpError(409, ev.capacity - taken > 0 ? `Only ${ev.capacity - taken} tickets are left.` : 'This event is sold out.', 'quantity');
    }
    const amount = Math.round(ev.price * qty * 100) / 100;
    const status = amount === 0 ? 'paid' : 'pending';
    for (let i = 0; i < 5; i++) {
      try {
        const { rows } = await c.query(
          `INSERT INTO bookings (event_id, code, customer_name, phone, quantity, amount, status, attendee_names, paid_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8, CASE WHEN $7 = 'paid' THEN now() END) RETURNING code, amount, status`,
          [ev.id, ticketCode(), name, phone, qty, amount, status, JSON.stringify(attendees)]);
        return rows[0];
      } catch (e) { if (e.code !== '23505' || i === 4) throw e; }
    }
  });
  res.status(201).json(out);
}));

router.get('/public/tickets/:code', wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT b.code, b.customer_name, b.quantity, b.status, b.attendee_names, e.name, e.venue, e.starts_at
       FROM bookings b JOIN events e ON e.id = b.event_id WHERE b.code = $1`, [String(req.params.code).toUpperCase()]);
  const t = rows[0];
  if (!t || t.status !== 'paid') throw new HttpError(404, 'Ticket not found.');
  res.json({ code: t.code, name: t.customer_name, qty: t.quantity, attendees: t.attendee_names, event: t.name, venue: t.venue, date: t.starts_at });
}));

router.get('/public/tickets/:code/qr.png', wrap(async (req, res) => {
  const code = String(req.params.code).toUpperCase();
  const { rows } = await db.query(`SELECT 1 FROM bookings WHERE code = $1 AND status = 'paid'`, [code]);
  if (!rows[0]) throw new HttpError(404, 'Ticket not found.');
  const png = await QRCode.toBuffer(code, { width: 480, margin: 2, errorCorrectionLevel: 'M' });
  res.type('png').set('Cache-Control', 'public, max-age=86400').send(png);
}));

module.exports = router;
