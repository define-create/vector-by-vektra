import { computeMomentum } from "./momentum";
import { type SnapshotWrite } from "@/lib/rating-engine/types";

const BASE_DATE = new Date("2025-01-01T00:00:00Z");

/** Creates a minimal SnapshotWrite for testing. */
function makeSnapshot(
  overrides: Partial<SnapshotWrite> & { daysOffset: number },
): SnapshotWrite {
  const matchDate = new Date(BASE_DATE.getTime() + overrides.daysOffset * 86_400_000);
  return {
    playerId: "p1",
    matchId: `match-${overrides.daysOffset}`,
    matchDate,
    rating: 1000,
    effectiveK: 32,
    expectedScore: 0.5,
    runId: "run-1",
    ...overrides,
  };
}

describe("computeMomentum", () => {
  it("returns 0 when fewer than 2 snapshots are provided", () => {
    expect(computeMomentum([])).toBe(0);
    expect(computeMomentum([makeSnapshot({ daysOffset: 0, rating: 1000 })])).toBe(0);
  });

  it("returns 0 for a perfectly flat rating history (no gain, no loss)", () => {
    const snapshots = Array.from({ length: 10 }, (_, i) =>
      makeSnapshot({ daysOffset: i, rating: 1000, expectedScore: 0.5, effectiveK: 32 }),
    );
    expect(computeMomentum(snapshots)).toBe(0);
  });

  it("returns a positive value for a consistently rising rating history", () => {
    const snapshots = Array.from({ length: 11 }, (_, i) =>
      makeSnapshot({ daysOffset: i, rating: 1000 + i * 16, effectiveK: 32, expectedScore: 0.5 }),
    );
    expect(computeMomentum(snapshots)).toBeGreaterThan(0);
  });

  it("returns a negative value when high-expectation wins are followed by high-expectation losses", () => {
    // M component (mean Ni*Si) is always >= 0 because Ni and Si share the same sign
    // (win -> Ni>0, Si>0; loss -> Ni<0, Si<0). Negative momentum requires A = slope(Ni)
    // to be sufficiently negative.
    //
    // Key: to make M small (so A can dominate), set expectedScore close to the actual
    // outcome -> Si near 0.
    //
    // Pattern: 5 wins as a strong favourite (Ei=0.9, Ni=+0.1, Si=+0.1, Ni*Si=0.01)
    //          5 losses as a strong underdog (Ei=0.1, Ni=-0.1, Si=-0.1, Ni*Si=0.01)
    // M = 0.01, A = slope([+0.1,...,-0.1]) < 0 -> Momentum = 100*(0.007 - 0.00909) < 0
    const ratings = [1000, 1003.2, 1006.4, 1009.6, 1012.8, 1016, 1012.8, 1009.6, 1006.4, 1003.2, 1000];
    const expectedScores = [0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.1, 0.1, 0.1, 0.1, 0.1];
    const snapshots = ratings.map((r, i) =>
      makeSnapshot({ daysOffset: i, rating: r, effectiveK: 32, expectedScore: expectedScores[i]! }),
    );
    expect(computeMomentum(snapshots)).toBeLessThan(0);
  });

  it("handles fewer than 10 snapshots gracefully (uses what is available)", () => {
    const snapshots = Array.from({ length: 5 }, (_, i) =>
      makeSnapshot({ daysOffset: i, rating: 1000 + i * 16, effectiveK: 32, expectedScore: 0.5 }),
    );
    const result = computeMomentum(snapshots);
    expect(typeof result).toBe("number");
    expect(isNaN(result)).toBe(false);
  });

  it("uses only the most recent 11 snapshots (ignores older data)", () => {
    // First 10: flat. Last 11: rising. Momentum should reflect the rising window.
    const flat = Array.from({ length: 10 }, (_, i) =>
      makeSnapshot({ daysOffset: i, rating: 1000, effectiveK: 32, expectedScore: 0.5 }),
    );
    const rising = Array.from({ length: 11 }, (_, i) =>
      makeSnapshot({ daysOffset: 10 + i, rating: 1000 + i * 16, effectiveK: 32, expectedScore: 0.5 }),
    );
    expect(computeMomentum([...flat, ...rising])).toBeGreaterThan(0);
  });

  it("is order-independent (sorts snapshots internally)", () => {
    const snapshots = Array.from({ length: 11 }, (_, i) =>
      makeSnapshot({ daysOffset: i, rating: 1000 + i * 16, effectiveK: 32, expectedScore: 0.5 }),
    );
    const reversed = [...snapshots].reverse();
    expect(computeMomentum(snapshots)).toBeCloseTo(computeMomentum(reversed), 10);
  });
});
