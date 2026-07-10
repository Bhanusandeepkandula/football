// ─── Team normalizers ─────────────────────────────────────────────────────────
// `normalizeTeamDetail` folds the five ESPN resources behind a team page (team,
// roster, schedule, aggregate statistics, standings) into one `TeamDetail` DTO —
// roster, fixtures, derived form, next match, group table, season stats and
// leaders. `normalizeTeams` turns the `/{slug}/teams` list into `Team[]`. Each
// source is parsed leniently and the OUTPUT is contract-validated so malformed
// ESPN data can't reach the client; a failed source degrades gracefully (empty).

import { z } from 'zod';
import {
  TeamDetailSchema,
  TeamSchema,
  type FormResult,
  type GroupRow,
  type LeagueRef,
  type NextMatch,
  type PlayerLeader,
  type Team,
  type TeamDetail,
  type TeamFixture,
  type TeamPlayer,
  type TeamStats,
} from '../contract/schema.js';

// ── Permissive raw shapes ─────────────────────────────────────────────────────
const RawStatSchema = z.object({
  name: z.string().optional(),
  type: z.string().optional(),
  abbreviation: z.string().optional(),
  value: z.union([z.number(), z.string()]).optional(),
  displayValue: z.union([z.number(), z.string()]).optional(),
});
type RawStat = z.infer<typeof RawStatSchema>;

const RawCategorySchema = z.object({ name: z.string().optional(), stats: z.array(RawStatSchema).optional() });
const RawSplitsSchema = z.object({ categories: z.array(RawCategorySchema).optional() });
type RawCategory = z.infer<typeof RawCategorySchema>;

const RawTeamRefSchema = z.object({
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
type RawTeamRef = z.infer<typeof RawTeamRefSchema>;

const RawScoreSchema = z.union([
  z.string(),
  z.number(),
  z.object({ value: z.number().optional(), displayValue: z.string().optional() }),
]);

const RawCompetitorSchema = z.object({
  homeAway: z.string().optional(),
  team: RawTeamRefSchema.optional(),
  score: RawScoreSchema.optional(),
  winner: z.boolean().optional(),
});
type RawCompetitor = z.infer<typeof RawCompetitorSchema>;

const RawCompetitionSchema = z.object({
  competitors: z.array(RawCompetitorSchema).optional(),
  status: z
    .object({
      type: z
        .object({ completed: z.boolean().optional(), shortDetail: z.string().optional(), state: z.string().optional() })
        .optional(),
    })
    .optional(),
  venue: z
    .object({ fullName: z.string().optional(), address: z.object({ city: z.string().optional() }).optional() })
    .optional(),
  broadcasts: z
    .array(z.object({ media: z.object({ shortName: z.string().optional() }).optional(), names: z.array(z.string()).optional() }))
    .optional(),
});

const RawEventSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  date: z.string().optional(),
  seasonType: z.object({ name: z.string().optional(), abbreviation: z.string().optional() }).optional(),
  competitions: z.array(RawCompetitionSchema).optional(),
});
type RawEvent = z.infer<typeof RawEventSchema>;

const RawAthleteSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  displayName: z.string().optional(),
  fullName: z.string().optional(),
  jersey: z.string().optional(),
  position: z.object({ abbreviation: z.string().optional(), name: z.string().optional() }).optional(),
  age: z.number().optional(),
  headshot: z.object({ href: z.string().optional() }).optional(),
  displayHeight: z.string().optional(),
  citizenship: z.string().optional(),
  statistics: z.object({ splits: RawSplitsSchema.optional() }).optional(),
});

const RawRosterSchema = z.object({
  athletes: z.array(RawAthleteSchema).optional(),
  coach: z.array(z.object({ firstName: z.string().optional(), lastName: z.string().optional() })).optional(),
});

const RawFullTeamSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  displayName: z.string().optional(),
  logos: z.array(z.object({ href: z.string().optional() })).optional(),
  color: z.string().optional(),
  location: z.string().optional(),
  standingSummary: z.string().optional(),
  nextEvent: z.array(RawEventSchema).optional(),
});

const RawTeamRootSchema = z.object({ team: RawFullTeamSchema.optional() });
const RawScheduleSchema = z.object({ events: z.array(RawEventSchema).optional() });
const RawStatsRootSchema = z.object({ splits: RawSplitsSchema.optional() });

const RawStandEntrySchema = z.object({ team: RawTeamRefSchema.optional(), stats: z.array(RawStatSchema).optional() });
const RawStandRootSchema = z.object({
  children: z
    .array(z.object({ name: z.string().optional(), standings: z.object({ entries: z.array(RawStandEntrySchema).optional() }).optional() }))
    .optional(),
});

