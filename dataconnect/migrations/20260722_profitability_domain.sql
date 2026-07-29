-- Review-only migration for the Cleanzi profitability domain.
-- Do not run automatically. All financial periods use half-open ranges [start, end).

create extension if not exists btree_gist;

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
  primary key (org_id, object_id),
  unique (org_id, object_id, client_id),
  foreign key (org_id) references public.organizations(org_id),
  foreign key (org_id, client_id) references public.client(org_id, client_id),
  check (default_currency ~ '^[A-Z]{3}$'),
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
  primary key (org_id, object_id, rate_id),
  foreign key (org_id, object_id) references public.service_object(org_id, object_id),
  foreign key (org_id, worker_login) references public.worker(org_id, login),
  check (hourly_cost_minor >= 0),
  check (currency ~ '^[A-Z]{3}$'),
  check (effective_to is null or effective_to > effective_from),
  check (source in ('MANUAL', 'IMPORT', 'INTEGRATION', 'CORRECTION'))
);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'worker_cost_rate_no_overlap'
       and conrelid = 'public.worker_cost_rate'::regclass
  ) then
    alter table public.worker_cost_rate
      add constraint worker_cost_rate_no_overlap
      exclude using gist (
        org_id with =,
        object_id with =,
        worker_login with =,
        daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[)') with &&
      ) where (archived_at is null);
  end if;
end
$$;

create index if not exists worker_cost_rate_lookup_idx
  on public.worker_cost_rate (org_id, object_id, worker_login, effective_from, effective_to)
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
  primary key (org_id, object_id, contract_version_id),
  foreign key (org_id, object_id) references public.service_object(org_id, object_id),
  check (billing_model in ('MONTHLY_FIXED', 'HOURLY', 'PER_SERVICE', 'MIXED')),
  check (monthly_value_minor is null or monthly_value_minor >= 0),
  check (hourly_rate_minor is null or hourly_rate_minor >= 0),
  check (service_rate_minor is null or service_rate_minor >= 0),
  check (currency ~ '^[A-Z]{3}$'),
  check (vat_rate_bps is null or vat_rate_bps between 0 and 10000),
  check (target_profitability_bps is null or target_profitability_bps between -100000 and 10000),
  check (effective_to is null or effective_to > effective_from),
  check (
    monthly_value_minor is not null
    or hourly_rate_minor is not null
    or service_rate_minor is not null
  ),
  check (source in ('MANUAL', 'IMPORT', 'INTEGRATION', 'CORRECTION'))
);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'object_contract_version_no_overlap'
       and conrelid = 'public.object_contract_version'::regclass
  ) then
    alter table public.object_contract_version
      add constraint object_contract_version_no_overlap
      exclude using gist (
        org_id with =,
        object_id with =,
        daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[)') with &&
      ) where (archived_at is null);
  end if;
end
$$;

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
  primary key (org_id, object_id, periodic_work_id),
  foreign key (org_id, object_id) references public.service_object(org_id, object_id),
  foreign key (org_id, task_id) references public.task(org_id, id_task),
  check (work_type in (
    'WINDOW_CLEANING', 'CARPET_CLEANING', 'FLOOR_DEEP_CLEANING',
    'FLOOR_PROTECTION', 'SEASONAL', 'REPLACEMENT', 'INTERVENTION', 'OTHER'
  )),
  check (status in ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  check (planned_minutes is null or planned_minutes >= 0),
  check (actual_minutes is null or actual_minutes >= 0)
);

create table if not exists public.periodic_work_zone (
  org_id varchar(64) not null,
  object_id varchar(64) not null,
  periodic_work_id varchar(64) not null,
  zone_id varchar(64) not null,
  primary key (org_id, object_id, periodic_work_id, zone_id),
  foreign key (org_id, object_id, periodic_work_id)
    references public.periodic_work(org_id, object_id, periodic_work_id),
  foreign key (org_id, zone_id) references public.zone(org_id, id)
);

