'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const { createWorkTimeDaysApi } = require('../work-time-days-api')

function responseRecorder() {
  return {
    body: null,
    statusCode: 0,
    end() {},
    writeHead(statusCode) { this.statusCode = statusCode },
  }
}

function apiHarness(repository) {
  const client = { releaseCalled: false, release() { this.releaseCalled = true } }
  const api = createWorkTimeDaysApi({
    authorize: async () => ({ scope: 'ORG' }),
    connectDbClient: async () => client,
    createRepository: () => repository,
    parseBearerToken: (req) => req.token || '',
    readJsonBody: async (req) => req.body || {},
    sendApiError: (res, statusCode, code, message, details) => {
      res.statusCode = statusCode
      res.body = { error: { code, details, message } }
    },
    sendJson: (res, statusCode, body) => {
      res.statusCode = statusCode
      res.body = body
    },
    verifyFirebaseIdToken: async () => ({ uid: 'UID-1' }),
  })
  return { api, client }
}

test('GET detail returns a complete day scoped by organization and worker', async () => {
  let received = null
  const expected = { businessDateYmd: '2026-08-01', workedSec: 14400, sessions: [] }
  const { api, client } = apiHarness({
    read: async (input) => { received = input; return expected },
  })
  const req = { method: 'GET', token: 'token' }
  const res = responseRecorder()
  const url = new URL('http://localhost/api/portal/work-time/days/2026-08-01?orgId=ORG-1&workerLogin=W034')

  await api.handle(req, res, url)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body.day, expected)
  assert.deepEqual(received, { orgId: 'ORG-1', uid: 'UID-1', workerLogin: 'W034', businessDateYmd: '2026-08-01' })
  assert.equal(client.releaseCalled, true)
})

test('GET list forwards pagination and Warsaw date range', async () => {
  let received = null
  const { api } = apiHarness({
    list: async (input) => { received = input; return { items: [], page: 2, pageSize: 25, total: 0, totalPages: 1 } },
  })
  const req = { method: 'GET', token: 'token' }
  const res = responseRecorder()
  const url = new URL('http://localhost/api/portal/work-time/days?orgId=ORG-1&workerLogin=W034&fromYmd=2026-07-01&toYmd=2026-07-31&page=2&pageSize=25')

  await api.handle(req, res, url)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(received, {
    orgId: 'ORG-1', uid: 'UID-1', workerLogin: 'W034',
    fromYmd: '2026-07-01', toYmd: '2026-07-31', page: 2, pageSize: 25,
  })
})

test('POST sends the optimistic version and separate attendance/activity corrections', async () => {
  let received = null
  const { api } = apiHarness({
    reconcile: async (input) => { received = input; return { version: 'b'.repeat(64), workedSec: 3600 } },
  })
  const body = {
    orgId: 'ORG-1',
    workerLogin: 'W034',
    expectedVersion: 'a'.repeat(64),
    attendanceCorrections: [{ workdayId: 'WD-1', endAt: '2026-08-01T08:00:00Z' }],
    activityCorrections: [{ eventId: 'EV-1', zoneId: 'Z-2' }],
    idempotencyKey: 'request-1234',
    reason: 'Korekta administratora',
    finalize: true,
  }
  const req = { method: 'POST', token: 'token', body }
  const res = responseRecorder()
  const url = new URL('http://localhost/api/portal/work-time/days/2026-08-01?orgId=ORG-1&workerLogin=W034')

  await api.handle(req, res, url)

  assert.equal(res.statusCode, 200)
  assert.equal(received.value, body)
  assert.equal(received.businessDateYmd, '2026-08-01')
})

test('detail endpoint rejects mismatched worker scope before repository access', async () => {
  let called = false
  const { api } = apiHarness({
    reconcile: async () => { called = true },
  })
  const req = { method: 'POST', token: 'token', body: { orgId: 'ORG-1', workerLogin: 'OTHER' } }
  const res = responseRecorder()
  const url = new URL('http://localhost/api/portal/work-time/days/2026-08-01?orgId=ORG-1&workerLogin=W034')

  await api.handle(req, res, url)

  assert.equal(res.statusCode, 403)
  assert.equal(res.body.error.code, 'WORK_TIME_WORKER_MISMATCH')
  assert.equal(called, false)
})
