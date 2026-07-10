# @matchcenter/api

One small Node + TypeScript service that does two jobs:

1. **Proxy** — normalizes all football data from ESPN (site / core / web APIs +
   the Fastcast socket) and serves it to the app over **REST + SSE + WebSocket**
   with short-TTL caching. The app talks to this service instead of ESPN
   directly, so ESPN quirks, scraping and CORS live in one place.
2. **Push backend** — an APNs / Live-Activity worker that updates the Dynamic
   Island and fires goal alerts **while the app is closed** (see the locked push
   plan). Push is optional and only starts when APNs credentials are set.

It runs as a **plain Node process** (no Replit-specific anything) — designed for
an Oracle Cloud Always-Free VM under `systemd`.

## Layout

```
src/
  server.ts            bootstrap: Hono + @hono/node-server, WS, poller, push
  config/env.ts        typed env (zod) with safe defaults
  lib/log.ts           pino logger
  contract/schema.ts   THE shared contract — zod schemas + inferred DTO types
  normalize/           ESPN JSON → contract DTOs (pure functions, unit-tested)
  routes/index.ts      registerRoutes(app)      ← REST/proxy build agent
  live/ws.ts           attachWebSocket(server)  ← live-hub build agent
  live/poller.ts       startLivePoller()        ← live-hub build agent
  push/worker.ts       startPushWorker()        ← push build agent
deploy/
  matchcenter-api.service   systemd unit for the Oracle VM (copy to /etc/systemd/system)
```

`routes/`, `live/` and `push/` currently hold **thin seam stubs** — real work is
owned by the build agents. `contract/schema.ts` is the source of truth both they
and the app import.

## Requirements

- Node **20+** (dev machine here is Node 24; the Oracle AMD micro VM is x64)
- pnpm via corepack (this is a workspace package — install from the repo root)

## Run locally

```bash
# from the monorepo root
corepack pnpm install
cp services/api/.env.example services/api/.env   # optional; sane defaults exist
corepack pnpm --filter @matchcenter/api dev      # tsx watch, hot reload
```

Other scripts (all via `--filter @matchcenter/api`):

| script      | does                                  |
| ----------- | ------------------------------------- |
| `dev`       | `tsx watch src/server.ts`             |
| `build`     | `tsc -p tsconfig.json` → `dist/`      |
| `start`     | `node dist/server.js`                 |
| `typecheck` | `tsc -p tsconfig.json --noEmit`       |
| `test`      | `vitest run`                          |

Health check: `curl localhost:8080/health` → `{ ok, service, uptime, pushEnabled }`.

### ⚠️ Apple Silicon / macOS caveat — `dev` and `test` don't run here, prod does

The repo's pnpm overrides **strip the native esbuild / rollup binaries for
`arm64` + `darwin`** (they'd otherwise get baked into the lockfile). `tsx` (which
backs `dev`) and `vitest` (which backs `test`) both need those native binaries,
so on an Apple-Silicon Mac they fail with `Cannot find module
@rollup/rollup-darwin-arm64` / a missing `esbuild` binary. That's expected.

- **Tests** (`vitest run`) run on **Linux x64** — CI and the Oracle AMD/x64 VM —
  not on this Mac. The normalizer unit tests live in
  `src/normalize/__tests__/*.test.ts` (small inline ESPN fixtures; assert the
  scoreboard + match-detail DTO shape and the ported correctness fixes:
  winner-respects-shootout, no-premature-Final, derived accuracy %, lineup
  home/away resolution).
- **Production** is `pnpm build` (`tsc`) + `node dist/server.js`, which needs
  **neither** esbuild nor rollup — so the service builds and boots fine on any
  arch, including this Mac (`corepack pnpm --filter @matchcenter/api build &&
  node services/api/dist/server.js`).
- To actually run `dev`/`test`, use an x64 box (or CI) where the native binaries
  install cleanly.

## Deploy to an Oracle Cloud Always-Free VM (systemd)

Provision an Always-Free instance — use the **AMD micro / x64** shape so the
`dev`/`test` tooling and any native deps install cleanly (see the caveat above).

```bash
# 1. Node 20 LTS (NodeSource) + corepack
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential   # build-essential → better-sqlite3
sudo corepack enable

# 2. Get the code + a self-contained deploy of just this service.
#    `pnpm deploy` resolves the workspace catalog into concrete versions and
#    copies a standalone node_modules — no monorepo needed at runtime.
git clone <repo> matchcenter && cd matchcenter
corepack pnpm install
corepack pnpm --filter @matchcenter/api build
corepack pnpm --filter @matchcenter/api deploy --prod /opt/matchcenter-api

# 3. Dedicated unprivileged service account + config
sudo useradd --system --home-dir /opt/matchcenter-api --shell /usr/sbin/nologin matchcenter
sudo cp services/api/.env.example /opt/matchcenter-api/.env   # then edit secrets
sudo chown root:matchcenter /opt/matchcenter-api/.env && sudo chmod 0640 /opt/matchcenter-api/.env
sudo chown -R matchcenter:matchcenter /opt/matchcenter-api

# 4. Install the unit (checked in at services/api/deploy/) and start it
sudo cp services/api/deploy/matchcenter-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now matchcenter-api
sudo journalctl -u matchcenter-api -f          # structured pino logs
```

The unit ([`deploy/matchcenter-api.service`](deploy/matchcenter-api.service))
runs `node dist/server.js` as the `matchcenter` user with `Restart=always`, reads
secrets from the `EnvironmentFile` (`/opt/matchcenter-api/.env`), and gives the
push worker a writable `StateDirectory` (`/var/lib/matchcenter-api`) for its
SQLite registry — `WorkingDirectory` is read-only under `ProtectSystem=strict`,
so **the push worker must open its `*.sqlite` under `/var/lib/matchcenter-api`.**
`GET /health` is the liveness/readiness probe; point an uptime monitor or
load-balancer health check there (systemd itself just keeps the process alive).

