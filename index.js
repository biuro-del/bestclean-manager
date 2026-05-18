const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const crypto = require('node:crypto')
const dotenv = require('dotenv')
const admin = require('firebase-admin')
const { Pool } = require('pg')
const { AuthTypes, Connector, IpAddressTypes } = require('@google-cloud/cloud-sql-connector')
const { Compute, GoogleAuth } = require('google-auth-library')

function isTrue(value) {
  return ['1', 'true', 'yes', 'tak'].includes(
    String(value ?? '')
      .trim()
      .toLowerCase(),
  )
}

const NODE_ENV = String(process.env.NODE_ENV || '').trim().toLowerCase()
const LOCAL_ENV_FILES = [path.join(__dirname, '.env.local')]
if (NODE_ENV !== 'production' && isTrue(process.env.LOAD_FUNCTIONS_LOCAL_ENV)) {
  LOCAL_ENV_FILES.push(path.join(__dirname, 'functions', '.env.local'), path.join(__dirname, 'functions', '.secret.local'))
}

for (const envFile of LOCAL_ENV_FILES) {
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile })
  }
}

const PORT = Number(process.env.PORT || 8080)
const HOST = '0.0.0.0'
const DIST_DIR = path.join(__dirname, 'web-app', 'dist')
const LOCAL_PORTAL_DATA_DIR = path.join(__dirname, '.local-data')
const APP_TARGET = String(process.env.APP_TARGET || '').trim().toLowerCase()
const API_PROXY_TARGET = String(process.env.API_PROXY_TARGET || 'https://europe-central2-iclean-room.cloudfunctions.net').trim().replace(/\/+$/, '')
const API_PROXY_FORWARDED_HOST = String(process.env.API_PROXY_FORWARDED_HOST || 'iclean-room.web.app').trim()
const API_PROXY_TIMEOUT_MS = Number(process.env.API_PROXY_TIMEOUT_MS || 15000)
const ADMIN_USERS_PATH = '/api/admin/users'
const AUTH_PROVISION_WORKER_PATH = '/api/auth/provision-worker'
const AUTH_ROLLBACK_WORKER_PATH = '/api/auth/rollback-worker'
const ADMIN_WORKER_PASSWORD_REVEAL_PATH = '/api/admin/worker-password/reveal'
const ADMIN_WORKER_PASSWORD_SET_PATH = '/api/admin/worker-password/set'
const AUTH_SESSION_CONTEXT_PATH = '/api/auth/session-context'
const PORTAL_TASKS_PATH = '/api/portal/tasks'
const PORTAL_SCHEDULE_ORDERS_PATH = '/api/portal/schedule-orders'
const DATACONNECT_LOCATION = String(process.env.FIREBASE_DATACONNECT_LOCATION || process.env.DATACONNECT_LOCATION || 'europe-west3').trim()
const DATACONNECT_SERVICE = String(process.env.FIREBASE_DATACONNECT_SERVICE || process.env.DATACONNECT_SERVICE || 'iclean-room-service').trim()
const DATACONNECT_CONNECTOR = String(process.env.FIREBASE_DATACONNECT_CONNECTOR || process.env.DATACONNECT_CONNECTOR || 'example').trim()
const MAX_JSON_BODY_BYTES = 1024 * 1024
const MAX_PROXY_BODY_BYTES = Number(process.env.MAX_PROXY_BODY_BYTES || MAX_JSON_BODY_BYTES)
const DEFAULT_FIREBASE_PROJECT_ID = 'iclean-room'
const DEFAULT_FIREBASE_WEB_API_KEY = 'AIzaSyCdRVjbPWm6MueCHOwsmmbdkEKZoO6Dy-k'
const FIREBASE_PROJECT_ID = String(
  process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    DEFAULT_FIREBASE_PROJECT_ID,
).trim()
const FIREBASE_WEB_API_KEY = String(
  process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY || DEFAULT_FIREBASE_WEB_API_KEY,
).trim()
const CLOUD_SQL_CONNECTION_NAME = String(
  process.env.CLOUD_SQL_CONNECTION_NAME ||
    process.env.INSTANCE_CONNECTION_NAME ||
    (FIREBASE_PROJECT_ID === 'iclean-room' ? 'iclean-room:europe-west3:iclean-room-instance' : ''),
).trim()
const CLOUD_SQL_ADMIN_SCOPE = 'https://www.googleapis.com/auth/sqlservice.admin'
const ROLLBACK_TOKEN_MAX_AGE_MS = Number(process.env.ROLLBACK_TOKEN_MAX_AGE_MS || 15 * 60 * 1000)
const WORKER_PASSWORD_ALGORITHM = 'aes-256-gcm'

let firebaseAdminInitialized = false
let dbPool = null
let cloudSqlConnector = null
let cloudSqlOptionsPromise = null

const MIME_BY_EXT = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), geolocation=(self), microphone=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "script-src 'self' 'unsafe-inline' https://maps.googleapis.com https://www.gstatic.com https://www.google.com https://docs.google.com https://www.recaptcha.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://*.googleusercontent.com",
    "connect-src 'self' https://*.googleapis.com https://*.firebaseapp.com https://*.cloudfunctions.net https://*.firebasedataconnect.googleapis.com https://firebasestorage.googleapis.com wss://*.firebaseio.com",
    "frame-src 'self' https://*.google.com https://*.googleapis.com https://docs.google.com https://www.recaptcha.net",
  ].join('; '),
}

function withSecurityHeaders(headers = {}) {
  return {
    ...SECURITY_HEADERS,
    ...headers,
  }
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath)
  } catch {
    return false
  }
}

function normalizeTarget(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (raw.startsWith('mobile')) return 'mobile'
  if (raw.startsWith('portal')) return 'portal'
  return ''
}

function resolveSpaEntryFile(target) {
  const normalized = normalizeTarget(target)
  const candidates =
    normalized === 'mobile'
      ? ['mobile.html', 'index.html', path.join('apps', 'mobile-web', 'mobile.html')]
      : ['index.html', 'mobile.html', path.join('apps', 'portal-web', 'index.html')]

  for (const candidate of candidates) {
    const fullPath = path.join(DIST_DIR, candidate)
    if (fileExists(fullPath)) {
      return fullPath
    }
  }

  return path.join(DIST_DIR, 'index.html')
}

function detectRequestTarget(requestUrl, hostHeader) {
  const envTarget = normalizeTarget(APP_TARGET)
  if (envTarget) return envTarget

  const pathname = String(requestUrl?.pathname || '').toLowerCase()
  if (pathname.startsWith('/mobile')) return 'mobile'
  if (pathname.startsWith('/portal')) return 'portal'

  const host = String(hostHeader || '').toLowerCase()
  if (host.includes('mobile')) return 'mobile'
  if (host.includes('portal')) return 'portal'

  return 'portal'
}

function safeResolveStaticPath(urlPathname, spaEntryRelative) {
  let decoded = '/'
  try {
    decoded = decodeURIComponent(urlPathname || '/')
  } catch {
    decoded = '/'
  }
  const normalized = path.posix.normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, '')
  const relative = normalized === '/' ? `/${spaEntryRelative}` : normalized
  const absolute = path.resolve(DIST_DIR, `.${relative}`)
  const relativeToDist = path.relative(DIST_DIR, absolute)
  if (relativeToDist.startsWith('..') || path.isAbsolute(relativeToDist)) {
    return path.resolve(DIST_DIR, spaEntryRelative)
  }
  return absolute
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, withSecurityHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }))
      res.end('Not found')
      return
    }
    const ext = path.extname(filePath).toLowerCase()
    const contentType = MIME_BY_EXT[ext] || 'application/octet-stream'
    const cacheControl =
      ext === '.html'
        ? 'no-cache'
        : /\.(?:js|css|png|svg|webp|ico)$/i.test(ext)
          ? 'public, max-age=31536000, immutable'
          : 'no-cache'
    res.writeHead(200, withSecurityHeaders({ 'Content-Type': contentType, 'Cache-Control': cacheControl }))
    res.end(content)
  })
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, withSecurityHeaders({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }))
  res.end(JSON.stringify(payload))
}

function sendApiError(res, statusCode, code, message, details = undefined) {
  sendJson(res, statusCode, {
    ok: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  })
}

function isLocalDevelopmentRuntime() {
  return NODE_ENV !== 'production'
}

function publicErrorDetails(error) {
  if (!isLocalDevelopmentRuntime()) {
    return undefined
  }

  const details = {
    code: normalizeText(error?.publicCode || error?.code),
    message: normalizeText(error?.publicMessage || error?.message).slice(0, 500),
    firebase: normalizeText(error?.firebaseRestMessage || error?.errorInfo?.message).slice(0, 240),
  }

  return Object.fromEntries(Object.entries(details).filter(([, value]) => value))
}

function logAdminUsersError(error, context = '') {
  const code = normalizeText(error?.publicCode || error?.code || error?.message || 'UNKNOWN')
  const message = normalizeText(error?.publicMessage || error?.message || 'Unknown admin users error')
  const firebase = normalizeText(error?.firebaseRestMessage || error?.errorInfo?.message)
  console.error(`[admin/users]${context ? ` ${context}` : ''} ${code}: ${message}${firebase ? ` (${firebase})` : ''}`)
}

function logPortalStorageError(context, error) {
  const code = normalizeText(error?.publicCode || error?.code || error?.response?.data?.error || 'UNKNOWN')
  const message = normalizeText(
    error?.publicMessage || error?.message || error?.response?.data?.error_description || 'Unknown portal storage error',
  ).slice(0, 800)
  console.error(`[${context}] ${code}: ${message}`)
}

function isDatabaseSslBadCertificateError(error) {
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeText(error?.message).toLowerCase()
  return (
    code === 'ERR_SSL_SSLV3_ALERT_BAD_CERTIFICATE' ||
    message.includes('sslv3 alert bad certificate') ||
    message.includes('alert bad certificate')
  )
}

function mapDatabaseConnectionError(error) {
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeText(error?.message)
  const lowerMessage = message.toLowerCase()
  const responseError = normalizeText(error?.response?.data?.error).toLowerCase()
  const responseDescription = normalizeText(error?.response?.data?.error_description).toLowerCase()
  const host = normalizeText(process.env.DB_HOST || process.env.PGHOST || '127.0.0.1')
  const port = normalizeText(process.env.DB_PORT || process.env.PGPORT || '5432')

  if (
    code === 'INVALID_GRANT' ||
    responseError === 'invalid_grant' ||
    lowerMessage.includes('invalid_grant') ||
    lowerMessage.includes('invalid_rapt') ||
    responseDescription.includes('invalid_rapt')
  ) {
    return {
      status: 500,
      code: 'GOOGLE_AUTH_REAUTH_REQUIRED',
      message:
        'Backend nie moze uwierzytelnic polaczenia z Google Cloud (invalid_grant/invalid_rapt). Sprawdz konto serwisowe runtime.',
    }
  }

  if (lowerMessage.includes('not_authorized') || lowerMessage.includes('cloudsql.instances.get')) {
    return {
      status: 500,
      code: 'CLOUD_SQL_NOT_AUTHORIZED',
      message: 'Konto serwisowe backendu nie ma uprawnien do instancji Cloud SQL.',
    }
  }

  if (isDatabaseSslBadCertificateError(error)) {
    return {
      status: 503,
      code: 'DB_SSL_BAD_CERTIFICATE',
      message:
        'Backend testowy nie moze uwierzytelnic polaczenia SSL z baza PostgreSQL. Odnow polaczenie z baza albo sprawdz DB_CONNECTOR/DB_SSL/PGSSLMODE i certyfikaty Cloud SQL.',
    }
  }

  if (code === 'ECONNREFUSED') {
    return {
      status: 503,
      code: 'DB_CONNECTION_REFUSED',
      message: `Backend nie moĹĽe poĹ‚Ä…czyÄ‡ siÄ™ z bazÄ… PostgreSQL na ${host}:${port}. Uruchom lokalnÄ… bazÄ™ albo Cloud SQL Proxy.`,
    }
  }

  if (code === 'ETIMEDOUT' || code === 'ENOTFOUND' || code === 'EHOSTUNREACH') {
    return {
      status: 503,
      code: 'DB_CONNECTION_FAILED',
      message: `Backend nie moĹĽe poĹ‚Ä…czyÄ‡ siÄ™ z bazÄ… PostgreSQL (${host}:${port}). SprawdĹş host bazy lub tunel Cloud SQL Proxy.`,
    }
  }

  if (code === '28P01') {
    return {
      status: 500,
      code: 'DB_AUTH_FAILED',
      message: 'Baza danych odrzuciĹ‚a login lub hasĹ‚o backendu.',
    }
  }

  if (code === '3D000') {
    return {
      status: 500,
      code: 'DB_NOT_FOUND',
      message: 'Skonfigurowana baza danych nie istnieje.',
    }
  }

  return null
}

