-- Review-only, additive Profitability V2.1 financial model.
-- OPERATOR ENTRYPOINT: ../admin/20260926_profitability_financial_model_v21_apply.psql
-- Direct execution is forbidden. The guarded wrapper owns the transaction.
--
-- This migration adds no tenant or financial rows. It introduces:
--   * durable command receipts for idempotent writes;
--   * an explicit PLAN / ESTIMATE / ACTUAL basis on financial entries;
--   * effective-entry views where ACTUAL replaces ESTIMATE with the same key;
--   * versioned hygiene packages with IN_CONTRACT, MONTHLY_EXTRA and AD_HOC billing.

do $profitability_v21_entrypoint_guard$
declare
  expected_executor text := nullif(
    current_setting('cleanzi.profitability_v21_expected_executor', true), ''
  );
  runner_role_name text := nullif(
    current_setting('cleanzi.profitability_v21_migration_runner', true), ''
  );
  owner_role_name text := nullif(
    current_setting('cleanzi.profitability_v21_owner_role', true), ''
  );
  runtime_role_name text := nullif(
    current_setting('cleanzi.profitability_v21_runtime_role', true), ''
  );
  backup_reference text := nullif(
    current_setting('cleanzi.profitability_v21_backup_reference', true), ''
  );
begin
  if current_setting('cleanzi.profitability_v21_entrypoint', true)
       is distinct from 'GUARDED_PROFITABILITY_FINANCIAL_MODEL_V21_20260926' then
    raise exception 'PROFITABILITY_V21_GUARDED_ENTRYPOINT_REQUIRED';
  end if;

  if current_database() <> 'iclean-room-database' then
    raise exception 'PROFITABILITY_V21_DATABASE_MISMATCH';
  end if;

  if expected_executor <> 'profitability_migration_executor'
     or session_user <> expected_executor
     or runner_role_name <> 'profitability_migration_runner'
     or current_user <> runner_role_name then
    raise exception 'PROFITABILITY_V21_MIGRATION_IDENTITY_MISMATCH';
  end if;

  if owner_role_name <> 'profitability_owner'
     or runtime_role_name <> 'profitability_runtime' then
    raise exception 'PROFITABILITY_V21_ROLE_NAME_MISMATCH';
  end if;

  if backup_reference is null
     or backup_reference !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{5,127}$' then
    raise exception 'PROFITABILITY_V21_BACKUP_REFERENCE_INVALID';
  end if;

  if current_setting('server_version_num')::integer not between 170000 and 179999 then
    raise exception 'PROFITABILITY_V21_POSTGRESQL_17_REQUIRED';
  end if;

  if pg_is_in_recovery()
     or current_setting('transaction_read_only') <> 'off'
     or current_setting('default_transaction_read_only') <> 'off' then
    raise exception 'PROFITABILITY_V21_WRITABLE_PRIMARY_REQUIRED';
  end if;

  perform set_config('cleanzi.profitability_v21_entrypoint', '', true);
end
$profitability_v21_entrypoint_guard$;

set local role profitability_owner;

do $profitability_v21_foundation_guard$
declare
  marker_count integer := 0;
begin
  if to_regclass('public.service_object') is null
     or to_regclass('public.object_financial_entry') is null
     or to_regprocedure(
       'public.profitability_foundation_v2_reject_immutable_change()'
     ) is null then
    raise exception 'PROFITABILITY_V21_FOUNDATION_V2_REQUIRED';
  end if;

  if not exists (
    select 1 from pg_extension extension_row
     where extension_row.extname = 'btree_gist'
       and extension_row.extversion = '1.7'
  ) then
    raise exception 'PROFITABILITY_V21_BTREE_GIST_1_7_REQUIRED';
  end if;

  if current_user <> 'profitability_owner' then
    raise exception 'PROFITABILITY_V21_OWNER_ROLE_REQUIRED';
  end if;

  marker_count := marker_count
    + case when exists (
        select 1 from pg_attribute
         where attrelid = 'public.object_financial_entry'::regclass
           and attname = 'value_basis' and attnum > 0 and not attisdropped
      ) then 1 else 0 end
    + case when exists (
        select 1 from pg_attribute
         where attrelid = 'public.object_financial_entry'::regclass
           and attname = 'value_key' and attnum > 0 and not attisdropped
      ) then 1 else 0 end
    + case when to_regclass('public.profitability_command_receipt') is not null then 1 else 0 end
    + case when to_regclass('public.object_hygiene_package_version') is not null then 1 else 0 end
    + case when to_regclass('public.profitability_financial_model_enforcement') is not null then 1 else 0 end
    + case when to_regclass('public.profitability_effective_financial_entry') is not null then 1 else 0 end
    + case when to_regclass('public.profitability_effective_hygiene_package') is not null then 1 else 0 end
    + case when to_regclass('public.object_financial_entry_active_value_basis_uidx') is not null then 1 else 0 end
    + case when to_regclass('public.profitability_command_receipt_created_idx') is not null then 1 else 0 end
    + case when to_regclass('public.object_hygiene_package_active_recognition_uidx') is not null then 1 else 0 end
    + case when to_regclass('public.object_hygiene_package_lookup_idx') is not null then 1 else 0 end
    + case when to_regprocedure('public.profitability_v21_guard_command_receipt()') is not null then 1 else 0 end
    + case when to_regprocedure('public.profitability_v21_guard_hygiene_package()') is not null then 1 else 0 end
    + case when to_regprocedure('public.profitability_v21_validate_financial_pair()') is not null then 1 else 0 end
    + case when to_regprocedure('public.profitability_v21_validate_hygiene_pair()') is not null then 1 else 0 end
    + case when exists (
        select 1 from pg_trigger
         where tgrelid = to_regclass('public.profitability_command_receipt')
           and tgname = 'profitability_command_receipt_transition_v21'
           and not tgisinternal
      ) then 1 else 0 end
    + case when exists (
        select 1 from pg_trigger
         where tgrelid = to_regclass('public.object_hygiene_package_version')
           and tgname = 'object_hygiene_package_transition_v21'
           and not tgisinternal
      ) then 1 else 0 end
    + case when exists (
        select 1 from pg_trigger
         where tgrelid = to_regclass('public.object_financial_entry')
           and tgname = 'object_financial_entry_pair_dimensions_v21'
           and not tgisinternal
      ) then 1 else 0 end
    + case when exists (
        select 1 from pg_trigger
         where tgrelid = to_regclass('public.object_hygiene_package_version')
           and tgname = 'object_hygiene_package_pair_dimensions_v21'
           and not tgisinternal
      ) then 1 else 0 end;

  if marker_count not in (0, 19) then
    raise exception 'PROFITABILITY_V21_PARTIAL_TARGET:%/19', marker_count;
  end if;

  perform set_config(
    'cleanzi.profitability_v21_fresh_install',
    case when marker_count = 0 then 'true' else 'false' end,
    true
  );
