param(
  [Parameter(Mandatory = $true)]
  [string]$ZipPath,

  [string]$Month = "2026-01",
  [string]$DateFrom = "",
  [string]$DateTo = "",
  [string]$OrgId = "bestclean",

  [string]$ProjectId = "iclean-room",
  [string]$ServiceId = "iclean-room-service",
  [string]$Location = "europe-west3",

  [switch]$Apply,
  [string]$ReportPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Remove-Diacritics {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) {
    return ""
  }

  $normalized = $Value.Normalize([Text.NormalizationForm]::FormD)
  $builder = New-Object System.Text.StringBuilder
  foreach ($char in $normalized.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($char) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$builder.Append($char)
    }
  }

  return $builder.ToString().Normalize([Text.NormalizationForm]::FormC)
}

function Normalize-Key {
  param([string]$Value)
  $raw = Remove-Diacritics ([string]$Value).Trim().ToLowerInvariant()
  if (-not $raw) {
    return ""
  }
  return [Regex]::Replace($raw, "[^a-z0-9-]+", "")
}

function Get-PersonToken {
  param([string]$FileName)
  $match = [regex]::Match($FileName, "^Raport_szczegolowy-\d{2}\.\d{2}\.\d{4}-\d{2}\.\d{2}\.\d{4}-(?<person>.+)\.xlsx$")
  if (-not $match.Success) {
    return $null
  }
  return [string]$match.Groups["person"].Value
}

function Write-Utf8NoBom {
  param(
    [string]$Path,
    [string]$Value
  )
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Value, $encoding)
}

if (-not (Test-Path -LiteralPath $ZipPath)) {
  throw "ZIP not found: $ZipPath"
}

$repairScript = Join-Path $PSScriptRoot "repair-worker-month-from-xlsx.ps1"
if (-not (Test-Path -LiteralPath $repairScript)) {
  throw "Required script not found: $repairScript"
}

$skipFormer = @{
  "rosner_justyna"    = $true
  "sokolowska_nikola" = $true
}

$stamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$batchBaseDir = Join-Path (Split-Path -Parent $PSScriptRoot) ("reports\repair-zip-$Month-$stamp")
[void](New-Item -ItemType Directory -Path $batchBaseDir -Force)

$tempDir = Join-Path (Split-Path -Parent $PSScriptRoot) (".tmp-ref\zip-import-$stamp")
[void](New-Item -ItemType Directory -Path $tempDir -Force)

$results = New-Object System.Collections.Generic.List[object]
$successes = New-Object System.Collections.Generic.List[object]
$skipped = New-Object System.Collections.Generic.List[object]
$errors = New-Object System.Collections.Generic.List[object]
$unmatched = New-Object System.Collections.Generic.List[object]

