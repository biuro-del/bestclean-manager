'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  PROFITABILITY_FINANCIAL_MODEL_ENFORCEMENT_RELATION,
  PROFITABILITY_FINANCIAL_MODEL_MODES,
  isProfitabilityFinancialModelOrganizationAllowed,
  parseAllowedOrganizationIds,
  resolveProfitabilityFinancialModelOrganizationMode,
  resolveProfitabilityFinancialModelRollout,
  resolveProfitabilityFinancialModelSessionMode,
} = require('../profitability-financial-model-rollout')

test('financial model v2.1 is fail-closed without both flag and exact organization allowlist', () => {
  const disabled = resolveProfitabilityFinancialModelRollout({})
  assert.equal(disabled.enabled, false)

  const flagOnly = resolveProfitabilityFinancialModelRollout({
    PROFITABILITY_FINANCIAL_MODEL_V21_ENABLED: 'true',
  })
  assert.equal(flagOnly.enabled, false)
  assert.equal(flagOnly.configurationValid, false)

  const allowlistOnly = resolveProfitabilityFinancialModelRollout({
    PROFITABILITY_FINANCIAL_MODEL_V21_ALLOWED_ORG_IDS: 'org-a',
  })
  assert.equal(allowlistOnly.enabled, false)
})

test('only an exact allowlisted organization can use financial model v2.1', () => {
  const policy = resolveProfitabilityFinancialModelRollout({
    PROFITABILITY_FINANCIAL_MODEL_V21_ENABLED: 'yes',
    PROFITABILITY_FINANCIAL_MODEL_V21_ALLOWED_ORG_IDS: 'org-a,org-b,org-a',
  })

  assert.equal(policy.enabled, true)
  assert.deepEqual(policy.allowedOrganizationIds, ['org-a', 'org-b'])
  assert.equal(isProfitabilityFinancialModelOrganizationAllowed(policy, 'org-a'), true)
  assert.equal(isProfitabilityFinancialModelOrganizationAllowed(policy, 'ORG-A'), false)
  assert.equal(isProfitabilityFinancialModelOrganizationAllowed(policy, 'org-c'), false)
})

test('a malformed allowlist invalidates the whole financial model rollout', () => {
  assert.deepEqual(parseAllowedOrganizationIds('org-a,,org-b'), [])
  assert.deepEqual(parseAllowedOrganizationIds('org-a,org b'), [])

  const policy = resolveProfitabilityFinancialModelRollout({
    PROFITABILITY_FINANCIAL_MODEL_V21_ENABLED: 'true',
    PROFITABILITY_FINANCIAL_MODEL_V21_ALLOWED_ORG_IDS: 'org-a,***',
  })
  assert.equal(policy.enabled, false)
  assert.equal(policy.configurationValid, false)
})

test('persistent v2.1 marker blocks fallback when rollout is off and enables only allowlisted org', async () => {
  const queriedRelations = []
  const client = {
    async query() {
      return { rows: [{ schema_version: 'v2.1' }] }
    },
  }
  const relationExists = async (_client, relation) => {
    queriedRelations.push(relation)
    return true
  }

  const disabled = await resolveProfitabilityFinancialModelOrganizationMode({
    client,
    organizationId: 'org-a',
    policy: resolveProfitabilityFinancialModelRollout({}),
    relationExists,
  })
  assert.deepEqual(disabled, {
    mode: PROFITABILITY_FINANCIAL_MODEL_MODES.BLOCKED,
    code: 'V21_ENFORCED_NOT_ENABLED',
  })

  const enabled = await resolveProfitabilityFinancialModelOrganizationMode({
    client,
    organizationId: 'org-a',
    policy: resolveProfitabilityFinancialModelRollout({
      PROFITABILITY_FINANCIAL_MODEL_V21_ENABLED: 'true',
      PROFITABILITY_FINANCIAL_MODEL_V21_ALLOWED_ORG_IDS: 'org-a',
    }),
    relationExists,
  })
  assert.deepEqual(enabled, {
    mode: PROFITABILITY_FINANCIAL_MODEL_MODES.V21,
    code: 'V21_ENFORCED',
  })
  assert.deepEqual(queriedRelations, [
    PROFITABILITY_FINANCIAL_MODEL_ENFORCEMENT_RELATION,
    PROFITABILITY_FINANCIAL_MODEL_ENFORCEMENT_RELATION,
  ])
})

test('allowlisted organization cannot activate v2.1 before marker is provisioned', async () => {
  const mode = await resolveProfitabilityFinancialModelOrganizationMode({
    client: { query: async () => ({ rows: [] }) },
    organizationId: 'org-a',
    policy: resolveProfitabilityFinancialModelRollout({
      PROFITABILITY_FINANCIAL_MODEL_V21_ENABLED: 'true',
      PROFITABILITY_FINANCIAL_MODEL_V21_ALLOWED_ORG_IDS: 'org-a',
    }),
    relationExists: async () => true,
  })
  assert.deepEqual(mode, {
    mode: PROFITABILITY_FINANCIAL_MODEL_MODES.BLOCKED,
    code: 'V21_PROVISIONING_REQUIRED',
  })
})

