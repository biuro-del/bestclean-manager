'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const { jobCardOutputHash, validateJobCardDraft } = require('../job-card/domain')
const { JobCardRepository } = require('../job-card/repository')

function card() {
  return {
    schemaVersion: '1.0.0',
    status: 'DRAFT',
    source: { orderId: 'TASK-001', sourceUpdatedAt: '2026-07-28T12:00:00.000Z' },
    customer: { type: 'B2B', name: 'Best Clean', phone: '500600700' },
    site: {
      mode: 'FIXED_CONTRACT_SITE',
      siteId: 'C001',
      name: 'Best Clean',
      address: 'Żory',
      accessInstruction: 'Wejście główne',
      photos: [{ id: 'P1', url: 'https://example.test/photo.jpg' }],
    },
    schedule: {
      mode: 'ONE_OFF',
      startDateYmd: '2026-07-28',
      serviceBlocks: [{ id: 'main', startTime: '08:00', endTime: '16:00' }],
    },
    service: {
      serviceType: 'GENERAL_CLEANING',
      title: 'Sprzątanie',
      internalDescription: 'Zakres uzgodniony',
      safetyInstruction: 'Rękawice',
      scopeItems: [{ id: 'ZONE-1', title: 'Biuro' }],
    },
    fulfillment: {
      crewSource: 'DISPATCHED',
      dispatchRequired: false,
      assignments: [{ workerId: 'W001', name: 'Rafał Dudek', role: 'LEADER' }],
      vehicle: {},
    },
    resources: { packingRequired: false, supplies: [] },
    commercial: {
      paymentMethod: 'DEFERRED',
      pricingMode: 'MONTHLY_CONTRACT',
      amount: 0,
      contractId: 'CONTRACT-1',
      paymentTermDays: 14,
      currency: 'PLN',
    },
    completion: { complaintPathEnabled: true, returnsEnabled: false, signatureRequired: true },
  }
}

function draftRow(payload, sourceSnapshot = {}, sourceOrderId = 'TASK-001') {
  return {
    base_revision: 0,
    compiler_version: '1.0.0',
    contract_version: '0.1.0-draft.8',
    draft_hash: 'draft-hash',
    draft_id: 'draft-id',
    generation_status: 'READY',
    payload,
    schema_version: '1.0.0',
    source_hash: 'source-hash',
    source_snapshot: sourceSnapshot,
    source_order_id: sourceOrderId,
    updated_at: '2026-07-28T12:00:00.000Z',
    updated_by_uid: 'uid-1',
    validation: validateJobCardDraft(payload),
  }
}

function detachedListRow(index = 0) {
  const sourceOrderId = `DRAFT-${String(index + 1).padStart(3, '0')}`
  const updatedAt = new Date(Date.UTC(2026, 6, 31, 12, 0) - index * 60000).toISOString()
  return {
    assignment_count: index % 3,
    client_id: 'CLIENT-001',
    client_name: 'Best Clean',
    created_at: '2026-07-31T08:00:00.000Z',
    error_count: index % 2,
    generation_status: index % 2 ? 'BLOCKED' : 'READY',
    recurrence_until_ymd: '2026-12-31',
    required_people: 2,
    schedule_mode: 'RECURRING',
    site_address: 'ul. Testowa 1, Zory',
    site_id: 'SITE-001',
    site_name: 'Best Clean',
    source_order_id: sourceOrderId,
    staffing_mode: 'BUFFER',
    start_date_ymd: '2026-08-03',
    title: `Robocze zlecenie ${index + 1}`,
    updated_at: updatedAt,
    warning_count: index % 3,
  }
}

function readDetachedDraftForResume(repository, input) {
  const method = repository.readDetachedDraftForResume ?? repository.readDetachedDraftDetail
  assert.equal(typeof method, 'function', 'Repozytorium nie udostepnia odczytu szkicu do wznowienia')
  return method.call(repository, input)
}

