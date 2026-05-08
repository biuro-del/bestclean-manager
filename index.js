const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
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
const APP_TARGET = String(process.env.APP_TARGET || '').trim().toLowerCase()
const API_PROXY_TARGET = String(process.env.API_PROXY_TARGET || 'https://europe-central2-iclean-room.cloudfunctions.net').trim().replace(/\/+$/, '')
const API_PROXY_FORWARDED_HOST = String(process.env.API_PROXY_FORWARDED_HOST || 'iclean-room.web.app').trim()
const API_PROXY_TIMEOUT_MS = Number(process.env.API_PROXY_TIMEOUT_MS || 15000)
const ADMIN_USERS_PATH = '/api/admin/users'
const AUTH_SESSION_CONTEXT_PATH = '/api/auth/session-context'
const PORTAL_TASKS_PATH = '/api/portal/tasks'
const PORTAL_SCHEDULE_ORDERS_PATH = '/api/portal/schedule-orders'
const MAX_JSON_BODY_BYTES = 1024 * 1024
const MAX_PROXY_BODY_BYTES = Number(process.env.MAX_PROXY_BODY_BYTES || MAX_JSON_BODY_BYTES)
const FIREBASE_PROJECT_ID = String(
  process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    '',
).trim()
const FIREBASE_WEB_API_KEY = String(process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY || '').trim()
const CLOUD_SQL_CONNECTION_NAME = String(
  process.env.CLOUD_SQL_CONNECTION_NAME ||
    process.env.INSTANCE_CONNECTION_NAME ||
    (FIREBASE_PROJECT_ID === 'iclean-room' ? 'iclean-room:europe-west3:iclean-room-instance' : ''),
).trim()
const CLOUD_SQL_ADMIN_SCOPE = 'https://www.googleapis.com/auth/sqlservice.admin'

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

