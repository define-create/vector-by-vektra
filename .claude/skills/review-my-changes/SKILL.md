---
name: review-my-changes
description: Review uncommitted changes for indirect regressions before declaring a task done. Checks dependents of removed/modified code, cross-file shape consistency, and untested UI flows. Use before commit, when the Stop hook nudges, or when the user asks to "review changes" / "check before commit".
---

# Review My Changes

You are reviewing your own uncommitted work to catch indirect regressions — the kind where removing something (like `router.refresh()`) silently breaks a distant consumer (like a chip strip that needed it). Local diffs that look correct in isolation can still break behavior in other files.

## Procedure

### 1. Get the diff

Run `git diff HEAD` and `git status --porcelain`. If empty, tell the user "nothing to review" and stop.

### 2. Dependents check (load-bearing)

From the diff, extract every removed or significantly modified:
- function call, hook invocation, JSX prop
- import / export
- renamed symbol or config key
- removed call to a side-effectful function (e.g. `router.refresh()`, `revalidatePath()`, `fetch()`, `mutate()`)

For each item, use the `Grep` tool across `app/`, `components/`, and `lib/` to find remaining usages. For each, state in **one sentence**: *what behavior depended on this, and is that behavior still satisfied after the change?*

This is the most important check. Do not skip it. The class of bugs this catches is exactly the class the user has experienced before.

### 3. Cross-file consistency

If the diff touches any of:
- a TypeScript `type` / `interface`
- a Zod schema
- an API route's request or response shape (anything in `app/api/`)
- a shared constant or enum

then `Grep` for consumers and verify the shape still matches. Flag any mismatch.

### 4. UI flow coverage

If the diff touches `app/` or `components/`:
- List the user-facing routes and components downstream of the change.
- For each, state explicitly **one of**:
  - "manually verified" (only if you actually saw it work)
  - "not verified — recommend checking X"
  - "covered by jest test Y" (only if a test in `lib/` truly exercises this path)

**Do not invent verification you did not perform.** Honest "not verified" is required over false reassurance. The user's trust in this report depends on you never overstating coverage.

Skip this check entirely if the diff touches only `lib/`, `prisma/`, or `*.test.ts` files.

### 5. Report

Output in **exactly** this structure:

```
## Review report

### Removed / changed symbols
- `<symbol>` in `<file>`
  - Dependents: <list, or "none found">
  - Verdict: <safe | needs verification | broken>

### Shape drift
- <list, or "none">

### UI flows touched
- `<flow>`: <verification status>

### Overall
- <safe to commit | needs fixes | needs manual verification>
```

Do not pad sections with content unrelated to the diff. Empty sections should say "none" or be omitted, not filled with filler.

### 6. Stamp

After producing the report, write the current diff hash to `.claude/.review-stamp` so the Stop hook does not re-nudge for the same state.

Compute the hash exactly as the hook does — SHA-1 of the `git diff HEAD` text, a newline, the `git status --porcelain` lines joined by newlines, then each untracked non-ignored file's contents; hex-encoded lowercase.

Run this PowerShell script via the PowerShell tool. The logic must mirror `.claude/hooks/check-uncommitted.ps1`'s hash block (tracked diff + porcelain + untracked file contents, sorted, with delimiters). Four failure modes to avoid:

1. **Wrong CWD**: paths must be anchored to `git rev-parse --show-toplevel`, not the harness CWD. `[System.IO.File]::WriteAllText` uses the .NET process directory, which may differ from PowerShell's CWD.
2. **UTF-8 BOM**: do not use `Set-Content -Encoding utf8` in Windows PowerShell 5.1 — it writes a BOM and the stamp will never byte-match the hook's recomputed hash. Use `[System.IO.File]::WriteAllText` with an explicit no-BOM `UTF8Encoding`.
3. **Arrays appended as `System.Object[]`**: native command output is a `string[]`. `StringBuilder.Append()` on it appends the literal type name, not the content — the hash then ignores every tracked-file edit. Join lines with ``-join "`n"`` before appending.
4. **Console code page**: piping `git diff` through PowerShell decodes it with the console code page, which can differ between the hook's process and this tool, so non-ASCII characters (→, —, ·) would hash differently. Have git write the diff to a temp file with `--output` and read it back as UTF-8.

```powershell
$root = (git rev-parse --show-toplevel).Trim().Replace('/', '\')
$ignorePattern = '^(mockups/|plans/|ai-dev-tasks/|\.claude/\.review-stamp$|.*\.md$)'
$diffFile = [System.IO.Path]::GetTempFileName()
git diff HEAD --output="$diffFile" 2>$null
$diffText = [System.IO.File]::ReadAllText($diffFile)
Remove-Item -LiteralPath $diffFile -Force
$porcelainLines = @(git status --porcelain)
$untracked = git ls-files --others --exclude-standard
$hb = New-Object System.Text.StringBuilder
[void]$hb.Append($diffText); [void]$hb.Append("`n"); [void]$hb.Append(($porcelainLines -join "`n"))
if ($untracked) {
    $untracked -split "`n" | Sort-Object | ForEach-Object {
        $u = $_.Trim()
        if ([string]::IsNullOrWhiteSpace($u)) { return }
        $n = $u -replace '\\', '/'
        if ($n -match $ignorePattern) { return }
        $a = Join-Path $root $u
        if (Test-Path -LiteralPath $a -PathType Leaf) {
            [void]$hb.Append("`n--- $u ---`n")
            [void]$hb.Append([System.IO.File]::ReadAllText($a))
        }
    }
}
$sha = [System.Security.Cryptography.SHA1]::Create()
$hash = ($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($hb.ToString())) | ForEach-Object { $_.ToString("x2") }) -join ''
$sha.Dispose()
[System.IO.File]::WriteAllText((Join-Path $root ".claude\.review-stamp"), $hash, (New-Object System.Text.UTF8Encoding $false))
Write-Output "Stamped: $hash"
```

If the stamp write fails for any reason, mention it in the report — do not silently swallow.

## Skip rules

- Pure test file changes (`*.test.ts`) → skip step 4 (UI flow coverage).
- Pure backend changes (only `lib/` or `prisma/`) → skip step 4.
- Skip any step that has no relevant diff content; do not pad.

## If the user asked you to commit

Run this skill first. Show the report. Commit only if the verdict is "safe to commit" **or** the user explicitly confirms after seeing the findings.

## Bypass

If the user says "skip review", "commit without review", or equivalent, acknowledge the bypass and proceed. The Stop hook only nudges — it does not block tool execution. The user always has final say.

## When a regression is later discovered

If a "safe to commit" verdict turns out to have missed a real regression, append a short entry to `.claude/review-misses.md` with:
- the change that was reviewed (commit hash if committed, or a brief description)
- the verdict that was given
- what actually broke
- what this skill's procedure should have done to catch it

This file is committed to the repo and is the feedback loop for tuning this skill over time.
