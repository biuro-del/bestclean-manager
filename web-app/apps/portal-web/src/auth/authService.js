import {
  GoogleAuthProvider,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  TotpMultiFactorGenerator,
  getMultiFactorResolver,
  multiFactor,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth'
import {
  ensureFirebase,
  ensureFirebaseAuthPersistence,
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

const AUTH_STORAGE_KEY = 'iclean.portal.auth'
const LAST_ORG_STORAGE_KEY = 'iclean.portal.lastOrgId'
const PLATFORM_CONTEXT_STORAGE_KEY = 'iclean.portal.platformContextId'
const PLATFORM_EMAIL_MFA_TOKEN_KEY = 'iclean.portal.platformEmailMfaToken'
const AUTH_SCOPE_STORAGE_KEY = 'iclean.portal.authScope'
const AUTH_SCOPE_ORGANIZATION = 'organization'
const AUTH_SCOPE_PLATFORM = 'platform'
const AUTH_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const AUTH_EMAIL_MAX_LENGTH = 160
let pendingMfaResolver = null
let pendingMfaEnrollment = null
let pendingRecaptchaVerifier = null
let pendingAuthScope = ''

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
  if (result.status === 'PLATFORM_SELECTION_REQUIRED') {
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
  const credential = await signInWithPopup(firebase.auth, provider)
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

async function currentFirebaseUserWithToken() {
  const user = await currentUserForScope(AUTH_SCOPE_PLATFORM)
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
