import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { siteBase, coreBase, webBase, espnFetch } from '@/lib/espn';
import { useLeague, useLeagueSeason } from '@/hooks/useLeague';
import { hasBracket as leagueHasBracket } from '@/config/leagues';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EspnTeam {
  id: string;
  displayName: string;
  abbreviation: string;
  logo: string;
  color?: string;
  alternateColor?: string;
}

export interface EspnCompetitor {
  homeAway: 'home' | 'away';
  team: EspnTeam;
  score: string;
  shootoutScore?: number;
  winner?: boolean;
  records?: { summary: string }[];
}

export interface EspnEvent {
  id: string;
  date: string;
  name: string;
  shortName: string;
  season?: { year: number; type: number; slug: string };
  status: {
    clock?: number;
    displayClock?: string;
    period?: number;
    type: {
      id: string;
      name: string;
      description: string;
      detail: string;
      shortDetail: string;
      completed: boolean;
    };
  };
  competitions: {
    id: string;
    competitors: EspnCompetitor[];
    venue?: { fullName: string; address?: { city: string; country: string } };
    notes?: { type: string; headline: string }[];
    broadcast?: string;
  }[];
  links: { href: string }[];
}

export interface EspnStandingEntry {
  team: EspnTeam;
  stats: { name: string; value: number; displayValue: string }[];
  note?: { color?: string; description?: string };
}

export interface EspnGroup {
  name: string;
  abbreviation: string;
  standings: {
    entries: EspnStandingEntry[];
  };
}

export interface EspnFullTeam {
  id: string;
  uid: string;
  displayName: string;
  shortDisplayName: string;
  abbreviation: string;
  logos: { href: string }[];
  color?: string;
  alternateColor?: string;
  location?: string;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}


// ─── Scoreboard ───────────────────────────────────────────────────────────────

export function useScoreboard(dates?: string) {
  const { slug } = useLeague();
  const url = dates
    ? `${siteBase(slug)}/scoreboard?dates=${dates}`
    : `${siteBase(slug)}/scoreboard`;
  return useQuery<{ events: EspnEvent[]; leagues: any[] }>({
    queryKey: ['scoreboard', slug, dates ?? 'today'],
    queryFn: () => espnFetch(url),
    // Polymarket drives instant scores; ESPN refreshes in the background.
    refetchInterval: (query) => ((query.state.data?.events ?? []).some(isLive) ? 45_000 : 120_000),
    staleTime: 10_000,
    // Keep the current day's fixtures on screen while a new date loads, so
    // switching matchdays never flashes a full-screen spinner.
    placeholderData: keepPreviousData,
  });
}

