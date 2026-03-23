## Relevant Files

- `prisma/schema.prisma` - Add `MatchupShare` model and `User` relation field
- `middleware.ts` - Add `/s` and `/api/share` to PUBLIC_PREFIXES
- `app/api/matchup/share/route.ts` - **NEW** POST endpoint (authenticated): computes projection, stores frozen snapshot, returns token
- `app/api/share/[token]/route.ts` - **NEW** GET endpoint (public): looks up snapshot by token hash, increments viewCount, returns snapshot JSON
- `app/api/og/matchup/route.ts` - **NEW** Edge Runtime PNG image generation via Satori (`ImageResponse`)
- `app/s/[token]/page.tsx` - **NEW** Public share page — displays prediction, OG meta tags, CTA
- `components/matchups/ShareButton.tsx` - **NEW** Share UI: action sheet with card preview, Web Share API / copy / download fallbacks
- `components/matchups/MatchupsClient.tsx` - Add `<ShareButton>` below `<ProjectionCard>` when data is loaded
- `lib/matchup.ts` - Reuse existing computation functions (read-only)
- `lib/metrics/` - Reuse existing metrics functions (read-only)
- `app/api/auth/register/route.ts` - Reference for token generation pattern (`crypto.randomBytes` + SHA-256)
- `app/api/matchup/route.ts` - Reference for existing matchup computation to reuse (not duplicate)

### Notes

- **No `prisma migrate deploy`** — apply DB migration via Supabase SQL editor. pgBouncer is incompatible with `prisma migrate deploy`.
- **Always run `npx prisma generate`** after any `schema.prisma` change. Forgetting this causes silent `PrismaClientValidationError` at runtime.
- **Satori CSS constraints** — `app/api/og/matchup/route.ts` must use plain inline style objects only. No Tailwind classes, no CSS Grid, no arbitrary values like `text-[64px]`. Flexbox only.
- **Token pattern** — `crypto.randomBytes(32).toString("hex")` for the raw token; `crypto.createHash("sha256").update(rawToken).digest("hex")` for the stored hash. Follow `app/api/auth/register/route.ts`.
- **Design reference** — `mockups/share-card-hybrid.html` defines the visual spec: zinc palette throughout, same fonts/colors as app, probability number larger in the PNG card only (for flat-image legibility), probability bars (73% / 27%) added to both card image and public page.
- No unit tests required — verify manually in browser.

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, you must check it off in this markdown file by changing `- [ ]` to `- [x]`. This helps track progress and ensures you don't skip any steps.

Example:
- `- [ ] 1.1 Read file` → `- [x] 1.1 Read file` (after completing)

Update the file after completing each sub-task, not just after completing an entire parent task.

## Tasks

- [ ] 0.0 Create feature branch
  - [ ] 0.1 Create and checkout a new branch: `git checkout -b feature/shareable-prediction-card`

- [x] 1.0 Database schema — Add `MatchupShare` model
  - [x] 1.1 Add the `MatchupShare` model to `prisma/schema.prisma` (fields: `id`, `tokenHash`, `createdByUserId`, `snapshotJson`, `createdAt`, `expiresAt`, `viewCount`, `createdBy` relation)
  - [x] 1.2 Add `matchupShares MatchupShare[]` field to the `User` model in `prisma/schema.prisma`
  - [x] 1.3 Run `npx prisma generate` to regenerate the Prisma client
  - [ ] 1.4 Apply migration via Supabase SQL editor: `CREATE TABLE "MatchupShare" (...)` — derive the SQL from the schema definition

- [x] 2.0 Middleware — expose public routes
  - [x] 2.1 Open `middleware.ts`, read the existing `PUBLIC_PREFIXES` array
  - [x] 2.2 Add `"/s"` and `"/api/share"` to `PUBLIC_PREFIXES`

- [x] 3.0 Share snapshot API — `POST /api/matchup/share`
  - [x] 3.1 Create `app/api/matchup/share/route.ts`
  - [x] 3.2 Authenticate the request using the existing session pattern; return 401 if no session
  - [x] 3.3 Parse and validate `{ player1Id, player2Id, player3Id, player4Id }` from the request body
  - [x] 3.4 Fetch all 4 player records from the DB (same query pattern as `app/api/matchup/route.ts`)
  - [x] 3.5 Compute the full projection by importing and calling `computeWinProbability`, `computeMoneyline`, etc. from `lib/matchup.ts` and `lib/metrics/` — do NOT duplicate logic
  - [x] 3.6 Build the snapshot JSON: `{ probability, moneyline, ratingDiff, volatility, momentum, minConfidence, players: { p1Name, p2Name, p3Name, p4Name } }` — display names only, no IDs
  - [x] 3.7 Generate a 32-byte random token (`crypto.randomBytes(32).toString("hex")`); compute its SHA-256 hash
  - [x] 3.8 Write the `MatchupShare` record to the DB with `tokenHash`, `createdByUserId`, `snapshotJson`
  - [x] 3.9 Return `{ token: rawToken, url: "/s/<rawToken>" }`

