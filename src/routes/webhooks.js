'use strict';
const router = require('express').Router();
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const wa = require('../whatsapp');
const { timingSafeEqualStr } = require('../crypto');
const { HttpError, wrap } = require('../errors');

/*
 * Payment confirmation. Your gateway (or your own server) calls this once a payment succeeds.
 *   POST /api/webhooks/payment   header: x-signature = hex(HMAC_SHA256(rawBody, PAYMENT_WEBHOOK_SECRET))
 *   body: { "bookingCode": "ABCD-2345", "paymentRef": "pay_123", "amount": 499 }
 * Idempotent: a retry with the same paymentRef returns 200 without sending the ticket twice.
 */
router.post('/webhooks/payment', wrap(async (req, res) => {
  if (!config.paymentWebhookSecret) throw new HttpError(503, 'Payment webhook is not configured.');
  const sig = req.get('x-signature') || '';
  const expected = crypto.createHmac('sha256', config.paymentWebhookSecret).update(req.rawBody || Buffer.alloc(0)).digest('hex');
  if (!timingSafeEqualStr(sig, expected)) throw new HttpError(401, 'Bad signature.');

  const b = req.body || {};
  const code = String(b.bookingCode || '').toUpperCase();
  const ref = String(b.paymentRef || '');
  const amount = Number(b.amount);
  if (!code || !ref || !Number.isFinite(amount)) throw new HttpError(400, 'bookingCode, paymentRef and amount are required.');

  let upd;
  try {
    upd = await db.query(
      `UPDATE bookings SET status = 'paid', paid_at = now(), payment_ref = $2
        WHERE code = $1 AND status = 'pending' AND amount = $3 RETURNING code`, [code, ref, amount]);
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'This payment reference was already used.');
    throw e;
  }
  if (upd.rows[0]) {
    const base = config.publicUrl || `${req.protocol}://${req.get('host')}`;
    db.query('SELECT o.wa_auto_send FROM bookings b JOIN events e ON e.id=b.event_id JOIN organisers o ON o.id=e.organiser_id WHERE b.code=$1', [code])
      .then(({ rows }) => (rows[0] && rows[0].wa_auto_send ? wa.sendTicket(code, base) : null))
      .catch((e) => console.error('[whatsapp] ticket send failed for', code, e.message));
    return res.json({ ok: true, status: 'paid' });
  }
  const { rows } = await db.query('SELECT status, amount, payment_ref FROM bookings WHERE code = $1', [code]);
  const cur = rows[0];
  if (!cur) throw new HttpError(404, 'Booking not found.');
  if (cur.status === 'paid' && cur.payment_ref === ref) return res.json({ ok: true, status: 'paid', duplicate: true });
  if (cur.amount !== amount) throw new HttpError(409, 'Amount does not match the booking.');
  throw new HttpError(409, `Booking is already ${cur.status}.`);
}));

module.exports = router;
