'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { Client } = require('pg')

const ROOT_DIR = path.resolve(__dirname, '..')
const MIGRATION_PATH = path.join(
  ROOT_DIR,
  'dataconnect',
  'migrations',
  '20260927_profitability_source_read_bridge_additive.sql',
)
const WRAPPER_PATH = path.join(
  ROOT_DIR,
  'dataconnect',
  'admin',
  '20260927_profitability_source_read_bridge_apply.psql',
)

const RUN_ARGUMENT = '--run-pg17-harness'
const DATABASE_URL_ENV = 'TEST_PROFITABILITY_SOURCE_READ_DATABASE_URL'
const CONFIRMATION_ENV = 'TEST_PROFITABILITY_SOURCE_READ_EPHEMERAL_CONFIRMATION'
const PSQL_PATH_ENV = 'TEST_PROFITABILITY_SOURCE_READ_PSQL_PATH'
const EXACT_EPHEMERAL_CONFIRMATION =
  'I_CONFIRM_THIS_IS_A_DISPOSABLE_LOCAL_POSTGRESQL_17_SOURCE_READ_DATABASE'
const DATABASE_NAME = 'iclean-room-database'
const BOOTSTRAP_ROLE = 'profitability_source_read_harness_superuser'
const EXECUTOR_ROLE = 'profitability_source_read_harness_executor'
const SOURCE_OWNER_ROLE = 'firebaseowner_iclean-room-database_public'
const RUNTIME_ROLE = 'profitability_runtime'
const LEGAL_READER_ROLE = 'firebasereader'
const LEGAL_WRITER_ROLE = 'firebasewriter'
const LEGAL_PHONE_ROLE = 'cleanzi_phone_runtime'
const INHERITED_READER_ROLE = 'profitability_source_read_inherited_reader'
const BACKUP_REFERENCE = '1790505049269'
const CONFIRMATION = 'APPLY_PROFITABILITY_SOURCE_READ_BRIDGE_ONLY_20260927'

const TARGET_TABLES = Object.freeze(['organization_member', 'event', 'zone'])
const EXPECTED_COLUMNS = Object.freeze({
  organization_member: Object.freeze(['org_id', 'role', 'status', 'uid']),
  event: Object.freeze([
    'duration_sec',
    'end_at',
    'event_id',
    'org_id',
    'start_at',
    'task_id',
    'worker_login',
    'zone_id',
  ]),
  zone: Object.freeze(['client_id', 'id', 'org_id']),
})

const EFFECTS = Object.freeze({
  production: false,
  deploy: false,
  notifications: false,
  downstream: false,
})

const BOOTSTRAP_SQL = String.raw`
create role profitability_runtime
  nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role "firebaseowner_iclean-room-database_public"
  nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role profitability_source_read_harness_executor
  login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role firebasereader
  nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role firebasewriter
  nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role cleanzi_phone_runtime
  nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role profitability_source_read_inherited_reader
  nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;

grant "firebaseowner_iclean-room-database_public"
  to profitability_source_read_harness_executor
  with admin false, inherit false, set true;
grant usage, create on schema public
  to "firebaseowner_iclean-room-database_public";

set role "firebaseowner_iclean-room-database_public";

create table public.organization_member (
  org_id varchar(64) not null,
  uid varchar(128) not null,
  role varchar(32) not null,
  status varchar(24) not null,
  worker_id varchar(64),
  primary key (org_id, uid)
);

create table public.event (
  org_id varchar(64) not null,
  event_id varchar(64) not null,
  worker_login varchar(80) not null,
  start_at timestamptz not null,
  end_at timestamptz,
  duration_sec bigint,
  task_id varchar(180),
  zone_id varchar(64),
  object_id varchar(64),
  status varchar(24),
  primary key (org_id, event_id)
);

create table public.zone (
  org_id varchar(64) not null,
  id varchar(64) not null,
  client_id varchar(64),
  object_id varchar(64),
  name varchar(180),
  primary key (org_id, id)
);

insert into public.organization_member (org_id, uid, role, status, worker_id)
values ('harness-org', 'uid-1', 'WORKER', 'ACTIVE', 'W001');
insert into public.event (
  org_id, event_id, worker_login, start_at, end_at, duration_sec,
  task_id, zone_id, object_id, status
) values (
  'harness-org', 'EV-1', 'worker-1', '2026-09-27T06:00:00Z',
  '2026-09-27T08:00:00Z', 7200, 'TASK-1', 'ZONE-1', 'OBJECT-1', 'CLOSED'
);
insert into public.zone (org_id, id, client_id, object_id, name)
values ('harness-org', 'ZONE-1', 'CLIENT-1', 'OBJECT-1', 'Zone 1');

grant select on table public.organization_member, public.event, public.zone
  to firebasereader;
grant select, insert, update on table
  public.organization_member, public.event, public.zone
  to firebasewriter;
grant select (object_id) on table public.zone to cleanzi_phone_runtime;

reset role;
`

