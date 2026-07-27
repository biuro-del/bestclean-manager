begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table if exists public.task
  add column if not exists lifecycle_status varchar(20),
  add column if not exists cancelled_at timestamptz,
  add column if not exists archived_at timestamptz;

update public.task
   set lifecycle_status = 'ACTIVE'
 where lifecycle_status is null;

alter table if exists public.task
  alter column lifecycle_status set default 'ACTIVE',
  alter column lifecycle_status set not null;

do $$
begin
  if to_regclass('public.task') is not null
     and not exists (
       select 1
         from pg_constraint
        where conrelid = 'public.task'::regclass
          and conname = 'task_lifecycle_status_check'
     ) then
    alter table public.task
      add constraint task_lifecycle_status_check
      check (lifecycle_status in ('ACTIVE', 'CANCELLED', 'ARCHIVED'))
      not valid;
  end if;
end
$$;

alter table if exists public.task
  validate constraint task_lifecycle_status_check;

create index if not exists task_org_lifecycle_date_idx
  on public.task (org_id, lifecycle_status, date_ymd, start_time, id_task);

commit;
