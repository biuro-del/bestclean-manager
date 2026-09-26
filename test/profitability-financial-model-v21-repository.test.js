'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  calculateObjectProfitability,
  createProfitabilityRepository,
} = require('../profitability')

const PERIOD = { start: '2026-09-01', end: '2026-10-01' }

test('V2.1 reads only effective entries and recognizes hygiene package billing exactly once', async () => {
  const calls = []
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params })
      if (/from public\.service_object\s+where org_id = \$1\s+and object_id = \$2/i.test(sql)) {
        return { rows: [{
          object_id: 'object-1', client_id: 'client-1', name: 'Edukatorium',
          timezone: 'Europe/Warsaw', default_currency: 'PLN', status: 'ACTIVE',
        }] }
      }
      if (/from public\.object_contract_version/i.test(sql)) {
        return { rows: [{
          contract_version_id: 'contract-1', billing_model: 'FIXED_MONTHLY',
          monthly_value_minor: '100000', hourly_rate_minor: null,
          service_rate_minor: null, currency: 'PLN', effective_from: '2026-01-01',
          effective_to: null, target_profitability_bps: null,
        }] }
      }
      if (/from public\.profitability_effective_financial_entry/i.test(sql)) {
        return { rows: [{
          entry_id: 'actual-material', org_id: 'org-a', object_id: 'object-1',
          periodic_work_id: null, entry_group: 'MATERIAL', category: 'MATERIALS',
          name: 'Chemia actual', amount_minor: '8000', currency: 'PLN',
          occurred_on: '2026-09-10', period_start: null, period_end: null,
          recurrence: 'ONE_TIME', source: 'MANUAL', value_basis: 'ACTUAL',
          value_key: 'materials:2026-09',
        }] }
      }
      if (/from public\.object_financial_entry/i.test(sql)) {
        throw new Error('V2.1 must not read the raw financial entry table')
      }
      if (/from public\.profitability_effective_hygiene_package/i.test(sql)) {
        return { rows: [
          {
            package_id: 'included', package_version_id: 'included-v1',
            recognition_key: 'included:2026-09', package_name: 'W kontrakcie',
            billing_mode: 'IN_CONTRACT', value_basis: 'ACTUAL',
            price_net_minor: '15000', cost_minor: '10000', margin_bps: 3333,
            currency: 'PLN', effective_from: '2026-09-01', effective_to: null,
            occurred_on: null, recognized_revenue_minor: '0',
          },
          {
            package_id: 'monthly', package_version_id: 'monthly-v1',
            recognition_key: 'monthly:2026-09', package_name: 'Pakiet ekstra',
            billing_mode: 'MONTHLY_EXTRA', value_basis: 'ESTIMATE',
            price_net_minor: '5000', cost_minor: '2000', margin_bps: 6000,
            currency: 'PLN', effective_from: '2026-09-01', effective_to: null,
            occurred_on: null, recognized_revenue_minor: '5000',
          },
          {
            package_id: 'adhoc', package_version_id: 'adhoc-v1',
            recognition_key: 'adhoc:2026-09-12', package_name: 'Dostawa ad hoc',
            billing_mode: 'AD_HOC', value_basis: 'ACTUAL',
            price_net_minor: '2000', cost_minor: '1000', margin_bps: 5000,
            currency: 'PLN', effective_from: '2026-09-12', effective_to: null,
            occurred_on: '2026-09-12', recognized_revenue_minor: '2000',
          },
        ] }
      }
      if (/from public\.object_equipment/i.test(sql)) return { rows: [] }
      if (/from public\.periodic_work\b/i.test(sql)) return { rows: [] }
      if (/from public\.event e/i.test(sql) && /count\(\*\)/i.test(sql)) {
        return { rows: [{ unmapped_count: 0 }] }
      }
      if (/from public\.event e/i.test(sql)) return { rows: [] }
      if (/from public\.worker_cost_rate/i.test(sql)) return { rows: [] }
      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }
  const repository = createProfitabilityRepository(client, {
    financialModelV21: { enabled: true },
  })
  repository.assertAccess = async () => ({ allowed: true })

  const input = await repository.loadObjectCalculationInput({
    orgId: 'org-a', objectId: 'object-1', period: PERIOD, uid: 'owner-1',
  })
  const result = calculateObjectProfitability(input)

  assert.equal(input.financialModelVersion, 'v2.1')
  assert.equal(input.hygienePackages.length, 3)
  assert.equal(result.revenueMinor, 107000n)
  assert.equal(result.costBreakdown.materialsMinor, 21000n)
  assert.equal(result.marginMinor, 86000n)
  assert.equal(calls.some((call) => /profitability_effective_financial_entry/i.test(call.sql)), true)
  assert.equal(calls.some((call) => /profitability_effective_hygiene_package/i.test(call.sql)), true)
})

