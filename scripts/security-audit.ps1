$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$failures = @()

function Add-Failure([string]$message) {
  $script:failures += $message
  Write-Host "[FAIL] $message" -ForegroundColor Red
}

function Add-Pass([string]$message) {
  Write-Host "[PASS] $message" -ForegroundColor Green
}

$baselinePath = Join-Path $root 'config/production-baseline.json'
if (-not (Test-Path $baselinePath)) {
  Add-Failure 'config/production-baseline.json is missing'
  exit 1
}
$baseline = Get-Content $baselinePath -Raw -Encoding UTF8 | ConvertFrom-Json
$requiredFunctions = @($baseline.requiredCloudFunctions)
foreach ($name in $requiredFunctions) {
  $path = Join-Path $root "cloudfunctions/$name/index.js"
  if (Test-Path $path) {
    Add-Pass "Cloud function exists: $name"
  } else {
    Add-Failure "Missing cloud function: $name"
  }
}

$requiredCollections = @($baseline.denyClientReadWriteCollections)
foreach ($name in @('enterprise_notifications', 'operation_logs')) {
  if ($requiredCollections -contains $name) {
    Add-Pass "Protected collection is in production baseline: $name"
  } else {
    Add-Failure "Protected collection missing from production baseline: $name"
  }
}

$directDb = & rg -n 'wx\.cloud\.database\(|\.collection\(' miniprogram -g '*.js' 2>$null
if ($LASTEXITCODE -eq 0 -and $directDb) {
  Add-Failure 'Direct database access remains in miniprogram code'
  $directDb | ForEach-Object { Write-Host "       $_" }
} else {
  Add-Pass 'No direct database access in miniprogram code'
}

$secretHits = & rg -n 'admin123|sk-[A-Za-z0-9_-]{12,}|AKID[A-Za-z0-9]{12,}' . -g '!**/node_modules/**' -g '!*.md' -g '!package-lock.json' -g '!scripts/security-audit.ps1' 2>$null
if ($LASTEXITCODE -eq 0 -and $secretHits) {
  Add-Failure 'Possible hardcoded account or secret found'
  $secretHits | ForEach-Object { Write-Host "       $_" }
} else {
  Add-Pass 'No common hardcoded account or secret found'
}

$appConfig = Get-Content (Join-Path $root 'miniprogram/app.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($appConfig.__usePrivacyCheck__ -eq $true) {
  Add-Pass 'Privacy check is enabled'
} else {
  Add-Failure 'app.json does not enable __usePrivacyCheck__'
}

if (Test-Path (Join-Path $root 'miniprogram/sitemap.json')) {
  Add-Pass 'sitemap.json exists'
} else {
  Add-Failure 'sitemap.json is missing'
}

$syntaxFailed = $false
$jsFiles = Get-ChildItem miniprogram, cloudfunctions -Recurse -Filter '*.js' -File | Where-Object { $_.FullName -notmatch '[\\/]node_modules[\\/]' }
foreach ($file in $jsFiles) {
  & node --check $file.FullName 2>$null
  if ($LASTEXITCODE -ne 0) {
    $syntaxFailed = $true
    Add-Failure "JavaScript syntax error: $($file.FullName)"
  }
}
if (-not $syntaxFailed) {
  Add-Pass 'JavaScript syntax check passed'
}

if ($failures.Count -gt 0) {
  Write-Host "`nSecurity audit failed: $($failures.Count) item(s)" -ForegroundColor Red
  exit 1
}

Write-Host "`nSecurity audit passed. Verify database rules and environment variables in CloudBase console." -ForegroundColor Cyan
