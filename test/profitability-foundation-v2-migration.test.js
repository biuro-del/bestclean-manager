'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const wrapperPath = path.join(
  root,
  'dataconnect',
  'admin',
  '20260925_profitability_domain_foundation_v2_apply.psql',
)
const migrationPath = path.join(
  root,
  'dataconnect',
  'migrations',
  '20260925_profitability_foundation_v2_additive.sql',
)
const wrapper = fs.readFileSync(wrapperPath, 'utf8')
const migration = fs.readFileSync(migrationPath, 'utf8')
const executableMigration = migration.replace(/^\s*--.*$/gm, '')
const includeStatement = '\\ir ../migrations/20260925_profitability_foundation_v2_additive.sql'

const foundationTables = [
  'service_object',
  'worker_cost_rate',
  'object_contract_version',
  'periodic_work',
  'periodic_work_zone',
  'object_equipment',
  'object_financial_entry',
  'financial_period',
  'profitability_snapshot',
  'profitability_audit',
]

test('guarded wrapper requires exact target, backup, roles, extension and confirmation', () => {
  assert.match(wrapper, /\\set ON_ERROR_STOP on/)
  for (const variableName of [
    'profitability_foundation_expected_database',
    'profitability_foundation_expected_executor',
    'profitability_foundation_expected_provisioner',
    'profitability_foundation_expected_bootstrap_grantor',
    'profitability_foundation_expected_migration_runner',
    'profitability_foundation_owner_role',
    'profitability_foundation_runtime_role',
    'profitability_foundation_session_role',
    'profitability_foundation_expected_btree_gist_version',
    'profitability_foundation_expected_btree_gist_schema',
    'profitability_foundation_backup_reference',
    'profitability_foundation_confirmation',
  ]) {
    assert.match(wrapper, new RegExp(`\\\\if :\\{\\?${variableName}\\}`))
  }
  assert.match(wrapper, /:'profitability_foundation_expected_database' = 'iclean-room-database'/)
  assert.match(wrapper, /:'profitability_foundation_expected_executor' = 'profitability_migration_executor'/)
  assert.match(wrapper, /:'profitability_foundation_expected_provisioner' = 'profitability_provisioner'/)
  assert.match(wrapper, /:'profitability_foundation_expected_bootstrap_grantor' = pg_get_userbyid\(10\)/)
  assert.match(wrapper, /:'profitability_foundation_expected_migration_runner' = 'profitability_migration_runner'/)
  assert.match(wrapper, /:'profitability_foundation_owner_role' = 'profitability_owner'/)
  assert.match(wrapper, /:'profitability_foundation_runtime_role' = 'profitability_runtime'/)
  assert.match(wrapper, /:'profitability_foundation_session_role' = 'profitability_session'/)
  assert.match(wrapper, /:'profitability_foundation_expected_btree_gist_version' = '1\.7'/)
  assert.match(wrapper, /:'profitability_foundation_expected_btree_gist_schema' = 'public'/)
  assert.match(wrapper, /:'profitability_foundation_backup_reference' = '1790402094445'/)
  assert.match(wrapper, /APPLY_PROFITABILITY_DOMAIN_FOUNDATION_V2_ONLY_20260926/)
  assert.match(wrapper, /server_version_num'\)::integer between 170000 and 179999/)
  assert.match(wrapper, /not pg_is_in_recovery\(\)/)
  assert.match(wrapper, /transaction_read_only'\) = 'off'/)
  assert.match(wrapper, /default_transaction_read_only'\) = 'off'/)
})

test('wrapper requires the exact PG17 provisioner graph and exact grantors', () => {
  for (const marker of [
    'PROFITABILITY_FOUNDATION_V2_PROVISIONER_ROLE_INVALID',
    'PROFITABILITY_FOUNDATION_V2_PROVISIONER_ACL_INVALID',
    'PROFITABILITY_FOUNDATION_V2_MIGRATION_RUNNER_ROLE_INVALID',
    'PROFITABILITY_FOUNDATION_V2_OWNER_ROLE_INVALID',
    'PROFITABILITY_FOUNDATION_V2_RUNTIME_ROLE_INVALID',
    'PROFITABILITY_FOUNDATION_V2_SESSION_ROLE_INVALID',
    'PROFITABILITY_FOUNDATION_V2_EXECUTOR_MEMBERSHIP_INVALID',
    'PROFITABILITY_FOUNDATION_V2_OWNER_MEMBERSHIP_INVALID',
    'PROFITABILITY_FOUNDATION_V2_RUNTIME_MEMBERSHIP_INVALID',
    'PROFITABILITY_FOUNDATION_V2_PROVISIONER_MEMBERSHIP_EXCESS',
    'PROFITABILITY_FOUNDATION_V2_MEMBERSHIP_GRAPH_EXCESS',
  ]) {
    assert.match(wrapper, new RegExp(marker))
  }
  assert.match(wrapper, /membership_row\.set_option/)
  assert.match(wrapper, /not membership_row\.inherit_option/)
  assert.match(wrapper, /not membership_row\.admin_option/)
  assert.match(wrapper, /membership_row\.grantor = 10::oid/)
  assert.match(wrapper, /membership_row\.admin_option[\s\S]*not membership_row\.inherit_option[\s\S]*not membership_row\.set_option/)
  assert.match(wrapper, /role_row\.rolcanlogin[\s\S]*role_row\.rolcreaterole[\s\S]*role_row\.rolconnlimit = -1/)
  assert.match(wrapper, /\) = 8/)
  assert.match(wrapper, /\) = 5/)
  assert.match(wrapper, /profitability_migration_executor[\s\S]*profitability_migration_runner/)
  assert.match(wrapper, /profitability_migration_runner[\s\S]*profitability_owner/)
  assert.match(wrapper, /profitability_session[\s\S]*profitability_runtime/)
  assert.doesNotMatch(wrapper, /\bcreate\s+(?:role|user)\b/i)
  assert.doesNotMatch(wrapper, /\bcreate\s+extension\b/i)
})

test('wrapper rechecks the provisioner exact direct database and schema ACL', () => {
  const roleGateStart = wrapper.indexOf('-- Verify the complete role graph')
  const transactionStart = wrapper.indexOf('\nbegin;\n', roleGateStart)
  assert.ok(roleGateStart > 0 && transactionStart > roleGateStart, 'Role and ACL gate is missing.')
  const roleGate = wrapper.slice(roleGateStart, transactionStart)

  assert.match(roleGate, /database_row\.datdba = \([\s\S]*profitability_foundation_expected_provisioner/)
  assert.match(roleGate, /namespace_row\.nspowner = \([\s\S]*profitability_foundation_expected_provisioner/)
  assert.match(roleGate, /from pg_database database_row[\s\S]*aclexplode\(database_row\.datacl\)/)
  assert.match(roleGate, /database_row\.datname = current_database\(\)[\s\S]*privilege_row\.privilege_type = 'CONNECT'[\s\S]*privilege_row\.is_grantable/)
  assert.match(roleGate, /from pg_namespace namespace_row[\s\S]*aclexplode\(namespace_row\.nspacl\)/)
  assert.match(roleGate, /namespace_row\.nspname = 'public'[\s\S]*privilege_row\.privilege_type = any\(array\['CREATE', 'USAGE'\]::text\[\]\)[\s\S]*privilege_row\.is_grantable/)
  assert.match(roleGate, /\) = 1[\s\S]*\) = 1[\s\S]*\) = 2[\s\S]*\) = 2[\s\S]*as profitability_foundation_provisioner_acl_confirmed/)
  assert.match(roleGate, /\\if :profitability_foundation_provisioner_acl_confirmed[\s\S]*PROFITABILITY_FOUNDATION_V2_PROVISIONER_ACL_INVALID/)
})

