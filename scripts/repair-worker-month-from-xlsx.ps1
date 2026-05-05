param(
  [Parameter(Mandatory = $true)]
  [string]$XlsxPath,

  [string]$OrgId = "bestclean",
  [string]$Month = "2026-01",
  [string]$DateFrom = "",
  [string]$DateTo = "",
  [string]$WorkerLogin = "",
  [string]$WorkerId = "",

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

$timeZone = [TimeZoneInfo]::FindSystemTimeZoneById("Central European Standard Time")
$culture = [System.Globalization.CultureInfo]::InvariantCulture

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
  param([string]$Path)

  $fs = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
  try {
    $zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Read, $false)
    try {
      $row1 = Read-WorkbookRowMap -WorkbookArchive $zip -RowNumber 1
      $row12 = Read-WorkbookRowMap -WorkbookArchive $zip -RowNumber 12

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
      $zip.Dispose()
    }
  } finally {
    $fs.Dispose()
  }
}

function Write-Utf8NoBom {
  param(
    [string]$Path,
    [string]$Value
  )
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Value, $encoding)
}

function Invoke-DataConnectOperation {
  param(
    [string]$Query,
    [hashtable]$Variables,
    [string]$OperationName
  )

  $tempRoot = Join-Path (Split-Path -Parent $PSScriptRoot) ".tmp-ref\dc-runtime"
  [void](New-Item -ItemType Directory -Path $tempRoot -Force)

  $tag = [Guid]::NewGuid().ToString("N")
  $queryPath = Join-Path $tempRoot ("operation-{0}.gql" -f $tag)
  $varsPath = Join-Path $tempRoot ("operation-{0}.vars.json" -f $tag)

  try {
    Write-Utf8NoBom -Path $queryPath -Value $Query
    Write-Utf8NoBom -Path $varsPath -Value (($Variables | ConvertTo-Json -Compress -Depth 25))

    $raw = & firebase.cmd --json dataconnect:execute `
      --project $ProjectId `
      --service $ServiceId `
      --location $Location `
      --vars ("@{0}" -f $varsPath) `
      $queryPath `
      $OperationName

    if ($LASTEXITCODE -ne 0) {
      $rawText = ($raw -join "`n")
      throw ("dataconnect:execute failed for {0}. Raw: {1}" -f $OperationName, $rawText)
    }

    $rawText = ($raw -join "`n")
    $parsed = $rawText | ConvertFrom-Json
    if ($parsed.status -ne "success") {
      $errorText = [string]$parsed.error
      throw ("dataconnect operation {0} failed: {1}" -f $OperationName, $errorText)
    }

    if ($null -eq $parsed.result -or $null -eq $parsed.result.data) {
      throw ("No result.data in dataconnect response for {0}." -f $OperationName)
    }

    return $parsed.result.data
  } finally {
    if (Test-Path -LiteralPath $queryPath) {
      Remove-Item -LiteralPath $queryPath -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path -LiteralPath $varsPath) {
      Remove-Item -LiteralPath $varsPath -Force -ErrorAction SilentlyContinue
    }
  }
}

function To-UnspecifiedLocalDateTime {
  param(
    [string]$DateIso,
    [string]$TimeHm
  )

  $date = [datetime]::ParseExact($DateIso, "yyyy-MM-dd", $culture)
  $parts = ([string]$TimeHm).Trim() -split ":"
  if ($parts.Count -ne 2) {
    throw ("Cannot parse time value: {0}" -f $TimeHm)
  }

  $hour = 0
  $minute = 0
  if (-not [int]::TryParse($parts[0], [ref]$hour)) {
    throw ("Cannot parse hour value: {0}" -f $TimeHm)
  }
  if (-not [int]::TryParse($parts[1], [ref]$minute)) {
    throw ("Cannot parse minute value: {0}" -f $TimeHm)
  }

  if ($hour -lt 0 -or $hour -gt 23 -or $minute -lt 0 -or $minute -gt 59) {
    throw ("Time out of range: {0}" -f $TimeHm)
  }

  $dt = $date.Date.AddHours($hour).AddMinutes($minute)
  return [datetime]::SpecifyKind($dt, [DateTimeKind]::Unspecified)
}

