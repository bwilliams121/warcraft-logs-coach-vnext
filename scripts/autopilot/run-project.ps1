<#
.SYNOPSIS
  The local project autopilot supervisor for warcraft-logs-coach-vnext.

.DESCRIPTION
  Orchestrates, and never replaces, the repository's Autonomous Tranche
  Workflow (CLAUDE.md): it selects the next READY tranche from
  agent/autopilot-queue.md, launches Claude Code non-interactively to run the
  whole workflow (implementation, local validation, the local OpenAI/Codex
  review loop, commit, push, PR, CI, GitHub review), then INDEPENDENTLY
  verifies repository and GitHub state and decides:

      READY_TO_MERGE | OWNER_DECISION_REQUIRED | RETRYABLE_FAILURE | FATAL_FAILURE

  Only READY_TO_MERGE merges, and only after every merge gate is verified
  (never inferred from absence). It merges with the PR head pinned
  (--match-head-commit), never with --admin, never bypassing anything.

  State: transient runtime state lives under .probe/autopilot/ (gitignored):
  status.json (heartbeat), state.json (crash-safe runtime and merge ledger),
  supervisor.lock (single instance), STOP (graceful stop request), logs.
  Durable roadmap state lives in agent/autopilot-queue.md (tracked).

  Network: the supervisor talks to GitHub through gh, and launches Claude
  and Codex. It never makes a Warcraft Logs request and never lets Claude
  make one unless the tranche's queue entry carries an owner-authorized WCL
  grant; Claude's transcript is audited for probe or Warcraft Logs activity.

.PARAMETER MaxTranches
  Tranches to complete (merge) in this run. 0 = continue until blocked.

.PARAMETER MaxRuntimeMinutes
  Stop at the next safe boundary after this many minutes. 0 = no limit.

.PARAMETER TrancheId
  Run exactly this tranche (it must still be READY or in progress).

.PARAMETER QueueFile
  The queue to read. Default agent/autopilot-queue.md.

.PARAMETER NoMerge
  Evaluate the merge gate but never merge (the decision is logged as
  WOULD_MERGE). Used for the first dry-run test.

.PARAMETER GateOnly
  Do not launch Claude: evaluate the merge gate for the tranche's existing PR
  and stop. Combine with -NoMerge for a pure decision dry run.

.PARAMETER SelfTest
  Run the offline self-tests (queue parsing, gate logic, argument quoting,
  transcript audit) and exit. No model, no network.
#>
[CmdletBinding()]
param(
  [int]$MaxTranches = 1,
  [int]$MaxRuntimeMinutes = 720,
  [string]$TrancheId = "",
  [string]$QueueFile = "agent/autopilot-queue.md",
  [switch]$NoMerge,
  [switch]$GateOnly,
  [switch]$SelfTest,
  [string]$ClaudePath = "",
  [int]$ClaudeTimeoutMinutes = 360,
  [int]$CiTimeoutMinutes = 90,
  [int]$PollSeconds = 60,
  [int]$MaxRepairCycles = 3,
  [int]$MaxClaudeTurns = 400
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"
$OutputEncoding = New-Object System.Text.UTF8Encoding $false

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

$script:Statuses = @("BLOCKED", "READY", "IN_PROGRESS", "PR_OPEN", "MERGED", "OWNER_DECISION_REQUIRED")
$script:ExcludedLocalFiles = @(
  ".claude/",
  "scripts/probe/wcl-external-candidate.probe.ts",
  "scripts/probe/wcl-rankings-schema.probe.ts",
  "scripts/probe/wcl-rankings-shape.probe.ts"
)
$script:PublicContractPaths = @("src/contracts/", "src/api/", "src/mcp/")
$script:ExpectedRepo = "bwilliams121/warcraft-logs-coach-vnext"
$script:ResultMarkers = @("READY_FOR_GATE", "OWNER_DECISION_REQUIRED", "RETRYABLE_FAILURE", "FATAL_FAILURE")

# Tools Claude may use. Normal repository work: files, search, shell, subagents.
$script:AllowedTools = @(
  "Read", "Edit", "Write", "Glob", "Grep", "NotebookEdit", "TodoWrite", "Agent", "Task",
  "Bash", "PowerShell", "Monitor", "ToolSearch"
)
# Never, whatever the tranche: merging (the supervisor's job), main, force
# pushes, deployment, the live Warcraft Logs probe, and web access.
$script:DisallowedTools = @(
  "Bash(gh pr merge:*)", "PowerShell(gh pr merge:*)",
  "Bash(git push --force:*)", "Bash(git push -f:*)", "PowerShell(git push --force:*)", "PowerShell(git push -f:*)",
  "Bash(git push origin main:*)", "PowerShell(git push origin main:*)",
  "Bash(git push origin HEAD:main:*)", "PowerShell(git push origin HEAD:main:*)",
  "Bash(wrangler deploy:*)", "Bash(npx wrangler deploy:*)", "Bash(npx.cmd wrangler deploy:*)",
  "PowerShell(wrangler deploy:*)", "PowerShell(npx wrangler deploy:*)", "PowerShell(npx.cmd wrangler deploy:*)",
  "Bash(npm run deploy:*)", "Bash(npm.cmd run deploy:*)", "PowerShell(npm run deploy:*)", "PowerShell(npm.cmd run deploy:*)",
  "Bash(npm run probe:*)", "Bash(npm.cmd run probe:*)", "PowerShell(npm run probe:*)", "PowerShell(npm.cmd run probe:*)",
  "WebFetch", "WebSearch"
)
# Transcript audit. Only EXECUTED actions count: a shell command (Bash,
# PowerShell, Monitor), a web tool (WebFetch, WebSearch) or an MCP tool, never
# a file read or an edit that merely mentions the probe. A command matching one
# of these patterns is Warcraft Logs or probe activity, allowed only under an
# explicit WCL grant.
$script:ExecutingTools = @("Bash", "PowerShell", "Monitor", "WebFetch", "WebSearch")
$script:WclActivityPatterns = @(
  'warcraftlogs\.com',
  'vitest\.probe\.config',
  'npm(\.cmd)?\s+run\s+probe\b',
  '\b(node|npx(\.cmd)?|vitest|tsx|ts-node)\b[^|;&\n]*scripts[/\\]probe[/\\]',
  '\b(node|npx(\.cmd)?|vitest|tsx|ts-node)\b[^|;&\n]*\.probe\.ts\b'
)

# ---------------------------------------------------------------------------
# Paths, logging, state
# ---------------------------------------------------------------------------

function Get-RepoRoot {
  # Windows PowerShell 5.1 turns a native command's stderr into an error
  # record, terminating under "Stop"; native calls run under "Continue" and
  # are judged by their exit code alone.
  $ErrorActionPreference = "Continue"
  $root = (& git -C $PSScriptRoot rev-parse --show-toplevel 2>$null)
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($root)) { throw "autopilot: cannot resolve the repository root" }
  return [System.IO.Path]::GetFullPath($root.Trim())
}

$script:Repo = Get-RepoRoot
$script:Dir = Join-Path $script:Repo ".probe\autopilot"
# The offline self-test writes only under its own directory, never over real state.
if ($SelfTest) { $script:Dir = Join-Path $script:Dir "selftest" }
New-Item -ItemType Directory -Force -Path $script:Dir | Out-Null
$script:Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$script:Log = Join-Path $script:Dir "supervisor-$script:Stamp.log"
$script:StatusFile = Join-Path $script:Dir "status.json"
$script:StateFile = Join-Path $script:Dir "state.json"
$script:StopFile = Join-Path $script:Dir "STOP"
$script:LockFile = Join-Path $script:Dir "supervisor.lock"
$script:StartedAt = Get-Date
$script:Status = [ordered]@{}
$script:ClaudeProcess = $null
$script:Claude = $null
$script:Node = $null
$script:Launcher = Join-Path $script:Repo "scripts\autopilot\run-claude.mjs"

# Kept equal to redact() in scripts/autopilot/run-claude.mjs; the self-test
# checks that both give the same output on the same secrets. A quoted secret
# value is redacted WHOLE, up to its matching closing quote at the same escape
# level, keeping the quotes and escapes so a JSON line stays valid; a bare
# value runs to whitespace, a quote, a comma or a backslash. A secret key is any
# identifier ENDING in secret, token, password, passwd, api key or client_id;
# a usage counter such as output_tokens is left alone.
$script:QuotedValue = '(?<q>\\*)(?<qc>["''])(?<v>.*?)(?<!\\)\k<q>\k<qc>'
$script:SecretKeyPattern = '(?i)([A-Za-z0-9_]*(?:secret|token|password|passwd|api[_-]?key|client_id))(\\*["'']?\s*[:=]\s*)(?:' + $script:QuotedValue + '|(?<bare>[^\s"'',\\]+))'
$script:AuthorizationPattern = '(?i)(authorization)(\\*["'']?\s*[:=]\s*)(?:' + $script:QuotedValue + '|(?<p>bearer\s+|basic\s+|token\s+)?(?<bare>[^\s"'',\\]+))'
$script:ReplaceValue = {
  param($m)
  if ($m.Groups["qc"].Success) { return $m.Groups[1].Value + $m.Groups[2].Value + $m.Groups["q"].Value + $m.Groups["qc"].Value + "[REDACTED]" + $m.Groups["q"].Value + $m.Groups["qc"].Value }
  return $m.Groups[1].Value + $m.Groups[2].Value + $m.Groups["p"].Value + "[REDACTED]"
}
function Redact([string]$text) {
  if ($null -eq $text) { return "" }
  $t = $text -replace '(gho|ghp|ghs|ghu|github_pat)_[A-Za-z0-9_]{10,}', '$1_[REDACTED]'
  $t = $t -replace '(?i)sk-(ant-|proj-)?[A-Za-z0-9_-]{10,}', '[REDACTED_KEY]'
  $t = [regex]::Replace($t, $script:AuthorizationPattern, [System.Text.RegularExpressions.MatchEvaluator]$script:ReplaceValue)
  $t = $t -replace '(?i)\b(bearer|basic)\s+(?!\[REDACTED\])[A-Za-z0-9._~+/-]{8,}=*', '$1 [REDACTED]'
  $t = [regex]::Replace($t, $script:SecretKeyPattern, [System.Text.RegularExpressions.MatchEvaluator]$script:ReplaceValue)
  return $t
}

# Logging must never be what stops the supervisor: a file briefly locked by
# another process (an antivirus scan of a freshly written file, a reader of
# latest.log) is retried a few times and then skipped. The line still goes
# to the console.
function Write-Log([string]$message) {
  $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-ddTHH:mm:ss"), (Redact $message)
  Write-Host $line
  for ($i = 0; $i -lt 5; $i++) {
    try {
      [System.IO.File]::AppendAllText($script:Log, $line + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding $false))
      break
    }
    catch { Start-Sleep -Milliseconds 200 }
  }
  try { Copy-Item -Force $script:Log (Join-Path $script:Dir "latest.log") -ErrorAction Stop } catch { }
}

function Write-JsonAtomic([string]$path, $object) {
  $tmp = "$path.tmp"
  $json = $object | ConvertTo-Json -Depth 8
  [System.IO.File]::WriteAllText($tmp, $json, (New-Object System.Text.UTF8Encoding $false))
  # Replace is atomic on one volume; PowerShell cannot pass a null backup path, so one is kept.
  if (Test-Path $path) { [System.IO.File]::Replace($tmp, $path, "$path.bak") } else { [System.IO.File]::Move($tmp, $path) }
}

function Set-Status([hashtable]$fields) {
  foreach ($key in $fields.Keys) { $script:Status[$key] = $fields[$key] }
  $script:Status["pid"] = $PID
  $script:Status["updatedAt"] = (Get-Date).ToString("o")
  # The heartbeat must never be the failure: a write error is logged, not thrown.
  try { Write-JsonAtomic $script:StatusFile $script:Status } catch { Add-Content -Path $script:Log -Value "status.json write failed: $($_.Exception.Message)" -Encoding UTF8 }
}

# Absent state is a fresh start. Present but unreadable or invalid state is
# FATAL and the file is left exactly as it is: it may hold an owner block or
# the attempt history, and silently replacing it could erase either.
function Read-State {
  if (-not (Test-Path $script:StateFile)) { return $null }
  $state = $null
  try { $state = Get-Content -Raw -Encoding UTF8 $script:StateFile | ConvertFrom-Json } catch { $state = $null }
  $valid = $null -ne $state
  foreach ($field in @("version", "attempts", "merged")) {
    if ($valid -and $null -eq $state.PSObject.Properties[$field]) { $valid = $false }
  }
  if (-not $valid) {
    throw "FATAL: $script:StateFile is unreadable or invalid; it is preserved untouched. Repair it (a previous copy may be in state.json.bak), or remove it only after checking it records no owner block."
  }
  if ($null -eq $state.PSObject.Properties["blocked"]) { $state | Add-Member -NotePropertyName blocked -NotePropertyValue $null }
  if ($null -eq $state.PSObject.Properties["current"]) { $state | Add-Member -NotePropertyName current -NotePropertyValue $null }
  return $state
}

function Initialize-State {
  $state = Read-State
  if ($null -eq $state) { $state = New-State; Save-State $state }
  return $state
}

function Save-State($state) { Write-JsonAtomic $script:StateFile $state }

function New-State {
  return [pscustomobject]@{
    version = 1
    blocked = $null
    attempts = [pscustomobject]@{}
    merged = @()
    current = $null
  }
}

function Get-Attempts($state, [string]$id) {
  $p = $state.attempts.PSObject.Properties[$id]
  if ($null -eq $p) { return 0 } else { return [int]$p.Value }
}

function Set-Attempts($state, [string]$id, [int]$n) {
  if ($null -eq $state.attempts.PSObject.Properties[$id]) { $state.attempts | Add-Member -NotePropertyName $id -NotePropertyValue $n }
  else { $state.attempts.$id = $n }
}

# ---------------------------------------------------------------------------
# Native command helpers (bounded retries for transient failures)
# ---------------------------------------------------------------------------

function Invoke-Native([string]$exe, [string[]]$arguments, [switch]$AllowFail) {
  # Exit code, not stderr, decides success (see Get-RepoRoot).
  $ErrorActionPreference = "Continue"
  $output = & $exe @arguments 2>&1 | ForEach-Object { "$_" }
  $code = $LASTEXITCODE
  $ErrorActionPreference = "Stop"
  $text = ($output -join "`n")
  if ($code -ne 0 -and -not $AllowFail) { throw ("{0} {1} failed ({2}): {3}" -f $exe, ($arguments -join " "), $code, (Redact $text)) }
  return [pscustomobject]@{ Code = $code; Text = $text }
}

function Invoke-Gh([string[]]$arguments, [int]$tries = 4) {
  $delay = 15
  for ($i = 1; $i -le $tries; $i++) {
    $r = Invoke-Native "gh" $arguments -AllowFail
    if ($r.Code -eq 0) { return $r.Text }
    if ($i -eq $tries) { throw "gh $($arguments -join ' ') failed after $tries tries: $(Redact $r.Text)" }
    Write-Log "gh transient failure (try $i of $tries), retrying in $delay s: $(Redact $r.Text)"
    Start-Sleep -Seconds $delay
    $delay = [Math]::Min($delay * 2, 300)
  }
}

function Invoke-Git([string[]]$arguments) { return (Invoke-Native "git" (@("-C", $script:Repo) + $arguments)).Text }

# ---------------------------------------------------------------------------
# Queue parsing
# ---------------------------------------------------------------------------

<#
  Queue format (agent/autopilot-queue.md): each tranche is a level-3 heading
  "### <ID>: <title>" followed by a fenced block tagged `autopilot` holding
  "key: value" lines. Keys: status, dependsOn (comma list or none), branch,
  base (default main; a stacked tranche names its parent branch), wcl (NONE
  or a grant reference), publicContract (NONE or EXPECTED), ownerDecision,
  pr, mergeSha. Everything else in the file is prose.
