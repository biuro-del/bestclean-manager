'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { createWorkforceScheduleApi } = require('../workforce-schedule-api')

const noEffects = () => ({ delivery: false, notifications: false, downstream: false })

function fixture(options = {}) {
  const calls = []
  const responses = []
  const errors = []
  const handledErrorLogs = []
  let body = options.body || {}
  const repository = {
    async setTenantContext(orgId) { calls.push(['tenant', orgId]) },
    async setActorContext(uid) { calls.push(['actor', uid]) },
    async lockOrganization(orgId) { calls.push(['orgLock', orgId]) },
    async schemaReady() { calls.push(['schemaReady']); return options.readiness || { ready: true, missing: [] } },
    async bootstrap(input) { calls.push(['bootstrap', input]); return { settings: { timeZone: 'Europe/Warsaw' }, shifts: [] } },
    async claimCommand(input) { calls.push(['claim', input]); return options.claim || { claimed: true, replay: false } },
    async completeCommand(input) { calls.push(['complete', input]) },
    async appendAudit(input) { calls.push(['audit', input]) },
    async readSettings() { return options.settings === undefined ? { timeZone: 'Europe/Warsaw', version: 1 } : options.settings },
    async saveSettings(input) { calls.push(['saveSettings', input]); return { timeZone: input.timeZone, version: 1 } },
    async syncCatalogs(input) {
      calls.push(['syncCatalogs', input])
      return {
        synchronizedAt: '2026-09-07T08:15:30.000Z',
        people: { active: 12, created: 2, updated: 1, deactivated: 0 },
        locations: { active: 4, created: 1, updated: 0, deactivated: 1 },
      }
    },
    async saveShift(input) { calls.push(['saveShift', input]); return { before: null, shift: { shiftId: 'shift-1', version: 1 } } },
    async archiveShift(input) { calls.push(['archiveShift', input]); return { before: { shiftId: input.shiftId }, shift: { shiftId: input.shiftId, pendingDeletion: true } } },
    async lockPublicationScope(input) { calls.push(['lockPublicationScope', input]); return options.shifts || [{ shiftId: 'shift-1', version: 2, revision: 2, isDeleted: false }] },
    async lockPublicationDependencies(input) { calls.push(['lockPublicationDependencies', input]) },
    async listPublicationConflicts(input) { calls.push(['conflicts', input]); return options.conflicts || [] },
    async publish(input) { calls.push(['publish', input]); return { publicationId: input.publicationId, visibility: 'INTERNAL_ONLY', effects: input.effects, published: input.shifts } },
    ...options.repository,
  }
  const roleState = {
    sessionUser: 'workforce_schedule_session',
    currentUser: 'workforce_schedule_session',
    transactionOpen: false,
  }
  const client = {
    async query(sql) {
      const normalized = String(sql).trim().toLowerCase()
      calls.push(['sql', normalized])
      if (normalized.startsWith('begin')) roleState.transactionOpen = true
      if (normalized === 'set local role workforce_schedule_app') {
        if (!roleState.transactionOpen || options.failSetRole) {
          const error = new Error('cannot set schedule role')
          error.code = '42501'
          throw error
        }
        roleState.currentUser = 'workforce_schedule_app'
      }
      if (normalized === 'commit') {
        if (options.failCommit) throw new Error('commit failed')
        roleState.transactionOpen = false
        roleState.currentUser = roleState.sessionUser
      }
      if (normalized === 'rollback') {
        if (options.failRollback) throw new Error('rollback failed')
        roleState.transactionOpen = false
        roleState.currentUser = roleState.sessionUser
      }
      if (normalized.includes('select session_user::text as session_user')) {
        return { rows: [{ session_user: roleState.sessionUser, current_user: roleState.currentUser }] }
      }
      if (normalized === 'select current_user::text as current_user') {
        return { rows: [{ current_user: roleState.currentUser }] }
      }
      return { rows: [] }
    },
    release(destroy = false) { calls.push(['release', destroy]) },
  }
  const api = createWorkforceScheduleApi({
    async assertOrganizationEnabled(orgId) {
      calls.push(['rollout', orgId])
      if (options.rolloutError) throw options.rolloutError
    },
    async authorize(_client, input) {
      calls.push(['authorize', input])
      if (options.authorizeError) throw options.authorizeError
      return { role: 'ADMIN', scope: 'ALL' }
    },
    async connectDbClient() {
      calls.push(['connect'])
      if (options.connectError) throw options.connectError
      return client
    },
    createId: (() => { let id = 0; return () => `id-${++id}` })(),
    createRepository() { return repository },
    getRequestId() { return options.requestId === undefined ? 'req-test' : options.requestId },
    async logHandledError(entry) {
      handledErrorLogs.push(entry)
      if (options.logHandledErrorError) throw options.logHandledErrorError
    },
    parseBearerToken() { calls.push(['token']); return options.token === undefined ? 'TOKEN' : options.token },
    async readJsonBody() { calls.push(['body']); return body },
    sendApiError(_res, status, code, message, details) { errors.push({ status, code, message, details }) },
    sendJson(_res, status, payload) { responses.push({ status, payload }) },
    async verifyFirebaseIdToken() {
      calls.push(['verify'])
      if (options.verifyError) throw options.verifyError
      return options.decoded || { uid: 'uid-1' }
    },
  })
  return {
    api,
    calls,
    client,
    errors,
    handledErrorLogs,
    repository,
    responses,
    roleState,
    setBody(value) { body = value },
  }
}

