# PRD: Vector by Vektra

**Document version:** 1.0
**Date:** 2026-02-22
**Status:** Ready for development

---

## 1. Introduction / Overview

**Vector by Vektra** is a pickleball rating and trajectory tracking web application. Players manually log the results of their doubles matches, and the system computes a dynamic ELO-style rating that reflects their skill over time.

**The core problem it solves:** Pickleball players currently have no reliable, individual-level record of their rating progression or competitive performance outside of formal tournaments. Vector gives every recreational and competitive player a private, data-driven performance record they own.

**The goal:** Deliver a production-ready MVP that handles match entry, player rating computation, and personal trajectory visualization — with authentication and data integrity baked in from day one. Stripe / Pro tier monetization ships in phase 2.

---

## 2. Goals

1. Allow any registered pickleball player to self-report doubles match results in under 60 seconds.
2. Compute each player's doubles-aware ELO rating via a nightly full-replay batch process.
3. Display a personal rating trajectory chart with win rate and point differential.
4. Support shadow profiles so unregistered players can be referenced in matches without blocking data entry.
5. Give admins the tools to void matches, merge duplicate player profiles, edit identity fields, and trigger manual rating recomputes.
6. Maintain a complete, immutable audit log of every administrative action.
7. Enforce a 60-minute edit window on submitted matches, after which they are locked.
8. Lay the architectural groundwork for a Pro tier (phase 2) without shipping it in MVP.

---

## 3. User Stories

### Registered Player (Free tier)

- **As a player,** I want to log a doubles match result immediately after playing so I can track my performance over time.
- **As a player,** I want to see my current rating and how it has changed over my last 10 games, past 7 days, or past month, so I understand whether I am improving.
- **As a player,** I want to see my win percentage and point differential alongside my rating chart so I have a full picture of my performance.
- **As a player,** I want to correct a match I entered within 60 minutes of submission if I made a mistake.
- **As a player,** I want to reference a playing partner or opponent who is not yet registered on the platform so my match data is still accurate.

### Unregistered Player (Shadow Profile)

- **As a player who hasn't signed up yet,** I want to claim a shadow profile that was created when someone logged a match I played in so my historical match data is retroactively attached to my account.

### Admin

- **As an admin,** I want to void a match that was entered incorrectly so it no longer affects anyone's rating.
- **As an admin,** I want to merge two player profiles that are duplicates of the same real person so the rating history is consolidated correctly.
- **As an admin,** I want to edit a player's display name or identity fields to correct errors.
- **As an admin,** I want to trigger a manual rating recompute outside of the nightly schedule if I have made corrections.
- **As an admin,** I want to view an immutable audit log of every admin action so I have a record of all changes.

---

## 4. Functional Requirements

### 4.1 Authentication

1. The system must allow users to register with an email address and password.
2. The system must send a verification email upon registration; unverified accounts may still log matches but are flagged as unverified.
3. The system must support two roles: `user` and `admin`.
4. Admin accounts are assigned manually; there is no self-service admin promotion.

### 4.2 Match Entry

5. The system must allow any authenticated user to enter a doubles pickleball match result.
6. A match entry must capture:
   - Match date
   - The entering player's partner (selected from player search or recent chips)
   - Two opponents (each selected from player search or recent chips)
   - Win or loss outcome (toggle)
   - Individual game scores for each game played
7. The system must allow entry of players who are not yet registered (shadow profiles) by name.
8. The system must auto-create a shadow profile for any unregistered player referenced in a match.
8a. The match entry form must include an optional "Add to event" field placed after the scores section. The field autocompletes from the player's previously used tags. The tag is stored on the match and may be edited within the 60-minute window.
9. Each match may only be entered once (single-entry truth). A submitted match is the authoritative record.
10. The system must enforce a 60-minute edit window anchored to the original submission time (`createdAt`):
    - `editExpiresAt = createdAt + 60 minutes`
    - Edits made within the window do **not** reset or extend the deadline.
    - After 60 minutes from `createdAt`, the match is locked and cannot be edited by the submitter regardless of how many edits occurred within the window.
    - The API edit endpoint must reject any edit request where `now > match.createdAt + 60 minutes`.
