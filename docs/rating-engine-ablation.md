# Rating Engine Ablation & Tuning Study

**Date:** 2026-08-23
**Script:** `scripts/rating-ablation.ts` (read-only, no DB writes, no extra deps)
**Data:** 566 non-voided doubles matches (572 fetched)
**Decisions:**
1. **Do not tune any constant.** Every apparent improvement is in-sample overfitting; the holdout reverses it.
2. **Ship per-player K, retiring Amendment A.** The one change in this study that clears the noise floor — and it strengthens out of sample. Implemented in `lib/rating-engine/replay.ts`.

Companion to `docs/rating-engine-bakeoff.md` (ELO v2 vs OpenSkill, 2026-06-11).

## Why this was run

The June bake-off compared the **whole** engine against OpenSkill and called it a
wash. It never asked the cheaper, more useful question: **does each term we
hand-rolled actually earn its keep?** Margin of victory, the lopsided-gap
factor, Amendment A's veteran cap, and dynamic K had all been added on
reasoning, never measured in isolation. The constants (`K_MAX`, `K_MIN`,
`K_DECAY_RATE`, `LOPSIDED_SCALE`, the 400-point Elo scale) had never been swept
at all.

## Two methodology fixes this study introduces

Both earlier scripts over-read their own output. These corrections matter more
than any individual number below.

**1. The honest baseline is the coin flip, not the base rate.**
Team 1 wins 67% of matches, an entry-order artifact (see the bake-off doc). A
constant "team 1 wins" predictor therefore scores log-loss 0.6345 — *better*
than our engine's 0.6470. That is not a real competitor: our engine is
symmetric in team order by construction and structurally cannot exploit the
artifact, nor should it. Skill is measured against **ln(2) = 0.6931**.

**2. Differences of ~0.001 nats are noise at n≈566.**
`scripts/rating-calibration.ts` prints "leak is real" whenever the best alpha
isn't exactly 0.50 — on the current data it fires on a **0.0003** difference
(0.6470 at α=0.50 vs 0.6467 at α=0.60). That is a flat curve, not a leak. Every
comparison here is a **paired difference with a 95% CI** over the same matches;
"better" means the CI excludes zero.

## Result 1 — no term earns its keep on prediction accuracy

Paired against the engine **as it stood before this study** (shared team K +
Amendment A). Negative = variant predicts better.

> **Re-running the script will not reproduce these signs.** Once per-player K
> shipped, `scripts/rating-ablation.ts` re-baselined `CURRENT` onto the shipped
> engine, so the reference row moved from 0.6470 to 0.6431 and differences flip
> accordingly. The pre-change engine is still available there as the
> `legacy: team K + Amendment A` variant, which reproduces 0.6470 exactly. The
> table below is preserved as the record of the decision as it was made.

| Variant | log-loss | paired Δ log-loss (95% CI) | acc | paired Δ acc (95% CI) |
|---|---|---|---|---|
| **current engine** | 0.6470 | — | 64.0% | — |
| − margin of victory | 0.6470 | +0.0001 [−0.0014, +0.0015] noise | 63.8% | −0.2pp [−1.5, +1.2] noise |
| − lopsided gap factor | 0.6458 | −0.0012 [−0.0031, +0.0008] noise | 64.3% | +0.4pp [−0.9, +1.6] noise |
| − Amendment A (veteran cap) | 0.6464 | −0.0006 [−0.0030, +0.0018] noise | 64.1% | +0.2pp [−1.5, +1.8] noise |
| − dynamic K (flat K=32) | 0.6451 | −0.0019 [−0.0067, +0.0029] noise | 62.5% | −1.4pp [−3.4, +0.5] noise |
| plain Elo (all extras off) | 0.6445 | −0.0025 [−0.0084, +0.0034] noise | 61.8% | −2.1pp [−4.5, +0.2] noise |
| **+ per-player K** (drops Amdt A) | **0.6431** | **−0.0039 [−0.0069, −0.0009] BETTER** | 63.4% | −0.5pp [−2.4, +1.3] noise |
| + per-player K, no lopsided | 0.6420 | −0.0050 [−0.0084, −0.0016] BETTER | 63.6% | −0.4pp [−2.4, +1.7] noise |
| *(coin flip)* | 0.6931 | | 50.0% | |

