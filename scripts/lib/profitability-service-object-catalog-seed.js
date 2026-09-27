'use strict'

const crypto = require('node:crypto')

const MANIFEST_SCHEMA_VERSION = 'profitability-service-object-catalog/v1'
const EXPECTED_ORG_ID = 'bestclean'
const ACTIVE_SOURCE_STATUS = 'AKTYWNY'
const INACTIVE_SOURCE_STATUS = 'NIEAKTYWNY'
const SOURCE_OWNER_ROLE = 'firebaseowner_iclean-room-database_public'
const TARGET_OWNER_ROLE = 'profitability_owner'
const TARGET_RUNNER_ROLE = 'profitability_migration_runner'
const PROFITABILITY_ACTIVATION_LOCK_NAMESPACE =
  'cleanzi:profitability-bestclean-activation'

const REQUIRED_SOURCE_COLUMNS = Object.freeze([
  'org_id', 'client_id', 'name', 'address', 'city', 'postal_code', 'status',
])
const REQUIRED_TARGET_COLUMNS = Object.freeze([
  'org_id', 'object_id', 'client_id', 'name', 'timezone', 'default_currency',
  'status', 'address', 'city', 'postal_code', 'created_at', 'created_by_uid',
  'updated_at', 'updated_by_uid', 'archived_at', 'archived_by_uid',
])
const REQUIRED_TARGET_CONSTRAINTS = Object.freeze({
  service_object_pkey: 'p',
  service_object_org_object_client_key: 'u',
  service_object_org_fk: 'f',
  service_object_client_fk: 'f',
  service_object_currency_check: 'c',
  service_object_status_check: 'c',
})
const TARGET_COLUMN_RULES = Object.freeze({
  org_id: ['character varying', 'NO', 64],
  object_id: ['character varying', 'NO', 64],
  client_id: ['character varying', 'NO', 64],
  name: ['character varying', 'NO', 180],
  timezone: ['character varying', 'NO', 80, "'Europe/Warsaw'"],
  default_currency: ['character', 'NO', 3, "'PLN'"],
  status: ['character varying', 'NO', 30, "'ACTIVE'"],
  address: ['text', 'YES', null],
  city: ['character varying', 'YES', 120],
  postal_code: ['character varying', 'YES', 20],
  created_at: ['timestamp with time zone', 'NO', null, 'now()'],
  created_by_uid: ['character varying', 'YES', 128],
  updated_at: ['timestamp with time zone', 'NO', null, 'now()'],
  updated_by_uid: ['character varying', 'YES', 128],
  archived_at: ['timestamp with time zone', 'YES', null],
  archived_by_uid: ['character varying', 'YES', 128],
})
const TARGET_CONSTRAINT_RULES = Object.freeze({
  service_object_pkey: ['p', 'primary key (org_id, object_id)'],
  service_object_org_object_client_key: ['u', 'unique (org_id, object_id, client_id)'],
  service_object_org_fk: ['f', 'foreign key (org_id) references organizations(org_id)'],
  service_object_client_fk: ['f', 'foreign key (org_id, client_id) references client(org_id, client_id)'],
  service_object_currency_check: ['c', "check (default_currency ~ '^[A-Z]{3}$')"],
  service_object_status_check: ['c', "check (status::text = any (array['ACTIVE'::character varying, 'INACTIVE'::character varying, 'ARCHIVED'::character varying]::text[]))"],
})
const CATALOG_VERIFICATION_SCHEMA_VERSION =
  'profitability-service-object-catalog-verification/v2'
const CATALOG_FINGERPRINT_SCHEMA_VERSION =
  'profitability-service-object-catalog-fingerprint/v1'

class ProfitabilityCatalogSeedError extends Error {
  constructor(code, details = {}) {
    super(code)
    this.name = 'ProfitabilityCatalogSeedError'
    this.code = code
    this.details = details
  }
}

