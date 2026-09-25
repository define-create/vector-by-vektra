# PRD: Phase 0 — Core Loop (Recap + Keeper Entry + Tracking)

**Governing plan:** `docs/vector-by-vektra-plan-v6.1.md` (Phase 0)
**Status:** Draft for review
**Date:** 2026-06-11

## 0. Decisions already made (recorded 2026-06-11)

| Decision | Choice |
|---|---|
| Rating engine | Keep ELO v2; OpenSkill mandate dropped (bake-off: `docs/rating-engine-bakeoff.md`) |
| Identity model | **Global Player identity + GroupMembership** (membership carries per-group rating, matchCount, role); never player-row-per-group |
| Existing history | Migrates into Group #1; per-group ratings equal current ratings (single group ⇒ no rating-change event) |
| Migration precondition | Duplicate shadow profiles merged **before** migration |
| Recap visibility | **Unlisted by default**: unguessable tokenized link, `noindex`, no public directory, no login required. Group-level setting reserved (`LINK_ONLY` default; `MEMBERS_ONLY` later) |
| Retroactive privacy | Per-player display preference (nickname/initials/anonymous) offered as player choice; conservative defaults for unclaimed/guest profiles; minors/guests always anonymous on recaps |
| Pre-season history | Career stats / archive; **no retroactive fake seasons** |

## 1. Gap analysis — plan v6.1 Phase 0 vs codebase

### Reuse as-is
| Plan needs | Exists today |
|---|---|
| Rating engine + win probability | `lib/rating-engine/` (validated); `expectedScore` already powers Matchups |
| Text entry (keeper fast path) | `MatchTextInput` + `lib/import/parse-match` |
| Recent-players chips, edit-in-place, duplicate-match warning, default tag | Enter screen (`app/(tabs)/enter/`) |
| Duplicate shadow cleanup | `api/admin/players/duplicates` + `merge` endpoints (run before migration) |
| Claim flow (future guest claiming) | `app/invite/[token]`, `api/players/[id]/claim` |
| Raw-results-as-source-of-truth + replay | `lib/rating-engine/replay.ts`, recompute service — plan rule #6 already true |

### Adapt
| Plan needs | Exists today | Adaptation |
|---|---|---|
| Unlisted recap link + open tracking | `MatchupShare` pattern: hashed token, public `api/share/[token]`, snapshot JSON, `viewCount`; page at `app/s/[token]` | Same pattern, new `Recap` model; add `noindex` |
| Session + top-3-of-the-night | Events concept: `getEventData(tag)` leaderboard (wins, h2h tie-break), `Podium`/`LeaderboardTable` components, default tag per night | Session = Event; recap consumes the same computation; scope tags per group |
| Recap image | `api/og/matchup` OG image generation | New recap template, same mechanism |
| Score entry < 15 s/game | Enter screen + active UX goal (`tasks/goal-enter-match-ux.md`, v3 mockups) | Re-aim goal criteria to keeper terms |
| Per-player display control | `api/players/me/display-name`, `me/preferences` | Add display-mode preference (full/nickname/initials/anonymous), applied on recap surfaces |
| Nightly recompute | Global `CommunityStats`, cron recompute | Scope per group |

### Build (does not exist)
| Item | Notes |
|---|---|
| `Group` + `GroupMembership` models | **Phase 0 requires this** — the plan tests 4–6 groups, so minimal multi-tenancy cannot wait for Phase 1. Membership carries per-group rating, matchCount, role (`KEEPER`/`MEMBER`), display preference |
| Migration script | Create Group #1, backfill memberships from existing players/matches, stamp `groupId` on matches. Idempotent SQL via Supabase editor |
| Recap generation | Per (group, session); see FR-3 |
| Recap page + image | Public token page; see FR-4 |
| Tracking view | opens ÷ participants per group-week; attendance per player; see FR-6 |

