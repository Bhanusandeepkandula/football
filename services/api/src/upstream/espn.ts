// ─── ESPN upstream client (raw fetch + cache, league-aware) ──────────────────
//
// This module is the ONE place that knows how to talk to ESPN. It ports the
// endpoint knowledge that used to live on-device (artifacts/football-world-cup/
// lib/espn.ts + hooks/useWorldCup, useMatchDetail, useTeamDetail, useFootballNews)
// into a server-side proxy layer. Every function here just fetches the RAW ESPN
// payload and returns it (lightly guarded as a JSON object / array). Normalizing
// those raw shapes into the stable contract (src/contract/schema.ts) and running
// `XSchema.parse(...)` is the routes layer's job — this layer never shapes data
// for a view, it only fetches + caches.
//
// ESPN uses three JSON hosts, all keyed by the same league slug (e.g. 'eng.1',
// 'fifa.world', 'uefa.champions'):
//   • site.api  — public scoreboard / summary / teams / roster / schedule / news
//   • core.api  — per-season resources (team season statistics)
//   • web.api   — the unified standings table (site /standings is empty)
// Plus a few league-agnostic espn.com HTML pages scraped for shot maps, player
// stats and manual commentary, and third-party RSS feeds merged into the news.
//
// ── Endpoint map (host · path · cache TTL) ───────────────────────────────────
//   scoreboard (day)        site   /{slug}/scoreboard[?dates=YYYYMMDD]         10s
//   scoreboard (range/year) site   /{slug}/scoreboard?dates=A-B|YYYY&limit=N   60s
//   summary (match)         site   /{slug}/summary?event={id}                  15s
//   teams (list)            site   /{slug}/teams?limit=100                       1h
//   team                    site   /{slug}/teams/{id}                            5m
//   team roster             site   /{slug}/teams/{id}/roster                     1h
//   team schedule           site   /{slug}/teams/{id}/schedule                   5m
//   team season statistics  core   /{slug}/seasons/{yr}/types/{t}/teams/{id}/…  10m
//   standings               web    /{slug}/standings?season={yr}                10m
//   bracket (2-year scan)   site   /{slug}/scoreboard?dates={yr},{yr+1}         60s
//   league news             site   /{slug}/news                                90s
//   top soccer news         now    now.core.api /v1/sports/news?sport=soccer   90s
//   match/player/commentary www.espn.com HTML pages (scraped, neutral UA)      20s
//   RSS (BBC/Guardian/Sky)  external feeds (espn:false)                        90s
//
// ── Shared helpers (src/lib/http.ts + src/lib/cache.ts) ──────────────────────
// fetchJson / fetchText already handle the AbortController timeout, bounded
// retry with jitter, a browser UA and (for ESPN hosts) an espn.com Origin +
// Referer. `espn` defaults to true, so RSS feeds below pass `{ espn: false }`.
// cached(key, ttlMs, loader, { staleIfError }) does the short-TTL + in-flight
// request coalescing; `staleIfError` is set on the static/slow endpoints so a
// flaky upstream still serves the last-good payload (never on live data, where
// a stale score served as fresh would be wrong).

import { z } from 'zod';
import { env } from '../config/env.js';
import { fetchJson, fetchText } from '../lib/http.js';
import { cached } from '../lib/cache.js';

// ─── Host base builders ──────────────────────────────────────────────────────
// Hosts come from typed env (overridable only if ESPN moves them).

export const siteBase = (slug: string): string => `${env.ESPN_SITE_API}/${slug}`;
export const coreBase = (slug: string): string => `${env.ESPN_CORE_API}/${slug}`;
export const webBase = (slug: string): string => `${env.ESPN_WEB_API}/${slug}`;

// League-agnostic espn.com HTML pages (keyed by gameId only). Scraped for the
// shot map, box-score player stats and manual commentary — data the JSON
// summary endpoint does not expose.
const ESPN_MATCH_PAGE = 'https://www.espn.com/soccer/match/_/gameId';
const ESPN_PLAYER_STATS_PAGE = 'https://www.espn.com/soccer/player-stats/_/gameId';
const ESPN_COMMENTARY_PAGE = 'https://www.espn.com/soccer/commentary/_/gameId';

// espn.com serves these HTML pages to a plain (non-browser) UA, but answers the
// shared http client's desktop-Chrome UA with a 202 bot challenge (empty body).
// So scrape them with a neutral UA and NO espn.com Origin/Referer.
const SCRAPE_UA = 'MatchCenter-API/1.0';
const HTML_PAGE_FETCH = { espn: false, headers: { 'User-Agent': SCRAPE_UA } };