function fail(code, details = {}) {
  throw new ProfitabilityCatalogSeedError(code, details)
}

function rawText(value) {
  return value === null || value === undefined ? '' : String(value)
}

function requiredIdentifier(value, label, maxLength) {
  const raw = rawText(value)
  const normalized = raw.trim()
  if (
    !normalized || raw !== normalized || normalized.length > maxLength ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) fail(`${label}_INVALID`)
  return normalized
}

function nullableText(value, label, maxLength) {
  if (value === null || value === undefined) return null
  const raw = String(value)
  const normalized = raw.trim()
  if (!normalized) return null
  if (
    raw !== normalized || normalized.length > maxLength ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)
  ) fail(`${label}_INVALID`)
  return normalized
}

function canonicalStringify(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalStringify(value[key])}`
    )).join(',')}}`
  }
  return JSON.stringify(value)
}

function normalizedDefinition(value) {
  return rawText(value).trim().toLowerCase()
    .replace(/"/g, '')
    .replace(/public\./g, '')
    .replace(/::(?:character varying|text|name|date|integer|bigint|boolean|timestamp with time zone)/g, '')
    .replace(/[()]/g, '')
    .replace(/\s+/g, '')
}

function manifestSha256(manifest) {
  return crypto.createHash('sha256')
    .update(canonicalStringify(manifest), 'utf8')
    .digest('hex')
}

function profitabilityActivationLockKey(orgId) {
  return `${PROFITABILITY_ACTIVATION_LOCK_NAMESPACE}:${orgId}`
}

function rowValue(row, camel, snake = camel) {
  if (Object.prototype.hasOwnProperty.call(row || {}, camel)) return row[camel]
  return row?.[snake]
}

function normalizeSourceStatus(value) {
  const raw = rawText(value)
  const normalized = raw.trim().toUpperCase()
  if (raw !== raw.trim() || ![ACTIVE_SOURCE_STATUS, INACTIVE_SOURCE_STATUS].includes(normalized)) {
    fail('SOURCE_CLIENT_STATUS_UNSUPPORTED')
  }
  return normalized
}

function normalizeSourceRow(row, expectedOrgId) {
  const orgId = requiredIdentifier(rowValue(row, 'orgId', 'org_id'), 'SOURCE_ORG_ID', 64)
  if (orgId !== expectedOrgId) fail('SOURCE_ORG_SCOPE_MISMATCH')
  const clientId = requiredIdentifier(
    rowValue(row, 'clientId', 'client_id'),
    'SOURCE_CLIENT_ID',
    64,
  )
  const sourceStatus = normalizeSourceStatus(rowValue(row, 'status'))
  const nameValue = rowValue(row, 'name')

  if (sourceStatus === INACTIVE_SOURCE_STATUS) {
    return { orgId, clientId, sourceStatus, active: false }
  }

  return {
    orgId,
    objectId: clientId,
    clientId,
    name: requiredIdentifier(nameValue, 'SOURCE_CLIENT_NAME', 180),
    address: nullableText(rowValue(row, 'address'), 'SOURCE_CLIENT_ADDRESS', 10000),
    city: nullableText(rowValue(row, 'city'), 'SOURCE_CLIENT_CITY', 120),
    postalCode: nullableText(
      rowValue(row, 'postalCode', 'postal_code'),
      'SOURCE_CLIENT_POSTAL_CODE',
      20,
    ),
    sourceStatus,
    status: 'ACTIVE',
    active: true,
  }
}

function buildManifest(orgIdValue, sourceRows) {
  const orgId = requiredIdentifier(orgIdValue, 'ORG_ID', 64)
  if (orgId !== EXPECTED_ORG_ID) fail('ORG_NOT_ALLOWLISTED')
  if (!Array.isArray(sourceRows) || sourceRows.length === 0) fail('SOURCE_CLIENT_CATALOG_EMPTY')

  const seenClientIds = new Set()
  const objects = []
  const inactiveSourceClientIds = []
  for (const row of sourceRows) {
    const normalized = normalizeSourceRow(row, orgId)
    if (seenClientIds.has(normalized.clientId)) fail('SOURCE_CLIENT_DUPLICATE')
    seenClientIds.add(normalized.clientId)
    if (!normalized.active) {
      inactiveSourceClientIds.push(normalized.clientId)
      continue
    }
    objects.push({
      orgId: normalized.orgId,
      objectId: normalized.objectId,
      clientId: normalized.clientId,
      name: normalized.name,
      address: normalized.address,
      city: normalized.city,
      postalCode: normalized.postalCode,
      status: normalized.status,
    })
  }
  objects.sort((left, right) => left.clientId.localeCompare(right.clientId))
  inactiveSourceClientIds.sort((left, right) => left.localeCompare(right))
  if (objects.length === 0) fail('ACTIVE_SOURCE_CLIENT_REQUIRED')

  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    orgId,
    source: 'public.client',
    identityMapping: 'object_id=client_id',
    activeSourceStatus: ACTIVE_SOURCE_STATUS,
    inactiveSourceStatus: INACTIVE_SOURCE_STATUS,
    inactiveSourceCount: inactiveSourceClientIds.length,
    inactiveSourceClientIds,
    objects,
  }
}