Open the port so the app can reach it:

```bash
# OCI: add an ingress rule for TCP 8080 (or 443) in the VCN security list.
sudo ufw allow 8080/tcp
```

For TLS + a stable hostname, front it with **Caddy** (automatic HTTPS) or nginx
reverse-proxying `:8080` and proxying the `/live` WebSocket upgrade.

## Environment

See `.env.example`. Defaults are safe for **proxy-only** mode (REST + SSE + WS).
Two things you'll usually set in production:

| var | why |
| --- | --- |
| `API_TOKEN` | shared secret; the app sends it as `Authorization: Bearer …` on the push endpoints. Optional in dev (auth disabled when unset); **required in prod**. |
| `APNS_KEY_P8` / `APNS_KEY_ID` / `APNS_TEAM_ID` | enable the push worker. All three must be present or push stays off (`pushEnabled:false` on `/health`). |

`env.pushEnabled` is `true` **only** when all three `APNS_*` values are set;
`server.ts` guards `startPushWorker()` on it.

## APNs / Live-Activity push setup (the paid path)

Background Live-Activity updates + closed-app goal alerts go through **Apple Push
Notification service**, which requires a **paid Apple Developer Program
membership ($99/yr)** and an APNs **auth key (`.p8`)**. There is **no free
substitute** — Expo Push / FCM / OneSignal all relay through APNs and still need
*your* key for the bundle id. One-time setup:

1. **Enrol** in the Apple Developer Program and move the bundle id
   `com.sandeep.worldcup2026` to that paid team. Enable **Push Notifications**
   (and, for the widget, Live Activities via `NSSupportsLiveActivities`) on the
   App ID.
2. **Create the APNs auth key.** developer.apple.com → *Certificates,
   Identifiers & Profiles* → **Keys** → **+** → tick **Apple Push Notifications
   service (APNs)** → *Register* → **download `AuthKey_XXXXXXXXXX.p8`**. Apple
   lets you download it **once** — store it safely. Note the **Key ID** (the
   `XXXXXXXXXX`) and your **Team ID** (top-right of the membership page).
3. **Fill the env:**
   - `APNS_KEY_ID` = the 10-char Key ID.
   - `APNS_TEAM_ID` = your 10-char Team ID.
   - `APNS_BUNDLE_ID` = `com.sandeep.worldcup2026` (already the default).
   - `APNS_KEY_P8` = the **PEM contents** of the `.p8` (the
     `-----BEGIN PRIVATE KEY-----` … `-----END PRIVATE KEY-----` block).
   - `APNS_ENV` = `sandbox` for dev/Xcode builds, `production` for
     TestFlight / App Store. (The registry also stores the env **per device
     token** and routes each push to `api.sandbox.push.apple.com` vs
     `api.push.apple.com` accordingly — the classic "works in Xcode, breaks on
     TestFlight" trap.)

   **Multi-line key in a systemd `EnvironmentFile`:** the file is one
   `KEY=VALUE` per line and does **not** support multi-line values. Either put the
   PEM on a single line with literal `\n` between the base64 lines (the push
   worker turns `\n` back into newlines), e.g.

   ```dotenv
   APNS_KEY_P8=-----BEGIN PRIVATE KEY-----\nMIGT...\n...==\n-----END PRIVATE KEY-----\n
   ```

   …**or** drop `AuthKey_XXXX.p8` on disk (0600, owned by `matchcenter`) and have
   the worker read the file path instead.

Notes the push worker relies on (from the locked plan): the auth token is an
**ES256 JWT** signed with the `.p8`, cached and re-signed **~every 45 min**
(Apple rejects tokens >60 min old); the Live-Activity APNs **topic** is
`<bundleId>.push-type.liveactivity`; the `content-state` pushed to APNs is the
`LiveContentState` DTO and **must byte-match the Swift struct** or it decodes to
nothing. The on-device clock self-ticks via `Text(timerInterval:)` from
`startAt`+`paused`, so the server pushes **only on events**, never per second.

### Free fallback (no paid account): `BGTaskScheduler` — honest limits

If you **don't** buy the paid account, run this service in **proxy-only mode**
(leave the `APNS_*` vars blank) and the app degrades to two things:

- **Live while the app is open** — the existing Fastcast + REST poll + in-app
  local notifications. This already works and is unaffected.
- **`BGTaskScheduler` (Background App Refresh)** for occasional background
  catch-up: a `BGAppRefreshTask` that, when iOS decides to run it, fetches the
  match, updates the Live Activity locally, and fires a local notification on a
  score change.

**The catch:** iOS schedules `BGTaskScheduler` **at its own discretion —
typically 15 min to hours apart, throttled by how regularly you use the app —
and will not wake you every few minutes during a live match.** It's a "sometimes
catches up in the background" nicety, **not** reliable instant goal alerts.
Instant, closed-app Live-Activity/Dynamic-Island updates are **only** possible on
the paid APNs path above. (Full rationale in the locked push plan.)

## Notes for build agents

- ESM + `NodeNext`: relative imports **must** carry the `.js` extension.
- Import all DTOs/messages from `src/contract/schema.ts` and validate normalized
  output with `Schema.parse(...)` at the proxy boundary.
- `better-sqlite3` (push) needs a native build — the push agent must add it to
  `onlyBuiltDependencies` + `allowBuilds` in `pnpm-workspace.yaml`, and open its
  SQLite DB under the unit's writable `StateDirectory` (`/var/lib/matchcenter-api`).
- `@parse/node-apn` ships no types — add a small `*.d.ts` shim if needed.
