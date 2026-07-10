import { describe, expect, it } from 'vitest';
import {
  LiveContentStateSchema,
  LiveMessageSchema,
  MatchStatusSchema,
  ScoreboardSchema,
} from './schema.js';

// Smoke tests that pin the load-bearing contract shapes. The build agents lean
// on these when wiring the normalizers and the live hub.
describe('contract/schema', () => {
  it('applies defaults on MatchStatus', () => {
    const s = MatchStatusSchema.parse({
      state: 'in',
      isLive: true,
      isFinished: false,
      clockRunning: true,
    });
    expect(s.detail).toBe('');
  });

  it('accepts an empty scoreboard', () => {
    const sb = ScoreboardSchema.parse({
      league: { slug: 'eng.1', name: 'English Premier League' },
      matches: [],
    });
    expect(sb.matches).toHaveLength(0);
  });

  it('round-trips a live content-state frame', () => {
    const state = {
      homeAbbr: 'FRA',
      awayAbbr: 'ARG',
      homeScore: 1,
      awayScore: 1,
      status: "63'",
      isLive: true,
      homeColor: '#003DA5',
      awayColor: '#75AADB',
      lastEvent: '⚽ Mbappe',
      startAt: 1_752_000_000,
      paused: false,
    };
    expect(LiveContentStateSchema.parse(state)).toEqual(state);
    const msg = LiveMessageSchema.parse({
      type: 'state',
      matchId: '123',
      league: 'fifa.world',
      state,
      updatedAt: new Date().toISOString(),
    });
    expect(msg.type).toBe('state');
  });
});
