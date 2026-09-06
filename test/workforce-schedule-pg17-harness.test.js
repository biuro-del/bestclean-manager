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
  MIGRATION_OWNER_ROLE,
  MIGRATION_RUNNER_ROLE,
  RUN_ARGUMENT,
  SCHEDULE_RUNTIME_ROLE,
  assertSafeUnmodifiedTarget,
  parseLaunchConfiguration,
} = require(harnessPath)

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

test('fixture jest minimalny, dwutenantowy i rozdziela szeroki portal od runtime Grafiku', () => {
  for (const table of ['organizations', 'organization_member', 'worker', 'service_object']) {
    assert.match(FIXTURE_SQL, new RegExp(`create table public\\.${table}\\b`, 'i'))
  }
  for (const column of [
    'worker_id_normalized',
    'login_normalized',
    'auth_uid',
    'archived_at',
  ]) {
    assert.match(FIXTURE_SQL, new RegExp(`\\b${column}\\b`, 'i'))
  }
  assert.match(FIXTURE_SQL, /harness-alpha/)
  assert.match(FIXTURE_SQL, /harness-beta/)
  assert.match(FIXTURE_SQL, /create role portal_app[\s\S]*login[\s\S]*nosuperuser[\s\S]*nobypassrls/i)
  assert.match(FIXTURE_SQL, /create role workforce_schedule_app[\s\S]*nologin[\s\S]*noinherit[\s\S]*nosuperuser[\s\S]*nobypassrls/i)
  assert.match(FIXTURE_SQL, /create role workforce_schedule_owner[\s\S]*nologin[\s\S]*noinherit[\s\S]*nosuperuser[\s\S]*nobypassrls/i)
  assert.match(FIXTURE_SQL, /create role migration_runner[\s\S]*login[\s\S]*nosuperuser[\s\S]*nobypassrls/i)
  assert.match(FIXTURE_SQL, /grant workforce_schedule_app to portal_app[\s\S]*admin false[\s\S]*inherit false[\s\S]*set true/i)
  assert.match(FIXTURE_SQL, /grant workforce_schedule_owner to migration_runner[\s\S]*admin false[\s\S]*inherit false[\s\S]*set true/i)
  assert.match(FIXTURE_SQL, /grant select on table[\s\S]*public\.worker[\s\S]*public\.service_object[\s\S]*to workforce_schedule_app/i)
  assert.doesNotMatch(FIXTURE_SQL, /grant select on table\s+public\.organizations,[\s\S]*to workforce_schedule_app/i)
  assert.match(FIXTURE_SQL, /grant select, insert, update, delete on table[\s\S]*public\.worker[\s\S]*public\.service_object[\s\S]*to portal_app/i)
  assert.equal(SCHEDULE_RUNTIME_ROLE, 'workforce_schedule_app')
  assert.equal(MIGRATION_OWNER_ROLE, 'workforce_schedule_owner')
  assert.equal(MIGRATION_RUNNER_ROLE, 'migration_runner')
  assert.match(FIXTURE_SQL, /grant usage on schema public to workforce_schedule_owner/i)
  assert.doesNotMatch(FIXTURE_SQL, /grant usage on schema public to workforce_schedule_owner with grant option/i)
  assert.match(FIXTURE_SQL, /grant create on schema public to workforce_schedule_owner/i)
  assert.match(FIXTURE_SQL, /grant update on table public\.worker, public\.service_object[\s\S]*to workforce_schedule_owner/i)
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
  assert.deepEqual(EFFECTS, { delivery: false, notifications: false, downstream: false })
  assert.match(harnessSource, /session_user: 'portal_app'[\s\S]*current_user: 'portal_app'/)
  assert.match(harnessSource, /has_table_privilege\('portal_app', 'public\.workforce_schedule_settings', 'SELECT'\)/)
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

test('schemaReady jest testowane na celowo osłabionych uprawnieniach i każda próba kończy się ROLLBACK', () => {
  assert.match(
    harnessSource,
    /revoke usage on schema public from public, \$\{SCHEDULE_RUNTIME_ROLE\}/i,
  )
  assert.match(harnessSource, /with grant option/i)
  assert.match(harnessSource, /grant \$\{quoteIdentifier\(ownerUser\)\} to \$\{SCHEDULE_RUNTIME_ROLE\}/i)
  assert.match(harnessSource, /grant update, delete on table public\.worker, public\.service_object to \$\{SCHEDULE_RUNTIME_ROLE\}/i)
  assert.match(harnessSource, /set local session authorization portal_app/i)
  assert.match(harnessSource, /create policy workforce_schedule_harness_permissive/i)
  assert.match(harnessSource, /permissivePolicy\.readiness\.ready, false/)
  assert.match(harnessSource, /alter policy workforce_schedule_settings_tenant_policy[\s\S]*\) or true/i)
  assert.match(harnessSource, /forgedExpectedPolicy\.readiness\.ready, false/)
  assert.match(harnessSource, /grant update \(full_name\) on table public\.worker/i)
  assert.match(harnessSource, /grant select \(version\)[\s\S]*with grant option/i)
  assert.match(harnessSource, /grant update \(title\)[\s\S]*workforce_schedule_shift_revision/i)
  assert.match(harnessSource, /workforce_schedule_shift_revision:UPDATE:EXCESS/i)
  assert.match(harnessSource, /runtime:SCHEMA_USAGE/)
  assert.match(harnessSource, /:EXECUTE_GRANT_OPTION/)
  assert.match(harnessSource, /:OWNER_MEMBERSHIP/)
  assert.match(harnessSource, /:UPDATE:EXCESS/)
  assert.ok((harnessSource.match(/client\.query\('rollback'\)/g) || []).length >= 2)
})
