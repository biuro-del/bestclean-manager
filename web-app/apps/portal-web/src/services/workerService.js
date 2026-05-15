import { insertWorkerForOrg, workersForOrg } from '@dataconnect/generated'
import { executeMutation, executeQuery, mutationRef, queryRef } from 'firebase/data-connect'
import { ensureFirebase, isFirebaseConfigured } from '../firebase/firebaseClient'

const READ_CACHE_MS = 30000
const DEFAULT_FUNCTIONS_REGION = 'europe-west3'
const DEFAULT_FUNCTIONS_PROJECT = 'iclean-room'
const LOGIN_LOCAL_PART_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/
const workersCache = new Map()

function cachedWorkersKey(orgId) {
  return String(orgId ?? '').trim()
}

function invalidateWorkersCache(orgId) {
  const key = cachedWorkersKey(orgId)
  if (key) {
    workersCache.delete(key)
    return
  }
  workersCache.clear()
}

async function readWorkersCached(orgId, loader) {
  const key = cachedWorkersKey(orgId)
  const now = Date.now()
  const cached = key ? workersCache.get(key) : null

  if (cached?.promise) {
    return cached.promise
  }

  if (cached?.expiresAt > now && Array.isArray(cached.value)) {
    return cached.value
  }

  const promise = loader()
    .then((value) => {
      if (key) {
        workersCache.set(key, { value, expiresAt: Date.now() + READ_CACHE_MS, promise: null })
      }
      return value
    })
    .catch((error) => {
      if (key) {
        workersCache.delete(key)
      }
      throw error
    })

  if (key) {
    workersCache.set(key, { value: cached?.value ?? null, expiresAt: cached?.expiresAt ?? 0, promise })
  }

  return promise
}

function resolveNextWorkerId(rows = []) {
  let maxNumber = 0
  let padWidth = 3

  rows.forEach((row) => {
    const raw = String(row?.workerId ?? '').trim().toUpperCase()
    const match = /^W(\d+)$/.exec(raw)
    if (!match) {
      return
    }

    const numeric = Number.parseInt(match[1], 10)
    if (Number.isFinite(numeric) && numeric > maxNumber) {
      maxNumber = numeric
    }
    padWidth = Math.max(padWidth, match[1].length)
  })

  return `W${String(maxNumber + 1).padStart(padWidth, '0')}`
}

const DEPLOY_HINT =
  'Brak wdrozonej operacji Data Connect. Wykonaj: firebase login --reauth, potem firebase deploy --only dataconnect --project iclean-room.'

function extractNestedErrorMessage(rawMessage) {
  const text = String(rawMessage ?? '')
  if (!text) {
    return ''
  }

  try {
    const parsed = JSON.parse(text)
    const topMessage = String(parsed?.error?.message ?? '').trim()
    if (topMessage) {
      return topMessage
    }
  } catch {
    // ignore
  }

  return ''
}

function isOperationNotFoundMessage(rawMessage, operationName) {
  const message = String(rawMessage ?? '')
  const nested = extractNestedErrorMessage(message)
  const fullMessage = `${message} ${nested}`.toLowerCase()
  const operation = String(operationName ?? '').trim().toLowerCase()
  if (!operation) {
    return false
  }

  return (
    fullMessage.includes(`operation "${operation}" not found`) ||
    fullMessage.includes(`operation \\"${operation}\\" not found`) ||
    fullMessage.includes(`operation '${operation}' not found`) ||
    (fullMessage.includes('operation') && fullMessage.includes('not found') && fullMessage.includes(operation)) ||
    ((fullMessage.includes('"status":"not_found"') ||
      fullMessage.includes('"code":404') ||
      fullMessage.includes('"code":"404"')) &&
      fullMessage.includes(operation))
  )
}

function withOperationNotFoundHint(error, operationName) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (isOperationNotFoundMessage(message, operationName)) {
    return new Error(`${DEPLOY_HINT} Brak operacji: ${operationName}.`)
  }

  return error instanceof Error ? error : new Error(message || DEPLOY_HINT)
}

function asNullableText(value) {
  const raw = String(value ?? '').trim()
  return raw ? raw : null
}

