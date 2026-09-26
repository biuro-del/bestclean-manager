'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const { Client } = require('pg')

const ROOT_DIR = path.resolve(__dirname, '..')
const MIGRATION_PATH = path.join(
  ROOT_DIR,
  'dataconnect',
  'migrations',
  '20260925_profitability_foundation_v2_additive.sql',
)
const WRAPPER_PATH = path.join(
  ROOT_DIR,
  'dataconnect',
  'admin',
  '20260925_profitability_domain_foundation_v2_apply.psql',
)
const EXTENSION_WRAPPER_PATH = path.join(
  ROOT_DIR,
  'dataconnect',
  'admin',
  '20260925_profitability_btree_gist_preprovision.psql',
)
const ROLE_WRAPPER_PATH = path.join(
  ROOT_DIR,
  'dataconnect',
  'admin',
  '20260925_profitability_foundation_v2_roles_preprovision.psql',
)

const RUN_ARGUMENT = '--run-pg17-harness'
const DATABASE_URL_ENV = 'TEST_PROFITABILITY_FOUNDATION_DATABASE_URL'
const CONFIRMATION_ENV = 'TEST_PROFITABILITY_FOUNDATION_EPHEMERAL_CONFIRMATION'
const PSQL_PATH_ENV = 'TEST_PROFITABILITY_FOUNDATION_PSQL_PATH'
const EXACT_CONFIRMATION = 'I_CONFIRM_THIS_IS_A_DISPOSABLE_LOCAL_POSTGRESQL_17_FOUNDATION_DATABASE'
const EXPECTED_DATABASE = 'iclean-room-database'
const EXACT_MIGRATION_CONFIRMATION = 'APPLY_PROFITABILITY_DOMAIN_FOUNDATION_V2_ONLY_20260926'
const APPROVED_BACKUP_REFERENCE = '1790402094445'
const EXPECTED_BTREE_GIST_VERSION = '1.7'
const EXTENSION_CONFIRMATION = 'INSTALL_PROFITABILITY_BTREE_GIST_1_7_ONLY_20260926'
const ROLE_CONFIRMATION = 'PROVISION_PROFITABILITY_FOUNDATION_V2_ROLES_ONLY_20260926'
const ENTRYPOINT_GUC = 'cleanzi.profitability_foundation_v2_entrypoint'
const ENTRYPOINT_MARKER = 'GUARDED_PROFITABILITY_DOMAIN_FOUNDATION_V2_20260925'
const POSTFLIGHT_ACL_BARRIER = '-- PROFITABILITY_DOMAIN_FOUNDATION_V2_POSTFLIGHT_ACL_BARRIER'

const BOOTSTRAP_ROLE = 'profitability_harness_superuser'
const EPHEMERAL_BOOTSTRAP_ROLE = 'profitability_harness_role_bootstrap'
const SESSION_ROLE = 'profitability_session'
const RUNTIME_ROLE = 'profitability_runtime'
const OWNER_ROLE = 'profitability_owner'
const MIGRATION_RUNNER_ROLE = 'profitability_migration_runner'
const MIGRATION_EXECUTOR_ROLE = 'profitability_migration_executor'
const FOREIGN_ROLE = 'profitability_foundation_foreign'
const PROVISIONER_ROLE = 'profitability_provisioner'
const IMMUTABILITY_FUNCTION = 'profitability_foundation_v2_reject_immutable_change'

const TARGET_ROLES = Object.freeze([
  MIGRATION_EXECUTOR_ROLE,
  MIGRATION_RUNNER_ROLE,
  OWNER_ROLE,
  SESSION_ROLE,
  RUNTIME_ROLE,
])

