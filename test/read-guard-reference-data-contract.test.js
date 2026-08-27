'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { pathToFileURL } = require('node:url')

const root = path.join(__dirname, '..')
const portalRoot = path.join(root, 'web-app', 'apps', 'portal-web', 'src')
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8')

async function readPolicy() {
  const file = path.join(portalRoot, 'services', 'referenceDataReadPolicy.js')
  return import(`${pathToFileURL(file).href}?test=${Date.now()}-${Math.random()}`)
}

async function readWorkdayPolicy() {
  const file = path.join(portalRoot, 'services', 'workdayReadCostPolicy.js')
  return import(`${pathToFileURL(file).href}?test=${Date.now()}-${Math.random()}`)
}

test('reader referencyjny pobiera deterministyczne strony i odrzuca katalog powyżej limitu', async () => {
  const { fetchAllReferenceRows } = await readPolicy()
  const source = Array.from({ length: 620 }, (_, index) => ({ clientId: `C${String(index).padStart(4, '0')}` }))
  const calls = []
  const rows = await fetchAllReferenceRows({
    loadPage: async ({ limit, offset }) => {
      calls.push({ limit, offset })
      return { data: { clients: source.slice(offset, offset + limit) } }
    },
    listKey: 'clients',
    keyFields: 'clientId',
    label: 'klientów',
  })

  assert.equal(rows.length, 620)
  assert.deepEqual(calls, [
    { limit: 250, offset: 0 },
    { limit: 250, offset: 250 },
    { limit: 250, offset: 500 },
  ])

  await assert.rejects(
    fetchAllReferenceRows({
      loadPage: async ({ limit, offset }) => ({ data: { clients: source.slice(offset, offset + limit) } }),
      listKey: 'clients',
      keyFields: 'clientId',
      label: 'klientów',
      pageSize: 2,
      maxRecords: 3,
    }),
    (error) => error?.code === 'REFERENCE_DATA_READ_LIMIT',
  )
})

test('legacy reference fallback działa tylko lokalnie i może być jawnie wyłączony', async () => {
  const { isLocalReferenceReadFallbackEnabled } = await readPolicy()

  assert.equal(isLocalReferenceReadFallbackEnabled({ dev: true }), true)
  assert.equal(isLocalReferenceReadFallbackEnabled({ dev: true, enabled: '1' }), true)
  assert.equal(isLocalReferenceReadFallbackEnabled({ dev: true, enabled: 'false' }), false)
  assert.equal(isLocalReferenceReadFallbackEnabled({ dev: false, enabled: 'true' }), false)
})

test('konektor read-guard jest równoległy, zawiera wyłącznie ograniczone odczyty i ma własny SDK', () => {
  const config = read('dataconnect', 'read-guard-dry-run', 'dataconnect.yaml')
  const connector = read('dataconnect', 'read-guard-dry-run', 'connectors', 'read-guard', 'connector.yaml')
  const queries = read('dataconnect', 'read-guard-dry-run', 'connectors', 'read-guard', 'read-guard-pages.gql')
  const generated = read('web-app', 'apps', 'portal-web', 'src', 'dataconnect-read-guard-generated', 'index.d.ts')

  assert.match(config, /connectorDirs:\s*\n\s*- connectors\/read-guard/)
  assert.match(connector, /connectorId: read-guard/)
  assert.match(connector, /@dataconnect\/read-guard-generated/)

  for (const operation of [
    'WorkersPageForOrg',
    'WorkerForOrgByLogin',
    'ClientsPageForOrg',
    'ZonesPageForOrg',
    'BackupCyclesPageForOrg',
    'WorkdayPausesPageForOrg',
  ]) {
    assert.match(queries, new RegExp(`query ${operation}\\(`))
    assert.match(generated, new RegExp(`function ${operation[0].toLowerCase()}${operation.slice(1)}\\(`))
  }

  assert.doesNotMatch(queries, /\b(?:EventsForOrg|WorkdaysForOrg|IndividualClientJob|photoUrl)\b/)
})

