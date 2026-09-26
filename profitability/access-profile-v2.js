'use strict'

// Security boundary: every value accepted by this module must be loaded by the
// backend from authenticated session state or organization-owned access rows.
// Never pass names, email addresses, roles or assignments from the request body.

const FINANCE_PROFILES = Object.freeze({
  OWNER_FULL: 'OWNER_FULL',
  COST_CONTROL: 'COST_CONTROL',
  NONE: 'NONE',
})

const OBJECT_SCOPES = Object.freeze({
  ALL: 'ALL',
  ASSIGNED: 'ASSIGNED',
  NONE: 'NONE',
})

const WORKER_SCOPES = Object.freeze({
  ALL: 'ALL',
  OBJECT_ASSIGNED: 'OBJECT_ASSIGNED',
  NONE: 'NONE',
})

const ACCESS_MODES = Object.freeze({
  READ: 'READ',
  MANAGE: 'MANAGE',
  NONE: 'NONE',
})

const OPERATIONAL_PROFILES = Object.freeze({
  OWNER: 'OWNER',
  OPERATIONS_ADMIN: 'OPERATIONS_ADMIN',
  ADMIN: 'ADMIN',
  COORDINATOR: 'COORDINATOR',
  NONE: 'NONE',
})

const OBJECT_ACTIONS = Object.freeze({
  READ: 'READ',
  MANAGE: 'MANAGE',
})

const WRITE_KINDS = Object.freeze({
  OPERATIONAL_DATA: 'OPERATIONAL_DATA',
  OPERATIONAL_COST: 'OPERATIONAL_COST',
  CONTRACT_TERMS: 'CONTRACT_TERMS',
  PROFITABILITY_TARGET: 'PROFITABILITY_TARGET',
  WORKER_RATE: 'WORKER_RATE',
})

const FINANCE_PROFILE_VALUES = new Set(Object.values(FINANCE_PROFILES))
const OBJECT_SCOPE_VALUES = new Set(Object.values(OBJECT_SCOPES))
const WORKER_SCOPE_VALUES = new Set(Object.values(WORKER_SCOPES))
const ACCESS_MODE_VALUES = new Set(Object.values(ACCESS_MODES))
const OPERATIONAL_PROFILE_VALUES = new Set(Object.values(OPERATIONAL_PROFILES))
const OBJECT_ACTION_VALUES = new Set(Object.values(OBJECT_ACTIONS))
const WRITE_KIND_VALUES = new Set(Object.values(WRITE_KINDS))

function text(value) {
  return String(value ?? '').trim()
}

function upper(value) {
  return text(value).toUpperCase()
}

function valueOf(row, camelCase, snakeCase) {
  return row?.[camelCase] ?? row?.[snakeCase]
}

function normalizeIdentifier(value, maxLength = 128) {
  const normalized = text(value)
  return normalized && normalized.length <= maxLength ? normalized : ''
}

function normalizeEnum(value, allowedValues) {
  const normalized = upper(value)
  return allowedValues.has(normalized) ? normalized : ''
}

function normalizeDate(value) {
  if (value === null || value === undefined || text(value) === '') return null
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  return Number.isFinite(date.getTime()) ? date : undefined
}

function isActiveAt(row, now) {
  if (upper(row?.status) !== 'ACTIVE') return false

  const validFrom = normalizeDate(valueOf(row, 'validFrom', 'valid_from'))
  const validUntil = normalizeDate(valueOf(row, 'validUntil', 'valid_until'))
  if (validFrom === undefined || validUntil === undefined) return false
  if (validFrom && validFrom.getTime() > now.getTime()) return false
  if (validUntil && validUntil.getTime() <= now.getTime()) return false
  return true
}

function emptyCapabilities() {
  return {
    readFullFinancials: false,
    readCostControl: false,
    manageOperations: false,
    editOperationalCosts: false,
    editContractTerms: false,
    editProfitabilityTargets: false,
    viewWorkerRates: false,
    editWorkerRates: false,
  }
}

function deriveCapabilities({ financeProfile, accessMode, binding }) {
  const canManage = accessMode === ACCESS_MODES.MANAGE
  const ownerFull = financeProfile === FINANCE_PROFILES.OWNER_FULL
  const costControl = financeProfile === FINANCE_PROFILES.COST_CONTROL

  return {
    readFullFinancials: ownerFull,
    readCostControl: ownerFull || costControl,
    manageOperations: canManage,
    editOperationalCosts: canManage && (
      ownerFull || (costControl && valueOf(binding, 'canEditOperationalCosts', 'can_edit_operational_costs') === true)
    ),
    editContractTerms: canManage && ownerFull,
    editProfitabilityTargets: canManage && ownerFull,
    viewWorkerRates: ownerFull,
    editWorkerRates: canManage && ownerFull,
  }
}

