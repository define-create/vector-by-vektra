/**
 * Core doubles-aware ELO functions.
 * Pure functions — no database access, no side effects.
 */

export const BASE_K = 32;

export const K_MAX = 48;
export const K_MIN = 16;
export const K_DECAY_RATE = 20;
export const LOPSIDED_SCALE = 400;
export const MOV_MIN = 0.75;
export const MOV_MAX = 1.25;

/**
 * Team rating: simple average of the two players' individual ratings.
 */
export function teamRating(r1: number, r2: number): number {
  return (r1 + r2) / 2;
}

/**
 * Expected win probability for team A against team B using the standard ELO logistic function.
 * Returns a value in (0, 1).
 */
export function expectedScore(teamARating: number, teamBRating: number): number {
  return 1 / (1 + Math.pow(10, (teamBRating - teamARating) / 400));
}

/**
 * Effective K-factor: baseK multiplied by optional recency and margin weights.
 * Both weights should be positive. Use 1.0 for no adjustment.
 */
export function kFactor(
  baseK: number,
  recencyWeight: number,
  marginWeight: number,
): number {
  return baseK * recencyWeight * marginWeight;
}

/**
 * Rating delta for one team/player given the effective K and their actual vs expected outcome.
 *
 * @param effectiveK  - K-factor for this match (from kFactor())
 * @param actual      - 1 for a win, 0 for a loss
 * @param expected    - expected score from expectedScore() for this team
 * @returns positive delta for wins, negative delta for losses
 */
export function computeRatingDelta(
  effectiveK: number,
  actual: number,
  expected: number,
): number {
  return effectiveK * (actual - expected);
}

/**
 * Per-player dynamic base K that decays from K_MAX to K_MIN as match count grows.
 * @param matchesPlayed - matches completed before the current match (0 = first match)
 */
export function dynamicK(matchesPlayed: number): number {
  return K_MIN + (K_MAX - K_MIN) * Math.exp(-matchesPlayed / K_DECAY_RATE);
}

/**
 * Lopsided-matchup gap factor in (0, 1].
 * Returns 1.0 for equal teams; shrinks toward 0 as the rating gap grows.
 * Multiply the favourite's baseK by this value and the underdog's by (2 - this value).
 * @param ratingGap - t1Avg - t2Avg (sign ignored)
 */
export function lopsidedGapFactor(ratingGap: number): number {
  return Math.exp(-Math.abs(ratingGap) / LOPSIDED_SCALE);
}

/**
 * Margin-of-victory weight in [MOV_MIN, MOV_MAX] based on winner's point share.
 * Returns 1.0 if arrays are empty (graceful fallback for missing score data).
 * @param winnerScores - winning team's per-game scores
 * @param loserScores  - losing team's per-game scores (same length)
 */
export function marginOfVictoryMultiplier(
  winnerScores: number[],
  loserScores: number[],
): number {
  if (winnerScores.length === 0) return 1.0;
  const totalWinner = winnerScores.reduce((s, v) => s + v, 0);
  const totalLoser = loserScores.reduce((s, v) => s + v, 0);
  const total = totalWinner + totalLoser;
  if (total === 0) return 1.0;
  const normalized = 2 * (totalWinner / total - 0.5);
  return MOV_MIN + (MOV_MAX - MOV_MIN) * normalized;
}
