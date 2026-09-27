'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const harnessSource = fs.readFileSync(
  path.join(__dirname, '..', 'scripts', 'test-profitability-source-read-bridge-pg17.js'),
  'utf8',
)
const runnerSource = fs.readFileSync(
  path.join(__dirname, '..', 'scripts', 'test-profitability-source-read-bridge-pg17.ps1'),
  'utf8',
)

test('source-read harness is local-only and reports no external effects', () => {
  assert.match(harnessSource, /const BACKUP_REFERENCE = '1790505049269'/)
  assert.match(harnessSource, /production: false/)
  assert.match(harnessSource, /deploy: false/)
  assert.match(harnessSource, /notifications: false/)
  assert.match(harnessSource, /downstream: false/)
  assert.doesNotMatch(harnessSource, /process\.env\.DATABASE_URL/)
  assert.doesNotMatch(harnessSource, /\bgcloud\b|\bfirebase\b/i)
})

test('source-read harness covers direct execution, negative guards, partial, excess and replay', () => {
  for (const required of [
    'assertRawMigrationRequiresGuard',
    'PROFITABILITY_SOURCE_READ_APPROVED_DATABASE_MISMATCH',
    'PROFITABILITY_SOURCE_READ_EXECUTOR_MISMATCH',
    'PROFITABILITY_SOURCE_READ_SOURCE_OWNER_NAME_MISMATCH',
    'PROFITABILITY_SOURCE_READ_RUNTIME_ROLE_NAME_MISMATCH',
    'PROFITABILITY_SOURCE_READ_BACKUP_REFERENCE_INVALID',
    'PROFITABILITY_SOURCE_READ_CONFIRMATION_MISMATCH',
    'PROFITABILITY_SOURCE_READ_PARTIAL_STATE:1\\/15',
    'PROFITABILITY_SOURCE_READ_RUNTIME_ACL_EXCESS',
    'PROFITABILITY_SOURCE_READ_EFFECTIVE_ACL_EXCESS',
    'assertExactRuntimeAcl',
    'effectiveRuntimePrivilegeSummary',
    'grant select on table public.zone to public',
    'grant select (object_id) on table public.event to public',
    'with inherit true, set false',
    'public-table-select-rejected-without-repair',
    'public-excess-column-rejected-without-repair',
    'inherited-duplicate-column-acl-rejected-without-repair',
    'other-role-acl-preserved',
    'source-data-unchanged',
    'idempotent-replay',
  ]) {
    assert.ok(harnessSource.includes(required), `Missing PG17 harness marker: ${required}`)
  }
})

test('PowerShell runner is random-loopback PG17 only with guarded cleanup', () => {
  for (const required of [
    'C:\\Program Files\\PostgreSQL\\17\\bin\\initdb.exe',
    'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_ctl.exe',
    'C:\\Program Files\\PostgreSQL\\17\\bin\\createdb.exe',
    'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe',
    "'127.0.0.1'",
    'TcpListener',
    '$candidate -eq 5432',
    "$ServerLogPath = Join-Path $DataDirectory 'postgresql.log'",
    '$SmokeSucceeded -and $ServerStopped',
    'ReparsePoint',
    'EPHEMERAL_DATA_PRESERVED_FOR_DIAGNOSIS',
  ]) {
    assert.ok(runnerSource.includes(required), `Missing local runner marker: ${required}`)
  }
  assert.doesNotMatch(runnerSource, /\bgcloud\b|\bfirebase\b/i)
  assert.doesNotMatch(runnerSource, /\$env:DATABASE_URL/)
})