function buildCatalogFingerprint(orgIdValue, rows) {
  const orgId = requiredIdentifier(orgIdValue, 'FINGERPRINT_ORG_ID', 64)
  if (orgId !== EXPECTED_ORG_ID) fail('ORG_NOT_ALLOWLISTED')
  if (!Array.isArray(rows) || rows.length === 0) fail('CATALOG_FINGERPRINT_EMPTY')
  const objectIds = new Set()
  const clientIds = new Set()
  const objects = rows.map((row) => {
    const rowOrgId = requiredIdentifier(
      rowValue(row, 'orgId', 'org_id'),
      'FINGERPRINT_ROW_ORG_ID',
      64,
    )
    if (rowOrgId !== orgId) fail('CATALOG_FINGERPRINT_ORG_SCOPE_MISMATCH')
    const objectId = requiredIdentifier(
      rowValue(row, 'objectId', 'object_id'),
      'FINGERPRINT_OBJECT_ID',
      64,
    )
    const clientId = requiredIdentifier(
      rowValue(row, 'clientId', 'client_id'),
      'FINGERPRINT_CLIENT_ID',
      64,
    )
    const name = requiredIdentifier(rowValue(row, 'name'), 'FINGERPRINT_NAME', 180)
    const status = requiredIdentifier(rowValue(row, 'status'), 'FINGERPRINT_STATUS', 30)
      .toUpperCase()
    const archivedAt = rowValue(row, 'archivedAt', 'archived_at')
    if (status !== 'ACTIVE' || (archivedAt !== undefined && archivedAt !== null)) {
      fail('CATALOG_FINGERPRINT_ROW_NOT_ACTIVE')
    }
    if (objectIds.has(objectId) || clientIds.has(clientId)) {
      fail('CATALOG_FINGERPRINT_DUPLICATE')
    }
    objectIds.add(objectId)
    clientIds.add(clientId)
    return { orgId, objectId, clientId, name, status }
  })
  objects.sort((left, right) => (
    left.objectId.localeCompare(right.objectId) || left.clientId.localeCompare(right.clientId)
  ))
  return Object.freeze({
    schemaVersion: CATALOG_FINGERPRINT_SCHEMA_VERSION,
    orgId,
    fields: Object.freeze(['orgId', 'objectId', 'clientId', 'name', 'status']),
    objects: Object.freeze(objects.map((row) => Object.freeze(row))),
  })
}

function catalogFingerprintSha256(fingerprint) {
  return manifestSha256(fingerprint)
}

