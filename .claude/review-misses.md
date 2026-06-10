# Review skill misses

Real-world cases where the `/review-my-changes` skill gave a "safe" verdict (or wasn't applicable) but a regression was discovered after. Each entry: what was reviewed, the verdict, what broke, what the procedure should have caught.

---

## 2026-05-22 — Initial mechanism bootstrap had three latent bugs

**Reviewed:** the meta-tooling change introducing the Stop hook (`.claude/hooks/check-uncommitted.ps1`), the `/review-my-changes` skill, and the PRD.

**Verdict given:** "safe to commit" — because the dependents check found nothing (no removed function calls, no API shape changes, no UI changes).

**What actually broke (caught while still in the same session, not after commit):**

1. **Stamp file written with UTF-8 BOM.** `Set-Content -Encoding utf8 -NoNewline` on Windows PowerShell 5.1 writes `EF BB BF` before the hash. The hook's `Get-Content` read it back as `﻿bcdff1d...` which never matched the recomputed clean-hex hash. Stamp suppression always failed. → Symptom: hook fired every turn even after stamp was written.

2. **Hook used relative paths.** `Test-Path ".claude/.review-stamp"` and `Get-Content -LiteralPath $u` resolved against the harness's CWD, which is not necessarily the project root. PowerShell's `Set-Location` does not update the .NET process directory, so absolute-path operations via `[System.IO.File]` still used the wrong directory. → Symptom: stamp couldn't be read even when present.

3. **Hash didn't include untracked file contents.** `git diff HEAD` ignores untracked files. If a user edits a new (uncommitted, untracked) file, the hash wouldn't change, and a stale stamp would suppress the nudge incorrectly. Soundness hole. → Symptom: latent — would surface only when the user edited an untracked file between reviews.

**What the procedure should have done:**

The current dependents-check is geared at finding consumers of *removed* code. It is not designed to catch *meta-tooling* defects in scripts that interact via file-system side channels (stamp files, encoding choices, CWD assumptions). For this class of change, the skill should additionally:

- For changes to anything under `.claude/hooks/` or `.claude/skills/`, explicitly trace the end-to-end execution lifecycle of the affected hook/skill before declaring safe. Specifically: write a representative stamp/marker file, then re-run the hook/skill in a fresh process and verify the expected suppression/firing behavior.
- For PowerShell scripts that write files, default to assuming `Set-Content -Encoding utf8` will introduce a BOM on Windows PS 5.1 (per the PowerShell tool description), and flag any such call as "needs verification: confirm no BOM expected by readers."
- For any hook/skill that uses relative paths, flag as "needs verification: confirm the harness invokes from project root."

This entry is the basis for a future "meta-tooling self-test" extension to the skill.
