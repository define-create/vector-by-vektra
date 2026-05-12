# PRD: New User Demo Preview

## 1. Introduction / Overview

When a brand-new user registers and opens Vector by Vektra for the first time, the home (Command) screen is mostly empty: no rating, no key drivers, no recent matches, no trajectory. This makes it hard for newcomers to understand *what the app actually offers* and *what each section will eventually show them*. The empty state offers no motivation to keep going.

This feature replaces the empty home screen for new users with a **realistic, populated demo dashboard** — same fixed dataset for every new user, with the user's own display name woven in as the "you" participant — accompanied by a clearly worded sticky banner explaining the data is illustrative. The preview disappears automatically once the user has played 5 real matches. **There is no manual dismiss action — the only way out of the preview is to play matches.** The same preview treatment is extended to the trajectory tab so the new-user experience feels alive on both personal-stats screens.

Critically, **no demo data is ever written to the database**. Demo values are rendered entirely from a pure builder function. The ELO engine, rating snapshots, Compounding Index, Drift Score, win-rate calculations, and every database query remain completely untouched. This avoids invasive schema changes and eliminates any "remove demo data later" cleanup step.

**Goal:** make the app feel alive for new users on day one, illustrating what each metric and section will eventually look like, without polluting any real data.

## 2. Goals

1. Eliminate the "blank/empty screen" first impression for newly-registered users on all personal-stats screens.
2. Give new users a concrete, visual preview of what each home-screen section (rating, drivers, recent matches, trajectory) will look like once they have played matches.
3. Keep the ELO/rating pipeline, snapshots, and metric computations completely free of any synthetic data — no database writes, no schema fields anywhere.
4. Ensure the preview transitions smoothly to real data, automatically, once the user has entered 5 real matches.
5. Make the preview clearly identifiable as illustrative — no user should mistake demo values for real personal stats.

## 3. User Stories

- **As a brand-new registered user**, I want to see what the home screen will look like once I've played some matches, so I understand what data the app will track for me and feel motivated to enter my first match.
- **As a new user who only opens the app a few times before playing**, I want the example dashboard to disappear automatically after I've entered a handful of real matches, so I'm not left wondering whether what I'm seeing is real.
- **As an existing user (5+ real matches)**, I want the home screen to continue working exactly as it does today, with no banner, no example data, and no behavioral changes.
- **As a new user visiting the trajectory tab**, I want the same illustrative treatment so the whole app feels alive, not just one tab.

## 4. Functional Requirements

### 4.1 Eligibility

1. The system must consider a user **eligible to see the demo preview** if and only if both of the following are true:
   - The user is authenticated and has an associated `Player` record (not soft-deleted).
   - The user's real match count is less than `DEMO_PREVIEW_MATCH_THRESHOLD` (default value: **5**).
2. "Real match count" must be computed as the number of `MatchParticipant` rows belonging to the user's player where the joined `Match.voidedAt` is `null`.
3. The preview must never be shown to a user who has reached or exceeded the threshold.
4. There is no manual dismissal — eligibility is purely a function of match count. No `previewDismissedAt` field, no user-controlled state.

### 4.2 Demo Data Content

5. The system must provide a **`buildDemoCommandData(displayName: string): CommandData` builder function** in place of a plain constant, typed against the existing `CommandData` interface (`lib/services/command.ts`). All structural values (ratings, scores, dates, tags, partner/opponent names, drivers, etc.) must be hardcoded and identical for every eligible user — no per-user variation in those values, no randomness. The single piece of runtime variability is the user's own display name, used as described in requirement 7 below.
6. The demo dataset must depict a **realistic mixed trajectory**:
   - Some wins, some losses (roughly mixed, not a clean winning streak).
   - A mild upward trend in rating over time (slight positive bias, but not unrealistic).
   - A credible starting/current rating in the ~1000–1100 range.
   - At least 6 recent matches with believable partner/opponent display names, scores, dates, and tags.
   - Sensible Compounding Index, Drift Score, and Upcoming Probability values that read as plausible.
   - A rating-history array of 8–10 points so the trajectory graph renders meaningfully.
   - Sensible community-stats values (avg, min, max).
