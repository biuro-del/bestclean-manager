-- REVIEW-ONLY. Nie uruchamiano lokalnie ani na produkcji.
-- Addytywny schemat bezpiecznego uzgadniania dnia pracy. Migracja nie
-- aktualizuje historycznych Workday/Event i nie uzupelnia dat automatycznie.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

select pg_advisory_xact_lock(
  hashtextextended('cleanzi:workday-reconciliation-schema:v1', 0)
);

do $$
begin
  if to_regclass('public.organizations') is null
     or to_regclass('public.workday') is null
     or to_regclass('public.event') is null then
    raise exception 'Required organizations/workday/event tables do not exist.';
  end if;
end
$$;

alter table public.workday
  add column if not exists business_date_ymd varchar(10);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.workday'::regclass
       and conname = 'workday_business_date_ymd_check'
  ) then
    alter table public.workday
      add constraint workday_business_date_ymd_check
      check (
        business_date_ymd is null
        or case
          when business_date_ymd !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
            then false
          when substring(business_date_ymd from 1 for 4) = '0000'
            then false
          else to_char(to_date(business_date_ymd, 'YYYY-MM-DD'), 'YYYY-MM-DD') = business_date_ymd
        end
      );
  end if;
end
$$;

create index if not exists workday_org_business_date_worker_idx
  on public.workday (org_id, business_date_ymd, worker_login, workday_id);

-- Brakująca data jest uzupełniana przy INSERT oraz przy późniejszej zmianie
-- start_at/business_date_ymd. Poprawna, jawna data korekty ma pierwszeństwo.
create or replace function public.set_workday_business_date()
returns trigger
language plpgsql
as $$
begin
  if nullif(btrim(new.business_date_ymd), '') is null then
    new.business_date_ymd := case
      when new.start_at is null then null
      else to_char(new.start_at at time zone 'Europe/Warsaw', 'YYYY-MM-DD')
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists workday_business_date_on_insert on public.workday;
drop trigger if exists workday_business_date_sync on public.workday;

create trigger workday_business_date_sync
before insert or update of start_at, business_date_ymd on public.workday
for each row execute function public.set_workday_business_date();

create table if not exists public.workday_reconciliation_audit (
  org_id varchar(64) not null,
  audit_id varchar(64) not null,
  workday_id varchar(64) not null,
  idempotency_key varchar(128) not null,
  request_hash varchar(64) not null,
  action varchar(32) not null,
  reason text not null,
  actor_uid varchar(128) not null,
  before_snapshot text not null,
  after_snapshot text not null,
  response_snapshot text not null,
  created_at timestamptz not null default now(),
  primary key (org_id, audit_id),
  constraint workday_reconciliation_audit_org_fk
    foreign key (org_id) references public.organizations(org_id),
  constraint workday_reconciliation_audit_request_hash_check
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint workday_reconciliation_audit_action_check
    check (action in ('CORRECT', 'FINALIZE')),
  constraint workday_reconciliation_audit_reason_check
    check (length(btrim(reason)) between 3 and 1000)
);

-- Data Connect może utworzyć tabelę przed tą migracją. Uzupełnienie jest
-- addytywne; jeśli częściowa tabela zawiera niekompletne wpisy, SET NOT NULL
-- celowo zatrzyma migrację zamiast osłabić rejestr audytowy.
alter table public.workday_reconciliation_audit
  add column if not exists org_id varchar(64),
  add column if not exists audit_id varchar(64),
  add column if not exists workday_id varchar(64),
  add column if not exists idempotency_key varchar(128),
  add column if not exists request_hash varchar(64),
  add column if not exists action varchar(32),
  add column if not exists reason text,
  add column if not exists actor_uid varchar(128),
  add column if not exists before_snapshot text,
  add column if not exists after_snapshot text,
  add column if not exists response_snapshot text,
  add column if not exists created_at timestamptz default now();

