begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

select pg_advisory_xact_lock(
  hashtextextended('cleanzi:job-card-publication-schema:v1', 0)
);

do $$
begin
  if to_regclass('public.organizations') is null then
    raise exception 'Required table public.organizations does not exist.';
  end if;
end
$$;

create table if not exists public.job_card_draft (
  org_id varchar(64) not null,
  source_order_id varchar(180) not null,
  draft_id uuid not null,
  schema_version varchar(32) not null,
  compiler_version varchar(32) not null,
  contract_version varchar(64) not null,
  generation_status varchar(32) not null,
  source_hash char(64) not null,
  draft_hash char(64) not null,
  source_snapshot jsonb not null,
  payload jsonb not null,
  validation jsonb not null,
  base_revision integer not null default 0,
  created_by_uid varchar(128) not null,
  updated_by_uid varchar(128) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, source_order_id),
  constraint job_card_draft_org_fk
    foreign key (org_id) references public.organizations(org_id),
  constraint job_card_draft_generation_status_check
    check (generation_status in ('BLOCKED', 'READY_WITH_WARNINGS', 'READY', 'PUBLISHED')),
  constraint job_card_draft_base_revision_check
    check (base_revision >= 0)
);

create table if not exists public.job_card_revision (
  org_id varchar(64) not null,
  source_order_id varchar(180) not null,
  revision integer not null,
  revision_id uuid not null unique,
  schema_version varchar(32) not null,
  compiler_version varchar(32) not null,
  contract_version varchar(64) not null,
  source_hash char(64) not null,
  output_hash char(64) not null,
  payload jsonb not null,
  mobile_projection jsonb not null,
  diff jsonb not null,
  warnings jsonb not null,
  warning_acknowledgements jsonb not null,
  published_by_uid varchar(128) not null,
  published_at timestamptz not null default now(),
  primary key (org_id, source_order_id, revision),
  constraint job_card_revision_org_fk
    foreign key (org_id) references public.organizations(org_id),
  constraint job_card_revision_number_check
    check (revision > 0)
);

do $$
declare
  mismatch record;
begin
  for mismatch in
    with expected(table_name, column_name, formatted_type, expected_not_null) as (
      values
        ('job_card_draft', 'org_id', 'character varying(64)', true),
        ('job_card_draft', 'source_order_id', 'character varying(180)', true),
        ('job_card_draft', 'draft_id', 'uuid', true),
        ('job_card_draft', 'schema_version', 'character varying(32)', true),
        ('job_card_draft', 'compiler_version', 'character varying(32)', true),
        ('job_card_draft', 'contract_version', 'character varying(64)', true),
        ('job_card_draft', 'generation_status', 'character varying(32)', true),
        ('job_card_draft', 'source_hash', 'character(64)', true),
        ('job_card_draft', 'draft_hash', 'character(64)', true),
        ('job_card_draft', 'source_snapshot', 'jsonb', true),
        ('job_card_draft', 'payload', 'jsonb', true),
        ('job_card_draft', 'validation', 'jsonb', true),
        ('job_card_draft', 'base_revision', 'integer', true),
        ('job_card_draft', 'created_by_uid', 'character varying(128)', true),
        ('job_card_draft', 'updated_by_uid', 'character varying(128)', true),
        ('job_card_draft', 'created_at', 'timestamp with time zone', true),
        ('job_card_draft', 'updated_at', 'timestamp with time zone', true),
        ('job_card_revision', 'org_id', 'character varying(64)', true),
        ('job_card_revision', 'source_order_id', 'character varying(180)', true),
        ('job_card_revision', 'revision', 'integer', true),
        ('job_card_revision', 'revision_id', 'uuid', true),
        ('job_card_revision', 'schema_version', 'character varying(32)', true),
        ('job_card_revision', 'compiler_version', 'character varying(32)', true),
        ('job_card_revision', 'contract_version', 'character varying(64)', true),
        ('job_card_revision', 'source_hash', 'character(64)', true),
        ('job_card_revision', 'output_hash', 'character(64)', true),
        ('job_card_revision', 'payload', 'jsonb', true),
        ('job_card_revision', 'mobile_projection', 'jsonb', true),
        ('job_card_revision', 'diff', 'jsonb', true),
        ('job_card_revision', 'warnings', 'jsonb', true),
        ('job_card_revision', 'warning_acknowledgements', 'jsonb', true),
        ('job_card_revision', 'published_by_uid', 'character varying(128)', true),
        ('job_card_revision', 'published_at', 'timestamp with time zone', true)
    )
    select
      expected.table_name,
      expected.column_name,
      expected.formatted_type as expected_type,
      expected.expected_not_null,
      format_type(a.atttypid, a.atttypmod) as actual_type,
      a.attnotnull as actual_not_null
    from expected
    left join pg_class c
      on c.relname = expected.table_name
     and c.relnamespace = 'public'::regnamespace
    left join pg_attribute a
      on a.attrelid = c.oid
     and a.attname = expected.column_name
     and a.attnum > 0
     and not a.attisdropped
    where a.attname is null
       or format_type(a.atttypid, a.atttypmod) <> expected.formatted_type
       or a.attnotnull is distinct from expected.expected_not_null
  loop
    raise exception
      'Unsafe %.% definition. Expected % not-null %; actual type %, not-null %.',
      mismatch.table_name,
      mismatch.column_name,
      mismatch.expected_type,
      mismatch.expected_not_null,
      coalesce(mismatch.actual_type, '<missing>'),
      coalesce(mismatch.actual_not_null, false);
  end loop;
