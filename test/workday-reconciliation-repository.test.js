'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  createWorkdayReconciliationRepository,
} = require('../workday-reconciliation-repository')
const {
  reconciliationSessionVersion,
  warsawBusinessDateYmd,
} = require('../workday-reconciliation-policy')

const NOW = new Date('2026-08-03T10:00:00.000Z')

function baseWorkday(overrides = {}) {
  return {
    org_id: 'ORG-1',
    workday_id: 'WD-23',
    worker_login: 'W034',
    worker_name: 'Malgorzata Piprek',
    worker_auth_uid: 'WORKER-UID',
    start_at: new Date('2026-07-23T11:51:00.000Z'),
    end_at: new Date('2026-07-23T19:36:00.000Z'),
    duration_sec: 208 * 3600 + 51 * 60,
    status: 'CLOSED',
    comment: 'STOP 21:36',
    updated_at: new Date('2026-07-23T20:00:00.000Z'),
    updated_by: 'ADMIN-OLD',
    business_date_ymd: '2026-07-23',
    ...overrides,
  }
}

function baseSessions() {
  return [
    { org_id: 'ORG-1', event_id: 'E-1', workday_id: 'WD-23', worker_login: 'W034', start_at: '2026-07-23T12:47:00.000Z', end_at: '2026-07-23T15:02:00.000Z', status: 'CLOSED' },
    { org_id: 'ORG-1', event_id: 'E-2', workday_id: 'WD-23', worker_login: 'W034', start_at: '2026-07-23T15:46:00.000Z', end_at: '2026-07-23T17:22:00.000Z', status: 'CLOSED' },
    { org_id: 'ORG-1', event_id: 'E-3', workday_id: 'WD-23', worker_login: 'W034', start_at: '2026-07-23T17:42:00.000Z', end_at: null, status: 'RUNNING' },
  ]
}

