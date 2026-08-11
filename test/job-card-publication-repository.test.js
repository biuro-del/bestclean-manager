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

function draftRow(payload) {
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
    source_order_id: 'TASK-001',
    updated_at: '2026-07-28T12:00:00.000Z',
    updated_by_uid: 'uid-1',
    validation: validateJobCardDraft(payload),
  }
}

test('zapis szkicu Karty Zlecenia rozdziela parametry SQL dla upsertu i rewizji', async () => {
  const payload = card()
  const calls = []
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params })
      if (sql.includes('to_regclass')) return { rows: [{ draft_ready: true, revision_ready: true }] }
      if (sql.includes('from public.task')) return { rows: [{ id_task: 'TASK-001' }] }
      if (sql.includes('insert into public.job_card_draft')) return { rows: [draftRow(payload)] }
      return { rows: [] }
    },
  }

  const repository = new JobCardRepository(client)
  const result = await repository.saveDraft({
    actorUid: 'uid-1',
    card: payload,
    orgId: 'ORG1',
    sourceOrderId: 'TASK-001',
    sourceSnapshot: { id: 'TASK-001' },
  })

  const insert = calls.find((call) => call.sql.includes('insert into public.job_card_draft'))
  assert.ok(insert)
  assert.match(insert.sql, /\$1::varchar, \$2::varchar, \$3::uuid/)
  assert.match(insert.sql, /where org_id = \$15::varchar and source_order_id = \$16::varchar/)
  assert.match(insert.sql, /\$13::varchar, \$14::varchar, now\(\), now\(\)/)
  assert.equal((insert.sql.match(/\$1\b/g) ?? []).length, 1)
  assert.deepEqual(insert.params.slice(12), ['uid-1', 'uid-1', 'ORG1', 'TASK-001'])
  assert.equal(result.sourceOrderId, 'TASK-001')
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
