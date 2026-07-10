// GET /v1/:league/scoreboard → Scoreboard — a day's fixtures for a competition.
// Query: ?dates=YYYYMMDD or YYYYMMDD-YYYYMMDD (defaults to ESPN's "today").
import type { Hono } from 'hono';
import { z } from 'zod';

import { ScoreboardSchema } from '../contract/schema.js';
import {
  LeagueParamSchema,
  TTL,
  cached,
  defineRoute,
  espnFetch,
  parseParams,
  parseQuery,
  siteBase,
} from './_lib.js';
import { leagueRef } from './_leagues.js';
import { toMatchSummary } from './_normalize.js';

const QuerySchema = z.object({
  dates: z
    .string()
    .regex(/^\d{8}(-\d{8})?$/, 'dates must be YYYYMMDD or YYYYMMDD-YYYYMMDD')
    .optional(),
});

// ESPN's `season.type` is sometimes a bare number and sometimes an object
// ({ type, name, ... }); `season.name`/`displayName` may also carry the label.
interface EspnSeason {
  year?: number;
  type?: number | { type?: number; name?: string };
  name?: string;
  displayName?: string;
}

interface EspnScoreboard {
  events?: unknown[];
  leagues?: { name?: string; abbreviation?: string; season?: EspnSeason }[];
}

function normalizeSeason(raw: EspnSeason | undefined): { year: number; type?: number; name?: string } | undefined {
  if (!raw || typeof raw.year !== 'number') return undefined;
  const type =
    typeof raw.type === 'number'
      ? raw.type
      : typeof raw.type === 'object' && typeof raw.type?.type === 'number'
        ? raw.type.type
        : undefined;
  const name =
    (typeof raw.type === 'object' ? raw.type?.name : undefined) ?? raw.name ?? raw.displayName;
  return { year: raw.year, type, name };
}

export function registerScoreboard(app: Hono): void {
  app.get(
    '/v1/:league/scoreboard',
    defineRoute(async (c) => {
      const { league } = parseParams(c, LeagueParamSchema);
      const { dates } = parseQuery(c, QuerySchema);

      return cached(`scoreboard:${league}:${dates ?? 'today'}`, TTL.scoreboard, async () => {
        const url = dates
          ? `${siteBase(league)}/scoreboard?dates=${dates}`
          : `${siteBase(league)}/scoreboard`;
        const data = await espnFetch<EspnScoreboard>(url);

        const espnLeague = data?.leagues?.[0] ?? null;
        const ref = leagueRef(league, espnLeague);
        const matches = (data?.events ?? []).map((ev) => toMatchSummary(ev, ref));

        return ScoreboardSchema.parse({
          league: ref,
          date: dates ?? undefined,
          season: normalizeSeason(espnLeague?.season),
          matches,
        });
      });
    }),
  );
}
