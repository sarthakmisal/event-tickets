import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database, Db } from './schema';

// Return COUNT/SUM (bigint) as numbers; our values stay far below 2^53.
pg.types.setTypeParser(20, (v) => Number(v));

export function createDb(connectionString: string): Db {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    ssl: /sslmode=require|neon\.tech/.test(connectionString)
      ? { rejectUnauthorized: true }
      : undefined,
    // Serverless Postgres (Neon) drops idle connections; retire ours first and keep the rest alive.
    idleTimeoutMillis: 10_000,
    keepAlive: true,
  });
  // An idle client being reset must not crash the process; the pool discards it and reconnects on demand.
  pool.on('error', (err) => {
    console.warn(
      JSON.stringify({ level: 40, msg: 'idle database connection dropped', err: err.message }),
    );
  });
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}
