-- Keep this migration LF-only: SECURITY DEFINER bodies use exact hashes.
-- ADDITIVE CANDIDATE ONLY. Do not run without separate database approval.
-- OPERATOR ENTRYPOINT: ../admin/20260908_workforce_schedule_worker_type_snapshot_apply.psql
-- Direct execution of this raw SQL is forbidden. The guarded wrapper validates
-- the exact database, PostgreSQL version and restricted migration identity.
--
-- This patch keeps the existing active-worker reader unchanged. It adds a new
-- V2 reader and a nullable snapshot column so the independent Grafik catalog
-- can distinguish operational worker types without granting runtime SELECT on
-- public.worker.
--
-- The V2 reader deliberately uses the separately audited workforce_roster_*
-- namespace. The currently deployed backend strictly allows exactly six
-- workforce_schedule_* functions, so this keeps the additive database state
-- compatible with that backend until the new backend is deployed.

do $workforce_schedule_worker_type_entrypoint_guard$
begin
  if current_setting('cleanzi.workforce_schedule_worker_type_snapshot_entrypoint', true)
       is distinct from 'GUARDED_WORKFORCE_SCHEDULE_WORKER_TYPE_SNAPSHOT_20260908' then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_GUARDED_ENTRYPOINT_REQUIRED';
  end if;

  -- Consume the one-shot marker before BEGIN. A retry must pass through every
  -- production-target check in the wrapper again.
  perform set_config(
    'cleanzi.workforce_schedule_worker_type_snapshot_entrypoint',
    '',
    false
  );
end
$workforce_schedule_worker_type_entrypoint_guard$;

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

select pg_advisory_xact_lock(
  hashtextextended('cleanzi:workforce-schedule:worker-type-snapshot:v1', 0)
);

do $workforce_schedule_worker_type_preflight$
declare
  function_count integer;
  actor_state record;
  person_state record;
  owner_state record;
  membership_state record;