test('zapis odłączonego szkicu nie wymaga ani nie tworzy rekordu task', async () => {
  const payload = card()
  const calls = []
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params })
      if (sql.includes('to_regclass')) return { rows: [{ draft_ready: true, revision_ready: true }] }
      if (sql.includes('from public.task')) return { rows: [] }
      if (sql.includes('insert into public.job_card_draft')) {
        return { rows: [draftRow(payload, JSON.parse(params[9]), 'DRAFT-001')] }
      }
      return { rows: [] }
    },
  }
  const repository = new JobCardRepository(client)
  const saved = await repository.saveDetachedDraft({
    actorUid: 'uid-1',
    card: payload,
    orgId: 'ORG1',
    sourceOrderId: 'DRAFT-001',
    sourceSnapshot: {
      persistenceMode: 'DRAFT_ONLY',
      snapshotVersion: 1,
      order: { id: 'DRAFT-001', title: 'Sprzątanie' },
    },
  })

  assert.equal(saved.sourceOrderId, 'DRAFT-001')
  assert.equal(calls.some((call) => /insert\s+into\s+public\.task/i.test(call.sql)), false)
  assert.equal(calls.some((call) => call.sql.includes('insert into public.job_card_draft')), true)
  const draftInsert = calls.find((call) => call.sql.includes('insert into public.job_card_draft'))
  assert.match(draftInsert.sql, /\$1::varchar\(64\)/)
  assert.match(draftInsert.sql, /\$2::varchar\(180\)/)
})

test('aktualizacja odłączonego szkicu zapisuje tylko wersję zgodną z expectedDraftHash', async () => {
  const payload = card()
  const calls = []
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params })
      if (sql.includes('to_regclass')) return { rows: [{ draft_ready: true, revision_ready: true }] }
      if (sql.includes('from public.job_card_draft') && sql.includes('for update')) {
        return { rows: [draftRow(payload, {}, 'DRAFT-001')] }
      }
      if (sql.includes('from public.task')) return { rows: [] }
      if (sql.includes('insert into public.job_card_draft')) {
        return { rows: [{ ...draftRow(payload, JSON.parse(params[9]), 'DRAFT-001'), draft_hash: 'next-hash' }] }
      }
      return { rows: [] }
    },
  }
  const repository = new JobCardRepository(client)

  const saved = await repository.saveDetachedDraft({
    actorUid: 'uid-1',
    card: payload,
    expectedDraftHash: 'draft-hash',
    orgId: 'ORG1',
    sourceOrderId: 'DRAFT-001',
    sourceSnapshot: {
      persistenceMode: 'DRAFT_ONLY',
      snapshotVersion: 2,
      order: { id: 'DRAFT-001', title: 'Sprzątanie' },
    },
  })

  assert.equal(saved.draftHash, 'next-hash')
  assert.equal(calls.some((call) => call.sql.includes('for update')), true)
  assert.equal(calls.some((call) => call.sql.includes('insert into public.job_card_draft')), true)
})

test('aktualizacja odłączonego szkicu zwraca 409 i niczego nie nadpisuje po konflikcie wersji', async () => {
  const payload = card()
  const calls = []
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params })
      if (sql.includes('to_regclass')) return { rows: [{ draft_ready: true, revision_ready: true }] }
      if (sql.includes('from public.job_card_draft') && sql.includes('for update')) {
        return { rows: [draftRow(payload, {}, 'DRAFT-001')] }
      }
      return { rows: [] }
    },
  }
  const repository = new JobCardRepository(client)

  await assert.rejects(
    repository.saveDetachedDraft({
      actorUid: 'uid-1',
      card: payload,
      expectedDraftHash: 'stale-hash',
      orgId: 'ORG1',
      sourceOrderId: 'DRAFT-001',
      sourceSnapshot: {
        persistenceMode: 'DRAFT_ONLY',
        snapshotVersion: 2,
        order: { id: 'DRAFT-001', title: 'Sprzątanie' },
      },
    }),
    (error) => error.publicCode === 'JOB_CARD_DRAFT_CHANGED' && error.statusCode === 409,
  )
  assert.equal(calls.some((call) => call.sql.includes('insert into public.job_card_draft')), false)
})

