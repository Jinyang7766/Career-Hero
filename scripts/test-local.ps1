param(
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

Write-Host "[local] Running repository tests..."
if (-not $SkipInstall) {
  Write-Host "[local] Ensuring frontend workspace dependencies are installed..."
  npm install --workspace ai-resume-builder | Out-Null
}

npm test

if ($LASTEXITCODE -ne 0) {
  throw "[local] Tests failed with exit code $LASTEXITCODE"
}

Write-Host "[local] All local tests passed."

