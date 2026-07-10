import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer, type RawData } from 'ws';

import { LiveSubscribeSchema, type LiveMessage } from '../contract/schema.js';
import { log } from '../lib/log.js';
import { hub } from './hub.js';

/*
 * ── WebSocket read-side of the live hub ──────────────────────────────────────
 *
 * Shares the process's single http server (no extra port). Client → server
 * control frames are `LiveSubscribe { action, league, matchId }`; server →
 * client frames are the SAME `LiveMessage` JSON objects the SSE route sends —
 * the `type` field discriminates (no SSE-style event name on WS).
 *
 * On the first `subscribe` for a match we send `hello` + the current `state`
 * snapshot, then fan out `score` / `event` / `state` for that match; `ping`
 * every ~25s. Per-match state is freed by the hub/poller when the last
 * subscriber drops (or the match ends).
 */

const logger = log('live-ws');
const PING_MS = 25_000;
// Accept the documented `/live` upgrade plus the versioned `/v1/live/ws` alias.
const UPGRADE_PATHS = new Set(['/live', '/v1/live/ws']);

function nowIso(): string {
  return new Date().toISOString();
}

function pathOf(req: IncomingMessage): string {
  try {
    return new URL(req.url ?? '/', 'http://localhost').pathname;
  } catch {
    return req.url ?? '/';
  }
}

export function attachWebSocket(server: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!UPGRADE_PATHS.has(pathOf(req))) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws: WebSocket) => onConnection(ws));
  logger.info({ paths: [...UPGRADE_PATHS] }, 'websocket hub attached');
}

function onConnection(ws: WebSocket): void {
  const send = (msg: LiveMessage): void => {
    if (ws.readyState !== ws.OPEN) return;
    try {
      ws.send(JSON.stringify(msg));
    } catch (err) {
      logger.debug({ err }, 'ws send failed');
    }
  };

  const sub = hub.subscribe(send);

  // Connection-level ack, then per-subscribe acks below.
  send({ type: 'hello', serverTime: nowIso() });

  const ping = setInterval(() => send({ type: 'ping', serverTime: nowIso() }), PING_MS);
  ping.unref?.();

  ws.on('message', (raw: RawData) => {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const parsed = LiveSubscribeSchema.safeParse(parsedJson);
    if (!parsed.success) return;
    const { action, league, matchId } = parsed.data;

    if (action === 'subscribe') {
      sub.addMatch(league, matchId);
      // hello + current snapshot for this match (may arrive shortly after the
      // poller's first fetch if we have no snapshot cached yet).
      send({ type: 'hello', matchId, serverTime: nowIso() });
      const snap = hub.stateMessage(league, matchId);
      if (snap) send(snap);
    } else {
      sub.removeMatch(league, matchId);
    }
  });

  const cleanup = (): void => {
    clearInterval(ping);
    sub.close();
  };
  ws.on('close', cleanup);
  ws.on('error', (err) => {
    logger.debug({ err }, 'ws error');
    cleanup();
  });
}
