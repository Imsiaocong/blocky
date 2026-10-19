$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$runner = Join-Path $project 'server\gpu-runner.ts'
$pidFile = Join-Path $project '.blocky\runner.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Host 'No runner PID file.'; exit 0 }
$runnerId = [int](Get-Content -LiteralPath $pidFile)
$process = Get-CimInstance Win32_Process -Filter "ProcessId = $runnerId" -ErrorAction SilentlyContinue
if ($process -and $process.CommandLine.Contains($runner)) { Stop-Process -Id $runnerId; Write-Host 'GPU runner stopped. ComfyUI was left running.' }
elseif ($process) { throw 'PID belongs to another process. No process was stopped.' }
Remove-Item -LiteralPath $pidFile
