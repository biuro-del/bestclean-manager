import { clientsForOrg, myOrganizations } from '@dataconnect/generated'
import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { ensureFirebase, isFirebaseConfigured } from '../firebase/firebaseClient'

const AUTH_STORAGE_KEY = 'iclean.portal.auth'
const LAST_ORG_STORAGE_KEY = 'iclean.portal.lastOrgId'

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
  const normalized = String(dcRole ?? '').toUpperCase()
  if (normalized === 'ADMIN') {
    return 'Admin'
  }

  if (normalized === 'MANAGER') {
    return 'Kierownik'
  }

  if (normalized === 'WORKER') {
    return 'Pracownik'
  }

  return 'Koordynator'
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

function isTrue(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase() === 'true'
}

function isLocalHttpEndpoint(value) {
  const endpoint = String(value ?? '').trim().toLowerCase()
  return endpoint.includes('://127.0.0.1') || endpoint.includes('://localhost')
}

function getBootstrapMembershipEndpoint() {
  const fromEnv = String(import.meta.env.VITE_AUTH_BOOTSTRAP_MEMBERSHIP_ENDPOINT ?? '').trim()
  const useEmulators = isTrue(import.meta.env.VITE_USE_EMULATORS)
  if (fromEnv && (!isLocalHttpEndpoint(fromEnv) || useEmulators)) {
    return fromEnv
  }

  const projectId = String(import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'iclean-room').trim() || 'iclean-room'

  return `https://europe-west3-${projectId}.cloudfunctions.net/authBootstrapMembership`
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
  let response = await myOrganizations()
  let memberships = response?.data?.organizationMembers ?? []

  if (!memberships.length) {
    const orgFromEmailHint = extractOrgIdFromEmail(userEmail)
    if (firebaseUser) {
      await bootstrapMembershipIfNeeded(firebaseUser, orgFromEmailHint)
      response = await myOrganizations()
      memberships = response?.data?.organizationMembers ?? []
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

function buildSessionFromFirebase(user, context) {
  localStorage.setItem(LAST_ORG_STORAGE_KEY, context.orgId)

  return {
    token: `firebase-${user.uid}`,
    uid: user.uid,
    login: user.email ?? user.uid,
    name: user.displayName ?? user.email ?? user.uid,
    role: context.role,
    orgId: context.orgId,
    orgName: context.orgName,
    source: 'firebase',
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
    if (session?.source === 'firebase') {
      localStorage.removeItem(AUTH_STORAGE_KEY)
      return null
    }

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
  const currentUser = firebase?.auth?.currentUser

  if (!currentUser) {
    return null
  }

  const orgContext = await resolveOrganizationContext(currentUser.email, currentUser)
  const normalizedSession = buildSessionFromFirebase(currentUser, orgContext)
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(normalizedSession))
  return normalizedSession
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

  const credential = await signInWithEmailAndPassword(firebase.auth, normalizedLogin, normalizedPassword)

  try {
    const orgContext = await resolveOrganizationContext(credential.user.email ?? normalizedLogin, credential.user)
    const session = buildSessionFromFirebase(credential.user, orgContext)
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
