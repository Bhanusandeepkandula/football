// ─── Knockout bracket normalizer ──────────────────────────────────────────────
// ESPN has no single "bracket" endpoint — a competition's knockout fixtures live
// in the scoreboard, tagged with a `season.slug` per round (`round-of-16`,
// `quarterfinals`, …). A season spans two calendar years, so the route fetches
// `scoreboard?dates=YYYY` for both the season year and the next and hands the raw
// payloads here. We: (1) merge + dedupe events, (2) keep only the requested
// season, (3) drop group/league-phase fixtures, (4) group by round and ORDER the
// rounds by their knockout ordinal (round-of-32 → 16 → QF → SF → 3rd → final),
// falling back to earliest kickoff for unknown slugs. Output is `BracketSchema`
// validated so malformed ESPN data can't reach the client.

import { z } from 'zod';
import {
  BracketSchema,
  type Bracket,
  type BracketRound,
  type LeagueRef,
  type MatchSide,
  type MatchStatus,
  type MatchSummary,
  type Shootout,
  type Team,
} from '../contract/schema.js';

// ── Permissive raw scoreboard shapes ──────────────────────────────────────────
const RawTeamSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  displayName: z.string().optional(),
  name: z.string().optional(),
  shortDisplayName: z.string().optional(),
  abbreviation: z.string().optional(),
  logo: z.string().optional(),
  logos: z.array(z.object({ href: z.string().optional() })).optional(),
  color: z.string().optional(),
  alternateColor: z.string().optional(),
});
type RawTeam = z.infer<typeof RawTeamSchema>;

const RawCompetitorSchema = z.object({
  homeAway: z.string().optional(),
  team: RawTeamSchema.optional(),
  score: z.union([z.string(), z.number()]).optional(),
  shootoutScore: z.number().optional(),
  winner: z.boolean().optional(),
  records: z.array(z.object({ summary: z.string().optional() })).optional(),
});
type RawCompetitor = z.infer<typeof RawCompetitorSchema>;

const RawStatusTypeSchema = z.object({
  name: z.string().optional(),
  state: z.string().optional(),
  detail: z.string().optional(),
  shortDetail: z.string().optional(),
  completed: z.boolean().optional(),
});

const RawStatusSchema = z.object({
  displayClock: z.string().optional(),
  period: z.number().optional(),
  type: RawStatusTypeSchema.optional(),
});

const RawCompetitionSchema = z.object({
  competitors: z.array(RawCompetitorSchema).optional(),
  venue: z
    .object({ fullName: z.string().optional(), address: z.object({ city: z.string().optional() }).optional() })
    .optional(),
  notes: z.array(z.object({ type: z.string().optional(), headline: z.string().optional() })).optional(),
});

const RawEventSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  date: z.string().optional(),
  season: z.object({ year: z.number().optional(), type: z.number().optional(), slug: z.string().optional() }).optional(),
  status: RawStatusSchema.optional(),
  competitions: z.array(RawCompetitionSchema).optional(),
});
type RawEvent = z.infer<typeof RawEventSchema>;

const RawScoreboardSchema = z.object({ events: z.array(RawEventSchema).optional() });