test('publikacja blokuje wyścig, zapisuje niezmienną rewizję i projekcję mobilną', async () => {
  const payload = card()
  const calls = []
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params })
      if (sql.includes('to_regclass')) return { rows: [{ draft_ready: true, revision_ready: true }] }
      if (sql.includes('from public.task')) return { rows: [{ id_task: 'TASK-001' }] }
      if (sql.includes('from public.job_card_draft') && sql.includes('for update')) {
        return { rows: [draftRow(payload)] }
      }
      if (sql.includes('from public.job_card_revision') && sql.includes('limit 1')) return { rows: [] }
      if (sql.includes('insert into public.job_card_revision')) {
        return {
          rows: [{
            compiler_version: params[5],
            contract_version: params[6],
            diff: JSON.parse(params[11]),
            mobile_projection: JSON.parse(params[10]),
            output_hash: params[8],
            payload: JSON.parse(params[9]),
            published_at: params[15],
            published_by_uid: params[14],
            revision: params[2],
            revision_id: params[3],
            schema_version: params[4],
            source_hash: params[7],
            source_order_id: params[1],
            warning_acknowledgements: JSON.parse(params[13]),
            warnings: JSON.parse(params[12]),
          }],
        }
      }
      return { rows: [] }
    },
  }
  const repository = new JobCardRepository(client)
  const result = await repository.publishStoredDraft({
    acknowledgements: [],
    actorUid: 'uid-1',
    expectedDraftHash: 'draft-hash',
    orgId: 'ORG1',
    sourceOrderId: 'TASK-001',
  })

  assert.equal(result.idempotent, false)
  assert.equal(result.revision.revision, 1)
  assert.equal(result.revision.payload.status, 'PUBLISHED')
  assert.equal(result.revision.mobileProjection.worker.telemetry.continuousGps, false)
  assert.equal('commercial' in result.revision.mobileProjection.worker, false)
  assert.equal(calls.some((call) => call.sql.includes('pg_advisory_xact_lock')), true)
  assert.equal(calls.some((call) => call.sql.trim() === 'commit'), true)
})

test('identyczna treść jest publikowana idempotentnie bez nowej rewizji', async () => {
  const payload = card()
  const calls = []
  const client = {
    async query(sql) {
      calls.push(sql)
      if (sql.includes('to_regclass')) return { rows: [{ draft_ready: true, revision_ready: true }] }
      if (sql.includes('from public.task')) return { rows: [{ id_task: 'TASK-001' }] }
      if (sql.includes('from public.job_card_draft') && sql.includes('for update')) {
        return { rows: [draftRow(payload)] }
      }
      if (sql.includes('from public.job_card_revision') && sql.includes('limit 1')) {
        return {
          rows: [{
            source_order_id: 'TASK-001',
            revision: 3,
            revision_id: 'revision-3',
            output_hash: jobCardOutputHash(payload),
            payload,
            mobile_projection: {},
            diff: [],
            warnings: [],
            warning_acknowledgements: [],
          }],
        }
      }
      return { rows: [] }
    },
  }
  const repository = new JobCardRepository(client)
  const result = await repository.publishStoredDraft({
    actorUid: 'uid-1',
    expectedDraftHash: 'draft-hash',
    orgId: 'ORG1',
    sourceOrderId: 'TASK-001',
  })

  assert.equal(result.idempotent, true)
  assert.equal(result.revision.revision, 3)
  assert.equal(calls.some((sql) => sql.includes('insert into public.job_card_revision')), false)
})

