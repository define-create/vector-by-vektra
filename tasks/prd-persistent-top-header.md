# PRD: Persistent Top Header

## 1. Introduction / Overview

The app currently has no top-of-screen branding or screen-identity element. Each tab page starts content from the very top edge of the viewport, which feels unfinished and makes it hard to tell which screen you're on at a glance.

This feature introduces a **persistent fixed top header** that appears on every tab screen. It anchors the app's brand identity (logo + wordmark) on the left and shows a **gear icon** on the right that navigates to a future Profile/Settings screen. The current screen's name is displayed in the header, giving the user constant orientation.

---

## 2. Goals

- Establish a consistent visual identity across all tab screens (Command, Enter, Stats).
- Give users persistent spatial context — they always know which screen they are on.
- Provide a persistent entry point to Profile/Settings via a gear icon.
- Add zero layout noise — the header is compact, dark, and unobtrusive.

---

## 3. User Stories

- **As a user**, I want to always see the app logo so I know which app I'm in (especially when returning from background).
- **As a user**, I want to always see the name of the current screen so I know where I am without relying solely on the bottom nav icons.
- **As a user**, I want quick access to my profile/settings from any screen via the gear icon in the top-right corner.

---

## 4. Functional Requirements

1. A `TopHeader` component must be rendered on every tab page (Command, Enter, Stats).
2. The header must be **fixed** to the top of the viewport — it does not scroll with page content.
3. The header must span the full width of the content column (respects the `max-w-md` container if applied; see max-width constraint plan).
4. The **left side** of the header displays:
   - A logo symbol: an emerald-500 filled circle placeholder, to be replaced with the final SVG monogram when delivered.
   - The wordmark **"Vector"** beside the logo.
5. The **right side** of the header displays a **gear icon** button.
   - Tapping/clicking the gear navigates to `/profile`.
      - The `/profile` route already exists on the deployed app.
6. The **current screen name** is displayed in the header. It changes based on the active tab:
   - Route `/command` → label **"Dashboard"**
   - Route `/enter` → label **"Log Match"**
   - Route `/stats` → label **"Statistics"**
7. The screen name is derived from the current URL using `usePathname()` (Next.js client-side hook). The `TopHeader` must be a `"use client"` component.
8. The main content area must be offset downward by the header's height so page content does not appear behind the fixed header. This is done by adding top padding to `<main>` in the tabs layout.
9. The header must respect the iOS safe area at the top (`env(safe-area-inset-top)`) so content is not clipped on notched devices.

---

## 5. Non-Goals (Out of Scope)

- The `/profile` screen itself — it already exists and this PRD only covers linking to it.
- Displaying the logged-in user's name or avatar in the header.
- Any header actions beyond the gear icon (no back button, no search, no share).
- Animated transitions between screen names when switching tabs.
- Sub-screen awareness (e.g., the Stats header always shows "Stats" regardless of whether the "Match Stats" or "Matchup" sub-tab is active).
- The logo asset design — an emerald placeholder is used until the final monogram/symbol is delivered.
- Header on auth pages (sign-in, register) — those pages keep their own minimal layout with no top header.

---

## 6. Design Considerations

### Layout
```
┌─────────────────────────────────────────┐
│ [Logo] Vector          [screen name] ⚙  │  ← 56px tall, fixed, bg-zinc-950
├─────────────────────────────────────────┤
│                                         │
│   Page content (scrollable)             │
│                                         │
└─────────────────────────────────────────┘
```

Alternative — screen name below the wordmark (stacked layout):
```
┌─────────────────────────────────────────┐
│ [Logo] Vector                        ⚙  │
│        Stats                            │  ← taller header (~64–72px)
├─────────────────────────────────────────┤
```

**Chosen:** Single-row layout. Logo + "Vector" left-aligned; screen name in the center or right of center; gear icon far right.

### Visual style
- Background: `bg-zinc-950` (matches body/page background — seamless, no harsh line)
- Bottom border: `border-b border-zinc-800` (subtle separator)
- Logo symbol: use an emerald-500 filled circle as placeholder until the final SVG monogram/symbol asset is delivered by the product owner.
- Wordmark "Vector": `text-base font-bold text-zinc-50`
- Screen name: `text-sm font-medium text-zinc-400` (subdued, secondary to the logo)
- Gear icon: Heroicons or Lucide `Settings` / `Gear` — `text-zinc-400`, `h-5 w-5`

### Height
- Target: `h-14` (56px) — matches standard mobile app bar height.
- Add `pt-14` to `<main>` in tabs layout to offset content.

### Component location
- `components/nav/TopHeader.tsx` (alongside existing `BottomNav.tsx`)
- Rendered in `app/(tabs)/layout.tsx`, above `<main>`

---

## 7. Technical Considerations

- `TopHeader` must be `"use client"` because it uses `usePathname()` from `next/navigation`.
- The tabs layout (`app/(tabs)/layout.tsx`) is a **server component** — rendering a client `TopHeader` directly from it is fine (Next.js supports client components inside server layouts).
- The `fixed` positioning of the header means it exits the normal document flow. The `<main>` element in the tabs layout must add `pt-14` to compensate and prevent content overlap.
- If the max-width constraint plan is also applied (limiting content to `max-w-md`), the header's **inner content** should also be constrained to `max-w-md mx-auto` so it aligns with the page content. The outer `<header>` remains full-width with `bg-zinc-950` background.
- The gear icon links to `/profile` using `<Link href="/profile">` from `next/link`. The `/profile` route exists at `https://vector-by-vektra.vercel.app/profile`.
- Screen name mapping should be a simple lookup object inside `TopHeader`:
  ```ts
  const SCREEN_NAMES: Record<string, string> = {
    "/command": "Dashboard",
    "/enter": "Log Match",
    "/stats": "Statistics",
  };
  ```
  `usePathname()` returns the full path (e.g., `/stats`); match on the first segment.

---

## 8. Success Metrics

- The header is visible on all three tab screens without layout breakage.
- Switching tabs correctly updates the screen name in the header.
- The gear icon is tappable and navigates to `/profile`.
- Page content does not overlap with or hide behind the header when scrolling.
- On iOS devices with a notch, the header top edge respects the safe area.

---

## 9. Open Questions

None — all decisions resolved.
