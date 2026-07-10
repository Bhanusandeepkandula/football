import { useEffect, useRef } from 'react';
import type { EspnEvent } from '@/hooks/useWorldCup';
import {
  applyPolymarketUpdate,
  isPolymarketLiveFresh,
  polymarketMatchRefFromEvent,
} from '@/lib/polymarketLiveStore';
import { connectPolymarketSports, isSoccerSportResult, matchesPolymarketEvent } from '@/lib/polymarketSports';

/**
 * Primary live feed for the scoreboard — Polymarket pushes update the shared
 * live store instantly; UI reads overlays from there.
 */
export function usePolymarketScoreboardLive(events: EspnEvent[] | undefined, enabled: boolean) {
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    if (!enabled || !events?.length) return;

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

/** ESPN scoreboard refetch only when Polymarket isn't fresh for listed live fixtures. */
export function useEspnScoreboardFallback(
  events: EspnEvent[] | undefined,
  enabled: boolean,
  onRefresh: () => void,
) {
  const cb = useRef(onRefresh);
  cb.current = onRefresh;
  const last = useRef(0);

  useEffect(() => {
    if (!enabled || !events?.length) return;

    const id = setInterval(() => {
      const list = events ?? [];
      const anyFresh = list.some((ev) => isPolymarketLiveFresh(polymarketMatchRefFromEvent(ev)));
      if (anyFresh) return;
      const now = Date.now();
      if (now - last.current < 1500) return;
      last.current = now;
      cb.current();
    }, 8_000);

    return () => clearInterval(id);
  }, [enabled, events]);
}
