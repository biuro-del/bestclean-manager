const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const dotenv = require('dotenv')
const admin = require('firebase-admin')
const { getDataConnect: getAdminDataConnect } = require('firebase-admin/data-connect')
const { Pool } = require('pg')
const { AuthTypes, Connector, IpAddressTypes } = require('@google-cloud/cloud-sql-connector')
const { Compute, GoogleAuth, OAuth2Client } = require('google-auth-library')
const {
  buildOrganizationSummary,
  buildSessionContext,
  evaluateTenantEmailVerification,
  normalizeOrganizationId,
  resolveAccessibleOrganizations,
} = require('./auth-session-policy')
const {
  buildWorkerId,
  buildWorkerLogin,
  canAssignWorkerRole,
  isWorkerDeleteRole,
  isWorkerManagementRole,
  nextWorkerNumber,
  normalizeRoleCode,
  normalizeWorkerRole,
  normalizeWorkerNumber,
  parseWorkerNumber,
} = require('./worker-id-policy')
const workerRepository = require('./worker-repository')
const platformRepository = require('./platform-repository')
const { createPlatformApi } = require('./platform-api')
const {
  getPlatformRequestContext,
  runWithPlatformRequest,
  setRequestPathname,
  setVerifiedFirebaseToken,
} = require('./platform-request-context')
const {
  PLATFORM_ROLE,
  hasPlatformOwnerClaim,
  resolvePlatformDataConnectConnector,
} = require('./platform-policy')
const {
  buildFirebaseRestDecodedToken,
  normalizeFirebaseAccountCreatedAt,
} = require('./firebase-rest-token-policy')
const { createProfitabilityApi } = require('./profitability-api')
const { createWorkdayReconciliationApi } = require('./workday-reconciliation-api')
const { createWorkTimeDaysApi } = require('./work-time-days-api')
const { resolveProfitabilityAccess } = require('./profitability-entitlement-policy')
const { correlateCleanStartToPlan } = require('./service-execution-correlation')
const {
  createOrganizationWithTrial,
  readOrganizationProfile,
  updateOrganizationProfile,
} = require('./organization-onboarding')
const { lookupCompanyByNip } = require('./gus-company-registry')
const { processStripeEvent, verifyStripeSignature } = require('./stripe-webhook')
const {
  calculateMeteredOverage,
  evaluateSubscriptionAccess,
  hasPlanCapability,
  normalizePlanCode,
  resolvePlanEntitlements,
} = require('./plan-policy')
const {
  eventCorrelationSchema,
  insertMobileCleanEvent,
  readPublicEventColumns,
  readRawTaskPlansForOrganization,
  resolveMobileZoneQrRows,
  warsawOccurrenceDateYmd,
} = require('./service-execution-repository')
const {
  resolveAuthenticatedMobileWorker,
  resolveAuthoritativeMobileScanAt,
} = require('./mobile-workflow-security-policy')
const {
  assertNoUnresolvedOpenEvents,
  resolveOpenCycleState,
} = require('./mobile-open-cycle-policy')
const { resolveOpenWorkdayState } = require('./mobile-open-workday-policy')
const { mobileCorrelationRolloutDecision } = require('./mobile-correlation-rollout-policy')
const {
  assertNoWorkerScheduleLocationConflicts,
  isScheduleOrderActive,
  normalizeScheduleOrderLifecycleStatus,
} = require('./worker-schedule-conflict-policy')
const { JobCardRepository } = require('./job-card/repository')

function isTrue(value) {
  return ['1', 'true', 'yes', 'tak'].includes(
    String(value ?? '')
      .trim()
      .toLowerCase(),
  )
}

