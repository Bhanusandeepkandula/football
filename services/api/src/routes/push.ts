// ─── Push endpoints + APNs / Live-Activity worker ────────────────────────────
//
// This module owns two things that share one registry singleton:
//
//   1. `registerPush(app)` — the token-auth HTTP surface the app calls:
//        POST /v1/push/register    { matchId, league, deviceToken?, activityToken?,
//                                    pushToStartToken?, env, prefs? }
//        POST /v1/push/unregister  { matchId?, deviceToken?, activityToken? }
//        POST /v1/push/heartbeat   { deviceToken, matchId? }
//      All three require `Authorization: Bearer <API_TOKEN>` when API_TOKEN is
//      configured (auth is disabled in dev when it's unset). Each mutates the
//      registry and nudges the worker to re-reconcile which matches it tracks.
//
//   2. `startPushWorker()` — the background sender. It rides the SAME live hub the
//      SSE/WS transports use: subscribing to a match makes the poller ingest it
//      (Fastcast accelerator + REST fallback) and materialize state + key events,
//      which arrive here as `LiveMessage` frames. We translate those into APNs:
//        • Live Activity `update` — the LiveContentState as `content-state` (it
//          byte-matches the Swift struct), pushed ONLY on meaningful changes
//          (score / phase / key event) — never per-second, since the widget
//          self-ticks the clock from `startAt`+`paused`.
//        • an `alert` (goal / card / kick-off) rides the update at priority 10;
//          subscription-only devices (no Live Activity) get a standalone banner.
//        • Live Activity `end` at full-time with a final content-state + dismissal.
//      APNs 410/BadDeviceToken → drop the token; 403 ExpiredProviderToken → the
//      apn Provider re-signs its ES256 JWT itself.
//
// server.ts imports `startPushWorker` (via src/push/worker.ts) and calls it only
// when env.pushEnabled; routes/index.ts mounts `registerPush`. See the wiring
// note at the bottom of this file.

import { existsSync, readFileSync } from 'node:fs';
import { createHash, timingSafeEqual } from 'node:crypto';

import type { Context, Hono, Next } from 'hono';
import { Provider, Notification, type ResponseFailure } from '@parse/node-apn';
import type { z } from 'zod';

import { env } from '../config/env.js';
import { log } from '../lib/log.js';
import { hub, matchKey, type MatchLiveState } from '../live/hub.js';
import { createRegistry, type Registry } from '../push/registry.js';
import {
  HeartbeatSchema,
  RegisterPushSchema,
  UnregisterPushSchema,
  type LiveContentState,
  type LiveMessage,
  type MatchEvent,
  type MatchEventType,
  type PushEnv,
  type PushPrefs,
} from '../contract/schema.js';

// ── Shared registry singleton (lazily opened) ────────────────────────────────

let registrySingleton: Registry | null = null;
function registry(): Registry {
  if (!registrySingleton) registrySingleton = createRegistry();
  return registrySingleton;
}

/** Set by a running worker so the routes can trigger a re-reconcile on writes. */
let coordinatorNotify: (() => void) | null = null;
function notifyChanged(): void {
  coordinatorNotify?.();
}

// ── HTTP surface ──────────────────────────────────────────────────────────────

function safeEqual(a: string, b: string): boolean {
  // Constant-time compare over fixed-length hashes (avoids length leaks).
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

const requireAuth = async (c: Context, next: Next): Promise<Response | void> => {
  const expected = env.API_TOKEN;
  if (!expected) {
    await next(); // dev: auth disabled when no shared secret is configured
    return;
  }
  const header = c.req.header('Authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m || !safeEqual(m[1].trim(), expected)) {
    return c.json(
      { error: { code: 'unauthorized', message: 'Missing or invalid API token' } },
      401,
    );
  }
  await next();
};

type ParseResult<T> = { ok: true; data: T } | { ok: false; res: Response };

async function parseBody<S extends z.ZodTypeAny>(
  c: Context,
  schema: S,
): Promise<ParseResult<z.infer<S>>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return {
      ok: false,
      res: c.json({ error: { code: 'bad_request', message: 'Invalid JSON body' } }, 400),
    };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      res: c.json(
        { error: { code: 'bad_request', message: 'Invalid request body', details: parsed.error.issues } },
        400,
      ),
    };
  }
  return { ok: true, data: parsed.data };
}

