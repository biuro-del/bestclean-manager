import {
  EmailAuthProvider,
  GoogleAuthProvider,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  TotpMultiFactorGenerator,
  getMultiFactorResolver,
  isSignInWithEmailLink,
  linkWithCredential,
  multiFactor,
  reauthenticateWithCredential,
  reload,
  sendEmailVerification,
  sendSignInLinkToEmail,
  sendPasswordResetEmail,
  signInWithEmailLink,
  signInWithEmailAndPassword,
  signInWithRedirect,
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
import {
  ensurePlatformFirebase,
  ensurePlatformFirebaseAuthPersistence,
  isPlatformFirebaseConfigured,
  waitForPlatformFirebaseAuthReady,
} from '../../../../../Cleanzi-admin/frontend/platformFirebaseClient'
import { renderSubscriptionBadge } from '../ui/subscriptionBadge'
import { resolveAuthEmailDeliveryPolicy } from './authEmailDeliveryPolicy'
import { requestCentralRegistrationTurnstileToken } from './centralRegistrationTurnstile'

const AUTH_STORAGE_KEY = 'iclean.portal.auth'
const LAST_ORG_STORAGE_KEY = 'iclean.portal.lastOrgId'
const PLATFORM_CONTEXT_STORAGE_KEY = 'iclean.portal.platformContextId'
const PLATFORM_EMAIL_MFA_TOKEN_KEY = 'iclean.portal.platformEmailMfaToken'
const AUTH_SCOPE_STORAGE_KEY = 'iclean.portal.authScope'
const AUTH_SCOPE_ORGANIZATION = 'organization'
const AUTH_SCOPE_PLATFORM = 'platform'
const CLEANING_COMPANY_EMAIL_LINK_EMAIL_KEY = 'iclean.portal.cleaningCompanyEmailLinkEmail'
const AUTH_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const AUTH_EMAIL_MAX_LENGTH = 160
const CENTRAL_REGISTRATION_FUNCTIONS_REGION = 'europe-west1'
const CLEANING_COMPANY_REGISTRATION_ISSUER_NAME = 'issueCleaningCompanyRegistrationGrant'
const FACILITY_MANAGER_REGISTRATION_ISSUER_NAME = 'issueFacilityManagerRegistrationGrant'
const CLEANING_COMPANY_GOOGLE_CHALLENGE_NAME = 'beginCleaningCompanyGoogleRegistration'
const FACILITY_MANAGER_GOOGLE_CHALLENGE_NAME = 'beginFacilityManagerGoogleRegistration'
const FACILITY_MANAGER_REGISTRATION_ENDPOINT = '/api/registration/facility-manager'
const CLEANING_COMPANY_EXISTING_ACCOUNT_ENROLLMENT_ENDPOINT = '/registration/cleaning-company/resume'
const AUTH_EMAIL_DELIVERY_MODE = String(import.meta.env.VITE_AUTH_EMAIL_DELIVERY_MODE ?? '')
  .trim()
  .toLowerCase()
const GOOGLE_IDENTITY_SCRIPT_URL = 'https://accounts.google.com/gsi/client'
const GOOGLE_IDENTITY_LOAD_TIMEOUT_MS = 12000
const GOOGLE_ACCOUNT_SELECTION_TIMEOUT_MS = 120000
const CENTRAL_REGISTRATION_ISSUER_READY = String(import.meta.env.VITE_CENTRAL_REGISTRATION_ISSUER_READY ?? '')
  .trim()
  .toLowerCase() === 'true'
const CENTRAL_REGISTRATION_GOOGLE_CLIENT_ID = String(import.meta.env.VITE_CENTRAL_REGISTRATION_GOOGLE_CLIENT_ID ?? '').trim()
const FACILITY_MANAGER_ORGANIZATION_NAME_MAX_LENGTH = 120
const FACILITY_MANAGER_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,160}$/
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
let pendingAuthScope = ''
let googleIdentityScriptPromise = null
const PASSWORD_PROVIDER_ID = 'password'
const GOOGLE_PROVIDER_ID = 'google.com'

function toText(value) {
  return String(value ?? '').trim()
}

function normalizeAuthScope(value) {
  return toText(value).toLowerCase() === AUTH_SCOPE_PLATFORM ? AUTH_SCOPE_PLATFORM : AUTH_SCOPE_ORGANIZATION
}

function resolveAuthScope(session = null) {
  if (toText(session?.actorType).toUpperCase() === 'PLATFORM') return AUTH_SCOPE_PLATFORM
  if (toText(session?.authScope)) return normalizeAuthScope(session.authScope)
  if (pendingAuthScope) return normalizeAuthScope(pendingAuthScope)
  return normalizeAuthScope(localStorage.getItem(AUTH_SCOPE_STORAGE_KEY))
}

function isAuthScopeConfigured(scope) {
  return normalizeAuthScope(scope) === AUTH_SCOPE_PLATFORM ? isPlatformFirebaseConfigured() : isFirebaseConfigured()
}

function ensureFirebaseForScope(scope) {
  return normalizeAuthScope(scope) === AUTH_SCOPE_PLATFORM ? ensurePlatformFirebase() : ensureFirebase()
}

function ensurePersistenceForScope(scope) {
  return normalizeAuthScope(scope) === AUTH_SCOPE_PLATFORM
    ? ensurePlatformFirebaseAuthPersistence()
    : ensureFirebaseAuthPersistence()
}

function waitForAuthReadyForScope(scope) {
  return normalizeAuthScope(scope) === AUTH_SCOPE_PLATFORM
    ? waitForPlatformFirebaseAuthReady()
    : waitForFirebaseAuthReady()
}

