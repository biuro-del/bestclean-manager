const SESSION_KEY = 'iclean_mobile_session_v1'
const LAST_ORG_KEY = 'iclean_mobile_last_org_v1'
const LANGUAGE_KEY = 'iclean_mobile_lang_v1'
const LANGUAGE_USER_KEY_PREFIX = 'iclean_mobile_lang_user_v1'
const DEFAULT_LANGUAGE = 'Si'

function toText(value) {
  return String(value ?? '').trim()
}

function parseLanguageCode(value) {
  const code = toText(value)
  if (code === 'PL' || code === 'Si') {
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
