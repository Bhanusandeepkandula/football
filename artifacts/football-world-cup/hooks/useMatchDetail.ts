import { useQuery } from '@tanstack/react-query';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world';

async function espnFetch(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN: ${res.status}`);
  return res.json();
}

// Any status where the match is actively being played (regulation, ET or the
// shootout) — used to drive the live clock and live styling.
const LIVE_DETAIL_STATUSES = new Set([
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

// Statuses where the ball is actually in play — the live clock only ticks for
// these (halftime, end-of-period and the shootout are paused states).
const RUNNING_STATUSES = new Set([
  'STATUS_IN_PROGRESS',
  'STATUS_FIRST_HALF',
  'STATUS_SECOND_HALF',
  'STATUS_OVERTIME',
  'STATUS_EXTRA_TIME',
]);

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
  typeLabel: string;
  text: string;
  detail?: string;
  teamId?: string;
  playerName?: string;
  secondaryName?: string; // assist provider (goal) or player coming off (sub)
  scoreHome?: number;
  scoreAway?: number;
  isPenalty?: boolean;
  isOwnGoal?: boolean;
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
  homeTeam: { id: string; displayName: string; logo: string; score: string; color: string; shootout?: number };
  awayTeam: { id: string; displayName: string; logo: string; score: string; color: string; shootout?: number };
  status: string;
  statusDetail: string;
  isLive: boolean;
  isFinished: boolean;
  clockRunning: boolean;
  period?: number;
  displayClock?: string;
  resultSuffix?: string; // 'AET' | 'Pens' | ''
  shootout?: { home: number; away: number } | null;
  venue?: string;
  city?: string;
  date: string;
  round?: string;
  referee?: string;
  attendance?: number;
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

const DEFAULT_TYPE_LABEL: Record<MatchEventType, string> = {
  goal: 'Goal',
  'yellow-card': 'Yellow Card',
  'red-card': 'Red Card',
  substitution: 'Substitution',
  var: 'VAR',
  other: 'Event',
};

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// ESPN's `text` is a full sentence, e.g.
//   "Goal! Mexico 1, South Africa 0. Julián Quiñones (Mexico) right footed
//    shot from the centre of the box to the centre of the goal. Assisted by Érik Lira."
// Extract a concise human description of *what happened* for each event type.
function cleanEventDetail(type: MatchEventType, text: string): string | undefined {
  if (!text) return undefined;
  if (type === 'goal') {
    const t = text
      .replace(/^Goal!.*?\.\s*/i, '') // drop "Goal! A 1, B 0. " score announcement
      .replace(/\s*Assisted by[^.]*\.?/i, '') // assist captured separately
      .replace(/^[^(]*\([^)]*\)\s*/, '') // drop "Player (Team) " prefix
      .trim()
      .replace(/\.$/, '');
    return t ? cap(t) : undefined;
  }
  if (type === 'yellow-card' || type === 'red-card') {
    const m = text.match(/for (.+?)\.?\s*$/i);
    if (m) return cap(`for ${m[1]}`);
    return undefined;
  }
  return undefined;
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
      const period: number = header?.status?.period ?? 0;
      const displayClock: string = header?.status?.displayClock ?? '';

      // Extra time / penalty shootout result.
      const homeSo = typeof home?.shootoutScore === 'number' ? home.shootoutScore : undefined;
      const awaySo = typeof away?.shootoutScore === 'number' ? away.shootoutScore : undefined;
      const shootout = homeSo != null && awaySo != null ? { home: homeSo, away: awaySo } : null;
      const resultSuffix = shootout || statusType.name === 'STATUS_FINAL_PEN' || statusType.name === 'STATUS_SHOOTOUT'
        ? 'Pens'
        : statusType.completed && period > 2
          ? 'AET'
          : '';

      // ── Match meta (round, venue, referee, attendance) ────────────────────
      const gameInfo = data.gameInfo ?? {};
      const round = String(data.header?.season?.name ?? '')
        .replace(/^\d{4}\s+FIFA World Cup,?\s*/i, '')
        .trim() || undefined;
      const venueName = header?.venue?.fullName ?? gameInfo.venue?.fullName;
      const cityName = header?.venue?.address?.city ?? gameInfo.venue?.address?.city;
      const referee = (gameInfo.officials ?? []).find(
        (o: any) => o.position?.name === 'Referee',
      )?.displayName;
      const attendance = typeof gameInfo.attendance === 'number' ? gameInfo.attendance : undefined;

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
      // ESPN exposes match events under `keyEvents`, NOT `plays`. keyEvents are
      // already chronological, so we accumulate a running score across goals.
      const homeIdForEvents = home?.team?.id;
      let runningHome = 0;
      let runningAway = 0;
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
        .map((p: any, i: number) => {
          const typeText: string = p.type?.text ?? '';
          const fullText: string = p.text ?? p.shortText ?? '';
          const type = parseEventType(typeText || p.text || '', p.type?.type);
          const isOwnGoal = /own goal/i.test(fullText) || /own[-\s]?goal/i.test(typeText);
          const isPenalty = /penalt/i.test(fullText) || /penalt/i.test(typeText);

          let scoreHome: number | undefined;
          let scoreAway: number | undefined;
          if (type === 'goal' && p.team?.id) {
            // Only accumulate when we can attribute the goal to a side; a
            // goal with a missing team id would otherwise silently mis-score.
            if (p.team.id === homeIdForEvents) runningHome += 1;
            else runningAway += 1;
            scoreHome = runningHome;
            scoreAway = runningAway;
          }

          return {
            id: p.id ?? String(i),
            clock: p.clock?.displayValue ?? '',
            period: p.period?.number ?? 1,
            type,
            typeLabel: isOwnGoal ? 'Own Goal' : isPenalty && type === 'goal' ? 'Penalty' : typeText || DEFAULT_TYPE_LABEL[type],
            text: p.shortText ?? fullText,
            detail: cleanEventDetail(type, fullText),
            teamId: p.team?.id,
            playerName: p.participants?.[0]?.athlete?.displayName ?? '',
            secondaryName:
              type === 'goal' || type === 'substitution'
                ? p.participants?.[1]?.athlete?.displayName ?? undefined
                : undefined,
            scoreHome,
            scoreAway,
            isPenalty,
            isOwnGoal,
          };
        });

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

      // ── Derived accuracy percentages ──────────────────────────────────────
      // ESPN gives raw counts (shots, shots on target, passes, accurate passes)
      // but no accuracy %. Compute them so fans see conversion, not just volume.
      const rawStat = (arr: any[], key: string): number => {
        const s = arr.find((x: any) => x.name === key || x.abbreviation === key);
        return s ? parseFloat(s.displayValue ?? String(s.value ?? '0')) || 0 : 0;
      };
      const addAccuracy = (afterKey: string, name: string, label: string, madeKey: string, totalKey: string) => {
        const hMade = rawStat(homeStats, madeKey);
        const hTot = rawStat(homeStats, totalKey);
        const aMade = rawStat(awayStats, madeKey);
        const aTot = rawStat(awayStats, totalKey);
        if (hTot <= 0 || aTot <= 0) return;
        const hPct = Math.round((hMade / hTot) * 100);
        const aPct = Math.round((aMade / aTot) * 100);
        const entry: MatchStat = {
          name,
          displayName: label,
          homeValue: `${hPct}%`,
          awayValue: `${aPct}%`,
          homePercent: hPct + aPct > 0 ? (hPct / (hPct + aPct)) * 100 : 50,
        };
        const idx = stats.findIndex((s) => s.name === afterKey);
        if (idx >= 0) stats.splice(idx + 1, 0, entry);
        else stats.push(entry);
      };
      addAccuracy('shotsOnTarget', 'shotAccuracy', 'Shot Accuracy', 'shotsOnTarget', 'totalShots');
      addAccuracy('accuratePasses', 'passAccuracy', 'Pass Accuracy', 'accuratePasses', 'totalPasses');

      return {
        id: eventId,
        homeTeam: {
          id: home?.team?.id ?? '',
          displayName: home?.team?.displayName ?? 'Home',
          logo: home?.team?.logos?.[0]?.href ?? home?.team?.logo ?? '',
          score: home?.score ?? '0',
          color: home?.team?.color ?? '003DA5',
          shootout: homeSo,
        },
        awayTeam: {
          id: away?.team?.id ?? '',
          displayName: away?.team?.displayName ?? 'Away',
          logo: away?.team?.logos?.[0]?.href ?? away?.team?.logo ?? '',
          score: away?.score ?? '0',
          color: away?.team?.color ?? 'C8102E',
          shootout: awaySo,
        },
        status: statusType.name ?? '',
        statusDetail: statusType.shortDetail ?? '',
        isLive: LIVE_DETAIL_STATUSES.has(statusType.name ?? ''),
        isFinished: statusType.completed ?? false,
        clockRunning: RUNNING_STATUSES.has(statusType.name ?? ''),
        period,
        displayClock,
        resultSuffix,
        shootout,
        venue: venueName,
        city: cityName,
        date: header?.date ?? '',
        round,
        referee,
        attendance,
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
