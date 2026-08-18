'use strict'

const fs = require('node:fs')
const path = require('node:path')

const rootDir = path.resolve(__dirname, '..')
const EXPECTED_PROJECT_ID = 'iclean-room'
const EXPECTED_DATABASE_NAME = 'iclean-room-database'
const PRODUCTION_CONFIRMATION = 'CLZ-DB-20260811-TASK-LIFECYCLE-01'
const MIGRATION_FILE = '20260727_task_lifecycle_additive.sql'

function text(value) {
  return String(value ?? '').trim()
}

function argumentValue(prefix, args = process.argv.slice(2)) {
  const argument = args.find((value) => value.startsWith(`${prefix}=`))
  return argument ? argument.slice(prefix.length + 1) : ''
}

function resolveMode(args = process.argv.slice(2)) {
  const apply = args.includes('--apply')
  const explicitAudit = args.includes('--audit')
  if (apply && explicitAudit) {
    throw new Error('MODE_CONFLICT:choose --audit or --apply')
  }
  return apply ? 'apply' : 'audit'
}

function assertProductionConfirmation({ mode, projectId, args }) {
  if (mode === 'audit') return

  const confirmation = argumentValue('--confirm-production', args)
  if (projectId !== EXPECTED_PROJECT_ID) {
    throw new Error(`PROJECT_MISMATCH:${projectId || '<missing>'}`)
  }
  if (confirmation !== PRODUCTION_CONFIRMATION) {
    throw new Error(
      `PRODUCTION_CONFIRMATION_REQUIRED:--confirm-production=${PRODUCTION_CONFIRMATION}`,
    )
  }
}

async function inspectTaskLifecycleSchema(client) {
  const targetResult = await client.query(
    `select current_database() as database_name,
            current_user as database_user,
            current_schema() as schema_name`,
  )
  const schemaResult = await client.query(
    `with target as (
       select to_regclass('public.task') as task_oid
     )
     select
       target.task_oid::text as task,
       exists (
         select 1
           from information_schema.columns
          where table_schema = 'public'
            and table_name = 'task'
            and column_name = 'lifecycle_status'
            and data_type = 'character varying'
            and character_maximum_length = 20
            and is_nullable = 'NO'
            and position('ACTIVE' in coalesce(column_default, '')) > 0
       ) as lifecycle_status,
       exists (
         select 1
           from information_schema.columns
          where table_schema = 'public'
            and table_name = 'task'
            and column_name = 'cancelled_at'
            and data_type = 'timestamp with time zone'
       ) as cancelled_at,
       exists (
         select 1
           from information_schema.columns
          where table_schema = 'public'
            and table_name = 'task'
            and column_name = 'archived_at'
            and data_type = 'timestamp with time zone'
       ) as archived_at,
       exists (
         select 1
           from pg_constraint
          where target.task_oid is not null
            and conrelid = target.task_oid
            and conname = 'task_lifecycle_status_check'
            and convalidated
       ) as lifecycle_status_check,
       exists (
         select 1
           from pg_indexes
          where schemaname = 'public'
            and tablename = 'task'
            and indexname = 'task_org_lifecycle_date_idx'
       ) as lifecycle_index
     from target`,
  )
  const schema = schemaResult.rows[0]
  let counts = { tasks: null, tasksWithoutLifecycleStatus: null, lifecycleStatuses: [] }

  if (schema.task && schema.lifecycle_status) {
    const countsResult = await client.query(
      `select count(*)::integer as tasks,
              count(*) filter (where lifecycle_status is null)::integer as "tasksWithoutLifecycleStatus",
              coalesce(array_agg(distinct lifecycle_status order by lifecycle_status)
                filter (where lifecycle_status is not null), '{}') as "lifecycleStatuses"
         from public.task`,
    )
    counts = { ...counts, ...countsResult.rows[0] }
  }

  return {
    target: targetResult.rows[0],
    schema,
    counts,
    ready: Boolean(
      schema.task &&
      schema.lifecycle_status &&
      schema.cancelled_at &&
      schema.archived_at &&
      schema.lifecycle_status_check &&
      schema.lifecycle_index &&
      counts.tasksWithoutLifecycleStatus === 0,
    ),
  }
}

async function main() {
  const {
    createPool,
    loadSecretManagerDatabaseConfig,
  } = require('./migrate-worker-model')
  const args = process.argv.slice(2)
  const mode = resolveMode(args)
  const projectId = text(
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    EXPECTED_PROJECT_ID,
  )
  assertProductionConfirmation({ mode, projectId, args })

  await loadSecretManagerDatabaseConfig()
  const { pool, connector } = await createPool()
  let client = null
  try {
    client = await pool.connect()
    const before = await inspectTaskLifecycleSchema(client)
    console.log(JSON.stringify({ mode, before }, null, 2))

    if (mode === 'audit') return
    if (before.target.database_name !== EXPECTED_DATABASE_NAME) {
      throw new Error(
        `DATABASE_MISMATCH:${before.target.database_name || '<missing>'}`,
      )
    }

    const sql = fs.readFileSync(
      path.join(rootDir, 'dataconnect', 'migrations', MIGRATION_FILE),
      'utf8',
    )
    await client.query(sql)
    console.log(`Applied ${MIGRATION_FILE}`)

    const after = await inspectTaskLifecycleSchema(client)
    if (!after.ready) {
      const error = new Error('TASK_LIFECYCLE_SCHEMA_NOT_READY')
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
    console.error(
      'Task lifecycle migration failed:',
      text(error?.code || error?.message || error),
    )
    if (error?.details) {
      console.error(JSON.stringify(error.details, null, 2))
    }
    process.exitCode = 1
  })
}

module.exports = {
  EXPECTED_DATABASE_NAME,
  EXPECTED_PROJECT_ID,
  MIGRATION_FILE,
  PRODUCTION_CONFIRMATION,
  assertProductionConfirmation,
  inspectTaskLifecycleSchema,
  resolveMode,
}