export function useUpcomingMatches(fromDate?: string, enabled = true) {
  const { slug } = useLeague();
  const startDate = fromDate ?? ymd(new Date());
  const end = new Date();
  end.setDate(end.getDate() + 45);
  const endDate = ymd(end);

  return useQuery<{ events: EspnEvent[]; leagues: any[] }>({
    queryKey: ['scoreboard', slug, 'upcoming', startDate],
    enabled,
    queryFn: async () => {
      const data = await espnFetch(`${siteBase(slug)}/scoreboard?dates=${startDate}-${endDate}&limit=400`);
      const events: EspnEvent[] = (data.events ?? [])
        .filter((event: EspnEvent) => !hasStarted(event))
        .sort((a: EspnEvent, b: EspnEvent) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(0, 8);
      return { events, leagues: data.leagues ?? [] };
    },
    // Upcoming fixtures are effectively static — refresh occasionally, not every minute.
    refetchInterval: 5 * 60_000,
    staleTime: 5 * 60_000,
  });
}

// ─── Standings ────────────────────────────────────────────────────────────────

// One unified endpoint returns the full standings for any competition: a single
// table for a league, or one child per group for a cup/tournament. Teams are
// inlined (no $ref resolution) and each entry carries a `note` we use for the
// qualification colour, so the WC-specific "top 2 advance" hardcode is gone.
export function useStandings() {
  const { slug } = useLeague();
  const season = useLeagueSeason();
  return useQuery<{ children: EspnGroup[] }>({
    queryKey: ['standings', slug, season],
    enabled: season != null,
    queryFn: async () => {
      const data = await espnFetch(`${webBase(slug)}/standings?season=${season}`);
      const rawChildren: any[] = data?.children?.length
        ? data.children
        : data?.standings
          ? [{ name: data?.name ?? '', abbreviation: data?.abbreviation ?? '', standings: data.standings }]
          : [];

      const children: EspnGroup[] = rawChildren
        .map((child: any): EspnGroup | null => {
          const entries: EspnStandingEntry[] = (child?.standings?.entries ?? []).map((e: any) => {
            const tm = e.team ?? {};
            const logo = tm.logos?.[0]?.href ?? tm.logo ?? '';
            return {
              team: {
                id: String(tm.id ?? ''),
                displayName: tm.displayName ?? tm.name ?? '',
                abbreviation: tm.abbreviation ?? '',
                logo,
                color: tm.color,
              },
              stats: (e.stats ?? []).map((s: any) => ({
                name: s.name,
                value: Number(s.value ?? 0),
                displayValue: s.displayValue ?? String(s.value ?? ''),
              })),
              note: e.note ? { color: e.note.color, description: e.note.description } : undefined,
            };
          });
          if (entries.length === 0) return null;
          entries.sort((a, b) => {
            const ra = Number(a.stats.find((s) => s.name === 'rank')?.value ?? 99);
            const rb = Number(b.stats.find((s) => s.name === 'rank')?.value ?? 99);
            return ra - rb;
          });
          return {
            name: child?.name ?? '',
            abbreviation: child?.abbreviation ?? child?.name ?? '',
            standings: { entries },
          };
        })
        .filter((g): g is EspnGroup => g != null);

      if (children.length === 0) throw new Error('Failed to load standings');
      return { children };
    },
    staleTime: 10 * 60_000,
    refetchOnMount: false,
  });
}

// ─── Teams ────────────────────────────────────────────────────────────────────

export function useTeams() {
  const { slug } = useLeague();
  return useQuery<{ sports: { leagues: { teams: { team: EspnFullTeam }[] }[] }[] }>({
    queryKey: ['teams', slug],
    queryFn: () => espnFetch(`${siteBase(slug)}/teams?limit=100`),
    // The team list is static for a season — don't refetch on mount.
    staleTime: 300_000,
    refetchOnMount: false,
  });
}

// ─── Bracket (knockout rounds) ────────────────────────────────────────────────

export interface BracketRound {
  name: string;
  events: EspnEvent[];
}

// Group/regular-phase slugs that are NOT knockout rounds, so we exclude them
// from the bracket regardless of competition.
const NON_KNOCKOUT_SLUGS = new Set([
  'group-stage', 'league-phase', 'regular-season', 'first-stage', 'groups',
]);

// Prettify an ESPN round slug into a display name, e.g. 'round-of-16' → 'Round of 16'.
function prettifyRound(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w.length <= 2 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
    .replace(/\bOf\b/, 'of');
}

export function useBracket() {
  const { slug, league } = useLeague();
  const season = useLeagueSeason();
  return useQuery<{ rounds: BracketRound[] }>({
    queryKey: ['bracket', slug, season],
    // Only competitions with a knockout stage have a bracket at all.
    enabled: season != null && leagueHasBracket(league),
    queryFn: async () => {
      // ESPN's `dates=YYYY` returns a CALENDAR year, not a season — and a season
      // spans two calendar years (e.g. a 2025-26 cup plays its group/league phase
      // in 2025 and its knockouts in 2026). So we pull both calendar years and
      // keep only events whose `season.year` matches this competition's current
      // season. (A single wide date range would trip ESPN's ~1-year limit → 400.)
      // `enabled` guarantees season is defined by the time the query runs.
      const yr = season!;
      const [curYear, nextYear] = await Promise.all([
        espnFetch(`${siteBase(slug)}/scoreboard?dates=${yr}&limit=1000`),
        espnFetch(`${siteBase(slug)}/scoreboard?dates=${yr + 1}&limit=1000`).catch(() => ({ events: [] })),
      ]);
      const byId = new Map<string, EspnEvent>();
      for (const ev of [...(curYear.events ?? []), ...(nextYear.events ?? [])] as EspnEvent[]) {
        // Filter to the current season and dedupe (an event can appear in both
        // calendar-year queries near a year boundary).
        if (ev.season?.year === yr) byId.set(ev.id, ev);
      }
      const events: EspnEvent[] = [...byId.values()];

      const bySlug: Record<string, EspnEvent[]> = {};
      for (const ev of events) {
        const roundSlug = ev.season?.slug ?? '';
        if (!roundSlug || NON_KNOCKOUT_SLUGS.has(roundSlug)) continue;
        (bySlug[roundSlug] ??= []).push(ev);
      }

      // Order rounds chronologically by their earliest fixture (knockout rounds
      // happen in sequence), so this works for any competition's round naming.
      const rounds: BracketRound[] = Object.entries(bySlug)
        .map(([roundSlug, evs]) => ({
          name: prettifyRound(roundSlug),
          events: evs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
          _min: Math.min(...evs.map((e) => new Date(e.date).getTime())),
        }))
        .sort((a, b) => a._min - b._min)
        .map(({ name, events }) => ({ name, events }));

      return { rounds };
    },
    staleTime: 5 * 60_000,
    // Only poll while a knockout match is live.
    refetchInterval: (query) => {
      const evs = (query.state.data?.rounds ?? []).flatMap((r) => r.events);
      return evs.some(isLive) ? 60_000 : false;
    },
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const LIVE_STATUSES = new Set([
  'STATUS_IN_PROGRESS',
  'STATUS_HALFTIME',
  'STATUS_END_PERIOD',
  'STATUS_OVERTIME',
  'STATUS_SHOOTOUT',
  'STATUS_FIRST_HALF',
  'STATUS_SECOND_HALF',
  'STATUS_EXTRA_TIME',
  'STATUS_EXTRA_TIME_HALFTIME',
]);

export function isLive(event: EspnEvent): boolean {
  const name = event.status?.type?.name ?? '';
  return LIVE_STATUSES.has(name);
}

export function isFinished(event: EspnEvent): boolean {
  return event.status?.type?.completed === true;
}

/** True once the match start time has passed, even if API status hasn't updated yet */
export function hasStarted(event: EspnEvent): boolean {
  if (isLive(event) || isFinished(event)) return true;
  return Date.now() >= new Date(event.date).getTime();
}

export function getStatusLabel(event: EspnEvent): string {
  const t = event.status?.type;
  if (!t) return '';
  if (t.name === 'STATUS_HALFTIME') return 'Half Time';
  if (t.name === 'STATUS_EXTRA_TIME_HALFTIME') return 'ET HT';
  if (t.name === 'STATUS_SHOOTOUT') return 'Penalties';
  if (LIVE_STATUSES.has(t.name)) {
    const clock = event.status.displayClock;
    return clock ? `${clock}'` : t.shortDetail ?? 'LIVE';
  }
  if (t.completed) return 'FT';
  // scheduled — show local time
  const d = new Date(event.date);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** True when the match was decided (or is being decided) on penalties. */
export function isPenaltyShootout(event: EspnEvent): boolean {
  const comps = event.competitions?.[0]?.competitors ?? [];
  const hasSo = comps.some((c) => c.shootoutScore != null);
  return hasSo || event.status?.type?.name === 'STATUS_SHOOTOUT' || event.status?.type?.name === 'STATUS_FINAL_PEN';
}

/** "AET" / "Pens" suffix for a finished knockout result, else ''. */
export function getResultSuffix(event: EspnEvent): string {
  if (isPenaltyShootout(event)) return 'Pens';
  const period = event.status?.period ?? 0;
  // Regulation is 2 periods; anything beyond means the match went to extra time.
  if (isFinished(event) && period > 2) return 'AET';
  return '';
}

/** Shootout scoreline like "4-3" when the match went to penalties, else null. */
export function getShootoutScore(event: EspnEvent): { home: number; away: number } | null {
  const comps = event.competitions?.[0]?.competitors ?? [];
  const home = comps.find((c) => c.homeAway === 'home');
  const away = comps.find((c) => c.homeAway === 'away');
  if (home?.shootoutScore == null || away?.shootoutScore == null) return null;
  return { home: home.shootoutScore, away: away.shootoutScore };
}

export function getGroupLabel(event: EspnEvent): string {
  const note = event.competitions?.[0]?.notes?.find(n => n.type === 'event');
  if (note?.headline) return note.headline;
  const slug = event.season?.slug;
  return slug ? prettifyRound(slug) : '';
}
