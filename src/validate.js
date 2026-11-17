'use strict';
const { HttpError } = require('./errors');

const str = (v, field, { min = 1, max = 200, label } = {}) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length < min) throw new HttpError(400, `Enter ${label || field}.`, field);
  if (s.length > max) throw new HttpError(400, `${label || field} is too long (max ${max} characters).`, field);
  return s;
};
const optStr = (v, field, max = 300) => {
  if (v == null || v === '') return '';
  if (typeof v !== 'string') throw new HttpError(400, `Invalid ${field}.`, field);
  const s = v.trim();
  if (s.length > max) throw new HttpError(400, `${field} is too long (max ${max} characters).`, field);
  return s;
};
const int = (v, field, { min = 0, max = 1e9, label } = {}) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${label || field} must be a whole number between ${min} and ${max}.`, field);
  return n;
};
const money = (v, field, label) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1e7) throw new HttpError(400, `${label || field} must be a valid amount.`, field);
  return Math.round(n * 100) / 100;
};
const bool = (v, field) => {
  if (typeof v !== 'boolean') throw new HttpError(400, `Invalid ${field}.`, field);
  return v;
};
const email = (v, field = 'email') => {
  const s = str(v, field, { max: 254, label: 'an email' }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new HttpError(400, 'Enter a valid email.', field);
  return s;
};
const phone10 = (v, field = 'phone') => {
  const d = String(v == null ? '' : v).replace(/\D/g, '').slice(-10);
  if (d.length !== 10 || !/^[6-9]/.test(d)) throw new HttpError(400, 'Enter a valid 10-digit mobile number.', field);
  return d;
};
const date = (v, field = 'date') => {
  const d = new Date(v);
  if (typeof v !== 'string' || isNaN(d)) throw new HttpError(400, 'Pick a valid date and time.', field);
  return d;
};
const slug = (v, field = 'slug') => {
  const s = str(v, field, { max: 40, label: 'a booking link' });
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)) throw new HttpError(400, 'Use lowercase letters, numbers and hyphens only.', field);
  if (['new', 'api', 'admin', 'static', 'public'].includes(s)) throw new HttpError(400, 'This link is reserved. Try another.', field);
  return s;
};
const password = (v, field = 'password') => {
  if (typeof v !== 'string' || v.length < 8) throw new HttpError(400, 'Use at least 8 characters.', field);
  if (v.length > 200) throw new HttpError(400, 'Password is too long.', field);
  return v;
};
module.exports = { str, optStr, int, money, bool, email, phone10, date, slug, password };