test('wrapper opens one bounded transaction, switches runner and includes raw SQL once after all gates', () => {
  const beginPosition = wrapper.indexOf('begin;')
  const includePosition = wrapper.indexOf(includeStatement)
  assert.ok(beginPosition > 0)
  assert.ok(includePosition > beginPosition)
  assert.equal(wrapper.lastIndexOf(includeStatement), includePosition)
  for (const gate of [
    'APPROVED_DATABASE_MISMATCH',
    'EXECUTOR_MISMATCH',
    'APPROVED_BACKUP_MISMATCH',
    'CONFIRMATION_MISMATCH',
    'POSTGRESQL_17_REQUIRED',
    'PRIMARY_DATABASE_REQUIRED',
    'READ_WRITE_SESSION_REQUIRED',
    'ROLE_GRAPH_EXCESS',
    'BTREE_GIST_FINGERPRINT_MISMATCH',
  ]) {
    assert.ok(wrapper.indexOf(gate) < beginPosition, `${gate} must precede BEGIN`)
  }
  assert.match(wrapper, /set local lock_timeout = '5s'/i)
  assert.match(wrapper, /set local statement_timeout = '120s'/i)
  assert.match(wrapper, /pg_advisory_xact_lock/)
  assert.match(wrapper, /set_config\([\s\S]*cleanzi\.profitability_foundation_v2_entrypoint[\s\S]*true/)
  assert.match(wrapper, /set local role :"profitability_foundation_expected_migration_runner"/)
  assert.ok(wrapper.indexOf('set local role :"profitability_foundation_expected_migration_runner"') < includePosition)
  assert.match(wrapper, /commit;[\s\S]*PROFITABILITY_DOMAIN_FOUNDATION_V2_MIGRATION_APPLIED/i)
})

test('raw migration is one-shot guarded and rechecks executor, dedicated runner and exact extension', () => {
  const firstCreate = migration.indexOf('create table if not exists public.service_object')
  assert.ok(firstCreate > 0)
  for (const required of [
    'GUARDED_PROFITABILITY_DOMAIN_FOUNDATION_V2_20260925',
    'PROFITABILITY_FOUNDATION_V2_GUARDED_ENTRYPOINT_REQUIRED',
    'cleanzi.profitability_foundation_v2_expected_executor',
    'cleanzi.profitability_foundation_v2_provisioner',
    'cleanzi.profitability_foundation_v2_bootstrap_grantor',
    'cleanzi.profitability_foundation_v2_migration_runner',
    'cleanzi.profitability_foundation_v2_owner_role',
    'cleanzi.profitability_foundation_v2_runtime_role',
    'cleanzi.profitability_foundation_v2_session_role',
    'cleanzi.profitability_foundation_v2_btree_gist_version',
    'cleanzi.profitability_foundation_v2_backup_reference',
    'PROFITABILITY_FOUNDATION_V2_BTREE_GIST_FINGERPRINT_MISMATCH',
  ]) {
    assert.ok(migration.indexOf(required) > 0 && migration.indexOf(required) < firstCreate, `${required} must guard DDL`)
  }
  assert.match(migration, /session_user <> expected_executor/)
  assert.match(migration, /current_user <> migration_runner_name/)
  assert.match(migration, /set_config\('cleanzi\.profitability_foundation_v2_entrypoint', '', true\)/)
  assert.match(migration, /set local role profitability_owner/)
})

test('raw postflight accepts exactly five PG17 creator edges and three explicit SET edges', () => {
  const start = migration.indexOf('do $profitability_foundation_v2_security_postflight$')
  const endMarker = '$profitability_foundation_v2_security_postflight$;'
  const end = migration.indexOf(endMarker, start)
  assert.ok(start > 0 && end > start, 'Security postflight block is missing.')
  const securityPostflight = migration.slice(start, end + endMarker.length)

  assert.match(securityPostflight, /graph_role_names := foundation_role_names \|\| array\[provisioner_role_name\]/)
  assert.match(securityPostflight, /\) <> 8 then/)
  assert.match(securityPostflight, /\) <> 3 then/)
  assert.match(securityPostflight, /\) <> 5 then/)
  assert.match(securityPostflight, /membership_row\.grantor = 10::oid/)
  assert.match(securityPostflight, /membership_row\.grantor = \([\s\S]*rolname = provisioner_role_name/)
  assert.match(securityPostflight, /membership_row\.admin_option[\s\S]*not membership_row\.inherit_option[\s\S]*not membership_row\.set_option/)
  assert.match(securityPostflight, /membership_row\.set_option[\s\S]*not membership_row\.inherit_option[\s\S]*not membership_row\.admin_option/)
  assert.match(securityPostflight, /role_row\.rolcanlogin[\s\S]*role_row\.rolcreaterole[\s\S]*role_row\.rolconnlimit = -1/)
  assert.match(securityPostflight, /bootstrap_grantor_name <> pg_get_userbyid\(10\)/)
})

