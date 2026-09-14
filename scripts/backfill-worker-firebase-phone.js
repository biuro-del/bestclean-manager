'use strict'

const fs = require('node:fs')
const path = require('node:path')
const dotenv = require('dotenv')
const admin = require('firebase-admin')
const { createPool, loadSecretManagerDatabaseConfig } = require('./migrate-worker-model')
const {
  applyWorkerFirebasePhonePlan,
  buildWorkerFirebasePhonePlan,
  redactWorkerFirebasePhonePlan,
} = require('../worker-firebase-phone-backfill')

const rootDir = path.resolve(__dirname, '..')
const envPath = path.join(rootDir, '.env.local')
const expectedProductionProject = 'iclean-room'
const expectedProductionDatabase = 'iclean-room-database'
const expectedProductionInstance = 'iclean-room:europe-west3:iclean-room-instance'
const productionConfirmation = 'CLZ-WORKER-PHONE-IDENTITY-BACKFILL-20260914-01'
const adminAppName = 'cleanzi-worker-phone-backfill'

if (fs.existsSync(envPath)) dotenv.config({ path: envPath })

function text(value) {
  return String(value ?? '').trim()
}

function isTrue(value) {
  return ['1', 'true', 'yes', 'tak'].includes(text(value).toLowerCase())
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`)
}

function readOption(name) {
  const prefix = `--${name}=`
  const inline = process.argv.find((argument) => argument.startsWith(prefix))
  if (inline) return text(inline.slice(prefix.length))
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? text(process.argv[index + 1]) : ''
}

function safeErrorText(value) {
  return text(value)
    .replace(/\+[1-9]\d{7,14}/g, '[PHONE]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
    .slice(0, 500)
}

function readServiceAccount() {
  const rawJson = text(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  const rawBase64 = text(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64)
  const configuredPath = text(
    process.env.FIREBASE_SERVICE_ACCOUNT_FILE ||
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
  )
  let serviceAccount = null
  if (rawJson) serviceAccount = JSON.parse(rawJson)
  else if (rawBase64) serviceAccount = JSON.parse(Buffer.from(rawBase64, 'base64').toString('utf8'))
  else if (configuredPath) {
    const filePath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(rootDir, configuredPath)
    serviceAccount = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  }
  if (serviceAccount?.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n')
  }
  return serviceAccount
}

function readDatabaseConnectionContext(environment = process.env) {
  const databaseUrlConfigured = Boolean(text(environment.DATABASE_URL))
  const connectionName = text(
    environment.CLOUD_SQL_CONNECTION_NAME || environment.INSTANCE_CONNECTION_NAME,
  )
  const connector = text(environment.DB_CONNECTOR).toLowerCase()
  const cloudSqlConnectorSelected = !databaseUrlConfigured && (
    connector === 'cloudsql' || connector === 'cloud-sql' || Boolean(connectionName)
  )
  return {
    connectionName,
    mode: databaseUrlConfigured
      ? 'DATABASE_URL'
      : cloudSqlConnectorSelected
        ? 'CLOUD_SQL_CONNECTOR'
        : 'DIRECT_HOST',
  }
}

function assertProductionConnectionGate(connection) {
  if (connection?.mode !== 'CLOUD_SQL_CONNECTOR') {
    throw new Error('PRODUCTION_CLOUD_SQL_CONNECTOR_REQUIRED')
  }
  if (text(connection?.connectionName) !== expectedProductionInstance) {
    throw new Error('CONFIRMED_INSTANCE_REQUIRED')
  }
  if (readOption('confirm-instance') !== expectedProductionInstance) {
    throw new Error('CONFIRM_INSTANCE_MISMATCH')
  }
}

function firebaseOptions(projectId) {
  const serviceAccount = readServiceAccount()
  if (serviceAccount?.project_id && text(serviceAccount.project_id) !== projectId) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_PROJECT_MISMATCH')
  }
  return {
    projectId,
    credential: serviceAccount
      ? admin.credential.cert(serviceAccount)
      : admin.credential.applicationDefault(),
  }
}

function ensureFirebaseAuth(projectId) {
  const existingApp = admin.apps.find((app) => app.name === adminAppName)
  const app = existingApp || admin.initializeApp(firebaseOptions(projectId), adminAppName)
  return { auth: admin.auth(app), credential: app.options.credential }
}

async function readPhoneProviderState(projectId, credential) {
  try {
    const accessToken = await credential.getAccessToken()
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/admin/v2/projects/${encodeURIComponent(projectId)}/config`,
      {
        headers: {
          Authorization: `Bearer ${accessToken.access_token}`,
          // User ADC requires an explicit quota project for Identity Toolkit.
          // The project is already pinned by the apply gate.
          'x-goog-user-project': text(process.env.GOOGLE_CLOUD_QUOTA_PROJECT) || projectId,
        },
      },
    )
    if (!response.ok) {
      return { state: 'UNKNOWN', httpStatus: response.status }
    }
    const config = await response.json()
    return {
      state: config?.signIn?.phoneNumber?.enabled === true ? 'ENABLED' : 'DISABLED',
      httpStatus: response.status,
    }
  } catch (error) {
    return { state: 'UNKNOWN', error: safeErrorText(error?.code || error?.message) }
  }
}

