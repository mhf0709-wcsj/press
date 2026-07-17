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

$appPath = Join-Path $root 'miniprogram/app.json'
$projectPath = Join-Path $root 'project.config.json'
$sitemapPath = Join-Path $root 'miniprogram/sitemap.json'
$app = Get-Content $appPath -Raw -Encoding UTF8 | ConvertFrom-Json
$project = Get-Content $projectPath -Raw -Encoding UTF8 | ConvertFrom-Json
$sitemap = Get-Content $sitemapPath -Raw -Encoding UTF8 | ConvertFrom-Json

$registeredPages = @($app.pages)
$missingPageFiles = @()
foreach ($page in $registeredPages) {
  foreach ($extension in @('js', 'json', 'wxml', 'wxss')) {
    $path = Join-Path $root "miniprogram/$page.$extension"
    if (-not (Test-Path -LiteralPath $path)) {
      $missingPageFiles += "${page}.${extension}"
    }
  }
}
if ($missingPageFiles.Count) {
  Add-Failure "Registered pages have missing files: $($missingPageFiles -join ', ')"
} else {
  Add-Pass "All $($registeredPages.Count) registered pages are complete"
}

$registeredDirectories = @($registeredPages | ForEach-Object { ($_ -split '/')[1] } | Sort-Object -Unique)
$unregisteredPages = Get-ChildItem -LiteralPath 'miniprogram/pages' -Directory | Where-Object {
  $registeredDirectories -notcontains $_.Name -and
  (Test-Path -LiteralPath (Join-Path $_.FullName "$($_.Name).js"))
}
if ($unregisteredPages) {
  Add-Failure "Unregistered page directories remain: $(@($unregisteredPages.Name) -join ', ')"
} else {
  Add-Pass 'No unregistered page code remains'
}

$requiredTabs = @('pages/ai-assistant/ai-assistant', 'pages/workbench/workbench', 'pages/user/user')
$actualTabs = @($app.tabBar.list | ForEach-Object { $_.pagePath })
$missingTabs = @($requiredTabs | Where-Object { $actualTabs -notcontains $_ })
if ($missingTabs.Count) {
  Add-Failure "Required enterprise tabs are missing: $($missingTabs -join ', ')"
} else {
  Add-Pass 'Enterprise tab structure is complete'
}

if ($app.lazyCodeLoading -eq 'requiredComponents') {
  Add-Pass 'Component lazy loading is enabled'
} else {
  Add-Failure 'lazyCodeLoading must be requiredComponents'
}

if ($project.setting.minified -and $project.setting.minifyWXML -and $project.setting.minifyWXSS) {
  Add-Pass 'JavaScript, WXML and WXSS minification is enabled'
} else {
  Add-Failure 'Production minification is incomplete'
}

if ($project.setting.urlCheck -and $project.setting.checkSiteMap -and $project.setting.scopeDataCheck) {
  Add-Pass 'URL, sitemap and setData validation are enabled'
} else {
  Add-Failure 'Developer tool production validation is incomplete'
}

$sitemapBlocked = @($sitemap.rules | Where-Object { $_.action -eq 'disallow' -and $_.page -eq '*' }).Count -gt 0
if ($sitemapBlocked) {
  Add-Pass 'Sitemap blocks search indexing of business pages'
} else {
  Add-Failure 'sitemap.json must disallow business page indexing'
}

$wxmlComments = & rg -n '<!--|-->' miniprogram -g '*.wxml' 2>$null
if ($LASTEXITCODE -eq 0 -and $wxmlComments) {
  Add-Failure 'WXML comments remain in production pages'
  $wxmlComments | ForEach-Object { Write-Host "       $_" }
} else {
  Add-Pass 'No WXML comments remain'
}

$debugLogs = & rg -n 'console\.(log|debug|info)\(' miniprogram -g '*.js' 2>$null
if ($LASTEXITCODE -eq 0 -and $debugLogs) {
  Add-Failure 'Production debug logs remain in miniprogram code'
  $debugLogs | ForEach-Object { Write-Host "       $_" }
} else {
  Add-Pass 'No production debug logs remain in miniprogram code'
}

$replacementCharacter = [string][char]0xFFFD
$garbledText = & rg -n --fixed-strings $replacementCharacter miniprogram -g '*.js' -g '*.json' -g '*.wxml' 2>$null
if ($LASTEXITCODE -eq 0 -and $garbledText) {
  Add-Failure 'Unicode replacement characters were found'
  $garbledText | ForEach-Object { Write-Host "       $_" }
} else {
  Add-Pass 'No obvious encoding replacement characters found'
}

$bomFiles = @()
Get-ChildItem -LiteralPath miniprogram -Recurse -File | Where-Object { $_.Extension -in @('.js', '.json', '.wxml', '.wxss') } | ForEach-Object {
  $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    $bomFiles += $_.FullName
  }
}
if ($bomFiles.Count) {
  Add-Failure "UTF-8 BOM files remain: $($bomFiles -join ', ')"
} else {
  Add-Pass 'No UTF-8 BOM remains in runtime files'
}

$largeImages = Get-ChildItem -LiteralPath 'miniprogram/images' -Recurse -File | Where-Object { $_.Length -gt 200KB }
if ($largeImages) {
  Add-Failure "Images larger than 200 KB remain: $(@($largeImages.Name) -join ', ')"
} else {
  Add-Pass 'All bundled images are under 200 KB'
}

if ($failures.Count -gt 0) {
  Write-Host "`nSubmission audit failed: $($failures.Count) item(s)" -ForegroundColor Red
  exit 1
}

Write-Host "`nSubmission audit passed." -ForegroundColor Cyan