begin
  if current_database() <> 'iclean-room-database'
     and current_database() !~ '^(cleanzi_)?workforce_schedule_ephemeral_[a-z0-9_]+$' then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_DATABASE_MISMATCH';
  end if;

  if current_user <> session_user or session_user <> 'migration_runner' then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_MIGRATION_SESSION_MISMATCH';
  end if;

  if current_setting('server_version_num')::integer not between 170000 and 179999 then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_POSTGRESQL_17_REQUIRED';
  end if;

  if pg_is_in_recovery() then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_PRIMARY_DATABASE_REQUIRED';
  end if;

  if current_setting('transaction_read_only') <> 'off'
     or current_setting('default_transaction_read_only') <> 'off' then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_READ_WRITE_SESSION_REQUIRED';
  end if;

  if obj_description(
       to_regclass('public.workforce_schedule_settings'),
       'pg_class'
     ) is distinct from 'cleanzi.workforce_schedule.core.v1' then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_CORE_V1_REQUIRED';
  end if;

  select relation.relowner = owner_role.oid as expected_owner,
         relation.relrowsecurity as rls_enabled,
         relation.relforcerowsecurity as rls_forced
    into person_state
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    join pg_roles owner_role on owner_role.rolname = 'workforce_schedule_owner'
   where namespace.nspname = 'public'
     and relation.relname = 'workforce_schedule_person'
     and relation.relkind = 'r';
  if not found
     or person_state.expected_owner is not true
     or person_state.rls_enabled is not true
     or person_state.rls_forced is not true then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_PERSON_TABLE_DRIFT';
  end if;

  if exists (
    select 1
      from pg_attribute attribute
     where attribute.attrelid = to_regclass('public.workforce_schedule_person')
       and attribute.attname = 'worker_type_snapshot'
       and attribute.attnum > 0
       and not attribute.attisdropped
  ) then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_COLUMN_ALREADY_EXISTS';
  end if;

  if to_regprocedure('public.workforce_roster_read_active_workers_v2(text)') is not null then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_FUNCTION_ALREADY_EXISTS';
  end if;

  if not exists (
    select 1
      from pg_attribute attribute
     where attribute.attrelid = to_regclass('public.worker')
       and attribute.attname = 'worker_type'
       and attribute.attnum > 0
       and not attribute.attisdropped
  ) then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_SOURCE_COLUMN_REQUIRED';
  end if;

  select count(*)::integer
    into function_count
    from pg_proc function_row
    join pg_namespace namespace on namespace.oid = function_row.pronamespace
   where namespace.nspname = 'public'
     and (
       function_row.proname like 'workforce\_schedule\_%' escape '\'
       or function_row.proname like 'workforce\_roster\_%' escape '\'
     );
  if exists (
    select 1
      from unnest(array[
        'public.workforce_schedule_authorize_session(text,text)',
        'public.workforce_schedule_actor_is_active(text)',
        'public.workforce_schedule_read_active_workers(text)',
        'public.workforce_schedule_read_active_objects(text)',
        'public.workforce_schedule_lock_worker_sources(text,text[])',
        'public.workforce_schedule_lock_object_sources(text,text[])'
      ]::text[]) required(function_signature)
     where to_regprocedure(required.function_signature) is null
  ) or function_count <> 6 or exists (
    select 1
      from pg_proc function_row
      join pg_namespace namespace on namespace.oid = function_row.pronamespace
     where namespace.nspname = 'public'
       and (
         function_row.proname like 'workforce\_schedule\_%' escape '\'
         or function_row.proname like 'workforce\_roster\_%' escape '\'
       )
       and not exists (
         select 1
           from unnest(array[
             to_regprocedure('public.workforce_schedule_authorize_session(text,text)'),
             to_regprocedure('public.workforce_schedule_actor_is_active(text)'),
             to_regprocedure('public.workforce_schedule_read_active_workers(text)'),
             to_regprocedure('public.workforce_schedule_read_active_objects(text)'),
             to_regprocedure('public.workforce_schedule_lock_worker_sources(text,text[])'),
             to_regprocedure('public.workforce_schedule_lock_object_sources(text,text[])')
           ]::oid[]) allowed(function_oid)
          where allowed.function_oid = function_row.oid
       )
  ) then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_CORE_FUNCTION_ALLOWLIST_DRIFT';
  end if;

  select function_row.prosecdef as security_definer,
         function_row.proowner = owner_role.oid as expected_owner,
         function_row.proconfig = array['search_path=pg_catalog']::text[] as fixed_search_path,
         function_row.prolang = (select oid from pg_language where lanname = 'sql') as expected_language,
         function_row.provolatile = 's' as stable_function,
         function_row.prokind = 'f' and not function_row.proleakproof as safe_function_kind,
         function_row.prosqlbody is null as expected_body_storage,
         pg_catalog.md5(function_row.prosrc) = '7f09b196e5d582cc5f16acf95f027ceb' as expected_body,
         not exists (
           select 1
             from aclexplode(coalesce(function_row.proacl, acldefault('f', function_row.proowner))) privilege
            where privilege.grantee = 0 and privilege.privilege_type = 'EXECUTE'
         ) as no_public_execute
    into actor_state
    from pg_proc function_row
    join pg_roles owner_role on owner_role.rolname = 'workforce_schedule_owner'
   where function_row.oid = to_regprocedure('public.workforce_schedule_actor_is_active(text)');
  if not found
     or actor_state.security_definer is not true
     or actor_state.expected_owner is not true
     or actor_state.fixed_search_path is not true
     or actor_state.expected_language is not true
     or actor_state.stable_function is not true
     or actor_state.safe_function_kind is not true
     or actor_state.expected_body_storage is not true
     or actor_state.expected_body is not true
     or actor_state.no_public_execute is not true then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_ACTOR_FUNCTION_DRIFT';
  end if;

  select not owner_role.rolcanlogin
           and not owner_role.rolinherit
           and not owner_role.rolsuper
           and not owner_role.rolbypassrls
           and not owner_role.rolcreaterole
           and not owner_role.rolcreatedb
           and not owner_role.rolreplication as restricted_owner
    into owner_state
    from pg_roles owner_role
   where owner_role.rolname = 'workforce_schedule_owner';
  if not found or owner_state.restricted_owner is not true then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_OWNER_ROLE_DRIFT';
  end if;

  if not exists (
    select 1
      from pg_roles session_role
     where session_role.rolname = 'workforce_schedule_session'
       and session_role.rolcanlogin
       and not session_role.rolinherit
       and not session_role.rolsuper
       and not session_role.rolbypassrls
       and not session_role.rolcreaterole
       and not session_role.rolcreatedb
       and not session_role.rolreplication
  ) or not exists (
    select 1
      from pg_roles runtime_role
     where runtime_role.rolname = 'workforce_schedule_app'
       and not runtime_role.rolcanlogin
       and not runtime_role.rolinherit
       and not runtime_role.rolsuper
       and not runtime_role.rolbypassrls
       and not runtime_role.rolcreaterole
       and not runtime_role.rolcreatedb
       and not runtime_role.rolreplication
  ) or not exists (
    select 1
      from pg_roles runner_role
     where runner_role.rolname = 'migration_runner'
       and runner_role.rolcanlogin
       and not runner_role.rolsuper
       and not runner_role.rolbypassrls
       and not runner_role.rolcreaterole
       and not runner_role.rolcreatedb
       and not runner_role.rolreplication
  ) then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_RUNTIME_ROLE_ATTRIBUTES_DRIFT';
  end if;

  if (select count(*) <> 1
        from pg_auth_members membership
       where membership.member = (select oid from pg_roles where rolname = 'workforce_schedule_session'))
     or exists (
       select 1
         from pg_auth_members membership
        where membership.member = (select oid from pg_roles where rolname = 'workforce_schedule_session')
          and (
            membership.roleid <> (select oid from pg_roles where rolname = 'workforce_schedule_app')
            or not membership.set_option
            or membership.inherit_option
            or membership.admin_option
          )
     ) then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_SESSION_ROLE_GRAPH_DRIFT';
  end if;

  if exists (
    with recursive set_reachable(roleid) as (
      select membership.roleid
        from pg_auth_members membership
       where membership.member = (select oid from pg_roles where rolname = 'workforce_schedule_session')
         and membership.set_option
      union
      select membership.roleid
        from pg_auth_members membership
        join set_reachable parent on parent.roleid = membership.member
       where membership.set_option
    )
    select 1
      from set_reachable
     where roleid <> (select oid from pg_roles where rolname = 'workforce_schedule_app')
  ) then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_SESSION_SET_GRAPH_DRIFT';
  end if;

  if exists (
    select 1
      from pg_auth_members membership
     where membership.member = (select oid from pg_roles where rolname = 'workforce_schedule_app')
  ) then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_APP_ROLE_GRAPH_DRIFT';
  end if;

  if pg_has_role('workforce_schedule_session', 'workforce_schedule_owner', 'MEMBER')
     or pg_has_role('workforce_schedule_session', 'workforce_schedule_owner', 'SET')
     or pg_has_role('workforce_schedule_app', 'workforce_schedule_owner', 'MEMBER')
     or pg_has_role('workforce_schedule_app', 'workforce_schedule_owner', 'SET') then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_OWNER_REACHABILITY_DRIFT';
  end if;

  if exists (
    with recursive inherited(roleid) as (
      select membership.roleid
        from pg_auth_members membership
       where membership.member = (select oid from pg_roles where rolname = 'migration_runner')
      union
      select membership.roleid
        from pg_auth_members membership
        join inherited parent on parent.roleid = membership.member
    )
    select 1
      from inherited
      join pg_roles inherited_role on inherited_role.oid = inherited.roleid
     where inherited_role.rolsuper
        or inherited_role.rolbypassrls
        or inherited_role.rolcreaterole
        or inherited_role.rolcreatedb
        or inherited_role.rolreplication
        or left(inherited_role.rolname, 3) = 'pg_'
  ) then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_MIGRATION_PRIVILEGE_GRAPH_DRIFT';
  end if;

  select membership.admin_option,
         membership.inherit_option,
         membership.set_option
    into membership_state
    from pg_auth_members membership
    join pg_roles granted_role on granted_role.oid = membership.roleid
    join pg_roles member_role on member_role.oid = membership.member
   where granted_role.rolname = 'workforce_schedule_owner'
     and member_role.rolname = 'migration_runner';
  if not found
     or membership_state.admin_option
     or membership_state.inherit_option
     or membership_state.set_option is not true then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_MIGRATION_ROLE_GRAPH_DRIFT';
  end if;

  if has_table_privilege('workforce_schedule_app', 'public.worker', 'SELECT')
     or has_any_column_privilege('workforce_schedule_app', 'public.worker', 'SELECT')
     or has_table_privilege('workforce_schedule_session', 'public.worker', 'SELECT')
     or has_any_column_privilege('workforce_schedule_session', 'public.worker', 'SELECT') then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_SOURCE_BOUNDARY_DRIFT';
  end if;
