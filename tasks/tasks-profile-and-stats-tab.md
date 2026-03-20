## Relevant Files

- `components/trajectory/TrajectorySection.tsx` - New reusable client component extracted from the Trajectory page. Used by both `/trajectory` and `/stats`.
- `app/(tabs)/trajectory/page.tsx` - Simplified to render `<TrajectorySection />` after extraction.
- `app/(tabs)/stats/page.tsx` - New server component. Composes TrajectorySection + MatchupsClient in a single scrollable page.
- `app/(tabs)/profile/page.tsx` - New server component. Profile page with display name edit, change password, sign out, and admin link.
- `app/api/auth/change-password/route.ts` - New API route. Handles authenticated password change requests.
- `components/command/SituationBanner.tsx` - Modified to always render (state becomes optional) and include a profile icon link.
- `app/(tabs)/command/page.tsx` - Modified to remove the conditional guard on SituationBanner.
- `components/nav/BottomNav.tsx` - Modified to replace Matchups + Trajectory tabs with a single Stats tab.

### Notes

- No schema changes are required — all data needed exists in the current Prisma schema.
- The profile page lives inside `app/(tabs)/` so the bottom nav bar persists when visiting `/profile`.
- `bcryptjs` and `prisma` are already installed — no new dependencies needed.
- There are no automated tests for these UI routes in this project; manual verification steps are listed in task 7.0.

---

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, check it off by changing `- [ ]` to `- [x]`. Update after each sub-task, not just after completing an entire parent task.

---

## Tasks

- [x] 0.0 Create feature branch
  - [x] 0.1 Create and checkout a new branch: `git checkout -b feature/profile-and-stats-tab`

- [x] 1.0 Extract TrajectorySection into a reusable client component
  - [x] 1.1 Create `components/trajectory/TrajectorySection.tsx` as a `"use client"` component
  - [x] 1.2 Copy all logic from `app/(tabs)/trajectory/page.tsx` into `TrajectorySection`: the `Horizon` type, `TrajectoryData` interface, `HORIZONS` constant, `useState`/`useEffect` hooks, `pct()` and `sign()` helpers, and all JSX (segmented control, chart, stat cards)
  - [x] 1.3 Copy the `StatCard` sub-component into the same file (or keep it local to `TrajectorySection.tsx`)
  - [x] 1.4 Export `TrajectorySection` as the named export
  - [x] 1.5 Update `app/(tabs)/trajectory/page.tsx` to import and render only `<TrajectorySection />` (the file becomes a thin wrapper)
  - [ ] 1.6 Verify the `/trajectory` tab still works correctly in the browser

- [x] 2.0 Build the Stats tab page
  - [x] 2.1 Create the directory `app/(tabs)/stats/` and file `app/(tabs)/stats/page.tsx`
  - [x] 2.2 Mark the file as a server component (no `"use client"` directive)
  - [x] 2.3 Add auth guard: use `getServerSession(authOptions)` and redirect to `/sign-in` if no session
  - [x] 2.4 Copy the `getRecentOpponents()` helper function from `app/(tabs)/matchups/page.tsx` into the stats page (same DB query logic)
  - [x] 2.5 Copy the `toSlot()` helper and URL param extraction logic (`p2Id`, `p3Id`, `p4Id`) from `app/(tabs)/matchups/page.tsx`
  - [x] 2.6 Look up the current user's player profile using `prisma.player.findFirst({ where: { userId: session.user.id, deletedAt: null } })`
  - [x] 2.7 Render `<TrajectorySection />` in the top section of the page (inside a scrollable container)
  - [x] 2.8 Add a visual divider between the trajectory and matchups sections: `<div className="border-t border-zinc-800 mx-5 my-1" />`
  - [x] 2.9 If the user has a player profile, render `<MatchupsClient>` with `myPlayerId`, `recentOpponents`, and any pre-populated slot players
  - [x] 2.10 If the user has no player profile (`myPlayer` is null), render a "No matches yet" message in place of `MatchupsClient`
  - [x] 2.11 Wrap the whole page in `<div className="flex h-full flex-col overflow-y-auto">` so both sections are scrollable together

- [x] 3.0 Update SituationBanner to always render with profile icon
  - [x] 3.1 Open `components/command/SituationBanner.tsx` and update the `Props` interface: make `state` type `SituationState | null` and `detail` optional (`detail?: string`)
  - [x] 3.2 Update the component body: only look up `stateMap[state]` when `state` is not null (guard with `state && stateMap[state]`)
  - [x] 3.3 Update the outer `div` className: use `justify-between` when `state` is not null, `justify-end` when `state` is null
  - [x] 3.4 Wrap the existing emoji + text content in a conditional: only render the left side when `state` is not null
  - [x] 3.5 Add a `Link` import from `next/link`
  - [x] 3.6 Add a profile icon button on the right side — use an inline SVG person icon (a circle head + body arc, similar to standard user icons). Link to `/profile`. Add `aria-label="Profile"`.
  - [x] 3.7 Open `app/(tabs)/command/page.tsx` and remove the `{data.situationState && (` conditional wrapping
  - [x] 3.8 Replace with an unconditional render: `<SituationBanner state={data.situationState ?? null} detail={data.situationDetail ?? ""} />`
  - [x] 3.9 Verify the Command screen shows the banner (with profile icon) even when no momentum situation is active

