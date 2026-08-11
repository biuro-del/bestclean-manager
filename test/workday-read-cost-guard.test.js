'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.join(__dirname, '..')
const portalRoot = path.join(repoRoot, 'web-app', 'apps', 'portal-web', 'src')
const policyModule = import(
  '../web-app/apps/portal-web/src/services/workdayReadCostPolicy.js'
)

function readPortalFile(...segments) {
  return fs.readFileSync(path.join(portalRoot, ...segments), 'utf8')
}

function sourceSection(source, from, to) {
  const start = source.indexOf(from)
  const end = source.indexOf(to, start + from.length)
  assert.ok(start >= 0, `Nie znaleziono początku sekcji: ${from}`)
  assert.ok(end > start, `Nie znaleziono końca sekcji: ${to}`)
  return source.slice(start, end)
}

test('niepelna strona jest jawnym bledem bezpiecznego odczytu', async () => {
  const {
    assertCompletePagedResponse,
    isPagedReadSafetyError,
  } = await policyModule

  assert.deepEqual(assertCompletePagedResponse({ items: [], hasNext: false }), {
    items: [],
    hasNext: false,
  })
  assert.throws(
    () => assertCompletePagedResponse({ items: [], hasNext: true }, 'zdarzen'),
    (error) => error?.code === 'PAGED_READ_INCOMPLETE' && isPagedReadSafetyError(error),
  )
})

test('profil pracownika nie wykonuje szerokiego odczytu organizacji', () => {
  const account = readPortalFile('features', 'workers', 'account', 'index.js')
  const candidateSection = sourceSection(account, 'async function fetchWorkerTimeCandidateRows', 'function renderKpis')
  const timeSection = sourceSection(account, 'async function fetchWorkerTimeRows', 'async function fetchWorkerEventCandidateRows')
  const eventSection = sourceSection(account, 'async function fetchWorkerEventRows', 'function renderKpis')

  assert.doesNotMatch(timeSection, /broadResponse/)
  assert.doesNotMatch(eventSection, /broadResponses/)
  assert.doesNotMatch(account, /allowBroadFallback:\s*true/)
  assert.doesNotMatch(candidateSection, /\.catch\(\(\) => \(\{ items: \[\] \}\)\)/)
  assert.match(candidateSection, /completeWorkerResponseItems/)
  assert.match(account, /assertCompletePagedResponse\(response, sourceLabel\)/)
  assert.match(candidateSection, /hasMore:\s*responses\.some\(\(response\) => response\?\.hasNext === true\)/)
  assert.match(account, /\$\{paged\.total\}\+ \(najnowsze\)/)
})