test('backend publikuje Kartę w trybie BUFOR po jawnym potwierdzeniu braku obsady', async () => {
  const payload = card()
  payload.fulfillment = {
    ...payload.fulfillment,
    staffingMode: 'BUFFER',
    assignments: [],
  }
  const client = {
    async query(sql, params = []) {
      if (sql.includes('to_regclass')) return { rows: [{ draft_ready: true, revision_ready: true }] }
      if (sql.includes('from public.task')) return { rows: [{ id_task: 'TASK-001' }] }
      if (sql.includes('from public.job_card_draft') && sql.includes('for update')) {
        return { rows: [draftRow(payload)] }
      }
      if (sql.includes('from public.job_card_revision') && sql.includes('limit 1')) return { rows: [] }
      if (sql.includes('insert into public.job_card_revision')) {
        return {
          rows: [{
            compiler_version: params[5],
            contract_version: params[6],
            diff: JSON.parse(params[11]),
            mobile_projection: JSON.parse(params[10]),
            output_hash: params[8],
            payload: JSON.parse(params[9]),
            published_at: params[15],
            published_by_uid: params[14],
            revision: params[2],
            revision_id: params[3],
            schema_version: params[4],
            source_hash: params[7],
            source_order_id: params[1],
            warning_acknowledgements: JSON.parse(params[13]),
            warnings: JSON.parse(params[12]),
          }],
        }
      }
      return { rows: [] }
    },
  }
  const repository = new JobCardRepository(client)
  const result = await repository.publishStoredDraft({
    acknowledgements: [{ accepted: true, code: 'ASSIGNEE_REQUIRED' }],
    actorUid: 'uid-1',
    expectedDraftHash: 'draft-hash',
    orgId: 'ORG1',
    sourceOrderId: 'TASK-001',
  })

  assert.equal(result.idempotent, false)
  assert.equal(result.revision.payload.status, 'PUBLISHED')
  assert.equal(result.revision.warnings.some((entry) => (
    entry.code === 'ASSIGNEE_REQUIRED' && entry.severity === 'WARNING'
  )), true)
  assert.equal(result.revision.warningAcknowledgements.some((entry) => (
    entry.code === 'ASSIGNEE_REQUIRED' && entry.accepted === true
  )), true)
})

test('odłączony szkic nie materializuje zadania przed pełną walidacją ostrzeżeń', async () => {
  const payload = card()
  payload.fulfillment = {
    ...payload.fulfillment,
    staffingMode: 'BUFFER',
    assignments: [],
  }
  let materializeCalls = 0
  const client = {
    async query(sql) {
      if (sql.includes('to_regclass')) return { rows: [{ draft_ready: true, revision_ready: true }] }
      if (sql.includes('from public.job_card_draft') && sql.includes('for update')) {
        return {
          rows: [draftRow(payload, {
            persistenceMode: 'DRAFT_ONLY',
            snapshotVersion: 1,
            order: { id: 'DRAFT-001' },
          }, 'DRAFT-001')],
        }
      }
      if (sql.includes('from public.task')) return { rows: [] }
      return { rows: [] }
    },
  }
  const repository = new JobCardRepository(client)

  await assert.rejects(
    repository.publishStoredDraft({
      actorUid: 'uid-1',
      expectedDraftHash: 'draft-hash',
      materializeOrder: async () => { materializeCalls += 1 },
      orgId: 'ORG1',
      sourceOrderId: 'DRAFT-001',
    }),
    (error) => error.publicCode === 'JOB_CARD_WARNINGS_UNCONFIRMED',
  )
  assert.equal(materializeCalls, 0)
})

test('odłączony szkic nie podpina rewizji do obcego zadania o tym samym ID', async () => {
  const payload = card()
  const calls = []
  const client = {
    async query(sql) {
      calls.push(sql)
      if (sql.includes('to_regclass')) return { rows: [{ draft_ready: true, revision_ready: true }] }
      if (sql.includes('from public.job_card_draft') && sql.includes('for update')) {
        return {
          rows: [draftRow(payload, {
            persistenceMode: 'DRAFT_ONLY',
            snapshotVersion: 1,
            order: { id: 'DRAFT-001' },
          }, 'DRAFT-001')],
        }
      }
      if (sql.includes('from public.task')) return { rows: [{ id_task: 'DRAFT-001' }] }
      if (sql.includes('from public.job_card_revision') && sql.includes('limit 1')) return { rows: [] }
      return { rows: [] }
    },
  }
  const repository = new JobCardRepository(client)

  await assert.rejects(
    repository.publishStoredDraft({
      actorUid: 'uid-1',
      expectedDraftHash: 'draft-hash',
      materializeOrder: async () => assert.fail('Nie wolno materializować zadania po wykryciu kolizji.'),
      orgId: 'ORG1',
      sourceOrderId: 'DRAFT-001',
    }),
    (error) => error.publicCode === 'JOB_CARD_ORDER_ID_CONFLICT',
  )
  assert.equal(calls.some((sql) => sql.includes('insert into public.job_card_revision')), false)
  assert.equal(calls.some((sql) => sql.trim() === 'rollback'), true)
})

