# PRD: Rating System v2 — Smarter ELO Calculations

## 1. Introduction / Overview

The current ELO rating system uses a flat K-factor of 32 for every player and every match, regardless of how experienced a player is, how lopsided a matchup was, or how dominant the winning score was. This leads to unrealistic rating swings: a veteran player's well-earned rating can be destabilized by a single bad match, while a new player's rating takes too long to reflect their true skill level.

**This feature improves rating realism by introducing three targeted adjustments to the existing ELO engine:**

1. **Dynamic K-Factor** — new players' ratings move quickly to find their true level; veterans' ratings are more stable.
2. **Lopsided-Matchup Adjustment** — when one team is a heavy favorite, the expected result barely moves ratings; an upset moves them a lot.
3. **Margin of Victory Multiplier** — a dominant 11–0 win moves ratings more than a narrow 11–9 win.

None of these changes require a database schema migration. On deployment, a full recompute is triggered so all historical matches are replayed with the new formula.

---

## 2. Goals

- **G1:** New players' ratings reach their true level within ~10 matches instead of 20+.
- **G2:** Veteran players' ratings are protected from large swings caused by single outlier matches.
- **G3:** Rating changes from lopsided matchups (400+ point gap) are proportionally smaller for the favorite and larger for the underdog.
- **G4:** A shutout win produces a meaningfully larger rating delta than a narrow win in the same matchup.
- **G5:** All historical ratings are recomputed under the new formula on first deployment — no split history.

---

## 3. User Stories

- **As a new player**, I want my rating to climb (or fall) quickly in my first 10 matches so it reflects my actual skill level sooner.
- **As a veteran player**, I want my rating to be stable so that one bad day doesn't wipe out weeks of earned progress.
- **As a strong player paired against beginners**, I want to gain very little from expected wins and not lose catastrophically from unexpected upsets, so the system feels fair.
- **As an underdog**, I want a big upset win to be meaningfully rewarded in my rating, because beating a much stronger team is a genuine achievement.
- **As any player**, I want a match I dominated (e.g. 11–0) to count for more than a match I barely won (e.g. 11–9), so effort and performance are reflected.

---

## 4. Functional Requirements

### FR1 — Dynamic K-Factor (match count)
1. The system must compute a per-player base K using the formula:
   ```
   dynamicK(n) = 16 + 32 × exp(−n / 20)
   ```
   where `n` = number of non-voided matches the player has completed **before** the current match.
2. Key values: n=0 → K=48, n=10 → K≈36, n=20 → K≈28, n=50 → K≈20, n=100+ → K≈16.
3. The system must track each player's match count during replay using an in-memory counter; the counter increments after each match is processed.
4. For a doubles team, the team's base K must be the **average** of both players' individual `dynamicK(n)` values (since both players receive the same delta).
5. Constants `K_MAX = 48`, `K_MIN = 16`, `K_DECAY_RATE = 20` must be exported from `lib/rating-engine/elo.ts` so they can be referenced in tests and tooling.

### FR2 — Lopsided-Matchup Adjustment (rating gap)
6. The system must compute a gap factor from the absolute rating difference between the two team averages:
   ```
   gapFactor = exp(−|t1Avg − t2Avg| / 400)
   ```
   `gapFactor` is in the range `(0, 1]`; it equals 1.0 when teams are evenly matched.
7. The **favourite** (higher average rating) team's base K must be multiplied by `gapFactor`.
8. The **underdog** (lower average rating) team's base K must be multiplied by `(2 − gapFactor)`.
9. When teams are exactly equal (`gapFactor = 1.0`), both multipliers equal 1.0 — no adjustment.
10. The constant `LOPSIDED_SCALE = 400` must be exported from `lib/rating-engine/elo.ts`.
11. A helper function `lopsidedGapFactor(ratingGap: number): number` must be added to `lib/rating-engine/elo.ts`.

