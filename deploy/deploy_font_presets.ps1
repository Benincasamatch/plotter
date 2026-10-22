param([string]$DeployRoot = 'C:\Users\102\plotter-web-20261014')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$taskRoot = (Resolve-Path -LiteralPath $DeployRoot).Path
$taskPackage = Join-Path $taskRoot 'deploy\font-presets-update-20261016.tar'
$taskBackup = Join-Path $taskRoot ('deploy\before-font-presets-' + (Get-Date -Format yyyyMMddHHmmss) + '.tar')
& tar.exe -cf $taskBackup -C $taskRoot plotter/static/index.html plotter/static/app.js plotter/static/style.css
if ($LASTEXITCODE -ne 0) { throw 'Backup failed; files were not changed.' }
try {
    & tar.exe -xf $taskPackage -C $taskRoot
    if ($LASTEXITCODE -ne 0) { throw 'Extraction failed' }
    $taskPage = (Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8080/').Content
    $taskScript = (Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8080/app.js').Content
    if ($taskPage -notlike '*id="fontPreset"*' -or $taskScript -notlike '*plotter.font-presets.v1*') { throw 'Updated content was not served' }
    $taskState = Invoke-RestMethod 'http://127.0.0.1:8080/api/state'
    [pscustomobject]@{Backup=$taskBackup;Phase=$taskState.phase;Connected=$taskState.connected;Port=$taskState.port;StaticUpdate=$true} | ConvertTo-Json
} catch {
    & tar.exe -xf $taskBackup -C $taskRoot
    throw
}
