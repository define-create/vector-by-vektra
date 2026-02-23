import { computeRatingConfidence, computeRatingVolatility } from "./post-replay";
import { type MatchRecord, type SnapshotWrite } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMatch(
  id: string,
  team1: [string, string],
  team2: [string, string],
  daysAgo: number,
): MatchRecord {
  const matchDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return {
    matchId: id,
    matchDate,
    createdAt: matchDate,
    team1PlayerIds: team1,
    team2PlayerIds: team2,
    team1Won: true,
  };
}

function makeSnapshot(
  playerId: string,
  matchId: string,
  rating: number,
  daysAgo: number,
  runId = "run1",
): SnapshotWrite {
  const matchDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return { playerId, matchId, matchDate, rating, effectiveK: 32, expectedScore: 0.5, runId };
}

// ---------------------------------------------------------------------------
// computeRatingVolatility
// ---------------------------------------------------------------------------

describe("computeRatingVolatility", () => {
  it("returns 0 for a player with no snapshots", () => {
    expect(computeRatingVolatility("p1", [])).toBe(0);
  });

  it("returns 0 for a player with only one snapshot (no deltas)", () => {
    const snaps = [makeSnapshot("p1", "m1", 1016, 1)];
    expect(computeRatingVolatility("p1", snaps)).toBe(0);
  });

  it("returns 0 for perfectly stable ratings (all deltas = 0)", () => {
    const snaps = [1, 2, 3, 4, 5].map((i) =>
      makeSnapshot("p1", `m${i}`, 1000, 10 - i),
    );
    expect(computeRatingVolatility("p1", snaps)).toBeCloseTo(0, 10);
  });

  it("returns a higher value for volatile ratings", () => {
    // Alternating large swings
    const ratings = [1000, 1064, 936, 1064, 936];
    const snaps = ratings.map((r, i) => makeSnapshot("p1", `m${i + 1}`, r, 10 - i));
    const vol = computeRatingVolatility("p1", snaps);
    expect(vol).toBeGreaterThan(30);
  });

  it("only considers the last 20 snapshots", () => {
    // 25 snapshots: first 5 are wildly volatile, last 20 are stable
    const volatile = [1, 2, 3, 4, 5].map((i) =>
      makeSnapshot("p1", `mv${i}`, i % 2 === 0 ? 1200 : 800, 30 - i),
    );
    const stable = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(
      (i) => makeSnapshot("p1", `ms${i}`, 1000, 20 - i),
    );
    const vol = computeRatingVolatility("p1", [...volatile, ...stable]);
    expect(vol).toBeCloseTo(0, 1); // stable last 20 should dominate
  });
});

// ---------------------------------------------------------------------------
// computeRatingConfidence — component tests
// ---------------------------------------------------------------------------

describe("computeRatingConfidence — Cₙ (sample size)", () => {
  it("returns 0 when the player has no matches", () => {
    expect(computeRatingConfidence("p1", [], [])).toBe(0);
  });

  it("increases with more matches", () => {
    const makeMatches = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        makeMatch(`m${i}`, ["p1", "p2"], ["p3", "p4"], n - i),
      );
    const snaps = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        makeSnapshot("p1", `m${i}`, 1000, n - i),
      );

    const c5 = computeRatingConfidence("p1", makeMatches(5), snaps(5));
    const c20 = computeRatingConfidence("p1", makeMatches(20), snaps(20));
    const c60 = computeRatingConfidence("p1", makeMatches(60), snaps(60));

    expect(c20).toBeGreaterThan(c5);
    expect(c60).toBeGreaterThan(c20);
  });

  it("saturates — very large n doesn't push confidence above 1", () => {
    const matches = Array.from({ length: 200 }, (_, i) =>
      makeMatch(`m${i}`, ["p1", "p2"], ["p3", "p4"], 200 - i),
    );
    const snaps = Array.from({ length: 200 }, (_, i) =>
      makeSnapshot("p1", `m${i}`, 1000, 200 - i),
    );
    const c = computeRatingConfidence("p1", matches, snaps);
    expect(c).toBeLessThanOrEqual(1);
  });
});

