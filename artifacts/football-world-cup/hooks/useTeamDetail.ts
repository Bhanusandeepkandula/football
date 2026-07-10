import { useQuery } from '@tanstack/react-query';
import { siteBase, coreBase, webBase, getActiveSlug, getLeagueSeason } from '@/lib/espn';
import { useLeague } from '@/hooks/useLeague';
import { getTeamDetail } from '@/lib/api/client';

async function espnFetch(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN: ${res.status}`);
  return res.json();
}

export interface TeamPlayer {
  id: string;
  displayName: string;
  jersey?: string;
  position: string;
  positionGroup: 'GK' | 'DF' | 'MF' | 'FW';
  age?: number;
  headshot?: string;
  height?: string;
  citizenship?: string;
  goals?: number;
  assists?: number;
  appearances?: number;
  saves?: number;
}

export interface TeamFixture {
  id: string;
  date: string;
  roundLabel: string;
  completed: boolean;
  statusDetail: string;
  isHome: boolean;
  opponent: { abbr: string; displayName: string; logo: string };
  teamScore?: string;
  opponentScore?: string;
  won?: boolean;
}

export interface FormResult {
  result: 'W' | 'D' | 'L';
  opponentAbbr: string;
  score: string;
  matchId: string;
}

export interface NextMatch {
  id: string;
  date: string;
  isHome: boolean;
  opponent: { displayName: string; abbr: string; logo: string };
  venue?: string;
  venueCity?: string;
  broadcasts: string[];
}

export interface GroupRow {
  teamId: string;
  displayName: string;
  logo: string;
  gp: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: string;
  points: number;
  rank: number;
  advanced: boolean;
  isMe: boolean;
}

export interface TeamStats {
  goals?: string;
  shots?: string;
  shotsOnTarget?: string;
  possessionPct?: string;
  assists?: string;
  accuratePasses?: string;
  cleanSheets?: string;
  goalsConceded?: string;
  fouls?: string;
  yellows?: string;
  reds?: string;
  tackles?: string;
  interceptions?: string;
}

export interface PlayerLeader {
  id: string;
  displayName: string;
  headshot?: string;
  value: number;
}

export interface TeamDetail {
  id: string;
  displayName: string;
  logo: string;
  color: string;
  location?: string;
  coach?: string;
  standingSummary?: string;
  record: { w: number; d: number; l: number } | null;
  players: TeamPlayer[];
  fixtures: TeamFixture[];
  recentForm: FormResult[];
  nextMatch: NextMatch | null;
  group: { name: string; entries: GroupRow[] } | null;
  stats: TeamStats | null;
  leaders: { topScorer?: PlayerLeader; topAssist?: PlayerLeader };
}

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

// Pull a stat {value, displayValue} out of an ESPN core `splits.categories` array.
function catStat(categories: any[], categoryName: string, statName: string): { value: number; displayValue: string } | undefined {
  const cat = (categories ?? []).find((c) => c?.name === categoryName);
  const st = (cat?.stats ?? []).find((s: any) => s?.name === statName);
  return st ? { value: Number(st.value ?? 0), displayValue: String(st.displayValue ?? st.value ?? '') } : undefined;
}

// Pull a site-web standings entry stat by name.
function entryStat(entry: any, name: string): { value: number; displayValue: string } | undefined {
  const st = (entry?.stats ?? []).find((s: any) => s?.name === name || s?.type === name);
  return st ? { value: Number(st.value ?? 0), displayValue: String(st.displayValue ?? st.value ?? '') } : undefined;
}

/**
 * Backend-first team page fetch. Calls the @matchcenter/api service and adapts
 * its DTO to the exported `TeamDetail` shape (the backend payload is
 * field-identical apart from an extra `league` ref, which is dropped). On any
 * failure it falls back to the direct-ESPN path in `fetchTeamDetailEspn`.
 */
export async function fetchTeamDetail(teamId: string, slug: string = getActiveSlug()): Promise<TeamDetail> {
  try {
    const d = await getTeamDetail(slug, teamId);
    // Drop the extra backend `league` field; every other field maps
    // one-to-one onto the app's TeamDetail (roster/fixtures/form/nextMatch/
    // group/stats/leaders all match verbatim).
    const { league: _league, ...rest } = d;
    return rest;
  } catch {
    return fetchTeamDetailEspn(teamId, slug);
  }
}

/** Legacy direct-to-ESPN fallback (retained as the safety path). */
async function fetchTeamDetailEspn(teamId: string, slug: string = getActiveSlug()): Promise<TeamDetail> {
      const season = await getLeagueSeason(slug);
      const [teamRes, rosterRes, schedRes, statsRes, standingsRes] = await Promise.all([
        espnFetch(`${siteBase(slug)}/teams/${teamId}`),
        espnFetch(`${siteBase(slug)}/teams/${teamId}/roster`).catch(() => ({ athletes: [], coach: [] })),
        espnFetch(`${siteBase(slug)}/teams/${teamId}/schedule`).catch(() => ({ events: [] })),
        // CORE aggregate team statistics (the plain site /statistics is often empty).
        espnFetch(`${coreBase(slug)}/seasons/${season}/types/1/teams/${teamId}/statistics`).catch(() => null),
        // Standings table (plain site /standings is empty — use the site.web.api host).
        espnFetch(`${webBase(slug)}/standings?season=${season}`).catch(() => null),
      ]);

      const t = teamRes.team ?? {};

      // ── Roster (enriched with per-athlete stats when present) ────────────────
      const players: TeamPlayer[] = (rosterRes.athletes ?? []).map((a: any) => {
        const pos = a.position?.abbreviation ?? a.position?.name ?? '';
        const cats = a.statistics?.splits?.categories ?? [];
        const goals = catStat(cats, 'offensive', 'totalGoals')?.value;
        const assists = catStat(cats, 'offensive', 'goalAssists')?.value;
        const appearances = catStat(cats, 'general', 'appearances')?.value;
        const saves = catStat(cats, 'goalKeeping', 'saves')?.value;
        return {
          id: a.id ?? '',
          displayName: a.displayName ?? a.fullName ?? 'Player',
          jersey: a.jersey,
          position: pos,
          positionGroup: positionGroupFor(pos),
          age: a.age,
          headshot: a.headshot?.href,
          height: a.displayHeight,
          citizenship: a.citizenship,
          goals: goals || undefined,
          assists: assists || undefined,
          appearances: appearances || undefined,
          saves: saves || undefined,
        };
      });

      const coach = (rosterRes.coach ?? [])
        .map((c: any) => [c.firstName, c.lastName].filter(Boolean).join(' '))
        .filter(Boolean)[0];

      // ── Fixtures ─────────────────────────────────────────────────────────────
      const fixtures: TeamFixture[] = (schedRes.events ?? []).map((ev: any) => {
        const comp = ev.competitions?.[0] ?? {};
        const competitors: any[] = comp.competitors ?? [];
        const mine = competitors.find((c) => c.team?.id === teamId) ?? competitors[0];
        const opp = competitors.find((c) => c.team?.id !== teamId) ?? competitors[1] ?? {};
        const oppTeam = opp.team ?? {};
        return {
          id: ev.id,
          date: ev.date,
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
      }).sort((a: TeamFixture, b: TeamFixture) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      // ── Recent form (derived from completed fixtures, last 5, chronological) ──
      const recentForm: FormResult[] = [...fixtures]
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

      // ── Next match ───────────────────────────────────────────────────────────
      // ESPN's team.nextEvent goes stale right after kickoff — it keeps pointing at
      // a match that has already been played. Pick the earliest genuinely upcoming
      // (or in-progress) event from nextEvent + the schedule, skipping anything
      // completed or whose kickoff has already passed.
      let nextMatch: NextMatch | null = null;
      const nowMs = Date.now();
      const seenNext = new Set<string>();
      const nextCandidates: any[] = [];
      for (const ev of [t.nextEvent?.[0], ...(schedRes.events ?? [])]) {
        if (!ev || seenNext.has(ev.id)) continue;
        seenNext.add(ev.id);
        const st = ev.competitions?.[0]?.status?.type;
        const completed = st?.completed ?? false;
        const state = st?.state; // 'pre' | 'in' | 'post'
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
          id: ne.id,
          date: ne.date,
          isHome: mine?.homeAway === 'home',
          opponent: {
            displayName: oppTeam.displayName ?? oppTeam.name ?? 'TBD',
            abbr: oppTeam.abbreviation ?? '',
            logo: oppTeam.logos?.[0]?.href ?? oppTeam.logo ?? '',
          },
          venue: comp.venue?.fullName,
          venueCity: comp.venue?.address?.city,
          broadcasts: (comp.broadcasts ?? [])
            .map((b: any) => b?.media?.shortName ?? b?.names?.[0])
            .filter(Boolean),
        };
      }

      // ── Team statistics + record (CORE) ──────────────────────────────────────
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

      // ── Group table (site.web.api standings) ─────────────────────────────────
      let group: TeamDetail['group'] = null;
      const children = standingsRes?.children ?? [];
      const child = children.find((c: any) =>
        (c.standings?.entries ?? []).some((e: any) => e.team?.id === teamId)
      );
      if (child) {
        const entries: GroupRow[] = (child.standings?.entries ?? []).map((e: any) => {
          const tm = e.team ?? {};
          return {
            teamId: tm.id ?? '',
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
        }).sort((a: GroupRow, b: GroupRow) => (a.rank || 99) - (b.rank || 99));
        group = { name: child.name ?? 'Group', entries };
      }

      // ── Leaders (derived from enriched roster) ───────────────────────────────
      const scorer = players.reduce<PlayerLeader | undefined>((best, p) => {
        if (!p.goals) return best;
        if (!best || p.goals > best.value) return { id: p.id, displayName: p.displayName, headshot: p.headshot, value: p.goals };
        return best;
      }, undefined);
      const assister = players.reduce<PlayerLeader | undefined>((best, p) => {
        if (!p.assists) return best;
        if (!best || p.assists > best.value) return { id: p.id, displayName: p.displayName, headshot: p.headshot, value: p.assists };
        return best;
      }, undefined);

      return {
        id: teamId,
        displayName: t.displayName ?? 'Team',
        logo: t.logos?.[0]?.href ?? '',
        color: t.color ?? '888888',
        location: t.location,
        coach,
        standingSummary: t.standingSummary,
        record,
        players,
        fixtures,
        recentForm,
        nextMatch,
        group,
        stats,
        leaders: { topScorer: scorer, topAssist: assister },
      };
}

export function teamDetailQueryOptions(teamId: string, slug: string = getActiveSlug()) {
  return {
    queryKey: ['teamDetail', slug, teamId] as const,
    queryFn: () => fetchTeamDetail(teamId, slug),
    staleTime: 300_000,
  };
}

export function useTeamDetail(teamId: string, slugOverride?: string) {
  const { slug: ctxSlug } = useLeague();
  // A team opened from the aggregated feed passes its own league so this fetches
  // the right competition without changing the app's active league.
  const slug = slugOverride || ctxSlug;
  return useQuery<TeamDetail>({
    ...teamDetailQueryOptions(teamId, slug),
    refetchOnMount: false,
    enabled: !!teamId,
  });
}
