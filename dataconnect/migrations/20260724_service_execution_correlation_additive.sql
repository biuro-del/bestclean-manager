-- ADDITIVE-ONLY MIGRATION.
-- Purpose: enable durable correlation for newly written CLEAN events.
-- This file does not classify, update or backfill historical events.
-- Run only after a read-only preflight and during a controlled maintenance window.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

select pg_advisory_xact_lock(
  hashtextextended('cleanzi:event-correlation-schema:v1', 0)
);

do $$
begin
  if to_regclass('public.event') is null then
    raise exception 'Required table public.event does not exist.';
  end if;
end
$$;

-- Nullable columns without defaults are metadata-only additions in supported
-- PostgreSQL versions and leave every historical event unchanged.
alter table public.event
  add column if not exists task_id varchar(180),
  add column if not exists occurrence_date_ymd varchar(10),
  add column if not exists service_block_id varchar(180),
  add column if not exists allocation_id varchar(180),
  add column if not exists work_slot_key varchar(255),
  add column if not exists event_type varchar(32),
  add column if not exists match_status varchar(16),
  add column if not exists match_method varchar(64),
  add column if not exists match_reason text,
  add column if not exists matched_at timestamptz,
  add column if not exists plan_snapshot_version integer,
  add column if not exists planned_start_at timestamptz,
  add column if not exists planned_end_at timestamptz,
  add column if not exists planned_duration_minutes integer,
  add column if not exists task_updated_at_snapshot timestamptz;

-- Abort and roll back if an earlier partial deployment created an incompatible
-- type, a NOT NULL requirement or a default that could classify old rows.
do $$
declare
  mismatch record;
begin
  for mismatch in
    with expected(column_name, formatted_type) as (
      values
        ('task_id', 'character varying(180)'),
        ('occurrence_date_ymd', 'character varying(10)'),
        ('service_block_id', 'character varying(180)'),
        ('allocation_id', 'character varying(180)'),
        ('work_slot_key', 'character varying(255)'),
        ('event_type', 'character varying(32)'),
        ('match_status', 'character varying(16)'),
        ('match_method', 'character varying(64)'),
        ('match_reason', 'text'),
        ('matched_at', 'timestamp with time zone'),
        ('plan_snapshot_version', 'integer'),
        ('planned_start_at', 'timestamp with time zone'),
        ('planned_end_at', 'timestamp with time zone'),
        ('planned_duration_minutes', 'integer'),
        ('task_updated_at_snapshot', 'timestamp with time zone')
    )
    select
      expected.column_name,
      expected.formatted_type as expected_type,
      format_type(a.atttypid, a.atttypmod) as actual_type,
      a.attnotnull,
      d.adbin is not null as has_default
    from expected
    left join pg_attribute a
      on a.attrelid = 'public.event'::regclass
     and a.attname = expected.column_name
     and a.attnum > 0
     and not a.attisdropped
    left join pg_attrdef d
      on d.adrelid = a.attrelid
     and d.adnum = a.attnum
    where a.attname is null
       or format_type(a.atttypid, a.atttypmod) <> expected.formatted_type
       or a.attnotnull
       or d.adbin is not null
  loop
    raise exception
      'Unsafe correlation column %. Expected nullable % without a default; actual type %, not-null %, default %.',
      mismatch.column_name,
      mismatch.expected_type,
      coalesce(mismatch.actual_type, '<missing>'),
      coalesce(mismatch.attnotnull, false),
      coalesce(mismatch.has_default, false);
  end loop;
end
$$;

commit;

-- A foreign key is intentionally omitted in this additive stage. The portal
-- currently supports hard task deletion, while correlation fields are durable
-- execution snapshots. Deletion policy must be resolved before adding an FK.
--
-- Concurrent indexes are intentionally outside the transaction above. A
-- deployment runner must first abort on a same-name index with a different
-- definition and must verify indisvalid/indisready after every build.
set lock_timeout = '5s';
set statement_timeout = '30min';

create index concurrently if not exists event_org_task_occurrence_idx
  on public.event (org_id, task_id, occurrence_date_ymd, start_at desc);

create index concurrently if not exists event_org_plan_slot_idx
  on public.event (
    org_id,
    task_id,
    occurrence_date_ymd,
    service_block_id,
    allocation_id,
    work_slot_key
  );

create index concurrently if not exists event_org_match_status_updated_idx
  on public.event (org_id, match_status, updated_at desc);

reset statement_timeout;
reset lock_timeout;

-- Read-only postflight. Expected historical effect: all new columns exist,
-- remain nullable, have no defaults and contain only NULL values.
select
  count(*) as historical_event_count,
  count(*) filter (
    where event_type is not null
       or match_status is not null
       or task_id is not null
       or occurrence_date_ymd is not null
       or service_block_id is not null
       or allocation_id is not null
       or work_slot_key is not null
       or match_method is not null
       or match_reason is not null
       or matched_at is not null
       or plan_snapshot_version is not null
       or planned_start_at is not null
       or planned_end_at is not null
       or planned_duration_minutes is not null
       or task_updated_at_snapshot is not null
  ) as historical_rows_changed
from public.event;
