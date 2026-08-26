'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  createWorkdayReconciliationApi,
  mapWorkdayReconciliationError,
  parseWorkdayReconciliationPath,
} = require('../workday-reconciliation-api')

function apiFixture({ body = {}, repository = null, token = 'TOKEN' } = {}) {
  const responses = []
  const errors = []
  const calls = []
  const repo = repository || {
    async read(input) {
      calls.push({ method: 'read', input })
      return {
        businessDateYmd: '2026-07-23',
        workday: { workdayId: input.workdayId, workerLogin: 'W034', startAt: '2026-07-23T06:00:00Z' },
      }
    },
  }
  const api = createWorkdayReconciliationApi({
    async authorize() { return { scope: 'ALL' } },
    async connectDbClient() { return { release() { calls.push({ method: 'release' }) } } },
    createDayRepository() {
      return {
        async read(input) {
          calls.push({ method: 'day-read', input })
          return { businessDateYmd: input.businessDateYmd, integrityState: 'COMPLETE', workerLogin: input.workerLogin }
        },
      }
    },
    createRepository() { return repo },
    parseBearerToken() { return token },
    async readJsonBody() { return body },
    sendApiError(_res, status, code, message, details) { errors.push({ status, code, message, details }) },
    sendJson(_res, status, payload) { responses.push({ status, payload }) },
    async verifyFirebaseIdToken() { return { uid: 'UID-1' } },
  })
  return { api, calls, errors, responses }
}

test('parser dopasowuje tylko kanoniczna sciezke reconciliation', () => {
  assert.equal(parseWorkdayReconciliationPath('/api/portal/workdays/WD-23/reconciliation'), 'WD-23')
  assert.equal(parseWorkdayReconciliationPath('/api/portal/workdays/WD%2023/reconciliation/'), 'WD 23')
  assert.equal(parseWorkdayReconciliationPath('/api/portal/workdays/WD-23'), null)
})

test('GET zwraca uzgodniony kontrakt top-level bez opakowania data', async () => {
  const fixture = apiFixture()
  const requestUrl = new URL('http://localhost/api/portal/workdays/WD-23/reconciliation?orgId=ORG-1')
  await fixture.api.handle({ method: 'GET' }, {}, requestUrl)

  assert.equal(fixture.errors.length, 0)
  assert.deepEqual(fixture.responses, [{
    status: 200,
    payload: { ok: true, reconciliation: { businessDateYmd: '2026-07-23', integrityState: 'COMPLETE', workerLogin: 'W034', legacyWorkdayId: 'WD-23' } },
  }])
  assert.deepEqual(fixture.calls[0], {
    method: 'read',
    input: { orgId: 'ORG-1', uid: 'UID-1', workdayId: 'WD-23' },
  })
  assert.deepEqual(fixture.calls[1], {
    method: 'day-read',
    input: { orgId: 'ORG-1', uid: 'UID-1', workerLogin: 'W034', businessDateYmd: '2026-07-23' },
  })
})

test('POST starego endpointu jest wyłączony i wskazuje nowy model dnia', async () => {
  const body = {
    orgId: 'ORG-1',
    expectedUpdatedAt: '2026-07-23T20:00:00.000Z',
    idempotencyKey: 'repair-key-1',
    reason: 'Korekta STOP',
    sessionCorrections: [],
    finalize: true,
  }
  const fixture = apiFixture({ body })
  const requestUrl = new URL('http://localhost/api/portal/workdays/WD-23/reconciliation')
  await fixture.api.handle({ method: 'POST' }, {}, requestUrl)

  assert.equal(fixture.responses.length, 0)
  assert.equal(fixture.errors[0].status, 405)
  assert.equal(fixture.errors[0].code, 'LEGACY_WORKDAY_WRITE_DISABLED')
  assert.equal(fixture.calls.length, 0)
})

test('POST jest odrzucany przed odczytem body i połączeniem z repozytorium', async () => {
  const fixture = apiFixture({ body: { orgId: 'ORG-2' } })
  const requestUrl = new URL('http://localhost/api/portal/workdays/WD-23/reconciliation?orgId=ORG-1')
  await fixture.api.handle({ method: 'POST' }, {}, requestUrl)

  assert.equal(fixture.responses.length, 0)
  assert.equal(fixture.errors[0].status, 405)
  assert.equal(fixture.errors[0].code, 'LEGACY_WORKDAY_WRITE_DISABLED')
  assert.equal(fixture.calls.length, 0)
})

test('brak tokenu i niedozwolona metoda maja stabilne odpowiedzi', async () => {
  const withoutToken = apiFixture({ token: '' })
  const url = new URL('http://localhost/api/portal/workdays/WD-23/reconciliation?orgId=ORG-1')
  await withoutToken.api.handle({ method: 'GET' }, {}, url)
  assert.equal(withoutToken.errors[0].status, 401)

  const wrongMethod = apiFixture()
  await wrongMethod.api.handle({ method: 'DELETE' }, {}, url)
  assert.equal(wrongMethod.errors[0].status, 405)
})

test('brak tabeli lub kolumny mapuje sie na jawne 503', () => {
  for (const code of ['42P01', '42703']) {
    const mapped = mapWorkdayReconciliationError({ code })
    assert.equal(mapped.statusCode, 503)
    assert.equal(mapped.code, 'WORKDAY_RECONCILIATION_SCHEMA_MISSING')
  }
})

test('backend pozwala pracownikowi tylko odczytac wlasny dzien, a korekty ogranicza do administracji', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')
  const start = source.indexOf('async function authorizeWorkdayReconciliation')
  const end = source.indexOf('\nfunction assertMembershipPlanCapability', start)
  const authorizeSource = source.slice(start, end)

  assert.ok(start >= 0 && end > start)
  assert.match(authorizeSource, /role === 'COORDINATOR'\s*&&\s*write !== true/)
  assert.match(authorizeSource, /role === 'WORKER'\s*&&\s*write !== true/)
  assert.match(authorizeSource, /scope:\s*'OWN'/)
})
