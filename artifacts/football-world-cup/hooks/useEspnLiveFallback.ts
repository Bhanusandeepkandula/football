import { useEffect, useRef } from 'react';
import { connectMatchFastcast } from '@/lib/fastcast';
import { useLeague } from '@/hooks/useLeague';
import type { PolymarketMatchRef } from '@/lib/polymarketSports';
import { isPolymarketLiveFresh } from '@/lib/polymarketLiveStore';

const FALLBACK_POLL_MS = 8_000;

/**
 * ESPN Fastcast + faster REST polling only when Polymarket isn't delivering
 * fresh live data for this match.
 */
export function useEspnLiveFallback(
  eventId: string | undefined,
  ref: PolymarketMatchRef | undefined,
  espnIsLive: boolean,
  onRefresh: () => void,
  slugOverride?: string,
) {
  const { slug: ctxSlug } = useLeague();
  const slug = slugOverride || ctxSlug;
  const cb = useRef(onRefresh);
  cb.current = onRefresh;
  const last = useRef(0);

  const fire = () => {
    if (ref && isPolymarketLiveFresh(ref)) return;
    const now = Date.now();
    if (now - last.current < 1500) return;
    last.current = now;
    cb.current();
  };

  // Fastcast nudges ESPN when Polymarket is stale.
  useEffect(() => {
    if (!eventId || !espnIsLive) return;
    const fastcast = connectMatchFastcast(eventId, slug, fire);
    return () => fastcast.close();
  }, [eventId, espnIsLive, slug]);

  // Slow background poll while Polymarket is fresh; faster when it's not.
  useEffect(() => {
    if (!espnIsLive) return;
    const tick = () => {
      const fresh = ref ? isPolymarketLiveFresh(ref) : false;
      if (!fresh) fire();
    };
    const ms = ref && isPolymarketLiveFresh(ref) ? 45_000 : FALLBACK_POLL_MS;
    const id = setInterval(tick, ms);
    return () => clearInterval(id);
  }, [espnIsLive, ref?.homeAbbr, ref?.awayAbbr, ref?.date]);
}
