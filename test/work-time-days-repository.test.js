'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const { buildWorkTimeDay } = require('../work-time-days-policy')
const { createWorkTimeDaysRepository } = require('../work-time-days-repository')

function databaseFixture({ auditInsertFails = false, schemaReady = true } = {}) {
  const calls = []
  const workdays = [{
    org_id: 'ORG-1', workday_id: 'WD-1', worker_login: 'W034', worker_name: 'Małgorzata Piprek',
    start_at: '2026-08-01T06:00:00.000Z', end_at: null, status: 'RUNNING', duration_sec: 0,
    business_date_ymd: '2026-08-01', updated_at: '2026-08-02T08:00:00.000Z', utility_room_id: 'Z-1',
  }]
  const events = [{
    org_id: 'ORG-1', event_id: 'EV-1', workday_id: 'WD-1', worker_login: 'W034',
    start_at: '2026-08-01T06:15:00.000Z', end_at: '2026-08-01T06:30:00.000Z',
    status: 'CLOSED', zone_id: 'Z-1', updated_at: '2026-08-02T08:00:00.000Z',
  }]
  const client = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim().toLowerCase()
      calls.push({ sql: normalized, params })
      if (normalized === 'begin' || normalized === 'commit' || normalized === 'rollback') return { rows: [] }
      if (normalized.includes('from information_schema.columns')) {
        return { rows: [{ audit_ready: schemaReady, business_date_column_ready: schemaReady }] }
      }
      if (normalized.includes("from public.worker where org_id")) {
        return { rows: [{ login: 'W034', full_name: 'Małgorzata Piprek', auth_uid: 'WORKER-UID' }] }
      }
      if (normalized.includes("to_regclass('public.workday_reconciliation_audit')")) return { rows: [{ ready: true }] }
      if (normalized.includes('pg_advisory_xact_lock')) return { rows: [{}] }
      if (normalized.includes('select request_hash, response_snapshot')) return { rows: [] }
      if (normalized.startsWith('select z.id, z.client_id, z.location')) {
        return params[1] === 'Z-2'
          ? { rows: [{ id: 'Z-2', client_id: 'C-2', location: 'Piętro 2' }] }
          : { rows: [] }
      }
      if (normalized.startsWith('select w.*')) return { rows: workdays.map((row) => ({ ...row })) }
      if (normalized.startsWith('select e.*')) return { rows: events.map((row) => ({ ...row })) }
      if (normalized.startsWith('update public.workday')) {
        const row = workdays.find((entry) => entry.workday_id === params[2])
        row.start_at = params[3]
        row.end_at = params[4]
        row.duration_sec = params[5]
        row.status = params[4] ? 'CLOSED' : 'RUNNING'
        row.updated_by = params[6]
        row.utility_room_id = params[7]
        return { rowCount: 1, rows: [] }
      }
      if (normalized.startsWith('update public.event')) return { rowCount: 1, rows: [] }
      if (normalized.startsWith('insert into public.workday_reconciliation_audit')) {
        if (auditInsertFails) throw Object.assign(new Error('AUDIT_WRITE_FAILED'), { code: 'XX001' })
        return { rowCount: 1, rows: [] }
      }
      throw new Error(`UNEXPECTED_QUERY: ${normalized}`)
    },
  }
  return { calls, client, events, workdays }
}

test('read-only day works before the additive migration and exposes all activities', async () => {
  const fixture = databaseFixture({ schemaReady: false })
  const result = await repositoryFor(fixture).read({
    orgId: 'ORG-1', uid: 'ADMIN-UID', workerLogin: 'W034', businessDateYmd: '2026-08-01',
  })

  assert.equal(result.schemaReady, false)
  assert.equal(result.editable, true)
  assert.equal(result.auditAvailable, false)
  assert.equal(result.sessions.length, 1)
  assert.equal(result.sessions[0].activities.length, 1)
  const workdayRead = fixture.calls.find((call) => call.sql.startsWith('select w.*'))
  assert.ok(workdayRead)
  assert.doesNotMatch(workdayRead.sql, /business_date_ymd/)
  assert.match(workdayRead.sql, /stop_zone\.function as stop_zone_function/)
})

function repositoryFor(fixture) {
  return createWorkTimeDaysRepository(fixture.client, {
    authorize: async (_client, request) => ({ scope: 'ORG', uid: request.uid }),
  })
}

