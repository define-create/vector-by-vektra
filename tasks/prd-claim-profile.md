# PRD: Task 10.0 — Profile Setup (Claim or Start Fresh)

## Problem

New users who register and verify their email land on the Command screen with no linked Player record. All stats display "—" and there is no guidance on how to connect to match history or start tracking performance.

## Goal

Surface a one-time profile setup prompt on the Command screen that gives new users two explicit paths:
1. **Claim** an existing shadow profile (match history from before they registered)
2. **Start Fresh** (navigate to Enter; first match submission auto-creates their profile)

Once a Player is linked to the User account the prompt disappears permanently and the normal Command screen renders.

---

## User Flow

### Path A — Claim existing profile

1. User registers, verifies email, signs in
2. Command screen shows `ClaimProfilePrompt` (no stats)
3. User types their display name in the search field
4. Matching **unclaimed** shadow profiles appear (rated, ordered by name)
5. User taps **"This is me"** on the correct row
6. `POST /api/players/{id}/claim` is called
7. On success: `router.refresh()` — Command screen re-renders with linked player stats
8. On 403 (email not verified): inline error "Verify your email before claiming a profile"

### Path B — Start Fresh

1. Same as above through step 2
2. User taps **"Start Fresh →"**
3. Navigates to `/enter`
4. User enters their first match; `POST /api/matches` auto-creates a linked Player using `user.displayName`
5. User returns to Command screen — stats now appear

---

## Scope

### No schema changes
All backend infrastructure was already implemented in task 4.0:
- `POST /api/players/{id}/claim` — fully implemented with all guards
- `POST /api/matches` auto-creates a linked Player when `user.player === null`

### Changes required

| File | Type | Change |
|---|---|---|
| `app/api/players/search/route.ts` | Modify | Add `?unclaimed=true` filter (`userId: null`) |
| `lib/services/command.ts` | Modify | Add `hasPlayer: boolean`, `emailVerified: boolean` to `CommandData` |
| `components/command/ClaimProfilePrompt.tsx` | Create | Claim/Start-Fresh client component |
| `app/(tabs)/command/page.tsx` | Modify | Conditional render of `ClaimProfilePrompt` |

---

## Behaviour Details

- **Search** is debounced 250ms, filters to unclaimed profiles only (`?unclaimed=true`)
- **"This is me"** button shows "Claiming…" while in-flight; disabled during request
- **Email not verified**: search and results still render; error surfaces on claim attempt (403 → inline message)
- **No unclaimed profile found**: message "No unclaimed profiles found for '…'" — user falls through to Start Fresh
- **"Start Fresh →"**: `router.push('/enter')` — no API call, no player created at this step
- **After claim**: `router.refresh()` re-runs the server component; `hasPlayer` is now `true`; normal Command screen renders
- **After first match entry (Start Fresh path)**: next visit to Command shows stats automatically (player was auto-created by `POST /api/matches`)

---

## Out of scope (v1)

- Late claiming after a fresh profile already exists — handled via admin merge (existing admin panel)
- Email re-send from this screen — users should use the verification email received at registration
