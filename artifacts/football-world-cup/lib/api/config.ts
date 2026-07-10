// ─── MatchCenter backend base URLs ───────────────────────────────────────────
// The app talks to its own @matchcenter/api service (which normalizes ESPN and
// fans out the live stream) instead of hitting ESPN hosts directly.
//
//   • API_BASE — REST root, e.g. http://192.168.1.45:8080  (GET /v1/…)
//   • WS_BASE  — WebSocket root, derived from API_BASE      (WS  /v1/live/ws)
//
// Priority:
//   1. EXPO_PUBLIC_API_URL — set this for staging/production (the deployed
//      backend URL). Expo inlines EXPO_PUBLIC_* into the bundle at build time.
//   2. In dev, auto-derive from the Metro dev-server host the app is already
//      connected to (so the backend follows your Mac's LAN IP automatically —
//      no hardcoded IP to go stale when you change networks), port 8080.
//   3. Fallback to localhost (simulator / web).

import Constants from 'expo-constants';

const BACKEND_PORT = 8080;

/** The LAN host the app reached Metro on — reuse it for the backend in dev. */
function devServerHost(): string | null {
  const c = Constants as any;
  const candidates: (string | undefined)[] = [
    c?.expoConfig?.hostUri,
    c?.expoGoConfig?.debuggerHost,
    c?.manifest2?.extra?.expoGo?.debuggerHost,
    c?.manifest?.debuggerHost,
    c?.manifest?.hostUri,
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const host = String(raw).split('/')[0].split(':')[0].trim();
    if (host) return host;
  }
  return null;
}

function resolveApiBase(): string {
  const override = process.env.EXPO_PUBLIC_API_URL;
  if (override) return override;
  const host = devServerHost();
  if (host) return `http://${host}:${BACKEND_PORT}`;
  return `http://localhost:${BACKEND_PORT}`;
}

/** REST base, no trailing slash. All REST paths are absolute under `/v1`. */
export const API_BASE: string = resolveApiBase().replace(/\/+$/, '');

/**
 * WebSocket base derived from API_BASE: `http`→`ws`, `https`→`wss`.
 * The live channel lives at `${WS_BASE}${LIVE_WS_PATH}`.
 */
export const WS_BASE: string = API_BASE.replace(/^http/i, 'ws');

/** Path of the live WebSocket endpoint on the backend (versioned alias). */
export const LIVE_WS_PATH = '/v1/live/ws';

/** Default per-request REST timeout (ms) enforced via AbortController. */
export const REQUEST_TIMEOUT_MS = 8000;
