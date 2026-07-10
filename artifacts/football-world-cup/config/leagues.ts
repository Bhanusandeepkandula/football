// ─── Competition registry ───────────────────────────────────────────────────
// The app used to be hardcoded to the FIFA World Cup (`fifa.world`, season 2026).
// It now supports any ESPN soccer competition. This is the curated list of the
// major leagues/cups people actually watch; every entry maps to an ESPN league
// slug used across the site/core/web APIs and the Fastcast topic.
//
// `format` drives which views make sense:
//   • 'league'          → a single standings table, no knockout bracket.
//   • 'groups-knockout' → group tables AND a knockout bracket (WC, Euros, UCL…).
//   • 'knockout'        → a knockout bracket only (domestic cups).
//   • 'friendlies'      → fixtures only, no table/bracket.
// The UI is still data-adaptive (it shows a tab only when data exists), so this
// is a hint for default view + labels, not a hard gate.

export type CompetitionFormat = 'league' | 'groups-knockout' | 'knockout' | 'friendlies';

export interface League {
  /** ESPN league slug, e.g. 'eng.1'. The single source of truth for every URL. */
  slug: string;
  /** Full display name, e.g. 'English Premier League'. */
  name: string;
  /** Short display name for mastheads/cards, e.g. 'Premier League'. */
  short: string;
  /** 3–5 char abbreviation, e.g. 'EPL'. */
  abbr: string;
  /** Picker section, e.g. 'England', 'Europe', 'International'. */
  region: string;
  /** Shapes default view + which tabs are offered. */
  format: CompetitionFormat;
  /** ESPN league-logo id → real competition crest (preferred over the emoji). */
  logoId?: number;
  /** Emoji fallback for the picker/masthead when no logo is available. */
  emoji: string;
}

/** ESPN's canonical league-crest URL, or '' when the league has no logo id. */
export function leagueLogoUrl(l: League): string {
  return l.logoId ? `https://a.espncdn.com/i/leaguelogos/soccer/500/${l.logoId}.png` : '';
}

