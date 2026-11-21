import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import type { Express } from 'express';

/**
 * Serves the built React panel from the API so the whole product runs as one process.
 * Hashed assets are cached for a year; index.html is never cached so a new deploy shows up immediately.
 */
export function serveWeb(app: Express, distDir: string): void {
  const index = join(distDir, 'index.html');
  app.use(
    express.static(distDir, {
      index: false,
      maxAge: '1y',
      immutable: true,
      setHeaders: (res, path) => {
        if (path.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );
  // Client-side routes (/e/:id, /t/:code, /events...) all resolve to the SPA shell.
  app.use((req, res, next) => {
    const isPage = req.method === 'GET' || req.method === 'HEAD';
    if (!isPage || req.path.startsWith('/api/') || req.path === '/healthz') return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
}

export const hasWebBuild = (distDir: string): boolean => existsSync(join(distDir, 'index.html'));
