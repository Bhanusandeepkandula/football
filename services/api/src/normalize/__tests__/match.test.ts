import { describe, expect, it } from 'vitest';

import { type LeagueRef, MatchDetailSchema } from '../../contract/schema.js';
import { normalizeMatchDetail } from '../match.js';

const WC: LeagueRef = { slug: 'fifa.world', name: 'FIFA World Cup', abbr: 'WC' };

// A small, hand-trimmed recording of an ESPN soccer match `summary` payload for a
// live game (France 1–0 Argentina, 63'), with one goal, one card, per-team box
// score and two rosters. Enough to exercise the load-bearing branches of
// normalizeMatchDetail (status enums, running goal tally, derived accuracy %,
// lineup home/away resolution) and assert the DTO shape.
const MATCH_FIXTURE = {
  header: {
    id: '700100',
    season: { name: '2026 FIFA World Cup, Round of 16' },
    competitions: [
      {
        date: '2026-07-09T18:00Z',
        venue: { fullName: 'MetLife Stadium', address: { city: 'East Rutherford' } },
        status: {
          displayClock: "63'",
          period: 2,
          type: { name: 'STATUS_IN_PROGRESS', state: 'in', completed: false, shortDetail: "63'" },
        },
        competitors: [
          {
            homeAway: 'home',
            score: '1',
            team: {
              id: '478',
              displayName: 'France',
              abbreviation: 'FRA',
              logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/478.png',
              color: '002395',
              alternateColor: 'ffffff',
            },
          },
          {
            homeAway: 'away',
            score: '0',
            team: {
              id: '202',
              displayName: 'Argentina',
              abbreviation: 'ARG',
              logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/202.png',
              color: '75AADB',
              alternateColor: '000000',
            },
          },
        ],
      },
    ],
  },
  gameInfo: {
    venue: { fullName: 'MetLife Stadium', address: { city: 'East Rutherford' } },
    attendance: 82500,
    officials: [{ position: { name: 'Referee' }, displayName: 'Szymon Marciniak' }],
  },
  keyEvents: [
    {
      id: 'ke1',
      scoringPlay: true,
      type: { text: 'Goal' },
      text: 'Goal! France 1, Argentina 0. Kylian Mbappe (France) left footed shot from the centre of the box. Assisted by Antoine Griezmann.',
      shortText: 'Goal - Kylian Mbappe',
      clock: { displayValue: "23'" },
      period: { number: 1 },
      team: { id: '478' },
      participants: [
        { athlete: { displayName: 'Kylian Mbappe' } },
        { athlete: { displayName: 'Antoine Griezmann' } },
      ],
    },
    {
      id: 'ke2',
      type: { text: 'Yellow Card' },
      text: 'Rodrigo De Paul (Argentina) is shown the yellow card for a bad foul.',
      shortText: 'Yellow Card - Rodrigo De Paul',
      clock: { displayValue: "37'" },
      period: { number: 1 },
      team: { id: '202' },
      participants: [{ athlete: { displayName: 'Rodrigo De Paul' } }],
    },
  ],
  boxscore: {
    teams: [
      {
        team: { id: '478' },
        statistics: [
          { name: 'possessionPct', displayValue: '58', label: 'Possession %' },
          { name: 'totalShots', displayValue: '9', label: 'Shots' },
          { name: 'shotsOnTarget', displayValue: '5', label: 'Shots on Target' },
        ],
      },
      {
        team: { id: '202' },
        statistics: [
          { name: 'possessionPct', displayValue: '42', label: 'Possession %' },
          { name: 'totalShots', displayValue: '6', label: 'Shots' },
          { name: 'shotsOnTarget', displayValue: '2', label: 'Shots on Target' },
        ],
      },
    ],
  },
  rosters: [
    {
      homeAway: 'home',
      formation: '4-3-3',
      team: { id: '478', displayName: 'France', logo: 'x', color: '002395' },
      roster: [
        { starter: true, formationPlace: 1, jersey: '1', athlete: { id: 'p1', displayName: 'Mike Maignan', shortName: 'M. Maignan' } },
        { starter: true, formationPlace: 9, jersey: '10', athlete: { id: 'p2', displayName: 'Kylian Mbappe', shortName: 'K. Mbappe' } },
        { starter: false, formationPlace: 0, jersey: '11', athlete: { id: 'p3', displayName: 'Ousmane Dembele', shortName: 'O. Dembele' } },
      ],
    },
    {
      homeAway: 'away',
      formation: '4-4-2',
      team: { id: '202', displayName: 'Argentina', logo: 'x', color: '75AADB' },
      roster: [
        { starter: true, formationPlace: 1, jersey: '23', athlete: { id: 'p4', displayName: 'Emiliano Martinez', shortName: 'E. Martinez' } },
        { starter: true, formationPlace: 10, jersey: '10', athlete: { id: 'p5', displayName: 'Lionel Messi', shortName: 'L. Messi' } },
        { starter: false, formationPlace: 0, jersey: '9', athlete: { id: 'p6', displayName: 'Julian Alvarez', shortName: 'J. Alvarez' } },
      ],
    },
  ],
};

