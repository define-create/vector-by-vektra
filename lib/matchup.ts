/**
 * Matchup projection helpers — PRD §4.3
 *
 * Win probability and fair moneyline (zero-vig American odds) for a doubles matchup.
 */

import { teamRating, expectedScore } from "@/lib/rating-engine/elo";

/**
 * Computes win probability for Pair A vs Pair B using ELO team averages.
 *
 * Formula: E = 1 / (1 + 10^((tB − tA) / 400))
 * where tA = (ratingA1 + ratingA2) / 2, tB = (ratingB1 + ratingB2) / 2.
 *
 * @returns Win probability for Pair A in (0, 1).
 */
export function computeWinProbability(
  ratingA1: number,
  ratingA2: number,
  ratingB1: number,
  ratingB2: number,
): number {
  const tA = teamRating(ratingA1, ratingA2);
  const tB = teamRating(ratingB1, ratingB2);
  return expectedScore(tA, tB);
}

/** Rounds n to the nearest multiple of 5. */
function roundToNearest5(n: number): number {
  return Math.round(n / 5) * 5;
}

/**
 * Converts a win probability to a zero-vig American moneyline.
 *
 * Rules (PRD §4.3):
 *   0.47 ≤ p ≤ 0.53 → "Even"
 *   p ≥ 0.5         → favourite: −100 × p / (1 − p), rounded to nearest 5
 *   p < 0.5         → underdog:  +100 × (1 − p) / p, rounded to nearest 5
 *
 * @param p - Win probability in [0, 1].
 * @returns American moneyline (negative = favourite, positive = underdog) or "Even".
 */
export function computeMoneyline(p: number): number | "Even" {
  if (p >= 0.47 && p <= 0.53) return "Even";

  const raw =
    p >= 0.5
      ? -100 * (p / (1 - p))
      : 100 * ((1 - p) / p);

  return roundToNearest5(raw);
}