create index if not exists periodic_work_period_idx
  on public.periodic_work (org_id, object_id, executed_on, planned_on)
  where archived_at is null;

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
  primary key (org_id, object_id, equipment_id),
  foreign key (org_id, object_id) references public.service_object(org_id, object_id),
  check (financing in ('PURCHASE', 'LEASE', 'RENTAL')),
  check (recognition_method in ('IMMEDIATE', 'DEPRECIATION', 'INSTALLMENT')),
  check (purchase_value_minor is null or purchase_value_minor >= 0),
  check (monthly_installment_minor is null or monthly_installment_minor >= 0),
  check (depreciation_months is null or depreciation_months > 0),
  check (currency ~ '^[A-Z]{3}$'),
  check (ended_on is null or ended_on > started_on),
  check (
    (financing = 'PURCHASE' and recognition_method = 'IMMEDIATE'
      and purchase_value_minor is not null and depreciation_months is null
      and monthly_installment_minor is null)
    or
    (financing = 'PURCHASE' and recognition_method = 'DEPRECIATION'
      and purchase_value_minor is not null and depreciation_months is not null
      and monthly_installment_minor is null)
    or
    (financing in ('LEASE', 'RENTAL') and recognition_method = 'INSTALLMENT'
      and purchase_value_minor is null and depreciation_months is null
      and monthly_installment_minor is not null)
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
  primary key (org_id, object_id, entry_id),
  foreign key (org_id, object_id) references public.service_object(org_id, object_id),
  foreign key (org_id, object_id, periodic_work_id)
    references public.periodic_work(org_id, object_id, periodic_work_id),
  foreign key (org_id, object_id, equipment_id)
    references public.object_equipment(org_id, object_id, equipment_id),
  check (entry_group in (
    'REVENUE', 'MATERIAL', 'EQUIPMENT_SERVICE', 'PERIODIC_DIRECT',
    'TRANSPORT', 'COORDINATION', 'SUBCONTRACTOR', 'DELIVERY', 'TRAINING',
    'OTHER_DIRECT', 'SHARED_ALLOCATION'
  )),
  check (amount_minor >= 0),
  check (currency ~ '^[A-Z]{3}$'),
  check (recurrence in ('ONE_TIME', 'MONTHLY', 'ACTUAL_USAGE')),
  check (source in ('MANUAL', 'WAREHOUSE', 'IMPORT', 'INTEGRATION', 'CORRECTION')),
  check (status in ('DRAFT', 'POSTED', 'VOID', 'CORRECTED')),
  check (
    (recurrence in ('ONE_TIME', 'ACTUAL_USAGE') and occurred_on is not null)
    or
    (recurrence = 'MONTHLY' and period_start is not null)
  ),
  check (period_end is null or (period_start is not null and period_end > period_start))
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
  primary key (org_id, object_id, period_id),
  foreign key (org_id, object_id) references public.service_object(org_id, object_id),
  check (period_end > period_start),
  check (currency ~ '^[A-Z]{3}$'),
  check (status in ('OPEN', 'CLOSED', 'CORRECTED', 'ARCHIVED')),
  check (version > 0)
);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'financial_period_no_overlap'
       and conrelid = 'public.financial_period'::regclass
  ) then
    alter table public.financial_period
      add constraint financial_period_no_overlap
      exclude using gist (
        org_id with =,
        object_id with =,
        daterange(period_start, period_end, '[)') with &&
      ) where (status <> 'ARCHIVED');
  end if;
end
$$;

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
  primary key (org_id, object_id, snapshot_id),
  unique (org_id, object_id, period_id, snapshot_id),
  foreign key (org_id, object_id, period_id)
    references public.financial_period(org_id, object_id, period_id),
  foreign key (org_id, object_id, period_id, correction_of_snapshot_id)
    references public.profitability_snapshot(org_id, object_id, period_id, snapshot_id),
  check (currency ~ '^[A-Z]{3}$'),
  check (completeness_bps between 0 and 10000),
  check (
    calculation_status in (
      'ABOVE_TARGET', 'BELOW_TARGET', 'CALCULATED', 'INCOMPLETE',
      'NEGATIVE', 'NOT_CALCULABLE'
    )
  ),
  check (
    (calculation_status = 'INCOMPLETE' and total_cost_minor is null
      and margin_minor is null and profitability_bps is null)
    or calculation_status <> 'INCOMPLETE'
  )
);

