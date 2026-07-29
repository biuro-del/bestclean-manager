'use strict'

const {
  buildWorkerId,
  nextWorkerNumber,
  normalizeWorkerNumber,
  parseWorkerNumber,
} = require('./worker-id-policy')
const { resolvePlatformMembership } = require('./platform-repository')

const REQUIRED_WORKER_SCHEMA = {
  organizations: {
    org_id: null,
    owner_worker_id: 128,
  },
  worker: {
    org_id: null,
    login: 80,
    login_normalized: 80,
    worker_id: 128,
    worker_id_normalized: 128,
    full_name: null,
    login_email: null,
    auth_uid: 128,
    role: null,
    active: null,
    email: null,
    phone: null,
    worker_type: null,
    created_at: null,
    updated_at: null,
    edit: null,
  },
  organization_member: {
    org_id: null,
    uid: 128,
    role: null,
    worker_id: 128,
    status: null,
    created_at: null,
  },
  worker_id_reservation: {
    org_id: null,
    worker_number: null,
    worker_id: 128,
    created_at: null,
    created_by_uid: 128,
  },
}

const REQUIRED_WORKER_INDEXES = [
  'worker_org_login_normalized_uidx',
  'worker_org_worker_id_normalized_uidx',
]

const OPTIONAL_WORKER_RELATIONS = [
  'public.workday_pause',
  'public.event',
  'public.checklist_log',
  'public.backup_cycle',
  'public.task',
  'public.workday',
]

const WORKER_SCHEMA_READY_CACHE_MS = 5 * 60 * 1000
let workerSchemaReadyCache = {
  expiresAt: 0,
  promise: null,
  value: null,
}

