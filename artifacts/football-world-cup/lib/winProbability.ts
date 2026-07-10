// ─── Live win probability (on-device model) ─────────────────────────────────
// ESPN publishes an in-game win probability only for a minority of soccer
// fixtures, so for everything else we compute one from live match state. It
// ticks in real time as the score, clock and cards change — no extra network,
// works for every competition.
//
// Model: the final result = current score + remaining goals, where each team's
// remaining goals is Poisson with a mean scaled by time left, home advantage
// and red cards. We convolve the two Poissons to get P(home win / draw / away).

export interface WinProbInput {
  homeScore: number;
  awayScore: number;
  /** Elapsed minutes (0 pre-match, ~90 at full time). */
  minute: number;
  homeReds?: number;
  awayReds?: number;
  isFinished?: boolean;
  /** period > 2 ⇒ extra time; nudges remaining time. */
  period?: number;
}

export interface WinProb {
  home: number; // 0..100
  draw: number;
  away: number;
}

const FULL_MATCH_GOALS = 1.35; // avg goals per team over 90'
const HOME_ADV = 1.15;
const AWAY_ADJ = 0.9;

function poisson(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

// Final result = current score + remaining goals, each team Poisson with the
// given mean. Convolve the two to get P(home / draw / away).
function convolveWinProb(homeScore: number, awayScore: number, lambdaHome: number, lambdaAway: number): WinProb {
  const MAX = 8; // >8 further goals for a side ≈ 0 probability
  let pHome = 0, pDraw = 0, pAway = 0;
  for (let gh = 0; gh <= MAX; gh++) {
    const ph = poisson(gh, lambdaHome);
    for (let ga = 0; ga <= MAX; ga++) {
      const w = ph * poisson(ga, lambdaAway);
      const diff = (homeScore + gh) - (awayScore + ga);
      if (diff > 0) pHome += w;
      else if (diff < 0) pAway += w;
      else pDraw += w;
    }
  }
  const total = pHome + pDraw + pAway || 1;
  const home = clampPct((pHome / total) * 100);
  const away = clampPct((pAway / total) * 100);
  const draw = Math.max(0, 100 - home - away); // absorb rounding drift into draw
  return { home, draw, away };
}

export function liveWinProbability(input: WinProbInput): WinProb {
  const { homeScore, awayScore, homeReds = 0, awayReds = 0, isFinished = false, period = 1 } = input;

  // Settled result — no uncertainty.
  if (isFinished) {
    if (homeScore > awayScore) return { home: 100, draw: 0, away: 0 };
    if (awayScore > homeScore) return { home: 0, draw: 0, away: 100 };
    return { home: 0, draw: 100, away: 0 };
  }

  // Fraction of regulation time remaining (a touch of stoppage baked in).
  const regulation = period > 2 ? 120 : 94;
  const minutesLeft = Math.max(0, regulation - input.minute);
  const t = Math.min(1, minutesLeft / 90);

  // A red card handicaps a team's attack and leaks goals to the opponent.
  const homeRedPenalty = Math.pow(0.72, homeReds);
  const awayRedPenalty = Math.pow(0.72, awayReds);

  const lambdaHome = FULL_MATCH_GOALS * HOME_ADV * t * homeRedPenalty * (1 + 0.25 * awayReds);
  const lambdaAway = FULL_MATCH_GOALS * AWAY_ADJ * t * awayRedPenalty * (1 + 0.25 * homeReds);

  return convolveWinProb(homeScore, awayScore, lambdaHome, lambdaAway);
}

export interface PreMatchRates {
  homeAvgGoals?: number;
  homeAvgConceded?: number;
  awayAvgGoals?: number;
  awayAvgConceded?: number;
}

/** True when there's a complete enough scoring-rate pairing for the model to use
 *  real season form (rather than the home-advantage baseline). The caption in
 *  the UI is gated on this SAME check so it never claims "season form" when the
 *  model actually fell back to the baseline. */
export function hasSeasonRates(rates: PreMatchRates = {}): boolean {
  const num = (v: unknown) => typeof v === 'number';
  return (num(rates.homeAvgGoals) && num(rates.awayAvgConceded)) ||
    (num(rates.awayAvgGoals) && num(rates.homeAvgConceded));
}

/**
 * Pre-match prediction. When per-team scoring rates are available (from the
 * competition's season stats) each team's expected goals blends its own attack
 * with the opponent's leakiness; otherwise it degrades to a league-average
 * prior with home advantage. Returns null only if inputs are unusable.
 */
export function preMatchWinProbability(rates: PreMatchRates = {}): WinProb {
  const hAtt = rates.homeAvgGoals;
  const hDef = rates.homeAvgConceded;
  const aAtt = rates.awayAvgGoals;
  const aDef = rates.awayAvgConceded;

  const haveRates = hasSeasonRates(rates);

  let lambdaHome: number;
  let lambdaAway: number;
  if (haveRates) {
    // Expected home goals ≈ mean(home attack, away defence conceded); the reverse
    // for away. Fall back to the league average for any missing half.
    lambdaHome = ((hAtt ?? FULL_MATCH_GOALS) + (aDef ?? FULL_MATCH_GOALS)) / 2 * HOME_ADV;
    lambdaAway = ((aAtt ?? FULL_MATCH_GOALS) + (hDef ?? FULL_MATCH_GOALS)) / 2 * AWAY_ADJ;
  } else {
    lambdaHome = FULL_MATCH_GOALS * HOME_ADV;
    lambdaAway = FULL_MATCH_GOALS * AWAY_ADJ;
  }

  return convolveWinProb(0, 0, lambdaHome, lambdaAway);
}
