// ─── Push token registry ─────────────────────────────────────────────────────
//
// The durable store behind the push endpoints and the APNs worker. Three logical
// tables, exactly as the locked push plan specifies:
//
//   • devices        — a device's APNs push token (for banner alerts) + the env
//                      it was minted in + an optional push-to-start token.
//   • activities     — a Live Activity's push token, bound to a matchId (this is
//                      what we send `content-state` updates / `end` to).
//   • subscriptions  — a device's interest in a match + its alert prefs.
//
// Everything is indexed by `matchId` (the fan-out key on each live event) and by
// token (the cleanup key when APNs returns 410/BadDeviceToken).
//
// PRIMARY backend = better-sqlite3 (synchronous, embedded, WAL). Its native
// binary must be compiled on install, which can fail on a fresh VM / unbuilt
// dependency. When it can't load we fall back to a file-backed JSON store that
// implements the SAME `Registry` interface, so the service always runs — it just
// keeps the registry in memory + a periodically-flushed JSON file instead.

import { createRequire } from 'node:module';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { log } from '../lib/log.js';
import type { PushEnv, PushPrefs } from '../contract/schema.js';

const logger = log('push-registry');

// ── Records ──────────────────────────────────────────────────────────────────

export interface DeviceRecord {
  deviceToken: string;
  env: PushEnv;
  pushToStartToken?: string;
  updatedAt: number;
}

export interface ActivityRecord {
  activityToken: string;
  matchId: string;
  league: string;
  env: PushEnv;
  /** The device that owns this activity (for banner alerts), if known. */
  deviceToken?: string;
  prefs?: PushPrefs;
  createdAt: number;
  updatedAt: number;
}

export interface SubscriptionRecord {
  deviceToken: string;
  matchId: string;
  league: string;
  env: PushEnv;
  prefs?: PushPrefs;
  updatedAt: number;
}

export interface MatchRef {
  league: string;
  matchId: string;
}

/** One `POST /v1/push/register` body (see RegisterPushSchema). */
export interface RegisterInput {
  matchId: string;
  league: string;
  env: PushEnv;
  deviceToken?: string;
  activityToken?: string;
  pushToStartToken?: string;
  prefs?: PushPrefs;
}

/** One `POST /v1/push/unregister` body (see UnregisterPushSchema). */
export interface UnregisterInput {
  matchId?: string;
  deviceToken?: string;
  activityToken?: string;
}

export interface RegistryCounts {
  devices: number;
  activities: number;
  subscriptions: number;
}

// ── Interface ────────────────────────────────────────────────────────────────

export interface Registry {
  readonly backend: 'sqlite' | 'json';

  /** Atomically upsert device + activity + subscription from one register call. */
  register(input: RegisterInput): void;
  /** Remove tokens / a subscription per the unregister semantics below. */
  unregister(input: UnregisterInput): void;
  /** Bump the liveness timestamp of a device (and one subscription). */
  heartbeat(deviceToken: string, matchId?: string): void;

  /** Delete whatever a single push token identifies (APNs 410 cleanup). */
  removeByToken(token: string): void;

  /** Live-Activity tokens registered for a match (content-state / end targets). */
  activitiesForMatch(matchId: string): ActivityRecord[];
  /** Device subscriptions for a match (banner-alert targets + prefs). */
  subscriptionsForMatch(matchId: string): SubscriptionRecord[];
  /** Distinct matches that have ≥1 activity or subscription (worker's poll set). */
  activeMatches(): MatchRef[];
  device(deviceToken: string): DeviceRecord | undefined;

  /** Drop devices (and their rows) not heartbeated since `cutoffMs`. Returns #. */
  pruneDevicesOlderThan(cutoffMs: number): number;
  counts(): RegistryCounts;
  close(): void;
}

