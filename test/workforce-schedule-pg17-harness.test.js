'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const harnessPath = path.join(__dirname, '..', 'scripts', 'test-workforce-schedule-pg17.js')
const harnessSource = fs.readFileSync(harnessPath, 'utf8')
const {
  CONFIRMATION_ENV,
  DATABASE_URL_ENV,
  EFFECTS,
  EXACT_CONFIRMATION,
  FIXTURE_SQL,
  ACL_SENTINEL_ROLE,
  MIGRATION_PATH,
  MIGRATION_OWNER_ROLE,
  MIGRATION_RUNNER_ROLE,
  POSTFLIGHT_ACL_BARRIER,
  RUN_ARGUMENT,
  SCHEDULE_SESSION_ROLE,
  SCHEDULE_RUNTIME_ROLE,
  assertSafeUnmodifiedTarget,
  parseLaunchConfiguration,
} = require(harnessPath)
const migrationSource = fs.readFileSync(MIGRATION_PATH, 'utf8')

function validLaunch(overrides = {}) {
  return {
    args: [RUN_ARGUMENT],
    env: {
      [DATABASE_URL_ENV]: 'postgresql://postgres@127.0.0.1:55432/cleanzi_workforce_schedule_ephemeral_20260906',
      [CONFIRMATION_ENV]: EXACT_CONFIRMATION,
    },
    ...overrides,
  }
}

test('harness wymaga jawnego uruchomienia, osobnego URL i dokładnego potwierdzenia', () => {
  assert.throws(() => parseLaunchConfiguration({ args: [], env: {} }), /HARNESS_RUN_ARGUMENT_REQUIRED/)
  assert.throws(
    () => parseLaunchConfiguration({ args: [RUN_ARGUMENT], env: {} }),
    /EPHEMERAL_CONFIRMATION_REQUIRED/,
  )
  assert.throws(
    () => parseLaunchConfiguration({
      args: [RUN_ARGUMENT],
      env: { [CONFIRMATION_ENV]: EXACT_CONFIRMATION },
    }),
    /TEST_DATABASE_URL_REQUIRED/,
  )
  assert.doesNotMatch(harnessSource, /process\.env\.DATABASE_URL\b/)
  assert.match(harnessSource, /TEST_WORKFORCE_SCHEDULE_DATABASE_URL/)
})

test('harness akceptuje wyłącznie loopback i jednoznacznie nazwaną bazę ephemeral', () => {
  const valid = parseLaunchConfiguration(validLaunch())
  assert.deepEqual(valid.safeTarget, {
    databaseName: 'cleanzi_workforce_schedule_ephemeral_20260906',
    hostname: '127.0.0.1',
    port: '55432',
    username: 'postgres',
  })

  for (const connectionString of [
    'postgresql://postgres@10.0.0.4:5432/cleanzi_workforce_schedule_ephemeral_test',
    'postgresql://postgres@db.example.com:5432/cleanzi_workforce_schedule_ephemeral_test',
    'postgresql://postgres@127.0.0.1:5432/iclean-room-database',
    'postgresql://postgres@127.0.0.1:5432/cleanzi_workforce_schedule_ephemeral_test?sslmode=disable',
  ]) {
    assert.throws(
      () => parseLaunchConfiguration(validLaunch({
        env: {
          [DATABASE_URL_ENV]: connectionString,
          [CONFIRMATION_ENV]: EXACT_CONFIRMATION,
        },
      })),
      /TEST_DATABASE_(?:HOST_MUST_BE_LOOPBACK|NAME_MUST_BE_EPHEMERAL|URL_OPTIONS_REJECTED)/,
    )
  }
})

