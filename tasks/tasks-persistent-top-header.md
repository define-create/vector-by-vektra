## Relevant Files

- `components/nav/TopHeader.tsx` - New component: the persistent fixed top header (logo, screen name, gear icon).
- `app/(tabs)/layout.tsx` - Tabs layout: add `<TopHeader />` above `<main>` and add `pt-14` to `<main>` to offset content below the fixed header.
- `app/globals.css` - Add `pt-safe-top` utility class for iOS safe-area top inset if not already present.

### Notes

- `TopHeader` must be `"use client"` because it uses `usePathname()` from `next/navigation`.
- The outer `<header>` element stays full-width. Inner content uses `max-w-md mx-auto` to align with the page column when the max-width constraint is applied.
- No unit tests are required for this feature — it is a pure UI component with no business logic.

---

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, check it off by changing `- [ ]` to `- [x]`. Update after each sub-task, not just each parent task.

---

## Tasks

- [x] 1.0 Create `TopHeader` component
  - [x] 1.1 Create `components/nav/TopHeader.tsx` with `"use client"` directive
  - [x] 1.2 Import `usePathname` from `next/navigation` and `Link` from `next/link`
  - [x] 1.3 Define the `SCREEN_NAMES` lookup: `{ "/command": "Dashboard", "/enter": "Log Match", "/stats": "Statistics" }`
  - [x] 1.4 Derive the current screen name from `usePathname()` — extract the first path segment (e.g., `/stats` → `"Statistics"`); fall back to empty string if not matched
  - [x] 1.5 Render the outer `<header>` with `fixed top-0 left-0 right-0 z-40 border-b border-zinc-800 bg-zinc-950`
  - [x] 1.6 Add iOS safe-area top padding: apply `pt-safe-top` utility to the outer `<header>`
  - [x] 1.7 Inside the header render an inner `<div className="h-14 mx-auto w-full max-w-md flex items-center justify-between px-5">`
  - [x] 1.8 Left slot: `<div className="flex items-center gap-2">` containing an emerald-500 filled circle and the wordmark `<span className="text-base font-bold text-zinc-50">Vector</span>`
  - [x] 1.9 Center: `<span className="text-sm font-medium text-zinc-400">{screenName}</span>`
  - [x] 1.10 Right slot: `<Link href="/profile">` wrapping an inline SVG gear/settings icon (`text-zinc-400`)

- [x] 2.0 Integrate `TopHeader` into the tabs layout
  - [x] 2.1 Read `app/(tabs)/layout.tsx` to understand its current structure
  - [x] 2.2 Import `TopHeader` from `@/components/nav/TopHeader`
  - [x] 2.3 Render `<TopHeader />` as the first child inside the outermost `<div>`, before `<main>`
  - [x] 2.4 Add `pt-14` to `<main>` to push content below the 56px fixed header

- [x] 3.0 Add iOS safe-area top support
  - [x] 3.1 Added `.pt-safe-top { padding-top: env(safe-area-inset-top, 0px); }` to `app/globals.css`
  - [x] 3.2 Applied `pt-safe-top` class to the outer `<header>` in `TopHeader.tsx`
  - [x] 3.3 `<main>` uses `pt-14` which covers the base 56px; safe area is handled in the header itself

- [ ] 4.0 Verify across all three tab screens
  - [ ] 4.1 Manual test — navigate to `/command`: confirm header shows "Dashboard", logo dot visible, gear icon present
  - [ ] 4.2 Manual test — navigate to `/enter`: confirm header shows "Log Match"
  - [ ] 4.3 Manual test — navigate to `/stats`: confirm header shows "Statistics"
  - [ ] 4.4 Manual test — scroll down on any tab page: confirm header stays fixed and page content scrolls under it without overlap
  - [ ] 4.5 Manual test — tap gear icon: confirm navigation to `/profile`
  - [ ] 4.6 Manual test — open on an iOS device with a notch: confirm header top edge sits below the status bar and is not clipped
