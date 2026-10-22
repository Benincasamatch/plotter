# Deployment rollback without tar snapshots.
#
# Every deployed file lives in this Git work tree, so a failed deployment is
# undone by restoring the committed bytes of exactly the files it touched.
# Nothing is copied aside before deploying: the previous state is HEAD.
$ErrorActionPreference = 'Stop'

function Get-DeployedPath {
    param([Parameter(Mandatory)][string]$Root, [Parameter(Mandatory)][string[]]$Relative)
    # Resolve one release-relative path and refuse anything outside the repository.
    $resolved = foreach ($item in $Relative) {
        $full = [IO.Path]::GetFullPath((Join-Path $Root $item))
        if (-not $full.StartsWith($Root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
            throw ('Path escapes the repository: ' + $item)
        }
        $full
    }
    return @($resolved)
}

function Assert-CleanSource {
    param([Parameter(Mandatory)][string]$Root, [Parameter(Mandatory)][string[]]$Relative)
    # A dirty source file would be silently reverted by the rollback, hiding local work.
    $paths = Get-DeployedPath -Root $Root -Relative $Relative
    $output = & git -C $Root status --porcelain -- @($Relative)
    if ($LASTEXITCODE -ne 0) { throw 'git status failed; is this a Git work tree?' }
    if ($output) { throw ('Uncommitted changes in deployed files; commit before deploying: ' + ($output -join '; ')) }
    return $paths
}

function Restore-CommittedFiles {
    param([Parameter(Mandatory)][string]$Root, [Parameter(Mandatory)][string[]]$Relative)
    # Rollback = discard the deployed edits; HEAD is the state that was live before.
    $null = Get-DeployedPath -Root $Root -Relative $Relative
    & git -C $Root checkout HEAD -- @($Relative)
    if ($LASTEXITCODE -ne 0) { throw 'Rollback failed: git checkout returned an error.' }
    $left = & git -C $Root status --porcelain -- @($Relative)
    if ($left) { throw ('Rollback left modified files: ' + ($left -join '; ')) }
}