- [x] 4.0 Create the Change Password API endpoint
  - [x] 4.1 Create `app/api/auth/change-password/route.ts`
  - [x] 4.2 Add session check using `getServerSession(authOptions)` — return 401 if not authenticated
  - [x] 4.3 Parse request body: extract `currentPassword` and `newPassword` as strings
  - [x] 4.4 Validate that both fields are present — return 400 if missing
  - [x] 4.5 Validate that `newPassword.length >= 8` — return `{ error: "Password must be at least 8 characters" }` with status 400 if not
  - [x] 4.6 Fetch the user from the database using `prisma.user.findUnique({ where: { id: session.user.id } })`
  - [x] 4.7 Use `bcrypt.compare(currentPassword, user.passwordHash)` to verify the current password — return `{ error: "Current password is incorrect" }` with status 400 if it doesn't match
  - [x] 4.8 Hash the new password: `await bcrypt.hash(newPassword, 12)`
  - [x] 4.9 Update the user record: `prisma.user.update({ where: { id: session.user.id }, data: { passwordHash: newHash } })`
  - [x] 4.10 Return `{ message: "Password updated" }` with status 200 on success

- [x] 5.0 Create the Profile page
  - [x] 5.1 Create `app/(tabs)/profile/page.tsx` as a server component
  - [x] 5.2 Add auth guard: use `getServerSession(authOptions)` and redirect to `/sign-in` if no session
  - [x] 5.3 Render a page header: `<h1>Profile</h1>` (styled consistently with the app's dark theme)
  - [x] 5.4 Add an email row (read-only): display `session.user.email` as plain text with a "Email" label
  - [x] 5.5 Add the Display Name row: import and render the existing `DisplayNameEdit` component, passing the user's current display name (fetch from `prisma.user.findUnique` or use session if available)
  - [x] 5.6 Create a `"use client"` sub-component `ChangePasswordForm` within the profile page file (or as a separate file `components/profile/ChangePasswordForm.tsx`)
  - [x] 5.7 The `ChangePasswordForm` must have three password inputs: "Current password", "New password (min 8 chars)", "Confirm new password" — each with eye-toggle show/hide (reuse the existing inline SVG pattern from register/sign-in pages)
  - [x] 5.8 On submit, `ChangePasswordForm` calls `POST /api/auth/change-password` with `{ currentPassword, newPassword }` — validate that new password and confirm match before submitting
  - [x] 5.9 Show inline success message ("Password updated ✓") on success; show inline error on failure
  - [x] 5.10 Create a `"use client"` sub-component `SignOutButton` (can be in same file) that calls `signOut({ callbackUrl: "/sign-in" })` from `next-auth/react` on click
  - [x] 5.11 Check admin role: if `session.user.role === "admin"` (use same pattern as `app/admin/layout.tsx`), render an "Admin Panel →" link to `/admin`
  - [x] 5.12 Render `SignOutButton` at the bottom of the page

- [x] 6.0 Update the bottom navigation bar
  - [x] 6.1 Open `components/nav/BottomNav.tsx`
  - [x] 6.2 Remove the `Matchups` entry (`{ label: "Matchups", href: "/matchups", icon: "⚔" }`) from the `tabs` array
  - [x] 6.3 Remove the `Trajectory` entry (`{ label: "Trajectory", href: "/trajectory", icon: TrajectoryIcon }`) from the `tabs` array
  - [x] 6.4 Remove the `TrajectoryIcon` SVG constant (no longer needed in the nav)
  - [x] 6.5 Add a new `StatsIcon` SVG constant — a simple bar chart (3 vertical bars of increasing height), styled consistently with the existing icon size (16×10 viewBox or similar)
  - [x] 6.6 Add a `Stats` entry to the `tabs` array: `{ label: "Stats", href: "/stats", icon: StatsIcon }`
  - [ ] 6.7 Verify the nav now shows exactly 3 tabs: Command | Enter | Stats

- [ ] 7.0 Manual verification
  - [ ] 7.1 Command screen: confirm the SituationBanner card is always visible with a profile icon on the right
  - [ ] 7.2 Command screen (user with momentum): confirm the emoji + label + detail still shows on the left alongside the profile icon
  - [ ] 7.3 Tap the profile icon → confirm navigation to `/profile` with the bottom nav still visible
  - [ ] 7.4 Profile page: confirm email is read-only, display name is editable, change password form works (correct and incorrect current password), sign out redirects to `/sign-in`
  - [ ] 7.5 Profile page (admin user): confirm the Admin Panel link appears; confirm it does not appear for non-admin users
  - [ ] 7.6 Stats tab: confirm Trajectory chart + stat cards render at the top, divider in the middle, Matchups predictor below
  - [ ] 7.7 Stats tab (new user with no matches): confirm empty states render without errors
  - [ ] 7.8 Long-press a match row on Command screen → confirm it still navigates to `/matchups` with players pre-populated
  - [ ] 7.9 Navigate directly to `/trajectory` and `/matchups` → confirm both routes still work independently
  - [ ] 7.10 Confirm bottom nav shows exactly 3 tabs and Stats tab highlights correctly when on `/stats`