const WRAPPER_VARIABLES = Object.freeze({
  profitability_source_read_expected_database: DATABASE_NAME,
  profitability_source_read_expected_executor: EXECUTOR_ROLE,
  profitability_source_read_expected_source_owner: SOURCE_OWNER_ROLE,
  profitability_source_read_runtime_role: RUNTIME_ROLE,
  profitability_source_read_backup_reference: BACKUP_REFERENCE,
  profitability_source_read_confirmation: CONFIRMATION,
})

function text(value) {
  return String(value ?? '').trim()
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function connectionUrlForRole(connectionString, roleName) {
  const parsed = new URL(connectionString)
  parsed.username = roleName
  parsed.password = ''
  return parsed.toString()
}

function parseLaunchConfiguration({ args = process.argv.slice(2), env = process.env } = {}) {
  if (!args.includes(RUN_ARGUMENT)) {
    throw new Error('PROFITABILITY_SOURCE_READ_HARNESS_RUN_ARGUMENT_REQUIRED')
  }
  if (env[CONFIRMATION_ENV] !== EXACT_EPHEMERAL_CONFIRMATION) {
    throw new Error('PROFITABILITY_SOURCE_READ_EPHEMERAL_CONFIRMATION_REQUIRED')
  }
  if (env.K_SERVICE || env.GAE_ENV || env.CLOUD_SQL_CONNECTION_NAME) {
    throw new Error('PROFITABILITY_SOURCE_READ_LOCAL_HARNESS_FORBIDDEN_IN_CLOUD_RUNTIME')
  }

  const raw = text(env[DATABASE_URL_ENV])
  if (!raw) throw new Error('PROFITABILITY_SOURCE_READ_TEST_DATABASE_URL_REQUIRED')
  const parsed = new URL(raw)
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('PROFITABILITY_SOURCE_READ_TEST_DATABASE_PROTOCOL_INVALID')
  }
  if (parsed.password) {
    throw new Error('PROFITABILITY_SOURCE_READ_TEST_DATABASE_PASSWORD_REJECTED')
  }
  if (!new Set(['127.0.0.1', 'localhost', '[::1]', '::1']).has(parsed.hostname)) {
    throw new Error('PROFITABILITY_SOURCE_READ_TEST_DATABASE_HOST_MUST_BE_LOOPBACK')
  }
  if (parsed.pathname.replace(/^\//, '') !== DATABASE_NAME) {
    throw new Error('PROFITABILITY_SOURCE_READ_TEST_DATABASE_NAME_MISMATCH')
  }
  if (decodeURIComponent(parsed.username) !== BOOTSTRAP_ROLE) {
    throw new Error('PROFITABILITY_SOURCE_READ_TEST_DATABASE_USER_MISMATCH')
  }
  if (!parsed.port || parsed.port === '5432') {
    throw new Error('PROFITABILITY_SOURCE_READ_TEST_DATABASE_RANDOM_PORT_REQUIRED')
  }
  if (parsed.search || parsed.hash) {
    throw new Error('PROFITABILITY_SOURCE_READ_TEST_DATABASE_OPTIONS_REJECTED')
  }

  return {
    connectionString: parsed.toString(),
    psqlPath: text(env[PSQL_PATH_ENV]) || 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe',
  }
}

function wrapperArguments(overrides = {}) {
  const variables = { ...WRAPPER_VARIABLES, ...overrides }
  const result = []
  for (const [name, value] of Object.entries(variables)) {
    result.push('-v', `${name}=${value}`)
  }
  return result
}

function invokePsql({ psqlPath, connectionString, args }) {
  return spawnSync(
    psqlPath,
    ['--dbname', connectionString, '-X', '-v', 'ON_ERROR_STOP=1', ...args],
    { cwd: ROOT_DIR, encoding: 'utf8', env: process.env },
  )
}

function runWrapper({ psqlPath, connectionString, overrides = {} }) {
  const result = invokePsql({
    psqlPath,
    connectionString,
    args: [...wrapperArguments(overrides), '--file', WRAPPER_PATH],
  })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /PROFITABILITY_SOURCE_READ_BRIDGE_20260927_APPLIED/)
  return result
}

