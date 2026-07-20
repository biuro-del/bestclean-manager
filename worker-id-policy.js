'use strict'

const MAX_WORKER_NUMBER = 2147483647

function toText(value) {
  return String(value ?? '').trim()
}

function normalizeRoleCode(value) {
  return toText(value).toUpperCase()
}

function normalizeWorkerRole(value) {
  const role = normalizeRoleCode(value)
  if (role === 'PLATFORM_OWNER') return 'PLATFORM_OWNER'
  if (role === 'OWNER') return 'OWNER'
  if (role === 'ADMIN' || role === 'ADMINISTRATOR' || role === 'SUPERADMIN') return 'ADMIN'
  if (role === 'MANAGER' || role === 'KIEROWNIK') return 'MANAGER'
  if (role === 'COORDINATOR' || role === 'KOORDYNATOR' || role === 'MEMBER') return 'COORDINATOR'
  if (
    role === 'WORKER' ||
    role === 'PRACOWNIK' ||
    role === 'INTERN' ||
    role === 'STAZYSTA' ||
    role === 'STAŻYSTA'
  ) return 'WORKER'
  return ''
}

function isFullWorkerAdministrationRole(value) {
  const role = normalizeWorkerRole(value)
  return role === 'ADMIN' || role === 'OWNER' || role === 'PLATFORM_OWNER'
}

function canAssignWorkerRole(
  requesterRole,
  targetRole,
  { currentRole = '', targetIsOwner = false, creating = false } = {},
) {
  const requester = normalizeWorkerRole(requesterRole)
  const target = normalizeWorkerRole(targetRole)
  const current = normalizeWorkerRole(currentRole)

  if (!target) return false
  if (targetIsOwner) return !creating && target === 'OWNER'
  if (target === 'OWNER') return false
  if (isFullWorkerAdministrationRole(requester)) return true
  if (requester !== 'MANAGER') return false
  return creating ? target === 'WORKER' : Boolean(current) && target === current
}

function isWorkerDeleteRole(value) {
  const role = normalizeRoleCode(value)
  return role === 'ADMIN' || role === 'OWNER' || role === 'PLATFORM_OWNER'
}

function isWorkerManagementRole(value) {
  return [
    'ADMIN',
    'ADMINISTRATOR',
    'OWNER',
    'SUPERADMIN',
    'PLATFORM_OWNER',
    'MANAGER',
    'KIEROWNIK',
  ].includes(normalizeRoleCode(value))
}

function workerIdPrefix(orgId) {
  const normalizedOrgId = toText(orgId)
  if (!normalizedOrgId) {
    throw new Error('INVALID_ORG_ID')
  }
  return `worker_${normalizedOrgId}_`
}

function normalizeWorkerNumber(value, { optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    return optional ? null : 0
  }

  const raw = toText(value)
  if (!/^[1-9]\d*$/.test(raw)) {
    return optional ? null : 0
  }

  const number = Number(raw)
  if (!Number.isSafeInteger(number) || number < 1 || number > MAX_WORKER_NUMBER) {
    return optional ? null : 0
  }

  return number
}

function buildWorkerId(orgId, workerNumber) {
  const normalizedNumber = normalizeWorkerNumber(workerNumber)
  if (!normalizedNumber) {
    throw new Error('INVALID_WORKER_NUMBER')
  }
  return `${workerIdPrefix(orgId)}${normalizedNumber}`
}

function buildWorkerLogin(orgId, workerNumber) {
  const normalizedOrgId = toText(orgId).toLowerCase()
  const normalizedNumber = normalizeWorkerNumber(workerNumber)
  if (!/^[a-z0-9_-]{1,64}$/.test(normalizedOrgId)) {
    throw new Error('INVALID_ORG_ID')
  }
  if (!normalizedNumber) {
    throw new Error('INVALID_WORKER_NUMBER')
  }

  const login = `u_${normalizedOrgId}_${normalizedNumber}`
  if (login.length > 80) {
    throw new Error('WORKER_LOGIN_TOO_LONG')
  }
  return login
}

function parseWorkerNumber(orgId, workerId) {
  const rawWorkerId = toText(workerId)
  const prefix = workerIdPrefix(orgId)
  if (!rawWorkerId.startsWith(prefix)) {
    return null
  }
  return normalizeWorkerNumber(rawWorkerId.slice(prefix.length), { optional: true })
}

function maxWorkerNumber(orgId, reservations = [], workers = []) {
  let maxNumber = 0

  for (const reservation of Array.isArray(reservations) ? reservations : []) {
    const number = normalizeWorkerNumber(
      reservation?.workerNumber ?? reservation?.worker_number,
      { optional: true },
    )
    if (number && number > maxNumber) {
      maxNumber = number
    }
  }

  for (const worker of Array.isArray(workers) ? workers : []) {
    const number = parseWorkerNumber(
      orgId,
      worker?.workerId ?? worker?.worker_id ?? worker?.id,
    )
    if (number && number > maxNumber) {
      maxNumber = number
    }
  }

  return maxNumber
}

function nextWorkerNumber(orgId, reservations = [], workers = []) {
  const next = maxWorkerNumber(orgId, reservations, workers) + 1
  if (next > MAX_WORKER_NUMBER) {
    throw new Error('WORKER_NUMBER_LIMIT_REACHED')
  }
  return next
}

module.exports = {
  MAX_WORKER_NUMBER,
  buildWorkerId,
  buildWorkerLogin,
  canAssignWorkerRole,
  isFullWorkerAdministrationRole,
  isWorkerDeleteRole,
  isWorkerManagementRole,
  maxWorkerNumber,
  nextWorkerNumber,
  normalizeRoleCode,
  normalizeWorkerRole,
  normalizeWorkerNumber,
  parseWorkerNumber,
  workerIdPrefix,
}
