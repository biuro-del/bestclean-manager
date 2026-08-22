import {
  GoogleAuthProvider,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  TotpMultiFactorGenerator,
  getMultiFactorResolver,
  isSignInWithEmailLink,
  multiFactor,
  sendSignInLinkToEmail,
  sendPasswordResetEmail,
  signInWithEmailLink,
  signInWithEmailAndPassword,
  signInWithCredential,
  signOut,
} from 'firebase/auth'
import { getFunctions, httpsCallable } from 'firebase/functions'
import {
  ensureFirebase,
  ensureFirebaseAuthPersistence,
  getFirebaseAppCheckToken,
  isFirebaseConfigured,
  waitForFirebaseAuthReady,
} from '../firebase/firebaseClient'
import { renderSubscriptionBadge } from '../ui/subscriptionBadge'

const AUTH_STORAGE_KEY = 'iclean.portal.auth'
const LAST_ORG_STORAGE_KEY = 'iclean.portal.lastOrgId'
const PLATFORM_CONTEXT_STORAGE_KEY = 'iclean.portal.platformContextId'
const PLATFORM_EMAIL_MFA_TOKEN_KEY = 'iclean.portal.platformEmailMfaToken'
const CLEANING_COMPANY_EMAIL_LINK_EMAIL_KEY = 'iclean.portal.cleaningCompanyEmailLinkEmail'
const AUTH_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const AUTH_EMAIL_MAX_LENGTH = 160
const CENTRAL_REGISTRATION_FUNCTIONS_REGION = 'europe-west1'
const CENTRAL_REGISTRATION_ISSUER_NAME = 'issueCleaningCompanyRegistrationGrant'
const GOOGLE_IDENTITY_SCRIPT_URL = 'https://accounts.google.com/gsi/client'
const CENTRAL_REGISTRATION_ISSUER_READY = String(import.meta.env.VITE_CENTRAL_REGISTRATION_ISSUER_READY ?? '')
  .trim()
  .toLowerCase() === 'true'
const CENTRAL_REGISTRATION_GOOGLE_CLIENT_ID = String(import.meta.env.VITE_CENTRAL_REGISTRATION_GOOGLE_CLIENT_ID ?? '').trim()
export const CLEANING_COMPANY_LEGAL_DOCUMENTS = Object.freeze({
  terms: Object.freeze({
    documentId: 'terms',
    version: '2026-07-16',
    url: 'https://cleanzi.pl/regulamin',
  }),
  privacy: Object.freeze({
    documentId: 'privacy',
    version: '2026-07-30',
    url: 'https://cleanzi.pl/polityka-prywatnosci',
  }),
})
let pendingMfaResolver = null
let pendingMfaEnrollment = null
let pendingRecaptchaVerifier = null
let googleIdentityScriptPromise = null

function toText(value) {
  return String(value ?? '').trim()
}

function createPublicAuthError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function normalizeAuthEmail(value) {
  const email = toText(value).toLowerCase()
  return email.length <= AUTH_EMAIL_MAX_LENGTH && AUTH_EMAIL_PATTERN.test(email) ? email : ''
}

