'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { pathToFileURL } = require('node:url')

const repoRoot = path.join(__dirname, '..')
const policyPath = path.join(
  repoRoot,
  'web-app',
  'apps',
  'portal-web',
  'src',
  'services',
  'referenceDataReadPolicy.js',
)

async function readPolicy() {
  return import(`${pathToFileURL(policyPath).href}?test=${Date.now()}-${Math.random()}`)
}

test('reference directory reader paginates with bounded deterministic offsets', async () => {
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
    label: 'clients',
  })

  assert.equal(rows.length, 620)
  assert.deepEqual(calls, [
    { limit: 250, offset: 0 },
    { limit: 250, offset: 250 },
    { limit: 250, offset: 500 },
  ])
})

test('reference directory reader probes an exact limit and fails closed above it', async () => {
  const { fetchAllReferenceRows } = await readPolicy()
  const source = Array.from({ length: 4 }, (_, index) => ({ zoneId: `Z${index}` }))
  const loadPage = async ({ limit, offset }) => ({ data: { zones: source.slice(offset, offset + limit) } })

  await assert.rejects(
    fetchAllReferenceRows({
      loadPage,
      listKey: 'zones',
      keyFields: 'zoneId',
      label: 'zones',
      pageSize: 2,
      maxRecords: 3,
    }),
    (error) => error?.code === 'REFERENCE_DATA_READ_LIMIT' && error?.maxRecords === 3,
  )

  const exactRows = await fetchAllReferenceRows({
    loadPage: async ({ limit, offset }) => ({ data: { zones: source.slice(0, 3).slice(offset, offset + limit) } }),
    listKey: 'zones',
    keyFields: 'zoneId',
    label: 'zones',
    pageSize: 2,
    maxRecords: 3,
  })
  assert.equal(exactRows.length, 3)
})

test('reference directory reader rejects malformed responses and missing keys', async () => {
  const { fetchAllReferenceRows } = await readPolicy()

  await assert.rejects(
    fetchAllReferenceRows({
      loadPage: async () => ({ data: {} }),
      listKey: 'workers',
      keyFields: 'login',
      label: 'workers',
    }),
    (error) => error?.code === 'REFERENCE_DATA_RESPONSE_INVALID',
  )

  await assert.rejects(
    fetchAllReferenceRows({
      loadPage: async () => ({ data: { workers: [{ login: '' }] } }),
      listKey: 'workers',
      keyFields: 'login',
      label: 'workers',
    }),
    (error) => error?.code === 'REFERENCE_DATA_KEY_MISSING',
  )
})

test('new reference operations are additive, paginated, generated and platform-allowed', () => {
  const queries = fs.readFileSync(
    path.join(repoRoot, 'dataconnect', 'connectors', 'example', 'queries.gql'),
    'utf8',
  )
  const generated = fs.readFileSync(
    path.join(repoRoot, 'web-app', 'apps', 'portal-web', 'src', 'dataconnect-generated', 'index.d.ts'),
    'utf8',
  )
  const { PLATFORM_QUERY_ALLOWLIST } = require(path.join(repoRoot, 'platform-policy.js'))

  for (const [operationName, orderField] of [
    ['WorkersPageForOrg', 'login'],
    ['ClientsPageForOrg', 'clientId'],
    ['ZonesPageForOrg', 'zoneId'],
  ]) {
    const operationPattern = new RegExp(
      `query ${operationName}\\([^)]*\\$limit: Int, \\$offset: Int\\)[\\s\\S]*?limit: \\$limit[\\s\\S]*?offset: \\$offset[\\s\\S]*?orderBy: \\[\\{ ${orderField}: ASC \\}\\]`,
    )
    assert.match(queries, operationPattern)
    assert.equal(PLATFORM_QUERY_ALLOWLIST.has(operationName), true)
    assert.match(generated, new RegExp(`function ${operationName[0].toLowerCase()}${operationName.slice(1)}\\(`))
  }

  assert.match(queries, /query WorkerForOrgByLogin\([^)]*\$workerLogin: String!\)/)
  assert.equal(PLATFORM_QUERY_ALLOWLIST.has('WorkerForOrgByLogin'), true)
  assert.match(generated, /function workerForOrgByLogin\(/)
})

test('operacje backupu mają paginowane kontrakty SDK i platformy', () => {
  const queries = fs.readFileSync(
    path.join(repoRoot, 'dataconnect', 'connectors', 'example', 'queries.gql'),
    'utf8',
  )
  const generated = fs.readFileSync(
    path.join(repoRoot, 'web-app', 'apps', 'portal-web', 'src', 'dataconnect-generated', 'index.d.ts'),
    'utf8',
  )
  const { PLATFORM_QUERY_ALLOWLIST } = require(path.join(repoRoot, 'platform-policy.js'))

  for (const [operationName, collection] of [
    ['IndividualJobsPageForOrg', 'individualClientJobs'],
    ['BackupCyclesPageForOrg', 'backupCycles'],
    ['WorkdayPausesPageForOrg', 'workdayPauses'],
  ]) {
    const operationPattern = new RegExp(
      `query ${operationName}\\([^)]*\\$limit: Int, \\$offset: Int\\)[\\s\\S]*?${collection}\\([\\s\\S]*?limit: \\$limit[\\s\\S]*?offset: \\$offset`,
    )
    assert.match(queries, operationPattern)
    assert.equal(PLATFORM_QUERY_ALLOWLIST.has(operationName), true)
    assert.match(generated, new RegExp(`function ${operationName[0].toLowerCase()}${operationName.slice(1)}\\(`))
  }
})

test('portal services use paged reference readers with legacy calls only as compatibility fallback', () => {
  const clientService = fs.readFileSync(
    path.join(repoRoot, 'web-app', 'apps', 'portal-web', 'src', 'services', 'clientService.js'),
    'utf8',
  )
  const zoneService = fs.readFileSync(
    path.join(repoRoot, 'web-app', 'apps', 'portal-web', 'src', 'services', 'zoneService.js'),
    'utf8',
  )
  const backupService = fs.readFileSync(
    path.join(repoRoot, 'web-app', 'apps', 'portal-web', 'src', 'services', 'backupService.js'),
    'utf8',
  )
  const backend = fs.readFileSync(path.join(repoRoot, 'index.js'), 'utf8')

  assert.match(clientService, /fetchAllReferenceRows\([\s\S]*?clientsPageForOrg/)
  assert.match(zoneService, /fetchAllReferenceRows\([\s\S]*?zonesPageForOrg/)
  assert.match(backupService, /fetchWorkerRows\(orgId\)/)
  assert.match(backupService, /fetchClientRows\(orgId\)/)
  assert.match(backupService, /fetchZoneRows\(orgId\)/)
  assert.match(backend, /queryWorkerForOrgByLoginViaDataConnect/)
  assert.match(backend, /isDataConnectOperationNotFoundError\(error, 'WorkerForOrgByLogin'\)/)
})
