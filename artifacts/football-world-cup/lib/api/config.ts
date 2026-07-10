// ─── MatchCenter backend base URLs ───────────────────────────────────────────
// The app talks to its own @matchcenter/api service (which normalizes ESPN and
// fans out the live stream) instead of hitting ESPN hosts directly.
//
//   • API_BASE — REST root, e.g. http://10.0.0.195:8080  (GET /v1/…)
//   • WS_BASE  — WebSocket root, derived from API_BASE     (WS  /v1/live/ws)
//
// Override in any environment with EXPO_PUBLIC_API_URL (read at build time by
// Expo — it inlines EXPO_PUBLIC_* into the bundle). The dev default points at
// the LAN address a device/simulator can reach during local development.

const DEV_DEFAULT = 'http://10.0.0.195:8080';

/** REST base, no trailing slash. All REST paths are absolute under `/v1`. */
export const API_BASE: string = (
  process.env.EXPO_PUBLIC_API_URL ?? DEV_DEFAULT
).replace(/\/+$/, '');

/**
 * WebSocket base derived from API_BASE: `http`→`ws`, `https`→`wss`.
 * The live channel lives at `${WS_BASE}${LIVE_WS_PATH}`.
 */
export const WS_BASE: string = API_BASE.replace(/^http/i, 'ws');

/** Path of the live WebSocket endpoint on the backend (versioned alias). */
export const LIVE_WS_PATH = '/v1/live/ws';

/** Default per-request REST timeout (ms) enforced via AbortController. */
export const REQUEST_TIMEOUT_MS = 8000;