function parseSession(raw) {
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function mapRole(dcRole) {
  const normalized = toText(dcRole).toUpperCase()

  if (normalized === 'OWNER') {
    return 'Owner'
  }

  if (normalized === 'PLATFORM_OWNER') {
    return 'Platform owner'
  }

  if (normalized === 'ADMIN' || normalized === 'SUPERADMIN') {
    return 'Admin'
  }

  if (normalized === 'MANAGER' || normalized === 'KIEROWNIK') {
    return 'Manager'
  }

  if (normalized === 'WORKER' || normalized === 'PRACOWNIK') {
    return 'Pracownik'
  }

  if (normalized === 'COORDINATOR' || normalized === 'KOORDYNATOR' || normalized === 'MEMBER') {
    return 'Koordynator'
  }

  if (normalized === 'INTERN' || normalized === 'STAZYSTA' || normalized === 'STAŻYSTA') {
    return 'Stazysta'
  }

  return 'Koordynator'
}

function normalizeRoleText(value) {
  const lowered = toText(value).toLowerCase()
  const normalized = typeof lowered.normalize === 'function' ? lowered.normalize('NFD') : lowered
  return normalized.replace(/[\u0300-\u036f]/g, '')
}

function isWorkerPortalRole(role) {
  const normalized = normalizeRoleText(role)
  return normalized === 'worker' || normalized === 'pracownik' || normalized.includes('worker') || normalized.includes('pracownik')
}

function assertPortalAccessAllowed(context) {
  if (isWorkerPortalRole(context?.role)) {
    throw new Error('Rola WORKER nie ma dostępu do portalu. Dla pracowników użyj aplikacji mobilnej.')
  }
}

function normalizeApiBase(value) {
  const raw = toText(value)
  if (!raw) return '/api'
  if (raw.startsWith('/')) {
    const withoutTrailing = raw.replace(/\/+$/, '')
    return withoutTrailing.endsWith('/api') ? withoutTrailing : `${withoutTrailing}/api`
  }

  const withoutTrailing = raw.replace(/\/+$/, '')
  return withoutTrailing.endsWith('/api') ? withoutTrailing : `${withoutTrailing}/api`
}

function getAuthApiBase() {
  return normalizeApiBase(import.meta.env.VITE_ADMIN_API_BASE || '/api')
}

export function platformEmailMfaHeaders() {
  const token = toText(sessionStorage.getItem(PLATFORM_EMAIL_MFA_TOKEN_KEY))
  return token ? { 'X-Platform-Email-Mfa-Token': token } : {}
}

function createBackendError(response, body) {
  const message =
    toText(body?.error?.message) ||
    (response.status === 403
      ? 'Brak uprawnień do portalu dla tego konta.'
      : 'Nie udało się zweryfikować dostępu do organizacji.')
  const error = new Error(message)
  error.code = toText(body?.error?.code) || 'AUTH_CONTEXT_ERROR'
  error.status = response.status
  return error
}

async function requestSessionContext(firebaseUser, { orgId = '', method = 'GET' } = {}) {
  if (!firebaseUser) {
    throw new Error('Brak aktywnej sesji Firebase.')
  }

  const normalizedOrgId = toText(orgId)
  const normalizedMethod = normalizedOrgId && method === 'POST' ? 'POST' : 'GET'
  const idToken = await firebaseUser.getIdToken()
  const url =
    normalizedMethod === 'GET' && normalizedOrgId
      ? `${getAuthApiBase()}/auth/session-context?orgId=${encodeURIComponent(normalizedOrgId)}`
      : `${getAuthApiBase()}/auth/session-context`
  const response = await fetch(url, {
    method: normalizedMethod,
    headers: {
      Authorization: `Bearer ${idToken}`,
      Accept: 'application/json',
      ...(toText(localStorage.getItem(PLATFORM_CONTEXT_STORAGE_KEY))
        ? { 'X-Platform-Context-Id': toText(localStorage.getItem(PLATFORM_CONTEXT_STORAGE_KEY)) }
        : {}),
      ...platformEmailMfaHeaders(),
      ...(normalizedMethod === 'POST' ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(normalizedMethod === 'POST' ? { body: JSON.stringify({ orgId: normalizedOrgId }) } : {}),
  })
  const body = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw createBackendError(response, body)
  }

  const payload = body?.data && typeof body.data === 'object' ? body.data : body
  const status = toText(payload?.status).toUpperCase()

  if (status === 'READY') {
    const context = payload?.context ?? {}
    const platformActor = toText(context.actorType).toUpperCase() === 'PLATFORM'
    if (
      toText(context.uid) !== toText(firebaseUser.uid) ||
      !toText(context.activeOrgId) ||
      !toText(context.organizationName) ||
      (!platformActor && !toText(context.workerId)) ||
      !toText(context.role) ||
      !toText(context.planCode)
    ) {
      throw new Error('Backend zwrócił niepełny kontekst sesji.')
    }
    assertPortalAccessAllowed(context)
    return { status: 'READY', context }
  }

  if (status === 'PLATFORM_SELECTION_REQUIRED' || status === 'PLATFORM_MFA_ENROLLMENT_REQUIRED') {
    return {
      status,
      context: payload?.context && typeof payload.context === 'object' ? payload.context : {},
    }
  }

  if (status === 'CLEANING_COMPANY_ONBOARDING_REQUIRED') {
    // This status comes only from the session-context endpoint. The browser
    // must not synthesize it from local storage or an OAuth callback.
    return {
      status,
      onboarding: payload?.onboarding && typeof payload.onboarding === 'object' ? payload.onboarding : {},
    }
  }

  if (status === 'ORG_SELECTION_REQUIRED') {
    const organizations = (Array.isArray(payload?.organizations) ? payload.organizations : [])
      .map((organization) => ({
        orgId: toText(organization?.orgId),
        organizationName: toText(organization?.organizationName),
        role: toText(organization?.role).toUpperCase(),
      }))
      .filter((organization) => organization.orgId && organization.organizationName && organization.role)

    if (organizations.length < 2) {
      throw new Error('Backend zwrócił niepoprawną listę organizacji.')
    }

    return { status: 'ORG_SELECTION_REQUIRED', organizations }
  }

  throw new Error('Backend zwrócił nieznany status kontekstu sesji.')
}

function buildSessionFromFirebase(user, context) {
  const activeOrgId = toText(context.activeOrgId)
  const organizationName = toText(context.organizationName)
  localStorage.setItem(LAST_ORG_STORAGE_KEY, activeOrgId)
  if (toText(context.platformContextId)) {
    localStorage.setItem(PLATFORM_CONTEXT_STORAGE_KEY, toText(context.platformContextId))
  }

  return {
    token: `firebase-${user.uid}`,
    uid: user.uid,
    login: user.email ?? user.uid,
    name: user.displayName ?? user.email ?? user.uid,
    role: mapRole(context.role),
    roleCode: toText(context.role).toUpperCase(),
    workerId: toText(context.workerId),
    actorType: toText(context.actorType).toUpperCase() || 'ORGANIZATION',
    roleLevel: Number(context.roleLevel) || undefined,
    planCode: toText(context.planCode).toUpperCase(),
    subscriptionStatus: toText(context.subscriptionStatus).toUpperCase(),
    subscriptionEndsAt: toText(context.subscriptionEndsAt),
    activeOrgId,
    organizationName,
    orgId: activeOrgId,
    orgName: organizationName,
    platformContextId: toText(context.platformContextId),
    platformReason: toText(context.platformReason),
    capabilities: context.capabilities && typeof context.capabilities === 'object' ? context.capabilities : {},
    source: 'firebase',
  }
}

function storeReadySession(firebaseUser, context) {
  const session = buildSessionFromFirebase(firebaseUser, context)
  saveSession(session)
  renderSubscriptionBadge(session)
  return { status: 'READY', session }
}

async function resolveAuthenticatedContext(firebaseUser, options = {}) {
  const result = await requestSessionContext(firebaseUser, options)
  if (result.status === 'READY') {
    return storeReadySession(firebaseUser, result.context)
  }

  localStorage.removeItem(AUTH_STORAGE_KEY)
  if (
    result.status === 'PLATFORM_SELECTION_REQUIRED' ||
    result.status === 'CLEANING_COMPANY_ONBOARDING_REQUIRED'
  ) {
    localStorage.removeItem(LAST_ORG_STORAGE_KEY)
    localStorage.removeItem(PLATFORM_CONTEXT_STORAGE_KEY)
  }
  return result
}

function isAccessDeniedError(error) {
  return Number(error?.status) === 403 || toText(error?.code) === 'ORG_ACCESS_DENIED'
}

export function getSession() {
  const session = parseSession(localStorage.getItem(AUTH_STORAGE_KEY))

  if (!isFirebaseConfigured()) {
    return session
  }

  const firebase = ensureFirebase()
  const currentUser = firebase?.auth?.currentUser ?? null
  if (!currentUser || session?.uid !== currentUser.uid || !toText(session?.activeOrgId ?? session?.orgId)) {
    return null
  }

  return session
}

export async function ensureSessionContext(session = null) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  const firebase = ensureFirebase()
  const currentUser = firebase?.auth?.currentUser || (await waitForFirebaseAuthReady())
  if (!currentUser) {
    return null
  }

  const rememberedOrgId = toText(session?.activeOrgId ?? session?.orgId ?? localStorage.getItem(LAST_ORG_STORAGE_KEY))

  try {
    if (rememberedOrgId) {
      try {
        return await resolveAuthenticatedContext(currentUser, { orgId: rememberedOrgId })
      } catch (error) {
        if (!isAccessDeniedError(error)) {
          throw error
        }
        localStorage.removeItem(LAST_ORG_STORAGE_KEY)
      }
    }

    return await resolveAuthenticatedContext(currentUser)
  } catch (error) {
    localStorage.removeItem(AUTH_STORAGE_KEY)
    throw error
  }
}

export function saveSession(session) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
}

