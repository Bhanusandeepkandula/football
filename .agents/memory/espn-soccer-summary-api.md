---
name: ESPN soccer summary API shape
description: Where lineups/events/stats actually live in ESPN's fifa.world /summary response (not where you'd expect)
---

# ESPN soccer `/summary?event={id}` response shape

Endpoint: `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event={id}` (public, no key).

**The trap:** the obvious keys are empty. `boxscore.players` = `[]` and `plays` = `[]` even for a live/finished match. Reading those yields blank lineups/events and looks like "nothing loads."

**Where the data actually is:**
- **Lineups → `data.rosters[]`** (one per team). Each has `homeAway`, `team` (id, displayName, `logos[].href`, color), `formation` (a **string** like `"4-1-3-2"`, GK excluded), and `roster[]`. Each roster player: `starter`, `jersey`, `formationPlace` (1 = GK), `stats[]`, and `athlete` (id, displayName, shortName, optional `headshot.href`). **There is NO position field** — derive GK/DF/MF/FW from `formation` + `formationPlace`: place 1 = GK, first formation line = DF, last = FW, middle = MF.
- **Events → `data.keyEvents[]`**. Each has `type.text`/`type.type` (e.g. "Goal - Header"/"goal---header", "Penalty - Saved", "Kickoff", "Halftime"), `clock.displayValue`, `period.number`, `scoringPlay`, `team.{id,displayName}`, and for goals `participants[0].athlete.displayName` (scorer). Filter out kickoff/delay/halftime.
- **Stats → `data.boxscore.teams[].statistics[]`** (this one IS populated). Names are ESPN-specific: `foulsCommitted`, `wonCorners`, `totalPasses`/`accuratePasses`/`passPct`, `totalTackles`, `possessionPct`, `totalShots`, `shotsOnTarget`, `offsides`, `saves`, `yellow/redCards`, `interceptions`. NOT `fouls`/`corners`/`tackles`.

**Team crest field differs by endpoint:** in `/summary`, the header competitor team exposes `team.logos[].href` — there is **NO** `team.logo` scalar (it's `undefined`). But the `scoreboard` and core-API team objects DO have a `team.logo` scalar. So the same app can correctly read `team.logo` for the match list/bracket/groups yet get blank flags (color-circle fallback) on the match-detail hero. Use `team.logos?.[0]?.href ?? team.logo`.

**Match meta lives in `data.gameInfo`:** `gameInfo.attendance` (number), `gameInfo.officials[]` (find `position.name === 'Referee'` → `displayName`), and `gameInfo.venue.{fullName,address.city}` (the `header.competitions[0].venue` is often `undefined`, so fall back to `gameInfo.venue`). Round/stage name is `data.header.season.name` (e.g. "2026 FIFA World Cup, Group Stage" — strip the `"YYYY FIFA World Cup, "` prefix).

**Why:** cost a full debug cycle — the match-detail screen rendered its hero but empty tabs because the parser read `boxscore.players`/`plays`; and later the hero showed plain color circles instead of flags because it read the non-existent `team.logo` scalar instead of `team.logos[]`.

**How to apply:** any ESPN soccer detail parsing must use `rosters`/`keyEvents`/`boxscore.teams`. Resolve home/away from `rosters[].homeAway` first, then team-id match, then preserve roster order (index 0 = home) — never default-flip to index 1.

**Penalty shootouts / extra time:** a shootout result lives in `competitor.shootoutScore` (a number) on BOTH the scoreboard competitor and the `/summary` header competitor; regulation score stays in `competitor.score` (level, e.g. 1–1). Finished-on-pens status is `status.type.name === 'STATUS_FINAL_PEN'` (detail "FT-Pens"); the live shootout is `STATUS_SHOOTOUT`. Winner must be decided by `shootoutScore` when regulation ended level. **Do NOT rely on `status.period` to detect extra time in `/summary`** — it came back `undefined` for a finished pen match; use the status name instead (scoreboard events do carry `status.period`).
