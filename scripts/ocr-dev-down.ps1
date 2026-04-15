param(
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $repoRoot "tmp\ocr-dev.pid"

function Get-ChildProcessIds {
  param([int]$ParentId)

  $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $ParentId" -ErrorAction SilentlyContinue
  $allIds = @()
  foreach ($child in $children) {
    $allIds += [int]$child.ProcessId
    $allIds += Get-ChildProcessIds -ParentId ([int]$child.ProcessId)
  }

  return $allIds
}

function Get-VercelListenerPid {
  param([int]$LocalPort)

  $listener = Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1 OwningProcess
  if (-not $listener) {
    return $null
  }

  $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
  if (
    $processInfo -and
    $processInfo.CommandLine -and
    $processInfo.CommandLine -match 'vercel[/\\]dist[/\\]vc\.js"?\s+dev'
  ) {
    return [int]$listener.OwningProcess
  }

  return $null
}

function Stop-ProcessIds {
  param([int[]]$ProcessIds)

  $ordered = $ProcessIds | Select-Object -Unique | Sort-Object -Descending
  foreach ($processId in $ordered) {
    try {
      $process = Get-Process -Id $processId -ErrorAction Stop
      Stop-Process -Id $process.Id -Force
      Write-Host "Stopped OCR process PID $($process.Id)."
    } catch {
      Write-Host "OCR process $processId was not running."
    }
  }
}

$processIdsToStop = @()

if (Test-Path -LiteralPath $pidFile) {
  $rawPid = (Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
  if ($rawPid) {
    $rootPid = [int]$rawPid
    $processIdsToStop += Get-ChildProcessIds -ParentId $rootPid
    $processIdsToStop += $rootPid
  } else {
    Write-Host "Removed empty OCR dev PID file."
  }
}

$listenerPid = Get-VercelListenerPid -LocalPort $Port
if ($listenerPid) {
  $processIdsToStop += $listenerPid
}

if ($processIdsToStop.Count -eq 0) {
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
  Write-Host "No OCR dev process found for PID file or port $Port."
  exit 0
}

Stop-ProcessIds -ProcessIds $processIdsToStop
Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
