const assert = require('node:assert/strict')
const test = require('node:test')

const { createFacilityManagerRegistrationApi } = require('../facility-manager-registration-api')
const { createFacilityManagerRegistrationGate } = require('../facility-manager-registration-gate')

function response() {
  return {
    ended: false,
    status: null,
    body: null,
    writeHead(status) {
      this.status = status
    },
    end() {
      this.ended = true
    },
  }
}

function apiFor({ gate, counters, result } = {}) {
  return createFacilityManagerRegistrationApi({
    facilityManagerRegistrationGate: gate,
    async connectDbClient() {
      counters.db += 1
      return { release() { counters.released += 1 } }
    },
    async getFacilityManagerRegistrationService() {
      counters.service += 1
      return {
        async register(input) {
          counters.register = input
          return result || { organizationId: 'org_fm_test', createdNow: true }
        },
      }
    },
    mapDatabaseConnectionError() {
      return null
    },
    mapFirebaseAdminError() {
      return { status: 401, code: 'UNAUTHENTICATED', message: 'bad token' }
    },
    parseBearerToken() {
      counters.bearer += 1
      return 'id-token'
    },
    async readJsonBody() {
      counters.body += 1
      return { idempotencyKey: 'fm_1234567890123456', organizationName: 'Panel testowy' }
    },
    sendApiError(res, status, code, message) {
      res.status = status
      res.body = { error: { code, message } }
      res.ended = true
    },
    sendJson(res, status, body) {
      res.status = status
      res.body = body
      res.ended = true
    },
    async verifyFirebaseIdToken() {
      counters.token += 1
      return { uid: 'uid-google' }
    },
  })
}

test('disabled channel rejects before reading body, auth or database', async () => {
  const counters = { body: 0, bearer: 0, token: 0, db: 0, released: 0, service: 0 }
  const api = apiFor({
    counters,
    gate: createFacilityManagerRegistrationGate(),
  })
  const res = response()

  await api.handleRegisterRequest({ method: 'POST', headers: {} }, res)

  assert.equal(res.status, 503)
  assert.equal(res.body.error.code, 'FACILITY_MANAGER_REGISTRATION_UNAVAILABLE')
  assert.deepEqual(counters, { body: 0, bearer: 0, token: 0, db: 0, released: 0, service: 0 })
})

test('registered route validates App Check before body and provisions only from verified token', async () => {
  const counters = { body: 0, bearer: 0, token: 0, db: 0, released: 0, service: 0 }
  const observed = []
  const gate = createFacilityManagerRegistrationGate({
    enabled: true,
    appCheckGate: async ({ token }) => {
      observed.push(['appCheck', token])
      return true
    },
    rateGate: async ({ subject }) => {
      observed.push(['rate', subject])
      return true
    },
  })
  const api = apiFor({ gate, counters })
  const res = response()

  await api.handleRegisterRequest({
    method: 'POST',
    headers: { 'x-firebase-appcheck': 'app-check-token', authorization: 'Bearer ignored-by-test' },
  }, res)

  assert.equal(res.status, 201)
  assert.equal(res.body.ok, true)
  assert.deepEqual(observed, [['appCheck', 'app-check-token'], ['rate', 'uid-google']])
  assert.equal(counters.body, 1)
  assert.equal(counters.token, 1)
  assert.equal(counters.db, 1)
  assert.equal(counters.released, 1)
  assert.equal(counters.register.decodedToken.uid, 'uid-google')
  assert.deepEqual(counters.register.payload, {
    idempotencyKey: 'fm_1234567890123456',
    organizationName: 'Panel testowy',
  })
})

test('OPTIONS and non-POST do not invoke provisioner', async () => {
  const counters = { body: 0, bearer: 0, token: 0, db: 0, released: 0, service: 0 }
  const gate = createFacilityManagerRegistrationGate({ enabled: true, appCheckGate: async () => true, rateGate: async () => true })
  const api = apiFor({ gate, counters })
  const options = response()
  const get = response()

  await api.handleRegisterRequest({ method: 'OPTIONS', headers: {} }, options)
  await api.handleRegisterRequest({ method: 'GET', headers: {} }, get)

  assert.equal(options.status, 204)
  assert.equal(get.status, 405)
  assert.equal(counters.db, 0)
})