const RawTeamsListSchema = z.object({
  sports: z
    .array(z.object({ leagues: z.array(z.object({ teams: z.array(z.object({ team: RawTeamRefSchema.optional() })).optional() })).optional() }))
    .optional(),
});

/** The five ESPN resources behind a team page. A missing/failed source may be `undefined`. */
export interface TeamDetailSources {
  /** site.api `/{slug}/teams/{id}` → `{ team }`. */
  team?: unknown;
  /** site.api `/{slug}/teams/{id}/roster` → `{ athletes, coach }`. */
  roster?: unknown;
  /** site.api `/{slug}/teams/{id}/schedule` → `{ events }`. */
  schedule?: unknown;
  /** core.api `/seasons/{season}/types/1/teams/{id}/statistics` → `{ splits }`. */
  stats?: unknown;
  /** site.web.api `/{slug}/standings?season=YYYY` → `{ children }`. */
  standings?: unknown;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toTeam(raw: RawTeamRef | undefined): Team {
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

function positionGroupFor(abbr: string): TeamPlayer['positionGroup'] {
  const a = (abbr ?? '').toUpperCase();
  if (a === 'G' || a === 'GK') return 'GK';
  if (['D', 'DF', 'CB', 'LB', 'RB', 'WB'].some((p) => a.startsWith(p))) return 'DF';
  if (['M', 'MF', 'CM', 'DM', 'AM', 'LM', 'RM'].some((p) => a.startsWith(p))) return 'MF';
  return 'FW';
}

function scoreStr(s: z.infer<typeof RawScoreSchema> | undefined): string | undefined {
  if (s == null) return undefined;
  if (typeof s === 'object') return s.displayValue ?? (s.value != null ? String(s.value) : undefined);
  return String(s);
}

function teamIdOf(c: RawCompetitor | undefined): string {
  return c?.team?.id != null ? String(c.team.id) : '';
}

// Pull a stat {value, displayValue} out of an ESPN core `splits.categories` array.
function catStat(categories: RawCategory[], categoryName: string, statName: string): { value: number; displayValue: string } | undefined {
  const cat = categories.find((c) => c.name === categoryName);
  const st = (cat?.stats ?? []).find((s) => s.name === statName);
  if (!st) return undefined;
  const value = Number(st.value ?? 0);
  return { value: Number.isFinite(value) ? value : 0, displayValue: String(st.displayValue ?? st.value ?? '') };
}

// Pull a standings entry stat by any of its name / type aliases (case-insensitive).
function entryStat(stats: RawStat[], name: string): { value: number; displayValue: string } | undefined {
  const want = name.toLowerCase();
  const st = stats.find((s) => [s.name, s.type, s.abbreviation].some((k) => k != null && k.toLowerCase() === want));
  if (!st) return undefined;
  const value = Number(st.value ?? 0);
  return { value: Number.isFinite(value) ? value : 0, displayValue: String(st.displayValue ?? st.value ?? '') };
}

/**
 * Normalize the ESPN team-page resources → `TeamDetail`.
 *
 * @param teamId  the team the page is about (drives home/away + isMe flags)
 * @param league  the competition ref to embed
 * @param sources the five raw ESPN payloads (see `TeamDetailSources`)
 */
export function normalizeTeamDetail(teamId: string, league: LeagueRef, sources: TeamDetailSources): TeamDetail {
  const teamRes = RawTeamRootSchema.safeParse(sources.team);
  const rosterRes = RawRosterSchema.safeParse(sources.roster);
  const schedRes = RawScheduleSchema.safeParse(sources.schedule);
  const statsRes = RawStatsRootSchema.safeParse(sources.stats);
  const standRes = RawStandRootSchema.safeParse(sources.standings);

  const t = teamRes.success ? (teamRes.data.team ?? {}) : {};
  const roster = rosterRes.success ? rosterRes.data : {};
  const schedEvents = schedRes.success ? (schedRes.data.events ?? []) : [];

  // ── Roster (enriched with per-athlete stats when present) ─────────────────
  const players: TeamPlayer[] = (roster.athletes ?? []).map((a) => {
    const pos = a.position?.abbreviation ?? a.position?.name ?? '';
    const cats = a.statistics?.splits?.categories ?? [];
    const goals = catStat(cats, 'offensive', 'totalGoals')?.value;
    const assists = catStat(cats, 'offensive', 'goalAssists')?.value;
    const appearances = catStat(cats, 'general', 'appearances')?.value;
    const saves = catStat(cats, 'goalKeeping', 'saves')?.value;
    return {
      id: a.id != null ? String(a.id) : '',
      displayName: a.displayName ?? a.fullName ?? 'Player',
      jersey: a.jersey ?? undefined,
      position: pos,
      positionGroup: positionGroupFor(pos),
      age: a.age ?? undefined,
      headshot: a.headshot?.href ?? undefined,
      height: a.displayHeight ?? undefined,
      citizenship: a.citizenship ?? undefined,
      goals: goals || undefined,
      assists: assists || undefined,
      appearances: appearances || undefined,
      saves: saves || undefined,
    };
  });

  const coach = (roster.coach ?? [])
    .map((c) => [c.firstName, c.lastName].filter(Boolean).join(' '))
    .filter(Boolean)[0];

  // ── Fixtures (chronological) ──────────────────────────────────────────────
  const fixtures: TeamFixture[] = schedEvents
    .map((ev): TeamFixture => {
      const comp = ev.competitions?.[0];
      const competitors = comp?.competitors ?? [];
      const mine = competitors.find((c) => teamIdOf(c) === teamId) ?? competitors[0];
      const opp = competitors.find((c) => teamIdOf(c) !== teamId) ?? competitors[1];
      const oppTeam = opp?.team;
      return {
        id: ev.id != null ? String(ev.id) : '',
        date: ev.date ?? '',
        roundLabel: ev.seasonType?.name ?? ev.seasonType?.abbreviation ?? '',
        completed: comp?.status?.type?.completed ?? false,
        statusDetail: comp?.status?.type?.shortDetail ?? '',
        isHome: mine?.homeAway === 'home',
        opponent: {
          abbr: oppTeam?.abbreviation ?? '',
          displayName: oppTeam?.displayName ?? oppTeam?.name ?? '',
          logo: oppTeam?.logos?.find((l) => l.href)?.href ?? oppTeam?.logo ?? '',
        },
        teamScore: scoreStr(mine?.score),
        opponentScore: scoreStr(opp?.score),
        won: mine?.winner === true,
      };
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // ── Recent form (last 5 completed, chronological) ─────────────────────────
  const recentForm: FormResult[] = fixtures
    .filter((f) => f.completed)
    .slice(-5)
    .map((f) => {
      const ts = Number(f.teamScore);
      const os = Number(f.opponentScore);
      const result: FormResult['result'] = f.won ? 'W' : ts === os ? 'D' : 'L';
      return {
        result,
        opponentAbbr: f.opponent.abbr || f.opponent.displayName.slice(0, 3).toUpperCase(),
        score: `${f.teamScore ?? ''}-${f.opponentScore ?? ''}`,
        matchId: f.id,
      };
    });

  // ── Next match ────────────────────────────────────────────────────────────
  // team.nextEvent goes stale right after kickoff, so pick the earliest genuinely
  // upcoming (or in-progress) event from nextEvent + the schedule.
  let nextMatch: NextMatch | null = null;
  const nowMs = Date.now();
  const seenNext = new Set<string>();
  const nextCandidates: RawEvent[] = [];
  for (const ev of [t.nextEvent?.[0], ...schedEvents]) {
    if (!ev) continue;
    const id = ev.id != null ? String(ev.id) : '';
    if (seenNext.has(id)) continue;
    seenNext.add(id);
    const st = ev.competitions?.[0]?.status?.type;
    const state = st?.state; // 'pre' | 'in' | 'post'
    const ts = new Date(ev.date ?? '').getTime();
    if (st?.completed || state === 'post') continue;
    if (state === 'in' || (Number.isFinite(ts) && ts >= nowMs)) nextCandidates.push(ev);
  }
  nextCandidates.sort((a, b) => new Date(a.date ?? '').getTime() - new Date(b.date ?? '').getTime());
  const ne = nextCandidates[0];
  if (ne) {
    const comp = ne.competitions?.[0];
    const competitors = comp?.competitors ?? [];
    const mine = competitors.find((c) => teamIdOf(c) === teamId) ?? competitors[0];
    const opp = competitors.find((c) => teamIdOf(c) !== teamId) ?? competitors[1];
    const oppTeam = opp?.team;
    nextMatch = {
      id: ne.id != null ? String(ne.id) : '',
      date: ne.date ?? '',
      isHome: mine?.homeAway === 'home',
      opponent: {
        displayName: oppTeam?.displayName ?? oppTeam?.name ?? 'TBD',
        abbr: oppTeam?.abbreviation ?? '',
        logo: oppTeam?.logos?.find((l) => l.href)?.href ?? oppTeam?.logo ?? '',
      },
      venue: comp?.venue?.fullName ?? undefined,
      venueCity: comp?.venue?.address?.city ?? undefined,
      broadcasts: (comp?.broadcasts ?? [])
        .map((b) => b.media?.shortName ?? b.names?.[0])
        .filter((x): x is string => Boolean(x)),
    };
  }

  // ── Aggregate statistics + record (core) ──────────────────────────────────
  let stats: TeamStats | null = null;
  let record: TeamDetail['record'] = null;
  const cats = statsRes.success ? statsRes.data.splits?.categories : undefined;
  if (cats) {
    const num = (cat: string, name: string) => catStat(cats, cat, name)?.displayValue;
    stats = {
      goals: num('offensive', 'totalGoals'),
      shots: num('offensive', 'totalShots'),
      shotsOnTarget: num('offensive', 'shotsOnTarget'),
      possessionPct: num('offensive', 'possessionPct'),
      assists: num('offensive', 'goalAssists'),
      accuratePasses: num('offensive', 'accuratePasses'),
      cleanSheets: num('goalKeeping', 'cleanSheet'),
      goalsConceded: num('goalKeeping', 'goalsConceded'),
      fouls: num('general', 'foulsCommitted'),
      yellows: num('general', 'yellowCards'),
      reds: num('general', 'redCards'),
      tackles: num('defensive', 'effectiveTackles'),
      interceptions: num('defensive', 'interceptions'),
    };
    const w = catStat(cats, 'general', 'wins')?.value;
    const d = catStat(cats, 'general', 'draws')?.value ?? catStat(cats, 'general', 'ties')?.value;
    const l = catStat(cats, 'general', 'losses')?.value;
    if (w != null && d != null && l != null) record = { w, d, l };
  }

  // ── Group table (site.web.api standings) ──────────────────────────────────
  let group: TeamDetail['group'] = null;
  const children = standRes.success ? (standRes.data.children ?? []) : [];
  const child = children.find((c) => (c.standings?.entries ?? []).some((e) => teamIdOf(e) === teamId));
  if (child) {
    const entries: GroupRow[] = (child.standings?.entries ?? [])
      .map((e): GroupRow => {
        const tm = e.team;
        const rowStats = e.stats ?? [];
        const id = tm?.id != null ? String(tm.id) : '';
        return {
          teamId: id,
          displayName: tm?.displayName ?? tm?.name ?? '',
          logo: tm?.logos?.find((l) => l.href)?.href ?? tm?.logo ?? '',
          gp: entryStat(rowStats, 'gamesplayed')?.value ?? 0,
          w: entryStat(rowStats, 'wins')?.value ?? 0,
          d: entryStat(rowStats, 'ties')?.value ?? 0,
          l: entryStat(rowStats, 'losses')?.value ?? 0,
          gf: entryStat(rowStats, 'pointsfor')?.value ?? 0,
          ga: entryStat(rowStats, 'pointsagainst')?.value ?? 0,
          gd: entryStat(rowStats, 'pointdifferential')?.displayValue ?? '0',
          points: entryStat(rowStats, 'points')?.value ?? 0,
          rank: entryStat(rowStats, 'rank')?.value ?? 0,
          advanced: (entryStat(rowStats, 'advanced')?.value ?? 0) > 0,
          isMe: id === teamId,
        };
      })
      .sort((a, b) => (a.rank || 99) - (b.rank || 99));
    group = { name: child.name ?? 'Group', entries };
  }

  // ── Leaders (derived from the enriched roster) ────────────────────────────
  const topScorer = players.reduce<PlayerLeader | undefined>((best, p) => {
    if (!p.goals) return best;
    if (!best || p.goals > best.value) return { id: p.id, displayName: p.displayName, headshot: p.headshot, value: p.goals };
    return best;
  }, undefined);
  const topAssist = players.reduce<PlayerLeader | undefined>((best, p) => {
    if (!p.assists) return best;
    if (!best || p.assists > best.value) return { id: p.id, displayName: p.displayName, headshot: p.headshot, value: p.assists };
    return best;
  }, undefined);

  const teamIdResolved = t.id != null ? String(t.id) : teamId;

  return TeamDetailSchema.parse({
    id: teamIdResolved,
    league,
    displayName: t.displayName ?? 'Team',
    logo: t.logos?.find((l) => l.href)?.href ?? '',
    color: t.color ?? '888888',
    location: t.location ?? undefined,
    coach,
    standingSummary: t.standingSummary ?? undefined,
    record,
    players,
    fixtures,
    recentForm,
    nextMatch,
    group,
    stats,
    leaders: { topScorer, topAssist },
  });
}

/**
 * Normalize the ESPN team-list payload (site.api `/{slug}/teams`) → `Team[]`.
 */
export function normalizeTeams(raw: unknown): Team[] {
  const parsed = RawTeamsListSchema.safeParse(raw);
  const data = parsed.success ? parsed.data : {};
  const teams = (data.sports ?? [])
    .flatMap((s) => s.leagues ?? [])
    .flatMap((l) => l.teams ?? [])
    .map((t) => toTeam(t.team))
    .filter((t) => t.id);
  return z.array(TeamSchema).parse(teams);
}
