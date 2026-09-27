#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { Client } = require('pg')
const {
  manifestSha256,
  normalizeManifest,
  runProvisioning,
} = require('./lib/profitability-access-v2-provisioning')
const { SOURCE_OWNER_ROLE } = require('./lib/profitability-service-object-catalog-seed')

const EXPECTED_DATABASE = 'iclean-room-database'
const EXPECTED_SESSION_ROLE = 'profitability_migration_executor'
const EXPECTED_SOURCE_READER_ROLE = 'biuro@bestclean.pl'
const EXPECTED_SOURCE_CURRENT_ROLE = SOURCE_OWNER_ROLE
const ACTIVATE_CONFIRMATION = 'ACTIVATE_PROFITABILITY_ACCESS_PROFILE_V2'
const MAX_MANIFEST_BYTES = 1024 * 1024
const MAX_CATALOG_VERIFICATION_BYTES = 16 * 1024

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
  const selected = ['audit', 'apply', 'verify', 'activate']
    .filter((mode) => process.argv.includes(`--${mode}`))
  if (selected.length > 1) throw new Error('ONLY_ONE_MODE_ALLOWED')
  return selected[0] || 'audit'
}

function readManifest() {
  const configuredPath = readOption('manifest')
  if (!configuredPath) throw new Error('MANIFEST_PATH_REQUIRED')
  const manifestPath = path.resolve(configuredPath)
  const stat = fs.statSync(manifestPath)
  if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_MANIFEST_BYTES) {
    throw new Error('MANIFEST_FILE_INVALID')
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
}

function readCatalogVerification(mode) {
  if (mode !== 'activate') return undefined
  const configuredPath = readOption('catalog-verification')
  if (!configuredPath) throw new Error('CATALOG_VERIFICATION_PATH_REQUIRED')
  const verificationPath = path.resolve(configuredPath)
  const stat = fs.statSync(verificationPath)
  if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_CATALOG_VERIFICATION_BYTES) {
    throw new Error('CATALOG_VERIFICATION_FILE_INVALID')
  }
  return JSON.parse(fs.readFileSync(verificationPath, 'utf8'))
}

function assertMutationConfirmation(mode, hash) {
  if (!['apply', 'activate'].includes(mode)) return
  if (readOption('confirm-manifest-sha256').toLowerCase() !== hash) {
    throw new Error('CONFIRM_MANIFEST_SHA256_MISMATCH')
  }
  if (mode === 'activate' && readOption('confirm-activate') !== ACTIVATE_CONFIRMATION) {
    throw new Error('ACTIVATE_CONFIRMATION_REQUIRED')
  }
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

async function assertDatabaseIdentity(
  client,
  expectedSessionRole = EXPECTED_SESSION_ROLE,
  expectedCurrentRole = expectedSessionRole,
) {
  const result = await client.query(
    `select current_database() as database_name,
            session_user as session_role,
            current_user as current_role,
            current_setting('server_version_num')::integer as server_version_num,
            pg_is_in_recovery() as in_recovery`,
  )
  const row = result.rows[0] || {}
  if (row.database_name !== EXPECTED_DATABASE) throw new Error('DATABASE_NAME_MISMATCH')
  if (row.session_role !== expectedSessionRole || row.current_role !== expectedCurrentRole) {
    throw new Error('DATABASE_SESSION_ROLE_MISMATCH')
  }
  if (Number(row.server_version_num) < 170000 || Number(row.server_version_num) >= 180000) {
    throw new Error('POSTGRESQL_17_REQUIRED')
  }
  if (row.in_recovery === true) throw new Error('PRIMARY_DATABASE_REQUIRED')
}

function safeError(error) {
  const candidate = text(error?.code || error?.message)
  return {
    ok: false,
    code: /^[A-Z0-9_]{3,160}$/.test(candidate) ? candidate : 'PROVISIONING_FAILED',
  }
}

async function main() {
  const mode = selectedMode()
  const manifest = normalizeManifest(readManifest())
  const catalogVerification = readCatalogVerification(mode)
  const hash = manifestSha256(manifest)
  assertMutationConfirmation(mode, hash)

  const client = new Client({
    application_name: 'cleanzi-profitability-access-v2-provisioning',
    statement_timeout: 30000,
    query_timeout: 35000,
  })
  const sourceClient = new Client({
    ...sourceClientConfig(),
    application_name: 'cleanzi-profitability-access-v2-source-verifier',
    statement_timeout: 30000,
    query_timeout: 35000,
  })
  await Promise.all([client.connect(), sourceClient.connect()])
  try {
    await assertDatabaseIdentity(client)
    await sourceClient.query(`set role "${EXPECTED_SOURCE_CURRENT_ROLE.replaceAll('"', '""')}"`)
    await assertDatabaseIdentity(
      sourceClient,
      EXPECTED_SOURCE_READER_ROLE,
      EXPECTED_SOURCE_CURRENT_ROLE,
    )
    const result = await runProvisioning({
      client, sourceClient, manifest, mode, catalogVerification,
    })
    process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`)
    if (['audit', 'verify'].includes(mode) && !result.exact) process.exitCode = 2
  } finally {
    await Promise.allSettled([client.end(), sourceClient.end()])
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify(safeError(error))}\n`)
    process.exitCode = 1
  })
}

module.exports = {
  ACTIVATE_CONFIRMATION,
  EXPECTED_DATABASE,
  EXPECTED_SESSION_ROLE,
  EXPECTED_SOURCE_READER_ROLE,
  EXPECTED_SOURCE_CURRENT_ROLE,
  assertDatabaseIdentity,
  assertMutationConfirmation,
  readCatalogVerification,
  selectedMode,
  sourceClientConfig,
}
