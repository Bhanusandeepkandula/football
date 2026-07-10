import { describe, expect, it } from 'vitest';

import { type LeagueRef, ScoreboardSchema } from '../../contract/schema.js';
import { normalizeScoreboard } from '../scoreboard.js';

const WC: LeagueRef = { slug: 'fifa.world', name: 'FIFA World Cup', abbr: 'WC' };

// A small, hand-trimmed recording of an ESPN soccer scoreboard payload: one
// knockout tie finished on penalties (level 1–1, shootout 4–3) and one live tie
// paused at half-time. Enough to pin the correctness fixes ported from the app.
const SCOREBOARD_FIXTURE = {
  day: { date: '20260709' },
  leagues: [{ season: { year: 2026, type: 3, name: 'FIFA World Cup' } }],
  events: [
    {
      id: '700001',
      date: '2026-07-09T18:00Z',
      season: { year: 2026, type: 3, slug: 'round-of-16' },
      status: {
        displayClock: "0'",
        period: 5,
        type: {
          id: '28',
          name: 'STATUS_FULL_TIME',
          state: 'post',
          completed: true,
          description: 'Full Time',
          detail: 'FT',
          shortDetail: 'FT',
        },
      },
      competitions: [
        {
          id: '700001',
          venue: { fullName: 'MetLife Stadium', address: { city: 'East Rutherford' } },
          notes: [{ type: 'event', headline: 'Round of 16' }],
          competitors: [
            {
              homeAway: 'home',
              team: {
                id: '478',
                displayName: 'France',
                shortDisplayName: 'France',
                abbreviation: 'FRA',
                logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/478.png',
                color: '002395',
                alternateColor: 'ffffff',
              },
              score: '1',
              shootoutScore: 4,
              records: [{ summary: '4-0-1' }],
            },
            {
              homeAway: 'away',
              team: {
                id: '202',
                displayName: 'Argentina',
                shortDisplayName: 'Argentina',
                abbreviation: 'ARG',
                logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/202.png',
                color: '75AADB',
                alternateColor: '000000',
              },
              score: '1',
              shootoutScore: 3,
              records: [{ summary: '3-1-1' }],
            },
          ],
        },
      ],
    },
    {
      id: '700002',
      date: '2026-07-09T21:00Z',
      season: { year: 2026, type: 3, slug: 'round-of-16' },
      status: {
        displayClock: "45'",
        period: 2,
        type: {
          name: 'STATUS_HALFTIME',
          state: 'in',
          completed: false,
          detail: 'Halftime',
          shortDetail: 'HT',
        },
      },
      competitions: [
        {
          id: '700002',
          venue: { fullName: 'SoFi Stadium', address: { city: 'Inglewood' } },
          competitors: [
            {
              homeAway: 'home',
              team: { id: '449', displayName: 'Brazil', abbreviation: 'BRA', logo: 'x', color: 'ffdf00' },
              score: '2',
            },
            {
              homeAway: 'away',
              team: { id: '164', displayName: 'Spain', abbreviation: 'ESP', logo: 'x', color: 'c8102e' },
              score: '0',
            },
          ],
        },
      ],
    },
  ],
};

describe('normalizeScoreboard', () => {
  const sb = normalizeScoreboard(SCOREBOARD_FIXTURE, WC, '20260709');

  it('produces a Scoreboard that satisfies the contract schema', () => {
    // Re-parsing must not throw — normalizeScoreboard already validated, but this
    // asserts the DTO shape explicitly and future-proofs against drift.
    expect(() => ScoreboardSchema.parse(sb)).not.toThrow();
    expect(sb.league).toEqual(WC);
    expect(sb.date).toBe('20260709');
    expect(sb.season?.year).toBe(2026);
    expect(sb.matches).toHaveLength(2);
  });

  it('resolves the winner from the shootout when regulation is level (winner-respects-shootout)', () => {
    const pens = sb.matches[0];
    expect(pens.status.isFinished).toBe(true);
    expect(pens.status.isLive).toBe(false);
    expect(pens.home.score).toBe('1');
    expect(pens.away.score).toBe('1');
    expect(pens.shootout).toEqual({ home: 4, away: 3 });
    expect(pens.home.winner).toBe(true);
    expect(pens.away.winner).toBe(false);
    expect(pens.resultSuffix).toBe('Pens');
    expect(pens.round).toBe('Round of 16');
    expect(pens.venue).toBe('MetLife Stadium');
    expect(pens.city).toBe('East Rutherford');
    expect(pens.home.team.abbreviation).toBe('FRA');
  });

  it('marks a half-time match live-but-paused and never finished', () => {
    const live = sb.matches[1];
    expect(live.status.state).toBe('in');
    expect(live.status.isLive).toBe(true);
    expect(live.status.clockRunning).toBe(false); // HT is a paused state
    expect(live.status.isFinished).toBe(false);
    expect(live.status.detail).toBe('HT');
    expect(live.resultSuffix).toBe('');
    expect(live.shootout ?? null).toBeNull();
    expect(live.home.winner).toBeUndefined();
  });

  it('drops an event that fails validation instead of failing the whole day', () => {
    // `date` as a number violates MatchSummarySchema (date: z.string()), so this
    // event throws inside normalizeMatchSummary and is skipped — the two good
    // fixtures still come through.
    const malformed = { id: 'bad', date: 12345, competitions: [{ competitors: [] }] };
    const out = normalizeScoreboard(
      { ...SCOREBOARD_FIXTURE, events: [...SCOREBOARD_FIXTURE.events, malformed] },
      WC,
    );
    expect(out.matches).toHaveLength(2);
    expect(out.matches.map((m) => m.id)).toEqual(['700001', '700002']);
    expect(() => ScoreboardSchema.parse(out)).not.toThrow();
  });
});