- [x] 4.0 Public share data API — `GET /api/share/[token]`
  - [x] 4.1 Create `app/api/share/[token]/route.ts`
  - [x] 4.2 Hash the incoming `token` param with SHA-256 and look up the `MatchupShare` record
  - [x] 4.3 If not found, return `404 { error: "Share not found" }`
  - [x] 4.4 Increment `viewCount` by 1 on the found record (`prisma.matchupShare.update`)
  - [x] 4.5 Return the `snapshotJson` — exclude `createdByUserId` and all internal IDs from the response

- [x] 5.0 OG image generation — `GET /api/og/matchup`
  - [x] 5.1 Create `app/api/og/matchup/route.ts` with `export const runtime = "edge"`
  - [x] 5.2 Accept query params: `p1`, `p2`, `p3`, `p4` (display names), `pct` (integer), `ml` (moneyline string), `rd` (ratingDiff), `mo` (momentum label), `lc` (lowConfidence boolean)
  - [x] 5.3 Build the JSX layout using only inline style objects and flexbox — reference `mockups/share-card-hybrid.html` col 2 for the visual spec:
      - Top bar: emerald dot + "Vector" wordmark left; "vector.app" right
      - Team names: `P1 / P2` line, `VS` separator, `P3 / P4` line
      - Big probability number (prefix `~` if `lc=true`); emerald favored label below
      - Probability bars: team A (emerald fill, width = pct%), team B (zinc fill, width = 100-pct%)
      - Stats row: Δ Rating | Model Line | Momentum — separated by 1px zinc borders
  - [x] 5.4 Use dark zinc background `#09090b`, off-white text `#fafafa`, emerald `#10b981`; all type sizes use inline `fontSize` numbers (no Tailwind)
  - [x] 5.5 Return `new ImageResponse(jsx, { width: 800, height: 600 })`

- [x] 6.0 Public share page — `app/s/[token]/page.tsx`
  - [x] 6.1 Create `app/s/[token]/page.tsx` as a server component; it must be accessible without authentication
  - [x] 6.2 Fetch snapshot by calling `GET /api/share/[token]` (or query DB directly — server component can call Prisma); handle 404 with a "Share not found" message
  - [x] 6.3 Add `generateMetadata` export: set OG title to `"[P1]/[P2] vs [P3]/[P4] — Vector prediction"`; set `og:image` to `/api/og/matchup?p1=...&p2=...&pct=...` (all params URL-encoded)
  - [x] 6.4 Render the page using the hybrid mockup design (col 3 of `mockups/share-card-hybrid.html`) — zinc palette, same card surface, same borders as the app:
      - Top bar: emerald dot + "Vector" logo; "Prediction" tag right
      - Hero card: large probability number (with `~` prefix if `minConfidence < 0.40`), favored team label, probability bars
      - Teams block: favored/underdog rows with dot indicators
      - Stats grid: Δ Rating, Model Line, Momentum
      - CTA button (white/zinc-900): "See your own stats — join Vector" → `/register`
      - Secondary link: "Already a member? Sign in →" → `/sign-in`
  - [x] 6.5 Add "Powered by Vector · vector.app" footer

- [x] 7.0 Share button — component + wire-up
  - [x] 7.1 Create `components/matchups/ShareButton.tsx` as a client component (`"use client"`)
  - [x] 7.2 Accept props: `player1Id`, `player2Id`, `player3Id`, `player4Id` (all strings)
  - [x] 7.3 Implement share trigger button: subtle outline style with emerald dot + "Share this prediction" label + chevron (matching col 1 of `mockups/share-card-hybrid.html`)
  - [x] 7.4 On click: call `POST /api/matchup/share` with the four player IDs; store `{ token, url }` from the response; show loading state while the request is in flight
  - [x] 7.5 After the token is received, show the action sheet (bottom sheet): mini card preview (probability + team names + favored label), then three action buttons
  - [x] 7.6 "Share via native sheet" button: fetch the PNG from `/api/og/matchup?...` as a Blob; if `navigator.canShare({ files: [...] })` is true, call `navigator.share({ files: [pngBlob], title: "Matchup Prediction", url: sharePageUrl })`
  - [x] 7.7 "Copy link" button: write the share URL to clipboard (`navigator.clipboard.writeText`); show brief "Copied!" confirmation
  - [x] 7.8 "Download PNG" button: create an `<a download>` element pointing to the PNG blob URL and click it programmatically
  - [x] 7.9 Graceful degradation: if Web Share API is unavailable, "Share via native sheet" should be hidden; "Copy link" must always be present and functional
  - [x] 7.10 In `components/matchups/MatchupsClient.tsx`, import `ShareButton` and render it below `<ProjectionCard />` inside the `{data && !loading}` block, passing the four player IDs from `data.players`
