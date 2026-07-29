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
const PRODUCTION_CONFIRMATION = 'CLZ-DB-20260728-JOBCARD-PHOTO-01'
const MIGRATION_FILES = [
  '20260728_job_card_publication_additive.sql',
  '20260728_worker_photo_url_additive.sql',
]

function text(value) {
  return String(value ?? '').trim()
}

function argumentValue(prefix) {
  const argument = process.argv.slice(2).find((value) => value.startsWith(`${prefix}=`))
  return argument ? argument.slice(prefix.length + 1) : ''
}

async function inspectSchema(client) {
  const targetResult = await client.query(
    `select current_database() as database_name,
            current_user as database_user,
            current_schema() as schema_name`,
  )
  const schemaResult = await client.query(
    `select
       to_regclass('public.job_card_draft')::text as job_card_draft,
       to_regclass('public.job_card_revision')::text as job_card_revision,
       exists (
         select 1
           from information_schema.columns
          where table_schema = 'public'
            and table_name = 'worker'
            and column_name = 'photo_url'
            and data_type = 'text'
            and is_nullable = 'YES'
            and column_default is null
       ) as worker_photo_url`,
  )
  const schema = schemaResult.rows[0]
  let counts = { drafts: null, revisions: null, workersWithPhotoUrl: null }

  if (schema.job_card_draft && schema.job_card_revision) {
    const jobCardCounts = await client.query(
      `select
         (select count(*)::integer from public.job_card_draft) as drafts,
         (select count(*)::integer from public.job_card_revision) as revisions`,
    )
    counts = { ...counts, ...jobCardCounts.rows[0] }
  }

  if (schema.worker_photo_url) {
    const photoCounts = await client.query(
      `select count(*) filter (where photo_url is not null)::integer as "workersWithPhotoUrl"
         from public.worker`,
    )
    counts = { ...counts, ...photoCounts.rows[0] }
  }

  return {
    target: targetResult.rows[0],
    schema,
    counts,
    ready: Boolean(
      schema.job_card_draft &&
      schema.job_card_revision &&
      schema.worker_photo_url
    ),
  }
}

function assertProductionConfirmation(audit, projectId) {
  if (audit) return

  const confirmation = argumentValue('--confirm-production')
  if (projectId !== EXPECTED_PROJECT_ID) {
    throw new Error(`PROJECT_MISMATCH:${projectId || '<missing>'}`)
  }
  if (confirmation !== PRODUCTION_CONFIRMATION) {
    throw new Error(
      `PRODUCTION_CONFIRMATION_REQUIRED:--confirm-production=${PRODUCTION_CONFIRMATION}`,
    )
  }
}

async function main() {
  const apply = process.argv.includes('--apply')
  const explicitAudit = process.argv.includes('--audit')
  if (apply && explicitAudit) {
    throw new Error('MODE_CONFLICT:choose --audit or --apply')
  }
  const audit = !apply

  await loadSecretManagerDatabaseConfig()
  const projectId = text(
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    EXPECTED_PROJECT_ID,
  )
  assertProductionConfirmation(audit, projectId)

  const { pool, connector } = await createPool()
  let client = null
  try {
    client = await pool.connect()
    const before = await inspectSchema(client)
    console.log(JSON.stringify({ mode: audit ? 'audit' : 'apply', before }, null, 2))

    if (audit) return
    if (before.target.database_name !== EXPECTED_DATABASE_NAME) {
      throw new Error(
        `DATABASE_MISMATCH:${before.target.database_name || '<missing>'}`,
      )
    }

    for (const fileName of MIGRATION_FILES) {
      const sql = fs.readFileSync(
        path.join(rootDir, 'dataconnect', 'migrations', fileName),
        'utf8',
      )
      await client.query(sql)
      console.log(`Applied ${fileName}`)
    }

    const after = await inspectSchema(client)
    if (!after.ready) {
      const error = new Error('JOB_CARD_PHOTO_SCHEMA_NOT_READY')
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
      'Job Card/photo migration failed:',
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
  MIGRATION_FILES,
  PRODUCTION_CONFIRMATION,
  inspectSchema,
}
