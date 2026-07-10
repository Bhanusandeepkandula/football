// ─── Shared route plumbing ───────────────────────────────────────────────────
// HTTP client for the ESPN upstreams, a tiny in-memory TTL cache, structured
// error handling and zod-backed request validation. Every resource module under
// src/routes/ builds on these so the wire behaviour is consistent:
//   • upstream JSON is fetched through `espnFetch` (throws `UpstreamError`),
//   • successful DTOs are memoised through `cached(...)` for a short TTL,
//   • handlers are wrapped in `defineRoute(...)` which turns any thrown error
//     into a STRUCTURED response — 400 (bad request), 404 (missing), 502
//     (upstream failed / violated the contract) — never a silent empty body.

import type { Context } from 'hono';
import { z, ZodError } from 'zod';

import { env } from '../config/env.js';
import { log } from '../lib/log.js';

const routeLog = log('routes');

// ── ESPN upstream base URLs (env-configurable, keyed by league slug) ─────────
export const siteBase = (slug: string): string => `${env.ESPN_SITE_API}/${slug}`;
export const coreBase = (slug: string): string => `${env.ESPN_CORE_API}/${slug}`;
export const webBase = (slug: string): string => `${env.ESPN_WEB_API}/${slug}`;

// ── Upstream errors ──────────────────────────────────────────────────────────
/** Thrown whenever an upstream fetch fails (network, non-2xx, or bad JSON). */
export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

/** Thrown by request validation; surfaced as 400 with the zod issues attached. */
export class BadRequestError extends Error {
  readonly issues: unknown;
  constructor(message: string, issues?: unknown) {
    super(message);
    this.name = 'BadRequestError';
    this.issues = issues;
  }
}

// ── Upstream fetchers ────────────────────────────────────────────────────────
export async function espnFetch<T = unknown>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch (err) {
    throw new UpstreamError(
      `Network error contacting upstream: ${err instanceof Error ? err.message : String(err)}`,
      0,
      url,
    );
  }
  if (!res.ok) throw new UpstreamError(`Upstream responded ${res.status}`, res.status, url);
  try {
    return (await res.json()) as T;
  } catch (err) {
    throw new UpstreamError(
      `Upstream returned invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      res.status,
      url,
    );
  }
}

export async function espnText(url: string, headers?: Record<string, string>): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, headers ? { headers } : undefined);
  } catch (err) {
    throw new UpstreamError(
      `Network error contacting upstream: ${err instanceof Error ? err.message : String(err)}`,
      0,
      url,
    );
  }
  if (!res.ok) throw new UpstreamError(`Upstream responded ${res.status}`, res.status, url);
  return res.text();
}

// ── In-memory TTL cache (single process) ─────────────────────────────────────
// Memoises the produced (already validated) DTO for `ttlMs`. Concurrent callers
// for the same key share one in-flight promise; a rejected promise is evicted so
// a transient upstream error never poisons the cache.
interface CacheEntry {
  value: Promise<unknown>;
  expires: number;
}
const cacheStore = new Map<string, CacheEntry>();

export async function cached<T>(
  key: string,
  ttlMs: number,
  producer: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = cacheStore.get(key);
  if (hit && hit.expires > now) return hit.value as Promise<T>;

  const value = producer();
  cacheStore.set(key, { value, expires: now + ttlMs });
  try {
    return (await value) as T;
  } catch (err) {
    const current = cacheStore.get(key);
    if (current && current.value === value) cacheStore.delete(key);
    throw err;
  }
}

/** Short TTLs (ms) per resource — live-ish data refreshes fast, static slow. */
export const TTL = {
  leagues: 3_600_000,
  scoreboard: 10_000,
  upcoming: 300_000,
  matchDetail: 15_000,
  standings: 600_000,
  bracket: 300_000,
  teams: 300_000,
  teamDetail: 300_000,
  news: 90_000,
  season: 3_600_000,
} as const;

// ── Runtime season derivation (per slug, cached) ─────────────────────────────
function fallbackSeason(): number {
  const now = new Date();
  // Soccer seasons are labelled by their starting calendar year (Aug–May).
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

export function getLeagueSeason(slug: string): Promise<number> {
  return cached(`season:${slug}`, TTL.season, async () => {
    try {
      const data = await espnFetch<{ leagues?: { season?: { year?: number } }[] }>(
        `${siteBase(slug)}/scoreboard`,
      );
      const year = data?.leagues?.[0]?.season?.year;
      return typeof year === 'number' && year > 2000 ? year : fallbackSeason();
    } catch {
      return fallbackSeason();
    }
  });
}

// ── Request validation ───────────────────────────────────────────────────────
export function parseQuery<S extends z.ZodTypeAny>(c: Context, schema: S): z.infer<S> {
  const result = schema.safeParse(c.req.query());
  if (!result.success) throw new BadRequestError('Invalid query parameters', result.error.issues);
  return result.data;
}

export function parseParams<S extends z.ZodTypeAny>(c: Context, schema: S): z.infer<S> {
  const result = schema.safeParse(c.req.param());
  if (!result.success) throw new BadRequestError('Invalid path parameters', result.error.issues);
  return result.data;
}

/** Shared `:league` path param — an ESPN league slug (e.g. 'eng.1'). */
export const LeagueParamSchema = z.object({
  league: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_.]+$/i, 'league must be an ESPN league slug (e.g. eng.1)'),
});

/** Shared `:id` path param — a non-empty ESPN numeric-ish id. */
export const IdParamSchema = z.object({ id: z.string().min(1) });

// ── Structured error responses ───────────────────────────────────────────────
function errorResponse(c: Context, err: unknown): Response {
  if (err instanceof BadRequestError) {
    return c.json(
      { error: { code: 'bad_request', message: err.message, details: err.issues } },
      400,
    );
  }
  if (err instanceof UpstreamError) {
    if (err.status === 404) {
      routeLog.warn({ url: err.url }, 'upstream 404');
      return c.json(
        {
          error: {
            code: 'not_found',
            message: 'The requested resource was not found upstream',
            upstream: { status: 404, url: err.url },
          },
        },
        404,
      );
    }
    routeLog.error({ url: err.url, status: err.status }, 'upstream error');
    return c.json(
      {
        error: {
          code: 'upstream_error',
          message: err.message,
          upstream: { status: err.status, url: err.url },
        },
      },
      502,
    );
  }
  if (err instanceof ZodError) {
    // A DTO we produced failed contract validation → the upstream payload was
    // malformed. Fail loudly (502) rather than shipping a half-shaped body.
    routeLog.error({ issues: err.issues }, 'contract validation failed');
    return c.json(
      {
        error: {
          code: 'invalid_upstream',
          message: 'Upstream response did not satisfy the API contract',
          details: err.issues,
        },
      },
      502,
    );
  }
  routeLog.error({ err }, 'unexpected route error');
  return c.json(
    {
      error: {
        code: 'internal_error',
        message: err instanceof Error ? err.message : 'Unknown error',
      },
    },
    500,
  );
}

/**
 * Wrap an async DTO producer into a Hono handler. The producer returns the
 * already-validated DTO (or throws); this serialises it as JSON and maps any
 * error to a structured response.
 */
export function defineRoute(producer: (c: Context) => Promise<unknown>) {
  return async (c: Context): Promise<Response> => {
    try {
      const dto = await producer(c);
      return c.json(dto as never);
    } catch (err) {
      return errorResponse(c, err);
    }
  };
}