describe("computeRatingConfidence — Cᵣ (recency)", () => {
  it("decays when the player hasn't played recently", () => {
    const recentMatch = [makeMatch("m1", ["p1", "p2"], ["p3", "p4"], 1)];
    const oldMatch = [makeMatch("m2", ["p1", "p2"], ["p3", "p4"], 90)];
    const recentSnap = [makeSnapshot("p1", "m1", 1016, 1)];
    const oldSnap = [makeSnapshot("p1", "m2", 1016, 90)];

    const cRecent = computeRatingConfidence("p1", recentMatch, recentSnap);
    const cOld = computeRatingConfidence("p1", oldMatch, oldSnap);

    expect(cRecent).toBeGreaterThan(cOld);
  });
});

describe("computeRatingConfidence — Cᵈ (diversity)", () => {
  it("penalises a player who always plays with the same partner against the same opponent", () => {
    // 20 matches, always p1+p2 vs p3+p4 — zero diversity
    const matches = Array.from({ length: 20 }, (_, i) =>
      makeMatch(`m${i}`, ["p1", "p2"], ["p3", "p4"], 20 - i),
    );
    const snaps = Array.from({ length: 20 }, (_, i) =>
      makeSnapshot("p1", `m${i}`, 1000, 20 - i),
    );
    const c = computeRatingConfidence("p1", matches, snaps);

    // Cᵈ = min(1, 0.5×(1/20) + 0.5×(1/5)) = min(1, 0.025 + 0.1) = 0.125
    // So overall confidence should be meaningfully below 1
    expect(c).toBeLessThan(0.5);
  });

  it("rewards diverse opponents and partners", () => {
    // 20 matches with completely unique opponent pairs
    const matches = Array.from({ length: 20 }, (_, i) =>
      makeMatch(
        `m${i}`,
        ["p1", `partner${i}`],
        [`opp${i}a`, `opp${i}b`],
        20 - i,
      ),
    );
    const snaps = Array.from({ length: 20 }, (_, i) =>
      makeSnapshot("p1", `m${i}`, 1000, 20 - i),
    );
    const c = computeRatingConfidence("p1", matches, snaps);
    // With full diversity, Cᵈ ≈ 1; overall confidence should be reasonable
    expect(c).toBeGreaterThan(0.2);
  });
});

describe("computeRatingConfidence — Cₛ (stability)", () => {
  it("penalises high rating jitter", () => {
    const matches = Array.from({ length: 20 }, (_, i) =>
      makeMatch(`m${i}`, ["p1", "p2"], ["p3", "p4"], 20 - i),
    );
    // Stable snaps
    const stableSnaps = Array.from({ length: 20 }, (_, i) =>
      makeSnapshot("p1", `m${i}`, 1000, 20 - i),
    );
    // Volatile snaps (±64 swings)
    const volatileSnaps = Array.from({ length: 20 }, (_, i) =>
      makeSnapshot("p1", `m${i}`, i % 2 === 0 ? 1064 : 936, 20 - i),
    );

    const cStable = computeRatingConfidence("p1", matches, stableSnaps);
    const cVolatile = computeRatingConfidence("p1", matches, volatileSnaps);

    expect(cStable).toBeGreaterThan(cVolatile);
  });
});

describe("computeRatingConfidence — clamp", () => {
  it("is always in [0, 1]", () => {
    const matches = Array.from({ length: 100 }, (_, i) =>
      makeMatch(`m${i}`, ["p1", "p2"], ["p3", "p4"], 100 - i),
    );
    const snaps = Array.from({ length: 100 }, (_, i) =>
      makeSnapshot("p1", `m${i}`, 1000, 100 - i),
    );
    const c = computeRatingConfidence("p1", matches, snaps);
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThanOrEqual(1);
  });
});
