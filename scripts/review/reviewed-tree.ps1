<#
.SYNOPSIS
  The git tree id of a working tree under review: the tree that staging
  everything (except the excluded paths) would commit.

.DESCRIPTION
  Dot-sourced by scripts/review/openai-review.ps1 (which records the id beside
  the verdict) and by the autopilot self-test (which pins its behavior). The
  project autopilot merges only a commit whose tree equals the tree an
  APPROVED review saw.

  It starts from a COPY of the real index, never from HEAD in an empty index:
  the copy keeps git's stat cache, so a file git already treats as unchanged
  (for example one checked out with CRLF over an LF blob while core.autocrlf
  is false) is not re-hashed into a different blob. The real index is never
  touched. Native stderr (line-ending warnings) is judged by exit code, not
  allowed to terminate under "Stop" in Windows PowerShell 5.1.

  Returns the tree id, or $null when any git step fails.
#>
function Get-ReviewedTreeId([string]$RepoRoot, [string]$WorkDir, [string[]]$Exclude) {
  $ErrorActionPreference = "Continue"
  $index = Join-Path $WorkDir "reviewed-tree.index"
  if (Test-Path $index) { Remove-Item -Force $index }
  $realIndex = "$(& git -C $RepoRoot rev-parse --git-path index)".Trim()
  if (-not [System.IO.Path]::IsPathRooted($realIndex)) { $realIndex = Join-Path $RepoRoot $realIndex }
  if (-not (Test-Path $realIndex)) { return $null }
  Copy-Item -Force $realIndex $index
  $previous = $env:GIT_INDEX_FILE
  $env:GIT_INDEX_FILE = $index
  try {
    $pathspec = @("--", ".") + @($Exclude | ForEach-Object { ":(exclude)$_" })
    & git -C $RepoRoot add -A @pathspec 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    $tree = (& git -C $RepoRoot write-tree)
    if ($LASTEXITCODE -ne 0) { return $null }
    return "$tree".Trim()
  }
  finally {
    if ($null -eq $previous) { Remove-Item Env:GIT_INDEX_FILE -ErrorAction SilentlyContinue } else { $env:GIT_INDEX_FILE = $previous }
    if (Test-Path $index) { Remove-Item -Force $index }
  }
}
