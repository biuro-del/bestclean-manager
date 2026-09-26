-- Review-only, additive foundation for server-side profitability access profiles.
-- OPERATOR ENTRYPOINT: ../admin/20260925_profitability_access_profile_v2_apply.psql
-- Direct execution of this raw SQL is forbidden. Apply only through the
-- separately approved guarded runner after a production backup and preflight.
--
-- This migration intentionally seeds no users, organizations or access rows.
-- Absence of an active READ/MANAGE profile must be interpreted by the backend
-- as DENY. For object assignments, a matching DENY takes precedence over ALLOW.

do $profitability_access_v2_entrypoint_guard$
declare
  runtime_role_name text := nullif(
    current_setting('cleanzi.profitability_access_v2_runtime_role', true),
    ''
  );
  backup_reference text := nullif(
    current_setting('cleanzi.profitability_access_v2_backup_reference', true),
    ''
  );
begin
  if current_setting('cleanzi.profitability_access_v2_entrypoint', true)
       is distinct from 'GUARDED_PROFITABILITY_ACCESS_PROFILE_V2_20260925' then
    raise exception 'PROFITABILITY_ACCESS_V2_GUARDED_ENTRYPOINT_REQUIRED';
  end if;

  if current_database() <> 'iclean-room-database' then
    raise exception 'PROFITABILITY_ACCESS_V2_DATABASE_MISMATCH';
  end if;

  if session_user <> 'migration_runner' or current_user <> session_user then
    raise exception 'PROFITABILITY_ACCESS_V2_MIGRATION_SESSION_MISMATCH';
  end if;

  if current_setting('server_version_num')::integer not between 170000 and 179999 then
    raise exception 'PROFITABILITY_ACCESS_V2_POSTGRESQL_17_REQUIRED';
  end if;

  if pg_is_in_recovery() then
    raise exception 'PROFITABILITY_ACCESS_V2_PRIMARY_DATABASE_REQUIRED';
  end if;

  if current_setting('transaction_read_only') <> 'off'
     or current_setting('default_transaction_read_only') <> 'off' then
    raise exception 'PROFITABILITY_ACCESS_V2_READ_WRITE_SESSION_REQUIRED';
  end if;

  if backup_reference is null
     or backup_reference !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{5,127}$' then
    raise exception 'PROFITABILITY_ACCESS_V2_BACKUP_REFERENCE_INVALID';
  end if;

  if runtime_role_name is null
     or runtime_role_name in ('PUBLIC', 'public', 'migration_runner')
     or not exists (
       select 1
         from pg_roles runtime_role
        where runtime_role.rolname = runtime_role_name
          and not runtime_role.rolsuper
          and not runtime_role.rolbypassrls
          and not runtime_role.rolcreaterole
          and not runtime_role.rolcreatedb
          and not runtime_role.rolreplication
     ) then
    raise exception 'PROFITABILITY_ACCESS_V2_RUNTIME_ROLE_INVALID';
  end if;

  if has_schema_privilege(runtime_role_name, 'public', 'CREATE') then
    raise exception 'PROFITABILITY_ACCESS_V2_RUNTIME_SCHEMA_CREATE_EXCESS';
  end if;

  -- One shot: a retry must return through the wrapper and repeat every gate.
  perform set_config('cleanzi.profitability_access_v2_entrypoint', '', false);
end
$profitability_access_v2_entrypoint_guard$;

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

select pg_advisory_xact_lock(
  hashtextextended('cleanzi:profitability-access-profile:v2', 0)
);

-- Fail closed when the tenant/member/object foundations are not the reviewed
-- profitability schema. In particular, do not create parallel identity or
-- object tables and do not silently drop the tenant part of a foreign key.
do $$
declare
  required_relation text;