11. The system must display a countdown timer on the Command screen for any match still within its edit window (e.g., "Editable for 42:17"). Once expired, the UI must show "Locked" with no countdown. No warnings or alerts before expiry.
12. Locked matches may only be modified by an admin via void (not edit).

### 4.3 Shadow Profiles & Claiming

13. A shadow profile is a player record with no associated user account (`userId = null`).
14. The system must allow a registered user to claim a shadow profile that represents them, subject to these conditions:
    - The claiming user's email must be verified (`emailVerifiedAt` must be set).
    - The claiming user must not already have an associated player profile (`userId` is already claimed elsewhere).
    - No "must have been listed by another user" gate — honor-system claim is sufficient for v1.
15. Upon claiming, all matches previously attributed to the shadow profile must be automatically attached to the claiming user's player record (`userId` set, `claimed = true`, `claimedAt` set, `trustTier` set to `verified_email`).
16. A shadow profile can only be claimed by one user. Once claimed, it becomes a full player profile and cannot be claimed again.
17. Every claim action must write an immutable record to `AuditEvents` (`actionType: 'claim'`).
18. If a shadow profile being claimed has multiple near-duplicate profiles detected (admin judgement), an internal flag must be raised for admin review. No user-facing friction is added.

**Schema additions for claiming:**

| Field | Table | Type | Notes |
|---|---|---|---|
| `claimedAt` | `Players` | `DateTime?` | Set on successful claim |
| `trustTier` | `Players` | `Enum` | `unverified \| verified_email \| established` — defaults to `unverified` |

`trustTier` governs future network weighting (phase 2) but is stored and set from day one. It is not surfaced in the v1 UI.

### 4.4 Rating Engine

17. The system must compute ratings using a doubles-aware ELO algorithm:
    - Team rating = average of the two players' individual ratings
    - Expected score = standard logistic function applied to the team rating difference
    - K-factor = base K adjusted by recency weight and margin weight
18. The baseline rating for all players is 1000.
19. The system must run a full replay nightly at 03:00 UTC via a Vercel cron job hitting `/api/admin/recompute`.
20. The recompute process must:
    - Fetch all non-voided matches in chronological order (by `matchDate`, then `createdAt` as tie-breaker)
    - Reset all player ratings to 1000
    - Replay every match in order, updating ratings after each
    - Store a `RatingSnapshot` record after each match replay, linked to the match and the rating run
    - Update each player's current rating in the `Players` table
21. The recompute endpoint must be protected by a shared secret header (not publicly accessible).
22. The system must record each rating run in `RatingRuns` with start time, end time, status, trigger type (`nightly` | `admin`), and a `notes` field (max 120 chars, required for admin-triggered runs).
23. An admin must be able to manually trigger a recompute from the admin panel, subject to the following guards:
    - **Concurrency lock:** Reject if any `RatingRun` has `status = 'running'`. Response: "Recompute already running."
    - **10-minute cooldown:** Reject if the most recent admin-triggered `RatingRun` started less than 10 minutes ago. The nightly cron run does not count toward this cooldown.
    - **Reason required:** Admin must select a reason before confirming. Options: `Merge`, `Void match`, `Identity correction`, `Other`. The reason is stored in `RatingRuns.notes` and written to `AuditEvents`.
    - **Confirmation modal:** Before executing, display: "This rewrites ratings and snapshots." — requires explicit confirm.

### 4.5 Trajectory Screen

24. The system must display a rating slope chart on the Trajectory screen.
25. The chart must support three time horizons selectable via a segmented control:
    - Last 10 Games (default)
    - Last 7 Days
    - Last 1 Month
26. Under the chart, the system must display:
    - Win percentage
    - Win/loss record
    - Point differential
27. Rating data for the chart must be sourced from `RatingSnapshots` only (not live recomputation).

### 4.6 Command Screen (Dashboard)

