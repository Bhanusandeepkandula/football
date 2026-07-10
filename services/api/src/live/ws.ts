import type { Server as HttpServer } from 'node:http';
import { logger } from '../lib/log.js';

/**
 * SEAM STUB — owned by the live-hub build agent. REPLACE this body.
 *
 * Attach a `ws` WebSocketServer to the shared http `server` (path e.g. '/live')
 * and drive it from the live hub the poller feeds. Keep the exported name
 * `attachWebSocket` and this signature — `server.ts` calls it.
 *
 * Protocol (see src/contract/schema.ts):
 *   • client → server: LiveSubscribe  { action, league, matchId }
 *   • server → client: LiveMessage    (hello | score | event | state | ping)
 *
 * Subscribe the match's Fastcast topic on first subscriber; unsubscribe + free
 * state when subscribers hit 0 or the match ends. Send a `hello` + current
 * `state` snapshot on connect, and a `ping` heartbeat on an interval.
 */
export function attachWebSocket(server: HttpServer): void {
  // TODO(live-agent): new WebSocketServer({ server, path: '/live' }) + fan-out.
  void server;
  logger.warn('attachWebSocket: stub — WS hub not attached yet');
}
