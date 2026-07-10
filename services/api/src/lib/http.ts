// ─── Hardened HTTP client for the ESPN proxy ─────────────────────────────────
// Every upstream fetch in this service goes through here. It gives us four
// things a bare `fetch` does not, all of which matter when you are proxying an
// undocumented third-party API (ESPN) for many concurrent app users:
//
//   1. A per-request AbortController timeout (8–10s band). ESPN's site/web APIs
//      occasionally hang; without this a single stuck socket would pin a route
//      handler open forever.
//   2. Browser-like headers. Bare Node fetches to site.web.api.espn.com get a
//      403 / bot wall; sending a desktop-Chrome UA plus an espn.com Origin +
//      Referer makes the request look like the gamecast page ESPN serves.
//   3. Bounded retry with full jitter on transient failures only — 5xx, request
//      timeouts and network errors. 4xx (incl. 404/400) are deterministic and
//      are NEVER retried; retrying them just wastes ESPN's goodwill and our
//      latency budget.
//   4. Typed errors (HttpError / TimeoutError / NetworkError / ParseError) so
//      callers and routes can map upstream failure → the right HTTP status.
//
// Consumers should still validate the parsed JSON with the zod contract in
// src/contract/schema.ts; `fetchJson<T>` defaults `T` to `unknown` on purpose.

import { log } from './log.js';

const logger = log('http');

// A recent desktop-Chrome UA. ESPN gates some hosts on a plausible browser UA.
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// The gamecast/scoreboard pages these JSON endpoints back live under espn.com,
// so we present that origin. (Fastcast uses the same Origin — see the app's
// lib/fastcast.ts.)
const ESPN_ORIGIN = 'https://www.espn.com';

const DEFAULT_TIMEOUT_MS = 9_000; // middle of the 8–10s band
const DEFAULT_RETRIES = 2; // → up to 3 attempts total
const BASE_BACKOFF_MS = 300;
const MAX_BACKOFF_MS = 3_000;

export interface FetchOptions {
  /** Per-attempt timeout in ms. Default 9000 (8–10s band). */
  timeoutMs?: number;
  /** Extra retries on transient (5xx / timeout / network) failures. Default 2. */
  retries?: number;
  /** Extra request headers (override the browser defaults if you pass the same key). */
  headers?: Record<string, string>;
  /** Caller cancellation, composed with the internal timeout. Aborting here never retries. */
  signal?: AbortSignal;
  /**
   * Add the ESPN browser Origin + Referer. Default `true` because this is an
   * ESPN proxy; set `false` for non-ESPN upstreams (BBC/Guardian/Sky news RSS).
   */
  espn?: boolean;
}

// ─── Typed errors ─────────────────────────────────────────────────────────────
// One family (FetchError) with a `.retryable` flag the retry loop keys off, and
// a `.url` every subclass carries for diagnostics.

export class FetchError extends Error {
  readonly url: string;
  readonly retryable: boolean;
  constructor(message: string, url: string, retryable: boolean, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'FetchError';
    this.url = url;
    this.retryable = retryable;
  }
}

/** Upstream returned a non-2xx status. Retryable iff status >= 500. */
export class HttpError extends FetchError {
  readonly status: number;
  /** First ~500 chars of the error response body, for logs. */
  readonly body?: string;
  constructor(status: number, url: string, body?: string) {
    super(`HTTP ${status} <${url}>`, url, status >= 500);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

/** The AbortController fired before the response (and its body) finished. */
export class TimeoutError extends FetchError {
  readonly timeoutMs: number;
  constructor(url: string, timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms <${url}>`, url, true);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/** fetch() (or the body stream) threw for a non-abort reason — DNS, reset, TLS… */
export class NetworkError extends FetchError {
  constructor(url: string, cause: unknown) {
    super(
      `Network error <${url}>: ${cause instanceof Error ? cause.message : String(cause)}`,
      url,
      true,
      { cause },
    );
    this.name = 'NetworkError';
  }
}

/** A 2xx body was not valid JSON. Not retryable (deterministic). */
export class ParseError extends FetchError {
  readonly body: string;
  constructor(url: string, body: string, cause: unknown) {
    super(`Invalid JSON <${url}>`, url, false, { cause });
    this.name = 'ParseError';
    this.body = body;
  }
}

// ─── Internals ────────────────────────────────────────────────────────────────

function buildHeaders(options: FetchOptions): Record<string, string> {
  const espn = options.espn ?? true;
  return {
    'User-Agent': BROWSER_UA,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    ...(espn ? { Origin: ESPN_ORIGIN, Referer: `${ESPN_ORIGIN}/` } : {}),
    // Caller headers win, so a route can force `Accept: application/rss+xml` etc.
    ...options.headers,
  };
}

interface Attempt {
  status: number;
  ok: boolean;
  text: string;
}

/**
 * One request attempt. The AbortController covers BOTH the response headers and
 * the full body read, so a slow trickle-body can't outlive the timeout.
 */
async function attemptOnce(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
  callerSignal: AbortSignal | undefined,
): Promise<Attempt> {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onCallerAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', onCallerAbort, { once: true });
  }

  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    // Read the body under the same deadline so partial/slow bodies still abort.
    const text = await res.text();
    return { status: res.status, ok: res.ok, text };
  } catch (err) {
    if (timedOut) throw new TimeoutError(url, timeoutMs);
    // Caller cancelled: propagate the original abort so it stays non-retryable.
    if (callerSignal?.aborted) throw err;
    throw new NetworkError(url, err);
  } finally {
    clearTimeout(timer);
    if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort);
  }
}

/** Exponential backoff with full jitter: a random point in [0, cap]. */
function backoffMs(attempt: number): number {
  const cap = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt);
  return Math.random() * cap;
}

/** Abortable sleep, so backoff between retries still honours caller cancellation. */
function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (!signal) return;
    if (signal.aborted) {
      clearTimeout(timer);
      reject(signal.reason);
      return;
    }
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

function errInfo(err: unknown): Record<string, unknown> {
  if (err instanceof HttpError) return { type: err.name, status: err.status };
  if (err instanceof FetchError) return { type: err.name };
  return { type: 'unknown', message: err instanceof Error ? err.message : String(err) };
}

/** Fetch with the timeout + bounded-retry policy, returning the raw text body. */
async function request(url: string, options: FetchOptions): Promise<Attempt> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const headers = buildHeaders(options);
  const signal = options.signal;

  for (let attempt = 0; ; attempt++) {
    try {
      const res = await attemptOnce(url, headers, timeoutMs, signal);
      if (!res.ok) throw new HttpError(res.status, url, res.text.slice(0, 500));
      return res;
    } catch (err) {
      // Caller cancelled — never retry, surface immediately.
      if (signal?.aborted) throw err;

      const retryable = err instanceof FetchError && err.retryable;
      if (!retryable || attempt >= retries) throw err;

      logger.warn(
        { url, attempt: attempt + 1, of: retries + 1, ...errInfo(err) },
        'upstream fetch failed — retrying',
      );
      await sleep(backoffMs(attempt), signal);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** GET a URL and return its body as text (with timeout + retry policy). */
export async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  const { text } = await request(url, options);
  return text;
}

/**
 * GET a URL and parse the body as JSON. `T` defaults to `unknown` — validate the
 * result against the zod contract at the call site before trusting it.
 * Throws {@link ParseError} on invalid JSON, or the relevant {@link FetchError}.
 */
export async function fetchJson<T = unknown>(url: string, options: FetchOptions = {}): Promise<T> {
  const { text } = await request(url, options);
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new ParseError(url, text.slice(0, 500), err);
  }
}
