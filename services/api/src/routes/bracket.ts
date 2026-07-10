// GET /v1/:league/bracket → Bracket — knockout rounds for a competition.
// Query: ?season=YYYY (defaults to the competition's current season).
import type { Hono } from 'hono';
import { z } from 'zod';

import type { BracketRound } from '../contract/schema.js';
import { BracketSchema } from '../contract/schema.js';
import {
  LeagueParamSchema,
  TTL,
  cached,
  defineRoute,
  espnFetch,
  getLeagueSeason,
  parseParams,
  parseQuery,
  siteBase,
} from './_lib.js';
import { leagueRef } from './_leagues.js';
import { NON_KNOCKOUT_SLUGS, prettifyRound, toMatchSummary } from './_normalize.js';

const QuerySchema = z.object({
  season: z.coerce.number().int().gt(2000).optional(),
});

interface EspnScoreboard {
  events?: unknown[];
  leagues?: { name?: string; abbreviation?: string }[];
}

export function registerBracket(app: Hono): void {
  app.get(
    '/v1/:league/bracket',
    defineRoute(async (c) => {
      const { league } = parseParams(c, LeagueParamSchema);
      const { season: seasonQuery } = parseQuery(c, QuerySchema);

      const season = seasonQuery ?? (await getLeagueSeason(league));

      return cached(`bracket:${league}:${season}`, TTL.bracket, async () => {
        // ESPN's `dates=YYYY` returns a CALENDAR year, but a season spans two
        // (group phase in one year, knockouts in the next). Pull both years and
        // keep only events whose `season.year` matches this competition's season.
        const [curYear, nextYear] = await Promise.all([
          espnFetch<EspnScoreboard>(`${siteBase(league)}/scoreboard?dates=${season}&limit=1000`),
          espnFetch<EspnScoreboard>(
            `${siteBase(league)}/scoreboard?dates=${season + 1}&limit=1000`,
          ).catch(() => ({ events: [] }) as EspnScoreboard),
        ]);

        const ref = leagueRef(league, curYear?.leagues?.[0] ?? null);

        /* eslint-disable @typescript-eslint/no-explicit-any */
        const byId = new Map<string, any>();
        for (const ev of [
          ...(curYear?.events ?? []),
          ...(nextYear?.events ?? []),
        ] as any[]) {
          if (ev?.season?.year === season) byId.set(String(ev.id), ev);
        }

        const bySlug: Record<string, any[]> = {};
        for (const ev of byId.values()) {
          const roundSlug = ev?.season?.slug ?? '';
          if (!roundSlug || NON_KNOCKOUT_SLUGS.has(roundSlug)) continue;
          (bySlug[roundSlug] ??= []).push(ev);
        }

        const rounds: BracketRound[] = Object.entries(bySlug)
          .map(([roundSlug, evs]) => ({
            name: prettifyRound(roundSlug),
            events: evs.sort(
              (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
            ),
            min: Math.min(...evs.map((e) => new Date(e.date).getTime())),
          }))
          .sort((a, b) => a.min - b.min)
          .map((round, order) => ({
            name: round.name,
            order,
            matches: round.events.map((ev) => toMatchSummary(ev, ref)),
          }));
        /* eslint-enable @typescript-eslint/no-explicit-any */

        return BracketSchema.parse({ league: ref, season, rounds });
      });
    }),
  );
}