test('router dopasowuje wyłącznie własny namespace Grafiku', () => {
  const f = fixture()
  assert.equal(f.api.matches('/api/portal/workforce-schedule/bootstrap'), true)
  assert.equal(f.api.matches('/api/portal/workforce-schedule/commands'), true)
  assert.equal(f.api.matches('/api/portal/workforce-schedule/publications'), true)
  assert.equal(f.api.matches('/api/portal/workforce-schedule/requests/request-1/decision'), true)
  assert.equal(f.api.matches('/api/portal/schedule-orders'), false)
})

test('nieznany endpoint we własnym namespace kończy się 404', async () => {
  const f = fixture()
  await f.api.handle({ method: 'GET' }, {}, new URL('http://localhost/api/portal/workforce-schedule/unknown'))
  assert.equal(f.errors[0].status, 404)
  assert.equal(f.calls.length, 0)
})

test('brak tokenu jest odrzucany przed body i połączeniem z bazą', async () => {
  const f = fixture({ token: '' })
  await f.api.handle({ method: 'POST' }, {}, new URL('http://localhost/api/portal/workforce-schedule/commands'))
  assert.equal(f.errors[0].status, 401)
  assert.equal(f.calls.some(([name]) => name === 'body'), false)
  assert.equal(f.calls.some(([name]) => name === 'connect'), false)
  assert.equal(f.handledErrorLogs.length, 0)
})

test('obsluzony blad operacyjny 503 zapisuje jeden minimalny rekord strukturalny', async () => {
  const operationalError = new Error('raw database message must not be logged')
  operationalError.statusCode = 503
  operationalError.publicCode = 'WORKFORCE_SCHEDULE_DB_CONFIG_MISSING'
  operationalError.publicMessage = 'Brakuje konfiguracji bazy Grafiku.'
  const f = fixture({ connectError: operationalError, requestId: 'req-123' })

  await f.api.handle(
    { method: 'GET' },
    {},
    new URL('http://localhost/api/portal/workforce-schedule/bootstrap?orgId=bestclean&from=2026-08-24&to=2026-08-30'),
  )

  assert.equal(f.errors[0].status, 503)
  assert.deepEqual(f.handledErrorLogs, [{
    code: 'WORKFORCE_SCHEDULE_DB_CONFIG_MISSING',
    status: 503,
    requestId: 'req-123',
    operation: 'bootstrap',
  }])
  assert.deepEqual(Object.keys(f.handledErrorLogs[0]), ['code', 'status', 'requestId', 'operation'])
})