function readRequestBody(req, maxBytes = MAX_JSON_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    req.on('data', (chunk) => {
      total += chunk.length
      if (total > maxBytes) {
        reject(new Error('REQUEST_BODY_TOO_LARGE'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function readJsonBody(req) {
  const raw = await readRequestBody(req)
  if (!raw.length) {
    return {}
  }

  try {
    return JSON.parse(raw.toString('utf8'))
  } catch {
    const error = new Error('INVALID_JSON')
    error.code = 'INVALID_JSON'
    throw error
  }
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeOrgId(value) {
  const orgId = normalizeLower(value)
  if (!/^[a-z0-9_-]{1,64}$/.test(orgId)) {
    return ''
  }
  return orgId
}

function normalizeEmail(value) {
  const email = normalizeLower(value)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) {
    return ''
  }
  return email
}

function normalizeLogin(value) {
  const login = normalizeLower(value)
  if (!/^[a-z0-9._%+-]{1,80}$/.test(login)) {
    return ''
  }
  return login
}

const LOGIN_LOCAL_PART_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,78}[a-z0-9])?$/

function normalizeLoginLocalPart(value) {
  const raw = normalizeLower(value)
  const login = raw.includes('@') ? raw.split('@')[0] : raw
  if (!LOGIN_LOCAL_PART_PATTERN.test(login)) {
    return ''
  }
  return login
}

function normalizeWorkerCredentialLogin(value) {
  const login = normalizeText(value)
  if (!login || login.length > 80 || /[\u0000-\u001f\u007f]/.test(login)) {
    return ''
  }
  return login
}

function emailLocalPart(email) {
  return normalizeLower(email).split('@')[0] || ''
}

function emailDomain(email) {
  const normalized = normalizeEmail(email)
  if (!normalized) {
    return ''
  }

  const atIndex = normalized.indexOf('@')
  if (atIndex < 0) {
    return ''
  }

  const domain = normalized.slice(atIndex + 1).trim()
  if (!domain || domain.includes('@')) {
    return ''
  }

  return domain
}

function buildManagedUserEmail(login, requesterEmail) {
  const localPart = normalizeLoginLocalPart(login)
  const domain = emailDomain(requesterEmail)
  return localPart && domain ? normalizeEmail(`${localPart}@${domain}`) : ''
}

function normalizeUserRole(value) {
  const rawRole = normalizeText(value)
  const role = rawRole.toUpperCase()
  const normalized = rawRole
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  if (role === 'ADMIN' || role === 'OWNER' || role === 'SUPERADMIN' || normalized.includes('admin')) return ''
  if (role === 'MANAGER' || role === 'KIEROWNIK' || normalized.includes('manager') || normalized.includes('kierownik')) return 'MANAGER'
  if (role === 'COORDINATOR' || role === 'KOORDYNATOR' || normalized.includes('koordynator') || normalized.includes('coordinator')) return 'COORDINATOR'
  if (rawRole) return 'WORKER'
  return ''
}

function normalizeRequesterRole(value) {
  const role = normalizeText(value).toUpperCase()
  if (role === 'ADMIN' || role === 'ADMINISTRATOR' || role === 'OWNER' || role === 'SUPERADMIN') return 'ADMIN'
  if (role === 'MANAGER' || role === 'KIEROWNIK') return 'MANAGER'
  if (role === 'COORDINATOR' || role === 'KOORDYNATOR') return 'COORDINATOR'
  if (role === 'WORKER' || role === 'PRACOWNIK') return 'WORKER'
  return role
}

function isFirebaseDuplicateEmail(error) {
  const code = normalizeText(error?.code).toLowerCase()
  const message = normalizeText(error?.message).toLowerCase()
  const restMessage = normalizeText(error?.firebaseRestMessage).toUpperCase()
  return code.includes('email-already-exists') || message.includes('email already exists') || restMessage.includes('EMAIL_EXISTS')
}

function isFirebaseUserNotFound(error) {
  const code = normalizeText(error?.code).toLowerCase()
  const message = normalizeText(error?.message).toLowerCase()
  return code.includes('user-not-found') || message.includes('no user record') || message.includes('user not found')
}

function isFirebaseCredentialError(error) {
  const code = normalizeText(error?.code).toLowerCase()
  const message = normalizeText(error?.message).toLowerCase()
  return (
    code.includes('app/invalid-credential') ||
    code.includes('auth/invalid-credential') ||
    code.includes('credential') ||
    code.includes('insufficient-permission') ||
    message.includes('could not load the default credentials') ||
    message.includes('application default credentials') ||
    message.includes('insufficient permission') ||
    message.includes('unable to detect a project id') ||
    message.includes('metadata server') ||
    message.includes('metadata.google.internal')
  )
}

function mapFirebaseAdminError(error) {
  const code = normalizeText(error?.code).toLowerCase()
  const restMessage = normalizeText(error?.firebaseRestMessage || error?.message).toUpperCase()
  const firebaseDetail = normalizeText(error?.firebaseRestMessage || error?.code || error?.message)
  if (isFirebaseDuplicateEmail(error)) {
    return {
      status: 409,
      code: 'EMAIL_ALREADY_EXISTS',
      message: 'Ten email ma juĹĽ konto Firebase Auth.',
    }
  }

  if (code.includes('invalid-password') || restMessage.includes('WEAK_PASSWORD')) {
    return {
      status: 400,
      code: 'WEAK_PASSWORD',
      message: 'HasĹ‚o jest zbyt sĹ‚abe. UĹĽyj co najmniej 6 znakĂłw.',
    }
  }

  if (code.includes('invalid-email') || restMessage.includes('INVALID_EMAIL')) {
    return {
      status: 400,
      code: 'INVALID_EMAIL',
      message: 'Niepoprawny adres email.',
    }
  }

  if (restMessage.includes('OPERATION_NOT_ALLOWED')) {
    return {
      status: 500,
      code: 'FIREBASE_EMAIL_PASSWORD_DISABLED',
      message: 'Firebase Authentication ma wyĹ‚Ä…czone logowanie Email/Password. WĹ‚Ä…cz provider Email/Password albo uruchom backend z poĹ›wiadczeniami Firebase Admin.',
    }
  }

  if (restMessage.includes('API_KEY_INVALID') || restMessage.includes('INVALID_API_KEY')) {
    return {
      status: 500,
      code: 'FIREBASE_API_KEY_INVALID',
      message: 'Backend ma niepoprawny Firebase Web API key. SprawdĹş FIREBASE_WEB_API_KEY w .env.local.',
    }
  }

  if (restMessage.includes('PROJECT_NOT_FOUND') || restMessage.includes('CONFIGURATION_NOT_FOUND')) {
    return {
      status: 500,
      code: 'FIREBASE_PROJECT_CONFIG_INVALID',
      message: 'Backend nie trafia w poprawny projekt Firebase. SprawdĹş FIREBASE_PROJECT_ID i FIREBASE_WEB_API_KEY.',
    }
  }

  if (restMessage.includes('TOO_MANY_ATTEMPTS_TRY_LATER')) {
    return {
      status: 429,
      code: 'FIREBASE_TOO_MANY_ATTEMPTS',
      message: 'Firebase chwilowo blokuje tworzenie kont po zbyt wielu prĂłbach. SprĂłbuj ponownie za kilka minut.',
    }
  }

  if (restMessage.includes('INVALID_ID_TOKEN') || restMessage.includes('USER_NOT_FOUND')) {
    return {
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'Token Firebase jest niepoprawny albo wygasĹ‚.',
    }
  }

  if (isFirebaseCredentialError(error)) {
    return {
      status: 500,
      code: 'FIREBASE_ADMIN_CREDENTIALS_MISSING',
      message: 'Backend nie ma lokalnych poĹ›wiadczeĹ„ Firebase Admin.',
    }
  }

  return {
    status: 500,
    code: 'FIREBASE_AUTH_ERROR',
    message: firebaseDetail
      ? `Nie udaĹ‚o siÄ™ utworzyÄ‡ konta Firebase Auth. Firebase zwrĂłciĹ‚: ${firebaseDetail.slice(0, 180)}.`
      : 'Nie udaĹ‚o siÄ™ utworzyÄ‡ konta Firebase Auth.',
  }
}

function parseBearerToken(req) {
  const auth = normalizeText(req.headers.authorization)
  const match = /^Bearer\s+(.+)$/i.exec(auth)
  return match ? match[1].trim() : ''
}

function ensureFirebaseAdmin() {
  if (!firebaseAdminInitialized) {
    if (!admin.apps.length) {
      admin.initializeApp(FIREBASE_PROJECT_ID ? { projectId: FIREBASE_PROJECT_ID } : undefined)
    }
    firebaseAdminInitialized = true
  }

  return admin
}

function canUseFirebaseRest() {
  return Boolean(FIREBASE_WEB_API_KEY) && typeof fetch === 'function'
}

async function callFirebaseIdentityToolkit(method, payload) {
  if (!canUseFirebaseRest()) {
    const error = new Error('FIREBASE_WEB_API_KEY_MISSING')
    error.publicCode = 'FIREBASE_CONFIG_MISSING'
    error.publicMessage = 'Brak konfiguracji Firebase Web API key dla lokalnego tworzenia kont.'
    error.statusCode = 500
    throw error
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )
  const body = await response.json().catch(() => ({}))

  if (!response.ok) {
    const error = new Error(normalizeText(body?.error?.message) || `FIREBASE_REST_${method.toUpperCase()}_FAILED`)
    error.statusCode = response.status
    error.firebaseRestMessage = normalizeText(body?.error?.message)
    throw error
  }

  return body
}

async function verifyFirebaseIdToken(token) {
  try {
    return await ensureFirebaseAdmin().auth().verifyIdToken(token)
  } catch (adminError) {
    if (!canUseFirebaseRest()) {
      throw adminError
    }

    const body = await callFirebaseIdentityToolkit('lookup', { idToken: token })
    const user = Array.isArray(body?.users) ? body.users[0] : null
    const uid = normalizeText(user?.localId)
    if (!uid) {
      const error = new Error('INVALID_ID_TOKEN')
      error.firebaseRestMessage = 'INVALID_ID_TOKEN'
      throw error
    }

    return {
      uid,
      email: normalizeEmail(user?.email) || normalizeText(user?.email),
      name: normalizeText(user?.displayName),
    }
  }
}

async function assertFirebaseEmailAvailable(email) {
  try {
    await ensureFirebaseAdmin().auth().getUserByEmail(email)
    const error = new Error('EMAIL_ALREADY_EXISTS')
    error.statusCode = 409
    error.publicCode = 'EMAIL_ALREADY_EXISTS'
    error.publicMessage = 'Ten email ma juĹĽ konto Firebase Auth.'
    throw error
  } catch (error) {
    if (error.publicCode === 'EMAIL_ALREADY_EXISTS') {
      throw error
    }
    if (isFirebaseUserNotFound(error)) {
      return
    }
    if (isFirebaseCredentialError(error) && canUseFirebaseRest()) {
      return
    }
    throw error
  }
}

async function createFirebaseAuthUser(payload) {
  try {
    const user = await ensureFirebaseAdmin().auth().createUser({
      email: payload.email,
      password: payload.password,
      displayName: payload.displayName,
      disabled: !payload.active,
    })
    return {
      provider: 'admin',
      uid: user.uid,
      email: user.email || payload.email,
    }
  } catch (adminError) {
    if (!canUseFirebaseRest()) {
      const mapped = mapFirebaseAdminError(adminError)
      adminError.statusCode = mapped.status
      adminError.publicCode = mapped.code
      adminError.publicMessage = mapped.message
      throw adminError
    }

    if (!payload.active) {
      const error = new Error('FIREBASE_ADMIN_REQUIRED_FOR_DISABLED_USER')
      error.statusCode = 500
      error.publicCode = 'FIREBASE_ADMIN_CREDENTIALS_MISSING'
      error.publicMessage = 'Tworzenie nieaktywnego konta wymaga poĹ›wiadczeĹ„ Firebase Admin.'
      throw error
    }

    try {
      console.warn(
        `[admin/users] Firebase Admin createUser failed; trying REST fallback (${normalizeText(adminError?.code || adminError?.message) || 'unknown error'})`,
      )
      const body = await callFirebaseIdentityToolkit('signUp', {
        email: payload.email,
        password: payload.password,
        displayName: payload.displayName,
        returnSecureToken: true,
      })
      return {
        provider: 'rest',
        uid: normalizeText(body?.localId),
        email: normalizeEmail(body?.email) || payload.email,
        idToken: normalizeText(body?.idToken),
      }
    } catch (restError) {
      const mapped = mapFirebaseAdminError(restError)
      restError.statusCode = mapped.status
      restError.publicCode = mapped.code
      restError.publicMessage = mapped.message
      throw restError
    }
  }
}

function resolveRollbackSecret() {
  return (
    normalizeText(process.env.ROLLBACK_TOKEN_SECRET) ||
    normalizeText(process.env.AUTH_ROLLBACK_TOKEN_SECRET) ||
    `${FIREBASE_PROJECT_ID}:portal-worker-provision-rollback`
  )
}

function timingSafeCompare(left, right) {
  const leftBuffer = Buffer.from(String(left || ''))
  const rightBuffer = Buffer.from(String(right || ''))
  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

function signRollbackPayload(payloadBase64) {
  return crypto.createHmac('sha256', resolveRollbackSecret()).update(payloadBase64).digest('base64url')
}

function createProvisionRollbackToken(payload) {
  const payloadBase64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `${payloadBase64}.${signRollbackPayload(payloadBase64)}`
}

function verifyProvisionRollbackToken(token) {
  const raw = normalizeText(token)
  const [payloadBase64, signature] = raw.split('.', 2)
  if (!payloadBase64 || !signature) {
    const error = new Error('INVALID_ROLLBACK_TOKEN')
    error.statusCode = 400
    error.publicCode = 'INVALID_ROLLBACK_TOKEN'
    error.publicMessage = 'Niepoprawny rollbackToken.'
    throw error
  }

  const expected = signRollbackPayload(payloadBase64)
  if (!timingSafeCompare(signature, expected)) {
    const error = new Error('INVALID_ROLLBACK_TOKEN_SIGNATURE')
    error.statusCode = 403
    error.publicCode = 'INVALID_ROLLBACK_TOKEN'
    error.publicMessage = 'Niepoprawny podpis rollbackToken.'
    throw error
  }

  let payload
  try {
    payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'))
  } catch {
    const error = new Error('INVALID_ROLLBACK_TOKEN_PAYLOAD')
    error.statusCode = 400
    error.publicCode = 'INVALID_ROLLBACK_TOKEN'
    error.publicMessage = 'Nie mozna odczytac rollbackToken.'
    throw error
  }

  const createdAt = Number(payload?.createdAt || 0)
  if (!Number.isFinite(createdAt) || createdAt <= 0 || Date.now() - createdAt > ROLLBACK_TOKEN_MAX_AGE_MS) {
    const error = new Error('ROLLBACK_TOKEN_EXPIRED')
    error.statusCode = 410
    error.publicCode = 'ROLLBACK_TOKEN_EXPIRED'
    error.publicMessage = 'rollbackToken wygasl.'
    throw error
  }

  return payload
}

async function findFirebaseAuthUserByEmail(email) {
  try {
    return await ensureFirebaseAdmin().auth().getUserByEmail(email)
  } catch (error) {
    if (isFirebaseUserNotFound(error)) {
      return null
    }
    if (isFirebaseCredentialError(error) && canUseFirebaseRest()) {
      return null
    }
    throw error
  }
}

function buildProvisionWorkerPayload(body, requester = {}) {
  const orgId = normalizeOrgId(body?.orgId)
  const loginLocalPart = normalizeLoginLocalPart(body?.loginLocalPart || body?.login)
  const requesterEmail = normalizeEmail(requester?.email)
  const email = buildManagedUserEmail(loginLocalPart, requesterEmail)
  const workerName = normalizeText(body?.workerName || body?.displayName || body?.name) || loginLocalPart
  const roleInput = normalizeText(body?.roleLabel || body?.role)
  const role = roleInput ? normalizeUserRole(roleInput) : 'WORKER'
  const password = normalizeText(body?.password)
  const active = asPayloadBoolean(body?.active, true)

  const validationErrors = []
  if (!orgId) validationErrors.push('Brak poprawnego orgId.')
  if (!requesterEmail) validationErrors.push('Token Firebase konta dodajacego nie zawiera poprawnego emaila.')
  if (!loginLocalPart) validationErrors.push('Podaj poprawny login bez znaku @.')
  if (!email) validationErrors.push('Nie mozna zbudowac emaila z loginu i domeny konta dodajacego.')
  if (!workerName) validationErrors.push('Podaj imie i nazwisko pracownika.')
  if (!role) validationErrors.push('Nowy uzytkownik nie moze byc tworzony z rola Admin.')
  if (password.length < 6) validationErrors.push('Haslo tymczasowe musi miec co najmniej 6 znakow.')

  return {
    value: { orgId, loginLocalPart, email, workerName, role, password, active },
    validationErrors,
  }
}

async function provisionWorkerAuthUser(payload, requester) {
  const existingUser = await findFirebaseAuthUserByEmail(payload.email)
  if (existingUser?.uid) {
    return {
      email: payload.email,
      uid: existingUser.uid,
      existing: true,
      rollbackToken: null,
    }
  }

  const createdUser = await createFirebaseAuthUser({
    email: payload.email,
    password: payload.password,
    displayName: payload.workerName,
    active: payload.active,
  })

  if (!createdUser?.uid) {
    const error = new Error('FIREBASE_AUTH_UID_MISSING')
    error.statusCode = 500
    error.publicCode = 'FIREBASE_AUTH_UID_MISSING'
    error.publicMessage = 'Firebase Auth nie zwrocil UID nowego uzytkownika.'
    throw error
  }

  return {
    email: payload.email,
    uid: createdUser.uid,
    existing: false,
    rollbackToken: createProvisionRollbackToken({
      version: 1,
      uid: createdUser.uid,
      email: payload.email,
      orgId: payload.orgId,
      createdByUid: normalizeText(requester?.uid),
      createdByEmail: normalizeEmail(requester?.email),
      authProvider: normalizeText(createdUser?.provider),
      authIdToken: normalizeText(createdUser?.idToken),
      createdAt: Date.now(),
      nonce: crypto.randomBytes(12).toString('base64url'),
    }),
  }
}

function dataConnectOperationUrl(kind) {
  const suffix = kind === 'mutation' ? ':executeMutation' : ':executeQuery'
  const base =
    `https://firebasedataconnect.googleapis.com/v1/projects/${encodeURIComponent(FIREBASE_PROJECT_ID)}` +
    `/locations/${encodeURIComponent(DATACONNECT_LOCATION)}` +
    `/services/${encodeURIComponent(DATACONNECT_SERVICE)}` +
    `/connectors/${encodeURIComponent(DATACONNECT_CONNECTOR)}${suffix}`
  return FIREBASE_WEB_API_KEY ? `${base}?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}` : base
}

async function executeDataConnectOperation(kind, operationName, variables, firebaseIdToken) {
  const token = normalizeText(firebaseIdToken)
  if (!token) {
    const error = new Error('DATACONNECT_TOKEN_MISSING')
    error.statusCode = 401
    error.publicCode = 'UNAUTHENTICATED'
    error.publicMessage = 'Brak tokenu Firebase dla operacji Data Connect.'
    throw error
  }

  const connectorName =
    `projects/${FIREBASE_PROJECT_ID}/locations/${DATACONNECT_LOCATION}/services/${DATACONNECT_SERVICE}/connectors/${DATACONNECT_CONNECTOR}`
  const response = await fetch(dataConnectOperationUrl(kind), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Firebase-Auth-Token': token,
    },
    body: JSON.stringify({
      name: connectorName,
      operationName,
      variables: variables ?? {},
    }),
  })

  let payload = null
  let rawText = ''
  try {
    rawText = await response.text()
    payload = rawText ? JSON.parse(rawText) : null
  } catch {
    payload = null
  }

  const errors = Array.isArray(payload?.errors) ? payload.errors : []
  if (!response.ok || errors.length) {
    const firstError = errors[0] ?? payload?.error ?? {}
    const message =
      normalizeText(firstError?.message) ||
      normalizeText(payload?.error?.message) ||
      normalizeText(rawText) ||
      `Data Connect zwrocil blad HTTP ${response.status}.`
    const error = new Error(message)
    error.statusCode = response.ok ? 500 : response.status
    error.publicCode = 'DATACONNECT_OPERATION_FAILED'
    error.publicMessage = message
    error.details = errors.length ? errors : payload?.error || rawText
    throw error
  }

  return payload ?? {}
}

async function queryWorkersForOrgViaDataConnect(orgId, firebaseIdToken) {
  const response = await executeDataConnectOperation('query', 'WorkersForOrg', { orgId }, firebaseIdToken)
  return Array.isArray(response?.data?.workers) ? response.data.workers : []
}

function buildWorkerPasswordPayload(body, { requirePassword = false } = {}) {
  const orgId = normalizeOrgId(body?.orgId)
  const login = normalizeWorkerCredentialLogin(body?.login || body?.workerLogin)
  const password = normalizeText(body?.password)
  const skipAuthUpdate = isTrue(body?.skipAuthUpdate)
  const validationErrors = []

  if (!orgId) validationErrors.push('Brak poprawnego orgId.')
  if (!login) validationErrors.push('Podaj poprawny login pracownika.')
  if (requirePassword && password.length < 6) {
    validationErrors.push('Haslo musi miec co najmniej 6 znakow.')
  }

  return {
    value: { orgId, login, password, skipAuthUpdate },
    validationErrors,
  }
}

function workerPasswordConfigError() {
  const error = new Error('WORKER_PASSWORD_SECRET_MISSING')
  error.statusCode = 500
  error.publicCode = 'WORKER_PASSWORD_SECRET_MISSING'
  error.publicMessage =
    'Brak konfiguracji WORKER_PASSWORD_SECRET. Ustaw sekret backendu, aby szyfrowac i odczytywac hasla pracownikow.'
  return error
}

function resolveWorkerPasswordKey() {
  const secret = normalizeText(process.env.WORKER_PASSWORD_SECRET || process.env.PORTAL_WORKER_PASSWORD_SECRET)
  if (!secret) {
    throw workerPasswordConfigError()
  }
  return crypto.createHash('sha256').update(secret, 'utf8').digest()
}

function encryptWorkerPassword(password) {
  const key = resolveWorkerPasswordKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(WORKER_PASSWORD_ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(String(password), 'utf8'), cipher.final()])
  return {
    encryptedPassword: encrypted.toString('base64url'),
    iv: iv.toString('base64url'),
    authTag: cipher.getAuthTag().toString('base64url'),
    algorithm: WORKER_PASSWORD_ALGORITHM,
  }
}

function decryptWorkerPassword(credential) {
  const algorithm = normalizeText(credential?.algorithm)
  if (algorithm !== WORKER_PASSWORD_ALGORITHM) {
    const error = new Error('WORKER_PASSWORD_UNSUPPORTED_ALGORITHM')
    error.statusCode = 500
    error.publicCode = 'WORKER_PASSWORD_UNSUPPORTED_ALGORITHM'
    error.publicMessage = 'Zapisane haslo uzywa nieobslugiwanego algorytmu szyfrowania.'
    throw error
  }

  const key = resolveWorkerPasswordKey()
  const iv = Buffer.from(normalizeText(credential?.iv), 'base64url')
  const authTag = Buffer.from(normalizeText(credential?.authTag), 'base64url')
  const encrypted = Buffer.from(normalizeText(credential?.encryptedPassword), 'base64url')
  const decipher = crypto.createDecipheriv(WORKER_PASSWORD_ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

function isWorkerPasswordRevealableConfigError(error) {
  const code = normalizeText(error?.publicCode || error?.message)
  const message = normalizeText(error?.message).toLowerCase()
  return (
    code === 'WORKER_PASSWORD_SECRET_MISSING' ||
    code === 'WORKER_PASSWORD_UNSUPPORTED_ALGORITHM' ||
    message.includes('unable to authenticate data') ||
    message.includes('invalid initialization vector') ||
    message.includes('invalid authentication tag')
  )
}

function workerPasswordRevealUnavailableMessage(error) {
  const code = normalizeText(error?.publicCode || error?.message)
  if (code === 'WORKER_PASSWORD_SECRET_MISSING') {
    return 'Hasło jest zapisane w sejfie, ale ten backend nie ma ustawionego WORKER_PASSWORD_SECRET, więc nie może go odszyfrować.'
  }
  if (code === 'WORKER_PASSWORD_UNSUPPORTED_ALGORITHM') {
    return normalizeText(error?.publicMessage) || 'Hasło jest zapisane w nieobsługiwanym formacie szyfrowania.'
  }
  return 'Hasło jest zapisane w sejfie, ale nie udało się go odszyfrować w tym środowisku. Ustaw poprawny WORKER_PASSWORD_SECRET albo ustaw nowe hasło tymczasowe i zapisz.'
}

async function queryAdminWorkerCredentialForOrg(orgId, login, firebaseIdToken) {
  const response = await executeDataConnectOperation(
    'query',
    'AdminWorkerCredentialForOrg',
    { orgId, login },
    firebaseIdToken,
  )
  return response?.data ?? {}
}

function isDataConnectWorkerNotFound(error) {
  const message = normalizeText(error?.publicMessage || error?.message).toLowerCase()
  return message.includes('nie znaleziono pracownika') || message.includes('worker') && message.includes('not found')
}

function addWorkerCredentialMatchKey(keys, value) {
  const raw = normalizeText(value)
  if (!raw) {
    return
  }
  const lowered = raw.toLowerCase()
  keys.add(lowered)
  if (lowered.includes('@')) {
    keys.add(lowered.split('@')[0])
  }
}

function workerCredentialMatchKeys(row) {
  const keys = new Set()
  addWorkerCredentialMatchKey(keys, row?.login)
  addWorkerCredentialMatchKey(keys, row?.workerLogin)
  addWorkerCredentialMatchKey(keys, row?.workerId)
  addWorkerCredentialMatchKey(keys, row?.loginEmail ?? row?.login_email)
  addWorkerCredentialMatchKey(keys, row?.email)
  addWorkerCredentialMatchKey(keys, row?.authUid ?? row?.auth_uid)
  return keys
}

function findWorkerForCredentialLogin(rows, login) {
  const requested = new Set()
  addWorkerCredentialMatchKey(requested, login)
  for (const row of Array.isArray(rows) ? rows : []) {
    const keys = workerCredentialMatchKeys(row)
    for (const key of requested) {
      if (keys.has(key)) {
        return row
      }
    }
  }
  return null
}

async function resolveAdminWorkerCredentialForOrg(orgId, login, firebaseIdToken) {
  try {
    return {
      data: await queryAdminWorkerCredentialForOrg(orgId, login, firebaseIdToken),
      login,
      requestedLogin: login,
      workerMissing: false,
    }
  } catch (error) {
    if (!isDataConnectWorkerNotFound(error)) {
      throw error
    }
  }

  const workers = await queryWorkersForOrgViaDataConnect(orgId, firebaseIdToken)
  const matchedWorker = findWorkerForCredentialLogin(workers, login)
  const resolvedLogin = normalizeText(matchedWorker?.login)
  if (!resolvedLogin) {
    return {
      data: { worker: null, workerCredential: null },
      login,
      requestedLogin: login,
      workerMissing: true,
    }
  }

  return {
    data: await queryAdminWorkerCredentialForOrg(orgId, resolvedLogin, firebaseIdToken),
    login: resolvedLogin,
    requestedLogin: login,
    workerMissing: false,
  }
}

async function upsertWorkerCredentialForOrg(payload, firebaseIdToken) {
  await executeDataConnectOperation('mutation', 'UpsertWorkerCredentialForOrg', payload, firebaseIdToken)
}

async function updateFirebaseAuthPassword(uid, password) {
  const authUid = normalizeText(uid)
  if (!authUid) {
    const error = new Error('WORKER_AUTH_UID_MISSING')
    error.statusCode = 400
    error.publicCode = 'WORKER_AUTH_UID_MISSING'
    error.publicMessage = 'Pracownik nie ma zapisanego UID Firebase Auth.'
    throw error
  }

  await ensureFirebaseAdmin().auth().updateUser(authUid, { password })
}

function findExistingWorkerInRows(rows, login, email) {
  const normalizedLogin = normalizeLower(login)
  const normalizedEmail = normalizeEmail(email)
  return (Array.isArray(rows) ? rows : []).find((row) => {
    const rowLogin = normalizeLower(row?.login)
    const rowLoginEmail = normalizeEmail(row?.loginEmail ?? row?.login_email)
    const rowEmail = normalizeEmail(row?.email)
    return (
      (normalizedLogin && rowLogin === normalizedLogin) ||
      (normalizedEmail && (rowLoginEmail === normalizedEmail || rowEmail === normalizedEmail))
    )
  })
}

function buildWorkerAlreadyExistsError(existingWorker, login, email) {
  const normalizedLogin = normalizeLower(login)
  const normalizedEmail = normalizeEmail(email)
  const rowLogin = normalizeLower(existingWorker?.login)
  const rowLoginEmail = normalizeEmail(existingWorker?.loginEmail ?? existingWorker?.login_email)
  const rowEmail = normalizeEmail(existingWorker?.email)
  const sameLogin = normalizedLogin && rowLogin === normalizedLogin
  const sameEmail = normalizedEmail && (rowLoginEmail === normalizedEmail || rowEmail === normalizedEmail)
  const error = new Error('WORKER_ALREADY_EXISTS')
  error.statusCode = 409
  error.publicCode = 'WORKER_ALREADY_EXISTS'
  if (sameLogin && sameEmail) {
    error.publicMessage =
      'Ten uĹĽytkownik juĹĽ istnieje w tej organizacji. Login i email muszÄ… byÄ‡ unikalne w obrÄ™bie jednej organizacji.'
  } else if (sameLogin) {
    error.publicMessage = 'Ten login jest juĹĽ zajÄ™ty w tej organizacji.'
  } else {
    error.publicMessage = 'Ten email jest juĹĽ przypisany do uĹĽytkownika w tej organizacji.'
  }
  return error
}

async function createAdminManagedUserViaDataConnect(payload, decodedToken, firebaseIdToken) {
  const rows = await queryWorkersForOrgViaDataConnect(payload.orgId, firebaseIdToken)
  const existingWorker = findExistingWorkerInRows(rows, payload.login, payload.email)
  if (existingWorker) {
    throw buildWorkerAlreadyExistsError(existingWorker, payload.login, payload.email)
  }

  const provisionedUser = await provisionWorkerAuthUser(
    {
      orgId: payload.orgId,
      loginLocalPart: payload.login,
      email: payload.email,
      workerName: payload.displayName,
      role: payload.role,
      password: payload.password,
      active: payload.active,
    },
    decodedToken,
  )
  const workerId = resolveNextWorkerId(rows)

  try {
    await executeDataConnectOperation(
      'mutation',
      'InsertWorkerWithMembershipForOrg',
      {
        orgId: payload.orgId,
        login: payload.login,
        workerName: payload.displayName,
        loginEmail: provisionedUser.email,
        authUid: provisionedUser.uid,
        role: payload.role,
        active: payload.active,
        email: provisionedUser.email,
        phone: payload.phone || null,
        workerType: payload.role,
        workerId,
      },
      firebaseIdToken,
    )
  } catch (error) {
    if (!provisionedUser.existing && provisionedUser.rollbackToken) {
      await deleteFirebaseUserQuietly(provisionedUser.uid)
    }
    throw error
  }

  return {
    uid: provisionedUser.uid,
    email: provisionedUser.email,
    login: payload.login,
    displayName: payload.displayName,
    role: payload.role,
    active: payload.active,
    phone: payload.phone,
    workerId,
  }
}

function shouldUseCloudSqlConnector(host) {
  const mode = normalizeText(process.env.DB_CONNECTOR || process.env.DB_CONNECTION_MODE).toLowerCase()
  if (mode === 'direct' || mode === 'pg' || mode === 'postgres') {
    return false
  }
  if (mode === 'cloudsql' || mode === 'cloud-sql' || mode === 'connector') {
    return Boolean(CLOUD_SQL_CONNECTION_NAME)
  }

  const normalizedHost = normalizeLower(host)
  return Boolean(CLOUD_SQL_CONNECTION_NAME) && (!normalizedHost || normalizedHost === '127.0.0.1' || normalizedHost === 'localhost')
}

function getCloudSqlIpType() {
  const value = normalizeText(process.env.CLOUD_SQL_IP_TYPE || process.env.DB_CLOUD_SQL_IP_TYPE || 'PUBLIC').toUpperCase()
  return IpAddressTypes[value] || IpAddressTypes.PUBLIC
}

function getCloudSqlAuthType() {
  const value = normalizeText(process.env.CLOUD_SQL_AUTH_TYPE || process.env.DB_AUTH_TYPE || 'PASSWORD').toUpperCase()
  return AuthTypes[value] || AuthTypes.PASSWORD
}

function isGoogleServerlessRuntime() {
  return Boolean(process.env.K_SERVICE || process.env.K_REVISION || process.env.FUNCTION_TARGET || process.env.FUNCTION_NAME)
}

function createCloudSqlConnectorAuth() {
  const mode = normalizeText(process.env.CLOUD_SQL_AUTH_CLIENT || process.env.DB_CLOUD_SQL_AUTH_CLIENT).toLowerCase()
  if (mode === 'compute' || (!mode && isGoogleServerlessRuntime())) {
    return new Compute({ scopes: [CLOUD_SQL_ADMIN_SCOPE] })
  }
  if (mode === 'google-auth' || mode === 'adc') {
    return new GoogleAuth({ scopes: [CLOUD_SQL_ADMIN_SCOPE] })
  }
  return undefined
}

function isFalse(value) {
  return ['0', 'false', 'no', 'nie'].includes(normalizeText(value).toLowerCase())
}

function getDbSslOptions(sslEnabled) {
  if (!sslEnabled) {
    return undefined
  }
  return {
    rejectUnauthorized: !isFalse(process.env.DB_SSL_REJECT_UNAUTHORIZED),
  }
}

async function getCloudSqlConnectorOptions() {
  if (!cloudSqlOptionsPromise) {
    cloudSqlConnector = cloudSqlConnector || new Connector({ auth: createCloudSqlConnectorAuth() })
    cloudSqlOptionsPromise = cloudSqlConnector
      .getOptions({
        instanceConnectionName: CLOUD_SQL_CONNECTION_NAME,
        ipType: getCloudSqlIpType(),
        authType: getCloudSqlAuthType(),
      })
      .catch((error) => {
        cloudSqlOptionsPromise = null
        throw error
      })
  }

  return cloudSqlOptionsPromise
}

async function getDbPool() {
  if (dbPool) {
    return dbPool
  }

  const databaseUrl = normalizeText(process.env.DATABASE_URL)
  const sslEnabled = isTrue(process.env.DB_SSL) || normalizeText(process.env.PGSSLMODE).toLowerCase() === 'require'

  if (databaseUrl) {
    dbPool = new Pool({
      connectionString: databaseUrl,
      ssl: getDbSslOptions(sslEnabled),
    })
    return dbPool
  }

  const host = normalizeText(process.env.DB_HOST || process.env.PGHOST)
  const database = normalizeText(process.env.DB_NAME || process.env.PGDATABASE)
  const useIamDatabaseAuth = getCloudSqlAuthType() === AuthTypes.IAM
  const user = normalizeText(
    useIamDatabaseAuth
      ? process.env.DB_IAM_USER || process.env.CLOUD_SQL_IAM_USER || process.env.DB_USER || process.env.PGUSER
      : process.env.DB_USER || process.env.PGUSER,
  )
  const password = normalizeText(process.env.DB_PASS || process.env.PGPASSWORD)
  const port = Number(process.env.DB_PORT || process.env.PGPORT || 5432)

  if (!database || !user) {
    throw new Error('DB_CONFIG_MISSING')
  }

  if (shouldUseCloudSqlConnector(host)) {
    const connectorOptions = await getCloudSqlConnectorOptions()
    dbPool = new Pool({
      ...connectorOptions,
      database,
      user,
      ...(useIamDatabaseAuth ? {} : { password }),
      max: Number(process.env.DB_POOL_MAX || 5),
    })
    return dbPool
  }

  if (!host) {
    throw new Error('DB_CONFIG_MISSING')
  }

  dbPool = new Pool({
    host,
    port,
    database,
    user,
    password,
    ssl: getDbSslOptions(sslEnabled),
  })
  return dbPool
}

function hasDatabaseConnectionConfig() {
  if (normalizeText(process.env.DATABASE_URL)) {
    return true
  }

  const host = normalizeText(process.env.DB_HOST || process.env.PGHOST)
  const database = normalizeText(process.env.DB_NAME || process.env.PGDATABASE)
  const useIamDatabaseAuth = getCloudSqlAuthType() === AuthTypes.IAM
  const user = normalizeText(
    useIamDatabaseAuth
      ? process.env.DB_IAM_USER || process.env.CLOUD_SQL_IAM_USER || process.env.DB_USER || process.env.PGUSER
      : process.env.DB_USER || process.env.PGUSER,
  )

  if (!database || !user) {
    return false
  }

  if (shouldUseCloudSqlConnector(host)) {
    return Boolean(CLOUD_SQL_CONNECTION_NAME)
  }

  return Boolean(host)
}

function shouldProxyAdminUsersRequest() {
  const mode = normalizeText(process.env.ADMIN_USERS_MODE || process.env.ADMIN_USERS_PROXY_MODE).toLowerCase()
  if (mode === 'proxy' || mode === 'remote') {
    return true
  }
  if (mode === 'local' || mode === 'direct') {
    return false
  }

  return false
}

function shouldProxyDatabaseBackedRequest() {
  const mode = normalizeText(process.env.PORTAL_DB_ROUTES_MODE || process.env.API_DB_ROUTES_MODE).toLowerCase()
  if (mode === 'local' || mode === 'direct') {
    return false
  }

  const target = normalizeText(API_PROXY_TARGET).toLowerCase()
  if (!target || target.includes('://127.0.0.1') || target.includes('://localhost')) {
    return false
  }

  return !hasDatabaseConnectionConfig()
}

function shouldProxyPortalTasksRequest() {
  const mode = normalizeText(process.env.PORTAL_TASKS_MODE).toLowerCase()
  if (['local', 'direct', 'file'].includes(mode)) {
    return false
  }
  if (['proxy', 'remote'].includes(mode)) {
    return true
  }
  if (NODE_ENV !== 'production') {
    return false
  }
  return shouldProxyDatabaseBackedRequest()
}

function shouldProxyPortalScheduleOrdersRequest() {
  const mode = normalizeText(process.env.PORTAL_SCHEDULE_ORDERS_MODE).toLowerCase()
  if (['local', 'direct', 'file'].includes(mode)) {
    return false
  }
  if (['proxy', 'remote'].includes(mode)) {
    return true
  }
  if (NODE_ENV !== 'production') {
    return false
  }
  return shouldProxyDatabaseBackedRequest()
}

async function resetDbConnectionCache() {
  const currentPool = dbPool
  const currentConnector = cloudSqlConnector
  dbPool = null
  cloudSqlOptionsPromise = null
  cloudSqlConnector = null

  if (currentPool) {
    try {
      await currentPool.end()
    } catch {
      // best effort only
    }
  }

  if (currentConnector) {
    try {
      await currentConnector.close()
    } catch {
      // best effort only
    }
  }
}

async function connectDbClient() {
  const pool = await getDbPool()
  try {
    return await pool.connect()
  } catch (error) {
    if (!isDatabaseSslBadCertificateError(error)) {
      throw error
    }

    await resetDbConnectionCache()
    const retryPool = await getDbPool()
    return retryPool.connect()
  }
}

async function databaseRelationExists(client, relationName) {
  const normalized = normalizeText(relationName)
  if (!normalized) {
    return false
  }
  const result = await client.query('select to_regclass($1::text) as relation_name', [normalized])
  return Boolean(normalizeText(result.rows?.[0]?.relation_name))
}

function resolveNextWorkerId(rows = []) {
  let maxNumber = 0
  let padWidth = 3

  rows.forEach((row) => {
    const raw = normalizeText(row?.worker_id ?? row?.workerId).toUpperCase()
    const match = /^W(\d+)$/.exec(raw)
    if (!match) return

    const numeric = Number.parseInt(match[1], 10)
    if (Number.isFinite(numeric) && numeric > maxNumber) {
      maxNumber = numeric
    }
    padWidth = Math.max(padWidth, match[1].length)
  })

  return `W${String(maxNumber + 1).padStart(padWidth, '0')}`
}

async function getRequesterMembership(client, orgId, uid) {
  const result = await client.query(
    'select role from public.organization_member where org_id = $1 and uid = $2 limit 1',
    [orgId, uid],
  )
  return result.rows[0] ?? null
}

async function getRequesterMemberships(client, uid) {
  const result = await client.query(
    `select org_id, role
       from public.organization_member
      where uid = $1
      order by created_at asc nulls last, org_id asc`,
    [uid],
  )
  return result.rows
}

async function findExistingWorker(client, orgId, login, email) {
  const result = await client.query(
    `select login, login_email, email
       from public.worker
      where org_id = $1
        and (
          lower(login) = lower($2)
          or lower(coalesce(login_email, '')) = lower($3)
          or lower(coalesce(email, '')) = lower($3)
        )
      limit 1`,
    [orgId, login, email],
  )
  return result.rows[0] ?? null
}

async function ensureWorkerAuthUidColumn(client) {
  await client.query('alter table public.worker add column if not exists auth_uid varchar(128)')
}

function asPayloadBoolean(value, defaultValue = true) {
  if (value === undefined || value === null || value === '') {
    return defaultValue
  }
  if (typeof value === 'boolean') {
    return value
  }

  return !['false', '0', 'no', 'nie'].includes(normalizeLower(value))
}

function buildUserPayload(body, requester = {}) {
  const orgId = normalizeOrgId(body?.orgId)
  const requestedEmail = normalizeEmail(body?.email)
  const displayName = normalizeText(body?.displayName || body?.workerName || body?.name)
  const login = normalizeLoginLocalPart(body?.login || emailLocalPart(requestedEmail))
  const requesterEmail = normalizeEmail(requester?.email)
  const email = buildManagedUserEmail(login, requesterEmail)
  const role = normalizeUserRole(body?.role)
  const password = normalizeText(body?.password)
  const phone = normalizeText(body?.phone)
  const active = asPayloadBoolean(body?.active, true)
  const emailLogin = emailLocalPart(email)

  const validationErrors = []
  if (!requesterEmail) validationErrors.push('Token Firebase konta dodajacego nie zawiera poprawnego emaila.')
  if (requestedEmail && email && requestedEmail !== email) {
    validationErrors.push('Email musi byc wyliczony z loginu i domeny konta dodajacego.')
  }
  if (!orgId) validationErrors.push('Brak poprawnego orgId.')
  if (!email) validationErrors.push('Podaj poprawny email.')
  if (!displayName) validationErrors.push('Podaj imiÄ™ i nazwisko.')
  if (!login) validationErrors.push('Podaj poprawny login.')
  if (login && emailLogin && login !== emailLogin) {
    validationErrors.push('Login musi byÄ‡ taki sam jak czÄ™Ĺ›Ä‡ emaila przed @, aby mobile dziaĹ‚aĹ‚ bez aliasĂłw.')
  }
  if (!role) validationErrors.push('Rola musi byÄ‡ MANAGER albo WORKER.')
  if (password.length < 6) validationErrors.push('HasĹ‚o tymczasowe musi mieÄ‡ co najmniej 6 znakĂłw.')

  return {
    value: { orgId, email, displayName, login, role, password, phone, active },
    validationErrors,
  }
}

async function deleteFirebaseUserQuietly(user) {
  const uid = normalizeText(typeof user === 'string' ? user : user?.uid)
  if (!uid) return

  if (user?.provider === 'rest' && user?.idToken) {
    try {
      await callFirebaseIdentityToolkit('delete', { idToken: user.idToken })
      return
    } catch {
      // Fall back to Admin cleanup below when possible.
    }
  }

  try {
    await ensureFirebaseAdmin().auth().deleteUser(uid)
  } catch {
    try {
      await ensureFirebaseAdmin().auth().updateUser(uid, { disabled: true })
    } catch {
      // Cleanup best effort. The primary DB error is returned to the caller.
    }
  }
}

async function createAdminManagedUser(payload, requesterUid) {
  const client = await connectDbClient()
  let createdAuthUser = null

  try {
    const membership = await getRequesterMembership(client, payload.orgId, requesterUid)
    const requesterRole = normalizeRequesterRole(membership?.role)
    if (!['ADMIN', 'MANAGER'].includes(requesterRole)) {
      const error = new Error('FORBIDDEN')
      error.statusCode = membership ? 403 : 404
      error.publicCode = membership ? 'FORBIDDEN' : 'ORG_ACCESS_MISSING'
      error.publicMessage = membership
        ? 'Brak uprawnieĹ„ do dodawania uĹĽytkownikĂłw.'
        : 'Brak dostÄ™pu do tej organizacji.'
      throw error
    }

    const existingWorker = await findExistingWorker(client, payload.orgId, payload.login, payload.email)
    if (existingWorker) {
      const error = new Error('WORKER_ALREADY_EXISTS')
      error.statusCode = 409
      error.publicCode = 'WORKER_ALREADY_EXISTS'
      error.publicMessage =
        normalizeLower(existingWorker.login) === payload.login
          ? 'Ten login jest juĹĽ zajÄ™ty.'
          : 'Ten email jest juĹĽ przypisany do pracownika.'
      throw error
    }

    await assertFirebaseEmailAvailable(payload.email)
    createdAuthUser = await createFirebaseAuthUser(payload)

    await client.query('begin')
    await ensureWorkerAuthUidColumn(client)
    await client.query('lock table public.worker in share row exclusive mode')

    const currentMembership = await getRequesterMembership(client, payload.orgId, requesterUid)
    const currentRole = normalizeRequesterRole(currentMembership?.role)
    if (!['ADMIN', 'MANAGER'].includes(currentRole)) {
      const error = new Error('FORBIDDEN')
      error.statusCode = 403
      error.publicCode = 'FORBIDDEN'
      error.publicMessage = 'Brak uprawnieĹ„ do dodawania uĹĽytkownikĂłw.'
      throw error
    }

    const duplicateWorker = await findExistingWorker(client, payload.orgId, payload.login, payload.email)
    if (duplicateWorker) {
      const error = new Error('WORKER_ALREADY_EXISTS')
      error.statusCode = 409
      error.publicCode = 'WORKER_ALREADY_EXISTS'
      error.publicMessage =
        normalizeLower(duplicateWorker.login) === payload.login
          ? 'Ten login jest juĹĽ zajÄ™ty.'
          : 'Ten email jest juĹĽ przypisany do pracownika.'
      throw error
    }

    await client.query(
      `insert into public.organization_member (org_id, uid, role, created_at)
       values ($1, $2, $3, now())
       on conflict (org_id, uid) do update set role = excluded.role`,
      [payload.orgId, createdAuthUser.uid, payload.role],
    )

    const workerIdRows = await client.query('select worker_id from public.worker where org_id = $1', [payload.orgId])
    const workerId = resolveNextWorkerId(workerIdRows.rows)

    await client.query(
      `insert into public.worker (
         org_id,
         login,
         worker_id,
         full_name,
         login_email,
         role,
         active,
         email,
         phone,
         worker_type,
         auth_uid,
         edit,
         created_at,
         updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $5, $8, $6, $9, $10, now(), now())`,
      [
        payload.orgId,
        payload.login,
        workerId,
        payload.displayName,
        payload.email,
        payload.role,
        payload.active,
        payload.phone || null,
        createdAuthUser.uid,
        requesterUid,
      ],
    )

    await client.query('commit')

    return {
      uid: createdAuthUser.uid,
      orgId: payload.orgId,
      login: payload.login,
      workerId,
      email: payload.email,
      displayName: payload.displayName,
      role: payload.role,
      active: payload.active,
    }
  } catch (error) {
    try {
      await client.query('rollback')
    } catch {
      // ignore rollback failure
    }

    if (createdAuthUser?.uid) {
      await deleteFirebaseUserQuietly(createdAuthUser)
    }

    throw error
  } finally {
    if (client) client.release()
  }
}

async function handleAuthProvisionWorkerRequest(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method !== 'POST') {
    sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Dozwolona metoda to POST.')
    return
  }

  let body
  try {
    body = await readJsonBody(req)
  } catch (error) {
    if (error?.message === 'REQUEST_BODY_TOO_LARGE') {
      sendApiError(res, 413, 'REQUEST_TOO_LARGE', 'Zadanie jest zbyt duze.')
      return
    }
    sendApiError(res, 400, 'INVALID_JSON', 'Niepoprawny JSON w zadaniu.')
    return
  }

  const token = parseBearerToken(req)
  if (!token) {
    sendApiError(res, 401, 'UNAUTHENTICATED', 'Brak tokenu Firebase.')
    return
  }

  let decodedToken
  try {
    decodedToken = await verifyFirebaseIdToken(token)
  } catch (error) {
    const mapped = mapFirebaseAdminError(error)
    sendApiError(res, mapped.status === 500 ? 500 : 401, mapped.code, mapped.status === 500 ? mapped.message : 'Token Firebase jest niepoprawny albo wygasl.')
    return
  }

  const { value: payload, validationErrors } = buildProvisionWorkerPayload(body, decodedToken)
  if (validationErrors.length) {
    sendApiError(res, 400, 'VALIDATION_ERROR', validationErrors[0], validationErrors)
    return
  }

  try {
    const result = await provisionWorkerAuthUser(payload, decodedToken)
    sendJson(res, 200, result)
  } catch (error) {
    const mapped = mapFirebaseAdminError(error)
    const status = Number(error?.statusCode ?? mapped.status ?? 500)
    sendApiError(
      res,
      Number.isFinite(status) ? status : 500,
      normalizeText(error?.publicCode) || mapped.code || 'AUTH_PROVISION_WORKER_FAILED',
      normalizeText(error?.publicMessage) || mapped.message || 'Nie udalo sie utworzyc konta Firebase Auth.',
      publicErrorDetails(error),
    )
  }
}

async function handleAuthRollbackWorkerRequest(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method !== 'POST') {
    sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Dozwolona metoda to POST.')
    return
  }

  let body
  try {
    body = await readJsonBody(req)
  } catch (error) {
    if (error?.message === 'REQUEST_BODY_TOO_LARGE') {
      sendApiError(res, 413, 'REQUEST_TOO_LARGE', 'Zadanie jest zbyt duze.')
      return
    }
    sendApiError(res, 400, 'INVALID_JSON', 'Niepoprawny JSON w zadaniu.')
    return
  }

  const token = parseBearerToken(req)
  if (!token) {
    sendApiError(res, 401, 'UNAUTHENTICATED', 'Brak tokenu Firebase.')
    return
  }

  let decodedToken
  try {
    decodedToken = await verifyFirebaseIdToken(token)
  } catch (error) {
    const mapped = mapFirebaseAdminError(error)
    sendApiError(res, mapped.status === 500 ? 500 : 401, mapped.code, mapped.status === 500 ? mapped.message : 'Token Firebase jest niepoprawny albo wygasl.')
    return
  }

  try {
    const payload = verifyProvisionRollbackToken(body?.rollbackToken)
    const createdByUid = normalizeText(payload?.createdByUid)
    const createdByEmail = normalizeEmail(payload?.createdByEmail)
    const callerUid = normalizeText(decodedToken?.uid)
    const callerEmail = normalizeEmail(decodedToken?.email)
    if ((createdByUid && createdByUid !== callerUid) || (createdByEmail && createdByEmail !== callerEmail)) {
      sendApiError(res, 403, 'ROLLBACK_FORBIDDEN', 'rollbackToken zostal wystawiony dla innego konta.')
      return
    }

    await deleteFirebaseUserQuietly({
      uid: payload?.uid,
      provider: payload?.authProvider,
      idToken: payload?.authIdToken,
    })
    sendJson(res, 200, { success: true, deleted: true, uid: normalizeText(payload?.uid) })
  } catch (error) {
    const mapped = mapFirebaseAdminError(error)
    const status = Number(error?.statusCode ?? mapped.status ?? 500)
    sendApiError(
      res,
      Number.isFinite(status) ? status : 500,
      normalizeText(error?.publicCode) || mapped.code || 'AUTH_ROLLBACK_WORKER_FAILED',
      normalizeText(error?.publicMessage) || mapped.message || 'Nie udalo sie cofnac konta Firebase Auth.',
      publicErrorDetails(error),
    )
  }
}

async function handleAdminWorkerPasswordRevealRequest(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method !== 'POST') {
    sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Dozwolona metoda to POST.')
    return
  }

  let body
  try {
    body = await readJsonBody(req)
  } catch (error) {
    if (error?.message === 'REQUEST_BODY_TOO_LARGE') {
      sendApiError(res, 413, 'REQUEST_TOO_LARGE', 'Zadanie jest zbyt duze.')
      return
    }
    sendApiError(res, 400, 'INVALID_JSON', 'Niepoprawny JSON w zadaniu.')
    return
  }

  const token = parseBearerToken(req)
  if (!token) {
    sendApiError(res, 401, 'UNAUTHENTICATED', 'Brak tokenu Firebase.')
    return
  }

  try {
    await verifyFirebaseIdToken(token)
  } catch (error) {
    const mapped = mapFirebaseAdminError(error)
    sendApiError(res, mapped.status === 500 ? 500 : 401, mapped.code, mapped.status === 500 ? mapped.message : 'Token Firebase jest niepoprawny albo wygasl.')
    return
  }

  const { value: payload, validationErrors } = buildWorkerPasswordPayload(body)
  if (validationErrors.length) {
    sendApiError(res, 400, 'VALIDATION_ERROR', validationErrors[0], validationErrors)
    return
  }

  try {
    const resolved = await resolveAdminWorkerCredentialForOrg(payload.orgId, payload.login, token)
    const data = resolved.data
    if (resolved.workerMissing) {
      sendJson(res, 200, {
        ok: true,
        data: {
          hasPassword: false,
          workerMissing: true,
          login: payload.login,
          message: 'Nie znaleziono rekordu pracownika dla tego loginu w organizacji.',
          password: '',
          updatedAt: null,
          updatedBy: '',
        },
      })
      return
    }

    const credential = data?.workerCredential ?? null
    if (!credential?.encryptedPassword) {
      sendJson(res, 200, {
        ok: true,
        data: {
          hasPassword: false,
          login: resolved.login,
          requestedLogin: resolved.requestedLogin,
          password: '',
          updatedAt: null,
          updatedBy: '',
        },
      })
      return
    }

    let password = ''
    try {
      password = decryptWorkerPassword(credential)
    } catch (error) {
      if (!isWorkerPasswordRevealableConfigError(error)) {
        throw error
      }
      sendJson(res, 200, {
        ok: true,
        data: {
          hasPassword: false,
          passwordVaultUnavailable: true,
          message: workerPasswordRevealUnavailableMessage(error),
          password: '',
          login: resolved.login,
          requestedLogin: resolved.requestedLogin,
          updatedAt: credential.updatedAt ?? null,
          updatedBy: credential.updatedBy ?? '',
        },
      })
      return
    }

    sendJson(res, 200, {
      ok: true,
      data: {
        hasPassword: true,
        password,
        login: resolved.login,
        requestedLogin: resolved.requestedLogin,
        updatedAt: credential.updatedAt ?? null,
        updatedBy: credential.updatedBy ?? '',
      },
    })
  } catch (error) {
    const mapped = mapFirebaseAdminError(error)
    const status = Number(error?.statusCode ?? mapped.status ?? 500)
    sendApiError(
      res,
      Number.isFinite(status) ? status : 500,
      normalizeText(error?.publicCode) || 'WORKER_PASSWORD_REVEAL_FAILED',
      normalizeText(error?.publicMessage) || error?.message || 'Nie udalo sie odczytac hasla pracownika.',
      publicErrorDetails(error),
    )
  }
}

async function handleAdminWorkerPasswordSetRequest(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method !== 'POST') {
    sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Dozwolona metoda to POST.')
    return
  }

  let body
  try {
    body = await readJsonBody(req)
  } catch (error) {
    if (error?.message === 'REQUEST_BODY_TOO_LARGE') {
      sendApiError(res, 413, 'REQUEST_TOO_LARGE', 'Zadanie jest zbyt duze.')
      return
    }
    sendApiError(res, 400, 'INVALID_JSON', 'Niepoprawny JSON w zadaniu.')
    return
  }

  const token = parseBearerToken(req)
  if (!token) {
    sendApiError(res, 401, 'UNAUTHENTICATED', 'Brak tokenu Firebase.')
    return
  }

  let decodedToken
  try {
    decodedToken = await verifyFirebaseIdToken(token)
  } catch (error) {
    const mapped = mapFirebaseAdminError(error)
    sendApiError(res, mapped.status === 500 ? 500 : 401, mapped.code, mapped.status === 500 ? mapped.message : 'Token Firebase jest niepoprawny albo wygasl.')
    return
  }

  const { value: payload, validationErrors } = buildWorkerPasswordPayload(body, { requirePassword: true })
  if (validationErrors.length) {
    sendApiError(res, 400, 'VALIDATION_ERROR', validationErrors[0], validationErrors)
    return
  }

  try {
    const resolved = await resolveAdminWorkerCredentialForOrg(payload.orgId, payload.login, token)
    const data = resolved.data
    if (resolved.workerMissing) {
      const error = new Error('WORKER_NOT_FOUND')
      error.statusCode = 404
      error.publicCode = 'WORKER_NOT_FOUND'
      error.publicMessage = 'Nie znaleziono rekordu pracownika dla tego loginu w organizacji.'
      throw error
    }

    const worker = data?.worker ?? null
    if (!worker?.authUid) {
      const error = new Error('WORKER_AUTH_UID_MISSING')
      error.statusCode = 400
      error.publicCode = 'WORKER_AUTH_UID_MISSING'
      error.publicMessage = 'Pracownik nie ma zapisanego UID Firebase Auth.'
      throw error
    }

    if (!payload.skipAuthUpdate) {
      await updateFirebaseAuthPassword(worker.authUid, payload.password)
    }

    const encrypted = encryptWorkerPassword(payload.password)
    await upsertWorkerCredentialForOrg(
      {
        orgId: payload.orgId,
        login: resolved.login,
        ...encrypted,
        updatedBy: normalizeEmail(decodedToken?.email) || normalizeText(decodedToken?.uid) || null,
      },
      token,
    )

    sendJson(res, 200, {
      ok: true,
      data: {
        hasPassword: true,
        login: resolved.login,
        requestedLogin: resolved.requestedLogin,
        updatedAt: new Date().toISOString(),
        skippedAuthUpdate: payload.skipAuthUpdate,
      },
    })
  } catch (error) {
    const mapped = mapFirebaseAdminError(error)
    const status = Number(error?.statusCode ?? mapped.status ?? 500)
    sendApiError(
      res,
      Number.isFinite(status) ? status : 500,
      normalizeText(error?.publicCode) || mapped.code || 'WORKER_PASSWORD_SET_FAILED',
      normalizeText(error?.publicMessage) || mapped.message || error?.message || 'Nie udalo sie zapisac hasla pracownika.',
      publicErrorDetails(error),
    )
  }
}

