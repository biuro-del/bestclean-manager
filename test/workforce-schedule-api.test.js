'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { createWorkforceScheduleApi } = require('../workforce-schedule-api')

const noEffects = () => ({ delivery: false, notifications: false, downstream: false })

function fixture(options = {}) {
  const calls = []
  const responses = []
  const errors = []
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
    async syncCatalogs(input) { calls.push(['syncCatalogs', input]); return { people: [{ personId: 'person-1' }], locations: [{ locationId: 'location-1' }] } },
    async saveShift(input) { calls.push(['saveShift', input]); return { before: null, shift: { shiftId: 'shift-1', version: 1 } } },
    async archiveShift(input) { calls.push(['archiveShift', input]); return { before: { shiftId: input.shiftId }, shift: { shiftId: input.shiftId, pendingDeletion: true } } },
    async lockPublicationScope(input) { calls.push(['lockPublicationScope', input]); return options.shifts || [{ shiftId: 'shift-1', version: 2, revision: 2, isDeleted: false }] },
    async lockPublicationDependencies(input) { calls.push(['lockPublicationDependencies', input]) },
    async listPublicationConflicts(input) { calls.push(['conflicts', input]); return options.conflicts || [] },
    async publish(input) { calls.push(['publish', input]); return { publicationId: input.publicationId, visibility: 'INTERNAL_ONLY', effects: input.effects, published: input.shifts } },
    ...options.repository,
  }
  const roleState = { sessionUser: 'portal_app', currentUser: 'portal_app', transactionOpen: false }
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
    async authorize(_client, input) {
      calls.push(['authorize', input])
      if (options.authorizeError) throw options.authorizeError
      return { role: 'ADMIN', scope: 'ALL' }
    },
    async connectDbClient() { calls.push(['connect']); return client },
    createId: (() => { let id = 0; return () => `id-${++id}` })(),
    createRepository() { return repository },
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
  return { api, calls, client, errors, repository, responses, roleState, setBody(value) { body = value } }
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
  assert.equal(f.roleState.currentUser, 'portal_app')
  assert.deepEqual(await f.client.query('select current_user::text as current_user'), {
    rows: [{ current_user: 'portal_app' }],
  })
})

test('brak schematu kończy transakcję rollbackiem i jawnym 503', async () => {
  const f = fixture({ readiness: { ready: false, missing: ['public.workforce_schedule_shift'] } })
  await f.api.handle({ method: 'GET' }, {}, new URL('http://localhost/api/portal/workforce-schedule/bootstrap?orgId=bestclean&from=2026-08-24&to=2026-08-30'))
  assert.equal(f.errors[0].status, 503)
  assert.ok(f.calls.some(([name, sql]) => name === 'sql' && sql === 'rollback'))
  assert.equal(f.roleState.currentUser, 'portal_app')
  assert.ok(f.calls.some(([name, sql]) => name === 'sql' && sql.includes('select session_user::text as session_user')))
})

test('brak SET ROLE zatrzymuje Grafik i bezpiecznie cofa transakcję', async () => {
  const f = fixture({ failSetRole: true })
  await f.api.handle({ method: 'GET' }, {}, new URL('http://localhost/api/portal/workforce-schedule/bootstrap?orgId=bestclean&from=2026-08-24&to=2026-08-30'))
  assert.equal(f.errors[0].status, 503)
  assert.equal(f.errors[0].code, 'WORKFORCE_SCHEDULE_DB_ROLE_NOT_READY')
  assert.ok(f.calls.findIndex(([name]) => name === 'authorize') < f.calls.findIndex(([name, sql]) => name === 'sql' && sql === 'set local role workforce_schedule_app'))
  assert.equal(f.calls.some(([name]) => name === 'tenant'), false)
  assert.equal(f.roleState.currentUser, 'portal_app')
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
  assert.deepEqual(f.responses[0].payload.effects, noEffects())
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
  const f = fixture({
    body: { type: 'SYNC_CATALOGS', orgId: 'bestclean', idempotencyKey: 'sync-1', effects: noEffects(), payload: {} },
    claim: { replay: true, response: { ok: true, people: [{ personId: 'existing' }], effects: noEffects() } },
  })
  await f.api.handle({ method: 'POST' }, {}, new URL('http://localhost/api/portal/workforce-schedule/commands'))
  assert.equal(f.errors.length, 0)
  assert.equal(f.responses[0].payload.idempotent, true)
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