function chunk(values, size = 100) {
  const result = []
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size))
  }
  return result
}

async function getUsersByIdentifiers(auth, identifiers, keySelector) {
  const users = new Map()
  for (const group of chunk(identifiers, 100)) {
    if (!group.length) continue
    const result = await auth.getUsers(group)
    for (const user of result.users || []) {
      const key = keySelector(user)
      if (key) users.set(key, user)
    }
  }
  return users
}

async function readFirebaseState(auth, rows) {
  const uids = [...new Set(rows.map((row) => text(row.auth_uid)).filter(Boolean))].sort()
  const phones = [...new Set(
    rows
      .map((row) => text(row.phone_normalized))
      .filter((phone) => /^\+48\d{9}$/.test(phone)),
  )].sort()
  const [usersByUid, usersByPhone] = await Promise.all([
    getUsersByIdentifiers(auth, uids.map((uid) => ({ uid })), (user) => text(user.uid)),
    getUsersByIdentifiers(
      auth,
      phones.map((phoneNumber) => ({ phoneNumber })),
      (user) => text(user.phoneNumber),
    ),
  ])
  return { usersByUid, usersByPhone }
}

async function readDatabaseState(client) {
  const metadata = await client.query(
    `select current_database() as database_name,
            exists (
              select 1
                from pg_trigger t
                join pg_class c on c.oid = t.tgrelid
                join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public'
                 and c.relname = 'worker'
                 and t.tgname = 'cleanzi_worker_phone_pl_e164_sync_trigger'
                 and not t.tgisinternal
            ) as phone_trigger_ready`,
  )
  const rows = await client.query(
    `select w.org_id,
            w.login,
            w.worker_id,
            w.auth_uid,
            w.login_email,
            w.email,
            w.phone,
            w.phone_normalized,
            w.active,
            (
              select count(*)::integer
                from public.organization_member m
               where m.org_id = w.org_id
                 and m.uid = w.auth_uid
                 and lower(coalesce(m.worker_id, '')) = lower(coalesce(w.worker_id, ''))
                  and upper(coalesce(m.status, '')) = 'ACTIVE'
            ) as active_membership_count,
            (
              select count(*)::integer
                from public.organization_member m
               where m.uid = w.auth_uid
                 and upper(coalesce(m.status, '')) = 'ACTIVE'
            ) as active_uid_membership_count
       from public.worker w
      order by w.org_id, w.login, w.worker_id`,
  )
  return {
    databaseName: text(metadata.rows[0]?.database_name),
    phoneTriggerReady: metadata.rows[0]?.phone_trigger_ready === true,
    rows: rows.rows,
  }
}

function appHostingFlagIsFalse() {
  const source = fs.readFileSync(path.join(rootDir, 'apphosting.yaml'), 'utf8')
  return /variable: WORKER_FIREBASE_PHONE_IDENTITY_ENABLED\r?\n\s+value: "false"/.test(source)
}

function assertApplyGate(context) {
  if (context.projectId !== expectedProductionProject) throw new Error('CONFIRMED_PROJECT_REQUIRED')
  if (context.databaseName !== expectedProductionDatabase) throw new Error('CONFIRMED_DATABASE_REQUIRED')
  assertProductionConnectionGate(context.databaseConnection)
  if (readOption('confirm-project') !== context.projectId) throw new Error('CONFIRM_PROJECT_MISMATCH')
  if (readOption('confirm-database') !== context.databaseName) throw new Error('CONFIRM_DATABASE_MISMATCH')
  if (readOption('confirm-plan') !== context.plan.planHash) throw new Error('CONFIRM_PLAN_MISMATCH')
  if (readOption('confirm-production') !== productionConfirmation) {
    throw new Error('CONFIRM_PRODUCTION_REQUIRED')
  }
  if (context.providerState.state !== 'DISABLED') throw new Error('PHONE_PROVIDER_MUST_BE_DISABLED')
  if (isTrue(process.env.WORKER_FIREBASE_PHONE_IDENTITY_ENABLED)) {
    throw new Error('WORKER_FIREBASE_PHONE_IDENTITY_MUST_BE_DISABLED')
  }
  if (!appHostingFlagIsFalse()) throw new Error('APPHOSTING_PHONE_IDENTITY_FLAG_MUST_BE_FALSE')
  if (!context.phoneTriggerReady) throw new Error('WORKER_PHONE_TRIGGER_REQUIRED')
  if (context.plan.conflicts > 0) throw new Error('PHONE_BACKFILL_CONFLICTS_PRESENT')
  const maxUpdates = Number(readOption('max-updates'))
  if (!Number.isInteger(maxUpdates) || maxUpdates < 0) throw new Error('MAX_UPDATES_REQUIRED')
  return maxUpdates
}

