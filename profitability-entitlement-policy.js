'use strict'

const {
  hasPlanCapability,
  normalizeIdentifier,
  normalizePlanCode,
  resolvePlanEntitlements,
} = require('./plan-policy')

// Security boundary: actor, subscription, grants and accessContext must come
// from authenticated server-side state, never directly from the request body.

const PROFITABILITY_CAPABILITY = 'profitabilityModule'
const PROFITABILITY_ACTIONS = Object.freeze({
  READ: 'read',
  EDIT: 'edit',
})

const ROLE_ALIASES = Object.freeze({
  OWNER: 'OWNER',
  WLASCICIEL: 'OWNER',
  FINANCE_ADMIN: 'FINANCE_ADMIN',
  FINANCIAL_ADMIN: 'FINANCE_ADMIN',
  ADMIN_FINANCE: 'FINANCE_ADMIN',
  ADMIN_FINANSOWY: 'FINANCE_ADMIN',
  ADMINISTRATOR_FINANSOWY: 'FINANCE_ADMIN',
  PLATFORM_OWNER: 'PLATFORM_OWNER',
  ADMIN: 'ADMIN',
  ADMINISTRATOR: 'ADMIN',
  SUPERADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  KIEROWNIK: 'MANAGER',
  COORDINATOR: 'COORDINATOR',
  KOORDYNATOR: 'COORDINATOR',
  MEMBER: 'COORDINATOR',
  WORKER: 'WORKER',
  PRACOWNIK: 'WORKER',
  INTERN: 'WORKER',
  STAZYSTA: 'WORKER',
})

function text(value) {
  return String(value ?? '').trim()
}

function normalizeProfitabilityRole(value) {
  const key = normalizeIdentifier(value)
  return ROLE_ALIASES[key] || 'UNKNOWN'
}

function normalizeOrganizationId(value) {
  const orgId = text(value)
  return /^[a-z0-9_-]{1,64}$/i.test(orgId) ? orgId : ''
}

function normalizeAction(value) {
  const action = text(value).toLowerCase()
  return action === PROFITABILITY_ACTIONS.READ || action === PROFITABILITY_ACTIONS.EDIT ? action : ''
}

function hasProfitabilityCapability(planCode) {
  return hasPlanCapability(planCode, PROFITABILITY_CAPABILITY)
}

function profitabilityGrantValue(grants) {
  if (!grants) return undefined

  if (Array.isArray(grants)) {
    return grants.some((entry) => text(entry) === PROFITABILITY_CAPABILITY) ? true : undefined
  }

  if (typeof grants !== 'object') return undefined
  return Object.prototype.hasOwnProperty.call(grants, PROFITABILITY_CAPABILITY)
    ? grants[PROFITABILITY_CAPABILITY]
    : undefined
}

function hasExplicitProfitabilityGrant(grants) {
  const value = profitabilityGrantValue(grants)
  if (value === true) return true
  if (typeof value === 'string') {
    return ['READ', 'VIEW', 'EDIT', 'MANAGE', 'ALLOW', 'ALLOWED'].includes(normalizeIdentifier(value))
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return value.allowed === true || value.read === true || value.view === true || value.edit === true
}

class ProfitabilityAccessError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'ProfitabilityAccessError'
    this.code = code
    this.statusCode = 403
    this.details = details
  }
}

function assertProfitabilityTenantIsolation({
  requestOrgId,
  authenticatedOrgId = '',
  accessContextOrgId = '',
} = {}) {
  const rawAuthenticatedOrgId = text(authenticatedOrgId)
  const rawAccessContextOrgId = text(accessContextOrgId)
  const requestOrganization = normalizeOrganizationId(requestOrgId)
  const authenticatedOrganization = normalizeOrganizationId(authenticatedOrgId)
  const accessContextOrganization = normalizeOrganizationId(accessContextOrgId)

  if (!requestOrganization) {
    throw new ProfitabilityAccessError(
      'PROFITABILITY_ORG_REQUIRED',
      'Żądanie modułu rentowności musi wskazywać prawidłową organizację.',
    )
  }

  if (
    (rawAuthenticatedOrgId && !authenticatedOrganization) ||
    (rawAccessContextOrgId && !accessContextOrganization)
  ) {
    throw new ProfitabilityAccessError(
      'PROFITABILITY_TENANT_CONTEXT_INVALID',
      'Kontekst organizacji dla modułu rentowności jest nieprawidłowy.',
      { requestOrgId: requestOrganization },
    )
  }

  if (!authenticatedOrganization && !accessContextOrganization) {
    throw new ProfitabilityAccessError(
      'PROFITABILITY_TENANT_CONTEXT_REQUIRED',
      'Brak zaufanego kontekstu organizacji dla modułu rentowności.',
      { requestOrgId: requestOrganization },
    )
  }

  const mismatchedOrganization = [authenticatedOrganization, accessContextOrganization]
    .filter(Boolean)
    .find((orgId) => orgId !== requestOrganization)

  if (mismatchedOrganization) {
    throw new ProfitabilityAccessError(
      'PROFITABILITY_CROSS_ORG_FORBIDDEN',
      'Nie można odczytać danych rentowności innej organizacji.',
      {
        requestOrgId: requestOrganization,
        authenticatedOrgId: authenticatedOrganization || null,
        accessContextOrgId: accessContextOrganization || null,
      },
    )
  }

  return requestOrganization
}

