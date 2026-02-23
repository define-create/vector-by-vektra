/**
 * Core doubles-aware ELO functions.
 * Pure functions — no database access, no side effects.
 */

export const BASE_K = 32;

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