class FakeClient {
  constructor({
    auditConstraintsReady = true,
    auditDeleteGuardReady = true,
    auditPrimaryKeyReady = true,
    auditReady = true,
    auditTruncateGuardReady = true,
    auditUpdateGuardReady = true,
    businessDateColumnReady = true,
    businessDateConstraintReady = true,
    businessDateReady = true,
    businessDateTriggerReady = true,
    failAuditInsert = false,
    idempotencyReady = true,
    workday = baseWorkday(),
    workdays,
    sessions = baseSessions(),
  } = {}) {
    this.auditConstraintsReady = auditConstraintsReady
    this.auditDeleteGuardReady = auditDeleteGuardReady
    this.auditPrimaryKeyReady = auditPrimaryKeyReady
    this.auditReady = auditReady
    this.auditTruncateGuardReady = auditTruncateGuardReady
    this.auditUpdateGuardReady = auditUpdateGuardReady
    this.businessDateColumnReady = businessDateReady && businessDateColumnReady
    this.businessDateConstraintReady = businessDateReady && businessDateConstraintReady
    this.businessDateReady = this.businessDateColumnReady && this.businessDateConstraintReady
    this.businessDateTriggerReady = businessDateTriggerReady
    this.failAuditInsert = failAuditInsert
    this.idempotencyReady = idempotencyReady
    this.workday = { ...workday }
    this.workdays = (workdays || [workday]).map((row) => ({ ...row }))
    this.sessions = sessions.map((row) => ({ ...row }))
    this.audit = null
    this.calls = []
  }

  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim().toLowerCase()
    this.calls.push({ sql: normalized, params })
    if (['begin', 'commit', 'rollback'].includes(normalized)) return { rows: [] }
    if (normalized.includes('information_schema.columns') && normalized.includes('audit_ready')) {
      return { rows: [{
        audit_constraints_ready: this.auditConstraintsReady,
        audit_delete_guard_ready: this.auditDeleteGuardReady,
        audit_primary_key_ready: this.auditPrimaryKeyReady,
        audit_ready: this.auditReady,
        audit_truncate_guard_ready: this.auditTruncateGuardReady,
        audit_update_guard_ready: this.auditUpdateGuardReady,
        business_date_column_ready: this.businessDateColumnReady,
        business_date_constraint_ready: this.businessDateConstraintReady,
        business_date_trigger_ready: this.businessDateTriggerReady,
        idempotency_ready: this.idempotencyReady,
      }] }
    }
    if (normalized.includes('pg_advisory_xact_lock')) return { rows: [{}] }
    if (normalized.startsWith('select request_hash, response_snapshot')) {
      return { rows: this.audit ? [{ request_hash: this.audit.requestHash, response_snapshot: this.audit.response }] : [] }
    }
    if (normalized.startsWith('select audit_id, actor_uid')) {
      return { rows: [] }
    }
    if (normalized.startsWith('select w.workday_id') && normalized.includes('and w.worker_login = $2::text')) {
      const rows = this.workdays.filter((row) => {
        const canonicalDate = this.businessDateReady && String(row.business_date_ymd || '').trim()
          ? String(row.business_date_ymd).trim()
          : warsawBusinessDateYmd(row.start_at)
        return row.org_id === params[0] && row.worker_login === params[1] && canonicalDate === params[2]
      })
      return { rows: rows.map((row) => ({ workday_id: row.workday_id })) }
    }
    if (normalized.includes('from public.workday w')) {
      return { rows: this.workday ? [{ ...this.workday }] : [] }
    }
    if (normalized.includes('from public.event')) {
      return { rows: this.sessions.map((row) => ({ ...row })) }
    }
    if (normalized.startsWith('update public.event')) {
      assert.equal(params.length, 11, 'event update must bind exactly every SQL placeholder')
      const row = this.sessions.find((entry) => entry.event_id === params[2])
      row.start_at = params[3]
      row.end_at = params[4]
      row.duration_sec = params[5]
      row.status = params[6]
      row.close_marked_at = params[7]
      row.end_reason = params[8] || null
      row.comment = params[9]
      row.updated_at = params[10]
      return { rows: [], rowCount: 1 }
    }
    if (normalized.startsWith('update public.workday')) {
      this.workday = {
        ...this.workday,
        end_at: params[2],
        duration_sec: params[3],
        status: params[4],
        updated_at: params[5],
        updated_by: params[6],
        business_date_ymd: params[7],
      }
      this.workdays = this.workdays.map((row) => row.workday_id === this.workday.workday_id
        ? { ...row, ...this.workday }
        : row)
      return { rows: [{ ...this.workday }], rowCount: 1 }
    }
    if (normalized.startsWith('insert into public.workday_reconciliation_audit')) {
      if (this.failAuditInsert) throw Object.assign(new Error('audit failed'), { code: 'XX001' })
      this.audit = { requestHash: params[4], response: params[9] }
      return { rows: [], rowCount: 1 }
    }
    throw new Error(`Unexpected query: ${normalized}`)
  }
}

function createRepository(client, access = { role: 'ADMIN', scope: 'ALL', uid: 'ADMIN-1' }, onAuthorize = () => {}) {
  return createWorkdayReconciliationRepository(client, {
    now: () => NOW,
    async authorize(_client, input) {
      onAuthorize(input)
      return { ...access, uid: input.uid }
    },
  })
}

function correctionValue(overrides = {}) {
  return {
    expectedUpdatedAt: '2026-07-23T20:00:00.000Z',
    expectedSessionVersion: reconciliationSessionVersion(baseSessions()),
    sessionCorrections: [{ eventId: 'E-3', endAt: '2026-07-23T19:36:00.000Z' }],
    workdayEndAt: '2026-07-23T19:36:00.000Z',
    reason: 'STOP potwierdzony przez administratora',
    idempotencyKey: 'WD-23-repair-0001',
    finalize: true,
    ...overrides,
  }
}

test('GET dziala przed migracja, wylicza businessDate z start_at i nie czyta tabeli audytu', async () => {
  const client = new FakeClient({ auditReady: false, businessDateReady: false })
  const repository = createRepository(client)
  const result = await repository.read({ orgId: 'ORG-1', uid: 'ADMIN-1', workdayId: 'WD-23' })

  assert.equal(result.schemaReady, false)
  assert.equal(result.businessDateYmd, '2026-07-23')
  assert.equal(result.provisionalSec, 3 * 3600 + 51 * 60)
  assert.equal(result.openSessions.length, 1)
  assert.equal(client.calls.some((call) => call.sql.includes('select audit_id, actor_uid')), false)
})

