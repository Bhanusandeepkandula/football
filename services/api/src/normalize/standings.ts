// ─── Standings normalizer ─────────────────────────────────────────────────────
// Turns ESPN's unified standings payload (site.web.api `/{slug}/standings`) into
// the shared `Standings` DTO. One endpoint returns either a single table (league)
// or one child per group (cup/tournament); teams are inlined and every entry
// carries a `note` we surface as the qualification colour. Malformed upstream
// data can never reach the client — the output is `StandingsSchema.parse`d.

import { z } from 'zod';
import {
  StandingsSchema,
  type LeagueRef,
  type Standings,
  type StandingsEntry,
  type StandingsGroup,
  type StandingStat,
  type Team,
} from '../contract/schema.js';

// ── Permissive raw shapes (everything optional; the OUTPUT parse is the guard) ─
const RawStatSchema = z.object({
  name: z.string().optional(),
  type: z.string().optional(),
  abbreviation: z.string().optional(),
  value: z.union([z.number(), z.string()]).optional(),
  displayValue: z.union([z.number(), z.string()]).optional(),
});
type RawStat = z.infer<typeof RawStatSchema>;

const RawTeamSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  displayName: z.string().optional(),
  name: z.string().optional(),
  shortDisplayName: z.string().optional(),
  abbreviation: z.string().optional(),
  logo: z.string().optional(),
  logos: z.array(z.object({ href: z.string().optional() })).optional(),
  color: z.string().optional(),
  alternateColor: z.string().optional(),
});
type RawTeam = z.infer<typeof RawTeamSchema>;

const RawEntrySchema = z.object({
  team: RawTeamSchema.optional(),
  stats: z.array(RawStatSchema).optional(),
  note: z.object({ color: z.string().optional(), description: z.string().optional() }).optional(),
});
type RawEntry = z.infer<typeof RawEntrySchema>;

const RawStandingsBlockSchema = z.object({ entries: z.array(RawEntrySchema).optional() });

const RawGroupSchema = z.object({
  name: z.string().optional(),
  abbreviation: z.string().optional(),
  standings: RawStandingsBlockSchema.optional(),
});

const RawStandingsSchema = z.object({
  name: z.string().optional(),
  abbreviation: z.string().optional(),
  children: z.array(RawGroupSchema).optional(),
  standings: RawStandingsBlockSchema.optional(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function toNumber(v: number | string | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toDisplay(v: number | string | undefined): string {
  return v != null ? String(v) : '';
}

function toTeam(raw: RawTeam | undefined): Team {
  const logo = raw?.logos?.find((l) => l.href)?.href ?? raw?.logo ?? '';
  return {
    id: raw?.id != null ? String(raw.id) : '',
    name: raw?.displayName ?? raw?.name ?? '',
    shortName: raw?.shortDisplayName ?? undefined,
    abbreviation: raw?.abbreviation ?? '',
    logo,
    color: raw?.color ?? undefined,
    alternateColor: raw?.alternateColor ?? undefined,
  };
}

// Find a stat by any of its ESPN aliases, matching name / type / abbreviation
// case-insensitively (the same table is keyed differently across ESPN hosts).
function findStat(stats: RawStat[], ...names: string[]): RawStat | undefined {
  const want = new Set(names.map((n) => n.toLowerCase()));
  return stats.find((s) =>
    [s.name, s.type, s.abbreviation].some((k) => k != null && want.has(k.toLowerCase())),
  );
}

function toStandingStats(stats: RawStat[]): StandingStat[] {
  return stats.map((s) => ({
    name: s.name ?? s.type ?? s.abbreviation ?? '',
    value: toNumber(s.value),
    displayValue: s.displayValue != null ? String(s.displayValue) : toDisplay(s.value),
  }));
}

function toEntry(e: RawEntry): StandingsEntry {
  const stats = e.stats ?? [];
  const gd = findStat(stats, 'pointDifferential', 'pointdifferential', 'goalDifference');
  return {
    team: toTeam(e.team),
    rank: toNumber(findStat(stats, 'rank')?.value),
    gamesPlayed: toNumber(findStat(stats, 'gamesPlayed', 'gamesplayed')?.value),
    wins: toNumber(findStat(stats, 'wins')?.value),
    draws: toNumber(findStat(stats, 'ties', 'draws')?.value),
    losses: toNumber(findStat(stats, 'losses')?.value),
    goalsFor: toNumber(findStat(stats, 'pointsFor', 'pointsfor')?.value),
    goalsAgainst: toNumber(findStat(stats, 'pointsAgainst', 'pointsagainst')?.value),
    goalDifference: gd?.displayValue != null ? String(gd.displayValue) : toDisplay(gd?.value) || '0',
    points: toNumber(findStat(stats, 'points')?.value),
    qualificationColor: e.note?.color ?? undefined,
    qualificationNote: e.note?.description ?? undefined,
    stats: toStandingStats(stats),
  };
}

/**
 * Normalize an ESPN standings payload → `Standings`.
 *
 * @param raw    the parsed JSON from site.web.api `/{slug}/standings?season=YYYY`
 * @param league the competition ref to embed
 * @param season the season year the caller requested (echoed back)
 */
export function normalizeStandings(raw: unknown, league: LeagueRef, season?: number): Standings {
  const parsed = RawStandingsSchema.safeParse(raw);
  const data = parsed.success ? parsed.data : {};

  // Either a set of group children, or a single flat table under `standings`.
  const rawGroups =
    data.children && data.children.length > 0
      ? data.children
      : data.standings
        ? [{ name: data.name, abbreviation: data.abbreviation, standings: data.standings }]
        : [];

  const groups: StandingsGroup[] = rawGroups
    .map((child): StandingsGroup | null => {
      const entries = (child.standings?.entries ?? []).map(toEntry);
      if (entries.length === 0) return null;
      entries.sort((a, b) => (a.rank || 99) - (b.rank || 99));
      return {
        name: child.name ?? '',
        abbreviation: child.abbreviation ?? child.name ?? '',
        entries,
      };
    })
    .filter((g): g is StandingsGroup => g != null);

  return StandingsSchema.parse({ league, season: season ?? undefined, groups });
}
