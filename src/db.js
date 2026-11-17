'use strict';
const { Pool, types } = require('pg');
const config = require('./config');

types.setTypeParser(20, (v) => parseInt(v, 10));    // bigint / count(*)
types.setTypeParser(1700, (v) => parseFloat(v));    // numeric

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.pgSsl ? { rejectUnauthorized: true } : undefined,
  max: 10,
});
pool.on('error', (e) => console.error('[pg] idle client error', e.message));

const query = (text, params) => pool.query(text, params);

async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, tx };
