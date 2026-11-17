'use strict';
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('./config');
const db = require('./db');
const { HttpError, wrap } = require('./errors');

const COOKIE = 'et_session';
const MAX_AGE = 12 * 60 * 60 * 1000;
const pwTag = (hash) => crypto.createHash('sha256').update(hash).digest('hex').slice(0, 16);

function issue(res, user) {
  const token = jwt.sign({ uid: user.id, pw: pwTag(user.password_hash) }, config.appSecret, { expiresIn: '12h', algorithm: 'HS256' });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: config.prod, maxAge: MAX_AGE, path: '/' });
}
const clear = (res) => res.clearCookie(COOKIE, { path: '/' });

const requireAuth = wrap(async (req, _res, next) => {
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) throw new HttpError(401, 'Sign in to continue.');
  let claims;
  try { claims = jwt.verify(token, config.appSecret, { algorithms: ['HS256'] }); }
  catch (_) { throw new HttpError(401, 'Your session expired. Sign in again.'); }
  const { rows } = await db.query(
    `SELECT u.id, u.organiser_id, u.name, u.email, u.role, u.is_active, u.password_hash,
            o.name AS org_name, o.fee_percent
       FROM users u JOIN organisers o ON o.id = u.organiser_id WHERE u.id = $1`, [claims.uid]);
  const u = rows[0];
  if (!u || claims.pw !== pwTag(u.password_hash)) throw new HttpError(401, 'Your session expired. Sign in again.');
  if (!u.is_active) throw new HttpError(403, 'This account is disabled. Ask your admin.');
  req.user = { id: u.id, orgId: u.organiser_id, name: u.name, email: u.email, role: u.role, orgName: u.org_name, feePercent: u.fee_percent };
  next();
});

const requireAdmin = (req, _res, next) =>
  req.user.role === 'admin' ? next() : next(new HttpError(403, 'Only admins can do this.'));

/* CSRF: cookies are SameSite=Lax; also require a custom header on every state-changing request. */
const requireXhr = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-requested-with') !== 'fetch') return next(new HttpError(403, 'Invalid request.'));
  next();
};

module.exports = { issue, clear, requireAuth, requireAdmin, requireXhr, COOKIE };
