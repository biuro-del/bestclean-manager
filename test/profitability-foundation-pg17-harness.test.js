'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const harness = require('../scripts/test-profitability-foundation-pg17')

const safeEnvironment = Object.freeze({
  [harness.DATABASE_URL_ENV]: `postgresql://${harness.BOOTSTRAP_ROLE}@127.0.0.1:55432/${harness.EXPECTED_DATABASE}`,
  [harness.CONFIRMATION_ENV]: harness.EXACT_CONFIRMATION,
  [harness.PSQL_PATH_ENV]: 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe',
})

function launch(overrides = {}, args = [harness.RUN_ARGUMENT]) {
  return harness.parseLaunchConfiguration({
    args,
    env: { ...safeEnvironment, ...overrides },
  })
}

test('PG17 harness requires an explicit opt-in and exact disposable confirmation', () => {
  assert.throws(() => launch({}, []), /HARNESS_RUN_ARGUMENT_REQUIRED/)
  assert.throws(
    () => launch({ [harness.CONFIRMATION_ENV]: 'yes' }),
    /EPHEMERAL_CONFIRMATION_REQUIRED/,
  )
  assert.equal(launch().safeTarget.databaseName, 'iclean-room-database')
})

test('PG17 harness rejects cloud, non-loopback, default-port and credential-bearing targets', () => {
  assert.throws(() => launch({ K_SERVICE: 'service' }), /FORBIDDEN_IN_CLOUD_RUNTIME/)
  assert.throws(
    () => launch({
      [harness.DATABASE_URL_ENV]: `postgresql://${harness.BOOTSTRAP_ROLE}@db.example:55432/${harness.EXPECTED_DATABASE}`,
    }),
    /HOST_MUST_BE_LOOPBACK/,
  )
  assert.throws(
    () => launch({
      [harness.DATABASE_URL_ENV]: `postgresql://${harness.BOOTSTRAP_ROLE}@127.0.0.1:5432/${harness.EXPECTED_DATABASE}`,
    }),
    /RANDOM_PORT_REQUIRED/,
  )
  assert.throws(
    () => launch({
      [harness.DATABASE_URL_ENV]: `postgresql://${harness.BOOTSTRAP_ROLE}:secret@127.0.0.1:55432/${harness.EXPECTED_DATABASE}`,
    }),
    /PASSWORD_REJECTED/,
  )
  assert.throws(
    () => launch({
      [harness.DATABASE_URL_ENV]: `postgresql://${harness.BOOTSTRAP_ROLE}@127.0.0.1:55432/${harness.EXPECTED_DATABASE}?sslmode=require`,
    }),
    /URL_OPTIONS_REJECTED/,
  )
})

test('PG17 harness accepts only its exact database and bootstrap superuser', () => {
  assert.throws(
    () => launch({
      [harness.DATABASE_URL_ENV]: `postgresql://${harness.BOOTSTRAP_ROLE}@127.0.0.1:55432/postgres`,
    }),
    /DATABASE_NAME_MISMATCH/,
  )
  assert.throws(
    () => launch({
      [harness.DATABASE_URL_ENV]: `postgresql://postgres@127.0.0.1:55432/${harness.EXPECTED_DATABASE}`,
    }),
    /BOOTSTRAP_USER_MISMATCH/,
  )
})

