'use strict'

const crypto = require('node:crypto')
const {
  REQUIRED_ACCESS_PROFILE_COLUMN_RULES,
  REQUIRED_ACCESS_PROFILE_INDEX_RULES,
  REQUIRED_ACCESS_PROFILE_RELATIONS,
} = require('../../profitability/access-profile-repository')
const {
  CATALOG_FINGERPRINT_SCHEMA_VERSION,
  CATALOG_VERIFICATION_SCHEMA_VERSION,
  catalogFingerprintFromSourceRows,
  catalogFingerprintFromTargetRows,
  catalogFingerprintSha256,
  profitabilityActivationLockKey,
  readSourceRows: readCatalogSourceRows,
  readTargetRows: readCatalogTargetRows,
} = require('./profitability-service-object-catalog-seed')

const MANIFEST_SCHEMA_VERSION = 'profitability-access-v2-provisioning/v1'
const ENFORCEMENT_SCHEMA_VERSION = 'v2'
const MIGRATION_RUNNER_ROLE = 'profitability_migration_runner'
const OWNER_ROLE = 'profitability_owner'

const OPERATIONAL_PROFILES = new Set(['OWNER', 'OPERATIONS_ADMIN', 'ADMIN', 'COORDINATOR'])
const OBJECT_SCOPES = new Set(['ALL', 'ASSIGNED'])
const WORKER_SCOPES = new Set(['ALL', 'OBJECT_ASSIGNED'])
const FINANCE_PROFILES = new Set(['OWNER_FULL', 'COST_CONTROL'])
const ACCESS_MODES = new Set(['READ', 'MANAGE'])
const ASSIGNMENT_ROLES = new Set(['COORDINATOR', 'OPERATIONS_ADMIN', 'SUPPORT'])
const ASSIGNMENT_ACCESS_MODES = new Set(['ALLOW', 'DENY'])

const ROOT_KEYS = new Set([
  'schemaVersion', 'orgId', 'authoritative', 'actor', 'profiles', 'activation',
])
const ACTOR_KEYS = new Set(['uid', 'expectedMembershipRole', 'expectedMembershipStatus'])
const ENTRY_KEYS = new Set([
  'uid', 'expectedWorkerId', 'expectedMembershipRole', 'expectedMembershipStatus',
  'profile', 'assignments',
])
const PROFILE_KEYS = new Set([
  'operationalProfile', 'objectScope', 'workerScope', 'financeProfile', 'accessMode',
  'canEditOperationalCosts', 'canEditContractTerms', 'canEditProfitabilityTargets',
  'canViewWorkerRates', 'canEditWorkerRates',
])
const ASSIGNMENT_KEYS = new Set(['objectId', 'assignmentRole', 'accessMode'])
const ACTIVATION_KEYS = new Set(['reason'])

class ProfitabilityAccessProvisioningError extends Error {
  constructor(code, details = {}) {
    super(code)
    this.name = 'ProfitabilityAccessProvisioningError'
    this.code = code
    this.details = details
  }
}

function fail(code, details) {
  throw new ProfitabilityAccessProvisioningError(code, details)
}

function strictObject(value, allowedKeys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code)
  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.has(key))
  if (unknownKeys.length) fail(`${code}_UNKNOWN_FIELD`, { fields: unknownKeys.sort() })
  return value
}

function identifier(value, label, maxLength) {
  if (typeof value !== 'string' || value !== value.trim()) fail(`${label}_INVALID`)
  if (!value || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) {
    fail(`${label}_INVALID`)
  }
  return value
}

function enumValue(value, allowed, label) {
  if (typeof value !== 'string' || value !== value.trim()) fail(`${label}_INVALID`)
  const normalized = value.toUpperCase()
  if (!allowed.has(normalized)) fail(`${label}_INVALID`)
  return normalized
}

function expectedRole(value) {
  const normalized = identifier(value, 'EXPECTED_MEMBERSHIP_ROLE', 32).toUpperCase()
  if (!/^[A-Z][A-Z0-9_]{0,31}$/.test(normalized)) fail('EXPECTED_MEMBERSHIP_ROLE_INVALID')
  return normalized
}

function requiredBoolean(value, label) {
  if (typeof value !== 'boolean') fail(`${label}_INVALID`)
  return value
}

function normalizeActor(rawActor) {
  const actor = strictObject(rawActor, ACTOR_KEYS, 'ACTOR_INVALID')
  const status = identifier(
    actor.expectedMembershipStatus,
    'EXPECTED_MEMBERSHIP_STATUS',
    20,
  ).toUpperCase()
  if (status !== 'ACTIVE') fail('EXPECTED_MEMBERSHIP_STATUS_MUST_BE_ACTIVE')
  return {
    uid: identifier(actor.uid, 'ACTOR_UID', 128),
    expectedMembershipRole: expectedRole(actor.expectedMembershipRole),
    expectedMembershipStatus: status,
  }
}

function normalizeProfile(rawProfile) {
  const profile = strictObject(rawProfile, PROFILE_KEYS, 'PROFILE_INVALID')
  const normalized = {
    operationalProfile: enumValue(
      profile.operationalProfile,
      OPERATIONAL_PROFILES,
      'OPERATIONAL_PROFILE',
    ),
    objectScope: enumValue(profile.objectScope, OBJECT_SCOPES, 'OBJECT_SCOPE'),
    workerScope: enumValue(profile.workerScope, WORKER_SCOPES, 'WORKER_SCOPE'),
    financeProfile: enumValue(profile.financeProfile, FINANCE_PROFILES, 'FINANCE_PROFILE'),
    accessMode: enumValue(profile.accessMode, ACCESS_MODES, 'ACCESS_MODE'),
    canEditOperationalCosts: requiredBoolean(
      profile.canEditOperationalCosts,
      'CAN_EDIT_OPERATIONAL_COSTS',
    ),
    canEditContractTerms: requiredBoolean(
      profile.canEditContractTerms,
      'CAN_EDIT_CONTRACT_TERMS',
    ),
    canEditProfitabilityTargets: requiredBoolean(
      profile.canEditProfitabilityTargets,
      'CAN_EDIT_PROFITABILITY_TARGETS',
    ),
    canViewWorkerRates: requiredBoolean(profile.canViewWorkerRates, 'CAN_VIEW_WORKER_RATES'),
    canEditWorkerRates: requiredBoolean(profile.canEditWorkerRates, 'CAN_EDIT_WORKER_RATES'),
  }

  if (normalized.accessMode !== 'MANAGE' && (
    normalized.canEditOperationalCosts ||
    normalized.canEditContractTerms ||
    normalized.canEditProfitabilityTargets ||
    normalized.canEditWorkerRates
  )) fail('READ_PROFILE_CANNOT_EDIT')

  if (normalized.financeProfile === 'COST_CONTROL' && (
    normalized.canEditContractTerms ||
    normalized.canEditProfitabilityTargets ||
    normalized.canViewWorkerRates ||
    normalized.canEditWorkerRates
  )) fail('COST_CONTROL_CAPABILITY_EXCESS')

  if (normalized.canEditWorkerRates && !normalized.canViewWorkerRates) {
    fail('WORKER_RATE_EDIT_REQUIRES_VIEW')
  }

  return normalized
}

