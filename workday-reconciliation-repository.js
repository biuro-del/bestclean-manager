'use strict'

const crypto = require('node:crypto')
const {
  MAX_SESSION_SECONDS,
  WorkdayReconciliationError,
  buildWorkdayReconciliation,
  normalizeReconciliationInput,
  reconciliationRequestHash,
  secondsBetween,
  warsawBusinessDateYmd,
} = require('./workday-reconciliation-policy')

function text(value, maxLength = 4000) {
  return String(value ?? '').trim().slice(0, maxLength)
}

function reconciliationError(statusCode, code, message, details) {
  return new WorkdayReconciliationError(statusCode, code, message, details)
}

function timestampMs(value) {
  const parsed = new Date(value || 0).getTime()
  return Number.isFinite(parsed) ? parsed : NaN
}

function sameTimestamp(left, right) {
  return timestampMs(left) === timestampMs(right)
}

function jsonParse(value, fallback = null) {
  try {
    return JSON.parse(String(value ?? ''))
  } catch {
    return fallback
  }
}

async function readReconciliationSchemaState(client) {
  const result = await client.query(
    `select
       exists (
         select 1
           from information_schema.columns
          where table_schema = 'public'
            and table_name = 'workday'
            and column_name = 'business_date_ymd'
            and data_type = 'character varying'
            and character_maximum_length = 10
            and is_nullable = 'YES'
       ) as business_date_column_ready,
       exists (
         select 1
           from pg_constraint constraint_meta
          where constraint_meta.conrelid = to_regclass('public.workday')
            and constraint_meta.conname = 'workday_business_date_ymd_check'
            and constraint_meta.contype = 'c'
            and constraint_meta.convalidated
            and pg_get_constraintdef(constraint_meta.oid, true) ilike '%business_date_ymd%is null%'
            and pg_get_constraintdef(constraint_meta.oid, true) like '%^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$%'
            and pg_get_constraintdef(constraint_meta.oid, true) ilike '%to_date%YYYY-MM-DD%'
       ) as business_date_constraint_ready,
       exists (
         select 1
           from pg_class table_meta
           join pg_namespace namespace
             on namespace.oid = table_meta.relnamespace
          where namespace.nspname = 'public'
            and table_meta.relname = 'workday_reconciliation_audit'
            and table_meta.relkind in ('r', 'p')
            and (
              select count(*)
                from pg_attribute column_meta
               where column_meta.attrelid = table_meta.oid
                 and column_meta.attnum > 0
                 and not column_meta.attisdropped
                 and column_meta.attnotnull
                 and column_meta.attname in (
                   'org_id', 'audit_id', 'workday_id', 'idempotency_key',
                   'request_hash', 'action', 'reason', 'actor_uid',
                   'before_snapshot', 'after_snapshot', 'response_snapshot', 'created_at'
                 )
            ) = 12
       ) as audit_ready,
       exists (
         select 1
           from pg_class index_class
           join pg_namespace namespace
             on namespace.oid = index_class.relnamespace
           join pg_index index_meta
             on index_meta.indexrelid = index_class.oid
          where namespace.nspname = 'public'
            and index_class.relname = 'workday_reconciliation_audit_idempotency_idx'
            and index_meta.indrelid = to_regclass('public.workday_reconciliation_audit')
            and index_meta.indisunique
            and index_meta.indisvalid
            and index_meta.indisready
            and index_meta.indpred is null
            and index_meta.indexprs is null
            and index_meta.indnkeyatts = 2
            and index_meta.indnatts = 2
            and pg_get_indexdef(index_meta.indexrelid, 1, true) = 'org_id'
            and pg_get_indexdef(index_meta.indexrelid, 2, true) = 'idempotency_key'
       ) as idempotency_ready,
       exists (
         select 1
           from pg_constraint constraint_meta
           join pg_index index_meta
             on index_meta.indexrelid = constraint_meta.conindid
          where constraint_meta.conrelid = to_regclass('public.workday_reconciliation_audit')
            and constraint_meta.contype = 'p'
            and constraint_meta.convalidated
            and index_meta.indisprimary
            and index_meta.indisvalid
            and index_meta.indisready
            and index_meta.indnkeyatts = 2
            and index_meta.indnatts = 2
            and pg_get_indexdef(constraint_meta.conindid, 1, true) = 'org_id'
            and pg_get_indexdef(constraint_meta.conindid, 2, true) = 'audit_id'
       ) as audit_primary_key_ready,
       exists (
         select 1
           from pg_trigger
          where tgrelid = to_regclass('public.workday')
            and tgname = 'workday_business_date_sync'
            and tgfoid = to_regprocedure('public.set_workday_business_date()')
            and tgtype = 23
            and not tgisinternal
            and tgenabled in ('O', 'A')
            and pg_get_triggerdef(oid, true) ilike '%before insert or update of start_at, business_date_ymd%'
       ) as business_date_trigger_ready,
       exists (
         select 1
           from pg_trigger
          where tgrelid = to_regclass('public.workday_reconciliation_audit')
            and tgname = 'workday_reconciliation_audit_reject_update'
            and tgfoid = to_regprocedure('public.reject_workday_reconciliation_audit_mutation()')
            and tgtype = 19
            and not tgisinternal
            and tgenabled in ('O', 'A')
       ) as audit_update_guard_ready,
       exists (
         select 1
           from pg_trigger
          where tgrelid = to_regclass('public.workday_reconciliation_audit')
            and tgname = 'workday_reconciliation_audit_reject_delete'
            and tgfoid = to_regprocedure('public.reject_workday_reconciliation_audit_mutation()')
            and tgtype = 11
            and not tgisinternal
            and tgenabled in ('O', 'A')
       ) as audit_delete_guard_ready,
       exists (
         select 1
           from pg_trigger
          where tgrelid = to_regclass('public.workday_reconciliation_audit')
            and tgname = 'workday_reconciliation_audit_reject_truncate'
            and tgfoid = to_regprocedure('public.reject_workday_reconciliation_audit_mutation()')
            and tgtype = 34
            and not tgisinternal
            and tgenabled in ('O', 'A')
       ) as audit_truncate_guard_ready,
       (
         select count(*) = 3
           from pg_constraint constraint_meta
          where constraint_meta.conrelid = to_regclass('public.workday_reconciliation_audit')
            and constraint_meta.contype = 'c'
            and constraint_meta.convalidated
            and (
              (
                constraint_meta.conname = 'workday_reconciliation_audit_request_hash_check'
                and pg_get_constraintdef(constraint_meta.oid, true) ilike '%request_hash%'
                and pg_get_constraintdef(constraint_meta.oid, true) like '%^[0-9a-f]{64}$%'
              )
              or (
                constraint_meta.conname = 'workday_reconciliation_audit_action_check'
                and pg_get_constraintdef(constraint_meta.oid, true) ilike '%action%'
                and pg_get_constraintdef(constraint_meta.oid, true) like '%CORRECT%'
                and pg_get_constraintdef(constraint_meta.oid, true) like '%FINALIZE%'
              )
              or (
                constraint_meta.conname = 'workday_reconciliation_audit_reason_check'
                and pg_get_constraintdef(constraint_meta.oid, true) ilike '%length%btrim%reason%'
                and pg_get_constraintdef(constraint_meta.oid, true) like '%3%'
                and pg_get_constraintdef(constraint_meta.oid, true) like '%1000%'
              )
            )
       ) as audit_constraints_ready`,
  )
  const row = result.rows?.[0] || {}
  const businessDateColumnReady = row.business_date_column_ready === true
  const businessDateConstraintReady = row.business_date_constraint_ready === true
  return {
    businessDateColumnReady,
    businessDateConstraintReady,
    businessDateReady: businessDateColumnReady && businessDateConstraintReady,
    auditReady: row.audit_ready === true,
    idempotencyReady: row.idempotency_ready === true,
    auditPrimaryKeyReady: row.audit_primary_key_ready === true,
    businessDateTriggerReady: row.business_date_trigger_ready === true,
    auditUpdateGuardReady: row.audit_update_guard_ready === true,
    auditDeleteGuardReady: row.audit_delete_guard_ready === true,
    auditTruncateGuardReady: row.audit_truncate_guard_ready === true,
    auditConstraintsReady: row.audit_constraints_ready === true,
  }
}

