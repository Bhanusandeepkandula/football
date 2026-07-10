# Ship-to-App-Store Plan — Match Center

Master roadmap to resolve the 72 audit findings and publish with confidence.
Source of findings: the audit report (interactive copy at `~/Downloads/app-audit.html`).

**Architecture decision:** a single backend service in this monorepo —
`services/api` — that owns ALL upstream data and exposes a stable contract to the
app over **REST + SSE (live) + WebSocket**, plus the push/Live-Activity worker.
The app stops talking to ESPN/Polymarket directly. Stack: **Node + Hono** for
REST/SSE, `ws` for the WS server + the Fastcast client, `zod` contracts, in-memory
TTL cache with coalescing; **push** per the locked plan below — `@parse/node-apn`
(APNs .p8) + `better-sqlite3` registry.
**Deploy target: Oracle Cloud Always-Free VM** (Node 20+ under `systemd`), per the
push-backend plan `~/.claude/plans/tingly-sauteeing-pebble.md`.

> The push half of M2 follows `tingly-sauteeing-pebble.md` verbatim (locked
> decisions: Oracle VM host; `ws`+`@parse/node-apn`+`better-sqlite3`; Fastcast
> ingester ported from `lib/fastcast.ts`; APNs .p8 JWT; local widget clock via
> `Text(timerInterval:)`). **Hard gate:** background push/Live-Activity updates
> require a **paid Apple Developer account + APNs .p8 key** — no free path exists;
> the free fallback is `BGTaskScheduler` (unreliable, documented in that plan).

Legend — who: 🤖 = agents can do it fully · 🔑 = needs your account/credentials/decision.

---

## Milestone 1 — Backend foundation (RUNNING NOW, 🤖)
The linchpin. Fixes the whole "Data & Reliability" + rate-limit + no-cache cluster.
- `services/api` package wired into the pnpm workspace.
- Upstream client with **AbortController timeouts** + **request coalescing** + **short-TTL cache** (one upstream fetch serves all users).
- **Normalizers** ESPN → stable schema (scoreboard, match detail, standings, team, bracket, news) — validated with `zod` at the boundary (kills the `any` blast radius).
- **REST**: `/v1/scoreboard`, `/v1/matches/:id`, `/v1/standings`, `/v1/teams/:id`, `/v1/brackets/:slug`, `/v1/news`, `/health`.
- **Live**: upstream poller → **SSE** `/v1/live/stream` + **WS** `/v1/live/ws` broadcasting score/state diffs. Polymarket used only as an ESPN-corroborated accelerator, never source-of-truth for `Final`.
- Season derived per-competition (fixes the Aug–May heuristic bug); bracket via season/type/round.
- Normalizer unit tests with recorded fixtures. Boot smoke test.
> Resolves: undocumented-scraping, on-device fan-out, no timeouts, season heuristic, bracket scan, silent blank sections, premature Final, live-overlay key, `any` boundary, duplicated http helpers/sockets (now server-side).

## Milestone 2 — Push & Live Activity backend (🤖 build · 🔑 APNs)
- Expo push-token registry (`/v1/push/register`) + subscription store (SQLite/Postgres).
- Event-diff worker: reuses the M1 poller, diffs goals/cards/HT/FT, sends via Expo Push API.
- Live Activity **remote** updates (`pushType: .token`) via APNs.
- 🔑 You: Apple Developer account, **APNs auth key (.p8)**, enable Push for the bundle id.
> Resolves: the #1 critical — closed-app live alerts + frozen Live Activity.

## Milestone 3 — App → backend migration (🤖)
- Repoint every hook (`useWorldCup`, `useMatchDetail`, `useTeamDetail`, standings, bracket, news) at `services/api`.
- Delete direct ESPN/Polymarket/Fastcast client code + the `_activeSlug` global; slug becomes an explicit param.
- Live scores over SSE with WS fallback. Add `EXPO_PUBLIC_API_URL`.
> Resolves: architecture/global-state, UA-spoofing/ToS on device, per-device sockets.

## Milestone 4 — Offline & resilience (🤖)
- Persist React Query to disk (`persistQueryClient` + AsyncStorage/MMKV).
- Wire `NetInfo` → `onlineManager`; `focusManager` ↔ AppState; `refetchOnReconnect`.
- `CrestImage` on **expo-image** (memory-disk cache, downsized crests, initials fallback) everywhere.
- Aggregated error state for the "All" feed; per-section retry; sane retry policy.
> Resolves: cold-start blocks, no connectivity detection, image cache, stale-on-resume, blank/empty states.

## Milestone 5 — App Store compliance (🤖 build · 🔑 hosting)
- **Strip** unused camera/mic/photo/Always-location permission keys (guaranteed-rejection fix).
- `aps-environment` entitlement + `expo-notifications` plugin registration.
- Source attribution labels + report/hide control on UGC feeds; stop RSS UA-spoofing (headline+link out).
- 🔑 You: host a **privacy policy + terms** URL (I'll write the copy); confirm data-license posture.
> Resolves: no-privacy-URL, over-broad permissions, UGC attribution, no push entitlement.

## Milestone 6 — Build & release infra (🤖 build · 🔑 accounts)
- `eas.json` (dev/preview/prod), `expo-updates` OTA channels, build-number autoincrement.
- Wire **Sentry** (`beforeSend` PII scrub); `.env.example` + build-time env assertions; remove deprecated `expo-av`.
- **CI**: GitHub Actions — typecheck + tests on PRs, EAS build/submit on tags.
- Android: real `package`, adaptive icon, notification channel (or explicitly scope v1 to iOS).
- 🔑 You: `eas login`/`eas init` (mints projectId), App Store Connect app record, EAS secrets.
> Resolves: no-EAS/OTA, crash reporting, CI, env contract, expo-av, Android stub.

## Milestone 7 — Code quality & tests (🤖)
- Split the 1,526-line `useMatchDetail` god-module (now thinner post-migration).
- Typed `router.push` (drop `as any`); shared `lib/http`; per-route error boundaries.
- `jest-expo` + `@testing-library/react-native`; parser/matcher fixtures; smoke render per screen.
> Resolves: god-module, typed-routes, error-boundary scope, zero-tests.

## Milestone 8 — Accessibility (🤖)
- Labels/roles on icon-only buttons; `useReducedMotion`; **contrast fixes** (partly done); `maxFontSizeMultiplier` + min-height (Dynamic Type); live regions for score/minute; 44×44 targets; grouped card focus; RTL via logical props.
> Resolves: all 10 a11y findings.

## Milestone 9 — Features & polish (🤖 · 🔑 product calls)
- Global search; **For You/Following** surface; onboarding "pick your teams"; wire `shareMatch()` + deep links; notification-prefs matrix; rename "Bracket"→"Standings"; native `expo-video` Shorts + re-enable; WidgetKit widget; deeper settings.
> Resolves: the UX/feature-gap cluster.

---

## What I need from you (the 🔑 gates)
1. **Apple Developer** account → APNs `.p8` auth key + push capability (M2, M5).
2. **`eas login`** on your Expo account (mints projectId) + App Store Connect app record (M6).
3. A place to **host the privacy policy** (I'll draft it) — even a GitHub Pages URL works (M5).
4. **Data posture:** ship on the proxy-over-ESPN approach for v1 (free, faster) vs. budget a licensed feed (Sportradar/Opta) for durability. Default: proxy-over-ESPN now, license later (M1).
5. **Backend hosting:** Replit deploy is fine to start; confirm or name another (M1/M3).

Everything else is 🤖 and runs as background agent workflows, milestone by milestone.
