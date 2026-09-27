'use strict'

const ORGANIZATION_ID_PATTERN = /^[a-z0-9_-]{1,64}$/i
const PROFITABILITY_ACCESS_ENFORCEMENT_RELATION = 'public.profitability_access_enforcement'

const PROFITABILITY_ACCESS_PROFILE_MODES = Object.freeze({
  BLOCKED: 'BLOCKED',
  LEGACY: 'LEGACY',
  V2: 'V2',
})

function text(value) {
  return String(value ?? '').trim()
}

function isTrue(value) {
  return ['1', 'true', 'yes', 'tak'].includes(text(value).toLowerCase())
}

function parseAllowedOrganizationIds(value) {
  const source = text(value)
  if (!source) return Object.freeze([])

  const organizationIds = source.split(',').map((entry) => entry.trim())
  if (organizationIds.some((entry) => !entry || !ORGANIZATION_ID_PATTERN.test(entry))) {
    return Object.freeze([])
  }

  return Object.freeze([...new Set(organizationIds)])
}

function resolveProfitabilityAccessProfileRollout(environment = {}) {
  const allowlistSource = text(environment.PROFITABILITY_ACCESS_PROFILE_V2_ALLOWED_ORG_IDS)
  const allowedOrganizationIds = parseAllowedOrganizationIds(allowlistSource)
  const masterEnabled = isTrue(environment.PROFITABILITY_ACCESS_PROFILE_V2_ENABLED)
  const configurationValid = !masterEnabled || (
    Boolean(allowlistSource) && allowedOrganizationIds.length > 0
  )

  return Object.freeze({
    allowedOrganizationIds,
    configurationValid,
    enabled: masterEnabled && configurationValid,
    masterEnabled,
  })
}

function isProfitabilityAccessProfileOrganizationAllowed(policy, organizationIdValue) {
  const organizationId = text(organizationIdValue)
  return Boolean(
    policy?.enabled
      && ORGANIZATION_ID_PATTERN.test(organizationId)
      && Array.isArray(policy.allowedOrganizationIds)
      && policy.allowedOrganizationIds.includes(organizationId),
  )
}

function gateProfitabilityModuleCapabilities(capabilities, organizationId, environment = {}) {
  const policy = resolveProfitabilityAccessProfileRollout(environment)
  if (isProfitabilityAccessProfileOrganizationAllowed(policy, organizationId)) {
    return capabilities
  }
  return {
    ...capabilities,
    profitabilityModule: {
      enabled: false,
      canRead: false,
      canEdit: false,
      readCode: 'PROFITABILITY_NOT_ENABLED',
      editCode: 'PROFITABILITY_NOT_ENABLED',
    },
  }
}

async function resolveProfitabilityAccessProfileOrganizationMode({
  client,
  organizationId: organizationIdValue,
  policy,
  relationExists,
}) {
  const organizationId = text(organizationIdValue)
  if (!ORGANIZATION_ID_PATTERN.test(organizationId)) {
    return Object.freeze({ mode: PROFITABILITY_ACCESS_PROFILE_MODES.BLOCKED, code: 'ORG_INVALID' })
  }
  if (policy?.masterEnabled === true && policy?.configurationValid !== true) {
    return Object.freeze({ mode: PROFITABILITY_ACCESS_PROFILE_MODES.BLOCKED, code: 'ROLLOUT_INVALID' })
  }

  const enforcementRelationReady = await relationExists(
    client,
    PROFITABILITY_ACCESS_ENFORCEMENT_RELATION,
  )
  let enforced = false
  if (enforcementRelationReady) {
    let result
    try {
      result = await client.query(
        `select schema_version
           from public.profitability_access_enforcement
          where org_id = $1::text
          limit 2`,
        [organizationId],
      )
    } catch (error) {
      const wrapped = new Error('Profitability access enforcement marker cannot be read')
      wrapped.code = 'PROFITABILITY_ACCESS_PROFILE_SCHEMA_NOT_READY'
      wrapped.statusCode = 503
      wrapped.cause = error
      throw wrapped
    }
    if (result.rows.length > 1 || (
      result.rows.length === 1 && text(result.rows[0].schema_version).toLowerCase() !== 'v2'
    )) {
      return Object.freeze({ mode: PROFITABILITY_ACCESS_PROFILE_MODES.BLOCKED, code: 'ENFORCEMENT_INVALID' })
    }
    enforced = result.rows.length === 1
  }

  const allowlisted = isProfitabilityAccessProfileOrganizationAllowed(policy, organizationId)
  if (enforced) {
    return Object.freeze({
      mode: allowlisted
        ? PROFITABILITY_ACCESS_PROFILE_MODES.V2
        : PROFITABILITY_ACCESS_PROFILE_MODES.BLOCKED,
      code: allowlisted ? 'V2_ENFORCED' : 'V2_ENFORCED_NOT_ENABLED',
    })
  }
  if (allowlisted) {
    return Object.freeze({
      mode: PROFITABILITY_ACCESS_PROFILE_MODES.BLOCKED,
      code: 'V2_PROVISIONING_REQUIRED',
    })
  }
  return Object.freeze({ mode: PROFITABILITY_ACCESS_PROFILE_MODES.LEGACY, code: 'LEGACY_NOT_ENFORCED' })
}

async function resolveProfitabilityAccessProfileSessionMode(input) {
  try {
    return await resolveProfitabilityAccessProfileOrganizationMode(input)
  } catch {
    // An optional finance module must fail closed without taking down sign-in
    // or unrelated portal capabilities when its enforcement state is unreadable.
    return Object.freeze({
      mode: PROFITABILITY_ACCESS_PROFILE_MODES.BLOCKED,
      code: 'ENFORCEMENT_UNAVAILABLE',
    })
  }
}

module.exports = {
  PROFITABILITY_ACCESS_ENFORCEMENT_RELATION,
  PROFITABILITY_ACCESS_PROFILE_MODES,
  gateProfitabilityModuleCapabilities,
  isProfitabilityAccessProfileOrganizationAllowed,
  parseAllowedOrganizationIds,
  resolveProfitabilityAccessProfileOrganizationMode,
  resolveProfitabilityAccessProfileRollout,
  resolveProfitabilityAccessProfileSessionMode,
}