async function currentUserForScope(scope) {
  const firebase = ensureFirebaseForScope(scope)
  return firebase?.auth?.currentUser || (await waitForAuthReadyForScope(scope))
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

function assertCleaningCompanyEmailDeliveryAllowed(firebase) {
  const policy = resolveAuthEmailDeliveryPolicy({
    projectId: firebase?.app?.options?.projectId,
    mode: AUTH_EMAIL_DELIVERY_MODE,
  })
  if (policy.allowed) return
  if (policy.code === 'AUTH_EMAIL_DELIVERY_DISABLED') {
    throw createPublicAuthError(
      'AUTH_EMAIL_DELIVERY_DISABLED',
      'Wysyłka wiadomości rejestracyjnych jest wyłączona w tym środowisku.',
    )
  }
  throw createPublicAuthError(
    'AUTH_EMAIL_TEST_DELIVERY_BLOCKED',
    'W środowisku testowym prawdziwe wiadomości są zablokowane. Użyj emulatora Firebase Auth.',
  )
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

function normalizeFacilityManagerOrganizationName(value) {
  const raw = typeof value === 'string' ? value : ''
  const name = (typeof raw.normalize === 'function' ? raw.normalize('NFC') : raw).trim()
  if (!name || name.length > FACILITY_MANAGER_ORGANIZATION_NAME_MAX_LENGTH) {
    const error = createPublicAuthError(
      'FACILITY_MANAGER_ORGANIZATION_NAME_REQUIRED',
      `Podaj nazwę panelu (maks. ${FACILITY_MANAGER_ORGANIZATION_NAME_MAX_LENGTH} znaków).`,
    )
    error.facilityManagerRegistrationValidation = true
    throw error
  }
  return name
}

function normalizeFacilityManagerIdempotencyKey(value) {
  const idempotencyKey = toText(value)
  if (!FACILITY_MANAGER_IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    const error = createPublicAuthError(
      'INVALID_FACILITY_MANAGER_IDEMPOTENCY_KEY',
      'Nie udało się bezpiecznie przygotować rejestracji. Odśwież stronę i spróbuj ponownie.',
    )
    error.facilityManagerRegistrationValidation = true
    throw error
  }
  return idempotencyKey
}

export function createFacilityManagerRegistrationIdempotencyKey() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `fm_${globalThis.crypto.randomUUID()}`
  }
  if (typeof globalThis.crypto?.getRandomValues !== 'function') {
    throw createPublicAuthError(
      'FACILITY_MANAGER_SECURE_RANDOM_UNAVAILABLE',
      'Ta przeglądarka nie obsługuje bezpiecznej rejestracji. Zaktualizuj ją i spróbuj ponownie.',
    )
  }
  const bytes = new Uint8Array(20)
  globalThis.crypto.getRandomValues(bytes)
  return `fm_${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`
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
        organizationKind: toText(organization?.organizationKind).toUpperCase(),
        role: toText(organization?.role).toUpperCase(),
      }))
      // organizationKind is additive. Existing cleaning-company organizations
      // may not have it yet, and must keep their established login path.
      .filter((organization) => organization.orgId && organization.organizationName && organization.role)

    if (organizations.length < 2) {
      throw new Error('Backend zwrócił niepoprawną listę organizacji.')
    }

    return { status: 'ORG_SELECTION_REQUIRED', organizations }
  }

  if (status === 'ORGANIZATION_ONBOARDING_REQUIRED') {
    return { status: 'ORGANIZATION_ONBOARDING_REQUIRED', organizations: [] }
  }

  if (status === 'EMAIL_VERIFICATION_REQUIRED') {
    return {
      status: 'EMAIL_VERIFICATION_REQUIRED',
      context: payload?.context && typeof payload.context === 'object' ? payload.context : {},
    }
  }

  throw new Error('Backend zwrócił nieznany status kontekstu sesji.')
}

