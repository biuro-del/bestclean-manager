import { ensureFirebase, waitForFirebaseAuthReady } from '../firebase/firebaseClient'

const CONSENT_VERSIONS = Object.freeze({
  TERMS: '2026-07-01',
  PRIVACY_POLICY: '2026-07-01',
  MARKETING: '2026-07-01',
})

const PAID_PLAN_CODES = new Set(['GO_PLUS', 'PLUS', 'PRO'])
const REGISTRATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/
const REGISTRATION_TOKEN_PATTERN = /^[A-Za-z0-9._~-]{40,100}$/
const IDEMPOTENCY_STORAGE_PREFIX = 'cleanzi.registration.company.'
const PENDING_REGISTRATION_STORAGE_KEY = 'cleanzi.registration.pending'
const REGISTRATION_TOKEN_STORAGE_PREFIX = 'cleanzi.registration.token.'

function text(value) {
  return String(value ?? '').trim()
}

function normalizeRegistrationId(value) {
  const registrationId = text(value)
  return REGISTRATION_ID_PATTERN.test(registrationId) ? registrationId : ''
}

function normalizeRegistrationToken(value) {
  const registrationToken = text(value)
  return REGISTRATION_TOKEN_PATTERN.test(registrationToken) ? registrationToken : ''
}

function readSessionStorage(key) {
  try {
    return text(sessionStorage.getItem(key))
  } catch {
    return ''
  }
}

function writeSessionStorage(key, value) {
  try {
    if (value) sessionStorage.setItem(key, value)
    else sessionStorage.removeItem(key)
  } catch {
    // Registration can still fail closed when storage is unavailable.
  }
}

function normalizeRegistrationApiBase(value) {
  const raw = text(value).replace(/\/+$/, '')
  if (!raw) return ''
  try {
    const url = new URL(raw)
    const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
    if (url.protocol !== 'https:' && !localHttp) return ''
    return url.toString().replace(/\/+$/, '')
  } catch {
    return ''
  }
}

function registrationApiBase() {
  return normalizeRegistrationApiBase(import.meta.env.VITE_REGISTRATION_API_BASE_URL)
}

function registrationPageUrl() {
  const configured = text(import.meta.env.VITE_REGISTRATION_PAGE_URL)
  if (configured) {
    try {
      const url = new URL(configured)
      if (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname))) {
        return url.toString()
      }
    } catch {
      // Use the public fallback below.
    }
  }
  return 'https://registration-cleanzi.web.app/rejestracja/'
}

function publicApiError(response, body) {
  const error = new Error(
    text(body?.error?.message) ||
    text(body?.message) ||
    'Nie udało się pobrać stanu rejestracji.',
  )
  error.code = text(body?.error?.code || body?.code) || 'REGISTRATION_API_ERROR'
  error.status = Number(response?.status) || 500
  error.details = body?.error?.details || body?.details
  return error
}

async function currentFirebaseUser() {
  const firebase = ensureFirebase()
  const user = firebase?.auth?.currentUser || (await waitForFirebaseAuthReady())
  if (!user) throw new Error('Sesja Firebase wygasła. Zaloguj się ponownie.')
  return user
}