function asBoolean(value, defaultValue = true) {
  if (typeof value === 'boolean') {
    return value
  }
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) {
    return defaultValue
  }
  if (['false', '0', 'no', 'nie'].includes(normalized)) {
    return false
  }
  if (['true', '1', 'yes', 'tak'].includes(normalized)) {
    return true
  }
  return defaultValue
}

function isTrue(value) {
  return String(value ?? '').trim().toLowerCase() === 'true'
}

function isLocalHttpEndpoint(value) {
  const endpoint = String(value ?? '').trim().toLowerCase()
  return endpoint.includes('://127.0.0.1') || endpoint.includes('://localhost')
}

function normalizeForComparison(value) {
  const raw = String(value ?? '').trim()
  if (!raw) {
    return ''
  }

  try {
    return raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
  } catch {
    return raw.toLowerCase()
  }
}

function normalizeWorkerRoleCanonical(value) {
  const normalized = normalizeForComparison(value)
  if (!normalized) {
    return 'WORKER'
  }
  if (normalized.includes('admin') || normalized.includes('administrator') || normalized.includes('owner')) {
    return 'ADMIN'
  }
  if (normalized.includes('kierownik') || normalized.includes('manager') || normalized.includes('menedzer')) {
    return 'MANAGER'
  }
  if (normalized.includes('koordynator') || normalized.includes('coordinator')) {
    return 'COORDINATOR'
  }
  return 'WORKER'
}

function normalizeLoginLocalPart(value) {
  const raw = String(value ?? '').trim().toLowerCase()
  const localPart = raw.includes('@') ? raw.split('@')[0] : raw
  if (!localPart) {
    throw new Error('Pole login jest wymagane.')
  }
  if (!LOGIN_LOCAL_PART_PATTERN.test(localPart)) {
    throw new Error('Login moze zawierac tylko litery, cyfry, ".", "-" oraz "_" i nie moze zaczynac/konczyc sie znakiem specjalnym.')
  }
  return localPart
}

function normalizeWorkerCredentialLogin(value) {
  const login = String(value ?? '').trim()
  if (!login) {
    throw new Error('Pole login jest wymagane.')
  }
  if (login.length > 80 || /[\u0000-\u001f\u007f]/.test(login)) {
    throw new Error('Podaj poprawny login pracownika.')
  }
  return login
}

function normalizeUniqueWorkerValue(value) {
  return String(value ?? '').trim().toLowerCase()
}

function findExistingWorkerForOrg(rows = [], login, email) {
  const normalizedLogin = normalizeUniqueWorkerValue(login)
  const normalizedEmail = normalizeUniqueWorkerValue(email)

  return (Array.isArray(rows) ? rows : []).find((row) => {
    const rowLogin = normalizeUniqueWorkerValue(row?.login ?? row?.workerLogin)
    const rowLoginEmail = normalizeUniqueWorkerValue(row?.loginEmail ?? row?.login_email)
    const rowEmail = normalizeUniqueWorkerValue(row?.email)
    return (
      (normalizedLogin && rowLogin === normalizedLogin) ||
      (normalizedEmail && (rowLoginEmail === normalizedEmail || rowEmail === normalizedEmail))
    )
  })
}

function createDuplicateWorkerError(existingWorker, login, email) {
  const sameLogin = normalizeUniqueWorkerValue(existingWorker?.login ?? existingWorker?.workerLogin) === normalizeUniqueWorkerValue(login)
  const rowLoginEmail = normalizeUniqueWorkerValue(existingWorker?.loginEmail ?? existingWorker?.login_email)
  const rowEmail = normalizeUniqueWorkerValue(existingWorker?.email)
  const normalizedEmail = normalizeUniqueWorkerValue(email)
  const sameEmail = normalizedEmail && (rowLoginEmail === normalizedEmail || rowEmail === normalizedEmail)

  if (sameLogin && sameEmail) {
    return new Error('Ten użytkownik już istnieje w tej organizacji. Login i email muszą być unikalne w obrębie jednej organizacji.')
  }
  if (sameLogin) {
    return new Error('Ten login jest już zajęty w tej organizacji.')
  }
  return new Error('Ten email jest już przypisany do użytkownika w tej organizacji.')
}

