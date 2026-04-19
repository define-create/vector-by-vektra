# Reduce Friction in Match Score Entry — Vector by Vektra

## Context

Players using Vector by Vektra during tournaments capture scores as freeform notes in Notes apps or chat threads and transcribe them into the app later. The product owner believes the transcription round-trip costs as much effort as using Vector directly, so it reflects real friction in the current entry flow — not just user laziness.

Both self-serve players and designated scorekeepers/admins capture matches depending on the event, so any solution should work for both modes.

This plan details seven specific directions chosen by the product owner to explore:
1. **SMS / WhatsApp bot** — meet users inside the chat thread they already use
2. **Shared court-session link** — one device per court, scorekeeper-friendly
3. **Voice entry** — capture a match by speaking while still at the court
4. **Paste-a-note importer** — paste freeform match notes, LLM parses into N matches
5. **Apple / Google Watch shortcut** — voice log from the wrist, zero-phone path
6. **Email-to-match** — forward a score email to a dedicated address
7. **Dedicated scorekeeper role** — formalize the event-level "scores person"

All seven are alternative/complementary entry paths. The existing [app/(tabs)/enter/page.tsx](app/(tabs)/enter/page.tsx) flow remains the canonical UI; these add faster or less-frictional ways in.

---

## Current State (from code exploration)

**Entry flow** ([app/(tabs)/enter/page.tsx](app/(tabs)/enter/page.tsx), [app/api/matches/route.ts](app/api/matches/route.ts)):

Minimum 7 interactions per match: Player 1 → Partner → Opponent 1 → Opponent 2 → WIN/LOSS → Team 1 score → Team 2 score → reveal Submit.