test('log bledu 5xx nie zawiera bledu DB, tokenu, body ani sekretow', async () => {
  const sensitiveError = new Error('DB_SUPER_SECRET password=do-not-log')
  sensitiveError.code = 'XX000'
  sensitiveError.detail = 'private database detail'
  sensitiveError.query = 'select * from private_table'
  sensitiveError.token = 'FIREBASE_TOKEN_SECRET'
  sensitiveError.body = { secret: 'BODY_SECRET' }
  const f = fixture({
    body: { secret: 'REQUEST_BODY_SECRET' },
    connectError: sensitiveError,
    requestId: 'req-safe-500\nREQUEST_ID_SECRET',
  })

  await f.api.handle(
    { method: 'GET', headers: { authorization: 'Bearer HEADER_TOKEN_SECRET' } },
    {},
    new URL('http://localhost/api/portal/workforce-schedule/bootstrap?orgId=bestclean&from=2026-08-24&to=2026-08-30'),
  )

  assert.equal(f.errors[0].code, 'WORKFORCE_SCHEDULE_FAILED')
  assert.deepEqual(f.handledErrorLogs, [{
    code: 'WORKFORCE_SCHEDULE_FAILED',
    status: 500,
    requestId: '',
    operation: 'bootstrap',
  }])
  assert.doesNotMatch(
    JSON.stringify(f.handledErrorLogs),
    /DB_SUPER_SECRET|do-not-log|private database|private_table|FIREBASE_TOKEN_SECRET|BODY_SECRET|HEADER_TOKEN_SECRET|REQUEST_ID_SECRET/,
  )
})

test('awaria loggera nie zastepuje bezpiecznej odpowiedzi 5xx', async () => {
  const operationalError = Object.assign(new Error('internal detail'), {
    statusCode: 503,
    publicCode: 'WORKFORCE_SCHEDULE_SCHEMA_NOT_READY',
    publicMessage: 'Schemat bazy Grafiku nie jest jeszcze aktywny.',
  })
  const f = fixture({
    connectError: operationalError,
    logHandledErrorError: new Error('logging sink unavailable'),
  })

  await f.api.handle(
    { method: 'GET' },
    {},
    new URL('http://localhost/api/portal/workforce-schedule/bootstrap?orgId=bestclean&from=2026-08-24&to=2026-08-30'),
  )

  assert.equal(f.errors[0].status, 503)
  assert.equal(f.errors[0].code, 'WORKFORCE_SCHEDULE_SCHEMA_NOT_READY')
})

test('token odrzucony przez portalowy verifier kończy się 401 przed połączeniem z bazą', async () => {
  const f = fixture({ verifyError: new Error('platform token is not accepted') })
  await f.api.handle({ method: 'GET' }, {}, new URL('http://localhost/api/portal/workforce-schedule/bootstrap?orgId=bestclean&from=2026-08-24&to=2026-08-30'))
  assert.equal(f.errors[0].status, 401)
  assert.equal(f.errors[0].code, 'UNAUTHENTICATED')
  assert.equal(f.calls.some(([name]) => name === 'connect'), false)
})

