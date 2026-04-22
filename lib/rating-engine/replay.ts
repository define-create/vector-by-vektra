/**
 * Full-replay rating engine.
 * Pure function — no database access. The caller fetches and filters data.
 */

import { type MatchRecord, type SnapshotWrite } from "./types";
import {
  teamRating,
  expectedScore,
  kFactor,
  computeRatingDelta,
  dynamicK,
  lopsidedGapFactor,
  marginOfVictoryMultiplier,
} from "./elo";

const INITIAL_RATING = 1000;

/**
 * Replays all provided matches in chronological order and computes rating snapshots.
 *
 * @param matches         - Match records to replay (caller is responsible for filtering)
 * @param runId           - The RatingRun.id this replay belongs to
 * @param startingRatings - Optional pre-replay ratings per player (for incremental runs).
 *                          Players absent from the map start at INITIAL_RATING (1000).
 * @returns snapshots: one SnapshotWrite per (player, match); finalRatings: current rating per player
 */
export function replayAllMatches(
  matches: MatchRecord[],
  runId: string,
  startingRatings?: Map<string, number>,
): { snapshots: SnapshotWrite[]; finalRatings: Map<string, number> } {
  // Collect all unique player IDs and initialise ratings + match counts
  const ratings = new Map<string, number>();
  const matchCounts = new Map<string, number>(); // matches completed before the current one
  for (const m of matches) {
    for (const id of [...m.team1PlayerIds, ...m.team2PlayerIds]) {
      if (!ratings.has(id)) {
        ratings.set(id, startingRatings?.get(id) ?? INITIAL_RATING);
        matchCounts.set(id, 0);
      }
    }
  }

  // Sort chronologically: matchDate first, createdAt as tie-breaker
  const sorted = [...matches].sort((a, b) => {
    const d = a.matchDate.getTime() - b.matchDate.getTime();
    return d !== 0 ? d : a.createdAt.getTime() - b.createdAt.getTime();
  });

  const snapshots: SnapshotWrite[] = [];

  for (const match of sorted) {
    const { matchId, matchDate, team1PlayerIds, team2PlayerIds, team1Won, games } = match;

    // Doubles: always exactly 2 players per team
    const r1a = ratings.get(team1PlayerIds[0]!) ?? INITIAL_RATING;
    const r1b = ratings.get(team1PlayerIds[1]!) ?? INITIAL_RATING;
    const r2a = ratings.get(team2PlayerIds[0]!) ?? INITIAL_RATING;
    const r2b = ratings.get(team2PlayerIds[1]!) ?? INITIAL_RATING;

    const t1Avg = teamRating(r1a, r1b);
    const t2Avg = teamRating(r2a, r2b);

    const E1 = expectedScore(t1Avg, t2Avg); // team 1's expected win probability
    const E2 = 1 - E1;                       // team 2's expected win probability

    // Dynamic K: decays from K_MAX to K_MIN as each player gains experience.
    // Team base-K is the average of the two players' individual Ks (both get same delta).
    const n1a = matchCounts.get(team1PlayerIds[0]!) ?? 0;
    const n1b = matchCounts.get(team1PlayerIds[1]!) ?? 0;
    const n2a = matchCounts.get(team2PlayerIds[0]!) ?? 0;
    const n2b = matchCounts.get(team2PlayerIds[1]!) ?? 0;
    const teamBaseK1 = (dynamicK(n1a) + dynamicK(n1b)) / 2;
    const teamBaseK2 = (dynamicK(n2a) + dynamicK(n2b)) / 2;

    // Lopsided-matchup adjustment: favourite's K shrinks, underdog's K grows.
    const gapFactor = lopsidedGapFactor(t1Avg - t2Avg);
    const adjBaseK1 = t1Avg >= t2Avg ? teamBaseK1 * gapFactor : teamBaseK1 * (2 - gapFactor);
    const adjBaseK2 = t2Avg >= t1Avg ? teamBaseK2 * gapFactor : teamBaseK2 * (2 - gapFactor);

    // Margin of victory: larger score gap → larger weight (capped at [MOV_MIN, MOV_MAX]).
    const team1Scores = games.map((g) => g.team1Score);
    const team2Scores = games.map((g) => g.team2Score);
    const [winnerScores, loserScores] = team1Won
      ? [team1Scores, team2Scores]
      : [team2Scores, team1Scores];
    const movWeight = marginOfVictoryMultiplier(winnerScores, loserScores);

    const effectiveK1 = kFactor(adjBaseK1, 1.0, movWeight);
    const effectiveK2 = kFactor(adjBaseK2, 1.0, movWeight);

    const delta1 = computeRatingDelta(effectiveK1, team1Won ? 1 : 0, E1);
    const delta2 = computeRatingDelta(effectiveK2, team1Won ? 0 : 1, E2);

    // Apply deltas, write snapshots, increment match counters — team 1
    for (const playerId of team1PlayerIds) {
      const prev = ratings.get(playerId) ?? INITIAL_RATING;
      const next = prev + delta1;
      ratings.set(playerId, next);
      matchCounts.set(playerId, (matchCounts.get(playerId) ?? 0) + 1);
      snapshots.push({ playerId, matchId, matchDate, rating: next, effectiveK: effectiveK1, expectedScore: E1, runId });
    }

    // Apply deltas, write snapshots, increment match counters — team 2
    for (const playerId of team2PlayerIds) {
      const prev = ratings.get(playerId) ?? INITIAL_RATING;
      const next = prev + delta2;
      ratings.set(playerId, next);
      matchCounts.set(playerId, (matchCounts.get(playerId) ?? 0) + 1);
      snapshots.push({ playerId, matchId, matchDate, rating: next, effectiveK: effectiveK2, expectedScore: E2, runId });
    }
  }

  return { snapshots, finalRatings: ratings };
}