7. **Personalization of the "you" participant.** In every demo match, the participant representing the logged-in user must use that user's own `Player.displayName` (passed into `buildDemoCommandData`). Partner and opponent names must be fixed fictional names, identical across all users. Rationale: the demo is meant to illustrate *the user's* future dashboard, not an abstract third party's. Display name is the only runtime input; the function must remain a pure transform with no DB access.
8. The demo data must exist only in memory. The system must never insert demo `Match`, `MatchParticipant`, `Game`, or `RatingSnapshot` rows for preview purposes.

### 4.3 Banner

9. When an eligible user opens the home screen (or the trajectory tab — see 4.6), the system must display a **full-width banner** at the top of the screen, above all section cards. The banner copy must be:

   > *"This is what your dashboard will look like after a few matches. Start playing to make it yours."*

10. **The banner has no dismiss action.** It is purely informational and disappears only when the user crosses the match threshold (PRD §4.5).
11. **The banner must be sticky** — it must remain visible at the top of the viewport while the user scrolls. Rationale: the banner is the *only* preview cue (per requirement 12); if the user scrolls past it, populated cards could be captured in a screenshot or mistaken for real personal stats. Sticky behavior eliminates that ambiguity. Implementation: standard `position: sticky` (or Tailwind `sticky top-0` with appropriate `z-index`) — no JS scroll listener needed.
12. The section cards underneath the banner must render with their normal visual styling — no dimming, desaturation, blur, or per-card "preview" badges. The banner alone is the preview cue.

### 4.4 Section Rendering Under Preview

13. When an eligible user views the home screen, **three of the four** section components — `RatingCard`, `DriversGrid`, `MatchHistorySection` — must render values from the demo dataset (built via `buildDemoCommandData(displayName)`) instead of from the live database-backed `CommandData`.
14. **`EditTimerLink` must be hidden entirely while the preview is active.** It must not render at all — no placeholder, no demo timer, no disabled state. Rationale: the timer is an *interaction affordance* tied to editing the user's most recent real match, not a metric; there is no real match to edit during preview, so substituting demo data would offer a control that goes nowhere. As soon as the user crosses the 5-match threshold and graduates from preview, `EditTimerLink` must reappear and behave normally for any edit-eligible real match.
15. The substitution must happen at the UI layer, not inside `lib/services/command.ts`. The service function `getCommandData` must remain unchanged in behavior. (Rationale: `getCommandData` is also called from `/api/command` for client-side callers, and we want preview substitution to be a presentation concern only.)
16. The three preview-eligible section components must continue to accept their existing data shape and must work unchanged when given real data (i.e., the demo path is purely additive).

### 4.5 Graduation

17. The preview disappears automatically — with no banner, no real-data substitution, and no further synthetic data — once the user crosses the match threshold (5 non-voided matches).
18. **Cache invalidation on graduation.** When a user enters the match that takes their real match count from 4 → 5, the cached `CommandData` for that user must be invalidated so the home screen renders new real data on the next visit rather than a stale empty/sparse snapshot. This is implemented across all match-write paths via `revalidateTag("command-data:${userId}")` (creation) or `revalidateTag("command-data")` (admin edit/void).

### 4.6 Scope of Preview Across Screens

19. The preview behavior (banner + demo data substitution) must apply on **exactly two screens**:
    - The **home/command screen** (`app/(tabs)/command/page.tsx`) — primary target.
    - The **trajectory tab** (`app/(tabs)/trajectory/page.tsx`) — shows the user's personal rating trajectory chart, which is empty/flat for new users.
20. The preview must **NOT** apply to any other screen, including: the profile tab (it is a settings page, not a stats screen), the stats tab, the matchups tab, the enter (match-entry) tab, admin pages, leaderboards, or auth pages.
21. The banner copy is **identical on both screens** (see requirement 9) — no per-screen customization.

### 4.7 Schema Changes

22. **No schema changes are required.** Eligibility is computed entirely from the existing `MatchParticipant`/`Match` relation. No new fields on `Player` or any other model.

