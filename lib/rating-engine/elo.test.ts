import {
  teamRating,
  expectedScore,
  kFactor,
  computeRatingDelta,
  dynamicK,
  lopsidedGapFactor,
  marginOfVictoryMultiplier,
  BASE_K,
  K_MAX,
  K_MIN,
  K_DECAY_RATE,
  MOV_MIN,
  MOV_MAX,
} from "./elo";

describe("teamRating", () => {
  it("returns the average of two ratings", () => {
    expect(teamRating(1000, 1000)).toBe(1000);
    expect(teamRating(1200, 800)).toBe(1000);
    expect(teamRating(1100, 900)).toBe(1000);
    expect(teamRating(1500, 1300)).toBe(1400);
  });
});

describe("expectedScore", () => {
  it("returns ~0.5 for equal-rated teams", () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5, 5);
  });

  it("returns > 0.5 when team A is stronger", () => {
    expect(expectedScore(1200, 1000)).toBeGreaterThan(0.5);
  });

  it("returns < 0.5 when team A is weaker", () => {
    expect(expectedScore(800, 1000)).toBeLessThan(0.5);
  });

  it("is bounded strictly in (0, 1)", () => {
    const e = expectedScore(2000, 500);
    expect(e).toBeGreaterThan(0);
    expect(e).toBeLessThan(1);
  });

  it("sums to 1 for A and B perspectives", () => {
    const ea = expectedScore(1200, 1000);
    const eb = expectedScore(1000, 1200);
    expect(ea + eb).toBeCloseTo(1, 10);
  });
});

describe("kFactor", () => {
  it("returns a positive value", () => {
    expect(kFactor(BASE_K, 1, 1)).toBeGreaterThan(0);
    expect(kFactor(32, 0.5, 0.8)).toBeGreaterThan(0);
  });

  it("equals baseK when both weights are 1", () => {
    expect(kFactor(32, 1, 1)).toBe(32);
    expect(kFactor(24, 1, 1)).toBe(24);
  });

  it("scales down with weights < 1", () => {
    expect(kFactor(32, 0.5, 1)).toBe(16);
    expect(kFactor(32, 1, 0.5)).toBe(16);
    expect(kFactor(32, 0.5, 0.5)).toBe(8);
  });

  it("stays bounded (product of positive inputs is positive)", () => {
    const k = kFactor(BASE_K, 1.5, 1.2);
    expect(k).toBeGreaterThan(0);
    expect(k).toBeLessThan(1000); // sanity upper bound
  });
});

describe("dynamicK", () => {
  it("starts at K_MAX for a new player (n=0)", () => {
    expect(dynamicK(0)).toBeCloseTo(K_MAX, 5);
  });

  it("approaches K_MIN asymptotically for large n", () => {
    expect(dynamicK(200)).toBeCloseTo(K_MIN, 1);
  });

  it("is strictly decreasing", () => {
    expect(dynamicK(5)).toBeGreaterThan(dynamicK(10));
    expect(dynamicK(10)).toBeGreaterThan(dynamicK(20));
    expect(dynamicK(20)).toBeGreaterThan(dynamicK(50));
  });

  it("always returns a value in [K_MIN, K_MAX]", () => {
    for (const n of [0, 1, 5, 10, 20, 50, 100, 200]) {
      const k = dynamicK(n);
      expect(k).toBeGreaterThanOrEqual(K_MIN);
      expect(k).toBeLessThanOrEqual(K_MAX);
    }
  });

  it("at n=K_DECAY_RATE is approximately K_MIN + (K_MAX - K_MIN) / e", () => {
    const expected = K_MIN + (K_MAX - K_MIN) / Math.E;
    expect(dynamicK(K_DECAY_RATE)).toBeCloseTo(expected, 5);
  });
});