test('bootstrap jest transakcją read only i przekazuje org po autoryzacji', async () => {
  const f = fixture()
  await f.api.handle({ method: 'GET' }, {}, new URL('http://localhost/api/portal/workforce-schedule/bootstrap?orgId=bestclean&from=2026-08-24&to=2026-08-30'))
  assert.equal(f.errors.length, 0)
  assert.equal(f.responses[0].status, 200)
  assert.deepEqual(f.calls.find(([name]) => name === 'authorize')[1], { orgId: 'bestclean', uid: 'uid-1', action: 'READ' })
  assert.deepEqual(f.calls.find(([name]) => name === 'bootstrap')[1], { orgId: 'bestclean', from: '2026-08-24', to: '2026-08-30', personId: '' })
  assert.ok(f.calls.some(([name, sql]) => name === 'sql' && sql === 'begin isolation level repeatable read read only'))
  assert.ok(f.calls.some(([name, sql]) => name === 'sql' && sql === 'set local role workforce_schedule_app'))
  assert.ok(f.calls.some(([name, sql]) => name === 'sql' && sql === "set local lock_timeout = '5s'"))
  assert.ok(f.calls.some(([name, sql]) => name === 'sql' && sql === "set local statement_timeout = '15s'"))
  assert.ok(f.calls.some(([name, sql]) => name === 'sql' && sql === "set local idle_in_transaction_session_timeout = '20s'"))
  const authorizeIndex = f.calls.findIndex(([name]) => name === 'authorize')
  const roleIndex = f.calls.findIndex(([name, sql]) => name === 'sql' && sql === 'set local role workforce_schedule_app')
  const timeoutIndex = f.calls.findIndex(([name, sql]) => name === 'sql' && sql === "set local lock_timeout = '5s'")
  const tenantIndex = f.calls.findIndex(([name]) => name === 'tenant')
  const schemaIndex = f.calls.findIndex(([name]) => name === 'schemaReady')
  assert.ok(timeoutIndex < authorizeIndex)
  assert.ok(authorizeIndex < roleIndex)
  assert.ok(roleIndex < tenantIndex)
  assert.ok(tenantIndex < schemaIndex)
  assert.equal(f.roleState.currentUser, 'workforce_schedule_session')
  assert.deepEqual(await f.client.query('select current_user::text as current_user'), {
    rows: [{ current_user: 'workforce_schedule_session' }],
  })
})

test('brak schematu kończy transakcję rollbackiem i jawnym 503', async () => {
  const f = fixture({ readiness: { ready: false, missing: ['public.workforce_schedule_shift'] } })
  await f.api.handle({ method: 'GET' }, {}, new URL('http://localhost/api/portal/workforce-schedule/bootstrap?orgId=bestclean&from=2026-08-24&to=2026-08-30'))
  assert.equal(f.errors[0].status, 503)
  assert.ok(f.calls.some(([name, sql]) => name === 'sql' && sql === 'rollback'))
  assert.equal(f.roleState.currentUser, 'workforce_schedule_session')
  assert.ok(f.calls.some(([name, sql]) => name === 'sql' && sql.includes('select session_user::text as session_user')))
})

test('brak SET ROLE zatrzymuje Grafik i bezpiecznie cofa transakcję', async () => {
  const f = fixture({ failSetRole: true })
  await f.api.handle({ method: 'GET' }, {}, new URL('http://localhost/api/portal/workforce-schedule/bootstrap?orgId=bestclean&from=2026-08-24&to=2026-08-30'))
  assert.equal(f.errors[0].status, 503)
  assert.equal(f.errors[0].code, 'WORKFORCE_SCHEDULE_DB_ROLE_NOT_READY')
  assert.ok(f.calls.findIndex(([name]) => name === 'authorize') < f.calls.findIndex(([name, sql]) => name === 'sql' && sql === 'set local role workforce_schedule_app'))
  assert.equal(f.calls.some(([name]) => name === 'tenant'), false)
  assert.equal(f.roleState.currentUser, 'workforce_schedule_session')
})

test('nieudany COMMIT niszczy połączenie zamiast zwracać je do poola', async () => {
  const f = fixture({ failCommit: true })
  await f.api.handle({ method: 'GET' }, {}, new URL('http://localhost/api/portal/workforce-schedule/bootstrap?orgId=bestclean&from=2026-08-24&to=2026-08-30'))
  assert.deepEqual(f.calls.find(([name]) => name === 'release'), ['release', true])
})

