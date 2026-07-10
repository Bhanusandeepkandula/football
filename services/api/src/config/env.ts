import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

// Load a local .env when present (dev). In production (systemd on the Oracle VM)
// the values come from the unit's EnvironmentFile / Environment= directives, so
// a missing .env is fine.
loadEnv();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // ── HTTP ──
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  // Shared secret the app sends as `Authorization: Bearer <API_TOKEN>` on the
  // push endpoints (register/unregister/heartbeat). Optional in dev — when unset
  // auth is DISABLED. REQUIRED in production. (Read-only proxy GETs are public.)
  API_TOKEN: z.string().min(1).optional(),

  // ── ESPN upstream hosts (override only if ESPN moves them) ──
  ESPN_SITE_API: z
    .string()
    .url()
    .default('https://site.api.espn.com/apis/site/v2/sports/soccer'),
  ESPN_CORE_API: z
    .string()
    .url()
    .default('https://sports.core.api.espn.com/v2/sports/soccer/leagues'),
  ESPN_WEB_API: z
    .string()
    .url()
    .default('https://site.web.api.espn.com/apis/v2/sports/soccer'),
  ESPN_FASTCAST_HANDSHAKE: z
    .string()
    .url()
    .default('https://fastcast.semfs.engsvc.go.com/public/websockethost'),

  // Live REST-fallback / snapshot poll cadence (ms) for in-progress matches.
  POLL_MS: z.coerce.number().int().positive().default(15000),

  // ── APNs / Live Activity push ──
  // REQUIRED ONLY to enable the push worker. Leave any of the first three blank
  // to run the service in proxy-only mode (REST + SSE + WS, no background push).
  // Needs a PAID Apple Developer account (see the locked push plan / README).
  APNS_KEY_P8: z.string().min(1).optional(), // PEM contents of AuthKey_XXXX.p8
  APNS_KEY_ID: z.string().min(1).optional(),
  APNS_TEAM_ID: z.string().min(1).optional(),
  APNS_BUNDLE_ID: z.string().default('com.sandeep.worldcup2026'),
  // Route by the environment the device token was minted in: dev builds /
  // Xcode = 'sandbox'; TestFlight / App Store = 'production'.
  APNS_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  const detail = parsed.error.issues
    .map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  console.error(`[env] invalid configuration:\n${detail}`);
  process.exit(1);
}

const data = parsed.data;

// The push worker only starts when the three APNs credentials are all present.
// `server.ts` guards `startPushWorker()` on this flag.
const pushEnabled = Boolean(
  data.APNS_KEY_P8 && data.APNS_KEY_ID && data.APNS_TEAM_ID,
);

export const env = { ...data, pushEnabled } as const;
export type Env = typeof env;