test('migration creates exactly the ten bounded Foundation tables without seed or core mutation', () => {
  const createdTables = [...executableMigration.matchAll(/create table if not exists public\.([a-z0-9_]+)/gi)]
    .map((match) => match[1])
    .sort()
  assert.deepEqual(createdTables, [...foundationTables].sort())
  for (const sourceTable of ['organizations', 'organization_member', 'client', 'worker', 'task', 'zone', 'event']) {
    assert.doesNotMatch(executableMigration, new RegExp(`(?:insert\\s+into|update|delete\\s+from|truncate|alter\\s+table)\\s+public\\.${sourceTable}\\b`, 'i'))
    assert.doesNotMatch(executableMigration, new RegExp(`create\\s+trigger[\\s\\S]{0,240}on\\s+public\\.${sourceTable}\\b`, 'i'))
  }
  assert.doesNotMatch(executableMigration, /\b(?:create|drop)\s+extension\b/i)
  assert.doesNotMatch(executableMigration, /\b(?:create|alter|drop)\s+(?:role|user)\b/i)
  assert.doesNotMatch(executableMigration, /\binsert\s+into\b/i)
  assert.doesNotMatch(executableMigration, /\bportal_app\b/i)
  assert.doesNotMatch(migration, /best\s*clean|raf(?:a|á|ał|aĹ‚)|marta|sabina|szymon|@[a-z0-9.-]+\.[a-z]{2,}/iu)
})

