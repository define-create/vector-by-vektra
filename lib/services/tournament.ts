/**
 * Tournament service — leaderboard ranking algorithm and match data assembly.
 * Used by GET /api/admin/tournament.
 */

import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface TournamentPlayer {
  id: string;
  displayName: string;
  rating: number;
  wins: number;
  losses: number;
  rank: number;
}

export interface TournamentMatch {
  id: string;
  matchDate: string; // ISO string
  team1Names: string[];
  team2Names: string[];
  team1Won: boolean;
  score: string; // e.g. "11–6, 9–11, 11–8"
}

export interface TournamentData {
  leaderboard: TournamentPlayer[];
  matches: TournamentMatch[];
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface GameRow {
  team1Score: number;
  team2Score: number;
}

interface ParticipantRow {
  playerId: string;
  team: number;
  player: {
    displayName: string;
  };
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

// ---------------------------------------------------------------------------
// computeTeam1Won — exported for tests
// ---------------------------------------------------------------------------

export function computeTeam1Won(games: GameRow[]): boolean {
  const team1GameWins = games.filter((g) => g.team1Score > g.team2Score).length;
  const team2GameWins = games.filter((g) => g.team2Score > g.team1Score).length;
  return team1GameWins > team2GameWins;
}

// ---------------------------------------------------------------------------
// Ranking helpers
// ---------------------------------------------------------------------------

/**
 * Among a group of players tied on wins, apply H2H tiebreakers and return
 * sub-groups in order (each sub-group contains players that are still tied).
 *
 * Step 2: H2H wins — count encounters where player A's team beat player B's
 *         team (only matches where A and B were on opposite teams count).
 * Step 3: H2H point differential — net points scored vs conceded across all
 *         H2H matches between tied players.
 * Step 4: persistent tie — players still equal share the same sub-group.
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

    // Group members on each team
    const group1 = team1Ids.filter((id) => groupIds.has(id));
    const group2 = team2Ids.filter((id) => groupIds.has(id));

    // Only count matches with group members on both teams (direct opposition)
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

  // Sort by H2H wins desc, then point diff desc
  const sorted = [...group].sort((a, b) => {
    const wDiff = (h2hWins.get(b.id) ?? 0) - (h2hWins.get(a.id) ?? 0);
    if (wDiff !== 0) return wDiff;
    return (h2hPointDiff.get(b.id) ?? 0) - (h2hPointDiff.get(a.id) ?? 0);
  });

  // Collect into sub-groups of still-tied players
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

/**
 * Assign ranks to all players.
 * Primary sort: wins descending.
 * Tiebreakers: H2H wins → H2H point diff → persistent tie (shared rank).
 * Shared ranks: two tied 2nds means next player is 4th.
 */
function rankPlayers(players: PlayerEntry[], matches: MatchRow[]): TournamentPlayer[] {
  if (players.length === 0) return [];

  // Sort by wins descending
  const sorted = [...players].sort((a, b) => b.wins - a.wins);

  const result: TournamentPlayer[] = [];
  let rank = 1;
  let i = 0;

  while (i < sorted.length) {
    // Find group with same wins count
    let j = i + 1;
    while (j < sorted.length && sorted[j]!.wins === sorted[i]!.wins) j++;
    const group = sorted.slice(i, j);

    if (group.length === 1) {
      result.push({ ...group[0]!, rank });
      rank++;
    } else {
      // Apply H2H tiebreakers
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
// getTournamentData — main export
// ---------------------------------------------------------------------------

export async function getTournamentData(tag: string): Promise<TournamentData> {
  // Fetch all non-voided matches for this tag
  const matches = (await prisma.match.findMany({
    where: {
      tag,
      voidedAt: null,
    },
    include: {
      participants: {
        include: {
          player: {
            select: { displayName: true },
          },
        },
      },
      games: {
        orderBy: { gameOrder: "asc" },
      },
    },
    orderBy: { matchDate: "desc" },
  })) as MatchRow[];

  // Build win/loss counts per player
  const playerMap = new Map<
    string,
    { id: string; displayName: string; rating: number; wins: number; losses: number }
  >();

  // We also need current ratings — collect all player IDs first
  const allPlayerIds = new Set<string>();
  for (const match of matches) {
    for (const p of match.participants) {
      allPlayerIds.add(p.playerId);
    }
  }

  // Fetch current ratings for all participants
  const playerRecords = await prisma.player.findMany({
    where: { id: { in: [...allPlayerIds] } },
    select: { id: true, displayName: true, rating: true },
  });
  const ratingMap = new Map(playerRecords.map((p) => [p.id, p.rating]));

  // Process each match
  for (const match of matches) {
    const team1Won = computeTeam1Won(match.games);

    const team1Ids = match.participants
      .filter((p) => p.team === 1)
      .map((p) => p.playerId);
    const team2Ids = match.participants
      .filter((p) => p.team === 2)
      .map((p) => p.playerId);

    for (const p of match.participants) {
      if (!playerMap.has(p.playerId)) {
        playerMap.set(p.playerId, {
          id: p.playerId,
          displayName: p.player.displayName,
          rating: ratingMap.get(p.playerId) ?? 1000,
          wins: 0,
          losses: 0,
        });
      }
    }

    for (const id of team1Ids) {
      const entry = playerMap.get(id);
      if (entry) {
        if (team1Won) entry.wins++;
        else entry.losses++;
      }
    }
    for (const id of team2Ids) {
      const entry = playerMap.get(id);
      if (entry) {
        if (!team1Won) entry.wins++;
        else entry.losses++;
      }
    }
  }

  const playerEntries = [...playerMap.values()];
  const leaderboard = rankPlayers(playerEntries, matches);

  // Build match list (already sorted desc by matchDate from DB query)
  const matchList: TournamentMatch[] = matches.map((match) => {
    const team1Participants = match.participants
      .filter((p) => p.team === 1)
      .map((p) => p.player.displayName);
    const team2Participants = match.participants
      .filter((p) => p.team === 2)
      .map((p) => p.player.displayName);

    const score = match.games
      .map((g) => `${g.team1Score}\u2013${g.team2Score}`)
      .join(", ");

    return {
      id: match.id,
      matchDate: match.matchDate.toISOString(),
      team1Names: team1Participants,
      team2Names: team2Participants,
      team1Won: computeTeam1Won(match.games),
      score,
    };
  });

  return { leaderboard, matches: matchList };
}