export const LEAGUES: League[] = [
  // ── England ──
  { slug: 'eng.1', name: 'English Premier League', short: 'Premier League', abbr: 'EPL', region: 'England', format: 'league', logoId: 23, emoji: '🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}' },
  { slug: 'eng.2', name: 'EFL Championship', short: 'Championship', abbr: 'EFLC', region: 'England', format: 'league', logoId: 24, emoji: '🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}' },
  { slug: 'eng.fa', name: 'Emirates FA Cup', short: 'FA Cup', abbr: 'FA', region: 'England', format: 'knockout', logoId: 40, emoji: '🏆' },
  { slug: 'eng.league_cup', name: 'Carabao Cup', short: 'EFL Cup', abbr: 'EFL', region: 'England', format: 'knockout', logoId: 41, emoji: '🏆' },

  // ── Spain ──
  { slug: 'esp.1', name: 'Spanish LALIGA', short: 'LaLiga', abbr: 'LAL', region: 'Spain', format: 'league', logoId: 15, emoji: '🇪🇸' },
  { slug: 'esp.copa_del_rey', name: 'Copa del Rey', short: 'Copa del Rey', abbr: 'CDR', region: 'Spain', format: 'knockout', logoId: 80, emoji: '🏆' },

  // ── Italy ──
  { slug: 'ita.1', name: 'Italian Serie A', short: 'Serie A', abbr: 'SA', region: 'Italy', format: 'league', logoId: 12, emoji: '🇮🇹' },
  { slug: 'ita.coppa_italia', name: 'Coppa Italia', short: 'Coppa Italia', abbr: 'CI', region: 'Italy', format: 'knockout', logoId: 2192, emoji: '🏆' },

  // ── Germany ──
  { slug: 'ger.1', name: 'German Bundesliga', short: 'Bundesliga', abbr: 'BUN', region: 'Germany', format: 'league', logoId: 10, emoji: '🇩🇪' },
  { slug: 'ger.dfb_pokal', name: 'DFB-Pokal', short: 'DFB-Pokal', abbr: 'DFB', region: 'Germany', format: 'knockout', logoId: 2061, emoji: '🏆' },

  // ── France ──
  { slug: 'fra.1', name: 'French Ligue 1', short: 'Ligue 1', abbr: 'L1', region: 'France', format: 'league', logoId: 9, emoji: '🇫🇷' },

  // ── Rest of Europe ──
  { slug: 'ned.1', name: 'Dutch Eredivisie', short: 'Eredivisie', abbr: 'ERE', region: 'Europe', format: 'league', logoId: 11, emoji: '🇳🇱' },
  { slug: 'por.1', name: 'Portuguese Primeira Liga', short: 'Primeira Liga', abbr: 'POR', region: 'Europe', format: 'league', logoId: 14, emoji: '🇵🇹' },

  // ── Continental cups ──
  { slug: 'uefa.champions', name: 'UEFA Champions League', short: 'Champions League', abbr: 'UCL', region: 'Continental', format: 'groups-knockout', logoId: 2, emoji: '🏆' },
  { slug: 'uefa.europa', name: 'UEFA Europa League', short: 'Europa League', abbr: 'UEL', region: 'Continental', format: 'groups-knockout', logoId: 2310, emoji: '🏆' },
  { slug: 'uefa.europa.conf', name: 'UEFA Europa Conference League', short: 'Conference League', abbr: 'UECL', region: 'Continental', format: 'groups-knockout', logoId: 20296, emoji: '🏆' },

  // ── International ──
  { slug: 'fifa.world', name: 'FIFA World Cup', short: 'World Cup', abbr: 'WC', region: 'International', format: 'groups-knockout', logoId: 4, emoji: '🌍' },
  { slug: 'fifa.cwc', name: 'FIFA Club World Cup', short: 'Club World Cup', abbr: 'CWC', region: 'International', format: 'groups-knockout', logoId: 1932, emoji: '🌍' },
  { slug: 'uefa.euro', name: 'UEFA European Championship', short: 'Euros', abbr: 'EURO', region: 'International', format: 'groups-knockout', logoId: 74, emoji: '🇪🇺' },
  { slug: 'conmebol.america', name: 'Copa América', short: 'Copa América', abbr: 'CA', region: 'International', format: 'groups-knockout', logoId: 83, emoji: '🌎' },
  { slug: 'uefa.nations', name: 'UEFA Nations League', short: 'Nations League', abbr: 'UNL', region: 'International', format: 'groups-knockout', logoId: 2395, emoji: '🇪🇺' },
  { slug: 'fifa.friendly', name: 'International Friendly', short: 'Friendlies', abbr: 'FR', region: 'International', format: 'friendlies', logoId: 53, emoji: '🤝' },

  // ── Americas ──
  { slug: 'usa.1', name: 'Major League Soccer', short: 'MLS', abbr: 'MLS', region: 'Americas', format: 'league', logoId: 19, emoji: '🇺🇸' },
  { slug: 'mex.1', name: 'Liga MX', short: 'Liga MX', abbr: 'MX', region: 'Americas', format: 'league', logoId: 22, emoji: '🇲🇽' },
  { slug: 'bra.1', name: 'Brazilian Série A', short: 'Brasileirão', abbr: 'BRA', region: 'Americas', format: 'league', logoId: 85, emoji: '🇧🇷' },
  { slug: 'arg.1', name: 'Argentine Liga Profesional', short: 'Liga Argentina', abbr: 'ARG', region: 'Americas', format: 'league', logoId: 1, emoji: '🇦🇷' },

  // ── Rest of World ──
  { slug: 'sau.1', name: 'Saudi Pro League', short: 'Saudi Pro League', abbr: 'SPL', region: 'Rest of World', format: 'league', emoji: '🇸🇦' },
];

/** The competition shown on first launch (before the user picks one). */
export const DEFAULT_LEAGUE_SLUG = 'eng.1';

const BY_SLUG: Record<string, League> = Object.fromEntries(LEAGUES.map((l) => [l.slug, l]));

export function getLeague(slug: string | undefined): League {
  return (slug && BY_SLUG[slug]) || BY_SLUG[DEFAULT_LEAGUE_SLUG];
}

/** Ordered region → leagues, for the sectioned picker. */
export function leaguesByRegion(): { region: string; leagues: League[] }[] {
  const order = ['England', 'Spain', 'Italy', 'Germany', 'France', 'Europe', 'Continental', 'International', 'Americas', 'Rest of World'];
  const map = new Map<string, League[]>();
  for (const l of LEAGUES) {
    if (!map.has(l.region)) map.set(l.region, []);
    map.get(l.region)!.push(l);
  }
  return order.filter((r) => map.has(r)).map((region) => ({ region, leagues: map.get(region)! }));
}

export function hasBracket(l: League): boolean {
  return l.format === 'groups-knockout' || l.format === 'knockout';
}

export function hasGroups(l: League): boolean {
  return l.format === 'groups-knockout' || l.format === 'league';
}