create index if not exists profitability_snapshot_period_idx
  on public.profitability_snapshot (org_id, object_id, period_id, calculated_at desc);

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
  primary key (org_id, object_id, audit_id),
  foreign key (org_id, object_id) references public.service_object(org_id, object_id),
  check (source in ('PORTAL', 'IMPORT', 'INTEGRATION', 'BACKEND_CALCULATION', 'CORRECTION'))
);

create index if not exists profitability_audit_entity_idx
  on public.profitability_audit
  (org_id, object_id, entity_type, entity_id, created_at desc);

create table if not exists public.profitability_permission (
  org_id varchar(64) not null,
  permission_id varchar(64) not null,
  uid varchar(128) not null,
  permission_code varchar(80) not null,
  object_id varchar(64),
  granted_at timestamptz not null default now(),
  granted_by_uid varchar(128) not null,
  revoked_at timestamptz,
  revoked_by_uid varchar(128),
  primary key (org_id, permission_id),
  foreign key (org_id) references public.organizations(org_id),
  foreign key (org_id, uid) references public.organization_member(org_id, uid),
  foreign key (org_id, object_id) references public.service_object(org_id, object_id),
  check (permission_code in (
    'profitability:view-internal', 'profitability:edit',
    'profitability:close-period', 'profitability:view-client-summary'
  ))
);

create unique index if not exists profitability_permission_active_scope_idx
  on public.profitability_permission
  (org_id, uid, permission_code, coalesce(object_id, '*'))
  where revoked_at is null;

-- Link existing operational truth to ServiceObject instead of creating a parallel
-- attendance model. Existing rows remain nullable until an explicit, reviewed backfill.
alter table if exists public.zone add column if not exists object_id varchar(64);
alter table if exists public.task add column if not exists object_id varchar(64);
alter table if exists public.event add column if not exists object_id varchar(64);
alter table if exists public.event add column if not exists periodic_work_id varchar(64);
alter table if exists public.event add column if not exists task_id varchar(180);
alter table if exists public.event add column if not exists attendance_source varchar(16);

-- Composite keys are required so dependent records cannot point at a task or zone
-- belonging to another ServiceObject in the same organization.
create unique index if not exists task_org_object_id_unique
  on public.task (org_id, object_id, id_task);