export async function login({ login: loginValue, password }) {
  const normalizedLogin = toText(loginValue)
  const normalizedPassword = toText(password)

  if (!normalizedLogin || !normalizedPassword) {
    throw new Error('Podaj email i hasło.')
  }

  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  const firebase = ensureFirebase()
  if (!firebase) {
    throw new Error('Brak konfiguracji Firebase.')
  }

  await ensureFirebaseAuthPersistence()
  let credential
  try {
    credential = await signInWithEmailAndPassword(firebase.auth, normalizedLogin, normalizedPassword)
  } catch (error) {
    if (toText(error?.code).toLowerCase() !== 'auth/multi-factor-auth-required') throw error
    pendingMfaResolver = getMultiFactorResolver(firebase.auth, error)
    return {
      status: 'MFA_CHALLENGE_REQUIRED',
      factors: pendingMfaResolver.hints.map((hint) => ({
        uid: toText(hint.uid),
        factorId: toText(hint.factorId),
        displayName: toText(hint.displayName),
        phoneNumber: toText(hint.phoneNumber),
      })),
    }
  }
  localStorage.removeItem(AUTH_STORAGE_KEY)
  sessionStorage.removeItem(PLATFORM_EMAIL_MFA_TOKEN_KEY)

  try {
    // Provisioning or role changes update custom claims outside the browser.
    // Always obtain a fresh token before resolving the backend session.
    await credential.user.getIdToken(true)
    return await resolveAuthenticatedContext(credential.user)
  } catch (error) {
    await signOut(firebase.auth)
    localStorage.removeItem(AUTH_STORAGE_KEY)
    localStorage.removeItem(LAST_ORG_STORAGE_KEY)
    throw error
  }
}

function assertCentralRegistrationIssuerReady({ requiresGoogle = false } = {}) {
  if (!CENTRAL_REGISTRATION_ISSUER_READY) {
    throw createPublicAuthError(
      'REGISTRATION_ISSUER_NOT_READY',
      'Bezpieczna rejestracja firmy nie jest jeszcze gotowa. Spróbuj ponownie później.',
    )
  }
  if (requiresGoogle && !CENTRAL_REGISTRATION_GOOGLE_CLIENT_ID) {
    throw createPublicAuthError(
      'GOOGLE_REGISTRATION_NOT_READY',
      'Rejestracja przez Google nie jest jeszcze poprawnie skonfigurowana.',
    )
  }
}

async function requireCleaningCompanyAppCheckToken() {
  const appCheckToken = await getFirebaseAppCheckToken()
  if (!appCheckToken) {
    throw createPublicAuthError(
      'APP_CHECK_NOT_READY',
      'Nie udało się potwierdzić bezpieczeństwa rejestracji. Odśwież stronę i spróbuj ponownie.',
    )
  }
  return appCheckToken
}

function issuerErrorText(error) {
  return [error?.details?.code, error?.message, error?.code]
    .map((value) => toText(value).toUpperCase())
    .filter(Boolean)
    .join(' ')
}

