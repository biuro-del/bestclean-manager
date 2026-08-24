-- Raport tylko do odczytu. Nie poprawia i nie blokuje danych historycznych.
-- Przyklad: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/audit-workday-reconciliation.sql

begin transaction isolation level repeatable read read only;
set local statement_timeout = '120s';

with
workday_dates as (
  select w.*,
         coalesce(
           -- to_jsonb keeps the audit runnable before the additive column is
           -- installed; a missing key safely yields NULL.
           nullif(btrim(to_jsonb(w) ->> 'business_date_ymd'), ''),
           to_char(w.start_at at time zone 'Europe/Warsaw', 'YYYY-MM-DD')
         ) as canonical_business_date_ymd
    from public.workday w
),
valid_closed_events as (
  -- Keep the historical comparison aligned with the application aggregator:
  -- only closed, non-future sessions of at most 24 hours, assigned to the
  -- Workday employee and its Warsaw business date, contribute to the sum.
  select e.org_id, e.workday_id, e.event_id, e.worker_login,
         w.worker_login as workday_worker_login,
         w.canonical_business_date_ymd,
         e.start_at, e.end_at,
         max(e.end_at) over (
           partition by e.org_id, e.workday_id
           order by e.start_at, e.end_at, e.event_id
           rows between unbounded preceding and 1 preceding
         ) as previous_max_end
    from public.event e
    join workday_dates w
      on w.org_id = e.org_id
     and w.workday_id = e.workday_id
   where e.workday_id is not null
     and e.start_at is not null
     and e.end_at > e.start_at
     and e.end_at - e.start_at <= interval '24 hours'
     and e.start_at <= current_timestamp
     and e.end_at <= current_timestamp
     and (
       w.canonical_business_date_ymd is null
       or to_char(e.start_at at time zone 'Europe/Warsaw', 'YYYY-MM-DD')
          = w.canonical_business_date_ymd
     )
     and (
       nullif(btrim(w.worker_login), '') is null
       or nullif(btrim(e.worker_login), '') is null
       or btrim(e.worker_login) = btrim(w.worker_login)
     )
),
closed_event_islands as (
  select event_row.*,
         sum(
           case
             when event_row.previous_max_end is null
               or event_row.start_at >= event_row.previous_max_end then 1
             else 0
           end
         ) over (
           partition by event_row.org_id, event_row.workday_id
           order by event_row.start_at, event_row.end_at, event_row.event_id
         ) as island_id
    from valid_closed_events event_row
),
merged_closed_events as (
  select org_id, workday_id, island_id,
         min(start_at) as start_at,
         max(end_at) as end_at
    from closed_event_islands
   group by org_id, workday_id, island_id
),
event_totals as (
  -- Start from every Workday, not only from days which already have Event
  -- rows. A legacy envelope without sessions must also be reported instead
  -- of disappearing from the duration-mismatch audit.
  select w.org_id,
         w.workday_id,
         (select count(*)
            from public.event open_event
           where open_event.org_id = w.org_id
             and open_event.workday_id = w.workday_id
             and open_event.start_at is not null
             and open_event.end_at is null) as open_count,
         coalesce((
           -- Match the application contract: sum the exact merged intervals
           -- first and round down only once at the end.
           select floor(sum(extract(epoch from (merged.end_at - merged.start_at))))::bigint
             from merged_closed_events merged
            where merged.org_id = w.org_id
              and merged.workday_id = w.workday_id
         ), 0) as closed_seconds
    from workday_dates w
),
closed_with_open_event as (
  select 'CLOSED_WORKDAY_WITH_OPEN_SESSION'::text as issue_code,
         w.org_id,
         w.workday_id,
         null::text as event_id,
         w.worker_login,
         w.canonical_business_date_ymd as business_date_ymd,
         format('status=%s end_at=%s open_sessions=%s', w.status, w.end_at, totals.open_count) as details
    from workday_dates w
    join event_totals totals
      on totals.org_id = w.org_id
     and totals.workday_id = w.workday_id
   where (upper(btrim(coalesce(w.status, ''))) = 'CLOSED' or w.end_at is not null)
     and totals.open_count > 0
),
duration_mismatch as (
  select 'WORKDAY_DURATION_MISMATCH'::text as issue_code,
         w.org_id,
         w.workday_id,
         null::text as event_id,
         w.worker_login,
         w.canonical_business_date_ymd as business_date_ymd,
         format('stored_seconds=%s closed_session_seconds=%s delta=%s',
                coalesce(w.duration_sec, 0), totals.closed_seconds,
                coalesce(w.duration_sec, 0) - totals.closed_seconds) as details
    from workday_dates w
    join event_totals totals
      on totals.org_id = w.org_id
     and totals.workday_id = w.workday_id
   where coalesce(w.duration_sec, 0)::bigint <> totals.closed_seconds
),
wrong_business_date as (
  select 'SESSION_BUSINESS_DATE_MISMATCH'::text as issue_code,
         e.org_id,
         e.workday_id,
         e.event_id,
         e.worker_login,
         w.canonical_business_date_ymd as business_date_ymd,
         format('workday_start=%s event_start=%s event_date=%s',
                w.start_at, e.start_at, (e.start_at at time zone 'Europe/Warsaw')::date) as details
    from public.event e
    join workday_dates w
      on w.org_id = e.org_id
     and w.workday_id = e.workday_id
   where e.start_at is not null
     and w.canonical_business_date_ymd is not null
     and to_char(e.start_at at time zone 'Europe/Warsaw', 'YYYY-MM-DD')
         <> w.canonical_business_date_ymd
),
worker_mismatch as (
  select 'SESSION_WORKER_MISMATCH'::text as issue_code,
         e.org_id,
         e.workday_id,
         e.event_id,
         e.worker_login,
         w.canonical_business_date_ymd as business_date_ymd,
         format('workday_worker=%s event_worker=%s', w.worker_login, e.worker_login) as details
    from public.event e
    join workday_dates w
      on w.org_id = e.org_id
     and w.workday_id = e.workday_id
   where nullif(btrim(w.worker_login), '') is not null
     and nullif(btrim(e.worker_login), '') is not null
     and btrim(e.worker_login) <> btrim(w.worker_login)
),
malformed_events as (
  select 'SESSION_TIMESTAMP_MISSING'::text as issue_code,
         e.org_id,
         e.workday_id,
         e.event_id,
         e.worker_login,
         coalesce(
           w.canonical_business_date_ymd,
           to_char(e.end_at at time zone 'Europe/Warsaw', 'YYYY-MM-DD')
         ) as business_date_ymd,
         format('start_at=%s end_at=%s', e.start_at, e.end_at) as details
    from public.event e
    left join workday_dates w
      on w.org_id = e.org_id
     and w.workday_id = e.workday_id
   where e.start_at is null
),
future_sessions as (
  select 'SESSION_FUTURE_TIMESTAMP'::text as issue_code,
         e.org_id,
         e.workday_id,
         e.event_id,
         e.worker_login,
         coalesce(
           w.canonical_business_date_ymd,
           to_char(e.start_at at time zone 'Europe/Warsaw', 'YYYY-MM-DD')
         ) as business_date_ymd,
         format('start_at=%s end_at=%s audit_time=%s', e.start_at, e.end_at, current_timestamp) as details
    from public.event e
    left join workday_dates w
      on w.org_id = e.org_id
     and w.workday_id = e.workday_id
   where e.start_at > current_timestamp
      or e.end_at > current_timestamp
),
invalid_duration as (
  select case
           when e.end_at <= e.start_at then 'SESSION_END_BEFORE_START'
           else 'SESSION_DURATION_EXCEEDED'
         end::text as issue_code,
         e.org_id,
         e.workday_id,
         e.event_id,
         e.worker_login,
         (e.start_at at time zone 'Europe/Warsaw')::date::text as business_date_ymd,
         format('start_at=%s end_at=%s duration_seconds=%s',
                e.start_at, e.end_at, extract(epoch from (e.end_at - e.start_at))) as details
    from public.event e
   where e.start_at is not null
     and e.end_at is not null
     and (e.end_at <= e.start_at or e.end_at - e.start_at > interval '24 hours')
),
semantic_duplicates as (
  select 'SEMANTIC_DUPLICATE_SESSION'::text as issue_code,
         e.org_id,
         e.workday_id,
         min(e.event_id)::text as event_id,
         e.worker_login,
         (e.start_at at time zone 'Europe/Warsaw')::date::text as business_date_ymd,
         format('count=%s event_ids=%s', count(*), string_agg(e.event_id, ',' order by e.event_id)) as details
    from public.event e
   where e.start_at is not null
   group by e.org_id, e.workday_id, e.worker_login, e.start_at, e.end_at
  having count(*) > 1
),
overlaps as (
  select 'SESSION_OVERLAP'::text as issue_code,
         left_event.org_id,
         left_event.workday_id,
         left_event.event_id,
         left_event.workday_worker_login as worker_login,
         left_event.canonical_business_date_ymd as business_date_ymd,
         format('overlaps_workday_id=%s overlaps_event_id=%s left=%s..%s right=%s..%s',
                right_event.workday_id, right_event.event_id, left_event.start_at, left_event.end_at,
                right_event.start_at, right_event.end_at) as details
    from valid_closed_events left_event
    join valid_closed_events right_event
      on right_event.org_id = left_event.org_id
     and right_event.workday_worker_login = left_event.workday_worker_login
     and right_event.canonical_business_date_ymd = left_event.canonical_business_date_ymd
     and (right_event.workday_id, right_event.event_id)
         > (left_event.workday_id, left_event.event_id)
     and right_event.start_at < left_event.end_at
     and right_event.end_at > left_event.start_at
),
invalid_workday_envelope as (
  select 'WORKDAY_ENVELOPE_EXCEEDED'::text as issue_code,
         w.org_id,
         w.workday_id,
         null::text as event_id,
         w.worker_login,
         w.canonical_business_date_ymd as business_date_ymd,
         format('start_at=%s end_at=%s duration_seconds=%s',
                w.start_at, w.end_at, extract(epoch from (w.end_at - w.start_at))) as details
    from workday_dates w
   where w.start_at is not null
     and w.end_at is not null
     and (w.end_at <= w.start_at or w.end_at - w.start_at > interval '24 hours')
)
select * from closed_with_open_event
union all select * from duration_mismatch
union all select * from wrong_business_date
union all select * from worker_mismatch
union all select * from malformed_events
union all select * from future_sessions
union all select * from invalid_duration
union all select * from semantic_duplicates
union all select * from overlaps
union all select * from invalid_workday_envelope
order by org_id, business_date_ymd, worker_login, workday_id, issue_code, event_id;

rollback;