begin
  foreach required_relation in array array[
    'organizations',
    'organization_member',
    'service_object'
  ] loop
    if to_regclass(format('public.%I', required_relation)) is null then
      raise exception 'PROFITABILITY_ACCESS_V2_REQUIRED_RELATION_MISSING:%', required_relation;
    end if;
  end loop;

  if not exists (
    select 1
      from pg_constraint constraint_row
     where constraint_row.conrelid = 'public.organization_member'::regclass
       and constraint_row.contype in ('p', 'u')
       and (
         select array_agg(attribute_row.attname order by key_column.ordinality)
           from unnest(constraint_row.conkey) with ordinality as key_column(attribute_number, ordinality)
           join pg_attribute attribute_row
             on attribute_row.attrelid = constraint_row.conrelid
            and attribute_row.attnum = key_column.attribute_number
       ) = array['org_id', 'uid']::name[]
  ) then
    raise exception 'PROFITABILITY_ACCESS_V2_MEMBER_TENANT_KEY_MISSING';
  end if;

  if not exists (
    select 1
      from pg_constraint constraint_row
     where constraint_row.conrelid = 'public.service_object'::regclass
       and constraint_row.contype in ('p', 'u')
       and (
         select array_agg(attribute_row.attname order by key_column.ordinality)
           from unnest(constraint_row.conkey) with ordinality as key_column(attribute_number, ordinality)
           join pg_attribute attribute_row
             on attribute_row.attrelid = constraint_row.conrelid
            and attribute_row.attnum = key_column.attribute_number
       ) = array['org_id', 'object_id']::name[]
  ) then
    raise exception 'PROFITABILITY_ACCESS_V2_OBJECT_TENANT_KEY_MISSING';
  end if;

  if not exists (select 1 from pg_extension where extname = 'btree_gist') then
    raise exception 'PROFITABILITY_ACCESS_V2_BTREE_GIST_REQUIRED';
  end if;
end
$$;

-- Persistent deny-side marker. Once an organization is provisioned here, the
-- application must never fall back to legacy finance grants when a flag is
-- disabled or misconfigured. Activation is a separate, explicitly approved
-- transaction performed only after every organization access profile exists.
create table if not exists public.profitability_access_enforcement (
  org_id varchar(64) not null,
  schema_version varchar(8) not null,
  enforced_at timestamptz not null default now(),
  enforced_by_uid varchar(128) not null,
  reason text not null,
  primary key (org_id),
  constraint profitability_access_enforcement_org_fk
    foreign key (org_id)
    references public.organizations (org_id),
  constraint profitability_access_enforcement_version_check
    check (schema_version = 'v2'),
  constraint profitability_access_enforcement_reason_check
    check (nullif(btrim(reason), '') is not null)
);

create table if not exists public.organization_access_profile (
  org_id varchar(64) not null,
  profile_id varchar(64) not null,
  uid varchar(128) not null,
  operational_profile varchar(32) not null default 'NONE',
  object_scope varchar(24) not null default 'NONE',
  worker_scope varchar(24) not null default 'NONE',
  finance_profile varchar(32) not null default 'NONE',
  access_mode varchar(8) not null default 'NONE',
  can_edit_operational_costs boolean not null default false,
  can_edit_contract_terms boolean not null default false,
  can_edit_profitability_targets boolean not null default false,
  can_view_worker_rates boolean not null default false,
  can_edit_worker_rates boolean not null default false,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  created_by_uid varchar(128) not null,
  updated_at timestamptz not null default now(),
  updated_by_uid varchar(128) not null,
  revoked_at timestamptz,
  revoked_by_uid varchar(128),
  revocation_reason text,
  primary key (org_id, profile_id),
  constraint organization_access_profile_member_fk
    foreign key (org_id, uid)
    references public.organization_member (org_id, uid),
  constraint organization_access_profile_operational_check
    check (operational_profile in (
      'NONE', 'OWNER', 'OPERATIONS_ADMIN', 'ADMIN', 'COORDINATOR'
    )),
  constraint organization_access_profile_object_scope_check
    check (object_scope in ('NONE', 'ASSIGNED', 'ALL')),
  constraint organization_access_profile_worker_scope_check
    check (worker_scope in ('NONE', 'OBJECT_ASSIGNED', 'ALL')),
  constraint organization_access_profile_finance_check
    check (finance_profile in ('NONE', 'COST_CONTROL', 'OWNER_FULL')),
  constraint organization_access_profile_access_mode_check
    check (access_mode in ('NONE', 'READ', 'MANAGE')),
  constraint organization_access_profile_validity_check
    check (valid_to is null or valid_to > valid_from),
  constraint organization_access_profile_revocation_check
    check (
      (revoked_at is null and revoked_by_uid is null and revocation_reason is null)
      or (
        revoked_at is not null
        and revoked_at >= valid_from
        and revoked_by_uid is not null
        and nullif(btrim(revocation_reason), '') is not null
      )
    ),
  constraint organization_access_profile_none_is_empty_check
    check (
      access_mode <> 'NONE'
      or (
        operational_profile = 'NONE'
        and object_scope = 'NONE'
        and worker_scope = 'NONE'
        and finance_profile = 'NONE'
        and can_edit_operational_costs is false
        and can_edit_contract_terms is false
        and can_edit_profitability_targets is false
        and can_view_worker_rates is false
        and can_edit_worker_rates is false
      )
    ),
  constraint organization_access_profile_finance_capabilities_check
    check (
      (
        finance_profile = 'NONE'
        and can_edit_operational_costs is false
        and can_edit_contract_terms is false
        and can_edit_profitability_targets is false
        and can_view_worker_rates is false
        and can_edit_worker_rates is false
      )
      or (
        finance_profile = 'COST_CONTROL'
        and can_edit_contract_terms is false
        and can_edit_profitability_targets is false
        and can_view_worker_rates is false
        and can_edit_worker_rates is false
      )
      or finance_profile = 'OWNER_FULL'
    ),
  constraint organization_access_profile_worker_rate_edit_check
    check (can_edit_worker_rates is false or can_view_worker_rates is true)
);

