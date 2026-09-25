# Vector by Vektra — Product Q&A Reference

> **Sourcing note.** Answers below are drawn from the actual codebase and the
> `specification/` + `tasks/` documents as of 2026-06-14. Each section flags
> whether the answer is **grounded in code/spec** or is **not yet decided / not
> in the repo**. Strategy, growth, and metrics questions are mostly the latter —
> Vector is an early-stage, manual-entry-first tool and many business questions
> have no artifact in the repo. Those are marked **[NOT IN REPO]** so they aren't
> mistaken for shipped decisions.
>
> Key source files:
> - Rating math: [lib/rating-engine/elo.ts](../lib/rating-engine/elo.ts), [replay.ts](../lib/rating-engine/replay.ts), [post-replay.ts](../lib/rating-engine/post-replay.ts)
> - Recompute pipeline: [lib/services/recompute.ts](../lib/services/recompute.ts)
> - Match entry: [app/api/matches/route.ts](../app/api/matches/route.ts)
> - Predictions: [lib/matchup.ts](../lib/matchup.ts), [lib/metrics/](../lib/metrics/)
> - Specs: [specification/](../specification/), [tasks/prd-rating-system-v2.md](../tasks/prd-rating-system-v2.md), [README.md](../README.md)

---

## 1. Scoring Algorithm

**Grounded in code.** The engine is a **doubles-aware ELO** (`lib/rating-engine`).

**Exact formula.** For each match, in chronological order (`matchDate`, then `createdAt` tiebreak):

1. **Team rating** = simple average of the two partners: `teamRating = (r1 + r2) / 2`.
2. **Expected score** (logistic): `E_A = 1 / (1 + 10^((rB − rA) / 400))`.
3. **Effective K** = `dynamicK(thatPlayer'sPriorMatches) × gapFactor(or 2−gapFactor) × movWeight`. K is **per player**, not per team.
4. **Delta** = `K × (actual − expected)`, where actual = 1 (win) / 0 (loss). Partners **share** the expected score (the team won or lost as a unit) but each moves by their **own** K, so their deltas differ whenever their experience differs.

- **Starting rating:** 1000 (`INITIAL_RATING`).
- **K-factor:** *dynamic*, not flat. `dynamicK(n) = 16 + 32·e^(−n/20)` where `n` = prior non-voided matches. So K=48 at match 0, ≈36 at 10, ≈28 at 20, ≈20 at 50, →16 at 100+. Constants: `K_MAX=48`, `K_MIN=16`, `K_DECAY_RATE=20`.
- **Decay mechanics:** There is **no raw-rating decay for inactivity** (explicit non-goal in the v2 PRD). Inactivity is instead expressed through `ratingConfidence` (recency term `Cr = e^(−daysSinceLast/45)`), not by moving the number.

**Does it account for score differential (11-3 vs 11-9)?** **Yes** — Margin-of-Victory multiplier. `movWeight = 0.75 + 0.50 × (2·(winnerPoints/totalPoints − 0.5))`, clamped to **[0.75, 1.25]**. An 11–0 win → 1.25; a narrow win → near 0.75. If no game scores are recorded it falls back to 1.0.

**How are doubles handled / individual vs partner contribution?** Team rating is the plain average of the pair, and both partners share the same **expected score** — the team won or lost as a unit. But each partner moves by their **own** `dynamicK`, so partners with different experience get **different deltas** from the same result. Skill contribution within a match is still **not** separated (nobody is judged on who played better); only the *learning rate* is individual, which is what K means in Elo.

This is **per-player K**, shipped 2026-08-23. It replaced **Amendment A / Partner-K Isolation** (`teamBaseK`), which capped the whole team's base K at the more experienced partner's `dynamicK` whenever one partner had < `NEW_PLAYER_THRESHOLD` (10) matches. That protected the veteran but over-corrected — it also dragged the newcomer down to the veteran's slow K, delaying their convergence. Per-player K keeps the veteran's protection (their own K is low and a partner cannot raise it) without slowing the newcomer. `teamBaseK` still exists in the codebase but is **unused by the live engine** — it is retained only so the historical analysis scripts reproduce their documented runs. Evidence and blast radius: `docs/rating-engine-ablation.md`.