function normalizeAssignment(rawAssignment) {
  const assignment = strictObject(rawAssignment, ASSIGNMENT_KEYS, 'ASSIGNMENT_INVALID')
  return {
    objectId: identifier(assignment.objectId, 'OBJECT_ID', 64),
    assignmentRole: enumValue(
      assignment.assignmentRole,
      ASSIGNMENT_ROLES,
      'ASSIGNMENT_ROLE',
    ),
    accessMode: enumValue(
      assignment.accessMode,
      ASSIGNMENT_ACCESS_MODES,
      'ASSIGNMENT_ACCESS_MODE',
    ),
  }
}

function assignmentKey(value) {
  return `${value.uid}\u0000${value.objectId}\u0000${value.assignmentRole}`
}

function normalizeEntry(rawEntry) {
  const entry = strictObject(rawEntry, ENTRY_KEYS, 'PROFILE_ENTRY_INVALID')
  if (!Array.isArray(entry.assignments)) fail('ASSIGNMENTS_INVALID')
  const assignments = entry.assignments.map(normalizeAssignment)
    .sort((left, right) => (
      left.objectId.localeCompare(right.objectId) ||
      left.assignmentRole.localeCompare(right.assignmentRole) ||
      left.accessMode.localeCompare(right.accessMode)
    ))
  const seenAssignments = new Set()
  for (const assignment of assignments) {
    const key = `${assignment.objectId}\u0000${assignment.assignmentRole}`
    if (seenAssignments.has(key)) fail('ASSIGNMENT_DUPLICATE')
    seenAssignments.add(key)
  }

  const status = identifier(
    entry.expectedMembershipStatus,
    'EXPECTED_MEMBERSHIP_STATUS',
    20,
  ).toUpperCase()
  if (status !== 'ACTIVE') fail('EXPECTED_MEMBERSHIP_STATUS_MUST_BE_ACTIVE')

  const normalized = {
    uid: identifier(entry.uid, 'PROFILE_UID', 128),
    ...(entry.expectedWorkerId === undefined ? {} : {
      expectedWorkerId: identifier(entry.expectedWorkerId, 'EXPECTED_WORKER_ID', 64),
    }),
    expectedMembershipRole: expectedRole(entry.expectedMembershipRole),
    expectedMembershipStatus: status,
    profile: normalizeProfile(entry.profile),
    assignments,
  }
  if (
    normalized.profile.objectScope === 'ASSIGNED' &&
    !assignments.some((assignment) => assignment.accessMode === 'ALLOW')
  ) fail('ASSIGNED_SCOPE_REQUIRES_ALLOW_ASSIGNMENT')
  return normalized
}

function normalizeCatalogVerification(rawVerification, expectedOrgId) {
  const verification = strictObject(
    rawVerification,
    new Set([
      'schemaVersion', 'fingerprintSchemaVersion', 'orgId', 'fingerprintSha256',
      'exact', 'counts',
    ]),
    'CATALOG_VERIFICATION_INVALID',
  )
  const counts = strictObject(
    verification.counts,
    new Set(['activeSourceClients', 'serviceObjects']),
    'CATALOG_VERIFICATION_COUNTS_INVALID',
  )
  if (verification.schemaVersion !== CATALOG_VERIFICATION_SCHEMA_VERSION) {
    fail('CATALOG_VERIFICATION_SCHEMA_VERSION_INVALID')
  }
  if (verification.fingerprintSchemaVersion !== CATALOG_FINGERPRINT_SCHEMA_VERSION) {
    fail('CATALOG_FINGERPRINT_SCHEMA_VERSION_INVALID')
  }
  if (verification.orgId !== expectedOrgId) fail('CATALOG_VERIFICATION_ORG_MISMATCH')
  if (verification.exact !== true) fail('CATALOG_VERIFICATION_NOT_EXACT')
  if (!/^[a-f0-9]{64}$/.test(String(verification.fingerprintSha256 || ''))) {
    fail('CATALOG_VERIFICATION_SHA256_INVALID')
  }
  const activeSourceClients = Number(counts.activeSourceClients)
  const serviceObjects = Number(counts.serviceObjects)
  if (!Number.isSafeInteger(activeSourceClients) || activeSourceClients < 1 ||
      !Number.isSafeInteger(serviceObjects) || serviceObjects < 1 ||
      activeSourceClients !== serviceObjects) {
    fail('CATALOG_VERIFICATION_COUNTS_INVALID')
  }
  return Object.freeze({
    schemaVersion: CATALOG_VERIFICATION_SCHEMA_VERSION,
    fingerprintSchemaVersion: CATALOG_FINGERPRINT_SCHEMA_VERSION,
    orgId: expectedOrgId,
    fingerprintSha256: verification.fingerprintSha256,
    exact: true,
    counts: Object.freeze({ activeSourceClients, serviceObjects }),
  })
}

function normalizeManifest(rawManifest) {
  const manifest = strictObject(rawManifest, ROOT_KEYS, 'MANIFEST_INVALID')
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) fail('MANIFEST_SCHEMA_VERSION_INVALID')
  if (!Array.isArray(manifest.profiles) || manifest.profiles.length === 0) {
    fail('MANIFEST_PROFILES_REQUIRED')
  }
  const activation = strictObject(manifest.activation, ACTIVATION_KEYS, 'ACTIVATION_INVALID')
  const reason = identifier(activation.reason, 'ACTIVATION_REASON', 300)
  const actor = normalizeActor(manifest.actor)
  const profiles = manifest.profiles.map(normalizeEntry)
    .sort((left, right) => left.uid.localeCompare(right.uid))
  const seenUids = new Set()
  for (const entry of profiles) {
    if (seenUids.has(entry.uid)) fail('PROFILE_UID_DUPLICATE')
    seenUids.add(entry.uid)
  }
  const actorEntry = profiles.find((entry) => entry.uid === actor.uid)
  if (
    !actorEntry ||
    actorEntry.expectedMembershipRole !== actor.expectedMembershipRole ||
    actorEntry.expectedMembershipStatus !== actor.expectedMembershipStatus
  ) fail('ACTOR_PROFILE_ENTRY_REQUIRED')

  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    orgId: identifier(manifest.orgId, 'ORG_ID', 64),
    authoritative: requiredBoolean(manifest.authoritative, 'AUTHORITATIVE'),
    actor,
    profiles,
    activation: { reason },
  }
}

function canonicalStringify(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalStringify(value[key])}`
    )).join(',')}}`
  }
  return JSON.stringify(value)
}

function manifestSha256(normalizedManifest) {
  return crypto.createHash('sha256')
    .update(canonicalStringify(normalizedManifest), 'utf8')
    .digest('hex')
}

