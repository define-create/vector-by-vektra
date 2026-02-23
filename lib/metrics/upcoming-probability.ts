/**
 * Upcoming Match Probability — PRD §4.6
 *
 * Win probability against the most frequently faced recent opponent.
 * Derived from personal match history only (free tier, no network data).
 */

import { expectedScore } from "@/lib/rating-engine/elo";

interface RecentOpponent {
  id: string;
  rating: number;
}

/**
 * @param currentPlayerRating - The current player's rating
 * @param recentOpponents     - Opponents from the player's last 20 matches
 *                              (may contain duplicates — used for frequency counting)
 * @returns win probability in (0, 1), or null if no match history
 */
export function computeUpcomingProbability(
  currentPlayerRating: number,
  recentOpponents: RecentOpponent[],
): number | null {
  if (recentOpponents.length === 0) return null;

  // Count frequency of each opponent id
  const freq = new Map<string, { count: number; rating: number }>();
  for (const opp of recentOpponents) {
    const entry = freq.get(opp.id);
    if (entry) {
      entry.count++;
    } else {
      freq.set(opp.id, { count: 1, rating: opp.rating });
    }
  }

  // Find the most frequently faced opponent
  let topRating = recentOpponents[0]!.rating;
  let topCount = 0;
  for (const { count, rating } of freq.values()) {
    if (count > topCount) {
      topCount = count;
      topRating = rating;
    }
  }

  // The player teams up with a partner — for 1v1 probability estimation,
  // use individual ratings directly (free tier doesn't have network-level team data).
  // Win probability = logistic ELO against most frequent opponent rating.
  return expectedScore(currentPlayerRating, topRating);
}
