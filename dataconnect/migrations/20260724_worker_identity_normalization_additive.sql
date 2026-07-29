-- CONTROLLED ADDITIVE MIGRATION.
-- Purpose: replace Data Connect-inexpressible functional uniqueness with
-- explicit normalized identity columns while preserving the existing indexes.
-- The source login and worker_id values are never rewritten.
-- Run only after a fresh read-only duplicate preflight.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

select pg_advisory_xact_lock(
  hashtextextended('cleanzi:worker-identity-normalization:v1', 0)
);

do $$
begin
  if to_regclass('public.worker') is null then
    raise exception 'Required table public.worker does not exist.';
  end if;
end
$$;

-- Keep the duplicate preflight, column addition, backfill, trigger and new
-- unique indexes atomic. The table currently contains only worker profiles,
-- so this bounded lock is preferable to leaving a race between those steps.
lock table public.worker in share row exclusive mode;

do $$
declare
  login_duplicate_groups bigint;
  worker_id_duplicate_groups bigint;
begin
  select count(*)
    into login_duplicate_groups
    from (
      select org_id, lower(btrim(login))
        from public.worker
       group by org_id, lower(btrim(login))
      having count(*) > 1
    ) duplicates;

  if login_duplicate_groups > 0 then
    raise exception using
      errcode = '23505',
      message = 'WORKER_LOGIN_NORMALIZED_DUPLICATES_FOUND',
      detail = format(
        'Found %s duplicate group(s) for org_id + lower(btrim(login)).',
        login_duplicate_groups
      );
  end if;

  select count(*)
    into worker_id_duplicate_groups
    from (
      select org_id, lower(btrim(worker_id))
        from public.worker
       where worker_id is not null
         and btrim(worker_id) <> ''
       group by org_id, lower(btrim(worker_id))
      having count(*) > 1
    ) duplicates;

  if worker_id_duplicate_groups > 0 then
    raise exception using
      errcode = '23505',
      message = 'WORKER_ID_NORMALIZED_DUPLICATES_FOUND',
      detail = format(
        'Found %s duplicate group(s) for org_id + lower(btrim(worker_id)).',
        worker_id_duplicate_groups
      );
  end if;
end
$$;

alter table public.worker
  add column if not exists worker_id_normalized varchar(128);

-- Abort on a partial or incompatible earlier deployment.
do $$
declare
  mismatch record;
begin
  for mismatch in
    with expected(column_name, formatted_type) as (
      values
        ('login_normalized', 'character varying(80)'),
        ('worker_id_normalized', 'character varying(128)')
    )
    select
      expected.column_name,
      expected.formatted_type as expected_type,
      format_type(a.atttypid, a.atttypmod) as actual_type,
      a.attnotnull,
      d.adbin is not null as has_default
    from expected
    left join pg_attribute a
      on a.attrelid = 'public.worker'::regclass
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
      'Unsafe worker identity column %. Expected nullable % without a default; actual type %, not-null %, default %.',
      mismatch.column_name,
      mismatch.expected_type,
      coalesce(mismatch.actual_type, '<missing>'),
      coalesce(mismatch.attnotnull, false),
      coalesce(mismatch.has_default, false);
  end loop;
end
$$;

-- Only the derived columns are backfilled. The two predicates make the update
-- idempotent and avoid touching rows that are already correct.
update public.worker
   set login_normalized = lower(btrim(login))
 where login_normalized is distinct from lower(btrim(login));

update public.worker
   set worker_id_normalized = nullif(lower(btrim(worker_id)), '')
 where worker_id_normalized is distinct from nullif(lower(btrim(worker_id)), '');

create or replace function public.cleanzi_sync_worker_identity_normalized()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.login_normalized := lower(btrim(new.login));
  new.worker_id_normalized := nullif(lower(btrim(new.worker_id)), '');
  return new;
end
$$;

do $$
declare
  existing_definition text;
begin
  select pg_get_triggerdef(t.oid, true)
    into existing_definition
    from pg_trigger t
   where t.tgrelid = 'public.worker'::regclass
     and t.tgname = 'worker_identity_normalized_biu'
     and not t.tgisinternal;

  if existing_definition is null then
    execute $trigger$
      create trigger worker_identity_normalized_biu
      before insert or update on public.worker
      for each row
      execute function public.cleanzi_sync_worker_identity_normalized()
    $trigger$;
  elsif existing_definition not ilike
    '%BEFORE INSERT OR UPDATE ON worker FOR EACH ROW EXECUTE FUNCTION cleanzi_sync_worker_identity_normalized()%' then
    raise exception
      'Existing trigger worker_identity_normalized_biu has an incompatible definition: %',
      existing_definition;
  end if;
end
$$;

do $$
declare
  existing_definition text;
begin
  select pg_get_indexdef(to_regclass('public.worker_org_login_normalized_uidx'))
    into existing_definition;

  if existing_definition is not null
     and existing_definition <>
       'CREATE UNIQUE INDEX worker_org_login_normalized_uidx ON public.worker USING btree (org_id, login_normalized)' then
    raise exception
      'Existing index worker_org_login_normalized_uidx has an incompatible definition: %',
      existing_definition;
  end if;

  select pg_get_indexdef(to_regclass('public.worker_org_worker_id_normalized_uidx'))
    into existing_definition;

  if existing_definition is not null
     and existing_definition <>
       'CREATE UNIQUE INDEX worker_org_worker_id_normalized_uidx ON public.worker USING btree (org_id, worker_id_normalized)' then
    raise exception
      'Existing index worker_org_worker_id_normalized_uidx has an incompatible definition: %',
      existing_definition;
  end if;
end
$$;

create unique index if not exists worker_org_login_normalized_uidx
  on public.worker (org_id, login_normalized);

create unique index if not exists worker_org_worker_id_normalized_uidx
  on public.worker (org_id, worker_id_normalized);

do $$
declare
  invalid_index text;
begin
  select c.relname
    into invalid_index
    from pg_index i
    join pg_class c on c.oid = i.indexrelid
   where i.indrelid = 'public.worker'::regclass
     and c.relname in (
       'worker_org_login_normalized_uidx',
       'worker_org_worker_id_normalized_uidx'
     )
     and (
       not i.indisunique
       or not i.indisvalid
       or not i.indisready
     )
   limit 1;

  if invalid_index is not null then
    raise exception 'Worker identity index % is not unique, valid and ready.', invalid_index;
  end if;

  if exists (
    select 1
      from public.worker
     where login_normalized is distinct from lower(btrim(login))
        or worker_id_normalized is distinct from nullif(lower(btrim(worker_id)), '')
  ) then
    raise exception 'WORKER_IDENTITY_NORMALIZATION_POSTFLIGHT_FAILED';
  end if;
end
$$;

commit;

-- Read-only evidence. Both old functional indexes must still exist here.
select
  count(*) as total_workers,
  count(*) filter (
    where login_normalized is distinct from lower(btrim(login))
  ) as login_normalization_mismatches,
  count(*) filter (
    where worker_id_normalized is distinct from nullif(lower(btrim(worker_id)), '')
  ) as worker_id_normalization_mismatches,
  to_regclass('public.worker_org_login_ci_uidx') is not null
    as old_login_guard_preserved,
  to_regclass('public.worker_org_worker_id_ci_uidx') is not null
    as old_worker_id_guard_preserved,
  to_regclass('public.worker_org_login_normalized_uidx') is not null
    as new_login_guard_ready,
  to_regclass('public.worker_org_worker_id_normalized_uidx') is not null
    as new_worker_id_guard_ready
from public.worker;
