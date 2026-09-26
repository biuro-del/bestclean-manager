-- Review-only, additive profitability domain Foundation V2.
-- OPERATOR ENTRYPOINT: ../admin/20260925_profitability_domain_foundation_v2_apply.psql
-- Direct execution of this raw SQL is forbidden. The guarded wrapper owns the
-- transaction and applies this file only after a separately approved backup,
-- role preprovisioning and read-only production preflight.
--
-- Scope is intentionally narrow:
--   * ten empty profitability-domain relations;
--   * no users, organizations, objects or financial data are seeded;
--   * no client-to-object inference or backfill;
--   * no changes or triggers on public.zone, public.task or public.event;
--   * no legacy public.profitability_permission;
--   * btree_gist is required with an exact fingerprint, never installed here.

do $profitability_foundation_v2_entrypoint_guard$
declare
  expected_executor text := nullif(
    current_setting('cleanzi.profitability_foundation_v2_expected_executor', true),
    ''
  );
  provisioner_role_name text := nullif(
    current_setting('cleanzi.profitability_foundation_v2_provisioner', true),
    ''
  );
  bootstrap_grantor_name text := nullif(
    current_setting('cleanzi.profitability_foundation_v2_bootstrap_grantor', true),
    ''
  );
  migration_runner_name text := nullif(
    current_setting('cleanzi.profitability_foundation_v2_migration_runner', true),
    ''
  );
  owner_role_name text := nullif(
    current_setting('cleanzi.profitability_foundation_v2_owner_role', true),
    ''
  );
  runtime_role_name text := nullif(
    current_setting('cleanzi.profitability_foundation_v2_runtime_role', true),
    ''
  );
  session_role_name text := nullif(
    current_setting('cleanzi.profitability_foundation_v2_session_role', true),
    ''
  );
  extension_version text := nullif(
    current_setting('cleanzi.profitability_foundation_v2_btree_gist_version', true),
    ''
  );
  extension_schema text := nullif(
    current_setting('cleanzi.profitability_foundation_v2_btree_gist_schema', true),
    ''
  );
  backup_reference text := nullif(
    current_setting('cleanzi.profitability_foundation_v2_backup_reference', true),
    ''
  );
begin
  if current_setting('cleanzi.profitability_foundation_v2_entrypoint', true)
       is distinct from 'GUARDED_PROFITABILITY_DOMAIN_FOUNDATION_V2_20260925' then
    raise exception 'PROFITABILITY_FOUNDATION_V2_GUARDED_ENTRYPOINT_REQUIRED';
  end if;

  if current_database() <> 'iclean-room-database' then
    raise exception 'PROFITABILITY_FOUNDATION_V2_DATABASE_MISMATCH';
  end if;

  if expected_executor <> 'profitability_migration_executor'
     or session_user <> expected_executor then
    raise exception 'PROFITABILITY_FOUNDATION_V2_EXECUTOR_MISMATCH';
  end if;

  if provisioner_role_name <> 'profitability_provisioner' then
    raise exception 'PROFITABILITY_FOUNDATION_V2_PROVISIONER_MISMATCH';
  end if;

  if bootstrap_grantor_name <> pg_get_userbyid(10) then
    raise exception 'PROFITABILITY_FOUNDATION_V2_BOOTSTRAP_GRANTOR_MISMATCH';
  end if;

  if migration_runner_name <> 'profitability_migration_runner'
     or current_user <> migration_runner_name then
    raise exception 'PROFITABILITY_FOUNDATION_V2_MIGRATION_RUNNER_MISMATCH';
  end if;

  if owner_role_name <> 'profitability_owner'
     or runtime_role_name <> 'profitability_runtime'
     or session_role_name <> 'profitability_session' then
    raise exception 'PROFITABILITY_FOUNDATION_V2_ROLE_NAME_MISMATCH';
  end if;

  if extension_version <> '1.7' or extension_schema <> 'public' then
    raise exception 'PROFITABILITY_FOUNDATION_V2_BTREE_GIST_EXPECTATION_MISMATCH';
  end if;

  if backup_reference <> '1790402094445' then
    raise exception 'PROFITABILITY_FOUNDATION_V2_APPROVED_BACKUP_MISMATCH';
  end if;

  if current_setting('server_version_num')::integer not between 170000 and 179999 then
    raise exception 'PROFITABILITY_FOUNDATION_V2_POSTGRESQL_17_REQUIRED';
  end if;

  if pg_is_in_recovery() then
    raise exception 'PROFITABILITY_FOUNDATION_V2_PRIMARY_DATABASE_REQUIRED';
  end if;

  if current_setting('transaction_read_only') <> 'off'
     or current_setting('default_transaction_read_only') <> 'off' then
    raise exception 'PROFITABILITY_FOUNDATION_V2_READ_WRITE_SESSION_REQUIRED';
  end if;

  if not exists (
    select 1
      from pg_extension extension_row
      join pg_namespace namespace_row on namespace_row.oid = extension_row.extnamespace
     where extension_row.extname = 'btree_gist'
       and extension_row.extversion = extension_version
       and namespace_row.nspname = extension_schema
  ) then
    raise exception 'PROFITABILITY_FOUNDATION_V2_BTREE_GIST_FINGERPRINT_MISMATCH';
  end if;

  if not exists (
    select 1
      from pg_auth_members membership_row
      join pg_roles granted_role on granted_role.oid = membership_row.roleid
      join pg_roles member_role on member_role.oid = membership_row.member
     where granted_role.rolname = migration_runner_name
       and member_role.rolname = expected_executor
       and membership_row.grantor = (
         select oid from pg_roles where rolname = provisioner_role_name
       )
       and membership_row.set_option
       and not membership_row.inherit_option
       and not membership_row.admin_option
  ) then
    raise exception 'PROFITABILITY_FOUNDATION_V2_EXECUTOR_MEMBERSHIP_INVALID';
  end if;

  if not exists (
    select 1
      from pg_auth_members membership_row
      join pg_roles granted_role on granted_role.oid = membership_row.roleid
      join pg_roles member_role on member_role.oid = membership_row.member
     where granted_role.rolname = owner_role_name
       and member_role.rolname = migration_runner_name
       and membership_row.grantor = (
         select oid from pg_roles where rolname = provisioner_role_name
       )
       and membership_row.set_option
       and not membership_row.inherit_option
       and not membership_row.admin_option
  ) then
    raise exception 'PROFITABILITY_FOUNDATION_V2_OWNER_MEMBERSHIP_INVALID';
  end if;

  -- One shot: a retry must return through the wrapper and repeat every gate.
  perform set_config('cleanzi.profitability_foundation_v2_entrypoint', '', true);
end
$profitability_foundation_v2_entrypoint_guard$;

-- The wrapper already owns the transaction and holds the advisory xact lock.
-- Switch only after the raw-SQL guard has proved the exact migration graph.
set local role profitability_owner;

do $profitability_foundation_v2_role_guard$
declare
  owner_role_name text := current_setting(
    'cleanzi.profitability_foundation_v2_owner_role'
  );
  runtime_role_name text := current_setting(
    'cleanzi.profitability_foundation_v2_runtime_role'
  );
  session_role_name text := current_setting(
    'cleanzi.profitability_foundation_v2_session_role'
  );
begin
  if current_user <> owner_role_name then
    raise exception 'PROFITABILITY_FOUNDATION_V2_SET_ROLE_OWNER_FAILED';
  end if;

  if not exists (
    select 1
      from pg_roles role_row
     where role_row.rolname = owner_role_name
       and not role_row.rolcanlogin
       and not role_row.rolinherit
       and not role_row.rolsuper
       and not role_row.rolbypassrls
       and not role_row.rolcreaterole
       and not role_row.rolcreatedb
       and not role_row.rolreplication
       and has_schema_privilege(role_row.oid, 'public', 'USAGE')
       and has_schema_privilege(role_row.oid, 'public', 'CREATE')
  ) then
    raise exception 'PROFITABILITY_FOUNDATION_V2_OWNER_ROLE_INVALID';
  end if;

  if not exists (
    select 1
      from pg_roles role_row
     where role_row.rolname = runtime_role_name
       and not role_row.rolcanlogin
       and not role_row.rolinherit
       and not role_row.rolsuper
       and not role_row.rolbypassrls
       and not role_row.rolcreaterole
       and not role_row.rolcreatedb
       and not role_row.rolreplication
       and not has_schema_privilege(role_row.oid, 'public', 'CREATE')
  ) then
    raise exception 'PROFITABILITY_FOUNDATION_V2_RUNTIME_ROLE_INVALID';
  end if;

  if not exists (
    select 1
      from pg_roles role_row
     where role_row.rolname = session_role_name
       and role_row.rolcanlogin
       and not role_row.rolinherit
       and not role_row.rolsuper
       and not role_row.rolbypassrls
       and not role_row.rolcreaterole
       and not role_row.rolcreatedb
       and not role_row.rolreplication
       and not has_schema_privilege(role_row.oid, 'public', 'CREATE')
  ) then
    raise exception 'PROFITABILITY_FOUNDATION_V2_SESSION_ROLE_INVALID';
  end if;
end
$profitability_foundation_v2_role_guard$;

-- Source catalog fingerprint. Foundation reuses these tenant identities but
-- does not mutate the source relations or their data.
do $profitability_foundation_v2_source_guard$
declare
  required_column record;
  required_key record;
  actual_key name[];
begin
  for required_column in
    select *
      from (values
        ('organizations', 'org_id', 'varchar', 64),
        ('organization_member', 'org_id', 'varchar', 64),
        ('organization_member', 'uid', 'varchar', 128),
        ('client', 'org_id', 'varchar', 64),
        ('client', 'client_id', 'varchar', 64),
        ('worker', 'org_id', 'varchar', 64),
        ('worker', 'login', 'varchar', 80),
        ('task', 'org_id', 'varchar', 64),
        ('task', 'id_task', 'varchar', 180),
        ('zone', 'org_id', 'varchar', 64),
        ('zone', 'id', 'varchar', 64),
        ('event', 'org_id', 'varchar', 64),
        ('event', 'event_id', 'varchar', 64)
      ) as expected(table_name, column_name, type_name, maximum_length)
  loop
    if not exists (
      select 1
        from pg_attribute attribute_row
        join pg_class relation_row
          on relation_row.oid = attribute_row.attrelid
        join pg_namespace namespace_row
          on namespace_row.oid = relation_row.relnamespace
        join pg_type type_row
          on type_row.oid = attribute_row.atttypid
       where namespace_row.nspname = 'public'
         and relation_row.relname = required_column.table_name
         and relation_row.relkind in ('r', 'p')
         and attribute_row.attname = required_column.column_name
         and attribute_row.attnum > 0
         and not attribute_row.attisdropped
         and attribute_row.attnotnull
         and type_row.typname = required_column.type_name
         and attribute_row.atttypmod = required_column.maximum_length + 4
    ) then
      raise exception 'PROFITABILITY_FOUNDATION_V2_SOURCE_COLUMN_MISMATCH:%.%',
        required_column.table_name,
        required_column.column_name;
    end if;
  end loop;

  for required_key in
    select *
      from (values
        ('organizations', array['org_id']::name[]),
        ('organization_member', array['org_id', 'uid']::name[]),
        ('client', array['org_id', 'client_id']::name[]),
        ('worker', array['org_id', 'login']::name[]),
        ('task', array['org_id', 'id_task']::name[]),
        ('zone', array['org_id', 'id']::name[]),
        ('event', array['org_id', 'event_id']::name[])
      ) as expected(table_name, key_columns)
  loop
    actual_key := null;
    select array_agg(attribute_row.attname order by key_column.ordinality)
      into actual_key
      from pg_constraint constraint_row
      cross join lateral unnest(constraint_row.conkey)
        with ordinality as key_column(attribute_number, ordinality)
      join pg_attribute attribute_row
        on attribute_row.attrelid = constraint_row.conrelid
       and attribute_row.attnum = key_column.attribute_number
     where constraint_row.conrelid = format(
             'public.%I', required_key.table_name
           )::regclass
       and constraint_row.contype in ('p', 'u')
     group by constraint_row.oid
    having array_agg(attribute_row.attname order by key_column.ordinality)
           = required_key.key_columns
     limit 1;

    if actual_key is null then
      raise exception 'PROFITABILITY_FOUNDATION_V2_SOURCE_KEY_MISMATCH:%',
        required_key.table_name;
    end if;
  end loop;

  if to_regclass('public.profitability_permission') is not null then
    raise exception 'PROFITABILITY_FOUNDATION_V2_LEGACY_PERMISSION_PRESENT';
  end if;
end
$profitability_foundation_v2_source_guard$;

-- A replay is allowed only for a complete Foundation V2. A partial target is
-- never repaired automatically.
do $profitability_foundation_v2_target_state_guard$
declare
  target_relations constant text[] := array[
    'service_object',
    'worker_cost_rate',
    'object_contract_version',
    'periodic_work',
    'periodic_work_zone',
    'object_equipment',
    'object_financial_entry',
    'financial_period',
    'profitability_snapshot',
    'profitability_audit'
  ];
  existing_count integer;
  missing_name text;
begin
  select count(*)
    into existing_count
    from unnest(target_relations) target_name
   where to_regclass(format('public.%I', target_name)) is not null;

  if existing_count not in (0, cardinality(target_relations)) then
    select target_name
      into missing_name
      from unnest(target_relations) target_name
     where to_regclass(format('public.%I', target_name)) is null
     order by target_name
     limit 1;
    raise exception 'PROFITABILITY_FOUNDATION_V2_PARTIAL_TARGET:%', missing_name;
  end if;

  if existing_count = 0 and (
    to_regprocedure(
      'public.profitability_foundation_v2_reject_immutable_change()'
    ) is not null
    or to_regclass('public.profitability_audit_audit_id_seq') is not null
  ) then
    raise exception 'PROFITABILITY_FOUNDATION_V2_ORPHANED_NAMED_OBJECT';
  end if;

  if existing_count = cardinality(target_relations) then
    if to_regprocedure(
         'public.profitability_foundation_v2_reject_immutable_change()'
       ) is null then
      raise exception 'PROFITABILITY_FOUNDATION_V2_REPLAY_FUNCTION_MISSING';
    end if;

    if (
      select count(*)
        from pg_trigger trigger_row
       where not trigger_row.tgisinternal
         and trigger_row.tgname = any(array[
           'profitability_snapshot_immutable_v2',
           'profitability_audit_immutable_v2',
           'worker_cost_rate_no_hard_delete_v2',
           'object_contract_version_no_hard_delete_v2',
           'periodic_work_no_hard_delete_v2',
           'object_equipment_no_hard_delete_v2',
           'object_financial_entry_no_hard_delete_v2',
           'financial_period_no_hard_delete_v2'
         ])
    ) <> 8 then
      raise exception 'PROFITABILITY_FOUNDATION_V2_REPLAY_TRIGGER_SET_MISMATCH';
    end if;

    if (
      select count(*)
        from pg_class index_row
        join pg_namespace namespace_row on namespace_row.oid = index_row.relnamespace
       where namespace_row.nspname = 'public'
         and index_row.relkind = 'i'
         and index_row.relname = any(array[
           'service_object_org_client_idx',
           'worker_cost_rate_lookup_idx',
           'periodic_work_period_idx',
           'object_financial_entry_period_idx',
           'profitability_snapshot_period_idx',
           'profitability_audit_entity_idx'
         ])
    ) <> 6 then
      raise exception 'PROFITABILITY_FOUNDATION_V2_REPLAY_INDEX_SET_MISMATCH';
    end if;

    if exists (
      select 1
        from unnest(target_relations) target_name
        join pg_class relation_row
          on relation_row.oid = format('public.%I', target_name)::regclass
        join pg_roles owner_row on owner_row.oid = relation_row.relowner
       where relation_row.relkind <> 'r'
          or owner_row.rolname <> 'profitability_owner'
    ) then
      raise exception 'PROFITABILITY_FOUNDATION_V2_REPLAY_OWNER_MISMATCH';
    end if;
  end if;

  perform set_config(
    'cleanzi.profitability_foundation_v2_fresh_install',
    case when existing_count = 0 then 'true' else 'false' end,
    true
  );