function runWrapperRequiresFailure({
  psqlPath,
  connectionString,
  overrides = {},
  marker,
}) {
  const result = invokePsql({
    psqlPath,
    connectionString,
    args: [...wrapperArguments(overrides), '--file', WRAPPER_PATH],
  })
  assert.notEqual(result.status, 0, 'Guarded wrapper unexpectedly succeeded.')
  assert.match(`${result.stdout}\n${result.stderr}`, marker)
  return result
}

function assertRawMigrationRequiresGuard({ psqlPath, connectionString }) {
  const result = invokePsql({
    psqlPath,
    connectionString,
    args: [
      '--command',
      `set role "${SOURCE_OWNER_ROLE}";`,
      '--file',
      MIGRATION_PATH,
    ],
  })
  assert.notEqual(result.status, 0, 'Raw migration unexpectedly succeeded.')
  assert.match(`${result.stdout}\n${result.stderr}`, /PROFITABILITY_SOURCE_READ_GUARDED_ENTRYPOINT_REQUIRED/)
}

async function dataFingerprint(client) {
  const result = []
  for (const tableName of TARGET_TABLES) {
    const rows = await client.query(
      `select coalesce(
         jsonb_agg(to_jsonb(source_row) order by to_jsonb(source_row)::text),
         '[]'::jsonb
       )::text as rows
         from public.${tableName} source_row`,
    )
    result.push([tableName, rows.rows[0].rows])
  }
  return digest(result)
}

async function aclFingerprint(client, { excludeRuntime = false } = {}) {
  const result = await client.query(
    `select acl_kind, table_name, column_name, grantor::text, grantee::text,
            privilege_type, is_grantable
       from (
         select 'TABLE'::text as acl_kind, relation.relname as table_name,
                ''::text as column_name, privilege.grantor,
                privilege.grantee, privilege.privilege_type,
                privilege.is_grantable
           from pg_class relation
           join pg_namespace namespace on namespace.oid = relation.relnamespace
           cross join lateral aclexplode(
             coalesce(relation.relacl, acldefault('r', relation.relowner))
           ) privilege
          where namespace.nspname = 'public'
            and relation.relname = any($1::text[])
         union all
         select 'COLUMN', relation.relname, attribute.attname,
                privilege.grantor, privilege.grantee,
                privilege.privilege_type, privilege.is_grantable
           from pg_class relation
           join pg_namespace namespace on namespace.oid = relation.relnamespace
           join pg_attribute attribute
             on attribute.attrelid = relation.oid
            and attribute.attnum > 0 and not attribute.attisdropped
           cross join lateral aclexplode(attribute.attacl) privilege
          where namespace.nspname = 'public'
            and relation.relname = any($1::text[])
       ) acl_rows
      where not $2::boolean
         or grantee <> (select oid from pg_roles where rolname = $3)
      order by acl_kind, table_name, column_name, grantor, grantee,
               privilege_type, is_grantable`,
    [TARGET_TABLES, excludeRuntime, RUNTIME_ROLE],
  )
  return digest(result.rows)
}

async function runtimeAclRows(client) {
  const result = await client.query(
    `select relation.relname as table_name, attribute.attname as column_name,
            grantor_role.rolname as grantor, privilege.privilege_type,
            privilege.is_grantable
       from pg_class relation
       join pg_namespace namespace on namespace.oid = relation.relnamespace
       join pg_attribute attribute
         on attribute.attrelid = relation.oid
        and attribute.attnum > 0 and not attribute.attisdropped
       cross join lateral aclexplode(attribute.attacl) privilege
       join pg_roles grantee_role on grantee_role.oid = privilege.grantee
       join pg_roles grantor_role on grantor_role.oid = privilege.grantor
      where namespace.nspname = 'public'
        and relation.relname = any($1::text[])
        and grantee_role.rolname = $2
      order by relation.relname, attribute.attname`,
    [TARGET_TABLES, RUNTIME_ROLE],
  )
  return result.rows
}