test('migration fails closed on partial state and fingerprints columns, constraints, indexes, triggers and owners', () => {
  for (const marker of [
    'PROFITABILITY_FOUNDATION_V2_SOURCE_COLUMN_MISMATCH',
    'PROFITABILITY_FOUNDATION_V2_SOURCE_KEY_MISMATCH',
    'PROFITABILITY_FOUNDATION_V2_PARTIAL_TARGET',
    'PROFITABILITY_FOUNDATION_V2_COLUMN_POSTFLIGHT_FAILED',
    'PROFITABILITY_FOUNDATION_V2_COLUMN_COUNT_MISMATCH',
    'PROFITABILITY_FOUNDATION_V2_CONSTRAINT_POSTFLIGHT_FAILED',
    'PROFITABILITY_FOUNDATION_V2_INDEX_POSTFLIGHT_FAILED',
    'PROFITABILITY_FOUNDATION_V2_TRIGGER_POSTFLIGHT_FAILED',
    'PROFITABILITY_FOUNDATION_V2_EXACT_CATALOG_FINGERPRINT_MISMATCH',
    'PROFITABILITY_FOUNDATION_V2_TABLE_OWNER_MISMATCH',
    'PROFITABILITY_FOUNDATION_V2_AUDIT_SEQUENCE_OWNER_MISMATCH',
  ]) {
    assert.match(migration, new RegExp(marker))
  }
  assert.match(migration, /constraint_row\.convalidated is true/i)
  const sourceGuardStart = migration.indexOf('do $profitability_foundation_v2_source_guard$')
  const sourceGuardEndMarker = '$profitability_foundation_v2_source_guard$;'
  const sourceGuardEnd = migration.indexOf(sourceGuardEndMarker, sourceGuardStart)
  const sourceGuard = migration.slice(sourceGuardStart, sourceGuardEnd + sourceGuardEndMarker.length)
  assert.match(sourceGuard, /from pg_attribute attribute_row[\s\S]*join pg_class relation_row[\s\S]*join pg_namespace namespace_row[\s\S]*join pg_type type_row/i)
  assert.match(sourceGuard, /attribute_row\.attnotnull/i)
  assert.match(sourceGuard, /attribute_row\.atttypmod = required_column\.maximum_length \+ 4/i)
  assert.doesNotMatch(sourceGuard, /information_schema\.columns/i)
  assert.match(migration, /index_meta\.indisvalid is true/i)
  assert.match(migration, /index_meta\.indisready is true/i)
  assert.match(migration, /pg_get_expr\(\s*default_row\.adbin[\s\S]*default_row\.adrelid[\s\S]*true\s*\)/i)
  assert.match(migration, /pg_get_constraintdef\(\s*constraint_row\.oid[\s\S]*true\s*\)/i)
  assert.match(migration, /constraint_row\.confdeltype/i)
  assert.match(migration, /constraint_row\.confupdtype/i)
  assert.match(migration, /constraint_row\.confmatchtype/i)
  assert.match(migration, /constraint_row\.condeferrable/i)
  assert.match(migration, /constraint_row\.condeferred/i)
  assert.match(migration, /pg_get_expr\(\s*trigger_row\.tgqual[\s\S]*trigger_row\.tgrelid[\s\S]*true\s*\)/i)
  assert.match(migration, /f737b7dbdcf7aa08a2c2323d08b2e69b/i)
  for (const triggerName of [
    'profitability_snapshot_immutable_v2',
    'profitability_audit_immutable_v2',
    'worker_cost_rate_no_hard_delete_v2',
    'object_contract_version_no_hard_delete_v2',
    'periodic_work_no_hard_delete_v2',
    'object_equipment_no_hard_delete_v2',
    'object_financial_entry_no_hard_delete_v2',
    'financial_period_no_hard_delete_v2',
  ]) {
    assert.match(migration, new RegExp(triggerName))
  }
})

