-- Additive, column-scoped read bridge for profitability source data.
-- OPERATOR ENTRYPOINT: ../admin/20260927_profitability_source_read_bridge_apply.psql
-- Direct execution is forbidden. The guarded wrapper owns the transaction and
-- enters this file as the exact Data Connect source owner.

do $profitability_source_read_guard$
declare
  expected_executor text := nullif(
    current_setting('cleanzi.profitability_source_read_expected_executor', true), ''
  );
  expected_source_owner constant text :=
    'firebaseowner_iclean-room-database_public';
  configured_source_owner text := nullif(
    current_setting('cleanzi.profitability_source_read_source_owner', true), ''
  );
  expected_runtime_role constant text := 'profitability_runtime';
  configured_runtime_role text := nullif(
    current_setting('cleanzi.profitability_source_read_runtime_role', true), ''
  );
  backup_reference text := nullif(
    current_setting('cleanzi.profitability_source_read_backup_reference', true), ''
  );
  runtime_role_oid oid;
  source_owner_role_oid oid := (
    select oid from pg_roles
     where rolname = 'firebaseowner_iclean-room-database_public'
  );
  relation_name text;
  expected_column_count integer;
  runtime_table_acl_count integer;
  runtime_column_acl_count integer;
  runtime_expected_acl_count integer;
  runtime_excess_acl_count integer;
  runtime_effective_table_privilege_count integer;
  runtime_effective_expected_select_count integer;
  runtime_effective_excess_column_privilege_count integer;
  runtime_indirect_acl_count integer;
  non_runtime_acl_fingerprint text;
