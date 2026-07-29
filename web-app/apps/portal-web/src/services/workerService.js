import { platformContextHeaders } from './platformDataConnectService'
import { ensureFirebase, isFirebaseConfigured } from '../firebase/firebaseClient'

const READ_CACHE_MS = 30000
const DEFAULT_FUNCTIONS_REGION = 'europe-west3'
const DEFAULT_FUNCTIONS_PROJECT = 'iclean-room'
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
    endpoint.startsWith('/api/admin/workers/') ||
    endpoint === '/api/admin/workers' ||
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
  if (normalized === 'owner' || normalized.includes('wlasciciel')) {
    return 'OWNER'
  }
  if (normalized.includes('admin') || normalized.includes('administrator')) {
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
  if (upper === 'OWNER') return 'Owner'
  if (upper === 'ADMIN') return 'ADMIN'
  if (upper === 'MANAGER') return 'Manager'
  if (upper === 'COORDINATOR') return 'Koordynator'
  if (upper === 'WORKER') return 'Pracownik'
  return raw
}

function normalizeWorkerEmail(value) {
  const email = String(value ?? '').trim().toLowerCase()
  if (!email || email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Podaj poprawny email pracownika.')
  }
  return email
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

function normalizeWorkerLogin(value) {
  const login = String(value ?? '').trim()
  if (!login) {
    throw new Error('Pole login jest wymagane.')
  }
  if (login.length > 80 || hasAsciiControlCharacter(login)) {
    throw new Error('Podaj poprawny login pracownika.')
  }
  return login
}

function resolveFunctionEndpoint(envKey, functionName) {
  const fromEnv = String(import.meta.env?.[envKey] ?? '').trim()
  const useEmulators = isTrue(import.meta.env.VITE_USE_EMULATORS)
  const apiEndpoints = {
    adminUsers: '/api/admin/users',
    workersList: '/api/admin/workers',
    workerIdNext: '/api/admin/worker-id/next',
    workerPasswordSet: '/api/admin/worker-password/set',
    workerProfileUpdate: '/api/admin/worker-profile/update',
    workerProfileDelete: '/api/admin/worker-profile/delete',
    workerRestore: '/api/admin/workers/restore',
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

  if (apiEndpoints[functionName]) {
    return apiEndpoints[functionName]
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
      (lowered.includes('page not found') ||
        lowered.includes('not found') ||
        lowered.includes('nie znaleziono strony') ||
        lowered.includes('ta strona best clean nie istnieje'))
    if (notFoundHtml) {
      if (isLocalWorkerAdminEndpoint(endpoint)) {
        return 'Endpoint zapisu pracownika zwrocil strone 404 HTML zamiast JSON. Najczestsza przyczyna: Vite proxy trafia w zly proces na porcie 8080 albo uruchomiono samo `npm run dev:web`. Uruchom `npm run dev` z katalogu glownego projektu i otworz http://127.0.0.1:5173.'
      }
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
    return `FIREBASE_TLS_CERT_ERROR: lokalny Node backend nie ufa certyfikatowi Google/Firebase. Zrestartuj root npm run dev; dev-local wlacza systemowy CA albo lokalny awaryjny tryb TLS, gdy Node tego nie wspiera. Jesli blad zostaje, dodaj firmowy certyfikat CA przez NODE_EXTRA_CA_CERTS. ${message}`.trim()
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

async function callAuthorizedFunction(functionName, envKey, payload, fallbackMessage, options = {}) {
  const firebase = ensureFirebase()
  const user = firebase?.auth?.currentUser ?? null
  if (!user) {
    throw new Error('Musisz byc zalogowany, aby wykonac te operacje.')
  }

  const endpoint = resolveFunctionEndpoint(envKey, functionName)
  const method = String(options?.method ?? 'POST').toUpperCase()
  const query = new URLSearchParams()
  Object.entries(options?.query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value))
    }
  })
  const requestEndpoint = query.size
    ? `${endpoint}${endpoint.includes('?') ? '&' : '?'}${query.toString()}`
    : endpoint
  const requestBody = method === 'GET' ? null : JSON.stringify(payload ?? {})

  const sendRequest = async (forceTokenRefresh = false) => {
    const idToken = await user.getIdToken(forceTokenRefresh)
    return fetch(requestEndpoint, {
      method,
      headers: {
        ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
        Authorization: `Bearer ${idToken}`,
        ...platformContextHeaders(),
      },
      ...(method === 'GET' ? {} : { body: requestBody }),
    })
  }

  let response
  try {
    response = await sendRequest(false)
    if (response.status === 401) {
      response = await sendRequest(true)
    }
  } catch (error) {
    const networkMessage = error instanceof Error ? error.message : String(error ?? '')
    if (isLocalWorkerAdminEndpoint(requestEndpoint)) {
      throw new Error(`${fallbackMessage} Proxy endpointu pracownika nie odpowiada dla ${requestEndpoint}. Uruchom ponownie dev server. ${networkMessage}`)
    }
    throw new Error(`${fallbackMessage} Blad sieci podczas polaczenia z funkcja "${functionName}" (${requestEndpoint}). ${networkMessage}`)
  }

  const { body, rawText } = await readResponsePayload(response)
  if (!response.ok) {
    const message = resolveFunctionErrorMessage(body, rawText, response.status, requestEndpoint)
    const statusLabel = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`
    const error = new Error(message || `${fallbackMessage} (${statusLabel}). Funkcja: ${functionName}. Endpoint: ${requestEndpoint}.`)
    error.status = response.status
    error.endpoint = requestEndpoint
    error.functionName = functionName
    error.rawText = rawText
    throw error
  }

  return body ?? {}
}

async function adminUsersCreate(payload) {
  return callAuthorizedFunction(
    'adminUsers',
    'VITE_ADMIN_USERS_ENDPOINT',
    payload,
    'Nie udalo sie utworzyc pracownika.',
  )
}

async function workersList(orgId) {
  return callAuthorizedFunction(
    'workersList',
    'VITE_WORKERS_LIST_ENDPOINT',
    null,
    'Nie udalo sie pobrac pracownikow.',
    { method: 'GET', query: { orgId } },
  )
}

async function workerIdNext(orgId) {
  return callAuthorizedFunction(
    'workerIdNext',
    'VITE_WORKER_ID_NEXT_ENDPOINT',
    null,
    'Nie udalo sie pobrac kolejnego ID pracownika.',
    { method: 'GET', query: { orgId } },
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

async function workerRestore(payload) {
  return callAuthorizedFunction(
    'workerRestore',
    'VITE_WORKER_RESTORE_ENDPOINT',
    payload,
    'Nie udalo sie odtworzyc pracownikow z backupu.',
  )
}

function mapWorker(orgId, row) {
  const login = String(row.login ?? row.workerLogin ?? row.workerId ?? '').trim()
  const workerId = String(row.workerId ?? login).trim() || login
  const workerName = String(
    row.workerName ?? row.workername ?? row.worker_name ?? row.name ?? row.displayName ?? row.fullName ?? login,
  ).trim()
  const isOwner = Boolean(
    row.isOwner ||
    (String(row.ownerWorkerId ?? row.owner_worker_id ?? '').trim() &&
      String(row.ownerWorkerId ?? row.owner_worker_id ?? '').trim() === workerId),
  )
  const rawRole = isOwner ? 'OWNER' : String(row.role ?? '').trim()
  const rawWorkerType = String(row.workerType ?? row.worker_type ?? row.type ?? '').trim()
  const systemRole = normalizeWorkerRoleCanonical(rawRole || rawWorkerType)
  const role = rawRole || systemRole
  const displayType = rawWorkerType || formatWorkerRoleLabel(rawRole || systemRole, 'Pracownik')
  const loginEmail = String(row.loginEmail ?? row.email ?? '').trim()
  const photoUrl = String(row.photoUrl ?? row.profilePhotoUrl ?? row.avatarUrl ?? row.photo_url ?? '').trim()

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
    isOwner,
    systemRole,
    type: displayType,
    workerType: displayType,
    active: asBoolean(row.active, true),
    authUid: String(row.authUid ?? row.auth_uid ?? '').trim(),
    email: loginEmail,
    phone: String(row.phone ?? '').trim(),
    photoUrl,
    profilePhotoUrl: photoUrl,
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
  const rows = await readWorkersCached(orgId, async () => {
    const response = await workersList(orgId)
    const ownerWorkerId = String(response?.data?.ownerWorkerId ?? '').trim()
    return (response?.data?.workers ?? []).map((row) => ({
      ...row,
      ownerWorkerId,
      isOwner: Boolean(ownerWorkerId && String(row?.workerId ?? '').trim() === ownerWorkerId),
    }))
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
  return createWorkerUser(orgId, payload)
}

export async function createWorkerUser(orgId, payload) {
  const normalizedOrgId = String(orgId ?? '').trim()
  if (!normalizedOrgId) {
    throw new Error('Brak orgId podczas dodawania pracownika.')
  }

  const email = normalizeWorkerEmail(payload?.email ?? payload?.loginEmail)
  const password = String(payload?.password ?? '').trim()
  if (password.length < 6) {
    throw new Error('Haslo tymczasowe musi miec co najmniej 6 znakow.')
  }

  const displayName =
    String(payload?.displayName ?? payload?.workerName ?? payload?.name ?? '').trim()
  if (!displayName) {
    throw new Error('Podaj imie i nazwisko pracownika.')
  }
  const role = normalizeWorkerRoleCanonical(payload?.role)
  if (!role) {
    throw new Error('Wybierz poprawny typ pracownika.')
  }

  const request = {
    orgId: normalizedOrgId,
    email,
    displayName,
    role,
    workerType: String(payload?.workerType ?? payload?.role ?? role).trim() || role,
    password,
    phone: asNullableText(payload?.phone),
    photoUrl: asNullableText(payload?.photoUrl),
    photoDataUrl: asNullableText(payload?.photoDataUrl),
    removePhoto: Boolean(payload?.removePhoto),
    active: asBoolean(payload?.active, true),
  }
  if (
    payload?.workerNumberOverride !== undefined &&
    payload?.workerNumberOverride !== null &&
    payload?.workerNumberOverride !== ''
  ) {
    request.workerNumberOverride = payload.workerNumberOverride
  }

  const response = await adminUsersCreate(request)
  const user = response?.data?.user ?? response?.user ?? null
  if (!user?.workerId) {
    throw new Error('Backend nie zwrocil finalnego ID pracownika.')
  }
  if (user?.storage !== 'database' || user?.persistenceVerified !== true) {
    throw new Error('Backend nie potwierdzil zapisu pracownika w Cloud SQL.')
  }

  invalidateWorkersCache(normalizedOrgId)
  return mapWorker(normalizedOrgId, user)
}

export async function getNextWorkerIdPreview(orgId) {
  const normalizedOrgId = String(orgId ?? '').trim()
  if (!normalizedOrgId) {
    throw new Error('Brak orgId podczas pobierania kolejnego ID pracownika.')
  }
  const response = await workerIdNext(normalizedOrgId)
  const data = response?.data ?? response ?? {}
  if (!data?.workerId || !Number.isInteger(Number(data?.workerNumber))) {
    throw new Error('Backend nie zwrocil poprawnego podgladu ID pracownika.')
  }
  return {
    workerId: String(data.workerId),
    workerNumber: Number(data.workerNumber),
    ownerWorkerId: String(data.ownerWorkerId ?? '').trim(),
  }
}

export async function setWorkerPassword(orgId, login, password) {
  const normalizedOrgId = String(orgId ?? '').trim()
  const normalizedLogin = normalizeWorkerLogin(login)
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
  })

  const data = response?.data ?? response ?? {}
  if (!data?.passwordUpdated) {
    throw new Error('Backend nie potwierdzil zmiany hasla pracownika. Odswiez dane i sprobuj ponownie.')
  }

  return data
}

export async function updateWorker(orgId, workerId, payload) {
  const login = String(workerId ?? payload?.login ?? '').trim()
  if (!login) {
    throw new Error('Brak loginu pracownika do aktualizacji.')
  }

  const active = asBoolean(payload?.active, true)
  const response = await workerProfileUpdate({
    orgId,
    login,
    workerId: asNullableText(payload?.workerId ?? payload?.id) ?? login,
    name: asNullableText(payload?.workerName ?? payload?.name ?? payload?.fullName),
    email: asNullableText(payload?.loginEmail ?? payload?.email),
    phone: asNullableText(payload?.phone),
    role: asNullableText(payload?.role ?? payload?.workerType) ?? 'WORKER',
    workerType: asNullableText(payload?.workerType ?? payload?.role) ?? 'WORKER',
    active,
    editedBy: asNullableText(payload?.edit ?? payload?.editedBy),
    authUid: asNullableText(payload?.authUid ?? payload?.uid),
    photoUrl: asNullableText(payload?.photoUrl),
    photoDataUrl: asNullableText(payload?.photoDataUrl),
    removePhoto: Boolean(payload?.removePhoto),
  })

  invalidateWorkersCache(orgId)

  const responseWorker = response?.data?.worker
  if (!responseWorker || typeof responseWorker !== 'object' || !String(responseWorker?.login ?? '').trim()) {
    throw new Error('Backend nie potwierdzil trwalego zapisu pracownika. Odswiez dane i sprobuj ponownie.')
  }
  if (
    String(response?.data?.storage ?? '').trim() !== 'database' ||
    response?.data?.persistenceVerified !== true
  ) {
    throw new Error('Backend nie potwierdzil zapisu profilu pracownika w Cloud SQL.')
  }

  const responseLogin = String(responseWorker?.login ?? login).trim() || login
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
    photoUrl: String(responseWorker?.photoUrl ?? responseWorker?.profilePhotoUrl ?? '').trim(),
    profilePhotoUrl: String(responseWorker?.profilePhotoUrl ?? responseWorker?.photoUrl ?? '').trim(),
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

  const data = response?.data ?? response ?? {}
  if (data?.storage !== 'database' || data?.persistenceVerified !== true) {
    throw new Error('Backend nie potwierdzil usuniecia pracownika w Cloud SQL.')
  }
  invalidateWorkersCache(orgId)

  return data
}

export async function restoreWorkersFromBackup(orgId, rows, options = {}) {
  const normalizedOrgId = String(orgId ?? '').trim()
  if (!normalizedOrgId) {
    throw new Error('Brak orgId podczas odtwarzania pracownikow.')
  }
  if (!Array.isArray(rows)) {
    throw new Error('Backup pracownikow musi zawierac tablice rekordow.')
  }

  const response = await workerRestore({
    orgId: normalizedOrgId,
    rows,
    sourceLabel: asNullableText(options?.sourceLabel),
  })
  const data = response?.data ?? response ?? {}
  if (data?.persistenceVerified !== true || data?.storage !== 'database') {
    throw new Error('Backend nie potwierdzil odtworzenia pracownikow w Cloud SQL.')
  }

  invalidateWorkersCache(normalizedOrgId)
  return data
}