test('nieudany ROLLBACK niszczy połączenie zamiast zwracać rolę Grafiku do poola', async () => {
  const f = fixture({ failRollback: true, readiness: { ready: false, missing: ['schema:VERSION'] } })
  await f.api.handle({ method: 'GET' }, {}, new URL('http://localhost/api/portal/workforce-schedule/bootstrap?orgId=bestclean&from=2026-08-24&to=2026-08-30'))
  assert.deepEqual(f.calls.find(([name]) => name === 'release'), ['release', true])
  assert.equal(f.roleState.currentUser, 'workforce_schedule_app')
})

test('komenda bez effects jest odrzucana przed połączeniem z bazą', async () => {
  const f = fixture({ body: { type: 'SYNC_CATALOGS', orgId: 'bestclean', idempotencyKey: 'sync-1', payload: {} } })
  await f.api.handle({ method: 'POST' }, {}, new URL('http://localhost/api/portal/workforce-schedule/commands'))
  assert.equal(f.errors[0].code, 'WORKFORCE_SCHEDULE_INTERNAL_EFFECTS_REQUIRED')
  assert.equal(f.calls.some(([name]) => name === 'connect'), false)
})

test('komenda próbująca włączyć powiadomienia jest odrzucana przed bazą', async () => {
  const f = fixture({
    body: {
      type: 'SYNC_CATALOGS',
      orgId: 'bestclean',
      idempotencyKey: 'sync-1',
      effects: { ...noEffects(), notifications: true },
      payload: {},
    },
  })
  await f.api.handle({ method: 'POST' }, {}, new URL('http://localhost/api/portal/workforce-schedule/commands'))
  assert.equal(f.errors[0].code, 'WORKFORCE_SCHEDULE_EXTERNAL_EFFECTS_FORBIDDEN')
  assert.equal(f.calls.some(([name]) => name === 'connect'), false)
})

test('SYNC_CATALOGS pobiera ludzi i obiekty atomowo jako jedną komendę', async () => {
  const f = fixture({
    body: { type: 'SYNC_CATALOGS', orgId: 'bestclean', idempotencyKey: 'sync-1', effects: noEffects(), payload: {} },
  })
  await f.api.handle({ method: 'POST' }, {}, new URL('http://localhost/api/portal/workforce-schedule/commands'))
  assert.equal(f.errors.length, 0)
  assert.equal(f.calls.filter(([name]) => name === 'syncCatalogs').length, 1)
  assert.equal(f.calls.some(([name]) => name === 'complete'), true)
  assert.deepEqual(f.calls.find(([name]) => name === 'claim')[1].effects, noEffects())
  assert.deepEqual(f.responses[0], {
    status: 200,
    payload: {
      ok: true,
      idempotent: false,
      effects: noEffects(),
      orgId: 'bestclean',
      people: [],
      locations: [],
      receipt: {
        version: 1,
        orgId: 'bestclean',
        synchronizedAt: '2026-09-07T08:15:30.000Z',
        people: { active: 12, created: 2, updated: 1, deactivated: 0 },
        locations: { active: 4, created: 1, updated: 0, deactivated: 1 },
        effects: noEffects(),
      },
    },
  })
  const audit = f.calls.find(([name]) => name === 'audit')[1]
  const completed = f.calls.find(([name]) => name === 'complete')[1]
  assert.equal(audit.entityType, 'CATALOGS')
  assert.equal(audit.action, 'SYNCED')
  assert.deepEqual(audit.after, f.responses[0].payload)
  assert.deepEqual(completed.response, f.responses[0].payload)
  assert.ok(f.calls.findIndex(([name]) => name === 'audit') < f.calls.findIndex(([name]) => name === 'complete'))
  assert.ok(f.calls.findIndex(([name]) => name === 'complete') < f.calls.findIndex(([name, sql]) => name === 'sql' && sql === 'commit'))
})