function deniedDecision(code, details = {}) {
  return {
    allowed: false,
    code,
    orgId: details.orgId || null,
    uid: details.uid || null,
    membershipRole: details.membershipRole || null,
    operationalProfile: OPERATIONAL_PROFILES.NONE,
    financeProfile: FINANCE_PROFILES.NONE,
    objectScope: OBJECT_SCOPES.NONE,
    workerScope: WORKER_SCOPES.NONE,
    accessMode: ACCESS_MODES.NONE,
    assignedObjectIds: [],
    deniedObjectIds: [],
    capabilities: emptyCapabilities(),
  }
}

function activeAssignmentObjectIds({ assignments, orgId, uid, now }) {
  const objectIds = new Set()
  const deniedObjectIds = new Set()

  for (const assignment of Array.isArray(assignments) ? assignments : []) {
    if (!assignment || typeof assignment !== 'object' || Array.isArray(assignment)) continue
    if (normalizeIdentifier(valueOf(assignment, 'orgId', 'org_id'), 64) !== orgId) continue
    if (normalizeIdentifier(assignment.uid) !== uid) continue
    if (!isActiveAt(assignment, now)) continue

    const objectId = normalizeIdentifier(valueOf(assignment, 'objectId', 'object_id'))
    if (!objectId) continue
    if (upper(valueOf(assignment, 'accessMode', 'access_mode')) === 'DENY') {
      deniedObjectIds.add(objectId)
    } else if (upper(valueOf(assignment, 'accessMode', 'access_mode')) === 'ALLOW') {
      objectIds.add(objectId)
    }
  }

  for (const objectId of deniedObjectIds) objectIds.delete(objectId)
  return {
    allowedObjectIds: [...objectIds].sort(),
    deniedObjectIds: [...deniedObjectIds].sort(),
  }
}

function resolveProfitabilityAccessProfile({
  requestOrgId,
  authenticatedOrgId,
  authenticatedUid,
  membership,
  binding,
  trustedObjectAssignments = [],
  now = new Date(),
} = {}) {
  const orgId = normalizeIdentifier(requestOrgId, 64)
  const sessionOrgId = normalizeIdentifier(authenticatedOrgId, 64)
  const uid = normalizeIdentifier(authenticatedUid)
  const nowDate = normalizeDate(now)

  if (!orgId || !sessionOrgId || !uid || !nowDate) {
    return deniedDecision('ACCESS_CONTEXT_INVALID', { orgId, uid })
  }
  if (orgId !== sessionOrgId) {
    return deniedDecision('CROSS_ORG_FORBIDDEN', { orgId, uid })
  }

  const membershipOrgId = normalizeIdentifier(valueOf(membership, 'orgId', 'org_id'), 64)
  const membershipUid = normalizeIdentifier(membership?.uid)
  const membershipRole = upper(valueOf(membership, 'roleCode', 'role_code') ?? membership?.role)
  if (
    membershipOrgId !== orgId ||
    membershipUid !== uid ||
    !isActiveAt(membership, nowDate)
  ) {
    return deniedDecision('ACTIVE_MEMBERSHIP_REQUIRED', { orgId, uid, membershipRole })
  }

  const bindingOrgId = normalizeIdentifier(valueOf(binding, 'orgId', 'org_id'), 64)
  const bindingUid = normalizeIdentifier(binding?.uid)
  if (
    bindingOrgId !== orgId ||
    bindingUid !== uid ||
    !isActiveAt(binding, nowDate)
  ) {
    return deniedDecision('ACTIVE_BINDING_REQUIRED', { orgId, uid, membershipRole })
  }

  const financeProfile = normalizeEnum(
    valueOf(binding, 'financeProfile', 'finance_profile'),
    FINANCE_PROFILE_VALUES,
  )
  const operationalProfile = normalizeEnum(
    valueOf(binding, 'operationalProfile', 'operational_profile'),
    OPERATIONAL_PROFILE_VALUES,
  )
  const objectScope = normalizeEnum(
    valueOf(binding, 'objectScope', 'object_scope'),
    OBJECT_SCOPE_VALUES,
  )
  const workerScope = normalizeEnum(
    valueOf(binding, 'workerScope', 'worker_scope'),
    WORKER_SCOPE_VALUES,
  )
  const accessMode = normalizeEnum(
    valueOf(binding, 'accessMode', 'access_mode'),
    ACCESS_MODE_VALUES,
  )

  if (!operationalProfile || !financeProfile || !objectScope || !workerScope || !accessMode) {
    return deniedDecision('ACCESS_BINDING_INVALID', { orgId, uid, membershipRole })
  }
  if (
    operationalProfile === OPERATIONAL_PROFILES.NONE ||
    financeProfile === FINANCE_PROFILES.NONE ||
    objectScope === OBJECT_SCOPES.NONE ||
    workerScope === WORKER_SCOPES.NONE ||
    accessMode === ACCESS_MODES.NONE
  ) {
    return deniedDecision('ACCESS_EXPLICITLY_DISABLED', { orgId, uid, membershipRole })
  }

  const { allowedObjectIds: assignedObjectIds, deniedObjectIds } = activeAssignmentObjectIds({
    assignments: trustedObjectAssignments,
    orgId,
    uid,
    now: nowDate,
  })

  return {
    allowed: true,
    code: 'ACCESS_PROFILE_RESOLVED',
    orgId,
    uid,
    membershipRole: membershipRole || null,
    operationalProfile,
    financeProfile,
    objectScope,
    workerScope,
    accessMode,
    assignedObjectIds,
    deniedObjectIds,
    capabilities: deriveCapabilities({ financeProfile, accessMode, binding }),
  }
}

