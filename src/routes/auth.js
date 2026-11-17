'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const config = require('../config');
const { issue, clear, requireAuth } = require('../auth');
const { HttpError, wrap } = require('../errors');
const shape = require('../shape');

const DUMMY = bcrypt.hashSync('not-a-real-password', 10); // equalises timing for unknown emails
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again in a few minutes.' } });

const me = (req) => ({
  user: { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role },
  org: { name: req.user.orgName, first: req.user.orgName.split(' ')[0], fee: shape.feeLabel(req.user.feePercent), feePercent: req.user.feePercent },
  publicUrl: config.publicUrl || `${req.protocol}://${req.get('host')}`,
});

router.post('/auth/login', limiter, wrap(async (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const password = String((req.body || {}).password || '');
  if (!email || !password) throw new HttpError(400, 'Enter your email and password.');
  const { rows } = await db.query('SELECT * FROM users WHERE lower(email) = $1', [email]);
  const u = rows[0];
  const ok = await bcrypt.compare(password, u ? u.password_hash : DUMMY);
  if (!u || !ok) throw new HttpError(401, 'Email or password is incorrect.');
  if (!u.is_active) throw new HttpError(403, 'This account is disabled. Ask your admin.');
  await db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [u.id]);
  issue(res, u);
  const full = await db.query('SELECT name, fee_percent FROM organisers WHERE id = $1', [u.organiser_id]);
  req.user = { id: u.id, name: u.name, email: u.email, role: u.role, orgName: full.rows[0].name, feePercent: full.rows[0].fee_percent };
  res.json(me(req));
}));

router.post('/auth/logout', (_req, res) => { clear(res); res.json({ ok: true }); });
router.get('/me', requireAuth, (req, res) => res.json(me(req)));

module.exports = router;
