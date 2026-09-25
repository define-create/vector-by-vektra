# .claude/hooks/check-uncommitted.ps1
# Stop-event hook: nudges Claude to invoke /review-my-changes when there are
# non-trivial uncommitted code changes that haven't been reviewed yet.
# See PRD: tasks/prd-review-before-done-hook-and-skill.md

$ErrorActionPreference = "SilentlyContinue"

# --- Bypass: per-turn env var ------------------------------------------------
if ($env:CLAUDE_SKIP_REVIEW -eq "1") { exit 0 }

# --- Resolve repo root (so file paths work regardless of harness CWD) -------
# Claude Code's harness may invoke this hook from a CWD different from the
# project root. Use `git rev-parse --show-toplevel` so file reads are anchored
# to the repo root. Note: `Set-Location` only changes PowerShell's CWD; the
# underlying .NET process directory used by [System.IO.File]::ReadAllBytes
# does NOT update. All file paths below must therefore be absolute, joined
# from $repoRoot.
$repoRoot = (git rev-parse --show-toplevel 2>$null)
if ([string]::IsNullOrWhiteSpace($repoRoot)) { exit 0 }
$repoRoot = $repoRoot.Trim().Replace('/', '\')

# --- Collect working-tree changes -------------------------------------------
# Native command output reaches PowerShell as string[], one element per line.
$porcelainLines = @(git status --porcelain)
if ($porcelainLines.Count -eq 0) { exit 0 }

# --- Filter out non-code paths ----------------------------------------------
# Drop: mockups/, plans/, ai-dev-tasks/, .claude/.review-stamp, any *.md file
$ignorePattern = '^(mockups/|plans/|ai-dev-tasks/|\.claude/\.review-stamp$|.*\.md$)'

$codeChanges = @($porcelainLines | ForEach-Object {
    # Porcelain v1: two status columns and a space, then the path. Do not trim
    # first: an unstaged change (" M path") starts with a space, and trimming
    # shifts the path. Renames read "old -> new"; keep the new path.
    if ($_.Length -lt 4) { return }
    $path = ($_.Substring(3) -replace '^.* -> ', '').Trim('"') -replace '\\', '/'
    if ($path -notmatch $ignorePattern) { $_ }
})

if ($codeChanges.Count -eq 0) { exit 0 }

# --- Trivial-edit threshold (< 6 changed lines) -----------------------------
# Count tracked-file changes (insertions + deletions) and untracked-file lines.
# `git diff HEAD --shortstat` only sees tracked files, so untracked new files
# would otherwise count as zero and bypass the nudge entirely.
$totalChanged = 0

$shortstat = git diff HEAD --shortstat
if ($shortstat -match '(\d+)\s+insertion') { $totalChanged += [int]$matches[1] }
if ($shortstat -match '(\d+)\s+deletion')  { $totalChanged += [int]$matches[1] }

# Untracked files (respecting .gitignore), filtered by the same path rules as $codeChanges
$untracked = git ls-files --others --exclude-standard
if ($untracked) {
    $untracked -split "`n" | ForEach-Object {
        $u = $_.Trim()
        if ([string]::IsNullOrWhiteSpace($u)) { return }
        $normalized = $u -replace '\\', '/'
        if ($normalized -match $ignorePattern) { return }
        $absPath = Join-Path $repoRoot $u
        if (Test-Path -LiteralPath $absPath -PathType Leaf) {
            $lines = (Get-Content -LiteralPath $absPath -ErrorAction SilentlyContinue | Measure-Object -Line).Lines
            if ($lines) { $totalChanged += $lines }
        }
    }
}

if ($totalChanged -lt 6) { exit 0 }

# --- Compute current diff hash ----------------------------------------------
# Hash includes: tracked-file diff + porcelain status + untracked file contents.
# Including untracked file contents is essential â€” `git diff HEAD` ignores
# untracked files, so without this an untracked-file edit would not invalidate
# the review stamp.
#
# Every part must be appended as a single string. StringBuilder.Append() given
# the string[] that native output produces appends the literal text
# "System.Object[]", which is how this hook once stopped noticing any edit to a
# tracked file after the first review stamp. git writes the diff to a temp file,
# read back as UTF-8, so the hash is exact and does not depend on the console
# code page (the /review-my-changes stamp script must produce the same bytes).
$diffFile = [System.IO.Path]::GetTempFileName()
git diff HEAD --output="$diffFile" 2>$null
$diffText = [System.IO.File]::ReadAllText($diffFile)
Remove-Item -LiteralPath $diffFile -Force
$sha = [System.Security.Cryptography.SHA1]::Create()
$hashBuilder = New-Object System.Text.StringBuilder
[void]$hashBuilder.Append($diffText)
[void]$hashBuilder.Append("`n")
[void]$hashBuilder.Append(($porcelainLines -join "`n"))
if ($untracked) {
    $untracked -split "`n" | Sort-Object | ForEach-Object {
        $u = $_.Trim()
        if ([string]::IsNullOrWhiteSpace($u)) { return }
        $normalized = $u -replace '\\', '/'
        if ($normalized -match $ignorePattern) { return }
        $absPath = Join-Path $repoRoot $u
        if (Test-Path -LiteralPath $absPath -PathType Leaf) {
            [void]$hashBuilder.Append("`n--- $u ---`n")
            [void]$hashBuilder.Append([System.IO.File]::ReadAllText($absPath))
        }
    }
}
$bytes = [System.Text.Encoding]::UTF8.GetBytes($hashBuilder.ToString())
$hash = ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") }) -join ''
$sha.Dispose()

# --- Stamp check: already reviewed for this exact diff state? ---------------
# Read raw bytes and strip any UTF-8 BOM (EF BB BF) before comparing.
# Windows PowerShell 5.1's `Set-Content -Encoding utf8` writes a BOM by default,
# so a stamp written via that path would never match a clean hex hash.
# Path is absolute (joined from $repoRoot) so the read works regardless of
# the harness's actual working directory.
$stampPath = Join-Path $repoRoot ".claude\.review-stamp"
if (Test-Path -LiteralPath $stampPath) {
    $stampBytes = [System.IO.File]::ReadAllBytes($stampPath)
    if ($stampBytes.Length -ge 3 -and $stampBytes[0] -eq 0xEF -and $stampBytes[1] -eq 0xBB -and $stampBytes[2] -eq 0xBF) {
        $stampBytes = $stampBytes[3..($stampBytes.Length - 1)]
    }
    $stamped = ([System.Text.Encoding]::UTF8.GetString($stampBytes)).Trim()
    if ($stamped -eq $hash) { exit 0 }
}

# --- Emit Stop-hook block decision ------------------------------------------
$fileCount = $codeChanges.Count
$reason = @"
Uncommitted code changes detected ($fileCount file(s), $totalChanged line(s)).

Before declaring this task done, invoke the /review-my-changes skill to scan for indirect regressions:
  - dependents of removed/changed code
  - cross-file shape consistency (types, API shapes, shared constants)
  - UI flows touched but not manually verified

If you have already reviewed and the user accepted the changes, the user can set the environment variable CLAUDE_SKIP_REVIEW=1 for the next turn to bypass this nudge. If the user explicitly waived the review ("skip review" / "commit without review"), acknowledge and proceed.
"@

$payload = @{
    decision = "block"
    reason   = $reason
} | ConvertTo-Json -Compress

Write-Output $payload
exit 0