28. The Command screen must display:
    - Current rating (large numeric)
    - Win percentage (all-time by default; scoped to active filter when one is set — label: "Win %")
    - Compounding Index (see Section 10.1 for full definition)
    - Drift Score (see Section 10.2 for full definition)
    - Last match summary
    - Edit timer (visible only when an editable match exists within the 60-minute window)
    - Upcoming Match Probability (win probability against the player's most likely next opponent, derived from personal match history — free tier, no network data required)
28a. The Command screen must display a filter chip (default: "All Matches") below the rating display. See Section 4.10.
29. The Command screen must not require scrolling to see all primary data on a standard mobile viewport.

### 4.7 Matchups Screen

30. The Matchups screen must display a player search bar. The search bar is a **Pro-only feature**; free users see it in a locked/disabled state with a quiet Pro gate label.
31. For any player looked up via search (Pro), the system must display:
    - Their current rating
    - Rating confidence score
    - Head-to-head stats between the searching user and the searched player
    - Win probability for the searching user against the searched player
    - Volatility band (rating uncertainty range)
32. Free users must see a limited default view on the Matchups screen showing their most recently played opponents' ratings and head-to-head record — auto-populated without requiring search. This does not require Pro.
33. The full player search bar (search any player by name or handle) is gated to Pro. Network search (players the user has never played) is also Pro, and is phase 2 only.
34. Free users must see a quiet, non-intrusive Pro upgrade prompt adjacent to the locked search bar. No blocking modals or aggressive upsells.

### 4.8 Admin Panel

35. The admin panel must allow admins to void any match. A voided match must be excluded from all future rating recomputes.
36. Voided matches must not be hard-deleted; they must be soft-voided (`voidedAt` timestamp set).
37. The admin panel must allow admins to merge two player profiles. The losing profile's match history must be reassigned to the winning profile, and the losing profile must be soft-deleted.
38. The admin panel must allow admins to edit a player's `displayName` and identity fields.
39. The admin panel must display an audit log of all admin actions.
40. Every admin action (void, merge, identity edit, recompute trigger) must write an immutable record to `AuditEvents`.
41. `AuditEvents` records must never be deleted or updated.
42. The admin panel must include a recompute status page showing:
    - Last run time and duration
    - Trigger type (nightly cron or admin)
    - Status (`running` | `succeeded` | `failed`)
    - Reason/notes (for admin-triggered runs)
43. The recompute status page must make it immediately clear whether a run is currently in progress, to prevent duplicate triggers.
44. The admin panel must include a tag management page. See Section 4.10.

### 4.9 Data Integrity

44. The system must never hard-delete any match, player, or user record.
45. All deletions must be implemented as soft deletes (timestamp fields: `voidedAt`, `deletedAt`).
46. The `dataSource` field on matches must be set to `manual` for all MVP entries.

---

### 4.10 Period & Event Filtering

**Overview:** Players can scope the Command screen to a specific time period or event tag. All contextual metrics (Win%, CI, Drift, match history) update to reflect only the filtered matches. The player's ELO rating is always all-time and is not affected by the filter.

**Match tagging:**

47. A match may optionally be assigned a single free-text tag (e.g., "Winter League", "Club Night", "Tournament") at entry time.
48. The tag field is optional. Matches without a tag have no tag displayed.
49. Tags are free-text strings entered by the user during match entry (Enter screen), in a dedicated optional "Add to event" field placed after the scores section.
50. Tags are autocompleted from the player's previously used tags.
51. A tag may be added or changed within the 60-minute edit window. After that, tags are locked with the match.
52. Each match holds at most one tag.

**Command screen filtering:**

53. The Command screen must display a filter chip below the rating display. Default state: "All Matches".
54. Tapping the filter chip opens a bottom sheet with two filter modes:
    - **Date Range**: user selects a from-date and to-date. Matches outside the range are excluded.
    - **Event Tag**: user selects one of their previously used tags. Only matches with that tag are included.
55. When a filter is active:
    - The filter chip shows a summary of the active filter (e.g., "Jan–Mar 2026" or "Winter League").
    - Win%, CI, and Drift are recomputed using only matches in the filtered window.
    - The match history list shows only filtered matches.
    - Rating, edit timer, upcoming probability, and community stats are unaffected.
56. The filter state is stored in URL search params (`?from=`, `?to=`, `?tag=`). Navigating back to Command restores the last filter.
57. A "Clear Filter" action in the bottom sheet resets to the default "All Matches" view.
58. If the filtered window contains fewer than 2 matches, CI and Drift display "—" (insufficient data).

**Win % label:**

59. The Win% metric on the Command screen is all-time by default (no 90-day cap). The label is simply "Win %" in all states. Filter context is communicated by the filter chip, not by modifying metric labels.

**Admin tag management:**

60. The admin panel must include a tag management page listing all unique tags with their match counts.
61. Admins must be able to rename a tag (updates all matches with the old tag) or merge two tags (equivalent to renaming the source tag to the target tag name).
62. Every tag rename/merge must write an audit event.

---

## 5. Non-Goals (Out of Scope — MVP)

- **Stripe / Pro tier billing:** No payment processing in MVP. Pro features are gated in the UI but not enforced via Stripe until phase 2. Pricing when shipped: $9.99/month or $79/year.
- **Singles match tracking:** MVP supports doubles only.
- **Network intelligence:** Viewing ratings of players the user has never played (shared-opponent graph) is phase 2.
- **Predictive win% against never-played opponents:** Phase 2.
- **Retention loop notifications:** Weekly trajectory insight digest, "Drift detected" alert, "Upcoming opponent probability updated" notification, and rivalry tracking are all phase 2.
- **Rivalry tracking:** Automatic detection and display of recurring opponent matchups is phase 2.
- **Push / email notifications:** All outbound notification types are phase 2.
- **Mobile native app:** This is a web app only (PWA-ready layout, but no native build).
- **Social features:** No follows, no public profiles, no leaderboards in MVP.
- **OAuth login (Google, etc.):** Email/password only in MVP.
- **Scraped or imported match data:** `dataSource = manual` only in MVP.
- **Opponent match confirmation:** Opponent-side verification of submitted matches is phase 2 (enables the `Cᵥ` multiplier in Rating Confidence — see Section 10.3).

---

## 6. Design Considerations

### Visual Style

- Dark-first UI. All screens default to a dark color scheme.
- Minimal chrome. No decorative elements, no gamification badges, no streaks.
- Typography-forward. Rating values displayed as large numerics.

### Navigation

- Bottom tab navigation with four tabs (and no others):
  1. **Command** — personal dashboard
  2. **Enter** — match entry flow
  3. **Matchups** — opponent lookup
  4. **Trajectory** — rating chart
- The Admin panel is accessed at a separate route (e.g., `/admin`) and is **not part of the bottom navigation**. It is only reachable by users with `role = admin`. No admin UI appears in the main player-facing shell.

### Enter Screen Flow

The match entry flow must be optimized for speed (target: under 60 seconds total):
1. Select partner — autocomplete with recent partner chips shown by default
2. Select Opponent 1 and Opponent 2 — same autocomplete pattern
3. WIN / LOSS toggle (single tap)
4. Enter game scores — numeric keypad with auto-advance between score fields
5. Submit

### Pro Gate UI Pattern

Where Pro features are surfaced to free users, use a quiet, low-pressure gate: a small label or muted UI state, never a blocking modal or aggressive upsell.

---

## 7. Technical Considerations

### Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14+ (App Router) |
| Language | TypeScript (strict mode) |
| ORM | Prisma |
| Database | Supabase Postgres |
| Auth | Auth.js (NextAuth) — email/password |
| Deployment | Vercel |
| Cron | Vercel Cron |

### Key Architecture Rules

- **Strict TypeScript throughout.** No `any` types in service layer.
- **Rating logic lives exclusively in `/lib/rating-engine`.** No rating math in API route handlers.
- **No hard deletes anywhere.** Use soft-void / soft-delete patterns only.
- **Server Components by default.** Use Client Components only where interactivity requires it.
- **Supabase connection via pgBouncer** for runtime queries; `DIRECT_URL` for Prisma migrations.
- **Recompute endpoint protected by `CRON_SECRET` header** matching an environment variable.

### Environment Variables Required

```
DATABASE_URL          # pgBouncer pooled URL
DIRECT_URL            # Direct Supabase URL for migrations
NEXTAUTH_SECRET       # Auth.js secret
NEXTAUTH_URL          # Deployment URL
CRON_SECRET           # Shared secret for /api/admin/recompute
```

### Scaling Note

Full replay rating recompute is appropriate up to ~50,000 matches. Beyond that, chunked or incremental recompute should be evaluated. Design the rating engine as a pure function so it is replaceable without changing the API surface.

### Schema Delta (PRD additions vs. original Technical Build Plan)

The original Technical Build Plan defines the base schema. The following fields are **additions required by this PRD** that are not in the original spec:

**`Match` table additions:**

| Field | Type | Required by |
|---|---|---|
| `tag` | `String?` | Event filtering (Section 4.10) |

**`Players` table additions:**

| Field | Type | Required by |
|---|---|---|
| `claimedAt` | `DateTime?` | Shadow profile claiming (req 15) |
| `trustTier` | `Enum (unverified\|verified_email\|established)` | Shadow profile claiming (req 15), phase 2 network weighting |
| `ratingVolatility` | `Float?` | Volatility band computation (Section 10.4) — store σΔ during nightly run to avoid on-demand aggregation |

**`RatingSnapshots` table additions:**

| Field | Type | Required by |
|---|---|---|
| `effectiveK` | `Float` | Compounding Index computation (Section 10.1) |
| `expectedScore` | `Float` | Compounding Index (10.1) and Drift Score (10.2) computation |

**`RatingRuns` table additions:**

| Field | Type | Required by |
|---|---|---|
| `notes` | `String? (max 120)` | Admin recompute reason (req 22–23) |

**`Auth` scope correction:** The original Technical Build Plan states email verification is required for Pro tier only. This PRD additionally requires email verification to claim a shadow profile (req 14). The `emailVerifiedAt` field on `Users` is unchanged; only the enforcement scope is expanded.

---

## 8. Success Metrics

### MVP Launch (Phase 1)

- A player can register, enter a doubles match, and see their updated rating chart — all within 5 minutes of signing up.
- Match entry flow completes in under 60 seconds (measured from tab open to submission confirmation).
- Nightly recompute completes without error and updates all active player ratings.
- Zero hard deletes reach the database; all void/delete operations use soft patterns.
- Admin can void a match, trigger a recompute, and verify the voided match is excluded from ratings.

### Phase 2 Readiness Indicators

- Shadow profile claim flow works end-to-end (claim → retroactive match attachment → rating reflects full history).
- Pro gate UI is present and surfaced correctly, ready for Stripe integration.
- `dataSource` field on matches is populated correctly, ready for future scraped data ingestion.

---

## 9. Open Questions

1. ~~**Compounding Index definition**~~ — **RESOLVED.** See Section 10.1.
2. ~~**Drift Score definition**~~ — **RESOLVED.** See Section 10.2.
3. ~~**Rating confidence**~~ — **RESOLVED.** See Section 10.3.
4. ~~**Volatility band**~~ — **RESOLVED.** See Section 10.4.
5. ~~**Claim verification**~~ — **RESOLVED.** Honor-system with soft verification hooks. See updated requirements 14–16 and schema notes in Section 4.3.
6. ~~**Edit window behavior**~~ — **RESOLVED.** Timer is anchored to `createdAt`. Edits do not extend the deadline. See updated requirements 10–12.
7. ~~**Admin recompute frequency limit**~~ — **RESOLVED.** Footgun-prevention policy: no parallel runs, 10-minute cooldown, reason required. See updated requirements 23 and 42–45.

---

## 10. Metric Definitions

### 10.1 Compounding Index (CI)

**What it answers:** "Are gains building on themselves — or merely oscillating?"

CI is a normalized, volatility-adjusted rolling rating acceleration metric. It is a second-order signal: not direction (slope), not surface performance (win %), not stability (drift), but whether momentum is structurally reinforcing.

**What it is NOT:**
- Raw rating change over N games
- The same as trajectory slope
- A rolling K-factor sum
- A win streak proxy

**Computed over the selected horizon (default: last 10 games).**

Let:
- `Rᵢ` = player rating after match i
- `Δᵢ = Rᵢ − Rᵢ₋₁` = rating change from match i
- `Kᵢ` = effective K-factor used in match i
- `Eᵢ` = expected score (model expectation) for match i
- `Actualᵢ` = actual score outcome (1 = win, 0 = loss)

**Step 1 — Normalize rating deltas by volatility:**

```
Nᵢ = Δᵢ / Kᵢ
```

Removes inflation from high-K volatile matches.

**Step 2 — Performance surplus (expectation surprise):**

```
Sᵢ = Actualᵢ − Eᵢ
```

- Beating a strong opponent → positive surplus
- Losing as expected → near zero
- Losing to a weak opponent → strongly negative

**Step 3 — Momentum reinforcement term:**

```
M = (1/n) × Σ (Nᵢ × Sᵢ)
```

Rewards consistent positive normalized deltas against stronger-than-expected opponents.

**Step 4 — Acceleration component:**

```
A = slope of Nᵢ series
```

Measures whether normalized gains are increasing over the horizon.

**Final formula:**

```
CI = 100 × (0.7 × M + 0.3 × A)
```

Scaled to an approximate −100 to +100 band.

**Interpretation:**

| CI Range | Meaning |
|---|---|
| +25 to +50 | Strong structural compounding — gains exceed model expectation and are accelerating |
| +5 to +25 | Healthy compounding — positive but not explosive |
| −5 to +5 | Flat momentum — oscillation or plateau |
| −25 to −5 | Erosion — results not reinforcing |
| < −25 | Structural decay — underperforming model expectations |

**Implementation note:** CI is derived entirely from data already produced by the rating engine (`Δᵢ`, `Kᵢ`, `Eᵢ` from `RatingSnapshots`). No parallel computation system required. The rating engine must persist `Kᵢ` and `Eᵢ` per snapshot for this metric to be computable without re-running matches.

---

### 10.2 Drift Score

**What it answers:** "Are your actual results diverging from what your rating model predicts?"

Drift is an expectation error metric — not a dispersion metric. It does not measure rating variance or volatility. It measures structural misalignment between the model's predictions and real outcomes.

**What it is NOT:**
- Standard deviation of ratings (that measures variance, not misalignment)
- A volatility signal
- Related to rating slope or win %

**Computed over the selected horizon (default: last 10 games).**

Let:
- `Eᵢ` = expected win probability from the ELO model for match i
- `Aᵢ` = actual result (1 = win, 0 = loss)

**Step 1 — Raw prediction error per match:**

```
PEᵢ = Aᵢ − Eᵢ
```

Example: Expected = 0.75, Actual = 0 (loss) → PE = −0.75 (significant negative drift)

**Step 2 — Aggregate over window:**

```
DriftRaw = (1/n) × Σ PEᵢ
```

Average prediction error across all matches in the horizon.

**Step 3 — Scale:**

```
DriftScore = 100 × DriftRaw
```

Range in practice: approximately −30 to +30 (theoretical bounds −100 to +100).

**Note:** Do NOT divide by Kᵢ. K adjusts rating delta; it does not affect prediction correctness. Drift measures expectation deviation, not rating movement.

**Interpretation:**

| DS Range | Meaning |
|---|---|
| Near 0 | Model aligned — results match expectations |
| Positive | Outperforming rating — model lagging upward |
| Negative | Underperforming rating — decline likely |

**Example (5 matches):**

| Match | Expected (Eᵢ) | Actual (Aᵢ) | PEᵢ |
|---|---|---|---|
| 1 | 0.70 | 0 | −0.70 |
| 2 | 0.65 | 1 | +0.35 |
| 3 | 0.60 | 0 | −0.60 |
| 4 | 0.55 | 0 | −0.55 |
| 5 | 0.50 | 1 | +0.50 |

DriftRaw = −0.20 → **DriftScore = −20**

Interpretation: Materially underperforming relative to current rating.

**Relationship to other metrics:**

| Metric | Answers |
|---|---|
| Trajectory slope | Which direction is rating moving? |
| Win % | What is the surface outcome rate? |
| Compounding Index | Is momentum structurally reinforcing? |
| Drift Score | Are results aligned with the model's expectations? |

**Implementation note:** Drift requires only `Eᵢ` and `Aᵢ` per match. `Eᵢ` must be persisted in `RatingSnapshots` (shared requirement with CI). `Aᵢ` is derivable from match outcome. No additional schema beyond what CI already requires.

---

### 10.3 Rating Confidence

**What it answers:** "How much should we trust this player's current rating?"

`ratingConfidence` is stored as a `Float` in the range `[0.00, 1.00]` on the `Players` table. It is recomputed after each nightly rating replay using only data already in the database.

**UI tier mapping:**

| Value | Display label |
|---|---|
| < 0.40 | Low |
| 0.40 – 0.70 | Medium |
| > 0.70 | High |

**Formula — product of four independent components:**

```
ratingConfidence = clamp(Cₙ × Cᵣ × Cᵈ × Cₛ, 0, 1)
```

Each component is in [0, 1].

---

**Cₙ — Sample size confidence**

Exponential saturation curve: confidence rises quickly early, then tapers.

Let `n` = number of non-voided matches played.

```
Cₙ = 1 − e^(−n/20)
```

| n | Cₙ |
|---|---|
| 5 | 0.22 |
| 10 | 0.39 |
| 20 | 0.63 |
| 40 | 0.86 |
| 60 | 0.95 |

---

**Cᵣ — Recency confidence**

Let `d` = days since last match.

```
Cᵣ = e^(−d/45)
```

| d | Cᵣ |
|---|---|
| 0 days | 1.00 |
| 14 days | 0.73 |
| 30 days | 0.51 |
| 60 days | 0.26 |
| 90 days | 0.14 |

Dormant players cannot hold high confidence ratings.

---

**Cᵈ — Diversity confidence**

Computed over the last 20 matches (or all if fewer).

Let:
- `u` = unique opponent players faced
- `p` = unique partners played with

```
Cᵈ = min(1, 0.5 × (u/20) + 0.5 × (p/5))
```

Full opponent credit at ~20 distinct opponents. Full partner credit at ~5 distinct partners. Discourages rating inflation through a fixed farming partnership.

---

**Cₛ — Stability confidence**

Measures rating jitter. High volatility ratings cannot claim high certainty.

Let `σΔ` = standard deviation of rating deltas (`Δᵢ`) over the last 20 matches.

```
Cₛ = 1 / (1 + σΔ/20)
```

| σΔ | Cₛ |
|---|---|
| 10 | 0.67 |
| 20 | 0.50 |
| 40 | 0.33 |

---

**Implementation — nightly batch (runs after rating replay completes):**

```typescript
function computeRatingConfidence(playerId: string): number {
  const matches = lastMatches(playerId, 60);       // last 60 non-void matches
  const n = countNonVoided(matches);
  const daysSinceLast = daysBetween(now, maxDate(matches));

  const last20 = matches.slice(0, 20);
  const uniqueOpponents = countUniqueOpponentPlayers(last20);
  const uniquePartners  = countUniquePartners(last20);

  const deltas = ratingDeltasFromSnapshots(playerId, last20);
  const sigma  = stddev(deltas);

  const Cn = 1 - Math.exp(-n / 20);
  const Cr = Math.exp(-daysSinceLast / 45);
  const Cd = Math.min(1, 0.5 * (uniqueOpponents / 20) + 0.5 * (uniquePartners / 5));
  const Cs = 1 / (1 + sigma / 20);

  return clamp(Cn * Cr * Cd * Cs, 0, 1);
}
```

**Schema requirement:** No new columns needed. All inputs (`n`, `d`, `u`, `p`, rating deltas) are derivable from existing `Matches`, `MatchParticipants`, and `RatingSnapshots` tables.

**v2 extension hook (phase 2 — when opponent confirmation is added):**

Add a fifth multiplier `Cᵥ` without breaking v1:

```
Cᵥ = 0.7 + 0.3 × (% of matches confirmed by opponent)
ratingConfidence = clamp(Cₙ × Cᵣ × Cᵈ × Cₛ × Cᵥ, 0, 1)
```

Unconfirmed accounts receive a floor of 0.7× on this component.

---

Based on the PRD and what the nightly recompute actually touches (ratings reset → full replay → new RatingSnapshots → update Players), here's what changes for users:

Command screen (/command)

Display element	                    Changes after batch?	        Source
Rating (large number)	            ✅ Yes	                        Players.rating — rewritten each run
Rating progress bar + context text	✅ Yes	                        All players' ratings (community avg/min/max shift)
CI	                                ✅ Yes	                        RatingSnapshots.effectiveK + expectedScore
Drift Score	                        ✅ Yes	                        RatingSnapshots.expectedScore
Upcoming match win probability	    ✅ Yes	                        Derived from current ratings
Win % (90d)	                        ❌ No	                        Match outcome data only
Recent Matches list	                ❌ No	                        Match records don't change
Edit timer	                        ❌ No	                        Based on Match.createdAt


Trajectory screen (/trajectory)

Display element	                    Changes?	                    Source
Rating chart	                    ✅ Yes	                        RatingSnapshots — fully regenerated
Win %, W/L record, point diff	    ❌ No	                        Match outcome data only


Matchups screen (/matchups)

Display element	                            Changes?	            Source
Opponent ratings	                        ✅ Yes	                Players.rating
Rating confidence label (Low/Medium/High)	✅ Yes	                Players.ratingConfidence
Win probability	                            ✅ Yes	                Derived from ratings
Volatility band (±%)	                    ✅ Yes	                Players.ratingConfidence + ratingVolatility

Summary: Everything derived from Players.rating, Players.ratingConfidence, Players.ratingVolatility, or RatingSnapshots changes after the batch. Everything derived purely from match outcome records (win %, score data) does not.

---

### 10.4 Volatility Band

**What it answers:** "How much could this win probability forecast realistically swing?"

The volatility band is a **forward-looking uncertainty interval** around a predicted win probability. It is not the K-factor and not standard deviation of past ratings.

**Display format:** `P ± W`

Example: Win Probability: **63% ± 7%**

---

**Inputs:**

Let:
- `Rₐ` = Team A average rating (average of the two players' ratings)
- `R_b` = Team B average rating
- `ΔR = Rₐ − R_b`
- `P = 1 / (1 + 10^(−ΔR/400))` — standard ELO logistic win probability
- `Cₐ`, `C_b` = `ratingConfidence` (0–1) for each team (average of players on that team)
- `σₐ`, `σ_b` = standard deviation of rating deltas over the last 20 matches for each team (average of players)

---

**Step 1 — Rating uncertainty term:**

```
Uₐ = 1 − Cₐ
U_b = 1 − C_b
U  = (Uₐ + U_b) / 2
```

Higher confidence → lower uncertainty.

**Step 2 — Volatility component:**

```
V   = (σₐ + σ_b) / 2
Vₙ  = V / 40
```

`40` is the high-jitter normalization threshold (tunable post-launch).

**Step 3 — Band width:**

```
W = 0.08 × (0.5 + U + Vₙ)
W = clamp(W, 0.03, 0.20)
```

**Final display:**

```
Volatility Band = P ± W
```

---

**Worked example:**

| Input | Value |
|---|---|
| P (win probability) | 0.63 |
| U (combined uncertainty) | 0.25 |
| Vₙ (normalized volatility) | 0.15 |
| W = 0.08 × (0.5 + 0.25 + 0.15) | **0.072** |

Display: **63% ± 7%**

---

**Interpretation:**

| Band width | Meaning |
|---|---|
| ±3–5% | High confidence — stable ratings, large sample, low jitter |
| ±6–12% | Medium — mixed confidence or moderate volatility |
| ±13–20% | Low confidence — new player, shadow profile, or high rating instability |

---

**Why not just use confidence alone?**

Confidence captures sample maturity and recency. It does not capture recent instability. A player with 40 matches who has been wildly volatile lately has high `Cₙ` but meaningless prediction precision. `Vₙ` corrects for this.

**Why not just use the rating gap?**

A large rating gap raises `P` but does not reduce uncertainty. A new player with 5 matches and a 400-point gap still carries high volatility. The band reflects this correctly.

---

**Implementation note:** All inputs (`ratingConfidence`, rating delta σ) are computed during the nightly batch. The volatility band itself is computed at query time from stored values — no additional batch step required. `σₐ` and `σ_b` can be stored on the `Players` table as `ratingVolatility` (a `Float`) during the nightly run, or derived from `RatingSnapshots` on demand.

**v2 extension (optional — Bayesian posterior):**

Model ratings as Gaussian `R ~ N(μ, σ²)` and propagate variance through the logistic transform for a statistically rigorous interval. Appropriate if the platform grows to network-scale match volumes. Not necessary for v1.