function mapCentralRegistrationIssuerError(error) {
  const code = issuerErrorText(error)
  if (code.includes('REGISTRATION_GRANT_ALREADY_ISSUED')) {
    return createPublicAuthError(
      'REGISTRATION_GRANT_ALREADY_ISSUED',
      'Link rejestracyjny został już przygotowany. Użyj najnowszego linku z wiadomości e-mail albo spróbuj ponownie po jego wygaśnięciu.',
    )
  }
  if (code.includes('APP_CHECK') || code.includes('UNAUTHENTICATED')) {
    return createPublicAuthError(
      'APP_CHECK_NOT_READY',
      'Nie udało się potwierdzić bezpieczeństwa rejestracji. Odśwież stronę i spróbuj ponownie.',
    )
  }
  return createPublicAuthError(
    'REGISTRATION_ISSUER_UNAVAILABLE',
    'Nie udało się bezpiecznie rozpocząć rejestracji. Spróbuj ponownie za chwilę.',
  )
}

async function issueCleaningCompanyRegistrationGrant(firebase, payload) {
  assertCentralRegistrationIssuerReady()
  await requireCleaningCompanyAppCheckToken()
  if (!firebase?.app) {
    throw createPublicAuthError('FIREBASE_AUTH_UNAVAILABLE', 'Rejestracja firmy jest chwilowo niedostępna.')
  }

  try {
    const issuer = httpsCallable(
      getFunctions(firebase.app, CENTRAL_REGISTRATION_FUNCTIONS_REGION),
      CENTRAL_REGISTRATION_ISSUER_NAME,
    )
    await issuer(payload)
  } catch (error) {
    throw mapCentralRegistrationIssuerError(error)
  }
}

function createGoogleRegistrationNonce() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  if (typeof globalThis.crypto?.getRandomValues !== 'function') {
    throw createPublicAuthError('GOOGLE_IDENTITY_UNAVAILABLE', 'Rejestracja przez Google jest chwilowo niedostępna.')
  }
  const bytes = new Uint8Array(20)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}

async function loadGoogleIdentityLibrary() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw createPublicAuthError('GOOGLE_IDENTITY_UNAVAILABLE', 'Rejestracja przez Google wymaga przeglądarki.')
  }
  if (window.google?.accounts?.id) {
    return window.google.accounts.id
  }
  if (!googleIdentityScriptPromise) {
    googleIdentityScriptPromise = new Promise((resolve, reject) => {
      const finish = () => {
        const identity = window.google?.accounts?.id
        if (identity?.initialize && identity?.prompt) {
          resolve(identity)
          return
        }
        reject(createPublicAuthError('GOOGLE_IDENTITY_UNAVAILABLE', 'Rejestracja przez Google jest chwilowo niedostępna.'))
      }
      const existing = document.querySelector(`script[src="${GOOGLE_IDENTITY_SCRIPT_URL}"]`)
      if (existing) {
        existing.addEventListener('load', finish, { once: true })
        existing.addEventListener(
          'error',
          () => reject(createPublicAuthError('GOOGLE_IDENTITY_UNAVAILABLE', 'Rejestracja przez Google jest chwilowo niedostępna.')),
          { once: true },
        )
        return
      }

      const script = document.createElement('script')
      script.src = GOOGLE_IDENTITY_SCRIPT_URL
      script.async = true
      script.defer = true
      script.addEventListener('load', finish, { once: true })
      script.addEventListener(
        'error',
        () => reject(createPublicAuthError('GOOGLE_IDENTITY_UNAVAILABLE', 'Rejestracja przez Google jest chwilowo niedostępna.')),
        { once: true },
      )
      document.head.appendChild(script)
    })
  }
  return googleIdentityScriptPromise
}

async function requestGoogleRegistrationCredential() {
  assertCentralRegistrationIssuerReady({ requiresGoogle: true })
  const googleIdentity = await loadGoogleIdentityLibrary()
  const nonce = createGoogleRegistrationNonce()

  return new Promise((resolve, reject) => {
    let settled = false
    const settle = (callback, value) => {
      if (settled) return
      settled = true
      callback(value)
    }

    try {
      googleIdentity.initialize({
        client_id: CENTRAL_REGISTRATION_GOOGLE_CLIENT_ID,
        nonce,
        auto_select: false,
        cancel_on_tap_outside: true,
        callback: (response) => {
          const idToken = toText(response?.credential)
          if (!idToken) {
            settle(
              reject,
              createPublicAuthError('GOOGLE_ID_TOKEN_REQUIRED', 'Google nie zwrócił potwierdzenia tożsamości. Spróbuj ponownie.'),
            )
            return
          }
          settle(resolve, { idToken, nonce })
        },
      })
      googleIdentity.prompt((notification) => {
        const cancelled = notification?.isNotDisplayed?.() || notification?.isSkippedMoment?.()
        const dismissed = notification?.isDismissedMoment?.() && notification?.getDismissedReason?.() !== 'credential_returned'
        if (cancelled || dismissed) {
          settle(
            reject,
            createPublicAuthError('GOOGLE_ACCOUNT_SELECTION_CANCELLED', 'Wybór konta Google został anulowany. Spróbuj ponownie lub zarejestruj się e-mailem.'),
          )
        }
      })
    } catch {
      settle(
        reject,
        createPublicAuthError('GOOGLE_IDENTITY_UNAVAILABLE', 'Rejestracja przez Google jest chwilowo niedostępna.'),
      )
    }
  })
}