test('organization without marker and without rollout remains on foundation v2', async () => {
  const mode = await resolveProfitabilityFinancialModelOrganizationMode({
    client: { query: async () => { throw new Error('must not query absent relation') } },
    organizationId: 'org-foundation',
    policy: resolveProfitabilityFinancialModelRollout({}),
    relationExists: async () => false,
  })
  assert.deepEqual(mode, {
    mode: PROFITABILITY_FINANCIAL_MODEL_MODES.FOUNDATION_V2,
    code: 'FOUNDATION_V2_NOT_ENFORCED',
  })
})

test('marker schema version must be exactly v2.1 and duplicate markers are invalid', async () => {
  const policy = resolveProfitabilityFinancialModelRollout({
    PROFITABILITY_FINANCIAL_MODEL_V21_ENABLED: 'true',
    PROFITABILITY_FINANCIAL_MODEL_V21_ALLOWED_ORG_IDS: 'org-a',
  })
  const resolveWithRows = (rows) => resolveProfitabilityFinancialModelOrganizationMode({
    client: { query: async () => ({ rows }) },
    organizationId: 'org-a',
    policy,
    relationExists: async () => true,
  })

  assert.deepEqual(await resolveWithRows([{ schema_version: 'V2.1' }]), {
    mode: PROFITABILITY_FINANCIAL_MODEL_MODES.BLOCKED,
    code: 'ENFORCEMENT_INVALID',
  })
  assert.deepEqual(await resolveWithRows([{ schema_version: 'v2.1 ' }]), {
    mode: PROFITABILITY_FINANCIAL_MODEL_MODES.BLOCKED,
    code: 'ENFORCEMENT_INVALID',
  })
  assert.deepEqual(await resolveWithRows([
    { schema_version: 'v2.1' },
    { schema_version: 'v2.1' },
  ]), {
    mode: PROFITABILITY_FINANCIAL_MODEL_MODES.BLOCKED,
    code: 'ENFORCEMENT_INVALID',
  })
})

test('invalid organization and invalid enabled rollout are blocked before marker access', async () => {
  let markerAccessed = false
  const relationExists = async () => {
    markerAccessed = true
    return true
  }

  const invalidOrganization = await resolveProfitabilityFinancialModelOrganizationMode({
    client: {},
    organizationId: 'org invalid',
    policy: resolveProfitabilityFinancialModelRollout({}),
    relationExists,
  })
  assert.deepEqual(invalidOrganization, {
    mode: PROFITABILITY_FINANCIAL_MODEL_MODES.BLOCKED,
    code: 'ORG_INVALID',
  })

  const invalidRollout = await resolveProfitabilityFinancialModelOrganizationMode({
    client: {},
    organizationId: 'org-a',
    policy: resolveProfitabilityFinancialModelRollout({
      PROFITABILITY_FINANCIAL_MODEL_V21_ENABLED: 'true',
    }),
    relationExists,
  })
  assert.deepEqual(invalidRollout, {
    mode: PROFITABILITY_FINANCIAL_MODEL_MODES.BLOCKED,
    code: 'ROLLOUT_INVALID',
  })
  assert.equal(markerAccessed, false)
})

test('session mode fails closed when marker relation or marker row cannot be read', async () => {
  const policy = resolveProfitabilityFinancialModelRollout({})
  const relationFailure = await resolveProfitabilityFinancialModelSessionMode({
    client: {},
    organizationId: 'org-a',
    policy,
    relationExists: async () => { throw new Error('catalog unavailable') },
  })
  assert.deepEqual(relationFailure, {
    mode: PROFITABILITY_FINANCIAL_MODEL_MODES.BLOCKED,
    code: 'ENFORCEMENT_UNAVAILABLE',
  })

  const queryFailure = await resolveProfitabilityFinancialModelSessionMode({
    client: { query: async () => { throw new Error('permission denied') } },
    organizationId: 'org-a',
    policy,
    relationExists: async () => true,
  })
  assert.deepEqual(queryFailure, {
    mode: PROFITABILITY_FINANCIAL_MODEL_MODES.BLOCKED,
    code: 'ENFORCEMENT_UNAVAILABLE',
  })

  const invalidResult = await resolveProfitabilityFinancialModelSessionMode({
    client: { query: async () => ({}) },
    organizationId: 'org-a',
    policy,
    relationExists: async () => true,
  })
  assert.deepEqual(invalidResult, {
    mode: PROFITABILITY_FINANCIAL_MODEL_MODES.BLOCKED,
    code: 'ENFORCEMENT_UNAVAILABLE',
  })
})