create unique index if not exists organization_access_profile_active_uid_idx
  on public.organization_access_profile (org_id, uid)
  where revoked_at is null;

create index if not exists organization_access_profile_lookup_idx
  on public.organization_access_profile
  (org_id, uid, access_mode, valid_from, valid_to)
  where revoked_at is null;

create table if not exists public.service_object_assignment (
  org_id varchar(64) not null,
  assignment_id varchar(64) not null,
  object_id varchar(64) not null,
  uid varchar(128) not null,
  assignment_role varchar(32) not null,
  access_mode varchar(8) not null default 'DENY',
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  created_by_uid varchar(128) not null,
  updated_at timestamptz not null default now(),
  updated_by_uid varchar(128) not null,
  revoked_at timestamptz,
  revoked_by_uid varchar(128),
  revocation_reason text,
  primary key (org_id, assignment_id),
  constraint service_object_assignment_object_fk
    foreign key (org_id, object_id)
    references public.service_object (org_id, object_id),
  constraint service_object_assignment_member_fk
    foreign key (org_id, uid)
    references public.organization_member (org_id, uid),
  constraint service_object_assignment_role_check
    check (assignment_role in ('COORDINATOR', 'OPERATIONS_ADMIN', 'SUPPORT')),
  constraint service_object_assignment_access_mode_check
    check (access_mode in ('ALLOW', 'DENY')),
  constraint service_object_assignment_validity_check
    check (valid_to is null or valid_to > valid_from),
  constraint service_object_assignment_revocation_check
    check (
      (revoked_at is null and revoked_by_uid is null and revocation_reason is null)
      or (
        revoked_at is not null
        and revoked_at >= valid_from
        and revoked_by_uid is not null
        and nullif(btrim(revocation_reason), '') is not null
      )
    )
);

create unique index if not exists service_object_assignment_active_scope_idx
  on public.service_object_assignment (org_id, object_id, uid, assignment_role)
  where revoked_at is null;

create index if not exists service_object_assignment_member_lookup_idx
  on public.service_object_assignment
  (org_id, uid, access_mode, object_id, valid_from, valid_to)
  where revoked_at is null;

create index if not exists service_object_assignment_object_lookup_idx
  on public.service_object_assignment
  (org_id, object_id, access_mode, uid, valid_from, valid_to)
  where revoked_at is null;