// ── Shared value coercion (rows / JSON come in as `unknown`) ──────────────────

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}
function strOpt(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}
function num(v: unknown): number {
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function asEnv(v: unknown): PushEnv {
  return v === 'production' ? 'production' : 'sandbox';
}
function encodePrefs(prefs?: PushPrefs): string | null {
  return prefs ? JSON.stringify(prefs) : null;
}
function decodePrefs(v: unknown): PushPrefs | undefined {
  if (typeof v !== 'string' || v.length === 0) return undefined;
  try {
    return JSON.parse(v) as PushPrefs;
  } catch {
    return undefined;
  }
}
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ── Default file locations (override via env) ─────────────────────────────────

const DATA_DIR = process.env.PUSH_DATA_DIR ?? process.cwd();
const DEFAULT_SQLITE_PATH = process.env.PUSH_DB_PATH ?? join(DATA_DIR, 'push-registry.db');
const DEFAULT_JSON_PATH = process.env.PUSH_JSON_PATH ?? join(DATA_DIR, 'push-registry.json');

// ── SQLite backend ────────────────────────────────────────────────────────────
//
// Minimal structural typing of the tiny slice of the better-sqlite3 surface we
// use — this deliberately avoids importing `@types/better-sqlite3` so the module
// type-checks and loads even when the native package can't be resolved/built.

interface SqliteStatement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}
interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  exec(sql: string): void;
  pragma(source: string): unknown;
  transaction<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void;
  close(): void;
}
type SqliteConstructor = new (
  path: string,
  options?: { readonly?: boolean; fileMustExist?: boolean },
) => SqliteDatabase;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS devices (
  device_token        TEXT PRIMARY KEY,
  env                 TEXT NOT NULL,
  push_to_start_token TEXT,
  updated_at          INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS activities (
  activity_token TEXT PRIMARY KEY,
  match_id       TEXT NOT NULL,
  league         TEXT NOT NULL,
  env            TEXT NOT NULL,
  device_token   TEXT,
  prefs          TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activities_match  ON activities(match_id);
CREATE INDEX IF NOT EXISTS idx_activities_device ON activities(device_token);
CREATE TABLE IF NOT EXISTS subscriptions (
  device_token TEXT NOT NULL,
  match_id     TEXT NOT NULL,
  league       TEXT NOT NULL,
  env          TEXT NOT NULL,
  prefs        TEXT,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (device_token, match_id)
);
CREATE INDEX IF NOT EXISTS idx_subs_match ON subscriptions(match_id);
`;

function rowToActivity(v: unknown): ActivityRecord {
  const r = v as Record<string, unknown>;
  return {
    activityToken: str(r.activity_token),
    matchId: str(r.match_id),
    league: str(r.league),
    env: asEnv(r.env),
    deviceToken: strOpt(r.device_token),
    prefs: decodePrefs(r.prefs),
    createdAt: num(r.created_at),
    updatedAt: num(r.updated_at),
  };
}
function rowToSubscription(v: unknown): SubscriptionRecord {
  const r = v as Record<string, unknown>;
  return {
    deviceToken: str(r.device_token),
    matchId: str(r.match_id),
    league: str(r.league),
    env: asEnv(r.env),
    prefs: decodePrefs(r.prefs),
    updatedAt: num(r.updated_at),
  };
}
function rowToDevice(v: unknown): DeviceRecord {
  const r = v as Record<string, unknown>;
  return {
    deviceToken: str(r.device_token),
    env: asEnv(r.env),
    pushToStartToken: strOpt(r.push_to_start_token),
    updatedAt: num(r.updated_at),
  };
}

class SqliteRegistry implements Registry {
  readonly backend = 'sqlite' as const;
  private readonly db: SqliteDatabase;

  // Prepared statements (compiled once).
  private readonly upsertDevice: SqliteStatement;
  private readonly upsertActivity: SqliteStatement;
  private readonly upsertSubscription: SqliteStatement;
  private readonly runRegister: (input: RegisterInput, now: number) => void;

  constructor(path: string) {
    const requireCjs = createRequire(import.meta.url);
    // Throws if the native binding is missing / unbuildable → caller falls back.
    const Database = requireCjs('better-sqlite3') as SqliteConstructor;
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(SCHEMA);

    this.upsertDevice = this.db.prepare(`
      INSERT INTO devices(device_token, env, push_to_start_token, updated_at)
      VALUES (@deviceToken, @env, @pushToStartToken, @now)
      ON CONFLICT(device_token) DO UPDATE SET
        env = excluded.env,
        push_to_start_token = COALESCE(excluded.push_to_start_token, devices.push_to_start_token),
        updated_at = excluded.updated_at
    `);
    this.upsertActivity = this.db.prepare(`
      INSERT INTO activities(activity_token, match_id, league, env, device_token, prefs, created_at, updated_at)
      VALUES (@activityToken, @matchId, @league, @env, @deviceToken, @prefs, @now, @now)
      ON CONFLICT(activity_token) DO UPDATE SET
        match_id = excluded.match_id,
        league = excluded.league,
        env = excluded.env,
        device_token = COALESCE(excluded.device_token, activities.device_token),
        prefs = COALESCE(excluded.prefs, activities.prefs),
        updated_at = excluded.updated_at
    `);
    this.upsertSubscription = this.db.prepare(`
      INSERT INTO subscriptions(device_token, match_id, league, env, prefs, updated_at)
      VALUES (@deviceToken, @matchId, @league, @env, @prefs, @now)
      ON CONFLICT(device_token, match_id) DO UPDATE SET
        league = excluded.league,
        env = excluded.env,
        prefs = COALESCE(excluded.prefs, subscriptions.prefs),
        updated_at = excluded.updated_at
    `);

    this.runRegister = this.db.transaction((input: RegisterInput, now: number) => {
      const prefs = encodePrefs(input.prefs);
      if (input.deviceToken) {
        this.upsertDevice.run({
          deviceToken: input.deviceToken,
          env: input.env,
          pushToStartToken: input.pushToStartToken ?? null,
          now,
        });
        // A subscription only makes sense with a device to alert.
        this.upsertSubscription.run({
          deviceToken: input.deviceToken,
          matchId: input.matchId,
          league: input.league,
          env: input.env,
          prefs,
          now,
        });
      }
      if (input.activityToken) {
        this.upsertActivity.run({
          activityToken: input.activityToken,
          matchId: input.matchId,
          league: input.league,
          env: input.env,
          deviceToken: input.deviceToken ?? null,
          prefs,
          now,
        });
      }
    });
  }

  register(input: RegisterInput): void {
    this.runRegister(input, Date.now());
  }

  unregister(input: UnregisterInput): void {
    if (input.activityToken) {
      this.db.prepare('DELETE FROM activities WHERE activity_token = ?').run(input.activityToken);
      return;
    }
    if (input.deviceToken && input.matchId) {
      this.db
        .prepare('DELETE FROM subscriptions WHERE device_token = ? AND match_id = ?')
        .run(input.deviceToken, input.matchId);
      this.db
        .prepare('DELETE FROM activities WHERE device_token = ? AND match_id = ?')
        .run(input.deviceToken, input.matchId);
      return;
    }
    if (input.deviceToken) {
      this.removeDevice(input.deviceToken);
      return;
    }
    if (input.matchId) {
      this.db.prepare('DELETE FROM activities WHERE match_id = ?').run(input.matchId);
      this.db.prepare('DELETE FROM subscriptions WHERE match_id = ?').run(input.matchId);
    }
  }

  private removeDevice(deviceToken: string): void {
    this.db.prepare('DELETE FROM devices WHERE device_token = ?').run(deviceToken);
    this.db.prepare('DELETE FROM subscriptions WHERE device_token = ?').run(deviceToken);
    this.db.prepare('DELETE FROM activities WHERE device_token = ?').run(deviceToken);
  }

  heartbeat(deviceToken: string, matchId?: string): void {
    const now = Date.now();
    this.db
      .prepare('UPDATE devices SET updated_at = ? WHERE device_token = ?')
      .run(now, deviceToken);
    if (matchId) {
      this.db
        .prepare('UPDATE subscriptions SET updated_at = ? WHERE device_token = ? AND match_id = ?')
        .run(now, deviceToken, matchId);
    }
  }

  removeByToken(token: string): void {
    // The token could be an activity push token OR a device APNs token.
    this.db.prepare('DELETE FROM activities WHERE activity_token = ?').run(token);
    this.removeDevice(token);
  }

  activitiesForMatch(matchId: string): ActivityRecord[] {
    return this.db
      .prepare('SELECT * FROM activities WHERE match_id = ?')
      .all(matchId)
      .map(rowToActivity);
  }

  subscriptionsForMatch(matchId: string): SubscriptionRecord[] {
    return this.db
      .prepare('SELECT * FROM subscriptions WHERE match_id = ?')
      .all(matchId)
      .map(rowToSubscription);
  }

  activeMatches(): MatchRef[] {
    const rows = this.db
      .prepare(
        `SELECT match_id, league FROM activities
         UNION
         SELECT match_id, league FROM subscriptions`,
      )
      .all();
    return rows.map((v) => {
      const r = v as Record<string, unknown>;
      return { matchId: str(r.match_id), league: str(r.league) };
    });
  }

  device(deviceToken: string): DeviceRecord | undefined {
    const row = this.db.prepare('SELECT * FROM devices WHERE device_token = ?').get(deviceToken);
    return row ? rowToDevice(row) : undefined;
  }

  pruneDevicesOlderThan(cutoffMs: number): number {
    const stale = this.db
      .prepare('SELECT device_token FROM devices WHERE updated_at < ?')
      .all(cutoffMs)
      .map((v) => str((v as Record<string, unknown>).device_token));
    for (const token of stale) this.removeDevice(token);
    return stale.length;
  }

  counts(): RegistryCounts {
    const one = (sql: string): number => num((this.db.prepare(sql).get() as Record<string, unknown>).c);
    return {
      devices: one('SELECT COUNT(*) AS c FROM devices'),
      activities: one('SELECT COUNT(*) AS c FROM activities'),
      subscriptions: one('SELECT COUNT(*) AS c FROM subscriptions'),
    };
  }

  close(): void {
    try {
      this.db.close();
    } catch (err) {
      logger.warn({ err: errMsg(err) }, 'sqlite close failed');
    }
  }
}

// ── JSON file backend (fallback) ──────────────────────────────────────────────

interface JsonShape {
  devices: DeviceRecord[];
  activities: ActivityRecord[];
  subscriptions: SubscriptionRecord[];
}

function subKey(deviceToken: string, matchId: string): string {
  return `${deviceToken} ${matchId}`;
}

class JsonRegistry implements Registry {
  readonly backend = 'json' as const;
  private readonly path: string;
  private readonly devices = new Map<string, DeviceRecord>();
  private readonly activities = new Map<string, ActivityRecord>();
  private readonly subscriptions = new Map<string, SubscriptionRecord>();
  // Secondary indexes keyed by matchId (the fan-out key).
  private readonly activitiesByMatch = new Map<string, Set<string>>();
  private readonly subsByMatch = new Map<string, Set<string>>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private closed = false;

  constructor(path: string) {
    this.path = path;
    this.load();
  }

  private load(): void {
    if (!existsSync(this.path)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<JsonShape>;
      for (const d of parsed.devices ?? []) if (d?.deviceToken) this.devices.set(d.deviceToken, d);
      for (const a of parsed.activities ?? []) if (a?.activityToken) this.indexActivity(a);
      for (const s of parsed.subscriptions ?? [])
        if (s?.deviceToken && s?.matchId) this.indexSubscription(s);
    } catch (err) {
      logger.warn({ err: errMsg(err), path: this.path }, 'failed to load JSON registry; starting empty');
    }
  }

  private indexActivity(a: ActivityRecord): void {
    this.activities.set(a.activityToken, a);
    let set = this.activitiesByMatch.get(a.matchId);
    if (!set) this.activitiesByMatch.set(a.matchId, (set = new Set()));
    set.add(a.activityToken);
  }
  private deindexActivity(a: ActivityRecord): void {
    this.activities.delete(a.activityToken);
    const set = this.activitiesByMatch.get(a.matchId);
    if (set) {
      set.delete(a.activityToken);
      if (set.size === 0) this.activitiesByMatch.delete(a.matchId);
    }
  }
  private indexSubscription(s: SubscriptionRecord): void {
    this.subscriptions.set(subKey(s.deviceToken, s.matchId), s);
    let set = this.subsByMatch.get(s.matchId);
    if (!set) this.subsByMatch.set(s.matchId, (set = new Set()));
    set.add(subKey(s.deviceToken, s.matchId));
  }
  private deindexSubscription(s: SubscriptionRecord): void {
    const key = subKey(s.deviceToken, s.matchId);
    this.subscriptions.delete(key);
    const set = this.subsByMatch.get(s.matchId);
    if (set) {
      set.delete(key);
      if (set.size === 0) this.subsByMatch.delete(s.matchId);
    }
  }

  register(input: RegisterInput): void {
    const now = Date.now();
    if (input.deviceToken) {
      const existing = this.devices.get(input.deviceToken);
      this.devices.set(input.deviceToken, {
        deviceToken: input.deviceToken,
        env: input.env,
        pushToStartToken: input.pushToStartToken ?? existing?.pushToStartToken,
        updatedAt: now,
      });
      const key = subKey(input.deviceToken, input.matchId);
      const prev = this.subscriptions.get(key);
      this.indexSubscription({
        deviceToken: input.deviceToken,
        matchId: input.matchId,
        league: input.league,
        env: input.env,
        prefs: input.prefs ?? prev?.prefs,
        updatedAt: now,
      });
    }
    if (input.activityToken) {
      const prev = this.activities.get(input.activityToken);
      this.indexActivity({
        activityToken: input.activityToken,
        matchId: input.matchId,
        league: input.league,
        env: input.env,
        deviceToken: input.deviceToken ?? prev?.deviceToken,
        prefs: input.prefs ?? prev?.prefs,
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
      });
    }
    this.markDirty();
  }

  unregister(input: UnregisterInput): void {
    if (input.activityToken) {
      const a = this.activities.get(input.activityToken);
      if (a) this.deindexActivity(a);
      this.markDirty();
      return;
    }
    if (input.deviceToken && input.matchId) {
      const s = this.subscriptions.get(subKey(input.deviceToken, input.matchId));
      if (s) this.deindexSubscription(s);
      for (const a of [...this.activities.values()])
        if (a.deviceToken === input.deviceToken && a.matchId === input.matchId) this.deindexActivity(a);
      this.markDirty();
      return;
    }
    if (input.deviceToken) {
      this.removeDevice(input.deviceToken);
      this.markDirty();
      return;
    }
    if (input.matchId) {
      for (const token of [...(this.activitiesByMatch.get(input.matchId) ?? [])]) {
        const a = this.activities.get(token);
        if (a) this.deindexActivity(a);
      }
      for (const key of [...(this.subsByMatch.get(input.matchId) ?? [])]) {
        const s = this.subscriptions.get(key);
        if (s) this.deindexSubscription(s);
      }
      this.markDirty();
    }
  }

  private removeDevice(deviceToken: string): void {
    this.devices.delete(deviceToken);
    for (const s of [...this.subscriptions.values()])
      if (s.deviceToken === deviceToken) this.deindexSubscription(s);
    for (const a of [...this.activities.values()])
      if (a.deviceToken === deviceToken) this.deindexActivity(a);
  }

  heartbeat(deviceToken: string, matchId?: string): void {
    const now = Date.now();
    const d = this.devices.get(deviceToken);
    if (d) d.updatedAt = now;
    if (matchId) {
      const s = this.subscriptions.get(subKey(deviceToken, matchId));
      if (s) s.updatedAt = now;
    }
    this.markDirty();
  }

  removeByToken(token: string): void {
    const a = this.activities.get(token);
    if (a) this.deindexActivity(a);
    if (this.devices.has(token)) this.removeDevice(token);
    this.markDirty();
  }

  activitiesForMatch(matchId: string): ActivityRecord[] {
    const tokens = this.activitiesByMatch.get(matchId);
    if (!tokens) return [];
    const out: ActivityRecord[] = [];
    for (const t of tokens) {
      const a = this.activities.get(t);
      if (a) out.push(a);
    }
    return out;
  }

  subscriptionsForMatch(matchId: string): SubscriptionRecord[] {
    const keys = this.subsByMatch.get(matchId);
    if (!keys) return [];
    const out: SubscriptionRecord[] = [];
    for (const k of keys) {
      const s = this.subscriptions.get(k);
      if (s) out.push(s);
    }
    return out;
  }

  activeMatches(): MatchRef[] {
    const byKey = new Map<string, MatchRef>();
    for (const a of this.activities.values()) byKey.set(`${a.league}/${a.matchId}`, { league: a.league, matchId: a.matchId });
    for (const s of this.subscriptions.values()) byKey.set(`${s.league}/${s.matchId}`, { league: s.league, matchId: s.matchId });
    return [...byKey.values()];
  }

  device(deviceToken: string): DeviceRecord | undefined {
    return this.devices.get(deviceToken);
  }

  pruneDevicesOlderThan(cutoffMs: number): number {
    const stale = [...this.devices.values()].filter((d) => d.updatedAt < cutoffMs);
    for (const d of stale) this.removeDevice(d.deviceToken);
    if (stale.length > 0) this.markDirty();
    return stale.length;
  }

  counts(): RegistryCounts {
    return {
      devices: this.devices.size,
      activities: this.activities.size,
      subscriptions: this.subscriptions.size,
    };
  }

  close(): void {
    this.closed = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.dirty) this.flush();
  }

  // Coalesce writes; persist at most ~every 500ms and once more on close.
  private markDirty(): void {
    this.dirty = true;
    if (this.flushTimer || this.closed) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, 500);
    this.flushTimer.unref?.();
  }

  private flush(): void {
    this.dirty = false;
    const data: JsonShape = {
      devices: [...this.devices.values()],
      activities: [...this.activities.values()],
      subscriptions: [...this.subscriptions.values()],
    };
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.tmp`;
      writeFileSync(tmp, JSON.stringify(data), 'utf8');
      renameSync(tmp, this.path); // atomic replace
    } catch (err) {
      logger.error({ err: errMsg(err), path: this.path }, 'failed to persist JSON registry');
    }
  }
}