function buildSessionFromFirebase(user, context) {
  const activeOrgId = toText(context.activeOrgId)
  const organizationName = toText(context.organizationName)
  const authScope = toText(context.actorType).toUpperCase() === 'PLATFORM'
    ? AUTH_SCOPE_PLATFORM
    : AUTH_SCOPE_ORGANIZATION
  localStorage.setItem(LAST_ORG_STORAGE_KEY, activeOrgId)
  localStorage.setItem(AUTH_SCOPE_STORAGE_KEY, authScope)
  if (toText(context.platformContextId)) {
    localStorage.setItem(PLATFORM_CONTEXT_STORAGE_KEY, toText(context.platformContextId))
  }

  return {
    token: `firebase-${user.uid}`,
    uid: user.uid,
    login: user.email ?? user.uid,
    name: user.displayName ?? user.email ?? user.uid,
    photoUrl: user.photoURL ?? '',
    role: mapRole(context.role),
    roleCode: toText(context.role).toUpperCase(),
    workerId: toText(context.workerId),
    actorType: toText(context.actorType).toUpperCase() || 'ORGANIZATION',
    roleLevel: Number(context.roleLevel) || undefined,
    planCode: toText(context.planCode).toUpperCase(),
    rawPlanCode: toText(context.rawPlanCode).toUpperCase(),
    planName: toText(context.planName),
    subscriptionStatus: toText(context.subscriptionStatus).toUpperCase(),
    subscriptionEndsAt: toText(context.subscriptionEndsAt),
    activeOrgId,
    organizationName,
    organizationKind: toText(context.organizationKind).toUpperCase(),
    orgId: activeOrgId,
    orgName: organizationName,
    platformContextId: toText(context.platformContextId),
    platformReason: toText(context.platformReason),
    capabilities: context.capabilities && typeof context.capabilities === 'object' ? context.capabilities : {},
    limits: context.limits && typeof context.limits === 'object' ? context.limits : {},
    usage: context.usage && typeof context.usage === 'object' ? context.usage : {},
    onboardingStatus: toText(context.onboardingStatus).toUpperCase(),
    onboardingRequired: context.onboardingRequired === true,
    organizations: Array.isArray(context.organizations) ? context.organizations : [],
    authScope,
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
  const authScope = resolveAuthScope(session)

  if (!isAuthScopeConfigured(authScope)) {
    return session
  }

  const firebase = ensureFirebaseForScope(authScope)
  const currentUser = firebase?.auth?.currentUser ?? null
  if (!currentUser || session?.uid !== currentUser.uid || !toText(session?.activeOrgId ?? session?.orgId)) {
    return null
  }

  return session
}

export async function ensureSessionContext(session = null) {
  const authScope = resolveAuthScope(session)
  if (!isAuthScopeConfigured(authScope)) {
    throw new Error(
      authScope === AUTH_SCOPE_PLATFORM
        ? 'Brak konfiguracji Firebase dla Panelu admina.'
        : 'Brak konfiguracji Firebase. Uzupełnij web-app/.env.',
    )
  }

  const currentUser = await currentUserForScope(authScope)
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

export function setOrganizationAuthScope() {
  pendingAuthScope = AUTH_SCOPE_ORGANIZATION
  localStorage.setItem(AUTH_SCOPE_STORAGE_KEY, AUTH_SCOPE_ORGANIZATION)
}

export async function login({
  login: loginValue,
  password,
  authScope = AUTH_SCOPE_ORGANIZATION,
  deferContext = false,
}) {
  const normalizedLogin = toText(loginValue)
  const normalizedPassword = toText(password)
  const normalizedAuthScope = normalizeAuthScope(authScope)

  if (!normalizedLogin || !normalizedPassword) {
    throw new Error('Podaj email i hasło.')
  }

  if (!isAuthScopeConfigured(normalizedAuthScope)) {
    throw new Error(
      normalizedAuthScope === AUTH_SCOPE_PLATFORM
        ? 'Brak konfiguracji Firebase dla Panelu admina.'
        : 'Brak konfiguracji Firebase. Uzupełnij web-app/.env.',
    )
  }

  const firebase = ensureFirebaseForScope(normalizedAuthScope)
  if (!firebase) {
    throw new Error('Brak konfiguracji Firebase.')
  }

  pendingAuthScope = normalizedAuthScope
  localStorage.setItem(AUTH_SCOPE_STORAGE_KEY, normalizedAuthScope)
  await ensurePersistenceForScope(normalizedAuthScope)
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
    if (deferContext && normalizedAuthScope === AUTH_SCOPE_ORGANIZATION) {
      return { status: 'AUTHENTICATED' }
    }
    return await resolveAuthenticatedContext(credential.user)
  } catch (error) {
    await signOut(firebase.auth)
    localStorage.removeItem(AUTH_STORAGE_KEY)
    localStorage.removeItem(LAST_ORG_STORAGE_KEY)
    throw error
  }
}

function providerIdsForAuthUser(user) {
  return new Set(
    (Array.isArray(user?.providerData) ? user.providerData : [])
      .map((provider) => toText(provider?.providerId))
      .filter(Boolean),
  )
}

function emailPasswordLoginStateForUser(user) {
  const email = normalizeAuthEmail(user?.email)
  const providerIds = providerIdsForAuthUser(user)
  return {
    uid: toText(user?.uid),
    email,
    emailVerified: Boolean(user?.emailVerified),
    hasGoogleProvider: providerIds.has(GOOGLE_PROVIDER_ID),
    hasPasswordProvider: providerIds.has(PASSWORD_PROVIDER_ID),
  }
}

async function currentOrganizationAuthUser() {
  if (resolveAuthScope() !== AUTH_SCOPE_ORGANIZATION) {
    throw createPublicAuthError(
      'PASSWORD_LINK_ORGANIZATION_SESSION_REQUIRED',
      'Ustawienie hasła jest dostępne po zalogowaniu do panelu firmy.',
    )
  }
  if (!isFirebaseConfigured()) {
    throw createPublicAuthError('FIREBASE_NOT_CONFIGURED', 'Brak konfiguracji Firebase.')
  }

  const firebase = ensureFirebase()
  const user = firebase?.auth?.currentUser || (await waitForFirebaseAuthReady())
  if (!firebase?.auth || !user) {
    throw createPublicAuthError('PASSWORD_LINK_SESSION_REQUIRED', 'Twoja sesja wygasła. Zaloguj się ponownie przez Google.')
  }
  return { firebase, user }
}

export async function getEmailPasswordLoginState() {
  const { user } = await currentOrganizationAuthUser()
  await reload(user)
  return emailPasswordLoginStateForUser(user)
}

function mapEmailPasswordLinkError(error) {
  const code = toText(error?.code).toLowerCase()
  if (
    code === 'password_link_organization_session_required' ||
    code === 'password_link_session_required' ||
    code === 'password_link_email_required' ||
    code === 'password_link_google_required' ||
    code === 'password_link_email_verification_required' ||
    code === 'password_link_uid_changed'
  ) {
    return error
  }
  if (code === 'auth/weak-password') {
    return createPublicAuthError('PASSWORD_LINK_WEAK_PASSWORD', 'Hasło musi mieć co najmniej 6 znaków.')
  }
  if (code === 'auth/requires-recent-login') {
    return createPublicAuthError(
      'PASSWORD_LINK_RECENT_LOGIN_REQUIRED',
      'Potwierdź ponownie konto Google i spróbuj jeszcze raz.',
    )
  }
  if (code === 'auth/user-mismatch') {
    return createPublicAuthError(
      'PASSWORD_LINK_GOOGLE_ACCOUNT_MISMATCH',
      'Wybierz w Google to samo konto, które jest zalogowane w portalu.',
    )
  }
  if (code === 'auth/email-already-in-use' || code === 'auth/credential-already-in-use') {
    return createPublicAuthError(
      'PASSWORD_LINK_ACCOUNT_CONFLICT',
      'Ten e-mail lub sposób logowania jest już przypisany do innego konta. Nie połączyliśmy kont automatycznie.',
    )
  }
  if (code === 'auth/operation-not-allowed') {
    return createPublicAuthError(
      'PASSWORD_LINK_NOT_CONFIGURED',
      'Logowanie e-mailem i hasłem nie jest poprawnie skonfigurowane.',
    )
  }
  if (code === 'auth/network-request-failed') {
    return createPublicAuthError(
      'PASSWORD_LINK_NETWORK_ERROR',
      'Nie udało się połączyć z Firebase. Sprawdź internet i spróbuj ponownie.',
    )
  }
  if (code === 'auth/too-many-requests') {
    return createPublicAuthError(
      'PASSWORD_LINK_RATE_LIMITED',
      'Wysłano zbyt wiele żądań. Spróbuj ponownie później.',
    )
  }
  if (code === 'google_account_selection_cancelled') {
    return createPublicAuthError('PASSWORD_LINK_GOOGLE_CANCELLED', 'Wybór konta Google został anulowany.')
  }
  return createPublicAuthError('PASSWORD_LINK_FAILED', 'Nie udało się ustawić hasła. Spróbuj ponownie.')
}

export async function linkEmailPasswordToCurrentUser(passwordValue) {
  const password = toText(passwordValue)
  if (password.length < 6) {
    throw createPublicAuthError('PASSWORD_LINK_WEAK_PASSWORD', 'Hasło musi mieć co najmniej 6 znaków.')
  }

  const { firebase, user } = await currentOrganizationAuthUser()
  await reload(user)
  const before = emailPasswordLoginStateForUser(user)

  if (before.hasPasswordProvider) {
    return { ...before, status: 'ALREADY_LINKED' }
  }
  if (!before.email) {
    throw createPublicAuthError('PASSWORD_LINK_EMAIL_REQUIRED', 'Na tym koncie brakuje poprawnego adresu e-mail.')
  }
  if (!before.emailVerified) {
    throw createPublicAuthError(
      'PASSWORD_LINK_EMAIL_VERIFICATION_REQUIRED',
      'Najpierw potwierdź adres e-mail przypisany do tego konta.',
    )
  }
  if (!before.hasGoogleProvider) {
    throw createPublicAuthError(
      'PASSWORD_LINK_GOOGLE_REQUIRED',
      'Aby ustawić pierwsze hasło, zaloguj się przez Google do tego konta.',
    )
  }

  const originalUid = before.uid
  try {
    const { idToken } = await requestGoogleSignInCredential()
    await reauthenticateWithCredential(user, GoogleAuthProvider.credential(idToken))

    const reauthenticatedUser = firebase.auth.currentUser
    if (!reauthenticatedUser || toText(reauthenticatedUser.uid) !== originalUid) {
      throw createPublicAuthError(
        'PASSWORD_LINK_UID_CHANGED',
        'Nie potwierdziliśmy tego samego konta. Nie ustawiliśmy hasła.',
      )
    }

    const credential = EmailAuthProvider.credential(before.email, password)
    const result = await linkWithCredential(reauthenticatedUser, credential)
    if (toText(result?.user?.uid) !== originalUid) {
      throw createPublicAuthError(
        'PASSWORD_LINK_UID_CHANGED',
        'Nie potwierdziliśmy tego samego konta. Nie ustawiliśmy hasła.',
      )
    }

    await reload(result.user)
    const after = emailPasswordLoginStateForUser(result.user)
    if (!after.hasGoogleProvider || !after.hasPasswordProvider) {
      throw createPublicAuthError('PASSWORD_LINK_FAILED', 'Nie potwierdziliśmy dodania metody logowania.')
    }
    await result.user.getIdToken(true)
    return { ...after, status: 'LINKED' }
  } catch (error) {
    if (toText(error?.code).toLowerCase() === 'auth/provider-already-linked') {
      const after = await getEmailPasswordLoginState()
      if (after.hasPasswordProvider) return { ...after, status: 'ALREADY_LINKED' }
    }
    throw mapEmailPasswordLinkError(error)
  }
}

export async function loginWithGoogle({ deferContext = false, forceRedirect = false } = {}) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }
  const firebase = ensureFirebase()
  if (!firebase?.auth) throw new Error('Brak konfiguracji Firebase.')
  pendingAuthScope = AUTH_SCOPE_ORGANIZATION
  localStorage.setItem(AUTH_SCOPE_STORAGE_KEY, AUTH_SCOPE_ORGANIZATION)
  await ensureFirebaseAuthPersistence()
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  const prefersRedirect = typeof window !== 'undefined' && (
    window.matchMedia?.('(max-width: 760px)')?.matches ||
    /Android|iPhone|iPad|iPod/i.test(window.navigator?.userAgent || '')
  )
  if (forceRedirect || prefersRedirect) {
    await signInWithRedirect(firebase.auth, provider)
    return { status: 'REDIRECTING' }
  }
  // Desktop popup hand-offs can fail before Firebase receives the Google
  // result. Use the already-configured Google Identity Services credential
  // flow instead, then exchange its ID token with Firebase in this document.
  const { idToken } = await requestGoogleSignInCredential()
  const credential = await signInWithCredential(firebase.auth, GoogleAuthProvider.credential(idToken))
  localStorage.removeItem(AUTH_STORAGE_KEY)
  sessionStorage.removeItem(PLATFORM_EMAIL_MFA_TOKEN_KEY)
  await credential.user.getIdToken(true)
  if (deferContext) return { status: 'AUTHENTICATED' }
  return resolveAuthenticatedContext(credential.user)
}

