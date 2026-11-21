// `npm start`
//   development (default): API (:3000) + web panel (:5173) with live reload. Ctrl+C stops both.
//   production (NODE_ENV=production, or `npm run start:prod`): applies DB migrations, then runs the
//   built API, which also serves the built web panel — one process, one URL. Run `npm run build` first.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const production = process.env.NODE_ENV === 'production' || process.argv.includes('--prod');

if (production) {
  for (const file of [
    'apps/api/dist/main.js',
    'apps/api/dist/migrate.js',
    'apps/web/dist/index.html',
  ]) {
    if (!existsSync(file)) {
      console.error(`Missing ${file}. Run "npm run build" first.`);
      process.exit(1);
    }
  }
  const node = (file) => ['--env-file-if-exists=.env', file];
  const env = { ...process.env, NODE_ENV: 'production' };
  const migrate = spawnSync(process.execPath, node('apps/api/dist/migrate.js'), {
    stdio: 'inherit',
    env,
  });
  if (migrate.status !== 0) process.exit(migrate.status ?? 1);
  const server = spawn(process.execPath, node('apps/api/dist/main.js'), { stdio: 'inherit', env });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
  server.on('exit', (code) => process.exit(code ?? 0));
} else {
  const children = ['dev:api', 'dev:web'].map((script) =>
    spawn('npm', ['run', script], { stdio: 'inherit', shell: true }),
  );
  let stopping = false;
  const stop = (code = 0) => {
    if (stopping) return;
    stopping = true;
    for (const child of children) child.kill();
    process.exit(code);
  };
  for (const child of children) child.on('exit', (code) => stop(code ?? 0));
  process.on('SIGINT', () => stop());
  process.on('SIGTERM', () => stop());
}