test('GET przed migracja akceptuje wiele Workday tej samej daty i zwraca ich ID informacyjnie', async () => {
  const sessions = baseSessions()
  sessions[2].end_at = '2026-07-23T19:36:00.000Z'
  sessions[2].status = 'CLOSED'
  const workday = baseWorkday({ duration_sec: 5 * 3600 + 45 * 60 })
  const client = new FakeClient({
    auditReady: false,
    businessDateReady: false,
    workday,
    workdays: [
      workday,
      baseWorkday({ workday_id: 'WD-23-DUPLICATE', updated_at: new Date('2026-07-23T20:01:00.000Z') }),
    ],
    sessions,
  })
  const repository = createRepository(client)

  const result = await repository.read({ orgId: 'ORG-1', uid: 'ADMIN-1', workdayId: 'WD-23' })

  assert.equal(result.integrityState, 'COMPLETE')
  assert.equal(result.canFinalize, true)
  assert.equal(result.confirmedSec, 5 * 3600 + 45 * 60)
  assert.equal(result.provisionalSec, 0)
  assert.deepEqual(result.businessDateWorkdayIds, ['WD-23', 'WD-23-DUPLICATE'])
  assert.equal(result.issues.some((entry) => entry.code === 'MULTIPLE_WORKDAYS_FOR_BUSINESS_DATE'), false)
  const duplicateLookup = client.calls.find((call) => call.sql.startsWith('select w.workday_id'))
  assert.ok(duplicateLookup)
  assert.doesNotMatch(duplicateLookup.sql, /business_date_ymd/)
  assert.match(duplicateLookup.sql, /at time zone 'europe\/warsaw'/)
})

test('POST przed migracja zwraca czytelne 503 i wykonuje rollback bez zmian', async () => {
  const client = new FakeClient({ auditReady: false, businessDateReady: false })
  const repository = createRepository(client)

  await assert.rejects(
    repository.reconcile({ orgId: 'ORG-1', uid: 'ADMIN-1', workdayId: 'WD-23', value: correctionValue() }),
    (error) => error.statusCode === 503 && error.code === 'WORKDAY_RECONCILIATION_SCHEMA_MISSING',
  )
  assert.deepEqual(client.calls.filter((call) => ['begin', 'rollback'].includes(call.sql)).map((call) => call.sql), ['begin', 'rollback'])
  assert.equal(client.calls.some((call) => call.sql.startsWith('update ')), false)
})

test('POST pozostaje zablokowany po częściowym schemacie bez zabezpieczeń migracji', async () => {
  const client = new FakeClient({
    auditConstraintsReady: false,
    auditDeleteGuardReady: false,
    auditPrimaryKeyReady: false,
    auditTruncateGuardReady: false,
    auditUpdateGuardReady: false,
    businessDateConstraintReady: false,
    businessDateTriggerReady: false,
    idempotencyReady: false,
  })
  const repository = createRepository(client)

  const readResult = await repository.read({ orgId: 'ORG-1', uid: 'ADMIN-1', workdayId: 'WD-23' })
  assert.equal(readResult.schemaReady, false)
  await assert.rejects(
    repository.reconcile({ orgId: 'ORG-1', uid: 'ADMIN-1', workdayId: 'WD-23', value: correctionValue() }),
    (error) =>
      error.statusCode === 503 &&
      error.code === 'WORKDAY_RECONCILIATION_SCHEMA_MISSING' &&
      error.details?.idempotencyReady === false &&
      error.details?.businessDateConstraintReady === false &&
      error.details?.auditPrimaryKeyReady === false &&
      error.details?.auditTruncateGuardReady === false,
  )
  assert.equal(client.calls.some((call) => call.sql.startsWith('update ')), false)
})