function Sql-Quote {
  param([object]$Value)
  if ($null -eq $Value) {
    return "NULL"
  }
  $text = [string]$Value
  return "'" + ($text -replace "'", "''") + "'"
}

function Invoke-ExecuteSqlLiteral {
  param([string]$Sql)

  $sqlLiteral = $Sql | ConvertTo-Json -Compress
  $mutationExecuteSql = @"
mutation ExecuteSql {
  _execute(sql: $sqlLiteral)
}
"@
  return Invoke-DataConnectOperation -Query $mutationExecuteSql -Variables @{} -OperationName "ExecuteSql"
}

function Invoke-RepairWithoutDelete {
  param(
    [object[]]$ExistingRows,
    [object[]]$TargetRows,
    [string]$OrgId,
    [string]$WorkerLogin,
    [string]$WorkerName,
    [string]$ImportTag,
    [string]$UpdatedBy
  )

  $existingByDate = @{}
  foreach ($row in @($ExistingRows)) {
    if (-not $row.workdayId -or -not $row.startAt) {
      continue
    }

    $startUtc = [DateTime]::Parse([string]$row.startAt, $culture, [System.Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
    $startLocal = [TimeZoneInfo]::ConvertTimeFromUtc($startUtc, $timeZone)
    $dateKey = $startLocal.ToString("yyyy-MM-dd")

    if (-not $existingByDate.ContainsKey($dateKey)) {
      $existingByDate[$dateKey] = New-Object System.Collections.Generic.List[object]
    }

    $existingByDate[$dateKey].Add([PSCustomObject]@{
        workdayId = [string]$row.workdayId
        startUtc = $startUtc
      })
  }

  $updatedCount = 0
  $insertedCount = 0
  $zeroedCount = 0
  $operations = New-Object System.Collections.Generic.List[object]

  $orderedTargets = @($TargetRows | Sort-Object date, start)
  foreach ($target in $orderedTargets) {
    $targetDate = [string]$target.date
    $selected = $null

    if ($existingByDate.ContainsKey($targetDate)) {
      $candidates = $existingByDate[$targetDate]
      if ($candidates.Count -gt 0) {
        $selected = $candidates[0]
        $candidates.RemoveAt(0)
      }
    }

    if ($selected) {
      $updateSql = @"
UPDATE public.workday
SET worker_login = {0},
    worker_name = {1},
    start_at = {2}::timestamptz,
    end_at = {3}::timestamptz,
    duration_sec = {4},
    status = 'CLOSED',
    comment = {5},
    updated_by = {6},
    updated_at = now()
WHERE workday_id = {7};
"@ -f `
        (Sql-Quote $WorkerLogin), `
        (Sql-Quote $WorkerName), `
        (Sql-Quote $target.startAtUtc), `
        (Sql-Quote $target.endAtUtc), `
        ([int]$target.durationSec), `
        (Sql-Quote $ImportTag), `
        (Sql-Quote $UpdatedBy), `
        (Sql-Quote $selected.workdayId)

      [void](Invoke-ExecuteSqlLiteral -Sql $updateSql)
      $updatedCount += 1
      $operations.Add([PSCustomObject]@{
          action = "update"
          sourceWorkdayId = $selected.workdayId
          targetDate = $targetDate
          targetWorkdayId = [string]$target.workdayId
        })
    } else {
      $insertSql = @"
INSERT INTO public.workday (
  org_id,
  workday_id,
  worker_login,
  worker_name,
  start_at,
  end_at,
  duration_sec,
  status,
  comment,
  updated_by,
  created_at,
  updated_at
)
VALUES (
  {0},
  {1},
  {2},
  {3},
  {4}::timestamptz,
  {5}::timestamptz,
  {6},
  'CLOSED',
  {7},
  {8},
  now(),
  now()
);
"@ -f `
        (Sql-Quote $OrgId), `
        (Sql-Quote $target.workdayId), `
        (Sql-Quote $WorkerLogin), `
        (Sql-Quote $WorkerName), `
        (Sql-Quote $target.startAtUtc), `
        (Sql-Quote $target.endAtUtc), `
        ([int]$target.durationSec), `
        (Sql-Quote $ImportTag), `
        (Sql-Quote $UpdatedBy)

      [void](Invoke-ExecuteSqlLiteral -Sql $insertSql)
      $insertedCount += 1
      $operations.Add([PSCustomObject]@{
          action = "insert"
          targetDate = $targetDate
          targetWorkdayId = [string]$target.workdayId
        })
    }
  }

  $zeroComment = "{0} ZEROED-LEGACY" -f $ImportTag
  foreach ($pair in $existingByDate.GetEnumerator()) {
    foreach ($leftover in $pair.Value) {
      $zeroSql = @"
UPDATE public.workday
SET end_at = start_at,
    duration_sec = 0,
    status = 'CLOSED',
    comment = {0},
    updated_by = {1},
    updated_at = now()
WHERE workday_id = {2};
"@ -f `
        (Sql-Quote $zeroComment), `
        (Sql-Quote $UpdatedBy), `
        (Sql-Quote $leftover.workdayId)

      [void](Invoke-ExecuteSqlLiteral -Sql $zeroSql)
      $zeroedCount += 1
      $operations.Add([PSCustomObject]@{
          action = "zero"
          sourceWorkdayId = $leftover.workdayId
          targetDate = [string]$pair.Key
        })
    }
  }

  return [PSCustomObject]@{
    mode = "fallback_without_delete"
    updatedRows = $updatedCount
    insertedRows = $insertedCount
    zeroedRows = $zeroedCount
    operations = $operations
  }
}

function Get-RowDurationSec {
  param([object]$Row)
  if ($null -ne $Row.durationSec -and [string]$Row.durationSec -ne "") {
    return [int]$Row.durationSec
  }
  if ($Row.startAt -and $Row.endAt) {
    $startUtc = [DateTime]::Parse([string]$Row.startAt, $culture, [System.Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
    $endUtc = [DateTime]::Parse([string]$Row.endAt, $culture, [System.Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
    return [int][Math]::Max(0, [Math]::Round(($endUtc - $startUtc).TotalSeconds))
  }
  return 0
}

function Format-HoursMinutes {
  param([int]$TotalSec)
  $safe = [Math]::Max($TotalSec, 0)
  $hours = [int][Math]::Floor($safe / 3600)
  $minutes = [int][Math]::Floor(($safe % 3600) / 60)
  return ("{0}:{1:d2}" -f $hours, $minutes)
}

if (-not (Test-Path -LiteralPath $XlsxPath)) {
  throw "XLSX not found: $XlsxPath"
}

$monthStartLocal = [datetime]::ParseExact(("{0}-01" -f $Month), "yyyy-MM-dd", $culture)
$monthStartLocal = [datetime]::SpecifyKind($monthStartLocal, [DateTimeKind]::Unspecified)
$monthEndLocalExclusive = [datetime]::SpecifyKind($monthStartLocal.AddMonths(1), [DateTimeKind]::Unspecified)

$scopeStartLocal = $monthStartLocal
$scopeEndLocalExclusive = $monthEndLocalExclusive

if ($DateFrom) {
  $scopeStartLocal = [datetime]::ParseExact($DateFrom, "yyyy-MM-dd", $culture)
  $scopeStartLocal = [datetime]::SpecifyKind($scopeStartLocal, [DateTimeKind]::Unspecified)
}

if ($DateTo) {
  $scopeEndLocalInclusive = [datetime]::ParseExact($DateTo, "yyyy-MM-dd", $culture)
  $scopeEndLocalInclusive = [datetime]::SpecifyKind($scopeEndLocalInclusive, [DateTimeKind]::Unspecified)
  $scopeEndLocalExclusive = $scopeEndLocalInclusive.AddDays(1)
}

if ($scopeEndLocalExclusive -le $scopeStartLocal) {
  throw "Invalid scope: end date must be after start date."
}

$scopeStartUtc = [TimeZoneInfo]::ConvertTimeToUtc($scopeStartLocal, $timeZone)
$scopeEndUtc = [TimeZoneInfo]::ConvertTimeToUtc($scopeEndLocalExclusive, $timeZone)
$scopeStartIso = $scopeStartUtc.ToString("o")
$scopeEndIso = $scopeEndUtc.ToString("o")
$scopeStartDate = $scopeStartLocal.ToString("yyyy-MM-dd")
$scopeEndDateExclusive = $scopeEndLocalExclusive.ToString("yyyy-MM-dd")

$fileName = [System.IO.Path]::GetFileName($XlsxPath)
$fileSurname = ""
$fileFirstName = ""
if ($fileName -match "^Raport_szczegolowy-\d{2}\.\d{2}\.\d{4}-\d{2}\.\d{2}\.\d{4}-(?<person>.+)\.xlsx$") {
  $personToken = [string]$matches["person"]
  $parts = $personToken -split "_"
  if ($parts.Count -ge 1) {
    $fileSurname = [string]$parts[0]
  }
  if ($parts.Count -ge 2) {
    $fileFirstName = [string]$parts[1]
  }
}

$workersQuery = @'
query WorkersForOrgNoAuth($orgId: String!) {
  workers(where: { orgId: { eq: $orgId } }, orderBy: [{ workerName: ASC }], limit: 5000) {
    login
    workerId
    workerName
    active
  }
}
'@

$workersData = Invoke-DataConnectOperation -Query $workersQuery -Variables @{ orgId = $OrgId } -OperationName "WorkersForOrgNoAuth"
$workers = @($workersData.workers)
if ($workers.Count -eq 0) {
  throw "No workers returned for org: $OrgId"
}

$selectedWorker = $null
if ($WorkerLogin) {
  $matchesLogin = @($workers | Where-Object { [string]$_.login -ieq $WorkerLogin })
  if ($matchesLogin.Count -eq 0) {
    throw "WorkerLogin not found in org workers: $WorkerLogin"
  }
  $selectedWorker = $matchesLogin[0]
} elseif ($WorkerId) {
  $matchesId = @($workers | Where-Object { [string]$_.workerId -ieq $WorkerId })
  if ($matchesId.Count -eq 0) {
    throw "WorkerId not found in org workers: $WorkerId"
  }
  $selectedWorker = $matchesId[0]
} else {
  if (-not $fileSurname) {
    throw "Cannot auto-resolve worker. Pass -WorkerLogin or -WorkerId."
  }

  $expectedName = ("{0} {1}" -f $fileFirstName, $fileSurname).Trim()
  $expectedNameKey = Normalize-Key $expectedName
  $nameMatches = @($workers | Where-Object { (Normalize-Key ([string]$_.workerName)) -eq $expectedNameKey })

  if ($nameMatches.Count -eq 1) {
    $selectedWorker = $nameMatches[0]
  } elseif ($nameMatches.Count -gt 1) {
    throw ("Multiple worker matches for name: {0}. Pass -WorkerLogin." -f $expectedName)
  } else {
    $surnameKey = Normalize-Key $fileSurname
    $loginMatches = @($workers | Where-Object { (Normalize-Key ([string]$_.login)) -eq $surnameKey })
    if ($loginMatches.Count -eq 1) {
      $selectedWorker = $loginMatches[0]
    } else {
      throw ("Could not auto-resolve worker from file token: {0}_{1}. Pass -WorkerLogin." -f $fileSurname, $fileFirstName)
    }
  }
}

$workerLoginResolved = [string]$selectedWorker.login
$workerNameResolved = [string]$selectedWorker.workerName
$workerIdResolved = [string]$selectedWorker.workerId

$xlsxData = Read-XlsxStartStopData -Path $XlsxPath

$monthDayRows = @(
  $xlsxData.dayEntries |
  Where-Object {
    $_.date -and $_.date -ge $scopeStartDate -and $_.date -lt $scopeEndDateExclusive
  } |
  Sort-Object date
)

$importRows = New-Object System.Collections.Generic.List[object]
$idCounter = @{}
foreach ($row in $monthDayRows) {
  $startLocal = To-UnspecifiedLocalDateTime -DateIso $row.date -TimeHm $row.start
  $stopLocal = To-UnspecifiedLocalDateTime -DateIso $row.date -TimeHm $row.stop
  if ($stopLocal -le $startLocal) {
    $stopLocal = $stopLocal.AddDays(1)
  }

  $startUtc = [TimeZoneInfo]::ConvertTimeToUtc($startLocal, $timeZone)
  $endUtc = [TimeZoneInfo]::ConvertTimeToUtc($stopLocal, $timeZone)
  $durationSec = [int][Math]::Round(($endUtc - $startUtc).TotalSeconds)
  if ($durationSec -lt 0) {
    throw ("Negative duration for {0} ({1}-{2})." -f $row.date, $row.start, $row.stop)
  }

  $baseId = "WD-IMPORT-{0}-{1}-{2}" -f $monthStartLocal.ToString("yyyyMM"), (Normalize-Key $workerLoginResolved).ToUpperInvariant(), ($row.date -replace "-", "")
  if ($idCounter.ContainsKey($baseId)) {
    $idCounter[$baseId] += 1
  } else {
    $idCounter[$baseId] = 1
  }
  $suffix = if ($idCounter[$baseId] -gt 1) { "-{0}" -f $idCounter[$baseId] } else { "" }
  $workdayId = $baseId + $suffix
  if ($workdayId.Length -gt 64) {
    $workdayId = $workdayId.Substring(0, 64)
  }

  $importRows.Add([PSCustomObject]@{
      date = [string]$row.date
      start = [string]$row.start
      stop = [string]$row.stop
      startAtUtc = $startUtc.ToString("o")
      endAtUtc = $endUtc.ToString("o")
      durationSec = $durationSec
      workdayId = $workdayId
    })
}

$workerWorkdaysQuery = @'
query WorkdaysByWorkerNoAuth($orgId: String!, $workerLogin: String!) {
  workdays(
    where: { orgId: { eq: $orgId }, workerLogin: { eq: $workerLogin } }
    orderBy: [{ startAt: ASC }]
    limit: 5000
  ) {
    workdayId
    workerLogin
    workerName
    startAt
    endAt
    durationSec
    status
    comment
    updatedAt
  }
}
'@

$beforeRowsData = Invoke-DataConnectOperation -Query $workerWorkdaysQuery -Variables @{
  orgId = $OrgId
  workerLogin = $workerLoginResolved
} -OperationName "WorkdaysByWorkerNoAuth"

$beforeAllRows = @($beforeRowsData.workdays)
$beforeMonthRows = New-Object System.Collections.Generic.List[object]
foreach ($row in $beforeAllRows) {
  if (-not $row.startAt) {
    continue
  }
  $startUtc = [DateTime]::Parse([string]$row.startAt, $culture, [System.Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
  if ($startUtc -ge $scopeStartUtc -and $startUtc -lt $scopeEndUtc) {
    $beforeMonthRows.Add($row)
  }
}

$beforeTotalSec = 0
foreach ($row in $beforeMonthRows) {
  $beforeTotalSec += (Get-RowDurationSec -Row $row)
}

$plannedTotalSec = 0
foreach ($row in $importRows) {
  $plannedTotalSec += [int]$row.durationSec
}

$deleteWhere = "org_id = {0} AND worker_login = {1} AND start_at >= {2}::timestamptz AND start_at < {3}::timestamptz" -f `
  (Sql-Quote $OrgId), `
  (Sql-Quote $workerLoginResolved), `
  (Sql-Quote $scopeStartIso), `
  (Sql-Quote $scopeEndIso)

$sql = ""
if ($importRows.Count -gt 0) {
  $valueLines = @()
  foreach ($row in $importRows) {
    $valueLines += ("({0}, {1}, {2}, {3}, {4}::timestamptz, {5}::timestamptz, {6}, 'CLOSED', {7}, {8}, now(), now())" -f `
        (Sql-Quote $OrgId), `
        (Sql-Quote $row.workdayId), `
        (Sql-Quote $workerLoginResolved), `
        (Sql-Quote $workerNameResolved), `
        (Sql-Quote $row.startAtUtc), `
        (Sql-Quote $row.endAtUtc), `
        ([int]$row.durationSec), `
        (Sql-Quote "IMPORT XLSX $Month"), `
        (Sql-Quote "script:repair-worker-month-from-xlsx"))
  }

  $sql = @"
WITH deleted_rows AS (
  DELETE FROM public.workday
  WHERE $deleteWhere
  RETURNING 1
)
INSERT INTO public.workday (
  org_id,
  workday_id,
  worker_login,
  worker_name,
  start_at,
  end_at,
  duration_sec,
  status,
  comment,
  updated_by,
  created_at,
  updated_at
)
VALUES
$(($valueLines -join ",`n"));
"@
} else {
  $sql = "DELETE FROM public.workday WHERE $deleteWhere;"
}

$executeResult = $null
$primaryExecuteError = ""
$fallbackUsed = $false
$fallbackResult = $null
if ($Apply) {
  try {
    $executeResult = Invoke-ExecuteSqlLiteral -Sql $sql
  } catch {
    $primaryExecuteError = $_.Exception.Message
    Write-Warning ("Primary replace mode failed for {0} ({1}). Trying fallback without DELETE." -f $workerNameResolved, $workerLoginResolved)
    try {
      $fallbackResult = Invoke-RepairWithoutDelete `
        -ExistingRows ($beforeMonthRows.ToArray()) `
        -TargetRows ($importRows.ToArray()) `
        -OrgId $OrgId `
        -WorkerLogin $workerLoginResolved `
        -WorkerName $workerNameResolved `
        -ImportTag ("IMPORT XLSX $Month") `
        -UpdatedBy "script:repair-worker-month-from-xlsx"
      $fallbackUsed = $true
    } catch {
      $fallbackError = $_.Exception.Message
      throw ("Primary replace mode failed: {0}`nFallback without DELETE failed: {1}" -f $primaryExecuteError, $fallbackError)
    }
  }
}

$afterRowsData = Invoke-DataConnectOperation -Query $workerWorkdaysQuery -Variables @{
  orgId = $OrgId
  workerLogin = $workerLoginResolved
} -OperationName "WorkdaysByWorkerNoAuth"

$afterAllRows = @($afterRowsData.workdays)
$afterMonthRows = New-Object System.Collections.Generic.List[object]
foreach ($row in $afterAllRows) {
  if (-not $row.startAt) {
    continue
  }
  $startUtc = [DateTime]::Parse([string]$row.startAt, $culture, [System.Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
  if ($startUtc -ge $scopeStartUtc -and $startUtc -lt $scopeEndUtc) {
    $afterMonthRows.Add($row)
  }
}

$afterTotalSec = 0
foreach ($row in $afterMonthRows) {
  $afterTotalSec += (Get-RowDurationSec -Row $row)
}

$report = [PSCustomObject]@{
  generatedAt = (Get-Date).ToString("o")
  mode = if ($Apply) { "apply" } else { "dry_run" }
  source = [PSCustomObject]@{
    xlsxPath = (Resolve-Path -LiteralPath $XlsxPath).Path
    fileName = $fileName
  }
  organization = [PSCustomObject]@{
    orgId = $OrgId
    projectId = $ProjectId
    serviceId = $ServiceId
    location = $Location
  }
  scope = [PSCustomObject]@{
    month = $Month
    dateFrom = $scopeStartDate
    dateTo = $scopeEndLocalExclusive.AddDays(-1).ToString("yyyy-MM-dd")
    rangeStartUtc = $scopeStartIso
    rangeEndUtcExclusive = $scopeEndIso
    monthStartUtc = $scopeStartIso
    monthEndUtcExclusive = $scopeEndIso
  }
  worker = [PSCustomObject]@{
    login = $workerLoginResolved
    workerId = $workerIdResolved
    workerName = $workerNameResolved
  }
  parsedXlsx = [PSCustomObject]@{
    row12NonEmptyCells = $xlsxData.nonEmptyCells
    row12ParsedCells = $xlsxData.parsedCells
    monthEntries = $importRows.Count
    nonParsableCells = $xlsxData.nonParsableCells
  }
  before = [PSCustomObject]@{
    monthWorkdayRows = $beforeMonthRows.Count
    monthDurationSec = $beforeTotalSec
    monthDurationHhMm = (Format-HoursMinutes -TotalSec $beforeTotalSec)
    monthRows = $beforeMonthRows
  }
  planned = [PSCustomObject]@{
    insertRows = $importRows.Count
    insertDurationSec = $plannedTotalSec
    insertDurationHhMm = (Format-HoursMinutes -TotalSec $plannedTotalSec)
    rows = $importRows
  }
  execution = [PSCustomObject]@{
    applied = [bool]$Apply
    sqlLength = $sql.Length
    executeSqlResult = $executeResult
    primaryError = $primaryExecuteError
    fallbackUsed = [bool]$fallbackUsed
    fallbackResult = $fallbackResult
  }
  after = [PSCustomObject]@{
    monthWorkdayRows = $afterMonthRows.Count
    monthDurationSec = $afterTotalSec
    monthDurationHhMm = (Format-HoursMinutes -TotalSec $afterTotalSec)
    monthRows = $afterMonthRows
  }
}

$targetReportPath = $ReportPath
if (-not $targetReportPath) {
  $stamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
  $targetReportPath = "reports/repair-workday-$($workerLoginResolved)-$($Month)-$stamp.json"
}

$targetDir = Split-Path -Parent $targetReportPath
if ($targetDir) {
  [void](New-Item -ItemType Directory -Path $targetDir -Force)
}

$reportJson = $report | ConvertTo-Json -Depth 100
Set-Content -LiteralPath $targetReportPath -Value $reportJson -Encoding UTF8

Write-Host ("Mode: {0}" -f $report.mode)
Write-Host ("Worker: {0} ({1})" -f $workerNameResolved, $workerLoginResolved)
Write-Host ("Month: {0}" -f $Month)
Write-Host ("Scope: {0} - {1}" -f $scopeStartDate, $scopeEndLocalExclusive.AddDays(-1).ToString("yyyy-MM-dd"))
Write-Host ("XLSX entries in month: {0}" -f $importRows.Count)
Write-Host ("Before: rows={0}, total={1}" -f $beforeMonthRows.Count, (Format-HoursMinutes -TotalSec $beforeTotalSec))
Write-Host ("Planned insert: rows={0}, total={1}" -f $importRows.Count, (Format-HoursMinutes -TotalSec $plannedTotalSec))
Write-Host ("After: rows={0}, total={1}" -f $afterMonthRows.Count, (Format-HoursMinutes -TotalSec $afterTotalSec))
Write-Host ("Report saved: {0}" -f (Resolve-Path -LiteralPath $targetReportPath).Path)
