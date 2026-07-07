import { useQuery } from '@tanstack/react-query';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world';

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

export interface TeamDetail {
  id: string;
  displayName: string;
  logo: string;
  color: string;
  location?: string;
  coach?: string;
  players: TeamPlayer[];
  fixtures: TeamFixture[];
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

export function useTeamDetail(teamId: string) {
  return useQuery<TeamDetail>({
    queryKey: ['teamDetail', teamId],
    queryFn: async () => {
      const [teamRes, rosterRes, schedRes] = await Promise.all([
        espnFetch(`${ESPN_BASE}/teams/${teamId}`),
        espnFetch(`${ESPN_BASE}/teams/${teamId}/roster`).catch(() => ({ athletes: [], coach: [] })),
        espnFetch(`${ESPN_BASE}/teams/${teamId}/schedule`).catch(() => ({ events: [] })),
      ]);

      const t = teamRes.team ?? {};

      const players: TeamPlayer[] = (rosterRes.athletes ?? []).map((a: any) => {
        const pos = a.position?.abbreviation ?? a.position?.name ?? '';
        return {
          id: a.id ?? '',
          displayName: a.displayName ?? a.fullName ?? 'Player',
          jersey: a.jersey,
          position: pos,
          positionGroup: positionGroupFor(pos),
          age: a.age,
          headshot: a.headshot?.href,
        };
      });

      const coach = (rosterRes.coach ?? [])
        .map((c: any) => [c.firstName, c.lastName].filter(Boolean).join(' '))
        .filter(Boolean)[0];

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

      return {
        id: teamId,
        displayName: t.displayName ?? 'Team',
        logo: t.logos?.[0]?.href ?? '',
        color: t.color ?? '888888',
        location: t.location,
        coach,
        players,
        fixtures,
      };
    },
    staleTime: 300_000,
    enabled: !!teamId,
  });
}
