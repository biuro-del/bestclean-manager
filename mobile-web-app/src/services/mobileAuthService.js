import { clientsForOrg, myOrganizations } from '@dataconnect/generated'
import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { ensureFirebase, isFirebaseConfigured } from '../firebase/firebaseClient'
import {
  clearMobileSession,
  readMobileSession,
  readPreferredOrgId,
  writeMobileSession,
} from '../state/sessionStore'

function toText(value) {
  return String(value ?? '').trim()
}

function normalizeLoginInput(loginValue) {
  const login = toText(loginValue).toLowerCase()
  if (!login) {
    return ''
  }

  if (login.includes('@')) {
    return login
  }

  const preferredOrgId = toText(import.meta.env.VITE_DEFAULT_ORG_ID) || readPreferredOrgId()
  if (!preferredOrgId) {
    return ''
  }

  return `${login}@${preferredOrgId}.pl`
}

function mapRole(roleValue) {
  const role = toText(roleValue).toUpperCase()
  if (role === 'ADMIN') return 'Admin'
  if (role === 'MANAGER') return 'Kierownik'
  if (role === 'WORKER') return 'Pracownik'
  return 'Koordynator'
}

function extractOrgFromEmail(emailValue) {
  const email = toText(emailValue).toLowerCase()
  const match = email.match(/^[a-z0-9._%+-]+@([a-z0-9_-]+)\.pl$/i)
  if (!match) {
    return ''
  }

  return toText(match[1]).toLowerCase()
}

function isTrue(value) {
  return toText(value).toLowerCase() === 'true'
}

function isLocalHttpEndpoint(value) {
  const endpoint = toText(value).toLowerCase()
  return endpoint.includes('://127.0.0.1') || endpoint.includes('://localhost')
}

function mapFirebaseLoginError(error) {
  const code = toText(error?.code).toLowerCase()
  const providerMessage = toText(error?.customData?._tokenResponse?.error?.message).toUpperCase()

  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found' ||
    providerMessage === 'INVALID_LOGIN_CREDENTIALS' ||
    providerMessage === 'EMAIL_NOT_FOUND' ||
    providerMessage === 'INVALID_PASSWORD'
  ) {
    return 'Niepoprawny login lub haslo.'
  }

  if (code === 'auth/invalid-email') {
    return 'Niepoprawny format email (uzyj np. login@bestclean.pl).'
  }

  if (code === 'auth/operation-not-allowed' || providerMessage === 'OPERATION_NOT_ALLOWED') {
    return 'W Firebase Auth jest wylaczony provider Email/Password.'
  }

  if (code === 'auth/too-many-requests') {
    return 'Za duzo prob logowania. Sprobuj ponownie za chwile.'
  }

  if (code === 'auth/network-request-failed') {
    return 'Brak polaczenia z Firebase Auth.'
  }

  return toText(error?.message) || 'Nie udalo sie zalogowac do Firebase Auth.'
}

function getBootstrapMembershipEndpoint() {
  const endpointFromEnv = toText(import.meta.env.VITE_AUTH_BOOTSTRAP_MEMBERSHIP_ENDPOINT)
  const useEmulators = isTrue(import.meta.env.VITE_USE_EMULATORS)
  if (endpointFromEnv && (!isLocalHttpEndpoint(endpointFromEnv) || useEmulators)) {
    return endpointFromEnv
  }

  const projectId = toText(import.meta.env.VITE_FIREBASE_PROJECT_ID) || 'iclean-room'
  const host = toText(import.meta.env.VITE_FUNCTIONS_EMULATOR_HOST)
  const port = Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT ?? 5001)
  if (useEmulators && host) {
    return `http://${host}:${port}/${projectId}/europe-west3/authBootstrapMembership`
  }

  return `https://europe-west3-${projectId}.cloudfunctions.net/authBootstrapMembership`
}

async function bootstrapMembershipIfNeeded(firebaseUser, orgIdHint) {
  const endpoint = getBootstrapMembershipEndpoint()
  if (!endpoint || !firebaseUser) {
    return false
  }

  const idToken = await firebaseUser.getIdToken(true)
  const payload = {}
  const normalizedOrgId = toText(orgIdHint).toLowerCase()
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
      message = toText(body?.error?.message)
    } catch {
      message = ''
    }
    throw new Error(message || 'Nie udalo sie przypisac organizacji do konta Firebase.')
  }

  return true
}