async function main() {
  const apply = hasFlag('apply')
  if (apply && hasFlag('audit')) throw new Error('CHOOSE_AUDIT_OR_APPLY')
  const projectId = text(process.env.FIREBASE_PROJECT_ID)
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID_MISSING')

  await loadSecretManagerDatabaseConfig()
  const databaseConnection = readDatabaseConnectionContext()
  if (apply) {
    if (projectId !== expectedProductionProject) throw new Error('CONFIRMED_PROJECT_REQUIRED')
    if (readOption('confirm-project') !== projectId) throw new Error('CONFIRM_PROJECT_MISMATCH')
    assertProductionConnectionGate(databaseConnection)
  }
  const { pool, connector } = await createPool()
  const { auth, credential } = ensureFirebaseAuth(projectId)
  let client = null
  let lockHeld = false
  let transactionStarted = false
  let completedUpdates = 0

  try {
    client = await pool.connect()
    if (apply) {
      const lock = await client.query(
        "select pg_try_advisory_lock(hashtext('cleanzi:worker-firebase-phone-backfill:v1')) as locked",
      )
      lockHeld = lock.rows[0]?.locked === true
      if (!lockHeld) throw new Error('PHONE_BACKFILL_ALREADY_RUNNING')
      await client.query('begin')
      transactionStarted = true
      await client.query("set local lock_timeout = '10s'")
      await client.query('lock table public.worker, public.organization_member in share mode')
    }

    const [databaseState, providerState] = await Promise.all([
      readDatabaseState(client),
      readPhoneProviderState(projectId, credential),
    ])
    const firebaseState = await readFirebaseState(auth, databaseState.rows)
    const plan = buildWorkerFirebasePhonePlan(databaseState.rows, firebaseState)
    const context = {
      projectId,
      databaseName: databaseState.databaseName,
      phoneTriggerReady: databaseState.phoneTriggerReady,
      databaseConnection,
      providerState,
      plan,
    }

    if (!apply) {
      console.log(JSON.stringify({
        mode: 'audit',
        projectId,
        databaseName: databaseState.databaseName,
        phoneTriggerReady: databaseState.phoneTriggerReady,
        databaseConnection,
        providerState,
        appHostingFlagFalse: appHostingFlagIsFalse(),
        runtimeFlagEnabled: isTrue(process.env.WORKER_FIREBASE_PHONE_IDENTITY_ENABLED),
        ...redactWorkerFirebasePhonePlan(plan),
      }, null, 2))
      return
    }

    const maxUpdates = assertApplyGate(context)
    const applyResult = await applyWorkerFirebasePhonePlan(plan, auth, { maxUpdates })
    completedUpdates = applyResult.completedUpdates
    const databasePostflight = await readDatabaseState(client)
    const firebasePostflight = await readFirebaseState(auth, databasePostflight.rows)
    const postflightPlan = buildWorkerFirebasePhonePlan(databasePostflight.rows, firebasePostflight)
    if (postflightPlan.conflicts > 0 || postflightPlan.plannedUpdates > 0) {
      throw new Error('PHONE_BACKFILL_POSTFLIGHT_PLAN_FAILED')
    }
    await client.query('commit')
    transactionStarted = false
    console.log(JSON.stringify({
      mode: 'apply',
      projectId,
      databaseName: databaseState.databaseName,
      providerState,
      ...applyResult,
      postflight: redactWorkerFirebasePhonePlan(postflightPlan),
    }, null, 2))
  } catch (error) {
    if (completedUpdates > Number(error?.completedUpdates || 0)) {
      error.completedUpdates = completedUpdates
    }
    throw error
  } finally {
    if (client && transactionStarted) {
      await client.query('rollback').catch(() => {})
    }
    if (client && lockHeld) {
      await client.query(
        "select pg_advisory_unlock(hashtext('cleanzi:worker-firebase-phone-backfill:v1'))",
      ).catch(() => {})
    }
    client?.release()
    await pool.end()
    connector?.close()
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: safeErrorText(error?.code || error?.message || error),
      completedUpdates: Number(error?.completedUpdates || 0),
      failedUidHash: text(error?.failedUidHash),
    }))
    process.exitCode = 1
  })
}

module.exports = {
  appHostingFlagIsFalse,
  assertApplyGate,
  assertProductionConnectionGate,
  readDatabaseConnectionContext,
  readOption,
  safeErrorText,
}
