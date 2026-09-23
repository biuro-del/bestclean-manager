'use strict'

const {
  buildWorkerId,
  buildWorkerLogin,
  nextWorkerNumber,
} = require('./worker-id-policy')

const LINK_CONFIRMATION = 'CLZ-ACCOUNT-LINKING-P0-LINK-MEMBERSHIP-20260923-01'

function text(value) {
  return String(value ?? '').trim()
}

function email(value) {
  return text(value).toLowerCase()
}

function assertMembershipLinkGate({
  requested,
  targetUser,
  matchingUserCount,
  membershipRows,
  organizationRows,
  targetUidReferences,
}) {
  if (requested.confirmation !== LINK_CONFIRMATION) throw new Error('LINK_CONFIRMATION_MISMATCH')
  if (requested.projectId !== 'iclean-room') throw new Error('LINK_PROJECT_MISMATCH')
  if (!requested.orgId || requested.confirmedOrgId !== requested.orgId) throw new Error('LINK_ORG_CONFIRMATION_MISMATCH')
  if (!requested.targetEmail || requested.confirmedEmail !== requested.targetEmail) throw new Error('LINK_EMAIL_CONFIRMATION_MISMATCH')
  if (!targetUser || requested.confirmedUid !== text(targetUser.uid)) throw new Error('LINK_UID_CONFIRMATION_MISMATCH')
  if (matchingUserCount !== 1) throw new Error('LINK_EXACT_AUTH_USER_REQUIRED')
  if (targetUser.disabled || targetUser.emailVerified !== true || email(targetUser.email) !== requested.targetEmail) {
    throw new Error('LINK_VERIFIED_ACTIVE_EMAIL_REQUIRED')
  }
  if (!(targetUser.providers || []).includes('google.com')) throw new Error('LINK_GOOGLE_PROVIDER_REQUIRED')
  if ((membershipRows || []).length) throw new Error('LINK_EMAIL_ALREADY_ASSIGNED')
  if ((targetUidReferences || []).length) throw new Error('LINK_UID_DATABASE_REFERENCES_PRESENT')
  if (requested.role !== 'ADMIN') throw new Error('LINK_ROLE_MUST_BE_ADMIN')
  if (!requested.displayName || requested.displayName.length > 200) throw new Error('LINK_DISPLAY_NAME_INVALID')

  const targetOrganizationRows = (organizationRows || []).filter((row) => text(row.org_id) === requested.orgId)
  if (!targetOrganizationRows.length) throw new Error('LINK_ORGANIZATION_NOT_FOUND')
  if (targetOrganizationRows.some((row) => text(row.organization_status).toUpperCase() !== 'ACTIVE' || row.organization_deleted_at)) {
    throw new Error('LINK_ORGANIZATION_NOT_ACTIVE')
  }
  const ownerUids = [...new Set(targetOrganizationRows.map((row) => text(row.owner_uid)).filter(Boolean))]
  if (ownerUids.length !== 1) throw new Error('LINK_EXACT_OWNER_REQUIRED')

  return {
    orgId: requested.orgId,
    uid: text(targetUser.uid),
    targetEmail: requested.targetEmail,
    displayName: requested.displayName,
    role: requested.role,
    createdByUid: ownerUids[0],
  }
}

