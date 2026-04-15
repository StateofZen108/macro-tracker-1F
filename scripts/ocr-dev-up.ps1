param(
  [int]$Port = 3000,
  [string]$ImagePath = "C:\Users\deepp\Downloads\MF\tmp\ocr-healthcheck.jpg",
  [int]$StartupTimeoutSeconds = 90,
  [switch]$SkipHealthCheck
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $repoRoot ".env"
$tmpDir = Join-Path $repoRoot "tmp"
$pidFile = Join-Path $tmpDir "ocr-dev.pid"
$apiUrl = "http://127.0.0.1:$Port/api/label-ocr/extract"
$rootUrl = "http://127.0.0.1:$Port"

function Test-OcrKeyConfigured {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return $false
  }

  $envLines = Get-Content -LiteralPath $Path
  foreach ($line in $envLines) {
    if ($line -match '^\s*(GEMINI_API_KEY|GOOGLE_API_KEY)\s*=\s*(.+)\s*$') {
      $value = $matches[2].Trim()
      if ($value.Length -gt 0) {
        return $true
      }
    }
  }

  return $false
}

function Get-RunningOcrProcess {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }

  $rawPid = (Get-Content -LiteralPath $Path -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
  if (-not $rawPid) {
    return $null
  }

  try {
    return Get-Process -Id ([int]$rawPid) -ErrorAction Stop
  } catch {
    return $null
  }
}

if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
  throw "Vercel CLI is not installed. Run 'npm i -g vercel' first."
}

if (-not (Test-OcrKeyConfigured -Path $envPath)) {
  throw "No server-side OCR key found in $envPath. Add GEMINI_API_KEY or GOOGLE_API_KEY first."
}

if (-not (Test-Path -LiteralPath $tmpDir)) {
  New-Item -ItemType Directory -Path $tmpDir | Out-Null
}

$runningProcess = Get-RunningOcrProcess -Path $pidFile
if ($runningProcess) {
  Write-Host "OCR dev server already running with PID $($runningProcess.Id)."
} else {
  $command = "Set-Location -LiteralPath '$repoRoot'; vercel dev --yes --listen $Port"
  $process = Start-Process -FilePath "powershell.exe" `
    -ArgumentList @("-NoLogo", "-NoProfile", "-Command", $command) `
    -WindowStyle Hidden `
    -PassThru

  Set-Content -LiteralPath $pidFile -Value $process.Id
  Write-Host "Started OCR dev server with PID $($process.Id)."
}

$deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
$ready = $false
do {
  Start-Sleep -Seconds 2
  try {
    $response = Invoke-WebRequest -Uri $rootUrl -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
      $ready = $true
      break
    }
  } catch {
    # keep polling until timeout
  }
} while ((Get-Date) -lt $deadline)

if (-not $ready) {
  throw "OCR dev server did not become reachable at $rootUrl within $StartupTimeoutSeconds seconds."
}

Write-Host "OCR dev server is reachable at $rootUrl."

if ($SkipHealthCheck) {
  Write-Host "Skipped OCR health check."
  exit 0
}

if (-not (Test-Path -LiteralPath $ImagePath)) {
  throw "OCR health check image not found: $ImagePath"
}

& powershell.exe -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "ocr-healthcheck.ps1") -ImagePath $ImagePath -ApiUrl $apiUrl
