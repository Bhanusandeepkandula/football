import type {
  LiveContentState,
  LiveContentStateMessage,
  LiveEvent,
  LiveMessage,
  LiveScoreUpdate,
  MatchStatus,
} from '../contract/schema.js';
import { log } from '../lib/log.js';

/*
 * ── Live hub ─────────────────────────────────────────────────────────────────
 *
 * One process-wide fan-out point shared by every live consumer:
 *   • the poller (src/live/poller.ts)  — the single upstream producer; it writes
 *     normalized state + broadcasts LiveMessage frames here.
 *   • the SSE route (src/live/sse.ts)  — one subscriber per HTTP connection.
 *   • the WS server (src/live/ws.ts)   — one subscriber per socket.
 *   • the push worker (src/push/*)     — reads snapshots + pins matches to keep
 *     them polled even with no live subscriber.
 *
 * The hub owns TWO things:
 *   1. Subscription routing — a subscriber expresses interest per matchId and/or
 *      per league; a broadcast frame is delivered to everyone interested in that
 *      match OR its league.
 *   2. Per-match state cache — the latest normalized snapshot for every tracked
 *      match, used for the connect-time `state` frame and by the push worker.
 *
 * "Single-flight" lives in the poller: the hub only tells it WHICH matches /
 * leagues currently have interest (subscribers or pins); the poller polls each
 * upstream once and feeds the result back through `broadcast`.
 */

const logger = log('live-hub');

/** Server → client delivery callback (one per SSE/WS connection). */
export type Deliver = (msg: LiveMessage) => void;

/** Any broadcastable (match-scoped) frame — hello/ping are per-connection. */
export type BroadcastMessage =
  | LiveScoreUpdate
  | LiveEvent
  | LiveContentStateMessage;

/** The latest normalized snapshot the poller materializes for one match. */
export interface MatchLiveState {
  league: string;
  matchId: string;
  key: string;
  /** ISO 8601 kickoff. */
  date: string;
  startAtSec: number;
  homeAbbr: string;
  awayAbbr: string;
  homeColor: string;
  awayColor: string;
  homeScore: string;
  awayScore: string;
  homeShootout?: number;
  awayShootout?: number;
  status: MatchStatus;
  content: LiveContentState;
  /** Latest key-moment label carried in the content-state, e.g. "⚽ Messi". */
  lastEventText: string;
  finished: boolean;
  /** ESPN keyEvent ids already emitted — the idempotency guard for LiveEvent. */
  seenEventIds: Set<string>;
  /** ISO 8601 timestamp of the last materialization. */
  updatedAt: string;
}

export function matchKey(league: string, matchId: string): string {
  return `${league}/${matchId}`;
}

function splitKey(key: string): { league: string; matchId: string } {
  const i = key.lastIndexOf('/');
  return { league: key.slice(0, i), matchId: key.slice(i + 1) };
}

/** A single connection's live interest. Returned by `hub.subscribe`. */
export interface Subscription {
  /** Register interest in one match; returns its current snapshot if cached. */
  addMatch(league: string, matchId: string): MatchLiveState | undefined;
  removeMatch(league: string, matchId: string): void;
  /** Register interest in every (live) match of a whole league. */
  addLeague(league: string): void;
  removeLeague(league: string): void;
  /** Drop all interest (call on disconnect). */
  close(): void;
}

class LiveHub {
  /** matchKey → connections interested in that specific match. */
  private readonly matchSubs = new Map<string, Set<Deliver>>();
  /** league slug → connections interested in the whole league. */
  private readonly leagueSubs = new Map<string, Set<Deliver>>();
  /** matchKey → external pin refcount (push worker) keeping it polled. */
  private readonly pins = new Map<string, number>();
  /** matchKey → latest materialized snapshot. */
  private readonly states = new Map<string, MatchLiveState>();
  /** Listeners notified (coalesced) whenever the tracked/watched set changes. */
  private readonly changeCbs = new Set<() => void>();
  private changeScheduled = false;

  // ── Subscriptions ──────────────────────────────────────────────────────────

  subscribe(deliver: Deliver): Subscription {
    const keys = new Set<string>();
    const leagues = new Set<string>();
    const hub = this;
    return {
      addMatch(league, matchId) {
        const key = matchKey(league, matchId);
        if (!keys.has(key)) {
          keys.add(key);
          hub.attachMatch(key, deliver);
        }
        return hub.states.get(key);
      },
      removeMatch(league, matchId) {
        const key = matchKey(league, matchId);
        if (keys.delete(key)) hub.detachMatch(key, deliver);
      },
      addLeague(league) {
        if (!leagues.has(league)) {
          leagues.add(league);
          hub.attachLeague(league, deliver);
        }
      },
      removeLeague(league) {
        if (leagues.delete(league)) hub.detachLeague(league, deliver);
      },
      close() {
        for (const key of keys) hub.detachMatch(key, deliver);
        keys.clear();
        for (const league of leagues) hub.detachLeague(league, deliver);
        leagues.clear();
      },
    };
  }

