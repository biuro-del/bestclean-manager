'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')
const migrationPath = path.join(
  root,
  'dataconnect',
  'migrations',
  '20260926_profitability_financial_model_v21_additive.sql',
)
const wrapperPath = path.join(
  root,
  'dataconnect',
  'admin',
  '20260926_profitability_financial_model_v21_apply.psql',
)
const migration = fs.readFileSync(migrationPath, 'utf8')
const wrapper = fs.readFileSync(wrapperPath, 'utf8')
const executableMigration = migration.replace(/^\s*--.*$/gm, '')
const harness = require('../scripts/test-profitability-v21-pg17')

test('V2.1 can run only through the guarded PG17 wrapper', () => {
  assert.match(wrapper, /\\set ON_ERROR_STOP on/)
  for (const variable of [
    'profitability_v21_expected_database',
    'profitability_v21_expected_executor',
    'profitability_v21_expected_migration_runner',
    'profitability_v21_owner_role',
    'profitability_v21_runtime_role',
    'profitability_v21_backup_reference',
    'profitability_v21_confirmation',
  ]) {
    assert.match(wrapper, new RegExp(`\\\\if :\\{\\?${variable}\\}`))
  }
  assert.match(wrapper, /current_database\(\) = :'profitability_v21_expected_database'/)
  assert.match(wrapper, /session_user = :'profitability_v21_expected_executor'/)
  assert.match(wrapper, /server_version_num'\)::integer between 170000 and 179999/)
  assert.match(wrapper, /not pg_is_in_recovery\(\)/)
  assert.match(wrapper, /transaction_read_only'\) = 'off'/)
  assert.match(wrapper, /membership_row\.set_option/)
  assert.match(wrapper, /not has_schema_privilege\(runtime_role\.oid, 'public', 'CREATE'\)/)
  assert.match(wrapper, /APPLY_PROFITABILITY_FINANCIAL_MODEL_V21_ONLY_20260926/)

  const include = '\\ir ../migrations/20260926_profitability_financial_model_v21_additive.sql'
  assert.equal(wrapper.indexOf(include), wrapper.lastIndexOf(include))
  assert.ok(wrapper.indexOf(include) > wrapper.indexOf('begin;'))
  assert.ok(wrapper.indexOf(include) < wrapper.lastIndexOf('commit;'))

  assert.match(migration, /PROFITABILITY_V21_GUARDED_ENTRYPOINT_REQUIRED/)
  assert.match(migration, /GUARDED_PROFITABILITY_FINANCIAL_MODEL_V21_20260926/)
  assert.match(migration, /set local role profitability_owner/)
})

test('migration is additive, bounded, seedless and fail-closed on partial replay', () => {
  assert.doesNotMatch(
    executableMigration,
    /^\s*(?:drop\b|truncate\b|delete\s+from\b|update\s+public\.)/im,
  )
  assert.doesNotMatch(executableMigration, /\binsert\s+into\b/i)
  assert.match(wrapper, /set local lock_timeout = '5s'/)
  assert.match(wrapper, /set local statement_timeout = '120s'/)
  assert.match(wrapper, /pg_advisory_xact_lock[\s\S]*profitability-financial-model:v2\.1/)

  assert.match(migration, /marker_count not in \(0, 19\)/)
  assert.match(migration, /PROFITABILITY_V21_PARTIAL_TARGET:%\/19/)
  assert.match(migration, /cleanzi\.profitability_v21_fresh_install/)
  assert.match(migration, /if current_setting\('cleanzi\.profitability_v21_fresh_install'\)::boolean then/)
  assert.match(migration, /PROFITABILITY_V21_CONSTRAINT_DRIFT/)
  assert.match(migration, /PROFITABILITY_V21_INDEX_SET_DRIFT/)
  assert.match(migration, /PROFITABILITY_V21_SECURITY_INVOKER_VIEW_DRIFT/)
})

test('command receipts provide tenant-scoped payload idempotency and one terminal transition', () => {
  assert.match(migration, /create table if not exists public\.profitability_command_receipt/i)
  assert.match(migration, /primary key \(org_id, command_id\)/i)
  assert.match(migration, /foreign key \(org_id, object_id\)[\s\S]*references public\.service_object \(org_id, object_id\)/i)
  assert.match(migration, /request_sha256 ~ '\^\[0-9a-f\]\{64\}\$'/i)
  assert.match(migration, /state in \('IN_PROGRESS', 'SUCCEEDED', 'FAILED'\)/i)
  assert.match(migration, /state = 'SUCCEEDED'[\s\S]*result_reference is not null[\s\S]*error_code is null/i)
  assert.match(migration, /state = 'FAILED'[\s\S]*result_reference is null[\s\S]*error_code is not null/i)
  assert.match(migration, /old\.state <> 'IN_PROGRESS'/i)
  assert.match(migration, /new\.request_sha256 <> old\.request_sha256/i)
  assert.match(migration, /before update or delete on public\.profitability_command_receipt/i)
})

test('financial-model enforcement is tenant-bound, seedless and read-only for runtime', () => {
  assert.match(migration, /create table if not exists public\.profitability_financial_model_enforcement/i)
  assert.match(migration, /primary key \(org_id\)/i)
  assert.match(migration, /foreign key \(org_id\)[\s\S]*references public\.organizations \(org_id\)/i)
  assert.match(migration, /check \(schema_version = 'v2\.1'\)/i)
  assert.match(migration, /grant select on table public\.profitability_financial_model_enforcement[\s\S]*to profitability_runtime/i)
  assert.match(migration, /has_table_privilege\([\s\S]*profitability_financial_model_enforcement[\s\S]*'INSERT, UPDATE, DELETE'/i)
  assert.doesNotMatch(executableMigration, /insert into public\.profitability_financial_model_enforcement/i)
})

test('financial values explicitly distinguish PLAN, ESTIMATE and ACTUAL', () => {
  assert.match(migration, /add column value_basis varchar\(16\) not null default 'ACTUAL'/i)
  assert.match(migration, /value_basis in \('PLAN', 'ESTIMATE', 'ACTUAL'\)/i)
  assert.match(migration, /add column value_key varchar\(96\)/i)
  assert.match(migration, /object_financial_entry_active_value_basis_uidx/i)
  assert.match(migration, /\(org_id, object_id, value_key, value_basis\)/i)

  const viewStart = migration.indexOf('create view public.profitability_effective_financial_entry')
  const viewEnd = migration.indexOf('$view_sql$;', viewStart)
  const view = migration.slice(viewStart, viewEnd)
  assert.match(view, /with \(security_invoker = true\)/i)
  assert.match(view, /value_basis in \('ESTIMATE', 'ACTUAL'\)/i)
  assert.match(view, /entry_row\.value_basis = 'ESTIMATE'/i)
  assert.match(view, /actual_row\.value_key = entry_row\.value_key/i)
  assert.match(view, /actual_row\.value_basis = 'ACTUAL'/i)
  assert.match(view, /actual_row\.occurred_on is not distinct from entry_row\.occurred_on/i)
  assert.match(view, /actual_row\.period_start is not distinct from entry_row\.period_start/i)
  assert.match(view, /actual_row\.period_end is not distinct from entry_row\.period_end/i)
  assert.match(view, /actual_row\.entry_group = entry_row\.entry_group/i)
  assert.doesNotMatch(view, /value_basis = 'PLAN'/i)

  assert.match(migration, /create function public\.profitability_v21_validate_financial_pair\(\)/i)
  assert.match(migration, /peer_row\.value_key = new\.value_key/i)
  assert.match(migration, /peer_row\.entry_group[\s\S]*peer_row\.category[\s\S]*peer_row\.currency[\s\S]*peer_row\.recurrence/i)
  assert.match(migration, /peer_row\.occurred_on[\s\S]*peer_row\.period_start[\s\S]*peer_row\.period_end/i)
  assert.match(migration, /PROFITABILITY_V21_FINANCIAL_PAIR_DIMENSION_MISMATCH/i)
  assert.match(migration, /pg_catalog\.pg_advisory_xact_lock\([\s\S]*'FINANCIAL'/i)
  assert.match(migration, /object_financial_entry_pair_dimensions_v21[\s\S]*before insert or update on public\.object_financial_entry/i)
})

test('hygiene package versions implement billing modes, basis precedence and margin in BPS', () => {
  assert.match(migration, /create table if not exists public\.object_hygiene_package_version/i)
  assert.match(migration, /billing_mode in \('IN_CONTRACT', 'MONTHLY_EXTRA', 'AD_HOC'\)/i)
  assert.match(migration, /value_basis in \('PLAN', 'ESTIMATE', 'ACTUAL'\)/i)
  assert.match(migration, /version_no integer not null/i)
  assert.match(migration, /effective_from date not null/i)
  assert.match(migration, /effective_to date/i)
  assert.match(migration, /occurred_on date/i)
  assert.match(migration, /margin_bps integer generated always as/i)
  assert.match(migration, /\(price_net_minor - cost_minor\)::numeric \* 10000::numeric/i)
  assert.match(migration, /billing_mode = 'AD_HOC'[\s\S]*occurred_on is not null/i)
  assert.match(migration, /status varchar\(16\) not null default 'DRAFT'/i)
  assert.match(migration, /object_hygiene_package_no_overlap[\s\S]*exclude using gist/i)

  const viewStart = migration.indexOf('create view public.profitability_effective_hygiene_package')
  const viewEnd = migration.indexOf('$view_sql$;', viewStart)
  const view = migration.slice(viewStart, viewEnd)
  assert.match(view, /package_row\.status = 'POSTED'/i)
  assert.match(view, /package_row\.billing_mode = 'IN_CONTRACT' then 0::bigint/i)
  assert.match(view, /package_row\.value_basis in \('ESTIMATE', 'ACTUAL'\)/i)
  assert.doesNotMatch(view, /package_row\.value_basis = 'PLAN'/i)
  assert.match(view, /distinct on \([\s\S]*package_row\.recognition_key/i)
  assert.match(view, /when 'ACTUAL' then 3[\s\S]*when 'ESTIMATE' then 2/i)
  assert.match(migration, /object_hygiene_package_active_recognition_uidx[\s\S]*\(org_id, object_id, recognition_key, value_basis\)/i)
  assert.match(migration, /create function public\.profitability_v21_validate_hygiene_pair\(\)/i)
  assert.match(migration, /peer_row\.recognition_key = new\.recognition_key/i)
  assert.match(migration, /peer_row\.package_id[\s\S]*peer_row\.billing_mode[\s\S]*peer_row\.currency/i)
  assert.match(migration, /peer_row\.effective_from[\s\S]*peer_row\.effective_to[\s\S]*peer_row\.occurred_on/i)
  assert.match(migration, /PROFITABILITY_V21_HYGIENE_PAIR_DIMENSION_MISMATCH/i)
  assert.match(migration, /pg_catalog\.pg_advisory_xact_lock\([\s\S]*'HYGIENE'/i)
  assert.match(migration, /object_hygiene_package_pair_dimensions_v21[\s\S]*before insert or update on public\.object_hygiene_package_version/i)
})

test('hygiene versions are append-only and expose only controlled status transitions', () => {
  assert.match(migration, /create function public\.profitability_v21_guard_hygiene_package\(\)/i)
  assert.match(migration, /hygiene package versions are append-only/i)
  assert.match(migration, /old\.status = 'DRAFT' and new\.status in \('POSTED', 'VOID'\)/i)
  assert.match(migration, /old\.status = 'POSTED' and new\.status in \('VOID', 'ARCHIVED'\)/i)
  assert.match(migration, /before update or delete on public\.object_hygiene_package_version/i)
  assert.match(migration, /status = 'ARCHIVED'[\s\S]*archived_at is not null[\s\S]*archived_by_uid is not null/i)
})

test('runtime ACL is least-privilege and views are security invoker', () => {
  assert.match(migration, /revoke all on table public\.profitability_command_receipt from public/i)
  assert.match(migration, /grant select, insert on table public\.profitability_command_receipt[\s\S]*to profitability_runtime/i)
  assert.match(migration, /grant update \([\s\S]*state, result_reference, error_code, updated_at, completed_at[\s\S]*\)[\s\S]*to profitability_runtime/i)
  assert.doesNotMatch(migration, /grant delete/i)
  assert.match(migration, /grant select, insert on table public\.object_hygiene_package_version/i)
  assert.match(migration, /grant update \([\s\S]*status, updated_at, updated_by_uid, archived_at, archived_by_uid[\s\S]*\)[\s\S]*on table public\.object_hygiene_package_version/i)
  assert.doesNotMatch(migration, /grant select, insert, update on table public\.object_hygiene_package_version/i)
  assert.match(migration, /has_column_privilege\([\s\S]*'price_net_minor'[\s\S]*'UPDATE'/i)
  assert.match(migration, /has_column_privilege\([\s\S]*'cost_minor'[\s\S]*'UPDATE'/i)
  assert.match(migration, /with \(security_invoker = true\)/i)
  assert.match(migration, /PROFITABILITY_V21_RUNTIME_ACL_DRIFT/)
  assert.match(migration, /PROFITABILITY_V21_PUBLIC_ACL_EXCESS/)
  assert.match(migration, /PROFITABILITY_V21_TRIGGER_FUNCTION_ACL_EXCESS/)
  assert.match(migration, /revoke all on function public\.profitability_v21_validate_financial_pair\(\) from public/i)
  assert.match(migration, /revoke all on function public\.profitability_v21_validate_hygiene_pair\(\) from public/i)
})

test('wrapper and migration contain no credentials, URI, tenant seed or psql escape', () => {
  const combined = `${wrapper}\n${migration}`
  assert.doesNotMatch(combined, /postgres(?:ql)?:\/\/[^\s'"`]+:[^\s@'"`]+@/iu)
  assert.doesNotMatch(combined, /\bpassword\s*=|DB_PASS|PORTAL_DB_PASS/iu)
  assert.doesNotMatch(combined, /best\s*clean|raf(?:a|Ăˇ)Ĺ‚|marta|sabina|szymon|@[a-z0-9.-]+\.[a-z]{2,}/iu)
  assert.doesNotMatch(combined, /^\s*\\(?:connect|!|copy|gexec)\b/im)
})

test('PG17 replay harness is local-only, replays unchanged schema and exercises semantics', () => {
  const source = fs.readFileSync(
    path.join(root, 'scripts', 'test-profitability-v21-pg17.js'),
    'utf8',
  )
  assert.deepEqual(harness.EFFECTS, {
    production: false,
    deploy: false,
    notifications: false,
    downstream: false,
  })
  assert.match(source, /foundation\.parseLaunchConfiguration/)
  assert.match(source, /foundation\.runHarness/)
  assert.match(source, /runWrapper\([\s\S]*runWrapper\(/)
  assert.match(source, /schemaFingerprint/)
  assert.match(source, /assert\.equal\(await schemaFingerprint\(replayAdmin\), firstFingerprint\)/)
  assert.match(source, /profitability_effective_financial_entry/)
  assert.match(source, /profitability_effective_hygiene_package/)
  assert.match(source, /PROFITABILITY_V21_FINANCIAL_PAIR_DIMENSION_MISMATCH/)
  assert.match(source, /PROFITABILITY_V21_HYGIENE_PAIR_DIMENSION_MISMATCH/)
  assert.match(source, /row_count:\s*1[\s\S]*amount_minor:\s*'8000'/)
  assert.match(source, /row_count:\s*1[\s\S]*cost_minor:\s*'8500'/)
  assert.match(source, /invalid profitability command receipt transition/)
  assert.match(source, /permission denied\|immutable/)
  assert.doesNotMatch(source, /process\.env\.DATABASE_URL/)
  assert.doesNotMatch(source, /\bgcloud\b|\bfirebase\b/i)

  const powerShell = fs.readFileSync(
    path.join(root, 'scripts', 'test-profitability-v21-pg17.ps1'),
    'utf8',
  )
  for (const marker of [
    'C:\\Program Files\\PostgreSQL\\17\\bin\\initdb.exe',
    '127.0.0.1',
    'TcpListener',
    '$candidate -eq 5432',
    '$SmokeSucceeded -and $ServerStopped',
    'ReparsePoint',
    'V21_EPHEMERAL_DATA_PRESERVED_FOR_DIAGNOSIS',
  ]) {
    assert.ok(powerShell.includes(marker), `Missing PowerShell safety marker: ${marker}`)
  }
  assert.doesNotMatch(powerShell, /\bgcloud\b|\bfirebase\b/i)
})
