import { logger } from '../lib/log.js';

/**
 * SEAM STUB — owned by the live-hub build agent. REPLACE this body.
 *
 * Start the live ingestion loop and return a stop function (called on shutdown).
 * Keep the exported name `startLivePoller` and this signature.
 *
 * Responsibilities:
 *   • Port the Fastcast protocol from artifacts/football-world-cup/lib/fastcast.ts
 *     (handshake → wss → {op:'C'} → subscribe topic → inflate JSON-Patch deltas).
 *     Re-handshake + re-subscribe every active topic on reconnect (token is
 *     short-lived); heartbeat watchdog + exponential backoff.
 *   • REST fallback: when Fastcast is silent past a timeout, poll the ESPN
 *     summary endpoint every env.POLL_MS (circuit breaker).
 *   • Materialize per-match state idempotently (dedupe by ESPN play id) and emit
 *     LiveScoreUpdate / LiveEvent / LiveContentState frames into the shared hub
 *     (consumed by ws.ts, the SSE route, and the push worker).
 */
export function startLivePoller(): () => void {
  // TODO(live-agent): connect Fastcast + REST fallback, feed the hub.
  logger.warn('startLivePoller: stub — live ingestion not started yet');
  return () => {};
}