async function effectiveRuntimePrivilegeSummary(client) {
  const result = await client.query(
    `with expected(table_name, column_name) as (
       values
         ('organization_member', 'org_id'),
         ('organization_member', 'uid'),
         ('organization_member', 'role'),
         ('organization_member', 'status'),
         ('event', 'org_id'),
         ('event', 'event_id'),
         ('event', 'worker_login'),
         ('event', 'start_at'),
         ('event', 'end_at'),
         ('event', 'duration_sec'),
         ('event', 'task_id'),
         ('event', 'zone_id'),
         ('zone', 'org_id'),
         ('zone', 'id'),
         ('zone', 'client_id')
     ), runtime_role as (
       select oid from pg_roles where rolname = $2
     ), source_columns as (
       select relation.relname as table_name, relation.oid as table_oid,
              attribute.attname as column_name
         from pg_class relation
         join pg_namespace namespace on namespace.oid = relation.relnamespace
         join pg_attribute attribute
           on attribute.attrelid = relation.oid
          and attribute.attnum > 0 and not attribute.attisdropped
        where namespace.nspname = 'public'
          and relation.relname = any($1::text[])
     ), effective_columns as (
       select expected.table_name is not null as is_expected,
              has_column_privilege(
                runtime_role.oid, source_columns.table_oid,
                source_columns.column_name, 'SELECT'
              ) as can_select,
              has_column_privilege(
                runtime_role.oid, source_columns.table_oid,
                source_columns.column_name, 'SELECT WITH GRANT OPTION'
              ) as can_grant_select,
              has_column_privilege(
                runtime_role.oid, source_columns.table_oid,
                source_columns.column_name, 'INSERT'
              ) as can_insert,
              has_column_privilege(
                runtime_role.oid, source_columns.table_oid,
                source_columns.column_name, 'UPDATE'
              ) as can_update,
              has_column_privilege(
                runtime_role.oid, source_columns.table_oid,
                source_columns.column_name, 'REFERENCES'
              ) as can_reference
         from source_columns
         cross join runtime_role
         left join expected using (table_name, column_name)
     ), effective_table_count as (
       select count(*)::integer as value
         from pg_class relation
         join pg_namespace namespace on namespace.oid = relation.relnamespace
         cross join runtime_role
         cross join (values
           ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
           ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
         ) checked_privilege(privilege_name)
        where namespace.nspname = 'public'
          and relation.relname = any($1::text[])
          and has_table_privilege(
            runtime_role.oid, relation.oid, checked_privilege.privilege_name
          )
     ), indirect_acl as (
       select privilege.grantee
         from pg_class relation
         join pg_namespace namespace on namespace.oid = relation.relnamespace
         cross join runtime_role
         cross join lateral aclexplode(
           coalesce(relation.relacl, acldefault('r', relation.relowner))
         ) privilege
        where namespace.nspname = 'public'
          and relation.relname = any($1::text[])
          and privilege.grantee <> runtime_role.oid
       union all
       select privilege.grantee
         from pg_class relation
         join pg_namespace namespace on namespace.oid = relation.relnamespace
         join pg_attribute attribute
           on attribute.attrelid = relation.oid
          and attribute.attnum > 0 and not attribute.attisdropped
         cross join runtime_role
         cross join lateral aclexplode(attribute.attacl) privilege
        where namespace.nspname = 'public'
          and relation.relname = any($1::text[])
          and privilege.grantee <> runtime_role.oid
     ), indirect_acl_count as (
       select count(*)::integer as value
         from indirect_acl
         cross join runtime_role
        where case
          when indirect_acl.grantee = 0 then true
          else pg_has_role(runtime_role.oid, indirect_acl.grantee, 'USAGE')
        end
     )
     select effective_table_count.value as effective_table_privilege_count,
            count(*) filter (
              where effective_columns.is_expected and effective_columns.can_select
            )::integer as effective_expected_select_count,
            count(*) filter (
              where (not effective_columns.is_expected and effective_columns.can_select)
                 or effective_columns.can_grant_select
                 or effective_columns.can_insert
                 or effective_columns.can_update
                 or effective_columns.can_reference
            )::integer as effective_excess_column_privilege_count,
            indirect_acl_count.value as indirect_acl_count
       from effective_columns, effective_table_count, indirect_acl_count
      group by effective_table_count.value, indirect_acl_count.value`,
    [TARGET_TABLES, RUNTIME_ROLE],
  )
  return result.rows[0]
}

