/**
 * Volatility Band — PRD §10.4
 *
 * "How much could this win probability forecast realistically swing?"
 *
 * Returns a forward-looking uncertainty interval around a predicted win probability.
 */

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

interface VolatilityBandResult {
  lower: number;
  upper: number;
  width: number;
}

/**
 * @param p           - Win probability (0–1) from ELO logistic
 * @param confidenceA - ratingConfidence (0–1) for team A
 * @param confidenceB - ratingConfidence (0–1) for team B
 * @param volatilityA - ratingVolatility (σΔ) for team A
 * @param volatilityB - ratingVolatility (σΔ) for team B
 */
export function computeVolatilityBand(
  p: number,
  confidenceA: number,
  confidenceB: number,
  volatilityA: number,
  volatilityB: number,
): VolatilityBandResult {
  // Step 1 — Rating uncertainty term
  const Ua = 1 - confidenceA;
  const Ub = 1 - confidenceB;
  const U = (Ua + Ub) / 2;

  // Step 2 — Volatility component
  const V = (volatilityA + volatilityB) / 2;
  const Vn = V / 40;

  // Step 3 — Band width
  const W = clamp(0.08 * (0.5 + U + Vn), 0.03, 0.20);

  return {
    lower: p - W,
    upper: p + W,
    width: W,
  };
}
