import { useEffect, useState, useSyncExternalStore } from 'react';
import { liveClient } from '@/lib/api/live';
import type {
  LiveContentStateMessage,
  LiveMessage,
  LiveScoreUpdate,
} from '@/lib/api/types';
import {
  type PolymarketMatchRef,
  type PolymarketSportResult,
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

/**
 * A match ref extended with the backend's addressing keys. When BOTH `league`
 * (a competition slug) and `matchId` (the ESPN event id) are present, the hook
 * sources live frames from the @matchcenter backend WebSocket. When either is
 * missing — the current MatchCard/detail call sites don't yet supply them — the
 * hook falls back to the on-device Polymarket socket, unchanged. Either way the
 * SAME `PolymarketLiveSnapshot` shape lands in the shared overlay store, so the
 * hook's return type is identical regardless of the source.
 */
export interface PolymarketLiveRef extends PolymarketMatchRef {
  /** Competition slug the backend WS subscribes under. */
  league?: string;
  /** ESPN event id the backend WS subscribes to. */
  matchId?: string;
}

// ─── Backend live-frame → shared overlay store bridge ────────────────────────
// The overlay store only accepts writes through `applyPolymarketUpdate`, which
// re-derives a `PolymarketLiveSnapshot` from a `PolymarketSportResult` via the
// store's own `parsePolymarketSnapshot`. To feed the store from the backend WS
// without touching the store module, we synthesize the minimal
// `PolymarketSportResult` that the store parses back into the snapshot the
// backend frame describes. This keeps the snapshot vocabulary (and therefore
// every downstream consumer) byte-identical to the legacy Polymarket path — the
// backend is simply the new data source behind the same shape.

/** First integer in a clock string, e.g. "63'" → 63, "45'+2" → 45. */
function leadingInt(raw?: string): number | null {
  const m = /(\d+)/.exec(raw ?? '');
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Synthesize a `PolymarketSportResult` from a backend score frame such that the
 * store's `parsePolymarketSnapshot` reproduces the frame's status/scores. Team
 * names are set to the ref's own names so orientation resolves to 'same' and the
 * `home-away` scoreline maps straight through (never inverted).
 */
function scoreFrameToResult(f: LiveScoreUpdate, ref: PolymarketMatchRef): PolymarketSportResult {
  const s = f.status;
  const detail = (s.detail ?? '').trim();
  const name = s.name ?? '';
  const base: PolymarketSportResult = {
    homeTeam: ref.homeName || ref.homeAbbr,
    awayTeam: ref.awayName || ref.awayAbbr,
    score: `${f.home.score}-${f.away.score}`,
  };

  if (s.isFinished) {
    return { ...base, status: 'Final', ended: true, live: false };
  }
  if (/(penalt|shootout)/i.test(name) || /pen/i.test(detail)) {
    return { ...base, status: 'PenaltyShootout', live: true };
  }
  if (/halftime|half-time/i.test(name) || /^ht$/i.test(detail)) {
    return { ...base, status: 'Break', period: 'HT', live: true };
  }
  if (s.isLive) {
    // clockRunning ⇒ the store needs status 'InProgress' + a '1H'/'2H' period;
    // when the ball is stopped (VAR, injury) drop the half token so the parsed
    // snapshot reports clockRunning:false while still LIVE.
    const period = s.clockRunning ? (s.period === 1 ? '1H' : '2H') : '';
    const mins = leadingInt(s.clock);
    const elapsed = mins != null ? `${mins}:00` : undefined;
    return { ...base, status: 'InProgress', period, elapsed, live: true };
  }
  // Pre-match / other: surface the backend's own short label as the status text.
  return { ...base, status: detail || name || 'Scheduled', live: false };
}

/**
 * Synthesize a `PolymarketSportResult` from a backend content-state frame. Used
 * only to SEED the store before the first score frame arrives (the score frame
 * carries the authoritative status), so it maps conservatively.
 */
function stateFrameToResult(f: LiveContentStateMessage, ref: PolymarketMatchRef): PolymarketSportResult {
  const st = f.state;
  const status = (st.status ?? '').trim();
  const base: PolymarketSportResult = {
    homeTeam: ref.homeName || ref.homeAbbr,
    awayTeam: ref.awayName || ref.awayAbbr,
    score: `${st.homeScore}-${st.awayScore}`,
  };

  if (/^ht$/i.test(status) || /halftime|half-time/i.test(status)) {
    return { ...base, status: 'Break', period: 'HT', live: true };
  }
  if (st.isLive) {
    // clockRunning ← isLive && !paused (approx; a score frame refines it).
    const period = st.paused ? '' : '2H';
    return { ...base, status: 'InProgress', period, live: true };
  }
  return { ...base, status: status || 'Scheduled', live: false };
}

/** The `matchId` a frame is scoped to, or undefined for hello/ping. */
export function frameMatchId(msg: LiveMessage): string | undefined {
  return msg.type === 'score' || msg.type === 'state' || msg.type === 'event'
    ? msg.matchId
    : undefined;
}

/**
 * Write a backend live frame into the shared overlay store under `ref`'s key.
 * Score frames always win; state frames only seed when nothing fresh exists yet
 * (so a redundant state replay never downgrades a fresh score-derived snapshot).
 */
export function applyBackendLiveFrame(msg: LiveMessage, ref: PolymarketMatchRef): void {
  if (msg.type === 'score') {
    applyPolymarketUpdate(scoreFrameToResult(msg, ref), ref);
  } else if (msg.type === 'state') {
    if (isPolymarketLiveFresh(ref)) return;
    applyPolymarketUpdate(stateFrameToResult(msg, ref), ref);
  }
}

function usePolymarketStore<T>(selector: () => T): T {
  return useSyncExternalStore(subscribePolymarketLive, selector, selector);
}

/** Live score/status for one match — backend WS when addressable, else Polymarket. */
export function usePolymarketLive(ref?: PolymarketLiveRef): {
  live: PolymarketLiveSnapshot | undefined;
  fresh: boolean;
  connected: boolean;
} {
  const backendLeague = ref?.league;
  const backendMatchId = ref?.matchId;
  const useBackend = !!(backendLeague && backendMatchId);
  const key = ref
    ? `${ref.homeAbbr}|${ref.awayAbbr}|${ref.date}|${backendLeague ?? ''}|${backendMatchId ?? ''}`
    : '';

  useEffect(() => {
    if (!ref) return;

    // Primary: backend live WebSocket (per-match). Requires league + matchId.
    if (useBackend && backendLeague && backendMatchId) {
      try {
        const handle = liveClient.watchMatch(backendLeague, backendMatchId, (msg) => {
          if (frameMatchId(msg) === backendMatchId) applyBackendLiveFrame(msg, ref);
        });
        return () => handle.close();
      } catch {
        // fall through to the legacy socket below
      }
    }

    // Fallback: on-device Polymarket sports socket (original path).
    const handle = connectPolymarketSports((msg) => {
      if (matchesPolymarketEvent(msg, ref)) applyPolymarketUpdate(msg, ref);
    });
    return () => handle.close();
  }, [key]);

  // Reflect the active transport's connection state.
  const [backendOpen, setBackendOpen] = useState(() => liveClient.isConnected());
  useEffect(() => {
    if (!useBackend) return;
    return liveClient.onStatus((s) => setBackendOpen(s === 'open'));
  }, [useBackend]);
  const polyConnected = usePolymarketStore(isPolymarketWsConnected);

  const live = usePolymarketStore(() => (ref ? getPolymarketLive(ref) : undefined));
  const fresh = usePolymarketStore(() => (ref ? isPolymarketLiveFresh(ref) : false));
  const connected = useBackend ? backendOpen : polyConnected;

  return { live, fresh, connected };
}

/** Read a cached snapshot without opening a dedicated subscription. */
export function usePolymarketLiveRead(ref?: PolymarketMatchRef): PolymarketLiveSnapshot | undefined {
  return usePolymarketStore(() => (ref ? getPolymarketLive(ref) : undefined));
}
