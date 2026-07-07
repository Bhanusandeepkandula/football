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

function getPositionGroup(abbr: string): MatchPlayer['positionGroup'] {
  const a = (abbr ?? '').toUpperCase();
  if (a === 'GK' || a === 'G' || a === 'P') return 'GK';
  if (['CB', 'LB', 'RB', 'LWB', 'RWB', 'SW', 'DF', 'D', 'WB'].some(p => a === p || a.startsWith(p))) return 'DF';
  if (['CM', 'CDM', 'CAM', 'LM', 'RM', 'DM', 'AM', 'MF', 'M', 'MD'].some(p => a === p || a.startsWith(p))) return 'MF';
  return 'FW';
}

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
  { key: 'totalShots', label: 'Total Shots' },
  { key: 'shotsOnTarget', label: 'Shots on Target' },
  { key: 'saves', label: 'Saves' },
  { key: 'corners', label: 'Corners' },
  { key: 'fouls', label: 'Fouls' },
  { key: 'yellowCards', label: 'Yellow Cards' },
  { key: 'redCards', label: 'Red Cards' },
  { key: 'offsides', label: 'Offsides' },
  { key: 'passesAccurate', label: 'Passes Accurate' },
  { key: 'passAccuracy', label: 'Pass Accuracy' },
  { key: 'tackles', label: 'Tackles' },
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
      let lineups: MatchDetail['lineups'] = null;
      const boxPlayers: any[] = data.boxscore?.players ?? [];
      if (boxPlayers.length >= 2) {
        const parseLineup = (entry: any): MatchTeamLineup => {
          const athletes: MatchPlayer[] = (entry.athletes ?? []).map((a: any) => {
            const ath = a.athlete ?? {};
            const posAbbr: string = ath.position?.abbreviation ?? ath.position?.name ?? '';
            const statsMap: Record<string, string> = {};
            (a.statistics ?? []).forEach((s: any) => {
              if (s.name) statsMap[s.name] = s.displayValue ?? String(s.value ?? '');
            });
            return {
              id: ath.id ?? '',
              displayName: ath.shortName ?? ath.displayName ?? 'Player',
              jersey: ath.jersey ?? '',
              position: posAbbr,
              positionGroup: getPositionGroup(posAbbr),
              headshot: ath.headshot?.href,
              starter: a.starter ?? false,
              stats: statsMap,
            };
          });
          const t = entry.team ?? {};
          return {
            team: { id: t.id ?? '', displayName: t.displayName ?? '', logo: t.logo ?? '', color: t.color ?? '003DA5' },
            formation: entry.formation?.displayName,
            starters: athletes.filter(a => a.starter),
            bench: athletes.filter(a => !a.starter),
          };
        };
        const lp0 = parseLineup(boxPlayers[0]);
        const lp1 = parseLineup(boxPlayers[1]);
        const homeLP = lp0.team.id === home?.team?.id ? lp0 : lp1;
        const awayLP = lp0.team.id === home?.team?.id ? lp1 : lp0;
        lineups = [homeLP, awayLP];
      }

      // ── Events ───────────────────────────────────────────────────────────
      const events: MatchEvent[] = (data.plays ?? [])
        .filter((p: any) => {
          const txt = (p.text ?? '').toLowerCase();
          const typ = (p.type?.text ?? '').toLowerCase();
          return (
            p.scoringPlay ||
            txt.includes('goal') ||
            txt.includes('yellow') ||
            txt.includes('red card') ||
            txt.includes('substitut') ||
            txt.includes('var') ||
            typ.includes('goal') ||
            typ.includes('card')
          );
        })
        .map((p: any, i: number) => ({
          id: p.id ?? String(i),
          clock: p.clock?.displayValue ?? '',
          period: p.period?.number ?? 1,
          type: parseEventType(p.text ?? '', p.type?.text),
          text: p.text ?? '',
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
