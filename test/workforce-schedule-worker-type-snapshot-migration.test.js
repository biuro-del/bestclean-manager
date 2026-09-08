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
  '20260908_workforce_schedule_worker_type_snapshot_apply.psql',
)
const migrationPath = path.join(
  root,
  'dataconnect',
  'migrations',
  '20260908_workforce_schedule_worker_type_snapshot_additive.sql',
)
const coreMigrationPath = path.join(
  root,
  'dataconnect',
  'migrations',
  '20260906_workforce_schedule_core_additive.sql',
)
const runbookPath = path.join(
  root,
  'docs',
  'workforce-schedule-worker-type-snapshot-migration.md',
)

const wrapper = fs.readFileSync(wrapperPath, 'utf8')
const migration = fs.readFileSync(migrationPath, 'utf8')
const coreMigration = fs.readFileSync(coreMigrationPath, 'utf8')
const runbook = fs.readFileSync(runbookPath, 'utf8')
const includeStatement = '\\ir ../migrations/20260908_workforce_schedule_worker_type_snapshot_additive.sql'
const entrypointMarker = 'GUARDED_WORKFORCE_SCHEDULE_WORKER_TYPE_SNAPSHOT_20260908'

test('wrapper blokuje zly cel, role, wersje i brak osobnej zgody', () => {
  assert.match(wrapper, /\\set ON_ERROR_STOP on/)
  for (const variableName of [
    'workforce_schedule_expected_database',
    'workforce_schedule_expected_migration_runner',
    'workforce_schedule_worker_type_confirmation',
  ]) {
    assert.match(wrapper, new RegExp(`\\\\if :\\{\\?${variableName}\\}`))
  }
  assert.match(wrapper, /current_database\(\) = :'workforce_schedule_expected_database'/)
  assert.match(wrapper, /session_user = :'workforce_schedule_expected_migration_runner'[\s\S]*?current_user = session_user/)
  assert.match(wrapper, /APPLY_WORKFORCE_SCHEDULE_WORKER_TYPE_SNAPSHOT_ONLY_20260908/)
  assert.match(wrapper, /server_version_num'\)::integer between 170000 and 179999/)
  assert.match(wrapper, /not pg_is_in_recovery\(\)/)
  assert.match(wrapper, /transaction_read_only'\) = 'off'/)
})

test('wrapper uzbraja jednorazowy marker i dopiero potem dolacza raw SQL', () => {
  const includePosition = wrapper.indexOf(includeStatement)
  assert.notEqual(includePosition, -1)
  assert.equal(wrapper.lastIndexOf(includeStatement), includePosition)
  assert.ok(wrapper.indexOf(entrypointMarker) < includePosition)
  assert.ok(wrapper.indexOf('WORKFORCE_SCHEDULE_READ_WRITE_SESSION_REQUIRED') < includePosition)
  assert.ok(wrapper.indexOf("\\echo 'WORKFORCE_SCHEDULE_WORKER_TYPE_SNAPSHOT_MIGRATION_APPLIED'") > includePosition)

  const guardPosition = migration.indexOf('WORKFORCE_SCHEDULE_WORKER_TYPE_GUARDED_ENTRYPOINT_REQUIRED')
  assert.ok(guardPosition > 0)
  assert.ok(guardPosition < migration.indexOf('begin;'))
  assert.match(migration, /current_setting\('cleanzi\.workforce_schedule_worker_type_snapshot_entrypoint', true\)/)
  assert.match(migration, /is distinct from 'GUARDED_WORKFORCE_SCHEDULE_WORKER_TYPE_SNAPSHOT_20260908'/)
  assert.match(migration, /perform set_config\([\s\S]*?worker_type_snapshot_entrypoint[\s\S]*?'',/)
})

test('migracja jest addytywna i zachowuje reader V1', () => {
  assert.match(migration, /alter table public\.workforce_schedule_person[\s\S]*?add column worker_type_snapshot varchar\(40\)/i)
  assert.match(migration, /worker_type_snapshot is null[\s\S]*?worker_type_snapshot = btrim\(worker_type_snapshot\)/i)
  assert.match(migration, /create function public\.workforce_roster_read_active_workers_v2\(p_org_id text\)/i)
  assert.doesNotMatch(migration, /create(?: or replace)? function public\.workforce_schedule_read_active_workers\(p_org_id text\)/i)
  assert.doesNotMatch(migration, /alter function public\.workforce_schedule_read_active_workers\(text\)/i)
  assert.doesNotMatch(migration, /\bdrop\b/i)
  assert.doesNotMatch(migration, /\bdelete\s+from\b|\bupdate\s+public\.worker\b|\binsert\s+into\s+public\.worker\b/i)
})

test('stary backend po migracji nadal widzi dokladnie szesc funkcji workforce_schedule', () => {
  const legacyExpectedNames = [
    'workforce_schedule_actor_is_active',
    'workforce_schedule_authorize_session',
    'workforce_schedule_lock_object_sources',
    'workforce_schedule_lock_worker_sources',
    'workforce_schedule_read_active_objects',
    'workforce_schedule_read_active_workers',
  ]
  const combinedDeclarations = `${coreMigration}\n${migration}`
  const legacyVisibleNames = [...combinedDeclarations.matchAll(
    /create function public\.(workforce_schedule_[a-z0-9_]+)\s*\(/gi,
  )].map((match) => match[1]).sort()

  assert.deepEqual(legacyVisibleNames, legacyExpectedNames)
  assert.doesNotMatch(migration, /create function public\.workforce_schedule_/i)
  assert.match(migration, /create function public\.workforce_roster_read_active_workers_v2\(p_org_id text\)/i)
})

test('reader V2 ma tenant guard, staly search_path i zwraca tylko snapshot typu', () => {
  assert.match(migration, /returns table \([\s\S]*?role_snapshot text,[\s\S]*?worker_type_snapshot text[\s\S]*?\)/i)
  assert.match(migration, /language sql[\s\S]*?stable[\s\S]*?security definer[\s\S]*?set search_path = pg_catalog/i)
  assert.match(migration, /nullif\(btrim\(worker_source\.worker_type\), ''\)/i)
  assert.match(migration, /worker_source\.org_id = p_org_id[\s\S]*?workforce_schedule_actor_is_active\(p_org_id\)/i)
  assert.match(migration, /worker_source\.active is true[\s\S]*?upper\(btrim\(worker_source\.status\)\) = 'ACTIVE'/i)
  assert.match(migration, /nullif\(btrim\(worker_source\.worker_id_normalized\), ''\) is not null/i)
})

test('ACL pozostaje waski i runtime nie dostaje SELECT do public.worker', () => {
  assert.match(migration, /revoke all privileges on function[\s\S]*?workforce_roster_read_active_workers_v2\(text\)[\s\S]*?from public, workforce_schedule_session, workforce_schedule_app, migration_runner/i)
  assert.match(migration, /grant execute on function[\s\S]*?workforce_roster_read_active_workers_v2\(text\)[\s\S]*?to workforce_schedule_app/i)
  assert.match(migration, /has_table_privilege\('workforce_schedule_app', 'public\.worker', 'SELECT'\)/i)
  assert.match(migration, /has_any_column_privilege\('workforce_schedule_session', 'public\.worker', 'SELECT'\)/i)
  assert.doesNotMatch(migration, /grant\s+select[\s\S]{0,240}public\.worker/i)
  assert.doesNotMatch(migration, /grant[^;]*\bto\s+portal_app\b/i)
})

test('preflight wymaga czystego core V1, a postflight dokladnie siedmiu funkcji', () => {
  assert.match(migration, /cleanzi\.workforce_schedule\.core\.v1/)
  assert.match(migration, /function_count <> 6[\s\S]*?CORE_FUNCTION_ALLOWLIST_DRIFT/i)
  assert.match(migration, /count\(\*\) <> 7[\s\S]*?FUNCTION_ALLOWLIST_POSTFLIGHT_FAILED/i)
  assert.match(migration, /proname like 'workforce\\_schedule\\_%'[\s\S]*?or function_row\.proname like 'workforce\\_roster\\_%'/i)
  assert.ok((migration.match(/where to_regprocedure\(required\.function_signature\) is null/g) || []).length >= 2)
  assert.ok((migration.match(/allowed\(function_oid\)/g) || []).length >= 2)
  assert.ok((migration.match(/where allowed\.function_oid = function_row\.oid/g) || []).length >= 2)
  assert.doesNotMatch(migration, /function_row\.oid\s*<>\s*all\s*\(/i)
  assert.match(migration, /workforce_schedule_read_active_workers\(text\)/)
  assert.match(migration, /workforce_roster_read_active_workers_v2\(text\)/)
  assert.match(migration, /WORKFORCE_SCHEDULE_WORKER_TYPE_SOURCE_BOUNDARY_POSTFLIGHT_FAILED/)
})

test('preflight i postflight zamykaja pelny graf SET ROLE do ownera', () => {
  for (const marker of [
    'WORKFORCE_SCHEDULE_WORKER_TYPE_RUNTIME_ROLE_ATTRIBUTES_DRIFT',
    'WORKFORCE_SCHEDULE_WORKER_TYPE_SESSION_ROLE_GRAPH_DRIFT',
    'WORKFORCE_SCHEDULE_WORKER_TYPE_SESSION_SET_GRAPH_DRIFT',
    'WORKFORCE_SCHEDULE_WORKER_TYPE_APP_ROLE_GRAPH_DRIFT',
    'WORKFORCE_SCHEDULE_WORKER_TYPE_OWNER_REACHABILITY_DRIFT',
    'WORKFORCE_SCHEDULE_WORKER_TYPE_MIGRATION_PRIVILEGE_GRAPH_DRIFT',
    'WORKFORCE_SCHEDULE_WORKER_TYPE_RUNTIME_ROLE_ATTRIBUTES_POSTFLIGHT_FAILED',
    'WORKFORCE_SCHEDULE_WORKER_TYPE_SESSION_ROLE_GRAPH_POSTFLIGHT_FAILED',
    'WORKFORCE_SCHEDULE_WORKER_TYPE_SESSION_SET_GRAPH_POSTFLIGHT_FAILED',
    'WORKFORCE_SCHEDULE_WORKER_TYPE_APP_ROLE_GRAPH_POSTFLIGHT_FAILED',
    'WORKFORCE_SCHEDULE_WORKER_TYPE_OWNER_REACHABILITY_POSTFLIGHT_FAILED',
    'WORKFORCE_SCHEDULE_WORKER_TYPE_MIGRATION_PRIVILEGE_GRAPH_POSTFLIGHT_FAILED',
  ]) {
    assert.match(migration, new RegExp(marker))
  }
  assert.ok((migration.match(/pg_has_role\('workforce_schedule_app', 'workforce_schedule_owner', 'SET'\)/g) || []).length >= 2)
  assert.ok((migration.match(/where membership\.member = \(select oid from pg_roles where rolname = 'workforce_schedule_app'\)/g) || []).length >= 2)
})

test('runbook wymaga osobnej zgody i nie zawiera sekretow', () => {
  assert.match(runbook, /osobnej, jawnej zgody migracyjnej/iu)
  assert.match(runbook, /Jedynym dopuszczonym punktem wejścia/iu)
  assert.match(runbook, /APPLY_WORKFORCE_SCHEDULE_WORKER_TYPE_SNAPSHOT_ONLY_20260908/)
  assert.match(runbook, /nie wolno wykonywać bezpośrednio/iu)
  assert.match(runbook, /nie nadaje rolom runtime ani sesyjnym bezpośredniego `SELECT`/iu)
  assert.match(runbook, /worker_type_snapshot = NULL/)
  assert.doesNotMatch(runbook, /postgres(?:ql)?:\/\/[^\s'"`]+:[^\s@'"`]+@/iu)
  assert.doesNotMatch(wrapper, /\bpassword\s*=|WORKFORCE_SCHEDULE_DB_PASS/iu)
})
