'use strict';
const router = require('express').Router();
const db = require('../db');
const v = require('../validate');
const shape = require('../shape');
const wa = require('../whatsapp');
const { encrypt } = require('../crypto');
const config = require('../config');
const { requireAuth, requireAdmin } = require('../auth');
const { HttpError, wrap } = require('../errors');

router.use(requireAuth, requireAdmin);
const load = async (orgId) => (await db.query('SELECT * FROM organisers WHERE id = $1', [orgId])).rows[0];
const base = (req) => config.publicUrl || `${req.protocol}://${req.get('host')}`;

router.get('/settings', wrap(async (req, res) => res.json({ settings: shape.settings(await load(req.user.orgId)) })));

router.put('/settings/delivery', wrap(async (req, res) => {
  const b = req.body || {};
  const msg = v.str(b.msg, 'msg', { max: 1000, label: 'a message' });
  const bad = wa.unknownVars(msg);
  if (bad.length) throw new HttpError(400, `Unknown field ${bad.join(', ')}. Use the field buttons above the message.`, 'msg');
  await db.query('UPDATE organisers SET wa_auto_send=$1, wa_attach_image=$2, wa_message=$3 WHERE id=$4',
    [v.bool(b.autoSend, 'autoSend'), v.bool(b.attachImg, 'attachImg'), msg, req.user.orgId]);
  res.json({ settings: shape.settings(await load(req.user.orgId)) });
}));

router.put('/settings/contact', wrap(async (req, res) => {
  const b = req.body || {};
  const phone = v.optStr(b.phone, 'phone', 20);
  if (phone && !/^[+\d][\d\s-]{7,15}$/.test(phone)) throw new HttpError(400, 'Enter a valid phone number.', 'phone');
  const email = b.email ? v.email(b.email) : '';
  const gstin = v.optStr(b.gstin, 'gstin', 15).toUpperCase();
  if (gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(gstin)) throw new HttpError(400, 'GSTIN has 15 characters, like 22AAAAA0000A1Z5.', 'gstin');
  await db.query('UPDATE organisers SET contact_address=$1, contact_phone=$2, contact_email=$3, gstin=$4 WHERE id=$5',
    [v.optStr(b.address, 'address', 300), phone, email, gstin, req.user.orgId]);
  res.json({ settings: shape.settings(await load(req.user.orgId)) });
}));

router.put('/settings/api-key', wrap(async (req, res) => {
  const key = v.str((req.body || {}).apiKey, 'apiKey', { max: 500, label: 'your API key' });
  await db.query('UPDATE organisers SET wa_api_key_enc = $1 WHERE id = $2', [encrypt(key), req.user.orgId]);
  res.json({ settings: shape.settings(await load(req.user.orgId)) });
}));

router.get('/settings/wa-status', wrap(async (req, res) => {
  // Connection state is stored per organiser; replace with a live provider status call if kwskit exposes one.
  const o = await load(req.user.orgId);
  res.json({ connected: o.wa_connected, number: o.wa_number || '' });
}));

router.post('/settings/test-message', wrap(async (req, res) => {
  const phone = v.phone10((req.body || {}).phone);
  await wa.sendTest(req.user.orgId, phone, base(req));
  res.status(202).json({ ok: true, to: '+91 ' + phone });
}));

module.exports = router;
