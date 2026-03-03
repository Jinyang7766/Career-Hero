param(
  [string]$WorklogPath = "WORKLOG.md",
  [string]$ArchiveDir = "logs/worklog",
  [string]$IndexPath = "WORKLOG_INDEX.md",
  [string]$StatePath = "logs/worklog/.archive-state.json",
  [switch]$DisableDailyBoundary,
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$headingPattern = '^## \[(\d{4}-\d{2}-\d{2}) \d{2}:\d{2}\]'
$culture = [System.Globalization.CultureInfo]::InvariantCulture
$checkDailyBoundary = -not $DisableDailyBoundary.IsPresent
$forceRun = $Force.IsPresent

function Get-WorklogEntryCount {
  param(
    [string]$Path,
    [string]$Pattern
  )

  if (-not (Test-Path $Path)) {
    return 0
  }

  $count = 0
  $lines = Get-Content -Path $Path -Encoding UTF8
  foreach ($line in $lines) {
    if ($line -match $Pattern) {
      $count++
    }
  }

  return $count
}

function Update-WorklogIndex {
  param(
    [string]$WorklogPath,
    [string]$ArchiveDir,
    [string]$IndexPath,
    [string]$HeadingPattern,
    [bool]$CheckDailyBoundary,
    [string]$LastArchiveDate,
    [bool]$Force
  )

  if (Test-Path $ArchiveDir) {
    $archiveFiles = Get-ChildItem -Path $ArchiveDir -File -Filter "WORKLOG-*.md" | Sort-Object Name
  }
  else {
    $archiveFiles = @()
  }

  $activeEntryCount = Get-WorklogEntryCount -Path $WorklogPath -Pattern $HeadingPattern

  $indexLines = @(
    "# WORKLOG Index",
    "",
    "Updated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
    "",
    "## Active Window",
    "",
    "- Source: $WorklogPath",
    "- Entries currently in root: $activeEntryCount"
  )

  if ($CheckDailyBoundary) {
    $indexLines += "- Rule: archive entries dated before local today, run once after midnight"
  }
  else {
    $indexLines += "- Rule: archive entries dated before local today"
  }

  if ($Force) {
    $indexLines += "- Last run mode: forced"
  }

  if (-not [string]::IsNullOrWhiteSpace($LastArchiveDate)) {
    $indexLines += "- Last daily archive date: $LastArchiveDate"
  }

  $indexLines += ""
  $indexLines += "## Monthly Archives"
  $indexLines += ""

  if ($archiveFiles.Count -eq 0) {
    $indexLines += "- (none)"
  }
  else {
    $repoRoot = (Get-Location).Path
    foreach ($file in $archiveFiles) {
      $entryCount = Get-WorklogEntryCount -Path $file.FullName -Pattern $HeadingPattern
      $relativePath = $file.FullName.Substring($repoRoot.Length + 1).Replace('\', '/')
      $indexLines += "- $($file.BaseName.Replace('WORKLOG-','')): $entryCount entries -> $relativePath"
    }
  }

  Set-Content -Path $IndexPath -Value $indexLines -Encoding UTF8
}

function Load-ArchiveState {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    return $null
  }

  try {
    $raw = Get-Content -Path $Path -Raw -Encoding UTF8
    if ([string]::IsNullOrWhiteSpace($raw)) {
      return $null
    }
    return ($raw | ConvertFrom-Json)
  }
  catch {
    Write-Warning "Failed to parse archive state file: $Path"
    return $null
  }
}

function Save-ArchiveState {
  param(
    [string]$Path,
    [string]$Today,
    [int]$ArchivedCount,
    [bool]$Forced
  )

  $stateDir = Split-Path -Path $Path -Parent
  if (-not [string]::IsNullOrWhiteSpace($stateDir)) {
    New-Item -Path $stateDir -ItemType Directory -Force | Out-Null
  }

  $payload = [ordered]@{
    last_archive_date = $Today
    last_run_at = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssK")
    archived_entries = $ArchivedCount
    forced = $Forced
  }

  $json = $payload | ConvertTo-Json -Depth 4
  Set-Content -Path $Path -Value $json -Encoding UTF8
}

if (-not (Test-Path $WorklogPath)) {
  throw "worklog file not found: $WorklogPath"
}

$today = (Get-Date).Date
$todayString = $today.ToString("yyyy-MM-dd", $culture)
$state = Load-ArchiveState -Path $StatePath
$lastArchiveDateString = ""
$alreadyProcessedToday = $false

if ($null -ne $state -and $state.PSObject.Properties.Name -contains 'last_archive_date') {
  $lastArchiveDateString = [string]$state.last_archive_date
  $parsedLastDate = [DateTime]::MinValue
  $canParse = [DateTime]::TryParseExact(
    $lastArchiveDateString,
    "yyyy-MM-dd",
    $culture,
    [System.Globalization.DateTimeStyles]::None,
    [ref]$parsedLastDate
  )

  if ($canParse -and $parsedLastDate.Date -ge $today) {
    $alreadyProcessedToday = $true
  }
}

if ($checkDailyBoundary -and (-not $forceRun) -and $alreadyProcessedToday) {
  Save-ArchiveState `
    -Path $StatePath `
    -Today $todayString `
    -ArchivedCount 0 `
    -Forced $false

  $lastArchiveDateString = $todayString

  Update-WorklogIndex `
    -WorklogPath $WorklogPath `
    -ArchiveDir $ArchiveDir `
    -IndexPath $IndexPath `
    -HeadingPattern $headingPattern `
    -CheckDailyBoundary $checkDailyBoundary `
    -LastArchiveDate $lastArchiveDateString `
    -Force $forceRun

  Write-Output "Skip archive: daily boundary already processed for $todayString"
  Write-Output "Index updated: $IndexPath"
  return
}

$allLines = Get-Content -Path $WorklogPath -Encoding UTF8

$firstEntryIndex = -1
for ($i = 0; $i -lt $allLines.Count; $i++) {
  if ($allLines[$i] -match $headingPattern) {
    $firstEntryIndex = $i
    break
  }
}

if ($firstEntryIndex -lt 0) {
  throw "no worklog entries found with heading pattern: $headingPattern"
}

$prefixLines = @()
if ($firstEntryIndex -gt 0) {
  $prefixLines = $allLines[0..($firstEntryIndex - 1)]
}

$entryStartIndexes = @()
for ($i = $firstEntryIndex; $i -lt $allLines.Count; $i++) {
  if ($allLines[$i] -match $headingPattern) {
    $entryStartIndexes += $i
  }
}

$entries = @()
for ($j = 0; $j -lt $entryStartIndexes.Count; $j++) {
  $start = $entryStartIndexes[$j]
  $end = $allLines.Count - 1
  if ($j -lt $entryStartIndexes.Count - 1) {
    $end = $entryStartIndexes[$j + 1] - 1
  }

  $block = @()
  if ($start -le $end) {
    $block = $allLines[$start..$end]
  }

  if ($block.Count -eq 0) {
    continue
  }

  if ($block[0] -notmatch $headingPattern) {
    continue
  }

  $entryDateText = [string]$Matches[1]
  $entryDate = [DateTime]::ParseExact($entryDateText, "yyyy-MM-dd", $culture)

  $entries += [PSCustomObject]@{
    Heading = $block[0]
    Date = $entryDate.Date
    DateText = $entryDateText
    Month = $entryDateText.Substring(0, 7)
    Lines = $block
  }
}

$entriesToArchive = @($entries | Where-Object { $_.Date -lt $today })
$entriesToKeep = @($entries | Where-Object { $_.Date -ge $today })
$archivedCount = $entriesToArchive.Count

if ($archivedCount -gt 0) {
  New-Item -Path $ArchiveDir -ItemType Directory -Force | Out-Null

  $archiveGroups = $entriesToArchive | Group-Object -Property Month
  foreach ($group in $archiveGroups) {
    $month = $group.Name
    $monthPath = Join-Path $ArchiveDir "WORKLOG-$month.md"
    $existingHeadings = @{}

    if (Test-Path $monthPath) {
      $existingLines = Get-Content -Path $monthPath -Encoding UTF8
      foreach ($line in $existingLines) {
        if ($line -match $headingPattern) {
          $existingHeadings[$line] = $true
        }
      }
    }
    else {
      $monthHeader = @(
        "# WORKLOG Archive $month",
        "",
        "Source: $WorklogPath",
        "",
        "---",
        ""
      )
      Set-Content -Path $monthPath -Value $monthHeader -Encoding UTF8
    }

    $appendLines = @()
    foreach ($entry in $group.Group) {
      if (-not $existingHeadings.ContainsKey($entry.Heading)) {
        $appendLines += $entry.Lines
        $appendLines += ""
      }
    }

    if ($appendLines.Count -gt 0) {
      Add-Content -Path $monthPath -Value $appendLines -Encoding UTF8
    }
  }

  $newWorklogLines = @()
  $newWorklogLines += $prefixLines

  if ($newWorklogLines.Count -gt 0 -and $newWorklogLines[$newWorklogLines.Count - 1] -ne "") {
    $newWorklogLines += ""
  }

  foreach ($entry in $entriesToKeep) {
    $newWorklogLines += $entry.Lines
  }

  Set-Content -Path $WorklogPath -Value $newWorklogLines -Encoding UTF8
  Write-Output "Archived $archivedCount entries dated before $todayString"
}
else {
  Write-Output "No entries dated before $todayString. Nothing archived"
}

if ($checkDailyBoundary) {
  Save-ArchiveState `
    -Path $StatePath `
    -Today $todayString `
    -ArchivedCount $archivedCount `
    -Forced $forceRun

  $lastArchiveDateString = $todayString
}

Update-WorklogIndex `
  -WorklogPath $WorklogPath `
  -ArchiveDir $ArchiveDir `
  -IndexPath $IndexPath `
  -HeadingPattern $headingPattern `
  -CheckDailyBoundary $checkDailyBoundary `
  -LastArchiveDate $lastArchiveDateString `
  -Force $forceRun

Write-Output "Index updated: $IndexPath"
