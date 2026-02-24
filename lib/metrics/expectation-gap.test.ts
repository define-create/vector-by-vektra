import {
  computeExpectationGap,
  type MatchForGap,
  type SnapshotForGap,
} from "./expectation-gap";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const P1 = "player-1";
const PARTNER = "partner";
const OPP1 = "opp-1";
const OPP2 = "opp-2";
const OTHER = "other-player";

/** Match where P1+PARTNER beat OPP1+OPP2. Pair vs Pair (scope 1). */
function pairVsPairWin(matchId: string): MatchForGap {
  return {
    matchId,
    team1PlayerIds: [P1, PARTNER],
    team2PlayerIds: [OPP1, OPP2],
    team1Won: true,
  };
}

/** Match where P1+PARTNER lost to OPP1+OPP2. Pair vs Pair (scope 1). */
function pairVsPairLoss(matchId: string): MatchForGap {
  return {
    matchId,
    team1PlayerIds: [P1, PARTNER],
    team2PlayerIds: [OPP1, OPP2],
    team1Won: false,
  };
}

/** Match where P1+OTHER beat OPP1+OPP2. Scope 3 (player vs opp pair). */
function playerVsOppPairWin(matchId: string): MatchForGap {
  return {
    matchId,
    team1PlayerIds: [P1, OTHER],
    team2PlayerIds: [OPP1, OPP2],
    team1Won: true,
  };
}

/** Match involving P1 but not the specific opponents. Global only (scope 5). */
function globalMatch(matchId: string, p1Won: boolean): MatchForGap {
  return {
    matchId,
    team1PlayerIds: [P1, OTHER],
    team2PlayerIds: ["stranger-1", "stranger-2"],
    team1Won: p1Won,
  };
}