describe("lopsidedGapFactor", () => {
  it("returns 1.0 for a gap of 0 (evenly matched)", () => {
    expect(lopsidedGapFactor(0)).toBeCloseTo(1.0, 10);
  });

  it("is strictly decreasing as gap grows", () => {
    expect(lopsidedGapFactor(100)).toBeGreaterThan(lopsidedGapFactor(200));
    expect(lopsidedGapFactor(200)).toBeGreaterThan(lopsidedGapFactor(400));
    expect(lopsidedGapFactor(400)).toBeGreaterThan(lopsidedGapFactor(800));
  });

  it("is always in (0, 1]", () => {
    for (const gap of [0, 100, 200, 400, 800, 1600]) {
      const f = lopsidedGapFactor(gap);
      expect(f).toBeGreaterThan(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });

  it("is symmetric — sign of gap does not matter", () => {
    expect(lopsidedGapFactor(300)).toBeCloseTo(lopsidedGapFactor(-300), 10);
  });

  it("at gap=400 equals 1/e (same scale as ELO logistic)", () => {
    expect(lopsidedGapFactor(400)).toBeCloseTo(1 / Math.E, 5);
  });
});

describe("marginOfVictoryMultiplier", () => {
  it("returns 1.0 for empty arrays (fallback)", () => {
    expect(marginOfVictoryMultiplier([], [])).toBe(1.0);
  });

  it("returns 1.0 when total points is 0", () => {
    expect(marginOfVictoryMultiplier([0], [0])).toBe(1.0);
  });

  it("returns MOV_MIN for the closest possible result (50/50 points)", () => {
    // e.g. 10-10 single game — rawMargin = 0.5
    expect(marginOfVictoryMultiplier([10], [10])).toBeCloseTo(MOV_MIN, 5);
  });

  it("returns MOV_MAX for a shutout (winner scores all points)", () => {
    expect(marginOfVictoryMultiplier([11], [0])).toBeCloseTo(MOV_MAX, 5);
  });

  it("returns a value strictly between MOV_MIN and MOV_MAX for typical results", () => {
    const mov = marginOfVictoryMultiplier([11], [5]);
    expect(mov).toBeGreaterThan(MOV_MIN);
    expect(mov).toBeLessThan(MOV_MAX);
  });

  it("is always in [MOV_MIN, MOV_MAX]", () => {
    const cases: [number[], number[]][] = [
      [[11], [9]],
      [[11], [5]],
      [[11], [0]],
      [[11, 11], [8, 7]], // winner scores in two games, loser scores in two games
    ];
    for (const [w, l] of cases) {
      const mov = marginOfVictoryMultiplier(w, l);
      expect(mov).toBeGreaterThanOrEqual(MOV_MIN);
      expect(mov).toBeLessThanOrEqual(MOV_MAX);
    }
  });
});

describe("computeRatingDelta", () => {
  it("is positive for a win (actual = 1)", () => {
    expect(computeRatingDelta(32, 1, 0.5)).toBeGreaterThan(0);
    expect(computeRatingDelta(32, 1, 0.7)).toBeGreaterThan(0);
  });

  it("is negative for a loss (actual = 0)", () => {
    expect(computeRatingDelta(32, 0, 0.5)).toBeLessThan(0);
    expect(computeRatingDelta(32, 0, 0.3)).toBeLessThan(0);
  });

  it("equals K × (1 - E) for a win", () => {
    expect(computeRatingDelta(32, 1, 0.6)).toBeCloseTo(32 * (1 - 0.6), 10);
  });

  it("equals K × (0 - E) for a loss", () => {
    expect(computeRatingDelta(32, 0, 0.6)).toBeCloseTo(32 * (0 - 0.6), 10);
  });

  it("is zero when actual equals expected", () => {
    expect(computeRatingDelta(32, 0.5, 0.5)).toBeCloseTo(0, 10);
  });

  it("winner and loser deltas are equal and opposite for equal expected", () => {
    const k = 32;
    const e = expectedScore(1000, 1000); // 0.5
    const winnerDelta = computeRatingDelta(k, 1, e);
    const loserDelta = computeRatingDelta(k, 0, 1 - e);
    expect(winnerDelta + loserDelta).toBeCloseTo(0, 10);
  });
});
