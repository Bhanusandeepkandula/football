// ─── ESPN API helpers (league-aware) ────────────────────────────────────────
// Every ESPN URL in the app is built from a league slug (e.g. 'eng.1',
// 'fifa.world', 'uefa.champions'). Previously the slug was hardcoded to
// `fifa.world`; now it flows from the selected competition (see hooks/useLeague).
//
// ESPN uses three hosts, all keyed by the same slug:
//   • site.api    — public scoreboard / teams / summary JSON (CORS-friendly)
//   • core.api    — deep stats, standings groups, per-season resources
//   • web.api     — the unified standings table + v3 athlete endpoints

import { DEFAULT_LEAGUE_SLUG } from '@/config/leagues';

export const SITE_API = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
export const CORE_API = 'https://sports.core.api.espn.com/v2/sports/soccer/leagues';
export const WEB_API = 'https://site.web.api.espn.com/apis/v2/sports/soccer';

// ─── Active competition (module mirror of the React league context) ──────────
// A handful of prefetch call sites (match/team/player card taps) build query
// options outside React and can't read context. LeagueProvider keeps this in
// sync so those default to the competition the user is currently viewing, while
// hooks pass their context slug explicitly. Both resolve to the same value, so
// prefetch and screen queries share one cache entry.
let _activeSlug = DEFAULT_LEAGUE_SLUG;
export function setActiveSlug(slug: string) { _activeSlug = slug; }
export function getActiveSlug(): string { return _activeSlug; }

export const siteBase = (slug: string) => `${SITE_API}/${slug}`;
export const coreBase = (slug: string) => `${CORE_API}/${slug}`;
export const webBase = (slug: string) => `${WEB_API}/${slug}`;

export async function espnFetch(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN API error: ${res.status}`);
  return res.json();
}

// ─── Runtime season derivation ──────────────────────────────────────────────
// Different competitions are on different seasons at any given moment (e.g. the
// Premier League may be on 2026 while the Champions League is on 2025). ESPN
// reports the correct one in the scoreboard payload, so we read it live and
// cache it per slug rather than hardcoding a year anywhere.

const seasonCache = new Map<string, Promise<number>>();

/** Sensible fallback if the network read fails: soccer seasons are labelled by
 *  their starting calendar year (Aug–May), so before ~July we're still in last
 *  year's season. */
function fallbackSeason(): number {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

export function getLeagueSeason(slug: string): Promise<number> {
  const cached = seasonCache.get(slug);
  if (cached) return cached;
  const p = (async () => {
    try {
      const data = await espnFetch(`${siteBase(slug)}/scoreboard`);
      const year = data?.leagues?.[0]?.season?.year;
      return typeof year === 'number' && year > 2000 ? year : fallbackSeason();
    } catch {
      seasonCache.delete(slug); // allow a retry on the next call
      return fallbackSeason();
    }
  })();
  seasonCache.set(slug, p);
  return p;
}

// ─── Fastcast ───────────────────────────────────────────────────────────────
// The live-delta websocket topic is `gp-soccer-<slug>-<eventId>` (was hardcoded
// to `gp-soccer-fifa.world-<id>`).
export function fastcastTopic(slug: string, eventId: string): string {
  return `gp-soccer-${slug}-${eventId}`;
}