test('transakcja uzupelnia STOP, przelicza 05:45, zamyka Workday i zapisuje immutable audit', async () => {
  const client = new FakeClient()
  const repository = createRepository(client)
  const result = await repository.reconcile({
    orgId: 'ORG-1', uid: 'ADMIN-1', workdayId: 'WD-23', value: correctionValue(),
  })

  assert.equal(result.integrityState, 'COMPLETE')
  assert.equal(result.confirmedSec, 5 * 3600 + 45 * 60)
  assert.equal(result.provisionalSec, 0)
  assert.equal(result.openSessions.length, 0)
  assert.equal(result.version, NOW.toISOString())
  assert.equal(client.workday.duration_sec, 5 * 3600 + 45 * 60)
  assert.equal(client.workday.status, 'CLOSED')
  assert.equal(client.sessions[2].status, 'CLOSED')
  assert.equal(client.sessions[2].duration_sec, 1 * 3600 + 54 * 60)
  assert.ok(client.audit)
  assert.equal(client.calls.at(-1).sql, 'commit')
})

test('finalizacja pozwala na wiele Workday pracownika dla tej samej daty biznesowej', async () => {
  const workday = baseWorkday()
  const client = new FakeClient({
    workday,
    workdays: [
      workday,
      baseWorkday({ workday_id: 'WD-23-DUPLICATE', updated_at: new Date('2026-07-23T20:01:00.000Z') }),
    ],
  })
  const repository = createRepository(client)

  const result = await repository.reconcile({
    orgId: 'ORG-1', uid: 'ADMIN-1', workdayId: 'WD-23', value: correctionValue(),
  })
  assert.equal(result.integrityState, 'COMPLETE')
  assert.equal(result.confirmedSec, 5 * 3600 + 45 * 60)
  assert.deepEqual(result.businessDateWorkdayIds, ['WD-23', 'WD-23-DUPLICATE'])
  assert.equal(result.issues.some((entry) => entry.code === 'MULTIPLE_WORKDAYS_FOR_BUSINESS_DATE'), false)
  const duplicateLookup = client.calls.find((call) =>
    call.sql.startsWith('select w.workday_id') && call.sql.includes('for update of w'))
  assert.ok(duplicateLookup)
  assert.equal(client.calls.filter((call) => call.sql.includes('pg_advisory_xact_lock')).length, 2)
  assert.equal(client.calls.some((call) => call.sql.startsWith('update public.event')), true)
  assert.equal(client.calls.at(-1).sql, 'commit')
})

test('korekta businessDate moze przeniesc Workday z duplikatu na wolna date bez finalizacji', async () => {
  const sessions = baseSessions().map((row) => ({
    ...row,
    start_at: row.start_at.replace('2026-07-23', '2026-07-24'),
    end_at: row.end_at?.replace('2026-07-23', '2026-07-24') || null,
  }))
  const workday = baseWorkday({
    start_at: new Date('2026-07-24T11:51:00.000Z'),
    end_at: new Date('2026-07-24T19:36:00.000Z'),
    business_date_ymd: '2026-07-23',
  })
  const value = correctionValue({
    expectedSessionVersion: reconciliationSessionVersion(sessions),
    sessionCorrections: [],
    businessDateYmd: '2026-07-24',
    idempotencyKey: 'WD-23-business-date-repair-1',
    finalize: false,
  })
  delete value.workdayEndAt
  const client = new FakeClient({
    workday,
    workdays: [
      workday,
      baseWorkday({ workday_id: 'WD-23-DUPLICATE' }),
    ],
    sessions,
  })
  const repository = createRepository(client)

  const result = await repository.reconcile({
    orgId: 'ORG-1', uid: 'ADMIN-1', workdayId: 'WD-23', value,
  })

  assert.equal(result.businessDateYmd, '2026-07-24')
  assert.deepEqual(result.businessDateWorkdayIds, ['WD-23'])
  assert.equal(result.issues.some((entry) => entry.code === 'MULTIPLE_WORKDAYS_FOR_BUSINESS_DATE'), false)
  assert.equal(result.integrityState, 'OPEN_SESSION')
  assert.equal(result.canFinalize, false)
  assert.equal(client.workday.business_date_ymd, '2026-07-24')
  assert.equal(client.calls.filter((call) => call.sql.startsWith('select w.workday_id')).length, 2)
  assert.equal(client.calls.at(-1).sql, 'commit')
})