async function registrationRequest(pathname, payload, { idempotencyKey = '', refreshToken = false } = {}) {
  const base = registrationApiBase()
  if (!base) {
    const error = new Error('Brak konfiguracji Registration API w portalu.')
    error.code = 'REGISTRATION_API_NOT_CONFIGURED'
    throw error
  }
  const user = await currentFirebaseUser()
  const response = await fetch(`${base}${pathname}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await user.getIdToken(refreshToken)}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify(payload || {}),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw publicApiError(response, body)
  return body?.data && typeof body.data === 'object' ? body.data : body
}

function normalizedPlanCode(value) {
  const planCode = text(value).toUpperCase().replace(/[+-]/g, '_').replace(/_+/g, '_')
  if (planCode === 'START') return 'PLUS'
  return ['TRIAL', 'GO_PLUS', 'PLUS', 'PRO'].includes(planCode) ? planCode : 'UNKNOWN'
}

function normalizedRegistration(source = {}) {
  const registrationId = normalizeRegistrationId(source.registrationId ?? source.id)
  const planCode = normalizedPlanCode(source.planCode ?? source.selectedPlanCode)
  if (!registrationId || planCode === 'UNKNOWN') return null
  const consents = Array.isArray(source.consents) ? source.consents : []
  const requiredConsentTypes = new Set(
    consents
      .filter((consent) => consent?.accepted === true)
      .map((consent) => text(consent?.type).toUpperCase()),
  )
  const consentsComplete = source.consentsComplete === true || source.consentsCompleted === true || (
    requiredConsentTypes.has('TERMS') && requiredConsentTypes.has('PRIVACY_POLICY')
  )
  return {
    ...source,
    registrationId,
    planCode,
    billingCycle: text(source.billingCycle).toUpperCase() || null,
    countryCode: text(source.countryCode).toUpperCase() || 'PL',
    status: text(source.status).toUpperCase(),
    email: text(source.email),
    owner: source.owner && typeof source.owner === 'object' ? source.owner : {},
    consents,
    consentsComplete,
    paid: PAID_PLAN_CODES.has(planCode),
  }
}

function unwrapRegistrations(data) {
  const list = Array.isArray(data?.registrations)
    ? data.registrations
    : Array.isArray(data)
      ? data
      : data?.registration
        ? [data.registration]
        : []
  return list.map(normalizedRegistration).filter(Boolean)
}

function displayNameParts(displayName, email = '') {
  const parts = text(displayName).split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
  if (parts.length === 1) return { firstName: parts[0], lastName: 'Użytkownik' }
  const emailName = text(email).split('@')[0].replace(/[._-]+/g, ' ').trim()
  const fallback = emailName || 'Użytkownik'
  return { firstName: fallback, lastName: 'Cleanzi' }
}

export function registrationEntryFromLocation(locationValue = window.location) {
  const url = new URL(locationValue.href)
  return {
    registrationId: normalizeRegistrationId(url.searchParams.get('registrationId')),
    googleRequested: text(url.searchParams.get('auth')).toLowerCase() === 'google',
  }
}

/**
 * Captures the public attempt id and a short-lived bind token before Firebase
 * redirect auth. The token is accepted only from the URL fragment, is removed
 * from the address bar immediately and is never copied into a query string.
 */
export function capturePendingRegistrationEntry(
  locationValue = window.location,
  historyValue = window.history,
) {
  const url = new URL(locationValue.href)
  const stored = (() => {
    try {
      return JSON.parse(readSessionStorage(PENDING_REGISTRATION_STORAGE_KEY))
    } catch {
      return null
    }
  })()
  const storedRegistrationId = normalizeRegistrationId(stored?.registrationId)
  const registrationId = normalizeRegistrationId(
    url.searchParams.get('registrationId') || storedRegistrationId,
  )
  const googleRequested = text(url.searchParams.get('auth')).toLowerCase() === 'google'
    || stored?.googleRequested === true

  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''))
  const fragmentToken = normalizeRegistrationToken(fragment.get('registrationToken'))
  const hadRegistrationToken = fragment.has('registrationToken')
  const shouldRemoveGoogleAuth = url.searchParams.has('auth')
  if (shouldRemoveGoogleAuth) url.searchParams.delete('auth')
  if (hadRegistrationToken) {
    fragment.delete('registrationToken')
    const nextFragment = fragment.toString()
    url.hash = nextFragment ? `#${nextFragment}` : ''
  }
  if (shouldRemoveGoogleAuth || hadRegistrationToken) {
    historyValue?.replaceState?.(historyValue.state, '', `${url.pathname}${url.search}${url.hash}`)
  }

  if (!registrationId) {
    writeSessionStorage(PENDING_REGISTRATION_STORAGE_KEY, '')
    return null
  }
  if (storedRegistrationId && storedRegistrationId !== registrationId) {
    writeSessionStorage(`${REGISTRATION_TOKEN_STORAGE_PREFIX}${storedRegistrationId}`, '')
    writeSessionStorage(`${IDEMPOTENCY_STORAGE_PREFIX}${storedRegistrationId}`, '')
  }
  if (fragmentToken) {
    writeSessionStorage(`${REGISTRATION_TOKEN_STORAGE_PREFIX}${registrationId}`, fragmentToken)
  }
  const pending = { registrationId, googleRequested }
  writeSessionStorage(PENDING_REGISTRATION_STORAGE_KEY, JSON.stringify(pending))
  return pending
}

export function getPendingRegistrationEntry() {
  try {
    const stored = JSON.parse(readSessionStorage(PENDING_REGISTRATION_STORAGE_KEY))
    const registrationId = normalizeRegistrationId(stored?.registrationId)
    return registrationId
      ? { registrationId, googleRequested: stored?.googleRequested === true }
      : null
  } catch {
    return null
  }
}

export function hasPendingRegistrationBindToken(registrationId = '') {
  const normalizedId = normalizeRegistrationId(registrationId || getPendingRegistrationEntry()?.registrationId)
  return Boolean(
    normalizedId && normalizeRegistrationToken(
      readSessionStorage(`${REGISTRATION_TOKEN_STORAGE_PREFIX}${normalizedId}`),
    ),
  )
}

export function markPendingGoogleAuthStarted() {
  const pending = getPendingRegistrationEntry()
  if (!pending) return
  writeSessionStorage(PENDING_REGISTRATION_STORAGE_KEY, JSON.stringify({
    ...pending,
    googleRequested: false,
  }))
}

