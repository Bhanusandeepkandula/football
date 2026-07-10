// ─── Shared ESPN → contract normalizers ──────────────────────────────────────
// Ported from the app's hooks (useWorldCup) so the API emits exactly the shapes
// the app already consumes. These build the `MatchSummary`/`MatchStatus`/`Team`
// values shared by the scoreboard, upcoming and bracket endpoints. Every output
// is validated against src/contract/schema.ts at the route boundary, so `any` on
// ESPN's untyped JSON here can never reach the client unvalidated.

import type { LeagueRef, MatchSide, MatchStatus, MatchSummary, Team } from '../contract/schema.js';

// Statuses where the match is actively in its lifecycle (regulation, ET, pens).
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

// Statuses where the ball is actually in play (drives the on-device clock).
const RUNNING_STATUSES = new Set([
  'STATUS_IN_PROGRESS',
  'STATUS_FIRST_HALF',
  'STATUS_SECOND_HALF',
  'STATUS_OVERTIME',
  'STATUS_EXTRA_TIME',
]);

// Group / league-phase round slugs that are NOT knockout rounds.
export const NON_KNOCKOUT_SLUGS = new Set([
  'group-stage',
  'league-phase',
  'regular-season',
  'first-stage',
  'groups',
]);

export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/** Prettify an ESPN round slug, e.g. 'round-of-16' → 'Round of 16'. */
export function prettifyRound(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w.length <= 2 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
    .replace(/\bOf\b/, 'of');
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function isLive(event: any): boolean {
  return LIVE_STATUSES.has(event?.status?.type?.name ?? '');
}

export function isFinished(event: any): boolean {
  return event?.status?.type?.completed === true;
}

/** True once kickoff has passed, even if ESPN's status hasn't flipped yet. */
export function hasStarted(event: any): boolean {
  if (isLive(event) || isFinished(event)) return true;
  return Date.now() >= new Date(event?.date).getTime();
}

function isPenaltyShootout(event: any): boolean {
  const comps: any[] = event?.competitions?.[0]?.competitors ?? [];
  const hasSo = comps.some((c) => c?.shootoutScore != null);
  const name = event?.status?.type?.name;
  return hasSo || name === 'STATUS_SHOOTOUT' || name === 'STATUS_FINAL_PEN';
}

/** "AET" / "Pens" suffix for a finished knockout result, else ''. */
export function getResultSuffix(event: any): string {
  if (isPenaltyShootout(event)) return 'Pens';
  const period = event?.status?.period ?? 0;
  if (isFinished(event) && period > 2) return 'AET';
  return '';
}

/** Shootout scoreline like { home: 4, away: 3 } when it went to pens, else null. */
export function getShootoutScore(event: any): { home: number; away: number } | null {
  const comps: any[] = event?.competitions?.[0]?.competitors ?? [];
  const home = comps.find((c) => c?.homeAway === 'home');
  const away = comps.find((c) => c?.homeAway === 'away');
  if (home?.shootoutScore == null || away?.shootoutScore == null) return null;
  return { home: home.shootoutScore, away: away.shootoutScore };
}

/** Group/round label for a fixture (event note headline, else round slug). */
export function getGroupLabel(event: any): string {
  const note = event?.competitions?.[0]?.notes?.find((n: any) => n?.type === 'event');
  if (note?.headline) return note.headline;
  const slug = event?.season?.slug;
  return slug ? prettifyRound(slug) : '';
}

function toTeam(team: any): Team {
  return {
    id: String(team?.id ?? ''),
    name: team?.displayName ?? team?.name ?? '',
    shortName: team?.shortDisplayName ?? undefined,
    abbreviation: team?.abbreviation ?? '',
    logo: team?.logos?.[0]?.href ?? team?.logo ?? '',
    color: team?.color ?? undefined,
    alternateColor: team?.alternateColor ?? undefined,
  };
}

function toSide(competitor: any): MatchSide {
  return {
    team: toTeam(competitor?.team),
    score: competitor?.score ?? '',
    shootoutScore:
      typeof competitor?.shootoutScore === 'number' ? competitor.shootoutScore : undefined,
    winner: typeof competitor?.winner === 'boolean' ? competitor.winner : undefined,
    record: competitor?.records?.[0]?.summary ?? undefined,
  };
}

/** Normalize an ESPN event status into the shared `MatchStatus`. */
export function normalizeStatus(event: any): MatchStatus {
  const type = event?.status?.type ?? {};
  const name: string | undefined = type?.name ?? undefined;
  const live = LIVE_STATUSES.has(name ?? '');
  const finished = type?.completed === true;
  const rawState = type?.state;
  const state: MatchStatus['state'] =
    rawState === 'pre' || rawState === 'in' || rawState === 'post'
      ? rawState
      : finished
        ? 'post'
        : live
          ? 'in'
          : 'pre';
  const displayClock: string | undefined = event?.status?.displayClock ?? undefined;
  const period = event?.status?.period;
  return {
    state,
    name,
    detail: type?.shortDetail ?? type?.detail ?? '',
    clock: live && displayClock ? displayClock : undefined,
    period: typeof period === 'number' ? period : undefined,
    isLive: live,
    isFinished: finished,
    clockRunning: RUNNING_STATUSES.has(name ?? ''),
  };
}

/** Normalize an ESPN scoreboard event into a `MatchSummary`. */
export function toMatchSummary(event: any, league: LeagueRef): MatchSummary {
  const comp = event?.competitions?.[0] ?? {};
  const competitors: any[] = comp?.competitors ?? [];
  const home = competitors.find((c) => c?.homeAway === 'home') ?? competitors[0];
  const away = competitors.find((c) => c?.homeAway === 'away') ?? competitors[1];
  const shootout = getShootoutScore(event);
  const suffix = getResultSuffix(event);
  return {
    id: String(event?.id ?? ''),
    league,
    date: event?.date ?? '',
    round: getGroupLabel(event) || undefined,
    status: normalizeStatus(event),
    home: toSide(home),
    away: toSide(away),
    venue: comp?.venue?.fullName ?? undefined,
    city: comp?.venue?.address?.city ?? undefined,
    shootout,
    resultSuffix: suffix || undefined,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
