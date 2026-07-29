'use strict'

const { spawn } = require('node:child_process')
const path = require('node:path')
const { GoogleAuth } = require('google-auth-library')

require('dotenv').config({
  path: path.resolve(__dirname, '..', '.env.local'),
  quiet: true,
})

const DEFAULT_DB_USER_SECRET = 'PORTAL_DB_USER'
const DEFAULT_DB_PASS_SECRET = 'PORTAL_DB_PASS'
const CLEANZI_PROJECT_ID = 'iclean-room'
const CLEANZI_CLOUD_SQL_CONNECTION_NAME = 'iclean-room:europe-west3:iclean-room-instance'
const CLEANZI_DATABASE_NAME = 'iclean-room-database'
const CLEANZI_AUTH_SESSION_PROXY_TARGET = 'https://portal.cleanzi.pl'
const SECRET_MANAGER_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'

function hasText(value) {
  return Boolean(String(value ?? '').trim())
}

function hasDatabaseConnectionConfig() {
  if (hasText(process.env.DATABASE_URL)) {
    return true
  }

  const hasDatabase = hasText(process.env.DB_NAME) || hasText(process.env.PGDATABASE)
  const hasUser =
    hasText(process.env.DB_USER) ||
    hasText(process.env.PGUSER) ||
    hasText(process.env.DB_IAM_USER) ||
    hasText(process.env.CLOUD_SQL_IAM_USER)
  const hasEndpoint =
    hasText(process.env.CLOUD_SQL_CONNECTION_NAME) ||
    hasText(process.env.INSTANCE_CONNECTION_NAME) ||
    hasText(process.env.DB_HOST) ||
    hasText(process.env.PGHOST)

  return hasDatabase && hasUser && hasEndpoint
}

function isDisabled(value) {
  return ['0', 'false', 'no', 'off'].includes(String(value ?? '').trim().toLowerCase())
}

function resolveLocalCloudSqlCoordinates(env = process.env) {
  const projectId = String(
    env.DEV_SECRET_PROJECT_ID ||
      env.PLATFORM_FIREBASE_PROJECT_ID ||
      env.FIREBASE_PROJECT_ID ||
      env.GOOGLE_CLOUD_PROJECT ||
      env.GCLOUD_PROJECT ||
      env.VITE_FIREBASE_PROJECT_ID ||
      '',
  ).trim()
  const isCleanziProject = projectId === CLEANZI_PROJECT_ID

  return {
    projectId,
    connectionName: String(
      env.CLOUD_SQL_CONNECTION_NAME ||
        env.INSTANCE_CONNECTION_NAME ||
        (isCleanziProject ? CLEANZI_CLOUD_SQL_CONNECTION_NAME : ''),
    ).trim(),
    databaseName: String(
      env.DB_NAME ||
        env.PGDATABASE ||
        (isCleanziProject ? CLEANZI_DATABASE_NAME : ''),
    ).trim(),
  }
}

function configureAuthSessionProxy(env = process.env, args = process.argv.slice(2)) {
  if (!args.includes('--auth-session-proxy')) {
    delete env.DEV_AUTH_SESSION_PROXY_ENABLED
    delete env.VITE_DEV_AUTH_API_PROXY_TARGET
    return { enabled: false, target: '' }
  }

  const { projectId } = resolveLocalCloudSqlCoordinates(env)
  if (projectId !== CLEANZI_PROJECT_ID) {
    throw new Error('DEV_AUTH_SESSION_PROXY_PROJECT_MISMATCH')
  }

  const target = String(
    env.VITE_DEV_AUTH_API_PROXY_TARGET ||
      env.AUTH_SESSION_PROXY_TARGET ||
      CLEANZI_AUTH_SESSION_PROXY_TARGET,
  )
    .trim()
    .replace(/\/+$/, '')

  if (target !== CLEANZI_AUTH_SESSION_PROXY_TARGET) {
    throw new Error('DEV_AUTH_SESSION_PROXY_TARGET_NOT_ALLOWED')
  }

  env.VITE_DEV_AUTH_API_PROXY_TARGET = target
  env.DEV_AUTH_SESSION_PROXY_ENABLED = '1'
  return { enabled: true, target }
}

