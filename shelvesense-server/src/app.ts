import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { sessionContext } from './middleware/sessionContext.js';
import { errorHandler } from './middleware/errorHandler.js';
import { profileRouter } from './routes/profileParse.js';
import { analyzeLabelRouter } from './routes/analyzeLabel.js';
import { alternativesRouter } from './routes/alternatives.js';
import { cartUpdateRouter } from './routes/cartUpdate.js';
import { mealPlanRouter } from './routes/mealPlan.js';
import { speechRouter } from './routes/speech.js';

export function createApp(): express.Express {
  const app = express();

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(
    cors({
      origin: config.corsOrigins && config.corsOrigins.length > 0 ? config.corsOrigins : true,
      exposedHeaders: ['x-shelvesense-session'],
    }),
  );

  app.use(express.json({ limit: '18mb' }));

  app.use(express.static(path.join(process.cwd(), 'public')));

  app.use(
    pinoHttp({
      logger,
      autoLogging: true,
      customLogLevel: (_req, res, err) => {
        if (res.statusCode >= 500 || err) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'shelvesense-backend' });
  });

  app.get('/', (_req, res) => {
    const port = config.port;
    res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>ShelfSense backend</title>
</head>
<body style="font-family: system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5;">
  <h1>ShelfSense backend is running</h1>
  <p>This process is an <strong>API server</strong> for the Spectacles lens. There is no full web app at the root URL.</p>
  <ul>
    <li><a href="/demo.html"><strong>Try speech + text</strong> (local demo)</a> — uses <code>/api/speech</code></li>
    <li><a href="/health"><code>/health</code></a> — quick JSON check</li>
    <li><a href="/api/profile"><code>/api/profile</code></a> — GET session profile (JSON)</li>
  </ul>
  <p>API routes live under <code>/api/...</code>. See <code>shelvesense-server/README.md</code> for curl examples.</p>
  <p style="color:#555;font-size:0.9rem;">Listening on port <strong>${port}</strong>.</p>
</body>
</html>`);
  });

  const api = express.Router();
  api.use(sessionContext);

  api.use('/profile', profileRouter);
  api.use('/analyze-label', analyzeLabelRouter);
  api.use('/alternatives', alternativesRouter);
  api.use('/cart/update', cartUpdateRouter);
  api.use('/meal-plan', mealPlanRouter);
  api.use('/speech', speechRouter);

  app.use('/api', api);

  app.use(errorHandler);

  return app;
}