test('publikacja odłączonego szkicu atomowo materializuje zadanie dokładnie raz', async () => {
  const payload = card()
  let materialized = false
  let materializeCalls = 0
  const calls = []
  const client = {
    async query(sql, params = []) {
      calls.push(sql)
      if (sql.includes('to_regclass')) return { rows: [{ draft_ready: true, revision_ready: true }] }
      if (sql.includes('from public.job_card_draft') && sql.includes('for update')) {
        return {
          rows: [draftRow(payload, {
            persistenceMode: 'DRAFT_ONLY',
            snapshotVersion: 1,
            order: { id: 'DRAFT-001', title: 'Sprzątanie' },
          }, 'DRAFT-001')],
        }
      }
      if (sql.includes('from public.task')) {
        return { rows: materialized ? [{ id_task: 'DRAFT-001' }] : [] }
      }
      if (sql.includes('from public.job_card_revision') && sql.includes('limit 1')) return { rows: [] }
      if (sql.includes('insert into public.job_card_revision')) {
        return {
          rows: [{
            compiler_version: params[5],
            contract_version: params[6],
            diff: JSON.parse(params[11]),
            mobile_projection: JSON.parse(params[10]),
            output_hash: params[8],
            payload: JSON.parse(params[9]),
            published_at: params[15],
            published_by_uid: params[14],
            revision: params[2],
            revision_id: params[3],
            schema_version: params[4],
            source_hash: params[7],
            source_order_id: params[1],
            warning_acknowledgements: JSON.parse(params[13]),
            warnings: JSON.parse(params[12]),
          }],
        }
      }
      return { rows: [] }
    },
  }
  const repository = new JobCardRepository(client)
  const result = await repository.publishStoredDraft({
    actorUid: 'uid-1',
    expectedDraftHash: 'draft-hash',
    materializeOrder: async ({ sourceOrderId, sourceSnapshot }) => {
      materializeCalls += 1
      assert.equal(sourceOrderId, 'DRAFT-001')
      assert.equal(sourceSnapshot.persistenceMode, 'DRAFT_ONLY')
      materialized = true
    },
    orgId: 'ORG1',
    sourceOrderId: 'DRAFT-001',
  })

  assert.equal(result.idempotent, false)
  assert.equal(materializeCalls, 1)
  assert.equal(calls.filter((sql) => sql.trim() === 'begin').length, 1)
  assert.equal(calls.filter((sql) => sql.trim() === 'commit').length, 1)
  assert.equal(calls.some((sql) => sql.trim() === 'rollback'), false)
})

test('publikacja szkicu v2 odrzuca niespójne reprezentacje przed materializacją', async () => {
  const payload = card()
  payload.source.orderId = 'DRAFT-CORRELATION-INVALID'
  let materializeCalls = 0
  const calls = []
  const client = {
    async query(sql) {
      calls.push(sql)
      if (sql.includes('to_regclass')) return { rows: [{ draft_ready: true, revision_ready: true }] }
      if (sql.includes('from public.job_card_draft') && sql.includes('for update')) {
        return {
          rows: [draftRow(payload, {
            editorDraft: {
              id: 'DRAFT-CORRELATION-INVALID',
              clientId: 'CLIENT-EDITOR',
              objectId: 'SITE-EDITOR',
              scheduleMode: 'ONE_OFF',
            },
            persistenceMode: 'DRAFT_ONLY',
            snapshotVersion: 2,
            order: {
              id: 'DRAFT-CORRELATION-INVALID',
              clientId: 'CLIENT-ORDER',
              objectId: 'SITE-ORDER',
              scheduleMode: 'once',
            },
          }, 'DRAFT-CORRELATION-INVALID')],
        }
      }
      return { rows: [] }
    },
  }
  const repository = new JobCardRepository(client)

  await assert.rejects(
    repository.publishStoredDraft({
      actorUid: 'uid-1',
      expectedDraftHash: 'draft-hash',
      materializeOrder: async () => {
        materializeCalls += 1
      },
      orgId: 'ORG1',
      sourceOrderId: 'DRAFT-CORRELATION-INVALID',
    }),
    (error) => error.publicCode === 'JOB_CARD_DRAFT_CORRELATION_INVALID' && error.statusCode === 422,
  )

  assert.equal(materializeCalls, 0)
  assert.equal(calls.some((sql) => sql.trim() === 'rollback'), true)
})