function evaluateProfitabilityObjectAccess(profileDecision, {
  objectId,
  action = OBJECT_ACTIONS.READ,
} = {}) {
  if (!profileDecision?.allowed) {
    return { allowed: false, code: profileDecision?.code || 'ACCESS_PROFILE_REQUIRED' }
  }

  const normalizedObjectId = normalizeIdentifier(objectId)
  const normalizedAction = normalizeEnum(action, OBJECT_ACTION_VALUES)
  if (!normalizedObjectId || !normalizedAction) {
    return { allowed: false, code: 'OBJECT_ACCESS_INPUT_INVALID' }
  }
  if (
    normalizedAction === OBJECT_ACTIONS.MANAGE &&
    profileDecision.accessMode !== ACCESS_MODES.MANAGE
  ) {
    return { allowed: false, code: 'OBJECT_MANAGE_FORBIDDEN' }
  }

  if (profileDecision.deniedObjectIds?.includes(normalizedObjectId)) {
    return { allowed: false, code: 'OBJECT_NOT_ASSIGNED', objectId: normalizedObjectId }
  }

  if (profileDecision.objectScope === OBJECT_SCOPES.ALL) {
    return { allowed: true, code: 'OBJECT_ACCESS_ALLOWED', objectId: normalizedObjectId }
  }
  if (
    profileDecision.objectScope === OBJECT_SCOPES.ASSIGNED &&
    profileDecision.assignedObjectIds?.includes(normalizedObjectId)
  ) {
    return { allowed: true, code: 'OBJECT_ACCESS_ALLOWED', objectId: normalizedObjectId }
  }

  return { allowed: false, code: 'OBJECT_NOT_ASSIGNED', objectId: normalizedObjectId }
}

function evaluateProfitabilityWriteAccess(profileDecision, {
  objectId,
  writeKind,
} = {}) {
  const normalizedWriteKind = normalizeEnum(writeKind, WRITE_KIND_VALUES)
  if (!normalizedWriteKind) {
    return { allowed: false, code: 'WRITE_KIND_INVALID' }
  }

  const objectAccess = evaluateProfitabilityObjectAccess(profileDecision, {
    objectId,
    action: OBJECT_ACTIONS.MANAGE,
  })
  if (!objectAccess.allowed) return objectAccess

  const capabilityByWriteKind = {
    [WRITE_KINDS.OPERATIONAL_DATA]: 'manageOperations',
    [WRITE_KINDS.OPERATIONAL_COST]: 'editOperationalCosts',
    [WRITE_KINDS.CONTRACT_TERMS]: 'editContractTerms',
    [WRITE_KINDS.PROFITABILITY_TARGET]: 'editProfitabilityTargets',
    [WRITE_KINDS.WORKER_RATE]: 'editWorkerRates',
  }
  const capability = capabilityByWriteKind[normalizedWriteKind]

  if (profileDecision.capabilities?.[capability] !== true) {
    return {
      allowed: false,
      code: 'WRITE_FORBIDDEN',
      objectId: objectAccess.objectId,
      writeKind: normalizedWriteKind,
    }
  }

  return {
    allowed: true,
    code: 'WRITE_ALLOWED',
    objectId: objectAccess.objectId,
    writeKind: normalizedWriteKind,
  }
}

module.exports = {
  ACCESS_MODES,
  FINANCE_PROFILES,
  OPERATIONAL_PROFILES,
  OBJECT_ACTIONS,
  OBJECT_SCOPES,
  WORKER_SCOPES,
  WRITE_KINDS,
  evaluateProfitabilityObjectAccess,
  evaluateProfitabilityWriteAccess,
  resolveProfitabilityAccessProfile,
}
