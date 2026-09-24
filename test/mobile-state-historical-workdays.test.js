'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')

function functionSource(name, nextName) {
  const start = source.indexOf(`async function ${name}`)
  assert.notEqual(start, -1, `Nie znaleziono funkcji ${name}`)
  const end = source.indexOf(`async function ${nextName}`, start + 1)
  assert.notEqual(end, -1, `Nie znaleziono granicy ${nextName}`)
  return source.slice(start, end)
}

function loadStateActiveWorkdayReader() {
  const body = functionSource('fetchMobileStateActiveWorkday', 'fetchMobileWorkdays')
  return new Function(`${body}\nreturn fetchMobileStateActiveWorkday;`)()
}

function loadWorkdayHistoryReader() {
  const body = functionSource('fetchMobileWorkdays', 'fetchMobileWorkdayStopProposals')
  return new Function('mapMobileWorkdayRow', `${body}\nreturn fetchMobileWorkdays;`)((row) => ({
    workdayId: row.workday_id,
    workerLogin: row.worker_login,
    startAt: row.start_at,
    status: row.status,
    endAt: row.end_at,
  }))
}

function loadMobileStateHandler(dependencies) {
  const body = functionSource('handleMobileWorkflowRequest', 'databaseRelationExists')
  const names = Object.keys(dependencies)
  return new Function(...names, `${body}\nreturn handleMobileWorkflowRequest;`)(...names.map((name) => dependencies[name]))
}

test('POST /api/mobile/state odpowiada HTTP 200 ze snapshotem mimo wielu historycznych RUNNING', async () => {
  const historicalWorkdays = [
    { workdayId: 'WD-HISTORY-1', status: 'RUNNING', endAt: null, stopProposal: { proposalId: 'WSP-1', status: 'PENDING' } },
    { workdayId: 'WD-HISTORY-2', status: 'RUNNING', endAt: null, stopProposal: null },
  ]
  const queries = []
  let transactionActive = false
  const client = {
    query: async (...args) => {
      queries.push(args)
      const sql = String(args[0] || '').trim().toLowerCase()
      if (sql === 'begin transaction read only') {
        transactionActive = true
      } else if (sql.startsWith('savepoint ')) {
        if (!transactionActive) {
          const error = new Error('SAVEPOINT can only be used in transaction blocks')
          error.code = '25P01'
          throw error
        }
      } else if (sql === 'commit' || sql === 'rollback') {
        assert.equal(transactionActive, true)
        transactionActive = false
      }
      return { rows: [] }
    },
    release: () => {},
  }
  const response = {}
  const handler = loadMobileStateHandler({
    MOBILE_STATE_PATH: '/api/mobile/state',
    MOBILE_SCAN_PATH: '/api/mobile/scan',
    MOBILE_JOB_CARDS_PATH: '/api/mobile/job-cards',
    withSecurityHeaders: (headers) => headers,
    sendMobileApiError: (_res, status, code, message) => { throw new Error(`${status}:${code}:${message}`) },
    readJsonBody: async () => ({}),
    parseBearerToken: () => 'firebase-token',
    verifyFirebaseIdToken: async () => ({ uid: 'firebase-worker-one' }),
    mapFirebaseAdminError: () => ({ status: 401, code: 'UNAUTHENTICATED', message: 'bad token' }),
    normalizeOrgId: (value) => String(value || '').trim().toUpperCase(),
    connectDbClient: async () => client,
    resolveMobileOrganizationFromToken: async (_client, _token, requestedOrgId) => {
      assert.equal(requestedOrgId, '')
      return { orgId: 'ORG-ONE', membership: { org_id: 'ORG-ONE' } }
    },
    assertMobileRequester: async () => { throw new Error('state must not use body orgId') },
    resolveMobileWorker: async (_client, orgId) => {
      assert.equal(orgId, 'ORG-ONE')
      return { workerId: 'WORKER-ONE', login: 'worker.one' }
    },
    processMobileWorkflowScan: async () => { throw new Error('state must not scan') },
    readPublishedMobileJobCards: async () => { throw new Error('state must not load job cards') },
    buildMobileSnapshotFromDb: async (_client, orgId, worker) => {
      assert.equal(orgId, 'ORG-ONE')
      assert.equal(worker.login, 'worker.one')
      await _client.query('savepoint mobile_pause_lookup')
      await _client.query('release savepoint mobile_pause_lookup')
      return { orgId, worker, workdays: historicalWorkdays }
    },
    sendMobileJson: (res, status, payload) => { res.result = { status, payload } },
    mapDatabaseConnectionError: () => null,
    mapMobileIntegrityDatabaseError: () => null,
    normalizeText: (value) => String(value || '').trim(),
    publicErrorDetails: () => null,
  })

  await handler(
    { method: 'POST', headers: { authorization: 'Bearer firebase-token' } },
    response,
    new URL('https://portal.example/api/mobile/state'),
  )

  assert.equal(response.result.status, 200)
  assert.deepEqual(response.result.payload.snapshot.workdays, historicalWorkdays)
  assert.deepEqual(queries.map(([sql]) => sql), [
    'begin transaction read only',
    'savepoint mobile_pause_lookup',
    'release savepoint mobile_pause_lookup',
    'commit',
  ])
  assert.equal(transactionActive, false)
})

