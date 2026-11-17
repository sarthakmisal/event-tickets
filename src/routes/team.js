'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const v = require('../validate');
const shape = require('../shape');
const { requireAuth, requireAdmin } = require('../auth');
const { HttpError, wrap } = require('../errors');

router.use(requireAuth, requireAdmin);
const role = (r) => { if (!['admin', 'staff'].includes(r)) throw new HttpError(400, 'Role must be admin or staff.', 'role'); return r; };

router.get('/team', wrap(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM users WHERE organiser_id = $1 ORDER BY (role = \'admin\') DESC, created_at', [req.user.orgId]);
  res.json({ members: rows.map((r) => shape.member(r, req.user.id)) });
}));

router.post('/team', wrap(async (req, res) => {
  const b = req.body || {};
  const name = v.str(b.name, 'name', { max: 80, label: 'a name' });
  const email = v.email(b.email);
  const pw = v.password(b.password);
  const r = role(b.role);
  const hash = await bcrypt.hash(pw, 10);
  try {
    const { rows } = await db.query(
      'INSERT INTO users (organiser_id, name, email, password_hash, role) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.user.orgId, name, email, hash, r]);
    res.status(201).json({ member: shape.member(rows[0], req.user.id) });
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'This email is already a member.', 'email');
    throw e;
  }
}));

async function target(req) {
  const id = parseInt(req.params.id, 10);
  const { rows } = await db.query('SELECT * FROM users WHERE id = $1 AND organiser_id = $2', [id, req.user.orgId]);
  if (!rows[0]) throw new HttpError(404, 'Member not found.');
  return rows[0];
}

router.patch('/team/:id', wrap(async (req, res) => {
  const m = await target(req);
  const b = req.body || {};
  if (m.id === req.user.id) throw new HttpError(400, 'You cannot change your own role or disable yourself.');
  const sets = [], vals = [];
  if ('active' in b) { vals.push(v.bool(b.active, 'active')); sets.push(`is_active = $${vals.length}`); }
  if ('role' in b) { vals.push(role(b.role)); sets.push(`role = $${vals.length}`); }
  if (!sets.length) throw new HttpError(400, 'Nothing to update.');
  vals.push(m.id);
  const { rows } = await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
  res.json({ member: shape.member(rows[0], req.user.id) });
}));

router.post('/team/:id/password', wrap(async (req, res) => {
  const m = await target(req);
  const pw = v.password((req.body || {}).password);
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(pw, 10), m.id]);
  res.json({ ok: true });
}));

module.exports = router;
