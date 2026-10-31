<#
.SYNOPSIS
  Installs (or removes) the Windows Scheduled Task that starts the project
  autopilot at the owner's logon.

.DESCRIPTION
  NOT run by the autopilot itself. The owner runs this once, by hand.

  The task:
  - starts at logon of the CURRENT Windows user, as that user (Interactive
    logon type: no password is stored, and the user's own GitHub CLI, Claude,
    Codex and Git credentials are used as they are);
  - runs scripts/autopilot/run-project.ps1 -MaxTranches 0 hidden, with the
    repository root as its working directory;
  - starts as soon as possible if a start was missed;
  - restarts after an unexpected failure (the supervisor exits non-zero only
    for a recoverable or fatal failure; a block for an owner decision exits 0
    and is not restarted), at most RestartCount times, RestartIntervalMinutes
    apart;
  - never starts a second copy while one runs (the supervisor also holds its
    own single-instance lock);
  - has no execution time limit, does not stop on idle, and is unaffected by
    the display turning off. It does not start on battery power and stops if
    the machine switches to battery.

  No credential, key or token appears in the task.

.PARAMETER Uninstall
  Removes the task.

.PARAMETER WhatIf
  Prints the task definition without registering it.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/autopilot/install-autopilot-task.ps1 -WhatIf
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/autopilot/install-autopilot-task.ps1
#>
[CmdletBinding()]
param(
  [switch]$Uninstall,
  [switch]$WhatIf,
  [string]$TaskName = "warcraft-logs-coach-vnext autopilot",
  [int]$RestartCount = 3,
  [int]$RestartIntervalMinutes = 15
)

$ErrorActionPreference = "Stop"
$repo = [System.IO.Path]::GetFullPath((git -C $PSScriptRoot rev-parse --show-toplevel).Trim())
$script = Join-Path $repo "scripts\autopilot\run-project.ps1"
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

if ($Uninstall) {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed scheduled task '$TaskName'."
  }
  else { Write-Host "No scheduled task named '$TaskName'." }
  exit 0
}

if (-not (Test-Path $script)) { throw "run-project.ps1 not found at $script" }
$psExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`" -MaxTranches 0 -MaxRuntimeMinutes 0"

$action = New-ScheduledTaskAction -Execute $psExe -Argument $arguments -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -RestartCount $RestartCount `
  -RestartInterval (New-TimeSpan -Minutes $RestartIntervalMinutes) `
  -ExecutionTimeLimit (New-TimeSpan -Seconds 0) `
  -DontStopOnIdleEnd

Write-Host "Task      : $TaskName"
Write-Host "User      : $user (Interactive logon; no stored password)"
Write-Host "Action    : $psExe $arguments"
Write-Host "Directory : $repo"
Write-Host "Trigger   : at logon of $user; start when available if missed"
Write-Host "Restart   : up to $RestartCount times, $RestartIntervalMinutes minutes apart, on failure"
Write-Host "Instances : IgnoreNew (never a second copy)"
Write-Host "Limits    : no execution time limit; not stopped on idle; AC power only"

if ($WhatIf) { Write-Host "-WhatIf: nothing registered."; exit 0 }

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
  -Description "Starts the warcraft-logs-coach-vnext project autopilot supervisor (scripts/autopilot/run-project.ps1 -MaxTranches 0) at logon. Installed by scripts/autopilot/install-autopilot-task.ps1." | Out-Null
Write-Host "Registered. It starts at your next logon; to start it now: Start-ScheduledTask -TaskName '$TaskName'"