/**
 * Mount the push endpoints on the shared Hono app. Called by registerRoutes()
 * (routes/index.ts). Works even when push is disabled — the tokens are simply
 * recorded and no APNs traffic is sent until the worker runs.
 */
export function registerPush(app: Hono): void {
  app.post('/v1/push/register', requireAuth, async (c) => {
    const parsed = await parseBody(c, RegisterPushSchema);
    if (!parsed.ok) return parsed.res;
    const input = parsed.data;
    if (!input.deviceToken && !input.activityToken) {
      return c.json(
        { error: { code: 'bad_request', message: 'deviceToken or activityToken is required' } },
        400,
      );
    }
    const reg = registry();
    reg.register(input);
    notifyChanged();
    return c.json({ ok: true, backend: reg.backend });
  });

  app.post('/v1/push/unregister', requireAuth, async (c) => {
    const parsed = await parseBody(c, UnregisterPushSchema);
    if (!parsed.ok) return parsed.res;
    const input = parsed.data;
    if (!input.deviceToken && !input.activityToken && !input.matchId) {
      return c.json(
        { error: { code: 'bad_request', message: 'Provide matchId, deviceToken or activityToken' } },
        400,
      );
    }
    registry().unregister(input);
    notifyChanged();
    return c.json({ ok: true });
  });

  app.post('/v1/push/heartbeat', requireAuth, async (c) => {
    const parsed = await parseBody(c, HeartbeatSchema);
    if (!parsed.ok) return parsed.res;
    registry().heartbeat(parsed.data.deviceToken, parsed.data.matchId);
    return c.json({ ok: true });
  });

  log('push').info('push endpoints mounted under /v1/push');
}

// ── APNs payload shapes (typed; sent as-is via Notification.rawPayload) ────────

interface ApsAlert {
  title: string;
  body: string;
}
interface LiveActivityAps {
  timestamp: number;
  event: 'update' | 'end';
  'content-state': LiveContentState;
  'stale-date'?: number;
  'dismissal-date'?: number;
  alert?: ApsAlert;
}
interface BannerAps {
  alert: ApsAlert;
  sound: string;
  'thread-id': string;
}

// ── Worker tuning ──────────────────────────────────────────────────────────────

const STALE_SECONDS = 900; // island shows "out of date" if we go silent this long
const KEEPALIVE_MS = 8 * 60_000; // refresh a live activity at least this often
const DISMISS_SECONDS = 3600; // auto-dismiss ~1h after full-time
const EXPIRY_SECONDS = 3600; // APNs stops retrying after this
const RECONCILE_MS = 30_000; // safety re-sync of the tracked-match set
const PRUNE_MS = 60 * 60_000; // stale-device sweep cadence
const DEVICE_TTL_MS = 3 * 24 * 60 * 60_000; // drop devices silent > 3 days
const ENDED_GUARD_MS = 5 * 60_000; // ignore late frames this long after an end

// ── Alert copy ─────────────────────────────────────────────────────────────────

function alertAllowed(prefs: PushPrefs | undefined, type: MatchEventType): boolean {
  if (type === 'goal') return prefs?.goals ?? true;
  if (type === 'yellow-card' || type === 'red-card') return prefs?.cards ?? true;
  return false; // subs / VAR / fouls update the content-state but don't banner
}

function scoreLine(s: LiveContentState): string {
  return `${s.homeAbbr} ${s.homeScore}-${s.awayScore} ${s.awayAbbr}`;
}

