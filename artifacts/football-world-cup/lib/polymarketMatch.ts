// ─── Polymarket ⇄ ESPN team matching (shared, dependency-free) ───────────────
// Polymarket's live feed identifies teams by full name only (no ESPN ids), so
// we match by name/abbreviation and, crucially, resolve ORIENTATION: does the
// Polymarket "home" correspond to the ESPN home or away side. Getting this wrong
// silently inverts the live scoreline — the single worst bug for a scores app —
// which is exactly what happened when orientation was inferred from whether the
// PM name merely contained the ESPN abbreviation (false for "Manchester United"
// vs "MUN"). Both the match predicate and the score parser now share this logic.

export interface TeamNames {
  homeName: string;
  awayName: string;
  homeAbbr?: string;
  awayAbbr?: string;
}

export interface PmNames {
  homeTeam?: string;
  awayTeam?: string;
}

export function normToken(raw?: string): string {
  return (raw ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents (São → sao)
    .replace(/[^a-z0-9]/g, '');
}

// Generic club/country filler words that don't distinguish two teams, so we
// never treat a shared one (e.g. both "… FC") as evidence of a match.
const FILLER = new Set([
  'fc', 'cf', 'sc', 'afc', 'ac', 'as', 'ss', 'us', 'sv', 'fk', 'if', 'club',
  'de', 'the', 'city', 'town', 'united', 'real', 'atletico', 'deportivo',
]);

function significantTokens(name: string): string[] {
  return (name ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !FILLER.has(w));
}

/** Does a Polymarket team name refer to the same team as an ESPN side? */
function sideMatch(pmName: string | undefined, refName: string, refAbbr?: string): boolean {
  const pm = normToken(pmName);
  if (!pm) return false;
  const refFull = normToken(refName);
  const abbr = normToken(refAbbr);

  // Full-name equality or containment either direction (handles "Man Utd" vs
  // "Manchester United"-style prefixes once normalised).
  if (refFull && (pm === refFull || pm.includes(refFull) || refFull.includes(pm))) return true;
  // PM sometimes sends the abbreviation itself.
  if (abbr.length >= 2 && (pm === abbr || pm.includes(abbr))) return true;
  // A shared distinctive word (≥4 chars, non-filler): "Bayern"/"Tottenham".
  const pmWords = significantTokens(pmName ?? '');
  const refWords = significantTokens(refName);
  if (pmWords.some((w) => refWords.includes(w))) return true;
  return false;
}

/**
 * 'same'    → PM home = ESPN home (scores map straight through)
 * 'swapped' → PM home = ESPN away (scores must be flipped)
 * null      → not the same fixture, or too ambiguous to trust (caller should
 *             NOT override ESPN — better a slightly stale score than a wrong one)
 */
export function matchOrientation(pm: PmNames, ref: TeamNames): 'same' | 'swapped' | null {
  const sameH = sideMatch(pm.homeTeam, ref.homeName, ref.homeAbbr);
  const sameA = sideMatch(pm.awayTeam, ref.awayName, ref.awayAbbr);
  const swapH = sideMatch(pm.homeTeam, ref.awayName, ref.awayAbbr);
  const swapA = sideMatch(pm.awayTeam, ref.homeName, ref.homeAbbr);

  const sameScore = (sameH ? 1 : 0) + (sameA ? 1 : 0);
  const swapScore = (swapH ? 1 : 0) + (swapA ? 1 : 0);

  if (sameScore === 0 && swapScore === 0) return null;
  if (sameScore > swapScore) return 'same';
  if (swapScore > sameScore) return 'swapped';
  // Tie: only trust it if BOTH sides corroborate one orientation (impossible for
  // distinct teams to hit 2/2 on both), otherwise decline to override.
  if (sameScore >= 2) return 'same';
  if (swapScore >= 2) return 'swapped';
  return null;
}
