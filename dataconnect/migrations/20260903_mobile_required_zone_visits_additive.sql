-- Additive, default-off foundation for mandatory QR zone visits.
-- This file is not executed by the application. Production requires a separate owner approval,
-- a privileged migration identity, a backup/PITR check and the documented pre/postflight.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

select pg_advisory_xact_lock(
  hashtextextended('cleanzi:mobile-required-zone-visits:v1', 0)
);

do $$
begin
  if to_regclass('public.organizations') is null then
    raise exception 'REQUIRED_ZONE_VISITS_ORGANIZATIONS_TABLE_MISSING';
  end if;
  if to_regclass('public.zone') is null then
    raise exception 'REQUIRED_ZONE_VISITS_ZONE_TABLE_MISSING';
  end if;
  if to_regclass('public.workday') is null then
    raise exception 'REQUIRED_ZONE_VISITS_WORKDAY_TABLE_MISSING';
  end if;
end
$$;

alter table public.zone
  add column if not exists required_visit boolean not null default false;

do $$
declare
  data_type_name text;
begin
  select data_type
    into data_type_name
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'zone'
     and column_name = 'required_visit';

  if data_type_name is distinct from 'boolean' then
    raise exception 'REQUIRED_ZONE_VISITS_ZONE_COLUMN_SHAPE_UNSAFE';
  end if;
end
$$;

alter table public.zone
  alter column required_visit set default false;

update public.zone
   set required_visit = false
 where required_visit is null;

alter table public.zone
  alter column required_visit set not null;

create table if not exists public.mobile_object_visit (
  org_id varchar(64) not null,
  visit_id varchar(96) not null,
  workday_id varchar(64) not null,
  worker_login varchar(80) not null,
  client_id varchar(64) not null,
  client_name text,
  source_zone_id varchar(64),
  status varchar(20) not null default 'ACTIVE',
  started_at timestamptz not null,
  completed_at timestamptz,
  overridden_at timestamptz,
  overridden_by varchar(128),
  override_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, visit_id),
  constraint mobile_object_visit_workday_fk
    foreign key (org_id, workday_id)
    references public.workday (org_id, workday_id)
    on delete cascade,
  constraint mobile_object_visit_status_check
    check (status in ('ACTIVE', 'COMPLETED', 'OVERRIDDEN')),
  constraint mobile_object_visit_override_shape_check
    check (
      (status <> 'OVERRIDDEN' and overridden_at is null and overridden_by is null and override_reason is null)
      or (status = 'OVERRIDDEN' and overridden_at is not null and overridden_by is not null and nullif(btrim(override_reason), '') is not null)
    ),
  constraint mobile_object_visit_completion_shape_check
    check (
      (status = 'ACTIVE' and completed_at is null)
      or (status in ('COMPLETED', 'OVERRIDDEN') and completed_at is not null)
    )
);

create unique index if not exists mobile_object_visit_workday_client_uidx
  on public.mobile_object_visit (org_id, workday_id, client_id);

create index if not exists mobile_object_visit_worker_active_idx
  on public.mobile_object_visit (org_id, worker_login, status, started_at desc);

create table if not exists public.mobile_object_visit_requirement (
  org_id varchar(64) not null,
  visit_id varchar(96) not null,
  zone_id varchar(64) not null,
  zone_name text,
  location text,
  visited_at timestamptz,
  visited_event_id varchar(96),
  visited_client_action_id varchar(128),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, visit_id, zone_id),
  constraint mobile_object_visit_requirement_visit_fk
    foreign key (org_id, visit_id)
    references public.mobile_object_visit (org_id, visit_id)
    on delete cascade
);

create index if not exists mobile_object_visit_requirement_missing_idx
  on public.mobile_object_visit_requirement (org_id, visit_id, zone_id)
  where visited_at is null;

grant usage on schema public to portal_app;
grant select, insert, update on table public.zone to portal_app;
grant select, insert, update on table public.mobile_object_visit to portal_app;
grant select, insert, update on table public.mobile_object_visit_requirement to portal_app;

do $$
begin
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'zone'
       and column_name = 'required_visit'
       and data_type = 'boolean'
       and is_nullable = 'NO'
       and column_default in ('false', 'false::boolean')
  ) then
    raise exception 'REQUIRED_ZONE_VISITS_ZONE_POSTFLIGHT_FAILED';
  end if;
  if to_regclass('public.mobile_object_visit') is null
     or to_regclass('public.mobile_object_visit_requirement') is null then
    raise exception 'REQUIRED_ZONE_VISITS_TABLE_POSTFLIGHT_FAILED';
  end if;
end
$$;

commit;

-- Read-only preflight before a future production migration:
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'zone' and column_name = 'required_visit';
-- select to_regclass('public.mobile_object_visit'), to_regclass('public.mobile_object_visit_requirement');

-- Read-only postflight after a separately approved migration:
-- select required_visit, count(*) from public.zone group by required_visit order by required_visit;
-- select indexname, indexdef from pg_indexes
--  where schemaname = 'public' and tablename in ('mobile_object_visit', 'mobile_object_visit_requirement');