async function resolveFreshAuthenticatedUser(user) {
  localStorage.removeItem(AUTH_STORAGE_KEY)
  sessionStorage.removeItem(PLATFORM_EMAIL_MFA_TOKEN_KEY)

  try {
    // Google and e-mail-link sign-in can update the email-verification claim.
    // The server is still authoritative, but it must see the newest token.
    await user.getIdToken(true)
    return await resolveAuthenticatedContext(user)
  } catch (error) {
    const auth = ensureFirebase()?.auth
    if (auth) {
      await signOut(auth).catch(() => {})
    }
    localStorage.removeItem(AUTH_STORAGE_KEY)
    localStorage.removeItem(LAST_ORG_STORAGE_KEY)
    throw error
  }
}

function cleaningCompanyEmailLinkContinueUrl() {
  if (typeof window === 'undefined') {
    throw createPublicAuthError('EMAIL_LINK_BROWSER_REQUIRED', 'Otwórz link potwierdzający w przeglądarce.')
  }

  const current = new URL(window.location.href)
  current.search = ''
  current.hash = ''
  current.searchParams.set('cleanziCompanyEmailLink', '1')
  return current.toString()
}

export function isCleaningCompanyEmailLink() {
  if (typeof window === 'undefined' || !isFirebaseConfigured()) {
    return false
  }

  const firebase = ensureFirebase()
  try {
    return Boolean(firebase?.auth && isSignInWithEmailLink(firebase.auth, window.location.href))
  } catch {
    return false
  }
}

export function getStoredCleaningCompanyEmailLinkEmail() {
  return normalizeAuthEmail(localStorage.getItem(CLEANING_COMPANY_EMAIL_LINK_EMAIL_KEY))
}

export async function startCleaningCompanyGoogleSignIn() {
  if (!isFirebaseConfigured()) {
    throw createPublicAuthError('FIREBASE_NOT_CONFIGURED', 'Rejestracja przez Google jest chwilowo niedostępna.')
  }

  const firebase = ensureFirebase()
  if (!firebase?.auth) {
    throw createPublicAuthError('FIREBASE_AUTH_UNAVAILABLE', 'Rejestracja przez Google jest chwilowo niedostępna.')
  }

  await assertCleaningCompanyRegistrationAvailable()
  await ensureFirebaseAuthPersistence()
  const { idToken, nonce } = await requestGoogleRegistrationCredential()
  // The global Firebase beforeCreate gate consumes this grant during the next
  // operation. Do not replace this credential flow with a direct Firebase
  // popup: it would try to create the user before the issuer can grant it.
  await issueCleaningCompanyRegistrationGrant(firebase, {
    providerId: 'google.com',
    googleIdToken: idToken,
    googleNonce: nonce,
  })
  const credential = await signInWithCredential(firebase.auth, GoogleAuthProvider.credential(idToken))
  return resolveFreshAuthenticatedUser(credential.user)
}

export async function requestCleaningCompanyEmailLink(emailValue) {
  const email = normalizeAuthEmail(emailValue)
  if (!email) {
    throw createPublicAuthError('INVALID_COMPANY_EMAIL', 'Podaj poprawny adres email.')
  }
  if (!isFirebaseConfigured()) {
    throw createPublicAuthError('FIREBASE_NOT_CONFIGURED', 'Rejestracja e-mailem jest chwilowo niedostępna.')
  }

  const firebase = ensureFirebase()
  if (!firebase?.auth) {
    throw createPublicAuthError('FIREBASE_AUTH_UNAVAILABLE', 'Rejestracja e-mailem jest chwilowo niedostępna.')
  }

  await assertCleaningCompanyRegistrationAvailable()
  await ensureFirebaseAuthPersistence()
  // A valid grant must exist before the Firebase e-mail link can create a
  // first account. The issuer and the blocking gate keep the grant private.
  await issueCleaningCompanyRegistrationGrant(firebase, {
    providerId: 'emailLink',
    email,
  })
  try {
    await sendSignInLinkToEmail(firebase.auth, email, {
      url: cleaningCompanyEmailLinkContinueUrl(),
      handleCodeInApp: true,
    })
    // This only remembers where to finish the cryptographic Firebase link. It
    // never marks a company, consent, or portal session as created.
    localStorage.setItem(CLEANING_COMPANY_EMAIL_LINK_EMAIL_KEY, email)
    return { email }
  } catch (error) {
    const code = toText(error?.code).toLowerCase()
    if (
      code === 'auth/unauthorized-continue-uri' ||
      code === 'auth/unauthorized-domain' ||
      code === 'auth/operation-not-allowed'
    ) {
      throw createPublicAuthError(
        'COMPANY_EMAIL_LINK_NOT_CONFIGURED',
        'Rejestracja e-mailem nie jest jeszcze poprawnie skonfigurowana dla tej domeny.',
      )
    }
    if (code === 'auth/too-many-requests') {
      throw createPublicAuthError('COMPANY_EMAIL_LINK_RATE_LIMITED', 'Wysłano zbyt wiele linków. Spróbuj ponownie później.')
    }
    throw error
  }
}