$zip = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
try {
  $xlsxEntries = @($zip.Entries | Where-Object { $_.FullName -like "*.xlsx" } | Sort-Object FullName)
  foreach ($entry in $xlsxEntries) {
    $fileName = [System.IO.Path]::GetFileName($entry.FullName)
    $personToken = Get-PersonToken -FileName $fileName
    if (-not $personToken) {
      $row = [PSCustomObject]@{
        fileName = $fileName
        status = "unmatched"
        reason = "invalid_file_name_format"
      }
      $results.Add($row)
      $unmatched.Add($row)
      continue
    }

    $parts = $personToken -split "_"
    $surname = if ($parts.Count -ge 1) { [string]$parts[0] } else { "" }
    $firstName = if ($parts.Count -ge 2) { [string]$parts[1] } else { "" }
    $personKey = ("{0}_{1}" -f (Normalize-Key $surname), (Normalize-Key $firstName))

    if ($skipFormer.ContainsKey($personKey)) {
      $row = [PSCustomObject]@{
        fileName = $fileName
        person = ("{0} {1}" -f $firstName, $surname).Trim()
        status = "skipped"
        reason = "former_worker"
      }
      $results.Add($row)
      $skipped.Add($row)
      continue
    }

    $tempXlsx = Join-Path $tempDir $fileName
    $sourceStream = $entry.Open()
    try {
      $targetStream = [System.IO.File]::Open($tempXlsx, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
      try {
        $sourceStream.CopyTo($targetStream)
      } finally {
        $targetStream.Dispose()
      }
    } finally {
      $sourceStream.Dispose()
    }

    $workerToken = ("{0}_{1}" -f (Normalize-Key $surname), (Normalize-Key $firstName)).Trim("_")
    if (-not $workerToken) {
      $workerToken = [Guid]::NewGuid().ToString("N")
    }
    $workerReportPath = Join-Path $batchBaseDir ("worker-{0}.json" -f $workerToken)

    try {
      $invokeArgs = @{
        XlsxPath = $tempXlsx
        Month = $Month
        OrgId = $OrgId
        ProjectId = $ProjectId
        ServiceId = $ServiceId
        Location = $Location
        ReportPath = $workerReportPath
      }

      if ($DateFrom) {
        $invokeArgs.DateFrom = $DateFrom
      }
      if ($DateTo) {
        $invokeArgs.DateTo = $DateTo
      }

      if ($Apply) {
        $invokeArgs.Apply = $true
      }

      & $repairScript @invokeArgs

      $workerReport = (Get-Content -Raw -LiteralPath $workerReportPath | ConvertFrom-Json)
      $row = [PSCustomObject]@{
        fileName = $fileName
        person = ("{0} {1}" -f $firstName, $surname).Trim()
        status = "ok"
        workerLogin = [string]$workerReport.worker.login
        workerId = [string]$workerReport.worker.workerId
        beforeRows = [int]$workerReport.before.monthWorkdayRows
        beforeTotal = [string]$workerReport.before.monthDurationHhMm
        afterRows = [int]$workerReport.after.monthWorkdayRows
        afterTotal = [string]$workerReport.after.monthDurationHhMm
        reportPath = (Resolve-Path -LiteralPath $workerReportPath).Path
      }
      $results.Add($row)
      $successes.Add($row)
    } catch {
      $row = [PSCustomObject]@{
        fileName = $fileName
        person = ("{0} {1}" -f $firstName, $surname).Trim()
        status = "error"
        error = $_.Exception.Message
      }
      $results.Add($row)
      $errors.Add($row)
    } finally {
      if (Test-Path -LiteralPath $tempXlsx) {
        Remove-Item -LiteralPath $tempXlsx -Force -ErrorAction SilentlyContinue
      }
    }
  }
} finally {
  $zip.Dispose()
}

$summary = [PSCustomObject]@{
  generatedAt = (Get-Date).ToString("o")
  mode = if ($Apply) { "apply" } else { "dry_run" }
  zipPath = (Resolve-Path -LiteralPath $ZipPath).Path
  month = $Month
  dateFrom = if ($DateFrom) { $DateFrom } else { "" }
  dateTo = if ($DateTo) { $DateTo } else { "" }
  totalXlsx = $results.Count
  successful = $successes.Count
  skippedFormer = $skipped.Count
  unmatched = $unmatched.Count
  errors = $errors.Count
}

$finalReport = [PSCustomObject]@{
  summary = $summary
  successful = $successes
  skipped = $skipped
  unmatched = $unmatched
  errors = $errors
  allResults = $results
}

$targetReportPath = $ReportPath
if (-not $targetReportPath) {
  $targetReportPath = Join-Path $batchBaseDir "batch-report.json"
}

$targetDir = Split-Path -Parent $targetReportPath
if ($targetDir) {
  [void](New-Item -ItemType Directory -Path $targetDir -Force)
}

Write-Utf8NoBom -Path $targetReportPath -Value ($finalReport | ConvertTo-Json -Depth 100)

Write-Host ("Mode: {0}" -f $summary.mode)
Write-Host ("Month: {0}" -f $summary.month)
if ($summary.dateFrom -or $summary.dateTo) {
  $scopeFromLabel = if ($summary.dateFrom) { [string]$summary.dateFrom } else { "<month-start>" }
  $scopeToLabel = if ($summary.dateTo) { [string]$summary.dateTo } else { "<month-end>" }
  Write-Host ("Scope: {0} - {1}" -f $scopeFromLabel, $scopeToLabel)
}
Write-Host ("Total XLSX: {0}" -f $summary.totalXlsx)
Write-Host ("Successful: {0}" -f $summary.successful)
Write-Host ("Skipped former: {0}" -f $summary.skippedFormer)
Write-Host ("Unmatched: {0}" -f $summary.unmatched)
Write-Host ("Errors: {0}" -f $summary.errors)
Write-Host ("Batch report: {0}" -f (Resolve-Path -LiteralPath $targetReportPath).Path)

if ($errors.Count -gt 0) {
  throw ("Batch finished with {0} error(s). See report: {1}" -f $errors.Count, (Resolve-Path -LiteralPath $targetReportPath).Path)
}
