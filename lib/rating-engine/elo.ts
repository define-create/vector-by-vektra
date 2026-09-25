/**
 * Core doubles-aware ELO functions.
 * Pure functions — no database access, no side effects.
 */

export const BASE_K = 32;

export const K_MAX = 48;
export const K_MIN = 16;
export const K_DECAY_RATE = 20;
export const LOPSIDED_SCALE = 400;
export const MOV_MIN = 0.75;
export const MOV_MAX = 1.25;

/**
 * Share of a doubles pair's strength attributed to the stronger partner.
 * 0.5 would be a plain average. 0.60 was chosen because:
 *   - `scripts/rating-calibration.ts` found 0.60 the best-fitting value in an
 *     independent sweep of the team-rating formula;
 *   - `scripts/rating-ablation.ts` shows 0.60 costs nothing on prediction
 *     (+0.0004 in-sample, -0.0051 out-of-sample, both within noise) while
 *     cutting "partners rated 100+ apart receive identical deltas" from 31% to 2%.
 * The direction (>0.5) is well supported; the exact value is not — 0.60, 0.65
 * and 0.70 are statistically indistinguishable, so this takes the most
 * conservative of them. See docs/rating-engine-ablation.md, Result 5.
 */
export const TEAM_ALPHA = 0.6;

/**
 * Team rating: the stronger partner counts for TEAM_ALPHA of the pair, the
 * weaker for the remainder. Also used by lib/matchup.ts, so the Matchups
 * forecast and the rating engine always share one model of team strength.
 */
export function teamRating(r1: number, r2: number): number {
  return TEAM_ALPHA * Math.max(r1, r2) + (1 - TEAM_ALPHA) * Math.min(r1, r2);
}

/**
 * Partners this close are treated as equally strong and split the change evenly.
 *
 * Without it, an exact tie splits 1.0/1.0 while a 0.01-point gap splits
 * 1.2/0.8 — a 50% swing off a difference that is pure noise. Measured across
 * all 566 matches, 25 of 1132 partner pairs (2.2%) fall inside this band.
 *
 * This narrows the cliff rather than removing it: a pair 0.99 apart still
 * splits evenly while one 1.01 apart does not. That residual step is between
 * ratings that genuinely differ, which is the point at which the max/min team
 * model has something real to say.
 */
export const PARTNER_TIE_EPSILON = 1;

/**
 * A partner's share of the team's rating change, normalised so that an evenly
 * matched pair gets 1.0 each (reproducing the plain-average behaviour).
 *
 * If team strength is `alpha*max + (1-alpha)*min`, the derivative of the
 * likelihood w.r.t. the stronger partner is `alpha` and w.r.t. the weaker is
 * `1-alpha`, so the delta must be split the same way for the update to be the
 * correct gradient step. The stronger partner therefore moves more on wins AND
 * on losses — symmetric, so it redistributes between partners without pulling
 * anyone toward the mean.
 */
export function partnerDeltaShare(self: number, partner: number): number {
  if (Math.abs(self - partner) < PARTNER_TIE_EPSILON) return 1;
  return 2 * (self > partner ? TEAM_ALPHA : 1 - TEAM_ALPHA);
}

/**
 * Expected win probability for team A against team B using the standard ELO logistic function.
 * Returns a value in (0, 1).
 */
export function expectedScore(teamARating: number, teamBRating: number): number {
  return 1 / (1 + Math.pow(10, (teamBRating - teamARating) / 400));
}

/**
 * Effective K-factor: baseK multiplied by optional recency and margin weights.
 * Both weights should be positive. Use 1.0 for no adjustment.
 */
export function kFactor(
  baseK: number,
  recencyWeight: number,
  marginWeight: number,
): number {
  return baseK * recencyWeight * marginWeight;
}

/**
 * Rating delta for one team/player given the effective K and their actual vs expected outcome.
 *
 * @param effectiveK  - K-factor for this match (from kFactor())
 * @param actual      - 1 for a win, 0 for a loss
 * @param expected    - expected score from expectedScore() for this team
 * @returns positive delta for wins, negative delta for losses
 */
