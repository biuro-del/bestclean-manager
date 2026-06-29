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

async function readWorkersCached(orgId, loader, options = {}) {
  const key = cachedWorkersKey(orgId)
  const now = Date.now()
  const cached = key ? workersCache.get(key) : null
  const force = Boolean(options?.force)

  if (!force && cached?.promise) {
    return cached.promise
  }

  if (!force && cached?.expiresAt > now && Array.isArray(cached.value)) {
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
  if (typeof value === 'number') {
    return value !== 0
  }
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) {
    return defaultValue
  }
  if (['false', '0', 'no', 'nie', 'inactive', 'disabled', 'nieaktywny', 'nieaktywna'].includes(normalized)) {
    return false
  }
  if (['true', '1', 'yes', 'tak', 'active', 'aktywny', 'aktywna', 'enabled'].includes(normalized)) {
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

function isCloudFunctionsEndpoint(value) {
  const endpoint = String(value ?? '').trim().toLowerCase()
  if (!endpoint) {
    return false
  }

  try {
    return new URL(endpoint).hostname.endsWith('.cloudfunctions.net')
  } catch {
    return endpoint.includes('cloudfunctions.net')
  }
}

function isRelativeApiEndpoint(value) {
  return String(value ?? '').trim().startsWith('/api/')
}

function isLocalWorkerAdminEndpoint(value) {
  const endpoint = String(value ?? '').trim()
  return (
    endpoint.startsWith('/api/admin/worker-profile/') ||
    endpoint.startsWith('/api/admin/worker-password/') ||
    endpoint === '/api/auth/provision-worker' ||
    endpoint === '/api/auth/rollback-worker'
  )
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

function formatWorkerRoleLabel(value, fallback = 'Pracownik') {
  const raw = String(value ?? '').trim()
  if (!raw) {
    return fallback
  }

  const upper = raw.toUpperCase()
  if (upper === 'ADMIN') return 'ADMIN'
  if (upper === 'MANAGER') return 'Kierownik'
  if (upper === 'COORDINATOR') return 'Koordynator'
  if (upper === 'WORKER') return 'Pracownik'
  return raw
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

function hasAsciiControlCharacter(value) {
  const text = String(value ?? '')
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code <= 31 || code === 127) {
      return true
    }
  }
  return false
}

function normalizeWorkerCredentialLogin(value) {
  const login = String(value ?? '').trim()
  if (!login) {
    throw new Error('Pole login jest wymagane.')
  }
  if (login.length > 80 || hasAsciiControlCharacter(login)) {
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

function findExistingWorkerIdForOrg(rows = [], workerId) {
  const normalizedWorkerId = normalizeUniqueWorkerValue(workerId)
  if (!normalizedWorkerId) {
    return null
  }

  return (Array.isArray(rows) ? rows : []).find((row) => {
    const rowWorkerId = normalizeUniqueWorkerValue(row?.workerId ?? row?.worker_id ?? row?.id)
    return rowWorkerId === normalizedWorkerId
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

function createDuplicateWorkerIdError(workerId) {
  return new Error(`ID pracownika ${workerId} jest już zajęte w tej organizacji.`)
}

function resolveFunctionEndpoint(envKey, functionName) {
  const fromEnv = String(import.meta.env?.[envKey] ?? '').trim()
  const useEmulators = isTrue(import.meta.env.VITE_USE_EMULATORS)
  const apiEndpoints = {
    authProvisionWorker: '/api/auth/provision-worker',
    authRollbackWorker: '/api/auth/rollback-worker',
    workerPasswordReveal: '/api/admin/worker-password/reveal',
    workerPasswordSet: '/api/admin/worker-password/set',
    workerProfileUpdate: '/api/admin/worker-profile/update',
    workerProfileDelete: '/api/admin/worker-profile/delete',
  }
  if (apiEndpoints[functionName] && !useEmulators) {
    return apiEndpoints[functionName]
  }
  if (fromEnv && isCloudFunctionsEndpoint(fromEnv) && !useEmulators) {
    return apiEndpoints[functionName] || `/__functions/${functionName}`
  }
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
  if (functionName === 'workerProfileUpdate') {
    return '/api/admin/worker-profile/update'
  }
  if (functionName === 'workerProfileDelete') {
    return '/api/admin/worker-profile/delete'
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
    const lowered = text.toLowerCase()
    if (lowered.includes('forbidden_host')) {
      return 'FORBIDDEN_HOST: worker-profile trafia bezposrednio w zdalny hosting, ktory odrzuca localhost. Zatrzymaj web-only Vite i uruchom root `npm run dev`, zeby zapis szedl przez lokalny backend.'
    }
    if (isLocalWorkerAdminEndpoint(endpoint) && (lowered.includes('econnrefused') || lowered.includes('proxy error') || lowered.includes('http proxy error'))) {
      return 'Proxy endpointu pracownika nie odpowiada. Uruchom root `npm run dev`, zeby wystartowal lokalny backend dla zapisu pracownikow.'
    }
    const looksLikeHtml = lowered.includes('<html') || lowered.includes('<!doctype html')
    if (statusCode >= 500 && isRelativeApiEndpoint(endpoint) && (!text || looksLikeHtml)) {
      if (isLocalWorkerAdminEndpoint(endpoint)) {
        return 'Proxy endpointu pracownika nie odpowiada. Uruchom root `npm run dev` i sprawdz http://127.0.0.1:8080/healthz.'
      }
      return 'Lokalny backend API nie odpowiada albo uruchomiono samo web-app bez procesu root `npm run dev`. Uruchom `npm run dev` z katalogu projektu albo ustaw VITE_DEV_API_PROXY_TARGET na dzialajacy backend.'
    }
    if (!text) {
      return ''
    }

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

  const code = String(body?.error?.code ?? body?.code ?? '').trim()
  const message = String(body?.error?.message ?? body?.message ?? '').trim()
  if (code.toUpperCase() === 'UPSTREAM_FORBIDDEN_HOST') {
    return `UPSTREAM_FORBIDDEN_HOST: zdalny Firebase Hosting odrzucil worker-profile proxy albo dziala stary proces dev na localhost/::1:5173. Otworz portal przez http://127.0.0.1:5173, zatrzymaj stare procesy Vite i uruchom root npm run dev od nowa. Jesli blad zostaje, ustaw lokalny backend worker-profile: WORKER_PROFILE_MODE=local/direct + konfiguracja DB i Firebase Admin. ${message}`.trim()
  }
  if (code.toUpperCase() === 'DB_CONFIG_MISSING') {
    return `DB_CONFIG_MISSING: worker-profile dziala lokalnie, ale backend nie ma konfiguracji DB. Dodaj lokalne DB/Firebase Admin albo testuj przez wdrozony Firebase Hosting. ${message}`.trim()
  }
  if (code.toUpperCase() === 'DB_TLS_CERT_VERIFY_FAILED') {
    return `DB_TLS_CERT_VERIFY_FAILED: Cloud SQL auth dziala, ale lokalny antivirus/proxy przechwytuje polaczenie TLS do bazy. Wylacz skanowanie SSL/TLS dla Node/Cloud SQL albo testuj worker-profile przez wdrozony Firebase Hosting. ${message}`.trim()
  }
  if (code.toUpperCase() === 'LOGIN_CHANGE_REQUIRES_DB') {
    return `LOGIN_CHANGE_REQUIRES_DB: backend nadal dziala na starszej wersji bez zmiany loginu przez Data Connect. Uruchom ponownie root npm run dev; jesli to wdrozenie, wgraj aktualny connector Data Connect. ${message}`.trim()
  }
  if (code.toUpperCase() === 'WORKER_PROFILE_DELETE_REQUIRES_DB') {
    return 'Nie udało się usunąć pracownika w lokalnym trybie Cloud SQL. Odświeżam tę operację przez Data Connect; jeśli błąd wróci, zrestartuj dev stack.'
  }
  if (code.toUpperCase() === 'FIREBASE_TLS_CERT_ERROR') {
    return `FIREBASE_TLS_CERT_ERROR: lokalny Node backend nie ufa certyfikatowi Google/Firebase. Zrestartuj root npm run dev; dev-local ustawia NODE_OPTIONS=--use-system-ca. Jesli blad zostaje, dodaj firmowy certyfikat CA przez NODE_EXTRA_CA_CERTS. ${message}`.trim()
  }
  if (code.toUpperCase() === 'FIREBASE_ADMIN_CREDENTIALS_MISSING') {
    return `FIREBASE_ADMIN_CREDENTIALS_MISSING: backend nie ma poswiadczen Firebase Admin. Dodaj serviceAccountKey.json obok index.js albo ustaw GOOGLE_APPLICATION_CREDENTIALS w root .env.local i zrestartuj npm run dev. ${message}`.trim()
  }
  if (code.toUpperCase() === 'FIREBASE_AUTH_UNAVAILABLE') {
    return `FIREBASE_AUTH_UNAVAILABLE: lokalny backend nie moze polaczyc sie z Firebase Auth. Sprawdz internet/proxy dla Node. Jesli to certyfikat, zrestartuj root npm run dev i sprawdz NODE_OPTIONS=--use-system-ca. ${message}`.trim()
  }
  if (code.toUpperCase() === 'LOGIN_CHANGE_FORBIDDEN') {
    return message || 'Login pracownika moze zmienic tylko Admin.'
  }
  if (code.toUpperCase() === 'FORBIDDEN' && isLocalWorkerAdminEndpoint(endpoint)) {
    return message || 'Brak uprawnien do zapisania danych pracownika. Sprawdz role konta w tej organizacji.'
  }
  if (
    code.toUpperCase() === 'FORBIDDEN_HOST' ||
    message.toUpperCase().includes('FORBIDDEN_HOST') ||
    message.toLowerCase().includes('available only via firebase hosting')
  ) {
    return 'FORBIDDEN_HOST: worker-profile trafia bezposrednio w zdalny hosting, ktory odrzuca localhost. Uruchom root `npm run dev`, zeby request szedl przez lokalny backend.'
  }
  if (code && message) {
    return `${code}: ${message}`
  }
  return message || code
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
    if (isLocalWorkerAdminEndpoint(endpoint)) {
      throw new Error(`${fallbackMessage} Proxy endpointu pracownika nie odpowiada dla ${endpoint}. Uruchom ponownie dev server. ${networkMessage}`)
    }
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

async function workerProfileUpdate(payload) {
  return callAuthorizedFunction(
    'workerProfileUpdate',
    'VITE_WORKER_PROFILE_UPDATE_ENDPOINT',
    payload,
    'Nie udalo sie zaktualizowac profilu pracownika.',
  )
}

async function workerProfileDelete(payload) {
  return callAuthorizedFunction(
    'workerProfileDelete',
    'VITE_WORKER_PROFILE_DELETE_ENDPOINT',
    payload,
    'Nie udalo sie usunac pracownika.',
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
  const rawRole = String(row.role ?? '').trim()
  const workerType = String(row.workerType ?? '').trim()
  const systemRole = normalizeWorkerRoleCanonical(rawRole || workerType)
  const role = rawRole || systemRole
  const displayType = workerType || formatWorkerRoleLabel(rawRole || systemRole, 'Pracownik')
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
    role,
    systemRole,
    type: displayType,
    workerType: displayType,
    active: asBoolean(row.active, true),
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
  const force = Boolean(
    filters?.force ||
      filters?.refresh ||
      filters?.forceRefresh ||
      filters?.bypassCache ||
      filters?.noCache ||
      filters?.fetchPolicy === 'SERVER_ONLY',
  )
  const fetchPolicy = String(filters?.fetchPolicy ?? (force ? 'SERVER_ONLY' : '')).trim()
  const rows = await readWorkersCached(orgId, async () => {
    const response = fetchPolicy
      ? await workersForOrg({ orgId }, { fetchPolicy })
      : await workersForOrg({ orgId })
    return response?.data?.workers ?? []
  }, { force })

  let workers = rows.map((row) => mapWorker(orgId, row))

  const q = String(filters.q ?? '').trim().toLowerCase()
  if (q) {
    workers = workers.filter((worker) => {
      const haystack = [worker.id, worker.workerId, worker.login, worker.name, worker.role, worker.type, worker.workerType, worker.phone, worker.email]
        .map((value) => String(value ?? '').toLowerCase())
        .join(' ')
      return haystack.includes(q)
    })
  }

  const type = String(filters.type ?? '').trim().toLowerCase()
  if (type) {
    workers = workers.filter((worker) =>
      String(worker.workerType ?? worker.type ?? worker.role ?? '').toLowerCase().includes(type),
    )
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
  const requestedWorkerId = asNullableText(payload?.workerId ?? payload?.id)
  if (requestedWorkerId && findExistingWorkerIdForOrg(existingRows, requestedWorkerId)) {
    throw createDuplicateWorkerIdError(requestedWorkerId)
  }
  const workerId = requestedWorkerId || resolveNextWorkerId(existingRows)

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
  if (!role) {
    throw new Error('Wybierz poprawny typ pracownika.')
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
  const requestedWorkerId = asNullableText(payload?.workerId ?? payload?.id)
  if (requestedWorkerId && findExistingWorkerIdForOrg(existingRows, requestedWorkerId)) {
    throw createDuplicateWorkerIdError(requestedWorkerId)
  }
  const workerId = requestedWorkerId || resolveNextWorkerId(existingRows)

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
    workerType,
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

  const data = response?.data ?? response ?? {}
  if (!data?.hasPassword) {
    throw new Error('Backend nie potwierdzil zapisu hasla pracownika. Odswiez dane i sprobuj ponownie.')
  }

  return data
}

export async function updateWorker(orgId, workerId, payload) {
  const login = String(workerId ?? payload?.login ?? '').trim()
  if (!login) {
    throw new Error('Brak loginu pracownika do aktualizacji.')
  }

  const active = asBoolean(payload?.active, true)
  const newLogin = asNullableText(payload?.newLogin ?? payload?.nextLogin ?? payload?.loginNew)
  const response = await workerProfileUpdate({
    orgId,
    login,
    newLogin,
    workerId: asNullableText(payload?.workerId ?? payload?.id) ?? login,
    name: asNullableText(payload?.workerName ?? payload?.name ?? payload?.fullName),
    email: asNullableText(payload?.loginEmail ?? payload?.email),
    phone: asNullableText(payload?.phone),
    role: asNullableText(payload?.role ?? payload?.workerType) ?? 'WORKER',
    workerType: asNullableText(payload?.workerType ?? payload?.role) ?? 'WORKER',
    active,
    editedBy: asNullableText(payload?.edit ?? payload?.editedBy),
    authUid: asNullableText(payload?.authUid ?? payload?.uid),
  })

  invalidateWorkersCache(orgId)

  const responseWorker = response?.data?.worker
  if (!responseWorker || typeof responseWorker !== 'object' || !String(responseWorker?.login ?? '').trim()) {
    throw new Error('Backend nie potwierdzil trwalego zapisu pracownika. Odswiez dane i sprobuj ponownie.')
  }
  if (String(response?.data?.storage ?? '').trim() === 'dataconnect' && response?.data?.persistenceVerified !== true) {
    throw new Error('Backend worker-profile dziala na starej wersji i nie potwierdza zapisu Data Connect. Zrestartuj root npm run dev albo wdroz aktualny backend.')
  }

  const responseLogin = String(responseWorker?.login ?? newLogin ?? login).trim() || login
  const responseWorkerId = String(responseWorker?.workerId ?? responseWorker?.id ?? payload?.workerId ?? payload?.id ?? responseLogin).trim() || responseLogin
  const responseEmail = String(responseWorker?.email ?? responseWorker?.loginEmail ?? '').trim()
  const responseActive = asBoolean(responseWorker?.active, active)
  const responseRole = String(responseWorker?.role ?? responseWorker?.systemRole ?? 'WORKER').trim() || 'WORKER'
  const responseDisplayType = String(
    responseWorker?.workerType ??
      responseWorker?.type ??
      formatWorkerRoleLabel(responseRole, 'Pracownik'),
  ).trim() || formatWorkerRoleLabel(responseRole, 'Pracownik')

  return {
    ...responseWorker,
    id: responseWorkerId,
    workerId: responseWorkerId,
    orgId,
    login: responseLogin,
    workerLogin: String(responseWorker?.workerLogin ?? responseWorker?.login ?? responseLogin).trim() || responseLogin,
    name: String(responseWorker?.name ?? responseWorker?.workerName ?? responseLogin).trim() || responseLogin,
    workerName: String(responseWorker?.workerName ?? responseWorker?.name ?? responseLogin).trim() || responseLogin,
    role: responseRole,
    systemRole: normalizeWorkerRoleCanonical(responseRole),
    type: responseDisplayType,
    workerType: responseDisplayType,
    email: responseEmail,
    loginEmail: String(responseWorker?.loginEmail ?? responseWorker?.email ?? responseEmail).trim(),
    active: responseActive,
    authUpdated: Boolean(response?.data?.authUpdated),
    authWarning: String(response?.data?.authWarning ?? '').trim(),
    storage: String(response?.data?.storage ?? '').trim(),
    persistenceVerified: Boolean(response?.data?.persistenceVerified),
    loginChangeSkipped: Boolean(response?.data?.loginChangeSkipped),
  }
}

export async function deleteWorker(orgId, workerId, payload = {}) {
  const login = String(payload?.login ?? payload?.workerLogin ?? workerId ?? '').trim()
  if (!login) {
    throw new Error('Brak loginu pracownika do usuniecia.')
  }

  const response = await workerProfileDelete({
    orgId,
    login,
    workerId: asNullableText(payload?.workerId ?? payload?.id ?? workerId),
    authUid: asNullableText(payload?.authUid ?? payload?.uid),
  })

  invalidateWorkersCache(orgId)

  return response?.data ?? response ?? {}
}