async function handleAdminUsersRequest(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method !== 'POST') {
    sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Dozwolona metoda to POST.')
    return
  }

  let body
  try {
    body = await readJsonBody(req)
  } catch (error) {
    if (error?.message === 'REQUEST_BODY_TOO_LARGE') {
      sendApiError(res, 413, 'REQUEST_TOO_LARGE', 'Ĺ»Ä…danie jest zbyt duĹĽe.')
      return
    }
    sendApiError(res, 400, 'INVALID_JSON', 'Niepoprawny JSON w ĹĽÄ…daniu.')
    return
  }

  const token = parseBearerToken(req)
  if (!token) {
    sendApiError(res, 401, 'UNAUTHENTICATED', 'Brak tokenu Firebase.')
    return
  }

  let decodedToken
  try {
    decodedToken = await verifyFirebaseIdToken(token)
  } catch (error) {
    logAdminUsersError(error, 'verify-token')
    const mapped = mapFirebaseAdminError(error)
    sendApiError(res, mapped.status === 500 ? 500 : 401, mapped.code === 'FIREBASE_AUTH_ERROR' ? 'UNAUTHENTICATED' : mapped.code, mapped.status === 500 ? mapped.message : 'Token Firebase jest niepoprawny albo wygasĹ‚.')
    return
  }

  const { value: payload, validationErrors } = buildUserPayload(body, decodedToken)
  if (validationErrors.length) {
    sendApiError(res, 400, 'VALIDATION_ERROR', validationErrors[0], validationErrors)
    return
  }

  try {
    const adminUsersMode = normalizeText(process.env.ADMIN_USERS_MODE || process.env.ADMIN_USERS_PROXY_MODE).toLowerCase()
    const useDataConnectProvisioning =
      !hasDatabaseConnectionConfig() || ['dataconnect', 'data-connect', 'auth', 'firebase-auth'].includes(adminUsersMode)
    const user = useDataConnectProvisioning
      ? await createAdminManagedUserViaDataConnect(payload, decodedToken, token)
      : await createAdminManagedUser(payload, decodedToken.uid)
    sendJson(res, 201, { ok: true, data: { user } })
  } catch (error) {
    logAdminUsersError(error, 'create-user')
    if (error?.message === 'DB_CONFIG_MISSING') {
      sendApiError(res, 500, 'DB_CONFIG_MISSING', 'Brak konfiguracji poĹ‚Ä…czenia z bazÄ… danych.')
      return
    }

    const databaseError = mapDatabaseConnectionError(error)
    if (databaseError) {
      sendApiError(res, databaseError.status, databaseError.code, databaseError.message)
      return
    }

    const status = Number(error?.statusCode ?? 500)
    sendApiError(
      res,
      Number.isFinite(status) ? status : 500,
      normalizeText(error?.publicCode) || 'CREATE_USER_FAILED',
      normalizeText(error?.publicMessage) || 'Nie udaĹ‚o siÄ™ dodaÄ‡ uĹĽytkownika.',
      publicErrorDetails(error),
    )
  }
}