test('SYNC_CATALOGS zachowuje bezpieczne szczegóły konfliktu używanego snapshotu', async () => {
  const affected = [{ personId: 'person-1', shiftId: 'shift-7', date: '2026-09-08' }]
  const conflict = Object.assign(new Error('catalog conflict'), {
    statusCode: 409,
    publicCode: 'WORKFORCE_SCHEDULE_ROSTER_IN_USE',
    publicMessage: 'Nie można wyłączyć osoby używanej w Grafiku.',
    publicDetails: { affected, hasMore: false },
  })
  const f = fixture({
    body: { type: 'SYNC_CATALOGS', orgId: 'bestclean', idempotencyKey: 'sync-conflict', effects: noEffects(), payload: {} },
    repository: {
      async syncCatalogs() { throw conflict },
    },
  })

  await f.api.handle({ method: 'POST' }, {}, new URL('http://localhost/api/portal/workforce-schedule/commands'))

  assert.equal(f.responses.length, 0)
  assert.deepEqual(f.errors[0], {
    status: 409,
    code: 'WORKFORCE_SCHEDULE_ROSTER_IN_USE',
    message: 'Nie można wyłączyć osoby używanej w Grafiku.',
    details: { affected, hasMore: false },
  })
  assert.doesNotMatch(JSON.stringify(f.errors[0]), /login|authUid|displayName/i)
})

test('receipt synchronizacji normalizuje wszystkie liczniki do nieujemnych integerów', async () => {
  const f = fixture({
    body: { type: 'SYNC_CATALOGS', orgId: 'bestclean', idempotencyKey: 'sync-counts', effects: noEffects(), payload: {} },
    repository: {
      async syncCatalogs() {
        return {
          synchronizedAt: '2026-09-07T08:15:30Z',
          people: { active: -1, created: '2', updated: 1.5, deactivated: Number.NaN },
          locations: { active: 3, created: 0, updated: -4, deactivated: '1' },
        }
      },
    },
  })

  await f.api.handle({ method: 'POST' }, {}, new URL('http://localhost/api/portal/workforce-schedule/commands'))

  assert.equal(f.errors.length, 0)
  assert.deepEqual(f.responses[0].payload.receipt.people, {
    active: 0,
    created: 2,
    updated: 0,
    deactivated: 0,
  })
  assert.deepEqual(f.responses[0].payload.receipt.locations, {
    active: 3,
    created: 0,
    updated: 0,
    deactivated: 1,
  })
  assert.equal(f.responses[0].payload.receipt.synchronizedAt, '2026-09-07T08:15:30.000Z')
})

test('błąd zapisu audytu wycofuje synchronizację i nie utrwala receipt', async () => {
  const f = fixture({
    body: { type: 'SYNC_CATALOGS', orgId: 'bestclean', idempotencyKey: 'sync-audit-failure', effects: noEffects(), payload: {} },
    repository: {
      async appendAudit() {
        throw new Error('audit write failed')
      },
    },
  })

  await f.api.handle({ method: 'POST' }, {}, new URL('http://localhost/api/portal/workforce-schedule/commands'))

  assert.equal(f.responses.length, 0)
  assert.equal(f.errors[0].status, 500)
  assert.equal(f.calls.some(([name]) => name === 'complete'), false)
  assert.equal(f.calls.some(([name, sql]) => name === 'sql' && sql === 'commit'), false)
  assert.equal(f.calls.some(([name, sql]) => name === 'sql' && sql === 'rollback'), true)
})

