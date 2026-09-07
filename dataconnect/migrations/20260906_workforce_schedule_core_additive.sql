-- ADDITIVE CANDIDATE ONLY. Do not run without separate database approval.
-- OPERATOR ENTRYPOINT: ../admin/20260906_workforce_schedule_core_apply.psql
-- Direct execution of this raw SQL is forbidden. It remains separate only as
-- deterministic PG17 harness input and is included by the guarded psql wrapper.
-- Grafik is an independent domain. It reads only canonical workers and clients
-- into snapshots and has no foreign keys to worker, client, task, order,
-- calendar, QR, workday or event data.

do $workforce_schedule_entrypoint_guard$
begin
  if current_setting('cleanzi.workforce_schedule_core_entrypoint', true)
       is distinct from 'GUARDED_WORKFORCE_SCHEDULE_CORE_20260906' then
    raise exception 'WORKFORCE_SCHEDULE_GUARDED_ENTRYPOINT_REQUIRED';
  end if;

  -- Consume the one-shot marker before BEGIN. Any retry must repeat every
  -- production-target check in the approved wrapper.
  perform set_config('cleanzi.workforce_schedule_core_entrypoint', '', false);
end
$workforce_schedule_entrypoint_guard$;

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

select pg_advisory_xact_lock(hashtextextended('cleanzi:workforce-schedule:core:v1', 0));

do $$
declare
  target_relation text;
  target_function text;
  privilege_name text;
  checked_role text;
  checked_role_row record;
  schedule_session_role record;
  migration_role record;
  role_membership record;
  missing_source text;
  unsafe_default_acl text;