function catalogFingerprintFromSourceRows(orgId, sourceRows) {
  const manifest = buildManifest(orgId, sourceRows)
  return buildCatalogFingerprint(manifest.orgId, manifest.objects)
}

function catalogFingerprintFromTargetRows(orgId, targetRows) {
  return buildCatalogFingerprint(orgId, targetRows)
}

function normalizeTargetRow(row, expectedOrgId) {
  const orgId = requiredIdentifier(rowValue(row, 'orgId', 'org_id'), 'TARGET_ORG_ID', 64)
  if (orgId !== expectedOrgId) fail('TARGET_ORG_SCOPE_MISMATCH')
  const status = requiredIdentifier(rowValue(row, 'status'), 'TARGET_STATUS', 30).toUpperCase()
  const archivedAt = rowValue(row, 'archivedAt', 'archived_at')
  return {
    orgId,
    objectId: requiredIdentifier(rowValue(row, 'objectId', 'object_id'), 'TARGET_OBJECT_ID', 64),
    clientId: requiredIdentifier(rowValue(row, 'clientId', 'client_id'), 'TARGET_CLIENT_ID', 64),
    name: requiredIdentifier(rowValue(row, 'name'), 'TARGET_NAME', 180),
    status,
    archivedAt: archivedAt === undefined ? null : archivedAt,
  }
}

function conflict(kind, objectId, clientId) {
  return { kind, objectId: objectId || null, clientId: clientId || null }
}

function buildSeedPlan(manifest, targetRows) {
  if (!manifest || manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) fail('MANIFEST_INVALID')
  if (!Array.isArray(targetRows)) fail('TARGET_ROWS_INVALID')

  const expectedByObject = new Map(manifest.objects.map((row) => [row.objectId, row]))
  const expectedByClient = new Map(manifest.objects.map((row) => [row.clientId, row]))
  const targetByObject = new Map()
  const targetByClient = new Map()
  const conflicts = []

  for (const rawRow of targetRows) {
    const row = normalizeTargetRow(rawRow, manifest.orgId)
    if (targetByObject.has(row.objectId)) {
      conflicts.push(conflict('TARGET_OBJECT_ID_DUPLICATE', row.objectId, row.clientId))
    } else targetByObject.set(row.objectId, row)
    if (targetByClient.has(row.clientId)) {
      conflicts.push(conflict('TARGET_CLIENT_ID_DUPLICATE', row.objectId, row.clientId))
    } else targetByClient.set(row.clientId, row)
  }

  const inserts = []
  const preserved = []
  for (const expected of manifest.objects) {
    const byObject = targetByObject.get(expected.objectId)
    const byClient = targetByClient.get(expected.clientId)
    if (!byObject && !byClient) {
      inserts.push(expected)
      continue
    }
    if (!byObject || !byClient || byObject !== byClient) {
      conflicts.push(conflict('TARGET_IDENTITY_CONFLICT', expected.objectId, expected.clientId))
      continue
    }
    if (byObject.objectId !== expected.objectId || byObject.clientId !== expected.clientId) {
      conflicts.push(conflict('TARGET_IDENTITY_CONFLICT', expected.objectId, expected.clientId))
      continue
    }
    if (byObject.name !== expected.name) {
      conflicts.push(conflict('TARGET_NAME_CONFLICT', expected.objectId, expected.clientId))
      continue
    }
    if (byObject.status !== 'ACTIVE' || byObject.archivedAt !== null) {
      conflicts.push(conflict('TARGET_STATUS_CONFLICT', expected.objectId, expected.clientId))
      continue
    }
    preserved.push(expected)
  }

  for (const row of targetByObject.values()) {
    if (!expectedByObject.has(row.objectId) || !expectedByClient.has(row.clientId)) {
      conflicts.push(conflict('TARGET_WITHOUT_ACTIVE_SOURCE', row.objectId, row.clientId))
    }
  }

  conflicts.sort((left, right) => (
    left.kind.localeCompare(right.kind) ||
    String(left.objectId).localeCompare(String(right.objectId)) ||
    String(left.clientId).localeCompare(String(right.clientId))
  ))
  inserts.sort((left, right) => left.clientId.localeCompare(right.clientId))
  preserved.sort((left, right) => left.clientId.localeCompare(right.clientId))

  return {
    exact: inserts.length === 0 && conflicts.length === 0 &&
      preserved.length === manifest.objects.length,
    inserts,
    preserved,
    conflicts,
  }
}

