'use strict';
/*
 * WhatsApp delivery adapter.
 * The panel stores the organiser's kwskit API key (encrypted) and renders the message template.
 * The HTTP call below is a thin adapter: adjust the path/body to match your kwskit account's docs.
 */
const config = require('./config');
const db = require('./db');
const { decrypt } = require('./crypto');
const { HttpError } = require('./errors');

const VARS = ['name', 'event', 'organiser', 'ticketCode', 'bookingCode', 'quantity', 'amount', 'date', 'venue', 'ticketUrl'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(d) {
  const p = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true, day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g('day')} ${MONTHS[Number(g('month')) - 1]} ${g('year')}, ${g('hour')}:${g('minute')} ${g('dayPeriod').toLowerCase()}`;
}
function render(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
function unknownVars(template) {
  const bad = new Set();
  template.replace(/\{\{(\w+)\}\}/g, (m, k) => { if (!VARS.includes(k)) bad.add(m); return m; });
  return [...bad];
}
const inr = (n) => '₹' + Number(n).toLocaleString('en-IN');

function publicBase(req) { return config.publicUrl || `${req.protocol}://${req.get('host')}`; }

async function post(apiKey, path, body) {
  if (!config.kwskitBaseUrl) throw new HttpError(503, 'WhatsApp provider is not configured on the server. Set KWSKIT_BASE_URL.');
  const res = await fetch(config.kwskitBaseUrl + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new HttpError(502, `WhatsApp provider rejected the message (HTTP ${res.status}).`);
  return res.json().catch(() => ({}));
}

async function orgCreds(orgId) {
  const { rows } = await db.query('SELECT name, wa_number, wa_api_key_enc, wa_attach_image, wa_message FROM organisers WHERE id=$1', [orgId]);
  const o = rows[0];
  if (!o.wa_api_key_enc) throw new HttpError(400, 'Save your kwskit API key first.');
  return { org: o, apiKey: decrypt(o.wa_api_key_enc) };
}

/** Send a rendered ticket to the customer of a paid booking. */
async function sendTicket(bookingCode, base) {
  const { rows } = await db.query(
    `SELECT b.*, e.name AS ev_name, e.venue, e.starts_at, e.organiser_id
       FROM bookings b JOIN events e ON e.id = b.event_id WHERE b.code = $1 AND b.status = 'paid'`, [bookingCode]);
  const b = rows[0];
  if (!b) return;
  const { org, apiKey } = await orgCreds(b.organiser_id);
  const ticketUrl = `${base}/t/${b.code}`;
  const text = render(org.wa_message, {
    name: b.customer_name, event: b.ev_name, organiser: org.name, ticketCode: b.code, bookingCode: b.code,
    quantity: b.quantity, amount: inr(b.amount), date: fmtDate(b.starts_at), venue: b.venue, ticketUrl,
  });
  await post(apiKey, '/messages', {
    from: org.wa_number, to: '91' + b.phone, text,
    imageUrl: org.wa_attach_image ? `${base}/api/public/tickets/${b.code}/qr.png` : undefined,
  });
}

async function sendTest(orgId, phone10, base) {
  const { org, apiKey } = await orgCreds(orgId);
  const text = render(org.wa_message, {
    name: 'Test guest', event: 'Sample event', organiser: org.name, ticketCode: 'TEST-0000', bookingCode: 'TEST-0000',
    quantity: 1, amount: inr(1), date: fmtDate(new Date()), venue: 'Sample venue', ticketUrl: `${base}/t/TEST-0000`,
  });
  await post(apiKey, '/messages', { from: org.wa_number, to: '91' + phone10, text });
}

module.exports = { VARS, unknownVars, sendTicket, sendTest };