test('sesja platformowa kieruje wyłącznie nowe strony do konektora read-guard', () => {
  const {
    isAllowedPlatformOperation,
    resolvePlatformDataConnectConnector,
  } = require(path.join(root, 'platform-policy.js'))

  assert.equal(isAllowedPlatformOperation('query', 'ClientsPageForOrg'), true)
  assert.equal(resolvePlatformDataConnectConnector('query', 'ClientsPageForOrg', 'example'), 'read-guard')
  assert.equal(resolvePlatformDataConnectConnector('query', 'ClientsForOrg', 'example'), 'example')
  assert.equal(resolvePlatformDataConnectConnector('mutation', 'InsertClientForOrg', 'example'), 'example')

  const backend = read('index.js')
  assert.match(backend, /resolvePlatformDataConnectConnector\(kind, operationName, DATACONNECT_CONNECTOR\)/)
  assert.match(backend, /connector,\s*\n\s*}\)/)
})

test('portal tworzy osobną instancję read-guard dla bezpośrednich odczytów', () => {
  const firebaseClient = read('web-app', 'apps', 'portal-web', 'src', 'firebase', 'firebaseClient.js')
  const gateway = read('web-app', 'apps', 'portal-web', 'src', 'services', 'platformDataConnectService.js')

  assert.match(firebaseClient, /connectorConfig as readGuardConnectorConfig/)
  assert.match(firebaseClient, /const readGuardDataConnect = isDataConnectConfigured\(\)/)
  assert.match(firebaseClient, /readGuardDataConnect,\s*\n\s*}/)
  assert.match(gateway, /function wrapReadGuard\(/)

  for (const operation of [
    'WorkersPageForOrg',
    'WorkerForOrgByLogin',
    'ClientsPageForOrg',
    'ZonesPageForOrg',
    'BackupCyclesPageForOrg',
    'WorkdayPausesPageForOrg',
  ]) {
    assert.match(gateway, new RegExp(`wrapReadGuard\\('query', '${operation}'`))
  }
})