test('Foundation harness delegates role provisioning to a restricted dedicated provisioner', () => {
  assert.equal(harness.MIGRATION_EXECUTOR_ROLE, 'profitability_migration_executor')
  assert.equal(harness.MIGRATION_RUNNER_ROLE, 'profitability_migration_runner')
  assert.equal(harness.PROVISIONER_ROLE, 'profitability_provisioner')
  assert.equal(harness.EPHEMERAL_BOOTSTRAP_ROLE, 'profitability_harness_role_bootstrap')
  assert.equal(harness.ROLE_CONFIRMATION, 'PROVISION_PROFITABILITY_FOUNDATION_V2_ROLES_ONLY_20260926')
  assert.match(harness.ROLE_WRAPPER_PATH, /20260925_profitability_foundation_v2_roles_preprovision\.psql$/)
  for (const roleName of [
    harness.MIGRATION_EXECUTOR_ROLE,
    harness.MIGRATION_RUNNER_ROLE,
    harness.OWNER_ROLE,
    harness.RUNTIME_ROLE,
    harness.SESSION_ROLE,
  ]) {
    assert.doesNotMatch(harness.BOOTSTRAP_SQL, new RegExp(`create role ${roleName}`))
    assert.doesNotMatch(harness.BOOTSTRAP_SQL, new RegExp(`grant ${roleName}`))
  }
  assert.match(harness.BOOTSTRAP_SQL, /create role profitability_foundation_foreign/)
  assert.doesNotMatch(harness.BOOTSTRAP_SQL, /\bportal_app\b/i)
  assert.doesNotMatch(harness.BOOTSTRAP_SQL, /\bcreate\s+extension\b/i)
  assert.doesNotMatch(
    harness.BOOTSTRAP_SQL,
    /grant\s+usage\s+on\s+schema\s+public\s+to\s+profitability_owner/i,
  )
  assert.equal(
    harness.WRAPPER_VARIABLES.profitability_foundation_expected_provisioner,
    harness.PROVISIONER_ROLE,
  )
  assert.equal(
    harness.WRAPPER_VARIABLES.profitability_foundation_expected_bootstrap_grantor,
    harness.BOOTSTRAP_ROLE,
  )

  const source = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'test-profitability-foundation-pg17.js'),
    'utf8',
  )
  assert.match(source, /prepareRestrictedProvisioner/)
  assert.match(
    source,
    /create role \$\{quoteIdentifier\(EPHEMERAL_BOOTSTRAP_ROLE\)\}[\s\S]*login noinherit nosuperuser nocreatedb createrole noreplication nobypassrls[\s\S]*password null connection limit -1/,
  )
  assert.match(source, /connectionUrlForRole\(connectionString, EPHEMERAL_BOOTSTRAP_ROLE\)/)
  assert.match(
    source,
    /bootstrapClient\.query\([\s\S]*create role \$\{quoteIdentifier\(PROVISIONER_ROLE\)\}[\s\S]*login noinherit nosuperuser nocreatedb createrole noreplication nobypassrls[\s\S]*password null connection limit -1/,
  )
  assert.match(source, /grant connect on database[\s\S]*PROVISIONER_ROLE[\s\S]*with grant option/)
  assert.match(source, /grant usage, create on schema public[\s\S]*PROVISIONER_ROLE[\s\S]*with grant option/)
  assert.match(source, /drop role \$\{quoteIdentifier\(EPHEMERAL_BOOTSTRAP_ROLE\)\}/)
  assert.doesNotMatch(
    source,
    /revoke \$\{quoteIdentifier\(PROVISIONER_ROLE\)\} from \$\{quoteIdentifier\(BOOTSTRAP_ROLE\)\}/,
  )
  assert.match(source, /has_table_privilege\(current_user, 'pg_catalog\.pg_authid', 'SELECT'\)/)
  assert.match(source, /Restricted partial-state rejection changed roles, memberships or ACL/)
  assert.match(source, /Restricted replay rejection changed roles, memberships or ACL/)
  assert.match(source, /Catalog-authorized replay changed roles, memberships or ACL/)
  assert.match(source, /Credential-drift rejection changed roles, memberships or ACL/)
  assert.match(source, /Provisioner database-ACL rejection changed roles, memberships or ACL/)
  assert.match(source, /Provisioner schema-ACL rejection changed roles, memberships or public ACL/)
  assert.match(source, /PROFITABILITY_FOUNDATION_V2_ROLES_PROVISIONER_DATABASE_ACL_FORBIDDEN/)
  assert.match(source, /PROFITABILITY_FOUNDATION_V2_ROLES_PROVISIONER_SCHEMA_ACL_FORBIDDEN/)
  assert.match(source, /grant select on pg_catalog\.pg_authid to \$\{quoteIdentifier\(PROVISIONER_ROLE\)\}/)
  assert.match(source, /revoke select on pg_catalog\.pg_authid from \$\{quoteIdentifier\(PROVISIONER_ROLE\)\}/)
  assert.match(source, /cleanzi\.profitability_foundation_v2_provisioner/)
  assert.match(source, /cleanzi\.profitability_foundation_v2_bootstrap_grantor/)
  assert.match(source, /grantor_role\.rolname as grantor_name/)
  assert.match(source, /admin_option: true,[\s\S]*inherit_option: false,[\s\S]*set_option: false/)
  assert.match(source, /assertTargetCredentialsAbsent/)
  assert.match(source, /assertProvisionerRestrictedAndLocked/)
  assert.match(source, /assertExactRoleGraph\(adminClient\)/)
  assert.match(source, /PROFITABILITY_FOUNDATION_V2_ROLES_PREPROVISION_OK/)
})