test('timeout blokady lub zapytania kończy transakcję rollbackiem i bezpiecznym błędem do ponowienia', async () => {
  for (const databaseCode of ['55P03', '57014']) {
    const f = fixture({
      body: { type: 'SYNC_CATALOGS', orgId: 'bestclean', idempotencyKey: `timeout-${databaseCode}`, effects: noEffects(), payload: {} },
      repository: {
        async lockOrganization() {
          const error = new Error('database timeout')
          error.code = databaseCode
          throw error
        },
      },
    })
    await f.api.handle({ method: 'POST' }, {}, new URL('http://localhost/api/portal/workforce-schedule/commands'))
    assert.equal(f.errors[0].status, 409)
    assert.equal(f.errors[0].code, 'WORKFORCE_SCHEDULE_RETRY_REQUIRED')
    assert.ok(f.calls.some(([name, sql]) => name === 'sql' && sql === 'rollback'))
    assert.ok(f.calls.some(([name, sql]) => name === 'sql' && sql === "set local lock_timeout = '5s'"))
    assert.ok(f.calls.findIndex(([name, sql]) => name === 'sql' && sql === "set local lock_timeout = '5s'") < f.calls.findIndex(([name]) => name === 'authorize'))
    assert.ok(f.calls.some(([name]) => name === 'release'))
  }
})

test('stare komendy katalogowe nie są dostępne', async () => {
  for (const type of ['SYNC_ROSTER', 'UPSERT_LOCATION']) {
    const f = fixture({ body: { type, orgId: 'bestclean', idempotencyKey: `old-${type}`, effects: noEffects(), payload: {} } })
    await f.api.handle({ method: 'POST' }, {}, new URL('http://localhost/api/portal/workforce-schedule/commands'))
    assert.equal(f.errors[0].code, 'WORKFORCE_SCHEDULE_COMMAND_UNSUPPORTED')
    assert.equal(f.calls.some(([name]) => name === 'syncCatalogs'), false)
  }
})

test('idempotentny replay zwraca zapisany wynik bez ponownej mutacji', async () => {
  const storedResponse = {
    ok: true,
    idempotent: false,
    effects: noEffects(),
    people: [{ personId: 'existing', sourceWorkerLogin: 'sensitive-login', sourceAuthUid: 'sensitive-uid' }],
    locations: [{ locationId: 'existing-location', name: 'Sensitive location name' }],
  }
  const f = fixture({
    body: { type: 'SYNC_CATALOGS', orgId: 'bestclean', idempotencyKey: 'sync-1', effects: noEffects(), payload: {} },
    claim: { replay: true, response: storedResponse, completedAt: '2026-09-07T08:15:30.000Z' },
  })
  await f.api.handle({ method: 'POST' }, {}, new URL('http://localhost/api/portal/workforce-schedule/commands'))
  assert.equal(f.errors.length, 0)
  assert.deepEqual(f.responses[0], {
    status: 200,
    payload: {
      ok: true,
      idempotent: true,
      effects: noEffects(),
      orgId: 'bestclean',
      people: [],
      locations: [],
      receipt: {
        version: 1,
        orgId: 'bestclean',
        synchronizedAt: '2026-09-07T08:15:30.000Z',
        people: { active: 1, created: 0, updated: 0, deactivated: 0 },
        locations: { active: 1, created: 0, updated: 0, deactivated: 0 },
        effects: noEffects(),
      },
    },
  })
  assert.doesNotMatch(JSON.stringify(f.responses[0].payload), /sensitive-login|sensitive-uid|Sensitive location name/)
  assert.equal(f.calls.some(([name]) => name === 'syncCatalogs'), false)
  assert.equal(f.calls.some(([name]) => name === 'audit'), false)
})

test('zapis zmiany wymaga wersji i aktywnych encji repozytorium', async () => {
  const body = {
    type: 'UPSERT_SHIFT',
    orgId: 'bestclean',
    idempotencyKey: 'shift-1',
    effects: noEffects(),
    payload: {
      expectedVersion: 0,
      title: 'Zmiana poranna',
      date: '2026-08-24',
      startTime: '07:00',
      endTime: '15:00',
      breakMinutes: 30,
      requiredHeadcount: 1,
      locationId: 'location-1',
      personIds: ['person-1'],
      instructions: ['Odprawa'],
    },
  }
  const f = fixture({ body })
  await f.api.handle({ method: 'POST' }, {}, new URL('http://localhost/api/portal/workforce-schedule/commands'))
  assert.equal(f.errors.length, 0)
  const call = f.calls.find(([name]) => name === 'saveShift')[1]
  assert.equal(call.shift.timeZone, 'Europe/Warsaw')
  assert.equal(call.shift.startsAt, '2026-08-24T05:00:00.000Z')
  assert.deepEqual(call.shift.personIds, ['person-1'])
})