create table if not exists public.profitability_target_history (
  org_id varchar(64) not null,
  object_id varchar(64) not null,
  target_id varchar(64) not null,
  minimum_result_minor bigint,
  minimum_margin_bps integer,
  currency char(3),
  target_policy varchar(24) not null default 'ALL_DEFINED',
  effective_from date not null,
  effective_to date,
  change_reason text,
  created_at timestamptz not null default now(),
  created_by_uid varchar(128) not null,
  revoked_at timestamptz,
  revoked_by_uid varchar(128),
  revocation_reason text,
  primary key (org_id, object_id, target_id),
  constraint profitability_target_history_object_fk
    foreign key (org_id, object_id)
    references public.service_object (org_id, object_id),
  constraint profitability_target_history_values_check
    check (minimum_result_minor is not null or minimum_margin_bps is not null),
  constraint profitability_target_history_result_check
    check (minimum_result_minor is null or minimum_result_minor >= 0),
  constraint profitability_target_history_margin_check
    check (minimum_margin_bps is null or minimum_margin_bps between -100000 and 10000),
  constraint profitability_target_history_currency_check
    check (
      (minimum_result_minor is null and currency is null)
      or (minimum_result_minor is not null and currency ~ '^[A-Z]{3}$')
    ),
  constraint profitability_target_history_policy_check
    check (target_policy = 'ALL_DEFINED'),
  constraint profitability_target_history_validity_check
    check (effective_to is null or effective_to > effective_from),
  constraint profitability_target_history_revocation_check
    check (
      (revoked_at is null and revoked_by_uid is null and revocation_reason is null)
      or (
        revoked_at is not null
        and revoked_by_uid is not null
        and nullif(btrim(revocation_reason), '') is not null
      )
    )
);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'profitability_target_history_no_overlap'
       and conrelid = 'public.profitability_target_history'::regclass
  ) then
    alter table public.profitability_target_history
      add constraint profitability_target_history_no_overlap
      exclude using gist (
        org_id with =,
        object_id with =,
        daterange(
          effective_from,
          coalesce(effective_to, 'infinity'::date),
          '[)'
        ) with &&
      ) where (revoked_at is null);
  end if;
end
$$;

create index if not exists profitability_target_history_lookup_idx
  on public.profitability_target_history
  (org_id, object_id, effective_from desc, effective_to)
  where revoked_at is null;

-- Remove broad/default ACLs first. The wrapper-selected runtime role receives
-- only schema USAGE and table SELECT in this same transaction. Effective DML,
-- grant options or schema CREATE (including inherited privileges) fail closed.
revoke all on table public.organization_access_profile from public;
revoke all on table public.service_object_assignment from public;
revoke all on table public.profitability_target_history from public;
revoke all on table public.profitability_access_enforcement from public;

do $$
declare
  runtime_role_name text := nullif(
    current_setting('cleanzi.profitability_access_v2_runtime_role', true),
    ''
  );
  runtime_role_oid oid;
  target_relation text;
  target_relation_oid oid;
  target_column record;
begin
  select runtime_role.oid
    into runtime_role_oid
    from pg_roles runtime_role
   where runtime_role.rolname = runtime_role_name
     and not runtime_role.rolsuper
     and not runtime_role.rolbypassrls
     and not runtime_role.rolcreaterole
     and not runtime_role.rolcreatedb
     and not runtime_role.rolreplication;

  if runtime_role_oid is null
     or runtime_role_name in ('PUBLIC', 'public', 'migration_runner') then
    raise exception 'PROFITABILITY_ACCESS_V2_RUNTIME_ROLE_INVALID';
  end if;

  if has_schema_privilege(runtime_role_name, 'public', 'CREATE') then
    raise exception 'PROFITABILITY_ACCESS_V2_RUNTIME_SCHEMA_CREATE_EXCESS';
  end if;

  execute format('grant usage on schema public to %I', runtime_role_name);

  foreach target_relation in array array[
    'profitability_access_enforcement',
    'organization_access_profile',
    'service_object_assignment',
    'profitability_target_history'
  ] loop
    target_relation_oid := format('public.%I', target_relation)::regclass;

    execute format(
      'revoke all privileges on table public.%I from %I',
      target_relation,
      runtime_role_name
    );

    for target_column in
      select attribute_row.attname
        from pg_attribute attribute_row
       where attribute_row.attrelid = target_relation_oid
         and attribute_row.attnum > 0
         and not attribute_row.attisdropped
       order by attribute_row.attnum
    loop
      execute format(
        'revoke all privileges (%I) on table public.%I from %I',
        target_column.attname,
        target_relation,
        runtime_role_name
      );
      execute format(
        'revoke all privileges (%I) on table public.%I from public',
        target_column.attname,
        target_relation
      );
    end loop;

    execute format(
      'grant select on table public.%I to %I',
      target_relation,
      runtime_role_name
    );

    if not has_table_privilege(runtime_role_name, target_relation_oid, 'SELECT') then
      raise exception 'PROFITABILITY_ACCESS_V2_RUNTIME_SELECT_MISSING:%', target_relation;
    end if;

    if has_table_privilege(runtime_role_name, target_relation_oid, 'INSERT')
       or has_table_privilege(runtime_role_name, target_relation_oid, 'UPDATE')
       or has_table_privilege(runtime_role_name, target_relation_oid, 'DELETE')
       or has_table_privilege(runtime_role_name, target_relation_oid, 'TRUNCATE')
       or has_table_privilege(runtime_role_name, target_relation_oid, 'REFERENCES')
       or has_table_privilege(runtime_role_name, target_relation_oid, 'TRIGGER')
       or has_any_column_privilege(runtime_role_name, target_relation_oid, 'INSERT')
       or has_any_column_privilege(runtime_role_name, target_relation_oid, 'UPDATE')
       or has_any_column_privilege(runtime_role_name, target_relation_oid, 'REFERENCES') then
      raise exception 'PROFITABILITY_ACCESS_V2_RUNTIME_DML_EXCESS:%', target_relation;
    end if;

    if not exists (
      select 1
        from pg_class relation_row
        cross join lateral aclexplode(relation_row.relacl) privilege_row
       where relation_row.oid = target_relation_oid
         and privilege_row.grantee = runtime_role_oid
         and privilege_row.privilege_type = 'SELECT'
         and not privilege_row.is_grantable
    ) or exists (
      select 1
        from pg_class relation_row
        cross join lateral aclexplode(relation_row.relacl) privilege_row
       where relation_row.oid = target_relation_oid
         and privilege_row.grantee = runtime_role_oid
         and (
           privilege_row.privilege_type <> 'SELECT'
           or privilege_row.is_grantable
         )
    ) then
      raise exception 'PROFITABILITY_ACCESS_V2_RUNTIME_DIRECT_ACL_INVALID:%', target_relation;
    end if;
  end loop;

  if not has_schema_privilege(runtime_role_name, 'public', 'USAGE') then
    raise exception 'PROFITABILITY_ACCESS_V2_RUNTIME_SCHEMA_USAGE_MISSING';
  end if;

  if has_schema_privilege(runtime_role_name, 'public', 'CREATE') then
    raise exception 'PROFITABILITY_ACCESS_V2_RUNTIME_SCHEMA_CREATE_EXCESS';
  end if;