end
$profitability_v21_foundation_guard$;

do $profitability_v21_add_entry_basis$
begin
  if current_setting('cleanzi.profitability_v21_fresh_install')::boolean then
    alter table public.object_financial_entry
      add column value_basis varchar(16) not null default 'ACTUAL',
      add column value_key varchar(96),
      add constraint object_financial_entry_value_basis_check
        check (value_basis in ('PLAN', 'ESTIMATE', 'ACTUAL')),
      add constraint object_financial_entry_value_key_check
        check (
          (value_key is null and value_basis = 'ACTUAL')
          or (
            value_key is not null
            and value_key = btrim(value_key)
            and value_key <> ''
          )
        );
  end if;
end
$profitability_v21_add_entry_basis$;

create unique index if not exists object_financial_entry_active_value_basis_uidx
  on public.object_financial_entry
  (org_id, object_id, value_key, value_basis)
  where value_key is not null
    and status = 'POSTED'
    and archived_at is null;

create table if not exists public.profitability_command_receipt (
  org_id varchar(64) not null,
  command_id varchar(96) not null,
  object_id varchar(64) not null,
  command_kind varchar(64) not null,
  request_sha256 char(64) not null,
  state varchar(16) not null default 'IN_PROGRESS',
  result_reference varchar(180),
  error_code varchar(80),
  created_at timestamptz not null default now(),
  created_by_uid varchar(128) not null,
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint profitability_command_receipt_pkey
    primary key (org_id, command_id),
  constraint profitability_command_receipt_object_fk
    foreign key (org_id, object_id)
    references public.service_object (org_id, object_id),
  constraint profitability_command_receipt_command_check
    check (
      command_id = btrim(command_id) and command_id <> ''
      and command_kind = btrim(command_kind) and command_kind <> ''
    ),
  constraint profitability_command_receipt_hash_check
    check (request_sha256 ~ '^[0-9a-f]{64}$'),
  constraint profitability_command_receipt_state_check
    check (state in ('IN_PROGRESS', 'SUCCEEDED', 'FAILED')),
  constraint profitability_command_receipt_completion_check
    check (
      (
        state = 'IN_PROGRESS'
        and completed_at is null
        and result_reference is null
        and error_code is null
      )
      or (
        state = 'SUCCEEDED'
        and completed_at is not null
        and result_reference is not null
        and error_code is null
      )
      or (
        state = 'FAILED'
        and completed_at is not null
        and result_reference is null
        and error_code is not null
      )
    ),
  constraint profitability_command_receipt_time_check
    check (updated_at >= created_at and (completed_at is null or completed_at >= created_at))
);

create index if not exists profitability_command_receipt_created_idx
  on public.profitability_command_receipt (org_id, object_id, created_at desc);

-- Seedless deny-side marker. Activating this row is a separate, explicitly
-- approved operation after code, flags, allowlist and schema are ready. Once a
-- tenant is marked, the API must not fall back to a legacy sum that could count
-- both ESTIMATE and ACTUAL.
create table if not exists public.profitability_financial_model_enforcement (
  org_id varchar(64) not null,
  schema_version varchar(8) not null,
  enforced_at timestamptz not null default now(),
  enforced_by_uid varchar(128) not null,
  constraint profitability_financial_model_enforcement_pkey
    primary key (org_id),
  constraint profitability_financial_model_enforcement_org_fk
    foreign key (org_id)
    references public.organizations (org_id),
  constraint profitability_financial_model_enforcement_version_check
    check (schema_version = 'v2.1')
);