function resolveFunctionEndpoint(envKey, functionName) {
  const fromEnv = String(import.meta.env?.[envKey] ?? '').trim()
  const useEmulators = isTrue(import.meta.env.VITE_USE_EMULATORS)
  if (fromEnv && (!isLocalHttpEndpoint(fromEnv) || useEmulators)) {
    return fromEnv
  }

  if (functionName === 'authProvisionWorker') {
    return '/api/auth/provision-worker'
  }
  if (functionName === 'authRollbackWorker') {
    return '/api/auth/rollback-worker'
  }
  if (functionName === 'workerPasswordReveal') {
    return '/api/admin/worker-password/reveal'
  }
  if (functionName === 'workerPasswordSet') {
    return '/api/admin/worker-password/set'
  }

  if (import.meta.env.DEV && !useEmulators) {
    return `/__functions/${functionName}`
  }

  const projectId =
    String(import.meta.env.VITE_FIREBASE_PROJECT_ID ?? DEFAULT_FUNCTIONS_PROJECT).trim() || DEFAULT_FUNCTIONS_PROJECT
  const host = String(import.meta.env.VITE_FUNCTIONS_EMULATOR_HOST ?? '').trim()
  const port = Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT ?? 5001)
  if (useEmulators && host) {
    return `http://${host}:${port}/${projectId}/${DEFAULT_FUNCTIONS_REGION}/${functionName}`
  }

  return `https://${DEFAULT_FUNCTIONS_REGION}-${projectId}.cloudfunctions.net/${functionName}`
}

async function readResponsePayload(response) {
  let rawText = ''
  try {
    rawText = await response.text()
  } catch {
    rawText = ''
  }

  if (!rawText) {
    return { body: null, rawText: '' }
  }

  try {
    return { body: JSON.parse(rawText), rawText }
  } catch {
    return { body: null, rawText }
  }
}

function resolveFunctionErrorMessage(body, rawText = '', statusCode = null, endpoint = '') {
  if (!body || typeof body !== 'object') {
    const text = String(rawText ?? '').trim()
    if (!text) {
      return ''
    }

    const lowered = text.toLowerCase()
    const unauthorizedHtml =
      statusCode === 401 &&
      lowered.includes('<html') &&
      (lowered.includes('unauthorized') || lowered.includes('not have permission'))
    if (unauthorizedHtml) {
      return `HTTP 401 Unauthorized. Funkcja backendu jest zablokowana przez polityke IAM. Endpoint: ${endpoint}.`
    }

    const notFoundHtml =
      statusCode === 404 &&
      lowered.includes('<html') &&
      (lowered.includes('page not found') || lowered.includes('not found'))
    if (notFoundHtml) {
      return `Funkcja backendu nie jest wdrozona albo endpoint jest niepoprawny. Endpoint: ${endpoint}.`
    }

    return text.length > 260 ? `${text.slice(0, 260)}...` : text
  }

  return String(body?.error?.message ?? body?.message ?? '').trim()
}