The last two rows are *additions*, not ablations — see Result 3.

Seasoned-only (all four players ≥5 prior matches, n=317) tells the same story:
every CI spans zero.

**Reading it honestly:** not one of the four elaborations produces a detectable
improvement in prediction. Every log-loss point estimate actually moves the
*wrong* way — stripping features slightly improves log-loss — though never
significantly.

**The one partial defence: dynamic K.** It is the only term whose removal
costs accuracy in a nearly-significant way (−2.1pp overall CI [−4.5, +0.2];
−2.9pp seasoned CI [−5.9, +0.1]). The pattern — extras leave log-loss flat but
lift *ranking* accuracy — is consistent with them producing better orderings
with slightly overconfident probabilities. Suggestive, not proven.

MOV, the lopsided-gap factor, and Amendment A show **nothing** on either metric.

## Result 2 — the in-sample sweeps are a mirage

One-at-a-time sweeps produced a tidy, seductive story. Four separate parameters
all "significantly" improved log-loss, and all in the same direction:

| Parameter | Current | In-sample "better" | Direction |
|---|---|---|---|
| `K_DECAY_RATE` | 20 | 30 / 40 / 60 | slower decay |
| `K_MAX` | 48 | 56 / 64 | bigger |
| `K_MIN` | 16 | 20 | bigger |
| Elo scale | 400 | 300 | smaller |

These are the same finding seen four times: *the engine looks under-dispersed.*
Bigger K spreads ratings further; a smaller Elo scale maps the same gap to a
sharper probability. A temperature diagnostic agreed — optimal `s = 1.42`,
equivalent to reading current ratings on a 282-point scale.

**Then the holdout killed all of it.** Tuning on the first 396 matches and
scoring only the last 170:

```
grid searched: 400 configs
best on training split: kMax=80 kMin=12 decay=45 scale=250
  train log-loss 0.6331  (current: 0.6472)   <- looks like a big win
  TEST log-loss  0.6503  (current: 0.6464)   <- actually WORSE
  paired test diff +0.0039 [-0.0281, +0.0359] => NOISE out of sample
```

Temperature, fitted the same honest way, fails too — and is unstable:

```
s fitted on train split:  1.56   (equivalent Elo scale 256)
s fitted on test split:   1.20   <- not the same parameter
TEST log-loss  s=1.00: 0.6464   s=1.56: 0.6490
paired test diff +0.0026 [-0.0181, +0.0232] => NOISE out of sample
```

The apparent under-dispersion is an artifact of fitting the evaluation set. At
this sample size the in-sample optimum is not reproducible on new matches.

## Result 3 — per-player K is the one change that works

Amendment A gave both teammates a **shared** team K, capped at the veteran's
`dynamicK` when a partner had <10 matches. It solved the right problem — a
veteran's rating should not swing harder just because their partner is new —
but it over-corrected: it also dragged the *newcomer* down to the veteran's slow
K, delaying their convergence to a true rating.

**Per-player K** fixes both halves. The outcome surprise `(actual − expected)`
stays a team property, because the team won or lost as a unit. Only the
learning rate becomes personal — which is what K means in Elo: a statement
about how uncertain we are of *that individual*. The veteran keeps their own low
K (a new partner cannot raise it, so Amendment A's protection is preserved
structurally rather than by a cap), and the rookie keeps their own high K.

It fits **zero free parameters**, so unlike the grid search there is nothing for
it to overfit with.

| Segment | Δ log-loss vs current (95% CI) |
|---|---|
| all matches (n=566) | **−0.0039 [−0.0069, −0.0009]** — CI excludes zero |
| seasoned (n=317) | **−0.0044 [−0.0085, −0.0003]** — CI excludes zero |
| **held-out last 170 matches** | **−0.0080 [−0.0161, +0.0001]** |

The holdout point estimate is **twice as large** as the full-sample one. It just
misses significance at n=170 — but it moves in the same direction and grows,
which is the exact opposite of the tuned grid (which flipped sign) and of
temperature (which was unstable). This is the only variant in the study to
behave that way.

### Blast radius on the live leaderboard

Ratings are recomputed from raw matches, so shipping this moves every number:

