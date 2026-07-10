import type { MatchDetail } from '@/hooks/useMatchDetail';
import type { EspnEvent } from '@/hooks/useWorldCup';
import type { PolymarketLiveSnapshot } from '@/lib/polymarketLiveStore';

/** Prefer Polymarket for live scoreboard fields; keep ESPN for everything else. */
export function mergeMatchDetail(
  espn: MatchDetail,
  poly?: PolymarketLiveSnapshot,
): MatchDetail {
  if (!poly) return espn;

  return {
    ...espn,
    homeTeam: { ...espn.homeTeam, score: poly.homeScore },
    awayTeam: { ...espn.awayTeam, score: poly.awayScore },
    statusDetail: poly.statusDetail,
    isLive: poly.isLive,
    isFinished: poly.isFinished,
    clockRunning: poly.clockRunning,
    displayClock: poly.displayClock ?? espn.displayClock,
  };
}

export interface LiveScoreOverlay {
  homeScore: string;
  awayScore: string;
  statusLabel: string;
  isLive: boolean;
  isFinished: boolean;
}

export function liveScoreOverlay(
  event: EspnEvent,
  poly?: PolymarketLiveSnapshot,
  espnStatusLabel?: string,
): LiveScoreOverlay {
  const comp = event.competitions?.[0];
  const home = comp?.competitors?.find((c) => c.homeAway === 'home');
  const away = comp?.competitors?.find((c) => c.homeAway === 'away');

  if (!poly) {
    return {
      homeScore: home?.score ?? '0',
      awayScore: away?.score ?? '0',
      statusLabel: espnStatusLabel ?? '',
      isLive: false,
      isFinished: false,
    };
  }

  return {
    homeScore: poly.homeScore,
    awayScore: poly.awayScore,
    statusLabel: poly.statusDetail,
    isLive: poly.isLive,
    isFinished: poly.isFinished,
  };
}
