'use strict'

const PLATFORM_ROLE = 'PLATFORM_OWNER'
const PLATFORM_ROLE_LEVEL = 4
const FRESH_AUTH_MAX_AGE_SECONDS = 5 * 60
const READ_GUARD_CONNECTOR_ID = 'read-guard'
const READ_GUARD_QUERY_OPERATIONS = new Set([
  'WorkersPageForOrg',
  'WorkerForOrgByLogin',
  'ClientsPageForOrg',
  'ZonesPageForOrg',
  'BackupCyclesPageForOrg',
  'WorkdayPausesPageForOrg',
])

const PLATFORM_QUERY_ALLOWLIST = new Set([
  'CanManageWorkersForOrg',
  'WorkersForOrg',
  'ClientsForOrg',
  'IndividualJobsForOrg',
  'TasksForOrg',
  'ZonesForOrg',
  'WorkdaysForOrg',
  'WorkdaysPageForOrg',
  'WorkdaysPageForOrgByBusinessDate',
  'WorkdaysIntegrityPageForOrg',
  'WorkdaysPageForOrgByWorker',
  'WorkdaysPageForOrgByRoom',
  'WorkdaysPageForOrgByStatus',
  'WorkdaysFingerprintForOrg',
  'BackupCyclesForOrg',
  'EventsForOrg',
  'EventsIntegrityPageForOrg',
  'EventsPageForOrg',
  'EventsPageForOrgByWorker',
  'EventsPageForOrgByZone',
  'EventsPageForOrgByStatus',
  'EventsFingerprintForOrg',
  'WorkerWorkdaysForOrg',
  'StorageForOrg',
  'ClientStorageForClient',
  'ClientStorageForOrg',
  'WorkdayPausesForOrg',
  'ActiveWorkdayPauseForWorker',
  ...READ_GUARD_QUERY_OPERATIONS,
])

const PLATFORM_MUTATION_ALLOWLIST = new Set([
  'InsertClientForOrg',
  'UpdateClientForOrg',
  'DeleteClientForOrg',
  'InsertIndividualJobForOrg',
  'UpdateIndividualJobForOrg',
  'DeleteIndividualJobForOrg',
  'UpsertTaskForOrg',
  'DeleteTaskForOrg',
  'InsertZoneForOrg',
  'UpdateZoneForOrg',
  'InsertZoneWithRequiredVisitForOrg',
  'UpdateZoneWithRequiredVisitForOrg',
  'DeleteZoneForOrg',
  'InsertWorkdayForOrg',
  'UpdateWorkdayForOrg',
  'DeleteWorkdayForOrg',
  'InsertEventForOrg',
  'UpdateEventForOrg',
  'ReidentifyEventForOrg',
  'DeleteEventForOrg',
  'InsertBackupCycleForOrg',
  'UpdateBackupCycleForOrg',
  'InsertStorageForOrg',
  'UpdateStorageForOrg',
  'DeleteStorageForOrg',
  'InsertClientStorageForOrg',
  'UpdateClientStorageForOrg',
  'DeleteClientStorageForOrg',
  'StartWorkdayPause',
  'StopWorkdayPause',
])

const SECRET_KEY_PATTERN = /(password|passcode|token|secret|credential|authorization|mfa|otp|totp|sms.?code)/i
const PLATFORM_IDENTITY_KEY_PATTERN = /^(edit|editedBy|updatedBy|createdByUid|updatedByUid|createdBy)$/i

function text(value) {
  return String(value ?? '').trim()
}

function normalizePlatformRole(value) {
  return text(value).toUpperCase()
}

function hasPlatformOwnerClaim(decodedToken) {
  return normalizePlatformRole(decodedToken?.platformRole ?? decodedToken?.platform_role) === PLATFORM_ROLE
}

function hasVerifiedEmail(decodedToken) {
  return decodedToken?.email_verified === true && Boolean(text(decodedToken?.email))
}

function secondFactorId(decodedToken) {
  const firebaseClaims = decodedToken?.firebase || {}
  const value =
    firebaseClaims.sign_in_second_factor ??
    firebaseClaims.signInSecondFactor ??
    decodedToken?.sign_in_second_factor
  if (Array.isArray(value)) return text(value[0])
  return text(value)
}

function hasSecondFactor(decodedToken) {
  return Boolean(secondFactorId(decodedToken))
}

function authAgeSeconds(decodedToken, nowSeconds = Math.floor(Date.now() / 1000)) {
  const authTime = Number(decodedToken?.auth_time)
  if (!Number.isFinite(authTime) || authTime <= 0) return Number.POSITIVE_INFINITY
  return Math.max(0, Number(nowSeconds) - authTime)
}

function hasFreshAuthentication(decodedToken, nowSeconds, maxAgeSeconds = FRESH_AUTH_MAX_AGE_SECONDS) {
  return hasSecondFactor(decodedToken) && authAgeSeconds(decodedToken, nowSeconds) <= maxAgeSeconds
}

function isSensitivePlatformOperation(operationName, pathname = '') {
  const operation = text(operationName)
  const path = text(pathname).toLowerCase()
  return (
    /^(Delete|Restore|Reidentify)/.test(operation) ||
    /password|owner|subscription|soft-delete|restore|delete/.test(path)
  )
}

function isAllowedPlatformOperation(kind, operationName) {
  const normalizedKind = text(kind).toLowerCase()
  const name = text(operationName)
  if (normalizedKind === 'query') return PLATFORM_QUERY_ALLOWLIST.has(name)
  if (normalizedKind === 'mutation') return PLATFORM_MUTATION_ALLOWLIST.has(name)
  return false
}

function resolvePlatformDataConnectConnector(kind, operationName, defaultConnector) {
  const normalizedKind = text(kind).toLowerCase()
  const name = text(operationName)
  if (normalizedKind === 'query' && READ_GUARD_QUERY_OPERATIONS.has(name)) {
    return READ_GUARD_CONNECTOR_ID
  }
  return text(defaultConnector)
}

function sanitizeAuditValue(value, key = '', depth = 0) {
  if (SECRET_KEY_PATTERN.test(key)) return '[REDACTED]'
  if (depth > 6) return '[TRUNCATED]'
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'string') return value.slice(0, 2000)
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeAuditValue(item, key, depth + 1))
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 100)
        .map(([entryKey, entryValue]) => [entryKey, sanitizeAuditValue(entryValue, entryKey, depth + 1)]),
    )
  }
  return text(value).slice(0, 2000)
}

function sanitizeTenantMutationVariables(variables) {
  const source = variables && typeof variables === 'object' && !Array.isArray(variables) ? variables : {}
  const sanitized = { ...source }
  for (const key of Object.keys(sanitized)) {
    if (PLATFORM_IDENTITY_KEY_PATTERN.test(key)) sanitized[key] = null
  }
  return sanitized
}

module.exports = {
  FRESH_AUTH_MAX_AGE_SECONDS,
  READ_GUARD_CONNECTOR_ID,
  READ_GUARD_QUERY_OPERATIONS,
  PLATFORM_MUTATION_ALLOWLIST,
  PLATFORM_QUERY_ALLOWLIST,
  PLATFORM_ROLE,
  PLATFORM_ROLE_LEVEL,
  authAgeSeconds,
  hasFreshAuthentication,
  hasPlatformOwnerClaim,
  hasSecondFactor,
  hasVerifiedEmail,
  isAllowedPlatformOperation,
  isSensitivePlatformOperation,
  normalizePlatformRole,
  resolvePlatformDataConnectConnector,
  sanitizeAuditValue,
  sanitizeTenantMutationVariables,
  secondFactorId,
}
