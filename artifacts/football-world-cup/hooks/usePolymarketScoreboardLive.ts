import { useEffect, useRef } from 'react';
import type { EspnEvent } from '@/hooks/useWorldCup';
import { getActiveSlug } from '@/lib/espn';
import { liveClient } from '@/lib/api/live';
import { applyBackendLiveFrame, frameMatchId } from '@/hooks/usePolymarketLive';
import { applyPolymarketUpdate, polymarketMatchRefFromEvent } from '@/lib/polymarketLiveStore';
import { connectPolymarketSports, isSoccerSportResult, matchesPolymarketEvent } from '@/lib/polymarketSports';

/** Resolve the competition slug for a scoreboard event. */
type LeagueFor = string | ((event: EspnEvent) => string | undefined);

function resolveLeague(event: EspnEvent, leagueFor: LeagueFor | undefined): string | undefined {
  if (typeof leagueFor === 'function') return leagueFor(event);
  if (typeof leagueFor === 'string') return leagueFor;
  // No per-event league supplied: the visible scoreboard is (almost always) the
  // active competition, so address the backend WS with it. Events from other
  // competitions (the aggregated "All" feed) simply won't get a backend match —
  // the ESPN refetch safety net below keeps their scores fresh instead.
  return getActiveSlug();
}

/**
 * Primary live feed for the scoreboard. Subscribes the visible live fixtures to
 * the @matchcenter backend WebSocket; each frame is written into the shared
 * overlay store (keyed by its ESPN event), which MatchCard reads for its live
 * overlay. Falls back to the on-device Polymarket socket if the backend
 * subscription can't be set up. Side-effect only — returns void.
 *
 * `leagueFor` is an optional, backward-compatible way to address multi-league
 * feeds precisely (a fixed slug, or a per-event resolver). Existing 2-arg call
 * sites keep working and address the backend with the active competition.
 */
export function usePolymarketScoreboardLive(
  events: EspnEvent[] | undefined,
  enabled: boolean,
  leagueFor?: LeagueFor,
): void {
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const leagueForRef = useRef(leagueFor);
  leagueForRef.current = leagueFor;

  useEffect(() => {
    if (!enabled || !events?.length) return;

    // Map each visible event to a backend (league, matchId) subscription. Events
    // whose league can't be resolved are skipped (they fall back to ESPN polling).
    const idToEvent = new Map<string, EspnEvent>();
    const refs: { league: string; matchId: string }[] = [];
    for (const ev of events) {
      const league = resolveLeague(ev, leagueForRef.current);
      if (!league || !ev.id) continue;
      idToEvent.set(ev.id, ev);
      refs.push({ league, matchId: ev.id });
    }

    if (refs.length) {
      try {
        const handle = liveClient.watchMatches(refs, (msg) => {
          const id = frameMatchId(msg);
          if (!id) return;
          const ev = idToEvent.get(id);
          if (ev) applyBackendLiveFrame(msg, polymarketMatchRefFromEvent(ev));
        });
        return () => handle.close();
      } catch {
        // fall through to the legacy socket below
      }
    }

    // Fallback: on-device Polymarket sports socket (original path).
    const handle = connectPolymarketSports((msg) => {
      if (!isSoccerSportResult(msg)) return;
      for (const ev of eventsRef.current ?? []) {
        const ref = polymarketMatchRefFromEvent(ev);
        if (matchesPolymarketEvent(msg, ref)) applyPolymarketUpdate(msg, ref);
      }
    });
    return () => handle.close();
  }, [enabled, events]);
}

/**
 * ESPN scoreboard refetch as a safety net: polls ESPN only while the backend
 * live WS is disconnected, so a healthy backend feed suppresses the ESPN poll
 * entirely. Side-effect only — returns void.
 */
export function useEspnScoreboardFallback(
  events: EspnEvent[] | undefined,
  enabled: boolean,
  onRefresh: () => void,
): void {
  const cb = useRef(onRefresh);
  cb.current = onRefresh;
  const last = useRef(0);

  useEffect(() => {
    if (!enabled || !events?.length) return;

    const id = setInterval(() => {
      // Backend WS is authoritative; only poll ESPN when it isn't connected.
      if (liveClient.isConnected()) return;
      const now = Date.now();
      if (now - last.current < 1500) return;
      last.current = now;
      cb.current();
    }, 8_000);

    return () => clearInterval(id);
  }, [enabled, events]);
}
