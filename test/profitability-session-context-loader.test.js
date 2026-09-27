'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createProfitabilitySessionContextLoader,
} = require('../profitability/session-context-loader')

const ENABLED_ENVIRONMENT = Object.freeze({
  PROFITABILITY_ACCESS_PROFILE_V2_ENABLED: 'true',
  PROFITABILITY_ACCESS_PROFILE_V2_ALLOWED_ORG_IDS: 'bestclean',
})

function profile(overrides = {}) {
  return {
    org_id: 'bestclean',
    uid: 'uid-marta',
    operational_profile: 'OPERATIONS_ADMIN',
    object_scope: 'ALL',
    worker_scope: 'ALL',
    finance_profile: 'COST_CONTROL',
    access_mode: 'MANAGE',
    can_edit_operational_costs: true,
    can_edit_contract_terms: false,
    can_edit_profitability_targets: false,
    can_view_worker_rates: false,
    can_edit_worker_rates: false,
    valid_from: '2026-09-26T00:00:00Z',
    valid_to: null,
    ...overrides,
  }
}

test('session finance reads use only the dedicated profitability client and always release it', async () => {
  const calls = []
  let released = 0
  const dedicatedClient = {
    async query(sql, params) {
      calls.push({ sql: String(sql), params })
      if (/from public\.organization_access_profile/i.test(sql)) {
        return { rows: [profile()] }
      }
      throw new Error(`unexpected query: ${sql}`)
    },
    release() { released += 1 },
  }
  const loader = createProfitabilitySessionContextLoader({
    connectProfitabilityClient: async () => dedicatedClient,
    environment: ENABLED_ENVIRONMENT,
    requiredFinancialRelations: ['public.profitability_effective_financial_entry'],
    resolveAccessProfileMode: async (client) => {
      assert.equal(client, dedicatedClient)
      return { mode: 'V2' }
    },
    resolveFinancialModelMode: async (client) => {
      assert.equal(client, dedicatedClient)
      return { mode: 'V21' }
    },
    relationExists: async (client, relation) => {
      assert.equal(client, dedicatedClient)
      assert.equal(relation, 'public.profitability_effective_financial_entry')
      return true
    },
    createAccessProfileRepository(client) {
      assert.equal(client, dedicatedClient)
      return { schemaReady: async () => ({ ready: true }) }
    },
  })

  const result = await loader.load({ uid: 'uid-marta', row: { org_id: 'bestclean' } })

  assert.equal(released, 1)
  assert.equal(calls.length, 1)
  assert.equal(result.profitability_access_profile_v2_enabled, true)
  assert.equal(result.profitability_financial_model_v21_enabled, true)
  assert.equal(result.profitability_access_profile.financeProfile, 'COST_CONTROL')
  assert.equal(result.profitability_access_profile.canEditOperationalCosts, true)
})

test('dedicated profitability connection failure blocks finance without throwing into sign-in', async () => {
  const loader = createProfitabilitySessionContextLoader({
    connectProfitabilityClient: async () => {
      const error = new Error('database unavailable')
      error.code = 'ECONNREFUSED'
      throw error
    },
    environment: ENABLED_ENVIRONMENT,
  })

  assert.deepEqual(
    await loader.load({ uid: 'uid-owner', row: { org_id: 'bestclean' } }),
    {
      profitability_access_profile_v2_blocked: true,
      profitability_financial_model_v21_blocked: true,
    },
  )
})

test('legacy grants are read through the dedicated client and resolver failures release it', async () => {
  let released = 0
  const dedicatedClient = {
    async query(sql) {
      assert.match(String(sql), /from public\.profitability_permission/i)
      return { rows: [{ permission_code: 'profitability:view-internal' }] }
    },
    release() { released += 1 },
  }
  const loader = createProfitabilitySessionContextLoader({
    connectProfitabilityClient: async () => dedicatedClient,
    environment: ENABLED_ENVIRONMENT,
    resolveAccessProfileMode: async () => ({ mode: 'LEGACY' }),
    resolveFinancialModelMode: async () => ({ mode: 'FOUNDATION_V2' }),
    relationExists: async (client, relation) => {
      assert.equal(client, dedicatedClient)
      assert.equal(relation, 'public.profitability_permission')
      return true
    },
  })

  const result = await loader.load({ uid: 'uid-legacy', row: { org_id: 'bestclean' } })
  assert.equal(released, 1)
  assert.deepEqual(result.profitability_grants, {
    profitabilityModule: { read: true, edit: false },
  })

  const failingLoader = createProfitabilitySessionContextLoader({
    connectProfitabilityClient: async () => dedicatedClient,
    environment: ENABLED_ENVIRONMENT,
    resolveAccessProfileMode: async () => { throw new Error('resolver failed') },
  })
  assert.deepEqual(
    await failingLoader.load({ uid: 'uid-legacy', row: { org_id: 'bestclean' } }),
    {
      profitability_access_profile_v2_blocked: true,
      profitability_financial_model_v21_blocked: true,
    },
  )
  assert.equal(released, 2)
})

test('global organization gate blocks before opening a profitability database connection', async () => {
  for (const environment of [
    { PROFITABILITY_DB_ENABLED: 'true' },
    { PROFITABILITY_ACCESS_PROFILE_V2_ENABLED: 'true' },
    {
      PROFITABILITY_ACCESS_PROFILE_V2_ENABLED: 'true',
      PROFITABILITY_ACCESS_PROFILE_V2_ALLOWED_ORG_IDS: '',
    },
    {
      PROFITABILITY_ACCESS_PROFILE_V2_ENABLED: 'true',
      PROFITABILITY_ACCESS_PROFILE_V2_ALLOWED_ORG_IDS: 'bestclean,***',
    },
  ]) {
    let connections = 0
    const loader = createProfitabilitySessionContextLoader({
      environment,
      async connectProfitabilityClient() {
        connections += 1
        throw new Error('database connection must not be attempted')
      },
    })

    assert.deepEqual(
      await loader.load({ uid: 'uid-owner', row: { org_id: 'bestclean' } }),
      {
        profitability_access_profile_v2_blocked: true,
        profitability_financial_model_v21_blocked: true,
      },
    )
    assert.equal(connections, 0)
  }
})

test('an organization outside the exact allowlist is blocked before database access', async () => {
  let connections = 0
  const loader = createProfitabilitySessionContextLoader({
    environment: ENABLED_ENVIRONMENT,
    async connectProfitabilityClient() {
      connections += 1
      throw new Error('database connection must not be attempted')
    },
  })

  assert.deepEqual(
    await loader.load({ uid: 'uid-owner', row: { org_id: 'other-org' } }),
    {
      profitability_access_profile_v2_blocked: true,
      profitability_financial_model_v21_blocked: true,
    },
  )
  assert.equal(connections, 0)
})
