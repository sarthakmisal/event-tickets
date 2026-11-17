'use strict';
/* Row -> API shapes. Events are addressed by slug in the API (the booking link). */
const feeLabel = (p) => (Number(p) === 0 ? 'No commission' : `${Number(p)}% platform fee`);

const event = (r) => ({
  id: r.slug, name: r.name, venue: r.venue, date: r.starts_at, price: r.price, cap: r.capacity,
  max: r.max_per_booking, askNames: r.ask_names, open: r.is_open, desc: r.description,
  stats: { sold: r.sold || 0, checked: r.checked || 0, sales: r.sales || 0 },
});
const booking = (r) => ({
  code: r.code, ev: r.slug, name: r.customer_name, phone: r.phone, qty: r.quantity, amount: r.amount,
  status: r.status, at: r.created_at, checked: !!r.checked_in_at, checkedAt: r.checked_in_at,
  by: r.checked_in_by_name || null, attendees: r.attendee_names || [],
});
const member = (r, meId) => ({
  id: r.id, name: r.name, email: r.email, role: r.role, active: r.is_active, last: r.last_login_at, you: r.id === meId,
});
const settings = (o) => ({
  waConnected: o.wa_connected, waNumber: o.wa_number || '', apiKeySaved: !!o.wa_api_key_enc,
  autoSend: o.wa_auto_send, attachImg: o.wa_attach_image, msg: o.wa_message,
  address: o.contact_address, phone: o.contact_phone, email: o.contact_email, gstin: o.gstin,
});
module.exports = { event, booking, member, settings, feeLabel };
