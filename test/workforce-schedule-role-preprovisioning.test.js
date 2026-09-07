'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const scriptPath = path.join(
  __dirname,
  '..',
  'dataconnect',
  'admin',
  '20260906_workforce_schedule_roles_preprovision.psql',
)
const runbookPath = path.join(
  __dirname,
  '..',
  'docs',
  'workforce-schedule-role-preprovisioning.md',
)
const script = fs.readFileSync(scriptPath, 'utf8')
const runbook = fs.readFileSync(runbookPath, 'utf8')

test('preprovisioning wymaga PostgreSQL 17, dokładnej bazy, administratora i potwierdzenia', () => {
  assert.match(script, /\\set ON_ERROR_STOP on/)
  assert.match(script, /:\{\?workforce_schedule_expected_database\}/)
  assert.match(script, /:'workforce_schedule_expected_database' = 'iclean-room-database'/)
  assert.match(script, /current_database\(\) = :'workforce_schedule_expected_database'/)
  assert.match(script, /:\{\?workforce_schedule_expected_provisioning_admin\}/)
  assert.match(script, /session_user = :'workforce_schedule_expected_provisioning_admin'/)
  assert.match(script, /WORKFORCE_SCHEDULE_PROVISIONING_ADMIN_MISMATCH/)
  assert.match(script, /:\{\?workforce_schedule_role_provision_confirmation\}/)
  assert.match(script, /PROVISION_WORKFORCE_SCHEDULE_ROLES_ONLY_20260906/)
  assert.match(script, /server_version_num'[\s\S]*between 170000 and 179999/)
  assert.match(script, /not pg_is_in_recovery\(\)/)
  assert.match(script, /current_setting\('transaction_read_only'\) = 'off'/)
  assert.match(script, /current_setting\('default_transaction_read_only'\) = 'off'/)
  assert.match(script, /WORKFORCE_SCHEDULE_APPROVED_DATABASE_MISMATCH/)
  assert.match(script, /WORKFORCE_SCHEDULE_PRIMARY_DATABASE_REQUIRED/)
  assert.match(script, /WORKFORCE_SCHEDULE_READ_WRITE_SESSION_REQUIRED/)
  assert.doesNotMatch(script, /\\quit(?:\s|$)/)
  assert.match(script, /raise exception 'WORKFORCE_SCHEDULE_EXPECTED_DATABASE_REQUIRED'/)
  assert.match(script, /raise exception 'WORKFORCE_SCHEDULE_PROVISIONING_ADMIN_MISMATCH'/)
  assert.match(script, /begin;[\s\S]*pg_advisory_xact_lock[\s\S]*commit;/i)
  const beginPosition = script.indexOf('begin;')
  for (const gate of [
    'WORKFORCE_SCHEDULE_APPROVED_DATABASE_MISMATCH',
    'WORKFORCE_SCHEDULE_DATABASE_MISMATCH',
    'WORKFORCE_SCHEDULE_PRIMARY_DATABASE_REQUIRED',
    'WORKFORCE_SCHEDULE_READ_WRITE_SESSION_REQUIRED',
  ]) {
    assert.ok(script.indexOf(gate) < beginPosition, `${gate} must precede BEGIN`)
  }
})

test('role są rozdzielone, restrykcyjne i nie zmieniają istniejących atrybutów', () => {
  assert.match(script, /create role workforce_schedule_session with login password null noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls/i)
  assert.match(script, /create role workforce_schedule_app with nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls/i)
  assert.match(script, /create role workforce_schedule_owner with nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls/i)
  assert.match(script, /create role migration_runner with login password null noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls/i)
  assert.doesNotMatch(script, /\balter\s+role\b/i)
  assert.doesNotMatch(script, /\bdrop\s+(?:role|user)\b/i)
  assert.match(script, /EXISTING_ROLE_ATTRIBUTES_MISMATCH/)
  assert.match(script, /not admin_role\.rolcanlogin[\s\S]*not admin_role\.rolcreaterole/)
  assert.match(script, /admin_role\.rolinherit[\s\S]*admin_role\.rolsuper[\s\S]*admin_role\.rolbypassrls/)
  assert.match(script, /admin_role\.rolcreatedb[\s\S]*admin_role\.rolreplication/)
  assert.match(script, /RESTRICTED_CREATEROLE_ADMIN_REQUIRED/)
})

test('restricted CREATEROLE musi mieć jawne zdolności delegowania ACL źródeł', () => {
  assert.match(script, /CREATEROLE alone never authorizes GRANT on existing database objects/)
  assert.match(script, /has_schema_privilege\(session_user, 'public', 'USAGE WITH GRANT OPTION'\)/)
  assert.match(script, /has_schema_privilege\(session_user, 'public', 'CREATE WITH GRANT OPTION'\)/)
  for (const [relation, privilege] of [
    ['organizations', 'SELECT'],
    ['organizations', 'REFERENCES'],
    ['organization_member', 'SELECT'],
    ['organization_subscription', 'SELECT'],
    ['worker', 'SELECT'],
    ['worker', 'UPDATE'],
    ['client', 'SELECT'],
    ['client', 'UPDATE'],
  ]) {
    assert.match(script, new RegExp(`\\('${relation}'::text, '${privilege}'::text\\)`))
  }
  assert.match(script, /privilege_name \|\| ' WITH GRANT OPTION'/)
  assert.match(script, /PROVISIONING_ADMIN_SCHEMA_GRANT_OPTION_REQUIRED/)
  assert.match(script, /PROVISIONING_ADMIN_SOURCE_GRANT_OPTION_REQUIRED/)
  assert.match(runbook, /samo `CREATEROLE` nie wystarcza do zarządzania ACL tabel/iu)
  assert.match(runbook, /Każde z nich musi obejmować `WITH GRANT OPTION`/u)
})

test('PG17 zachowuje dokładnie cztery ograniczone krawędzie administratora tworzącego role', () => {
  assert.doesNotMatch(script, /created_role_names/)
  assert.doesNotMatch(script, /\brevoke\b/i)
  assert.match(
    script,
    /granted_role\.rolname in \([\s\S]*?'workforce_schedule_session'[\s\S]*?'migration_runner'[\s\S]*?\)[\s\S]*?member_role\.rolname = session_user[\s\S]*?membership\.grantor = 10::oid[\s\S]*?membership\.admin_option[\s\S]*?not membership\.inherit_option[\s\S]*?not membership\.set_option/,
  )
  assert.match(script, /foreach target_role_name in array array\[[\s\S]*?'workforce_schedule_session'[\s\S]*?'migration_runner'/)
  assert.match(script, /WORKFORCE_SCHEDULE_PROVISIONING_ADMIN_EDGE_POSTFLIGHT_FAILED/)
  assert.match(runbook, /dokładnie cztery nieuniknione krawędzie/iu)
  assert.match(runbook, /`ADMIN TRUE`, `SET FALSE`,\s*`INHERIT FALSE`/u)
  assert.match(runbook, /skrypt nie próbuje wykonywać `REVOKE`/iu)
  assert.match(runbook, /same nie dają odziedziczonego dostępu do danych ani prawa\s+`SET ROLE`/iu)
  assert.match(runbook, /nadać sobie nową\s+krawędź z `SET TRUE` lub `INHERIT TRUE`/iu)
  assert.match(runbook, /zabezpieczenie przed\s+przypadkowym użyciem praw, a nie granica bezpieczeństwa/iu)
  assert.doesNotMatch(script, /revoke[^;\n]*portal_app/iu)
})

test('członkostwa PG17 mają wyłącznie SET TRUE, INHERIT FALSE i ADMIN FALSE', () => {
  assert.match(
    script,
    /grant workforce_schedule_app to workforce_schedule_session with admin false, inherit false, set true/i,
  )
  assert.match(
    script,
    /grant workforce_schedule_owner to migration_runner with admin false, inherit false, set true/i,
  )
  assert.match(script, /not membership\.admin_option[\s\S]*not membership\.inherit_option[\s\S]*membership\.set_option/)
  assert.match(script, /UNEXPECTED_EXISTING_MEMBERSHIP/)
  assert.match(script, /MEMBERSHIP_POSTFLIGHT_FAILED/)
})

test('portal_app pozostaje poza rolami i ACL Grafiku', () => {
  assert.match(script, /PORTAL_APP_MEMBERSHIP_FORBIDDEN/)
  assert.match(script, /PORTAL_APP_POSTFLIGHT_FAILED/)
  assert.doesNotMatch(script, /(?:create|alter|drop)\s+(?:role|user)\s+portal_app/i)
  assert.doesNotMatch(script, /grant[\s\S]{0,180}\bto\s+portal_app\b/i)
  assert.doesNotMatch(script, /grant\s+[^;]*\bportal_app\s+to\b/i)
})

test('login i app mają zero odczytu źródeł oraz zero bezpośrednich praw Grafiku', () => {
  assert.doesNotMatch(
    script,
    /grant\s+select(?:\s*,\s*\w+)*\s+on\s+table[^;]*\bto\s+workforce_schedule_(?:session|app)\b/iu,
  )
  assert.match(script, /EXISTING_RUNTIME_SOURCE_SELECT_FORBIDDEN/)
  assert.match(script, /RUNTIME_SOURCE_SELECT_FORBIDDEN/)
  assert.match(script, /RUNTIME_SOURCE_TABLE_ACL_FORBIDDEN/)
  assert.match(script, /RUNTIME_SOURCE_COLUMN_ACL_FORBIDDEN/)
  assert.match(script, /has_table_privilege\([\s\S]*?target_role_name[\s\S]*?'SELECT'/)
  assert.match(script, /has_any_column_privilege\([\s\S]*?target_role_name[\s\S]*?'SELECT'/)
  assert.doesNotMatch(script, /from pg_roles checked_role/)
  assert.match(script, /from pg_roles runtime_role[\s\S]*?runtime_role\.rolname/)
  assert.match(script, /aclexplode\([\s\S]*?relation\.relacl[\s\S]*?privilege\.privilege_type = 'SELECT'/)
  assert.match(script, /aclexplode\([\s\S]*?attribute\.attacl[\s\S]*?privilege\.privilege_type = 'SELECT'/)
  assert.match(script, /LOGIN_DIRECT_TABLE_PRIVILEGE_FORBIDDEN/)
  assert.match(script, /SESSION_WRITE_FORBIDDEN/)
  assert.match(
    script,
    /has_any_column_privilege\(\s*'workforce_schedule_session'[\s\S]*?privilege_name/,
  )
})

test('app i owner dostają wyłącznie minimalne ACL przed migracją', () => {
  assert.doesNotMatch(
    script,
    /grant\s+select(?:\s*,\s*\w+)*\s+on\s+table[^;]*\bto\s+workforce_schedule_app\b/iu,
  )
  assert.match(script, /APP_WRITE_FORBIDDEN/)
  assert.match(
    script,
    /has_any_column_privilege\(\s*'workforce_schedule_app'[\s\S]*?privilege_name/,
  )
  assert.match(script, /grant usage, create on schema public to workforce_schedule_owner/i)
  assert.match(
    script,
    /grant select on table\s+public\.organizations,\s+public\.organization_member,\s+public\.organization_subscription\s+to workforce_schedule_owner/iu,
  )
  assert.match(script, /grant references on table public\.organizations to workforce_schedule_owner/i)
  assert.match(
    script,
    /grant select, update on table\s+public\.worker,\s+public\.client\s+to workforce_schedule_owner/iu,
  )
  assert.match(script, /OWNER_SOURCE_ACL_MISMATCH/)
  assert.match(script, /privilege_name in \('SELECT', 'INSERT', 'UPDATE', 'REFERENCES'\)/)
  assert.match(script, /relation_name = 'organizations' and privilege_name in \('SELECT', 'REFERENCES'\)/)
  assert.match(script, /relation_name in \('organization_member', 'organization_subscription'\)[\s\S]*?privilege_name = 'SELECT'/)
  assert.match(script, /relation_name in \('worker', 'client'\)[\s\S]*privilege_name in \('SELECT', 'UPDATE'\)/)
  assert.match(script, /PLATFORM_TABLE_PRIVILEGE_FORBIDDEN/)
  assert.match(script, /has_any_column_privilege\([\s\S]*?checked\.rolname,[\s\S]*?relation\.oid,[\s\S]*?tested\.privilege_name/)
  assert.match(script, /aclexplode\(relation\.relacl\)/)
  assert.match(script, /RAW_TABLE_GRANT_OPTION_FORBIDDEN/)
  assert.match(script, /aclexplode\(attribute\.attacl\)/)
  assert.match(script, /RAW_COLUMN_GRANT_OPTION_FORBIDDEN/)
  assert.doesNotMatch(script, /information_schema\.(?:table|column)_privileges/)
})

test('portal_app nie może mieć praw do tabel ani funkcji Grafiku', () => {
  assert.match(script, /PORTAL_APP_TABLE_PRIVILEGE_FORBIDDEN/)
  assert.match(script, /has_table_privilege\('portal_app', relation\.oid, tested\.privilege_name\)/)
  assert.match(script, /has_any_column_privilege\('portal_app', relation\.oid, tested\.privilege_name\)/)
  assert.match(script, /PORTAL_APP_FUNCTION_PRIVILEGE_FORBIDDEN/)
  assert.match(script, /has_function_privilege\('portal_app', function_row\.oid, 'EXECUTE'\)/)
  assert.match(runbook, /nie mogą czytać[\s\S]*?`platform_\*`/u)
})

test('hasła nie trafiają do repozytorium i ich aktywacja jest oddzielnym etapem', () => {
  const sqlWithoutPasswordNull = script.replace(/password null/gi, '')
  assert.doesNotMatch(sqlWithoutPasswordNull, /\bpassword\s+['"][^'"]+['"]/i)
  assert.doesNotMatch(script, /WORKFORCE_SCHEDULE_DB_PASS\s*=/i)
  assert.match(runbook, /PASSWORD NULL/)
  assert.match(runbook, /\\password workforce_schedule_session/)
  assert.match(runbook, /WORKFORCE_SCHEDULE_DB_USER/)
  assert.match(runbook, /WORKFORCE_SCHEDULE_DB_PASS/)
  assert.match(runbook, /oddzieln(?:ym|ej) etap/iu)
  assert.match(runbook, /nie jest zgodą na migrację/iu)
  assert.match(runbook, /Plan wyłączenia konta provisioningowego/u)
  assert.match(runbook, /nie wykonuje żadnego z poniższych poleceń/iu)
  assert.match(runbook, /potwierdzić końcowe ACL roli `workforce_schedule_owner`/iu)
  assert.match(runbook, /brak źródłowych ACL ról `workforce_schedule_session`/iu)
  assert.match(runbook, /Nie wolno wykonywać\s+nieprzygotowanego `REVOKE \.\.\. CASCADE`/iu)
  assert.match(runbook, /`NOLOGIN NOCREATEROLE`/u)
  assert.match(runbook, /automatyczne krawędzie[\s\S]*do wyłączonej roli mogą pozostać/iu)
})