### FR3 — Margin of Victory Multiplier (game score)
12. The system must accept per-game scores through the `MatchRecord` type (new `games` field).
13. The system must compute `marginWeight` using the winning team's point share:
    ```
    rawMargin  = winnerScore / (winnerScore + loserScore)
    normalized = 2 × (rawMargin − 0.5)
    movWeight  = 0.75 + 0.50 × normalized
    ```
    Result is in `[0.75, 1.25]`.
14. If `games` is an empty array (no score data recorded), the system must fall back to `movWeight = 1.0` with no error.
15. Constants `MOV_MIN = 0.75` and `MOV_MAX = 1.25` must be exported from `lib/rating-engine/elo.ts`.
16. A helper function `marginOfVictoryMultiplier(winnerScores, loserScores): number` must be added to `lib/rating-engine/elo.ts`.

### FR4 — Combined formula
17. The final effective K for each team must be:
    ```
    adjustedBaseK = teamBaseK × gapFactor         (if favorite)
                    teamBaseK × (2 − gapFactor)   (if underdog)
    effectiveK    = adjustedBaseK × movWeight
    ```
    (The existing `kFactor(baseK, recencyWeight, marginWeight)` function is used with `recencyWeight = 1.0`.)
18. The `actual` outcome must remain binary: `1` for a win, `0` for a loss (no partial outcomes).
19. The two teams may have **different** `effectiveK` values within the same match. This is by design.

### FR5 — Data pipeline
20. The `MatchRecord` type in `lib/rating-engine/types.ts` must be extended with:
    ```typescript
    games: { team1Score: number; team2Score: number }[];
    ```
21. The recompute service (`lib/services/recompute.ts`) must pass game scores into `MatchRecord` by mapping `m.games` (already fetched) sorted by `gameOrder`.
22. The Prisma query in `recompute.ts` must include `gameOrder: true` in the games select so scores are sorted deterministically.

### FR6 — Deployment recompute
23. After deploying this change, an admin must trigger a **full recompute** from the admin panel so all historical matches are replayed under the new formula.
24. The system must not require any database schema migration or Supabase SQL changes.

---

## 5. Non-Goals (Out of Scope)

- **Partial outcome / game-share actual** — treating a 2–1 set result differently from 2–0. Excluded because most matches are single-game.
- ~~**Individual (non-team) K values**~~ — originally excluded; now implemented, see Amendment C.
- **Rating decay for inactivity** — the existing `ratingConfidence` metric already captures recency; decaying the raw rating is not part of this feature.
- ~~**Starting-match-count for incremental replays**~~ — originally excluded; now implemented, see Amendment B.
- **UI changes** — no changes to any player profile or leaderboard display are required.

---

## Amendment A — Partner K Isolation (veteran protected from new-player uncertainty)

> **SUPERSEDED 2026-08-23 by Amendment C (per-player K).** Amendment A shipped and
> solved the problem below, but over-corrected: capping the shared team K at the
> veteran's `dynamicK` also dragged the *newcomer* down to the veteran's slow K,
> delaying their convergence. The engine now gives each player their own K, which
> preserves the veteran protection described here without the side effect.
> `teamBaseK` remains in `elo.ts` but is unused by the live engine.
> See Amendment C below and `docs/rating-engine-ablation.md`.

### Problem

The current team base-K formula averages both players' individual `dynamicK` values:

```
teamBaseK = (dynamicK(n_a) + dynamicK(n_b)) / 2
```

When a veteran (e.g. 153 matches, `dynamicK ≈ 16`) is paired with a brand-new player (e.g. 2 matches, `dynamicK ≈ 45`), the team K inflates to ~30. The veteran then loses or gains ~14 pts from a match where they should move ~7 pts — purely because their partner's rating is uncertain, not because anything meaningful was learned about the veteran's own skill level.

