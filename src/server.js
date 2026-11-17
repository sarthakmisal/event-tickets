'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const config = require('./config');
const { HttpError } = require('./errors');
const { requireXhr } = require('./auth');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        styleSrcAttr: ["'unsafe-inline'"],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
  }));
  app.use(cookieParser());
  app.use(express.json({ limit: '100kb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

  app.get('/healthz', (_req, res) => res.json({ ok: true }));

  const api = express.Router();
  api.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  api.use(requireXhr);
  api.use(require('./routes/auth'));
  api.use(require('./routes/public'));
  api.use(require('./routes/webhooks'));
  api.use(require('./routes/scan'));
  api.use(require('./routes/settings'));
  api.use(require('./routes/team'));
  api.use(require('./routes/admin'));
  api.use((_req, _res, next) => next(new HttpError(404, 'Not found.')));
  app.use('/api', api);

  app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'], maxAge: config.prod ? '1h' : 0 }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, field: err.field });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
    console.error('[error]', err);
    res.status(500).json({ error: 'Something went wrong on our side. Try again.' });
  });
  return app;
}

if (require.main === module) {
  createApp().listen(config.port, () => console.log(`Event Tickets listening on :${config.port}`));
}
module.exports = { createApp };