async function resolveOrganizationContext(emailValue, firebaseUser = null) {
  let response = await myOrganizations()
  let memberships = response?.data?.organizationMembers ?? []

  if (!memberships.length) {
    const orgFromEmailHint = extractOrgFromEmail(emailValue)
    if (firebaseUser) {
      await bootstrapMembershipIfNeeded(firebaseUser, orgFromEmailHint)
      response = await myOrganizations()
      memberships = response?.data?.organizationMembers ?? []
    }

    if (!memberships.length) {
      throw new Error('Brak organizacji przypisanej do konta Firebase.')
    }
  }

  const fromEmail = extractOrgFromEmail(emailValue)
  if (fromEmail) {
    const byEmail = memberships.find((item) => toText(item.orgId) === fromEmail)
    if (byEmail) {
      return {
        orgId: toText(byEmail.orgId),
        orgName: toText(byEmail.organization?.name || byEmail.orgId),
        role: mapRole(byEmail.role),
      }
    }

    throw new Error(`Uzytkownik ${emailValue} nie ma dostepu do orgId ${fromEmail}.`)
  }

  const preferredOrgFromConfig = toText(import.meta.env.VITE_DEFAULT_ORG_ID) || readPreferredOrgId()
  if (preferredOrgFromConfig) {
    const preferred = memberships.find((item) => toText(item.orgId) === preferredOrgFromConfig)
    if (preferred) {
      return {
        orgId: toText(preferred.orgId),
        orgName: toText(preferred.organization?.name || preferred.orgId),
        role: mapRole(preferred.role),
      }
    }
  }

  for (const membership of memberships) {
    const orgId = toText(membership.orgId)
    if (!orgId) {
      continue
    }
    try {
      const clientsResponse = await clientsForOrg({ orgId })
      const clients = clientsResponse?.data?.clients ?? []
      if (clients.length > 0) {
        return {
          orgId,
          orgName: toText(membership.organization?.name || orgId),
          role: mapRole(membership.role),
        }
      }
    } catch {
      // Ignore and continue.
    }
  }

  const first = memberships[0]
  return {
    orgId: toText(first.orgId),
    orgName: toText(first.organization?.name || first.orgId),
    role: mapRole(first.role),
  }
}

export function getMobileSession() {
  return readMobileSession()
}

export async function loginMobile({ login, password }) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase dla mobile-web.')
  }

  const normalizedEmail = normalizeLoginInput(login)
  const normalizedPassword = toText(password)

  if (!normalizedEmail || !normalizedPassword) {
    throw new Error('Podaj login (email np. login@bestclean.pl) i haslo.')
  }

  const firebase = ensureFirebase()
  if (!firebase?.auth) {
    throw new Error('Nie udalo sie zainicjalizowac Firebase Auth.')
  }

  let credential
  try {
    credential = await signInWithEmailAndPassword(firebase.auth, normalizedEmail, normalizedPassword)
  } catch (error) {
    throw new Error(mapFirebaseLoginError(error))
  }

  try {
    const email = toText(credential.user.email || normalizedEmail).toLowerCase()
    const context = await resolveOrganizationContext(email, credential.user)
    const loginFromEmail = toText(email.split('@')[0]).toLowerCase()

    const session = writeMobileSession({
      token: `firebase-${credential.user.uid}`,
      uid: toText(credential.user.uid),
      email,
      login: email,
      orgId: toText(context.orgId),
      orgName: context.orgName,
      role: toText(context.role) || 'Pracownik',
      workerLogin: loginFromEmail,
      workerName: toText(credential.user.displayName) || loginFromEmail,
      source: 'firebase',
    })

    return session
  } catch (error) {
    await signOut(firebase.auth)
    throw error
  }
}

export async function logoutMobile() {
  const firebase = ensureFirebase()
  if (firebase?.auth?.currentUser) {
    await signOut(firebase.auth)
  }
  clearMobileSession()
}