This was observed in a real match: Almir (153 matches) paired with matt NewGuy (2 matches) lost to Eldi/Edita. Almir dropped 14.24 pts instead of the ~7 pts a veteran pairing would have produced.

DUPR addresses this with the same philosophy: "if a rated player loses to an NR, it has minimal impact on their rating" — the experienced player's update is decoupled from their partner's uncertainty.

### Solution — Cap team K at the more experienced player's dynamicK

Replace the simple average with a **weighted blend** that caps the team K at the more experienced partner's `dynamicK` when one partner is significantly newer than the other.

**New formula:**

```
NEW_PLAYER_THRESHOLD = 10   // matches; below this, partner is considered "uncertain"

teamBaseK(n_a, n_b):
  if both n_a >= threshold AND n_b >= threshold:
    return (dynamicK(n_a) + dynamicK(n_b)) / 2   // no change — both established
  else:
    return Math.min(dynamicK(n_a), dynamicK(n_b)) // cap at the veteran's K
```

The new player still gets their own high-K learning experience in matches where *their* team K is the minimum (i.e., when paired with another new player). They are not penalised — only the veteran partner is protected.

**Worked example (Almir/matt NewGuy):**

| | Old formula | New formula |
|---|---|---|
| teamBaseK1 | (16.00 + 45.05) / 2 = **30.53** | min(16.00, 45.05) = **16.00** |
| adjBaseK1 (after lopsided) | 19.97 | **10.46** |
| effectiveK1 (after MOV) | 19.59 | **10.28** |
| delta for Almir/matt | **−14.24 each** | **~−7.47 each** |

Eldi/Edita's K is unaffected (both are established players).

### Functional requirements

**FR1-amendment:**

- Add exported constant `NEW_PLAYER_THRESHOLD = 10` to `lib/rating-engine/elo.ts`.
- Add exported helper `teamBaseK(n_a: number, n_b: number): number` to `lib/rating-engine/elo.ts` implementing the capped formula above.
- Replace the inline average in `replay.ts` (`(dynamicK(n1a) + dynamicK(n1b)) / 2`) with a call to `teamBaseK(n1a, n1b)` for both teams.
- Export `NEW_PLAYER_THRESHOLD` and `teamBaseK` from `lib/rating-engine/index.ts`.

### Files to modify

| File | Change |
|---|---|
| `lib/rating-engine/elo.ts` | Add `NEW_PLAYER_THRESHOLD` constant and `teamBaseK()` function |
| `lib/rating-engine/index.ts` | Export `NEW_PLAYER_THRESHOLD` and `teamBaseK` |
| `lib/rating-engine/replay.ts` | Replace inline `(dynamicK(n1a) + dynamicK(n1b)) / 2` with `teamBaseK(n1a, n1b)` for both teams |

No schema changes. No `npx prisma generate` needed. Requires a full recompute after deploy.

### Success metrics

- **SM-A1:** Almir paired with a 2-match partner in an evenly-matched game moves ≤ 10 pts, not ~14.
- **SM-A2:** Two new players paired together (both < 10 matches) still see large swings — the cap does not apply when both partners are new.
- **SM-A3:** Two veterans paired together produce identical results to the pre-amendment formula.

### Non-goals

- This amendment does not address the case where both players are new — high K for both is correct behaviour.
- This does not implement per-player deltas (team still moves in lockstep); that remains out of scope.

---

## Amendment B — Starting Match Counts for Incremental Replays (implemented)

### Problem

Section 5 originally excluded this as a non-goal: incremental replays started every player's
in-memory match counter at 0, so a 150-match veteran was treated as brand new (`dynamicK ≈ 48`
instead of ≈ 16) for any match replayed incrementally (new match, score edit). Ratings could
overswing ~3× intraday until the nightly full replay corrected them.

### Solution

Mirror the existing `startingRatings` pattern with a `startingMatchCounts` map:

- `replayAllMatches()` accepts an optional fourth parameter `startingMatchCounts?: Map<string, number>`;
  players absent from the map start at 0 (full-replay behaviour unchanged).