test('PG17 harness preprovisions btree_gist only through the guarded admin entrypoint', () => {
  assert.equal(harness.EXPECTED_BTREE_GIST_VERSION, '1.7')
  assert.equal(harness.APPROVED_BACKUP_REFERENCE, '1790402094445')
  assert.equal(harness.EXTENSION_CONFIRMATION, 'INSTALL_PROFITABILITY_BTREE_GIST_1_7_ONLY_20260926')
  assert.match(harness.EXTENSION_WRAPPER_PATH, /20260925_profitability_btree_gist_preprovision\.psql$/)
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'test-profitability-foundation-pg17.js'),
    'utf8',
  )
  assert.match(source, /runExtensionPreprovision\([\s\S]*runExtensionPreprovision\(/)
  assert.match(source, /PROFITABILITY_BTREE_GIST_1_7_PREPROVISIONED/)
})

test('Foundation harness has the exact ten-table runtime ACL allowlist', () => {
  assert.deepEqual(harness.FOUNDATION_TABLES, [
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
  ])
  assert.deepEqual(harness.RUNTIME_TABLE_PRIVILEGES.service_object, ['SELECT'])
  assert.deepEqual(harness.RUNTIME_TABLE_PRIVILEGES.periodic_work, ['SELECT'])
  assert.deepEqual(harness.RUNTIME_TABLE_PRIVILEGES.periodic_work_zone, ['SELECT'])
  assert.deepEqual(harness.RUNTIME_TABLE_PRIVILEGES.worker_cost_rate, ['INSERT', 'SELECT', 'UPDATE'])
  assert.deepEqual(harness.RUNTIME_TABLE_PRIVILEGES.object_contract_version, ['INSERT', 'SELECT', 'UPDATE'])
  assert.deepEqual(harness.RUNTIME_TABLE_PRIVILEGES.financial_period, ['INSERT', 'SELECT', 'UPDATE'])
  assert.deepEqual(harness.RUNTIME_TABLE_PRIVILEGES.object_equipment, ['INSERT', 'SELECT', 'UPDATE'])
  for (const tableName of [
    'object_financial_entry',
    'profitability_snapshot',
    'profitability_audit',
  ]) {
    assert.deepEqual(harness.RUNTIME_TABLE_PRIVILEGES[tableName], ['INSERT', 'SELECT'])
  }
})

