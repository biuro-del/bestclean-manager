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
  '20260927_profitability_source_read_bridge_apply.psql',
)
const migrationPath = path.join(
  root,
  'dataconnect',
  'migrations',
  '20260927_profitability_source_read_bridge_additive.sql',
)
const wrapper = fs.readFileSync(wrapperPath, 'utf8')
const migration = fs.readFileSync(migrationPath, 'utf8')
const executableMigration = migration.replace(/^\s*--.*$/gm, '')
const includeStatement = '\\ir ../migrations/20260927_profitability_source_read_bridge_additive.sql'

const expectedColumns = Object.freeze({
  organization_member: Object.freeze(['org_id', 'uid', 'role', 'status']),
  event: Object.freeze([
    'org_id',
    'event_id',
    'worker_login',
    'start_at',
    'end_at',
    'duration_sec',
    'task_id',
    'zone_id',
  ]),
  zone: Object.freeze(['org_id', 'id', 'client_id']),
})

test('guarded wrapper requires exact production database, source owner, runtime, backup and confirmation', () => {
  assert.match(wrapper, /\\set ON_ERROR_STOP on/)
  for (const variableName of [
    'profitability_source_read_expected_database',
    'profitability_source_read_expected_executor',
    'profitability_source_read_expected_source_owner',
    'profitability_source_read_runtime_role',
    'profitability_source_read_backup_reference',
    'profitability_source_read_confirmation',
  ]) {
    assert.match(wrapper, new RegExp(`\\\\if :\\{\\?${variableName}\\}`))
  }

  assert.match(wrapper, /:'profitability_source_read_expected_database' = 'iclean-room-database'/)
  assert.match(wrapper, /current_database\(\) = :'profitability_source_read_expected_database'/)
  assert.match(wrapper, /:'profitability_source_read_expected_executor' = session_user/)
  assert.match(wrapper, /current_user = session_user/)
  assert.match(wrapper, /firebaseowner_iclean-room-database_public/)
  assert.match(wrapper, /:'profitability_source_read_runtime_role' = 'profitability_runtime'/)
  assert.match(wrapper, /APPLY_PROFITABILITY_SOURCE_READ_BRIDGE_ONLY_20260927/)
  assert.match(wrapper, /profitability_source_read_backup_reference' ~ '\^\[0-9\]\{13\}\$'/)
  assert.match(wrapper, /pg_has_role\([\s\S]*?'SET'/)
})

test('wrapper is PG17 primary read-write only and enters raw SQL once as exact source owner', () => {
  assert.match(wrapper, /server_version_num'\)::integer between 170000 and 179999/)
  assert.match(wrapper, /not pg_is_in_recovery\(\)/)
  assert.match(wrapper, /transaction_read_only'\) = 'off'/)
  assert.match(wrapper, /default_transaction_read_only'\) = 'off'/)
  assert.match(wrapper, /begin;[\s\S]*?commit;/i)
  assert.match(wrapper, /set local lock_timeout = '5s'/i)
  assert.match(wrapper, /set local statement_timeout = '120s'/i)
  assert.match(wrapper, /pg_advisory_xact_lock/)
  assert.match(wrapper, /set local role :"profitability_source_read_expected_source_owner"/)

  const includePosition = wrapper.indexOf(includeStatement)
  assert.notEqual(includePosition, -1)
  assert.equal(wrapper.lastIndexOf(includeStatement), includePosition)
  assert.ok(wrapper.indexOf('set local role :"profitability_source_read_expected_source_owner"') < includePosition)
  assert.ok(includePosition < wrapper.lastIndexOf('commit;'))
})

test('raw SQL is one-shot guarded and rechecks wrong database, owner, runtime, backup and entrypoint', () => {
  const firstGrant = migration.indexOf('grant select (org_id, uid, role, status)')
  assert.ok(firstGrant > 0)
  for (const marker of [
    'PROFITABILITY_SOURCE_READ_GUARDED_ENTRYPOINT_REQUIRED',
    'PROFITABILITY_SOURCE_READ_DATABASE_MISMATCH',
    'PROFITABILITY_SOURCE_READ_EXECUTION_IDENTITY_MISMATCH',
    'PROFITABILITY_SOURCE_READ_RUNTIME_ROLE_NAME_MISMATCH',
    'PROFITABILITY_SOURCE_READ_BACKUP_REFERENCE_INVALID',
    'PROFITABILITY_SOURCE_READ_POSTGRESQL_17_REQUIRED',
    'PROFITABILITY_SOURCE_READ_PRIMARY_DATABASE_REQUIRED',
    'PROFITABILITY_SOURCE_READ_READ_WRITE_SESSION_REQUIRED',
    'PROFITABILITY_SOURCE_READ_SOURCE_OWNER_MISMATCH',
    'PROFITABILITY_SOURCE_READ_RUNTIME_ROLE_INVALID',
  ]) {
    assert.ok(migration.indexOf(marker) > 0 && migration.indexOf(marker) < firstGrant, `${marker} must guard grants`)
  }
  assert.match(migration, /GUARDED_PROFITABILITY_SOURCE_READ_BRIDGE_20260927/)
  assert.match(migration, /perform set_config\('cleanzi\.profitability_source_read_entrypoint', '', true\)/)
  assert.match(migration, /current_user <> expected_source_owner/)
  assert.match(migration, /session_user <> expected_executor/)
})

test('bridge grants only exact column-level SELECT and never grants table privileges', () => {
  for (const [tableName, columns] of Object.entries(expectedColumns)) {
    const escapedColumns = columns.join(', ')
    if (tableName === 'event') {
      assert.match(
        migration,
        new RegExp(`grant select \\(\\s*${columns.join(',\\s*')}\\s*\\)\\s*on table public\\.${tableName} to profitability_runtime`, 'i'),
      )
    } else {
      assert.match(
        migration,
        new RegExp(`grant select \\(${escapedColumns}\\)\\s*on table public\\.${tableName} to profitability_runtime`, 'i'),
      )
    }
  }

  assert.doesNotMatch(executableMigration, /grant\s+select\s+on\s+(?:table\s+)?public\./i)
  assert.doesNotMatch(executableMigration, /grant\s+(?:all|insert|update|delete|truncate|references|trigger|execute|usage)/i)
  assert.doesNotMatch(executableMigration, /grant[\s\S]{0,120}\bpublic\s*;/i)
  assert.doesNotMatch(executableMigration, /revoke\b/i)
  assert.doesNotMatch(executableMigration, /\bobject_id\b/i)
})

test('bridge never changes source data, schema, triggers, roles or default ACL', () => {
  assert.doesNotMatch(
    executableMigration,
    /^\s*(?:insert\s+into|update\s+\S+\s+set|delete\s+from|truncate\s+(?:table\s+)?)/im,
  )
  assert.doesNotMatch(executableMigration, /\b(?:create|alter|drop)\s+(?:table|view|materialized\s+view|trigger|policy|function|role|user|default\s+privileges)\b/i)
  assert.doesNotMatch(executableMigration, /\b(?:create|drop)\s+extension\b/i)
  assert.doesNotMatch(executableMigration, /best\s*clean|raf(?:a|Ăˇ)Ĺ‚|marta|sabina|szymon|@[a-z0-9.-]+\.[a-z]{2,}/iu)
})

test('preflight rejects partial and excess runtime ACL without normalizing it', () => {
  const firstGrant = migration.indexOf('grant select (org_id, uid, role, status)')
  const guard = migration.slice(0, firstGrant)
  assert.match(guard, /PROFITABILITY_SOURCE_READ_PARTIAL_STATE/)
  assert.match(guard, /PROFITABILITY_SOURCE_READ_RUNTIME_ACL_EXCESS/)
  assert.match(guard, /aclexplode\(attribute_row\.attacl\)/)
  assert.match(guard, /aclexplode\([\s\S]*?relation_row\.relacl/)
  assert.match(guard, /runtime_column_acl_count not in \(0, 15\)/)
  assert.match(guard, /has_table_privilege\(/)
  assert.match(guard, /has_column_privilege\(/)
  assert.match(guard, /pg_has_role\(expected_runtime_role, indirect_acl\.grantee, 'USAGE'\)/)
  assert.match(guard, /runtime_effective_table_privilege_count <> 0/)
  assert.match(guard, /runtime_effective_excess_column_privilege_count <> 0/)
  assert.match(guard, /runtime_indirect_acl_count <> 0/)
  assert.match(guard, /PROFITABILITY_SOURCE_READ_EFFECTIVE_ACL_EXCESS/)
  assert.match(guard, /PROFITABILITY_SOURCE_READ_EFFECTIVE_ACL_STATE_MISMATCH/)
  assert.doesNotMatch(guard, /\brevoke\b/i)
})

test('postflight uses attacl/aclexplode and permits only the 15 reviewed runtime grants', () => {
  const postflight = migration.slice(migration.indexOf('do $profitability_source_read_postflight$'))
  assert.match(postflight, /runtime_table_acl_count <> 0/)
  assert.match(postflight, /runtime_column_acl_count <> 15/)
  assert.match(postflight, /runtime_expected_acl_count <> 15/)
  assert.match(postflight, /runtime_excess_acl_count <> 0/)
  assert.match(postflight, /has_table_privilege\(/)
  assert.match(postflight, /has_column_privilege\(/)
  assert.match(postflight, /pg_has_role\('profitability_runtime', indirect_acl\.grantee, 'USAGE'\)/)
  assert.match(postflight, /runtime_effective_table_privilege_count <> 0/)
  assert.match(postflight, /runtime_effective_expected_select_count <> 15/)
  assert.match(postflight, /runtime_effective_excess_column_privilege_count <> 0/)
  assert.match(postflight, /runtime_indirect_acl_count <> 0/)
  assert.match(postflight, /aclexplode\(attribute_row\.attacl\)/)
  assert.match(postflight, /PROFITABILITY_SOURCE_READ_RUNTIME_ACL_POSTFLIGHT_FAILED/)
  assert.match(postflight, /PROFITABILITY_SOURCE_READ_EFFECTIVE_ACL_POSTFLIGHT_FAILED/)
  for (const [tableName, columns] of Object.entries(expectedColumns)) {
    for (const columnName of columns) {
      assert.match(postflight, new RegExp(`'${tableName}', '${columnName}'`))
    }
  }
})

test('unrelated ACL is preserved only when it gives runtime no effective access', () => {
  assert.match(migration, /cleanzi\.profitability_source_read_non_runtime_acl_fingerprint/)
  assert.match(migration, /privilege_row\.grantee <> runtime_role_oid/)
  assert.match(migration, /PROFITABILITY_SOURCE_READ_NON_RUNTIME_ACL_CHANGED/)
  assert.match(migration, /when indirect_acl\.grantee = 0 then true/)
  assert.ok(
    migration.indexOf('PROFITABILITY_SOURCE_READ_EFFECTIVE_ACL_EXCESS')
      < migration.indexOf("cleanzi.profitability_source_read_non_runtime_acl_fingerprint"),
  )
  assert.doesNotMatch(executableMigration, /firebasereader|firebasewriter|cleanzi_phone/i)
  assert.doesNotMatch(executableMigration, /revoke\b/i)
})

test('wrapper and migration contain no credential or remote execution primitive', () => {
  const combined = `${wrapper}\n${migration}`
  assert.doesNotMatch(combined, /postgres(?:ql)?:\/\/[^\s'"`]+:[^\s@'"`]+@/iu)
  assert.doesNotMatch(combined, /\bpassword\s*=|DB_PASS|PORTAL_DB_PASS/iu)
  assert.doesNotMatch(combined, /^\s*\\(?:connect|!|copy|gexec)\b/im)
})
