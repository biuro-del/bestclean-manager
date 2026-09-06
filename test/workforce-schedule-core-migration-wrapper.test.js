'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')
const wrapperPath = path.join(
  root,
  'dataconnect',
  'admin',
  '20260906_workforce_schedule_core_apply.psql',
)
const migrationPath = path.join(
  root,
  'dataconnect',
  'migrations',
  '20260906_workforce_schedule_core_additive.sql',
)
const runbookPath = path.join(
  root,
  'docs',
  'workforce-schedule-core-migration.md',
)
const harnessPath = path.join(root, 'scripts', 'test-workforce-schedule-pg17.js')

const wrapper = fs.readFileSync(wrapperPath, 'utf8')
const migration = fs.readFileSync(migrationPath, 'utf8')
const runbook = fs.readFileSync(runbookPath, 'utf8')
const harness = fs.readFileSync(harnessPath, 'utf8')
const includeStatement = '\\ir ../migrations/20260906_workforce_schedule_core_additive.sql'
const entrypointMarker = 'GUARDED_WORKFORCE_SCHEDULE_CORE_20260906'

test('wrapper wymaga wszystkich jawnych parametrów i dokładnego celu', () => {
  assert.match(wrapper, /\\set ON_ERROR_STOP on/)

  for (const variableName of [
    'workforce_schedule_expected_database',
    'workforce_schedule_expected_migration_runner',
    'workforce_schedule_core_confirmation',
  ]) {
    assert.match(wrapper, new RegExp(`\\\\if :\\{\\?${variableName}\\}`))
  }

  assert.match(
    wrapper,
    /:'workforce_schedule_expected_database' = 'iclean-room-database'/,
  )
  assert.match(
    wrapper,
    /current_database\(\) = :'workforce_schedule_expected_database'/,
  )
  assert.match(
    wrapper,
    /:'workforce_schedule_expected_migration_runner' = 'migration_runner'/,
  )
  assert.match(
    wrapper,
    /session_user = :'workforce_schedule_expected_migration_runner'[\s\S]*?current_user = session_user/,
  )
  assert.match(wrapper, /APPLY_WORKFORCE_SCHEDULE_CORE_ONLY_20260906/)
})

test('wrapper akceptuje wyłącznie PG17 primary i sesję read-write', () => {
  assert.match(
    wrapper,
    /current_setting\('server_version_num'\)::integer between 170000 and 179999/,
  )
  assert.match(wrapper, /not pg_is_in_recovery\(\)/)
  assert.match(wrapper, /current_setting\('transaction_read_only'\) = 'off'/)
  assert.match(wrapper, /current_setting\('default_transaction_read_only'\) = 'off'/)
  assert.match(wrapper, /WORKFORCE_SCHEDULE_POSTGRESQL_17_REQUIRED/)
  assert.match(wrapper, /WORKFORCE_SCHEDULE_PRIMARY_DATABASE_REQUIRED/)
  assert.match(wrapper, /WORKFORCE_SCHEDULE_READ_WRITE_SESSION_REQUIRED/)
})

test('raw SQL jest dołączany dokładnie raz i dopiero po wszystkich bramkach', () => {
  const includePosition = wrapper.indexOf(includeStatement)
  assert.notEqual(includePosition, -1)
  assert.equal(wrapper.lastIndexOf(includeStatement), includePosition)

  for (const lastGate of [
    'WORKFORCE_SCHEDULE_APPROVED_DATABASE_MISMATCH',
    'WORKFORCE_SCHEDULE_DATABASE_MISMATCH',
    'WORKFORCE_SCHEDULE_APPROVED_MIGRATION_RUNNER_MISMATCH',
    'WORKFORCE_SCHEDULE_MIGRATION_SESSION_MISMATCH',
    'WORKFORCE_SCHEDULE_CORE_CONFIRMATION_MISMATCH',
    'WORKFORCE_SCHEDULE_POSTGRESQL_17_REQUIRED',
    'WORKFORCE_SCHEDULE_PRIMARY_DATABASE_REQUIRED',
    'WORKFORCE_SCHEDULE_READ_WRITE_SESSION_REQUIRED',
  ]) {
    assert.ok(wrapper.indexOf(lastGate) < includePosition, `${lastGate} must precede raw SQL`)
  }

  assert.ok(wrapper.indexOf("\\echo 'WORKFORCE_SCHEDULE_CORE_MIGRATION_APPLIED'") > includePosition)
  assert.match(migration, /OPERATOR ENTRYPOINT: \.\.\/admin\/20260906_workforce_schedule_core_apply\.psql/)
  assert.match(migration, /Direct execution of this raw SQL is forbidden/)
})

test('raw SQL wymaga jednorazowego markera ustawionego dopiero przez wrapper', () => {
  const armPosition = wrapper.indexOf(entrypointMarker)
  const includePosition = wrapper.indexOf(includeStatement)
  assert.ok(armPosition > wrapper.indexOf('WORKFORCE_SCHEDULE_READ_WRITE_SESSION_REQUIRED'))
  assert.ok(armPosition < includePosition)
  assert.match(wrapper, /set_config\([\s\S]*?cleanzi\.workforce_schedule_core_entrypoint/)

  const guardPosition = migration.indexOf('WORKFORCE_SCHEDULE_GUARDED_ENTRYPOINT_REQUIRED')
  assert.ok(guardPosition > 0)
  assert.ok(guardPosition < migration.indexOf('begin;'))
  assert.match(migration, /current_setting\('cleanzi\.workforce_schedule_core_entrypoint', true\)/)
  assert.match(migration, /is distinct from 'GUARDED_WORKFORCE_SCHEDULE_CORE_20260906'/)
  assert.match(migration, /perform set_config\('cleanzi\.workforce_schedule_core_entrypoint', '', false\)/)

  assert.match(harness, /runGuardedHarnessMigration/)
  assert.match(harness, /MIGRATION_ENTRYPOINT_MARKER = 'GUARDED_WORKFORCE_SCHEDULE_CORE_20260906'/)
  const directMigrationCalls = harness.match(/await (?:migrationClient|client)\.query\(migrationSql\)/g) || []
  assert.equal(directMigrationCalls.length, 1)
  const directGuardTest = harness.slice(
    harness.indexOf('async function assertRawMigrationRequiresGuard'),
    harness.indexOf('async function assertSecondMigrationIsRejected'),
  )
  assert.match(directGuardTest, /await client\.query\(migrationSql\)/)
  assert.match(directGuardTest, /WORKFORCE_SCHEDULE_GUARDED_ENTRYPOINT_REQUIRED/)
})

test('runbook zakazuje bezpośredniego wykonania i nie zawiera sekretów', () => {
  assert.match(runbook, /nie wolno wykonywać bezpośrednio/iu)
  assert.match(runbook, /Jedynym dopuszczonym punktem wejścia/iu)
  assert.match(runbook, /20260906_workforce_schedule_core_apply\.psql/)
  assert.match(runbook, /APPLY_WORKFORCE_SCHEDULE_CORE_ONLY_20260906/)
  assert.match(runbook, /osobnej, jawnej zgody migracyjnej/iu)
  assert.match(runbook, /Preprovisioning ról nie jest zgodą na migrację/iu)
  assert.match(runbook, /nie wolno omijać ochrony przez uruchomienie surowego SQL/iu)
  assert.doesNotMatch(runbook, /postgres(?:ql)?:\/\/[^\s'"`]+:[^\s@'"`]+@/iu)
  assert.doesNotMatch(wrapper, /\bpassword\s*=|WORKFORCE_SCHEDULE_DB_PASS/iu)
})