test('Foundation harness covers replay, fingerprints, ACL attacks and transactional rollback', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'test-profitability-foundation-pg17.js'),
    'utf8',
  )
  for (const required of [
    'assertRawMigrationRequiresGuard',
    'sourceFingerprint',
    'assertZeroSeeds',
    'foundationObjectOids',
    'foundationFingerprint',
    'assertBoundaryAcl',
    'PUBLIC',
    'WITH GRANT OPTION',
    'alter default privileges',
    'grant update (name)',
    "alter column status set default 'INACTIVE'",
    'worker_cost_rate_amount_check',
    'on delete cascade',
    'for each row when (false)',
    'function_row.prosrc',
    'function_row.proconfig',
    'index_meta.indpred',
    'index_meta.indnullsnotdistinct',
    'sequence_meta.seqincrement',
    'sequence_meta.seqmin',
    'sequence_meta.seqmax',
    'sequence_meta.seqstart',
    'sequence_meta.seqcache',
    'sequence_meta.seqcycle',
    'sequence_row.relpersistence',
    'sequence_row.relacl',
    'function_row.proacl',
    "acldefault('S', sequence_row.relowner)",
    'relation.relpersistence',
    'relation.reloptions',
    'pg_policy',
    'pg_rewrite',
    'if false',
    'return new',
    'where archived_at is null or true',
    'maxvalue 9223372036854775806 cycle',
    'set unlogged',
    'enable row level security',
    'create policy service_object_allow_all_adversarial',
    'create domain public.profitability_foundation_v2_name_domain',
    'type timestamptz(0)',
    'type varchar(180) collate "C"',
    'create rule service_object_insert_adversarial',
    'disable trigger all',
    'enable trigger periodic_work_no_hard_delete_v2',
    'superuserReplayDriftCases',
    'alter sequence public.profitability_audit_audit_id_seq set unlogged',
    'alter column audit_id drop identity',
    'owner to ${FOREIGN_ROLE}',
    'grant usage on sequence public.profitability_audit_audit_id_seq',
    'grant execute on function',
    'PROFITABILITY_FOUNDATION_V2_REPLAY_AUDIT_SEQUENCE_OWNER_MISMATCH',
    'PROFITABILITY_FOUNDATION_V2_REPLAY_AUDIT_SEQUENCE_ACL_MISMATCH',
    'PROFITABILITY_FOUNDATION_V2_REPLAY_IMMUTABLE_FUNCTION_OWNER_MISMATCH',
    'PROFITABILITY_FOUNDATION_V2_REPLAY_IMMUTABLE_FUNCTION_ACL_MISMATCH',
    'pre-mutation-named-object-owner-acl-and-persistence-drift-rejected',
    'set local session authorization',
    'Rejected superuser-injected drift was not fully rolled back',
    'PROFITABILITY_FOUNDATION_V2_EXACT_CATALOG_FINGERPRINT_MISMATCH',
    'Rejected injected drift was not fully rolled back',
    'Replay replaced Foundation tables',
    'Replay changed the Foundation fingerprint',
    'runtime-audit-identity-and-equipment-upsert-smoke',
  ]) {
    assert.ok(source.includes(required), `Missing harness coverage marker: ${required}`)
  }
  assert.match(source, /set local role \$\{quoteIdentifier\(MIGRATION_RUNNER_ROLE\)\}/)
  assert.match(source, /constraint_row\.conrelid = foundation\.oid[\s\S]*trigger_row\.tgconstraint = constraint_row\.oid/)
  assert.match(source, /connectionUrlForRole\(launch\.connectionString, MIGRATION_EXECUTOR_ROLE\)/)
  assert.doesNotMatch(source, /process\.env\.DATABASE_URL/)
  assert.doesNotMatch(source, /\bdrop\s+(?:database|schema|table)\b/i)
  assert.deepEqual(harness.EFFECTS, {
    production: false,
    deploy: false,
    notifications: false,
    downstream: false,
  })
})

test('PowerShell runner creates only a random loopback PG17 cluster and cleans it only after success', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'test-profitability-foundation-pg17.ps1'),
    'utf8',
  )
  for (const required of [
    "C:\\Program Files\\PostgreSQL\\17\\bin\\initdb.exe",
    "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_ctl.exe",
    "C:\\Program Files\\PostgreSQL\\17\\bin\\createdb.exe",
    "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe",
    "'127.0.0.1'",
    'TcpListener',
    '$candidate -eq 5432',
    '$SmokeSucceeded -and $ServerStopped',
    'ReparsePoint',
    'EPHEMERAL_DATA_PRESERVED_FOR_DIAGNOSIS',
  ]) {
    assert.ok(source.includes(required), `Missing PowerShell safety marker: ${required}`)
  }
  assert.doesNotMatch(source, /\bgcloud\b|\bfirebase\b/i)
  assert.doesNotMatch(source, /\$env:DATABASE_URL/)
})