const FOUNDATION_TABLES = Object.freeze([
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

const SOURCE_TABLES = Object.freeze([
  'organizations',
  'organization_member',
  'client',
  'worker',
  'task',
  'zone',
  'event',
])

const SOURCE_REFERENCE_COLUMNS = Object.freeze([
  Object.freeze({ table: 'organizations', columns: Object.freeze(['org_id']) }),
  Object.freeze({ table: 'client', columns: Object.freeze(['org_id', 'client_id']) }),
  Object.freeze({ table: 'worker', columns: Object.freeze(['org_id', 'login']) }),
  Object.freeze({ table: 'task', columns: Object.freeze(['org_id', 'id_task']) }),
  Object.freeze({ table: 'zone', columns: Object.freeze(['org_id', 'id']) }),
])

const RUNTIME_TABLE_PRIVILEGES = Object.freeze({
  service_object: Object.freeze(['SELECT']),
  worker_cost_rate: Object.freeze(['INSERT', 'SELECT', 'UPDATE']),
  object_contract_version: Object.freeze(['INSERT', 'SELECT', 'UPDATE']),
  periodic_work: Object.freeze(['SELECT']),
  periodic_work_zone: Object.freeze(['SELECT']),
  object_equipment: Object.freeze(['INSERT', 'SELECT', 'UPDATE']),
  object_financial_entry: Object.freeze(['INSERT', 'SELECT']),
  financial_period: Object.freeze(['INSERT', 'SELECT', 'UPDATE']),
  profitability_snapshot: Object.freeze(['INSERT', 'SELECT']),
  profitability_audit: Object.freeze(['INSERT', 'SELECT']),
})

const ALL_TABLE_PRIVILEGES = Object.freeze([
  'DELETE',
  'INSERT',
  'REFERENCES',
  'SELECT',
  'TRIGGER',
  'TRUNCATE',
  'UPDATE',
])

const WRAPPER_VARIABLES = Object.freeze({
  profitability_foundation_expected_database: EXPECTED_DATABASE,
  profitability_foundation_expected_executor: MIGRATION_EXECUTOR_ROLE,
  profitability_foundation_expected_provisioner: PROVISIONER_ROLE,
  profitability_foundation_expected_bootstrap_grantor: BOOTSTRAP_ROLE,
  profitability_foundation_expected_migration_runner: MIGRATION_RUNNER_ROLE,
  profitability_foundation_owner_role: OWNER_ROLE,
  profitability_foundation_runtime_role: RUNTIME_ROLE,
  profitability_foundation_session_role: SESSION_ROLE,
  profitability_foundation_expected_btree_gist_version: EXPECTED_BTREE_GIST_VERSION,
  profitability_foundation_expected_btree_gist_schema: 'public',
  profitability_foundation_backup_reference: APPROVED_BACKUP_REFERENCE,
  profitability_foundation_confirmation: EXACT_MIGRATION_CONFIRMATION,
})

const EFFECTS = Object.freeze({
  production: false,
  deploy: false,
  notifications: false,
  downstream: false,
})

const BOOTSTRAP_SQL = String.raw`
create role profitability_foundation_foreign
  nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;

revoke create on schema public from public;

create table public.organizations (
  org_id varchar(64) primary key,
  name varchar(180) not null
);

create table public.organization_member (
  org_id varchar(64) not null references public.organizations(org_id),
  uid varchar(128) not null,
  primary key (org_id, uid)
);

create table public.client (
  org_id varchar(64) not null references public.organizations(org_id),
  client_id varchar(64) not null,
  name varchar(180) not null,
  primary key (org_id, client_id)
);

create table public.worker (
  org_id varchar(64) not null references public.organizations(org_id),
  login varchar(80) not null,
  full_name varchar(240) not null,
  primary key (org_id, login)
);

create table public.task (
  org_id varchar(64) not null references public.organizations(org_id),
  id_task varchar(180) not null,
  client_id varchar(64),
  primary key (org_id, id_task)
);

create table public.zone (
  org_id varchar(64) not null references public.organizations(org_id),
  id varchar(64) not null,
  client_id varchar(64),
  primary key (org_id, id)
);

create table public.event (
  org_id varchar(64) not null references public.organizations(org_id),
  event_id varchar(64) not null,
  primary key (org_id, event_id)
);

insert into public.organizations (org_id, name)
values ('harness-alpha', 'Alpha'), ('harness-beta', 'Beta');
insert into public.organization_member (org_id, uid)
values ('harness-alpha', 'uid-a'), ('harness-beta', 'uid-b');
insert into public.client (org_id, client_id, name)
values ('harness-alpha', 'CLIENT-A', 'Client A'), ('harness-beta', 'CLIENT-B', 'Client B');
insert into public.worker (org_id, login, full_name)
values ('harness-alpha', 'worker-a', 'Worker A'), ('harness-beta', 'worker-b', 'Worker B');
insert into public.task (org_id, id_task, client_id)
values ('harness-alpha', 'TASK-A', 'CLIENT-A'), ('harness-beta', 'TASK-B', 'CLIENT-B');
insert into public.zone (org_id, id, client_id)
values ('harness-alpha', 'ZONE-A', 'CLIENT-A'), ('harness-beta', 'ZONE-B', 'CLIENT-B');
insert into public.event (org_id, event_id)
values ('harness-alpha', 'EVENT-A'), ('harness-beta', 'EVENT-B');

grant references (org_id) on table public.organizations to profitability_owner;
grant references (org_id, client_id) on table public.client to profitability_owner;
grant references (org_id, login) on table public.worker to profitability_owner;
grant references (org_id, id_task) on table public.task to profitability_owner;
grant references (org_id, id) on table public.zone to profitability_owner;
`

function text(value) {
  return String(value ?? '').trim()
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`
}

function connectionUrlForRole(connectionString, roleName) {
  const parsed = new URL(connectionString)
  parsed.username = roleName
  parsed.password = ''
  return parsed.toString()
}

function parseLaunchConfiguration({ args = process.argv.slice(2), env = process.env } = {}) {
  if (!args.includes(RUN_ARGUMENT)) throw new Error('PROFITABILITY_FOUNDATION_HARNESS_RUN_ARGUMENT_REQUIRED')
  if (env[CONFIRMATION_ENV] !== EXACT_CONFIRMATION) {
    throw new Error('PROFITABILITY_FOUNDATION_EPHEMERAL_CONFIRMATION_REQUIRED')
  }
  if (env.K_SERVICE || env.GAE_ENV || env.CLOUD_SQL_CONNECTION_NAME) {
    throw new Error('PROFITABILITY_FOUNDATION_LOCAL_HARNESS_FORBIDDEN_IN_CLOUD_RUNTIME')
  }

  const raw = text(env[DATABASE_URL_ENV])
  if (!raw) throw new Error('PROFITABILITY_FOUNDATION_TEST_DATABASE_URL_REQUIRED')
  const parsed = new URL(raw)
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('PROFITABILITY_FOUNDATION_TEST_DATABASE_PROTOCOL_INVALID')
  }
  if (parsed.password) throw new Error('PROFITABILITY_FOUNDATION_TEST_DATABASE_PASSWORD_REJECTED')
  if (!new Set(['127.0.0.1', 'localhost', '[::1]', '::1']).has(parsed.hostname)) {
    throw new Error('PROFITABILITY_FOUNDATION_TEST_DATABASE_HOST_MUST_BE_LOOPBACK')
  }
  if (parsed.pathname.replace(/^\//, '') !== EXPECTED_DATABASE) {
    throw new Error('PROFITABILITY_FOUNDATION_TEST_DATABASE_NAME_MISMATCH')
  }
  if (parsed.search || parsed.hash) {
    throw new Error('PROFITABILITY_FOUNDATION_TEST_DATABASE_URL_OPTIONS_REJECTED')
  }
  if (!parsed.username) throw new Error('PROFITABILITY_FOUNDATION_TEST_DATABASE_USER_REQUIRED')
  if (decodeURIComponent(parsed.username) !== BOOTSTRAP_ROLE) {
    throw new Error('PROFITABILITY_FOUNDATION_TEST_DATABASE_BOOTSTRAP_USER_MISMATCH')
  }
  if (!parsed.port || parsed.port === '5432') {
    throw new Error('PROFITABILITY_FOUNDATION_TEST_DATABASE_RANDOM_PORT_REQUIRED')
  }

  const psqlPath = text(env[PSQL_PATH_ENV]) || 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe'
  return {
    connectionString: parsed.toString(),
    psqlPath,
    safeTarget: {
      databaseName: EXPECTED_DATABASE,
      hostname: parsed.hostname,
      port: parsed.port,
      username: decodeURIComponent(parsed.username),
    },
  }
}

async function inspectUnmodifiedTarget(client) {
  const result = await client.query(
    `select current_database() as database_name,
            current_user as database_user,
            current_setting('server_version_num')::integer as server_version_num,
            coalesce(host(inet_server_addr()), '') as server_address,
            current_setting('port')::integer as server_port,
            pg_is_in_recovery() as in_recovery,
            current_setting('transaction_read_only') = 'on' as read_only,
            (select count(*)::integer
               from pg_class relation
               join pg_namespace namespace on namespace.oid = relation.relnamespace
              where namespace.nspname = 'public'
                and relation.relkind in ('r', 'p', 'v', 'm', 'f', 'S')) as user_relations,
            exists (
              select 1 from pg_roles
               where rolname = any($1::text[])
            ) as harness_roles_exist,
            (select datdba = (select oid from pg_roles where rolname = current_user)
               from pg_database where datname = current_database()) as owns_database,
            (select rolsuper from pg_roles where rolname = current_user) as is_superuser`,
    [[SESSION_ROLE, RUNTIME_ROLE, OWNER_ROLE, MIGRATION_RUNNER_ROLE, MIGRATION_EXECUTOR_ROLE, FOREIGN_ROLE]],
  )
  return result.rows[0]
}

function assertSafeUnmodifiedTarget(target, safeTarget) {
  assert.equal(target.database_name, safeTarget.databaseName, 'PROFITABILITY_FOUNDATION_TEST_DATABASE_MISMATCH')
  assert.equal(target.database_user, safeTarget.username, 'PROFITABILITY_FOUNDATION_TEST_DATABASE_USER_MISMATCH')
  assert.ok(
    Number(target.server_version_num) >= 170000 && Number(target.server_version_num) < 180000,
    'PROFITABILITY_FOUNDATION_POSTGRESQL_17_REQUIRED',
  )
  assert.ok(['127.0.0.1', '::1'].includes(target.server_address), 'PROFITABILITY_FOUNDATION_CONNECTED_SERVER_NOT_LOOPBACK')
  assert.equal(String(target.server_port), String(safeTarget.port), 'PROFITABILITY_FOUNDATION_TEST_DATABASE_PORT_MISMATCH')
  assert.equal(target.in_recovery, false, 'PROFITABILITY_FOUNDATION_PRIMARY_REQUIRED')
  assert.equal(target.read_only, false, 'PROFITABILITY_FOUNDATION_READ_WRITE_REQUIRED')
  assert.equal(target.user_relations, 0, 'PROFITABILITY_FOUNDATION_TEST_DATABASE_NOT_EMPTY')
  assert.equal(target.harness_roles_exist, false, 'PROFITABILITY_FOUNDATION_HARNESS_ROLE_ALREADY_EXISTS')
  assert.equal(target.owns_database, true, 'PROFITABILITY_FOUNDATION_TEST_DATABASE_OWNER_REQUIRED')
  assert.equal(target.is_superuser, true, 'PROFITABILITY_FOUNDATION_TEST_SUPERUSER_REQUIRED')
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function exactCatalogFingerprintFromMigration(migrationSql) {
  const match = migrationSql.match(
    /expected_fingerprint constant text := '([a-f0-9]{32})';/,
  )
  assert.ok(match, 'PROFITABILITY_FOUNDATION_EXACT_CATALOG_FINGERPRINT_MISSING')
  return match[1]
}

async function sourceFingerprint(client) {
  const result = []
  for (const tableName of SOURCE_TABLES) {
    const rows = await client.query(
      `select coalesce(jsonb_agg(to_jsonb(source_row) order by to_jsonb(source_row)::text), '[]'::jsonb)::text as rows
         from public.${quoteIdentifier(tableName)} source_row`,
    )
    const schema = await client.query(
      `select attribute.attname as column_name,
              format_type(attribute.atttypid, attribute.atttypmod) as data_type,
              attribute.attnotnull as not_null,
              pg_get_expr(default_row.adbin, default_row.adrelid, true) as column_default
         from pg_attribute attribute
         left join pg_attrdef default_row
           on default_row.adrelid = attribute.attrelid
          and default_row.adnum = attribute.attnum
        where attribute.attrelid = $1::regclass
          and attribute.attnum > 0
          and not attribute.attisdropped
        order by attribute.attnum`,
      [`public.${tableName}`],
    )
    result.push({ tableName, rows: rows.rows[0].rows, schema: schema.rows })
  }
  return digest(result)
}

async function foundationObjectOids(client) {
  const result = await client.query(
    `select relation.relname, relation.oid::text as oid
       from pg_class relation
       join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = any($1::text[])
      order by relation.relname`,
    [FOUNDATION_TABLES],
  )
  return result.rows
}

async function foundationFingerprint(client) {
  const catalog = await client.query(
    `with foundation_relations as (
       select relation.oid, relation.relname
         from pg_class relation
         join pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = any($1::text[])
     )
     select jsonb_build_object(
       'relations', (
         select jsonb_agg(to_jsonb(row_data) order by row_data.relname)
           from (
              select relation.relname, relation.relkind, owner_role.rolname as owner,
                     relation.relpersistence, access_method.amname as access_method,
                     relation.relispartition, relation.relreplident,
                     (select jsonb_agg(option_entry order by option_entry)
                        from unnest(coalesce(relation.reloptions, array[]::text[]))
                             as relation_option(option_entry)) as reloptions,
                     relation.relrowsecurity, relation.relforcerowsecurity,
                     coalesce(relation.relacl::text, '') as acl
               from foundation_relations foundation
               join pg_class relation on relation.oid = foundation.oid
               join pg_roles owner_role on owner_role.oid = relation.relowner
               left join pg_am access_method on access_method.oid = relation.relam
           ) row_data
       ),
       'columns', (
         select jsonb_agg(to_jsonb(row_data) order by row_data.table_name, row_data.ordinal)
           from (
             select foundation.relname as table_name, attribute.attnum as ordinal,
                    attribute.attname, attribute.atttypid::integer as type_oid,
                    format_type(attribute.atttypid, attribute.atttypmod) as data_type,
                    attribute.atttypmod as type_modifier,
                    type_namespace.nspname as type_schema, type_row.typname as type_name,
                    type_row.typtype as type_kind,
                    type_row.typbasetype::integer as domain_base_type_oid,
                    case when type_row.typbasetype = 0 then null
                         else format_type(type_row.typbasetype, type_row.typtypmod)
                    end as domain_base_type,
                    type_row.typdefault as domain_default,
                    (select jsonb_agg(
                              jsonb_build_object(
                                'name', domain_constraint.conname,
                                'definition', pg_get_constraintdef(domain_constraint.oid, true)
                              )
                              order by domain_constraint.conname
                            )
                       from pg_constraint domain_constraint
                      where domain_constraint.contypid = type_row.oid) as domain_constraints,
                    attribute.attnotnull, attribute.attidentity, attribute.attgenerated,
                    collation_namespace.nspname as collation_schema,
                    collation_row.collname as collation,
                    pg_get_expr(default_row.adbin, default_row.adrelid, true) as column_default,
                    coalesce(attribute.attacl::text, '') as acl
               from foundation_relations foundation
               join pg_attribute attribute on attribute.attrelid = foundation.oid
               join pg_type type_row on type_row.oid = attribute.atttypid
               join pg_namespace type_namespace on type_namespace.oid = type_row.typnamespace
               left join pg_collation collation_row on collation_row.oid = attribute.attcollation
               left join pg_namespace collation_namespace
                 on collation_namespace.oid = collation_row.collnamespace
               left join pg_attrdef default_row
                 on default_row.adrelid = attribute.attrelid
                and default_row.adnum = attribute.attnum
              where attribute.attnum > 0 and not attribute.attisdropped
           ) row_data
       ),
       'constraints', (
         select jsonb_agg(to_jsonb(row_data) order by row_data.table_name, row_data.constraint_name)
           from (
             select foundation.relname as table_name, constraint_row.conname as constraint_name,
                    constraint_row.contype, constraint_row.convalidated,
                     constraint_row.condeferrable, constraint_row.condeferred,
                     constraint_row.confdeltype, constraint_row.confupdtype,
                     constraint_row.confmatchtype,
                     pg_get_constraintdef(constraint_row.oid, true) as definition
               from foundation_relations foundation
               join pg_constraint constraint_row on constraint_row.conrelid = foundation.oid
           ) row_data
       ),
       'indexes', (
         select jsonb_agg(to_jsonb(row_data) order by row_data.table_name, row_data.index_name)
           from (
              select foundation.relname as table_name, index_relation.relname as index_name,
                     access_method.amname as method,
                     index_meta.indisunique, index_meta.indisprimary,
                     index_meta.indisexclusion, index_meta.indimmediate,
                     index_meta.indisclustered, index_meta.indisvalid,
                     index_meta.indcheckxmin, index_meta.indisready,
                     index_meta.indislive, index_meta.indisreplident,
                     index_meta.indnullsnotdistinct,
                     index_meta.indnkeyatts, index_meta.indnatts,
                     pg_get_indexdef(index_meta.indexrelid, 0, true) as definition,
                     pg_get_expr(index_meta.indpred, index_meta.indrelid, true) as predicate
               from foundation_relations foundation
               join pg_index index_meta on index_meta.indrelid = foundation.oid
               join pg_class index_relation on index_relation.oid = index_meta.indexrelid
               join pg_am access_method on access_method.oid = index_relation.relam
            ) row_data
        ),
       'user_triggers', (
          select jsonb_agg(to_jsonb(row_data) order by row_data.table_name, row_data.trigger_name)
            from (
              select foundation.relname as table_name, trigger_row.tgname as trigger_name,
                     trigger_row.tgenabled, trigger_row.tgtype,
                     pg_get_triggerdef(trigger_row.oid, true) as definition,
                     pg_get_expr(trigger_row.tgqual, trigger_row.tgrelid, true) as predicate
               from foundation_relations foundation
               join pg_trigger trigger_row on trigger_row.tgrelid = foundation.oid
              where not trigger_row.tgisinternal
            ) row_data
        ),
       'internal_ri_triggers', (
         select jsonb_agg(
                  to_jsonb(row_data)
                  order by row_data.table_name, row_data.constraint_table,
                           row_data.constraint_name, row_data.function_name,
                           row_data.tgtype
                )
           from (
             select trigger_relation.relname as table_name,
                    constraint_relation.relname as constraint_table,
                    constraint_row.conname as constraint_name,
                    referenced_relation.relname as referenced_table,
                    trigger_function.proname as function_name,
                    trigger_row.tgenabled, trigger_row.tgtype,
                    trigger_row.tgdeferrable, trigger_row.tginitdeferred
               from foundation_relations foundation
               join pg_constraint constraint_row
                 on constraint_row.conrelid = foundation.oid
                and constraint_row.contype = 'f'
               join pg_trigger trigger_row
                 on trigger_row.tgconstraint = constraint_row.oid
               join pg_class trigger_relation
                 on trigger_relation.oid = trigger_row.tgrelid
               join pg_class constraint_relation
                 on constraint_relation.oid = constraint_row.conrelid
               join pg_class referenced_relation
                 on referenced_relation.oid = constraint_row.confrelid
               join pg_proc trigger_function on trigger_function.oid = trigger_row.tgfoid
              where trigger_row.tgisinternal
           ) row_data
       ),
       'sequences', (
          select jsonb_agg(to_jsonb(row_data) order by row_data.sequence_name)
            from (
              select sequence_row.relname as sequence_name, owner_role.rolname as owner,
                     sequence_row.relpersistence,
                     (select jsonb_agg(
                               jsonb_build_object(
                                 'grantee', coalesce(grantee_role.rolname, 'PUBLIC'),
                                 'grantor', grantor_role.rolname,
                                 'privilege', privilege_row.privilege_type,
                                 'grantable', privilege_row.is_grantable
                               )
                               order by coalesce(grantee_role.rolname, 'PUBLIC'),
                                        grantor_role.rolname,
                                        privilege_row.privilege_type,
                                        privilege_row.is_grantable
                             )
                        from aclexplode(
                          coalesce(
                            sequence_row.relacl,
                            acldefault('S', sequence_row.relowner)
                          )
                        ) privilege_row
                        left join pg_roles grantee_role
                          on grantee_role.oid = privilege_row.grantee
                        join pg_roles grantor_role
                          on grantor_role.oid = privilege_row.grantor) as acl,
                     sequence_meta.seqincrement, sequence_meta.seqmin,
                     sequence_meta.seqmax, sequence_meta.seqstart,
                     sequence_meta.seqcache, sequence_meta.seqcycle
               from pg_class sequence_row
               join pg_namespace namespace on namespace.oid = sequence_row.relnamespace
               join pg_roles owner_role on owner_role.oid = sequence_row.relowner
               join pg_sequence sequence_meta on sequence_meta.seqrelid = sequence_row.oid
              where namespace.nspname = 'public'
                and sequence_row.relkind = 'S'
                and sequence_row.relname = 'profitability_audit_audit_id_seq'
           ) row_data
       ),
       'functions', (
         select jsonb_agg(to_jsonb(row_data) order by row_data.signature)
           from (
              select function_row.oid::regprocedure::text as signature,
                     owner_role.rolname as owner,
                     language_row.lanname as language,
                     format_type(function_row.prorettype, null) as return_type,
                     function_row.prosecdef,
                     function_row.provolatile,
                     function_row.proconfig,
                     (select split_part(config_entry, '=', 2)
                        from unnest(coalesce(function_row.proconfig, array[]::text[]))
                             as function_config(config_entry)
                       where split_part(config_entry, '=', 1) = 'search_path') as search_path,
                     pg_get_functiondef(function_row.oid) as definition,
                     function_row.prosrc,
                     (select jsonb_agg(
                               jsonb_build_object(
                                 'grantee', coalesce(grantee_role.rolname, 'PUBLIC'),
                                 'grantor', grantor_role.rolname,
                                 'privilege', privilege_row.privilege_type,
                                 'grantable', privilege_row.is_grantable
                               )
                               order by coalesce(grantee_role.rolname, 'PUBLIC'),
                                        grantor_role.rolname,
                                        privilege_row.privilege_type,
                                        privilege_row.is_grantable
                             )
                        from aclexplode(
                          coalesce(
                            function_row.proacl,
                            acldefault('f', function_row.proowner)
                          )
                        ) privilege_row
                        left join pg_roles grantee_role
                          on grantee_role.oid = privilege_row.grantee
                        join pg_roles grantor_role
                          on grantor_role.oid = privilege_row.grantor) as acl
               from pg_proc function_row
               join pg_namespace namespace on namespace.oid = function_row.pronamespace
               join pg_roles owner_role on owner_role.oid = function_row.proowner
               join pg_language language_row on language_row.oid = function_row.prolang
               where namespace.nspname = 'public'
                 and function_row.proname = $3
            ) row_data
        ),
       'policies', (
         select jsonb_agg(to_jsonb(row_data) order by row_data.table_name, row_data.policy_name)
           from (
             select foundation.relname as table_name, policy_row.polname as policy_name,
                    policy_row.polpermissive, policy_row.polcmd,
                    (select jsonb_agg(
                              coalesce(role_row.rolname, 'PUBLIC')
                              order by coalesce(role_row.rolname, 'PUBLIC')
                            )
                       from unnest(policy_row.polroles) as policy_role(role_oid)
                       left join pg_roles role_row on role_row.oid = policy_role.role_oid) as roles,
                    pg_get_expr(policy_row.polqual, policy_row.polrelid, true) as using_expression,
                    pg_get_expr(policy_row.polwithcheck, policy_row.polrelid, true) as check_expression
               from foundation_relations foundation
               join pg_policy policy_row on policy_row.polrelid = foundation.oid
           ) row_data
       ),
       'user_rules', (
         select jsonb_agg(to_jsonb(row_data) order by row_data.table_name, row_data.rule_name)
           from (
             select foundation.relname as table_name, rewrite_row.rulename as rule_name,
                    rewrite_row.ev_enabled,
                    pg_get_ruledef(rewrite_row.oid, true) as definition
               from foundation_relations foundation
               join pg_rewrite rewrite_row on rewrite_row.ev_class = foundation.oid
              where rewrite_row.rulename <> '_RETURN'
           ) row_data
       ),
       'role_graph', (
         select jsonb_agg(to_jsonb(row_data) order by row_data.member_name, row_data.role_name)
           from (
             select member_role.rolname as member_name, granted_role.rolname as role_name,
                    grantor_role.rolname as grantor_name,
                    membership.admin_option, membership.inherit_option, membership.set_option
               from pg_auth_members membership
               join pg_roles member_role on member_role.oid = membership.member
               join pg_roles granted_role on granted_role.oid = membership.roleid
               join pg_roles grantor_role on grantor_role.oid = membership.grantor
              where member_role.rolname = any($2::text[])
                 or granted_role.rolname = any($2::text[])
           ) row_data
       ),
       'default_acl', (
         select jsonb_agg(to_jsonb(row_data) order by row_data.owner, row_data.object_type, row_data.acl)
           from (
             select owner_role.rolname as owner, default_acl.defaclobjtype as object_type,
                    coalesce(default_acl.defaclacl::text, '') as acl
               from pg_default_acl default_acl
               join pg_roles owner_role on owner_role.oid = default_acl.defaclrole
              where owner_role.rolname = any($2::text[])
           ) row_data
       )
     )::text as fingerprint_json`,
    [
      FOUNDATION_TABLES,
       [
         SESSION_ROLE,
         RUNTIME_ROLE,
         OWNER_ROLE,
         MIGRATION_RUNNER_ROLE,
         MIGRATION_EXECUTOR_ROLE,
         PROVISIONER_ROLE,
         FOREIGN_ROLE,
       ],
      IMMUTABILITY_FUNCTION,
    ],
  )
  const fingerprint = JSON.parse(catalog.rows[0].fingerprint_json)
  return {
    hash: digest(fingerprint),
    json: fingerprint,
  }
}

async function assertNoFoundationObjects(client, message = 'Foundation objects unexpectedly exist.') {
  const result = await foundationObjectOids(client)
  assert.deepEqual(result, [], message)
}

async function assertZeroSeeds(client) {
  for (const tableName of FOUNDATION_TABLES) {
    const result = await client.query(`select count(*)::integer as count from public.${quoteIdentifier(tableName)}`)
    assert.equal(result.rows[0].count, 0, `${tableName} contains an unexpected seed row.`)
  }
}

async function extensionVersion(client) {
  const result = await client.query(
    `select extension.extversion
       from pg_extension extension
       join pg_namespace namespace on namespace.oid = extension.extnamespace
      where extension.extname = 'btree_gist'
        and namespace.nspname = 'public'`,
  )
  assert.equal(result.rows.length, 1, 'btree_gist must exist in public before the wrapper runs.')
  assert.equal(result.rows[0].extversion, EXPECTED_BTREE_GIST_VERSION, 'Unexpected local btree_gist version.')
  return result.rows[0].extversion
}

function wrapperValues(btreeGistVersion) {
  assert.equal(btreeGistVersion, EXPECTED_BTREE_GIST_VERSION)
  return { ...WRAPPER_VARIABLES }
}

function runWrapper({ psqlPath, connectionString, variables }) {
  if (!fs.existsSync(psqlPath)) throw new Error(`PROFITABILITY_FOUNDATION_PSQL_MISSING:${psqlPath}`)
  if (!fs.existsSync(WRAPPER_PATH)) throw new Error(`PROFITABILITY_FOUNDATION_WRAPPER_MISSING:${WRAPPER_PATH}`)
  const args = ['-X', '--no-password', '--dbname', connectionString]
  for (const [name, value] of Object.entries(variables)) args.push('-v', `${name}=${value}`)
  args.push('-f', WRAPPER_PATH)
  const result = spawnSync(psqlPath, args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    env: { ...process.env, PGPASSWORD: '' },
    windowsHide: true,
  })
  if (result.status !== 0) {
    const error = new Error(`PROFITABILITY_FOUNDATION_WRAPPER_FAILED:${text(result.stderr || result.stdout)}`)
    error.stdout = result.stdout
    error.stderr = result.stderr
    throw error
  }
  assert.match(result.stdout, /PROFITABILITY_DOMAIN_FOUNDATION_V2_MIGRATION_APPLIED/)
  return result.stdout
}

function runExtensionPreprovision({ psqlPath, connectionString }) {
  if (!fs.existsSync(psqlPath)) throw new Error(`PROFITABILITY_FOUNDATION_PSQL_MISSING:${psqlPath}`)
  if (!fs.existsSync(EXTENSION_WRAPPER_PATH)) {
    throw new Error(`PROFITABILITY_EXTENSION_WRAPPER_MISSING:${EXTENSION_WRAPPER_PATH}`)
  }
  if (!fs.existsSync(ROLE_WRAPPER_PATH)) {
    throw new Error(`PROFITABILITY_ROLE_WRAPPER_MISSING:${ROLE_WRAPPER_PATH}`)
  }
  const variables = {
    profitability_extension_expected_database: EXPECTED_DATABASE,
    profitability_extension_expected_admin: BOOTSTRAP_ROLE,
    profitability_extension_backup_reference: APPROVED_BACKUP_REFERENCE,
    profitability_extension_confirmation: EXTENSION_CONFIRMATION,
  }
  const args = ['-X', '--no-password', '--dbname', connectionString]
  for (const [name, value] of Object.entries(variables)) args.push('-v', `${name}=${value}`)
  args.push('-f', EXTENSION_WRAPPER_PATH)
  const result = spawnSync(psqlPath, args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    env: { ...process.env, PGPASSWORD: '' },
    windowsHide: true,
  })
  if (result.status !== 0) {
    const error = new Error(`PROFITABILITY_EXTENSION_WRAPPER_FAILED:${text(result.stderr || result.stdout)}`)
    error.stdout = result.stdout
    error.stderr = result.stderr
    throw error
  }
  assert.match(result.stdout, /PROFITABILITY_BTREE_GIST_1_7_PREPROVISIONED/)
  return result.stdout
}

function runRolePreprovision({
  psqlPath,
  connectionString,
  expectedAdmin = PROVISIONER_ROLE,
  expectedBootstrapGrantor = BOOTSTRAP_ROLE,
}) {
  if (!fs.existsSync(psqlPath)) throw new Error(`PROFITABILITY_FOUNDATION_PSQL_MISSING:${psqlPath}`)
  if (!fs.existsSync(ROLE_WRAPPER_PATH)) {
    throw new Error(`PROFITABILITY_ROLE_WRAPPER_MISSING:${ROLE_WRAPPER_PATH}`)
  }
  const variables = {
    profitability_roles_expected_database: EXPECTED_DATABASE,
    profitability_roles_expected_admin: expectedAdmin,
    profitability_roles_expected_bootstrap_grantor: expectedBootstrapGrantor,
    profitability_roles_backup_reference: APPROVED_BACKUP_REFERENCE,
    profitability_roles_confirmation: ROLE_CONFIRMATION,
  }
  const args = ['-X', '--no-password', '--dbname', connectionString]
  for (const [name, value] of Object.entries(variables)) args.push('-v', `${name}=${value}`)
  args.push('-f', ROLE_WRAPPER_PATH)
  const result = spawnSync(psqlPath, args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    env: { ...process.env, PGPASSWORD: '' },
    windowsHide: true,
  })
  if (result.status !== 0) {
    const error = new Error(`PROFITABILITY_ROLE_WRAPPER_FAILED:${text(result.stderr || result.stdout)}`)
    error.stdout = result.stdout
    error.stderr = result.stderr
    throw error
  }
  assert.match(result.stdout, /PROFITABILITY_FOUNDATION_V2_ROLES_PREPROVISION_OK/)
  return result.stdout
}

async function prepareRestrictedProvisioner(client, connectionString) {
  await client.query(
    `create role ${quoteIdentifier(EPHEMERAL_BOOTSTRAP_ROLE)}
       login noinherit nosuperuser nocreatedb createrole noreplication nobypassrls
       password null connection limit -1`,
  )

  const bootstrapUrl = connectionUrlForRole(connectionString, EPHEMERAL_BOOTSTRAP_ROLE)
  const bootstrapClient = new Client({ connectionString: bootstrapUrl })
  await bootstrapClient.connect()
  try {
    await bootstrapClient.query(
      `create role ${quoteIdentifier(PROVISIONER_ROLE)}
         login noinherit nosuperuser nocreatedb createrole noreplication nobypassrls
         password null connection limit -1`,
    )
  } finally {
    await bootstrapClient.end()
  }

  await client.query(
    `grant connect on database ${quoteIdentifier(EXPECTED_DATABASE)}
       to ${quoteIdentifier(PROVISIONER_ROLE)} with grant option`,
  )
  await client.query(
    `grant usage, create on schema public
       to ${quoteIdentifier(PROVISIONER_ROLE)} with grant option`,
  )
  await client.query(`drop role ${quoteIdentifier(EPHEMERAL_BOOTSTRAP_ROLE)}`)

  const bootstrapRole = await client.query(
    'select count(*)::integer as count from pg_roles where rolname = $1',
    [EPHEMERAL_BOOTSTRAP_ROLE],
  )
  assert.equal(
    bootstrapRole.rows[0].count,
    0,
    'Ephemeral role bootstrap survived provisioner handoff.',
  )
}

async function targetRoleState(client) {
  const roles = await client.query(
    `select role_row.rolname, role_row.rolcanlogin, role_row.rolinherit,
            role_row.rolsuper, role_row.rolcreatedb, role_row.rolcreaterole,
            role_row.rolreplication, role_row.rolbypassrls,
            role_row.rolconnlimit, role_row.rolvaliduntil,
            role_row.rolconfig, credential_row.rolpassword is not null as credential_present
       from pg_roles role_row
       join pg_authid credential_row on credential_row.oid = role_row.oid
      where role_row.rolname = any($1::text[])
      order by role_row.rolname`,
    [[...TARGET_ROLES, PROVISIONER_ROLE]],
  )
  const memberships = await client.query(
    `select member_role.rolname as member_name, granted_role.rolname as role_name,
            grantor_role.rolname as grantor_name,
            membership.admin_option, membership.inherit_option, membership.set_option
       from pg_auth_members membership
       join pg_roles member_role on member_role.oid = membership.member
       join pg_roles granted_role on granted_role.oid = membership.roleid
       join pg_roles grantor_role on grantor_role.oid = membership.grantor
      where member_role.rolname = any($1::text[])
         or granted_role.rolname = any($1::text[])
      order by member_role.rolname, granted_role.rolname, grantor_role.rolname`,
    [[...TARGET_ROLES, PROVISIONER_ROLE]],
  )
  const acl = await client.query(
    `select (select coalesce(datacl::text, '') from pg_database where datname = current_database()) as database_acl,
            (select coalesce(nspacl::text, '') from pg_namespace where nspname = 'public') as schema_acl`,
  )
  return {
    roles: roles.rows,
    memberships: memberships.rows,
    databaseAcl: acl.rows[0].database_acl,
    schemaAcl: acl.rows[0].schema_acl,
  }
}

function assertTargetCredentialsAbsent(state) {
  const targetRoles = state.roles.filter((role) => TARGET_ROLES.includes(role.rolname))
  assert.equal(targetRoles.length, TARGET_ROLES.length, 'Not all Foundation roles were created.')
  for (const role of targetRoles) {
    assert.equal(role.credential_present, false, `${role.rolname} unexpectedly has a credential.`)
  }
}

function assertProvisionerRestrictedAndLocked(state) {
  const provisioner = state.roles.find((role) => role.rolname === PROVISIONER_ROLE)
  assert.deepEqual(provisioner, {
    rolname: PROVISIONER_ROLE,
    rolcanlogin: true,
    rolinherit: false,
    rolsuper: false,
    rolcreatedb: false,
    rolcreaterole: true,
    rolreplication: false,
    rolbypassrls: false,
    rolconnlimit: -1,
    rolvaliduntil: null,
    rolconfig: null,
    credential_present: false,
  })
}

function rolePreprovisionFailure(options, expectedError) {
  assert.throws(
    () => runRolePreprovision(options),
    expectedError,
    'Guarded role preprovision unexpectedly succeeded.',
  )
}

async function assertRawMigrationRequiresGuard(client, migrationSql) {
  let failure = null
  try {
    await client.query('begin')
    await client.query(`set local role ${quoteIdentifier(MIGRATION_RUNNER_ROLE)}`)
    await client.query(migrationSql)
  } catch (error) {
    failure = error
  } finally {
    await client.query('rollback').catch(() => {})
  }
  assert.ok(failure, 'Raw migration unexpectedly ran without the guarded wrapper.')
  assert.equal(failure.code, 'P0001')
  assert.match(text(failure.message), /PROFITABILITY_FOUNDATION_V2_GUARDED_ENTRYPOINT_REQUIRED/)
  await assertNoFoundationObjects(client, 'Raw migration guard failure changed the schema.')
}

async function armRawMigration(client, btreeGistVersion) {
  const settings = {
    [ENTRYPOINT_GUC]: ENTRYPOINT_MARKER,
    'cleanzi.profitability_foundation_v2_expected_executor': MIGRATION_EXECUTOR_ROLE,
    'cleanzi.profitability_foundation_v2_provisioner': PROVISIONER_ROLE,
    'cleanzi.profitability_foundation_v2_bootstrap_grantor': BOOTSTRAP_ROLE,
    'cleanzi.profitability_foundation_v2_migration_runner': MIGRATION_RUNNER_ROLE,
    'cleanzi.profitability_foundation_v2_owner_role': OWNER_ROLE,
    'cleanzi.profitability_foundation_v2_runtime_role': RUNTIME_ROLE,
    'cleanzi.profitability_foundation_v2_session_role': SESSION_ROLE,
    'cleanzi.profitability_foundation_v2_backup_reference': APPROVED_BACKUP_REFERENCE,
    'cleanzi.profitability_foundation_v2_btree_gist_version': btreeGistVersion,
    'cleanzi.profitability_foundation_v2_btree_gist_schema': 'public',
  }
  for (const [name, value] of Object.entries(settings)) {
    await client.query('select set_config($1::text, $2::text, true)', [name, value])
  }
}

function injectBeforeAclPostflight(migrationSql, injectedSql) {
  const position = migrationSql.indexOf(POSTFLIGHT_ACL_BARRIER)
  if (position < 0) throw new Error('PROFITABILITY_FOUNDATION_POSTFLIGHT_ACL_BARRIER_MISSING')
  return `${migrationSql.slice(0, position)}\n${injectedSql}\n${migrationSql.slice(position)}`
}

async function assertInjectedFailureRollsBack({
  client,
  migrationSql,
  btreeGistVersion,
  injectedSql,
  expectedError,
  baselineFingerprint,
}) {
  let failure = null
  try {
    await client.query('begin')
    await client.query(`set local role ${quoteIdentifier(MIGRATION_RUNNER_ROLE)}`)
    await armRawMigration(client, btreeGistVersion)
    await client.query(injectBeforeAclPostflight(migrationSql, injectedSql))
  } catch (error) {
    failure = error
  } finally {
    await client.query('rollback').catch(() => {})
  }
  assert.ok(failure, `Injected drift unexpectedly passed: ${expectedError}`)
  assert.match(text(failure.message), expectedError)
  const after = await foundationFingerprint(client)
  assert.equal(after.hash, baselineFingerprint.hash, 'Rejected injected drift was not fully rolled back.')
}

async function assertSuperuserInjectedFailureRollsBack({
  client,
  migrationSql,
  btreeGistVersion,
  injectedSql,
  expectedError,
  baselineFingerprint,
}) {
  let failure = null
  try {
    await client.query('begin')
    await client.query(injectedSql)
    await client.query(
      `set local session authorization ${quoteIdentifier(MIGRATION_EXECUTOR_ROLE)}`,
    )
    await client.query(`set local role ${quoteIdentifier(MIGRATION_RUNNER_ROLE)}`)
    await armRawMigration(client, btreeGistVersion)
    await client.query(migrationSql)
  } catch (error) {
    failure = error
  } finally {
    await client.query('rollback').catch(() => {})
  }
  assert.ok(failure, `Superuser-injected drift unexpectedly passed: ${expectedError}`)
  assert.match(text(failure.message), expectedError)
  const after = await foundationFingerprint(client)
  assert.equal(
    after.hash,
    baselineFingerprint.hash,
    'Rejected superuser-injected drift was not fully rolled back.',
  )
}

async function assertExactRoleGraph(client) {
  const result = await client.query(
    `select member_role.rolname as member_name, granted_role.rolname as role_name,
            grantor_role.rolname as grantor_name,
            membership.admin_option, membership.inherit_option, membership.set_option
       from pg_auth_members membership
       join pg_roles member_role on member_role.oid = membership.member
       join pg_roles granted_role on granted_role.oid = membership.roleid
       join pg_roles grantor_role on grantor_role.oid = membership.grantor
      where member_role.rolname = any($1::text[])
         or granted_role.rolname = any($1::text[])
      order by member_role.rolname, granted_role.rolname, grantor_role.rolname`,
    [[...TARGET_ROLES, PROVISIONER_ROLE]],
  )
  assert.deepEqual(result.rows, [
    {
      member_name: MIGRATION_EXECUTOR_ROLE,
      role_name: MIGRATION_RUNNER_ROLE,
      grantor_name: PROVISIONER_ROLE,
      admin_option: false,
      inherit_option: false,
      set_option: true,
    },
    {
      member_name: MIGRATION_RUNNER_ROLE,
      role_name: OWNER_ROLE,
      grantor_name: PROVISIONER_ROLE,
      admin_option: false,
      inherit_option: false,
      set_option: true,
    },
    ...[
      MIGRATION_EXECUTOR_ROLE,
      MIGRATION_RUNNER_ROLE,
      OWNER_ROLE,
      RUNTIME_ROLE,
      SESSION_ROLE,
    ].sort().map((roleName) => ({
      member_name: PROVISIONER_ROLE,
      role_name: roleName,
      grantor_name: BOOTSTRAP_ROLE,
      admin_option: true,
      inherit_option: false,
      set_option: false,
    })),
    {
      member_name: SESSION_ROLE,
      role_name: RUNTIME_ROLE,
      grantor_name: PROVISIONER_ROLE,
      admin_option: false,
      inherit_option: false,
      set_option: true,
    },
  ])

  const attributes = await client.query(
    `select rolname, rolcanlogin, rolinherit, rolsuper, rolcreatedb,
            rolcreaterole, rolreplication, rolbypassrls
       from pg_roles
      where rolname = any($1::text[])
      order by rolname`,
    [[...TARGET_ROLES, PROVISIONER_ROLE]],
  )
  assert.deepEqual(attributes.rows, [
    MIGRATION_RUNNER_ROLE,
    MIGRATION_EXECUTOR_ROLE,
    OWNER_ROLE,
    PROVISIONER_ROLE,
    RUNTIME_ROLE,
    SESSION_ROLE,
  ].sort().map((roleName) => ({
    rolname: roleName,
    rolcanlogin: [MIGRATION_EXECUTOR_ROLE, PROVISIONER_ROLE, SESSION_ROLE].includes(roleName),
    rolinherit: false,
    rolsuper: false,
    rolcreatedb: false,
    rolcreaterole: roleName === PROVISIONER_ROLE,
    rolreplication: false,
    rolbypassrls: false,
  })))
}

async function assertExactTableAcl(client) {
  const result = await client.query(
    `select relation.relname as table_name,
            coalesce(grantee_role.rolname, 'PUBLIC') as grantee,
            privilege.privilege_type,
            privilege.is_grantable
       from pg_class relation
       join pg_namespace namespace on namespace.oid = relation.relnamespace
       cross join lateral aclexplode(relation.relacl) privilege
       left join pg_roles grantee_role on grantee_role.oid = privilege.grantee
      where namespace.nspname = 'public'
        and relation.relname = any($1::text[])
        and privilege.grantee <> relation.relowner
      order by relation.relname, grantee, privilege.privilege_type`,
    [FOUNDATION_TABLES],
  )
  const expected = []
  for (const tableName of FOUNDATION_TABLES) {
    for (const privilegeType of RUNTIME_TABLE_PRIVILEGES[tableName]) {
      expected.push({
        table_name: tableName,
        grantee: RUNTIME_ROLE,
        privilege_type: privilegeType,
        is_grantable: false,
      })
    }
  }
  expected.sort((left, right) => (
    left.table_name.localeCompare(right.table_name)
      || left.grantee.localeCompare(right.grantee)
      || left.privilege_type.localeCompare(right.privilege_type)
  ))
  assert.deepEqual(result.rows, expected)

  const columns = await client.query(
    `select relation.relname as table_name, attribute.attname as column_name,
            attribute.attacl::text as acl
       from pg_attribute attribute
       join pg_class relation on relation.oid = attribute.attrelid
       join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = any($1::text[])
        and attribute.attnum > 0
        and not attribute.attisdropped
        and attribute.attacl is not null`,
    [FOUNDATION_TABLES],
  )
  assert.deepEqual(columns.rows, [], 'Foundation contains unexpected column-level ACL.')

  for (const tableName of FOUNDATION_TABLES) {
    for (const privilegeType of ALL_TABLE_PRIVILEGES) {
      const expectedPrivilege = RUNTIME_TABLE_PRIVILEGES[tableName].includes(privilegeType)
      const effective = await client.query(
        'select has_table_privilege($1, $2, $3) as allowed',
        [RUNTIME_ROLE, `public.${tableName}`, privilegeType],
      )
      assert.equal(
        effective.rows[0].allowed,
        expectedPrivilege,
        `${RUNTIME_ROLE} ${privilegeType} mismatch on ${tableName}`,
      )
      const grantable = await client.query(
        'select has_table_privilege($1, $2, $3) as allowed',
        [RUNTIME_ROLE, `public.${tableName}`, `${privilegeType} WITH GRANT OPTION`],
      )
      assert.equal(grantable.rows[0].allowed, false, `${RUNTIME_ROLE} has grant option on ${tableName}.`)
    }
  }
}

async function assertExactSourceReferenceAcl(client) {
  const tableAcl = await client.query(
    `select relation.relname as table_name, privilege.privilege_type
       from pg_class relation
       join pg_namespace namespace on namespace.oid = relation.relnamespace
       cross join lateral aclexplode(relation.relacl) privilege
       join pg_roles grantee_role on grantee_role.oid = privilege.grantee
      where namespace.nspname = 'public'
        and relation.relname = any($1::text[])
        and grantee_role.rolname = $2
      order by relation.relname, privilege.privilege_type`,
    [SOURCE_TABLES, OWNER_ROLE],
  )
  assert.deepEqual(tableAcl.rows, [], 'Foundation owner has unexpected source table ACL.')

  const columnAcl = await client.query(
    `select relation.relname as table_name, attribute.attname as column_name,
            privilege.privilege_type, privilege.is_grantable
       from pg_attribute attribute
       join pg_class relation on relation.oid = attribute.attrelid
       join pg_namespace namespace on namespace.oid = relation.relnamespace
       cross join lateral aclexplode(attribute.attacl) privilege
       join pg_roles grantee_role on grantee_role.oid = privilege.grantee
      where namespace.nspname = 'public'
        and relation.relname = any($1::text[])
        and attribute.attnum > 0
        and not attribute.attisdropped
        and grantee_role.rolname = $2
      order by relation.relname, attribute.attname, privilege.privilege_type`,
    [SOURCE_TABLES, OWNER_ROLE],
  )
  const expected = SOURCE_REFERENCE_COLUMNS.flatMap(({ table, columns }) => (
    columns.map((column) => ({
      table_name: table,
      column_name: column,
      privilege_type: 'REFERENCES',
      is_grantable: false,
    }))
  )).sort((left, right) => (
    left.table_name.localeCompare(right.table_name)
      || left.column_name.localeCompare(right.column_name)
  ))
  assert.deepEqual(columnAcl.rows, expected)

  for (const tableName of SOURCE_TABLES) {
    const select = await client.query(
      'select has_table_privilege($1, $2, $3) as allowed',
      [OWNER_ROLE, `public.${tableName}`, 'SELECT'],
    )
    assert.equal(select.rows[0].allowed, false, `${OWNER_ROLE} can SELECT ${tableName}.`)
  }
}

async function assertBoundaryAcl(client) {
  await assertExactRoleGraph(client)
  await assertExactTableAcl(client)
  await assertExactSourceReferenceAcl(client)
  const schema = await client.query(
    `select has_schema_privilege($1, 'public', 'USAGE') as runtime_usage,
            has_schema_privilege($1, 'public', 'CREATE') as runtime_create,
            has_schema_privilege($2, 'public', 'USAGE') as session_usage,
            has_schema_privilege($2, 'public', 'CREATE') as session_create`,
    [RUNTIME_ROLE, SESSION_ROLE],
  )
  assert.deepEqual(schema.rows[0], {
    runtime_usage: true,
    runtime_create: false,
    // PostgreSQL 17 grants USAGE on public to PUBLIC by default. The boundary
    // is absence of CREATE and table ACL, not an impossible denial of USAGE.
    session_usage: true,
    session_create: false,
  })

  const sequenceAcl = await client.query(
    `select sequence_role.rolname as grantee, privilege.privilege_type,
            privilege.is_grantable
       from pg_class sequence_row
       join pg_namespace namespace on namespace.oid = sequence_row.relnamespace
       cross join lateral aclexplode(sequence_row.relacl) privilege
       left join pg_roles sequence_role on sequence_role.oid = privilege.grantee
      where namespace.nspname = 'public'
        and sequence_row.relname = 'profitability_audit_audit_id_seq'
        and privilege.grantee <> sequence_row.relowner
      order by grantee, privilege.privilege_type`,
  )
  assert.deepEqual(sequenceAcl.rows, [{
    grantee: RUNTIME_ROLE,
    privilege_type: 'USAGE',
    is_grantable: false,
  }])

  const functionAcl = await client.query(
    `select coalesce(grantee_role.rolname, 'PUBLIC') as grantee,
            privilege.privilege_type, privilege.is_grantable,
            owner_role.rolname as owner
       from pg_proc function_row
       join pg_namespace namespace on namespace.oid = function_row.pronamespace
       join pg_roles owner_role on owner_role.oid = function_row.proowner
       cross join lateral aclexplode(function_row.proacl) privilege
       left join pg_roles grantee_role on grantee_role.oid = privilege.grantee
      where namespace.nspname = 'public'
        and function_row.proname = $1
        and privilege.grantee <> function_row.proowner
      order by grantee, privilege.privilege_type`,
    [IMMUTABILITY_FUNCTION],
  )
  assert.deepEqual(functionAcl.rows, [], 'Immutability function leaked EXECUTE outside its owner.')

  const effectiveFunctionAcl = await client.query(
    `select has_function_privilege($1, $3, 'EXECUTE') as runtime_execute,
            has_function_privilege($2, $3, 'EXECUTE') as session_execute`,
    [
      RUNTIME_ROLE,
      SESSION_ROLE,
      `public.${IMMUTABILITY_FUNCTION}()`,
    ],
  )
  assert.deepEqual(effectiveFunctionAcl.rows[0], {
    runtime_execute: false,
    session_execute: false,
  })

  const defaultAcl = await client.query(
    `select owner_role.rolname as owner, default_acl.defaclobjtype,
            default_acl.defaclacl::text as acl
       from pg_default_acl default_acl
       join pg_roles owner_role on owner_role.oid = default_acl.defaclrole
      where owner_role.rolname = any($1::text[])
        and default_acl.defaclobjtype in ('r', 'S', 'f')`,
    [[OWNER_ROLE, MIGRATION_RUNNER_ROLE, MIGRATION_EXECUTOR_ROLE]],
  )
  assert.deepEqual(defaultAcl.rows, [], 'Unexpected default ACL remains for Foundation owners.')
}

async function assertRuntimeDmlSmoke(adminClient, bootstrapConnectionString) {
  const fixture = Object.freeze({
    orgId: 'harness-alpha',
    objectId: 'OBJECT-RUNTIME-SMOKE',
    clientId: 'CLIENT-A',
    equipmentId: 'EQUIPMENT-RUNTIME-SMOKE',
  })
  const runtimeSession = new Client({
    connectionString: connectionUrlForRole(bootstrapConnectionString, SESSION_ROLE),
  })
  let connected = false
  try {
    await adminClient.query(
      `insert into public.service_object
        (org_id, object_id, client_id, name, created_by_uid)
       values ($1, $2, $3, 'Runtime smoke object', 'uid-a')`,
      [fixture.orgId, fixture.objectId, fixture.clientId],
    )

    await runtimeSession.connect()
    connected = true
    await assert.rejects(
      runtimeSession.query('select count(*) from public.service_object'),
      (error) => error?.code === '42501',
      'The LOGIN session unexpectedly inherited direct Foundation access.',
    )

    await runtimeSession.query('begin')
    await runtimeSession.query(`set local role ${quoteIdentifier(RUNTIME_ROLE)}`)
    const visible = await runtimeSession.query(
      `select count(*)::integer as count
         from public.service_object
        where org_id = $1 and object_id = $2`,
      [fixture.orgId, fixture.objectId],
    )
    assert.equal(visible.rows[0].count, 1)

    const insertEquipment = await runtimeSession.query(
      `insert into public.object_equipment
        (org_id, object_id, equipment_id, name, financing, recognition_method,
         purchase_value_minor, currency, started_on, created_by_uid, updated_by_uid)
       values ($1, $2, $3, $4, 'PURCHASE', 'IMMEDIATE', 10000, 'PLN',
               '2026-09-01'::date, 'uid-a', 'uid-a')
       on conflict (org_id, object_id, equipment_id) do update set
         name = excluded.name,
         updated_at = now(),
         updated_by_uid = excluded.updated_by_uid
       returning name`,
      [fixture.orgId, fixture.objectId, fixture.equipmentId, 'Runtime smoke equipment'],
    )
    assert.equal(insertEquipment.rows[0].name, 'Runtime smoke equipment')

    const updateEquipment = await runtimeSession.query(
      `insert into public.object_equipment
        (org_id, object_id, equipment_id, name, financing, recognition_method,
         purchase_value_minor, currency, started_on, created_by_uid, updated_by_uid)
       values ($1, $2, $3, $4, 'PURCHASE', 'IMMEDIATE', 10000, 'PLN',
               '2026-09-01'::date, 'uid-a', 'uid-a')
       on conflict (org_id, object_id, equipment_id) do update set
         name = excluded.name,
         updated_at = now(),
         updated_by_uid = excluded.updated_by_uid
       returning name`,
      [fixture.orgId, fixture.objectId, fixture.equipmentId, 'Runtime smoke equipment updated'],
    )
    assert.equal(updateEquipment.rows[0].name, 'Runtime smoke equipment updated')

    const audit = await runtimeSession.query(
      `insert into public.profitability_audit
        (org_id, object_id, entity_type, entity_id, action, actor_uid, source,
         reason, previous_value, new_value)
       values ($1, $2, 'OBJECT_EQUIPMENT', $3, 'UPDATE_EQUIPMENT', 'uid-a',
               'PORTAL', 'runtime smoke', null, '{"ok":true}'::jsonb)
       returning audit_id`,
      [fixture.orgId, fixture.objectId, fixture.equipmentId],
    )
    assert.ok(BigInt(audit.rows[0].audit_id) > 0n, 'Identity-backed audit insert did not return audit_id.')

    await runtimeSession.query('savepoint deny_delete')
    await assert.rejects(
      runtimeSession.query(
        'delete from public.object_equipment where org_id = $1 and object_id = $2 and equipment_id = $3',
        [fixture.orgId, fixture.objectId, fixture.equipmentId],
      ),
      (error) => error?.code === '42501',
      'Runtime unexpectedly received DELETE on object_equipment.',
    )
    await runtimeSession.query('rollback to savepoint deny_delete')
    await runtimeSession.query('rollback')
  } finally {
    if (connected) await runtimeSession.query('rollback').catch(() => {})
    await runtimeSession.end().catch(() => {})
    await adminClient.query(
      'delete from public.service_object where org_id = $1 and object_id = $2',
      [fixture.orgId, fixture.objectId],
    ).catch(() => {})
  }
  await assertZeroSeeds(adminClient)
}

async function runHarness(options = {}) {
  const launch = parseLaunchConfiguration(options)
  if (!fs.existsSync(MIGRATION_PATH)) throw new Error(`PROFITABILITY_FOUNDATION_MIGRATION_MISSING:${MIGRATION_PATH}`)
  if (!fs.existsSync(WRAPPER_PATH)) throw new Error(`PROFITABILITY_FOUNDATION_WRAPPER_MISSING:${WRAPPER_PATH}`)
  if (!fs.existsSync(EXTENSION_WRAPPER_PATH)) {
    throw new Error(`PROFITABILITY_EXTENSION_WRAPPER_MISSING:${EXTENSION_WRAPPER_PATH}`)
  }
  const migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  const exactCatalogFingerprint = exactCatalogFingerprintFromMigration(migrationSql)

  const adminClient = new Client({ connectionString: launch.connectionString })
  let migrationClient
  try {
    await adminClient.connect()
    const target = await inspectUnmodifiedTarget(adminClient)
    assertSafeUnmodifiedTarget(target, launch.safeTarget)

    await prepareRestrictedProvisioner(adminClient, launch.connectionString)
    const provisionerUrl = connectionUrlForRole(launch.connectionString, PROVISIONER_ROLE)
    const provisionerClient = new Client({ connectionString: provisionerUrl })
    await provisionerClient.connect()
    try {
      const catalogAccess = await provisionerClient.query(
        `select has_table_privilege(current_user, 'pg_catalog.pg_authid', 'SELECT') as allowed`,
      )
      assert.equal(catalogAccess.rows[0].allowed, false, 'Restricted provisioner unexpectedly reads pg_authid.')
    } finally {
      await provisionerClient.end()
    }

    await adminClient.query(
      `grant create on database ${quoteIdentifier(EXPECTED_DATABASE)}
         to ${quoteIdentifier(PROVISIONER_ROLE)}`,
    )
    const excessDatabaseAclBefore = await targetRoleState(adminClient)
    rolePreprovisionFailure({
      psqlPath: launch.psqlPath,
      connectionString: provisionerUrl,
    }, /PROFITABILITY_FOUNDATION_V2_ROLES_PROVISIONER_DATABASE_ACL_FORBIDDEN/)
    assert.deepEqual(
      await targetRoleState(adminClient),
      excessDatabaseAclBefore,
      'Provisioner database-ACL rejection changed roles, memberships or ACL.',
    )
    await adminClient.query(
      `revoke create on database ${quoteIdentifier(EXPECTED_DATABASE)}
         from ${quoteIdentifier(PROVISIONER_ROLE)}`,
    )

    await adminClient.query(
      `grant usage on schema pg_catalog
         to ${quoteIdentifier(PROVISIONER_ROLE)}`,
    )
    const excessSchemaAclBefore = await targetRoleState(adminClient)
    rolePreprovisionFailure({
      psqlPath: launch.psqlPath,
      connectionString: provisionerUrl,
    }, /PROFITABILITY_FOUNDATION_V2_ROLES_PROVISIONER_SCHEMA_ACL_FORBIDDEN/)
    assert.deepEqual(
      await targetRoleState(adminClient),
      excessSchemaAclBefore,
      'Provisioner schema-ACL rejection changed roles, memberships or public ACL.',
    )
    await adminClient.query(
      `revoke usage on schema pg_catalog
         from ${quoteIdentifier(PROVISIONER_ROLE)}`,
    )

    await adminClient.query(
      `create role ${quoteIdentifier(RUNTIME_ROLE)}
         nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password null`,
    )
    const partialBefore = await targetRoleState(adminClient)
    rolePreprovisionFailure({
      psqlPath: launch.psqlPath,
      connectionString: provisionerUrl,
    }, /PROFITABILITY_FOUNDATION_V2_ROLES_EXISTING_CREDENTIAL_STATE_UNVERIFIABLE/)
    assert.deepEqual(
      await targetRoleState(adminClient),
      partialBefore,
      'Restricted partial-state rejection changed roles, memberships or ACL.',
    )
    await adminClient.query(`drop role ${quoteIdentifier(RUNTIME_ROLE)}`)

    runRolePreprovision({
      psqlPath: launch.psqlPath,
      connectionString: provisionerUrl,
    })
    const freshRoleState = await targetRoleState(adminClient)
    assertTargetCredentialsAbsent(freshRoleState)
    assertProvisionerRestrictedAndLocked(freshRoleState)
    await assertExactRoleGraph(adminClient)
    rolePreprovisionFailure({
      psqlPath: launch.psqlPath,
      connectionString: provisionerUrl,
    }, /PROFITABILITY_FOUNDATION_V2_ROLES_EXISTING_CREDENTIAL_STATE_UNVERIFIABLE/)
    assert.deepEqual(
      await targetRoleState(adminClient),
      freshRoleState,
      'Restricted replay rejection changed roles, memberships or ACL.',
    )
    await adminClient.query(
      `grant select on pg_catalog.pg_authid to ${quoteIdentifier(PROVISIONER_ROLE)}`,
    )
    runRolePreprovision({ psqlPath: launch.psqlPath, connectionString: provisionerUrl })
    assert.deepEqual(
      await targetRoleState(adminClient),
      freshRoleState,
      'Catalog-authorized replay changed roles, memberships or ACL.',
    )
    await adminClient.query(
      `revoke select on pg_catalog.pg_authid from ${quoteIdentifier(PROVISIONER_ROLE)}`,
    )

    await adminClient.query(
      `alter role ${quoteIdentifier(SESSION_ROLE)} password 'local-harness-credential-drift'`,
    )
    await adminClient.query(
      `grant select on pg_catalog.pg_authid to ${quoteIdentifier(PROVISIONER_ROLE)}`,
    )
    const credentialDriftState = await targetRoleState(adminClient)
    rolePreprovisionFailure({
      psqlPath: launch.psqlPath,
      connectionString: provisionerUrl,
    }, /PROFITABILITY_FOUNDATION_V2_ROLES_EXISTING_ROLE_ATTRIBUTES_MISMATCH/)
    assert.deepEqual(
      await targetRoleState(adminClient),
      credentialDriftState,
      'Credential-drift rejection changed roles, memberships or ACL.',
    )
    await adminClient.query(`alter role ${quoteIdentifier(SESSION_ROLE)} password null`)
    await adminClient.query(
      `revoke select on pg_catalog.pg_authid from ${quoteIdentifier(PROVISIONER_ROLE)}`,
    )
    assertTargetCredentialsAbsent(await targetRoleState(adminClient))
    await adminClient.query(BOOTSTRAP_SQL)

    runExtensionPreprovision({
      psqlPath: launch.psqlPath,
      connectionString: launch.connectionString,
    })
    runExtensionPreprovision({
      psqlPath: launch.psqlPath,
      connectionString: launch.connectionString,
    })

    const sourceBefore = await sourceFingerprint(adminClient)
    const btreeGistVersion = await extensionVersion(adminClient)
    const variables = wrapperValues(btreeGistVersion)
    const migrationUrl = connectionUrlForRole(launch.connectionString, MIGRATION_EXECUTOR_ROLE)
    migrationClient = new Client({ connectionString: migrationUrl })
    await migrationClient.connect()

    await assertRawMigrationRequiresGuard(migrationClient, migrationSql)
    runWrapper({
      psqlPath: launch.psqlPath,
      connectionString: migrationUrl,
      variables,
    })

    assert.equal(await sourceFingerprint(adminClient), sourceBefore, 'Foundation migration changed core source tables.')
    await assertZeroSeeds(adminClient)
    await assertBoundaryAcl(adminClient)

    const firstOids = await foundationObjectOids(adminClient)
    assert.equal(firstOids.length, FOUNDATION_TABLES.length)
    const firstFingerprint = await foundationFingerprint(adminClient)

    runWrapper({
      psqlPath: launch.psqlPath,
      connectionString: migrationUrl,
      variables,
    })

    assert.deepEqual(await foundationObjectOids(adminClient), firstOids, 'Replay replaced Foundation tables.')
    const replayFingerprint = await foundationFingerprint(adminClient)
    assert.equal(replayFingerprint.hash, firstFingerprint.hash, 'Replay changed the Foundation fingerprint.')
    assert.equal(await sourceFingerprint(adminClient), sourceBefore, 'Replay changed core source tables.')
    await assertZeroSeeds(adminClient)
    await assertBoundaryAcl(adminClient)

    const adversarialCases = [
      {
        sql: `grant select on table public.service_object to public;`,
        error: /PROFITABILITY_FOUNDATION_V2_DIRECT_ACL_EXCESS/,
      },
      {
        sql: `grant select on table public.service_object to ${FOREIGN_ROLE};`,
        error: /PROFITABILITY_FOUNDATION_V2_DIRECT_ACL_EXCESS/,
      },
      {
        sql: `grant select on table public.service_object to ${RUNTIME_ROLE} with grant option;`,
        error: /PROFITABILITY_FOUNDATION_V2_RUNTIME_ACL_MISMATCH/,
      },
      {
        sql: `alter default privileges for role ${OWNER_ROLE} grant select on tables to ${FOREIGN_ROLE};`,
        error: /PROFITABILITY_FOUNDATION_V2_DEFAULT_ACL_EXCESS/,
      },
      {
        sql: `grant update (name) on table public.service_object to ${RUNTIME_ROLE};`,
        error: /PROFITABILITY_FOUNDATION_V2_COLUMN_ACL_EXCESS/,
      },
      {
        sql: `alter table public.service_object alter column status set default 'INACTIVE';`,
        error: /PROFITABILITY_FOUNDATION_V2_EXACT_CATALOG_FINGERPRINT_MISMATCH/,
      },
      {
        sql: `alter table public.worker_cost_rate
                drop constraint worker_cost_rate_amount_check;
              alter table public.worker_cost_rate
                add constraint worker_cost_rate_amount_check
                check (hourly_cost_minor >= 0 or source = 'MANUAL');`,
        error: /PROFITABILITY_FOUNDATION_V2_EXACT_CATALOG_FINGERPRINT_MISMATCH/,
      },
      {
        sql: `alter table public.service_object
                drop constraint service_object_org_fk;
              alter table public.service_object
                add constraint service_object_org_fk
                foreign key (org_id)
                references public.organizations (org_id)
                on delete cascade;`,
        error: /PROFITABILITY_FOUNDATION_V2_EXACT_CATALOG_FINGERPRINT_MISMATCH/,
      },
      {
        sql: `drop trigger worker_cost_rate_no_hard_delete_v2
                on public.worker_cost_rate;
              create trigger worker_cost_rate_no_hard_delete_v2
                before delete on public.worker_cost_rate
                for each row when (false)
                execute function public.profitability_foundation_v2_reject_immutable_change();`,
        error: /PROFITABILITY_FOUNDATION_V2_EXACT_CATALOG_FINGERPRINT_MISMATCH/,
      },
      {
        sql: `create or replace function public.profitability_foundation_v2_reject_immutable_change()
                returns trigger
                language plpgsql
                security invoker
                set search_path = pg_catalog, public
                as $adversarial_function$
                begin
                  if false then
                    raise exception '% records are immutable; append a correction instead',
                      tg_table_name
                      using errcode = '55000';
                  end if;
                  return new;
                end
                $adversarial_function$;`,
        error: /PROFITABILITY_FOUNDATION_V2_EXACT_CATALOG_FINGERPRINT_MISMATCH/,
      },
      {
        sql: `drop index public.service_object_org_client_idx;
              create index service_object_org_client_idx
                on public.service_object using btree
                (org_id, client_id, status, object_id)
                where archived_at is null or true;`,
        error: /PROFITABILITY_FOUNDATION_V2_EXACT_CATALOG_FINGERPRINT_MISMATCH/,
      },
      {
        sql: `alter sequence public.profitability_audit_audit_id_seq
                maxvalue 9223372036854775806 cycle;`,
        error: /PROFITABILITY_FOUNDATION_V2_EXACT_CATALOG_FINGERPRINT_MISMATCH/,
      },
      {
        sql: `alter table public.profitability_audit set unlogged;`,
        error: /PROFITABILITY_FOUNDATION_V2_EXACT_CATALOG_FINGERPRINT_MISMATCH/,
      },
      {
        sql: `alter table public.service_object set (fillfactor = 80);
              alter table public.service_object replica identity full;`,
        error: /PROFITABILITY_FOUNDATION_V2_EXACT_CATALOG_FINGERPRINT_MISMATCH/,
      },
      {
        sql: `alter table public.service_object enable row level security;
              create policy service_object_allow_all_adversarial
                on public.service_object
                for all
                to public
                using (true)
                with check (true);`,
        error: /PROFITABILITY_FOUNDATION_V2_EXACT_CATALOG_FINGERPRINT_MISMATCH/,
      },
      {
        sql: `create domain public.profitability_foundation_v2_name_domain
                as varchar(180)
                collate "C"
                default 'DOMAIN_DEFAULT'
                check (value <> '');
              alter table public.service_object
                alter column name
                type public.profitability_foundation_v2_name_domain
                using name::text::public.profitability_foundation_v2_name_domain;`,
        error: /PROFITABILITY_FOUNDATION_V2_(?:COLUMN_POSTFLIGHT_FAILED|EXACT_CATALOG_FINGERPRINT_MISMATCH)/,
      },
      {
        sql: `alter table public.service_object
                alter column created_at
                type timestamptz(0)
                using created_at::timestamptz(0);`,
        error: /PROFITABILITY_FOUNDATION_V2_EXACT_CATALOG_FINGERPRINT_MISMATCH/,
      },
      {
        sql: `alter table public.service_object
                alter column name
                type varchar(180) collate "C"
                using name::varchar(180);`,
        error: /PROFITABILITY_FOUNDATION_V2_EXACT_CATALOG_FINGERPRINT_MISMATCH/,
      },
      {
        sql: `create rule service_object_insert_adversarial as
                on insert to public.service_object
                do also nothing;`,
        error: /PROFITABILITY_FOUNDATION_V2_EXACT_CATALOG_FINGERPRINT_MISMATCH/,
      },
    ]
    for (const adversarial of adversarialCases) {
      await assertInjectedFailureRollsBack({
        client: migrationClient,
        migrationSql,
        btreeGistVersion,
        injectedSql: adversarial.sql,
        expectedError: adversarial.error,
        baselineFingerprint: firstFingerprint,
      })
    }

    const superuserReplayDriftCases = [
      {
        sql: `alter table public.periodic_work disable trigger all;
              alter table public.periodic_work
                enable trigger periodic_work_no_hard_delete_v2;`,
        error: /PROFITABILITY_FOUNDATION_V2_EXACT_CATALOG_FINGERPRINT_MISMATCH/,
      },
      {
        sql: `alter sequence public.profitability_audit_audit_id_seq set unlogged;`,
        error: /PROFITABILITY_FOUNDATION_V2_REPLAY_AUDIT_SEQUENCE_PERSISTENCE_MISMATCH/,
      },
      {
        sql: `alter table public.profitability_audit
                alter column audit_id drop identity;
              create sequence public.profitability_audit_audit_id_seq as bigint;
              grant usage, create on schema public to ${FOREIGN_ROLE};
              alter sequence public.profitability_audit_audit_id_seq
                owner to ${FOREIGN_ROLE};`,
        error: /PROFITABILITY_FOUNDATION_V2_REPLAY_AUDIT_SEQUENCE_OWNER_MISMATCH/,
      },
      {
        sql: `grant usage, create on schema public to ${FOREIGN_ROLE};
              alter function public.profitability_foundation_v2_reject_immutable_change()
                owner to ${FOREIGN_ROLE};`,
        error: /PROFITABILITY_FOUNDATION_V2_REPLAY_IMMUTABLE_FUNCTION_OWNER_MISMATCH/,
      },
      {
        sql: `grant usage on sequence public.profitability_audit_audit_id_seq
                to ${FOREIGN_ROLE};`,
        error: /PROFITABILITY_FOUNDATION_V2_REPLAY_AUDIT_SEQUENCE_ACL_MISMATCH/,
      },
      {
        sql: `grant execute on function
                public.profitability_foundation_v2_reject_immutable_change()
                to ${FOREIGN_ROLE};`,
        error: /PROFITABILITY_FOUNDATION_V2_REPLAY_IMMUTABLE_FUNCTION_ACL_MISMATCH/,
      },
      {
        sql: `create or replace function public.profitability_foundation_v2_reject_immutable_change()
                returns trigger
                language plpgsql
                security invoker
                set search_path = pg_catalog, public
                as $replay_adversarial_function$
                begin
                  if false then
                    raise exception '% records are immutable; append a correction instead',
                      tg_table_name
                      using errcode = '55000';
                  end if;
                  return new;
                end
                $replay_adversarial_function$;`,
        error: /PROFITABILITY_FOUNDATION_V2_EXACT_CATALOG_FINGERPRINT_MISMATCH/,
      },
    ]
    for (const adversarial of superuserReplayDriftCases) {
      await assertSuperuserInjectedFailureRollsBack({
        client: adminClient,
        migrationSql,
        btreeGistVersion,
        injectedSql: adversarial.sql,
        expectedError: adversarial.error,
        baselineFingerprint: firstFingerprint,
      })
    }

    await adminClient.query(
      `grant ${quoteIdentifier(OWNER_ROLE)} to ${quoteIdentifier(RUNTIME_ROLE)}
         with admin false, inherit false, set true`,
    )
    let roleGraphFailure = null
    try {
      runWrapper({
        psqlPath: launch.psqlPath,
        connectionString: migrationUrl,
        variables,
      })
    } catch (error) {
      roleGraphFailure = error
    } finally {
      await adminClient.query(
        `revoke ${quoteIdentifier(OWNER_ROLE)} from ${quoteIdentifier(RUNTIME_ROLE)}`,
      )
    }
    assert.ok(roleGraphFailure, 'Unsafe runtime-to-owner SET ROLE edge unexpectedly passed.')
    assert.match(
      text(roleGraphFailure.message),
      /PROFITABILITY_FOUNDATION_V2_(?:SESSION_MEMBERSHIP|RUNTIME_MEMBERSHIP|MEMBERSHIP_GRAPH)_EXCESS/,
    )
    assert.equal(
      (await foundationFingerprint(adminClient)).hash,
      firstFingerprint.hash,
      'Rejected role-graph drift changed the Foundation fingerprint.',
    )

    assert.equal(await sourceFingerprint(adminClient), sourceBefore, 'Adversarial cases changed core source tables.')
    await assertBoundaryAcl(adminClient)
    await assertRuntimeDmlSmoke(adminClient, launch.connectionString)

    return {
      ok: true,
      target: {
        databaseName: target.database_name,
        serverVersion: target.server_version_num,
        address: target.server_address,
        port: target.server_port,
      },
      exactCatalogFingerprint,
      fingerprint: firstFingerprint.hash,
      effects: EFFECTS,
      checks: [
        'fresh-pg17-apply',
        'restricted-provisioner-fresh-role-preprovision-and-self-lock',
        'restricted-provisioner-excess-database-and-schema-acl-rejected',
        'restricted-provisioner-partial-and-replay-fail-closed',
        'temporary-catalog-authorized-replay-and-credential-drift-rejection',
        'exact-five-creator-plus-three-set-role-graph',
        'guarded-btree-gist-preprovision-and-replay',
        'raw-sql-entrypoint-guard',
        'zero-seeds-and-core-source-immutability',
        'exact-schema-and-acl-fingerprint',
        'idempotent-wrapper-replay',
        'public-and-foreign-acl-rejected',
        'grant-option-and-column-acl-rejected',
        'exact-default-constraint-fk-action-and-trigger-when-drift-rejected',
        'exact-function-index-and-static-sequence-drift-rejected',
        'pre-mutation-named-object-owner-acl-and-persistence-drift-rejected',
        'exact-relation-type-rls-policy-and-rewrite-drift-rejected',
        'superuser-disabled-internal-ri-triggers-rejected',
        'unsafe-default-acl-rejected',
        'role-graph-drift-rejected',
        'injected-failure-full-rollback',
        'runtime-audit-identity-and-equipment-upsert-smoke',
      ],
    }
  } finally {
    if (migrationClient) await migrationClient.end().catch(() => {})
    await adminClient.end().catch(() => {})
  }
}

function printUsage() {
  console.error([
    'This harness accepts only a fresh disposable local PostgreSQL 17 database.',
    'It never reads DATABASE_URL and never drops or cleans a database.',
    '',
    `Set ${DATABASE_URL_ENV}=postgresql://${BOOTSTRAP_ROLE}@127.0.0.1:<random-port>/${EXPECTED_DATABASE}`,
    `Set ${CONFIRMATION_ENV}=${EXACT_CONFIRMATION}`,
    `Run: node scripts/test-profitability-foundation-pg17.js ${RUN_ARGUMENT}`,
  ].join('\n'))
}

