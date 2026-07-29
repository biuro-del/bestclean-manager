-- REVIEW-ONLY MIGRATION.
-- DO NOT RUN for the additive stage.
-- The safe stage-2 schema is isolated in
-- 20260724_service_execution_correlation_additive.sql.
-- This older file contains history updates, NOT NULL, a default and a trigger;
-- it requires a separate data-classification decision and maintenance plan.
-- Apply only after reviewing the Data Connect schema deployment order.
-- This migration deliberately does not backfill plan links by inference.

begin;

-- Durable link from an observed service event to the exact plan occurrence.
-- task_id and event_task_fk are also introduced by the profitability-domain
-- migration; IF NOT EXISTS and the shared constraint name keep either order safe.
alter table if exists public.event
  add column if not exists task_id varchar(180);
alter table if exists public.event
  add column if not exists occurrence_date_ymd varchar(10);
alter table if exists public.event
  add column if not exists service_block_id varchar(180);
alter table if exists public.event
  add column if not exists allocation_id varchar(180);
alter table if exists public.event
  add column if not exists work_slot_key varchar(255);
alter table if exists public.event
  add column if not exists event_type varchar(32);
alter table if exists public.event
  add column if not exists match_status varchar(16);
alter table if exists public.event
  add column if not exists match_method varchar(64);
alter table if exists public.event
  add column if not exists match_reason text;
alter table if exists public.event
  add column if not exists matched_at timestamptz;
alter table if exists public.event
  add column if not exists plan_snapshot_version integer;
alter table if exists public.event
  add column if not exists planned_start_at timestamptz;
alter table if exists public.event
  add column if not exists planned_end_at timestamptz;
alter table if exists public.event
  add column if not exists planned_duration_minutes integer;
alter table if exists public.event
  add column if not exists task_updated_at_snapshot timestamptz;

-- Existing events are explicitly unresolved. No historical event is marked as
-- MATCHED until a reviewed correlator writes a concrete plan identity.
alter table public.event
  alter column match_status set default 'UNMATCHED';
update public.event
   set match_status = 'UNMATCHED'
 where match_status is null;
update public.event
   set match_reason = 'LEGACY_EVENT_NOT_CORRELATED'
 where nullif(btrim(match_reason), '') is null;
alter table public.event
  alter column match_status set not null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
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
    select 1
      from pg_constraint
     where conname = 'event_plan_match_status_check'
       and conrelid = 'public.event'::regclass
  ) then
    alter table public.event
      add constraint event_plan_match_status_check
      check (match_status in ('MATCHED', 'UNMATCHED', 'AMBIGUOUS'));
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'event_plan_match_coherence_v2_check'
       and conrelid = 'public.event'::regclass
  ) then
    alter table public.event
      add constraint event_plan_match_coherence_v2_check
      check (
        (
          match_status = 'MATCHED'
          and task_id is not null
          and occurrence_date_ymd is not null
          and nullif(btrim(service_block_id), '') is not null
          and nullif(btrim(allocation_id), '') is not null
          and nullif(btrim(work_slot_key), '') is not null
          and event_type = 'CLEAN'
          and match_method in ('EXACT_IDS_UNIQUE', 'EXACT_IDS_AND_TIME_WINDOW')
          and nullif(btrim(match_reason), '') is not null
          and match_reason = match_method
          and matched_at is not null
          and plan_snapshot_version is not null
          and plan_snapshot_version > 0
          and task_updated_at_snapshot is not null
        )
        or (
          match_status in ('UNMATCHED', 'AMBIGUOUS')
          and matched_at is null
          and match_method is null
          and nullif(btrim(match_reason), '') is not null
          and task_id is null
          and occurrence_date_ymd is null
          and service_block_id is null
          and allocation_id is null
          and work_slot_key is null
          and plan_snapshot_version is null
          and planned_start_at is null
          and planned_end_at is null
          and planned_duration_minutes is null
          and task_updated_at_snapshot is null
        )
      );
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'event_plan_occurrence_date_format_check'
       and conrelid = 'public.event'::regclass
  ) then
    alter table public.event
      add constraint event_plan_occurrence_date_format_check
      check (
        occurrence_date_ymd is null
        or (
          occurrence_date_ymd ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          and to_char(
            to_date(occurrence_date_ymd, 'FXYYYY-MM-DD'),
            'YYYY-MM-DD'
          ) = occurrence_date_ymd
        )
      );
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'event_plan_snapshot_version_check'
       and conrelid = 'public.event'::regclass
  ) then
    alter table public.event
      add constraint event_plan_snapshot_version_check
      check (plan_snapshot_version is null or plan_snapshot_version > 0);
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'event_plan_snapshot_duration_check'
       and conrelid = 'public.event'::regclass
  ) then
    alter table public.event
      add constraint event_plan_snapshot_duration_check
      check (planned_duration_minutes is null or planned_duration_minutes > 0);
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'event_plan_snapshot_window_check'
       and conrelid = 'public.event'::regclass
  ) then
    alter table public.event
      add constraint event_plan_snapshot_window_check
      check (
        planned_start_at is null
        or planned_end_at is null
        or planned_end_at > planned_start_at
      );
  end if;
end
$$;

-- A correction of source facts invalidates the old plan link automatically.
-- Closing an event (end/status/duration) intentionally preserves the link.
create or replace function public.invalidate_event_plan_correlation_on_source_change()
returns trigger
language plpgsql
as $$
begin
  if old.match_status = 'MATCHED'
     and (
       new.org_id is distinct from old.org_id
       or new.zone_id is distinct from old.zone_id
       or new.worker_login is distinct from old.worker_login
       or new.start_at is distinct from old.start_at
     )
  then
    new.task_id := null;
    new.occurrence_date_ymd := null;
    new.service_block_id := null;
    new.allocation_id := null;
    new.work_slot_key := null;
    new.match_status := 'UNMATCHED';
    new.match_method := null;
    new.match_reason := 'EVENT_SOURCE_FIELDS_CHANGED';
    new.matched_at := null;
    new.plan_snapshot_version := null;
    new.planned_start_at := null;
    new.planned_end_at := null;
    new.planned_duration_minutes := null;
    new.task_updated_at_snapshot := null;
  end if;
  return new;
end;
$$;

drop trigger if exists event_invalidate_plan_correlation_on_source_change on public.event;
create trigger event_invalidate_plan_correlation_on_source_change
before update of org_id, zone_id, worker_login, start_at
on public.event
for each row
execute function public.invalidate_event_plan_correlation_on_source_change();

create index if not exists event_org_task_occurrence_idx
  on public.event (org_id, task_id, occurrence_date_ymd, start_at desc);

create index if not exists event_org_plan_slot_idx
  on public.event (
    org_id,
    task_id,
    occurrence_date_ymd,
    service_block_id,
    allocation_id,
    work_slot_key
  );

create index if not exists event_org_match_status_updated_idx
  on public.event (org_id, match_status, updated_at desc);

commit;
