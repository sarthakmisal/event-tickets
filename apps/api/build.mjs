// Bundles the API (and the workspace-only @et/shared source) into one file; real dependencies stay external.
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const { dependencies } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
);

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: true,
  external: Object.keys(dependencies).filter((name) => name !== '@et/shared'),
});