test('V2.1 financial writes require commandId and replay a successful receipt without duplicate insert', async () => {
  const calls = []
  let receiptCreated = false
  let financialInsertCount = 0
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params })
      if (/^(begin|commit|rollback|savepoint)/i.test(sql.trim())) return { rows: [] }
      if (/^set transaction isolation level repeatable read$/i.test(sql.trim())) return { rows: [] }
      if (/pg_advisory_xact_lock/i.test(sql)) return { rows: [] }
      if (/from public\.financial_period/i.test(sql) && /status = 'CLOSED'/i.test(sql)) return { rows: [] }
      if (/insert into public\.profitability_command_receipt/i.test(sql)) {
        if (receiptCreated) return { rows: [] }
        receiptCreated = true
        return { rows: [{ command_id: params[1] }] }
      }
      if (/from public\.profitability_command_receipt/i.test(sql)) {
        return { rows: [{
          object_id: 'object-1', command_kind: 'CREATE_COST',
          request_sha256: calls.find((call) => /insert into public\.profitability_command_receipt/i.test(call.sql)).params[4],
          state: 'SUCCEEDED', result_reference: 'entry-1', error_code: null,
        }] }
      }
      if (/update public\.profitability_command_receipt/i.test(sql)) return { rows: [] }
      if (/insert into public\.object_financial_entry/i.test(sql)) {
        financialInsertCount += 1
        return { rows: [{ entry_id: 'entry-1', amount_minor: params[8], value_basis: params[19], value_key: params[20] }] }
      }
      if (/insert into public\.profitability_audit/i.test(sql)) return { rows: [{}] }
      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }
  const repository = createProfitabilityRepository(client, {
    financialModelV21: { enabled: true },
  })
  repository.assertAccess = async () => ({ allowed: true })
  repository.verifyServiceObjectScope = async () => ({ object_id: 'object-1' })
  const request = {
    clientId: 'client-1', commandId: 'command-cost-1', objectId: 'object-1',
    orgId: 'org-a', uid: 'owner-1',
    cost: {
      amountMinor: '1200', category: 'MATERIALS', currency: 'PLN',
      name: 'Chemia', occurredOn: '2026-09-10', recurrence: 'ONE_TIME',
      valueBasis: 'ACTUAL', valueKey: 'materials:2026-09:chemia',
    },
  }

  const first = await repository.createCost(request)
  const replay = await repository.createCost(request)

  assert.equal(first.entry_id, 'entry-1')
  assert.deepEqual(replay, { idempotentReplay: true, resultReference: 'entry-1' })
  assert.equal(financialInsertCount, 1)
  const insert = calls.find((call) => /insert into public\.object_financial_entry/i.test(call.sql))
  assert.equal(insert.params[19], 'ACTUAL')
  assert.equal(insert.params[20], 'materials:2026-09:chemia')
  const firstWriteCalls = calls.slice(0, calls.findIndex((call) => /^commit$/i.test(call.sql.trim())) + 1)
  const callIndex = (pattern) => firstWriteCalls.findIndex((call) => pattern.test(call.sql))
  assert.ok(callIndex(/^begin$/i) < callIndex(/set transaction isolation level repeatable read/i))
  assert.ok(callIndex(/set transaction isolation level repeatable read/i) < callIndex(/pg_advisory_xact_lock/i))
  assert.ok(callIndex(/pg_advisory_xact_lock/i) < callIndex(/profitability_command_receipt/i))
  assert.ok(callIndex(/profitability_command_receipt/i) < callIndex(/status = 'CLOSED'/i))
  assert.ok(callIndex(/status = 'CLOSED'/i) < callIndex(/insert into public\.object_financial_entry/i))

  await assert.rejects(
    repository.createCost({ ...request, commandId: '' }),
    /commandId is required/,
  )
})

test('V2.1 rejects writes overlapping a closed period before touching financial entries', async () => {
  let financialInsertCount = 0
  const calls = []
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params })
      if (/^(begin|commit|rollback|savepoint)/i.test(sql.trim())) return { rows: [] }
      if (/^set transaction isolation level repeatable read$/i.test(sql.trim())) return { rows: [] }
      if (/pg_advisory_xact_lock/i.test(sql)) return { rows: [] }
      if (/insert into public\.profitability_command_receipt/i.test(sql)) {
        return { rows: [{ command_id: params[1] }] }
      }
      if (/from public\.financial_period/i.test(sql) && /status = 'CLOSED'/i.test(sql)) {
        return { rows: [{ period_id: 'period-closed-1', period_start: '2026-09-01', period_end: '2026-10-01' }] }
      }
      if (/update public\.profitability_command_receipt/i.test(sql)) return { rows: [] }
      if (/insert into public\.object_financial_entry/i.test(sql)) {
        financialInsertCount += 1
        return { rows: [{ entry_id: 'must-not-exist' }] }
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }
  const repository = createProfitabilityRepository(client, {
    financialModelV21: { enabled: true },
  })
  repository.assertAccess = async () => ({ allowed: true })
  repository.verifyServiceObjectScope = async () => ({ object_id: 'object-1' })

  await assert.rejects(
    repository.createCost({
      clientId: 'client-1', commandId: 'closed-cost-command', objectId: 'object-1',
      orgId: 'org-a', uid: 'owner-1',
      cost: {
        amountMinor: '1200', category: 'MATERIALS', currency: 'PLN',
        name: 'Chemia', occurredOn: '2026-09-10', recurrence: 'ONE_TIME',
        valueBasis: 'ACTUAL', valueKey: 'materials:2026-09:chemia',
      },
    }),
    (error) => error?.code === 'CLOSED_PERIOD_IMMUTABLE'
      && error?.statusCode === 409
      && error?.details?.periodIds?.[0] === 'period-closed-1',
  )

  assert.equal(financialInsertCount, 0)
  assert.equal(calls.some((call) => /rollback to savepoint profitability_v21_command_work/i.test(call.sql)), true)
  assert.equal(calls.some((call) => /set state = 'FAILED'/i.test(call.sql)), true)
})

