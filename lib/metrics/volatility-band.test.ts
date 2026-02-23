import { computeVolatilityBand } from "./volatility-band";

describe("computeVolatilityBand", () => {
  it("returns a narrow band for high confidence and low volatility", () => {
    // Full confidence, zero volatility
    const result = computeVolatilityBand(0.6, 1, 1, 0, 0);
    // U = 0, Vn = 0, W = 0.08 × (0.5 + 0 + 0) = 0.04 → within ±5%
    expect(result.width).toBeLessThanOrEqual(0.05);
    expect(result.width).toBeGreaterThanOrEqual(0.03);
  });

  it("returns a wide band for low confidence and high volatility", () => {
    // Zero confidence, high volatility
    const result = computeVolatilityBand(0.5, 0, 0, 40, 40);
    // U = 1, Vn = 1, W = 0.08 × (0.5 + 1 + 1) = 0.20 → clamped at 0.20
    expect(result.width).toBeGreaterThanOrEqual(0.10);
    expect(result.width).toBeLessThanOrEqual(0.20);
  });

  it("width is always within the [3%, 20%] clamp", () => {
    const cases: [number, number, number, number, number][] = [
      [0.5, 0, 0, 0, 0],   // extreme low → clamp up to 0.03
      [0.5, 1, 1, 0, 0],   // high confidence, no vol
      [0.5, 0, 0, 100, 100], // extreme vol
      [0.5, 0.5, 0.5, 20, 20],
    ];
    for (const [p, cA, cB, vA, vB] of cases) {
      const { width } = computeVolatilityBand(p, cA, cB, vA, vB);
      expect(width).toBeGreaterThanOrEqual(0.03);
      expect(width).toBeLessThanOrEqual(0.20);
    }
  });

  it("lower = p − width and upper = p + width", () => {
    const p = 0.63;
    const { lower, upper, width } = computeVolatilityBand(p, 0.75, 0.75, 8, 8);
    expect(lower).toBeCloseTo(p - width, 10);
    expect(upper).toBeCloseTo(p + width, 10);
  });

  it("matches the PRD worked example (U=0.25, Vn=0.15 → W≈0.072)", () => {
    // P=0.63, Ua+Ub=0.5 → confidenceA=confidenceB=0.75 → U=0.25
    // V=(σa+σb)/2=6, Vn=6/40=0.15
    // W = 0.08*(0.5+0.25+0.15) = 0.08*0.90 = 0.072
    const { width } = computeVolatilityBand(0.63, 0.75, 0.75, 6, 6);
    expect(width).toBeCloseTo(0.072, 5);
  });
});
