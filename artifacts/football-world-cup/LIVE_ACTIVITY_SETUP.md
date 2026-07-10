# Live Activities & Dynamic Island — setup

Live match score in the Lock Screen Live Activity and the Dynamic Island. This is
**native iOS** and **cannot run in Expo Go** — you need a dev build or EAS build.
The JS side already degrades to no-ops until the native module is present, so the
app keeps working everywhere else untouched.

## What's already scaffolded

| Piece | Path | Role |
|---|---|---|
| JS API | `lib/liveActivity.ts` | `start/update/end`, graceful no-op fallback |
| Driver hook | `hooks/useMatchLiveActivity.ts` | mirrors a live match → activity; wired in `app/match/[id].tsx` |
| Bridge module | `modules/live-activity/` | Expo module calling ActivityKit (`Activity.request/update/end`) |
| Widget extension | `targets/widget/` | SwiftUI Lock Screen + Dynamic Island UI |
| Config | `app.json` | `NSSupportsLiveActivities: true` + `@bacons/apple-targets` plugin |

## Prerequisites

- Apple Developer account (Live Activities need a real provisioning profile).
- Xcode 15+, an iOS **16.2+** device/simulator (Dynamic Island needs iPhone 14 Pro+ / 15 Pro+).
- Not Expo Go.

## Steps

1. **Add the targets plugin dev-dependency, THEN register the plugin:**
   ```bash
   pnpm add -D @bacons/apple-targets
   ```
   Only *after* it's installed, add `"@bacons/apple-targets"` to `expo.plugins`
   in `app.json`. ⚠️ Do NOT add the plugin line before installing the package —
   Expo fails to resolve it at startup and the app won't boot (even in Expo Go).
   It was intentionally left out of `app.json` for exactly this reason.

2. **Prebuild** (generates the iOS project, the widget target, and links the module):
   ```bash
   npx expo prebuild -p ios --clean
   ```

3. **Build & run** on a device or simulator:
   ```bash
   npx expo run:ios        # local
   # or: eas build -p ios --profile development
   ```

4. In Xcode, confirm the **MatchWidget** extension target exists and that both
   `MatchActivityAttributes.swift` copies compile (app target + widget target).

## How it drives

`app/match/[id].tsx` calls `useMatchLiveActivity(data, live.minute, homeColor, awayColor)`.
When a match `isLive`, it starts an activity; score/clock changes push updates; it
ends on full-time or when you leave the screen. On anything but a native iOS build
with the module, every call is a no-op.

## ⚠️ Keep the two attributes files in sync

`modules/live-activity/ios/MatchActivityAttributes.swift` and
`targets/widget/MatchActivityAttributes.swift` **must stay byte-identical** —
ActivityKit matches the app and widget by the struct's shape. If they drift,
updates silently stop rendering.

## Not verified here

The Swift/ActivityKit code was scaffolded but **not compiled** in this environment
(no Xcode). Expect to iterate on the SwiftUI layout and fix any build nits on your
first `expo run:ios`. The JS side *is* typechecked and safe to ship as-is.
