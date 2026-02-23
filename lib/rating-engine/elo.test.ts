import {
  teamRating,
  expectedScore,
  kFactor,
  computeRatingDelta,
  BASE_K,
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
