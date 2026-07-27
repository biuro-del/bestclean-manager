'use strict'

const { resolveProfitabilityAccess } = require('./profitability-entitlement-policy')

function toText(value) {
  return String(value ?? '').trim()
}

function toStatus(value) {
  return toText(value).toUpperCase()
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

  if (toStatus(row.organization_status) === 'SUSPENDED' || row.organization_deleted_at) {
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

  const planCode = toStatus(row.plan_code)
  const subscriptionStatus = toStatus(row.subscription_status)

  if (planCode === 'TRIAL') {
    const trialEndsAt = row.trial_ends_at ? new Date(row.trial_ends_at) : null
    const nowDate = now instanceof Date ? now : new Date(now)
    if (
      subscriptionStatus !== 'TRIALING' ||
      !trialEndsAt ||
      !Number.isFinite(trialEndsAt.getTime()) ||
      !Number.isFinite(nowDate.getTime()) ||
      trialEndsAt.getTime() <= nowDate.getTime()
    ) {
      return deny('TRIAL_INACTIVE')
    }
  } else if (planCode === 'START' || planCode === 'PRO' || planCode === 'ENTERPRISE') {
    if (subscriptionStatus !== 'ACTIVE') {
      return deny('SUBSCRIPTION_INACTIVE')
    }
  } else {
    return deny('SUBSCRIPTION_MISSING')
  }

  return { allowed: true, code: 'ACCESS_ALLOWED' }
}

function buildOrganizationSummary(row) {
  return {
    orgId: toText(row.org_id),
    organizationName: toText(row.organization_name),
    role: toStatus(row.role),
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
  const planCode = toStatus(row.plan_code)
  const subscriptionEndsAt =
    planCode === 'TRIAL'
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
      status: toStatus(row.subscription_status),
    },
    grants: row.profitability_grants,
  }
  const profitabilityRead = resolveProfitabilityAccess({ ...profitabilityInput, action: 'read' })
  const profitabilityEdit = resolveProfitabilityAccess({ ...profitabilityInput, action: 'edit' })

  return {
    uid: toText(uid),
    activeOrgId: toText(row.org_id),
    organizationName: toText(row.organization_name),
    workerId: toText(row.worker_record_id),
    role: toStatus(row.role),
    planCode,
    subscriptionStatus: toStatus(row.subscription_status),
    subscriptionEndsAt,
    capabilities: {
      profitabilityModule: {
        enabled: ['PRO', 'ENTERPRISE'].includes(planCode),
        canRead: profitabilityRead.allowed,
        canEdit: profitabilityEdit.allowed,
        readCode: profitabilityRead.code,
        editCode: profitabilityEdit.code,
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
  buildOrganizationSummary,
  buildSessionContext,
  evaluateOrganizationAccess,
  isPortalWorkerRole,
  normalizeOrganizationId,
  resolveAccessibleOrganizations,
}