export async function requestEmailVerification() {
  const user = await currentUserForScope(AUTH_SCOPE_ORGANIZATION)
  if (!user) throw new Error('Sesja Firebase wygasła. Zaloguj się ponownie.')
  if (user.emailVerified) return { verified: true }
  await sendEmailVerification(user)
  return { verified: false }
}

export async function refreshEmailVerification({ deferContext = false } = {}) {
  const user = await currentUserForScope(AUTH_SCOPE_ORGANIZATION)
  if (!user) throw new Error('Sesja Firebase wygasła. Zaloguj się ponownie.')
  await reload(user)
  if (!user.emailVerified) return { status: 'EMAIL_VERIFICATION_REQUIRED' }
  await user.getIdToken(true)
  if (deferContext) return { status: 'AUTHENTICATED' }
  return resolveAuthenticatedContext(user)
}

async function authenticatedTenantRequest(pathname, options = {}) {
  const user = await currentUserForScope(AUTH_SCOPE_ORGANIZATION)
  if (!user) throw new Error('Sesja Firebase wygasła. Zaloguj się ponownie.')
  const response = await fetch(`${getAuthApiBase()}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw createBackendError(response, body)
  return body?.data && typeof body.data === 'object' ? body.data : body
}

export function getOrganizationProfile(orgId) {
  return authenticatedTenantRequest(`/portal/organization-profile?orgId=${encodeURIComponent(toText(orgId))}`)
}

export function saveOrganizationProfile(orgId, version, profile) {
  return authenticatedTenantRequest('/portal/organization-profile', {
    method: 'PUT',
    body: JSON.stringify({ orgId: toText(orgId), version, profile }),
  })
}

export async function lookupCompanyByNip(nip) {
  const data = await authenticatedTenantRequest('/portal/company-registry/lookup', {
    method: 'POST',
    body: JSON.stringify({ nip: toText(nip) }),
  })
  return data?.company || null
}

function assertCentralRegistrationIssuerReady({ requiresGoogle = false } = {}) {
  if (!CENTRAL_REGISTRATION_ISSUER_READY) {
    throw createPublicAuthError(
      'REGISTRATION_ISSUER_NOT_READY',
      'Bezpieczna rejestracja firmy nie jest jeszcze gotowa. Spróbuj ponownie później.',
    )
  }
  if (requiresGoogle) {
    assertGoogleRegistrationIdentityReady()
  }
}

function assertGoogleRegistrationIdentityReady() {
  if (!CENTRAL_REGISTRATION_GOOGLE_CLIENT_ID) {
    throw createPublicAuthError(
      'GOOGLE_REGISTRATION_NOT_READY',
      'Rejestracja przez Google nie jest jeszcze poprawnie skonfigurowana.',
    )
  }
}

async function requireRegistrationAppCheckToken() {
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

function mapCentralRegistrationIssuerError(error, { google = false } = {}) {
  const code = issuerErrorText(error)
  if (code.includes('REGISTRATION_GRANT_ALREADY_ISSUED')) {
    return createPublicAuthError(
      'REGISTRATION_GRANT_ALREADY_ISSUED',
      google
        ? 'Rejestracja przez Google jest już przygotowana. Wybierz konto Google ponownie albo spróbuj za chwilę.'
        : 'Link rejestracyjny został już przygotowany. Użyj najnowszego linku z wiadomości e-mail albo spróbuj ponownie po jego wygaśnięciu.',
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
  return callCentralRegistrationIssuer(firebase, CLEANING_COMPANY_REGISTRATION_ISSUER_NAME, payload)
}

async function issueFacilityManagerRegistrationGrant(firebase, payload) {
  return callCentralRegistrationIssuer(firebase, FACILITY_MANAGER_REGISTRATION_ISSUER_NAME, payload, { google: true })
}

async function callCentralRegistrationIssuer(firebase, name, payload, { google = false } = {}) {
  assertCentralRegistrationIssuerReady()
  await requireRegistrationAppCheckToken()
  if (!firebase?.app) {
    throw createPublicAuthError('FIREBASE_AUTH_UNAVAILABLE', 'Rejestracja jest chwilowo niedostępna.')
  }

  try {
    const issuer = httpsCallable(
      getFunctions(firebase.app, CENTRAL_REGISTRATION_FUNCTIONS_REGION),
      name,
    )
    const response = await issuer(payload)
    return response?.data && typeof response.data === 'object' ? response.data : response
  } catch (error) {
    throw mapCentralRegistrationIssuerError(error, { google })
  }
}

async function beginCentralRegistrationGoogleChallenge(firebase, name, action) {
  const turnstileToken = await requestCentralRegistrationTurnstileToken(action)
  const payload = await callCentralRegistrationIssuer(firebase, name, { turnstileToken }, { google: true })
  const challengeToken = toText(payload?.challengeToken)
  const googleNonce = toText(payload?.googleNonce)
  const expiresAtMs = Number(payload?.expiresAtMs)
  if (!challengeToken || !googleNonce || !Number.isInteger(expiresAtMs) || expiresAtMs <= Date.now()) {
    throw createPublicAuthError('REGISTRATION_CHALLENGE_INVALID', 'Nie udało się bezpiecznie przygotować rejestracji. Spróbuj ponownie.')
  }
  return { challengeToken, googleNonce }
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
      let finished = false
      let timer = null
      let script = document.querySelector(`script[src="${GOOGLE_IDENTITY_SCRIPT_URL}"]`)
      const finish = (error = null) => {
        if (finished) return
        finished = true
        if (timer) window.clearTimeout(timer)
        const identity = window.google?.accounts?.id
        if (identity?.initialize && identity?.renderButton) {
          resolve(identity)
          return
        }
        if (script?.parentNode) script.parentNode.removeChild(script)
        reject(error || createPublicAuthError('GOOGLE_IDENTITY_UNAVAILABLE', 'Rejestracja przez Google jest chwilowo niedostępna.'))
      }
      const fail = () => finish(createPublicAuthError('GOOGLE_IDENTITY_UNAVAILABLE', 'Nie udało się połączyć z Google. Sprawdź internet i spróbuj ponownie.'))
      if (script) {
        script.addEventListener('load', () => finish(), { once: true })
        script.addEventListener(
          'error',
          fail,
          { once: true },
        )
      } else {
        script = document.createElement('script')
        script.src = GOOGLE_IDENTITY_SCRIPT_URL
        script.async = true
        script.defer = true
        script.addEventListener('load', () => finish(), { once: true })
        script.addEventListener(
          'error',
          fail,
          { once: true },
        )
        document.head.appendChild(script)
      }
      timer = window.setTimeout(
        () => finish(createPublicAuthError('GOOGLE_IDENTITY_LOAD_TIMEOUT', 'Ładowanie wyboru konta Google trwa zbyt długo. Spróbuj ponownie.')),
        GOOGLE_IDENTITY_LOAD_TIMEOUT_MS,
      )
    })
    googleIdentityScriptPromise.catch(() => {
      googleIdentityScriptPromise = null
    })
  }
  return googleIdentityScriptPromise
}

async function requestGoogleRegistrationCredential(googleNonce) {
  return requestGoogleIdentityCredential({ requireRegistrationIssuer: true, nonce: googleNonce })
}

async function requestGoogleSignInCredential() {
  return requestGoogleIdentityCredential()
}

function createGoogleIdentityButtonDialog() {
  const overlay = document.createElement('div')
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', 'Wybierz konto Google')
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483000',
    display: 'grid',
    placeItems: 'center',
    padding: '24px',
    background: 'rgba(6, 22, 65, 0.56)',
  })

  const panel = document.createElement('div')
  Object.assign(panel.style, {
    width: 'min(400px, 100%)',
    padding: '24px',
    borderRadius: '20px',
    background: '#fff',
    boxShadow: '0 24px 70px rgba(6, 22, 65, 0.28)',
    color: '#061641',
    fontFamily: 'Inter, system-ui, sans-serif',
    textAlign: 'center',
  })

  const heading = document.createElement('h2')
  heading.textContent = 'Wybierz konto Google'
  Object.assign(heading.style, { margin: '0 0 8px', fontSize: '22px' })

  const description = document.createElement('p')
  description.textContent = 'Kliknij bezpieczny przycisk Google, aby kontynuować.'
  Object.assign(description.style, { margin: '0 0 20px', color: '#52627c', lineHeight: '1.45' })

  const buttonHost = document.createElement('div')
  buttonHost.setAttribute('data-testid', 'google-identity-button-host')
  Object.assign(buttonHost.style, { display: 'flex', justifyContent: 'center', minHeight: '44px' })

  const cancelButton = document.createElement('button')
  cancelButton.type = 'button'
  cancelButton.textContent = 'Anuluj'
  Object.assign(cancelButton.style, {
    width: '100%',
    marginTop: '16px',
    padding: '11px 16px',
    border: '1px solid #dbe6f5',
    borderRadius: '12px',
    background: '#fff',
    color: '#061641',
    fontWeight: '700',
    cursor: 'pointer',
  })

  panel.append(heading, description, buttonHost, cancelButton)
  overlay.append(panel)
  document.body.append(overlay)

  return {
    buttonHost,
    cancelButton,
    remove: () => overlay.remove(),
  }
}

async function requestGoogleIdentityCredential({ requireRegistrationIssuer = false, nonce = '' } = {}) {
  if (requireRegistrationIssuer) {
    assertCentralRegistrationIssuerReady({ requiresGoogle: true })
  } else {
    assertGoogleRegistrationIdentityReady()
  }
  const googleIdentity = await loadGoogleIdentityLibrary()
  const resolvedNonce = toText(nonce)
  if (requireRegistrationIssuer && !resolvedNonce) {
    throw createPublicAuthError('REGISTRATION_CHALLENGE_REQUIRED', 'Nie udało się bezpiecznie przygotować rejestracji. Spróbuj ponownie.')
  }

  return new Promise((resolve, reject) => {
    let settled = false
    let selectionTimer = null
    let dialog = null
    const settle = (callback, value) => {
      if (settled) return
      settled = true
      if (selectionTimer) window.clearTimeout(selectionTimer)
      dialog?.remove()
      callback(value)
    }

    selectionTimer = window.setTimeout(() => {
      settle(
        reject,
        createPublicAuthError('GOOGLE_ACCOUNT_SELECTION_TIMEOUT', 'Wybór konta Google nie został zakończony. Spróbuj ponownie.'),
      )
    }, GOOGLE_ACCOUNT_SELECTION_TIMEOUT_MS)

    try {
      dialog = createGoogleIdentityButtonDialog()
      dialog.cancelButton.addEventListener('click', () => {
        settle(
          reject,
          createPublicAuthError('GOOGLE_ACCOUNT_SELECTION_CANCELLED', 'Wybór konta Google został anulowany.'),
        )
      }, { once: true })
      googleIdentity.initialize({
        client_id: CENTRAL_REGISTRATION_GOOGLE_CLIENT_ID,
        ...(resolvedNonce ? { nonce: resolvedNonce } : {}),
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
          settle(resolve, { idToken })
        },
      })
      googleIdentity.renderButton(dialog.buttonHost, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: requireRegistrationIssuer ? 'signup_with' : 'signin_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: 320,
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
  const challenge = await beginCentralRegistrationGoogleChallenge(
    firebase,
    CLEANING_COMPANY_GOOGLE_CHALLENGE_NAME,
    'registration_cleaning_company',
  )
  const { idToken } = await requestGoogleRegistrationCredential(challenge.googleNonce)
  // The global Firebase beforeCreate gate consumes this grant during the next
  // operation. Do not replace this credential flow with a direct Firebase
  // popup: it would try to create the user before the issuer can grant it.
  await issueCleaningCompanyRegistrationGrant(firebase, {
    providerId: 'google.com',
    googleIdToken: idToken,
    googleChallengeToken: challenge.challengeToken,
  })
  const credential = await signInWithCredential(firebase.auth, GoogleAuthProvider.credential(idToken))
  const context = await resolveFreshAuthenticatedUser(credential.user)
  // A new Firebase account consumes the central registration grant and is
  // already marked for company onboarding. An existing Google account cannot
  // consume a beforeCreate grant, but the user has still explicitly selected
  // the company-registration flow. Create the short-lived server enrollment
  // now so the first screen after Google is the same company-basics modal.
  if (context?.status === 'ORGANIZATION_ONBOARDING_REQUIRED') {
    return resumeCleaningCompanyOnboardingForExistingGoogleAccount()
  }
  return context
}

function facilityManagerRegistrationError(response, body) {
  const backendCode = toText(body?.error?.code).toUpperCase()
  const status = Number(response?.status)
  let message = 'Nie udało się utworzyć panelu zarządcy. Spróbuj ponownie.'

  if (
    backendCode === 'ORGANIZATION_NAME_REQUIRED' ||
    backendCode === 'INVALID_ORGANIZATION_NAME' ||
    backendCode === 'INVALID_FACILITY_MANAGER_REGISTRATION_PAYLOAD' ||
    backendCode === 'INVALID_IDEMPOTENCY_KEY'
  ) {
    message = `Podaj nazwę panelu (maks. ${FACILITY_MANAGER_ORGANIZATION_NAME_MAX_LENGTH} znaków).`
  } else if (
    backendCode === 'FACILITY_MANAGER_GOOGLE_IDENTITY_REQUIRED' ||
    backendCode === 'FACILITY_MANAGER_GOOGLE_EMAIL_UNVERIFIED'
  ) {
    message = 'Użyj konta Google z potwierdzonym adresem e-mail.'
  } else if (status === 401) {
    message = 'Sesja Google wygasła. Wybierz konto Google ponownie.'
  } else if (status === 403) {
    message = 'To konto Google nie może utworzyć panelu zarządcy.'
  } else if (status === 404) {
    message = 'Rejestracja panelu zarządcy nie jest jeszcze dostępna w tym środowisku.'
  } else if (status === 429) {
    message = 'Wysłano zbyt wiele prób rejestracji. Spróbuj ponownie później.'
  } else if (status >= 500) {
    message = 'Rejestracja panelu zarządcy jest chwilowo niedostępna. Spróbuj ponownie później.'
  }

  const error = createPublicAuthError(backendCode || 'FACILITY_MANAGER_REGISTRATION_FAILED', message)
  error.status = status
  error.facilityManagerRegistrationValidation = [
    'ORGANIZATION_NAME_REQUIRED',
    'INVALID_ORGANIZATION_NAME',
    'INVALID_FACILITY_MANAGER_REGISTRATION_PAYLOAD',
    'INVALID_IDEMPOTENCY_KEY',
  ].includes(backendCode)
  return error
}

function isFacilityManagerReplayResponse(response, body) {
  if (Number(response?.status) !== 409) {
    return false
  }

  const payload = body?.data && typeof body.data === 'object' ? body.data : body
  const status = toText(payload?.status).toUpperCase()
  const code = toText(payload?.code ?? body?.error?.code).toUpperCase()
  return (
    ['REPLAYED', 'IDEMPOTENT_REPLAY', 'ALREADY_PROVISIONED', 'ALREADY_REGISTERED', 'COMPLETED', 'READY'].includes(status) ||
    ['REGISTRATION_REPLAYED', 'IDEMPOTENCY_REPLAY', 'FACILITY_MANAGER_ALREADY_PROVISIONED'].includes(code)
  )
}

function mapFacilityManagerGoogleCredentialError(error) {
  const code = toText(error?.code).toLowerCase()
  if (
    code === 'auth/operation-not-allowed' ||
    code === 'auth/unauthorized-domain' ||
    code === 'auth/app-not-authorized' ||
    code === 'auth/invalid-api-key'
  ) {
    return createPublicAuthError(
      'FACILITY_MANAGER_GOOGLE_NOT_CONFIGURED',
      'Logowanie Google nie jest poprawnie skonfigurowane w tym środowisku.',
    )
  }
  if (code === 'auth/network-request-failed') {
    return createPublicAuthError(
      'FACILITY_MANAGER_GOOGLE_NETWORK_ERROR',
      'Nie udało się połączyć z Google. Sprawdź internet i spróbuj ponownie.',
    )
  }
  if (code === 'auth/account-exists-with-different-credential') {
    return createPublicAuthError(
      'FACILITY_MANAGER_GOOGLE_ACCOUNT_CONFLICT',
      'Ten adres e-mail jest już powiązany z innym sposobem logowania.',
    )
  }
  if (code === 'auth/blocked-by-function') {
    return createPublicAuthError(
      'FACILITY_MANAGER_GOOGLE_ACCOUNT_NOT_REGISTERED',
      'To konto Google nie ma jeszcze panelu zarządcy. Wybierz rejestrację panelu.',
    )
  }
  return createPublicAuthError('FACILITY_MANAGER_GOOGLE_SIGN_IN_FAILED', 'Nie udało się zalogować przez Google. Spróbuj ponownie.')
}

function isFacilityManagerGoogleUser(user) {
  if (!toText(user?.uid)) return false
  return Array.isArray(user?.providerData) && user.providerData.some((provider) => toText(provider?.providerId) === 'google.com')
}

function markFacilityManagerProvisioningRetryable(error) {
  const retryableError = error instanceof Error
    ? error
    : createPublicAuthError('FACILITY_MANAGER_REGISTRATION_RETRY_FAILED', 'Nie udało się dokończyć tworzenia panelu.')
  retryableError.facilityManagerRegistrationRetryable = true
  return retryableError
}

async function clearFacilityManagerRegistrationUser(firebase) {
  if (firebase?.auth) {
    await signOut(firebase.auth).catch(() => {})
  }
  localStorage.removeItem(AUTH_STORAGE_KEY)
  localStorage.removeItem(LAST_ORG_STORAGE_KEY)
}

async function provisionFacilityManagerGooglePanel(firebase, user, { organizationName, idempotencyKey }) {
  if (!isFacilityManagerGoogleUser(user)) {
    throw createPublicAuthError(
      'FACILITY_MANAGER_GOOGLE_SESSION_REQUIRED',
      'Zaloguj się kontem Google, które ma zostać właścicielem panelu.',
    )
  }

  let firebaseIdToken
  let appCheckToken
  try {
    ;[firebaseIdToken, appCheckToken] = await Promise.all([
      user.getIdToken(true),
      requireRegistrationAppCheckToken(),
    ])
  } catch (error) {
    // Firebase has already accepted the account. Keeping that session allows
    // a transient App Check or token refresh failure to retry the same
    // idempotent provisioning request without asking the issuer for a grant.
    throw markFacilityManagerProvisioningRetryable(error)
  }

  let response
  try {
    response = await fetch(FACILITY_MANAGER_REGISTRATION_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${firebaseIdToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Firebase-AppCheck': appCheckToken,
      },
      body: JSON.stringify({
        idempotencyKey,
        organizationName,
      }),
    })
  } catch {
    throw markFacilityManagerProvisioningRetryable(
      createPublicAuthError(
        'FACILITY_MANAGER_REGISTRATION_NETWORK_ERROR',
        'Nie udało się połączyć z rejestracją panelu. Sprawdź internet i spróbuj ponownie.',
      ),
    )
  }

  const body = await response.json().catch(() => ({}))
  if (!response.ok && !isFacilityManagerReplayResponse(response, body)) {
    const error = facilityManagerRegistrationError(response, body)
    if (Number(response.status) >= 500) {
      throw markFacilityManagerProvisioningRetryable(error)
    }
    throw error
  }

  try {
    // The organization is authoritative on the server. Refresh the Firebase
    // token once more before the existing session resolver selects its panel.
    await user.getIdToken(true)
    return await resolveAuthenticatedContext(user)
  } catch (error) {
    // The provisioner may have committed before a response/session refresh
    // failed. Repeating the same key is safe and the server treats it as a
    // replay rather than creating a second organization.
    throw markFacilityManagerProvisioningRetryable(error)
  }
}

/**
 * Signs an already-created facility-manager account in with Google. This path
 * intentionally never requests a registration grant: Firebase invokes
 * beforeCreate only for a new account, where the central blocking gate still
 * rejects any missing grant.
 */
export async function signInFacilityManagerWithGoogle() {
  if (!isFirebaseConfigured()) {
    throw createPublicAuthError('FIREBASE_NOT_CONFIGURED', 'Logowanie przez Google jest chwilowo niedostępne.')
  }

  const firebase = ensureFirebase()
  if (!firebase?.auth) {
    throw createPublicAuthError('FIREBASE_AUTH_UNAVAILABLE', 'Logowanie przez Google jest chwilowo niedostępne.')
  }

  await ensureFirebaseAuthPersistence()
  const { idToken } = await requestGoogleSignInCredential()
  let credential
  try {
    credential = await signInWithCredential(firebase.auth, GoogleAuthProvider.credential(idToken))
  } catch (error) {
    throw mapFacilityManagerGoogleCredentialError(error)
  }

  if (!credential?.user) {
    throw createPublicAuthError('FACILITY_MANAGER_GOOGLE_USER_MISSING', 'Google nie zwróciło bezpiecznej sesji. Spróbuj ponownie.')
  }
  return resolveFreshAuthenticatedUser(credential.user)
}

/**
 * Repeats only the idempotent backend provisioning after a prior Google
 * registration successfully created the Firebase account. It never invokes
 * the registration issuer and therefore cannot mint a grant for a new user.
 */
export async function retryFacilityManagerGoogleRegistration({ organizationName, idempotencyKey } = {}) {
  const normalizedOrganizationName = normalizeFacilityManagerOrganizationName(organizationName)
  const normalizedIdempotencyKey = normalizeFacilityManagerIdempotencyKey(idempotencyKey)

  if (!isFirebaseConfigured()) {
    throw createPublicAuthError('FIREBASE_NOT_CONFIGURED', 'Rejestracja przez Google jest chwilowo niedostępna.')
  }

  const firebase = ensureFirebase()
  if (!firebase?.auth) {
    throw createPublicAuthError('FIREBASE_AUTH_UNAVAILABLE', 'Rejestracja przez Google jest chwilowo niedostępna.')
  }

  await ensureFirebaseAuthPersistence()
  const user = firebase.auth.currentUser || (await waitForFirebaseAuthReady())
  try {
    return await provisionFacilityManagerGooglePanel(firebase, user, {
      organizationName: normalizedOrganizationName,
      idempotencyKey: normalizedIdempotencyKey,
    })
  } catch (error) {
    if (error?.facilityManagerRegistrationRetryable === true) {
      throw error
    }
    await clearFacilityManagerRegistrationUser(firebase)
    throw error
  }
}

/**
 * Creates a facility-manager panel after the user has selected an account in
 * Google Identity Services. The API derives the owner identity exclusively
 * from the Firebase ID token; the browser submits no uid, e-mail, plan or
 * object data.
 */
export async function registerFacilityManagerWithGoogle({ organizationName, idempotencyKey } = {}) {
  const normalizedOrganizationName = normalizeFacilityManagerOrganizationName(organizationName)
  const normalizedIdempotencyKey = normalizeFacilityManagerIdempotencyKey(idempotencyKey)

  if (!isFirebaseConfigured()) {
    throw createPublicAuthError('FIREBASE_NOT_CONFIGURED', 'Rejestracja przez Google jest chwilowo niedostępna.')
  }

  const firebase = ensureFirebase()
  if (!firebase?.auth) {
    throw createPublicAuthError('FIREBASE_AUTH_UNAVAILABLE', 'Rejestracja przez Google jest chwilowo niedostępna.')
  }

  await ensureFirebaseAuthPersistence()
  const challenge = await beginCentralRegistrationGoogleChallenge(
    firebase,
    FACILITY_MANAGER_GOOGLE_CHALLENGE_NAME,
    'registration_facility_manager',
  )
  const { idToken: googleIdToken } = await requestGoogleRegistrationCredential(challenge.googleNonce)
  // The central beforeCreate gate consumes this manager grant when Firebase
  // creates the Google user. Do not move the sign-in before this call.
  await issueFacilityManagerRegistrationGrant(firebase, {
    providerId: 'google.com',
    googleIdToken,
    googleChallengeToken: challenge.challengeToken,
  })
  let user = null

  try {
    let credential
    try {
      credential = await signInWithCredential(firebase.auth, GoogleAuthProvider.credential(googleIdToken))
    } catch (error) {
      throw mapFacilityManagerGoogleCredentialError(error)
    }
    user = credential?.user
    if (!user) {
      throw createPublicAuthError('FACILITY_MANAGER_GOOGLE_USER_MISSING', 'Google nie zwróciło bezpiecznej sesji. Spróbuj ponownie.')
    }

    return await provisionFacilityManagerGooglePanel(firebase, user, {
      organizationName: normalizedOrganizationName,
      idempotencyKey: normalizedIdempotencyKey,
    })
  } catch (error) {
    if (user && error?.facilityManagerRegistrationRetryable === true) {
      throw error
    }
    await clearFacilityManagerRegistrationUser(firebase)
    throw error
  }
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
  assertCleaningCompanyEmailDeliveryAllowed(firebase)
  // A valid grant must exist before the Firebase e-mail link can create a
  // first account. The issuer and the blocking gate keep the grant private.
  const turnstileToken = await requestCentralRegistrationTurnstileToken('registration_cleaning_company')
  await issueCleaningCompanyRegistrationGrant(firebase, {
    providerId: 'emailLink',
    email,
    turnstileToken,
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
  const { user } = await currentFirebaseUserWithToken(AUTH_SCOPE_ORGANIZATION)
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

export async function resumeCleaningCompanyOnboardingForExistingGoogleAccount() {
  const user = await currentUserForScope(AUTH_SCOPE_ORGANIZATION)
  if (!user) {
    throw createPublicAuthError('AUTH_SESSION_REQUIRED', 'Sesja wygasła. Zaloguj się ponownie kontem Google.')
  }

  const idToken = await user.getIdToken()
  const appCheckToken = await getFirebaseAppCheckToken()
  const response = await fetch(`${getAuthApiBase()}${CLEANING_COMPANY_EXISTING_ACCOUNT_ENROLLMENT_ENDPOINT}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      Accept: 'application/json',
      ...(appCheckToken ? { 'X-Firebase-AppCheck': appCheckToken } : {}),
    },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw createBackendError(response, body)

  const payload = unwrapApiData(body)
  if (toText(payload?.status).toUpperCase() !== 'CLEANING_COMPANY_ONBOARDING_REQUIRED') {
    throw new Error('Serwer nie potwierdził bezpiecznego otwarcia formularza firmy.')
  }
  return resolveAuthenticatedContext(user)
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
  const firebase = ensureFirebaseForScope(pendingAuthScope)
  if (!firebase?.auth) throw new Error('Brak konfiguracji Firebase dla tego logowania.')
  const verifier = createRecaptchaVerifier(firebase.auth, recaptchaContainerId)
  const verificationId = await new PhoneAuthProvider(firebase.auth).verifyPhoneNumber(
    { multiFactorHint: hint, session: pendingMfaResolver.session },
    verifier,
  )
  return { factorUid: toText(hint.uid), factorId: toText(hint.factorId), verificationId }
}

