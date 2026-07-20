alter table if exists public.worker
  alter column worker_id type varchar(128);

alter table if exists public.organization_member
  alter column worker_id type varchar(128);

alter table if exists public.task
  alter column worker_id type varchar(128);

create table if not exists public.worker_id_reservation (
  org_id varchar(64) not null,
  worker_number integer not null check (worker_number > 0),
  worker_id varchar(128) not null,
  created_at timestamptz not null default now(),
  created_by_uid varchar(128),
  primary key (org_id, worker_number),
  unique (org_id, worker_id),
  constraint worker_id_reservation_org_fk
    foreign key (org_id)
    references public.organizations (org_id)
    on delete cascade
);

insert into public.worker_id_reservation (
  org_id,
  worker_number,
  worker_id,
  created_at,
  created_by_uid
)
select
  w.org_id,
  substring(
    w.worker_id
    from length('worker_' || w.org_id || '_') + 1
  )::integer,
  w.worker_id,
  coalesce(w.created_at, now()),
  w.auth_uid
from public.worker w
where left(
        w.worker_id,
        length('worker_' || w.org_id || '_')
      ) = 'worker_' || w.org_id || '_'
  and substring(
        w.worker_id
        from length('worker_' || w.org_id || '_') + 1
      ) ~ '^[1-9][0-9]*$'
  and substring(
        w.worker_id
        from length('worker_' || w.org_id || '_') + 1
      )::numeric <= 2147483647
on conflict do nothing;

do $$
begin
  if exists (
    select 1
      from public.worker
     group by org_id, lower(login)
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'WORKER_LOGIN_DUPLICATES_FOUND',
      detail = 'Usun duplikaty loginow pracownikow w organizacji przed utworzeniem indeksu.';
  end if;
end
$$;

create unique index if not exists worker_org_login_ci_uidx
  on public.worker (org_id, lower(login));

do $$
begin
  if exists (
    select 1
      from public.worker
     where worker_id is not null
       and btrim(worker_id) <> ''
     group by org_id, lower(worker_id)
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'WORKER_ID_DUPLICATES_FOUND',
      detail = 'Usun duplikaty worker_id w organizacji przed utworzeniem indeksu.';
  end if;
end
$$;

create unique index if not exists worker_org_worker_id_ci_uidx
  on public.worker (org_id, lower(worker_id))
  where worker_id is not null
    and btrim(worker_id) <> '';

drop table if exists public.worker_credential;