end
$profitability_foundation_v2_target_state_guard$;

create table if not exists public.service_object (
  org_id varchar(64) not null,
  object_id varchar(64) not null,
  client_id varchar(64) not null,
  name varchar(180) not null,
  timezone varchar(80) not null default 'Europe/Warsaw',
  default_currency char(3) not null default 'PLN',
  status varchar(30) not null default 'ACTIVE',
  address text,
  city varchar(120),
  postal_code varchar(20),
  created_at timestamptz not null default now(),
  created_by_uid varchar(128),
  updated_at timestamptz not null default now(),
  updated_by_uid varchar(128),
  archived_at timestamptz,
  archived_by_uid varchar(128),
  constraint service_object_pkey
    primary key (org_id, object_id),
  constraint service_object_org_object_client_key
    unique (org_id, object_id, client_id),
  constraint service_object_org_fk
    foreign key (org_id)
    references public.organizations (org_id),
  constraint service_object_client_fk
    foreign key (org_id, client_id)
    references public.client (org_id, client_id),
  constraint service_object_currency_check
    check (default_currency ~ '^[A-Z]{3}$'),
  constraint service_object_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'ARCHIVED'))
);

create index if not exists service_object_org_client_idx
  on public.service_object (org_id, client_id, status)
  where archived_at is null;

create table if not exists public.worker_cost_rate (
  org_id varchar(64) not null,
  object_id varchar(64) not null,
  rate_id varchar(64) not null,
  worker_login varchar(80) not null,
  hourly_cost_minor bigint not null,
  currency char(3) not null,
  effective_from date not null,
  effective_to date,
  source varchar(32) not null default 'MANUAL',
  change_reason text,
  created_at timestamptz not null default now(),
  created_by_uid varchar(128) not null,
  archived_at timestamptz,
  archived_by_uid varchar(128),
  constraint worker_cost_rate_pkey
    primary key (org_id, object_id, rate_id),
  constraint worker_cost_rate_object_fk
    foreign key (org_id, object_id)
    references public.service_object (org_id, object_id),
  constraint worker_cost_rate_worker_fk
    foreign key (org_id, worker_login)
    references public.worker (org_id, login),
  constraint worker_cost_rate_amount_check
    check (hourly_cost_minor >= 0),
  constraint worker_cost_rate_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  constraint worker_cost_rate_validity_check
    check (effective_to is null or effective_to > effective_from),
  constraint worker_cost_rate_source_check
    check (source in ('MANUAL', 'IMPORT', 'INTEGRATION', 'CORRECTION')),
  constraint worker_cost_rate_no_overlap
    exclude using gist (
      org_id with =,
      object_id with =,
      worker_login with =,
      daterange(
        effective_from,
        coalesce(effective_to, 'infinity'::date),
        '[)'
      ) with &&
    ) where (archived_at is null)
);

create index if not exists worker_cost_rate_lookup_idx
  on public.worker_cost_rate
  (org_id, object_id, worker_login, effective_from, effective_to)
  where archived_at is null;

create table if not exists public.object_contract_version (
  org_id varchar(64) not null,
  object_id varchar(64) not null,
  contract_version_id varchar(64) not null,
  contract_number varchar(120),
  contract_name varchar(180),
  billing_model varchar(32) not null,
  monthly_value_minor bigint,
  hourly_rate_minor bigint,
  service_rate_minor bigint,
  currency char(3) not null default 'PLN',
  vat_rate_bps integer,
  target_profitability_bps integer,
  effective_from date not null,
  effective_to date,
  source varchar(32) not null default 'MANUAL',
  change_reason text,
  created_at timestamptz not null default now(),
  created_by_uid varchar(128) not null,
  archived_at timestamptz,
  archived_by_uid varchar(128),
  constraint object_contract_version_pkey
    primary key (org_id, object_id, contract_version_id),
  constraint object_contract_version_object_fk
    foreign key (org_id, object_id)
    references public.service_object (org_id, object_id),
  constraint object_contract_version_billing_model_check
    check (billing_model in (
      'MONTHLY_FIXED', 'HOURLY', 'PER_SERVICE', 'MIXED'
    )),
  constraint object_contract_version_monthly_value_check
    check (monthly_value_minor is null or monthly_value_minor >= 0),
  constraint object_contract_version_hourly_rate_check
    check (hourly_rate_minor is null or hourly_rate_minor >= 0),
  constraint object_contract_version_service_rate_check
    check (service_rate_minor is null or service_rate_minor >= 0),
  constraint object_contract_version_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  constraint object_contract_version_vat_rate_check
    check (vat_rate_bps is null or vat_rate_bps between 0 and 10000),
  constraint object_contract_version_target_check
    check (
      target_profitability_bps is null
      or target_profitability_bps between -100000 and 10000
    ),
  constraint object_contract_version_validity_check
    check (effective_to is null or effective_to > effective_from),
  constraint object_contract_version_value_check
    check (
      monthly_value_minor is not null
      or hourly_rate_minor is not null
      or service_rate_minor is not null
    ),
  constraint object_contract_version_source_check
    check (source in ('MANUAL', 'IMPORT', 'INTEGRATION', 'CORRECTION')),
  constraint object_contract_version_no_overlap
    exclude using gist (
      org_id with =,
      object_id with =,
      daterange(
        effective_from,
        coalesce(effective_to, 'infinity'::date),
        '[)'
      ) with &&
    ) where (archived_at is null)
);