### Drop / explicitly Phase 1+ (not in this PRD)
Seasons & two-layer scoring · game scores · awards · payments/Patron/Stripe · dispute flow · tone setting · keeper promotion UX (Phase 0: keeper = the group's sole account) · "Start this for your group" button · individual premium · `MEMBERS_ONLY` gating (schema enum only).

## 2. Goals

1. A keeper can log a session and the group receives a shareable recap link + image that works with no login.
2. Recap engagement is measurable as opens ÷ session participants.
3. 4–6 groups can run simultaneously without seeing each other's data.
4. Existing Group #1 history survives intact — same ratings, same stats.

**Non-goals:** everything in the Drop list; per-user tracking tokens; recap personalization.

## 3. Functional requirements

### FR-1 Minimal multi-tenancy
- `Group { id, name, visibility: LINK_ONLY (default) | MEMBERS_ONLY, createdAt }`
- `GroupMembership { groupId, playerId, role: KEEPER | MEMBER, rating, ratingConfidence, ratingVolatility, matchCount, winPct, joinedAt }` — the per-group fields move here from `Player`; `Player` keeps identity (userId, displayName, claim state)
- `Match.groupId` (required after backfill)
- Recompute, snapshots, stats, recent-players, matchups: scoped by group
- Phase 0 admin remains the app-global admin; each group gets exactly one keeper account at creation

### FR-2 Migration (one-time, gated)
1. Merge duplicate shadow profiles (existing admin panel) — human-verified
2. Create Group #1; backfill memberships (copy current rating fields), stamp all matches
3. Full recompute; assert per-group ratings == pre-migration ratings (write the assertion into the script)

### FR-3 Session recap generation
- A **session** = an **Event** (the existing tag concept) — decided 2026-06-11. The Enter screen's
  default tag ("MM/DD · Name") already labels each night, so every session has an Event with no
  extra keeper work. No new session model.
- **Top 3 of the night = the existing Event podium**: reuse `getEventData(tag)`
  (`lib/services/events.ts`) — ranked by wins with head-to-head tie-breaking — and the
  `Podium`/`LeaderboardTable` components (`components/events/`). The recap and the Stats → Events
  screen can never disagree because they share one computation.
- Trigger: **explicit "End session" button** (keeper) → generates the recap for that Event, with an
  edit window before sharing. Decided 2026-06-11 (over auto-generation at day close).
- Additional contents beyond the podium: Player of the Night, one rotating highlight stat
  (biggest upset via `expectedScore`, streak, most games, first-timer welcome)
- Edge case: matches under a different/missing tag that night belong to whichever Event they're
  tagged with (or none); the recap covers exactly one Event's matches
- **Invariant (decided 2026-06-11): Events are orthogonal to Seasons.** Seasons (Phase 1) will rank
  all group games inside the season window regardless of Event tags; Events keep working exactly
  as today. Nothing built for this PRD may couple recap/Event logic to future season boundaries
- **Hard rules:** never name lowest-ranked players; positive stats only; guests/possible minors anonymous, no claim option; display preferences (FR-5) applied

### FR-4 Recap surface
- `Recap { id, groupId, sessionDate, tokenHash, snapshotJson, openCount, createdAt }` — mirrors `MatchupShare`
- Public page `app/r/[token]`: no auth, `noindex,nofollow`, OG image via new `api/og/recap` template so the image alone carries top 3 + Player of the Night
- Every open increments `openCount` server-side (page load = open; approximate by design)

### FR-5 Display preferences
- Player-level display mode: `FULL_NAME | NICKNAME | INITIALS | ANONYMOUS`
- Claimed players: self-serve via existing preferences route; defaults `FULL_NAME` (they see a one-time notice when their group's first recap is created)
- Unclaimed (shadow) players: keeper-set, default `FULL_NAME` in-app but keeper confirms the roster display once before the group's first recap ships
- Guests: always `ANONYMOUS` on recaps, not configurable

### FR-6 Tracking (Phase 0 gate instrumentation)
- Per group-week: recap `openCount` ÷ distinct session participants — the plan's ≥ 0.5 gate
- Attendance per player per session (derived from match participation)
- Surfaced on a simple keeper/admin page; no per-user tokens, no external analytics

### FR-7 Keeper entry (delegated)
- Continues under `tasks/goal-enter-match-ux.md`; success criteria re-aimed to: median < 15 s/game, one-handed phone use, sunlight-readable contrast, session-roster prefill (chips seeded from tonight's earlier matches)

## 4. Success metrics (= plan Phase 0 gates)
- ≥3 keepers logging 4+ consecutive weeks unreminded (≥1 at an unknown venue)
- Recap opens ÷ participants ≥ 0.5, not declining
- Attendance stable across skill tiers
- Guest-frequency data collected (feeds Phase 1 dampening tuning)

## 5. Open questions
1. ~~Recap trigger~~ — ANSWERED 2026-06-11: explicit "End session" button + keeper edit window (folded into FR-3).
2. Group creation for the 4–6 test groups: admin-only script/page is fine for Phase 0 — confirm.
3. ~~"Top 3 of the night" metric~~ — ANSWERED 2026-06-11: reuse the Events podium (`getEventData` ranking) (folded into FR-3).
4. Does the existing `/match/[id]` public page need group scoping review at migration time?
5. NEW (from the Events decision): `getEventData` is currently group-agnostic — when multi-tenancy lands, Event tags must be scoped per group (two groups using tag "Club Night" must not collide). Covered by FR-1's "scoped by group" but called out because tags are free-text.

## 6. Suggested build order (tracer bullets)
1. FR-1 schema + FR-2 migration (behind the duplicates-merge gate)
2. FR-3/FR-4 recap end-to-end for Group #1 (generation → token page → image)
3. FR-6 tracking page
4. FR-5 display preferences
5. Group creation for test groups 2–6
