#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { Client } = require('pg')
const {
  EXPECTED_ORG_ID,
  SOURCE_OWNER_ROLE,
  canonicalStringify,
  runCatalogSeed,
} = require('./lib/profitability-service-object-catalog-seed')

const EXPECTED_DATABASE = 'iclean-room-database'
const EXPECTED_TARGET_SESSION_ROLE = 'profitability_migration_executor'
const EXPECTED_SOURCE_SESSION_ROLE = 'biuro@bestclean.pl'
const EXPECTED_SOURCE_CURRENT_ROLE = SOURCE_OWNER_ROLE

function text(value) {
  return String(value ?? '').trim()
}

function readOption(name) {
  const prefix = `--${name}=`
  const inline = process.argv.find((argument) => argument.startsWith(prefix))
  if (inline) return text(inline.slice(prefix.length))
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? text(process.argv[index + 1]) : ''
}

function selectedMode() {
  const selected = ['audit', 'apply', 'verify']
    .filter((mode) => process.argv.includes(`--${mode}`))
  if (selected.length > 1) throw new Error('ONLY_ONE_MODE_ALLOWED')
  return selected[0] || 'audit'
}

function assertOrgId() {
  const orgId = readOption('org') || EXPECTED_ORG_ID
  if (orgId !== EXPECTED_ORG_ID) throw new Error('ORG_NOT_ALLOWLISTED')
  return orgId
}

function assertApplyConfirmation(mode, hash) {
  if (mode !== 'apply') return
  if (readOption('confirm-manifest-sha256').toLowerCase() !== hash) {
    throw new Error('CONFIRM_MANIFEST_SHA256_MISMATCH')
  }
}

function applyConfirmationHash() {
  return readOption('confirm-manifest-sha256').toLowerCase()
}

function sourceClientConfig(environment = process.env) {
  const connectionString = text(environment.PROFITABILITY_SOURCE_DATABASE_URL)
  if (connectionString) return { connectionString }
  const user = text(environment.PROFITABILITY_SOURCE_PGUSER)
  const password = text(environment.PROFITABILITY_SOURCE_PGPASSWORD)
  const host = text(environment.PROFITABILITY_SOURCE_PGHOST || environment.PGHOST)
  const database = text(environment.PROFITABILITY_SOURCE_PGDATABASE || environment.PGDATABASE)
  const port = Number(environment.PROFITABILITY_SOURCE_PGPORT || environment.PGPORT || 5432)
  if (!user || !password || !host || !database || !Number.isInteger(port)) {
    throw new Error('SOURCE_READER_CONNECTION_REQUIRED')
  }
  return { user, password, host, database, port }
}

async function assertDatabaseIdentity(client, expectedSessionRole, expectedCurrentRole = expectedSessionRole) {
  const result = await client.query(
    `select current_database() as database_name,
            session_user as session_role,
            current_user as current_role,
            current_setting('server_version_num')::integer as server_version_num,
            pg_is_in_recovery() as in_recovery`,
  )
  const row = result.rows?.[0] || {}
  if (row.database_name !== EXPECTED_DATABASE) throw new Error('DATABASE_NAME_MISMATCH')
  if (row.session_role !== expectedSessionRole || row.current_role !== expectedCurrentRole) {
    throw new Error('DATABASE_SESSION_ROLE_MISMATCH')
  }
  if (Number(row.server_version_num) < 170000 || Number(row.server_version_num) >= 180000) {
    throw new Error('POSTGRESQL_17_REQUIRED')
  }
  if (row.in_recovery === true) throw new Error('PRIMARY_DATABASE_REQUIRED')
}

function writeManifestIfRequested(manifest) {
  const configuredPath = readOption('manifest-out')
  if (!configuredPath) return null
  const manifestPath = path.resolve(configuredPath)
  const handle = fs.openSync(manifestPath, 'wx', 0o600)
  try {
    fs.writeFileSync(handle, `${canonicalStringify(manifest)}\n`, { encoding: 'utf8' })
  } finally {
    fs.closeSync(handle)
  }
  return manifestPath
}

function safeError(error) {
  const candidate = text(error?.code || error?.message)
  return {
    ok: false,
    code: /^[A-Z0-9_]{3,160}$/.test(candidate) ? candidate : 'CATALOG_SEED_FAILED',
  }
}

async function main() {
  const mode = selectedMode()
  const orgId = assertOrgId()
  const targetClient = new Client({
    application_name: 'cleanzi-profitability-service-object-seed-target',
    statement_timeout: 30000,
    query_timeout: 35000,
  })
  const sourceClient = new Client({
    ...sourceClientConfig(),
    application_name: 'cleanzi-profitability-service-object-seed-source',
    statement_timeout: 30000,
    query_timeout: 35000,
  })
  await Promise.all([targetClient.connect(), sourceClient.connect()])
  try {
    await assertDatabaseIdentity(targetClient, EXPECTED_TARGET_SESSION_ROLE)
    await sourceClient.query(`set role "${EXPECTED_SOURCE_CURRENT_ROLE.replaceAll('"', '""')}"`)
    await assertDatabaseIdentity(
      sourceClient,
      EXPECTED_SOURCE_SESSION_ROLE,
      EXPECTED_SOURCE_CURRENT_ROLE,
    )

    if (mode === 'apply') {
      const audit = await runCatalogSeed({ targetClient, sourceClient, orgId, mode: 'audit' })
      assertApplyConfirmation(mode, audit.manifestSha256)
    }

    const result = await runCatalogSeed({
      targetClient,
      sourceClient,
      orgId,
      mode,
      expectedManifestSha256: mode === 'apply' ? applyConfirmationHash() : '',
    })
    const manifestPath = writeManifestIfRequested(result.manifest)
    const { manifest, ...safeResult } = result
    process.stdout.write(`${JSON.stringify({
      ok: true,
      ...safeResult,
      manifestWritten: Boolean(manifestPath),
    })}\n`)
    if (['audit', 'verify'].includes(mode) && !result.exact) process.exitCode = 2
  } finally {
    await Promise.allSettled([targetClient.end(), sourceClient.end()])
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify(safeError(error))}\n`)
    process.exitCode = 1
  })
}

module.exports = {
  EXPECTED_DATABASE,
  EXPECTED_SOURCE_CURRENT_ROLE,
  EXPECTED_SOURCE_SESSION_ROLE,
  EXPECTED_TARGET_SESSION_ROLE,
  applyConfirmationHash,
  assertApplyConfirmation,
  assertDatabaseIdentity,
  assertOrgId,
  safeError,
  selectedMode,
  sourceClientConfig,
  writeManifestIfRequested,
}