create table if not exists public.object_hygiene_package_version (
  org_id varchar(64) not null,
  object_id varchar(64) not null,
  package_id varchar(64) not null,
  package_version_id varchar(64) not null,
  version_no integer not null,
  recognition_key varchar(96) not null,
  package_name varchar(180) not null,
  billing_mode varchar(24) not null,
  value_basis varchar(16) not null,
  price_net_minor bigint not null,
  cost_minor bigint not null,
  margin_bps integer generated always as (
    case
      when price_net_minor = 0 then null
      else round(
        ((price_net_minor - cost_minor)::numeric * 10000::numeric)
        / price_net_minor::numeric
      )::integer
    end
  ) stored,
  currency char(3) not null default 'PLN',
  effective_from date not null,
  effective_to date,
  occurred_on date,
  status varchar(16) not null default 'DRAFT',
  created_at timestamptz not null default now(),
  created_by_uid varchar(128) not null,
  updated_at timestamptz not null default now(),
  updated_by_uid varchar(128),
  archived_at timestamptz,
  archived_by_uid varchar(128),
  constraint object_hygiene_package_version_pkey
    primary key (org_id, object_id, package_version_id),
  constraint object_hygiene_package_version_object_fk
    foreign key (org_id, object_id)
    references public.service_object (org_id, object_id),
  constraint object_hygiene_package_version_number_key
    unique (org_id, object_id, package_id, value_basis, version_no),
  constraint object_hygiene_package_identity_check
    check (
      package_id = btrim(package_id) and package_id <> ''
      and recognition_key = btrim(recognition_key) and recognition_key <> ''
      and package_name = btrim(package_name) and package_name <> ''
      and version_no > 0
    ),
  constraint object_hygiene_package_billing_check
    check (billing_mode in ('IN_CONTRACT', 'MONTHLY_EXTRA', 'AD_HOC')),
  constraint object_hygiene_package_basis_check
    check (value_basis in ('PLAN', 'ESTIMATE', 'ACTUAL')),
  constraint object_hygiene_package_amount_check
    check (price_net_minor >= 0 and cost_minor >= 0),
  constraint object_hygiene_package_margin_check
    check (margin_bps is null or margin_bps between -100000 and 10000),
  constraint object_hygiene_package_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  constraint object_hygiene_package_status_check
    check (status in ('DRAFT', 'POSTED', 'VOID', 'ARCHIVED')),
  constraint object_hygiene_package_period_check
    check (
      (
        billing_mode = 'AD_HOC'
        and occurred_on is not null
        and effective_from = occurred_on
        and effective_to is null
      )
      or (
        billing_mode in ('IN_CONTRACT', 'MONTHLY_EXTRA')
        and occurred_on is null
        and (effective_to is null or effective_to > effective_from)
      )
    ),
  constraint object_hygiene_package_archive_check
    check (
      (
        status <> 'ARCHIVED'
        and archived_at is null
        and archived_by_uid is null
      )
      or (
        status = 'ARCHIVED'
        and archived_at is not null
        and archived_by_uid is not null
      )
    ),
  constraint object_hygiene_package_no_overlap
    exclude using gist (
      org_id with =,
      object_id with =,
      package_id with =,
      value_basis with =,
      daterange(
        effective_from,
        coalesce(effective_to, 'infinity'::date),
        '[)'
      ) with &&
    ) where (
      billing_mode <> 'AD_HOC'
      and status not in ('VOID', 'ARCHIVED')
      and archived_at is null
    )
);

create unique index if not exists object_hygiene_package_active_recognition_uidx
  on public.object_hygiene_package_version
  (org_id, object_id, recognition_key, value_basis)
  where status = 'POSTED' and archived_at is null;

create index if not exists object_hygiene_package_lookup_idx
  on public.object_hygiene_package_version
  (org_id, object_id, billing_mode, effective_from, effective_to, occurred_on)
  where status = 'POSTED' and archived_at is null;

do $profitability_v21_function_create$
begin
  if to_regprocedure('public.profitability_v21_guard_command_receipt()') is null then
    execute $function_sql$
      create function public.profitability_v21_guard_command_receipt()
      returns trigger
      language plpgsql
      security invoker
      set search_path = pg_catalog, public
      as $function_body$
      begin
        if tg_op = 'DELETE' then
          raise exception 'profitability command receipts cannot be deleted'
            using errcode = '55000';
        end if;

        if old.state <> 'IN_PROGRESS'
           or new.org_id <> old.org_id
           or new.command_id <> old.command_id
           or new.object_id <> old.object_id
           or new.command_kind <> old.command_kind
           or new.request_sha256 <> old.request_sha256
           or new.created_at <> old.created_at
           or new.created_by_uid <> old.created_by_uid
           or new.state not in ('SUCCEEDED', 'FAILED') then
          raise exception 'invalid profitability command receipt transition'
            using errcode = '55000';
        end if;

        return new;
      end
      $function_body$
    $function_sql$;
  end if;
