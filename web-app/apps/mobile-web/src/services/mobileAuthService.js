import { clientsForOrg, myOrganizations, workersForOrg } from '@dataconnect/generated'
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

const LOGIN_EMAIL_ALIASES_BY_ORG = {
  bestclean: {
    rafal: ['dudek2@bestclean.pl'],
    sabina: ['sabina.dudek@bestclean.pl'],
    szymon: ['kustos@bestclean.pl'],
    smolka: ['justynasmolka@bestclean.pl'],
  },
}

function getPreferredOrgIdForLogin() {
  return (toText(import.meta.env.VITE_DEFAULT_ORG_ID) || readPreferredOrgId() || 'bestclean').toLowerCase()
}

function buildLoginEmailCandidates(loginValue) {
  const login = toText(loginValue).toLowerCase()
  if (!login) {
    return []
  }

  if (login.includes('@')) {
    return [login]
  }

  const orgId = getPreferredOrgIdForLogin()
  const aliases = LOGIN_EMAIL_ALIASES_BY_ORG[orgId]?.[login] || []
  const fallback = `${login}@${orgId}.pl`
  return [...new Set([fallback, ...aliases.map((value) => toText(value).toLowerCase()).filter(Boolean)])]
}

function isInvalidCredentialsError(error) {
  const code = toText(error?.code).toLowerCase()
  const providerMessage = toText(error?.customData?._tokenResponse?.error?.message).toUpperCase()
  return (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found' ||
    providerMessage === 'INVALID_LOGIN_CREDENTIALS' ||
    providerMessage === 'EMAIL_NOT_FOUND' ||
    providerMessage === 'INVALID_PASSWORD'
  )
}

async function signInWithLoginCandidates(auth, emailCandidates, password) {
  let lastError = null
  for (const emailCandidate of emailCandidates) {
    try {
      const credential = await signInWithEmailAndPassword(auth, emailCandidate, password)
      return {
        credential,
        emailUsed: emailCandidate,
      }
    } catch (error) {
      if (!isInvalidCredentialsError(error)) {
        throw error
      }
      lastError = error
    }
  }

  if (lastError) {
    throw lastError
  }
  throw new Error('Nie udalo sie zalogowac do Firebase Auth.')
}

function normalizeRoleToken(roleValue) {
  const role = toText(roleValue).toUpperCase()
  if (!role) return ''
  if (role === 'ADMIN' || role === 'ADMINISTRATOR') return 'ADMIN'
  if (role === 'MANAGER' || role === 'KIEROWNIK') return 'MANAGER'
  if (role === 'COORDINATOR' || role === 'KOORDYNATOR') return 'COORDINATOR'
  if (role === 'WORKER' || role === 'PRACOWNIK') return 'WORKER'
  return ''
}

function emailPrefix(value) {
  const email = toText(value).toLowerCase()
  if (!email || !email.includes('@')) {
    return ''
  }
  return email.split('@')[0]
}

