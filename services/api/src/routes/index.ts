import type { Hono } from 'hono';
import { logger } from '../lib/log.js';

/**
 * SEAM STUB — owned by the REST / proxy build agent. REPLACE this body.
 *
 * Mount every REST route group onto `app` here (keep the exported name
 * `registerRoutes` and this signature — `server.ts` calls it). Suggested layout,
 * all under the `/v1` prefix and keyed by ESPN league slug `:league`:
 *
 *   GET  /v1/leagues                        → LeagueRef[]
 *   GET  /v1/:league/scoreboard             → Scoreboard          (?dates=YYYYMMDD)
 *   GET  /v1/:league/matches/upcoming       → MatchSummary[]
 *   GET  /v1/:league/matches/:id            → MatchDetail
 *   GET  /v1/:league/matches/:id/stream     → SSE  (LiveMessage frames)
 *   GET  /v1/:league/standings              → Standings           (?season=YYYY)
 *   GET  /v1/:league/bracket                → Bracket             (?season=YYYY)
 *   GET  /v1/:league/teams                  → Team[]
 *   GET  /v1/:league/teams/:id              → TeamDetail
 *   GET  /v1/:league/news                   → NewsItem[]
 *   POST /v1/push/register                  → { ok }              (Bearer API_TOKEN)
 *   POST /v1/push/unregister                → { ok }              (Bearer API_TOKEN)
 *   POST /v1/push/heartbeat                 → { ok }              (Bearer API_TOKEN)
 *
 * Add your route modules under src/routes/ and register them here, e.g.
 *   app.route('/v1', scoreboardRoutes);
 *
 * Every handler MUST validate its normalized output against the contract in
 * src/contract/schema.ts (`XSchema.parse(...)`) before responding, and add a
 * short-TTL cache in front of the upstream ESPN fetchers.
 */
export function registerRoutes(app: Hono): void {
  // TODO(routes-agent): mount route groups. Until then only /health is served.
  void app;
  logger.warn('registerRoutes: stub — no REST routes mounted yet');
}