end
$workforce_schedule_worker_type_preflight$;

set local role workforce_schedule_owner;

alter table public.workforce_schedule_person
  add column worker_type_snapshot varchar(40),
  add constraint workforce_schedule_person_worker_type_snapshot_check check (
    worker_type_snapshot is null
    or (
      worker_type_snapshot = btrim(worker_type_snapshot)
      and worker_type_snapshot <> ''
    )
  );

comment on column public.workforce_schedule_person.worker_type_snapshot is
  'Current operational worker type copied by an explicit Grafik catalog synchronization.';

create function public.workforce_roster_read_active_workers_v2(p_org_id text)
returns table (
  source_worker_id_normalized text,
  source_worker_login text,
  source_auth_uid text,
  display_name text,
  role_snapshot text,
  worker_type_snapshot text
)
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select lower(btrim(worker_source.worker_id_normalized)),
         nullif(lower(btrim(coalesce(nullif(worker_source.login_normalized, ''), worker_source.login))), ''),
         nullif(btrim(worker_source.auth_uid), ''),
         coalesce(
           nullif(btrim(worker_source.full_name), ''),
           nullif(btrim(worker_source.login), ''),
           worker_source.worker_id
         )::text,
         nullif(btrim(worker_source.role), ''),
         nullif(btrim(worker_source.worker_type), '')
    from public.worker worker_source
   where worker_source.org_id = p_org_id
     and public.workforce_schedule_actor_is_active(p_org_id)
     and worker_source.active is true
     and upper(btrim(worker_source.status)) = 'ACTIVE'
     and nullif(btrim(worker_source.worker_id_normalized), '') is not null
   order by coalesce(
              nullif(btrim(worker_source.full_name), ''),
              nullif(btrim(worker_source.login), ''),
              worker_source.worker_id
            ) asc,
            lower(btrim(worker_source.worker_id_normalized)) asc