function loginTokens(value) {
  const text = toText(value).toLowerCase()
  if (!text) {
    return []
  }

  const local = text.includes('@') ? text.split('@')[0] : text
  return [...new Set(local.split(/[^a-z0-9]+/).filter(Boolean))]
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

function resolveCanonicalWorkerLogin(workerRows, emailValue, loginFromEmail, displayNameValue = '') {
  const email = toText(emailValue).toLowerCase()
  const login = toText(loginFromEmail).toLowerCase()
  const displayName = normalizePersonName(displayNameValue)
  const emailLogin = emailPrefix(email)
  const loginTokenList = [...new Set([...loginTokens(login), ...loginTokens(emailLogin)])]
  const primaryLoginToken = loginTokenList[0] || ''
  const workers = Array.isArray(workerRows) ? workerRows : []

  if (login) {
    const byLogin = workers.find((row) => toText(row?.login).toLowerCase() === login)
    if (byLogin) {
      return toText(byLogin.login)
    }
  }

  if (email) {
    const byEmail = workers.find(
      (row) => toText(row?.email).toLowerCase() === email || toText(row?.loginEmail).toLowerCase() === email,
    )
    if (byEmail) {
      return toText(byEmail.login)
    }
  }

  if (login) {
    const byPrefix = workers.find((row) => {
      const loginEmailPrefix = emailPrefix(row?.loginEmail)
      const emailFieldPrefix = emailPrefix(row?.email)
      return loginEmailPrefix === login || emailFieldPrefix === login
    })
    if (byPrefix) {
      return toText(byPrefix.login)
    }
  }

  if (displayName) {
    const byDisplayName = workers.find((row) => normalizePersonName(row?.fullName) === displayName)
    if (byDisplayName) {
      return toText(byDisplayName.login)
    }
  }

  if (loginTokenList.length > 1) {
    const byNameTokens = workers.find((row) => {
      const normalizedName = normalizePersonName(row?.fullName)
      return normalizedName && loginTokenList.every((token) => normalizedName.includes(token))
    })
    if (byNameTokens) {
      return toText(byNameTokens.login)
    }
  }

  if (primaryLoginToken) {
    const byPrimaryToken = workers.find((row) => toText(row?.login).toLowerCase() === primaryLoginToken)
    if (byPrimaryToken) {
      return toText(byPrimaryToken.login)
    }
  }

  return toText(loginFromEmail)
}

async function resolveWorkerLoginForSession(orgId, emailValue, loginFromEmail, displayNameValue = '') {
  const normalizedOrgId = toText(orgId)
  if (!normalizedOrgId) {
    return {
      workerLogin: toText(loginFromEmail),
      workerRole: '',
    }
  }

  try {
    const response = await workersForOrg({ orgId: normalizedOrgId })
    const workerRows = response?.data?.workers ?? []
    const workerLogin = resolveCanonicalWorkerLogin(workerRows, emailValue, loginFromEmail, displayNameValue)
    const workerRole = normalizeRoleToken(
      workerRows.find((row) => toText(row?.login).toLowerCase() === toText(workerLogin).toLowerCase())?.role,
    )
    return {
      workerLogin,
      workerRole,
    }
  } catch {
    return {
      workerLogin: toText(loginFromEmail),
      workerRole: '',
    }
  }
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

  const projectId = toText(import.meta.env.VITE_FIREBASE_PROJECT_ID) || 'iclean2-2e798'
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
        membershipRole: normalizeRoleToken(byEmail.role),
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
        membershipRole: normalizeRoleToken(preferred.role),
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
          membershipRole: normalizeRoleToken(membership.role),
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
    membershipRole: normalizeRoleToken(first.role),
  }
}

export function getMobileSession() {
  return readMobileSession()
}

export async function loginMobile({ login, password }) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase dla mobile-web.')
  }

  const emailCandidates = buildLoginEmailCandidates(login)
  const normalizedPassword = toText(password)

  if (!emailCandidates.length || !normalizedPassword) {
    throw new Error('Podaj login i haslo.')
  }

  const firebase = ensureFirebase()
  if (!firebase?.auth) {
    throw new Error('Nie udalo sie zainicjalizowac Firebase Auth.')
  }

  let credential
  let emailUsed = ''
  try {
    const result = await signInWithLoginCandidates(firebase.auth, emailCandidates, normalizedPassword)
    credential = result.credential
    emailUsed = toText(result.emailUsed).toLowerCase()
  } catch (error) {
    throw new Error(mapFirebaseLoginError(error))
  }

  try {
    const email = toText(credential.user.email || emailUsed || emailCandidates[0]).toLowerCase()
    const context = await resolveOrganizationContext(email, credential.user)
    const loginFromEmail = toText(email.split('@')[0]).toLowerCase()
    const workerContext = await resolveWorkerLoginForSession(
      context.orgId,
      email,
      loginFromEmail,
      credential.user.displayName,
    )
    const workerLogin = toText(workerContext.workerLogin || loginFromEmail)
    const effectiveRole =
      normalizeRoleToken(workerContext.workerRole) ||
      normalizeRoleToken(context.membershipRole) ||
      'WORKER'

    const session = writeMobileSession({
      token: `firebase-${credential.user.uid}`,
      uid: toText(credential.user.uid),
      email,
      login: email,
      orgId: toText(context.orgId),
      orgName: context.orgName,
      role: effectiveRole,
      workerLogin,
      workerName: toText(credential.user.displayName) || workerLogin || loginFromEmail,
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