function accessContextValue(context, camelCase, snakeCase) {
  return context?.[camelCase] ?? context?.[snakeCase]
}

function isValidAuditedPlatformContext({ actor, accessContext, requestOrgId, now = new Date() }) {
  if (normalizeProfitabilityRole(actor?.roleCode ?? actor?.role) !== 'PLATFORM_OWNER') return false
  if (normalizeIdentifier(actor?.actorType) !== 'PLATFORM') return false

  const contextId = text(accessContextValue(accessContext, 'contextId', 'context_id'))
  const actorContextId = text(actor?.platformContextId)
  const contextOrgId = normalizeOrganizationId(accessContextValue(accessContext, 'orgId', 'org_id'))
  const actorUid = text(actor?.uid)
  const contextAdminUid = text(accessContextValue(accessContext, 'adminUid', 'admin_uid'))
  const reason = text(accessContext?.reason)
  const openedAtValue = accessContextValue(accessContext, 'openedAt', 'opened_at')
  const openedAt = openedAtValue ? new Date(openedAtValue) : null
  const closedAt = accessContextValue(accessContext, 'closedAt', 'closed_at')
  const expiresAtValue = accessContextValue(accessContext, 'expiresAt', 'expires_at')
  const expiresAt = expiresAtValue ? new Date(expiresAtValue) : null
  const nowDate = now instanceof Date ? now : new Date(now)

  if (!contextId || !actorContextId || contextId !== actorContextId) return false
  if (!contextOrgId || contextOrgId !== normalizeOrganizationId(requestOrgId)) return false
  if (!actorUid || !contextAdminUid || actorUid !== contextAdminUid) return false
  if (reason.length < 3) return false
  if (!openedAt || !Number.isFinite(openedAt.getTime())) return false
  if (text(closedAt)) return false
  if (!Number.isFinite(nowDate.getTime())) return false
  if (expiresAtValue && (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= nowDate.getTime())) return false

  const contextStatus = normalizeIdentifier(accessContext?.status)
  return !contextStatus || contextStatus === 'ACTIVE'
}

function isFinanceAdministrator(actor, role) {
  return role === 'FINANCE_ADMIN' || (role === 'ADMIN' && (actor?.financeAdmin === true || actor?.isFinanceAdmin === true))
}

function accessDecision({ allowed, code, action, planCode, role, orgId, explicitGrant = false }) {
  return {
    capability: PROFITABILITY_CAPABILITY,
    action,
    allowed,
    code,
    planCode,
    role,
    orgId,
    explicitGrant,
  }
}

