param(
  [Parameter(Mandatory = $true)]
  [string]$FrontendUrl,
  [Parameter(Mandatory = $true)]
  [string]$BackendUrl,
  [string]$Email = $env:CAREER_HERO_TEST_EMAIL,
  [string]$Password = $env:CAREER_HERO_TEST_PASSWORD,
  [switch]$SkipUiLogin
)

$ErrorActionPreference = "Stop"

Write-Host "[step] Running local tests..."
& pwsh -File "scripts/test-local.ps1" -SkipInstall
if ($LASTEXITCODE -ne 0) { throw "[step] local tests failed" }

Write-Host "[step] Running online tests..."
& pwsh -File "scripts/test-online.ps1" `
  -FrontendUrl $FrontendUrl `
  -BackendUrl $BackendUrl `
  -Email $Email `
  -Password $Password `
  -SkipUiLogin:$SkipUiLogin
if ($LASTEXITCODE -ne 0) { throw "[step] online tests failed" }

Write-Host "[step] Local + online tests passed."