test('finalizacja może rozszerzyć stary koniec Workday do STOP naprawianej sesji', async () => {
  const client = new FakeClient({
    workday: baseWorkday({
      end_at: new Date('2026-07-23T17:22:00.000Z'),
      duration_sec: 3 * 3600 + 51 * 60,
    }),
  })
  const repository = createRepository(client)
  const result = await repository.reconcile({
    orgId: 'ORG-1', uid: 'ADMIN-1', workdayId: 'WD-23', value: correctionValue(),
  })

  assert.equal(result.integrityState, 'COMPLETE')
  assert.equal(result.confirmedSec, 5 * 3600 + 45 * 60)
  assert.equal(client.workday.end_at, '2026-07-23T19:36:00.000Z')
  assert.equal(client.calls.at(-1).sql, 'commit')
})

test('korekta komentarza otwartej sesji nie ustawia CLOSE ani powodu zamkniecia', async () => {
  const client = new FakeClient()
  const repository = createRepository(client)
  const value = correctionValue({
    sessionCorrections: [{ eventId: 'E-3', comment: 'Godzina STOP czeka na potwierdzenie' }],
    finalize: false,
    idempotencyKey: 'WD-23-repair-comment-1',
  })
  delete value.workdayEndAt
  const result = await repository.reconcile({
    orgId: 'ORG-1',
    uid: 'ADMIN-1',
    workdayId: 'WD-23',
    value,
  })

  assert.equal(result.integrityState, 'OPEN_SESSION')
  assert.equal(client.sessions[2].status, 'RUNNING')
  assert.equal(client.sessions[2].close_marked_at, null)
  assert.equal(client.sessions[2].end_reason, null)
  assert.equal(client.workday.status, 'RUNNING')
  assert.equal(client.workday.end_at, null)
})

test('repozytorium odrzuca workdayEndAt bez finalize przed rozpoczeciem transakcji', async () => {
  const client = new FakeClient()
  const repository = createRepository(client)

  await assert.rejects(
    repository.reconcile({
      orgId: 'ORG-1',
      uid: 'ADMIN-1',
      workdayId: 'WD-23',
      value: correctionValue({
        sessionCorrections: [],
        idempotencyKey: 'WD-23-end-without-finalize',
        finalize: false,
      }),
    }),
    (error) => error.statusCode === 400 && error.code === 'WORKDAY_END_REQUIRES_FINALIZE',
  )
  assert.deepEqual(client.calls, [])
})

test('idempotentne ponowienie autoryzuje cel przed odczytem snapshotu i omija konflikt starej wersji', async () => {
  const client = new FakeClient()
  let authorizeCount = 0
  const repository = createRepository(client, { role: 'ADMIN', scope: 'ALL', uid: 'ADMIN-1' }, () => { authorizeCount += 1 })
  const first = await repository.reconcile({
    orgId: 'ORG-1', uid: 'ADMIN-1', workdayId: 'WD-23', value: correctionValue(),
  })
  const second = await repository.reconcile({
    orgId: 'ORG-1', uid: 'ADMIN-1', workdayId: 'WD-23', value: correctionValue(),
  })

  assert.deepEqual(second, first)
  assert.equal(authorizeCount, 2)
  const secondBegin = client.calls.map((call) => call.sql).lastIndexOf('begin')
  const calls = client.calls.slice(secondBegin).map((call) => call.sql)
  assert.ok(calls.findIndex((sql) => sql.includes('from public.workday w')) < calls.findIndex((sql) => sql.startsWith('select request_hash')))
  assert.equal(calls.some((sql) => sql.startsWith('update ')), false)
})

test('inna wersja zwraca 409 i nie wykonuje zadnego UPDATE', async () => {
  const client = new FakeClient()
  const repository = createRepository(client)
  await assert.rejects(
    repository.reconcile({
      orgId: 'ORG-1', uid: 'ADMIN-1', workdayId: 'WD-23',
      value: correctionValue({ expectedUpdatedAt: '2026-07-23T19:59:59.000Z' }),
    }),
    (error) => error.statusCode === 409 && error.code === 'WORKDAY_VERSION_CONFLICT',
  )
  assert.equal(client.calls.some((call) => call.sql.startsWith('update ')), false)
  assert.equal(client.calls.at(-1).sql, 'rollback')
})

