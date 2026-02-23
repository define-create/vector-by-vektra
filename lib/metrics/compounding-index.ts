/**
 * Compounding Index (CI) — PRD §10.1
 *
 * "Are gains building on themselves — or merely oscillating?"
 *
 * Input: player's snapshots for the selected horizon, sorted chronologically.
 * Returns: CI in the approximate range −100 to +100.
 */

import { type SnapshotWrite } from "@/lib/rating-engine/types";

/** Ordinary-least-squares slope of y over equally-spaced x (0, 1, 2, …). */
function olsSlope(y: number[]): number {
  const n = y.length;
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += y[i]!;
    sumXY += i * y[i]!;
    sumX2 += i * i;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/**
 * @param snapshots - Player's snapshots for the horizon, pre-sorted chronologically.
 *                    Must all belong to the same player.
 */
export function computeCI(snapshots: SnapshotWrite[]): number {
  // Need at least 2 snapshots to produce one delta
  if (snapshots.length < 2) return 0;

  const sorted = [...snapshots].sort(
    (a, b) => a.matchDate.getTime() - b.matchDate.getTime(),
  );

  const Nvalues: number[] = [];
  const NtimesS: number[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;

    const delta = curr.rating - prev.rating;
    const K = curr.effectiveK;

    if (K === 0) continue; // guard against division by zero

    // Step 1 — Nᵢ = Δᵢ / Kᵢ
    const Ni = delta / K;

    // Step 2 — Sᵢ = Actualᵢ − Eᵢ
    // Actualᵢ: positive delta means win (K×(1−E)>0), negative means loss
    const actual = delta > 0 ? 1 : 0;
    const Si = actual - curr.expectedScore;

    Nvalues.push(Ni);
    NtimesS.push(Ni * Si);
  }

  if (Nvalues.length === 0) return 0;

  // Step 3 — M = (1/n) × Σ(Nᵢ × Sᵢ)
  const M = NtimesS.reduce((s, v) => s + v, 0) / NtimesS.length;

  // Step 4 — A = slope of Nᵢ series
  const A = olsSlope(Nvalues);

  // Final — CI = 100 × (0.7M + 0.3A)
  return 100 * (0.7 * M + 0.3 * A);
}