export async function completeCleaningCompanyEmailLinkSignIn(emailValue) {
  if (!isCleaningCompanyEmailLink()) {
    throw createPublicAuthError('INVALID_COMPANY_EMAIL_LINK', 'Ten link potwierdzający jest nieprawidłowy lub wygasł.')
  }

  const email = normalizeAuthEmail(emailValue) || getStoredCleaningCompanyEmailLinkEmail()
  if (!email) {
    throw createPublicAuthError(
      'COMPANY_EMAIL_LINK_EMAIL_REQUIRED',
      'Wpisz adres email, na który został wysłany link potwierdzający.',
    )
  }

  const firebase = ensureFirebase()
  const credential = await signInWithEmailLink(firebase.auth, email, window.location.href)
  localStorage.removeItem(CLEANING_COMPANY_EMAIL_LINK_EMAIL_KEY)
  return resolveFreshAuthenticatedUser(credential.user)
}

function unwrapApiData(body) {
  return body?.data && typeof body.data === 'object' ? body.data : body
}

function normalizePublishedLegalDocument(candidate, kind) {
  const expected = CLEANING_COMPANY_LEGAL_DOCUMENTS[kind]
  const documentId = toText(candidate?.documentId)
  const version = toText(candidate?.version)
  const url = toText(candidate?.url)
  if (!documentId || !version || !url) {
    throw new Error('Serwer nie zwrócił kompletnej wersji dokumentów prawnych.')
  }

  let parsedUrl
  try {
    parsedUrl = new URL(url)
  } catch {
    throw new Error('Serwer zwrócił nieprawidłowy adres dokumentu prawnego.')
  }

  if (
    parsedUrl.protocol !== 'https:' ||
    parsedUrl.hostname !== 'cleanzi.pl' ||
    documentId !== expected.documentId ||
    version !== expected.version ||
    url !== expected.url
  ) {
    throw new Error('Serwer zwrócił nieprawidłowy dokument prawny.')
  }

  return Object.freeze({ documentId, version, url })
}

export async function getCleaningCompanyLegalDocuments() {
  const response = await fetch(`${getAuthApiBase()}/registration/cleaning-company/legal-documents`, {
    headers: { Accept: 'application/json' },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw createBackendError(response, body)
  }

  const payload = unwrapApiData(body)
  const documents = payload?.legalDocuments ?? payload?.documents ?? payload
  return Object.freeze({
    enabled: payload?.enabled === true && toText(payload?.status).toUpperCase() === 'REGISTRATION_AVAILABLE',
    terms: normalizePublishedLegalDocument(documents?.terms, 'terms'),
    privacy: normalizePublishedLegalDocument(documents?.privacy, 'privacy'),
  })
}

async function assertCleaningCompanyRegistrationAvailable() {
  const registration = await getCleaningCompanyLegalDocuments()
  if (!registration.enabled) {
    throw createPublicAuthError(
      'REGISTRATION_NOT_AVAILABLE',
      'Rejestracja firmy nie jest obecnie dostępna. Zaloguj się do istniejącego konta lub spróbuj ponownie później.',
    )
  }
  return registration
}

function normalizeCompanyOnboardingPayload(input = {}) {
  const documents = input?.legalDocuments && typeof input.legalDocuments === 'object'
    ? input.legalDocuments
    : {}
  return {
    commandId: toText(input?.commandId),
    nip: toText(input?.nip),
    legalName: toText(input?.legalName),
    declaredEmployeeCount: input?.declaredEmployeeCount,
    legalDocuments: {
      terms: {
        documentId: toText(documents?.terms?.documentId),
        version: toText(documents?.terms?.version),
        url: toText(documents?.terms?.url),
        accepted: documents?.terms?.accepted === true,
      },
      privacy: {
        documentId: toText(documents?.privacy?.documentId),
        version: toText(documents?.privacy?.version),
        url: toText(documents?.privacy?.url),
        acknowledged: documents?.privacy?.acknowledged === true,
      },
    },
    marketing: {
      email: input?.marketing?.email === true,
      sms: input?.marketing?.sms === true,
      phone: input?.marketing?.phone === true,
    },
  }
}

export async function completeCleaningCompanyOnboarding(input = {}) {
  const { user } = await currentFirebaseUserWithToken()
  const idToken = await user.getIdToken(true)
  const appCheckToken = await getFirebaseAppCheckToken()
  const response = await fetch(`${getAuthApiBase()}/registration/cleaning-company/provision`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(appCheckToken ? { 'X-Firebase-AppCheck': appCheckToken } : {}),
    },
    body: JSON.stringify(normalizeCompanyOnboardingPayload(input)),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw createBackendError(response, body)
  }

  const payload = unwrapApiData(body)
  if (payload?.ok === false || toText(payload?.status).toUpperCase() !== 'READY' || !payload?.context) {
    throw new Error('Serwer nie potwierdził utworzenia firmy.')
  }

  return {
    ...storeReadySession(user, payload.context),
    onboarding: payload?.onboarding && typeof payload.onboarding === 'object' ? payload.onboarding : {},
  }
}

function clearRecaptchaVerifier() {
  try {
    pendingRecaptchaVerifier?.clear?.()
  } catch {
    // Firebase may already have disposed the verifier.
  }
  pendingRecaptchaVerifier = null
}

function createRecaptchaVerifier(auth, containerId) {
  clearRecaptchaVerifier()
  pendingRecaptchaVerifier = new RecaptchaVerifier(auth, containerId, { size: 'invisible' })
  return pendingRecaptchaVerifier
}