function normalizeApiProxyTarget(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function normalizeApiProxyForwardedHost(value) {
  return String(value || '').trim()
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
const API_PROXY_TARGET = normalizeApiProxyTarget(process.env.API_PROXY_TARGET)
const API_PROXY_FORWARDED_HOST = normalizeApiProxyForwardedHost(process.env.API_PROXY_FORWARDED_HOST)
const API_PROXY_TIMEOUT_MS = Number(process.env.API_PROXY_TIMEOUT_MS || 15000)
const ADMIN_USERS_PATH = '/api/admin/users'
const AUTH_PROVISION_WORKER_PATH = '/api/auth/provision-worker'
const AUTH_ROLLBACK_WORKER_PATH = '/api/auth/rollback-worker'
const ADMIN_WORKER_PASSWORD_REVEAL_PATH = '/api/admin/worker-password/reveal'
const ADMIN_WORKER_PASSWORD_SET_PATH = '/api/admin/worker-password/set'
const ADMIN_WORKER_PROFILE_UPDATE_PATH = '/api/admin/worker-profile/update'
const ADMIN_WORKER_PROFILE_DELETE_PATH = '/api/admin/worker-profile/delete'
const ADMIN_WORKER_ID_NEXT_PATH = '/api/admin/worker-id/next'
const ADMIN_WORKERS_PATH = '/api/admin/workers'
const ADMIN_WORKERS_RESTORE_PATH = '/api/admin/workers/restore'
const AUTH_SESSION_CONTEXT_PATH = '/api/auth/session-context'
const PORTAL_ORGANIZATIONS_PATH = '/api/portal/organizations'
const PORTAL_ORGANIZATION_PROFILE_PATH = '/api/portal/organization-profile'
const PORTAL_COMPANY_REGISTRY_PATH = '/api/portal/company-registry/lookup'
const STRIPE_WEBHOOK_PATH = '/api/billing/stripe/webhook'
const PORTAL_TASKS_PATH = '/api/portal/tasks'
const PORTAL_SCHEDULE_ORDERS_PATH = '/api/portal/schedule-orders'
const PORTAL_JOB_CARDS_PATH = '/api/portal/job-cards'
const PORTAL_EVENTS_PATH = '/api/portal/events'
const PORTAL_ZONE_QR_CODES_PATH = '/api/portal/zones/qr-codes'
const PORTAL_PROFITABILITY_PATH = '/api/portal/profitability'
const MOBILE_STATE_PATH = '/api/mobile/state'
const MOBILE_SCAN_PATH = '/api/mobile/scan'
const MOBILE_SCAN_STATUS_PATH = '/api/mobile/scan/status'
const MOBILE_JOB_CARDS_PATH = '/api/mobile/job-cards'
const DATACONNECT_LOCATION = String(process.env.FIREBASE_DATACONNECT_LOCATION || process.env.DATACONNECT_LOCATION || '').trim()
const DATACONNECT_SERVICE = String(process.env.FIREBASE_DATACONNECT_SERVICE || process.env.DATACONNECT_SERVICE || '').trim()
const DATACONNECT_CONNECTOR = String(process.env.FIREBASE_DATACONNECT_CONNECTOR || process.env.DATACONNECT_CONNECTOR || '').trim()
const MAX_JSON_BODY_BYTES = 1024 * 1024
const MAX_WORKER_PROFILE_PHOTO_BYTES = Number(process.env.MAX_WORKER_PROFILE_PHOTO_BYTES || 1024 * 1024)
const MAX_WORKER_PROFILE_PHOTO_BODY_BYTES = Math.max(
  MAX_JSON_BODY_BYTES,
  Math.ceil(MAX_WORKER_PROFILE_PHOTO_BYTES * 1.5) + 64 * 1024,
)
const MAX_PROXY_BODY_BYTES = Number(process.env.MAX_PROXY_BODY_BYTES || MAX_JSON_BODY_BYTES)
const FIREBASE_PROJECT_ID = String(
  process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    '',
).trim()
const FIREBASE_WEB_API_KEY = String(
  process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY || '',
).trim()
const FIREBASE_STORAGE_BUCKET = String(
  process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.VITE_FIREBASE_STORAGE_BUCKET ||
    '',
).trim()
const PLATFORM_FIREBASE_PROJECT_ID = String(process.env.PLATFORM_FIREBASE_PROJECT_ID || '').trim()
const PLATFORM_FIREBASE_WEB_API_KEY = String(process.env.PLATFORM_FIREBASE_WEB_API_KEY || '').trim()
const PLATFORM_FIREBASE_ADMIN_APP_NAME = 'cleanzi-platform-admin'
const CLOUD_SQL_CONNECTION_NAME = String(
  process.env.CLOUD_SQL_CONNECTION_NAME ||
    process.env.INSTANCE_CONNECTION_NAME ||
    '',
).trim()
const CLOUD_SQL_ADMIN_SCOPE = 'https://www.googleapis.com/auth/sqlservice.admin'
const ROLLBACK_TOKEN_MAX_AGE_MS = Number(process.env.ROLLBACK_TOKEN_MAX_AGE_MS || 15 * 60 * 1000)
let firebaseAdminInitialized = false
let platformFirebaseAdminInitialized = false
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
    "script-src 'self' 'unsafe-inline' https://maps.googleapis.com https://www.gstatic.com https://www.google.com https://www.recaptcha.net https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://*.googleusercontent.com https://cdn.jsdelivr.net https://*.tile.openstreetmap.org",
    "connect-src 'self' https://*.googleapis.com https://*.firebaseapp.com https://*.cloudfunctions.net https://*.firebasedataconnect.googleapis.com https://firebasestorage.googleapis.com wss://*.firebaseio.com",
    "frame-src 'self' blob: https://*.google.com https://*.googleapis.com https://www.recaptcha.net",
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

function resolveSpaEntryFile() {
  const candidates = ['index.html', path.join('apps', 'portal-web', 'index.html')]

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
  const requestId = normalizeText(getPlatformRequestContext()?.requestId)
  res.writeHead(statusCode, withSecurityHeaders({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...(requestId ? { 'X-Request-ID': requestId } : {}),
  }))
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

function sendMobileJson(res, statusCode, payload) {
  res.writeHead(statusCode, withSecurityHeaders({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  }))
  res.end(JSON.stringify(payload))
}

function sendMobileApiError(res, statusCode, code, message, details = undefined) {
  sendMobileJson(res, statusCode, {
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
  const requestId = normalizeText(getPlatformRequestContext()?.requestId)
  console.error(`[${context}]${requestId ? ` request=${requestId}` : ''} ${code}: ${message}`)
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

function isDatabaseTlsVerificationError(error) {
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeText(error?.message).toLowerCase()
  return (
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    code === 'UNABLE_TO_GET_ISSUER_CERT' ||
    code === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' ||
    message.includes('unable to verify the first certificate') ||
    message.includes('unable to verify') ||
    message.includes('norton web/mail shield')
  )
}

function isDatabaseTransientConnectionError(error) {
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeText(error?.message).toLowerCase()
  return (
    ['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ECONNABORTED'].includes(code) ||
    message.includes('timeout expired') ||
    message.includes('connection terminated due to connection timeout') ||
    message.includes('socket disconnected before secure tls connection was established')
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

  if (code === 'DB_CONFIG_MISSING' || message === 'DB_CONFIG_MISSING') {
    return {
      status: 503,
      code: 'DB_CONFIG_MISSING',
      message:
        'Lokalny backend nie ma konfiguracji bazy potrzebnej do sprawdzenia dostepu do organizacji. Uruchom pelny stos poleceniem "npm run dev".',
    }
  }

  if (
    code === 'INVALID_GRANT' ||
    responseError === 'invalid_grant' ||
    lowerMessage.includes('invalid_grant') ||
    lowerMessage.includes('invalid_rapt') ||
    responseDescription.includes('invalid_rapt')
  ) {
    const cloudSqlAuthClient = normalizeText(
      process.env.CLOUD_SQL_AUTH_CLIENT || process.env.DB_CLOUD_SQL_AUTH_CLIENT,
    ).toLowerCase()
    const usesLocalAdc =
      !isGoogleServerlessRuntime() &&
      (!cloudSqlAuthClient || cloudSqlAuthClient === 'adc' || cloudSqlAuthClient === 'google-auth')

    return {
      status: 500,
      code: 'GOOGLE_AUTH_REAUTH_REQUIRED',
      message: usesLocalAdc
        ? 'Lokalna sesja Google Cloud wygasla. Uruchom "gcloud auth application-default login", a nastepnie zrestartuj "npm run dev".'
        : 'Backend nie moze uwierzytelnic polaczenia z Google Cloud (invalid_grant/invalid_rapt). Sprawdz konto serwisowe runtime.',
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

  if (isDatabaseTlsVerificationError(error)) {
    return {
      status: 503,
      code: 'DB_TLS_CERT_VERIFY_FAILED',
      message:
        'Cloud SQL auth dziala, ale lokalne polaczenie TLS do bazy jest przechwytywane albo podmieniane przez antivirus/proxy (na tym komputerze wykryto Norton Web/Mail Shield). Wylacz skanowanie SSL/TLS dla Node/Cloud SQL albo testuj worker-profile przez wdrozony Firebase Hosting.',
    }
  }

  if (code === 'ECONNREFUSED') {
    return {
      status: 503,
      code: 'DB_CONNECTION_REFUSED',
      message: `Backend nie moĹĽe poĹ‚Ä…czyÄ‡ siÄ™ z bazÄ… PostgreSQL na ${host}:${port}. Uruchom lokalnÄ… bazÄ™ albo Cloud SQL Proxy.`,
    }
  }

  if (code === 'ETIMEDOUT' || code === 'ENOTFOUND' || code === 'EHOSTUNREACH' || code === 'ECONNRESET') {
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

  if (code === '23503') {
    return {
      status: 409,
      code: 'DB_FOREIGN_KEY_CONFLICT',
      message:
        'Baza danych blokuje usuniecie profilu, bo istnieja powiazane rekordy historyczne. Historia nie zostala usunieta; sprawdz ograniczenia FK dla worker albo uzyj trybu dezaktywacji.',
    }
  }

  return null
}

function mapDatabaseQueryError(error) {
  const code = normalizeText(error?.code).toUpperCase()
  if (!/^[0-9A-Z]{5}$/.test(code)) {
    return null
  }

  const label = normalizeText(error?.workerProfileQueryLabel)
  const dbMessage = normalizeText(error?.message)
  const context = [code, label ? `krok: ${label}` : '', dbMessage].filter(Boolean).join(', ')

  if (code === '42P08' || code === '42P18') {
    return {
      status: 500,
      code: 'DB_QUERY_PARAMETER_ERROR',
      message: `Backend otrzymal niejednoznaczny parametr SQL podczas zapisu pracownika (${context}).`,
    }
  }

  return {
    status: 500,
    code: 'DB_QUERY_FAILED',
    message: `Blad zapisu w bazie danych (${context}).`,
  }
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

async function readJsonBody(req, maxBytes = MAX_JSON_BODY_BYTES) {
  const raw = await readRequestBody(req, maxBytes)
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
  return normalizeOrganizationId(value)
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

function normalizeWorkerLogin(value) {
  const login = normalizeText(value)
  if (!login || login.length > 80 || /[\u0000-\u001f\u007f]/.test(login)) {
    return ''
  }
  return login
}

function emailLocalPart(email) {
  return normalizeLower(email).split('@')[0] || ''
}

function normalizeUserRole(value, options = {}) {
  const rawRole = normalizeText(value)
  const role = rawRole.toUpperCase()
  const normalized = rawRole
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  if (role === 'ADMIN' || role === 'OWNER' || role === 'SUPERADMIN' || normalized.includes('admin')) {
    return options?.allowAdmin ? 'ADMIN' : ''
  }
  if (role === 'MANAGER' || role === 'KIEROWNIK' || normalized.includes('manager') || normalized.includes('kierownik')) return 'MANAGER'
  if (role === 'COORDINATOR' || role === 'KOORDYNATOR' || normalized.includes('koordynator') || normalized.includes('coordinator')) return 'COORDINATOR'
  if (rawRole) return 'WORKER'
  return ''
}

function normalizeRequesterRole(value) {
  const role = normalizeText(value).toUpperCase()
  if (role === PLATFORM_ROLE) return 'ADMIN'
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

function isFirebaseTlsCertError(error) {
  const values = [
    error?.code,
    error?.message,
    error?.cause?.code,
    error?.cause?.message,
    error?.cause?.cause?.code,
    error?.cause?.cause?.message,
    error?.errorInfo?.code,
    error?.errorInfo?.message,
  ]
  const text = normalizeText(values.filter(Boolean).join(' ')).toLowerCase()
  return (
    text.includes('unable_to_verify_leaf_signature') ||
    text.includes('unable_to_get_issuer_cert') ||
    text.includes('unable_to_get_issuer_cert_locally') ||
    text.includes('self_signed_cert_in_chain') ||
    text.includes('depth_zero_self_signed_cert') ||
    text.includes('cert_has_expired') ||
    text.includes('unable to verify the first certificate') ||
    text.includes('unable to verify') ||
    text.includes('self-signed certificate') ||
    text.includes('--use-system-ca')
  )
}

function isFirebaseNetworkError(error) {
  const code = normalizeText(error?.code || error?.cause?.code).toLowerCase()
  const message = normalizeText(error?.message || error?.cause?.message).toLowerCase()
  return (
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('socket') ||
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('enotfound') ||
    message.includes('eai_again') ||
    code.includes('und_err') ||
    code.includes('econnreset') ||
    code.includes('etimedout') ||
    code.includes('enotfound') ||
    code.includes('eai_again')
  )
}

function isFirebaseQuotaError(error) {
  const statusCode = Number(error?.statusCode || error?.status || error?.response?.status || 0)
  const text = normalizeText(
    [
      error?.code,
      error?.message,
      error?.firebaseRestMessage,
      error?.errorInfo?.code,
      error?.errorInfo?.message,
    ]
      .filter(Boolean)
      .join(' '),
  ).toUpperCase()
  return (
    statusCode === 429 ||
    text.includes('AUTH/TOO-MANY-REQUESTS') ||
    text.includes('TOO_MANY_ATTEMPTS_TRY_LATER') ||
    text.includes('RESOURCE_EXHAUSTED') ||
    /(?:^|[^0-9])429[0-9A-Z_-]*/.test(text)
  )
}

function mapFirebaseAdminError(error) {
  const code = normalizeText(error?.code).toLowerCase()
  const restMessage = normalizeText(error?.firebaseRestMessage || error?.message).toUpperCase()
  const firebaseDetail = normalizeText(error?.firebaseRestMessage || error?.code || error?.message)
  if (isFirebaseQuotaError(error)) {
    return {
      status: 429,
      code: 'FIREBASE_TOO_MANY_ATTEMPTS',
      message: 'Firebase chwilowo blokuje tworzenie lub aktualizacje kont po zbyt wielu probach. Sprobuj ponownie za kilka minut.',
    }
  }

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

  if (isFirebaseTlsCertError(error)) {
    return {
      status: 503,
      code: 'FIREBASE_TLS_CERT_ERROR',
      message:
        'Node backend nie ufa certyfikatowi Google/Firebase. Zrestartuj root npm run dev. Lokalny dev stack wlacza systemowy CA, a gdy Node go nie wspiera, lokalny tryb awaryjny TLS. Jesli blad zostaje, dodaj firmowy CA przez NODE_EXTRA_CA_CERTS.',
    }
  }

  if (isFirebaseCredentialError(error)) {
    return {
      status: 500,
      code: 'FIREBASE_ADMIN_CREDENTIALS_MISSING',
      message:
        'Backend nie ma poswiadczen Firebase Admin. Dodaj serviceAccountKey.json obok index.js albo ustaw GOOGLE_APPLICATION_CREDENTIALS w root .env.local i zrestartuj npm run dev.',
    }
  }

  if (isFirebaseCredentialError(error)) {
    return {
      status: 500,
      code: 'FIREBASE_ADMIN_CREDENTIALS_MISSING',
      message: 'Backend nie ma lokalnych poĹ›wiadczeĹ„ Firebase Admin.',
    }
  }

  if (isFirebaseNetworkError(error)) {
    return {
      status: 503,
      code: 'FIREBASE_AUTH_UNAVAILABLE',
      message:
        'Lokalny backend nie moze polaczyc sie z Firebase Auth. Sprawdz dostep do internetu/proxy dla Node. Jesli to blad certyfikatu, uruchom backend z NODE_OPTIONS=--use-system-ca.',
    }
  }

  if (isFirebaseNetworkError(error)) {
    return {
      status: 503,
      code: 'FIREBASE_AUTH_UNAVAILABLE',
      message: 'Lokalny backend nie moze polaczyc sie z Firebase Auth. Sprawdz dostep do internetu/proxy dla Node oraz lokalne poswiadczenia Firebase Admin, np. GOOGLE_APPLICATION_CREDENTIALS.',
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

function sendFirebaseVerificationError(res, error) {
  const mapped = mapFirebaseAdminError(error)
  const status = Number(error?.statusCode ?? mapped.status ?? 401)
  const safeStatus = Number.isFinite(status) ? status : 401
  sendApiError(
    res,
    safeStatus,
    normalizeText(error?.publicCode) || mapped.code || 'UNAUTHENTICATED',
    normalizeText(error?.publicMessage) || mapped.message || 'Token Firebase jest niepoprawny albo wygasl.',
    publicErrorDetails(error),
  )
}

function parseBearerToken(req) {
  const auth = normalizeText(req.headers.authorization)
  const match = /^Bearer\s+(.+)$/i.exec(auth)
  return match ? match[1].trim() : ''
}

function parseFirebaseServiceAccountFromEnv() {
  const jsonValue = normalizeText(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON)
  const base64Value = normalizeText(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64)
  const defaultServiceAccountPath = path.join(__dirname, 'serviceAccountKey.json')
  const fileValue = normalizeText(
    process.env.FIREBASE_SERVICE_ACCOUNT_FILE ||
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS,
  )
  const filePath = fileValue || (fs.existsSync(defaultServiceAccountPath) ? defaultServiceAccountPath : '')
  const rawValue = jsonValue || (base64Value ? Buffer.from(base64Value, 'base64').toString('utf8') : '')
  if (!rawValue && !filePath) {
    return null
  }

  try {
    const source = rawValue || fs.readFileSync(path.resolve(__dirname, filePath), 'utf8')
    const serviceAccount = JSON.parse(source)
    if (serviceAccount && typeof serviceAccount === 'object' && typeof serviceAccount.private_key === 'string') {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n')
    }
    return serviceAccount
  } catch (error) {
    console.error(`[firebase-admin] Invalid Firebase service account config: ${error?.message || error}`)
    return null
  }
}

function parsePlatformFirebaseServiceAccountFromEnv() {
  const jsonValue = normalizeText(process.env.PLATFORM_FIREBASE_SERVICE_ACCOUNT_JSON)
  const base64Value = normalizeText(process.env.PLATFORM_FIREBASE_SERVICE_ACCOUNT_BASE64)
  const fileValue = normalizeText(
    process.env.PLATFORM_FIREBASE_SERVICE_ACCOUNT_FILE ||
      process.env.PLATFORM_FIREBASE_SERVICE_ACCOUNT_PATH,
  )
  const rawValue = jsonValue || (base64Value ? Buffer.from(base64Value, 'base64').toString('utf8') : '')
  if (!rawValue && !fileValue) return null

  try {
    const source = rawValue || fs.readFileSync(path.resolve(__dirname, fileValue), 'utf8')
    const serviceAccount = JSON.parse(source)
    if (serviceAccount && typeof serviceAccount === 'object' && typeof serviceAccount.private_key === 'string') {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n')
    }
    return serviceAccount
  } catch (error) {
    console.error(`[platform-firebase-admin] Invalid service account config: ${error?.message || error}`)
    return null
  }
}

function detectApplicationDefaultCredentialsPath() {
  const candidates = []
  if (process.env.APPDATA) {
    candidates.push(path.join(process.env.APPDATA, 'gcloud', 'application_default_credentials.json'))
  }
  if (process.env.HOME) {
    candidates.push(path.join(process.env.HOME, '.config', 'gcloud', 'application_default_credentials.json'))
  }

  return candidates.find((candidate) => fs.existsSync(candidate)) || ''
}

function buildFirebaseAdminOptions() {
  const serviceAccount = parseFirebaseServiceAccountFromEnv()
  const options = {}
  if (FIREBASE_PROJECT_ID) {
    options.projectId = FIREBASE_PROJECT_ID
  }
  if (FIREBASE_STORAGE_BUCKET) {
    options.storageBucket = FIREBASE_STORAGE_BUCKET
  } else if (FIREBASE_PROJECT_ID) {
    options.storageBucket = `${FIREBASE_PROJECT_ID}.appspot.com`
  }
  if (serviceAccount) {
    options.credential = admin.credential.cert(serviceAccount)
    if (!options.projectId && serviceAccount.project_id) {
      options.projectId = serviceAccount.project_id
    }
  } else if (shouldUseGcloudFirebaseAdminCredential()) {
    options.credential = createGcloudFirebaseAdminCredential()
  } else if (detectApplicationDefaultCredentialsPath()) {
    options.credential = admin.credential.applicationDefault()
  }
  return Object.keys(options).length ? options : undefined
}

function normalizeWorkerPhotoPayload(body = {}) {
  const removePhoto = asPayloadBoolean(body?.removePhoto ?? body?.photoRemove, false)
  const photoDataUrl = normalizeText(body?.photoDataUrl ?? body?.photoDataURI ?? body?.photoBase64)
  const photoUrl = normalizeText(body?.photoUrl ?? body?.profilePhotoUrl ?? body?.avatarUrl)
  const changed = Boolean(removePhoto || photoDataUrl || Object.prototype.hasOwnProperty.call(body, 'photoUrl'))

  return {
    photoDataUrl,
    photoUrl: removePhoto ? '' : photoUrl.slice(0, 2048),
    photoUrlChanged: changed,
    removePhoto,
  }
}

function parseWorkerProfilePhotoDataUrl(value) {
  const raw = normalizeText(value)
  if (!raw) return null
  const match = /^data:(image\/(?:png|jpe?g|webp));base64,([a-z0-9+/=\r\n]+)$/i.exec(raw)
  if (!match) {
    throw createWorkerProfilePublicError(400, 'WORKER_PHOTO_INVALID', 'Zdjecie pracownika musi byc plikiem PNG, JPG albo WEBP.')
  }
  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64')
  if (!buffer.length || buffer.length > MAX_WORKER_PROFILE_PHOTO_BYTES) {
    throw createWorkerProfilePublicError(413, 'WORKER_PHOTO_TOO_LARGE', 'Zdjecie pracownika jest zbyt duze. Dodaj miniaturę do 1 MB.')
  }
  return {
    buffer,
    contentType: match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase(),
  }
}

function workerProfilePhotoExtension(contentType) {
  if (contentType === 'image/png') return 'png'
  if (contentType === 'image/webp') return 'webp'
  return 'jpg'
}

function workerProfileStorageLogin(login) {
  return normalizeText(login || 'worker')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'worker'
}

async function uploadWorkerProfilePhoto(payload, decodedToken = {}) {
  const parsed = parseWorkerProfilePhotoDataUrl(payload?.photoDataUrl)
  if (!parsed) {
    return null
  }

  const app = ensureFirebaseAdmin()
  const bucket = app.storage().bucket()
  const token = crypto.randomUUID()
  const ext = workerProfilePhotoExtension(parsed.contentType)
  const objectName = [
    'orgs',
    payload.orgId,
    'worker-profiles',
    workerProfileStorageLogin(payload.newLogin || payload.login),
    `avatar-${Date.now()}-${token}.${ext}`,
  ].join('/')
  const file = bucket.file(objectName)
  await file.save(parsed.buffer, {
    resumable: false,
    metadata: {
      contentType: parsed.contentType,
      cacheControl: 'public, max-age=3600',
      metadata: {
        firebaseStorageDownloadTokens: token,
        orgId: payload.orgId,
        workerLogin: payload.newLogin || payload.login,
        source: 'portal-worker-profile',
        createdByUid: normalizeText(decodedToken?.uid),
      },
    },
  })

  return {
    objectName,
    url: `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(objectName)}?alt=media&token=${encodeURIComponent(token)}`,
  }
}

async function deleteWorkerProfilePhotoObject(uploadedPhoto) {
  const objectName = normalizeText(uploadedPhoto?.objectName)
  if (!objectName) return
  try {
    await ensureFirebaseAdmin().storage().bucket().file(objectName).delete({ ignoreNotFound: true })
  } catch {
    // Best-effort cleanup after a failed profile write.
  }
}

function workerProfilePhotoObjectFromUrl(value, orgId) {
  const raw = normalizeText(value)
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.hostname !== 'firebasestorage.googleapis.com') return null
    const marker = '/o/'
    const markerIndex = url.pathname.indexOf(marker)
    if (markerIndex < 0) return null
    const objectName = decodeURIComponent(url.pathname.slice(markerIndex + marker.length))
    const expectedPrefix = `orgs/${normalizeOrgId(orgId)}/worker-profiles/`
    if (!objectName.startsWith(expectedPrefix)) return null
    return { objectName }
  } catch {
    return null
  }
}

function buildPlatformFirebaseAdminOptions() {
  const serviceAccount = parsePlatformFirebaseServiceAccountFromEnv()
  const options = {}
  if (PLATFORM_FIREBASE_PROJECT_ID) options.projectId = PLATFORM_FIREBASE_PROJECT_ID
  if (serviceAccount) {
    options.credential = admin.credential.cert(serviceAccount)
    if (!options.projectId && serviceAccount.project_id) options.projectId = serviceAccount.project_id
  }
  return Object.keys(options).length ? options : undefined
}

function shouldUseGcloudFirebaseAdminCredential() {
  const mode = normalizeText(
    process.env.FIREBASE_ADMIN_AUTH_CLIENT ||
      process.env.FIREBASE_ADMIN_CREDENTIAL ||
      process.env.FIREBASE_AUTH_CLIENT,
  ).toLowerCase()
  return mode === 'gcloud' || mode === 'gcloud-auth'
}

function createGcloudFirebaseAdminCredential() {
  return {
    getAccessToken: async () => ({
      access_token: readGcloudAccessToken(),
      expires_in: 3600,
    }),
  }
}

function ensureFirebaseAdmin() {
  if (!firebaseAdminInitialized) {
    if (!admin.apps.length) {
      admin.initializeApp(buildFirebaseAdminOptions())
    }
    firebaseAdminInitialized = true
  }

  return admin
}

function ensurePlatformFirebaseAdmin() {
  if (!PLATFORM_FIREBASE_PROJECT_ID) return null
  if (!platformFirebaseAdminInitialized) {
    const existingApp = admin.apps.find((app) => app.name === PLATFORM_FIREBASE_ADMIN_APP_NAME)
    if (!existingApp) {
      admin.initializeApp(buildPlatformFirebaseAdminOptions(), PLATFORM_FIREBASE_ADMIN_APP_NAME)
    }
    platformFirebaseAdminInitialized = true
  }
  return admin.app(PLATFORM_FIREBASE_ADMIN_APP_NAME)
}

function canUseFirebaseRest() {
  return Boolean(FIREBASE_WEB_API_KEY) && typeof fetch === 'function'
}

function shouldAllowFirebaseAuthRestFallback() {
  const mode = normalizeText(
    process.env.FIREBASE_AUTH_REST_FALLBACK ||
      process.env.FIREBASE_REST_FALLBACK ||
      process.env.AUTH_REST_FALLBACK,
  ).toLowerCase()
  if (['1', 'true', 'yes', 'tak', 'local', 'dev', 'development'].includes(mode)) {
    return true
  }
  if (['0', 'false', 'no', 'nie', 'off', 'disabled'].includes(mode)) {
    return false
  }
  return isLocalDevelopmentRuntime()
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

async function callPlatformFirebaseIdentityToolkit(method, payload) {
  if (!PLATFORM_FIREBASE_WEB_API_KEY || typeof fetch !== 'function') {
    const error = new Error('PLATFORM_FIREBASE_WEB_API_KEY_MISSING')
    error.publicCode = 'PLATFORM_FIREBASE_CONFIG_MISSING'
    error.publicMessage = 'Brak backendowej konfiguracji Firebase dla Centrum platformy.'
    error.statusCode = 500
    throw error
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${encodeURIComponent(PLATFORM_FIREBASE_WEB_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(normalizeText(body?.error?.message) || `PLATFORM_FIREBASE_REST_${method.toUpperCase()}_FAILED`)
    error.statusCode = response.status
    error.firebaseRestMessage = normalizeText(body?.error?.message)
    throw error
  }
  return body
}

async function withFirebaseAccountCreatedAt(decodedToken, firebaseAuth) {
  if (decodedToken?.email_verified === true || !normalizeText(decodedToken?.uid)) {
    return decodedToken
  }
  try {
    const user = await firebaseAuth.getUser(decodedToken.uid)
    const accountCreatedAt = normalizeFirebaseAccountCreatedAt(user?.metadata?.creationTime)
    return accountCreatedAt
      ? { ...decodedToken, account_created_at: accountCreatedAt }
      : decodedToken
  } catch {
    // Membership timestamps remain the fail-closed legacy fallback.
    return decodedToken
  }
}

async function verifyFirebaseIdToken(token) {
  try {
    const firebaseAuth = ensureFirebaseAdmin().auth()
    const verifiedToken = await firebaseAuth.verifyIdToken(token)
    const decodedToken = await withFirebaseAccountCreatedAt(verifiedToken, firebaseAuth)
    setVerifiedFirebaseToken(decodedToken)
    return decodedToken
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

    const decodedToken = buildFirebaseRestDecodedToken({
      token,
      lookupUser: user,
      projectId: FIREBASE_PROJECT_ID,
    })
    setVerifiedFirebaseToken(decodedToken)
    return decodedToken
  }
}

async function verifyPlatformFirebaseIdToken(token) {
  if (!PLATFORM_FIREBASE_PROJECT_ID) return verifyFirebaseIdToken(token)

  try {
    const platformApp = ensurePlatformFirebaseAdmin()
    const decodedToken = await admin.auth(platformApp).verifyIdToken(token)
    setVerifiedFirebaseToken(decodedToken)
    return decodedToken
  } catch (adminError) {
    if (!PLATFORM_FIREBASE_WEB_API_KEY) throw adminError

    const body = await callPlatformFirebaseIdentityToolkit('lookup', { idToken: token })
    const user = Array.isArray(body?.users) ? body.users[0] : null
    const uid = normalizeText(user?.localId)
    if (!uid) {
      const error = new Error('INVALID_ID_TOKEN')
      error.firebaseRestMessage = 'INVALID_ID_TOKEN'
      throw error
    }

    const decodedToken = buildFirebaseRestDecodedToken({
      token,
      lookupUser: user,
      projectId: PLATFORM_FIREBASE_PROJECT_ID,
    })
    setVerifiedFirebaseToken(decodedToken)
    return decodedToken
  }
}

async function verifySessionContextFirebaseIdToken(token) {
  try {
    return await verifyFirebaseIdToken(token)
  } catch (organizationError) {
    if (!PLATFORM_FIREBASE_PROJECT_ID) throw organizationError
    return verifyPlatformFirebaseIdToken(token)
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
    if (isFirebaseCredentialError(error) && canUseFirebaseRest() && shouldAllowFirebaseAuthRestFallback()) {
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
    if (!canUseFirebaseRest() || !shouldAllowFirebaseAuthRestFallback()) {
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
    if (isFirebaseCredentialError(error) && canUseFirebaseRest() && shouldAllowFirebaseAuthRestFallback()) {
      return null
    }
    throw error
  }
}

function buildProvisionWorkerPayload(body) {
  const orgId = normalizeOrgId(body?.orgId)
  const loginLocalPart = normalizeLoginLocalPart(body?.loginLocalPart || body?.login)
  const email = normalizeEmail(body?.email)
  const workerName = normalizeText(body?.workerName || body?.displayName || body?.name) || loginLocalPart
  const roleInput = normalizeText(body?.roleLabel || body?.role)
  const role = roleInput ? normalizeUserRole(roleInput, { allowAdmin: true }) : 'WORKER'
  const password = normalizeText(body?.password)
  const active = asPayloadBoolean(body?.active, true)
  const workerId = normalizeText(body?.workerId || body?.id).slice(0, 128)

  const validationErrors = []
  if (!orgId) validationErrors.push('Brak poprawnego orgId.')
  if (!loginLocalPart) validationErrors.push('Podaj poprawny login bez znaku @.')
  if (!email) validationErrors.push('Podaj poprawny email.')
  if (!workerName) validationErrors.push('Podaj imie i nazwisko pracownika.')
  if (!role) validationErrors.push('Wybierz poprawny typ pracownika.')
  if (password.length < 6) validationErrors.push('Haslo tymczasowe musi miec co najmniej 6 znakow.')

  return {
    value: { orgId, loginLocalPart, email, workerName, role, password, active, workerId },
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

async function executeAdminDataConnectOperation(kind, operationName, variables, operationOptions = {}) {
  const missingConfig = [
    ['FIREBASE_PROJECT_ID', FIREBASE_PROJECT_ID],
    ['FIREBASE_DATACONNECT_LOCATION', DATACONNECT_LOCATION],
    ['FIREBASE_DATACONNECT_SERVICE', DATACONNECT_SERVICE],
    ['FIREBASE_DATACONNECT_CONNECTOR', DATACONNECT_CONNECTOR],
  ].filter(([, value]) => !normalizeText(value)).map(([name]) => name)
  if (missingConfig.length) {
    const error = new Error('DATACONNECT_CONFIG_MISSING')
    error.statusCode = 503
    error.publicCode = 'DATACONNECT_CONFIG_MISSING'
    error.publicMessage = `Brak konfiguracji backendu Data Connect: ${missingConfig.join(', ')}.`
    error.details = { missing: missingConfig }
    throw error
  }
  ensureFirebaseAdmin()
  const connector = resolvePlatformDataConnectConnector(kind, operationName, DATACONNECT_CONNECTOR)
  const dataConnect = getAdminDataConnect({
    location: DATACONNECT_LOCATION,
    serviceId: DATACONNECT_SERVICE,
    connector,
  })
  return kind === 'mutation'
    ? dataConnect.executeMutation(operationName, variables || {}, operationOptions)
    : dataConnect.executeQuery(operationName, variables || {}, operationOptions)
}

function normalizeWorkerType(value) {
  const raw = normalizeText(value)
  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  if (normalized.includes('admin') || normalized.includes('owner') || normalized.includes('superadmin')) {
    return 'Administrator'
  }
  if (
    normalized.includes('biurow') ||
    normalized.includes('koordynator') ||
    normalized.includes('coordinator') ||
    normalized.includes('manager') ||
    normalized.includes('kierownik')
  ) {
    return 'Pracownik Biurowy'
  }
  if (normalized.includes('mobil') || normalized.includes('zespol')) {
    return 'Zesp\u00f3\u0142 Mobilny'
  }
  return 'Sta\u0142y personel na obiekcie'
}

function workerRoleAssignmentError(code, message) {
  return createWorkerProfilePublicError(403, code, message)
}

function assertWorkerRoleAssignmentAllowed(
  requesterRole,
  targetRole,
  { currentRole = '', targetIsOwner = false, creating = false } = {},
) {
  if (canAssignWorkerRole(requesterRole, targetRole, { currentRole, targetIsOwner, creating })) {
    return targetIsOwner ? 'OWNER' : normalizeWorkerRole(targetRole)
  }
  if (targetIsOwner || normalizeWorkerRole(targetRole) === 'OWNER') {
    throw workerRoleAssignmentError(
      'OWNER_ROLE_IMMUTABLE',
      'Rola OWNER jest przypisana wy\u0142\u0105cznie za\u0142o\u017cycielowi organizacji i nie mo\u017ce by\u0107 zmieniona.',
    )
  }
  throw workerRoleAssignmentError(
    'WORKER_ROLE_CHANGE_FORBIDDEN',
    creating
      ? 'Manager mo\u017ce dodawa\u0107 nowych pracownik\u00f3w wy\u0142\u0105cznie z domy\u015bln\u0105 rol\u0105 WORKER.'
      : 'Tylko ADMIN albo OWNER mo\u017ce zmienia\u0107 role pracownik\u00f3w.',
  )
}

function buildWorkerPasswordPayload(body, { requirePassword = false } = {}) {
  const orgId = normalizeOrgId(body?.orgId)
  const login = normalizeWorkerLogin(body?.login || body?.workerLogin)
  const password = normalizeText(body?.password)
  const validationErrors = []

  if (!orgId) validationErrors.push('Brak poprawnego orgId.')
  if (!login) validationErrors.push('Podaj poprawny login pracownika.')
  if (requirePassword && password.length < 6) {
    validationErrors.push('Haslo musi miec co najmniej 6 znakow.')
  }

  return {
    value: { orgId, login, password },
    validationErrors,
  }
}

function isDataConnectWorkerNotFound(error) {
  const message = normalizeText(error?.publicMessage || error?.message).toLowerCase()
  return message.includes('nie znaleziono pracownika') || message.includes('worker') && message.includes('not found')
}

function addWorkerMatchKey(keys, value) {
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

function workerMatchKeys(row) {
  const keys = new Set()
  addWorkerMatchKey(keys, row?.login)
  addWorkerMatchKey(keys, row?.workerLogin)
  addWorkerMatchKey(keys, row?.workerId)
  addWorkerMatchKey(keys, row?.loginEmail ?? row?.login_email)
  addWorkerMatchKey(keys, row?.email)
  addWorkerMatchKey(keys, row?.authUid ?? row?.auth_uid)
  return keys
}

function findWorkerForPasswordReset(rows, login) {
  const requested = new Set()
  addWorkerMatchKey(requested, login)
  for (const row of Array.isArray(rows) ? rows : []) {
    const keys = workerMatchKeys(row)
    for (const key of requested) {
      if (keys.has(key)) {
        return row
      }
    }
  }
  return null
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

function workerNumberOverrideError() {
  return createWorkerProfilePublicError(
    400,
    'INVALID_WORKER_NUMBER_OVERRIDE',
    'Numer ID pracownika musi byc dodatnia liczba calkowita bez zer wiodacych.',
  )
}

function assertWorkerNumberOverrideAllowed(requesterRole, workerNumberOverride) {
  if (workerNumberOverride !== null && !isWorkerDeleteRole(requesterRole)) {
    throw createWorkerProfilePublicError(
      403,
      'WORKER_NUMBER_OVERRIDE_FORBIDDEN',
      'Tylko ADMIN albo OWNER moze recznie zmienic numer ID pracownika.',
    )
  }
}

function workerReservationConflictError(workerNumber) {
  return createWorkerProfilePublicError(
    409,
    'WORKER_NUMBER_ALREADY_RESERVED',
    `Numer ID pracownika ${workerNumber} jest juz zarezerwowany w tej organizacji.`,
  )
}

function isWorkerReservationConflict(error) {
  const code = normalizeText(error?.code || error?.publicCode).toUpperCase()
  const message = normalizeText(error?.message || error?.publicMessage).toLowerCase()
  return (
    code === '23505' ||
    code.includes('ALREADY_EXISTS') ||
    code.includes('CONFLICT') ||
    message.includes('duplicate key') ||
    message.includes('already exists') ||
    message.includes('juz istnieje') ||
    message.includes('już istnieje')
  )
}

function isWorkerNumberAlreadyUsed(orgId, workerNumber, reservations = [], workers = []) {
  return (
    (Array.isArray(reservations) ? reservations : []).some(
      (row) => normalizeWorkerNumber(row?.workerNumber ?? row?.worker_number, { optional: true }) === workerNumber,
    ) ||
    (Array.isArray(workers) ? workers : []).some(
      (row) => parseWorkerNumber(orgId, row?.workerId ?? row?.worker_id ?? row?.id) === workerNumber,
    )
  )
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

function readGcloudAccessToken() {
  const command = normalizeText(process.env.GCLOUD_COMMAND) || 'gcloud'
  const commandArgs = ['auth', 'print-access-token', '--quiet']
  const executable = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : command
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', command, ...commandArgs] : commandArgs
  return execFileSync(executable, args, {
    cwd: __dirname,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .trim()
    .split(/\r?\n/)
    .pop()
}

function createGcloudAccessTokenAuthClient() {
  const token = readGcloudAccessToken()

  if (!token) {
    const error = new Error('GCLOUD_ACCESS_TOKEN_MISSING')
    error.publicCode = 'GOOGLE_AUTH_REAUTH_REQUIRED'
    error.publicMessage = 'Nie udalo sie pobrac access token z gcloud. Uruchom gcloud auth login i sprobuj ponownie.'
    throw error
  }

  const auth = new OAuth2Client()
  auth.setCredentials({
    access_token: token,
    expiry_date: Date.now() + 50 * 60 * 1000,
  })
  return auth
}

function createCloudSqlConnectorAuth() {
  const mode = normalizeText(process.env.CLOUD_SQL_AUTH_CLIENT || process.env.DB_CLOUD_SQL_AUTH_CLIENT).toLowerCase()
  if (mode === 'compute' || (!mode && isGoogleServerlessRuntime())) {
    return new Compute({ scopes: [CLOUD_SQL_ADMIN_SCOPE] })
  }
  if (mode === 'google-auth' || mode === 'adc') {
    return new GoogleAuth({ scopes: [CLOUD_SQL_ADMIN_SCOPE] })
  }
  if (mode === 'gcloud' || mode === 'gcloud-auth') {
    return createGcloudAccessTokenAuthClient()
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

function getDbConnectTimeoutMillis() {
  const value = Number(process.env.DB_CONNECT_TIMEOUT_MS || process.env.PGCONNECT_TIMEOUT_MS || 30000)
  return Number.isFinite(value) && value > 0 ? value : 30000
}

function wrapCloudSqlPostgresStream(streamFactory) {
  if (typeof streamFactory !== 'function') {
    return streamFactory
  }

  return (...args) => {
    const stream = streamFactory(...args)
    if (!stream || stream.__cloudSqlPgConnectPatched) {
      return stream
    }

    const originalConnect = typeof stream.connect === 'function' ? stream.connect.bind(stream) : null

    Object.defineProperty(stream, '__cloudSqlPgConnectPatched', {
      value: true,
      configurable: true,
    })

    // pg waits for "connect" before sending the PostgreSQL startup packet.
    // Cloud SQL's TLS stream is already opening before pg attaches listeners,
    // so emit a pg-visible connect once TLS is definitely established.
    stream.connect = function connectCloudSqlPostgresStream() {
      if (originalConnect) {
        originalConnect()
      }
      const emitConnect = () => process.nextTick(() => stream.emit('connect'))
      if (stream.authorized || stream.readyState === 'open') {
        emitConnect()
      } else {
        stream.once('secureConnect', emitConnect)
      }
      return stream
    }

    return stream
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
      .then((options) => ({
        ...options,
        stream: wrapCloudSqlPostgresStream(options?.stream),
      }))
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
      connectionTimeoutMillis: getDbConnectTimeoutMillis(),
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
      connectionTimeoutMillis: getDbConnectTimeoutMillis(),
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
    connectionTimeoutMillis: getDbConnectTimeoutMillis(),
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

function shouldProxyPortalEventsRequest() {
  const mode = normalizeText(
    process.env.PORTAL_EVENTS_MODE || process.env.PORTAL_DB_ROUTES_MODE || process.env.API_DB_ROUTES_MODE,
  ).toLowerCase()
  if (['local', 'direct'].includes(mode)) {
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

function shouldProxyWorkerProfileRequest() {
  return false
}

function shouldUseWorkerProfileDataConnectStorage() {
  const profileMode = normalizeText(process.env.WORKER_PROFILE_MODE).toLowerCase()
  if (['local', 'direct', 'db', 'database', 'cloudsql', 'cloud-sql'].includes(profileMode)) {
    return false
  }

  const mode = normalizeText(
    process.env.WORKER_PROFILE_STORAGE_MODE ||
      process.env.WORKER_PROFILE_DB_MODE ||
      process.env.WORKER_PROFILE_DATA_MODE,
  ).toLowerCase()
  return ['dataconnect', 'data-connect', 'firebase', 'https'].includes(mode)
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
  const maxAttempts = Math.max(1, Number(process.env.DB_CONNECT_RETRY_ATTEMPTS || 3) || 3)
  let lastError = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const pool = await getDbPool()
    try {
      return await pool.connect()
    } catch (error) {
      lastError = error
      const canRetry =
        attempt < maxAttempts && (isDatabaseSslBadCertificateError(error) || isDatabaseTransientConnectionError(error))
      if (!canRetry) {
        throw error
      }

      await resetDbConnectionCache()
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt))
    }
  }

  throw lastError || new Error('DB_CONNECTION_FAILED')
}

let mobileWorkflowTablesAttempted = false
let mobileWorkflowTablesReady = false
const MOBILE_GPS_COLUMN_MAX_LEN = 255

function makeMobileId(prefix) {
  try {
    return `${prefix}-${crypto.randomUUID()}`
  } catch {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`
  }
}

function normalizeMobileQr(value) {
  return normalizeText(value).replace(/\s+/g, '')
}

function compactMobileKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function mobileIso(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : ''
}

function mobileElapsedSec(fromValue, toValue = new Date()) {
  const from = new Date(fromValue || 0).getTime()
  const to = new Date(toValue || 0).getTime()
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 0
  return Math.floor((to - from) / 1000)
}

function normalizeMobileGpsData(value) {
  const source = value && typeof value === 'object' ? value : {}
  const lat = Number(source.lat ?? source.latitude)
  const lon = Number(source.lon ?? source.lng ?? source.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null
  }
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return null
  }

  const accM = Number(source.accM ?? source.accuracy ?? source.accuracyM)
  const at = new Date(source.atIso || source.timestamp || Date.now())
  const tzOffsetMin = Number(source.tzOffsetMin)
  return {
    lat,
    lon,
    accM: Number.isFinite(accM) ? Math.round(accM) : null,
    atIso: Number.isFinite(at.getTime()) ? at.toISOString() : new Date().toISOString(),
    tzOffsetMin: Number.isFinite(tzOffsetMin) ? tzOffsetMin : null,
  }
}

function mobileGpsActionToken(value) {
  return normalizeText(value).toUpperCase().replace(/[^A-Z0-9_]/g, '') || 'GPS'
}

function mobileGpsColumnValue(gpsData, actionLabel) {
  const data = normalizeMobileGpsData(gpsData)
  if (!data) {
    return ''
  }

  const action = mobileGpsActionToken(actionLabel)
  const acc = Number.isFinite(Number(data.accM)) ? `${Math.round(Number(data.accM))}m` : 'NA'
  const tz = Number.isFinite(Number(data.tzOffsetMin))
    ? `UTC${Number(data.tzOffsetMin) >= 0 ? '+' : ''}${Number(data.tzOffsetMin) / 60}`
    : 'UTC?'
  return `${action}_GPS lat=${data.lat.toFixed(6)} lon=${data.lon.toFixed(6)} acc=${acc} at=${data.atIso} tz=${tz}`
}

function fitMobileGpsColumn(value) {
  const text = normalizeText(value)
  if (!text) return null
  return text.length <= MOBILE_GPS_COLUMN_MAX_LEN ? text : text.slice(0, MOBILE_GPS_COLUMN_MAX_LEN)
}

function appendMobileComment(base, addition) {
  const left = normalizeText(base)
  const right = normalizeText(addition)
  if (!right) return left || null
  if (!left) return right
  if (left.includes(right)) return left
  return `${left} | ${right}`
}

function mergeMobileGpsColumn(base, latest) {
  const merged = appendMobileComment(base, latest)
  if (!merged) return null
  if (merged.length <= MOBILE_GPS_COLUMN_MAX_LEN) return merged
  return fitMobileGpsColumn(latest) || fitMobileGpsColumn(merged)
}

function mobileFunctionToken(value) {
  const raw = normalizeText(value)
  if (!raw) return ''
  let normalized = raw
  try {
    normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  } catch {
    normalized = raw
  }
  return normalized.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function classifyMobileZone(functionValue) {
  const token = mobileFunctionToken(functionValue)
  if (token === 'START' || token === 'STARTCZASPRACY') {
    return { kind: 'START', stopGraceMin: null }
  }
  if (token.startsWith('STOP')) {
    const explicitGrace = token.match(/STOP(?:CZASPRACY)?(15|10|5|0)/)
    return { kind: 'STOP', stopGraceMin: explicitGrace ? Number(explicitGrace[1]) : 0 }
  }
  if (token === 'SPRZATANIEINDYWIDUALNE' || token === 'ZLECENIEINDYWIDUALNE') {
    return { kind: 'INDIVIDUAL', stopGraceMin: null }
  }
  return { kind: 'CLEAN', stopGraceMin: null }
}

function mobileZoneAllowsAutoWorkday(zone) {
  const token = mobileFunctionToken(zone?.function_name || zone?.functionName)
  return (
    token.includes('SPRZATANIEINDYWIDUALNE') ||
    token.includes('ZLECENIEINDYWIDUALNE') ||
    token.includes('STREFASPECJALNA') ||
    token.includes('KODSPECJALNY')
  )
}

function isMobileSpecialZone(zone) {
  const token = mobileFunctionToken(zone?.function_name || zone?.functionName)
  return token.includes('STREFASPECJALNA') || token.includes('KODSPECJALNY')
}

function isMobileSpecialEventRow(row) {
  return isMobileSpecialZone({ function_name: row?.function_name, functionName: row?.functionName })
}

function createMobileGpsRequiredError(actionLabel, zone) {
  const action = mobileGpsActionToken(actionLabel)
  const error = new Error('MOBILE_GPS_REQUIRED')
  error.statusCode = 428
  error.publicCode = 'GPS_REQUIRED'
  error.publicMessage = 'Ten kod QR wymaga lokalizacji GPS. Zezwol na lokalizacje i sprobuj ponownie.'
  error.publicDetails = {
    gpsAction: action || 'CLEAN',
    qrCode: normalizeText(zone?.id || zone?.zone_id),
  }
  return error
}

function mapMobileZoneRow(row) {
  if (!row) return null
  const classified = classifyMobileZone(row.function_name)
  const functionName = normalizeText(row.function_name)
  return {
    id: normalizeText(row.zone_id),
    zoneId: normalizeText(row.zone_id),
    clientId: normalizeText(row.client_id),
    clientName: normalizeText(row.client_name),
    name: normalizeText(row.zone_name),
    functionName,
    isSpecialZone: isMobileSpecialZone({ functionName }),
    location: normalizeText(row.location),
    kind: classified.kind,
    stopGraceMin: classified.stopGraceMin,
  }
}

function mapMobileWorkdayRow(row) {
  if (!row) return null
  return {
    workdayId: normalizeText(row.workday_id),
    workerLogin: normalizeText(row.worker_login),
    workerName: normalizeText(row.worker_name),
    utilityRoomId: normalizeText(row.utility_room_id),
    startObject: normalizeText(row.start_object),
    stopObject: normalizeText(row.stop_object),
    startAt: mobileIso(row.start_at),
    endAt: mobileIso(row.end_at),
    durationSec: Number.isFinite(Number(row.duration_sec)) ? Number(row.duration_sec) : 0,
    pauseTotalSec: Number.isFinite(Number(row.pause_total_sec)) ? Number(row.pause_total_sec) : 0,
    pauseOpenId: normalizeText(row.pause_open_id),
    pauseOpenAt: mobileIso(row.pause_open_at),
    status: normalizeText(row.status) || (row.end_at ? 'CLOSED' : 'RUNNING'),
    comment: normalizeText(row.comment),
    gps: normalizeText(row.gps),
    updatedAt: mobileIso(row.updated_at),
  }
}

function mapMobileEventRow(row) {
  if (!row) return null
  const classified = classifyMobileZone(row.function_name)
  const functionName = normalizeText(row.function_name)
  const plannedDurationMinutes =
    row.planned_duration_minutes == null || row.planned_duration_minutes === ''
      ? null
      : Number(row.planned_duration_minutes)
  const planSnapshotVersion =
    row.plan_snapshot_version == null || row.plan_snapshot_version === ''
      ? null
      : Number(row.plan_snapshot_version)
  return {
    eventId: normalizeText(row.event_id),
    eventType: normalizeText(row.event_type),
    matchStatus: normalizeText(row.match_status),
    matchMethod: normalizeText(row.match_method),
    matchReason: normalizeText(row.match_reason),
    taskId: normalizeText(row.task_id),
    occurrenceDateYmd: normalizeText(row.occurrence_date_ymd),
    serviceBlockId: normalizeText(row.service_block_id),
    allocationId: normalizeText(row.allocation_id),
    workSlotKey: normalizeText(row.work_slot_key),
    matchedAt: mobileIso(row.matched_at),
    planSnapshotVersion: Number.isFinite(planSnapshotVersion) ? planSnapshotVersion : null,
    plannedStartAt: mobileIso(row.planned_start_at),
    plannedEndAt: mobileIso(row.planned_end_at),
    plannedDurationMinutes: Number.isFinite(plannedDurationMinutes) ? plannedDurationMinutes : null,
    taskUpdatedAtSnapshot: mobileIso(row.task_updated_at_snapshot),
    zoneId: normalizeText(row.zone_id),
    zoneName: normalizeText(row.zone_name),
    zoneKind: classified.kind,
    functionName,
    isSpecialZone: isMobileSpecialEventRow(row),
    location: normalizeText(row.location),
    clientId: normalizeText(row.client_id),
    clientName: normalizeText(row.client_name),
    workerLogin: normalizeText(row.worker_login),
    workerName: normalizeText(row.worker_name),
    workdayId: normalizeText(row.workday_id),
    startAt: mobileIso(row.start_at),
    endAt: mobileIso(row.end_at),
    status: normalizeText(row.status) || (row.end_at ? 'CLOSED' : 'RUNNING'),
    durationSec: Number.isFinite(Number(row.duration_sec)) ? Number(row.duration_sec) : 0,
    comment: normalizeText(row.comment),
    endReason: normalizeText(row.end_reason),
  }
}

function isMobileWorkdayOpen(row) {
  if (!row) return false
  if (normalizeText(row.status).toUpperCase() === 'CLOSED') return false
  return !row.end_at
}

function isMobileEventOpen(row) {
  if (!row) return false
  if (normalizeText(row.status).toUpperCase() === 'CLOSED') return false
  return !row.end_at
}

function isPostgresMissingRelationError(error) {
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeText(error?.message).toLowerCase()
  return code === '42P01' || code === '42703' || message.includes('does not exist')
}

async function ensureMobileWorkflowTables(client) {
  if (mobileWorkflowTablesReady) return true
  if (mobileWorkflowTablesAttempted && !mobileWorkflowTablesReady) return false
  mobileWorkflowTablesAttempted = true
  let savepointCreated = false
  try {
    await client.query('savepoint mobile_workflow_tables')
    savepointCreated = true
    await client.query(`
      create table if not exists public.worker_runtime_state (
        org_id varchar(64) not null,
        worker_login varchar(80) not null,
        worker_name text,
        active_workday_id varchar(64),
        workday_start_at timestamptz,
        active_event_id varchar(64),
        active_zone_id varchar(64),
        zone_start_at timestamptz,
        status varchar(32),
        version integer not null default 1,
        updated_at timestamptz not null default now(),
        primary key (org_id, worker_login)
      )
    `)
    await client.query(`
      create table if not exists public.mobile_scan_command (
        org_id varchar(64) not null,
        worker_login varchar(80) not null,
        client_action_id varchar(128) not null,
        qr_code varchar(128),
        action varchar(40),
        result jsonb,
        created_at timestamptz not null default now(),
        primary key (org_id, worker_login, client_action_id)
      )
    `)
    await client.query('release savepoint mobile_workflow_tables')
    mobileWorkflowTablesReady = true
  } catch (error) {
    if (savepointCreated) {
      try {
        await client.query('rollback to savepoint mobile_workflow_tables')
        await client.query('release savepoint mobile_workflow_tables')
      } catch {
        // Ignore optional-table cleanup errors.
      }
    }
    console.warn(`[mobile/workflow] optional runtime tables unavailable: ${normalizeText(error?.message).slice(0, 200)}`)
    mobileWorkflowTablesReady = false
  }
  return mobileWorkflowTablesReady
}

async function assertMobileRequester(client, orgId, decodedToken) {
  const membership = await getRequesterMembership(client, orgId, normalizeText(decodedToken?.uid))
  if (!membership) {
    const error = new Error('MOBILE_ORG_FORBIDDEN')
    error.statusCode = 403
    error.publicCode = 'FORBIDDEN'
    error.publicMessage = 'Brak dostepu do tej organizacji.'
    throw error
  }
  return membership
}

async function resolveMobileWorker(client, orgId, body, decodedToken, membership) {
  const uid = normalizeText(decodedToken?.uid)
  const email = normalizeEmail(decodedToken?.email)
  const membershipWorkerId = normalizeText(
    membership?.worker_id ??
      membership?.membership_worker_id ??
      membership?.workerId,
  )
  const result = await client.query(
    `select login, worker_id, full_name, login_email, email, auth_uid, role, worker_type, active
       from public.worker
      where org_id = $1
        and (
          (nullif($2::text, '') is not null and auth_uid = $2::text)
          or (nullif($3::text, '') is not null and upper(coalesce(worker_id, '')) = upper($3::text))
          or (
            nullif($4::text, '') is not null
            and (
              lower(coalesce(login_email, '')) = lower($4::text)
              or lower(coalesce(email, '')) = lower($4::text)
              or lower(login) = lower($4::text)
            )
          )
        )
      order by login asc`,
    [orgId, uid, membershipWorkerId, email],
  )

  const row = resolveAuthenticatedMobileWorker({
    rows: result.rows,
    tokenUid: uid,
    tokenEmail: email,
    membershipWorkerId,
    requestedWorkerId: body?.workerId,
    requestedLogin: body?.workerLogin ?? body?.login,
  })
  if (row.active === false) {
    const error = new Error('MOBILE_WORKER_INACTIVE')
    error.statusCode = 403
    error.publicCode = 'WORKER_INACTIVE'
    error.publicMessage = 'Konto pracownika jest nieaktywne.'
    throw error
  }

  return {
    login: normalizeText(row.login),
    workerId: normalizeText(row.worker_id),
    name: normalizeText(row.full_name || row.login),
    role: normalizeRequesterRole(row.role || row.worker_type) || 'WORKER',
    type: normalizeText(row.worker_type || row.role || 'WORKER'),
  }
}

async function readPublishedMobileJobCards(client, orgId, worker) {
  const schemaResult = await client.query(
    `select to_regclass('public.job_card_revision') is not null as revision_ready`,
  )
  if (schemaResult.rows[0]?.revision_ready !== true) {
    const error = new Error('JOB_CARD_SCHEMA_MISSING')
    error.statusCode = 503
    error.publicCode = 'JOB_CARD_SCHEMA_MISSING'
    error.publicMessage = 'Moduł opublikowanych Kart Zleceń nie jest jeszcze gotowy.'
    throw error
  }
  const identities = [...new Set([worker?.workerId, worker?.login].map((value) => normalizeText(value).toLowerCase()).filter(Boolean))]
  const result = await client.query(
    `with latest as (
       select distinct on (r.source_order_id)
              r.source_order_id,
              r.revision,
              r.revision_id,
              r.published_at,
              r.mobile_projection,
              r.payload
         from public.job_card_revision r
        where r.org_id = $1
        order by r.source_order_id, r.revision desc
     )
     select latest.*,
            assignment.assignment_role
       from latest
       join public.task t
         on t.org_id = $1
        and t.id_task = latest.source_order_id
       join lateral (
         select upper(coalesce(item->>'role', 'WORKER')) as assignment_role
           from jsonb_array_elements(coalesce(latest.payload #> '{fulfillment,assignments}', '[]'::jsonb)) item
          where lower(coalesce(item->>'workerId', '')) = any($2::text[])
          limit 1
      ) assignment on true
      where upper(coalesce(t.lifecycle_status, 'ACTIVE')) = 'ACTIVE'
        and case
              when t.date_ymd ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then t.date_ymd::date
              else null
            end >= (current_date - interval '1 day')::date
      order by t.date_ymd asc, t.start_time asc, latest.source_order_id asc`,
    [orgId, identities],
  )
  return result.rows.map((row) => {
    const projections = portalScheduleOrderJsonValue(row.mobile_projection, {})
    const assignmentRole = normalizeText(row.assignment_role).toUpperCase()
    const projectionKey = ['LEADER', 'DRIVER'].includes(assignmentRole) ? assignmentRole.toLowerCase() : 'worker'
    return {
      card: projections?.[projectionKey] || projections?.worker || null,
      publishedAt: row.published_at,
      revision: Number(row.revision || 0),
      revisionId: normalizeText(row.revision_id),
      sourceOrderId: normalizeText(row.source_order_id),
    }
  }).filter((entry) => entry.card)
}

async function fetchMobileZones(client, orgId) {
  const result = await client.query(
    `select z.id as zone_id, z.client_id, z.zone as zone_name, z.function as function_name, z.location,
            c.name as client_name
       from public.zone z
       left join public.client c on c.org_id = z.org_id and c.client_id = z.client_id
      where z.org_id = $1
      order by z.id asc`,
    [orgId],
  )
  return result.rows.map(mapMobileZoneRow).filter(Boolean)
}

async function findMobileZoneByQr(client, orgId, qrCode) {
  const code = normalizeMobileQr(qrCode)
  const compact = compactMobileKey(code)
  const result = await client.query(
    `select z.id as zone_id, z.client_id, z.zone as zone_name, z.function as function_name, z.location,
            c.name as client_name
       from public.zone z
       left join public.client c on c.org_id = z.org_id and c.client_id = z.client_id
      where z.org_id = $1
        and (
          lower(z.id) = lower($2)
          or regexp_replace(lower(z.id), '[^a-z0-9]+', '', 'g') = $3
        )
      order by z.id asc`,
    [orgId, code, compact],
  )
  return mapMobileZoneRow(resolveMobileZoneQrRows(result.rows, code))
}

async function fetchMobileOpenWorkdayState(client, orgId, workerLogin) {
  const result = await client.query(
    `select w.*,
            case
              when (w.start_at at time zone 'Europe/Warsaw')::date = (now() at time zone 'Europe/Warsaw')::date then 'TODAY'
              when (w.start_at at time zone 'Europe/Warsaw')::date < (now() at time zone 'Europe/Warsaw')::date then 'PRIOR'
              else 'FUTURE'
            end as business_day_relation,
            ((w.start_at at time zone 'Europe/Warsaw')::date = (now() at time zone 'Europe/Warsaw')::date) as is_today_warsaw
       from public.workday w
      where org_id = $1
       and lower(btrim(worker_login)) = lower(btrim($2))
       and upper(btrim(coalesce(status, 'RUNNING'))) <> 'CLOSED'
       and end_at is null
        and (
          ((w.start_at at time zone 'Europe/Warsaw')::date = (now() at time zone 'Europe/Warsaw')::date)
          or w.start_at is null
        )
      order by start_at desc nulls last, updated_at desc nulls last
      limit 2
      for update`,
    [orgId, workerLogin],
  )
  return resolveOpenWorkdayState(result.rows)
}

async function fetchMobileWorkdays(client, orgId, workerLogin) {
  const result = await client.query(
    `select *
       from public.workday
      where org_id = $1
        and lower(worker_login) = lower($2)
      order by start_at desc nulls last, updated_at desc nulls last
      limit 120`,
    [orgId, workerLogin],
  )
  return result.rows.map(mapMobileWorkdayRow).filter(Boolean)
}

async function fetchOpenMobileCycles(client, orgId, workerLogin) {
  const result = await client.query(
    `select e.*, z.zone as zone_name, z.function as function_name, z.location, z.client_id, c.name as client_name
       from public.event e
       left join public.zone z on z.org_id = e.org_id and z.id = e.zone_id
       left join public.client c on c.org_id = z.org_id and c.client_id = z.client_id
      where e.org_id = $1
        and lower(btrim(e.worker_login)) = lower(btrim($2))
        and upper(btrim(coalesce(e.status, 'RUNNING'))) <> 'CLOSED'
        and e.end_at is null
        and upper(btrim(coalesce(e.event_type, ''))) = 'CLEAN'
      order by e.start_at desc nulls last, e.updated_at desc nulls last
      limit 20`,
    [orgId, workerLogin],
  )
  return Array.isArray(result.rows) ? result.rows : []
}

async function fetchUnresolvedMobileCycles(client, orgId, workerLogin) {
  const result = await client.query(
    `select e.*, z.zone as zone_name, z.function as function_name, z.location, z.client_id, c.name as client_name
       from public.event e
       left join public.workday w
         on w.org_id = e.org_id
        and w.workday_id = e.workday_id
        and lower(btrim(w.worker_login)) = lower(btrim(e.worker_login))
       left join public.zone z on z.org_id = e.org_id and z.id = e.zone_id
       left join public.client c on c.org_id = z.org_id and c.client_id = z.client_id
      where e.org_id = $1
        and lower(btrim(e.worker_login)) = lower(btrim($2))
        and upper(btrim(coalesce(e.status, 'RUNNING'))) <> 'CLOSED'
        and e.end_at is null
        and nullif(btrim(e.event_type), '') is null
        and (
          w.workday_id is null
          or (
            w.end_at is null
            and upper(btrim(coalesce(w.status, 'RUNNING'))) <> 'CLOSED'
          )
        )
      order by e.start_at desc nulls last, e.updated_at desc nulls last
      limit 20`,
    [orgId, workerLogin],
  )
  return Array.isArray(result.rows) ? result.rows : []
}

function partitionMobileUnresolvedCycles(rows = [], activeWorkdayId = '') {
  const normalizedActiveWorkdayId = normalizeText(activeWorkdayId)
  const blocking = []
  const prior = []

  for (const row of Array.isArray(rows) ? rows : []) {
    const rowWorkdayId = normalizeText(row?.workday_id ?? row?.workdayId)
    if (!rowWorkdayId || (normalizedActiveWorkdayId && rowWorkdayId === normalizedActiveWorkdayId)) {
      blocking.push(row)
    } else {
      prior.push(row)
    }
  }

  return { blocking, prior }
}

async function fetchMobileCycleHistory(client, orgId, workerLogin) {
  const result = await client.query(
    `select e.*, z.zone as zone_name, z.function as function_name, z.location, z.client_id, c.name as client_name
       from public.event e
       left join public.zone z on z.org_id = e.org_id and z.id = e.zone_id
       left join public.client c on c.org_id = z.org_id and c.client_id = z.client_id
      where e.org_id = $1
        and lower(e.worker_login) = lower($2)
      order by e.start_at desc nulls last, e.updated_at desc nulls last
      limit 120`,
    [orgId, workerLogin],
  )
  return result.rows.map(mapMobileEventRow).filter(Boolean)
}

async function fetchActiveMobilePause(client, orgId, workerLogin, workdayId) {
  if (!workdayId) return null
  if (!(await databaseRelationExists(client, 'public.workday_pause'))) return null
  let result
  let savepointCreated = false
  try {
    await client.query('savepoint mobile_pause_lookup')
    savepointCreated = true
    result = await client.query(
      `select *
         from public.workday_pause
        where org_id = $1
          and lower(coalesce(worker_login, '')) = lower($2)
          and workday_id = $3
          and coalesce(status, 'RUNNING') <> 'CLOSED'
          and stop_at is null
        order by start_at desc nulls last, updated_at desc nulls last
        limit 1`,
      [orgId, workerLogin, workdayId],
    )
    await client.query('release savepoint mobile_pause_lookup')
  } catch (error) {
    if (savepointCreated) {
      try {
        await client.query('rollback to savepoint mobile_pause_lookup')
        await client.query('release savepoint mobile_pause_lookup')
      } catch {
        // Ignore optional pause cleanup errors.
      }
    }
    if (isPostgresMissingRelationError(error)) {
      return null
    }
    throw error
  }
  const row = result.rows[0]
  if (!row) return null
  return {
    pauseId: normalizeText(row.pause_id),
    workdayId: normalizeText(row.workday_id),
    workerLogin: normalizeText(row.worker_login),
    workerName: normalizeText(row.worker_name),
    startAt: mobileIso(row.start_at),
    stopAt: mobileIso(row.stop_at),
    durationSec: Number.isFinite(Number(row.duration_sec)) ? Number(row.duration_sec) : 0,
    status: normalizeText(row.status) || 'RUNNING',
  }
}

function buildMobileWorkdayEvents(workdays) {
  const events = []
  for (const workday of workdays || []) {
    if (workday.startAt) {
      events.push({ type: 'START', at: workday.startAt, label: 'START', workdayId: workday.workdayId })
    }
    if (workday.endAt) {
      events.push({ type: 'STOP', at: workday.endAt, label: 'STOP', workdayId: workday.workdayId })
    }
  }
  return events.sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime())
}

function buildMobileSummary(activeWorkday) {
  const now = new Date()
  return {
    todaySeconds: activeWorkday && isMobileWorkdayOpen(activeWorkday) ? mobileElapsedSec(activeWorkday.start_at, now) : 0,
    todayStart: activeWorkday?.start_at ? mobileIso(activeWorkday.start_at).slice(11, 16) : '--:--',
    todayStop: activeWorkday?.end_at ? mobileIso(activeWorkday.end_at).slice(11, 16) : '--:--',
    activeSeconds: activeWorkday && isMobileWorkdayOpen(activeWorkday) ? mobileElapsedSec(activeWorkday.start_at, now) : 0,
  }
}

async function upsertMobileRuntimeState(client, orgId, worker, activeWorkday, activeCycle) {
  if (!(await ensureMobileWorkflowTables(client))) return
  let savepointCreated = false
  try {
    await client.query('savepoint mobile_runtime_state')
    savepointCreated = true
    await client.query(
      `insert into public.worker_runtime_state (
         org_id, worker_login, worker_name, active_workday_id, workday_start_at,
         active_event_id, active_zone_id, zone_start_at, status, version, updated_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,now())
       on conflict (org_id, worker_login) do update set
         worker_name = excluded.worker_name,
         active_workday_id = excluded.active_workday_id,
         workday_start_at = excluded.workday_start_at,
         active_event_id = excluded.active_event_id,
         active_zone_id = excluded.active_zone_id,
         zone_start_at = excluded.zone_start_at,
         status = excluded.status,
         version = public.worker_runtime_state.version + 1,
         updated_at = now()`,
      [
        orgId,
        worker.login,
        worker.name,
        activeWorkday?.workday_id || null,
        activeWorkday?.start_at || null,
        activeCycle?.event_id || null,
        activeCycle?.zone_id || null,
        activeCycle?.start_at || null,
        activeWorkday ? 'RUNNING' : 'IDLE',
      ],
    )
    await client.query('release savepoint mobile_runtime_state')
  } catch (error) {
    if (savepointCreated) {
      try {
        await client.query('rollback to savepoint mobile_runtime_state')
        await client.query('release savepoint mobile_runtime_state')
      } catch {
        // Ignore optional runtime-state cleanup errors.
      }
    }
    if (isPostgresMissingRelationError(error)) {
      console.warn(`[mobile/workflow] runtime state unavailable: ${normalizeText(error?.message).slice(0, 200)}`)
      return
    }
    throw error
  }
}

async function buildMobileSnapshotFromDb(client, orgId, worker) {
  const zones = await fetchMobileZones(client, orgId)
  const openWorkdayState = await fetchMobileOpenWorkdayState(client, orgId, worker.login)
  const activeWorkdayRaw = openWorkdayState.activeWorkday
  const workdays = await fetchMobileWorkdays(client, orgId, worker.login)
  const cycleHistory = await fetchMobileCycleHistory(client, orgId, worker.login)
  const availableEventColumns = await readPublicEventColumns(client)
  const eventTypeReadable = availableEventColumns.has('event_type')
  const openCycleRows = eventTypeReadable
    ? await fetchOpenMobileCycles(client, orgId, worker.login)
    : []
  const unresolvedCycleRows = eventTypeReadable
    ? await fetchUnresolvedMobileCycles(client, orgId, worker.login)
    : []
  let activeCycleRaw = null
  let priorOpenCycleRows = []
  let priorUnresolvedCycleRows = []
  let openCycleIntegrity = eventTypeReadable
    ? null
    : {
        code: 'MOBILE_CORRELATION_SCHEMA_INCOMPLETE',
        message: 'Status CLEAN jest niedostępny do czasu wdrożenia jawnego event_type. START i STOP pozostają dostępne.',
      }
  if (eventTypeReadable) {
    try {
      const unresolvedState = partitionMobileUnresolvedCycles(
        unresolvedCycleRows,
        activeWorkdayRaw?.workday_id,
      )
      priorUnresolvedCycleRows = unresolvedState.prior
      assertNoUnresolvedOpenEvents(unresolvedState.blocking)
      const openCycleState = resolveOpenCycleState(openCycleRows, activeWorkdayRaw?.workday_id)
      activeCycleRaw = openCycleState.activeCycle
      priorOpenCycleRows = openCycleState.staleCycles
    } catch (error) {
      if (Number(error?.statusCode) !== 409) {
        throw error
      }
      openCycleIntegrity = {
        code: normalizeText(error?.publicCode) || 'OPEN_CLEAN_INTEGRITY_CONFLICT',
        message: normalizeText(error?.publicMessage) || 'Wykryto niespojne otwarte statusy CLEAN.',
        ...(error?.publicDetails && typeof error.publicDetails === 'object' ? error.publicDetails : {}),
      }
    }
  }
  const activePause = await fetchActiveMobilePause(client, orgId, worker.login, activeWorkdayRaw?.workday_id)
  await upsertMobileRuntimeState(client, orgId, worker, activeWorkdayRaw, activeCycleRaw)

  const activeWorkday = mapMobileWorkdayRow(activeWorkdayRaw)
  const activeCycle = mapMobileEventRow(activeCycleRaw)
  const staleOpenWorkdays = openWorkdayState.staleWorkdays.map(mapMobileWorkdayRow).filter(Boolean)
  const staleOpenCycles = priorOpenCycleRows.map(mapMobileEventRow).filter(Boolean)
  const unresolvedPriorCycles = priorUnresolvedCycleRows.map(mapMobileEventRow).filter(Boolean)
  const repairRequired = {
    required: Boolean(
      staleOpenWorkdays.length ||
      staleOpenCycles.length ||
      unresolvedPriorCycles.length ||
      openCycleIntegrity
    ),
    blockStart: false,
    workdayCount: staleOpenWorkdays.length,
    cleanEventCount: staleOpenCycles.length,
    unresolvedEventCount: unresolvedPriorCycles.length,
    workdays: staleOpenWorkdays,
    cleanEvents: staleOpenCycles,
    unresolvedEvents: unresolvedPriorCycles,
    integrity: openCycleIntegrity,
  }
  return {
    orgId,
    worker,
    zones,
    stopRules: zones.filter((zone) => zone.kind === 'STOP').map((zone) => ({
      roomId: zone.id,
      graceMin: zone.stopGraceMin,
      label: zone.name || zone.id,
    })),
    startZone: zones.find((zone) => zone.kind === 'START') || null,
    activeWorkday,
    staleOpenWorkday: staleOpenWorkdays[0] || null,
    repairRequired,
    activePause,
    pauseTotalSec: Number(activeWorkday?.pauseTotalSec || 0),
    activeCycle,
    openCycleIntegrity,
    summary: buildMobileSummary(activeWorkdayRaw),
    workdayEvents: buildMobileWorkdayEvents(workdays),
    workdays,
    cycleHistory,
  }
}

async function closeMobileEvent(client, orgId, eventRow, reason, endAt = new Date(), comment = '', gpsText = '') {
  if (!eventRow?.event_id) return null
  const durationSec = mobileElapsedSec(eventRow.start_at, endAt)
  const nextComment = appendMobileComment(appendMobileComment(eventRow.comment, comment), gpsText)
  const result = await client.query(
    `update public.event
        set end_at = $4,
            duration_sec = $5,
            status = 'CLOSED',
            close_marked_at = $4,
            end_reason = $6,
            comment = coalesce(nullif($7, ''), comment),
            updated_at = now()
      where org_id = $1 and event_id = $2 and worker_login = $3
      returning *`,
    [orgId, eventRow.event_id, eventRow.worker_login, endAt, durationSec, reason || 'CYCLE_STOP', nextComment],
  )
  return result.rows[0] ?? null
}

async function closeMobileOpenCycles(client, orgId, workerLogin, workdayId, reason, endAt = new Date(), comment = '', gpsText = '', options = {}) {
  const gpsSpecialOnly = options?.gpsSpecialOnly === true
  const result = await client.query(
    `select e.*, z.function as function_name
       from public.event e
       left join public.zone z on z.org_id = e.org_id and z.id = e.zone_id
      where e.org_id = $1
        and lower(btrim(e.worker_login)) = lower(btrim($2))
        and e.workday_id = $3
        and upper(btrim(coalesce(e.status, 'RUNNING'))) <> 'CLOSED'
        and e.end_at is null
      order by e.start_at asc nulls last`,
    [orgId, workerLogin, workdayId],
  )
  const closed = []
  for (const row of result.rows) {
    const rowGpsText = gpsSpecialOnly && !isMobileSpecialEventRow(row) ? '' : gpsText
    const updated = await closeMobileEvent(client, orgId, row, reason, endAt, comment, rowGpsText)
    if (updated) closed.push(updated)
  }
  return closed
}

async function createMobileWorkday(client, orgId, worker, zone, startedAt = new Date(), gpsText = '') {
  const workdayId = makeMobileId('WD')
  const result = await client.query(
    `insert into public.workday (
       org_id, workday_id, worker_login, worker_name, utility_room_id,
       start_at, end_at, duration_sec, status, gps, start_object, comment, updated_by, created_at, updated_at
     ) values ($1,$2,$3,$4,$5,$6,null,0,'RUNNING',$7,$8,$9,$10,now(),now())
     returning *`,
    [
      orgId,
      workdayId,
      worker.login,
      worker.name,
      zone?.id || null,
      startedAt,
      fitMobileGpsColumn(gpsText),
      zone?.id || null,
      zone?.id ? `QR START ${zone.id}` : 'QR START',
      worker.login,
    ],
  )
  return result.rows[0]
}

async function createMobileCycle(client, orgId, worker, workday, zone, startedAt = new Date(), comment = '', gpsText = '') {
  const eventId = makeMobileId('EV')
  const eventComment = appendMobileComment(comment, gpsText)
  const occurrenceDateYmd = warsawOccurrenceDateYmd(startedAt)
  const rawTaskPlans = await readRawTaskPlansForOrganization(client, orgId)
  const correlation = correlateCleanStartToPlan({
    cleanStart: {
      orgId,
      workerId: worker.workerId,
      workerLogin: worker.login,
      occurrenceDateYmd,
      clientId: zone.clientId,
      zoneId: zone.id,
      scannedAt: startedAt,
      timeZone: 'Europe/Warsaw',
    },
    tasks: rawTaskPlans,
  })

  return insertMobileCleanEvent(
    client,
    {
      orgId,
      eventId,
      workdayId: workday.workday_id,
      zoneId: zone.id,
      workerLogin: worker.login,
      workerName: worker.name,
      startedAt,
      comment: eventComment,
    },
    correlation,
  )
}

function assertMobileCorrelationEnabled(worker) {
  const rollout = mobileCorrelationRolloutDecision({
    enabled: process.env.MOBILE_SERVICE_EXECUTION_CORRELATION_ENABLED,
    canaryWorkerIds: process.env.MOBILE_SERVICE_EXECUTION_CORRELATION_CANARY_WORKER_IDS,
    worker,
  })
  if (!rollout.allowed) {
    const error = new Error('MOBILE_CORRELATION_NOT_ENABLED')
    error.statusCode = 503
    error.publicCode =
      rollout.reason === 'CANARY_RESTRICTED'
        ? 'MOBILE_CORRELATION_CANARY_RESTRICTED'
        : 'MOBILE_CORRELATION_NOT_ENABLED'
    error.publicMessage =
      'Mobilny zapis CLEAN jest chwilowo wstrzymany do czasu kontrolowanego uruchomienia korelacji z planem.'
    throw error
  }
}

async function assertMobileCorrelationSchemaReady(client) {
  const availableColumns = await readPublicEventColumns(client)
  const schema = eventCorrelationSchema(availableColumns)
  if (schema.supported) {
    return
  }

  const error = new Error('MOBILE_CORRELATION_SCHEMA_INCOMPLETE')
  error.statusCode = 503
  error.publicCode = 'MOBILE_CORRELATION_SCHEMA_INCOMPLETE'
  error.publicMessage =
    'Mobilny zapis CLEAN jest chwilowo wstrzymany, ponieważ baza nie ma kompletnego modelu korelacji. Najpierw trzeba wdrożyć migrację schematu.'
  error.publicDetails = {
    missingColumns: schema.missingColumns,
  }
  throw error
}

async function closeMobileWorkday(client, orgId, workday, stopZone, endAt = new Date(), comment = '', gpsText = '') {
  const durationSec = mobileElapsedSec(workday.start_at, endAt)
  const nextComment = appendMobileComment(workday.comment, comment)
  const nextGps = mergeMobileGpsColumn(workday.gps, gpsText)
  const result = await client.query(
    `update public.workday
        set end_at = $4,
            duration_sec = $5,
            status = 'CLOSED',
            stop_object = $6,
            end_event_id = null,
            comment = coalesce(nullif($7, ''), comment),
            gps = coalesce(nullif($9, ''), gps),
            updated_at = now(),
            updated_by = $8
      where org_id = $1 and workday_id = $2 and worker_login = $3
      returning *`,
    [
      orgId,
      workday.workday_id,
      workday.worker_login,
      endAt,
      durationSec,
      stopZone?.id || null,
      nextComment,
      workday.worker_login,
      nextGps,
    ],
  )
  return result.rows[0] ?? null
}

async function storeMobileScanCommand(client, orgId, workerLogin, clientActionId, qrCode, action, resultPayload) {
  if (!clientActionId || !(await ensureMobileWorkflowTables(client))) return
  let savepointCreated = false
  try {
    await client.query('savepoint mobile_scan_command_store')
    savepointCreated = true
    await client.query(
      `insert into public.mobile_scan_command (org_id, worker_login, client_action_id, qr_code, action, result)
       values ($1,$2,$3,$4,$5,$6::jsonb)
       on conflict (org_id, worker_login, client_action_id) do nothing`,
      [orgId, workerLogin, clientActionId, qrCode, action, JSON.stringify(resultPayload)],
    )
    await client.query('release savepoint mobile_scan_command_store')
  } catch (error) {
    if (savepointCreated) {
      try {
        await client.query('rollback to savepoint mobile_scan_command_store')
        await client.query('release savepoint mobile_scan_command_store')
      } catch {
        // Ignore optional command-cache cleanup errors.
      }
    }
    if (isPostgresMissingRelationError(error)) {
      console.warn(`[mobile/workflow] scan command store unavailable: ${normalizeText(error?.message).slice(0, 200)}`)
      return
    }
    throw error
  }
}

async function readMobileScanCommand(client, orgId, workerLogin, clientActionId) {
  if (!clientActionId || !(await ensureMobileWorkflowTables(client))) return null
  let result
  let savepointCreated = false
  try {
    await client.query('savepoint mobile_scan_command_read')
    savepointCreated = true
    result = await client.query(
      `select result
         from public.mobile_scan_command
        where org_id = $1 and worker_login = $2 and client_action_id = $3
        limit 1`,
      [orgId, workerLogin, clientActionId],
    )
    await client.query('release savepoint mobile_scan_command_read')
  } catch (error) {
    if (savepointCreated) {
      try {
        await client.query('rollback to savepoint mobile_scan_command_read')
        await client.query('release savepoint mobile_scan_command_read')
      } catch {
        // Ignore optional command-cache cleanup errors.
      }
    }
    if (isPostgresMissingRelationError(error)) {
      console.warn(`[mobile/workflow] scan command read unavailable: ${normalizeText(error?.message).slice(0, 200)}`)
      return null
    }
    throw error
  }
  return result.rows[0]?.result || null
}

async function processMobileWorkflowScan(client, orgId, worker, body) {
  const qrCode = normalizeMobileQr(body?.qrCode || body?.code)
  if (!qrCode) {
    const error = new Error('MOBILE_QR_MISSING')
    error.statusCode = 400
    error.publicCode = 'QR_MISSING'
    error.publicMessage = 'Brak kodu QR.'
    throw error
  }

  const clientActionId = normalizeText(body?.clientActionId).slice(0, 128)
  const existingResult = await readMobileScanCommand(client, orgId, worker.login, clientActionId)
  if (existingResult) {
    return { ...existingResult, idempotent: true }
  }

  const scannedAt = resolveAuthoritativeMobileScanAt({ serverNow: new Date() })
  const comment = normalizeText(body?.comment)
  const zone = await findMobileZoneByQr(client, orgId, qrCode)
  if (!zone) {
    const error = new Error('MOBILE_ZONE_NOT_FOUND')
    error.statusCode = 404
    error.publicCode = 'ZONE_NOT_FOUND'
    error.publicMessage = 'Nie znaleziono kodu QR w bazie stref.'
    throw error
  }

  const openWorkdayState = await fetchMobileOpenWorkdayState(client, orgId, worker.login)
  let activeWorkday = openWorkdayState.activeWorkday
  let activeCycle = null
  let action = 'NOOP'
  let message = 'Brak zmian.'
  const scanGpsData = normalizeMobileGpsData(body?.gpsData ?? body?.clientGps ?? body?.gps ?? body?.location)
  const scanGpsNote = (actionLabel, allowed = true) => (allowed ? mobileGpsColumnValue(scanGpsData, actionLabel) : '')
  const requireScanGps = (actionLabel, required = true) => {
    if (!required || scanGpsData) {
      return
    }
    throw createMobileGpsRequiredError(actionLabel, zone)
  }

  if (zone.kind === 'START') {
    if (!activeWorkday) {
      requireScanGps('START')
      activeWorkday = await createMobileWorkday(client, orgId, worker, zone, scannedAt, scanGpsNote('START'))
      action = 'START_WORKDAY'
      message = 'Zapisano na serwerze. Rozpoczeto dzien pracy.'
    } else {
      action = 'NOOP'
      message = 'Dzien pracy jest juz aktywny.'
    }
  } else if (zone.kind === 'STOP') {
    if (!activeWorkday) {
      const error = new Error('MOBILE_WORKDAY_NOT_ACTIVE')
      error.statusCode = 409
      error.publicCode = 'WORKDAY_NOT_ACTIVE'
      error.publicMessage = 'Brak aktywnego dnia pracy. Najpierw zeskanuj START.'
      throw error
    }
    await closeMobileOpenCycles(
      client,
      orgId,
      worker.login,
      activeWorkday.workday_id,
      'STOP_END_DAY',
      scannedAt,
      comment,
      '',
    )
    const graceMs = Math.max(0, Number(zone.stopGraceMin || 0)) * 60 * 1000
    const endAt = new Date(scannedAt.getTime() + graceMs)
    await closeMobileWorkday(client, orgId, activeWorkday, zone, endAt, comment, '')
    action = 'STOP_WORKDAY'
    message = graceMs > 0
      ? `Zapisano na serwerze. Zakonczono dzien pracy. Doliczono ${zone.stopGraceMin} min.`
      : 'Zapisano na serwerze. Zakonczono dzien pracy.'
  } else {
    await assertMobileCorrelationSchemaReady(client)
    if (!activeWorkday) {
      if (!mobileZoneAllowsAutoWorkday(zone)) {
        const error = new Error('MOBILE_WORKDAY_NOT_ACTIVE')
        error.statusCode = 409
        error.publicCode = 'WORKDAY_NOT_ACTIVE'
        error.publicMessage = 'Brak aktywnego dnia pracy. Najpierw zeskanuj START.'
        throw error
      }
      const startsIndividualOrder = zone.kind === 'INDIVIDUAL'
      assertMobileCorrelationEnabled(worker)
      activeWorkday = await createMobileWorkday(
        client,
        orgId,
        worker,
        zone,
        scannedAt,
        scanGpsNote('CLEAN_START', startsIndividualOrder),
      )
    }

    const unresolvedCycleRows = await fetchUnresolvedMobileCycles(client, orgId, worker.login)
    const unresolvedCycleState = partitionMobileUnresolvedCycles(
      unresolvedCycleRows,
      activeWorkday?.workday_id,
    )
    assertNoUnresolvedOpenEvents(unresolvedCycleState.blocking)
    const openCycleRows = await fetchOpenMobileCycles(client, orgId, worker.login)
    activeCycle = resolveOpenCycleState(openCycleRows, activeWorkday?.workday_id).activeCycle

    if (activeCycle && isMobileEventOpen(activeCycle)) {
      if (normalizeText(activeCycle.zone_id).toLowerCase() === normalizeText(zone.id).toLowerCase()) {
        await closeMobileEvent(client, orgId, activeCycle, 'QR_SAME', scannedAt, comment, '')
        action = 'CLOSE_ZONE'
        message = 'Zapisano na serwerze. Zakonczono sprzatanie tej strefy.'
        if (body?.closeWorkdayImmediately) {
          await closeMobileWorkday(client, orgId, activeWorkday, zone, scannedAt, comment, '')
          action = 'CLOSE_ZONE_AND_WORKDAY'
          message = 'Zapisano na serwerze. Zakonczono strefe i dzien pracy.'
        }
      } else {
        const startsIndividualOrder = zone.kind === 'INDIVIDUAL'
        requireScanGps('CLEAN_START', startsIndividualOrder)
        assertMobileCorrelationEnabled(worker)
        await closeMobileEvent(
          client,
          orgId,
          activeCycle,
          'QR_SWITCH',
          scannedAt,
          comment,
          '',
        )
        await createMobileCycle(
          client,
          orgId,
          worker,
          activeWorkday,
          zone,
          scannedAt,
          comment,
          scanGpsNote('CLEAN_START', startsIndividualOrder),
        )
        action = 'SWITCH_ZONE'
        message = `Zapisano na serwerze. Zmiana strefy na: ${zone.name || zone.id}.`
      }
    } else {
      const startsIndividualOrder = zone.kind === 'INDIVIDUAL'
      requireScanGps('CLEAN_START', startsIndividualOrder)
      assertMobileCorrelationEnabled(worker)
      await createMobileCycle(
        client,
        orgId,
        worker,
        activeWorkday,
        zone,
        scannedAt,
        comment,
        scanGpsNote('CLEAN_START', startsIndividualOrder),
      )
      action = 'START_ZONE'
      message = `Zapisano na serwerze. Rozpoczeto sprzatanie: ${zone.name || zone.id}.`
    }
  }

  const snapshot = await buildMobileSnapshotFromDb(client, orgId, worker)
  const resultPayload = {
    ok: true,
    action,
    message,
    snapshot,
    serverAt: new Date().toISOString(),
  }
  await storeMobileScanCommand(client, orgId, worker.login, clientActionId, qrCode, action, resultPayload)
  return resultPayload
}

function mapMobileIntegrityDatabaseError(error) {
  const dbCode = normalizeText(error?.code).toUpperCase()
  const constraint = normalizeText(error?.constraint)
  const message = normalizeText(error?.message).toUpperCase()

  if (
    dbCode === '23505' &&
    (
      constraint === 'event_single_open_clean_per_worker' ||
      constraint === 'event_single_open_clean_per_workday' ||
      message.includes('OPEN_CLEAN_EVENT_EXISTS')
    )
  ) {
    return {
      status: 409,
      code: 'OPEN_CLEAN_EVENT_EXISTS',
      message: 'Pracownik ma już otwarty status CLEAN. Najpierw uzupełnij STOP albo rozstrzygnij konflikt.',
    }
  }

  if (
    dbCode === '23505' &&
    (
      constraint === 'workday_single_open_per_worker' ||
      constraint === 'workday_single_open_per_worker_day' ||
      message.includes('OPEN_WORKDAY_EXISTS')
    )
  ) {
    return {
      status: 409,
      code: 'OPEN_WORKDAY_EXISTS',
      message: 'Pracownik ma już otwarty dzień pracy. Najpierw uzupełnij STOP.',
    }
  }

  if (dbCode === '23514' && message.includes('OPEN_EVENT_TYPE_REQUIRED')) {
    return {
      status: 409,
      code: 'OPEN_EVENT_TYPE_REQUIRED',
      message: 'Nie można zapisać otwartego zdarzenia bez jawnego typu. Wymagana jest weryfikacja danych.',
    }
  }

  if (dbCode === '23514' && message.includes('OPEN_EVENT_WORKER_REQUIRED')) {
    return {
      status: 409,
      code: 'OPEN_EVENT_WORKER_REQUIRED',
      message: 'Nie można zapisać otwartego CLEAN bez jednoznacznie przypisanego pracownika.',
    }
  }

  if (dbCode === '23514' && message.includes('OPEN_WORKDAY_WORKER_REQUIRED')) {
    return {
      status: 409,
      code: 'OPEN_WORKDAY_WORKER_REQUIRED',
      message: 'Nie można otworzyć dnia pracy bez jednoznacznie przypisanego pracownika.',
    }
  }

  return null
}

function handleMobileScanStatusRequest(req, res) {
  const headers = withSecurityHeaders({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })

  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers)
    res.end()
    return
  }

  if (req.method !== 'GET') {
    res.writeHead(405, headers)
    res.end(JSON.stringify({
      ok: false,
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Dozwolona metoda to GET.',
      },
    }))
    return
  }

  // The current mobile client treats 501 as an unavailable receipt endpoint
  // and safely replays the exact idempotent POST with the same clientActionId.
  // Owning this route prevents it from leaking into the generic /api proxy.
  res.writeHead(501, headers)
  res.end(JSON.stringify({
    ok: false,
    error: {
      code: 'MOBILE_SCAN_STATUS_UNAVAILABLE',
      message: 'Status skanu nie jest jeszcze udostepniony. Bezpiecznie ponow identyczny zapis.',
    },
  }))
}

async function handleMobileWorkflowRequest(req, res, requestUrl) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, withSecurityHeaders({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }))
    res.end()
    return
  }
  if (req.method !== 'POST') {
    sendMobileApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Dozwolona metoda to POST.')
    return
  }

  let body
  try {
    body = await readJsonBody(req)
  } catch (error) {
    sendMobileApiError(res, error?.message === 'REQUEST_BODY_TOO_LARGE' ? 413 : 400, 'INVALID_JSON', 'Niepoprawny JSON w zadaniu.')
    return
  }

  const token = parseBearerToken(req)
  if (!token) {
    sendMobileApiError(res, 401, 'UNAUTHENTICATED', 'Brak tokenu Firebase.')
    return
  }

  let decodedToken
  try {
    decodedToken = await verifyFirebaseIdToken(token)
  } catch (error) {
    const mapped = mapFirebaseAdminError(error)
    sendMobileApiError(res, mapped.status === 500 ? 500 : 401, mapped.code, mapped.status === 500 ? mapped.message : 'Token Firebase jest niepoprawny albo wygasl.')
    return
  }

  const orgId = normalizeOrgId(body?.orgId)
  if (!orgId) {
    sendMobileApiError(res, 400, 'ORG_ID_MISSING', 'Brak poprawnego orgId.')
    return
  }

  const client = await connectDbClient()
  try {
    await client.query('begin')
    const membership = await assertMobileRequester(client, orgId, decodedToken)
    const worker = await resolveMobileWorker(client, orgId, body, decodedToken, membership)
    await client.query('select pg_advisory_xact_lock(hashtext($1::text), hashtext($2::text))', [orgId, worker.login])

    let payload
    if (requestUrl.pathname === MOBILE_SCAN_PATH) {
      payload = await processMobileWorkflowScan(client, orgId, worker, body)
    } else if (requestUrl.pathname === MOBILE_JOB_CARDS_PATH) {
      payload = {
        jobCards: await readPublishedMobileJobCards(client, orgId, worker),
        ok: true,
        serverAt: new Date().toISOString(),
      }
    } else {
      const snapshot = await buildMobileSnapshotFromDb(client, orgId, worker)
      payload = { ok: true, snapshot, serverAt: new Date().toISOString() }
    }

    await client.query('commit')
    sendMobileJson(res, 200, payload)
  } catch (error) {
    try {
      await client.query('rollback')
    } catch {
      // Ignore rollback errors.
    }
    const dbMapped = mapDatabaseConnectionError(error)
    const integrityMapped = mapMobileIntegrityDatabaseError(error)
    const rawDbCode = normalizeText(error?.code).toUpperCase()
    const rawDbMessage = normalizeText(error?.message).slice(0, 240)
    const diagnosticMessage = rawDbCode && rawDbMessage
      ? `Blad bazy ${rawDbCode}: ${rawDbMessage}`
      : ''
    const status = Number(error?.statusCode || integrityMapped?.status || dbMapped?.status || 500)
    const details = {
      ...(error?.publicDetails && typeof error.publicDetails === 'object' ? error.publicDetails : {}),
      ...(publicErrorDetails(error) || {}),
      ...(rawDbCode ? { dbCode: rawDbCode } : {}),
    }
    sendMobileApiError(
      res,
      Number.isFinite(status) ? status : 500,
      normalizeText(error?.publicCode) || integrityMapped?.code || dbMapped?.code || 'MOBILE_WORKFLOW_ERROR',
      normalizeText(error?.publicMessage) || integrityMapped?.message || dbMapped?.message || diagnosticMessage || 'Nie udalo sie obsluzyc mobilnego workflow.',
      Object.keys(details).length ? details : undefined,
    )
  } finally {
    client.release()
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

async function databaseColumnExists(client, relationName, columnName) {
  const normalizedRelation = normalizeText(relationName)
  const normalizedColumn = normalizeText(columnName)
  if (!normalizedRelation || !normalizedColumn) {
    return false
  }
  const [schemaName, tableName] = normalizedRelation.includes('.')
    ? normalizedRelation.split('.', 2)
    : ['public', normalizedRelation]
  const result = await client.query(
    `select 1
       from information_schema.columns
      where table_schema = $1::text
        and table_name = $2::text
        and column_name = $3::text
      limit 1`,
    [schemaName, tableName, normalizedColumn],
  )
  return result.rowCount > 0
}

async function ensureWorkerIdReservationTable(client) {
  await client.query(
    `create table if not exists public.worker_id_reservation (
       org_id varchar(64) not null,
       worker_number integer not null check (worker_number > 0),
       worker_id varchar(128) not null,
       created_at timestamptz not null default now(),
       created_by_uid varchar(128),
       primary key (org_id, worker_number),
       unique (org_id, worker_id),
       constraint worker_id_reservation_org_fk
         foreign key (org_id)
         references public.organizations (org_id)
         on delete cascade
     )`,
  )
}

async function readWorkerIdSourceRows(client, orgId) {
  const result = await runWorkerProfileDbQuery(
    client,
    'worker-id-source',
    'select worker_id from public.worker where org_id = $1::text',
    [orgId],
  )
  return result.rows
}

async function readWorkerIdReservationRows(client, orgId) {
  if (!(await databaseRelationExists(client, 'public.worker_id_reservation'))) {
    return []
  }
  const result = await runWorkerProfileDbQuery(
    client,
    'worker-id-reservations',
    `select worker_number, worker_id
       from public.worker_id_reservation
      where org_id = $1::text
      order by worker_number asc`,
    [orgId],
  )
  return result.rows
}

async function reserveWorkerIdDirect(client, orgId, workerNumberOverride, createdByUid) {
  await ensureWorkerIdReservationTable(client)
  await client.query('select pg_advisory_xact_lock(hashtext($1::text))', [`worker-id:${orgId}`])

  const [reservations, workers] = await Promise.all([
    readWorkerIdReservationRows(client, orgId),
    readWorkerIdSourceRows(client, orgId),
  ])
  const workerNumber = workerNumberOverride ?? nextWorkerNumber(orgId, reservations, workers)
  if (
    workerNumberOverride !== null &&
    isWorkerNumberAlreadyUsed(orgId, workerNumber, reservations, workers)
  ) {
    throw workerReservationConflictError(workerNumber)
  }

  const workerId = buildWorkerId(orgId, workerNumber)
  try {
    await runWorkerProfileDbQuery(
      client,
      'reserve-worker-id',
      `insert into public.worker_id_reservation (
         org_id,
         worker_number,
         worker_id,
         created_at,
         created_by_uid
       )
       values ($1::text, $2::integer, $3::text, now(), nullif($4::text, ''))`,
      [orgId, workerNumber, workerId, normalizeText(createdByUid)],
    )
  } catch (error) {
    if (isWorkerReservationConflict(error)) {
      throw workerReservationConflictError(workerNumber)
    }
    throw error
  }

  return { workerId, workerNumber }
}

async function getRequesterMembership(client, orgId, uid, options = {}) {
  const platformMembership = await platformRepository.resolvePlatformMembership(client, orgId, uid)
  if (platformMembership) return platformMembership
  const result = await runWorkerProfileDbQuery(
    client,
    'requester-membership',
    `select case
              when nullif(o.owner_worker_id, '') is not null
               and o.owner_worker_id = m.worker_id then 'OWNER'
              else m.role
            end as role,
            m.status,
            m.worker_id,
            o.status as organization_status,
            o.onboarding_status,
            o.deleted_at as organization_deleted_at,
            s.plan_code,
            s.status as subscription_status,
            s.trial_ends_at,
            s.current_period_ends_at
       from public.organization_member m
       join public.organizations o on o.org_id = m.org_id
       left join public.organization_subscription s on s.org_id = m.org_id
      where m.org_id = $1::text
        and m.uid = $2::text
        and m.status = 'ACTIVE'
      limit 1`,
    [orgId, uid],
  )
  const membership = result.rows[0] ?? null
  if (!membership || options.allowOnboarding === true) return membership

  const organizationStatus = normalizeText(membership.organization_status).toUpperCase()
  const onboardingStatus = normalizeText(membership.onboarding_status).toUpperCase()
  const subscriptionAccess = evaluateSubscriptionAccess({
    planCode: membership.plan_code,
    status: membership.subscription_status,
    trialEndsAt: membership.trial_ends_at,
  })
  if (
    !['ACTIVE', 'TRIAL'].includes(organizationStatus)
    || onboardingStatus !== 'COMPLETED'
    || membership.organization_deleted_at
    || !subscriptionAccess.allowed
  ) {
    return null
  }
  return membership
}

async function authorizeWorkdayReconciliation(client, { orgId, uid, write = false }) {
  const membership = await getRequesterMembership(client, orgId, uid)
  assertMembershipPlanCapability(membership, 'timeTracking')
  const role = normalizeRequesterRole(membership?.role)
  if (['ADMIN', 'MANAGER'].includes(role)) {
    return { role, scope: 'ALL', uid }
  }
  if (role === 'COORDINATOR' && write !== true) {
    return { role, scope: 'ALL', uid }
  }
  if (role === 'WORKER' && write !== true) {
    return { role, scope: 'OWN', uid }
  }
  const error = new Error('WORKDAY_RECONCILIATION_FORBIDDEN')
  error.statusCode = membership ? 403 : 404
  error.publicCode = membership ? 'WORKDAY_RECONCILIATION_FORBIDDEN' : 'ORG_ACCESS_MISSING'
  error.publicMessage = membership
    ? 'Brak uprawnien do przegladu lub korekty tego dnia pracy.'
    : 'Brak dostepu do tej organizacji.'
  throw error
}

function assertMembershipPlanCapability(membership, capability) {
  if (!membership) {
    const error = new Error('ORG_ACCESS_MISSING')
    error.statusCode = 404
    error.publicCode = 'ORG_ACCESS_MISSING'
    error.publicMessage = 'Brak dostępu do tej organizacji.'
    throw error
  }
  if (normalizeRoleCode(membership.role) === PLATFORM_ROLE) return membership
  if (!['ACTIVE', 'TRIAL'].includes(normalizeText(membership.organization_status).toUpperCase()) || membership.organization_deleted_at) {
    const error = new Error('ORGANIZATION_UNAVAILABLE')
    error.statusCode = 403
    error.publicCode = 'ORGANIZATION_UNAVAILABLE'
    error.publicMessage = 'Organizacja jest nieaktywna.'
    throw error
  }
  const subscriptionAccess = evaluateSubscriptionAccess({
    planCode: membership.plan_code,
    status: membership.subscription_status,
    trialEndsAt: membership.trial_ends_at,
  })
  if (!subscriptionAccess.allowed) {
    const error = new Error(subscriptionAccess.code)
    error.statusCode = 403
    error.publicCode = subscriptionAccess.code
    error.publicMessage = subscriptionAccess.code === 'TRIAL_INACTIVE'
      ? 'Okres próbny wygasł.'
      : 'Subskrypcja organizacji nie jest aktywna.'
    throw error
  }
  if (!hasPlanCapability(normalizePlanCode(membership.plan_code), capability)) {
    const error = new Error('PLAN_CAPABILITY_REQUIRED')
    error.statusCode = 403
    error.publicCode = 'PLAN_CAPABILITY_REQUIRED'
    error.publicMessage = `Ta funkcja nie jest dostępna w planie ${normalizePlanCode(membership.plan_code)}.`
    error.details = { capability, planCode: normalizePlanCode(membership.plan_code) }
    throw error
  }
  return membership
}

async function getRequesterMemberships(client, uid, orgId = '') {
  const requestedOrgId = normalizeOrgId(orgId)
  const result = await client.query(
    `select
       m.org_id,
       case
         when nullif(o.owner_worker_id, '') is not null
          and o.owner_worker_id = m.worker_id then 'OWNER'
         else m.role
       end as role,
       m.worker_id as membership_worker_id,
       m.status as membership_status,
       m.created_at as membership_created_at,
       o.name as organization_name,
       o.status as organization_status,
       o.onboarding_status,
       o.deleted_at as organization_deleted_at,
       w.worker_id as worker_record_id,
       w.auth_uid as worker_auth_uid,
       w.full_name,
       w.active as worker_active,
       w.status as worker_status,
       w.created_at as worker_created_at,
       s.plan_code,
       s.status as subscription_status,
       s.trial_ends_at,
       s.current_period_ends_at
     from public.organization_member m
     join public.organizations o
       on o.org_id = m.org_id
     left join public.worker w
       on w.org_id = m.org_id
      and w.worker_id = m.worker_id
      and w.auth_uid = m.uid
     left join public.organization_subscription s
       on s.org_id = m.org_id
    where m.uid = $1::text
      and m.status = 'ACTIVE'
      and o.deleted_at is null
      and ($2::text = '' or m.org_id = $2::text)
    order by o.name asc, m.org_id asc`,
    [uid, requestedOrgId],
  )
  return result.rows
}

function profitabilityCapabilities(input) {
  const read = resolveProfitabilityAccess({ ...input, action: 'read' })
  const edit = resolveProfitabilityAccess({ ...input, action: 'edit' })
  return {
    profitabilityModule: {
      enabled: hasPlanCapability(read.planCode, 'profitabilityModule'),
      canRead: read.allowed,
      canEdit: edit.allowed,
      readCode: read.code,
      editCode: edit.code,
    },
  }
}

async function buildOrganizationSessionContext(client, uid, row) {
  const enriched = { ...row }
  if (await databaseRelationExists(client, 'public.profitability_permission')) {
    const permissionResult = await client.query(
      `select permission_code, object_id
         from public.profitability_permission
        where org_id = $1::text
          and uid = $2::text
          and revoked_at is null`,
      [normalizeText(row?.org_id), normalizeText(uid)],
    )
    const codes = new Set(permissionResult.rows.map((entry) => normalizeText(entry.permission_code)))
    const canEdit = codes.has('profitability:edit')
    const canRead = canEdit
      || codes.has('profitability:view-internal')
      || codes.has('profitability:view-client-summary')
      || codes.has('profitability:close-period')
    enriched.is_finance_admin = canEdit
    enriched.profitability_grants = {
      profitabilityModule: canRead || canEdit ? { read: canRead, edit: canEdit } : false,
    }
  }
  const context = buildSessionContext(uid, enriched)
  context.usage = await buildPlanUsage(client, row?.org_id, context.planCode, context.limits)
  return context
}

function numericCount(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0
}

async function buildPlanUsage(client, orgIdValue, planCodeValue, limitsValue = {}) {
  const orgId = normalizeOrgId(orgIdValue)
  const planCode = normalizePlanCode(planCodeValue)
  const limits = limitsValue && typeof limitsValue === 'object' ? limitsValue : {}
  const includedWorkerSlots = numericCount(limits.includedWorkerSlots)
  const workerResult = await client.query(
    `select count(*)::integer as used
       from public.worker
      where org_id = $1::text
        and coalesce(active, true) is true
        and upper(coalesce(status, 'ACTIVE')) <> 'DELETED'`,
    [orgId],
  )
  const workerSlotsUsed = numericCount(workerResult.rows?.[0]?.used)
  const usage = {
    workerSlots: calculateMeteredOverage(workerSlotsUsed, includedWorkerSlots),
    proObjects: {
      applicable: planCode === 'PRO',
      ...calculateMeteredOverage(0, limits.includedProObjects),
    },
    zonesPerProObject: {
      applicable: planCode === 'PRO',
      included: numericCount(limits.includedZonesPerProObject),
      objects: [],
    },
  }

  if (planCode !== 'PRO' || !(await databaseRelationExists(client, 'public.service_object'))) {
    return usage
  }

  const objectResult = await client.query(
    `select object_id
       from public.service_object
      where org_id = $1::text
        and upper(coalesce(status, 'ACTIVE')) = 'ACTIVE'
        and archived_at is null
      order by object_id asc`,
    [orgId],
  )
  const objectIds = objectResult.rows.map((row) => normalizeText(row.object_id)).filter(Boolean)
  Object.assign(usage.proObjects, calculateMeteredOverage(objectIds.length, usage.proObjects.included))

  if (!objectIds.length || !(await databaseColumnExists(client, 'public.zone', 'object_id'))) {
    return usage
  }

  const zoneResult = await client.query(
    `select object_id, count(*)::integer as used
       from public.zone
      where org_id = $1::text
        and object_id = any($2::text[])
      group by object_id
      order by object_id asc`,
    [orgId, objectIds],
  )
  const zonesByObject = new Map(
    zoneResult.rows.map((row) => [normalizeText(row.object_id), numericCount(row.used)]),
  )
  usage.zonesPerProObject.objects = objectIds.map((objectId) => {
    const used = zonesByObject.get(objectId) || 0
    return {
      objectId,
      ...calculateMeteredOverage(used, usage.zonesPerProObject.included),
    }
  })
  return usage
}

async function findExistingWorker(client, orgId, login, email) {
  const result = await runWorkerProfileDbQuery(
    client,
    'find-existing-worker',
    `select login, login_email, email
       from public.worker
      where org_id = $1::text
        and (
          lower(login) = lower($2::text)
          or lower(coalesce(login_email, '')) = lower($3::text)
          or lower(coalesce(email, '')) = lower($3::text)
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

function buildUserPayload(body) {
  const orgId = normalizeOrgId(body?.orgId)
  const email = normalizeEmail(body?.email)
  const displayName = normalizeText(body?.displayName || body?.workerName || body?.name)
  const requestedRole = normalizeWorkerRole(body?.role)
  const role = requestedRole === 'OWNER' ? '' : requestedRole
  const workerType = normalizeWorkerType(body?.workerType)
  const password = normalizeText(body?.password)
  const phone = normalizeText(body?.phone)
  const active = asPayloadBoolean(body?.active, true)
  const photo = normalizeWorkerPhotoPayload(body)
  const rawWorkerNumberOverride = body?.workerNumberOverride
  const hasWorkerNumberOverride =
    rawWorkerNumberOverride !== undefined &&
    rawWorkerNumberOverride !== null &&
    rawWorkerNumberOverride !== ''
  const workerNumberOverride = normalizeWorkerNumber(rawWorkerNumberOverride, { optional: true })

  const validationErrors = []
  if (!orgId) validationErrors.push('Brak poprawnego orgId.')
  if (!email) validationErrors.push('Podaj poprawny email.')
  if (!displayName) validationErrors.push('Podaj imiÄ™ i nazwisko.')
  if (!role) validationErrors.push('Wybierz rolę ADMIN, MANAGER, COORDINATOR albo WORKER.')
  if (password.length < 6) validationErrors.push('HasĹ‚o tymczasowe musi mieÄ‡ co najmniej 6 znakĂłw.')
  if (hasWorkerNumberOverride && workerNumberOverride === null) {
    validationErrors.push(workerNumberOverrideError().publicMessage)
  }

  return {
    value: {
      orgId,
      email,
      displayName,
      role,
      workerType,
      password,
      phone,
      active,
      workerNumberOverride,
      ...photo,
    },
    validationErrors,
  }
}

function normalizeWorkerProfileRole(value) {
  const rawRole = normalizeText(value)
  const role = rawRole.toUpperCase()
  const normalized = rawRole
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  if (role === 'OWNER') {
    return 'OWNER'
  }
  if (role === 'ADMIN' || role === 'ADMINISTRATOR' || role === 'SUPERADMIN' || normalized.includes('admin')) {
    return 'ADMIN'
  }
  if (role === 'MANAGER' || role === 'KIEROWNIK' || normalized.includes('manager') || normalized.includes('kierownik')) {
    return 'MANAGER'
  }
  if (role === 'COORDINATOR' || role === 'KOORDYNATOR' || normalized.includes('koordynator') || normalized.includes('coordinator')) {
    return 'COORDINATOR'
  }
  return 'WORKER'
}

function buildWorkerProfileUpdatePayload(body) {
  const orgId = normalizeOrgId(body?.orgId)
  let login = ''
  let newLogin = ''
  const validationErrors = []

  try {
    login = normalizeLoginLocalPart(body?.login || body?.workerLogin || body?.workerId)
  } catch (error) {
    validationErrors.push(error?.message || 'Podaj poprawny login pracownika.')
  }
  try {
    newLogin = normalizeLoginLocalPart(body?.newLogin || body?.nextLogin || body?.loginNew || login)
  } catch (error) {
    validationErrors.push(error?.message || 'Podaj poprawny nowy login pracownika.')
  }

  const workerId = normalizeText(body?.workerId || body?.id).slice(0, 128)
  const name = normalizeText(body?.name || body?.workerName || body?.fullName).slice(0, 200)
  const email = normalizeEmail(body?.email || body?.loginEmail)
  const phone = normalizeText(body?.phone).slice(0, 80)
  const roleLabel = normalizeText(body?.role || 'WORKER').slice(0, 32)
  const workerType = normalizeWorkerType(body?.workerType)
  const memberRole = normalizeWorkerProfileRole(roleLabel || workerType)
  const active = asPayloadBoolean(body?.active, true)
  const editedBy = normalizeText(body?.editedBy || body?.edit).slice(0, 160)
  const authUid = normalizeText(body?.authUid || body?.uid).slice(0, 128)
  const photo = normalizeWorkerPhotoPayload(body)

  if (!orgId) validationErrors.push('Brak poprawnego orgId.')
  if (!login) validationErrors.push('Brak loginu pracownika.')
  if (!newLogin) validationErrors.push('Podaj poprawny nowy login pracownika.')
  if (!name) validationErrors.push('Podaj imie i nazwisko pracownika.')
  if (!email) validationErrors.push('Podaj poprawny email pracownika.')

  return {
    value: {
      orgId,
      login,
      newLogin,
      workerId,
      name,
      email,
      phone,
      roleLabel: roleLabel || memberRole,
      workerType: workerType || roleLabel || memberRole,
      memberRole,
      active,
      editedBy,
      authUid,
      ...photo,
    },
    validationErrors,
  }
}

function buildWorkerProfileDeletePayload(body) {
  const orgId = normalizeOrgId(body?.orgId)
  let login = ''
  const validationErrors = []

  try {
    login = normalizeLoginLocalPart(body?.login || body?.workerLogin || body?.workerId)
  } catch (error) {
    validationErrors.push(error?.message || 'Podaj poprawny login pracownika.')
  }

  const workerId = normalizeText(body?.workerId || body?.id).slice(0, 128)
  const authUid = normalizeText(body?.authUid || body?.uid).slice(0, 128)

  if (!orgId) validationErrors.push('Brak poprawnego orgId.')
  if (!login) validationErrors.push('Brak loginu pracownika.')

  return {
    value: { orgId, login, workerId, authUid },
    validationErrors,
  }
}

function workerProfileAccessError(membership, actionLabel) {
  const error = new Error(membership ? 'FORBIDDEN' : 'ORG_ACCESS_MISSING')
  error.statusCode = membership ? 403 : 404
  error.publicCode = membership ? 'FORBIDDEN' : 'ORG_ACCESS_MISSING'
  error.publicMessage = membership ? `Brak uprawnien do ${actionLabel}.` : 'Brak dostepu do tej organizacji.'
  return error
}

async function requireWorkerProfileAccess(client, orgId, requesterUid, allowedRoles, actionLabel) {
  const membership = await getRequesterMembership(client, orgId, requesterUid)
  assertMembershipPlanCapability(membership, 'timeTracking')
  const requesterRole = normalizeRequesterRole(membership?.role)
  if (!allowedRoles.includes(requesterRole)) {
    throw workerProfileAccessError(membership, actionLabel)
  }
  return requesterRole
}

async function readWorkerProfileForUpdate(client, orgId, login) {
  const result = await runWorkerProfileDbQuery(
    client,
    'read-worker-for-update',
    `select login,
            worker_id,
            full_name,
            login_email,
            email,
            auth_uid,
            role,
            worker_type,
            active,
            phone,
            photo_url,
            created_at,
            updated_at,
            edit
       from public.worker
      where org_id = $1::text
        and lower(login) = lower($2::text)
      limit 1`,
    [orgId, login],
  )
  return result.rows[0] ?? null
}

function mapWorkerProfileRow(row, orgId) {
  if (!row) {
    return null
  }

  const login = normalizeText(row.login)
  const workerId = normalizeText(row.worker_id) || login
  const workerName = normalizeText(row.full_name) || login
  const loginEmail = normalizeEmail(row.login_email) || normalizeEmail(row.email)

  const isOwner = Boolean(
    normalizeText(row.owner_worker_id) &&
    normalizeText(row.owner_worker_id) === workerId,
  )
  const role = isOwner ? 'OWNER' : normalizeText(row.role || 'WORKER')
  const workerType = normalizeText(row.worker_type || row.role || 'WORKER')

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
    type: role,
    workerType,
    active: Boolean(row.active),
    authUid: normalizeText(row.auth_uid),
    email: loginEmail,
    loginEmail,
    phone: normalizeText(row.phone),
    photoUrl: normalizeText(row.photo_url),
    profilePhotoUrl: normalizeText(row.photo_url),
    editedBy: normalizeText(row.edit),
    addedAt: row.created_at?.toISOString?.() || normalizeText(row.created_at),
    editedAt: row.updated_at?.toISOString?.() || normalizeText(row.updated_at),
  }
}

async function listWorkersDirect(orgId, requesterUid) {
  const client = await connectDbClient()
  try {
    await workerRepository.assertWorkerSchemaReady(client)
    const membership = await getRequesterMembership(client, orgId, requesterUid)
    if (!membership) {
      throw workerProfileAccessError(null, 'odczytu pracownikow')
    }
    assertMembershipPlanCapability(membership, 'timeTracking')

    const result = await runWorkerProfileDbQuery(
      client,
      'list-workers-direct',
      `select
         w.login,
         w.worker_id,
         w.full_name,
         w.login_email,
         w.email,
         w.auth_uid,
         w.role,
         w.worker_type,
         coalesce(w.active, true) as active,
         w.phone,
         w.photo_url,
         w.created_at,
         w.updated_at,
         w.edit,
         o.owner_worker_id
       from public.worker w
       join public.organizations o
         on o.org_id = w.org_id
      where w.org_id = $1::text
      order by lower(coalesce(nullif(w.full_name, ''), w.login)), lower(w.login)`,
      [orgId],
    )

    return {
      workers: result.rows.map((row) => mapWorkerProfileRow(row, orgId)),
      ownerWorkerId: normalizeText(result.rows[0]?.owner_worker_id),
      storage: 'database',
    }
  } finally {
    client.release()
  }
}

function mapDataConnectWorkerProfileRow(row, orgId) {
  if (!row) {
    return null
  }

  const login = normalizeText(row.login ?? row.workerLogin)
  const workerId = normalizeText(row.workerId ?? row.worker_id ?? row.id) || login
  const workerName = normalizeText(row.workerName ?? row.worker_name ?? row.name ?? row.fullName) || login
  const loginEmail = normalizeEmail(row.loginEmail ?? row.login_email) || normalizeEmail(row.email)
  const isOwner = Boolean(
    row.isOwner ||
    (normalizeText(row.ownerWorkerId ?? row.owner_worker_id) &&
      normalizeText(row.ownerWorkerId ?? row.owner_worker_id) === workerId),
  )
  const role = isOwner ? 'OWNER' : normalizeText(row.role || 'WORKER')
  const workerType = normalizeText(row.workerType ?? row.worker_type ?? row.type ?? row.role ?? 'WORKER')

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
    type: role,
    workerType,
    active: asPayloadBoolean(row.active, true),
    authUid: normalizeText(row.authUid ?? row.auth_uid),
    email: loginEmail,
    loginEmail,
    phone: normalizeText(row.phone),
    photoUrl: normalizeText(row.photoUrl ?? row.photo_url),
    profilePhotoUrl: normalizeText(row.photoUrl ?? row.photo_url),
    editedBy: normalizeText(row.edit ?? row.updatedBy),
    addedAt: row.createdAt?.toISOString?.() || normalizeText(row.createdAt ?? row.created_at),
    editedAt: row.updatedAt?.toISOString?.() || normalizeText(row.updatedAt ?? row.updated_at),
  }
}

function mapWorkerProfilePayload(payload, authUid = '') {
  const login = normalizeText(payload?.newLogin || payload?.login)
  const workerId = normalizeText(payload?.workerId) || login
  const workerName = normalizeText(payload?.name) || login
  const email = normalizeEmail(payload?.email)
  const role = normalizeText(payload?.roleLabel || payload?.memberRole || 'WORKER')
  const workerType = normalizeText(payload?.workerType || role)
  const now = new Date().toISOString()

  return {
    id: workerId,
    workerId,
    orgId: payload?.orgId,
    login,
    workerLogin: login,
    workerName,
    fullName: workerName,
    name: workerName,
    role,
    type: role,
    workerType,
    active: Boolean(payload?.active),
    authUid: normalizeText(authUid || payload?.authUid),
    email,
    loginEmail: email,
    phone: normalizeText(payload?.phone),
    photoUrl: normalizeText(payload?.photoUrl),
    profilePhotoUrl: normalizeText(payload?.photoUrl),
    editedBy: normalizeText(payload?.editedBy),
    editedAt: now,
  }
}

function createWorkerProfilePublicError(statusCode, publicCode, publicMessage) {
  const error = new Error(publicCode)
  error.statusCode = statusCode
  error.publicCode = publicCode
  error.publicMessage = publicMessage
  return error
}

const WORKER_PROFILE_DB_ONLY_AUTH_WARNING =
  'Profil pracownika zapisano w bazie, ale nie znaleziono konta Firebase Auth; Firebase Auth nie zostal zmieniony.'

function createWorkerProfileAuthRequiredError(actionLabel = 'tej operacji') {
  return createWorkerProfilePublicError(
    409,
    'FIREBASE_AUTH_USER_MISSING',
    `Ten pracownik nie ma konta Firebase Auth. Odtworz konto Firebase Auth przed wykonaniem operacji: ${actionLabel}.`,
  )
}

async function runWorkerProfileDbQuery(client, label, queryText, params = []) {
  try {
    return await client.query(queryText, params)
  } catch (error) {
    error.workerProfileQueryLabel = normalizeText(label)
    console.warn('[worker-profile:db]', {
      label: error.workerProfileQueryLabel,
      code: normalizeText(error?.code),
      message: normalizeText(error?.message),
      position: normalizeText(error?.position),
      routine: normalizeText(error?.routine),
    })
    throw error
  }
}

function appendWorkerProfileWarning(currentWarning, nextWarning) {
  return [normalizeText(currentWarning), normalizeText(nextWarning)].filter(Boolean).join(' ')
}

function mapDataConnectWorkerForAuth(worker) {
  if (!worker) {
    return null
  }

  const login = normalizeText(worker.login ?? worker.workerLogin)
  const workerName = normalizeText(worker.workerName ?? worker.worker_name ?? worker.name ?? worker.fullName)
  const loginEmail = normalizeEmail(worker.loginEmail ?? worker.login_email ?? worker.email)
  return {
    login,
    worker_id: normalizeText(worker.workerId ?? worker.worker_id) || login,
    full_name: workerName || login,
    login_email: loginEmail,
    email: normalizeEmail(worker.email) || loginEmail,
    auth_uid: normalizeText(worker.authUid ?? worker.auth_uid),
    role: normalizeText(worker.role),
    worker_type: normalizeText(worker.workerType ?? worker.worker_type),
    active: asPayloadBoolean(worker.active, true),
    phone: normalizeText(worker.phone),
    created_at: worker.createdAt ?? worker.created_at,
    updated_at: worker.updatedAt ?? worker.updated_at,
    edit: normalizeText(worker.edit),
  }
}

async function assertWorkerProfileLoginAvailable(client, orgId, oldLogin, newLogin) {
  if (normalizeLower(oldLogin) === normalizeLower(newLogin)) {
    return
  }

  const duplicate = await runWorkerProfileDbQuery(
    client,
    'assert-login-available',
    `select login
       from public.worker
      where org_id = $1::text
        and lower(login) = lower($2::text)
        and lower(login) <> lower($3::text)
      limit 1`,
    [orgId, newLogin, oldLogin],
  )
  if (duplicate.rows.length) {
    throw createWorkerProfilePublicError(409, 'WORKER_LOGIN_ALREADY_EXISTS', 'Ten login jest juz zajety w tej organizacji.')
  }
}

async function assertWorkerProfileEmailAvailable(client, orgId, oldLogin, email) {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) {
    return
  }

  const duplicate = await runWorkerProfileDbQuery(
    client,
    'assert-email-available',
    `select login
       from public.worker
      where org_id = $1::text
        and lower(login) <> lower($2::text)
        and (
          lower(coalesce(login_email, '')) = lower($3::text)
          or lower(coalesce(email, '')) = lower($3::text)
        )
      limit 1`,
    [orgId, oldLogin, normalizedEmail],
  )
  if (duplicate.rows.length) {
    throw createWorkerProfilePublicError(409, 'WORKER_EMAIL_ALREADY_EXISTS', 'Ten email jest juz przypisany do innego pracownika.')
  }
}

function replaceWorkerLoginTokens(value, oldLogin, newLogin) {
  const oldNormalized = normalizeLower(oldLogin)
  if (!oldNormalized) {
    return String(value ?? '')
  }

  return String(value ?? '').replace(/[a-z0-9._%+-]+/gi, (token) => {
    return normalizeLower(token) === oldNormalized ? newLogin : token
  })
}

async function updateWorkerProfileTaskTokenLogins(client, orgId, oldLogin, newLogin) {
  const taskRows = await runWorkerProfileDbQuery(
    client,
    'rename-task-worker-token-select',
    `select id_task, worker_ids
       from public.task
      where org_id = $1::text
        and exists (
          select 1
            from regexp_split_to_table(coalesce(worker_ids::text, ''), '[,;|[:space:]]+') token
           where lower(trim(both ' "[]{}' from token)) = lower($2::text)
        )`,
    [orgId, oldLogin],
  )

  let updatedCount = 0
  for (const row of taskRows.rows) {
    const nextWorkerIds = replaceWorkerLoginTokens(row.worker_ids, oldLogin, newLogin)
    if (nextWorkerIds === String(row.worker_ids ?? '')) {
      continue
    }
    const updateResult = await runWorkerProfileDbQuery(
      client,
      'rename-task-worker-token-update',
      'update public.task set worker_ids = $3::text where org_id = $1::text and id_task::text = $2::text',
      [orgId, row.id_task, nextWorkerIds],
    )
    updatedCount += updateResult.rowCount
  }

  return updatedCount
}

async function changeWorkerProfileLogin(client, currentWorker, payload, authUid, updatedBy, finalEmail) {
  const oldLogin = payload.login
  const newLogin = payload.newLogin
  const dependentUpdates = {}

  const inserted = await runWorkerProfileDbQuery(
    client,
    'rename-worker-insert-new-row',
    `insert into public.worker (
       org_id,
       login,
       worker_id,
       full_name,
       login_email,
       email,
       phone,
       photo_url,
       role,
       worker_type,
       active,
       auth_uid,
       created_at,
       updated_at,
       edit
     )
     select org_id,
            $3::text,
            null,
            $4::text,
            $5::text,
            $5::text,
            nullif($6::text, ''),
            nullif($11::text, ''),
            $7::text,
            $8::text,
            $9::boolean,
            null,
            created_at,
            now(),
            nullif($10::text, '')
       from public.worker
      where org_id = $1::text
        and lower(login) = lower($2::text)`,
    [
      payload.orgId,
      oldLogin,
      newLogin,
      payload.name,
      finalEmail,
      payload.phone,
      payload.memberRole || normalizeWorkerProfileRole(payload.roleLabel || payload.workerType),
      payload.workerType,
      payload.active,
      updatedBy,
      payload.photoUrl,
    ],
  )
  if (!inserted.rowCount) {
    throw createWorkerProfilePublicError(404, 'WORKER_NOT_FOUND', 'Nie znaleziono pracownika do edycji.')
  }

  const commonParams = [payload.orgId, oldLogin, newLogin]
  dependentUpdates.workday_pause = (
    await runWorkerProfileDbQuery(
      client,
      'rename-worker-workday-pause',
      `update public.workday_pause
          set worker_login = $3::text
        where org_id = $1::text
          and lower(coalesce(worker_login, '')) = lower($2::text)`,
      commonParams,
    )
  ).rowCount

  dependentUpdates.event = (
    await runWorkerProfileDbQuery(
      client,
      'rename-worker-event',
      `update public.event
          set worker_login = $3::text
        where org_id = $1::text
          and lower(coalesce(worker_login, '')) = lower($2::text)`,
      commonParams,
    )
  ).rowCount

  dependentUpdates.workday = (
    await runWorkerProfileDbQuery(
      client,
      'rename-worker-workday',
      `update public.workday
          set worker_login = $3::text,
              updated_at = now()
        where org_id = $1::text
          and lower(worker_login) = lower($2::text)`,
      commonParams,
    )
  ).rowCount

  dependentUpdates.backup_cycle = (
    await runWorkerProfileDbQuery(
      client,
      'rename-worker-backup-cycle',
      `update public.backup_cycle
          set worker_login = $3::text
        where org_id = $1::text
          and lower(coalesce(worker_login, '')) = lower($2::text)`,
      commonParams,
    )
  ).rowCount

  dependentUpdates.checklist_log = (
    await runWorkerProfileDbQuery(
      client,
      'rename-worker-checklist-log',
      `update public.checklist_log
          set "worker" = $3::text
        where org_id = $1::text
          and lower(coalesce("worker", '')) = lower($2::text)`,
      commonParams,
    )
  ).rowCount

  dependentUpdates.task_login = (
    await runWorkerProfileDbQuery(
      client,
      'rename-worker-task-login',
      `update public.task
          set worker_login = $3::text
        where org_id = $1::text
          and lower(coalesce(worker_login, '')) = lower($2::text)`,
      commonParams,
    )
  ).rowCount

  dependentUpdates.task_worker_id = (
    await runWorkerProfileDbQuery(
      client,
      'rename-worker-task-worker-id',
      `update public.task
          set worker_id = $3::text
        where org_id = $1::text
          and lower(coalesce(worker_id, '')) = lower($2::text)`,
      commonParams,
    )
  ).rowCount

  dependentUpdates.task_worker_ids = await updateWorkerProfileTaskTokenLogins(client, payload.orgId, oldLogin, newLogin)

  await runWorkerProfileDbQuery(
    client,
    'rename-worker-delete-old-row',
    'delete from public.worker where org_id = $1::text and lower(login) = lower($2::text)',
    [payload.orgId, oldLogin],
  )

  const updated = await runWorkerProfileDbQuery(
    client,
    'rename-worker-finalize-new-row',
    `update public.worker
        set worker_id = coalesce(nullif($3::text, ''), nullif($4::text, ''), worker_id),
            auth_uid = coalesce(nullif($5::text, ''), auth_uid),
            updated_at = now()
      where org_id = $1::text
        and lower(login) = lower($2::text)
      returning login,
                worker_id,
                full_name,
                login_email,
                email,
                auth_uid,
                role,
                worker_type,
                active,
                phone,
                photo_url,
                created_at,
                updated_at,
                edit`,
    [payload.orgId, newLogin, payload.workerId, normalizeText(currentWorker?.worker_id), authUid],
  )

  return {
    row: updated.rows[0],
    dependentUpdates,
  }
}

async function findFirebaseUserForWorker(worker, preferredUid = '') {
  const auth = ensureFirebaseAdmin().auth()
  const uid = normalizeText(preferredUid || worker?.auth_uid)
  if (uid) {
    try {
      const user = await auth.getUser(uid)
      return { user, authUid: user.uid, authWarning: '' }
    } catch (error) {
      if (!isFirebaseUserNotFound(error)) {
        throw error
      }
    }
  }

  const emailCandidates = [worker?.login_email, worker?.email].map((value) => normalizeEmail(value)).filter(Boolean)
  for (const email of emailCandidates) {
    try {
      const user = await auth.getUserByEmail(email)
      return { user, authUid: user.uid, authWarning: uid ? 'UID pracownika nie istnieje w Firebase Auth, konto znaleziono po emailu.' : '' }
    } catch (error) {
      if (!isFirebaseUserNotFound(error)) {
        throw error
      }
    }
  }

  return {
    user: null,
    authUid: '',
    authWarning: 'Nie znaleziono konta Firebase Auth dla tego pracownika.',
  }
}

function isRequesterDeletingSelf(worker, authUid, decodedToken) {
  const requesterUid = normalizeText(decodedToken?.uid)
  if (authUid && requesterUid && authUid === requesterUid) {
    return true
  }

  const requesterEmail = normalizeEmail(decodedToken?.email)
  const workerEmails = [worker?.login_email, worker?.email].map((value) => normalizeEmail(value)).filter(Boolean)
  if (requesterEmail && workerEmails.includes(requesterEmail)) {
    return true
  }

  const requesterLogin = emailLocalPart(requesterEmail)
  return Boolean(requesterLogin && normalizeLower(worker?.login) === requesterLogin)
}

async function deleteWorkerProfileAccessRows(client, orgId, login, workerId, authUid) {
  const deletedCounts = {}

  const relationNames = [
    'public.workday_pause',
    'public.event',
    'public.checklist_log',
    'public.backup_cycle',
    'public.task',
    'public.workday',
  ]
  const relationRows = await client.query(
    `select relation_name,
            to_regclass(relation_name) is not null as exists
       from unnest($1::text[]) as relations(relation_name)`,
    [relationNames],
  )
  const existingRelations = new Set(
    relationRows.rows
      .filter((row) => row.exists)
      .map((row) => normalizeText(row.relation_name)),
  )
  const relationExists = (relationName) => existingRelations.has(relationName)

  if (relationExists('public.workday_pause')) {
    const workdayPauseConditions = [
      "lower(coalesce(wp.worker_login, '')) = lower($2::text)",
    ]
    if (relationExists('public.workday')) {
      workdayPauseConditions.push(
        `exists (
          select 1
            from public.workday w
           where w.org_id = wp.org_id
             and w.workday_id = wp.workday_id
             and lower(coalesce(w.worker_login, '')) = lower($2::text)
        )`,
      )
    }
    const result = await client.query(
      `delete from public.workday_pause wp
        where wp.org_id = $1::text
          and (${workdayPauseConditions.join(' or ')})`,
      [orgId, login],
    )
    deletedCounts.workday_pause = result.rowCount
  } else {
    deletedCounts.workday_pause = 0
  }

  if (relationExists('public.event')) {
    const eventConditions = [
      "lower(coalesce(e.worker_login, '')) = lower($2::text)",
    ]
    if (relationExists('public.workday')) {
      eventConditions.push(
        `exists (
          select 1
            from public.workday w
           where w.org_id = e.org_id
             and w.workday_id = e.workday_id
             and lower(coalesce(w.worker_login, '')) = lower($2::text)
        )`,
      )
    }
    const result = await client.query(
      `delete from public.event e
        where e.org_id = $1::text
          and (${eventConditions.join(' or ')})`,
      [orgId, login],
    )
    deletedCounts.event = result.rowCount
  } else {
    deletedCounts.event = 0
  }

  if (relationExists('public.checklist_log')) {
    const checklistConditions = [
      "lower(coalesce(cl.\"worker\", '')) = lower($2::text)",
    ]
    if (relationExists('public.workday')) {
      checklistConditions.push(
        `exists (
          select 1
            from public.workday w
           where w.org_id = cl.org_id
             and w.workday_id = cl.workday_id
             and lower(coalesce(w.worker_login, '')) = lower($2::text)
        )`,
      )
    }
    if (relationExists('public.backup_cycle')) {
      checklistConditions.push(
        `exists (
          select 1
            from public.backup_cycle bc
           where bc.org_id = cl.org_id
             and bc.cycle_id = cl.cycle_id
             and lower(coalesce(bc.worker_login, '')) = lower($2::text)
        )`,
      )
    }
    const result = await client.query(
      `delete from public.checklist_log cl
        where cl.org_id = $1::text
          and (${checklistConditions.join(' or ')})`,
      [orgId, login],
    )
    deletedCounts.checklist_log = result.rowCount
  } else {
    deletedCounts.checklist_log = 0
  }

  if (relationExists('public.backup_cycle')) {
    const result = await client.query(
      'delete from public.backup_cycle where org_id = $1::text and lower(coalesce(worker_login, \'\')) = lower($2::text)',
      [orgId, login],
    )
    deletedCounts.backup_cycle = result.rowCount
  } else {
    deletedCounts.backup_cycle = 0
  }

  if (relationExists('public.task')) {
    const result = await client.query(
      `delete from public.task
        where org_id = $1::text
          and (
            lower(coalesce(worker_login, '')) = lower($2::text)
            or lower(coalesce(worker_id, '')) = lower($2::text)
            or (nullif($3::text, '') is not null and lower(coalesce(worker_id, '')) = lower($3::text))
          )`,
      [orgId, login, normalizeText(workerId)],
    )
    deletedCounts.task = result.rowCount
  } else {
    deletedCounts.task = 0
  }

  if (relationExists('public.workday')) {
    const result = await client.query(
      'delete from public.workday where org_id = $1::text and lower(coalesce(worker_login, \'\')) = lower($2::text)',
      [orgId, login],
    )
    deletedCounts.workday = result.rowCount
  } else {
    deletedCounts.workday = 0
  }

  if (authUid) {
    const memberResult = await client.query(
      'delete from public.organization_member where org_id = $1::text and uid = $2::text',
      [orgId, authUid],
    )
    deletedCounts.organization_member = memberResult.rowCount
  } else {
    deletedCounts.organization_member = 0
  }

  const workerResult = await client.query(
    'delete from public.worker where org_id = $1::text and lower(login) = lower($2::text)',
    [orgId, login],
  )
  deletedCounts.worker = workerResult.rowCount

  return deletedCounts
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
    const requesterRole = normalizeRoleCode(membership?.role)
    if (!isWorkerManagementRole(requesterRole)) {
      const error = new Error('FORBIDDEN')
      error.statusCode = membership ? 403 : 404
      error.publicCode = membership ? 'FORBIDDEN' : 'ORG_ACCESS_MISSING'
      error.publicMessage = membership
        ? 'Brak uprawnieĹ„ do dodawania uĹĽytkownikĂłw.'
        : 'Brak dostÄ™pu do tej organizacji.'
      throw error
    }
    assertWorkerNumberOverrideAllowed(requesterRole, payload.workerNumberOverride)

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
    const currentRole = normalizeRoleCode(currentMembership?.role)
    if (!isWorkerManagementRole(currentRole)) {
      const error = new Error('FORBIDDEN')
      error.statusCode = 403
      error.publicCode = 'FORBIDDEN'
      error.publicMessage = 'Brak uprawnieĹ„ do dodawania uĹĽytkownikĂłw.'
      throw error
    }
    assertWorkerNumberOverrideAllowed(currentRole, payload.workerNumberOverride)

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

    const { workerId, workerNumber } = await reserveWorkerIdDirect(
      client,
      payload.orgId,
      payload.workerNumberOverride,
      requesterUid,
    )

    await runWorkerProfileDbQuery(
      client,
      'create-worker-organization-member',
      `insert into public.organization_member (org_id, uid, role, worker_id, status, created_at)
       values ($1::text, $2::text, $3::text, $4::text, 'ACTIVE', now())
       on conflict (org_id, uid) do update
         set role = excluded.role,
             worker_id = excluded.worker_id,
             status = 'ACTIVE'`,
      [payload.orgId, createdAuthUser.uid, payload.role, workerId],
    )

    await runWorkerProfileDbQuery(
      client,
      'create-worker-row',
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
       values (
         $1::text,
         $2::text,
         $3::text,
         $4::text,
         $5::text,
         $6::text,
         $7::boolean,
         $5::text,
         $8::text,
         $11::text,
         $9::text,
         $10::text,
         now(),
         now()
       )`,
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
        payload.workerType,
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
      workerType: payload.workerType,
      active: payload.active,
      workerNumber,
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

async function createAdminManagedUserDatabase(payload, requesterUid) {
  const client = await connectDbClient()
  let createdAuthUser = null
  let transactionStarted = false
  let databaseCommitted = false
  let uploadedPhoto = null

  try {
    await workerRepository.assertWorkerSchemaReady(client)

    const membership = await getRequesterMembership(
      client,
      payload.orgId,
      requesterUid,
    )
    const requesterRole = normalizeRoleCode(membership?.role)
    if (!isWorkerManagementRole(requesterRole)) {
      throw workerProfileAccessError(membership, 'dodawania pracownikow')
    }
    assertWorkerRoleAssignmentAllowed(requesterRole, payload.role, { creating: true })
    assertWorkerNumberOverrideAllowed(requesterRole, payload.workerNumberOverride)

    const existingWorker = await workerRepository.findExistingWorker(
      client,
      payload.orgId,
      '',
      payload.email,
    )
    if (existingWorker) {
      throw createWorkerProfilePublicError(
        409,
        'WORKER_ALREADY_EXISTS',
        'Ten email jest juz przypisany do pracownika.',
      )
    }

    await assertFirebaseEmailAvailable(payload.email)
    createdAuthUser = await createFirebaseAuthUser(payload)
    uploadedPhoto = await uploadWorkerProfilePhoto(payload, { uid: requesterUid })
    if (uploadedPhoto?.url) {
      payload.photoUrl = uploadedPhoto.url
      payload.photoUrlChanged = true
    }

    await client.query('begin')
    transactionStarted = true
    await client.query(
      'select pg_advisory_xact_lock(hashtext($1::text))',
      [`worker-create:${payload.orgId}`],
    )

    const currentMembership = await getRequesterMembership(
      client,
      payload.orgId,
      requesterUid,
    )
    const currentRole = normalizeRoleCode(currentMembership?.role)
    if (!isWorkerManagementRole(currentRole)) {
      throw workerProfileAccessError(currentMembership, 'dodawania pracownikow')
    }
    assertWorkerRoleAssignmentAllowed(currentRole, payload.role, { creating: true })
    assertWorkerNumberOverrideAllowed(currentRole, payload.workerNumberOverride)
    const tenantActorUid = currentRole === PLATFORM_ROLE ? '' : requesterUid

    const { workerId, workerNumber } = await workerRepository.reserveWorkerId(
      client,
      payload.orgId,
      payload.workerNumberOverride,
      tenantActorUid,
    )
    const login = buildWorkerLogin(payload.orgId, workerNumber)

    const duplicateWorker = await workerRepository.findExistingWorker(
      client,
      payload.orgId,
      login,
      payload.email,
    )
    if (duplicateWorker) {
      throw createWorkerProfilePublicError(
        409,
        'WORKER_ALREADY_EXISTS',
        normalizeLower(duplicateWorker.login) === login
          ? 'Wygenerowany login techniczny jest juz zajety.'
          : 'Ten email jest juz przypisany do pracownika.',
      )
    }

    await workerRepository.insertWorkerAndMembership(client, {
      ...payload,
      login,
      workerId,
      authUid: createdAuthUser.uid,
      createdByUid: tenantActorUid,
    })

    await client.query('commit')
    transactionStarted = false
    databaseCommitted = true

    return {
      uid: createdAuthUser.uid,
      authUid: createdAuthUser.uid,
      orgId: payload.orgId,
      login,
      workerId,
      email: payload.email,
      loginEmail: payload.email,
      displayName: payload.displayName,
      workerName: payload.displayName,
      fullName: payload.displayName,
      role: payload.role,
      workerType: payload.workerType,
      phone: payload.phone,
      photoUrl: payload.photoUrl,
      active: payload.active,
      workerNumber,
      storage: 'database',
      persistenceVerified: true,
    }
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('rollback')
      } catch {
        // Ignore rollback failure; the original error remains authoritative.
      }
    }
    if (createdAuthUser?.uid && !databaseCommitted) {
      await deleteFirebaseUserQuietly(createdAuthUser)
    }
    if (!databaseCommitted) {
      await deleteWorkerProfilePhotoObject(uploadedPhoto)
    }
    throw error
  } finally {
    client.release()
  }
}

async function handleAuthProvisionWorkerRequest(req, res) {
  if (req.method !== 'OPTIONS') {
    sendApiError(
      res,
      410,
      'WORKER_PROVISION_ENDPOINT_REMOVED',
      'Ten endpoint zostal wycofany. Pracownikow nalezy dodawac przez /api/admin/users.',
    )
    return
  }

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
    decodedToken = await verifySessionContextFirebaseIdToken(token)
  } catch (error) {
    sendFirebaseVerificationError(res, error)
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
    decodedToken = await verifySessionContextFirebaseIdToken(token)
  } catch (error) {
    sendFirebaseVerificationError(res, error)
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

  sendApiError(
    res,
    410,
    'WORKER_PASSWORD_REVEAL_REMOVED',
    'Podglad zapisanych hasel pracownikow zostal trwale usuniety.',
  )
}

async function setWorkerPasswordDatabase(payload, decodedToken) {
  const client = await connectDbClient()
  try {
    await workerRepository.assertWorkerSchemaReady(client)
    const membership = await getRequesterMembership(
      client,
      payload.orgId,
      decodedToken.uid,
    )
    const role = normalizeRoleCode(membership?.role)
    if (!['ADMIN', 'ADMINISTRATOR', 'OWNER', 'SUPERADMIN', PLATFORM_ROLE].includes(role)) {
      throw workerProfileAccessError(membership, 'resetowania hasla pracownika')
    }

    const worker = await workerRepository.readWorkerForPasswordReset(
      client,
      payload.orgId,
      payload.login,
    )
    if (!worker) {
      throw createWorkerProfilePublicError(
        404,
        'WORKER_NOT_FOUND',
        'Nie znaleziono rekordu pracownika dla tego loginu w organizacji.',
      )
    }

    const authMatch = await findFirebaseUserForWorker(worker, worker.auth_uid)
    const authUid = normalizeText(authMatch.authUid)
    if (!authUid) {
      throw createWorkerProfilePublicError(
        409,
        'FIREBASE_AUTH_USER_MISSING',
        'Ten pracownik nie ma konta Firebase Auth. Nie mozna ustawic hasla.',
      )
    }

    await updateFirebaseAuthPassword(authUid, payload.password)
    return {
      passwordUpdated: true,
      login: normalizeText(worker.login),
      storage: 'database',
      persistenceVerified: true,
    }
  } finally {
    client.release()
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
    decodedToken = await verifySessionContextFirebaseIdToken(token)
  } catch (error) {
    sendFirebaseVerificationError(res, error)
    return
  }

  const { value: payload, validationErrors } = buildWorkerPasswordPayload(body, { requirePassword: true })
  if (validationErrors.length) {
    sendApiError(res, 400, 'VALIDATION_ERROR', validationErrors[0], validationErrors)
    return
  }

  try {
    const data = await setWorkerPasswordDatabase(payload, decodedToken)
    sendJson(res, 200, {
      ok: true,
      data,
    })
  } catch (error) {
    const mapped = mapFirebaseAdminError(error)
    const status = Number(error?.statusCode ?? mapped.status ?? 500)
    const publicCode = normalizeText(error?.publicCode) || mapped.code || 'WORKER_PASSWORD_SET_FAILED'
    const publicMessage = normalizeText(error?.publicMessage) || mapped.message || error?.message || 'Nie udalo sie zapisac hasla pracownika.'
    console.warn('[worker-password-set]', publicCode, Number.isFinite(status) ? status : 500, publicMessage)
    sendApiError(
      res,
      Number.isFinite(status) ? status : 500,
      publicCode,
      publicMessage,
      publicErrorDetails(error),
    )
  }
}

function isWorkerProfileLoginChange(payload) {
  return normalizeLower(payload?.newLogin) !== normalizeLower(payload?.login)
}

function findDataConnectWorkerByLogin(rows, login) {
  const expected = normalizeLower(login)
  return (Array.isArray(rows) ? rows : []).find((row) => normalizeLower(row?.login ?? row?.workerLogin) === expected) ?? null
}

function dataConnectWorkerProfileDuplicate(rows, oldLogin, newLogin, email) {
  const normalizedOldLogin = normalizeLower(oldLogin)
  const normalizedNewLogin = normalizeLower(newLogin)
  const normalizedEmail = normalizeEmail(email)

  return (Array.isArray(rows) ? rows : []).find((row) => {
    const rowLogin = normalizeLower(row?.login ?? row?.workerLogin)
    if (!rowLogin || rowLogin === normalizedOldLogin) {
      return false
    }

    const rowLoginEmail = normalizeEmail(row?.loginEmail ?? row?.login_email)
    const rowEmail = normalizeEmail(row?.email)
    return (
      (normalizedNewLogin && rowLogin === normalizedNewLogin) ||
      (normalizedEmail && (rowLoginEmail === normalizedEmail || rowEmail === normalizedEmail))
    )
  }) ?? null
}

function assertDataConnectWorkerProfileAvailable(rows, oldLogin, newLogin, email) {
  const duplicate = dataConnectWorkerProfileDuplicate(rows, oldLogin, newLogin, email)
  if (!duplicate) {
    return
  }

  const sameLogin = normalizeLower(duplicate?.login ?? duplicate?.workerLogin) === normalizeLower(newLogin)
  const rowLoginEmail = normalizeEmail(duplicate?.loginEmail ?? duplicate?.login_email)
  const rowEmail = normalizeEmail(duplicate?.email)
  const sameEmail = normalizeEmail(email) && (rowLoginEmail === normalizeEmail(email) || rowEmail === normalizeEmail(email))
  if (sameLogin && sameEmail) {
    throw createWorkerProfilePublicError(
      409,
      'WORKER_ALREADY_EXISTS',
      'Ten uzytkownik juz istnieje w tej organizacji. Login i email musza byc unikalne w obrebie jednej organizacji.',
    )
  }
  if (sameLogin) {
    throw createWorkerProfilePublicError(409, 'WORKER_LOGIN_ALREADY_EXISTS', 'Ten login jest juz zajety w tej organizacji.')
  }
  throw createWorkerProfilePublicError(409, 'WORKER_EMAIL_ALREADY_EXISTS', 'Ten email jest juz przypisany do uzytkownika w tej organizacji.')
}

function workerProfilePersistenceDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeWorkerProfileComparable(value) {
  const raw = normalizeText(value)
  if (!raw) {
    return ''
  }
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function addWorkerProfileMismatch(mismatches, field, expected, actual) {
  if (normalizeText(expected) === normalizeText(actual)) {
    return
  }
  mismatches.push({ field, expected: normalizeText(expected), actual: normalizeText(actual) })
}

function addWorkerProfileRoleMismatch(mismatches, field, expected, actual) {
  const expectedRole = normalizeWorkerProfileRole(expected)
  const actualRole = normalizeWorkerProfileRole(actual)
  if (expectedRole === actualRole) {
    return
  }
  mismatches.push({ field, expected: expectedRole, actual: actualRole })
}

function addWorkerProfileTypeMismatch(mismatches, field, expected, actual) {
  if (normalizeWorkerProfileComparable(expected) === normalizeWorkerProfileComparable(actual)) {
    return
  }
  mismatches.push({ field, expected: normalizeText(expected), actual: normalizeText(actual) })
}

function addWorkerProfileEmailMismatch(mismatches, field, expected, actual) {
  const expectedEmail = normalizeEmail(expected)
  const actualEmail = normalizeEmail(actual)
  if (expectedEmail === actualEmail) {
    return
  }
  mismatches.push({ field, expected: expectedEmail, actual: actualEmail })
}

function addWorkerProfileBoolMismatch(mismatches, field, expected, actual) {
  const expectedBool = Boolean(expected)
  const actualBool = asPayloadBoolean(actual, true)
  if (expectedBool === actualBool) {
    return
  }
  mismatches.push({ field, expected: String(expectedBool), actual: String(actualBool) })
}

function createWorkerProfilePersistenceError(mismatches, context = {}) {
  const error = createWorkerProfilePublicError(
    409,
    'WORKER_PROFILE_PERSISTENCE_MISMATCH',
    'Data Connect nie potwierdzil trwalego zapisu profilu pracownika. Zmiana Firebase Auth zostanie cofnieta; odswiez dane i sprobuj ponownie.',
  )
  error.validationMismatches = mismatches
  error.context = context
  return error
}

async function verifyDataConnectWorkerProfilePersistence(
  payload,
  expectedWorkerId,
  expectedAuthUid,
  loginChanged,
  firebaseIdToken,
) {
  const expectedLogin = normalizeText(payload.newLogin || payload.login)
  let lastMismatches = []

  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (attempt > 0) {
      await workerProfilePersistenceDelay(250 * attempt)
    }

    const rows = await queryWorkersForOrgViaDataConnect(payload.orgId, firebaseIdToken)
    const persisted = findDataConnectWorkerByLogin(rows, expectedLogin)
    const oldLoginStillExists = loginChanged ? findDataConnectWorkerByLogin(rows, payload.login) : null
    const mismatches = []

    if (!persisted) {
      mismatches.push({ field: 'login', expected: expectedLogin, actual: '' })
    }
    if (oldLoginStillExists) {
      mismatches.push({ field: 'oldLogin', expected: '', actual: normalizeText(oldLoginStillExists.login ?? oldLoginStillExists.workerLogin) })
    }

    if (persisted) {
      addWorkerProfileMismatch(mismatches, 'login', expectedLogin, persisted.login ?? persisted.workerLogin)
      addWorkerProfileMismatch(mismatches, 'workerName', payload.name, persisted.workerName ?? persisted.worker_name ?? persisted.name ?? persisted.fullName)
      addWorkerProfileEmailMismatch(mismatches, 'loginEmail', payload.email, persisted.loginEmail ?? persisted.login_email ?? persisted.email)
      addWorkerProfileEmailMismatch(mismatches, 'email', payload.email, persisted.email ?? persisted.loginEmail ?? persisted.login_email)
      addWorkerProfileRoleMismatch(mismatches, 'role', payload.memberRole, persisted.role)
      addWorkerProfileTypeMismatch(mismatches, 'workerType', payload.workerType, persisted.workerType ?? persisted.worker_type ?? persisted.type)
      addWorkerProfileBoolMismatch(mismatches, 'active', payload.active, persisted.active)
      if (normalizeText(expectedWorkerId)) {
        addWorkerProfileMismatch(mismatches, 'workerId', expectedWorkerId, persisted.workerId ?? persisted.worker_id ?? persisted.id)
      }
      if (normalizeText(expectedAuthUid)) {
        addWorkerProfileMismatch(mismatches, 'authUid', expectedAuthUid, persisted.authUid ?? persisted.auth_uid)
      }
    }

    if (!mismatches.length) {
      console.info('[worker-profile:dataconnect] persistence-verified', {
        orgId: payload.orgId,
        login: payload.login,
        newLogin: expectedLogin,
        authUid: normalizeText(expectedAuthUid),
        loginChanged: Boolean(loginChanged),
        attempt: attempt + 1,
      })
      return mapDataConnectWorkerProfileRow(persisted, payload.orgId)
    }

    lastMismatches = mismatches
  }

  console.warn('[worker-profile:dataconnect] persistence-mismatch', {
    orgId: payload.orgId,
    login: payload.login,
    newLogin: expectedLogin,
    authUid: normalizeText(expectedAuthUid),
    mismatches: lastMismatches,
  })
  throw createWorkerProfilePersistenceError(lastMismatches, {
    orgId: payload.orgId,
    login: payload.login,
    newLogin: expectedLogin,
    authUid: normalizeText(expectedAuthUid),
  })
}

async function getRequesterRawRoleViaDataConnect(orgId, firebaseIdToken) {
  const response = await executeDataConnectOperation('query', 'MyOrganizations', {}, firebaseIdToken)
  const memberships = Array.isArray(response?.data?.organizationMembers) ? response.data.organizationMembers : []
  const membership = memberships.find((item) => normalizeText(item?.orgId) === normalizeText(orgId))
  return normalizeRoleCode(membership?.role)
}

async function getRequesterRoleViaDataConnect(orgId, firebaseIdToken) {
  return normalizeRequesterRole(await getRequesterRawRoleViaDataConnect(orgId, firebaseIdToken))
}

function hasWorkerProfileAuthFieldChange(payload, currentWorker) {
  if (!currentWorker) {
    return true
  }

  const currentName = normalizeText(
    currentWorker.workerName ??
      currentWorker.workername ??
      currentWorker.worker_name ??
      currentWorker.full_name ??
      currentWorker.name ??
      currentWorker.fullName,
  )
  const currentEmail = normalizeEmail(currentWorker.loginEmail ?? currentWorker.login_email ?? currentWorker.email)
  const currentActive = asPayloadBoolean(currentWorker.active, true)
  return (
    normalizeText(payload.name) !== currentName ||
    normalizeEmail(payload.email) !== currentEmail ||
    Boolean(payload.active) !== Boolean(currentActive)
  )
}

function shouldSyncWorkerProfileMembershipViaDataConnect(payload) {
  const authUid = normalizeText(payload?.authUid)
  if (!authUid) {
    return false
  }

  const memberRole = normalizeWorkerProfileRole(payload?.memberRole || payload?.roleLabel || payload?.workerType)
  return ['ADMIN', 'MANAGER', 'COORDINATOR'].includes(memberRole)
}

function buildWorkerProfileDataConnectUpdateVariables(payload, finalWorkerId, updatedBy, syncMembership = false) {
  const variables = {
    orgId: payload.orgId,
    login: payload.login,
    workerName: payload.name,
    loginEmail: payload.email,
    role: payload.memberRole || payload.roleLabel,
    active: payload.active,
    email: payload.email,
    phone: payload.phone || null,
    workerType: payload.workerType,
    workerId: finalWorkerId,
    edit: updatedBy || null,
  }

  if (syncMembership) {
    variables.authUid = normalizeText(payload.authUid)
    variables.memberRole = payload.memberRole
  }

  return variables
}

function dataConnectWorkerAuthSnapshot(currentWorker = null) {
  const displayName = normalizeText(
    currentWorker?.workerName ??
      currentWorker?.workername ??
      currentWorker?.worker_name ??
      currentWorker?.name ??
      currentWorker?.fullName,
  )
  const email = normalizeEmail(currentWorker?.loginEmail ?? currentWorker?.login_email ?? currentWorker?.email)
  const active = asPayloadBoolean(currentWorker?.active, true)
  return {
    ...(displayName ? { displayName } : {}),
    ...(email ? { email } : {}),
    disabled: !active,
  }
}

function resolveWorkerProfileWorkerId(payload, currentWorker = null, loginChanged = false) {
  const providedWorkerId = normalizeText(payload?.workerId)
  const oldLogin = normalizeText(payload?.login)
  const newLogin = normalizeText(payload?.newLogin || payload?.login)
  if (loginChanged && (!providedWorkerId || normalizeLower(providedWorkerId) === normalizeLower(oldLogin))) {
    return newLogin
  }
  return (
    providedWorkerId ||
    normalizeText(currentWorker?.workerId ?? currentWorker?.worker_id) ||
    newLogin ||
    oldLogin
  )
}

async function updateFirebaseAuthForWorkerProfilePayload(payload, currentWorker = null, options = {}) {
  if (!hasWorkerProfileAuthFieldChange(payload, currentWorker)) {
    return {
      authUid: normalizeText(payload?.authUid || currentWorker?.authUid || currentWorker?.auth_uid),
      authUpdated: false,
      authWarning: '',
    }
  }

  const authUid = normalizeText(payload?.authUid || currentWorker?.authUid || currentWorker?.auth_uid)
  if (!authUid) {
    if (options.strict) {
      throw createWorkerProfilePublicError(
        409,
        'FIREBASE_AUTH_USER_MISSING',
        normalizeText(options.authRequiredMessage) ||
          'Nie znaleziono konta Firebase Auth dla tego pracownika. Edycja zostala przerwana, zeby nie zapisac tylko czesci danych.',
      )
    }
    return {
      authUid: '',
      authUpdated: false,
      authWarning: WORKER_PROFILE_DB_ONLY_AUTH_WARNING,
    }
  }

  try {
    await ensureFirebaseAdmin().auth().updateUser(authUid, {
      displayName: payload.name,
      email: payload.email,
      disabled: !payload.active,
    })
    return { authUid, authUpdated: true, authWarning: '' }
  } catch (error) {
    if (options.strict) {
      throw error
    }
    const mapped = mapFirebaseAdminError(error)
    const warning = isFirebaseUserNotFound(error)
      ? 'Nie znaleziono konta Firebase Auth dla tego UID; baza zostala zaktualizowana przez Data Connect.'
      : `Baza zostala zaktualizowana przez Data Connect, ale Firebase Auth nie zostal zmieniony: ${normalizeText(mapped.message || error?.message)}`
    return {
      authUid,
      authUpdated: false,
      authWarning: warning.slice(0, 500),
    }
  }
}

function sendWorkerProfileFailure(res, error, fallbackCode, fallbackMessage, dbConfigMessage) {
  if (error?.message === 'DB_CONFIG_MISSING') {
    sendApiError(res, 503, 'DB_CONFIG_MISSING', dbConfigMessage)
    return
  }

  const databaseError = mapDatabaseConnectionError(error)
  if (databaseError) {
    sendApiError(res, databaseError.status, databaseError.code, databaseError.message)
    return
  }

  const databaseQueryError = mapDatabaseQueryError(error)
  if (databaseQueryError) {
    sendApiError(
      res,
      databaseQueryError.status,
      databaseQueryError.code,
      databaseQueryError.message,
      publicErrorDetails(error),
    )
    return
  }

  const mapped = mapFirebaseAdminError(error)
  const status = Number(error?.statusCode ?? mapped.status ?? 500)
  const publicCode = normalizeText(error?.publicCode) || mapped.code || fallbackCode
  const publicMessage = normalizeText(error?.publicMessage) || mapped.message || error?.message || fallbackMessage
  console.warn('[worker-profile]', publicCode, Number.isFinite(status) ? status : 500, publicMessage)
  sendApiError(
    res,
    Number.isFinite(status) ? status : 500,
    publicCode,
    publicMessage,
    publicErrorDetails(error),
  )
}

function sendWorkerProfileDeleteRequiresDb(res) {
  sendApiError(
    res,
    503,
    'WORKER_PROFILE_DELETE_REQUIRES_DB',
    'Nie udalo sie usunac pracownika w lokalnym trybie Cloud SQL. Sprobuj ponownie po restarcie dev stacka albo uzyj trybu Data Connect.',
  )
}

async function updateWorkerProfileDatabase(payload, decodedToken) {
  const client = await connectDbClient()
  let transactionStarted = false
  let authUid = ''
  let authUpdated = false
  let authWarning = ''
  let authSnapshot = null
  let uploadedPhoto = null

  try {
    await workerRepository.assertWorkerSchemaReady(client)
    const membership = await getRequesterMembership(
      client,
      payload.orgId,
      decodedToken.uid,
    )
    const requesterRole = normalizeRequesterRole(membership?.role)
    if (!['ADMIN', 'MANAGER'].includes(requesterRole)) {
      throw workerProfileAccessError(membership, 'edycji pracownikow')
    }

    let currentWorker = await workerRepository.readWorkerForUpdate(
      client,
      payload.orgId,
      payload.login,
    )
    if (!currentWorker) {
      throw createWorkerProfilePublicError(
        404,
        'WORKER_NOT_FOUND',
        'Nie znaleziono pracownika do edycji.',
      )
    }

    let ownerWorkerId = await workerRepository.getOrganizationOwnerWorkerId(
      client,
      payload.orgId,
    )
    let targetIsOwner = Boolean(
      ownerWorkerId && normalizeText(currentWorker.worker_id) === ownerWorkerId,
    )
    payload.memberRole = assertWorkerRoleAssignmentAllowed(
      membership?.role,
      payload.memberRole,
      {
        currentRole: currentWorker.role,
        targetIsOwner,
      },
    )
    payload.roleLabel = payload.memberRole

    const loginChanged = isWorkerProfileLoginChange(payload)
    if (loginChanged) {
      throw createWorkerProfilePublicError(
        400,
        'WORKER_LOGIN_IMMUTABLE',
        'Login techniczny pracownika jest niemodyfikowalny.',
      )
    }

    const finalEmail = payload.email
    const knownAuthUid = normalizeText(payload.authUid || currentWorker.auth_uid)
    const authFieldsChanged = hasWorkerProfileAuthFieldChange(
      { ...payload, email: finalEmail },
      currentWorker,
    )
    const shouldResolveFirebaseUser = loginChanged || authFieldsChanged
    const [, , authMatch] = await Promise.all([
      workerRepository.assertLoginAvailable(
        client,
        payload.orgId,
        payload.login,
        payload.newLogin,
      ),
      workerRepository.assertEmailAvailable(
        client,
        payload.orgId,
        payload.login,
        finalEmail,
      ),
      shouldResolveFirebaseUser
        ? findFirebaseUserForWorker(currentWorker, knownAuthUid)
        : Promise.resolve({ user: null, authUid: knownAuthUid, authWarning: '' }),
    ])
    authUid = normalizeText(authMatch.authUid)
    authWarning = ''
    if (shouldResolveFirebaseUser && (!authUid || !authMatch.user)) {
      throw createWorkerProfileAuthRequiredError('zmiana danych konta')
    }

    if (shouldResolveFirebaseUser) {
      authSnapshot = {
        displayName: normalizeText(authMatch.user.displayName) || null,
        disabled: Boolean(authMatch.user.disabled),
        ...(normalizeEmail(authMatch.user.email)
          ? { email: normalizeEmail(authMatch.user.email) }
          : {}),
      }
      await ensureFirebaseAdmin().auth().updateUser(authUid, {
        displayName: payload.name,
        email: finalEmail,
        disabled: !payload.active,
      })
      authUpdated = true
    }

    uploadedPhoto = await uploadWorkerProfilePhoto(payload, decodedToken)
    if (uploadedPhoto?.url) {
      payload.photoUrl = uploadedPhoto.url
      payload.photoUrlChanged = true
    }

    await client.query('begin')
    transactionStarted = true
    await client.query(
      'select pg_advisory_xact_lock(hashtext($1::text))',
      [`worker-update:${payload.orgId}:${payload.login}`],
    )

    const currentMembership = await getRequesterMembership(
      client,
      payload.orgId,
      decodedToken.uid,
    )
    const currentRequesterRole = normalizeRequesterRole(currentMembership?.role)
    if (!['ADMIN', 'MANAGER'].includes(currentRequesterRole)) {
      throw workerProfileAccessError(currentMembership, 'edycji pracownikow')
    }
    if (loginChanged) {
      throw createWorkerProfilePublicError(
        400,
        'WORKER_LOGIN_IMMUTABLE',
        'Login techniczny pracownika jest niemodyfikowalny.',
      )
    }

    currentWorker = await workerRepository.readWorkerForUpdate(
      client,
      payload.orgId,
      payload.login,
    )
    if (!currentWorker) {
      throw createWorkerProfilePublicError(
        404,
        'WORKER_NOT_FOUND',
        'Nie znaleziono pracownika do edycji.',
      )
    }

    ownerWorkerId = await workerRepository.getOrganizationOwnerWorkerId(
      client,
      payload.orgId,
    )
    targetIsOwner = Boolean(
      ownerWorkerId && normalizeText(currentWorker.worker_id) === ownerWorkerId,
    )
    payload.memberRole = assertWorkerRoleAssignmentAllowed(
      currentMembership?.role,
      payload.memberRole,
      {
        currentRole: currentWorker.role,
        targetIsOwner,
      },
    )
    payload.roleLabel = payload.memberRole

    await workerRepository.assertLoginAvailable(
      client,
      payload.orgId,
      payload.login,
      payload.newLogin,
    )
    await workerRepository.assertEmailAvailable(
      client,
      payload.orgId,
      payload.login,
      finalEmail,
    )

    const updatedBy = normalizeRoleCode(currentMembership?.role) === PLATFORM_ROLE
      ? normalizeText(currentWorker.edit)
      : payload.editedBy || normalizeEmail(decodedToken?.email) || normalizeText(decodedToken?.uid)
    const repositoryPayload = {
      ...payload,
      email: finalEmail,
      role: payload.memberRole,
      authUid,
      updatedBy,
    }

    let updatedRow
    let dependentUpdates = null
    if (loginChanged) {
      const renamed = await workerRepository.renameWorker(
        client,
        currentWorker,
        repositoryPayload,
      )
      updatedRow = renamed.row
      dependentUpdates = renamed.dependentUpdates
    } else {
      updatedRow = await workerRepository.updateWorkerRow(
        client,
        repositoryPayload,
      )
      if (!updatedRow) {
        throw createWorkerProfilePublicError(
          404,
          'WORKER_NOT_FOUND',
          'Nie znaleziono pracownika do edycji.',
        )
      }
      await workerRepository.upsertWorkerMembership(client, {
        orgId: payload.orgId,
        authUid,
        role: payload.memberRole,
        workerId: normalizeText(currentWorker.worker_id),
      })
    }

    await client.query('commit')
    transactionStarted = false

    return {
      worker: mapWorkerProfileRow(
        { ...updatedRow, owner_worker_id: ownerWorkerId },
        payload.orgId,
      ),
      authUpdated,
      authWarning,
      loginChanged,
      dependentUpdates,
      storage: 'database',
      persistenceVerified: true,
    }
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('rollback')
      } catch {
        // Ignore rollback failure; the original error remains authoritative.
      }
    }

    if (authUpdated && authUid && authSnapshot) {
      try {
        await ensureFirebaseAdmin().auth().updateUser(authUid, authSnapshot)
      } catch (rollbackError) {
        error.authRollbackWarning =
          mapFirebaseAdminError(rollbackError)?.message ||
          normalizeText(rollbackError?.message)
      }
    }
    await deleteWorkerProfilePhotoObject(uploadedPhoto)
    throw error
  } finally {
    client.release()
  }
}

async function handleAdminWorkerProfileUpdateRequest(req, res) {
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
    body = await readJsonBody(req, MAX_WORKER_PROFILE_PHOTO_BODY_BYTES)
  } catch (error) {
    sendApiError(
      res,
      error?.message === 'REQUEST_BODY_TOO_LARGE' ? 413 : 400,
      error?.message === 'REQUEST_BODY_TOO_LARGE' ? 'REQUEST_TOO_LARGE' : 'INVALID_JSON',
      error?.message === 'REQUEST_BODY_TOO_LARGE'
        ? 'Zadanie jest zbyt duze.'
        : 'Niepoprawny JSON w zadaniu.',
    )
    return
  }

  const token = parseBearerToken(req)
  if (!token) {
    sendApiError(res, 401, 'UNAUTHENTICATED', 'Brak tokenu Firebase.')
    return
  }

  let decodedToken
  try {
    decodedToken = await verifySessionContextFirebaseIdToken(token)
  } catch (error) {
    sendFirebaseVerificationError(res, error)
    return
  }

  const { value: payload, validationErrors } = buildWorkerProfileUpdatePayload(body)
  if (validationErrors.length) {
    sendApiError(res, 400, 'VALIDATION_ERROR', validationErrors[0], validationErrors)
    return
  }

  try {
    const data = await updateWorkerProfileDatabase(payload, decodedToken)
    sendJson(res, 200, { ok: true, data })
  } catch (error) {
    sendWorkerProfileFailure(
      res,
      error,
      'WORKER_PROFILE_UPDATE_FAILED',
      'Nie udalo sie zaktualizowac pracownika.',
      'Operacje pracownikow wymagaja gotowego schematu Cloud SQL.',
    )
  }
}

async function deleteWorkerProfileDatabase(payload, decodedToken) {
  const client = await connectDbClient()
  let transactionStarted = false

  try {
    await workerRepository.assertWorkerSchemaReady(client)
    let membership = await getRequesterMembership(
      client,
      payload.orgId,
      decodedToken.uid,
    )
    if (!isWorkerDeleteRole(membership?.role)) {
      throw workerProfileAccessError(membership, 'usuwania pracownikow')
    }

    let currentWorker = await workerRepository.readWorkerForUpdate(
      client,
      payload.orgId,
      payload.login,
    )
    if (!currentWorker) {
      throw createWorkerProfilePublicError(
        404,
        'WORKER_NOT_FOUND',
        'Nie znaleziono pracownika do usuniecia.',
      )
    }

    let ownerWorkerId = await workerRepository.getOrganizationOwnerWorkerId(
      client,
      payload.orgId,
    )
    if (ownerWorkerId && normalizeText(currentWorker.worker_id) === ownerWorkerId) {
      throw createWorkerProfilePublicError(
        403,
        'OWNER_WORKER_DELETE_FORBIDDEN',
        'Nie mo\u017cna usun\u0105\u0107 konta za\u0142o\u017cyciela organizacji.',
      )
    }

    let authUid = normalizeText(payload.authUid || currentWorker.auth_uid)
    let authWarning = ''
    if (isRequesterDeletingSelf(currentWorker, authUid, decodedToken)) {
      throw createWorkerProfilePublicError(
        400,
        'SELF_DELETE_BLOCKED',
        'Nie mozesz usunac konta, na ktorym jestes teraz zalogowany.',
      )
    }

    await client.query('begin')
    transactionStarted = true
    await client.query(
      'select pg_advisory_xact_lock(hashtext($1::text))',
      [`worker-delete:${payload.orgId}:${payload.login}`],
    )

    membership = await getRequesterMembership(
      client,
      payload.orgId,
      decodedToken.uid,
    )
    if (!isWorkerDeleteRole(membership?.role)) {
      throw workerProfileAccessError(membership, 'usuwania pracownikow')
    }

    currentWorker = await workerRepository.readWorkerForUpdate(
      client,
      payload.orgId,
      payload.login,
    )
    if (!currentWorker) {
      throw createWorkerProfilePublicError(
        404,
        'WORKER_NOT_FOUND',
        'Nie znaleziono pracownika do usuniecia.',
      )
    }
    ownerWorkerId = await workerRepository.getOrganizationOwnerWorkerId(
      client,
      payload.orgId,
    )
    if (ownerWorkerId && normalizeText(currentWorker.worker_id) === ownerWorkerId) {
      throw createWorkerProfilePublicError(
        403,
        'OWNER_WORKER_DELETE_FORBIDDEN',
        'Nie mo\u017cna usun\u0105\u0107 konta za\u0142o\u017cyciela organizacji.',
      )
    }
    if (isRequesterDeletingSelf(currentWorker, authUid, decodedToken)) {
      throw createWorkerProfilePublicError(
        400,
        'SELF_DELETE_BLOCKED',
        'Nie mozesz usunac konta, na ktorym jestes teraz zalogowany.',
      )
    }

    const deletedCounts = await workerRepository.deleteWorkerAccessRows(
      client,
      payload.orgId,
      payload.login,
      normalizeText(currentWorker.worker_id || payload.workerId),
      authUid,
    )
    await client.query('commit')
    transactionStarted = false

    let authDeleted = false
    if (!authUid) {
      try {
        const authMatch = await findFirebaseUserForWorker(currentWorker)
        authUid = normalizeText(authMatch.authUid)
        authWarning = appendWorkerProfileWarning(
          authWarning,
          normalizeText(authMatch.authWarning),
        )
      } catch (error) {
        const mapped = mapFirebaseAdminError(error)
        authWarning = appendWorkerProfileWarning(
          authWarning,
          `Profil usunieto z bazy, ale nie udalo sie wyszukac Firebase Auth: ${
            normalizeText(mapped.message || error?.message)
          }`,
        )
      }
    }
    if (authUid) {
      try {
        await ensureFirebaseAdmin().auth().deleteUser(authUid)
        authDeleted = true
      } catch (error) {
        if (isFirebaseUserNotFound(error)) {
          authWarning = appendWorkerProfileWarning(
            authWarning,
            'Konto Firebase Auth bylo juz usuniete.',
          )
        } else {
          const mapped = mapFirebaseAdminError(error)
          authWarning = appendWorkerProfileWarning(
            authWarning,
            `Profil usunieto z bazy, ale nie udalo sie usunac Firebase Auth: ${
              normalizeText(mapped.message || error?.message)
            }`,
          )
        }
      }
    } else {
      authWarning = appendWorkerProfileWarning(
        authWarning,
        'Nie znaleziono UID Firebase Auth; usunieto dane pracownika z bazy.',
      )
    }

    return {
      deletedLogin: payload.login,
      deletedCounts,
      authDeleted,
      authWarning,
      storage: 'database',
      persistenceVerified: true,
    }
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('rollback')
      } catch {
        // Ignore rollback failure; the original error remains authoritative.
      }
    }
    throw error
  } finally {
    client.release()
  }
}

async function handleAdminWorkerProfileDeleteRequest(req, res) {
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
    sendApiError(
      res,
      error?.message === 'REQUEST_BODY_TOO_LARGE' ? 413 : 400,
      error?.message === 'REQUEST_BODY_TOO_LARGE' ? 'REQUEST_TOO_LARGE' : 'INVALID_JSON',
      error?.message === 'REQUEST_BODY_TOO_LARGE'
        ? 'Zadanie jest zbyt duze.'
        : 'Niepoprawny JSON w zadaniu.',
    )
    return
  }

  const token = parseBearerToken(req)
  if (!token) {
    sendApiError(res, 401, 'UNAUTHENTICATED', 'Brak tokenu Firebase.')
    return
  }

  let decodedToken
  try {
    decodedToken = await verifySessionContextFirebaseIdToken(token)
  } catch (error) {
    sendFirebaseVerificationError(res, error)
    return
  }

  const { value: payload, validationErrors } = buildWorkerProfileDeletePayload(body)
  if (validationErrors.length) {
    sendApiError(res, 400, 'VALIDATION_ERROR', validationErrors[0], validationErrors)
    return
  }

  try {
    const data = await deleteWorkerProfileDatabase(payload, decodedToken)
    sendJson(res, 200, { ok: true, data })
  } catch (error) {
    sendWorkerProfileFailure(
      res,
      error,
      'WORKER_PROFILE_DELETE_FAILED',
      'Nie udalo sie usunac pracownika.',
      'Operacje pracownikow wymagaja gotowego schematu Cloud SQL.',
    )
  }
}

async function handleAdminWorkersRestoreRequest(req, res) {
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
    sendApiError(
      res,
      error?.message === 'REQUEST_BODY_TOO_LARGE' ? 413 : 400,
      error?.message === 'REQUEST_BODY_TOO_LARGE' ? 'REQUEST_TOO_LARGE' : 'INVALID_JSON',
      error?.message === 'REQUEST_BODY_TOO_LARGE'
        ? 'Zadanie jest zbyt duze.'
        : 'Niepoprawny JSON w zadaniu.',
    )
    return
  }

  const token = parseBearerToken(req)
  if (!token) {
    sendApiError(res, 401, 'UNAUTHENTICATED', 'Brak tokenu Firebase.')
    return
  }

  let decodedToken
  try {
    decodedToken = await verifySessionContextFirebaseIdToken(token)
  } catch (error) {
    sendFirebaseVerificationError(res, error)
    return
  }

  const orgId = normalizeOrgId(body?.orgId)
  const rows = Array.isArray(body?.rows) ? body.rows : null
  if (!orgId || !rows) {
    sendApiError(
      res,
      400,
      'VALIDATION_ERROR',
      'Podaj poprawne orgId oraz tablice rows z pracownikami.',
    )
    return
  }

  const client = await connectDbClient().catch((error) => {
    sendWorkerProfileFailure(
      res,
      error,
      'WORKER_RESTORE_FAILED',
      'Nie udalo sie polaczyc z baza podczas odtwarzania pracownikow.',
      'Odtwarzanie pracownikow wymaga gotowego Cloud SQL.',
    )
    return null
  })
  if (!client) return

  let transactionStarted = false
  try {
    await workerRepository.assertWorkerSchemaReady(client)
    const membership = await getRequesterMembership(
      client,
      orgId,
      decodedToken.uid,
    )
    if (normalizeRequesterRole(membership?.role) !== 'ADMIN') {
      throw workerProfileAccessError(membership, 'odtwarzania pracownikow z backupu')
    }

    await client.query('begin')
    transactionStarted = true
    const currentMembership = await getRequesterMembership(
      client,
      orgId,
      decodedToken.uid,
    )
    if (normalizeRequesterRole(currentMembership?.role) !== 'ADMIN') {
      throw workerProfileAccessError(
        currentMembership,
        'odtwarzania pracownikow z backupu',
      )
    }

    const restoredBy = normalizeRoleCode(currentMembership?.role) === PLATFORM_ROLE
      ? ''
      : normalizeEmail(decodedToken?.email) || normalizeText(decodedToken?.uid)
    const result = await workerRepository.restoreWorkers(
      client,
      orgId,
      rows,
      restoredBy,
    )
    await client.query('commit')
    transactionStarted = false

    sendJson(res, 200, {
      ok: true,
      data: {
        ...result,
        storage: 'database',
        persistenceVerified: true,
      },
    })
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('rollback')
      } catch {
        // Ignore rollback failure; the original error remains authoritative.
      }
    }
    sendWorkerProfileFailure(
      res,
      error,
      'WORKER_RESTORE_FAILED',
      'Nie udalo sie odtworzyc pracownikow z backupu.',
      'Odtwarzanie pracownikow wymaga gotowego schematu Cloud SQL.',
    )
  } finally {
    client.release()
  }
}

async function getNextWorkerIdPreviewDirect(orgId, requesterUid) {
  const client = await connectDbClient()
  try {
    await workerRepository.assertWorkerSchemaReady(client)
    const membership = await getRequesterMembership(client, orgId, requesterUid)
    if (!isWorkerManagementRole(membership?.role)) {
      throw workerProfileAccessError(membership, 'dodawania pracownikow')
    }
    const { reservations, workers } = await workerRepository.readWorkerIdRows(client, orgId)
    const ownerWorkerId = await workerRepository.getOrganizationOwnerWorkerId(client, orgId)
    const workerNumber = nextWorkerNumber(orgId, reservations, workers)
    return {
      workerId: buildWorkerId(orgId, workerNumber),
      workerNumber,
      ownerWorkerId,
      storage: 'database',
      persistenceVerified: true,
    }
  } finally {
    client.release()
  }
}

async function handleAdminWorkerIdNextRequest(req, res, requestUrl) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  if (req.method !== 'GET') {
    sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Dozwolona metoda to GET.')
    return
  }

  const token = parseBearerToken(req)
  if (!token) {
    sendApiError(res, 401, 'UNAUTHENTICATED', 'Brak tokenu Firebase.')
    return
  }

  let decodedToken
  try {
    decodedToken = await verifySessionContextFirebaseIdToken(token)
  } catch (error) {
    sendFirebaseVerificationError(res, error)
    return
  }

  const orgId = normalizeOrgId(requestUrl.searchParams.get('orgId'))
  if (!orgId) {
    sendApiError(res, 400, 'INVALID_ORG_ID', 'Brak poprawnego orgId.')
    return
  }

  try {
    const data = await getNextWorkerIdPreviewDirect(orgId, decodedToken.uid)
    sendJson(res, 200, { ok: true, data })
  } catch (error) {
    const databaseError = mapDatabaseConnectionError(error)
    if (databaseError) {
      sendApiError(res, databaseError.status, databaseError.code, databaseError.message)
      return
    }
    const status = Number(error?.statusCode ?? 500)
    sendApiError(
      res,
      Number.isFinite(status) ? status : 500,
      normalizeText(error?.publicCode) || 'WORKER_ID_PREVIEW_FAILED',
      normalizeText(error?.publicMessage) || 'Nie udalo sie wyznaczyc kolejnego ID pracownika.',
      publicErrorDetails(error),
    )
  }
}

async function handleAdminWorkersRequest(req, res, requestUrl) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  if (req.method !== 'GET') {
    sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Dozwolona metoda to GET.')
    return
  }

  const token = parseBearerToken(req)
  if (!token) {
    sendApiError(res, 401, 'UNAUTHENTICATED', 'Brak tokenu Firebase.')
    return
  }

  let decodedToken
  try {
    decodedToken = await verifySessionContextFirebaseIdToken(token)
  } catch (error) {
    sendFirebaseVerificationError(res, error)
    return
  }

  const orgId = normalizeOrgId(requestUrl.searchParams.get('orgId'))
  if (!orgId) {
    sendApiError(res, 400, 'INVALID_ORG_ID', 'Brak poprawnego orgId.')
    return
  }

  try {
    const data = await listWorkersDirect(orgId, decodedToken.uid)
    sendJson(res, 200, { ok: true, data })
  } catch (error) {
    const databaseError = mapDatabaseConnectionError(error)
    if (databaseError) {
      sendApiError(res, databaseError.status, databaseError.code, databaseError.message)
      return
    }
    const status = Number(error?.statusCode ?? 500)
    sendApiError(
      res,
      Number.isFinite(status) ? status : 500,
      normalizeText(error?.publicCode) || 'WORKERS_LIST_FAILED',
      normalizeText(error?.publicMessage) || 'Nie udalo sie pobrac pracownikow.',
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
    body = await readJsonBody(req, MAX_WORKER_PROFILE_PHOTO_BODY_BYTES)
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
    decodedToken = await verifySessionContextFirebaseIdToken(token)
  } catch (error) {
    logAdminUsersError(error, 'verify-token')
    sendFirebaseVerificationError(res, error)
    return
  }

  const { value: payload, validationErrors } = buildUserPayload(body, decodedToken)
  if (validationErrors.length) {
    sendApiError(res, 400, 'VALIDATION_ERROR', validationErrors[0], validationErrors)
    return
  }

  try {
    const user = await createAdminManagedUserDatabase(payload, decodedToken.uid)
    sendJson(res, 201, { ok: true, data: { user } })
  } catch (error) {
    logAdminUsersError(error, 'create-user')
    if (error?.message === 'DB_CONFIG_MISSING') {
      sendApiError(res, 503, 'DB_CONFIG_MISSING', 'Brak konfiguracji polaczenia z baza danych.')
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

function assertVerifiedTenantEmail(decodedToken) {
  if (decodedToken?.email_verified !== true || !normalizeEmail(decodedToken?.email)) {
    const error = new Error('EMAIL_VERIFICATION_REQUIRED')
    error.statusCode = 403
    error.publicCode = 'EMAIL_VERIFICATION_REQUIRED'
    error.publicMessage = 'Potwierdź adres email przed wejściem do portalu Cleanzi.'
    throw error
  }
  return decodedToken
}

function sendPortalServiceError(res, error, fallbackCode, fallbackMessage) {
  const databaseError = mapDatabaseConnectionError(error)
  if (databaseError) {
    sendApiError(res, databaseError.status, databaseError.code, databaseError.message)
    return
  }
  sendApiError(
    res,
    Number(error?.statusCode) || 500,
    normalizeText(error?.publicCode) || fallbackCode,
    normalizeText(error?.publicMessage) || fallbackMessage,
    publicErrorDetails(error),
  )
}

async function authenticateVerifiedTenantRequest(req) {
  const token = parseBearerToken(req)
  if (!token) {
    const error = new Error('UNAUTHENTICATED')
    error.statusCode = 401
    error.publicCode = 'UNAUTHENTICATED'
    error.publicMessage = 'Brak tokenu Firebase.'
    throw error
  }
  return assertVerifiedTenantEmail(await verifyFirebaseIdToken(token))
}

async function handlePortalOrganizationsRequest(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  if (req.method !== 'POST') {
    sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Dozwolona metoda to POST.')
    return
  }

  let client = null
  try {
    const decodedToken = await authenticateVerifiedTenantRequest(req)
    const body = await readJsonBody(req)
    client = await connectDbClient()
    const organization = await createOrganizationWithTrial(client, {
      uid: decodedToken.uid,
      email: decodedToken.email,
      organizationName: body?.organizationName ?? body?.name,
      ownerFullName: body?.ownerFullName ?? decodedToken.name,
    })
    sendJson(res, 201, { ok: true, data: { organization } })
  } catch (error) {
    sendPortalServiceError(res, error, 'ORGANIZATION_CREATE_FAILED', 'Nie udało się utworzyć organizacji.')
  } finally {
    client?.release?.()
  }
}

async function handlePortalOrganizationProfileRequest(req, res, requestUrl) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  const method = String(req.method || 'GET').toUpperCase()
  if (!['GET', 'PUT'].includes(method)) {
    sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Dozwolone metody to GET i PUT.')
    return
  }

  let client = null
  try {
    const decodedToken = await authenticateVerifiedTenantRequest(req)
    const body = method === 'PUT' ? await readJsonBody(req) : {}
    const orgId = normalizeOrgId(method === 'GET' ? requestUrl.searchParams.get('orgId') : body?.orgId)
    if (!orgId) throw Object.assign(new Error('INVALID_ORG_ID'), {
      statusCode: 400,
      publicCode: 'INVALID_ORG_ID',
      publicMessage: 'Brak poprawnego orgId.',
    })
    client = await connectDbClient()
    const membership = await getRequesterMembership(client, orgId, decodedToken.uid, { allowOnboarding: true })
    const role = normalizeRoleCode(membership?.role)
    if (!['OWNER', 'ADMIN', 'ADMINISTRATOR', 'SUPERADMIN'].includes(role)) {
      throw Object.assign(new Error('FORBIDDEN'), {
        statusCode: membership ? 403 : 404,
        publicCode: membership ? 'FORBIDDEN' : 'ORG_ACCESS_MISSING',
        publicMessage: 'Profil firmy może odczytać i edytować tylko Owner lub administrator.',
      })
    }
    if (normalizeText(membership.organization_status).toUpperCase() !== 'ACTIVE' || membership.organization_deleted_at) {
      throw Object.assign(new Error('ORGANIZATION_UNAVAILABLE'), {
        statusCode: 403,
        publicCode: 'ORGANIZATION_UNAVAILABLE',
        publicMessage: 'Organizacja jest nieaktywna.',
      })
    }
    const data = method === 'GET'
      ? await readOrganizationProfile(client, orgId)
      : await updateOrganizationProfile(client, {
          orgId,
          uid: decodedToken.uid,
          version: body?.version,
          profile: body?.profile,
        })
    sendJson(res, 200, { ok: true, data })
  } catch (error) {
    sendPortalServiceError(res, error, 'ORGANIZATION_PROFILE_FAILED', 'Nie udało się obsłużyć profilu firmy.')
  } finally {
    client?.release?.()
  }
}

async function handlePortalCompanyRegistryRequest(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  if (req.method !== 'POST') {
    sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Dozwolona metoda to POST.')
    return
  }
  try {
    const decodedToken = await authenticateVerifiedTenantRequest(req)
    const body = await readJsonBody(req)
    const company = await lookupCompanyByNip(body?.nip, {
      apiKey: process.env.GUS_BIR1_API_KEY,
      endpoint: process.env.GUS_BIR1_ENDPOINT,
      rateLimitKey: decodedToken.uid,
    })
    sendJson(res, 200, { ok: true, data: { company } })
  } catch (error) {
    sendPortalServiceError(res, error, 'COMPANY_LOOKUP_FAILED', 'Nie udało się pobrać danych firmy.')
  }
}

async function handleStripeWebhookRequest(req, res) {
  if (req.method !== 'POST') {
    sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Dozwolona metoda to POST.')
    return
  }
  let client = null
  try {
    const rawBody = await readRequestBody(req, 512 * 1024)
    const event = verifyStripeSignature(
      rawBody,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET,
    )
    client = await connectDbClient()
    const result = await processStripeEvent(client, event, {
      secretKey: process.env.STRIPE_SECRET_KEY,
      env: process.env,
    })
    sendJson(res, 200, { ok: true, data: result })
  } catch (error) {
    sendPortalServiceError(res, error, 'STRIPE_WEBHOOK_FAILED', 'Nie udało się przetworzyć webhooka Stripe.')
  } finally {
    client?.release?.()
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
    decodedToken = await verifySessionContextFirebaseIdToken(token)
  } catch (error) {
    const mapped = mapFirebaseAdminError(error)
    sendApiError(res, mapped.status, mapped.code, mapped.message)
    return
  }

  const rawRequestedOrgId = method === 'GET' ? requestUrl.searchParams.get('orgId') : body?.orgId
  const requestedOrgId = normalizeOrgId(rawRequestedOrgId)
  if (method === 'POST' && !requestedOrgId) {
    sendApiError(res, 400, 'INVALID_ORG_ID', 'Brak poprawnego orgId.')
    return
  }
  if (rawRequestedOrgId && !requestedOrgId) {
    sendApiError(res, 400, 'INVALID_ORG_ID', 'Brak poprawnego orgId.')
    return
  }

  const requesterUid = normalizeText(decodedToken?.uid)
  let client = null

  try {
    client = await connectDbClient()
    if (hasPlatformOwnerClaim(decodedToken)) {
      const principal = await platformRepository.assertPlatformPrincipal(client, decodedToken, { requireMfa: false })
      if (!principal.mfaVerified) {
        sendJson(res, 200, {
          ok: true,
          status: 'PLATFORM_MFA_ENROLLMENT_REQUIRED',
          context: {
            uid: principal.uid,
            email: principal.email,
            name: principal.displayName,
            actorType: 'PLATFORM',
            role: PLATFORM_ROLE,
            roleCode: PLATFORM_ROLE,
            roleLevel: 4,
            mfaMethod: '',
          },
        })
        return
      }

      if (requestedOrgId) {
        const requestContext = getPlatformRequestContext()
        const accessContext = await platformRepository.getActiveAccessContext(client, {
          uid: principal.uid,
          orgId: requestedOrgId,
          contextId: normalizeText(requestContext?.platformContextId),
        })
        if (!accessContext || !normalizeText(requestContext?.platformContextId)) {
          sendApiError(res, 403, 'PLATFORM_CONTEXT_INVALID', 'Kontekst organizacji jest zamknięty albo nie odpowiada żądaniu.')
          return
        }
        const rawPlanCode = normalizeText(accessContext.plan_code).toUpperCase()
        const planCode = normalizePlanCode(rawPlanCode)
        const entitlements = resolvePlanEntitlements(planCode)
        const capabilities = profitabilityCapabilities({
          requestOrgId: normalizeText(accessContext.org_id),
          actor: {
            uid: principal.uid,
            role: PLATFORM_ROLE,
            actorType: 'PLATFORM',
            activeOrgId: normalizeText(accessContext.org_id),
            platformContextId: normalizeText(accessContext.context_id),
          },
          subscription: {
            planCode,
            status: normalizeText(accessContext.subscription_status),
          },
          accessContext: {
            contextId: normalizeText(accessContext.context_id),
            adminUid: normalizeText(accessContext.admin_uid),
            orgId: normalizeText(accessContext.org_id),
            reason: normalizeText(accessContext.reason),
            openedAt: accessContext.opened_at,
            closedAt: accessContext.closed_at,
          },
        })
        sendJson(res, 200, {
          ok: true,
          status: 'READY',
          context: {
            uid: principal.uid,
            actorType: 'PLATFORM',
            activeOrgId: normalizeText(accessContext.org_id),
            organizationName: normalizeText(accessContext.organization_name),
            organizationStatus: normalizeText(accessContext.organization_status),
            organizationDeletedAt: accessContext.organization_deleted_at || null,
            workerId: '',
            role: PLATFORM_ROLE,
            roleCode: PLATFORM_ROLE,
            roleLevel: 4,
            rawPlanCode,
            planCode,
            planName: entitlements.planName,
            subscriptionStatus: normalizeText(accessContext.subscription_status),
            subscriptionEndsAt:
              planCode === 'TRIAL'
                ? accessContext.trial_ends_at || null
                : accessContext.current_period_ends_at || null,
            platformContextId: normalizeText(accessContext.context_id),
            platformReason: normalizeText(accessContext.reason),
            mfaMethod: principal.mfaMethod,
            limits: entitlements.limits,
            capabilities: {
              ...entitlements.capabilities,
              ...capabilities,
            },
          },
        })
        return
      }

      sendJson(res, 200, {
        ok: true,
        status: 'PLATFORM_SELECTION_REQUIRED',
        context: {
          uid: principal.uid,
          email: principal.email,
          name: principal.displayName,
          actorType: 'PLATFORM',
          role: PLATFORM_ROLE,
          roleCode: PLATFORM_ROLE,
          roleLevel: 4,
          mfaMethod: principal.mfaMethod,
        },
      })
      return
    }

    const rows = await getRequesterMemberships(client, requesterUid)
    const emailEligibleRows = rows.filter((row) => evaluateTenantEmailVerification(
      decodedToken,
      row,
      process.env.TENANT_EMAIL_VERIFICATION_REQUIRED_FROM,
    ).allowed)
    if (decodedToken?.email_verified !== true && !emailEligibleRows.length) {
      sendJson(res, 200, {
        ok: true,
        status: 'EMAIL_VERIFICATION_REQUIRED',
        context: {
          uid: requesterUid,
          email: normalizeEmail(decodedToken?.email),
          actorType: 'ORGANIZATION',
        },
      })
      return
    }

    const accessibleOrganizations = resolveAccessibleOrganizations(emailEligibleRows, new Date())
    const organizationSummaries = accessibleOrganizations.map(buildOrganizationSummary)

    if (requestedOrgId) {
      const selected = accessibleOrganizations.find((row) => normalizeOrgId(row.org_id) === requestedOrgId)
      if (!selected) {
        sendApiError(res, 403, 'ORG_ACCESS_DENIED', 'Brak dostepu do wybranej organizacji.')
        return
      }

      const context = await buildOrganizationSessionContext(client, requesterUid, selected)
      context.organizations = organizationSummaries
      sendJson(res, 200, {
        ok: true,
        status: 'READY',
        context,
      })
      return
    }

    if (!accessibleOrganizations.length) {
      sendJson(res, 200, {
        ok: true,
        status: 'ORGANIZATION_ONBOARDING_REQUIRED',
        organizations: [],
      })
      return
    }

    if (accessibleOrganizations.length === 1) {
      const context = await buildOrganizationSessionContext(client, requesterUid, accessibleOrganizations[0])
      context.organizations = organizationSummaries
      sendJson(res, 200, {
        ok: true,
        status: 'READY',
        context,
      })
      return
    }

    sendJson(res, 200, {
      ok: true,
      status: 'ORG_SELECTION_REQUIRED',
      organizations: organizationSummaries,
    })
  } catch (error) {
    const mappedDb = mapDatabaseConnectionError(error)
    if (mappedDb) {
      sendApiError(res, mappedDb.status, mappedDb.code, mappedDb.message)
      return
    }

    sendApiError(res, 500, 'AUTH_CONTEXT_ERROR', error?.message || 'Nie udaĹ‚o siÄ™ pobraÄ‡ organizacji uĹĽytkownika.')
  } finally {
    client?.release()
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

const PORTAL_ZONE_QR_FUNCTIONS = new Set([
  'START',
  'STOP',
  'STOP0',
  'STOP5',
  'STOP10',
  'STOP15',
  'CLEAN',
  'STREFA_SPECJALNA',
])
const PORTAL_ZONE_QR_MAX_QUANTITY = 100
const PORTAL_ZONE_QR_UNASSIGNED_CLIENT_ID = 'UNASSIGNED'

function normalizePortalZoneQrFunctions(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > PORTAL_ZONE_QR_FUNCTIONS.size) return []
  const functions = value.map((entry) => normalizeText(entry).toUpperCase())
  if (functions.some((entry) => !PORTAL_ZONE_QR_FUNCTIONS.has(entry))) return []
  if (new Set(functions).size !== functions.length) return []
  return functions
}

function normalizePortalZoneQrQuantity(value) {
  const quantity = Number(value ?? 1)
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > PORTAL_ZONE_QR_MAX_QUANTITY) return 0
  return quantity
}

function normalizePortalZoneQrItems(body) {
  if (Array.isArray(body?.items)) {
    if (body.items.length < 1 || body.items.length > PORTAL_ZONE_QR_FUNCTIONS.size) return []
    const items = body.items.map((item) => ({
      function: normalizeText(item?.function).toUpperCase(),
      quantity: normalizePortalZoneQrQuantity(item?.quantity),
    }))
    if (items.some((item) => !PORTAL_ZONE_QR_FUNCTIONS.has(item.function) || !item.quantity)) return []
    if (new Set(items.map((item) => item.function)).size !== items.length) return []
    return items
  }

  const functions = normalizePortalZoneQrFunctions(body?.functions)
  const quantity = normalizePortalZoneQrQuantity(body?.quantity)
  if (!functions.length || !quantity) return []
  return functions.map((functionName) => ({ function: functionName, quantity }))
}

function portalZoneQrOrgToken(orgId) {
  const token = normalizeText(orgId)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 42)
  return token || 'org'
}

function portalZoneQrNullableText(value, maxLength = 500) {
  const text = normalizeText(value)
  return text ? text.slice(0, maxLength) : null
}

async function requirePortalZoneQrAccess(client, orgId, uid) {
  const membership = await getRequesterMembership(client, orgId, uid)
  assertMembershipPlanCapability(membership, 'timeQrNfc')
  const role = normalizeRequesterRole(membership?.role)
  if (!['ADMIN', 'MANAGER', 'OWNER', 'PLATFORM_OWNER'].includes(role)) {
    const error = new Error('FORBIDDEN')
    error.statusCode = membership ? 403 : 404
    error.publicCode = membership ? 'FORBIDDEN' : 'ORG_ACCESS_MISSING'
    error.publicMessage = membership
      ? 'Brak uprawnień do generowania kodów QR stref.'
      : 'Brak dostępu do tej organizacji.'
    throw error
  }
  return { membership, role }
}

async function insertPortalZoneQrCodes(client, { orgId, items, clientId, zone, editedBy }) {
  const orgToken = portalZoneQrOrgToken(orgId)
  const idPrefix = `QRC_${orgToken}_Z`
  let transactionStarted = false

  try {
    await client.query('begin')
    transactionStarted = true
    await client.query(
      "select pg_advisory_xact_lock(hashtext('portal-zone-qr'), hashtext($1::text))",
      [orgId],
    )

    let clientName = null
    let storedClientId = clientId
    if (clientId) {
      const clientResult = await client.query(
        `select name
           from public.client
          where org_id = $1::text
            and client_id = $2::text
          limit 1`,
        [orgId, clientId],
      )
      if (!clientResult.rows[0]) {
        const error = new Error('INVALID_CLIENT_ID')
        error.statusCode = 400
        error.publicCode = 'INVALID_CLIENT_ID'
        error.publicMessage = 'Wybrany klient nie należy do aktywnej organizacji.'
        throw error
      }
      clientName = portalZoneQrNullableText(clientResult.rows[0].name, 500)
    } else {
      const unassignedClientResult = await client.query(
        `select 1
           from public.client
          where org_id = $1::text
            and client_id = $2::text
          limit 1`,
        [orgId, PORTAL_ZONE_QR_UNASSIGNED_CLIENT_ID],
      )
      if (unassignedClientResult.rows[0]) {
        storedClientId = PORTAL_ZONE_QR_UNASSIGNED_CLIENT_ID
      }
    }

    const existingResult = await client.query(
      `select id
         from public.zone
        where org_id = $1::text
          and left(id, length($2::text)) = $2::text`,
      [orgId, idPrefix],
    )
    let maxNumber = 0n
    for (const row of existingResult.rows) {
      const suffix = normalizeText(row?.id).slice(idPrefix.length)
      if (!/^\d+$/.test(suffix)) continue
      const number = BigInt(suffix)
      if (number > maxNumber) maxNumber = number
    }

    const created = []
    for (const item of items) {
      for (let copyIndex = 0; copyIndex < item.quantity; copyIndex += 1) {
        maxNumber += 1n
        const zoneId = `${idPrefix}${maxNumber.toString()}`
        if (zoneId.length > 64) {
          const error = new Error('ZONE_QR_ID_TOO_LONG')
          error.statusCode = 422
          error.publicCode = 'ZONE_QR_ID_TOO_LONG'
          error.publicMessage = 'Nie można przydzielić kolejnego numeru kodu QR.'
          throw error
        }
        const result = await client.query(
          `insert into public.zone (
             org_id,
             id,
             client_id,
             zone,
             function,
             edited_by,
             date,
             location
           )
           values ($1::text, $2::text, $3::text, $4::text, $5::text, $6::text, now(), null)
           returning id, client_id, zone, function, edited_by, date, location`,
          [orgId, zoneId, storedClientId, zone, item.function, editedBy],
        )
        const row = result.rows[0]
        created.push({
          id: normalizeText(row?.id),
          zoneId: normalizeText(row?.id),
          qr: normalizeText(row?.id),
          orgId,
          clientId:
            normalizeText(row?.client_id).toUpperCase() === PORTAL_ZONE_QR_UNASSIGNED_CLIENT_ID
              ? ''
              : normalizeText(row?.client_id),
          clientName: clientName || '',
          name: normalizeText(row?.zone),
          zone: normalizeText(row?.zone),
          function: normalizeText(row?.function),
          editedBy: normalizeText(row?.edited_by),
          date: row?.date instanceof Date ? row.date.toISOString() : normalizeText(row?.date),
          location: normalizeText(row?.location),
        })
      }
    }

    await client.query('commit')
    transactionStarted = false
    return created
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('rollback')
      } catch (rollbackError) {
        console.error('[portal/zones/qr-codes] rollback failed', rollbackError)
      }
    }
    throw error
  }
}

async function handlePortalZoneQrCodesRequest(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (String(req.method || '').toUpperCase() !== 'POST') {
    sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Dozwolona metoda to POST.')
    return
  }

  let body = {}
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

  const orgId = normalizeOrgId(body?.orgId)
  if (!orgId) {
    sendApiError(res, 400, 'INVALID_ORG_ID', 'Brak poprawnego orgId.')
    return
  }
  const items = normalizePortalZoneQrItems(body)
  if (!items.length) {
    sendApiError(
      res,
      400,
      'INVALID_ZONE_QR_ITEMS',
      `Wybierz obsługiwane funkcje i podaj dla każdej ilość od 1 do ${PORTAL_ZONE_QR_MAX_QUANTITY}.`,
    )
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
  const clientId = portalZoneQrNullableText(body?.clientId, 64)
  const zone = portalZoneQrNullableText(body?.zone, 500)
  const editedBy = portalZoneQrNullableText(decodedToken?.email || requesterUid, 120)
  let client = null
  try {
    client = await connectDbClient()
    const access = await requirePortalZoneQrAccess(client, orgId, requesterUid)
    if (items.some((item) => item.function === 'CLEAN' || item.function === 'STREFA_SPECJALNA')) {
      assertMembershipPlanCapability(access.membership, 'zoneTasks')
    }
    const codes = await insertPortalZoneQrCodes(client, {
      orgId,
      items,
      clientId,
      zone,
      editedBy,
    })
    sendJson(res, 201, { ok: true, data: { codes } })
  } catch (error) {
    logPortalStorageError('portal/zones/qr-codes', error)
    const mappedDb = mapDatabaseConnectionError(error)
    if (mappedDb) {
      sendApiError(res, mappedDb.status, mappedDb.code, mappedDb.message, publicErrorDetails(error))
      return
    }
    const isConflict = error?.code === '23505'
    const publicMessage = isConflict
      ? 'Nie udało się przydzielić unikalnego numeru. Spróbuj ponownie.'
      : normalizeText(error?.publicMessage) ||
        (isLocalDevelopmentRuntime() && normalizeText(error?.message)
          ? `Nie udało się wygenerować kodów QR: ${normalizeText(error.message).slice(0, 300)}`
          : 'Nie udało się wygenerować kodów QR.')
    sendApiError(
      res,
      isConflict ? 409 : error?.statusCode || 500,
      isConflict ? 'ZONE_QR_CONFLICT' : normalizeText(error?.publicCode) || 'PORTAL_ZONE_QR_ERROR',
      publicMessage,
      publicErrorDetails(error),
    )
  } finally {
    client?.release?.()
  }
}

async function requirePortalTaskAccess(client, orgId, uid, { write = false, remove = false } = {}) {
  const membership = await getRequesterMembership(client, orgId, uid)
  assertMembershipPlanCapability(membership, 'zoneTasks')
  const role = normalizeRequesterRole(membership?.role)
  const allowed = remove
    ? ['ADMIN']
    : write
      ? ['ADMIN', 'MANAGER']
      : ['ADMIN', 'MANAGER', 'COORDINATOR']
  if (!allowed.includes(role)) {
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
  'lifecycle_status',
  'cancelled_at',
  'archived_at',
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

const PORTAL_SCHEDULE_ORDER_SERVICE_BLOCKS_PAYLOAD_MARKER = 'cleanz_service_blocks_v2'

function portalScheduleOrderServicePayloadFromRules(value) {
  const rules = portalScheduleOrderJsonValue(value, [])
  const source = Array.isArray(rules) ? rules : []
  return source.find((item) => item && typeof item === 'object' && item.marker === PORTAL_SCHEDULE_ORDER_SERVICE_BLOCKS_PAYLOAD_MARKER) || null
}

function portalScheduleOrderRulesWithoutServicePayload(value) {
  const rules = portalScheduleOrderJsonValue(value, [])
  return Array.isArray(rules)
    ? rules.filter((item) => !(item && typeof item === 'object' && item.marker === PORTAL_SCHEDULE_ORDER_SERVICE_BLOCKS_PAYLOAD_MARKER))
    : []
}

function portalScheduleOrderServicePayloadFromOrder(order = {}) {
  const serviceBlocks = portalScheduleOrderFirstJsonValue([], order.serviceBlocks, order.service_blocks)
  if (!Array.isArray(serviceBlocks) || !serviceBlocks.length) {
    return null
  }
  const recurrenceEndDate = normalizePortalScheduleOrderDate(
    order.repeatUntil ??
      order.repeatEndDate ??
      order.recurrenceEndDate ??
      order.seriesEndDate ??
      order.repeatUntilYmd,
  )
  const recurrenceSkippedDates = [
    ...(Array.isArray(order.recurrenceSkippedDates) ? order.recurrenceSkippedDates : []),
    ...(Array.isArray(order.recurrenceExceptionDates) ? order.recurrenceExceptionDates : []),
    ...(Array.isArray(order.skipDates) ? order.skipDates : []),
  ]
    .map((value) => normalizePortalScheduleOrderDate(value))
    .filter((value, index, values) => value && values.indexOf(value) === index)
    .sort()
  const recurrenceSourceOrderId = portalScheduleOrderNullableText(
    order.sourceOrderId ?? order.recurrenceSourceOrderId ?? order.parentOrderId,
    180,
  )
  const recurrenceOriginalDateYmd = normalizePortalScheduleOrderDate(
    order.recurrenceOriginalDateYmd ??
      order.recurrenceOverrideDateYmd ??
      order.occurrenceDateYmd,
  )
  const objectAccessWindows = portalScheduleOrderFirstJsonValue(
    [],
    order.objectAccessWindows,
    order.object_access_windows,
    order.accessWindows,
    order.access_windows,
  )
  return {
    marker: PORTAL_SCHEDULE_ORDER_SERVICE_BLOCKS_PAYLOAD_MARKER,
    version: portalScheduleOrderInteger(order.serviceModelVersion ?? order.service_model_version, 2) || 2,
    recurrenceEndDate: recurrenceEndDate || null,
    recurrenceSkippedDates,
    recurrenceSourceOrderId,
    recurrenceOverride: Boolean(order.recurrenceOverride),
    recurrenceOverrideKind: portalScheduleOrderNullableText(order.recurrenceOverrideKind, 40),
    recurrenceOriginalDateYmd: recurrenceOriginalDateYmd || null,
    serviceBlocks,
    objectAccessWindows: Array.isArray(objectAccessWindows) ? objectAccessWindows : [],
  }
}

function portalScheduleOrderWeeklyRulesForDb(order = {}) {
  const baseRules = portalScheduleOrderRulesWithoutServicePayload(order.weeklyScheduleRules ?? order.weekly_schedule_rules)
  const servicePayload = portalScheduleOrderServicePayloadFromOrder(order)
  return servicePayload ? [...baseRules, servicePayload] : baseRules
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
  const hasExplicitSlotIdentity = Boolean(normalizeText(
    item.serviceBlockId ??
      item.service_block_id ??
      item.teamId ??
      item.team_id ??
      item.slotId ??
      item.slot_id ??
      item.workSlotId ??
      item.work_slot_id ??
      item.allocationId ??
      item.allocation_id,
  ))
  const workerId = portalScheduleOrderWorkerId(
    item.workerId ?? item.worker_id ?? (hasExplicitSlotIdentity ? '' : item.id ?? rawKey),
  )
  const name = portalScheduleOrderNullableText(item.name ?? item.workerName ?? item.worker_label ?? item.workerLabel ?? item.label, 240)
  const serviceBlockId =
    portalScheduleOrderNullableText(item.serviceBlockId ?? item.service_block_id ?? item.teamId ?? item.team_id, 180) || ''
  const slotId =
    portalScheduleOrderNullableText(
      item.slotId ??
        item.slot_id ??
        item.workSlotId ??
        item.work_slot_id ??
        item.allocationId ??
        item.allocation_id ??
        (serviceBlockId ? item.id : ''),
      180,
    ) || ''
  const allocationId =
    portalScheduleOrderNullableText(item.allocationId ?? item.allocation_id ?? slotId, 180) || ''
  const workSlotKey =
    portalScheduleOrderNullableText(
      item.workSlotKey ??
        item.work_slot_key ??
        item.slotKey ??
        item.slot_key ??
        ((serviceBlockId || slotId) ? rawKey : ''),
      255,
    ) || ''
  const startTime = normalizePortalScheduleOrderTime(item.startTime ?? item.start_time ?? item.planStartTime ?? item.plan_start_time)
  const endTime = normalizePortalScheduleOrderTime(item.endTime ?? item.end_time ?? item.planEndTime ?? item.plan_end_time)
  const dateYmd = normalizePortalScheduleOrderDate(item.dateYmd ?? item.date_ymd ?? item.planDateYmd ?? item.plan_date_ymd)
  const endDateYmd = normalizePortalScheduleOrderDate(
    item.endDateYmd ?? item.end_date_ymd ?? item.planEndDateYmd ?? item.plan_end_date_ymd,
  )
  const loweredKey = normalizeText(rawKey || workerId || name).toLowerCase()
  const isBuffer = loweredKey === 'buffer' || loweredKey === 'bufor' || normalizeText(name).toLowerCase() === 'bufor'
  const row = portalScheduleOrderInteger(item.row ?? item.rowIndex, index)
  return {
    row: Number.isInteger(row) && row >= 0 ? row : index,
    workerId: isBuffer ? '' : workerId,
    key: isBuffer ? 'buffer' : portalScheduleOrderWorkerKey(rawKey || workerId),
    name: name || (isBuffer ? 'BUFOR' : workerId),
    workerLogin: portalScheduleOrderNullableText(item.workerLogin ?? item.worker_login ?? item.login, 80) || '',
    workerKey: portalScheduleOrderNullableText(item.workerKey ?? item.worker_key, 128) || '',
    serviceBlockId,
    allocationId,
    slotId,
    workSlotKey,
    dateYmd,
    planDateYmd: dateYmd,
    endDateYmd,
    planEndDateYmd: endDateYmd,
    startTime,
    planStartTime: startTime,
    endTime,
    planEndTime: endTime,
    allocationMinutes: portalScheduleOrderInteger(item.allocationMinutes ?? item.allocation_minutes ?? item.minutes ?? item.workMinutes, null),
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

function portalScheduleOrderNullableTimestamp(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString()
  const text = normalizeText(value)
  if (!text) return null
  const parsed = Date.parse(text)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
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
  const lifecycleStatus = normalizeScheduleOrderLifecycleStatus(
    order.lifecycleStatus ??
    order.lifecycle_status ??
    order.planningStatus ??
    order.planning_status,
  )
  const cancelledAt = lifecycleStatus === 'CANCELLED'
    ? portalScheduleOrderNullableTimestamp(
      order.cancelledAt ?? order.cancelled_at ?? order.canceledAt ?? order.canceled_at ?? nowIso,
    )
    : null
  const archivedAt = lifecycleStatus === 'ARCHIVED'
    ? portalScheduleOrderNullableTimestamp(order.archivedAt ?? order.archived_at ?? nowIso)
    : null
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
    created_by_uid: uid
      ? portalScheduleOrderNullableText(order.createdByUid ?? order.created_by_uid ?? order.createdBy ?? uid, 128)
      : null,
    lifecycle_status: lifecycleStatus,
    cancelled_at: cancelledAt,
    archived_at: archivedAt,
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
    updated_by_uid: uid ? portalScheduleOrderNullableText(uid, 128) : null,
    weekly_schedule_rules: JSON.stringify(portalScheduleOrderWeeklyRulesForDb(order)),
    work_allocations: JSON.stringify(allocations),
    worker_comment: portalScheduleOrderNullableText(order.workerComment ?? order.worker_comment ?? order.workerOnlyComment, 4000),
    worker_id: primaryAllocation?.workerId || portalScheduleOrderNullableText(order.workerId ?? order.worker_id, 128),
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
  const servicePayload = portalScheduleOrderServicePayloadFromRules(row.weekly_schedule_rules ?? row.weeklyScheduleRules)
  const recurrenceEndDate = normalizePortalScheduleOrderDate(
    row.recurrence_end_date ??
      row.recurrenceEndDate ??
      row.repeat_until ??
      row.repeatUntil ??
      row.repeat_end_date ??
      row.repeatEndDate ??
      servicePayload?.recurrenceEndDate ??
      servicePayload?.recurrence_end_date,
  )
  const recurrenceSkippedDates = (Array.isArray(servicePayload?.recurrenceSkippedDates)
    ? servicePayload.recurrenceSkippedDates
    : []
  )
    .map((value) => normalizePortalScheduleOrderDate(value))
    .filter((value, index, values) => value && values.indexOf(value) === index)
    .sort()
  const recurrenceSourceOrderId = portalScheduleOrderNullableText(servicePayload?.recurrenceSourceOrderId, 180)
  const recurrenceOriginalDateYmd = normalizePortalScheduleOrderDate(servicePayload?.recurrenceOriginalDateYmd)
  const weeklyScheduleRules = portalScheduleOrderRulesWithoutServicePayload(row.weekly_schedule_rules ?? row.weeklyScheduleRules)
  const serviceBlocks = Array.isArray(servicePayload?.serviceBlocks) ? servicePayload.serviceBlocks : []
  const objectAccessWindows = Array.isArray(servicePayload?.objectAccessWindows) ? servicePayload.objectAccessWindows : accessWindows
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
    lifecycleStatus: normalizeScheduleOrderLifecycleStatus(row.lifecycle_status ?? row.lifecycleStatus),
    cancelledAt: portalScheduleOrderNullableTimestamp(
      row.cancelled_at ?? row.cancelledAt ?? row.canceled_at ?? row.canceledAt,
    ),
    canceledAt: portalScheduleOrderNullableTimestamp(
      row.cancelled_at ?? row.cancelledAt ?? row.canceled_at ?? row.canceledAt,
    ),
    archivedAt: portalScheduleOrderNullableTimestamp(row.archived_at ?? row.archivedAt),
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
    accessWindows: Array.isArray(objectAccessWindows) ? objectAccessWindows : [],
    objectAccessWindows: Array.isArray(objectAccessWindows) ? objectAccessWindows : [],
    accessTimeWindows: Array.isArray(objectAccessWindows) ? objectAccessWindows : [],
    buildingAccessWindows: Array.isArray(objectAccessWindows) ? objectAccessWindows : [],
    requiredWorkMinutes: portalScheduleOrderInteger(row.required_work_minutes ?? row.requiredWorkMinutes, null),
    requiredPeople: portalScheduleOrderInteger(row.required_people ?? row.requiredPeople, 0),
    workAllocations: allocations,
    workerId: portalScheduleOrderNullableText(row.worker_id ?? row.workerId, 128),
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
    repeatUntil: recurrenceEndDate,
    repeatEndDate: recurrenceEndDate,
    recurrenceEndDate,
    seriesEndDate: recurrenceEndDate,
    repeatUntilYmd: recurrenceEndDate,
    recurrenceSkippedDates,
    recurrenceExceptionDates: recurrenceSkippedDates,
    skipDates: recurrenceSkippedDates,
    sourceOrderId: recurrenceSourceOrderId,
    recurrenceSourceOrderId,
    parentOrderId: recurrenceSourceOrderId,
    recurrenceOverride: Boolean(servicePayload?.recurrenceOverride),
    recurrenceOverrideKind: portalScheduleOrderNullableText(servicePayload?.recurrenceOverrideKind, 40),
    recurrenceOriginalDateYmd,
    recurrenceOverrideDateYmd: recurrenceOriginalDateYmd,
    occurrenceDateYmd: recurrenceOriginalDateYmd,
    weeklyScheduleRules: Array.isArray(weeklyScheduleRules) ? weeklyScheduleRules : [],
    weeklyPattern: Array.isArray(weeklyScheduleRules) ? weeklyScheduleRules : [],
    repeatDayRules: Array.isArray(weeklyScheduleRules) ? weeklyScheduleRules : [],
    dayScheduleRules: Array.isArray(weeklyScheduleRules) ? weeklyScheduleRules : [],
    serviceModelVersion: portalScheduleOrderInteger(servicePayload?.version, serviceBlocks.length ? 2 : null),
    serviceBlocks,
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

function mergePortalScheduleOrders(existingOrders = [], incomingOrders = []) {
  const merged = new Map()
  for (const order of Array.isArray(existingOrders) ? existingOrders : []) {
    const id = sanitizePortalScheduleOrderId(order?.id ?? order?.idTask ?? order?.id_task)
    if (id) merged.set(id, order)
  }
  for (const order of Array.isArray(incomingOrders) ? incomingOrders : []) {
    const id = sanitizePortalScheduleOrderId(order?.id ?? order?.idTask ?? order?.id_task)
    if (id) merged.set(id, order)
  }
  return sortPortalScheduleOrders([...merged.values()])
}

function activePortalScheduleOrders(orders = []) {
  return sortPortalScheduleOrders(
    (Array.isArray(orders) ? orders : []).filter((order) => isScheduleOrderActive(order)),
  )
}

function requirePortalScheduleOrderLifecycleStatus(value) {
  const raw = normalizeText(value).toUpperCase()
  const normalized = raw === 'CANCELED' ? 'CANCELLED' : raw
  if (!['ACTIVE', 'CANCELLED', 'ARCHIVED'].includes(normalized)) {
    const error = new Error('INVALID_TASK_LIFECYCLE_STATUS')
    error.statusCode = 400
    error.publicCode = 'INVALID_TASK_LIFECYCLE_STATUS'
    error.publicMessage = 'Dozwolone statusy zlecenia to ACTIVE, CANCELLED i ARCHIVED.'
    throw error
  }
  return normalized
}

function portalScheduleOrderWithLifecycleStatus(order = {}, lifecycleStatus, changedAt = new Date().toISOString()) {
  const status = requirePortalScheduleOrderLifecycleStatus(lifecycleStatus)
  return {
    ...order,
    lifecycleStatus: status,
    cancelledAt: status === 'CANCELLED' ? changedAt : null,
    canceledAt: status === 'CANCELLED' ? changedAt : null,
    archivedAt: status === 'ARCHIVED' ? changedAt : null,
    updatedAt: changedAt,
  }
}

async function assertPortalScheduleOrderSchemaReady(client) {
  const result = await client.query(
    `with target as (
       select to_regclass('public.task') as task_oid
     )
     select
       target.task_oid is not null as task_ready,
       exists (
         select 1
           from information_schema.columns
          where table_schema = 'public'
            and table_name = 'task'
            and column_name = 'lifecycle_status'
            and data_type = 'character varying'
            and character_maximum_length = 20
            and is_nullable = 'NO'
            and position('ACTIVE' in upper(coalesce(column_default, ''))) > 0
       ) as lifecycle_status_ready,
       exists (
         select 1
           from information_schema.columns
          where table_schema = 'public'
            and table_name = 'task'
            and column_name = 'cancelled_at'
            and data_type = 'timestamp with time zone'
       ) as cancelled_at_ready,
       exists (
         select 1
           from information_schema.columns
          where table_schema = 'public'
            and table_name = 'task'
            and column_name = 'archived_at'
            and data_type = 'timestamp with time zone'
       ) as archived_at_ready,
       exists (
         select 1
           from pg_constraint constraint_row
          where constraint_row.conrelid = target.task_oid
            and constraint_row.conname = 'task_lifecycle_status_check'
            and constraint_row.convalidated
       ) as lifecycle_constraint_ready,
       exists (
         select 1
           from pg_indexes
          where schemaname = 'public'
            and tablename = 'task'
            and indexname = 'task_org_lifecycle_date_idx'
       ) as lifecycle_index_ready
     from target`,
  )
  const schema = result.rows[0] || {}
  const required = [
    'task_ready',
    'lifecycle_status_ready',
    'cancelled_at_ready',
    'archived_at_ready',
    'lifecycle_constraint_ready',
    'lifecycle_index_ready',
  ]
  const missing = required.filter((key) => schema[key] !== true)
  if (!missing.length) return

  const error = new Error('TASK_LIFECYCLE_SCHEMA_MISSING')
  error.statusCode = 503
  error.publicCode = 'TASK_LIFECYCLE_SCHEMA_MISSING'
  error.publicMessage = 'Moduł cyklu życia zleceń wymaga migracji bazy danych przed zapisem.'
  error.publicDetails = { missing }
  throw error
}

function mapPortalScheduleOrdersError(error) {
  const publicCode = normalizeText(error?.publicCode)
  const publicMessage = normalizeText(error?.publicMessage)
  const publicStatus = Number(error?.statusCode)
  if (publicCode && publicMessage && Number.isFinite(publicStatus) && publicStatus >= 400 && publicStatus < 600) {
    return {
      status: publicStatus,
      code: publicCode,
      message: publicMessage,
      details: error?.publicDetails,
    }
  }

  const databaseCode = normalizeText(error?.code).toUpperCase()
  const databaseMessage = normalizeText(error?.message).toLowerCase()
  if (databaseCode === '42703' && databaseMessage.includes('lifecycle_status')) {
    return {
      status: 503,
      code: 'TASK_LIFECYCLE_SCHEMA_MISSING',
      message: 'Moduł cyklu życia zleceń wymaga migracji bazy danych przed zapisem.',
    }
  }
  if (
    ['42P08', '42P18'].includes(databaseCode) ||
    databaseMessage.includes('inconsistent types deduced for parameter')
  ) {
    return {
      status: 503,
      code: 'SCHEDULE_ORDER_SQL_PARAMETER_MISMATCH',
      message: 'Backend zleceń wymaga zgodnej wersji zapytania SQL. Zapis nie został wykonany.',
    }
  }
  return {
    status: 500,
    code: 'PORTAL_SCHEDULE_ORDERS_FAILED',
    message: 'Nie udało się bezpiecznie obsłużyć zlecenia. Spróbuj ponownie później.',
  }
}

async function requirePortalScheduleOrderAccess(client, orgId, uid, { write = false, remove = false } = {}) {
  const membership = await getRequesterMembership(client, orgId, uid)
  assertMembershipPlanCapability(membership, 'scheduling')
  const role = normalizeRequesterRole(membership?.role)
  const allowed = remove
    ? ['ADMIN']
    : write
      ? ['ADMIN', 'MANAGER']
      : ['ADMIN', 'MANAGER', 'COORDINATOR', 'WORKER']
  if (!allowed.includes(role)) {
    const error = new Error('FORBIDDEN')
    error.statusCode = membership ? 403 : 404
    error.publicCode = membership ? 'FORBIDDEN' : 'ORG_ACCESS_MISSING'
    error.publicMessage = membership ? 'Brak uprawnien do zlecen.' : 'Brak dostepu do tej organizacji.'
    throw error
  }
  return role
}

async function requirePortalEventAccess(client, orgId, uid) {
  const membership = await getRequesterMembership(client, orgId, uid)
  assertMembershipPlanCapability(membership, 'timeTracking')
  if (!isWorkerDeleteRole(membership?.role)) {
    const error = new Error('FORBIDDEN')
    error.statusCode = membership ? 403 : 404
    error.publicCode = membership ? 'FORBIDDEN' : 'ORG_ACCESS_MISSING'
    error.publicMessage = membership ? 'Brak uprawnien do usuwania zdarzen.' : 'Brak dostepu do tej organizacji.'
    throw error
  }
  return normalizeRequesterRole(membership?.role)
}

function sanitizePortalEventDeleteId(value) {
  const id = normalizeText(value)
  if (!id || id.length > 128 || /[\u0000-\u001f\u007f]/.test(id)) {
    return ''
  }
  return id
}

function collectPortalEventDeleteIds(body = {}) {
  const ids = []
  const pushId = (value) => {
    const id = sanitizePortalEventDeleteId(value)
    if (id) {
      ids.push(id)
    }
  }
  const pushRowIds = (row) => {
    if (!row || typeof row !== 'object') {
      pushId(row)
      return
    }

    ;[
      row.id,
      row.eventId,
      row.workdayId,
      row.linkedWorkdayId,
      row.cycleId,
      row.backupCycleId,
      row.startEventId,
      row.endEventId,
      row.pauseId,
      row.workday?.workdayId,
      row.workday?.startEventId,
      row.workday?.endEventId,
    ].forEach(pushId)
  }

  ;[body?.id, body?.eventId, body?.workdayId, body?.linkedWorkdayId, body?.cycleId, body?.backupCycleId].forEach(pushId)
  ;[body?.ids, body?.eventIds, body?.workdayIds, body?.cycleIds].forEach((list) => {
    if (Array.isArray(list)) {
      list.forEach(pushId)
    }
  })
  ;[body?.row, body?.event].forEach(pushRowIds)
  if (Array.isArray(body?.rows)) {
    body.rows.forEach(pushRowIds)
  }
  if (Array.isArray(body?.events)) {
    body.events.forEach(pushRowIds)
  }

  return [...new Set(ids)].slice(0, 300)
}

async function deletePortalEventsFromTableByColumns(client, orgId, relationName, columns, ids) {
  if (!ids.length || !(await databaseRelationExists(client, relationName))) {
    return 0
  }
  const existingColumns = []
  for (const column of columns) {
    if (await databaseColumnExists(client, relationName, column)) {
      existingColumns.push(column)
    }
  }
  if (!existingColumns.length) {
    return 0
  }
  const where = existingColumns.map((column) => `${column} = any($2::varchar[])`).join(' or ')
  const result = await client.query(`delete from ${relationName} where org_id = $1 and (${where})`, [orgId, ids])
  return result.rowCount || 0
}

async function assertPortalEventDeleteOutsideReconciliation(client, orgId, ids) {
  if (!ids.length) return

  // Share the organization-level reconciliation lock before taking row locks.
  // This keeps the lock order compatible with the transactional repair API.
  await client.query(
    'select pg_advisory_xact_lock(hashtextextended($1::text, 0))',
    [`workday-business-date:${orgId}`],
  )
  const lockedEventResult = await client.query(
    `select event_id, workday_id, start_event_id, end_event_id
       from public.event
      where org_id = $1
        and (
          event_id = any($2::varchar[])
          or workday_id = any($2::varchar[])
          or start_event_id = any($2::varchar[])
          or end_event_id = any($2::varchar[])
        )
      order by event_id asc
      for update`,
    [orgId, ids],
  )
  const lockedEvents = lockedEventResult.rows || []
  const linkedWorkdayIds = lockedEvents
    .map((row) => normalizeText(row?.workday_id))
    .filter(Boolean)
  const workdayLookupIds = [...new Set([...ids, ...linkedWorkdayIds])]
  const lockedWorkdayResult = await client.query(
    `select workday_id
       from public.workday
      where org_id = $1
        and (
          workday_id = any($2::varchar[])
          or start_event_id = any($2::varchar[])
          or end_event_id = any($2::varchar[])
        )
      order by workday_id asc
      for update`,
    [orgId, workdayLookupIds],
  )
  const hasLinkedEvent = lockedEvents.some((row) => normalizeText(row?.workday_id))
  if (!hasLinkedEvent && !lockedWorkdayResult.rows?.[0]) return

  const error = new Error(
    'Sesja powiazana z dniem pracy nie moze zostac usunieta przez stary edytor. Uzyj dialogu „Przeglad i naprawa dnia”.',
  )
  error.statusCode = 409
  error.publicCode = 'WORKDAY_RECONCILIATION_REQUIRED'
  error.publicMessage = error.message
  throw error
}

async function deletePortalEventsByIds(client, orgId, ids) {
  const counts = {
    workdayPause: 0,
    event: 0,
    backupCycle: 0,
    workday: 0,
  }

  if (!ids.length) {
    return counts
  }

  await client.query('begin')
  await assertPortalEventDeleteOutsideReconciliation(client, orgId, ids)
  counts.workdayPause = await deletePortalEventsFromTableByColumns(
    client,
    orgId,
    'public.workday_pause',
    ['workday_id', 'pause_id', 'pause_event_id'],
    ids,
  )
  counts.event = await deletePortalEventsFromTableByColumns(
    client,
    orgId,
    'public.event',
    ['event_id', 'workday_id', 'start_event_id', 'end_event_id'],
    ids,
  )
  counts.backupCycle = await deletePortalEventsFromTableByColumns(
    client,
    orgId,
    'public.backup_cycle',
    ['cycle_id', 'start_event_id', 'end_event_id'],
    ids,
  )
  counts.workday = await deletePortalEventsFromTableByColumns(
    client,
    orgId,
    'public.workday',
    ['workday_id', 'start_event_id', 'end_event_id'],
    ids,
  )
  await client.query('commit')
  return counts
}

async function handlePortalEventsRequest(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const method = String(req.method || 'DELETE').toUpperCase()
  if (!['DELETE', 'POST'].includes(method)) {
    sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Dozwolone metody to DELETE i POST.')
    return
  }

  let body = {}
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

  const orgId = normalizeOrgId(body?.orgId)
  if (!orgId) {
    sendApiError(res, 400, 'INVALID_ORG_ID', 'Brak poprawnego orgId.')
    return
  }

  const eventIds = collectPortalEventDeleteIds(body)
  if (!eventIds.length) {
    sendApiError(res, 400, 'INVALID_EVENT_IDS', 'Brak identyfikatorow zdarzen do usuniecia.')
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
    await requirePortalEventAccess(client, orgId, requesterUid)
    const counts = await deletePortalEventsByIds(client, orgId, eventIds)
    const deletedTotal = Object.values(counts).reduce((sum, value) => sum + (Number(value) || 0), 0)
    sendJson(res, 200, {
      ok: true,
      data: {
        deletedIds: eventIds,
        counts,
        deletedTotal,
      },
    })
  } catch (error) {
    logPortalStorageError('portal/events', error)
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
      normalizeText(error?.publicCode) || 'PORTAL_EVENTS_ERROR',
      normalizeText(error?.publicMessage) || error?.message || 'Nie udalo sie usunac zdarzen.',
    )
  } finally {
    if (client) client.release()
  }
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

async function attachPortalJobCardState(client, orgId, orders = []) {
  const sourceOrders = Array.isArray(orders) ? orders : []
  if (!sourceOrders.length) return sourceOrders
  const repository = new JobCardRepository(client)
  let states
  try {
    states = await repository.readStatesForOrders({
      orgId,
      sourceOrderIds: sourceOrders.map((order) => order?.id ?? order?.idTask),
    })
  } catch (error) {
    if (error?.publicCode === 'JOB_CARD_SCHEMA_MISSING') return sourceOrders
    throw error
  }
  return sourceOrders.map((order) => {
    const orderId = sanitizePortalScheduleOrderId(order?.id ?? order?.idTask)
    const state = states.get(orderId)
    if (!state?.draft && !state?.latestRevision) return order
    return {
      ...order,
      ...(state?.draft
        ? {
            jobCardDraft: state.draft.payload,
            jobCardDraftHash: state.draft.draftHash,
            jobCardDraftStatus: state.draft.generationStatus,
            jobCardDraftUpdatedAt: state.draft.updatedAt,
            jobCardSchemaVersion: state.draft.schemaVersion,
            jobCardValidation: state.draft.validation,
          }
        : {}),
      jobCardPublication: state?.latestRevision
        ? {
            outputHash: state.latestRevision.outputHash,
            publishedAt: state.latestRevision.publishedAt,
            publishedByUid: state.latestRevision.publishedByUid,
            revision: state.latestRevision.revision,
            revisionId: state.latestRevision.revisionId,
          }
        : null,
    }
  })
}

async function upsertPortalScheduleOrderTask(client, dbRow) {
  const columns = PORTAL_SCHEDULE_ORDER_COLUMNS
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ')
  const assignments = columns
    .filter((column) => !['org_id', 'id_task', 'created_at', 'created_by_uid'].includes(column))
    .map((column) => (
      column === 'updated_by_uid'
        ? `${column} = coalesce(excluded.${column}, task.${column})`
        : `${column} = excluded.${column}`
    ))
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
  const mode = normalizeText(process.env.PORTAL_SCHEDULE_ORDERS_MODE).toLowerCase()
  const explicitAllow = normalizeText(process.env.ALLOW_LOCAL_PORTAL_SCHEDULE_ORDERS_FILE_STORAGE) === '1'
  return explicitAllow && NODE_ENV !== 'production' && ['local', 'direct', 'file'].includes(mode)
}

function portalScheduleOrderFilePath(orgId) {
  const safeOrgId = normalizeOrgId(orgId).replace(/[^a-z0-9_-]/gi, '_')
  if (!safeOrgId) {
    throw new Error('INVALID_ORG_ID')
  }
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
    sendJson(res, 200, { ok: true, data: { orders: activePortalScheduleOrders(existingOrders), storage: 'local-file' } })
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
  if (method === 'PATCH') {
    const orderIds = [...new Set(
      (Array.isArray(body?.orderIds) ? body.orderIds : [])
        .map((value) => sanitizePortalScheduleOrderId(value))
        .filter(Boolean),
    )]
    if (!orderIds.length) {
      const error = new Error('TASK_IDS_REQUIRED')
      error.statusCode = 400
      error.publicCode = 'TASK_IDS_REQUIRED'
      error.publicMessage = 'Wskaż dokładne identyfikatory zleceń do zmiany statusu.'
      throw error
    }
    const lifecycleStatus = requirePortalScheduleOrderLifecycleStatus(body?.lifecycleStatus)
    const existingIds = new Set(existingOrders.map((order) => sanitizePortalScheduleOrderId(order?.id ?? order?.idTask)))
    const missingIds = orderIds.filter((id) => !existingIds.has(id))
    if (missingIds.length) {
      const error = new Error('TASK_NOT_FOUND')
      error.statusCode = 404
      error.publicCode = 'TASK_NOT_FOUND'
      error.publicMessage = `Nie znaleziono zlecenia: ${missingIds[0]}.`
      throw error
    }
    const changedAt = new Date().toISOString()
    const changedIds = new Set(orderIds)
    const nextOrders = existingOrders.map((order) => (
      changedIds.has(sanitizePortalScheduleOrderId(order?.id ?? order?.idTask))
        ? portalScheduleOrderWithLifecycleStatus(order, lifecycleStatus, changedAt)
        : order
    ))
    assertNoWorkerScheduleLocationConflicts(nextOrders)
    await writePortalScheduleOrdersFile(orgId, nextOrders)
    sendJson(res, 200, {
      ok: true,
      data: {
        lifecycleStatus,
        updatedOrderIds: orderIds,
        orders: activePortalScheduleOrders(nextOrders),
        storage: 'local-file',
      },
    })
    return
  }
  const rawOrders = Array.isArray(body?.orders) ? body.orders : []
  const incomingOrders = sortPortalScheduleOrders(
    rawOrders
      .map((order) => {
        const row = portalScheduleOrderDbRow(order, orgId, requesterUid)
        return row ? portalScheduleOrderFromDbRow(row) : null
      })
      .filter(Boolean)
      .slice(0, 2000),
  )
  const savedOrders = mergePortalScheduleOrders(existingOrders, incomingOrders)
  assertNoWorkerScheduleLocationConflicts(savedOrders)
  await writePortalScheduleOrdersFile(orgId, savedOrders)
  sendJson(res, 200, { ok: true, data: { orders: activePortalScheduleOrders(savedOrders), storage: 'local-file' } })
}

async function handlePortalScheduleOrdersRequest(req, res, requestUrl) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const method = String(req.method || 'GET').toUpperCase()
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) {
    sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Dozwolone metody to GET, POST, PATCH i DELETE.')
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
    if (shouldUseLocalPortalScheduleOrderFileStorage() && !hasPlatformOwnerClaim(decodedToken)) {
      const requesterRole = await getRequesterRoleViaDataConnect(orgId, token)
      const allowedRoles =
        method === 'GET'
          ? ['ADMIN', 'MANAGER', 'COORDINATOR', 'WORKER']
          : method === 'DELETE'
            ? ['ADMIN']
            : ['ADMIN', 'MANAGER']
      if (!allowedRoles.includes(requesterRole)) {
        sendApiError(res, 403, 'FORBIDDEN', 'Brak dostepu do tej organizacji.')
        return
      }
      await handlePortalScheduleOrdersFileRequest(method, orgId, body, requesterUid, res)
      return
    }

    client = await connectDbClient()
    await assertPortalScheduleOrderSchemaReady(client)
    const requesterRole = await requirePortalScheduleOrderAccess(client, orgId, requesterUid, {
      write: method === 'POST' || method === 'PATCH',
      remove: method === 'DELETE',
    })

    if (method === 'GET') {
      const storedOrders = await readPortalScheduleOrders(client, orgId)
      const orders = requesterRole === 'WORKER'
        ? storedOrders
        : await attachPortalJobCardState(client, orgId, storedOrders)
      sendJson(res, 200, { ok: true, data: { orders: activePortalScheduleOrders(orders) } })
      return
    }

    if (method === 'DELETE') {
      const orderIds = (Array.isArray(body?.orderIds) ? body.orderIds : []).map((value) => sanitizePortalScheduleOrderId(value)).filter(Boolean)
      if (!orderIds.length) {
        sendJson(res, 200, { ok: true, data: { deletedOrderIds: [] } })
        return
      }
      await client.query('begin')
      await client.query(
        `select pg_advisory_xact_lock(hashtext($1), hashtext('portal_schedule_orders'))`,
        [orgId],
      )
      const jobCardSchemaResult = await client.query(
        `select to_regclass('public.job_card_draft') is not null as draft_ready`,
      )
      if (jobCardSchemaResult.rows[0]?.draft_ready === true) {
        await client.query(
          'delete from public.job_card_draft where org_id = $1 and source_order_id = any($2::varchar[])',
          [orgId, orderIds],
        )
      }
      await client.query('delete from public.task where org_id = $1 and id_task = any($2::varchar[])', [orgId, orderIds])
      await client.query('commit')
      sendJson(res, 200, { ok: true, data: { deletedOrderIds: orderIds } })
      return
    }

    if (method === 'PATCH') {
      const orderIds = [...new Set(
        (Array.isArray(body?.orderIds) ? body.orderIds : [])
          .map((value) => sanitizePortalScheduleOrderId(value))
          .filter(Boolean),
      )]
      if (!orderIds.length) {
        const error = new Error('TASK_IDS_REQUIRED')
        error.statusCode = 400
        error.publicCode = 'TASK_IDS_REQUIRED'
        error.publicMessage = 'Wskaż dokładne identyfikatory zleceń do zmiany statusu.'
        throw error
      }
      const lifecycleStatus = requirePortalScheduleOrderLifecycleStatus(body?.lifecycleStatus)
      const tenantActorUid = requesterRole === 'ADMIN' && hasPlatformOwnerClaim(decodedToken) ? null : requesterUid
      await client.query('begin')
      await client.query(
        `select pg_advisory_xact_lock(hashtext($1), hashtext('portal_schedule_orders'))`,
        [orgId],
      )
      const updateResult = await client.query(
        `update public.task
            set lifecycle_status = $3,
                cancelled_at = case
                  when $3 = 'ACTIVE' then null
                  when $3 = 'CANCELLED' then now()
                  else null
                end,
                archived_at = case
                  when $3 = 'ACTIVE' then null
                  when $3 = 'ARCHIVED' then now()
                  else null
                end,
                updated_at = now(),
                updated_by_uid = coalesce($4, updated_by_uid)
          where org_id = $1
            and id_task = any($2::varchar[])
          returning id_task`,
        [orgId, orderIds, lifecycleStatus, tenantActorUid],
      )
      const updatedIds = new Set(updateResult.rows.map((row) => sanitizePortalScheduleOrderId(row.id_task)))
      const missingIds = orderIds.filter((id) => !updatedIds.has(id))
      if (missingIds.length) {
        const error = new Error('TASK_NOT_FOUND')
        error.statusCode = 404
        error.publicCode = 'TASK_NOT_FOUND'
        error.publicMessage = `Nie znaleziono zlecenia: ${missingIds[0]}.`
        throw error
      }
      const savedOrders = await attachPortalJobCardState(client, orgId, await readPortalScheduleOrders(client, orgId))
      assertNoWorkerScheduleLocationConflicts(savedOrders)
      await client.query('commit')
      sendJson(res, 200, {
        ok: true,
        data: {
          lifecycleStatus,
          updatedOrderIds: orderIds,
          orders: activePortalScheduleOrders(savedOrders),
        },
      })
      return
    }

    const rawOrders = Array.isArray(body?.orders) ? body.orders : []
    const tenantActorUid = requesterRole === 'ADMIN' && hasPlatformOwnerClaim(decodedToken) ? '' : requesterUid
    const rows = rawOrders.map((order) => portalScheduleOrderDbRow(order, orgId, tenantActorUid)).filter(Boolean).slice(0, 2000)
    const incomingOrders = rows.map((row) => portalScheduleOrderFromDbRow(row)).filter(Boolean)
    await client.query('begin')
    await client.query(
      `select pg_advisory_xact_lock(hashtext($1), hashtext('portal_schedule_orders'))`,
      [orgId],
    )
    const existingOrders = await readPortalScheduleOrders(client, orgId)
    assertNoWorkerScheduleLocationConflicts(
      mergePortalScheduleOrders(existingOrders, incomingOrders),
    )
    const jobCardRepository = new JobCardRepository(client)
    const rawOrdersById = new Map(
      rawOrders.map((order) => [
        sanitizePortalScheduleOrderId(order?.id ?? order?.idTask),
        order,
      ]),
    )
    const containsJobCardDraft = rows.some((row) => {
      const source = rawOrdersById.get(sanitizePortalScheduleOrderId(row?.id_task))
      return source?.jobCardDraft && typeof source.jobCardDraft === 'object' && !Array.isArray(source.jobCardDraft)
    })
    if (containsJobCardDraft) {
      await jobCardRepository.assertActiveOrganizationMember({ orgId, uid: requesterUid })
      await jobCardRepository.assertSchemaReady()
    }
    for (const row of rows) {
      await upsertPortalScheduleOrderTask(client, row)
      const source = rawOrdersById.get(sanitizePortalScheduleOrderId(row?.id_task))
      if (source?.jobCardDraft && typeof source.jobCardDraft === 'object' && !Array.isArray(source.jobCardDraft)) {
        await jobCardRepository.saveDraft({
          actorUid: requesterUid,
          card: source.jobCardDraft,
          orgId,
          sourceOrderId: row.id_task,
          sourceSnapshot: source,
        })
      }
    }
    await client.query('commit')
    const savedOrders = await attachPortalJobCardState(client, orgId, await readPortalScheduleOrders(client, orgId))
    sendJson(res, 200, { ok: true, data: { orders: activePortalScheduleOrders(savedOrders) } })
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
    const mappedScheduleError = mapPortalScheduleOrdersError(error)
    sendApiError(
      res,
      mappedScheduleError.status,
      mappedScheduleError.code,
      mappedScheduleError.message,
      mappedScheduleError.details,
    )
  } finally {
    if (client) client.release()
  }
}

async function handlePortalJobCardsRequest(req, res, requestUrl) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  const method = String(req.method || 'GET').toUpperCase()
  if (!['GET', 'POST'].includes(method)) {
    sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Dozwolone metody to GET i POST.')
    return
  }
  if (shouldUseLocalPortalScheduleOrderFileStorage()) {
    sendApiError(
      res,
      503,
      'JOB_CARD_DURABLE_STORAGE_REQUIRED',
      'Publikacja Karty Zlecenia wymaga połączenia z trwałą bazą danych.',
    )
    return
  }

  let body = {}
  if (method === 'POST') {
    try {
      body = await readJsonBody(req)
    } catch (error) {
      sendApiError(
        res,
        error?.message === 'REQUEST_BODY_TOO_LARGE' ? 413 : 400,
        error?.message === 'REQUEST_BODY_TOO_LARGE' ? 'REQUEST_TOO_LARGE' : 'INVALID_JSON',
        error?.message === 'REQUEST_BODY_TOO_LARGE' ? 'Żądanie jest zbyt duże.' : 'Niepoprawny JSON w żądaniu.',
      )
      return
    }
  }

  const orgId = normalizeOrgId(method === 'GET' ? requestUrl.searchParams.get('orgId') : body?.orgId)
  const sourceOrderId = sanitizePortalScheduleOrderId(
    method === 'GET' ? requestUrl.searchParams.get('orderId') : body?.orderId,
  )
  if (!orgId || !sourceOrderId) {
    sendApiError(res, 400, 'JOB_CARD_SCOPE_REQUIRED', 'Brak poprawnego orgId lub orderId.')
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

  let client = null
  try {
    const requesterUid = normalizeText(decodedToken?.uid)
    client = await connectDbClient()
    const membership = await getRequesterMembership(client, orgId, requesterUid)
    assertMembershipPlanCapability(membership, 'checklistProof')
    const repository = new JobCardRepository(client)
    await repository.assertActiveOrganizationMember({ orgId, uid: requesterUid })

    if (method === 'GET') {
      const state = await repository.readState({ orgId, sourceOrderId })
      sendJson(res, 200, { ok: true, data: state })
      return
    }

    if (normalizeText(body?.action).toUpperCase() !== 'PUBLISH') {
      sendApiError(res, 400, 'JOB_CARD_ACTION_UNSUPPORTED', 'Obsługiwana akcja to PUBLISH.')
      return
    }
    const result = await repository.publishStoredDraft({
      acknowledgements: body?.acknowledgements,
      actorUid: requesterUid,
      expectedDraftHash: body?.expectedDraftHash,
      orgId,
      sourceOrderId,
    })
    sendJson(res, result.idempotent ? 200 : 201, { ok: true, data: result })
  } catch (error) {
    logPortalStorageError('portal/job-cards', error)
    const mappedDb = mapDatabaseConnectionError(error)
    if (mappedDb) {
      sendApiError(res, mappedDb.status, mappedDb.code, mappedDb.message)
      return
    }
    sendApiError(
      res,
      error?.statusCode || 500,
      normalizeText(error?.publicCode) || 'PORTAL_JOB_CARD_ERROR',
      normalizeText(error?.publicMessage) || error?.message || 'Nie udało się obsłużyć Karty Zlecenia.',
      error?.details,
    )
  } finally {
    if (client) client.release()
  }
}

function shouldUseLocalPortalTaskFileStorage() {
  const mode = normalizeText(process.env.PORTAL_TASKS_MODE).toLowerCase()
  const explicitAllow = normalizeText(process.env.ALLOW_LOCAL_PORTAL_TASK_FILE_STORAGE) === '1'
  return explicitAllow && NODE_ENV !== 'production' && ['local', 'direct', 'file'].includes(mode)
}

function portalTaskFilePath(orgId) {
  const safeOrgId = normalizeOrgId(orgId).replace(/[^a-z0-9_-]/gi, '_')
  if (!safeOrgId) {
    throw new Error('INVALID_ORG_ID')
  }
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
    if (shouldUseLocalPortalTaskFileStorage() && !hasPlatformOwnerClaim(decodedToken)) {
      const requesterRole = await getRequesterRoleViaDataConnect(orgId, token)
      const allowedRoles = method === 'GET'
        ? ['ADMIN', 'MANAGER', 'COORDINATOR']
        : method === 'DELETE'
          ? ['ADMIN']
          : ['ADMIN', 'MANAGER']
      if (!allowedRoles.includes(requesterRole)) {
        sendApiError(res, 403, 'FORBIDDEN', 'Brak dostepu do tej organizacji.')
        return
      }
      await handlePortalTasksFileRequest(method, orgId, body, requesterUid, res)
      return
    }

    client = await connectDbClient()

    await ensurePortalTaskTable(client)
    const requesterRole = await requirePortalTaskAccess(client, orgId, requesterUid, {
      write: method === 'POST',
      remove: method === 'DELETE',
    })

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
    if (requesterRole === 'ADMIN' && hasPlatformOwnerClaim(decodedToken)) {
      for (const task of tasks) {
        for (const key of ['updatedBy', 'updatedByUid', 'createdBy', 'createdByUid', 'editedBy', 'edit']) {
          if (Object.prototype.hasOwnProperty.call(task, key)) task[key] = null
        }
      }
    }

    await client.query('begin')
    for (const task of tasks) {
      await client.query(
        `insert into public.portal_task (org_id, task_id, source_comment_key, payload, updated_by, created_at, updated_at)
         values ($1, $2, $3, $4::jsonb, $5, now(), now())
         on conflict (org_id, task_id)
         do update set
           source_comment_key = excluded.source_comment_key,
           payload = excluded.payload,
           updated_by = coalesce(excluded.updated_by, portal_task.updated_by),
           updated_at = now()`,
        [orgId, task.id, task.sourceCommentKey || null, JSON.stringify(task), requesterRole === 'ADMIN' && hasPlatformOwnerClaim(decodedToken) ? null : requesterUid],
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
  const forwardedHost = normalizeApiProxyForwardedHost(API_PROXY_FORWARDED_HOST || targetUrl.host)
  const forwardedFor = normalizeText(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')

  const headers = {
    origin: `https://${forwardedHost}`,
    referer: `https://${forwardedHost}/`,
    'x-forwarded-host': forwardedHost,
    'x-forwarded-proto': 'https',
    'x-forwarded-port': '443',
    'x-forwarded-server': forwardedHost,
  }
  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type']
  if (req.headers.authorization) headers.authorization = req.headers.authorization
  if (req.headers.accept) headers.accept = req.headers.accept
  if (req.headers['user-agent']) headers['user-agent'] = req.headers['user-agent']
  if (forwardedFor) headers['x-forwarded-for'] = forwardedFor
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
  const upstreamText = raw.toString('utf8')
  if (upstreamText.toLowerCase().includes('forbidden_host')) {
    sendJson(res, upstream.status || 502, {
      ok: false,
      error: {
        code: 'UPSTREAM_FORBIDDEN_HOST',
        message: `Upstream API odrzucil host. Proxy target: ${targetUrl.origin}, forwarded host: ${forwardedHost}. Zrestartuj root npm run dev; jesli blad zostaje, uruchom worker-profile lokalnie z WORKER_PROFILE_MODE=local/direct oraz lokalna konfiguracja DB/Firebase Admin albo testuj przez wdrozony Firebase Hosting.`,
        details: {
          proxyTarget: targetUrl.origin,
          forwardedHost,
          workerProfileMode: normalizeText(process.env.WORKER_PROFILE_MODE) || 'auto',
        },
      },
    })
    return
  }

  const responseHeaders = withSecurityHeaders({
    'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })

  res.writeHead(upstream.status, responseHeaders)
  res.end(raw)
}

const platformApi = createPlatformApi({
  connectDbClient,
  executeAdminDataConnectOperation,
  verifyFirebaseIdToken: verifyPlatformFirebaseIdToken,
})

const profitabilityApi = createProfitabilityApi({
  connectDbClient,
  databaseRelationExists,
  parseBearerToken,
  readJsonBody,
  sendApiError,
  sendJson,
  verifyFirebaseIdToken,
})

const workdayReconciliationApi = createWorkdayReconciliationApi({
  authorize: authorizeWorkdayReconciliation,
  connectDbClient,
  parseBearerToken,
  readJsonBody,
  sendApiError,
  sendJson,
  verifyFirebaseIdToken,
})

const workTimeDaysApi = createWorkTimeDaysApi({
  authorize: authorizeWorkdayReconciliation,
  connectDbClient,
  parseBearerToken,
  readJsonBody,
  sendApiError,
  sendJson,
  verifyFirebaseIdToken,
})

const server = http.createServer((req, res) => runWithPlatformRequest(req, () => {
  const scopedRequest = getPlatformRequestContext()
  res.once('finish', () => {
    const audit = scopedRequest?.platformAudit
    if (!audit) return
    void (async () => {
      let auditClient = null
      try {
        auditClient = await connectDbClient()
        await platformRepository.appendAudit(auditClient, {
          requestId: scopedRequest.requestId,
          phase: res.statusCode < 400 ? 'SUCCEEDED' : 'FAILED',
          principal: audit.principal,
          contextId: audit.access?.context_id,
          orgId: audit.access?.org_id,
          operation: audit.operation,
          target: audit.target,
          payload: null,
          result: { httpStatus: res.statusCode },
          request: scopedRequest,
        })
      } catch (error) {
        console.error('[platform-audit] failed to finalize backend request', error)
      } finally {
        auditClient?.release?.()
      }
    })()
  })
  if (req.url === '/healthz') {
    sendJson(res, 200, { ok: true })
    return
  }

  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  setRequestPathname(requestUrl.pathname)
  if (requestUrl.pathname === STRIPE_WEBHOOK_PATH) {
    handleStripeWebhookRequest(req, res).catch((error) => {
      sendApiError(res, 500, 'STRIPE_WEBHOOK_FAILED', error?.message || 'Unexpected Stripe webhook error.')
    })
    return
  }
  if (requestUrl.pathname.startsWith('/api/platform/')) {
    platformApi.handle(req, res, requestUrl).catch((error) => {
      sendApiError(res, 500, 'PLATFORM_API_ERROR', error?.message || 'Unexpected platform API error.')
    })
    return
  }
  if (requestUrl.pathname === PORTAL_PROFITABILITY_PATH) {
    profitabilityApi.handle(req, res, requestUrl).catch((error) => {
      sendApiError(res, 500, 'PROFITABILITY_API_ERROR', error?.message || 'Unexpected profitability API error.')
    })
    return
  }
  if (workdayReconciliationApi.matches(requestUrl.pathname)) {
    workdayReconciliationApi.handle(req, res, requestUrl).catch((error) => {
      sendApiError(res, 500, 'WORKDAY_RECONCILIATION_ERROR', error?.message || 'Unexpected workday reconciliation error.')
    })
    return
  }
  if (workTimeDaysApi.matches(requestUrl.pathname)) {
    workTimeDaysApi.handle(req, res, requestUrl).catch((error) => {
      sendApiError(res, 500, 'WORK_TIME_DAY_ERROR', error?.message || 'Unexpected work time day error.')
    })
    return
  }
  if (requestUrl.pathname === PORTAL_ORGANIZATIONS_PATH) {
    handlePortalOrganizationsRequest(req, res).catch((error) => {
      sendApiError(res, 500, 'ORGANIZATION_CREATE_FAILED', error?.message || 'Unexpected organization error.')
    })
    return
  }
  if (requestUrl.pathname === PORTAL_ORGANIZATION_PROFILE_PATH) {
    handlePortalOrganizationProfileRequest(req, res, requestUrl).catch((error) => {
      sendApiError(res, 500, 'ORGANIZATION_PROFILE_FAILED', error?.message || 'Unexpected organization profile error.')
    })
    return
  }
  if (requestUrl.pathname === PORTAL_COMPANY_REGISTRY_PATH) {
    handlePortalCompanyRegistryRequest(req, res).catch((error) => {
      sendApiError(res, 500, 'COMPANY_LOOKUP_FAILED', error?.message || 'Unexpected company lookup error.')
    })
    return
  }
  if (requestUrl.pathname === MOBILE_SCAN_STATUS_PATH) {
    handleMobileScanStatusRequest(req, res)
    return
  }
  if (
    requestUrl.pathname === MOBILE_STATE_PATH ||
    requestUrl.pathname === MOBILE_SCAN_PATH ||
    requestUrl.pathname === MOBILE_JOB_CARDS_PATH
  ) {
    handleMobileWorkflowRequest(req, res, requestUrl).catch((error) => {
      sendMobileApiError(res, 500, 'MOBILE_WORKFLOW_ERROR', error?.message || 'Unexpected mobile workflow error.')
    })
    return
  }

  if (requestUrl.pathname === PORTAL_ZONE_QR_CODES_PATH) {
    handlePortalZoneQrCodesRequest(req, res).catch((error) => {
      sendApiError(res, 500, 'PORTAL_ZONE_QR_ERROR', error?.message || 'Unexpected portal zone QR error.')
    })
    return
  }

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

  if (requestUrl.pathname === PORTAL_JOB_CARDS_PATH) {
    handlePortalJobCardsRequest(req, res, requestUrl).catch((error) => {
      sendApiError(res, 500, 'PORTAL_JOB_CARD_ERROR', error?.message || 'Unexpected portal job-card error.')
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

  if (requestUrl.pathname === PORTAL_EVENTS_PATH) {
    if (shouldProxyPortalEventsRequest()) {
      proxyApiRequest(req, res, requestUrl).catch((error) => {
        sendJson(res, 500, {
          ok: false,
          error: {
            code: 'PORTAL_EVENTS_PROXY_ERROR',
            message: error?.message || 'Unexpected portal events proxy error.',
          },
        })
      })
      return
    }

    handlePortalEventsRequest(req, res).catch((error) => {
      sendApiError(res, 500, 'PORTAL_EVENTS_ERROR', error?.message || 'Unexpected portal events error.')
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

  if (requestUrl.pathname === ADMIN_WORKER_PROFILE_UPDATE_PATH || requestUrl.pathname === '/adminWorkerProfileUpdate') {
    if (shouldProxyWorkerProfileRequest()) {
      proxyApiRequest(req, res, requestUrl).catch((error) => {
        sendJson(res, 500, {
          ok: false,
          error: {
            code: 'WORKER_PROFILE_UPDATE_PROXY_ERROR',
            message: error?.message || 'Unexpected worker profile update proxy error.',
          },
        })
      })
      return
    }

    handleAdminWorkerProfileUpdateRequest(req, res).catch((error) => {
      sendApiError(res, 500, 'WORKER_PROFILE_UPDATE_ERROR', error?.message || 'Unexpected worker profile update error.')
    })
    return
  }

  if (requestUrl.pathname === ADMIN_WORKER_PROFILE_DELETE_PATH || requestUrl.pathname === '/adminWorkerProfileDelete') {
    if (shouldProxyWorkerProfileRequest()) {
      proxyApiRequest(req, res, requestUrl).catch((error) => {
        sendJson(res, 500, {
          ok: false,
          error: {
            code: 'WORKER_PROFILE_DELETE_PROXY_ERROR',
            message: error?.message || 'Unexpected worker profile delete proxy error.',
          },
        })
      })
      return
    }

    handleAdminWorkerProfileDeleteRequest(req, res).catch((error) => {
      sendApiError(res, 500, 'WORKER_PROFILE_DELETE_ERROR', error?.message || 'Unexpected worker profile delete error.')
    })
    return
  }

  if (requestUrl.pathname === ADMIN_WORKERS_PATH) {
    handleAdminWorkersRequest(req, res, requestUrl).catch((error) => {
      sendApiError(res, 500, 'WORKERS_LIST_ERROR', error?.message || 'Unexpected workers list error.')
    })
    return
  }

  if (requestUrl.pathname === ADMIN_WORKERS_RESTORE_PATH) {
    handleAdminWorkersRestoreRequest(req, res).catch((error) => {
      sendApiError(
        res,
        500,
        'WORKER_RESTORE_ERROR',
        error?.message || 'Unexpected worker restore error.',
      )
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

  if (requestUrl.pathname === ADMIN_WORKER_ID_NEXT_PATH) {
    if (shouldProxyAdminUsersRequest()) {
      proxyApiRequest(req, res, requestUrl).catch((error) => {
        sendJson(res, 500, {
          ok: false,
          error: {
            code: 'WORKER_ID_PREVIEW_PROXY_ERROR',
            message: error?.message || 'Unexpected worker ID preview proxy error.',
          },
        })
      })
      return
    }

    handleAdminWorkerIdNextRequest(req, res, requestUrl).catch((error) => {
      sendApiError(res, 500, 'WORKER_ID_PREVIEW_ERROR', error?.message || 'Unexpected worker ID preview error.')
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
}))

async function checkWorkerSchemaAtStartup() {
  if (!hasDatabaseConnectionConfig()) {
    console.warn('[worker-schema] WORKER_SCHEMA_NOT_READY: missing database configuration')
    return
  }

  let client = null
  try {
    client = await connectDbClient()
    const readiness = await workerRepository.inspectWorkerSchema(client)
    if (readiness.ready) {
      console.info('[worker-schema] ready')
    } else {
      console.warn('[worker-schema] WORKER_SCHEMA_NOT_READY', readiness.missing)
    }
    const platformReadiness = await platformRepository.inspectPlatformSchema(client)
    if (platformReadiness.ready) {
      console.info('[platform-schema] ready')
    } else {
      console.warn('[platform-schema] PLATFORM_SCHEMA_NOT_READY', platformReadiness.missing)
    }
  } catch (error) {
    console.warn(
      '[worker-schema] readiness check failed',
      normalizeText(error?.code),
      normalizeText(error?.message),
    )
  } finally {
    if (client) client.release()
  }
}

server.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`)
  void checkWorkerSchemaAtStartup()
})
