/**
 * Momentum — PRD §4.4 (Matchup Projection Screen)
 *
 * The recent, normalized acceleration of rating change relative to expectation.
 * Uses the same formula as Compounding Index (CI) constrained to a 10-match window.
 *
 * Formula (identical to CI — see compounding-index.ts for derivation):
 *   Step 1  Nᵢ = Δᵢ / Kᵢ              (normalize delta by K-factor)
 *   Step 2  Sᵢ = Aᵢ − Eᵢ              (expectation adjustment)
 *   Step 3  M  = (1/n) × Σ(Nᵢ × Sᵢ)  (weighted reinforcement)
 *   Step 4  A  = slope(Nᵢ)            (OLS acceleration component)
 *   Final   Momentum = 100 × (0.7M + 0.3A)
 *
 * Source of Kᵢ: RatingSnapshot.effectiveK — written deterministically by the
 * rating engine on every match replay. Never read from the Match table directly.
 *
 * Typical range: −30 to +30.
 *   Positive  → structurally rising (gains reinforcing expectation surplus)
 *   Near zero → stable, no structural acceleration
 *   Negative  → structurally declining
 */

import { type SnapshotWrite } from "@/lib/rating-engine/types";
import { computeCI } from "./compounding-index";

/**
 * 11 snapshots produce 10 consecutive delta pairs, matching the PRD's
 * "last 10 matches" window definition.
 */
const MOMENTUM_WINDOW = 11;

/**
 * Computes Momentum for a player over their last 10 matches.
 *
 * @param snapshots - All snapshots for the player (any order, any count).
 *                    Must all belong to the same player.
 * @returns Momentum score in approximate range −30 to +30.
 *          Returns 0 if fewer than 2 snapshots are available.
 */
export function computeMomentum(snapshots: SnapshotWrite[]): number {
  if (snapshots.length < 2) return 0;

  // Sort chronologically and take the most recent MOMENTUM_WINDOW snapshots.
  // Slicing to 11 gives computeCI exactly 10 delta pairs (the 10-match window).
  const sorted = [...snapshots].sort(
    (a, b) => a.matchDate.getTime() - b.matchDate.getTime(),
  );
  const window = sorted.slice(-MOMENTUM_WINDOW);

  // Delegate to CI — same formula, different window constraint.
  return computeCI(window);
}