function logAdminUsersError(error, context = '') {
  const code = normalizeText(error?.publicCode || error?.code || error?.message || 'UNKNOWN')
  const message = normalizeText(error?.publicMessage || error?.message || 'Unknown admin users error')
  console.error(`[admin/users]${context ? ` ${context}` : ''} ${code}: ${message}`)
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
      message: `Backend nie może połączyć się z bazą PostgreSQL na ${host}:${port}. Uruchom lokalną bazę albo Cloud SQL Proxy.`,
    }
  }

  if (code === 'ETIMEDOUT' || code === 'ENOTFOUND' || code === 'EHOSTUNREACH') {
    return {
      status: 503,
      code: 'DB_CONNECTION_FAILED',
      message: `Backend nie może połączyć się z bazą PostgreSQL (${host}:${port}). Sprawdź host bazy lub tunel Cloud SQL Proxy.`,
    }
  }

  if (code === '28P01') {
    return {
      status: 500,
      code: 'DB_AUTH_FAILED',
      message: 'Baza danych odrzuciła login lub hasło backendu.',
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

function emailLocalPart(email) {
  return normalizeLower(email).split('@')[0] || ''
}

function normalizeUserRole(value) {
  const role = normalizeText(value).toUpperCase()
  if (role === 'MANAGER' || role === 'KIEROWNIK') return 'MANAGER'
  if (role === 'WORKER' || role === 'PRACOWNIK') return 'WORKER'
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
    code.includes('credential') ||
    code.includes('insufficient-permission') ||
    message.includes('could not load the default credentials') ||
    message.includes('application default credentials') ||
    message.includes('insufficient permission')
  )
}

function mapFirebaseAdminError(error) {
  const code = normalizeText(error?.code).toLowerCase()
  const restMessage = normalizeText(error?.firebaseRestMessage || error?.message).toUpperCase()
  if (isFirebaseDuplicateEmail(error)) {
    return {
      status: 409,
      code: 'EMAIL_ALREADY_EXISTS',
      message: 'Ten email ma już konto Firebase Auth.',
    }
  }

  if (code.includes('invalid-password') || restMessage.includes('WEAK_PASSWORD')) {
    return {
      status: 400,
      code: 'WEAK_PASSWORD',
      message: 'Hasło jest zbyt słabe. Użyj co najmniej 6 znaków.',
    }
  }

  if (code.includes('invalid-email') || restMessage.includes('INVALID_EMAIL')) {
    return {
      status: 400,
      code: 'INVALID_EMAIL',
      message: 'Niepoprawny adres email.',
    }
  }

  if (restMessage.includes('INVALID_ID_TOKEN') || restMessage.includes('USER_NOT_FOUND')) {
    return {
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'Token Firebase jest niepoprawny albo wygasł.',
    }
  }

  if (isFirebaseCredentialError(error)) {
    return {
      status: 500,
      code: 'FIREBASE_ADMIN_CREDENTIALS_MISSING',
      message: 'Backend nie ma lokalnych poświadczeń Firebase Admin.',
    }
  }

  return {
    status: 500,
    code: 'FIREBASE_AUTH_ERROR',
    message: 'Nie udało się utworzyć konta Firebase Auth.',
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
    error.publicMessage = 'Ten email ma już konto Firebase Auth.'
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
    if (!isFirebaseCredentialError(adminError) || !canUseFirebaseRest()) {
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
      error.publicMessage = 'Tworzenie nieaktywnego konta wymaga poświadczeń Firebase Admin.'
      throw error
    }

    try {
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
    const raw = normalizeText(row?.worker_id).toUpperCase()
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

function buildUserPayload(body) {
  const orgId = normalizeOrgId(body?.orgId)
  const email = normalizeEmail(body?.email)
  const displayName = normalizeText(body?.displayName || body?.workerName || body?.name)
  const login = normalizeLogin(body?.login || emailLocalPart(email))
  const role = normalizeUserRole(body?.role)
  const password = normalizeText(body?.password)
  const phone = normalizeText(body?.phone)
  const active = body?.active === undefined ? true : Boolean(body.active)
  const emailLogin = emailLocalPart(email)

  const validationErrors = []
  if (!orgId) validationErrors.push('Brak poprawnego orgId.')
  if (!email) validationErrors.push('Podaj poprawny email.')
  if (!displayName) validationErrors.push('Podaj imię i nazwisko.')
  if (!login) validationErrors.push('Podaj poprawny login.')
  if (login && emailLogin && login !== emailLogin) {
    validationErrors.push('Login musi być taki sam jak część emaila przed @, aby mobile działał bez aliasów.')
  }
  if (!role) validationErrors.push('Rola musi być MANAGER albo WORKER.')
  if (password.length < 6) validationErrors.push('Hasło tymczasowe musi mieć co najmniej 6 znaków.')

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
        ? 'Brak uprawnień do dodawania użytkowników.'
        : 'Brak dostępu do tej organizacji.'
      throw error
    }

    const existingWorker = await findExistingWorker(client, payload.orgId, payload.login, payload.email)
    if (existingWorker) {
      const error = new Error('WORKER_ALREADY_EXISTS')
      error.statusCode = 409
      error.publicCode = 'WORKER_ALREADY_EXISTS'
      error.publicMessage =
        normalizeLower(existingWorker.login) === payload.login
          ? 'Ten login jest już zajęty.'
          : 'Ten email jest już przypisany do pracownika.'
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
      error.publicMessage = 'Brak uprawnień do dodawania użytkowników.'
      throw error
    }

    const duplicateWorker = await findExistingWorker(client, payload.orgId, payload.login, payload.email)
    if (duplicateWorker) {
      const error = new Error('WORKER_ALREADY_EXISTS')
      error.statusCode = 409
      error.publicCode = 'WORKER_ALREADY_EXISTS'
      error.publicMessage =
        normalizeLower(duplicateWorker.login) === payload.login
          ? 'Ten login jest już zajęty.'
          : 'Ten email jest już przypisany do pracownika.'
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
      sendApiError(res, 413, 'REQUEST_TOO_LARGE', 'Żądanie jest zbyt duże.')
      return
    }
    sendApiError(res, 400, 'INVALID_JSON', 'Niepoprawny JSON w żądaniu.')
    return
  }

  const token = parseBearerToken(req)
  if (!token) {
    sendApiError(res, 401, 'UNAUTHENTICATED', 'Brak tokenu Firebase.')
    return
  }

  const { value: payload, validationErrors } = buildUserPayload(body)
  if (validationErrors.length) {
    sendApiError(res, 400, 'VALIDATION_ERROR', validationErrors[0], validationErrors)
    return
  }

  let decodedToken
  try {
    decodedToken = await verifyFirebaseIdToken(token)
  } catch (error) {
    logAdminUsersError(error, 'verify-token')
    const mapped = mapFirebaseAdminError(error)
    sendApiError(res, mapped.status === 500 ? 500 : 401, mapped.code === 'FIREBASE_AUTH_ERROR' ? 'UNAUTHENTICATED' : mapped.code, mapped.status === 500 ? mapped.message : 'Token Firebase jest niepoprawny albo wygasł.')
    return
  }

  try {
    const user = await createAdminManagedUser(payload, decodedToken.uid)
    sendJson(res, 201, { ok: true, data: { user } })
  } catch (error) {
    logAdminUsersError(error, 'create-user')
    if (error?.message === 'DB_CONFIG_MISSING') {
      sendApiError(res, 500, 'DB_CONFIG_MISSING', 'Brak konfiguracji połączenia z bazą danych.')
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
      normalizeText(error?.publicMessage) || 'Nie udało się dodać użytkownika.',
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
        sendApiError(res, 413, 'REQUEST_TOO_LARGE', 'Żądanie jest zbyt duże.')
        return
      }
      sendApiError(res, 400, 'INVALID_JSON', 'Niepoprawny JSON w żądaniu.')
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

    sendApiError(res, 500, 'AUTH_CONTEXT_ERROR', error?.message || 'Nie udało się pobrać organizacji użytkownika.')
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
      ? 'Brak uprawnień do zadań portalu.'
      : 'Brak dostępu do tej organizacji.'
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
        sendApiError(res, 413, 'REQUEST_TOO_LARGE', 'Żądanie jest zbyt duże.')
        return
      }
      sendApiError(res, 400, 'INVALID_JSON', 'Niepoprawny JSON w żądaniu.')
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
      normalizeText(error?.publicMessage) || error?.message || 'Nie udało się obsłużyć zadań portalu.',
    )
  } finally {
    if (client) client.release()
  }
}

