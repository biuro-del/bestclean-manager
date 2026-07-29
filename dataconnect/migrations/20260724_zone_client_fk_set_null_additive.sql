-- CONTROLLED ADDITIVE MIGRATION.
-- Purpose: align the optional Zone.client reference with Data Connect while
-- preserving every existing Zone row and the non-null organization key.
-- No application data, column nullability or Worker guard is changed.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

select pg_advisory_xact_lock(
  hashtextextended('cleanzi:zone-client-fk-set-null:v1', 0)
);

do $$
declare
  zone_client_type text;
  zone_client_nullable boolean;
  zone_org_nullable boolean;
  orphan_count bigint;
  constraint_definition text;
  constraint_delete_action "char";
  constraint_validated boolean;
begin
  if to_regclass('public.zone') is null
     or to_regclass('public.client') is null then
    raise exception 'ZONE_CLIENT_REQUIRED_TABLE_MISSING';
  end if;

  select
    format_type(a.atttypid, a.atttypmod),
    not a.attnotnull
    into zone_client_type, zone_client_nullable
    from pg_attribute a
   where a.attrelid = 'public.zone'::regclass
     and a.attname = 'client_id'
     and a.attnum > 0
     and not a.attisdropped;

  select not a.attnotnull
    into zone_org_nullable
    from pg_attribute a
   where a.attrelid = 'public.zone'::regclass
     and a.attname = 'org_id'
     and a.attnum > 0
     and not a.attisdropped;

  if zone_client_type is distinct from 'character varying(64)'
     or zone_client_nullable is distinct from true
     or zone_org_nullable is distinct from false then
    raise exception
      'ZONE_CLIENT_COLUMN_SHAPE_UNSAFE: type %, client nullable %, org nullable %',
      coalesce(zone_client_type, '<missing>'),
      coalesce(zone_client_nullable, false),
      coalesce(zone_org_nullable, false);
  end if;

  select count(*)
    into orphan_count
    from public.zone z
    left join public.client c
      on c.org_id = z.org_id
     and c.client_id = z.client_id
   where z.client_id is not null
     and c.client_id is null;

  if orphan_count <> 0 then
    raise exception 'ZONE_CLIENT_ORPHANS_FOUND: %', orphan_count;
  end if;

  select
    pg_get_constraintdef(c.oid, true),
    c.confdeltype,
    c.convalidated
    into
      constraint_definition,
      constraint_delete_action,
      constraint_validated
    from pg_constraint c
   where c.conrelid = 'public.zone'::regclass
     and c.conname = 'zone_org_id_client_id_fkey'
     and c.contype = 'f';

  if constraint_definition is null then
    raise exception 'ZONE_CLIENT_FK_MISSING';
  end if;

  if constraint_validated is distinct from true then
    raise exception 'ZONE_CLIENT_FK_NOT_VALIDATED: %', constraint_definition;
  end if;

  if constraint_definition not like
       'FOREIGN KEY (org_id, client_id) REFERENCES client(org_id, client_id)%' then
    raise exception 'ZONE_CLIENT_FK_SHAPE_UNSAFE: %', constraint_definition;
  end if;

  if constraint_delete_action not in ('c', 'n') then
    raise exception
      'ZONE_CLIENT_FK_DELETE_ACTION_UNSAFE: %',
      constraint_definition;
  end if;
end
$$;

do $$
declare
  constraint_delete_action "char";
begin
  select c.confdeltype
    into constraint_delete_action
    from pg_constraint c
   where c.conrelid = 'public.zone'::regclass
     and c.conname = 'zone_org_id_client_id_fkey'
     and c.contype = 'f';

  if constraint_delete_action = 'c' then
    alter table public.zone
      drop constraint zone_org_id_client_id_fkey,
      add constraint zone_org_id_client_id_fkey
        foreign key (org_id, client_id)
        references public.client (org_id, client_id)
        on delete set null
        not valid;

    alter table public.zone
      validate constraint zone_org_id_client_id_fkey;
  end if;
end
$$;

do $$
declare
  constraint_definition text;
  constraint_delete_action "char";
  constraint_validated boolean;
  zone_client_nullable boolean;
  orphan_count bigint;
begin
  select
    pg_get_constraintdef(c.oid, true),
    c.confdeltype,
    c.convalidated
    into
      constraint_definition,
      constraint_delete_action,
      constraint_validated
    from pg_constraint c
   where c.conrelid = 'public.zone'::regclass
     and c.conname = 'zone_org_id_client_id_fkey'
     and c.contype = 'f';

  select not a.attnotnull
    into zone_client_nullable
    from pg_attribute a
   where a.attrelid = 'public.zone'::regclass
     and a.attname = 'client_id'
     and a.attnum > 0
     and not a.attisdropped;

  select count(*)
    into orphan_count
    from public.zone z
    left join public.client c
      on c.org_id = z.org_id
     and c.client_id = z.client_id
   where z.client_id is not null
     and c.client_id is null;

  if constraint_delete_action is distinct from 'n'
     or constraint_validated is distinct from true
     or constraint_definition not like '%ON DELETE SET NULL'
     or zone_client_nullable is distinct from true
     or orphan_count <> 0 then
    raise exception
      'ZONE_CLIENT_FK_POSTFLIGHT_FAILED: definition %, action %, validated %, nullable %, orphans %',
      coalesce(constraint_definition, '<missing>'),
      coalesce(constraint_delete_action::text, '<missing>'),
      coalesce(constraint_validated, false),
      coalesce(zone_client_nullable, false),
      orphan_count;
  end if;
end
$$;

commit;

-- Read-only evidence. All four Worker identity guards must remain present.
select
  pg_get_constraintdef(c.oid, true) as constraint_definition,
  c.convalidated,
  c.confdeltype = 'n' as delete_sets_client_null,
  (
    select count(*)
      from public.zone
  ) as zone_count,
  (
    select count(*)
      from public.zone z
      left join public.client cl
        on cl.org_id = z.org_id
       and cl.client_id = z.client_id
     where z.client_id is not null
       and cl.client_id is null
  ) as orphan_count,
  to_regclass('public.worker_org_login_ci_uidx') is not null
    as old_login_guard_preserved,
  to_regclass('public.worker_org_worker_id_ci_uidx') is not null
    as old_worker_id_guard_preserved,
  to_regclass('public.worker_org_login_normalized_uidx') is not null
    as new_login_guard_preserved,
  to_regclass('public.worker_org_worker_id_normalized_uidx') is not null
    as new_worker_id_guard_preserved
from pg_constraint c
where c.conrelid = 'public.zone'::regclass
  and c.conname = 'zone_org_id_client_id_fkey'
  and c.contype = 'f';