### 4.8 Compatibility & Non-Regression

23. Users who already have 5 or more real matches must see a home screen and trajectory tab that are byte-identical to the pre-feature behavior — no banner, no extra database queries that affect performance noticeably, no visual diff.
24. Existing users who have 0–4 real matches at the time this feature ships **will** start seeing the preview. This is acceptable and intentional.
25. The preview feature must not affect any other user (an existing user with many matches must not see anyone else's preview state).

## 5. Non-Goals (Out of Scope)

1. **No demo matches stored in the database.** No `Match`, `MatchParticipant`, `RatingSnapshot`, or `Game` rows are ever created for preview purposes.
2. **No schema changes at all.** No new fields, no new tables, no new enums.
3. **No manual dismiss.** No "Got it" / "Hide preview" / "Dismiss" button anywhere. The only way out of the preview is to play 5 matches.
4. **No per-user variation in demo data — except for the user's own display name.** Every eligible user sees the same hardcoded ratings, scores, dates, tags, and fictional partner/opponent names. The only runtime input to `buildDemoCommandData` is the logged-in user's own `displayName`, used in match participants where it would otherwise be the user (see requirement 7).
5. **No partial / per-section unlock progression.** Either the preview is active (three sections show demo data, `EditTimerLink` is hidden) or it isn't (all four sections show real data) — no "Rating Card unlocks at match 1, Drivers at match 5" gradual transition.
6. **No annotations or per-card "Preview" labels.** A single top-of-screen banner is the only preview cue.
7. **No client-side analytics or telemetry events** added specifically for this feature (see Success Metrics, section 8).
8. **No changes to the ELO engine, rating snapshots, Compounding Index, Drift Score, win-rate, or any other metric computation.**
9. **No changes to `getCommandData` or the `/api/command` route's behavior.** Preview substitution is a UI-layer concern only.
10. **No preview on matchup screens, admin pages, leaderboards, or match-entry forms.**

## 6. Design Considerations

- **Banner placement:** Full-width, sticky at the top of the screen (above the first section card on both the home screen and the trajectory tab).
- **Banner styling — locked:** Use a bright translucent amber accent — `bg-amber-500/10` with `border border-amber-500/30` — matching the mockup at `mockups/new-user-demo-preview.html`. Title text `text-amber-100`, body text `text-amber-200/70`, small leading icon (e.g., `✦`) in `text-amber-400`. This is brighter than the existing admin-page amber notice (`bg-amber-900/10`) intentionally — the preview banner is for end users on a primary screen, not an admin caution, so it leans informational/welcoming rather than warning.
- **No dismiss control.** The banner is purely informational; it has no button, link, or close affordance.
- **Section cards under preview:** Render exactly as they would for a user with real data. No dimming, no badges, no overlays. The banner is the only signal.
- **Mobile responsiveness:** Banner must wrap/stack gracefully on small screens. Sticky behavior (requirement 11) must work on iOS Safari and Android Chrome.

## 7. Technical Considerations

### 7.1 New Files

- **`lib/services/preview-mode.ts`**
  Exports:
  - `export const DEMO_PREVIEW_MATCH_THRESHOLD = 5;`
  - `export async function shouldShowPreview(userId: string): Promise<boolean>;` — returns `true` only when the user's player exists (and is not soft-deleted) AND the real match count is `< DEMO_PREVIEW_MATCH_THRESHOLD`. Single combined query: `prisma.player.findFirst({ where: { userId, deletedAt: null }, select: { _count: { select: { matchParticipants: { where: { match: { voidedAt: null } } } } } } })`.

- **`lib/services/demo-command-data.ts`**
  Exports `export function buildDemoCommandData(displayName: string): CommandData`, typed against the existing `CommandData` interface from `lib/services/command.ts:37`. Pure function — no DB access, no random values. Dates are computed as relative offsets from a single `now = new Date()` captured at call time. The user's `displayName` is the *only* runtime input and must appear wherever the demo represents the "you" participant in matches. Any future field added to `CommandData` will force this function's return value to be updated (TypeScript will fail to compile otherwise) — that's intentional and desirable.

- **`components/PreviewBanner.tsx`**
  Pure server component (no `"use client"`, no state, no handlers). Renders the **sticky** full-width banner (requirement 11) with the copy from requirement 9. Reused by both the home screen and trajectory tab.

### 7.2 Modified Files

- **`app/(tabs)/command/page.tsx`** — after the existing `playerExists` check, compute `const showPreview = await shouldShowPreview(userId)`. If `true`:
  - Render `<PreviewBanner />` (sticky) above the existing `<Suspense>`-wrapped section components.
  - Build the demo dataset once: `const demoData = buildDemoCommandData(playerExists.displayName)`.
  - Pass `previewOverride={demoData}` to `<RatingCard>`, `<DriversGrid>`, and `<MatchHistorySection>`.
  - **Do not render `<EditTimerLink>` at all** while `showPreview` is `true` (requirement 14).
- **`app/(tabs)/command/RatingCard.tsx`**, **`DriversGrid.tsx`**, **`MatchHistorySection.tsx`** — add an optional prop `previewOverride?: CommandData`. When present, use it directly instead of calling `getCommandData(userId, filter)`. This is the only behavioral change to these files.
- **`app/(tabs)/command/EditTimerLink.tsx`** — no change to the component itself; it is simply not rendered while the preview is active. After graduation it renders normally as before.
- **`app/(tabs)/trajectory/page.tsx`** — convert to async server component. After auth check, fetch the user's player displayName and call `shouldShowPreview(userId)`. When `showPreview` is `true`, render `<PreviewBanner />` above `<TrajectorySection />` and pass a `previewOverride` derived from `buildDemoCommandData(displayName)` (map `ratingHistory` → `ratingSeries`, compute `record` and `winRate` from `recentMatchHistory`).
- **`components/trajectory/TrajectorySection.tsx`** — add an optional `previewOverride?: TrajectoryData` prop; when present, bypass the fetch effect and render directly. The displayed `data` is `previewOverride ?? fetched` — pure derivation, no `setState` inside effects.
- **Match write paths** — `app/api/matches/route.ts:371` (creation) already calls `revalidateTag(\`command-data:${player.userId}\`)`. The match-edit, admin-edit, and admin-void paths (`app/api/matches/[id]/route.ts`, `app/api/admin/matches/[id]/edit/route.ts`, `app/api/admin/matches/[id]/void/route.ts`) previously called `revalidateTag("command")` — a pre-existing tag mismatch. Fix to `revalidateTag("command-data")` to actually invalidate the home-screen cache on these paths.

### 7.3 Reused Existing Code

- `CommandData` interface — `lib/services/command.ts:37`.
- Auth/session pattern (`getServerSession(authOptions)`) — used by existing API routes under `app/api/`.
- `Suspense` + skeleton pattern in `app/(tabs)/command/page.tsx` — leave intact; preview-mode rendering happens *outside* the skeleton paths since data is synchronous.

### 7.4 Performance Notes

- `shouldShowPreview` adds one extra DB round-trip per home-screen and trajectory-page render. A single Player `findFirst` with a relation `_count` is sufficient — no separate match-count query. For users above the threshold, the count comparison short-circuits cheaply. No further optimization is required given the simplified eligibility check.
- Cache invalidation is wired across all match write paths (see §7.2).

### 7.5 Edge Cases

- **User registers but has not yet claimed a player** — `shouldShowPreview` returns `false` (no player). The home screen flow already redirects to `/setup` in this case.
- **User's player is soft-deleted** (`deletedAt` is non-null) — existing redirect logic in `command/page.tsx:38-42` already filters by `deletedAt: null`. `shouldShowPreview` uses the same filter.
- **A match the user played in is later voided** — the user's real match count drops. If this brings them back below the threshold, the preview will reappear on the next render. This is consistent with the count-based rule; no special handling.
- **Existing user with 0–4 matches at ship time** — they will see the preview on their next visit. Intentional.
- **User changes their display name while preview is active** — the demo dataset is rebuilt on each render via `buildDemoCommandData(displayName)`, so the new name propagates immediately. No special handling required.

## 8. Success Metrics

Success will be evaluated **qualitatively via user feedback**. No quantitative analytics events, dashboards, or conversion-tracking metrics are required as part of this feature.

The implementing developer should not add any tracking/telemetry code. Feedback channels (in-app or external) are out of scope for this PRD.

## 9. Verification Checklist

Before considering the feature shipped, the implementing developer must perform the following manual verifications. The mockup at `mockups/new-user-demo-preview.html` shows the expected visual states for reference.

1. **New user — preview active:** Register a fresh account, claim or create a player, navigate to the home screen. Confirm: sticky banner is visible (no dismiss button), three sections show populated demo data, the **logged-in user's own display name** appears in each demo match, `EditTimerLink` is **not rendered**, and no errors in server logs.
2. **Graduation path:** With a test account still in preview, enter five real matches. After the fifth, reload the home screen. Confirm banner is gone automatically, real data is shown (not stale empty data — this validates requirement 18's cache invalidation), and `EditTimerLink` reappears for the most recent match.
3. **Sticky banner on mobile (screenshot/share check):** Open the home screen at a mobile viewport (e.g., 375×667 in DevTools), scroll down through the populated demo cards, and confirm the banner remains visible at the top throughout. Take a screenshot of any scroll position and confirm the banner is present in the screenshot — this is the protection against users sharing demo data as if it were real.
4. **Pipeline isolation:** With preview active, query the DB directly and confirm there are **no** `Match`, `MatchParticipant`, `Game`, or `RatingSnapshot` rows for the user. Demo data must exist only in memory.
5. **No regression for existing users:** Sign in as a player with 5+ real matches and confirm the home screen is visually identical to pre-feature behavior — no banner, no extra renders, no `EditTimerLink` change.
6. **Display-name personalization:** Change the test user's display name in settings (or admin UI) while preview is still active. Reload the home screen and confirm the new name appears in the demo matches.
7. **Trajectory tab:** With preview active, navigate to the trajectory tab. Confirm the same sticky banner appears and the chart renders the demo trajectory rather than an empty/flat line.
8. **Profile / Stats / Matchups tabs unchanged:** Confirm none of these tabs show the banner or any demo data, even while preview is active on the home tab.

## 10. Demo Dataset (Concrete Values)

`buildDemoCommandData(displayName)` must return a `CommandData` object containing exactly the values below. The implementer should copy these verbatim into a single TypeScript module. `${displayName}` is the only interpolation point.

### 10.1 Top-level fields

| Field | Value |
|---|---|
| `hasPlayer` | `true` |
| `emailVerified` | `true` |
| `userDisplayName` | `displayName` |
| `myPlayerId` | `"demo-player-id"` |
| `myPlayerDisplayName` | `displayName` |
| `rating` | `1083` |
| `winPct` | `0.60` |
| `compoundingIndex` | `+12` |
| `driftScore` | `-8` |
| `upcomingProbability` | `0.58` |
| `dominantDriver` | `"winRate"` |

### 10.2 `communityStats`

| Field | Value |
|---|---|
| `avg` | `1000` |
| `min` | `880` |
| `max` | `1240` |

### 10.3 `ratingHistory` (10 points, oldest → newest)

| # | Date (relative offset from today) | Rating | Outcome |
|---|---|---|---|
| 1 | -28d | 1010 | loss |
| 2 | -25d | 1024 | win |
| 3 | -22d | 1018 | loss |
| 4 | -18d | 1035 | win |
| 5 | -15d | 1052 | win |
| 6 | -12d | 1044 | loss |
| 7 | -9d | 1058 | win |
| 8 | -6d | 1072 | win |
| 9 | -3d | 1066 | loss |
| 10 | -1d | 1083 | win |

Dates must be computed as hardcoded relative offsets from a fixed reference inside the function (e.g., `new Date()` at module load time would drift; instead use a single `now = new Date()` captured at function call time and subtract the day offsets). This keeps the dataset "fresh-looking" without random variation across users on the same day.

### 10.4 `recentMatchHistory` (6 matches, newest first)

Partner and opponent names use **single-letter placeholders** to make it visually unambiguous that these are not real players. The user's own `displayName` is implicit (they are the "you" — not listed in this array since the type omits the self-participant).

| # | matchDate offset | outcome | partnerName | opponentNames | score | tag | ratingDelta |
|---|---|---|---|---|---|---|---|
| 1 | -1d | `"win"` | `"Player A"` | `["Player B", "Player C"]` | `"11–7"` | `"Demo League"` | `+15` |
| 2 | -3d | `"loss"` | `"Player A"` | `["Player D", "Player E"]` | `"8–11"` | `"Demo League"` | `-9` |
| 3 | -6d | `"win"` | `"Player F"` | `["Player B", "Player C"]` | `"11–9"` | `"Demo League"` | `+14` |
| 4 | -9d | `"win"` | `"Player A"` | `["Player D", "Player E"]` | `"11–8"` | `"Demo League"` | `+12` |
| 5 | -12d | `"loss"` | `"Player F"` | `["Player B", "Player C"]` | `"7–11"` | `"Demo League"` | `-8` |
| 6 | -15d | `"win"` | `"Player A"` | `["Player D", "Player C"]` | `"11–6"` | `"Demo League"` | `+13` |

`partnerId` and `opponentIds` must use fixed placeholder strings: `"demo-partner-a"`, `"demo-opponent-b"`, etc. These IDs are never used for navigation while preview is active.

### 10.5 `driverHistory` (last 10 windows, oldest → newest)

| Field | Values |
|---|---|
| `winRateHistory` | `[0.45, 0.48, 0.50, 0.52, 0.55, 0.55, 0.57, 0.58, 0.59, 0.60]` |
| `ciHistory` | `[-4, -1, 2, 5, 7, 6, 9, 11, 10, 12]` |
| `driftHistory` | `[-14, -13, -12, -11, -10, -10, -9, -9, -8, -8]` |

### 10.6 `driverDeltas`

| Field | Value |
|---|---|
| `winRateDelta` | `+0.05` |
| `ciDelta` | `+0.4` |
| `driftDelta` | `+2` |

### 10.7 `editTimer`

| Field | Value |
|---|---|
| `expiresAt` | `null` |
| `matchId` | `null` |

(Note: `EditTimerLink` is hidden entirely during preview per requirement 14, so this field is technically unused — but `CommandData` requires it.)

## 11. Decisions Locked

All planning-phase open questions have been resolved:

- **Scope:** Home (`/command`) and Trajectory (`/trajectory`) only — see requirement 19.
- **Banner copy:** Identical on both screens; copy fixed in requirement 9.
- **Banner styling:** Bright amber from mockup; classes fixed in §6.
- **No dismiss control:** The banner cannot be dismissed; only the match threshold removes it.
- **Demo values:** Concrete values fixed in §10 above.
- **Cache invalidation:** All match write paths (`POST /api/matches`, `PATCH /api/matches/[id]`, admin edit, admin void) call `revalidateTag("command-data" …)`.
- **Demo names:** Single-letter placeholders ("Player A" through "Player F") — see §10.4.
- **No schema changes:** Eligibility is computed entirely from existing `MatchParticipant` / `Match` data.

## 12. Revision History

- **v1 (planning):** Included a "Got it" dismiss button, `Player.previewDismissedAt` column, dedicated dismiss API endpoint, and a `previewGraduated` JWT claim for session-level short-circuiting.
- **v2 (current — post-implementation):** Dismiss removed entirely. Banner is purely informational; the only way out of preview is to play 5 matches. Schema column dropped, dismiss endpoint deleted, JWT claim removed. Simpler eligibility check (just match count). The `mockups/new-user-demo-preview.html` still depicts a "Got it" button in frame 1 — leave it as historical reference; the implementation no longer renders one.


Source plan: `C:\Users\AT\.claude\plans\be-critical-and-think-ticklish-parrot.md`


