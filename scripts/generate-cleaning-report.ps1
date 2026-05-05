param(
  [string]$ReportDate = '2026-03-09',
  [string]$OrgId = 'bestclean',
  [string[]]$ClientIds = @('LK050', 'LK067'),
  [string]$OutputDir = 'reports',
  [switch]$SkipPdf
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$serviceUri = 'https://firebasedataconnect.googleapis.com/v1/projects/iclean-room/locations/europe-west3/services/iclean-room-service:executeGraphql'
$timeZone = [TimeZoneInfo]::FindSystemTimeZoneById('Central European Standard Time')
$culture = [System.Globalization.CultureInfo]::InvariantCulture
$slug = 'zestawienie-{0}-tesko-tsl' -f $ReportDate

function Normalize-Key {
  param([object]$Value)

  return ((([string]$Value).Trim().ToLowerInvariant()) -replace '\s+', '')
}

function Get-FirstValue {
  param([object[]]$Values)

  foreach ($value in $Values) {
    if ($null -eq $value) {
      continue
    }

    $text = [string]$value
    if ($text -ne '') {
      return $text
    }
  }

  return ''
}

function Get-AccessToken {
  $token = (cmd /c gcloud auth print-access-token).Trim()
  if (-not $token) {
    throw 'Nie udalo sie pobrac tokena gcloud.'
  }

  return $token
}

function Invoke-Graphql {
  param(
    [string]$Token,
    [string]$Query,
    [hashtable]$Variables,
    [string]$OperationName
  )

  $body = @{
    query = $Query
    variables = $Variables
    operationName = $OperationName
  } | ConvertTo-Json -Depth 12

  $response = Invoke-RestMethod `
    -Method Post `
    -Uri $serviceUri `
    -Headers @{ Authorization = "Bearer $Token" } `
    -ContentType 'application/json' `
    -Body $body

  $graphqlErrors = @()
  if ($response.PSObject.Properties.Match('errors').Count -gt 0) {
    $graphqlErrors = @($response.errors)
  }

  if (@($graphqlErrors).Length -gt 0) {
    $message = ($graphqlErrors | ForEach-Object { $_.message }) -join '; '
    throw ("Blad GraphQL dla {0}: {1}" -f $OperationName, $message)
  }

  if ($response.PSObject.Properties.Match('data').Count -eq 0) {
    throw ("Brak pola data w odpowiedzi GraphQL dla {0}." -f $OperationName)
  }

  return $response.data
}

function Convert-ToLocalTime {
  param([string]$IsoValue)

  if (-not $IsoValue) {
    return $null
  }

  $utc = [DateTime]::Parse($IsoValue, $culture, [System.Globalization.DateTimeStyles]::RoundtripKind)
  return [TimeZoneInfo]::ConvertTimeFromUtc($utc.ToUniversalTime(), $timeZone)
}

function Format-Hms {
  param([object]$Seconds)

  $value = if ($null -eq $Seconds) { 0 } else { [Math]::Max([int]$Seconds, 0) }
  $span = [TimeSpan]::FromSeconds($value)
  return '{0:d2}:{1:d2}:{2:d2}' -f ([int][Math]::Floor($span.TotalHours)), $span.Minutes, $span.Seconds
}

function Html-Encode {
  param([object]$Value)

  return [System.Net.WebUtility]::HtmlEncode([string]$Value)
}

function Join-StackHtml {
  param([object[]]$Values)

  $items = @($Values | Where-Object { $null -ne $_ -and [string]$_ -ne '' })
  if ($items.Count -eq 0) {
    return '<div class="stack-item muted">-</div>'
  }

  return (($items | ForEach-Object {
        '<div class="stack-item">{0}</div>' -f (Html-Encode $_)
      }) -join '')
}

function Get-Workers {
  param([string]$Token)

  $query = @'
query WorkersPage($orgId: String!, $pageSize: Int!, $offset: Int!) {
  workers(
    where: { orgId: { eq: $orgId } }
    orderBy: [{ login: ASC }]
    first: $pageSize
    offset: $offset
  ) {
    login
    workerName
  }
}
'@

  $pageSize = 100
  $offset = 0
  $allRows = @()

  while ($true) {
    $data = Invoke-Graphql -Token $Token -Query $query -Variables @{
      orgId = $OrgId
      pageSize = $pageSize
      offset = $offset
    } -OperationName 'WorkersPage'

    $rows = @($data.workers)
    if ($rows.Count -eq 0) {
      break
    }

    $allRows += $rows
    if ($rows.Count -lt $pageSize) {
      break
    }

    $offset += $rows.Count
  }

  return $allRows
}

function Get-EventsForDay {
  param(
    [string]$Token,
    [datetime]$DayStartUtc
  )

  $query = @'
query EventsPage($orgId: String!, $pageSize: Int!, $offset: Int!) {
  events(
    where: { orgId: { eq: $orgId } }
    orderBy: [{ startAt: DESC }]
    first: $pageSize
    offset: $offset
  ) {
    eventId
    zoneId
    workerLogin
    workerName
    startAt
    endAt
    durationSec
    status
    comment
    updatedAt
    zone {
      zoneId
      clientId
      zone
      function
      location
      client {
        clientId
        name
      }
    }
  }
}
'@

  $pageSize = 100
  $offset = 0
  $allRows = @()

  while ($true) {
    $data = Invoke-Graphql -Token $Token -Query $query -Variables @{
      orgId = $OrgId
      pageSize = $pageSize
      offset = $offset
    } -OperationName 'EventsPage'

    $rows = @($data.events)
    if ($rows.Count -eq 0) {
      break
    }

    $allRows += $rows

    $lastStart = $rows[-1].startAt
    if ($lastStart) {
      $lastStartUtc = [DateTime]::Parse($lastStart, $culture, [System.Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
      if ($lastStartUtc -lt $DayStartUtc) {
        break
      }
    }

    if ($rows.Count -lt $pageSize) {
      break
    }

    $offset += $rows.Count
  }

  return $allRows
}

if (-not (Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$reportDateLocal = [DateTime]::ParseExact($ReportDate, 'yyyy-MM-dd', $culture)
$dayStartLocal = [datetime]::SpecifyKind($reportDateLocal.Date, [DateTimeKind]::Unspecified)
$dayEndLocal = $dayStartLocal.AddDays(1).AddMilliseconds(-1)
$dayStartUtc = [TimeZoneInfo]::ConvertTimeToUtc($dayStartLocal, $timeZone)
$dayEndUtc = [TimeZoneInfo]::ConvertTimeToUtc($dayEndLocal, $timeZone)

$token = Get-AccessToken
$workerRows = Get-Workers -Token $token
$eventRows = Get-EventsForDay -Token $token -DayStartUtc $dayStartUtc

$workerByLogin = @{}
$workerByName = @{}
foreach ($worker in $workerRows) {
  $login = [string]$worker.login
  $name = [string]$worker.workerName
  if ($login) {
    $workerByLogin[(Normalize-Key $login)] = $name
  }
  if ($name) {
    $workerByName[(Normalize-Key $name)] = $name
  }
}

$clientSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$ClientIds | ForEach-Object { [void]$clientSet.Add($_) }

$filteredEvents = foreach ($event in $eventRows) {
  $zone = $event.zone
  if ($null -eq $zone) {
    continue
  }

  $zoneClient = $zone.client
  $clientId = Get-FirstValue @(
    $(if ($zoneClient) { $zoneClient.clientId } else { '' }),
    $zone.clientId
  )
  if (-not $clientSet.Contains($clientId)) {
    continue
  }

  $zoneFunction = [string]$zone.function
  if ($zoneFunction -notin @('clean', 'strefa_specjalna')) {
    continue
  }

  $status = [string]$event.status
  if ($status -ne 'CLOSED') {
    continue
  }

  $startLocal = Convert-ToLocalTime $event.startAt
  $endLocal = Convert-ToLocalTime $event.endAt
  $startDay = if ($startLocal) { $startLocal.ToString('yyyy-MM-dd') } else { '' }
  $endDay = if ($endLocal) { $endLocal.ToString('yyyy-MM-dd') } else { '' }
  if ($startDay -ne $ReportDate -and $endDay -ne $ReportDate) {
    continue
  }

  $resolvedName = $null
  foreach ($candidate in @($event.workerLogin, $event.workerName)) {
    $key = Normalize-Key $candidate
    if (-not $key) {
      continue
    }

    if ($workerByLogin.ContainsKey($key)) {
      $resolvedName = $workerByLogin[$key]
      break
    }
    if ($workerByName.ContainsKey($key)) {
      $resolvedName = $workerByName[$key]
      break
    }
  }

  if (-not $resolvedName) {
    $resolvedName = Get-FirstValue @($event.workerName, $event.workerLogin, '-')
  }

  $durationSec = if ($null -ne $event.durationSec) {
    [int]$event.durationSec
  } elseif ($startLocal -and $endLocal) {
    [int][Math]::Max([Math]::Floor(($endLocal - $startLocal).TotalSeconds), 0)
  } else {
    0
  }

  [pscustomobject]@{
    eventId = [string]$event.eventId
    clientId = $clientId
    clientName = Get-FirstValue @(
      $(if ($zoneClient) { $zoneClient.name } else { '' }),
      $clientId
    )
    zoneId = Get-FirstValue @($event.zoneId, $zone.zoneId)
    zoneName = [string]$zone.zone
    location = Get-FirstValue @($zone.location, '')
    qr = Get-FirstValue @($event.zoneId, $zone.zoneId)
    worker = $resolvedName
    startAt = $event.startAt
    start = if ($startLocal) { $startLocal.ToString('HH:mm:ss') } else { '' }
    stop = if ($endLocal) { $endLocal.ToString('HH:mm:ss') } else { '' }
    duration = (Format-Hms $durationSec)
  }
}

$groupedRows = $filteredEvents |
  Sort-Object clientName, zoneId, startAt, worker |
  Group-Object clientId, zoneId |
  ForEach-Object {
    $first = $_.Group[0]
    $entries = $_.Group | Sort-Object startAt, worker | ForEach-Object {
      [pscustomobject]@{
        worker = $_.worker
        start = $_.start
        stop = $_.stop
        duration = $_.duration
      }
    }

    [pscustomobject]@{
      clientId = $first.clientId
      clientName = $first.clientName
      zoneId = $first.zoneId
      zoneName = $first.zoneName
      location = $first.location
      qr = $first.qr
      plannedTime = '................................'
      entryCount = @($entries).Count
      entries = @($entries)
    }
  } |
  Sort-Object clientName, zoneId

$reportObject = [pscustomobject]@{
  reportDate = $ReportDate
  generatedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  rows = @($groupedRows)
}

$jsonPath = Join-Path $OutputDir ($slug + '.json')
$htmlPath = Join-Path $OutputDir ($slug + '.html')
$pdfPath = Join-Path $OutputDir ($slug + '.pdf')

$reportObject | ConvertTo-Json -Depth 8 | Set-Content -Path $jsonPath -Encoding utf8

$sections = foreach ($clientGroup in ($groupedRows | Group-Object clientName | Sort-Object Name)) {
  $clientTitle = Html-Encode $clientGroup.Name
  $rowHtml = foreach ($row in ($clientGroup.Group | Sort-Object zoneId)) {
    $people = Join-StackHtml ($row.entries | ForEach-Object { $_.worker })
    $starts = Join-StackHtml ($row.entries | ForEach-Object { $_.start })
    $stops = Join-StackHtml ($row.entries | ForEach-Object { $_.stop })
    $durations = Join-StackHtml ($row.entries | ForEach-Object { $_.duration })

    @"
      <tr>
        <td>$([string](Html-Encode $row.clientName))</td>
        <td><div class="zone-cell"><strong>$([string](Html-Encode $row.zoneId))</strong><span>$([string](Html-Encode $row.zoneName))</span></div></td>
        <td>$([string](Html-Encode ($(if ($row.location) { $row.location } else { '-' }))))</td>
        <td>$([string](Html-Encode $row.qr))</td>
        <td>$people</td>
        <td>$starts</td>
        <td>$stops</td>
        <td>$durations</td>
        <td class="planned-time">$([string](Html-Encode $row.plannedTime))</td>
      </tr>
"@
  }

  @"
  <section class="client-section">
    <div class="section-head">
      <h2>$clientTitle</h2>
      <div class="section-meta">Liczba stref: $($clientGroup.Count)</div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Klient</th>
          <th>Strefa</th>
          <th>Lokalizacja strefy</th>
          <th>QR</th>
          <th>Osoba / osoby</th>
          <th>Start</th>
          <th>Stop</th>
          <th>Czas</th>
          <th>Zakladany czas pracy w strefie</th>
        </tr>
      </thead>
      <tbody>
        $($rowHtml -join "`n")
      </tbody>
    </table>
  </section>
"@
}

$html = @"
<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <title>Zestawienie stref z dnia $ReportDate</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 10mm;
    }

    :root {
      --text: #1d1d1d;
      --muted: #6b6b6b;
      --line: #cfcfcf;
      --header: #f3f1eb;
      --panel: #ffffff;
      --accent: #2d4a3f;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      color: var(--text);
      background: #faf8f2;
      font-family: "Segoe UI", Tahoma, Arial, sans-serif;
      font-size: 11px;
      line-height: 1.25;
    }

    .report {
      background: var(--panel);
      border: 1px solid var(--line);
      padding: 10mm;
    }

    .report-head {
      display: flex;
      justify-content: space-between;
      gap: 12mm;
      align-items: flex-end;
      margin-bottom: 7mm;
      padding-bottom: 4mm;
      border-bottom: 2px solid var(--accent);
    }

    h1 {
      margin: 0;
      font-size: 22px;
      line-height: 1.05;
      letter-spacing: 0.02em;
    }

    .subtitle {
      margin-top: 3mm;
      color: var(--muted);
      max-width: 180mm;
    }

    .meta {
      text-align: right;
      color: var(--muted);
      white-space: nowrap;
    }

    .client-section + .client-section {
      break-before: page;
      margin-top: 0;
    }

    .section-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin: 0 0 3mm;
    }

    .section-head h2 {
      margin: 0;
      font-size: 16px;
    }

    .section-meta {
      color: var(--muted);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    thead {
      display: table-header-group;
    }

    th,
    td {
      border: 1px solid var(--line);
      padding: 2.5mm 2mm;
      vertical-align: top;
      word-wrap: break-word;
    }

    th {
      background: var(--header);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    td:nth-child(1) { width: 13%; }
    td:nth-child(2) { width: 18%; }
    td:nth-child(3) { width: 18%; }
    td:nth-child(4) { width: 8%; }
    td:nth-child(5) { width: 15%; }
    td:nth-child(6) { width: 8%; }
    td:nth-child(7) { width: 8%; }
    td:nth-child(8) { width: 8%; }
    td:nth-child(9) { width: 12%; }

    .zone-cell {
      display: flex;
      flex-direction: column;
      gap: 1mm;
    }

    .zone-cell strong {
      font-size: 11px;
    }

    .stack-item + .stack-item {
      margin-top: 1.2mm;
      padding-top: 1.2mm;
      border-top: 1px dashed #d8d8d8;
    }

    .muted {
      color: var(--muted);
    }

    .planned-time {
      letter-spacing: 0.03em;
      color: #555;
    }

    .footer-note {
      margin-top: 5mm;
      color: var(--muted);
      font-size: 10px;
    }
  </style>
</head>
<body>
  <main class="report">
    <header class="report-head">
      <div>
        <h1>Zestawienie stref z dnia $ReportDate</h1>
        <div class="subtitle">
          Klienci: Tesko Steel oraz TSL. Raport zawiera zamkniete zdarzenia sprzatania dla lokalnego dnia pracy.
        </div>
      </div>
      <div class="meta">
        <div>Wygenerowano: $([string](Html-Encode $reportObject.generatedAt))</div>
        <div>Stref: $($groupedRows.Count)</div>
        <div>Wpisow: $(@($filteredEvents).Count)</div>
      </div>
    </header>

    $($sections -join "`n")

    <div class="footer-note">
      Godziny pokazane sa w czasie lokalnym Europe/Warsaw. Kolumna QR zawiera kod strefy.
    </div>
  </main>
</body>
</html>
"@

$html | Set-Content -Path $htmlPath -Encoding utf8

if (-not $SkipPdf) {
  $browser = @(
    'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    'C:\Program Files\Google\Chrome\Application\chrome.exe'
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1

  if (-not $browser) {
    throw 'Nie znaleziono przegladarki Edge ani Chrome do renderu PDF.'
  }

  $htmlFullPath = [System.IO.Path]::GetFullPath($htmlPath)
  $pdfFullPath = [System.IO.Path]::GetFullPath($pdfPath)
  $htmlUri = [System.Uri]::new($htmlFullPath).AbsoluteUri

  & $browser `
    --headless `
    --disable-gpu `
    --allow-file-access-from-files `
    --print-to-pdf-no-header `
    "--print-to-pdf=$pdfFullPath" `
    $htmlUri | Out-Null

  if (-not (Test-Path $pdfPath)) {
    throw 'Render PDF nie utworzyl pliku wynikowego.'
  }
}

[pscustomobject]@{
  reportDate = $ReportDate
  eventsFetched = @($eventRows).Count
  eventsUsed = @($filteredEvents).Count
  zonesReported = @($groupedRows).Count
  jsonPath = [System.IO.Path]::GetFullPath($jsonPath)
  htmlPath = [System.IO.Path]::GetFullPath($htmlPath)
  pdfPath = if ($SkipPdf) { '' } else { [System.IO.Path]::GetFullPath($pdfPath) }
}