- In the incremental branch of `runRecompute()`, a single `matchParticipant.groupBy` query counts
  each affected player's non-voided matches with `matchDate < fromDate` — the exact complement of
  the replay window (`matchDate >= fromDate`), consistent with the `startingRatings` snapshot lookup.

With this, incremental `dynamicK` is identical to what a full replay computes (both count the same
set of matches). No schema changes; nothing persisted — counts remain in-memory per run.

### Files modified

| File | Change |
|---|---|
| `lib/rating-engine/replay.ts` | Add `startingMatchCounts` parameter; seed counter init |
| `lib/services/recompute.ts` | `groupBy` prior-match counts in incremental branch; pass map |
| `lib/rating-engine/replay.test.ts` | Tests: seeded veteran K, unseeded default, threshold crossover |

---

## Amendment C — Per-Player K (implemented 2026-08-23, supersedes Amendment A)

### Problem

Amendment A capped the **shared team K** at the veteran's `dynamicK` whenever a
partner sat below `NEW_PLAYER_THRESHOLD`. It protected the veteran, but because
the K was shared, it also pinned the *newcomer* to the veteran's slow K —
`dynamicK ≈ 16` instead of their own ≈ 48 — so the player the engine knew least
about moved the least, delaying convergence to a true rating.

The deeper issue is that a single K was being asked to describe two players. In
Elo, K is a statement about *uncertainty in one player*.

### Solution

Split the two things that were conflated:

- **Outcome surprise `(actual − expected)` stays shared.** The team won or lost
  as a unit, so both partners see the same `expectedScore`.
- **Learning rate becomes personal.** Each player moves by their own
  `dynamicK(theirPriorMatches)`, scaled by the match-level lopsided and MOV
  multipliers.

The veteran's protection is now structural rather than a special case: their own
K is low, and no partner can raise it. Section 5's "Individual (non-team) K
values" non-goal is retired.

### Evidence

The only variant in `docs/rating-engine-ablation.md` to clear the noise floor:
Δ log-loss **−0.0039 [−0.0069, −0.0009]** over 566 matches, **−0.0044
[−0.0085, −0.0003]** on seasoned matches, and **−0.0080** on a held-out final
170 — growing out of sample, unlike every tuned-parameter candidate, which
reversed. It fits zero free parameters.

Blast radius: median rating shift 10.6, max 89; veterans (50+ matches) shift by
a median 8.7 / max 16.9. Movement concentrates on low-experience players.

### Interaction with Amendment B

Amendment B matters *more* now. Per-player K reads each player's own prior-match
count, so an incremental replay that seeded counts incorrectly would mis-K
individuals rather than a whole team. `runRecompute()`'s `groupBy` covers every
affected player (absent ⇒ 0), so this is already correct.

### Files modified

| File | Change |
|---|---|
| `lib/rating-engine/replay.ts` | Per-player K and per-player delta; shared `expectedScore` |
| `lib/rating-engine/elo.ts` | `teamBaseK` marked superseded (retained, unused by the live engine) |
| `lib/rating-engine/replay.test.ts` | Removed Amendment A threshold test; added 4 per-player-K tests |
| `scripts/rating-ablation.ts` | New evidence harness (ablation, sweeps, holdout, blast radius) |
| `docs/rating-engine-ablation.md` | Study write-up and amended evidence bar |

### Resolves OQ2

`RatingSnapshot.effectiveK` is now genuinely the individual player's K rather
than a team-level value, which is the answer to Open Question 2 below. Consumers
that reconstruct deltas from it (`app/api/matchup/route.ts`,
`lib/metrics/compounding-index.ts`, `lib/metrics/momentum.ts`) rely on the
invariant `delta = effectiveK × (actual − expected)`, which still holds exactly
— and is now per-player accurate.

---