create unique index if not exists zone_org_object_id_unique
  on public.zone (org_id, object_id, id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'zone_service_object_fk'
       and conrelid = 'public.zone'::regclass
  ) then
    alter table public.zone
      add constraint zone_service_object_fk
      foreign key (org_id, object_id, client_id)
      references public.service_object(org_id, object_id, client_id)
      not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'task_service_object_fk'
       and conrelid = 'public.task'::regclass
  ) then
    alter table public.task
      add constraint task_service_object_fk
      foreign key (org_id, object_id)
      references public.service_object(org_id, object_id)
      not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'task_service_object_client_fk'
       and conrelid = 'public.task'::regclass
  ) then
    alter table public.task
      add constraint task_service_object_client_fk
      foreign key (org_id, object_id, client_id)
      references public.service_object(org_id, object_id, client_id)
      not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'zone_object_requires_client_check'
       and conrelid = 'public.zone'::regclass
  ) then
    alter table public.zone
      add constraint zone_object_requires_client_check
      check (object_id is null or client_id is not null)
      not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'task_object_requires_client_check'
       and conrelid = 'public.task'::regclass
  ) then
    alter table public.task
      add constraint task_object_requires_client_check
      check (object_id is null or client_id is not null)
      not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'task_zone_object_fk'
       and conrelid = 'public.task'::regclass
  ) then
    alter table public.task
      add constraint task_zone_object_fk
      foreign key (org_id, object_id, zone_id)
      references public.zone(org_id, object_id, id)
      not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'periodic_work_task_object_fk'
       and conrelid = 'public.periodic_work'::regclass
  ) then
    alter table public.periodic_work
      add constraint periodic_work_task_object_fk
      foreign key (org_id, object_id, task_id)
      references public.task(org_id, object_id, id_task)
      not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'periodic_work_zone_object_fk'
       and conrelid = 'public.periodic_work_zone'::regclass
  ) then
    alter table public.periodic_work_zone
      add constraint periodic_work_zone_object_fk
      foreign key (org_id, object_id, zone_id)
      references public.zone(org_id, object_id, id)
      not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'event_service_object_fk'
       and conrelid = 'public.event'::regclass
  ) then
    alter table public.event
      add constraint event_service_object_fk
      foreign key (org_id, object_id)
      references public.service_object(org_id, object_id)
      not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'event_periodic_work_fk'
       and conrelid = 'public.event'::regclass
  ) then
    alter table public.event
      add constraint event_periodic_work_fk
      foreign key (org_id, object_id, periodic_work_id)
      references public.periodic_work(org_id, object_id, periodic_work_id)
      not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'event_task_fk'
       and conrelid = 'public.event'::regclass
  ) then
    alter table public.event
      add constraint event_task_fk
      foreign key (org_id, task_id)
      references public.task(org_id, id_task)
      not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'event_task_object_fk'
       and conrelid = 'public.event'::regclass
  ) then
    alter table public.event
      add constraint event_task_object_fk
      foreign key (org_id, object_id, task_id)
      references public.task(org_id, object_id, id_task)
      not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'event_zone_object_fk'
       and conrelid = 'public.event'::regclass
  ) then
    alter table public.event
      add constraint event_zone_object_fk
      foreign key (org_id, object_id, zone_id)
      references public.zone(org_id, object_id, id)
      not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'event_attendance_source_check'
       and conrelid = 'public.event'::regclass
  ) then
    alter table public.event
      add constraint event_attendance_source_check
      check (attendance_source is null or attendance_source in ('QR', 'NFC', 'MANUAL', 'IMPORT'))
      not valid;
  end if;
end
$$;

-- Existing Data Connect mutations do not yet expose object_id. Resolve it from
-- the zone at the database boundary, using only an explicitly mapped zone.
create or replace function public.profitability_resolve_object_from_zone()
returns trigger
language plpgsql
as $$
declare
  resolved_object_id varchar(64);
begin
  if tg_op = 'UPDATE' and new.zone_id is distinct from old.zone_id then
    if new.zone_id is null then
      new.object_id := null;
      return new;
    end if;
    select z.object_id
      into resolved_object_id
      from public.zone z
     where z.org_id = new.org_id
       and z.id = new.zone_id;
    new.object_id := resolved_object_id;
  elsif new.object_id is null and new.zone_id is not null then
    select z.object_id
      into resolved_object_id
      from public.zone z
     where z.org_id = new.org_id
       and z.id = new.zone_id;
    new.object_id := resolved_object_id;
  end if;
  return new;
end
$$;

drop trigger if exists event_resolve_service_object on public.event;
create trigger event_resolve_service_object
before insert or update of org_id, zone_id, object_id on public.event
for each row execute function public.profitability_resolve_object_from_zone();

drop trigger if exists task_resolve_service_object on public.task;
create trigger task_resolve_service_object
before insert or update of org_id, zone_id, object_id on public.task
for each row execute function public.profitability_resolve_object_from_zone();

create or replace function public.profitability_backfill_mapped_zone()
returns trigger
language plpgsql
as $$
begin
  if new.object_id is not null and old.object_id is null then
    update public.task
       set object_id = new.object_id
     where org_id = new.org_id and zone_id = new.id and object_id is null;
    update public.event
       set object_id = new.object_id
     where org_id = new.org_id and zone_id = new.id and object_id is null;
  end if;
  return new;
