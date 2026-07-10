// GET /v1/:league/teams      → Team[]      — all teams in a competition.
// GET /v1/:league/teams/:id   → TeamDetail  — team page payload (roster, fixtures,
//   form, next match, group, stats, leaders). Ported from the app's useTeamDetail.
import type { Hono } from 'hono';
import { z } from 'zod';

import type {
  FormResult,
  GroupRow,
  PlayerLeader,
  TeamDetail,
  TeamFixture,
  TeamPlayer,
  TeamStats,
} from '../contract/schema.js';
import { TeamDetailSchema, TeamSchema } from '../contract/schema.js';
import {
  IdParamSchema,
  LeagueParamSchema,
  TTL,
  cached,
  coreBase,
  defineRoute,
  espnFetch,
  getLeagueSeason,
  parseParams,
  siteBase,
  webBase,
} from './_lib.js';
import { leagueRef } from './_leagues.js';

const TeamListSchema = z.array(TeamSchema);

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Teams list ────────────────────────────────────────────────────────────────
interface EspnTeamsResponse {
  sports?: { leagues?: { teams?: { team?: any }[] }[] }[];
}

function toTeamRef(team: any) {
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

// ── Team detail helpers (ported from useTeamDetail) ────────────────────────────
function positionGroupFor(abbr: string): TeamPlayer['positionGroup'] {
  const a = (abbr ?? '').toUpperCase();
  if (a === 'G' || a === 'GK') return 'GK';
  if (['D', 'DF', 'CB', 'LB', 'RB', 'WB'].some((p) => a.startsWith(p))) return 'DF';
  if (['M', 'MF', 'CM', 'DM', 'AM', 'LM', 'RM'].some((p) => a.startsWith(p))) return 'MF';
  return 'FW';
}

function scoreStr(s: any): string | undefined {
  if (s == null) return undefined;
  if (typeof s === 'object') return s.displayValue ?? String(s.value ?? '');
  return String(s);
}

function catStat(
  categories: any[],
  categoryName: string,
  statName: string,
): { value: number; displayValue: string } | undefined {
  const cat = (categories ?? []).find((c) => c?.name === categoryName);
  const st = (cat?.stats ?? []).find((s: any) => s?.name === statName);
  return st
    ? { value: Number(st.value ?? 0), displayValue: String(st.displayValue ?? st.value ?? '') }
    : undefined;
}

function entryStat(entry: any, name: string): { value: number; displayValue: string } | undefined {
  const st = (entry?.stats ?? []).find((s: any) => s?.name === name || s?.type === name);
  return st
    ? { value: Number(st.value ?? 0), displayValue: String(st.displayValue ?? st.value ?? '') }
    : undefined;
}

async function fetchTeamDetail(teamId: string, slug: string): Promise<TeamDetail> {
  const season = await getLeagueSeason(slug);
  const [teamRes, rosterRes, schedRes, statsRes, standingsRes] = await Promise.all([
    espnFetch<any>(`${siteBase(slug)}/teams/${teamId}`),
    espnFetch<any>(`${siteBase(slug)}/teams/${teamId}/roster`).catch(() => ({
      athletes: [],
      coach: [],
    })),
    espnFetch<any>(`${siteBase(slug)}/teams/${teamId}/schedule`).catch(() => ({ events: [] })),
    espnFetch<any>(
      `${coreBase(slug)}/seasons/${season}/types/1/teams/${teamId}/statistics`,
    ).catch(() => null),
    espnFetch<any>(`${webBase(slug)}/standings?season=${season}`).catch(() => null),
  ]);

  const t = teamRes?.team ?? {};

  // Roster (enriched with per-athlete stats when present).
  const players: TeamPlayer[] = (rosterRes?.athletes ?? []).map((a: any) => {
    const pos = a.position?.abbreviation ?? a.position?.name ?? '';
    const cats = a.statistics?.splits?.categories ?? [];
    const goals = catStat(cats, 'offensive', 'totalGoals')?.value;
    const assists = catStat(cats, 'offensive', 'goalAssists')?.value;
    const appearances = catStat(cats, 'general', 'appearances')?.value;
    const saves = catStat(cats, 'goalKeeping', 'saves')?.value;
    return {
      id: String(a.id ?? ''),
      displayName: a.displayName ?? a.fullName ?? 'Player',
      jersey: a.jersey ?? undefined,
      position: pos,
      positionGroup: positionGroupFor(pos),
      age: typeof a.age === 'number' ? a.age : undefined,
      headshot: a.headshot?.href ?? undefined,
      height: a.displayHeight ?? undefined,
      citizenship: a.citizenship ?? undefined,
      goals: goals || undefined,
      assists: assists || undefined,
      appearances: appearances || undefined,
      saves: saves || undefined,
    };
  });

  const coach: string | undefined = (rosterRes?.coach ?? [])
    .map((c: any) => [c.firstName, c.lastName].filter(Boolean).join(' '))
    .filter(Boolean)[0];

  // Fixtures.
  const fixtures: TeamFixture[] = (schedRes?.events ?? [])
    .map((ev: any): TeamFixture => {
      const comp = ev.competitions?.[0] ?? {};
      const competitors: any[] = comp.competitors ?? [];
      const mine = competitors.find((c) => c.team?.id === teamId) ?? competitors[0];
      const opp = competitors.find((c) => c.team?.id !== teamId) ?? competitors[1] ?? {};
      const oppTeam = opp.team ?? {};
      return {
        id: String(ev.id ?? ''),
        date: ev.date ?? '',
        roundLabel: ev.seasonType?.name ?? ev.seasonType?.abbreviation ?? '',
        completed: comp.status?.type?.completed ?? false,
        statusDetail: comp.status?.type?.shortDetail ?? '',
        isHome: mine?.homeAway === 'home',
        opponent: {
          abbr: oppTeam.abbreviation ?? '',
          displayName: oppTeam.displayName ?? oppTeam.name ?? '',
          logo: oppTeam.logos?.[0]?.href ?? oppTeam.logo ?? '',
        },
        teamScore: scoreStr(mine?.score),
        opponentScore: scoreStr(opp?.score),
        won: mine?.winner === true,
      };
    })
    .sort((a: TeamFixture, b: TeamFixture) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Recent form (last 5 completed fixtures, chronological).
  const recentForm: FormResult[] = [...fixtures]
    .filter((f) => f.completed)
    .slice(-5)
    .map((f): FormResult => {
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

  // Next match — earliest genuinely upcoming (or in-progress) fixture.
  let nextMatch: TeamDetail['nextMatch'] = null;
  const nowMs = Date.now();
  const seenNext = new Set<string>();
  const nextCandidates: any[] = [];
  for (const ev of [t.nextEvent?.[0], ...(schedRes?.events ?? [])]) {
    if (!ev || seenNext.has(ev.id)) continue;
    seenNext.add(ev.id);
    const st = ev.competitions?.[0]?.status?.type;
    const completed = st?.completed ?? false;
    const state = st?.state;
    const ts = new Date(ev.date).getTime();
    if (completed || state === 'post') continue;
    if (state === 'in' || (isFinite(ts) && ts >= nowMs)) nextCandidates.push(ev);
  }
  nextCandidates.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const ne = nextCandidates[0];
  if (ne) {
    const comp = ne.competitions?.[0] ?? {};
    const competitors: any[] = comp.competitors ?? [];
    const mine = competitors.find((c) => c.team?.id === teamId) ?? competitors[0];
    const opp = competitors.find((c) => c.team?.id !== teamId) ?? competitors[1] ?? {};
    const oppTeam = opp?.team ?? {};
    nextMatch = {
      id: String(ne.id ?? ''),
      date: ne.date ?? '',
      isHome: mine?.homeAway === 'home',
      opponent: {
        displayName: oppTeam.displayName ?? oppTeam.name ?? 'TBD',
        abbr: oppTeam.abbreviation ?? '',
        logo: oppTeam.logos?.[0]?.href ?? oppTeam.logo ?? '',
      },
      venue: comp.venue?.fullName ?? undefined,
      venueCity: comp.venue?.address?.city ?? undefined,
      broadcasts: (comp.broadcasts ?? [])
        .map((b: any) => b?.media?.shortName ?? b?.names?.[0])
        .filter((x: unknown): x is string => Boolean(x)),
    };
  }

  // Team statistics + record (CORE aggregate).
  let stats: TeamStats | null = null;
  let record: TeamDetail['record'] = null;
  const cats = statsRes?.splits?.categories;
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

  // Group table (site.web.api standings).
  let group: TeamDetail['group'] = null;
  const children = standingsRes?.children ?? [];
  const child = children.find((ch: any) =>
    (ch.standings?.entries ?? []).some((e: any) => e.team?.id === teamId),
  );
  if (child) {
    const entries: GroupRow[] = (child.standings?.entries ?? [])
      .map((e: any): GroupRow => {
        const tm = e.team ?? {};
        return {
          teamId: String(tm.id ?? ''),
          displayName: tm.displayName ?? tm.name ?? '',
          logo: tm.logos?.[0]?.href ?? '',
          gp: entryStat(e, 'gamesplayed')?.value ?? 0,
          w: entryStat(e, 'wins')?.value ?? 0,
          d: entryStat(e, 'ties')?.value ?? 0,
          l: entryStat(e, 'losses')?.value ?? 0,
          gf: entryStat(e, 'pointsfor')?.value ?? 0,
          ga: entryStat(e, 'pointsagainst')?.value ?? 0,
          gd: entryStat(e, 'pointdifferential')?.displayValue ?? '0',
          points: entryStat(e, 'points')?.value ?? 0,
          rank: entryStat(e, 'rank')?.value ?? 0,
          advanced: (entryStat(e, 'advanced')?.value ?? 0) > 0,
          isMe: tm.id === teamId,
        };
      })
      .sort((a: GroupRow, b: GroupRow) => (a.rank || 99) - (b.rank || 99));
    group = { name: child.name ?? 'Group', entries };
  }

  // Leaders (derived from enriched roster).
  const topScorer = players.reduce<PlayerLeader | undefined>((best, p) => {
    if (!p.goals) return best;
    if (!best || p.goals > best.value)
      return { id: p.id, displayName: p.displayName, headshot: p.headshot, value: p.goals };
    return best;
  }, undefined);
  const topAssist = players.reduce<PlayerLeader | undefined>((best, p) => {
    if (!p.assists) return best;
    if (!best || p.assists > best.value)
      return { id: p.id, displayName: p.displayName, headshot: p.headshot, value: p.assists };
    return best;
  }, undefined);

  return {
    id: teamId,
    league: leagueRef(slug),
    displayName: t.displayName ?? 'Team',
    logo: t.logos?.[0]?.href ?? '',
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
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function registerTeams(app: Hono): void {
  app.get(
    '/v1/:league/teams',
    defineRoute(async (c) => {
      const { league } = parseParams(c, LeagueParamSchema);
      return cached(`teams:${league}`, TTL.teams, async () => {
        const data = await espnFetch<EspnTeamsResponse>(`${siteBase(league)}/teams?limit=100`);
        const teams = (data?.sports?.[0]?.leagues?.[0]?.teams ?? [])
          .map((entry) => entry?.team)
          .filter(Boolean)
          .map(toTeamRef);
        return TeamListSchema.parse(teams);
      });
    }),
  );

  app.get(
    '/v1/:league/teams/:id',
    defineRoute(async (c) => {
      const { league } = parseParams(c, LeagueParamSchema);
      const { id } = parseParams(c, IdParamSchema);
      return cached(`teamDetail:${league}:${id}`, TTL.teamDetail, async () =>
        TeamDetailSchema.parse(await fetchTeamDetail(id, league)),
      );
    }),
  );
}
