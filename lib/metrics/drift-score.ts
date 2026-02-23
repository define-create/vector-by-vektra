/**
 * Drift Score (DS) — PRD §10.2
 *
 * "Are your actual results diverging from what your rating model predicts?"
 *
 * Measures structural misalignment between model predictions and real outcomes.
 * Do NOT divide by Kᵢ — this is an expectation error metric, not a rating delta metric.
 */

import { type SnapshotWrite } from "@/lib/rating-engine/types";

/**
 * @param snapshots - Player's snapshots for the horizon. Must belong to same player.
 * @param actuals   - Actual match outcomes (1 = win, 0 = loss) in the same order as
 *                    snapshots (after sorting chronologically).
 */
export function computeDriftScore(
  snapshots: SnapshotWrite[],
  actuals: number[],
): number {
  if (snapshots.length === 0 || actuals.length === 0) return 0;

  const sorted = [...snapshots]
    .map((s, i) => ({ snapshot: s, actual: actuals[i] ?? 0 }))
    .sort((a, b) => a.snapshot.matchDate.getTime() - b.snapshot.matchDate.getTime());

  const n = sorted.length;
  let sumPE = 0;

  for (const { snapshot, actual } of sorted) {
    // PEᵢ = Actualᵢ − Eᵢ
    sumPE += actual - snapshot.expectedScore;
  }

  // DriftRaw = (1/n) × Σ PEᵢ
  const driftRaw = sumPE / n;

  // DriftScore = 100 × DriftRaw
  return 100 * driftRaw;
}
