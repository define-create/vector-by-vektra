# PRD: Review-Before-Done Hook and Skill

## 1. Introduction / Overview

Code changes made during AI-assisted development have repeatedly broken existing features in non-obvious ways. The most recent example: commit `9169400` ("Improved screen loading and app responsiveness overall") removed `router.refresh()` from the Enter Match submit handler. Nothing in the local diff *looked* wrong, but a distant feature — the recent-players chip strip — silently broke and went undetected for weeks because that chip strip relied on the post-submit route revalidation to stay current.

This is a class of bug, not a one-off: a change directly modifies one thing and indirectly breaks another. Type checks, lints, and unit tests do not catch it because the local change is syntactically and behaviorally correct *in isolation*.

**Goal:** Introduce a lightweight, automated nudge-plus-review workflow that runs whenever the AI coding partner (Claude Code) finishes a turn with uncommitted code changes. The workflow forces an explicit impact analysis — *what depended on the thing I changed, and is that behavior still satisfied?* — before any work is declared done or committed.

**Scope:** A `Stop`-event hook plus a single deliberate-invocation skill, both committed to the repo. No CI, no test suite expansion, no enterprise tooling.

---

## 2. Goals

1. Catch indirect regressions (removed/changed code's dependents, cross-file shape drift, untested UI flow changes) *before* they are committed.
2. Make the review structured and consistent — not a free-form "did you check?" but a procedure with named checks.
3. Minimize friction: trivial edits, plan-file edits, and documentation edits do not trigger the nudge.
4. Be skippable when the user has already verified the changes (explicit bypass mechanism).
5. Be invocable independently of the hook — the skill should work whenever the user (or Claude) chooses to run it.

---

## 3. User Stories

**As the developer working with Claude Code,** I want a mechanical reminder to review changes before declaring a task done, so I don't ship indirect regressions that take weeks to surface.

**As the developer reviewing Claude's work,** I want a structured report — not a wall of prose — that tells me exactly which removed/changed symbols still have live consumers and which UI flows were not manually verified.

**As Claude (the coding partner),** I want clear, codified instructions for what "review before done" means in this repo so I produce consistent, useful reports rather than restating the diff back.

**As the developer making a trivial edit** (comment fix, plan-file update, mockup change), I do not want to be nudged or interrupted.

**As the developer who has already eyeballed the change,** I want to bypass the review for one turn without disabling the mechanism entirely.

---

## 4. Functional Requirements

### 4.1 — Stop Hook Trigger

1. The system **must** install a `Stop`-event hook in `.claude/settings.json` (project-scoped, committed to the repo).
2. The hook **must** execute a PowerShell script at `.claude/hooks/check-uncommitted.ps1`.
3. The hook **must** fire on every Claude-turn end (the `Stop` event's normal cadence).
4. The hook **must** be silent (exit 0, no output) when no nudge is warranted, and **must** emit a Stop-hook block decision (`{ "decision": "block", "reason": "..." }`) when a nudge is warranted.
5. The reason text **must** instruct Claude to invoke the `/review-my-changes` skill before declaring done, and **must** state the bypass mechanism (`$env:CLAUDE_SKIP_REVIEW="1"`).

### 4.2 — Nudge Criteria (when the hook fires)

6. The hook **must** suppress the nudge (exit 0) when `$env:CLAUDE_SKIP_REVIEW -eq "1"`.
7. The hook **must** compute the working-tree diff via `git status --porcelain` and `git diff HEAD`.
8. The hook **must** filter out paths matching any of: `mockups/`, `plans/`, `ai-dev-tasks/`, `.claude/.review-stamp`, or any `*.md` file.
9. After filtering, the hook **must** suppress the nudge when the remaining diff is empty.
10. The hook **must** suppress the nudge when `git diff HEAD --shortstat` reports fewer than **6** total changed lines (trivial-edit threshold; tunable).
11. The hook **must** compute a SHA-1 hash of `git diff HEAD` concatenated with `git status --porcelain` output.
12. The hook **must** suppress the nudge when `.claude/.review-stamp` exists and its contents equal the current hash (review already completed for this exact diff state).
13. When none of the suppression conditions apply, the hook **must** emit the block decision described in §4.1 #4.

### 4.3 — Review Skill

14. The system **must** install a skill at `.claude/skills/review-my-changes/SKILL.md` (project-scoped, committed to the repo).
15. The skill's frontmatter `description` **must** describe when to invoke it (before commit, when the Stop hook nudges, when the user asks to "review changes" or "check before commit").
16. The skill, when invoked, **must** run `git diff HEAD` and `git status --porcelain` to obtain the change set. If empty, the skill **must** report "nothing to review" and stop.

### 4.4 — Check 1: Dependents of Removed/Changed Code (load-bearing)

17. The skill **must** extract from the diff every removed or significantly modified: function call, hook invocation, JSX prop, import, export, renamed symbol, or config key.
18. For each extracted item, the skill **must** grep across `app/`, `components/`, and `lib/` for remaining usages.
19. For each item, the skill **must** state in one sentence: *what behavior depended on this, and is that behavior still satisfied?*
20. This check **must** be the first check performed and the first section reported.

### 4.5 — Check 2: Cross-File Consistency

21. The skill **must** identify whether the diff touches: a TypeScript `type` / `interface`, a Zod schema, an API route's request or response shape, or a shared constant.
22. For each such item, the skill **must** grep for consumers and verify the shape still matches.
23. The skill **must** flag any mismatch in the report.

### 4.6 — Check 3: Manual UI Verification Gaps

24. When the diff touches `app/` or `components/`, the skill **must** list the user-facing routes/components downstream of the change.
25. For each route/component, the skill **must** state explicitly one of: "manually verified", "not verified — recommend checking X", or "covered by jest test Y".
26. The skill **must not** invent verification it did not perform. Honest "not verified" is required over false reassurance.
27. The skill **must** skip this check entirely when the diff touches only `lib/`, `prisma/`, or test files.

### 4.7 — Structured Report Output

28. The skill **must** output a report in the following structure:
    ```
    ## Review report
    ### Removed / changed symbols
    - <symbol> in <file>
      - Dependents: <list>
      - Verdict: <safe | needs verification | broken>
    ### Shape drift
    - <list or "none">
    ### UI flows touched
    - <flow>: <verification status>
    ### Overall
    - <safe to commit | needs fixes | needs manual verification>
    ```
29. The skill **must not** pad sections with content unrelated to the diff.

### 4.8 — Stamp Mechanism (prevents re-nudging)

30. After producing the report, the skill **must** write the SHA-1 hash of `git diff HEAD` concatenated with `git status --porcelain` to `.claude/.review-stamp`.
31. `.claude/.review-stamp` **must** be added to `.gitignore`.
32. Any subsequent file edit changes the hash, naturally invalidating the stamp — no manual clearing is required.

### 4.9 — Bypass Mechanisms

33. The system **must** support a per-turn environment-variable bypass: setting `$env:CLAUDE_SKIP_REVIEW="1"` suppresses the hook nudge.
34. The system **must** support a conversational bypass: when the user explicitly says "skip review," "commit without review," or equivalent, Claude **may** acknowledge the bypass and proceed without invoking the skill. The hook only nudges; it does not block tool execution.

### 4.10 — Commit-Time Behavior

35. When the user asks Claude to commit changes, the skill **must** run *before* the commit, the report **must** be shown to the user, and the commit **must** proceed only if the verdict is "safe to commit" or the user explicitly confirms after seeing findings.

### 4.11 — Project Scoping and Future Portability (per user decision 4C)

36. The hook and skill **must** be installed at the project level (`.claude/settings.json`, `.claude/hooks/`, `.claude/skills/`), not at the user level.
37. The skill's procedure **must** be written to be project-agnostic where possible (no hardcoded file paths beyond the conventional `app/`, `components/`, `lib/` — these are common Next.js conventions and can be parameterized or generalized when copied to another project).
38. Cross-platform portability (a non-PowerShell sibling of the hook script) is **out of scope** for this iteration but is acknowledged as a future concern if a non-Windows collaborator joins.

### 4.12 — False-Negative Logging (per user decision 3B)

39. When a regression is discovered *after* a "safe to commit" verdict was given, the developer **must** append a short entry to `.claude/review-misses.md` describing: (a) the change that was reviewed, (b) the verdict that was given, (c) what actually broke, and (d) what the skill's procedure should have done to catch it.
40. `.claude/review-misses.md` **must** be committed to the repo so the skill's procedure can be tuned over time based on real misses.
41. Periodic tuning of the skill's procedure based on `review-misses.md` is the developer's responsibility — there is no automated process for this.

---

## 5. Non-Goals (Out of Scope)

- A test-suite expansion (Playwright, E2E, UI integration tests). The mechanism does not replace tests; it operates alongside whatever tests exist.
- CI integration. The hook + skill run locally during AI-assisted sessions only.
- A non-Windows version of the hook script. PowerShell-only for this iteration.
- A user-level rollout to other projects. Project-scoped only; the skill can be copied to other projects manually if it proves valuable here.
- Automated regression-rate metrics, dashboards, or telemetry. Per user decision 1D, success is the absence of indirect-regression incidents — no separate metric is tracked.
- Quality grading of the report itself. The skill produces what it can; the developer is the final judge of report quality.
- Blocking commits at the git layer (e.g. via `pre-commit` git hooks). The mechanism only nudges during the Claude Code session.

---

## 6. Design Considerations

- **Hook output channel:** Stop hooks support a JSON `{ "decision": "block", "reason": "..." }` response where `reason` is surfaced back to Claude as a system message. This is the nudge channel — Claude reads it and decides whether to invoke the skill.
- **Filter-list bias:** the `mockups/`, `plans/`, `ai-dev-tasks/`, `*.md` filters are inclusive (anything else triggers). This favors firing-and-being-ignored over silently-missing-real-changes.
- **Trivial threshold (6 lines):** chosen as a starting heuristic. Comment additions, single-line bug fixes, and import reorderings typically fall below this. May need tuning after a week of real use.
- **Stamp invalidation by hash:** the stamp is self-invalidating — any new edit produces a different hash, so the hook re-fires automatically. No timestamp or expiry logic needed.
- **Report format:** the structured "Removed symbols / Shape drift / UI flows / Overall" output is designed to be scannable in seconds. The developer should be able to read the "Overall" line alone and decide whether to dig in.

---

## 7. Technical Considerations

- **PowerShell 5.1 syntax constraints** (Windows default): no `&&` / `||` chaining (use `;` and `$?`), no ternary / null-coalescing, default file encoding is UTF-16 LE (use `-Encoding utf8` when writing).
- **No new dependencies.** The hook uses only `git`, PowerShell, and standard cmdlets. The skill uses Claude Code's existing `Grep`, `Read`, and `Bash`/`PowerShell` tools.
- **No interference with existing settings:** `.claude/settings.local.json` (which contains a personal permission allowlist) **must** remain untouched.
- **The hook fires on every Stop event.** The PowerShell startup cost (~50–150 ms on a typical Windows machine) is acceptable for an interactive coding session but should be monitored. If startup cost becomes a problem, the script can be rewritten as a `git` plumbing one-liner emitted directly from the JSON.
- **`.gitignore` modification:** appending one line (`.claude/.review-stamp`). No other ignore rules are added or removed.

---

## 8. Success Metrics

Per user decision **1D**, no quantitative metric is tracked. Success is qualitative:

- Indirect regressions of the `router.refresh()`-style class (a removed call silently breaking a distant consumer) do not occur, or are caught at review time rather than weeks later.
- The developer does not feel the hook is noisy enough to disable it.
- The skill is invoked at least once on a real change within the first week of use, and the resulting report is useful — not redundant with what the developer would have noticed anyway.

A loose check-in at the 4-week mark is recommended (not required): does the mechanism still feel valuable? Tune the trivial threshold, filter list, or skill procedure based on observed behavior.

---

## 9. Open Questions

1. Should the hook also fire on `PreToolUse` for `git commit` to provide a second checkpoint right before the commit lands? Current design relies on Claude reading the skill instructions and self-invoking before commit (§4.10). Worth revisiting if Claude fails to self-invoke in practice.
2. Is the trivial-edit threshold of 6 lines correct? It is a guess. Could be tuned to 10–15 after observing real false-positive vs. false-negative rates.
3. Should `.claude/review-misses.md` have a structured schema (YAML, table) rather than free-form prose? Free-form is chosen for v1 to lower friction; structure can be added later if entries accumulate.
4. If multiple projects adopt this skill, should it eventually live in a shared marketplace plugin rather than being copy-pasted? Deferred until at least one other project adopts it.

---

## 10. Target Audience

The primary readers of this PRD are:
- The developer (user) — making the decision to implement and use the mechanism.
- Claude Code (the AI coding partner) — reading the skill instructions every time `/review-my-changes` is invoked.

The implementation is straightforward (three files plus a `.gitignore` line), so the PRD does not need to be tailored for a junior developer building it from scratch. The detailed step-by-step file content lives in the corresponding plan file: `C:\Users\AT\.claude\plans\the-recent-player-s-chip-valiant-cake.md`.
