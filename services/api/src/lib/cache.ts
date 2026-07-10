// ─── In-memory TTL cache with in-flight request coalescing ───────────────────
// This is the piece that turns "N app users open the same match" into ONE
// upstream ESPN fetch. Two mechanisms stack:
//
//   • TTL cache — a fresh value (age < ttlMs) is returned synchronously; no
//     upstream call. Short TTLs keep live data honest (a scoreboard might be
//     3–5s, a team roster minutes).
//   • Request coalescing — when a key is stale/cold and several requests arrive
//     while the upstream fetch is still in flight, they all await the SAME
//     promise instead of each firing their own fetch. This is the thundering-herd
//     guard: a burst of concurrent readers collapses to a single origin request.
//
// The `cached(key, ttlMs, loader)` helper is the whole point; the getters /
// setters / invalidators below let the live poller bust a match's cached detail
// the instant a goal changes it.

import { log } from './log.js';

const logger = log('cache');

interface Entry<T> {
  value: T;
  /** epoch ms after which the entry is considered stale. */
  expires: number;
}

/** Soft cap on distinct keys; prevents unbounded growth from odd query params. */
const MAX_ENTRIES = 1_000;

const store = new Map<string, Entry<unknown>>();
/** Keyed promises for fetches currently in flight — the coalescing table. */
const inflight = new Map<string, Promise<unknown>>();

export interface CachedOptions {
  /**
   * If the loader rejects but a stale (expired) value is still around, serve the
   * stale value instead of throwing. Great in front of a flaky upstream: readers
   * keep seeing the last-good payload while ESPN hiccups. Default `false`.
   */
  staleIfError?: boolean;
}

/**
 * Return `key`'s value, computing it via `loader` at most once per (stale) key
 * even under concurrent callers.
 *
 * Fast path: a fresh cached value is returned without touching `loader`.
 * Cold/stale path: the first caller starts `loader`; concurrent callers for the
 * same key JOIN that single in-flight promise. On success the value is cached
 * for `ttlMs`. On failure nothing is cached and every joined caller rejects with
 * the same error (unless `staleIfError` salvages a stale value).
 *
 * `ttlMs <= 0` disables storage (each call recomputes) but STILL coalesces
 * concurrent callers — useful for "dedupe this burst, don't cache" cases.
 */
export function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  options?: CachedOptions,
): Promise<T> {
  const now = Date.now();

  // 1) Fresh hit — no upstream work.
  const existing = store.get(key) as Entry<T> | undefined;
  if (existing && existing.expires > now) {
    return Promise.resolve(existing.value);
  }

  // 2) A fetch for this key is already running — join it (coalesce).
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  // 3) Cold/stale — become the single loader for this key.
  //    NOTE: everything between here and `inflight.set` runs synchronously (the
  //    async IIFE only suspends at its first `await`), so no second caller can
  //    slip in and start a duplicate fetch before the key is registered.
  const promise = (async (): Promise<T> => {
    try {
      const value = await loader();
      if (ttlMs > 0) {
        store.set(key, { value, expires: Date.now() + ttlMs });
        pruneIfNeeded();
      }
      return value;
    } catch (err) {
      if (options?.staleIfError && existing) {
        logger.warn({ key }, 'loader failed — serving stale cached value');
        return existing.value;
      }
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

/** Read a FRESH cached value (undefined if missing or expired). No fetch. */
export function getCached<T>(key: string): T | undefined {
  const entry = store.get(key) as Entry<T> | undefined;
  if (!entry) return undefined;
  if (entry.expires <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

/** Read whatever is cached, even if stale (undefined only if truly absent). */
export function peekCached<T>(key: string): T | undefined {
  return (store.get(key) as Entry<T> | undefined)?.value;
}

/** Imperatively seed the cache (e.g. the live poller pushing a just-normalized snapshot). */
export function setCached<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expires: Date.now() + Math.max(0, ttlMs) });
  pruneIfNeeded();
}

/** Drop one key's cached value (does not cancel an in-flight load). */
export function invalidate(key: string): boolean {
  return store.delete(key);
}

/** Drop every cached key starting with `prefix` (e.g. all of one match/league). Returns count removed. */
export function invalidatePrefix(prefix: string): number {
  let removed = 0;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
      removed++;
    }
  }
  return removed;
}

/** Wipe the cache (tests / manual flush). Does not touch in-flight loads. */
export function clearCache(): void {
  store.clear();
}

/** Lightweight introspection for a /health or debug view. */
export function cacheStats(): { size: number; inflight: number } {
  return { size: store.size, inflight: inflight.size };
}

// ─── Eviction ─────────────────────────────────────────────────────────────────
// Called after growth. First sweep expired entries; if still over the cap, drop
// oldest-inserted keys (Map preserves insertion order) until back under.

function pruneIfNeeded(): void {
  if (store.size <= MAX_ENTRIES) return;

  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expires <= now) store.delete(key);
  }
  if (store.size <= MAX_ENTRIES) return;

  const overflow = store.size - MAX_ENTRIES;
  let dropped = 0;
  for (const key of store.keys()) {
    if (dropped >= overflow) break;
    store.delete(key);
    dropped++;
  }
}
