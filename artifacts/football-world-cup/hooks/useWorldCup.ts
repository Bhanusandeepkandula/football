import { useQuery } from '@tanstack/react-query';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world';
const ESPN_CORE = 'https://sports.core.api.espn.com/v2/sports/soccer/leagues/fifa.world';

async function espnFetch(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN API error: ${res.status}`);
  return res.json();
}

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

// ─── Scoreboard ───────────────────────────────────────────────────────────────

export function useScoreboard(dates?: string) {
  const url = dates
    ? `${ESPN_BASE}/scoreboard?dates=${dates}`
    : `${ESPN_BASE}/scoreboard`;
  return useQuery<{ events: EspnEvent[]; leagues: any[] }>({
    queryKey: ['scoreboard', dates ?? 'today'],
    queryFn: () => espnFetch(url),
    refetchInterval: 30_000, // refresh every 30s for live scores
    staleTime: 15_000,
  });
}

// ─── Standings ────────────────────────────────────────────────────────────────

const SEASON = 2026;
const GROUP_LETTERS = 'ABCDEFGHIJKL';
// The tournament spans these dates; the default scoreboard only returns the
// current day's matches, so we request the full range to see every team/match.
const TOURNAMENT_RANGE = '20260611-20260719';

function teamIdFromRef(ref: string): string {
  const m = /teams\/(\d+)/.exec(ref ?? '');
  return m ? m[1] : '';
}

// ESPN's public `/standings` endpoint is empty for fifa.world; the real group
// tables live in the core API, one standings resource per group, with teams
// referenced by $ref. We resolve those refs against a team lookup built from
// the tournament scoreboard (the `/teams` endpoint lacks CORS headers, which
// breaks the web preview, whereas the scoreboard sends `allow-origin: *` and
// its competitors already cover all 48 nations).
export function useStandings() {
  return useQuery<{ children: EspnGroup[] }>({
    queryKey: ['standings', SEASON],
    queryFn: async () => {
      const sb = await espnFetch(`${ESPN_BASE}/scoreboard?dates=${TOURNAMENT_RANGE}&limit=400`);
      const teamMap = new Map<string, EspnTeam>();
      for (const ev of (sb.events ?? []) as EspnEvent[]) {
        for (const c of ev.competitions?.[0]?.competitors ?? []) {
          const tm = c.team;
          if (tm?.id && !teamMap.has(tm.id)) {
            teamMap.set(tm.id, {
              id: tm.id,
              displayName: tm.displayName,
              abbreviation: tm.abbreviation,
              logo: tm.logo ?? '',
              color: tm.color,
            });
          }
        }
      }

      const groupIds = Array.from({ length: 12 }, (_, i) => i + 1);
      const results = await Promise.all(
        groupIds.map(async (gid): Promise<EspnGroup | null> => {
          try {
            const st = await espnFetch(
              `${ESPN_CORE}/seasons/${SEASON}/types/1/groups/${gid}/standings/0`
            );
            const entries: EspnStandingEntry[] = (st.standings ?? []).map((e: any) => {
              const id = teamIdFromRef(e.team?.$ref ?? '');
              const team =
                teamMap.get(id) ?? { id, displayName: '', abbreviation: '', logo: '' };
              const stats = e.records?.[0]?.stats ?? [];
              return { team, stats };
            });
            entries.sort((a, b) => {
              const ra = Number(a.stats.find((s) => s.name === 'rank')?.value ?? 99);
              const rb = Number(b.stats.find((s) => s.name === 'rank')?.value ?? 99);
              return ra - rb;
            });
            if (entries.length === 0) return null;
            const letter = GROUP_LETTERS[gid - 1] ?? String(gid);
            return {
              name: `Group ${letter}`,
              abbreviation: `Group ${letter}`,
              standings: { entries },
            };
          } catch {
            return null;
          }
        })
      );

      const children = results.filter((g): g is EspnGroup => g != null);
      // If every group fetch failed, treat it as an error rather than silently
      // showing an empty "not available yet" state.
      if (children.length === 0) throw new Error('Failed to load group standings');
      children.sort((a, b) => a.name.localeCompare(b.name));
      return { children };
    },
    staleTime: 60_000,
  });
}

// ─── Teams ────────────────────────────────────────────────────────────────────

export function useTeams() {
  return useQuery<{ sports: { leagues: { teams: { team: EspnFullTeam }[] }[] }[] }>({
    queryKey: ['teams'],
    queryFn: () => espnFetch(`${ESPN_BASE}/teams?limit=100`),
    staleTime: 300_000,
  });
}

// ─── Bracket (knockout rounds) ────────────────────────────────────────────────

export interface BracketRound {
  name: string;
  events: EspnEvent[];
}

// Each event carries `season.slug` identifying its round. Ordered outermost
// (most teams) first so the circular bracket renders correctly; the 3rd-place
// match is last so it appears in the list view but not the bracket tree.
const KNOCKOUT_ROUNDS: { slug: string; name: string }[] = [
  { slug: 'round-of-32', name: 'Round of 32' },
  { slug: 'round-of-16', name: 'Round of 16' },
  { slug: 'quarterfinals', name: 'Quarterfinals' },
  { slug: 'semifinals', name: 'Semifinals' },
  { slug: 'final', name: 'Final' },
  { slug: '3rd-place-match', name: '3rd Place' },
];

export function useBracket() {
  return useQuery<{ rounds: BracketRound[] }>({
    queryKey: ['bracket'],
    queryFn: async () => {
      const data = await espnFetch(
        `${ESPN_BASE}/scoreboard?dates=${TOURNAMENT_RANGE}&limit=400`
      );
      const events: EspnEvent[] = data.events ?? [];

      const bySlug: Record<string, EspnEvent[]> = {};
      for (const ev of events) {
        const slug = ev.season?.slug ?? '';
        if (!slug || slug === 'group-stage') continue;
        (bySlug[slug] ??= []).push(ev);
      }

      const rounds: BracketRound[] = KNOCKOUT_ROUNDS.filter(
        (k) => bySlug[k.slug]?.length
      ).map((k) => ({
        name: k.name,
        events: bySlug[k.slug].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        ),
      }));

      return { rounds };
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
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
  return KNOCKOUT_ROUNDS.find(k => k.slug === slug)?.name ?? '';
}