describe('normalizeMatchDetail', () => {
  const md = normalizeMatchDetail(MATCH_FIXTURE, WC, '700100');

  it('produces a MatchDetail that satisfies the contract schema', () => {
    expect(() => MatchDetailSchema.parse(md)).not.toThrow();
    expect(md.id).toBe('700100');
    expect(md.league).toEqual(WC);
    expect(md.date).toBe('2026-07-09T18:00Z');
    expect(md.round).toBe('Round of 16');
    expect(md.venue).toBe('MetLife Stadium');
    expect(md.city).toBe('East Rutherford');
    expect(md.referee).toBe('Szymon Marciniak');
    expect(md.attendance).toBe(82500);
  });

  it('maps the live status via the shared ESPN status whitelists', () => {
    expect(md.status).toBe('STATUS_IN_PROGRESS');
    expect(md.isLive).toBe(true);
    expect(md.clockRunning).toBe(true); // in-progress → clock ticks
    expect(md.isFinished).toBe(false);
    expect(md.period).toBe(2);
    expect(md.displayClock).toBe("63'");
    expect(md.resultSuffix).toBe(''); // never inferred while live
    expect(md.shootout ?? null).toBeNull();
  });

  it('carries flat home/away sides straight to the app screen', () => {
    expect(md.homeTeam.id).toBe('478');
    expect(md.homeTeam.abbreviation).toBe('FRA');
    expect(md.homeTeam.score).toBe('1');
    expect(md.awayTeam.id).toBe('202');
    expect(md.awayTeam.score).toBe('0');
  });

  it('builds key events with a running score attributed to the scoring side', () => {
    expect(md.events).toHaveLength(2);
    const [goal, card] = md.events;
    expect(goal.type).toBe('goal');
    expect(goal.scoreHome).toBe(1);
    expect(goal.scoreAway).toBe(0);
    expect(goal.teamId).toBe('478');
    expect(goal.playerName).toBe('Kylian Mbappe');
    expect(goal.secondaryName).toBe('Antoine Griezmann');
    expect(card.type).toBe('yellow-card');
    expect(card.teamId).toBe('202');
  });

  it('emits raw stats plus derived shot accuracy %', () => {
    const possession = md.stats.find((s) => s.name === 'possessionPct');
    expect(possession?.homeValue).toBe('58');
    expect(possession?.awayValue).toBe('42');
    expect(possession?.homePercent).toBeCloseTo(58);

    const shotAccuracy = md.stats.find((s) => s.name === 'shotAccuracy');
    expect(shotAccuracy).toBeDefined();
    expect(shotAccuracy?.homeValue).toBe('56%'); // 5 / 9
    expect(shotAccuracy?.awayValue).toBe('33%'); // 2 / 6
  });

  it('resolves lineups as a [home, away] tuple split into starters/bench', () => {
    expect(md.lineups).not.toBeNull();
    const lineups = md.lineups!;
    expect(lineups).toHaveLength(2);
    const [home, away] = lineups;
    expect(home.team.id).toBe('478');
    expect(home.formation).toBe('4-3-3');
    expect(home.starters).toHaveLength(2);
    expect(home.bench).toHaveLength(1);
    expect(home.starters[0].positionGroup).toBe('GK'); // formationPlace 1
    expect(away.team.id).toBe('202');
  });

  it('always fills the container fields so no app section reads undefined', () => {
    expect(md.gamecast.cards.length).toBeGreaterThan(0);
    expect(Array.isArray(md.gamecast.odds)).toBe(true);
    expect(Array.isArray(md.news)).toBe(true);
    expect(Array.isArray(md.commentary)).toBe(true);
    expect(Array.isArray(md.shots)).toBe(true);
    expect(Array.isArray(md.playerStats)).toBe(true);
    // Preview is only built for genuinely upcoming matches — never live ones.
    expect(md.preview).toBeUndefined();
  });
});