function markerReason(manifest, hash, catalogVerification) {
  const catalogHash = catalogVerification?.fingerprintSha256 || 'UNVERIFIED'
  return `${manifest.activation.reason} | manifest_sha256=${hash}` +
    ` | catalog_fingerprint_sha256=${catalogHash}`
}

function rowText(row, camel, snake = camel) {
  return String(row?.[camel] ?? row?.[snake] ?? '').trim()
}

function rowBoolean(row, camel, snake) {
  return (row?.[camel] ?? row?.[snake]) === true
}

function profileFromRow(row) {
  return {
    operationalProfile: rowText(row, 'operationalProfile', 'operational_profile').toUpperCase(),
    objectScope: rowText(row, 'objectScope', 'object_scope').toUpperCase(),
    workerScope: rowText(row, 'workerScope', 'worker_scope').toUpperCase(),
    financeProfile: rowText(row, 'financeProfile', 'finance_profile').toUpperCase(),
    accessMode: rowText(row, 'accessMode', 'access_mode').toUpperCase(),
    canEditOperationalCosts: rowBoolean(row, 'canEditOperationalCosts', 'can_edit_operational_costs'),
    canEditContractTerms: rowBoolean(row, 'canEditContractTerms', 'can_edit_contract_terms'),
    canEditProfitabilityTargets: rowBoolean(row, 'canEditProfitabilityTargets', 'can_edit_profitability_targets'),
    canViewWorkerRates: rowBoolean(row, 'canViewWorkerRates', 'can_view_worker_rates'),
    canEditWorkerRates: rowBoolean(row, 'canEditWorkerRates', 'can_edit_worker_rates'),
  }
}

function profilesEqual(left, right) {
  return canonicalStringify(left) === canonicalStringify(right)
}

function isCurrentlyValid(row, snapshotAt) {
  if (row?.revoked_at ?? row?.revokedAt) return false
  const validFrom = new Date(row?.valid_from ?? row?.validFrom)
  const validToValue = row?.valid_to ?? row?.validTo
  const validTo = validToValue ? new Date(validToValue) : null
  if (!Number.isFinite(validFrom.getTime()) || validFrom.getTime() > snapshotAt.getTime()) return false
  if (validTo && (!Number.isFinite(validTo.getTime()) || validTo.getTime() <= snapshotAt.getTime())) return false
  return true
}

function buildProvisioningPlan(manifest, state) {
  const snapshotAt = new Date(state.snapshotAt)
  if (!Number.isFinite(snapshotAt.getTime())) fail('DATABASE_SNAPSHOT_TIME_INVALID')
  if (state.organizationCount !== 1) fail('ORGANIZATION_NOT_FOUND')

  const expectedByUid = new Map(manifest.profiles.map((entry) => [entry.uid, entry]))
  const membershipByUid = new Map()
  for (const row of state.memberships || []) {
    const uid = rowText(row, 'uid')
    if (membershipByUid.has(uid)) fail('MEMBERSHIP_AMBIGUOUS')
    membershipByUid.set(uid, row)
  }
  for (const entry of manifest.profiles) {
    const membership = membershipByUid.get(entry.uid)
    if (!membership) fail('MEMBERSHIP_MISSING')
    if (
      rowText(membership, 'role').toUpperCase() !== entry.expectedMembershipRole ||
      rowText(membership, 'status').toUpperCase() !== entry.expectedMembershipStatus
    ) fail('MEMBERSHIP_STATE_MISMATCH')
    if (entry.expectedWorkerId !== undefined &&
        rowText(membership, 'workerId', 'worker_id') !== entry.expectedWorkerId) {
      fail('MEMBERSHIP_WORKER_ID_MISMATCH')
    }
  }

  const requiredObjectIds = new Set()
  for (const entry of manifest.profiles) {
    for (const assignment of entry.assignments) requiredObjectIds.add(assignment.objectId)
  }
  const objectById = new Map((state.objects || []).map((row) => [rowText(row, 'objectId', 'object_id'), row]))
  for (const objectId of requiredObjectIds) {
    const object = objectById.get(objectId)
    if (!object) fail('SERVICE_OBJECT_MISSING')
    const archivedAt = Object.prototype.hasOwnProperty.call(object, 'archived_at')
      ? object.archived_at
      : object.archivedAt
    if (
      rowText(object, 'status').toUpperCase() !== 'ACTIVE' ||
      archivedAt !== null
    ) fail('SERVICE_OBJECT_INACTIVE')
  }

  const activeProfilesByUid = new Map()
  for (const row of state.profiles || []) {
    const uid = rowText(row, 'uid')
    const rows = activeProfilesByUid.get(uid) || []
    rows.push(row)
    activeProfilesByUid.set(uid, rows)
  }

  const profileActions = []
  for (const entry of manifest.profiles) {
    const currentRows = activeProfilesByUid.get(entry.uid) || []
    if (currentRows.length > 1) fail('ACTIVE_PROFILE_AMBIGUOUS')
    if (currentRows.length === 0) {
      profileActions.push({ type: 'INSERT', uid: entry.uid, desired: entry.profile })
    } else if (
      isCurrentlyValid(currentRows[0], snapshotAt) &&
      profilesEqual(profileFromRow(currentRows[0]), entry.profile)
    ) {
      profileActions.push({ type: 'NOOP', uid: entry.uid, current: currentRows[0] })
    } else {
      profileActions.push({
        type: 'REPLACE',
        uid: entry.uid,
        current: currentRows[0],
        desired: entry.profile,
      })
    }
  }

  const unexpectedProfiles = []
  if (manifest.authoritative) {
    for (const [uid, rows] of activeProfilesByUid.entries()) {
      if (!expectedByUid.has(uid)) unexpectedProfiles.push(...rows)
    }
  }

  const desiredAssignments = new Map()
  for (const entry of manifest.profiles) {
    for (const assignment of entry.assignments) {
      const desired = { uid: entry.uid, ...assignment }
      desiredAssignments.set(assignmentKey(desired), desired)
    }
  }

  const currentAssignments = new Map()
  const unexpectedAssignments = []
  for (const row of state.assignments || []) {
    const current = {
      uid: rowText(row, 'uid'),
      objectId: rowText(row, 'objectId', 'object_id'),
      assignmentRole: rowText(row, 'assignmentRole', 'assignment_role').toUpperCase(),
      accessMode: rowText(row, 'accessMode', 'access_mode').toUpperCase(),
      row,
    }
    const key = assignmentKey(current)
    if (currentAssignments.has(key)) fail('ACTIVE_ASSIGNMENT_AMBIGUOUS')
    currentAssignments.set(key, current)
    if (manifest.authoritative && !expectedByUid.has(current.uid)) unexpectedAssignments.push(row)
  }

  const assignmentActions = []
  for (const [key, desired] of desiredAssignments.entries()) {
    const current = currentAssignments.get(key)
    if (!current) assignmentActions.push({ type: 'INSERT', ...desired })
    else if (isCurrentlyValid(current.row, snapshotAt) && current.accessMode === desired.accessMode) {
      assignmentActions.push({ type: 'NOOP', ...desired, current: current.row })
    } else {
      assignmentActions.push({ type: 'REPLACE', ...desired, current: current.row })
    }
  }
  for (const [key, current] of currentAssignments.entries()) {
    if (expectedByUid.has(current.uid) && !desiredAssignments.has(key)) {
      assignmentActions.push({ type: 'REVOKE', ...current })
    }
  }
  assignmentActions.sort((left, right) => (
    left.uid.localeCompare(right.uid) ||
    left.objectId.localeCompare(right.objectId) ||
    left.assignmentRole.localeCompare(right.assignmentRole) ||
    left.type.localeCompare(right.type)
  ))

  return {
    profileActions,
    assignmentActions,
    unexpectedProfiles,
    unexpectedAssignments,
    exact: profileActions.every((action) => action.type === 'NOOP') &&
      assignmentActions.every((action) => action.type === 'NOOP') &&
      unexpectedProfiles.length === 0 && unexpectedAssignments.length === 0,
  }
}

