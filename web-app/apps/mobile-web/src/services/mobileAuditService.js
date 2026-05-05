import { isFirebaseConfigured, waitForFirebaseAuthReady } from '../firebase/firebaseClient'

function toText(value) {
  return String(value ?? '').trim()
}

function toUpper(value) {
  return toText(value).toUpperCase()
}

function isTrue(value) {
  return toText(value).toLowerCase() === 'true'
}

function isLocalHttpEndpoint(value) {
  return /^http:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?/i.test(toText(value))
}

function isBrowserSameOriginAvailable() {
  if (typeof window === 'undefined' || !window.location) {
    return false
  }

  const protocol = toText(window.location.protocol).toLowerCase()
  return protocol === 'https:' || protocol === 'http:'
}

function normalizeFunctionToken(value) {
  const raw = toText(value)
  if (!raw) {
    return ''
  }

  let normalized = raw
  try {
    normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  } catch {
    // Best effort only.
  }

  return normalized.toUpperCase().replace(/[^A-Z0-9]+/g, '')
}

function createUuid() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // Ignore and use fallback below.
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16)
    const value = token === 'x' ? random : ((random & 0x3) | 0x8)
    return value.toString(16)
  })
}

function ensureIso(value) {
  const raw = toText(value)
  if (!raw) {
    return ''
  }
  const date = new Date(raw)
  if (!Number.isFinite(date.getTime())) {
    return ''
  }
  return date.toISOString()
}

function getAuditLogEndpoint() {
  const endpointFromEnv = toText(import.meta.env.VITE_AUDIT_LOG_ENDPOINT)
  const useEmulators = isTrue(import.meta.env.VITE_USE_EMULATORS)
  if (endpointFromEnv && (!isLocalHttpEndpoint(endpointFromEnv) || useEmulators)) {
    return endpointFromEnv
  }

  if (!useEmulators && isBrowserSameOriginAvailable()) {
    return '/logMobileZoneAudit'
  }

  const projectId = toText(import.meta.env.VITE_FIREBASE_PROJECT_ID) || 'iclean-room'
  const host = toText(import.meta.env.VITE_FUNCTIONS_EMULATOR_HOST)
  const port = Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT ?? 5001)
  if (useEmulators && host) {
    return `http://${host}:${port}/${projectId}/europe-west3/logMobileZoneAudit`
  }

  return `https://europe-west3-${projectId}.cloudfunctions.net/logMobileZoneAudit`
}

async function assertSignedInUser() {
  const user = await waitForFirebaseAuthReady()
  if (!user) {
    const error = new Error('Sesja wygasła. Zaloguj się ponownie.')
    error.code = 'UNAUTHENTICATED'
    throw error
  }
  return user
}

async function parseFailedResponse(response) {
  let message = ''

  try {
    const body = await response.json()
    message =
      toText(body?.error?.message) ||
      toText(body?.message) ||
      toText(body?.details?.message)
  } catch {
    try {
      message = toText(await response.text())
    } catch {
      message = ''
    }
  }

  if (response.status === 401) {
    return message || 'Sesja wygasła. Zaloguj się ponownie.'
  }
  return message || 'Nie udało się zapisać audytu.'
}

function resolveZoneFromSnapshot(snapshot, zoneId) {
  const normalizedZoneId = toText(zoneId).toLowerCase()
  if (!normalizedZoneId) {
    return null
  }
  return (snapshot?.zones || []).find((zone) => toText(zone?.id).toLowerCase() === normalizedZoneId) || null
}

export function getZoneAuditValidationError(zone) {
  if (!zone || !toText(zone?.id)) {
    return 'Nie znaleziono strefy dla podanego kodu QR.'
  }

  const kind = toUpper(zone?.kind)
  const token = normalizeFunctionToken(zone?.functionName)
  if (kind === 'START' || token === 'START' || token === 'STARTCZASPRACY') {
    return 'Kod START nie może być audytowaną strefą.'
  }

  if (kind === 'STOP' || token.startsWith('STOP')) {
    return 'Kod STOP nie może być audytowaną strefą.'
  }

  if (kind !== 'CLEAN') {
    return 'Audyt obsługuje tylko zwykłe strefy sprzątania.'
  }

  if (
    token.includes('SPRZATANIEINDYWIDUALNE') ||
    token.includes('ZLECENIEINDYWIDUALNE') ||
    token.includes('STREFASPECJALNA') ||
    token.includes('KODSPECJALNY')
  ) {
    return 'Audyt obsługuje tylko zwykłe strefy sprzątania.'
  }

  if (
    token.includes('PODAJNIK') ||
    token.includes('INDEKS') ||
    token.includes('MAGAZYNLOKALIZACJA')
  ) {
    return 'Ten kod QR nie jest zwykłą strefą sprzątania.'
  }

  return ''
}

export async function logMobileZoneAudit(session, snapshot, params) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase dla mobile-web.')
  }

  const orgId = toText(session?.orgId)
  if (!orgId) {
    throw new Error('Brak orgId w sesji mobile.')
  }

  const zoneId = toText(params?.zoneId)
  if (!zoneId) {
    throw new Error('Brak kodu strefy do audytu.')
  }

  const zone = resolveZoneFromSnapshot(snapshot, zoneId)
  const zoneError = getZoneAuditValidationError(zone)
  if (zoneError) {
    throw new Error(zoneError)
  }

  const cleanValue = Number(params?.cleanValue)
  if (cleanValue !== 0 && cleanValue !== 1) {
    throw new Error('Wybierz odpowiedź TAK lub NIE.')
  }

  const sessionId = toText(params?.sessionId) || createUuid()
  const auditId = toText(params?.auditId) || createUuid()
  const auditStartedAt = ensureIso(params?.auditStartedAt)
  if (!auditStartedAt) {
    throw new Error('Brak czasu rozpoczęcia audytu.')
  }

  const comment = toText(params?.comment).slice(0, 300)
  const deviceAt = ensureIso(params?.deviceAt || new Date().toISOString())
  if (!deviceAt) {
    throw new Error('Brak czasu urządzenia dla audytu.')
  }

  const firebaseUser = await assertSignedInUser()
  const idToken = await firebaseUser.getIdToken()
  const response = await fetch(getAuditLogEndpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      auditId,
      sessionId,
      auditStartedAt,
      zoneId,
      cleanValue,
      comment,
      deviceAt,
    }),
  })

  if (!response.ok) {
    throw new Error(await parseFailedResponse(response))
  }

  let data = null
  try {
    data = await response.json()
  } catch {
    data = null
  }

  return {
    auditId: toText(data?.auditId) || auditId,
    createdAt: toText(data?.createdAt),
    status: toText(data?.status),
    sessionId,
    auditStartedAt,
    zoneId,
    cleanValue,
    comment,
    deviceAt,
  }
}
