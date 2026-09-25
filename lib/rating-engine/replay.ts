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
  partnerDeltaShare,
  lopsidedGapFactor,
  marginOfVictoryMultiplier,
} from "./elo";

const INITIAL_RATING = 1000;

/**
 * Replays all provided matches in chronological order and computes rating snapshots.
 *
 * @param matches             - Match records to replay (caller is responsible for filtering)
 * @param runId               - The RatingRun.id this replay belongs to
 * @param startingRatings     - Optional pre-replay ratings per player (for incremental runs).
 *                              Players absent from the map start at INITIAL_RATING (1000).
 * @param startingMatchCounts - Optional pre-replay match counts per player (for incremental
 *                              runs), so dynamicK matches what a full replay would compute.
 *                              Players absent from the map start at 0.
 * @returns snapshots: one SnapshotWrite per (player, match); finalRatings: current rating per player
 */
export function replayAllMatches(
  matches: MatchRecord[],
  runId: string,
  startingRatings?: Map<string, number>,
  startingMatchCounts?: Map<string, number>,
): { snapshots: SnapshotWrite[]; finalRatings: Map<string, number> } {
  // Collect all unique player IDs and initialise ratings + match counts
  const ratings = new Map<string, number>();
  const matchCounts = new Map<string, number>(); // matches completed before the current one
  for (const m of matches) {
    for (const id of [...m.team1PlayerIds, ...m.team2PlayerIds]) {
      if (!ratings.has(id)) {
        ratings.set(id, startingRatings?.get(id) ?? INITIAL_RATING);
        matchCounts.set(id, startingMatchCounts?.get(id) ?? 0);
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

    // Read every pre-match count before any rating is written, so a player's K
    // reflects their experience going *into* this match.
    const n1a = matchCounts.get(team1PlayerIds[0]!) ?? 0;
    const n1b = matchCounts.get(team1PlayerIds[1]!) ?? 0;
    const n2a = matchCounts.get(team2PlayerIds[0]!) ?? 0;
    const n2b = matchCounts.get(team2PlayerIds[1]!) ?? 0;

    // Lopsided-matchup adjustment: favourite's K shrinks, underdog's K grows.
    // Match-level, so it scales whatever base K each player brings.
    const gapFactor = lopsidedGapFactor(t1Avg - t2Avg);
    const lopsided1 = t1Avg >= t2Avg ? gapFactor : 2 - gapFactor;
    const lopsided2 = t2Avg >= t1Avg ? gapFactor : 2 - gapFactor;

    // Margin of victory: larger score gap → larger weight (capped at [MOV_MIN, MOV_MAX]).
    const team1Scores = games.map((g) => g.team1Score);
    const team2Scores = games.map((g) => g.team2Score);
    const [winnerScores, loserScores] = team1Won
      ? [team1Scores, team2Scores]
      : [team2Scores, team1Scores];
    const movWeight = marginOfVictoryMultiplier(winnerScores, loserScores);

    // Per-player K. The outcome surprise (actual − expected) is a team property
    // — the team won or lost as a unit — but the *learning rate* is personal:
    // K encodes how uncertain we are about that individual. So both teammates
    // share E, and each moves by their own dynamicK.
    //
    // This replaces Amendment A's shared-team-K cap. The veteran is protected
    // for the same reason as before (their own K is low and a new partner
    // cannot raise it), but the newcomer is no longer dragged down to the
    // veteran's pace and converges at their proper speed. Evidence: the only
    // change in docs/rating-engine-ablation.md to clear the noise floor.
    const sides = [
      { playerIds: team1PlayerIds, counts: [n1a, n1b], ratings: [r1a, r1b], lopsided: lopsided1, actual: team1Won ? 1 : 0, expected: E1 },
      { playerIds: team2PlayerIds, counts: [n2a, n2b], ratings: [r2a, r2b], lopsided: lopsided2, actual: team1Won ? 0 : 1, expected: E2 },
    ];

    for (const side of sides) {
      side.playerIds.forEach((playerId, i) => {
        // Stronger partner takes a larger share of the change (see
        // partnerDeltaShare). Folded into effectiveK so that the stored value
        // still satisfies delta = effectiveK * (actual - expected) — several
        // metrics (CI, Momentum, the Matchups delta column) rely on that.
        const share = partnerDeltaShare(side.ratings[i]!, side.ratings[1 - i]!);
        const effectiveK = kFactor(dynamicK(side.counts[i]!) * share * side.lopsided, 1.0, movWeight);
        const delta = computeRatingDelta(effectiveK, side.actual, side.expected);
        const prev = ratings.get(playerId) ?? INITIAL_RATING;
        const next = prev + delta;
        ratings.set(playerId, next);
        matchCounts.set(playerId, (matchCounts.get(playerId) ?? 0) + 1);
        snapshots.push({
          playerId,
          matchId,
          matchDate,
          rating: next,
          effectiveK,
          expectedScore: side.expected,
          runId,
        });
      });
    }
  }

  return { snapshots, finalRatings: ratings };
}
