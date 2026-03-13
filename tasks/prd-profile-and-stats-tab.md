# PRD: Profile Page & Stats Tab (Navigation Restructure)

## 1. Introduction / Overview

The app currently has 4 navigation tabs (Command, Enter, Matchups, Trajectory) with no dedicated place for account management. Features like display name editing and admin panel access are buried inside the Command screen — a performance dashboard — where they don't belong.

This feature restructures the navigation to add a Profile page (without adding a 5th tab) and combines the Matchups and Trajectory tabs into a single "Stats" tab. The result is a cleaner 3-tab navigation (Command | Enter | Stats) and a dedicated profile destination accessible from the Command screen's momentum banner.

**Goal:** Give users a logical, discoverable home for account settings, reduce nav tab count from 4 to 3, and consolidate two related analytical screens into one.

---

## 2. Goals

1. Provide a Profile page where users can edit their display name, change their password, view their email, sign out, and (if admin) access the admin panel.
2. Make Profile accessible from the Command screen without adding a new nav tab.
3. Combine the Trajectory and Matchups tabs into a single "Stats" tab to free the nav slot.
4. Reduce the bottom navigation from 4 tabs to 3: **Command | Enter | Stats**.
5. Keep existing deep-link behavior intact (long-press on a match still navigates to `/matchups` with pre-populated players).

---

## 3. User Stories

- **As a user**, I want to change my display name from within the app so that I can correct or update how I appear in match history.
- **As a user**, I want to change my password without leaving the app.
- **As a user**, I want to sign out easily so that I can switch accounts or protect my session.
- **As a user**, I want quick access to the admin panel when I'm an admin, without needing to navigate to a separate URL.
- **As a user**, I want to see both my rating history chart and matchup projections in one place so I don't have to switch between two tabs.
- **As a new user with no matches**, I want the Stats tab to show appropriate empty states rather than crashing or redirecting me.

---

## 4. Functional Requirements

### 4.1 — SituationBanner (Command screen top card)

1. The SituationBanner card **must always render** on the Command screen, even when there is no active momentum situation (e.g., new user with few matches).
2. When a momentum situation exists, the card shows the existing emoji + label + detail on the left side.
3. When no momentum situation exists, the left side is empty; the card renders with `justify-end`.
4. The card **must always show a profile icon button** on the right side, regardless of momentum state.
5. The profile icon must be a generic person SVG icon (inline, no external dependency).
6. Tapping/clicking the profile icon navigates to `/profile`.

### 4.2 — Profile Page (`/profile`)

7. The profile page must be inside the `(tabs)` route group so the bottom navigation bar remains visible.
8. The page must require authentication — unauthenticated users are redirected to `/sign-in`.
9. The page must display the user's **email address** (read-only, from session).
10. The page must include a **Display Name** edit row, reusing the existing `DisplayNameEdit` component.
11. The page must include a **Change Password** form with: current password, new password (min 8 chars), confirm new password fields.
12. The Change Password form must call a new API endpoint (`POST /api/auth/change-password`) that verifies the current password before updating.
13. The page must include a **Sign Out** button. On click, it calls `signOut()` from NextAuth and redirects to `/sign-in`.
14. The page must show an **Admin Panel** link (navigates to `/admin`) **only** if the session user has the admin role. This link must not appear for non-admin users.
15. The Sign Out button and Change Password form require client-side interactivity — implement as a `"use client"` sub-component within the server page.

### 4.3 — Stats Tab (`/stats`)

16. A new route `app/(tabs)/stats/page.tsx` must be created as a server component.
17. The page must require authentication — unauthenticated users are redirected to `/sign-in`.
18. The **top section** of the page renders the trajectory content: the time-horizon segmented control (10 Games / 7 Days / 1 Month), the rating chart, and the three stat cards (Win %, Record, Pt Diff). This section is a reusable client component extracted from the current Trajectory page.
19. A visual divider separates the trajectory section from the matchups section.
20. The **bottom section** renders the existing `MatchupsClient` component with:
    - The user's own player ID
    - Up to 8 recent opponents (fetched server-side, same logic as the current Matchups page)
    - Pre-population from URL params (`player2`, `player3`, `player4`) for deep-link compatibility
21. If the user has no player profile yet (new user), the Stats page must:
    - Show the trajectory section with its existing empty state ("No rating data yet")
    - Show the matchups section with a "No matches yet" message in place of the player search
22. The trajectory UI must be extracted into `components/trajectory/TrajectorySection.tsx` so it can be used in both `/trajectory` and `/stats`. The existing `/trajectory` page must be updated to render `<TrajectorySection />`.

### 4.4 — Navigation Bar

23. The BottomNav must be updated to remove the **Matchups** and **Trajectory** tab entries.
24. A new **Stats** tab entry must be added with an appropriate SVG icon (bar chart style, consistent with existing icon style).
25. The resulting nav must have exactly 3 tabs: **Command | Enter | Stats**.
26. The `/trajectory` and `/matchups` routes must remain functional (not deleted) for backwards compatibility and deep-link support.