test('lista odłączonych szkiców jest tenantowa, stabilnie sortowana i stronicowana kursorem', async () => {
  const rows = Array.from({ length: 31 }, (_, index) => detachedListRow(index))
  const calls = []
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params })
      if (sql.includes('to_regclass')) return { rows: [{ draft_ready: true, revision_ready: true }] }
      if (sql.includes('from public.job_card_draft d')) return { rows }
      return { rows: [] }
    },
  }
  const repository = new JobCardRepository(client)
  const result = await repository.listDetachedDrafts({ orgId: 'ORG1' })

  assert.equal(result.drafts.length, 30)
  assert.equal(result.page.limit, 30)
  assert.equal(result.page.hasMore, true)
  assert.equal(typeof result.page.nextCursor, 'string')
  assert.deepEqual(result.drafts[0], {
    client: { id: 'CLIENT-001', name: 'Best Clean' },
    createdAt: '2026-07-31T08:00:00.000Z',
    generationStatus: 'READY',
    materialized: false,
    orderId: 'DRAFT-001',
    schedule: {
      mode: 'RECURRING',
      recurrenceUntilYmd: '2026-12-31',
      startDateYmd: '2026-08-03',
    },
    site: { address: 'ul. Testowa 1, Zory', id: 'SITE-001', name: 'Best Clean' },
    staffing: { assignmentCount: 0, mode: 'BUFFER', requiredPeople: 2 },
    title: 'Robocze zlecenie 1',
    updatedAt: rows[0].updated_at,
    validation: { errorCount: 0, warningCount: 0 },
  })

  const listQuery = calls.find((call) => call.sql.includes('from public.job_card_draft d'))
  assert.ok(listQuery)
  assert.deepEqual(listQuery.params, ['ORG1', null, null, 31])
  assert.match(listQuery.sql, /where d\.org_id = \$1/)
  assert.match(listQuery.sql, /d\.source_snapshot ->> 'persistenceMode' = 'DRAFT_ONLY'/)
  assert.match(listQuery.sql, /not exists \([\s\S]*from public\.task t/)
  assert.match(listQuery.sql, /order by d\.updated_at desc, d\.source_order_id desc/)

  const decodedCursor = JSON.parse(Buffer.from(result.page.nextCursor, 'base64url').toString('utf8'))
  assert.deepEqual(decodedCursor, {
    sourceOrderId: rows[29].source_order_id,
    updatedAt: rows[29].updated_at,
  })
})

test('lista odłączonych szkiców przekazuje limit i kursor oraz odrzuca niepoprawne parametry', async () => {
  const cursorPayload = {
    sourceOrderId: 'DRAFT-030',
    updatedAt: '2026-07-31T11:31:00.000Z',
  }
  const cursor = Buffer.from(JSON.stringify(cursorPayload), 'utf8').toString('base64url')
  const calls = []
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params })
      if (sql.includes('to_regclass')) return { rows: [{ draft_ready: true, revision_ready: true }] }
      if (sql.includes('from public.job_card_draft d')) return { rows: [detachedListRow(30)] }
      return { rows: [] }
    },
  }
  const repository = new JobCardRepository(client)
  const result = await repository.listDetachedDrafts({ cursor, limit: 2, orgId: 'ORG1' })

  assert.equal(result.drafts.length, 1)
  assert.deepEqual(result.page, { hasMore: false, limit: 2, nextCursor: null })
  const listQuery = calls.find((call) => call.sql.includes('from public.job_card_draft d'))
  assert.deepEqual(listQuery.params, ['ORG1', cursorPayload.updatedAt, cursorPayload.sourceOrderId, 3])

  await assert.rejects(
    repository.listDetachedDrafts({ limit: 0, orgId: 'ORG1' }),
    (error) => error.publicCode === 'JOB_CARD_DRAFT_LIMIT_INVALID',
  )
  await assert.rejects(
    repository.listDetachedDrafts({ cursor: 'not-a-cursor', orgId: 'ORG1' }),
    (error) => error.publicCode === 'JOB_CARD_DRAFT_CURSOR_INVALID',
  )
})

