'use strict';
const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../auth');
const { HttpError, wrap } = require('../errors');

/* Gate staff and admins can scan. The check-in is a single atomic UPDATE, so two phones scanning the same ticket cannot both succeed. */
router.post('/scan', requireAuth, wrap(async (req, res) => {
  const code = String((req.body || {}).code || '').trim().toUpperCase();
  if (!code || code.length > 40) throw new HttpError(400, 'Enter a ticket code.');
  const won = await db.query(
    `UPDATE bookings b SET checked_in_at = now(), checked_in_by = $2
       FROM events e
      WHERE b.event_id = e.id AND e.organiser_id = $3 AND b.code = $1 AND b.status = 'paid' AND b.checked_in_at IS NULL
      RETURNING b.customer_name, b.quantity, b.checked_in_at, e.name AS event_name, e.slug`,
    [code, req.user.id, req.user.orgId]);
  if (won.rows[0]) {
    const r = won.rows[0];
    return res.json({ result: 'ok', name: r.customer_name, qty: r.quantity, event: r.event_name, eventId: r.slug, at: r.checked_in_at });
  }
  const { rows } = await db.query(
    `SELECT b.status, b.customer_name, b.checked_in_at, u.name AS by, e.name AS event_name
       FROM bookings b JOIN events e ON e.id = b.event_id LEFT JOIN users u ON u.id = b.checked_in_by
      WHERE b.code = $1 AND e.organiser_id = $2`, [code, req.user.orgId]);
  const b = rows[0];
  if (!b) return res.json({ result: 'notfound', code });
  if (b.status !== 'paid') return res.json({ result: 'unpaid', name: b.customer_name, status: b.status });
  res.json({ result: 'already', name: b.customer_name, event: b.event_name, at: b.checked_in_at, by: b.by });
}));

module.exports = router;
