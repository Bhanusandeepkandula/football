// GET /v1/leagues → LeagueRef[] — the supported competitions (registry mirror).
import type { Hono } from 'hono';
import { z } from 'zod';

import { LeagueRefSchema } from '../contract/schema.js';
import { defineRoute } from './_lib.js';
import { leagueRefs } from './_leagues.js';

const LeagueListSchema = z.array(LeagueRefSchema);

export function registerLeagues(app: Hono): void {
  app.get(
    '/v1/leagues',
    defineRoute(async () => LeagueListSchema.parse(leagueRefs)),
  );
}