async function handleAuthSessionContextRequest(req, res, requestUrl) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const method = String(req.method || 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'POST') {
    sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Dozwolone metody to GET i POST.')
    return
  }

  let body = {}
  if (method === 'POST') {
    try {
      body = await readJsonBody(req)
    } catch (error) {
      if (error?.message === 'REQUEST_BODY_TOO_LARGE') {
        sendApiError(res, 413, 'REQUEST_TOO_LARGE', 'Ĺ»Ä…danie jest zbyt duĹĽe.')
        return
      }
      sendApiError(res, 400, 'INVALID_JSON', 'Niepoprawny JSON w ĹĽÄ…daniu.')
      return
    }
  }

  const token = parseBearerToken(req)
  if (!token) {
    sendApiError(res, 401, 'UNAUTHENTICATED', 'Brak tokenu Firebase.')
    return
  }

  let decodedToken
  try {
    decodedToken = await verifyFirebaseIdToken(token)
  } catch (error) {
    const mapped = mapFirebaseAdminError(error)
    sendApiError(res, mapped.status, mapped.code, mapped.message)
    return
  }

  const requestedOrgId = normalizeOrgId(method === 'GET' ? requestUrl.searchParams.get('orgId') : body?.orgId)
  const requesterUid = normalizeText(decodedToken?.uid)
  let client = null

  try {
    client = await connectDbClient()
    const rows = await getRequesterMemberships(client, requesterUid)
    const memberships = rows
      .filter((row) => !requestedOrgId || normalizeOrgId(row.org_id) === requestedOrgId)
      .map((row) => {
        const orgId = normalizeOrgId(row.org_id)
        return {
          orgId,
          role: normalizeText(row.role),
          organization: {
            name: orgId,
            status: 'ACTIVE',
          },
        }
      })

    sendJson(res, 200, {
      ok: true,
      data: {
        organizationMembers: memberships,
      },
    })
  } catch (error) {
    const mappedDb = mapDatabaseConnectionError(error)
    if (mappedDb) {
      sendApiError(res, mappedDb.status, mappedDb.code, mappedDb.message)
      return
    }

    sendApiError(res, 500, 'AUTH_CONTEXT_ERROR', error?.message || 'Nie udaĹ‚o siÄ™ pobraÄ‡ organizacji uĹĽytkownika.')
  } finally {
    client.release()
  }
}

