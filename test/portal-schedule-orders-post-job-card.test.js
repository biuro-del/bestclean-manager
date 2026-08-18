'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { JobCardRepository } = require('../job-card/repository')
const { validateJobCardDraft } = require('../job-card/domain')

function jobCardDraft() {
  return {
    schemaVersion: '1.0.0',
    status: 'DRAFT',
    source: { orderId: 'TASK-POST-001', sourceUpdatedAt: '2026-08-11T10:00:00.000Z' },
    customer: { type: 'B2B', name: 'Best Clean', phone: '500600700' },
    site: {
      mode: 'FIXED_CONTRACT_SITE',
      siteId: 'SITE-001',
      name: 'Best Clean',
      address: 'Zory',
      accessInstruction: 'Wejscie glowne',
      photos: [],
    },
    schedule: {
      mode: 'ONE_OFF',
      startDateYmd: '2026-08-11',
      serviceBlocks: [{ id: 'main', startTime: '08:00', endTime: '16:00' }],
    },
    service: {
      serviceType: 'GENERAL_CLEANING',
      title: 'Sprzatanie',
      internalDescription: 'Zakres uzgodniony',
      safetyInstruction: 'Rekawice',
      scopeItems: [{ id: 'ZONE-1', title: 'Biuro' }],
    },
    fulfillment: {
      crewSource: 'DISPATCHED',
      dispatchRequired: false,
      assignments: [{ workerId: 'W001', name: 'Rafal Dudek', role: 'LEADER' }],
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

function storedDraft(payload) {
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
    source_order_id: 'TASK-POST-001',
    updated_at: '2026-08-11T10:00:00.000Z',
    updated_by_uid: 'uid-manager',
    validation: validateJobCardDraft(payload),
  }
}

test('integracyjny kontrakt POST /api/portal/schedule-orders zapisuje szkic z rozdzielonymi parametrami PostgreSQL', async () => {
  const backend = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')
  const handlerStart = backend.indexOf('async function handlePortalScheduleOrdersRequest')
  const handlerEnd = backend.indexOf('async function handlePortalJobCardsRequest', handlerStart)
  const handler = backend.slice(handlerStart, handlerEnd)
  assert.match(handler, /await upsertPortalScheduleOrderTask\(client, row\)/)
  assert.match(handler, /await jobCardRepository\.saveDraft\(\{/)

  const payload = jobCardDraft()
  const calls = []
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params })
      if (sql.includes('to_regclass')) return { rows: [{ draft_ready: true, revision_ready: true }] }
      if (sql.includes('from public.task')) return { rows: [{ id_task: 'TASK-POST-001' }] }
      if (sql.includes('insert into public.job_card_draft')) return { rows: [storedDraft(payload)] }
      return { rows: [] }
    },
  }

  const repository = new JobCardRepository(client)
  await repository.saveDraft({
    actorUid: 'uid-manager',
    card: payload,
    orgId: 'ORG-POST',
    sourceOrderId: 'TASK-POST-001',
    sourceSnapshot: { id: 'TASK-POST-001', jobCardDraft: payload },
  })

  const insert = calls.find((call) => call.sql.includes('insert into public.job_card_draft'))
  assert.ok(insert)
  const parameterIndexes = [...insert.sql.matchAll(/\$(\d+)\b/g)].map((match) => Number(match[1]))
  assert.deepEqual(parameterIndexes.sort((left, right) => left - right), Array.from({ length: 16 }, (_, index) => index + 1))
  assert.deepEqual(insert.params.slice(12), ['uid-manager', 'uid-manager', 'ORG-POST', 'TASK-POST-001'])
})