end
$profitability_v21_function_create$;

do $profitability_v21_hygiene_function_create$
begin
  if to_regprocedure('public.profitability_v21_guard_hygiene_package()') is null then
    execute $function_sql$
      create function public.profitability_v21_guard_hygiene_package()
      returns trigger
      language plpgsql
      security invoker
      set search_path = pg_catalog, public
      as $function_body$
      begin
        if tg_op = 'DELETE' then
          raise exception 'hygiene package versions cannot be deleted'
            using errcode = '55000';
        end if;

        if row(
             new.org_id, new.object_id, new.package_id,
             new.package_version_id, new.version_no, new.recognition_key,
             new.package_name, new.billing_mode, new.value_basis,
             new.price_net_minor, new.cost_minor, new.currency,
             new.effective_from, new.effective_to, new.occurred_on,
             new.created_at, new.created_by_uid
           ) is distinct from row(
             old.org_id, old.object_id, old.package_id,
             old.package_version_id, old.version_no, old.recognition_key,
             old.package_name, old.billing_mode, old.value_basis,
             old.price_net_minor, old.cost_minor, old.currency,
             old.effective_from, old.effective_to, old.occurred_on,
             old.created_at, old.created_by_uid
           ) then
          raise exception 'hygiene package versions are append-only'
            using errcode = '55000';
        end if;

        if new.updated_by_uid is null
           or new.updated_at < old.updated_at
           or not (
             (old.status = 'DRAFT' and new.status in ('POSTED', 'VOID'))
             or (old.status = 'POSTED' and new.status in ('VOID', 'ARCHIVED'))
           ) then
          raise exception 'invalid hygiene package status transition'
            using errcode = '55000';
        end if;

        return new;
      end
      $function_body$
    $function_sql$;
  end if;
end
$profitability_v21_hygiene_function_create$;

do $profitability_v21_pair_validation_function_create$
begin
  if to_regprocedure(
       'public.profitability_v21_validate_financial_pair()'
     ) is null then
    execute $function_sql$
      create function public.profitability_v21_validate_financial_pair()
      returns trigger
      language plpgsql
      security invoker
      set search_path = pg_catalog, public
      as $function_body$
      begin
        if new.status <> 'POSTED'
           or new.archived_at is not null
           or new.value_basis not in ('ESTIMATE', 'ACTUAL')
           or new.value_key is null then
          return new;
        end if;

        -- Serialize both bases for one tenant/object/stable key. The lock is
        -- transaction-scoped, so concurrent ESTIMATE and ACTUAL inserts cannot
        -- both validate against an absent peer and commit incompatible shapes.
        perform pg_catalog.pg_advisory_xact_lock(
          pg_catalog.hashtextextended(
            new.org_id || pg_catalog.chr(31)
            || new.object_id || pg_catalog.chr(31)
            || 'FINANCIAL' || pg_catalog.chr(31)
            || new.value_key,
            0
          )
        );

        if exists (
          select 1
            from public.object_financial_entry peer_row
           where peer_row.org_id = new.org_id
             and peer_row.object_id = new.object_id
             and peer_row.value_key = new.value_key
             and peer_row.value_basis in ('ESTIMATE', 'ACTUAL')
             and peer_row.value_basis <> new.value_basis
             and peer_row.status = 'POSTED'
             and peer_row.archived_at is null
             and row(
               peer_row.entry_group,
               peer_row.category,
               peer_row.currency,
               peer_row.recurrence,
               peer_row.occurred_on,
               peer_row.period_start,
               peer_row.period_end
             ) is distinct from row(
               new.entry_group,
               new.category,
               new.currency,
               new.recurrence,
               new.occurred_on,
               new.period_start,
               new.period_end
             )
        ) then
          raise exception
            'PROFITABILITY_V21_FINANCIAL_PAIR_DIMENSION_MISMATCH'
            using errcode = '23514';
        end if;

        return new;
      end
      $function_body$
    $function_sql$;
  end if;

  if to_regprocedure(
       'public.profitability_v21_validate_hygiene_pair()'
     ) is null then
    execute $function_sql$
      create function public.profitability_v21_validate_hygiene_pair()
      returns trigger
      language plpgsql
      security invoker
      set search_path = pg_catalog, public
      as $function_body$
      begin
        if new.status <> 'POSTED'
           or new.archived_at is not null
           or new.value_basis not in ('ESTIMATE', 'ACTUAL') then
          return new;
        end if;

        perform pg_catalog.pg_advisory_xact_lock(
          pg_catalog.hashtextextended(
            new.org_id || pg_catalog.chr(31)
            || new.object_id || pg_catalog.chr(31)
            || 'HYGIENE' || pg_catalog.chr(31)
            || new.recognition_key,
            0
          )
        );

        if exists (
          select 1
            from public.object_hygiene_package_version peer_row
           where peer_row.org_id = new.org_id
             and peer_row.object_id = new.object_id
             and peer_row.recognition_key = new.recognition_key
             and peer_row.value_basis in ('ESTIMATE', 'ACTUAL')
             and peer_row.value_basis <> new.value_basis
             and peer_row.status = 'POSTED'
             and peer_row.archived_at is null
             and row(
               peer_row.package_id,
               peer_row.billing_mode,
               peer_row.currency,
               peer_row.effective_from,
               peer_row.effective_to,
               peer_row.occurred_on
             ) is distinct from row(
               new.package_id,
               new.billing_mode,
               new.currency,
               new.effective_from,
               new.effective_to,
               new.occurred_on
             )
        ) then
          raise exception
            'PROFITABILITY_V21_HYGIENE_PAIR_DIMENSION_MISMATCH'
            using errcode = '23514';
        end if;

        return new;
      end
      $function_body$
    $function_sql$;
  end if;