export function computeRatingDelta(
  effectiveK: number,
  actual: number,
  expected: number,
): number {
  return effectiveK * (actual - expected);
}

/**
 * Per-player dynamic base K that decays from K_MAX to K_MIN as match count grows.
 * @param matchesPlayed - matches completed before the current match (0 = first match)
 */
export function dynamicK(matchesPlayed: number): number {
  return K_MIN + (K_MAX - K_MIN) * Math.exp(-matchesPlayed / K_DECAY_RATE);
}

/**
 * Lopsided-matchup gap factor in (0, 1].
 * Returns 1.0 for equal teams; shrinks toward 0 as the rating gap grows.
 * Multiply the favourite's baseK by this value and the underdog's by (2 - this value).
 * @param ratingGap - t1Avg - t2Avg (sign ignored)
 */
export function lopsidedGapFactor(ratingGap: number): number {
  return Math.exp(-Math.abs(ratingGap) / LOPSIDED_SCALE);
}

/**
 * Matches below which a player would be treated as provisional.
 *
 * CURRENTLY UNUSED outside this module's `teamBaseK` (itself superseded) and
 * the analysis scripts. Nothing in the UI reads it: the only new-player gate
 * that ships is `DEMO_PREVIEW_MATCH_THRESHOLD = 5` in
 * lib/services/preview-mode.ts, which decides whether to show a brand-new user
 * demo data instead of their own thin stats — an onboarding device, unrelated
 * to rating confidence.
 *
 * Kept as the natural threshold for a future "provisional rating" indicator,
 * which the ablation work argues for: ratings built on 1-3 matches currently
 * display with the same authority as ratings built on 300.
 */
export const NEW_PLAYER_THRESHOLD = 10;

/**
 * SUPERSEDED by per-player K — no longer used by the live engine.
 *
 * Amendment A capped the shared team K at the veteran's dynamicK when a partner
 * was below NEW_PLAYER_THRESHOLD, to stop a new partner's high K inflating the
 * veteran's delta. It worked, but over-corrected: it also dragged the newcomer
 * down to the veteran's slow K, delaying their convergence to a true rating.
 * `replayAllMatches` now gives each player their own dynamicK, which protects
 * the veteran *and* lets the newcomer move fast — see the doc comment there.
 *
 * Retained (and still exported) only for the analysis scripts, which need the
 * historical formula on purpose: scripts/rating-bakeoff.ts and
 * scripts/rating-calibration.ts reproduce the runs documented in
 * docs/rating-engine-bakeoff.md, and scripts/rating-diff-day.ts replays the old
 * engine alongside the new one to show what a given day's ratings would change
 * by. Do not use in new engine code.
 */
export function teamBaseK(n_a: number, n_b: number): number {
  const bothEstablished = n_a >= NEW_PLAYER_THRESHOLD && n_b >= NEW_PLAYER_THRESHOLD;
  if (bothEstablished) return (dynamicK(n_a) + dynamicK(n_b)) / 2;
  return Math.min(dynamicK(n_a), dynamicK(n_b));
}

/**
 * Margin-of-victory weight in [MOV_MIN, MOV_MAX] based on winner's point share.
 * Returns 1.0 if arrays are empty (graceful fallback for missing score data).
 * @param winnerScores - winning team's per-game scores
 * @param loserScores  - losing team's per-game scores (same length)
 */
export function marginOfVictoryMultiplier(
  winnerScores: number[],
  loserScores: number[],
): number {
  if (winnerScores.length === 0) return 1.0;
  const totalWinner = winnerScores.reduce((s, v) => s + v, 0);
  const totalLoser = loserScores.reduce((s, v) => s + v, 0);
  const total = totalWinner + totalLoser;
  if (total === 0) return 1.0;
  const normalized = 2 * (totalWinner / total - 0.5);
  return MOV_MIN + (MOV_MAX - MOV_MIN) * normalized;
}
