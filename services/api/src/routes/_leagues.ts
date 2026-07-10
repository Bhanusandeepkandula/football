// ─── Competition registry ────────────────────────────────────────────────────
// A server-side mirror of the app's config/leagues.ts (slug + display names).
// The full app registry also carries region/format/emoji/logoId used only by the
// UI; the API only needs slug/name/abbr to build the `LeagueRef` embedded in
// every DTO and to serve GET /v1/leagues. `:league` is passed through to ESPN, so
// an unknown slug still works — the registry just supplies nicer display names.

import type { LeagueRef } from '../contract/schema.js';

interface RegistryEntry {
  slug: string;
  name: string;
  abbr: string;
}

export const LEAGUES: RegistryEntry[] = [
  // England
  { slug: 'eng.1', name: 'English Premier League', abbr: 'EPL' },
  { slug: 'eng.2', name: 'EFL Championship', abbr: 'EFLC' },
  { slug: 'eng.fa', name: 'Emirates FA Cup', abbr: 'FA' },
  { slug: 'eng.league_cup', name: 'Carabao Cup', abbr: 'EFL' },
  // Spain
  { slug: 'esp.1', name: 'Spanish LALIGA', abbr: 'LAL' },
  { slug: 'esp.copa_del_rey', name: 'Copa del Rey', abbr: 'CDR' },
  // Italy
  { slug: 'ita.1', name: 'Italian Serie A', abbr: 'SA' },
  { slug: 'ita.coppa_italia', name: 'Coppa Italia', abbr: 'CI' },
  // Germany
  { slug: 'ger.1', name: 'German Bundesliga', abbr: 'BUN' },
  { slug: 'ger.dfb_pokal', name: 'DFB-Pokal', abbr: 'DFB' },
  // France
  { slug: 'fra.1', name: 'French Ligue 1', abbr: 'L1' },
  // Rest of Europe
  { slug: 'ned.1', name: 'Dutch Eredivisie', abbr: 'ERE' },
  { slug: 'por.1', name: 'Portuguese Primeira Liga', abbr: 'POR' },
  // Continental cups
  { slug: 'uefa.champions', name: 'UEFA Champions League', abbr: 'UCL' },
  { slug: 'uefa.europa', name: 'UEFA Europa League', abbr: 'UEL' },
  { slug: 'uefa.europa.conf', name: 'UEFA Europa Conference League', abbr: 'UECL' },
  // International
  { slug: 'fifa.world', name: 'FIFA World Cup', abbr: 'WC' },
  { slug: 'fifa.cwc', name: 'FIFA Club World Cup', abbr: 'CWC' },
  { slug: 'uefa.euro', name: 'UEFA European Championship', abbr: 'EURO' },
  { slug: 'conmebol.america', name: 'Copa América', abbr: 'CA' },
  { slug: 'uefa.nations', name: 'UEFA Nations League', abbr: 'UNL' },
  { slug: 'fifa.friendly', name: 'International Friendly', abbr: 'FR' },
  // Americas
  { slug: 'usa.1', name: 'Major League Soccer', abbr: 'MLS' },
  { slug: 'mex.1', name: 'Liga MX', abbr: 'MX' },
  { slug: 'bra.1', name: 'Brazilian Série A', abbr: 'BRA' },
  { slug: 'arg.1', name: 'Argentine Liga Profesional', abbr: 'ARG' },
  // Rest of World
  { slug: 'sau.1', name: 'Saudi Pro League', abbr: 'SPL' },
];

const BY_SLUG = new Map<string, RegistryEntry>(LEAGUES.map((l) => [l.slug, l]));

/** All registered competitions as bare `LeagueRef`s (for GET /v1/leagues). */
export const leagueRefs: LeagueRef[] = LEAGUES.map((l) => ({
  slug: l.slug,
  name: l.name,
  abbr: l.abbr,
}));

/**
 * Resolve a `LeagueRef` for a slug, preferring the curated registry, then any
 * league metadata ESPN returned in the payload, then the bare slug.
 */
export function leagueRef(
  slug: string,
  espn?: { name?: string; abbreviation?: string } | null,
): LeagueRef {
  const reg = BY_SLUG.get(slug);
  if (reg) return { slug, name: reg.name, abbr: reg.abbr };
  if (espn?.name) return { slug, name: espn.name, abbr: espn.abbreviation || undefined };
  return { slug, name: slug };
}