create table if not exists public.periodic_work (
  org_id varchar(64) not null,
  object_id varchar(64) not null,
  periodic_work_id varchar(64) not null,
  task_id varchar(180),
  name varchar(180) not null,
  work_type varchar(60) not null,
  status varchar(30) not null,
  planned_on date,
  executed_on date,
  planned_minutes integer,
  actual_minutes integer,
  description text,
  created_at timestamptz not null default now(),
  created_by_uid varchar(128) not null,
  updated_at timestamptz not null default now(),
  updated_by_uid varchar(128),
  archived_at timestamptz,
  archived_by_uid varchar(128),
  constraint periodic_work_pkey
    primary key (org_id, object_id, periodic_work_id),
  constraint periodic_work_object_fk
    foreign key (org_id, object_id)
    references public.service_object (org_id, object_id),
  constraint periodic_work_task_fk
    foreign key (org_id, task_id)
    references public.task (org_id, id_task),
  constraint periodic_work_type_check
    check (work_type in (
      'WINDOW_CLEANING', 'CARPET_CLEANING', 'FLOOR_DEEP_CLEANING',
      'FLOOR_PROTECTION', 'SEASONAL', 'REPLACEMENT', 'INTERVENTION', 'OTHER'
    )),
  constraint periodic_work_status_check
    check (status in ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  constraint periodic_work_planned_minutes_check
    check (planned_minutes is null or planned_minutes >= 0),
  constraint periodic_work_actual_minutes_check
    check (actual_minutes is null or actual_minutes >= 0)
);

create index if not exists periodic_work_period_idx
  on public.periodic_work (org_id, object_id, executed_on, planned_on)
  where archived_at is null;

create table if not exists public.periodic_work_zone (
  org_id varchar(64) not null,
  object_id varchar(64) not null,
  periodic_work_id varchar(64) not null,
  zone_id varchar(64) not null,
  constraint periodic_work_zone_pkey
    primary key (org_id, object_id, periodic_work_id, zone_id),
  constraint periodic_work_zone_periodic_work_fk
    foreign key (org_id, object_id, periodic_work_id)
    references public.periodic_work (org_id, object_id, periodic_work_id),
  constraint periodic_work_zone_zone_fk
    foreign key (org_id, zone_id)
    references public.zone (org_id, id)
);

create table if not exists public.object_equipment (
  org_id varchar(64) not null,
  object_id varchar(64) not null,
  equipment_id varchar(64) not null,
  name varchar(180) not null,
  category varchar(80),
  inventory_number varchar(120),
  financing varchar(20) not null,
  recognition_method varchar(20) not null,
  purchase_value_minor bigint,
  depreciation_months integer,
  monthly_installment_minor bigint,
  currency char(3) not null default 'PLN',
  started_on date not null,
  ended_on date,
  created_at timestamptz not null default now(),
  created_by_uid varchar(128) not null,
  updated_at timestamptz not null default now(),
  updated_by_uid varchar(128),
  archived_at timestamptz,
  archived_by_uid varchar(128),
  constraint object_equipment_pkey
    primary key (org_id, object_id, equipment_id),
  constraint object_equipment_object_fk
    foreign key (org_id, object_id)
    references public.service_object (org_id, object_id),
  constraint object_equipment_financing_check
    check (financing in ('PURCHASE', 'LEASE', 'RENTAL')),
  constraint object_equipment_recognition_check
    check (recognition_method in ('IMMEDIATE', 'DEPRECIATION', 'INSTALLMENT')),
  constraint object_equipment_purchase_value_check
    check (purchase_value_minor is null or purchase_value_minor >= 0),
  constraint object_equipment_installment_check
    check (
      monthly_installment_minor is null
      or monthly_installment_minor >= 0
    ),
  constraint object_equipment_depreciation_check
    check (depreciation_months is null or depreciation_months > 0),
  constraint object_equipment_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  constraint object_equipment_validity_check
    check (ended_on is null or ended_on > started_on),
  constraint object_equipment_model_check
    check (
      (
        financing = 'PURCHASE'
        and recognition_method = 'IMMEDIATE'
        and purchase_value_minor is not null
        and depreciation_months is null
        and monthly_installment_minor is null
      )
      or (
        financing = 'PURCHASE'
        and recognition_method = 'DEPRECIATION'
        and purchase_value_minor is not null
        and depreciation_months is not null
        and monthly_installment_minor is null
      )
      or (
        financing in ('LEASE', 'RENTAL')
        and recognition_method = 'INSTALLMENT'
        and purchase_value_minor is null
        and depreciation_months is null
        and monthly_installment_minor is not null
      )
    )
);

create table if not exists public.object_financial_entry (
  org_id varchar(64) not null,
  object_id varchar(64) not null,
  entry_id varchar(64) not null,
  periodic_work_id varchar(64),
  equipment_id varchar(64),
  entry_group varchar(32) not null,
  category varchar(80) not null,
  name varchar(180) not null,
  amount_minor bigint not null,
  currency char(3) not null default 'PLN',
  occurred_on date,
  period_start date,
  period_end date,
  recurrence varchar(24) not null,
  source varchar(24) not null default 'MANUAL',
  source_reference varchar(180),
  description text,
  document_reference text,
  status varchar(20) not null default 'POSTED',
  created_at timestamptz not null default now(),
  created_by_uid varchar(128) not null,
  updated_at timestamptz not null default now(),
  updated_by_uid varchar(128),
  archived_at timestamptz,
  archived_by_uid varchar(128),
  constraint object_financial_entry_pkey
    primary key (org_id, object_id, entry_id),
  constraint object_financial_entry_object_fk
    foreign key (org_id, object_id)
    references public.service_object (org_id, object_id),
  constraint object_financial_entry_periodic_work_fk
    foreign key (org_id, object_id, periodic_work_id)
    references public.periodic_work (org_id, object_id, periodic_work_id),
  constraint object_financial_entry_equipment_fk
    foreign key (org_id, object_id, equipment_id)
    references public.object_equipment (org_id, object_id, equipment_id),
  constraint object_financial_entry_group_check
    check (entry_group in (
      'REVENUE', 'MATERIAL', 'EQUIPMENT_SERVICE', 'PERIODIC_DIRECT',
      'TRANSPORT', 'COORDINATION', 'SUBCONTRACTOR', 'DELIVERY', 'TRAINING',
      'OTHER_DIRECT', 'SHARED_ALLOCATION'
    )),
  constraint object_financial_entry_amount_check
    check (amount_minor >= 0),
  constraint object_financial_entry_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  constraint object_financial_entry_recurrence_check
    check (recurrence in ('ONE_TIME', 'MONTHLY', 'ACTUAL_USAGE')),
  constraint object_financial_entry_source_check
    check (source in (
      'MANUAL', 'WAREHOUSE', 'IMPORT', 'INTEGRATION', 'CORRECTION'
    )),
  constraint object_financial_entry_status_check
    check (status in ('DRAFT', 'POSTED', 'VOID', 'CORRECTED')),
  constraint object_financial_entry_date_check
    check (
      (
        recurrence in ('ONE_TIME', 'ACTUAL_USAGE')
        and occurred_on is not null
      )
      or (recurrence = 'MONTHLY' and period_start is not null)
    ),
  constraint object_financial_entry_period_check
    check (
      period_end is null
      or (period_start is not null and period_end > period_start)
    )
);

create index if not exists object_financial_entry_period_idx
  on public.object_financial_entry
  (org_id, object_id, entry_group, occurred_on, period_start, period_end)
  where archived_at is null and status = 'POSTED';

create table if not exists public.financial_period (
  org_id varchar(64) not null,
  object_id varchar(64) not null,
  period_id varchar(64) not null,
  period_start date not null,
  period_end date not null,
  currency char(3) not null,
  status varchar(20) not null default 'OPEN',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by_uid varchar(128) not null,
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by_uid varchar(128),
  constraint financial_period_pkey
    primary key (org_id, object_id, period_id),
  constraint financial_period_object_fk
    foreign key (org_id, object_id)
    references public.service_object (org_id, object_id),
  constraint financial_period_dates_check
    check (period_end > period_start),
  constraint financial_period_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  constraint financial_period_status_check
    check (status in ('OPEN', 'CLOSED', 'CORRECTED', 'ARCHIVED')),
  constraint financial_period_version_check
    check (version > 0),
  constraint financial_period_no_overlap
    exclude using gist (
      org_id with =,
      object_id with =,
      daterange(period_start, period_end, '[)') with &&
    ) where (status <> 'ARCHIVED')
);

create table if not exists public.profitability_snapshot (
  org_id varchar(64) not null,
  object_id varchar(64) not null,
  snapshot_id varchar(64) not null,
  period_id varchar(64) not null,
  correction_of_snapshot_id varchar(64),
  calculation_status varchar(32) not null,
  currency char(3) not null,
  revenue_minor bigint not null,
  total_cost_minor bigint,
  margin_minor bigint,
  profitability_bps bigint,
  completeness_bps integer not null,
  payload jsonb not null,
  data_version varchar(32) not null,
  calculated_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by_uid varchar(128) not null,
  constraint profitability_snapshot_pkey
    primary key (org_id, object_id, snapshot_id),
  constraint profitability_snapshot_period_snapshot_key
    unique (org_id, object_id, period_id, snapshot_id),
  constraint profitability_snapshot_period_fk
    foreign key (org_id, object_id, period_id)
    references public.financial_period (org_id, object_id, period_id),
  constraint profitability_snapshot_correction_fk
    foreign key (
      org_id,
      object_id,
      period_id,
      correction_of_snapshot_id
    )
    references public.profitability_snapshot (
      org_id,
      object_id,
      period_id,
      snapshot_id
    ),
  constraint profitability_snapshot_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  constraint profitability_snapshot_completeness_check
    check (completeness_bps between 0 and 10000),
  constraint profitability_snapshot_status_check
    check (calculation_status in (
      'ABOVE_TARGET', 'BELOW_TARGET', 'CALCULATED', 'INCOMPLETE',
      'NEGATIVE', 'NOT_CALCULABLE'
    )),
  constraint profitability_snapshot_incomplete_check
    check (
      (
        calculation_status = 'INCOMPLETE'
        and total_cost_minor is null
        and margin_minor is null
        and profitability_bps is null
      )
      or calculation_status <> 'INCOMPLETE'
    )
);

create index if not exists profitability_snapshot_period_idx
  on public.profitability_snapshot
  (org_id, object_id, period_id, calculated_at desc);

create table if not exists public.profitability_audit (
  org_id varchar(64) not null,
  object_id varchar(64) not null,
  audit_id bigint generated always as identity,
  entity_type varchar(80) not null,
  entity_id varchar(128) not null,
  action varchar(60) not null,
  actor_uid varchar(128) not null,
  source varchar(32) not null,
  reason text,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now(),
  constraint profitability_audit_pkey
    primary key (org_id, object_id, audit_id),
  constraint profitability_audit_object_fk
    foreign key (org_id, object_id)
    references public.service_object (org_id, object_id),
  constraint profitability_audit_source_check
    check (source in (
      'PORTAL', 'IMPORT', 'INTEGRATION', 'BACKEND_CALCULATION', 'CORRECTION'
    ))
);

create index if not exists profitability_audit_entity_idx
  on public.profitability_audit
  (org_id, object_id, entity_type, entity_id, created_at desc);

do $profitability_foundation_v2_function_create$
begin
  if to_regprocedure(
       'public.profitability_foundation_v2_reject_immutable_change()'
     ) is null then
    execute $function_sql$
      create function public.profitability_foundation_v2_reject_immutable_change()
      returns trigger
      language plpgsql
      security invoker
      set search_path = pg_catalog, public
      as $function_body$
      begin
        raise exception '% records are immutable; append a correction instead',
          tg_table_name
          using errcode = '55000';
      end
      $function_body$
    $function_sql$;
  end if;
end
$profitability_foundation_v2_function_create$;

do $profitability_foundation_v2_trigger_create$
declare
  trigger_spec record;
begin
  for trigger_spec in
    select *
      from (values
        (
          'profitability_snapshot',
          'profitability_snapshot_immutable_v2',
          'update or delete'
        ),
        (
          'profitability_audit',
          'profitability_audit_immutable_v2',
          'update or delete'
        ),
        (
          'worker_cost_rate',
          'worker_cost_rate_no_hard_delete_v2',
          'delete'
        ),
        (
          'object_contract_version',
          'object_contract_version_no_hard_delete_v2',
          'delete'
        ),
        (
          'periodic_work',
          'periodic_work_no_hard_delete_v2',
          'delete'
        ),
        (
          'object_equipment',
          'object_equipment_no_hard_delete_v2',
          'delete'
        ),
        (
          'object_financial_entry',
          'object_financial_entry_no_hard_delete_v2',
          'delete'
        ),
        (
          'financial_period',
          'financial_period_no_hard_delete_v2',
          'delete'
        )
      ) as expected(table_name, trigger_name, event_clause)
  loop
    if not exists (
      select 1
        from pg_trigger trigger_row
       where trigger_row.tgrelid = format(
               'public.%I', trigger_spec.table_name
             )::regclass
         and trigger_row.tgname = trigger_spec.trigger_name
         and not trigger_row.tgisinternal
    ) then
      execute format(
        'create trigger %I before %s on public.%I '
        || 'for each row execute function '
        || 'public.profitability_foundation_v2_reject_immutable_change()',
        trigger_spec.trigger_name,
        trigger_spec.event_clause,
        trigger_spec.table_name
      );
    end if;
  end loop;
end
$profitability_foundation_v2_trigger_create$;

comment on table public.service_object is
  'Profitability service site owned by a client; intentionally empty until explicitly mapped.';
comment on column public.worker_cost_rate.hourly_cost_minor is
  'Full employer hourly cost in integer minor currency units, never net salary.';
comment on column public.profitability_snapshot.payload is
  'Immutable backend calculation input/result snapshot; bigint values are decimal strings.';

-- Fresh objects can be normalized below because they were created in this
-- transaction.  Replay must validate named-object ownership and ACL before any
-- ALTER OWNER, REVOKE or GRANT could hide drift from the exact postflight.
do $profitability_foundation_v2_named_object_replay_guard$
declare
  owner_role_oid oid := (
    select oid
      from pg_roles
     where rolname = current_setting(
       'cleanzi.profitability_foundation_v2_owner_role'
     )
  );
  runtime_role_oid oid := (
    select oid
      from pg_roles
     where rolname = current_setting(
       'cleanzi.profitability_foundation_v2_runtime_role'
     )
  );
  immutable_function_oid oid := to_regprocedure(
    'public.profitability_foundation_v2_reject_immutable_change()'
  );
  audit_sequence_oid oid := to_regclass(
    'public.profitability_audit_audit_id_seq'
  );
begin
  if current_setting(
       'cleanzi.profitability_foundation_v2_fresh_install'
     )::boolean then
    return;
  end if;

  if not exists (
    select 1
      from pg_class sequence_row
     where sequence_row.oid = audit_sequence_oid
       and sequence_row.relkind = 'S'
       and sequence_row.relowner = owner_role_oid
  ) then
    raise exception
      'PROFITABILITY_FOUNDATION_V2_REPLAY_AUDIT_SEQUENCE_OWNER_MISMATCH';
  end if;

  if not exists (
    select 1
      from pg_class sequence_row
     where sequence_row.oid = audit_sequence_oid
       and sequence_row.relpersistence = 'p'
  ) then
    raise exception
      'PROFITABILITY_FOUNDATION_V2_REPLAY_AUDIT_SEQUENCE_PERSISTENCE_MISMATCH';
  end if;

  if exists (
    with actual_acl as (
      select privilege_row.grantee,
             privilege_row.grantor,
             privilege_row.privilege_type,
             privilege_row.is_grantable
        from pg_class sequence_row
        cross join lateral aclexplode(
          coalesce(
            sequence_row.relacl,
            acldefault('S', sequence_row.relowner)
          )
        ) privilege_row
       where sequence_row.oid = audit_sequence_oid
    ),
    expected_acl(grantee, grantor, privilege_type, is_grantable) as (
      values
        (owner_role_oid, owner_role_oid, 'SELECT'::text, false),
        (owner_role_oid, owner_role_oid, 'UPDATE'::text, false),
        (owner_role_oid, owner_role_oid, 'USAGE'::text, false),
        (runtime_role_oid, owner_role_oid, 'USAGE'::text, false)
    )
    (
      select * from actual_acl
      except all
      select * from expected_acl
    )
    union all
    (
      select * from expected_acl
      except all
      select * from actual_acl
    )
  ) then
    raise exception
      'PROFITABILITY_FOUNDATION_V2_REPLAY_AUDIT_SEQUENCE_ACL_MISMATCH';
  end if;

  if not exists (
    select 1
      from pg_proc function_row
     where function_row.oid = immutable_function_oid
       and function_row.proowner = owner_role_oid
  ) then
    raise exception
      'PROFITABILITY_FOUNDATION_V2_REPLAY_IMMUTABLE_FUNCTION_OWNER_MISMATCH';
  end if;

  -- The replay path never uses CREATE OR REPLACE.  Check the stable properties
  -- here; the complete pg_get_functiondef/prosrc image is checked later before
  -- commit by the exact catalog fingerprint.
  if not exists (
    select 1
      from pg_proc function_row
      join pg_language language_row
        on language_row.oid = function_row.prolang
     where function_row.oid = immutable_function_oid
       and language_row.lanname = 'plpgsql'
       and function_row.prorettype = 'trigger'::regtype
       and not function_row.prosecdef
       and function_row.provolatile = 'v'
       and function_row.proconfig =
           array['search_path=pg_catalog, public']::text[]
       and position('raise exception' in lower(function_row.prosrc)) > 0
       and position('55000' in function_row.prosrc) > 0
  ) then
    raise exception
      'PROFITABILITY_FOUNDATION_V2_REPLAY_IMMUTABLE_FUNCTION_MISMATCH';
  end if;

  if exists (
    with actual_acl as (
      select privilege_row.grantee,
             privilege_row.grantor,
             privilege_row.privilege_type,
             privilege_row.is_grantable
        from pg_proc function_row
        cross join lateral aclexplode(
          coalesce(
            function_row.proacl,
            acldefault('f', function_row.proowner)
          )
        ) privilege_row
       where function_row.oid = immutable_function_oid
    ),
    expected_acl(grantee, grantor, privilege_type, is_grantable) as (
      values
        (owner_role_oid, owner_role_oid, 'EXECUTE'::text, false)
    )
    (
      select * from actual_acl
      except all
      select * from expected_acl
    )
    union all
    (
      select * from expected_acl
      except all
      select * from actual_acl
    )
  ) then
    raise exception
      'PROFITABILITY_FOUNDATION_V2_REPLAY_IMMUTABLE_FUNCTION_ACL_MISMATCH';
  end if;
end
$profitability_foundation_v2_named_object_replay_guard$;

-- All persistent Foundation objects are owned by the dedicated NOLOGIN role.
-- No ownership or access is granted to a shared application role.
alter table public.service_object owner to profitability_owner;
alter table public.worker_cost_rate owner to profitability_owner;
alter table public.object_contract_version owner to profitability_owner;
alter table public.periodic_work owner to profitability_owner;
alter table public.periodic_work_zone owner to profitability_owner;
alter table public.object_equipment owner to profitability_owner;
alter table public.object_financial_entry owner to profitability_owner;
alter table public.financial_period owner to profitability_owner;
alter table public.profitability_snapshot owner to profitability_owner;
alter table public.profitability_audit owner to profitability_owner;
alter sequence public.profitability_audit_audit_id_seq
  owner to profitability_owner;
alter function public.profitability_foundation_v2_reject_immutable_change()
  owner to profitability_owner;

-- On replay, ACL drift is a hard error. Do not silently normalize an already
-- active installation. Fresh objects are normalized below because database
-- owner default privileges are not trusted.
do $profitability_foundation_v2_replay_acl_guard$
declare
  target_spec record;
  actual_privileges text[];
  expected_privileges text[];
  runtime_role_oid oid := (
    select oid
      from pg_roles
     where rolname = current_setting(
       'cleanzi.profitability_foundation_v2_runtime_role'
     )
  );
  owner_role_oid oid := (
    select oid
      from pg_roles
     where rolname = current_setting(
       'cleanzi.profitability_foundation_v2_owner_role'
     )
  );
  session_role_oid oid := (
    select oid
      from pg_roles
     where rolname = current_setting(
       'cleanzi.profitability_foundation_v2_session_role'
     )
  );
begin
  if current_setting(
       'cleanzi.profitability_foundation_v2_fresh_install'
     )::boolean then
    return;
  end if;

  for target_spec in
    select *
      from (values
        ('service_object', array['SELECT']::text[]),
        ('worker_cost_rate', array['INSERT', 'SELECT', 'UPDATE']::text[]),
        ('object_contract_version', array['INSERT', 'SELECT', 'UPDATE']::text[]),
        ('periodic_work', array['SELECT']::text[]),
        ('periodic_work_zone', array['SELECT']::text[]),
        ('object_equipment', array['INSERT', 'SELECT', 'UPDATE']::text[]),
        ('object_financial_entry', array['INSERT', 'SELECT']::text[]),
        ('financial_period', array['INSERT', 'SELECT', 'UPDATE']::text[]),
        ('profitability_snapshot', array['INSERT', 'SELECT']::text[]),
        ('profitability_audit', array['INSERT', 'SELECT']::text[])
      ) as expected(table_name, privilege_types)
  loop
    expected_privileges := target_spec.privilege_types;

    select array_agg(
             distinct privilege_row.privilege_type
             order by privilege_row.privilege_type
           )
      into actual_privileges
      from pg_class relation_row
      cross join lateral aclexplode(relation_row.relacl) privilege_row
     where relation_row.oid = format(
             'public.%I', target_spec.table_name
           )::regclass
       and privilege_row.grantee = runtime_role_oid
       and not privilege_row.is_grantable;

    if actual_privileges is distinct from expected_privileges then
      raise exception 'PROFITABILITY_FOUNDATION_V2_REPLAY_RUNTIME_ACL_MISMATCH:%',
        target_spec.table_name;
    end if;

    if exists (
      select 1
        from pg_class relation_row
        cross join lateral aclexplode(relation_row.relacl) privilege_row
       where relation_row.oid = format(
               'public.%I', target_spec.table_name
             )::regclass
         and (
           privilege_row.grantee not in (owner_role_oid, runtime_role_oid)
           or privilege_row.is_grantable
         )
    ) then
      raise exception 'PROFITABILITY_FOUNDATION_V2_REPLAY_DIRECT_ACL_EXCESS:%',
        target_spec.table_name;
    end if;

    if exists (
      select 1
        from pg_attribute attribute_row
       where attribute_row.attrelid = format(
               'public.%I', target_spec.table_name
             )::regclass
         and attribute_row.attnum > 0
         and not attribute_row.attisdropped
         and attribute_row.attacl is not null
         and exists (
           select 1
             from aclexplode(attribute_row.attacl) privilege_row
         )
    ) then
      raise exception 'PROFITABILITY_FOUNDATION_V2_REPLAY_COLUMN_ACL_EXCESS:%',
        target_spec.table_name;
    end if;
  end loop;

  if has_table_privilege(
       current_setting('cleanzi.profitability_foundation_v2_session_role'),
       'public.service_object',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     ) then
    raise exception 'PROFITABILITY_FOUNDATION_V2_REPLAY_SESSION_DIRECT_ACL_EXCESS';
  end if;
end
$profitability_foundation_v2_replay_acl_guard$;

do $profitability_foundation_v2_acl_apply$
declare
  target_name text;
  unexpected_grantee record;
  target_relation regclass;
  owner_role_oid oid := (
    select oid
      from pg_roles
     where rolname = current_setting(
       'cleanzi.profitability_foundation_v2_owner_role'
     )
  );
begin
  foreach target_name in array array[
    'service_object',
    'worker_cost_rate',
    'object_contract_version',
    'periodic_work',
    'periodic_work_zone',
    'object_equipment',
    'object_financial_entry',
    'financial_period',
    'profitability_snapshot',
    'profitability_audit'
  ] loop
    target_relation := format('public.%I', target_name)::regclass;

    execute format('revoke all privileges on table %s from public', target_relation);
    execute format(
      'revoke all privileges on table %s from %I',
      target_relation,
      current_setting('cleanzi.profitability_foundation_v2_runtime_role')
    );
    execute format(
      'revoke all privileges on table %s from %I',
      target_relation,
      current_setting('cleanzi.profitability_foundation_v2_session_role')
    );

    -- Remove any unexpected direct grant introduced by owner default ACLs.
    for unexpected_grantee in
      select distinct privilege_row.grantee,
             pg_get_userbyid(privilege_row.grantee) as role_name
        from pg_class relation_row
        cross join lateral aclexplode(relation_row.relacl) privilege_row
       where relation_row.oid = target_relation
         and privilege_row.grantee <> owner_role_oid
         and privilege_row.grantee <> 0
    loop
      execute format(
        'revoke all privileges on table %s from %I',
        target_relation,
        unexpected_grantee.role_name
      );
    end loop;
  end loop;
end
$profitability_foundation_v2_acl_apply$;

grant usage on schema public to profitability_runtime;

grant select on table
  public.service_object,
  public.periodic_work,
  public.periodic_work_zone
to profitability_runtime;

grant select, insert, update on table
  public.worker_cost_rate,
  public.object_contract_version,
  public.object_equipment,
  public.financial_period
to profitability_runtime;

grant select, insert on table
  public.object_financial_entry,
  public.profitability_snapshot,
  public.profitability_audit
to profitability_runtime;

revoke all privileges on sequence public.profitability_audit_audit_id_seq
  from public;
revoke all privileges on sequence public.profitability_audit_audit_id_seq
  from profitability_session;
revoke all privileges on sequence public.profitability_audit_audit_id_seq
  from profitability_runtime;
grant usage on sequence public.profitability_audit_audit_id_seq
  to profitability_runtime;

revoke all privileges on function
  public.profitability_foundation_v2_reject_immutable_change()
  from public;
revoke all privileges on function
  public.profitability_foundation_v2_reject_immutable_change()
  from profitability_session;
revoke all privileges on function
  public.profitability_foundation_v2_reject_immutable_change()
  from profitability_runtime;

-- PROFITABILITY_DOMAIN_FOUNDATION_V2_POSTFLIGHT_ACL_BARRIER

do $profitability_foundation_v2_security_postflight$
declare
  executor_role_name text := current_setting(
    'cleanzi.profitability_foundation_v2_expected_executor'
  );
  provisioner_role_name text := current_setting(
    'cleanzi.profitability_foundation_v2_provisioner'
  );
  bootstrap_grantor_name text := current_setting(
    'cleanzi.profitability_foundation_v2_bootstrap_grantor'
  );
  migration_runner_name text := current_setting(
    'cleanzi.profitability_foundation_v2_migration_runner'
  );
  owner_role_name text := current_setting(
    'cleanzi.profitability_foundation_v2_owner_role'
  );
  runtime_role_name text := current_setting(
    'cleanzi.profitability_foundation_v2_runtime_role'
  );
  session_role_name text := current_setting(
    'cleanzi.profitability_foundation_v2_session_role'
  );
  foundation_role_names text[];
  graph_role_names text[];
begin
  foundation_role_names := array[
    executor_role_name,
    migration_runner_name,
    owner_role_name,
    runtime_role_name,
    session_role_name
  ];
  graph_role_names := foundation_role_names || array[provisioner_role_name];

  if bootstrap_grantor_name <> pg_get_userbyid(10) then
    raise exception 'PROFITABILITY_FOUNDATION_V2_BOOTSTRAP_GRANTOR_MISMATCH';
  end if;

  -- A default ACL can silently re-grant privileges to every object created by
  -- the owner. Foundation requires an empty default-ACL surface and grants
  -- every runtime privilege explicitly below.
  if exists (
    select 1
      from pg_default_acl default_acl_row
      join pg_roles default_owner_row
        on default_owner_row.oid = default_acl_row.defaclrole
     where default_owner_row.rolname = any(array[
       executor_role_name,
       migration_runner_name,
       owner_role_name
     ])
       and default_acl_row.defaclobjtype in ('r', 'S', 'f')
  ) then
    raise exception 'PROFITABILITY_FOUNDATION_V2_DEFAULT_ACL_EXCESS';
  end if;

  if (
    select count(*)
      from pg_roles role_row
     where role_row.rolname = any(foundation_role_names)
       and not role_row.rolinherit
       and not role_row.rolsuper
       and not role_row.rolbypassrls
       and not role_row.rolcreaterole
       and not role_row.rolcreatedb
       and not role_row.rolreplication
       and role_row.rolcanlogin = (
         role_row.rolname in (executor_role_name, session_role_name)
       )
  ) <> 5 then
    raise exception 'PROFITABILITY_FOUNDATION_V2_ROLE_GRAPH_POSTFLIGHT_FAILED';
  end if;

  if not exists (
    select 1
      from pg_roles role_row
     where role_row.rolname = provisioner_role_name
       and role_row.rolcanlogin
       and not role_row.rolinherit
       and not role_row.rolsuper
       and not role_row.rolbypassrls
       and role_row.rolcreaterole
       and not role_row.rolcreatedb
       and not role_row.rolreplication
       and role_row.rolconnlimit = -1
       and role_row.rolvaliduntil is null
       and role_row.rolconfig is null
  ) then
    raise exception 'PROFITABILITY_FOUNDATION_V2_PROVISIONER_ROLE_INVALID';
  end if;

  if (
    select count(*)
      from pg_auth_members membership_row
      join pg_roles granted_role on granted_role.oid = membership_row.roleid
      join pg_roles member_role on member_role.oid = membership_row.member
     where granted_role.rolname = any(graph_role_names)
        or member_role.rolname = any(graph_role_names)
  ) <> 8 then
    raise exception 'PROFITABILITY_FOUNDATION_V2_ROLE_GRAPH_POSTFLIGHT_FAILED';
  end if;

  if (
    select count(*)
      from pg_auth_members membership_row
      join pg_roles granted_role on granted_role.oid = membership_row.roleid
      join pg_roles member_role on member_role.oid = membership_row.member
     where membership_row.grantor = (
             select oid from pg_roles where rolname = provisioner_role_name
           )
       and membership_row.set_option
       and not membership_row.inherit_option
       and not membership_row.admin_option
       and (
         (
           granted_role.rolname = migration_runner_name
           and member_role.rolname = executor_role_name
         )
         or (
           granted_role.rolname = owner_role_name
           and member_role.rolname = migration_runner_name
         )
         or (
           granted_role.rolname = runtime_role_name
           and member_role.rolname = session_role_name
         )
       )
  ) <> 3 then
    raise exception 'PROFITABILITY_FOUNDATION_V2_ROLE_GRAPH_POSTFLIGHT_FAILED';
  end if;

  if (
    select count(*)
      from pg_auth_members membership_row
      join pg_roles granted_role on granted_role.oid = membership_row.roleid
      join pg_roles member_role on member_role.oid = membership_row.member
     where granted_role.rolname = any(foundation_role_names)
       and member_role.rolname = provisioner_role_name
       and membership_row.grantor = 10::oid
       and membership_row.admin_option
       and not membership_row.inherit_option
       and not membership_row.set_option
  ) <> 5 then
    raise exception 'PROFITABILITY_FOUNDATION_V2_ROLE_GRAPH_POSTFLIGHT_FAILED';
  end if;

  if exists (
    select 1
      from pg_auth_members membership_row
      join pg_roles granted_role on granted_role.oid = membership_row.roleid
      join pg_roles member_role on member_role.oid = membership_row.member
     where (
       granted_role.rolname = any(graph_role_names)
       or member_role.rolname = any(graph_role_names)
     )
       and not (
         (
           membership_row.grantor = (
             select oid from pg_roles where rolname = provisioner_role_name
           )
           and membership_row.set_option
           and not membership_row.inherit_option
           and not membership_row.admin_option
           and (
             (
               granted_role.rolname = migration_runner_name
               and member_role.rolname = executor_role_name
             )
             or (
               granted_role.rolname = owner_role_name
               and member_role.rolname = migration_runner_name
             )
             or (
               granted_role.rolname = runtime_role_name
               and member_role.rolname = session_role_name
             )
           )
         )
         or (
           granted_role.rolname = any(foundation_role_names)
           and member_role.rolname = provisioner_role_name
           and membership_row.grantor = 10::oid
           and membership_row.admin_option
           and not membership_row.inherit_option
           and not membership_row.set_option
         )
       )
  ) then
    raise exception 'PROFITABILITY_FOUNDATION_V2_ROLE_GRAPH_POSTFLIGHT_FAILED';
  end if;
end
$profitability_foundation_v2_security_postflight$;

do $profitability_foundation_v2_column_postflight$
declare
  expected_column record;
  expected_table record;
begin
  for expected_column in
    select *
      from (values
        ('service_object', 'org_id', 'character varying', 64, 'NO', null::text, 'NO'),
        ('service_object', 'object_id', 'character varying', 64, 'NO', null, 'NO'),
        ('service_object', 'client_id', 'character varying', 64, 'NO', null, 'NO'),
        ('service_object', 'name', 'character varying', 180, 'NO', null, 'NO'),
        ('service_object', 'timezone', 'character varying', 80, 'NO', 'Europe/Warsaw', 'NO'),
        ('service_object', 'default_currency', 'character', 3, 'NO', 'PLN', 'NO'),
        ('service_object', 'status', 'character varying', 30, 'NO', 'ACTIVE', 'NO'),
        ('service_object', 'address', 'text', null, 'YES', null, 'NO'),
        ('service_object', 'city', 'character varying', 120, 'YES', null, 'NO'),
        ('service_object', 'postal_code', 'character varying', 20, 'YES', null, 'NO'),
        ('service_object', 'created_at', 'timestamp with time zone', null, 'NO', 'now()', 'NO'),
        ('service_object', 'created_by_uid', 'character varying', 128, 'YES', null, 'NO'),
        ('service_object', 'updated_at', 'timestamp with time zone', null, 'NO', 'now()', 'NO'),
        ('service_object', 'updated_by_uid', 'character varying', 128, 'YES', null, 'NO'),
        ('service_object', 'archived_at', 'timestamp with time zone', null, 'YES', null, 'NO'),
        ('service_object', 'archived_by_uid', 'character varying', 128, 'YES', null, 'NO'),

        ('worker_cost_rate', 'org_id', 'character varying', 64, 'NO', null, 'NO'),
        ('worker_cost_rate', 'object_id', 'character varying', 64, 'NO', null, 'NO'),
        ('worker_cost_rate', 'rate_id', 'character varying', 64, 'NO', null, 'NO'),
        ('worker_cost_rate', 'worker_login', 'character varying', 80, 'NO', null, 'NO'),
        ('worker_cost_rate', 'hourly_cost_minor', 'bigint', null, 'NO', null, 'NO'),
        ('worker_cost_rate', 'currency', 'character', 3, 'NO', null, 'NO'),
        ('worker_cost_rate', 'effective_from', 'date', null, 'NO', null, 'NO'),
        ('worker_cost_rate', 'effective_to', 'date', null, 'YES', null, 'NO'),
        ('worker_cost_rate', 'source', 'character varying', 32, 'NO', 'MANUAL', 'NO'),
        ('worker_cost_rate', 'change_reason', 'text', null, 'YES', null, 'NO'),
        ('worker_cost_rate', 'created_at', 'timestamp with time zone', null, 'NO', 'now()', 'NO'),
        ('worker_cost_rate', 'created_by_uid', 'character varying', 128, 'NO', null, 'NO'),
        ('worker_cost_rate', 'archived_at', 'timestamp with time zone', null, 'YES', null, 'NO'),
        ('worker_cost_rate', 'archived_by_uid', 'character varying', 128, 'YES', null, 'NO'),

        ('object_contract_version', 'org_id', 'character varying', 64, 'NO', null, 'NO'),
        ('object_contract_version', 'object_id', 'character varying', 64, 'NO', null, 'NO'),
        ('object_contract_version', 'contract_version_id', 'character varying', 64, 'NO', null, 'NO'),
        ('object_contract_version', 'contract_number', 'character varying', 120, 'YES', null, 'NO'),
        ('object_contract_version', 'contract_name', 'character varying', 180, 'YES', null, 'NO'),
        ('object_contract_version', 'billing_model', 'character varying', 32, 'NO', null, 'NO'),
        ('object_contract_version', 'monthly_value_minor', 'bigint', null, 'YES', null, 'NO'),
        ('object_contract_version', 'hourly_rate_minor', 'bigint', null, 'YES', null, 'NO'),
        ('object_contract_version', 'service_rate_minor', 'bigint', null, 'YES', null, 'NO'),
        ('object_contract_version', 'currency', 'character', 3, 'NO', 'PLN', 'NO'),
        ('object_contract_version', 'vat_rate_bps', 'integer', null, 'YES', null, 'NO'),
        ('object_contract_version', 'target_profitability_bps', 'integer', null, 'YES', null, 'NO'),
        ('object_contract_version', 'effective_from', 'date', null, 'NO', null, 'NO'),
        ('object_contract_version', 'effective_to', 'date', null, 'YES', null, 'NO'),
        ('object_contract_version', 'source', 'character varying', 32, 'NO', 'MANUAL', 'NO'),
        ('object_contract_version', 'change_reason', 'text', null, 'YES', null, 'NO'),
        ('object_contract_version', 'created_at', 'timestamp with time zone', null, 'NO', 'now()', 'NO'),
        ('object_contract_version', 'created_by_uid', 'character varying', 128, 'NO', null, 'NO'),
        ('object_contract_version', 'archived_at', 'timestamp with time zone', null, 'YES', null, 'NO'),
        ('object_contract_version', 'archived_by_uid', 'character varying', 128, 'YES', null, 'NO'),

        ('periodic_work', 'org_id', 'character varying', 64, 'NO', null, 'NO'),
        ('periodic_work', 'object_id', 'character varying', 64, 'NO', null, 'NO'),
        ('periodic_work', 'periodic_work_id', 'character varying', 64, 'NO', null, 'NO'),
        ('periodic_work', 'task_id', 'character varying', 180, 'YES', null, 'NO'),
        ('periodic_work', 'name', 'character varying', 180, 'NO', null, 'NO'),
        ('periodic_work', 'work_type', 'character varying', 60, 'NO', null, 'NO'),
        ('periodic_work', 'status', 'character varying', 30, 'NO', null, 'NO'),
        ('periodic_work', 'planned_on', 'date', null, 'YES', null, 'NO'),
        ('periodic_work', 'executed_on', 'date', null, 'YES', null, 'NO'),
        ('periodic_work', 'planned_minutes', 'integer', null, 'YES', null, 'NO'),
        ('periodic_work', 'actual_minutes', 'integer', null, 'YES', null, 'NO'),
        ('periodic_work', 'description', 'text', null, 'YES', null, 'NO'),
        ('periodic_work', 'created_at', 'timestamp with time zone', null, 'NO', 'now()', 'NO'),
        ('periodic_work', 'created_by_uid', 'character varying', 128, 'NO', null, 'NO'),
        ('periodic_work', 'updated_at', 'timestamp with time zone', null, 'NO', 'now()', 'NO'),
        ('periodic_work', 'updated_by_uid', 'character varying', 128, 'YES', null, 'NO'),
        ('periodic_work', 'archived_at', 'timestamp with time zone', null, 'YES', null, 'NO'),
        ('periodic_work', 'archived_by_uid', 'character varying', 128, 'YES', null, 'NO'),

        ('periodic_work_zone', 'org_id', 'character varying', 64, 'NO', null, 'NO'),
        ('periodic_work_zone', 'object_id', 'character varying', 64, 'NO', null, 'NO'),
        ('periodic_work_zone', 'periodic_work_id', 'character varying', 64, 'NO', null, 'NO'),
        ('periodic_work_zone', 'zone_id', 'character varying', 64, 'NO', null, 'NO'),

        ('object_equipment', 'org_id', 'character varying', 64, 'NO', null, 'NO'),
        ('object_equipment', 'object_id', 'character varying', 64, 'NO', null, 'NO'),
        ('object_equipment', 'equipment_id', 'character varying', 64, 'NO', null, 'NO'),
        ('object_equipment', 'name', 'character varying', 180, 'NO', null, 'NO'),
        ('object_equipment', 'category', 'character varying', 80, 'YES', null, 'NO'),
        ('object_equipment', 'inventory_number', 'character varying', 120, 'YES', null, 'NO'),
        ('object_equipment', 'financing', 'character varying', 20, 'NO', null, 'NO'),
        ('object_equipment', 'recognition_method', 'character varying', 20, 'NO', null, 'NO'),
        ('object_equipment', 'purchase_value_minor', 'bigint', null, 'YES', null, 'NO'),
        ('object_equipment', 'depreciation_months', 'integer', null, 'YES', null, 'NO'),
        ('object_equipment', 'monthly_installment_minor', 'bigint', null, 'YES', null, 'NO'),
        ('object_equipment', 'currency', 'character', 3, 'NO', 'PLN', 'NO'),
        ('object_equipment', 'started_on', 'date', null, 'NO', null, 'NO'),
        ('object_equipment', 'ended_on', 'date', null, 'YES', null, 'NO'),
        ('object_equipment', 'created_at', 'timestamp with time zone', null, 'NO', 'now()', 'NO'),
        ('object_equipment', 'created_by_uid', 'character varying', 128, 'NO', null, 'NO'),
        ('object_equipment', 'updated_at', 'timestamp with time zone', null, 'NO', 'now()', 'NO'),
        ('object_equipment', 'updated_by_uid', 'character varying', 128, 'YES', null, 'NO'),
        ('object_equipment', 'archived_at', 'timestamp with time zone', null, 'YES', null, 'NO'),
        ('object_equipment', 'archived_by_uid', 'character varying', 128, 'YES', null, 'NO'),

        ('object_financial_entry', 'org_id', 'character varying', 64, 'NO', null, 'NO'),
        ('object_financial_entry', 'object_id', 'character varying', 64, 'NO', null, 'NO'),
        ('object_financial_entry', 'entry_id', 'character varying', 64, 'NO', null, 'NO'),
        ('object_financial_entry', 'periodic_work_id', 'character varying', 64, 'YES', null, 'NO'),
        ('object_financial_entry', 'equipment_id', 'character varying', 64, 'YES', null, 'NO'),
        ('object_financial_entry', 'entry_group', 'character varying', 32, 'NO', null, 'NO'),
        ('object_financial_entry', 'category', 'character varying', 80, 'NO', null, 'NO'),
        ('object_financial_entry', 'name', 'character varying', 180, 'NO', null, 'NO'),
        ('object_financial_entry', 'amount_minor', 'bigint', null, 'NO', null, 'NO'),
        ('object_financial_entry', 'currency', 'character', 3, 'NO', 'PLN', 'NO'),
        ('object_financial_entry', 'occurred_on', 'date', null, 'YES', null, 'NO'),
        ('object_financial_entry', 'period_start', 'date', null, 'YES', null, 'NO'),
        ('object_financial_entry', 'period_end', 'date', null, 'YES', null, 'NO'),
        ('object_financial_entry', 'recurrence', 'character varying', 24, 'NO', null, 'NO'),
        ('object_financial_entry', 'source', 'character varying', 24, 'NO', 'MANUAL', 'NO'),
        ('object_financial_entry', 'source_reference', 'character varying', 180, 'YES', null, 'NO'),
        ('object_financial_entry', 'description', 'text', null, 'YES', null, 'NO'),
        ('object_financial_entry', 'document_reference', 'text', null, 'YES', null, 'NO'),
        ('object_financial_entry', 'status', 'character varying', 20, 'NO', 'POSTED', 'NO'),
        ('object_financial_entry', 'created_at', 'timestamp with time zone', null, 'NO', 'now()', 'NO'),
        ('object_financial_entry', 'created_by_uid', 'character varying', 128, 'NO', null, 'NO'),
        ('object_financial_entry', 'updated_at', 'timestamp with time zone', null, 'NO', 'now()', 'NO'),
        ('object_financial_entry', 'updated_by_uid', 'character varying', 128, 'YES', null, 'NO'),
        ('object_financial_entry', 'archived_at', 'timestamp with time zone', null, 'YES', null, 'NO'),
        ('object_financial_entry', 'archived_by_uid', 'character varying', 128, 'YES', null, 'NO'),

        ('financial_period', 'org_id', 'character varying', 64, 'NO', null, 'NO'),
        ('financial_period', 'object_id', 'character varying', 64, 'NO', null, 'NO'),
        ('financial_period', 'period_id', 'character varying', 64, 'NO', null, 'NO'),
        ('financial_period', 'period_start', 'date', null, 'NO', null, 'NO'),
        ('financial_period', 'period_end', 'date', null, 'NO', null, 'NO'),
        ('financial_period', 'currency', 'character', 3, 'NO', null, 'NO'),
        ('financial_period', 'status', 'character varying', 20, 'NO', 'OPEN', 'NO'),
        ('financial_period', 'version', 'integer', null, 'NO', '1', 'NO'),
        ('financial_period', 'created_at', 'timestamp with time zone', null, 'NO', 'now()', 'NO'),
        ('financial_period', 'created_by_uid', 'character varying', 128, 'NO', null, 'NO'),
        ('financial_period', 'updated_at', 'timestamp with time zone', null, 'NO', 'now()', 'NO'),
        ('financial_period', 'closed_at', 'timestamp with time zone', null, 'YES', null, 'NO'),
        ('financial_period', 'closed_by_uid', 'character varying', 128, 'YES', null, 'NO'),

        ('profitability_snapshot', 'org_id', 'character varying', 64, 'NO', null, 'NO'),
        ('profitability_snapshot', 'object_id', 'character varying', 64, 'NO', null, 'NO'),
        ('profitability_snapshot', 'snapshot_id', 'character varying', 64, 'NO', null, 'NO'),
        ('profitability_snapshot', 'period_id', 'character varying', 64, 'NO', null, 'NO'),
        ('profitability_snapshot', 'correction_of_snapshot_id', 'character varying', 64, 'YES', null, 'NO'),
        ('profitability_snapshot', 'calculation_status', 'character varying', 32, 'NO', null, 'NO'),
        ('profitability_snapshot', 'currency', 'character', 3, 'NO', null, 'NO'),
        ('profitability_snapshot', 'revenue_minor', 'bigint', null, 'NO', null, 'NO'),
        ('profitability_snapshot', 'total_cost_minor', 'bigint', null, 'YES', null, 'NO'),
        ('profitability_snapshot', 'margin_minor', 'bigint', null, 'YES', null, 'NO'),
        ('profitability_snapshot', 'profitability_bps', 'bigint', null, 'YES', null, 'NO'),
        ('profitability_snapshot', 'completeness_bps', 'integer', null, 'NO', null, 'NO'),
        ('profitability_snapshot', 'payload', 'jsonb', null, 'NO', null, 'NO'),
        ('profitability_snapshot', 'data_version', 'character varying', 32, 'NO', null, 'NO'),
        ('profitability_snapshot', 'calculated_at', 'timestamp with time zone', null, 'NO', null, 'NO'),
        ('profitability_snapshot', 'created_at', 'timestamp with time zone', null, 'NO', 'now()', 'NO'),
        ('profitability_snapshot', 'created_by_uid', 'character varying', 128, 'NO', null, 'NO'),

        ('profitability_audit', 'org_id', 'character varying', 64, 'NO', null, 'NO'),
        ('profitability_audit', 'object_id', 'character varying', 64, 'NO', null, 'NO'),
        ('profitability_audit', 'audit_id', 'bigint', null, 'NO', null, 'YES'),
        ('profitability_audit', 'entity_type', 'character varying', 80, 'NO', null, 'NO'),
        ('profitability_audit', 'entity_id', 'character varying', 128, 'NO', null, 'NO'),
        ('profitability_audit', 'action', 'character varying', 60, 'NO', null, 'NO'),
        ('profitability_audit', 'actor_uid', 'character varying', 128, 'NO', null, 'NO'),
        ('profitability_audit', 'source', 'character varying', 32, 'NO', null, 'NO'),
        ('profitability_audit', 'reason', 'text', null, 'YES', null, 'NO'),
        ('profitability_audit', 'previous_value', 'jsonb', null, 'YES', null, 'NO'),
        ('profitability_audit', 'new_value', 'jsonb', null, 'YES', null, 'NO'),
        ('profitability_audit', 'created_at', 'timestamp with time zone', null, 'NO', 'now()', 'NO')
      ) as expected(
        table_name,
        column_name,
        data_type,
        maximum_length,
        nullable,
        default_token,
        is_identity
      )
  loop
    if not exists (
      select 1
        from information_schema.columns column_row
       where column_row.table_schema = 'public'
         and column_row.table_name = expected_column.table_name
         and column_row.column_name = expected_column.column_name
         and column_row.data_type = expected_column.data_type
         and column_row.character_maximum_length
             is not distinct from expected_column.maximum_length
         and column_row.is_nullable = expected_column.nullable
         and column_row.is_identity = expected_column.is_identity
         and (
           (
             expected_column.default_token is null
             and column_row.column_default is null
           )
           or (
             expected_column.default_token is not null
             and position(
               lower(expected_column.default_token)
               in lower(coalesce(column_row.column_default, ''))
             ) > 0
           )
         )
    ) then
      raise exception 'PROFITABILITY_FOUNDATION_V2_COLUMN_POSTFLIGHT_FAILED:%.%',
        expected_column.table_name,
        expected_column.column_name;
    end if;
  end loop;

  for expected_table in
    select *
      from (values
        ('service_object', 16),
        ('worker_cost_rate', 14),
        ('object_contract_version', 20),
        ('periodic_work', 18),
        ('periodic_work_zone', 4),
        ('object_equipment', 20),
        ('object_financial_entry', 25),
        ('financial_period', 13),
        ('profitability_snapshot', 17),
        ('profitability_audit', 12)
      ) as expected(table_name, column_count)
  loop
    if (
      select count(*)
        from information_schema.columns column_row
       where column_row.table_schema = 'public'
         and column_row.table_name = expected_table.table_name
    ) <> expected_table.column_count then
      raise exception 'PROFITABILITY_FOUNDATION_V2_COLUMN_COUNT_MISMATCH:%',
        expected_table.table_name;
    end if;
  end loop;

  if not exists (
    select 1
      from information_schema.columns column_row
     where column_row.table_schema = 'public'
       and column_row.table_name = 'profitability_audit'
       and column_row.column_name = 'audit_id'
       and column_row.identity_generation = 'ALWAYS'
  ) then
    raise exception 'PROFITABILITY_FOUNDATION_V2_AUDIT_IDENTITY_MISMATCH';
  end if;
end
$profitability_foundation_v2_column_postflight$;

do $profitability_foundation_v2_constraint_postflight$
declare
  expected_constraint record;
  expected_table record;
  actual_definition text;
begin
  for expected_constraint in
    select *
      from (values
        ('service_object', 'service_object_pkey', 'p', array['primarykey(org_id,object_id)']::text[]),
        ('service_object', 'service_object_org_object_client_key', 'u', array['unique(org_id,object_id,client_id)']::text[]),
        ('service_object', 'service_object_org_fk', 'f', array['foreignkey(org_id)', 'referencesorganizations(org_id)']::text[]),
        ('service_object', 'service_object_client_fk', 'f', array['foreignkey(org_id,client_id)', 'referencesclient(org_id,client_id)']::text[]),
        ('service_object', 'service_object_currency_check', 'c', array['default_currency', '^[a-z]{3}$']::text[]),
        ('service_object', 'service_object_status_check', 'c', array['status', 'active', 'inactive', 'archived']::text[]),

        ('worker_cost_rate', 'worker_cost_rate_pkey', 'p', array['primarykey(org_id,object_id,rate_id)']::text[]),
        ('worker_cost_rate', 'worker_cost_rate_object_fk', 'f', array['foreignkey(org_id,object_id)', 'referencesservice_object(org_id,object_id)']::text[]),
        ('worker_cost_rate', 'worker_cost_rate_worker_fk', 'f', array['foreignkey(org_id,worker_login)', 'referencesworker(org_id,login)']::text[]),
        ('worker_cost_rate', 'worker_cost_rate_amount_check', 'c', array['hourly_cost_minor', '>=0']::text[]),
        ('worker_cost_rate', 'worker_cost_rate_currency_check', 'c', array['currency', '^[a-z]{3}$']::text[]),
        ('worker_cost_rate', 'worker_cost_rate_validity_check', 'c', array['effective_to', 'effective_from']::text[]),
        ('worker_cost_rate', 'worker_cost_rate_source_check', 'c', array['source', 'manual', 'correction']::text[]),
        ('worker_cost_rate', 'worker_cost_rate_no_overlap', 'x', array['excludeusinggist', 'org_idwith=', 'object_idwith=', 'worker_loginwith=', 'daterange', 'archived_atisnull']::text[]),

        ('object_contract_version', 'object_contract_version_pkey', 'p', array['primarykey(org_id,object_id,contract_version_id)']::text[]),
        ('object_contract_version', 'object_contract_version_object_fk', 'f', array['foreignkey(org_id,object_id)', 'referencesservice_object(org_id,object_id)']::text[]),
        ('object_contract_version', 'object_contract_version_billing_model_check', 'c', array['billing_model', 'monthly_fixed', 'per_service', 'mixed']::text[]),
        ('object_contract_version', 'object_contract_version_monthly_value_check', 'c', array['monthly_value_minor', '>=0']::text[]),
        ('object_contract_version', 'object_contract_version_hourly_rate_check', 'c', array['hourly_rate_minor', '>=0']::text[]),
        ('object_contract_version', 'object_contract_version_service_rate_check', 'c', array['service_rate_minor', '>=0']::text[]),
        ('object_contract_version', 'object_contract_version_currency_check', 'c', array['currency', '^[a-z]{3}$']::text[]),
        ('object_contract_version', 'object_contract_version_vat_rate_check', 'c', array['vat_rate_bps', '10000']::text[]),
        ('object_contract_version', 'object_contract_version_target_check', 'c', array['target_profitability_bps', '-100000', '10000']::text[]),
        ('object_contract_version', 'object_contract_version_validity_check', 'c', array['effective_to', 'effective_from']::text[]),
        ('object_contract_version', 'object_contract_version_value_check', 'c', array['monthly_value_minor', 'hourly_rate_minor', 'service_rate_minor']::text[]),
        ('object_contract_version', 'object_contract_version_source_check', 'c', array['source', 'manual', 'correction']::text[]),
        ('object_contract_version', 'object_contract_version_no_overlap', 'x', array['excludeusinggist', 'org_idwith=', 'object_idwith=', 'daterange', 'archived_atisnull']::text[]),

        ('periodic_work', 'periodic_work_pkey', 'p', array['primarykey(org_id,object_id,periodic_work_id)']::text[]),
        ('periodic_work', 'periodic_work_object_fk', 'f', array['foreignkey(org_id,object_id)', 'referencesservice_object(org_id,object_id)']::text[]),
        ('periodic_work', 'periodic_work_task_fk', 'f', array['foreignkey(org_id,task_id)', 'referencestask(org_id,id_task)']::text[]),
        ('periodic_work', 'periodic_work_type_check', 'c', array['work_type', 'window_cleaning', 'intervention', 'other']::text[]),
        ('periodic_work', 'periodic_work_status_check', 'c', array['status', 'planned', 'completed', 'cancelled']::text[]),
        ('periodic_work', 'periodic_work_planned_minutes_check', 'c', array['planned_minutes', '>=0']::text[]),
        ('periodic_work', 'periodic_work_actual_minutes_check', 'c', array['actual_minutes', '>=0']::text[]),

        ('periodic_work_zone', 'periodic_work_zone_pkey', 'p', array['primarykey(org_id,object_id,periodic_work_id,zone_id)']::text[]),
        ('periodic_work_zone', 'periodic_work_zone_periodic_work_fk', 'f', array['foreignkey(org_id,object_id,periodic_work_id)', 'referencesperiodic_work(org_id,object_id,periodic_work_id)']::text[]),
        ('periodic_work_zone', 'periodic_work_zone_zone_fk', 'f', array['foreignkey(org_id,zone_id)', 'referenceszone(org_id,id)']::text[]),

        ('object_equipment', 'object_equipment_pkey', 'p', array['primarykey(org_id,object_id,equipment_id)']::text[]),
        ('object_equipment', 'object_equipment_object_fk', 'f', array['foreignkey(org_id,object_id)', 'referencesservice_object(org_id,object_id)']::text[]),
        ('object_equipment', 'object_equipment_financing_check', 'c', array['financing', 'purchase', 'lease', 'rental']::text[]),
        ('object_equipment', 'object_equipment_recognition_check', 'c', array['recognition_method', 'immediate', 'depreciation', 'installment']::text[]),
        ('object_equipment', 'object_equipment_purchase_value_check', 'c', array['purchase_value_minor', '>=0']::text[]),
        ('object_equipment', 'object_equipment_installment_check', 'c', array['monthly_installment_minor', '>=0']::text[]),
        ('object_equipment', 'object_equipment_depreciation_check', 'c', array['depreciation_months', '>0']::text[]),
        ('object_equipment', 'object_equipment_currency_check', 'c', array['currency', '^[a-z]{3}$']::text[]),
        ('object_equipment', 'object_equipment_validity_check', 'c', array['ended_on', 'started_on']::text[]),
        ('object_equipment', 'object_equipment_model_check', 'c', array['financing', 'recognition_method', 'purchase_value_minor', 'monthly_installment_minor']::text[]),

        ('object_financial_entry', 'object_financial_entry_pkey', 'p', array['primarykey(org_id,object_id,entry_id)']::text[]),
        ('object_financial_entry', 'object_financial_entry_object_fk', 'f', array['foreignkey(org_id,object_id)', 'referencesservice_object(org_id,object_id)']::text[]),
        ('object_financial_entry', 'object_financial_entry_periodic_work_fk', 'f', array['foreignkey(org_id,object_id,periodic_work_id)', 'referencesperiodic_work(org_id,object_id,periodic_work_id)']::text[]),
        ('object_financial_entry', 'object_financial_entry_equipment_fk', 'f', array['foreignkey(org_id,object_id,equipment_id)', 'referencesobject_equipment(org_id,object_id,equipment_id)']::text[]),
        ('object_financial_entry', 'object_financial_entry_group_check', 'c', array['entry_group', 'revenue', 'shared_allocation']::text[]),
        ('object_financial_entry', 'object_financial_entry_amount_check', 'c', array['amount_minor', '>=0']::text[]),
        ('object_financial_entry', 'object_financial_entry_currency_check', 'c', array['currency', '^[a-z]{3}$']::text[]),
        ('object_financial_entry', 'object_financial_entry_recurrence_check', 'c', array['recurrence', 'one_time', 'actual_usage']::text[]),
        ('object_financial_entry', 'object_financial_entry_source_check', 'c', array['source', 'manual', 'correction']::text[]),
        ('object_financial_entry', 'object_financial_entry_status_check', 'c', array['status', 'draft', 'posted', 'void', 'corrected']::text[]),
        ('object_financial_entry', 'object_financial_entry_date_check', 'c', array['recurrence', 'occurred_on', 'period_start']::text[]),
        ('object_financial_entry', 'object_financial_entry_period_check', 'c', array['period_end', 'period_start']::text[]),

        ('financial_period', 'financial_period_pkey', 'p', array['primarykey(org_id,object_id,period_id)']::text[]),
        ('financial_period', 'financial_period_object_fk', 'f', array['foreignkey(org_id,object_id)', 'referencesservice_object(org_id,object_id)']::text[]),
        ('financial_period', 'financial_period_dates_check', 'c', array['period_end', 'period_start']::text[]),
        ('financial_period', 'financial_period_currency_check', 'c', array['currency', '^[a-z]{3}$']::text[]),
        ('financial_period', 'financial_period_status_check', 'c', array['status', 'open', 'corrected', 'archived']::text[]),
        ('financial_period', 'financial_period_version_check', 'c', array['version', '>0']::text[]),
        ('financial_period', 'financial_period_no_overlap', 'x', array['excludeusinggist', 'org_idwith=', 'object_idwith=', 'daterange', 'status', 'archived']::text[]),

        ('profitability_snapshot', 'profitability_snapshot_pkey', 'p', array['primarykey(org_id,object_id,snapshot_id)']::text[]),
        ('profitability_snapshot', 'profitability_snapshot_period_snapshot_key', 'u', array['unique(org_id,object_id,period_id,snapshot_id)']::text[]),
        ('profitability_snapshot', 'profitability_snapshot_period_fk', 'f', array['foreignkey(org_id,object_id,period_id)', 'referencesfinancial_period(org_id,object_id,period_id)']::text[]),
        ('profitability_snapshot', 'profitability_snapshot_correction_fk', 'f', array['foreignkey(org_id,object_id,period_id,correction_of_snapshot_id)', 'referencesprofitability_snapshot(org_id,object_id,period_id,snapshot_id)']::text[]),
        ('profitability_snapshot', 'profitability_snapshot_currency_check', 'c', array['currency', '^[a-z]{3}$']::text[]),
        ('profitability_snapshot', 'profitability_snapshot_completeness_check', 'c', array['completeness_bps', '10000']::text[]),
        ('profitability_snapshot', 'profitability_snapshot_status_check', 'c', array['calculation_status', 'above_target', 'not_calculable']::text[]),
        ('profitability_snapshot', 'profitability_snapshot_incomplete_check', 'c', array['calculation_status', 'incomplete', 'total_cost_minor', 'margin_minor', 'profitability_bps']::text[]),

        ('profitability_audit', 'profitability_audit_pkey', 'p', array['primarykey(org_id,object_id,audit_id)']::text[]),
        ('profitability_audit', 'profitability_audit_object_fk', 'f', array['foreignkey(org_id,object_id)', 'referencesservice_object(org_id,object_id)']::text[]),
        ('profitability_audit', 'profitability_audit_source_check', 'c', array['source', 'portal', 'backend_calculation', 'correction']::text[])
      ) as expected(
        table_name,
        constraint_name,
        constraint_type,
        definition_tokens
      )
  loop
    select regexp_replace(
             replace(
               replace(
                 lower(pg_get_constraintdef(constraint_row.oid, true)),
                 'public.',
                 ''
               ),
               '"',
               ''
             ),
             '\s+',
             '',
             'g'
           )
      into actual_definition
      from pg_constraint constraint_row
     where constraint_row.conrelid = format(
             'public.%I', expected_constraint.table_name
           )::regclass
       and constraint_row.conname = expected_constraint.constraint_name
       and constraint_row.contype::text = expected_constraint.constraint_type
       and constraint_row.convalidated is true;

    if actual_definition is null or exists (
      select 1
        from unnest(expected_constraint.definition_tokens) required_token
       where position(lower(required_token) in actual_definition) = 0
    ) then
      raise exception 'PROFITABILITY_FOUNDATION_V2_CONSTRAINT_POSTFLIGHT_FAILED:%.%',
        expected_constraint.table_name,
        expected_constraint.constraint_name;
    end if;
  end loop;

  for expected_table in
    select *
      from (values
        ('service_object', 6),
        ('worker_cost_rate', 8),
        ('object_contract_version', 13),
        ('periodic_work', 7),
        ('periodic_work_zone', 3),
        ('object_equipment', 10),
        ('object_financial_entry', 12),
        ('financial_period', 7),
        ('profitability_snapshot', 8),
        ('profitability_audit', 3)
      ) as expected(table_name, constraint_count)
  loop
    if (
      select count(*)
        from pg_constraint constraint_row
       where constraint_row.conrelid = format(
               'public.%I', expected_table.table_name
             )::regclass
    ) <> expected_table.constraint_count then
      raise exception 'PROFITABILITY_FOUNDATION_V2_CONSTRAINT_COUNT_MISMATCH:%',
        expected_table.table_name;
    end if;
  end loop;
end
$profitability_foundation_v2_constraint_postflight$;

do $profitability_foundation_v2_index_postflight$
declare
  expected_index record;
  actual_definition text;
  actual_predicate text;
begin
  for expected_index in
    select *
      from (values
        (
          'service_object',
          'service_object_org_client_idx',
          array['org_id,client_id,status']::text[],
          array['archived_atisnull']::text[]
        ),
        (
          'worker_cost_rate',
          'worker_cost_rate_lookup_idx',
          array['org_id,object_id,worker_login,effective_from,effective_to']::text[],
          array['archived_atisnull']::text[]
        ),
        (
          'periodic_work',
          'periodic_work_period_idx',
          array['org_id,object_id,executed_on,planned_on']::text[],
          array['archived_atisnull']::text[]
        ),
        (
          'object_financial_entry',
          'object_financial_entry_period_idx',
          array['org_id,object_id,entry_group,occurred_on,period_start,period_end']::text[],
          array[
            'archived_atisnull',
            '(status)::text=',
            '''posted''::text'
          ]::text[]
        ),
        (
          'profitability_snapshot',
          'profitability_snapshot_period_idx',
          array['org_id,object_id,period_id,calculated_atdesc']::text[],
          array[]::text[]
        ),
        (
          'profitability_audit',
          'profitability_audit_entity_idx',
          array['org_id,object_id,entity_type,entity_id,created_atdesc']::text[],
          array[]::text[]
        )
      ) as expected(
        table_name,
        index_name,
        definition_tokens,
        predicate_tokens
      )
  loop
    select regexp_replace(
             replace(
               replace(lower(pg_get_indexdef(index_meta.indexrelid)), 'public.', ''),
               '"',
               ''
             ),
             '\s+',
             '',
             'g'
           ),
           regexp_replace(
             replace(
               lower(coalesce(
                 pg_get_expr(index_meta.indpred, index_meta.indrelid),
                 ''
               )),
               '"',
               ''
             ),
             '\s+',
             '',
             'g'
           )
      into actual_definition, actual_predicate
      from pg_index index_meta
      join pg_class index_row on index_row.oid = index_meta.indexrelid
      join pg_class relation_row on relation_row.oid = index_meta.indrelid
      join pg_namespace namespace_row on namespace_row.oid = index_row.relnamespace
     where namespace_row.nspname = 'public'
       and relation_row.relname = expected_index.table_name
       and index_row.relname = expected_index.index_name
       and not index_meta.indisunique
       and index_meta.indisvalid is true
       and index_meta.indisready is true;

    if actual_definition is null or exists (
      select 1
        from unnest(expected_index.definition_tokens) required_token
       where position(lower(required_token) in actual_definition) = 0
    ) or exists (
      select 1
        from unnest(expected_index.predicate_tokens) required_token
       where position(lower(required_token) in actual_predicate) = 0
    ) then
      raise exception 'PROFITABILITY_FOUNDATION_V2_INDEX_POSTFLIGHT_FAILED:%',
        expected_index.index_name;
    end if;
  end loop;

  if (
    select count(*)
      from pg_index index_meta
      join pg_class index_row on index_row.oid = index_meta.indexrelid
      join pg_class relation_row on relation_row.oid = index_meta.indrelid
      join pg_namespace namespace_row on namespace_row.oid = index_row.relnamespace
      left join pg_constraint constraint_row
        on constraint_row.conindid = index_meta.indexrelid
     where namespace_row.nspname = 'public'
       and relation_row.relname = any(array[
         'service_object',
         'worker_cost_rate',
         'object_contract_version',
         'periodic_work',
         'periodic_work_zone',
         'object_equipment',
         'object_financial_entry',
         'financial_period',
         'profitability_snapshot',
         'profitability_audit'
       ])
       and constraint_row.oid is null
  ) <> 6 then
    raise exception 'PROFITABILITY_FOUNDATION_V2_NONCONSTRAINT_INDEX_COUNT_MISMATCH';
  end if;

  if exists (
    select 1
      from pg_constraint constraint_row
      join pg_index index_meta on index_meta.indexrelid = constraint_row.conindid
     where constraint_row.conrelid = any(array[
       'public.service_object'::regclass,
       'public.worker_cost_rate'::regclass,
       'public.object_contract_version'::regclass,
       'public.periodic_work'::regclass,
       'public.periodic_work_zone'::regclass,
       'public.object_equipment'::regclass,
       'public.object_financial_entry'::regclass,
       'public.financial_period'::regclass,
       'public.profitability_snapshot'::regclass,
       'public.profitability_audit'::regclass
     ])
       and constraint_row.contype in ('p', 'u', 'x')
       and (
         not index_meta.indisvalid
         or not index_meta.indisready
       )
  ) then
    raise exception 'PROFITABILITY_FOUNDATION_V2_CONSTRAINT_INDEX_NOT_READY';
  end if;
end
$profitability_foundation_v2_index_postflight$;

do $profitability_foundation_v2_function_trigger_postflight$
declare
  expected_trigger record;
  actual_definition text;
  actual_tgtype smallint;
  immutable_function_oid oid := to_regprocedure(
    'public.profitability_foundation_v2_reject_immutable_change()'
  );
begin
  if immutable_function_oid is null or not exists (
    select 1
      from pg_proc function_row
      join pg_roles owner_row on owner_row.oid = function_row.proowner
      join pg_language language_row on language_row.oid = function_row.prolang
     where function_row.oid = immutable_function_oid
       and owner_row.rolname = 'profitability_owner'
       and language_row.lanname = 'plpgsql'
       and function_row.prorettype = 'trigger'::regtype
       and not function_row.prosecdef
       and function_row.provolatile = 'v'
       and array_position(
             function_row.proconfig,
             'search_path=pg_catalog, public'
           ) is not null
       and position('raise exception' in lower(function_row.prosrc)) > 0
       and position('55000' in function_row.prosrc) > 0
  ) then
    raise exception 'PROFITABILITY_FOUNDATION_V2_IMMUTABLE_FUNCTION_MISMATCH';
  end if;

  for expected_trigger in
    select *
      from (values
        ('profitability_snapshot', 'profitability_snapshot_immutable_v2', 27::smallint),
        ('profitability_audit', 'profitability_audit_immutable_v2', 27::smallint),
        ('worker_cost_rate', 'worker_cost_rate_no_hard_delete_v2', 11::smallint),
        ('object_contract_version', 'object_contract_version_no_hard_delete_v2', 11::smallint),
        ('periodic_work', 'periodic_work_no_hard_delete_v2', 11::smallint),
        ('object_equipment', 'object_equipment_no_hard_delete_v2', 11::smallint),
        ('object_financial_entry', 'object_financial_entry_no_hard_delete_v2', 11::smallint),
        ('financial_period', 'financial_period_no_hard_delete_v2', 11::smallint)
      ) as expected(table_name, trigger_name, expected_tgtype)
  loop
    select regexp_replace(
             replace(
               replace(lower(pg_get_triggerdef(trigger_row.oid, true)), 'public.', ''),
               '"',
               ''
             ),
             '\s+',
             '',
             'g'
           ),
           trigger_row.tgtype
      into actual_definition, actual_tgtype
      from pg_trigger trigger_row
     where trigger_row.tgrelid = format(
             'public.%I', expected_trigger.table_name
           )::regclass
       and trigger_row.tgname = expected_trigger.trigger_name
       and not trigger_row.tgisinternal
       and trigger_row.tgenabled = 'O'
       and trigger_row.tgfoid = immutable_function_oid;

    if actual_definition is null
       or actual_tgtype is distinct from expected_trigger.expected_tgtype
       or position(expected_trigger.trigger_name in actual_definition) = 0
       or position(
            'executefunctionprofitability_foundation_v2_reject_immutable_change()'
            in actual_definition
          ) = 0 then
      raise exception 'PROFITABILITY_FOUNDATION_V2_TRIGGER_POSTFLIGHT_FAILED:%',
        expected_trigger.trigger_name;
    end if;
  end loop;

  if (
    select count(*)
      from pg_trigger trigger_row
     where not trigger_row.tgisinternal
       and trigger_row.tgrelid = any(array[
         'public.service_object'::regclass,
         'public.worker_cost_rate'::regclass,
         'public.object_contract_version'::regclass,
         'public.periodic_work'::regclass,
         'public.periodic_work_zone'::regclass,
         'public.object_equipment'::regclass,
         'public.object_financial_entry'::regclass,
         'public.financial_period'::regclass,
         'public.profitability_snapshot'::regclass,
         'public.profitability_audit'::regclass
       ])
  ) <> 8 then
    raise exception 'PROFITABILITY_FOUNDATION_V2_TRIGGER_COUNT_MISMATCH';
  end if;

  if exists (
    select 1
      from pg_trigger trigger_row
     where not trigger_row.tgisinternal
       and trigger_row.tgfoid = immutable_function_oid
       and trigger_row.tgrelid = any(array[
         'public.zone'::regclass,
         'public.task'::regclass,
         'public.event'::regclass
       ])
  ) then
    raise exception 'PROFITABILITY_FOUNDATION_V2_CORE_TRIGGER_FORBIDDEN';
  end if;
end
$profitability_foundation_v2_function_trigger_postflight$;

-- Exact PG17 catalog fingerprint for semantics which must never be accepted by
-- token/sub-string matching.  This deliberately includes complete defaults,
-- constraints, every Foundation index, the immutable trigger function, static
-- identity-sequence parameters and trigger definitions.  It never includes a
-- sequence's current value.  Any replay drift aborts the same transaction
-- instead of being "repaired".
do $profitability_foundation_v2_exact_catalog_postflight$
declare
  target_relations constant text[] := array[
    'service_object',
    'worker_cost_rate',
    'object_contract_version',
    'periodic_work',
    'periodic_work_zone',
    'object_equipment',
    'object_financial_entry',
    'financial_period',
    'profitability_snapshot',
    'profitability_audit'
  ];
  actual_fingerprint text;
  expected_fingerprint constant text := 'f737b7dbdcf7aa08a2c2323d08b2e69b';
begin
  select md5(
           jsonb_build_object(
              'relations', (
                select jsonb_agg(
                         jsonb_build_object(
                           'table', relation_row.relname,
                           'persistence', relation_row.relpersistence,
                           'access_method', access_method.amname,
                           'is_partition', relation_row.relispartition,
                           'replica_identity', relation_row.relreplident,
                           'options', (
                             select jsonb_agg(option_entry order by option_entry)
                               from unnest(
                                 coalesce(
                                   relation_row.reloptions,
                                   array[]::text[]
                                 )
                               ) as relation_option(option_entry)
                           ),
                           'row_security', relation_row.relrowsecurity,
                           'force_row_security',
                             relation_row.relforcerowsecurity
                         )
                         order by relation_row.relname
                       )
                  from pg_class relation_row
                  join pg_namespace namespace_row
                    on namespace_row.oid = relation_row.relnamespace
                  left join pg_am access_method
                    on access_method.oid = relation_row.relam
                 where namespace_row.nspname = 'public'
                   and relation_row.relname = any(target_relations)
              ),
              'columns', (
                select jsonb_agg(
                         jsonb_build_object(
                           'table', relation_row.relname,
                           'ordinal', attribute_row.attnum,
                           'name', attribute_row.attname,
                           'type_oid', attribute_row.atttypid::integer,
                           'formatted_type', format_type(
                             attribute_row.atttypid,
                             attribute_row.atttypmod
                           ),
                           'type_modifier', attribute_row.atttypmod,
                           'type_schema', type_namespace.nspname,
                           'type_name', type_row.typname,
                           'type_kind', type_row.typtype,
                           'domain_base_type_oid',
                             type_row.typbasetype::integer,
                           'domain_base_type', case
                             when type_row.typbasetype = 0 then null
                             else format_type(
                               type_row.typbasetype,
                               type_row.typtypmod
                             )
                           end,
                           'domain_default', type_row.typdefault,
                           'domain_constraints', (
                             select jsonb_agg(
                                      jsonb_build_object(
                                        'name', domain_constraint.conname,
                                        'definition', pg_get_constraintdef(
                                          domain_constraint.oid,
                                          true
                                        )
                                      )
                                      order by domain_constraint.conname
                                    )
                               from pg_constraint domain_constraint
                              where domain_constraint.contypid = type_row.oid
                           ),
                           'not_null', attribute_row.attnotnull,
                           'collation_schema',
                             collation_namespace.nspname,
                           'collation', collation_row.collname,
                           'generated', attribute_row.attgenerated,
                           'identity', attribute_row.attidentity
                         )
                         order by relation_row.relname, attribute_row.attnum
                       )
                  from pg_class relation_row
                  join pg_namespace namespace_row
                    on namespace_row.oid = relation_row.relnamespace
                  join pg_attribute attribute_row
                    on attribute_row.attrelid = relation_row.oid
                  join pg_type type_row
                    on type_row.oid = attribute_row.atttypid
                  join pg_namespace type_namespace
                    on type_namespace.oid = type_row.typnamespace
                  left join pg_collation collation_row
                    on collation_row.oid = attribute_row.attcollation
                  left join pg_namespace collation_namespace
                    on collation_namespace.oid =
                       collation_row.collnamespace
                 where namespace_row.nspname = 'public'
                   and relation_row.relname = any(target_relations)
                   and attribute_row.attnum > 0
                   and not attribute_row.attisdropped
              ),
              'defaults', (
               select jsonb_agg(
                        jsonb_build_object(
                          'table', relation_row.relname,
                          'column', attribute_row.attname,
                          'expression', pg_get_expr(
                            default_row.adbin,
                            default_row.adrelid,
                            true
                          )
                        )
                        order by relation_row.relname, attribute_row.attnum
                      )
                 from pg_class relation_row
                 join pg_namespace namespace_row
                   on namespace_row.oid = relation_row.relnamespace
                 join pg_attribute attribute_row
                   on attribute_row.attrelid = relation_row.oid
                 join pg_attrdef default_row
                   on default_row.adrelid = relation_row.oid
                  and default_row.adnum = attribute_row.attnum
                where namespace_row.nspname = 'public'
                  and relation_row.relname = any(target_relations)
             ),
              'constraints', (
               select jsonb_agg(
                        jsonb_build_object(
                          'table', relation_row.relname,
                          'name', constraint_row.conname,
                          'definition', pg_get_constraintdef(
                            constraint_row.oid,
                            true
                          ),
                          'delete', constraint_row.confdeltype,
                          'update', constraint_row.confupdtype,
                          'match', constraint_row.confmatchtype,
                          'deferrable', constraint_row.condeferrable,
                          'deferred', constraint_row.condeferred
                        )
                        order by relation_row.relname, constraint_row.conname
                      )
                 from pg_constraint constraint_row
                 join pg_class relation_row
                   on relation_row.oid = constraint_row.conrelid
                 join pg_namespace namespace_row
                   on namespace_row.oid = relation_row.relnamespace
                 where namespace_row.nspname = 'public'
                   and relation_row.relname = any(target_relations)
              ),
              'indexes', (
                select jsonb_agg(
                         jsonb_build_object(
                           'table', relation_row.relname,
                           'name', index_row.relname,
                           'definition', pg_get_indexdef(
                             index_meta.indexrelid,
                             0,
                             true
                           ),
                           'predicate', pg_get_expr(
                             index_meta.indpred,
                             index_meta.indrelid,
                             true
                           ),
                           'method', access_method.amname,
                           'unique', index_meta.indisunique,
                           'primary', index_meta.indisprimary,
                           'exclusion', index_meta.indisexclusion,
                           'immediate', index_meta.indimmediate,
                           'clustered', index_meta.indisclustered,
                           'valid', index_meta.indisvalid,
                           'check_xmin', index_meta.indcheckxmin,
                           'ready', index_meta.indisready,
                           'live', index_meta.indislive,
                           'replica_identity', index_meta.indisreplident,
                           'nulls_not_distinct',
                             index_meta.indnullsnotdistinct,
                           'key_attributes', index_meta.indnkeyatts,
                           'attributes', index_meta.indnatts
                         )
                         order by relation_row.relname, index_row.relname
                       )
                  from pg_index index_meta
                  join pg_class relation_row
                    on relation_row.oid = index_meta.indrelid
                  join pg_namespace namespace_row
                    on namespace_row.oid = relation_row.relnamespace
                  join pg_class index_row
                    on index_row.oid = index_meta.indexrelid
                  join pg_am access_method
                    on access_method.oid = index_row.relam
                 where namespace_row.nspname = 'public'
                   and relation_row.relname = any(target_relations)
              ),
              'immutable_function', (
                select jsonb_build_object(
                         'signature', function_row.oid::regprocedure::text,
                         'owner', owner_row.rolname,
                         'language', language_row.lanname,
                         'return_type', format_type(
                           function_row.prorettype,
                           null
                         ),
                         'security_definer', function_row.prosecdef,
                         'volatility', function_row.provolatile,
                         'config', function_row.proconfig,
                         'search_path', (
                           select split_part(config_entry, '=', 2)
                             from unnest(
                               coalesce(
                                 function_row.proconfig,
                                 array[]::text[]
                               )
                             ) as function_config(config_entry)
                            where split_part(config_entry, '=', 1) =
                                  'search_path'
                         ),
                         'definition', pg_get_functiondef(function_row.oid),
                         'source', function_row.prosrc,
                         'acl', (
                           select jsonb_agg(
                                    jsonb_build_object(
                                      'grantee', coalesce(
                                        grantee_role.rolname,
                                        'PUBLIC'
                                      ),
                                      'grantor', grantor_role.rolname,
                                      'privilege',
                                        privilege_row.privilege_type,
                                      'grantable',
                                        privilege_row.is_grantable
                                    )
                                    order by
                                      coalesce(
                                        grantee_role.rolname,
                                        'PUBLIC'
                                      ),
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
                               on grantor_role.oid = privilege_row.grantor
                         )
                       )
                  from pg_proc function_row
                  join pg_namespace namespace_row
                    on namespace_row.oid = function_row.pronamespace
                  join pg_roles owner_row
                    on owner_row.oid = function_row.proowner
                  join pg_language language_row
                    on language_row.oid = function_row.prolang
                 where function_row.oid = to_regprocedure(
                   'public.profitability_foundation_v2_reject_immutable_change()'
                 )
                   and namespace_row.nspname = 'public'
              ),
              'audit_identity_sequence', (
                select jsonb_build_object(
                         'name', sequence_class.relname,
                         'persistence', sequence_class.relpersistence,
                         'owner', owner_row.rolname,
                         'acl', (
                           select jsonb_agg(
                                    jsonb_build_object(
                                      'grantee', coalesce(
                                        grantee_role.rolname,
                                        'PUBLIC'
                                      ),
                                      'grantor', grantor_role.rolname,
                                      'privilege',
                                        privilege_row.privilege_type,
                                      'grantable',
                                        privilege_row.is_grantable
                                    )
                                    order by
                                      coalesce(
                                        grantee_role.rolname,
                                        'PUBLIC'
                                      ),
                                      grantor_role.rolname,
                                      privilege_row.privilege_type,
                                      privilege_row.is_grantable
                                  )
                             from aclexplode(
                               coalesce(
                                 sequence_class.relacl,
                                 acldefault(
                                   'S',
                                   sequence_class.relowner
                                 )
                               )
                             ) privilege_row
                             left join pg_roles grantee_role
                               on grantee_role.oid = privilege_row.grantee
                             join pg_roles grantor_role
                               on grantor_role.oid = privilege_row.grantor
                         ),
                         'increment', sequence_row.seqincrement,
                         'minimum', sequence_row.seqmin,
                         'maximum', sequence_row.seqmax,
                         'start', sequence_row.seqstart,
                         'cache', sequence_row.seqcache,
                         'cycle', sequence_row.seqcycle
                       )
                  from pg_sequence sequence_row
                  join pg_class sequence_class
                    on sequence_class.oid = sequence_row.seqrelid
                  join pg_namespace namespace_row
                    on namespace_row.oid = sequence_class.relnamespace
                  join pg_roles owner_row
                    on owner_row.oid = sequence_class.relowner
                 where namespace_row.nspname = 'public'
                   and sequence_class.relname =
                         'profitability_audit_audit_id_seq'
              ),
              'policies', (
                select jsonb_agg(
                         jsonb_build_object(
                           'table', relation_row.relname,
                           'name', policy_row.polname,
                           'permissive', policy_row.polpermissive,
                           'command', policy_row.polcmd,
                           'roles', (
                             select jsonb_agg(
                                      coalesce(role_row.rolname, 'PUBLIC')
                                      order by coalesce(
                                        role_row.rolname,
                                        'PUBLIC'
                                      )
                                    )
                               from unnest(policy_row.polroles)
                                    as policy_role(role_oid)
                               left join pg_roles role_row
                                 on role_row.oid = policy_role.role_oid
                           ),
                           'using', pg_get_expr(
                             policy_row.polqual,
                             policy_row.polrelid,
                             true
                           ),
                           'check', pg_get_expr(
                             policy_row.polwithcheck,
                             policy_row.polrelid,
                             true
                           )
                         )
                         order by relation_row.relname, policy_row.polname
                       )
                  from pg_policy policy_row
                  join pg_class relation_row
                    on relation_row.oid = policy_row.polrelid
                  join pg_namespace namespace_row
                    on namespace_row.oid = relation_row.relnamespace
                 where namespace_row.nspname = 'public'
                   and relation_row.relname = any(target_relations)
              ),
              'user_rules', (
                select jsonb_agg(
                         jsonb_build_object(
                           'table', relation_row.relname,
                           'name', rewrite_row.rulename,
                           'enabled', rewrite_row.ev_enabled,
                           'definition', pg_get_ruledef(
                             rewrite_row.oid,
                             true
                           )
                         )
                         order by relation_row.relname, rewrite_row.rulename
                       )
                  from pg_rewrite rewrite_row
                  join pg_class relation_row
                    on relation_row.oid = rewrite_row.ev_class
                  join pg_namespace namespace_row
                    on namespace_row.oid = relation_row.relnamespace
                 where namespace_row.nspname = 'public'
                   and relation_row.relname = any(target_relations)
                   and rewrite_row.rulename <> '_RETURN'
              ),
              'user_triggers', (
                select jsonb_agg(
                         jsonb_build_object(
                           'table', relation_row.relname,
                           'name', trigger_row.tgname,
                           'enabled', trigger_row.tgenabled,
                           'type', trigger_row.tgtype,
                           'definition', pg_get_triggerdef(
                             trigger_row.oid,
                            true
                          ),
                          'when', pg_get_expr(
                            trigger_row.tgqual,
                            trigger_row.tgrelid,
                            true
                          )
                        )
                        order by relation_row.relname, trigger_row.tgname
                      )
                 from pg_trigger trigger_row
                 join pg_class relation_row
                   on relation_row.oid = trigger_row.tgrelid
                 join pg_namespace namespace_row
                   on namespace_row.oid = relation_row.relnamespace
                where namespace_row.nspname = 'public'
                   and relation_row.relname = any(target_relations)
                   and not trigger_row.tgisinternal
              ),
              'internal_ri_triggers', (
                select jsonb_agg(
                         jsonb_build_object(
                           'table', trigger_relation.relname,
                           'constraint_table',
                             constraint_relation.relname,
                           'constraint', constraint_row.conname,
                           'referenced_table',
                             referenced_relation.relname,
                           'function', trigger_function.proname,
                           'enabled', trigger_row.tgenabled,
                           'type', trigger_row.tgtype,
                           'deferrable', trigger_row.tgdeferrable,
                           'initially_deferred',
                             trigger_row.tginitdeferred
                         )
                         order by
                           trigger_relation.relname,
                           constraint_relation.relname,
                           constraint_row.conname,
                           trigger_function.proname,
                           trigger_row.tgtype
                       )
                  from pg_trigger trigger_row
                  join pg_class trigger_relation
                    on trigger_relation.oid = trigger_row.tgrelid
                  join pg_namespace trigger_namespace
                    on trigger_namespace.oid =
                       trigger_relation.relnamespace
                  join pg_constraint constraint_row
                    on constraint_row.oid = trigger_row.tgconstraint
                   and constraint_row.contype = 'f'
                  join pg_class constraint_relation
                    on constraint_relation.oid = constraint_row.conrelid
                  join pg_namespace constraint_namespace
                    on constraint_namespace.oid =
                       constraint_relation.relnamespace
                  join pg_class referenced_relation
                    on referenced_relation.oid = constraint_row.confrelid
                  join pg_proc trigger_function
                    on trigger_function.oid = trigger_row.tgfoid
                 where trigger_namespace.nspname = 'public'
                   and constraint_namespace.nspname = 'public'
                   and constraint_relation.relname = any(target_relations)
                   and trigger_row.tgisinternal
              )
           )::text
         )
    into actual_fingerprint;

  if actual_fingerprint is distinct from expected_fingerprint then
    raise exception
      'PROFITABILITY_FOUNDATION_V2_EXACT_CATALOG_FINGERPRINT_MISMATCH:%',
      coalesce(actual_fingerprint, '<null>');
  end if;
end
$profitability_foundation_v2_exact_catalog_postflight$;

do $profitability_foundation_v2_owner_acl_postflight$
declare
  target_spec record;
  target_relation regclass;
  actual_privileges text[];
  runtime_role_name text := current_setting(
    'cleanzi.profitability_foundation_v2_runtime_role'
  );
  session_role_name text := current_setting(
    'cleanzi.profitability_foundation_v2_session_role'
  );
  owner_role_oid oid := (
    select oid from pg_roles where rolname = 'profitability_owner'
  );
  runtime_role_oid oid := (
    select oid from pg_roles where rolname = runtime_role_name
  );
begin
  for target_spec in
    select *
      from (values
        ('service_object', array['SELECT']::text[]),
        ('worker_cost_rate', array['INSERT', 'SELECT', 'UPDATE']::text[]),
        ('object_contract_version', array['INSERT', 'SELECT', 'UPDATE']::text[]),
        ('periodic_work', array['SELECT']::text[]),
        ('periodic_work_zone', array['SELECT']::text[]),
        ('object_equipment', array['INSERT', 'SELECT', 'UPDATE']::text[]),
        ('object_financial_entry', array['INSERT', 'SELECT']::text[]),
        ('financial_period', array['INSERT', 'SELECT', 'UPDATE']::text[]),
        ('profitability_snapshot', array['INSERT', 'SELECT']::text[]),
        ('profitability_audit', array['INSERT', 'SELECT']::text[])
      ) as expected(table_name, privilege_types)
  loop
    target_relation := format('public.%I', target_spec.table_name)::regclass;

    if not exists (
      select 1
        from pg_class relation_row
       where relation_row.oid = target_relation
         and relation_row.relkind = 'r'
         and relation_row.relowner = owner_role_oid
    ) then
      raise exception 'PROFITABILITY_FOUNDATION_V2_TABLE_OWNER_MISMATCH:%',
        target_spec.table_name;
    end if;

    select array_agg(
             distinct privilege_row.privilege_type
             order by privilege_row.privilege_type
           )
      into actual_privileges
      from pg_class relation_row
      cross join lateral aclexplode(relation_row.relacl) privilege_row
     where relation_row.oid = target_relation
       and privilege_row.grantee = runtime_role_oid
       and not privilege_row.is_grantable;

    if actual_privileges is distinct from target_spec.privilege_types then
      raise exception 'PROFITABILITY_FOUNDATION_V2_RUNTIME_ACL_MISMATCH:%',
        target_spec.table_name;
    end if;

    if exists (
      select 1
        from pg_class relation_row
        cross join lateral aclexplode(relation_row.relacl) privilege_row
       where relation_row.oid = target_relation
         and (
           privilege_row.grantee not in (owner_role_oid, runtime_role_oid)
           or privilege_row.is_grantable
         )
    ) then
      raise exception 'PROFITABILITY_FOUNDATION_V2_DIRECT_ACL_EXCESS:%',
        target_spec.table_name;
    end if;

    if exists (
      select 1
        from pg_attribute attribute_row
       where attribute_row.attrelid = target_relation
         and attribute_row.attnum > 0
         and not attribute_row.attisdropped
         and attribute_row.attacl is not null
         and exists (
           select 1 from aclexplode(attribute_row.attacl) privilege_row
         )
    ) then
      raise exception 'PROFITABILITY_FOUNDATION_V2_COLUMN_ACL_EXCESS:%',
        target_spec.table_name;
    end if;

    if has_table_privilege(
         session_role_name,
         target_relation,
         'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
       ) then
      raise exception 'PROFITABILITY_FOUNDATION_V2_SESSION_TABLE_ACL_EXCESS:%',
        target_spec.table_name;
    end if;

    if has_table_privilege(
         runtime_role_name,
         target_relation,
         'DELETE,TRUNCATE,REFERENCES,TRIGGER'
       ) then
      raise exception 'PROFITABILITY_FOUNDATION_V2_RUNTIME_DANGEROUS_ACL:%',
        target_spec.table_name;
    end if;

    if not ('INSERT' = any(target_spec.privilege_types))
       and has_table_privilege(runtime_role_name, target_relation, 'INSERT') then
      raise exception 'PROFITABILITY_FOUNDATION_V2_RUNTIME_INSERT_EXCESS:%',
        target_spec.table_name;
    end if;

    if not ('UPDATE' = any(target_spec.privilege_types))
       and has_table_privilege(runtime_role_name, target_relation, 'UPDATE') then
      raise exception 'PROFITABILITY_FOUNDATION_V2_RUNTIME_UPDATE_EXCESS:%',
        target_spec.table_name;
    end if;
  end loop;

  if not exists (
    select 1
      from pg_class sequence_row
     where sequence_row.oid = 'public.profitability_audit_audit_id_seq'::regclass
       and sequence_row.relkind = 'S'
       and sequence_row.relowner = owner_role_oid
  ) then
    raise exception 'PROFITABILITY_FOUNDATION_V2_AUDIT_SEQUENCE_OWNER_MISMATCH';
  end if;

  select array_agg(
           distinct privilege_row.privilege_type
           order by privilege_row.privilege_type
         )
    into actual_privileges
    from pg_class sequence_row
    cross join lateral aclexplode(sequence_row.relacl) privilege_row
   where sequence_row.oid = 'public.profitability_audit_audit_id_seq'::regclass
     and privilege_row.grantee = runtime_role_oid
     and not privilege_row.is_grantable;

  if actual_privileges is distinct from array['USAGE']::text[]
     or has_sequence_privilege(
          runtime_role_name,
          'public.profitability_audit_audit_id_seq',
          'SELECT,UPDATE'
        )
     or has_sequence_privilege(
          session_role_name,
          'public.profitability_audit_audit_id_seq',
          'USAGE,SELECT,UPDATE'
        ) then
    raise exception 'PROFITABILITY_FOUNDATION_V2_AUDIT_SEQUENCE_ACL_MISMATCH';
  end if;

  if exists (
    select 1
      from pg_class sequence_row
      cross join lateral aclexplode(sequence_row.relacl) privilege_row
     where sequence_row.oid = 'public.profitability_audit_audit_id_seq'::regclass
       and (
         privilege_row.grantee not in (owner_role_oid, runtime_role_oid)
         or privilege_row.is_grantable
       )
  ) then
    raise exception 'PROFITABILITY_FOUNDATION_V2_AUDIT_SEQUENCE_DIRECT_ACL_EXCESS';
  end if;

  if has_function_privilege(
       runtime_role_name,
       'public.profitability_foundation_v2_reject_immutable_change()',
       'EXECUTE'
     )
     or has_function_privilege(
       session_role_name,
       'public.profitability_foundation_v2_reject_immutable_change()',
       'EXECUTE'
     )
     or exists (
       select 1
         from pg_proc function_row
         cross join lateral aclexplode(function_row.proacl) privilege_row
        where function_row.oid = to_regprocedure(
                'public.profitability_foundation_v2_reject_immutable_change()'
              )
          and (
            privilege_row.grantee <> owner_role_oid
            or privilege_row.is_grantable
          )
     ) then
    raise exception 'PROFITABILITY_FOUNDATION_V2_FUNCTION_ACL_MISMATCH';
  end if;

  if not has_schema_privilege(runtime_role_name, 'public', 'USAGE')
     or has_schema_privilege(runtime_role_name, 'public', 'CREATE')
     or has_schema_privilege(session_role_name, 'public', 'CREATE') then
    raise exception 'PROFITABILITY_FOUNDATION_V2_SCHEMA_PRIVILEGE_MISMATCH';
  end if;
end
$profitability_foundation_v2_owner_acl_postflight$;

do $profitability_foundation_v2_final_guard$
declare
  target_name text;
  target_row_count bigint;
begin
  if current_setting(
       'cleanzi.profitability_foundation_v2_fresh_install'
     )::boolean then
    foreach target_name in array array[
      'service_object',
      'worker_cost_rate',
      'object_contract_version',
      'periodic_work',
      'periodic_work_zone',
      'object_equipment',
      'object_financial_entry',
      'financial_period',
      'profitability_snapshot',
      'profitability_audit'
    ] loop
      execute format('select count(*) from public.%I', target_name)
        into target_row_count;
      if target_row_count <> 0 then
        raise exception 'PROFITABILITY_FOUNDATION_V2_UNEXPECTED_SEED_DATA:%',
          target_name;
      end if;
    end loop;
  end if;

  if to_regclass('public.profitability_permission') is not null then
    raise exception 'PROFITABILITY_FOUNDATION_V2_LEGACY_PERMISSION_PRESENT';
  end if;

  if current_setting('cleanzi.profitability_foundation_v2_entrypoint', true) <> '' then
    raise exception 'PROFITABILITY_FOUNDATION_V2_ENTRYPOINT_NOT_CONSUMED';
  end if;
end
$profitability_foundation_v2_final_guard$;
