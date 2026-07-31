'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { createPool, loadSecretManagerDatabaseConfig } = require('../../scripts/migrate-worker-model')
const { inspectCleanziAdminSchema } = require('../backend/platform-admin-repository')

const rootDir = path.resolve(__dirname, '..', '..')
const migrationDir = path.join(rootDir, 'Cleanzi-admin', 'migrations')
const migrationFiles = [
  '20260721_cleanzi_admin_billing.sql',
  '20260731_portal_plans_onboarding.sql',
]

function text(value) {
  return String(value ?? '').trim()
}

function checksum(sql) {
  return crypto.createHash('sha256').update(sql).digest('hex')
}

async function audit(client) {
  const readiness = await inspectCleanziAdminSchema(client)
  const subscriptionColumns = await client.query(
    `select column_name, data_type, is_nullable, column_default
       from information_schema.columns
      where table_schema = 'public' and table_name = 'organization_subscription'
      order by ordinal_position`,
  )
  console.log(JSON.stringify({ readiness, organizationSubscriptionColumns: subscriptionColumns.rows }, null, 2))
}

async function applyMigrations(client) {
  await client.query('begin')
  try {
    await client.query(
      `create table if not exists public.platform_schema_migration (
         migration_name varchar(255) primary key,
         checksum varchar(64) not null,
         applied_at timestamptz not null default now()
       )`,
    )
    for (const fileName of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationDir, fileName), 'utf8')
      const sqlChecksum = checksum(sql)
      const current = await client.query(
        `select checksum from public.platform_schema_migration where migration_name = $1::text for update`,
        [fileName],
      )
      if (current.rows[0]) {
        if (text(current.rows[0].checksum) !== sqlChecksum) {
          throw new Error(`MIGRATION_CHECKSUM_MISMATCH:${fileName}`)
        }
        console.log(`[cleanzi-admin] migration already applied: ${fileName}`)
        continue
      }
      await client.query(sql)
      await client.query(
        `insert into public.platform_schema_migration (migration_name, checksum, applied_at)
         values ($1::text, $2::text, now())`,
        [fileName, sqlChecksum],
      )
      console.log(`[cleanzi-admin] migration applied: ${fileName}`)
    }
    await client.query('commit')
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  }
}

async function main() {
  const auditOnly = process.argv.includes('--audit')
  const apply = process.argv.includes('--apply')
  if (!auditOnly && !apply) {
    throw new Error('Użycie: node Cleanzi-admin/scripts/migrate.js --audit lub --apply')
  }
  await loadSecretManagerDatabaseConfig()
  const { pool, connector } = await createPool()
  let client
  try {
    client = await pool.connect()
    if (auditOnly) await audit(client)
    else await applyMigrations(client)
  } finally {
    client?.release?.()
    await pool.end()
    connector?.close?.()
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[cleanzi-admin] migration failed:', text(error?.message || error))
    process.exitCode = 1
  })
}

module.exports = { applyMigrations, audit, checksum, migrationFiles }
