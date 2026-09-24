'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  MOBILE_WORKFORCE_SCHEDULE_CONTRACT_VERSION,
  MOBILE_WORKFORCE_SCHEDULE_PATH,
  createMobileWorkforceScheduleApi,
} = require('../mobile-workforce-schedule-api')
const {
  createMobileWorkforceScheduleRepository,
  mapDeliveredShift,
} = require('../mobile-workforce-schedule-repository')
const {
  isWorkforceScheduleDeliveryAllowed,
  resolveWorkforceScheduleDeliveryPolicy,
} = require('../workforce-schedule-rollout-policy')

function apiFixture(options = {}) {
  const calls = []
  const errors = []
  const responses = []
  let currentRole = 'workforce_schedule_session'
  const client = {
    async query(statement) {
      const sql = String(statement).trim().toLowerCase()
      calls.push(['query', sql])
      if (sql === 'set local role workforce_schedule_app') currentRole = 'workforce_schedule_app'
      if (sql === 'commit' || sql === 'rollback') currentRole = 'workforce_schedule_session'
      if (sql.includes('session_user::text')) {
        return { rows: [{ session_user: 'workforce_schedule_session', current_user: currentRole }] }
      }
      return { rows: [] }
    },
    release(destroy) { calls.push(['release', destroy]) },
  }
  const repository = {
    async setTenantContext(orgId) { calls.push(['tenant', orgId]) },
    async setActorContext(uid) { calls.push(['actor', uid]) },
    async schemaReady() { return { ready: true, missing: [] } },
    async deliverySchemaReady() { return options.deliverySchema || { ready: true, missing: [] } },
    async resolveOwnPerson(scope) { calls.push(['person', scope]); return { personId: 'person-own' } },
    async resolveScheduleTimeZone() { return 'Europe/Warsaw' },
    async listOwnDeliveredShifts(scope) {
      calls.push(['shifts', scope])
      if (options.listError) throw options.listError
      return [{ shiftId: 'shift-1', revision: 3 }]
    },
  }
  const api = createMobileWorkforceScheduleApi({
    async authorize(_client, scope) {
      calls.push(['authorize', scope])
      return options.access || { scope: 'OWN', workerId: 'W006' }
    },
    async connectDbClient() { calls.push(['connect']); return client },
    parseBearerToken() { return options.token === undefined ? 'firebase-token' : options.token },
    async resolveSession() { calls.push(['resolve']); return options.session || { orgId: 'bestclean', workerId: 'W006' } },
    sendMobileApiError(_res, status, code, message, details) { errors.push({ status, code, message, details }) },
    sendMobileJson(_res, status, payload) { responses.push({ status, payload }) },
    async verifyFirebaseIdToken() { return { uid: 'firebase-uid-6' } },
    createRepository() { return repository },
    isDeliveryEnabled(orgId) {
      calls.push(['gate', orgId || ''])
      return typeof options.deliveryEnabled === 'function'
        ? options.deliveryEnabled(orgId)
        : options.deliveryEnabled !== false
    },
  })
  const res = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value },
    writeHead(status, headers) { this.status = status; this.headers = { ...this.headers, ...headers } },
    end() { this.ended = true },
  }
  const request = (suffix, method = 'GET') => api.handle(
    { method },
    res,
    new URL(`https://portal.cleanzi.pl${MOBILE_WORKFORCE_SCHEDULE_PATH}${suffix}`),
  )
  return { calls, errors, request, responses, res }
}

test('OPTIONS kończy się 204 bez uwierzytelnienia i nie wpada do proxy', async () => {
  const ctx = apiFixture({ token: '', deliveryEnabled: false })
  await ctx.request('', 'OPTIONS')
  assert.equal(ctx.res.status, 204)
  assert.equal(ctx.res.headers['Access-Control-Allow-Methods'], 'GET, OPTIONS')
  assert.equal(ctx.calls.length, 0)
})

