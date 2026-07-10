// ─── @matchcenter/api REST client ────────────────────────────────────────────
// Typed fetchers for every read-side backend endpoint. Each returns the
// normalized DTO from lib/api/types.ts and enforces an 8s AbortController
// timeout so a hung upstream can never wedge a screen.
//
//   GET /v1/leagues                    → LeagueRef[]
//   GET /v1/:league/scoreboard         → Scoreboard      (?dates=YYYYMMDD[-YYYYMMDD])
//   GET /v1/:league/matches/upcoming   → MatchSummary[]  (?from=YYYYMMDD)
//   GET /v1/:league/matches/:id        → MatchDetail
//   GET /v1/:league/standings          → Standings       (?season=YYYY)
//   GET /v1/:league/bracket            → Bracket         (?season=YYYY)
//   GET /v1/:league/teams              → Team[]
//   GET /v1/:league/teams/:id          → TeamDetail
//   GET /v1/:league/news               → NewsItem[]

import { API_BASE, REQUEST_TIMEOUT_MS } from './config';
import type {
  Bracket,
  LeagueRef,
  MatchDetail,
  MatchSummary,
  NewsItem,
  Scoreboard,
  Standings,
  Team,
  TeamDetail,
} from './types';

/** Thrown on any non-2xx response, network failure, or timeout. */
export class ApiError extends Error {
  constructor(
    /** HTTP status, or 0 for timeout / network failure. */
    readonly status: number,
    /** Absolute URL that failed. */
    readonly url: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type QueryValue = string | number | undefined | null;

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  let url = `${API_BASE}${path}`;
  if (query) {
    const pairs = Object.entries(query)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    if (pairs.length) url += `?${pairs.join('&')}`;
  }
  return url;
}

/**
 * GET `path` and parse JSON as `T`. Aborts after `timeoutMs`. Any failure is
 * surfaced as an `ApiError` (status 0 for timeout / transport errors).
 *
 * `signal` (e.g. React Query's) is honoured alongside the internal timeout —
 * whichever fires first aborts the request.
 */
async function apiGet<T>(
  path: string,
  query?: Record<string, QueryValue>,
  opts?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<T> {
  const url = buildUrl(path, query);
  const controller = new AbortController();
  const timeoutMs = opts?.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Forward an external abort (caller cancellation) into our controller.
  const onExternalAbort = () => controller.abort();
  if (opts?.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener('abort', onExternalAbort);
  }

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.text()).slice(0, 200);
      } catch {
        // ignore body read failures
      }
      throw new ApiError(res.status, url, `GET ${path} → ${res.status}${detail ? `: ${detail}` : ''}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const aborted =
      controller.signal.aborted ||
      (err as { name?: string } | null)?.name === 'AbortError';
    if (aborted && !opts?.signal?.aborted) {
      throw new ApiError(0, url, `GET ${path} timed out after ${timeoutMs}ms`);
    }
    throw new ApiError(0, url, `GET ${path} failed: ${(err as Error)?.message ?? String(err)}`);
  } finally {
    clearTimeout(timer);
    opts?.signal?.removeEventListener('abort', onExternalAbort);
  }
}

type FetchOpts = { signal?: AbortSignal; timeoutMs?: number };

const enc = encodeURIComponent;

// ── Endpoint fetchers ─────────────────────────────────────────────────────────

/** GET /v1/leagues — the supported competitions registry. */
export function getLeagues(opts?: FetchOpts): Promise<LeagueRef[]> {
  return apiGet<LeagueRef[]>('/v1/leagues', undefined, opts);
}

/** GET /v1/:league/scoreboard — a day's (or range's) fixtures. */
export function getScoreboard(
  league: string,
  dates?: string,
  opts?: FetchOpts,
): Promise<Scoreboard> {
  return apiGet<Scoreboard>(`/v1/${enc(league)}/scoreboard`, { dates }, opts);
}

/** GET /v1/:league/matches/upcoming — next (≤8) scheduled fixtures. */
export function getUpcoming(
  league: string,
  from?: string,
  opts?: FetchOpts,
): Promise<MatchSummary[]> {
  return apiGet<MatchSummary[]>(`/v1/${enc(league)}/matches/upcoming`, { from }, opts);
}

/** GET /v1/:league/matches/:id — full match-centre payload. */
export function getMatchDetail(
  league: string,
  id: string,
  opts?: FetchOpts,
): Promise<MatchDetail> {
  return apiGet<MatchDetail>(`/v1/${enc(league)}/matches/${enc(id)}`, undefined, opts);
}

/** GET /v1/:league/standings — league table / group tables. */
export function getStandings(
  league: string,
  season?: number,
  opts?: FetchOpts,
): Promise<Standings> {
  return apiGet<Standings>(`/v1/${enc(league)}/standings`, { season }, opts);
}

/** GET /v1/:league/bracket — knockout rounds. */
export function getBracket(
  league: string,
  season?: number,
  opts?: FetchOpts,
): Promise<Bracket> {
  return apiGet<Bracket>(`/v1/${enc(league)}/bracket`, { season }, opts);
}

/** GET /v1/:league/teams — every team in a competition. */
export function getTeams(league: string, opts?: FetchOpts): Promise<Team[]> {
  return apiGet<Team[]>(`/v1/${enc(league)}/teams`, undefined, opts);
}

/** GET /v1/:league/teams/:id — team page payload. */
export function getTeamDetail(
  league: string,
  id: string,
  opts?: FetchOpts,
): Promise<TeamDetail> {
  return apiGet<TeamDetail>(`/v1/${enc(league)}/teams/${enc(id)}`, undefined, opts);
}

/** GET /v1/:league/news — competition news feed. */
export function getNews(league: string, opts?: FetchOpts): Promise<NewsItem[]> {
  return apiGet<NewsItem[]>(`/v1/${enc(league)}/news`, undefined, opts);
}

/** Grouped namespace, for `import { api } from '@/lib/api/client'`. */
export const api = {
  getLeagues,
  getScoreboard,
  getUpcoming,
  getMatchDetail,
  getStandings,
  getBracket,
  getTeams,
  getTeamDetail,
  getNews,
};