// ESPN's league-agnostic soccer news. The old site `/soccer/news` path is dead
// (404); the `now` content API is the live equivalent.
const ESPN_NOW_NEWS_API = 'https://now.core.api.espn.com/v1/sports/news';

// Third-party football RSS feeds merged into the competition news feed. Server
// side only — the app must not fetch these directly (attribution + ToS live
// here). `source` is a stable id, `category` the display label.
export const NEWS_RSS_FEEDS = [
  { source: 'bbc', category: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/football/rss.xml' },
  { source: 'guardian', category: 'Guardian', url: 'https://www.theguardian.com/football/rss' },
  { source: 'sky', category: 'Sky Sports', url: 'https://www.skysports.com/rss/12040' },
] as const;

// ─── Cache TTLs (ms) ─────────────────────────────────────────────────────────
// Short where scores move (live day / summary / bracket), long where data is
// static within a season (team list / roster). Mirrors the app's old React
// Query staleTimes; the cache coalesces so one upstream fetch serves all users.
const SCOREBOARD_TTL = 10_000; // a single day's fixtures — live-friendly
const SCHEDULE_RANGE_TTL = 60_000; // multi-day / full-year scans (upcoming, bracket)
const SUMMARY_TTL = 15_000; // match centre JSON
const MATCH_PAGE_TTL = 20_000; // heavy espn.com HTML scrapes
const STANDINGS_TTL = 600_000; // league / group tables
const TEAMS_TTL = 3_600_000; // competition team list (static for a season)
const TEAM_TTL = 300_000; // a single team's page data
const ROSTER_TTL = 3_600_000; // squad list (static within a season)
const SCHEDULE_TTL = 300_000; // a team's fixture list
const TEAM_STATS_TTL = 600_000; // core season aggregate statistics
const BRACKET_TTL = 60_000; // knockout scan (poll while a KO match is live)
const NEWS_TTL = 90_000; // competition news feed

// ─── Raw ESPN payload types ──────────────────────────────────────────────────
// `EspnJson` is a permissive JSON object: no `any`, fully indexable so the
// routes normalizer can read any nested field and narrow it. The item
// interfaces below document the raw ESPN shapes so the normalizer can narrow
// the `unknown` list items (e.g. `sb.events.map((e) => e as EspnEvent)`) instead
// of reaching for `any`.

export interface EspnJson {
  [key: string]: unknown;
}

// Scoreboard envelope with the two arrays the normalizer iterates surfaced as
// typed (but element-`unknown`) arrays; all other keys remain via the index.
export interface EspnScoreboard extends EspnJson {
  events: unknown[];
  leagues: unknown[];
}
export interface EspnStandings extends EspnJson {
  children: unknown[];
}
export interface EspnTeamsList extends EspnJson {
  sports: unknown[];
}
export interface EspnNews extends EspnJson {
  articles: unknown[];
}

// Deep single-resource payloads: the routes / team-detail normalizers own their
// (large) shapes, so they stay permissive objects the normalizer narrows.
export type EspnSummary = EspnJson;
export type EspnTeamResponse = EspnJson;
export type EspnRosterResponse = EspnJson;
export type EspnScheduleResponse = EspnJson;
export type EspnTeamStatistics = EspnJson;

// ── Item shapes (for narrowing `unknown` list elements) ──────────────────────
export interface EspnCompetitorTeam {
  id?: string;
  uid?: string;
  displayName?: string;
  shortDisplayName?: string;
  name?: string;
  abbreviation?: string;
  logo?: string;
  logos?: { href?: string }[];
  color?: string;
  alternateColor?: string;
  location?: string;
}

export interface EspnCompetitor {
  homeAway?: 'home' | 'away';
  team?: EspnCompetitorTeam;
  score?: string;
  shootoutScore?: number;
  winner?: boolean;
  records?: { summary?: string }[];
}

export interface EspnStatus {
  clock?: number;
  displayClock?: string;
  period?: number;
  type?: {
    id?: string;
    name?: string;
    state?: 'pre' | 'in' | 'post';
    description?: string;
    detail?: string;
    shortDetail?: string;
    completed?: boolean;
  };
}

export interface EspnCompetition {
  id?: string;
  competitors?: EspnCompetitor[];
  venue?: { fullName?: string; address?: { city?: string; country?: string } };
  notes?: { type?: string; headline?: string }[];
  status?: EspnStatus;
  broadcast?: string;
  broadcasts?: { media?: { shortName?: string }; names?: string[] }[];
}

export interface EspnEvent {
  id?: string;
  date?: string;
  name?: string;
  shortName?: string;
  season?: { year?: number; type?: number; slug?: string };
  status?: EspnStatus;
  competitions?: EspnCompetition[];
  links?: { href?: string }[];
}

export interface EspnFullTeam {
  id?: string;
  uid?: string;
  displayName?: string;
  shortDisplayName?: string;
  abbreviation?: string;
  logos?: { href?: string }[];
  color?: string;
  alternateColor?: string;
  location?: string;
  nextEvent?: EspnEvent[];
}

export interface EspnStandingEntry {
  team?: EspnCompetitorTeam;
  stats?: { name?: string; type?: string; value?: number; displayValue?: string }[];
  note?: { color?: string; description?: string };
}

export interface EspnStandingsGroup {
  name?: string;
  abbreviation?: string;
  standings?: { entries?: EspnStandingEntry[] };
}

// ─── Internal helpers ────────────────────────────────────────────────────────

// Runtime guard: assert the upstream JSON is an object (not a string error page,
// null, or an array) so a malformed ESPN response surfaces as a clean error at
// this boundary instead of an `undefined` crash deep in a normalizer.
const jsonObjectSchema = z.record(z.string(), z.unknown());

function asObject(raw: unknown, label: string): EspnJson {
  const parsed = jsonObjectSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`ESPN ${label}: expected a JSON object, got ${raw === null ? 'null' : Array.isArray(raw) ? 'array' : typeof raw}`);
  }
  return parsed.data as EspnJson;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

