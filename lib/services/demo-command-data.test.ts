/**
 * Unit tests for buildDemoCommandData.
 */

import { buildDemoCommandData } from "./demo-command-data";

describe("buildDemoCommandData", () => {
  it("uses the given displayName for userDisplayName and myPlayerDisplayName", () => {
    const data = buildDemoCommandData("Alice");
    expect(data.userDisplayName).toBe("Alice");
    expect(data.myPlayerDisplayName).toBe("Alice");
  });

  it("returns the locked rating from PRD §10.1", () => {
    const data = buildDemoCommandData("X");
    expect(data.rating).toBe(1083);
    expect(data.winPct).toBe(0.6);
    expect(data.compoundingIndex).toBe(12);
    expect(data.driftScore).toBe(-8);
    expect(data.upcomingProbability).toBe(0.58);
    expect(data.dominantDriver).toBe("winRate");
  });

  it("returns 6 match history entries with single-letter placeholder names", () => {
    const data = buildDemoCommandData("X");
    expect(data.recentMatchHistory).toHaveLength(6);
    for (const m of data.recentMatchHistory) {
      expect(m.partnerName).toMatch(/^Player [A-F]$/);
      expect(m.tag).toBe("Demo League");
      for (const opp of m.opponentNames) {
        expect(opp).toMatch(/^Player [A-F]$/);
      }
    }
  });

  it("returns 10 rating history points", () => {
    const data = buildDemoCommandData("X");
    expect(data.ratingHistory).toHaveLength(10);
    expect(data.ratingHistory[0].rating).toBe(1010);
    expect(data.ratingHistory[9].rating).toBe(1083);
  });

  it("returns community stats locked at avg=1000, min=880, max=1240", () => {
    const data = buildDemoCommandData("X");
    expect(data.communityStats).toEqual({ avg: 1000, min: 880, max: 1240 });
  });

  it("returns deterministic structure across calls with same input (excluding dates)", () => {
    const a = buildDemoCommandData("X");
    const b = buildDemoCommandData("X");
    // Strip date fields before comparing — those vary by milliseconds within a call.
    const strip = (d: ReturnType<typeof buildDemoCommandData>) => ({
      ...d,
      ratingHistory: d.ratingHistory.map(({ rating, outcome }) => ({ rating, outcome })),
      recentMatchHistory: d.recentMatchHistory.map((m) => ({ ...m, matchDate: "" })),
    });
    expect(strip(a)).toEqual(strip(b));
  });

  it("EditTimerLink fields are null (link is hidden during preview)", () => {
    const data = buildDemoCommandData("X");
    expect(data.editTimer).toEqual({ expiresAt: null, matchId: null });
  });

  it("rating history dates are progressively older (oldest first)", () => {
    const data = buildDemoCommandData("X");
    for (let i = 1; i < data.ratingHistory.length; i++) {
      const prev = new Date(data.ratingHistory[i - 1].date).getTime();
      const curr = new Date(data.ratingHistory[i].date).getTime();
      expect(curr).toBeGreaterThan(prev);
    }
  });

  it("recent matches are newest first", () => {
    const data = buildDemoCommandData("X");
    for (let i = 1; i < data.recentMatchHistory.length; i++) {
      const prev = new Date(data.recentMatchHistory[i - 1].matchDate).getTime();
      const curr = new Date(data.recentMatchHistory[i].matchDate).getTime();
      expect(curr).toBeLessThan(prev);
    }
  });
});