end
$profitability_v21_pair_validation_function_create$;

do $profitability_v21_trigger_create$
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.profitability_command_receipt'::regclass
       and tgname = 'profitability_command_receipt_transition_v21'
       and not tgisinternal
  ) then
    create trigger profitability_command_receipt_transition_v21
      before update or delete on public.profitability_command_receipt
      for each row execute function public.profitability_v21_guard_command_receipt();
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.object_hygiene_package_version'::regclass
       and tgname = 'object_hygiene_package_transition_v21'
       and not tgisinternal
  ) then
    create trigger object_hygiene_package_transition_v21
      before update or delete on public.object_hygiene_package_version
      for each row execute function
        public.profitability_v21_guard_hygiene_package();
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.object_financial_entry'::regclass
       and tgname = 'object_financial_entry_pair_dimensions_v21'
       and not tgisinternal
  ) then
    create trigger object_financial_entry_pair_dimensions_v21
      before insert or update on public.object_financial_entry
      for each row execute function
        public.profitability_v21_validate_financial_pair();
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.object_hygiene_package_version'::regclass
       and tgname = 'object_hygiene_package_pair_dimensions_v21'
       and not tgisinternal
  ) then
    create trigger object_hygiene_package_pair_dimensions_v21
      before insert or update on public.object_hygiene_package_version
      for each row execute function
        public.profitability_v21_validate_hygiene_pair();
  end if;
end
$profitability_v21_trigger_create$;

do $profitability_v21_existing_pair_validation$
begin
  if exists (
    select 1
      from public.object_financial_entry estimate_row
      join public.object_financial_entry actual_row
        on actual_row.org_id = estimate_row.org_id
       and actual_row.object_id = estimate_row.object_id
       and actual_row.value_key = estimate_row.value_key
       and actual_row.value_basis = 'ACTUAL'
       and actual_row.status = 'POSTED'
       and actual_row.archived_at is null
     where estimate_row.value_basis = 'ESTIMATE'
       and estimate_row.value_key is not null
       and estimate_row.status = 'POSTED'
       and estimate_row.archived_at is null
       and row(
         actual_row.entry_group,
         actual_row.category,
         actual_row.currency,
         actual_row.recurrence,
         actual_row.occurred_on,
         actual_row.period_start,
         actual_row.period_end
       ) is distinct from row(
         estimate_row.entry_group,
         estimate_row.category,
         estimate_row.currency,
         estimate_row.recurrence,
         estimate_row.occurred_on,
         estimate_row.period_start,
         estimate_row.period_end
       )
  ) then
    raise exception 'PROFITABILITY_V21_EXISTING_FINANCIAL_PAIR_DIMENSION_MISMATCH';
  end if;

  if exists (
    select 1
      from public.object_hygiene_package_version estimate_row
      join public.object_hygiene_package_version actual_row
        on actual_row.org_id = estimate_row.org_id
       and actual_row.object_id = estimate_row.object_id
       and actual_row.recognition_key = estimate_row.recognition_key
       and actual_row.value_basis = 'ACTUAL'
       and actual_row.status = 'POSTED'
       and actual_row.archived_at is null
     where estimate_row.value_basis = 'ESTIMATE'
       and estimate_row.status = 'POSTED'
       and estimate_row.archived_at is null
       and row(
         actual_row.package_id,
         actual_row.billing_mode,
         actual_row.currency,
         actual_row.effective_from,
         actual_row.effective_to,
         actual_row.occurred_on
       ) is distinct from row(
         estimate_row.package_id,
         estimate_row.billing_mode,
         estimate_row.currency,
         estimate_row.effective_from,
         estimate_row.effective_to,
         estimate_row.occurred_on
       )
  ) then
    raise exception 'PROFITABILITY_V21_EXISTING_HYGIENE_PAIR_DIMENSION_MISMATCH';
  end if;
end
$profitability_v21_existing_pair_validation$;

