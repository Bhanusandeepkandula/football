---
name: ESPN soccer data sources & CORS
description: Where fifa.world groups/bracket/teams data actually lives, and which ESPN hosts send CORS headers (matters for web preview of native apps).
---

# ESPN fifa.world data sourcing

**Why:** The public `/standings` site endpoint is EMPTY for fifa.world, and the
default scoreboard returns only the current day's matches — both make screens
look "dummy". The real data lives elsewhere.

## Where the data is
- **Group standings**: core API, one resource per group (12 groups):
  `sports.core.api.espn.com/v2/sports/soccer/leagues/fifa.world/seasons/{year}/types/1/groups/{1-12}/standings/0`.
  Entries reference teams only by `team.$ref` (extract id via `/teams/(\d+)/`);
  stat names are `gamesPlayed/wins/ties/losses/pointsFor/pointsAgainst/pointDifferential/points/rank`.
  Group id 1→"Group A". No single combined endpoint (season-type `/standings`
  just refs back to per-group).
- **Full bracket / all matches**: site scoreboard needs an explicit date range,
  e.g. `.../scoreboard?dates=20260611-20260719&limit=400` → all 104 events. The
  default (no dates) returns ~2. Classify rounds by `event.season.slug`:
  `group-stage, round-of-32, round-of-16, quarterfinals, semifinals, 3rd-place-match, final`.
- **Team detail**: `/teams/{id}`, `/teams/{id}/roster` (flat `athletes[]` with
  `jersey/position.abbreviation/age`, plus `coach[]`), `/teams/{id}/schedule`
  (`events[]` with `seasonType.name` for round label).

## CORS (critical for web preview)
**Why:** This is an Expo *native* app (runs in Expo Go on a phone, no CORS), but
the Replit web preview is a browser and IS subject to CORS.
- `site.api.espn.com/.../teams` and `/roster` send **NO** CORS headers → blocked
  in web preview (native works fine).
- `.../scoreboard` and all `sports.core.api.espn.com` endpoints send
  `access-control-allow-origin: *` → work in web preview.

**How to apply:** When a screen must render in the web preview, source team
name/logo/abbr from the scoreboard competitors (covers all 48 nations) instead
of `/teams`. Roster has no CORS-friendly alternative, so team-detail squad is
native-only in preview — that's acceptable, not a bug.
