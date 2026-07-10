// GET /v1/:league/standings → Standings — league table / group tables.
// Query: ?season=YYYY (defaults to the competition's current season).
import type { Hono } from 'hono';
import { z } from 'zod';

import type { StandingStat, StandingsEntry, StandingsGroup } from '../contract/schema.js';
import { StandingsSchema } from '../contract/schema.js';
import {
  LeagueParamSchema,
  TTL,
  cached,
  defineRoute,
  espnFetch,
  getLeagueSeason,
  parseParams,
  parseQuery,
  webBase,
} from './_lib.js';
import { leagueRef } from './_leagues.js';

const QuerySchema = z.object({
  season: z.coerce.number().int().gt(2000).optional(),
});

/* eslint-disable @typescript-eslint/no-explicit-any */
function statByName(entry: any, ...names: string[]): any | undefined {
  const stats: any[] = entry?.stats ?? [];
  return stats.find((s) => names.includes(s?.name) || names.includes(s?.type));
}

function numStat(entry: any, ...names: string[]): number {
  const s = statByName(entry, ...names);
  return s ? Number(s.value ?? 0) || 0 : 0;
}

function dispStat(entry: any, fallback: string, ...names: string[]): string {
  const s = statByName(entry, ...names);
  if (!s) return fallback;
  return String(s.displayValue ?? s.value ?? fallback);
}

function toEntry(raw: any): StandingsEntry {
  const tm = raw?.team ?? {};
  const stats: StandingStat[] = (raw?.stats ?? [])
    .filter((s: any) => s?.name)
    .map((s: any) => ({
      name: String(s.name),
      value: Number(s.value ?? 0) || 0,
      displayValue: String(s.displayValue ?? s.value ?? ''),
    }));
  return {
    team: {
      id: String(tm.id ?? ''),
      name: tm.displayName ?? tm.name ?? '',
      shortName: tm.shortDisplayName ?? undefined,
      abbreviation: tm.abbreviation ?? '',
      logo: tm.logos?.[0]?.href ?? tm.logo ?? '',
      color: tm.color ?? undefined,
      alternateColor: tm.alternateColor ?? undefined,
    },
    rank: numStat(raw, 'rank'),
    gamesPlayed: numStat(raw, 'gamesplayed'),
    wins: numStat(raw, 'wins'),
    draws: numStat(raw, 'ties', 'draws'),
    losses: numStat(raw, 'losses'),
    goalsFor: numStat(raw, 'pointsfor'),
    goalsAgainst: numStat(raw, 'pointsagainst'),
    goalDifference: dispStat(raw, '0', 'pointdifferential'),
    points: numStat(raw, 'points'),
    qualificationColor: raw?.note?.color ?? undefined,
    qualificationNote: raw?.note?.description ?? undefined,
    stats: stats.length > 0 ? stats : undefined,
  };
}

interface EspnStandings {
  name?: string;
  abbreviation?: string;
  standings?: { entries?: any[] };
  children?: {
    name?: string;
    abbreviation?: string;
    standings?: { entries?: any[] };
  }[];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function registerStandings(app: Hono): void {
  app.get(
    '/v1/:league/standings',
    defineRoute(async (c) => {
      const { league } = parseParams(c, LeagueParamSchema);
      const { season: seasonQuery } = parseQuery(c, QuerySchema);

      const season = seasonQuery ?? (await getLeagueSeason(league));

      return cached(`standings:${league}:${season}`, TTL.standings, async () => {
        const data = await espnFetch<EspnStandings>(
          `${webBase(league)}/standings?season=${season}`,
        );

        const rawChildren = data?.children?.length
          ? data.children
          : data?.standings
            ? [{ name: data.name, abbreviation: data.abbreviation, standings: data.standings }]
            : [];

        const groups: StandingsGroup[] = rawChildren
          .map((child): StandingsGroup | null => {
            const entries = (child?.standings?.entries ?? []).map(toEntry);
            if (entries.length === 0) return null;
            entries.sort((a, b) => (a.rank || 99) - (b.rank || 99));
            return {
              name: child?.name ?? '',
              abbreviation: child?.abbreviation ?? child?.name ?? '',
              entries,
            };
          })
          .filter((g): g is StandingsGroup => g != null);

        return StandingsSchema.parse({ league: leagueRef(league), season, groups });
      });
    }),
  );
}
