'use strict'

const path = require('node:path')

const {
  createCloudSqlPgAdapter,
} = require('./profitability-foundation-production-adapters')
const {
  createProfitabilityAccessV21ProductionDependencies,
  loadPostflights,
} = require('./profitability-access-v21-production-adapters')

const PROJECT = 'iclean-room'
const INSTANCE = 'iclean-room-instance'
const REGION = 'europe-west3'
const DATABASE = 'iclean-room-database'
const IAM_SOURCE_READER = 'biuro@bestclean.pl'
const SOURCE_OWNER = 'firebaseowner_iclean-room-database_public'
const EXECUTOR = 'profitability_migration_executor'

function text(value) {
  return String(value ?? '').trim()
}

function secretString(value) {
  const normalized = Buffer.isBuffer(value) ? value.toString('base64url') : String(value ?? '')
  if (normalized.length < 24 || normalized.includes('\0')) {
    throw new Error('EPHEMERAL_PASSWORD_POLICY_FAILED')
  }
  return normalized
}

async function assertConnectionIdentity(client, expectedRole) {
  const result = await client.query(
    `select current_database() as database_name,
            session_user as session_role,
            current_user as current_role,
            current_setting('server_version_num')::integer as server_version_num,
            pg_is_in_recovery() as in_recovery,
            current_setting('transaction_read_only') as transaction_read_only`,
  )
  const row = result.rows?.[0] || {}
  if (row.database_name !== DATABASE) throw new Error('DATABASE_NAME_MISMATCH')
  if (row.session_role !== expectedRole || row.current_role !== expectedRole) {
    throw new Error('DATABASE_SESSION_ROLE_MISMATCH')
  }
  if (Number(row.server_version_num) < 170000 || Number(row.server_version_num) >= 180000) {
    throw new Error('POSTGRESQL_17_REQUIRED')
  }
  if (row.in_recovery === true || row.transaction_read_only !== 'off') {
    throw new Error('PRIMARY_WRITABLE_DATABASE_REQUIRED')
  }
}

async function assumeSourceOwner(client, expectedSessionRole = IAM_SOURCE_READER) {
  const before = await client.query(
    `select session_user as session_role,
            current_user as current_role,
            pg_has_role(session_user, $1, 'SET') as may_set_source_owner`,
    [SOURCE_OWNER],
  )
  const initial = before.rows?.[0] || {}
  if (initial.session_role !== expectedSessionRole
      || initial.current_role !== expectedSessionRole
      || initial.may_set_source_owner !== true) {
    throw new Error('SOURCE_OWNER_HANDOFF_FORBIDDEN')
  }
  await client.query(`set role "${SOURCE_OWNER}"`)
  const after = await client.query(
    'select session_user as session_role, current_user as current_role',
  )
  const assumed = after.rows?.[0] || {}
  if (assumed.session_role !== expectedSessionRole || assumed.current_role !== SOURCE_OWNER) {
    throw new Error('SOURCE_OWNER_HANDOFF_FAILED')
  }
}

