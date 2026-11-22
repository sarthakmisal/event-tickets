import { pathToFileURL } from 'node:url';
import { Migrator } from 'kysely';
import type { Db } from './schema';
import * as init from './migrations/001_init';
import * as whatsappSessions from './migrations/002_whatsapp_sessions';

export function createMigrator(db: Db): Migrator {
  return new Migrator({
    db,
    provider: {
      getMigrations: async () => ({ '001_init': init, '002_whatsapp_sessions': whatsappSessions }),
    },
  });
}

export async function migrateToLatest(db: Db): Promise<string[]> {
  const { error, results } = await createMigrator(db).migrateToLatest();
  if (error) throw error;
  return (results ?? []).filter((r) => r.status === 'Success').map((r) => r.migrationName);
}

// CLI: `npm run db:migrate`
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { loadEnv } = await import('../config/env');
  const { createDb } = await import('./client');
  const db = createDb(loadEnv().DATABASE_URL);
  try {
    const applied = await migrateToLatest(db);
    console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date');
  } finally {
    await db.destroy();
  }
}