do $profitability_v21_view_create$
begin
  if to_regclass('public.profitability_effective_financial_entry') is null then
    execute $view_sql$
      create view public.profitability_effective_financial_entry
      with (security_invoker = true)
      as
      select entry_row.*
        from public.object_financial_entry entry_row
       where entry_row.archived_at is null
         and entry_row.status = 'POSTED'
         and entry_row.value_basis in ('ESTIMATE', 'ACTUAL')
         and not (
           entry_row.value_basis = 'ESTIMATE'
           and exists (
             select 1
               from public.object_financial_entry actual_row
              where actual_row.org_id = entry_row.org_id
                and actual_row.object_id = entry_row.object_id
                and actual_row.value_key = entry_row.value_key
                and actual_row.value_basis = 'ACTUAL'
                and actual_row.status = 'POSTED'
                and actual_row.archived_at is null
                and actual_row.entry_group = entry_row.entry_group
                and actual_row.category = entry_row.category
                and actual_row.currency = entry_row.currency
                and actual_row.recurrence = entry_row.recurrence
                and actual_row.occurred_on is not distinct from entry_row.occurred_on
                and actual_row.period_start is not distinct from entry_row.period_start
                and actual_row.period_end is not distinct from entry_row.period_end
            )
          )
    $view_sql$;
  end if;

  if to_regclass('public.profitability_effective_hygiene_package') is null then
    execute $view_sql$
      create view public.profitability_effective_hygiene_package
      with (security_invoker = true)
      as
      select distinct on (
               package_row.org_id,
               package_row.object_id,
               package_row.recognition_key
             )
             package_row.*,
             case
               when package_row.billing_mode = 'IN_CONTRACT' then 0::bigint
               else package_row.price_net_minor
             end as recognized_revenue_minor
        from public.object_hygiene_package_version package_row
       where package_row.archived_at is null
         and package_row.status = 'POSTED'
         and package_row.value_basis in ('ESTIMATE', 'ACTUAL')
       order by package_row.org_id,
                package_row.object_id,
                package_row.recognition_key,
                case package_row.value_basis
                  when 'ACTUAL' then 3
                  when 'ESTIMATE' then 2
                  else 0
                end desc,
                package_row.created_at desc,
                package_row.package_version_id desc
    $view_sql$;
  end if;
end
$profitability_v21_view_create$;

comment on column public.object_financial_entry.value_key is
  'Stable object-and-period value key. An active ACTUAL row replaces, rather than adds to, ESTIMATE with the same key.';
comment on table public.profitability_command_receipt is
  'Tenant-scoped idempotency receipt. A command ID cannot be reused with another payload.';
comment on table public.profitability_financial_model_enforcement is
  'Seedless deny-side marker: a marked tenant must use the V2.1 effective-value contract and may not fall back to legacy summation.';
comment on table public.object_hygiene_package_version is
  'Versioned hygiene package. Cost is one basis per row; ACTUAL supersedes ESTIMATE in the effective view.';
comment on view public.profitability_effective_financial_entry is
  'Posted ACTUAL/ESTIMATE entries with PLAN excluded and matching ESTIMATE replaced by ACTUAL.';
comment on view public.profitability_effective_hygiene_package is
  'Posted hygiene packages at the strongest available basis; IN_CONTRACT contributes zero additional revenue.';

do $profitability_v21_acl$
declare
  fresh_install boolean := current_setting(
    'cleanzi.profitability_v21_fresh_install'
  )::boolean;
begin
  if fresh_install then
    revoke all on table public.profitability_command_receipt from public;
    revoke all on table public.object_hygiene_package_version from public;
    revoke all on table public.profitability_financial_model_enforcement from public;
    revoke all on table public.profitability_effective_financial_entry from public;
    revoke all on table public.profitability_effective_hygiene_package from public;
    revoke all on function public.profitability_v21_guard_command_receipt() from public;
    revoke all on function public.profitability_v21_guard_hygiene_package() from public;
    revoke all on function public.profitability_v21_validate_financial_pair() from public;
    revoke all on function public.profitability_v21_validate_hygiene_pair() from public;

    grant select, insert on table public.profitability_command_receipt
      to profitability_runtime;
    grant select on table public.profitability_financial_model_enforcement
      to profitability_runtime;
    grant update (
      state, result_reference, error_code, updated_at, completed_at
    ) on table public.profitability_command_receipt to profitability_runtime;
    grant select, insert on table public.object_hygiene_package_version
      to profitability_runtime;
    grant update (
      status, updated_at, updated_by_uid, archived_at, archived_by_uid
    ) on table public.object_hygiene_package_version
      to profitability_runtime;
    grant select on table public.profitability_effective_financial_entry
      to profitability_runtime;
    grant select on table public.profitability_effective_hygiene_package
      to profitability_runtime;
  end if;
end
$profitability_v21_acl$;

-- Replay validation is deliberately after conditional creation but inside the
-- wrapper-owned transaction. Any mismatch rolls back the complete attempt.
do $profitability_v21_postflight$
declare
  required_constraint text;
  runtime_role_oid oid := (select oid from pg_roles where rolname = 'profitability_runtime');
