'use strict'

const ORGANIZATION_ID_PATTERN = /^[a-z0-9_-]{1,64}$/i
const PROFITABILITY_FINANCIAL_MODEL_ENFORCEMENT_RELATION =
  'public.profitability_financial_model_enforcement'

const PROFITABILITY_FINANCIAL_MODEL_MODES = Object.freeze({
  BLOCKED: 'BLOCKED',
  FOUNDATION_V2: 'FOUNDATION_V2',
  V21: 'V21',
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

function resolveProfitabilityFinancialModelRollout(environment = {}) {
  const allowlistSource = text(
    environment.PROFITABILITY_FINANCIAL_MODEL_V21_ALLOWED_ORG_IDS,
  )
  const allowedOrganizationIds = parseAllowedOrganizationIds(allowlistSource)
  const masterEnabled = isTrue(environment.PROFITABILITY_FINANCIAL_MODEL_V21_ENABLED)
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

function isProfitabilityFinancialModelOrganizationAllowed(policy, organizationIdValue) {
  const organizationId = text(organizationIdValue)
  return Boolean(
    policy?.enabled
      && ORGANIZATION_ID_PATTERN.test(organizationId)
      && Array.isArray(policy.allowedOrganizationIds)
      && policy.allowedOrganizationIds.includes(organizationId),
  )
}

async function resolveProfitabilityFinancialModelOrganizationMode({
  client,
  organizationId: organizationIdValue,
  policy,
  relationExists,
}) {
  const organizationId = text(organizationIdValue)
  if (!ORGANIZATION_ID_PATTERN.test(organizationId)) {
    return Object.freeze({
      mode: PROFITABILITY_FINANCIAL_MODEL_MODES.BLOCKED,
      code: 'ORG_INVALID',
    })
  }
  if (policy?.masterEnabled === true && policy?.configurationValid !== true) {
    return Object.freeze({
      mode: PROFITABILITY_FINANCIAL_MODEL_MODES.BLOCKED,
      code: 'ROLLOUT_INVALID',
    })
  }

  const enforcementRelationReady = await relationExists(
    client,
    PROFITABILITY_FINANCIAL_MODEL_ENFORCEMENT_RELATION,
  )
  let enforced = false
  if (enforcementRelationReady) {
    let result
    try {
      result = await client.query(
        `select schema_version
           from public.profitability_financial_model_enforcement
          where org_id = $1::text
          limit 2`,
        [organizationId],
      )
    } catch (error) {
      const wrapped = new Error('Profitability financial model enforcement marker cannot be read')
      wrapped.code = 'PROFITABILITY_FINANCIAL_MODEL_SCHEMA_NOT_READY'
      wrapped.statusCode = 503
      wrapped.cause = error
      throw wrapped
    }

    if (!Array.isArray(result?.rows)) {
      const error = new Error('Profitability financial model enforcement marker result is invalid')
      error.code = 'PROFITABILITY_FINANCIAL_MODEL_SCHEMA_NOT_READY'
      error.statusCode = 503
      throw error
    }
    if (result.rows.length > 1 || (
      result.rows.length === 1 && result.rows[0]?.schema_version !== 'v2.1'
    )) {
      return Object.freeze({
        mode: PROFITABILITY_FINANCIAL_MODEL_MODES.BLOCKED,
        code: 'ENFORCEMENT_INVALID',
      })
    }
    enforced = result.rows.length === 1
  }

  const allowlisted = isProfitabilityFinancialModelOrganizationAllowed(policy, organizationId)
  if (enforced) {
    return Object.freeze({
      mode: allowlisted
        ? PROFITABILITY_FINANCIAL_MODEL_MODES.V21
        : PROFITABILITY_FINANCIAL_MODEL_MODES.BLOCKED,
      code: allowlisted ? 'V21_ENFORCED' : 'V21_ENFORCED_NOT_ENABLED',
    })
  }
  if (allowlisted) {
    return Object.freeze({
      mode: PROFITABILITY_FINANCIAL_MODEL_MODES.BLOCKED,
      code: 'V21_PROVISIONING_REQUIRED',
    })
  }
  return Object.freeze({
    mode: PROFITABILITY_FINANCIAL_MODEL_MODES.FOUNDATION_V2,
    code: 'FOUNDATION_V2_NOT_ENFORCED',
  })
}

async function resolveProfitabilityFinancialModelSessionMode(input) {
  try {
    return await resolveProfitabilityFinancialModelOrganizationMode(input)
  } catch {
    // The optional financial model must fail closed without taking down sign-in
    // or unrelated portal capabilities when its enforcement state is unreadable.
    return Object.freeze({
      mode: PROFITABILITY_FINANCIAL_MODEL_MODES.BLOCKED,
      code: 'ENFORCEMENT_UNAVAILABLE',
    })
  }
}

module.exports = {
  PROFITABILITY_FINANCIAL_MODEL_ENFORCEMENT_RELATION,
  PROFITABILITY_FINANCIAL_MODEL_MODES,
  isProfitabilityFinancialModelOrganizationAllowed,
  parseAllowedOrganizationIds,
  resolveProfitabilityFinancialModelOrganizationMode,
  resolveProfitabilityFinancialModelRollout,
  resolveProfitabilityFinancialModelSessionMode,
}
