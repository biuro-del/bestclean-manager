'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  createMobileCoordinatorZoneApi,
  normalizePatchPayload,
} = require('../mobile-coordinator-zone-api')

function response() {
  return {
    status: 0,
    body: null,
    headers: null,
    writeHead(status, headers) { this.status = status; this.headers = headers || null },
    end() {},
  }
}

function createHarness({
  enabled = true,
  allowed = true,
  method = 'GET',
  payload = {},
  membershipRole = 'WORKER',
  workerType = 'Koordynator',
  query,
  token = 'firebase-token',
} = {}) {
  const calls = { connected: 0, released: 0, queries: [], resolved: 0 }
  const client = {
    async query(sql, params) {
      calls.queries.push({ sql: String(sql), params })
      if (query) return query(String(sql), params)
      if (/from public\.client/.test(sql)) return { rows: [] }
      if (/from public\.zone/.test(sql)) return { rows: [] }
      return { rows: [] }
    },
    release() { calls.released += 1 },
  }
  const api = createMobileCoordinatorZoneApi({
    async connectDbClient() { calls.connected += 1; return client },
    isEnabled() { return enabled },
    isOrganizationAllowed() { return allowed },
    mapDatabaseConnectionError() { return null },
    mapFirebaseAdminError() { return { status: 401, code: 'UNAUTHENTICATED' } },
    parseBearerToken() { return token },
    async readJsonBody() { return payload },
    async resolveSession() {
      calls.resolved += 1
      return {
        orgId: 'bestclean',
        membership: { role: membershipRole },
        worker: { login: 'koordynator@bestclean.pl', role: membershipRole, type: workerType },
      }
    },
    sendMobileApiError(res, status, code, message) { res.status = status; res.body = { ok: false, error: { code, message } } },
    sendMobileJson(res, status, body) { res.status = status; res.body = body },
    async verifyFirebaseIdToken() { return { uid: 'firebase-uid' } },
  })
  return { api, calls, request: { method, headers: {} } }
}

test('disabled route fails before auth and database access', async () => {
  const { api, calls, request } = createHarness({ enabled: false })
  const res = response()
  await api.handle(request, res)
  assert.equal(res.status, 404)
  assert.equal(res.body.error.code, 'MOBILE_COORDINATOR_QR_DISABLED')
  assert.equal(calls.connected, 0)
})

test('GET derives org and coordinator from the verified session and returns scoped context', async () => {
  const { api, calls, request } = createHarness({
    query(sql, params) {
      assert.deepEqual(params, ['bestclean'])
      if (/from public\.client/.test(sql)) return { rows: [{ client_id: 'C-1', name: 'Best Clean' }] }
      if (/from public\.zone/.test(sql)) return { rows: [{ id: 'QR-1', client_id: 'C-1', zone: 'Biuro', function: 'clean' }] }
      return { rows: [] }
    },
  })
  const res = response()
  await api.handle(request, res)
  assert.equal(res.status, 200)
  assert.equal(res.body.contractVersion, 'mobile-coordinator-zone-v1')
  assert.deepEqual(res.body.clients, [{ clientId: 'C-1', name: 'Best Clean' }])
  assert.equal(res.body.zones[0].zoneId, 'QR-1')
  assert.equal(calls.resolved, 1)
  assert.equal(calls.released, 1)
})

test('ordinary worker is denied before zone data is read', async () => {
  const { api, calls, request } = createHarness({ membershipRole: 'WORKER', workerType: 'Pracownik' })
  const res = response()
  await api.handle(request, res)
  assert.equal(res.status, 403)
  assert.equal(res.body.error.code, 'MOBILE_COORDINATOR_ACCESS_DENIED')
  assert.equal(calls.queries.length, 0)
})

test('PATCH rejects client-supplied authorization scope', () => {
  assert.throws(
    () => normalizePatchPayload({
      orgId: 'forged', zoneId: 'QR-1', clientId: 'C-1', function: 'clean',
    }),
    (error) => error.publicCode === 'MOBILE_COORDINATOR_SCOPE_FORBIDDEN',
  )
})

test('PATCH updates only a zone and client from the token-derived organization', async () => {
  const payload = {
    zoneId: 'QR-1',
    clientId: 'C-1',
    function: 'clean',
    zone: 'Biuro',
    location: 'Pietro 1',
  }
  const { api, calls, request } = createHarness({
    method: 'PATCH',
    payload,
    query(sql, params) {
      if (/^begin$/.test(sql)) return { rows: [] }
      if (/select id[\s\S]+from public\.zone/.test(sql)) {
        assert.deepEqual(params, ['bestclean', 'QR-1'])
        return { rows: [{ id: 'QR-1' }] }
      }
      if (/select 1[\s\S]+from public\.client/.test(sql)) {
        assert.deepEqual(params, ['bestclean', 'C-1'])
        return { rows: [{ '?column?': 1 }] }
      }
      if (/update public\.zone/.test(sql)) {
        assert.equal(params[0], 'bestclean')
        assert.equal(params[5], 'koordynator@bestclean.pl')
        return { rows: [{ id: 'QR-1', client_id: 'C-1', zone: 'Biuro', function: 'clean', location: 'Pietro 1' }] }
      }
      if (/^commit$/.test(sql)) return { rows: [] }
      return { rows: [] }
    },
  })
  const res = response()
  await api.handle(request, res)
  assert.equal(res.status, 200)
  assert.equal(res.body.zone.zoneId, 'QR-1')
  assert.equal(calls.queries.at(0).sql, 'begin')
  assert.equal(calls.queries.at(-1).sql, 'commit')
})
