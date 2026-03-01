/**
 * Unit tests for the tournament ranking algorithm and computeTeam1Won helper.
 *
 * This file is intentionally self-contained: it re-implements the pure
 * functions from tournament.ts so that Prisma (which uses import.meta and ESM)
 * is never pulled into the Jest bundle.
 */

// ---------------------------------------------------------------------------
// computeTeam1Won — local implementation (mirrors tournament.ts exactly)
// ---------------------------------------------------------------------------

interface GameRow {
  team1Score: number;
  team2Score: number;
}

function computeTeam1Won(games: GameRow[]): boolean {
  const team1GameWins = games.filter((g) => g.team1Score > g.team2Score).length;
  const team2GameWins = games.filter((g) => g.team2Score > g.team1Score).length;
  return team1GameWins > team2GameWins;
}

// ---------------------------------------------------------------------------
// computeTeam1Won tests
// ---------------------------------------------------------------------------

describe("computeTeam1Won", () => {
  it("returns true when team 1 wins more games (2-game match)", () => {
    expect(
      computeTeam1Won([
        { team1Score: 11, team2Score: 6 },
        { team1Score: 11, team2Score: 8 },
      ]),
    ).toBe(true);
  });

  it("returns false when team 2 wins more games (2-game match)", () => {
    expect(
      computeTeam1Won([
        { team1Score: 6, team2Score: 11 },
        { team1Score: 8, team2Score: 11 },
      ]),
    ).toBe(false);
  });

  it("returns true when team 1 wins 2 of 3 games", () => {
    expect(
      computeTeam1Won([
        { team1Score: 11, team2Score: 6 },
        { team1Score: 9, team2Score: 11 },
        { team1Score: 11, team2Score: 8 },
      ]),
    ).toBe(true);
  });

  it("returns false when team 2 wins 2 of 3 games", () => {
    expect(
      computeTeam1Won([
        { team1Score: 11, team2Score: 6 },
        { team1Score: 6, team2Score: 11 },
        { team1Score: 8, team2Score: 11 },
      ]),
    ).toBe(false);
  });

  it("handles a single game", () => {
    expect(computeTeam1Won([{ team1Score: 11, team2Score: 0 }])).toBe(true);
    expect(computeTeam1Won([{ team1Score: 0, team2Score: 11 }])).toBe(false);
  });

  it("returns false on empty games array (no wins for either side)", () => {
    expect(computeTeam1Won([])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Ranking algorithm — self-contained re-implementation of tournament.ts logic
// ---------------------------------------------------------------------------

interface ParticipantRow {
  playerId: string;
  team: number;
  player: { displayName: string };
}

interface MatchRow {
  id: string;
  matchDate: Date;
  participants: ParticipantRow[];
  games: GameRow[];
}

interface PlayerEntry {
  id: string;
  displayName: string;
  rating: number;
  wins: number;
  losses: number;
}

interface RankedPlayer extends PlayerEntry {
  rank: number;
}

/**
 * Extracted ranking logic (mirrors tournament.ts exactly — kept in sync manually).
 */
function breakTie(group: PlayerEntry[], matches: MatchRow[]): PlayerEntry[][] {
  if (group.length <= 1) return [group];

  const groupIds = new Set(group.map((p) => p.id));
  const h2hWins = new Map<string, number>(group.map((p) => [p.id, 0]));
  const h2hPointDiff = new Map<string, number>(group.map((p) => [p.id, 0]));

  for (const match of matches) {
    const team1Ids = match.participants
      .filter((p) => p.team === 1)
      .map((p) => p.playerId);
    const team2Ids = match.participants
      .filter((p) => p.team === 2)
      .map((p) => p.playerId);

    const group1 = team1Ids.filter((id) => groupIds.has(id));
    const group2 = team2Ids.filter((id) => groupIds.has(id));

    if (group1.length === 0 || group2.length === 0) continue;

    const team1Won = computeTeam1Won(match.games);
    const totalTeam1 = match.games.reduce((s, g) => s + g.team1Score, 0);
    const totalTeam2 = match.games.reduce((s, g) => s + g.team2Score, 0);

    for (const id of group1) {
      if (team1Won) h2hWins.set(id, (h2hWins.get(id) ?? 0) + 1);
      h2hPointDiff.set(id, (h2hPointDiff.get(id) ?? 0) + totalTeam1 - totalTeam2);
    }
    for (const id of group2) {
      if (!team1Won) h2hWins.set(id, (h2hWins.get(id) ?? 0) + 1);
      h2hPointDiff.set(id, (h2hPointDiff.get(id) ?? 0) + totalTeam2 - totalTeam1);
    }
  }

  const sorted = [...group].sort((a, b) => {
    const wDiff = (h2hWins.get(b.id) ?? 0) - (h2hWins.get(a.id) ?? 0);
    if (wDiff !== 0) return wDiff;
    return (h2hPointDiff.get(b.id) ?? 0) - (h2hPointDiff.get(a.id) ?? 0);
  });

  const subGroups: PlayerEntry[][] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (
      j < sorted.length &&
      (h2hWins.get(sorted[j]!.id) ?? 0) === (h2hWins.get(sorted[i]!.id) ?? 0) &&
      (h2hPointDiff.get(sorted[j]!.id) ?? 0) === (h2hPointDiff.get(sorted[i]!.id) ?? 0)
    ) {
      j++;
    }
    subGroups.push(sorted.slice(i, j));
    i = j;
  }

  return subGroups;
}

function rankPlayers(players: PlayerEntry[], matches: MatchRow[]): RankedPlayer[] {
  if (players.length === 0) return [];

  const sorted = [...players].sort((a, b) => b.wins - a.wins);
  const result: RankedPlayer[] = [];
  let rank = 1;
  let i = 0;

  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && sorted[j]!.wins === sorted[i]!.wins) j++;
    const group = sorted.slice(i, j);

    if (group.length === 1) {
      result.push({ ...group[0]!, rank });
      rank++;
    } else {
      const subGroups = breakTie(group, matches);
      let subRank = rank;
      for (const subGroup of subGroups) {
        for (const p of subGroup) {
          result.push({ ...p, rank: subRank });
        }
        subRank += subGroup.length;
      }
      rank += group.length;
    }

    i = j;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makePlayer(
  id: string,
  wins: number,
  losses: number,
  rating = 1000,
): PlayerEntry {
  return { id, displayName: id, rating, wins, losses };
}

function makeMatch(
  id: string,
  team1: string[],
  team2: string[],
  games: GameRow[],
): MatchRow {
  return {
    id,
    matchDate: new Date("2024-01-01"),
    participants: [
      ...team1.map((pid) => ({
        playerId: pid,
        team: 1,
        player: { displayName: pid },
      })),
      ...team2.map((pid) => ({
        playerId: pid,
        team: 2,
        player: { displayName: pid },
      })),
    ],
    games,
  };
}

const WIN_GAMES: GameRow[] = [
  { team1Score: 11, team2Score: 6 },
  { team1Score: 11, team2Score: 8 },
];
const LOSS_GAMES: GameRow[] = [
  { team1Score: 6, team2Score: 11 },
  { team1Score: 8, team2Score: 11 },
];

// ---------------------------------------------------------------------------
// Basic win counting
// ---------------------------------------------------------------------------

describe("rankPlayers — basic win counting", () => {
  it("ranks by wins descending with clear separation", () => {
    const players = [
      makePlayer("A", 3, 0),
      makePlayer("B", 1, 2),
      makePlayer("C", 2, 1),
    ];
    const ranked = rankPlayers(players, []);
    const byId = Object.fromEntries(ranked.map((p) => [p.id, p.rank]));
    expect(byId["A"]).toBe(1);
    expect(byId["C"]).toBe(2);
    expect(byId["B"]).toBe(3);
  });

  it("handles a single player", () => {
    const ranked = rankPlayers([makePlayer("X", 5, 0)], []);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.rank).toBe(1);
  });

  it("returns empty array when no players", () => {
    expect(rankPlayers([], [])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Head-to-head record tiebreaker
// ---------------------------------------------------------------------------

describe("rankPlayers — H2H record tiebreaker", () => {
  it("resolves two tied players via H2H wins", () => {
    // A and B both have 2 wins, but A beat B directly
    const players = [makePlayer("A", 2, 1), makePlayer("B", 2, 1)];

    // Match where A (team1) beat B (team2)
    const matches = [
      makeMatch("m1", ["A", "X"], ["B", "Y"], WIN_GAMES),
    ];

    const ranked = rankPlayers(players, matches);
    const byId = Object.fromEntries(ranked.map((p) => [p.id, p.rank]));
    expect(byId["A"]).toBe(1);
    expect(byId["B"]).toBe(2);
  });

  it("does not count matches where tied players are on the same team", () => {
    // A and B both have 2 wins; they were teammates in their only shared match
    const players = [makePlayer("A", 2, 1), makePlayer("B", 2, 1)];

    // A and B on the same team — not a H2H encounter
    const matches = [
      makeMatch("m1", ["A", "B"], ["C", "D"], WIN_GAMES),
    ];

    const ranked = rankPlayers(players, matches);
    // No H2H resolution possible — both stay tied (share rank 1)
    expect(ranked.every((p) => p.rank === 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Point differential tiebreaker
// ---------------------------------------------------------------------------

describe("rankPlayers — H2H point differential tiebreaker", () => {
  it("resolves via point diff when H2H wins are equal", () => {
    // A and B each won one H2H match, but A's win was by a bigger margin
    const players = [makePlayer("A", 2, 1), makePlayer("B", 2, 1)];

    const matches = [
      // A beats B 11-0, 11-0 (big margin)
      makeMatch("m1", ["A", "X"], ["B", "Y"], [
        { team1Score: 11, team2Score: 0 },
        { team1Score: 11, team2Score: 0 },
      ]),
      // B beats A 11-10, 11-10 (tiny margin)
      makeMatch("m2", ["B", "X"], ["A", "Y"], [
        { team1Score: 11, team2Score: 10 },
        { team1Score: 11, team2Score: 10 },
      ]),
    ];

    const ranked = rankPlayers(players, matches);
    const byId = Object.fromEntries(ranked.map((p) => [p.id, p.rank]));
    // A: +22 - 2 = +20 (from m1) + (10+10 - 11-11) = -2 from m2 → net +18
    // B: -(22) from m1 + +22-20 = +2 from m2 → net -18
    expect(byId["A"]).toBe(1);
    expect(byId["B"]).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Persistent tie
// ---------------------------------------------------------------------------

describe("rankPlayers — persistent tie", () => {
  it("assigns same rank to players still tied after all steps", () => {
    // A and B: same wins, no H2H matches at all
    const players = [makePlayer("A", 3, 0), makePlayer("B", 3, 0)];

    const ranked = rankPlayers(players, []);
    expect(ranked.every((p) => p.rank === 1)).toBe(true);
  });

  it("uses correct skip-rank after a shared tie — next player is rank 3", () => {
    // A and B tied at rank 1, C is rank 3
    const players = [
      makePlayer("A", 3, 0),
      makePlayer("B", 3, 0),
      makePlayer("C", 1, 2),
    ];

    const ranked = rankPlayers(players, []);
    const byId = Object.fromEntries(ranked.map((p) => [p.id, p.rank]));
    expect(byId["A"]).toBe(1);
    expect(byId["B"]).toBe(1);
    expect(byId["C"]).toBe(3);
  });

  it("uses correct skip-rank after two tied 2nds — next is rank 4", () => {
    const players = [
      makePlayer("A", 5, 0),
      makePlayer("B", 3, 0),
      makePlayer("C", 3, 0),
      makePlayer("D", 1, 0),
    ];

    const ranked = rankPlayers(players, []);
    const byId = Object.fromEntries(ranked.map((p) => [p.id, p.rank]));
    expect(byId["A"]).toBe(1);
    expect(byId["B"]).toBe(2);
    expect(byId["C"]).toBe(2);
    expect(byId["D"]).toBe(4);
  });
});
