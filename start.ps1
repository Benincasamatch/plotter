param([switch]$Simulate, [int]$Port = 8080, [string]$FontDir = '')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskPython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) {
    py -3 -m venv (Join-Path $PSScriptRoot '.venv')
    if ($LASTEXITCODE -ne 0) { throw 'Python 3.10 or newer is required.' }
}
& $taskPython -c "import importlib.util,sys; sys.exit(0 if importlib.util.find_spec('serial') else 1)"
if ($LASTEXITCODE -ne 0) {
    & $taskPython -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}
$taskArgs = @('-m', 'plotter.server', '--port', "$Port")
if ($Simulate) { $taskArgs += '--simulate' }
if ($FontDir) { $taskArgs += @('--font-dir', $FontDir) }
& $taskPython @taskArgs