## Amendment D — Weighting the Stronger Partner, TEAM_ALPHA = 0.60 (adopted 2026-08-23, NOT deployed)

> **Status (2026-09-25):** Amendments C and D are implemented and tested but
> **parked** on branch `parked/rating-engine-and-plans`. They are not on
> `feature/dev` or `main`, and production still runs Amendment A. Deploying
> either amendment triggers a full recompute on the next nightly cron, moving
> every player's rating at once.

### Problem

Partners with very different ratings routinely received the **identical** rating
change. Rating never entered the delta split — only experience did — and
experience saturates at the K floor, so two floored partners get the same delta
by arithmetic. Across all 566 matches, **31% of partner pairs rated 100+ apart
moved identically** (45% for pairs 200+ apart). Raised by a user from real match
logs: "Why did both Stone and Almir lose the same −7.6 when they have very
different ratings?"

### Solution

1. **Team strength weights the stronger partner.**
   `teamRating = 0.60 × max(r1, r2) + 0.40 × min(r1, r2)` instead of a plain
   average.
2. **The delta is split by the same weights.** `partnerDeltaShare()` gives the
   stronger partner 1.2× and the weaker 0.8×, normalised so an even pair gets
   1.0 each. This is the correct gradient step for the weighted team model, not
   a bolt-on, and it is **symmetric**: the stronger partner moves more on wins
   *and* on losses, so it redistributes between partners without compressing the
   leaderboard.
3. **Tie band.** Partners within `PARTNER_TIE_EPSILON = 1` point split evenly,
   so a 0.01-point gap cannot cause a 50% swing. 25 of 1132 partner pairs (2.2%)
   fall inside it.

The share is folded into `effectiveK`, so the invariant
`delta = effectiveK × (actual − expected)` from Amendment C still holds exactly.

### Evidence

From `docs/rating-engine-ablation.md`, Result 5:

| | Per-player K only | **+ TEAM_ALPHA 0.60** |
|---|---|---|
| Pairs 100+ apart moving identically | 31% | **2%** |
| Log-loss, full history (paired) | — | +0.0004 [−0.0040, +0.0047] — noise |
| Log-loss, held-out split | — | −0.0051 [−0.0136, +0.0034] — noise |
| Rating spread (std dev) | 76.6 | 77.3 |

The justification is the defect fix, not accuracy, which is flat. The direction
(α > 0.5) is supported by two independent analyses; the exact value is not —
0.60, 0.65 and 0.70 are statistically indistinguishable, and 0.60 is the most
conservative.

### Side effects

- **The Matchups forecast changes too.** `lib/matchup.ts` imports `teamRating`,
  so win probabilities and moneylines on the Matchups screen shift with this
  amendment. Measured as neutral-to-slightly-better; not manually verified on
  screen.
- **A player's responsiveness depends on their partner** — the 1.2× partner in
  one match can be the 0.8× partner in the next.
- **Analysis scripts must not use `elo.ts`'s `teamRating`**, or they silently
  replay history under the new model. The historical scripts carry their own
  plain average.

### Blast radius

Production is on the legacy engine (Amendment A), so deploying C and D together
is what players feel: median shift **9.9**, p90 **30.1**, max **125.3**. Spread
widens 68.2 → 77.3 (+13%).

### Files modified

| File | Change |
|---|---|
| `lib/rating-engine/elo.ts` | `TEAM_ALPHA`, weighted `teamRating`, `partnerDeltaShare`, `PARTNER_TIE_EPSILON` |
| `lib/rating-engine/replay.ts` | Share folded into each player's `effectiveK` |
| `lib/rating-engine/index.ts` | New exports |
| `lib/rating-engine/elo.test.ts`, `replay.test.ts`, `lib/matchup.test.ts` | Tie band, symmetry and order-independence tests |

### Considered and rejected (see the ablation doc)