function resolveProfitabilityAccess(input = {}) {
  const action = normalizeAction(input.action || PROFITABILITY_ACTIONS.READ)
  if (!action) {
    throw new TypeError('Profitability action must be "read" or "edit".')
  }

  const actor = input.actor && typeof input.actor === 'object' ? input.actor : {}
  const accessContext = input.accessContext && typeof input.accessContext === 'object'
    ? input.accessContext
    : input.platformAccessContext && typeof input.platformAccessContext === 'object'
      ? input.platformAccessContext
      : {}
  const authenticatedOrgId =
    input.authenticatedOrgId ?? actor.activeOrgId ?? actor.orgId ?? actor.organizationId
  const accessContextOrgId =
    input.accessContextOrgId ?? accessContextValue(accessContext, 'orgId', 'org_id')
  const orgId = assertProfitabilityTenantIsolation({
    requestOrgId: input.requestOrgId,
    authenticatedOrgId,
    accessContextOrgId,
  })

  const planInput =
    input.planCode ??
    input.subscription?.planCode ??
    input.subscription?.plan_code ??
    accessContextValue(accessContext, 'planCode', 'plan_code') ??
    actor.planCode
  const subscriptionStatus = normalizeIdentifier(
    input.subscriptionStatus ??
    input.subscription?.status ??
    accessContextValue(accessContext, 'subscriptionStatus', 'subscription_status') ??
    actor.subscriptionStatus,
  )
  const { planCode, capabilities } = resolvePlanEntitlements(planInput)
  const role = normalizeProfitabilityRole(actor.roleCode ?? actor.role)

  if (capabilities[PROFITABILITY_CAPABILITY] !== true) {
    return accessDecision({
      allowed: false,
      code: 'PROFITABILITY_PLAN_REQUIRED',
      action,
      planCode,
      role,
      orgId,
    })
  }

  if (subscriptionStatus !== 'ACTIVE') {
    return accessDecision({
      allowed: false,
      code: 'PROFITABILITY_SUBSCRIPTION_INACTIVE',
      action,
      planCode,
      role,
      orgId,
    })
  }

  if (role === 'WORKER') {
    return accessDecision({
      allowed: false,
      code: 'PROFITABILITY_ROLE_FORBIDDEN',
      action,
      planCode,
      role,
      orgId,
    })
  }

  if (role === 'PLATFORM_OWNER') {
    const allowed = isValidAuditedPlatformContext({
      actor,
      accessContext,
      requestOrgId: orgId,
      now: input.now,
    })
    return accessDecision({
      allowed,
      code: allowed ? 'PROFITABILITY_ACCESS_ALLOWED' : 'PROFITABILITY_PLATFORM_CONTEXT_REQUIRED',
      action,
      planCode,
      role,
      orgId,
    })
  }

  if (role === 'OWNER' || isFinanceAdministrator(actor, role)) {
    return accessDecision({
      allowed: true,
      code: 'PROFITABILITY_ACCESS_ALLOWED',
      action,
      planCode,
      role,
      orgId,
    })
  }

  if (role === 'ADMIN') {
    const explicitGrant = hasExplicitProfitabilityGrant(input.grants ?? actor.grants ?? actor.permissions)
    const allowed = action === PROFITABILITY_ACTIONS.READ && explicitGrant
    return accessDecision({
      allowed,
      code: allowed
        ? 'PROFITABILITY_ACCESS_ALLOWED'
        : explicitGrant
          ? 'PROFITABILITY_EDIT_FORBIDDEN'
          : 'PROFITABILITY_GRANT_REQUIRED',
      action,
      planCode,
      role,
      orgId,
      explicitGrant,
    })
  }

  if (role === 'COORDINATOR') {
    const explicitGrant = hasExplicitProfitabilityGrant(input.grants ?? actor.grants ?? actor.permissions)
    const allowed = action === PROFITABILITY_ACTIONS.READ && explicitGrant
    return accessDecision({
      allowed,
      code: allowed
        ? 'PROFITABILITY_ACCESS_ALLOWED'
        : explicitGrant
          ? 'PROFITABILITY_EDIT_FORBIDDEN'
          : 'PROFITABILITY_GRANT_REQUIRED',
      action,
      planCode,
      role,
      orgId,
      explicitGrant,
    })
  }

  return accessDecision({
    allowed: false,
    code: 'PROFITABILITY_ROLE_FORBIDDEN',
    action,
    planCode,
    role,
    orgId,
  })
}

function assertProfitabilityAccess(input = {}) {
  const decision = resolveProfitabilityAccess(input)
  if (!decision.allowed) {
    throw new ProfitabilityAccessError(
      decision.code,
      'Brak dostępu do danych finansowych i rentowności.',
      decision,
    )
  }
  return decision
}

function canReadProfitability(input = {}) {
  return resolveProfitabilityAccess({ ...input, action: PROFITABILITY_ACTIONS.READ }).allowed
}

function canEditProfitability(input = {}) {
  return resolveProfitabilityAccess({ ...input, action: PROFITABILITY_ACTIONS.EDIT }).allowed
}

module.exports = {
  PROFITABILITY_ACTIONS,
  PROFITABILITY_CAPABILITY,
  ProfitabilityAccessError,
  assertProfitabilityAccess,
  assertProfitabilityTenantIsolation,
  canEditProfitability,
  canReadProfitability,
  hasExplicitProfitabilityGrant,
  hasProfitabilityCapability,
  isValidAuditedPlatformContext,
  normalizePlanCode,
  normalizeProfitabilityRole,
  resolvePlanEntitlements,
  resolveProfitabilityAccess,
}
