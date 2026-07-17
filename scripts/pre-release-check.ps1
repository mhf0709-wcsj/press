$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

& powershell -ExecutionPolicy Bypass -File scripts/security-audit.ps1
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& powershell -ExecutionPolicy Bypass -File scripts/submission-audit.ps1
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$tests = @(
  'tests/ai-extraction/run.js',
  'tests/batch-import/run.js',
  'tests/auth-security/run.js',
  'tests/rectification-workflow/run.js',
  'tests/audit-coverage/run.js',
  'tests/data-freshness/run.js',
  'tests/enterprise-flow/run.js',
  'tests/admin-efficiency/run.js',
  'tests/submission-readiness/run.js'
)

foreach ($test in $tests) {
  Write-Host "`n[TEST] $test" -ForegroundColor Cyan
  & node $test
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "`nPre-release checks passed. Complete CloudBase console permission verification before upload." -ForegroundColor Green