$function$;

comment on function public.workforce_roster_read_active_workers_v2(text) is
  'Tenant-guarded active worker snapshot reader including operational worker type.';

revoke all privileges on function
  public.workforce_roster_read_active_workers_v2(text)
from public, workforce_schedule_session, workforce_schedule_app, migration_runner;

do $workforce_schedule_worker_type_revoke_portal_acl$
begin
  if to_regrole('portal_app') is not null then
    execute 'revoke all privileges on function
      public.workforce_roster_read_active_workers_v2(text)
      from portal_app';
  end if;
end
$workforce_schedule_worker_type_revoke_portal_acl$;

grant execute on function
  public.workforce_roster_read_active_workers_v2(text)
to workforce_schedule_app;

-- Exercise the V2 SECURITY DEFINER body without reading a business tenant.
do $workforce_schedule_worker_type_probe$
begin
  perform *
    from public.workforce_roster_read_active_workers_v2('__migration_probe__');
end
$workforce_schedule_worker_type_probe$;

do $workforce_schedule_worker_type_postflight$
declare
  function_state record;
  column_state record;
begin
  if not exists (
    select 1
      from pg_roles session_role
     where session_role.rolname = 'workforce_schedule_session'
       and session_role.rolcanlogin
       and not session_role.rolinherit
       and not session_role.rolsuper
       and not session_role.rolbypassrls
       and not session_role.rolcreaterole
       and not session_role.rolcreatedb
       and not session_role.rolreplication
  ) or not exists (
    select 1
      from pg_roles runtime_role
     where runtime_role.rolname = 'workforce_schedule_app'
       and not runtime_role.rolcanlogin
       and not runtime_role.rolinherit
       and not runtime_role.rolsuper
       and not runtime_role.rolbypassrls
       and not runtime_role.rolcreaterole
       and not runtime_role.rolcreatedb
       and not runtime_role.rolreplication
  ) or not exists (
    select 1
      from pg_roles runner_role
     where runner_role.rolname = 'migration_runner'
       and runner_role.rolcanlogin
       and not runner_role.rolsuper
       and not runner_role.rolbypassrls
       and not runner_role.rolcreaterole
       and not runner_role.rolcreatedb
       and not runner_role.rolreplication
  ) then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_RUNTIME_ROLE_ATTRIBUTES_POSTFLIGHT_FAILED';
  end if;

  if (select count(*) <> 1
        from pg_auth_members membership
       where membership.member = (select oid from pg_roles where rolname = 'workforce_schedule_session'))
     or exists (
       select 1
         from pg_auth_members membership
        where membership.member = (select oid from pg_roles where rolname = 'workforce_schedule_session')
          and (
            membership.roleid <> (select oid from pg_roles where rolname = 'workforce_schedule_app')
            or not membership.set_option
            or membership.inherit_option
            or membership.admin_option
          )
     ) then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_SESSION_ROLE_GRAPH_POSTFLIGHT_FAILED';
  end if;

  if exists (
    with recursive set_reachable(roleid) as (
      select membership.roleid
        from pg_auth_members membership
       where membership.member = (select oid from pg_roles where rolname = 'workforce_schedule_session')
         and membership.set_option
      union
      select membership.roleid
        from pg_auth_members membership
        join set_reachable parent on parent.roleid = membership.member
       where membership.set_option
    )
    select 1
      from set_reachable
     where roleid <> (select oid from pg_roles where rolname = 'workforce_schedule_app')
  ) then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_SESSION_SET_GRAPH_POSTFLIGHT_FAILED';
  end if;

  if exists (
    select 1
      from pg_auth_members membership
     where membership.member = (select oid from pg_roles where rolname = 'workforce_schedule_app')
  ) then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_APP_ROLE_GRAPH_POSTFLIGHT_FAILED';
  end if;

  if pg_has_role('workforce_schedule_session', 'workforce_schedule_owner', 'MEMBER')
     or pg_has_role('workforce_schedule_session', 'workforce_schedule_owner', 'SET')
     or pg_has_role('workforce_schedule_app', 'workforce_schedule_owner', 'MEMBER')
     or pg_has_role('workforce_schedule_app', 'workforce_schedule_owner', 'SET') then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_OWNER_REACHABILITY_POSTFLIGHT_FAILED';
  end if;

  if exists (
    with recursive inherited(roleid) as (
      select membership.roleid
        from pg_auth_members membership
       where membership.member = (select oid from pg_roles where rolname = 'migration_runner')
      union
      select membership.roleid
        from pg_auth_members membership
        join inherited parent on parent.roleid = membership.member
    )
    select 1
      from inherited
      join pg_roles inherited_role on inherited_role.oid = inherited.roleid
     where inherited_role.rolsuper
        or inherited_role.rolbypassrls
        or inherited_role.rolcreaterole
        or inherited_role.rolcreatedb
        or inherited_role.rolreplication
        or left(inherited_role.rolname, 3) = 'pg_'
  ) then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_MIGRATION_PRIVILEGE_GRAPH_POSTFLIGHT_FAILED';
  end if;

  select format_type(attribute.atttypid, attribute.atttypmod) as column_type,
         not attribute.attnotnull as nullable_column
    into column_state
    from pg_attribute attribute
   where attribute.attrelid = to_regclass('public.workforce_schedule_person')
     and attribute.attname = 'worker_type_snapshot'
     and attribute.attnum > 0
     and not attribute.attisdropped;
  if not found
     or column_state.column_type <> 'character varying(40)'
     or column_state.nullable_column is not true then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_COLUMN_POSTFLIGHT_FAILED';
  end if;

  if not exists (
    select 1
      from pg_constraint constraint_row
     where constraint_row.conrelid = to_regclass('public.workforce_schedule_person')
       and constraint_row.conname = 'workforce_schedule_person_worker_type_snapshot_check'
       and constraint_row.contype = 'c'
       and constraint_row.convalidated
  ) then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_CONSTRAINT_POSTFLIGHT_FAILED';
  end if;

  if exists (
       select 1
         from unnest(array[
           'public.workforce_schedule_authorize_session(text,text)',
           'public.workforce_schedule_actor_is_active(text)',
           'public.workforce_schedule_read_active_workers(text)',
           'public.workforce_roster_read_active_workers_v2(text)',
           'public.workforce_schedule_read_active_objects(text)',
           'public.workforce_schedule_lock_worker_sources(text,text[])',
           'public.workforce_schedule_lock_object_sources(text,text[])'
         ]::text[]) required(function_signature)
        where to_regprocedure(required.function_signature) is null
     ) or (select count(*) <> 7
        from pg_proc function_row
        join pg_namespace namespace on namespace.oid = function_row.pronamespace
       where namespace.nspname = 'public'
         and (
           function_row.proname like 'workforce\_schedule\_%' escape '\'
           or function_row.proname like 'workforce\_roster\_%' escape '\'
         ))
     or exists (
       select 1
         from pg_proc function_row
         join pg_namespace namespace on namespace.oid = function_row.pronamespace
        where namespace.nspname = 'public'
          and (
            function_row.proname like 'workforce\_schedule\_%' escape '\'
            or function_row.proname like 'workforce\_roster\_%' escape '\'
          )
          and not exists (
            select 1
              from unnest(array[
                to_regprocedure('public.workforce_schedule_authorize_session(text,text)'),
                to_regprocedure('public.workforce_schedule_actor_is_active(text)'),
                to_regprocedure('public.workforce_schedule_read_active_workers(text)'),
                to_regprocedure('public.workforce_roster_read_active_workers_v2(text)'),
                to_regprocedure('public.workforce_schedule_read_active_objects(text)'),
                to_regprocedure('public.workforce_schedule_lock_worker_sources(text,text[])'),
                to_regprocedure('public.workforce_schedule_lock_object_sources(text,text[])')
              ]::oid[]) allowed(function_oid)
             where allowed.function_oid = function_row.oid
          )
     ) then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_FUNCTION_ALLOWLIST_POSTFLIGHT_FAILED';
  end if;

  select function_row.prosecdef as security_definer,
         function_row.proowner = owner_role.oid as expected_owner,
         function_row.proconfig = array['search_path=pg_catalog']::text[] as fixed_search_path,
         function_row.prolang = (select oid from pg_language where lanname = 'sql') as expected_language,
         function_row.provolatile = 's' as stable_function,
         function_row.prokind = 'f' and not function_row.proleakproof as safe_function_kind,
         function_row.prosqlbody is null as expected_body_storage,
         pg_get_function_result(function_row.oid) =
           'TABLE(source_worker_id_normalized text, source_worker_login text, source_auth_uid text, display_name text, role_snapshot text, worker_type_snapshot text)' as expected_result,
         has_function_privilege('workforce_schedule_app', function_row.oid, 'EXECUTE') as runtime_execute,
         has_function_privilege('workforce_schedule_session', function_row.oid, 'EXECUTE') as session_execute,
         exists (
           select 1
             from aclexplode(
               case
                 when function_row.proacl is null then acldefault('f', function_row.proowner)
                 when cardinality(function_row.proacl) > 0 then function_row.proacl
                 else null::aclitem[]
               end
             ) privilege
            where privilege.grantee not in (function_row.proowner, runtime_role.oid)
               or (
                 privilege.grantee = runtime_role.oid
                 and (privilege.privilege_type <> 'EXECUTE' or privilege.is_grantable)
               )
         ) as unexpected_acl
    into function_state
    from pg_proc function_row
    join pg_roles owner_role on owner_role.rolname = 'workforce_schedule_owner'
    join pg_roles runtime_role on runtime_role.rolname = 'workforce_schedule_app'
   where function_row.oid = to_regprocedure('public.workforce_roster_read_active_workers_v2(text)');
  if not found
     or function_state.security_definer is not true
     or function_state.expected_owner is not true
     or function_state.fixed_search_path is not true
     or function_state.expected_language is not true
     or function_state.stable_function is not true
     or function_state.safe_function_kind is not true
     or function_state.expected_body_storage is not true
     or function_state.expected_result is not true
     or function_state.runtime_execute is not true
     or function_state.session_execute is true
     or function_state.unexpected_acl is true then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_FUNCTION_POSTFLIGHT_FAILED';
  end if;

  if has_table_privilege('workforce_schedule_app', 'public.worker', 'SELECT')
     or has_any_column_privilege('workforce_schedule_app', 'public.worker', 'SELECT')
     or has_table_privilege('workforce_schedule_session', 'public.worker', 'SELECT')
     or has_any_column_privilege('workforce_schedule_session', 'public.worker', 'SELECT') then
    raise exception 'WORKFORCE_SCHEDULE_WORKER_TYPE_SOURCE_BOUNDARY_POSTFLIGHT_FAILED';
  end if;
end
$workforce_schedule_worker_type_postflight$;

reset role;

commit;
