import type { Hono } from 'hono';

import { log } from '../lib/log.js';
import { registerLeagues } from './leagues.js';
import { registerScoreboard } from './scoreboard.js';
import { registerMatches } from './matches.js';
import { registerStandings } from './standings.js';
import { registerBracket } from './bracket.js';
import { registerTeams } from './teams.js';
import { registerNews } from './news.js';
import { registerPush } from './push.js';
import { registerLiveRoutes } from '../live/sse.js';

/**
 * Mount every read-side REST route group onto `app` (server.ts calls this).
 * All routes live under `/v1` and are keyed by the ESPN league slug `:league`.
 * Each handler validates its normalized output against src/contract/schema.ts
 * and answers upstream failures with a structured 4xx/502 (never an empty body).
 *
 *   GET /v1/leagues                    → LeagueRef[]
 *   GET /v1/:league/scoreboard         → Scoreboard      (?dates=YYYYMMDD[-YYYYMMDD])
 *   GET /v1/:league/matches/upcoming   → MatchSummary[]  (?from=YYYYMMDD)
 *   GET /v1/:league/matches/:id        → MatchDetail
 *   GET /v1/:league/standings          → Standings       (?season=YYYY)
 *   GET /v1/:league/bracket            → Bracket         (?season=YYYY)
 *   GET /v1/:league/teams              → Team[]
 *   GET /v1/:league/teams/:id          → TeamDetail
 *   GET /v1/:league/news               → NewsItem[]
 *
 * The live stream (GET /v1/:league/matches/:id/stream, WS /live) and the push
 * endpoints are mounted by the live-hub and push agents respectively.
 */
export function registerRoutes(app: Hono): void {
  registerLeagues(app);
  registerScoreboard(app);
  registerMatches(app);
  registerStandings(app);
  registerBracket(app);
  registerTeams(app);
  registerNews(app);

  // Live stream (SSE) + push endpoints share the same app.
  registerLiveRoutes(app);
  registerPush(app);

  log('routes').info('REST + SSE + push routes mounted under /v1');
}
