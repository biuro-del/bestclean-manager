const assert = require('node:assert/strict')
const test = require('node:test')

const { createFacilityManagerObjectApi } = require('../facility-manager-object-api')

function response() {
  return {
    status: 0,
    body: null,
    writeHead(status) { this.status = status },
    end() {},
  }
}

function apiFor(counters) {
  return createFacilityManagerObjectApi({
    async connectDbClient() {
      counters.db += 1
      return { release() { counters.release += 1 } }
    },
    async getFacilityManagerObjectService() {
      counters.service += 1
      return {
        async list(input) { counters.list = input; return { objects: [] } },
        async create(input) { counters.create = input; return { object: { objectId: 'fmobj_1' }, createdNow: true } },
        async update(input) { counters.update = input; return { object: { objectId: 'fmobj_1' } } },
        async archive(input) { counters.archive = input; return { object: { objectId: 'fmobj_1', status: 'ARCHIVED' } } },
      }
    },
    mapDatabaseConnectionError() { return null },
    mapFirebaseAdminError() { return { status: 401, code: 'UNAUTHENTICATED', message: 'bad token' } },
    parseBearerToken() { counters.tokenHeader += 1; return 'id-token' },
    async readJsonBody() { counters.body += 1; return { orgId: 'manager_01', clientActionId: 'fm_action_1234567890' } },
    sendApiError(res, status, code, message) { res.status = status; res.body = { error: { code, message } } },
    sendJson(res, status, body) { res.status = status; res.body = body },
    async verifyFirebaseIdToken() { counters.token += 1; return { uid: 'uid-manager' } },
  })
}

test('GET lists only the chosen, server-authorized manager organization and does not read a body', async () => {
  const counters = { db: 0, release: 0, service: 0, tokenHeader: 0, token: 0, body: 0 }
  const api = apiFor(counters)
  const res = response()
  await api.handleRequest(
    { method: 'GET', headers: {} },
    res,
    new URL('https://portal.cleanzi.pl/api/facility-manager/objects?orgId=manager_01'),
  )
  assert.equal(res.status, 200)
  assert.deepEqual(counters.list, { client: counters.list.client, uid: 'uid-manager', orgId: 'manager_01' })
  assert.equal(counters.body, 0)
  assert.equal(counters.release, 1)
})

test('POST derives the actor solely from the Firebase token and returns 201 only for a new object', async () => {
  const counters = { db: 0, release: 0, service: 0, tokenHeader: 0, token: 0, body: 0 }
  const api = apiFor(counters)
  const res = response()
  await api.handleRequest({ method: 'POST', headers: {} }, res, new URL('https://portal.cleanzi.pl/api/facility-manager/objects'))
  assert.equal(res.status, 201)
  assert.equal(counters.create.uid, 'uid-manager')
  assert.deepEqual(counters.create.payload, { orgId: 'manager_01', clientActionId: 'fm_action_1234567890' })
})

test('missing Firebase token is rejected before body, service, or database access', async () => {
  const counters = { db: 0, release: 0, service: 0, tokenHeader: 0, token: 0, body: 0 }
  const api = createFacilityManagerObjectApi({
    async connectDbClient() { counters.db += 1; return { release() {} } },
    async getFacilityManagerObjectService() { counters.service += 1; return {} },
    mapDatabaseConnectionError() { return null },
    mapFirebaseAdminError() { return {} },
    parseBearerToken() { return '' },
    async readJsonBody() { counters.body += 1; return {} },
    sendApiError(res, status, code) { res.status = status; res.body = { error: { code } } },
    sendJson() {},
    async verifyFirebaseIdToken() { counters.token += 1; return {} },
  })
  const res = response()
  await api.handleRequest({ method: 'GET', headers: {} }, res, new URL('https://portal.cleanzi.pl/api/facility-manager/objects?orgId=manager_01'))
  assert.equal(res.status, 401)
  assert.equal(res.body.error.code, 'UNAUTHENTICATED')
  assert.deepEqual(counters, { db: 0, release: 0, service: 0, tokenHeader: 0, token: 0, body: 0 })
})
