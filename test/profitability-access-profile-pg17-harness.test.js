'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const harnessSource = fs.readFileSync(
  path.join(__dirname, '..', 'scripts', 'test-profitability-access-profile-pg17.js'),
  'utf8',
)

test('Access Profile PG17 harness is local-only and has no external effects', () => {
  assert.match(harnessSource, /const BACKUP_REFERENCE = 'local-access-profile-harness-20260927'/)
  assert.match(harnessSource, /production: false/)
  assert.match(harnessSource, /deploy: false/)
  assert.match(harnessSource, /notifications: false/)
  assert.match(harnessSource, /downstream: false/)
  for (const tableName of [
    'organization_access_profile',
    'profitability_access_enforcement',
    'profitability_target_history',
    'service_object_assignment',
  ]) assert.match(harnessSource, new RegExp(`'${tableName}'`))
})

test('Access Profile PG17 harness covers first apply, replay, partial state, owners and ACL drift', () => {
  const source = harnessSource
  for (const required of [
    'foundation.runHarness',
    'profitability_access_expected_executor',
    'foundation.MIGRATION_EXECUTOR_ROLE',
    'profitability_access_expected_provisioner',
    'foundation.PROVISIONER_ROLE',
    'profitability_access_expected_bootstrap_grantor',
    'foundation.BOOTSTRAP_ROLE',
    'profitability_access_expected_migration_runner',
    'foundation.MIGRATION_RUNNER_ROLE',
    'profitability_access_owner_role',
    'foundation.OWNER_ROLE',
    'profitability_access_session_role',
    'foundation.SESSION_ROLE',
    'profitability_access_runtime_role',
    'foundation.RUNTIME_ROLE',
    'assertRawMigrationRequiresGuard',
    'assertExactOwnersAclAndNoSeeds',
    'PROFITABILITY_ACCESS_V2_PARTIAL_TARGET:9\\/10',
    'PROFITABILITY_ACCESS_V2_REPLAY_RELATION_ACL_MISMATCH',
    'PROFITABILITY_ACCESS_V2_MEMBERSHIP_GRAPH_INVALID',
    'grant profitability_owner to profitability_runtime',
    'unsafe-runtime-to-owner-role-graph-drift-rejected',
    'alter role profitability_migration_executor inherit',
    'PROFITABILITY_ACCESS_V2_EXECUTOR_ROLE_INVALID',
    'unsafe-executor-role-attribute-drift-rejected',
    'Rejected ACL replay silently repaired the drift.',
    'PROFITABILITY_ACCESS_V2_REPLAY_COLUMN_ACL_MISMATCH',
    'grant select (finance_profile)',
    'Rejected column-ACL replay silently repaired the drift.',
    'column-acl-drift-rejected-without-repair',
    'access-profile-v2-first-apply',
    'access-profile-v2-idempotent-replay',
  ]) {
    assert.ok(source.includes(required), `Missing Access Profile harness marker: ${required}`)
  }
  assert.doesNotMatch(source, /process\.env\.DATABASE_URL/)
  assert.doesNotMatch(source, /\bgcloud\b|\bfirebase\b/i)
})

test('PowerShell runner uses only a random loopback PG17 cluster and guarded cleanup', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'test-profitability-access-profile-pg17.ps1'),
    'utf8',
  )
  for (const required of [
    "C:\\Program Files\\PostgreSQL\\17\\bin\\initdb.exe",
    "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_ctl.exe",
    "C:\\Program Files\\PostgreSQL\\17\\bin\\createdb.exe",
    "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe",
    "'127.0.0.1'",
    'TcpListener',
    '$candidate -eq 5432',
    "$ServerLogPath = Join-Path $DataDirectory 'postgresql.log'",
    "'-l', $ServerLogPath",
    '$SmokeSucceeded -and $ServerStopped',
    'ReparsePoint',
    'EPHEMERAL_DATA_PRESERVED_FOR_DIAGNOSIS',
  ]) {
    assert.ok(source.includes(required), `Missing PowerShell safety marker: ${required}`)
  }
  assert.doesNotMatch(source, /\bgcloud\b|\bfirebase\b/i)
  assert.doesNotMatch(source, /\$env:DATABASE_URL/)
})