test('pulpit i serwis odrzucaja niepelne odpowiedzi przed uzyciem danych', () => {
  const dashboard = readPortalFile('features', 'dashboard', 'index.js')
  const service = readPortalFile('services', 'workdayService.js')
  const activityDaySection = sourceSection(dashboard, 'async function dashboardLoadActivityDay', 'function dashboardSetActivityDay')
  const fastRowsSection = sourceSection(dashboard, 'async function dashboardLoadFastRows', 'async function dashboardSyncCalendarOrdersForTimeline')
  const backgroundSection = sourceSection(dashboard, 'async function dashboardRefreshBackgroundData', 'function dashboardStartBackgroundDataRefresh')

  assert.match(dashboard, /assertCompletePagedResponse\(entry\?\.response/)
  assert.match(activityDaySection, /dashboardAssertCompleteReadResponses\(\[/)
  assert.match(fastRowsSection, /dashboardAssertCompleteReadResponses\(\[/)
  assert.match(backgroundSection, /dashboardAssertCompleteReadResponses\(\[/)
  assert.ok(activityDaySection.indexOf('dashboardAssertCompleteReadResponses([') < activityDaySection.indexOf('appState.dashboardActivityDayRows ='))
  assert.ok(fastRowsSection.indexOf('dashboardAssertCompleteReadResponses([') < fastRowsSection.indexOf('const todayEventIds ='))
  assert.ok(backgroundSection.indexOf('dashboardAssertCompleteReadResponses([') < backgroundSection.indexOf('dashboardWriteLocalSnapshot(orgId'))
  assert.match(service, /assertCompletePagedResponse\(workdayResponse, 'dzisiejszych dni pracy'\)/)
  assert.match(service, /assertCompletePagedResponse\(eventResponse, 'dzisiejszych zdarzen'\)/)
  assert.match(service, /assertCompletePagedResponse\(workdayResponse, 'aktywnych dni pracy'\)/)
})

test('pelne slowniki referencyjne korzystaja ze wspoldzielonego cache przez piec minut', () => {
  ;[
    ['services', 'workerService.js'],
    ['services', 'clientService.js'],
    ['services', 'zoneService.js'],
  ].forEach((segments) => {
    const source = readPortalFile(...segments)
    assert.match(source, /const READ_CACHE_MS = 5 \* 60 \* 1000/, segments.join('/'))
  })
})

test('polityka odczytu dopuszcza maksymalnie 20 000 rekordów w całym oknie stron', async () => {
  const {
    WORKDAY_READ_MAX_RECORDS,
    assertWorkdayReadWindow,
  } = await policyModule

  assert.equal(WORKDAY_READ_MAX_RECORDS, 20000)
  assert.deepEqual(assertWorkdayReadWindow({ page: 80, pageSize: 250 }), {
    page: 80,
    pageSize: 250,
    pageOffset: 19750,
    windowEnd: 20000,
  })

  assert.throws(
    () => assertWorkdayReadWindow({ page: 1, pageSize: 20001 }, 'zdarzeń'),
    (error) => error?.code === 'PAGED_READ_LIMIT_EXCEEDED',
  )
  assert.throws(
    () => assertWorkdayReadWindow({ page: 81, pageSize: 250 }, 'zdarzeń'),
    (error) => error?.code === 'PAGED_READ_LIMIT_EXCEEDED',
  )
})

test('zwykła ścieżka UI nie przechodzi automatycznie na pełny odczyt organizacji', () => {
  const source = readPortalFile('services', 'workdayService.js')
  const getWorkdaysSection = sourceSection(
    source,
    'export async function getWorkdays',
    'export async function getWorkerTime',
  )

  assert.match(getWorkdaysSection, /assertWorkdayReadWindow\(filters, sourceLabel\)/)
  assert.match(getWorkdaysSection, /filters\.allowLegacyFullOrgFallback !== true/)
  assert.match(getWorkdaysSection, /throw pagedReadUnavailableError\('zdarzeń'\)/)
  assert.match(getWorkdaysSection, /throw pagedReadUnavailableError\('dni pracy'\)/)
  assert.match(getWorkdaysSection, /source === 'backupcycle' \|\| source === 'backup_cycle'/)
  assert.match(getWorkdaysSection, /const fastWorktimeUnavailable =/)
  assert.match(
    getWorkdaysSection,
    /fastWorktimeUnavailable && filters\.allowLegacyFullOrgFallback !== true/,
  )
})

test('usuwanie zdarzenia szuka powiązań przez stronę integrity zamiast EventsForOrg', () => {
  const source = readPortalFile('services', 'workdayService.js')
  const section = sourceSection(
    source,
    'async function findEventIdsLinkedToWorkday',
    'export async function deleteEvent',
  )

  assert.match(section, /EventsIntegrityPageForOrg/)
  assert.match(section, /WORKDAY_READ_MAX_CHUNK_SIZE/)
  assert.match(section, /WORKDAY_READ_MAX_RECORDS/)
  assert.doesNotMatch(section, /EventsForOrg/)
})

test('główne ekrany i eksporty nie żądają ponownie wielkich, nieograniczonych paczek', () => {
  const guardedFiles = [
    ['features', 'calendar', 'index.js'],
    ['features', 'dashboard', 'index.js'],
    ['features', 'events', 'index.js'],
    ['features', 'reports', 'index.js'],
    ['features', 'workers', 'time-detail', 'index.js'],
    ['features', 'workers', 'work_time_export.js'],
    ['features', 'workers', 'work_time_evidence_export.js'],
  ]

  guardedFiles.forEach((segments) => {
    const source = readPortalFile(...segments)
    assert.doesNotMatch(source, /pageSize:\s*(?:8000|10000|12000|100000)\b/, segments.join('/'))
  })
})

test('raporty nie uruchamiają automatycznego odczytu BackupCyclesForOrg', () => {
  const reports = readPortalFile('features', 'reports', 'index.js')
  assert.doesNotMatch(reports, /source:\s*['"]backup_?cycle['"]/)
})

test('backupy i kopie cykli używają ograniczonych odczytów stron zamiast pełnych paczek organizacji', () => {
  const backup = readPortalFile('services', 'backupService.js')
  const workdayService = readPortalFile('services', 'workdayService.js')
  const queries = fs.readFileSync(path.join(repoRoot, 'dataconnect', 'connectors', 'example', 'queries.gql'), 'utf8')
  const policy = fs.readFileSync(path.join(repoRoot, 'platform-policy.js'), 'utf8')

  ;[
    'IndividualJobsPageForOrg',
    'EventsIntegrityPageForOrg',
    'WorkdaysIntegrityPageForOrg',
    'WorkdayPausesPageForOrg',
  ].forEach((operationName) => assert.match(backup, new RegExp(operationName)))
  assert.match(backup, /fetchAllReferenceRows\(/)
  assert.doesNotMatch(backup, /\b(?:eventsForOrg|workdaysForOrg|workdayPausesForOrg|individualJobsForOrg)\b/)

  const getWorkdaysSection = sourceSection(
    workdayService,
    'export async function getWorkdays',
    'export async function getWorkerTime',
  )
  assert.match(workdayService, /async function fetchFastBackupCyclesPage/)
  assert.match(getWorkdaysSection, /fetchFastBackupCyclesPage\(orgId, filters\)/)
  assert.match(getWorkdaysSection, /throw pagedReadUnavailableError\('kopii cykli'\)/)
  assert.doesNotMatch(workdayService, /\bbackupCyclesForOrg\b/)

  for (const [operationName, collection, key] of [
    ['IndividualJobsPageForOrg', 'individualClientJobs', 'clientIndId'],
    ['BackupCyclesPageForOrg', 'backupCycles', 'cycleId'],
    ['WorkdayPausesPageForOrg', 'workdayPauses', 'pauseId'],
  ]) {
    const pattern = new RegExp(
      `query ${operationName}\\([^)]*\\$limit: Int, \\$offset: Int\\)[\\s\\S]*?${collection}\\([\\s\\S]*?limit: \\$limit[\\s\\S]*?offset: \\$offset[\\s\\S]*?${key}`,
    )
    assert.match(queries, pattern)
    assert.match(policy, new RegExp(`'${operationName}'`))
  }
})

test('polling zdarzeń jest ograniczony i nie pracuje w ukrytej karcie', () => {
  const events = readPortalFile('features', 'events', 'index.js')
  assert.match(events, /const EVENTS_REFRESH_POLL_MS = 60000/)
  assert.match(events, /document\.visibilityState === 'hidden'/)
  assert.match(events, /workerLogin:\s*String\(payload\?\.workerLogin/)
  assert.match(events, /pageSize:\s*EVENTS_OVERLAP_READ_MAX_ROWS/)
})

test('operacje paginowane wymagane przez bezpieczny odczyt są dozwolone na backendzie', () => {
  const policy = fs.readFileSync(path.join(repoRoot, 'platform-policy.js'), 'utf8')
  ;[
    'WorkdaysPageForOrg',
    'WorkdaysPageForOrgByWorker',
    'WorkdaysIntegrityPageForOrg',
    'EventsPageForOrg',
    'EventsPageForOrgByWorker',
    'EventsIntegrityPageForOrg',
  ].forEach((operationName) => {
    assert.match(policy, new RegExp(`'${operationName}'`))
  })
})
