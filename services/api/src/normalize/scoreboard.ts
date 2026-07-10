// ─── ESPN scoreboard → Scoreboard / MatchSummary normalizer ──────────────────
// Pure functions: raw ESPN JSON in, validated contract DTOs out. NO network here
// — the routes/proxy layer fetches; this module only reshapes and hardens.
//
// Correctness fixes ported from the app (artifacts/football-world-cup) that MUST
// be preserved:
//   • winner-respects-shootout — a match that finishes level in regulation but is
//     decided on penalties still has a winner (the shootout winner), so `winner`
//     is computed from the shootout scoreline, not the goal scoreline.
//   • status enums          — `isLive` / `clockRunning` come from explicit ESPN
//     status-name whitelists (halftime & the shootout are live-but-paused), and
//     `state` mirrors ESPN's pre/in/post lifecycle bucket.
//   • no premature Final     — `isFinished` is driven STRICTLY by ESPN's
//     `status.type.completed === true`; it is never inferred from `state==='post'`
//     or from the kickoff time having passed. The 'AET'/'Pens' suffix likewise
//     only appears once the match is genuinely complete.

import {
  type LeagueRef,
  type MatchSide,
  type MatchStatus,
  type MatchSummary,
  type Scoreboard,
  type Shootout,
  type Team,
  MatchStatusSchema,
  MatchSummarySchema,
  ScoreboardSchema,
} from '../contract/schema.js';
import { log } from '../lib/log.js';

// ─── Raw ESPN shapes (loose; the DTO parse at the boundary is the real guard) ──

interface RawStatusType {
  id?: string;
  name?: string;
  state?: string;
  completed?: boolean;
  description?: string;
  detail?: string;
  shortDetail?: string;
}
interface RawStatus {
  clock?: number;
  displayClock?: string;
  period?: number;
  type?: RawStatusType;
}
interface RawTeam {
  id?: string | number;
  displayName?: string;
  name?: string;
  shortDisplayName?: string;
  abbreviation?: string;
  logo?: string;
  logos?: { href?: string }[];
  color?: string;
  alternateColor?: string;
}
interface RawCompetitor {
  homeAway?: string;
  team?: RawTeam;
  score?: string | number;
  shootoutScore?: number;
  winner?: boolean;
  records?: { summary?: string }[];
}
interface RawVenue {
  fullName?: string;
  address?: { city?: string; country?: string };
}
interface RawNote {
  type?: string;
  headline?: string;
}
interface RawCompetition {
  id?: string;
  competitors?: RawCompetitor[];
  venue?: RawVenue;
  notes?: RawNote[];
  broadcast?: string;
}
interface RawSeason {
  year?: number;
  type?: number;
  slug?: string;
  name?: string;
}
interface RawEvent {
  id?: string | number;
  date?: string;
  name?: string;
  shortName?: string;
  season?: RawSeason;
  status?: RawStatus;
  competitions?: RawCompetition[];
  links?: { href?: string }[];
}
interface RawScoreboard {
  events?: RawEvent[];
  leagues?: { season?: RawSeason }[];
  day?: { date?: string };
}

// ─── Status enums (single source of truth; match.ts reuses the predicates) ────

// Any status where the ball is on the pitch — regulation, extra time or the
// shootout. Drives `isLive` + live styling. Halftime / end-of-period / the
// shootout are live but the clock is paused (see RUNNING_STATUS_NAMES).
const LIVE_STATUS_NAMES = new Set([
  'STATUS_IN_PROGRESS',
  'STATUS_HALFTIME',
  'STATUS_END_PERIOD',
  'STATUS_FIRST_HALF',
  'STATUS_SECOND_HALF',
  'STATUS_OVERTIME',
  'STATUS_EXTRA_TIME',
  'STATUS_EXTRA_TIME_HALFTIME',
  'STATUS_SHOOTOUT',
]);

// Statuses where the clock is actually ticking — halftime, end-of-period, the
// ET break and the shootout are paused states, so the on-device timer freezes.
const RUNNING_STATUS_NAMES = new Set([
  'STATUS_IN_PROGRESS',
  'STATUS_FIRST_HALF',
  'STATUS_SECOND_HALF',
  'STATUS_OVERTIME',
  'STATUS_EXTRA_TIME',
]);

