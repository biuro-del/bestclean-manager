param(
  [Parameter(Mandatory = $true)]
  [string]$ZipPath,

  [string]$SnapshotPath = "state-snapshots/2026-03-04_bestclean-data-snapshot.clean.json",

  [string]$ReportPath = "",

  [switch]$NoFileOutput,

  [int]$ExpectedTotalFiles = 49,
  [int]$ExpectedMappedFiles = 47,
  [int]$ExpectedSkippedFiles = 2
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

function Convert-ExcelSerialToDate {
  param([string]$Raw)
  $text = [string]$Raw
  if ([string]::IsNullOrWhiteSpace($text)) {
    return ""
  }

  $number = 0.0
  if (-not [double]::TryParse($text, [Globalization.NumberStyles]::Any, [Globalization.CultureInfo]::InvariantCulture, [ref]$number)) {
    return ""
  }

  try {
    return [DateTime]::FromOADate($number).ToString("yyyy-MM-dd")
  } catch {
    return ""
  }
}

function Get-ZipEntryText {
  param(
    [System.IO.Compression.ZipArchive]$Archive,
    [string]$EntryName
  )

  $entry = $Archive.GetEntry($EntryName)
  if (-not $entry) {
    return $null
  }

  $stream = $entry.Open()
  try {
    $reader = New-Object System.IO.StreamReader($stream)
    try {
      return $reader.ReadToEnd()
    } finally {
      $reader.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

function Read-WorkbookRowMap {
  param(
    [System.IO.Compression.ZipArchive]$WorkbookArchive,
    [int]$RowNumber
  )

  $shared = @()
  $sharedText = Get-ZipEntryText -Archive $WorkbookArchive -EntryName "xl/sharedStrings.xml"
  if ($sharedText) {
    [xml]$sharedXml = $sharedText
    $nsmShared = New-Object System.Xml.XmlNamespaceManager($sharedXml.NameTable)
    $nsmShared.AddNamespace("x", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
    foreach ($si in $sharedXml.SelectNodes("//x:si", $nsmShared)) {
      $parts = @()
      foreach ($t in $si.SelectNodes(".//x:t", $nsmShared)) {
        $parts += [string]$t.InnerText
      }
      $shared += ($parts -join "")
    }
  }

  [xml]$workbookXml = Get-ZipEntryText -Archive $WorkbookArchive -EntryName "xl/workbook.xml"
  [xml]$relsXml = Get-ZipEntryText -Archive $WorkbookArchive -EntryName "xl/_rels/workbook.xml.rels"

  $nsmWorkbook = New-Object System.Xml.XmlNamespaceManager($workbookXml.NameTable)
  $nsmWorkbook.AddNamespace("x", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
  $sheetNode = $workbookXml.SelectSingleNode("//x:sheets/x:sheet[1]", $nsmWorkbook)
  if (-not $sheetNode) {
    return @{}
  }

  $nsmRel = New-Object System.Xml.XmlNamespaceManager($relsXml.NameTable)
  $nsmRel.AddNamespace("r", "http://schemas.openxmlformats.org/package/2006/relationships")
  $relId = $sheetNode.GetAttribute("id", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")
  $relNode = $relsXml.SelectSingleNode("//r:Relationship[@Id='$relId']", $nsmRel)
  if (-not $relNode) {
    return @{}
  }

  $target = [string]$relNode.Target
  if ($target.StartsWith("/")) {
    $sheetPath = $target.TrimStart("/")
  } elseif ($target.StartsWith("xl/")) {
    $sheetPath = $target
  } else {
    $sheetPath = "xl/$target"
  }

  [xml]$sheetXml = Get-ZipEntryText -Archive $WorkbookArchive -EntryName $sheetPath
  $nsmSheet = New-Object System.Xml.XmlNamespaceManager($sheetXml.NameTable)
  $nsmSheet.AddNamespace("x", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")

  $row = $sheetXml.SelectSingleNode("//x:sheetData/x:row[@r='$RowNumber']", $nsmSheet)
  $map = @{}
  if (-not $row) {
    return $map
  }

  foreach ($cell in $row.SelectNodes("x:c", $nsmSheet)) {
    $ref = [string]$cell.GetAttribute("r")
    if ($ref -notmatch "^([A-Z]+)(\d+)$") {
      continue
    }

    $column = $matches[1]
    $type = [string]$cell.GetAttribute("t")
    $valueNode = $cell.SelectSingleNode("x:v", $nsmSheet)
    $value = if ($valueNode) { [string]$valueNode.InnerText } else { "" }

    if ($type -eq "s" -and $value -match "^\d+$") {
      $index = [int]$value
      if ($index -ge 0 -and $index -lt $shared.Count) {
        $value = [string]$shared[$index]
      }
    } elseif ($type -eq "inlineStr") {
      $textNode = $cell.SelectSingleNode(".//x:t", $nsmSheet)
      $value = if ($textNode) { [string]$textNode.InnerText } else { "" }
    }

    if (-not [string]::IsNullOrWhiteSpace($value)) {
      $map[$column] = $value.Trim()
    }
  }

  return $map
}

function Read-XlsxStartStopData {
  param([System.IO.Compression.ZipArchiveEntry]$XlsxEntry)

  $memory = New-Object System.IO.MemoryStream
  $entryStream = $XlsxEntry.Open()
  try {
    $entryStream.CopyTo($memory)
  } finally {
    $entryStream.Dispose()
  }
  $memory.Position = 0

  $innerZip = New-Object System.IO.Compression.ZipArchive($memory, [System.IO.Compression.ZipArchiveMode]::Read, $false)
  try {
    $row1 = Read-WorkbookRowMap -WorkbookArchive $innerZip -RowNumber 1
    $row12 = Read-WorkbookRowMap -WorkbookArchive $innerZip -RowNumber 12

    $dayEntries = New-Object System.Collections.Generic.List[object]
    $nonParsable = New-Object System.Collections.Generic.List[object]

    $nonEmptyCells = 0
    $parsedCells = 0
    $pattern = [regex]"Start\s*-\s*Stop:\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})"

    foreach ($column in $row12.Keys) {
      if ($column -eq "A") {
        continue
      }

      $cellText = [string]$row12[$column]
      if ([string]::IsNullOrWhiteSpace($cellText)) {
        continue
      }

      $nonEmptyCells += 1
      $match = $pattern.Match($cellText)
      if (-not $match.Success) {
        $nonParsable.Add([PSCustomObject]@{
            column = $column
            rawText = $cellText
          })
        continue
      }

      $dateIso = ""
      if ($row1.ContainsKey($column)) {
        $dateIso = Convert-ExcelSerialToDate -Raw ([string]$row1[$column])
      }

      $parsedCells += 1
      $dayEntries.Add([PSCustomObject]@{
          column = $column
          date = $dateIso
          start = $match.Groups[1].Value
          stop = $match.Groups[2].Value
          rawText = $cellText
        })
    }

    return [PSCustomObject]@{
      nonEmptyCells = $nonEmptyCells
      parsedCells = $parsedCells
      dayEntries = $dayEntries
      nonParsableCells = $nonParsable
    }
  } finally {
    $innerZip.Dispose()
    $memory.Dispose()
  }
}

function Resolve-WorkerId {
  param(
    [string]$Surname,
    [string]$FirstName,
    [hashtable]$LoginToWorkerId,
    [hashtable]$SpecialRules
  )

  $specialKey = "{0}_{1}" -f (Normalize-Key $Surname), (Normalize-Key $FirstName)
  if ($SpecialRules.ContainsKey($specialKey)) {
    return [PSCustomObject]@{
      workerId = [string]$SpecialRules[$specialKey]
      source = "special_rule"
    }
  }

  $loginKey = Normalize-Key $Surname
  if ($LoginToWorkerId.ContainsKey($loginKey)) {
    return [PSCustomObject]@{
      workerId = [string]$LoginToWorkerId[$loginKey]
      source = "login_dictionary"
    }
  }

  return $null
}

if (-not (Test-Path -LiteralPath $ZipPath)) {
  throw "ZIP not found: $ZipPath"
}
if (-not (Test-Path -LiteralPath $SnapshotPath)) {
  throw "Snapshot not found: $SnapshotPath"
}

$snapshotRaw = Get-Content -LiteralPath $SnapshotPath -Raw -Encoding UTF8
$snapshot = $snapshotRaw | ConvertFrom-Json
$workers = @($snapshot.result.data.workers)
if ($workers.Count -eq 0) {
  throw "No workers in snapshot: $SnapshotPath"
}

$loginToWorkerId = @{}
foreach ($worker in $workers) {
  $loginKey = Normalize-Key ([string]$worker.login)
  $workerId = [string]$worker.workerId
  if ($loginKey -and $workerId) {
    $loginToWorkerId[$loginKey] = $workerId
  }
}

$specialRules = @{
  "kustos_szymon"   = "W003"
  "wozniak_mariola" = "W025"
  "wozniak_dagmara" = "W050"
}

$skipFormer = @{
  "rosner_justyna"     = $true
  "sokolowska_nikola"  = $true
}

$mappedFiles = New-Object System.Collections.Generic.List[object]
$skippedFiles = New-Object System.Collections.Generic.List[object]
$unmatchedFiles = New-Object System.Collections.Generic.List[object]
$warnings = New-Object System.Collections.Generic.List[object]

$outerZip = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
try {
  $xlsxEntries = @($outerZip.Entries | Where-Object { $_.FullName -like "*.xlsx" } | Sort-Object FullName)
  foreach ($entry in $xlsxEntries) {
    $fileName = [System.IO.Path]::GetFileName($entry.FullName)
    $match = [regex]::Match($fileName, "^Raport_szczegolowy-\d{2}\.\d{2}\.\d{4}-\d{2}\.\d{2}\.\d{4}-(?<person>.+)\.xlsx$")
    if (-not $match.Success) {
      $unmatchedFiles.Add([PSCustomObject]@{
          fileName = $fileName
          reason = "invalid_file_name_format"
        })
      continue
    }

    $personToken = [string]$match.Groups["person"].Value
    $parts = $personToken -split "_"
    $surname = if ($parts.Count -ge 1) { [string]$parts[0] } else { "" }
    $firstName = if ($parts.Count -ge 2) { [string]$parts[1] } else { "" }
    $formerKey = "{0}_{1}" -f (Normalize-Key $surname), (Normalize-Key $firstName)

    if ($skipFormer.ContainsKey($formerKey)) {
      $skippedFiles.Add([PSCustomObject]@{
          fileName = $fileName
          surname = $surname
          firstName = $firstName
          reason = "former_worker"
        })
      continue
    }

    $resolved = Resolve-WorkerId -Surname $surname -FirstName $firstName -LoginToWorkerId $loginToWorkerId -SpecialRules $specialRules
    if (-not $resolved) {
      $unmatchedFiles.Add([PSCustomObject]@{
          fileName = $fileName
          surname = $surname
          firstName = $firstName
          reason = "no_worker_mapping"
        })
      continue
    }

    $xlsxData = Read-XlsxStartStopData -XlsxEntry $entry
    foreach ($badCell in $xlsxData.nonParsableCells) {
      $warnings.Add([PSCustomObject]@{
          fileName = $fileName
          type = "row12_non_parsable_cell"
          column = $badCell.column
          rawText = $badCell.rawText
        })
    }

    $mappedFiles.Add([PSCustomObject]@{
        fileName = $fileName
        surname = $surname
        firstName = $firstName
        person = ("{0} {1}" -f $surname, $firstName).Trim()
        workerId = $resolved.workerId
        mappingSource = $resolved.source
        row12NonEmptyCells = $xlsxData.nonEmptyCells
        parsedStartStopCells = $xlsxData.parsedCells
        dayEntries = $xlsxData.dayEntries
      })
  }
} finally {
  $outerZip.Dispose()
}

$wozniakRows = @($mappedFiles | Where-Object { (Normalize-Key $_.surname) -eq "wozniak" })
$wozniakIds = @($wozniakRows | Select-Object -ExpandProperty workerId -Unique)
$wozniakSeparated = ($wozniakIds -contains "W025") -and ($wozniakIds -contains "W050")

$summary = [PSCustomObject]@{
  totalFiles = $mappedFiles.Count + $skippedFiles.Count + $unmatchedFiles.Count
  mappedFiles = $mappedFiles.Count
  skippedFormerFiles = $skippedFiles.Count
  unmatchedFiles = $unmatchedFiles.Count
  totalDayEntriesMapped = (@($mappedFiles | ForEach-Object { $_.dayEntries.Count } | Measure-Object -Sum).Sum)
}

$validation = [PSCustomObject]@{
  expectedTotalFiles = $ExpectedTotalFiles
  expectedMappedFiles = $ExpectedMappedFiles
  expectedSkippedFiles = $ExpectedSkippedFiles
  totalFilesOk = ($summary.totalFiles -eq $ExpectedTotalFiles)
  mappedFilesOk = ($summary.mappedFiles -eq $ExpectedMappedFiles)
  skippedFilesOk = ($summary.skippedFormerFiles -eq $ExpectedSkippedFiles)
  wozniakSeparated = $wozniakSeparated
  wozniakIds = $wozniakIds
}

$report = [PSCustomObject]@{
  generatedAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
  zipPath = (Resolve-Path -LiteralPath $ZipPath).Path
  snapshotPath = (Resolve-Path -LiteralPath $SnapshotPath).Path
  assumptions = [PSCustomObject]@{
    emptyRow12CellMeansNoWorkRecord = $true
    formerWorkersAreSkipped = @("Rosner_Justyna", "Sokolowska_Nikola")
  }
  mappingRules = [PSCustomObject]@{
    filenamePattern = "Raport_szczegolowy-...-Nazwisko_Imie.xlsx"
    specialRules = $specialRules
  }
  summary = $summary
  validation = $validation
  mappedFiles = $mappedFiles
  skippedFiles = $skippedFiles
  unmatchedFiles = $unmatchedFiles
  warnings = $warnings
}

Write-Host ("Total files: {0}" -f $summary.totalFiles)
Write-Host ("Mapped: {0}" -f $summary.mappedFiles)
Write-Host ("Skipped former: {0}" -f $summary.skippedFormerFiles)
Write-Host ("Unmatched: {0}" -f $summary.unmatchedFiles)
Write-Host ("Wozniak split check (W025 + W050): {0}" -f $validation.wozniakSeparated)

if (-not $NoFileOutput) {
  $targetPath = $ReportPath
  if (-not $targetPath) {
    $stamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
    $targetPath = "reports/worker-mapping-report-$stamp.json"
  }

  $targetDir = Split-Path -Parent $targetPath
  if ($targetDir) {
    [void](New-Item -ItemType Directory -Path $targetDir -Force)
  }

  $json = $report | ConvertTo-Json -Depth 100
  Set-Content -LiteralPath $targetPath -Value $json -Encoding UTF8
  Write-Host ("Report saved: {0}" -f (Resolve-Path -LiteralPath $targetPath).Path)
} else {
  Write-Host "No report file written (NoFileOutput switch)."
}
