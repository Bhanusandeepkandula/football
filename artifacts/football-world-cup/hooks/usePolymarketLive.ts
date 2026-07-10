import { useEffect, useSyncExternalStore } from 'react';
import {
  type PolymarketMatchRef,
  connectPolymarketSports,
  matchesPolymarketEvent,
} from '@/lib/polymarketSports';
import {
  applyPolymarketUpdate,
  getPolymarketLive,
  isPolymarketLiveFresh,
  isPolymarketWsConnected,
  subscribePolymarketLive,
  type PolymarketLiveSnapshot,
} from '@/lib/polymarketLiveStore';

function usePolymarketStore<T>(selector: () => T): T {
  return useSyncExternalStore(subscribePolymarketLive, selector, selector);
}

/** Live score/status from Polymarket WS — primary instant feed for one match. */
export function usePolymarketLive(ref?: PolymarketMatchRef): {
  live: PolymarketLiveSnapshot | undefined;
  fresh: boolean;
  connected: boolean;
} {
  const key = ref ? `${ref.homeAbbr}|${ref.awayAbbr}|${ref.date}` : '';

  useEffect(() => {
    if (!ref) return;
    const handle = connectPolymarketSports((msg) => {
      if (matchesPolymarketEvent(msg, ref)) applyPolymarketUpdate(msg, ref);
    });
    return () => handle.close();
  }, [key]);

  const live = usePolymarketStore(() => (ref ? getPolymarketLive(ref) : undefined));
  const fresh = usePolymarketStore(() => (ref ? isPolymarketLiveFresh(ref) : false));
  const connected = usePolymarketStore(isPolymarketWsConnected);

  return { live, fresh, connected };
}

/** Read a cached Polymarket snapshot without opening a dedicated subscription. */
export function usePolymarketLiveRead(ref?: PolymarketMatchRef): PolymarketLiveSnapshot | undefined {
  return usePolymarketStore(() => (ref ? getPolymarketLive(ref) : undefined));
}