test('globalna i organizacyjna brama delivery blokują fail-closed przed DB', async () => {
  const global = apiFixture({ deliveryEnabled: false })
  await global.request('?from=2026-09-01&to=2026-09-07')
  assert.equal(global.errors[0]?.code, 'MOBILE_WORKFORCE_SCHEDULE_DELIVERY_DISABLED')
  assert.equal(global.calls.some((call) => call[0] === 'connect'), false)

  const organization = apiFixture({ deliveryEnabled: (orgId) => !orgId })
  await organization.request('?from=2026-09-01&to=2026-09-07')
  assert.equal(organization.errors[0]?.code, 'MOBILE_WORKFORCE_SCHEDULE_DELIVERY_DISABLED')
  assert.deepEqual(organization.calls.filter((call) => call[0] === 'gate'), [['gate', ''], ['gate', 'bestclean']])
  assert.equal(organization.calls.some((call) => call[0] === 'connect'), false)
})

test('endpoint odrzuca parametry tożsamości i zakres powyżej 31 dni przed DB', async () => {
  for (const suffix of [
    '?from=2026-09-01&to=2026-09-07&orgId=bestclean',
    '?from=2026-09-01&to=2026-09-07&workerId=W006',
    '?from=2026-09-01&to=2026-10-02',
  ]) {
    const ctx = apiFixture()
    await ctx.request(suffix)
    assert.equal(ctx.errors[0]?.status, 400)
    assert.equal(ctx.calls.some((call) => call[0] === 'connect'), false)
  }
})

test('GET zwraca ścisły kontrakt tylko dla OWN i używa transakcji read-only', async () => {
  const ctx = apiFixture()
  await ctx.request('?from=2026-09-01&to=2026-09-07')
  assert.equal(ctx.errors.length, 0)
  assert.deepEqual(ctx.responses[0], {
    status: 200,
    payload: {
      ok: true,
      contractVersion: MOBILE_WORKFORCE_SCHEDULE_CONTRACT_VERSION,
      timeZone: 'Europe/Warsaw',
      from: '2026-09-01',
      to: '2026-09-07',
      shifts: [{ shiftId: 'shift-1', revision: 3 }],
    },
  })
  assert.ok(ctx.calls.some((call) => call[0] === 'query' && call[1].startsWith('begin isolation level repeatable read read only')))
  assert.ok(ctx.calls.some((call) => call[0] === 'query' && call[1] === 'commit'))
  assert.deepEqual(ctx.calls.at(-1), ['release', false])

  const broad = apiFixture({ access: { scope: 'ALL', workerId: 'W006' } })
  await broad.request('?from=2026-09-01&to=2026-09-07')
  assert.equal(broad.errors[0]?.code, 'MOBILE_WORKFORCE_SCHEDULE_SCOPE_INVALID')
  assert.ok(broad.calls.some((call) => call[0] === 'query' && call[1] === 'rollback'))
})

test('policy delivery wymaga obu flag, obu allowlist i wyłączonych efektów zewnętrznych', () => {
  const environment = {
    WORKFORCE_SCHEDULE_ENABLED: 'true',
    WORKFORCE_SCHEDULE_ROLLOUT_MODE: 'CANARY',
    WORKFORCE_SCHEDULE_ALLOWED_ORG_IDS: 'bestclean',
    WORKFORCE_SCHEDULE_DELIVERY_ENABLED: 'true',
    WORKFORCE_SCHEDULE_DELIVERY_ALLOWED_ORG_IDS: 'bestclean',
    WORKFORCE_SCHEDULE_NOTIFICATIONS_ENABLED: 'false',
    WORKFORCE_SCHEDULE_DOWNSTREAM_ENABLED: 'false',
  }
  const policy = resolveWorkforceScheduleDeliveryPolicy(environment)
  assert.equal(policy.enabled, true)
  assert.equal(isWorkforceScheduleDeliveryAllowed(policy, 'bestclean'), true)
  assert.equal(isWorkforceScheduleDeliveryAllowed(policy, 'other-org'), false)
  assert.equal(resolveWorkforceScheduleDeliveryPolicy({ ...environment, WORKFORCE_SCHEDULE_NOTIFICATIONS_ENABLED: 'true' }).enabled, false)
  assert.equal(resolveWorkforceScheduleDeliveryPolicy({ ...environment, WORKFORCE_SCHEDULE_DELIVERY_ALLOWED_ORG_IDS: '' }).enabled, false)
})