test('POST /api/mobile/state nie używa blokady QR dla historii i nie blokuje wielu historycznych RUNNING', async () => {
  const snapshot = functionSource('buildMobileSnapshotFromDb', 'closeMobileEvent')
  const reader = loadStateActiveWorkdayReader()
  const queries = []
  const active = await reader(
    {
      query: async (sql, params) => {
        queries.push({ sql, params })
        return { rows: [] }
      },
    },
    'ORG-ONE',
    'worker.one',
  )

  assert.equal(active, null)
  assert.match(snapshot, /: await fetchMobileStateActiveWorkday\(client, orgId, worker\.login\)/)
  assert.doesNotMatch(snapshot, /const activeWorkdayRaw = await fetchActiveMobileWorkday/)
  assert.equal(queries.length, 1)
  assert.match(queries[0].sql, /where org_id = \$1/i)
  assert.match(queries[0].sql, /lower\(btrim\(worker_login\)\) = lower\(btrim\(\$2\)\)/i)
  assert.match(queries[0].sql, /w\.start_at is null/i)
  assert.doesNotMatch(queries[0].sql, /for update/i)
  assert.deepEqual(queries[0].params, ['ORG-ONE', 'worker.one'])
})

test('snapshot.workdays zwraca historyczny dzień bez STOP nawet przy statusie CLOSED, wyłącznie dla tokenowego orgId i pracownika', async () => {
  const reader = loadWorkdayHistoryReader()
  const rows = [
    { org_id: 'ORG-ONE', workday_id: 'WD-HISTORY-CLOSED-NO-STOP', worker_login: 'worker.one', start_at: '2026-08-05T09:15:00.000Z', status: 'CLOSED', end_at: null },
    { org_id: 'ORG-ONE', workday_id: 'WD-HISTORY-RUNNING-NO-STOP', worker_login: 'worker.one', start_at: '2026-08-04T17:12:00.000Z', status: 'RUNNING', end_at: null },
    { org_id: 'ORG-TWO', workday_id: 'WD-OTHER-ORG', worker_login: 'worker.one', start_at: '2026-08-05T09:15:00.000Z', status: 'CLOSED', end_at: null },
    { org_id: 'ORG-ONE', workday_id: 'WD-OTHER-WORKER', worker_login: 'worker.two', start_at: '2026-08-05T09:15:00.000Z', status: 'CLOSED', end_at: null },
  ]
  let observedQuery = null
  const snapshotWorkdays = await reader(
    {
      query: async (sql, [orgId, workerLogin]) => {
        observedQuery = sql
        return {
          rows: rows.filter((row) => row.org_id === orgId && row.worker_login.toLowerCase() === workerLogin.toLowerCase()),
        }
      },
    },
    'ORG-ONE',
    'worker.one',
  )

  assert.deepEqual(snapshotWorkdays, [
    {
      workdayId: 'WD-HISTORY-CLOSED-NO-STOP',
      workerLogin: 'worker.one',
      startAt: '2026-08-05T09:15:00.000Z',
      status: 'CLOSED',
      endAt: null,
    },
    {
      workdayId: 'WD-HISTORY-RUNNING-NO-STOP',
      workerLogin: 'worker.one',
      startAt: '2026-08-04T17:12:00.000Z',
      status: 'RUNNING',
      endAt: null,
    },
  ])
  assert.match(observedQuery, /where org_id = \$1/i)
  assert.match(observedQuery, /lower\(worker_login\) = lower\(\$2\)/i)
  assert.doesNotMatch(observedQuery, /\bstatus\s*(?:=|<>|!=|is)\b/i)
  assert.doesNotMatch(observedQuery, /\bend_at\s*(?:=|<>|!=|is)\b/i)
})

test('snapshot dołącza tylko własną, zawężoną stopProposal do zwróconego Workday', () => {
  const snapshot = functionSource('buildMobileSnapshotFromDb', 'closeMobileEvent')
  const proposals = functionSource('fetchMobileWorkdayStopProposals', 'fetchOpenMobileCycles')

  assert.match(snapshot, /if \(!persistRuntimeState\) \{\s*const stopProposalsByWorkdayId = await fetchMobileWorkdayStopProposals\(client, orgId, worker\.workerId, mobileWorkdays\)/s)
  assert.match(snapshot, /workday\.stopProposal = stopProposalsByWorkdayId\.get\(workday\.workdayId\) \|\| null/)
  assert.match(proposals, /p\.org_id = \$1::text/)
  assert.match(proposals, /p\.worker_id = \$2::text/)
  assert.match(proposals, /p\.workday_id = any\(\$3::text\[\]\)/)
})
