# PRD: Shareable Prediction Card

## 1. Introduction / Overview

After a user fills in the Matchup Projection screen (4 players selected), they can tap a **Share** button to generate a branded PNG image of the prediction and a public link. The image is purpose-built for group chats (WhatsApp, iMessage, Telegram) and social media (Instagram Stories, Twitter/X).

**Problem it solves:** There is currently no way to share a matchup prediction outside the app. Players who want to hype up an upcoming match with their group have no way to bring non-users into the conversation. This feature makes every prediction a potential invite.

**Goal:** Enable organic, viral growth by letting existing users share predictions into their group's natural communication channels — with minimal friction and no requirement for the recipient to be a registered user.

---

## 2. Goals

1. Allow any authenticated user to share a matchup prediction as a branded PNG image via the device's native share sheet.
2. Generate a public, shareable URL that anyone (unauthenticated) can open to view the prediction.
3. Create a "Join Vector" moment on the public page — every shared link is an acquisition opportunity.
4. Track how many times each share link is opened.

---

## 3. User Stories

- **As a registered player**, after filling in my matchup projection, I can tap "Share" and send the prediction card directly to my pickleball group chat via iMessage or WhatsApp, so that everyone can see who is favored before we play.
- **As a registered player**, I can copy the share link to clipboard and paste it anywhere (email, Slack, Discord) if the native share sheet isn't available.
- **As a registered player**, I can download the prediction as a PNG image to drag into Instagram Stories.
- **As a non-registered recipient**, I can open a shared link in my browser and see the full prediction without logging in, so I can understand the context immediately.
- **As a non-registered recipient**, I see a clear call-to-action to create a Vector account after viewing the shared prediction.

---

## 4. Functional Requirements

### 4.1 Share Button
1. A "Share" button must appear below `ProjectionCard` in `MatchupsClient` once prediction data has loaded successfully.
2. The Share button must be visible on all completed projections — not gated by the user being one of the four selected players.
3. On tap/click, the system must first call `POST /api/matchup/share` to create a snapshot record, then initiate sharing.

### 4.2 Share Mechanics (Priority Order)
4. **Primary — Web Share API**: If `navigator.canShare({ files: [...] })` returns `true`, call `navigator.share({ files: [pngBlob], title: "Matchup Prediction", url: sharePageUrl })` to open the native OS share sheet.
5. **Secondary — Copy Link**: If Web Share API is unavailable, display a "Copy link" option that writes the public share URL to the clipboard.
6. **Tertiary — Download Image**: Provide a "Download image" option that triggers a PNG file download (for Instagram Stories or any other use).
7. The share UI must degrade gracefully across all browsers — at minimum, copy link must always work.

### 4.3 Share Snapshot (API)
8. `POST /api/matchup/share` must be an authenticated endpoint (requires valid session).
9. It must accept `{ player1Id, player2Id, player3Id, player4Id }` in the request body.
10. It must compute the full matchup projection (reusing existing computation logic from `app/api/matchup/route.ts`) and store a **frozen snapshot** in the database.
11. The snapshot JSON stored must include: `{ probability, moneyline, ratingDiff, volatility, momentum, minConfidence, players: { p1Name, p2Name, p3Name, p4Name } }`. Player IDs must NOT be stored in the snapshot — display names only.
12. It must generate a random 32-byte token, store its SHA-256 hash in the database, and return `{ token: rawToken, url: "/s/<rawToken>" }`.

### 4.4 Public Share Data (API)
13. `GET /api/share/[token]` must be a public endpoint (no authentication required).
14. It must look up the `MatchupShare` record by SHA-256 hash of the token.
15. On each successful lookup, it must increment `viewCount` by 1.
16. It must return the snapshot JSON. It must NOT expose `createdByUserId` or any internal IDs.
17. If the token is not found, return `404 { error: "Share not found" }`.

### 4.5 Public Share Page (`/s/[token]`)
18. The page at `/s/[token]` must be accessible without authentication.
19. It must display: both team pair names, the win probability (as a large %, with `~` prefix if `minConfidence < 0.40`), the moneyline, Δ Rating (signed), and Momentum label.
20. It must display a prominent CTA: **"See your own stats — join Vector"** linking to `/register`.
21. It must include Open Graph meta tags so that when the URL is pasted in iMessage, WhatsApp, or Twitter, a rich preview card is shown. The OG image should be the generated PNG (see 4.6).
22. The page must show a "Powered by Vector" footer.

### 4.6 OG / Share Image Generation
23. A route at `app/api/og/matchup/route.ts` must generate a PNG image using Next.js `ImageResponse` (Satori). It must run on the **Edge Runtime** (`export const runtime = "edge"`).
24. The image must be generated from a purpose-built JSX layout — NOT a screenshot of the existing `ProjectionCard` component.
25. The image layout must include (in order, top to bottom):
    - Top bar: Vector logo dot (emerald circle) + "Vector" wordmark on the left; domain URL on the right.
    - Team names: `[P1 Name] / [P2 Name]` on one line, `vs [P3 Name] / [P4 Name]` below it.
    - Big win probability percentage (e.g., `73%`). Apply `~` prefix if `minConfidence < 0.40`.
    - Plain-language label: `"[Team 1] is favored"` / `"Even match"`.
    - A compact row of three stats: `Δ [ratingDiff] pts`, `[moneyline]`, `[momentum label]`.