// ── Factory ────────────────────────────────────────────────────────────────────

export interface CreateRegistryOptions {
  sqlitePath?: string;
  jsonPath?: string;
  /** Force the JSON backend (skip better-sqlite3 entirely). */
  forceJson?: boolean;
}

/**
 * Build the registry, preferring the SQLite backend and transparently falling
 * back to the JSON file store when better-sqlite3 can't be loaded (e.g. its
 * native binary wasn't built on this host). Either way the returned object
 * satisfies the same `Registry` interface, so callers never branch on backend.
 */
export function createRegistry(options: CreateRegistryOptions = {}): Registry {
  const sqlitePath = options.sqlitePath ?? DEFAULT_SQLITE_PATH;
  const jsonPath = options.jsonPath ?? DEFAULT_JSON_PATH;
  if (!options.forceJson) {
    try {
      const reg = new SqliteRegistry(sqlitePath);
      logger.info({ backend: 'sqlite', path: sqlitePath }, 'push registry ready');
      return reg;
    } catch (err) {
      logger.warn(
        { err: errMsg(err), jsonPath },
        'better-sqlite3 unavailable — using file-backed JSON registry',
      );
    }
  }
  const reg = new JsonRegistry(jsonPath);
  logger.info({ backend: 'json', path: jsonPath }, 'push registry ready');
  return reg;
}