export async function beginMfaSignInChallenge(factorUid, recaptchaContainerId = 'loginMfaRecaptcha') {
  if (!pendingMfaResolver) throw new Error('Brak oczekującego logowania MFA.')
  const hint = pendingMfaResolver.hints.find((item) => toText(item.uid) === toText(factorUid)) || pendingMfaResolver.hints[0]
  if (!hint) throw new Error('Nie znaleziono drugiego składnika.')
  if (toText(hint.factorId) !== 'phone') {
    return { factorUid: toText(hint.uid), factorId: toText(hint.factorId), verificationId: '' }
  }
  const firebase = ensureFirebase()
  const verifier = createRecaptchaVerifier(firebase.auth, recaptchaContainerId)
  const verificationId = await new PhoneAuthProvider(firebase.auth).verifyPhoneNumber(
    { multiFactorHint: hint, session: pendingMfaResolver.session },
    verifier,
  )
  return { factorUid: toText(hint.uid), factorId: toText(hint.factorId), verificationId }
}

export async function completeMfaSignIn({ factorUid, verificationCode, verificationId = '' }) {
  if (!pendingMfaResolver) throw new Error('Brak oczekującego logowania MFA.')
  const hint = pendingMfaResolver.hints.find((item) => toText(item.uid) === toText(factorUid)) || pendingMfaResolver.hints[0]
  if (!hint || !toText(verificationCode)) throw new Error('Podaj kod drugiego składnika.')
  const assertion = toText(hint.factorId) === 'phone'
    ? PhoneMultiFactorGenerator.assertion(PhoneAuthProvider.credential(verificationId, toText(verificationCode)))
    : TotpMultiFactorGenerator.assertionForSignIn(toText(hint.uid), toText(verificationCode))
  const credential = await pendingMfaResolver.resolveSignIn(assertion)
  pendingMfaResolver = null
  clearRecaptchaVerifier()
  return resolveAuthenticatedContext(credential.user)
}

export async function beginTotpEnrollment() {
  const user = ensureFirebase()?.auth?.currentUser || (await waitForFirebaseAuthReady())
  if (!user) throw new Error('Sesja Firebase wygasła.')
  const session = await multiFactor(user).getSession()
  const secret = await TotpMultiFactorGenerator.generateSecret(session)
  pendingMfaEnrollment = { type: 'totp', secret }
  return {
    secretKey: toText(secret.secretKey),
    qrCodeUrl: secret.generateQrCodeUrl(user.email || 'cleanzi', 'Cleanzi'),
  }
}

export async function completeTotpEnrollment(verificationCode) {
  if (pendingMfaEnrollment?.type !== 'totp') throw new Error('Najpierw rozpocznij konfigurację TOTP.')
  const user = ensureFirebase()?.auth?.currentUser
  if (!user) throw new Error('Sesja Firebase wygasła.')
  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(
    pendingMfaEnrollment.secret,
    toText(verificationCode),
  )
  await multiFactor(user).enroll(assertion, 'Cleanzi TOTP')
  pendingMfaEnrollment = null
  await user.getIdToken(true)
  return resolveAuthenticatedContext(user)
}

