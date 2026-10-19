$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$runner = Join-Path $project 'server\gpu-runner.ts'
$state = Join-Path $project '.blocky'
$envFile = Join-Path $project '.env.runner.local'
if (-not (Test-Path -LiteralPath $envFile)) { throw 'Create .env.runner.local using .env.runner.example first.' }
New-Item -ItemType Directory -Path $state -Force | Out-Null
$pidFile = Join-Path $state 'runner.pid'
if (Test-Path -LiteralPath $pidFile) {
  $runnerId = [int](Get-Content -LiteralPath $pidFile)
  $existing = Get-CimInstance Win32_Process -Filter "ProcessId = $runnerId" -ErrorAction SilentlyContinue
  if ($existing -and $existing.CommandLine.Contains($runner)) { Write-Host "GPU runner is already running (PID $runnerId)."; exit 0 }
}
$node = (Get-Command node).Source
$arguments = "--env-file=`"$envFile`" --experimental-strip-types `"$runner`""
$process = Start-Process -FilePath $node -ArgumentList $arguments -WorkingDirectory $project -WindowStyle Hidden -RedirectStandardOutput (Join-Path $state 'runner.log') -RedirectStandardError (Join-Path $state 'runner-error.log') -PassThru
$process.Id | Set-Content -LiteralPath $pidFile
Write-Host "GPU runner started (PID $($process.Id)). Keep ComfyUI open. Logs: .blocky\runner.log"
