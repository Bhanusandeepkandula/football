import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Context } from 'hono';

import type { LiveMessage } from '../contract/schema.js';
import { log } from '../lib/log.js';
import { hub } from './hub.js';

/*
 * ── SSE read-side of the live hub ────────────────────────────────────────────
 *
 * Two mount points, one handler:
 *   • GET /v1/live/stream                 — multiplex, subscription in the query:
 *       ?matches=<league>:<id>,<league>:<id>   (explicit, self-describing)
 *       ?league=<slug>&matches=<id>,<id>       (league qualifies bare ids)
 *       ?league=<slug>                         (every live match in the league)
 *   • GET /v1/:league/matches/:id/stream  — one match (the app's match screen).
 *
 * Each frame is a LiveMessage written as `event: <type>\n data: <json>\n\n`, so
 * the SSE event name equals the message `type`. On connect we send a `hello`
 * then the current `state` snapshot(s); `ping` every ~25s keeps it warm; the
 * poller's `score` / `event` / `state` frames arrive as they happen.
 */

const logger = log('live-sse');
const HEARTBEAT_MS = 25_000;

interface MatchRef {
  league: string;
  id: string;
}
interface Interest {
  matches: MatchRef[];
  leagues: string[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseMultiplexQuery(c: Context): Interest {
  const league = c.req.query('league')?.trim() || undefined;
  const matchesRaw = c.req.query('matches')?.trim();

  const matches: MatchRef[] = [];
  const seen = new Set<string>();
  if (matchesRaw) {
    for (const token of matchesRaw.split(',')) {
      const t = token.trim();
      if (!t) continue;
      let ref: MatchRef | undefined;
      const sep = t.indexOf(':');
      if (sep > 0) {
        ref = { league: t.slice(0, sep), id: t.slice(sep + 1) };
      } else if (league) {
        ref = { league, id: t };
      }
      if (ref && ref.league && ref.id) {
        const key = `${ref.league}/${ref.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          matches.push(ref);
        }
      }
    }
  }

  // Whole-league firehose only when the caller didn't name specific matches.
  const leagues = league && matches.length === 0 ? [league] : [];
  return { matches, leagues };
}

function stream(c: Context, interest: Interest) {
  c.header('Content-Type', 'text/event-stream; charset=utf-8');
  c.header('Cache-Control', 'no-cache, no-transform');
  c.header('Connection', 'keep-alive');
  c.header('X-Accel-Buffering', 'no'); // disable nginx proxy buffering

  return streamSSE(c, async (sse) => {
    let aborted = false;
    const queue: LiveMessage[] = [];
    let wake: (() => void) | null = null;

    const push = (msg: LiveMessage): void => {
      queue.push(msg);
      if (wake) {
        const w = wake;
        wake = null;
        w();
      }
    };

    const sub = hub.subscribe(push);
    sse.onAbort(() => {
      aborted = true;
      sub.close();
      if (wake) {
        const w = wake;
        wake = null;
        w();
      }
    });

    // Connection ack. When exactly one match is targeted, name it.
    const singleId =
      interest.matches.length === 1 && interest.leagues.length === 0
        ? interest.matches[0].id
        : undefined;
    push({ type: 'hello', matchId: singleId, serverTime: nowIso() });

    // Register interest + replay the current snapshot(s).
    for (const m of interest.matches) {
      sub.addMatch(m.league, m.id);
      const snap = hub.stateMessage(m.league, m.id);
      if (snap) push(snap);
    }
    for (const league of interest.leagues) {
      sub.addLeague(league);
      for (const snap of hub.statesForLeague(league)) push(snap);
    }

    try {
      while (!aborted) {
        while (queue.length && !aborted) {
          const msg = queue.shift()!;
          await sse.writeSSE({ event: msg.type, data: JSON.stringify(msg) });
        }
        if (aborted) break;

        // Wait for the next frame, or emit a heartbeat on timeout.
        await new Promise<void>((resolve) => {
          if (queue.length || aborted) {
            resolve();
            return;
          }
          const timer = setTimeout(() => {
            wake = null;
            resolve();
          }, HEARTBEAT_MS);
          wake = () => {
            clearTimeout(timer);
            wake = null;
            resolve();
          };
        });
        if (aborted) break;
        if (queue.length === 0) {
          await sse.writeSSE({
            event: 'ping',
            data: JSON.stringify({ type: 'ping', serverTime: nowIso() }),
          });
        }
      }
    } catch (err) {
      logger.debug({ err }, 'sse stream closed');
    } finally {
      sub.close();
    }
  });
}

export const liveRoutes = new Hono();

liveRoutes.get('/v1/live/stream', (c) => {
  const interest = parseMultiplexQuery(c);
  if (interest.matches.length === 0 && interest.leagues.length === 0) {
    return c.json({ error: 'specify ?matches=<league>:<id>,… or ?league=<slug>' }, 400);
  }
  return stream(c, interest);
});

liveRoutes.get('/v1/:league/matches/:id/stream', (c) => {
  const league = c.req.param('league');
  const id = c.req.param('id');
  return stream(c, { matches: [{ league, id }], leagues: [] });
});

/** Mount the SSE routes onto the shared app (called from registerRoutes). */
export function registerLiveRoutes(app: Hono): void {
  app.route('/', liveRoutes);
}