test('hygiene package derives default 20 percent margin and IN_CONTRACT requires only operational-cost write', async () => {
  const calls = []
  const accessChecks = []
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params })
      if (/^(begin|commit|rollback|savepoint)/i.test(sql.trim())) return { rows: [] }
      if (/^set transaction isolation level repeatable read$/i.test(sql.trim())) return { rows: [] }
      if (/pg_advisory_xact_lock/i.test(sql)) return { rows: [] }
      if (/from public\.financial_period/i.test(sql) && /status = 'CLOSED'/i.test(sql)) return { rows: [] }
      if (/insert into public\.profitability_command_receipt/i.test(sql)) {
        return { rows: [{ command_id: params[1] }] }
      }
      if (/update public\.profitability_command_receipt/i.test(sql)) return { rows: [] }
      if (/from public\.object_hygiene_package_version/i.test(sql) && /for update/i.test(sql)) {
        return { rows: [] }
      }
      if (/insert into public\.object_hygiene_package_version/i.test(sql)) {
        return { rows: [{
          package_version_id: params[3], price_net_minor: params[9],
          cost_minor: params[10], billing_mode: params[7], value_basis: params[8],
        }] }
      }
      if (/insert into public\.profitability_audit/i.test(sql)) return { rows: [{}] }
      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }
  const repository = createProfitabilityRepository(client, {
    financialModelV21: { enabled: true },
  })
  repository.assertAccess = async (input) => {
    accessChecks.push(input)
    return { allowed: true }
  }
  repository.verifyServiceObjectScope = async () => ({ object_id: 'object-1' })

  const saved = await repository.saveHygienePackage({
    clientId: 'client-1', commandId: 'package-command-1', objectId: 'object-1',
    orgId: 'org-a', uid: 'coordinator-1',
    package: {
      billingMode: 'IN_CONTRACT', effectiveFrom: '2026-09-01',
      packageName: 'Pakiet środków higieny', priceNetMinor: '10000',
      recognitionKey: 'hygiene:2026-09', valueBasis: 'ESTIMATE',
    },
  })

  assert.equal(saved.price_net_minor, '10000')
  assert.equal(saved.cost_minor, '8000')
  assert.equal(accessChecks[0].writeKind, 'OPERATIONAL_COST')
})

test('repository independently rejects COST_CONTROL hygiene sales fields and non-contract billing', async () => {
  const repository = createProfitabilityRepository({
    async query(sql) {
      throw new Error(`Database must not be touched for rejected input: ${sql}`)
    },
  }, {
    financialModelV21: { enabled: true },
  })
  repository.assertAccess = async () => ({
    allowed: true,
    financeProfile: 'COST_CONTROL',
  })

  const base = {
    clientId: 'client-1', commandId: 'package-command-rejected', objectId: 'object-1',
    orgId: 'org-a', uid: 'coordinator-1',
  }
  await assert.rejects(
    repository.saveHygienePackage({
      ...base,
      package: {
        billingMode: 'IN_CONTRACT', costMinor: '8000', priceNetMinor: '10000',
        packageName: 'Pakiet', effectiveFrom: '2026-09-01',
        recognitionKey: 'hygiene:2026-09', valueBasis: 'ESTIMATE',
      },
    }),
    (error) => error?.code === 'PROFITABILITY_HYGIENE_FINANCIAL_FIELDS_FORBIDDEN'
      && error?.statusCode === 403,
  )
  await assert.rejects(
    repository.saveHygienePackage({
      ...base,
      package: {
        billingMode: 'MONTHLY_EXTRA', costMinor: '8000',
        packageName: 'Pakiet', effectiveFrom: '2026-09-01',
        recognitionKey: 'hygiene:2026-09', valueBasis: 'ESTIMATE',
      },
    }),
    (error) => error?.code === 'PROFITABILITY_HYGIENE_CONTRACT_TERMS_FORBIDDEN'
      && error?.statusCode === 403,
  )
})