- **Per-player expected score** ("the favourite was expected to carry, so reward
  them less") — Result 4. Degrades accuracy with dose and compresses the
  leaderboard 23.6%.
- **Per-match rating conservation** to stop the rating point leak — Result 6.
  Distorts individual matches (median 18.7%, max 319%) and makes a player's
  delta depend on their opponents' experience. The leak is accepted as-is; a
  ±10% cap is the recorded starting point if it is revisited.

---

## 6. Technical Considerations

### Files to modify (in implementation order)
| File | Change |
|---|---|
| `lib/rating-engine/types.ts` | Add `GameScore` interface; add `games: GameScore[]` to `MatchRecord` |
| `lib/rating-engine/elo.ts` | Add 5 new constants + 2 new functions (`dynamicK`, `lopsidedGapFactor`, `marginOfVictoryMultiplier`) |
| `lib/rating-engine/index.ts` | Export new constants, functions, and `GameScore` type |
| `lib/rating-engine/replay.ts` | Replace hardcoded `kFactor(BASE_K, 1.0, 1.0)` with dynamic+lopsided+MOV logic; add `matchCounts` map |
| `lib/services/recompute.ts` | Add `gameOrder` to select; map `games` into `MatchRecord` |

### Key implementation detail — `replay.ts` per-match block
The existing single `effectiveK` line becomes per-team logic:
```typescript
// 1. Per-player dynamic K
const teamBaseK1 = (dynamicK(n1a) + dynamicK(n1b)) / 2;
const teamBaseK2 = (dynamicK(n2a) + dynamicK(n2b)) / 2;

// 2. Lopsided-matchup adjustment
const gapFactor = lopsidedGapFactor(t1Avg - t2Avg);
const adjK1 = t1Avg >= t2Avg ? teamBaseK1 * gapFactor : teamBaseK1 * (2 - gapFactor);
const adjK2 = t2Avg >= t1Avg ? teamBaseK2 * gapFactor : teamBaseK2 * (2 - gapFactor);

// 3. Margin of victory
const [winnerScores, loserScores] = team1Won
  ? [team1Scores, team2Scores] : [team2Scores, team1Scores];
const movWeight = marginOfVictoryMultiplier(winnerScores, loserScores);

// 4. Final effective K and deltas
const effectiveK1 = kFactor(adjK1, 1.0, movWeight);
const effectiveK2 = kFactor(adjK2, 1.0, movWeight);
```

### No schema migration required
Game scores (`team1Score`, `team2Score`, `gameOrder`) already exist in the `Game` table and are already fetched by the recompute query. This is a pure TypeScript code change.

### Important: run `npx prisma generate` is NOT needed
No schema changes are made, so the generated Prisma client does not need to be regenerated.

---

## 7. Success Metrics

- **SM1:** A player's rating delta in their first match is ≥ 40 points (up or down), confirming K_MAX = 48 is active.
- **SM2:** A veteran player (50+ matches) has a rating delta ≤ 22 points per match in a close, even matchup.
- **SM3:** In a matchup with a 400-point rating gap, the favourite's delta for an expected win is ≤ 40% of what the old system would have produced.
- **SM4:** An 11–0 win produces a `movWeight` of 1.25 and a noticeably larger delta than an 11–9 win in the same matchup.
- **SM5:** All existing tests in `elo.test.ts`, `replay.test.ts`, and `post-replay.test.ts` pass after updating `makeMatch` helpers to include `games: []`.

---

## 8. Open Questions

- **OQ1:** Should `K_MAX`, `K_MIN`, and `K_DECAY_RATE` be configurable by an admin via the UI in the future, or are hardcoded constants acceptable long-term?
- ~~**OQ2:**~~ **RESOLVED by Amendment C (2026-08-23)** — `effectiveK` is now the individual player's K. Teammates share `expectedScore` but not `effectiveK`.
- **OQ3:** After the full recompute on deploy, should a notification or summary be shown to admins indicating how many players' ratings changed significantly?
