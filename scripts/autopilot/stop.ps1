<#
.SYNOPSIS
  Asks the project autopilot to stop at its next safe boundary.

.DESCRIPTION
  Writes .probe/autopilot/STOP. The supervisor checks for it between phases
  (never in the middle of a Claude run, a commit or a merge) and exits
  cleanly. Nothing is killed. The file is removed when the supervisor next
  starts, so a later run is not blocked by an old request.

  -Cancel withdraws a pending request.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/autopilot/stop.ps1
#>
[CmdletBinding()]
param([switch]$Cancel)

$ErrorActionPreference = "Stop"
$repo = (git -C $PSScriptRoot rev-parse --show-toplevel).Trim()
$dir = Join-Path $repo ".probe\autopilot"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$stop = Join-Path $dir "STOP"

if ($Cancel) {
  if (Test-Path $stop) { Remove-Item -Force $stop; Write-Host "autopilot: stop request withdrawn." }
  else { Write-Host "autopilot: no stop request was pending." }
  exit 0
}
Set-Content -Path $stop -Value ("stop requested " + (Get-Date -Format o)) -Encoding UTF8
Write-Host "autopilot: stop requested. The supervisor stops at its next safe boundary."
Write-Host "Check with: powershell -ExecutionPolicy Bypass -File scripts/autopilot/status.ps1"