26. The image must use the app's dark zinc palette (dark background ~`#09090b`, off-white text ~`#fafafa`, emerald accent `#10b981`).
27. The image route must accept query parameters: `p1`, `p2`, `p3`, `p4` (display names), `pct` (probability 0–100 integer), `ml` (moneyline string), `rd` (ratingDiff), `mo` (momentum label), `lc` (lowConfidence boolean).

### 4.7 Database
28. A new `MatchupShare` model must be added to `prisma/schema.prisma`:
    ```prisma
    model MatchupShare {
      id              String    @id @default(cuid())
      tokenHash       String    @unique
      createdByUserId String
      snapshotJson    Json
      createdAt       DateTime  @default(now())
      expiresAt       DateTime?
      viewCount       Int       @default(0)
      createdBy       User      @relation(fields: [createdByUserId], references: [id])
    }
    ```
29. After adding the model, `npx prisma generate` must be run to regenerate the client.
30. The DB migration must be applied via the Supabase SQL editor (not `prisma migrate deploy` — incompatible with pgBouncer).

### 4.8 Middleware
31. `/s` and `/api/share` must be added to `PUBLIC_PREFIXES` in `middleware.ts` so they bypass the authentication redirect.

---

## 5. Non-Goals (Out of Scope)

- Sharing player profile stats cards (only matchup prediction cards in v1).
- Sharing match history or recent results as images.
- Real-time live projection on the share page (prediction is frozen at share time).
- Share link expiry (the `expiresAt` field is reserved for future use; v1 shares never expire).
- Social media direct posting via platform-specific SDKs (Instagram Graph API, Twitter API, etc.).
- Push notifications or in-app share tracking dashboard.
- Restricting the share button to pro-plan users.

---

## 6. Design Considerations

**Share card layout (portrait image):**
```
┌─────────────────────────────────┐
│ ● Vector              vector.app│
│                                 │
│   Ali Taha / Sam Chen           │
│   vs Jordan Lee / Chris Park    │
│                                 │
│            73%                  │
│      Ali/Sam is favored         │
│                                 │
│  +82 pts  │  -180  │  ↑ Rising  │
└─────────────────────────────────┘
```

**Public share page (`/s/[token]`):** Dark zinc background, matching the app. Large probability number prominent at the top. CTA button is white/light, high contrast.

**Share button in app:** Appears inline below `ProjectionCard`, full-width or right-aligned. Label: "Share prediction". Secondary options (copy/download) appear as a small popover or as a bottom sheet on mobile.

**Mockups available:** `mockups/projection-confidence-before.html` and `mockups/projection-confidence-after.html` show the current ProjectionCard for reference.

---

## 7. Technical Considerations

- **Image generation**: Use `next/og`'s `ImageResponse` (Satori). Satori only supports a **subset of CSS** — flexbox layout, no CSS Grid, no Tailwind arbitrary values (`text-[64px]` won't work). All styles in the image route must use plain inline style objects.
- **Satori fonts**: Custom fonts (Geist) must be fetched and passed to `ImageResponse` options. Alternatively, use a system font fallback for v1.
- **Snapshot vs. live**: The projection is frozen at share time. This is intentional — ratings change nightly after `runRecompute()`. A prediction shared before a match should not silently change.
- **Token generation pattern**: Follow the existing pattern in `app/api/auth/register/route.ts` — `crypto.randomBytes(32).toString("hex")` for the raw token, `crypto.createHash("sha256").update(rawToken).digest("hex")` for the stored hash.
- **Public route access**: `middleware.ts` currently has a `PUBLIC_PREFIXES` array. Both `/s` and `/api/share` must be added to it. Review the current middleware before editing.
- **Reusing matchup computation**: `POST /api/matchup/share` should call the same computation functions (`computeWinProbability`, `computeMoneyline`, etc.) imported from `lib/matchup.ts` and `lib/metrics/`. Do not duplicate the logic from `app/api/matchup/route.ts`.

---

## 8. Success Metrics

- At least one share is created per 10 matchup projections viewed.
- At least 20% of share link opens result in a click on the "Join Vector" CTA.
- Zero authentication errors on `/s/[token]` or `/api/share/[token]` pages (confirm public routing works).

---

## 9. Open Questions

None — all design decisions were finalized during the planning session.

---

## Relevant Files

| File | Action |
|------|--------|
| `prisma/schema.prisma` | Add `MatchupShare` model |
| `middleware.ts` | Add `/s` and `/api/share` to PUBLIC_PREFIXES |
| `app/api/matchup/share/route.ts` | **NEW** — POST, authenticated, creates snapshot |
| `app/api/share/[token]/route.ts` | **NEW** — GET, public, returns snapshot + increments viewCount |
| `app/s/[token]/page.tsx` | **NEW** — public share page |
| `app/api/og/matchup/route.ts` | **NEW** — Edge Runtime image generation |
| `components/matchups/ShareButton.tsx` | **NEW** — share UI component |
| `components/matchups/MatchupsClient.tsx` | Add `<ShareButton>` below `<ProjectionCard>` |
| `lib/matchup.ts` | Reuse (read-only) |
| `lib/metrics/` | Reuse (read-only) |