### 4.5 — Change Password API

27. A new API route `POST /api/auth/change-password` must be created.
28. The endpoint must verify the user is authenticated (via session).
29. The endpoint must accept `{ currentPassword, newPassword }` in the request body.
30. The endpoint must verify `currentPassword` matches the stored `passwordHash` using `bcrypt.compare`.
31. If the current password is wrong, return `{ error: "Current password is incorrect" }` with status 400.
32. If `newPassword` is less than 8 characters, return `{ error: "Password must be at least 8 characters" }` with status 400.
33. On success, update `passwordHash` in the database and return `{ message: "Password updated" }` with status 200.

---

## 5. Non-Goals (Out of Scope)

- **Profile photo / avatar** — the profile icon in the SituationBanner is a generic icon, not a user photo.
- **Initials avatar** — the profile icon does not show the user's initials; it is a static SVG.
- **Email change** — users cannot change their email address from the Profile page.
- **Delete account** — account deletion is not part of this feature.
- **Password reset by email** — this feature only supports changing password when already signed in; forgot-password flow is separate.
- **Combining `/trajectory` and `/matchups` pages into one** — those routes stay intact; only the nav entries change.
- **Pagination or filtering on Stats tab** — the Stats tab shows the same fixed-window data as the existing Trajectory and Matchups pages.

---

## 6. Design Considerations

### SituationBanner with profile icon
```
┌─────────────────────────────────┐
│ 🔥 Hot streak · 5 wins in a row  [👤] │  ← situation present
└─────────────────────────────────┘

┌─────────────────────────────────┐
│                                  [👤] │  ← no situation (justify-end)
└─────────────────────────────────┘
```

### Stats Tab layout (single scroll)
```
┌─────────────────────────────────┐
│  [ 10 Games ] [ 7 Days ] [ 1 Mo ]│
│  ┌─────────────────────────────┐ │
│  │     Rating Chart            │ │
│  └─────────────────────────────┘ │
│  [ Win % ]  [ Record ]  [Pt Diff]│
├─────────────────────────────────┤  ← divider
│  Matchup Projection              │
│  Player 1 [search]               │
│  Player 2 [search]               │
│  ...                             │
└─────────────────────────────────┘
```

### Profile Page layout
```
┌─────────────────────────────────┐
│  Profile                         │
├─────────────────────────────────┤
│  Email        user@example.com   │
│  Display Name  [John Smith  ✎]   │
├─────────────────────────────────┤
│  Change Password                 │
│  [Current password        ]      │
│  [New password            ]      │
│  [Confirm new password    ]      │
│  [   Update Password   ]         │
├─────────────────────────────────┤
│  [Admin Panel →]  (admins only)  │
├─────────────────────────────────┤
│  [   Sign Out   ]                │
└─────────────────────────────────┘
```

---

## 7. Technical Considerations

- **Auth pattern**: Use `getServerSession(authOptions)` for server components (Profile page, Stats page). Sign out button requires `"use client"` and calls `signOut({ callbackUrl: "/sign-in" })` from `next-auth/react`.
- **Admin role check**: Follow the same pattern as `app/admin/layout.tsx` to check `session.user.role === "admin"`.
- **TrajectorySection extraction**: The current `app/(tabs)/trajectory/page.tsx` is `"use client"`. Extract its JSX and logic into `components/trajectory/TrajectorySection.tsx`. The Stats page (server component) can then import and render this client component directly — Next.js App Router supports this pattern.
- **Matchups data on Stats page**: Copy `getRecentOpponents()` helper and `toSlot()` logic from `app/(tabs)/matchups/page.tsx` directly into `app/(tabs)/stats/page.tsx` (or extract to a shared service if preferred).
- **Change password endpoint**: Reuse `bcrypt` (already a dependency via `bcryptjs`) and `prisma` (already set up).
- **BottomNav active state**: The `pathname.startsWith(tab.href)` logic in `BottomNav.tsx` will correctly highlight Stats when on `/stats`. Profile is not in the nav, so no active state needed there.
- **No schema changes required** — all data needed exists in current Prisma schema.

---

## 8. Success Metrics

- A user can navigate to their profile from the Command screen in ≤ 2 taps.
- A user can change their display name or password without leaving the app.
- Admin users can reach the admin panel from the Profile page.
- The nav bar shows exactly 3 tabs and is less crowded.
- The Stats tab correctly shows both trajectory history and matchup projection in one scroll.
- Long-pressing a match in Command still pre-populates the Matchups screen correctly.

---

## 9. Open Questions

- Should the Change Password form show a success confirmation inline (e.g., "Password updated ✓") or navigate back to the profile page after success?
- Should the Profile page have a back button/header, or rely on the user's device back gesture?
- Should `/matchups` and `/trajectory` show a banner prompting users to use `/stats` instead, or remain silent?