function assertConflictFree(plan) {
  if (plan.conflicts.length > 0) {
    fail('CATALOG_CONFLICT', { conflicts: plan.conflicts })
  }
}

function assertExact(plan) {
  assertConflictFree(plan)
  if (!plan.exact) fail('CATALOG_STATE_NOT_EXACT', { missingObjects: plan.inserts.length })
}

async function assertSourceSchema(sourceClient) {
  const ownerResult = await sourceClient.query(
    `/* profitability-service-object-seed:source-owner */
     select current_user as current_role,
            pg_get_userbyid(relation.relowner) as table_owner,
            relation.relpersistence, relation.relrowsecurity, relation.relforcerowsecurity
       from pg_class relation
       join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public' and relation.relname = 'client'
        and relation.relkind = 'r'`,
  )
  const owner = ownerResult.rows?.[0]
  if (!owner || owner.current_role !== SOURCE_OWNER_ROLE || owner.table_owner !== SOURCE_OWNER_ROLE ||
      owner.relpersistence !== 'p' || owner.relrowsecurity !== false ||
      owner.relforcerowsecurity !== false) {
    fail('SOURCE_OWNER_ROLE_NOT_READY')
  }
  const result = await sourceClient.query(
    `/* profitability-service-object-seed:source-schema */
     select column_name
       from information_schema.columns
      where table_schema = 'public'
        and table_name = 'client'
        and column_name = any($1::text[])
      order by column_name`,
    [REQUIRED_SOURCE_COLUMNS],
  )
  const available = new Set((result.rows || []).map((row) => rawText(row.column_name)))
  const missing = REQUIRED_SOURCE_COLUMNS.filter((column) => !available.has(column))
  if (missing.length) fail('SOURCE_CLIENT_SCHEMA_NOT_READY', { missing })

  const privileges = await sourceClient.query(
    `/* profitability-service-object-seed:source-privileges */
     select has_column_privilege(current_user, 'public.client', column_name, 'SELECT') as allowed
       from unnest($1::text[]) as required(column_name)`,
    [REQUIRED_SOURCE_COLUMNS],
  )
  if ((privileges.rows || []).length !== REQUIRED_SOURCE_COLUMNS.length ||
      privileges.rows.some((row) => row.allowed !== true)) {
    fail('SOURCE_READER_PRIVILEGES_NOT_READY')
  }
}

