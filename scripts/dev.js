'use strict'

const { spawn } = require('node:child_process')
const path = require('node:path')
const { GoogleAuth } = require('google-auth-library')

const DEFAULT_PROJECT_ID = 'iclean-room'
const DEFAULT_CONNECTION_NAME = 'iclean-room:europe-west3:iclean-room-instance'
const DEFAULT_DATABASE_NAME = 'iclean-room-database'
const DEFAULT_DB_USER_SECRET = 'PORTAL_DB_USER'
const DEFAULT_DB_PASS_SECRET = 'PORTAL_DB_PASS'
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

  const projectId = String(
    process.env.FIREBASE_PROJECT_ID ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT ||
      DEFAULT_PROJECT_ID,
  ).trim()
  const dbUserSecret = String(process.env.DEV_DB_USER_SECRET || DEFAULT_DB_USER_SECRET).trim()
  const dbPassSecret = String(process.env.DEV_DB_PASS_SECRET || DEFAULT_DB_PASS_SECRET).trim()
  const authorization = await getGoogleAuthorizationHeader()
  const [dbUser, dbPass] = await Promise.all([
    accessSecret(projectId, dbUserSecret, authorization),
    accessSecret(projectId, dbPassSecret, authorization),
  ])

  process.env.FIREBASE_PROJECT_ID ||= projectId
  process.env.CLOUD_SQL_CONNECTION_NAME ||= DEFAULT_CONNECTION_NAME
  process.env.DB_CONNECTOR ||= 'cloudsql'
  process.env.CLOUD_SQL_AUTH_CLIENT ||= 'adc'
  process.env.CLOUD_SQL_AUTH_TYPE ||= 'PASSWORD'
  process.env.DB_NAME ||= DEFAULT_DATABASE_NAME
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
  await loadLocalCloudSqlConfig()
  startDevStack()
}

main().catch((error) => {
  console.error(`[dev] Cloud SQL local config -> failed (${error?.message || error})`)
  console.error('[dev] Odśwież poświadczenia ADC: gcloud auth application-default login')
  process.exit(1)
})