test('preflight odrzuca wszystko poza pustym, lokalnym PostgreSQL 17', () => {
  const safeTarget = {
    databaseName: 'cleanzi_workforce_schedule_ephemeral_test',
    hostname: '127.0.0.1',
    port: '55432',
    username: 'postgres',
  }
  const target = {
    database_name: safeTarget.databaseName,
    database_user: 'postgres',
    server_version_num: 170010,
    server_address: '127.0.0.1',
    server_port: 55432,
    in_recovery: false,
    user_relations: 0,
    runtime_roles_exist: false,
    owns_database: true,
    is_superuser: true,
    can_create_role: true,
  }
  assert.doesNotThrow(() => assertSafeUnmodifiedTarget(target, safeTarget))
  assert.throws(() => assertSafeUnmodifiedTarget({ ...target, server_version_num: 160009 }, safeTarget), /POSTGRESQL_17_REQUIRED/)
  assert.throws(() => assertSafeUnmodifiedTarget({ ...target, server_address: '10.0.0.4' }, safeTarget), /CONNECTED_SERVER_IS_NOT_LOOPBACK/)
  assert.throws(() => assertSafeUnmodifiedTarget({ ...target, server_port: 5432 }, safeTarget), /TEST_DATABASE_PORT_MISMATCH/)
  assert.throws(() => assertSafeUnmodifiedTarget({ ...target, database_user: 'other-admin' }, safeTarget), /TEST_DATABASE_USER_MISMATCH/)
  assert.throws(() => assertSafeUnmodifiedTarget({ ...target, user_relations: 1 }, safeTarget), /TEST_DATABASE_NOT_EMPTY/)
  assert.throws(() => assertSafeUnmodifiedTarget({ ...target, runtime_roles_exist: true }, safeTarget), /RUNTIME_ROLES_ALREADY_EXIST/)
  assert.throws(() => assertSafeUnmodifiedTarget({ ...target, owns_database: false }, safeTarget), /TEST_DATABASE_OWNER_REQUIRED/)
})

test('fixture ma dwa poprawne tenanty, przypadki UID fail-closed i rozdziela sesję od runtime', () => {
  for (const table of ['organizations', 'organization_member', 'organization_subscription', 'worker', 'client']) {
    assert.match(FIXTURE_SQL, new RegExp(`create table public\\.${table}\\b`, 'i'))
  }
  for (const column of [
    'worker_id_normalized',
    'login_normalized',
    'auth_uid',
    'client_id',
  ]) {
    assert.match(FIXTURE_SQL, new RegExp(`\\b${column}\\b`, 'i'))
  }
  assert.match(FIXTURE_SQL, /harness-alpha/)
  assert.match(FIXTURE_SQL, /harness-beta/)
  assert.match(FIXTURE_SQL, /harness-uid-mismatch/)
  assert.match(FIXTURE_SQL, /harness-no-worker/)
  assert.match(FIXTURE_SQL, /harness-null-auth/)
  assert.match(FIXTURE_SQL, /harness-inactive-worker/)
  assert.match(FIXTURE_SQL, /harness-worker-status/)
  assert.match(FIXTURE_SQL, /harness-cross-worker-source/)
  const membershipFixture = FIXTURE_SQL.match(
    /create table public\.organization_member \([\s\S]*?\n\);/i,
  )?.[0] || ''
  assert.match(membershipFixture, /worker_id varchar\(128\),/i)
  assert.doesNotMatch(membershipFixture, /worker_id varchar\(128\) not null/i)
  assert.match(FIXTURE_SQL, /'Alpha Worker', 'uid-alpha-admin', 'WORKER', true, 'ACTIVE'/i)
  assert.match(FIXTURE_SQL, /'Beta Worker', 'uid-beta-admin', 'WORKER', true, 'ACTIVE'/i)
  assert.match(FIXTURE_SQL, /'uid-mismatch-member'[\s\S]*?'uid-different-worker'/i)
  assert.match(FIXTURE_SQL, /'CLEANING_PROVIDER'/)
  assert.doesNotMatch(FIXTURE_SQL, /'CLEANING_COMPANY'/)
  assert.match(FIXTURE_SQL, /create role workforce_schedule_session[\s\S]*login[\s\S]*noinherit[\s\S]*nosuperuser[\s\S]*nobypassrls/i)
  assert.match(FIXTURE_SQL, /create role workforce_schedule_app[\s\S]*nologin[\s\S]*noinherit[\s\S]*nosuperuser[\s\S]*nobypassrls/i)
  assert.match(FIXTURE_SQL, /create role workforce_schedule_owner[\s\S]*nologin[\s\S]*noinherit[\s\S]*nosuperuser[\s\S]*nobypassrls/i)
  assert.match(FIXTURE_SQL, /create role migration_runner[\s\S]*login[\s\S]*nosuperuser[\s\S]*nobypassrls/i)
  assert.match(FIXTURE_SQL, /grant workforce_schedule_app to workforce_schedule_session[\s\S]*admin false[\s\S]*inherit false[\s\S]*set true/i)
  assert.match(FIXTURE_SQL, /grant workforce_schedule_owner to migration_runner[\s\S]*admin false[\s\S]*inherit false[\s\S]*set true/i)
  assert.match(FIXTURE_SQL, /grant select on table[\s\S]*public\.organization_subscription[\s\S]*public\.worker[\s\S]*public\.client[\s\S]*to workforce_schedule_owner/i)
  assert.doesNotMatch(FIXTURE_SQL, /grant\s+select[\s\S]*?to\s+workforce_schedule_(?:app|session)\s*;/i)
  assert.doesNotMatch(FIXTURE_SQL, /portal_app/i)
  assert.equal(SCHEDULE_SESSION_ROLE, 'workforce_schedule_session')
  assert.equal(SCHEDULE_RUNTIME_ROLE, 'workforce_schedule_app')
  assert.equal(MIGRATION_OWNER_ROLE, 'workforce_schedule_owner')
  assert.equal(MIGRATION_RUNNER_ROLE, 'migration_runner')
  assert.match(FIXTURE_SQL, /grant usage on schema public to workforce_schedule_owner/i)
  assert.doesNotMatch(FIXTURE_SQL, /grant usage on schema public to workforce_schedule_owner with grant option/i)
  assert.match(FIXTURE_SQL, /grant create on schema public to workforce_schedule_owner/i)
  assert.match(FIXTURE_SQL, /grant update on table public\.worker, public\.client[\s\S]*to workforce_schedule_owner/i)
  assert.match(FIXTURE_SQL, /'Aktywny'/)
  assert.match(FIXTURE_SQL, /'Nieaktywny'/)
  assert.match(FIXTURE_SQL, /'FUTURE_STATUS'/)
  assert.match(FIXTURE_SQL, /'CLIENT-NULL'[\s\S]*null/i)
})