```
95 players
absolute rating change — median 10.6, p90 23.5, max 89.0
82 players change rank at all; 44 change by >3 places

by experience band:      n    median |change|   max |change|
  0-9   (provisional)   58        10.9            42.3
  10-24                 19        12.0            89.0
  25-49                  4        12.6            65.7
  50+   (veterans)      14         8.7            16.9
```

The movement lands where Amendment A was distorting things — on low-experience
players. Established players (50+ matches) shift by a median 8.7 points, max
16.9, under 2% on a ~1000-point scale. Rank churn is mostly ±1–2 places in a
densely packed middle.

### Verification

`lib/rating-engine/replay.ts` and this script are independent implementations.
Both produce final-ratings checksum `ad1789696cb70de5` over the 566-match
history, and the script prints it on every run for future cross-checks.

`effectiveK` in `RatingSnapshot` is now genuinely per-player rather than
team-level — this resolves **OQ2** in `tasks/prd-rating-system-v2.md`, and makes
`lib/metrics/momentum.ts` (which consumes `effectiveK`) more accurate.

`teamBaseK` remains exported from `lib/rating-engine/elo.ts`, unused by the live
engine, solely so `rating-bakeoff.ts` and `rating-calibration.ts` still
reproduce their historical documented runs.

## Result 4 — per-player *expected score* (the "carry" intuition) makes things worse

**Tested 2026-08-23. Rejected.**