async function inspectSourceReadBridge(client) {
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
     ), role_ids as (
       select
         (select oid from pg_roles where rolname = 'profitability_runtime') as runtime_oid,
         (select oid from pg_roles
           where rolname = 'firebaseowner_iclean-room-database_public') as source_owner_oid
     ), runtime_role_state as (
       select count(*)::integer as exact_count
         from pg_roles role_row
        where role_row.rolname = 'profitability_runtime'
          and not role_row.rolcanlogin
          and not role_row.rolinherit
          and not role_row.rolsuper
          and not role_row.rolbypassrls
          and not role_row.rolcreaterole
          and not role_row.rolcreatedb
          and not role_row.rolreplication
          and role_row.rolconnlimit = -1
          and role_row.rolvaliduntil is null
          and role_row.rolconfig is null
     ), source_relations as (
       select count(*)::integer as exact_count
         from pg_class relation_row
         join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
         join pg_roles owner_row on owner_row.oid = relation_row.relowner
        where namespace_row.nspname = 'public'
          and relation_row.relname = any(array['organization_member', 'event', 'zone'])
          and relation_row.relkind in ('r', 'p')
          and relation_row.relpersistence = 'p'
          and owner_row.rolname = 'firebaseowner_iclean-room-database_public'
     ), required_columns as (
       select count(*)::integer as exact_count
         from expected
         join pg_class relation_row on relation_row.relname = expected.table_name
         join pg_namespace namespace_row
           on namespace_row.oid = relation_row.relnamespace
          and namespace_row.nspname = 'public'
         join pg_attribute attribute_row
           on attribute_row.attrelid = relation_row.oid
          and attribute_row.attname = expected.column_name
          and attribute_row.attnum > 0
          and not attribute_row.attisdropped
     ), runtime_table_acl as (
       select count(*)::integer as exact_count
         from pg_class relation_row
         join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
         cross join role_ids
         cross join lateral aclexplode(
           coalesce(relation_row.relacl, acldefault('r', relation_row.relowner))
         ) privilege_row
        where namespace_row.nspname = 'public'
          and relation_row.relname = any(array['organization_member', 'event', 'zone'])
          and privilege_row.grantee = role_ids.runtime_oid
     ), runtime_column_acl as (
       select relation_row.relname as table_name,
              attribute_row.attname as column_name,
              privilege_row.grantor,
              privilege_row.privilege_type,
              privilege_row.is_grantable,
              role_ids.source_owner_oid
         from pg_class relation_row
         join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
         join pg_attribute attribute_row
           on attribute_row.attrelid = relation_row.oid
          and attribute_row.attnum > 0
          and not attribute_row.attisdropped
         cross join role_ids
         cross join lateral aclexplode(attribute_row.attacl) privilege_row
        where namespace_row.nspname = 'public'
          and relation_row.relname = any(array['organization_member', 'event', 'zone'])
          and privilege_row.grantee = role_ids.runtime_oid
     ), column_acl_counts as (
       select count(*)::integer as acl_count,
              count(*) filter (
                where expected.table_name is not null
                  and runtime_column_acl.privilege_type = 'SELECT'
                  and runtime_column_acl.grantor = runtime_column_acl.source_owner_oid
                  and not runtime_column_acl.is_grantable
              )::integer as expected_count,
              count(*) filter (
                where expected.table_name is null
                   or runtime_column_acl.privilege_type <> 'SELECT'
                   or runtime_column_acl.grantor <> runtime_column_acl.source_owner_oid
                   or runtime_column_acl.is_grantable
              )::integer as excess_count
         from runtime_column_acl
         left join expected using (table_name, column_name)
     ), source_columns as (
       select relation_row.relname as table_name,
              relation_row.oid as table_oid,
              attribute_row.attname as column_name
         from pg_class relation_row
         join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
         join pg_attribute attribute_row
           on attribute_row.attrelid = relation_row.oid
          and attribute_row.attnum > 0
          and not attribute_row.attisdropped
        where namespace_row.nspname = 'public'
          and relation_row.relname = any(array['organization_member', 'event', 'zone'])
     ), effective_table_privileges as (
       select count(*)::integer as exact_count
         from pg_class relation_row
         join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
         cross join role_ids
         cross join (values
           ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
           ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
         ) checked_privilege(privilege_name)
        where namespace_row.nspname = 'public'
          and relation_row.relname = any(array['organization_member', 'event', 'zone'])
          and has_table_privilege(
            role_ids.runtime_oid,
            relation_row.oid,
            checked_privilege.privilege_name
          )
     ), effective_column_privileges as (
       select source_columns.table_name,
              source_columns.column_name,
              expected.table_name is not null as is_expected,
              has_column_privilege(
                role_ids.runtime_oid, source_columns.table_oid,
                source_columns.column_name, 'SELECT'
              ) as can_select,
              has_column_privilege(
                role_ids.runtime_oid, source_columns.table_oid,
                source_columns.column_name, 'SELECT WITH GRANT OPTION'
              ) as can_grant_select,
              has_column_privilege(
                role_ids.runtime_oid, source_columns.table_oid,
                source_columns.column_name, 'INSERT'
              ) as can_insert,
              has_column_privilege(
                role_ids.runtime_oid, source_columns.table_oid,
                source_columns.column_name, 'UPDATE'
              ) as can_update,
              has_column_privilege(
                role_ids.runtime_oid, source_columns.table_oid,
                source_columns.column_name, 'REFERENCES'
              ) as can_reference
         from source_columns
         cross join role_ids
         left join expected using (table_name, column_name)
     ), effective_column_counts as (
       select count(*) filter (
                where is_expected and can_select
              )::integer as expected_select_count,
              count(*) filter (
                where (not is_expected and can_select)
                   or can_grant_select
                   or can_insert
                   or can_update
                   or can_reference
              )::integer as excess_count
         from effective_column_privileges
     ), indirect_acl as (
       select privilege_row.grantee
         from pg_class relation_row
         join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
         cross join role_ids
         cross join lateral aclexplode(
           coalesce(relation_row.relacl, acldefault('r', relation_row.relowner))
         ) privilege_row
        where namespace_row.nspname = 'public'
          and relation_row.relname = any(array['organization_member', 'event', 'zone'])
          and privilege_row.grantee <> role_ids.runtime_oid
       union all
       select privilege_row.grantee
         from pg_class relation_row
         join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
         join pg_attribute attribute_row
           on attribute_row.attrelid = relation_row.oid
          and attribute_row.attnum > 0
          and not attribute_row.attisdropped
         cross join role_ids
         cross join lateral aclexplode(attribute_row.attacl) privilege_row
        where namespace_row.nspname = 'public'
          and relation_row.relname = any(array['organization_member', 'event', 'zone'])
          and privilege_row.grantee <> role_ids.runtime_oid
     ), indirect_acl_counts as (
       select count(*)::integer as exact_count
         from indirect_acl
         cross join role_ids
        where case
          when indirect_acl.grantee = 0 then true
          when role_ids.runtime_oid is null then false
          else pg_has_role(role_ids.runtime_oid, indirect_acl.grantee, 'USAGE')
        end
     )
     select runtime_role_state.exact_count as runtime_role_count,
            source_relations.exact_count as source_relation_count,
            required_columns.exact_count as required_column_count,
            runtime_table_acl.exact_count as runtime_table_acl_count,
            column_acl_counts.acl_count as runtime_column_acl_count,
            column_acl_counts.expected_count as runtime_expected_acl_count,
            column_acl_counts.excess_count as runtime_excess_acl_count,
            effective_table_privileges.exact_count
              as runtime_effective_table_privilege_count,
            effective_column_counts.expected_select_count
              as runtime_effective_expected_select_count,
            effective_column_counts.excess_count
              as runtime_effective_excess_column_privilege_count,
            indirect_acl_counts.exact_count as runtime_indirect_acl_count
       from runtime_role_state, source_relations, required_columns,
            runtime_table_acl, column_acl_counts, effective_table_privileges,
            effective_column_counts, indirect_acl_counts`,
  )
  const row = result.rows?.[0] || {}
  const exact = Number(row.runtime_role_count) === 1
    && Number(row.source_relation_count) === 3
    && Number(row.required_column_count) === 15
    && Number(row.runtime_table_acl_count) === 0
    && Number(row.runtime_column_acl_count) === 15
    && Number(row.runtime_expected_acl_count) === 15
    && Number(row.runtime_excess_acl_count) === 0
    && Number(row.runtime_effective_table_privilege_count) === 0
    && Number(row.runtime_effective_expected_select_count) === 15
    && Number(row.runtime_effective_excess_column_privilege_count) === 0
    && Number(row.runtime_indirect_acl_count) === 0
  return Object.freeze({ status: exact ? 'exact' : 'partial' })
}

function createProfitabilityBestcleanPostmigrationDependencies(options = {}) {
  const environment = options.environment || process.env
  const rootDir = path.resolve(options.rootDir || path.join(__dirname, '..', '..'))
  const projectId = text(options.projectId || environment.PROFITABILITY_PRODUCTION_PROJECT) || PROJECT
  const instanceId = text(options.instanceId || environment.PROFITABILITY_PRODUCTION_INSTANCE) || INSTANCE
  const instanceRegion = text(
    options.instanceRegion || environment.PROFITABILITY_PRODUCTION_INSTANCE_REGION,
  ) || REGION
  const database = text(options.database || environment.PROFITABILITY_PRODUCTION_DATABASE) || DATABASE
  const iamSourceReader = text(
    options.iamSourceReader || environment.PROFITABILITY_IAM_DATABASE_USER,
  ) || IAM_SOURCE_READER
  if (projectId !== PROJECT || instanceId !== INSTANCE || instanceRegion !== REGION
      || database !== DATABASE || iamSourceReader !== IAM_SOURCE_READER) {
    throw new Error('POSTMIGRATION_PRODUCTION_TARGET_MISMATCH')
  }

  const base = options.baseDependencies || createProfitabilityAccessV21ProductionDependencies({
    ...options,
    rootDir,
    projectId,
    instanceId,
    instanceRegion,
    database,
    iamDatabaseUser: iamSourceReader,
  })
  const pgAdapter = options.pgAdapter || createCloudSqlPgAdapter({
    instanceConnectionName: `${projectId}:${instanceRegion}:${instanceId}`,
    ipType: options.ipType || environment.PROFITABILITY_CLOUD_SQL_IP_TYPE || 'PUBLIC',
    ConnectorClass: options.ConnectorClass,
    ClientClass: options.ClientClass,
    connector: options.connector,
  })
  const postflights = loadPostflights(rootDir)

  const environmentInspector = Object.freeze({
    async inspect(runOptions, { executorPassword } = {}) {
      const [source, cloud, databaseState, sourceReadBridge] = await Promise.all([
        base.sourceControl.inspect(runOptions),
        base.cloudSqlAdmin.inspect(runOptions),
        base.databaseAdmin.audit({
          ...runOptions,
          executorPassword,
        }),
        (async () => {
          const client = await pgAdapter.connectIamAdmin({
            database,
            user: iamSourceReader,
            applicationName: 'cleanzi-profitability-source-read-bridge-audit',
          })
          try {
            await assertConnectionIdentity(client, iamSourceReader)
            return await inspectSourceReadBridge(client)
          } finally {
            await client.end()
          }
        })(),
      ])
      return Object.freeze({
        source,
        cloud,
        database: Object.freeze({ ...databaseState, sourceReadBridge }),
      })
    },
  })

  const connections = Object.freeze({
    async openSourceReader() {
      const client = await pgAdapter.connectIamAdmin({
        database,
        user: iamSourceReader,
        applicationName: 'cleanzi-profitability-bestclean-source-reader',
      })
      try {
        await assertConnectionIdentity(client, iamSourceReader)
        await assumeSourceOwner(client, iamSourceReader)
        return client
      } catch (error) {
        await client.end().catch(() => {})
        throw error
      }
    },
    async openTargetExecutor({ password }) {
      const client = await pgAdapter.connectBuiltin({
        database,
        user: EXECUTOR,
        password: secretString(password),
        applicationName: 'cleanzi-profitability-bestclean-target-executor',
      })
      try {
        await assertConnectionIdentity(client, EXECUTOR)
        return client
      } catch (error) {
        await client.end().catch(() => {})
        throw error
      }
    },
  })

  const credentials = Object.freeze({
    activateProvisioner: base.cloudSqlAdmin.activateProvisioner,
    settleProvisionerActivation: base.cloudSqlAdmin.settleProvisionerActivation,
    openProvisioner: base.databaseAdmin.openProvisioner,
    verifyPasswordAccepted: base.databaseAdmin.verifyPasswordAccepted,
    verifyPasswordRejected: base.databaseAdmin.verifyPasswordRejected,
  })

  const checks = Object.freeze({
    async accessSchema(client) {
      // The runtime repository's schemaReady() deliberately fingerprints the
      // least-privileged runtime role.  Provisioning runs as the owner, so its
      // exact checker is the migration's owner-specific postflight instead.
      await client.query(postflights.access)
      const result = await client.query(
        `select current_user = 'profitability_owner' as owner_role,
                has_table_privilege(
                  current_user,
                  'public.organization_access_profile',
                  'SELECT,INSERT,UPDATE'
                ) as profile_dml,
                has_table_privilege(
                  current_user,
                  'public.service_object_assignment',
                  'SELECT,INSERT,UPDATE'
                ) as assignment_dml,
                has_table_privilege(
                  current_user,
                  'public.profitability_access_enforcement',
                  'SELECT,INSERT'
                ) as marker_write`,
      )
      const row = result.rows?.[0] || {}
      if (!Object.values(row).every((value) => value === true)) {
        throw new Error('ACCESS_OWNER_SCHEMA_OR_PRIVILEGES_NOT_EXACT')
      }
    },
    async financialSchema(client) {
      await client.query(postflights.financial)
      const result = await client.query(
        `select current_user = 'profitability_owner' as owner_role,
                has_table_privilege(
                  current_user,
                  'public.profitability_financial_model_enforcement',
                  'SELECT,INSERT'
                ) as marker_write`,
      )
      const row = result.rows?.[0] || {}
      if (!Object.values(row).every((value) => value === true)) {
        throw new Error('FINANCIAL_OWNER_SCHEMA_OR_PRIVILEGES_NOT_EXACT')
      }
    },
  })

  let closePromise = null
  async function close() {
    if (!closePromise) {
      closePromise = Promise.allSettled([base.close(), pgAdapter.close()]).then((results) => {
        if (results.some((result) => result.status === 'rejected')) {
          throw new Error('POSTMIGRATION_DEPENDENCY_CLOSE_FAILED')
        }
      })
    }
    return closePromise
  }

  return Object.freeze({
    environment: environmentInspector,
    connections,
    credentials,
    checks,
    randomSecret: options.randomSecret || base.randomSecret,
    close,
  })
}

module.exports = {
  DATABASE,
  EXECUTOR,
  IAM_SOURCE_READER,
  INSTANCE,
  PROJECT,
  REGION,
  SOURCE_OWNER,
  assumeSourceOwner,
  assertConnectionIdentity,
  createProfitabilityBestcleanPostmigrationDependencies,
  inspectSourceReadBridge,
}