async function assertExactRuntimeAcl(client) {
  const rows = await runtimeAclRows(client)
  const expected = Object.entries(EXPECTED_COLUMNS)
    .flatMap(([tableName, columns]) => columns.map((columnName) => ({
      table_name: tableName,
      column_name: columnName,
      grantor: SOURCE_OWNER_ROLE,
      privilege_type: 'SELECT',
      is_grantable: false,
    })))
    .sort((left, right) => (
      left.table_name.localeCompare(right.table_name)
      || left.column_name.localeCompare(right.column_name)
    ))
  assert.deepEqual(rows, expected)

  const directTableAcl = await client.query(
    `select relation.relname, privilege.privilege_type
       from pg_class relation
       join pg_namespace namespace on namespace.oid = relation.relnamespace
       cross join lateral aclexplode(
         coalesce(relation.relacl, acldefault('r', relation.relowner))
       ) privilege
       join pg_roles grantee_role on grantee_role.oid = privilege.grantee
      where namespace.nspname = 'public'
        and relation.relname = any($1::text[])
        and grantee_role.rolname = $2`,
    [TARGET_TABLES, RUNTIME_ROLE],
  )
  assert.deepEqual(directTableAcl.rows, [])

  const objectIdRead = await client.query(
    `select has_column_privilege($1, 'public.event', 'object_id', 'SELECT') as event_object,
            has_column_privilege($1, 'public.zone', 'object_id', 'SELECT') as zone_object`,
    [RUNTIME_ROLE],
  )
  assert.deepEqual(objectIdRead.rows[0], { event_object: false, zone_object: false })

  assert.deepEqual(await effectiveRuntimePrivilegeSummary(client), {
    effective_table_privilege_count: 0,
    effective_expected_select_count: 15,
    effective_excess_column_privilege_count: 0,
    indirect_acl_count: 0,
  })
}

