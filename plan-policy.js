'use strict'

const CANONICAL_PLAN_CODES = Object.freeze(['TRIAL', 'GO_PLUS', 'PLUS', 'PRO'])
const PAID_PLAN_CODES = Object.freeze(['GO_PLUS', 'PLUS', 'PRO'])

const PLAN_ALIASES = Object.freeze({
  TRIAL: 'TRIAL',
  DEMO: 'TRIAL',
  GO_PLUS: 'GO_PLUS',
  PLUS: 'PLUS',
  START: 'PLUS',
  PRO: 'PRO',
  ENTERPRISE: 'PRO',
})

const GO_PLUS_CAPABILITIES = Object.freeze({
  timeTracking: true,
  timeQrNfc: true,
  scanLocation: true,
  activeWorkerMap: true,
  attendanceReports: true,
  availability: false,
  absences: false,
  scheduling: false,
  staffingConflicts: false,
  planVsActual: false,
  zoneTasks: false,
  checklistProof: false,
  qualitySla: false,
  profitabilityModule: false,
  clientPortal: false,
})

const PLUS_CAPABILITIES = Object.freeze({
  ...GO_PLUS_CAPABILITIES,
  availability: true,
  absences: true,
  scheduling: true,
  staffingConflicts: true,
  planVsActual: true,
})

const PRO_CAPABILITIES = Object.freeze({
  ...PLUS_CAPABILITIES,
  zoneTasks: true,
  checklistProof: true,
  qualitySla: true,
  profitabilityModule: true,
  clientPortal: true,
})

const UNKNOWN_CAPABILITIES = Object.freeze(
  Object.fromEntries(Object.keys(PRO_CAPABILITIES).map((key) => [key, false])),
)

const STANDARD_LIMITS = Object.freeze({
  includedWorkerSlots: 10,
  includedProObjects: 0,
  includedZonesPerProObject: 0,
  overageAllowed: true,
  enforcement: 'METERED',
})

const PRO_LIMITS = Object.freeze({
  ...STANDARD_LIMITS,
  includedProObjects: 1,
  includedZonesPerProObject: 20,
})

const UNKNOWN_LIMITS = Object.freeze({
  includedWorkerSlots: 0,
  includedProObjects: 0,
  includedZonesPerProObject: 0,
  overageAllowed: false,
  enforcement: 'DENY',
})

const PLAN_DEFINITIONS = Object.freeze({
  TRIAL: Object.freeze({
    code: 'TRIAL',
    label: 'Trial',
    paid: false,
    trialDays: 7,
    capabilities: GO_PLUS_CAPABILITIES,
    limits: STANDARD_LIMITS,
  }),
  GO_PLUS: Object.freeze({
    code: 'GO_PLUS',
    label: 'GO+',
    paid: true,
    trialDays: 0,
    capabilities: GO_PLUS_CAPABILITIES,
    limits: STANDARD_LIMITS,
  }),
  PLUS: Object.freeze({
    code: 'PLUS',
    label: 'PLUS',
    paid: true,
    trialDays: 0,
    capabilities: PLUS_CAPABILITIES,
    limits: STANDARD_LIMITS,
  }),
  PRO: Object.freeze({
    code: 'PRO',
    label: 'PRO',
    paid: true,
    trialDays: 0,
    capabilities: PRO_CAPABILITIES,
    limits: PRO_LIMITS,
  }),
  UNKNOWN: Object.freeze({
    code: 'UNKNOWN',
    label: 'Nieznany',
    paid: false,
    trialDays: 0,
    capabilities: UNKNOWN_CAPABILITIES,
    limits: UNKNOWN_LIMITS,
  }),
})

function text(value) {
  return String(value ?? '').trim()
}

function normalizeIdentifier(value, { preservePlus = false } = {}) {
  const raw = text(value)
  if (!raw) return ''
  const withoutDiacritics = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const withPlus = preservePlus ? withoutDiacritics.replace(/\+/g, ' PLUS ') : withoutDiacritics
  return withPlus
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
}

/**
 * Normalizes canonical and historical read-time plan codes.
 * @param {unknown} value
 * @returns {'TRIAL'|'GO_PLUS'|'PLUS'|'PRO'|'UNKNOWN'}
 */