begin
  if not exists (
    select 1 from pg_attribute
     where attrelid = 'public.object_financial_entry'::regclass
       and attname = 'value_basis'
       and format_type(atttypid, atttypmod) = 'character varying(16)'
       and attnotnull
       and not attisdropped
  ) or not exists (
    select 1 from pg_attribute
     where attrelid = 'public.object_financial_entry'::regclass
       and attname = 'value_key'
       and format_type(atttypid, atttypmod) = 'character varying(96)'
       and not attnotnull
       and not attisdropped
  ) then
    raise exception 'PROFITABILITY_V21_ENTRY_BASIS_COLUMN_DRIFT';
  end if;

  foreach required_constraint in array array[
    'object_financial_entry_value_basis_check',
    'object_financial_entry_value_key_check',
    'profitability_command_receipt_pkey',
    'profitability_command_receipt_object_fk',
    'profitability_command_receipt_hash_check',
    'profitability_command_receipt_completion_check',
    'profitability_financial_model_enforcement_pkey',
    'profitability_financial_model_enforcement_org_fk',
    'profitability_financial_model_enforcement_version_check',
    'object_hygiene_package_version_pkey',
    'object_hygiene_package_version_object_fk',
    'object_hygiene_package_billing_check',
    'object_hygiene_package_basis_check',
    'object_hygiene_package_margin_check',
    'object_hygiene_package_period_check',
    'object_hygiene_package_no_overlap'
  ] loop
    if not exists (
      select 1 from pg_constraint
       where conname = required_constraint and convalidated
    ) then
      raise exception 'PROFITABILITY_V21_CONSTRAINT_DRIFT:%', required_constraint;
    end if;
  end loop;

  if (
    select count(*) from pg_class index_row
    join pg_namespace namespace_row on namespace_row.oid = index_row.relnamespace
    where namespace_row.nspname = 'public'
      and index_row.relkind = 'i'
      and index_row.relname = any(array[
        'object_financial_entry_active_value_basis_uidx',
        'profitability_command_receipt_created_idx',
        'object_hygiene_package_active_recognition_uidx',
        'object_hygiene_package_lookup_idx'
      ])
  ) <> 4 then
    raise exception 'PROFITABILITY_V21_INDEX_SET_DRIFT';
  end if;

  if not exists (
    select 1
      from pg_class index_row
      join pg_namespace namespace_row
        on namespace_row.oid = index_row.relnamespace
      join pg_index index_metadata
        on index_metadata.indexrelid = index_row.oid
     where namespace_row.nspname = 'public'
       and index_row.relname = 'object_hygiene_package_active_recognition_uidx'
       and index_metadata.indisunique
       and index_metadata.indisvalid
       and index_metadata.indisready
       and (
         select array_agg(attribute_row.attname order by key_row.ordinality)
           from unnest(index_metadata.indkey) with ordinality
                as key_row(attnum, ordinality)
           join pg_attribute attribute_row
             on attribute_row.attrelid = index_metadata.indrelid
            and attribute_row.attnum = key_row.attnum
       ) = array[
         'org_id', 'object_id', 'recognition_key', 'value_basis'
       ]::name[]
  ) then
    raise exception 'PROFITABILITY_V21_HYGIENE_STABLE_KEY_INDEX_DRIFT';
  end if;

  if (
    select count(*)
      from pg_proc function_row
      join pg_namespace namespace_row
        on namespace_row.oid = function_row.pronamespace
     where namespace_row.nspname = 'public'
       and function_row.proname = any(array[
         'profitability_v21_guard_command_receipt',
         'profitability_v21_guard_hygiene_package',
         'profitability_v21_validate_financial_pair',
         'profitability_v21_validate_hygiene_pair'
       ]::text[])
       and function_row.prorettype = 'trigger'::regtype
       and not function_row.prosecdef
       and function_row.proconfig =
           array['search_path=pg_catalog, public']::text[]
  ) <> 4 then
    raise exception 'PROFITABILITY_V21_TRIGGER_FUNCTION_SET_DRIFT';
  end if;

  if not exists (
    select 1 from pg_proc
     where oid = 'public.profitability_v21_validate_financial_pair()'::regprocedure
       and position(
         'PROFITABILITY_V21_FINANCIAL_PAIR_DIMENSION_MISMATCH' in prosrc
       ) > 0
  ) or not exists (
    select 1 from pg_proc
     where oid = 'public.profitability_v21_validate_hygiene_pair()'::regprocedure
       and position(
         'PROFITABILITY_V21_HYGIENE_PAIR_DIMENSION_MISMATCH' in prosrc
       ) > 0
  ) then
    raise exception 'PROFITABILITY_V21_PAIR_FUNCTION_DRIFT';
  end if;

  if (
    select count(*)
      from pg_trigger trigger_row
     where trigger_row.tgname = any(array[
       'profitability_command_receipt_transition_v21',
       'object_hygiene_package_transition_v21',
       'object_financial_entry_pair_dimensions_v21',
       'object_hygiene_package_pair_dimensions_v21'
     ]::text[])
       and trigger_row.tgenabled = 'O'
       and not trigger_row.tgisinternal
  ) <> 4 then
    raise exception 'PROFITABILITY_V21_TRIGGER_SET_DRIFT';
  end if;

  if not exists (
    select 1 from pg_class view_row
    join pg_namespace namespace_row on namespace_row.oid = view_row.relnamespace
    where namespace_row.nspname = 'public'
      and view_row.relname = 'profitability_effective_financial_entry'
      and view_row.relkind = 'v'
      and view_row.reloptions @> array['security_invoker=true']::text[]
  ) or not exists (
    select 1 from pg_class view_row
    join pg_namespace namespace_row on namespace_row.oid = view_row.relnamespace
    where namespace_row.nspname = 'public'
      and view_row.relname = 'profitability_effective_hygiene_package'
      and view_row.relkind = 'v'
      and view_row.reloptions @> array['security_invoker=true']::text[]
  ) then
    raise exception 'PROFITABILITY_V21_SECURITY_INVOKER_VIEW_DRIFT';
  end if;

  if position(
       '''PLAN''' in pg_get_viewdef(
         'public.profitability_effective_financial_entry'::regclass,
         true
       )
     ) > 0
     or position(
       '''PLAN''' in pg_get_viewdef(
         'public.profitability_effective_hygiene_package'::regclass,
         true
       )
     ) > 0
     or position(
       'value_key' in pg_get_viewdef(
         'public.profitability_effective_financial_entry'::regclass,
         true
       )
     ) = 0
     or position(
       'DISTINCT ON' in upper(pg_get_viewdef(
         'public.profitability_effective_hygiene_package'::regclass,
         true
       ))
     ) = 0
     or position(
       'recognition_key' in pg_get_viewdef(
         'public.profitability_effective_hygiene_package'::regclass,
         true
       )
     ) = 0 then
    raise exception 'PROFITABILITY_V21_EFFECTIVE_VIEW_DRIFT';
  end if;

  if runtime_role_oid is null
     or not has_table_privilege(
       runtime_role_oid,
       'public.profitability_command_receipt',
       'SELECT, INSERT'
     )
     or has_table_privilege(
       runtime_role_oid,
       'public.profitability_command_receipt',
       'DELETE'
     )
     or not has_column_privilege(
       runtime_role_oid,
       'public.profitability_command_receipt',
       'state',
       'UPDATE'
     )
     or not has_table_privilege(
       runtime_role_oid,
       'public.profitability_financial_model_enforcement',
       'SELECT'
     )
     or has_table_privilege(
       runtime_role_oid,
       'public.profitability_financial_model_enforcement',
       'INSERT, UPDATE, DELETE'
     )
     or not has_table_privilege(
       runtime_role_oid,
       'public.object_hygiene_package_version',
       'SELECT, INSERT'
     )
     or has_table_privilege(
       runtime_role_oid,
       'public.object_hygiene_package_version',
       'DELETE'
     )
     or not has_column_privilege(
       runtime_role_oid,
       'public.object_hygiene_package_version',
       'status',
       'UPDATE'
     )
     or has_column_privilege(
       runtime_role_oid,
       'public.object_hygiene_package_version',
       'price_net_minor',
       'UPDATE'
     )
     or has_column_privilege(
       runtime_role_oid,
       'public.object_hygiene_package_version',
       'cost_minor',
       'UPDATE'
     )
     or not has_table_privilege(
       runtime_role_oid,
       'public.profitability_effective_financial_entry',
       'SELECT'
     )
     or not has_table_privilege(
       runtime_role_oid,
       'public.profitability_effective_hygiene_package',
       'SELECT'
     ) then
    raise exception 'PROFITABILITY_V21_RUNTIME_ACL_DRIFT';
  end if;

  if has_function_privilege(
       runtime_role_oid,
       'public.profitability_v21_guard_command_receipt()',
       'EXECUTE'
     ) or has_function_privilege(
       runtime_role_oid,
       'public.profitability_v21_guard_hygiene_package()',
       'EXECUTE'
     ) or has_function_privilege(
       runtime_role_oid,
       'public.profitability_v21_validate_financial_pair()',
       'EXECUTE'
     ) or has_function_privilege(
       runtime_role_oid,
       'public.profitability_v21_validate_hygiene_pair()',
       'EXECUTE'
     ) then
    raise exception 'PROFITABILITY_V21_TRIGGER_FUNCTION_ACL_EXCESS';
  end if;

  if exists (
    select 1
      from pg_class relation_row
      join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
      cross join lateral aclexplode(
        coalesce(relation_row.relacl, acldefault('r', relation_row.relowner))
      ) privilege_row
     where namespace_row.nspname = 'public'
       and relation_row.relname = any(array[
         'profitability_command_receipt',
         'profitability_financial_model_enforcement',
         'object_hygiene_package_version',
         'profitability_effective_financial_entry',
         'profitability_effective_hygiene_package'
       ])
       and privilege_row.grantee = 0
       and privilege_row.privilege_type = any(array[
         'SELECT', 'INSERT', 'UPDATE', 'DELETE'
       ]::text[])
  ) then
    raise exception 'PROFITABILITY_V21_PUBLIC_ACL_EXCESS';
  end if;
end
$profitability_v21_postflight$;

reset role;