function buildEventAlert(event: MatchEvent, s: LiveContentState | undefined): ApsAlert | null {
  const line = s ? scoreLine(s) : '';
  const who = event.playerName || event.typeLabel || 'Update';
  const clk = event.clock ? ` ${event.clock}` : '';
  if (event.type === 'goal') {
    return { title: '⚽ GOAL', body: `${who}${clk}${line ? ` — ${line}` : ''}`.trim() };
  }
  if (event.type === 'red-card') {
    return { title: '🟥 Red Card', body: `${who}${clk}`.trim() };
  }
  if (event.type === 'yellow-card') {
    return { title: '🟨 Yellow Card', body: `${who}${clk}`.trim() };
  }
  return null;
}

function kickoffAlert(s: LiveContentState): ApsAlert {
  return { title: '🟢 Kick-off', body: `${s.homeAbbr} v ${s.awayAbbr}` };
}
function fulltimeAlert(s: LiveContentState): ApsAlert {
  return { title: '⏱️ Full-Time', body: scoreLine(s) };
}

function pushSignature(s: LiveContentState): string {
  // Intentionally EXCLUDES the running-clock text — the widget renders that
  // locally, so a ticking minute must not trigger a push.
  return [s.homeScore, s.awayScore, s.isLive, s.paused, s.lastEvent].join('|');
}

// ── Misc helpers ───────────────────────────────────────────────────────────────

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
function maskToken(t: string): string {
  return t.length <= 10 ? '***' : `${t.slice(0, 6)}…${t.slice(-4)}`;
}
function splitKey(key: string): { league: string; matchId: string } {
  const i = key.lastIndexOf('/');
  return { league: key.slice(0, i), matchId: key.slice(i + 1) };
}
function loadApnsKey(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes('BEGIN')) {
    // PEM pasted inline; env files often escape the newlines.
    return trimmed.includes('\\n') ? trimmed.replace(/\\n/g, '\n') : trimmed;
  }
  try {
    if (existsSync(trimmed)) return readFileSync(trimmed, 'utf8');
  } catch {
    /* fall through */
  }
  return trimmed;
}

// ── Worker ──────────────────────────────────────────────────────────────────────

/**
 * Start the APNs / Live-Activity push worker; returns a stop function.
 * server.ts only calls this when env.pushEnabled, so APNS_KEY_P8 / APNS_KEY_ID /
 * APNS_TEAM_ID are guaranteed present.
 */
