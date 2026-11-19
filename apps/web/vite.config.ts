import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700&family=Manrope:wght@500;600;700;800&display=swap" rel="stylesheet">';

// `vite build --mode demo` produces ONE self-contained html file that runs on an in-memory API (no backend).
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  return {
    plugins: [
      react(),
      {
        name: 'fonts',
        transformIndexHtml: (html: string) =>
          demo ? html : html.replace('</head>', `${FONTS}</head>`),
      },
      ...(demo ? [viteSingleFile()] : []),
    ],
    define: { __DEMO__: JSON.stringify(demo) },
    build: { outDir: demo ? 'dist-demo' : 'dist', target: 'es2022' },
    server: {
      port: 5173,
      // 127.0.0.1 (not localhost): on Windows/Node 18+ localhost can resolve to ::1 and the proxy fails.
      proxy: { '/api': process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3000' },
    },
  };
});
