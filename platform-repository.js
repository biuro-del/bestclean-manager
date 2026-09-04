'use strict'

const crypto = require('node:crypto')
const {
  PLATFORM_ROLE,
  hasFreshAuthentication,
  hasPlatformOwnerClaim,
  hasSecondFactor,
  hasVerifiedEmail,
  isSensitivePlatformOperation,
  sanitizeAuditValue,
} = require('./platform-policy')
const { getPlatformRequestContext } = require('./platform-request-context')
const { getValidEmailMfaSession } = require('./platform-email-mfa')
const cleanziAdminRepository = require('./Cleanzi-admin/backend/platform-admin-repository')
const { PAID_PLAN_CODES, assertCanonicalPlanCode } = require('./plan-policy')

const PLATFORM_TABLES = [
  'public.platform_admin',
  'public.platform_access_context',
  'public.platform_admin_audit_log',
  'public.platform_email_mfa_challenge',
  'public.platform_email_mfa_session',
]

function text(value) {
  return String(value ?? '').trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function publicError(statusCode, publicCode, publicMessage, details = undefined) {
  const error = new Error(publicCode)
  error.statusCode = statusCode
  error.publicCode = publicCode
  error.publicMessage = publicMessage
  if (details !== undefined) error.details = details
  return error
}

async function inspectPlatformSchema(client) {
  const result = await client.query(
    `select relation_name,
            to_regclass(relation_name) is not null as exists
       from unnest($1::text[]) relations(relation_name)`,
    [PLATFORM_TABLES],
  )
  const missing = result.rows.filter((row) => !row.exists).map((row) => text(row.relation_name))
  return { ready: missing.length === 0, missing }
}

async function assertPlatformSchemaReady(client) {
  const readiness = await inspectPlatformSchema(client)
  if (!readiness.ready) {
    throw publicError(
      503,
      'PLATFORM_SCHEMA_NOT_READY',
      'Schemat bazy dla administratora platformy nie jest gotowy. Uruchom migrację platformową.',
      readiness,
    )
  }
  return readiness
}

async function getPlatformAdmin(client, uid) {
  const result = await client.query(
    `select p.uid, p.email, p.display_name, p.role, p.active, p.created_at, p.updated_at,
            exists(
              select 1 from public.organization_member m where m.uid = p.uid
            ) as has_tenant_membership,
            exists(
              select 1
                from public.worker w
               where w.auth_uid = p.uid
                  or lower(coalesce(w.email, '')) = lower(p.email)
                  or lower(coalesce(w.login_email, '')) = lower(p.email)
            ) as has_tenant_worker
       from public.platform_admin p
      where p.uid = $1::text
      limit 1`,
    [text(uid)],
  )
  return result.rows[0] || null
}

async function assertPlatformPrincipal(client, decodedToken, { requireMfa = true } = {}) {
  if (!hasPlatformOwnerClaim(decodedToken)) {
    throw publicError(403, 'PLATFORM_CLAIM_REQUIRED', 'Brak roli administratora platformy.')
  }
  if (!hasVerifiedEmail(decodedToken)) {
    throw publicError(403, 'PLATFORM_EMAIL_NOT_VERIFIED', 'Email administratora platformy nie jest zweryfikowany.')
  }
  await assertPlatformSchemaReady(client)
  const admin = await getPlatformAdmin(client, decodedToken?.uid)
  if (!admin || admin.active !== true || text(admin.role).toUpperCase() !== PLATFORM_ROLE) {
    throw publicError(403, 'PLATFORM_ADMIN_INACTIVE', 'Konto administratora platformy jest nieaktywne.')
  }
  if (admin.has_tenant_membership === true || admin.has_tenant_worker === true) {
    throw publicError(
      403,
      'PLATFORM_TENANT_IDENTITY_CONFLICT',
      'Konto administratora platformy nie może być pracownikiem ani członkiem organizacji.',
    )
  }
  if (lower(admin.email) !== lower(decodedToken?.email)) {
    throw publicError(403, 'PLATFORM_EMAIL_MISMATCH', 'Email tokenu nie odpowiada konfiguracji administratora platformy.')
  }

  const firebaseMfa = hasSecondFactor(decodedToken)
  const request = getPlatformRequestContext()
  const emailMfaSession = firebaseMfa
    ? null
    : await getValidEmailMfaSession(client, {
        uid: decodedToken?.uid,
        token: request?.platformEmailMfaToken,
      })
  if (requireMfa && !firebaseMfa && !emailMfaSession) {
    throw publicError(403, 'PLATFORM_MFA_REQUIRED', 'Administrator platformy musi potwierdzić logowanie drugim składnikiem.')
  }

  return {
    uid: text(admin.uid),
    email: lower(admin.email),
    displayName: text(admin.display_name) || lower(admin.email),
    role: PLATFORM_ROLE,
    mfaVerified: firebaseMfa || Boolean(emailMfaSession),
    mfaMethod: firebaseMfa ? 'firebase' : emailMfaSession ? 'email' : '',
    mfaVerifiedAt: firebaseMfa
      ? new Date(Number(decodedToken?.auth_time || 0) * 1000)
      : emailMfaSession?.verified_at || null,
  }
}

function hasFreshPlatformAuthentication(decodedToken, principal, nowMs = Date.now()) {
  if (hasFreshAuthentication(decodedToken, Math.floor(nowMs / 1000))) return true
  if (text(principal?.mfaMethod) !== 'email' || !principal?.mfaVerifiedAt) return false
  const verifiedAt = new Date(principal.mfaVerifiedAt).getTime()
  return Number.isFinite(verifiedAt) && verifiedAt > 0 && nowMs - verifiedAt <= 5 * 60 * 1000
}

async function getActiveAccessContext(client, { uid, orgId = '', contextId = '' }) {
  const result = await client.query(
    `select c.context_id,
            c.admin_uid,
            c.org_id,
            c.reason,
            c.opened_at,
            c.closed_at,
            o.name as organization_name,
            o.status as organization_status,
            o.deleted_at as organization_deleted_at,
            coalesce(s.plan_code, '') as plan_code,
            coalesce(s.status, '') as subscription_status,
            s.trial_ends_at,
            nullif(to_jsonb(s)->>'current_period_ends_at', '')::timestamptz as current_period_ends_at
       from public.platform_access_context c
       join public.organizations o on o.org_id = c.org_id
       left join public.organization_subscription s on s.org_id = c.org_id
      where c.admin_uid = $1::text
        and c.closed_at is null
        and ($2::text = '' or c.org_id = $2::text)
        and ($3::text = '' or c.context_id = $3::text)
      order by c.opened_at desc
      limit 1`,
    [text(uid), text(orgId), text(contextId)],
  )
  return result.rows[0] || null
}

async function resolvePlatformMembership(client, orgId, uid) {
  const request = getPlatformRequestContext()
  const decodedToken = request?.decodedToken
  if (!decodedToken || text(decodedToken.uid) !== text(uid) || !hasPlatformOwnerClaim(decodedToken)) return null

  const principal = await assertPlatformPrincipal(client, decodedToken)
  if (
    (text(request?.method).toUpperCase() === 'DELETE' || isSensitivePlatformOperation('', request?.pathname)) &&
    !hasFreshPlatformAuthentication(decodedToken, principal)
  ) {
    throw publicError(
      403,
      'PLATFORM_REAUTH_REQUIRED',
      'Ta operacja wymaga ponownego logowania z MFA w ciągu ostatnich 5 minut.',
    )
  }
  const contextId = text(request?.platformContextId)
  if (!contextId) {
    throw publicError(403, 'PLATFORM_CONTEXT_REQUIRED', 'Brak aktywnego kontekstu organizacji platformy.')
  }
  const access = await getActiveAccessContext(client, { uid: principal.uid, orgId, contextId })
  if (!access) {
    throw publicError(403, 'PLATFORM_CONTEXT_INVALID', 'Kontekst organizacji platformy jest nieprawidłowy lub zamknięty.')
  }
  const mutatingRequest = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(text(request?.method).toUpperCase())
  if (mutatingRequest && !request.platformAudit) {
    const auditEntry = {
      principal,
      access,
      operation: `HTTP_${text(request.method).toUpperCase()}_${text(request.pathname)}`.slice(0, 160),
      target: `organization:${text(orgId)}`,
    }
    await appendAudit(client, {
      requestId: request.requestId,
      phase: 'REQUESTED',
      principal,
      contextId: access.context_id,
      orgId,
      operation: auditEntry.operation,
      target: auditEntry.target,
      payload: null,
      result: null,
      request,
    })
    request.platformAudit = auditEntry
  }
  return {
    role: PLATFORM_ROLE,
    status: 'ACTIVE',
    platformContext: access,
    platformPrincipal: principal,
  }
}

async function listOrganizations(client, filters = {}) {
  return cleanziAdminRepository.listOrganizations(client, filters)
}

async function getDataConnectOperationOptions(client, { orgId, kind }) {
  const normalizedOrgId = text(orgId)
  const normalizedKind = text(kind).toLowerCase()
  const allowedRoles = normalizedKind === 'mutation'
    ? ['OWNER', 'ADMIN', 'ADMINISTRATOR', 'SUPERADMIN']
    : [
        'OWNER',
        'ADMIN',
        'ADMINISTRATOR',
        'SUPERADMIN',
        'MANAGER',
        'KIEROWNIK',
        'COORDINATOR',
        'KOORDYNATOR',
        'MEMBER',
        'WORKER',
        'PRACOWNIK',
        'INTERN',
        'STAZYSTA',
        'STAŻYSTA',
      ]

  const result = await client.query(
    `select m.uid, m.role
       from public.organization_member m
       join public.organizations o on o.org_id = m.org_id
      where m.org_id = $1::text
        and nullif(trim(m.uid), '') is not null
        and upper(coalesce(m.status, '')) = 'ACTIVE'
        and upper(coalesce(m.role, '')) = any($2::text[])
      order by case
                 when m.uid = o.owner_uid then 0
                 when upper(coalesce(m.role, '')) = 'OWNER' then 1
                 when upper(coalesce(m.role, '')) in ('ADMIN', 'ADMINISTRATOR', 'SUPERADMIN') then 2
                 else 3
               end,
               m.uid
      limit 1`,
    [normalizedOrgId, allowedRoles],
  )
  const uid = text(result.rows[0]?.uid)
  if (!uid) {
    throw publicError(
      503,
      'PLATFORM_DATACONNECT_ACTOR_MISSING',
      'Organizacja nie ma aktywnego konta, ktore moze odczytac jej dane.',
    )
  }

  // Named tenant operations contain explicit auth.uid expressions outside @auth.
  // The Admin SDK bypasses @auth, but those expressions still need a valid tenant UID.
  // Impersonation is limited to Data Connect evaluation; the platform actor remains
  // recorded only in the private platform audit and is never written to tenant fields.
  return { impersonate: { authClaims: { sub: uid } } }
}

async function openAccessContext(client, { principal, orgId, reason, request }) {
  const normalizedReason = text(reason).slice(0, 1000)
  if (normalizedReason.length < 3) {
    throw publicError(400, 'PLATFORM_REASON_REQUIRED', 'Podaj powód wejścia do organizacji (minimum 3 znaki).')
  }
  const organization = await client.query(
    `select o.org_id, o.name, o.status, o.deleted_at,
            coalesce(s.plan_code, '') as plan_code,
            coalesce(s.status, '') as subscription_status,
            s.trial_ends_at,
            nullif(to_jsonb(s)->>'current_period_ends_at', '')::timestamptz as current_period_ends_at
       from public.organizations o
       left join public.organization_subscription s on s.org_id = o.org_id
      where o.org_id = $1::text
      limit 1`,
    [text(orgId)],
  )
  const row = organization.rows[0]
  if (!row) throw publicError(404, 'ORGANIZATION_NOT_FOUND', 'Nie znaleziono organizacji.')

  const contextId = crypto.randomUUID()
  await client.query('begin')
  try {
    await client.query(
      `select pg_advisory_xact_lock(hashtext($1::text))`,
      [`platform-context:${principal.uid}`],
    )
    await client.query(
      `update public.platform_access_context
          set closed_at = now()
        where admin_uid = $1::text
          and closed_at is null`,
      [principal.uid],
    )
    await client.query(
      `insert into public.platform_access_context (
         context_id, admin_uid, org_id, reason, opened_at, ip_address, user_agent
       ) values ($1::text, $2::text, $3::text, $4::text, now(), nullif($5::text, ''), nullif($6::text, ''))`,
      [contextId, principal.uid, text(orgId), normalizedReason, text(request?.ipAddress), text(request?.userAgent)],
    )
    await client.query('commit')
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  }

  return {
    contextId,
    reason: normalizedReason,
    activeOrgId: text(row.org_id),
    organizationName: text(row.name),
    organizationStatus: text(row.status),
    organizationDeletedAt: row.deleted_at || null,
    planCode: text(row.plan_code) || 'PLATFORM',
    subscriptionStatus: text(row.subscription_status),
    subscriptionEndsAt: row.plan_code === 'TRIAL' ? row.trial_ends_at : row.current_period_ends_at,
  }
}

async function closeAccessContext(client, { uid, contextId = '' }) {
  const result = await client.query(
    `update public.platform_access_context
        set closed_at = now()
      where admin_uid = $1::text
        and closed_at is null
        and ($2::text = '' or context_id = $2::text)
      returning context_id, org_id, reason, opened_at, closed_at`,
    [text(uid), text(contextId)],
  )
  return result.rows[0] || null
}

async function appendAudit(client, entry) {
  const result = await client.query(
    `insert into public.platform_admin_audit_log (
       audit_id, request_id, phase, admin_uid, admin_email, context_id, org_id,
       operation, target, payload, result, ip_address, user_agent, created_at
     ) values (
       $1::text, $2::text, $3::text, $4::text, $5::text, nullif($6::text, ''), nullif($7::text, ''),
       $8::text, nullif($9::text, ''), $10::jsonb, $11::jsonb, nullif($12::text, ''), nullif($13::text, ''), now()
     ) returning audit_id, created_at`,
    [
      crypto.randomUUID(),
      text(entry.requestId) || crypto.randomUUID(),
      text(entry.phase),
      text(entry.principal?.uid),
      lower(entry.principal?.email),
      text(entry.contextId),
      text(entry.orgId),
      text(entry.operation).slice(0, 160),
      text(entry.target).slice(0, 500),
      JSON.stringify(sanitizeAuditValue(entry.payload)),
      JSON.stringify(sanitizeAuditValue(entry.result)),
      text(entry.request?.ipAddress),
      text(entry.request?.userAgent),
    ],
  )
  return result.rows[0]
}

async function listAudit(client, filters = {}) {
  const limit = Math.min(200, Math.max(1, Math.trunc(Number(filters.limit) || 50)))
  const result = await client.query(
    `select audit_id, request_id, phase, admin_uid, admin_email, context_id, org_id,
            operation, target, payload, result, ip_address, user_agent, created_at
       from public.platform_admin_audit_log
      where ($1::text = '' or org_id = $1::text)
        and ($2::text = '' or admin_uid = $2::text)
        and ($3::text = '' or operation ilike '%' || $3::text || '%')
      order by created_at desc
      limit $4::integer`,
    [text(filters.orgId), text(filters.adminUid), text(filters.operation), limit],
  )
  return result.rows
}

async function updateOrganization(client, orgId, payload) {
  const name = text(payload.name).slice(0, 120)
  const status = text(payload.status).toUpperCase().slice(0, 30)
  const onboardingStatus = text(payload.onboardingStatus).toUpperCase().slice(0, 30)
  const result = await client.query(
    `update public.organizations
        set name = case when $2::text = '' then name else $2::text end,
            status = case when $3::text = '' then status else $3::text end,
            onboarding_status = case when $4::text = '' then onboarding_status else $4::text end
      where org_id = $1::text
      returning org_id, name, status, onboarding_status, owner_uid, owner_worker_id, deleted_at`,
    [text(orgId), name, status, onboardingStatus],
  )
  if (!result.rows[0]) throw publicError(404, 'ORGANIZATION_NOT_FOUND', 'Nie znaleziono organizacji.')
  return result.rows[0]
}

async function updateSubscription(client, orgId, payload) {
  const planCode = assertCanonicalPlanCode(payload.planCode)
  const status = text(payload.status).toUpperCase().slice(0, 30)
  if (PAID_PLAN_CODES.includes(planCode) && status === 'ACTIVE') {
    throw publicError(
      409,
      'PAID_ACTIVATION_WEBHOOK_REQUIRED',
      'Płatny plan może aktywować wyłącznie zweryfikowany webhook operatora płatności.',
    )
  }
  if (planCode === 'TRIAL' && status !== 'TRIALING') {
    throw publicError(400, 'INVALID_TRIAL_STATUS', 'Plan TRIAL wymaga statusu TRIALING.')
  }
  const trialEndsAt = payload.trialEndsAt || null
  const currentPeriodEndsAt = payload.currentPeriodEndsAt || null
  if (!planCode || !status) throw publicError(400, 'INVALID_SUBSCRIPTION', 'Pakiet i status subskrypcji są wymagane.')

  const hasCurrentPeriod = await client.query(
    `select exists(
       select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'organization_subscription'
          and column_name = 'current_period_ends_at'
     ) as exists`,
  )
  const currentColumn = hasCurrentPeriod.rows[0]?.exists === true
  const sql = currentColumn
    ? `insert into public.organization_subscription (org_id, plan_code, status, trial_ends_at, current_period_ends_at)
       values ($1::text, $2::text, $3::text, $4::timestamptz, $5::timestamptz)
       on conflict (org_id) do update set plan_code = excluded.plan_code, status = excluded.status,
         trial_ends_at = excluded.trial_ends_at, current_period_ends_at = excluded.current_period_ends_at
       returning *`
    : `insert into public.organization_subscription (org_id, plan_code, status, trial_ends_at)
       values ($1::text, $2::text, $3::text, $4::timestamptz)
       on conflict (org_id) do update set plan_code = excluded.plan_code, status = excluded.status,
         trial_ends_at = excluded.trial_ends_at
       returning *`
  const result = await client.query(sql, currentColumn
    ? [text(orgId), planCode, status, trialEndsAt, currentPeriodEndsAt]
    : [text(orgId), planCode, status, trialEndsAt])
  return result.rows[0]
}

async function setOrganizationDeleted(client, orgId, deleted) {
  const result = await client.query(
    `update public.organizations
        set deleted_at = case when $2::boolean then coalesce(deleted_at, now()) else null end
      where org_id = $1::text
      returning org_id, name, status, deleted_at`,
    [text(orgId), Boolean(deleted)],
  )
  if (!result.rows[0]) throw publicError(404, 'ORGANIZATION_NOT_FOUND', 'Nie znaleziono organizacji.')
  return result.rows[0]
}

async function transferOrganizationOwner(client, orgId, newOwnerWorkerId) {
  const workerId = text(newOwnerWorkerId).slice(0, 128)
  if (!workerId) throw publicError(400, 'OWNER_WORKER_REQUIRED', 'Wybierz pracownika, który zostanie Ownerem.')
  await client.query('begin')
  try {
    const organizationResult = await client.query(
      `select org_id, owner_worker_id from public.organizations where org_id = $1::text for update`,
      [text(orgId)],
    )
    const organization = organizationResult.rows[0]
    if (!organization) throw publicError(404, 'ORGANIZATION_NOT_FOUND', 'Nie znaleziono organizacji.')
    const workerResult = await client.query(
      `select worker_id, auth_uid from public.worker
        where org_id = $1::text and worker_id = $2::text and active is true
        limit 1`,
      [text(orgId), workerId],
    )
    const newOwner = workerResult.rows[0]
    if (!newOwner || !text(newOwner.auth_uid)) {
      throw publicError(400, 'OWNER_ACCOUNT_REQUIRED', 'Nowy Owner musi być aktywnym pracownikiem z kontem Firebase Auth.')
    }
    const oldOwnerWorkerId = text(organization.owner_worker_id)
    if (oldOwnerWorkerId && oldOwnerWorkerId !== workerId) {
      await client.query(
        `update public.worker set role = 'ADMIN', updated_at = now()
          where org_id = $1::text and worker_id = $2::text`,
        [text(orgId), oldOwnerWorkerId],
      )
      await client.query(
        `update public.organization_member set role = 'ADMIN'
          where org_id = $1::text and worker_id = $2::text`,
        [text(orgId), oldOwnerWorkerId],
      )
    }
    await client.query(
      `update public.worker set role = 'OWNER', updated_at = now()
        where org_id = $1::text and worker_id = $2::text`,
      [text(orgId), workerId],
    )
    await client.query(
      `update public.organization_member set role = 'OWNER', status = 'ACTIVE'
        where org_id = $1::text and uid = $2::text`,
      [text(orgId), text(newOwner.auth_uid)],
    )
    const result = await client.query(
      `update public.organizations
          set owner_uid = $2::text, owner_worker_id = $3::text
        where org_id = $1::text
        returning org_id, owner_uid, owner_worker_id`,
      [text(orgId), text(newOwner.auth_uid), workerId],
    )
    await client.query('commit')
    return { ...result.rows[0], previousOwnerWorkerId: oldOwnerWorkerId || null }
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  }
}

async function preserveTenantMutationAuthors(client, operationName, variables) {
  const result = { ...(variables || {}) }
  const orgId = text(result.orgId)
  if (!orgId) return result

  let query = ''
  let params = []
  let assignments = null
  if (operationName === 'UpsertTaskForOrg' && text(result.idTask)) {
    query = `select created_by_uid, updated_by_uid from public.task
              where org_id = $1::text and id_task = $2::text limit 1`
    params = [orgId, text(result.idTask)]
    assignments = { createdByUid: 'created_by_uid', updatedByUid: 'updated_by_uid' }
  } else if (
    ['UpdateZoneForOrg', 'UpdateZoneWithRequiredVisitForOrg'].includes(operationName) &&
    text(result.zoneId)
  ) {
    query = `select edited_by from public.zone
              where org_id = $1::text and id = $2::text limit 1`
    params = [orgId, text(result.zoneId)]
    assignments = { editedBy: 'edited_by' }
  } else if (operationName === 'UpdateWorkdayForOrg' && text(result.workdayId)) {
    query = `select updated_by from public.workday
              where org_id = $1::text and workday_id = $2::text limit 1`
    params = [orgId, text(result.workdayId)]
    assignments = { updatedBy: 'updated_by' }
  }
  if (!query || !assignments) return result

  const current = (await client.query(query, params)).rows[0]
  for (const [variableName, columnName] of Object.entries(assignments)) {
    result[variableName] = current?.[columnName] ?? null
  }
  return result
}

module.exports = {
  ...cleanziAdminRepository,
  PLATFORM_TABLES,
  appendAudit,
  assertPlatformPrincipal,
  assertPlatformSchemaReady,
  closeAccessContext,
  getDataConnectOperationOptions,
  getActiveAccessContext,
  getPlatformAdmin,
  hasFreshPlatformAuthentication,
  inspectPlatformSchema,
  listAudit,
  listOrganizations,
  openAccessContext,
  preserveTenantMutationAuthors,
  publicError,
  resolvePlatformMembership,
  setOrganizationDeleted,
  transferOrganizationOwner,
  updateOrganization,
  updateSubscription,
}