if (require.main === module) {
  runHarness()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`Profitability Foundation PG17 harness failed: ${text(error.code || 'UNKNOWN')} ${text(error.message || error)}`)
      if (error?.stack) console.error(error.stack)
      printUsage()
      process.exitCode = 1
    })
}

module.exports = {
  APPROVED_BACKUP_REFERENCE,
  BOOTSTRAP_ROLE,
  BOOTSTRAP_SQL,
  CONFIRMATION_ENV,
  DATABASE_URL_ENV,
  EFFECTS,
  EPHEMERAL_BOOTSTRAP_ROLE,
  ENTRYPOINT_GUC,
  ENTRYPOINT_MARKER,
  EXACT_CONFIRMATION,
  EXACT_MIGRATION_CONFIRMATION,
  EXPECTED_DATABASE,
  EXPECTED_BTREE_GIST_VERSION,
  EXTENSION_CONFIRMATION,
  EXTENSION_WRAPPER_PATH,
  FOUNDATION_TABLES,
  FOREIGN_ROLE,
  IMMUTABILITY_FUNCTION,
  MIGRATION_PATH,
  MIGRATION_EXECUTOR_ROLE,
  MIGRATION_RUNNER_ROLE,
  OWNER_ROLE,
  POSTFLIGHT_ACL_BARRIER,
  PROVISIONER_ROLE,
  PSQL_PATH_ENV,
  RUNTIME_ROLE,
  RUNTIME_TABLE_PRIVILEGES,
  ROLE_CONFIRMATION,
  ROLE_WRAPPER_PATH,
  RUN_ARGUMENT,
  SESSION_ROLE,
  SOURCE_TABLES,
  WRAPPER_PATH,
  WRAPPER_VARIABLES,
  assertBoundaryAcl,
  assertExactRoleGraph,
  assertExactTableAcl,
  assertRuntimeDmlSmoke,
  assertNoFoundationObjects,
  assertRawMigrationRequiresGuard,
  assertSafeUnmodifiedTarget,
  foundationFingerprint,
  injectBeforeAclPostflight,
  inspectUnmodifiedTarget,
  parseLaunchConfiguration,
  runExtensionPreprovision,
  runHarness,
  runRolePreprovision,
}
