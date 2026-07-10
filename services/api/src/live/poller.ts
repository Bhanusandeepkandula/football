import { inflateRawSync, inflateSync } from 'node:zlib';
import { z } from 'zod';
import { WebSocket as WsClient, type RawData } from 'ws';

import { env } from '../config/env.js';
import { log } from '../lib/log.js';
import {
  LiveContentStateMessageSchema,
  LiveEventSchema,
  LiveScoreUpdateSchema,
  MatchEventSchema,
  type LiveContentState,
  type MatchEvent,
  type MatchEventType,
  type MatchStatus,
} from '../contract/schema.js';
import { hub, matchKey, type MatchLiveState } from './hub.js';

/*
 * ── Live poller (single upstream, feeds the hub) ─────────────────────────────
 *
 * One loop per interested target — never one per subscriber — so 500 fans on a
 * match cost exactly one upstream poll. The hub tells us which matches (direct
 * subscribers + push pins) and which leagues (whole-league subscribers) have
 * interest; we materialize each once and push LiveScoreUpdate / LiveEvent /
 * LiveContentStateMessage frames back through `hub.broadcast`.
 *
 * Two upstreams per match, mirroring the app:
 *   • REST (source of truth): the ESPN summary endpoint every env.POLL_MS. Score
 *     / status diffs → `score` + `state`; new keyEvents (deduped by ESPN id) →
 *     `event`. A mis-read can never corrupt the client — we only diff & re-emit.
 *   • Fastcast (accelerator): ESPN's push WebSocket. A significant delta just
 *     triggers an immediate REST refetch for that match, so goals surface in ~1s
 *     instead of waiting out the poll interval.
 *
 * Whole-league subscribers are served from the league scoreboard (one request
 * per league per tick): score/status only, no per-event detail.
 */

const logger = log('live-poller');

const UA = 'Mozilla/5.0 (compatible; MatchCenterBot/1.0)';
const FASTCAST_ORIGIN = 'https://www.espn.com';
const FETCH_TIMEOUT_MS = 10_000;
const FASTCAST_DEBOUNCE_MS = 1_200;

// ── ESPN upstream shapes (loose — validate then normalize) ───────────────────

const EspnTeamSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    abbreviation: z.string().optional(),
    displayName: z.string().optional(),
    shortDisplayName: z.string().optional(),
    name: z.string().optional(),
    color: z.string().optional(),
    alternateColor: z.string().optional(),
  })
  .passthrough();

const EspnCompetitorSchema = z
  .object({
    homeAway: z.string().optional(),
    team: EspnTeamSchema.optional(),
    score: z.union([z.string(), z.number()]).optional(),
    shootoutScore: z.number().optional(),
    winner: z.boolean().optional(),
  })
  .passthrough();

const EspnStatusTypeSchema = z
  .object({
    name: z.string().optional(),
    state: z.string().optional(),
    completed: z.boolean().optional(),
    detail: z.string().optional(),
    shortDetail: z.string().optional(),
    description: z.string().optional(),
  })
  .passthrough();

const EspnStatusSchema = z
  .object({
    clock: z.number().optional(),
    displayClock: z.string().optional(),
    period: z.number().optional(),
    type: EspnStatusTypeSchema.optional(),
  })
  .passthrough();

const EspnCompetitionSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    date: z.string().optional(),
    status: EspnStatusSchema.optional(),
    competitors: z.array(EspnCompetitorSchema).optional(),
  })
  .passthrough();

const EspnEventSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    date: z.string().optional(),
    status: EspnStatusSchema.optional(),
    competitions: z.array(EspnCompetitionSchema).optional(),
  })
  .passthrough();

const EspnScoreboardSchema = z
  .object({ events: z.array(EspnEventSchema).optional() })
  .passthrough();

const EspnKeyEventSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    type: z
      .object({ text: z.string().optional(), type: z.string().optional() })
      .passthrough()
      .optional(),
    text: z.string().optional(),
    shortText: z.string().optional(),
    scoringPlay: z.boolean().optional(),
    clock: z.object({ displayValue: z.string().optional() }).passthrough().optional(),
    period: z.object({ number: z.number().optional() }).passthrough().optional(),
    team: z.object({ id: z.union([z.string(), z.number()]).optional() }).passthrough().optional(),
    participants: z
      .array(
        z
          .object({
            athlete: z.object({ displayName: z.string().optional() }).passthrough().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const EspnSummarySchema = z
  .object({
    header: z
      .object({ competitions: z.array(EspnCompetitionSchema).optional() })
      .passthrough()
      .optional(),
    competitions: z.array(EspnCompetitionSchema).optional(),
    keyEvents: z.array(EspnKeyEventSchema).optional(),
  })
  .passthrough();

const HandshakeSchema = z
  .object({
    ip: z.string().optional(),
    securePort: z.union([z.number(), z.string()]).optional(),
    token: z.string().optional(),
  })
  .passthrough();

type EspnCompetition = z.infer<typeof EspnCompetitionSchema>;
type EspnStatus = z.infer<typeof EspnStatusSchema>;
type EspnKeyEvent = z.infer<typeof EspnKeyEventSchema>;

// ── Status normalization (mirrors the app's useWorldCup / useMatchDetail) ─────

const LIVE_STATUSES = new Set([
  'STATUS_IN_PROGRESS',
  'STATUS_HALFTIME',
  'STATUS_END_PERIOD',
  'STATUS_OVERTIME',
  'STATUS_SHOOTOUT',
  'STATUS_FIRST_HALF',
  'STATUS_SECOND_HALF',
  'STATUS_EXTRA_TIME',
  'STATUS_EXTRA_TIME_HALFTIME',
]);

// Live but the ball is NOT in play — the on-device clock freezes for these.
const PAUSED_STATUSES = new Set([
  'STATUS_HALFTIME',
  'STATUS_END_PERIOD',
  'STATUS_END_OF_PERIOD',
  'STATUS_EXTRA_TIME_HALFTIME',
  'STATUS_SHOOTOUT',
  'STATUS_FINAL_PEN',
]);

const DEFAULT_TYPE_LABEL: Record<MatchEventType, string> = {
  goal: 'Goal',
  'yellow-card': 'Yellow Card',
  'red-card': 'Red Card',
  substitution: 'Substitution',
  foul: 'Foul',
  var: 'VAR',
  other: 'Event',
};

function str(v: string | number | undefined | null, fb = ''): string {
  return v === undefined || v === null ? fb : String(v);
}

function toInt(s: string): number {
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

function normColor(c?: string): string {
  const t = (c ?? '').trim();
  if (!t) return '';
  if (t.startsWith('#')) return t;
  if (/^[0-9a-fA-F]{6}$/.test(t) || /^[0-9a-fA-F]{3}$/.test(t)) return `#${t}`;
  return t;
}

function withApos(clock: string): string {
  const t = clock.trim();
  if (!t) return '';
  return t.endsWith("'") ? t : `${t}'`;
}

function statusDetail(
  name: string,
  displayClock: string,
  shortDetail: string,
  isLive: boolean,
  isFinished: boolean,
): string {
  if (name === 'STATUS_HALFTIME') return 'HT';
  if (name === 'STATUS_EXTRA_TIME_HALFTIME') return 'ET HT';
  if (name === 'STATUS_SHOOTOUT' || name === 'STATUS_FINAL_PEN') return 'PENS';
  if (isLive) return displayClock ? withApos(displayClock) : shortDetail || 'LIVE';
  if (isFinished) return 'FT';
  return shortDetail || '';
}

function normalizeStatus(s?: EspnStatus): MatchStatus {
  const type = s?.type ?? {};
  const name = type.name ?? '';
  const completed = type.completed === true;
  const displayClock = s?.displayClock ?? '';
  const isLiveName = LIVE_STATUSES.has(name);

  const raw = type.state;
  let state: 'pre' | 'in' | 'post';
  if (raw === 'pre' || raw === 'in' || raw === 'post') state = raw;
  else if (completed) state = 'post';
  else if (isLiveName) state = 'in';
  else state = 'pre';

  const isFinished = completed || state === 'post';
  const isLive = !isFinished && (state === 'in' || isLiveName);
  const clockRunning = isLive && !PAUSED_STATUSES.has(name);

  return {
    state,
    name: name || undefined,
    detail: statusDetail(name, displayClock, type.shortDetail ?? '', isLive, isFinished),
    clock: isLive && displayClock ? withApos(displayClock) : undefined,
    period: typeof s?.period === 'number' ? s.period : undefined,
    isLive,
    isFinished,
    clockRunning,
  };
}

function buildState(
  league: string,
  matchId: string,
  comp: EspnCompetition,
  prev: MatchLiveState | undefined,
): MatchLiveState {
  const competitors = comp.competitors ?? [];
  const home = competitors.find((c) => c.homeAway === 'home') ?? competitors[0];
  const away = competitors.find((c) => c.homeAway === 'away') ?? competitors[1];
  const status = normalizeStatus(comp.status);

  const date = comp.date ?? prev?.date ?? new Date().toISOString();
  const startAtSec = Math.floor((Date.parse(date) || Date.now()) / 1000);

  const homeAbbr = str(home?.team?.abbreviation) || str(home?.team?.shortDisplayName) || 'HOME';
  const awayAbbr = str(away?.team?.abbreviation) || str(away?.team?.shortDisplayName) || 'AWAY';
  const homeColor = normColor(home?.team?.color);
  const awayColor = normColor(away?.team?.color);
  const homeScore = str(home?.score, '0') || '0';
  const awayScore = str(away?.score, '0') || '0';
  const homeShootout = typeof home?.shootoutScore === 'number' ? home.shootoutScore : undefined;
  const awayShootout = typeof away?.shootoutScore === 'number' ? away.shootoutScore : undefined;

  const lastEventText = prev?.lastEventText ?? '';
  const content: LiveContentState = {
    homeAbbr,
    awayAbbr,
    homeScore: toInt(homeScore),
    awayScore: toInt(awayScore),
    status: status.detail || (status.isFinished ? 'FT' : status.isLive ? 'LIVE' : ''),
    isLive: status.isLive,
    homeColor,
    awayColor,
    lastEvent: lastEventText,
    startAt: startAtSec,
    paused: status.isLive ? !status.clockRunning : false,
  };

  return {
    league,
    matchId,
    key: matchKey(league, matchId),
    date,
    startAtSec,
    homeAbbr,
    awayAbbr,
    homeColor,
    awayColor,
    homeScore,
    awayScore,
    homeShootout,
    awayShootout,
    status,
    content,
    lastEventText,
    finished: status.isFinished,
    // Carry the dedup set forward so a keyEvent is never re-announced.
    seenEventIds: prev?.seenEventIds ?? new Set<string>(),
    updatedAt: new Date().toISOString(),
  };
}

// ── Key-event parsing ─────────────────────────────────────────────────────────

function parseEventType(text: string, typeText?: string): MatchEventType {
  const t = `${text} ${typeText ?? ''}`.toLowerCase();
  if (t.includes('goal') || t.includes('score')) return 'goal';
  if (t.includes('red card') || t.includes('second yellow')) return 'red-card';
  if (t.includes('yellow card') || t.includes('booking')) return 'yellow-card';
  if (t.includes('substitut') || t.includes('sub ') || t.includes('replaced')) return 'substitution';
  if (t.includes('foul')) return 'foul';
  if (t.includes('var')) return 'var';
  return 'other';
}

/** LiveEvent is only emitted for the "key moments" fans get pinged for. */
function isKeyMoment(type: MatchEventType): boolean {
  return (
    type === 'goal' ||
    type === 'yellow-card' ||
    type === 'red-card' ||
    type === 'substitution' ||
    type === 'var'
  );
}

function eventEmoji(type: MatchEventType, isOwnGoal: boolean, isPenalty: boolean): string {
  if (type === 'goal') return isOwnGoal ? '🥅' : isPenalty ? '🎯' : '⚽';
  if (type === 'yellow-card') return '🟨';
  if (type === 'red-card') return '🟥';
  if (type === 'substitution') return '🔄';
  if (type === 'var') return '📺';
  return '';
}

interface ParsedEvent {
  event: MatchEvent;
  type: MatchEventType;
  lastText: string;
}

function parseKeyEvent(p: EspnKeyEvent, id: string): ParsedEvent {
  const typeText = p.type?.text ?? '';
  const fullText = p.text ?? p.shortText ?? '';
  const type = parseEventType(typeText || fullText, p.type?.type);
  const isOwnGoal = /own goal/i.test(fullText) || /own[-\s]?goal/i.test(typeText);
  const isPenalty = /penalt/i.test(fullText) || /penalt/i.test(typeText);
  const playerName = str(p.participants?.[0]?.athlete?.displayName) || undefined;
  const secondaryName =
    type === 'goal' || type === 'substitution'
      ? str(p.participants?.[1]?.athlete?.displayName) || undefined
      : undefined;
  const typeLabel = isOwnGoal
    ? 'Own Goal'
    : isPenalty && type === 'goal'
      ? 'Penalty'
      : typeText || DEFAULT_TYPE_LABEL[type];

  const event = MatchEventSchema.parse({
    id,
    clock: str(p.clock?.displayValue),
    period: typeof p.period?.number === 'number' ? p.period.number : 1,
    type,
    typeLabel,
    text: p.shortText ?? fullText,
    teamId: str(p.team?.id) || undefined,
    playerName,
    secondaryName,
    isPenalty: isPenalty || undefined,
    isOwnGoal: isOwnGoal || undefined,
  });

  const emoji = eventEmoji(type, isOwnGoal, isPenalty);
  const lastText = `${emoji} ${playerName ?? DEFAULT_TYPE_LABEL[type]}`.trim();
  return { event, type, lastText };
}

/**
 * Walk the (chronological) keyEvents. On the very first materialization we SEED
 * the dedup set without emitting (so a mid-match connect doesn't replay the
 * whole timeline); afterwards only newly-seen key moments are emitted.
 */
function processKeyEvents(
  raw: EspnKeyEvent[],
  state: MatchLiveState,
  emit: boolean,
): { toEmit: MatchEvent[]; lastText: string } {
  const toEmit: MatchEvent[] = [];
  let lastText = state.lastEventText;

  const meaningful = raw.filter((p) => Boolean(p.scoringPlay) || Boolean(p.text || p.shortText));
  meaningful.forEach((p, i) => {
    const id = str(p.id) || `${state.matchId}-ke-${i}`;
    if (state.seenEventIds.has(id)) return;
    state.seenEventIds.add(id);
    try {
      const parsed = parseKeyEvent(p, id);
      if (!isKeyMoment(parsed.type)) return;
      lastText = parsed.lastText;
      if (emit) toEmit.push(parsed.event);
    } catch (err) {
      logger.warn({ err, key: state.key }, 'skipped malformed keyEvent');
    }
  });

  return { toEmit, lastText };
}

// ── Diff + broadcast ──────────────────────────────────────────────────────────

function scoreSig(s: MatchLiveState): string {
  return [
    s.homeScore,
    s.awayScore,
    s.homeShootout ?? '',
    s.awayShootout ?? '',
    s.status.name ?? '',
    s.status.detail,
    s.status.clock ?? '',
    s.status.clockRunning,
  ].join('|');
}

function emitDiffs(
  prev: MatchLiveState | undefined,
  next: MatchLiveState,
  events: MatchEvent[],
): void {
  const now = next.updatedAt;

  for (const event of events) {
    hub.broadcast(
      LiveEventSchema.parse({
        type: 'event',
        matchId: next.matchId,
        league: next.league,
        event,
        updatedAt: now,
      }),
    );
  }

  if (!prev || scoreSig(prev) !== scoreSig(next)) {
    hub.broadcast(
      LiveScoreUpdateSchema.parse({
        type: 'score',
        matchId: next.matchId,
        league: next.league,
        home: { score: next.homeScore, shootoutScore: next.homeShootout },
        away: { score: next.awayScore, shootoutScore: next.awayShootout },
        status: next.status,
        updatedAt: now,
      }),
    );
  }

  if (!prev || JSON.stringify(prev.content) !== JSON.stringify(next.content)) {
    hub.broadcast(
      LiveContentStateMessageSchema.parse({
        type: 'state',
        matchId: next.matchId,
        league: next.league,
        state: next.content,
        updatedAt: now,
      }),
    );
  }
}

// ── HTTP ──────────────────────────────────────────────────────────────────────

async function fetchJson(url: string): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Trackers ───────────────────────────────────────────────────────────────────

interface MatchTarget {
  key: string;
  league: string;
  matchId: string;
}

interface MatchTracker extends MatchTarget {
  fastcast?: FastcastHandle;
  pollInFlight: boolean;
  finished: boolean;
  failures: number;
  debounce?: ReturnType<typeof setTimeout>;
}

interface LeagueTracker {
  league: string;
  pollInFlight: boolean;
  finished: Set<string>;
}

const matchTrackers = new Map<string, MatchTracker>();
const leagueTrackers = new Map<string, LeagueTracker>();

async function pollMatch(t: MatchTarget): Promise<void> {
  const tracker = matchTrackers.get(t.key);
  if (!tracker || tracker.pollInFlight) return;
  tracker.pollInFlight = true;
  try {
    const url = `${env.ESPN_SITE_API}/${t.league}/summary?event=${encodeURIComponent(t.matchId)}`;
    const json = await fetchJson(url);
    if (json == null) {
      tracker.failures += 1;
      return;
    }
    const parsed = EspnSummarySchema.safeParse(json);
    if (!parsed.success) {
      tracker.failures += 1;
      return;
    }
    tracker.failures = 0;
    const comp = parsed.data.header?.competitions?.[0] ?? parsed.data.competitions?.[0];
    if (!comp) return;

    const prev = hub.getStateByKey(t.key);
    const seeding = prev === undefined;
    const next = buildState(t.league, t.matchId, comp, prev);
    const { toEmit, lastText } = processKeyEvents(parsed.data.keyEvents ?? [], next, !seeding);
    if (lastText && lastText !== next.lastEventText) {
      next.lastEventText = lastText;
      next.content = { ...next.content, lastEvent: lastText };
    }
    emitDiffs(prev, next, toEmit);
    hub.setState(next);

    if (next.finished && !tracker.finished) {
      tracker.finished = true;
      closeFastcast(tracker);
    }
  } catch (err) {
    logger.error({ err, key: t.key }, 'pollMatch failed');
    tracker.failures += 1;
  } finally {
    tracker.pollInFlight = false;
  }
}

async function pollLeague(league: string): Promise<void> {
  const lt = leagueTrackers.get(league);
  if (!lt || lt.pollInFlight) return;
  lt.pollInFlight = true;
  try {
    const json = await fetchJson(`${env.ESPN_SITE_API}/${league}/scoreboard`);
    if (json == null) return;
    const parsed = EspnScoreboardSchema.safeParse(json);
    if (!parsed.success) return;

    for (const ev of parsed.data.events ?? []) {
      const matchId = str(ev.id);
      if (!matchId) continue;
      const key = matchKey(league, matchId);
      // A match with its own subscriber/pin is fully handled (incl. events) by
      // pollMatch; its broadcasts already reach league subscribers. Skip here.
      if (hub.isDirectlyTracked(key)) continue;
      if (lt.finished.has(key)) continue;

      const comp = ev.competitions?.[0];
      if (!comp) continue;
      const merged: EspnCompetition = {
        ...comp,
        status: comp.status ?? ev.status,
        date: comp.date ?? ev.date,
      };
      const status = normalizeStatus(merged.status);
      if (!status.isLive && !status.isFinished) continue; // pre-match fixture

      const prev = hub.getStateByKey(key);
      // Don't announce matches that were already over before we started watching.
      if (status.isFinished && !prev) {
        lt.finished.add(key);
        continue;
      }

      const next = buildState(league, matchId, merged, prev);
      emitDiffs(prev, next, []);
      hub.setState(next);

      if (next.finished) {
        lt.finished.add(key);
        hub.deleteState(key); // free finished, unsubscribed match state
      }
    }
  } catch (err) {
    logger.error({ err, league }, 'pollLeague failed');
  } finally {
    lt.pollInFlight = false;
  }
}

// ── Fastcast (accelerator) ─────────────────────────────────────────────────────

interface FastcastHandle {
  close(): void;
}

function rec(o: unknown): Record<string, unknown> | undefined {
  return o && typeof o === 'object' ? (o as Record<string, unknown>) : undefined;
}

function inflateToJson(b64: string): string | null {
  let buf: Buffer;
  try {
    buf = Buffer.from(b64, 'base64');
  } catch {
    return null;
  }
  try {
    return inflateSync(buf).toString('utf8');
  } catch {
    /* try raw */
  }
  try {
    return inflateRawSync(buf).toString('utf8');
  } catch {
    return null;
  }
}

/** A JSON-Patch delta worth an instant refetch (goal / score / status change). */
function isSignificant(patch: unknown[]): boolean {
  for (const raw of patch) {
    const op = rec(raw);
    if (!op) continue;
    const path = typeof op.path === 'string' ? op.path : '';
    const value = rec(op.value);
    if (value?.scoringPlay === true) return true;
    if (op.op === 'replace' && /\/score$/.test(path)) return true;
    if (path.includes('/status/type') || path.includes('/status/period')) return true;
    const slug = rec(value?.type)?.slug;
    if (typeof slug === 'string' && /goal|red-card|penalty/.test(slug)) return true;
  }
  return false;
}

function connectFastcast(
  league: string,
  matchId: string,
  onSignificant: () => void,
): FastcastHandle {
  const topic = `gp-soccer-${league}-${matchId}`;
  let ws: WsClient | null = null;
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let backoff = 1_000;

  const scheduleReconnect = (): void => {
    if (closed) return;
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
    ws = null;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, backoff);
    reconnectTimer.unref?.();
    backoff = Math.min(backoff * 2, 15_000);
  };

  async function connect(): Promise<void> {
    if (closed) return;
    try {
      const res = await fetch(env.ESPN_FASTCAST_HANDSHAKE, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`handshake ${res.status}`);
      const hs = HandshakeSchema.parse(await res.json());
      if (!hs.ip || !hs.securePort || !hs.token) throw new Error('bad handshake');
      const url = `wss://${hs.ip}:${hs.securePort}/FastcastService/pubsub/profiles/12000?TrafficManager-Token=${encodeURIComponent(String(hs.token))}`;
      const socket = new WsClient(url, { origin: FASTCAST_ORIGIN, headers: { 'User-Agent': UA } });
      ws = socket;

      socket.on('open', () => {
        try {
          socket.send(JSON.stringify({ op: 'C' }));
        } catch {
          /* ignore */
        }
      });

      socket.on('message', (data: RawData) => {
        const m = rec(safeJson(data.toString()));
        if (!m) return;
        if (m.op === 'C') {
          backoff = 1_000;
          try {
            socket.send(JSON.stringify({ op: 'S', sid: m.sid, tc: topic }));
          } catch {
            /* ignore */
          }
          return;
        }
        if ((m.op === 'R' || m.op === 'P') && typeof m.pl === 'string' && m.tc === topic) {
          const outer = rec(safeJson(m.pl));
          const innerB64 = outer?.pl;
          if (typeof innerB64 !== 'string') return;
          const json = inflateToJson(innerB64);
          if (!json) return;
          const patch = safeJson(json);
          if (Array.isArray(patch) && isSignificant(patch)) onSignificant();
        }
      });

      socket.on('error', () => {
        /* surfaced via close */
      });
      socket.on('close', () => scheduleReconnect());
    } catch {
      scheduleReconnect();
    }
  }

  void connect();

  return {
    close(): void {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      ws = null;
    },
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function openFastcast(tr: MatchTracker): void {
  if (tr.fastcast || tr.finished) return;
  tr.fastcast = connectFastcast(tr.league, tr.matchId, () => {
    if (tr.finished || tr.debounce) return;
    tr.debounce = setTimeout(() => {
      tr.debounce = undefined;
      if (!tr.finished) void pollMatch(tr);
    }, FASTCAST_DEBOUNCE_MS);
    tr.debounce.unref?.();
  });
}

function closeFastcast(tr: MatchTracker): void {
  tr.fastcast?.close();
  tr.fastcast = undefined;
  if (tr.debounce) {
    clearTimeout(tr.debounce);
    tr.debounce = undefined;
  }
}

// ── Reconcile desired vs. active ────────────────────────────────────────────────

function reconcile(): void {
  const desired = new Map(
    hub.trackedMatches().map((t): [string, MatchTarget] => [t.key, t]),
  );

  for (const [key, tr] of matchTrackers) {
    if (!desired.has(key)) {
      closeFastcast(tr);
      matchTrackers.delete(key);
      hub.deleteState(key); // subscribers hit 0 → free per-match state
    }
  }
  for (const [key, t] of desired) {
    if (!matchTrackers.has(key)) {
      const tr: MatchTracker = { ...t, pollInFlight: false, finished: false, failures: 0 };
      matchTrackers.set(key, tr);
      void pollMatch(tr); // immediate snapshot for the new subscriber
      openFastcast(tr);
    }
  }

  const desiredLeagues = new Set(hub.watchedLeagues());
  for (const league of [...leagueTrackers.keys()]) {
    if (!desiredLeagues.has(league)) leagueTrackers.delete(league);
  }
  for (const league of desiredLeagues) {
    if (!leagueTrackers.has(league)) {
      leagueTrackers.set(league, { league, pollInFlight: false, finished: new Set() });
      void pollLeague(league);
    }
  }
}

function tick(): void {
  for (const tr of matchTrackers.values()) {
    // Finished matches stay cached for late subscribers but are no longer polled.
    if (!tr.finished && !tr.pollInFlight) void pollMatch(tr);
  }
  for (const league of leagueTrackers.keys()) {
    void pollLeague(league);
  }
}

/**
 * Start the single upstream ingestion loop. Returns a stop function that tears
 * down every timer, socket and tracker (called on graceful shutdown).
 */
export function startLivePoller(): () => void {
  const off = hub.onChange(reconcile);
  reconcile(); // pick up anything subscribed before we started
  const interval = setInterval(tick, env.POLL_MS);
  interval.unref?.();
  logger.info({ pollMs: env.POLL_MS }, 'live poller started');

  return () => {
    off();
    clearInterval(interval);
    for (const tr of matchTrackers.values()) closeFastcast(tr);
    matchTrackers.clear();
    leagueTrackers.clear();
    logger.info('live poller stopped');
  };
}