test('nowsza wersja pojedynczego Eventu również zwraca konflikt 409', async () => {
  const sessions = baseSessions()
  sessions[2].updated_at = new Date('2026-07-23T20:00:01.000Z')
  const client = new FakeClient({ sessions })
  const repository = createRepository(client)

  await assert.rejects(
    repository.reconcile({
      orgId: 'ORG-1', uid: 'ADMIN-1', workdayId: 'WD-23', value: correctionValue(),
    }),
    (error) =>
      error.statusCode === 409 &&
      error.code === 'WORKDAY_VERSION_CONFLICT' &&
      error.details?.actualUpdatedAt === '2026-07-23T20:00:01.000Z',
  )
  assert.equal(client.calls.some((call) => call.sql.startsWith('update ')), false)
  assert.equal(client.calls.at(-1).sql, 'rollback')
})

test('usunięcie sesji po GET zmienia fingerprint i zwraca konflikt 409', async () => {
  const client = new FakeClient()
  const repository = createRepository(client)
  const snapshot = await repository.read({ orgId: 'ORG-1', uid: 'ADMIN-1', workdayId: 'WD-23' })
  client.sessions = client.sessions.filter((session) => session.event_id !== 'E-1')

  await assert.rejects(
    repository.reconcile({
      orgId: 'ORG-1',
      uid: 'ADMIN-1',
      workdayId: 'WD-23',
      value: correctionValue({
        expectedSessionVersion: snapshot.sessionVersion,
        idempotencyKey: 'WD-23-session-delete-conflict',
      }),
    }),
    (error) =>
      error.statusCode === 409 &&
      error.code === 'WORKDAY_VERSION_CONFLICT' &&
      error.details?.actualSessionVersion !== snapshot.sessionVersion,
  )
  assert.equal(client.calls.some((call) => call.sql.startsWith('update ')), false)
  assert.equal(client.calls.at(-1).sql, 'rollback')
})

test('finalizacja z otwarta sesja zwraca 409 i zachowuje dane', async () => {
  const client = new FakeClient()
  const repository = createRepository(client)
  await assert.rejects(
    repository.reconcile({
      orgId: 'ORG-1', uid: 'ADMIN-1', workdayId: 'WD-23',
      value: correctionValue({ sessionCorrections: [] }),
    }),
    (error) => error.statusCode === 409 && error.code === 'WORKDAY_OPEN_SESSIONS',
  )
  assert.equal(client.calls.some((call) => call.sql.startsWith('update ')), false)
  assert.equal(client.calls.at(-1).sql, 'rollback')
})

test('Workday nie może kończyć się przed STOP ostatniej sesji', async () => {
  const client = new FakeClient()
  const repository = createRepository(client)

  await assert.rejects(
    repository.reconcile({
      orgId: 'ORG-1',
      uid: 'ADMIN-1',
      workdayId: 'WD-23',
      value: correctionValue({ workdayEndAt: '2026-07-23T19:00:00.000Z' }),
    }),
    (error) => error.statusCode === 409 && error.code === 'WORKDAY_SESSION_OUTSIDE_ENVELOPE',
  )
  assert.equal(client.calls.some((call) => call.sql.startsWith('update ')), false)
  assert.equal(client.calls.at(-1).sql, 'rollback')
})

test('WORKER moze uzgodnic tylko Workday powiazany z jego Firebase UID', async () => {
  const client = new FakeClient()
  const repository = createRepository(client, { role: 'WORKER', scope: 'OWN', uid: 'OTHER-UID' })
  await assert.rejects(
    repository.read({ orgId: 'ORG-1', uid: 'OTHER-UID', workdayId: 'WD-23' }),
    (error) => error.statusCode === 403 && error.code === 'WORKDAY_RECONCILIATION_FORBIDDEN',
  )
})

test('blad zapisu audytu cofa cala transakcje po aktualizacjach', async () => {
  const client = new FakeClient({ failAuditInsert: true })
  const repository = createRepository(client)
  await assert.rejects(
    repository.reconcile({ orgId: 'ORG-1', uid: 'ADMIN-1', workdayId: 'WD-23', value: correctionValue() }),
    /audit failed/,
  )
  assert.ok(client.calls.some((call) => call.sql.startsWith('update public.event')))
  assert.ok(client.calls.some((call) => call.sql.startsWith('update public.workday')))
  assert.equal(client.calls.at(-1).sql, 'rollback')
})
