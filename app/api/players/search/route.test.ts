/**
 * Unit tests for the player search response mapping.
 *
 * The route itself is trivially thin (Prisma query → JSON). These tests cover
 * the mapping transformations — both the base response and the enriched
 * includeStats=true response — without pulling in Next.js or Prisma at runtime.
 */

// ---------------------------------------------------------------------------
// Local re-implementation of the response mapping (mirrors route.ts exactly)
// ---------------------------------------------------------------------------

interface RawPlayer {
  id: string;
  displayName: string;
  rating: number;
  claimed: boolean;
  _count: { matchParticipants: number };
}

interface RawParticipation {
  team: number;
  match: { games: { team1Score: number; team2Score: number }[] };
}

function mapSearchResult(players: RawPlayer[]) {
  return players.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    rating: p.rating,
    claimed: p.claimed,
    matchCount: p._count.matchParticipants,
  }));
}

type EnrichedPlayer = RawPlayer & { matchParticipants: { match: { matchDate: Date } }[] };

function mapEnriched(p: EnrichedPlayer, winPct: number | null) {
  return {
    id: p.id,
    displayName: p.displayName,
    rating: p.rating,
    claimed: p.claimed,
    matchCount: p._count.matchParticipants,
    lastMatchDate: p.matchParticipants[0]?.match.matchDate.toISOString() ?? null,
    winPct,
  };
}

function computeWinPct(participations: RawParticipation[]): number | null {
  if (participations.length < 3) return null;
  let wins = 0;
  for (const p of participations) {
    let t1Wins = 0;
    let t2Wins = 0;
    for (const g of p.match.games) {
      if (g.team1Score > g.team2Score) t1Wins++;
      else if (g.team2Score > g.team1Score) t2Wins++;
    }
    if (p.team === 1 ? t1Wins > t2Wins : t2Wins > t1Wins) wins++;
  }
  return wins / participations.length;
}

// ---------------------------------------------------------------------------
// Base mapping tests (includeStats=false)
// ---------------------------------------------------------------------------

describe("player search response mapping — base (includeStats=false)", () => {
  it("includes matchCount derived from _count.matchParticipants", () => {
    const raw: RawPlayer[] = [
      { id: "p1", displayName: "Alice", rating: 1050, claimed: true, _count: { matchParticipants: 8 } },
    ];
    const result = mapSearchResult(raw);
    expect(result[0]).toMatchObject({ id: "p1", matchCount: 8 });
  });

  it("sets matchCount to 0 when player has no match history", () => {
    const raw: RawPlayer[] = [
      { id: "p2", displayName: "Shadow", rating: 1000, claimed: false, _count: { matchParticipants: 0 } },
    ];
    expect(mapSearchResult(raw)[0]!.matchCount).toBe(0);
  });

  it("maps all players in the array", () => {
    const raw: RawPlayer[] = [
      { id: "a", displayName: "Alpha", rating: 1100, claimed: true,  _count: { matchParticipants: 5 } },
      { id: "b", displayName: "Beta",  rating: 980,  claimed: false, _count: { matchParticipants: 0 } },
      { id: "c", displayName: "Gamma", rating: 1025, claimed: true,  _count: { matchParticipants: 12 } },
    ];
    const result = mapSearchResult(raw);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.matchCount)).toEqual([5, 0, 12]);
  });

  it("does not include _count in the mapped output", () => {
    const raw: RawPlayer[] = [
      { id: "p3", displayName: "Test", rating: 1000, claimed: false, _count: { matchParticipants: 3 } },
    ];
    expect(mapSearchResult(raw)[0]).not.toHaveProperty("_count");
  });

  it("preserves id, displayName, rating, and claimed fields unchanged", () => {
    const raw: RawPlayer[] = [
      { id: "xyz", displayName: "Almir", rating: 1042.7, claimed: true, _count: { matchParticipants: 7 } },
    ];
    expect(mapSearchResult(raw)[0]).toMatchObject({
      id: "xyz",
      displayName: "Almir",
      rating: 1042.7,
      claimed: true,
    });
  });

  it("returns empty array when input is empty", () => {
    expect(mapSearchResult([])).toEqual([]);
  });

  it("does not include lastMatchDate or winPct in base response", () => {
    const result = mapSearchResult([
      { id: "p4", displayName: "Dave", rating: 1000, claimed: false, _count: { matchParticipants: 5 } },
    ]);
    expect(result[0]).not.toHaveProperty("lastMatchDate");
    expect(result[0]).not.toHaveProperty("winPct");
  });
});

