'use strict'

const admin = require('firebase-admin')
const { createPool, loadSecretManagerDatabaseConfig } = require('./migrate-worker-model')
const {
  LINK_CONFIRMATION,
  assertMembershipLinkGate,
  linkAccountMembership,
} = require('../account-membership-link')

const PROJECT_ID = 'iclean-room'
const DATABASE_NAME = 'iclean-room-database'
const INSTANCE_NAME = 'iclean-room:europe-west3:iclean-room-instance'
const APP_NAME = 'cleanzi-account-linking-p0'

function text(value) {
  return String(value ?? '').trim()
}

function email(value) {
  return text(value).toLowerCase()
}

function option(name) {
  const prefix = `--${name}=`
  const inline = process.argv.find((argument) => argument.startsWith(prefix))
  if (inline) return text(inline.slice(prefix.length))
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? text(process.argv[index + 1]) : ''
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`)
}

function quoteIdentifier(value) {
  return `"${text(value).replace(/"/g, '""')}"`
}

function firebaseAuth() {
  const app = admin.apps.find((candidate) => candidate.name === APP_NAME) || admin.initializeApp({
    projectId: PROJECT_ID,
    credential: admin.credential.applicationDefault(),
  }, APP_NAME)
  return { app, auth: admin.auth(app), credential: app.options.credential }
}

function userEmails(user) {
  return [...new Set([
    email(user?.email),
    ...(Array.isArray(user?.providerData) ? user.providerData.map((provider) => email(provider?.email)) : []),
  ].filter(Boolean))]
}

function publicUser(user) {
  return {
    uid: text(user?.uid),
    email: email(user?.email),
    emailVerified: user?.emailVerified === true,
    disabled: user?.disabled === true,
    providers: (Array.isArray(user?.providerData) ? user.providerData : []).map((provider) => text(provider?.providerId)).filter(Boolean).sort(),
    customClaimKeys: Object.keys(user?.customClaims || {}).sort(),
    mfaCount: Array.isArray(user?.multiFactor?.enrolledFactors) ? user.multiFactor.enrolledFactors.length : 0,
    createdAt: text(user?.metadata?.creationTime),
    lastSignInAt: text(user?.metadata?.lastSignInTime),
  }
}

async function listAllUsers(auth) {
  const users = []
  let pageToken
  do {
    const page = await auth.listUsers(1000, pageToken)
    users.push(...(page.users || []))
    pageToken = page.pageToken
  } while (pageToken)
  return users
}

