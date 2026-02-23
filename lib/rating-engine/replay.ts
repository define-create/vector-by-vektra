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
  BASE_K,
} from "./elo";

const INITIAL_RATING = 1000;

/**
 * Replays all provided matches in chronological order and computes rating snapshots.
 *
 * @param matches - All non-voided match records (caller is responsible for filtering)
 * @param runId   - The RatingRun.id this replay belongs to
 * @returns snapshots: one SnapshotWrite per (player, match); finalRatings: current rating per player
 */
export function replayAllMatches(
  matches: MatchRecord[],
  runId: string,
): { snapshots: SnapshotWrite[]; finalRatings: Map<string, number> } {
  // Collect all unique player IDs and initialise ratings
  const ratings = new Map<string, number>();
  for (const m of matches) {
    for (const id of [...m.team1PlayerIds, ...m.team2PlayerIds]) {
      if (!ratings.has(id)) ratings.set(id, INITIAL_RATING);
    }
  }

  // Sort chronologically: matchDate first, createdAt as tie-breaker
  const sorted = [...matches].sort((a, b) => {
    const d = a.matchDate.getTime() - b.matchDate.getTime();
    return d !== 0 ? d : a.createdAt.getTime() - b.createdAt.getTime();
  });

  const snapshots: SnapshotWrite[] = [];

  for (const match of sorted) {
    const { matchId, matchDate, team1PlayerIds, team2PlayerIds, team1Won } = match;

    // Doubles: always exactly 2 players per team
    const r1a = ratings.get(team1PlayerIds[0]!) ?? INITIAL_RATING;
    const r1b = ratings.get(team1PlayerIds[1]!) ?? INITIAL_RATING;
    const r2a = ratings.get(team2PlayerIds[0]!) ?? INITIAL_RATING;
    const r2b = ratings.get(team2PlayerIds[1]!) ?? INITIAL_RATING;

    const t1Avg = teamRating(r1a, r1b);
    const t2Avg = teamRating(r2a, r2b);

    const E1 = expectedScore(t1Avg, t2Avg); // team 1's expected win probability
    const E2 = 1 - E1;                       // team 2's expected win probability

    const effectiveK = kFactor(BASE_K, 1.0, 1.0);

    const delta1 = computeRatingDelta(effectiveK, team1Won ? 1 : 0, E1);
    const delta2 = computeRatingDelta(effectiveK, team1Won ? 0 : 1, E2);

    // Apply deltas and write snapshots — team 1
    for (const playerId of team1PlayerIds) {
      const prev = ratings.get(playerId) ?? INITIAL_RATING;
      const next = prev + delta1;
      ratings.set(playerId, next);
      snapshots.push({ playerId, matchId, matchDate, rating: next, effectiveK, expectedScore: E1, runId });
    }

    // Apply deltas and write snapshots — team 2
    for (const playerId of team2PlayerIds) {
      const prev = ratings.get(playerId) ?? INITIAL_RATING;
      const next = prev + delta2;
      ratings.set(playerId, next);
      snapshots.push({ playerId, matchId, matchDate, rating: next, effectiveK, expectedScore: E2, runId });
    }
  }

  return { snapshots, finalRatings: ratings };
}