export async function beginPhoneMfaEnrollment(phoneNumber, recaptchaContainerId = 'loginMfaRecaptcha') {
  const firebase = ensureFirebase()
  const user = firebase?.auth?.currentUser || (await waitForFirebaseAuthReady())
  const phone = toText(phoneNumber)
  if (!user || !/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error('Podaj numer telefonu z kodem kraju, np. +48123123123.')
  const session = await multiFactor(user).getSession()
  const verifier = createRecaptchaVerifier(firebase.auth, recaptchaContainerId)
  const verificationId = await new PhoneAuthProvider(firebase.auth).verifyPhoneNumber(
    { phoneNumber: phone, session },
    verifier,
  )
  pendingMfaEnrollment = { type: 'phone', verificationId, phoneNumber: phone }
  return { verificationId, phoneNumber: phone }
}

export async function completePhoneMfaEnrollment(verificationCode) {
  if (pendingMfaEnrollment?.type !== 'phone') throw new Error('Najpierw wyślij kod SMS.')
  const user = ensureFirebase()?.auth?.currentUser
  if (!user) throw new Error('Sesja Firebase wygasła.')
  const credential = PhoneAuthProvider.credential(pendingMfaEnrollment.verificationId, toText(verificationCode))
  await multiFactor(user).enroll(PhoneMultiFactorGenerator.assertion(credential), 'Cleanzi SMS')
  pendingMfaEnrollment = null
  clearRecaptchaVerifier()
  await user.getIdToken(true)
  return resolveAuthenticatedContext(user)
}

export async function requestPasswordReset(emailValue) {
  const email = normalizeAuthEmail(emailValue)
  if (!email) {
    throw createPublicAuthError('INVALID_RESET_EMAIL', 'Podaj poprawny adres email.')
  }

  if (!isFirebaseConfigured()) {
    throw createPublicAuthError(
      'FIREBASE_NOT_CONFIGURED',
      'Resetowanie hasła jest chwilowo niedostępne z powodu braku konfiguracji Firebase.',
    )
  }

  const firebase = ensureFirebase()
  if (!firebase?.auth) {
    throw createPublicAuthError(
      'FIREBASE_AUTH_UNAVAILABLE',
      'Resetowanie hasła jest chwilowo niedostępne.',
    )
  }

  try {
    await sendPasswordResetEmail(firebase.auth, email)
  } catch (error) {
    const code = toText(error?.code).toLowerCase()

    // Nie ujawniamy, czy podany adres należy do istniejącego konta.
    if (code === 'auth/user-not-found') {
      return
    }
    if (code === 'auth/invalid-email') {
      throw createPublicAuthError('INVALID_RESET_EMAIL', 'Podaj poprawny adres email.')
    }
    if (code === 'auth/too-many-requests') {
      throw createPublicAuthError(
        'PASSWORD_RESET_RATE_LIMITED',
        'Wysłano zbyt wiele próśb. Spróbuj ponownie później.',
      )
    }
    if (code === 'auth/network-request-failed') {
      throw createPublicAuthError(
        'PASSWORD_RESET_NETWORK_ERROR',
        'Nie udało się połączyć z Firebase. Sprawdź połączenie z internetem i spróbuj ponownie.',
      )
    }
    if (
      code === 'auth/operation-not-allowed' ||
      code === 'auth/unauthorized-domain' ||
      code === 'auth/invalid-api-key' ||
      code === 'auth/app-not-authorized'
    ) {
      throw createPublicAuthError(
        'PASSWORD_RESET_NOT_CONFIGURED',
        'Resetowanie hasła nie jest poprawnie skonfigurowane w Firebase.',
      )
    }

    throw createPublicAuthError(
      'PASSWORD_RESET_FAILED',
      'Nie udało się wysłać linku do zresetowania hasła. Spróbuj ponownie.',
    )
  }
}

async function currentFirebaseUserWithToken() {
  const user = ensureFirebase()?.auth?.currentUser || (await waitForFirebaseAuthReady())
  if (!user) throw new Error('Sesja Firebase wygasła. Zaloguj się ponownie.')
  return { user, idToken: await user.getIdToken() }
}

async function platformEmailMfaRequest(pathname, payload) {
  const { user, idToken } = await currentFirebaseUserWithToken()
  const response = await fetch(`${getAuthApiBase()}/platform/mfa/email/${pathname}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw createBackendError(response, body)
  return { user, data: body?.data && typeof body.data === 'object' ? body.data : {} }
}

export async function requestPlatformEmailMfaCode(emailValue) {
  const email = normalizeAuthEmail(emailValue)
  if (!email) throw createPublicAuthError('INVALID_MFA_EMAIL', 'Podaj poprawny adres email.')
  const { data } = await platformEmailMfaRequest('request', { email })
  if (!toText(data.challengeId)) throw new Error('Backend nie zwrócił identyfikatora kodu email.')
  return data
}

export async function verifyPlatformEmailMfaCode({ challengeId, code }) {
  const normalizedCode = toText(code)
  if (!toText(challengeId) || !/^\d{6}$/.test(normalizedCode)) {
    throw createPublicAuthError('INVALID_EMAIL_MFA_CODE', 'Podaj sześciocyfrowy kod z wiadomości email.')
  }
  const { user, data } = await platformEmailMfaRequest('verify', {
    challengeId: toText(challengeId),
    code: normalizedCode,
  })
  const token = toText(data.emailMfaToken)
  if (!token) throw new Error('Backend nie zwrócił bezpiecznej sesji email MFA.')
  sessionStorage.setItem(PLATFORM_EMAIL_MFA_TOKEN_KEY, token)
  return resolveAuthenticatedContext(user)
}

export async function selectOrganization(orgId) {
  const normalizedOrgId = toText(orgId)
  if (!normalizedOrgId) {
    throw new Error('Wybierz organizację.')
  }

  const firebase = ensureFirebase()
  const currentUser = firebase?.auth?.currentUser || (await waitForFirebaseAuthReady())
  if (!currentUser) {
    throw new Error('Sesja Firebase wygasła. Zaloguj się ponownie.')
  }

  const result = await resolveAuthenticatedContext(currentUser, { orgId: normalizedOrgId, method: 'POST' })
  if (result.status !== 'READY') {
    throw new Error('Nie udało się zatwierdzić wybranej organizacji.')
  }
  return result
}

export async function acceptPlatformContext(context) {
  const user = ensureFirebase()?.auth?.currentUser || (await waitForFirebaseAuthReady())
  if (!user || toText(context?.actorType).toUpperCase() !== 'PLATFORM' || !toText(context?.platformContextId)) {
    throw new Error('Backend zwrócił niepoprawny kontekst administratora platformy.')
  }
  return storeReadySession(user, context)
}

export function clearPlatformContextSession() {
  localStorage.removeItem(AUTH_STORAGE_KEY)
  localStorage.removeItem(LAST_ORG_STORAGE_KEY)
  localStorage.removeItem(PLATFORM_CONTEXT_STORAGE_KEY)
  renderSubscriptionBadge(null)
}

export function logout() {
  const firebase = ensureFirebase()

  if (firebase?.auth?.currentUser) {
    void signOut(firebase.auth)
  }

  localStorage.removeItem(AUTH_STORAGE_KEY)
  localStorage.removeItem(LAST_ORG_STORAGE_KEY)
  localStorage.removeItem(PLATFORM_CONTEXT_STORAGE_KEY)
  localStorage.removeItem(CLEANING_COMPANY_EMAIL_LINK_EMAIL_KEY)
  sessionStorage.removeItem(PLATFORM_EMAIL_MFA_TOKEN_KEY)
  pendingMfaResolver = null
  pendingMfaEnrollment = null
  clearRecaptchaVerifier()
  renderSubscriptionBadge(null)
}

export function requireAuth() {
  return getSession()
}