begin
  if current_setting('cleanzi.profitability_source_read_entrypoint', true)
       is distinct from 'GUARDED_PROFITABILITY_SOURCE_READ_BRIDGE_20260927' then
    raise exception 'PROFITABILITY_SOURCE_READ_GUARDED_ENTRYPOINT_REQUIRED';
  end if;

  if current_database() <> 'iclean-room-database' then
    raise exception 'PROFITABILITY_SOURCE_READ_DATABASE_MISMATCH';
  end if;

  if expected_executor is null
     or session_user <> expected_executor
     or configured_source_owner <> expected_source_owner
     or current_user <> expected_source_owner then
    raise exception 'PROFITABILITY_SOURCE_READ_EXECUTION_IDENTITY_MISMATCH';
  end if;

  if configured_runtime_role <> expected_runtime_role then
    raise exception 'PROFITABILITY_SOURCE_READ_RUNTIME_ROLE_NAME_MISMATCH';
  end if;

  if current_setting('server_version_num')::integer not between 170000 and 179999 then
    raise exception 'PROFITABILITY_SOURCE_READ_POSTGRESQL_17_REQUIRED';
  end if;

  if pg_is_in_recovery() then
    raise exception 'PROFITABILITY_SOURCE_READ_PRIMARY_DATABASE_REQUIRED';
  end if;

  if current_setting('transaction_read_only') <> 'off'
     or current_setting('default_transaction_read_only') <> 'off' then
    raise exception 'PROFITABILITY_SOURCE_READ_READ_WRITE_SESSION_REQUIRED';
  end if;

  if backup_reference is null or backup_reference !~ '^[0-9]{13}$' then
    raise exception 'PROFITABILITY_SOURCE_READ_BACKUP_REFERENCE_INVALID';
  end if;

  select role_row.oid
    into runtime_role_oid
    from pg_roles role_row
   where role_row.rolname = expected_runtime_role
     and not role_row.rolcanlogin
     and not role_row.rolinherit
     and not role_row.rolsuper
     and not role_row.rolbypassrls
     and not role_row.rolcreaterole
     and not role_row.rolcreatedb
     and not role_row.rolreplication
     and role_row.rolconnlimit = -1
     and role_row.rolvaliduntil is null
     and role_row.rolconfig is null;

  if runtime_role_oid is null then
    raise exception 'PROFITABILITY_SOURCE_READ_RUNTIME_ROLE_INVALID';
  end if;

  foreach relation_name in array array[
    'organization_member',
    'event',
    'zone'
  ] loop
    if not exists (
      select 1
        from pg_class relation_row
        join pg_namespace namespace_row
          on namespace_row.oid = relation_row.relnamespace
        join pg_roles owner_row on owner_row.oid = relation_row.relowner
       where namespace_row.nspname = 'public'
         and relation_row.relname = relation_name
         and relation_row.relkind in ('r', 'p')
         and relation_row.relpersistence = 'p'
         and owner_row.rolname = expected_source_owner
    ) then
      raise exception 'PROFITABILITY_SOURCE_READ_SOURCE_OWNER_MISMATCH:%',
        relation_name;
    end if;
  end loop;

  with expected(table_name, column_name) as (
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
  )
  select count(*)::integer
    into expected_column_count
    from expected
    join pg_class relation_row on relation_row.relname = expected.table_name
    join pg_namespace namespace_row
      on namespace_row.oid = relation_row.relnamespace
     and namespace_row.nspname = 'public'
    join pg_attribute attribute_row
      on attribute_row.attrelid = relation_row.oid
     and attribute_row.attname = expected.column_name
     and attribute_row.attnum > 0
     and not attribute_row.attisdropped;

  if expected_column_count <> 15 then
    raise exception 'PROFITABILITY_SOURCE_READ_REQUIRED_COLUMN_MISSING:%/15',
      expected_column_count;
  end if;

  select count(*)::integer
    into runtime_table_acl_count
    from pg_class relation_row
    join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
    cross join lateral aclexplode(
      coalesce(relation_row.relacl, acldefault('r', relation_row.relowner))
    ) privilege_row
   where namespace_row.nspname = 'public'
     and relation_row.relname = any(array['organization_member', 'event', 'zone'])
     and privilege_row.grantee = runtime_role_oid;

  with expected(table_name, column_name) as (
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
  ), runtime_column_acl as (
    select relation_row.relname as table_name,
           attribute_row.attname as column_name,
           privilege_row.grantor,
           privilege_row.privilege_type,
           privilege_row.is_grantable
      from pg_class relation_row
      join pg_namespace namespace_row
        on namespace_row.oid = relation_row.relnamespace
      join pg_attribute attribute_row
        on attribute_row.attrelid = relation_row.oid
       and attribute_row.attnum > 0
       and not attribute_row.attisdropped
      cross join lateral aclexplode(attribute_row.attacl) privilege_row
     where namespace_row.nspname = 'public'
       and relation_row.relname = any(array['organization_member', 'event', 'zone'])
       and privilege_row.grantee = runtime_role_oid
  )
  select count(*)::integer,
         count(*) filter (
           where expected.table_name is not null
             and runtime_column_acl.privilege_type = 'SELECT'
             and runtime_column_acl.grantor = source_owner_role_oid
             and not runtime_column_acl.is_grantable
         )::integer,
         count(*) filter (
           where expected.table_name is null
              or runtime_column_acl.privilege_type <> 'SELECT'
              or runtime_column_acl.grantor <> source_owner_role_oid
              or runtime_column_acl.is_grantable
         )::integer
    into runtime_column_acl_count,
         runtime_expected_acl_count,
         runtime_excess_acl_count
    from runtime_column_acl
    left join expected using (table_name, column_name);

  if runtime_table_acl_count <> 0 or runtime_excess_acl_count <> 0 then
    raise exception 'PROFITABILITY_SOURCE_READ_RUNTIME_ACL_EXCESS';
  end if;

  if runtime_column_acl_count not in (0, 15)
     or runtime_expected_acl_count <> runtime_column_acl_count then
    raise exception 'PROFITABILITY_SOURCE_READ_PARTIAL_STATE:%/15',
      runtime_column_acl_count;
  end if;

  select count(*)::integer
    into runtime_effective_table_privilege_count
    from pg_class relation_row
    join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
    cross join (values
      ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
      ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
    ) checked_privilege(privilege_name)
   where namespace_row.nspname = 'public'
     and relation_row.relname = any(array['organization_member', 'event', 'zone'])
     and has_table_privilege(
       expected_runtime_role,
       relation_row.oid,
       checked_privilege.privilege_name
     );

  with expected(table_name, column_name) as (
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
  ), effective_column_privileges as (
    select source_columns.table_name,
           source_columns.column_name,
           expected.table_name is not null as is_expected,
           has_column_privilege(
             expected_runtime_role, source_columns.table_oid,
             source_columns.column_name, 'SELECT'
           ) as can_select,
           has_column_privilege(
             expected_runtime_role, source_columns.table_oid,
             source_columns.column_name, 'SELECT WITH GRANT OPTION'
           ) as can_grant_select,
           has_column_privilege(
             expected_runtime_role, source_columns.table_oid,
             source_columns.column_name, 'INSERT'
           ) as can_insert,
           has_column_privilege(
             expected_runtime_role, source_columns.table_oid,
             source_columns.column_name, 'UPDATE'
           ) as can_update,
           has_column_privilege(
             expected_runtime_role, source_columns.table_oid,
             source_columns.column_name, 'REFERENCES'
           ) as can_reference
      from source_columns
      left join expected using (table_name, column_name)
  )
  select count(*) filter (
           where is_expected and can_select
         )::integer,
         count(*) filter (
           where (not is_expected and can_select)
              or can_grant_select
              or can_insert
              or can_update
              or can_reference
         )::integer
    into runtime_effective_expected_select_count,
         runtime_effective_excess_column_privilege_count
    from effective_column_privileges;

  select count(*)::integer
    into runtime_indirect_acl_count
    from (
      select privilege_row.grantee
        from pg_class relation_row
        join pg_namespace namespace_row
          on namespace_row.oid = relation_row.relnamespace
        cross join lateral aclexplode(
          coalesce(relation_row.relacl, acldefault('r', relation_row.relowner))
        ) privilege_row
       where namespace_row.nspname = 'public'
         and relation_row.relname = any(array['organization_member', 'event', 'zone'])
         and privilege_row.grantee <> runtime_role_oid
      union all
      select privilege_row.grantee
        from pg_class relation_row
        join pg_namespace namespace_row
          on namespace_row.oid = relation_row.relnamespace
        join pg_attribute attribute_row
          on attribute_row.attrelid = relation_row.oid
         and attribute_row.attnum > 0
         and not attribute_row.attisdropped
        cross join lateral aclexplode(attribute_row.attacl) privilege_row
       where namespace_row.nspname = 'public'
         and relation_row.relname = any(array['organization_member', 'event', 'zone'])
         and privilege_row.grantee <> runtime_role_oid
    ) indirect_acl
   where case
     when indirect_acl.grantee = 0 then true
     else pg_has_role(expected_runtime_role, indirect_acl.grantee, 'USAGE')
   end;

  if runtime_effective_table_privilege_count <> 0
     or runtime_effective_excess_column_privilege_count <> 0
     or runtime_indirect_acl_count <> 0 then
    raise exception 'PROFITABILITY_SOURCE_READ_EFFECTIVE_ACL_EXCESS';
  end if;

  if runtime_effective_expected_select_count <> runtime_column_acl_count then
    raise exception 'PROFITABILITY_SOURCE_READ_EFFECTIVE_ACL_STATE_MISMATCH:%/%',
      runtime_effective_expected_select_count, runtime_column_acl_count;
  end if;

  select md5(coalesce(string_agg(
           concat_ws('|', acl_row.acl_kind, acl_row.table_name,
             acl_row.column_name, acl_row.grantor::text, acl_row.grantee::text,
             acl_row.privilege_type, acl_row.is_grantable::text),
           E'\n' order by acl_row.acl_kind, acl_row.table_name,
             acl_row.column_name, acl_row.grantor, acl_row.grantee,
             acl_row.privilege_type, acl_row.is_grantable
         ), 'EMPTY'))
    into non_runtime_acl_fingerprint
    from (
      select 'TABLE'::text as acl_kind, relation_row.relname as table_name,
             ''::text as column_name, privilege_row.grantor,
             privilege_row.grantee, privilege_row.privilege_type,
             privilege_row.is_grantable
        from pg_class relation_row
        join pg_namespace namespace_row
          on namespace_row.oid = relation_row.relnamespace
        cross join lateral aclexplode(
          coalesce(relation_row.relacl, acldefault('r', relation_row.relowner))
        ) privilege_row
       where namespace_row.nspname = 'public'
         and relation_row.relname = any(array['organization_member', 'event', 'zone'])
         and privilege_row.grantee <> runtime_role_oid
      union all
      select 'COLUMN', relation_row.relname, attribute_row.attname,
             privilege_row.grantor, privilege_row.grantee,
             privilege_row.privilege_type, privilege_row.is_grantable
        from pg_class relation_row
        join pg_namespace namespace_row
          on namespace_row.oid = relation_row.relnamespace
        join pg_attribute attribute_row
          on attribute_row.attrelid = relation_row.oid
         and attribute_row.attnum > 0
         and not attribute_row.attisdropped
        cross join lateral aclexplode(attribute_row.attacl) privilege_row
       where namespace_row.nspname = 'public'
         and relation_row.relname = any(array['organization_member', 'event', 'zone'])
         and privilege_row.grantee <> runtime_role_oid
    ) acl_row;

  perform set_config(
    'cleanzi.profitability_source_read_non_runtime_acl_fingerprint',
    non_runtime_acl_fingerprint,
    true
  );

  -- One shot: every retry must return through the guarded wrapper.
  perform set_config('cleanzi.profitability_source_read_entrypoint', '', true);