end
$$;

drop trigger if exists zone_backfill_service_object on public.zone;
create trigger zone_backfill_service_object
after update of object_id on public.zone
for each row execute function public.profitability_backfill_mapped_zone();

-- Deterministic backfill only: never infer an object from names or coordinates.
-- Rows whose zone has not been explicitly mapped remain null and are reported as
-- incomplete by the profitability calculator.
update public.task t
   set object_id = z.object_id
  from public.zone z
 where t.org_id = z.org_id
   and t.zone_id = z.id
   and t.object_id is null
   and z.object_id is not null;

update public.event e
   set object_id = z.object_id
  from public.zone z
 where e.org_id = z.org_id
   and e.zone_id = z.id
   and e.object_id is null
   and z.object_id is not null;

create index if not exists zone_org_object_idx
  on public.zone (org_id, object_id) where object_id is not null;
create index if not exists task_org_object_date_idx
  on public.task (org_id, object_id, date_ymd) where object_id is not null;
create index if not exists event_org_object_start_idx
  on public.event (org_id, object_id, start_at) where object_id is not null;
create index if not exists event_org_periodic_work_idx
  on public.event (org_id, object_id, periodic_work_id)
  where periodic_work_id is not null;

create or replace function public.profitability_reject_immutable_change()
returns trigger
language plpgsql
as $$
begin
  raise exception '% records are immutable; append a correction instead', tg_table_name
    using errcode = '55000';
end
$$;

drop trigger if exists profitability_snapshot_immutable on public.profitability_snapshot;
create trigger profitability_snapshot_immutable
before update or delete on public.profitability_snapshot
for each row execute function public.profitability_reject_immutable_change();

drop trigger if exists profitability_audit_immutable on public.profitability_audit;
create trigger profitability_audit_immutable
before update or delete on public.profitability_audit
for each row execute function public.profitability_reject_immutable_change();

-- Source rows may be archived or corrected, but never hard-deleted. Closed-period
-- history remains reproducible through immutable snapshots and audit records.
drop trigger if exists worker_cost_rate_no_hard_delete on public.worker_cost_rate;
create trigger worker_cost_rate_no_hard_delete
before delete on public.worker_cost_rate
for each row execute function public.profitability_reject_immutable_change();

drop trigger if exists object_contract_version_no_hard_delete on public.object_contract_version;
create trigger object_contract_version_no_hard_delete
before delete on public.object_contract_version
for each row execute function public.profitability_reject_immutable_change();

drop trigger if exists periodic_work_no_hard_delete on public.periodic_work;
create trigger periodic_work_no_hard_delete
before delete on public.periodic_work
for each row execute function public.profitability_reject_immutable_change();

drop trigger if exists object_equipment_no_hard_delete on public.object_equipment;
create trigger object_equipment_no_hard_delete
before delete on public.object_equipment
for each row execute function public.profitability_reject_immutable_change();

drop trigger if exists object_financial_entry_no_hard_delete on public.object_financial_entry;
create trigger object_financial_entry_no_hard_delete
before delete on public.object_financial_entry
for each row execute function public.profitability_reject_immutable_change();

drop trigger if exists financial_period_no_hard_delete on public.financial_period;
create trigger financial_period_no_hard_delete
before delete on public.financial_period
for each row execute function public.profitability_reject_immutable_change();

comment on table public.service_object is
  'Operational object owned by a Client; parent of Zone and all profitability records.';
comment on column public.worker_cost_rate.hourly_cost_minor is
  'Full employer hourly cost in integer minor currency units, never net salary.';
comment on column public.profitability_snapshot.payload is
  'Immutable backend calculation input/result snapshot; bigint values are decimal strings.';
comment on column public.event.object_id is
  'ServiceObject resolved from the same QR/NFC operational event; no unrelated fallback.';
