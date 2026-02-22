$ErrorActionPreference = "Stop"

$port = 5500
$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $rootDir ".prograce-server.pid"
$appUrl = "http://127.0.0.1:$port"
$probeUrl = "$appUrl/api/data"

function Test-ServerReady {
  param([string]$Url)
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Open-App {
  Start-Process $appUrl | Out-Null
}

$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCommand) {
  Write-Host "Python is not installed or not available in PATH." -ForegroundColor Red
  Write-Host "Install Python, then run this launcher again." -ForegroundColor Yellow
  exit 1
}

if (Test-Path $pidFile) {
  $existingPidText = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  if ($existingPidText -match "^\d+$") {
    $existingPid = [int]$existingPidText
    $existingProcess = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
    if ($existingProcess -and (Test-ServerReady -Url $probeUrl)) {
      Open-App
      exit 0
    }
  }

  Remove-Item $pidFile -ErrorAction SilentlyContinue
}

$serverProcess = Start-Process `
  -FilePath $pythonCommand.Source `
  -ArgumentList @("server.py", "--port", "$port") `
  -WorkingDirectory $rootDir `
  -WindowStyle Hidden `
  -PassThru

Set-Content -Path $pidFile -Value $serverProcess.Id -NoNewline

for ($attempt = 0; $attempt -lt 40; $attempt++) {
  if (Test-ServerReady -Url $probeUrl) {
    Open-App
    exit 0
  }
  Start-Sleep -Milliseconds 250
}

Write-Host "Server process started but did not become ready in time." -ForegroundColor Red
Write-Host "Run stop-local.ps1 and try again." -ForegroundColor Yellow
exit 1
