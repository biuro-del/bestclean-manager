const assert = require('node:assert/strict')
const test = require('node:test')

const {
  createPortalZoneApi,
  functionAllowsRequiredVisit,
  normalizeWritePayload,
} = require('../portal-zone-api')

function response() {
  return {
    status: 0,
    body: null,
    writeHead(status) { this.status = status },
    end() {},
  }
}

function apiFor({ payload = {}, query, authorize } = {}) {
  const counters = { released: 0, verified: 0, authorized: [] }
  const client = {
    async query(sql, params) {
      return query ? query(String(sql), params) : { rows: [] }
    },
    release() { counters.released += 1 },
  }
  const api = createPortalZoneApi({
    async authorize(db, input) {
      counters.authorized.push(input)
      if (authorize) return authorize(db, input)
      return { role: 'ADMIN' }
    },
    async connectDbClient() { return client },
    mapDatabaseConnectionError() { return null },
    mapFirebaseAdminError() { return { status: 401, code: 'UNAUTHENTICATED', message: 'bad token' } },
    parseBearerToken() { return 'id-token' },
    async readJsonBody() { return payload },
    sendApiError(res, status, code, message) { res.status = status; res.body = { error: { code, message } } },
    sendJson(res, status, body) { res.status = status; res.body = body },
    async verifyFirebaseIdToken() {
      counters.verified += 1
      return { uid: 'uid-admin', email: 'admin@example.com' }
    },
  })
  return { api, counters }
}

test('GET returns only required-visit flags for the authorized organization', async () => {
  const { api, counters } = apiFor({
    query(sql, params) {
      assert.match(sql, /from public\.zone/)
      assert.deepEqual(params, ['ORG-1'])
      return { rows: [{ id: 'QR-1', required_visit: true }, { id: 'QR-2', required_visit: false }] }
    },
  })
  const res = response()
  await api.handle(
    { method: 'GET', headers: {} },
    res,
    new URL('https://portal.cleanzi.pl/api/portal/zones?orgId=ORG-1'),
  )
  assert.equal(res.status, 200)
  assert.deepEqual(res.body.data.zones, [
    { zoneId: 'QR-1', requiredVisit: true },
    { zoneId: 'QR-2', requiredVisit: false },
  ])
  assert.deepEqual(counters.authorized, [{ orgId: 'ORG-1', uid: 'uid-admin', write: false }])
  assert.equal(counters.released, 1)
})

test('PATCH updates the zone and required_visit atomically with a token-derived editor', async () => {
  const statements = []
  const payload = {
    orgId: 'ORG-1',
    zoneId: 'QR-1',
    clientId: 'CLIENT-1',
    zone: 'Biuro',
    function: 'CLEAN',
    requiredVisit: true,
    location: 'Piętro 1',
    editedBy: 'forged@example.com',
  }
  const { api, counters } = apiFor({
    payload,
    query(sql, params) {
      statements.push({ sql, params })
      if (/select 1\s+from public\.client/.test(sql)) return { rows: [{ '?column?': 1 }] }
      if (/update public\.zone/.test(sql)) {
        assert.equal(params[5], true)
        assert.equal(params[6], 'admin@example.com')
        return {
          rows: [{
            id: 'QR-1',
            client_id: 'CLIENT-1',
            zone: 'Biuro',
            function: 'CLEAN',
            required_visit: true,
            edited_by: 'admin@example.com',
            date: new Date('2026-09-03T10:00:00.000Z'),
            location: 'Piętro 1',
          }],
        }
      }
      return { rows: [] }
    },
  })
  const res = response()
  await api.handle({ method: 'PATCH', headers: {} }, res, new URL('https://portal.cleanzi.pl/api/portal/zones'))
  assert.equal(res.status, 200)
  assert.equal(res.body.data.zone.requiredVisit, true)
  assert.deepEqual(counters.authorized, [{ orgId: 'ORG-1', uid: 'uid-admin', write: true }])
  assert.match(statements[0].sql, /^begin$/)
  assert.match(statements.at(-1).sql, /^commit$/)
})

test('START and STOP codes can never become required visits', () => {
  assert.equal(functionAllowsRequiredVisit('START'), false)
  assert.equal(functionAllowsRequiredVisit('STOP15'), false)
  assert.equal(functionAllowsRequiredVisit('CLEAN'), true)
  assert.equal(normalizeWritePayload({
    orgId: 'ORG-1',
    zoneId: 'QR-START',
    clientId: 'CLIENT-1',
    function: 'START',
    requiredVisit: true,
  }).requiredVisit, false)
})

test('missing token is rejected before database access', async () => {
  let databaseCalls = 0
  const api = createPortalZoneApi({
    async authorize() {},
    async connectDbClient() { databaseCalls += 1; return { release() {} } },
    mapDatabaseConnectionError() { return null },
    mapFirebaseAdminError() { return {} },
    parseBearerToken() { return '' },
    async readJsonBody() { return {} },
    sendApiError(res, status, code) { res.status = status; res.body = { error: { code } } },
    sendJson() {},
    async verifyFirebaseIdToken() { throw new Error('should not run') },
  })
  const res = response()
  await api.handle({ method: 'GET', headers: {} }, res, new URL('https://portal.cleanzi.pl/api/portal/zones?orgId=ORG-1'))
  assert.equal(res.status, 401)
  assert.equal(res.body.error.code, 'UNAUTHENTICATED')
  assert.equal(databaseCalls, 0)
})