begin
  foreach target_relation in array array[
    'workforce_schedule_settings',
    'workforce_schedule_location',
    'workforce_schedule_person',
    'workforce_schedule_shift',
    'workforce_schedule_shift_revision',
    'workforce_schedule_shift_revision_assignee',
    'workforce_schedule_shift_instruction',
    'workforce_schedule_command',
    'workforce_schedule_publication',
    'workforce_schedule_publication_item',
    'workforce_schedule_audit'
  ]
  loop
    if to_regclass(format('public.%I', target_relation)) is not null then
      raise exception 'Refusing to reuse pre-existing relation public.%. Perform a separate audited reconciliation.', target_relation;
    end if;
  end loop;

  -- Refuse every pre-existing schedule function, including unknown overloads.
  -- Checking only the six expected signatures would let an older or hostile
  -- workforce_schedule_* overload survive this additive migration.
  select format(
           '%I.%I(%s)',
           namespace.nspname,
           function_row.proname,
           pg_catalog.oidvectortypes(function_row.proargtypes)
         )
    into target_function
    from pg_proc function_row
    join pg_namespace namespace on namespace.oid = function_row.pronamespace
   where namespace.nspname = 'public'
     and function_row.proname like 'workforce\_schedule\_%' escape '\'
   order by function_row.proname, function_row.oid
   limit 1;
  if target_function is not null then
    raise exception 'Refusing to reuse pre-existing function %. Perform a separate audited reconciliation.', target_function;
  end if;

  select string_agg(required.table_name || '.' || required.column_name, ', ' order by required.table_name, required.column_name)
    into missing_source
    from (values
      ('organizations', 'org_id'),
      ('organizations', 'owner_worker_id'),
      ('organizations', 'organization_kind'),
      ('organizations', 'status'),
      ('organizations', 'onboarding_status'),
      ('organizations', 'deleted_at'),
      ('organization_member', 'org_id'),
      ('organization_member', 'uid'),
      ('organization_member', 'role'),
      ('organization_member', 'worker_id'),
      ('organization_member', 'status'),
      ('organization_subscription', 'org_id'),
      ('organization_subscription', 'plan_code'),
      ('organization_subscription', 'status'),
      ('organization_subscription', 'trial_ends_at'),
      ('organization_subscription', 'current_period_ends_at'),
      ('worker', 'org_id'),
      ('worker', 'login'),
      ('worker', 'login_normalized'),
      ('worker', 'worker_id'),
      ('worker', 'worker_id_normalized'),
      ('worker', 'full_name'),
      ('worker', 'auth_uid'),
      ('worker', 'role'),
      ('worker', 'active'),
      ('worker', 'status'),
      ('client', 'org_id'),
      ('client', 'client_id'),
      ('client', 'name'),
      ('client', 'status')
    ) as required(table_name, column_name)
   where not exists (
     select 1
       from pg_attribute attribute
      where attribute.attrelid = to_regclass(format('public.%I', required.table_name))
        and attribute.attname = required.column_name
        and attribute.attnum > 0
        and not attribute.attisdropped
   );
  if missing_source is not null then
    raise exception 'Required source columns are missing: %.', missing_source;
  end if;

  if current_user <> session_user then
    raise exception 'Migration preflight must run before SET ROLE.';
  end if;

  select * into migration_role from pg_roles where rolname = session_user;
  if not found then
    raise exception 'Migration session role does not exist.';
  end if;
  if not migration_role.rolcanlogin
     or migration_role.rolsuper or migration_role.rolbypassrls or migration_role.rolcreaterole
     or migration_role.rolcreatedb or migration_role.rolreplication then
    raise exception 'Migration session role must be a restricted LOGIN role.';
  end if;
  if session_user in ('workforce_schedule_session', 'workforce_schedule_app', 'workforce_schedule_owner') then
    raise exception 'Migration requires a separate restricted session role.';
  end if;
  if exists (
    with recursive inherited(roleid) as (
      select roleid from pg_auth_members where member = migration_role.oid
      union
      select membership.roleid
        from pg_auth_members membership
        join inherited parent on parent.roleid = membership.member
    )
    select 1
      from inherited
      join pg_roles inherited_role on inherited_role.oid = inherited.roleid
     where inherited_role.rolsuper or inherited_role.rolbypassrls
        or inherited_role.rolcreaterole or inherited_role.rolcreatedb
        or inherited_role.rolreplication or left(inherited_role.rolname, 3) = 'pg_'
  ) then
    raise exception 'Migration session role inherits a privileged database role.';
  end if;

  select * into schedule_session_role from pg_roles where rolname = 'workforce_schedule_session';
  if not found or not schedule_session_role.rolcanlogin or schedule_session_role.rolinherit
     or schedule_session_role.rolsuper or schedule_session_role.rolbypassrls or schedule_session_role.rolcreaterole
     or schedule_session_role.rolcreatedb or schedule_session_role.rolreplication then
    raise exception 'Required session role workforce_schedule_session must be a restricted LOGIN role.';
  end if;
  if exists (
    with recursive accessible(roleid) as (
      select roleid from pg_auth_members where member = schedule_session_role.oid
      union
      select membership.roleid
        from pg_auth_members membership
        join accessible parent on parent.roleid = membership.member
    )
    select 1
      from accessible
      join pg_roles accessible_role on accessible_role.oid = accessible.roleid
     where accessible_role.rolsuper or accessible_role.rolbypassrls
        or accessible_role.rolcreaterole or accessible_role.rolcreatedb
        or accessible_role.rolreplication or left(accessible_role.rolname, 3) = 'pg_'
  ) then
    raise exception 'Session role workforce_schedule_session is a member of a privileged database role.';
  end if;

  foreach checked_role in array array['workforce_schedule_app', 'workforce_schedule_owner']
  loop
    select * into checked_role_row from pg_roles where rolname = checked_role;
    if not found then
      raise exception 'Required preprovisioned role % does not exist.', checked_role;
    end if;
    if checked_role_row.rolcanlogin or checked_role_row.rolinherit
       or checked_role_row.rolsuper or checked_role_row.rolbypassrls or checked_role_row.rolcreaterole
       or checked_role_row.rolcreatedb or checked_role_row.rolreplication then
      raise exception 'Role % must be restricted NOLOGIN NOINHERIT.', checked_role;
    end if;
    if exists (
      with recursive inherited(roleid) as (
        select roleid from pg_auth_members where member = checked_role_row.oid
        union
        select membership.roleid
          from pg_auth_members membership
          join inherited parent on parent.roleid = membership.member
      )
      select 1
        from inherited
        join pg_roles inherited_role on inherited_role.oid = inherited.roleid
       where inherited_role.rolsuper or inherited_role.rolbypassrls
          or inherited_role.rolcreaterole or inherited_role.rolcreatedb
          or inherited_role.rolreplication or left(inherited_role.rolname, 3) = 'pg_'
    ) then
      raise exception 'Role % inherits a privileged database role.', checked_role;
    end if;
  end loop;

  -- Default privileges belong to the object-creating role and are inherited
  -- before object-level REVOKE statements run. Refuse every non-owner default
  -- grant, both database-global and for public, so no unrelated role can receive
  -- transient or future access to schedule tables, sequences or functions.
  select string_agg(
           format(
             '%s:%s:%s:%s%s',
             case default_acl.defaclobjtype
               when 'r' then 'TABLE'
               when 'S' then 'SEQUENCE'
               when 'f' then 'FUNCTION'
               else default_acl.defaclobjtype::text
             end,
             case when default_acl.defaclnamespace = 0 then '*'
                  else namespace.nspname end,
             case when privilege.grantee = 0 then 'PUBLIC'
                  else coalesce(grantee.rolname, privilege.grantee::text) end,
             privilege.privilege_type,
             case when privilege.is_grantable then ':GRANT_OPTION' else '' end
           ),
           ', ' order by default_acl.defaclobjtype, default_acl.defaclnamespace,
                        privilege.grantee, privilege.privilege_type
         )
    into unsafe_default_acl
    from pg_default_acl default_acl
    left join pg_namespace namespace on namespace.oid = default_acl.defaclnamespace
    cross join lateral aclexplode(
      case when cardinality(default_acl.defaclacl) > 0
           then default_acl.defaclacl else null::aclitem[] end
    ) privilege
    left join pg_roles grantee on grantee.oid = privilege.grantee
   where default_acl.defaclrole = (select oid from pg_roles where rolname = 'workforce_schedule_owner')
     and default_acl.defaclnamespace in (0, (select oid from pg_namespace where nspname = 'public'))
     and default_acl.defaclobjtype in ('r', 'S', 'f')
     and privilege.grantee <> default_acl.defaclrole;
  if unsafe_default_acl is not null then
    raise exception 'WORKFORCE_SCHEDULE_UNSAFE_DEFAULT_ACL: %', unsafe_default_acl;
  end if;

  select membership.* into role_membership
    from pg_auth_members membership
   where membership.member = schedule_session_role.oid
     and membership.roleid = (select oid from pg_roles where rolname = 'workforce_schedule_app');
  if not found or not role_membership.set_option
     or role_membership.inherit_option or role_membership.admin_option then
    raise exception 'workforce_schedule_session membership in workforce_schedule_app must be SET TRUE, INHERIT FALSE, ADMIN FALSE.';
  end if;
  if exists (
    select 1
      from pg_auth_members membership
     where membership.member = schedule_session_role.oid
       and membership.roleid = (select oid from pg_roles where rolname = 'workforce_schedule_app')
       and (membership.admin_option or membership.inherit_option or not membership.set_option)
  ) then
    raise exception 'workforce_schedule_session has an unexpected workforce_schedule_app membership edge.';
  end if;

  -- The runtime SET ROLE graph is an exact allowlist, not merely a check that
  -- the expected edge exists. The login may assume only workforce_schedule_app,
  -- and workforce_schedule_app must not be able to continue into another role.
  if (select count(*) <> 1
        from pg_auth_members membership
       where membership.member = schedule_session_role.oid)
     or exists (
       select 1
         from pg_auth_members membership
        where membership.member = schedule_session_role.oid
          and (
            membership.roleid <> (select oid from pg_roles where rolname = 'workforce_schedule_app')
            or not membership.set_option
            or membership.inherit_option
            or membership.admin_option
          )
     ) then
    raise exception 'WORKFORCE_SCHEDULE_SESSION_ROLE_GRAPH_MISMATCH: session may SET only workforce_schedule_app.';
  end if;
  if exists (
    select 1
      from pg_auth_members membership
     where membership.member = (select oid from pg_roles where rolname = 'workforce_schedule_app')
  ) then
    raise exception 'WORKFORCE_SCHEDULE_APP_ROLE_GRAPH_MISMATCH: workforce_schedule_app must not be a member of another role.';
  end if;
  if exists (
    with recursive set_reachable(roleid) as (
      select membership.roleid
        from pg_auth_members membership
       where membership.member = schedule_session_role.oid
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
    raise exception 'WORKFORCE_SCHEDULE_SESSION_SET_GRAPH_MISMATCH: session can SET an unexpected role.';
  end if;

  select membership.* into role_membership
    from pg_auth_members membership
   where membership.member = migration_role.oid
     and membership.roleid = (select oid from pg_roles where rolname = 'workforce_schedule_owner');
  if not found or not role_membership.set_option
     or role_membership.inherit_option or role_membership.admin_option then
    raise exception 'Migration membership in workforce_schedule_owner must be SET TRUE, INHERIT FALSE, ADMIN FALSE.';
  end if;
  if exists (
    select 1
      from pg_auth_members membership
     where membership.member = migration_role.oid
       and membership.roleid = (select oid from pg_roles where rolname = 'workforce_schedule_owner')
       and (membership.admin_option or membership.inherit_option or not membership.set_option)
  ) then
    raise exception 'Migration role has an unexpected workforce_schedule_owner membership edge.';
  end if;

  if pg_has_role('workforce_schedule_session', 'workforce_schedule_owner', 'MEMBER')
     or pg_has_role('workforce_schedule_session', 'workforce_schedule_owner', 'SET')
     or pg_has_role('workforce_schedule_app', 'workforce_schedule_owner', 'MEMBER')
     or pg_has_role('workforce_schedule_app', 'workforce_schedule_owner', 'SET') then
    raise exception 'Schedule session and runtime roles must not be able to assume workforce_schedule_owner.';
  end if;

  if not has_schema_privilege('workforce_schedule_app', 'public', 'USAGE') then
    raise exception 'Runtime role workforce_schedule_app needs USAGE on schema public.';
  end if;
  if has_schema_privilege('workforce_schedule_app', 'public', 'CREATE') then
    raise exception 'Runtime role workforce_schedule_app must not have CREATE on schema public.';
  end if;
  if not has_schema_privilege('workforce_schedule_owner', 'public', 'USAGE')
     or not has_schema_privilege('workforce_schedule_owner', 'public', 'CREATE') then
    raise exception 'workforce_schedule_owner needs USAGE and CREATE on schema public.';
  end if;

  -- Neither database login nor runtime role may scan shared multi-tenant source
  -- catalogs. Reviewed SECURITY DEFINER functions below expose only one
  -- authorized membership or the active rows for the transaction tenant.
  foreach checked_role in array array['workforce_schedule_session', 'workforce_schedule_app']
  loop
    foreach target_relation in array array[
      'organizations', 'organization_member', 'organization_subscription', 'worker', 'client'
    ]
    loop
      foreach privilege_name in array array[
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
      ]
      loop
        if has_table_privilege(checked_role, format('public.%I', target_relation), privilege_name)
           or (case
                when privilege_name in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
                  then has_any_column_privilege(checked_role, format('public.%I', target_relation), privilege_name)
                else false
              end) then
          raise exception 'Role % must not have source privilege % on public.%.', checked_role, privilege_name, target_relation;
        end if;
      end loop;
    end loop;
  end loop;

  if not has_table_privilege('workforce_schedule_owner', 'public.organizations', 'SELECT')
     or not has_table_privilege('workforce_schedule_owner', 'public.organization_member', 'SELECT')
     or not has_table_privilege('workforce_schedule_owner', 'public.organization_subscription', 'SELECT')
     or not has_table_privilege('workforce_schedule_owner', 'public.organizations', 'REFERENCES') then
    raise exception 'workforce_schedule_owner lacks source policy or foreign-key privileges.';
  end if;
  foreach target_relation in array array['worker', 'client']
  loop
    if not has_table_privilege('workforce_schedule_owner', format('public.%I', target_relation), 'SELECT')
       or not has_table_privilege('workforce_schedule_owner', format('public.%I', target_relation), 'UPDATE') then
      raise exception 'workforce_schedule_owner needs SELECT and UPDATE on public.% for the FOR SHARE lock function.', target_relation;
    end if;
  end loop;
end
$$;

set local role workforce_schedule_owner;

-- The session login receives one narrow authorization lookup. Firebase token
-- verification remains an application responsibility; this function only
-- prevents the database login from scanning shared membership/source tables.
create function public.workforce_schedule_authorize_session(
  p_org_id text,
  p_uid text
)
returns table (
  role text,
  status text,
  worker_id text,
  organization_kind text,
  organization_status text,
  onboarding_status text,
  organization_deleted_at text,
  plan_code text,
  subscription_status text,
  trial_ends_at text,
  current_period_ends_at text,
  active_worker_id text
)
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select (
           case
             when worker_source.worker_id is not null
              and nullif(organization_source.owner_worker_id, '') is not null
              and organization_source.owner_worker_id = member_source.worker_id then 'OWNER'
             else member_source.role
           end
         )::text,
         member_source.status::text,
         member_source.worker_id::text,
         organization_source.organization_kind::text,
         organization_source.status::text,
         organization_source.onboarding_status::text,
         organization_source.deleted_at::text,
         subscription_source.plan_code::text,
         subscription_source.status::text,
         subscription_source.trial_ends_at::text,
         subscription_source.current_period_ends_at::text,
         worker_source.worker_id::text
    from public.organization_member member_source
    join public.organizations organization_source
      on organization_source.org_id = member_source.org_id
    left join public.organization_subscription subscription_source
      on subscription_source.org_id = member_source.org_id
    left join public.worker worker_source
      on worker_source.org_id = member_source.org_id
     and worker_source.worker_id = member_source.worker_id
     and worker_source.auth_uid = member_source.uid
     and worker_source.active is true
     and upper(btrim(worker_source.status)) = 'ACTIVE'
   where member_source.org_id = p_org_id
     and member_source.uid = p_uid
     and member_source.status = 'ACTIVE'
   limit 1
$function$;

-- All RLS policies and source readers use the same transaction-local tenant
-- and actor predicate. The function discloses only a boolean to runtime.
create function public.workforce_schedule_actor_is_active(p_org_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select p_org_id = nullif(current_setting('cleanzi.org_id', true), '')
     and nullif(current_setting('cleanzi.actor_uid', true), '') is not null
     and exists (
       select 1
         from public.organization_member member_source
         join public.worker worker_source
           on worker_source.org_id = member_source.org_id
          and worker_source.worker_id = member_source.worker_id
          and worker_source.auth_uid = member_source.uid
          and worker_source.active is true
          and upper(btrim(worker_source.status)) = 'ACTIVE'
        where member_source.org_id = p_org_id
          and member_source.uid = nullif(current_setting('cleanzi.actor_uid', true), '')
          and member_source.status = 'ACTIVE'
     )
$function$;

create function public.workforce_schedule_read_active_workers(p_org_id text)
returns table (
  source_worker_id_normalized text,
  source_worker_login text,
  source_auth_uid text,
  display_name text,
  role_snapshot text
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
         nullif(btrim(worker_source.role), '')
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

create function public.workforce_schedule_read_active_objects(p_org_id text)
returns table (
  source_object_id text,
  display_name text
)
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select btrim(object_source.client_id),
         coalesce(nullif(btrim(object_source.name), ''), btrim(object_source.client_id))::text
    from public.client object_source
   where object_source.org_id = p_org_id
     and public.workforce_schedule_actor_is_active(p_org_id)
     and nullif(btrim(object_source.client_id), '') is not null
     and upper(btrim(coalesce(object_source.status, ''))) = any(array['ACTIVE', 'AKTYWNY']::text[])
   order by coalesce(nullif(btrim(object_source.name), ''), btrim(object_source.client_id)) asc,
            btrim(object_source.client_id) asc
$function$;

-- Row locks on canonical catalogs require UPDATE privilege in PostgreSQL even
-- for SELECT ... FOR SHARE. Narrow SECURITY DEFINER functions retain the locks
-- until the caller transaction ends without granting the schedule runtime source writes.
create function public.workforce_schedule_lock_worker_sources(
  p_org_id text,
  p_worker_ids text[]
)
returns table (
  source_worker_id_normalized text,
  active boolean,
  status text
)
language sql
security definer
set search_path = pg_catalog
as $function$
  select lower(btrim(worker_source.worker_id_normalized)),
         worker_source.active,
         upper(btrim(worker_source.status))
    from public.worker worker_source
   where worker_source.org_id = p_org_id
     and lower(btrim(worker_source.worker_id_normalized)) = any(p_worker_ids)
     and p_org_id = nullif(current_setting('cleanzi.org_id', true), '')
     and public.workforce_schedule_actor_is_active(p_org_id)
   order by lower(btrim(worker_source.worker_id_normalized))
   for share of worker_source
$function$;

create function public.workforce_schedule_lock_object_sources(
  p_org_id text,
  p_object_ids text[]
)
returns table (
  source_object_id text,
  active boolean,
  status text
)
language sql
security definer
set search_path = pg_catalog
as $function$
  select btrim(object_source.client_id),
         upper(btrim(coalesce(object_source.status, ''))) = any(array['ACTIVE', 'AKTYWNY']::text[]),
         upper(btrim(coalesce(object_source.status, '')))
    from public.client object_source
   where object_source.org_id = p_org_id
     and btrim(object_source.client_id) = any(p_object_ids)
     and p_org_id = nullif(current_setting('cleanzi.org_id', true), '')
     and public.workforce_schedule_actor_is_active(p_org_id)
   order by btrim(object_source.client_id)
   for share of object_source
$function$;

revoke all privileges on function
  public.workforce_schedule_authorize_session(text, text),
  public.workforce_schedule_actor_is_active(text),
  public.workforce_schedule_read_active_workers(text),
  public.workforce_schedule_read_active_objects(text),
  public.workforce_schedule_lock_worker_sources(text, text[]),
  public.workforce_schedule_lock_object_sources(text, text[])
from public, workforce_schedule_session, workforce_schedule_app, migration_runner;

-- portal_app is deliberately not part of the Grafik role graph. It is optional
-- in a fresh database, so revoke it dynamically only when it exists.
do $revoke_portal_function_acl$
begin
  if to_regrole('portal_app') is not null then
    execute 'revoke all privileges on function
      public.workforce_schedule_lock_worker_sources(text, text[]),
      public.workforce_schedule_lock_object_sources(text, text[]),
      public.workforce_schedule_authorize_session(text, text),
      public.workforce_schedule_actor_is_active(text),
      public.workforce_schedule_read_active_workers(text),
      public.workforce_schedule_read_active_objects(text)
      from portal_app';
  end if;
end
$revoke_portal_function_acl$;

grant execute on function
  public.workforce_schedule_actor_is_active(text),
  public.workforce_schedule_read_active_workers(text),
  public.workforce_schedule_read_active_objects(text),
  public.workforce_schedule_lock_worker_sources(text, text[]),
  public.workforce_schedule_lock_object_sources(text, text[])
to workforce_schedule_app;

grant execute on function
  public.workforce_schedule_authorize_session(text, text)
to workforce_schedule_session;

-- Execute all six SECURITY DEFINER bodies once without touching business rows.
do $$
begin
  perform *
    from public.workforce_schedule_authorize_session('__migration_probe__', '__migration_probe__');
  perform public.workforce_schedule_actor_is_active('__migration_probe__');
  perform *
    from public.workforce_schedule_read_active_workers('__migration_probe__');
  perform *
    from public.workforce_schedule_read_active_objects('__migration_probe__');
  perform *
    from public.workforce_schedule_lock_worker_sources('__migration_probe__', array[]::text[]);
  perform *
    from public.workforce_schedule_lock_object_sources('__migration_probe__', array[]::text[]);
end
$$;

create table public.workforce_schedule_settings (
  org_id varchar(64) not null,
  time_zone varchar(64) not null,
  weekly_limit_minutes integer not null default 2400,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by_uid varchar(128) not null,
  updated_at timestamptz not null default now(),
  updated_by_uid varchar(128) not null,
  primary key (org_id),
  constraint workforce_schedule_settings_org_fk
    foreign key (org_id) references public.organizations(org_id),
  constraint workforce_schedule_settings_time_zone_check
    check (time_zone = btrim(time_zone)
      and time_zone ~ '^[A-Za-z_]+/[A-Za-z0-9_.+-]+(/[A-Za-z0-9_.+-]+)*$'
      and time_zone !~ '^Etc/'),
  constraint workforce_schedule_settings_weekly_limit_check
    check (weekly_limit_minutes between 1 and 10080),
  constraint workforce_schedule_settings_version_check check (version >= 1)
);

comment on table public.workforce_schedule_settings is 'cleanzi.workforce_schedule.core.v1';

create table public.workforce_schedule_location (
  org_id varchar(64) not null,
  location_id varchar(96) not null,
  source_object_id varchar(64) not null,
  name varchar(180) not null,
  short_name varchar(80) not null,
  color varchar(7) not null,
  soft_color varchar(7) not null,
  status varchar(16) not null default 'ACTIVE',
  version integer not null default 1,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by_uid varchar(128) not null,
  updated_at timestamptz not null default now(),
  updated_by_uid varchar(128) not null,
  primary key (org_id, location_id),
  constraint workforce_schedule_location_org_fk
    foreign key (org_id) references public.organizations(org_id),
  constraint workforce_schedule_location_source_check
    check (source_object_id = btrim(source_object_id) and source_object_id <> ''),
  constraint workforce_schedule_location_status_check check (status in ('ACTIVE', 'INACTIVE')),
  constraint workforce_schedule_location_color_check check (color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint workforce_schedule_location_soft_color_check check (soft_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint workforce_schedule_location_version_check check (version >= 1),
  unique (org_id, source_object_id)
);

create table public.workforce_schedule_person (
  org_id varchar(64) not null,
  person_id varchar(96) not null,
  source_worker_id_normalized varchar(128) not null,
  source_worker_login varchar(80),
  source_auth_uid varchar(128),
  display_name varchar(240) not null,
  initials varchar(12) not null,
  role_snapshot varchar(64),
  status varchar(16) not null default 'ACTIVE',
  version integer not null default 1,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, person_id),
  constraint workforce_schedule_person_org_fk
    foreign key (org_id) references public.organizations(org_id),
  constraint workforce_schedule_person_status_check check (status in ('ACTIVE', 'INACTIVE')),
  constraint workforce_schedule_person_source_check check (
    source_worker_id_normalized = lower(btrim(source_worker_id_normalized))
    and source_worker_id_normalized <> ''
    and (source_worker_login is null
      or (source_worker_login = lower(btrim(source_worker_login))
        and source_worker_login <> ''))
    and (source_auth_uid is null
      or (source_auth_uid = btrim(source_auth_uid) and source_auth_uid <> ''))
  ),
  constraint workforce_schedule_person_version_check check (version >= 1),
  unique (org_id, source_worker_id_normalized)
);

create table public.workforce_schedule_shift (
  org_id varchar(64) not null,
  shift_id varchar(96) not null,
  lifecycle_status varchar(32) not null default 'DRAFT',
  current_revision_no integer not null default 1,
  published_revision_no integer,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by_uid varchar(128) not null,
  updated_at timestamptz not null default now(),
  updated_by_uid varchar(128) not null,
  archived_at timestamptz,
  archived_by_uid varchar(128),
  primary key (org_id, shift_id),
  constraint workforce_schedule_shift_org_fk
    foreign key (org_id) references public.organizations(org_id),
  constraint workforce_schedule_shift_status_check
    check (lifecycle_status in ('DRAFT', 'PUBLISHED', 'CHANGED_AFTER_PUBLISH', 'ARCHIVED')),
  constraint workforce_schedule_shift_revision_check
    check (current_revision_no >= 1
      and (published_revision_no is null or published_revision_no between 1 and current_revision_no)),
  constraint workforce_schedule_shift_version_check check (version >= 1),
  constraint workforce_schedule_shift_lifecycle_shape_check check (
    (lifecycle_status = 'DRAFT' and published_revision_no is null and archived_at is null and archived_by_uid is null)
    or (lifecycle_status = 'PUBLISHED' and published_revision_no = current_revision_no and archived_at is null and archived_by_uid is null)
    or (lifecycle_status = 'CHANGED_AFTER_PUBLISH' and published_revision_no is not null
      and published_revision_no < current_revision_no and archived_at is null and archived_by_uid is null)
    or (lifecycle_status = 'ARCHIVED' and published_revision_no = current_revision_no
      and archived_at is not null and archived_by_uid is not null)
  )
);

create table public.workforce_schedule_shift_revision (
  org_id varchar(64) not null,
  shift_id varchar(96) not null,
  revision_no integer not null,
  business_date date not null,
  title varchar(180) not null,
  local_start_time time without time zone not null,
  local_end_time time without time zone not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  time_zone varchar(64) not null,
  break_minutes integer not null default 0,
  required_headcount integer not null,
  location_id varchar(96) not null,
  notes text,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  created_by_uid varchar(128) not null,
  primary key (org_id, shift_id, revision_no),
  constraint workforce_schedule_shift_revision_head_fk
    foreign key (org_id, shift_id)
    references public.workforce_schedule_shift(org_id, shift_id),
  constraint workforce_schedule_shift_revision_location_fk
    foreign key (org_id, location_id)
    references public.workforce_schedule_location(org_id, location_id),
  constraint workforce_schedule_shift_revision_no_check check (revision_no >= 1),
  constraint workforce_schedule_shift_revision_interval_check check (ends_at > starts_at),
  constraint workforce_schedule_shift_revision_nonzero_local_time_check check (local_start_time <> local_end_time),
  constraint workforce_schedule_shift_revision_duration_check check (ends_at - starts_at <= interval '25 hours'),
  constraint workforce_schedule_shift_revision_break_check
    check (break_minutes >= 0 and break_minutes * interval '1 minute' < ends_at - starts_at),
  constraint workforce_schedule_shift_revision_headcount_check check (required_headcount between 1 and 100),
  constraint workforce_schedule_shift_revision_time_zone_check
    check (time_zone = btrim(time_zone)
      and time_zone ~ '^[A-Za-z_]+/[A-Za-z0-9_.+-]+(/[A-Za-z0-9_.+-]+)*$'
      and time_zone !~ '^Etc/'),
  constraint workforce_schedule_shift_revision_local_time_check check (
    starts_at at time zone time_zone = business_date + local_start_time
    and (ends_at at time zone time_zone)::time = local_end_time
    and (ends_at at time zone time_zone)::date in (business_date, business_date + 1)
  )
);

alter table public.workforce_schedule_shift
  add constraint workforce_schedule_shift_current_revision_fk
  foreign key (org_id, shift_id, current_revision_no)
  references public.workforce_schedule_shift_revision(org_id, shift_id, revision_no)
  deferrable initially deferred;

alter table public.workforce_schedule_shift
  add constraint workforce_schedule_shift_published_revision_fk
  foreign key (org_id, shift_id, published_revision_no)
  references public.workforce_schedule_shift_revision(org_id, shift_id, revision_no)
  deferrable initially deferred;

create table public.workforce_schedule_shift_revision_assignee (
  org_id varchar(64) not null,
  shift_id varchar(96) not null,
  revision_no integer not null,
  person_id varchar(96) not null,
  created_at timestamptz not null default now(),
  primary key (org_id, shift_id, revision_no, person_id),
  constraint workforce_schedule_shift_assignee_revision_fk
    foreign key (org_id, shift_id, revision_no)
    references public.workforce_schedule_shift_revision(org_id, shift_id, revision_no),
  constraint workforce_schedule_shift_assignee_person_fk
    foreign key (org_id, person_id)
    references public.workforce_schedule_person(org_id, person_id)
);

create index workforce_schedule_assignee_person_idx
  on public.workforce_schedule_shift_revision_assignee (org_id, person_id, shift_id, revision_no);

create table public.workforce_schedule_shift_instruction (
  org_id varchar(64) not null,
  shift_id varchar(96) not null,
  revision_no integer not null,
  position integer not null,
  instruction varchar(500) not null,
  created_at timestamptz not null default now(),
  primary key (org_id, shift_id, revision_no, position),
  constraint workforce_schedule_shift_instruction_revision_fk
    foreign key (org_id, shift_id, revision_no)
    references public.workforce_schedule_shift_revision(org_id, shift_id, revision_no),
  constraint workforce_schedule_shift_instruction_position_check check (position between 1 and 50),
  constraint workforce_schedule_shift_instruction_text_check check (btrim(instruction) <> '')
);

create table public.workforce_schedule_command (
  org_id varchar(64) not null,
  actor_uid varchar(128) not null,
  idempotency_key varchar(128) not null,
  command_type varchar(48) not null,
  request_hash char(64) not null,
  effects_json jsonb not null,
  status varchar(16) not null default 'IN_PROGRESS',
  response_json jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (org_id, actor_uid, idempotency_key),
  constraint workforce_schedule_command_org_fk
    foreign key (org_id) references public.organizations(org_id),
  constraint workforce_schedule_command_hash_check check (request_hash ~ '^[a-f0-9]{64}$'),
  constraint workforce_schedule_command_effects_check check (
    effects_json = '{"delivery": false, "notifications": false, "downstream": false}'::jsonb
  ),
  constraint workforce_schedule_command_status_check check (status in ('IN_PROGRESS', 'COMPLETED')),
  constraint workforce_schedule_command_completion_check check (
    (status = 'COMPLETED') = (completed_at is not null and response_json is not null)
    and (response_json is null or jsonb_typeof(response_json) = 'object')
  )
);

create table public.workforce_schedule_publication (
  org_id varchar(64) not null,
  publication_id varchar(96) not null,
  period_start date not null,
  period_end date not null,
  time_zone varchar(64) not null,
  effects_json jsonb not null,
  warning_fingerprint char(64),
  warnings_json jsonb not null default '[]'::jsonb,
  actor_uid varchar(128) not null,
  idempotency_key varchar(128) not null,
  created_at timestamptz not null default now(),
  primary key (org_id, publication_id),
  constraint workforce_schedule_publication_org_fk
    foreign key (org_id) references public.organizations(org_id),
  constraint workforce_schedule_publication_range_check check (period_end >= period_start),
  constraint workforce_schedule_publication_time_zone_check
    check (time_zone = btrim(time_zone)
      and time_zone ~ '^[A-Za-z_]+/[A-Za-z0-9_.+-]+(/[A-Za-z0-9_.+-]+)*$'
      and time_zone !~ '^Etc/'),
  constraint workforce_schedule_publication_effects_check check (
    effects_json = '{"delivery": false, "notifications": false, "downstream": false}'::jsonb
  ),
  constraint workforce_schedule_publication_warnings_shape_check check (jsonb_typeof(warnings_json) = 'array'),
  constraint workforce_schedule_publication_warning_hash_check
    check (warning_fingerprint is null or warning_fingerprint ~ '^[a-f0-9]{64}$')
);

create table public.workforce_schedule_publication_item (
  org_id varchar(64) not null,
  publication_id varchar(96) not null,
  shift_id varchar(96) not null,
  revision_no integer not null,
  created_at timestamptz not null default now(),
  primary key (org_id, publication_id, shift_id),
  constraint workforce_schedule_publication_item_publication_fk
    foreign key (org_id, publication_id)
    references public.workforce_schedule_publication(org_id, publication_id),
  constraint workforce_schedule_publication_item_revision_fk
    foreign key (org_id, shift_id, revision_no)
    references public.workforce_schedule_shift_revision(org_id, shift_id, revision_no)
);

create table public.workforce_schedule_audit (
  org_id varchar(64) not null,
  audit_id varchar(160) not null,
  entity_type varchar(48) not null,
  entity_id varchar(96) not null,
  action varchar(48) not null,
  actor_uid varchar(128) not null,
  idempotency_key varchar(128),
  before_json jsonb,
  after_json jsonb,
  occurred_at timestamptz not null default now(),
  primary key (org_id, audit_id),
  constraint workforce_schedule_audit_org_fk
    foreign key (org_id) references public.organizations(org_id),
  constraint workforce_schedule_audit_json_shape_check check (
    (before_json is null or jsonb_typeof(before_json) = 'object')
    and (after_json is null or jsonb_typeof(after_json) = 'object')
  )
);

create index workforce_schedule_shift_range_idx
  on public.workforce_schedule_shift_revision (org_id, business_date, starts_at, ends_at, shift_id, revision_no);
create index workforce_schedule_publication_period_idx
  on public.workforce_schedule_publication (org_id, period_start desc, period_end desc);
create index workforce_schedule_audit_entity_idx
  on public.workforce_schedule_audit (org_id, entity_type, entity_id, occurred_at desc);

-- Every schedule query requires transaction-local tenant and actor contexts.
do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'workforce_schedule_settings',
    'workforce_schedule_location',
    'workforce_schedule_person',
    'workforce_schedule_shift',
    'workforce_schedule_shift_revision',
    'workforce_schedule_shift_revision_assignee',
    'workforce_schedule_shift_instruction',
    'workforce_schedule_command',
    'workforce_schedule_publication',
    'workforce_schedule_publication_item',
    'workforce_schedule_audit'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    policy_name := table_name || '_tenant_policy';
    execute format(
      'create policy %I on public.%I as permissive for all to workforce_schedule_app
       using (
         org_id = nullif(current_setting(''cleanzi.org_id'', true), '''')
         and public.workforce_schedule_actor_is_active(org_id)
       )
       with check (
         org_id = nullif(current_setting(''cleanzi.org_id'', true), '''')
         and public.workforce_schedule_actor_is_active(org_id)
       )',
      policy_name, table_name
    );
  end loop;
end
$$;

revoke all privileges on table
  public.workforce_schedule_settings,
  public.workforce_schedule_location,
  public.workforce_schedule_person,
  public.workforce_schedule_shift,
  public.workforce_schedule_shift_revision,
  public.workforce_schedule_shift_revision_assignee,
  public.workforce_schedule_shift_instruction,
  public.workforce_schedule_command,
  public.workforce_schedule_publication,
  public.workforce_schedule_publication_item,
  public.workforce_schedule_audit
from public, workforce_schedule_session, workforce_schedule_app, migration_runner;

do $revoke_portal_table_acl$
declare
  schedule_table name;
begin
  if to_regrole('portal_app') is not null then
    for schedule_table in
      select relation.relname
        from pg_class relation
        join pg_namespace namespace on namespace.oid = relation.relnamespace
       where namespace.nspname = 'public'
         and relation.relkind in ('r', 'p')
         and relation.relname like 'workforce\_schedule\_%' escape '\'
    loop
      execute format(
        'revoke all privileges on table public.%I from portal_app',
        schedule_table
      );
    end loop;
  end if;
end
$revoke_portal_table_acl$;

-- The current schema does not require sequences. Keep their boundary explicit
-- so a later identity/sequence addition cannot silently inherit default ACL.
do $revoke_schedule_sequence_acl$
declare
  schedule_sequence name;
begin
  for schedule_sequence in
    select relation.relname
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
     where namespace.nspname = 'public'
       and relation.relkind = 'S'
       and relation.relname like 'workforce\_schedule\_%' escape '\'
  loop
    execute format(
      'revoke all privileges on sequence public.%I from public, workforce_schedule_session, workforce_schedule_app, migration_runner',
      schedule_sequence
    );
    if to_regrole('portal_app') is not null then
      execute format(
        'revoke all privileges on sequence public.%I from portal_app',
        schedule_sequence
      );
    end if;
  end loop;
end
$revoke_schedule_sequence_acl$;

grant select, insert, update on table
  public.workforce_schedule_settings,
  public.workforce_schedule_location,
  public.workforce_schedule_person,
  public.workforce_schedule_shift,
  public.workforce_schedule_command
to workforce_schedule_app;

grant select, insert on table
  public.workforce_schedule_shift_revision,
  public.workforce_schedule_shift_revision_assignee,
  public.workforce_schedule_shift_instruction,
  public.workforce_schedule_publication
to workforce_schedule_app;

grant insert on table
  public.workforce_schedule_publication_item,
  public.workforce_schedule_audit
to workforce_schedule_app;

-- WORKFORCE_SCHEDULE_POSTFLIGHT_ACL_BARRIER
do $$
declare
  table_name text;
  function_signature text;
  privilege_name text;
  function_state record;
  policy_row record;
  policy_count integer;
  expected_policy_expression text;
  unsafe_default_acl text;
begin
  if current_user <> 'workforce_schedule_owner' then
    raise exception 'Migration postflight must run as workforce_schedule_owner.';
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
    raise exception 'WORKFORCE_SCHEDULE_SESSION_ROLE_GRAPH_POSTFLIGHT_FAILED';
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
    raise exception 'WORKFORCE_SCHEDULE_SESSION_SET_GRAPH_POSTFLIGHT_FAILED';
  end if;
  if exists (
    select 1
      from pg_auth_members membership
     where membership.member = (select oid from pg_roles where rolname = 'workforce_schedule_app')
  ) then
    raise exception 'WORKFORCE_SCHEDULE_APP_ROLE_GRAPH_POSTFLIGHT_FAILED';
  end if;

  -- Recheck the raw catalog after object creation. This closes the window in
  -- which an administrator could change owner defaults between preflight and
  -- DDL; object ACL checks below independently validate the resulting objects.
  select string_agg(
           format(
             '%s:%s:%s:%s%s',
             case default_acl.defaclobjtype
               when 'r' then 'TABLE'
               when 'S' then 'SEQUENCE'
               when 'f' then 'FUNCTION'
               else default_acl.defaclobjtype::text
             end,
             case when default_acl.defaclnamespace = 0 then '*'
                  else namespace.nspname end,
             case when privilege.grantee = 0 then 'PUBLIC'
                  else coalesce(grantee.rolname, privilege.grantee::text) end,
             privilege.privilege_type,
             case when privilege.is_grantable then ':GRANT_OPTION' else '' end
           ),
           ', ' order by default_acl.defaclobjtype, default_acl.defaclnamespace,
                        privilege.grantee, privilege.privilege_type
         )
    into unsafe_default_acl
    from pg_default_acl default_acl
    left join pg_namespace namespace on namespace.oid = default_acl.defaclnamespace
    cross join lateral aclexplode(
      case when cardinality(default_acl.defaclacl) > 0
           then default_acl.defaclacl else null::aclitem[] end
    ) privilege
    left join pg_roles grantee on grantee.oid = privilege.grantee
   where default_acl.defaclrole = (select oid from pg_roles where rolname = 'workforce_schedule_owner')
     and default_acl.defaclnamespace in (0, (select oid from pg_namespace where nspname = 'public'))
     and default_acl.defaclobjtype in ('r', 'S', 'f')
     and privilege.grantee <> default_acl.defaclrole;
  if unsafe_default_acl is not null then
    raise exception 'WORKFORCE_SCHEDULE_UNSAFE_DEFAULT_ACL_POSTFLIGHT: %', unsafe_default_acl;
  end if;
  if not has_schema_privilege('workforce_schedule_app', 'public', 'USAGE')
     or has_schema_privilege('workforce_schedule_app', 'public', 'CREATE') then
    raise exception 'Runtime schema boundary postflight failed for workforce_schedule_app.';
  end if;

  foreach table_name in array array[
    'organizations', 'organization_member', 'organization_subscription', 'worker', 'client'
  ]
  loop
    foreach privilege_name in array array[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
    ]
    loop
      if has_table_privilege('workforce_schedule_app', format('public.%I', table_name), privilege_name)
         or has_table_privilege('workforce_schedule_session', format('public.%I', table_name), privilege_name)
         or (case
              when privilege_name in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
                then has_any_column_privilege('workforce_schedule_app', format('public.%I', table_name), privilege_name)
                  or has_any_column_privilege('workforce_schedule_session', format('public.%I', table_name), privilege_name)
              else false
            end) then
        raise exception 'Runtime/session source boundary postflight failed: privilege % on public.%.', privilege_name, table_name;
      end if;
    end loop;
  end loop;

  foreach table_name in array array[
    'workforce_schedule_settings',
    'workforce_schedule_location',
    'workforce_schedule_person',
    'workforce_schedule_shift',
    'workforce_schedule_shift_revision',
    'workforce_schedule_shift_revision_assignee',
    'workforce_schedule_shift_instruction',
    'workforce_schedule_command',
    'workforce_schedule_publication',
    'workforce_schedule_publication_item',
    'workforce_schedule_audit'
  ]
  loop
    if not exists (
      select 1 from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public' and relation.relname = table_name
        and relation.relkind = 'r'
        and relation.relowner = (select oid from pg_roles where rolname = 'workforce_schedule_owner')
        and relation.relrowsecurity and relation.relforcerowsecurity
    ) then
      raise exception 'Ownership or RLS postflight failed for public.%', table_name;
    end if;

    select count(*)::integer into policy_count
      from pg_policies
     where schemaname = 'public' and tablename = table_name;
    if policy_count <> 1 then
      raise exception 'Unexpected policy count % on public.%.', policy_count, table_name;
    end if;

    select * into policy_row from pg_policies
     where schemaname = 'public' and tablename = table_name
       and policyname = table_name || '_tenant_policy';
    expected_policy_expression :=
      'org_id=nullifcurrent_setting''cleanzi.org_id'',true,''''andworkforce_schedule_actor_is_activeorg_id';
    if not found
       or policy_row.permissive <> 'PERMISSIVE'
       or policy_row.cmd <> 'ALL'
       or policy_row.roles <> array['workforce_schedule_app'::name]
       or replace(replace(replace(
            regexp_replace(lower(coalesce(policy_row.qual, '')), '[[:space:]()]', '', 'g'),
            '::text', ''), 'public.', ''), 'pg_catalog.', '') <> expected_policy_expression
       or replace(replace(replace(
            regexp_replace(lower(coalesce(policy_row.with_check, '')), '[[:space:]()]', '', 'g'),
            '::text', ''), 'public.', ''), 'pg_catalog.', '') <> expected_policy_expression then
      raise exception 'Tenant policy postflight failed for public.%', table_name;
    end if;

    if exists (
      select 1
        from pg_trigger trigger_state
        join pg_class relation on relation.oid = trigger_state.tgrelid
        join pg_namespace namespace on namespace.oid = relation.relnamespace
       where namespace.nspname = 'public'
         and relation.relname = table_name
         and not trigger_state.tgisinternal
    ) then
      raise exception 'Unexpected DML trigger on public.%.', table_name;
    end if;
  end loop;

  foreach table_name in array array[
    'workforce_schedule_settings',
    'workforce_schedule_location',
    'workforce_schedule_person',
    'workforce_schedule_shift',
    'workforce_schedule_command'
  ]
  loop
    foreach privilege_name in array array['SELECT', 'INSERT', 'UPDATE']
    loop
      if not has_table_privilege('workforce_schedule_app', format('public.%I', table_name), privilege_name) then
        raise exception 'Missing runtime privilege % on public.%', privilege_name, table_name;
      end if;
    end loop;
    foreach privilege_name in array array['DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']
    loop
      if has_table_privilege('workforce_schedule_app', format('public.%I', table_name), privilege_name)
         or (case
              when privilege_name in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
                then has_any_column_privilege('workforce_schedule_app', format('public.%I', table_name), privilege_name)
              else false
            end) then
        raise exception 'Forbidden runtime privilege % on public.%', privilege_name, table_name;
      end if;
    end loop;
  end loop;

  foreach table_name in array array[
    'workforce_schedule_shift_revision',
    'workforce_schedule_shift_revision_assignee',
    'workforce_schedule_shift_instruction',
    'workforce_schedule_publication'
  ]
  loop
    foreach privilege_name in array array['SELECT', 'INSERT']
    loop
      if not has_table_privilege('workforce_schedule_app', format('public.%I', table_name), privilege_name) then
        raise exception 'Missing append-only privilege % on public.%', privilege_name, table_name;
      end if;
    end loop;
    foreach privilege_name in array array['UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']
    loop
      if has_table_privilege('workforce_schedule_app', format('public.%I', table_name), privilege_name)
         or (case
              when privilege_name in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
                then has_any_column_privilege('workforce_schedule_app', format('public.%I', table_name), privilege_name)
              else false
            end) then
        raise exception 'Forbidden append-only privilege % on public.%', privilege_name, table_name;
      end if;
    end loop;
  end loop;

  foreach table_name in array array['workforce_schedule_publication_item', 'workforce_schedule_audit']
  loop
    if not has_table_privilege('workforce_schedule_app', format('public.%I', table_name), 'INSERT') then
      raise exception 'Missing insert-only privilege on public.%', table_name;
    end if;
    foreach privilege_name in array array['SELECT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']
    loop
      if has_table_privilege('workforce_schedule_app', format('public.%I', table_name), privilege_name)
         or (case
              when privilege_name in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
                then has_any_column_privilege('workforce_schedule_app', format('public.%I', table_name), privilege_name)
              else false
            end) then
        raise exception 'Forbidden insert-only privilege % on public.%', privilege_name, table_name;
      end if;
    end loop;
  end loop;

  -- Raw ACL allowlist for every schedule table. This catches direct grants to
  -- portal_app or any unrelated role, including grants inherited from owner
  -- defaults. Runtime privileges must also match the table's exact write model.
  if exists (
    select 1
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      cross join lateral aclexplode(
        case
          when relation.relacl is null then acldefault('r', relation.relowner)
          when cardinality(relation.relacl) > 0 then relation.relacl
          else null::aclitem[]
        end
      ) privilege
     where namespace.nspname = 'public'
       and relation.relkind in ('r', 'p')
       and relation.relname like 'workforce\_schedule\_%' escape '\'
       and (
         privilege.grantee not in (
           (select oid from pg_roles where rolname = 'workforce_schedule_owner'),
           (select oid from pg_roles where rolname = 'workforce_schedule_app')
         )
         or (
           privilege.grantee = (select oid from pg_roles where rolname = 'workforce_schedule_app')
           and (
             privilege.is_grantable
             or not (
               (
                 relation.relname = any(array[
                   'workforce_schedule_settings',
                   'workforce_schedule_location',
                   'workforce_schedule_person',
                   'workforce_schedule_shift',
                   'workforce_schedule_command'
                 ]::name[])
                 and privilege.privilege_type = any(array['SELECT', 'INSERT', 'UPDATE']::text[])
               )
               or (
                 relation.relname = any(array[
                   'workforce_schedule_shift_revision',
                   'workforce_schedule_shift_revision_assignee',
                   'workforce_schedule_shift_instruction',
                   'workforce_schedule_publication'
                 ]::name[])
                 and privilege.privilege_type = any(array['SELECT', 'INSERT']::text[])
               )
               or (
                 relation.relname = any(array[
                   'workforce_schedule_publication_item',
                   'workforce_schedule_audit'
                 ]::name[])
                 and privilege.privilege_type = 'INSERT'
               )
             )
           )
         )
       )
  ) then
    raise exception 'WORKFORCE_SCHEDULE_TABLE_ACL_POSTFLIGHT_FAILED';
  end if;

  -- No schedule column uses a separate ACL. Any entry is privilege drift,
  -- regardless of whether it belongs to runtime, portal_app or another role.
  if exists (
    select 1
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      join pg_attribute attribute on attribute.attrelid = relation.oid
       and attribute.attnum > 0 and not attribute.attisdropped
      cross join lateral aclexplode(
        case when cardinality(attribute.attacl) > 0
             then attribute.attacl else null::aclitem[] end
      ) privilege
     where namespace.nspname = 'public'
       and relation.relkind in ('r', 'p')
       and relation.relname like 'workforce\_schedule\_%' escape '\'
  ) then
    raise exception 'WORKFORCE_SCHEDULE_COLUMN_ACL_POSTFLIGHT_FAILED';
  end if;

  -- The V1 schema has no sequence consumer. If a schedule sequence appears,
  -- it must remain owner-only until a separately reviewed contract grants it.
  if exists (
    select 1
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
     where namespace.nspname = 'public'
       and relation.relkind = 'S'
       and relation.relname like 'workforce\_schedule\_%' escape '\'
       and (
         relation.relowner <> (select oid from pg_roles where rolname = 'workforce_schedule_owner')
         or exists (
           select 1
             from aclexplode(
               case
                 when relation.relacl is null then acldefault('s', relation.relowner)
                 when cardinality(relation.relacl) > 0 then relation.relacl
                 else null::aclitem[]
               end
             ) privilege
            where privilege.grantee <> relation.relowner
         )
       )
  ) then
    raise exception 'WORKFORCE_SCHEDULE_SEQUENCE_ACL_POSTFLIGHT_FAILED';
  end if;

  -- Exactly these six signatures may exist in the namespace. An unknown helper
  -- or overload is a separate executable surface and fails the migration.
  if (select count(*) <> 6
        from pg_proc function_row
        join pg_namespace namespace on namespace.oid = function_row.pronamespace
       where namespace.nspname = 'public'
         and function_row.proname like 'workforce\_schedule\_%' escape '\')
     or exists (
       select 1
         from pg_proc function_row
         join pg_namespace namespace on namespace.oid = function_row.pronamespace
        where namespace.nspname = 'public'
          and function_row.proname like 'workforce\_schedule\_%' escape '\'
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
    raise exception 'WORKFORCE_SCHEDULE_FUNCTION_ALLOWLIST_POSTFLIGHT_FAILED';
  end if;

  foreach function_signature in array array[
    'public.workforce_schedule_authorize_session(text,text)',
    'public.workforce_schedule_actor_is_active(text)',
    'public.workforce_schedule_read_active_workers(text)',
    'public.workforce_schedule_read_active_objects(text)',
    'public.workforce_schedule_lock_worker_sources(text,text[])',
    'public.workforce_schedule_lock_object_sources(text,text[])'
  ]
  loop
    select function_row.prosecdef as security_definer,
           function_row.proowner = (select oid from pg_roles where rolname = 'workforce_schedule_owner') as expected_owner,
           function_row.proconfig = array['search_path=pg_catalog']::text[] as fixed_search_path,
           function_row.prokind = 'f' and not function_row.proleakproof as safe_function_kind,
           function_row.prolang = (select oid from pg_language where lanname = 'sql') as expected_language,
           case
             when function_signature = any(array[
               'public.workforce_schedule_authorize_session(text,text)',
               'public.workforce_schedule_actor_is_active(text)',
               'public.workforce_schedule_read_active_workers(text)',
               'public.workforce_schedule_read_active_objects(text)'
             ]::text[]) then function_row.provolatile = 's'
             else function_row.provolatile = 'v'
           end as expected_volatility,
           case when function_signature = 'public.workforce_schedule_authorize_session(text,text)'
             then has_function_privilege('workforce_schedule_session', function_row.oid, 'EXECUTE')
             else has_function_privilege('workforce_schedule_app', function_row.oid, 'EXECUTE')
           end as execute_ready,
           case when function_signature = 'public.workforce_schedule_authorize_session(text,text)'
             then has_function_privilege('workforce_schedule_app', function_row.oid, 'EXECUTE')
             else has_function_privilege('workforce_schedule_session', function_row.oid, 'EXECUTE')
           end as unexpected_execute,
           pg_has_role('workforce_schedule_app', function_row.proowner, 'MEMBER')
             or pg_has_role('workforce_schedule_app', function_row.proowner, 'SET')
             or pg_has_role('workforce_schedule_session', function_row.proowner, 'MEMBER')
             or pg_has_role('workforce_schedule_session', function_row.proowner, 'SET') as runtime_owner_membership,
           case
             when function_signature = 'public.workforce_schedule_authorize_session(text,text)'
               then has_table_privilege(function_row.proowner, 'public.organizations', 'SELECT')
                and has_table_privilege(function_row.proowner, 'public.organization_member', 'SELECT')
                and has_table_privilege(function_row.proowner, 'public.organization_subscription', 'SELECT')
                and has_table_privilege(function_row.proowner, 'public.worker', 'SELECT')
             when function_signature = 'public.workforce_schedule_actor_is_active(text)'
               then has_table_privilege(function_row.proowner, 'public.organization_member', 'SELECT')
                and has_table_privilege(function_row.proowner, 'public.worker', 'SELECT')
             when function_signature = 'public.workforce_schedule_read_active_workers(text)'
               then has_table_privilege(function_row.proowner, 'public.worker', 'SELECT')
             when function_signature = 'public.workforce_schedule_read_active_objects(text)'
               then has_table_privilege(function_row.proowner, 'public.client', 'SELECT')
             when function_signature like '%lock_worker_sources%'
               then has_table_privilege(function_row.proowner, 'public.worker', 'SELECT')
                and has_table_privilege(function_row.proowner, 'public.worker', 'UPDATE')
             else has_table_privilege(function_row.proowner, 'public.client', 'SELECT')
                and has_table_privilege(function_row.proowner, 'public.client', 'UPDATE')
           end as owner_source_ready,
           exists (
             select 1
               from aclexplode(coalesce(function_row.proacl, acldefault('f', function_row.proowner))) privilege
              where privilege.grantee = 0 and privilege.privilege_type = 'EXECUTE'
           ) as public_execute,
           not exists (
             select 1
               from aclexplode(
                 case
                   when function_row.proacl is null then acldefault('f', function_row.proowner)
                   when cardinality(function_row.proacl) > 0 then function_row.proacl
                   else null::aclitem[]
                 end
               ) privilege
              where privilege.grantee not in (
                      function_row.proowner,
                      case when function_signature = 'public.workforce_schedule_authorize_session(text,text)'
                        then (select oid from pg_roles where rolname = 'workforce_schedule_session')
                        else (select oid from pg_roles where rolname = 'workforce_schedule_app')
                      end
                    )
                 or (
                   privilege.grantee = case when function_signature = 'public.workforce_schedule_authorize_session(text,text)'
                     then (select oid from pg_roles where rolname = 'workforce_schedule_session')
                     else (select oid from pg_roles where rolname = 'workforce_schedule_app')
                   end
                   and (privilege.privilege_type <> 'EXECUTE' or privilege.is_grantable)
                 )
           ) as exact_acl
      into function_state
      from pg_proc function_row
     where function_row.oid = to_regprocedure(function_signature);
    if not found
       or function_state.security_definer is not true
       or function_state.expected_owner is not true
       or function_state.fixed_search_path is not true
       or function_state.safe_function_kind is not true
       or function_state.expected_language is not true
       or function_state.expected_volatility is not true
       or function_state.execute_ready is not true
       or function_state.unexpected_execute is true
       or function_state.runtime_owner_membership is true
       or function_state.owner_source_ready is not true
       or function_state.public_execute is true
       or function_state.exact_acl is not true then
      raise exception 'WORKFORCE_SCHEDULE_FUNCTION_POSTFLIGHT_FAILED: %', function_signature;
    end if;
  end loop;

  -- Every schedule function is owner-controlled. The authorization lookup is
  -- executable only by the session login; every other helper is executable
  -- only after SET LOCAL ROLE workforce_schedule_app.
  if exists (
    select 1
      from pg_proc function_row
      join pg_namespace namespace on namespace.oid = function_row.pronamespace
     where namespace.nspname = 'public'
       and function_row.proname like 'workforce\_schedule\_%' escape '\'
       and (
         function_row.proowner <> (select oid from pg_roles where rolname = 'workforce_schedule_owner')
          or exists (
            select 1
             from aclexplode(
               case
                 when function_row.proacl is null then acldefault('f', function_row.proowner)
                 when cardinality(function_row.proacl) > 0 then function_row.proacl
                 else null::aclitem[]
               end
             ) privilege
             where privilege.grantee not in (
                     function_row.proowner,
                     case when function_row.proname = 'workforce_schedule_authorize_session'
                       then (select oid from pg_roles where rolname = 'workforce_schedule_session')
                       else (select oid from pg_roles where rolname = 'workforce_schedule_app')
                     end
                   )
                or (
                  privilege.grantee = case when function_row.proname = 'workforce_schedule_authorize_session'
                    then (select oid from pg_roles where rolname = 'workforce_schedule_session')
                    else (select oid from pg_roles where rolname = 'workforce_schedule_app')
                  end
                  and (privilege.privilege_type <> 'EXECUTE' or privilege.is_grantable)
                )
         )
       )
  ) then
    raise exception 'WORKFORCE_SCHEDULE_FUNCTION_ACL_POSTFLIGHT_FAILED';
  end if;

  if exists (
    with recursive accessible_roles(role_oid) as (
      select oid from pg_roles where rolname = 'workforce_schedule_app'
      union
      select membership.roleid from pg_auth_members membership
      join accessible_roles child on child.role_oid = membership.member
    ), relation_acl as (
      select privilege.grantee, privilege.is_grantable
        from pg_class relation
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        cross join lateral aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) privilege
       where namespace.nspname = 'public'
         and relation.relname like 'workforce_schedule_%'
      union all
      select privilege.grantee, privilege.is_grantable
        from pg_class relation
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        join pg_attribute attribute on attribute.attrelid = relation.oid
         and attribute.attnum > 0 and not attribute.attisdropped
        cross join lateral aclexplode(attribute.attacl) privilege
       where namespace.nspname = 'public'
         and relation.relname like 'workforce_schedule_%'
    )
    select 1
      from relation_acl privilege
     where privilege.is_grantable
       and (privilege.grantee = 0 or privilege.grantee in (select role_oid from accessible_roles))
  ) then
    raise exception 'Runtime role workforce_schedule_app must not hold grant options on workforce schedule tables.';
  end if;

  if exists (
    with relation_acl as (
      select privilege.grantee
        from pg_class relation
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        cross join lateral aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) privilege
       where namespace.nspname = 'public'
         and relation.relname like 'workforce_schedule_%'
      union all
      select privilege.grantee
        from pg_class relation
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        join pg_attribute attribute on attribute.attrelid = relation.oid
         and attribute.attnum > 0 and not attribute.attisdropped
        cross join lateral aclexplode(attribute.attacl) privilege
       where namespace.nspname = 'public'
         and relation.relname like 'workforce_schedule_%'
    )
    select 1 from relation_acl privilege
     where privilege.grantee = 0
        or privilege.grantee = (select oid from pg_roles where rolname = 'workforce_schedule_session')
  ) then
    raise exception 'PUBLIC or workforce_schedule_session received a direct workforce schedule table privilege.';
  end if;
end
$$;

commit;

-- This migration intentionally creates no outbox and no worker-app delivery path.
-- Required read-only preflight before a separately approved execution:
-- select rolname, rolbypassrls from pg_roles where rolname = 'workforce_schedule_session';
-- select table_name, privilege_type from information_schema.role_table_grants
--  where grantee = 'workforce_schedule_session' and table_name like 'workforce_schedule_%';