test('exact PG17 catalog hash covers relation, column, index, function, sequence and rewrite semantics', () => {
  const start = migration.indexOf('do $profitability_foundation_v2_exact_catalog_postflight$')
  const endMarker = '$profitability_foundation_v2_exact_catalog_postflight$;'
  const end = migration.indexOf(endMarker, start)
  assert.ok(start > 0 && end > start, 'Exact catalog postflight block is missing.')
  const exactCatalog = migration.slice(start, end + endMarker.length)

  for (const required of [
    'relation_row.relpersistence',
    'access_method.amname',
    'relation_row.relispartition',
    'relation_row.relreplident',
    'relation_row.reloptions',
    'relation_row.relrowsecurity',
    'relation_row.relforcerowsecurity',
    'attribute_row.atttypid',
    'format_type(',
    'attribute_row.atttypmod',
    'type_row.typtype',
    'type_row.typbasetype',
    'type_row.typdefault',
    'domain_constraint.contypid',
    'attribute_row.attcollation',
    'attribute_row.attgenerated',
    'attribute_row.attidentity',
    'attribute_row.attnum',
    'pg_get_indexdef(',
    'index_meta.indpred',
    'index_meta.indisunique',
    'index_meta.indisprimary',
    'index_meta.indisexclusion',
    'index_meta.indimmediate',
    'index_meta.indisclustered',
    'index_meta.indisvalid',
    'index_meta.indcheckxmin',
    'index_meta.indisready',
    'index_meta.indislive',
    'index_meta.indisreplident',
    'index_meta.indnullsnotdistinct',
    'function_row.proowner',
    'function_row.prolang',
    'function_row.prorettype',
    'function_row.prosecdef',
    'function_row.provolatile',
    'function_row.proconfig',
    'pg_get_functiondef(function_row.oid)',
    'function_row.prosrc',
    'function_row.proacl',
    'sequence_class.relpersistence',
    'sequence_class.relowner',
    'sequence_class.relacl',
    'owner_row.rolname',
    'privilege_row.grantor',
    "acldefault('f', function_row.proowner)",
    'sequence_row.seqincrement',
    'sequence_row.seqmin',
    'sequence_row.seqmax',
    'sequence_row.seqstart',
    'sequence_row.seqcache',
    'sequence_row.seqcycle',
    'pg_policy',
    'pg_rewrite',
    "rewrite_row.rulename <> '_RETURN'",
    'trigger_row.tgenabled',
    'trigger_row.tgisinternal',
    'constraint_relation.relname = any(target_relations)',
  ]) {
    assert.ok(exactCatalog.includes(required), `Missing exact catalog field: ${required}`)
  }
  assert.doesNotMatch(exactCatalog, /\blast_value\b/i)
  assert.match(migration, /\) <> 6 then[\s\S]*PROFITABILITY_FOUNDATION_V2_NONCONSTRAINT_INDEX_COUNT_MISMATCH/i)
})