async function readIdentityConfig(credential) {
  const accessToken = await credential.getAccessToken()
  const response = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config`, {
    headers: {
      Authorization: `Bearer ${accessToken.access_token}`,
      'x-goog-user-project': PROJECT_ID,
    },
  })
  if (!response.ok) throw new Error(`IDENTITY_CONFIG_READ_FAILED_${response.status}`)
  const body = await response.json()
  return {
    allowDuplicateEmails: body?.signIn?.allowDuplicateEmails === true,
    beforeCreateConfigured: Boolean(body?.blockingFunctions?.triggers?.beforeCreate?.functionUri),
    beforeSignInConfigured: Boolean(body?.blockingFunctions?.triggers?.beforeSignIn?.functionUri),
  }
}

async function readMembershipRows(client, targetEmail) {
  const result = await client.query(
    `select
       m.uid,
       m.org_id,
       m.worker_id,
       m.role,
       m.status as membership_status,
       w.auth_uid,
       w.login_email,
       w.email,
       w.active as worker_active,
       w.status as worker_status,
       o.status as organization_status,
       o.deleted_at as organization_deleted_at
     from public.organization_member m
     join public.organizations o on o.org_id = m.org_id
     join public.worker w
       on w.org_id = m.org_id
      and w.worker_id = m.worker_id
    where lower(btrim(coalesce(w.login_email, ''))) = $1::text
       or lower(btrim(coalesce(w.email, ''))) = $1::text
    order by m.uid, m.org_id, m.worker_id`,
    [targetEmail],
  )
  return result.rows || []
}

async function readOrganizationRows(client, targetOrgId) {
  if (!targetOrgId) return []
  const result = await client.query(
    `select
       m.uid,
       m.org_id,
       m.worker_id,
       m.role,
       m.status as membership_status,
       w.auth_uid,
       w.login_email,
       w.email,
       w.active as worker_active,
       w.status as worker_status,
       o.name as organization_name,
       o.owner_uid,
       o.owner_worker_id,
       o.status as organization_status,
       o.deleted_at as organization_deleted_at
     from public.organization_member m
     join public.organizations o on o.org_id = m.org_id
     left join public.worker w
       on w.org_id = m.org_id
      and w.worker_id = m.worker_id
    where lower(m.org_id) = lower($1::text)
    order by m.role, m.uid, m.worker_id`,
    [targetOrgId],
  )
  return result.rows || []
}

async function readOrganizationEmailEvidence(client, targetOrgId) {
  if (!targetOrgId) return []
  const relations = await client.query(
    `select
       to_regclass('public.organization_company_profile')::text as company_profile,
       to_regclass('public.organization_profile')::text as legacy_profile`,
  )
  const evidence = []
  if (relations.rows?.[0]?.company_profile) {
    const result = await client.query(
      `select 'organization_company_profile.billing_email'::text as source,
              billing_email::text as email
         from public.organization_company_profile
        where lower(org_id) = lower($1::text)
          and nullif(btrim(coalesce(billing_email, '')), '') is not null`,
      [targetOrgId],
    )
    evidence.push(...(result.rows || []))
  }
  if (relations.rows?.[0]?.legacy_profile) {
    const result = await client.query(
      `select 'organization_profile.billing_email'::text as source,
              billing_email::text as email
         from public.organization_profile
        where lower(org_id) = lower($1::text)
          and nullif(btrim(coalesce(billing_email, '')), '') is not null`,
      [targetOrgId],
    )
    evidence.push(...(result.rows || []))
  }
  return evidence
}

async function readUidReferences(client, uid) {
  const columns = await client.query(
    `select table_name, column_name
       from information_schema.columns
      where table_schema = 'public'
        and column_name in (
          'uid', 'auth_uid', 'owner_uid', 'billing_owner_uid', 'created_by_uid',
          'actor_uid', 'admin_uid', 'source_auth_uid'
        )
      order by table_name, column_name`,
  )
  const references = []
  for (const row of columns.rows || []) {
    const table = quoteIdentifier(row.table_name)
    const column = quoteIdentifier(row.column_name)
    const result = await client.query(
      `select count(*)::integer as count from public.${table} where ${column}::text = $1::text`,
      [uid],
    )
    const count = Number(result.rows?.[0]?.count || 0)
    if (count > 0) references.push({ table: row.table_name, column: row.column_name, count })
  }
  return references
}

function duplicateEmailGroups(users) {
  const groups = new Map()
  for (const user of users) {
    for (const candidateEmail of userEmails(user)) {
      const group = groups.get(candidateEmail) || new Set()
      group.add(text(user.uid))
      groups.set(candidateEmail, group)
    }
  }
  return [...groups.entries()]
    .filter(([, uids]) => uids.size > 1)
    .map(([candidateEmail, uids]) => ({ email: candidateEmail, uids: [...uids].sort() }))
    .sort((left, right) => left.email.localeCompare(right.email, 'en'))
}

async function main() {
  const targetEmail = email(option('email'))
  const targetOrgId = text(option('org'))
  const membershipLinkRequested = hasFlag('link-membership')
  if (hasFlag('apply')) throw new Error('DESTRUCTIVE_AUTH_MERGE_DISABLED')
  if (!targetEmail) throw new Error('TARGET_EMAIL_REQUIRED')
  if (option('project') && option('project') !== PROJECT_ID) throw new Error('PROJECT_MISMATCH')

  process.env.FIREBASE_PROJECT_ID = PROJECT_ID
  process.env.GOOGLE_CLOUD_PROJECT = PROJECT_ID
  process.env.CLOUD_SQL_CONNECTION_NAME = INSTANCE_NAME
  process.env.DB_NAME = DATABASE_NAME
  process.env.DB_CONNECTOR = 'cloudsql'
  await loadSecretManagerDatabaseConfig()

  const { auth, credential } = firebaseAuth()
  const { pool, connector } = await createPool()
  let client
  try {
    client = await pool.connect()
    const [identityConfig, allUsers, membershipRows, organizationRows, organizationEmailEvidence] = await Promise.all([
      readIdentityConfig(credential),
      listAllUsers(auth),
      readMembershipRows(client, targetEmail),
      readOrganizationRows(client, targetOrgId),
      readOrganizationEmailEvidence(client, targetOrgId),
    ])
    const matchingUsers = allUsers.filter((user) => userEmails(user).includes(targetEmail))
    const organizationOwnerUids = [...new Set(organizationRows
      .map((row) => text(row.owner_uid))
      .filter(Boolean))]
    const organizationOwnerUsers = organizationOwnerUids.map((uid) => {
      const user = allUsers.find((candidate) => text(candidate.uid) === uid)
      return user ? publicUser(user) : { uid, missingFromFirebaseAuth: true }
    })
    const canonicalUids = [...new Set(membershipRows.map((row) => text(row.uid)).filter(Boolean))]
    const canonicalUid = canonicalUids.length === 1 ? canonicalUids[0] : ''
    const duplicateUsers = matchingUsers.filter((user) => text(user.uid) !== canonicalUid)
    const referenceEntries = await Promise.all(duplicateUsers.map(async (user) => ({
      uid: text(user.uid),
      references: await readUidReferences(client, text(user.uid)),
    })))
    const report = {
      mode: membershipLinkRequested ? 'MEMBERSHIP_LINK_PREFLIGHT' : 'AUDIT',
      projectId: PROJECT_ID,
      targetEmail,
      targetOrgId,
      identityConfig,
      globalDuplicateEmailGroupCount: duplicateEmailGroups(allUsers).length,
      matchingUsers: matchingUsers.map(publicUser),
      membershipRows,
      organizationRows,
      organizationEmailEvidence,
      organizationOwnerUsers,
      canonicalUid,
      duplicateUidReferences: referenceEntries,
      duplicateReviewRequired: canonicalUids.length > 1 || duplicateUsers.length > 1,
      readyToLinkMembership: matchingUsers.length === 1 && membershipRows.length === 0 &&
        referenceEntries.find((entry) => entry.uid === text(matchingUsers[0]?.uid))?.references?.length === 0,
    }
    console.log(JSON.stringify(report, null, 2))

    if (membershipLinkRequested) {
      const targetUser = matchingUsers.length === 1 ? publicUser(matchingUsers[0]) : null
      const targetUidReferences = referenceEntries.find((entry) => entry.uid === text(targetUser?.uid))?.references || []
      const plan = assertMembershipLinkGate({
        requested: {
          confirmation: option('confirm'),
          projectId: option('project'),
          orgId: targetOrgId,
          confirmedOrgId: text(option('confirm-org')),
          targetEmail,
          confirmedEmail: email(option('confirm-email')),
          confirmedUid: text(option('confirm-uid')),
          role: text(option('role')).toUpperCase(),
          displayName: text(option('display-name')),
        },
        targetUser,
        matchingUserCount: matchingUsers.length,
        membershipRows,
        organizationRows,
        targetUidReferences,
      })
      console.log(JSON.stringify({ ok: true, result: await linkAccountMembership(client, plan) }, null, 2))
      return
    }

    return
  } finally {
    client?.release()
    await pool.end()
    connector?.close()
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`ACCOUNT_LINKING_P0_FAILED:${text(error?.code || error?.message || error)}`)
    process.exitCode = 1
  })
}

module.exports = {
  LINK_CONFIRMATION,
  PROJECT_ID,
  duplicateEmailGroups,
  publicUser,
  userEmails,
}