test('runner nie sprząta zewnętrznej bazy i pokrywa pełny kontrakt integracyjny', () => {
  assert.doesNotMatch(harnessSource, /\bdrop\b/i)
  assert.doesNotMatch(FIXTURE_SQL, /\bdrop\b/i)
  assert.match(harnessSource, /createWorkforceScheduleRepository/)
  assert.match(harnessSource, /repository\.schemaReady\(\)/)
  assert.match(harnessSource, /repository\.saveSettings/)
  assert.match(harnessSource, /repository\.syncCatalogs/)
  assert.match(harnessSource, /repository\.saveShift/)
  assert.match(harnessSource, /repository\.bootstrap/)
  assert.match(harnessSource, /repository\.archiveShift/)
  assert.match(harnessSource, /repository\.publish/)
  assert.match(harnessSource, /Cross-tenant rows visible/)
  assert.match(harnessSource, /update public\.\$\{table\}/)
  assert.match(harnessSource, /delete from public\.\$\{table\}/)
  assert.match(harnessSource, /second migration execution unexpectedly succeeded/i)
  assert.equal(ACL_SENTINEL_ROLE, 'portal_app')
  assert.equal(POSTFLIGHT_ACL_BARRIER, '-- WORKFORCE_SCHEDULE_POSTFLIGHT_ACL_BARRIER')
  assert.match(harnessSource, /assertUnsafeDefaultAclRejected/)
  assert.match(harnessSource, /alter default privileges for role \$\{MIGRATION_OWNER_ROLE\}/i)
  assert.match(harnessSource, /assertAclPostflightRejectsDrift/)
  assert.match(harnessSource, /assertPreexistingScheduleFunctionRejected/)
  assert.match(harnessSource, /assertRoleGraphPreflightRejected/)
  assert.match(harnessSource, /session_direct_edges: 1/)
  assert.match(harnessSource, /session_set_roles: \[SCHEDULE_RUNTIME_ROLE\]/)
  assert.match(harnessSource, /app_graph_empty: true/)
  assert.match(harnessSource, /assertNoScheduleObjects/)
  assert.match(harnessSource, /assertRawMigrationRequiresGuard/)
  assert.match(harnessSource, /WORKFORCE_SCHEDULE_GUARDED_ENTRYPOINT_REQUIRED/)
  assert.match(harnessSource, /raw-migration-entrypoint-guard/)
  assert.deepEqual(EFFECTS, { delivery: false, notifications: false, downstream: false })
  assert.match(harnessSource, /session_user: SCHEDULE_SESSION_ROLE[\s\S]*current_user: SCHEDULE_SESSION_ROLE/)
  assert.match(harnessSource, /async function assertWorkerUidBindingBoundary\(client\)/)
  assert.match(harnessSource, /Membership without an identically UID-bound active worker passed the worker guard/)
  assert.match(harnessSource, /RLS accepted an actor without a bound active worker/)
  assert.match(harnessSource, /worker_count: 0[\s\S]*?object_count: 0[\s\S]*?schedule_count: 0/)
  assert.match(harnessSource, /firebase-uid-worker-binding/)
  assert.match(harnessSource, /has_table_privilege\('workforce_schedule_session', 'public\.workforce_schedule_settings', 'SELECT'\)/)
  assert.match(harnessSource, /inherited_select: false/)
  assert.match(harnessSource, /set local role \$\{SCHEDULE_RUNTIME_ROLE\}/)
  assert.match(harnessSource, /session_user: MIGRATION_RUNNER_ROLE/)
  assert.match(harnessSource, /postMigrationIdentity/)
  assert.doesNotMatch(harnessSource, /set role \$\{MIGRATION_OWNER_ROLE\}/)
  assert.match(harnessSource, /runtime_cannot_assume_owner/)
  assert.match(harnessSource, /no_privileged_membership/)
  assert.match(harnessSource, /runner_admin_option: false/)
  assert.match(harnessSource, /runner_inherit_option: false/)
  assert.match(harnessSource, /runner_set_option: true/)
  assert.match(harnessSource, /owner_noinherit: true/)
  assert.match(harnessSource, /owner_no_schema_grant_option: true/)
  assert.match(harnessSource, /schedule_role_noinherit: true/)
})