A natural player intuition: *"Stone is rated 65 points above Travis, so when
their team wins, Stone should be rewarded less — he was expected to carry."*
Under the shipped engine both partners share the team expectation, so a rating
gap contributes **exactly zero** to the difference in their deltas (only their
K's differ, i.e. their experience).

Implemented as a tunable strength rather than a yes/no, so a small dose could be
judged on its own merits:

```
E_i = E_team + beta * (expected(r_i, opponentTeamAvg) - E_team)
```

`beta = 0` is the shipped engine. Only the rating *update* is affected; the
match prediction stays team-level, since that is what the model actually claims.

### It degrades monotonically with dose

| beta | log-loss | paired Δ vs shipped (95% CI) | accuracy |
|---|---|---|---|
| 0 (shipped) | 0.6431 | — | 63.4% |
| 0.25 | 0.6454 | +0.0023 [−0.0001, +0.0048] noise | 64.3% |
| 0.50 | 0.6481 | **+0.0050 [+0.0007, +0.0093] worse** | 64.1% |
| 0.75 | 0.6507 | **+0.0076 [+0.0019, +0.0133] worse** | 63.8% |
| 1.00 | 0.6531 | **+0.0100 [+0.0032, +0.0169] worse** | 62.7% |

A clean dose-response — more of it, steadily worse — which is far stronger
evidence than any single point estimate, because noise does not produce
gradients. The holdout agrees in direction and is monotonic too (+0.0011,
+0.0033, +0.0059, +0.0084), though at n=170 every CI spans zero.

### And it compresses the leaderboard, as predicted

| beta | std dev | vs shipped | range | vs shipped |
|---|---|---|---|---|
| 0 | 76.6 | — | 469.3 | — |
| 0.25 | 70.3 | −8.2% | 425.2 | −9.4% |
| 0.50 | 65.5 | −14.5% | 389.5 | −17.0% |
| 0.75 | 61.7 | −19.5% | 359.6 | −23.4% |
| 1.00 | 58.5 | **−23.6%** | 334.0 | **−28.8%** |

At beta=1 the top player falls 1238.9 → 1179.3 and the bottom rises 769.6 →
845.3. The mechanism is structural, not incidental: when a team wins the weaker
partner gains more, and when it loses the stronger partner loses more, so every
result pushes both toward the mean. A rating system that cannot separate players
has failed at its only job, and this costs a quarter of the spread.

It also lands hardest on **veterans** (50+ matches: median 22.3, max 122.8) —
the exact opposite of per-player K, which left them nearly untouched.

### The one honest caveat

At **beta = 0.25** the log-loss CI just touches zero (+0.0023 [−0.0001,
+0.0048]) and accuracy is the best of any variant tested (64.3%, +0.9pp, not
significant). So a small dose is *nearly* free and might marginally improve
ranking. It still costs 8.2% of the spread, and the direction of the log-loss
gradient is unambiguous. Not recommended, but this is a judgement call rather
than a slam dunk at that level.

### Why the theory predicted this

Under the team model `teamRating = (r1 + r2) / 2`, the derivative of the
log-likelihood with respect to each partner's rating is **identical** — both
carry a coefficient of ½. Sharing the surprise equally and scaling by each
player's own uncertainty is therefore the correct gradient step; splitting by
rating double-counts a strength difference the team average already encodes.
The alpha sweep in `rating-calibration.ts` independently confirms the plain
average is the right team model (flat curve, α = 0.50).

This is also what the well-documented Bayesian team systems do. TrueSkill and
OpenSkill update each player in proportion to their own variance σ², with the
surprise computed from *team* means — mechanism-for-mechanism, per-player K.
Neither scales the surprise by a player's rating relative to their partner.
(DUPR is often cited here, but its algorithm is not published; the observable
"partners get different rating changes" is equally true of per-player K, so it
does not distinguish the two designs.)

## Result 5 — weighting the stronger partner (TEAM_ALPHA = 0.60). ADOPTED

**Adopted 2026-08-23**, in the same session as per-player K.

> **Deployment status (2026-09-25):** both engine changes — per-player K and
> TEAM_ALPHA — are parked on branch `parked/rating-engine-and-plans`, not on
> `feature/dev` or `main`. Production still runs the legacy engine. "Shipped"
> elsewhere in this document means "in the engine code", not "live".

### The defect it fixes

Rating never entered the delta split — only experience did, and experience
saturates at the K floor. Measured across all 566 matches:

| Partners rated apart | Pairs | Move identically (<0.5 apart) |
|---|---|---|
| 0–50 | 416 | 30% |
| 50–100 | 258 | 26% |
| 100–200 | 305 | 25% |
| 200+ | 153 | **45%** |

**31% of partner pairs rated 100+ apart received the identical rating change.**
Only 9 of 95 players have bottomed out their K, but they are the most active, so
they dominate the match log. Two floored partners get identical deltas by
arithmetic, not coincidence.

### The change

`teamRating` becomes `0.60*max + 0.40*min` instead of a plain average, and the
delta is split by the same weights (`partnerDeltaShare`: 1.2x stronger, 0.8x
weaker, normalised so an even pair gets 1.0 each). The split is the correct
gradient step for that team model, not a bolt-on — which is exactly what
distinguishes it from the rejected option (b) in Result 4.

**Symmetric:** the stronger partner moves more on wins AND on losses. That is
why it does not compress, and it is the part the user cannot opt out of.

### Measurements

| | Shipped (per-player K) | **alpha 0.60** | Option (b) at full strength |
|---|---|---|---|
| Pairs 100+ apart moving identically | 31% | **2%** | — |
| Log-loss, full history (paired) | — | **+0.0004 [−0.0040, +0.0047]** noise | +0.0100 worse |
| Log-loss, held-out split | — | **−0.0051 [−0.0136, +0.0034]** noise | +0.0084 worse |
| Rating spread (std dev) | 76.6 | **77.3 (+0.8%)** | 58.5 (−23.6%) |

Higher alphas degrade: 0.65 → +0.0011, 0.70 → +0.0034, 0.80 → +0.0115.

### Honest caveats

1. **0.60 is a tuned number**, and this document spends Result 2 warning against
   tuning on 566 matches. The defence: the *direction* (>0.5) is supported by two
   independent analyses and holds out-of-sample; the *exact value* is not —
   0.60/0.65/0.70 are statistically indistinguishable. 0.60 is the most
   conservative of them. The justification is the defect fix (31% → 2%), not
   log-loss, which is flat either way.
2. **Discontinuity at ties.** Partners one point apart get 1.2x and 0.8x; exact
   ties split evenly. Inherent to a max/min team model. A smooth variant
   (weighting by gap size via tanh) would remove it but is a different, untested
   model.
3. **A player's responsiveness now depends on their partner.** The same player is
   the 1.2x partner in one match and the 0.8x partner in the next.
4. **`teamRating` is shared with `lib/matchup.ts`**, so the Matchups forecast uses
   the same team model automatically. Measured separately as neutral-to-slightly
   better (E-only control: −0.0003 in-sample, −0.0022 held-out).
5. **The analysis scripts must NOT use `elo.ts`'s `teamRating`** any more — it now
   carries TEAM_ALPHA and would silently rewrite history. `rating-bakeoff.ts`
   has a local `plainTeamAverage`; `rating-diff-day.ts` uses its own weighted
   form; `rating-ablation.ts` and `rating-calibration.ts` already shadowed it.

### Combined blast radius from the live (legacy) engine

Players are on the legacy engine, so they experience both changes at once:

| Step | median | p90 | max |
|---|---|---|---|
| legacy → per-player K | 10.6 | 23.5 | 89.0 |
| per-player K → alpha 0.60 | 7.1 | 18.4 | 36.3 |
| **legacy → both (what they feel)** | **9.9** | **30.1** | **125.3** |

Spread widens across both steps: **68.2 → 76.6 → 77.3** (+13%), which directly
addresses the "everyone is packed together" complaint that prompted the work.

## Result 6 — the point leak, and why neither fix shipped

**Investigated 2026-08-24. Both candidate fixes REJECTED. The leak stands.**

### The leak is real and it taxes activity

Each match's net rating change is `surprise * (team1 total K - team2 total K)`.
The surprise cancels between the teams; **K does not**, because every player
carries their own. Whenever the two sides' total K differs, the match creates or
destroys rating points.

Over 566 matches this destroyed **1,092 points** — the population mean has
drifted from 1000 to **988.5**. Contributions (they overlap, so they exceed 100%):

| Remove | Leak remaining | Accounts for |
|---|---|---|
| *(nothing)* | 1,092 | — |
| dynamic K | 397 | **64%** |
| lopsided gap | 628 | **43%** |
| margin of victory | 1,003 | 8% |
| alpha split | 1,092 | **0%** |
| everything (plain Elo) | **0** | 100% |

Both main causes are systematic, not incidental. The lopsided factor shrinks the
favourite's K and inflates the underdog's, and favourites win more often than
not — so the low-K side keeps winning. Dynamic K gives newcomers up to 48 versus
16 for veterans, and newcomers enter at 1000, above the mean, so they tend to lose.

**Alpha split contributes exactly zero** — the two shares sum to 2.0 within a
team, identical to 1.0+1.0, so team totals are untouched. Result 5 did not make
this worse.

**It falls on whoever plays most**, because you can only leak by being in matches:

| Games played | n | Points lost to the leak | Per match |
|---|---|---|---|
| 1–9 | 58 | 4.4 | 1.220 |
| 10–24 | 19 | 8.0 | 0.489 |
| 25–59 | 7 | 27.4 | 0.700 |
| 60–149 | 9 | 39.9 | 0.382 |
| **150+** | 2 | **66.6** | 0.251 |

A ~62-point relative penalty for being a regular, against a population standard
deviation of 77. Newcomers leak fastest per match; veterans accumulate most.

### Fix A — subtract a flat correction. Rejected.

Subtract `net/4` from each of the four deltas. Perfectly conservative (0 leaked,
mean exactly 1000). **But it flipped the sign on 3 of 2264 historical results** —
one winner would have *lost* 1.28 rating for winning, two losers would have
gained. "I won and my rating went down" is not a defensible outcome.

### Fix B — scale each side toward the midpoint. Rejected, and this one is subtler.

Scale winners by `target/gained` and losers by `target/lost` where
`target = (gained+lost)/2`. Both factors positive, so signs are preserved by
construction: **0 flips of 2264**, 0 leaked, mean 1000.0, spread 77.0 (better
preserved than Fix A's 76.5). On aggregate outcomes it looked excellent —
Almir +84 (#12 → #7), and it partially corrected thin-evidence inflation by
dragging Jarryd from #2 to #4.

**What killed it was the per-match mechanism, not the aggregate.** The scale
factors are not a gentle nudge:

| How far each side's delta gets scaled | |
|---|---|
| median | **18.7%** |
| p90 | **65.0%** |
| p99 | 163.7% |
| max | **318.9%** |
| sides scaled >10% | **69.9%** |
| sides scaled >25% | **37.8%** |

That is a larger effect than margin of victory (±25% at its extremes), applied
to almost every match. It makes a player's delta depend heavily on **the other
three players' experience levels, including their opponents'.**

Worst of all it destroys the property per-player K exists to provide. Constructed
case, all four at 1000: a veteran (100 games) partnered with a rookie versus two
veterans. The two losing veterans drop **12.08 instead of 8.11 — 49% more —
purely because their opponents' team contained a rookie.** Amendment A was
retired precisely to stop a partner's uncertainty leaking into a veteran's
rating; Fix B reintroduces the same disease through the opponents.

### Fix B, capped — measured, viable, still not adopted

Clamping the scale factors bounds the distortion. This is the cheapest path back
if the activity tax ever becomes a live complaint:

| Cap | Leak remaining | Median distortion | Worst case | Almir's rank |
|---|---|---|---|---|
| none (current) | 100% | 0% | 0% | **#12** |
| ±5% | 85% | 4.8% | 5% | #10 |
| **±10%** | **68%** | **9.1%** | **10%** | **#8** |
| ±20% | 49% | 16.7% | 20% | #8 |
| ±50% | 17% | 18.6% | 50% | #8 |
| uncapped | 0% | 18.7% | **319%** | #7 |

Two things worth remembering from this table. The rank benefit **saturates at
±10%** — anything beyond buys distortion without buying position. And capping
only reduces the objection, it does not remove it: a player's delta still
depends on their opponents' experience, just boundedly.

### Decision

**Keep the leak** (decided 2026-08-24, with all of the above measured).

It is slow, it is understood, and the leaderboard it produces is defensible. The
uncapped cure distorts individual matches far more than the disease distorts the
totals, and while a ±10% cap is genuinely viable, it was judged not worth a third
engine change on top of per-player K and TEAM_ALPHA in the same pass.

Reconsider if any of these become true:
- Regular players complain that their ratings feel stuck or that playing more
  seems to hurt them.
- `1000` needs to mean "average" for a recap, a badge, or cross-group comparison.
- A global leaderboard ships and rank-versus-volume looks obviously wrong.

If it is revisited, start at **±10%** — that row is the whole argument.

A different direction, unmeasured: an **aggregate** correction at recompute time
that redistributes the total leak in proportion to matches played. It would leave
every match's maths untouched, at the cost of breaking
`rating = 1000 + sum of deltas`, which the Command screen's per-match delta
column currently relies on.

## What this means

1. **Do not tune the constants.** Any change would be fitting noise. The
   out-of-sample test is unambiguous.
2. **The engine is fine.** 0.6470 vs a 0.6931 coin flip, 64% accuracy — a
   modest but real skill signal, and the June bake-off already showed OpenSkill
   can't beat it either.
3. **Remaining complexity is unearned but harmless.** With Amendment A now
   retired, MOV and the lopsided-gap factor are the two terms that cannot be
   defended on prediction accuracy. They are kept deliberately, on *product*
   grounds: MOV makes a blowout worth ~45% more than a squeaker (+13.0 vs +9.0
   at even odds), and the lopsided factor makes farming beginners near-worthless
   (+1.65) while paying out big for an upset (+30.0). Those shape how the game
   feels. They are **not** accuracy features, and should not be re-litigated as
   if they were.
4. **The evidence bar in plan v6.1 needs amending.** "Engine changes require
   bake-off evidence" is *nearly* unsatisfiable in the direction of approval:
   the noise floor is roughly ±0.006 nats and almost every realistic candidate
   lands inside it. Per-player K cleared it, but note *how* — a structural
   change fitting zero parameters, verified on a holdout, not a tuned constant.
   Proposed replacement bar:
   - a change that **fits parameters** must beat current on the **holdout**, not
     the full sample (the grid search here proves why);
   - a change that **fits nothing** needs a full-sample CI excluding zero and a
     holdout that does not contradict it;
   - anything landing inside the noise floor is a **product** decision, and must
     only be shown not to *harm* accuracy.
5. **Per-group ratings will make this worse, not better.** Splitting 566
   matches across 4–6 groups leaves ~100 matches each. Nothing in this study
   would be measurable per-group. Cold-start priors — what rating a player
   enters a group with — will dominate what players actually see, far more than
   any K-factor choice.

## Re-running

```
npx tsx scripts/rating-ablation.ts
```

Read-only, no DB writes, no dependencies beyond what the app already has
(unlike the OpenSkill bake-off, which needs an on-demand install).

Adding a new term? Put it behind a flag in the script's `EngineConfig`, add it
to the ablation list, and run it. If the paired CI spans zero, say so plainly
rather than quoting the point estimate.