export function clearPendingRegistrationEntry(registrationId = '') {
  const pending = getPendingRegistrationEntry()
  const normalizedId = normalizeRegistrationId(registrationId || pending?.registrationId)
  writeSessionStorage(PENDING_REGISTRATION_STORAGE_KEY, '')
  if (normalizedId) {
    writeSessionStorage(`${REGISTRATION_TOKEN_STORAGE_PREFIX}${normalizedId}`, '')
    writeSessionStorage(`${IDEMPOTENCY_STORAGE_PREFIX}${normalizedId}`, '')
  }
}

export function getRegistrationPageUrl() {
  return registrationPageUrl()
}

export function isRegistrationApiConfigured() {
  return Boolean(registrationApiBase())
}

export async function bindRegistrationAccount(registrationId, ownerValues = {}) {
  const normalizedId = normalizeRegistrationId(registrationId)
  const user = await currentFirebaseUser()
  const fallbackOwner = displayNameParts(user.displayName, user.email)
  const owner = {
    firstName: text(ownerValues.firstName) || fallbackOwner.firstName,
    lastName: text(ownerValues.lastName) || fallbackOwner.lastName,
  }
  const phone = text(ownerValues.phone)
  const locale = ['pl-PL', 'en-US'].includes(text(ownerValues.locale))
    ? text(ownerValues.locale)
    : /^en(?:-|$)/i.test(navigator.language || '') ? 'en-US' : 'pl-PL'
  const timezone = text(ownerValues.timezone)
    || Intl.DateTimeFormat().resolvedOptions().timeZone
    || 'Europe/Warsaw'
  const registrationToken = normalizeRegistrationToken(
    readSessionStorage(`${REGISTRATION_TOKEN_STORAGE_PREFIX}${normalizedId}`),
  )
  const result = await registrationRequest('/api/registration/account', {
    registrationId: normalizedId,
    ...(registrationToken ? { registrationToken } : {}),
    owner: { ...owner, ...(phone ? { phone } : {}), locale, timezone },
  }, { refreshToken: true })
  // The access token is single-purpose. The server clears its hash on bind and
  // the browser removes its copy only after the bind succeeded.
  writeSessionStorage(`${REGISTRATION_TOKEN_STORAGE_PREFIX}${normalizedId}`, '')
  return result
}

export const bindGoogleRegistrationAccount = bindRegistrationAccount

export async function resumeRegistrations(registrationId = '') {
  const normalizedId = normalizeRegistrationId(registrationId)
  const data = await registrationRequest('/api/registration/resume', normalizedId ? { registrationId: normalizedId } : {})
  return unwrapRegistrations(data)
}

export async function saveRegistrationConsents(registrationId, values) {
  const consents = [
    { type: 'TERMS', version: CONSENT_VERSIONS.TERMS, accepted: values?.terms === true },
    { type: 'PRIVACY_POLICY', version: CONSENT_VERSIONS.PRIVACY_POLICY, accepted: values?.privacy === true },
    { type: 'MARKETING', version: CONSENT_VERSIONS.MARKETING, accepted: values?.marketing === true },
  ]
  return registrationRequest('/api/registration/consents', {
    registrationId: normalizeRegistrationId(registrationId),
    consents,
  })
}

export function verifyRegistration(registrationId) {
  return registrationRequest('/api/registration/verify', {
    registrationId: normalizeRegistrationId(registrationId),
  }, { refreshToken: true })
}

export async function lookupRegistrationCompany(taxIdValue) {
  const data = await registrationRequest('/api/company/lookup', {
    countryCode: 'PL',
    taxIdType: 'NIP',
    taxIdValue: text(taxIdValue),
  })
  return data?.company && typeof data.company === 'object' ? data.company : data
}

function stableCompanyIdempotencyKey(registrationId) {
  const normalizedId = normalizeRegistrationId(registrationId)
  const storageKey = `${IDEMPOTENCY_STORAGE_PREFIX}${normalizedId}`
  let value = readSessionStorage(storageKey)
  if (!value) {
    value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
    writeSessionStorage(storageKey, value)
  }
  return value
}

export function completeRegistrationCompany(registrationId, company) {
  return registrationRequest('/api/registration/complete-company', {
    registrationId: normalizeRegistrationId(registrationId),
    company,
  }, { idempotencyKey: stableCompanyIdempotencyKey(registrationId), refreshToken: true })
}

export function isSafeStripeCheckoutUrl(value) {
  try {
    const url = new URL(text(value))
    return url.protocol === 'https:' && url.hostname === 'checkout.stripe.com'
  } catch {
    return false
  }
}

export { CONSENT_VERSIONS }