A `scripts/rating-calibration.ts` analysis exists to test whether "carried" teams beat the model (partner-farming leak); the current weighting (alpha = 0.5, plain average) is the shipped default and the alpha curve is flat — no leak.

**Confidence mechanism like Glicko?** Not Glicko, but a **4-component `ratingConfidence` ∈ [0,1]** (`computeRatingConfidence`): `Cn·Cr·Cd·Cs` =
- `Cn = 1 − e^(−n/20)` (sample size)
- `Cr = e^(−daysSinceLast/45)` (recency)
- `Cd` = opponent + partner diversity over last 20
- `Cs = 1/(1 + σΔ/20)` (stability of recent deltas).

Separately, `ratingVolatility` = stddev of the last 20 rating deltas. New players **do** swing more — via the high dynamic K (48 → 16), not via a variance term. Confidence feeds the **volatility band** on predictions.

**Unified or segmented scale?** **Unified / global.** One ELO pool across all matches, all players, all events. Per-tournament ratings are explicitly out of scope ("by design"; players use DUPR for formal tournament ratings — see `tasks/Improvements-todo-list` #4).

---

## 2. Data Input & Integrity

**Grounded in code** ([app/api/matches/route.ts](../app/api/matches/route.ts)).

- **Who logs / confirmation:** **Single-entry truth.** One user enters the match; there is **no two-party verification**. Mutual confirmation was considered and **deferred** ("adds significant friction, low priority at current scale" — todo #18c). In normal mode the entering user is locked in as team-1-player-1; only **admins** can enter on behalf of all four players (`adminMode` requires `role=admin`).
- **Anti-gaming safeguards:**
  - **Duplicate fingerprint** (`computeMatchFingerprint`): normalized team/date/score hash; a different user re-entering the same match gets a `409 duplicate_match`. Same user re-entering their own is allowed silently.
  - **Rate limits:** non-admin capped at 20 matches/hr, admin 500/hr (Upstash Redis).
  - **Anomaly flagging:** >10 matches/hr by a non-admin sets `flaggedAt` + `flagReason="anomaly:high_volume"` and emails admins (once/hr).
  - **Admin-only on-behalf entry**, **immutable audit log**, **soft void** (no hard deletes).
  - Sandbagging per se is **not** specifically detected — there's no deliberate-loss heuristic.
- **DUPR history import?** **No.** No DUPR import path exists. There is a free-text parser ([lib/import/parse-match.ts](../lib/import/parse-match.ts)) for entering a match from a sentence like "Jordan & Mike beat Sam & Taylor 11-7", but that's manual entry, not DUPR sync.
- **Match formats:** **Doubles only.** The engine, schema, and API all assume exactly 2 players per team (4 distinct players enforced). No singles, round-robin, or switcher support in the rating path. (A tournament/tag grouping exists via the free-text `tag` field, but matches are still individual doubles games.)
- **Informal/practice games at different weight?** **No** — no weighting flag. The only "weight" knobs are dynamic K and MOV, both automatic. The free-text `tag` labels matches but doesn't change their rating weight.
- **Score disagreement:** **No self-service dispute mechanism** (todo #7 — open). A player who disagrees must contact an admin to **void** the match. Within a **20-minute** window the *entering* user can edit their own match; after that, admin-only.

---

## 3. Current Feature Set

**Grounded in code/spec.**

- **Rating trajectory charts — granularity:** Segmented control with **10 Games (default) / 7 Days / 1 Month**. Endpoint `GET /api/trajectory?horizon=10games|7days|30days`. Not arbitrary daily/weekly/monthly/custom — three fixed horizons. Under-chart: Win %, Record, Point differential.
- **Matchup pre-game predictions — what's shown beyond win probability:** Win probability (logistic ELO), **fair zero-vig moneyline** (American odds; "Even" for 0.47–0.53), **rating confidence**, **volatility band** (forward uncertainty interval around the probability), **Momentum** (last-10 structural acceleration), **Expectation Gap**, **Δ Rating**, and **head-to-head history**. (See `components/matchups/`.)
- **Shadow profiles — identity matching:** **Fuzzy name only** — case-insensitive, whitespace-normalized `displayName` lookup (`findOrCreateShadowPlayer`). **No phone, no email matching.** Two real people with the same name collapse into one shadow (known limitation; resolved via admin merge). Claiming attaches all historical matches automatically.
- **Notifications:** Currently **transactional email only** (Resend): email verification, password reset, **friend-invite to claim a shadow**, invite-claimed confirmation, **admin anomaly/flag alerts**, and feedback relay. There are **no** consumer push notifications, no per-match confirmation prompts, and no rating-change alerts shipped yet. (Spec lists "drift detected" / "upcoming opponent probability updated" as *intended* retention loops — **[NOT YET BUILT]**.)
- **Head-to-head view?** **Yes** — `HistoryCard` shows record (e.g. "3–2"), average margin, and a dated W/L row list. It's a **Pro** feature (network intelligence).
- **Notes/tags on matches (e.g. "playing hurt")?** Only a single free-text **`tag`** field (intended for event/league labels, e.g. "MM/DD · Name"). **No** per-match notes, condition tags, or equipment tags.

---

## 4. Roadmap

**[MOSTLY NOT IN REPO]** — there is no dated roadmap. The closest artifacts are `tasks/Improvements-todo-list` (a prioritized backlog, not a schedule) and `tasks/goal-enter-match-ux.md` (an open, iterate-until-satisfied UX goal).

- **Next 3 planned features + launch dates:** No launch dates exist. Open/near-term backlog items: (1) **Enter Match UX redesign** (active goal), (2) **self-service match dispute** (todo #7), (3) **individual player stats screen** with ".vs"/"with" modes and date/tag filtering (New Ideas 0.2), plus **club-level membership / isolated club ecosystem** (0.1/0.3). Treat as candidates, not commitments.
- **Coaching/training module?** **[NOT IN REPO]** — no plan documented.
- **Video integration / shot tracking?** **[NOT IN REPO]** — none planned in any spec. (`dataSource` enum reserves a `future_scraped` value, hinting at future non-manual ingestion, but nothing about video/shot tracking.)

---

## 5. UX & Core Flow

**Grounded in spec/code.**

- **Taps to log a match:** Target is **< 60 seconds** end-to-end. Flow: (1) Partner, (2) Opponent 1 & 2, (3) Win/Loss, (4) game scores (numeric keypad auto-advance), (5) Submit. Recent-player **chips** are the fast path; the user themselves is auto-filled as team-1-player-1. Exact tap count varies with chip hits, but the design target is "minimal taps for self + 3 known players, single game, default tag."
- **Home screen / primary action:** The **Command** screen — large rating number, 90-day Win %, Compounding Index, Drift Score, last-match summary, edit timer (if active), upcoming-match probability. Designed to need **no scrolling**. The primary action is **Enter** (the match-entry tab, recently relabeled from "Enter" to "Match" to avoid confusion with the submit action).
- **Log → Rate → See mapping:** **Log** = Enter/Match tab → **Rate** = automatic incremental recompute on submit (no user step) → **See** = Command (snapshot) + Trajectory (chart) + Matchups (predictions). Bottom-tab nav: **Command, Enter/Match, Matchups, Trajectory**.
- **Group/club aggregate view?** Only a **tag/tournament** grouping today (`getTournamentData` by tag). True **club-level membership / isolated ecosystem is a New Idea, not built** (todo 0.1/0.3).
- **Offline log + later sync?** **No.** Match entry uses local React state and there's **no offline/draft persistence** — navigating away mid-entry loses the form (todo #10, open). Submission requires a live API call.

---

## 6. Retention Mechanics

**Partly spec, partly [NOT IN REPO].**

- **Weekly open driver (intended):** "Am I improving?" — weekly trajectory insight, drift alerts, updated upcoming-opponent probability, rivalry/head-to-head tracking. These are the **designed** loops; most alerting is **not yet implemented** (see §3 notifications).
- **Streaks / badges / engagement loops?** **Deliberately none.** README and monetization spec both state **"No gamification. No streaks. No dopamine farming."** The product is positioned as an analytical instrument, not a game.
- **Push notification strategy:** **[NOT BUILT]** — no push channel exists; only transactional email. Strategy "what/when/how often" is undefined in the repo.
- **Social/competitive vs personal:** Both, gated. **Free = purely personal** (own trajectory + own predictions). **Pro = social/competitive** (network ratings, head-to-head, network matchup probabilities). **No public rankings or leaderboards** by design.

---

## 7. DUPR Comparison

**Partly spec, partly [NOT IN REPO].**

- **Data Vector sees that DUPR cannot:** Per-match **rating snapshots** → fine-grained trajectory, **Compounding Index / Momentum** (is improvement structural or oscillating?), **Drift Score**, **rating confidence & volatility bands**, **margin-of-victory** weighting, partner/opponent **diversity**, and **head-to-head** intelligence within the local network — including unclaimed **shadow** players. This is richer *time-series and matchup* data than a single DUPR number.
- **Correlation Vector vs DUPR ratings:** **[NOT IN REPO]** — no DUPR data is imported, so no correlation has been or can be computed in-app.
- **Do users maintain both?** Implicitly **yes** — the product explicitly **defers to DUPR for formal tournament ratings** (todo #4) and positions itself as a complementary *trajectory/intelligence* tool, not a DUPR replacement.
- **If DUPR adds casual tracking tomorrow:** **[NOT IN REPO — strategy question].** From positioning, Vector's defensible angle would be the analytical layer (CI, drift, volatility bands, momentum, fast <60s entry, shadow-profile network) rather than the raw rating. No documented contingency exists.

---

## 8. Competitive Moat

**[MOSTLY NOT IN REPO — strategy].**

- **Network-density threshold per city:** **[NOT IN REPO]** — no target defined.
- **Hard-to-clone elements (inferable from code):** The **local match-history graph** (shadow profiles + claim-on-join accumulates a network before users sign up), the **derived analytics** (CI, drift, volatility/confidence model, calibration tooling), and the **<60s entry UX**. Brand/algorithm are weaker moats than the accumulated relational match data.
- **Primary moat:** Positioning implies **data network effects** (the shadow-profile/claim mechanic is explicitly designed to seed density), with algorithm sophistication secondary. **Not formally documented.**

---

## 9. Growth & Distribution

**Partly monetization spec, partly [NOT IN REPO].**

- **First 100 users:** **[NOT DOCUMENTED specifically]**, but CAC channels listed: pickleball **Facebook groups, league word-of-mouth, local club ambassadors, Reddit (carefully), YouTube match-analysis creators**. Organic-first, target **CAC < $20**.
- **Cold-starting a new city:** **[NOT IN REPO]** — no documented playbook. The **shadow-profile mechanic** is the de-facto cold-start lever: one active user entering matches creates rated profiles for everyone they play, who can later claim them.
- **Invite / group code system:** A **friend-invite** exists (`InviteToken`, email invite to claim a shadow profile, 30-day expiry). **No group/club join-code** system yet (clubs are a New Idea, not built).
- **Referral motivation:** The invite frames it as "see your stats / claim your rating & win history." **No referral incentive/reward** is implemented.
- **B2B channel (clubs/facilities/leagues):** **[PLANNED, not built]** — "Club" membership tier and isolated club ecosystem are in New Ideas (todo 0.1/0.3); no B2B product exists today.
- **Court/hardware integrations:** **[NOT IN REPO]** — none planned. (`future_scraped` dataSource hints at future automated ingestion only.)

---

## 10. Geographic Strategy

**[NOT IN REPO].** No city-launch list, expansion logic, or per-city critical-mass target is documented anywhere in the repo. The only geographic signal is infrastructure: **Vercel region US-East initially** (technical-build-plan §7) and the email domain `michianapickleball.com` used for Resend — suggesting an initial **Michiana (South Bend / northern Indiana)** community footprint, but this is **not stated as strategy**.

---

## 11. Data Assets & Future Potential

**Partly code, partly [NOT IN REPO].**

- **Matches / active users so far:** **[NOT IN REPO]** — not a static fact; lives in the production DB (`Match`, `Player`, `CommunityStats`). The schema supports it but no number is in the codebase. `CommunityStats` holds `totalCount`, `avgRating`, `min/maxRating`.
- **Unique data dimensions vs DUPR:** See §7 — per-match snapshots, CI/Momentum/Drift, confidence/volatility, MOV, partner/opponent diversity, head-to-head, shadow network.
- **Could the data unlock training recs / optimal partner matching / play-style clustering / injury signals?** Foundationally **plausible** — the per-match, per-partner, per-opponent history plus diversity and volatility metrics is the right raw material. But **none of these are built or planned in the repo**; treat as future potential, not roadmap.
- **Data-licensing opportunity (coaches/facilities/leagues):** **[NOT IN REPO]** — not mentioned in the monetization model (which is Free/Pro subscription only).

---

## 12. User Profile

**[MOSTLY NOT IN REPO].** Positioning gives the persona only loosely.

- **Core user:** "**Competitive pickleball players**" wanting a "strategic trajectory instrument" — i.e. improvement-focused, analytically inclined, doubles players in an active local community. **Age/skill/frequency not quantified** anywhere in the repo.
- **What they use today:** Implicitly **DUPR** (for ratings) and manual/no tracking for trajectory. Not documented as research.
- **Biggest frustration with current solutions:** **[NOT IN REPO]** — implied gap is "DUPR gives a number but not *am I improving and how do I beat this specific opponent*," which is the stated value split (Free = improvement, Pro = beat-this-opponent).
- **Unexpected beta use cases:** **[NOT IN REPO].**

---

## 13. Retention & Engagement Metrics

**[NOT IN REPO].** No analytics, no cohort/retention tables, no event tracking in the codebase.

- Week 1 / 4 / 12 retention: **unknown — not measured in-repo.**
- Weekly vs monthly vs rare loggers: **unknown.**
- Churn commonalities: **unknown.**
- Median matches/user/week: **unknown.**

These require a product-analytics layer that does not currently exist; they cannot be answered from the code.

---

## 14. Monetization

**Grounded in spec** ([specification/monetization-model](../specification/monetization-model)).

- **Model:** **Freemium subscription.**
  - **Free:** personal trajectory, personal stats, personal predictions (own dataset).
  - **Pro: $9.99/month or $79/year** — network ratings, head-to-head network intelligence, network matchup probability.
  - Todo backlog also floats **30-day free trial of all features**, and **Club** / **Admin** tiers (New Ideas, not priced/built).
- **What justifies the price:** Value psychology — Free builds the habit ("am I improving?"), **Pro builds competitive advantage** ("how do I beat *this* opponent?"). Network intelligence is the paid hook.
- **B2B version for clubs/facilities:** **Planned, not built** (Club tier / isolated ecosystem — todo 0.1/0.3).
- **Other revenue (events/affiliates/data licensing):** **[NOT IN REPO]** — the documented model is subscription-only. Equipment affiliates, event monetization, and data licensing are **not** in the spec.
- **LTV / CAC:** Targets only — **LTV ≈ $79/yr avg, 18-month retention target; CAC < $20.** These are goals, not measured figures. Payments wiring is **Stripe** (`users.plan` updated by webhook).

---

## 15. Technology

**Grounded in code/spec.**

- **Native or cross-platform:** **Web app** — Next.js 14+ App Router, TypeScript, deployed on Vercel. Mobile-first dark UI with bottom-tab nav (PWA-style), **not** a native iOS/Android app.
- **Real-time or batch rating:** **Both.** On every match entry/edit/void an **incremental recompute** runs synchronously (replays from the affected match date forward, using stored snapshots as starting state). A **nightly full replay** (Vercel Cron, 03:00 UTC) plus admin-triggerable full recompute guarantees eventual consistency. So entry feels near-real-time; correctness is backstopped by batch.
- **Offline capability:** **No** (see §5). No offline entry/sync.
- **Pipeline (match entry → rating update):** `POST /api/matches` validates → resolves/creates players (shadow lookup) → duplicate-fingerprint check → transaction writes `Match` + `MatchParticipant`×4 + `Game`(s) → `runRecompute("admin", "auto: new match", matchDate)` does an **incremental replay**: load each affected player's pre-window rating (`RatingSnapshot`) and prior match count, replay forward through the engine, delete+rewrite affected snapshots, update `Player.rating/confidence/volatility/winPct`, upsert `CommunityStats` → anomaly check → cache revalidation. A concurrency guard waits up to 10s for any in-flight run, then defers to the nightly cron if still busy.
- **Stack specifics:** Prisma ORM, Supabase Postgres (pgBouncer pooled runtime, DIRECT_URL for migrations), Auth.js JWT sessions, Stripe, Upstash Redis (rate-limit/anomaly), Resend (email).

---

## 16. Risks

**Partly addressed in code, partly [NOT IN REPO — strategy].**

- **Perceived rating accuracy questioned:** Mitigations in place — calibration tooling (`scripts/rating-calibration.ts`), confidence/volatility surfaced to users, deterministic **full replay** so the system is auditable and reproducible, and the v2 PRD's realism fixes (dynamic K, lopsided adjustment, MOV, and per-player K — which superseded partner-K isolation). No formal "appeal accuracy" UX.
- **City never reaches critical mass:** **[NOT IN REPO]** — no density threshold or contingency documented (see §8/§10).
- **User base decides ratings are "wrong" / trust erodes:** Partial mitigation via transparency (snapshots, confidence) and **admin void/merge + immutable audit log**. **No self-service dispute** (todo #7) is the main trust gap.
- **Big player (DUPR/Apple/Google) enters:** **[NOT IN REPO — strategy].** Positioning leans on the analytical layer + local network data as differentiation; no documented contingency.
- **Data quality (wrong scores, accidental or intentional):** Mitigations — duplicate fingerprint, rate limits, anomaly flagging + admin alert, 20-min owner edit window, admin void (soft, audited), admin-only on-behalf entry. **Gap:** no mutual confirmation (deferred) and no sandbagging-specific detection.

---

## 17. Vision

**Partly spec, partly [NOT IN REPO].**

- **Vector in 3 years:** **[NOT FORMALLY DOCUMENTED].** Trajectory implied by specs: from a **personal trajectory instrument** → **network-enabled intelligence** (Pro) → **club ecosystems** (B2B). Stated strategic posture: "**Analytical, controlled, network-enabled but not reputation-exploitative, architected for scale without premature complexity.**"
- **End state — platform / data company / community / all:** Positioning points toward **all three** — a community-seeded **data network** (shadow profiles → claims) monetized as an **analytics platform**, with club ecosystems as the B2B layer. The README's "Strategic Posture" is the only explicit framing; the rest is inference.
- **Beyond pickleball to other racket sports:** **[NOT IN REPO]** — nothing about tennis/padel/etc. The doubles-ELO engine is sport-agnostic in principle, but no spec mentions expansion beyond pickleball.

---

### Summary of what's NOT answerable from the repo
Retention/engagement metrics (§13), geographic launch strategy (§10), most growth playbook specifics (§9), live data counts (§11), user demographics (§12), and competitive contingencies (§7/§8/§16/§17) are **not present** — they are pre-launch business decisions or live operational data, not code or spec artifacts. Everything in §1–§3, §5, §14, §15 is grounded in the actual implementation.
