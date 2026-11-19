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
  });
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}
