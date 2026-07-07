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
  winner?: boolean;
  records?: { summary: string }[];
}

export interface EspnEvent {
  id: string;
  date: string;
  name: string;
  shortName: string;
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

export function useStandings() {
  return useQuery<{ children: EspnGroup[] }>({
    queryKey: ['standings'],
    queryFn: () => espnFetch(`${ESPN_BASE}/standings`),
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

const KNOCKOUT_ROUND_NAMES = [
  'Round of 32',
  'Round of 16',
  'Quarterfinal',
  'Semifinal',
  '3rd Place',
  'Final',
] as const;

/** Returns the canonical knockout-round name for a match, or null if it is a group-stage match. */
function classifyKnockoutRound(ev: EspnEvent): string | null {
  // ESPN embeds round info in competition notes with type === 'event'
  const notes = ev.competitions?.[0]?.notes ?? [];
  const note = (notes as { type: string; headline?: string }[]).find(n => n.type === 'event');
  const headline = note?.headline ?? '';

  // Try to match the headline to a known knockout round
  for (const round of KNOCKOUT_ROUND_NAMES) {
    if (headline.toLowerCase().includes(round.toLowerCase())) return round;
  }

  // Fall back to deriving from event name only if no headline is provided
  // AND if the event name strongly implies a knockout round (not a group match).
  const name = (ev.name ?? '').toLowerCase();

  // Group-stage matches typically include "group" in the name or have a
  // competition note of type "group". Exclude them explicitly.
  const hasGroupNote = (notes as { type: string }[]).some(n => n.type === 'group');
  if (hasGroupNote) return null;
  if (name.includes('group ')) return null;

  for (const round of KNOCKOUT_ROUND_NAMES) {
    if (name.includes(round.toLowerCase())) return round;
  }

  // Unable to classify — exclude from bracket rather than showing garbage
  return null;
}

export function useBracket() {
  return useQuery<{ rounds: BracketRound[] }>({
    queryKey: ['bracket'],
    queryFn: async () => {
      const data = await espnFetch(`${ESPN_BASE}/scoreboard?limit=200`);
      const events: EspnEvent[] = data.events ?? [];

      const roundMap: Record<string, EspnEvent[]> = {};

      for (const ev of events) {
        const roundName = classifyKnockoutRound(ev);
        if (!roundName) continue; // skip group-stage and unclassified events
        if (!roundMap[roundName]) roundMap[roundName] = [];
        roundMap[roundName].push(ev);
      }

      const rounds: BracketRound[] = Object.entries(roundMap)
        .map(([name, evs]) => ({ name, events: evs }))
        .sort((a, b) => {
          const ai = KNOCKOUT_ROUND_NAMES.findIndex(r =>
            a.name.toLowerCase().includes(r.toLowerCase())
          );
          const bi = KNOCKOUT_ROUND_NAMES.findIndex(r =>
            b.name.toLowerCase().includes(r.toLowerCase())
          );
          if (ai === -1 && bi === -1) return 0;
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        });

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

export function getGroupLabel(event: EspnEvent): string {
  const note = event.competitions?.[0]?.notes?.find(n => n.type === 'event');
  return note?.headline ?? '';
}
