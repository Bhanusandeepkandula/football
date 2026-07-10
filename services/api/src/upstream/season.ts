// ─── Per-competition season resolution ───────────────────────────────────────
//
// Different competitions sit on different seasons at any given moment (the
// Premier League may be on 2026 while the Champions League is on 2025), and a
// soccer "season" year is not derivable from the wall clock: European leagues
// are labelled by their starting year (Aug–May), but calendar-year leagues
// (MLS, Brazil, Argentina, Nordic countries) are labelled by the current year.
//
// The old app code guessed the year from `new Date()` with an Aug–May heuristic
// and — worse — cached that guess. Two bugs:
//   1. The heuristic is wrong for every calendar-year competition.
//   2. On a missing/failed payload it cached the GUESS permanently, so the wrong
//      year stuck for the whole process lifetime.
//
// Fix: derive the season PER-COMPETITION from that competition's own scoreboard
// payload (`leagues[0].season.year`, or the modal `events[].season.year`). Only
// a real, payload-derived value is cached (with a refresh TTL so it rolls over
// to the next season). A last-resort fallback is returned transiently and NEVER
// cached, so the next call retries and can pick up the real value.

import { fetchScoreboard, type EspnScoreboard, type EspnEvent } from './espn.js';
import { log } from '../lib/log.js';

const logger = log('season');

// A real value is stable within a competition; refresh every few hours so a
// season rollover is picked up without a restart.
const REAL_TTL_MS = 6 * 60 * 60 * 1000;

interface CachedSeason {
  year: number;
  expiresAt: number;
}

// Only ever holds REAL, payload-derived values. Guesses are never stored here.
const realCache = new Map<string, CachedSeason>();
// Single-flight: coalesce concurrent resolutions for the same slug.
const inflight = new Map<string, Promise<number>>();

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isValidSeasonYear(y: unknown): y is number {
  return typeof y === 'number' && Number.isInteger(y) && y > 2000 && y < 2100;
}

/**
 * Derive the season from a competition's OWN scoreboard payload.
 *   1. Authoritative: `leagues[0].season.year`.
 *   2. Robust fallback still inside the payload: the most common
 *      `events[].season.year` (per-competition, no wall-clock guess).
 * Returns undefined when the payload carries no usable season year.
 */
function deriveFromPayload(sb: EspnScoreboard): number | undefined {
  const league0 = asArray(sb.leagues)[0] as { season?: { year?: unknown } } | undefined;
  const leagueYear = league0?.season?.year;
  if (isValidSeasonYear(leagueYear)) return leagueYear;

  const counts = new Map<number, number>();
  for (const ev of asArray(sb.events)) {
    const y = (ev as EspnEvent)?.season?.year;
    if (isValidSeasonYear(y)) counts.set(y, (counts.get(y) ?? 0) + 1);
  }
  let best: number | undefined;
  let bestCount = 0;
  for (const [year, count] of counts) {
    if (count > bestCount) {
      best = year;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Last-resort transient guess when the scoreboard cannot be read at all. This
 * is deliberately neutral (current calendar year) rather than the old Aug–May
 * heuristic — it is NEVER cached and only bridges until a payload read succeeds,
 * so it must not bias toward one competition family. Callers retry on the next
 * request and will replace it with the real value.
 */
function transientFallback(): number {
  return new Date().getFullYear();
}

/**
 * Feed an already-fetched scoreboard payload into the season cache. Cheap way
 * for a route that just fetched a scoreboard to prime the season (real values
 * only). Returns the derived year, or undefined if the payload had none.
 */
export function primeSeason(slug: string, sb: EspnScoreboard): number | undefined {
  const year = deriveFromPayload(sb);
  if (isValidSeasonYear(year)) {
    realCache.set(slug, { year, expiresAt: Date.now() + REAL_TTL_MS });
    return year;
  }
  return undefined;
}

/** The cached real season for a slug, if one has been resolved and is fresh.
 *  Never returns a guess. Synchronous — useful where a fetch would be too slow. */
export function peekSeason(slug: string): number | undefined {
  const hit = realCache.get(slug);
  return hit && hit.expiresAt > Date.now() ? hit.year : undefined;
}

/**
 * Resolve the current season year for a competition.
 * Order: fresh cached real value → derive from the competition's scoreboard
 * (cached on success) → transient neutral fallback (NOT cached, retried next time).
 */
export function resolveSeason(slug: string): Promise<number> {
  const cachedReal = peekSeason(slug);
  if (cachedReal != null) return Promise.resolve(cachedReal);

  const pending = inflight.get(slug);
  if (pending) return pending;

  const p = (async (): Promise<number> => {
    try {
      const sb = await fetchScoreboard(slug);
      const year = deriveFromPayload(sb);
      if (isValidSeasonYear(year)) {
        realCache.set(slug, { year, expiresAt: Date.now() + REAL_TTL_MS });
        return year;
      }
      // Payload had no season → transient guess, intentionally NOT cached.
      const guess = transientFallback();
      logger.warn({ slug, guess }, 'no season year in scoreboard payload; using transient fallback (not cached)');
      return guess;
    } catch (err) {
      const guess = transientFallback();
      logger.warn({ slug, guess, err }, 'scoreboard fetch failed; using transient fallback season (not cached)');
      return guess;
    } finally {
      inflight.delete(slug);
    }
  })();

  inflight.set(slug, p);
  return p;
}

/** Test/hygiene hook: drop cached seasons (all, or one slug). */
export function clearSeasonCache(slug?: string): void {
  if (slug) realCache.delete(slug);
  else realCache.clear();
}
