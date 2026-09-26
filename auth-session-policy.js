'use strict'

const { resolveProfitabilityAccess } = require('./profitability-entitlement-policy')
const { resolveProfitabilityAccessProfile } = require('./profitability/access-profile-v2')
const {
  evaluateSubscriptionAccess,
  normalizePlanCode,
  resolvePlanEntitlements,
} = require('./plan-policy')

const TENANT_EMAIL_VERIFICATION_POLICY = Object.freeze({
  requiredFrom: '2026-08-01T00:00:00.000Z',
})

function toText(value) {
  return String(value ?? '').trim()
}

function toStatus(value) {
  return toText(value).toUpperCase()
}

function toTimestamp(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  const timestamp = date.getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

/**
 * Keeps pre-rollout tenant accounts usable while requiring verified email for
 * every new account. Firebase account creation time is authoritative; database
 * timestamps are a compatibility fallback for legacy tokens without metadata.
 */
function evaluateTenantEmailVerification(decodedToken, row = {}, requiredFromValue = '') {
  const email = toText(decodedToken?.email).toLowerCase()
  if (!email) {
    return { allowed: false, code: 'EMAIL_VERIFICATION_REQUIRED', exempt: false }
  }
  if (decodedToken?.email_verified === true) {
    return { allowed: true, code: 'EMAIL_VERIFIED', exempt: false }
  }

  const requiredFrom = toTimestamp(requiredFromValue)
    ?? toTimestamp(TENANT_EMAIL_VERIFICATION_POLICY.requiredFrom)
  const accountCreatedAt = toTimestamp(
    decodedToken?.account_created_at ?? decodedToken?.accountCreatedAt,
  )
  const fallbackCreatedAt = [
    toTimestamp(row?.membership_created_at),
    toTimestamp(row?.worker_created_at),
  ].filter((value) => value !== null)
  const createdAt = accountCreatedAt ?? (
    fallbackCreatedAt.length ? Math.min(...fallbackCreatedAt) : null
  )

  if (createdAt !== null && requiredFrom !== null && createdAt < requiredFrom) {
    return {
      allowed: true,
      code: 'LEGACY_EMAIL_VERIFICATION_EXEMPT',
      exempt: true,
      accountCreatedAt: new Date(createdAt).toISOString(),
    }
  }

  return { allowed: false, code: 'EMAIL_VERIFICATION_REQUIRED', exempt: false }
}

function normalizeOrganizationId(value) {
  const orgId = toText(value)
  return /^[a-z0-9_-]{1,64}$/i.test(orgId) ? orgId : ''
}

function isExplicitFalse(value) {
  if (value === false) {
    return true
  }
  if (typeof value === 'number') {
    return value === 0
  }
  return ['FALSE', '0', 'NO', 'NIE'].includes(toStatus(value))
}

function isPortalWorkerRole(value) {
  const role = toStatus(value)
  return ['WORKER', 'PRACOWNIK', 'INTERN', 'STAZYSTA', 'STAŻYSTA'].includes(role)
}

function isKnownPortalRole(value) {
  return [
    'ADMIN',
    'ADMINISTRATOR',
    'OWNER',
    'SUPERADMIN',
    'MANAGER',
    'KIEROWNIK',
    'COORDINATOR',
    'KOORDYNATOR',
    'MEMBER',
  ].includes(toStatus(value))
}

function isSubscriptionlessFacilityManager(row) {
  return (
    toStatus(row?.organization_kind) === 'FACILITY_MANAGER' &&
    !toStatus(row?.plan_code) &&
    !toStatus(row?.subscription_status)
  )
}

function deny(code) {
  return { allowed: false, code }
}

function evaluateOrganizationAccess(row, now = new Date()) {
  if (!row || typeof row !== 'object') {
    return deny('MEMBERSHIP_MISSING')
  }

  if (toStatus(row.membership_status) !== 'ACTIVE') {
    return deny('MEMBERSHIP_INACTIVE')
  }

  if (!toText(row.worker_record_id) || !toText(row.worker_auth_uid)) {
    return deny('WORKER_MISSING')
  }

  if (isExplicitFalse(row.worker_active)) {
    return deny('WORKER_INACTIVE')
  }

  if (toStatus(row.worker_status) === 'DELETED') {
    return deny('WORKER_DELETED')
  }

  if (!['ACTIVE', 'TRIAL'].includes(toStatus(row.organization_status)) || row.organization_deleted_at) {
    return deny('ORGANIZATION_UNAVAILABLE')
  }

  if (!toText(row.organization_name)) {
    return deny('ORGANIZATION_NAME_MISSING')
  }

  if (isPortalWorkerRole(row.role)) {
    return deny('PORTAL_ROLE_FORBIDDEN')
  }

  if (!isKnownPortalRole(row.role)) {
    return deny('PORTAL_ROLE_MISSING')
  }

  // Facility managers have a product-level, non-billed entitlement. This runs
  // after membership/worker/role checks, so it cannot bypass portal security.
  if (isSubscriptionlessFacilityManager(row)) {
    return { allowed: true, code: 'ACCESS_ALLOWED' }
  }

  const subscriptionAccess = evaluateSubscriptionAccess({
    planCode: row.plan_code,
    status: row.subscription_status,
    trialEndsAt: row.trial_ends_at,
  }, now)
  return subscriptionAccess.allowed
    ? { allowed: true, code: 'ACCESS_ALLOWED' }
    : deny(subscriptionAccess.code)
}

function buildOrganizationSummary(row) {
  return {
    orgId: toText(row.org_id),
    organizationName: toText(row.organization_name),
    organizationKind: toStatus(row.organization_kind),
    role: toStatus(row.role),
    onboardingStatus: toStatus(row.onboarding_status),
    planCode: isSubscriptionlessFacilityManager(row) ? 'FREE' : normalizePlanCode(row.plan_code),
  }
}

function toIsoTimestamp(value) {
  if (!value) {
    return ''
  }

  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : ''
}

function buildSessionContext(uid, row) {
  const facilityManagerFreeAccess = isSubscriptionlessFacilityManager(row)
  const rawPlanCode = toStatus(row.plan_code)
  const normalizedPlanCode = normalizePlanCode(rawPlanCode)
  const planCode = facilityManagerFreeAccess ? 'FREE' : normalizedPlanCode
  const entitlements = resolvePlanEntitlements(normalizedPlanCode)
  const subscriptionStatus = facilityManagerFreeAccess ? 'UNLIMITED' : toStatus(row.subscription_status)
  const subscriptionEndsAt =
    facilityManagerFreeAccess
      ? ''
      : planCode === 'TRIAL'
      ? toIsoTimestamp(row.trial_ends_at)
      : toIsoTimestamp(row.current_period_ends_at)

  const profitabilityInput = {
    requestOrgId: toText(row.org_id),
    actor: {
      uid: toText(uid),
      role: toStatus(row.role),
      activeOrgId: toText(row.org_id),
      isFinanceAdmin: row.is_finance_admin === true,
    },
    subscription: {
      planCode,
      status: subscriptionStatus,
    },
    grants: row.profitability_grants,
  }
  const accessProfileV2Enabled = row.profitability_access_profile_v2_enabled === true
  const accessProfileV2Blocked = row.profitability_access_profile_v2_blocked === true
  const financialModelV21Enabled = row.profitability_financial_model_v21_enabled === true
  const financialModelV21Blocked = row.profitability_financial_model_v21_blocked === true
  const accessProfile = accessProfileV2Enabled
    ? resolveProfitabilityAccessProfile({
        requestOrgId: toText(row.org_id),
        authenticatedOrgId: toText(row.org_id),
        authenticatedUid: toText(uid),
        membership: {
          orgId: toText(row.org_id),
          uid: toText(uid),
          role: toStatus(row.role),
          status: toStatus(row.membership_status),
        },
        binding: row.profitability_access_profile,
      })
    : null
  const profitabilityRead = financialModelV21Blocked
    ? { allowed: false, code: 'PROFITABILITY_FINANCIAL_MODEL_NOT_READY' }
    : accessProfileV2Enabled
    ? {
        allowed: accessProfile?.allowed === true && accessProfile.capabilities.readCostControl === true,
        code: accessProfile?.code || 'ACTIVE_BINDING_REQUIRED',
      }
    : accessProfileV2Blocked
      ? { allowed: false, code: 'PROFITABILITY_ACCESS_PROFILE_NOT_READY' }
      : resolveProfitabilityAccess({ ...profitabilityInput, action: 'read' })
  const profitabilityEdit = financialModelV21Blocked
    ? { allowed: false, code: 'PROFITABILITY_FINANCIAL_MODEL_NOT_READY' }
    : accessProfileV2Enabled
    ? {
        allowed: accessProfile?.allowed === true
          && accessProfile.capabilities.editContractTerms === true
          && accessProfile.capabilities.editProfitabilityTargets === true
          && accessProfile.capabilities.editWorkerRates === true,
        code: accessProfile?.allowed === true
          ? (
              accessProfile.capabilities.editContractTerms === true
                && accessProfile.capabilities.editProfitabilityTargets === true
                && accessProfile.capabilities.editWorkerRates === true
                ? 'PROFITABILITY_ACCESS_PROFILE_V2'
                : 'PROFITABILITY_SENSITIVE_EDIT_FORBIDDEN'
            )
          : accessProfile?.code || 'ACTIVE_BINDING_REQUIRED',
      }
    : accessProfileV2Blocked
      ? { allowed: false, code: 'PROFITABILITY_ACCESS_PROFILE_NOT_READY' }
      : resolveProfitabilityAccess({ ...profitabilityInput, action: 'edit' })
  const role = toStatus(row.role)
  const onboardingStatus = toStatus(row.onboarding_status) || 'IN_PROGRESS'

  return {
    uid: toText(uid),
    activeOrgId: toText(row.org_id),
    organizationName: toText(row.organization_name),
    organizationKind: toStatus(row.organization_kind),
    workerId: toText(row.worker_record_id),
    role,
    organizationStatus: toStatus(row.organization_status),
    onboardingStatus,
    onboardingRequired: role === 'OWNER' && onboardingStatus !== 'COMPLETED',
    rawPlanCode,
    planCode,
    planName: facilityManagerFreeAccess ? 'Bezpłatny' : entitlements.planName,
    subscriptionStatus,
    subscriptionEndsAt,
    limits: entitlements.limits,
    capabilities: {
      ...entitlements.capabilities,
      profitabilityModule: {
        enabled: entitlements.capabilities.profitabilityModule === true,
        canRead: profitabilityRead.allowed,
        canEdit: profitabilityEdit.allowed,
        readCode: profitabilityRead.code,
        editCode: profitabilityEdit.code,
        ...(financialModelV21Enabled ? { financialModelVersion: 'v2.1' } : {}),
        ...(accessProfileV2Enabled ? {
          accessVersion: 'v2',
          canEditOperationalCosts: accessProfile?.capabilities?.editOperationalCosts === true,
          financeProfile: accessProfile?.financeProfile ?? 'NONE',
          objectScope: accessProfile?.objectScope ?? 'NONE',
          operationalProfile: accessProfile?.operationalProfile ?? 'NONE',
          workerScope: accessProfile?.workerScope ?? 'NONE',
        } : {}),
      },
    },
  }
}

function resolveAccessibleOrganizations(rows, now = new Date()) {
  const grouped = new Map()

  for (const row of Array.isArray(rows) ? rows : []) {
    const orgId = toText(row?.org_id)
    if (!orgId) {
      continue
    }

    const access = evaluateOrganizationAccess(row, now)
    const existing = grouped.get(orgId)
    if (!existing || (!existing.access.allowed && access.allowed)) {
      grouped.set(orgId, { row, access })
    }
  }

  return [...grouped.values()]
    .filter((item) => item.access.allowed)
    .map((item) => item.row)
    .sort((left, right) => {
      const nameOrder = toText(left.organization_name).localeCompare(toText(right.organization_name), 'pl')
      return nameOrder || toText(left.org_id).localeCompare(toText(right.org_id), 'en')
    })
}

module.exports = {
  TENANT_EMAIL_VERIFICATION_POLICY,
  buildOrganizationSummary,
  buildSessionContext,
  evaluateTenantEmailVerification,
  evaluateOrganizationAccess,
  isPortalWorkerRole,
  normalizeOrganizationId,
  resolveAccessibleOrganizations,
}