async function getGoogleAuthorizationHeader() {
  const auth = new GoogleAuth({ scopes: [SECRET_MANAGER_SCOPE] })
  const client = await auth.getClient()
  const headers = await client.getRequestHeaders()
  const authorization =
    typeof headers?.get === 'function'
      ? headers.get('authorization')
      : headers?.authorization || headers?.Authorization

  if (!authorization) {
    throw new Error('ADC_AUTHORIZATION_MISSING')
  }

  return authorization
}

async function accessSecret(projectId, secretName, authorization) {
  const encodedProjectId = encodeURIComponent(projectId)
  const encodedSecretName = encodeURIComponent(secretName)
  const url =
    `https://secretmanager.googleapis.com/v1/projects/${encodedProjectId}` +
    `/secrets/${encodedSecretName}/versions/latest:access`
  const response = await fetch(url, {
    headers: { Authorization: authorization },
  })

  if (!response.ok) {
    throw new Error(`SECRET_ACCESS_${secretName}_${response.status}`)
  }

  const payload = await response.json()
  const encodedValue = String(payload?.payload?.data ?? '')
  const value = Buffer.from(encodedValue, 'base64').toString('utf8').trim()
  if (!value) {
    throw new Error(`SECRET_EMPTY_${secretName}`)
  }

  return value
}

async function loadLocalCloudSqlConfig() {
  if (hasDatabaseConnectionConfig() || isDisabled(process.env.DEV_AUTO_CLOUD_SQL)) {
    return
  }

  const { projectId, connectionName, databaseName } = resolveLocalCloudSqlCoordinates()
  if (!projectId || !connectionName || !databaseName) {
    throw new Error(
      'DEV_DATABASE_CONFIG_MISSING: ustaw VITE_FIREBASE_PROJECT_ID lub FIREBASE_PROJECT_ID oraz CLOUD_SQL_CONNECTION_NAME i DB_NAME',
    )
  }
  const dbUserSecret = String(process.env.DEV_DB_USER_SECRET || DEFAULT_DB_USER_SECRET).trim()
  const dbPassSecret = String(process.env.DEV_DB_PASS_SECRET || DEFAULT_DB_PASS_SECRET).trim()
  const authorization = await getGoogleAuthorizationHeader()
  const [dbUser, dbPass] = await Promise.all([
    accessSecret(projectId, dbUserSecret, authorization),
    accessSecret(projectId, dbPassSecret, authorization),
  ])

  process.env.CLOUD_SQL_CONNECTION_NAME ||= connectionName
  process.env.DB_CONNECTOR ||= 'cloudsql'
  process.env.CLOUD_SQL_AUTH_CLIENT ||= 'adc'
  process.env.CLOUD_SQL_AUTH_TYPE ||= 'PASSWORD'
  process.env.DB_NAME ||= databaseName
  process.env.DB_USER = dbUser
  process.env.DB_PASS = dbPass
  process.env.DB_SSL_REJECT_UNAUTHORIZED ||= 'true'

  // Loading DB credentials must not change unrelated local worker-profile storage.
  process.env.ADMIN_USERS_MODE ||= 'direct'
  process.env.WORKER_PROFILE_MODE ||= 'direct'
  process.env.WORKER_PROFILE_STORAGE_MODE ||= 'database'

  console.log('[dev] Cloud SQL local config -> loaded from Secret Manager using ADC')
}

function startDevStack() {
  const projectRoot = path.resolve(__dirname, '..')
  const child = spawn(process.execPath, [path.join(__dirname, 'dev-local.js')], {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
    shell: false,
  })

  const forwardSignal = (signal) => {
    if (!child.killed) {
      child.kill(signal)
    }
  }

  process.on('SIGINT', () => forwardSignal('SIGINT'))
  process.on('SIGTERM', () => forwardSignal('SIGTERM'))
  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 0)
  })
}

async function main() {
  const authSessionProxy = configureAuthSessionProxy()
  if (authSessionProxy.enabled) {
    console.log(`[dev] auth-session -> trusted deployed backend ${authSessionProxy.target}`)
  }
  await loadLocalCloudSqlConfig()
  startDevStack()
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[dev] Cloud SQL local config -> failed (${error?.message || error})`)
    console.error('[dev] Odśwież poświadczenia ADC: gcloud auth application-default login')
    process.exit(1)
  })
}

module.exports = {
  configureAuthSessionProxy,
  resolveLocalCloudSqlCoordinates,
}