async function assertTargetSchema(targetClient) {
  const ownerResult = await targetClient.query(
    `/* profitability-service-object-seed:target-owner */
     select current_user as current_role,
            pg_get_userbyid(c.relowner) as table_owner,
            c.relpersistence, c.relrowsecurity, c.relforcerowsecurity
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'service_object' and c.relkind = 'r'`,
  )
  const owner = ownerResult.rows?.[0]
  if (!owner || owner.current_role !== TARGET_OWNER_ROLE || owner.table_owner !== TARGET_OWNER_ROLE ||
      owner.relpersistence !== 'p' || owner.relrowsecurity !== false ||
      owner.relforcerowsecurity !== false) {
    fail('TARGET_OWNER_ROLE_NOT_READY')
  }

  const columnsResult = await targetClient.query(
    `/* profitability-service-object-seed:target-schema */
     select column_name, data_type, is_nullable, character_maximum_length, column_default
       from information_schema.columns
      where table_schema = 'public'
        and table_name = 'service_object'
      order by ordinal_position`,
  )
  const columns = columnsResult.rows || []
  if (columns.length !== REQUIRED_TARGET_COLUMNS.length) {
    fail('TARGET_SERVICE_OBJECT_COLUMN_SET_FINGERPRINT_MISMATCH')
  }
  const columnsByName = new Map(columns.map((row) => [rawText(row.column_name), row]))
  for (const [name, rule] of Object.entries(TARGET_COLUMN_RULES)) {
    const actual = columnsByName.get(name)
    if (!actual || rawText(actual.data_type).toLowerCase() !== rule[0] ||
        rawText(actual.is_nullable).toUpperCase() !== rule[1] ||
        (rule[2] !== null && Number(actual.character_maximum_length) !== rule[2]) ||
        (rule[3] !== undefined &&
          !normalizedDefinition(actual.column_default).includes(normalizedDefinition(rule[3])))) {
      fail('TARGET_SERVICE_OBJECT_COLUMN_FINGERPRINT_MISMATCH', { column: name })
    }
  }

  const constraintsResult = await targetClient.query(
    `/* profitability-service-object-seed:target-constraints */
     select conname, contype, convalidated,
            pg_get_constraintdef(oid, true) as definition
       from pg_constraint
      where conrelid = 'public.service_object'::regclass
      order by conname`,
  )
  const constraintRows = constraintsResult.rows || []
  if (constraintRows.length !== Object.keys(TARGET_CONSTRAINT_RULES).length) {
    fail('TARGET_SERVICE_OBJECT_CONSTRAINT_SET_FINGERPRINT_MISMATCH')
  }
  const constraints = new Map(constraintRows.map((row) => [rawText(row.conname), row]))
  for (const [name, rule] of Object.entries(TARGET_CONSTRAINT_RULES)) {
    const actual = constraints.get(name)
    if (!actual || rawText(actual.contype) !== rule[0] || actual.convalidated !== true ||
        normalizedDefinition(actual.definition) !== normalizedDefinition(rule[1])) {
      fail('TARGET_SERVICE_OBJECT_CONSTRAINT_FINGERPRINT_MISMATCH', { constraint: name })
    }
  }

  const indexesResult = await targetClient.query(
    `/* profitability-service-object-seed:target-indexes */
     select index_row.relname as index_name,
            pg_get_userbyid(index_row.relowner) as index_owner,
            index_meta.indisvalid as is_valid, index_meta.indisready as is_ready,
            pg_get_indexdef(index_meta.indexrelid, 0, true) as definition
       from pg_index index_meta
       join pg_class index_row on index_row.oid = index_meta.indexrelid
      where index_meta.indrelid = 'public.service_object'::regclass
      order by index_row.relname`,
  )
  const indexes = indexesResult.rows || []
  if (indexes.length !== 3 || indexes.some((row) => (
    row.index_owner !== TARGET_OWNER_ROLE || row.is_valid !== true || row.is_ready !== true
  ))) fail('TARGET_SERVICE_OBJECT_INDEX_SET_FINGERPRINT_MISMATCH')
  const orgClientIndex = indexes.find((row) => row.index_name === 'service_object_org_client_idx')
  if (!orgClientIndex || !normalizedDefinition(orgClientIndex.definition)
    .includes(normalizedDefinition('service_object using btree (org_id, client_id, status) where archived_at is null'))) {
    fail('TARGET_SERVICE_OBJECT_INDEX_FINGERPRINT_MISMATCH')
  }

  const privilegesResult = await targetClient.query(
    `/* profitability-service-object-seed:target-privileges */
     select has_table_privilege(current_user, 'public.service_object', 'SELECT') as can_select,
            has_table_privilege(current_user, 'public.service_object', 'INSERT') as can_insert`,
  )
  const privileges = privilegesResult.rows?.[0] || {}
  if (privileges.can_select !== true || privileges.can_insert !== true) {
    fail('TARGET_SERVICE_OBJECT_PRIVILEGES_NOT_READY')
  }
}