export async function completeMfaSignIn({ factorUid, verificationCode, verificationId = '', deferContext = false }) {
  if (!pendingMfaResolver) throw new Error('Brak oczekującego logowania MFA.')
  const hint = pendingMfaResolver.hints.find((item) => toText(item.uid) === toText(factorUid)) || pendingMfaResolver.hints[0]
  if (!hint || !toText(verificationCode)) throw new Error('Podaj kod drugiego składnika.')
  const assertion = toText(hint.factorId) === 'phone'
    ? PhoneMultiFactorGenerator.assertion(PhoneAuthProvider.credential(verificationId, toText(verificationCode)))
    : TotpMultiFactorGenerator.assertionForSignIn(toText(hint.uid), toText(verificationCode))
  const credential = await pendingMfaResolver.resolveSignIn(assertion)
  pendingMfaResolver = null
  clearRecaptchaVerifier()
  await credential.user.getIdToken(true)
  if (deferContext && normalizeAuthScope(pendingAuthScope) === AUTH_SCOPE_ORGANIZATION) {
    return { status: 'AUTHENTICATED' }
  }
  return resolveAuthenticatedContext(credential.user)
}

export async function beginTotpEnrollment() {
  const user = await currentUserForScope(resolveAuthScope())
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
  const user = ensureFirebaseForScope(resolveAuthScope())?.auth?.currentUser
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
  const authScope = resolveAuthScope()
  const firebase = ensureFirebaseForScope(authScope)
  const user = firebase?.auth?.currentUser || (await waitForAuthReadyForScope(authScope))
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
  const user = ensureFirebaseForScope(resolveAuthScope())?.auth?.currentUser
  if (!user) throw new Error('Sesja Firebase wygasła.')
  const credential = PhoneAuthProvider.credential(pendingMfaEnrollment.verificationId, toText(verificationCode))
  await multiFactor(user).enroll(PhoneMultiFactorGenerator.assertion(credential), 'Cleanzi SMS')
  pendingMfaEnrollment = null
  clearRecaptchaVerifier()
  await user.getIdToken(true)
  return resolveAuthenticatedContext(user)
}

