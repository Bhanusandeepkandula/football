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
  routes/index.ts      registerRoutes(app)      ← REST/proxy build agent
  live/ws.ts           attachWebSocket(server)  ← live-hub build agent
  live/poller.ts       startLivePoller()        ← live-hub build agent
  push/worker.ts       startPushWorker()        ← push build agent
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
| `typecheck` | `tsc --noEmit`                        |
| `test`      | `vitest run`                          |

Health check: `curl localhost:8080/health`.

## Deploy to an Oracle Cloud Always-Free VM (systemd)

Provision an Always-Free instance (the **AMD micro / x64** shape avoids the
ARM-only native-binary caveats below). Then:

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

# 3. Config
sudo install -d /opt/matchcenter-api
sudo cp services/api/.env.example /opt/matchcenter-api/.env   # then edit secrets
```

`/etc/systemd/system/matchcenter-api.service`:

```ini
[Unit]
Description=MatchCenter API (ESPN proxy + APNs push)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/matchcenter-api
EnvironmentFile=/opt/matchcenter-api/.env
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=3
# hardening
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/matchcenter-api
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now matchcenter-api
sudo journalctl -u matchcenter-api -f          # structured pino logs
```

Open the port so the app can reach it:

```bash
# OCI: add an ingress rule for TCP 8080 (or 443) in the VCN security list.
sudo ufw allow 8080/tcp
```

For TLS + a stable hostname, front it with **Caddy** (automatic HTTPS) or nginx
reverse-proxying `:8080` and proxying the `/live` WebSocket upgrade.

## Environment

See `.env.example`. Defaults are safe for proxy-only mode. Push starts **only**
when `APNS_KEY_P8` + `APNS_KEY_ID` + `APNS_TEAM_ID` are all set — which needs a
paid Apple Developer account and an APNs `.p8` key (see the push plan).

## Notes for build agents

- ESM + `NodeNext`: relative imports **must** carry the `.js` extension.
- Import all DTOs/messages from `src/contract/schema.ts` and validate normalized
  output with `Schema.parse(...)` at the proxy boundary.
- `better-sqlite3` (push) needs a native build — the push agent must add it to
  `onlyBuiltDependencies` + `allowBuilds` in `pnpm-workspace.yaml`.
- `@parse/node-apn` ships no types — add a small `*.d.ts` shim if needed.