  private attachMatch(key: string, deliver: Deliver): void {
    let set = this.matchSubs.get(key);
    if (!set) {
      set = new Set();
      this.matchSubs.set(key, set);
    }
    const wasTracked = set.size > 0 || (this.pins.get(key) ?? 0) > 0;
    set.add(deliver);
    if (!wasTracked) this.scheduleChange();
  }

  private detachMatch(key: string, deliver: Deliver): void {
    const set = this.matchSubs.get(key);
    if (!set) return;
    set.delete(deliver);
    if (set.size === 0) {
      this.matchSubs.delete(key);
      if ((this.pins.get(key) ?? 0) === 0) this.scheduleChange();
    }
  }

  private attachLeague(league: string, deliver: Deliver): void {
    let set = this.leagueSubs.get(league);
    if (!set) {
      set = new Set();
      this.leagueSubs.set(league, set);
    }
    const wasWatched = set.size > 0;
    set.add(deliver);
    if (!wasWatched) this.scheduleChange();
  }

  private detachLeague(league: string, deliver: Deliver): void {
    const set = this.leagueSubs.get(league);
    if (!set) return;
    set.delete(deliver);
    if (set.size === 0) {
      this.leagueSubs.delete(league);
      this.scheduleChange();
    }
  }

  // ── Push pins (keep a match polled without a live subscriber) ────────────────

  pin(league: string, matchId: string): void {
    const key = matchKey(league, matchId);
    const next = (this.pins.get(key) ?? 0) + 1;
    this.pins.set(key, next);
    if (next === 1 && !(this.matchSubs.get(key)?.size)) this.scheduleChange();
  }

  unpin(league: string, matchId: string): void {
    const key = matchKey(league, matchId);
    const cur = this.pins.get(key) ?? 0;
    if (cur <= 0) return;
    if (cur === 1) {
      this.pins.delete(key);
      if (!(this.matchSubs.get(key)?.size)) this.scheduleChange();
    } else {
      this.pins.set(key, cur - 1);
    }
  }

  /** True while a match has a direct subscriber or a push pin. */
  isDirectlyTracked(key: string): boolean {
    return (this.matchSubs.get(key)?.size ?? 0) > 0 || (this.pins.get(key) ?? 0) > 0;
  }

  // ── What the poller should be polling right now ──────────────────────────────

  trackedMatches(): { league: string; matchId: string; key: string }[] {
    const keys = new Set<string>();
    for (const [key, set] of this.matchSubs) if (set.size > 0) keys.add(key);
    for (const [key, n] of this.pins) if (n > 0) keys.add(key);
    return [...keys].map((key) => ({ key, ...splitKey(key) }));
  }

  watchedLeagues(): string[] {
    const out: string[] = [];
    for (const [league, set] of this.leagueSubs) if (set.size > 0) out.push(league);
    return out;
  }

  onChange(cb: () => void): () => void {
    this.changeCbs.add(cb);
    return () => this.changeCbs.delete(cb);
  }

  private scheduleChange(): void {
    if (this.changeScheduled) return;
    this.changeScheduled = true;
    queueMicrotask(() => {
      this.changeScheduled = false;
      for (const cb of this.changeCbs) {
        try {
          cb();
        } catch (err) {
          logger.error({ err }, 'onChange listener threw');
        }
      }
    });
  }

  // ── State cache (written by the poller, read on connect / by push) ───────────

  setState(state: MatchLiveState): void {
    this.states.set(state.key, state);
  }

  getState(league: string, matchId: string): MatchLiveState | undefined {
    return this.states.get(matchKey(league, matchId));
  }

  getStateByKey(key: string): MatchLiveState | undefined {
    return this.states.get(key);
  }

  deleteState(key: string): void {
    this.states.delete(key);
  }

  /** Connect-time `state` frame for one match, if we have a snapshot. */
  stateMessage(league: string, matchId: string): LiveContentStateMessage | undefined {
    const st = this.states.get(matchKey(league, matchId));
    return st ? toStateMessage(st) : undefined;
  }

  /** Connect-time `state` frames for every currently-live match in a league. */
  statesForLeague(league: string): LiveContentStateMessage[] {
    const out: LiveContentStateMessage[] = [];
    for (const st of this.states.values()) {
      if (st.league === league && st.status.isLive) out.push(toStateMessage(st));
    }
    return out;
  }

  // ── Fan-out (called by the poller for every produced frame) ──────────────────

  broadcast(msg: BroadcastMessage): void {
    const key = matchKey(msg.league, msg.matchId);
    const direct = this.matchSubs.get(key);
    if (direct) for (const d of direct) safeDeliver(d, msg);
    const league = this.leagueSubs.get(msg.league);
    if (league) for (const d of league) safeDeliver(d, msg);
  }
}

function toStateMessage(st: MatchLiveState): LiveContentStateMessage {
  return {
    type: 'state',
    matchId: st.matchId,
    league: st.league,
    state: st.content,
    updatedAt: st.updatedAt,
  };
}

function safeDeliver(deliver: Deliver, msg: LiveMessage): void {
  try {
    deliver(msg);
  } catch (err) {
    logger.error({ err, type: msg.type }, 'deliver failed');
  }
}

/** The single shared hub instance. */
export const hub = new LiveHub();
export type { LiveHub };