**Reusable infrastructure already in the codebase:**
- Player resolution + shadow creation: `findOrCreateShadowPlayer` in [lib/services/players.ts](lib/services/players.ts) — case-insensitive lookup, creates unclaimed profile for unknown names
- Match creation + dedup + auto-outcome: [api/matches/route.ts](app/api/matches/route.ts) lines 144–259
- Event tag autocomplete: [app/api/tags](app/api/tags)
- Admin vs self-serve submission paths: [api/matches/route.ts:144-167](app/api/matches/route.ts#L144-L167)
- Admin edit/void: [app/admin/matches/page.tsx](app/admin/matches/page.tsx)
- 20-minute post-submit edit window: [api/matches/route.ts:365](app/api/matches/route.ts#L365)

**Key gap:** every match is created from scratch (Prisma `Match` has no `scheduledAt`/`round`/`status`), so any new entry path must resolve 4 players + scores, not just "score this pre-existing fixture".

---

## Option A — SMS / WhatsApp Bot

### Concept
Publish a phone number (WhatsApp preferred; SMS as fallback). A player texts their result in freeform: *"Alex & Sam beat Jamie & Taylor 11-7 12-10 #SundayLeague"*. Bot parses → confirms with a short reply → posts match.

### Why it could work for Vector
- **Matches user behavior directly.** They're already writing a text message. We just change the recipient.
- **Zero app open, zero auth flow on the phone** — phone number identifies the sender; match gets attributed via a `playerPhone` lookup.
- **Group chat-friendly.** A tournament group already exists on WhatsApp for many events; a shared "scores" thread converts passive notes into structured records.

### Concrete implementation outline

**Stack choice:** Twilio (supports both SMS and WhatsApp Business API with one webhook). WhatsApp requires a one-time business-account approval; SMS works immediately.

**New code:**
- `app/api/bot/twilio/route.ts` — webhook receiving inbound messages. Validates Twilio signature, returns TwiML.
- `lib/bot/parse-match.ts` — message → structured match. Two strategies:
  - **Grammar-first:** regex for `X (and|&|/) Y (beat|def|d\.|vs) A (and|&|/) B SCORE (SCORE)*` handles the common case.
  - **LLM fallback:** unmatched messages go to a small Claude Haiku prompt grounded on the sender's recent opponents/partners from [api/players/recent](app/api/players/recent). Returns JSON or a clarifying question.
- `lib/bot/resolve-players.ts` — reuses `findOrCreateShadowPlayer`. Name ambiguity → reply asks the sender to pick.
- Schema additions to [prisma/schema.prisma](prisma/schema.prisma):
  - `Player.phoneE164` (optional, unique) — so a sender maps to a player
  - `BotInbound { id, from, body, status, matchId?, createdAt }` — audit log + retry handle

**Conversation shape (happy path):**
```
User: Alex & Sam beat Jamie & Taylor 11-7 12-10 #Sunday
Bot:  Got it. Alex+Sam d. Jamie+Taylor 11-7, 12-10 (#Sunday). Reply OK to post or EDIT to change.
User: OK
Bot:  Posted. Edit here: <short link to /enter/edit/[id]>
```

**Conversation shape (ambiguity):**
```
User: jamie beat me and taylor 11-9 11-7
Bot:  Two Jamies — Jamie K or Jamie O? Reply 1 or 2.
```

**Auth:** sender's phone must be registered. First message from an unknown number replies with a one-line claim link: `app.vektra/link?token=<…>` → logged-in user confirms → number bound to their player.

### Effort
- **Baseline (SMS only, grammar parser, single-match):** ~1 week — webhook, parser, Twilio account, phone-claim flow, 3 schema fields.
- **With WhatsApp + LLM fallback:** +3–5 days — WhatsApp Business approval (external wait) and Claude Haiku integration with Vector's active-players context for disambiguation.

### Risks
- **Name collision** — two "Alex"es in the same league will bounce a lot of messages. Mitigation: bot replies with numbered options; grounds the LLM fallback on the sender's recent players.
- **Cost** — Twilio per-message cost is low but non-zero; caps belong in settings.
- **WhatsApp template restrictions** — outbound WhatsApp messages outside a 24-hour user-initiated window require pre-approved templates. Design keeps replies inside that window.

---

## Option B — Shared Court Session

### Concept
At tournament start, admin creates a "court session" (one per court, or one per event). Each yields a short URL + QR. One device per court stays on that URL all day. Anyone can tap "Log match" → compact form narrowed to "players seen at this court today" → submit. No login required on the shared device; the session token attributes submissions.

### Why it could work for Vector
- **Matches the scorekeeper-entry mode explicitly** — one phone at the desk, one person working through matches between rounds.
- **Removes login friction** on a borrowed/club device.
- **Context pre-fills everything** — event tag, court, date are implicit from the session. Entry collapses to "pick 4 players + type 2 scores".
- **Player picker becomes short** — narrowed to ~10–20 names instead of the full DB, so selection is visual, not a search.

### Concrete implementation outline

**Schema additions** ([prisma/schema.prisma](prisma/schema.prisma)):
- `CourtSession { id, token (unique), label, tag?, createdBy (userId), expiresAt, createdAt }`
- `CourtSessionPlayer { sessionId, playerId }` — backing set for the narrowed picker, populated as matches accumulate (any player entered in this session gets added)
- `Match.courtSessionId?` (optional FK) — attribute entry source

**New routes:**
- `app/admin/court-sessions/page.tsx` — admin creates/lists sessions, shows QR + short link + expiry
- `app/court/[token]/page.tsx` — public (token-gated) entry surface; renders a simplified version of the `/enter` UI
- `app/api/court-sessions/route.ts` (POST create, GET list, DELETE expire)
- `app/api/court-sessions/[token]/players/route.ts` — narrowed player list for the picker (union of session players + sender's tournament recents)
- `app/api/matches/route.ts` — extend to accept `courtSessionToken` as an auth alternative to user session; attributes `enteredBy` to the session's `createdBy`

**UI reuse:** the `/court/[token]` page is essentially `/enter` with:
- No auth required (token in URL)
- Player picker defaults to `CourtSessionPlayer` list (large tap targets, no search until overflow)
- Event tag pre-filled from `CourtSession.tag`
- "Log another match" stays on the same page after submit

**Security:** token is unguessable + short-lived (default 24h, admin can extend). Rate-limited. Admin can revoke. `enteredBy` is always the session creator, so audit trail stays clean.

### Effort
- ~1 week. No external services; all in-app. The player picker reuse is the main savings.

### Risks
- **Device left open** — someone enters a bogus match. Mitigation: 20-minute edit window already exists; admin match edit/void already shipped ([admin/matches/page.tsx](app/admin/matches/page.tsx)).
- **Shadow profile explosion** — narrowed picker still needs a "new player" path. Reuses existing `findOrCreateShadowPlayer`, so duplicate-shadow mitigation already applies.
- **Overlap with PWA/quick-entry work** — if Tier 1 quick-entry ships first, the court page effectively *is* that screen with a token auth. Consider sequencing: ship Quick Match first, then layer session auth on top.

---

## Option C — Voice Entry

### Concept
On the `/enter` screen, a "Hold to speak" button. User holds, says *"Alex and Sam beat Jamie and Taylor eleven seven twelve ten"*, releases. Audio → transcript → LLM parse grounded on the active player list → review screen pre-filled → confirm.

### Why it could work for Vector
- **Captures the thing that's already happening** — players say the score out loud right after the match. Voice entry turns speech that was going to happen anyway into a record.
- **Hands-free while walking off court.**
- **Best for the self-serve player path** where they'd otherwise open Notes and type.

### Concrete implementation outline

**Transcription choice:**
- **Browser `SpeechRecognition` (Web Speech API):** free, on-device on most browsers, instant. Chrome-backed only (Safari partial). Good first pass.
- **Whisper API (OpenAI) or Deepgram:** more accurate on proper nouns / accents, paid, adds latency. Recommend fallback.

**Parse choice:**
- Claude Haiku with a system prompt containing:
  - The senders's recent partners + opponents (from [api/players/recent](app/api/players/recent))
  - A JSON schema: `{team1: [p1, p2], team2: [p3, p4], games: [[s1,s2], ...]}` or `{clarify: string}`
  - Instruction to bias player names toward the grounded list (reduces "Jamey" vs "Jamie" errors)

**New code:**
- `components/VoiceEntryButton.tsx` — press-and-hold mic UI, waveform, cancel-on-release-up
- `lib/voice/transcribe.ts` — abstracts Web Speech vs Whisper
- `lib/voice/parse.ts` — Claude Haiku call with grounded prompt
- `app/api/voice/parse/route.ts` — server endpoint (keeps API keys server-side)
- Small review screen on `/enter` that pre-fills the existing form state from the parsed JSON — user confirms or edits one field, submits through the existing `/api/matches` flow

**Reuse:** the parsed JSON feeds the *existing* match form state. No new match-creation API needed. Duplicate detection, shadow creation, auto-outcome all apply unchanged.

### Effort
- **Baseline (Web Speech only, Haiku parser, self-serve only):** ~1 week.
- **With Whisper fallback + multi-accent testing:** +3–5 days.

### Risks
- **Noise at venues** — music, crowd, cheering. Test with real recordings before shipping; likely needs Whisper fallback, which adds latency (~2–4s round-trip).
- **Name hallucination** — LLM may invent players not in the league. Mitigation: grounding prompt on player list + strict review screen (user must confirm every name, not just scores).
- **Cost per entry** — Haiku is cheap, but uncapped usage should have a per-user daily cap.
- **Privacy** — inform users that audio leaves their device if Whisper is used; don't store raw audio server-side.

---

## Option D — Paste-a-Note Importer

### Concept
A new `/import` route with a single large textarea. User pastes freeform text copied from Notes / WhatsApp / iMessage — *"Alex & Sam d. Jamie & Taylor 11-7, 11-9 #Sunday. Then Mike & Kate d. Alex & Sam 11-8, 9-11, 11-6."* — and gets a review screen with one card per detected match. Confirm all → bulk create.

### Why it could work for Vector
- **Targets the observed behavior directly.** The user explicitly described players writing scores as notes for later entry. This reclaims that exact artifact instead of fighting it.
- **High leverage per session.** One paste → 5–20 matches. The per-match cost drops dramatically once the paste is structured.
- **No new external infra.** Runs entirely within Vector.

### Concrete implementation outline

**New code:**
- `app/(tabs)/import/page.tsx` — NEW route. Large textarea, "Parse" button → review step with one editable card per match, global "Submit all" / individual skip/edit.
- `lib/import/parse-notes.ts` — Claude Haiku call with the sender's recent partners/opponents as grounding context (from [api/players/recent](app/api/players/recent)). Returns `{ matches: Match[], unparsed: string[] }`.
- `app/api/import/parse/route.ts` — server endpoint (keeps API key server-side, rate-limits per user).
- `app/api/matches/bulk/route.ts` — NEW. Accepts an array of matches, runs each through the same creation path as [api/matches/route.ts](app/api/matches/route.ts), returns per-item success/duplicate/error.

**Reuse:** each parsed match feeds the existing match creation flow — `findOrCreateShadowPlayer`, duplicate fingerprint detection, auto-outcome. No schema change.

**Review UI behavior:**
- Each card shows resolved players (with a small "change" button to re-pick if the LLM got the wrong Alex), detected games, detected tag
- Duplicate detection runs at review time (not submit) so the card shows "already logged" inline
- "Submit all confirmed" batches the remaining ones

### Effort
- **Baseline (textarea + Haiku + bulk endpoint):** ~4–5 days.
- **With streaming review (matches appear as parse progresses):** +2 days.

### Risks
- **Name ambiguity compounds** in batches of 10+ matches. Mitigation: grounding on sender's active players; review screen must surface every player pick, not hide behind an auto-accept.
- **LLM cost on big pastes** is non-trivial. Cap input length; reject pastes over ~5k chars with a helpful error.
- **User paste formats vary wildly** — scores with dashes vs commas, name order varying, winner-first vs team-home-first. The Haiku prompt must explicitly list accepted and ambiguous patterns; show the raw text alongside the parsed result so users can spot-check.

---

## Option E — Apple / Google Watch Shortcut

### Concept
Wrist-based voice logging. On Apple Watch: a Siri Shortcut ("Hey Siri, log Vector match") prompts for a single spoken sentence, POSTs to Vector's voice endpoint, returns a haptic + summary complication. On Wear OS: a Google Assistant app action or tile with equivalent flow.

### Why it could work for Vector
- **Zero-phone entry.** Players already wear watches at tournaments (especially for HR tracking). Speaking into the wrist is less socially awkward than pulling out a phone and opening an app.
- **Builds on Option C.** Reuses the same transcribe + Haiku parse endpoint — the watch is just a new client.
- **Narrow but real audience.** A material fraction of competitive players wear Apple Watches; the friction drop for them is substantial.

### Concrete implementation outline

**Reuses from Option C:**
- `lib/voice/parse.ts` + `app/api/voice/parse/route.ts` — same server-side parse path
- Haiku prompt grounded on player list

**New code:**
- `app/api/watch/log/route.ts` — NEW. Accepts `{ transcript: string, userToken: string }`, returns `{ status, summary, matchId? }`. Server-side token (generated on phone, displayed as QR for the watch shortcut to ingest).
- Apple: an `.shortcut` file distributed via a deep link; user adds once. The shortcut dictates text → HTTPS POST → Siri speaks back the summary.
- Android: a Wear OS tile + Assistant action. Heavier lift — needs a small companion APK or a web intent handler.

**No in-app code for the watch itself** — the Apple Shortcut is data+URL, not a compiled app. Android requires more work but an MVP can be a Google Assistant Action pointing at the same endpoint.

**Auth:** per-user bearer token generated in settings. Rotates on demand. No OAuth flow on the watch.

### Effort
- **Apple Shortcut MVP (relies on Option C infra):** 2–3 days on top of Option C.
- **Android Wear tile / Assistant action:** +1–2 weeks (requires a small native artifact).
- **Without Option C:** add Option C's effort (~1 week) first.

### Risks
- **Dependency on Option C** — building Watch support standalone is wasteful; wait until voice is proven.
- **Small audience** — validate watch ownership among active users before investing beyond the Apple Shortcut MVP.
- **Error recovery is poor** — if the LLM misparses, the watch UI can't render a full review screen. Design the reply to be terse and require an explicit "confirm on phone" for anything ambiguous.
- **Assistant action review** — Google/Apple shortcut directories have their own approval latency if Vector wants discoverability.

---

## Option F — Email-to-Match

### Concept
Each user gets a personal write-only email address like `log+<token>@mail.vektra.app`. Forward any email containing score text to it (or compose directly) → server parses → creates match. Confirmation replies from the parser address.

### Why it could work for Vector
- **Universal client.** Every phone has a mail app; no install, no login.
- **Great for batch recap emails.** Tournament organizers often send round-up emails; forwarding one populates many matches at once.
- **Zero ongoing per-message cost** (unlike SMS).

### Concrete implementation outline

**Inbound mail choice:**
- **SendGrid Inbound Parse** or **Postmark inbound** — cheapest route, sets MX on a subdomain, POSTs parsed messages to a webhook.
- Recommend a dedicated subdomain (`mail.vektra.app`) to isolate reputation from the main domain.

**New code:**
- `app/api/mail/inbound/route.ts` — NEW webhook. Validates provider signature, extracts `to` (→ token → user), `from` (audit), `text`/`html` body, `subject`. Strips reply quotes and forwarded-email chrome.
- `lib/import/parse-notes.ts` — SHARED with Option D. Email body → matches[]. Already handles multi-match text.
- `Player.mailToken` (unique string) in [prisma/schema.prisma](prisma/schema.prisma) — or a separate `MailToken { token, playerId, createdAt, revokedAt }` table for easier rotation.
- Settings page row: "Your logging address: `log+xyz@mail.vektra.app`" with a copy button + a rotate button.

**Confirmation flow:**
- Parser replies with a short summary + links: `View: /match/<id>` and `Edit: /match/<id>/edit`.
- If ambiguous, parser replies with a numbered list and asks the user to re-send with a clarifier line.

**Security:**
- Token is unguessable; rotate on demand.
- `from` address must match the user's claimed email on first use, then allow-listed.
- Rate-limit per token to cap abuse.

### Effort
- **Baseline (inbound webhook, parser reuse, token model, reply):** ~4–5 days **if Option D has shipped** (parser is shared). Standalone: ~1 week.

### Risks
- **Deliverability & spam.** Inbound is easier than outbound but replies need SPF/DKIM on the send domain. Plan a warm-up period.
- **Forwarded-email noise.** Mail apps add signatures, previous-message chrome, disclaimers. The parser prompt must explicitly ignore those blocks.
- **Token leakage.** If a user's address ends up in a public thread, abuse is easy. Mitigation: immediate rotate from settings; allow-list of sender addresses per token.

---

## Option G — Dedicated Scorekeeper Role

### Concept
A third user role between `player` and `admin`: `scorekeeper`. A scorekeeper can enter and edit matches on behalf of anyone within a specified scope (an event tag, a date range, or a specific court session), without the full admin powers of editing players, events, or ELO mechanics. Formalizes the person who already does this informally at every tournament.

### Why it could work for Vector
- **Reflects real-world roles** — tournaments already have a "scores person" at the desk. Vector currently forces them to be full admin or to enter as themselves + trust the edit window.
- **Unblocks Options B / D / F for non-admins** — a scorekeeper running a court session, pasting a recap, or emailing in match text needs the authority to attribute matches to other players without being a full admin.
- **Auditability** — every match gains a clear "entered by scorekeeper X on behalf of Y" trail, separating attribution from authoring.

### Concrete implementation outline

**Schema** ([prisma/schema.prisma](prisma/schema.prisma)):
- `User.role` — existing field; add `"scorekeeper"` to the role union. See [CLAUDE.md](CLAUDE.md) guidance: **must run `npx prisma generate` after changing the enum**, and update `app/generated/prisma/internal/class.ts` inlineSchema via regeneration.
- `ScorekeeperScope { id, userId, tag?, startAt?, endAt?, courtSessionId? }` — scope assignments. Empty scope = any event (rarely used; prefer tag-scoped).
- `Match.enteredBy` / `Match.enteredOnBehalfOf` — existing `enteredBy` stays; add `enteredOnBehalfOf` (optional `Player` FK) to record the subject when scorekeeper acts.

**New code:**
- `lib/auth/can-enter-match.ts` — authorization helper returning `{ allowed, attribution }` given a user + target players + event tag. Rules:
  - `admin` — always allowed
  - `scorekeeper` — allowed iff target's event tag / date / court matches an active `ScorekeeperScope`
  - `player` — allowed only if they're one of the 4 players (current behavior)
- `app/api/matches/route.ts` — call the helper before creation; record `enteredBy` + `enteredOnBehalfOf`.
- `app/admin/scorekeepers/page.tsx` — admin UI to assign/revoke scopes.
- `app/enter/page.tsx` — scorekeepers see the existing admin-mode toggle (all 4 players explicit) without needing full admin role.

**Audit:**
- Admin match list ([admin/matches/page.tsx](app/admin/matches/page.tsx)) shows "by Scorekeeper X" badge next to entries done on behalf of others.
- Scorekeeper actions log to the same audit trail as admin.

### Effort
- ~1 week. Mostly authorization plumbing + a small admin UI. The match creation path already distinguishes admin vs self-serve; this adds a third branch.

### Risks
- **Scope creep of the role** — keep it narrow (match entry + edit within scope, nothing else). Resist the temptation to let scorekeepers merge players or edit events; those stay admin-only.
- **Enum/schema regeneration gotcha** — explicitly documented in [CLAUDE.md](CLAUDE.md): role enum changes must trigger `npx prisma generate`. Tests should fail loudly if this is skipped.
- **Not valuable standalone** — the role unlocks *other* options (B/D/F) for non-admins, but by itself it just lets one more category of user do what admins already can. Sequence it alongside whichever channel option(s) ship.

---

## Comparison

| | A: SMS/WhatsApp | B: Court session | C: Voice | D: Paste-a-note | E: Watch | F: Email-to-match | G: Scorekeeper role |
|---|---|---|---|---|---|---|---|
| Primary user | Self-serve player | Scorekeeper / admin | Self-serve player | Self-serve or scorekeeper | Self-serve player | Self-serve or scorekeeper | Scorekeeper |
| Where entry happens | Chat thread | Shared venue device | In app, at court | In app, later | On wrist | In mail app | In app |
| New infra | Twilio | None | Claude API (+Whisper) | Claude API | Depends on Option C | Inbound-mail provider | None |
| Recurring cost | Per-message | None | Per-entry LLM | Per-paste LLM | Same as C | Near-zero | None |
| Schema change | `Player.phoneE164`, `BotInbound` | `CourtSession`, `CourtSessionPlayer`, `Match.courtSessionId` | None | None | None | `Player.mailToken` (or `MailToken`) | `role` enum, `ScorekeeperScope`, `Match.enteredOnBehalfOf` |
| Effort (baseline → full) | 1 → ~1.5 wk | ~1 wk | 1 → ~1.5 wk | ~4–5 d | +2–3 d on C (Apple); +1–2 wk (Android) | ~4–5 d after D; ~1 wk standalone | ~1 wk |
| Biggest risk | Name ambiguity, WhatsApp wait | Token abuse | Noise, hallucination | Paste format variance | Depends on C, small audience | Token leakage, forwarded-email noise | Scope creep, enum regen gotcha |
| Works offline | Yes (carrier queue) | No | No | No | No | Yes (mail client queues) | N/A |
| Enables other options | — | Host for others | Powers E | Powers F (shared parser) | Consumes C | Consumes D's parser | Unlocks B/D/F for non-admins |

---

## Recommended order (if all seven are in scope)

Sequenced so each option's infra feeds the next:

1. **Option D — Paste-a-note importer.** Highest behavior-match value, no external deps, no schema change. Directly intercepts the exact Notes-app behavior described. Also builds the shared note-parser that Options F (email) and A (bot LLM fallback) will reuse. **Ship first.**
2. **Option G — Scorekeeper role.** Small, unlocks non-admin usage of B/D/F. Worth doing early so later channels don't hardcode "admin only" and need rework.
3. **Option B — Shared court session.** Fully in-app, serves the scorekeeper-at-the-desk mode directly. Benefits from G being in place so session creators aren't required to be full admins.
4. **Option A — SMS/WhatsApp bot.** Highest potential reach but requires external account + (for WhatsApp) business approval. SMS subset ships first; WhatsApp follows when approval lands. Reuses D's parser as the LLM fallback.
5. **Option F — Email-to-match.** Cheap add once D's parser exists. Provides a universal fallback channel for users who don't want to use SMS/WhatsApp.
6. **Option C — Voice entry.** Novel and useful but highest execution risk (noise, hallucination). Worth validating only after earlier options reveal whether residual friction is about *channel* or about *speed of in-app entry*.
7. **Option E — Watch shortcut.** Pure extension of C. Build only after C proves out, and only if usage data shows watch-heavy users.

Reuse chain: D's parser → F, A (fallback), review UIs across the board. C's endpoint → E. G unblocks non-admin usage of B, D (when entering on behalf), F.

---

## Critical files

**Shared across options:**
- [app/api/matches/route.ts](app/api/matches/route.ts) — match creation; extend auth handling for Options A and B
- [lib/services/players.ts](lib/services/players.ts) — `findOrCreateShadowPlayer` reused by all three
- [app/api/players/recent](app/api/players/recent) — grounding data for bot LLM fallback and voice parser
- [prisma/schema.prisma](prisma/schema.prisma) — schema changes for A and B (remember: `npx prisma generate` after edits, migrations run via Supabase SQL editor per [CLAUDE.md](CLAUDE.md))

**Option A (bot):**
- `app/api/bot/twilio/route.ts` — NEW
- `lib/bot/parse-match.ts`, `lib/bot/resolve-players.ts` — NEW
- Twilio account + webhook URL

**Option B (court session):**
- `app/admin/court-sessions/page.tsx` — NEW
- `app/court/[token]/page.tsx` — NEW (reuses much of [app/(tabs)/enter/page.tsx](app/(tabs)/enter/page.tsx))
- `app/api/court-sessions/route.ts`, `app/api/court-sessions/[token]/players/route.ts` — NEW

**Option C (voice):**
- `components/VoiceEntryButton.tsx`, `lib/voice/transcribe.ts`, `lib/voice/parse.ts` — NEW
- `app/api/voice/parse/route.ts` — NEW
- Claude API key in server env (+ optional Whisper key)

**Option D (paste-a-note):**
- `app/(tabs)/import/page.tsx` — NEW
- `lib/import/parse-notes.ts` — NEW (shared with F)
- `app/api/import/parse/route.ts`, `app/api/matches/bulk/route.ts` — NEW

**Option E (watch):**
- `app/api/watch/log/route.ts` — NEW
- Apple Shortcut `.shortcut` artifact + deep link
- (Android) small Wear OS tile or Assistant action

**Option F (email-to-match):**
- `app/api/mail/inbound/route.ts` — NEW
- Reuses `lib/import/parse-notes.ts` from D
- Inbound-mail provider (SendGrid Inbound Parse or Postmark); MX on `mail.vektra.app`
- Settings UI row in existing user settings page for the logging address + rotate

**Option G (scorekeeper role):**
- [prisma/schema.prisma](prisma/schema.prisma) — add `"scorekeeper"` to role enum, `ScorekeeperScope` model, `Match.enteredOnBehalfOf`
- `lib/auth/can-enter-match.ts` — NEW authorization helper
- `app/admin/scorekeepers/page.tsx` — NEW admin UI
- Update [api/matches/route.ts](app/api/matches/route.ts) to call the helper
- **Remember `npx prisma generate`** per [CLAUDE.md](CLAUDE.md) — enum change needs client regeneration

---

## Verification

**Option A (bot):**
- Send a message from a registered number — match appears in DB within 5s, confirmation reply arrives
- Send from an unregistered number — receive claim link, complete flow, retry succeeds
- Send ambiguous names — receive disambiguation prompt; reply with number — correct resolution
- Test TwiML signature validation by sending a forged request (should reject)

**Option B (shared session):**
- Admin creates a session, scans QR on a test device — lands on entry screen without login
- Enter 3 matches in a row — narrowed player picker grows correctly; matches attributed to admin in audit
- Let session expire — URL should refuse new entries
- Admin revokes mid-day — active tabs lose ability to submit

**Option C (voice):**
- On Chrome mobile, record a clean "A and B beat C and D eleven seven" — review screen pre-filled correctly
- Record with realistic venue noise — measure error rate on player names; if >20%, enable Whisper fallback
- Record a malformed utterance — review screen shows clarify state, not a bogus match
- Confirm audio is never persisted server-side

**Option D (paste-a-note):**
- Paste a multi-match note (5+ matches, mixed separators) — review screen shows one card per match, resolved players, detected scores
- Include a known duplicate — card surfaces "already logged" inline without blocking submit of the others
- Paste a malformed block with 2 unparseable lines — `unparsed[]` surfaces those lines; valid matches still submittable
- Bulk submit — all non-duplicates created; per-item statuses returned correctly

**Option E (watch):**
- Add the Apple Shortcut via the deep link; run it — voice prompt appears, POST hits `/api/watch/log`, haptic + spoken summary returns
- Speak an ambiguous utterance — response asks user to confirm on phone with a deep link
- Rotate the watch token in settings — old token stops authenticating immediately

**Option F (email-to-match):**
- Send an email to the personal logging address — match created within ~30s, confirmation reply received
- Forward a tournament recap email containing 5 matches — 5 matches created, reply summarizes each
- Send from a non-allow-listed address — rejected with a reply explaining how to claim
- Rotate token — old address stops working; new address works

**Option G (scorekeeper role):**
- Create a user with `scorekeeper` role, scope to a specific tag — they can submit a match under that tag with all 4 players chosen explicitly; attempt outside the tag is rejected
- Verify admin match list shows "by Scorekeeper X on behalf of Y" for scopekeeper-entered matches
- Remove a scorekeeper's scope mid-session — their active tabs lose submit capability
- After schema change: confirm `npx prisma generate` was run and `app/generated/prisma/internal/class.ts` contains the new role (per [CLAUDE.md](CLAUDE.md))
