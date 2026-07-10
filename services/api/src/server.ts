import { serve, type ServerType } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Server as HttpServer } from 'node:http';

import { env } from './config/env.js';
import { logger } from './lib/log.js';
import { registerRoutes } from './routes/index.js';
import { attachWebSocket } from './live/ws.js';
import { startLivePoller } from './live/poller.js';
import { startPushWorker } from './push/worker.js';

// ── App ──────────────────────────────────────────────────────────────────────
const app = new Hono();

// The app calls this API cross-origin (Expo web + native). Allow all origins;
// the push endpoints are additionally protected by the Bearer API_TOKEN.
app.use('*', cors());

// Lightweight structured request log.
app.use('*', async (c, next) => {
  const started = Date.now();
  await next();
  logger.info(
    { method: c.req.method, path: c.req.path, status: c.res.status, ms: Date.now() - started },
    'request',
  );
});

app.get('/health', (c) =>
  c.json({
    ok: true,
    service: '@matchcenter/api',
    uptime: process.uptime(),
    pushEnabled: env.pushEnabled,
  }),
);

// REST route groups — mounted by the routes/proxy build agent.
registerRoutes(app);

// ── HTTP server ────────────────────────────────────────────────────────────
const server: ServerType = serve(
  { fetch: app.fetch, port: env.PORT, hostname: '0.0.0.0' },
  (info) => logger.info({ port: info.port }, `@matchcenter/api listening on :${info.port}`),
);

// ── Live transports + ingestion — owned by the live build agent ──────────────
// The WebSocket server shares this http server; the SSE routes are wired up in
// registerRoutes and read from the same live hub the poller feeds.
attachWebSocket(server as unknown as HttpServer);
const stopPoller = startLivePoller();

// ── Push worker — only when APNs credentials are configured ──────────────────
let stopPush: (() => void) | undefined;
if (env.pushEnabled) {
  stopPush = startPushWorker();
  logger.info({ apnsEnv: env.APNS_ENV, bundleId: env.APNS_BUNDLE_ID }, 'push worker enabled');
} else {
  logger.warn(
    'push disabled — set APNS_KEY_P8 / APNS_KEY_ID / APNS_TEAM_ID to enable background Live Activities',
  );
}

// ── Graceful shutdown (systemd sends SIGTERM) ────────────────────────────────
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  try {
    stopPoller();
  } catch (err) {
    logger.error({ err }, 'stopPoller failed');
  }
  try {
    stopPush?.();
  } catch (err) {
    logger.error({ err }, 'stopPush failed');
  }
  server.close(() => process.exit(0));
  // Safety net if a socket refuses to close.
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app, server };
