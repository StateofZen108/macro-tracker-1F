param(
  [string]$ImagePath = "C:\Users\deepp\Downloads\MF\tmp\ocr-healthcheck.jpg",
  [string]$ApiUrl = "http://127.0.0.1:3000/api/label-ocr/extract"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $ImagePath)) {
  Write-Error "OCR health check image not found: $ImagePath"
}

$bytes = [System.IO.File]::ReadAllBytes($ImagePath)
if ($bytes.Length -le 0) {
  Write-Error "OCR health check image is empty: $ImagePath"
}

$base64 = [Convert]::ToBase64String($bytes)
$body = @{
  images = @(@{
    role = "panel"
    imageBase64 = "data:image/jpeg;base64,$base64"
    fileName = [System.IO.Path]::GetFileName($ImagePath)
    byteLength = $bytes.Length
  })
  expectedLocale = "auto"
} | ConvertTo-Json -Depth 6

try {
  $response = Invoke-RestMethod -Method Post -Uri $ApiUrl -ContentType "application/json" -Body $body
} catch {
  if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 503) {
    Write-Error "OCR provider is not configured for this runtime."
  }

  throw
}

$errors = @()
if ($response.provider -ne "gemini") {
  $errors += "provider=$($response.provider)"
}

if ($response.status -ne "success") {
  $errors += "status=$($response.status)"
}

if ($null -eq $response.session) {
  $errors += "session missing"
}

if ($null -eq $response.fields) {
  $errors += "fields missing"
}

if (-not ($response.warnings -is [System.Array])) {
  $errors += "warnings is not an array"
}

if ($errors.Count -gt 0) {
  Write-Error ("OCR health check failed: " + ($errors -join "; "))
}

Write-Host "OCR health check passed."
Write-Host "provider=$($response.provider)"
Write-Host "status=$($response.status)"