export async function requestPasswordReset(emailValue, authScope = AUTH_SCOPE_ORGANIZATION) {
  const email = normalizeAuthEmail(emailValue)
  const normalizedAuthScope = normalizeAuthScope(authScope)
  if (!email) {
    throw createPublicAuthError('INVALID_RESET_EMAIL', 'Podaj poprawny adres email.')
  }

  if (!isAuthScopeConfigured(normalizedAuthScope)) {
    throw createPublicAuthError(
      'FIREBASE_NOT_CONFIGURED',
      'Resetowanie hasła jest chwilowo niedostępne z powodu braku konfiguracji Firebase.',
    )
  }

  const firebase = ensureFirebaseForScope(normalizedAuthScope)
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

async function currentFirebaseUserWithToken(scope = AUTH_SCOPE_PLATFORM) {
  const user = await currentUserForScope(scope)
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

  const currentUser = await currentUserForScope(AUTH_SCOPE_ORGANIZATION)
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
  const user = await currentUserForScope(AUTH_SCOPE_PLATFORM)
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
  const firebase = ensureFirebaseForScope(resolveAuthScope(getSession()))

  if (firebase?.auth?.currentUser) {
    void signOut(firebase.auth)
  }

  localStorage.removeItem(AUTH_STORAGE_KEY)
  localStorage.removeItem(LAST_ORG_STORAGE_KEY)
  localStorage.removeItem(PLATFORM_CONTEXT_STORAGE_KEY)
  localStorage.removeItem(AUTH_SCOPE_STORAGE_KEY)
  localStorage.removeItem(CLEANING_COMPANY_EMAIL_LINK_EMAIL_KEY)
  sessionStorage.removeItem(PLATFORM_EMAIL_MFA_TOKEN_KEY)
  pendingMfaResolver = null
  pendingMfaEnrollment = null
  pendingAuthScope = ''
  clearRecaptchaVerifier()
  renderSubscriptionBadge(null)
}

export function requireAuth() {
  return getSession()
}
