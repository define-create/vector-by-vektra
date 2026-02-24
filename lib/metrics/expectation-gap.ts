/**
 * Expectation Gap — PRD §4.4 item 15
 *
 * Measures actual performance vs. model expectation in the specific matchup context.
 * The unit of analysis matches the matchup card: pair vs. pair when both partners
 * are specified, falling back through a 5-level scope ladder when data is sparse.
 *
 * Formula:
 *   ExpectationGapRaw  = (1/n) × Σ(Aᵢ − Eᵢ)
 *   ExpectationGap     = 100 × ExpectationGapRaw
 *   Shrinkage:  w      = n / (n + 5)
 *   Final:             = w × ExpectationGap
 *
 * Scope ladder (most → least specific, first with n > 0 wins):
 *   1. Pair vs. Pair      — {p1, partner} vs. {opp1, opp2} exactly
 *   2. Pair vs. Opp Ind.  — {p1, partner} vs. opp1 or opp2 (any opp partner)
 *   3. Player vs. Opp Pair — p1 (any partner) vs. {opp1, opp2} exactly
 *   4. Player vs. Opp Ind. — p1 (any partner) vs. opp1 or opp2
 *   5. Global             — all of p1's matches
 *
 * Pairs are ad-hoc (no stored pair entity). All filtering is done by matching
 * player IDs within team assignments at query time.
 */

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

/** A match record with team composition, as needed for scope filtering. */
export interface MatchForGap {
  matchId: string;
  team1PlayerIds: string[]; // exactly 2 for doubles
  team2PlayerIds: string[]; // exactly 2 for doubles
  team1Won: boolean;
}

/** Minimal snapshot data for the primary player — only matchId and Eᵢ required. */
export interface SnapshotForGap {
  matchId: string;
  expectedScore: number; // Eᵢ from RatingSnapshot.expectedScore
}

export interface ExpectationGapResult {
  value: number;      // final shrunken score (100 × raw × w)
  n: number;          // number of matches at the resolved scope
  lowSample: boolean; // true when n < 3
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Returns primary player's team and opponent team, or null if not in match. */
function getTeams(
  match: MatchForGap,
  primaryPlayerId: string,
): { myTeam: string[]; oppTeam: string[] } | null {
  if (match.team1PlayerIds.includes(primaryPlayerId)) {
    return { myTeam: match.team1PlayerIds, oppTeam: match.team2PlayerIds };
  }
  if (match.team2PlayerIds.includes(primaryPlayerId)) {
    return { myTeam: match.team2PlayerIds, oppTeam: match.team1PlayerIds };
  }
  return null;
}

/** Aᵢ: 1 if primary player's team won, 0 if lost, null if not in match. */
function getActual(match: MatchForGap, primaryPlayerId: string): number | null {
  if (match.team1PlayerIds.includes(primaryPlayerId)) {
    return match.team1Won ? 1 : 0;
  }
  if (match.team2PlayerIds.includes(primaryPlayerId)) {
    return match.team1Won ? 0 : 1;
  }
  return null;
}

type ScopeFilter = (match: MatchForGap) => boolean;

function makeScope1Filter(
  p1: string,
  partner: string,
  opp1: string,
  opp2: string,
): ScopeFilter {
  return (match) => {
    const teams = getTeams(match, p1);
    if (!teams) return false;
    return (
      teams.myTeam.includes(partner) &&
      teams.oppTeam.includes(opp1) &&
      teams.oppTeam.includes(opp2)
    );
  };
}

function makeScope2Filter(
  p1: string,
  partner: string,
  opp1: string,
  opp2: string,
): ScopeFilter {
  return (match) => {
    const teams = getTeams(match, p1);
    if (!teams) return false;
    return (
      teams.myTeam.includes(partner) &&
      (teams.oppTeam.includes(opp1) || teams.oppTeam.includes(opp2))
    );
  };
}

function makeScope3Filter(p1: string, opp1: string, opp2: string): ScopeFilter {
  return (match) => {
    const teams = getTeams(match, p1);
    if (!teams) return false;
    return teams.oppTeam.includes(opp1) && teams.oppTeam.includes(opp2);
  };
}

function makeScope4Filter(p1: string, opp1: string, opp2: string): ScopeFilter {
  return (match) => {
    const teams = getTeams(match, p1);
    if (!teams) return false;
    return teams.oppTeam.includes(opp1) || teams.oppTeam.includes(opp2);
  };
}

function makeScope5Filter(p1: string): ScopeFilter {
  return (match) =>
    match.team1PlayerIds.includes(p1) || match.team2PlayerIds.includes(p1);
}

/**
 * Computes the raw gap (100 × mean(Aᵢ − Eᵢ)) over the given match set.
 * Skips matches where no snapshot exists for the primary player.
 */
function computeRawGap(
  matches: MatchForGap[],
  primaryPlayerId: string,
  snapshotsByMatchId: Map<string, number>,
): { raw: number; n: number } {
  let sumPE = 0;
  let n = 0;

  for (const match of matches) {
    const Ei = snapshotsByMatchId.get(match.matchId);
    if (Ei === undefined) continue; // no snapshot for this match

    const Ai = getActual(match, primaryPlayerId);
    if (Ai === null) continue;

    sumPE += Ai - Ei;
    n++;
  }

  if (n === 0) return { raw: 0, n: 0 };
  return { raw: (sumPE / n) * 100, n };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Computes the Expectation Gap for a specific matchup context.
 *
 * The function walks the scope ladder from most to least specific and returns
 * the result from the first scope that has at least one qualifying match.
 * Shrinkage w = n / (n + 5) is always applied.
 *
 * @param primaryPlayerId - The "home" player (player1 / "you").
 * @param partnerId       - player1's partner for this matchup.
 * @param opp1Id          - First opponent.
 * @param opp2Id          - Second opponent.
 * @param matches         - All non-voided matches with team assignments.
 * @param snapshots       - Snapshots for primaryPlayerId only (matchId + expectedScore).
 */
export function computeExpectationGap(
  primaryPlayerId: string,
  partnerId: string,
  opp1Id: string,
  opp2Id: string,
  matches: MatchForGap[],
  snapshots: SnapshotForGap[],
): ExpectationGapResult {
  const snapshotsByMatchId = new Map(
    snapshots.map((s) => [s.matchId, s.expectedScore]),
  );

  const scopes: ScopeFilter[] = [
    makeScope1Filter(primaryPlayerId, partnerId, opp1Id, opp2Id),
    makeScope2Filter(primaryPlayerId, partnerId, opp1Id, opp2Id),
    makeScope3Filter(primaryPlayerId, opp1Id, opp2Id),
    makeScope4Filter(primaryPlayerId, opp1Id, opp2Id),
    makeScope5Filter(primaryPlayerId),
  ];

  for (const filter of scopes) {
    const filtered = matches.filter(filter);
    const { raw, n } = computeRawGap(filtered, primaryPlayerId, snapshotsByMatchId);

    if (n > 0) {
      // Shrinkage: w = n / (n + 5) — prevents small-sample instability
      const w = n / (n + 5);
      return { value: w * raw, n, lowSample: n < 3 };
    }
  }

  // No matches at any scope
  return { value: 0, n: 0, lowSample: true };
}
