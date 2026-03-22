## Relevant Files

- `app/api/matchup/route.ts` - Add `minConfidence` to the JSON response payload
- `components/matchups/ProjectionCard.tsx` - Add visual treatment when `minConfidence < 0.40`
- `components/matchups/MatchupsClient.tsx` - Pass `minConfidence` prop to `ProjectionCard`

### Notes

- No new DB queries needed — all 4 players are already fetched in the route
- Threshold of 0.40 corresponds to ~10 matches: `Cn = 1 - e^(-10/20) ≈ 0.39`
- No unit tests required — verify manually with a low-match player

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, you must check it off in this markdown file by changing `- [ ]` to `- [x]`. This helps track progress and ensures you don't skip any steps.

Example:
- `- [ ] 1.1 Read file` → `- [x] 1.1 Read file` (after completing)

Update the file after completing each sub-task, not just after completing an entire parent task.

## Tasks

- [x] 0.0 Create feature branch
  - [x] 0.1 Create and checkout a new branch: `git checkout -b feature/prediction-confidence-treatment`

- [x] 1.0 Expose `minConfidence` from the matchup API
  - [x] 1.1 In `app/api/matchup/route.ts` (section 3.10), add to the JSON response:
        `minConfidence: Math.min(p1.ratingConfidence, p2.ratingConfidence, p3.ratingConfidence, p4.ratingConfidence)`

- [x] 2.0 Add low-confidence visual treatment to `ProjectionCard`
  - [x] 2.1 Add `minConfidence: number` to the `ProjectionCardProps` interface
  - [x] 2.2 Derive `const lowConfidence = minConfidence < 0.40` inside the component
  - [x] 2.3 When `lowConfidence`: prefix the `pct` display with `~` and apply `text-zinc-400` instead of `text-zinc-50`
  - [x] 2.4 When `lowConfidence`: show a callout below the forecast block — `"Low confidence — fewer than ~10 matches on record"` styled `text-xs text-zinc-500`
  - [x] 2.5 In `components/matchups/MatchupsClient.tsx`, pass `minConfidence` from the API response to `<ProjectionCard />`

- [ ] 3.0 Manual verification
  - [ ] 3.1 Test with a player who has fewer than 10 matches — confirm `~` prefix, dimmed number, and callout appear
  - [ ] 3.2 Test with all 4 players having 10+ matches — confirm no dimming or callout
  - [ ] 3.3 Confirm the `Confidence` metric in the sidebar still displays correctly in both cases