function isWriteSchemaReady(schemaState) {
  return Boolean(
    schemaState?.businessDateReady &&
    schemaState?.auditReady &&
    schemaState?.idempotencyReady &&
    schemaState?.auditPrimaryKeyReady &&
    schemaState?.businessDateTriggerReady &&
    schemaState?.auditUpdateGuardReady &&
    schemaState?.auditDeleteGuardReady &&
    schemaState?.auditTruncateGuardReady &&
    schemaState?.auditConstraintsReady
  )
}

function assertWriteSchemaReady(schemaState) {
  if (isWriteSchemaReady(schemaState)) return
  throw reconciliationError(
    503,
    'WORKDAY_RECONCILIATION_SCHEMA_MISSING',
    'Schemat bezpiecznej korekty czasu pracy nie zostal jeszcze aktywowany. Uruchom zatwierdzona migracje przed zapisem.',
    {
      businessDateColumnReady: Boolean(schemaState?.businessDateColumnReady),
      businessDateConstraintReady: Boolean(schemaState?.businessDateConstraintReady),
      businessDateReady: Boolean(schemaState?.businessDateReady),
      auditReady: Boolean(schemaState?.auditReady),
      idempotencyReady: Boolean(schemaState?.idempotencyReady),
      auditPrimaryKeyReady: Boolean(schemaState?.auditPrimaryKeyReady),
      businessDateTriggerReady: Boolean(schemaState?.businessDateTriggerReady),
      auditUpdateGuardReady: Boolean(schemaState?.auditUpdateGuardReady),
      auditDeleteGuardReady: Boolean(schemaState?.auditDeleteGuardReady),
      auditTruncateGuardReady: Boolean(schemaState?.auditTruncateGuardReady),
      auditConstraintsReady: Boolean(schemaState?.auditConstraintsReady),
    },
  )
}

