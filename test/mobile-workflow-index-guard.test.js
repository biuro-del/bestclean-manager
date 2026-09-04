'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { resolveSingleOpenWorkday } = require('../mobile-open-workday-policy')

const indexPath = path.join(__dirname, '..', 'index.js')
const source = fs.readFileSync(indexPath, 'utf8')

function functionSource(name, nextName) {
  const start = source.indexOf(`async function ${name}`)
  assert.notEqual(start, -1, `Nie znaleziono funkcji ${name}`)
  const end = nextName ? source.indexOf(`async function ${nextName}`, start + 1) : source.length
  assert.notEqual(end, -1, `Nie znaleziono granicy ${nextName}`)
  return source.slice(start, end)
}

test('odczyt QR START blokuje tylko dzisiejsze lub niejednoznaczne Workday pod LIMIT 2 i FOR UPDATE', () => {
  const body = functionSource('fetchMobileOpenWorkdayState', 'fetchMobileWorkdays')
  assert.match(body, /start_at at time zone 'Europe\/Warsaw'/i)
  assert.match(body, /business_day_relation/i)
  assert.match(body, /then 'TODAY'/i)
  assert.match(body, /then 'PRIOR'/i)
  assert.match(body, /else 'FUTURE'/i)
  assert.match(body, /now\(\) at time zone 'Europe\/Warsaw'/i)
  assert.match(
    body,
    /and\s*\(\s*\(\(w\.start_at at time zone 'Europe\/Warsaw'\)::date\s*=\s*\(now\(\) at time zone 'Europe\/Warsaw'\)::date\)\s*or w\.start_at is null\s*\)/i,
  )
  assert.match(body, /limit 2\s*for update/i)
  assert.match(body, /for update/i)
  assert.match(body, /resolveOpenWorkdayState\(result\.rows\)/)
  assert.doesNotMatch(body, /limit\s+1/i)
})

test('kontrakt QR START tworzy Workday przy samych historycznych rekordach bez ich modyfikacji', () => {
  const historicalOpenWorkdays = [
    { workday_id: 'WD-OLD-1', start_at: '2026-07-21T05:00:00.000Z', is_today_warsaw: false },
    { workday_id: 'WD-OLD-2', start_at: '2026-07-22T05:00:00.000Z', is_today_warsaw: false },
  ]
  const before = JSON.parse(JSON.stringify(historicalOpenWorkdays))
  const workflow = functionSource('processMobileWorkflowScan', 'handleMobileWorkflowRequest')
  const startBranch = workflow.slice(
    workflow.indexOf("if (zone.kind === 'START')"),
    workflow.indexOf("} else if (zone.kind === 'STOP')"),
  )

  assert.equal(resolveSingleOpenWorkday(historicalOpenWorkdays), null)
  assert.deepEqual(historicalOpenWorkdays, before)
  assert.match(
    startBranch,
    /if \(!activeWorkday\)\s*\{\s*requireScanGps\('START'\)\s*activeWorkday = await createMobileWorkday/,
  )
  assert.doesNotMatch(startBranch, /closeMobileWorkday|closeMobileOpenCycles/)
})

test('jawny otwarty CLEAN jest globalnym blockerem niezaleznie od stanu Workday', () => {
  const body = functionSource('fetchOpenMobileCycles', 'fetchUnresolvedMobileCycles')
  assert.doesNotMatch(body, /join public\.workday w/i)
  assert.match(body, /upper\(btrim\(coalesce\(e\.event_type, ''\)\)\) = 'CLEAN'/i)
  assert.doesNotMatch(body, /coalesce\(nullif\(btrim\(e\.event_type\), ''\), 'CLEAN'\)/i)
})

test('blank event_type jest sprawdzany osobno, a tylko jawnie zamkniety Workday zwalnia blokade', () => {
  const body = functionSource('fetchUnresolvedMobileCycles', 'fetchMobileCycleHistory')
  assert.match(body, /left join public\.workday w/i)
  assert.match(body, /w\.workday_id is null/i)
  assert.match(body, /w\.end_at is null/i)
  assert.match(body, /nullif\(btrim\(e\.event_type\), ''\) is null/i)
})

test('START i STOP nie sa blokowane przez odczyt Eventow; kontrola cyklu jest tylko w galezi CLEAN', () => {
  const body = functionSource('processMobileWorkflowScan', 'handleMobileWorkflowRequest')
  const branchStart = body.indexOf("if (zone.kind === 'START')")
  const branchStop = body.indexOf("} else if (zone.kind === 'STOP')")
  const branchClean = body.indexOf('} else {', branchStop)
  const unresolvedRead = body.indexOf('const unresolvedCycleRows = await fetchUnresolvedMobileCycles', branchClean)
  const cycleRead = body.indexOf('const openCycleRows = await fetchOpenMobileCycles', branchClean)
  assert.ok(branchStart >= 0 && branchStop > branchStart && branchClean > branchStop)
  assert.ok(unresolvedRead > branchClean && cycleRead > unresolvedRead)
  assert.doesNotMatch(body.slice(0, branchClean), /fetchOpenMobileCycles|fetchUnresolvedMobileCycles|resolveSingleOpenCycle/)
  assert.match(body.slice(branchClean), /partitionMobileUnresolvedCycles/)
  assert.match(body.slice(branchClean), /assertNoUnresolvedOpenEvents\(unresolvedCycleState\.blocking\)/)
  assert.match(body.slice(branchClean), /resolveOpenCycleState\(openCycleRows, activeWorkday\?\.workday_id\)\.activeCycle/)
})

test('snapshot wybiera tylko dzisiejszy Workday i raportuje stare rekordy bez ich modyfikacji', () => {
  const body = functionSource('buildMobileSnapshotFromDb', 'closeMobileEvent')
  assert.match(body, /fetchMobileOpenWorkdayState/)
  assert.match(body, /openWorkdayState\.activeWorkday/)
  assert.match(body, /resolveOpenCycleState\(openCycleRows, activeWorkdayRaw\?\.workday_id\)/)
  assert.match(body, /staleOpenWorkday:/)
  assert.match(body, /repairRequired/)
  assert.match(body, /blockStart:\s*false/)
  assert.match(body, /openCycleIntegrity/)
  assert.doesNotMatch(body, /openCycleRows\.find/)
  assert.doesNotMatch(body, /update\s+public\.workday/i)
})

test('scan opiera START CLEAN i STOP wylacznie na dzisiejszym Workday', () => {
  const body = functionSource('processMobileWorkflowScan', 'handleMobileWorkflowRequest')
  assert.match(body, /const openWorkdayState = await fetchMobileOpenWorkdayState/)
  assert.match(body, /let activeWorkday = openWorkdayState\.activeWorkday/)
  assert.match(body, /resolveOpenCycleState\(openCycleRows, activeWorkday\?\.workday_id\)\.activeCycle/)
  assert.doesNotMatch(body, /openWorkdayState\.staleWorkdays\[[^\]]+\]/)
})