async function ensurePortalTaskTable(client) {
  if (await databaseRelationExists(client, 'public.portal_task')) {
    return
  }

  await client.query(`
    create table if not exists public.portal_task (
      org_id varchar(64) not null,
      task_id varchar(180) not null,
      source_comment_key text,
      payload jsonb not null default '{}'::jsonb,
      updated_by varchar(128),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (org_id, task_id)
    )
  `)
  await client.query('create index if not exists portal_task_org_source_idx on public.portal_task (org_id, source_comment_key)')
  await client.query('create index if not exists portal_task_org_updated_idx on public.portal_task (org_id, updated_at desc)')
}

function sanitizePortalTaskId(value) {
  const id = normalizeText(value)
  return id ? id.slice(0, 180) : ''
}

function sanitizePortalTaskPayload(rawTask) {
  if (!rawTask || typeof rawTask !== 'object' || Array.isArray(rawTask)) {
    return null
  }

  const id = sanitizePortalTaskId(rawTask.id)
  if (!id) {
    return null
  }

  const nowIso = new Date().toISOString()
  return {
    ...rawTask,
    id,
    sourceCommentKey: normalizeText(rawTask.sourceCommentKey || rawTask.sourceKey).slice(0, 700),
    updatedAt: normalizeText(rawTask.updatedAt) || nowIso,
    createdAt: normalizeText(rawTask.createdAt) || nowIso,
  }
}

async function requirePortalTaskAccess(client, orgId, uid) {
  const membership = await getRequesterMembership(client, orgId, uid)
  const role = normalizeRequesterRole(membership?.role)
  if (!['ADMIN', 'MANAGER', 'COORDINATOR'].includes(role)) {
    const error = new Error('FORBIDDEN')
    error.statusCode = membership ? 403 : 404
    error.publicCode = membership ? 'FORBIDDEN' : 'ORG_ACCESS_MISSING'
    error.publicMessage = membership
      ? 'Brak uprawnieĹ„ do zadaĹ„ portalu.'
      : 'Brak dostÄ™pu do tej organizacji.'
    throw error
  }
  return role
}

async function readPortalTasks(client, orgId) {
  const result = await client.query(
    `select payload
       from public.portal_task
      where org_id = $1
      order by
        coalesce(payload->>'dateYmd', '') asc,
        coalesce(payload->>'startTime', payload->>'time', '') asc,
        task_id asc`,
    [orgId],
  )
  return result.rows.map((row) => row.payload).filter((task) => task && typeof task === 'object')
}

const PORTAL_SCHEDULE_ORDER_COLUMNS = [
  'org_id',
  'id_task',
  'client_id',
  'zone_id',
  'access_end_time',
  'access_start_time',
  'access_windows',
  'address_label',
  'allow_extended_work',
  'city',
  'client_label',
  'client_name',
  'created_at',
  'created_by_uid',
  'date_ymd',
  'description',
  'end_date_ymd',
  'end_time',
  'execution_address_label',
  'lat',
  'lng',
  'nip',
  'object_plan_tasks',
  'post_code',
  'price',
  'repeat_every',
  'repeat_preset',
  'repeat_unit',
  'repeat_weekdays',
  'required_people',
  'required_work_minutes',
  'schedule_mode',
  'start_time',
  'street',
  'supplies',
  'title',
  'type',
  'updated_at',
  'updated_by_uid',
  'weekly_schedule_rules',
  'work_allocations',
  'worker_comment',
  'worker_id',
  'worker_ids',
  'worker_label',
  'worker_login',
  'worker_name',
  'zone_label',
]