function requestValue(fixture, overrides = {}) {
  const day = buildWorkTimeDay({
    workdays: fixture.workdays,
    events: fixture.events,
    businessDateYmd: '2026-08-01',
    orgId: 'ORG-1',
    workerLogin: 'W034',
    now: new Date('2026-08-03T00:00:00.000Z'),
  })
  return {
    expectedVersion: day.version,
    attendanceCorrections: [{ workdayId: 'WD-1', endAt: '2026-08-01T08:00:00.000Z' }],
    activityCorrections: [],
    reason: 'Uzupełnienie brakującego STOP',
    idempotencyKey: 'work-time-repo-0001',
    finalize: true,
    ...overrides,
  }
}

test('transaction closes an attendance Workday, recalculates time and writes immutable audit', async () => {
  const fixture = databaseFixture()
  const result = await repositoryFor(fixture).reconcile({
    orgId: 'ORG-1', uid: 'ADMIN-UID', workerLogin: 'W034', businessDateYmd: '2026-08-01',
    value: requestValue(fixture),
  })

  assert.equal(result.workedSec, 2 * 3600)
  assert.equal(result.integrityState, 'COMPLETE')
  assert.equal(fixture.workdays[0].end_at, '2026-08-01T08:00:00.000Z')
  assert.ok(fixture.calls.some((call) => call.sql.startsWith('insert into public.workday_reconciliation_audit')))
  assert.equal(fixture.calls.at(-1).sql, 'commit')
})

test('transaction corrects time before the additive audit migration', async () => {
  const fixture = databaseFixture({ schemaReady: false })
  const result = await repositoryFor(fixture).reconcile({
    orgId: 'ORG-1', uid: 'ADMIN-UID', workerLogin: 'W034', businessDateYmd: '2026-08-01',
    value: requestValue(fixture),
  })

  assert.equal(result.workedSec, 2 * 3600)
  assert.equal(result.integrityState, 'COMPLETE')
  assert.equal(result.editable, true)
  assert.equal(result.auditAvailable, false)
  assert.equal(result.latestCorrection.stored, false)
  assert.equal(fixture.calls.some((call) => call.sql.startsWith('select request_hash, response_snapshot')), false)
  assert.equal(fixture.calls.some((call) => call.sql.startsWith('insert into public.workday_reconciliation_audit')), false)
  assert.equal(fixture.calls.at(-1).sql, 'commit')
})

test('attendance correction can change the session zone without changing its time', async () => {
  const fixture = databaseFixture()
  const result = await repositoryFor(fixture).reconcile({
    orgId: 'ORG-1', uid: 'ADMIN-UID', workerLogin: 'W034', businessDateYmd: '2026-08-01',
    value: requestValue(fixture, {
      attendanceCorrections: [{
        workdayId: 'WD-1',
        endAt: '2026-08-01T08:00:00.000Z',
        zoneId: 'Z-2',
        clientId: 'C-2',
        location: 'Piętro 2',
      }],
    }),
  })

  assert.equal(result.workedSec, 2 * 3600)
  assert.equal(fixture.workdays[0].utility_room_id, 'Z-2')
  const update = fixture.calls.find((call) => call.sql.startsWith('update public.workday'))
  assert.equal(update.params[7], 'Z-2')
})

test('stale expectedVersion returns 409 before any UPDATE and rolls back', async () => {
  const fixture = databaseFixture()
  await assert.rejects(
    repositoryFor(fixture).reconcile({
      orgId: 'ORG-1', uid: 'ADMIN-UID', workerLogin: 'W034', businessDateYmd: '2026-08-01',
      value: requestValue(fixture, { expectedVersion: 'f'.repeat(64) }),
    }),
    (error) => error?.statusCode === 409 && error?.code === 'WORK_TIME_DAY_CONFLICT',
  )

  assert.equal(fixture.calls.some((call) => call.sql.startsWith('update public.workday')), false)
  assert.equal(fixture.calls.at(-1).sql, 'rollback')
})

test('audit failure rolls the transaction back after the data validation succeeds', async () => {
  const fixture = databaseFixture({ auditInsertFails: true })
  await assert.rejects(
    repositoryFor(fixture).reconcile({
      orgId: 'ORG-1', uid: 'ADMIN-UID', workerLogin: 'W034', businessDateYmd: '2026-08-01',
      value: requestValue(fixture),
    }),
    /AUDIT_WRITE_FAILED/,
  )

  assert.ok(fixture.calls.some((call) => call.sql.startsWith('update public.workday')))
  assert.equal(fixture.calls.at(-1).sql, 'rollback')
})
