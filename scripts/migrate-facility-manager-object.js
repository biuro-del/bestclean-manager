'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {
  createPool,
  loadSecretManagerDatabaseConfig,
} = require('./migrate-worker-model')

const rootDir = path.resolve(__dirname, '..')
const EXPECTED_PROJECT_ID = 'iclean-room'
const EXPECTED_DATABASE_NAME = 'iclean-room-database'
const PRODUCTION_CONFIRMATION = 'CLZ-DB-20260827-FACILITY-MANAGER-OBJECT-01'
const MIGRATION_FILES = ['20260827_facility_manager_object_additive.sql']
const MIGRATION_LOCK_TIMEOUT = '5s'
const MIGRATION_STATEMENT_TIMEOUT = '60s'
const AUDIT_SEQUENCE_NAME = 'facility_manager_object_audit_audit_id_seq'

const REQUIRED_CONSTRAINTS = Object.freeze([
  {
    tableName: 'facility_manager_object',
    constraintName: 'facility_manager_object_pkey',
    constraintType: 'p',
    definitionIncludes: ['primary key (org_id, object_id)'],
  },
  {
    tableName: 'facility_manager_object',
    constraintName: 'facility_manager_object_org_fk',
    constraintType: 'f',
    definitionIncludes: ['foreign key (org_id)', 'references organizations(org_id)', 'on delete cascade'],
  },
  {
    tableName: 'facility_manager_object',
    constraintName: 'facility_manager_object_status_check',
    constraintType: 'c',
    definitionIncludes: ['status', "'active'", "'archived'"],
  },
  {
    tableName: 'facility_manager_object',
    constraintName: 'facility_manager_object_version_check',
    constraintType: 'c',
    definitionIncludes: ['version > 0'],
  },
  {
    tableName: 'facility_manager_object',
    constraintName: 'facility_manager_object_create_request_key_check',
    constraintType: 'c',
    definitionIncludes: ['create_request_key', "'^[a-za-z0-9_-]{16,160}$'"],
  },
  {
    tableName: 'facility_manager_object',
    constraintName: 'facility_manager_object_payload_fingerprint_check',
    constraintType: 'c',
    definitionIncludes: ['create_payload_fingerprint', "'^[a-f0-9]{64}$'"],
  },
  {
    tableName: 'facility_manager_object',
    constraintName: 'facility_manager_object_create_request_unique',
    constraintType: 'u',
    definitionIncludes: ['unique (org_id, created_by_uid, create_request_key)'],
  },
  {
    tableName: 'facility_manager_object_audit',
    constraintName: 'facility_manager_object_audit_pkey',
    constraintType: 'p',
    definitionIncludes: ['primary key (audit_id)'],
  },
  {
    tableName: 'facility_manager_object_audit',
    constraintName: 'facility_manager_object_audit_object_fk',
    constraintType: 'f',
    definitionIncludes: ['foreign key (org_id, object_id)', 'references facility_manager_object(org_id, object_id)', 'on delete cascade'],
  },
  {
    tableName: 'facility_manager_object_audit',
    constraintName: 'facility_manager_object_audit_action_check',
    constraintType: 'c',
    definitionIncludes: ['action', "'created'", "'updated'", "'archived'"],
  },
])

const REQUIRED_INDEXES = Object.freeze([
  {
    indexName: 'facility_manager_object_org_status_idx',
    definitionIncludes: ['on facility_manager_object', '(org_id, status', 'lower', 'name', 'object_id'],
  },
  {
    indexName: 'facility_manager_object_org_updated_idx',
    definitionIncludes: ['on facility_manager_object', '(org_id, updated_at desc, object_id)'],
  },
  {
    indexName: 'facility_manager_object_audit_object_idx',
    definitionIncludes: ['on facility_manager_object_audit', '(org_id, object_id, occurred_at desc)'],
  },
])

const REQUIRED_TABLE_PRIVILEGES = Object.freeze([
  { tableName: 'facility_manager_object', privileges: ['can_select', 'can_insert', 'can_update'] },
  { tableName: 'facility_manager_object_audit', privileges: ['can_insert'] },
])

function text(value) {
  return String(value ?? '').trim()
}