function portalScheduleOrderNullableText(value, maxLength = 0) {
  const text = normalizeText(value)
  if (!text) return null
  return maxLength > 0 ? text.slice(0, maxLength) : text
}

function sanitizePortalScheduleOrderId(value) {
  return normalizeText(value).slice(0, 180)
}

function normalizePortalScheduleOrderDate(value, fallback = '') {
  const text = normalizeText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback
}

function normalizePortalScheduleOrderTime(value, fallback = '') {
  const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(normalizeText(value))
  return match ? `${match[1]}:${match[2]}` : fallback
}

function portalScheduleOrderNumber(value, fallback = null) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  const text = normalizeText(value).replace(',', '.')
  if (!text) return fallback
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : fallback
}

function portalScheduleOrderInteger(value, fallback = null) {
  const parsed = portalScheduleOrderNumber(value, fallback)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback
}

function portalScheduleOrderBoolean(value) {
  if (typeof value === 'boolean') return value
  return isTrue(value)
}

function portalScheduleOrderJsonValue(value, fallback = []) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') return value
  const text = normalizeText(value)
  if (!text) return fallback
  try {
    const parsed = JSON.parse(text)
    return parsed == null ? fallback : parsed
  } catch {
    return fallback
  }
}

function portalScheduleOrderFirstJsonValue(fallback, ...values) {
  for (const value of values) {
    if (Array.isArray(value) || (value && typeof value === 'object')) return value
    const text = normalizeText(value)
    if (!text) continue
    const parsed = portalScheduleOrderJsonValue(text, null)
    if (parsed != null) return parsed
  }
  return fallback
}

function portalScheduleOrderJsonString(value, fallback = []) {
  return JSON.stringify(portalScheduleOrderJsonValue(value, fallback))
}

function portalScheduleOrderDateOrdinal(value) {
  const ymd = normalizePortalScheduleOrderDate(value)
  if (!ymd) return null
  return Math.floor(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10))) / 86400000)
}

function portalScheduleOrderTimeMinutes(value) {
  const time = normalizePortalScheduleOrderTime(value)
  if (!time) return null
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
}

function portalScheduleOrderDurationMinutes(order = {}) {
  const explicit = portalScheduleOrderInteger(order.requiredWorkMinutes ?? order.required_work_minutes ?? order.durationMinutes, null)
  if (Number.isFinite(explicit) && explicit > 0) return explicit
  const startDay = normalizePortalScheduleOrderDate(order.dateYmd ?? order.date_ymd)
  const endDay = normalizePortalScheduleOrderDate(order.endDateYmd ?? order.end_date_ymd, startDay)
  const startMinute = portalScheduleOrderTimeMinutes(order.startTime ?? order.start_time)
  const endMinute = portalScheduleOrderTimeMinutes(order.endTime ?? order.end_time)
  const startOrdinal = portalScheduleOrderDateOrdinal(startDay)
  const endOrdinal = portalScheduleOrderDateOrdinal(endDay)
  if (startOrdinal == null || endOrdinal == null || startMinute == null || endMinute == null || endOrdinal < startOrdinal) return null
  const total = (endOrdinal - startOrdinal) * 1440 + endMinute - startMinute
  return total > 0 ? total : null
}

function portalScheduleOrderWorkerId(value) {
  const raw = normalizeText(value)
  const lowered = raw.toLowerCase()
  if (!raw || lowered === 'buffer' || lowered === 'bufor') return ''
  const upper = raw.toUpperCase()
  return /^W\d+$/.test(upper) ? upper : raw.slice(0, 64)
}

function portalScheduleOrderWorkerKey(value) {
  return normalizeText(value).toLowerCase()
}

function portalScheduleOrderUniqueText(values = []) {
  const seen = new Set()
  const result = []
  values.forEach((value) => {
    const text = normalizeText(value)
    const key = text.toLowerCase()
    if (!text || seen.has(key)) return
    seen.add(key)
    result.push(text)
  })
  return result
}

function portalScheduleOrderAllocationFromItem(item, index = 0) {
  if (typeof item === 'string') {
    const workerId = portalScheduleOrderWorkerId(item)
    return workerId ? { row: index, workerId, key: portalScheduleOrderWorkerKey(workerId), name: workerId, workerLogin: '', allocationMinutes: null } : null
  }
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  const rawKey = portalScheduleOrderNullableText(item.key ?? item.workerKey ?? item.id, 128)
  const workerId = portalScheduleOrderWorkerId(item.workerId ?? item.worker_id ?? item.id ?? rawKey)
  const name = portalScheduleOrderNullableText(item.name ?? item.workerName ?? item.worker_label ?? item.workerLabel ?? item.label, 240)
  const loweredKey = normalizeText(rawKey || workerId || name).toLowerCase()
  const isBuffer = loweredKey === 'buffer' || loweredKey === 'bufor' || normalizeText(name).toLowerCase() === 'bufor'
  const row = portalScheduleOrderInteger(item.row ?? item.rowIndex, index)
  return {
    row: Number.isInteger(row) && row >= 0 ? row : index,
    workerId: isBuffer ? '' : workerId,
    key: isBuffer ? 'buffer' : portalScheduleOrderWorkerKey(rawKey || workerId),
    name: name || (isBuffer ? 'BUFOR' : workerId),
    workerLogin: portalScheduleOrderNullableText(item.workerLogin ?? item.worker_login ?? item.login, 80) || '',
    allocationMinutes: portalScheduleOrderInteger(item.allocationMinutes ?? item.minutes, null),
  }
}

function portalScheduleOrderAllocationsFromOrder(order = {}) {
  const source = portalScheduleOrderFirstJsonValue([], order.workAllocations, order.work_allocations, order.workerAssignments, order.assignedWorkers, order.workers)
  const allocations = (Array.isArray(source) ? source : []).map((item, index) => portalScheduleOrderAllocationFromItem(item, index)).filter(Boolean)
  if (!allocations.length && Array.isArray(order.assignedRows) && order.assignedRows.length) {
    order.assignedRows.forEach((row, index) => {
      const rowIndex = portalScheduleOrderInteger(row, index)
      allocations.push({
        row: Number.isInteger(rowIndex) && rowIndex >= 0 ? rowIndex : index,
        workerId: '',
        key: 'buffer',
        name: portalScheduleOrderNullableText(order.workerLabel ?? order.worker_label, 240) || 'BUFOR',
        workerLogin: '',
        allocationMinutes: null,
      })
    })
  }
  if (!allocations.length) {
    const workerId = portalScheduleOrderWorkerId(order.workerId ?? order.worker_id)
    const workerLabel = portalScheduleOrderNullableText(order.workerLabel ?? order.worker_label ?? order.workerName ?? order.worker_name, 240)
    if (workerId || workerLabel) {
      allocations.push({
        row: portalScheduleOrderInteger(order.row, 0) ?? 0,
        workerId,
        key: workerId ? portalScheduleOrderWorkerKey(workerId) : 'buffer',
        name: workerLabel || workerId || 'BUFOR',
        workerLogin: portalScheduleOrderNullableText(order.workerLogin ?? order.worker_login, 80) || '',
        allocationMinutes: portalScheduleOrderInteger(order.requiredWorkMinutes ?? order.required_work_minutes, null),
      })
    }
  }
  if (!allocations.length) {
    allocations.push({ row: portalScheduleOrderInteger(order.row, 0) ?? 0, workerId: '', key: 'buffer', name: 'BUFOR', workerLogin: '', allocationMinutes: null })
  }
  return allocations
}

function portalScheduleOrderTimestamp(value, fallbackIso = new Date().toISOString()) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString()
  const text = normalizeText(value)
  if (!text) return fallbackIso
  const parsed = Date.parse(text)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallbackIso
}

function portalScheduleOrderDbRow(order = {}, orgId, requesterUid) {
  const idTask = sanitizePortalScheduleOrderId(order.idTask ?? order.id ?? order.id_task)
  if (!idTask || order.isDraft) return null
  const nowIso = new Date().toISOString()
  const dateYmd = normalizePortalScheduleOrderDate(order.dateYmd ?? order.date_ymd ?? order.dateFrom ?? order.startDate)
  const startTime = normalizePortalScheduleOrderTime(order.startTime ?? order.start_time ?? order.time)
  const endDateYmd = normalizePortalScheduleOrderDate(order.endDateYmd ?? order.end_date_ymd ?? order.validUntil ?? order.dateTo ?? order.endDate, dateYmd)
  const endTime = normalizePortalScheduleOrderTime(order.endTime ?? order.end_time ?? order.stopTime)
  const allocations = portalScheduleOrderAllocationsFromOrder(order)
  const realAllocations = allocations.filter((item) => portalScheduleOrderWorkerId(item.workerId))
  const workerIds = portalScheduleOrderUniqueText(realAllocations.map((item) => portalScheduleOrderWorkerId(item.workerId)))
  const primaryAllocation = realAllocations[0] || null
  const workerLabel = realAllocations.length
    ? realAllocations.map((item) => item.name || item.workerId).filter(Boolean).join(', ')
    : portalScheduleOrderNullableText(order.workerLabel ?? order.worker_label ?? order.workerName ?? order.worker_name, 240) || 'BUFOR'
  const objectPlanTasks = portalScheduleOrderFirstJsonValue([], order.objectPlanTasks, order.object_plan_tasks, order.tasks, order.subtasks, order.activities)
  const supplies = portalScheduleOrderFirstJsonValue([], order.supplies, order.itemsToTake, order.suppliesForWorkers)
  const uid = normalizeText(requesterUid)
  return {
    org_id: orgId,
    id_task: idTask,
    client_id: portalScheduleOrderNullableText(order.clientId ?? order.client_id, 64),
    zone_id: portalScheduleOrderNullableText(order.zoneId ?? order.zone_id, 64),
    access_end_time: portalScheduleOrderNullableText(normalizePortalScheduleOrderTime(order.accessEndTime ?? order.access_end_time, endTime), 5),
    access_start_time: portalScheduleOrderNullableText(normalizePortalScheduleOrderTime(order.accessStartTime ?? order.access_start_time, startTime), 5),
    access_windows: portalScheduleOrderJsonString(order.accessWindows ?? order.access_windows, []),
    address_label: portalScheduleOrderNullableText(order.addressLabel ?? order.address_label, 800),
    allow_extended_work: portalScheduleOrderBoolean(order.allowExtendedWork ?? order.allow_extended_work),
    city: portalScheduleOrderNullableText(order.city ?? order.clientCity, 160),
    client_label: portalScheduleOrderNullableText(order.clientLabel ?? order.client_label ?? order.clientName ?? order.client_name, 500),
    client_name: portalScheduleOrderNullableText(order.clientName ?? order.client_name ?? order.clientLabel ?? order.client_label, 500),
    created_at: portalScheduleOrderTimestamp(order.createdAt ?? order.created_at, nowIso),
    created_by_uid: portalScheduleOrderNullableText(order.createdByUid ?? order.created_by_uid ?? order.createdBy ?? uid, 128),
    date_ymd: portalScheduleOrderNullableText(dateYmd, 10),
    description: portalScheduleOrderNullableText(order.description, 4000),
    end_date_ymd: portalScheduleOrderNullableText(endDateYmd, 10),
    end_time: portalScheduleOrderNullableText(endTime, 5),
    execution_address_label: portalScheduleOrderNullableText(order.executionAddressLabel ?? order.execution_address_label ?? order.customAddressLabel, 800),
    lat: portalScheduleOrderNumber(order.lat ?? order.latitude, null),
    lng: portalScheduleOrderNumber(order.lng ?? order.longitude, null),
    nip: portalScheduleOrderNullableText(order.nip ?? order.clientNip, 80),
    object_plan_tasks: JSON.stringify(Array.isArray(objectPlanTasks) ? objectPlanTasks : []),
    post_code: portalScheduleOrderNullableText(order.postCode ?? order.post_code ?? order.postalCode ?? order.clientPostCode, 32),
    price: portalScheduleOrderNumber(order.price, 0),
    repeat_every: portalScheduleOrderInteger(order.repeatEvery ?? order.repeat_every, null),
    repeat_preset: portalScheduleOrderNullableText(order.repeatPreset ?? order.repeat_preset, 32),
    repeat_unit: portalScheduleOrderNullableText(order.repeatUnit ?? order.repeat_unit, 16),
    repeat_weekdays: portalScheduleOrderJsonString(order.repeatWeekdays ?? order.repeat_weekdays, []),
    required_people: workerIds.length,
    required_work_minutes: portalScheduleOrderDurationMinutes({ ...order, dateYmd, startTime, endDateYmd, endTime }),
    schedule_mode:
      portalScheduleOrderNullableText(order.scheduleMode ?? order.schedule_mode, 32) ||
      (normalizeText(order.type) === 'cyclic' || normalizeText(order.repeatPreset ?? order.repeat_preset) !== 'none' ? 'repeat' : 'once'),
    start_time: portalScheduleOrderNullableText(startTime, 5),
    street: portalScheduleOrderNullableText(order.street ?? order.clientStreet, 500),
    supplies: JSON.stringify(Array.isArray(supplies) ? supplies : []),
    title: portalScheduleOrderNullableText(order.title ?? order.name, 500) || 'Zlecenie',
    type: portalScheduleOrderNullableText(order.type, 40) || 'other',
    updated_at: nowIso,
    updated_by_uid: portalScheduleOrderNullableText(uid || order.updatedByUid || order.updated_by_uid || order.updatedBy, 128),
    weekly_schedule_rules: portalScheduleOrderJsonString(order.weeklyScheduleRules ?? order.weekly_schedule_rules, []),
    work_allocations: JSON.stringify(allocations),
    worker_comment: portalScheduleOrderNullableText(order.workerComment ?? order.worker_comment ?? order.workerOnlyComment, 4000),
    worker_id: primaryAllocation?.workerId || portalScheduleOrderNullableText(order.workerId ?? order.worker_id, 64),
    worker_ids: JSON.stringify(workerIds),
    worker_label: workerLabel,
    worker_login: primaryAllocation?.workerLogin || portalScheduleOrderNullableText(order.workerLogin ?? order.worker_login, 80),
    worker_name: primaryAllocation?.name || portalScheduleOrderNullableText(order.workerName ?? order.worker_name, 240),
    zone_label: portalScheduleOrderNullableText(order.zoneLabel ?? order.zone_label ?? order.zoneName, 240),
  }
}

