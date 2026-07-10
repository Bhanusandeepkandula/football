import { useEffect } from 'react';
import {
  areLiveActivitiesSupported,
  startMatchActivity,
  updateMatchActivity,
  endMatchActivity,
  MatchActivityState,
} from '@/lib/liveActivity';

// Module-level (not React refs) so a single activity survives component
// remounts / Fast Refresh — that reset is what let duplicates stack up.
let current: { matchId: string; id: string | null } | null = null;
let starting = false;

function abbr(name: string): string {
  const words = (name ?? '').replace(/[^a-zA-Z\s-]/g, '').split(/[\s-]+/).filter(Boolean);
  if (words.length > 1) return words.map((w) => w[0]).join('').slice(0, 3).toUpperCase();
  return (words[0] ?? name ?? '').slice(0, 3).toUpperCase();
}

interface LiveActivityEvent {
  type: string;
  isPenalty?: boolean;
  playerName?: string;
}

interface LiveActivityMatch {
  id: string;
  isLive: boolean;
  isFinished: boolean;
  statusDetail?: string;
  resultSuffix?: string;
  homeTeam: { displayName: string; score: string };
  awayTeam: { displayName: string; score: string };
  events?: LiveActivityEvent[];
}

// The most recent notable moment, as a short Dynamic-Island label.
function latestEventLabel(events?: LiveActivityEvent[]): string {
  if (!events || events.length === 0) return '';
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === 'red-card') return `🟥 ${e.playerName ?? 'Red card'}`;
    if (e.type === 'goal') return `⚽ ${e.playerName ?? 'Goal'}`;
    if (e.isPenalty) return `🎯 ${e.playerName ?? 'Penalty'}`;
  }
  return '';
}

/**
 * Mirrors a live match into an iOS Live Activity / Dynamic Island while it's on
 * screen: starts one when the match is live, pushes updates as the score/clock
 * change, and ends it when the match finishes or the screen is left. No-ops on
 * anything but a native build with the LiveActivity module present.
 */
export function useMatchLiveActivity(
  data: LiveActivityMatch | undefined,
  liveStatus: string | null | undefined,
  homeColor: string,
  awayColor: string,
) {
  const state: MatchActivityState | null = data
    ? {
        homeAbbr: abbr(data.homeTeam.displayName),
        awayAbbr: abbr(data.awayTeam.displayName),
        homeScore: parseInt(data.homeTeam.score || '0', 10) || 0,
        awayScore: parseInt(data.awayTeam.score || '0', 10) || 0,
        status: data.isFinished ? data.resultSuffix ?? 'FT' : liveStatus ?? data.statusDetail ?? 'LIVE',
        isLive: data.isLive,
        homeColor,
        awayColor,
        lastEvent: latestEventLabel(data.events),
      }
    : null;

  // Serialize the mutable state so the effect only re-fires on a real change.
  const stateKey = state ? JSON.stringify(state) : '';

  useEffect(() => {
    if (!data || !state || !areLiveActivitiesSupported()) return;

    // Match over → end the activity (once).
    if (data.isFinished) {
      if (current?.id) endMatchActivity(current.id, state);
      current = null;
      return;
    }
    if (!data.isLive) return;

    // Same match already has an activity → update it in place.
    if (current && current.matchId === data.id) {
      if (current.id) updateMatchActivity(current.id, state);
      return;
    }

    // New match (or none yet) → start one. The native side ends any existing
    // activity first, so a single Live Activity is guaranteed (no stacking).
    if (!starting) {
      starting = true;
      current = { matchId: data.id, id: null };
      startMatchActivity(
        { matchId: data.id, homeName: data.homeTeam.displayName, awayName: data.awayTeam.displayName },
        state,
      )
        .then((id) => { if (current && current.matchId === data.id) current.id = id; })
        .finally(() => { starting = false; });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateKey]);
}
