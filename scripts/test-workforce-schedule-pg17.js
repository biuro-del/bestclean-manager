'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { Client } = require('pg')
const {
  createWorkforceScheduleRepository,
} = require('../workforce-schedule-repository')

const ROOT_DIR = path.resolve(__dirname, '..')
const MIGRATION_PATH = path.join(
  ROOT_DIR,
  'dataconnect',
  'migrations',
  '20260906_workforce_schedule_core_additive.sql',
)
const RUN_ARGUMENT = '--run-pg17-harness'
const CONFIRMATION_ENV = 'TEST_WORKFORCE_SCHEDULE_EPHEMERAL_CONFIRMATION'
const EXACT_CONFIRMATION = 'I_CONFIRM_THIS_IS_A_DISPOSABLE_LOCAL_POSTGRESQL_17_DATABASE'
const DATABASE_URL_ENV = 'TEST_WORKFORCE_SCHEDULE_DATABASE_URL'
const EPHEMERAL_DATABASE_PATTERN = /^(?:cleanzi_)?workforce_schedule_ephemeral_[a-z0-9_]+$/
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])
const SCHEDULE_SESSION_ROLE = 'workforce_schedule_session'
const SCHEDULE_RUNTIME_ROLE = 'workforce_schedule_app'
const MIGRATION_OWNER_ROLE = 'workforce_schedule_owner'
const MIGRATION_RUNNER_ROLE = 'migration_runner'
const ACL_SENTINEL_ROLE = 'portal_app'
const ROLE_GRAPH_SENTINEL_ROLE = 'workforce_schedule_source_reader'
const POSTFLIGHT_ACL_BARRIER = '-- WORKFORCE_SCHEDULE_POSTFLIGHT_ACL_BARRIER'
const MIGRATION_ENTRYPOINT_GUC = 'cleanzi.workforce_schedule_core_entrypoint'
const MIGRATION_ENTRYPOINT_MARKER = 'GUARDED_WORKFORCE_SCHEDULE_CORE_20260906'
const SOURCE_TABLES = Object.freeze([
  'organizations',
  'organization_member',
  'organization_subscription',
  'worker',
  'client',
])
const EFFECTS = Object.freeze({
  delivery: false,
  notifications: false,
  downstream: false,
})

const FIXTURE_SQL = String.raw`
create role workforce_schedule_session
  login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role workforce_schedule_app
  nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role workforce_schedule_owner
  nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role migration_runner
  login nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant workforce_schedule_app to workforce_schedule_session
  with admin false, inherit false, set true;
grant workforce_schedule_owner to migration_runner
  with admin false, inherit false, set true;

revoke create on schema public from public;
revoke create on schema public from workforce_schedule_session;
revoke create on schema public from workforce_schedule_app;
grant usage on schema public to workforce_schedule_app;

create table public.organizations (
  org_id varchar(64) primary key,
  owner_worker_id varchar(128),
  organization_kind varchar(32) not null,
  status varchar(16) not null,
  onboarding_status varchar(32) not null,
  deleted_at timestamptz
);

create table public.organization_member (
  org_id varchar(64) not null references public.organizations(org_id),
  uid varchar(128) not null,
  role varchar(32) not null,
  worker_id varchar(128),
  status varchar(16) not null,
  primary key (org_id, uid)
);

create table public.organization_subscription (
  org_id varchar(64) primary key references public.organizations(org_id),
  plan_code varchar(32) not null,
  status varchar(16) not null,
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz
);

create table public.worker (
  org_id varchar(64) not null references public.organizations(org_id),
  login varchar(80) not null,
  login_normalized varchar(80) not null,
  worker_id varchar(128) not null,
  worker_id_normalized varchar(128) not null,
  full_name varchar(240),
  auth_uid varchar(128),
  role varchar(64),
  active boolean not null,
  status varchar(16) not null,
  primary key (org_id, worker_id_normalized)
);

create table public.client (
  org_id varchar(64) not null references public.organizations(org_id),
  client_id varchar(64) not null,
  name varchar(180),
  status varchar(32),
  primary key (org_id, client_id)
);

insert into public.organizations (
  org_id, owner_worker_id, organization_kind, status, onboarding_status
)
values
  ('harness-alpha', 'W001', 'CLEANING_PROVIDER', 'ACTIVE', 'COMPLETED'),
  ('harness-beta', 'W002', 'CLEANING_PROVIDER', 'ACTIVE', 'COMPLETED'),
  ('harness-uid-mismatch', 'W003', 'CLEANING_PROVIDER', 'ACTIVE', 'COMPLETED'),
  ('harness-no-worker', null, 'CLEANING_PROVIDER', 'ACTIVE', 'COMPLETED'),
  ('harness-null-auth', 'W004', 'CLEANING_PROVIDER', 'ACTIVE', 'COMPLETED'),
  ('harness-inactive-worker', 'W005', 'CLEANING_PROVIDER', 'ACTIVE', 'COMPLETED'),
  ('harness-worker-status', 'W006', 'CLEANING_PROVIDER', 'ACTIVE', 'COMPLETED'),
  ('harness-cross-worker', 'W007', 'CLEANING_PROVIDER', 'ACTIVE', 'COMPLETED'),
  ('harness-cross-worker-source', null, 'CLEANING_PROVIDER', 'ACTIVE', 'COMPLETED');

insert into public.organization_member (org_id, uid, role, worker_id, status)
values
  ('harness-alpha', 'uid-alpha-admin', 'ADMIN', 'W001', 'ACTIVE'),
  ('harness-beta', 'uid-beta-admin', 'ADMIN', 'W002', 'ACTIVE'),
  ('harness-uid-mismatch', 'uid-mismatch-member', 'ADMIN', 'W003', 'ACTIVE'),
  ('harness-no-worker', 'uid-no-worker', 'ADMIN', null, 'ACTIVE'),
  ('harness-null-auth', 'uid-null-auth', 'ADMIN', 'W004', 'ACTIVE'),
  ('harness-inactive-worker', 'uid-inactive-worker', 'ADMIN', 'W005', 'ACTIVE'),
  ('harness-worker-status', 'uid-worker-status', 'ADMIN', 'W006', 'ACTIVE'),
  ('harness-cross-worker', 'uid-cross-worker', 'ADMIN', 'W007', 'ACTIVE');

insert into public.organization_subscription (
  org_id, plan_code, status, trial_ends_at, current_period_ends_at
)
values
  ('harness-alpha', 'PRO', 'ACTIVE', null, '2031-01-01T00:00:00Z'),
  ('harness-beta', 'PRO', 'ACTIVE', null, '2031-01-01T00:00:00Z'),
  ('harness-uid-mismatch', 'PRO', 'ACTIVE', null, '2031-01-01T00:00:00Z'),
  ('harness-no-worker', 'PRO', 'ACTIVE', null, '2031-01-01T00:00:00Z'),
  ('harness-null-auth', 'PRO', 'ACTIVE', null, '2031-01-01T00:00:00Z'),
  ('harness-inactive-worker', 'PRO', 'ACTIVE', null, '2031-01-01T00:00:00Z'),
  ('harness-worker-status', 'PRO', 'ACTIVE', null, '2031-01-01T00:00:00Z'),
  ('harness-cross-worker', 'PRO', 'ACTIVE', null, '2031-01-01T00:00:00Z');

insert into public.worker (
  org_id, login, login_normalized, worker_id, worker_id_normalized,
  full_name, auth_uid, role, active, status
)
values
  ('harness-alpha', 'alpha.worker', 'alpha.worker', 'W001', 'w001',
   'Alpha Worker', 'uid-alpha-admin', 'WORKER', true, 'ACTIVE'),
  ('harness-beta', 'beta.worker', 'beta.worker', 'W002', 'w002',
   'Beta Worker', 'uid-beta-admin', 'WORKER', true, 'ACTIVE'),
  ('harness-uid-mismatch', 'mismatch.worker', 'mismatch.worker', 'W003', 'w003',
   'Mismatch Worker', 'uid-different-worker', 'WORKER', true, 'ACTIVE'),
  ('harness-null-auth', 'null.auth', 'null.auth', 'W004', 'w004',
   'Null Auth Worker', null, 'WORKER', true, 'ACTIVE'),
  ('harness-inactive-worker', 'inactive.worker', 'inactive.worker', 'W005', 'w005',
   'Inactive Worker', 'uid-inactive-worker', 'WORKER', false, 'ACTIVE'),
  ('harness-worker-status', 'status.worker', 'status.worker', 'W006', 'w006',
   'Bad Status Worker', 'uid-worker-status', 'WORKER', true, 'SUSPENDED'),
  ('harness-cross-worker-source', 'cross.worker', 'cross.worker', 'W007', 'w007',
   'Cross-tenant Worker', 'uid-cross-worker', 'WORKER', true, 'ACTIVE');

insert into public.client (org_id, client_id, name, status)
values
  ('harness-alpha', 'CLIENT-ALPHA', 'Alpha Object', 'Aktywny'),
  ('harness-alpha', 'CLIENT-INACTIVE', 'Inactive Object', 'Nieaktywny'),
  ('harness-alpha', 'CLIENT-UNKNOWN', 'Unknown Object', 'FUTURE_STATUS'),
  ('harness-alpha', 'CLIENT-NULL', 'Null-status Object', null),
  ('harness-beta', 'CLIENT-BETA', 'Beta Object', 'ACTIVE');

grant usage on schema public to workforce_schedule_owner;
grant create on schema public to workforce_schedule_owner;
grant select on table
  public.organizations,
  public.organization_member,
  public.organization_subscription,
  public.worker,
  public.client
to workforce_schedule_owner;
grant update on table public.worker, public.client
to workforce_schedule_owner;
grant references on table public.organizations
to workforce_schedule_owner;
`