async function callAuthorizedFunction(functionName, envKey, payload, fallbackMessage) {
  const firebase = ensureFirebase()
  const user = firebase?.auth?.currentUser ?? null
  if (!user) {
    throw new Error('Musisz byc zalogowany, aby wykonac te operacje.')
  }

  const idToken = await user.getIdToken(true)
  const endpoint = resolveFunctionEndpoint(envKey, functionName)

  let response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload ?? {}),
    })
  } catch (error) {
    const networkMessage = error instanceof Error ? error.message : String(error ?? '')
    throw new Error(`${fallbackMessage} Blad sieci podczas polaczenia z funkcja "${functionName}" (${endpoint}). ${networkMessage}`)
  }

  const { body, rawText } = await readResponsePayload(response)
  if (!response.ok) {
    const message = resolveFunctionErrorMessage(body, rawText, response.status, endpoint)
    const statusLabel = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`
    const error = new Error(message || `${fallbackMessage} (${statusLabel}). Funkcja: ${functionName}. Endpoint: ${endpoint}.`)
    error.status = response.status
    error.endpoint = endpoint
    error.functionName = functionName
    error.rawText = rawText
    throw error
  }

  return body ?? {}
}

async function authProvisionWorker(payload) {
  return callAuthorizedFunction(
    'authProvisionWorker',
    'VITE_AUTH_PROVISION_WORKER_ENDPOINT',
    payload,
    'Nie udalo sie utworzyc lub podpiac konta Firebase Authentication.',
  )
}

async function authRollbackWorker(rollbackToken) {
  if (!rollbackToken) {
    return null
  }

  return callAuthorizedFunction(
    'authRollbackWorker',
    'VITE_AUTH_ROLLBACK_WORKER_ENDPOINT',
    { rollbackToken },
    'Nie udalo sie wykonac rollback konta Firebase Authentication.',
  )
}

async function workerPasswordReveal(payload) {
  return callAuthorizedFunction(
    'workerPasswordReveal',
    'VITE_WORKER_PASSWORD_REVEAL_ENDPOINT',
    payload,
    'Nie udalo sie pobrac hasla pracownika.',
  )
}

async function workerPasswordSet(payload) {
  return callAuthorizedFunction(
    'workerPasswordSet',
    'VITE_WORKER_PASSWORD_SET_ENDPOINT',
    payload,
    'Nie udalo sie zapisac hasla pracownika.',
  )
}

function getDataConnectOrThrow() {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  const firebase = ensureFirebase()
  if (!firebase?.dataConnect) {
    throw new Error('Nie udało się zainicjalizować Data Connect.')
  }

  return firebase.dataConnect
}

async function insertWorkerWithMembership(vars) {
  const dataConnect = getDataConnectOrThrow()

  try {
    await executeMutation(mutationRef(dataConnect, 'InsertWorkerWithMembershipForOrg', vars))
  } catch (error) {
    throw withOperationNotFoundHint(error, 'InsertWorkerWithMembershipForOrg')
  }
}

async function assertCanManageWorkersForOrg(orgId) {
  const dataConnect = getDataConnectOrThrow()

  try {
    await executeQuery(queryRef(dataConnect, 'CanManageWorkersForOrg', { orgId }))
  } catch (error) {
    throw withOperationNotFoundHint(error, 'CanManageWorkersForOrg')
  }
}

function mapWorker(orgId, row) {
  const login = String(row.login ?? row.workerLogin ?? row.workerId ?? '').trim()
  const workerId = String(row.workerId ?? login).trim() || login
  const workerName = String(
    row.workerName ?? row.workername ?? row.worker_name ?? row.name ?? row.displayName ?? row.fullName ?? login,
  ).trim()
  const workerType = String(row.workerType ?? row.role ?? 'Pracownik').trim()
  const loginEmail = String(row.loginEmail ?? row.email ?? '').trim()

  return {
    id: workerId,
    workerId,
    orgId,
    login,
    workerLogin: login,
    workerName,
    fullName: workerName,
    name: workerName,
    role: workerType,
    type: workerType,
    active: Boolean(row.active ?? true),
    authUid: String(row.authUid ?? row.auth_uid ?? '').trim(),
    email: loginEmail,
    phone: String(row.phone ?? '').trim(),
    editedBy: String(row.updatedBy ?? row.edit ?? '').trim(),
    addedAt: String(row.createdAt ?? '').trim(),
    editedAt: String(row.updatedAt ?? '').trim(),
  }
}

export async function getWorkers(orgId, filters = {}) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  ensureFirebase()
  const rows = await readWorkersCached(orgId, async () => {
    const response = await workersForOrg({ orgId })
    return response?.data?.workers ?? []
  })

  let workers = rows.map((row) => mapWorker(orgId, row))

  const q = String(filters.q ?? '').trim().toLowerCase()
  if (q) {
    workers = workers.filter((worker) => {
      const haystack = [worker.id, worker.workerId, worker.login, worker.name, worker.role, worker.phone, worker.email]
        .map((value) => String(value ?? '').toLowerCase())
        .join(' ')
      return haystack.includes(q)
    })
  }

  const type = String(filters.type ?? '').trim().toLowerCase()
  if (type) {
    workers = workers.filter((worker) => String(worker.type ?? '').toLowerCase().includes(type))
  }

  return workers
}

export async function getWorkerById(orgId, workerId) {
  const workers = await getWorkers(orgId)
  return workers.find((worker) => worker.id === workerId) ?? null
}

export async function createWorker(orgId, payload) {
  const login = String(payload?.login ?? payload?.email ?? `worker-${Date.now()}`).trim()
  if (!login) {
    throw new Error('Pole login jest wymagane.')
  }

  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  const workerName = String(payload?.workerName ?? payload?.name ?? payload?.fullName ?? '').trim() || null
  const workerType = String(payload?.role ?? payload?.workerType ?? '').trim() || null
  const loginEmail = String(payload?.loginEmail ?? payload?.email ?? '').trim() || null
  const phone = String(payload?.phone ?? '').trim() || null
  ensureFirebase()
  const existingResponse = await workersForOrg({ orgId })
  const existingRows = existingResponse?.data?.workers ?? []
  const workerId = resolveNextWorkerId(existingRows)

  await insertWorkerForOrg({
    orgId,
    login,
    workerName,
    loginEmail,
    role: workerType,
    active: payload?.active ?? true,
    email: loginEmail,
    phone,
    workerType,
    workerId,
  })
  invalidateWorkersCache(orgId)

  return {
    id: workerId,
    workerId,
    orgId,
    login,
    name: workerName ?? login,
    role: workerType ?? 'Pracownik',
    type: workerType ?? 'Pracownik',
    active: payload?.active ?? true,
    email: loginEmail ?? '',
    phone: phone ?? '',
    ...payload,
  }
}

async function createWorkerUserViaProvision(orgId, payload) {
  const normalizedOrgId = String(orgId ?? '').trim()
  if (!normalizedOrgId) {
    throw new Error('Brak orgId podczas dodawania uzytkownika.')
  }

  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupelnij web-app/.env.')
  }

  const loginLocalPart = normalizeLoginLocalPart(payload?.login ?? payload?.email)
  const password = String(payload?.password ?? '').trim()
  if (!password || password.length < 6) {
    throw new Error('Haslo tymczasowe musi miec co najmniej 6 znakow.')
  }

  const workerName = String(payload?.displayName ?? payload?.workerName ?? payload?.name ?? '').trim() || loginLocalPart
  const role = normalizeWorkerRoleCanonical(payload?.role)
  if (!role || role === 'ADMIN') {
    throw new Error('Nowy uzytkownik nie moze byc tworzony z rola Admin.')
  }
  const workerType = String(payload?.workerType ?? payload?.role ?? role).trim() || role
  const active = asBoolean(payload?.active, true)
  const phone = asNullableText(payload?.phone)

  ensureFirebase()
  await assertCanManageWorkersForOrg(normalizedOrgId)

  const existingResponse = await workersForOrg({ orgId: normalizedOrgId })
  const existingRows = existingResponse?.data?.workers ?? []
  const requestedEmail = asNullableText(payload?.email ?? payload?.loginEmail)
  const existingWorker = findExistingWorkerForOrg(existingRows, loginLocalPart, requestedEmail)
  if (existingWorker) {
    throw createDuplicateWorkerError(existingWorker, loginLocalPart, requestedEmail)
  }
  const workerId = resolveNextWorkerId(existingRows)

  const provisionResponse = await authProvisionWorker({
    orgId: normalizedOrgId,
    loginLocalPart,
    password,
    workerName,
    roleLabel: workerType,
    active,
  })

  const loginEmail = asNullableText(provisionResponse?.email)
  const authUid = asNullableText(provisionResponse?.uid)
  const existing = Boolean(provisionResponse?.existing)
  const rollbackToken = asNullableText(provisionResponse?.rollbackToken)

  if (!loginEmail || !authUid) {
    throw new Error('Backend authProvisionWorker zwrocil niepelne dane: brakuje emaila albo uid.')
  }

  try {
    await insertWorkerWithMembership({
      orgId: normalizedOrgId,
      login: loginLocalPart,
      workerName,
      loginEmail,
      authUid,
      role,
      active,
      email: loginEmail,
      phone,
      workerType,
      workerId,
    })
  } catch (error) {
    if (!existing && rollbackToken) {
      try {
        await authRollbackWorker(rollbackToken)
      } catch (rollbackError) {
        const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError ?? '')
        const insertMessage = error instanceof Error ? error.message : String(error ?? '')
        throw new Error(`${insertMessage} Dodatkowo rollback konta Firebase Auth nie powiodl sie: ${rollbackMessage}`)
      }
    }
    throw error
  }

  let passwordVaultWarning = ''
  if (payload?.storePassword !== false) {
    try {
      await setWorkerPassword(normalizedOrgId, loginLocalPart, password, { skipAuthUpdate: true })
    } catch (error) {
      passwordVaultWarning = error instanceof Error ? error.message : String(error ?? '')
    }
  }

  invalidateWorkersCache(normalizedOrgId)

  return {
    id: workerId,
    workerId,
    orgId: normalizedOrgId,
    login: loginLocalPart,
    workerLogin: loginLocalPart,
    workerName,
    name: workerName,
    role,
    type: workerType,
    active,
    email: loginEmail,
    loginEmail,
    authUid,
    phone: phone ?? '',
    passwordVaultWarning,
  }
}

export async function createWorkerUser(orgId, payload) {
  return createWorkerUserViaProvision(orgId, payload)
}

export async function revealWorkerPassword(orgId, login) {
  const normalizedOrgId = String(orgId ?? '').trim()
  const normalizedLogin = normalizeWorkerCredentialLogin(login)
  if (!normalizedOrgId) {
    throw new Error('Brak orgId podczas pobierania hasla pracownika.')
  }

  const response = await workerPasswordReveal({
    orgId: normalizedOrgId,
    login: normalizedLogin,
  })

  return response?.data ?? response ?? {}
}

export async function setWorkerPassword(orgId, login, password, options = {}) {
  const normalizedOrgId = String(orgId ?? '').trim()
  const normalizedLogin = normalizeWorkerCredentialLogin(login)
  const normalizedPassword = String(password ?? '').trim()
  if (!normalizedOrgId) {
    throw new Error('Brak orgId podczas zapisu hasla pracownika.')
  }
  if (normalizedPassword.length < 6) {
    throw new Error('Haslo musi miec co najmniej 6 znakow.')
  }

  const response = await workerPasswordSet({
    orgId: normalizedOrgId,
    login: normalizedLogin,
    password: normalizedPassword,
    skipAuthUpdate: Boolean(options?.skipAuthUpdate),
  })

  return response?.data ?? response ?? {}
}

export async function updateWorker(orgId, workerId, payload) {
  const login = String(workerId ?? payload?.login ?? '').trim()
  if (!login) {
    throw new Error('Brak loginu pracownika do aktualizacji.')
  }

  const dataConnect = getDataConnectOrThrow()

  try {
    await executeMutation(
      mutationRef(dataConnect, 'UpdateWorkerForOrg', {
        orgId,
        login,
        workerName: asNullableText(payload?.workerName ?? payload?.name ?? payload?.fullName),
        loginEmail: asNullableText(payload?.loginEmail ?? payload?.email),
        role: asNullableText(payload?.role ?? payload?.workerType) ?? 'Worker',
        active: payload?.active ?? true,
        email: asNullableText(payload?.email ?? payload?.loginEmail),
        phone: asNullableText(payload?.phone),
        workerType: asNullableText(payload?.workerType ?? payload?.role),
        workerId: asNullableText(payload?.workerId ?? payload?.id) ?? login,
        edit: asNullableText(payload?.edit ?? payload?.editedBy),
      }),
    )
  } catch (error) {
    throw withOperationNotFoundHint(error, 'UpdateWorkerForOrg')
  }
  invalidateWorkersCache(orgId)

  return {
    id: String(payload?.workerId ?? payload?.id ?? login).trim() || login,
    workerId: String(payload?.workerId ?? payload?.id ?? login).trim() || login,
    orgId,
    login,
    ...payload,
  }
}

export async function deleteWorker(orgId, workerId) {
  return {
    success: true,
    orgId,
    workerId,
  }
}