test('migracja fail-closed audytuje default ACL i pelny allowlist nowych obiektow', () => {
  assert.match(migrationSource, /from pg_default_acl default_acl[\s\S]*?default_acl\.defaclobjtype in \('r', 'S', 'f'\)/)
  assert.match(migrationSource, /WORKFORCE_SCHEDULE_UNSAFE_DEFAULT_ACL/)
  assert.match(migrationSource, /WORKFORCE_SCHEDULE_UNSAFE_DEFAULT_ACL_POSTFLIGHT/)
  assert.match(migrationSource, /WORKFORCE_SCHEDULE_TABLE_ACL_POSTFLIGHT_FAILED/)
  assert.match(migrationSource, /WORKFORCE_SCHEDULE_COLUMN_ACL_POSTFLIGHT_FAILED/)
  assert.match(migrationSource, /WORKFORCE_SCHEDULE_SEQUENCE_ACL_POSTFLIGHT_FAILED/)
  assert.match(migrationSource, /WORKFORCE_SCHEDULE_FUNCTION_ACL_POSTFLIGHT_FAILED/)
  assert.match(migrationSource, /WORKFORCE_SCHEDULE_FUNCTION_ALLOWLIST_POSTFLIGHT_FAILED/)
  assert.match(migrationSource, /WORKFORCE_SCHEDULE_SESSION_ROLE_GRAPH_MISMATCH/)
  assert.match(migrationSource, /WORKFORCE_SCHEDULE_APP_ROLE_GRAPH_MISMATCH/)
  assert.match(migrationSource, /attribute\.attacl/)
  assert.match(migrationSource, /relation\.relkind = 'S'/)
  assert.match(migrationSource, /acldefault\('s', relation\.relowner\)/)
  assert.match(migrationSource, /function_row\.proacl/)
  assert.match(migrationSource, /from portal_app/i)
  assert.doesNotMatch(migrationSource, /grant[^;]*\bto\s+portal_app\b/i)
})

test('schemaReady jest testowane na celowo osłabionych uprawnieniach i każda próba kończy się ROLLBACK', () => {
  assert.match(
    harnessSource,
    /revoke usage on schema public from public, \$\{SCHEDULE_RUNTIME_ROLE\}/i,
  )
  assert.match(harnessSource, /with grant option/i)
  assert.match(harnessSource, /grant \$\{quoteIdentifier\(ownerUser\)\} to \$\{SCHEDULE_RUNTIME_ROLE\}/i)
  assert.match(harnessSource, /grant update, delete on table public\.worker, public\.client to \$\{SCHEDULE_RUNTIME_ROLE\}/i)
  assert.match(harnessSource, /set local session authorization \$\{SCHEDULE_SESSION_ROLE\}/i)
  assert.match(harnessSource, /create policy workforce_schedule_harness_permissive/i)
  assert.match(harnessSource, /permissivePolicy\.readiness\.ready, false/)
  assert.match(harnessSource, /alter policy workforce_schedule_settings_tenant_policy[\s\S]*\) or true/i)
  assert.match(harnessSource, /forgedExpectedPolicy\.readiness\.ready, false/)
  assert.match(harnessSource, /grant update \(full_name\) on table public\.worker/i)
  assert.match(harnessSource, /grant select \(version\)[\s\S]*with grant option/i)
  assert.match(harnessSource, /grant update \(title\)[\s\S]*workforce_schedule_shift_revision/i)
  assert.match(harnessSource, /workforce_schedule_shift_revision:UPDATE:EXCESS/i)
  assert.match(harnessSource, /runtime:SCHEMA_USAGE/)
  assert.match(harnessSource, /runtime:SESSION_ROLE_GRAPH/)
  assert.match(harnessSource, /runtime:SESSION_SET_GRAPH/)
  assert.match(harnessSource, /runtime:APP_ROLE_GRAPH/)
  assert.match(harnessSource, /:FUNCTION_ACL'[\s\S]*?:UNEXPECTED_EXECUTE'/)
  assert.match(harnessSource, /create or replace function public\.workforce_schedule_actor_is_active/i)
  assert.match(harnessSource, /workforce_schedule_actor_is_active\(text\):DEFINITION/i)
  assert.match(harnessSource, /:OWNER_MEMBERSHIP/)
  assert.match(harnessSource, /:UPDATE:EXCESS/)
  assert.ok((harnessSource.match(/client\.query\('rollback'\)/g) || []).length >= 2)
})

