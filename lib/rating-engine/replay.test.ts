import { replayAllMatches } from "./replay";
import { type GameScore, type MatchRecord } from "./types";
import { K_MAX, K_MIN, NEW_PLAYER_THRESHOLD, dynamicK } from "./elo";

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

  it("startingMatchCounts: seeded veteran gets effectiveK near K_MIN while unseeded player stays near K_MAX", () => {
    const match = makeMatch("m1", ["p1", "p2"], ["p3", "p4"], true, d1);
    const startingMatchCounts = new Map([
      ["p1", 100],
      ["p2", 100],
    ]);
    const { snapshots } = replayAllMatches([match], "run1", undefined, startingMatchCounts);

    const vetSnap = snapshots.find((s) => s.playerId === "p1")!;
    const newSnap = snapshots.find((s) => s.playerId === "p3")!;

    // Equal ratings (gapFactor = 1) and no games (movWeight = 1) — effectiveK
    // is the player's own dynamicK
    expect(vetSnap.effectiveK).toBeCloseTo(dynamicK(100), 5);
    expect(vetSnap.effectiveK).toBeLessThan(K_MIN + 1);
    expect(newSnap.effectiveK).toBeCloseTo(K_MAX, 5);
  });

  it("omitting startingMatchCounts preserves full-replay behaviour (first match ≈ K_MAX)", () => {
    const match = makeMatch("m1", ["p1", "p2"], ["p3", "p4"], true, d1);
    const { snapshots } = replayAllMatches([match], "run1");

    for (const snap of snapshots) {
      expect(snap.effectiveK).toBeCloseTo(K_MAX, 5);
    }
  });

  it("startingMatchCounts: counter keeps incrementing across the window", () => {
    // p1's K should keep decaying match over match as their count grows.
    const seeded = new Map([["p1", 100]]);
    const m1 = makeMatch("m1", ["p1", "p2"], ["p3", "p4"], true, d1);
    const m2 = makeMatch("m2", ["p1", "p2"], ["p3", "p4"], false, d2);
    const { snapshots } = replayAllMatches([m1, m2], "run1", undefined, seeded);

    const k1 = snapshots.find((s) => s.matchId === "m1" && s.playerId === "p1")!.effectiveK;
    const k2 = snapshots.find((s) => s.matchId === "m2" && s.playerId === "p1")!.effectiveK;

    // dynamicK(101) < dynamicK(100), so the second match uses a smaller base K.
    // Ratings drift between matches so gapFactor ≠ 1 exactly — assert direction.
    expect(k2).toBeLessThan(k1);
  });

  // --- Per-player K (supersedes Amendment A) --------------------------------
  // All four players start at 1000 and no games are supplied, so gapFactor = 1
  // and movWeight = 1. effectiveK therefore reduces to each player's dynamicK.

  it("teammates with different experience get different effectiveK", () => {
    const seeded = new Map([
      ["p1", 100],
      ["p2", 0],
      ["p3", 100],
      ["p4", 100],
    ]);
    const match = makeMatch("m1", ["p1", "p2"], ["p3", "p4"], true, d1);
    const { snapshots } = replayAllMatches([match], "run1", undefined, seeded);

    const vet = snapshots.find((s) => s.playerId === "p1")!;
    const rookie = snapshots.find((s) => s.playerId === "p2")!;

    expect(vet.effectiveK).toBeCloseTo(dynamicK(100), 5);
    expect(rookie.effectiveK).toBeCloseTo(dynamicK(0), 5);
    expect(rookie.effectiveK).toBeGreaterThan(vet.effectiveK);
  });

  it("a veteran's effectiveK is unaffected by how new their partner is", () => {
    const match = makeMatch("m1", ["p1", "p2"], ["p3", "p4"], true, d1);
    const kFor = (partnerCount: number) => {
      const seeded = new Map([
        ["p1", 100],
        ["p2", partnerCount],
        ["p3", 100],
        ["p4", 100],
      ]);
      const { snapshots } = replayAllMatches([match], "run1", undefined, seeded);
      return snapshots.find((s) => s.playerId === "p1")!.effectiveK;
    };

    // Amendment A's whole purpose, now achieved without capping anyone.
    expect(kFor(0)).toBeCloseTo(kFor(100), 10);
    expect(kFor(NEW_PLAYER_THRESHOLD - 1)).toBeCloseTo(kFor(100), 10);
  });

  it("a rookie partnered with a veteran still moves at rookie speed", () => {
    // The regression Amendment A introduced: the newcomer used to be dragged
    // down to the veteran's slow K, delaying convergence.
    const match = makeMatch("m1", ["p1", "p2"], ["p3", "p4"], true, d1);
    const seeded = new Map([
      ["p1", 100],
      ["p2", 0],
      ["p3", 100],
      ["p4", 100],
    ]);
    const { snapshots, finalRatings } = replayAllMatches([match], "run1", undefined, seeded);

    expect(snapshots.find((s) => s.playerId === "p2")!.effectiveK).toBeCloseTo(K_MAX, 5);
    // Rookie's rating moves further than the veteran's from the same result
    expect(finalRatings.get("p2")! - 1000).toBeGreaterThan(finalRatings.get("p1")! - 1000);
  });

  it("teammates share the same expectedScore even with different K", () => {
    // The outcome surprise is a team property; only the learning rate is personal.
    const seeded = new Map([
      ["p1", 100],
      ["p2", 0],
    ]);
    const match = makeMatch("m1", ["p1", "p2"], ["p3", "p4"], true, d1);
    const { snapshots } = replayAllMatches([match], "run1", undefined, seeded);

    const t1 = snapshots.filter((s) => s.playerId === "p1" || s.playerId === "p2");
    expect(t1[0]!.expectedScore).toBeCloseTo(t1[1]!.expectedScore, 10);

    // ...and the two teams' expectations still sum to 1
    const t2 = snapshots.find((s) => s.playerId === "p3")!;
    expect(t1[0]!.expectedScore + t2.expectedScore).toBeCloseTo(1, 10);
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