function workdaySelectSql({ forUpdate = false, businessDateReady = false } = {}) {
  return `select w.org_id,
                 w.workday_id,
                 w.worker_login,
                 w.worker_name,
                 w.start_at,
                 w.end_at,
                 w.duration_sec,
                 w.status,
                 w.comment,
                 coalesce(w.updated_at, w.created_at) as updated_at,
                 w.updated_by,
                 ${businessDateReady ? 'w.business_date_ymd' : 'null::varchar(10) as business_date_ymd'},
                 worker.auth_uid as worker_auth_uid
            from public.workday w
            left join public.worker worker
              on worker.org_id = w.org_id
             and worker.login = w.worker_login
           where w.org_id = $1::text
             and w.workday_id = $2::text
           limit 1${forUpdate ? '\n           for update of w' : ''}`
}

async function readWorkday(client, orgId, workdayId, schemaState, { forUpdate = false } = {}) {
  const result = await client.query(
    workdaySelectSql({ forUpdate, businessDateReady: schemaState.businessDateReady }),
    [orgId, workdayId],
  )
  const row = result.rows?.[0]
  if (!row) {
    throw reconciliationError(404, 'WORKDAY_NOT_FOUND', 'Nie znaleziono dnia pracy w tej organizacji.')
  }
  return row
}

function businessDateSqlExpression({ alias = 'w', businessDateReady = false } = {}) {
  const derivedFromStart = `to_char(${alias}.start_at at time zone 'Europe/Warsaw', 'YYYY-MM-DD')`
  return businessDateReady
    ? `coalesce(nullif(btrim(${alias}.business_date_ymd), ''), ${derivedFromStart})`
    : derivedFromStart
}

