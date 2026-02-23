/**
 * Post-replay metric computation: ratingConfidence and ratingVolatility.
 * Pure functions — no database access. All inputs are passed in by the caller.
 */

import { type MatchRecord, type SnapshotWrite } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// computeRatingVolatility
// ---------------------------------------------------------------------------

/**
 * σΔ of the player's last 20 rating deltas (standard deviation of rating changes per match).
 * Returns 0 if fewer than 2 snapshots are available.
 */
export function computeRatingVolatility(
  playerId: string,
  snapshots: SnapshotWrite[],
): number {
  const playerSnaps = snapshots
    .filter((s) => s.playerId === playerId)
    .sort((a, b) => a.matchDate.getTime() - b.matchDate.getTime());

  const last20 = playerSnaps.slice(-20);

  const deltas: number[] = [];
  for (let i = 1; i < last20.length; i++) {
    deltas.push(last20[i]!.rating - last20[i - 1]!.rating);
  }

  return stddev(deltas);
}

// ---------------------------------------------------------------------------
// computeRatingConfidence
// ---------------------------------------------------------------------------

/**
 * Rating confidence in [0, 1] using the four-component formula from PRD §10.3.
 *
 * @param playerId   - player to compute confidence for
 * @param allMatches - all non-voided matches (caller filters voided matches before passing in)
 * @param snapshots  - snapshots from the current rating run
 */
export function computeRatingConfidence(
  playerId: string,
  allMatches: MatchRecord[],
  snapshots: SnapshotWrite[],
): number {
  const playerMatches = allMatches.filter(
    (m) =>
      m.team1PlayerIds.includes(playerId) || m.team2PlayerIds.includes(playerId),
  );

  const n = playerMatches.length;
  if (n === 0) return 0;

  // Cₙ — sample size confidence
  const Cn = 1 - Math.exp(-n / 20);

  // Cᵣ — recency confidence (days since last match)
  const sorted = [...playerMatches].sort(
    (a, b) => b.matchDate.getTime() - a.matchDate.getTime(),
  );
  const lastMatchDate = sorted[0]!.matchDate;
  const daysSinceLast =
    (Date.now() - lastMatchDate.getTime()) / (1000 * 60 * 60 * 24);
  const Cr = Math.exp(-daysSinceLast / 45);

  // Last 20 matches for diversity and stability components
  const last20 = sorted.slice(0, 20);

  // Cᵈ — diversity confidence (unique opponents & partners in last 20)
  const opponentIds = new Set<string>();
  const partnerIds = new Set<string>();
  for (const match of last20) {
    const isTeam1 = match.team1PlayerIds.includes(playerId);
    const myTeam = isTeam1 ? match.team1PlayerIds : match.team2PlayerIds;
    const theirTeam = isTeam1 ? match.team2PlayerIds : match.team1PlayerIds;
    for (const id of theirTeam) opponentIds.add(id);
    for (const id of myTeam) {
      if (id !== playerId) partnerIds.add(id);
    }
  }
  const u = opponentIds.size;
  const p = partnerIds.size;
  const Cd = Math.min(1, 0.5 * (u / 20) + 0.5 * (p / 5));

  // Cₛ — stability confidence (σΔ of rating deltas in last 20 snapshots)
  const playerSnaps = snapshots
    .filter((s) => s.playerId === playerId)
    .sort((a, b) => a.matchDate.getTime() - b.matchDate.getTime());
  const last20Snaps = playerSnaps.slice(-20);
  const deltas: number[] = [];
  for (let i = 1; i < last20Snaps.length; i++) {
    deltas.push(last20Snaps[i]!.rating - last20Snaps[i - 1]!.rating);
  }
  const sigma = stddev(deltas);
  const Cs = 1 / (1 + sigma / 20);

  return clamp(Cn * Cr * Cd * Cs, 0, 1);
}
