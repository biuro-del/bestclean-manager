-- Additive schema for authenticated mobile QR idempotency and bounded offline time.
-- REVIEW-ONLY. The application never executes this migration at runtime.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

select pg_advisory_xact_lock(
  hashtextextended('cleanzi:mobile-scan-offline-outbox:v1', 0)
);

do $$
begin
  if to_regclass('public.organizations') is null then
    raise exception 'MOBILE_SCAN_ORGANIZATIONS_TABLE_MISSING';
  end if;
end
$$;

create table if not exists public.worker_runtime_state (
  org_id varchar(64) not null,
  worker_login varchar(80) not null,
  worker_name text,
  active_workday_id varchar(64),
  workday_start_at timestamptz,
  active_event_id varchar(64),
  active_zone_id varchar(64),
  zone_start_at timestamptz,
  status varchar(32),
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (org_id, worker_login)
);

create table if not exists public.mobile_scan_command (
  org_id varchar(64) not null,
  worker_login varchar(80) not null,
  client_action_id varchar(128) not null,
  qr_code varchar(128),
  action varchar(40),
  result jsonb,
  request_fingerprint varchar(64),
  occurred_at timestamptz,
  received_at timestamptz,
  offline boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (org_id, worker_login, client_action_id)
);

alter table public.mobile_scan_command
  add column if not exists request_fingerprint varchar(64),
  add column if not exists occurred_at timestamptz,
  add column if not exists received_at timestamptz,
  add column if not exists offline boolean not null default false;

-- Existing rows predate request fingerprints. They intentionally remain null:
-- a replay of such an old identifier fails closed instead of claiming an
-- unprovable exact-payload match. New writes are required to be complete.
alter table public.mobile_scan_command
  alter column offline set default false,
  alter column offline set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.mobile_scan_command'::regclass
       and conname = 'mobile_scan_command_request_fingerprint_check'
  ) then
    alter table public.mobile_scan_command
      add constraint mobile_scan_command_request_fingerprint_check
      check (request_fingerprint is null or request_fingerprint ~ '^[0-9a-f]{64}$');
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.mobile_scan_command'::regclass
       and conname = 'mobile_scan_command_offline_time_check'
  ) then
    alter table public.mobile_scan_command
      add constraint mobile_scan_command_offline_time_check
      check (
        (request_fingerprint is null)
        or (occurred_at is not null and received_at is not null)
      );
  end if;
end
$$;

create index if not exists mobile_scan_command_worker_received_idx
  on public.mobile_scan_command (org_id, worker_login, received_at desc)
  where request_fingerprint is not null;

grant usage on schema public to portal_app;
grant select, insert, update on table public.worker_runtime_state to portal_app;
grant select, insert on table public.mobile_scan_command to portal_app;

do $$
declare
  required_column_count integer;
begin
  select count(*)
    into required_column_count
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'mobile_scan_command'
     and column_name in (
       'request_fingerprint',
       'occurred_at',
       'received_at',
       'offline',
       'result'
     );
  if required_column_count <> 5 then
    raise exception 'MOBILE_SCAN_COMMAND_POSTFLIGHT_FAILED';
  end if;
end
$$;

commit;

-- Read-only postflight:
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_schema = 'public'
--    and table_name = 'mobile_scan_command'
--  order by ordinal_position;
-- select count(*) filter (where request_fingerprint is null) as legacy_rows,
--        count(*) filter (where request_fingerprint is not null) as proven_rows
--   from public.mobile_scan_command;
