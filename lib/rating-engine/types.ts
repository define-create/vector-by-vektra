/**
 * A single match record as consumed by the rating engine.
 * All filtering (voided matches, etc.) is done by the caller before passing records in.
 */
export interface MatchRecord {
  matchId: string;
  matchDate: Date;
  createdAt: Date;
  team1PlayerIds: string[]; // exactly 2 for doubles
  team2PlayerIds: string[]; // exactly 2 for doubles
  team1Won: boolean;
}

/**
 * Mutable in-memory state for one player during a replay.
 */
export interface PlayerState {
  playerId: string;
  rating: number;
}

/**
 * One row to be written to the RatingSnapshot table after each match replay.
 */
export interface SnapshotWrite {
  playerId: string;
  matchId: string;
  matchDate: Date;
  rating: number; // player's rating after this match
  effectiveK: number; // K-factor used in this match
  expectedScore: number; // model's expected win probability for this player's team
  runId: string;
}