test('publikacja bez zerowych efektów jest odrzucana przed bazą', async () => {
  const f = fixture({
    body: {
      orgId: 'bestclean',
      idempotencyKey: 'pub-1',
      from: '2026-08-24',
      to: '2026-08-30',
      expectedVersions: [{ shiftId: 'shift-1', version: 2 }],
    },
  })
  await f.api.handle({ method: 'POST' }, {}, new URL('http://localhost/api/portal/workforce-schedule/publications'))
  assert.equal(f.errors[0].code, 'WORKFORCE_SCHEDULE_INTERNAL_EFFECTS_REQUIRED')
  assert.equal(f.calls.some(([name]) => name === 'connect'), false)
})

test('publikacja jest wewnętrzna i nie przekazuje efektów zewnętrznych', async () => {
  const f = fixture({
    body: {
      orgId: 'bestclean',
      idempotencyKey: 'pub-1',
      effects: noEffects(),
      from: '2026-08-24',
      to: '2026-08-30',
      expectedVersions: [{ shiftId: 'shift-1', version: 2 }],
    },
  })
  await f.api.handle({ method: 'POST' }, {}, new URL('http://localhost/api/portal/workforce-schedule/publications'))
  assert.equal(f.errors.length, 0)
  assert.equal(f.responses[0].payload.publication.visibility, 'INTERNAL_ONLY')
  assert.deepEqual(f.calls.find(([name]) => name === 'publish')[1].effects, noEffects())
  assert.equal(f.calls.some(([name]) => name === 'resolveRequest'), false)
})

test('rollout organizacji odrzuca wszystkie endpointy przed otwarciem bazy', async () => {
  const rolloutError = Object.assign(new Error('WORKFORCE_SCHEDULE_DISABLED'), {
    statusCode: 404,
    publicCode: 'WORKFORCE_SCHEDULE_DISABLED',
    publicMessage: 'Grafik nie jest aktywny w tym środowisku.',
  })
  const cases = [
    {
      path: '/api/portal/workforce-schedule/bootstrap?orgId=other-org&from=2026-08-24&to=2026-08-30',
      method: 'GET',
    },
    {
      path: '/api/portal/workforce-schedule/commands',
      method: 'POST',
      body: {
        type: 'SYNC_CATALOGS',
        orgId: 'other-org',
        idempotencyKey: 'sync-other-org',
        effects: noEffects(),
        payload: {},
      },
    },
    {
      path: '/api/portal/workforce-schedule/publications',
      method: 'POST',
      body: {
        orgId: 'other-org',
        idempotencyKey: 'publish-other-org',
        effects: noEffects(),
        from: '2026-08-24',
        to: '2026-08-30',
        expectedVersions: [{ shiftId: 'shift-1', version: 2 }],
      },
    },
  ]

  for (const entry of cases) {
    const f = fixture({ body: entry.body, rolloutError })
    await f.api.handle(
      { method: entry.method },
      {},
      new URL(`http://localhost${entry.path}`),
    )

    assert.equal(f.errors[0].status, 404)
    assert.equal(f.errors[0].code, 'WORKFORCE_SCHEDULE_DISABLED')
    assert.deepEqual(f.calls.find(([name]) => name === 'rollout'), ['rollout', 'other-org'])
    assert.equal(f.calls.some(([name]) => name === 'connect'), false)
    assert.equal(f.calls.some(([name]) => name === 'authorize'), false)
  }
})
