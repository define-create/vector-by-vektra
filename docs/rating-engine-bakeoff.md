# Rating Engine Bake-off: ELO v2 vs OpenSkill

**Date:** 2026-06-11
**Script:** `scripts/rating-bakeoff.ts` (read-only; openskill installed on demand, see script header)
**Decision:** **Keep ELO v2.** Plan v6's mandate to adopt OpenSkill is amended (see plan v6.1, §1B).

## Why this was run

Business plan v6 prescribed replacing the hand-rolled ELO v2 engine with the
OpenSkill library, on the claim that hand-rolled Elo "has no uncertainty
tracking, no native 2v2 team support, and no principled newcomer handling"
and therefore "produces subtle leaderboard errors that players find before
you do." That is an empirical claim, and the replay architecture (raw matches
as source of truth) makes it cheap to test: replay the full match history
through both engines, have each predict every match winner *before* updating
its ratings, and compare prediction quality.

## Method

- 526 non-voided doubles matches, chronological order, identical for both engines.
- ELO v2: exact mirror of `lib/rating-engine/replay.ts` (dynamic K, Amendment A
  veteran protection, lopsided-gap factor, margin-of-victory multiplier).
- OpenSkill: `openskill@5.0.1`, default Plackett-Luce model, default
  parameters (untuned — noted below).
- Metrics: log-loss and Brier score (lower = better), plus favourite-accuracy.

## Results

| Segment | Engine | Log-loss | Brier | Favourite wins |
|---|---|---|---|---|
| All 526 matches | **ELO v2** | **0.6501** | **0.2292** | 63.3% |
| | OpenSkill | 0.6673 | 0.2319 | 63.5% |
| Seasoned (all 4 players ≥5 prior matches, n=317) | ELO v2 | 0.6258 | 0.2175 | 68.8% |
| | **OpenSkill** | **0.6218** | **0.2121** | 67.8% |

**Interpretation: a statistical wash.** ELO v2 is slightly better overall
(it is more cautious during player cold-start); OpenSkill is slightly better
once all players are established. Both deltas are far below anything a player
would perceive on a leaderboard. OpenSkill ran untuned and could close its
small overall gap with sigma/beta tuning, but it cannot open a meaningful
lead. Combined with the earlier partner-gap calibration analysis
(`scripts/rating-calibration.ts`: α = 0.50 optimal over 502 matches, no
partner-farming leak), the evidence says the current engine's probabilities
are accurate.

## Why keep ELO v2

Each feature the plan wanted OpenSkill for already has a cheaper path here:

| Plan v6 wanted (via OpenSkill) | ELO v2 equivalent |
|---|---|
| Newcomer handling (high sigma → fast movement) | Dynamic K: 48 → 16 as matches accumulate (`dynamicK`) |
| Dampening when newcomers are involved | Amendment A veteran K protection (`teamBaseK`) |
| Native 2v2 win probability | `expectedScore` on team averages — already powers the Matchups screen |
| "Provisional" leaderboard tag | `matchCount < NEW_PLAYER_THRESHOLD (10)` — already shipped as the new-player banner |
| Displayed rating rises as certainty grows | Display-layer blend using the existing `ratingConfidence` field |

The decision is also **reversible by design**: raw match results are the
source of truth and the engine is a pure function replayed over them, so
swapping engines later is one replay away. If genuine need for Bayesian
uncertainty appears, re-run the bake-off first.

## Incidental finding: team-order bias in the data

Both engines' calibration tables under-predict team 1 in nearly every
probability bucket: **team 1 wins ~69% of matches regardless of ratings.**
This is not engine miscalibration (spread-team bucketing shows accurate
probabilities); the *team order encodes the outcome*. Likely causes:
free-text entries ("A & B defeated C & D") are parsed winner-first, and the
enterer's own team ("Me") is always team 1 while the habitual enterer is one
of the stronger players.

Consequences:
- **Harmless for ratings** — the winner is known at update time regardless of order.
- **Must be remembered** in any future stats, prediction display, or ML work:
  never treat "team 1" as an unbiased label.

## Re-running

```
npm i -D openskill
npx tsx scripts/rating-bakeoff.ts
npm un openskill
```