end
$profitability_source_read_guard$;

grant select (org_id, uid, role, status)
  on table public.organization_member to profitability_runtime;

grant select (
  org_id, event_id, worker_login, start_at, end_at, duration_sec, task_id, zone_id
)
  on table public.event to profitability_runtime;

grant select (org_id, id, client_id)
  on table public.zone to profitability_runtime;

do $profitability_source_read_postflight$
declare
  runtime_role_oid oid := (
    select oid from pg_roles where rolname = 'profitability_runtime'
  );
  source_owner_role_oid oid := (
    select oid from pg_roles
     where rolname = 'firebaseowner_iclean-room-database_public'
  );
  runtime_table_acl_count integer;
  runtime_column_acl_count integer;
  runtime_expected_acl_count integer;
  runtime_excess_acl_count integer;
  runtime_effective_table_privilege_count integer;
  runtime_effective_expected_select_count integer;
  runtime_effective_excess_column_privilege_count integer;
  runtime_indirect_acl_count integer;
  actual_non_runtime_acl_fingerprint text;
begin
  if current_user <> 'firebaseowner_iclean-room-database_public' then
    raise exception 'PROFITABILITY_SOURCE_READ_SOURCE_OWNER_REQUIRED';
  end if;

  select count(*)::integer
    into runtime_table_acl_count
    from pg_class relation_row
    join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
    cross join lateral aclexplode(
      coalesce(relation_row.relacl, acldefault('r', relation_row.relowner))
    ) privilege_row
   where namespace_row.nspname = 'public'
     and relation_row.relname = any(array['organization_member', 'event', 'zone'])
     and privilege_row.grantee = runtime_role_oid;

  with expected(table_name, column_name) as (
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
  ), runtime_column_acl as (
    select relation_row.relname as table_name,
           attribute_row.attname as column_name,
           privilege_row.grantor,
           privilege_row.privilege_type,
           privilege_row.is_grantable
      from pg_class relation_row
      join pg_namespace namespace_row
        on namespace_row.oid = relation_row.relnamespace
      join pg_attribute attribute_row
        on attribute_row.attrelid = relation_row.oid
       and attribute_row.attnum > 0
       and not attribute_row.attisdropped
      cross join lateral aclexplode(attribute_row.attacl) privilege_row
     where namespace_row.nspname = 'public'
       and relation_row.relname = any(array['organization_member', 'event', 'zone'])
       and privilege_row.grantee = runtime_role_oid
  )
  select count(*)::integer,
         count(*) filter (
           where expected.table_name is not null
             and runtime_column_acl.privilege_type = 'SELECT'
             and runtime_column_acl.grantor = source_owner_role_oid
             and not runtime_column_acl.is_grantable
         )::integer,
         count(*) filter (
           where expected.table_name is null
              or runtime_column_acl.privilege_type <> 'SELECT'
              or runtime_column_acl.grantor <> source_owner_role_oid
              or runtime_column_acl.is_grantable
         )::integer
    into runtime_column_acl_count,
         runtime_expected_acl_count,
         runtime_excess_acl_count
    from runtime_column_acl
    left join expected using (table_name, column_name);

  if runtime_table_acl_count <> 0
     or runtime_column_acl_count <> 15
     or runtime_expected_acl_count <> 15
     or runtime_excess_acl_count <> 0 then
    raise exception 'PROFITABILITY_SOURCE_READ_RUNTIME_ACL_POSTFLIGHT_FAILED';
  end if;

  select count(*)::integer
    into runtime_effective_table_privilege_count
    from pg_class relation_row
    join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
    cross join (values
      ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
      ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
    ) checked_privilege(privilege_name)
   where namespace_row.nspname = 'public'
     and relation_row.relname = any(array['organization_member', 'event', 'zone'])
     and has_table_privilege(
       'profitability_runtime',
       relation_row.oid,
       checked_privilege.privilege_name
     );

  with expected(table_name, column_name) as (
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
  ), effective_column_privileges as (
    select source_columns.table_name,
           source_columns.column_name,
           expected.table_name is not null as is_expected,
           has_column_privilege(
             'profitability_runtime', source_columns.table_oid,
             source_columns.column_name, 'SELECT'
           ) as can_select,
           has_column_privilege(
             'profitability_runtime', source_columns.table_oid,
             source_columns.column_name, 'SELECT WITH GRANT OPTION'
           ) as can_grant_select,
           has_column_privilege(
             'profitability_runtime', source_columns.table_oid,
             source_columns.column_name, 'INSERT'
           ) as can_insert,
           has_column_privilege(
             'profitability_runtime', source_columns.table_oid,
             source_columns.column_name, 'UPDATE'
           ) as can_update,
           has_column_privilege(
             'profitability_runtime', source_columns.table_oid,
             source_columns.column_name, 'REFERENCES'
           ) as can_reference
      from source_columns
      left join expected using (table_name, column_name)
  )
  select count(*) filter (
           where is_expected and can_select
         )::integer,
         count(*) filter (
           where (not is_expected and can_select)
              or can_grant_select
              or can_insert
              or can_update
              or can_reference
         )::integer
    into runtime_effective_expected_select_count,
         runtime_effective_excess_column_privilege_count
    from effective_column_privileges;

  select count(*)::integer
    into runtime_indirect_acl_count
    from (
      select privilege_row.grantee
        from pg_class relation_row
        join pg_namespace namespace_row
          on namespace_row.oid = relation_row.relnamespace
        cross join lateral aclexplode(
          coalesce(relation_row.relacl, acldefault('r', relation_row.relowner))
        ) privilege_row
       where namespace_row.nspname = 'public'
         and relation_row.relname = any(array['organization_member', 'event', 'zone'])
         and privilege_row.grantee <> runtime_role_oid
      union all
      select privilege_row.grantee
        from pg_class relation_row
        join pg_namespace namespace_row
          on namespace_row.oid = relation_row.relnamespace
        join pg_attribute attribute_row
          on attribute_row.attrelid = relation_row.oid
         and attribute_row.attnum > 0
         and not attribute_row.attisdropped
        cross join lateral aclexplode(attribute_row.attacl) privilege_row
       where namespace_row.nspname = 'public'
         and relation_row.relname = any(array['organization_member', 'event', 'zone'])
         and privilege_row.grantee <> runtime_role_oid
    ) indirect_acl
   where case
     when indirect_acl.grantee = 0 then true
     else pg_has_role('profitability_runtime', indirect_acl.grantee, 'USAGE')
   end;

  if runtime_effective_table_privilege_count <> 0
     or runtime_effective_expected_select_count <> 15
     or runtime_effective_excess_column_privilege_count <> 0
     or runtime_indirect_acl_count <> 0 then
    raise exception 'PROFITABILITY_SOURCE_READ_EFFECTIVE_ACL_POSTFLIGHT_FAILED';
  end if;

  select md5(coalesce(string_agg(
           concat_ws('|', acl_row.acl_kind, acl_row.table_name,
             acl_row.column_name, acl_row.grantor::text, acl_row.grantee::text,
             acl_row.privilege_type, acl_row.is_grantable::text),
           E'\n' order by acl_row.acl_kind, acl_row.table_name,
             acl_row.column_name, acl_row.grantor, acl_row.grantee,
             acl_row.privilege_type, acl_row.is_grantable
         ), 'EMPTY'))
    into actual_non_runtime_acl_fingerprint
    from (
      select 'TABLE'::text as acl_kind, relation_row.relname as table_name,
             ''::text as column_name, privilege_row.grantor,
             privilege_row.grantee, privilege_row.privilege_type,
             privilege_row.is_grantable
        from pg_class relation_row
        join pg_namespace namespace_row
          on namespace_row.oid = relation_row.relnamespace
        cross join lateral aclexplode(
          coalesce(relation_row.relacl, acldefault('r', relation_row.relowner))
        ) privilege_row
       where namespace_row.nspname = 'public'
         and relation_row.relname = any(array['organization_member', 'event', 'zone'])
         and privilege_row.grantee <> runtime_role_oid
      union all
      select 'COLUMN', relation_row.relname, attribute_row.attname,
             privilege_row.grantor, privilege_row.grantee,
             privilege_row.privilege_type, privilege_row.is_grantable
        from pg_class relation_row
        join pg_namespace namespace_row
          on namespace_row.oid = relation_row.relnamespace
        join pg_attribute attribute_row
          on attribute_row.attrelid = relation_row.oid
         and attribute_row.attnum > 0
         and not attribute_row.attisdropped
        cross join lateral aclexplode(attribute_row.attacl) privilege_row
       where namespace_row.nspname = 'public'
         and relation_row.relname = any(array['organization_member', 'event', 'zone'])
         and privilege_row.grantee <> runtime_role_oid
    ) acl_row;

  if actual_non_runtime_acl_fingerprint is distinct from current_setting(
       'cleanzi.profitability_source_read_non_runtime_acl_fingerprint', true
     ) then
    raise exception 'PROFITABILITY_SOURCE_READ_NON_RUNTIME_ACL_CHANGED';
  end if;
end
$profitability_source_read_postflight$;