async function readBusinessDateWorkdayIds(
  client,
  orgId,
  workerLogin,
  businessDateYmd,
  schemaState,
  { forUpdate = false } = {},
) {
  const normalizedWorkerLogin = text(workerLogin, 80)
  const normalizedBusinessDateYmd = text(businessDateYmd, 10)
  if (!normalizedWorkerLogin || !normalizedBusinessDateYmd) return []
  const result = await client.query(
    `select w.workday_id
       from public.workday w
      where w.org_id = $1::text
        and w.worker_login = $2::text
        and ${businessDateSqlExpression({ businessDateReady: schemaState.businessDateReady })} = $3::text
      order by w.workday_id asc${forUpdate ? '\n      for update of w' : ''}`,
    [orgId, normalizedWorkerLogin, normalizedBusinessDateYmd],
  )
  return [...new Set((result.rows || []).map((row) => text(row.workday_id, 64)).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
}

async function readSessions(client, orgId, workdayId, { forUpdate = false } = {}) {
  const result = await client.query(
    `select org_id,
            event_id,
            workday_id,
            worker_login,
            worker_name,
            zone_id,
            start_at,
            end_at,
            duration_sec,
            status,
            comment,
            end_reason,
            close_marked_at,
            updated_at
       from public.event
      where org_id = $1::text
        and workday_id = $2::text
      order by start_at asc nulls last, event_id asc${forUpdate ? '\n      for update' : ''}`,
    [orgId, workdayId],
  )
  return result.rows || []
}

async function readLatestCorrection(client, orgId, workdayId, schemaState) {
  if (!schemaState.auditReady) return null
  const result = await client.query(
    `select audit_id, actor_uid, reason, action, created_at
       from public.workday_reconciliation_audit
      where org_id = $1::text
        and workday_id = $2::text
      order by created_at desc, audit_id desc
      limit 1`,
    [orgId, workdayId],
  )
  return result.rows?.[0] || null
}

function assertTargetAccess(access, workday) {
  const scope = text(access?.scope, 16).toUpperCase()
  if (scope === 'ALL') return
  if (
    scope === 'OWN' &&
    text(access?.uid, 128) &&
    text(access.uid, 128) === text(workday?.worker_auth_uid, 128)
  ) return
  throw reconciliationError(
    403,
    'WORKDAY_RECONCILIATION_FORBIDDEN',
    'Brak uprawnien do przegladu lub korekty tego dnia pracy.',
  )
}

function correctedSessionRows(rows, corrections) {
  const byId = new Map(rows.map((row) => [text(row.event_id, 64), { ...row }]))
  for (const correction of corrections) {
    const row = byId.get(correction.eventId)
    if (!row) {
      throw reconciliationError(
        404,
        'WORKDAY_SESSION_NOT_FOUND',
        'Nie znaleziono sesji przypisanej do tego dnia pracy.',
        { eventId: correction.eventId },
      )
    }
    if (Object.prototype.hasOwnProperty.call(correction, 'startAt')) row.start_at = correction.startAt
    if (Object.prototype.hasOwnProperty.call(correction, 'endAt')) row.end_at = correction.endAt
    if (Object.prototype.hasOwnProperty.call(correction, 'comment')) row.comment = correction.comment
    if (Object.prototype.hasOwnProperty.call(correction, 'endReason')) row.end_reason = correction.endReason
    byId.set(correction.eventId, row)
  }
  return rows.map((row) => byId.get(text(row.event_id, 64)))
}

function invalidSessionIssues(reconciliation) {
  const nonBlocking = new Set([
    'CLOSED_WORKDAY_WITH_OPEN_SESSION',
    'OPEN_SESSION',
    'WORKDAY_DURATION_MISMATCH',
    'WORKDAY_NOT_CLOSED',
  ])
  return reconciliation.issues.filter((entry) => !nonBlocking.has(entry.code))
}

function maxSessionEndAt(rows) {
  let latest = null
  for (const row of rows) {
    const value = row.end_at ?? row.endAt
    const ms = timestampMs(value)
    if (Number.isFinite(ms) && (!latest || ms > latest.ms)) latest = { ms, value: new Date(ms).toISOString() }
  }
  return latest?.value || null
}

function validateWorkdayEnvelope(workday, endAt, now) {
  if (!endAt) return
  const startAt = workday.start_at ?? workday.startAt
  const startMs = timestampMs(startAt)
  const endMs = timestampMs(endAt)
  const nowMs = timestampMs(now)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw reconciliationError(
      400,
      'WORKDAY_END_BEFORE_START',
      'Koniec dnia musi byc pozniejszy niz poczatek dnia.',
    )
  }
  const durationSec = secondsBetween(startAt, endAt)
  if (durationSec > MAX_SESSION_SECONDS) {
    throw reconciliationError(
      400,
      'WORKDAY_ENVELOPE_EXCEEDED',
      'Dzien pracy nie moze przekraczac 24 godzin.',
      { durationSec },
    )
  }
  if (endMs > nowMs) {
    throw reconciliationError(
      400,
      'WORKDAY_FUTURE_TIMESTAMP',
      'Koniec dnia nie moze przypadać w przyszlosci.',
    )
  }
}

async function updateCorrectedSessions(client, orgId, workdayId, rows, corrections, now) {
  const rowById = new Map(rows.map((row) => [text(row.event_id, 64), row]))
  for (const correction of corrections) {
    const row = rowById.get(correction.eventId)
    const durationSec = secondsBetween(row.start_at, row.end_at)
    const closed = Boolean(row.end_at)
    const endReason = closed ? (text(row.end_reason, 500) || 'MANUAL_RECONCILIATION') : ''
    await client.query(
      `update public.event
          set start_at = $4::timestamptz,
              end_at = $5::timestamptz,
              duration_sec = $6::integer,
              status = $7::text,
              close_marked_at = $8::timestamptz,
              end_reason = nullif($9::text, ''),
              comment = $10::text,
              updated_at = $11::timestamptz
        where org_id = $1::text
          and workday_id = $2::text
          and event_id = $3::text`,
      [
        orgId,
        workdayId,
        correction.eventId,
        row.start_at,
        row.end_at,
        durationSec,
        closed ? 'CLOSED' : 'RUNNING',
        closed ? now : null,
        endReason,
        text(row.comment, 2000),
        now,
      ],
    )
    row.duration_sec = durationSec
    row.status = closed ? 'CLOSED' : 'RUNNING'
    row.close_marked_at = closed ? now : null
    row.end_reason = endReason || null
    row.updated_at = now
  }
}

async function updateReconciledWorkday(client, {
  actorUid,
  businessDateYmd,
  closedSessionsSec,
  endAt,
  finalize,
  hasOpenSessions,
  now,
  orgId,
  workday,
  workdayId,
}) {
  const currentClosed = text(workday.status, 40).toUpperCase() === 'CLOSED' || Boolean(workday.end_at)
  const nextStatus = finalize
    ? 'CLOSED'
    : hasOpenSessions
      ? 'RUNNING'
      : text(workday.status, 40) || (currentClosed ? 'CLOSED' : 'RUNNING')
  const nextEndAt = finalize
    ? endAt
    : hasOpenSessions
      ? null
      : endAt ?? workday.end_at ?? null
  const result = await client.query(
    `update public.workday
        set end_at = $3::timestamptz,
            duration_sec = $4::integer,
            status = $5::text,
            updated_at = $6::timestamptz,
            updated_by = $7::text,
            business_date_ymd = $8::text
      where org_id = $1::text
        and workday_id = $2::text
      returning org_id,
                workday_id,
                worker_login,
                worker_name,
                start_at,
                end_at,
                duration_sec,
                status,
                comment,
                updated_at,
                updated_by,
                business_date_ymd`,
    [orgId, workdayId, nextEndAt, closedSessionsSec, nextStatus, now, actorUid, businessDateYmd],
  )
  return {
    ...result.rows[0],
    worker_auth_uid: workday.worker_auth_uid,
  }
}

function auditId() {
  return `wra_${crypto.randomUUID()}`
}

async function insertAudit(client, {
  action,
  actorUid,
  after,
  auditId: id,
  before,
  idempotencyKey,
  now,
  orgId,
  reason,
  requestHash,
  workdayId,
}) {
  const serializedAfter = JSON.stringify(after)
  await client.query(
    `insert into public.workday_reconciliation_audit (
       org_id, audit_id, workday_id, idempotency_key, request_hash,
       action, reason, actor_uid, before_snapshot, after_snapshot,
       response_snapshot, created_at
     ) values (
       $1::text, $2::text, $3::text, $4::text, $5::text,
       $6::text, $7::text, $8::text, $9::text, $10::text,
       $10::text, $11::timestamptz
     )`,
    [
      orgId,
      id,
      workdayId,
      idempotencyKey,
      requestHash,
      action,
      reason,
      actorUid,
      JSON.stringify(before),
      serializedAfter,
      now,
    ],
  )
}

function createWorkdayReconciliationRepository(client, dependencies = {}) {
  const authorize = dependencies.authorize
  const nowProvider = typeof dependencies.now === 'function' ? dependencies.now : () => new Date()
  if (!client || typeof client.query !== 'function' || typeof authorize !== 'function') {
    throw new TypeError('Workday reconciliation repository dependencies are incomplete.')
  }

  async function read({ orgId, uid, workdayId }) {
    const schemaState = await readReconciliationSchemaState(client)
    const access = await authorize(client, { orgId, uid, write: false })
    const workday = await readWorkday(client, orgId, workdayId, schemaState)
    assertTargetAccess(access, workday)
    const businessDateYmd = text(workday.business_date_ymd, 10) || warsawBusinessDateYmd(workday.start_at)
    const [sessions, latestCorrection, businessDateWorkdayIds] = await Promise.all([
      readSessions(client, orgId, workdayId),
      readLatestCorrection(client, orgId, workdayId, schemaState),
      readBusinessDateWorkdayIds(
        client,
        orgId,
        workday.worker_login,
        businessDateYmd,
        schemaState,
      ),
    ])
    return buildWorkdayReconciliation({
      workday,
      sessions,
      businessDateWorkdayIds,
      latestCorrection,
      now: nowProvider(),
      schemaReady: isWriteSchemaReady(schemaState),
    })
  }

  async function reconcile({ orgId, uid, workdayId, value }) {
    const input = normalizeReconciliationInput(value)
    const requestHash = reconciliationRequestHash({ orgId, workdayId, input })
    let transactionStarted = false
    try {
      await client.query('begin')
      transactionStarted = true
      const schemaState = await readReconciliationSchemaState(client)
      const access = await authorize(client, { orgId, uid, write: true })
      assertWriteSchemaReady(schemaState)

      await client.query(
        'select pg_advisory_xact_lock(hashtextextended($1::text, 0))',
        [`workday-reconciliation:${orgId}:${input.idempotencyKey}`],
      )
      // Reconciliation may move a Workday to another business date. Serialize
      // those checks per organization before taking row locks, so two repairs
      // cannot both conclude that the same worker/date target is unique.
      await client.query(
        'select pg_advisory_xact_lock(hashtextextended($1::text, 0))',
        [`workday-business-date:${orgId}`],
      )
      const workday = await readWorkday(client, orgId, workdayId, schemaState, { forUpdate: true })
      assertTargetAccess(access, workday)
      const existingAudit = await client.query(
        `select request_hash, response_snapshot
           from public.workday_reconciliation_audit
          where org_id = $1::text
            and idempotency_key = $2::text
          limit 1
          for update`,
        [orgId, input.idempotencyKey],
      )
      if (existingAudit.rows?.[0]) {
        if (text(existingAudit.rows[0].request_hash, 64) !== requestHash) {
          throw reconciliationError(
            409,
            'WORKDAY_IDEMPOTENCY_KEY_REUSED',
            'Ten idempotencyKey zostal juz uzyty dla innej korekty.',
          )
        }
        const replay = jsonParse(existingAudit.rows[0].response_snapshot)
        if (!replay) {
          throw reconciliationError(
            500,
            'WORKDAY_RECONCILIATION_AUDIT_INVALID',
            'Nie mozna odczytac wyniku poprzedniej korekty.',
          )
        }
        await client.query('commit')
        transactionStarted = false
        return replay
      }

      const sessions = await readSessions(client, orgId, workdayId, { forUpdate: true })
      const now = nowProvider()
      const currentBusinessDateYmd = text(workday.business_date_ymd, 10) || warsawBusinessDateYmd(workday.start_at)
      const currentBusinessDateWorkdayIds = await readBusinessDateWorkdayIds(
        client,
        orgId,
        workday.worker_login,
        currentBusinessDateYmd,
        schemaState,
        { forUpdate: true },
      )
      const before = buildWorkdayReconciliation({
        workday,
        sessions,
        businessDateWorkdayIds: currentBusinessDateWorkdayIds,
        now,
        schemaReady: true,
      })
      if (
        !sameTimestamp(before.version, input.expectedUpdatedAt) ||
        before.sessionVersion !== input.expectedSessionVersion
      ) {
        throw reconciliationError(
          409,
          'WORKDAY_VERSION_CONFLICT',
          'Dzien pracy zostal w miedzyczasie zmieniony. Odswiez dane i ponow korekte.',
          {
            expectedUpdatedAt: input.expectedUpdatedAt,
            actualUpdatedAt: before.version,
            expectedSessionVersion: input.expectedSessionVersion,
            actualSessionVersion: before.sessionVersion,
          },
        )
      }

      const correctedRows = correctedSessionRows(sessions, input.sessionCorrections)
      const businessDateYmd = input.businessDateYmd || currentBusinessDateYmd
      const targetStoredWorkdayIds = businessDateYmd === currentBusinessDateYmd
        ? currentBusinessDateWorkdayIds
        : await readBusinessDateWorkdayIds(
            client,
            orgId,
            workday.worker_login,
            businessDateYmd,
            schemaState,
            { forUpdate: true },
          )
      const targetBusinessDateWorkdayIds = [...new Set([
        ...targetStoredWorkdayIds,
        workdayId,
      ].map((value) => text(value, 64)).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right))
      const requestedEndAt = input.workdayEndAt || (input.finalize ? maxSessionEndAt(correctedRows) : undefined)
      if (requestedEndAt) {
        validateWorkdayEnvelope(workday, requestedEndAt, now)
        const latestSessionEndAt = maxSessionEndAt(correctedRows)
        if (latestSessionEndAt && timestampMs(requestedEndAt) < timestampMs(latestSessionEndAt)) {
          throw reconciliationError(
            409,
            'WORKDAY_SESSION_OUTSIDE_ENVELOPE',
            'Koniec dnia nie moze byc wczesniejszy niz STOP ostatniej sesji.',
            { requestedEndAt, latestSessionEndAt },
          )
        }
      }
      const provisionalWorkday = {
        ...workday,
        business_date_ymd: businessDateYmd,
        ...(requestedEndAt ? { end_at: requestedEndAt } : {}),
      }
      const corrected = buildWorkdayReconciliation({
        workday: provisionalWorkday,
        sessions: correctedRows,
        businessDateWorkdayIds: targetBusinessDateWorkdayIds,
        now,
        schemaReady: true,
      })
      const invalidIssues = invalidSessionIssues(corrected)
      if (invalidIssues.length) {
        throw reconciliationError(
          409,
          'WORKDAY_INVALID_SESSIONS',
          'Sesje zawieraja bledne, nakladajace sie albo niespojne przedzialy czasu.',
          { issues: invalidIssues },
        )
      }
      if (input.finalize && corrected.openSessions.length) {
        throw reconciliationError(
          409,
          'WORKDAY_OPEN_SESSIONS',
          'Nie mozna zamknac dnia, dopoki kazda sesja nie ma STOP.',
          { eventIds: corrected.openSessions.map((entry) => entry.eventId) },
        )
      }
      if (input.finalize && !corrected.canFinalize) {
        throw reconciliationError(
          409,
          'WORKDAY_CANNOT_FINALIZE',
          'Dzien nie jest gotowy do zamkniecia.',
          { issues: corrected.issues },
        )
      }

      await updateCorrectedSessions(client, orgId, workdayId, correctedRows, input.sessionCorrections, now)
      const updatedWorkday = await updateReconciledWorkday(client, {
        actorUid: uid,
        businessDateYmd,
        closedSessionsSec: corrected.closedSessionsSec,
        endAt: requestedEndAt,
        finalize: input.finalize,
        hasOpenSessions: corrected.openSessions.length > 0,
        now,
        orgId,
        workday,
        workdayId,
      })
      const id = auditId()
      const correctionMetadata = {
        audit_id: id,
        actor_uid: uid,
        reason: input.reason,
        action: input.finalize ? 'FINALIZE' : 'CORRECT',
        created_at: now,
      }
      const after = buildWorkdayReconciliation({
        workday: updatedWorkday,
        sessions: correctedRows,
        businessDateWorkdayIds: targetBusinessDateWorkdayIds,
        latestCorrection: correctionMetadata,
        now,
        schemaReady: true,
      })
      await insertAudit(client, {
        action: correctionMetadata.action,
        actorUid: uid,
        after,
        auditId: id,
        before,
        idempotencyKey: input.idempotencyKey,
        now,
        orgId,
        reason: input.reason,
        requestHash,
        workdayId,
      })
      await client.query('commit')
      transactionStarted = false
      return after
    } catch (error) {
      if (transactionStarted) await client.query('rollback').catch(() => {})
      throw error
    }
  }

  return { read, reconcile }
}

module.exports = {
  assertTargetAccess,
  assertWriteSchemaReady,
  correctedSessionRows,
  createWorkdayReconciliationRepository,
  invalidSessionIssues,
  readReconciliationSchemaState,
  validateWorkdayEnvelope,
}