const ACCESS_PROFILE_COLUMN_RULES = Object.freeze({
  ...REQUIRED_ACCESS_PROFILE_COLUMN_RULES,
  'organization_access_profile.created_at': ['timestamp with time zone', 'NO', null, 'now()'],
  'organization_access_profile.created_by_uid': ['character varying', 'NO', 128],
  'organization_access_profile.updated_at': ['timestamp with time zone', 'NO', null, 'now()'],
  'organization_access_profile.updated_by_uid': ['character varying', 'NO', 128],
  'organization_access_profile.revoked_by_uid': ['character varying', 'YES', 128],
  'organization_access_profile.revocation_reason': ['text', 'YES', null],
  'service_object_assignment.created_at': ['timestamp with time zone', 'NO', null, 'now()'],
  'service_object_assignment.created_by_uid': ['character varying', 'NO', 128],
  'service_object_assignment.updated_at': ['timestamp with time zone', 'NO', null, 'now()'],
  'service_object_assignment.updated_by_uid': ['character varying', 'NO', 128],
  'service_object_assignment.revoked_by_uid': ['character varying', 'YES', 128],
  'service_object_assignment.revocation_reason': ['text', 'YES', null],
  'profitability_target_history.change_reason': ['text', 'YES', null],
  'profitability_target_history.created_at': ['timestamp with time zone', 'NO', null, 'now()'],
  'profitability_target_history.created_by_uid': ['character varying', 'NO', 128],
  'profitability_target_history.revoked_by_uid': ['character varying', 'YES', 128],
  'profitability_target_history.revocation_reason': ['text', 'YES', null],
})

const ACCESS_PROFILE_CONSTRAINT_RULES = Object.freeze({
  'profitability_access_enforcement.profitability_access_enforcement_pkey':
    ['p', 'primary key (org_id)'],
  'profitability_access_enforcement.profitability_access_enforcement_org_fk':
    ['f', 'foreign key (org_id) references organizations(org_id)'],
  'profitability_access_enforcement.profitability_access_enforcement_version_check':
    ['c', "check (schema_version::text = 'v2'::text)"],
  'profitability_access_enforcement.profitability_access_enforcement_reason_check':
    ['c', "check (nullif(btrim(reason), ''::text) is not null)"],
  'organization_access_profile.organization_access_profile_pkey':
    ['p', 'primary key (org_id, profile_id)'],
  'organization_access_profile.organization_access_profile_member_fk':
    ['f', 'foreign key (org_id, uid) references organization_member(org_id, uid)'],
  'organization_access_profile.organization_access_profile_operational_check':
    ['c', "check (operational_profile::text = any (array['NONE'::character varying, 'OWNER'::character varying, 'OPERATIONS_ADMIN'::character varying, 'ADMIN'::character varying, 'COORDINATOR'::character varying]::text[]))"],
  'organization_access_profile.organization_access_profile_object_scope_check':
    ['c', "check (object_scope::text = any (array['NONE'::character varying, 'ASSIGNED'::character varying, 'ALL'::character varying]::text[]))"],
  'organization_access_profile.organization_access_profile_worker_scope_check':
    ['c', "check (worker_scope::text = any (array['NONE'::character varying, 'OBJECT_ASSIGNED'::character varying, 'ALL'::character varying]::text[]))"],
  'organization_access_profile.organization_access_profile_finance_check':
    ['c', "check (finance_profile::text = any (array['NONE'::character varying, 'COST_CONTROL'::character varying, 'OWNER_FULL'::character varying]::text[]))"],
  'organization_access_profile.organization_access_profile_access_mode_check':
    ['c', "check (access_mode::text = any (array['NONE'::character varying, 'READ'::character varying, 'MANAGE'::character varying]::text[]))"],
  'organization_access_profile.organization_access_profile_validity_check':
    ['c', 'check (valid_to is null or valid_to > valid_from)'],
  'organization_access_profile.organization_access_profile_revocation_check':
    ['c', "check (revoked_at is null and revoked_by_uid is null and revocation_reason is null or revoked_at is not null and revoked_at >= valid_from and revoked_by_uid is not null and nullif(btrim(revocation_reason), ''::text) is not null)"],
  'organization_access_profile.organization_access_profile_none_is_empty_check':
    ['c', "check (access_mode::text <> 'NONE'::text or operational_profile::text = 'NONE'::text and object_scope::text = 'NONE'::text and worker_scope::text = 'NONE'::text and finance_profile::text = 'NONE'::text and can_edit_operational_costs is false and can_edit_contract_terms is false and can_edit_profitability_targets is false and can_view_worker_rates is false and can_edit_worker_rates is false)"],
  'organization_access_profile.organization_access_profile_finance_capabilities_check':
    ['c', "check (finance_profile::text = 'NONE'::text and can_edit_operational_costs is false and can_edit_contract_terms is false and can_edit_profitability_targets is false and can_view_worker_rates is false and can_edit_worker_rates is false or finance_profile::text = 'COST_CONTROL'::text and can_edit_contract_terms is false and can_edit_profitability_targets is false and can_view_worker_rates is false and can_edit_worker_rates is false or finance_profile::text = 'OWNER_FULL'::text)"],
  'organization_access_profile.organization_access_profile_worker_rate_edit_check':
    ['c', 'check (can_edit_worker_rates is false or can_view_worker_rates is true)'],
  'service_object_assignment.service_object_assignment_pkey':
    ['p', 'primary key (org_id, assignment_id)'],
  'service_object_assignment.service_object_assignment_object_fk':
    ['f', 'foreign key (org_id, object_id) references service_object(org_id, object_id)'],
  'service_object_assignment.service_object_assignment_member_fk':
    ['f', 'foreign key (org_id, uid) references organization_member(org_id, uid)'],
  'service_object_assignment.service_object_assignment_role_check':
    ['c', "check (assignment_role::text = any (array['COORDINATOR'::character varying, 'OPERATIONS_ADMIN'::character varying, 'SUPPORT'::character varying]::text[]))"],
  'service_object_assignment.service_object_assignment_access_mode_check':
    ['c', "check (access_mode::text = any (array['ALLOW'::character varying, 'DENY'::character varying]::text[]))"],
  'service_object_assignment.service_object_assignment_validity_check':
    ['c', 'check (valid_to is null or valid_to > valid_from)'],
  'service_object_assignment.service_object_assignment_revocation_check':
    ['c', "check (revoked_at is null and revoked_by_uid is null and revocation_reason is null or revoked_at is not null and revoked_at >= valid_from and revoked_by_uid is not null and nullif(btrim(revocation_reason), ''::text) is not null)"],
  'profitability_target_history.profitability_target_history_pkey':
    ['p', 'primary key (org_id, object_id, target_id)'],
  'profitability_target_history.profitability_target_history_object_fk':
    ['f', 'foreign key (org_id, object_id) references service_object(org_id, object_id)'],
  'profitability_target_history.profitability_target_history_values_check':
    ['c', 'check (minimum_result_minor is not null or minimum_margin_bps is not null)'],
  'profitability_target_history.profitability_target_history_result_check':
    ['c', 'check (minimum_result_minor is null or minimum_result_minor >= 0)'],
  'profitability_target_history.profitability_target_history_margin_check':
    ['c', "check (minimum_margin_bps is null or minimum_margin_bps >= '-100000'::integer and minimum_margin_bps <= 10000)"],
  'profitability_target_history.profitability_target_history_currency_check':
    ['c', "check (minimum_result_minor is null and currency is null or minimum_result_minor is not null and currency ~ '^[A-Z]{3}$'::text)"],
  'profitability_target_history.profitability_target_history_policy_check':
    ['c', "check (target_policy::text = 'ALL_DEFINED'::text)"],
  'profitability_target_history.profitability_target_history_validity_check':
    ['c', 'check (effective_to is null or effective_to > effective_from)'],
  'profitability_target_history.profitability_target_history_revocation_check':
    ['c', "check (revoked_at is null and revoked_by_uid is null and revocation_reason is null or revoked_at is not null and revoked_by_uid is not null and nullif(btrim(revocation_reason), ''::text) is not null)"],
  'profitability_target_history.profitability_target_history_no_overlap':
    ['x', "exclude using gist (org_id with =, object_id with =, daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[)'::text) with &&) where (revoked_at is null)"],
})

