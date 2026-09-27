'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  PROFITABILITY_ACCESS_PROFILE_MODES,
  gateProfitabilityModuleCapabilities,
  isProfitabilityAccessProfileOrganizationAllowed,
  parseAllowedOrganizationIds,
  resolveProfitabilityAccessProfileOrganizationMode,
  resolveProfitabilityAccessProfileRollout,
  resolveProfitabilityAccessProfileSessionMode,
} = require('../profitability-access-profile-rollout')

test('access profile v2 is fail-closed without both flag and exact organization allowlist', () => {
  const disabled = resolveProfitabilityAccessProfileRollout({})
  assert.equal(disabled.enabled, false)

  const flagOnly = resolveProfitabilityAccessProfileRollout({
    PROFITABILITY_ACCESS_PROFILE_V2_ENABLED: 'true',
  })
  assert.equal(flagOnly.enabled, false)
  assert.equal(flagOnly.configurationValid, false)

  const allowlistOnly = resolveProfitabilityAccessProfileRollout({
    PROFITABILITY_ACCESS_PROFILE_V2_ALLOWED_ORG_IDS: 'org-a',
  })
  assert.equal(allowlistOnly.enabled, false)
})

test('only an exact allowlisted organization can use access profile v2', () => {
  const policy = resolveProfitabilityAccessProfileRollout({
    PROFITABILITY_ACCESS_PROFILE_V2_ENABLED: 'yes',
    PROFITABILITY_ACCESS_PROFILE_V2_ALLOWED_ORG_IDS: 'org-a,org-b,org-a',
  })

  assert.equal(policy.enabled, true)
  assert.deepEqual(policy.allowedOrganizationIds, ['org-a', 'org-b'])
  assert.equal(isProfitabilityAccessProfileOrganizationAllowed(policy, 'org-a'), true)
  assert.equal(isProfitabilityAccessProfileOrganizationAllowed(policy, 'ORG-A'), false)
  assert.equal(isProfitabilityAccessProfileOrganizationAllowed(policy, 'org-c'), false)
})

test('a malformed allowlist invalidates the whole rollout instead of widening access', () => {
  assert.deepEqual(parseAllowedOrganizationIds('org-a,,org-b'), [])
  assert.deepEqual(parseAllowedOrganizationIds('org-a,org b'), [])

  const policy = resolveProfitabilityAccessProfileRollout({
    PROFITABILITY_ACCESS_PROFILE_V2_ENABLED: 'true',
    PROFITABILITY_ACCESS_PROFILE_V2_ALLOWED_ORG_IDS: 'org-a,***',
  })
  assert.equal(policy.enabled, false)
  assert.equal(policy.configurationValid, false)
})

test('global gate masks profitability for a platform owner outside the rollout organization', () => {
  const ownerProCapabilities = {
    profitabilityModule: {
      enabled: true,
      canRead: true,
      canEdit: true,
      readCode: 'PROFITABILITY_ACCESS_ALLOWED',
      editCode: 'PROFITABILITY_ACCESS_ALLOWED',
    },
  }
  const environment = {
    PROFITABILITY_ACCESS_PROFILE_V2_ENABLED: 'true',
    PROFITABILITY_ACCESS_PROFILE_V2_ALLOWED_ORG_IDS: 'bestclean',
  }

  assert.deepEqual(
    gateProfitabilityModuleCapabilities(ownerProCapabilities, 'other-org', environment),
    {
      profitabilityModule: {
        enabled: false,
        canRead: false,
        canEdit: false,
        readCode: 'PROFITABILITY_NOT_ENABLED',
        editCode: 'PROFITABILITY_NOT_ENABLED',
      },
    },
  )
  assert.equal(
    gateProfitabilityModuleCapabilities(ownerProCapabilities, 'bestclean', environment),
    ownerProCapabilities,
  )
})

test('persistent enforcement marker prevents fallback to legacy when rollout is off or incomplete', async () => {
  const client = {
    async query() {
      return { rows: [{ schema_version: 'v2' }] }
    },
  }
  const relationExists = async () => true
  const disabled = await resolveProfitabilityAccessProfileOrganizationMode({
    client,
    organizationId: 'org-a',
    policy: resolveProfitabilityAccessProfileRollout({}),
    relationExists,
  })
  assert.deepEqual(disabled, {
    mode: PROFITABILITY_ACCESS_PROFILE_MODES.BLOCKED,
    code: 'V2_ENFORCED_NOT_ENABLED',
  })

  const enabled = await resolveProfitabilityAccessProfileOrganizationMode({
    client,
    organizationId: 'org-a',
    policy: resolveProfitabilityAccessProfileRollout({
      PROFITABILITY_ACCESS_PROFILE_V2_ENABLED: 'true',
      PROFITABILITY_ACCESS_PROFILE_V2_ALLOWED_ORG_IDS: 'org-a',
    }),
    relationExists,
  })
  assert.deepEqual(enabled, {
    mode: PROFITABILITY_ACCESS_PROFILE_MODES.V2,
    code: 'V2_ENFORCED',
  })
})

test('allowlisted organization cannot activate before its persistent marker is provisioned', async () => {
  const mode = await resolveProfitabilityAccessProfileOrganizationMode({
    client: { query: async () => ({ rows: [] }) },
    organizationId: 'org-a',
    policy: resolveProfitabilityAccessProfileRollout({
      PROFITABILITY_ACCESS_PROFILE_V2_ENABLED: 'true',
      PROFITABILITY_ACCESS_PROFILE_V2_ALLOWED_ORG_IDS: 'org-a',
    }),
    relationExists: async () => true,
  })
  assert.deepEqual(mode, {
    mode: PROFITABILITY_ACCESS_PROFILE_MODES.BLOCKED,
    code: 'V2_PROVISIONING_REQUIRED',
  })
})

test('organizations without marker or rollout remain on unchanged legacy behavior', async () => {
  const mode = await resolveProfitabilityAccessProfileOrganizationMode({
    client: { query: async () => { throw new Error('must not query absent relation') } },
    organizationId: 'org-legacy',
    policy: resolveProfitabilityAccessProfileRollout({}),
    relationExists: async () => false,
  })
  assert.deepEqual(mode, {
    mode: PROFITABILITY_ACCESS_PROFILE_MODES.LEGACY,
    code: 'LEGACY_NOT_ENFORCED',
  })
})

test('session mode blocks only profitability when enforcement state cannot be read', async () => {
  const mode = await resolveProfitabilityAccessProfileSessionMode({
    client: { query: async () => { throw new Error('permission denied') } },
    organizationId: 'org-a',
    policy: resolveProfitabilityAccessProfileRollout({}),
    relationExists: async () => true,
  })

  assert.deepEqual(mode, {
    mode: PROFITABILITY_ACCESS_PROFILE_MODES.BLOCKED,
    code: 'ENFORCEMENT_UNAVAILABLE',
  })
})
