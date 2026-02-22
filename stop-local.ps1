$ErrorActionPreference = "Stop"

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $rootDir ".prograce-server.pid"

if (-not (Test-Path $pidFile)) {
  Write-Host "Pro Grace server is not running."
  exit 0
}

$pidText = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
if ($pidText -match "^\d+$") {
  $serverPid = [int]$pidText
  $process = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
  if ($process) {
    Stop-Process -Id $serverPid -Force
    Write-Host "Pro Grace server stopped."
  } else {
    Write-Host "PID file existed, but process was already stopped."
  }
} else {
  Write-Host "Invalid PID file detected. Cleaning up."
}

Remove-Item $pidFile -ErrorAction SilentlyContinue
