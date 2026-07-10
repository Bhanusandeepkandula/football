// Polymarket Sports WebSocket — free, no-auth live score push feed.
// Primary instant live layer; ESPN REST fills in stats / play-by-play.
// Docs: https://docs.polymarket.com/market-data/websocket/sports

import {
  applyPolymarketUpdate,
  setPolymarketWsConnected,
} from '@/lib/polymarketLiveStore';
import { matchOrientation } from '@/lib/polymarketMatch';

const WS_URL = 'wss://sports-api.polymarket.com/ws';

const SOCCER_PERIODS = new Set(['1H', '2H', 'HT', 'FT', 'FT OT', 'FT NR']);
const SOCCER_STATUSES = new Set([
  'Scheduled',
  'InProgress',
  'Break',
  'Suspended',
  'PenaltyShootout',
  'Final',
  'Awarded',
  'Postponed',
  'Canceled',
]);

export interface PolymarketSportResult {
  gameId?: number;
  leagueAbbreviation?: string;
  slug?: string;
  homeTeam?: string;
  awayTeam?: string;
  status?: string;
  score?: string;
  period?: string;
  elapsed?: string;
  live?: boolean;
  ended?: boolean;
}

export interface PolymarketMatchRef {
  homeAbbr?: string;
  awayAbbr?: string;
  homeName: string;
  awayName: string;
  /** ISO date from ESPN header. */
  date: string;
}

export interface PolymarketHandle {
  close: () => void;
}

type SportListener = (msg: PolymarketSportResult) => void;

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let backoff = 1000;
let closed = false;
let subscriberCount = 0;
const listeners = new Set<SportListener>();

function slugDate(slug?: string): string | null {
  if (!slug) return null;
  const m = /(\d{4}-\d{2}-\d{2})$/.exec(slug);
  return m ? m[1] : null;
}

function matchDateKeys(iso: string): string[] {
  if (!iso) return [];
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return [];
  const utc = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return utc === local ? [utc] : [utc, local];
}

/** True for soccer / World Cup style sport_result payloads (not esports/NFL). */
export function isSoccerSportResult(msg: PolymarketSportResult): boolean {
  if (msg.status && SOCCER_STATUSES.has(msg.status)) return true;
  if (msg.period && SOCCER_PERIODS.has(msg.period)) return true;
  const league = (msg.leagueAbbreviation ?? '').toLowerCase();
  // Common soccer competition prefixes. This is a fast-path only — the status /
  // period / plain-scoreline heuristics above already catch soccer generically,
  // so a competition missing here still resolves via those.
  if (/^(wc|fifa|world|aec|atc|uefa|mls|epl|ucl|uel|conf|soc|lal|laliga|esp|ita|ser|ger|bun|fra|lig|ned|ere|por|sau|mex|bra|arg|con|copa|euro|nat|fri)/.test(league)) return true;
  if (msg.score && /^\d+-\d+$/.test(msg.score) && !msg.score.includes('|')) return true;
  return false;
}

export function matchesPolymarketEvent(msg: PolymarketSportResult, ref: PolymarketMatchRef): boolean {
  if (!isSoccerSportResult(msg)) return false;
  if (!msg.homeTeam || !msg.awayTeam) return false;

  // Same fixture in either orientation? (null = no match / too ambiguous.)
  if (matchOrientation(msg, ref) === null) return false;

  const slugD = slugDate(msg.slug);
  if (slugD) {
    const keys = matchDateKeys(ref.date);
    if (keys.length > 0 && !keys.includes(slugD)) return false;
  }

  return true;
}

function scheduleReconnect() {
  if (closed || subscriberCount <= 0) return;
  try { ws?.close(); } catch { /* ignore */ }
  ws = null;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, backoff);
  backoff = Math.min(backoff * 2, 15000);
}

function connect() {
  if (closed || subscriberCount <= 0) return;
  try {
    const socket = new WebSocket(WS_URL);
    ws = socket;

    socket.onopen = () => {
      backoff = 1000;
      setPolymarketWsConnected(true);
    };

    socket.onmessage = (ev) => {
      const raw = typeof ev.data === 'string' ? ev.data : String(ev.data);
      if (raw === 'ping') {
        try { socket.send('pong'); } catch { /* ignore */ }
        return;
      }
      let msg: PolymarketSportResult;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;
      for (const listener of listeners) listener(msg);
    };

    socket.onerror = () => { /* onclose handles reconnect */ };
    socket.onclose = () => {
      setPolymarketWsConnected(false);
      scheduleReconnect();
    };
  } catch {
    scheduleReconnect();
  }
}

function ensureConnected() {
  closed = false;
  if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
    connect();
  }
}

function subscribe(listener: SportListener): () => void {
  listeners.add(listener);
  subscriberCount += 1;
  ensureConnected();
  return () => {
    listeners.delete(listener);
    subscriberCount = Math.max(0, subscriberCount - 1);
    if (subscriberCount === 0) {
      closed = true;
      setPolymarketWsConnected(false);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      try { ws?.close(); } catch { /* ignore */ }
      ws = null;
    }
  };
}

/** Hold the shared Polymarket sports socket; fires on every soccer sport_result. */
export function connectPolymarketSports(onMessage: (msg: PolymarketSportResult) => void): PolymarketHandle {
  const wrapped = (msg: PolymarketSportResult) => {
    if (isSoccerSportResult(msg)) onMessage(msg);
  };
  const unsub = subscribe(wrapped);
  return { close: unsub };
}

export interface PolymarketWatchRef extends PolymarketMatchRef {
  /** Optional filter — when set, only matching events fire the callback. */
  filter?: PolymarketMatchRef;
}

type WatchState = {
  key: string;
  last?: { score: string; status: string; period: string; ended: boolean };
};

function stateKey(msg: PolymarketSportResult): string {
  return String(msg.gameId ?? msg.slug ?? `${msg.homeTeam}-${msg.awayTeam}-${msg.score}`);
}

function isSignificant(msg: PolymarketSportResult, prev?: WatchState['last']): boolean {
  const score = msg.score ?? '';
  const status = msg.status ?? '';
  const period = msg.period ?? '';
  const ended = !!msg.ended;
  if (!prev) return msg.live === true || status !== 'Scheduled';
  return prev.score !== score || prev.status !== status || prev.period !== period || prev.ended !== ended;
}

/**
 * Subscribe to Polymarket push for one match (or any soccer event when filter omitted).
 * Fires `onSignificant` when score / status / period changes.
 */
export function watchPolymarketMatch(
  ref: PolymarketMatchRef | undefined,
  onSignificant?: () => void,
): PolymarketHandle {
  const states = new Map<string, WatchState['last']>();

  return connectPolymarketSports((msg) => {
    if (ref && !matchesPolymarketEvent(msg, ref)) return;
    if (ref) applyPolymarketUpdate(msg, ref);
    if (!onSignificant) return;
    const key = stateKey(msg);
    const prev = states.get(key);
    const next = {
      score: msg.score ?? '',
      status: msg.status ?? '',
      period: msg.period ?? '',
      ended: !!msg.ended,
    };
    if (!isSignificant(msg, prev)) return;
    states.set(key, next);
    onSignificant();
  });
}