export function startPushWorker(): () => void {
  const workerLog = log('push-worker');
  const reg = registry();

  const apnsKey = loadApnsKey(env.APNS_KEY_P8 ?? '');
  const keyId = env.APNS_KEY_ID ?? '';
  const teamId = env.APNS_TEAM_ID ?? '';
  const liveActivityTopic = `${env.APNS_BUNDLE_ID}.push-type.liveactivity`;
  const bannerTopic = env.APNS_BUNDLE_ID;

  // One Provider per APNs environment (each token carries its own env).
  const providers = new Map<PushEnv, Provider>();
  function providerFor(e: PushEnv): Provider {
    let p = providers.get(e);
    if (p) return p;
    p = new Provider({ token: { key: apnsKey, keyId, teamId }, production: e === 'production' });
    p.on('error', (err: unknown) => workerLog.error({ err: errMsg(err) }, 'apns provider error'));
    providers.set(e, p);
    return p;
  }

  async function sendTo(e: PushEnv, note: Notification, token: string): Promise<void> {
    try {
      const res = await providerFor(e).send(note, token);
      for (const f of res.failed) handleFailure(f);
    } catch (err) {
      workerLog.error({ err: errMsg(err), token: maskToken(token) }, 'apns send threw');
    }
  }

  function handleFailure(f: ResponseFailure): void {
    const reason = f.response?.reason ?? '';
    const status = f.status;
    if (status === 410 || status === 400 || reason === 'Unregistered' || reason === 'BadDeviceToken') {
      reg.removeByToken(f.device);
      notifyChanged();
      workerLog.info({ token: maskToken(f.device), status, reason }, 'dropped dead push token');
      return;
    }
    // 403 ExpiredProviderToken → the Provider re-signs its JWT itself; 429 →
    // back-pressure. Nothing to clean up; just record it.
    workerLog.warn({ token: maskToken(f.device), status, reason }, 'apns push failed');
  }

  // Per-match worker state.
  const tracked = new Set<string>(); // hub-subscribed match keys
  const pendingEvent = new Map<string, MatchEvent>(); // event awaiting the next state push
  const lastSig = new Map<string, string>(); // last pushed content signature
  const lastPushAt = new Map<string, number>(); // last push time (keepalive)
  const prevLive = new Map<string, boolean>(); // for kick-off detection
  const ended = new Set<string>(); // guard against late frames post-end

  function clearMatchState(key: string): void {
    pendingEvent.delete(key);
    lastSig.delete(key);
    lastPushAt.delete(key);
    prevLive.delete(key);
  }

  // ── Live-hub subscription ──────────────────────────────────────────────────

  const sub = hub.subscribe((msg: LiveMessage) => deliver(msg));

  function deliver(msg: LiveMessage): void {
    // score frames are redundant (content-state carries the score); hello/ping
    // are per-connection envelopes we don't receive here.
    if (msg.type === 'event') {
      onEvent(msg.matchId, msg.league, msg.event);
    } else if (msg.type === 'state') {
      // Defer so the poller's hub.setState(next) has committed before we read
      // the fresh snapshot (finished flag, scores) via hub.getState.
      queueMicrotask(() => void onState(msg.matchId, msg.league, msg.state));
    }
  }

  function onEvent(matchId: string, league: string, event: MatchEvent): void {
    const key = matchKey(league, matchId);
    if (ended.has(key)) return;
    pendingEvent.set(key, event); // coalesced into the following state push
    // Standalone banners for subscription-only devices (no Live Activity here).
    queueMicrotask(() => void sendBanners(matchId, league, event));
  }

  async function sendBanners(matchId: string, league: string, event: MatchEvent): Promise<void> {
    const activities = reg.activitiesForMatch(matchId);
    const covered = new Set(activities.map((a) => a.deviceToken).filter(Boolean) as string[]);
    const subs = reg.subscriptionsForMatch(matchId);
    if (subs.length === 0) return;
    const content = hub.getState(league, matchId)?.content;
    const alert = buildEventAlert(event, content);
    if (!alert) return;
    for (const s of subs) {
      if (covered.has(s.deviceToken)) continue; // alert rides that device's activity
      if (!alertAllowed(s.prefs, event.type)) continue;
      const device = reg.device(s.deviceToken);
      if (!device) continue;
      const aps: BannerAps = { alert, sound: 'default', 'thread-id': matchId };
      const note = new Notification();
      note.topic = bannerTopic;
      note.pushType = 'alert';
      note.priority = 10;
      note.expiry = Math.floor(Date.now() / 1000) + EXPIRY_SECONDS;
      note.rawPayload = { aps };
      await sendTo(device.env, note, device.deviceToken);
    }
  }

  async function onState(matchId: string, league: string, content: LiveContentState): Promise<void> {
    const key = matchKey(league, matchId);
    if (ended.has(key)) return;

    const full: MatchLiveState | undefined = hub.getState(league, matchId);
    const finished =
      full?.finished ?? (!content.isLive && /^(FT|PENS|AET)/i.test(content.status));

    const event = pendingEvent.get(key);
    pendingEvent.delete(key);

    const wasLive = prevLive.get(key) ?? false;
    const kickoff = !wasLive && content.isLive;
    prevLive.set(key, content.isLive);

    const activities = reg.activitiesForMatch(matchId);

    if (finished) {
      await endMatch(key, matchId, content, activities);
      return;
    }
    if (activities.length === 0) return; // subscription-only: banners handled in onEvent

    const sig = pushSignature(content);
    const now = Date.now();
    const changed = lastSig.get(key) !== sig;
    const stale = (lastPushAt.get(key) ?? 0) + KEEPALIVE_MS < now && content.isLive;
    if (!changed && !event && !kickoff && !stale) return;

    lastSig.set(key, sig);
    lastPushAt.set(key, now);

    for (const act of activities) {
      let alert: ApsAlert | null = null;
      if (event && alertAllowed(act.prefs, event.type)) alert = buildEventAlert(event, content);
      else if (kickoff && (act.prefs?.kickoff ?? true)) alert = kickoffAlert(content);
      await pushLiveActivity(act.env, act.activityToken, 'update', content, alert, matchId);
    }
  }

  async function endMatch(
    key: string,
    matchId: string,
    content: LiveContentState,
    activities: ReturnType<Registry['activitiesForMatch']>,
  ): Promise<void> {
    ended.add(key);
    for (const act of activities) {
      const alert = (act.prefs?.fulltime ?? true) ? fulltimeAlert(content) : null;
      await pushLiveActivity(act.env, act.activityToken, 'end', content, alert, matchId);
    }
    // The match is over — free its registry rows (activities + subscriptions),
    // then reconcile drops it from the hub so the poller can release its state.
    reg.unregister({ matchId });
    notifyChanged();
    clearMatchState(key);
    setTimeout(() => ended.delete(key), ENDED_GUARD_MS).unref?.();
  }

  async function pushLiveActivity(
    e: PushEnv,
    token: string,
    event: 'update' | 'end',
    content: LiveContentState,
    alert: ApsAlert | null,
    matchId: string,
  ): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const aps: LiveActivityAps = { timestamp: now, event, 'content-state': content };
    if (event === 'update') aps['stale-date'] = now + STALE_SECONDS;
    else aps['dismissal-date'] = now + DISMISS_SECONDS;
    if (alert) aps.alert = alert;

    const note = new Notification();
    note.topic = liveActivityTopic;
    note.pushType = 'liveactivity';
    note.priority = alert ? 10 : 5;
    note.expiry = now + EXPIRY_SECONDS;
    // Coalesce a burst of silent content updates; never collapse an alert away.
    if (!alert) note.collapseId = `${event}:${matchId}`;
    note.rawPayload = { aps };
    await sendTo(e, note, token);
  }

  // ── Reconcile the tracked-match set from the registry ──────────────────────

  function reconcile(): void {
    const wanted = new Set<string>();
    for (const m of reg.activeMatches()) {
      const key = matchKey(m.league, m.matchId);
      wanted.add(key);
      if (!tracked.has(key)) {
        tracked.add(key);
        sub.addMatch(m.league, m.matchId); // → poller ingests + delivers frames here
      }
    }
    for (const key of [...tracked]) {
      if (!wanted.has(key)) {
        tracked.delete(key);
        const { league, matchId } = splitKey(key);
        sub.removeMatch(league, matchId);
        clearMatchState(key);
      }
    }
  }

  coordinatorNotify = reconcile;
  reconcile(); // adopt anything registered before the worker started

  const reconcileTimer = setInterval(reconcile, RECONCILE_MS);
  reconcileTimer.unref?.();
  const pruneTimer = setInterval(() => {
    const dropped = reg.pruneDevicesOlderThan(Date.now() - DEVICE_TTL_MS);
    if (dropped > 0) {
      workerLog.info({ dropped }, 'pruned stale devices');
      reconcile();
    }
  }, PRUNE_MS);
  pruneTimer.unref?.();

  workerLog.info(
    { backend: reg.backend, apnsEnv: env.APNS_ENV, bundleId: env.APNS_BUNDLE_ID, counts: reg.counts() },
    'push worker started',
  );

  return (): void => {
    coordinatorNotify = null;
    clearInterval(reconcileTimer);
    clearInterval(pruneTimer);
    sub.close();
    for (const p of providers.values()) {
      try {
        void p.shutdown();
      } catch (err) {
        workerLog.warn({ err: errMsg(err) }, 'apns provider shutdown failed');
      }
    }
    reg.close();
    registrySingleton = null;
    workerLog.info('push worker stopped');
  };
}

// ── Wiring (owned by other agents — see decomposition) ───────────────────────
// This module is self-contained but reaches the app through two seams it does
// not own:
//   • src/routes/index.ts  — registerRoutes() must call `registerPush(app)`.
//   • src/push/worker.ts   — server.ts imports startPushWorker from there; that
//     stub should re-export ours: `export { startPushWorker } from '../routes/push.js';`
