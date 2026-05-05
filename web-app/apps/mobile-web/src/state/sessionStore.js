const SESSION_KEY = 'iclean_mobile_session_v1'
const LAST_ORG_KEY = 'iclean_mobile_last_org_v1'
const AUDIT_SESSION_KEY = 'iclean_mobile_audit_session_v1'
const LANGUAGE_KEY = 'iclean_mobile_lang_v1'
const LANGUAGE_USER_KEY_PREFIX = 'iclean_mobile_lang_user_v1'
const DEFAULT_LANGUAGE = 'Si'
const SUPPORTED_LANGUAGE_CODES = new Set(['PL', 'Si', 'EN', 'ES', 'D', 'FR', 'IT', 'UA', 'RU'])
const AUDIT_VIEWS = new Set(['audit-scan', 'audit-form'])

function toText(value) {
  return String(value ?? '').trim()
}

function parseLanguageCode(value) {
  const code = toText(value)
  if (SUPPORTED_LANGUAGE_CODES.has(code)) {
    return code
  }
  return ''
}

function normalizeLanguageCode(value) {
  return parseLanguageCode(value) || DEFAULT_LANGUAGE
}

function normalizeIdentityPart(value) {
  return toText(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '')
}

function localDayKey(value = new Date().toISOString()) {
  const raw = toText(value)
  if (!raw) {
    return ''
  }
  const date = new Date(raw)
  if (!Number.isFinite(date.getTime())) {
    return ''
  }
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeAuditIdentity(sessionOrIdentity) {
  return (
    normalizeIdentityPart(sessionOrIdentity?.uid) ||
    normalizeIdentityPart(sessionOrIdentity?.workerLogin) ||
    normalizeIdentityPart(sessionOrIdentity?.login) ||
    normalizeIdentityPart(sessionOrIdentity?.email)
  )
}

function normalizeAuditView(value, zoneId) {
  const view = toText(value)
  if (view === 'audit-form' && toText(zoneId)) {
    return 'audit-form'
  }
  return AUDIT_VIEWS.has(view) ? view : 'audit-scan'
}

function normalizeAuditCleanValue(value) {
  if (value === 0 || value === '0') {
    return 0
  }
  if (value === 1 || value === '1') {
    return 1
  }
  return null
}

function normalizeAuditDraft(draft, sessionOrIdentity = null) {
  const sessionId = toText(draft?.sessionId)
  const startedAt = toText(draft?.startedAt || draft?.auditStartedAt)
  const dayKey = localDayKey(startedAt)
  if (!sessionId || !startedAt || !dayKey) {
    return null
  }

  const zoneId = toText(draft?.zoneId)
  return {
    sessionId,
    startedAt,
    dayKey,
    view: normalizeAuditView(draft?.view, zoneId),
    zoneId,
    cleanValue: normalizeAuditCleanValue(draft?.cleanValue),
    comment: toText(draft?.comment).slice(0, 300),
    auditId: toText(draft?.auditId),
    orgId: normalizeIdentityPart(draft?.orgId || sessionOrIdentity?.orgId),
    identity: normalizeAuditIdentity({
      uid: draft?.uid || sessionOrIdentity?.uid,
      workerLogin: draft?.workerLogin || sessionOrIdentity?.workerLogin,
      login: draft?.login || sessionOrIdentity?.login,
      email: draft?.email || sessionOrIdentity?.email,
    }),
  }
}

function languageKeyForUser(sessionOrIdentity) {
  const orgId = normalizeIdentityPart(sessionOrIdentity?.orgId) || 'default'
  const userIdentity =
    normalizeIdentityPart(sessionOrIdentity?.workerLogin) ||
    normalizeIdentityPart(sessionOrIdentity?.login) ||
    normalizeIdentityPart(sessionOrIdentity?.email)
  if (!userIdentity) {
    return ''
  }
  return `${LANGUAGE_USER_KEY_PREFIX}_${orgId}_${userIdentity}`
}

function readStoredLanguage(storageKey) {
  if (!storageKey) {
    return ''
  }
  return parseLanguageCode(localStorage.getItem(storageKey))
}

export function readMobileSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw)
    if (!parsed || !parsed.token) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeMobileSession(session) {
  const payload = {
    token: toText(session?.token),
    uid: toText(session?.uid),
    email: toText(session?.email ?? session?.login),
    login: toText(session?.login),
    orgId: toText(session?.orgId),
    orgName: toText(session?.orgName),
    role: toText(session?.role || 'Pracownik'),
    workerLogin: toText(session?.workerLogin),
    workerName: toText(session?.workerName),
    source: toText(session?.source || 'firebase'),
  }

  localStorage.setItem(SESSION_KEY, JSON.stringify(payload))
  if (payload.orgId) {
    localStorage.setItem(LAST_ORG_KEY, payload.orgId)
  }
  return payload
}

export function clearMobileSession() {
  localStorage.removeItem(SESSION_KEY)
}

export function readMobileAuditSession(sessionOrIdentity = null, nowIso = new Date().toISOString()) {
  try {
    const raw = localStorage.getItem(AUDIT_SESSION_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw)
    const normalized = normalizeAuditDraft(parsed)
    if (!normalized) {
      localStorage.removeItem(AUDIT_SESSION_KEY)
      return null
    }

    const nowDayKey = localDayKey(nowIso)
    if (!nowDayKey || normalized.dayKey !== nowDayKey) {
      localStorage.removeItem(AUDIT_SESSION_KEY)
      return null
    }

    const expectedOrgId = normalizeIdentityPart(sessionOrIdentity?.orgId)
    if (expectedOrgId && normalized.orgId && normalized.orgId !== expectedOrgId) {
      localStorage.removeItem(AUDIT_SESSION_KEY)
      return null
    }

    const expectedIdentity = normalizeAuditIdentity(sessionOrIdentity)
    if (expectedIdentity && normalized.identity && normalized.identity !== expectedIdentity) {
      localStorage.removeItem(AUDIT_SESSION_KEY)
      return null
    }

    return normalized
  } catch {
    return null
  }
}

export function writeMobileAuditSession(draft, sessionOrIdentity = null) {
  const normalized = normalizeAuditDraft(draft, sessionOrIdentity)
  if (!normalized) {
    localStorage.removeItem(AUDIT_SESSION_KEY)
    return null
  }

  localStorage.setItem(AUDIT_SESSION_KEY, JSON.stringify(normalized))
  return normalized
}

export function clearMobileAuditSession() {
  localStorage.removeItem(AUDIT_SESSION_KEY)
}

export function readPreferredOrgId() {
  return toText(localStorage.getItem(LAST_ORG_KEY))
}

export function readMobileLanguage(sessionOrIdentity = null) {
  try {
    const userLanguageKey = languageKeyForUser(sessionOrIdentity)
    const userLanguage = readStoredLanguage(userLanguageKey)
    if (userLanguage) {
      return userLanguage
    }
    return normalizeLanguageCode(localStorage.getItem(LANGUAGE_KEY))
  } catch {
    return DEFAULT_LANGUAGE
  }
}

export function writeMobileLanguage(languageCode, sessionOrIdentity = null) {
  const normalized = normalizeLanguageCode(languageCode)
  localStorage.setItem(LANGUAGE_KEY, normalized)
  const userLanguageKey = languageKeyForUser(sessionOrIdentity)
  if (userLanguageKey) {
    localStorage.setItem(userLanguageKey, normalized)
  }
  return normalized
}