// Build a query string from defined, non-empty params.
function qs(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

// A `dates` value is a wide scan (range "A-B" or a bare calendar year "YYYY")
// rather than a single day ("YYYYMMDD"); wide scans get the longer TTL.
function isWideScan(dates?: string): boolean {
  return !!dates && (dates.includes('-') || /^\d{4}$/.test(dates));
}

// `staleIfError` is threaded through so static/slow endpoints can serve last-good.
function cachedJson(
  key: string,
  ttlMs: number,
  url: string,
  label: string,
  staleIfError = false,
): Promise<EspnJson> {
  return cached(key, ttlMs, async () => asObject(await fetchJson(url), label), { staleIfError });
}

function cachedText(
  key: string,
  ttlMs: number,
  url: string,
  fetchOptions?: Parameters<typeof fetchText>[1],
): Promise<string> {
  return cached(key, ttlMs, () => fetchText(url, fetchOptions));
}

/** Zero-padded YYYYMMDD for a date, in ESPN's `?dates=` format. */
export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

// ─── Scoreboard ──────────────────────────────────────────────────────────────

/**
 * A day's (or date range's) fixtures. `dates` is ESPN's `?dates=` value:
 *   • omitted        → today
 *   • 'YYYYMMDD'     → a single day
 *   • 'YYYYMMDD-YYYYMMDD' or 'YYYY' → a range / whole calendar year
 * Single days use a short (live) TTL; wide scans a longer one.
 */
export function fetchScoreboard(
  slug: string,
  opts: { dates?: string; limit?: number } = {},
): Promise<EspnScoreboard> {
  const { dates, limit } = opts;
  const url = `${siteBase(slug)}/scoreboard${qs({ dates, limit })}`;
  const ttl = isWideScan(dates) ? SCHEDULE_RANGE_TTL : SCOREBOARD_TTL;
  const key = `espn:scoreboard:${slug}:${dates ?? 'today'}:${limit ?? ''}`;
  return cached(key, ttl, async (): Promise<EspnScoreboard> => {
    const obj = asObject(await fetchJson(url), 'scoreboard');
    return { ...obj, events: asArray(obj.events), leagues: asArray(obj.leagues) };
  });
}

/**
 * Next ~45 days of fixtures for a competition (raw scoreboard range). The
 * routes layer filters to not-yet-started events, sorts and slices — this only
 * fetches the window. `fromYmd` defaults to today.
 */
export function fetchUpcomingScoreboard(slug: string, fromYmd?: string): Promise<EspnScoreboard> {
  const start = fromYmd ?? ymd(new Date());
  const end = new Date();
  end.setDate(end.getDate() + 45);
  return fetchScoreboard(slug, { dates: `${start}-${ymd(end)}`, limit: 400 });
}

// ─── Match summary (match centre JSON) ───────────────────────────────────────

/** Full match summary payload (header, rosters, keyEvents, boxscore, gameInfo,
 *  article, news, odds, predictor, winprobability, leaders, headToHeadGames…). */
export function fetchSummary(slug: string, eventId: string): Promise<EspnSummary> {
  const url = `${siteBase(slug)}/summary${qs({ event: eventId })}`;
  return cachedJson(`espn:summary:${slug}:${eventId}`, SUMMARY_TTL, url, 'summary');
}

// ── espn.com HTML scrapes (shot map / player stats / manual commentary) ───────
// Return raw HTML; the routes layer extracts the embedded JSON blobs. Keyed by
// gameId only (league-agnostic).

export function fetchMatchPageHtml(eventId: string): Promise<string> {
  return cachedText(`espn:page:match:${eventId}`, MATCH_PAGE_TTL, `${ESPN_MATCH_PAGE}/${eventId}`, HTML_PAGE_FETCH);
}

export function fetchPlayerStatsPageHtml(eventId: string): Promise<string> {
  return cachedText(`espn:page:playerstats:${eventId}`, MATCH_PAGE_TTL, `${ESPN_PLAYER_STATS_PAGE}/${eventId}`, HTML_PAGE_FETCH);
}

export function fetchCommentaryPageHtml(eventId: string): Promise<string> {
  return cachedText(`espn:page:commentary:${eventId}`, MATCH_PAGE_TTL, `${ESPN_COMMENTARY_PAGE}/${eventId}`, HTML_PAGE_FETCH);
}

// ─── Standings (league table / group tables) ─────────────────────────────────

/**
 * Unified standings for a competition and season: a single table for a league,
 * or one `children[]` entry per group for a cup/tournament. Teams are inlined
 * (no $ref resolution) and each entry carries a `note` for the qualification
 * colour. `season` is resolved per-competition (see ./season.ts) — never guess.
 */
export function fetchStandings(slug: string, season: number): Promise<EspnStandings> {
  const url = `${webBase(slug)}/standings${qs({ season })}`;
  const key = `espn:standings:${slug}:${season}`;
  return cached(
    key,
    STANDINGS_TTL,
    async (): Promise<EspnStandings> => {
      const obj = asObject(await fetchJson(url), 'standings');
      // Some competitions return a flat `standings` (no `children`); surface a
      // single synthetic child so the normalizer has one code path.
      const children = asArray(obj.children);
      if (children.length === 0 && obj.standings) {
        children.push({
          name: obj.name ?? '',
          abbreviation: obj.abbreviation ?? '',
          standings: obj.standings,
        });
      }
      return { ...obj, children };
    },
    { staleIfError: true },
  );
}

// ─── Teams ───────────────────────────────────────────────────────────────────

/** All teams in a competition (list). Static for a season → long TTL. */
export function fetchTeams(slug: string): Promise<EspnTeamsList> {
  const url = `${siteBase(slug)}/teams${qs({ limit: 100 })}`;
  return cached(
    `espn:teams:${slug}`,
    TEAMS_TTL,
    async (): Promise<EspnTeamsList> => {
      const obj = asObject(await fetchJson(url), 'teams');
      return { ...obj, sports: asArray(obj.sports) };
    },
    { staleIfError: true },
  );
}

/** A single team's core page payload (team object, nextEvent, standingSummary). */
export function fetchTeam(slug: string, teamId: string): Promise<EspnTeamResponse> {
  const url = `${siteBase(slug)}/teams/${teamId}`;
  return cachedJson(`espn:team:${slug}:${teamId}`, TEAM_TTL, url, 'team', true);
}

/** A team's squad list (athletes + coach), enriched with per-athlete stats. */
export function fetchTeamRoster(slug: string, teamId: string): Promise<EspnRosterResponse> {
  const url = `${siteBase(slug)}/teams/${teamId}/roster`;
  return cachedJson(`espn:roster:${slug}:${teamId}`, ROSTER_TTL, url, 'roster', true);
}

/** A team's fixture list (past + upcoming events). */
export function fetchTeamSchedule(slug: string, teamId: string): Promise<EspnScheduleResponse> {
  const url = `${siteBase(slug)}/teams/${teamId}/schedule`;
  return cachedJson(`espn:schedule:${slug}:${teamId}`, SCHEDULE_TTL, url, 'schedule', true);
}

/**
 * CORE aggregate team statistics for a season (the plain site /statistics is
 * usually empty). `type` is ESPN's season-type (1 = regular). `split` is the
 * optional aggregate id (the match preview uses split '0'); omit for the plain
 * season aggregate used on the team page.
 */
export function fetchTeamSeasonStats(
  slug: string,
  opts: { teamId: string; season: number; type?: number; split?: string },
): Promise<EspnTeamStatistics> {
  const { teamId, season, type = 1, split } = opts;
  const path = `${coreBase(slug)}/seasons/${season}/types/${type}/teams/${teamId}/statistics${split != null ? `/${split}` : ''}`;
  const url = `${path}${qs({ lang: 'en', region: 'us' })}`;
  const key = `espn:teamstats:${slug}:${season}:${type}:${teamId}:${split ?? ''}`;
  return cachedJson(key, TEAM_STATS_TTL, url, 'team statistics', true);
}

// ─── Bracket (knockout rounds) ───────────────────────────────────────────────

/**
 * Raw events for a competition's knockout stage in a given season.
 *
 * ESPN has no bracket endpoint. `?dates=YYYY` returns a CALENDAR year, but a
 * season spans two calendar years (a 2025-26 cup plays its group/league phase
 * in 2025 and its knockouts in 2026). So we scan both calendar years and keep
 * only events whose `season.year` matches this competition's season, deduped by
 * id (an event can appear in both year queries near the boundary). A single
 * wide range would trip ESPN's ~1-year limit → 400.
 *
 * Returns raw `EspnEvent`-shaped objects (typed `unknown`); the routes layer
 * groups them into knockout rounds by `season.slug` and orders chronologically.
 */
export function fetchBracketEvents(slug: string, season: number): Promise<unknown[]> {
  const key = `espn:bracket:${slug}:${season}`;
  return cached(key, BRACKET_TTL, async (): Promise<unknown[]> => {
    const empty: EspnScoreboard = { events: [], leagues: [] };
    const [cur, next] = await Promise.all([
      fetchScoreboard(slug, { dates: String(season), limit: 1000 }),
      fetchScoreboard(slug, { dates: String(season + 1), limit: 1000 }).catch(() => empty),
    ]);
    const byId = new Map<string, unknown>();
    for (const ev of [...cur.events, ...next.events]) {
      const e = ev as EspnEvent;
      const id = e?.id != null ? String(e.id) : '';
      if (id && e?.season?.year === season) byId.set(id, ev);
    }
    return [...byId.values()];
  });
}

// ─── News ─────────────────────────────────────────────────────────────────────

/** Competition-specific ESPN news. */
export function fetchLeagueNews(slug: string): Promise<EspnNews> {
  const url = `${siteBase(slug)}/news`;
  return cached(
    `espn:news:league:${slug}`,
    NEWS_TTL,
    async (): Promise<EspnNews> => {
      const obj = asObject(await fetchJson(url), 'league news');
      return { ...obj, articles: asArray(obj.articles) };
    },
    { staleIfError: true },
  );
}

/** ESPN's soccer-wide top news (league-agnostic), merged in behind the league
 *  feed. Uses the `now` content API (the old `/soccer/news` path 404s); its
 *  `headlines[]` items are field-compatible with the site-news article shape
 *  (headline, description, images, published, byline, categories, links.web.href),
 *  so they are surfaced under `articles` for a single normalizer path. */
export function fetchTopSoccerNews(): Promise<EspnNews> {
  const url = `${ESPN_NOW_NEWS_API}${qs({ sport: 'soccer', limit: 50 })}`;
  return cached(
    'espn:news:top-soccer',
    NEWS_TTL,
    async (): Promise<EspnNews> => {
      const obj = asObject(await fetchJson(url), 'top soccer news');
      return { ...obj, articles: asArray(obj.headlines ?? obj.articles) };
    },
    { staleIfError: true },
  );
}

/** Raw text of a third-party RSS feed (see NEWS_RSS_FEEDS). Non-ESPN upstream, so
 *  `espn: false` (no espn.com Origin/Referer); the http helper still sends a
 *  browser UA that these publishers require. The routes layer parses the XML
 *  into NewsItem[]. */
export function fetchNewsFeedText(url: string): Promise<string> {
  return cached(
    `espn:rss:${url}`,
    NEWS_TTL,
    () =>
      fetchText(url, {
        espn: false,
        headers: { Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8' },
      }),
    { staleIfError: true },
  );
}
