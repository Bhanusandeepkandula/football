import { useQuery } from '@tanstack/react-query';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world';

async function espnFetch(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN: ${res.status}`);
  return res.json();
}

export interface MatchPlayer {
  id: string;
  displayName: string;
  jersey: string;
  position: string;
  positionGroup: 'GK' | 'DF' | 'MF' | 'FW';
  headshot?: string;
  starter: boolean;
  stats: Record<string, string>;
}

export interface MatchTeamLineup {
  team: { id: string; displayName: string; logo: string; color: string };
  formation?: string;
  starters: MatchPlayer[];
  bench: MatchPlayer[];
}

export type MatchEventType = 'goal' | 'yellow-card' | 'red-card' | 'substitution' | 'var' | 'other';

export interface MatchEvent {
  id: string;
  clock: string;
  period: number;
  type: MatchEventType;
  text: string;
  teamId?: string;
  playerName?: string;
}

export interface MatchStat {
  name: string;
  displayName: string;
  homeValue: string;
  awayValue: string;
  homePercent: number;
}

export interface MatchDetail {
  id: string;
  homeTeam: { id: string; displayName: string; logo: string; score: string; color: string };
  awayTeam: { id: string; displayName: string; logo: string; score: string; color: string };
  status: string;
  statusDetail: string;
  isLive: boolean;
  isFinished: boolean;
  venue?: string;
  city?: string;
  date: string;
  lineups: [MatchTeamLineup, MatchTeamLineup] | null;
  events: MatchEvent[];
  stats: MatchStat[];
}

// ESPN's soccer roster feed has no per-player position, only a `formation`
// string ("4-1-3-2") and each player's `formationPlace` (1 = GK). Derive the
// position group by walking the formation lines: first outfield line = DF,
// last = FW, everything between = MF.
function buildFormationMap(formationStr: string): Record<number, MatchPlayer['positionGroup']> {
  const map: Record<number, MatchPlayer['positionGroup']> = { 1: 'GK' };
  const lines = (formationStr ?? '').split('-').map((n) => parseInt(n, 10)).filter((n) => n > 0);
  let place = 2;
  lines.forEach((count, idx) => {
    const group: MatchPlayer['positionGroup'] =
      idx === 0 ? 'DF' : idx === lines.length - 1 ? 'FW' : 'MF';
    for (let i = 0; i < count && place <= 11; i++) map[place++] = group;
  });
  return map;
}

const POSITION_LABEL: Record<MatchPlayer['positionGroup'], string> = {
  GK: 'GK',
  DF: 'DEF',
  MF: 'MID',
  FW: 'FWD',
};

function parseEventType(text: string, typeText?: string): MatchEventType {
  const t = `${text} ${typeText ?? ''}`.toLowerCase();
  if (t.includes('goal') || t.includes('score')) return 'goal';
  if (t.includes('red card') || t.includes('second yellow')) return 'red-card';
  if (t.includes('yellow card') || t.includes('booking')) return 'yellow-card';
  if (t.includes('substitut') || t.includes('sub ') || t.includes('replaced')) return 'substitution';
  if (t.includes('var')) return 'var';
  return 'other';
}

const STAT_KEYS = [
  { key: 'possessionPct', label: 'Possession %' },
  { key: 'totalShots', label: 'Shots' },
  { key: 'shotsOnTarget', label: 'Shots on Target' },
  { key: 'wonCorners', label: 'Corners' },
  { key: 'saves', label: 'Saves' },
  { key: 'foulsCommitted', label: 'Fouls' },
  { key: 'yellowCards', label: 'Yellow Cards' },
  { key: 'redCards', label: 'Red Cards' },
  { key: 'offsides', label: 'Offsides' },
  { key: 'totalPasses', label: 'Passes' },
  { key: 'accuratePasses', label: 'Accurate Passes' },
  { key: 'totalTackles', label: 'Tackles' },
  { key: 'interceptions', label: 'Interceptions' },
];

export function useMatchDetail(eventId: string) {
  return useQuery<MatchDetail>({
    queryKey: ['matchDetail', eventId],
    queryFn: async () => {
      const data = await espnFetch(`${ESPN_BASE}/summary?event=${eventId}`);

      const header = data.header?.competitions?.[0];
      const competitors: any[] = header?.competitors ?? [];
      const home = competitors.find((c: any) => c.homeAway === 'home') ?? competitors[0];
      const away = competitors.find((c: any) => c.homeAway === 'away') ?? competitors[1];
      const statusType = header?.status?.type ?? {};

      // ── Lineups ──────────────────────────────────────────────────────────
      // ESPN exposes lineups under `rosters`, NOT `boxscore.players`.
      let lineups: MatchDetail['lineups'] = null;
      const rosters: any[] = data.rosters ?? [];
      if (rosters.length >= 2) {
        const parseLineup = (entry: any): MatchTeamLineup => {
          const formationStr: string = entry.formation ?? '';
          const placeToGroup = buildFormationMap(formationStr);
          const players: MatchPlayer[] = (entry.roster ?? []).map((r: any) => {
            const ath = r.athlete ?? {};
            const statsMap: Record<string, string> = {};
            (r.stats ?? []).forEach((s: any) => {
              if (s.name) statsMap[s.name] = s.displayValue ?? String(s.value ?? '');
            });
            const place: number = r.formationPlace ?? 0;
            const group: MatchPlayer['positionGroup'] = placeToGroup[place] ?? 'MF';
            return {
              id: ath.id ?? '',
              displayName: ath.shortName ?? ath.displayName ?? 'Player',
              jersey: r.jersey ?? ath.jersey ?? '',
              position: r.starter ? POSITION_LABEL[group] : 'SUB',
              positionGroup: group,
              headshot: ath.headshot?.href,
              starter: r.starter ?? false,
              stats: statsMap,
            };
          });
          const t = entry.team ?? {};
          return {
            team: {
              id: t.id ?? '',
              displayName: t.displayName ?? '',
              logo: t.logos?.[0]?.href ?? t.logo ?? '',
              color: t.color ?? '003DA5',
            },
            formation: formationStr || undefined,
            starters: players.filter((p) => p.starter),
            bench: players.filter((p) => !p.starter),
          };
        };
        const lp0 = parseLineup(rosters[0]);
        const lp1 = parseLineup(rosters[1]);
        // Resolve home/away deterministically: explicit homeAway flag first,
        // then strict team-id match, then preserve roster order (index 0 = home).
        let zeroIsHome: boolean;
        if (rosters[0].homeAway === 'home' || rosters[1].homeAway === 'away') {
          zeroIsHome = true;
        } else if (rosters[0].homeAway === 'away' || rosters[1].homeAway === 'home') {
          zeroIsHome = false;
        } else if (lp0.team.id && home?.team?.id) {
          zeroIsHome = lp0.team.id === home.team.id || lp1.team.id !== home.team.id;
        } else {
          zeroIsHome = true;
        }
        const homeLP = zeroIsHome ? lp0 : lp1;
        const awayLP = zeroIsHome ? lp1 : lp0;
        lineups = [homeLP, awayLP];
      }

      // ── Events ───────────────────────────────────────────────────────────
      // ESPN exposes match events under `keyEvents`, NOT `plays`.
      const events: MatchEvent[] = (data.keyEvents ?? [])
        .filter((p: any) => {
          const s = `${p.type?.text ?? ''} ${p.type?.type ?? ''}`.toLowerCase();
          return (
            p.scoringPlay ||
            s.includes('goal') ||
            s.includes('yellow') ||
            s.includes('red') ||
            s.includes('card') ||
            s.includes('substitut') ||
            s.includes('penalty') ||
            s.includes('var')
          );
        })
        .map((p: any, i: number) => ({
          id: p.id ?? String(i),
          clock: p.clock?.displayValue ?? '',
          period: p.period?.number ?? 1,
          type: parseEventType(p.type?.text ?? p.text ?? '', p.type?.type),
          text: p.shortText ?? p.text ?? '',
          teamId: p.team?.id,
          playerName: p.participants?.[0]?.athlete?.displayName ?? '',
        }));

      // ── Stats ────────────────────────────────────────────────────────────
      const boxTeams: any[] = data.boxscore?.teams ?? [];
      const homeStats: any[] = (boxTeams.find((t: any) => t.team?.id === home?.team?.id) ?? boxTeams[0])?.statistics ?? [];
      const awayStats: any[] = (boxTeams.find((t: any) => t.team?.id === away?.team?.id) ?? boxTeams[1])?.statistics ?? [];

      const stats: MatchStat[] = STAT_KEYS.flatMap(({ key, label }) => {
        const hs = homeStats.find((s: any) => s.name === key || s.abbreviation === key);
        const as_ = awayStats.find((s: any) => s.name === key || s.abbreviation === key);
        if (!hs || !as_) return [];
        const hv = parseFloat(hs.displayValue ?? String(hs.value ?? '0')) || 0;
        const av = parseFloat(as_.displayValue ?? String(as_.value ?? '0')) || 0;
        const total = hv + av;
        return [{
          name: key,
          displayName: hs.label ?? label,
          homeValue: hs.displayValue ?? String(hs.value ?? '0'),
          awayValue: as_.displayValue ?? String(as_.value ?? '0'),
          homePercent: total > 0 ? (hv / total) * 100 : 50,
        }];
      });

      return {
        id: eventId,
        homeTeam: {
          id: home?.team?.id ?? '',
          displayName: home?.team?.displayName ?? 'Home',
          logo: home?.team?.logo ?? '',
          score: home?.score ?? '0',
          color: home?.team?.color ?? '003DA5',
        },
        awayTeam: {
          id: away?.team?.id ?? '',
          displayName: away?.team?.displayName ?? 'Away',
          logo: away?.team?.logo ?? '',
          score: away?.score ?? '0',
          color: away?.team?.color ?? 'C8102E',
        },
        status: statusType.name ?? '',
        statusDetail: statusType.shortDetail ?? '',
        isLive: statusType.name === 'STATUS_IN_PROGRESS' || statusType.name === 'STATUS_HALFTIME',
        isFinished: statusType.completed ?? false,
        venue: header?.venue?.fullName,
        city: header?.venue?.address?.city,
        date: header?.date ?? '',
        lineups,
        events,
        stats,
      };
    },
    staleTime: 15_000,
    refetchInterval: (q) => (q.state.data?.isLive ? 15_000 : 60_000),
    enabled: !!eventId,
  });
}
