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
$ProgressPreference = "SilentlyContinue"

function Assert-HttpCode {
  param(
    [string]$Name,
    [int]$Actual,
    [int[]]$Allowed
  )
  if ($Allowed -notcontains $Actual) {
    throw "[$Name] expected status $($Allowed -join ',') but got $Actual"
  }
}

function Escape-JsSingleQuoted {
  param([string]$Value)
  return (($Value -replace "\\", "\\\\") -replace "'", "\\'")
}

Write-Host "[online] Frontend health check..."
$frontResp = Invoke-WebRequest -Uri $FrontendUrl -Method GET -TimeoutSec 30 -SkipHttpErrorCheck
Assert-HttpCode -Name "frontend" -Actual ([int]$frontResp.StatusCode) -Allowed @(200)

Write-Host "[online] Backend templates check..."
$templatesResp = Invoke-WebRequest -Uri "$($BackendUrl.TrimEnd('/'))/api/templates" -Method GET -TimeoutSec 30 -SkipHttpErrorCheck
Assert-HttpCode -Name "backend.templates" -Actual ([int]$templatesResp.StatusCode) -Allowed @(200)

Write-Host "[online] Backend CORS preflight check..."
$headers = @{
  Origin = $FrontendUrl.TrimEnd('/')
  "Access-Control-Request-Method" = "GET"
}
$corsResp = Invoke-WebRequest -Uri "$($BackendUrl.TrimEnd('/'))/api/templates" -Method OPTIONS -Headers $headers -TimeoutSec 30 -SkipHttpErrorCheck
Assert-HttpCode -Name "backend.cors" -Actual ([int]$corsResp.StatusCode) -Allowed @(200, 204)

$aco = [string]$corsResp.Headers["Access-Control-Allow-Origin"]
if ([string]::IsNullOrWhiteSpace($aco)) {
  throw "[backend.cors] missing Access-Control-Allow-Origin header"
}

if (-not $SkipUiLogin) {
  if ([string]::IsNullOrWhiteSpace($Email) -or [string]::IsNullOrWhiteSpace($Password)) {
    throw "[online.ui] missing Email/Password; pass params or set CAREER_HERO_TEST_EMAIL/CAREER_HERO_TEST_PASSWORD"
  }

  Write-Host "[online] UI login smoke via Playwright CLI..."
  $session = "online-smoke-" + [Guid]::NewGuid().ToString("N").Substring(0, 10)
  $frontendLogin = "$($FrontendUrl.TrimEnd('/'))/login"
  $frontendProfile = "$($FrontendUrl.TrimEnd('/'))/profile"

  $safeEmail = Escape-JsSingleQuoted -Value $Email
  $safePassword = Escape-JsSingleQuoted -Value $Password
  $safeLoginUrl = Escape-JsSingleQuoted -Value $frontendLogin
  $safeProfileUrl = Escape-JsSingleQuoted -Value $frontendProfile

  & npx --yes --package @playwright/cli playwright-cli -s=$session open $frontendLogin | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "[online.ui] failed to open browser session" }

  $script = "async (page) => { await page.goto('$safeLoginUrl'); await page.getByRole('textbox', { name: '电子邮箱' }).fill('$safeEmail'); await page.getByRole('textbox', { name: '密码' }).fill('$safePassword'); await page.getByRole('button', { name: '登录' }).click(); await page.waitForURL('**/dashboard', { timeout: 20000 }); await page.goto('$safeProfileUrl'); await page.waitForSelector('text=$safeEmail', { timeout: 20000 }); }"
  & npx --yes --package @playwright/cli playwright-cli -s=$session run-code $script | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "[online.ui] login smoke failed" }

  & npx --yes --package @playwright/cli playwright-cli -s=$session close | Out-Null
}

Write-Host "[online] All online smoke checks passed."

