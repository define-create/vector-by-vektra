# Vector by Vektra — Business & Development Plan (v6.1, complete)

**Context:** Solo developer. Goal: small monthly recurring income ($1–2K/month target). Timeline: 12–14 months. Product thesis: a rec-group competition tracker operated by one volunteer scorekeeper ("keeper") per group. Everyone else consumes results through shared links with no app install required.

**Timeline rule:** Dates may slip; phase gates may not. If a phase runs long, extend the calendar — never skip an exit criterion to stay on schedule.

**Phases:**

- Phase 0 (months 1–2): Validate the core loop
- Phase 1 (months 3–6): Build keeper tools and the season system; start charging
- Phase 2 (months 7–12): Grow slowly; focus on retention
- Phase 3 (months 12–14): Evaluate results and decide next steps

---

## Phase 0 — Validate the Core Loop (Months 1–2)

**Goal:** Confirm that (a) a keeper will enter scores every week without reminders, and (b) the group engages with the results — in groups where you are not present.

**What to build:**

1. Shareable recap: an image plus a web link that requires no login. Contents: top 3 finishers, Player of the Night, one rotating highlight stat.
2. Score entry screen optimized for one user: pre-filled player lists from session check-in, large tap targets, high-contrast dark mode readable in sunlight. Reuse existing text entry as an optional faster input method for the keeper.
3. Basic tracking: recap opens per group per week, and session attendance per player. Recap engagement is measured as total opens divided by session participants — approximate by design; do not build per-user tracking tokens for this.

**Rules to implement now:**

- Recaps never display the lowest-ranked players by name or nickname. Only top finishers and positive stats (improvement, streaks) are named.
- Guest slots that may belong to minors stay anonymous with no claim option.
- Publish a short, plain-language privacy note. Conservative visibility defaults.

**Data to watch this phase (feeds Phase 1 tuning):**

- How often games include guest or unknown players. Guest-heavy groups will see dampened game scores on many games (see Phase 1B); if guests are constant, dampening must stay modest or the leaderboard partly measures "who got to play against established players."

**Test setup:** 4–6 groups. Your home group, 1–2 nearby groups, and at least 2 groups at a venue where nobody knows you. Attend the first two sessions of each group, then stop attending and observe whether the loop continues.

**Advance to Phase 1 when:**

- At least 3 keepers have logged 4+ consecutive weeks without being reminded, including at least 1 at a venue where you're unknown
- Recap opens ÷ participants ≥ 0.5, and the ratio is not declining week over week
- Group chats show reactions to recaps most weeks
- Attendance is stable across skill levels (weaker players are not dropping out)

**Stop or rethink if:**

- Keepers need weekly reminders
- Recaps get opened but produce no conversation
- The loop only works when you're physically present
- Recap opens drop more than 30% by week 4
- Lower-ranked players start skipping sessions

---

## Phase 1 — Keeper Tools, Season System, First Revenue (Months 3–6)

**Goal:** Reduce keeper effort, launch the season system, and get the first 10 paying groups. Charging starts in this phase because willingness to pay is the main validation question, and on this timeline it must be answered early. Note the schedule pressure: seasons must ship early in month 3 so one full season cycle completes before the Phase 1 gate.

### 1A. Keeper tools

- Score entry in under 15 seconds per game
- Keeper's name displayed on every recap; keeper badge on their profile; keeper-only stats (pairing performance, attendance trends)
- Group ownership: all history belongs to the group, not the keeper's account. Any member can be promoted to keeper in two taps. If a session starts with no active keeper, the app prompts the group to assign one.
- Score dispute flow: any participant can flag a score; the keeper confirms or corrects it; edits are visible. Must function without your involvement.
- Visibility settings per player: display as nickname, initials, or anonymous. Default conservative. Keeper sets a group-level tone setting (competitive vs. casual) that adjusts recap language.

### 1B. The season system (specified)

**Purpose:** Standings freeze after 6–8 weeks of continuous play — the same players occupy the top spots, results become predictable, and recap engagement drops. Seasons reset the competition on a fixed cycle so there is always an open contest.