async function readSourceRows(sourceClient, orgId) {
  const result = await sourceClient.query(
    `/* profitability-service-object-seed:source-clients */
     select org_id, client_id, name, address, city, postal_code, status
       from public.client
      where org_id = $1
      order by client_id`,
    [orgId],
  )
  return result.rows || []
}

async function readTargetRows(targetClient, orgId) {
  const result = await targetClient.query(
    `/* profitability-service-object-seed:target-objects */
     select org_id, object_id, client_id, name, status, address, city, postal_code,
            archived_at
       from public.service_object
      where org_id = $1
      order by object_id, client_id`,
    [orgId],
  )
  return result.rows || []
}

async function insertMissingObjects(targetClient, objects) {
  for (const object of objects) {
    const result = await targetClient.query(
      `/* profitability-service-object-seed:insert-object */
       insert into public.service_object (
         org_id, object_id, client_id, name, address, city, postal_code, status
       ) values ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE')`,
      [object.orgId, object.objectId, object.clientId, object.name,
        object.address, object.city, object.postalCode],
    )
    if (result.rowCount !== 1) fail('SERVICE_OBJECT_INSERT_FAILED')
  }
}

async function runCatalogSeed({
  targetClient,
  sourceClient,
  orgId = EXPECTED_ORG_ID,
  mode = 'audit',
  expectedManifestSha256 = '',
  sourceSchemaCheck = assertSourceSchema,
  targetSchemaCheck = assertTargetSchema,
} = {}) {
  if (!targetClient?.query) fail('TARGET_DATABASE_CLIENT_REQUIRED')
  if (!sourceClient?.query || sourceClient === targetClient) {
    fail('DISTINCT_SOURCE_READER_CLIENT_REQUIRED')
  }
  if (!['audit', 'apply', 'verify'].includes(mode)) fail('MODE_INVALID')
  if (orgId !== EXPECTED_ORG_ID) fail('ORG_NOT_ALLOWLISTED')

  const readOnly = mode !== 'apply'
  let sourceStarted = false
  let targetStarted = false
  let targetFinished = false
  try {
    await sourceClient.query('begin isolation level read committed read only')
    sourceStarted = true
    await sourceSchemaCheck(sourceClient)
    const initialSourceRows = await readSourceRows(sourceClient, orgId)
    const manifest = buildManifest(orgId, initialSourceRows)
    const hash = manifestSha256(manifest)
    if (mode === 'apply' && expectedManifestSha256 !== hash) {
      fail('CONFIRM_MANIFEST_SHA256_MISMATCH')
    }

    await targetClient.query(`begin isolation level serializable${readOnly ? ' read only' : ''}`)
    targetStarted = true
    await targetClient.query(`set local role ${TARGET_RUNNER_ROLE}`)
    await targetClient.query(`set local role ${TARGET_OWNER_ROLE}`)
    await targetClient.query(
      `select pg_advisory_xact_lock(hashtextextended($1::text, 0))
         /* profitability-service-object-seed:organization-lock */`,
      [profitabilityActivationLockKey(orgId)],
    )
    await targetSchemaCheck(targetClient)
    let targetRows = await readTargetRows(targetClient, orgId)
    let plan = buildSeedPlan(manifest, targetRows)
    if (mode !== 'audit') assertConflictFree(plan)
    const plannedInsertCount = plan.inserts.length

    if (mode === 'verify') assertExact(plan)
    if (mode === 'apply') {
      await insertMissingObjects(targetClient, plan.inserts)
      targetRows = await readTargetRows(targetClient, orgId)
      plan = buildSeedPlan(manifest, targetRows)
      assertExact(plan)

      const confirmedSourceRows = await readSourceRows(sourceClient, orgId)
      const confirmedFingerprint = catalogFingerprintFromSourceRows(orgId, confirmedSourceRows)
      const sourceFingerprint = buildCatalogFingerprint(manifest.orgId, manifest.objects)
      if (catalogFingerprintSha256(confirmedFingerprint) !==
          catalogFingerprintSha256(sourceFingerprint)) {
        fail('SOURCE_CATALOG_CHANGED_DURING_APPLY')
      }
    }

    const sourceFingerprint = buildCatalogFingerprint(manifest.orgId, manifest.objects)
    const sourceFingerprintSha256 = catalogFingerprintSha256(sourceFingerprint)
    let targetFingerprintSha256 = null
    if (plan.exact) {
      const targetFingerprint = catalogFingerprintFromTargetRows(orgId, targetRows)
      targetFingerprintSha256 = catalogFingerprintSha256(targetFingerprint)
      if (targetFingerprintSha256 !== sourceFingerprintSha256) {
        fail('CATALOG_FINGERPRINT_MISMATCH')
      }
    }

    if (readOnly) await targetClient.query('rollback')
    else await targetClient.query('commit')
    targetFinished = true
    await sourceClient.query('rollback')
    sourceStarted = false

    const exact = mode === 'apply' ? true : plan.exact
    const serviceObjects = mode === 'apply' ? manifest.objects.length : plan.preserved.length
    return {
      mode,
      manifest,
      manifestSha256: hash,
      exact,
      catalogVerification: {
        schemaVersion: CATALOG_VERIFICATION_SCHEMA_VERSION,
        fingerprintSchemaVersion: CATALOG_FINGERPRINT_SCHEMA_VERSION,
        orgId,
        fingerprintSha256: sourceFingerprintSha256,
        exact,
        counts: {
          activeSourceClients: manifest.objects.length,
          serviceObjects,
        },
      },
      changed: mode === 'apply' && plannedInsertCount > 0,
      conflictKinds: [...new Set(plan.conflicts.map((item) => item.kind))].sort(),
      counts: {
        activeSourceClients: manifest.objects.length,
        inactiveSourceClients: manifest.inactiveSourceCount,
        existingObjects: plan.preserved.length,
        missingObjects: mode === 'apply' ? 0 : plan.inserts.length,
        insertedObjects: mode === 'apply' ? plannedInsertCount : 0,
        conflicts: plan.conflicts.length,
      },
    }
  } catch (error) {
    if (targetStarted && !targetFinished) {
      try { await targetClient.query('rollback') } catch {}
    }
    if (sourceStarted) {
      try { await sourceClient.query('rollback') } catch {}
    }
    throw error
  }
}

