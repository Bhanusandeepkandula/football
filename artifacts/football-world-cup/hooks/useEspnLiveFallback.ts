import { useEffect, useRef } from 'react';
import { liveClient } from '@/lib/api/live';
import { connectMatchFastcast } from '@/lib/fastcast';
import { useLeague } from '@/hooks/useLeague';
import { frameMatchId } from '@/hooks/usePolymarketLive';
import type { PolymarketMatchRef } from '@/lib/polymarketSports';

const FALLBACK_POLL_MS = 8_000;

/**
 * Nudges the match-detail query to refetch when the live match changes. Primary
 * source is the @matchcenter backend WebSocket (this hook already has the event
 * id + league it needs to address it directly); the ESPN Fastcast socket + a
 * slow REST poll are kept as a safety net that only runs while the backend WS is
 * disconnected. `onRefresh` calls are debounced ~1.5s to coalesce bursts.
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
    const now = Date.now();
    if (now - last.current < 1500) return;
    last.current = now;
    cb.current();
  };

  // Primary: backend live WS. Any score/event/state frame for this match means
  // the detail payload changed — refetch it.
  useEffect(() => {
    if (!eventId || !espnIsLive) return;
    try {
      const handle = liveClient.watchMatch(slug, eventId, (msg) => {
        if (frameMatchId(msg) !== eventId) return;
        if (msg.type === 'score' || msg.type === 'event' || msg.type === 'state') fire();
      });
      return () => handle.close();
    } catch {
      // fall through to the Fastcast fallback effect below
    }
  }, [eventId, espnIsLive, slug]);

  // Fallback: ESPN Fastcast nudges only while the backend WS is down.
  useEffect(() => {
    if (!eventId || !espnIsLive) return;
    const fastcast = connectMatchFastcast(eventId, slug, () => {
      if (liveClient.isConnected()) return;
      fire();
    });
    return () => fastcast.close();
  }, [eventId, espnIsLive, slug]);

  // Fallback: slow REST poll only while the backend WS is down.
  useEffect(() => {
    if (!espnIsLive) return;
    const id = setInterval(() => {
      if (liveClient.isConnected()) return;
      fire();
    }, FALLBACK_POLL_MS);
    return () => clearInterval(id);
  }, [espnIsLive]);
}
