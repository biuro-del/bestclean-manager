-- CONTROLLED COMPATIBILITY MIGRATION.
-- Purpose: retire two redundant functional indexes only after their explicit
-- normalized-column replacements and synchronization trigger are verified.
-- No Worker source or normalized value is changed.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

select pg_advisory_xact_lock(
  hashtextextended('cleanzi:worker-legacy-guard-retirement:v1', 0)
);

do $$
declare
  invalid_index text;
  incompatible_index text;
  trigger_definition text;
  mismatch_count bigint;
begin
  if to_regclass('public.worker') is null then
    raise exception 'WORKER_TABLE_MISSING';
  end if;

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
    raise exception 'WORKER_REPLACEMENT_GUARD_INVALID: %', invalid_index;
  end if;

  select expected.index_name
    into incompatible_index
    from (
      values
        (
          'worker_org_login_normalized_uidx',
          'CREATE UNIQUE INDEX worker_org_login_normalized_uidx ON public.worker USING btree (org_id, login_normalized)'
        ),
        (
          'worker_org_worker_id_normalized_uidx',
          'CREATE UNIQUE INDEX worker_org_worker_id_normalized_uidx ON public.worker USING btree (org_id, worker_id_normalized)'
        )
    ) as expected(index_name, definition)
   where pg_get_indexdef(to_regclass('public.' || expected.index_name))
           is distinct from expected.definition
   limit 1;

  if incompatible_index is not null then
    raise exception
      'WORKER_REPLACEMENT_GUARD_INCOMPATIBLE: %',
      incompatible_index;
  end if;

  select pg_get_triggerdef(t.oid, true)
    into trigger_definition
    from pg_trigger t
   where t.tgrelid = 'public.worker'::regclass
     and t.tgname = 'worker_identity_normalized_biu'
     and not t.tgisinternal;

  if trigger_definition is null
     or trigger_definition not ilike
       '%BEFORE INSERT OR UPDATE ON worker FOR EACH ROW EXECUTE FUNCTION cleanzi_sync_worker_identity_normalized()%' then
    raise exception
      'WORKER_NORMALIZATION_TRIGGER_INCOMPATIBLE: %',
      coalesce(trigger_definition, '<missing>');
  end if;

  select count(*)
    into mismatch_count
    from public.worker
   where login_normalized is distinct from lower(btrim(login))
      or worker_id_normalized is distinct from nullif(lower(btrim(worker_id)), '');

  if mismatch_count <> 0 then
    raise exception
      'WORKER_NORMALIZATION_MISMATCHES_FOUND: %',
      mismatch_count;
  end if;
end
$$;

drop index if exists public.worker_org_login_ci_uidx;
drop index if exists public.worker_org_worker_id_ci_uidx;

do $$
begin
  if to_regclass('public.worker_org_login_ci_uidx') is not null
     or to_regclass('public.worker_org_worker_id_ci_uidx') is not null
     or to_regclass('public.worker_org_login_normalized_uidx') is null
     or to_regclass('public.worker_org_worker_id_normalized_uidx') is null then
    raise exception 'WORKER_LEGACY_GUARD_RETIREMENT_POSTFLIGHT_FAILED';
  end if;
end
$$;

commit;

-- Read-only evidence.
select
  count(*) as total_workers,
  count(*) filter (
    where login_normalized is distinct from lower(btrim(login))
  ) as login_normalization_mismatches,
  count(*) filter (
    where worker_id_normalized is distinct from nullif(lower(btrim(worker_id)), '')
  ) as worker_id_normalization_mismatches,
  to_regclass('public.worker_org_login_ci_uidx') is null
    as old_login_guard_retired,
  to_regclass('public.worker_org_worker_id_ci_uidx') is null
    as old_worker_id_guard_retired,
  to_regclass('public.worker_org_login_normalized_uidx') is not null
    as new_login_guard_ready,
  to_regclass('public.worker_org_worker_id_normalized_uidx') is not null
    as new_worker_id_guard_ready
from public.worker;