module.exports = {
  ACTIVE_SOURCE_STATUS,
  CATALOG_FINGERPRINT_SCHEMA_VERSION,
  CATALOG_VERIFICATION_SCHEMA_VERSION,
  EXPECTED_ORG_ID,
  INACTIVE_SOURCE_STATUS,
  MANIFEST_SCHEMA_VERSION,
  ProfitabilityCatalogSeedError,
  REQUIRED_SOURCE_COLUMNS,
  REQUIRED_TARGET_CONSTRAINTS,
  REQUIRED_TARGET_COLUMNS,
  SOURCE_OWNER_ROLE,
  TARGET_COLUMN_RULES,
  TARGET_CONSTRAINT_RULES,
  TARGET_OWNER_ROLE,
  TARGET_RUNNER_ROLE,
  assertConflictFree,
  assertExact,
  assertSourceSchema,
  assertTargetSchema,
  buildManifest,
  buildCatalogFingerprint,
  buildSeedPlan,
  catalogFingerprintFromSourceRows,
  catalogFingerprintFromTargetRows,
  catalogFingerprintSha256,
  canonicalStringify,
  insertMissingObjects,
  manifestSha256,
  profitabilityActivationLockKey,
  readSourceRows,
  readTargetRows,
  runCatalogSeed,
}