test('replay validates named-object owner and ACL before any normalization', () => {
  const guardStart = migration.indexOf(
    'do $profitability_foundation_v2_named_object_replay_guard$',
  )
  const guardEndMarker = '$profitability_foundation_v2_named_object_replay_guard$;'
  const guardEnd = migration.indexOf(guardEndMarker, guardStart)
  const sequenceOwnerMutation = migration.indexOf(
    'alter sequence public.profitability_audit_audit_id_seq',
  )
  const functionOwnerMutation = migration.indexOf(
    'alter function public.profitability_foundation_v2_reject_immutable_change()',
  )
  const sequenceAclMutation = migration.indexOf(
    'revoke all privileges on sequence public.profitability_audit_audit_id_seq',
  )
  const functionAclMutation = migration.indexOf(
    'revoke all privileges on function',
  )
  assert.ok(guardStart > 0 && guardEnd > guardStart)
  for (const mutationPosition of [
    sequenceOwnerMutation,
    functionOwnerMutation,
    sequenceAclMutation,
    functionAclMutation,
  ]) {
    assert.ok(mutationPosition > guardEnd, 'Named-object mutation precedes replay guard.')
  }

  const replayGuard = migration.slice(guardStart, guardEnd + guardEndMarker.length)
  for (const required of [
    'cleanzi.profitability_foundation_v2_fresh_install',
    'PROFITABILITY_FOUNDATION_V2_REPLAY_AUDIT_SEQUENCE_OWNER_MISMATCH',
    'PROFITABILITY_FOUNDATION_V2_REPLAY_AUDIT_SEQUENCE_PERSISTENCE_MISMATCH',
    'PROFITABILITY_FOUNDATION_V2_REPLAY_AUDIT_SEQUENCE_ACL_MISMATCH',
    'PROFITABILITY_FOUNDATION_V2_REPLAY_IMMUTABLE_FUNCTION_OWNER_MISMATCH',
    'PROFITABILITY_FOUNDATION_V2_REPLAY_IMMUTABLE_FUNCTION_MISMATCH',
    'PROFITABILITY_FOUNDATION_V2_REPLAY_IMMUTABLE_FUNCTION_ACL_MISMATCH',
    'sequence_row.relowner = owner_role_oid',
    "acldefault('S', sequence_row.relowner)",
    "acldefault('f', function_row.proowner)",
    'except all',
  ]) {
    assert.ok(replayGuard.includes(required), `Missing replay guard field: ${required}`)
  }
  assert.match(replayGuard, /fresh_install'[\s\S]*::boolean then\s+return;/i)
  assert.doesNotMatch(
    executableMigration,
    /create\s+or\s+replace\s+function\s+public\.profitability_foundation_v2_reject_immutable_change/i,
  )
})

test('runtime ACL is an exact allowlist with identity sequence USAGE and owner-only function', () => {
  assert.match(migration, /grant select on table[\s\S]*public\.service_object[\s\S]*public\.periodic_work[\s\S]*public\.periodic_work_zone[\s\S]*to profitability_runtime/i)
  assert.match(migration, /grant select, insert, update on table[\s\S]*public\.worker_cost_rate[\s\S]*public\.object_contract_version[\s\S]*public\.object_equipment[\s\S]*public\.financial_period[\s\S]*to profitability_runtime/i)
  assert.match(migration, /grant select, insert on table[\s\S]*public\.object_financial_entry[\s\S]*public\.profitability_snapshot[\s\S]*public\.profitability_audit[\s\S]*to profitability_runtime/i)
  assert.match(migration, /grant usage on sequence public\.profitability_audit_audit_id_seq\s+to profitability_runtime/i)
  assert.doesNotMatch(migration, /grant\s+execute\s+on\s+function\s+public\.profitability_foundation_v2_reject_immutable_change/i)
  for (const marker of [
    'PROFITABILITY_FOUNDATION_V2_RUNTIME_ACL_MISMATCH',
    'PROFITABILITY_FOUNDATION_V2_DIRECT_ACL_EXCESS',
    'PROFITABILITY_FOUNDATION_V2_COLUMN_ACL_EXCESS',
    'PROFITABILITY_FOUNDATION_V2_AUDIT_SEQUENCE_ACL_MISMATCH',
    'PROFITABILITY_FOUNDATION_V2_FUNCTION_ACL_MISMATCH',
    'PROFITABILITY_FOUNDATION_V2_DEFAULT_ACL_EXCESS',
  ]) {
    assert.match(migration, new RegExp(marker))
  }
  assert.match(migration, /aclexplode\(/)
  assert.match(migration, /pg_default_acl/)
  assert.match(migration, /PROFITABILITY_DOMAIN_FOUNDATION_V2_POSTFLIGHT_ACL_BARRIER/)
})

test('wrapper and raw SQL contain no password, URI or dangerous psql escape', () => {
  const combined = `${wrapper}\n${migration}`
  assert.doesNotMatch(combined, /postgres(?:ql)?:\/\/[^\s'"`]+:[^\s@'"`]+@/iu)
  assert.doesNotMatch(combined, /\bpassword\s*=|DB_PASS|PORTAL_DB_PASS/iu)
  assert.doesNotMatch(combined, /^\s*\\(?:connect|!|copy|gexec)\b/im)
})
