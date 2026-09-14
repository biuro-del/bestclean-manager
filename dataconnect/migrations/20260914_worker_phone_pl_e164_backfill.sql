-- ADDITIVE CANDIDATE ONLY. Do not run on production without separate database approval.
-- Canonicalizes every non-empty Polish worker phone to +48XXXXXXXXX.
-- The migration is idempotent and fails before changing data when it finds a value
-- that cannot be interpreted as a nine-digit Polish number.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

select pg_advisory_xact_lock(
  hashtextextended('cleanzi:worker-phone:pl-e164-backfill:v1', 0)
);

lock table public.worker in share row exclusive mode;

alter table public.worker
  add column if not exists phone_normalized varchar(40);

do $worker_phone_pl_preflight$
declare
  invalid_count integer;
begin
  if to_regclass('public.worker') is null then
    raise exception 'WORKER_PHONE_PL_WORKER_TABLE_REQUIRED';
  end if;

  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'worker'
       and column_name = 'phone'
  ) then
    raise exception 'WORKER_PHONE_PL_PHONE_COLUMN_REQUIRED';
  end if;

  select count(*)::integer
    into invalid_count
    from public.worker
   where nullif(btrim(phone::text), '') is not null
     and regexp_replace(btrim(phone::text), '[[:space:]().-]', '', 'g') !~
       '^(\+48[0-9]{9}|0048[0-9]{9}|48[0-9]{9}|0[0-9]{9}|[0-9]{9})$';

  if invalid_count > 0 then
    raise exception 'WORKER_PHONE_PL_INVALID_VALUES: % row(s)', invalid_count;
  end if;
end
$worker_phone_pl_preflight$;

with source_rows as (
  select ctid,
         btrim(phone::text) as original_phone,
         regexp_replace(btrim(phone::text), '[[:space:]().-]', '', 'g') as compact_phone
    from public.worker
), normalized_rows as (
  select ctid,
         original_phone,
         case
           when original_phone = '' then null
           when compact_phone ~ '^\+48[0-9]{9}$' then compact_phone
           when compact_phone ~ '^0048[0-9]{9}$' then '+' || substring(compact_phone from 3)
           when compact_phone ~ '^48[0-9]{9}$' then '+' || compact_phone
           when compact_phone ~ '^0[0-9]{9}$' then '+48' || substring(compact_phone from 2)
           when compact_phone ~ '^[0-9]{9}$' then '+48' || compact_phone
           else original_phone
         end as normalized_phone
    from source_rows
)
update public.worker worker_row
   set phone = normalized_rows.normalized_phone,
       phone_normalized = normalized_rows.normalized_phone,
       updated_at = now()
  from normalized_rows
 where worker_row.ctid = normalized_rows.ctid
   and (
     worker_row.phone is distinct from normalized_rows.normalized_phone
     or worker_row.phone_normalized is distinct from normalized_rows.normalized_phone
   );

create or replace function public.cleanzi_worker_phone_pl_e164_sync()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $worker_phone_pl_sync$
begin
  if new.phone is null or btrim(new.phone::text) = '' then
    new.phone := null;
    new.phone_normalized := null;
    return new;
  end if;

  if new.phone::text !~ '^\+48[0-9]{9}$' then
    raise exception 'WORKER_PHONE_PL_E164_REQUIRED'
      using errcode = '22023';
  end if;

  new.phone_normalized := new.phone::text;
  return new;
end
$worker_phone_pl_sync$;

drop trigger if exists cleanzi_worker_phone_pl_e164_sync_trigger on public.worker;

create trigger cleanzi_worker_phone_pl_e164_sync_trigger
before insert or update of phone, phone_normalized on public.worker
for each row
execute function public.cleanzi_worker_phone_pl_e164_sync();

do $worker_phone_pl_postflight$
begin
  if exists (
    select 1
      from public.worker
     where phone is not null
       and (
         phone::text !~ '^\+48[0-9]{9}$'
         or phone_normalized is distinct from phone::text
       )
  ) or exists (
    select 1
      from public.worker
     where phone is null
       and phone_normalized is not null
  ) then
    raise exception 'WORKER_PHONE_PL_POSTFLIGHT_FAILED';
  end if;
end
$worker_phone_pl_postflight$;

commit;
