import { computeWinProbability, computeMoneyline } from "./matchup";

describe("computeWinProbability", () => {
  it("returns 0.5 when both pairs have equal aggregate ratings", () => {
    expect(computeWinProbability(1000, 1000, 1000, 1000)).toBeCloseTo(0.5);
  });

  it("returns > 0.5 when Pair A has a higher aggregate rating than Pair B", () => {
    expect(computeWinProbability(1100, 1100, 1000, 1000)).toBeGreaterThan(0.5);
  });

  it("returns < 0.5 when Pair A has a lower aggregate rating than Pair B", () => {
    expect(computeWinProbability(1000, 1000, 1100, 1100)).toBeLessThan(0.5);
  });

  it("returns a value strictly between 0 and 1", () => {
    const p = computeWinProbability(2000, 2000, 500, 500);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
  });

  it("favours the stronger pair (mixed ratings)", () => {
    // Pair A = 0.6*1100 + 0.4*1000 = 1060 vs Pair B 1000 → A favoured
    const p = computeWinProbability(1100, 1000, 1000, 1000);
    expect(p).toBeGreaterThan(0.5);
  });

  it("rates a lopsided pair above an even pair with the same average", () => {
    // Both average 1000, but the stronger partner carries 60% of the weight,
    // so (1100, 900) is rated 1020 against (1000, 1000)'s 1000.
    const p = computeWinProbability(1100, 900, 1000, 1000);
    expect(p).toBeGreaterThan(0.5);
  });

  it("is symmetric — swapping both pairs inverts the probability", () => {
    const p = computeWinProbability(1200, 900, 1050, 1000);
    const q = computeWinProbability(1050, 1000, 1200, 900);
    expect(p + q).toBeCloseTo(1, 10);
  });

  it("does not depend on the order of players within a pair", () => {
    expect(computeWinProbability(1200, 900, 1000, 1000)).toBeCloseTo(
      computeWinProbability(900, 1200, 1000, 1000),
      10,
    );
  });
});

describe("computeMoneyline", () => {
  describe("Even range (0.47 ≤ p ≤ 0.53)", () => {
    it('returns "Even" at exactly p = 0.50', () => {
      expect(computeMoneyline(0.5)).toBe("Even");
    });

    it('returns "Even" at the lower bound p = 0.47', () => {
      expect(computeMoneyline(0.47)).toBe("Even");
    });

    it('returns "Even" at the upper bound p = 0.53', () => {
      expect(computeMoneyline(0.53)).toBe("Even");
    });

    it('returns "Even" within the range (p = 0.51)', () => {
      expect(computeMoneyline(0.51)).toBe("Even");
    });
  });

  describe("Favourite (p > 0.53) — negative moneyline", () => {
    it("returns a negative number for p = 0.63", () => {
      const ml = computeMoneyline(0.63);
      expect(typeof ml).toBe("number");
      expect(ml as number).toBeLessThan(0);
    });

    it("rounds to nearest 5 for p = 0.63", () => {
      // Raw: -100 * 0.63 / 0.37 ≈ -170.27 → rounds to -170
      const ml = computeMoneyline(0.63) as number;
      expect(Math.abs(ml % 5)).toBe(0);
    });

    it("returns a larger negative number for a higher probability", () => {
      const ml60 = computeMoneyline(0.60) as number;
      const ml75 = computeMoneyline(0.75) as number;
      expect(ml75).toBeLessThan(ml60);
    });
  });

  describe("Underdog (p < 0.47) — positive moneyline", () => {
    it("returns a positive number for p = 0.37", () => {
      const ml = computeMoneyline(0.37);
      expect(typeof ml).toBe("number");
      expect(ml as number).toBeGreaterThan(0);
    });

    it("rounds to nearest 5 for p = 0.37", () => {
      // Raw: 100 * 0.63 / 0.37 ≈ +170.27 → rounds to +170
      const ml = computeMoneyline(0.37) as number;
      expect(Math.abs(ml % 5)).toBe(0);
    });

    it("returns a larger positive number for a lower probability", () => {
      const ml40 = computeMoneyline(0.40) as number;
      const ml25 = computeMoneyline(0.25) as number;
      expect(ml25).toBeGreaterThan(ml40);
    });
  });

  describe("Boundary just outside Even range", () => {
    it("returns a number (not Even) at p = 0.46", () => {
      expect(computeMoneyline(0.46)).not.toBe("Even");
      expect(typeof computeMoneyline(0.46)).toBe("number");
    });

    it("returns a number (not Even) at p = 0.54", () => {
      expect(computeMoneyline(0.54)).not.toBe("Even");
      expect(typeof computeMoneyline(0.54)).toBe("number");
    });
  });
});
