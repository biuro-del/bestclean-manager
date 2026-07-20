'use strict'

const fs = require('node:fs')
const path = require('node:path')
const dotenv = require('dotenv')
const admin = require('firebase-admin')
const { createPool, loadSecretManagerDatabaseConfig } = require('./migrate-worker-model')

const rootDir = path.resolve(__dirname, '..')
const envPath = path.join(rootDir, '.env.local')
if (fs.existsSync(envPath)) dotenv.config({ path: envPath })

function text(value) {
  return String(value ?? '').trim()
}

function readOption(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? text(process.argv[index + 1]) : ''
}

function firebaseOptions() {
  const projectId = text(process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'iclean-room')
  const rawJson = text(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  const serviceAccountPath = text(process.env.FIREBASE_SERVICE_ACCOUNT_FILE || process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
  let serviceAccount = null
  if (rawJson) serviceAccount = JSON.parse(rawJson)
  else if (serviceAccountPath) serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'))
  if (serviceAccount?.private_key) serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n')
  return {
    projectId,
    credential: serviceAccount ? admin.credential.cert(serviceAccount) : admin.credential.applicationDefault(),
  }
}

function ensureAdmin() {
  if (!admin.apps.length) admin.initializeApp(firebaseOptions())
  return admin
}

async function resolveFirebaseUser(action, client) {
  const uid = readOption('uid')
  const email = readOption('email').toLowerCase()
  if (action === 'disable' && !uid && !email) throw new Error('Podaj --uid albo --email.')
  if (uid) return ensureAdmin().auth().getUser(uid)
  if (email) return ensureAdmin().auth().getUserByEmail(email)
  throw new Error('Podaj --uid albo --email.')
}

async function enable(client) {
  const user = await resolveFirebaseUser('enable', client)
  if (!user.email || user.emailVerified !== true) {
    throw new Error('Konto Firebase musi mieć zweryfikowany email przed nadaniem PLATFORM_OWNER.')
  }
  const tenantIdentity = await client.query(
    `select
       exists(select 1 from public.organization_member where uid = $1::text) as has_membership,
       exists(
         select 1 from public.worker
          where auth_uid = $1::text
             or lower(coalesce(email, '')) = lower($2::text)
             or lower(coalesce(login_email, '')) = lower($2::text)
       ) as has_worker`,
    [user.uid, user.email],
  )
  if (tenantIdentity.rows[0]?.has_membership === true || tenantIdentity.rows[0]?.has_worker === true) {
    throw new Error('Konto PLATFORM_OWNER nie może istnieć w worker ani organization_member.')
  }
  const displayName = readOption('name') || user.displayName || user.email
  await client.query('begin')
  try {
    await client.query(
      `insert into public.platform_admin (
         uid, email, display_name, role, active, created_at, updated_at, created_by_uid
       ) values ($1::text, $2::text, $3::text, 'PLATFORM_OWNER', true, now(), now(), nullif($4::text, ''))
       on conflict (uid) do update set
         email = excluded.email,
         display_name = excluded.display_name,
         role = 'PLATFORM_OWNER',
         active = true,
         updated_at = now()`,
      [user.uid, user.email.toLowerCase(), displayName, readOption('created-by-uid')],
    )
    await ensureAdmin().auth().setCustomUserClaims(user.uid, {
      ...(user.customClaims || {}),
      platformRole: 'PLATFORM_OWNER',
    })
    if (user.disabled) await ensureAdmin().auth().updateUser(user.uid, { disabled: false })
    await ensureAdmin().auth().revokeRefreshTokens(user.uid)
    await client.query('commit')
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  }
  console.log(`Aktywowano PLATFORM_OWNER: ${user.email} (${user.uid}). Użytkownik musi zalogować się ponownie i skonfigurować MFA.`)
}

async function disable(client) {
  const user = await resolveFirebaseUser('disable', client)
  await client.query('begin')
  try {
    await client.query(
      `update public.platform_admin set active = false, updated_at = now()
        where uid = $1::text`,
      [user.uid],
    )
    await client.query(
      `update public.platform_access_context set closed_at = now()
        where admin_uid = $1::text and closed_at is null`,
      [user.uid],
    )
    const claims = { ...(user.customClaims || {}) }
    delete claims.platformRole
    await ensureAdmin().auth().setCustomUserClaims(user.uid, claims)
    await ensureAdmin().auth().updateUser(user.uid, { disabled: true })
    await ensureAdmin().auth().revokeRefreshTokens(user.uid)
    await client.query('commit')
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  }
  console.log(`Wyłączono administratora platformy: ${user.email || user.uid}.`)
}

async function list(client) {
  const result = await client.query(
    `select uid, email, display_name, role, active, created_at, updated_at
       from public.platform_admin
      order by active desc, lower(email)`,
  )
  console.table(result.rows)
}

async function main() {
  const action = text(process.argv[2]).toLowerCase()
  if (!['enable', 'disable', 'list'].includes(action)) {
    throw new Error('Użycie: npm run platform-admin -- <enable|disable|list> [--email adres] [--uid UID] [--name nazwa]')
  }
  await loadSecretManagerDatabaseConfig()
  const { pool, connector } = await createPool()
  let client = null
  try {
    client = await pool.connect()
    if (action === 'enable') await enable(client)
    if (action === 'disable') await disable(client)
    if (action === 'list') await list(client)
  } finally {
    client?.release()
    await pool.end()
    connector?.close()
  }
}

main().catch((error) => {
  console.error('Operacja administratora platformy nie powiodła się:', text(error?.message || error))
  process.exitCode = 1
})