#>
function ConvertFrom-QueueText([string]$text) {
  $entries = New-Object System.Collections.ArrayList
  $pattern = '(?ms)^###\s+([A-Za-z0-9][A-Za-z0-9._-]*):\s*(.+?)\s*$\s*```autopilot\s*$(.*?)^```'
  foreach ($m in [regex]::Matches($text, $pattern)) {
    $fields = [ordered]@{}
    foreach ($line in ($m.Groups[3].Value -split "`r?`n")) {
      if ($line -match '^\s*([A-Za-z]+)\s*:\s*(.*?)\s*$') { $fields[$Matches[1]] = $Matches[2] }
    }
    $id = $m.Groups[1].Value
    $status = [string]$fields["status"]
    if ($script:Statuses -notcontains $status) { throw "queue: tranche $id has unknown status '$status'" }
    $deps = @()
    if ($fields.Contains("dependsOn") -and $fields["dependsOn"] -notmatch '^(none|)$') {
      $deps = @(($fields["dependsOn"] -split ',') | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" })
    }
    $wcl = if ($fields.Contains("wcl")) { [string]$fields["wcl"] } else { "NONE" }
    $public = if ($fields.Contains("publicContract")) { [string]$fields["publicContract"] } else { "NONE" }
    if (@("NONE", "EXPECTED") -notcontains $public) { throw "queue: tranche $id publicContract must be NONE or EXPECTED" }
    $branch = if ($fields.Contains("branch") -and $fields["branch"] -ne "") { [string]$fields["branch"] } else { "autopilot/" + $id.ToLowerInvariant() }
    $base = if ($fields.Contains("base") -and $fields["base"] -ne "") { [string]$fields["base"] } else { "main" }
    [void]$entries.Add([pscustomobject]@{
        Id = $id
        Base = $base
        Title = $m.Groups[2].Value
        Status = $status
        DependsOn = $deps
        Branch = $branch
        Wcl = $wcl
        PublicContract = $public
        OwnerDecision = if ($fields.Contains("ownerDecision")) { [string]$fields["ownerDecision"] } else { "" }
        Pr = if ($fields.Contains("pr") -and $fields["pr"] -match '^\d+$') { [int]$fields["pr"] } else { $null }
        MergeSha = if ($fields.Contains("mergeSha")) { [string]$fields["mergeSha"] } else { "" }
      })
  }
  $ids = @($entries | ForEach-Object { $_.Id })
  if (@($ids | Select-Object -Unique).Count -ne $ids.Count) { throw "queue: duplicate tranche id" }
  foreach ($e in $entries) {
    foreach ($d in $e.DependsOn) { if ($ids -notcontains $d) { throw "queue: tranche $($e.Id) depends on unknown $d" } }
  }
  return , $entries.ToArray()
}

# The queue's requiredChecks line, always as an array (strict mode: a single
# check must not unroll into a bare string).
function Get-RequiredChecks([string]$queueText) {
  $m = [regex]::Match($queueText, '(?m)^requiredChecks:\s*(.+)$')
  if (-not $m.Success) { return , @() }
  return , @($m.Groups[1].Value -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" })
}

function Read-Queue {
  $path = if ([System.IO.Path]::IsPathRooted($QueueFile)) { $QueueFile } else { Join-Path $script:Repo $QueueFile }
  if (-not (Test-Path $path)) { throw "queue file not found: $path" }
  return ConvertFrom-QueueText (Get-Content -Raw -Encoding UTF8 $path)
}

function Get-QueueHash {
  $path = if ([System.IO.Path]::IsPathRooted($QueueFile)) { $QueueFile } else { Join-Path $script:Repo $QueueFile }
  return (Get-FileHash -Algorithm SHA256 $path).Hash
}

# A tranche is merged if the queue says so, the ledger recorded it, or GitHub
# shows its PR (or its branch's PR) merged. Verified, never assumed.
function Test-Merged($entry, $state) {
  if ($entry.Status -eq "MERGED") { return $true }
  foreach ($m in @($state.merged)) { if ($m.id -eq $entry.Id) { return $true } }
  $pr = Find-Pr $entry "merged"
  return ($null -ne $pr)
}

function Find-Pr($entry, [string]$state) {
  if ($null -ne $entry.Pr) {
    $json = Invoke-Gh @("pr", "view", "$($entry.Pr)", "--json", "number,state,headRefName,headRefOid,baseRefName,mergeCommit,url")
    $pr = $json | ConvertFrom-Json
    if ($state -eq "merged" -and $pr.state -ne "MERGED") { return $null }
    if ($state -eq "open" -and $pr.state -ne "OPEN") { return $null }
    return $pr
  }
  $json = Invoke-Gh @("pr", "list", "--head", $entry.Branch, "--state", $state, "--json", "number,state,headRefName,headRefOid,baseRefName,mergeCommit,url", "--limit", "5")
  $list = @($json | ConvertFrom-Json)
  if ($list.Count -gt 1) { throw "invariant: more than one $state PR for branch $($entry.Branch)" }
  if ($list.Count -eq 1) { return $list[0] }
  return $null
}

# Why a tranche may not run now, or "" when it may: its status must be READY,
# IN_PROGRESS or PR_OPEN and every dependency merged. One rule for automatic
# and explicit (-TrancheId) selection.
function Test-Runnable($entry, $queue, $state) {
  if (@("READY", "IN_PROGRESS", "PR_OPEN") -notcontains $entry.Status) { return "its status is $($entry.Status)" }
  foreach ($d in $entry.DependsOn) {
    $dep = @($queue | Where-Object { $_.Id -eq $d })[0]
    if (-not (Test-Merged $dep $state)) { return "its dependency $d is not merged" }
  }
  return ""
}

function Select-NextTranche($queue, $state) {
  if ($TrancheId -ne "") {
    $e = @($queue | Where-Object { $_.Id -eq $TrancheId })
    if ($e.Count -ne 1) { throw "REFUSED: tranche $TrancheId is not in the queue" }
    # Inspecting an already-merged tranche is harmless (Invoke-Tranche returns ALREADY_MERGED).
    if (Test-Merged $e[0] $state) { return $e[0] }
    $why = Test-Runnable $e[0] $queue $state
    if ($why -ne "") { throw "REFUSED: tranche $TrancheId is not runnable: $why" }
    return $e[0]
  }
  foreach ($e in $queue) {
    if ((Test-Runnable $e $queue $state) -ne "") { continue }
    if (Test-Merged $e $state) { continue }
    return $e
  }
  return $null
}

function Get-FirstBlocker($queue, $state) {
  foreach ($e in $queue) {
    if ($e.Status -eq "OWNER_DECISION_REQUIRED") { return $e }
  }
  return $null
}

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------

function Resolve-Claude {
  if ($ClaudePath -ne "") {
    if (-not (Test-Path $ClaudePath)) { throw "Claude CLI not found at -ClaudePath $ClaudePath" }
    return $ClaudePath
  }
  $cmd = Get-Command "claude" -ErrorAction SilentlyContinue
  if ($null -ne $cmd) { return $cmd.Source }
  $candidates = @(
    (Join-Path $env:USERPROFILE ".local\bin\claude.exe"),
    (Join-Path $env:USERPROFILE ".claude\local\claude.exe")
  )
  foreach ($c in $candidates) { if (Test-Path $c) { return $c } }
  $zed = Join-Path $env:LOCALAPPDATA "Zed\external_agents\registry\npx\claude-acp\node_modules\@anthropic-ai\claude-agent-sdk-win32-x64\claude.exe"
  if (Test-Path $zed) {
    Write-Log "WARNING: using the Claude Code binary bundled with Zed's agent integration ($zed). It needs no Zed window, but an update to Zed may move it; install the Claude Code CLI or pass -ClaudePath for a stable path."
    return $zed
  }
  throw "Claude Code CLI not found (PATH, standard install locations, Zed bundle). Install it or pass -ClaudePath."
}

function Invoke-Preflight {
  $remote = (Invoke-Git @("remote", "get-url", "origin")).Trim()
  if ($remote -notmatch [regex]::Escape($script:ExpectedRepo)) { throw "FATAL: origin is $remote, not $script:ExpectedRepo" }
  $gitDir = (Invoke-Git @("rev-parse", "--git-dir")).Trim()
  $gitDirFull = if ([System.IO.Path]::IsPathRooted($gitDir)) { $gitDir } else { Join-Path $script:Repo $gitDir }
  foreach ($marker in @("MERGE_HEAD", "rebase-merge", "rebase-apply", "CHERRY_PICK_HEAD", "REVERT_HEAD")) {
    if (Test-Path (Join-Path $gitDirFull $marker)) { throw "FATAL: an unresolved $marker is in progress; resolve it by hand" }
  }
  $auth = Invoke-Native "gh" @("auth", "status") -AllowFail
  if ($auth.Code -ne 0) { throw "OWNER: gh is not authenticated (gh auth status failed)" }
  $codex = Get-Command "codex.cmd" -ErrorAction SilentlyContinue
  if ($null -eq $codex) { $codex = Get-Command "codex" -ErrorAction SilentlyContinue }
  if ($null -eq $codex) { throw "OWNER: the Codex CLI is not installed or not on PATH" }
  $nodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
  if ($null -eq $nodeCmd) { throw "OWNER: Node.js is not on PATH (it runs the redacting Claude launcher)" }
  $script:Node = $nodeCmd.Source
  $script:Launcher = Join-Path $script:Repo "scripts\autopilot\run-claude.mjs"
  if (-not (Test-Path $script:Launcher)) { throw "FATAL: scripts/autopilot/run-claude.mjs is missing" }
  $script:Claude = Resolve-Claude
  $ver = Invoke-Native $script:Claude @("--version") -AllowFail
  if ($ver.Code -ne 0) { throw "OWNER: the Claude CLI at $script:Claude does not run: $(Redact $ver.Text)" }
  # The excluded local files must never be staged or tracked.
  $staged = (Invoke-Git @("diff", "--cached", "--name-only")) -split "`n" | Where-Object { $_ -ne "" }
  $tracked = (Invoke-Git @("ls-files")) -split "`n"
  foreach ($x in $script:ExcludedLocalFiles) {
    foreach ($f in @($staged + $tracked)) {
      if ($f -eq $x -or ($x.EndsWith("/") -and $f.StartsWith($x))) { throw "FATAL: excluded local file $f is staged or tracked" }
    }
  }
  Write-Log "preflight ok: repo $script:Repo, gh authenticated, codex $($codex.Source), claude $($ver.Text.Trim())"
}

# ---------------------------------------------------------------------------
# Claude launch
# ---------------------------------------------------------------------------

# Windows command-line quoting (CommandLineToArgvW rules).
function ConvertTo-Arg([string]$a) {
  if ($a -ne "" -and $a -notmatch '[\s"]') { return $a }
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append('"')
  $slashes = 0
  foreach ($ch in $a.ToCharArray()) {
    if ($ch -eq '\') { $slashes++; continue }
    if ($ch -eq '"') { [void]$sb.Append('\' * ($slashes * 2 + 1)); [void]$sb.Append('"'); $slashes = 0; continue }
    if ($slashes -gt 0) { [void]$sb.Append('\' * $slashes); $slashes = 0 }
    [void]$sb.Append($ch)
  }
  if ($slashes -gt 0) { [void]$sb.Append('\' * ($slashes * 2)) }
  [void]$sb.Append('"')
  return $sb.ToString()
}

function New-ClaudePrompt($entry, $state, [string]$resumeNote) {
  $queueRel = $QueueFile
  $merged = @($state.merged | ForEach-Object { "- $($_.id): PR #$($_.pr), merge $($_.mergeSha)" }) -join "`n"
  if ($merged -eq "") { $merged = "- none recorded since the queue file was last updated" }
  $wclLine = if ($entry.Wcl -eq "NONE") { "Warcraft Logs network permission for this tranche: NONE. Do not make, plan to make, or run anything that makes a Warcraft Logs request (no probe, no vitest.probe.config.ts). If the tranche cannot be done without one, stop with OWNER_DECISION_REQUIRED." } else { "Warcraft Logs permission for this tranche: exactly the owner grant '$($entry.Wcl)' and nothing beyond it. Record every request you make in agent/review-request.md." }
  $publicLine = if ($entry.PublicContract -eq "NONE") { "This tranche declares NO public contract change: do not change src/contracts/, src/api/ or src/mcp/. If the work needs one, stop with OWNER_DECISION_REQUIRED." } else { "This tranche declares a public contract change as EXPECTED; describe it precisely in agent/review-request.md." }
  return @"
Execute the next READY autopilot tranche according to CLAUDE.md and $queueRel. Complete the entire autonomous tranche workflow. Do not stop after implementation. Continue through local validation, Codex review, corrections, commit, push, PR creation, GitHub CI and GitHub review. Stop only for an explicit autopilot stop condition.

AUTOPILOT CONTEXT (from the supervisor; you run unattended, with no owner present):
- Tranche: $($entry.Id): $($entry.Title)
- Branch (stable identity; reuse it, never create a second branch or PR for this tranche): $($entry.Branch)
- Base: create the branch from origin/$($entry.Base) and open the PR against $($entry.Base) (gh pr create --base $($entry.Base)).
- $wclLine
- $publicLine
- Merging is the supervisor's job: never run gh pr merge, never push to main.
- After the local OpenAI review returns APPROVED, do not modify any file before committing; if you must, rerun the review. The supervisor checks that the committed tree is exactly the reviewed tree.
- Merged tranches the queue file does not yet record (update their entries in $queueRel to MERGED with pr and mergeSha as part of this tranche's changes):
$merged
- Set this tranche's own queue entry status to PR_OPEN in the same commit that opens the PR.
$resumeNote

When you finish, end your final message with exactly these lines (the supervisor parses them):
AUTOPILOT_RESULT: <READY_FOR_GATE|OWNER_DECISION_REQUIRED|RETRYABLE_FAILURE|FATAL_FAILURE>
AUTOPILOT_PR: <PR number or NONE>
AUTOPILOT_SHA: <the full PR head commit SHA from git rev-parse HEAD after your last push, or NONE>
AUTOPILOT_DECISION: <for OWNER_DECISION_REQUIRED, the one decision the owner must make, in plain English; otherwise NONE>
READY_FOR_GATE means: local OpenAI review APPROVED for the committed tree, PR open, CI green, no GitHub CHANGES_REQUIRED.
"@
}

function Stop-ProcessTree([int]$processId) {
  $r = Invoke-Native "taskkill" @("/PID", "$processId", "/T", "/F") -AllowFail
  if ($r.Code -ne 0) { Write-Log "note: taskkill of $processId returned $($r.Code)" }
}

# Claude runs under scripts/autopilot/run-claude.mjs, which writes its stdout
# and stderr to files line by line, REDACTED BEFORE WRITING. The transcript is
# therefore on disk as it is produced (a restart can audit a run its
# supervisor did not see finish) and no raw secret is ever persisted. The
# wrapper's command line names the transcript, which is how a restart finds a
# run that outlived its supervisor.
function New-TranscriptPath([string]$label) {
  return Join-Path $script:Dir "claude-$label-$(Get-Date -Format 'yyyyMMdd-HHmmss').jsonl"
}

function Invoke-Claude([string]$prompt, [string]$label, [string]$trancheId, [int]$attempt, [string]$runLog) {
  $promptFile = Join-Path $script:Dir "prompt-$label.txt"
  [System.IO.File]::WriteAllText($promptFile, $prompt, (New-Object System.Text.UTF8Encoding $false))
  $claudeArgs = @("-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits", "--max-turns", "$MaxClaudeTurns")
  $claudeArgs += "--allowedTools"; $claudeArgs += $script:AllowedTools
  $claudeArgs += "--disallowedTools"; $claudeArgs += $script:DisallowedTools
  Write-Log "launching Claude ($label, attempt $attempt): $script:Claude, transcript $runLog"
  return Start-LoggedRun $script:Claude $claudeArgs $promptFile $runLog ($ClaudeTimeoutMinutes * 60)
}

# Runs a program under the redacting launcher and waits for it, at most
# $timeoutSeconds; on timeout the whole process tree is stopped. Returns the
# (already redacted) transcript and stderr, and refreshes latest-claude.jsonl.
function Start-LoggedRun([string]$program, [string[]]$programArgs, [string]$stdinFile, [string]$runLog, [int]$timeoutSeconds) {
  $errLog = "$runLog.stderr.txt"
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $script:Node
  $psi.Arguments = ((@($script:Launcher, $stdinFile, $runLog, $errLog, "--", $program) + @($programArgs)) | ForEach-Object { ConvertTo-Arg $_ }) -join " "
  $psi.WorkingDirectory = $script:Repo
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $proc = New-Object System.Diagnostics.Process
  $proc.StartInfo = $psi
  [void]$proc.Start()
  $script:ClaudeProcess = $proc
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  $poll = [Math]::Min(30000, [Math]::Max(1000, $timeoutSeconds * 250))
  while (-not $proc.WaitForExit($poll)) {
    Set-Status @{ lastActivityAt = (Get-Date).ToString("o") }
    if ((Get-Date) -gt $deadline) {
      Write-Log "the run exceeded $timeoutSeconds s; stopping its process tree"
      Stop-ProcessTree $proc.Id
      break
    }
  }
  $proc.WaitForExit()
  $script:ClaudeProcess = $null
  # Both files were redacted line by line as they were written.
  $transcript = if (Test-Path $runLog) { [System.IO.File]::ReadAllText($runLog, [System.Text.Encoding]::UTF8) } else { "" }
  $stderr = if (Test-Path $errLog) { [System.IO.File]::ReadAllText($errLog, [System.Text.Encoding]::UTF8) } else { "" }
  if (Test-Path $runLog) { Copy-Item -Force $runLog (Join-Path $script:Dir "latest-claude.jsonl") }
  return [pscustomobject]@{ ExitCode = $proc.ExitCode; Transcript = $transcript; Stderr = $stderr; Path = $runLog }
}

function Read-ClaudeResult([string]$transcript) {
  $final = ""
  $isError = $false
  foreach ($line in ($transcript -split "`n")) {
    if ($line -notmatch '"type"\s*:\s*"result"') { continue }
    try { $o = $line | ConvertFrom-Json } catch { continue }
    # Strict mode: a result event may lack either field; absent is "" / false, never a crash.
    if ($null -ne $o.PSObject.Properties["type"] -and $o.type -eq "result") {
      $final = if ($null -ne $o.PSObject.Properties["result"]) { [string]$o.result } else { "" }
      $isError = if ($null -ne $o.PSObject.Properties["is_error"]) { [bool]$o.is_error } else { $false }
    }
  }
  $markers = @{}
  foreach ($k in @("AUTOPILOT_RESULT", "AUTOPILOT_PR", "AUTOPILOT_SHA", "AUTOPILOT_DECISION")) {
    $m = [regex]::Match($final, "(?m)^\s*$k\s*:\s*(.+?)\s*$")
    $markers[$k] = if ($m.Success) { $m.Groups[1].Value } else { "" }
  }
  return [pscustomobject]@{ Final = $final; IsError = $isError; Markers = $markers }
}

# Every EXECUTED tool action Claude took (including a subagent's, which the
# stream carries as its own tool_use messages), checked for Warcraft Logs or
# probe activity. Reads and edits are not execution and are not checked.
function Test-TranscriptWcl([string]$transcript) {
  $hits = New-Object System.Collections.ArrayList
  foreach ($line in ($transcript -split "`n")) {
    if ($line -notmatch '"tool_use"') { continue }
    try { $o = $line | ConvertFrom-Json } catch { continue }
    $content = @()
    if ($null -ne $o.PSObject.Properties["message"] -and $null -ne $o.message.PSObject.Properties["content"]) { $content = @($o.message.content) }
    foreach ($c in $content) {
      if ($c.type -ne "tool_use") { continue }
      $name = [string]$c.name
      if ($script:ExecutingTools -notcontains $name -and -not $name.StartsWith("mcp__")) { continue }
      $toolInput = ($c.input | ConvertTo-Json -Depth 6 -Compress)
      foreach ($p in $script:WclActivityPatterns) {
        if ($toolInput -match $p) {
          $detail = Redact $toolInput
          if ($detail.Length -gt 240) { $detail = $detail.Substring(0, 240) + "..." }
          [void]$hits.Add("$($name) [$p]: $detail")
          break
        }
      }
    }
  }
  return , $hits.ToArray()
}

# ---------------------------------------------------------------------------
# The merge gate (every condition verified; none inferred from absence)
# ---------------------------------------------------------------------------

function Get-ReviewMeta {
  $meta = Join-Path $script:Repo ".probe\openai-review\latest.meta.json"
  $latest = Join-Path $script:Repo ".probe\openai-review\latest.txt"
  if (-not (Test-Path $meta) -or -not (Test-Path $latest)) { return $null }
  $m = Get-Content -Raw -Encoding UTF8 $meta | ConvertFrom-Json
  $text = Get-Content -Raw -Encoding UTF8 $latest
  $v = [regex]::Match($text, '(?m)^\s*VERDICT:\s*(APPROVED|CHANGES_REQUIRED|OWNER_DECISION_REQUIRED)\s*$')
  $verdict = if ($v.Success) { $v.Groups[1].Value } else { "NONE" }
  if ($m.verdict -ne $verdict) { return $null }
  return $m
}

# Pure: why the checks are not green, or nothing. Every entry of every
# required check must be COMPLETED and SUCCESS (a re-run can leave an old
# SUCCESS beside a new pending or failed entry); a required check that never
# reported blocks; and any check anywhere that is still running or failed
# blocks too.
function Get-CheckState($x) {
  $status = if ($null -ne $x.PSObject.Properties["status"]) { [string]$x.status } else { "" }
  $conclusion = if ($null -ne $x.PSObject.Properties["conclusion"]) { [string]$x.conclusion } else { "" }
  $state = if ($null -ne $x.PSObject.Properties["state"]) { [string]$x.state } else { "" }
  if ($status -ne "") {
    if ($status -ne "COMPLETED") { return "PENDING" }
    if ($conclusion -eq "SUCCESS") { return "SUCCESS" }
    return "FAILED:$conclusion"
  }
  if ($state -eq "SUCCESS") { return "SUCCESS" }
  if (@("PENDING", "EXPECTED", "") -contains $state) { return "PENDING" }
  return "FAILED:$state"
}

function Get-CheckName($x) {
  if ($null -ne $x.PSObject.Properties["name"] -and "$($x.name)" -ne "") { return [string]$x.name }
  if ($null -ne $x.PSObject.Properties["context"]) { return [string]$x.context }
  return ""
}

function Test-RequiredChecks($rollup, $required) {
  $reasons = New-Object System.Collections.ArrayList
  $rollup = @($rollup | Where-Object { $null -ne $_ })
  foreach ($name in @($required)) {
    $entries = @($rollup | Where-Object { (Get-CheckName $_) -eq $name })
    if ($entries.Count -eq 0) { [void]$reasons.Add("required check '$name' has not reported"); continue }
    foreach ($e in $entries) {
      $st = Get-CheckState $e
      if ($st -ne "SUCCESS") { [void]$reasons.Add("required check '$name' has an entry that is $st") }
    }
  }
  foreach ($x in $rollup) {
    $name = Get-CheckName $x
    if (@($required) -contains $name) { continue }
    $st = Get-CheckState $x
    if ($st -ne "SUCCESS") { [void]$reasons.Add("check '$name' is $st") }
  }
  return , $reasons.ToArray()
}

# Pure: unresolved change requests. Per author, only DECISIVE review states
# count (APPROVED, CHANGES_REQUESTED, DISMISSED), latest by time: a later
# COMMENTED or PENDING review does not resolve an earlier change request. The
# aggregate reviewDecision blocks too when it says CHANGES_REQUESTED.
function Test-GithubReviews($reviews, [string]$reviewDecision) {
  $reasons = New-Object System.Collections.ArrayList
  if ($reviewDecision -eq "CHANGES_REQUESTED") { [void]$reasons.Add("GitHub review decision is CHANGES_REQUESTED") }
  $decisive = @{}
  $ordered = @(@($reviews) | Where-Object { $null -ne $_ } | Sort-Object { if ($null -ne $_.PSObject.Properties["submittedAt"]) { [string]$_.submittedAt } else { "" } })
  foreach ($r in $ordered) {
    $state = if ($null -ne $r.PSObject.Properties["state"]) { [string]$r.state } else { "" }
    if (@("APPROVED", "CHANGES_REQUESTED", "DISMISSED") -notcontains $state) { continue }
    $login = if ($null -ne $r.PSObject.Properties["author"] -and $null -ne $r.author -and $null -ne $r.author.PSObject.Properties["login"]) { [string]$r.author.login } else { "(unknown)" }
    $decisive[$login] = $state
  }
  foreach ($k in $decisive.Keys) { if ($decisive[$k] -eq "CHANGES_REQUESTED") { [void]$reasons.Add("unresolved CHANGES_REQUESTED review by $k") } }
  return , $reasons.ToArray()
}

# The latest GitHub architecture-review verdict, by TIME across reviews
# (submittedAt) and comments (createdAt) together; the last VERDICT line of a
# body is that body's verdict. "" when there is none.
function Get-LatestGithubVerdict($reviews, $comments) {
  $events = New-Object System.Collections.ArrayList
  foreach ($r in @($reviews)) {
    if ($null -eq $r) { continue }
    $at = if ($r.PSObject.Properties["submittedAt"]) { [string]$r.submittedAt } else { "" }
    [void]$events.Add([pscustomobject]@{ At = $at; Body = [string]$r.body })
  }
  foreach ($c in @($comments)) {
    if ($null -eq $c) { continue }
    $at = if ($c.PSObject.Properties["createdAt"]) { [string]$c.createdAt } else { "" }
    [void]$events.Add([pscustomobject]@{ At = $at; Body = [string]$c.body })
  }
  $latest = ""
  $latestAt = [datetime]::MinValue
  foreach ($e in $events) {
    $mm = [regex]::Matches($e.Body, '(?m)^\s*VERDICT:\s*(APPROVED|CHANGES_REQUIRED|OWNER_DECISION_REQUIRED)\s*$')
    if ($mm.Count -eq 0) { continue }
    $when = [datetime]::MinValue
    if (-not [datetime]::TryParse($e.At, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::RoundtripKind, [ref]$when)) {
      # An undated verdict cannot be ordered: treat it as needing attention.
      return "CHANGES_REQUIRED"
    }
    if ($latest -eq "" -or $when -ge $latestAt) { $latest = $mm[$mm.Count - 1].Groups[1].Value; $latestAt = $when }
  }
  return $latest
}

# ---- the Warcraft Logs audit, recorded per Claude run and bound to a head ----

function Get-AuditPath([string]$id) {
  $dir = Join-Path $script:Dir "audit"
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  return Join-Path $dir ("{0}.json" -f $id.ToLowerInvariant())
}

function Read-AuditRecords([string]$id) {
  $path = Get-AuditPath $id
  if (-not (Test-Path $path)) { return @() }
  return @((Get-Content -Raw -Encoding UTF8 $path | ConvertFrom-Json).records)
}

# Writes (or replaces) the record of one attempt. Atomic.
function Set-AuditRecord([string]$id, $record) {
  $records = @(Read-AuditRecords $id | Where-Object { [int]$_.attempt -ne [int]$record.attempt }) + @($record)
  $records = @($records | Sort-Object { [int]$_.attempt })
  Write-JsonAtomic (Get-AuditPath $id) ([pscustomobject]@{ tranche = $id; records = $records })
}

function Get-MaxAuditAttempt([string]$id) {
  $max = 0
  foreach ($r in @(Read-AuditRecords $id)) { if ([int]$r.attempt -gt $max) { $max = [int]$r.attempt } }
  return $max
}

# Audits one transcript. Conservative: it is auditable only when the stream
# opens with Claude's system init event and every line parses as JSON, except
# a LAST line that is a truncated JSON object (a message cut off mid-write was
# never executed). Empty, garbage-only or init-less output proves nothing.
# The candidate a run is bound to is the head SHA the RUN ITSELF reported
# (AUTOPILOT_SHA), and only when it is the head actually observed at audit
# time (exact, or an unambiguous prefix of at least 7 characters). A head
# that moved, a run that reported none, or a run interrupted before it
# reported leaves the record UNBOUND (candidateSha ""), and the gate blocks:
# a later commit is never attributed to an earlier audited run.
function Get-CandidateBinding([string]$claimed, [string]$observed) {
  $c = $claimed.Trim().ToLowerInvariant()
  $o = $observed.Trim().ToLowerInvariant()
  if ($c -eq "" -or $c -eq "none" -or $o -eq "" -or $o -eq "none") { return [pscustomobject]@{ Sha = ""; Note = "unbound: the run reported '$claimed', the observed head is '$observed'" } }
  if ($c -eq $o -or ($c.Length -ge 7 -and $o.StartsWith($c))) { return [pscustomobject]@{ Sha = $observed.Trim(); Note = "bound: the run reported $claimed" } }
  return [pscustomobject]@{ Sha = ""; Note = "unbound: the run reported $claimed but the observed head is $observed" }
}

function New-AuditRecord([int]$attempt, [string]$transcript, [string]$path, [string]$observedHead) {
  $lines = @($transcript -split "`n" | Where-Object { $_.Trim() -ne "" })
  $auditable = $lines.Count -gt 0
  $why = ""
  if (-not $auditable) { $why = "empty transcript" }
  for ($i = 0; $auditable -and $i -lt $lines.Count; $i++) {
    $parsed = $null
    try { $parsed = $lines[$i] | ConvertFrom-Json } catch { $parsed = $null }
    if ($i -eq 0 -and ($null -eq $parsed -or [string]$parsed.type -ne "system" -or [string]$parsed.subtype -ne "init")) { $auditable = $false; $why = "no init event"; break }
    if ($null -eq $parsed) {
      $lastTruncatedObject = ($i -eq $lines.Count - 1) -and $lines[$i].TrimStart().StartsWith("{")
      if (-not $lastTruncatedObject) { $auditable = $false; $why = "line $($i + 1) is not JSON" }
    }
  }
  $hits = Test-TranscriptWcl $transcript
  $sha = [System.BitConverter]::ToString((New-Object System.Security.Cryptography.SHA256Managed).ComputeHash([System.Text.Encoding]::UTF8.GetBytes($transcript))).Replace("-", "").ToLowerInvariant()
  # The run's own result travels with its audit, so a decision Claude asked
  # for survives a supervisor crash: recovery re-reads it from the transcript.
  $parsed = Read-ClaudeResult $transcript
  $binding = Get-CandidateBinding ([string]$parsed.Markers["AUTOPILOT_SHA"]) $observedHead
  return [pscustomobject]@{
    attempt = $attempt
    status = "COMPLETED"
    candidateBinding = $binding.Note
    result = [string]$parsed.Markers["AUTOPILOT_RESULT"]
    decision = [string]$parsed.Markers["AUTOPILOT_DECISION"]
    queueHash = (Get-QueueHash)
    transcript = $path
    transcriptSha256 = $sha
    lines = $lines.Count
    auditable = $auditable
    unauditableReason = $why
    wclHits = @($hits)
    candidateSha = $binding.Sha
    at = (Get-Date).ToString("o")
  }
}

# Restart recovery: an attempt whose record is still STARTED was interrupted
# with its supervisor. Stop the run if it outlived the supervisor (same PID
# AND start time, so a reused PID is never touched), then audit the transcript
# it left on disk. A transcript that cannot be audited stays unauditable, and
# the gate sends that to the owner rather than burning retries.
# Processes still running a given transcript: the cmd.exe wrapper's command
# line names the transcript file, so this finds a run that outlived its
# supervisor without trusting a recorded PID.
function Get-ProcessesForTranscript([string]$path) {
  $leaf = [System.IO.Path]::GetFileName($path)
  return @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $null -ne $_.CommandLine -and $_.CommandLine.Contains($leaf) })
}

function Resume-InterruptedAttempts($entry) {
  foreach ($r in @(Read-AuditRecords $entry.Id | Where-Object { $_.status -eq "STARTED" })) {
    Write-Log "recovering interrupted attempt $($r.attempt) of $($entry.Id)"
    $path = [string]$r.transcript
    $running = @(Get-ProcessesForTranscript $path)
    foreach ($proc in $running) { Write-Log "stopping a run that outlived its supervisor (pid $($proc.ProcessId))"; Stop-ProcessTree ([int]$proc.ProcessId) }
    if (-not (Test-Path $path) -and $running.Count -eq 0) {
      # Recorded but never launched: no Claude ran, so there is nothing to
      # audit. The record stays, as WITHDRAWN, so the attempt number is
      # accounted for and numbering stays continuous.
      Write-Log "attempt $($r.attempt) was recorded but never launched; it is WITHDRAWN"
      Set-AuditRecord $entry.Id ([pscustomobject]@{ attempt = [int]$r.attempt; status = "WITHDRAWN"; transcript = $path; at = (Get-Date).ToString("o") })
      continue
    }
    $transcript = if (Test-Path $path) { [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8) } else { "" }
    $recovered = New-AuditRecord ([int]$r.attempt) $transcript ([string]$r.transcript) (Get-CandidateSha $entry)
    $recovered.status = "RECOVERED"
    Set-AuditRecord $entry.Id $recovered
  }
}

# Pure: what the recorded audits allow. Missing or interrupted evidence blocks
# the merge; unauditable evidence or unauthorized activity needs the owner; and
# the PR head must be what the last audited run left, so no commit escaped audit.
function Test-AuditEvidence($records, [int]$attempts, [string]$headSha, [string]$wcl) {
  $reasons = New-Object System.Collections.ArrayList
  $owner = New-Object System.Collections.ArrayList
  $records = @($records | Where-Object { $null -ne $_ })
  if ($records.Count -eq 0) {
    [void]$reasons.Add("no Warcraft Logs audit evidence: the candidate was not produced by an audited supervisor run")
    return [pscustomobject]@{ Reasons = $reasons; Owner = $owner }
  }
  $seen = @($records | ForEach-Object { [int]$_.attempt })
  for ($n = 1; $n -le $attempts; $n++) {
    if ($seen -notcontains $n) { [void]$reasons.Add("no audit record for Claude attempt $n") }
  }
  foreach ($r in $records) {
    if ($r.status -eq "WITHDRAWN") { continue }
    if ($r.status -eq "STARTED") { [void]$reasons.Add("attempt $($r.attempt) was interrupted and has not been recovered"); continue }
    if (-not $r.auditable -and -not (Test-OwnerConfirmed $r)) { [void]$owner.Add("the transcript of attempt $($r.attempt) cannot be audited ($($r.unauditableReason)); the owner must inspect it and confirm no Warcraft Logs activity occurred") }
    # The audit cannot yet prove a request is inside a grant's scope, so ANY
    # detected Warcraft Logs or probe activity, under a grant or not, needs
    # the owner's confirmation of that record (ownerConfirmed).
    if (@($r.wclHits).Count -gt 0 -and -not (Test-OwnerConfirmed $r)) { [void]$owner.Add("attempt $($r.attempt) shows Warcraft Logs or probe activity (grant: $wcl); the owner must confirm it is within the grant: $(@($r.wclHits) -join '; ')") }
  }
  # The candidate is what the last run that actually RAN left; a withdrawn attempt ran nothing.
  $ran = @($records | Where-Object { $_.status -ne "WITHDRAWN" })
  if ($ran.Count -eq 0) {
    [void]$reasons.Add("no audited Claude run: every recorded attempt was withdrawn before launch")
    return [pscustomobject]@{ Reasons = $reasons; Owner = $owner }
  }
  $last = $ran | Sort-Object { [int]$_.attempt } | Select-Object -Last 1
  # A STARTED record has no candidate yet; strict mode must not turn that into a crash.
  $lastSha = if ($null -ne $last.PSObject.Properties["candidateSha"]) { [string]$last.candidateSha } else { "" }
  $note = if ($null -ne $last.PSObject.Properties["candidateBinding"]) { [string]$last.candidateBinding } else { "" }
  if ($lastSha -eq "" -or $lastSha -ne $headSha) { [void]$reasons.Add("the PR head $headSha is not a candidate the last audited run produced ($(if ($lastSha -eq '') { $note } else { $lastSha }))") }
  return [pscustomobject]@{ Reasons = $reasons; Owner = $owner }
}

function Get-CandidateSha($entry) {
  $pr = Find-Pr $entry "open"
  if ($null -ne $pr) { return [string]$pr.headRefOid }
  $r = Invoke-Native "git" @("-C", $script:Repo, "ls-remote", "origin", "refs/heads/$($entry.Branch)") -AllowFail
  if ($r.Code -eq 0 -and $r.Text -match '^([0-9a-f]{40})') { return $Matches[1] }
  return "NONE"
}

function Test-MergeGate($entry, $expectedChecks) {
  $reasons = New-Object System.Collections.ArrayList
  $owner = New-Object System.Collections.ArrayList
  $pr = Find-Pr $entry "open"
  if ($null -eq $pr) { [void]$reasons.Add("no open PR for branch $($entry.Branch)"); return [pscustomobject]@{ Decision = "RETRYABLE_FAILURE"; Reasons = $reasons; Pr = $null; Sha = "" } }
  $sha = [string]$pr.headRefOid
  if ($pr.headRefName -eq "main") { [void]$reasons.Add("PR head is main") }
  if ($pr.headRefName -ne $entry.Branch) { [void]$reasons.Add("PR head $($pr.headRefName) is not the tranche branch $($entry.Branch)") }
  if ($pr.baseRefName -ne $entry.Base) { [void]$reasons.Add("PR base is $($pr.baseRefName), not the declared base $($entry.Base)") }

  # 1. Local OpenAI review APPROVED for exactly this commit's tree.
  $meta = Get-ReviewMeta
  if ($null -eq $meta) { [void]$reasons.Add("no readable local OpenAI review verdict with metadata") }
  else {
    Invoke-Git @("fetch", "origin", $pr.headRefName) | Out-Null
    $tree = (Invoke-Git @("rev-parse", "$sha^{tree}")).Trim()
    if ($meta.verdict -eq "OWNER_DECISION_REQUIRED") { [void]$owner.Add("the local OpenAI review returned OWNER_DECISION_REQUIRED") }
    elseif ($meta.verdict -ne "APPROVED") { [void]$reasons.Add("local OpenAI review verdict is $($meta.verdict)") }
    if ($meta.reviewedTree -ne $tree) { [void]$reasons.Add("the reviewed tree $($meta.reviewedTree) is not the PR head tree $tree") }
  }

  # 2. PR details, CI, reviews, mergeability.
  # GitHub computes mergeability lazily: UNKNOWN is "not yet", re-read a few times.
  $view = $null
  for ($i = 0; $i -lt 6; $i++) {
    $view = (Invoke-Gh @("pr", "view", "$($pr.number)", "--json", "number,headRefOid,mergeable,mergeStateStatus,reviewDecision,reviews,comments,statusCheckRollup,baseRefName,isDraft")) | ConvertFrom-Json
    if ($view.mergeable -ne "UNKNOWN") { break }
    Start-Sleep -Seconds 10
  }
  if ($view.headRefOid -ne $sha) { [void]$reasons.Add("PR head moved while gating") }
  if ([string]$view.baseRefName -ne $entry.Base) { [void]$reasons.Add("PR base is now $($view.baseRefName), not the declared base $($entry.Base)") }
  if ($view.isDraft) { [void]$reasons.Add("PR is a draft") }
  if ($view.mergeable -ne "MERGEABLE") { [void]$reasons.Add("PR mergeable is $($view.mergeable)") }
  foreach ($x in (Test-RequiredChecks @($view.statusCheckRollup) $expectedChecks)) { [void]$reasons.Add($x) }
  foreach ($x in (Test-GithubReviews @($view.reviews) ([string]$view.reviewDecision))) { [void]$reasons.Add($x) }
  $last = Get-LatestGithubVerdict @($view.reviews) @($view.comments)
  if ($last -eq "OWNER_DECISION_REQUIRED") { [void]$owner.Add("the GitHub architecture review returned OWNER_DECISION_REQUIRED") }
  elseif ($last -ne "" -and $last -ne "APPROVED") { [void]$reasons.Add("the latest GitHub architecture review verdict is $last") }

  # 2a. No unresolved owner decision recorded for this tranche.
  $block = Get-OwnerBlock (Read-State) (Read-AuditRecords $entry.Id) $entry.Id (Get-QueueHash)
  if ($block -ne "") { [void]$owner.Add($block) }

  # 2b. The Warcraft Logs audit of every Claude run of this tranche, bound to this head.
  $gateState = Read-State
  $stateAttempts = if ($null -eq $gateState) { 0 } else { Get-Attempts $gateState $entry.Id }
  $audit = Test-AuditEvidence (Read-AuditRecords $entry.Id) ([Math]::Max($stateAttempts, (Get-MaxAuditAttempt $entry.Id))) $sha $entry.Wcl
  foreach ($x in $audit.Reasons) { [void]$reasons.Add($x) }
  foreach ($x in $audit.Owner) { [void]$owner.Add($x) }

  # 3. Declared public contract behavior.
  Invoke-Git @("fetch", "origin", $entry.Base) | Out-Null
  $base = (Invoke-Git @("merge-base", "origin/$($entry.Base)", $sha)).Trim()
  $changed = (Invoke-Git @("diff", "--name-only", "$base..$sha")) -split "`n" | Where-Object { $_ -ne "" }
  $publicTouched = @($changed | Where-Object { $f = $_; @($script:PublicContractPaths | Where-Object { $f.StartsWith($_) }).Count -gt 0 })
  if ($entry.PublicContract -eq "NONE" -and $publicTouched.Count -gt 0) { [void]$owner.Add("unexpected public contract change: $($publicTouched -join ', ')") }
  foreach ($x in $script:ExcludedLocalFiles) {
    foreach ($f in $changed) { if ($f -eq $x -or ($x.EndsWith("/") -and $f.StartsWith($x))) { [void]$reasons.Add("excluded local file $f is in the PR") } }
  }

  $decision = if ($owner.Count -gt 0) { "OWNER_DECISION_REQUIRED" } elseif ($reasons.Count -gt 0) { "RETRYABLE_FAILURE" } else { "READY_TO_MERGE" }
  return [pscustomobject]@{ Decision = $decision; Reasons = @($reasons + $owner); Pr = $pr.number; Sha = $sha }
}

function Wait-Ci([int]$prNumber) {
  $deadline = (Get-Date).AddMinutes($CiTimeoutMinutes)
  while ((Get-Date) -lt $deadline) {
    $view = (Invoke-Gh @("pr", "view", "$prNumber", "--json", "statusCheckRollup")) | ConvertFrom-Json
    $pending = @($view.statusCheckRollup | Where-Object {
        $s = if ($_.PSObject.Properties["status"]) { [string]$_.status } else { [string]$_.state }
        @("QUEUED", "IN_PROGRESS", "PENDING", "WAITING", "REQUESTED", "EXPECTED") -contains $s
      })
    if (@($view.statusCheckRollup).Count -gt 0 -and $pending.Count -eq 0) { return $true }
    Set-Status @{ phase = "WAITING_FOR_CI"; ciState = "PENDING"; lastActivityAt = (Get-Date).ToString("o") }
    Start-Sleep -Seconds $PollSeconds
  }
  return $false
}

# ---------------------------------------------------------------------------
# Merge
# ---------------------------------------------------------------------------

function Invoke-Merge($entry, $gate, $state) {
  if ($entry.Base -ne "main") {
    Write-Log "WOULD_MERGE: PR #$($gate.Pr) at $($gate.Sha) passes every gate, but it is stacked on $($entry.Base); the supervisor merges only into main"
    Set-Status @{ phase = "WOULD_MERGE"; prNumber = $gate.Pr; candidateSha = $gate.Sha }
    return $false
  }
  if ($NoMerge) {
    Write-Log "WOULD_MERGE: PR #$($gate.Pr) at $($gate.Sha) passes every gate (-NoMerge: not merging)"
    Set-Status @{ phase = "WOULD_MERGE"; prNumber = $gate.Pr; candidateSha = $gate.Sha }
    return $false
  }
  if (Test-Path $script:StopFile) { throw "RECOVERABLE: STOP requested immediately before merging; not merged" }
  # Head pinning cannot see a retargeted PR (the head SHA is unchanged), so the
  # base and head are re-read immediately before merging.
  $now = (Invoke-Gh @("pr", "view", "$($gate.Pr)", "--json", "state,baseRefName,headRefOid")) | ConvertFrom-Json
  if ([string]$now.state -ne "OPEN" -or [string]$now.baseRefName -ne $entry.Base -or [string]$now.headRefOid -ne $gate.Sha) {
    throw "RECOVERABLE: PR #$($gate.Pr) changed before merging (state $($now.state), base $($now.baseRefName), head $($now.headRefOid)); not merged"
  }
  Write-Log "merging PR #$($gate.Pr) at $($gate.Sha) (squash, head pinned)"
  Invoke-Gh @("pr", "merge", "$($gate.Pr)", "--squash", "--match-head-commit", $gate.Sha) | Out-Null
  $deadline = (Get-Date).AddMinutes(15)
  $merged = $null
  while ((Get-Date) -lt $deadline) {
    $v = (Invoke-Gh @("pr", "view", "$($gate.Pr)", "--json", "state,mergeCommit")) | ConvertFrom-Json
    if ($v.state -eq "MERGED" -and $null -ne $v.mergeCommit) { $merged = $v; break }
    Start-Sleep -Seconds 20
  }
  if ($null -eq $merged) { throw "RECOVERABLE: PR #$($gate.Pr) did not report MERGED within 15 minutes" }
  $mergeSha = [string]$merged.mergeCommit.oid
  Invoke-Git @("fetch", "origin", "--prune") | Out-Null
  Invoke-Git @("checkout", "main") | Out-Null
  Invoke-Git @("merge", "--ff-only", "origin/main") | Out-Null
  $contains = Invoke-Native "git" @("-C", $script:Repo, "merge-base", "--is-ancestor", $mergeSha, "main") -AllowFail
  if ($contains.Code -ne 0) { throw "FATAL: main does not contain merge commit $mergeSha after fast-forward" }
  $del = Invoke-Native "git" @("-C", $script:Repo, "push", "origin", "--delete", $entry.Branch) -AllowFail
  if ($del.Code -ne 0) { Write-Log "note: remote branch $($entry.Branch) not deleted: $(Redact $del.Text)" }
  $local = Invoke-Native "git" @("-C", $script:Repo, "branch", "-d", $entry.Branch) -AllowFail
  if ($local.Code -ne 0) { Write-Log "note: local branch $($entry.Branch) kept: $(Redact $local.Text)" }
  $state.merged = @($state.merged) + @([pscustomobject]@{ id = $entry.Id; pr = $gate.Pr; mergeSha = $mergeSha; at = (Get-Date).ToString("o") })
  $state.current = $null
  Save-State $state
  Write-Log "MERGED $($entry.Id): PR #$($gate.Pr), merge $mergeSha; main fast-forwarded"
  Set-Status @{ phase = "MERGED"; prNumber = $gate.Pr; mergeSha = $mergeSha; lastSuccessAt = (Get-Date).ToString("o") }
  return $true
}

# ---------------------------------------------------------------------------
# One tranche, with bounded repair cycles
# ---------------------------------------------------------------------------

# Pure: the unresolved owner decision recorded for this tranche, or "". A
# block is resolved only by recording the decision in the queue, which
# changes the queue file's hash.
function Test-OwnerBlock($state, [string]$trancheId, [string]$queueHash, $records = @()) {
  if ($null -eq $state -or $null -eq $state.PSObject.Properties["blocked"] -or $null -eq $state.blocked) { return "" }
  $b = $state.blocked
  if ([string]$b.tranche -ne $trancheId) { return "" }
  if ([string]$b.queueHash -ne $queueHash) { return "" }
  # A block saved for an audit confirmation (an unauditable transcript, or
  # detected Warcraft Logs activity) is also resolved by the owner's explicit
  # confirmation on that attempt's record. Any other kind of block (a product
  # or authority decision) is resolved only through the queue.
  if ($null -ne $b.PSObject.Properties["kind"] -and [string]$b.kind -eq "AUDIT_CONFIRMATION") {
    $confirmed = @(@($records) | Where-Object { $null -ne $_ -and [int]$_.attempt -eq [int]$b.attempt -and (Test-OwnerConfirmed $_) })
    if ($confirmed.Count -gt 0) { return "" }
  }
  return "an unresolved owner decision is recorded for $($trancheId): $($b.reason)"
}

# An unauditable record stays an owner stop until the owner, having inspected
# its transcript, sets "ownerConfirmed": true on that record in
# .probe/autopilot/audit/<tranche>.json (agent/autopilot.md).
function Test-OwnerConfirmed($record) {
  return ($null -ne $record.PSObject.Properties["ownerConfirmed"] -and $record.ownerConfirmed -eq $true)
}

# Pure: the unresolved owner decision for this tranche from EITHER source,
# or "": the block saved in state, or the latest audited run's own
# OWNER_DECISION_REQUIRED result (which survives a crash before the block was
# saved). Both are resolved only when the queue records the decision.
function Get-OwnerBlock($state, $records, [string]$trancheId, [string]$queueHash) {
  $saved = Test-OwnerBlock $state $trancheId $queueHash $records
  if ($saved -ne "") { return $saved }
  $ran = @(@($records) | Where-Object { $null -ne $_ -and $_.status -ne "WITHDRAWN" -and $_.status -ne "STARTED" })
  if ($ran.Count -eq 0) { return "" }
  foreach ($r in $ran) {
    if ($null -ne $r.PSObject.Properties["auditable"] -and -not $r.auditable -and -not (Test-OwnerConfirmed $r)) {
      return "the transcript of attempt $($r.attempt) cannot be audited ($($r.unauditableReason)); inspect it and set ownerConfirmed on its audit record"
    }
    if ($null -ne $r.PSObject.Properties["wclHits"] -and @($r.wclHits).Count -gt 0 -and -not (Test-OwnerConfirmed $r)) {
      return "attempt $($r.attempt) shows Warcraft Logs or probe activity; confirm it is authorized and set ownerConfirmed on its audit record"
    }
  }
  $last = $ran | Sort-Object { [int]$_.attempt } | Select-Object -Last 1
  $result = if ($null -ne $last.PSObject.Properties["result"]) { [string]$last.result } else { "" }
  $hash = if ($null -ne $last.PSObject.Properties["queueHash"]) { [string]$last.queueHash } else { "" }
  if ($result -eq "OWNER_DECISION_REQUIRED" -and $hash -eq $queueHash) {
    $decision = if ($null -ne $last.PSObject.Properties["decision"]) { [string]$last.decision } else { "" }
    return "Claude's attempt $($last.attempt) asked for an owner decision: $decision"
  }
  return ""
}

function Write-OwnerNote([string]$trancheId, [string]$reason) {
  $note = Join-Path $script:Dir "OWNER_DECISION_REQUIRED.md"
  [System.IO.File]::WriteAllText($note, "# Owner decision required`n`nTranche: $trancheId`n`n$reason`n`nAfter deciding, record the decision (agent/architecture.md or agent/follow-ups.md, and the queue entry), then restart the supervisor.`n", (New-Object System.Text.UTF8Encoding $false))
}

# At startup: $true when the saved block still holds (nothing may run), or
# $false after clearing a block the owner resolved, by recording the decision
# in the queue or, for an unauditable transcript, by confirming its record.
function Resolve-StartupBlock($state) {
  if ($null -eq $state.blocked) { return $false }
  $b = $state.blocked
  $still = Test-OwnerBlock $state ([string]$b.tranche) (Get-QueueHash) (Read-AuditRecords ([string]$b.tranche))
  if ($still -ne "") {
    Write-Log "still blocked on $($b.tranche) ($($b.reason)); unresolved, so nothing is run"
    Set-Status @{ supervisorState = "BLOCKED"; phase = "OWNER_DECISION_REQUIRED"; currentTranche = $b.tranche; stopReason = $b.reason }
    return $true
  }
  Write-Log "the block on $($b.tranche) is resolved; re-evaluating"
  $state.blocked = $null
  Save-State $state
  $note = Join-Path $script:Dir "OWNER_DECISION_REQUIRED.md"
  if (Test-Path $note) { Remove-Item -Force $note }
  return $false
}

function Stop-Blocked($state, [string]$trancheId, [string]$reason) {
  $kind = "DECISION"
  $attempt = 0
  # Both audit stops (an unauditable transcript, detected Warcraft Logs
  # activity) are resolved by confirming that attempt's record.
  if ($reason -match 'transcript of attempt (\d+) cannot be audited' -or $reason -match 'attempt (\d+) shows Warcraft Logs or probe activity') {
    $kind = "AUDIT_CONFIRMATION"; $attempt = [int]$Matches[1]
  }
  $state.blocked = [pscustomobject]@{ tranche = $trancheId; reason = $reason; kind = $kind; attempt = $attempt; queueHash = (Get-QueueHash); at = (Get-Date).ToString("o") }
  Save-State $state
  Write-OwnerNote $trancheId $reason
  Write-Log "NORMAL_BLOCKED: $trancheId - $reason"
  Set-Status @{ supervisorState = "BLOCKED"; phase = "OWNER_DECISION_REQUIRED"; currentTranche = $trancheId; stopReason = $reason }
}

# The top-level owner stop (an OWNER: failure anywhere, preflight included).
# It saves the block only into a READABLE (or absent) state. If the existing
# state cannot be read, nothing is saved: state.json and its backup stay
# byte-for-byte as they are, the owner note names both problems, and the run
# ends FATAL (exit 2) because the state corruption needs repair too.
function Complete-OwnerStop([string]$reason, [string]$trancheId) {
  $state = $null
  $unreadable = ""
  try { $state = Read-State } catch { $unreadable = "$($_.Exception.Message)" }
  if ($unreadable -ne "") {
    $both = "$reason. ALSO: $unreadable"
    Write-OwnerNote $trancheId $both
    Write-Log "FATAL: $both"
    Set-Status @{ supervisorState = "FATAL"; phase = "OWNER_DECISION_REQUIRED"; currentTranche = $trancheId; stopReason = $both }
    return 2
  }
  if ($null -eq $state) { $state = New-State }
  Stop-Blocked $state $trancheId $reason
  return 0
}

function Invoke-Tranche($entry, $state, $expectedChecks) {
  # Restart safety: a tranche GitHub already shows merged is never re-run.
  if (Test-Merged $entry $state) { return "ALREADY_MERGED" }
  Resume-InterruptedAttempts $entry
  $pending = Get-OwnerBlock (Read-State) (Read-AuditRecords $entry.Id) $entry.Id (Get-QueueHash)
  if ($pending -ne "") { return "OWNER:$pending" }
  # The audit is authoritative for numbering: a crash between writing an
  # attempt's record and saving the attempt count never reuses a number.
  $attempts = [Math]::Max((Get-Attempts $state $entry.Id), (Get-MaxAuditAttempt $entry.Id))
  $resume = ""
  # The retry budget limits Claude LAUNCHES, not gating. A candidate the last
  # audited run reported READY_FOR_GATE (for example, finished just before the
  # supervisor was interrupted) is gated once without a new launch, even when
  # the budget is spent; if that gate fails, no further launch is allowed.
  $gateExistingCandidate = $false
  $lastRan = @(Read-AuditRecords $entry.Id | Where-Object { $_.status -eq "COMPLETED" -or $_.status -eq "RECOVERED" }) | Sort-Object { [int]$_.attempt } | Select-Object -Last 1
  if ($null -ne $lastRan -and $null -ne $lastRan.PSObject.Properties["result"] -and [string]$lastRan.result -eq "READY_FOR_GATE") { $gateExistingCandidate = $true }
  while ($true) {
    if (Test-Path $script:StopFile) { return "STOPPED" }
    $openPr = Find-Pr $entry "open"
    $runClaude = (-not $GateOnly) -and (-not $gateExistingCandidate)
    $gateExistingCandidate = $false
    if ($runClaude -and $attempts -ge $MaxRepairCycles + 1) {
      return "FATAL:retry budget exhausted for $($entry.Id) after $attempts attempts"
    }
    if ($runClaude) {
      if ($attempts -gt 0 -or $null -ne $openPr) {
        $resume = "RESUME: earlier work for this tranche exists (attempt $($attempts + 1)). Inspect branch $($entry.Branch)" + $(if ($null -ne $openPr) { " and its open PR #$($openPr.number)" } else { "" }) + " and continue it; do not start over or open a second PR. " + $resume
      }
      $attempts++
      # The STARTED record comes first: whatever crashes after this point, a
      # restart finds the attempt and recovers or withdraws it.
      $runLog = New-TranscriptPath ($entry.Id.ToLowerInvariant())
      Set-AuditRecord $entry.Id ([pscustomobject]@{ attempt = $attempts; status = "STARTED"; transcript = $runLog; at = (Get-Date).ToString("o") })
      Set-Attempts $state $entry.Id $attempts
      $state.current = [pscustomobject]@{ id = $entry.Id; branch = $entry.Branch; attempt = $attempts; startedAt = (Get-Date).ToString("o") }
      Save-State $state
      Set-Status @{ supervisorState = "RUNNING"; currentTranche = $entry.Id; branch = $entry.Branch; phase = "CLAUDE_RUNNING"; attempt = $attempts }
      $run = Invoke-Claude (New-ClaudePrompt $entry $state $resume) ($entry.Id.ToLowerInvariant()) $entry.Id $attempts $runLog
      $result = Read-ClaudeResult $run.Transcript
      Set-Status @{ lastClaudeResult = $(if ($result.Markers["AUTOPILOT_RESULT"] -ne "") { $result.Markers["AUTOPILOT_RESULT"] } else { "NO_MARKER (exit $($run.ExitCode))" }); lastActivityAt = (Get-Date).ToString("o") }
      if ($run.Stderr -match '(?i)(invalid api key|please run /login|not logged in|authentication_error|OAuth token has expired)') {
        return "OWNER:Claude is not authenticated; run the Claude CLI once interactively to log in"
      }
      $latestReview = Join-Path $script:Repo ".probe\openai-review\latest.txt"
      if (Test-Path $latestReview) {
        $vm = [regex]::Match((Get-Content -Raw -Encoding UTF8 $latestReview), '(?m)^\s*VERDICT:\s*(\S+)\s*$')
        if ($vm.Success) { Set-Status @{ lastCodexVerdict = $vm.Groups[1].Value } }
      }
      $record = New-AuditRecord $attempts $run.Transcript $run.Path (Get-CandidateSha $entry)
      Set-AuditRecord $entry.Id $record
      if (-not $record.auditable) {
        return "OWNER:the transcript of attempt $attempts cannot be audited ($($record.unauditableReason)); inspect $($run.Path) and set ownerConfirmed on its audit record"
      }
      if (@($record.wclHits).Count -gt 0) {
        return "OWNER:attempt $attempts shows Warcraft Logs or probe activity (grant: $($entry.Wcl)); confirm it is authorized, then set ownerConfirmed on its audit record: $(@($record.wclHits) -join '; '); review $($run.Path)"
      }
      if (Test-Path $script:StopFile) { return "STOPPED" }
      $marker = $result.Markers["AUTOPILOT_RESULT"]
      if ($marker -eq "OWNER_DECISION_REQUIRED") { return "OWNER:$($result.Markers['AUTOPILOT_DECISION'])" }
      if ($marker -eq "FATAL_FAILURE") { return "FATAL:Claude reported FATAL_FAILURE; see $($run.Path)" }
      if ($marker -ne "READY_FOR_GATE") {
        $resume = "The previous attempt ended without READY_FOR_GATE (marker '$marker', exit $($run.ExitCode))."
        $wait = [Math]::Min(60 * [Math]::Pow(2, $attempts - 1), 1800)
        Write-Log "RECOVERABLE: attempt $attempts of $($entry.Id) ended without READY_FOR_GATE; retrying in $wait s"
        Start-Sleep -Seconds $wait
        continue
      }
    }
    $pr = Find-Pr $entry "open"
    if ($null -eq $pr) {
      if ($GateOnly) { return "FATAL:-GateOnly: no open PR for $($entry.Branch)" }
      $resume = "The previous attempt reported READY_FOR_GATE but no open PR exists for $($entry.Branch)."
      continue
    }
    Set-Status @{ phase = "WAITING_FOR_CI"; prNumber = $pr.number; candidateSha = $pr.headRefOid }
    if (-not (Wait-Ci $pr.number)) {
      $resume = "CI on PR #$($pr.number) did not finish within $CiTimeoutMinutes minutes."
      if ($GateOnly) { return "FATAL:CI did not finish" }
      continue
    }
    if (Test-Path $script:StopFile) { return "STOPPED" }
    $block = Get-OwnerBlock (Read-State) (Read-AuditRecords $entry.Id) $entry.Id (Get-QueueHash)
    if ($block -ne "") { return "OWNER:$block" }
    Set-Status @{ phase = "GATING" }
    $gate = Test-MergeGate $entry $expectedChecks
    Set-Status @{ ciState = $(if (@($gate.Reasons | Where-Object { $_ -match 'check' }).Count -eq 0) { "GREEN" } else { "NOT_GREEN" }); lastGate = $gate.Decision; gateReasons = @($gate.Reasons) }
    Write-Log "gate for $($entry.Id) PR #$($gate.Pr) at $($gate.Sha): $($gate.Decision) $(@($gate.Reasons) -join '; ')"
    if ($gate.Decision -eq "OWNER_DECISION_REQUIRED") { return "OWNER:$(@($gate.Reasons) -join '; ')" }
    if ($gate.Decision -eq "READY_TO_MERGE") {
      if (Test-Path $script:StopFile) { return "STOPPED" }
      $merged = Invoke-Merge $entry $gate $state
      if ($merged) { Set-Attempts $state $entry.Id 0; Save-State $state; return "MERGED" }
      return "WOULD_MERGE"
    }
    if ($GateOnly) { return "GATE_NOT_READY:$(@($gate.Reasons) -join '; ')" }
    $resume = "The supervisor's merge gate failed: $(@($gate.Reasons) -join '; '). Repair through the normal workflow (any code change goes through the local OpenAI review again)."
  }
}

# ---------------------------------------------------------------------------
# Self-tests (offline)
# ---------------------------------------------------------------------------

function Invoke-SelfTest {
  $failures = 0
  function Check([string]$name, [bool]$ok) { if ($ok) { Write-Host "ok   $name" } else { Write-Host "FAIL $name"; $script:SelfTestFailures++ } }
  $script:SelfTestFailures = 0
  $sample = @"
# Queue
### T-1: First thing
``````autopilot
status: MERGED
dependsOn: none
pr: 15
mergeSha: abc
``````
### T-2: Second thing
``````autopilot
status: READY
dependsOn: T-1
wcl: NONE
publicContract: NONE
``````
### T-3: Needs the owner
``````autopilot
status: OWNER_DECISION_REQUIRED
dependsOn: T-2
ownerDecision: Pick the first healer spec.
``````
"@
  $q = ConvertFrom-QueueText $sample
  Check "parses three entries" ($q.Count -eq 3)
  # Strict mode: one entry, and one required check, must not unroll to scalars.
  $one = ConvertFrom-QueueText (@("### ONLY-1: Just one", "", '```autopilot', "status: READY", "dependsOn: none", '```') -join "`n")
  Check "a single-entry queue parses (no scalar unrolling)" (@($one).Count -eq 1 -and @($one)[0].Id -eq "ONLY-1")
  Check "a single required check is still an array" ((Get-RequiredChecks "requiredChecks: verify").Count -eq 1)
  Check "two required checks parse" (((Get-RequiredChecks "x`nrequiredChecks: verify, corpus`n") -join "|") -eq "verify|corpus")
  Check "no requiredChecks line is an empty array" ((Get-RequiredChecks "nothing").Count -eq 0)
  Check "default branch is autopilot/<id>" ($q[1].Branch -eq "autopilot/t-2")
  Check "dependencies parsed" (($q[1].DependsOn -join ",") -eq "T-1")
  Check "pr parsed" ($q[0].Pr -eq 15)
  Check "base defaults to main" ($q[1].Base -eq "main")
  $stacked = ConvertFrom-QueueText ($sample -replace 'wcl: NONE', "wcl: NONE`nbase: parent-branch")
  Check "a stacked tranche names its base" ($stacked[1].Base -eq "parent-branch")
  Check "owner decision parsed" ($q[2].OwnerDecision -eq "Pick the first healer spec.")
  $bad = $false; try { ConvertFrom-QueueText ($sample -replace 'status: READY', 'status: DONE') | Out-Null } catch { $bad = $true }
  Check "rejects an unknown status" $bad
  $bad = $false; try { ConvertFrom-QueueText ($sample -replace 'dependsOn: T-1', 'dependsOn: T-9') | Out-Null } catch { $bad = $true }
  Check "rejects an unknown dependency" $bad
  $bad = $false; try { ConvertFrom-QueueText ($sample -replace 'publicContract: NONE', 'publicContract: MAYBE') | Out-Null } catch { $bad = $true }
  Check "rejects an unknown publicContract" $bad
  Check "quotes an argument with spaces" ((ConvertTo-Arg 'a b') -eq '"a b"')
  Check "quotes embedded quotes" ((ConvertTo-Arg 'say "hi"') -eq '"say \"hi\""')
  Check "keeps a plain argument" ((ConvertTo-Arg 'Bash(gh:*)') -eq 'Bash(gh:*)')
  Check "doubles trailing backslashes when quoting" ((ConvertTo-Arg 'C:\a b\') -eq '"C:\a b\\"')
  $t1 = '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"npm.cmd run probe"}}]}}'
  Check "transcript audit catches a probe run" ((Test-TranscriptWcl $t1).Count -eq 1)
  $t2 = '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"npm.cmd test"}}]}}'
  Check "transcript audit passes ordinary work" ((Test-TranscriptWcl $t2).Count -eq 0)
  $t3 = '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"WebFetch","input":{"url":"https://www.warcraftlogs.com/api/v2"}}]}}'
  Check "transcript audit catches a warcraftlogs.com URL" ((Test-TranscriptWcl $t3).Count -eq 1)
  $r = Read-ClaudeResult ('{"type":"result","is_error":false,"result":"done\nAUTOPILOT_RESULT: READY_FOR_GATE\nAUTOPILOT_PR: 16\nAUTOPILOT_SHA: abc\nAUTOPILOT_DECISION: NONE"}')
  Check "reads the result markers" ($r.Markers["AUTOPILOT_RESULT"] -eq "READY_FOR_GATE" -and $r.Markers["AUTOPILOT_PR"] -eq "16")
  $r2 = Read-ClaudeResult ('{"type":"result","is_error":true,"result":"crashed"}')
  Check "a missing marker is empty, never READY" ($r2.Markers["AUTOPILOT_RESULT"] -eq "")
  Check "redacts a GitHub token" ((Redact "token gho_abcdefghijklmnopqrstuvwxyz") -notmatch 'abcdefghij')

  # ---- required checks: every entry completed and SUCCESS ----
  $ok = [pscustomobject]@{ name = "verify"; status = "COMPLETED"; conclusion = "SUCCESS" }
  $okCorpus = [pscustomobject]@{ name = "corpus"; status = "COMPLETED"; conclusion = "SUCCESS" }
  Check "all required checks SUCCESS: green" ((Test-RequiredChecks @($ok, $okCorpus) @("verify", "corpus")).Count -eq 0)
  Check "SUCCESS beside a QUEUED re-run of the same check is not green" ((Test-RequiredChecks @($ok, [pscustomobject]@{ name = "verify"; status = "QUEUED"; conclusion = "" }, $okCorpus) @("verify", "corpus")).Count -eq 1)
  Check "SUCCESS beside an IN_PROGRESS re-run of the same check is not green" ((Test-RequiredChecks @($ok, [pscustomobject]@{ name = "verify"; status = "IN_PROGRESS"; conclusion = "" }, $okCorpus) @("verify", "corpus")).Count -eq 1)
  Check "SUCCESS beside a FAILURE of the same check is not green" ((Test-RequiredChecks @($ok, [pscustomobject]@{ name = "verify"; status = "COMPLETED"; conclusion = "FAILURE" }, $okCorpus) @("verify", "corpus")).Count -eq 1)
  Check "a required check that never reported is not green" ((Test-RequiredChecks @($ok) @("verify", "corpus")).Count -eq 1)
  Check "a pending status context is not green" ((Test-RequiredChecks @($ok, $okCorpus, [pscustomobject]@{ context = "other"; state = "PENDING" }) @("verify", "corpus")).Count -eq 1)

  # ---- GitHub reviews: a later comment does not resolve a change request ----
  $cr = [pscustomobject]@{ author = [pscustomobject]@{ login = "rev" }; state = "CHANGES_REQUESTED"; submittedAt = "2026-10-31T10:00:00Z"; body = "" }
  $commented = [pscustomobject]@{ author = [pscustomobject]@{ login = "rev" }; state = "COMMENTED"; submittedAt = "2026-10-31T11:00:00Z"; body = "" }
  $approved = [pscustomobject]@{ author = [pscustomobject]@{ login = "rev" }; state = "APPROVED"; submittedAt = "2026-10-31T12:00:00Z"; body = "" }
  $dismissed = [pscustomobject]@{ author = [pscustomobject]@{ login = "rev" }; state = "DISMISSED"; submittedAt = "2026-10-31T12:00:00Z"; body = "" }
  Check "CHANGES_REQUESTED then COMMENTED, empty reviewDecision: still blocked" ((Test-GithubReviews @($cr, $commented) "").Count -eq 1)
  Check "CHANGES_REQUESTED then APPROVED by the same reviewer: resolved" ((Test-GithubReviews @($cr, $commented, $approved) "").Count -eq 0)
  Check "CHANGES_REQUESTED then DISMISSED: resolved" ((Test-GithubReviews @($cr, $dismissed) "").Count -eq 0)
  Check "review order is by time, not list order" ((Test-GithubReviews @($approved, $cr) "").Count -eq 0)
  Check "an aggregate CHANGES_REQUESTED decision blocks" ((Test-GithubReviews @() "CHANGES_REQUESTED").Count -eq 1)

  # ---- GitHub verdicts are ordered by time across reviews and comments ----
  $reviews = @([pscustomobject]@{ submittedAt = "2026-10-31T10:00:00Z"; body = "VERDICT: CHANGES_REQUIRED" })
  $comments = @([pscustomobject]@{ createdAt = "2026-10-31T09:00:00Z"; body = "VERDICT: APPROVED" })
  Check "an older APPROVED comment does not override a newer CHANGES_REQUIRED review" ((Get-LatestGithubVerdict $reviews $comments) -eq "CHANGES_REQUIRED")
  $comments2 = @([pscustomobject]@{ createdAt = "2026-10-31T11:00:00Z"; body = "VERDICT: APPROVED" })
  Check "a newer APPROVED comment is the latest verdict" ((Get-LatestGithubVerdict $reviews $comments2) -eq "APPROVED")
  $reviews3 = @([pscustomobject]@{ submittedAt = "2026-10-31T12:00:00Z"; body = "VERDICT: OWNER_DECISION_REQUIRED" })
  Check "a newer OWNER_DECISION_REQUIRED review wins over an older APPROVED comment" ((Get-LatestGithubVerdict $reviews3 $comments2) -eq "OWNER_DECISION_REQUIRED")
  Check "no verdict at all is empty" ((Get-LatestGithubVerdict @() @([pscustomobject]@{ createdAt = "2026-10-31T09:00:00Z"; body = "looks fine" })) -eq "")
  Check "an undated verdict is never read as approval" ((Get-LatestGithubVerdict @([pscustomobject]@{ body = "VERDICT: APPROVED" }) @()) -eq "CHANGES_REQUIRED")

  # ---- explicit selection obeys readiness and dependencies ----
  function Test-Merged($entry, $state) { return ($entry.Status -eq "MERGED") }
  $st = New-State
  Check "a READY tranche with merged dependencies is runnable" ((Test-Runnable $q[1] $q $st) -eq "")
  Check "an OWNER_DECISION_REQUIRED tranche is not runnable" ((Test-Runnable $q[2] $q $st) -match "OWNER_DECISION_REQUIRED")
  $unmet = ConvertFrom-QueueText ($sample -replace 'status: MERGED', 'status: READY')
  Check "a tranche whose dependency is not merged is not runnable" ((Test-Runnable $unmet[1] $unmet $st) -match "dependency T-1")
  $script:TrancheIdSaved = $TrancheId
  $script:TrancheId = "T-3"
  $refused = ""
  try { Select-NextTranche $q $st | Out-Null } catch { $refused = $_.Exception.Message }
  Check "-TrancheId refuses an owner-decision tranche" ($refused -like "REFUSED:*")
  $script:TrancheId = "T-1"
  Check "-TrancheId still inspects an already-merged tranche" ((Select-NextTranche $q $st).Id -eq "T-1")
  $script:TrancheId = $script:TrancheIdSaved

  # ---- only EXECUTED actions are audited ----
  $init = '{"type":"system","subtype":"init","cwd":"x"}'
  $readProbe = '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"vitest.probe.config.ts"}}]}}'
  $editProbe = '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Edit","input":{"file_path":"agent/review-request.md","new_string":"no vitest.probe.config, no npm run probe, scripts/probe/x.probe.ts untouched"}}]}}'
  $grepProbe = '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"git diff -- scripts/probe/"}}]}}'
  $runProbeConfig = '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"PowerShell","input":{"command":"npx.cmd vitest run --config vitest.probe.config.ts"}}]}}'
  $runProbeScript = '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"npx vitest run scripts/probe/wcl-rankings-shape.probe.ts"}}]}}'
  $subagentRun = '{"type":"assistant","parent_tool_use_id":"t9","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"npm.cmd run probe"}}]}}'
  Check "reading a probe file is not activity" ((Test-TranscriptWcl $readProbe).Count -eq 0)
  Check "documenting the probe in an edit is not activity" ((Test-TranscriptWcl $editProbe).Count -eq 0)
  Check "a non-executing command naming the probe directory is not activity" ((Test-TranscriptWcl $grepProbe).Count -eq 0)
  Check "running the probe config is activity" ((Test-TranscriptWcl $runProbeConfig).Count -eq 1)
  Check "running a probe script is activity" ((Test-TranscriptWcl $runProbeScript).Count -eq 1)
  Check "a subagent's probe run is activity" ((Test-TranscriptWcl $subagentRun).Count -eq 1)

  # ---- audit evidence is required, complete, authorized and bound to the head ----
  $clean = New-AuditRecord 1 ($init + "`n" + '{"type":"result","is_error":false,"result":"ok\nAUTOPILOT_RESULT: READY_FOR_GATE\nAUTOPILOT_PR: 99\nAUTOPILOT_SHA: sha1\nAUTOPILOT_DECISION: NONE"}') "t1" "sha1"
  Check "an init-led, fully parsed transcript is auditable" ($clean.auditable)
  Check "an empty transcript is not auditable" (-not (New-AuditRecord 1 "" "t" "s").auditable)
  Check "a garbage-only transcript is not auditable" (-not (New-AuditRecord 1 "not json" "t" "s").auditable)
  Check "a transcript without the init event is not auditable" (-not (New-AuditRecord 1 '{"type":"result"}' "t" "s").auditable)
  Check "a garbage final line is not auditable" (-not (New-AuditRecord 1 ($init + "`noops") "t" "s").auditable)
  Check "clean evidence for the head passes" ((Test-AuditEvidence @($clean) 1 "sha1" "NONE").Reasons.Count -eq 0)
  Check "no evidence blocks the merge" ((Test-AuditEvidence @() 0 "sha1" "NONE").Reasons.Count -eq 1)
  Check "a missing attempt blocks the merge" (@((Test-AuditEvidence @($clean) 2 "sha1" "NONE").Reasons | Where-Object { $_ -match "attempt 2" }).Count -eq 1)
  Check "a head the last audited run did not leave blocks the merge" (@((Test-AuditEvidence @($clean) 1 "sha2" "NONE").Reasons | Where-Object { $_ -match "not a candidate the last audited run produced" }).Count -eq 1)
  $dirty = New-AuditRecord 1 ($init + "`n" + $t1) "t1" "sha1"
  Check "unauthorized activity needs the owner" ((Test-AuditEvidence @($dirty) 1 "sha1" "NONE").Owner.Count -eq 1)
  $broken = New-AuditRecord 1 ($init + "`nnot json`n" + '{"type":"result"}') "t1" "sha1"
  Check "an unauditable transcript goes to the owner, never to a retry" (@((Test-AuditEvidence @($broken) 1 "sha1" "NONE").Owner | Where-Object { $_ -match "cannot be audited" }).Count -eq 1)
  $cut = New-AuditRecord 1 ($init + "`n" + '{"type":"result"}' + "`n" + '{"type":"assis') "t1" "sha1"
  Check "a truncated LAST line (never executed) keeps the transcript auditable" ($cut.auditable)

  # ---- restart recovery across the attempt/audit boundary ----
  $rid = "T-RECOVER"
  $auditPath = Get-AuditPath $rid
  if (Test-Path $auditPath) { Remove-Item -Force $auditPath }
  Set-AuditRecord $rid ([pscustomobject]@{ attempt = 1; status = "STARTED"; transcript = (Join-Path $script:Dir "missing-transcript.jsonl"); at = "x" })
  Check "an interrupted, unrecovered attempt blocks the merge" (@((Test-AuditEvidence @(Read-AuditRecords $rid) 1 "sha1" "NONE").Reasons | Where-Object { $_ -match "interrupted" }).Count -eq 1)
  function Get-CandidateSha($entry) { return $script:StubCandidate }
  $script:StubCandidate = "sha9"
  $recEntry = [pscustomobject]@{ Id = $rid; Branch = "autopilot/t-recover" }
  Resume-InterruptedAttempts $recEntry
  $rec = @(Read-AuditRecords $rid)
  Check "a recorded attempt that never launched is kept as WITHDRAWN on restart" ($rec.Count -eq 1 -and $rec[0].status -eq "WITHDRAWN")
  Check "withdrawn attempts alone are not evidence" ((Test-AuditEvidence $rec 1 "sha9" "NONE").Reasons.Count -eq 1)
  $tpath = Join-Path $script:Dir "recover-transcript.jsonl"
  # Claude finished (it reported sha9) but the supervisor died before auditing.
  [System.IO.File]::WriteAllText($tpath, ($init + "`n" + '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"npm.cmd test"}}]}}' + "`n" + '{"type":"result","is_error":false,"result":"ok\nAUTOPILOT_RESULT: READY_FOR_GATE\nAUTOPILOT_PR: 99\nAUTOPILOT_SHA: sha9\nAUTOPILOT_DECISION: NONE"}'), (New-Object System.Text.UTF8Encoding $false))
  Set-AuditRecord $rid ([pscustomobject]@{ attempt = 2; status = "STARTED"; transcript = $tpath; at = "x" })
  Resume-InterruptedAttempts $recEntry
  $rec = @(Read-AuditRecords $rid)
  Check "an interrupted run's on-disk transcript is RECOVERED on restart" ($rec.Count -eq 2 -and $rec[1].status -eq "RECOVERED" -and $rec[1].auditable -and $rec[1].candidateSha -eq "sha9")
  $full = Test-AuditEvidence $rec 2 "sha9" "NONE"
  Check "withdrawal then recovery passes the full audit gate, nothing filtered" ($full.Reasons.Count -eq 0 -and $full.Owner.Count -eq 0)
  Check "numbering continues after the highest recorded attempt" ((Get-MaxAuditAttempt $rid) -eq 2)

  Set-AuditRecord $rid (New-AuditRecord 3 ($init + "`n" + '{"type":"result","is_error":false,"result":"ok\nAUTOPILOT_RESULT: READY_FOR_GATE\nAUTOPILOT_PR: 99\nAUTOPILOT_SHA: sha10\nAUTOPILOT_DECISION: NONE"}') "t3" "sha10")
  $full = Test-AuditEvidence @(Read-AuditRecords $rid) 3 "sha10" "NONE"
  Check "the next completed run after a withdrawal passes the full audit gate" ($full.Reasons.Count -eq 0 -and $full.Owner.Count -eq 0)
  Check "the head must be the latest run's candidate, not an earlier one" ((Test-AuditEvidence @(Read-AuditRecords $rid) 3 "sha9" "NONE").Reasons.Count -eq 1)

  # The head moved before restart recovery: the run reported sha9, the branch is now sha11.
  if (Test-Path $auditPath) { Remove-Item -Force $auditPath }
  Set-AuditRecord $rid ([pscustomobject]@{ attempt = 1; status = "STARTED"; transcript = $tpath; at = "x" })
  $script:StubCandidate = "sha11"
  Resume-InterruptedAttempts $recEntry
  $moved = @(Read-AuditRecords $rid)
  Check "recovery never binds a run to a head it did not report" ($moved[0].candidateSha -eq "" -and $moved[0].candidateBinding -match "sha9" -and $moved[0].candidateBinding -match "sha11")
  Check "...so the gate blocks the moved head" (@((Test-AuditEvidence $moved 1 "sha11" "NONE").Reasons | Where-Object { $_ -match "not a candidate the last audited run produced" }).Count -eq 1)
  # Interrupted before it reported any SHA: unbound, gate blocks.
  [System.IO.File]::WriteAllText($tpath, ($init + "`n" + '{"type":"assis'), (New-Object System.Text.UTF8Encoding $false))
  if (Test-Path $auditPath) { Remove-Item -Force $auditPath }
  Set-AuditRecord $rid ([pscustomobject]@{ attempt = 1; status = "STARTED"; transcript = $tpath; at = "x" })
  Resume-InterruptedAttempts $recEntry
  Check "a run interrupted before reporting its SHA is unbound and blocks" ((Test-AuditEvidence @(Read-AuditRecords $rid) 1 "sha11" "NONE").Reasons.Count -eq 1)
  # The head moved before audit persistence on the normal path.
  $movedNow = New-AuditRecord 1 ($init + "`n" + '{"type":"result","is_error":false,"result":"ok\nAUTOPILOT_RESULT: READY_FOR_GATE\nAUTOPILOT_PR: 99\nAUTOPILOT_SHA: sha1\nAUTOPILOT_DECISION: NONE"}') "t1" "sha2"
  Check "a head that moved before the audit was written is not attributed to the run" ($movedNow.candidateSha -eq "" -and (Test-AuditEvidence @($movedNow) 1 "sha2" "NONE").Reasons.Count -eq 1)
  Check "an unambiguous SHA prefix (7+) binds to the observed full head" ((Get-CandidateBinding "abcdef1" "abcdef1234567890").Sha -eq "abcdef1234567890")
  Check "a short prefix does not bind" ((Get-CandidateBinding "abc" "abcdef1234567890").Sha -eq "")
  Remove-Item -Force $tpath, $auditPath
  Remove-Item Function:\Get-CandidateSha

  # ---- redaction: one rule set, applied before anything is written ----
  $samples = @(
    "token gho_abcdefghijklmnopqrstuvwxyz1234",
    "Authorization: Bearer abc.def.ghi.jkl",
    '"authorization":"Bearer abcdefghijklmnop"',
    "WCL_CLIENT_SECRET=client_secret=s3cr3tvaluehere",
    "key sk-ant-abcdefghijklmnopqrstu",
    "password: hunter2hunter2"
  )
  $node = (Get-Command node -ErrorAction SilentlyContinue)
  if ($null -eq $node) { Check "node is available for the launcher tests" $false }
  else {
    $script:Node = $node.Source
    $samplesFile = Join-Path $script:Dir "redact-samples.json"
    [System.IO.File]::WriteAllText($samplesFile, (ConvertTo-Json @($samples)), (New-Object System.Text.UTF8Encoding $false))
    $launcherUrl = ([System.Uri]$script:Launcher).AbsoluteUri
    $nodeOut = & $script:Node -e "import('$launcherUrl').then(m => { const s = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')); console.log(JSON.stringify(s.map(m.redact))); })" $samplesFile
    # Windows PowerShell 5.1 returns a JSON array as ONE object; enumerate it.
    $fromNode = @(($nodeOut | ConvertFrom-Json) | ForEach-Object { $_ })
    $fromPs = @($samples | ForEach-Object { Redact $_ })
    Check "the launcher and the supervisor redact identically" (($fromNode.Count -eq $fromPs.Count) -and (($fromNode -join "|") -ceq ($fromPs -join "|")))
    $leaks = @($fromPs | Where-Object { $_ -match 'abcdefghijklmnopqrstuvwxyz1234|abc\.def\.ghi|abcdefghijklmnop"|s3cr3t|sk-ant-abc|hunter2' })
    Check "no sample secret survives redaction" ($leaks.Count -eq 0)

    # Secrets inside JSON-ENCODED tool output (a transcript line is JSON whose
    # string values hold serialized JSON), plain and double-escaped.
    $bindings = @(
      'ANALYSIS_AUTH_TOKEN=syntheticAuthToken777',
      'WCL_CLIENT_SECRET="synthetic wcl secret"',
      '{"type":"user","message":{"content":[{"type":"tool_result","content":"{\"ANALYSIS_AUTH_TOKEN\": \"synthetic auth value\", \"WCL_CLIENT_ID\": \"syntheticClientId\"}"}]}}',
      '{"type":"result","usage":{"input_tokens":1234,"output_tokens":567}}'
    )
    $bindFile = Join-Path $script:Dir "redact-bindings.json"
    [System.IO.File]::WriteAllText($bindFile, (ConvertTo-Json @($bindings)), (New-Object System.Text.UTF8Encoding $false))
    $nodeBind = & $script:Node -e "import('$launcherUrl').then(m => { const s = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')); console.log(JSON.stringify(s.map(m.redact))); })" $bindFile
    $fromNodeBind = @(($nodeBind | ConvertFrom-Json) | ForEach-Object { $_ })
    $fromPsBind = @($bindings | ForEach-Object { Redact $_ })
    Check "repository credential bindings: both implementations agree" (($fromNodeBind -join "|") -ceq ($fromPsBind -join "|"))
    Check "repository credential bindings: no value survives (ANALYSIS_AUTH_TOKEN, WCL_CLIENT_*)" ((($fromPsBind -join "|") -notmatch 'syntheticAuthToken777|synthetic wcl secret|synthetic auth value|syntheticClientId'))
    $bindJsonOk = $true
    try { $null = $fromPsBind[2] | ConvertFrom-Json } catch { $bindJsonOk = $false }
    Check "repository credential bindings: the nested JSON line stays valid" $bindJsonOk
    Check "usage counters (input_tokens, output_tokens) are not redacted" ($fromPsBind[3] -ceq $bindings[3])

    $wholeValue = @(
      'password: "synthetic first second"',
      'client_secret: "synthetic\remainingSecret987"',
      "client_secret='single quoted secret 42'",
      '{"type":"user","message":{"content":[{"type":"tool_result","content":"{\"password\": \"synthetic first second\", \"client_secret\": \"synthetic\\\\remainingSecret987\", \"api_key\": \"with \\\"escaped\\\" quote inside\"}"}]}}'
    )
    $wholeFile = Join-Path $script:Dir "redact-whole.json"
    [System.IO.File]::WriteAllText($wholeFile, (ConvertTo-Json @($wholeValue)), (New-Object System.Text.UTF8Encoding $false))
    $nodeWhole = & $script:Node -e "import('$launcherUrl').then(m => { const s = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')); console.log(JSON.stringify(s.map(m.redact))); })" $wholeFile
    $fromNodeWhole = @(($nodeWhole | ConvertFrom-Json) | ForEach-Object { $_ })
    $fromPsWhole = @($wholeValue | ForEach-Object { Redact $_ })
    Check "quoted values: both implementations agree" (($fromNodeWhole -join "|") -ceq ($fromPsWhole -join "|"))
    Check "quoted values: no fragment survives (spaces, backslashes, escaped quotes)" ((($fromPsWhole -join "|") -notmatch 'first second|remainingSecret987|single quoted secret|escaped|quote inside'))
    $wholeJsonOk = $true
    try { $null = $fromPsWhole[3] | ConvertFrom-Json } catch { $wholeJsonOk = $false }
    Check "quoted values: the redacted JSON line is still valid JSON" $wholeJsonOk
    Check "quoted values: the keys and quoting stay readable" ($fromPsWhole[0] -eq 'password: "[REDACTED]"' -and $fromPsWhole[2] -eq "client_secret='[REDACTED]'")

    $jsonLines = @(
      '{"type":"user","message":{"content":[{"type":"tool_result","content":"{\"client_secret\":\"syntheticSecret12345\"}"}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","content":"{\"headers\":{\"authorization\":\"Bearer syntheticBearer98765\"}}"}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","content":"{\"inner\":\"{\\\"access_token\\\":\\\"syntheticToken55555\\\"}\"}"}]}}'
    )
    $jsonFile = Join-Path $script:Dir "redact-json.json"
    [System.IO.File]::WriteAllText($jsonFile, (ConvertTo-Json @($jsonLines)), (New-Object System.Text.UTF8Encoding $false))
    $nodeJson = & $script:Node -e "import('$launcherUrl').then(m => { const s = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')); console.log(JSON.stringify(s.map(m.redact))); })" $jsonFile
    $fromNodeJson = @(($nodeJson | ConvertFrom-Json) | ForEach-Object { $_ })
    $fromPsJson = @($jsonLines | ForEach-Object { Redact $_ })
    Check "JSON-encoded secrets: both implementations agree" (($fromNodeJson -join "|") -ceq ($fromPsJson -join "|"))
    Check "JSON-encoded secrets: none survives" ((($fromPsJson -join "|") -notmatch 'syntheticSecret12345|syntheticBearer98765|syntheticToken55555'))
    $stillJson = $true
    foreach ($l in $fromPsJson) { try { $null = $l | ConvertFrom-Json } catch { $stillJson = $false } }
    Check "JSON-encoded secrets: every redacted line is still valid JSON" $stillJson

    # The launcher, end to end, with a fake program printing synthetic secrets.
    $stdin = Join-Path $script:Dir "fake-stdin.txt"
    [System.IO.File]::WriteAllText($stdin, "prompt", (New-Object System.Text.UTF8Encoding $false))
    # The fake programs are files, not -e strings, so no command-line quoting can alter them.
    $fakeFile = Join-Path $script:Dir "fake-complete.js"
    $fakeSource = @'
console.log(JSON.stringify({ type: "system", subtype: "init" }));
console.log(JSON.stringify({ type: "user", text: "gh token gho_abcdefghijklmnopqrstuvwxyz1234" }));
console.log(JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: JSON.stringify({ client_secret: "syntheticSecret12345", password: "synthetic first second", api_key: 'with "escaped" quote inside' }) }] } }));
console.error('password: "synthetic\\remainingSecret987"');
console.error("Authorization: Bearer abc.def.ghi.jkl");
console.log(JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: JSON.stringify({ ANALYSIS_AUTH_TOKEN: "synthetic auth value" }) }] } }));
console.error("ANALYSIS_AUTH_TOKEN=syntheticAuthToken777");
'@
    [System.IO.File]::WriteAllText($fakeFile, $fakeSource, (New-Object System.Text.UTF8Encoding $false))
    $runA = Join-Path $script:Dir "fake-complete.jsonl"
    foreach ($f in @($runA, "$runA.stderr.txt")) { if (Test-Path $f) { Remove-Item -Force $f } }
    $done = Start-LoggedRun $script:Node @($fakeFile) $stdin $runA 60
    $latest = [System.IO.File]::ReadAllText((Join-Path $script:Dir "latest-claude.jsonl"))
    Check "a completed run's transcript, stderr and latest copy carry no raw secret" (($done.Transcript + $done.Stderr + $latest) -notmatch 'abcdefghijklmnopqrstuvwxyz1234|abc\.def\.ghi|syntheticSecret12345|first second|remainingSecret987|quote inside|synthetic auth value|syntheticAuthToken777')
    Check "a completed run's transcript is on disk and auditable" ((New-AuditRecord 1 $done.Transcript $runA "s").auditable)
    $slowFile = Join-Path $script:Dir "fake-slow.js"
    $slowSource = @'
console.log(JSON.stringify({ type: "system", subtype: "init" }));
console.log(JSON.stringify({ type: "user", text: "gh token gho_abcdefghijklmnopqrstuvwxyz1234" }));
setTimeout(() => {}, 60000);
'@
    [System.IO.File]::WriteAllText($slowFile, $slowSource, (New-Object System.Text.UTF8Encoding $false))
    $runB = Join-Path $script:Dir "fake-interrupted.jsonl"
    foreach ($f in @($runB, "$runB.stderr.txt")) { if (Test-Path $f) { Remove-Item -Force $f } }
    $cut = Start-LoggedRun $script:Node @($slowFile) $stdin $runB 3
    $latest = [System.IO.File]::ReadAllText((Join-Path $script:Dir "latest-claude.jsonl"))
    Check "an interrupted run left its redacted lines on disk" ($cut.Transcript -match 'gho_\[REDACTED\]')
    Check "an interrupted run's transcript and latest copy carry no raw secret" (($cut.Transcript + $latest) -notmatch 'abcdefghijklmnopqrstuvwxyz1234')
    $refused = Join-Path $script:Dir "fake-refused.jsonl"
    $cmdRun = Start-LoggedRun (Join-Path $script:Dir "claude.cmd") @("-p") $stdin $refused 30
    Check "the launcher refuses a .cmd program rather than re-splitting its arguments" ($cmdRun.ExitCode -eq 2)
  }

  # ---- a PR retargeted after the gate is never merged ----
  $script:GhCalls = New-Object System.Collections.ArrayList
  $retargetOutcome = & {
    function Invoke-Gh([string[]]$arguments, [int]$tries = 4) {
      [void]$script:GhCalls.Add(($arguments -join " "))
      if ($arguments -contains "view") { return '{"state":"OPEN","baseRefName":"release","headRefOid":"sha1"}' }
      return ""
    }
    try { Invoke-Merge $q[1] ([pscustomobject]@{ Pr = 99; Sha = "sha1" }) (New-State) | Out-Null; "MERGED" } catch { "$($_.Exception.Message)" }
  }
  Check "a base retargeted after the gate (same head SHA) refuses the merge" ($retargetOutcome -like "RECOVERABLE:*changed before merging*")
  Check "...and gh pr merge is never called" (@($script:GhCalls | Where-Object { $_ -like "pr merge*" }).Count -eq 0)
  $script:GhCalls.Clear()
  $sameOutcome = & {
    function Invoke-Gh([string[]]$arguments, [int]$tries = 4) {
      [void]$script:GhCalls.Add(($arguments -join " "))
      if ($arguments -contains "view") { return '{"state":"OPEN","baseRefName":"main","headRefOid":"sha2"}' }
      return ""
    }
    try { Invoke-Merge $q[1] ([pscustomobject]@{ Pr = 99; Sha = "sha1" }) (New-State) | Out-Null; "MERGED" } catch { "$($_.Exception.Message)" }
  }
  Check "a head that moved before merging refuses the merge" ($sameOutcome -like "RECOVERABLE:*changed before merging*" -and @($script:GhCalls | Where-Object { $_ -like "pr merge*" }).Count -eq 0)

  # ---- the reviewed tree equals the commit tree, CRLF-over-LF included ----
  . (Join-Path $script:Repo "scripts\review\reviewed-tree.ps1")
  $repoDir = Join-Path $script:Dir "tree-repo"
  if (Test-Path $repoDir) { Remove-Item -Recurse -Force $repoDir }
  New-Item -ItemType Directory -Force -Path $repoDir | Out-Null
  $gitOk = $true
  $ErrorActionPreference = "Continue"
  foreach ($cmd in @(
      @("init", "-q"), @("config", "user.email", "selftest@example.invalid"), @("config", "user.name", "selftest"),
      @("config", "core.autocrlf", "false"), @("config", "commit.gpgsign", "false"))) {
    & git -C $repoDir @cmd 2>$null | Out-Null; if ($LASTEXITCODE -ne 0) { $gitOk = $false }
  }
  [System.IO.File]::WriteAllText((Join-Path $repoDir "a.txt"), "one`ntwo`n", (New-Object System.Text.UTF8Encoding $false))
  [System.IO.File]::WriteAllText((Join-Path $repoDir "b.txt"), "keep`n", (New-Object System.Text.UTF8Encoding $false))
  & git -C $repoDir add -A 2>$null | Out-Null
  & git -C $repoDir commit -q -m base 2>$null | Out-Null
  # Re-check the files out with CRLF (autocrlf true), recording their stat in
  # the index, then turn autocrlf off: LF blobs, CRLF files, a clean status.
  & git -C $repoDir config core.autocrlf true 2>$null | Out-Null
  Remove-Item -Force (Join-Path $repoDir "a.txt"), (Join-Path $repoDir "b.txt")
  & git -C $repoDir checkout -- . 2>$null | Out-Null
  # Old files, refreshed while autocrlf was on: not racily clean, so git trusts
  # their stat afterwards, exactly as in a long-lived checkout.
  foreach ($f in @("a.txt", "b.txt")) { (Get-Item (Join-Path $repoDir $f)).LastWriteTime = (Get-Date).AddHours(-1) }
  & git -C $repoDir update-index --refresh -q 2>$null | Out-Null
  & git -C $repoDir config core.autocrlf false 2>$null | Out-Null
  $headTree = "$(& git -C $repoDir rev-parse 'HEAD^{tree}')".Trim()
  $eol = "$(& git -C $repoDir ls-files --eol a.txt)"
  $status = "$(& git -C $repoDir status --porcelain)"
  $ErrorActionPreference = "Stop"
  Check "the disposable repo reproduces LF blobs under CRLF files with a clean status" ($gitOk -and $eol -match "i/lf" -and $eol -match "w/crlf" -and $status.Trim() -eq "")
  # The OLD calculation (read-tree HEAD into an empty index) re-hashes the CRLF files.
  $oldIndex = Join-Path $script:Dir "old-tree.index"
  if (Test-Path $oldIndex) { Remove-Item -Force $oldIndex }
  $ErrorActionPreference = "Continue"
  $env:GIT_INDEX_FILE = $oldIndex
  & git -C $repoDir read-tree HEAD 2>$null | Out-Null
  & git -C $repoDir add -A 2>$null | Out-Null
  $oldTree = "$(& git -C $repoDir write-tree)".Trim()
  Remove-Item Env:GIT_INDEX_FILE
  $ErrorActionPreference = "Stop"
  Remove-Item -Force $oldIndex -ErrorAction SilentlyContinue
  Check "the old calculation does NOT equal the tree a commit would make (the defect)" ($oldTree -ne $headTree)
  $realIndexPath = Join-Path $repoDir ".git\index"
  $indexBefore = (Get-FileHash -Algorithm SHA256 $realIndexPath).Hash
  $newTree = Get-ReviewedTreeId $repoDir $script:Dir @()
  Check "the copied-index calculation equals the commit tree" ($newTree -eq $headTree)
  Check "the real index is left untouched" ((Get-FileHash -Algorithm SHA256 $realIndexPath).Hash -eq $indexBefore)
  [System.IO.File]::WriteAllText((Join-Path $repoDir "b.txt"), "changed`r`n", (New-Object System.Text.UTF8Encoding $false))
  $changedTree = Get-ReviewedTreeId $repoDir $script:Dir @()
  Check "a real content change alters the reviewed tree" ($changedTree -ne $headTree -and $null -ne $changedTree)
  [System.IO.File]::WriteAllText((Join-Path $repoDir "secret.local"), "x", (New-Object System.Text.UTF8Encoding $false))
  $excludedTree = Get-ReviewedTreeId $repoDir $script:Dir @("secret.local")
  Check "an excluded path never enters the reviewed tree" ($excludedTree -eq $changedTree)
  Remove-Item -Recurse -Force $repoDir

  # ---- the tranche loop, with GitHub, Claude and merging stubbed ----
  $script:StubMerges = 0
  $script:StubStopAfterClaude = $false
  $script:StubStopDuringCi = $false
  $script:StubTranscript = $init + "`n" + '{"type":"result","is_error":false,"result":"done\nAUTOPILOT_RESULT: READY_FOR_GATE\nAUTOPILOT_PR: 99\nAUTOPILOT_SHA: sha1\nAUTOPILOT_DECISION: NONE"}'
  function Find-Pr($entry, [string]$state) { if ($state -eq "open") { return [pscustomobject]@{ number = 99; headRefOid = "sha1"; headRefName = $entry.Branch; baseRefName = "main" } } else { return $null } }
  function Invoke-Claude([string]$prompt, [string]$label) {
    if ($script:StubStopAfterClaude) { Set-Content -Path $script:StopFile -Value "stop" }
    return [pscustomobject]@{ ExitCode = 0; Transcript = $script:StubTranscript; Stderr = ""; Path = "stub" }
  }
  function Wait-Ci([int]$prNumber) { if ($script:StubStopDuringCi) { Set-Content -Path $script:StopFile -Value "stop" }; return $true }
  $script:StubGateDecision = "READY_TO_MERGE"
  function Test-MergeGate($entry, $expectedChecks) { return [pscustomobject]@{ Decision = $script:StubGateDecision; Reasons = @("stub reason"); Pr = 99; Sha = "sha1" } }
  function Invoke-Merge($entry, $gate, $state) { $script:StubMerges++; return $true }
  function Reset-Stub {
    if (Test-Path $script:StopFile) { Remove-Item -Force $script:StopFile }
    $auditDir = Join-Path $script:Dir "audit"
    if (Test-Path $auditDir) { Remove-Item -Recurse -Force $auditDir }
    $script:StubMerges = 0
  }
  $entry = $q[1]

  Reset-Stub
  $outcome = Invoke-Tranche $entry (New-State) @("verify")
  Check "control: with no stop the stubbed tranche merges once" ($outcome -eq "MERGED" -and $script:StubMerges -eq 1)
  Check "control: the run left an audit record bound to its head" ((@(Read-AuditRecords $entry.Id)).Count -eq 1 -and (@(Read-AuditRecords $entry.Id))[0].candidateSha -eq "sha1")

  Reset-Stub; $script:StubStopAfterClaude = $true
  $outcome = Invoke-Tranche $entry (New-State) @("verify")
  Check "a stop requested while Claude runs prevents the merge" ($outcome -eq "STOPPED" -and $script:StubMerges -eq 0)
  $script:StubStopAfterClaude = $false

  Reset-Stub; $script:StubStopDuringCi = $true
  $outcome = Invoke-Tranche $entry (New-State) @("verify")
  Check "a stop requested while CI runs prevents the merge" ($outcome -eq "STOPPED" -and $script:StubMerges -eq 0)
  $script:StubStopDuringCi = $false

  # A saved owner block for this tranche prevents the merge on every path
  # until the decision is recorded in the queue (its hash changes).
  $hashNow = Get-QueueHash
  $blockedState = New-State
  $blockedState.blocked = [pscustomobject]@{ tranche = $entry.Id; reason = "pick A or B"; queueHash = $hashNow; at = "x" }
  Check "a saved owner block for the tranche is enforced" ((Test-OwnerBlock $blockedState $entry.Id $hashNow) -match "pick A or B")
  Check "a block on another tranche does not apply here" ((Test-OwnerBlock $blockedState "T-OTHER" $hashNow) -eq "")
  Check "a block is resolved once the queue records the decision (hash changed)" ((Test-OwnerBlock $blockedState $entry.Id "different-hash") -eq "")
  Reset-Stub
  Save-State $blockedState
  $script:GateOnlySaved = $GateOnly
  $script:GateOnly = $true
  $outcome = Invoke-Tranche $entry $blockedState @("verify")
  Check "-GateOnly cannot merge past a saved owner block" ($outcome -like "OWNER:*pick A or B*" -and $script:StubMerges -eq 0)
  $script:GateOnly = $script:GateOnlySaved
  Save-State (New-State)

  # Claude asked for an owner decision, then the supervisor crashed before
  # saving the block: recovery re-reads the decision from the transcript.
  Reset-Stub
  Save-State (New-State)
  $ownerTranscript = $init + "`n" + '{"type":"result","is_error":false,"result":"stop\nAUTOPILOT_RESULT: OWNER_DECISION_REQUIRED\nAUTOPILOT_PR: NONE\nAUTOPILOT_SHA: NONE\nAUTOPILOT_DECISION: choose the first healer spec"}'
  $otPath = Join-Path $script:Dir "owner-transcript.jsonl"
  [System.IO.File]::WriteAllText($otPath, $ownerTranscript, (New-Object System.Text.UTF8Encoding $false))
  Set-AuditRecord $entry.Id ([pscustomobject]@{ attempt = 1; status = "STARTED"; transcript = $otPath; at = "x" })
  $script:Launches = 0
  function Invoke-Claude([string]$prompt, [string]$label) { $script:Launches++; return [pscustomobject]@{ ExitCode = 0; Transcript = $script:StubTranscript; Stderr = ""; Path = "stub" } }
  $outcome = Invoke-Tranche $entry (New-State) @("verify")
  Check "an owner result recovered after a crash blocks before any new attempt" ($outcome -like "OWNER:*first healer spec*" -and $script:Launches -eq 0 -and $script:StubMerges -eq 0)
  $rec = @(Read-AuditRecords $entry.Id)
  Check "the recovered record keeps the run's own result and decision" ($rec[0].status -eq "RECOVERED" -and $rec[0].result -eq "OWNER_DECISION_REQUIRED" -and $rec[0].decision -eq "choose the first healer spec")
  $script:GateOnly = $true
  $outcome = Invoke-Tranche $entry (New-State) @("verify")
  Check "-GateOnly cannot merge past a recovered owner result" ($outcome -like "OWNER:*" -and $script:StubMerges -eq 0)
  $script:GateOnly = $script:GateOnlySaved
  Check "a recorded decision (queue hash changed) resolves the recovered owner result" ((Get-OwnerBlock (New-State) $rec $entry.Id "different-hash") -eq "")
  Remove-Item -Force $otPath

  # Corrupted state is preserved and fails closed; it cannot erase a block.
  $blocked = New-State
  $blocked.blocked = [pscustomobject]@{ tranche = $entry.Id; reason = "pick A or B"; queueHash = (Get-QueueHash); at = "x" }
  Save-State $blocked
  $corrupt = ([System.IO.File]::ReadAllText($script:StateFile)).Substring(0, 40)
  [System.IO.File]::WriteAllText($script:StateFile, $corrupt, (New-Object System.Text.UTF8Encoding $false))
  $threw = ""
  try { Initialize-State | Out-Null } catch { $threw = $_.Exception.Message }
  Check "an unreadable state file is FATAL, not replaced" ($threw -like "FATAL:*")
  Check "the unreadable state file is left byte-for-byte untouched" ([System.IO.File]::ReadAllText($script:StateFile) -ceq $corrupt)
  [System.IO.File]::WriteAllText($script:StateFile, '{"unexpected":true}', (New-Object System.Text.UTF8Encoding $false))
  $threw = ""
  try { Initialize-State | Out-Null } catch { $threw = $_.Exception.Message }
  Check "a state file without the expected fields is FATAL too" ($threw -like "FATAL:*")
  Save-State (New-State)

  # The top-level owner stop never replaces unreadable state (or its backup).
  [System.IO.File]::WriteAllText($script:StateFile, '{"version":1,"blocked":{"tran', (New-Object System.Text.UTF8Encoding $false))
  [System.IO.File]::WriteAllText("$script:StateFile.bak", '{"version":1,"attempts":{},"merged":[],"blocked":{"tranche":"T-2"}}', (New-Object System.Text.UTF8Encoding $false))
  $stateBefore = [System.IO.File]::ReadAllText($script:StateFile)
  $bakBefore = [System.IO.File]::ReadAllText("$script:StateFile.bak")
  $code = Complete-OwnerStop "gh is not authenticated (gh auth status failed)" "T-2"
  Check "a preflight owner stop over unreadable state ends FATAL" ($code -eq 2)
  Check "...and leaves state.json byte-for-byte unchanged" ([System.IO.File]::ReadAllText($script:StateFile) -ceq $stateBefore)
  Check "...and leaves its backup byte-for-byte unchanged" ([System.IO.File]::ReadAllText("$script:StateFile.bak") -ceq $bakBefore)
  $noteText = [System.IO.File]::ReadAllText((Join-Path $script:Dir "OWNER_DECISION_REQUIRED.md"))
  Check "...and the owner note names both the decision and the unreadable state" ($noteText -match "not authenticated" -and $noteText -match "unreadable or invalid")
  Remove-Item -Force $script:StateFile, "$script:StateFile.bak"
  $code = Complete-OwnerStop "gh is not authenticated (gh auth status failed)" "T-2"
  Check "an owner stop over absent state saves the block and exits 0" ($code -eq 0 -and (Read-State).blocked.tranche -eq "T-2")
  Save-State (New-State)

  # The retry budget limits launches, not gating an existing candidate.
  $readyResult = $init + "`n" + '{"type":"result","is_error":false,"result":"ok\nAUTOPILOT_RESULT: READY_FOR_GATE\nAUTOPILOT_PR: 99\nAUTOPILOT_SHA: sha1\nAUTOPILOT_DECISION: NONE"}'
  $retryResult = $init + "`n" + '{"type":"result","is_error":false,"result":"ok\nAUTOPILOT_RESULT: RETRYABLE_FAILURE\nAUTOPILOT_PR: NONE\nAUTOPILOT_SHA: NONE\nAUTOPILOT_DECISION: NONE"}'
  function Set-SpentBudget([string]$lastTranscript) {
    Reset-Stub
    for ($n = 1; $n -le ($MaxRepairCycles + 1); $n++) {
      $text = if ($n -eq ($MaxRepairCycles + 1)) { $lastTranscript } else { $retryResult }
      Set-AuditRecord $entry.Id (New-AuditRecord $n $text "t$n" "sha1")
    }
    $spent = New-State
    Set-Attempts $spent $entry.Id ($MaxRepairCycles + 1)
    Save-State $spent
    $script:Launches = 0
    return $spent
  }
  $spent = Set-SpentBudget $readyResult
  $outcome = Invoke-Tranche $entry $spent @("verify")
  Check "budget spent, last run READY_FOR_GATE: the candidate is gated and merged without a new launch" ($outcome -eq "MERGED" -and $script:Launches -eq 0 -and $script:StubMerges -eq 1)
  $spent = Set-SpentBudget $readyResult
  $script:GateOnly = $true
  $outcome = Invoke-Tranche $entry $spent @("verify")
  $script:GateOnly = $script:GateOnlySaved
  Check "budget spent: -GateOnly still evaluates the existing candidate" ($outcome -eq "MERGED" -and $script:Launches -eq 0)
  $spent = Set-SpentBudget $readyResult
  $script:StubGateDecision = "RETRYABLE_FAILURE"
  $outcome = Invoke-Tranche $entry $spent @("verify")
  $script:StubGateDecision = "READY_TO_MERGE"
  Check "budget spent and the existing candidate's gate fails: FATAL, never a fifth launch" ($outcome -like "FATAL:retry budget exhausted*" -and $script:Launches -eq 0 -and $script:StubMerges -eq 0)
  $spent = Set-SpentBudget $retryResult
  $outcome = Invoke-Tranche $entry $spent @("verify")
  Check "budget spent and no READY candidate: FATAL without launching" ($outcome -like "FATAL:retry budget exhausted*" -and $script:Launches -eq 0)
  Save-State (New-State)

  # An unauditable transcript stops for the owner at once: no further launch, no merge.
  Reset-Stub
  Save-State (New-State)
  $script:Launches = 0
  $script:StubTranscriptSaved = $script:StubTranscript
  $script:StubTranscript = "garbage, not a stream"
  function Invoke-Claude([string]$prompt, [string]$label) { $script:Launches++; return [pscustomobject]@{ ExitCode = 1; Transcript = $script:StubTranscript; Stderr = ""; Path = "stub" } }
  $outcome = Invoke-Tranche $entry (New-State) @("verify")
  Check "an unauditable transcript stops for the owner after ONE launch, never retrying" ($outcome -like "OWNER:*cannot be audited*" -and $script:Launches -eq 1 -and $script:StubMerges -eq 0)
  $outcome = Invoke-Tranche $entry (New-State) @("verify")
  Check "...and a restart does not launch again while it is unconfirmed" ($outcome -like "OWNER:*cannot be audited*" -and $script:Launches -eq 1 -and $script:StubMerges -eq 0)
  # Recovery of an interrupted run whose transcript is unreadable: owner, no launch.
  Reset-Stub
  $badPath = Join-Path $script:Dir "unreadable-transcript.jsonl"
  [System.IO.File]::WriteAllText($badPath, "not json at all", (New-Object System.Text.UTF8Encoding $false))
  Set-AuditRecord $entry.Id ([pscustomobject]@{ attempt = 1; status = "STARTED"; transcript = $badPath; at = "x" })
  $script:Launches = 0
  $outcome = Invoke-Tranche $entry (New-State) @("verify")
  Check "a recovered unreadable transcript stops for the owner with zero launches" ($outcome -like "OWNER:*cannot be audited*" -and $script:Launches -eq 0 -and $script:StubMerges -eq 0)
  # The owner's explicit confirmation resolves it.
  $confirmed = @(Read-AuditRecords $entry.Id)[0]
  $confirmed | Add-Member -NotePropertyName ownerConfirmed -NotePropertyValue $true -Force
  Set-AuditRecord $entry.Id $confirmed
  Check "ownerConfirmed on the record resolves the unauditable stop" ((Get-OwnerBlock (New-State) @(Read-AuditRecords $entry.Id) $entry.Id (Get-QueueHash)) -eq "")

  # The NORMAL path persists that stop through Stop-Blocked; with the queue
  # unchanged, the confirmation alone must clear the persisted block at restart.
  Reset-Stub
  Set-AuditRecord $entry.Id ([pscustomobject]@{ attempt = 1; status = "COMPLETED"; auditable = $false; unauditableReason = "line 2 is not JSON"; wclHits = @(); candidateSha = ""; result = ""; queueHash = (Get-QueueHash); transcript = "t"; at = "x" })
  $persisted = New-State
  Stop-Blocked $persisted $entry.Id "the transcript of attempt 1 cannot be audited (line 2 is not JSON); inspect t and set ownerConfirmed on its audit record"
  $persisted = Read-State
  Check "the persisted unauditable stop records its kind and attempt" ($persisted.blocked.kind -eq "AUDIT_CONFIRMATION" -and $persisted.blocked.attempt -eq 1)
  Check "unconfirmed, a restart with the queue unchanged stays blocked" ((Resolve-StartupBlock $persisted) -eq $true)
  $rec1 = @(Read-AuditRecords $entry.Id)[0]
  $rec1 | Add-Member -NotePropertyName ownerConfirmed -NotePropertyValue $true -Force
  Set-AuditRecord $entry.Id $rec1
  $persisted = Read-State
  Check "confirmed, a restart with the queue unchanged clears the persisted block" ((Resolve-StartupBlock $persisted) -eq $false -and $null -eq (Read-State).blocked)
  $script:Launches = 0
  $script:StubTranscript = $script:StubTranscriptSaved
  $outcome = Invoke-Tranche $entry (Read-State) @("verify")
  Check "...and the tranche proceeds again" ($outcome -eq "MERGED" -and $script:Launches -eq 1)
  # An unrelated owner decision is NOT cleared by a confirmed record.
  $decision = New-State
  Stop-Blocked $decision $entry.Id "pick A or B"
  Check "a confirmed audit record never clears an unrelated owner decision" ((Resolve-StartupBlock (Read-State)) -eq $true)
  Save-State (New-State)
  Remove-Item -Force $badPath
  $script:StubTranscript = $script:StubTranscriptSaved
  Save-State (New-State)

  # A narrow owner grant never lets an unrelated (or any unverified) request through.
  $grantEntry = [pscustomobject]@{ Id = "T-GRANT"; Title = "grant test"; Status = "READY"; DependsOn = @(); Branch = "autopilot/t-grant"; Base = "main"; Wcl = "OWNER-GRANT: architecture.md M99; report abc fight 1 events only"; PublicContract = "NONE"; OwnerDecision = ""; Pr = $null; MergeSha = "" }
  $unrelated = '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"curl https://www.warcraftlogs.com/api/v2/client -d query=reportData(code:\"ZZZ\")"}}]}}'
  $granted = New-AuditRecord 1 ($init + "`n" + $unrelated + "`n" + '{"type":"result","is_error":false,"result":"ok\nAUTOPILOT_RESULT: READY_FOR_GATE\nAUTOPILOT_PR: 99\nAUTOPILOT_SHA: sha1\nAUTOPILOT_DECISION: NONE"}') "t" "sha1"
  Check "the audit keeps the matching command for the owner to judge" (@($granted.wclHits)[0] -match 'ZZZ')
  $ev = Test-AuditEvidence @($granted) 1 "sha1" $grantEntry.Wcl
  Check "under a narrow grant, an unrelated request is not passed: it needs the owner" ($ev.Owner.Count -eq 1 -and $ev.Owner[0] -match "within the grant")
  Check "...and the owner block names it" ((Get-OwnerBlock (New-State) @($granted) $grantEntry.Id (Get-QueueHash)) -match "Warcraft Logs")
  $grantedOk = $granted.PSObject.Copy()
  $grantedOk | Add-Member -NotePropertyName ownerConfirmed -NotePropertyValue $true -Force
  Check "the owner's confirmation of that record resolves it" ((Test-AuditEvidence @($grantedOk) 1 "sha1" $grantEntry.Wcl).Owner.Count -eq 0)
  Reset-Stub
  $script:StubTranscript = $init + "`n" + $unrelated
  $script:Launches = 0
  $outcome = Invoke-Tranche $grantEntry (New-State) @("verify")
  Check "a granted tranche with detected activity stops for the owner, never merges" ($outcome -like "OWNER:attempt 1 shows Warcraft Logs*" -and $script:StubMerges -eq 0 -and $script:Launches -eq 1)
  $persistedGrant = New-State
  Stop-Blocked $persistedGrant $grantEntry.Id $outcome.Substring(6)
  Check "that stop persists as an AUDIT_CONFIRMATION of attempt 1" ((Read-State).blocked.kind -eq "AUDIT_CONFIRMATION" -and (Read-State).blocked.attempt -eq 1)
  $auditGrant = Get-AuditPath $grantEntry.Id
  if (Test-Path $auditGrant) { Remove-Item -Force $auditGrant }
  $script:StubTranscript = $script:StubTranscriptSaved
  Save-State (New-State)

  Reset-Stub; $script:StubTranscript = $t1
  $outcome = Invoke-Tranche $entry (New-State) @("verify")
  Check "probe activity in the transcript stops for the owner and never merges" ($outcome -like "OWNER:*" -and $script:StubMerges -eq 0)
  Reset-Stub
  Write-Host ""
  if ($script:SelfTestFailures -eq 0) { Write-Host "self-test: all passed"; return 0 } else { Write-Host "self-test: $($script:SelfTestFailures) failed"; return 1 }
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if ($SelfTest) { exit (Invoke-SelfTest) }

$lockStream = $null
try {
  $lockStream = [System.IO.File]::Open($script:LockFile, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
}
catch {
  Write-Host "autopilot: another supervisor holds $script:LockFile; exiting."
  exit 0
}
$bytes = [System.Text.Encoding]::UTF8.GetBytes("$PID $(Get-Date -Format o)")
$lockStream.SetLength(0); $lockStream.Write($bytes, 0, $bytes.Length); $lockStream.Flush()

$exitCode = 0
$completed = 0
try {
  if (Test-Path $script:StopFile) { Remove-Item -Force $script:StopFile }
  Set-Status @{ supervisorState = "STARTING"; startedAt = $script:StartedAt.ToString("o"); currentTranche = $null; phase = "PREFLIGHT"; stopReason = $null; maxTranches = $MaxTranches; noMerge = [bool]$NoMerge }
  Write-Log "supervisor starting (MaxTranches $MaxTranches, MaxRuntimeMinutes $MaxRuntimeMinutes, NoMerge $([bool]$NoMerge), GateOnly $([bool]$GateOnly), queue $QueueFile)"
  Invoke-Preflight
  $state = Initialize-State

  if ($TrancheId -ne "") {
    $block = Get-OwnerBlock $state (Read-AuditRecords $TrancheId) $TrancheId (Get-QueueHash)
    if ($block -ne "") {
      Write-Log "refusing $($TrancheId): $block (record the decision in the queue to resolve it)"
      Set-Status @{ supervisorState = "BLOCKED"; phase = "OWNER_DECISION_REQUIRED"; currentTranche = $TrancheId; stopReason = $block }
      exit 0
    }
  }
  if ($TrancheId -eq "" -and (Resolve-StartupBlock $state)) { exit 0 }

  Invoke-Git @("fetch", "origin", "--prune") | Out-Null
  $queuePath = if ([System.IO.Path]::IsPathRooted($QueueFile)) { $QueueFile } else { Join-Path $script:Repo $QueueFile }
  $queueText = Get-Content -Raw -Encoding UTF8 $queuePath
  $expectedChecks = Get-RequiredChecks $queueText
  if ($expectedChecks.Count -eq 0) { throw "FATAL: the queue declares no requiredChecks; a green CI cannot be verified" }

  while ($true) {
    if (Test-Path $script:StopFile) { Write-Log "STOP requested; stopping at a safe boundary"; Set-Status @{ supervisorState = "STOPPED"; stopReason = "STOP file" }; break }
    if ($MaxRuntimeMinutes -gt 0 -and ((Get-Date) - $script:StartedAt).TotalMinutes -ge $MaxRuntimeMinutes) { Write-Log "maximum runtime reached"; Set-Status @{ supervisorState = "STOPPED"; stopReason = "MaxRuntimeMinutes" }; break }
    if ($MaxTranches -gt 0 -and $completed -ge $MaxTranches) { Write-Log "completed $completed tranche(s); MaxTranches reached"; Set-Status @{ supervisorState = "IDLE"; stopReason = "MaxTranches reached" }; break }

    $queue = Read-Queue
    $entry = Select-NextTranche $queue $state
    if ($null -eq $entry) {
      $blocker = Get-FirstBlocker $queue $state
      $reason = if ($null -ne $blocker) { "next roadmap item $($blocker.Id) needs an owner decision: $($blocker.OwnerDecision)" } else { "no READY tranche whose dependencies are merged" }
      Stop-Blocked $state $(if ($null -ne $blocker) { $blocker.Id } else { "" }) $reason
      break
    }
    if ($entry.Wcl -ne "NONE" -and $entry.Wcl -notmatch '^OWNER-GRANT:') { throw "FATAL: tranche $($entry.Id) has a malformed WCL grant '$($entry.Wcl)'" }
    Write-Log "selected $($entry.Id): $($entry.Title) (branch $($entry.Branch))"
    Set-Status @{ supervisorState = "RUNNING"; currentTranche = $entry.Id; branch = $entry.Branch; phase = "SELECTED"; prNumber = $entry.Pr }

    $outcome = Invoke-Tranche $entry $state $expectedChecks
    Write-Log "tranche $($entry.Id) outcome: $outcome"
    if ($outcome -eq "MERGED") { $completed++; continue }
    if ($outcome -eq "ALREADY_MERGED") {
      if ($TrancheId -ne "") { Set-Status @{ supervisorState = "IDLE"; stopReason = "$($entry.Id) is already merged" }; break }
      continue
    }
    if ($outcome -eq "WOULD_MERGE") { $completed++; Set-Status @{ supervisorState = "IDLE"; stopReason = "NoMerge: gate passed, merge skipped" }; break }
    if ($outcome -eq "STOPPED") { Set-Status @{ supervisorState = "STOPPED"; stopReason = "STOP file" }; break }
    if ($outcome -like "OWNER:*") { Stop-Blocked $state $entry.Id $outcome.Substring(6); break }
    if ($outcome -like "GATE_NOT_READY:*") { Set-Status @{ supervisorState = "IDLE"; stopReason = $outcome }; break }
    if ($outcome -like "FATAL:*") { throw $outcome }
    throw "FATAL: unexpected outcome $outcome"
  }
}
catch {
  $message = Redact "$($_.Exception.Message)"
  if ($message -like "REFUSED:*") {
    Write-Log $message
    Set-Status @{ supervisorState = "IDLE"; stopReason = $message }
    $exitCode = 1
  }
  elseif ($message -like "OWNER:*") {
    $exitCode = Complete-OwnerStop $message.Substring(6) $(if ($script:Status.Contains("currentTranche")) { [string]$script:Status["currentTranche"] } else { "" })
  }
  elseif ($message -like "RECOVERABLE:*") {
    Write-Log "RECOVERABLE failure: $message (exit 3 so a scheduled restart retries)"
    Set-Status @{ supervisorState = "RECOVERABLE_FAILURE"; stopReason = $message }
    $exitCode = 3
  }
  else {
    Write-Log "FATAL: $message"
    Write-Log ("at: " + (($_.ScriptStackTrace -split "`r?`n" | Select-Object -First 4) -join " <- "))
    Set-Status @{ supervisorState = "FATAL"; stopReason = $message }
    $exitCode = 2
  }
}
finally {
  if ($null -ne $script:ClaudeProcess) { try { Stop-ProcessTree $script:ClaudeProcess.Id } catch {} }
  if ($null -ne $lockStream) { $lockStream.Dispose() }
  Write-Log "supervisor exiting with code $exitCode"
}
exit $exitCode