test('detail szkicu v2 zwraca dokładny editorDraft bez materializacji', async () => {
  const payload = card()
  const editorDraft = {
    id: 'DRAFT-V2',
    objectId: 'SITE-001',
    scheduleMode: 'RECURRING',
    serviceName: 'Sprzatanie biura',
    staffingMode: 'BUFFER',
  }
  const client = {
    async query(sql) {
      if (sql.includes('to_regclass')) return { rows: [{ draft_ready: true, revision_ready: true }] }
      if (sql.includes('from public.job_card_draft d')) {
        return {
          rows: [draftRow(payload, {
            editorDraft,
            persistenceMode: 'DRAFT_ONLY',
            snapshotVersion: 2,
          }, 'DRAFT-V2')],
        }
      }
      return { rows: [] }
    },
  }
  const repository = new JobCardRepository(client)
  const result = await readDetachedDraftForResume(repository, { orgId: 'ORG1', sourceOrderId: 'DRAFT-V2' })

  assert.equal(result.materialized, false)
  assert.equal(result.orderId, 'DRAFT-V2')
  assert.equal(result.snapshotVersion, 2)
  assert.deepEqual(result.editorDraft, editorDraft)
  assert.equal(result.draft.sourceOrderId, 'DRAFT-V2')
})

test('detail starego szkicu v1 zwraca gotowy editorDraft do kreatora V2', async () => {
  const payload = card()
  const legacyOrder = {
    id: 'DRAFT-V1',
    clientId: 'CLIENT-001',
    clientLabel: 'Best Clean',
    siteId: 'SITE-001',
    siteName: 'Best Clean',
    addressLabel: 'ul. Testowa 1, Zory',
    scheduleMode: 'repeat',
    dateYmd: '2026-08-03',
    startTime: '08:00',
    endTime: '16:00',
    repeatUntil: '2026-12-31',
    repeatWeekdays: [1, 3, 5],
    title: 'Sprzatanie biura',
    staffingMode: 'BUFFER',
    requiredPeople: 2,
  }
  const client = {
    async query(sql) {
      if (sql.includes('to_regclass')) return { rows: [{ draft_ready: true, revision_ready: true }] }
      if (sql.includes('from public.job_card_draft d')) {
        return {
          rows: [draftRow(payload, {
            order: legacyOrder,
            persistenceMode: 'DRAFT_ONLY',
            snapshotVersion: 1,
          }, 'DRAFT-V1')],
        }
      }
      return { rows: [] }
    },
  }
  const repository = new JobCardRepository(client)
  const result = await readDetachedDraftForResume(repository, { orgId: 'ORG1', sourceOrderId: 'DRAFT-V1' })

  assert.equal(result.snapshotVersion, 1)
  assert.equal(result.materialized, false)
  assert.deepEqual(
    {
      address: result.editorDraft?.address,
      clientId: result.editorDraft?.clientId,
      clientLabel: result.editorDraft?.clientLabel,
      dateStart: result.editorDraft?.dateStart,
      endTime: result.editorDraft?.endTime,
      id: result.editorDraft?.id,
      objectId: result.editorDraft?.objectId,
      objectLabel: result.editorDraft?.objectLabel,
      recurrenceUntil: result.editorDraft?.recurrenceUntil,
      requiredPeople: result.editorDraft?.requiredPeople,
      scheduleMode: result.editorDraft?.scheduleMode,
      serviceName: result.editorDraft?.serviceName,
      staffingMode: result.editorDraft?.staffingMode,
      startTime: result.editorDraft?.startTime,
      weekdays: result.editorDraft?.weekdays,
    },
    {
      address: 'ul. Testowa 1, Zory',
      clientId: 'CLIENT-001',
      clientLabel: 'Best Clean',
      dateStart: '2026-08-03',
      endTime: '16:00',
      id: 'DRAFT-V1',
      objectId: 'SITE-001',
      objectLabel: 'Best Clean',
      recurrenceUntil: '2026-12-31',
      requiredPeople: 2,
      scheduleMode: 'RECURRING',
      serviceName: 'Sprzatanie biura',
      staffingMode: 'BUFFER',
      startTime: '08:00',
      weekdays: [1, 3, 5],
    },
  )
})
