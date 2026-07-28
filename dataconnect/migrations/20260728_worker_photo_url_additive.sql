-- Additive worker profile photo support.
-- Stores only a durable URL/path. Image bytes live in Firebase/Cloud Storage.
-- Run only after a read-only preflight and during a controlled maintenance window.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

select pg_advisory_xact_lock(
  hashtextextended('cleanzi:worker-profile-photo-schema:v1', 0)
);

do $$
begin
  if to_regclass('public.worker') is null then
    raise exception 'Required table public.worker does not exist.';
  end if;
end
$$;

alter table public.worker
  add column if not exists photo_url text;

do $$
declare
  actual_type text;
  actual_not_null boolean;
  has_default boolean;
begin
  select
    format_type(a.atttypid, a.atttypmod),
    a.attnotnull,
    d.adbin is not null
  into actual_type, actual_not_null, has_default
  from pg_attribute a
  left join pg_attrdef d
    on d.adrelid = a.attrelid
   and d.adnum = a.attnum
  where a.attrelid = 'public.worker'::regclass
    and a.attname = 'photo_url'
    and a.attnum > 0
    and not a.attisdropped;

  if actual_type is distinct from 'text'
     or coalesce(actual_not_null, true)
     or coalesce(has_default, true) then
    raise exception
      'Unsafe public.worker.photo_url definition. Expected nullable text without a default; actual type %, not-null %, default %.',
      coalesce(actual_type, '<missing>'),
      coalesce(actual_not_null, false),
      coalesce(has_default, false);
  end if;
end
$$;

comment on column public.worker.photo_url is
  'Public or signed-accessible URL for the worker profile thumbnail stored outside SQL.';

commit;

-- Read-only postflight. Existing rows must remain unclassified by this
-- migration; the new URL is populated only by an explicit profile update.
select
  count(*) as worker_count,
  count(*) filter (where photo_url is not null) as workers_with_photo_url
from public.worker;
