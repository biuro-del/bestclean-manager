import { clientsForOrg, myOrganizations, workersForOrg } from '@dataconnect/generated'
import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import {
  ensureFirebase,
  ensureFirebaseAuthPersistence,
  isFirebaseConfigured,
  waitForFirebaseAuthReady,
} from '../firebase/firebaseClient'

const AUTH_STORAGE_KEY = 'iclean.portal.auth'
const LAST_ORG_STORAGE_KEY = 'iclean.portal.lastOrgId'

function toText(value) {
  return String(value ?? '').trim()
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
  const normalized = String(dcRole ?? '')
    .trim()
    .toUpperCase()

  if (normalized === 'ADMIN' || normalized === 'OWNER' || normalized === 'SUPERADMIN') {
    return 'Admin'
  }

  if (normalized === 'MANAGER' || normalized === 'KIEROWNIK') {
    return 'Kierownik'
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

function extractOrgIdFromEmail(email) {
  const normalized = String(email ?? '').trim().toLowerCase()
  const parts = normalized.split('@')
  if (parts.length !== 2) {
    return ''
  }

  const domain = parts[1]
  const domainMain = domain.split('.')[0] ?? ''
  return domainMain.replace(/[^a-z0-9_-]/g, '')
}

function emailPrefix(value) {
  const normalized = toText(value).toLowerCase()
  if (!normalized || !normalized.includes('@')) {
    return ''
  }
  return normalized.split('@')[0]
}

function normalizePersonName(value) {
  const raw = toText(value)
  if (!raw) {
    return ''
  }

  try {
    return raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
  } catch {
    return raw.toLowerCase().replace(/\s+/g, ' ').trim()
  }
}

function isWorkerActiveValue(value) {
  if (typeof value === 'boolean') {
    return value
  }

  const normalized = toText(value).toLowerCase()
  if (!normalized) {
    return true
  }

  return !['false', '0', 'no', 'nie'].includes(normalized)
}

function normalizeWorkerId(value) {
  const normalized = toText(value).toUpperCase()
  return /^W\d+$/.test(normalized) ? normalized : ''
}

function workerIdFromRow(row = {}) {
  return normalizeWorkerId(row.workerId ?? row.worker_id ?? row.workerid ?? row.id)
}

function findUniqueWorker(rows, predicate) {
  const matches = rows.filter(predicate)
  return matches.length === 1 ? matches[0] : null
}

function resolveWorkerRowForUser(workerRows, firebaseUser) {
  const rows = Array.isArray(workerRows) ? workerRows : []
  const authUid = toText(firebaseUser?.uid)
  const email = toText(firebaseUser?.email).toLowerCase()
  const loginFromEmail = emailPrefix(email)
  const displayName = normalizePersonName(firebaseUser?.displayName)

  if (authUid) {
    const byAuthUid = findUniqueWorker(rows, (row) => {
      return toText(row?.authUid ?? row?.auth_uid) === authUid
    })
    if (byAuthUid) {
      return byAuthUid
    }
  }

  if (email) {
    const byEmail = findUniqueWorker(rows, (row) => {
      const workerEmail = toText(row?.email).toLowerCase()
      const workerLoginEmail = toText(row?.loginEmail).toLowerCase()
      return workerEmail === email || workerLoginEmail === email
    })
    if (byEmail) {
      return byEmail
    }
  }

  if (loginFromEmail) {
    const byLogin = findUniqueWorker(rows, (row) => toText(row?.login).toLowerCase() === loginFromEmail)
    if (byLogin) {
      return byLogin
    }
  }

  if (displayName) {
    const byName = findUniqueWorker(rows, (row) => {
      const workerName = normalizePersonName(row?.workerName ?? row?.fullName ?? row?.name)
      return workerName && workerName === displayName
    })
    if (byName) {
      return byName
    }
  }

  return null
}

async function assertWorkerIsActive(orgId, firebaseUser) {
  const normalizedOrgId = toText(orgId)
  if (!normalizedOrgId || !firebaseUser) {
    return null
  }

  const response = await workersForOrg({ orgId: normalizedOrgId })
  const workerRows = response?.data?.workers ?? []
  const workerRow = resolveWorkerRowForUser(workerRows, firebaseUser)

  if (!workerRow) {
    return null
  }

  if (!isWorkerActiveValue(workerRow.active)) {
    throw new Error('Konto pracownika jest nieaktywne. Skontaktuj sie z administratorem.')
  }

  return workerRow
}

function isTrue(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase() === 'true'
}

function isLocalHttpEndpoint(value) {
  const endpoint = String(value ?? '').trim().toLowerCase()
  return endpoint.includes('://127.0.0.1') || endpoint.includes('://localhost')
}

function normalizeApiBase(value) {
  const raw = String(value ?? '').trim()
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

function isDataConnectOrganizationFailure(error) {
  const message = String(error?.message ?? error ?? '').toLowerCase()
  return (
    message.includes('organizationmembers') ||
    message.includes('organizationmember') ||
    message.includes('sql execution failed') ||
    message.includes('"code":"internal"') ||
    message.includes('code":"internal')
  )
}

async function fetchBackendOrganizationMemberships(firebaseUser, orgIdHint = '') {
  if (!firebaseUser) {
    return []
  }

  const idToken = await firebaseUser.getIdToken()
  const hint = String(orgIdHint ?? '').trim()
  const url = `${getAuthApiBase()}/auth/session-context${hint ? `?orgId=${encodeURIComponent(hint)}` : ''}`
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    let message = ''
    try {
      const body = await response.json()
      message = String(body?.error?.message ?? '').trim()
    } catch {
      message = ''
    }
    throw new Error(message || 'Nie udało się pobrać organizacji użytkownika z backendu.')
  }

  const body = await response.json().catch(() => ({}))
  return Array.isArray(body?.data?.organizationMembers) ? body.data.organizationMembers : []
}

function getBootstrapMembershipEndpoint() {
  const fromEnv = String(import.meta.env.VITE_AUTH_BOOTSTRAP_MEMBERSHIP_ENDPOINT ?? '').trim()
  const useEmulators = isTrue(import.meta.env.VITE_USE_EMULATORS)
  if (fromEnv && (!isLocalHttpEndpoint(fromEnv) || useEmulators)) {
    return fromEnv
  }

  if (!useEmulators) {
    return '/authBootstrapMembership'
  }

  const projectId = String(import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'iclean-room').trim() || 'iclean-room'
  const host = String(import.meta.env.VITE_FUNCTIONS_EMULATOR_HOST ?? '').trim()
  const port = Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT ?? 5001)
  if (useEmulators && host) {
    return `http://${host}:${port}/${projectId}/europe-west3/authBootstrapMembership`
  }

  return '/authBootstrapMembership'
}

async function bootstrapMembershipIfNeeded(firebaseUser, orgIdHint) {
  const endpoint = getBootstrapMembershipEndpoint()
  if (!endpoint || !firebaseUser) {
    return false
  }

  const idToken = await firebaseUser.getIdToken(true)
  const payload = {}
  const normalizedOrgId = String(orgIdHint ?? '').trim()
  if (normalizedOrgId) {
    payload.orgId = normalizedOrgId
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    let message = ''
    try {
      const body = await response.json()
      message = String(body?.error?.message ?? '').trim()
    } catch {
      message = ''
    }
    throw new Error(message || 'Nie udalo sie przypisac organizacji do konta Firebase.')
  }

  return true
}

async function resolveOrganizationContext(userEmail, firebaseUser = null) {
  const orgFromEmailHint = extractOrgIdFromEmail(userEmail)
  let memberships = []

  try {
    const response = await myOrganizations()
    memberships = response?.data?.organizationMembers ?? []
  } catch (error) {
    if (!firebaseUser || !isDataConnectOrganizationFailure(error)) {
      throw error
    }

    memberships = await fetchBackendOrganizationMemberships(firebaseUser, orgFromEmailHint)
  }

  if (!memberships.length) {
    if (firebaseUser) {
      await bootstrapMembershipIfNeeded(firebaseUser, orgFromEmailHint)
      try {
        const response = await myOrganizations()
        memberships = response?.data?.organizationMembers ?? []
      } catch (error) {
        if (!isDataConnectOrganizationFailure(error)) {
          throw error
        }
        memberships = await fetchBackendOrganizationMemberships(firebaseUser, orgFromEmailHint)
      }
    }

    if (!memberships.length) {
      throw new Error('Brak organizacji przypisanej do konta Firebase.')
    }
  }

  const orgFromEmail = extractOrgIdFromEmail(userEmail)
  if (orgFromEmail) {
    const membershipFromEmail = memberships.find((membership) => membership.orgId === orgFromEmail)
    if (!membershipFromEmail) {
      throw new Error(`Uzytkownik ${userEmail} nie ma dostepu do orgId ${orgFromEmail}.`)
    }

    return {
      orgId: membershipFromEmail.orgId,
      role: mapRole(membershipFromEmail.role),
      orgName: membershipFromEmail.organization?.name ?? membershipFromEmail.orgId,
    }
  }

  const preferredFromEnv = String(import.meta.env.VITE_DEFAULT_ORG_ID ?? '').trim()
  const preferredFromStorage = String(localStorage.getItem(LAST_ORG_STORAGE_KEY) ?? '').trim()
  const preferredOrgId = preferredFromEnv || preferredFromStorage

  if (preferredOrgId) {
    const preferredMembership = memberships.find((membership) => membership.orgId === preferredOrgId)
    if (preferredMembership) {
      return {
        orgId: preferredMembership.orgId,
        role: mapRole(preferredMembership.role),
        orgName: preferredMembership.organization?.name ?? preferredMembership.orgId,
      }
    }
  }

  for (const membership of memberships) {
    try {
      const clientsResponse = await clientsForOrg({ orgId: membership.orgId })
      const clients = clientsResponse?.data?.clients ?? []
      if (clients.length > 0) {
        return {
          orgId: membership.orgId,
          role: mapRole(membership.role),
          orgName: membership.organization?.name ?? membership.orgId,
        }
      }
    } catch {
      // Ignore failed probe and continue.
    }
  }

  const firstMembership = memberships[0]
  return {
    orgId: firstMembership.orgId,
    role: mapRole(firstMembership.role),
    orgName: firstMembership.organization?.name ?? firstMembership.orgId,
  }
}

function buildSessionFromFirebase(user, context, workerRow = null) {
  localStorage.setItem(LAST_ORG_STORAGE_KEY, context.orgId)

  const workerId = workerIdFromRow(workerRow)

  return {
    token: `firebase-${user.uid}`,
    uid: user.uid,
    login: user.email ?? user.uid,
    name: user.displayName ?? user.email ?? user.uid,
    role: context.role,
    orgId: context.orgId,
    orgName: context.orgName,
    source: 'firebase',
    ...(workerId ? { workerId } : {}),
  }
}

export function getSession() {
  const session = parseSession(localStorage.getItem(AUTH_STORAGE_KEY))

  if (!isFirebaseConfigured()) {
    return session
  }

  const firebase = ensureFirebase()
  const currentUser = firebase?.auth?.currentUser ?? null

  if (!currentUser) {
    return session
  }

  if (session?.uid === currentUser.uid) {
    return session
  }

  const rebuiltSession = {
    token: `firebase-${currentUser.uid}`,
    uid: currentUser.uid,
    login: currentUser.email ?? currentUser.uid,
    name: currentUser.displayName ?? currentUser.email ?? currentUser.uid,
    role: session?.role ?? 'Pracownik',
    orgId: session?.orgId ?? null,
    orgName: session?.orgName ?? null,
    source: 'firebase',
    ...(normalizeWorkerId(session?.workerId) ? { workerId: normalizeWorkerId(session.workerId) } : {}),
  }

  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(rebuiltSession))
  return rebuiltSession
}