const ACCESS_PROFILE_EXPECTED_COUNTS = Object.freeze({
  profitability_access_enforcement: Object.freeze({ columns: 5, constraints: 4, indexes: 1 }),
  organization_access_profile: Object.freeze({ columns: 22, constraints: 12, indexes: 3 }),
  service_object_assignment: Object.freeze({ columns: 15, constraints: 7, indexes: 4 }),
  profitability_target_history: Object.freeze({ columns: 15, constraints: 10, indexes: 3 }),
})

function normalizedDefinition(value) {
  return String(value ?? '').trim().toLowerCase()
    .replace(/"/g, '')
    .replace(/public\./g, '')
    .replace(/::(?:character varying|text|name|date|integer|bigint|boolean|timestamp with time zone)/g, '')
    .replace(/[()]/g, '')
    .replace(/\s+/g, '')
}

async function defaultSchemaCheck(client) {
  const tableNames = Object.keys(ACCESS_PROFILE_EXPECTED_COUNTS)
  const relations = await client.query(
    `/* profitability-access-v2:provisioning-schema-relations */
     select relation.relname as table_name,
            pg_get_userbyid(relation.relowner) as table_owner,
            relation.relpersistence, relation.relrowsecurity, relation.relforcerowsecurity
       from pg_class relation
       join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relkind = 'r'
        and relation.relname = any($1::text[])
      order by relation.relname`,
    [tableNames],
  )
  if (relations.rows.length !== tableNames.length || relations.rows.some((row) => (
    row.table_owner !== OWNER_ROLE || row.relpersistence !== 'p' ||
    row.relrowsecurity !== false || row.relforcerowsecurity !== false
  ))) fail('ACCESS_PROFILE_SCHEMA_OWNER_FINGERPRINT_MISMATCH')

  const columns = await client.query(
    `/* profitability-access-v2:provisioning-schema-columns */
     select table_name, column_name, data_type, is_nullable,
            character_maximum_length, column_default
       from information_schema.columns
      where table_schema = 'public' and table_name = any($1::text[])
      order by table_name, ordinal_position`,
    [tableNames],
  )
  const columnsByKey = new Map(columns.rows.map((row) => (
    [`${row.table_name}.${row.column_name}`, row]
  )))
  for (const [tableName, expected] of Object.entries(ACCESS_PROFILE_EXPECTED_COUNTS)) {
    if (columns.rows.filter((row) => row.table_name === tableName).length !== expected.columns) {
      fail('ACCESS_PROFILE_SCHEMA_COLUMN_SET_FINGERPRINT_MISMATCH', { table: tableName })
    }
  }
  for (const [key, rule] of Object.entries(ACCESS_PROFILE_COLUMN_RULES)) {
    const actual = columnsByKey.get(key)
    const [dataType, nullable, maximumLength, defaultToken] = rule
    if (!actual || String(actual.data_type).toLowerCase() !== dataType ||
        String(actual.is_nullable).toUpperCase() !== nullable ||
        (maximumLength !== null && Number(actual.character_maximum_length) !== maximumLength) ||
        (defaultToken !== undefined &&
          !normalizedDefinition(actual.column_default).includes(normalizedDefinition(defaultToken)))) {
      fail('ACCESS_PROFILE_SCHEMA_COLUMN_FINGERPRINT_MISMATCH', { column: key })
    }
  }

  const constraints = await client.query(
    `/* profitability-access-v2:provisioning-schema-constraints */
     select relation.relname as table_name, constraint_row.conname as constraint_name,
            constraint_row.contype as constraint_type, constraint_row.convalidated as validated,
            pg_get_constraintdef(constraint_row.oid, true) as definition
       from pg_constraint constraint_row
       join pg_class relation on relation.oid = constraint_row.conrelid
       join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public' and relation.relname = any($1::text[])
      order by relation.relname, constraint_row.conname`,
    [tableNames],
  )
  const constraintsByKey = new Map(constraints.rows.map((row) => (
    [`${row.table_name}.${row.constraint_name}`, row]
  )))
  for (const [tableName, expected] of Object.entries(ACCESS_PROFILE_EXPECTED_COUNTS)) {
    if (constraints.rows.filter((row) => row.table_name === tableName).length !== expected.constraints) {
      fail('ACCESS_PROFILE_SCHEMA_CONSTRAINT_SET_FINGERPRINT_MISMATCH', { table: tableName })
    }
  }
  for (const [key, rule] of Object.entries(ACCESS_PROFILE_CONSTRAINT_RULES)) {
    const actual = constraintsByKey.get(key)
    if (!actual || actual.validated !== true || actual.constraint_type !== rule[0] ||
        normalizedDefinition(actual.definition) !== normalizedDefinition(rule[1])) {
      fail('ACCESS_PROFILE_SCHEMA_CONSTRAINT_FINGERPRINT_MISMATCH', { constraint: key })
    }
  }

  const indexes = await client.query(
    `/* profitability-access-v2:provisioning-schema-indexes */
     select relation.relname as table_name, index_row.relname as index_name,
            pg_get_userbyid(index_row.relowner) as index_owner,
            index_meta.indisunique as is_unique, index_meta.indisvalid as is_valid,
            index_meta.indisready as is_ready,
            pg_get_indexdef(index_meta.indexrelid, 0, true) as definition
       from pg_index index_meta
       join pg_class index_row on index_row.oid = index_meta.indexrelid
       join pg_class relation on relation.oid = index_meta.indrelid
       join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public' and relation.relname = any($1::text[])
      order by relation.relname, index_row.relname`,
    [tableNames],
  )
  for (const [tableName, expected] of Object.entries(ACCESS_PROFILE_EXPECTED_COUNTS)) {
    const tableIndexes = indexes.rows.filter((row) => row.table_name === tableName)
    if (tableIndexes.length !== expected.indexes || tableIndexes.some((row) => (
      row.index_owner !== OWNER_ROLE || row.is_valid !== true || row.is_ready !== true
    ))) fail('ACCESS_PROFILE_SCHEMA_INDEX_SET_FINGERPRINT_MISMATCH', { table: tableName })
  }
  const indexesByName = new Map(indexes.rows.map((row) => [row.index_name, row]))
  for (const [name, rule] of Object.entries(REQUIRED_ACCESS_PROFILE_INDEX_RULES)) {
    const actual = indexesByName.get(name)
    if (!actual || actual.table_name !== rule[0] || actual.is_unique !== rule[1] ||
        normalizedDefinition(actual.definition) !== normalizedDefinition(rule[2])) {
      fail('ACCESS_PROFILE_SCHEMA_INDEX_FINGERPRINT_MISMATCH', { index: name })
    }
  }

  const privilegeResult = await client.query(
    `select
       has_table_privilege(current_user, 'public.organization_access_profile', 'SELECT')
         as profiles_select,
       has_table_privilege(current_user, 'public.organization_access_profile', 'INSERT')
         as profiles_insert,
       has_table_privilege(current_user, 'public.organization_access_profile', 'UPDATE')
         as profiles_update,
       has_table_privilege(current_user, 'public.service_object_assignment', 'SELECT')
         as assignments_select,
       has_table_privilege(current_user, 'public.service_object_assignment', 'INSERT')
         as assignments_insert,
       has_table_privilege(current_user, 'public.service_object_assignment', 'UPDATE')
         as assignments_update,
       has_table_privilege(current_user, 'public.profitability_access_enforcement', 'SELECT')
         as marker_select,
       has_table_privilege(current_user, 'public.profitability_access_enforcement', 'INSERT')
         as marker_insert,
       has_table_privilege(current_user, 'public.profitability_access_enforcement', 'UPDATE')
         as marker_update`,
  )
  const privileges = privilegeResult.rows[0] || {}
  if (!Object.values(privileges).every((value) => value === true)) {
    fail('PROVISIONING_ROLE_PRIVILEGES_NOT_READY')
  }
}

async function readAuthorizationState(sourceClient, targetClient, manifest) {
  const uids = manifest.profiles.map((entry) => entry.uid)
  const objectIds = [...new Set(manifest.profiles.flatMap((entry) => (
    entry.assignments.map((assignment) => assignment.objectId)
  )))].sort()
  const [snapshot, organization, memberships, objects, activeObjects] = await Promise.all([
    sourceClient.query(
      '/* profitability-access-v2:source-snapshot */ select transaction_timestamp() as snapshot_at',
    ),
    sourceClient.query(
      `/* profitability-access-v2:source-organization */
       select org_id from public.organizations where org_id = $1`,
      [manifest.orgId],
    ),
    sourceClient.query(
      `/* profitability-access-v2:source-memberships */
       select org_id, uid, worker_id, role, status
         from public.organization_member
        where org_id = $1 and uid = any($2::text[])
        order by uid`,
      [manifest.orgId, uids],
    ),
    objectIds.length
      ? targetClient.query(
        `/* profitability-access-v2:authorization-objects */
         select org_id, object_id, status, archived_at
           from public.service_object
          where org_id = $1 and object_id = any($2::text[])
          order by object_id`,
        [manifest.orgId, objectIds],
      )
      : Promise.resolve({ rows: [] }),
    targetClient.query(
      `/* profitability-access-v2:authorization-active-objects */
       select object_id
         from public.service_object
        where org_id = $1 and status = 'ACTIVE' and archived_at is null
        order by object_id`,
      [manifest.orgId],
    ),
  ])
  return {
    snapshotAt: snapshot.rows[0]?.snapshot_at,
    organizationCount: organization.rows.length,
    memberships: memberships.rows,
    objects: objects.rows,
    activeObjects: activeObjects.rows,
    activeObjectCount: activeObjects.rows.length,
  }
}

async function readCatalogFingerprintState(sourceClient, targetClient, orgId) {
  if (!sourceClient?.query || !targetClient?.query || sourceClient === targetClient) {
    fail('DISTINCT_CATALOG_CLIENTS_REQUIRED')
  }
  const sourceRows = await readCatalogSourceRows(sourceClient, orgId)
  const targetRows = await readCatalogTargetRows(targetClient, orgId)
  const sourceFingerprint = catalogFingerprintFromSourceRows(orgId, sourceRows)
  const targetFingerprint = catalogFingerprintFromTargetRows(orgId, targetRows)
  return Object.freeze({
    sourceFingerprintSha256: catalogFingerprintSha256(sourceFingerprint),
    targetFingerprintSha256: catalogFingerprintSha256(targetFingerprint),
    counts: Object.freeze({
      activeSourceClients: sourceFingerprint.objects.length,
      serviceObjects: targetFingerprint.objects.length,
    }),
  })
}

function assertCatalogVerificationMatchesState(catalogVerification, state) {
  if (!catalogVerification || !state) fail('CATALOG_FINGERPRINT_STATE_REQUIRED')
  const expected = catalogVerification.fingerprintSha256
  if (state.sourceFingerprintSha256 !== expected ||
      state.targetFingerprintSha256 !== expected ||
      state.sourceFingerprintSha256 !== state.targetFingerprintSha256) {
    fail('CATALOG_FINGERPRINT_MISMATCH')
  }
  if (state.counts?.activeSourceClients !==
        catalogVerification.counts.activeSourceClients ||
      state.counts?.serviceObjects !== catalogVerification.counts.serviceObjects) {
    fail('CATALOG_VERIFICATION_COUNTS_CHANGED')
  }
  return true
}

function sourceStateSha256(state) {
  return crypto.createHash('sha256').update(canonicalStringify({
    organizationCount: state.organizationCount,
    memberships: (state.memberships || []).map((row) => ({
      orgId: rowText(row, 'orgId', 'org_id'),
      uid: rowText(row, 'uid'),
      workerId: rowText(row, 'workerId', 'worker_id'),
      role: rowText(row, 'role'),
      status: rowText(row, 'status'),
    })),
    objects: (state.objects || []).map((row) => ({
      orgId: rowText(row, 'orgId', 'org_id'),
      objectId: rowText(row, 'objectId', 'object_id'),
      status: rowText(row, 'status'),
      archivedAt: row?.archived_at ?? row?.archivedAt ?? null,
    })),
    activeObjectIds: (state.activeObjects || []).map((row) => (
      rowText(row, 'objectId', 'object_id')
    )),
  }), 'utf8').digest('hex')
}

async function readTargetState(client, manifest, sourceState) {
  const uids = manifest.profiles.map((entry) => entry.uid)
  const profileScope = manifest.authoritative ? '' : 'and uid = any($2::text[])'
  const profileParameters = manifest.authoritative ? [manifest.orgId] : [manifest.orgId, uids]
  const assignmentScope = manifest.authoritative ? '' : 'and uid = any($2::text[])'
  const assignmentParameters = manifest.authoritative ? [manifest.orgId] : [manifest.orgId, uids]

  const [profiles, assignments, marker] = await Promise.all([
    client.query(
      `/* profitability-access-v2:profiles */
       select * from public.organization_access_profile
        where org_id = $1 and revoked_at is null ${profileScope}
        order by uid, profile_id`,
      profileParameters,
    ),
    client.query(
      `/* profitability-access-v2:assignments */
       select * from public.service_object_assignment
        where org_id = $1 and revoked_at is null ${assignmentScope}
        order by uid, object_id, assignment_role, assignment_id`,
      assignmentParameters,
    ),
    client.query(
      `/* profitability-access-v2:marker */
       select org_id, schema_version, enforced_by_uid, reason
         from public.profitability_access_enforcement
        where org_id = $1`,
      [manifest.orgId],
    ),
  ])

  return {
    ...sourceState,
    profiles: profiles.rows,
    assignments: assignments.rows,
    marker: marker.rows[0] || null,
  }
}

async function applyProvisioningPlan(client, manifest, plan, idFactory = crypto.randomUUID) {
  for (const action of plan.profileActions) {
    if (action.type !== 'REPLACE') continue
    const result = await client.query(
      `/* profitability-access-v2:revoke-profile */
       update public.organization_access_profile
          set revoked_at = greatest(transaction_timestamp(), valid_from),
              revoked_by_uid = $4,
              revocation_reason = $5,
              updated_at = transaction_timestamp(),
              updated_by_uid = $4
        where org_id = $1 and profile_id = $2 and uid = $3 and revoked_at is null`,
      [manifest.orgId, rowText(action.current, 'profileId', 'profile_id'), action.uid,
        manifest.actor.uid, 'REPLACED_BY_PROVISIONING_MANIFEST'],
    )
    if (result.rowCount !== 1) fail('PROFILE_REVOKE_CONFLICT')
  }

  for (const action of plan.assignmentActions) {
    if (!['REPLACE', 'REVOKE'].includes(action.type)) continue
    const current = action.current || action.row
    const result = await client.query(
      `/* profitability-access-v2:revoke-assignment */
       update public.service_object_assignment
          set revoked_at = greatest(transaction_timestamp(), valid_from),
              revoked_by_uid = $4,
              revocation_reason = $5,
              updated_at = transaction_timestamp(),
              updated_by_uid = $4
        where org_id = $1 and assignment_id = $2 and uid = $3 and revoked_at is null`,
      [manifest.orgId, rowText(current, 'assignmentId', 'assignment_id'), action.uid,
        manifest.actor.uid, action.type === 'REVOKE'
          ? 'REMOVED_BY_PROVISIONING_MANIFEST'
          : 'REPLACED_BY_PROVISIONING_MANIFEST'],
    )
    if (result.rowCount !== 1) fail('ASSIGNMENT_REVOKE_CONFLICT')
  }

  for (const action of plan.profileActions) {
    if (!['INSERT', 'REPLACE'].includes(action.type)) continue
    const desired = action.desired
    const result = await client.query(
      `/* profitability-access-v2:insert-profile */
       insert into public.organization_access_profile (
         org_id, profile_id, uid, operational_profile, object_scope, worker_scope,
         finance_profile, access_mode, can_edit_operational_costs,
         can_edit_contract_terms, can_edit_profitability_targets,
         can_view_worker_rates, can_edit_worker_rates, valid_from,
         created_by_uid, updated_by_uid
       ) values (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
         transaction_timestamp(), $14, $14
       )`,
      [manifest.orgId, idFactory(), action.uid, desired.operationalProfile,
        desired.objectScope, desired.workerScope, desired.financeProfile, desired.accessMode,
        desired.canEditOperationalCosts, desired.canEditContractTerms,
        desired.canEditProfitabilityTargets, desired.canViewWorkerRates,
        desired.canEditWorkerRates, manifest.actor.uid],
    )
    if (result.rowCount !== 1) fail('PROFILE_INSERT_FAILED')
  }

  for (const action of plan.assignmentActions) {
    if (!['INSERT', 'REPLACE'].includes(action.type)) continue
    const result = await client.query(
      `/* profitability-access-v2:insert-assignment */
       insert into public.service_object_assignment (
         org_id, assignment_id, object_id, uid, assignment_role, access_mode,
         valid_from, created_by_uid, updated_by_uid
       ) values ($1, $2, $3, $4, $5, $6, transaction_timestamp(), $7, $7)`,
      [manifest.orgId, idFactory(), action.objectId, action.uid, action.assignmentRole,
        action.accessMode, manifest.actor.uid],
    )
    if (result.rowCount !== 1) fail('ASSIGNMENT_INSERT_FAILED')
  }
}

function assertExactPlan(plan) {
  if (!plan.exact) {
    fail('PROVISIONING_STATE_NOT_EXACT', {
      profileChanges: plan.profileActions.filter((action) => action.type !== 'NOOP').length,
      assignmentChanges: plan.assignmentActions.filter((action) => action.type !== 'NOOP').length,
      unexpectedProfiles: plan.unexpectedProfiles.length,
      unexpectedAssignments: plan.unexpectedAssignments.length,
    })
  }
}

function markerMatches(marker, manifest, hash, catalogVerification) {
  return Boolean(marker) &&
    rowText(marker, 'schemaVersion', 'schema_version') === ENFORCEMENT_SCHEMA_VERSION &&
    rowText(marker, 'enforcedByUid', 'enforced_by_uid') === manifest.actor.uid &&
    rowText(marker, 'reason') === markerReason(manifest, hash, catalogVerification)
}

async function runProvisioning({
  client,
  sourceClient,
  manifest: rawManifest,
  mode = 'audit',
  schemaCheck = defaultSchemaCheck,
  idFactory = crypto.randomUUID,
  catalogVerification: rawCatalogVerification,
} = {}) {
  if (!client?.query) fail('DATABASE_CLIENT_REQUIRED')
  if (!sourceClient?.query || sourceClient === client) fail('DISTINCT_SOURCE_READER_CLIENT_REQUIRED')
  if (!['audit', 'apply', 'verify', 'activate'].includes(mode)) fail('MODE_INVALID')
  const manifest = normalizeManifest(rawManifest)
  const hash = manifestSha256(manifest)
  if (mode === 'activate' && !manifest.authoritative) fail('ACTIVATION_REQUIRES_AUTHORITATIVE_MANIFEST')
  const catalogVerification = mode === 'activate'
    ? normalizeCatalogVerification(rawCatalogVerification, manifest.orgId)
    : null

  const readOnly = mode === 'audit' || mode === 'verify'
  let targetStarted = false
  let targetFinished = false
  let sourceStarted = false
  try {
    await client.query(`begin isolation level serializable${readOnly ? ' read only' : ''}`)
    targetStarted = true
    await client.query(`set local role ${MIGRATION_RUNNER_ROLE}`)
    await client.query(`set local role ${OWNER_ROLE}`)
    await client.query(
      `select pg_advisory_xact_lock(hashtextextended($1::text, 0))
         /* profitability-access-v2:organization-lock */`,
      [profitabilityActivationLockKey(manifest.orgId)],
    )
    await sourceClient.query('begin isolation level read committed read only')
    sourceStarted = true
    const sourceState = await readAuthorizationState(sourceClient, client, manifest)
    const initialSourceSha256 = sourceStateSha256(sourceState)
    await schemaCheck(client)
    let state = await readTargetState(client, manifest, sourceState)
    let plan = buildProvisioningPlan(manifest, state)
    const initialProfileChanges = plan.profileActions.filter((action) => action.type !== 'NOOP').length
    const initialAssignmentChanges = plan.assignmentActions.filter((action) => action.type !== 'NOOP').length

    if (mode === 'apply' && state.marker && !plan.exact) {
      fail('ACTIVE_ENFORCEMENT_REQUIRES_REACTIVATION')
    }

    if (mode === 'apply') {
      await applyProvisioningPlan(client, manifest, plan, idFactory)
      state = await readTargetState(client, manifest, sourceState)
      plan = buildProvisioningPlan(manifest, state)
      assertExactPlan(plan)
    } else if (mode === 'verify') {
      assertExactPlan(plan)
    } else if (mode === 'activate') {
      if (!state.marker) {
        assertExactPlan(plan)
      } else if (!plan.exact) {
        await applyProvisioningPlan(client, manifest, plan, idFactory)
        state = await readTargetState(client, manifest, sourceState)
        plan = buildProvisioningPlan(manifest, state)
        assertExactPlan(plan)
      }
    }

    if (
      mode === 'activate' &&
      manifest.profiles.some((entry) => entry.profile.objectScope === 'ALL') &&
      sourceState.activeObjectCount < 1
    ) fail('ACTIVATION_REQUIRES_ACTIVE_SERVICE_OBJECT')
    let activated = markerMatches(state.marker, manifest, hash, catalogVerification)
    let activationChanged = false
    if (mode === 'activate') {
      const currentCatalogState = await readCatalogFingerprintState(
        sourceClient,
        client,
        manifest.orgId,
      )
      assertCatalogVerificationMatchesState(catalogVerification, currentCatalogState)
      const desiredReason = markerReason(manifest, hash, catalogVerification)
      if (!state.marker) {
        const result = await client.query(
          `/* profitability-access-v2:insert-marker */
           insert into public.profitability_access_enforcement (
             org_id, schema_version, enforced_by_uid, reason
          ) values ($1, $2, $3, $4)`,
          [manifest.orgId, ENFORCEMENT_SCHEMA_VERSION, manifest.actor.uid,
            desiredReason],
        )
        if (result.rowCount !== 1) fail('ENFORCEMENT_MARKER_INSERT_FAILED')
        activated = true
        activationChanged = true
      } else if (!activated) {
        const result = await client.query(
          `/* profitability-access-v2:update-marker */
           update public.profitability_access_enforcement
              set enforced_at = transaction_timestamp(),
                  enforced_by_uid = $3,
                  reason = $4
            where org_id = $1 and schema_version = $2
              and enforced_by_uid = $5 and reason = $6`,
          [manifest.orgId, ENFORCEMENT_SCHEMA_VERSION, manifest.actor.uid, desiredReason,
            rowText(state.marker, 'enforcedByUid', 'enforced_by_uid'),
            rowText(state.marker, 'reason')],
        )
        if (result.rowCount !== 1) fail('ENFORCEMENT_MARKER_UPDATE_CONFLICT')
        activated = true
        activationChanged = true
      }
    }

    if (!readOnly) {
      const confirmedSourceState = await readAuthorizationState(sourceClient, client, manifest)
      if (sourceStateSha256(confirmedSourceState) !== initialSourceSha256) {
        fail('SOURCE_AUTHORIZATION_CHANGED_DURING_PROVISIONING')
      }
    }

    if (readOnly) await client.query('rollback')
    else await client.query('commit')
    targetFinished = true
    await sourceClient.query('rollback')
    sourceStarted = false

    return {
      mode,
      manifestSha256: hash,
      exact: plan.exact,
      activated,
      changed: mode === 'apply'
        ? initialProfileChanges > 0 || initialAssignmentChanges > 0
        : activationChanged,
      counts: {
        profiles: manifest.profiles.length,
        assignments: manifest.profiles.reduce((sum, entry) => sum + entry.assignments.length, 0),
        profileChanges: mode === 'apply' ? initialProfileChanges :
          plan.profileActions.filter((action) => action.type !== 'NOOP').length,
        assignmentChanges: mode === 'apply' ? initialAssignmentChanges :
          plan.assignmentActions.filter((action) => action.type !== 'NOOP').length,
        unexpectedProfiles: plan.unexpectedProfiles.length,
        unexpectedAssignments: plan.unexpectedAssignments.length,
      },
    }
  } catch (error) {
    if (targetStarted && !targetFinished) {
      try { await client.query('rollback') } catch {}
    }
    if (sourceStarted) {
      try { await sourceClient.query('rollback') } catch {}
    }
    throw error
  }
}

module.exports = {
  CATALOG_FINGERPRINT_SCHEMA_VERSION,
  CATALOG_VERIFICATION_SCHEMA_VERSION,
  ENFORCEMENT_SCHEMA_VERSION,
  MANIFEST_SCHEMA_VERSION,
  ProfitabilityAccessProvisioningError,
  applyProvisioningPlan,
  buildProvisioningPlan,
  canonicalStringify,
  defaultSchemaCheck,
  manifestSha256,
  markerReason,
  normalizeCatalogVerification,
  normalizeManifest,
  readAuthorizationState,
  readCatalogFingerprintState,
  readTargetState,
  runProvisioning,
  sourceStateSha256,
  assertCatalogVerificationMatchesState,
}