// ---------------------------------------------------------------------------
// Enriched mapping tests (includeStats=true)
// ---------------------------------------------------------------------------

describe("player search response mapping — enriched (includeStats=true)", () => {
  it("includes lastMatchDate and winPct when includeStats=true", () => {
    const matchDate = new Date("2026-01-15T10:00:00Z");
    const raw: EnrichedPlayer = {
      id: "p1", displayName: "Alice", rating: 1050, claimed: false,
      _count: { matchParticipants: 5 },
      matchParticipants: [{ match: { matchDate } }],
    };
    const result = mapEnriched(raw, 0.6);
    expect(result.lastMatchDate).toBe(matchDate.toISOString());
    expect(result.winPct).toBe(0.6);
    expect(result.matchCount).toBe(5);
  });

  it("sets lastMatchDate to null when no match participants", () => {
    const raw: EnrichedPlayer = {
      id: "p2", displayName: "Bob", rating: 1000, claimed: false,
      _count: { matchParticipants: 0 },
      matchParticipants: [],
    };
    const result = mapEnriched(raw, null);
    expect(result.lastMatchDate).toBeNull();
    expect(result.winPct).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// computeWinPct tests
// ---------------------------------------------------------------------------

describe("computeWinPct", () => {
  it("returns null when fewer than 3 matches", () => {
    const two: RawParticipation[] = [
      { team: 1, match: { games: [{ team1Score: 11, team2Score: 5 }] } },
      { team: 1, match: { games: [{ team1Score: 11, team2Score: 9 }] } },
    ];
    expect(computeWinPct(two)).toBeNull();
  });

  it("returns null for 0 matches", () => {
    expect(computeWinPct([])).toBeNull();
  });

  it("returns null for exactly 2 matches, not null at 3", () => {
    const two: RawParticipation[] = [
      { team: 1, match: { games: [{ team1Score: 11, team2Score: 5 }] } },
      { team: 1, match: { games: [{ team1Score: 11, team2Score: 9 }] } },
    ];
    const three: RawParticipation[] = [
      ...two,
      { team: 1, match: { games: [{ team1Score: 5, team2Score: 11 }] } },
    ];
    expect(computeWinPct(two)).toBeNull();
    expect(computeWinPct(three)).not.toBeNull();
  });

  it("computes win rate correctly for team 1", () => {
    const participations: RawParticipation[] = [
      { team: 1, match: { games: [{ team1Score: 11, team2Score: 5 }] } },  // win
      { team: 1, match: { games: [{ team1Score: 11, team2Score: 9 }] } },  // win
      { team: 1, match: { games: [{ team1Score: 5, team2Score: 11 }] } },  // loss
    ];
    expect(computeWinPct(participations)).toBeCloseTo(2 / 3);
  });

  it("computes win rate correctly for team 2 participant", () => {
    const participations: RawParticipation[] = [
      { team: 2, match: { games: [{ team1Score: 5, team2Score: 11 }] } },  // win
      { team: 2, match: { games: [{ team1Score: 11, team2Score: 9 }] } },  // loss
      { team: 2, match: { games: [{ team1Score: 5, team2Score: 11 }] } },  // win
    ];
    expect(computeWinPct(participations)).toBeCloseTo(2 / 3);
  });

  it("returns 1.0 when all matches are wins", () => {
    const participations: RawParticipation[] = [
      { team: 1, match: { games: [{ team1Score: 11, team2Score: 5 }] } },
      { team: 1, match: { games: [{ team1Score: 11, team2Score: 3 }] } },
      { team: 1, match: { games: [{ team1Score: 11, team2Score: 7 }] } },
    ];
    expect(computeWinPct(participations)).toBe(1);
  });

  it("returns 0 when all matches are losses", () => {
    const participations: RawParticipation[] = [
      { team: 1, match: { games: [{ team1Score: 5, team2Score: 11 }] } },
      { team: 1, match: { games: [{ team1Score: 3, team2Score: 11 }] } },
      { team: 1, match: { games: [{ team1Score: 7, team2Score: 11 }] } },
    ];
    expect(computeWinPct(participations)).toBe(0);
  });
});