test('STOP zamyka wszystkie otwarte Eventy aktywnego dnia wedlug tej samej normalizacji', () => {
  const body = functionSource('closeMobileOpenCycles', 'createMobileWorkday')
  assert.match(body, /lower\(btrim\(e\.worker_login\)\) = lower\(btrim\(\$2\)\)/i)
  assert.match(body, /upper\(btrim\(coalesce\(e\.status, 'RUNNING'\)\)\) <> 'CLOSED'/i)
})

test('triggerowe konflikty Event i Workday mają stabilne odpowiedzi 409', () => {
  const start = source.indexOf('function mapMobileIntegrityDatabaseError')
  const end = source.indexOf('async function handleMobileWorkflowRequest', start)
  const body = source.slice(start, end)
  assert.match(body, /23505/)
  assert.match(body, /event_single_open_clean_per_worker/)
  assert.match(body, /event_single_open_clean_per_workday/)
  assert.match(body, /OPEN_CLEAN_EVENT_EXISTS/)
  assert.match(body, /23514/)
  assert.match(body, /OPEN_EVENT_TYPE_REQUIRED/)
  assert.match(body, /OPEN_EVENT_WORKER_REQUIRED/)
  assert.match(body, /workday_single_open_per_worker/)
  assert.match(body, /workday_single_open_per_worker_day/)
  assert.match(body, /OPEN_WORKDAY_EXISTS/)
  assert.match(body, /OPEN_WORKDAY_WORKER_REQUIRED/)
  assert.match(body, /status:\s*409/g)
})

