'use strict';
require('dotenv').config(); // loads .env from the folder you run the command in
const prod = process.env.NODE_ENV === 'production';

function required(name, devFallback) {
  const v = process.env[name];
  if (v) return v;
  if (prod) throw new Error(`Missing required env var ${name}`);
  console.warn(`[config] ${name} not set, using an insecure development value`);
  return devFallback;
}

module.exports = {
  prod,
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: required('DATABASE_URL', 'postgres://evt:evt@localhost:5432/event_tickets'),
  appSecret: required('APP_SECRET', 'dev-only-secret-change-me-dev-only-secret'),
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/$/, ''),
  paymentWebhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || '',
  kwskitBaseUrl: (process.env.KWSKIT_BASE_URL || '').replace(/\/$/, ''),
  pgSsl: process.env.PGSSL === 'require',
};
if (prod && module.exports.appSecret.length < 32) throw new Error('APP_SECRET must be at least 32 characters');