**Season structure:**

- Length: 6 or 8 weeks, chosen by the keeper at season start. No other configuration options initially.
- Week 1: new season opens with a fresh leaderboard. Recap announces the new season.
- Middle weeks: normal weekly recaps, now including season context ("3 weeks remaining; Maria trails by 12 points").
- Final week: season ends. The finale recap shows final standings and all awards. This recap gets the highest visual polish in the product.
- Between seasons: up to 1 week gap, then the next season starts automatically.
- Seasons start, run, and close automatically on the calendar. The keeper never has to remember to close a season.
- **Events are orthogonal to seasons (invariant, decided 2026-06-11):** an Event is a keeper-chosen tag on matches (club night, one-off tournament) and may occur whenever the group wants; the Season is a calendar window. Season ranking considers all games played inside the window — with any Event tag or none. Introducing seasons changes nothing about how Events work; the two systems only share the same raw match pool. Event recaps are keeper-triggered ("End session") and show the Event's podium; the season finale recap is calendar-triggered and shows season standings; during a season an Event recap additionally carries season context.

**Rating engine — implementation (amended in v6.1):**

- **Keep the existing validated ELO v2 engine** (`lib/rating-engine/`). v6 mandated OpenSkill on the claim that a hand-rolled engine produces subtle leaderboard errors. That claim was tested empirically on 2026-06-11: both engines replayed the full 526-match history and were compared on prediction quality (`docs/rating-engine-bakeoff.md`). Result: a statistical wash — ELO v2 log-loss 0.6501 vs OpenSkill 0.6673 overall; 0.6258 vs 0.6218 on seasoned matches. No perceivable leaderboard difference. **Engine changes henceforth require bake-off evidence** (re-run `scripts/rating-bakeoff.ts`), not library preference.
- The engine already provides what OpenSkill was prescribed for: dynamic K decaying 48 → 16 with experience (newcomer handling), Amendment A veteran K protection when partnered with new players (dampening), native 2v2 team ratings, and win probability for any 2v2 matchup via `expectedScore` — already powering the Matchups screen.
- Uncertainty equivalents, in place of OpenSkill's sigma: **"Provisional" / "Rookie" tag** = `matchCount < 10` (the engine's `NEW_PLAYER_THRESHOLD`, already surfaced in-app as the new-player banner). Confidence-aware display can use the existing `ratingConfidence` field.
- **Ratings are per-group.** A player active in two groups has two independent ratings. Global ratings would move from games a group never saw ("why did my rating drop? we didn't even play"), which feeds distrust. Revisit only if cross-group play becomes common.
- **Displayed rating:** scale ELO points to a friendly range (e.g., 0–100). Optionally blend with `ratingConfidence` so a newcomer's displayed rating rises as their rating settles — the same steady-progress effect v6 wanted from shrinking sigma.
- **What you build on top (thin layer, arithmetic only):** game-score scaling, best-N-of-last-M season aggregation, eligibility gates, award calculations, recap narration.
- **Data architecture: raw game results are the source of truth.** Already true of the codebase: all ratings and snapshots are derived values recomputed by full replay (`lib/rating-engine/replay.ts`, recompute service). Version the scoring layer the same way so a future scoring fix can recompute history. Avoid recomputation mid-season; between seasons it is safe.
- **Validation before launch:** already done — partner-gap calibration (α = 0.50 optimal, no partner-farming leak; `scripts/rating-calibration.ts`) and the OpenSkill bake-off. Re-validate per group once multi-group data exists.
- **Known data quirk (bake-off finding):** team 1 wins ~69% of historical matches regardless of ratings — entry order leaks the outcome (winner-first text entries; the enterer's team is always team 1). Harmless for rating updates; never treat "team 1" as an unbiased label in stats or prediction features.
- **Game-score display scale:** raw expected-vs-actual values (e.g., +0.31) are unfriendly. Choose a human scale (e.g., 0–100 per game) before the first real season. Raw-data-as-source-of-truth makes a later change technically possible, but archived season scores are the paid product — treat the scale as fixed once real seasons exist.

**Two-layer scoring:**

**Layer 1 — Skill rating:** the ELO v2 rating, continuous across seasons. Never fully resets, because the rating math needs accumulated data to stay accurate. At each season start, apply a soft reset: move every rating 25% toward the group average and temporarily raise the effective K (a boost decaying over each player's first ~5 matches of the season). This creates early-season volatility so outcomes aren't predetermined, without discarding what the engine has learned. *(v6.1: K-boost replaces v6's sigma increase — same effect, ELO mechanics.)*

**Layer 2 — Season score:** starts at zero each season. This is what the leaderboard displays.

**How a single game is scored:** every game produces one numeric game score, defined as *actual result versus expected result*, where the expected result is the engine's win probability (`expectedScore`) computed from all four players' ratings. Because the game score exposes a number the rating engine already produces internally, the leaderboard and the ratings can never contradict each other.

Components of the game score:

- **Opponent strength (included):** a win over a stronger opposing pair scores higher than a win over a weaker one.
- **Partner adjustment (included):** a win with a weak partner scores higher than a win while paired with the group's best player. A win your pairing was 80% favored in scores low; a win at 30% odds scores high.
- **Margin of victory (excluded at launch):** weighting 11-3 over 11-9 encourages running up scores against weaker players, which damages the casual atmosphere. May be revisited later with a capped modifier (max ±10%). *(Note: the rating engine itself applies a capped MOV multiplier [0.75–1.25] to rating updates; this exclusion applies to the game-score layer.)*
- **Losses (near zero at launch):** losses earn no meaningful points initially. Revisit if bottom-half engagement drops: a close loss as a heavy underdog could earn partial credit, at the cost of a harder-to-explain system.

**New and unknown players (cold start):**

- New players enter at the group-average rating with maximum K. Their rating moves fast for the first ~5–10 games, then stabilizes. During this period they are visibly tagged **"Provisional"** (or "Rookie") on the leaderboard, with the rating shown as approximate. The tag explains the volatility before anyone asks.
- **Games involving provisional or guest players produce dampened game scores for established players.** When the expectation is unreliable, the stakes are low — this prevents one strong newcomer entering at average from wrecking established players' season scores in a single session. The engine's dynamic K and Amendment A handle the rating side; the game-score layer applies its own dampening keyed on `matchCount < 10` or guest status.
- **Keep dampening modest.** In open play, guests are common; if dampening is aggressive, guest-heavy groups will see most games score low for everyone. Use Phase 0 guest-frequency data to tune.
- **Guest slots** (unidentified players) are treated as permanently provisional in the game-score layer. If a guest later claims the profile, their game history is already attached and the rating back-fills from it (full replay).
- A provisional player's counted set fills from game one; early dampened scores get replaced naturally as their rating settles and later games score normally.

**Player-facing explanation (shown in the app):** "Your game score reflects how much you beat expectations — tougher opponents and tougher pairings are worth more. New players count for less until we know how good they are."

**How the season score is computed — best N of the last M games:** the season score counts each player's best N game scores drawn from their most recent M games this season (e.g., best 12 of the last 20 for an 8-week season). "Best" means highest game score as defined above. Sort the last M games by game score, sum the top N.

Why this shape:

- A cumulative total lets a mediocre player win on volume — play 14 sessions and out-accumulate a stronger player who played 7.
- A pure win-rate rewards going 5-1 early and sitting out to protect the ratio.
- Best-N alone still leaks volume: a 40-game player selects their best 12 from 40 chances, while a 15-game player selects from 15. More games means more lottery tickets for high-scoring upsets.
- **Best N of the last M** closes all three gaps: below N games, playing more always helps (attendance rewarded); beyond N, a new good game can only improve the score by replacing the worst counted result (no reason to stop playing); and the rolling window of M caps the sampling pool so everyone selects from a similar-sized sample. Skill decides the top. Golf handicaps use the same structure (best 8 of the last 20) for the same uneven-attendance problem.

**Leaderboard transparency:** the leaderboard shows the counting rule next to each player — "counting best 12 of your last 20 games (18 played)." An opaque formula feeds rating distrust; a visible one answers it. Fallback if testers find the rule confusing: cap counted games per session (e.g., max 3), which is cruder but self-explanatory.

**Retroactive movement (expected behavior, must be narrated):** a good game tonight can replace a bad game in a player's counted set, moving them up the leaderboard without anyone else playing; an old high-scoring game can also age out of the last-M window. This is correct, but it looks like a bug unless the recap explains it as a story: "Maria's win tonight replaced her worst game — she jumps to 3rd."

**Tuning warning:** expected-vs-actual scoring gives a dominant player little upside — routine wins score low for them. Rotation mostly self-corrects this because pairings vary. Monitor small groups with stable skill gaps: if the group's clearly best player keeps finishing mid-leaderboard, the weighting is too aggressive and needs a floor on what a win can score.

**Champion eligibility:** highest season score, with two gates — a minimum number of counted games, and appearances in a minimum number of distinct weeks (e.g., ≥4 weeks of an 8-week season). Do not gate on "% of sessions attended": groups running multiple weekly sessions would make single-night regulars permanently ineligible. The weeks gate prevents a short undefeated cameo from taking the title.

**What persists across seasons:** skill rating (softly reset), all-time head-to-head records, career stats, and the archive of past season results and awards.

**What resets each season:** season score, season leaderboard, season win-loss record, streaks, and the counted-game set.

**Awards at the finale:** Gold/silver/bronze alone would recreate the frozen-podium problem, since strong players would win every season. Award variety exists so most of the group can plausibly win something, which keeps mid- and lower-ranked players attending. Standard set:

- Champion: highest season score (eligibility gates above)
- Most Improved: largest skill-rating gain, **measured as end-of-season rating versus the previous season's end-of-season rating — pre-reset values on both ends.** Never compute improvement from displayed ratings or across the soft reset: the reset pulls top ratings toward the mean and they "recover" by normal play, which would hand Most Improved to the wrong player.
- Iron Player: most sessions attended — volume gets its dedicated prize, kept separate from the skill-based title
- Giant Slayer: highest single game score of the season (the biggest beat-the-odds win)
- Best Duo: highest win rate as a pair (minimum games threshold)
- Clutch: best record in games decided by 2 points
- Rookie of the Season: best-performing new member

Rotate 1–2 novelty awards per season to keep finales from becoming repetitive.

**Edge cases:**

- Uneven attendance: handled structurally by best-N-of-last-M; rate-based stats (win %, rating) additionally require a minimum game count.
- Mid-season joiners: enter the current season immediately, flagged as rookies (provisional period doubles as the rookie tag), eligible for Rookie of the Season. A late joiner with fewer than N games simply counts all their games.

**Success measurement:** Compare recap open ratios in week 1 of a new season against the final 2 weeks of the previous season. If new seasons revive engagement, the system works. If engagement declines across season boundaries, seasons don't solve the decay problem — see kill signals below.

### 1C. Pricing

**Group tier: $8–12/month per group.** Paid features:

- Season archive: past season results, standings, and awards
- All-time records and head-to-head history
- Championship markers on profiles (e.g., "3x Champion")
- Finale awards package (polished shareable graphics)

**Free tier (permanent):** current season standings, weekly recaps, finale recap. The sharing loop is never behind a paywall, because shared recaps are the only distribution channel.

**Who pays — the Patron role:** "the group pays" needs a mechanism, and it must not default to the keeper. Any member can become the group's **Patron** by opening a shareable payment link (posted in the group chat, naturally at the season finale) and putting their card on it. The Patron gets a visible badge — a second status role mirroring the keeper. One card, one member, publicly credited. The keeper can be the Patron only by their own explicit choice, never by default or social pressure baked into the flow.

**Payment infrastructure: subscriptions are sold on the web only (Stripe).** The app never hosts the purchase flow. This avoids app-store commission (15–30%), fits group-level purchases (which in-app purchase handles badly), and matches the product's link-based surfaces.

**Keepers never pay.** Keepers get paid features for free. Reason: they supply the labor that makes the product function; charging them would reduce the supply of keepers.

**Renewal mechanics:** The season finale is the renewal prompt ("Keep your group's history — renew for Season 5"). Season boundaries create a natural billing rhythm and a re-engagement trigger for lapsed groups.

### Phase 1 go-to-market

- Grow to 10–15 groups at 1–2 venues
- Announce pricing to existing groups directly
- Maintain an informal chat channel with all keepers for feedback and early problem detection

**Advance to Phase 2 when:**

- 10 paying groups
- Keeper 8-week retention ≥60%
- Median score entry under 20 seconds per game
- At least 1 keeper handoff happened without your involvement
- Recap open ratios held flat or rose across one full season cycle
- At least 1 score dispute was resolved through the flow without contacting you
- Testers accept the game-score explanation — if it doesn't land, that's the earliest warning on the algorithm-trust problem and the cheapest moment to fix the wording

**Stop or rethink if:**

- Groups engage heavily but won't pay $8/month: demand may not support a business. Options: test individual premium instead, or accept Vector as a free hobby tool and stop investing.
- Keepers quit even with fast entry: the volunteer model doesn't hold. Consider auto-generated recaps from partial data as a fallback product.
- Season resets don't revive engagement: interest decay is permanent, not cyclical. Narrow the target market to explicitly competitive groups and re-evaluate the revenue target.

---

## Phase 2 — Slow Growth, Retention Focus (Months 7–12)

**Goal:** Grow toward the revenue target through recap sharing, while keeping churn low. Priority order: retention first, growth second. 100 groups that renew beat 1,000 that churn.

**What to build:**

1. "Start this for your group" button on every recap, leading to one-tap group creation
2. Claimable guest profiles: a player who appeared in logged games can claim that history when they join (nickname-based, same visibility defaults; rating back-fills from claimed game history)
3. Recap rendering verified on iMessage, WhatsApp, and GroupMe every release. The image must carry all key content so a broken link preview doesn't lose the message.
4. Individual premium ($4–6/month), added only after the group tier shows renewals: personal match history, rating trajectory, head-to-head records, partner statistics. Offer it at the moment a player disputes their rating — that's when they want the detailed data. Sold on the web, same as the group tier.
5. Renewal and win-back mechanics: season-end renewal prompts, season archive emails, "Season N starts Tuesday" messages to lapsed groups.

Nothing else. This phase is maintenance, polish, and the items above.

**Rules for this phase:**

- If recap sharing or keeper retention drops after any pricing change, reverse the change immediately.
- If the timeline crosses winter, expect an attendance dip in outdoor regions. Judge retention against same-season comparisons, and approach indoor venues.
- New feature ideas get one test: does it cause a group to pay or to stay? If not, it goes on the not-doing list.

**Go-to-market:** One venue at a time. No paid acquisition. Identify keeper-type people on sight (the person already organizing games) and recruit them directly. Time announcements around season finales, since those recaps travel furthest.

**Targets by month 12:**

- MRR approaching goal: $1–2K/month — 100–200 paying groups, or fewer groups plus individual premium subscribers
- Season-over-season group renewal ≥70%
- Support workload manageable within your available hours
- Majority of new groups arriving via shared recaps rather than your direct recruiting

**Stop or rethink if:**

- MRR plateaus but churn is low: not a failure — this may be the natural size. Phase 3 decides.
- Growth is offset by churn: stop recruiting, fix retention only.
- Support load grows with group count: pause growth until self-service handles the load.

---

## Phase 3 — Evaluate (Months 12–14)

**Goal:** An honest decision based on the numbers. Nothing new gets built in this phase.

**Question:** Is Vector producing, or clearly trending toward, the target recurring income at a time cost you're willing to sustain?

**Three outcomes, all acceptable:**

1. **Growing:** MRR climbing, churn controlled. Continue. Only now consider the expansion ideas deliberately excluded from this plan (venue partnerships, sponsorships, other sports) — and only if revenue justifies the added workload.
2. **Plateaued but stable:** e.g., $400–800/month with low maintenance. A working side business. Keep running it; don't force growth that costs more hours than it returns.
3. **Loop didn't hold or nobody paid:** shut down or open-source. The thesis was tested in 14 months at low cost with real users. That's a completed experiment.

Make the call from the three tracked numbers, not from attachment to the project.

---

## Tracking (all phases)

Three numbers, reviewed weekly:

1. **Keeper weekly retention** — measures whether the core loop functions
2. **Paying-group churn** (from Phase 1 on) — measures whether the business holds
3. **MRR** — measures progress toward the goal

Two additional checks at season boundaries only:

- Recap open ratios across the season transition (detects engagement decay)
- Session attendance by skill tier (detects weaker players quietly quitting)

## Not-doing list (re-read at each phase transition)

Venue dashboards. Hardware. Sponsorships. Expansion beyond your metro area. Paid advertising. Competitor monitoring. Other sports. Custom features for individual groups. Marketing work beyond the recap itself. Further rating-engine changes — the engine is the validated ELO v2 (`lib/rating-engine/`) plus a thin scoring layer, nothing more; any engine swap requires new bake-off evidence first. In-app purchase flows. Per-user recap tracking tokens. Any feature that doesn't cause a group to pay or stay.

## Operating rules

1. Keepers never pay, and every release either reduces their effort or increases their visibility.
2. The recap is what non-users experience; the app exists for the keeper.
3. Weekly recaps and current standings are free permanently.
4. Every workflow must function without your involvement — support requests indicate design gaps.
5. When retention and growth conflict, choose retention.
6. Raw game results are the source of truth; every score and rating is derived and recomputable.
7. Dates may slip; gates may not.

---

## Changelog: v6 → v6.1

1. **Rating engine: keep ELO v2, drop the OpenSkill mandate.** Decision made from an empirical bake-off on 526 real matches (2026-06-11, `docs/rating-engine-bakeoff.md`): prediction quality is a statistical wash. Engine changes now require bake-off evidence.
2. All sigma/mu mechanics translated to ELO equivalents: Provisional tag = `matchCount < 10`; season soft reset = 25% pull toward group mean + temporary K boost (was sigma increase); Most Improved computed on pre-reset season-end **ratings** (was mu); guest slots permanently provisional in the game-score layer (was permanent max sigma).
3. Game score's expected result now explicitly the engine's `expectedScore` (was OpenSkill win probability); same actual-vs-expected definition.
4. Recorded the team-order bias found by the bake-off (team 1 wins ~69% regardless of ratings; entry order leaks outcome) as a standing data caveat for stats/prediction work.
5. "Validation before launch" marked done (calibration + bake-off); re-validate per group when multi-group data exists.
6. Phase 0 "voice entry" corrected to **text entry** (free-text parse mode is what exists in the app).
7. Not-doing list updated to match (engine line).

## Changelog: v5 → v6

1. Season score changed from best-N to **best N of the last M games** (closes the remaining volume exploit)
2. **Most Improved** computed on pre-reset season-end deltas (soft reset was corrupting it)
3. **Champion gate** changed from %-of-sessions to counted games + distinct weeks (multi-session groups broke the old gate)
4. **Patron role** added: web payment link, any member pays, visible badge; keeper never pays by default
5. Subscriptions **sold on the web only** (Stripe); no in-app purchase flow
6. Recap engagement defined as **opens ÷ participants**, approximate by design
7. **Raw results are the source of truth**; scores derived; scoring engine versioned
8. **Ratings are per-group**
9. Guest-dampening flagged as a Phase 0 watch item; keep dampening modest
10. Timeline rule added: **dates may slip, gates may not**