end
$$;

-- Idempotent postflight: same-named but structurally incomplete relations must
-- abort the transaction instead of being accepted by CREATE TABLE IF NOT EXISTS.
do $$
declare
  required_column record;
  required_constraint record;
  required_index record;
  actual_definition text;
begin
  for required_column in
    select *
      from (values
        ('profitability_access_enforcement', 'org_id', 'character varying', 'NO', 64, null::text),
        ('profitability_access_enforcement', 'schema_version', 'character varying', 'NO', 8, null::text),
        ('profitability_access_enforcement', 'enforced_at', 'timestamp with time zone', 'NO', null::integer, 'now()'),
        ('profitability_access_enforcement', 'enforced_by_uid', 'character varying', 'NO', 128, null::text),
        ('profitability_access_enforcement', 'reason', 'text', 'NO', null::integer, null::text),
        ('organization_access_profile', 'org_id', 'character varying', 'NO', 64, null::text),
        ('organization_access_profile', 'profile_id', 'character varying', 'NO', 64, null::text),
        ('organization_access_profile', 'uid', 'character varying', 'NO', 128, null::text),
        ('organization_access_profile', 'operational_profile', 'character varying', 'NO', 32, '''NONE'''),
        ('organization_access_profile', 'object_scope', 'character varying', 'NO', 24, '''NONE'''),
        ('organization_access_profile', 'worker_scope', 'character varying', 'NO', 24, '''NONE'''),
        ('organization_access_profile', 'finance_profile', 'character varying', 'NO', 32, '''NONE'''),
        ('organization_access_profile', 'access_mode', 'character varying', 'NO', 8, '''NONE'''),
        ('organization_access_profile', 'can_edit_operational_costs', 'boolean', 'NO', null::integer, 'false'),
        ('organization_access_profile', 'can_edit_contract_terms', 'boolean', 'NO', null::integer, 'false'),
        ('organization_access_profile', 'can_edit_profitability_targets', 'boolean', 'NO', null::integer, 'false'),
        ('organization_access_profile', 'can_view_worker_rates', 'boolean', 'NO', null::integer, 'false'),
        ('organization_access_profile', 'can_edit_worker_rates', 'boolean', 'NO', null::integer, 'false'),
        ('organization_access_profile', 'valid_from', 'timestamp with time zone', 'NO', null::integer, 'now()'),
        ('organization_access_profile', 'valid_to', 'timestamp with time zone', 'YES', null::integer, null::text),
        ('organization_access_profile', 'created_at', 'timestamp with time zone', 'NO', null::integer, 'now()'),
        ('organization_access_profile', 'created_by_uid', 'character varying', 'NO', 128, null::text),
        ('organization_access_profile', 'updated_at', 'timestamp with time zone', 'NO', null::integer, 'now()'),
        ('organization_access_profile', 'updated_by_uid', 'character varying', 'NO', 128, null::text),
        ('organization_access_profile', 'revoked_at', 'timestamp with time zone', 'YES', null::integer, null::text),
        ('organization_access_profile', 'revoked_by_uid', 'character varying', 'YES', 128, null::text),
        ('organization_access_profile', 'revocation_reason', 'text', 'YES', null::integer, null::text),
        ('service_object_assignment', 'org_id', 'character varying', 'NO', 64, null::text),
        ('service_object_assignment', 'assignment_id', 'character varying', 'NO', 64, null::text),
        ('service_object_assignment', 'object_id', 'character varying', 'NO', 64, null::text),
        ('service_object_assignment', 'uid', 'character varying', 'NO', 128, null::text),
        ('service_object_assignment', 'assignment_role', 'character varying', 'NO', 32, null::text),
        ('service_object_assignment', 'access_mode', 'character varying', 'NO', 8, '''DENY'''),
        ('service_object_assignment', 'valid_from', 'timestamp with time zone', 'NO', null::integer, 'now()'),
        ('service_object_assignment', 'valid_to', 'timestamp with time zone', 'YES', null::integer, null::text),
        ('service_object_assignment', 'created_at', 'timestamp with time zone', 'NO', null::integer, 'now()'),
        ('service_object_assignment', 'created_by_uid', 'character varying', 'NO', 128, null::text),
        ('service_object_assignment', 'updated_at', 'timestamp with time zone', 'NO', null::integer, 'now()'),
        ('service_object_assignment', 'updated_by_uid', 'character varying', 'NO', 128, null::text),
        ('service_object_assignment', 'revoked_at', 'timestamp with time zone', 'YES', null::integer, null::text),
        ('service_object_assignment', 'revoked_by_uid', 'character varying', 'YES', 128, null::text),
        ('service_object_assignment', 'revocation_reason', 'text', 'YES', null::integer, null::text),
        ('profitability_target_history', 'org_id', 'character varying', 'NO', 64, null::text),
        ('profitability_target_history', 'object_id', 'character varying', 'NO', 64, null::text),
        ('profitability_target_history', 'target_id', 'character varying', 'NO', 64, null::text),
        ('profitability_target_history', 'minimum_result_minor', 'bigint', 'YES', null::integer, null::text),
        ('profitability_target_history', 'minimum_margin_bps', 'integer', 'YES', null::integer, null::text),
        ('profitability_target_history', 'currency', 'character', 'YES', 3, null::text),
        ('profitability_target_history', 'target_policy', 'character varying', 'NO', 24, '''ALL_DEFINED'''),
        ('profitability_target_history', 'effective_from', 'date', 'NO', null::integer, null::text),
        ('profitability_target_history', 'effective_to', 'date', 'YES', null::integer, null::text),
        ('profitability_target_history', 'change_reason', 'text', 'YES', null::integer, null::text),
        ('profitability_target_history', 'created_at', 'timestamp with time zone', 'NO', null::integer, 'now()'),
        ('profitability_target_history', 'created_by_uid', 'character varying', 'NO', 128, null::text),
        ('profitability_target_history', 'revoked_at', 'timestamp with time zone', 'YES', null::integer, null::text),
        ('profitability_target_history', 'revoked_by_uid', 'character varying', 'YES', 128, null::text),
        ('profitability_target_history', 'revocation_reason', 'text', 'YES', null::integer, null::text)
      ) as expected(
        table_name,
        column_name,
        data_type,
        nullable,
        maximum_length,
        default_token
      )
  loop
    if not exists (
      select 1
        from information_schema.columns column_row
       where column_row.table_schema = 'public'
         and column_row.table_name = required_column.table_name
         and column_row.column_name = required_column.column_name
         and column_row.data_type = required_column.data_type
         and column_row.is_nullable = required_column.nullable
         and (
           required_column.maximum_length is null
           or column_row.character_maximum_length = required_column.maximum_length
         )
         and (
           required_column.default_token is null
           or position(
             lower(required_column.default_token)
             in lower(coalesce(column_row.column_default, ''))
           ) > 0
         )
    ) then
      raise exception 'PROFITABILITY_ACCESS_V2_COLUMN_POSTFLIGHT_FAILED:%.%',
        required_column.table_name,
        required_column.column_name;
    end if;
  end loop;

  for required_constraint in
    select *
      from (values
        ('profitability_access_enforcement', 'profitability_access_enforcement_pkey', 'p', array['primarykey(org_id)']::text[]),
        ('profitability_access_enforcement', 'profitability_access_enforcement_org_fk', 'f', array['foreignkey(org_id)', 'referencesorganizations(org_id)']::text[]),
        ('profitability_access_enforcement', 'profitability_access_enforcement_version_check', 'c', array['schema_version', '''v2''']::text[]),
        ('profitability_access_enforcement', 'profitability_access_enforcement_reason_check', 'c', array['reason', 'btrim']::text[]),
        ('organization_access_profile', 'organization_access_profile_pkey', 'p', array['primarykey(org_id,profile_id)']::text[]),
        ('organization_access_profile', 'organization_access_profile_member_fk', 'f', array['foreignkey(org_id,uid)', 'referencesorganization_member(org_id,uid)']::text[]),
        ('organization_access_profile', 'organization_access_profile_operational_check', 'c', array['operational_profile', 'coordinator']::text[]),
        ('organization_access_profile', 'organization_access_profile_object_scope_check', 'c', array['object_scope', 'assigned', 'all']::text[]),
        ('organization_access_profile', 'organization_access_profile_worker_scope_check', 'c', array['worker_scope', 'object_assigned']::text[]),
        ('organization_access_profile', 'organization_access_profile_finance_check', 'c', array['finance_profile', 'cost_control', 'owner_full']::text[]),
        ('organization_access_profile', 'organization_access_profile_access_mode_check', 'c', array['access_mode', 'manage']::text[]),
        ('organization_access_profile', 'organization_access_profile_validity_check', 'c', array['valid_to', 'valid_from']::text[]),
        ('organization_access_profile', 'organization_access_profile_revocation_check', 'c', array['revoked_at', 'revoked_by_uid', 'revocation_reason']::text[]),
        ('organization_access_profile', 'organization_access_profile_none_is_empty_check', 'c', array['access_mode', 'operational_profile', 'object_scope', 'worker_scope', 'finance_profile']::text[]),
        ('organization_access_profile', 'organization_access_profile_finance_capabilities_check', 'c', array['cost_control', 'owner_full', 'can_edit_contract_terms', 'can_edit_profitability_targets', 'can_view_worker_rates', 'can_edit_worker_rates']::text[]),
        ('organization_access_profile', 'organization_access_profile_worker_rate_edit_check', 'c', array['can_edit_worker_rates', 'can_view_worker_rates']::text[]),
        ('service_object_assignment', 'service_object_assignment_pkey', 'p', array['primarykey(org_id,assignment_id)']::text[]),
        ('service_object_assignment', 'service_object_assignment_object_fk', 'f', array['foreignkey(org_id,object_id)', 'referencesservice_object(org_id,object_id)']::text[]),
        ('service_object_assignment', 'service_object_assignment_member_fk', 'f', array['foreignkey(org_id,uid)', 'referencesorganization_member(org_id,uid)']::text[]),
        ('service_object_assignment', 'service_object_assignment_role_check', 'c', array['assignment_role', 'coordinator', 'support']::text[]),
        ('service_object_assignment', 'service_object_assignment_access_mode_check', 'c', array['access_mode', 'allow', 'deny']::text[]),
        ('service_object_assignment', 'service_object_assignment_validity_check', 'c', array['valid_to', 'valid_from']::text[]),
        ('service_object_assignment', 'service_object_assignment_revocation_check', 'c', array['revoked_at', 'revoked_by_uid', 'revocation_reason']::text[]),
        ('profitability_target_history', 'profitability_target_history_pkey', 'p', array['primarykey(org_id,object_id,target_id)']::text[]),
        ('profitability_target_history', 'profitability_target_history_object_fk', 'f', array['foreignkey(org_id,object_id)', 'referencesservice_object(org_id,object_id)']::text[]),
        ('profitability_target_history', 'profitability_target_history_values_check', 'c', array['minimum_result_minor', 'minimum_margin_bps']::text[]),
        ('profitability_target_history', 'profitability_target_history_result_check', 'c', array['minimum_result_minor', '>=0']::text[]),
        ('profitability_target_history', 'profitability_target_history_margin_check', 'c', array['minimum_margin_bps', '-100000', '10000']::text[]),
        ('profitability_target_history', 'profitability_target_history_currency_check', 'c', array['minimum_result_minor', 'currency']::text[]),
        ('profitability_target_history', 'profitability_target_history_policy_check', 'c', array['target_policy', 'all_defined']::text[]),
        ('profitability_target_history', 'profitability_target_history_validity_check', 'c', array['effective_to', 'effective_from']::text[]),
        ('profitability_target_history', 'profitability_target_history_revocation_check', 'c', array['revoked_at', 'revoked_by_uid', 'revocation_reason']::text[]),
        ('profitability_target_history', 'profitability_target_history_no_overlap', 'x', array['excludeusinggist', 'org_idwith=', 'object_idwith=', 'daterange', 'revoked_atisnull']::text[])
      ) as expected(table_name, constraint_name, constraint_type, definition_tokens)
  loop
    select regexp_replace(
             replace(
               replace(lower(pg_get_constraintdef(constraint_row.oid, true)), 'public.', ''),
               '"',
               ''
             ),
             '\s+',
             '',
             'g'
           )
      into actual_definition
      from pg_constraint constraint_row
     where constraint_row.conrelid = format('public.%I', required_constraint.table_name)::regclass
       and constraint_row.conname = required_constraint.constraint_name
       and constraint_row.contype::text = required_constraint.constraint_type
       and constraint_row.convalidated is true;

    if actual_definition is null or exists (
      select 1
        from unnest(required_constraint.definition_tokens) required_token
       where position(lower(required_token) in actual_definition) = 0
    ) then
      raise exception 'PROFITABILITY_ACCESS_V2_CONSTRAINT_POSTFLIGHT_FAILED:%.%',
        required_constraint.table_name,
        required_constraint.constraint_name;
    end if;
  end loop;

  for required_index in
    select *
      from (values
        ('organization_access_profile', 'organization_access_profile_active_uid_idx', true, array['org_id,uid', 'revoked_atisnull']::text[]),
        ('organization_access_profile', 'organization_access_profile_lookup_idx', false, array['org_id,uid,access_mode,valid_from,valid_to', 'revoked_atisnull']::text[]),
        ('service_object_assignment', 'service_object_assignment_active_scope_idx', true, array['org_id,object_id,uid,assignment_role', 'revoked_atisnull']::text[]),
        ('service_object_assignment', 'service_object_assignment_member_lookup_idx', false, array['org_id,uid,access_mode,object_id,valid_from,valid_to', 'revoked_atisnull']::text[]),
        ('service_object_assignment', 'service_object_assignment_object_lookup_idx', false, array['org_id,object_id,access_mode,uid,valid_from,valid_to', 'revoked_atisnull']::text[]),
        ('profitability_target_history', 'profitability_target_history_lookup_idx', false, array['org_id,object_id,effective_fromdesc,effective_to', 'revoked_atisnull']::text[])
      ) as expected(table_name, index_name, is_unique, definition_tokens)
  loop
    select regexp_replace(
             replace(
               replace(lower(pg_get_indexdef(index_meta.indexrelid, 0, true)), 'public.', ''),
               '"',
               ''
             ),
             '\s+',
             '',
             'g'
           )
      into actual_definition
      from pg_index index_meta
      join pg_class index_row on index_row.oid = index_meta.indexrelid
      join pg_class relation_row on relation_row.oid = index_meta.indrelid
      join pg_namespace namespace_row on namespace_row.oid = index_row.relnamespace
     where namespace_row.nspname = 'public'
       and relation_row.relname = required_index.table_name
       and index_row.relname = required_index.index_name
       and index_meta.indisunique = required_index.is_unique
       and index_meta.indisvalid is true
       and index_meta.indisready is true;

    if actual_definition is null or exists (
      select 1
        from unnest(required_index.definition_tokens) required_token
       where position(lower(required_token) in actual_definition) = 0
    ) then
      raise exception 'PROFITABILITY_ACCESS_V2_INDEX_POSTFLIGHT_FAILED:%',
        required_index.index_name;
    end if;
  end loop;
end
$$;

commit;
