// ─── Telemetry / error reporting (single choke point) ───────────────────────
// The app currently ships with NO crash/error reporting, so silent failures
// (e.g. an ESPN scrape returning []) are invisible in production. This module
// centralises reporting so turning it on is a one-file change:
//
//   1. `npx expo install @sentry/react-native`
//   2. set EXPO_PUBLIC_SENTRY_DSN (dev build) — kept out of source
//   3. fill in the three TODOs below
//
// Until a DSN is present every call is a safe no-op (plus a dev console line),
// so call sites can adopt captureError/captureMessage today.

const DSN: string | undefined = process.env.EXPO_PUBLIC_SENTRY_DSN;

let initialized = false;

export function initTelemetry(): void {
  if (initialized) return;
  initialized = true;
  if (!DSN) return;
  // TODO(sentry): Sentry.init({ dsn: DSN, tracesSampleRate: 0.2, enableNativeCrashHandling: true });
}

/** Report a caught exception (React error boundary, query error, etc.). */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (__DEV__) console.error('[telemetry]', error, context ?? '');
  if (!DSN) return;
  // TODO(sentry): Sentry.captureException(error, { extra: context });
}

/** Report a soft/expected-but-notable event, e.g. "live scrape returned empty". */
export function captureMessage(message: string, context?: Record<string, unknown>): void {
  if (__DEV__) console.warn('[telemetry]', message, context ?? '');
  if (!DSN) return;
  // TODO(sentry): Sentry.captureMessage(message, { level: 'warning', extra: context });
}

/** Whether reporting is actually wired to a backend (for gating extra breadcrumbs). */
export function isTelemetryEnabled(): boolean {
  return !!DSN;
}