test('klienci i strefy używają stron, a lista pracowników zachowuje bezpośredni odczyt ze zdjęciem', () => {
  const clientService = read('web-app', 'apps', 'portal-web', 'src', 'services', 'clientService.js')
  const zoneService = read('web-app', 'apps', 'portal-web', 'src', 'services', 'zoneService.js')
  const workerService = read('web-app', 'apps', 'portal-web', 'src', 'services', 'workerService.js')

  for (const [source, operation] of [
    [clientService, 'clientsPageForOrg'],
    [zoneService, 'zonesPageForOrg'],
  ]) {
    assert.match(source, /const READ_CACHE_MS = 5 \* 60 \* 1000/)
    assert.match(source, new RegExp(`fetchAllReferenceRows\\([\\s\\S]*?${operation}`))
    assert.match(source, /createReferenceReadUnavailableError/)
    assert.match(source, /isLocalReferenceReadFallbackEnabled\(\{[\s\S]*?dev: import\.meta\.env\.DEV/)
  }

  assert.match(clientService, /const response = await clientsForOrg\(\{ orgId \}\)/)
  assert.match(zoneService, /const response = await zonesForOrg\(\{ orgId \}\)/)
  assert.match(workerService, /const READ_CACHE_MS = 5 \* 60 \* 1000/)
  assert.match(workerService, /const response = await workersList\(orgId\)/)
  assert.doesNotMatch(workerService, /workersPageForOrg/)
})

test('normal event view does not fetch backup cycles as a hidden fallback', () => {
  const workdayService = read('web-app', 'apps', 'portal-web', 'src', 'services', 'workdayService.js')
  const start = workdayService.indexOf('async function fetchMappedEvents(orgId)')
  const end = workdayService.indexOf('export async function getWorkdays(orgId, filters = {})')

  assert.ok(start >= 0 && end > start)
  const normalEventsReader = workdayService.slice(start, end)
  assert.doesNotMatch(normalEventsReader, /getMappedBackupCyclesForOrg|BackupCyclesForOrg|mappedBackupCycles/)
  assert.match(workdayService, /source === 'backupcycle'[\s\S]*?fetchFastBackupCyclesPage\(orgId, filters\)/)
  assert.doesNotMatch(workdayService, /source === 'backupcycle'[\s\S]*?getMappedBackupCyclesForOrg\(orgId\)/)
})

test('linked event deletion uses bounded integrity pages and fails closed', async () => {
  const { WORKDAY_READ_MAX_CHUNK_SIZE, WORKDAY_READ_MAX_RECORDS, isPagedReadSafetyError } = await readWorkdayPolicy()
  const workdayService = read('web-app', 'apps', 'portal-web', 'src', 'services', 'workdayService.js')
  const start = workdayService.indexOf('async function findEventIdsLinkedToWorkday')
  const end = workdayService.indexOf('export async function deleteEvent', start)

  assert.equal(WORKDAY_READ_MAX_CHUNK_SIZE, 250)
  assert.equal(WORKDAY_READ_MAX_RECORDS, 20000)
  assert.equal(isPagedReadSafetyError({ code: 'PAGED_READ_LIMIT_EXCEEDED' }), true)
  assert.ok(start >= 0 && end > start)
  const linkedEventReader = workdayService.slice(start, end)
  assert.match(linkedEventReader, /EventsIntegrityPageForOrg/)
  assert.match(linkedEventReader, /WORKDAY_READ_MAX_CHUNK_SIZE/)
  assert.match(linkedEventReader, /WORKDAY_READ_MAX_RECORDS/)
  assert.doesNotMatch(linkedEventReader, /EventsForOrg/)
  assert.match(workdayService, /if \(isPagedReadSafetyError\(error\)\) \{\s*throw error/)
})

test('daily polling fingerprint uses complete bounded pages for the current day', () => {
  const workdayService = read('web-app', 'apps', 'portal-web', 'src', 'services', 'workdayService.js')
  const start = workdayService.indexOf('async function fetchCompleteDailyFingerprintRows')
  const end = workdayService.indexOf('export async function getEventsFingerprintForOrg', start)

  assert.ok(start >= 0 && end > start)
  const fingerprintReader = workdayService.slice(start, end)
  assert.match(workdayService, /WORKDAY_DAILY_READ_MAX_ROWS = 5000/)
  assert.match(fingerprintReader, /WorkdaysPageForOrg/)
  assert.match(fingerprintReader, /EventsPageForOrg/)
  assert.match(fingerprintReader, /WORKDAY_READ_MAX_CHUNK_SIZE/)
  assert.match(fingerprintReader, /createPagedReadLimitError/)
  assert.doesNotMatch(fingerprintReader, /getRawWorkdaysForOrg|getRawEventsForOrg|WorkdaysForOrg|EventsForOrg/)
  assert.match(workdayService, /23:59:59\.999/)
})

test('normal screens keep paged reads bounded and reject incomplete responses', () => {
  const workdayService = read('web-app', 'apps', 'portal-web', 'src', 'services', 'workdayService.js')
  const dashboard = read('web-app', 'apps', 'portal-web', 'src', 'features', 'dashboard', 'index.js')
  const calendar = read('web-app', 'apps', 'portal-web', 'src', 'features', 'calendar', 'index.js')
  const events = read('web-app', 'apps', 'portal-web', 'src', 'features', 'events', 'index.js')
  const reports = read('web-app', 'apps', 'portal-web', 'src', 'features', 'reports', 'index.js')
  const workerAccount = read('web-app', 'apps', 'portal-web', 'src', 'features', 'workers', 'account', 'index.js')
  const workerTimeDetail = read('web-app', 'apps', 'portal-web', 'src', 'features', 'workers', 'time-detail', 'index.js')

  assert.match(workdayService, /filters\.allowLegacyFullOrgFallback !== true/)
  assert.match(dashboard, /DASHBOARD_RANGE_READ_MAX_ROWS = 4000/)
  assert.match(dashboard, /DASHBOARD_DAY_READ_MAX_ROWS = 2000/)
  assert.match(dashboard, /dashboardAssertCompleteReadResponses/)
  assert.doesNotMatch(dashboard, /pageSize: (?:8000|12000)/)
  assert.match(calendar, /workerStatePageSize = 2000/)
  assert.match(calendar, /assertCompletePagedResponse\(eventsResponse/)
  assert.match(calendar, /assertCompletePagedResponse\(workdaysResponse/)
  assert.doesNotMatch(calendar, /pageSize: 8000/)
  assert.match(events, /document\.visibilityState === 'hidden'/)
  assert.doesNotMatch(reports, /source:\s*'backupcycle'/)
  assert.doesNotMatch(workerAccount, /const broadResponse =|const broadResponses =/)
  assert.match(workerTimeDetail, /WORKER_DETAIL_READ_MAX_ROWS = 2000/)
  assert.match(workerTimeDetail, /assertCompletePagedResponse\(response, 'ewidencji czasu pracownika'\)/)
})
