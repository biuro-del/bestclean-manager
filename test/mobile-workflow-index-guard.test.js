'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const indexPath = path.join(__dirname, '..', 'index.js')
const source = fs.readFileSync(indexPath, 'utf8')

function functionSource(name, nextName) {
  const start = source.indexOf(`async function ${name}`)
  assert.notEqual(start, -1, `Nie znaleziono funkcji ${name}`)
  const end = nextName ? source.indexOf(`async function ${nextName}`, start + 1) : source.length
  assert.notEqual(end, -1, `Nie znaleziono granicy ${nextName}`)
  return source.slice(start, end)
}

test('otwarty Workday jest sprawdzany globalnie i bez wyboru jednego z duplikatow', () => {
  const body = functionSource('fetchActiveMobileWorkday', 'fetchMobileWorkdays')
  assert.doesNotMatch(body, /and\s+\(w?\.?start_at at time zone/i)
  assert.match(body, /limit 2\s+for update/i)
  assert.match(body, /resolveSingleOpenWorkday\(result\.rows\)/)
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
  assert.match(body.slice(branchClean), /assertNoUnresolvedOpenEvents\(unresolvedCycleRows\)/)
  assert.match(body.slice(branchClean), /resolveSingleOpenCycle\(openCycleRows, activeWorkday\?\.workday_id\)/)
})

test('snapshot nie wybiera arbitralnie pierwszego Eventu przy konflikcie', () => {
  const body = functionSource('buildMobileSnapshotFromDb', 'closeMobileEvent')
  assert.match(body, /resolveSingleOpenCycle\(openCycleRows, activeWorkdayRaw\?\.workday_id\)/)
  assert.match(body, /openCycleIntegrity/)
  assert.doesNotMatch(body, /openCycleRows\.find/)
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
  assert.match(body, /OPEN_CLEAN_EVENT_EXISTS/)
  assert.match(body, /23514/)
  assert.match(body, /OPEN_EVENT_TYPE_REQUIRED/)
  assert.match(body, /OPEN_EVENT_WORKER_REQUIRED/)
  assert.match(body, /workday_single_open_per_worker/)
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
    /assertMobileCorrelationEnabled\(\)\s*activeWorkday = await createMobileWorkday/,
  )
  assert.match(
    scan,
    /assertMobileCorrelationEnabled\(\)\s*await closeMobileEvent\([\s\S]*?'QR_SWITCH'[\s\S]*?await createMobileCycle/,
  )
  assert.match(
    scan,
    /else \{\s*requireScanGps\('CLEAN', zoneIsSpecial\)\s*assertMobileCorrelationEnabled\(\)\s*await createMobileCycle/,
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