function normalizePlanCode(value) {
  return PLAN_ALIASES[normalizeIdentifier(value, { preservePlus: true })] || 'UNKNOWN'
}

function isCanonicalPlanCode(value) {
  return CANONICAL_PLAN_CODES.includes(text(value).toUpperCase())
}

/**
 * Validates a plan code used by a new write.
 * @param {unknown} value
 * @returns {'TRIAL'|'GO_PLUS'|'PLUS'|'PRO'}
 */
function assertCanonicalPlanCode(value) {
  const planCode = text(value).toUpperCase()
  if (!isCanonicalPlanCode(planCode)) {
    const error = new Error('INVALID_PLAN')
    error.statusCode = 400
    error.publicCode = 'INVALID_PLAN'
    error.publicMessage = `Dozwolone plany to ${CANONICAL_PLAN_CODES.join(', ')}.`
    throw error
  }
  return planCode
}

function resolvePlanDefinition(value) {
  const code = normalizePlanCode(value)
  return PLAN_DEFINITIONS[code] || PLAN_DEFINITIONS.UNKNOWN
}

/**
 * Returns immutable capability and limit definitions for a normalized plan.
 * @param {unknown} value
 */
function resolvePlanEntitlements(value) {
  const definition = resolvePlanDefinition(value)
  return {
    planCode: definition.code,
    planName: definition.label,
    paid: definition.paid,
    capabilities: definition.capabilities,
    limits: definition.limits,
  }
}

function hasPlanCapability(planCode, capability) {
  return resolvePlanDefinition(planCode).capabilities[text(capability)] === true
}

/**
 * Reports consumption above an included unit without turning it into a hard limit.
 * @param {unknown} usedValue
 * @param {unknown} includedValue
 */
function calculateMeteredOverage(usedValue, includedValue) {
  const used = Math.max(0, Math.trunc(Number(usedValue) || 0))
  const included = Math.max(0, Math.trunc(Number(includedValue) || 0))
  return { used, included, overage: Math.max(0, used - included) }
}

function validDate(value) {
  const date = value instanceof Date ? value : value ? new Date(value) : null
  return date && Number.isFinite(date.getTime()) ? date : null
}

/**
 * Evaluates organization subscription access without granting aliases extra rights.
 * @param {object} subscription
 * @param {Date|string|number} nowValue
 */
function evaluateSubscriptionAccess(subscription = {}, nowValue = new Date()) {
  const rawPlanCode = text(subscription.planCode ?? subscription.plan_code).toUpperCase()
  const planCode = normalizePlanCode(rawPlanCode)
  const status = text(subscription.status ?? subscription.subscriptionStatus ?? subscription.subscription_status).toUpperCase()
  const now = validDate(nowValue)

  if (planCode === 'UNKNOWN') {
    return { allowed: false, code: 'SUBSCRIPTION_MISSING', planCode, rawPlanCode, status }
  }

  if (planCode === 'TRIAL') {
    const trialEndsAt = validDate(subscription.trialEndsAt ?? subscription.trial_ends_at)
    const allowed = status === 'TRIALING' && now && trialEndsAt && trialEndsAt.getTime() > now.getTime()
    return {
      allowed: Boolean(allowed),
      code: allowed ? 'ACCESS_ALLOWED' : 'TRIAL_INACTIVE',
      planCode,
      rawPlanCode,
      status,
    }
  }

  const allowed = status === 'ACTIVE'
  return {
    allowed,
    code: allowed ? 'ACCESS_ALLOWED' : 'SUBSCRIPTION_INACTIVE',
    planCode,
    rawPlanCode,
    status,
  }
}

module.exports = {
  CANONICAL_PLAN_CODES,
  PAID_PLAN_CODES,
  PLAN_ALIASES,
  PLAN_DEFINITIONS,
  assertCanonicalPlanCode,
  calculateMeteredOverage,
  evaluateSubscriptionAccess,
  hasPlanCapability,
  isCanonicalPlanCode,
  normalizeIdentifier,
  normalizePlanCode,
  resolvePlanDefinition,
  resolvePlanEntitlements,
}