function text(value) {
  return String(value ?? '').trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function nullableText(value, maxLength = 0) {
  const normalized = text(value)
  if (!normalized) return null
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized
}

function asBoolean(value, defaultValue = true) {
  if (value === undefined || value === null || value === '') return defaultValue
  if (typeof value === 'boolean') return value
  return !['0', 'false', 'no', 'nie', 'off'].includes(lower(value))
}

function publicError(statusCode, publicCode, publicMessage, details = undefined) {
  const error = new Error(publicCode)
  error.statusCode = statusCode
  error.publicCode = publicCode
  error.publicMessage = publicMessage
  if (details !== undefined) error.details = details
  return error
}

async function runQuery(client, label, queryText, params = []) {
  try {
    return await client.query(queryText, params)
  } catch (error) {
    error.workerProfileQueryLabel = text(label)
    throw error
  }
}

async function inspectWorkerSchema(client) {
  const tableNames = Object.keys(REQUIRED_WORKER_SCHEMA)
  const relations = await client.query(
    `select relation_name,
            to_regclass('public.' || relation_name) is not null as exists
       from unnest($1::text[]) as relations(relation_name)`,
    [tableNames],
  )
  const relationState = new Map(
    relations.rows.map((row) => [text(row.relation_name), Boolean(row.exists)]),
  )

  const columns = await client.query(
    `select table_name,
            column_name,
            character_maximum_length
       from information_schema.columns
      where table_schema = 'public'
        and table_name = any($1::text[])`,
    [tableNames],
  )
  const columnState = new Map()
  for (const row of columns.rows) {
    columnState.set(
      `${text(row.table_name)}.${text(row.column_name)}`,
      row.character_maximum_length === null ? null : Number(row.character_maximum_length),
    )
  }

  const indexes = await client.query(
    `select indexname
       from pg_indexes
      where schemaname = 'public'
        and indexname = any($1::text[])`,
    [REQUIRED_WORKER_INDEXES],
  )
  const existingIndexes = new Set(indexes.rows.map((row) => text(row.indexname)))
  const missing = []

  for (const [tableName, requiredColumns] of Object.entries(REQUIRED_WORKER_SCHEMA)) {
    if (!relationState.get(tableName)) {
      missing.push(`table:public.${tableName}`)
      continue
    }
    for (const [columnName, minimumLength] of Object.entries(requiredColumns)) {
      const key = `${tableName}.${columnName}`
      if (!columnState.has(key)) {
        missing.push(`column:public.${key}`)
        continue
      }
      if (minimumLength && Number(columnState.get(key) ?? 0) < minimumLength) {
        missing.push(`length:public.${key}<${minimumLength}`)
      }
    }
  }

  for (const indexName of REQUIRED_WORKER_INDEXES) {
    if (!existingIndexes.has(indexName)) {
      missing.push(`index:public.${indexName}`)
    }
  }

  return {
    ready: missing.length === 0,
    missing,
  }
}

async function assertWorkerSchemaReady(client) {
  const now = Date.now()
  if (workerSchemaReadyCache.value?.ready && workerSchemaReadyCache.expiresAt > now) {
    return workerSchemaReadyCache.value
  }
  if (workerSchemaReadyCache.promise) {
    return workerSchemaReadyCache.promise
  }

  const inspectionPromise = inspectWorkerSchema(client).then((readiness) => {
    if (!readiness.ready) {
      throw publicError(
        503,
        'WORKER_SCHEMA_NOT_READY',
        'Schemat bazy dla pracownikow nie jest gotowy. Uruchom migracje modelu pracownikow.',
        readiness,
      )
    }
    workerSchemaReadyCache.value = readiness
    workerSchemaReadyCache.expiresAt = Date.now() + WORKER_SCHEMA_READY_CACHE_MS
    return readiness
  })

  workerSchemaReadyCache.promise = inspectionPromise
  try {
    return await inspectionPromise
  } finally {
    if (workerSchemaReadyCache.promise === inspectionPromise) {
      workerSchemaReadyCache.promise = null
    }
  }
}

function clearWorkerSchemaReadyCache() {
  workerSchemaReadyCache = {
    expiresAt: 0,
    promise: null,
    value: null,
  }
}

async function readExistingRelations(client, relationNames = OPTIONAL_WORKER_RELATIONS) {
  const result = await client.query(
    `select relation_name,
            to_regclass(relation_name) is not null as exists
       from unnest($1::text[]) as relations(relation_name)`,
    [relationNames],
  )
  return new Set(
    result.rows
      .filter((row) => row.exists)
      .map((row) => text(row.relation_name)),
  )
}

async function getRequesterMembership(client, orgId, uid) {
  const platformMembership = await resolvePlatformMembership(client, orgId, uid)
  if (platformMembership) return platformMembership
  const result = await runQuery(
    client,
    'requester-membership',
    `select case
              when nullif(o.owner_worker_id, '') is not null
               and o.owner_worker_id = m.worker_id then 'OWNER'
              else m.role
            end as role,
            m.status
       from public.organization_member m
       join public.organizations o on o.org_id = m.org_id
      where m.org_id = $1::text
        and m.uid = $2::text
        and m.status = 'ACTIVE'
      limit 1`,
    [orgId, uid],
  )
  return result.rows[0] ?? null
}

async function getOrganizationOwnerWorkerId(client, orgId) {
  const result = await runQuery(
    client,
    'organization-owner-worker-id',
    `select owner_worker_id
       from public.organizations
      where org_id = $1::text
      limit 1`,
    [orgId],
  )
  return text(result.rows[0]?.owner_worker_id)
}

async function findExistingWorker(client, orgId, login, email) {
  const result = await runQuery(
    client,
    'find-existing-worker',
    `select login, login_email, email, worker_id, auth_uid
       from public.worker
      where org_id = $1::text
        and (
          lower(login) = lower($2::text)
          or (
            nullif($3::text, '') is not null
            and (
              lower(coalesce(login_email, '')) = lower($3::text)
              or lower(coalesce(email, '')) = lower($3::text)
            )
          )
        )
      limit 1`,
    [orgId, login, email],
  )
  return result.rows[0] ?? null
}

async function readWorkerForUpdate(client, orgId, login) {
  const result = await runQuery(
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
            created_at,
            updated_at,
            edit,
            (select o.owner_worker_id
               from public.organizations o
              where o.org_id = w.org_id
              limit 1) as owner_worker_id
       from public.worker w
      where w.org_id = $1::text
        and lower(w.login) = lower($2::text)
      limit 1`,
    [orgId, login],
  )
  return result.rows[0] ?? null
}

async function readWorkerForPasswordReset(client, orgId, identifier) {
  const result = await runQuery(
    client,
    'read-worker-for-password-reset',
    `select login,
            worker_id,
            full_name,
            login_email,
            email,
            auth_uid,
            active
       from public.worker
      where org_id = $1::text
        and (
          lower(login) = lower($2::text)
          or lower(coalesce(worker_id, '')) = lower($2::text)
          or lower(coalesce(login_email, '')) = lower($2::text)
          or lower(coalesce(email, '')) = lower($2::text)
          or lower(coalesce(auth_uid, '')) = lower($2::text)
        )
      limit 1`,
    [orgId, identifier],
  )
  return result.rows[0] ?? null
}

async function readWorkerIdRows(client, orgId) {
  const [reservations, workers] = await Promise.all([
    runQuery(
      client,
      'worker-id-reservations',
      `select worker_number, worker_id
         from public.worker_id_reservation
        where org_id = $1::text
        order by worker_number asc`,
      [orgId],
    ),
    runQuery(
      client,
      'worker-id-source',
      'select worker_id from public.worker where org_id = $1::text',
      [orgId],
    ),
  ])
  return {
    reservations: reservations.rows,
    workers: workers.rows,
  }
}

function isWorkerNumberUsed(orgId, workerNumber, reservations, workers) {
  return (
    reservations.some(
      (row) => normalizeWorkerNumber(row.worker_number ?? row.workerNumber, { optional: true }) === workerNumber,
    ) ||
    workers.some(
      (row) => parseWorkerNumber(orgId, row.worker_id ?? row.workerId) === workerNumber,
    )
  )
}

async function reserveWorkerId(client, orgId, workerNumberOverride, createdByUid) {
  await client.query('select pg_advisory_xact_lock(hashtext($1::text))', [`worker-id:${orgId}`])
  const { reservations, workers } = await readWorkerIdRows(client, orgId)
  const workerNumber = workerNumberOverride ?? nextWorkerNumber(orgId, reservations, workers)

  if (
    workerNumberOverride !== null &&
    isWorkerNumberUsed(orgId, workerNumber, reservations, workers)
  ) {
    throw publicError(
      409,
      'WORKER_NUMBER_ALREADY_RESERVED',
      `Numer ID pracownika ${workerNumber} jest juz zarezerwowany w tej organizacji.`,
    )
  }

  const workerId = buildWorkerId(orgId, workerNumber)
  try {
    await runQuery(
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
      [orgId, workerNumber, workerId, text(createdByUid)],
    )
  } catch (error) {
    if (text(error.code) === '23505') {
      throw publicError(
        409,
        'WORKER_NUMBER_ALREADY_RESERVED',
        `Numer ID pracownika ${workerNumber} jest juz zarezerwowany w tej organizacji.`,
      )
    }
    throw error
  }

  return { workerId, workerNumber }
}

async function insertWorkerAndMembership(client, payload) {
  await runQuery(
    client,
    'create-worker-organization-member',
    `insert into public.organization_member (org_id, uid, role, worker_id, status, created_at)
     values ($1::text, $2::text, $3::text, $4::text, 'ACTIVE', now())
     on conflict (org_id, uid) do update
       set role = excluded.role,
           worker_id = excluded.worker_id,
           status = 'ACTIVE'`,
    [payload.orgId, payload.authUid, payload.role, payload.workerId],
  )

  const result = await runQuery(
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
       nullif($8::text, ''),
       $9::text,
       $10::text,
       nullif($11::text, ''),
       now(),
       now()
     )
     returning *`,
    [
      payload.orgId,
      payload.login,
      payload.workerId,
      payload.displayName,
      payload.email,
      payload.role,
      payload.active,
      payload.phone,
      payload.workerType,
      payload.authUid,
      payload.createdByUid,
    ],
  )
  return result.rows[0] ?? null
}

async function assertLoginAvailable(client, orgId, oldLogin, newLogin) {
  if (lower(oldLogin) === lower(newLogin)) return
  const result = await runQuery(
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
  if (result.rows.length) {
    throw publicError(409, 'WORKER_LOGIN_ALREADY_EXISTS', 'Ten login jest juz zajety w tej organizacji.')
  }
}

async function assertEmailAvailable(client, orgId, oldLogin, email) {
  const normalizedEmail = lower(email)
  if (!normalizedEmail) return
  const result = await runQuery(
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
  if (result.rows.length) {
    throw publicError(409, 'WORKER_EMAIL_ALREADY_EXISTS', 'Ten email jest juz przypisany do innego pracownika.')
  }
}

async function upsertWorkerMembership(client, payload) {
  if (!text(payload.authUid)) return 0
  const result = await runQuery(
    client,
    'upsert-worker-organization-member',
    `insert into public.organization_member (org_id, uid, role, worker_id, status, created_at)
     values ($1::text, $2::text, $3::text, $4::text, 'ACTIVE', now())
     on conflict (org_id, uid) do update
       set role = excluded.role,
           worker_id = excluded.worker_id,
           status = 'ACTIVE'`,
    [payload.orgId, payload.authUid, payload.role, payload.workerId],
  )
  return result.rowCount
}

async function updateWorkerRow(client, payload) {
  const result = await runQuery(
    client,
    'update-worker-profile-row',
    `update public.worker
        set full_name = $3::text,
            login_email = $4::text,
            email = $4::text,
            phone = nullif($5::text, ''),
            role = $6::text,
            worker_type = $7::text,
            active = $8::boolean,
            edit = nullif($9::text, ''),
            auth_uid = coalesce(nullif($10::text, ''), auth_uid),
            updated_at = now()
      where org_id = $1::text
        and lower(login) = lower($2::text)
      returning *`,
    [
      payload.orgId,
      payload.login,
      payload.name,
      payload.email,
      payload.phone,
      payload.role,
      payload.workerType,
      payload.active,
      payload.updatedBy,
      payload.authUid,
    ],
  )
  return result.rows[0] ?? null
}

function replaceLoginTokens(value, oldLogin, newLogin) {
  const wanted = lower(oldLogin)
  if (!wanted) return String(value ?? '')
  return String(value ?? '').replace(/[a-z0-9._%+-]+/gi, (token) => (
    lower(token) === wanted ? newLogin : token
  ))
}

async function updateTaskWorkerIdTokens(client, orgId, oldLogin, newLogin) {
  const rows = await runQuery(
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
  let updated = 0
  for (const row of rows.rows) {
    const nextValue = replaceLoginTokens(row.worker_ids, oldLogin, newLogin)
    if (nextValue === String(row.worker_ids ?? '')) continue
    const result = await runQuery(
      client,
      'rename-task-worker-token-update',
      'update public.task set worker_ids = $3::text where org_id = $1::text and id_task::text = $2::text',
      [orgId, row.id_task, nextValue],
    )
    updated += result.rowCount
  }
  return updated
}

async function renameWorker(client, currentWorker, payload) {
  const oldLogin = payload.login
  const newLogin = payload.newLogin
  const workerId = text(currentWorker.worker_id)
  const relations = await readExistingRelations(client)

  const inserted = await runQuery(
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
      payload.email,
      payload.phone,
      payload.role,
      payload.workerType,
      payload.active,
      payload.updatedBy,
    ],
  )
  if (!inserted.rowCount) {
    throw publicError(404, 'WORKER_NOT_FOUND', 'Nie znaleziono pracownika do edycji.')
  }

  const counts = {}
  const common = [payload.orgId, oldLogin, newLogin, payload.name]
  const updateRelation = async (
    relationName,
    label,
    queryText,
    params = common,
  ) => {
    if (!relations.has(relationName)) {
      counts[label] = 0
      return
    }
    counts[label] = (
      await runQuery(client, `rename-worker-${label}`, queryText, params)
    ).rowCount
  }

  await updateRelation(
    'public.workday_pause',
    'workday_pause',
    `update public.workday_pause
        set worker_login = $3::text,
            worker_name = coalesce(nullif($4::text, ''), worker_name)
      where org_id = $1::text
        and lower(coalesce(worker_login, '')) = lower($2::text)`,
  )
  await updateRelation(
    'public.event',
    'event',
    `update public.event
        set worker_login = $3::text,
            worker_name = coalesce(nullif($4::text, ''), worker_name)
      where org_id = $1::text
        and lower(coalesce(worker_login, '')) = lower($2::text)`,
  )
  await updateRelation(
    'public.workday',
    'workday',
    `update public.workday
        set worker_login = $3::text,
            worker_name = coalesce(nullif($4::text, ''), worker_name),
            updated_at = now()
      where org_id = $1::text
        and lower(coalesce(worker_login, '')) = lower($2::text)`,
  )
  await updateRelation(
    'public.backup_cycle',
    'backup_cycle',
    `update public.backup_cycle
        set worker_login = $3::text,
            worker_name = coalesce(nullif($4::text, ''), worker_name)
      where org_id = $1::text
        and lower(coalesce(worker_login, '')) = lower($2::text)`,
  )
  await updateRelation(
    'public.checklist_log',
    'checklist_log',
    `update public.checklist_log
        set "worker" = $3::text
      where org_id = $1::text
        and lower(coalesce("worker", '')) = lower($2::text)`,
    common.slice(0, 3),
  )

  if (relations.has('public.task')) {
    counts.task_login = (
      await runQuery(
        client,
        'rename-worker-task-login',
        `update public.task
            set worker_login = $3::text,
                worker_name = $4::text,
                worker_label = $4::text,
                updated_at = now()
          where org_id = $1::text
            and lower(coalesce(worker_login, '')) = lower($2::text)`,
        [payload.orgId, oldLogin, newLogin, payload.name],
      )
    ).rowCount
    counts.task_worker_ids = await updateTaskWorkerIdTokens(client, payload.orgId, oldLogin, newLogin)
  } else {
    counts.task_login = 0
    counts.task_worker_ids = 0
  }

  await runQuery(
    client,
    'rename-worker-delete-old-row',
    'delete from public.worker where org_id = $1::text and lower(login) = lower($2::text)',
    [payload.orgId, oldLogin],
  )

  const finalized = await runQuery(
    client,
    'rename-worker-finalize-new-row',
    `update public.worker
        set worker_id = $3::text,
            auth_uid = nullif($4::text, ''),
            updated_at = now()
      where org_id = $1::text
        and lower(login) = lower($2::text)
      returning *`,
    [payload.orgId, newLogin, workerId, payload.authUid],
  )

  await upsertWorkerMembership(client, {
    orgId: payload.orgId,
    authUid: payload.authUid,
    role: payload.role,
    workerId,
  })

  return {
    row: finalized.rows[0] ?? null,
    dependentUpdates: counts,
  }
}

async function deleteWorkerAccessRows(client, orgId, login, workerId, authUid) {
  const deleted = {}
  const relations = await readExistingRelations(client)

  if (relations.has('public.workday_pause')) {
    deleted.workday_pause = (
      await client.query(
        `delete from public.workday_pause
          where org_id = $1::text
            and lower(coalesce(worker_login, '')) = lower($2::text)`,
        [orgId, login],
      )
    ).rowCount
  } else deleted.workday_pause = 0

  if (relations.has('public.event')) {
    deleted.event = (
      await client.query(
        `delete from public.event
          where org_id = $1::text
            and lower(coalesce(worker_login, '')) = lower($2::text)`,
        [orgId, login],
      )
    ).rowCount
  } else deleted.event = 0

  if (relations.has('public.checklist_log')) {
    deleted.checklist_log = (
      await client.query(
        `delete from public.checklist_log
          where org_id = $1::text
            and lower(coalesce("worker", '')) = lower($2::text)`,
        [orgId, login],
      )
    ).rowCount
  } else deleted.checklist_log = 0

  if (relations.has('public.backup_cycle')) {
    deleted.backup_cycle = (
      await client.query(
        `delete from public.backup_cycle
          where org_id = $1::text
            and lower(coalesce(worker_login, '')) = lower($2::text)`,
        [orgId, login],
      )
    ).rowCount
  } else deleted.backup_cycle = 0

  if (relations.has('public.task')) {
    deleted.task = (
      await client.query(
        `delete from public.task
          where org_id = $1::text
            and (
              lower(coalesce(worker_login, '')) = lower($2::text)
              or lower(coalesce(worker_id, '')) = lower($2::text)
              or (nullif($3::text, '') is not null and lower(coalesce(worker_id, '')) = lower($3::text))
            )`,
        [orgId, login, text(workerId)],
      )
    ).rowCount
  } else deleted.task = 0

  if (relations.has('public.workday')) {
    deleted.workday = (
      await client.query(
        `delete from public.workday
          where org_id = $1::text
            and lower(coalesce(worker_login, '')) = lower($2::text)`,
        [orgId, login],
      )
    ).rowCount
  } else deleted.workday = 0

  deleted.organization_member = (
    await client.query(
      `delete from public.organization_member
        where org_id = $1::text
          and (
            (nullif($2::text, '') is not null and uid = $2::text)
            or (
              nullif($3::text, '') is not null
              and lower(coalesce(worker_id, '')) = lower($3::text)
            )
          )`,
      [orgId, text(authUid), text(workerId)],
    )
  ).rowCount

  deleted.worker = (
    await client.query(
      'delete from public.worker where org_id = $1::text and lower(login) = lower($2::text)',
      [orgId, login],
    )
  ).rowCount

  return deleted
}

function normalizeRestoreRow(row) {
  const login = nullableText(row?.login ?? row?.workerLogin, 80)
  if (!login) return null
  return {
    login,
    workerId: nullableText(row?.workerId ?? row?.worker_id ?? row?.id, 128),
    name: nullableText(row?.fullName ?? row?.workerName ?? row?.name, 240) || login,
    email: nullableText(row?.loginEmail ?? row?.login_email ?? row?.email, 160),
    phone: nullableText(row?.phone, 80),
    role: nullableText(row?.role, 32) || 'WORKER',
    workerType: nullableText(row?.workerType ?? row?.worker_type ?? row?.type ?? row?.role, 40) || 'WORKER',
    active: asBoolean(row?.active, true),
  }
}

async function restoreWorkers(client, orgId, rows, restoredBy) {
  await client.query('select pg_advisory_xact_lock(hashtext($1::text))', [`worker-restore:${orgId}`])
  const [currentResult, reservationResult] = await Promise.all([
    client.query(
      `select login, worker_id, auth_uid
         from public.worker
        where org_id = $1::text
        order by login`,
      [orgId],
    ),
    client.query(
      `select worker_number, worker_id
         from public.worker_id_reservation
        where org_id = $1::text
        order by worker_number`,
      [orgId],
    ),
  ])

  const currentByLogin = new Map(currentResult.rows.map((row) => [lower(row.login), row]))
  const importedRows = (Array.isArray(rows) ? rows : []).map(normalizeRestoreRow).filter(Boolean)
  const importedLogins = new Set(importedRows.map((row) => lower(row.login)))
  const usedIds = new Set(currentResult.rows.map((row) => lower(row.worker_id)).filter(Boolean))
  const reservations = [...reservationResult.rows]
  const syntheticWorkers = currentResult.rows.map((row) => ({ worker_id: row.worker_id }))
  const reservedNumbers = new Set(
    reservations
      .map((row) => normalizeWorkerNumber(row.worker_number, { optional: true }))
      .filter(Boolean),
  )

  const nextAvailableWorkerId = async () => {
    let workerNumber = nextWorkerNumber(orgId, reservations, syntheticWorkers)
    while (reservedNumbers.has(workerNumber) || usedIds.has(lower(buildWorkerId(orgId, workerNumber)))) {
      workerNumber += 1
    }
    const workerId = buildWorkerId(orgId, workerNumber)
    await client.query(
      `insert into public.worker_id_reservation (
         org_id, worker_number, worker_id, created_at, created_by_uid
       )
       values ($1::text, $2::integer, $3::text, now(), nullif($4::text, ''))`,
      [orgId, workerNumber, workerId, text(restoredBy)],
    )
    reservations.push({ worker_number: workerNumber, worker_id: workerId })
    syntheticWorkers.push({ worker_id: workerId })
    reservedNumbers.add(workerNumber)
    usedIds.add(lower(workerId))
    return workerId
  }

  let created = 0
  let updated = 0
  let deactivated = 0
  let skipped = 0

  for (const row of importedRows) {
    const existing = currentByLogin.get(lower(row.login))
    if (existing) {
      await client.query(
        `update public.worker
            set full_name = $3::text,
                login_email = nullif($4::text, ''),
                email = nullif($4::text, ''),
                phone = nullif($5::text, ''),
                role = $6::text,
                worker_type = $7::text,
                active = $8::boolean,
                edit = nullif($9::text, ''),
                updated_at = now()
          where org_id = $1::text
            and lower(login) = lower($2::text)`,
        [
          orgId,
          row.login,
          row.name,
          row.email,
          row.phone,
          row.role,
          row.workerType,
          row.active,
          restoredBy,
        ],
      )
      updated += 1
      continue
    }

    let workerId = row.workerId
    const parsedNumber = workerId ? parseWorkerNumber(orgId, workerId) : null
    const workerIdConflict = workerId && usedIds.has(lower(workerId))
    const reservationConflict = parsedNumber && reservedNumbers.has(parsedNumber)

    if (!workerId || workerIdConflict || reservationConflict) {
      workerId = await nextAvailableWorkerId()
    } else if (parsedNumber) {
      await client.query(
        `insert into public.worker_id_reservation (
           org_id, worker_number, worker_id, created_at, created_by_uid
         )
         values ($1::text, $2::integer, $3::text, now(), nullif($4::text, ''))`,
        [orgId, parsedNumber, workerId, text(restoredBy)],
      )
      reservations.push({ worker_number: parsedNumber, worker_id: workerId })
      syntheticWorkers.push({ worker_id: workerId })
      reservedNumbers.add(parsedNumber)
      usedIds.add(lower(workerId))
    } else {
      usedIds.add(lower(workerId))
      syntheticWorkers.push({ worker_id: workerId })
    }

    const result = await client.query(
      `insert into public.worker (
         org_id,
         login,
         worker_id,
         full_name,
         login_email,
         email,
         phone,
         role,
         worker_type,
         active,
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
         nullif($5::text, ''),
         nullif($5::text, ''),
         nullif($6::text, ''),
         $7::text,
         $8::text,
         false,
         null,
         nullif($9::text, ''),
         now(),
         now()
       )
       on conflict do nothing`,
      [
        orgId,
        row.login,
        workerId,
        row.name,
        row.email,
        row.phone,
        row.role,
        row.workerType,
        restoredBy,
      ],
    )
    if (result.rowCount) created += 1
    else skipped += 1
  }

  for (const current of currentResult.rows) {
    if (importedLogins.has(lower(current.login))) continue
    const result = await client.query(
      `update public.worker
          set active = false,
              edit = nullif($3::text, ''),
              updated_at = now()
        where org_id = $1::text
          and lower(login) = lower($2::text)
          and active is distinct from false`,
      [orgId, current.login, restoredBy],
    )
    deactivated += result.rowCount
  }

  return {
    moduleId: 'workers',
    created,
    updated,
    deleted: 0,
    deactivated,
    skipped,
  }
}

module.exports = {
  OPTIONAL_WORKER_RELATIONS,
  REQUIRED_WORKER_INDEXES,
  REQUIRED_WORKER_SCHEMA,
  assertEmailAvailable,
  assertLoginAvailable,
  assertWorkerSchemaReady,
  clearWorkerSchemaReadyCache,
  deleteWorkerAccessRows,
  findExistingWorker,
  getOrganizationOwnerWorkerId,
  getRequesterMembership,
  inspectWorkerSchema,
  insertWorkerAndMembership,
  normalizeRestoreRow,
  publicError,
  readExistingRelations,
  readWorkerForPasswordReset,
  readWorkerForUpdate,
  readWorkerIdRows,
  renameWorker,
  reserveWorkerId,
  restoreWorkers,
  runQuery,
  updateWorkerRow,
  upsertWorkerMembership,
}