function text(value) {
  return String(value ?? '').trim()
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`
}

function parseLaunchConfiguration({ args = [], env = {} } = {}) {
  if (!args.includes(RUN_ARGUMENT)) {
    throw new Error(`HARNESS_RUN_ARGUMENT_REQUIRED:${RUN_ARGUMENT}`)
  }
  if (env[CONFIRMATION_ENV] !== EXACT_CONFIRMATION) {
    throw new Error(`EPHEMERAL_CONFIRMATION_REQUIRED:${CONFIRMATION_ENV}`)
  }

  const rawUrl = text(env[DATABASE_URL_ENV])
  if (!rawUrl) throw new Error(`TEST_DATABASE_URL_REQUIRED:${DATABASE_URL_ENV}`)

  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error('TEST_DATABASE_URL_INVALID')
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('TEST_DATABASE_PROTOCOL_REJECTED')
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error('TEST_DATABASE_HOST_MUST_BE_LOOPBACK')
  }
  if (parsed.search || parsed.hash) {
    throw new Error('TEST_DATABASE_URL_OPTIONS_REJECTED')
  }
  if (parsed.password) throw new Error('TEST_DATABASE_PASSWORD_REJECTED_USE_EPHEMERAL_TRUST_CLUSTER')
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
  if (!EPHEMERAL_DATABASE_PATTERN.test(databaseName)) {
    throw new Error('TEST_DATABASE_NAME_MUST_BE_EPHEMERAL')
  }
  if (!parsed.username) throw new Error('TEST_DATABASE_USER_REQUIRED')

  const runtimeUrl = new URL(rawUrl)
  runtimeUrl.username = SCHEDULE_SESSION_ROLE
  runtimeUrl.password = ''
  const migrationUrl = new URL(rawUrl)
  migrationUrl.username = MIGRATION_RUNNER_ROLE
  migrationUrl.password = ''

  return {
    connectionString: rawUrl,
    runtimeConnectionString: runtimeUrl.toString(),
    migrationConnectionString: migrationUrl.toString(),
    safeTarget: {
      databaseName,
      hostname: parsed.hostname,
      port: parsed.port || '5432',
      username: decodeURIComponent(parsed.username),
    },
  }
}

async function inspectUnmodifiedTarget(client) {
  const result = await client.query(
    `select current_database() as database_name,
            current_user as database_user,
            current_setting('server_version_num')::integer as server_version_num,
            host(inet_server_addr()) as server_address,
            inet_server_port()::integer as server_port,
            pg_is_in_recovery() as in_recovery,
            (select count(*)::integer
               from pg_class relation
               join pg_namespace namespace on namespace.oid = relation.relnamespace
              where namespace.nspname not in ('pg_catalog', 'information_schema')
                and namespace.nspname not like 'pg_toast%'
                and relation.relkind in ('r', 'p', 'v', 'm', 'f', 'S')) as user_relations,
            exists (
              select 1 from pg_roles
               where rolname in (
                 'workforce_schedule_session',
                 'workforce_schedule_app',
                 'workforce_schedule_owner',
                 'migration_runner'
               )
            ) as runtime_roles_exist,
            current_user = pg_get_userbyid(database_state.datdba) as owns_database,
            role_state.rolsuper as is_superuser,
            role_state.rolcreaterole as can_create_role
       from pg_database database_state
       join pg_roles role_state on role_state.rolname = current_user
      where database_state.datname = current_database()`,
  )
  return result.rows[0]
}

function assertSafeUnmodifiedTarget(target, safeTarget) {
  if (!target) throw new Error('TEST_DATABASE_PREFLIGHT_EMPTY')
  if (text(target.database_name) !== safeTarget.databaseName) {
    throw new Error('TEST_DATABASE_IDENTITY_MISMATCH')
  }
  if (text(target.database_user) !== safeTarget.username) {
    throw new Error('TEST_DATABASE_USER_MISMATCH')
  }
  if (Number(target.server_version_num) < 170000 || Number(target.server_version_num) >= 180000) {
    throw new Error(`POSTGRESQL_17_REQUIRED:${target.server_version_num || '<missing>'}`)
  }
  const address = text(target.server_address).toLowerCase()
  if (!['127.0.0.1', '::1'].includes(address)) {
    throw new Error('CONNECTED_SERVER_IS_NOT_LOOPBACK')
  }
  if (Number(target.server_port) !== Number(safeTarget.port)) {
    throw new Error('TEST_DATABASE_PORT_MISMATCH')
  }
  if (target.in_recovery === true) throw new Error('RECOVERY_SERVER_REJECTED')
  if (Number(target.user_relations) !== 0) {
    throw new Error(`TEST_DATABASE_NOT_EMPTY:${target.user_relations}`)
  }
  if (target.runtime_roles_exist === true) throw new Error('RUNTIME_ROLES_ALREADY_EXIST')
  if (target.owns_database !== true) throw new Error('TEST_DATABASE_OWNER_REQUIRED')
  if (target.is_superuser !== true && target.can_create_role !== true) {
    throw new Error('TEST_DATABASE_ROLE_ADMIN_REQUIRED')
  }
}

async function withRuntimeTransaction(client, { orgId, actorUid }, operation) {
  await client.query('begin')
  try {
    const identity = await client.query(
      `select session_user as session_user, current_user as current_user`,
    )
    assert.deepEqual(identity.rows[0], {
      session_user: SCHEDULE_SESSION_ROLE,
      current_user: SCHEDULE_SESSION_ROLE,
    })
    await client.query(`set local role ${SCHEDULE_RUNTIME_ROLE}`)
    const assumed = await client.query(`select current_user as current_user`)
    assert.equal(assumed.rows[0].current_user, SCHEDULE_RUNTIME_ROLE)
    const repository = createWorkforceScheduleRepository(client)
    await repository.setTenantContext(orgId)
    await repository.setActorContext(actorUid)
    const result = await operation(repository)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  }
}

async function withTemporaryOwnerMutation(client, mutationSql, operation) {
  await client.query('begin')
  try {
    await client.query(mutationSql)
    await client.query(`set local session authorization ${SCHEDULE_SESSION_ROLE}`)
    const sessionIdentity = await client.query(
      `select session_user as session_user, current_user as current_user`,
    )
    assert.deepEqual(sessionIdentity.rows[0], {
      session_user: SCHEDULE_SESSION_ROLE,
      current_user: SCHEDULE_SESSION_ROLE,
    })
    await client.query(`set local role ${SCHEDULE_RUNTIME_ROLE}`)
    const runtimeIdentity = await client.query(
      `select session_user as session_user, current_user as current_user`,
    )
    assert.deepEqual(runtimeIdentity.rows[0], {
      session_user: SCHEDULE_SESSION_ROLE,
      current_user: SCHEDULE_RUNTIME_ROLE,
    })
    const result = await operation(createWorkforceScheduleRepository(client))
    await client.query('rollback')
    return result
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  }
}

async function assertScheduleRuntimeStatementDenied(client, sql) {
  await client.query('begin')
  let denied = null
  try {
    await client.query(`set local role ${SCHEDULE_RUNTIME_ROLE}`)
    await client.query(`select set_config('cleanzi.org_id', 'harness-alpha', true)`)
    await client.query(`select set_config('cleanzi.actor_uid', 'uid-alpha-admin', true)`)
    await client.query(sql)
  } catch (error) {
    denied = error
  } finally {
    await client.query('rollback').catch(() => {})
  }
  assert.equal(denied?.code, '42501', `Statement was not denied by PostgreSQL: ${sql}`)
}

async function assertScheduleSessionBoundary(client) {
  const identity = await client.query(
    `select session_user as session_user, current_user as current_user`,
  )
  assert.deepEqual(identity.rows[0], {
    session_user: SCHEDULE_SESSION_ROLE,
    current_user: SCHEDULE_SESSION_ROLE,
  })

  const membership = await client.query(
    `select membership.admin_option,
            membership.inherit_option,
            membership.set_option,
            has_table_privilege('workforce_schedule_session', 'public.workforce_schedule_settings', 'SELECT') as inherited_select,
            has_table_privilege('workforce_schedule_session', 'public.workforce_schedule_settings', 'INSERT') as inherited_insert,
             has_table_privilege('workforce_schedule_session', 'public.worker', 'UPDATE') as session_worker_update,
             has_table_privilege('workforce_schedule_app', 'public.worker', 'UPDATE') as schedule_worker_update,
             has_table_privilege('workforce_schedule_app', 'public.worker', 'SELECT') as schedule_worker_select,
             has_function_privilege(
               'workforce_schedule_session',
               'public.workforce_schedule_authorize_session(text,text)',
               'EXECUTE'
             ) as session_authorize_execute,
             has_function_privilege(
               'workforce_schedule_session',
               'public.workforce_schedule_read_active_workers(text)',
               'EXECUTE'
             ) as session_runtime_function_execute,
             not granted_role.rolinherit as schedule_role_noinherit
       from pg_auth_members membership
       join pg_roles granted_role on granted_role.oid = membership.roleid
       join pg_roles member_role on member_role.oid = membership.member
      where granted_role.rolname = 'workforce_schedule_app'
        and member_role.rolname = 'workforce_schedule_session'`,
  )
  assert.deepEqual(membership.rows[0], {
    admin_option: false,
    inherit_option: false,
    set_option: true,
    inherited_select: false,
    inherited_insert: false,
    session_worker_update: false,
    schedule_worker_update: false,
    schedule_worker_select: false,
    session_authorize_execute: true,
    session_runtime_function_execute: false,
    schedule_role_noinherit: true,
  })

  const roleGraph = await client.query(
    `with recursive set_reachable(role_oid) as (
       select membership.roleid
         from pg_auth_members membership
        where membership.member = (select oid from pg_roles where rolname = $1)
          and membership.set_option
       union
       select membership.roleid
         from pg_auth_members membership
         join set_reachable parent on parent.role_oid = membership.member
        where membership.set_option
     )
     select (
              select count(*)::integer
                from pg_auth_members membership
               where membership.member = (select oid from pg_roles where rolname = $1)
            ) as session_direct_edges,
            (
              select array_agg(role.rolname::text order by role.rolname)::text[]
                from set_reachable
                join pg_roles role on role.oid = set_reachable.role_oid
            ) as session_set_roles,
            not exists (
              select 1
                from pg_auth_members membership
               where membership.member = (select oid from pg_roles where rolname = $2)
            ) as app_graph_empty`,
    [SCHEDULE_SESSION_ROLE, SCHEDULE_RUNTIME_ROLE],
  )
  assert.deepEqual(roleGraph.rows[0], {
    session_direct_edges: 1,
    session_set_roles: [SCHEDULE_RUNTIME_ROLE],
    app_graph_empty: true,
  })

  const authorized = await client.query(
    `select role, worker_id, organization_kind, organization_status,
            onboarding_status, plan_code, subscription_status, active_worker_id
       from public.workforce_schedule_authorize_session('harness-alpha', 'uid-alpha-admin')`,
  )
  assert.deepEqual(authorized.rows, [{
    role: 'OWNER',
    worker_id: 'W001',
    organization_kind: 'CLEANING_PROVIDER',
    organization_status: 'ACTIVE',
    onboarding_status: 'COMPLETED',
    plan_code: 'PRO',
    subscription_status: 'ACTIVE',
    active_worker_id: 'W001',
  }])
  const mismatchedAuthorization = await client.query(
    `select *
       from public.workforce_schedule_authorize_session('harness-alpha', 'uid-beta-admin')`,
  )
  assert.equal(mismatchedAuthorization.rows.length, 0)

  for (const sql of [
    `select * from public.workforce_schedule_settings limit 1`,
    `select * from public.organization_member limit 1`,
    `select * from public.worker limit 1`,
    `select * from public.client limit 1`,
    `insert into public.workforce_schedule_settings
       (org_id, time_zone, weekly_limit_minutes, created_by_uid, updated_by_uid)
     values ('harness-alpha', 'Europe/Warsaw', 2400, 'uid-alpha-admin', 'uid-alpha-admin')`,
  ]) {
    let denied = null
    try {
      await client.query(sql)
    } catch (error) {
      denied = error
    }
    assert.equal(denied?.code, '42501', `workforce_schedule_session unexpectedly used schedule SQL without SET ROLE: ${sql}`)
  }

}

async function assertWorkerUidBindingBoundary(client) {
  for (const boundaryCase of [
    { orgId: 'harness-uid-mismatch', uid: 'uid-mismatch-member' },
    { orgId: 'harness-no-worker', uid: 'uid-no-worker' },
    { orgId: 'harness-null-auth', uid: 'uid-null-auth' },
    { orgId: 'harness-inactive-worker', uid: 'uid-inactive-worker' },
    { orgId: 'harness-worker-status', uid: 'uid-worker-status' },
    { orgId: 'harness-cross-worker', uid: 'uid-cross-worker' },
  ]) {
    const authorization = await client.query(
      `select role, worker_id, active_worker_id
         from public.workforce_schedule_authorize_session($1::text, $2::text)`,
      [boundaryCase.orgId, boundaryCase.uid],
    )
    assert.equal(authorization.rows.length, 1)
    assert.equal(
      authorization.rows[0].active_worker_id,
      null,
      'Membership without an identically UID-bound active worker passed the worker guard.',
    )
    assert.notEqual(
      authorization.rows[0].role,
      'OWNER',
      'Unbound membership was elevated through organization.owner_worker_id.',
    )

    await client.query('begin')
    try {
      await client.query(`set local role ${SCHEDULE_RUNTIME_ROLE}`)
      await client.query(
        `select set_config('cleanzi.org_id', $1::text, true)`,
        [boundaryCase.orgId],
      )
      await client.query(
        `select set_config('cleanzi.actor_uid', $1::text, true)`,
        [boundaryCase.uid],
      )
      const actorState = await client.query(
        `select public.workforce_schedule_actor_is_active($1::text) as actor_active,
                (select count(*)::integer
                   from public.workforce_schedule_read_active_workers($1::text)) as worker_count,
                (select count(*)::integer
                   from public.workforce_schedule_read_active_objects($1::text)) as object_count,
                (select count(*)::integer
                   from public.workforce_schedule_settings
                  where org_id = $1::text) as schedule_count`,
        [boundaryCase.orgId],
      )
      assert.deepEqual(actorState.rows[0], {
        actor_active: false,
        worker_count: 0,
        object_count: 0,
        schedule_count: 0,
      })
    } finally {
      await client.query('rollback').catch(() => {})
    }

    await client.query('begin')
    let rlsDenied = null
    try {
      await client.query(`set local role ${SCHEDULE_RUNTIME_ROLE}`)
      await client.query(`select set_config('cleanzi.org_id', $1::text, true)`, [boundaryCase.orgId])
      await client.query(`select set_config('cleanzi.actor_uid', $1::text, true)`, [boundaryCase.uid])
      await client.query(
        `insert into public.workforce_schedule_settings
           (org_id, time_zone, weekly_limit_minutes, created_by_uid, updated_by_uid)
         values ($1::text, 'Europe/Warsaw', 2400, $2::text, $2::text)`,
        [boundaryCase.orgId, boundaryCase.uid],
      )
    } catch (error) {
      rlsDenied = error
    } finally {
      await client.query('rollback').catch(() => {})
    }
    assert.equal(rlsDenied?.code, '42501', 'RLS accepted an actor without a bound active worker.')
  }
}

async function readCanonicalSources(client) {
  const organizations = await client.query(
    `select org_id, owner_worker_id, organization_kind, status, onboarding_status, deleted_at
       from public.organizations order by org_id`,
  )
  const memberships = await client.query(
    `select org_id, uid, role, worker_id, status
       from public.organization_member order by org_id, uid`,
  )
  const subscriptions = await client.query(
    `select org_id, plan_code, status, trial_ends_at, current_period_ends_at
       from public.organization_subscription order by org_id`,
  )
  const workers = await client.query(
    `select org_id, login, login_normalized, worker_id, worker_id_normalized,
            full_name, auth_uid, role, active, status
       from public.worker order by org_id, worker_id_normalized`,
  )
  const objects = await client.query(
    `select org_id, client_id, name, status
       from public.client order by org_id, client_id`,
  )
  return {
    organizations: organizations.rows,
    memberships: memberships.rows,
    subscriptions: subscriptions.rows,
    workers: workers.rows,
    objects: objects.rows,
  }
}

async function assertRestrictedMigrationOwner(client) {
  const result = await client.query(
    `with recursive inherited(role_oid) as (
       select membership.roleid
         from pg_auth_members membership
         join pg_roles owner on owner.oid = membership.member
        where owner.rolname = $1::text
       union
       select membership.roleid
         from pg_auth_members membership
         join inherited child on child.role_oid = membership.member
     )
     select function_state.function_count,
            function_state.all_owned_by_expected,
            not owner.rolsuper and not owner.rolbypassrls and not owner.rolcreaterole
              and not owner.rolcreatedb and not owner.rolreplication as restricted_owner,
            not owner.rolcanlogin as owner_no_login,
            not owner.rolinherit as owner_noinherit,
            not exists (
              select 1
                from pg_namespace namespace
                cross join lateral aclexplode(
                  coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))
                ) privilege
               where namespace.nspname = 'public'
                 and privilege.grantee = owner.oid
                 and privilege.is_grantable
            ) as owner_no_schema_grant_option,
            runner.rolcanlogin and not runner.rolsuper and not runner.rolbypassrls
              and not runner.rolcreaterole and not runner.rolcreatedb
              and not runner.rolreplication as restricted_runner_login,
            owner_grant.admin_option as runner_admin_option,
            owner_grant.inherit_option as runner_inherit_option,
            owner_grant.set_option as runner_set_option,
            not has_table_privilege(runner.rolname, 'public.worker', 'SELECT')
              as runner_does_not_inherit_owner_select,
            not exists (
              select 1 from inherited
              join pg_roles inherited_role on inherited_role.oid = inherited.role_oid
              where inherited_role.rolsuper
                 or inherited_role.rolbypassrls
                 or inherited_role.rolcreaterole
                 or inherited_role.rolcreatedb
                 or inherited_role.rolreplication
                 or left(inherited_role.rolname, 3) = 'pg_'
            ) as no_privileged_membership,
            not pg_has_role('workforce_schedule_app', owner.oid, 'MEMBER')
              and not pg_has_role('workforce_schedule_app', owner.oid, 'SET')
              as runtime_cannot_assume_owner
       from pg_roles owner
       join pg_roles runner on runner.rolname = $2::text
       join pg_auth_members owner_grant
         on owner_grant.roleid = owner.oid and owner_grant.member = runner.oid
       cross join lateral (
         select count(*)::integer as function_count,
                bool_and(procedure.proowner = owner.oid) as all_owned_by_expected
           from pg_proc procedure
           where procedure.oid in (
             to_regprocedure('public.workforce_schedule_authorize_session(text,text)'),
             to_regprocedure('public.workforce_schedule_actor_is_active(text)'),
             to_regprocedure('public.workforce_schedule_read_active_workers(text)'),
             to_regprocedure('public.workforce_schedule_read_active_objects(text)'),
             to_regprocedure('public.workforce_schedule_lock_worker_sources(text,text[])'),
            to_regprocedure('public.workforce_schedule_lock_object_sources(text,text[])')
          )
       ) function_state
      where owner.rolname = $1::text`,
    [MIGRATION_OWNER_ROLE, MIGRATION_RUNNER_ROLE],
  )
  assert.deepEqual(result.rows[0], {
    function_count: 6,
    all_owned_by_expected: true,
    restricted_owner: true,
    owner_no_login: true,
    owner_noinherit: true,
    owner_no_schema_grant_option: true,
    restricted_runner_login: true,
    runner_admin_option: false,
    runner_inherit_option: false,
    runner_set_option: true,
    runner_does_not_inherit_owner_select: true,
    no_privileged_membership: true,
    runtime_cannot_assume_owner: true,
  })
}

async function createTenantCatalog(client, { orgId, actorUid, personId, locationId, sourceObjectId }) {
  return withRuntimeTransaction(client, { orgId, actorUid }, async (repository) => {
    const ready = await repository.schemaReady()
    assert.deepEqual(ready, { ready: true, missing: [] })
    const settings = await repository.saveSettings({
      orgId,
      timeZone: 'Europe/Warsaw',
      weeklyLimitMinutes: 2400,
      expectedVersion: 0,
      actorUid,
    })
    const receipt = await repository.syncCatalogs({
      orgId,
      actorUid,
      createPersonId: () => personId,
      createLocationId: () => locationId,
    })
    const catalogs = await repository.bootstrap({
      orgId,
      from: '2030-01-14',
      to: '2030-01-14',
    })
    assert.equal(settings.version, 1)
    assert.equal(catalogs.people.length, 1)
    assert.equal(catalogs.locations.length, 1)
    assert.equal(catalogs.locations[0].sourceObjectId, sourceObjectId)
    assert.deepEqual(receipt.people, { active: 1, created: 1, updated: 0, deactivated: 0 })
    assert.deepEqual(receipt.locations, { active: 1, created: 1, updated: 0, deactivated: 0 })
    assert.match(receipt.synchronizedAt, /^\d{4}-\d{2}-\d{2}T/)
    return { settings, ...catalogs, receipt }
  })
}

function shiftInput({ shiftId = '', expectedVersion = 0, locationId, personId, endHour = 16 }) {
  const endTime = `${String(endHour).padStart(2, '0')}:00`
  const endUtcHour = endHour - 1
  return {
    shiftId,
    expectedVersion,
    title: 'PG17 harness shift',
    date: '2030-01-14',
    startTime: '08:00',
    endTime,
    startsAt: '2030-01-14T07:00:00.000Z',
    endsAt: `2030-01-14T${String(endUtcHour).padStart(2, '0')}:00:00.000Z`,
    timeZone: 'Europe/Warsaw',
    breakMinutes: 30,
    requiredHeadcount: 1,
    locationId,
    personIds: [personId],
    notes: 'Only the isolated PG17 harness can create this row.',
    instructions: [{ position: 1, text: 'Harness instruction' }],
  }
}

async function publishPending(client, { publicationId, idempotencyKey }) {
  return withRuntimeTransaction(
    client,
    { orgId: 'harness-alpha', actorUid: 'uid-alpha-admin' },
    async (repository) => {
      const shifts = await repository.lockPublicationScope({
        orgId: 'harness-alpha',
        from: '2030-01-14',
        to: '2030-01-14',
      })
      assert.equal(shifts.length, 1)
      await repository.lockPublicationDependencies({
        orgId: 'harness-alpha',
        candidateShiftIds: shifts.map((shift) => shift.shiftId),
        from: '2030-01-14',
        to: '2030-01-14',
      })
      const conflicts = await repository.listPublicationConflicts({
        orgId: 'harness-alpha',
        candidateShiftIds: shifts.map((shift) => shift.shiftId),
        from: '2030-01-14',
        to: '2030-01-14',
      })
      assert.deepEqual(conflicts, [])
      return repository.publish({
        orgId: 'harness-alpha',
        publicationId,
        from: '2030-01-14',
        to: '2030-01-14',
        timeZone: 'Europe/Warsaw',
        effects: EFFECTS,
        warningFingerprint: '',
        warnings: [],
        actorUid: 'uid-alpha-admin',
        idempotencyKey,
        shifts,
      })
    },
  )
}

async function runCrudAndPublication(client) {
  const alpha = await createTenantCatalog(client, {
    orgId: 'harness-alpha',
    actorUid: 'uid-alpha-admin',
    personId: 'person-alpha',
    locationId: 'location-alpha',
    sourceObjectId: 'CLIENT-ALPHA',
  })
  await createTenantCatalog(client, {
    orgId: 'harness-beta',
    actorUid: 'uid-beta-admin',
    personId: 'person-beta',
    locationId: 'location-beta',
    sourceObjectId: 'CLIENT-BETA',
  })

  const created = await withRuntimeTransaction(
    client,
    { orgId: 'harness-alpha', actorUid: 'uid-alpha-admin' },
    (repository) => repository.saveShift({
      orgId: 'harness-alpha',
      actorUid: 'uid-alpha-admin',
      createShiftId: () => 'shift-alpha',
      shift: shiftInput({
        locationId: alpha.locations[0].locationId,
        personId: alpha.people[0].personId,
      }),
    }),
  )
  assert.equal(created.shift.version, 1)
  assert.equal(created.shift.revision, 1)

  const readCreated = await withRuntimeTransaction(
    client,
    { orgId: 'harness-alpha', actorUid: 'uid-alpha-admin' },
    (repository) => repository.bootstrap({
      orgId: 'harness-alpha',
      from: '2030-01-14',
      to: '2030-01-14',
    }),
  )
  assert.equal(readCreated.shifts.length, 1)
  assert.equal(readCreated.shifts[0].shiftId, 'shift-alpha')

  const updated = await withRuntimeTransaction(
    client,
    { orgId: 'harness-alpha', actorUid: 'uid-alpha-admin' },
    (repository) => repository.saveShift({
      orgId: 'harness-alpha',
      actorUid: 'uid-alpha-admin',
      createShiftId: () => 'must-not-be-used',
      shift: shiftInput({
        shiftId: 'shift-alpha',
        expectedVersion: created.shift.version,
        locationId: alpha.locations[0].locationId,
        personId: alpha.people[0].personId,
        endHour: 17,
      }),
    }),
  )
  assert.equal(updated.shift.version, 2)
  assert.equal(updated.shift.revision, 2)

  const publication = await publishPending(client, {
    publicationId: 'publication-alpha-1',
    idempotencyKey: 'publication-alpha-1',
  })
  assert.equal(publication.visibility, 'INTERNAL_ONLY')
  assert.deepEqual(publication.effects, EFFECTS)

  const published = await withRuntimeTransaction(
    client,
    { orgId: 'harness-alpha', actorUid: 'uid-alpha-admin' },
    (repository) => repository.bootstrap({
      orgId: 'harness-alpha',
      from: '2030-01-14',
      to: '2030-01-14',
    }),
  )
  assert.equal(published.shifts[0].status, 'PUBLISHED')
  assert.deepEqual(published.publications[0].effects, EFFECTS)

  const archived = await withRuntimeTransaction(
    client,
    { orgId: 'harness-alpha', actorUid: 'uid-alpha-admin' },
    (repository) => repository.archiveShift({
      orgId: 'harness-alpha',
      shiftId: 'shift-alpha',
      expectedVersion: published.shifts[0].version,
      actorUid: 'uid-alpha-admin',
    }),
  )
  assert.equal(archived.shift.pendingDeletion, true)

  const archivePublication = await publishPending(client, {
    publicationId: 'publication-alpha-2',
    idempotencyKey: 'publication-alpha-2',
  })
  assert.equal(archivePublication.published[0].archived, true)
  assert.deepEqual(archivePublication.effects, EFFECTS)

  const storedEffects = await withRuntimeTransaction(
    client,
    { orgId: 'harness-alpha', actorUid: 'uid-alpha-admin' },
    () => client.query(
      `select effects_json from public.workforce_schedule_publication
        where org_id = 'harness-alpha' order by publication_id`,
    ),
  )
  assert.equal(storedEffects.rows.length, 2)
  for (const row of storedEffects.rows) assert.deepEqual(row.effects_json, EFFECTS)
}

async function assertTenantIsolation(client) {
  await withRuntimeTransaction(
    client,
    { orgId: 'harness-alpha', actorUid: 'uid-alpha-admin' },
    async () => {
      for (const table of [
        'workforce_schedule_settings',
        'workforce_schedule_location',
        'workforce_schedule_person',
        'workforce_schedule_shift',
        'workforce_schedule_shift_revision',
        'workforce_schedule_shift_revision_assignee',
        'workforce_schedule_shift_instruction',
        'workforce_schedule_command',
        'workforce_schedule_publication',
      ]) {
        const result = await client.query(
          `select count(*)::integer as count from public.${table} where org_id = 'harness-beta'`,
        )
        assert.equal(result.rows[0].count, 0, `Cross-tenant rows visible in ${table}`)
      }

      const sourceReaders = await client.query(
        `select
           (select count(*)::integer
              from public.workforce_schedule_read_active_workers('harness-beta')) as worker_count,
           (select count(*)::integer
              from public.workforce_schedule_read_active_objects('harness-beta')) as object_count,
           public.workforce_schedule_actor_is_active('harness-beta') as beta_actor_active`,
      )
      assert.deepEqual(sourceReaders.rows[0], {
        worker_count: 0,
        object_count: 0,
        beta_actor_active: false,
      })
    },
  )

  await assertScheduleRuntimeStatementDenied(
    client,
    `insert into public.workforce_schedule_command
       (org_id, actor_uid, idempotency_key, command_type, request_hash, effects_json, status)
     values (
       'harness-beta', 'uid-alpha-admin', 'cross-tenant-attempt', 'HARNESS',
       repeat('a', 64),
       '{"delivery": false, "notifications": false, "downstream": false}'::jsonb,
       'IN_PROGRESS'
     )`,
  )
}

async function assertSourceTablesAreReadOnly(client) {
  for (const table of SOURCE_TABLES) {
    await assertScheduleRuntimeStatementDenied(
      client,
      `select * from public.${table} limit 1`,
    )
    await assertScheduleRuntimeStatementDenied(
      client,
      `update public.${table} set org_id = org_id where org_id = 'harness-alpha'`,
    )
    await assertScheduleRuntimeStatementDenied(
      client,
      `delete from public.${table} where org_id = 'harness-alpha'`,
    )
  }
}

async function assertForeignTableAclDriftRejected(client) {
  const relationName = 'public.workforce_schedule_settings'
  const readiness = await withTemporaryOwnerMutation(
    client,
    `grant select on table ${relationName} to ${ACL_SENTINEL_ROLE}`,
    async (repository) => {
      const catalogEntry = await client.query(
        `select relation.relacl is not null
                  and cardinality(relation.relacl) > 0 as table_acl_present,
                exists (
                  select 1
                    from aclexplode(relation.relacl) privilege
                    join pg_roles grantee on grantee.oid = privilege.grantee
                   where grantee.rolname = $2::text
                     and privilege.privilege_type = 'SELECT'
                     and not privilege.is_grantable
                ) as expected_acl_present
           from pg_class relation
          where relation.oid = to_regclass($1::text)`,
        [relationName, ACL_SENTINEL_ROLE],
      )
      assert.deepEqual(catalogEntry.rows[0], {
        table_acl_present: true,
        expected_acl_present: true,
      })
      return repository.schemaReady()
    },
  )

  assert.equal(readiness.ready, false, 'Foreign table ACL was accepted.')
  assert.ok(readiness.missing.includes('runtime:TABLE_ACL'))

  const rolledBack = await client.query(
    `select not exists (
              select 1
                from pg_class relation
                cross join lateral aclexplode(relation.relacl) privilege
                join pg_roles grantee on grantee.oid = privilege.grantee
               where relation.oid = to_regclass($1::text)
                 and grantee.rolname = $2::text
                 and privilege.privilege_type = 'SELECT'
                 and not privilege.is_grantable
            ) as foreign_table_acl_cleared`,
    [relationName, ACL_SENTINEL_ROLE],
  )
  assert.deepEqual(rolledBack.rows[0], { foreign_table_acl_cleared: true })
}

async function assertColumnAclDriftRejected(client) {
  const relationName = 'public.workforce_schedule_settings'
  const cases = [
    {
      columnName: 'version',
      privilegeName: 'INSERT',
      grantOption: false,
      expectedMissing: ['runtime:COLUMN_ACL'],
    },
    {
      columnName: 'version',
      privilegeName: 'UPDATE',
      grantOption: false,
      expectedMissing: ['runtime:COLUMN_ACL'],
    },
    {
      columnName: 'org_id',
      privilegeName: 'REFERENCES',
      grantOption: false,
      expectedMissing: [
        'runtime:COLUMN_ACL',
        `${relationName}:REFERENCES:EXCESS`,
      ],
    },
    {
      columnName: 'version',
      privilegeName: 'SELECT',
      grantOption: true,
      expectedMissing: ['runtime:COLUMN_ACL', 'runtime:GRANT_OPTION'],
    },
  ]

  for (const columnAclCase of cases) {
    const grantOptionSql = columnAclCase.grantOption ? ' with grant option' : ''
    const readiness = await withTemporaryOwnerMutation(
      client,
      `grant ${columnAclCase.privilegeName} (${columnAclCase.columnName})
         on table ${relationName}
         to ${SCHEDULE_RUNTIME_ROLE}${grantOptionSql}`,
      async (repository) => {
        const catalogEntry = await client.query(
          `select attribute.attacl is not null
                    and cardinality(attribute.attacl) > 0 as column_acl_present,
                  exists (
                    select 1
                      from aclexplode(attribute.attacl) privilege
                      join pg_roles grantee on grantee.oid = privilege.grantee
                     where grantee.rolname = $3::text
                       and privilege.privilege_type = $4::text
                       and privilege.is_grantable = $5::boolean
                  ) as expected_acl_present
             from pg_attribute attribute
            where attribute.attrelid = to_regclass($1::text)
              and attribute.attname = $2::text
              and attribute.attnum > 0
              and not attribute.attisdropped`,
          [
            relationName,
            columnAclCase.columnName,
            SCHEDULE_RUNTIME_ROLE,
            columnAclCase.privilegeName,
            columnAclCase.grantOption,
          ],
        )
        assert.deepEqual(catalogEntry.rows[0], {
          column_acl_present: true,
          expected_acl_present: true,
        })
        return repository.schemaReady()
      },
    )

    assert.equal(
      readiness.ready,
      false,
      `${columnAclCase.privilegeName}(${columnAclCase.columnName}) column ACL was accepted.`,
    )
    for (const missingItem of columnAclCase.expectedMissing) {
      assert.ok(
        readiness.missing.includes(missingItem),
        `${columnAclCase.privilegeName}(${columnAclCase.columnName}) did not report ${missingItem}.`,
      )
    }

    const rolledBack = await client.query(
      `select attribute.attacl is null
                or cardinality(attribute.attacl) = 0 as column_acl_cleared
         from pg_attribute attribute
        where attribute.attrelid = to_regclass($1::text)
          and attribute.attname = $2::text
          and attribute.attnum > 0
          and not attribute.attisdropped`,
      [relationName, columnAclCase.columnName],
    )
    assert.deepEqual(rolledBack.rows[0], { column_acl_cleared: true })
  }
}

async function assertSchemaReadyFailsClosed(client, ownerUser) {
  const noUsage = await withTemporaryOwnerMutation(
    client,
    `revoke usage on schema public from public, ${SCHEDULE_RUNTIME_ROLE}`,
    (repository) => repository.schemaReady(),
  )
  assert.equal(noUsage.ready, false)
  assert.ok(noUsage.missing.includes('runtime:SCHEMA_USAGE'))

  const permissivePolicy = await withTemporaryOwnerMutation(
    client,
    `create policy workforce_schedule_harness_permissive
       on public.workforce_schedule_settings
       for all to ${SCHEDULE_RUNTIME_ROLE}
       using (true) with check (true)`,
    async (repository) => {
      const readiness = await repository.schemaReady()
      await repository.setTenantContext('harness-alpha')
      await repository.setActorContext('uid-alpha-admin')
      const leaked = await client.query(
        `select count(*)::integer as count
           from public.workforce_schedule_settings
          where org_id = 'harness-beta'`,
      )
      return { readiness, leakedRows: leaked.rows[0].count }
    },
  )
  assert.equal(permissivePolicy.leakedRows, 1)
  assert.equal(permissivePolicy.readiness.ready, false)
  assert.ok(permissivePolicy.readiness.missing.some((item) => (
    item.includes('workforce_schedule_settings') && item.includes('POLICY')
  )))

  const forgedExpectedPolicy = await withTemporaryOwnerMutation(
    client,
    `alter policy workforce_schedule_settings_tenant_policy
       on public.workforce_schedule_settings
       to ${SCHEDULE_RUNTIME_ROLE}
       using (
         (
            org_id = nullif(current_setting('cleanzi.org_id', true), '')
            and public.workforce_schedule_actor_is_active(org_id)
          ) or true
        )
        with check (
          (
            org_id = nullif(current_setting('cleanzi.org_id', true), '')
            and public.workforce_schedule_actor_is_active(org_id)
          ) or true
        )`,
    async (repository) => {
      const readiness = await repository.schemaReady()
      await repository.setTenantContext('harness-alpha')
      await repository.setActorContext('uid-alpha-admin')
      const leaked = await client.query(
        `select count(*)::integer as count
           from public.workforce_schedule_settings
          where org_id = 'harness-beta'`,
      )
      return { readiness, leakedRows: leaked.rows[0].count }
    },
  )
  assert.equal(forgedExpectedPolicy.leakedRows, 1)
  assert.equal(forgedExpectedPolicy.readiness.ready, false)
  assert.ok(forgedExpectedPolicy.readiness.missing.some((item) => (
    item.includes('workforce_schedule_settings') && item.includes('POLICY')
  )))

  const inheritedGrantOption = await withTemporaryOwnerMutation(
    client,
    `create role workforce_schedule_harness_exec_parent nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
     grant execute on function public.workforce_schedule_lock_worker_sources(text, text[])
       to workforce_schedule_harness_exec_parent with grant option;
     grant workforce_schedule_harness_exec_parent to ${SCHEDULE_RUNTIME_ROLE}`,
    (repository) => repository.schemaReady(),
  )
  assert.equal(inheritedGrantOption.ready, false)
  assert.ok(inheritedGrantOption.missing.some((item) => (
    item.endsWith(':FUNCTION_ACL') || item.endsWith(':UNEXPECTED_EXECUTE')
  )))

  const sessionRoleGraphDrift = await withTemporaryOwnerMutation(
    client,
    `create role workforce_schedule_readiness_session_extra
       nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
     grant workforce_schedule_readiness_session_extra to ${SCHEDULE_SESSION_ROLE}
       with admin false, inherit false, set true`,
    (repository) => repository.schemaReady(),
  )
  assert.equal(sessionRoleGraphDrift.ready, false)
  assert.ok(sessionRoleGraphDrift.missing.includes('runtime:SESSION_ROLE_GRAPH'))
  assert.ok(sessionRoleGraphDrift.missing.includes('runtime:SESSION_SET_GRAPH'))

  const appRoleGraphDrift = await withTemporaryOwnerMutation(
    client,
    `create role workforce_schedule_readiness_app_extra
       nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
     grant workforce_schedule_readiness_app_extra to ${SCHEDULE_RUNTIME_ROLE}
       with admin false, inherit false, set true`,
    (repository) => repository.schemaReady(),
  )
  assert.equal(appRoleGraphDrift.ready, false)
  assert.ok(appRoleGraphDrift.missing.includes('runtime:APP_ROLE_GRAPH'))

  const ownerMembership = await withTemporaryOwnerMutation(
    client,
    `grant ${quoteIdentifier(ownerUser)} to ${SCHEDULE_RUNTIME_ROLE}`,
    (repository) => repository.schemaReady(),
  )
  assert.equal(ownerMembership.ready, false)
  assert.ok(ownerMembership.missing.some((item) => item.endsWith(':OWNER_MEMBERSHIP')))

  const sourceWrites = await withTemporaryOwnerMutation(
    client,
    `grant update, delete on table public.worker, public.client to ${SCHEDULE_RUNTIME_ROLE}`,
    (repository) => repository.schemaReady(),
  )
  assert.equal(sourceWrites.ready, false)
  assert.ok(sourceWrites.missing.some((item) => item.includes('public.worker:UPDATE:EXCESS')))
  assert.ok(sourceWrites.missing.some((item) => item.includes('public.client:DELETE:EXCESS')))

  const sourceColumnWrite = await withTemporaryOwnerMutation(
    client,
    `grant update (full_name) on table public.worker to ${SCHEDULE_RUNTIME_ROLE}`,
    (repository) => repository.schemaReady(),
  )
  assert.equal(sourceColumnWrite.ready, false)
  assert.ok(sourceColumnWrite.missing.some((item) => item.includes('public.worker:UPDATE:EXCESS')))

  await assertForeignTableAclDriftRejected(client)
  await assertColumnAclDriftRejected(client)

  const appendOnlyColumnWrite = await withTemporaryOwnerMutation(
    client,
    `grant update (title) on table public.workforce_schedule_shift_revision
       to ${SCHEDULE_RUNTIME_ROLE}`,
    (repository) => repository.schemaReady(),
  )
  assert.equal(appendOnlyColumnWrite.ready, false)
  assert.ok(appendOnlyColumnWrite.missing.some((item) => (
    item.includes('public.workforce_schedule_shift_revision:UPDATE:EXCESS')
  )))
}

async function runGuardedHarnessMigration(client, migrationSql) {
  await client.query(
    'select set_config($1::text, $2::text, false)',
    [MIGRATION_ENTRYPOINT_GUC, MIGRATION_ENTRYPOINT_MARKER],
  )
  return client.query(migrationSql)
}

async function assertRawMigrationRequiresGuard(client, migrationSql) {
  let failure = null
  try {
    await client.query(migrationSql)
  } catch (error) {
    failure = error
  } finally {
    await client.query('rollback').catch(() => {})
  }
  assert.ok(failure, 'Raw migration unexpectedly ran without the guarded entrypoint marker.')
  assert.equal(failure.code, 'P0001')
  assert.match(text(failure.message), /WORKFORCE_SCHEDULE_GUARDED_ENTRYPOINT_REQUIRED/)
  await assertNoScheduleObjects(client, 'Raw migration without the guard changed the schema.')
}

async function assertSecondMigrationIsRejected(client, migrationSql) {
  let failure = null
  try {
    await runGuardedHarnessMigration(client, migrationSql)
  } catch (error) {
    failure = error
  } finally {
    await client.query('rollback').catch(() => {})
  }
  assert.ok(failure, 'The second migration execution unexpectedly succeeded.')
  assert.match(text(failure.message), /Refusing to reuse pre-existing relation public\.workforce_schedule_/)
  const identity = await client.query(
    `select session_user as session_user, current_user as current_user`,
  )
  assert.deepEqual(identity.rows[0], {
    session_user: MIGRATION_RUNNER_ROLE,
    current_user: MIGRATION_RUNNER_ROLE,
  })
}

async function assertNoScheduleObjects(client, label) {
  const result = await client.query(
    `select (
              select count(*)::integer
                from pg_class relation
                join pg_namespace namespace on namespace.oid = relation.relnamespace
               where namespace.nspname = 'public'
                 and relation.relname like 'workforce\\_schedule\\_%' escape '\\'
                 and relation.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
            ) as relation_count,
            (
              select count(*)::integer
                from pg_proc function_row
                join pg_namespace namespace on namespace.oid = function_row.pronamespace
               where namespace.nspname = 'public'
                 and function_row.proname like 'workforce\\_schedule\\_%' escape '\\'
            ) as function_count`,
  )
  assert.deepEqual(result.rows[0], { relation_count: 0, function_count: 0 }, label)
}

async function assertMigrationRejected(client, migrationSql, expectedMessage) {
  let failure = null
  try {
    await runGuardedHarnessMigration(client, migrationSql)
  } catch (error) {
    failure = error
  } finally {
    await client.query('rollback').catch(() => {})
  }
  assert.ok(failure, `Migration unexpectedly accepted ${expectedMessage}.`)
  assert.equal(failure.code, 'P0001')
  assert.match(text(failure.message), expectedMessage)
}

async function assertUnsafeDefaultAclRejected(adminClient, migrationClient, migrationSql) {
  await adminClient.query(
    `create role ${ACL_SENTINEL_ROLE}
       nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls`,
  )
  const cases = [
    {
      name: 'global-table',
      grant: `alter default privileges for role ${MIGRATION_OWNER_ROLE}
                grant select on tables to ${ACL_SENTINEL_ROLE}`,
      revoke: `alter default privileges for role ${MIGRATION_OWNER_ROLE}
                 revoke select on tables from ${ACL_SENTINEL_ROLE}`,
    },
    {
      name: 'sequence',
      grant: `alter default privileges for role ${MIGRATION_OWNER_ROLE} in schema public
                grant usage on sequences to ${ACL_SENTINEL_ROLE}`,
      revoke: `alter default privileges for role ${MIGRATION_OWNER_ROLE} in schema public
                 revoke usage on sequences from ${ACL_SENTINEL_ROLE}`,
    },
    {
      name: 'function',
      grant: `alter default privileges for role ${MIGRATION_OWNER_ROLE} in schema public
                grant execute on functions to ${ACL_SENTINEL_ROLE}`,
      revoke: `alter default privileges for role ${MIGRATION_OWNER_ROLE} in schema public
                 revoke execute on functions from ${ACL_SENTINEL_ROLE}`,
    },
  ]

  for (const defaultAclCase of cases) {
    await adminClient.query(defaultAclCase.grant)
    try {
      await assertMigrationRejected(
        migrationClient,
        migrationSql,
        /WORKFORCE_SCHEDULE_UNSAFE_DEFAULT_ACL/,
      )
      await assertNoScheduleObjects(
        adminClient,
        `Unsafe ${defaultAclCase.name} default ACL was not rolled back atomically.`,
      )
    } finally {
      await adminClient.query(defaultAclCase.revoke)
    }
  }

  const remaining = await adminClient.query(
    `select count(*)::integer as unsafe_count
       from pg_default_acl default_acl
       cross join lateral aclexplode(
         case when cardinality(default_acl.defaclacl) > 0
              then default_acl.defaclacl else null::aclitem[] end
       ) privilege
      where default_acl.defaclrole = (select oid from pg_roles where rolname = $1)
        and default_acl.defaclnamespace in (0, (select oid from pg_namespace where nspname = 'public'))
        and default_acl.defaclobjtype in ('r', 'S', 'f')
        and privilege.grantee <> default_acl.defaclrole`,
    [MIGRATION_OWNER_ROLE],
  )
  assert.equal(remaining.rows[0].unsafe_count, 0)
}

async function assertRoleGraphPreflightRejected(adminClient, migrationClient, migrationSql) {
  await adminClient.query(
    `create role ${ROLE_GRAPH_SENTINEL_ROLE}
       nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls`,
  )
  const cases = [
    {
      targetRole: SCHEDULE_SESSION_ROLE,
      expected: /WORKFORCE_SCHEDULE_SESSION_ROLE_GRAPH_MISMATCH/,
    },
    {
      targetRole: SCHEDULE_RUNTIME_ROLE,
      expected: /WORKFORCE_SCHEDULE_APP_ROLE_GRAPH_MISMATCH/,
    },
  ]
  try {
    for (const roleCase of cases) {
      await adminClient.query(
        `grant ${ROLE_GRAPH_SENTINEL_ROLE} to ${roleCase.targetRole}
           with admin false, inherit false, set true`,
      )
      try {
        await assertMigrationRejected(migrationClient, migrationSql, roleCase.expected)
        await assertNoScheduleObjects(
          adminClient,
          `Role graph drift for ${roleCase.targetRole} was not rejected atomically.`,
        )
      } finally {
        await adminClient.query(`revoke ${ROLE_GRAPH_SENTINEL_ROLE} from ${roleCase.targetRole}`)
      }
    }
  } finally {
    // The role is intentionally left detached inside the disposable database.
    // The harness never drops objects; the ephemeral cluster is removed as a unit.
  }
}

async function assertPreexistingScheduleFunctionRejected(adminClient, migrationClient, migrationSql) {
  const probeSignature = 'public.workforce_schedule_legacy_probe(integer)'
  await adminClient.query(
    `create function ${probeSignature} returns integer language sql as 'select $1'`,
  )
  try {
    await assertMigrationRejected(
      migrationClient,
      migrationSql,
      /Refusing to reuse pre-existing function public\.workforce_schedule_legacy_probe\(integer\)/,
    )
    const state = await adminClient.query(
      `select (
                select count(*)::integer
                  from pg_class relation
                  join pg_namespace namespace on namespace.oid = relation.relnamespace
                 where namespace.nspname = 'public'
                   and relation.relname like 'workforce\\_schedule\\_%' escape '\\'
              ) as relation_count,
              (
                select count(*)::integer
                  from pg_proc function_row
                  join pg_namespace namespace on namespace.oid = function_row.pronamespace
                 where namespace.nspname = 'public'
                   and function_row.proname like 'workforce\\_schedule\\_%' escape '\\'
              ) as function_count`,
    )
    assert.deepEqual(state.rows[0], { relation_count: 0, function_count: 1 })
  } finally {
    await adminClient.query(
      `alter function ${probeSignature} rename to workforce_harness_legacy_probe_retired`,
    )
  }
}

function injectBeforePostflight(migrationSql, injectedSql) {
  assert.equal(migrationSql.split(POSTFLIGHT_ACL_BARRIER).length, 2)
  return migrationSql.replace(
    POSTFLIGHT_ACL_BARRIER,
    `${injectedSql}\n${POSTFLIGHT_ACL_BARRIER}`,
  )
}

async function assertAclPostflightRejectsDrift(adminClient, migrationClient, migrationSql) {
  const cases = [
    {
      expected: /WORKFORCE_SCHEDULE_TABLE_ACL_POSTFLIGHT_FAILED/,
      sql: `grant select on table public.workforce_schedule_settings to ${ACL_SENTINEL_ROLE};`,
    },
    {
      name: 'column-insert-version',
      expected: /WORKFORCE_SCHEDULE_COLUMN_ACL_POSTFLIGHT_FAILED/,
      sql: `grant insert (version) on table public.workforce_schedule_settings
              to ${ACL_SENTINEL_ROLE};`,
    },
    {
      name: 'column-update-version',
      expected: /WORKFORCE_SCHEDULE_COLUMN_ACL_POSTFLIGHT_FAILED/,
      sql: `grant update (version) on table public.workforce_schedule_settings
              to ${ACL_SENTINEL_ROLE};`,
    },
    {
      name: 'column-references-org-id',
      expected: /WORKFORCE_SCHEDULE_COLUMN_ACL_POSTFLIGHT_FAILED/,
      sql: `grant references (org_id) on table public.workforce_schedule_settings
              to ${ACL_SENTINEL_ROLE};`,
    },
    {
      name: 'column-select-version-grant-option',
      expected: /WORKFORCE_SCHEDULE_COLUMN_ACL_POSTFLIGHT_FAILED/,
      sql: `grant select (version) on table public.workforce_schedule_settings
              to ${ACL_SENTINEL_ROLE} with grant option;`,
    },
    {
      expected: /WORKFORCE_SCHEDULE_SEQUENCE_ACL_POSTFLIGHT_FAILED/,
      sql: `create sequence public.workforce_schedule_acl_probe;
            grant usage on sequence public.workforce_schedule_acl_probe to ${ACL_SENTINEL_ROLE};`,
    },
    {
      expected: /WORKFORCE_SCHEDULE_FUNCTION_POSTFLIGHT_FAILED/,
      sql: `grant execute on function public.workforce_schedule_lock_worker_sources(text, text[])
             to ${ACL_SENTINEL_ROLE};`,
    },
    {
      expected: /WORKFORCE_SCHEDULE_FUNCTION_ALLOWLIST_POSTFLIGHT_FAILED/,
      sql: `create function public.workforce_schedule_unexpected_overload(integer)
              returns integer language sql as 'select $1';`,
    },
  ]

  for (const aclCase of cases) {
    await assertMigrationRejected(
      migrationClient,
      injectBeforePostflight(migrationSql, aclCase.sql),
      aclCase.expected,
    )
    await assertNoScheduleObjects(
      adminClient,
      `ACL postflight ${aclCase.name || aclCase.expected} did not roll back all schedule objects.`,
    )
  }
}

async function runHarness({ args = process.argv.slice(2), env = process.env } = {}) {
  const configuration = parseLaunchConfiguration({ args, env })
  const adminClient = new Client({
    connectionString: configuration.connectionString,
    application_name: 'cleanzi-workforce-schedule-pg17-harness-admin',
    connectionTimeoutMillis: 5000,
    query_timeout: 90000,
  })
  let runtimeClient = null
  let migrationClient = null
  let adminConnected = false
  try {
    await adminClient.connect()
    adminConnected = true
    const target = await inspectUnmodifiedTarget(adminClient)
    assertSafeUnmodifiedTarget(target, configuration.safeTarget)

    const migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf8')
    assert.doesNotMatch(FIXTURE_SQL, /\bdrop\b/i)
    assert.doesNotMatch(migrationSql, /\bdrop\b/i)

    await adminClient.query(FIXTURE_SQL)
    const sourceBefore = await readCanonicalSources(adminClient)

    migrationClient = new Client({
      connectionString: configuration.migrationConnectionString,
      application_name: 'cleanzi-workforce-schedule-pg17-harness-migration',
      connectionTimeoutMillis: 5000,
      query_timeout: 90000,
    })
    await migrationClient.connect()
    const runnerIdentity = await migrationClient.query(
      `select session_user as session_user, current_user as current_user`,
    )
    assert.deepEqual(runnerIdentity.rows[0], {
      session_user: MIGRATION_RUNNER_ROLE,
      current_user: MIGRATION_RUNNER_ROLE,
    })
    await assertRawMigrationRequiresGuard(migrationClient, migrationSql)
    await assertPreexistingScheduleFunctionRejected(adminClient, migrationClient, migrationSql)
    await assertRoleGraphPreflightRejected(adminClient, migrationClient, migrationSql)
    await assertUnsafeDefaultAclRejected(adminClient, migrationClient, migrationSql)
    await assertAclPostflightRejectsDrift(adminClient, migrationClient, migrationSql)
    await runGuardedHarnessMigration(migrationClient, migrationSql)
    const postMigrationIdentity = await migrationClient.query(
      `select session_user as session_user, current_user as current_user`,
    )
    assert.deepEqual(postMigrationIdentity.rows[0], {
      session_user: MIGRATION_RUNNER_ROLE,
      current_user: MIGRATION_RUNNER_ROLE,
    })
    await assertRestrictedMigrationOwner(adminClient)

    runtimeClient = new Client({
      connectionString: configuration.runtimeConnectionString,
      application_name: 'cleanzi-workforce-schedule-pg17-harness-runtime',
      connectionTimeoutMillis: 5000,
      query_timeout: 90000,
    })
    await runtimeClient.connect()
    await assertScheduleSessionBoundary(runtimeClient)
    await assertWorkerUidBindingBoundary(runtimeClient)

    await runCrudAndPublication(runtimeClient)
    await assertTenantIsolation(runtimeClient)
    await assertSourceTablesAreReadOnly(runtimeClient)
    await assertSchemaReadyFailsClosed(adminClient, MIGRATION_OWNER_ROLE)
    await assertSecondMigrationIsRejected(migrationClient, migrationSql)

    const sourceAfter = await readCanonicalSources(adminClient)
    assert.deepEqual(sourceAfter, sourceBefore)

    const finalReady = await withRuntimeTransaction(
      runtimeClient,
      { orgId: 'harness-alpha', actorUid: 'uid-alpha-admin' },
      (repository) => repository.schemaReady(),
    )
    assert.deepEqual(finalReady, { ready: true, missing: [] })

    return {
      ok: true,
      target: {
        databaseName: target.database_name,
        serverVersion: target.server_version_num,
        address: target.server_address,
        port: target.server_port,
      },
      schemaReady: finalReady,
      effects: EFFECTS,
      checks: [
        'canonical-fixture',
        'raw-migration-entrypoint-guard',
        'unsafe-default-acl-rejected-and-rolled-back',
        'preexisting-function-overload-rejected',
        'exact-set-role-graph',
        'firebase-uid-worker-binding',
        'table-column-sequence-function-acl-postflight',
        'migration',
        'schema-ready',
        'crud-and-internal-publication',
        'cross-tenant-rls',
        'source-read-only',
        'privilege-regressions-fail-closed',
        'additional-permissive-policy-rejected',
        'foreign-table-acl-relacl-and-rollback',
        'column-level-privilege-drift-rejected',
        'column-acl-matrix-attacl-and-rollback',
        'second-migration-rejected',
        'canonical-sources-unchanged',
      ],
    }
  } finally {
    if (runtimeClient) await runtimeClient.end().catch(() => {})
    if (migrationClient) await migrationClient.end().catch(() => {})
    if (adminConnected) await adminClient.end().catch(() => {})
  }
}

function printUsage() {
  console.error([
    'This destructive-to-test-data harness only accepts a new disposable local PostgreSQL 17 database.',
    'It never reads DATABASE_URL and never drops or cleans a database.',
    '',
    `Set ${DATABASE_URL_ENV}=postgresql://<admin>@127.0.0.1:<port>/cleanzi_workforce_schedule_ephemeral_<suffix>`,
    `Set ${CONFIRMATION_ENV}=${EXACT_CONFIRMATION}`,
    `Run: node scripts/test-workforce-schedule-pg17.js ${RUN_ARGUMENT}`,
    '',
    'After the run, stop and remove the entire ephemeral PostgreSQL cluster externally.',
  ].join('\n'))
}

if (require.main === module) {
  runHarness()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`Workforce Schedule PG17 harness failed: ${text(error.code || 'UNKNOWN')} ${text(error.message || error)}`)
      if (error?.stack) console.error(error.stack)
      printUsage()
      process.exitCode = 1
    })
}

module.exports = {
  CONFIRMATION_ENV,
  DATABASE_URL_ENV,
  EFFECTS,
  EPHEMERAL_DATABASE_PATTERN,
  EXACT_CONFIRMATION,
  FIXTURE_SQL,
  ACL_SENTINEL_ROLE,
  MIGRATION_PATH,
  MIGRATION_OWNER_ROLE,
  MIGRATION_RUNNER_ROLE,
  RUN_ARGUMENT,
  POSTFLIGHT_ACL_BARRIER,
  SCHEDULE_SESSION_ROLE,
  SCHEDULE_RUNTIME_ROLE,
  assertScheduleSessionBoundary,
  assertWorkerUidBindingBoundary,
  assertSchemaReadyFailsClosed,
  assertScheduleRuntimeStatementDenied,
  assertSafeUnmodifiedTarget,
  inspectUnmodifiedTarget,
  parseLaunchConfiguration,
  runHarness,
}