async function linkAccountMembership(client, plan) {
  let transactionStarted = false
  try {
    await client.query('begin')
    transactionStarted = true
    await client.query("set local lock_timeout = '5s'")
    await client.query("set local statement_timeout = '30s'")
    await client.query('select pg_advisory_xact_lock(hashtext($1::text))', [`account-membership-link:${plan.orgId}`])
    await client.query('select pg_advisory_xact_lock(hashtext($1::text))', [`account-membership-link-uid:${plan.uid}`])
    await client.query('lock table public.worker, public.organization_member in share row exclusive mode')

    const organization = await client.query(
      `select org_id, status, deleted_at, owner_uid
         from public.organizations
        where org_id = $1::text
        for update`,
      [plan.orgId],
    )
    const org = organization.rows?.[0]
    if (!org) throw new Error('LINK_ORGANIZATION_NOT_FOUND')
    if (text(org.status).toUpperCase() !== 'ACTIVE' || org.deleted_at) throw new Error('LINK_ORGANIZATION_NOT_ACTIVE')
    if (text(org.owner_uid) !== plan.createdByUid) throw new Error('LINK_OWNER_CHANGED')

    const conflicts = await client.query(
      `select
         exists(select 1 from public.organization_member where uid = $1::text) as uid_membership_exists,
         exists(select 1 from public.worker where auth_uid = $1::text) as uid_worker_exists,
         exists(
           select 1 from public.worker
            where lower(btrim(coalesce(login_email, ''))) = $2::text
               or lower(btrim(coalesce(email, ''))) = $2::text
         ) as email_worker_exists`,
      [plan.uid, plan.targetEmail],
    )
    const conflict = conflicts.rows?.[0] || {}
    if (conflict.uid_membership_exists || conflict.uid_worker_exists) throw new Error('LINK_UID_DATABASE_REFERENCES_PRESENT')
    if (conflict.email_worker_exists) throw new Error('LINK_EMAIL_ALREADY_ASSIGNED')

    const reservationReady = await client.query(
      "select to_regclass('public.worker_id_reservation')::text as relation_name",
    )
    if (!reservationReady.rows?.[0]?.relation_name) throw new Error('LINK_WORKER_RESERVATION_SCHEMA_REQUIRED')

    const [reservations, workers] = await Promise.all([
      client.query(
        `select worker_number, worker_id
           from public.worker_id_reservation
          where org_id = $1::text
          order by worker_number asc`,
        [plan.orgId],
      ),
      client.query('select worker_id from public.worker where org_id = $1::text', [plan.orgId]),
    ])
    const workerNumber = nextWorkerNumber(plan.orgId, reservations.rows, workers.rows)
    const workerId = buildWorkerId(plan.orgId, workerNumber)
    const login = buildWorkerLogin(plan.orgId, workerNumber)

    await client.query(
      `insert into public.worker_id_reservation (
         org_id, worker_number, worker_id, created_at, created_by_uid
       ) values ($1::text, $2::integer, $3::text, now(), $4::text)`,
      [plan.orgId, workerNumber, workerId, plan.createdByUid],
    )
    await client.query(
      `insert into public.organization_member (org_id, uid, role, worker_id, status, created_at)
       values ($1::text, $2::text, 'ADMIN', $3::text, 'ACTIVE', now())`,
      [plan.orgId, plan.uid, workerId],
    )
    await client.query(
      `insert into public.worker (
         org_id, login, worker_id, full_name, login_email, role, active,
         email, worker_type, auth_uid, status, edit, created_at, updated_at
       ) values (
         $1::text, $2::text, $3::text, $4::text, $5::text, 'ADMIN', true,
         $5::text, 'Administrator', $6::text, 'ACTIVE', 'account-linking-p0', now(), now()
       )`,
      [plan.orgId, login, workerId, plan.displayName, plan.targetEmail, plan.uid],
    )

    const postflight = await client.query(
      `select m.org_id, m.uid, m.role, m.status, m.worker_id,
              w.auth_uid, w.login, w.login_email, w.active, w.status as worker_status
         from public.organization_member m
         join public.worker w
           on w.org_id = m.org_id
          and w.worker_id = m.worker_id
          and w.auth_uid = m.uid
        where m.org_id = $1::text
          and m.uid = $2::text`,
      [plan.orgId, plan.uid],
    )
    if (postflight.rowCount !== 1) throw new Error('LINK_POSTFLIGHT_ROW_MISSING')
    const linked = postflight.rows[0]
    if (
      text(linked.role) !== 'ADMIN' || text(linked.status) !== 'ACTIVE' ||
      linked.active !== true || text(linked.worker_status) !== 'ACTIVE' ||
      email(linked.login_email) !== plan.targetEmail || text(linked.auth_uid) !== plan.uid
    ) {
      throw new Error('LINK_POSTFLIGHT_MISMATCH')
    }

    await client.query('commit')
    transactionStarted = false
    return { orgId: plan.orgId, uid: plan.uid, role: 'ADMIN', workerId, login, email: plan.targetEmail }
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('rollback')
      } catch {
        // Preserve the original failure.
      }
    }
    throw error
  }
}

module.exports = {
  LINK_CONFIRMATION,
  assertMembershipLinkGate,
  linkAccountMembership,
}
