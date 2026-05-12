# Tasks: New User Demo Preview — Final (as shipped)

Source PRD: [tasks/prd-new-user-demo-preview.md](prd-new-user-demo-preview.md)
Visual reference: [mockups/new-user-demo-preview.html](../mockups/new-user-demo-preview.html) (historical — mockup still shows a "Got it" button; the shipped feature has no dismiss control)

**Status:** ✅ Complete and verified in browser.

## Relevant Files — final state

### New files
- [lib/services/preview-mode.ts](../lib/services/preview-mode.ts) — `shouldShowPreview(userId)` + `DEMO_PREVIEW_MATCH_THRESHOLD = 5`. Single combined Prisma query.
- [lib/services/preview-mode.test.ts](../lib/services/preview-mode.test.ts) — 7 tests, all passing.
- [lib/services/demo-command-data.ts](../lib/services/demo-command-data.ts) — `buildDemoCommandData(displayName)` pure factory; values locked in PRD §10.
- [lib/services/demo-command-data.test.ts](../lib/services/demo-command-data.test.ts) — 9 tests, all passing.
- [components/PreviewBanner.tsx](../components/PreviewBanner.tsx) — pure server component (sticky, no client state, no dismiss control). Reused by home and trajectory.

### Files modified
- [app/(tabs)/command/page.tsx](../app/(tabs)/command/page.tsx) — calls `shouldShowPreview`, renders `<PreviewBanner />`, passes `previewOverride` to three section components, hides `<EditTimerLink>` when preview active.
- [app/(tabs)/command/RatingCard.tsx](../app/(tabs)/command/RatingCard.tsx) — accepts `previewOverride?: CommandData`.
- [app/(tabs)/command/DriversGrid.tsx](../app/(tabs)/command/DriversGrid.tsx) — same.
- [app/(tabs)/command/MatchHistorySection.tsx](../app/(tabs)/command/MatchHistorySection.tsx) — same.
- [app/(tabs)/trajectory/page.tsx](../app/(tabs)/trajectory/page.tsx) — async server component; renders banner + derives `TrajectoryData` preview from demo data.
- [components/trajectory/TrajectorySection.tsx](../components/trajectory/TrajectorySection.tsx) — accepts `previewOverride?: TrajectoryData`; bypasses fetch when present.
- [app/api/matches/[id]/route.ts](../app/api/matches/%5Bid%5D/route.ts) — bug fix: `revalidateTag("command", …)` → `revalidateTag("command-data", …)`.
- [app/api/admin/matches/[id]/void/route.ts](../app/api/admin/matches/%5Bid%5D/void/route.ts) — same tag fix.
- [app/api/admin/matches/[id]/edit/route.ts](../app/api/admin/matches/%5Bid%5D/edit/route.ts) — same tag fix.

### Files created during v1 then removed during v2 (no-dismiss simplification)
- ~~`app/api/players/me/preview-dismiss/route.ts`~~ — deleted; no dismiss endpoint needed.
- ~~`Player.previewDismissedAt` column~~ — added then dropped from schema and DB.
- ~~`previewGraduated` JWT/session claim~~ — added to `lib/auth.ts` + `types/next-auth.d.ts` then reverted.

### Notes
- DB column was added then dropped — current schema matches pre-feature state for `Player`.
- All tests pass (16/16 in the two new test files). Type-check clean. Lint clean on all changed files.
- Pre-existing test failures in `claim/`, `link/`, `unclaim/`, `PlayerSelector.test.tsx` are unrelated.

## Tasks

- [x] 1.0 Schema change (later reverted) — `Player.previewDismissedAt`
  - [x] 1.1 Add field to `prisma/schema.prisma`.
  - [x] 1.2 `npx prisma generate`.
  - [x] 1.3 `ALTER TABLE "Player" ADD COLUMN "previewDismissedAt" TIMESTAMP(3);` (Supabase).
  - [x] 1.4 Runtime verified during browser testing.
  - [x] **v2: reverted** — field removed from schema, column dropped from DB (`ALTER TABLE "Player" DROP COLUMN "previewDismissedAt";`).

- [x] 2.0 Build the eligibility service
  - [x] 2.1 `lib/services/preview-mode.ts` with `DEMO_PREVIEW_MATCH_THRESHOLD = 5`.
  - [x] 2.2 `shouldShowPreview(userId)` — single combined Prisma query (Player findFirst + relation count).
  - [x] 2.3 ~~Add `previewGraduated` to NextAuth types~~ — added in v1, reverted in v2.
  - [x] 2.4 ~~Wire JWT/session callbacks~~ — added in v1, reverted in v2.
  - [x] 2.5 Tests: 7 passing.

- [x] 3.0 Build `buildDemoCommandData`
  - [x] 3.1–3.7 Done. All concrete values from PRD §10. 9 passing tests.

- [x] 4.0 Build the dismiss API endpoint — **fully reverted in v2** (endpoint deleted, directory removed).

- [x] 5.0 Build the preview banner component
  - [x] v1: client component with "Got it" button, `useSession().update()`, `router.refresh()`.
  - [x] **v2: simplified to pure server component** — no state, no button, no session hook. Sticky amber styling preserved.

- [x] 6.0 Wire preview into home/command screen
  - [x] 6.1–6.9 Done.
  - [x] 6.10 Browser-verified.

- [x] 7.0 Wire preview into trajectory tab
  - [x] 7.1–7.3 Done.
  - [x] 7.4 Browser-verified.

- [x] 8.0 Cache invalidation
  - [x] 8.1–8.2 Three pre-existing tag-mismatch bugs found and fixed (`"command"` → `"command-data"`).
  - [x] 8.3–8.4 Verified in browser.

- [x] 9.0 PRD §9 verification checklist — walked end-to-end in browser.

## Why the v1 → v2 simplification

After end-to-end testing, a brief visual gap was observed between "banner dismissed" and "real (empty) data rendered." Two fix options:

1. Keep the dismiss flow and try to make the transition smoother (reorder `router.refresh()` before `update()`, hold banner mounted during refresh).
2. Remove the dismiss control entirely — the preview is purely informational and disappears on its own after 5 matches.

Option 2 was chosen because:
- The "gap" bug only exists because dismissal exists.
- The reason a user would dismiss (don't trust this data, want to see my real numbers) is satisfied within 5 matches anyway.
- Removes a column, an endpoint, a JWT claim, a client component, and an `update()` round-trip. Less to maintain, less to break.

Net deletion: ~80 lines of code, one DB column, one API route, one schema migration round-trip.
