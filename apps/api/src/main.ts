import { fileURLToPath } from 'node:url';
import { buildApp } from './app';
import { loadEnv } from './config/env';
import { createDb } from './db/client';
import { startJobs } from './jobs/scheduler';
import { createLogger } from './shared/logger';
import { hasWebBuild } from './shared/web';

const env = loadEnv();
const log = createLogger(env.NODE_ENV === 'production' ? 'info' : 'debug');
const db = createDb(env.DATABASE_URL);
// apps/web/dist sits two levels up from both src/main.ts and dist/main.js.
const webDir = fileURLToPath(new URL('../../web/dist', import.meta.url));
const webDist = hasWebBuild(webDir) ? webDir : undefined;
const { app, jobs } = buildApp({ env, db, log, webDist });

const server = app.listen(env.PORT, () =>
  log.info(`Listening on :${env.PORT}${webDist ? ' (API + web panel)' : ' (API only)'}`),
);
const stopJobs = env.ENABLE_JOBS ? startJobs(jobs, log) : () => undefined;

async function shutdown(signal: string) {
  log.info({ signal }, 'shutting down');
  stopJobs();
  server.close(async () => {
    await db.destroy();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