alter table public.workday_reconciliation_audit
  alter column org_id set not null,
  alter column audit_id set not null,
  alter column workday_id set not null,
  alter column idempotency_key set not null,
  alter column request_hash set not null,
  alter column action set not null,
  alter column reason set not null,
  alter column actor_uid set not null,
  alter column before_snapshot set not null,
  alter column after_snapshot set not null,
  alter column response_snapshot set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.workday_reconciliation_audit'::regclass
       and contype = 'p'
  ) then
    alter table public.workday_reconciliation_audit
      add constraint workday_reconciliation_audit_pkey primary key (org_id, audit_id);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.workday_reconciliation_audit'::regclass
       and conname = 'workday_reconciliation_audit_org_fk'
  ) then
    alter table public.workday_reconciliation_audit
      add constraint workday_reconciliation_audit_org_fk
      foreign key (org_id) references public.organizations(org_id);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.workday_reconciliation_audit'::regclass
       and conname = 'workday_reconciliation_audit_request_hash_check'
  ) then
    alter table public.workday_reconciliation_audit
      add constraint workday_reconciliation_audit_request_hash_check
      check (request_hash ~ '^[0-9a-f]{64}$');
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.workday_reconciliation_audit'::regclass
       and conname = 'workday_reconciliation_audit_action_check'
  ) then
    alter table public.workday_reconciliation_audit
      add constraint workday_reconciliation_audit_action_check
      check (action in ('CORRECT', 'FINALIZE'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.workday_reconciliation_audit'::regclass
       and conname = 'workday_reconciliation_audit_reason_check'
  ) then
    alter table public.workday_reconciliation_audit
      add constraint workday_reconciliation_audit_reason_check
      check (length(btrim(reason)) between 3 and 1000);
  end if;
end
$$;

create unique index if not exists workday_reconciliation_audit_idempotency_idx
  on public.workday_reconciliation_audit (org_id, idempotency_key);

create index if not exists workday_reconciliation_audit_workday_idx
  on public.workday_reconciliation_audit (org_id, workday_id, created_at desc, audit_id desc);

create or replace function public.reject_workday_reconciliation_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'WORKDAY_RECONCILIATION_AUDIT_IMMUTABLE';
end;
$$;

do $$
begin
  if not exists (
    select 1
      from pg_trigger
     where tgrelid = 'public.workday_reconciliation_audit'::regclass
       and tgname = 'workday_reconciliation_audit_reject_update'
       and not tgisinternal
  ) then
    create trigger workday_reconciliation_audit_reject_update
    before update on public.workday_reconciliation_audit
    for each row execute function public.reject_workday_reconciliation_audit_mutation();
  end if;

  if not exists (
    select 1
      from pg_trigger
     where tgrelid = 'public.workday_reconciliation_audit'::regclass
       and tgname = 'workday_reconciliation_audit_reject_delete'
       and not tgisinternal
  ) then
    create trigger workday_reconciliation_audit_reject_delete
    before delete on public.workday_reconciliation_audit
    for each row execute function public.reject_workday_reconciliation_audit_mutation();
  end if;

  if not exists (
    select 1
      from pg_trigger
     where tgrelid = 'public.workday_reconciliation_audit'::regclass
       and tgname = 'workday_reconciliation_audit_reject_truncate'
       and not tgisinternal
  ) then
    create trigger workday_reconciliation_audit_reject_truncate
    before truncate on public.workday_reconciliation_audit
    for each statement execute function public.reject_workday_reconciliation_audit_mutation();
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'workday'
       and column_name = 'business_date_ymd'
       and data_type = 'character varying'
       and character_maximum_length = 10
       and is_nullable = 'YES'
  ) then
    raise exception 'Required Workday business-date column has an unsafe definition.';
  end if;

  if not exists (
    select 1
      from pg_constraint constraint_meta
     where constraint_meta.conrelid = 'public.workday'::regclass
       and constraint_meta.conname = 'workday_business_date_ymd_check'
       and constraint_meta.contype = 'c'
       and constraint_meta.convalidated
       and pg_get_constraintdef(constraint_meta.oid, true) ilike '%business_date_ymd is null%'
       and pg_get_constraintdef(constraint_meta.oid, true) like '%^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$%'
       and pg_get_constraintdef(constraint_meta.oid, true) ilike '%to_date%YYYY-MM-DD%'
       and pg_get_constraintdef(constraint_meta.oid, true) ilike '%= business_date_ymd%'
  ) then
    raise exception 'Required Workday business-date CHECK is missing or unsafe.';
  end if;

  if not exists (
    select 1
      from pg_constraint constraint_meta
      join pg_index index_meta
        on index_meta.indexrelid = constraint_meta.conindid
     where constraint_meta.conrelid = 'public.workday_reconciliation_audit'::regclass
       and constraint_meta.contype = 'p'
       and constraint_meta.convalidated
       and index_meta.indisprimary
       and index_meta.indisvalid
       and index_meta.indisready
       and index_meta.indnkeyatts = 2
       and index_meta.indnatts = 2
       and pg_get_indexdef(constraint_meta.conindid, 1, true) = 'org_id'
       and pg_get_indexdef(constraint_meta.conindid, 2, true) = 'audit_id'
  ) then
    raise exception 'Required workday reconciliation primary key is missing or unsafe.';
  end if;

  if not exists (
    select 1
      from pg_class index_class
      join pg_namespace namespace
        on namespace.oid = index_class.relnamespace
      join pg_index index_meta
        on index_meta.indexrelid = index_class.oid
     where namespace.nspname = 'public'
       and index_class.relname = 'workday_reconciliation_audit_idempotency_idx'
       and index_meta.indrelid = 'public.workday_reconciliation_audit'::regclass
       and index_meta.indisunique
       and index_meta.indisvalid
       and index_meta.indisready
       and index_meta.indpred is null
       and index_meta.indexprs is null
       and index_meta.indnkeyatts = 2
       and index_meta.indnatts = 2
       and pg_get_indexdef(index_meta.indexrelid, 1, true) = 'org_id'
       and pg_get_indexdef(index_meta.indexrelid, 2, true) = 'idempotency_key'
  ) then
    raise exception 'Required unique idempotency index is missing or unsafe.';
  end if;

  if not exists (
    select 1
      from pg_trigger
     where tgrelid = 'public.workday'::regclass
       and tgname = 'workday_business_date_sync'
       and tgfoid = 'public.set_workday_business_date()'::regprocedure
       and tgtype = 23
       and tgenabled in ('O', 'A')
       and tgisinternal is false
       and pg_get_triggerdef(oid, true) ilike '%before insert or update of start_at, business_date_ymd%'
  ) then
    raise exception 'Required Workday business-date trigger is missing, disabled or unsafe.';
  end if;

  if not exists (
    select 1
      from pg_trigger
     where tgrelid = 'public.workday_reconciliation_audit'::regclass
       and tgname = 'workday_reconciliation_audit_reject_update'
       and tgfoid = 'public.reject_workday_reconciliation_audit_mutation()'::regprocedure
       and tgtype = 19
       and tgenabled in ('O', 'A')
       and not tgisinternal
  ) or not exists (
    select 1
      from pg_trigger
     where tgrelid = 'public.workday_reconciliation_audit'::regclass
       and tgname = 'workday_reconciliation_audit_reject_delete'
       and tgfoid = 'public.reject_workday_reconciliation_audit_mutation()'::regprocedure
       and tgtype = 11
       and tgenabled in ('O', 'A')
       and not tgisinternal
  ) or not exists (
    select 1
      from pg_trigger
     where tgrelid = 'public.workday_reconciliation_audit'::regclass
       and tgname = 'workday_reconciliation_audit_reject_truncate'
       and tgfoid = 'public.reject_workday_reconciliation_audit_mutation()'::regprocedure
       and tgtype = 34
       and tgenabled in ('O', 'A')
       and not tgisinternal
  ) then
    raise exception 'Immutable audit triggers are missing, disabled or unsafe.';
  end if;

  if (
    select count(*)
      from pg_constraint constraint_meta
     where constraint_meta.conrelid = 'public.workday_reconciliation_audit'::regclass
       and constraint_meta.contype = 'c'
       and constraint_meta.convalidated
       and (
         (
           constraint_meta.conname = 'workday_reconciliation_audit_request_hash_check'
           and pg_get_constraintdef(constraint_meta.oid, true) ilike '%request_hash%'
           and pg_get_constraintdef(constraint_meta.oid, true) like '%^[0-9a-f]{64}$%'
         )
         or (
           constraint_meta.conname = 'workday_reconciliation_audit_action_check'
           and pg_get_constraintdef(constraint_meta.oid, true) ilike '%action%'
           and pg_get_constraintdef(constraint_meta.oid, true) like '%CORRECT%'
           and pg_get_constraintdef(constraint_meta.oid, true) like '%FINALIZE%'
         )
         or (
           constraint_meta.conname = 'workday_reconciliation_audit_reason_check'
           and pg_get_constraintdef(constraint_meta.oid, true) ilike '%length%btrim%reason%'
           and pg_get_constraintdef(constraint_meta.oid, true) like '%3%'
           and pg_get_constraintdef(constraint_meta.oid, true) like '%1000%'
         )
       )
  ) <> 3 then
    raise exception 'Required reconciliation audit CHECK constraints are missing, invalid or unsafe.';
  end if;
end
$$;

commit;

-- Po wdrozeniu pole pozostaje NULL dla starych rekordow. API wylicza dzien
-- biznesowy z start_at w Europe/Warsaw i zapisuje go dopiero podczas recznie
-- zatwierdzonej korekty.