test('repozytorium mapuje dostarczoną rewizję i czyta tylko własne przypisanie', async () => {
  const queries = []
  const client = {
    async query(sql, parameters) {
      queries.push({ sql: String(sql), parameters })
      if (String(sql).includes('from public.workforce_schedule_shift h')) return { rows: [] }
      return { rows: [] }
    },
  }
  const repository = createMobileWorkforceScheduleRepository(client)
  assert.deepEqual(await repository.listOwnDeliveredShifts({
    orgId: 'bestclean', personId: 'person-own', from: '2026-09-01', to: '2026-09-07',
  }), [])
  const read = queries.find(({ sql }) => sql.includes('from public.workforce_schedule_shift h'))
  assert.deepEqual(read.parameters, ['bestclean', '2026-09-01', '2026-09-07', 'person-own'])
  assert.match(read.sql, /h\.delivered_revision_no is not null/)
  assert.match(read.sql, /assignment\.revision_no = h\.delivered_revision_no/)
  assert.match(read.sql, /assignment\.person_id = \$4::text/)

  const mapped = mapDeliveredShift({
    shift_id: 'shift-1',
    delivered_revision_no: 3,
    business_date: '2026-09-01',
    local_start_time: '08:00:00',
    local_end_time: '16:00:00',
    starts_at: '2026-09-01T06:00:00.000Z',
    ends_at: '2026-09-01T14:00:00.000Z',
    time_zone: 'Europe/Warsaw',
    break_minutes: 30,
    title: 'Zmiana',
    notes: 'Notatka',
    location_id: 'loc-1',
    location_source_object_id: 'object-1',
    location_name: 'Best Clean',
    instructions: [{ position: 2, text: 'B' }, { position: 1, text: 'A' }],
  })
  assert.equal(mapped.revision, 3)
  assert.deepEqual(mapped.instructions, ['A', 'B'])
  assert.deepEqual(Object.keys(mapped), [
    'shiftId', 'revision', 'date', 'startTime', 'endTime', 'startsAt', 'endsAt',
    'breakMinutes', 'title', 'notes', 'location', 'instructions',
  ])
})

test('readiness delivery sprawdza dokladne typy i definicje ograniczen', async () => {
  const queries = []
  const client = {
    async query(sql, parameters) {
      const source = String(sql)
      queries.push({ sql: source, parameters })
      if (source.includes('left join pg_attribute')) {
        return {
          rows: JSON.parse(parameters[0]).map((requirement) => ({
            relation_name: requirement.relation_name,
            column_name: requirement.column_name,
            column_ready: true,
            exact_type: true,
            exact_nullability: true,
            exact_default: true,
            exact_storage: true,
          })),
        }
      }
      if (source.includes('left join pg_constraint')) {
        return {
          rows: JSON.parse(parameters[0]).map((requirement) => ({
            relation_name: requirement.relation_name,
            constraint_name: requirement.constraint_name,
            constraint_ready: true,
            exact_type: true,
            exact_validation: true,
            exact_deferrability: true,
            exact_definition: true,
          })),
        }
      }
      throw new Error('UNEXPECTED_QUERY')
    },
  }
  const repository = createMobileWorkforceScheduleRepository(client)
  assert.deepEqual(await repository.deliverySchemaReady(), { ready: true, missing: [] })
  const columnCheck = queries.find(({ sql }) => sql.includes('left join pg_attribute'))
  const constraintCheck = queries.find(({ sql }) => sql.includes('left join pg_constraint'))
  assert.match(columnCheck.sql, /to_regtype\(required\.type_name\)/)
  assert.match(constraintCheck.sql, /pg_get_expr\(target\.conbin/)
  assert.match(constraintCheck.sql, /unnest\(target\.conkey\)/)
  assert.match(constraintCheck.sql, /unnest\(target\.confkey\)/)
  assert.equal(JSON.parse(columnCheck.parameters[0]).length, 3)
  assert.equal(JSON.parse(constraintCheck.parameters[0]).length, 4)
})