function portalScheduleOrderFromDbRow(row = {}) {
  const id = sanitizePortalScheduleOrderId(row.id_task ?? row.idTask ?? row.id)
  if (!id) return null
  const dateYmd = normalizePortalScheduleOrderDate(row.date_ymd ?? row.dateYmd)
  const endDateYmd = normalizePortalScheduleOrderDate(row.end_date_ymd ?? row.endDateYmd, dateYmd)
  const allocations = portalScheduleOrderAllocationsFromOrder(row)
  const assignedRows = portalScheduleOrderUniqueText(allocations.map((item) => String(item.row)))
    .map((value) => portalScheduleOrderInteger(value, 0))
    .filter((value) => Number.isInteger(value))
  const workerIds = portalScheduleOrderJsonValue(row.worker_ids ?? row.workerIds, [])
  const accessWindows = portalScheduleOrderJsonValue(row.access_windows ?? row.accessWindows, [])
  const repeatWeekdays = portalScheduleOrderJsonValue(row.repeat_weekdays ?? row.repeatWeekdays, [])
  const weeklyScheduleRules = portalScheduleOrderJsonValue(row.weekly_schedule_rules ?? row.weeklyScheduleRules, [])
  const supplies = portalScheduleOrderJsonValue(row.supplies, [])
  const objectPlanTasks = portalScheduleOrderJsonValue(row.object_plan_tasks ?? row.objectPlanTasks, [])
  const clientName = portalScheduleOrderNullableText(row.client_name ?? row.joined_client_name ?? row.clientLabel, 500)
  const clientLabel = portalScheduleOrderNullableText(row.client_label ?? clientName, 500)
  const workerName = portalScheduleOrderNullableText(row.worker_name ?? row.joined_worker_name, 240)
  const workerLogin = portalScheduleOrderNullableText(row.worker_login ?? row.joined_worker_login, 80)
  const createdAt = portalScheduleOrderTimestamp(row.created_at ?? row.createdAt)
  const updatedAt = portalScheduleOrderTimestamp(row.updated_at ?? row.updatedAt, createdAt)
  return {
    id,
    idTask: id,
    isDraft: false,
    recordKind: 'portal-schedule-order',
    row: assignedRows[0] ?? 0,
    assignedRows: assignedRows.length ? assignedRows : [0],
    workerAssignments: allocations,
    dateYmd,
    startTime: normalizePortalScheduleOrderTime(row.start_time ?? row.startTime, '08:00'),
    endDateYmd,
    endTime: normalizePortalScheduleOrderTime(row.end_time ?? row.endTime, '09:00'),
    validUntil: endDateYmd,
    nextDate: dateYmd,
    scheduleMode: portalScheduleOrderNullableText(row.schedule_mode ?? row.scheduleMode, 32) || 'once',
    accessStartTime: normalizePortalScheduleOrderTime(row.access_start_time ?? row.accessStartTime),
    accessEndTime: normalizePortalScheduleOrderTime(row.access_end_time ?? row.accessEndTime),
    accessWindows: Array.isArray(accessWindows) ? accessWindows : [],
    requiredWorkMinutes: portalScheduleOrderInteger(row.required_work_minutes ?? row.requiredWorkMinutes, null),
    requiredPeople: portalScheduleOrderInteger(row.required_people ?? row.requiredPeople, 0),
    workAllocations: allocations,
    workerId: portalScheduleOrderNullableText(row.worker_id ?? row.workerId, 64),
    workerIds: Array.isArray(workerIds) ? workerIds : [],
    workerLabel: portalScheduleOrderNullableText(row.worker_label ?? row.workerLabel ?? workerName, 500) || 'BUFOR',
    workerName,
    workerLogin,
    clientId: portalScheduleOrderNullableText(row.client_id ?? row.clientId, 64),
    clientLabel,
    clientName: clientName || clientLabel,
    nip: portalScheduleOrderNullableText(row.nip ?? row.joined_client_nip, 80),
    clientNip: portalScheduleOrderNullableText(row.nip ?? row.joined_client_nip, 80),
    street: portalScheduleOrderNullableText(row.street ?? row.joined_client_street, 500),
    clientStreet: portalScheduleOrderNullableText(row.street ?? row.joined_client_street, 500),
    city: portalScheduleOrderNullableText(row.city ?? row.joined_client_city, 160),
    clientCity: portalScheduleOrderNullableText(row.city ?? row.joined_client_city, 160),
    postCode: portalScheduleOrderNullableText(row.post_code ?? row.joined_client_post_code, 32),
    postalCode: portalScheduleOrderNullableText(row.post_code ?? row.joined_client_post_code, 32),
    clientPostCode: portalScheduleOrderNullableText(row.post_code ?? row.joined_client_post_code, 32),
    addressLabel: portalScheduleOrderNullableText(row.address_label ?? row.addressLabel, 800),
    executionAddressLabel: portalScheduleOrderNullableText(row.execution_address_label ?? row.executionAddressLabel, 800),
    customAddressLabel: portalScheduleOrderNullableText(row.execution_address_label ?? row.executionAddressLabel, 800),
    lat: portalScheduleOrderNumber(row.lat, null),
    lng: portalScheduleOrderNumber(row.lng, null),
    zoneId: portalScheduleOrderNullableText(row.zone_id ?? row.zoneId, 64),
    zoneLabel: portalScheduleOrderNullableText(row.zone_label ?? row.zoneLabel, 240),
    repeatPreset: portalScheduleOrderNullableText(row.repeat_preset ?? row.repeatPreset, 32),
    repeatEvery: portalScheduleOrderInteger(row.repeat_every ?? row.repeatEvery, null),
    repeatUnit: portalScheduleOrderNullableText(row.repeat_unit ?? row.repeatUnit, 16),
    repeatWeekdays: Array.isArray(repeatWeekdays) ? repeatWeekdays : [],
    weeklyScheduleRules: Array.isArray(weeklyScheduleRules) ? weeklyScheduleRules : [],
    title: portalScheduleOrderNullableText(row.title, 500) || clientLabel || 'Zlecenie',
    type: portalScheduleOrderNullableText(row.type, 40) || 'other',
    price: portalScheduleOrderNumber(row.price, 0),
    description: portalScheduleOrderNullableText(row.description, 4000),
    workerComment: portalScheduleOrderNullableText(row.worker_comment ?? row.workerComment, 4000),
    workerOnlyComment: portalScheduleOrderNullableText(row.worker_comment ?? row.workerComment, 4000),
    employeeComment: portalScheduleOrderNullableText(row.worker_comment ?? row.workerComment, 4000),
    appComment: portalScheduleOrderNullableText(row.worker_comment ?? row.workerComment, 4000),
    mobileComment: portalScheduleOrderNullableText(row.worker_comment ?? row.workerComment, 4000),
    privateWorkerComment: portalScheduleOrderNullableText(row.worker_comment ?? row.workerComment, 4000),
    commentForWorkers: portalScheduleOrderNullableText(row.worker_comment ?? row.workerComment, 4000),
    supplies: Array.isArray(supplies) ? supplies : [],
    itemsToTake: Array.isArray(supplies) ? supplies : [],
    suppliesForWorkers: Array.isArray(supplies) ? supplies : [],
    objectPlanTasks: Array.isArray(objectPlanTasks) ? objectPlanTasks : [],
    tasks: Array.isArray(objectPlanTasks) ? objectPlanTasks : [],
    subtasks: Array.isArray(objectPlanTasks) ? objectPlanTasks : [],
    activities: Array.isArray(objectPlanTasks) ? objectPlanTasks : [],
    allowExtendedWork: portalScheduleOrderBoolean(row.allow_extended_work ?? row.allowExtendedWork),
    createdByUid: portalScheduleOrderNullableText(row.created_by_uid ?? row.createdByUid, 128),
    updatedByUid: portalScheduleOrderNullableText(row.updated_by_uid ?? row.updatedByUid, 128),
    createdAt,
    updatedAt,
  }
}

function sortPortalScheduleOrders(orders = []) {
  return [...orders].sort((left, right) => {
    const leftDate = normalizeText(left?.dateYmd)
    const rightDate = normalizeText(right?.dateYmd)
    if (leftDate !== rightDate) return leftDate.localeCompare(rightDate)
    const leftTime = normalizeText(left?.startTime)
    const rightTime = normalizeText(right?.startTime)
    if (leftTime !== rightTime) return leftTime.localeCompare(rightTime)
    return normalizeText(left?.id).localeCompare(normalizeText(right?.id))
  })
}

async function ensurePortalScheduleOrderTable(client) {
  await client.query(`
    create table if not exists public.task (
      org_id varchar(64) not null,
      id_task varchar(180) not null,
      client_id varchar(64),
      zone_id varchar(64),
      access_end_time varchar(5),
      access_start_time varchar(5),
      access_windows text,
      address_label text,
      allow_extended_work boolean,
      city text,
      client_label text,
      client_name text,
      created_at timestamptz,
      created_by_uid varchar(128),
      date_ymd varchar(10),
      description text,
      end_date_ymd varchar(10),
      end_time varchar(5),
      execution_address_label text,
      lat double precision,
      lng double precision,
      nip text,
      object_plan_tasks text,
      post_code text,
      price double precision,
      repeat_every integer,
      repeat_preset varchar(32),
      repeat_unit varchar(16),
      repeat_weekdays text,
      required_people integer,
      required_work_minutes integer,
      schedule_mode varchar(32),
      start_time varchar(5),
      street text,
      supplies text,
      title text,
      type varchar(40),
      updated_at timestamptz,
      updated_by_uid varchar(128),
      weekly_schedule_rules text,
      work_allocations text,
      worker_comment text,
      worker_id varchar(64),
      worker_ids text,
      worker_label text,
      worker_login varchar(80),
      worker_name text,
      zone_label text,
      primary key (org_id, id_task)
    )
  `)
}

async function requirePortalScheduleOrderAccess(client, orgId, uid, { write = false } = {}) {
  const membership = await getRequesterMembership(client, orgId, uid)
  const role = normalizeRequesterRole(membership?.role)
  const allowed = write ? ['ADMIN', 'MANAGER', 'COORDINATOR'] : ['ADMIN', 'MANAGER', 'COORDINATOR', 'WORKER']
  if (!allowed.includes(role)) {
    const error = new Error('FORBIDDEN')
    error.statusCode = membership ? 403 : 404
    error.publicCode = membership ? 'FORBIDDEN' : 'ORG_ACCESS_MISSING'
    error.publicMessage = membership ? 'Brak uprawnien do zlecen.' : 'Brak dostepu do tej organizacji.'
    throw error
  }
  return role
}

async function readPortalScheduleOrders(client, orgId) {
  const result = await client.query(
    `select
        t.*,
        c.name as joined_client_name,
        c.nip as joined_client_nip,
        c.city as joined_client_city,
        c.postal_code as joined_client_post_code,
        c.address as joined_client_street,
        w.full_name as joined_worker_name,
        w.login as joined_worker_login
       from public.task t
       left join public.client c
         on c.org_id = t.org_id and c.client_id = t.client_id
       left join lateral (
         select worker_id, full_name, login
           from public.worker
          where org_id = t.org_id
            and t.worker_id is not null
            and (
              lower(coalesce(worker_id, '')) = lower(t.worker_id)
              or lower(coalesce(login, '')) = lower(t.worker_id)
            )
          order by login asc
          limit 1
       ) w on true
      where t.org_id = $1
      order by t.date_ymd asc nulls last, t.start_time asc nulls last, t.id_task asc`,
    [orgId],
  )
  return sortPortalScheduleOrders(result.rows.map((row) => portalScheduleOrderFromDbRow(row)).filter(Boolean))
}

async function upsertPortalScheduleOrderTask(client, dbRow) {
  const columns = PORTAL_SCHEDULE_ORDER_COLUMNS
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ')
  const assignments = columns
    .filter((column) => !['org_id', 'id_task', 'created_at', 'created_by_uid'].includes(column))
    .map((column) => `${column} = excluded.${column}`)
    .join(', ')
  const values = columns.map((column) => dbRow[column] ?? null)
  await client.query(
    `insert into public.task (${columns.join(', ')})
     values (${placeholders})
     on conflict (org_id, id_task)
     do update set ${assignments}`,
    values,
  )
}

function shouldUseLocalPortalScheduleOrderFileStorage() {
  return NODE_ENV !== 'production' && !hasDatabaseConnectionConfig()
}

function portalScheduleOrderFilePath(orgId) {
  const safeOrgId = normalizeOrgId(orgId).replace(/[^a-z0-9_-]/gi, '_') || 'default'
  return path.join(LOCAL_PORTAL_DATA_DIR, 'portal-schedule-orders', `${safeOrgId}.json`)
}

async function readPortalScheduleOrdersFile(orgId) {
  try {
    const raw = await fs.promises.readFile(portalScheduleOrderFilePath(orgId), 'utf8')
    const parsed = JSON.parse(raw)
    const orders = Array.isArray(parsed?.orders) ? parsed.orders : []
    return sortPortalScheduleOrders(orders.filter((order) => order && typeof order === 'object'))
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn('[portal/schedule-orders] local read failed', error?.message || error)
    }
    return []
  }
}

async function writePortalScheduleOrdersFile(orgId, orders) {
  const filePath = portalScheduleOrderFilePath(orgId)
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
  await fs.promises.writeFile(
    filePath,
    JSON.stringify({ orgId, updatedAt: new Date().toISOString(), orders: sortPortalScheduleOrders(orders) }, null, 2),
    'utf8',
  )
}

async function handlePortalScheduleOrdersFileRequest(method, orgId, body, requesterUid, res) {
  const existingOrders = await readPortalScheduleOrdersFile(orgId)
  if (method === 'GET') {
    sendJson(res, 200, { ok: true, data: { orders: existingOrders, storage: 'local-file' } })
    return
  }
  if (method === 'DELETE') {
    const orderIds = (Array.isArray(body?.orderIds) ? body.orderIds : []).map((value) => sanitizePortalScheduleOrderId(value)).filter(Boolean)
    const deleted = new Set(orderIds)
    const nextOrders = existingOrders.filter((order) => !deleted.has(sanitizePortalScheduleOrderId(order?.id ?? order?.idTask)))
    await writePortalScheduleOrdersFile(orgId, nextOrders)
    sendJson(res, 200, { ok: true, data: { deletedOrderIds: orderIds } })
    return
  }
  const rawOrders = Array.isArray(body?.orders) ? body.orders : []
  const savedOrders = sortPortalScheduleOrders(
    rawOrders
      .map((order) => {
        const row = portalScheduleOrderDbRow(order, orgId, requesterUid)
        return row ? portalScheduleOrderFromDbRow(row) : null
      })
      .filter(Boolean)
      .slice(0, 2000),
  )
  await writePortalScheduleOrdersFile(orgId, savedOrders)
  sendJson(res, 200, { ok: true, data: { orders: savedOrders, storage: 'local-file' } })
}

async function handlePortalScheduleOrdersRequest(req, res, requestUrl) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const method = String(req.method || 'GET').toUpperCase()
  if (!['GET', 'POST', 'DELETE'].includes(method)) {
    sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Dozwolone metody to GET, POST i DELETE.')
    return
  }

  let body = {}
  if (method !== 'GET') {
    try {
      body = await readJsonBody(req)
    } catch (error) {
      if (error?.message === 'REQUEST_BODY_TOO_LARGE') {
        sendApiError(res, 413, 'REQUEST_TOO_LARGE', 'Zadanie jest zbyt duze.')
        return
      }
      sendApiError(res, 400, 'INVALID_JSON', 'Niepoprawny JSON w zadaniu.')
      return
    }
  }

  const orgId = normalizeOrgId(method === 'GET' ? requestUrl.searchParams.get('orgId') : body?.orgId)
  if (!orgId) {
    sendApiError(res, 400, 'INVALID_ORG_ID', 'Brak poprawnego orgId.')
    return
  }

  const token = parseBearerToken(req)
  if (!token) {
    sendApiError(res, 401, 'UNAUTHENTICATED', 'Brak tokenu Firebase.')
    return
  }

  let decodedToken
  try {
    decodedToken = await verifyFirebaseIdToken(token)
  } catch (error) {
    const mapped = mapFirebaseAdminError(error)
    sendApiError(res, mapped.status, mapped.code, mapped.message)
    return
  }

  const requesterUid = normalizeText(decodedToken?.uid)
  let client = null
  try {
    if (shouldUseLocalPortalScheduleOrderFileStorage()) {
      await handlePortalScheduleOrdersFileRequest(method, orgId, body, requesterUid, res)
      return
    }

    client = await connectDbClient()
    await ensurePortalScheduleOrderTable(client)
    await requirePortalScheduleOrderAccess(client, orgId, requesterUid, { write: method !== 'GET' })

    if (method === 'GET') {
      const orders = await readPortalScheduleOrders(client, orgId)
      sendJson(res, 200, { ok: true, data: { orders } })
      return
    }

    if (method === 'DELETE') {
      const orderIds = (Array.isArray(body?.orderIds) ? body.orderIds : []).map((value) => sanitizePortalScheduleOrderId(value)).filter(Boolean)
      if (!orderIds.length) {
        sendJson(res, 200, { ok: true, data: { deletedOrderIds: [] } })
        return
      }
      await client.query('delete from public.task where org_id = $1 and id_task = any($2::varchar[])', [orgId, orderIds])
      sendJson(res, 200, { ok: true, data: { deletedOrderIds: orderIds } })
      return
    }

    const rawOrders = Array.isArray(body?.orders) ? body.orders : []
    const rows = rawOrders.map((order) => portalScheduleOrderDbRow(order, orgId, requesterUid)).filter(Boolean).slice(0, 2000)
    await client.query('begin')
    for (const row of rows) {
      await upsertPortalScheduleOrderTask(client, row)
    }
    const rowIds = rows.map((row) => sanitizePortalScheduleOrderId(row?.id_task)).filter(Boolean)
    if (rowIds.length) {
      await client.query('delete from public.task where org_id = $1 and id_task <> all($2::varchar[])', [orgId, rowIds])
    } else {
      await client.query('delete from public.task where org_id = $1', [orgId])
    }
    await client.query('commit')
    const savedOrders = await readPortalScheduleOrders(client, orgId)
    sendJson(res, 200, { ok: true, data: { orders: savedOrders } })
  } catch (error) {
    logPortalStorageError('portal/schedule-orders', error)
    try {
      if (client) await client.query('rollback')
    } catch {
      // ignore rollback failure
    }
    const mappedDb = mapDatabaseConnectionError(error)
    if (mappedDb) {
      sendApiError(res, mappedDb.status, mappedDb.code, mappedDb.message)
      return
    }
    sendApiError(
      res,
      error?.statusCode || 500,
      normalizeText(error?.publicCode) || 'PORTAL_SCHEDULE_ORDERS_ERROR',
      normalizeText(error?.publicMessage) || error?.message || 'Nie udalo sie obsluzyc zlecen.',
    )
  } finally {
    if (client) client.release()
  }
}