async function runHarness(options = {}) {
  const launch = parseLaunchConfiguration(options)
  const admin = new Client({ connectionString: launch.connectionString })
  await admin.connect()
  try {
    const target = await admin.query(
      `select current_database() as database_name,
              current_user as database_user,
              current_setting('server_version_num')::integer as server_version_num,
              coalesce(host(inet_server_addr()), '') as server_address,
              current_setting('port')::integer as server_port,
              pg_is_in_recovery() as in_recovery,
              current_setting('transaction_read_only') = 'on' as read_only,
              (select count(*)::integer from pg_class relation
                join pg_namespace namespace on namespace.oid = relation.relnamespace
               where namespace.nspname = 'public'
                 and relation.relkind in ('r', 'p', 'v', 'm', 'f', 'S')) as relations`,
    )
    const row = target.rows[0]
    assert.equal(row.database_name, DATABASE_NAME)
    assert.equal(row.database_user, BOOTSTRAP_ROLE)
    assert.ok(Number(row.server_version_num) >= 170000 && Number(row.server_version_num) < 180000)
    assert.ok(['127.0.0.1', '::1'].includes(row.server_address))
    assert.notEqual(String(row.server_port), '5432')
    assert.equal(row.in_recovery, false)
    assert.equal(row.read_only, false)
    assert.equal(row.relations, 0)

    await admin.query(BOOTSTRAP_SQL)

    const dataBefore = await dataFingerprint(admin)
    const nonRuntimeAclBefore = await aclFingerprint(admin, { excludeRuntime: true })
    const executorUrl = connectionUrlForRole(launch.connectionString, EXECUTOR_ROLE)

    assertRawMigrationRequiresGuard({
      psqlPath: launch.psqlPath,
      connectionString: executorUrl,
    })

    for (const negative of [
      {
        overrides: { profitability_source_read_expected_database: 'wrong-database' },
        marker: /PROFITABILITY_SOURCE_READ_APPROVED_DATABASE_MISMATCH/,
      },
      {
        overrides: { profitability_source_read_expected_executor: 'wrong_executor' },
        marker: /PROFITABILITY_SOURCE_READ_EXECUTOR_MISMATCH/,
      },
      {
        overrides: { profitability_source_read_expected_source_owner: 'wrong_owner' },
        marker: /PROFITABILITY_SOURCE_READ_SOURCE_OWNER_NAME_MISMATCH/,
      },
      {
        overrides: { profitability_source_read_runtime_role: LEGAL_READER_ROLE },
        marker: /PROFITABILITY_SOURCE_READ_RUNTIME_ROLE_NAME_MISMATCH/,
      },
      {
        overrides: { profitability_source_read_backup_reference: 'stale-backup' },
        marker: /PROFITABILITY_SOURCE_READ_BACKUP_REFERENCE_INVALID/,
      },
      {
        overrides: { profitability_source_read_confirmation: 'WRONG_CONFIRMATION' },
        marker: /PROFITABILITY_SOURCE_READ_CONFIRMATION_MISMATCH/,
      },
    ]) {
      runWrapperRequiresFailure({
        psqlPath: launch.psqlPath,
        connectionString: executorUrl,
        ...negative,
      })
    }

    await admin.query(`set role "${SOURCE_OWNER_ROLE}"`)
    await admin.query('grant select on table public.zone to public')
    await admin.query('reset role')
    const publicTableFingerprint = await aclFingerprint(admin)
    runWrapperRequiresFailure({
      psqlPath: launch.psqlPath,
      connectionString: executorUrl,
      marker: /PROFITABILITY_SOURCE_READ_EFFECTIVE_ACL_EXCESS/,
    })
    assert.equal(await aclFingerprint(admin), publicTableFingerprint)
    await admin.query(`set role "${SOURCE_OWNER_ROLE}"`)
    await admin.query('revoke select on table public.zone from public')
    await admin.query('reset role')
    assert.equal(
      await aclFingerprint(admin, { excludeRuntime: true }),
      nonRuntimeAclBefore,
    )

    await admin.query(`set role "${SOURCE_OWNER_ROLE}"`)
    await admin.query(
      `grant select (org_id) on table public.organization_member to ${RUNTIME_ROLE}`,
    )
    await admin.query('reset role')
    const partialFingerprint = await aclFingerprint(admin)
    runWrapperRequiresFailure({
      psqlPath: launch.psqlPath,
      connectionString: executorUrl,
      marker: /PROFITABILITY_SOURCE_READ_PARTIAL_STATE:1\/15/,
    })
    assert.equal(await aclFingerprint(admin), partialFingerprint)
    await admin.query(`set role "${SOURCE_OWNER_ROLE}"`)
    await admin.query(
      `revoke select (org_id) on table public.organization_member from ${RUNTIME_ROLE}`,
    )
    await admin.query('reset role')

    await admin.query(`set role "${SOURCE_OWNER_ROLE}"`)
    await admin.query(`grant select on table public.zone to ${RUNTIME_ROLE}`)
    await admin.query('reset role')
    const excessFingerprint = await aclFingerprint(admin)
    runWrapperRequiresFailure({
      psqlPath: launch.psqlPath,
      connectionString: executorUrl,
      marker: /PROFITABILITY_SOURCE_READ_RUNTIME_ACL_EXCESS/,
    })
    assert.equal(await aclFingerprint(admin), excessFingerprint)
    await admin.query(`set role "${SOURCE_OWNER_ROLE}"`)
    await admin.query(`revoke select on table public.zone from ${RUNTIME_ROLE}`)
    await admin.query('reset role')

    runWrapper({ psqlPath: launch.psqlPath, connectionString: executorUrl })
    await assertExactRuntimeAcl(admin)
    assert.equal(await dataFingerprint(admin), dataBefore)
    assert.equal(
      await aclFingerprint(admin, { excludeRuntime: true }),
      nonRuntimeAclBefore,
    )
    const firstAclFingerprint = await aclFingerprint(admin)

    await admin.query(`set role "${SOURCE_OWNER_ROLE}"`)
    await admin.query('grant select (object_id) on table public.event to public')
    await admin.query('reset role')
    const publicExcessColumnFingerprint = await aclFingerprint(admin)
    runWrapperRequiresFailure({
      psqlPath: launch.psqlPath,
      connectionString: executorUrl,
      marker: /PROFITABILITY_SOURCE_READ_EFFECTIVE_ACL_EXCESS/,
    })
    assert.equal(await aclFingerprint(admin), publicExcessColumnFingerprint)
    await admin.query(`set role "${SOURCE_OWNER_ROLE}"`)
    await admin.query('revoke select (object_id) on table public.event from public')
    await admin.query('reset role')
    await assertExactRuntimeAcl(admin)
    assert.equal(await aclFingerprint(admin), firstAclFingerprint)

    await admin.query(`set role "${SOURCE_OWNER_ROLE}"`)
    await admin.query(
      `grant select (org_id) on table public.organization_member to ${INHERITED_READER_ROLE}`,
    )
    await admin.query('reset role')
    await admin.query(
      `grant ${INHERITED_READER_ROLE} to ${RUNTIME_ROLE} with inherit true, set false`,
    )
    const inheritedDuplicateFingerprint = await aclFingerprint(admin)
    runWrapperRequiresFailure({
      psqlPath: launch.psqlPath,
      connectionString: executorUrl,
      marker: /PROFITABILITY_SOURCE_READ_EFFECTIVE_ACL_EXCESS/,
    })
    assert.equal(await aclFingerprint(admin), inheritedDuplicateFingerprint)
    await admin.query(`revoke ${INHERITED_READER_ROLE} from ${RUNTIME_ROLE}`)
    await admin.query(`set role "${SOURCE_OWNER_ROLE}"`)
    await admin.query(
      `revoke select (org_id) on table public.organization_member from ${INHERITED_READER_ROLE}`,
    )
    await admin.query('reset role')
    await assertExactRuntimeAcl(admin)
    assert.equal(await aclFingerprint(admin), firstAclFingerprint)

    runWrapper({ psqlPath: launch.psqlPath, connectionString: executorUrl })
    await assertExactRuntimeAcl(admin)
    assert.equal(await aclFingerprint(admin), firstAclFingerprint)
    assert.equal(await dataFingerprint(admin), dataBefore)

    await admin.query(`set role "${SOURCE_OWNER_ROLE}"`)
    await admin.query(
      `grant select (object_id) on table public.event to ${RUNTIME_ROLE}`,
    )
    await admin.query('reset role')
    const postApplyExcess = await aclFingerprint(admin)
    runWrapperRequiresFailure({
      psqlPath: launch.psqlPath,
      connectionString: executorUrl,
      marker: /PROFITABILITY_SOURCE_READ_RUNTIME_ACL_EXCESS/,
    })
    assert.equal(await aclFingerprint(admin), postApplyExcess)
  } finally {
    await admin.end()
  }

  return {
    ok: true,
    effects: EFFECTS,
    checks: [
      'raw-entrypoint-rejected',
      'wrong-database-owner-runtime-backup-confirmation-rejected',
      'partial-state-rejected-without-repair',
      'excess-table-acl-rejected-without-repair',
      'public-table-select-rejected-without-repair',
      'first-apply-exact-column-select',
      'public-excess-column-rejected-without-repair',
      'inherited-duplicate-column-acl-rejected-without-repair',
      'other-role-acl-preserved',
      'source-data-unchanged',
      'idempotent-replay',
      'post-apply-excess-column-acl-rejected-without-repair',
    ],
  }
}

if (require.main === module) {
  runHarness()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error.stack || error)
      process.exitCode = 1
    })
}

module.exports = {
  BACKUP_REFERENCE,
  CONFIRMATION,
  EFFECTS,
  MIGRATION_PATH,
  WRAPPER_PATH,
  assertExactRuntimeAcl,
  assertRawMigrationRequiresGuard,
  effectiveRuntimePrivilegeSummary,
  parseLaunchConfiguration,
  runHarness,
}
