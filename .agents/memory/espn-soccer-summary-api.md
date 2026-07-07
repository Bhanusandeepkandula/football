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

**Why:** cost a full debug cycle — the match-detail screen rendered its hero but empty tabs because the parser read `boxscore.players`/`plays`.

**How to apply:** any ESPN soccer detail parsing must use `rosters`/`keyEvents`/`boxscore.teams`. Resolve home/away from `rosters[].homeAway` first, then team-id match, then preserve roster order (index 0 = home) — never default-flip to index 1.
