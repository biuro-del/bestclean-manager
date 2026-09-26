'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const scriptPath = path.join(
  root,
  'dataconnect',
  'admin',
  '20260925_profitability_foundation_v2_roles_preprovision.psql',
)
const script = fs.readFileSync(scriptPath, 'utf8')

test('role preprovision has exact environment, identity and execution gates', () => {
  assert.match(script, /\\set ON_ERROR_STOP on/)
  assert.match(script, /:'profitability_roles_expected_database' = 'iclean-room-database'/)
  assert.match(script, /current_database\(\) = :'profitability_roles_expected_database'/)
  assert.match(script, /session_user = :'profitability_roles_expected_admin'/)
  assert.match(script, /current_user = session_user/)
  assert.match(script, /:'profitability_roles_expected_admin' = 'profitability_provisioner'/)
  assert.match(
    script,
    /:'profitability_roles_expected_bootstrap_grantor' = pg_get_userbyid\(10\)/,
  )
  assert.match(script, /:'profitability_roles_backup_reference' = '1790402094445'/)
  assert.match(script, /PROVISION_PROFITABILITY_FOUNDATION_V2_ROLES_ONLY_20260926/)
  assert.match(script, /server_version_num'[\s\S]*between 170000 and 179999/)
  assert.match(script, /not pg_is_in_recovery\(\)/)
  assert.match(script, /transaction_read_only'\) = 'off'/)
  assert.match(script, /default_transaction_read_only'\) = 'off'/)
  assert.match(script, /admin_role\.rolcanlogin/)
  assert.match(script, /admin_role\.rolcreaterole/)
  assert.match(script, /not admin_role\.rolinherit/)
  assert.match(script, /not admin_role\.rolsuper/)
  assert.match(script, /not admin_role\.rolcreatedb/)
  assert.match(script, /not admin_role\.rolreplication/)
  assert.match(script, /not admin_role\.rolbypassrls/)

  const beginPosition = script.indexOf('\nbegin;\n')
  assert.ok(beginPosition > 0, 'Transaction BEGIN marker is missing.')
  for (const gate of [
    'APPROVED_DATABASE_MISMATCH',
    'ADMIN_IDENTITY_MISMATCH',
    'APPROVED_ADMIN_MISMATCH',
    'BOOTSTRAP_GRANTOR_MISMATCH',
    'APPROVED_BACKUP_MISMATCH',
    'CONFIRMATION_MISMATCH',
    'POSTGRESQL_17_REQUIRED',
    'PRIMARY_DATABASE_REQUIRED',
    'READ_WRITE_SESSION_REQUIRED',
    'RESTRICTED_PROVISIONER_REQUIRED',
  ]) {
    assert.ok(script.indexOf(gate) < beginPosition, `${gate} must precede BEGIN`)
  }
  assert.match(script, /begin;[\s\S]*pg_advisory_xact_lock[\s\S]*commit;/i)
})

test('creates only five restricted target roles and locks every credential', () => {
  for (const [role, login] of [
    ['profitability_migration_executor', 'login'],
    ['profitability_migration_runner', 'nologin'],
    ['profitability_owner', 'nologin'],
    ['profitability_session', 'login'],
    ['profitability_runtime', 'nologin'],
  ]) {
    assert.match(
      script,
      new RegExp(
        `create role ${role} with ${login} password null noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls connection limit -1`,
        'i',
      ),
    )
  }
  assert.doesNotMatch(script, /checked_role\.rolpassword/)
  assert.match(
    script,
    /if found then[\s\S]*from pg_authid credential_role[\s\S]*credential_role\.oid = checked_role\.oid[\s\S]*credential_role\.rolpassword is not null/,
  )
  assert.equal((script.match(/from pg_authid credential_role/g) || []).length, 1)
  assert.doesNotMatch(script, /select\s+credential_role\.rolpassword/i)
  assert.match(
    script,
    /existing_target_role_count > 0[\s\S]*has_table_privilege\(session_user, 'pg_catalog\.pg_authid', 'SELECT'\)/,
  )
  assert.match(script, /when insufficient_privilege then[\s\S]*EXISTING_CREDENTIAL_STATE_UNVERIFIABLE/)
  assert.doesNotMatch(script, /when others/i)
  const postflight = script.slice(script.indexOf('do $postflight$'), script.indexOf('do $lock_provisioner_credential$'))
  assert.doesNotMatch(postflight, /pg_authid|rolpassword/)
  assert.match(script, /checked_role\.rolconfig is not null/)
  assert.match(script, /checked_role\.rolvaliduntil is not null/)
  assert.match(
    script,
    /do \$lock_provisioner_credential\$[\s\S]*session_user <> 'profitability_provisioner'[\s\S]*execute format\('alter role %I password null', session_user\)/i,
  )
  assert.equal((script.match(/\balter\s+(?:role|user)\b/gi) || []).length, 1)
  assert.doesNotMatch(script, /\bdrop\s+(?:role|user)\b/i)
  assert.match(script, /EXISTING_ROLE_ATTRIBUTES_MISMATCH/)

  const withoutPasswordNull = script.replace(/password null/gi, '')
  assert.doesNotMatch(withoutPasswordNull, /\bpassword\s+['"][^'"]+['"]/i)
  assert.doesNotMatch(script, /(?:db_pass|database_url|secret)\s*=/i)
  assert.equal((script.match(/execute 'create role /gi) || []).length, 5)
})

test('membership graph is exactly five PG17 creator edges plus three SET edges', () => {
  assert.match(
    script,
    /grant profitability_migration_runner to profitability_migration_executor with admin false, inherit false, set true/i,
  )
  assert.match(
    script,
    /grant profitability_owner to profitability_migration_runner with admin false, inherit false, set true/i,
  )
  assert.match(
    script,
    /grant profitability_runtime to profitability_session with admin false, inherit false, set true/i,
  )
  assert.match(script, /if 8 <> \([\s\S]*from pg_auth_members/)
  assert.match(script, /UNEXPECTED_EXISTING_MEMBERSHIP/)
  assert.match(script, /UNEXPECTED_POSTFLIGHT_MEMBERSHIP/)
  assert.match(script, /membership\.grantor = provisioner_oid/)
  assert.match(script, /foreach target_role_name in array array\[/)
  assert.match(
    script,
    /membership\.member = provisioner_oid[\s\S]*membership\.grantor = 10::oid[\s\S]*membership\.admin_option[\s\S]*not membership\.inherit_option[\s\S]*not membership\.set_option/,
  )
  assert.equal((script.match(/execute 'grant profitability_/gi) || []).length, 3)
})

test('PG17 automatic creator edges are retained only for the dedicated provisioner', () => {
  assert.match(script, /PostgreSQL 17 deliberately retains one automatic creator edge per target/)
  assert.match(script, /membership\.member = provisioner_oid/)
  assert.match(script, /membership\.grantor = 10::oid/)
  assert.match(script, /membership\.admin_option/)
  assert.match(script, /not membership\.inherit_option/)
  assert.match(script, /not membership\.set_option/)
  assert.doesNotMatch(script, /execute format\('revoke %I from %I'/)
})

test('script does not touch platform data, extensions, portal_app or PUBLIC grants', () => {
  assert.doesNotMatch(script, /\b(?:create|alter|drop|truncate)\s+table\b/i)
  assert.doesNotMatch(script, /\b(?:insert|update|delete|merge)\s+(?:into|from|public\.)/i)
  assert.doesNotMatch(script, /\bcreate\s+extension\b/i)
  assert.doesNotMatch(script, /\bgrant\s+(?:select|insert|update|delete|truncate|references|trigger)\b/i)
  assert.doesNotMatch(script, /(?:create|alter|drop)\s+(?:role|user)\s+portal_app/i)
  assert.doesNotMatch(script, /grant[^;]*\bto\s+portal_app\b/i)
  assert.doesNotMatch(script, /grant\s+portal_app\s+to\b/i)
  assert.doesNotMatch(script, /(?:grant|revoke)[^;\n]*(?:to|from)\s+public\b/i)
  assert.doesNotMatch(script, /(?:grant|revoke)[^;]*\bpublic\s*(?:,|;)/i)
})

test('database and schema ACLs require exact provisioner grant options and minimal target grants', () => {
  assert.match(script, /PROVISIONER_DATABASE_GRANT_OPTION_REQUIRED/)
  assert.match(script, /PROVISIONER_SCHEMA_GRANT_OPTION_REQUIRED/)
  assert.match(script, /PROVISIONER_DATABASE_ACL_FORBIDDEN/)
  assert.match(script, /PROVISIONER_SCHEMA_ACL_FORBIDDEN/)
  assert.match(
    script,
    /privilege\.grantee = provisioner_oid[\s\S]*privilege\.privilege_type = 'CONNECT'[\s\S]*privilege\.is_grantable/,
  )
  assert.match(
    script,
    /privilege\.grantee = provisioner_oid[\s\S]*privilege\.privilege_type in \('USAGE', 'CREATE'\)[\s\S]*privilege\.is_grantable/,
  )
  assert.match(
    script,
    /grant connect on database :"profitability_roles_expected_database"\s+to profitability_migration_executor, profitability_session;/i,
  )
  assert.match(script, /grant usage, create on schema public to profitability_owner;/i)
  assert.match(script, /grant usage on schema public to profitability_runtime;/i)
  assert.match(
    script,
    /revoke create on schema public from\s+profitability_runtime,\s+profitability_session,\s+profitability_migration_executor,\s+profitability_migration_runner;/i,
  )
  assert.doesNotMatch(script, /grant\s+temporary\b/i)
  assert.match(script, /UNEXPECTED_EXISTING_DATABASE_ACL/)
  assert.match(script, /UNEXPECTED_EXISTING_SCHEMA_ACL/)
  assert.match(script, /DATABASE_ACL_POSTFLIGHT_FAILED/)
  assert.match(script, /SCHEMA_ACL_POSTFLIGHT_FAILED/)
  assert.match(script, /has_database_privilege\([\s\S]*'CONNECT'/)
  assert.match(script, /has_schema_privilege\('profitability_owner', 'public', 'USAGE'\)/)
  assert.match(script, /has_schema_privilege\('profitability_owner', 'public', 'CREATE'\)/)
  assert.match(script, /has_schema_privilege\('profitability_runtime', 'public', 'USAGE'\)/)
  for (const role of [
    'profitability_runtime',
    'profitability_session',
    'profitability_migration_executor',
    'profitability_migration_runner',
  ]) {
    assert.match(script, new RegExp(`has_schema_privilege\\('${role}', 'public', 'CREATE'\\)`))
  }
})