function normalizedDefinition(value) {
  return text(value)
    .toLowerCase()
    .replace(/"/g, '')
    .replace(/\bpublic\./g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function argumentValue(prefix) {
  const argument = process.argv.slice(2).find((value) => value.startsWith(`${prefix}=`))
  return argument ? argument.slice(prefix.length + 1) : ''
}

function hasColumns(columns, tableName, expected) {
  const actual = new Set(
    columns.filter((column) => column.table_name === tableName).map((column) => column.column_name),
  )
  return expected.every((column) => actual.has(column))
}

function hasRequiredConstraints(constraints) {
  return REQUIRED_CONSTRAINTS.every((requirement) => {
    const candidate = constraints.find((constraint) => (
      constraint.table_name === requirement.tableName &&
      constraint.constraint_name === requirement.constraintName
    ))
    const definition = normalizedDefinition(candidate?.definition)
    return Boolean(candidate) &&
      candidate.constraint_type === requirement.constraintType &&
      candidate.is_validated === true &&
      requirement.definitionIncludes.every((fragment) => definition.includes(fragment))
  })
}

function hasRequiredIndexes(indexes) {
  return REQUIRED_INDEXES.every((requirement) => {
    const candidate = indexes.find((index) => index.index_name === requirement.indexName)
    const definition = normalizedDefinition(candidate?.definition)
    return Boolean(candidate) &&
      candidate.is_unique === false &&
      candidate.is_valid === true &&
      candidate.is_ready === true &&
      requirement.definitionIncludes.every((fragment) => definition.includes(fragment))
  })
}

function hasRequiredTablePrivileges(privileges) {
  return REQUIRED_TABLE_PRIVILEGES.every((requirement) => {
    const candidate = privileges.find((privilege) => privilege.table_name === requirement.tableName)
    return Boolean(candidate) &&
      candidate.role_exists === true &&
      requirement.privileges.every((privilege) => candidate[privilege] === true)
  })
}

function hasRequiredSequencePrivileges(sequencePrivileges) {
  const sequence = sequencePrivileges.find((candidate) => candidate.sequence_name === AUDIT_SEQUENCE_NAME)
  return Boolean(sequence) && sequence.role_exists === true && sequence.can_usage === true && sequence.can_select === true
}

async function inspectSchema(client) {
  const [
    targetResult,
    relationsResult,
    columnsResult,
    indexesResult,
    constraintsResult,
    tablePrivilegesResult,
    sequencePrivilegesResult,
    portalAppRoleResult,
  ] = await Promise.all([
    client.query('select current_database() as database_name, current_user as database_user, current_schema() as schema_name'),
    client.query(
      `select
         to_regclass('public.organizations')::text as organizations,
         to_regclass('public.organization_member')::text as organization_member,
         to_regclass('public.worker')::text as worker,
         to_regclass('public.facility_manager_object')::text as facility_manager_object,
         to_regclass('public.facility_manager_object_audit')::text as facility_manager_object_audit`,
    ),
    client.query(
      `select table_name, column_name, data_type, udt_name, is_nullable, character_maximum_length
         from information_schema.columns
        where table_schema = 'public'
          and table_name = any($1::text[])
        order by table_name, ordinal_position`,
      [[
        'organizations',
        'organization_member',
        'worker',
        'facility_manager_object',
        'facility_manager_object_audit',
      ]],
    ),
    client.query(
      `select i.relname as index_name,
              x.indisunique as is_unique,
              x.indisvalid as is_valid,
              x.indisready as is_ready,
              pg_get_indexdef(x.indexrelid) as definition
         from pg_class i
         join pg_namespace n on n.oid = i.relnamespace
         join pg_index x on x.indexrelid = i.oid
        where n.nspname = 'public'
          and i.relname = any($1::text[])
        order by i.relname`,
      [REQUIRED_INDEXES.map((index) => index.indexName)],
    ),
    client.query(
      `select relation.relname as table_name,
              constraint_row.conname as constraint_name,
              constraint_row.contype as constraint_type,
              constraint_row.convalidated as is_validated,
              pg_get_constraintdef(constraint_row.oid, true) as definition
         from pg_constraint constraint_row
         join pg_class relation on relation.oid = constraint_row.conrelid
         join pg_namespace namespace_row on namespace_row.oid = relation.relnamespace
        where namespace_row.nspname = 'public'
          and relation.relname = any($1::text[])
        order by relation.relname, constraint_row.conname`,
      [['facility_manager_object', 'facility_manager_object_audit']],
    ),
    client.query(
      `with portal_app_role as (
         select oid from pg_roles where rolname = 'portal_app'
       )
       select relation.relname as table_name,
              portal_app_role.oid is not null as role_exists,
              case when portal_app_role.oid is null then false else has_table_privilege(portal_app_role.oid, relation.oid, 'SELECT') end as can_select,
              case when portal_app_role.oid is null then false else has_table_privilege(portal_app_role.oid, relation.oid, 'INSERT') end as can_insert,
              case when portal_app_role.oid is null then false else has_table_privilege(portal_app_role.oid, relation.oid, 'UPDATE') end as can_update
         from pg_class relation
         join pg_namespace namespace_row on namespace_row.oid = relation.relnamespace
         left join portal_app_role on true
        where namespace_row.nspname = 'public'
          and relation.relname = any($1::text[])
        order by relation.relname`,
      [REQUIRED_TABLE_PRIVILEGES.map((privilege) => privilege.tableName)],
    ),
    client.query(
      `with portal_app_role as (
         select oid from pg_roles where rolname = 'portal_app'
       )
       select relation.relname as sequence_name,
              portal_app_role.oid is not null as role_exists,
              case when portal_app_role.oid is null then false else has_sequence_privilege(portal_app_role.oid, relation.oid, 'USAGE') end as can_usage,
              case when portal_app_role.oid is null then false else has_sequence_privilege(portal_app_role.oid, relation.oid, 'SELECT') end as can_select
         from pg_class relation
         join pg_namespace namespace_row on namespace_row.oid = relation.relnamespace
         left join portal_app_role on true
        where namespace_row.nspname = 'public'
          and relation.relkind = 'S'
          and relation.relname = $1::text`,
      [AUDIT_SEQUENCE_NAME],
    ),
    client.query(`select exists (select 1 from pg_roles where rolname = 'portal_app') as exists`),
  ])

  const relations = relationsResult.rows[0] || {}
  const columns = columnsResult.rows || []
  const indexes = indexesResult.rows || []
  const constraints = constraintsResult.rows || []
  const tablePrivileges = tablePrivilegesResult.rows || []
  const sequencePrivileges = sequencePrivilegesResult.rows || []
  const portalAppRoleExists = portalAppRoleResult.rows?.[0]?.exists === true
  const baseReady = ['organizations', 'organization_member', 'worker'].every((name) => Boolean(relations[name])) &&
    hasColumns(columns, 'organizations', ['org_id', 'organization_kind']) &&
    hasColumns(columns, 'organization_member', ['org_id', 'uid', 'worker_id', 'role', 'status']) &&
    hasColumns(columns, 'worker', ['org_id', 'worker_id', 'auth_uid', 'active', 'status'])
  const objectColumnsReady = hasColumns(columns, 'facility_manager_object', [
    'org_id', 'object_id', 'name', 'address_line_1', 'postal_code', 'city', 'reference',
    'status', 'version', 'created_at', 'created_by_uid', 'updated_at', 'updated_by_uid',
    'archived_at', 'archived_by_uid', 'create_request_key', 'create_payload_fingerprint',
  ])
  const auditColumnsReady = hasColumns(columns, 'facility_manager_object_audit', [
    'audit_id', 'org_id', 'object_id', 'action', 'actor_uid', 'occurred_at',
  ])
  const constraintsReady = hasRequiredConstraints(constraints)
  const indexesReady = hasRequiredIndexes(indexes)
  const grantsReady = hasRequiredTablePrivileges(tablePrivileges) && hasRequiredSequencePrivileges(sequencePrivileges)

  return {
    target: targetResult.rows[0] || {},
    relations,
    columns,
    indexes,
    constraints,
    tablePrivileges,
    sequencePrivileges,
    portalAppRoleExists,
    baseReady,
    constraintsReady,
    indexesReady,
    grantsReady,
    schemaReady: baseReady &&
      Boolean(relations.facility_manager_object) &&
      Boolean(relations.facility_manager_object_audit) &&
      objectColumnsReady && auditColumnsReady && constraintsReady && indexesReady && grantsReady,
  }
}

async function inspectSchemaReadOnly(client) {
  await client.query('BEGIN TRANSACTION READ ONLY')
  try {
    return await inspectSchema(client)
  } finally {
    await client.query('ROLLBACK').catch(() => {})
  }
}

function assertExpectedProject(projectId) {
  if (projectId !== EXPECTED_PROJECT_ID) {
    throw new Error(`PROJECT_MISMATCH:${projectId || '<missing>'}`)
  }
}

function assertProductionConfirmation(audit) {
  if (audit) return
  if (argumentValue('--confirm-production') !== PRODUCTION_CONFIRMATION) {
    throw new Error(`PRODUCTION_CONFIRMATION_REQUIRED:--confirm-production=${PRODUCTION_CONFIRMATION}`)
  }
}

function assertExpectedDatabase(schema) {
  if (schema?.target?.database_name !== EXPECTED_DATABASE_NAME) {
    throw new Error(`DATABASE_MISMATCH:${schema?.target?.database_name || '<missing>'}`)
  }
}

async function setMigrationTimeouts(client) {
  await client.query(
    `select set_config('lock_timeout', $1::text, false), set_config('statement_timeout', $2::text, false)`,
    [MIGRATION_LOCK_TIMEOUT, MIGRATION_STATEMENT_TIMEOUT],
  )
}

async function main() {
  const apply = process.argv.includes('--apply')
  const explicitAudit = process.argv.includes('--audit')
  if (apply && explicitAudit) throw new Error('MODE_CONFLICT:choose --audit or --apply')
  const audit = !apply

  await loadSecretManagerDatabaseConfig()
  const projectId = text(
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    EXPECTED_PROJECT_ID,
  )
  assertExpectedProject(projectId)
  assertProductionConfirmation(audit)

  const { pool, connector } = await createPool()
  let client = null
  try {
    client = await pool.connect()
    const before = await inspectSchemaReadOnly(client)
    assertExpectedDatabase(before)
    console.log(JSON.stringify({ mode: audit ? 'audit' : 'apply', before }, null, 2))
    if (audit) return
    if (!before.baseReady) throw new Error('FACILITY_MANAGER_OBJECT_BASE_SCHEMA_NOT_READY')
    if (!before.portalAppRoleExists) throw new Error('FACILITY_MANAGER_OBJECT_RUNTIME_ROLE_NOT_READY')

    await setMigrationTimeouts(client)
    for (const fileName of MIGRATION_FILES) {
      const sql = fs.readFileSync(path.join(rootDir, 'dataconnect', 'migrations', fileName), 'utf8')
      await client.query(sql)
      console.log(`Applied ${fileName}`)
    }

    const after = await inspectSchemaReadOnly(client)
    if (!after.schemaReady) {
      const error = new Error('FACILITY_MANAGER_OBJECT_SCHEMA_NOT_READY')
      error.details = after
      throw error
    }
    console.log(JSON.stringify({ mode: 'postflight', after }, null, 2))
  } finally {
    if (client) client.release()
    await pool.end()
    if (connector) connector.close()
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Facility-manager object migration failed:', text(error?.code || error?.message || error))
    if (error?.details) console.error(JSON.stringify(error.details, null, 2))
    process.exitCode = 1
  })
}

module.exports = {
  AUDIT_SEQUENCE_NAME,
  EXPECTED_DATABASE_NAME,
  EXPECTED_PROJECT_ID,
  MIGRATION_FILES,
  MIGRATION_LOCK_TIMEOUT,
  MIGRATION_STATEMENT_TIMEOUT,
  PRODUCTION_CONFIRMATION,
  REQUIRED_CONSTRAINTS,
  REQUIRED_INDEXES,
  hasColumns,
  hasRequiredConstraints,
  hasRequiredIndexes,
  hasRequiredSequencePrivileges,
  hasRequiredTablePrivileges,
  inspectSchema,
  inspectSchemaReadOnly,
  normalizedDefinition,
}