end
$$;

create index if not exists job_card_draft_org_updated_idx
  on public.job_card_draft (org_id, updated_at desc);

create unique index if not exists job_card_revision_output_hash_uidx
  on public.job_card_revision (org_id, source_order_id, output_hash);

create index if not exists job_card_revision_latest_idx
  on public.job_card_revision (org_id, source_order_id, revision desc);

create or replace function public.reject_job_card_revision_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'JOB_CARD_REVISION_IMMUTABLE';
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.job_card_revision'::regclass
      and tgname = 'job_card_revision_reject_update'
      and not tgisinternal
  ) then
    create trigger job_card_revision_reject_update
    before update on public.job_card_revision
    for each row execute function public.reject_job_card_revision_mutation();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.job_card_revision'::regclass
      and tgname = 'job_card_revision_reject_delete'
      and not tgisinternal
  ) then
    create trigger job_card_revision_reject_delete
    before delete on public.job_card_revision
    for each row execute function public.reject_job_card_revision_mutation();
  end if;
end
$$;

do $$
declare
  missing_constraint text;
  unsafe_index text;
begin
  for missing_constraint in
    select required.table_name || '.' || required.constraint_name
    from (
      values
        ('job_card_draft', 'job_card_draft_pkey'),
        ('job_card_draft', 'job_card_draft_org_fk'),
        ('job_card_draft', 'job_card_draft_generation_status_check'),
        ('job_card_draft', 'job_card_draft_base_revision_check'),
        ('job_card_revision', 'job_card_revision_pkey'),
        ('job_card_revision', 'job_card_revision_revision_id_key'),
        ('job_card_revision', 'job_card_revision_org_fk'),
        ('job_card_revision', 'job_card_revision_number_check')
    ) as required(table_name, constraint_name)
    where not exists (
      select 1
      from pg_constraint c
      join pg_class relation
        on relation.oid = c.conrelid
      where c.connamespace = 'public'::regnamespace
        and relation.relname = required.table_name
        and c.conname = required.constraint_name
    )
  loop
    raise exception 'Required Job Card constraint % is missing.', missing_constraint;
  end loop;

  if not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.job_card_revision'::regclass
      and t.tgname = 'job_card_revision_reject_update'
      and t.tgenabled <> 'D'
      and t.tgfoid = 'public.reject_job_card_revision_mutation()'::regprocedure
  ) then
    raise exception 'Required trigger job_card_revision_reject_update is missing, disabled or points to another function.';
  end if;

  if not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.job_card_revision'::regclass
      and t.tgname = 'job_card_revision_reject_delete'
      and t.tgenabled <> 'D'
      and t.tgfoid = 'public.reject_job_card_revision_mutation()'::regprocedure
  ) then
    raise exception 'Required trigger job_card_revision_reject_delete is missing, disabled or points to another function.';
  end if;

  for unsafe_index in
    select required.index_name
    from (
      values
        (
          'job_card_draft_org_updated_idx',
          'create index job_card_draft_org_updated_idx on public.job_card_draft using btree (org_id, updated_at desc)'
        ),
        (
          'job_card_revision_output_hash_uidx',
          'create unique index job_card_revision_output_hash_uidx on public.job_card_revision using btree (org_id, source_order_id, output_hash)'
        ),
        (
          'job_card_revision_latest_idx',
          'create index job_card_revision_latest_idx on public.job_card_revision using btree (org_id, source_order_id, revision desc)'
        )
    ) as required(index_name, expected_definition)
    left join pg_class i
      on i.relname = required.index_name
     and i.relnamespace = 'public'::regnamespace
    left join pg_index x
      on x.indexrelid = i.oid
    where i.oid is null
       or not x.indisvalid
       or not x.indisready
       or lower(pg_get_indexdef(i.oid)) <> required.expected_definition
  loop
    raise exception 'Required Job Card index % is missing, invalid or has another definition.', unsafe_index;
  end loop;
end
$$;

commit;

-- Read-only postflight. Applying the schema must not create drafts or
-- published revisions by itself.
select
  (select count(*) from public.job_card_draft) as draft_count,
  (select count(*) from public.job_card_revision) as revision_count;