/** Snapshot where P1's expected score was Ei. */
function snap(matchId: string, expectedScore: number): SnapshotForGap {
  return { matchId, expectedScore };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Shrinkage: w = n / (n + 5) */
function w(n: number): number {
  return n / (n + 5);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("computeExpectationGap", () => {
  describe("Scope 1 — Pair vs Pair", () => {
    it("uses scope 1 when pair H2H data is available", () => {
      const matches = [pairVsPairWin("m1"), pairVsPairWin("m2"), pairVsPairWin("m3")];
      const snapshots = [snap("m1", 0.5), snap("m2", 0.5), snap("m3", 0.5)];

      // All 3 matches: Ai=1, Ei=0.5 → raw = (1−0.5)*3/3 * 100 = 50
      // w = 3/8 = 0.375
      const result = computeExpectationGap(P1, PARTNER, OPP1, OPP2, matches, snapshots);
      expect(result.n).toBe(3);
      expect(result.value).toBeCloseTo(50 * w(3), 5);
      expect(result.lowSample).toBe(false);
    });

    it("produces a negative value when P1 underperforms expectation", () => {
      const matches = [pairVsPairLoss("m1"), pairVsPairLoss("m2"), pairVsPairLoss("m3")];
      // Ei=0.7 but player lost → Ai=0 → gap per match = 0-0.7 = -0.7
      const snapshots = [snap("m1", 0.7), snap("m2", 0.7), snap("m3", 0.7)];
      const result = computeExpectationGap(P1, PARTNER, OPP1, OPP2, matches, snapshots);
      expect(result.value).toBeLessThan(0);
    });
  });

  describe("Scope ladder fallback", () => {
    it("falls back to scope 3 (player vs opp pair) when scope 1 and 2 have no data", () => {
      // Only scope-3 matches available (P1 with OTHER partner vs OPP1+OPP2)
      const matches = [
        playerVsOppPairWin("m1"),
        playerVsOppPairWin("m2"),
        playerVsOppPairWin("m3"),
      ];
      const snapshots = [snap("m1", 0.5), snap("m2", 0.5), snap("m3", 0.5)];

      const result = computeExpectationGap(P1, PARTNER, OPP1, OPP2, matches, snapshots);
      expect(result.n).toBe(3);
      expect(result.value).toBeCloseTo(50 * w(3), 5);
    });

    it("falls back to scope 5 (global) when no opponent-specific data exists", () => {
      const matches = [
        globalMatch("m1", true),
        globalMatch("m2", true),
        globalMatch("m3", false),
      ];
      // 2 wins (Ai=1), 1 loss (Ai=0). Ei=0.5 for all.
      // raw = ((0.5 + 0.5 + (-0.5)) / 3) * 100 = (0.5/3) * 100 ≈ 16.67
      const snapshots = [snap("m1", 0.5), snap("m2", 0.5), snap("m3", 0.5)];

      const result = computeExpectationGap(P1, PARTNER, OPP1, OPP2, matches, snapshots);
      expect(result.n).toBe(3);
      expect(result.value).toBeCloseTo((50 / 3) * w(3), 4);
    });
  });

  describe("Shrinkage", () => {
    it("applies w = n/(n+5) shrinkage to the raw score", () => {
      const matches = [pairVsPairWin("m1")]; // n=1, w=1/6
      const snapshots = [snap("m1", 0.5)];
      // raw = 50, w = 1/6
      const result = computeExpectationGap(P1, PARTNER, OPP1, OPP2, matches, snapshots);
      expect(result.value).toBeCloseTo(50 * w(1), 5);
    });

    it("approaches the unshrunk value as n grows", () => {
      const matches = Array.from({ length: 20 }, (_, i) => pairVsPairWin(`m${i}`));
      const snapshots = matches.map((m) => snap(m.matchId, 0.5));
      // raw = 50, w = 20/25 = 0.8
      const result = computeExpectationGap(P1, PARTNER, OPP1, OPP2, matches, snapshots);
      expect(result.value).toBeCloseTo(50 * w(20), 5);
    });
  });

  describe("lowSample flag", () => {
    it("sets lowSample = true when n < 3", () => {
      const matches = [pairVsPairWin("m1"), pairVsPairWin("m2")];
      const snapshots = [snap("m1", 0.5), snap("m2", 0.5)];
      const result = computeExpectationGap(P1, PARTNER, OPP1, OPP2, matches, snapshots);
      expect(result.n).toBe(2);
      expect(result.lowSample).toBe(true);
    });

    it("sets lowSample = false when n >= 3", () => {
      const matches = [
        pairVsPairWin("m1"),
        pairVsPairWin("m2"),
        pairVsPairWin("m3"),
      ];
      const snapshots = [snap("m1", 0.5), snap("m2", 0.5), snap("m3", 0.5)];
      const result = computeExpectationGap(P1, PARTNER, OPP1, OPP2, matches, snapshots);
      expect(result.lowSample).toBe(false);
    });
  });

  describe("Edge cases", () => {
    it("returns { value: 0, n: 0, lowSample: true } when no matches exist at any scope", () => {
      const result = computeExpectationGap(P1, PARTNER, OPP1, OPP2, [], []);
      expect(result).toEqual({ value: 0, n: 0, lowSample: true });
    });

    it("skips matches where no snapshot exists for the primary player", () => {
      const matches = [pairVsPairWin("m1"), pairVsPairWin("m2")];
      // Only provide snapshot for m1
      const snapshots = [snap("m1", 0.5)];
      const result = computeExpectationGap(P1, PARTNER, OPP1, OPP2, matches, snapshots);
      expect(result.n).toBe(1); // m2 skipped
    });

    it("handles P1 on team 2 correctly (Ai derived from opponent perspective)", () => {
      // P1+PARTNER on team 2, OPP1+OPP2 on team 1, team1Won=false → P1's team won
      const match: MatchForGap = {
        matchId: "m1",
        team1PlayerIds: [OPP1, OPP2],
        team2PlayerIds: [P1, PARTNER],
        team1Won: false, // team 2 won → P1 won
      };
      const snapshots = [snap("m1", 0.5)];
      const result = computeExpectationGap(P1, PARTNER, OPP1, OPP2, [match], snapshots);
      // Ai=1 (P1 won), Ei=0.5 → raw = 50, w = 1/6
      expect(result.value).toBeCloseTo(50 * w(1), 5);
    });
  });
});
