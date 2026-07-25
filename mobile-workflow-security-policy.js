'use strict'

const MOBILE_WORKER_ERROR = Object.freeze({
  AUTH_UID_MISSING: 'MOBILE_AUTH_UID_MISSING',
  AUTH_UID_AMBIGUOUS: 'WORKER_AUTH_UID_AMBIGUOUS',
  MEMBERSHIP_AMBIGUOUS: 'WORKER_MEMBERSHIP_AMBIGUOUS',
  EMAIL_AMBIGUOUS: 'WORKER_EMAIL_AMBIGUOUS',
  IDENTITY_CONFLICT: 'WORKER_IDENTITY_CONFLICT',
  MEMBERSHIP_CONFLICT: 'WORKER_MEMBERSHIP_CONFLICT',
  AUTH_UID_CONFLICT: 'WORKER_AUTH_UID_CONFLICT',
  CLAIM_MISMATCH: 'WORKER_CLAIM_MISMATCH',
  NOT_FOUND: 'WORKER_NOT_FOUND',
  SERVER_TIME_INVALID: 'MOBILE_SERVER_TIME_INVALID',
})

function text(value) {
  return String(value ?? '').trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function workerPolicyError(statusCode, publicCode, publicMessage, publicDetails = undefined) {
  const error = new Error(publicCode)
  error.statusCode = statusCode
  error.publicCode = publicCode
  error.publicMessage = publicMessage
  if (publicDetails && typeof publicDetails === 'object') {
    error.publicDetails = publicDetails
  }
  return error
}

function normalizeWorkerRow(row = {}) {
  return {
    row,
    login: text(row.login ?? row.workerLogin ?? row.worker_login),
    workerId: text(row.workerId ?? row.worker_id),
    authUid: text(row.authUid ?? row.auth_uid),
    loginEmail: lower(row.loginEmail ?? row.login_email),
    email: lower(row.email),
  }
}

function workerIdentityKey(worker = {}) {
  return `${lower(worker.workerId)}\u0000${lower(worker.login)}`
}

function uniqueWorkers(workers = []) {
  const unique = new Map()
  for (const worker of workers) {
    const key = workerIdentityKey(worker)
    if (!unique.has(key)) unique.set(key, worker)
  }
  return [...unique.values()]
}

function requireSingleMatch(matches, code, message, details = {}) {
  const unique = uniqueWorkers(matches)
  if (unique.length > 1) {
    throw workerPolicyError(409, code, message, {
      ...details,
      candidateCount: unique.length,
    })
  }
  return unique[0] ?? null
}

function sameWorker(left, right) {
  return Boolean(left && right && workerIdentityKey(left) === workerIdentityKey(right))
}

function resolveAuthenticatedMobileWorker({
  rows = [],
  tokenUid = '',
  tokenEmail = '',
  membershipWorkerId = '',
  requestedWorkerId = '',
  requestedLogin = '',
} = {}) {
  const uid = text(tokenUid)
  if (!uid) {
    throw workerPolicyError(
      401,
      MOBILE_WORKER_ERROR.AUTH_UID_MISSING,
      'Token Firebase nie zawiera identyfikatora uzytkownika.',
    )
  }

  const email = lower(tokenEmail)
  const membershipId = text(membershipWorkerId)
  const workers = (Array.isArray(rows) ? rows : [])
    .filter((row) => row && typeof row === 'object' && !Array.isArray(row))
    .map(normalizeWorkerRow)
    .filter((worker) => worker.login)

  const uidMatch = requireSingleMatch(
    workers.filter((worker) => worker.authUid === uid),
    MOBILE_WORKER_ERROR.AUTH_UID_AMBIGUOUS,
    'Ten sam identyfikator logowania jest przypisany do kilku pracownikow.',
    { authUid: uid },
  )
  const membershipMatch = membershipId
    ? requireSingleMatch(
        workers.filter((worker) => lower(worker.workerId) === lower(membershipId)),
        MOBILE_WORKER_ERROR.MEMBERSHIP_AMBIGUOUS,
        'Powiazanie czlonkostwa wskazuje kilku pracownikow.',
        { membershipWorkerId: membershipId },
      )
    : null
  const emailMatch = email
    ? requireSingleMatch(
        workers.filter(
          (worker) =>
            worker.loginEmail === email ||
            worker.email === email ||
            lower(worker.login) === email,
        ),
        MOBILE_WORKER_ERROR.EMAIL_AMBIGUOUS,
        'Adres e-mail tokenu jest przypisany do kilku pracownikow.',
        { tokenEmail: email },
      )
    : null

  if (membershipId && !membershipMatch && (uidMatch || emailMatch)) {
    throw workerPolicyError(
      409,
      MOBILE_WORKER_ERROR.MEMBERSHIP_CONFLICT,
      'Powiazanie czlonkostwa nie zgadza sie z profilem pracownika.',
      { membershipWorkerId: membershipId },
    )
  }

  const authoritativeMatches = [uidMatch, membershipMatch, emailMatch].filter(Boolean)
  const selected = authoritativeMatches[0] ?? null
  if (!selected) {
    throw workerPolicyError(
      404,
      MOBILE_WORKER_ERROR.NOT_FOUND,
      'Nie znaleziono pracownika powiazanego z ta sesja.',
    )
  }
  if (authoritativeMatches.some((candidate) => !sameWorker(candidate, selected))) {
    throw workerPolicyError(
      409,
      MOBILE_WORKER_ERROR.IDENTITY_CONFLICT,
      'Dane uwierzytelnienia wskazuja rozne profile pracownika.',
    )
  }
  if (membershipId && lower(selected.workerId) !== lower(membershipId)) {
    throw workerPolicyError(
      409,
      MOBILE_WORKER_ERROR.MEMBERSHIP_CONFLICT,
      'Powiazanie czlonkostwa nie zgadza sie z profilem pracownika.',
      {
        membershipWorkerId: membershipId,
        resolvedWorkerId: selected.workerId,
      },
    )
  }
  if (selected.authUid && selected.authUid !== uid) {
    throw workerPolicyError(
      403,
      MOBILE_WORKER_ERROR.AUTH_UID_CONFLICT,
      'Profil pracownika jest przypisany do innego konta logowania.',
      { workerId: selected.workerId || null },
    )
  }

  const claimedWorkerId = text(requestedWorkerId)
  const claimedLogin = text(requestedLogin)
  const mismatches = []
  if (claimedWorkerId && lower(claimedWorkerId) !== lower(selected.workerId)) {
    mismatches.push('workerId')
  }
  if (claimedLogin && lower(claimedLogin) !== lower(selected.login)) {
    mismatches.push('workerLogin')
  }
  if (mismatches.length) {
    throw workerPolicyError(
      403,
      MOBILE_WORKER_ERROR.CLAIM_MISMATCH,
      'Dane pracownika w zadaniu nie zgadzaja sie z uwierzytelniona sesja.',
      { mismatches },
    )
  }

  return selected.row
}

function resolveAuthoritativeMobileScanAt({ serverNow = new Date() } = {}) {
  const parsed = serverNow instanceof Date ? new Date(serverNow.getTime()) : new Date(serverNow)
  if (!Number.isFinite(parsed.getTime())) {
    throw workerPolicyError(
      500,
      MOBILE_WORKER_ERROR.SERVER_TIME_INVALID,
      'Nie udalo sie ustalic czasu serwera.',
    )
  }
  return parsed
}

module.exports = {
  MOBILE_WORKER_ERROR,
  resolveAuthenticatedMobileWorker,
  resolveAuthoritativeMobileScanAt,
}