/** True when a match is live (incl. the paused halftime/shootout states). */
export function isLiveStatusName(name?: string | null): boolean {
  return name != null && LIVE_STATUS_NAMES.has(name);
}

/** True only while the ball is in play (drives the self-ticking clock). */
export function isRunningStatusName(name?: string | null): boolean {
  return name != null && RUNNING_STATUS_NAMES.has(name);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNum(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : 0;
}

/** Prettify an ESPN round slug, e.g. 'round-of-16' → 'Round of 16'. */
function prettifyRound(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w.length <= 2 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
    .replace(/\bOf\b/, 'of');
}

/** Group / round label for a fixture (event note headline, else round slug). */
function roundLabel(ev: RawEvent): string {
  const note = ev.competitions?.[0]?.notes?.find((n) => n?.type === 'event');
  if (note?.headline) return note.headline;
  const slug = ev.season?.slug;
  return slug ? prettifyRound(slug) : '';
}

/** Short human label for the status ("HT", "FT", "63'", kickoff time). */
function statusDetailLabel(
  t: RawStatusType,
  isLive: boolean,
  isFinished: boolean,
  displayClock?: string,
): string {
  const name = t.name ?? '';
  if (name === 'STATUS_HALFTIME') return 'HT';
  if (name === 'STATUS_EXTRA_TIME_HALFTIME') return 'ET HT';
  if (name === 'STATUS_SHOOTOUT' || name === 'STATUS_FINAL_PEN') return 'Pens';
  if (isLive) {
    const clk = (displayClock ?? '').trim();
    if (clk) return /['’]\s*$/.test(clk) ? clk : `${clk}'`;
    return t.shortDetail ?? t.detail ?? 'LIVE';
  }
  if (isFinished) return 'FT';
  // Scheduled: fall back to ESPN's server-rendered short detail (kickoff time).
  return t.shortDetail ?? t.detail ?? '';
}

/**
 * Normalize an ESPN status block. `state` mirrors ESPN's lifecycle bucket, but
 * `isFinished` is bound to `completed === true` alone — never to `state` or to
 * the clock — so a live match, a break, or a stale `state:'post'` can't surface
 * a premature Final.
 */
export function normalizeStatus(raw: unknown): MatchStatus {
  const s = (raw ?? {}) as RawStatus;
  const t: RawStatusType = s.type ?? {};
  const name = t.name || undefined;
  const isFinished = t.completed === true;
  const isLive = isLiveStatusName(name);
  const clockRunning = isRunningStatusName(name);

  const rawState = t.state;
  const state: MatchStatus['state'] =
    rawState === 'pre' || rawState === 'in' || rawState === 'post'
      ? rawState
      : isFinished
        ? 'post'
        : isLive
          ? 'in'
          : 'pre';

  const period =
    typeof s.period === 'number' && s.period > 0 ? s.period : undefined;
  const clock = isLive && s.displayClock ? s.displayClock : undefined;

  return MatchStatusSchema.parse({
    state,
    name,
    detail: statusDetailLabel(t, isLive, isFinished, s.displayClock),
    clock,
    period,
    isLive,
    isFinished,
    clockRunning,
  });
}

function buildTeam(t: RawTeam | undefined): Team {
  const team = t ?? {};
  return {
    id: String(team.id ?? ''),
    name: team.displayName ?? team.name ?? '',
    shortName: team.shortDisplayName || undefined,
    abbreviation: team.abbreviation ?? '',
    logo: team.logo ?? team.logos?.[0]?.href ?? '',
    color: team.color || undefined,
    alternateColor: team.alternateColor || undefined,
  };
}

function buildSide(c: RawCompetitor | undefined): MatchSide {
  return {
    team: buildTeam(c?.team),
    score: c?.score != null ? String(c.score) : '',
    shootoutScore:
      typeof c?.shootoutScore === 'number' ? c.shootoutScore : undefined,
    record: c?.records?.[0]?.summary || undefined,
  };
}

function shootoutOf(
  home: RawCompetitor | undefined,
  away: RawCompetitor | undefined,
): Shootout | null {
  if (
    typeof home?.shootoutScore === 'number' &&
    typeof away?.shootoutScore === 'number'
  ) {
    return { home: home.shootoutScore, away: away.shootoutScore };
  }
  return null;
}

function isPenaltyShootout(ev: RawEvent, shootout: Shootout | null): boolean {
  const name = ev.status?.type?.name;
  return (
    shootout != null ||
    name === 'STATUS_SHOOTOUT' ||
    name === 'STATUS_FINAL_PEN'
  );
}

/** 'Pens' / 'AET' suffix for a decided knockout result, else '' — post-only. */
function resultSuffixFor(
  ev: RawEvent,
  isFinished: boolean,
  shootout: Shootout | null,
): string {
  if (isPenaltyShootout(ev, shootout)) return 'Pens';
  // Regulation is 2 periods; a completed match beyond that went to extra time.
  const period = ev.status?.period ?? 0;
  if (isFinished && period > 2) return 'AET';
  return '';
}

// ─── Public normalizers ────────────────────────────────────────────────────────

/** One ESPN scoreboard/bracket event → a validated MatchSummary. Throws on garbage. */
export function normalizeMatchSummary(
  raw: unknown,
  league: LeagueRef,
): MatchSummary {
  const ev = (raw ?? {}) as RawEvent;
  const comp = ev.competitions?.[0];
  const competitors = comp?.competitors ?? [];
  const homeRaw =
    competitors.find((c) => c?.homeAway === 'home') ?? competitors[0];
  const awayRaw =
    competitors.find((c) => c?.homeAway === 'away') ?? competitors[1];

  const status = normalizeStatus(ev.status);
  const home = buildSide(homeRaw);
  const away = buildSide(awayRaw);
  const shootout = shootoutOf(homeRaw, awayRaw);

  // ── winner-respects-shootout ──
  // A winner is only marked once the match is complete. A penalty shootout
  // overrides the regulation scoreline: a 1–1 that ends 4–3 on pens has a
  // winner even though the goals are level. When regulation is decided we trust
  // the goal scoreline; when it's level with no shootout (e.g. a tie decided on
  // aggregate over two legs) we fall back to ESPN's explicit `winner` flag.
  if (status.isFinished) {
    if (shootout) {
      home.winner = shootout.home > shootout.away;
      away.winner = shootout.away > shootout.home;
    } else {
      const hs = toNum(home.score);
      const as = toNum(away.score);
      if (home.score !== '' && away.score !== '' && hs !== as) {
        home.winner = hs > as;
        away.winner = as > hs;
      } else {
        if (homeRaw?.winner === true) home.winner = true;
        if (awayRaw?.winner === true) away.winner = true;
      }
    }
  }

  return MatchSummarySchema.parse({
    id: String(ev.id ?? ''),
    league,
    date: ev.date ?? '',
    round: roundLabel(ev) || undefined,
    status,
    home,
    away,
    venue: comp?.venue?.fullName || undefined,
    city: comp?.venue?.address?.city || undefined,
    shootout: shootout ?? null,
    resultSuffix: resultSuffixFor(ev, status.isFinished, shootout),
  });
}

/**
 * A list of ESPN events → MatchSummary[]. Events that fail to normalize are
 * skipped (and logged) so one malformed fixture can't sink the whole payload —
 * used by the /matches/upcoming, /bracket and /standings routes.
 */
export function normalizeMatchSummaries(
  events: unknown,
  league: LeagueRef,
): MatchSummary[] {
  const list = Array.isArray(events) ? events : [];
  const out: MatchSummary[] = [];
  for (const ev of list) {
    try {
      out.push(normalizeMatchSummary(ev, league));
    } catch (err) {
      log('normalize:scoreboard').warn(
        { err, eventId: (ev as RawEvent)?.id },
        'skipped malformed event',
      );
    }
  }
  return out;
}

/**
 * ESPN scoreboard payload → a validated Scoreboard. `requestedDates` echoes the
 * caller's ?dates= param (falls back to ESPN's `day.date`). Individual bad
 * fixtures are dropped rather than failing the whole day.
 */
export function normalizeScoreboard(
  raw: unknown,
  league: LeagueRef,
  requestedDates?: string,
): Scoreboard {
  const sb = (raw ?? {}) as RawScoreboard;
  const matches = normalizeMatchSummaries(sb.events, league);

  const rawSeason = sb.leagues?.[0]?.season;
  const season =
    rawSeason?.year != null
      ? { year: rawSeason.year, type: rawSeason.type, name: rawSeason.name }
      : undefined;

  return ScoreboardSchema.parse({
    league,
    date: requestedDates ?? sb.day?.date ?? undefined,
    season,
    matches,
  });
}
