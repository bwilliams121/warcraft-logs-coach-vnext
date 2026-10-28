<#
.SYNOPSIS
  Runs the read-only OpenAI (Codex) architecture review of the current tranche.

.DESCRIPTION
  Invokes `codex exec` non-interactively, in a READ-ONLY sandbox, with approval
  escalation disabled and an ephemeral session. The review prompt is fed
  through stdin. The reviewer's final message is written to
  .probe/openai-review/latest.txt (gitignored, transient, never authority),
  a timestamped copy is kept beside it, and the review is printed.

  The script returns Codex's process exit code.

.PARAMETER DisputeFile
  Optional path to a file of disputed evidence. Its content is appended to the
  prompt so a re-review can weigh the implementer's disagreement explicitly.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/review/openai-review.ps1
#>
[CmdletBinding()]
param(
  [string]$DisputeFile = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = (git -C $PSScriptRoot rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($repoRoot)) {
  Write-Error "openai-review: cannot resolve the repository root"
  exit 2
}
$repoRoot = [System.IO.Path]::GetFullPath($repoRoot)

$outDir = Join-Path $repoRoot ".probe\openai-review"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$latest = Join-Path $outDir "latest.txt"
if (Test-Path $latest) { Remove-Item -Force $latest }

$codex = Get-Command "codex.cmd" -ErrorAction SilentlyContinue
if ($null -eq $codex) { $codex = Get-Command "codex" -ErrorAction SilentlyContinue }
if ($null -eq $codex) {
  Write-Error "openai-review: the Codex CLI is not installed or not on PATH"
  exit 2
}

$prompt = @'
You are the architecture and review lead for this repository. You are a
REVIEWER, not the implementer. You are running in a read-only sandbox.

Make NO changes: do not create, edit or delete any file, do not stage,
commit, push or deploy, and make no Warcraft Logs or other project network
requests.

Do this, in order:
1. Read agent/openai-review-policy.md and follow it.
2. Read agent/architecture.md (it is large: search it for the sections the
   tranche touches rather than reading every line).
3. Read agent/testing.md (same approach).
4. Read agent/follow-ups.md.
5. Read agent/review-request.md: the implementer's claims for this tranche.
6. Run `git status` (including untracked files).
7. Inspect the unstaged diff (`git diff`) and the staged diff
   (`git diff --cached`), and read new untracked files relevant to the tranche.
8. Inspect the relevant implementation and tests where needed to verify the
   claims.
9. Review the actual tranche against the policy and the repository's
   architecture and testing rules.
10. Make no changes.

Return exactly the output format defined in agent/openai-review-policy.md,
beginning with the line `VERDICT: <APPROVED|CHANGES_REQUIRED|OWNER_DECISION_REQUIRED>`.
'@

if ($DisputeFile -ne "") {
  $disputePath = if ([System.IO.Path]::IsPathRooted($DisputeFile)) { $DisputeFile } else { Join-Path $repoRoot $DisputeFile }
  if (-not (Test-Path $disputePath)) {
    Write-Error "openai-review: dispute file not found: $disputePath"
    exit 2
  }
  $prompt += "`n`nDISPUTED EVIDENCE. The implementer disagrees with a previous finding. Weigh this evidence against the repository and either withdraw the finding or explain why it stands; escalate as OWNER_DECISION_REQUIRED only if the disagreement is genuinely architectural or product-significant:`n`n"
  $prompt += (Get-Content -Raw -Encoding UTF8 $disputePath)
}

# Windows PowerShell 5.1 pipes to native programs using $OutputEncoding (ASCII by default).
$OutputEncoding = New-Object System.Text.UTF8Encoding $false

Push-Location $repoRoot
try {
  $prompt | & $codex.Source `
    --ask-for-approval never `
    exec `
    --ephemeral `
    --sandbox read-only `
    --cd $repoRoot `
    --color never `
    --output-last-message $latest `
    - | Out-Host
  $exitCode = $LASTEXITCODE
}
finally {
  Pop-Location
}

if (Test-Path $latest) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  Copy-Item -Force $latest (Join-Path $outDir "review-$stamp.txt")
  $review = Get-Content -Raw -Encoding UTF8 $latest
  Write-Host ""
  Write-Host "===== OpenAI architecture review (.probe/openai-review/latest.txt) ====="
  Write-Host $review
  if ($review -notmatch '(?m)^\s*VERDICT:\s*(APPROVED|CHANGES_REQUIRED|OWNER_DECISION_REQUIRED)\s*$') {
    Write-Warning "openai-review: the review has no recognised VERDICT line"
  }
}
else {
  Write-Warning "openai-review: Codex wrote no final message (exit code $exitCode)"
}

exit $exitCode
