import { logger } from '../lib/log.js';

/**
 * SEAM STUB — owned by the push build agent. REPLACE this body.
 *
 * Start the APNs / Live-Activity push worker and return a stop function (called
 * on shutdown). Keep the exported name `startPushWorker` and this signature.
 * `server.ts` only calls this when `env.pushEnabled` is true, so the APNs
 * credentials (APNS_KEY_P8 / APNS_KEY_ID / APNS_TEAM_ID) are guaranteed present.
 *
 * Responsibilities (see the locked push plan):
 *   • SQLite token registry (better-sqlite3): devices, activities, subscriptions.
 *     NOTE: add `better-sqlite3` to `onlyBuiltDependencies` + `allowBuilds` in
 *     pnpm-workspace.yaml so its native binary is built on install.
 *   • APNs sender (@parse/node-apn): token-based .p8 ES256 JWT, refreshed ~45m,
 *     HTTP/2 to api.push.apple.com / api.sandbox.push.apple.com routed by the
 *     env stored per token. Payloads: event 'update' / 'end' / 'start'.
 *   • Subscribe to the live hub; map key events (LiveEvent) → Live Activity
 *     `update` (content-state must byte-match LiveContentState) + goal/card
 *     alerts at apns-priority 10; push on EVENTS only (never per-second clock).
 *   • Handle APNs errors: 410/400 delete token, 403 re-sign JWT, 429 backoff.
 */
export function startPushWorker(): () => void {
  // TODO(push-agent): init registry + APNs provider, subscribe to the live hub.
  logger.warn('startPushWorker: stub — push worker not started yet');
  return () => {};
}
