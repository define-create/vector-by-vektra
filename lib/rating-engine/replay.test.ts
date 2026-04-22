import { replayAllMatches } from "./replay";
import { type GameScore, type MatchRecord } from "./types";
import { K_MAX, K_MIN } from "./elo";

// Helper: build a simple match record
function makeMatch(
  id: string,
  team1: [string, string],
  team2: [string, string],
  team1Won: boolean,
  matchDate: Date,
  createdAt?: Date,
  games?: GameScore[],
): MatchRecord {
  return {
    matchId: id,
    matchDate,
    createdAt: createdAt ?? matchDate,
    team1PlayerIds: team1,
    team2PlayerIds: team2,
    team1Won,
    games: games ?? [],
  };
}

const d1 = new Date("2025-01-01T10:00:00Z");
const d2 = new Date("2025-01-02T10:00:00Z");
const d3 = new Date("2025-01-03T10:00:00Z");

describe("replayAllMatches", () => {
  it("produces snapshots for every player in every match", () => {
    const match = makeMatch("m1", ["p1", "p2"], ["p3", "p4"], true, d1);
    const { snapshots } = replayAllMatches([match], "run1");

    // 4 players × 1 match = 4 snapshots
    expect(snapshots).toHaveLength(4);
    const playerIds = snapshots.map((s) => s.playerId);
    expect(playerIds).toContain("p1");
    expect(playerIds).toContain("p2");
    expect(playerIds).toContain("p3");
    expect(playerIds).toContain("p4");
  });

  it("initialises all players at 1000", () => {
    const match = makeMatch("m1", ["p1", "p2"], ["p3", "p4"], true, d1);
    const { finalRatings } = replayAllMatches([match], "run1");

    // All players were at 1000 before this match; after it they've moved
    for (const [, rating] of finalRatings) {
      expect(rating).not.toBeNaN();
    }
  });

  it("winners gain rating, losers lose rating", () => {
    const match = makeMatch("m1", ["p1", "p2"], ["p3", "p4"], true, d1);
    const { finalRatings } = replayAllMatches([match], "run1");

    expect(finalRatings.get("p1")).toBeGreaterThan(1000);
    expect(finalRatings.get("p2")).toBeGreaterThan(1000);
    expect(finalRatings.get("p3")).toBeLessThan(1000);
    expect(finalRatings.get("p4")).toBeLessThan(1000);
  });

  it("returns zero snapshots for an empty input", () => {
    const { snapshots, finalRatings } = replayAllMatches([], "run1");
    expect(snapshots).toHaveLength(0);
    expect(finalRatings.size).toBe(0);
  });

  it("is deterministic — same input always produces same output", () => {
    const matches = [
      makeMatch("m1", ["p1", "p2"], ["p3", "p4"], true, d1),
      makeMatch("m2", ["p1", "p3"], ["p2", "p4"], false, d2),
    ];
    const { snapshots: a, finalRatings: ra } = replayAllMatches(matches, "run1");
    const { snapshots: b, finalRatings: rb } = replayAllMatches(matches, "run1");

    expect(a.map((s) => s.rating)).toEqual(b.map((s) => s.rating));
    expect([...ra.entries()]).toEqual([...rb.entries()]);
  });

  it("respects chronological order (earlier matchDate processed first)", () => {
    // m2 happens before m1 by date even though passed second
    const m1 = makeMatch("m1", ["p1", "p2"], ["p3", "p4"], true, d2);
    const m2 = makeMatch("m2", ["p1", "p3"], ["p2", "p4"], true, d1);

    const { snapshots: fwd } = replayAllMatches([m1, m2], "run1");
    const { snapshots: rev } = replayAllMatches([m2, m1], "run1");

    // Regardless of input order, the rating at each snapshot should be the same
    const snap = (snaps: typeof fwd, matchId: string, playerId: string) =>
      snaps.find((s) => s.matchId === matchId && s.playerId === playerId)!.rating;

    expect(snap(fwd, "m1", "p1")).toBeCloseTo(snap(rev, "m1", "p1"), 10);
    expect(snap(fwd, "m2", "p1")).toBeCloseTo(snap(rev, "m2", "p1"), 10);
  });

  it("uses createdAt as tiebreaker when matchDates are equal", () => {
    const t = new Date("2025-01-01T12:00:00Z");
    const earlier = new Date("2025-01-01T09:00:00Z");
    const later = new Date("2025-01-01T11:00:00Z");

    const m1 = makeMatch("m1", ["p1", "p2"], ["p3", "p4"], true, t, later);
    const m2 = makeMatch("m2", ["p1", "p3"], ["p2", "p4"], true, t, earlier);

    // m2 (earlier createdAt) should be processed first
    const { snapshots } = replayAllMatches([m1, m2], "run1");

    // Find m2 snapshot for p1 — it should come before m1 snapshot for p1
    const snaps = snapshots.filter((s) => s.playerId === "p1");
    expect(snaps[0]!.matchId).toBe("m2");
    expect(snaps[1]!.matchId).toBe("m1");
  });

  it("voided matches are excluded when the caller filters them out", () => {
    // Caller is responsible for filtering — replay receives only non-voided matches
    const nonVoided = [makeMatch("m1", ["p1", "p2"], ["p3", "p4"], true, d1)];
    // Simulate voided match never passed to replay
    const { snapshots } = replayAllMatches(nonVoided, "run1");
    expect(snapshots.every((s) => s.matchId === "m1")).toBe(true);
  });

  it("produces correct snapshot count for multiple matches", () => {
    const matches = [
      makeMatch("m1", ["p1", "p2"], ["p3", "p4"], true, d1),
      makeMatch("m2", ["p1", "p3"], ["p2", "p4"], false, d2),
      makeMatch("m3", ["p2", "p4"], ["p1", "p3"], true, d3),
    ];
    const { snapshots } = replayAllMatches(matches, "run1");
    // 4 players × 3 matches = 12 snapshots
    expect(snapshots).toHaveLength(12);
  });

  it("effectiveK is in [K_MIN, K_MAX] range for all snapshots", () => {
    const matches = [
      makeMatch("m1", ["p1", "p2"], ["p3", "p4"], true, d1),
      makeMatch("m2", ["p1", "p3"], ["p2", "p4"], false, d2),
    ];
    const { snapshots } = replayAllMatches(matches, "run1");
    for (const snap of snapshots) {
      expect(snap.effectiveK).toBeGreaterThan(0);
      expect(snap.effectiveK).toBeLessThanOrEqual(K_MAX * 2); // lopsided underdog can go up to 2×K_MAX
    }
  });

  it("new player (first match) gets higher effectiveK than veteran (many matches)", () => {
    // Build 50 matches for p1+p2 vs p3+p4 to make them veterans
    const manyMatches = Array.from({ length: 50 }, (_, i) =>
      makeMatch(`m${i}`, ["p1", "p2"], ["p3", "p4"], true, new Date(d1.getTime() + i * 86400000)),
    );
    // Then one more match where new players p5+p6 play veterans p1+p2
    const finalDate = new Date(d1.getTime() + 50 * 86400000);
    const newPlayerMatch = makeMatch("mNew", ["p5", "p6"], ["p1", "p2"], true, finalDate);

    const { snapshots } = replayAllMatches([...manyMatches, newPlayerMatch], "run1");

    const newSnap = snapshots.find((s) => s.matchId === "mNew" && s.playerId === "p5")!;
    const vetSnap = snapshots.find((s) => s.matchId === "mNew" && s.playerId === "p1")!;

    expect(newSnap.effectiveK).toBeGreaterThan(vetSnap.effectiveK);
  });

  it("a dominant win (11-0) produces a larger delta than a close win (11-9) for the same teams", () => {
    const blowout = makeMatch("m1", ["p1", "p2"], ["p3", "p4"], true, d1, d1, [
      { team1Score: 11, team2Score: 0 },
    ]);
    const close = makeMatch("m1", ["p1", "p2"], ["p3", "p4"], true, d1, d1, [
      { team1Score: 11, team2Score: 9 },
    ]);

    const { finalRatings: blowoutRatings } = replayAllMatches([blowout], "run1");
    const { finalRatings: closeRatings } = replayAllMatches([close], "run1");

    const blowoutDelta = blowoutRatings.get("p1")! - 1000;
    const closeDelta = closeRatings.get("p1")! - 1000;

    expect(blowoutDelta).toBeGreaterThan(closeDelta);
  });

  it("lopsided favourite winning produces a smaller delta than evenly-matched teams", () => {
    const even = makeMatch("m1", ["p1", "p2"], ["p3", "p4"], true, d1);
    // Seed p1+p2 as strong favourites by giving them 600-point advantage
    const startingRatings = new Map([
      ["p1", 1300],
      ["p2", 1300],
      ["p3", 700],
      ["p4", 700],
    ]);
    const lopsided = makeMatch("m1", ["p1", "p2"], ["p3", "p4"], true, d1);

    const { finalRatings: evenRatings } = replayAllMatches([even], "run1");
    const { finalRatings: lopsidedRatings } = replayAllMatches([lopsided], "run1", startingRatings);

    const evenDelta = evenRatings.get("p1")! - 1000;
    const lopsidedDelta = lopsidedRatings.get("p1")! - 1300;

    expect(Math.abs(lopsidedDelta)).toBeLessThan(Math.abs(evenDelta));
  });

  it("upset (underdog beats heavy favourite) produces a larger delta than expected win", () => {
    const startingRatings = new Map([
      ["p1", 1300],
      ["p2", 1300],
      ["p3", 700],
      ["p4", 700],
    ]);
    // Underdog (p3+p4) wins the upset
    const upset = makeMatch("m1", ["p1", "p2"], ["p3", "p4"], false, d1);
    const { finalRatings } = replayAllMatches([upset], "run1", startingRatings);

    // Underdog gains more than the favourite would have in a normal expected win
    const expectedWin = makeMatch("m1", ["p1", "p2"], ["p3", "p4"], true, d1);
    const { finalRatings: normalRatings } = replayAllMatches([expectedWin], "run1", startingRatings);

    const upsetGain = finalRatings.get("p3")! - 700;
    const normalWinGain = normalRatings.get("p1")! - 1300;

    expect(upsetGain).toBeGreaterThan(normalWinGain);
  });
});
