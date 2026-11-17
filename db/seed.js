'use strict';
/* Demo data matching the panel screenshots. Passwords come from env or are generated and printed once. */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool, tx } = require('../src/db');

const pw = (name) => process.env[name] || crypto.randomBytes(9).toString('base64url');

(async () => {
  const creds = { admin: pw('SEED_ADMIN_PASSWORD'), vishal: pw('SEED_STAFF_PASSWORD'), sarthak: pw('SEED_STAFF_PASSWORD_2') };
  await tx(async (c) => {
    const ex = await c.query("SELECT 1 FROM users WHERE lower(email) = 'jivan@gmail.com'");
    if (ex.rowCount) { console.log('Seed data already present. Nothing to do.'); return; }
    const org = (await c.query("INSERT INTO organisers (name, fee_percent, wa_number, wa_connected) VALUES ('Jivan Mhaske', 0, '+91 97302 03351', true) RETURNING id")).rows[0].id;
    const user = async (name, email, role, active, last, password) => (await c.query(
      'INSERT INTO users (organiser_id,name,email,password_hash,role,is_active,last_login_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [org, name, email, await bcrypt.hash(password, 10), role, active, last])).rows[0].id;
    await user('jivan', 'jivan@gmail.com', 'admin', true, '2026-11-14T10:17:00+05:30', creds.admin);
    const sarthak = await user('Sarthak', 'sarthak@gmail.com', 'staff', false, '2026-10-14T00:58:00+05:30', creds.sarthak);
    const vishal = await user('vishal', 'vishal@gmail.com', 'staff', true, '2026-10-06T22:55:00+05:30', creds.vishal);
    void sarthak;
    const ev = async (slug, name, venue, at, price, cap) => (await c.query(
      'INSERT INTO events (organiser_id,slug,name,venue,starts_at,price,capacity,max_per_booking) VALUES ($1,$2,$3,$4,$5,$6,$7,10) RETURNING id',
      [org, slug, name, venue, at, price, cap])).rows[0].id;
    const diwali = await ev('diwali-night', 'Diwali night', 'NGR', '2026-10-26T20:09:00+05:30', 1, 0);
    const wedding = await ev('wedding', 'Wedding', 'Green Palace', '2026-10-16T23:31:00+05:30', 100, 0);
    await ev('navaratri', 'Navaratri', 'Ahilyanagar', '2026-10-14T18:00:00+05:30', 1, 0);
    const jagran = await ev('jagrangondhal', 'Jagrangondhal', 'Sglikde', '2026-10-09T23:29:00+05:30', 1000, 5);
    const bk = (evId, code, name, phone, amt, status, at, checked, by) => c.query(
      `INSERT INTO bookings (event_id,code,customer_name,phone,quantity,amount,status,created_at,paid_at,checked_in_at,checked_in_by)
       VALUES ($1,$2,$3,$4,1,$5,$6,$7, CASE WHEN $6='paid' THEN $7::timestamptz END, $8, $9)`,
      [evId, code, name, phone, amt, status, at, checked, by]);
    await bk(diwali, 'VSHL-4K7Q', 'Vishal', '9975608006', 1, 'paid', '2026-10-25T19:12:00+05:30', '2026-10-26T20:41:00+05:30', vishal);
    await bk(diwali, 'JVNM-9M2X', 'Jivan Mhaske', '9975608006', 1, 'paid', '2026-10-25T18:47:00+05:30', null, null);
    await bk(wedding, 'PRNV-3PA8', 'Pranav Kapure', '8468846479', 100, 'pending', '2026-10-14T21:05:00+05:30', null, null);
    const pend = ['2026-10-10T17:20:00+05:30', '2026-10-10T16:58:00+05:30', '2026-10-09T22:03:00+05:30', '2026-10-09T21:40:00+05:30', '2026-10-08T20:15:00+05:30'];
    for (let i = 0; i < pend.length; i++) await bk(jagran, `JGRN-${71 + i}TB`.replace(/(\d)TB/, '$1T9'), 'Jivan Mhaske', '9975608006', 1000, 'pending', pend[i], null, null);
  });
  console.log('Seeded. Sign-in credentials (shown once):');
  console.log('  jivan@gmail.com   (admin)      ', creds.admin);
  console.log('  vishal@gmail.com  (gate staff) ', creds.vishal);
  console.log('  sarthak@gmail.com (disabled)   ', creds.sarthak);
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
