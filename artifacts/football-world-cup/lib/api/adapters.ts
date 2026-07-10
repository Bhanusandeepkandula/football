// ─── Backend DTO → app (ESPN-shaped) adapters ────────────────────────────────
// The app's screens were written against ESPN's native JSON shapes (see the
// EspnEvent / EspnTeam / EspnStandingEntry / EspnFullTeam contract in
// hooks/useWorldCup). The @matchcenter/api backend returns normalized DTOs
// instead, so every repointed data hook adapts the backend shape back into the
// app contract HERE.
//
// SINGLE SOURCE OF TRUTH — cache parity: useScoreboard, useUpcomingMatches,
// useBracket (hooks/useWorldCup) and useMultiLeagueScoreboard (hooks/useMultiLeague)
// all share React-Query cache keys (e.g. ['scoreboard', slug, dates]). Any two
// producers for the same key MUST emit a byte-identical object, so they all
// import `matchSummaryToEspnEvent` from HERE rather than re-implementing the
// mapping. Do NOT fork this logic into a hook — useWorldCup re-exports these so
// its public surface is unchanged, but the definitions live only in this file.

import type { MatchSummary, StandingsEntry, Team as ApiTeam } from './types';
import type {
  EspnEvent,
  EspnFullTeam,
  EspnStandingEntry,
  EspnTeam,
} from '@/hooks/useWorldCup';

/** A backend `Team` (list / summary shape) → the ESPN competitor team shape. */
export function sideToEspnTeam(t: ApiTeam): EspnTeam {
  return {
    id: String(t.id ?? ''),
    displayName: t.name,
    abbreviation: t.abbreviation,
    logo: t.logo,
    color: t.color,
    alternateColor: t.alternateColor,
  };
}

/**
 * A backend `MatchSummary` (scoreboard / upcoming / bracket) → an `EspnEvent`.
 *
 * The status mapping keeps the exported helpers (isLive/isFinished/
 * getStatusLabel/getResultSuffix/getGroupLabel …) working unchanged:
 *   • status.type.name      ← status.name  (raw ESPN name, e.g. STATUS_IN_PROGRESS)
 *   • status.type.completed ← status.isFinished
 *   • status.displayClock   ← status.clock (running clock text, e.g. "63'")
 *   • competitions[0].notes ← round        (so getGroupLabel resolves the round)
 *
 * `status.name` is optional on the wire, so a sane fallback is derived from the
 * state bucket if it's ever missing (shouldn't happen for live/finished games).
 */
export function matchSummaryToEspnEvent(m: MatchSummary): EspnEvent {
  const { home, away, status } = m;
  const statusName =
    status.name ??
    (status.isLive
      ? 'STATUS_IN_PROGRESS'
      : status.isFinished
        ? 'STATUS_FULL_TIME'
        : 'STATUS_SCHEDULED');

  return {
    id: m.id,
    date: m.date,
    // name/shortName are synthesized (unused by scoreboard consumers, but the
    // EspnEvent contract requires them).
    name: `${home.team.name} vs ${away.team.name}`,
    shortName: `${home.team.abbreviation} v ${away.team.abbreviation}`,
    season: undefined,
    status: {
      displayClock: status.clock,
      period: status.period,
      type: {
        id: '',
        name: statusName,
        description: statusName,
        detail: status.detail,
        shortDetail: status.detail,
        completed: status.isFinished,
      },
    },
    competitions: [
      {
        id: m.id,
        competitors: [
          {
            homeAway: 'home',
            team: sideToEspnTeam(home.team),
            score: home.score,
            shootoutScore: home.shootoutScore ?? m.shootout?.home,
            winner: home.winner,
            records: home.record ? [{ summary: home.record }] : undefined,
          },
          {
            homeAway: 'away',
            team: sideToEspnTeam(away.team),
            score: away.score,
            shootoutScore: away.shootoutScore ?? m.shootout?.away,
            winner: away.winner,
            records: away.record ? [{ summary: away.record }] : undefined,
          },
        ],
        venue: m.venue
          ? { fullName: m.venue, address: m.city ? { city: m.city, country: '' } : undefined }
          : undefined,
        // round → notes[{type:'event',headline}] so getGroupLabel() returns the
        // round without needing season.slug.
        notes: m.round ? [{ type: 'event', headline: m.round }] : undefined,
        broadcast: undefined,
      },
    ],
    links: [],
  };
}

/** A backend `StandingsEntry` → an `EspnStandingEntry` (rebuilds the stats[] array). */
export function toEspnStandingEntry(e: StandingsEntry): EspnStandingEntry {
  // The backend flattens the table columns onto the entry and only optionally
  // echoes a raw stats[]. Prefer the passthrough when present, else reconstruct
  // the exact stat names GroupTable looks up (gamesplayed/wins/ties/losses/
  // pointsfor/pointsagainst/pointdifferential/points/rank).
  const stats: EspnStandingEntry['stats'] =
    e.stats && e.stats.length
      ? e.stats.map((s) => ({
          name: s.name,
          value: Number(s.value ?? 0),
          displayValue: s.displayValue ?? String(s.value ?? ''),
        }))
      : [
          { name: 'rank', value: e.rank, displayValue: String(e.rank) },
          { name: 'gamesplayed', value: e.gamesPlayed, displayValue: String(e.gamesPlayed) },
          { name: 'wins', value: e.wins, displayValue: String(e.wins) },
          { name: 'ties', value: e.draws, displayValue: String(e.draws) },
          { name: 'losses', value: e.losses, displayValue: String(e.losses) },
          { name: 'pointsfor', value: e.goalsFor, displayValue: String(e.goalsFor) },
          { name: 'pointsagainst', value: e.goalsAgainst, displayValue: String(e.goalsAgainst) },
          { name: 'pointdifferential', value: Number(e.goalDifference), displayValue: e.goalDifference },
          { name: 'points', value: e.points, displayValue: String(e.points) },
        ];

  return {
    team: {
      id: String(e.team.id ?? ''),
      displayName: e.team.name,
      abbreviation: e.team.abbreviation,
      logo: e.team.logo,
      color: e.team.color,
    },
    stats,
    note:
      e.qualificationColor || e.qualificationNote
        ? { color: e.qualificationColor, description: e.qualificationNote }
        : undefined,
  };
}

/** A backend `Team` → the ESPN full-team shape used by the teams grid. */
export function toEspnFullTeam(t: ApiTeam): EspnFullTeam {
  return {
    id: String(t.id ?? ''),
    uid: '', // not returned by the backend teams list
    displayName: t.name,
    shortDisplayName: t.shortName ?? t.name,
    abbreviation: t.abbreviation,
    logos: [{ href: t.logo }],
    color: t.color,
    alternateColor: t.alternateColor,
    location: undefined, // not returned by the backend teams list
  };
}