async function ensurePortalScheduleOrderTable(client) {
  if (await databaseRelationExists(client, 'public.portal_schedule_order')) {
    return
  }

  await client.query(`
    create table if not exists public.portal_schedule_order (
      org_id varchar(64) not null,
      order_id varchar(180) not null,
      payload jsonb not null default '{}'::jsonb,
      updated_by varchar(128),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (org_id, order_id)
    )
  `)
  await client.query(
    'create index if not exists portal_schedule_order_org_date_idx on public.portal_schedule_order (org_id, ((payload->>\'dateYmd\')), ((payload->>\'startTime\')), order_id)',
  )
  await client.query('create index if not exists portal_schedule_order_org_updated_idx on public.portal_schedule_order (org_id, updated_at desc)')
}

function sanitizePortalScheduleOrderId(value) {
  const id = normalizeText(value)
  return id ? id.slice(0, 180) : ''
}

function sanitizePortalScheduleOrderPayload(rawOrder) {
  if (!rawOrder || typeof rawOrder !== 'object' || Array.isArray(rawOrder)) {
    return null
  }

  const id = sanitizePortalScheduleOrderId(rawOrder.id)
  if (!id || rawOrder.isDraft) {
    return null
  }

  const nowIso = new Date().toISOString()
  return {
    ...rawOrder,
    id,
    isDraft: false,
    recordKind: 'portal-schedule-order',
    updatedAt: normalizeText(rawOrder.updatedAt) || nowIso,
    createdAt: normalizeText(rawOrder.createdAt) || nowIso,
  }
}

async function readPortalScheduleOrders(client, orgId) {
  const result = await client.query(
    `select payload
       from public.portal_schedule_order
      where org_id = $1
      order by
        coalesce(payload->>'dateYmd', '') asc,
        coalesce(payload->>'startTime', payload->>'time', '') asc,
        order_id asc`,
    [orgId],
  )
  return result.rows.map((row) => row.payload).filter((order) => order && typeof order === 'object')
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
        sendApiError(res, 413, 'REQUEST_TOO_LARGE', 'Zadanie jest zbyt duże.')
        return
      }
      sendApiError(res, 400, 'INVALID_JSON', 'Niepoprawny JSON w żądaniu.')
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
    client = await connectDbClient()

    await ensurePortalScheduleOrderTable(client)
    await requirePortalTaskAccess(client, orgId, requesterUid)

    if (method === 'GET') {
      const orders = await readPortalScheduleOrders(client, orgId)
      sendJson(res, 200, { ok: true, data: { orders } })
      return
    }

    if (method === 'DELETE') {
      const orderIds = (Array.isArray(body?.orderIds) ? body.orderIds : [])
        .map((value) => sanitizePortalScheduleOrderId(value))
        .filter(Boolean)
      if (!orderIds.length) {
        sendJson(res, 200, { ok: true, data: { deletedOrderIds: [] } })
        return
      }

      await client.query('delete from public.portal_schedule_order where org_id = $1 and order_id = any($2::varchar[])', [
        orgId,
        orderIds,
      ])
      sendJson(res, 200, { ok: true, data: { deletedOrderIds: orderIds } })
      return
    }

    const rawOrders = Array.isArray(body?.orders) ? body.orders : []
    const orders = rawOrders.map((order) => sanitizePortalScheduleOrderPayload(order)).filter(Boolean).slice(0, 5000)

    await client.query('begin')
    for (const order of orders) {
      await client.query(
        `insert into public.portal_schedule_order (org_id, order_id, payload, updated_by, created_at, updated_at)
         values ($1, $2, $3::jsonb, $4, now(), now())
         on conflict (org_id, order_id)
         do update set
           payload = excluded.payload,
           updated_by = excluded.updated_by,
           updated_at = now()`,
        [orgId, order.id, JSON.stringify(order), requesterUid],
      )
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
      normalizeText(error?.publicMessage) || error?.message || 'Nie udało się obsłużyć zleceń grafiku.',
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
  if (requestUrl.pathname === PORTAL_TASKS_PATH) {
    handlePortalTasksRequest(req, res, requestUrl).catch((error) => {
      sendApiError(res, 500, 'PORTAL_TASKS_ERROR', error?.message || 'Unexpected portal tasks error.')
    })
    return
  }

  if (requestUrl.pathname === PORTAL_SCHEDULE_ORDERS_PATH) {
    handlePortalScheduleOrdersRequest(req, res, requestUrl).catch((error) => {
      sendApiError(res, 500, 'PORTAL_SCHEDULE_ORDERS_ERROR', error?.message || 'Unexpected portal schedule orders error.')
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
