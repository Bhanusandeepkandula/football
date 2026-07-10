// ─── @matchcenter/api live client (WebSocket) ────────────────────────────────
// React Native ships a global `WebSocket` but has NO `EventSource`, so the live
// channel uses WS (not the backend's SSE mirror). One process-wide socket is
// shared by every subscriber; per-match interest is ref-counted, so N screens
// watching the same fixture cost one server subscription.
//
// Protocol (see services/api/src/live/ws.ts):
//   • connect to `${WS_BASE}/v1/live/ws`
//   • send `{ action:'subscribe'|'unsubscribe', league, matchId }` to (un)watch
//   • receive `LiveMessage` frames: hello | state | score | event | ping
//   • on the first subscribe for a match the server replays `hello` + `state`
//
// The socket auto-reconnects with exponential backoff + jitter and re-sends all
// live subscriptions on every (re)connect. A watchdog forces a reconnect if no
// frame (the server pings ~25s) arrives within the stall window.

import { LIVE_WS_PATH, WS_BASE } from './config';
import type { LiveMessage, LiveSubscribe } from './types';

export type LiveListener = (msg: LiveMessage) => void;
export type LiveStatus = 'connecting' | 'open' | 'closed';
export type LiveStatusListener = (status: LiveStatus) => void;

/** Handle returned by `watchMatch`; call `close()` to release interest. */
export interface LiveHandle {
  close(): void;
}

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
const STALL_MS = 60_000; // server pings ~25s; 60s of silence ⇒ dead socket.

function matchKey(league: string, matchId: string): string {
  return `${league}/${matchId}`;
}

class LiveClient {
  private ws: WebSocket | null = null;
  private status: LiveStatus = 'closed';

  private readonly listeners = new Set<LiveListener>();
  private readonly statusListeners = new Set<LiveStatusListener>();
  /** Ref-counted per-match interest, keyed by `league/matchId`. */
  private readonly matches = new Map<string, { league: string; matchId: string; count: number }>();

  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Register a frame listener. Returns an unsubscribe fn. Opens the socket. */
  subscribe(cb: LiveListener): () => void {
    this.listeners.add(cb);
    this.ensureConnection();
    return () => {
      this.listeners.delete(cb);
      this.maybeTeardown();
    };
  }

  /** Observe connection status changes (fires immediately with the current one). */
  onStatus(cb: LiveStatusListener): () => void {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => this.statusListeners.delete(cb);
  }

  isConnected(): boolean {
    return this.status === 'open';
  }

  /**
   * Express interest in one match's live frames (ref-counted). Optionally pass a
   * listener scoped to the lifetime of the handle. `close()` releases both the
   * listener and the interest; the server subscription drops at count 0.
   */
  watchMatch(league: string, matchId: string, cb?: LiveListener): LiveHandle {
    const key = matchKey(league, matchId);
    const entry = this.matches.get(key);
    if (entry) {
      entry.count += 1;
    } else {
      this.matches.set(key, { league, matchId, count: 1 });
      this.send({ action: 'subscribe', league, matchId });
    }

    const off = cb ? this.subscribe(cb) : undefined;
    this.ensureConnection();

    let closed = false;
    return {
      close: () => {
        if (closed) return;
        closed = true;
        off?.();
        const e = this.matches.get(key);
        if (!e) return;
        e.count -= 1;
        if (e.count <= 0) {
          this.matches.delete(key);
          this.send({ action: 'unsubscribe', league, matchId });
          this.maybeTeardown();
        }
      },
    };
  }

  /**
   * Watch every match in `refs` (a league's live fixtures). The backend WS only
   * supports per-match subscriptions, so a "league" subscription is expressed as
   * the set of its match ids; caller supplies them. Returns one handle.
   */
  watchMatches(
    refs: { league: string; matchId: string }[],
    cb?: LiveListener,
  ): LiveHandle {
    const off = cb ? this.subscribe(cb) : undefined;
    const handles = refs.map((r) => this.watchMatch(r.league, r.matchId));
    let closed = false;
    return {
      close: () => {
        if (closed) return;
        closed = true;
        off?.();
        for (const h of handles) h.close();
      },
    };
  }

  // ── Connection lifecycle ─────────────────────────────────────────────────────

  private hasInterest(): boolean {
    return this.listeners.size > 0 || this.matches.size > 0;
  }

  private ensureConnection(): void {
    if (!this.hasInterest()) return;
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return; // CONNECTING | OPEN
    this.open();
  }

  private open(): void {
    this.clearReconnect();
    this.setStatus('connecting');

    let ws: WebSocket;
    try {
      ws = new WebSocket(`${WS_BASE}${LIVE_WS_PATH}`);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.setStatus('open');
      // Re-express all live interest on the fresh socket.
      for (const { league, matchId } of this.matches.values()) {
        this.rawSend(ws, { action: 'subscribe', league, matchId });
      }
      this.armStall();
    };

    ws.onmessage = (ev) => {
      this.armStall();
      let msg: LiveMessage;
      try {
        msg = JSON.parse(String(ev.data)) as LiveMessage;
      } catch {
        return;
      }
      if (!msg || typeof (msg as { type?: unknown }).type !== 'string') return;
      for (const cb of [...this.listeners]) {
        try {
          cb(msg);
        } catch {
          // a listener throwing must not kill the socket or sibling listeners
        }
      }
    };

    ws.onerror = () => {
      // `onclose` follows and drives the reconnect; nothing to do here.
    };

    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      this.clearStall();
      this.setStatus('closed');
      if (this.hasInterest()) this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.hasInterest()) return;
    const backoff = Math.min(
      RECONNECT_MAX_MS,
      RECONNECT_BASE_MS * 2 ** this.reconnectAttempts,
    );
    const delay = backoff / 2 + Math.random() * (backoff / 2); // 50–100% jitter
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureConnection();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private armStall(): void {
    this.clearStall();
    this.stallTimer = setTimeout(() => {
      // No frame for STALL_MS ⇒ assume the socket is dead and cycle it.
      try {
        this.ws?.close();
      } catch {
        // ignore
      }
    }, STALL_MS);
  }

  private clearStall(): void {
    if (this.stallTimer) {
      clearTimeout(this.stallTimer);
      this.stallTimer = null;
    }
  }

  private maybeTeardown(): void {
    if (this.hasInterest()) return;
    this.clearReconnect();
    this.clearStall();
    this.reconnectAttempts = 0;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
    this.setStatus('closed');
  }

  private send(frame: LiveSubscribe): void {
    const ws = this.ws;
    if (ws && ws.readyState === 1) this.rawSend(ws, frame);
    // If not open yet, `onopen` replays every entry in `this.matches`.
  }

  private rawSend(ws: WebSocket, frame: LiveSubscribe): void {
    try {
      ws.send(JSON.stringify(frame));
    } catch {
      // ignore transient send failures; reconnect will re-subscribe
    }
  }

  private setStatus(status: LiveStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const cb of [...this.statusListeners]) {
      try {
        cb(status);
      } catch {
        // ignore
      }
    }
  }
}

/** Process-wide live client. Import and share this singleton. */
export const liveClient = new LiveClient();

/** Convenience: register a global frame listener. Returns unsubscribe. */
export function subscribeLive(cb: LiveListener): () => void {
  return liveClient.subscribe(cb);
}

/** Convenience: watch a single match's live frames. */
export function watchMatch(
  league: string,
  matchId: string,
  cb?: LiveListener,
): LiveHandle {
  return liveClient.watchMatch(league, matchId, cb);
}