// Statuses where the match is being actively played (drives isLive / clockRunning).
const LIVE_STATUSES = new Set([
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
// Statuses where the ball is actually in play — the clock only runs for these.
const RUNNING_STATUSES = new Set([
  'STATUS_IN_PROGRESS',
  'STATUS_FIRST_HALF',
  'STATUS_SECOND_HALF',
  'STATUS_OVERTIME',
  'STATUS_EXTRA_TIME',
]);

// Group / regular-phase slugs that are NOT knockout rounds.
const NON_KNOCKOUT_SLUGS = new Set(['group-stage', 'league-phase', 'regular-season', 'first-stage', 'groups']);

// ── Helpers ───────────────────────────────────────────────────────────────────
function toTeam(raw: RawTeam | undefined): Team {
  const logo = raw?.logos?.find((l) => l.href)?.href ?? raw?.logo ?? '';
  return {
    id: raw?.id != null ? String(raw.id) : '',
    name: raw?.displayName ?? raw?.name ?? '',
    shortName: raw?.shortDisplayName ?? undefined,
    abbreviation: raw?.abbreviation ?? '',
    logo,
    color: raw?.color ?? undefined,
    alternateColor: raw?.alternateColor ?? undefined,
  };
}

function mapStatus(ev: RawEvent): MatchStatus {
  const t = ev.status?.type;
  const name = t?.name ?? '';
  const rawState = t?.state;
  const state: MatchStatus['state'] =
    rawState === 'pre' || rawState === 'in' || rawState === 'post'
      ? rawState
      : LIVE_STATUSES.has(name)
        ? 'in'
        : t?.completed
          ? 'post'
          : 'pre';
  return {
    state,
    name: name || undefined,
    detail: t?.shortDetail ?? t?.detail ?? '',
    clock: ev.status?.displayClock || undefined,
    period: ev.status?.period,
    isLive: LIVE_STATUSES.has(name) || state === 'in',
    isFinished: t?.completed === true || state === 'post',
    clockRunning: RUNNING_STATUSES.has(name),
  };
}

function toSide(c: RawCompetitor | undefined): MatchSide {
  return {
    team: toTeam(c?.team),
    score: c?.score != null ? String(c.score) : '',
    shootoutScore: typeof c?.shootoutScore === 'number' ? c.shootoutScore : undefined,
    // `winner` is resolved once the match is finished (see toMatchSummary) so a
    // penalty/aggregate winner is marked even when the goal scoreline is level.
    winner: undefined,
    record: c?.records?.find((r) => r.summary)?.summary ?? undefined,
  };
}

function shootoutOf(home: RawCompetitor | undefined, away: RawCompetitor | undefined): Shootout | null {
  if (typeof home?.shootoutScore === 'number' && typeof away?.shootoutScore === 'number') {
    return { home: home.shootoutScore, away: away.shootoutScore };
  }
  return null;
}

function resultSuffixOf(ev: RawEvent, shootout: Shootout | null): string {
  const name = ev.status?.type?.name ?? '';
  if (shootout || name === 'STATUS_SHOOTOUT' || name === 'STATUS_FINAL_PEN') return 'Pens';
  const finished = ev.status?.type?.completed === true;
  const period = ev.status?.period ?? 0;
  if (finished && period > 2) return 'AET'; // regulation is 2 periods
  return '';
}

function toMatchSummary(ev: RawEvent, league: LeagueRef, roundName: string): MatchSummary {
  const comp = ev.competitions?.[0];
  const comps = comp?.competitors ?? [];
  const homeRaw = comps.find((c) => c.homeAway === 'home') ?? comps[0];
  const awayRaw = comps.find((c) => c.homeAway === 'away') ?? comps[1];
  const shootout = shootoutOf(homeRaw, awayRaw);
  const status = mapStatus(ev);
  const home = toSide(homeRaw);
  const away = toSide(awayRaw);

  // Resolve the winner once the tie is decided. A penalty shootout overrides a
  // level regulation scoreline; a level score with no shootout (a two-leg tie
  // decided on aggregate) falls back to ESPN's explicit `winner` flag.
  if (status.isFinished) {
    if (shootout) {
      home.winner = shootout.home > shootout.away;
      away.winner = shootout.away > shootout.home;
    } else {
      const hs = Number(home.score);
      const as = Number(away.score);
      if (home.score !== '' && away.score !== '' && Number.isFinite(hs) && Number.isFinite(as) && hs !== as) {
        home.winner = hs > as;
        away.winner = as > hs;
      } else {
        if (homeRaw?.winner === true) home.winner = true;
        if (awayRaw?.winner === true) away.winner = true;
      }
    }
  }

  return {
    id: ev.id != null ? String(ev.id) : '',
    league,
    date: ev.date ?? '',
    round: roundName || undefined,
    status,
    home,
    away,
    venue: comp?.venue?.fullName || undefined,
    city: comp?.venue?.address?.city || undefined,
    shootout,
    resultSuffix: resultSuffixOf(ev, shootout) || undefined,
  };
}

function eventMs(ev: RawEvent): number {
  const t = ev.date ? new Date(ev.date).getTime() : NaN;
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
}

// Prettify an ESPN round slug: 'round-of-16' → 'Round of 16'.
function prettifyRound(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w.length <= 2 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

// Teams still in the competition at a given round — the knockout ordinal. More
// teams remaining = earlier round. `undefined` for slugs we don't recognise.
function teamsRemaining(slug: string): number | undefined {
  const s = slug.toLowerCase();
  const m = s.match(/round-of-(\d+)/) ?? s.match(/1-?(\d+)-?finals?/) ?? s.match(/(\d+)th-?finals?/);
  if (m) return Number(m[1]);
  if (s.includes('semi')) return 4;
  if (s.includes('quarter')) return 8;
  if (s.includes('third') || s.includes('3rd')) return 3; // plays just before the final
  if (s.includes('final')) return 2;
  if (s.includes('play') || s.includes('knockout')) return 48; // play-in / play-off precedes the R32/R16
  return undefined;
}

/**
 * Normalize one-or-more ESPN scoreboard payloads → `Bracket`.
 *
 * @param scoreboards raw JSON from site.api `scoreboard?dates=YYYY` (pass the
 *                    season year AND the following year to cover the season boundary)
 * @param league      the competition ref to embed
 * @param season      the season year to keep (events with a different `season.year`
 *                    are dropped; omit to keep everything)
 */
export function normalizeBracket(scoreboards: unknown[], league: LeagueRef, season?: number): Bracket {
  // Merge + dedupe events across every supplied scoreboard payload.
  const byId = new Map<string, RawEvent>();
  for (const raw of scoreboards) {
    const parsed = RawScoreboardSchema.safeParse(raw);
    if (!parsed.success) continue;
    for (const ev of parsed.data.events ?? []) {
      if (season != null && ev.season?.year !== season) continue;
      const id = ev.id != null ? String(ev.id) : '';
      if (!id) continue;
      byId.set(id, ev);
    }
  }

  // Bucket by round slug, excluding the group / league phase.
  const bySlug = new Map<string, RawEvent[]>();
  for (const ev of byId.values()) {
    const slug = ev.season?.slug ?? '';
    if (!slug || NON_KNOCKOUT_SLUGS.has(slug)) continue;
    const bucket = bySlug.get(slug);
    if (bucket) bucket.push(ev);
    else bySlug.set(slug, [ev]);
  }

  const ordered = [...bySlug.entries()]
    .map(([slug, evs]) => {
      const sorted = [...evs].sort((a, b) => eventMs(a) - eventMs(b));
      const remaining = teamsRemaining(slug);
      return {
        name: prettifyRound(slug),
        // Known rounds sort by ordinal (more teams = earlier); unknowns fall to
        // the end and interleave by their earliest kickoff.
        rank: remaining != null ? -remaining : 0,
        minMs: Math.min(...sorted.map(eventMs)),
        events: sorted,
      };
    })
    .sort((a, b) => a.rank - b.rank || a.minMs - b.minMs);

  const rounds: BracketRound[] = ordered.map((r, i) => ({
    name: r.name,
    order: i,
    matches: r.events.map((ev) => toMatchSummary(ev, league, r.name)),
  }));

  return BracketSchema.parse({ league, season: season ?? undefined, rounds });
}
