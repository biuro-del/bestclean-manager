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
  '20260925_profitability_access_profile_v2_apply.psql',
)
const migrationPath = path.join(
  root,
  'dataconnect',
  'migrations',
  '20260925_profitability_access_profile_v2_additive.sql',
)
const {
  REQUIRED_ACCESS_PROFILE_COLUMN_RULES,
  REQUIRED_ACCESS_PROFILE_CONSTRAINT_RULES,
  REQUIRED_ACCESS_PROFILE_INDEX_RULES,
} = require('../profitability/access-profile-repository')
const wrapper = fs.readFileSync(wrapperPath, 'utf8')
const migration = fs.readFileSync(migrationPath, 'utf8')
const executableMigration = migration.replace(/^\s*--.*$/gm, '')
const includeStatement = '\\ir ../migrations/20260925_profitability_access_profile_v2_additive.sql'
const entrypointMarker = 'GUARDED_PROFITABILITY_ACCESS_PROFILE_V2_20260925'

test('guarded wrapper requires the exact database, runner, backup, runtime role and confirmation', () => {
  assert.match(wrapper, /\\set ON_ERROR_STOP on/)

  for (const variableName of [
    'profitability_access_expected_database',
    'profitability_access_expected_migration_runner',
    'profitability_access_runtime_role',
    'profitability_access_backup_reference',
    'profitability_access_confirmation',
  ]) {
    assert.match(wrapper, new RegExp(`\\\\if :\\{\\?${variableName}\\}`))
  }

  assert.match(wrapper, /:'profitability_access_expected_database' = 'iclean-room-database'/)
  assert.match(wrapper, /current_database\(\) = :'profitability_access_expected_database'/)
  assert.match(wrapper, /:'profitability_access_expected_migration_runner' = 'migration_runner'/)
  assert.match(
    wrapper,
    /session_user = 'migration_runner'[\s\S]*?current_user = 'migration_runner'[\s\S]*?session_user = :'profitability_access_expected_migration_runner'/,
  )
  assert.match(wrapper, /APPLY_PROFITABILITY_ACCESS_PROFILE_V2_ONLY_20260925/)
  assert.match(wrapper, /profitability_access_backup_reference'[\s\S]*?\^\[A-Za-z0-9\]/)
  assert.match(wrapper, /runtime_role\.rolname = :'profitability_access_runtime_role'/)
  assert.match(wrapper, /not runtime_role\.rolsuper[\s\S]*?not runtime_role\.rolbypassrls/)
})

test('wrapper accepts only PG17 primary read-write and a runtime role without schema CREATE', () => {
  assert.match(wrapper, /server_version_num'\)::integer between 170000 and 179999/)
  assert.match(wrapper, /not pg_is_in_recovery\(\)/)
  assert.match(wrapper, /transaction_read_only'\) = 'off'/)
  assert.match(wrapper, /default_transaction_read_only'\) = 'off'/)
  assert.match(wrapper, /not has_schema_privilege\(runtime_role\.oid, 'public', 'CREATE'\)/)

  for (const marker of [
    'PROFITABILITY_ACCESS_V2_POSTGRESQL_17_REQUIRED',
    'PROFITABILITY_ACCESS_V2_PRIMARY_DATABASE_REQUIRED',
    'PROFITABILITY_ACCESS_V2_READ_WRITE_SESSION_REQUIRED',
    'PROFITABILITY_ACCESS_V2_RUNTIME_ROLE_INVALID',
    'PROFITABILITY_ACCESS_V2_RUNTIME_SCHEMA_CREATE_EXCESS',
  ]) {
    assert.match(wrapper, new RegExp(marker))
  }
})

test('raw migration is included once after all guards and consumes a one-shot marker', () => {
  const includePosition = wrapper.indexOf(includeStatement)
  assert.notEqual(includePosition, -1)
  assert.equal(wrapper.lastIndexOf(includeStatement), includePosition)

  for (const lastGate of [
    'PROFITABILITY_ACCESS_V2_APPROVED_DATABASE_MISMATCH',
    'PROFITABILITY_ACCESS_V2_DATABASE_MISMATCH',
    'PROFITABILITY_ACCESS_V2_MIGRATION_SESSION_MISMATCH',
    'PROFITABILITY_ACCESS_V2_CONFIRMATION_MISMATCH',
    'PROFITABILITY_ACCESS_V2_BACKUP_REFERENCE_INVALID',
    'PROFITABILITY_ACCESS_V2_POSTGRESQL_17_REQUIRED',
    'PROFITABILITY_ACCESS_V2_PRIMARY_DATABASE_REQUIRED',
    'PROFITABILITY_ACCESS_V2_READ_WRITE_SESSION_REQUIRED',
    'PROFITABILITY_ACCESS_V2_RUNTIME_ROLE_INVALID',
    'PROFITABILITY_ACCESS_V2_RUNTIME_SCHEMA_CREATE_EXCESS',
  ]) {
    assert.ok(wrapper.indexOf(lastGate) < includePosition, `${lastGate} must precede raw SQL`)
  }

  assert.ok(wrapper.indexOf(entrypointMarker) < includePosition)
  assert.match(wrapper, /set_config\([\s\S]*?cleanzi\.profitability_access_v2_entrypoint/)
  assert.match(wrapper, /set_config\([\s\S]*?cleanzi\.profitability_access_v2_runtime_role/)
  assert.match(wrapper, /set_config\([\s\S]*?cleanzi\.profitability_access_v2_backup_reference/)

  const guardPosition = migration.indexOf('PROFITABILITY_ACCESS_V2_GUARDED_ENTRYPOINT_REQUIRED')
  assert.ok(guardPosition > 0)
  assert.ok(guardPosition < migration.indexOf('begin;'))
  assert.match(migration, /OPERATOR ENTRYPOINT: \.\.\/admin\/20260925_profitability_access_profile_v2_apply\.psql/)
  assert.match(migration, /Direct execution of this raw SQL is forbidden/)
  assert.match(migration, /current_setting\('cleanzi\.profitability_access_v2_entrypoint', true\)/)
  assert.match(migration, /is distinct from 'GUARDED_PROFITABILITY_ACCESS_PROFILE_V2_20260925'/)
  assert.match(migration, /perform set_config\('cleanzi\.profitability_access_v2_entrypoint', '', false\)/)
})

test('raw migration rechecks the production target before opening its transaction', () => {
  const transactionPosition = migration.indexOf('begin;')
  const guardSource = migration.slice(0, transactionPosition)

  assert.match(guardSource, /current_database\(\) <> 'iclean-room-database'/)
  assert.match(guardSource, /session_user <> 'migration_runner' or current_user <> session_user/)
  assert.match(guardSource, /server_version_num'\)::integer not between 170000 and 179999/)
  assert.match(guardSource, /pg_is_in_recovery\(\)/)
  assert.match(guardSource, /transaction_read_only'\) <> 'off'/)
  assert.match(guardSource, /default_transaction_read_only'\) <> 'off'/)
  assert.match(guardSource, /profitability_access_v2_backup_reference/)
  assert.match(guardSource, /runtime_role\.rolname = runtime_role_name/)
  assert.match(guardSource, /has_schema_privilege\(runtime_role_name, 'public', 'CREATE'\)/)
})

test('migration is additive, bounded and idempotent', () => {
  assert.match(migration, /begin;[\s\S]*?commit;/i)
  assert.match(migration, /set local lock_timeout = '5s'/i)
  assert.match(migration, /set local statement_timeout = '60s'/i)
  assert.match(migration, /pg_advisory_xact_lock[\s\S]*?profitability-access-profile:v2/i)

  for (const tableName of [
    'profitability_access_enforcement',
    'organization_access_profile',
    'service_object_assignment',
    'profitability_target_history',
  ]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${tableName}`, 'i'))
  }

  assert.doesNotMatch(
    executableMigration,
    /^\s*(?:drop\b|truncate\b|delete\s+from\b|update\s+public\.)/im,
  )
  assert.doesNotMatch(executableMigration, /\binsert\s+into\b/i)
})

test('access profiles are tenant-bound, NONE-by-default and finance-safe', () => {
  assert.match(migration, /foreign key \(org_id, uid\)[\s\S]*?references public\.organization_member \(org_id, uid\)/i)
  assert.match(migration, /organization_access_profile \([\s\S]*?access_mode varchar\(8\) not null default 'NONE'/i)
  assert.match(migration, /organization_access_profile_access_mode_check[\s\S]*?access_mode in \('NONE', 'READ', 'MANAGE'\)/i)
  assert.match(migration, /operational_profile varchar\(32\) not null default 'NONE'/i)
  assert.match(migration, /object_scope varchar\(24\) not null default 'NONE'/i)
  assert.match(migration, /worker_scope varchar\(24\) not null default 'NONE'/i)
  assert.match(migration, /finance_profile varchar\(32\) not null default 'NONE'/i)
  assert.match(migration, /finance_profile in \('NONE', 'COST_CONTROL', 'OWNER_FULL'\)/i)
  assert.match(migration, /organization_access_profile_none_is_empty_check[\s\S]*?access_mode <> 'NONE'[\s\S]*?finance_profile = 'NONE'/i)
  assert.match(migration, /finance_profile = 'COST_CONTROL'[\s\S]*?can_edit_contract_terms is false[\s\S]*?can_edit_profitability_targets is false[\s\S]*?can_view_worker_rates is false[\s\S]*?can_edit_worker_rates is false/i)
  assert.match(migration, /or finance_profile = 'OWNER_FULL'/i)
  assert.match(migration, /organization_access_profile_active_uid_idx[\s\S]*?\(org_id, uid\)[\s\S]*?where revoked_at is null/i)
})

test('persistent enforcement marker is tenant-bound and contains no automatic activation seed', () => {
  assert.match(migration, /profitability_access_enforcement_org_fk[\s\S]*?foreign key \(org_id\)[\s\S]*?references public\.organizations \(org_id\)/i)
  assert.match(migration, /profitability_access_enforcement_version_check[\s\S]*?schema_version = 'v2'/i)
  assert.match(migration, /profitability_access_enforcement_reason_check[\s\S]*?nullif\(btrim\(reason\), ''\) is not null/i)
})

test('object assignments cannot cross tenant boundaries', () => {
  assert.match(migration, /service_object_assignment \([\s\S]*?access_mode varchar\(8\) not null default 'DENY'/i)
  assert.match(migration, /service_object_assignment_access_mode_check[\s\S]*?access_mode in \('ALLOW', 'DENY'\)/i)
  assert.match(migration, /service_object_assignment_object_fk[\s\S]*?foreign key \(org_id, object_id\)[\s\S]*?references public\.service_object \(org_id, object_id\)/i)
  assert.match(migration, /service_object_assignment_member_fk[\s\S]*?foreign key \(org_id, uid\)[\s\S]*?references public\.organization_member \(org_id, uid\)/i)
  assert.match(migration, /assignment_role in \('COORDINATOR', 'OPERATIONS_ADMIN', 'SUPPORT'\)/i)
  assert.match(migration, /service_object_assignment_active_scope_idx[\s\S]*?\(org_id, object_id, uid, assignment_role\)[\s\S]*?where revoked_at is null/i)
  assert.match(migration, /valid_to is null or valid_to > valid_from/i)
})

test('target history supports amount, margin and ALL_DEFINED semantics', () => {
  assert.match(migration, /minimum_result_minor bigint/i)
  assert.match(migration, /minimum_margin_bps integer/i)
  assert.match(migration, /minimum_result_minor is not null or minimum_margin_bps is not null/i)
  assert.match(migration, /target_policy varchar\(24\) not null default 'ALL_DEFINED'/i)
  assert.match(migration, /check \(target_policy = 'ALL_DEFINED'\)/i)
  assert.match(migration, /profitability_target_history_currency_check[\s\S]*?minimum_result_minor is null and currency is null[\s\S]*?minimum_result_minor is not null and currency ~ '\^\[A-Z\]\{3\}\$'/i)
  assert.match(migration, /profitability_target_history_no_overlap[\s\S]*?exclude using gist[\s\S]*?daterange\([\s\S]*?'\[\)'[\s\S]*?where \(revoked_at is null\)/i)
})

test('migration fails closed on missing foundations or schema drift', () => {
  for (const marker of [
    'PROFITABILITY_ACCESS_V2_REQUIRED_RELATION_MISSING',
    'PROFITABILITY_ACCESS_V2_MEMBER_TENANT_KEY_MISSING',
    'PROFITABILITY_ACCESS_V2_OBJECT_TENANT_KEY_MISSING',
    'PROFITABILITY_ACCESS_V2_BTREE_GIST_REQUIRED',
    'PROFITABILITY_ACCESS_V2_COLUMN_POSTFLIGHT_FAILED',
    'PROFITABILITY_ACCESS_V2_CONSTRAINT_POSTFLIGHT_FAILED',
    'PROFITABILITY_ACCESS_V2_INDEX_POSTFLIGHT_FAILED',
  ]) {
    assert.match(migration, new RegExp(marker))
  }
  assert.match(migration, /constraint_row\.convalidated is true/i)
  assert.match(migration, /index_meta\.indisvalid is true/i)
  assert.match(migration, /index_meta\.indisready is true/i)

  const postflight = migration.slice(migration.indexOf('-- Idempotent postflight'))
  for (const fingerprint of Object.keys(REQUIRED_ACCESS_PROFILE_COLUMN_RULES)) {
    const [tableName, columnName] = fingerprint.split('.')
    assert.match(postflight, new RegExp(`'${tableName}'[\\s\\S]*?'${columnName}'`))
  }
  for (const fingerprint of Object.keys(REQUIRED_ACCESS_PROFILE_CONSTRAINT_RULES)) {
    const [, constraintName] = fingerprint.split('.')
    assert.match(postflight, new RegExp(`'${constraintName}'`))
  }
  for (const indexName of Object.keys(REQUIRED_ACCESS_PROFILE_INDEX_RULES)) {
    assert.match(postflight, new RegExp(`'${indexName}'`))
  }
})

test('migration contains no identity seed and grants only SELECT to the wrapper-selected runtime role', () => {
  assert.doesNotMatch(migration, /best\s*clean|raf(?:a|á)ł|marta|sabina|szymon|@[a-z0-9.-]+\.[a-z]{2,}/iu)
  assert.doesNotMatch(migration, /\bportal_app\b/i)
  assert.match(migration, /current_setting\('cleanzi\.profitability_access_v2_runtime_role', true\)/)
  assert.match(migration, /grant usage on schema public to %I/i)
  assert.match(migration, /grant select on table public\.%I to %I/i)
  assert.doesNotMatch(executableMigration, /grant\s+(?:all|insert|update|delete|truncate|references|trigger|execute)/i)
  assert.match(migration, /has_table_privilege\(runtime_role_name, target_relation_oid, 'SELECT'\)/i)
  assert.match(migration, /has_any_column_privilege\(runtime_role_name, target_relation_oid, 'INSERT'\)/i)
  assert.match(migration, /PROFITABILITY_ACCESS_V2_RUNTIME_DML_EXCESS/i)
  assert.match(migration, /PROFITABILITY_ACCESS_V2_RUNTIME_DIRECT_ACL_INVALID/i)
  assert.match(migration, /PROFITABILITY_ACCESS_V2_RUNTIME_SCHEMA_CREATE_EXCESS/i)
  const grantPosition = migration.indexOf("'grant select on table public.%I to %I'")
  assert.ok(grantPosition > migration.indexOf('begin;'))
  assert.ok(grantPosition < migration.lastIndexOf('commit;'))
  assert.match(migration, /revoke all on table public\.organization_access_profile from public/i)
  assert.match(migration, /revoke all on table public\.service_object_assignment from public/i)
  assert.match(migration, /revoke all on table public\.profitability_target_history from public/i)
  assert.match(migration, /revoke all on table public\.profitability_access_enforcement from public/i)
})

test('wrapper and migration contain no password, URI or embedded runtime identity', () => {
  assert.doesNotMatch(wrapper, /postgres(?:ql)?:\/\/[^\s'"`]+:[^\s@'"`]+@/iu)
  assert.doesNotMatch(wrapper, /\bpassword\s*=|DB_PASS|PORTAL_DB_PASS/iu)
  assert.doesNotMatch(wrapper, /\bportal_app\b/i)
  assert.match(wrapper, /profitability_access_runtime_role=<exact runtime database role>/i)
})