test('harness sprawdza pełną macierz kolumnowych ACL w osobnych transakcjach i w postflight', () => {
  assert.match(
    harnessSource,
    /async function assertColumnAclDriftRejected\(client\)[\s\S]*for \(const columnAclCase of cases\)[\s\S]*withTemporaryOwnerMutation/,
  )
  for (const [privilegeName, columnName] of [
    ['INSERT', 'version'],
    ['UPDATE', 'version'],
    ['REFERENCES', 'org_id'],
    ['SELECT', 'version'],
  ]) {
    assert.match(
      harnessSource,
      new RegExp(`columnName: '${columnName}',\\s*privilegeName: '${privilegeName}'`),
    )
  }
  assert.match(harnessSource, /privilegeName: 'SELECT'[\s\S]*?grantOption: true/)
  assert.match(harnessSource, /attribute\.attacl is not null[\s\S]*?column_acl_present/)
  assert.match(harnessSource, /from aclexplode\(attribute\.attacl\) privilege/)
  assert.match(harnessSource, /privilege\.privilege_type = \$4::text/)
  assert.match(harnessSource, /privilege\.is_grantable = \$5::boolean/)
  assert.match(harnessSource, /runtime:COLUMN_ACL/)
  assert.match(harnessSource, /runtime:GRANT_OPTION/)
  assert.match(harnessSource, /\$\{relationName\}:REFERENCES:EXCESS/)
  assert.match(harnessSource, /attribute\.attacl is null[\s\S]*?column_acl_cleared/)
  assert.match(harnessSource, /column-acl-matrix-attacl-and-rollback/)

  for (const pattern of [
    /grant insert \(version\) on table public\.workforce_schedule_settings[\s\S]*?ACL_SENTINEL_ROLE/,
    /grant update \(version\) on table public\.workforce_schedule_settings[\s\S]*?ACL_SENTINEL_ROLE/,
    /grant references \(org_id\) on table public\.workforce_schedule_settings[\s\S]*?ACL_SENTINEL_ROLE/,
    /grant select \(version\) on table public\.workforce_schedule_settings[\s\S]*?ACL_SENTINEL_ROLE\} with grant option/,
  ]) {
    assert.match(harnessSource, pattern)
  }
  assert.ok(
    (harnessSource.match(/expected: \/WORKFORCE_SCHEDULE_COLUMN_ACL_POSTFLIGHT_FAILED\//g) || []).length >= 4,
  )
})

test('harness wykrywa tabelowy ACL obcej roli przez relacl i wycofuje go transakcyjnie', () => {
  assert.match(
    harnessSource,
    /async function assertForeignTableAclDriftRejected\(client\)[\s\S]*withTemporaryOwnerMutation/,
  )
  assert.match(
    harnessSource,
    /grant select on table \$\{relationName\} to \$\{ACL_SENTINEL_ROLE\}/,
  )
  assert.match(harnessSource, /relation\.relacl is not null[\s\S]*?table_acl_present/)
  assert.match(harnessSource, /from aclexplode\(relation\.relacl\) privilege/)
  assert.match(harnessSource, /grantee\.rolname = \$2::text/)
  assert.match(harnessSource, /privilege\.privilege_type = 'SELECT'/)
  assert.match(harnessSource, /not privilege\.is_grantable/)
  assert.match(harnessSource, /runtime:TABLE_ACL/)
  assert.match(harnessSource, /foreign_table_acl_cleared/)
  assert.match(harnessSource, /await assertForeignTableAclDriftRejected\(client\)/)
  assert.match(harnessSource, /foreign-table-acl-relacl-and-rollback/)
})