function shouldUseLocalPortalTaskFileStorage() {
  return NODE_ENV !== 'production' && !hasDatabaseConnectionConfig()
}

function portalTaskFilePath(orgId) {
  const safeOrgId = normalizeOrgId(orgId).replace(/[^a-z0-9_-]/gi, '_') || 'default'
  return path.join(LOCAL_PORTAL_DATA_DIR, 'portal-tasks', `${safeOrgId}.json`)
}

function sortPortalTasks(tasks = []) {
  return [...tasks].sort((left, right) => {
    const leftDate = normalizeText(left?.dateYmd || left?.date || left?.dayKey)
    const rightDate = normalizeText(right?.dateYmd || right?.date || right?.dayKey)
    if (leftDate !== rightDate) {
      return leftDate.localeCompare(rightDate)
    }
    const leftTime = normalizeText(left?.startTime || left?.time)
    const rightTime = normalizeText(right?.startTime || right?.time)
    if (leftTime !== rightTime) {
      return leftTime.localeCompare(rightTime)
    }
    return normalizeText(left?.id).localeCompare(normalizeText(right?.id))
  })
}

async function readPortalTasksFile(orgId) {
  try {
    const raw = await fs.promises.readFile(portalTaskFilePath(orgId), 'utf8')
    const parsed = JSON.parse(raw)
    const tasks = Array.isArray(parsed?.tasks) ? parsed.tasks : []
    return sortPortalTasks(tasks.filter((task) => task && typeof task === 'object'))
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return []
    }
    throw error
  }
}

async function writePortalTasksFile(orgId, tasks) {
  const filePath = portalTaskFilePath(orgId)
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
  await fs.promises.writeFile(
    filePath,
    JSON.stringify(
      {
        orgId,
        updatedAt: new Date().toISOString(),
        tasks: sortPortalTasks(tasks),
      },
      null,
      2,
    ),
    'utf8',
  )
}

async function handlePortalTasksFileRequest(method, orgId, body, requesterUid, res) {
  const existingTasks = await readPortalTasksFile(orgId)

  if (method === 'GET') {
    sendJson(res, 200, { ok: true, data: { tasks: existingTasks, storage: 'local-file' } })
    return
  }

  if (method === 'DELETE') {
    const taskIds = (Array.isArray(body?.taskIds) ? body.taskIds : [])
      .map((value) => sanitizePortalTaskId(value))
      .filter(Boolean)
    if (!taskIds.length) {
      sendJson(res, 200, { ok: true, data: { deletedTaskIds: [] } })
      return
    }

    const deleted = new Set(taskIds)
    const nextTasks = existingTasks.filter((task) => !deleted.has(sanitizePortalTaskId(task?.id)))
    await writePortalTasksFile(orgId, nextTasks)
    sendJson(res, 200, { ok: true, data: { deletedTaskIds: taskIds } })
    return
  }

  const nowIso = new Date().toISOString()
  const nextById = new Map(existingTasks.map((task) => [sanitizePortalTaskId(task?.id), task]).filter(([id]) => id))
  const rawTasks = Array.isArray(body?.tasks) ? body.tasks : []
  const tasks = rawTasks.map((task) => sanitizePortalTaskPayload(task)).filter(Boolean).slice(0, 2000)
  tasks.forEach((task) => {
    const previous = nextById.get(task.id)
    nextById.set(task.id, {
      ...previous,
      ...task,
      updatedBy: requesterUid || previous?.updatedBy || '',
      updatedAt: nowIso,
      createdAt: normalizeText(previous?.createdAt) || normalizeText(task.createdAt) || nowIso,
    })
  })

  const savedTasks = sortPortalTasks([...nextById.values()])
  await writePortalTasksFile(orgId, savedTasks)
  sendJson(res, 200, { ok: true, data: { tasks: savedTasks, storage: 'local-file' } })
}

async function handlePortalTasksRequest(req, res, requestUrl) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const method = String(req.method || 'GET').toUpperCase()
  if (!['GET', 'POST', 'DELETE'].includes(method)) {
    sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Dozwolone metody to GET, POST i DELETE.')
    return
  }

  let body = {}
  if (method !== 'GET') {
    try {
      body = await readJsonBody(req)
    } catch (error) {
      if (error?.message === 'REQUEST_BODY_TOO_LARGE') {
        sendApiError(res, 413, 'REQUEST_TOO_LARGE', 'Ĺ»Ä…danie jest zbyt duĹĽe.')
        return
      }
      sendApiError(res, 400, 'INVALID_JSON', 'Niepoprawny JSON w ĹĽÄ…daniu.')
      return
    }
  }

  const orgId = normalizeOrgId(method === 'GET' ? requestUrl.searchParams.get('orgId') : body?.orgId)
  if (!orgId) {
    sendApiError(res, 400, 'INVALID_ORG_ID', 'Brak poprawnego orgId.')
    return
  }

  const token = parseBearerToken(req)
  if (!token) {
    sendApiError(res, 401, 'UNAUTHENTICATED', 'Brak tokenu Firebase.')
    return
  }

  let decodedToken
  try {
    decodedToken = await verifyFirebaseIdToken(token)
  } catch (error) {
    const mapped = mapFirebaseAdminError(error)
    sendApiError(res, mapped.status, mapped.code, mapped.message)
    return
  }

  const requesterUid = normalizeText(decodedToken?.uid)
  let client = null

  try {
    if (shouldUseLocalPortalTaskFileStorage()) {
      await handlePortalTasksFileRequest(method, orgId, body, requesterUid, res)
      return
    }

    client = await connectDbClient()

    await ensurePortalTaskTable(client)
    await requirePortalTaskAccess(client, orgId, requesterUid)

    if (method === 'GET') {
      const tasks = await readPortalTasks(client, orgId)
      sendJson(res, 200, { ok: true, data: { tasks } })
      return
    }

    if (method === 'DELETE') {
      const taskIds = (Array.isArray(body?.taskIds) ? body.taskIds : [])
        .map((value) => sanitizePortalTaskId(value))
        .filter(Boolean)
      if (!taskIds.length) {
        sendJson(res, 200, { ok: true, data: { deletedTaskIds: [] } })
        return
      }

      await client.query('delete from public.portal_task where org_id = $1 and task_id = any($2::varchar[])', [orgId, taskIds])
      sendJson(res, 200, { ok: true, data: { deletedTaskIds: taskIds } })
      return
    }

    const rawTasks = Array.isArray(body?.tasks) ? body.tasks : []
    const tasks = rawTasks.map((task) => sanitizePortalTaskPayload(task)).filter(Boolean).slice(0, 2000)

    await client.query('begin')
    for (const task of tasks) {
      await client.query(
        `insert into public.portal_task (org_id, task_id, source_comment_key, payload, updated_by, created_at, updated_at)
         values ($1, $2, $3, $4::jsonb, $5, now(), now())
         on conflict (org_id, task_id)
         do update set
           source_comment_key = excluded.source_comment_key,
           payload = excluded.payload,
           updated_by = excluded.updated_by,
           updated_at = now()`,
        [orgId, task.id, task.sourceCommentKey || null, JSON.stringify(task), requesterUid],
      )
    }
    await client.query('commit')

    const savedTasks = await readPortalTasks(client, orgId)
    sendJson(res, 200, { ok: true, data: { tasks: savedTasks } })
  } catch (error) {
    logPortalStorageError('portal/tasks', error)
    try {
      if (client) await client.query('rollback')
    } catch {
      // ignore rollback failure
    }

    const mappedDb = mapDatabaseConnectionError(error)
    if (mappedDb) {
      sendApiError(res, mappedDb.status, mappedDb.code, mappedDb.message)
      return
    }

    sendApiError(
      res,
      error?.statusCode || 500,
      normalizeText(error?.publicCode) || 'PORTAL_TASKS_ERROR',
      normalizeText(error?.publicMessage) || error?.message || 'Nie udaĹ‚o siÄ™ obsĹ‚uĹĽyÄ‡ zadaĹ„ portalu.',
    )
  } finally {
    if (client) client.release()
  }
}

function isApiMethodWithBody(method) {
  const upper = String(method || '').toUpperCase()
  return upper !== 'GET' && upper !== 'HEAD'
}

async function proxyApiRequest(req, res, requestUrl) {
  const targetUrl = new URL(`${requestUrl.pathname}${requestUrl.search || ''}`, `${API_PROXY_TARGET}/`)
  const method = String(req.method || 'GET').toUpperCase()
  const requestBody = isApiMethodWithBody(method) ? await readRequestBody(req, MAX_PROXY_BODY_BYTES) : Buffer.alloc(0)

  const headers = {
    'x-forwarded-host': API_PROXY_FORWARDED_HOST,
    'x-forwarded-proto': 'https',
  }
  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type']
  if (req.headers.authorization) headers.authorization = req.headers.authorization
  if (req.headers.accept) headers.accept = req.headers.accept
  if (req.headers['x-firebase-appcheck']) headers['x-firebase-appcheck'] = req.headers['x-firebase-appcheck']

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), API_PROXY_TIMEOUT_MS)

  let upstream
  try {
    upstream = await fetch(targetUrl.toString(), {
      method,
      headers,
      body: requestBody.length ? requestBody : undefined,
      redirect: 'manual',
      signal: controller.signal,
    })
  } catch (error) {
    clearTimeout(timeout)
    sendJson(res, 502, {
      ok: false,
      error: {
        code: 'UPSTREAM_UNAVAILABLE',
        message: error?.name === 'AbortError' ? 'Upstream timeout.' : 'Upstream request failed.',
      },
    })
    return
  }
  clearTimeout(timeout)

  const raw = Buffer.from(await upstream.arrayBuffer())
  const responseHeaders = withSecurityHeaders({
    'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })

  res.writeHead(upstream.status, responseHeaders)
  res.end(raw)
}

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    sendJson(res, 200, { ok: true })
    return
  }

  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  if (requestUrl.pathname === PORTAL_SCHEDULE_ORDERS_PATH) {
    if (shouldProxyPortalScheduleOrdersRequest()) {
      proxyApiRequest(req, res, requestUrl).catch((error) => {
        sendJson(res, 500, {
          ok: false,
          error: {
            code: 'PORTAL_SCHEDULE_ORDERS_PROXY_ERROR',
            message: error?.message || 'Unexpected portal schedule orders proxy error.',
          },
        })
      })
      return
    }

    handlePortalScheduleOrdersRequest(req, res, requestUrl).catch((error) => {
      sendApiError(res, 500, 'PORTAL_SCHEDULE_ORDERS_ERROR', error?.message || 'Unexpected portal schedule orders error.')
    })
    return
  }

  if (requestUrl.pathname === PORTAL_TASKS_PATH) {
    if (shouldProxyPortalTasksRequest()) {
      proxyApiRequest(req, res, requestUrl).catch((error) => {
        sendJson(res, 500, {
          ok: false,
          error: {
            code: 'PORTAL_TASKS_PROXY_ERROR',
            message: error?.message || 'Unexpected portal tasks proxy error.',
          },
        })
      })
      return
    }

    handlePortalTasksRequest(req, res, requestUrl).catch((error) => {
      sendApiError(res, 500, 'PORTAL_TASKS_ERROR', error?.message || 'Unexpected portal tasks error.')
    })
    return
  }

  if (requestUrl.pathname === AUTH_PROVISION_WORKER_PATH || requestUrl.pathname === '/authProvisionWorker') {
    handleAuthProvisionWorkerRequest(req, res).catch((error) => {
      sendApiError(res, 500, 'AUTH_PROVISION_WORKER_ERROR', error?.message || 'Unexpected auth provision worker error.')
    })
    return
  }

  if (requestUrl.pathname === AUTH_ROLLBACK_WORKER_PATH || requestUrl.pathname === '/authRollbackWorker') {
    handleAuthRollbackWorkerRequest(req, res).catch((error) => {
      sendApiError(res, 500, 'AUTH_ROLLBACK_WORKER_ERROR', error?.message || 'Unexpected auth rollback worker error.')
    })
    return
  }

  if (requestUrl.pathname === ADMIN_WORKER_PASSWORD_REVEAL_PATH || requestUrl.pathname === '/adminWorkerPasswordReveal') {
    handleAdminWorkerPasswordRevealRequest(req, res).catch((error) => {
      sendApiError(res, 500, 'WORKER_PASSWORD_REVEAL_ERROR', error?.message || 'Unexpected worker password reveal error.')
    })
    return
  }

  if (requestUrl.pathname === ADMIN_WORKER_PASSWORD_SET_PATH || requestUrl.pathname === '/adminWorkerPasswordSet') {
    handleAdminWorkerPasswordSetRequest(req, res).catch((error) => {
      sendApiError(res, 500, 'WORKER_PASSWORD_SET_ERROR', error?.message || 'Unexpected worker password set error.')
    })
    return
  }

  if (requestUrl.pathname === AUTH_SESSION_CONTEXT_PATH) {
    handleAuthSessionContextRequest(req, res, requestUrl).catch((error) => {
      sendApiError(res, 500, 'AUTH_CONTEXT_ERROR', error?.message || 'Unexpected auth context error.')
    })
    return
  }

  if (requestUrl.pathname === ADMIN_USERS_PATH) {
    if (shouldProxyAdminUsersRequest()) {
      proxyApiRequest(req, res, requestUrl).catch((error) => {
        sendJson(res, 500, {
          ok: false,
          error: {
            code: 'ADMIN_USERS_PROXY_ERROR',
            message: error?.message || 'Unexpected admin users proxy error.',
          },
        })
      })
      return
    }

    handleAdminUsersRequest(req, res).catch((error) => {
      sendApiError(res, 500, 'ADMIN_USERS_ERROR', error?.message || 'Unexpected admin users error.')
    })
    return
  }

  if (requestUrl.pathname.startsWith('/api/')) {
    proxyApiRequest(req, res, requestUrl).catch((error) => {
      sendJson(res, 500, {
        ok: false,
        error: {
          code: 'API_PROXY_ERROR',
          message: error?.message || 'Unexpected API proxy error.',
        },
      })
    })
    return
  }

  if (!fs.existsSync(DIST_DIR)) {
    sendJson(res, 500, {
      error: 'web-app/dist not found',
      message: 'Run npm run build before starting the server.',
    })
    return
  }

  const requestTarget = detectRequestTarget(requestUrl, req.headers.host)
  const spaEntryFile = resolveSpaEntryFile(requestTarget)
  const spaEntryRelative = path.relative(DIST_DIR, spaEntryFile).split(path.sep).join('/')
  const wantedFile = safeResolveStaticPath(requestUrl.pathname, spaEntryRelative)
  const wantsHtml = !path.extname(wantedFile)

  if (wantsHtml) {
    sendFile(res, spaEntryFile)
    return
  }

  fs.stat(wantedFile, (err, stats) => {
    if (!err && stats.isFile()) {
      sendFile(res, wantedFile)
      return
    }
    sendFile(res, spaEntryFile)
  })
})

server.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`)
})
