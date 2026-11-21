// Bundles the API (and the workspace-only @et/shared source) into one file; real dependencies stay external.
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { build } from 'esbuild';

const { dependencies } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
);

await build({
  entryPoints: { main: 'src/main.ts', migrate: 'src/db/migrate.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: true,
  external: Object.keys(dependencies).filter((name) => name !== '@et/shared'),
});