export async function ensureSessionContext(session) {
  if (!session) {
    return null
  }

  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupelnij web-app/.env.')
  }

  const firebase = ensureFirebase()
  const currentUser = firebase?.auth?.currentUser || (await waitForFirebaseAuthReady())

  if (!currentUser) {
    return null
  }

  try {
    const orgContext = await resolveOrganizationContext(currentUser.email, currentUser)
    assertPortalAccessAllowed(orgContext)
    const workerRow = await assertWorkerIsActive(orgContext.orgId, currentUser)
    const normalizedSession = buildSessionFromFirebase(currentUser, orgContext, workerRow)
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(normalizedSession))
    return normalizedSession
  } catch (error) {
    await signOut(firebase.auth)
    localStorage.removeItem(AUTH_STORAGE_KEY)
    throw error
  }
}

export function saveSession(session) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
}

export async function login({ login: loginValue, password }) {
  const normalizedLogin = String(loginValue ?? '').trim()
  const normalizedPassword = String(password ?? '').trim()

  if (!normalizedLogin || !normalizedPassword) {
    throw new Error('Podaj login i haslo.')
  }

  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupelnij web-app/.env.')
  }

  const firebase = ensureFirebase()
  if (!firebase) {
    throw new Error('Brak konfiguracji Firebase.')
  }

  await ensureFirebaseAuthPersistence()
  const credential = await signInWithEmailAndPassword(firebase.auth, normalizedLogin, normalizedPassword)

  try {
    const orgContext = await resolveOrganizationContext(credential.user.email ?? normalizedLogin, credential.user)
    assertPortalAccessAllowed(orgContext)
    const workerRow = await assertWorkerIsActive(orgContext.orgId, credential.user)
    const session = buildSessionFromFirebase(credential.user, orgContext, workerRow)
    saveSession(session)
    return session
  } catch (error) {
    await signOut(firebase.auth)
    throw error
  }
}

export function logout() {
  const firebase = ensureFirebase()

  if (firebase?.auth?.currentUser) {
    void signOut(firebase.auth)
  }

  localStorage.removeItem(AUTH_STORAGE_KEY)
}

export function requireAuth() {
  return getSession()
}
