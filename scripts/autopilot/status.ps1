<#
.SYNOPSIS
  Shows the project autopilot's status in a few lines.

.DESCRIPTION
  Reads .probe/autopilot/status.json (the supervisor's heartbeat) and
  state.json (its runtime state and merge ledger). It changes nothing.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/autopilot/status.ps1
#>
[CmdletBinding()]
param([switch]$Json)

$ErrorActionPreference = "Stop"
$repo = (git -C $PSScriptRoot rev-parse --show-toplevel).Trim()
$dir = Join-Path $repo ".probe\autopilot"
$statusFile = Join-Path $dir "status.json"
$stateFile = Join-Path $dir "state.json"

if (-not (Test-Path $statusFile)) {
  Write-Host "autopilot: no status yet (the supervisor has never run on this machine)."
  exit 0
}
$status = Get-Content -Raw -Encoding UTF8 $statusFile | ConvertFrom-Json
if ($Json) { Get-Content -Raw -Encoding UTF8 $statusFile; exit 0 }

function Field($object, [string]$name) {
  $p = $object.PSObject.Properties[$name]
  if ($null -eq $p -or $null -eq $p.Value -or "$($p.Value)" -eq "") { return "-" }
  return "$($p.Value)"
}

$alive = "no"
$pidText = Field $status "pid"
if ($pidText -ne "-") {
  $proc = Get-Process -Id ([int]$pidText) -ErrorAction SilentlyContinue
  if ($null -ne $proc -and $proc.ProcessName -match "powershell|pwsh") { $alive = "yes (pid $pidText)" }
}
$lock = Join-Path $dir "supervisor.lock"

Write-Host ("Supervisor     : {0}   running: {1}" -f (Field $status "supervisorState"), $alive)
Write-Host ("Tranche        : {0}   branch: {1}" -f (Field $status "currentTranche"), (Field $status "branch"))
Write-Host ("Phase          : {0}   attempt: {1}" -f (Field $status "phase"), (Field $status "attempt"))
Write-Host ("PR             : {0}   candidate: {1}" -f (Field $status "prNumber"), (Field $status "candidateSha"))
Write-Host ("Claude result  : {0}" -f (Field $status "lastClaudeResult"))
Write-Host ("Codex verdict  : {0}" -f (Field $status "lastCodexVerdict"))
Write-Host ("CI / gate      : {0} / {1}" -f (Field $status "ciState"), (Field $status "lastGate"))
Write-Host ("Last activity  : {0}   last success: {1}" -f (Field $status "lastActivityAt"), (Field $status "lastSuccessAt"))
Write-Host ("Updated        : {0}" -f (Field $status "updatedAt"))
$reason = Field $status "stopReason"
if ($reason -ne "-") { Write-Host ("Stop reason    : {0}" -f $reason) }
$gateReasons = $status.PSObject.Properties["gateReasons"]
if ($null -ne $gateReasons -and @($gateReasons.Value).Count -gt 0) {
  Write-Host "Gate reasons   :"
  foreach ($r in @($gateReasons.Value)) { Write-Host "  - $r" }
}
if (Test-Path (Join-Path $dir "OWNER_DECISION_REQUIRED.md")) {
  Write-Host ""
  Write-Host "OWNER DECISION REQUIRED - see .probe/autopilot/OWNER_DECISION_REQUIRED.md"
}
if (Test-Path (Join-Path $dir "STOP")) { Write-Host "A graceful stop is requested (.probe/autopilot/STOP)." }
if (Test-Path $stateFile) {
  $state = Get-Content -Raw -Encoding UTF8 $stateFile | ConvertFrom-Json
  $merged = @($state.merged)
  if ($merged.Count -gt 0) {
    Write-Host ""
    Write-Host "Merged by the autopilot:"
    foreach ($m in $merged) { Write-Host ("  {0}  PR #{1}  {2}  {3}" -f $m.id, $m.pr, "$($m.mergeSha)".Substring(0, [Math]::Min(10, "$($m.mergeSha)".Length)), $m.at) }
  }
}
Write-Host ""
Write-Host "Log: .probe/autopilot/latest.log"
