import { computeDriftScore } from "./drift-score";
import { type SnapshotWrite } from "@/lib/rating-engine/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function snap(expectedScore: number, daysAgo: number): SnapshotWrite {
  return {
    playerId: "p1",
    matchId: `m${daysAgo}`,
    matchDate: new Date(Date.now() - daysAgo * 86_400_000),
    rating: 1000,
    effectiveK: 32,
    expectedScore,
    runId: "run1",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("computeDriftScore", () => {
  it("returns 0 for empty inputs", () => {
    expect(computeDriftScore([], [])).toBe(0);
  });

  it("returns 0 when results exactly match expectations", () => {
    // Win when E=1 (perfect), lose when E=0 (perfect)
    const snaps = [snap(1, 5), snap(0, 4), snap(1, 3), snap(0, 2)];
    const actuals = [1, 0, 1, 0];
    expect(computeDriftScore(snaps, actuals)).toBeCloseTo(0, 10);
  });

  it("returns positive drift when consistently outperforming expectations", () => {
    // Always win but model expected losses (E=0.3 → PE = 1 - 0.3 = +0.7 each)
    const snaps = [snap(0.3, 5), snap(0.3, 4), snap(0.3, 3), snap(0.3, 2), snap(0.3, 1)];
    const actuals = [1, 1, 1, 1, 1];
    const ds = computeDriftScore(snaps, actuals);
    expect(ds).toBeGreaterThan(0);
    expect(ds).toBeCloseTo(100 * 0.7, 5);
  });

  it("returns negative drift when underperforming expectations", () => {
    // Always lose but model expected wins (E=0.7 → PE = 0 - 0.7 = -0.7 each)
    const snaps = [snap(0.7, 5), snap(0.7, 4), snap(0.7, 3), snap(0.7, 2), snap(0.7, 1)];
    const actuals = [0, 0, 0, 0, 0];
    const ds = computeDriftScore(snaps, actuals);
    expect(ds).toBeLessThan(0);
    expect(ds).toBeCloseTo(-100 * 0.7, 5);
  });

  it("matches the PRD worked example", () => {
    // 5 matches from PRD §10.2 example → DriftScore = -20
    const snaps = [
      snap(0.70, 5),
      snap(0.65, 4),
      snap(0.60, 3),
      snap(0.55, 2),
      snap(0.50, 1),
    ];
    const actuals = [0, 1, 0, 0, 1];
    // PE: -0.70, +0.35, -0.60, -0.55, +0.50 → sum=-1.00, avg=-0.20 → DS=-20
    expect(computeDriftScore(snaps, actuals)).toBeCloseTo(-20, 5);
  });

  it("stays near 0 for balanced mixed results at 50-50 expectation", () => {
    const snaps = [snap(0.5, 5), snap(0.5, 4), snap(0.5, 3), snap(0.5, 2)];
    const actuals = [1, 0, 1, 0]; // 2 wins, 2 losses, each PE = ±0.5 → sum=0
    expect(computeDriftScore(snaps, actuals)).toBeCloseTo(0, 10);
  });
});