test('mobilny runtime wymaga schematu dla CLEAN, ale flagą blokuje wyłącznie utworzenie nowego cyklu', () => {
  const enabledGuardStart = source.indexOf('function assertMobileCorrelationEnabled')
  const enabledGuardEnd = source.indexOf('async function assertMobileCorrelationSchemaReady', enabledGuardStart)
  const enabledGuard = source.slice(enabledGuardStart, enabledGuardEnd)
  const schemaGuard = functionSource('assertMobileCorrelationSchemaReady', 'closeMobileWorkday')
  const scan = functionSource('processMobileWorkflowScan', 'handleMobileWorkflowRequest')
  const request = functionSource('handleMobileWorkflowRequest', 'databaseRelationExists')
  const snapshot = functionSource('buildMobileSnapshotFromDb', 'closeMobileEvent')

  assert.ok(enabledGuardStart >= 0 && enabledGuardEnd > enabledGuardStart)
  assert.match(enabledGuard, /MOBILE_SERVICE_EXECUTION_CORRELATION_ENABLED/)
  assert.match(enabledGuard, /MOBILE_SERVICE_EXECUTION_CORRELATION_CANARY_WORKER_IDS/)
  assert.match(enabledGuard, /mobileCorrelationRolloutDecision/)
  assert.match(enabledGuard, /MOBILE_CORRELATION_NOT_ENABLED/)
  assert.match(enabledGuard, /statusCode = 503/)
  assert.match(schemaGuard, /readPublicEventColumns\(client\)/)
  assert.match(schemaGuard, /eventCorrelationSchema\(availableColumns\)/)
  assert.doesNotMatch(schemaGuard, /MOBILE_SERVICE_EXECUTION_CORRELATION_ENABLED/)
  assert.doesNotMatch(schemaGuard, /MOBILE_CORRELATION_NOT_ENABLED/)
  assert.match(schemaGuard, /MOBILE_CORRELATION_SCHEMA_INCOMPLETE/)
  assert.match(schemaGuard, /statusCode = 503/)
  assert.match(scan, /else \{\s*await assertMobileCorrelationSchemaReady\(client\)/)
  assert.match(
    scan,
    /assertMobileCorrelationEnabled\(worker\)\s*activeWorkday = await createMobileWorkday/,
  )
  assert.match(
    scan,
    /assertMobileCorrelationEnabled\(worker\)\s*await closeMobileEvent\([\s\S]*?'QR_SWITCH'[\s\S]*?await createMobileCycle/,
  )
  assert.match(
    scan,
    /else \{\s*const startsIndividualOrder = zone\.kind === 'INDIVIDUAL'\s*requireScanGps\('CLEAN_START', startsIndividualOrder\)\s*assertMobileCorrelationEnabled\(worker\)\s*const createdEvent = await createMobileCycle/,
  )
  const sameZoneBranchStart = scan.indexOf(
    "if (normalizeText(activeCycle.zone_id).toLowerCase() === normalizeText(zone.id).toLowerCase())",
  )
  const switchBranchStart = scan.indexOf('} else {', sameZoneBranchStart)
  assert.ok(sameZoneBranchStart >= 0 && switchBranchStart > sameZoneBranchStart)
  assert.doesNotMatch(
    scan.slice(sameZoneBranchStart, switchBranchStart),
    /assertMobileCorrelationEnabled/,
  )
  assert.doesNotMatch(request, /await assertMobileCorrelationSchemaReady\(client\)/)
  assert.match(snapshot, /availableEventColumns\.has\('event_type'\)/)
  assert.match(snapshot, /START i STOP pozostają dostępne/)
})

test('GPS jest wymagany i zapisywany tylko dla nowego START oraz startu zlecenia indywidualnego', () => {
  const scan = functionSource('processMobileWorkflowScan', 'handleMobileWorkflowRequest')
  const branchStart = scan.indexOf("if (zone.kind === 'START')")
  const branchStop = scan.indexOf("} else if (zone.kind === 'STOP')", branchStart)
  const branchClean = scan.indexOf('} else {', branchStop)
  const sameZoneStart = scan.indexOf(
    "if (normalizeText(activeCycle.zone_id).toLowerCase() === normalizeText(zone.id).toLowerCase())",
    branchClean,
  )
  const switchStart = scan.indexOf('} else {', sameZoneStart)

  assert.ok(branchStart >= 0 && branchStop > branchStart && branchClean > branchStop)
  assert.ok(sameZoneStart > branchClean && switchStart > sameZoneStart)

  const requirements = [...scan.matchAll(/requireScanGps\('([^']+)'(?:,\s*([^)]+))?\)/g)].map((match) => ({
    action: match[1],
    condition: match[2] || '',
  }))
  assert.deepEqual(requirements, [
    { action: 'START', condition: '' },
    { action: 'CLEAN_START', condition: 'startsIndividualOrder' },
    { action: 'CLEAN_START', condition: 'startsIndividualOrder' },
  ])

  const stopBranch = scan.slice(branchStop, branchClean)
  const sameZoneBranch = scan.slice(sameZoneStart, switchStart)
  assert.doesNotMatch(stopBranch, /requireScanGps|scanGpsNote/)
  assert.doesNotMatch(sameZoneBranch, /requireScanGps|scanGpsNote/)
  assert.doesNotMatch(scan, /zoneIsSpecial|activeCycleIsSpecial|CLEAN_STOP|STOP_GPS/)

  assert.equal((scan.match(/scanGpsNote\('START'\)/g) || []).length, 1)
  assert.equal((scan.match(/scanGpsNote\('CLEAN_START', startsIndividualOrder\)/g) || []).length, 3)
})
