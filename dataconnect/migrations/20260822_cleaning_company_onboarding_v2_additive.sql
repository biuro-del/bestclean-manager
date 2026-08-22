-- Additive, idempotent storage for the cleaning-company onboarding v2 command.
--
-- This migration never attaches a Firebase user to a company based on a NIP or
-- email. The unique guards intentionally fail a duplicate insert so the trusted
-- backend can return a safe invite/support path instead.
--
-- Apply only through scripts/migrate-cleaning-company-onboarding.js after a
-- read-only audit and explicit production confirmation.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

select pg_advisory_xact_lock(
  hashtextextended('cleanzi:cleaning-company-onboarding-v2-schema:v1', 0)
);

do $$
begin
  if to_regclass('public.organizations') is null then
    raise exception 'Required table public.organizations does not exist.';
  end if;
  if to_regclass('public.organization_member') is null then
    raise exception 'Required table public.organization_member does not exist.';
  end if;
  if to_regclass('public.worker') is null then
    raise exception 'Required table public.worker does not exist.';
  end if;
  if to_regclass('public.organization_subscription') is null then
    raise exception 'Required table public.organization_subscription does not exist.';
  end if;
end
$$;

-- Existing organizations stay unclassified. The trusted backend writes the
-- canonical uppercase SQL value CLEANING_PROVIDER for newly provisioned firms.
alter table public.organizations
  add column if not exists organization_kind varchar(40);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.organizations'::regclass
       and conname = 'organizations_organization_kind_format_check'
  ) then
    alter table public.organizations
      add constraint organizations_organization_kind_format_check
      check (
        organization_kind is null
        or organization_kind ~ '^[A-Z][A-Z0-9_]{0,39}$'
      ) not valid;
  end if;
end
$$;

-- The profile shape is compatible with the earlier registration snapshot.
-- New onboarding completion must set legal_name, tax_id_type = NIP,
-- tax_id_normalized, declared_employee_count and its source/timestamp. The
-- nullable additive columns avoid rewriting or invalidating legacy draft rows.
create table if not exists public.organization_company_profile (
  org_id varchar(64) not null,
  legal_name varchar(180) not null,
  registration_country_code varchar(2) not null default 'PL',
  tax_id_type varchar(30),
  tax_id_value varchar(64),
  tax_id_normalized varchar(64),
  declared_employee_count integer,
  declared_employee_count_source varchar(40),
  declared_employee_count_recorded_at timestamptz,
  country_code varchar(2) not null default 'PL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id),
  constraint organization_company_profile_org_fk
    foreign key (org_id) references public.organizations(org_id),
  constraint organization_company_profile_declared_employee_count_check
    check (
      declared_employee_count is null
      or declared_employee_count between 0 and 100000
    )
);

alter table public.organization_company_profile
  add column if not exists legal_name varchar(180),
  add column if not exists registration_country_code varchar(2),
  add column if not exists tax_id_type varchar(30),
  add column if not exists tax_id_value varchar(64),
  add column if not exists tax_id_normalized varchar(64),
  add column if not exists declared_employee_count integer,
  add column if not exists declared_employee_count_source varchar(40),
  add column if not exists declared_employee_count_recorded_at timestamptz,
  add column if not exists country_code varchar(2),
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.organization_company_profile'::regclass
       and conname = 'organization_company_profile_org_fk'
  ) then
    alter table public.organization_company_profile
      add constraint organization_company_profile_org_fk
      foreign key (org_id) references public.organizations(org_id)
      not valid;
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.organization_company_profile'::regclass
       and conname = 'organization_company_profile_declared_employee_count_check'
  ) then
    alter table public.organization_company_profile
      add constraint organization_company_profile_declared_employee_count_check
      check (
        declared_employee_count is null
        or declared_employee_count between 0 and 100000
      ) not valid;
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.organization_company_profile'::regclass
       and conname = 'organization_company_profile_nip_normalized_check'
  ) then
    alter table public.organization_company_profile
      add constraint organization_company_profile_nip_normalized_check
      check (
        upper(coalesce(tax_id_type, '')) <> 'NIP'
        or (
          tax_id_normalized is not null
          and tax_id_normalized ~ '^[0-9]{10}$'
        )
      ) not valid;
  end if;
end
$$;

-- This is intentionally a duplicate detector, not an organization lookup.
-- A 23505 on this exact index maps to NIP_ALREADY_REGISTERED; it must never
-- cause automatic membership creation or automatic access reuse.
create unique index if not exists organization_company_profile_nip_cleaning_provider_uidx
  on public.organization_company_profile (tax_id_normalized)
  where upper(coalesce(tax_id_type, '')) = 'NIP'
    and tax_id_normalized ~ '^[0-9]{10}$';

-- The durable command record is the idempotency ledger for a successful v2
-- provisioning transaction. `payload_hash` is compared before replaying a
-- result. It contains no raw NIP, legal name, token, or other browser secret.
create table if not exists public.cleaning_company_onboarding_command (
  command_id uuid not null,
  actor_uid varchar(128) not null,
  org_id varchar(64) not null,
  schema_version smallint not null default 2,
  payload_hash char(64) not null,
  result_status varchar(30) not null default 'COMPLETED',
  result_payload jsonb not null default '{}'::jsonb,
  trial_started_at timestamptz not null,
  trial_ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  primary key (command_id),
  constraint cleaning_company_onboarding_command_org_fk
    foreign key (org_id) references public.organizations(org_id),
  constraint cleaning_company_onboarding_command_org_schema_unique
    unique (org_id, schema_version),
  constraint cleaning_company_onboarding_command_schema_version_check
    check (schema_version = 2),
  constraint cleaning_company_onboarding_command_result_status_check
    check (result_status = 'COMPLETED'),
  constraint cleaning_company_onboarding_command_trial_window_check
    check (trial_ends_at > trial_started_at)
);

-- Existing deployments cannot have rows in a newly-created command table, but
-- each addition is also safe if an interrupted prior candidate left the table.
alter table public.cleaning_company_onboarding_command
  add column if not exists actor_uid varchar(128),
  add column if not exists org_id varchar(64),
  add column if not exists schema_version smallint,
  add column if not exists payload_hash char(64),
  add column if not exists result_status varchar(30),
  add column if not exists result_payload jsonb,
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists created_at timestamptz,
  add column if not exists completed_at timestamptz;

-- Keep the legacy generic consent table available to existing paths. Onboarding
-- rows link to the command, while append-only evidence is retained separately
-- below so legacy consent withdrawal/update code is not blocked.
create table if not exists public.user_consent (
  consent_id varchar(64) not null,
  org_id varchar(64) not null,
  uid varchar(128) not null,
  consent_type varchar(40) not null,
  consent_version varchar(64) not null,
  document_id varchar(120),
  accepted boolean not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  locale varchar(10),
  ip_hash varchar(128),
  user_agent text,
  onboarding_command_id uuid,
  created_at timestamptz not null default now(),
  primary key (consent_id),
  constraint user_consent_org_fk
    foreign key (org_id) references public.organizations(org_id),
  constraint user_consent_onboarding_command_fk
    foreign key (onboarding_command_id)
    references public.cleaning_company_onboarding_command(command_id)
);

alter table public.user_consent
  add column if not exists document_id varchar(120),
  add column if not exists onboarding_command_id uuid;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.user_consent'::regclass
       and conname = 'user_consent_onboarding_command_fk'
  ) then
    alter table public.user_consent
      add constraint user_consent_onboarding_command_fk
      foreign key (onboarding_command_id)
      references public.cleaning_company_onboarding_command(command_id)
      not valid;
  end if;
end
$$;

create unique index if not exists user_consent_onboarding_command_type_uidx
  on public.user_consent (onboarding_command_id, consent_type)
  where onboarding_command_id is not null;

-- Immutable v2 evidence. A later withdrawal is a new consent/revocation event;
-- it must not update or delete the acceptance evidence for this command.
create table if not exists public.cleaning_company_onboarding_consent_audit (
  audit_id uuid not null,
  command_id uuid not null,
  consent_id varchar(64) not null,
  org_id varchar(64) not null,
  uid varchar(128) not null,
  consent_type varchar(40) not null,
  document_id varchar(120),
  consent_version varchar(64) not null,
  accepted boolean not null,
  accepted_at timestamptz,
  locale varchar(10),
  source varchar(40) not null default 'company-onboarding',
  recorded_at timestamptz not null default now(),
  primary key (audit_id),
  constraint cleaning_company_onboarding_consent_audit_command_fk
    foreign key (command_id)
    references public.cleaning_company_onboarding_command(command_id),
  constraint cleaning_company_onboarding_consent_audit_consent_fk
    foreign key (consent_id) references public.user_consent(consent_id),
  constraint cleaning_company_onboarding_consent_audit_org_fk
    foreign key (org_id) references public.organizations(org_id),
  constraint cleaning_company_onboarding_consent_audit_command_type_unique
    unique (command_id, consent_type),
  constraint cleaning_company_onboarding_consent_audit_consent_unique
    unique (consent_id),
  constraint cleaning_company_onboarding_consent_audit_acceptance_time_check
    check (
      (accepted and accepted_at is not null)
      or (not accepted and accepted_at is null)
    )
);

-- One trial only per Firebase user (and, defensively, per normalized verified
-- email). Neither unique violation authorizes access to the existing firm.
create table if not exists public.cleaning_company_trial_redemption (
  redemption_id uuid not null,
  command_id uuid not null,
  uid varchar(128) not null,
  email_normalized varchar(320) not null,
  org_id varchar(64) not null,
  redeemed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (redemption_id),
  constraint cleaning_company_trial_redemption_command_unique
    unique (command_id),
  constraint cleaning_company_trial_redemption_uid_unique
    unique (uid),
  constraint cleaning_company_trial_redemption_command_fk
    foreign key (command_id)
    references public.cleaning_company_onboarding_command(command_id),
  constraint cleaning_company_trial_redemption_org_fk
    foreign key (org_id) references public.organizations(org_id),
  constraint cleaning_company_trial_redemption_email_normalized_check
    check (email_normalized = lower(btrim(email_normalized)))
);

create unique index if not exists cleaning_company_trial_redemption_email_uidx
  on public.cleaning_company_trial_redemption (email_normalized);

-- The production snapshot has a stricter subscription shape than the current
-- Data Connect schema. These columns are additive. Direct-SQL provisioning must
-- still inspect and supply every NOT NULL/no-default column reported by the
-- runner, rather than assuming a database default.
alter table public.organization_subscription
  add column if not exists billing_owner_uid varchar(128),
  add column if not exists billing_owner_worker_id varchar(64),
  add column if not exists currency_code varchar(3),
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists current_period_started_at timestamptz,
  add column if not exists current_period_ends_at timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.organization_subscription'::regclass
       and conname = 'organization_subscription_currency_code_check'
  ) then
    alter table public.organization_subscription
      add constraint organization_subscription_currency_code_check
      check (
        currency_code is null
        or currency_code ~ '^[A-Z]{3}$'
      ) not valid;
  end if;
end
$$;

-- Canonical period spelling for direct SQL is current_period_started_at. The
-- older current_period_starts_at column is deliberately retained untouched.
create table if not exists public.subscription_event (
  org_id varchar(64) not null,
  subscription_event_id varchar(64) not null,
  event_type varchar(60) not null,
  previous_status varchar(30),
  new_status varchar(30),
  previous_plan_code varchar(30),
  new_plan_code varchar(30),
  actor_uid varchar(128),
  actor_worker_id varchar(64),
  source varchar(30),
  reason text,
  metadata jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (org_id, subscription_event_id),
  constraint subscription_event_org_fk
    foreign key (org_id) references public.organizations(org_id)
);

create index if not exists subscription_event_org_occurred_idx
  on public.subscription_event (org_id, occurred_at desc);

create or replace function public.reject_cleaning_company_onboarding_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'CLEANING_COMPANY_ONBOARDING_IMMUTABLE:%', tg_table_name;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.cleaning_company_onboarding_command'::regclass
       and tgname = 'cleaning_company_onboarding_command_immutable'
       and not tgisinternal
  ) then
    create trigger cleaning_company_onboarding_command_immutable
    before update or delete on public.cleaning_company_onboarding_command
    for each row execute function public.reject_cleaning_company_onboarding_mutation();
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.cleaning_company_onboarding_consent_audit'::regclass
       and tgname = 'cleaning_company_onboarding_consent_audit_immutable'
       and not tgisinternal
  ) then
    create trigger cleaning_company_onboarding_consent_audit_immutable
    before update or delete on public.cleaning_company_onboarding_consent_audit
    for each row execute function public.reject_cleaning_company_onboarding_mutation();
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.cleaning_company_trial_redemption'::regclass
       and tgname = 'cleaning_company_trial_redemption_immutable'
       and not tgisinternal
  ) then
    create trigger cleaning_company_trial_redemption_immutable
    before update or delete on public.cleaning_company_trial_redemption
    for each row execute function public.reject_cleaning_company_onboarding_mutation();
  end if;
end
$$;

-- Verify that a replay cannot silently accept a table/index/trigger with the
-- same name but a weaker shape. Constraints added with NOT VALID deliberately
-- protect all new writes without backfilling unknown legacy records.
do $$
declare
  mismatch record;
  unsafe_index text;
  missing_constraint text;
  missing_trigger text;
begin
  for mismatch in
    with expected(table_name, column_name, formatted_type) as (
      values
        ('organizations', 'organization_kind', 'character varying(40)'),
        ('organization_company_profile', 'org_id', 'character varying(64)'),
        ('organization_company_profile', 'legal_name', 'character varying(180)'),
        ('organization_company_profile', 'tax_id_type', 'character varying(30)'),
        ('organization_company_profile', 'tax_id_normalized', 'character varying(64)'),
        ('organization_company_profile', 'declared_employee_count', 'integer'),
        ('organization_company_profile', 'declared_employee_count_source', 'character varying(40)'),
        ('organization_company_profile', 'declared_employee_count_recorded_at', 'timestamp with time zone'),
        ('cleaning_company_onboarding_command', 'command_id', 'uuid'),
        ('cleaning_company_onboarding_command', 'actor_uid', 'character varying(128)'),
        ('cleaning_company_onboarding_command', 'org_id', 'character varying(64)'),
        ('cleaning_company_onboarding_command', 'payload_hash', 'character(64)'),
        ('cleaning_company_onboarding_command', 'trial_started_at', 'timestamp with time zone'),
        ('cleaning_company_onboarding_command', 'trial_ends_at', 'timestamp with time zone'),
        ('user_consent', 'document_id', 'character varying(120)'),
        ('user_consent', 'onboarding_command_id', 'uuid'),
        ('cleaning_company_onboarding_consent_audit', 'audit_id', 'uuid'),
        ('cleaning_company_onboarding_consent_audit', 'command_id', 'uuid'),
        ('cleaning_company_onboarding_consent_audit', 'consent_id', 'character varying(64)'),
        ('cleaning_company_trial_redemption', 'redemption_id', 'uuid'),
        ('cleaning_company_trial_redemption', 'uid', 'character varying(128)'),
        ('cleaning_company_trial_redemption', 'email_normalized', 'character varying(320)'),
        ('organization_subscription', 'billing_owner_uid', 'character varying(128)'),
        ('organization_subscription', 'billing_owner_worker_id', 'character varying(64)'),
        ('organization_subscription', 'currency_code', 'character varying(3)'),
        ('organization_subscription', 'current_period_started_at', 'timestamp with time zone'),
        ('subscription_event', 'subscription_event_id', 'character varying(64)')
    )
    select
      expected.table_name,
      expected.column_name,
      expected.formatted_type as expected_type,
      format_type(a.atttypid, a.atttypmod) as actual_type
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
  loop
    raise exception
      'Unsafe %.% definition. Expected type %; actual type %.',
      mismatch.table_name,
      mismatch.column_name,
      mismatch.expected_type,
      coalesce(mismatch.actual_type, '<missing>');
  end loop;

  for missing_constraint in
    select required.table_name || '.' || required.constraint_name
      from (
        values
          ('organizations', 'organizations_organization_kind_format_check'),
          ('organization_company_profile', 'organization_company_profile_declared_employee_count_check'),
          ('organization_company_profile', 'organization_company_profile_nip_normalized_check'),
          ('cleaning_company_onboarding_command', 'cleaning_company_onboarding_command_pkey'),
          ('cleaning_company_onboarding_command', 'cleaning_company_onboarding_command_org_fk'),
          ('cleaning_company_onboarding_consent_audit', 'cleaning_company_onboarding_consent_audit_pkey'),
          ('cleaning_company_onboarding_consent_audit', 'cleaning_company_onboarding_consent_audit_command_type_unique'),
          ('cleaning_company_trial_redemption', 'cleaning_company_trial_redemption_pkey'),
          ('cleaning_company_trial_redemption', 'cleaning_company_trial_redemption_uid_unique')
      ) as required(table_name, constraint_name)
     where not exists (
       select 1
         from pg_constraint c
         join pg_class relation on relation.oid = c.conrelid
        where c.connamespace = 'public'::regnamespace
          and relation.relname = required.table_name
          and c.conname = required.constraint_name
     )
  loop
    raise exception 'Required cleaning-company onboarding constraint % is missing.', missing_constraint;
  end loop;

  for unsafe_index in
    select required.index_name
      from (
        values
          ('organization_company_profile_nip_cleaning_provider_uidx'),
          ('cleaning_company_trial_redemption_email_uidx'),
          ('user_consent_onboarding_command_type_uidx')
      ) as required(index_name)
      left join pg_class i
        on i.relname = required.index_name
       and i.relnamespace = 'public'::regnamespace
      left join pg_index x on x.indexrelid = i.oid
     where i.oid is null
        or not x.indisunique
        or not x.indisvalid
        or not x.indisready
  loop
    raise exception 'Required cleaning-company onboarding index % is missing, invalid or not unique.', unsafe_index;
  end loop;

  for missing_trigger in
    select required.table_name || '.' || required.trigger_name
      from (
        values
          ('cleaning_company_onboarding_command', 'cleaning_company_onboarding_command_immutable'),
          ('cleaning_company_onboarding_consent_audit', 'cleaning_company_onboarding_consent_audit_immutable'),
          ('cleaning_company_trial_redemption', 'cleaning_company_trial_redemption_immutable')
      ) as required(table_name, trigger_name)
     where not exists (
       select 1
         from pg_trigger t
         join pg_class relation on relation.oid = t.tgrelid
        where relation.relnamespace = 'public'::regnamespace
          and relation.relname = required.table_name
          and t.tgname = required.trigger_name
          and t.tgenabled <> 'D'
          and t.tgfoid = 'public.reject_cleaning_company_onboarding_mutation()'::regprocedure
     )
  loop
    raise exception 'Required cleaning-company onboarding trigger % is missing, disabled or points to another function.', missing_trigger;
  end loop;
end
$$;

commit;

-- Read-only postflight. The migration must not create an organization, profile,
-- trial, command, consent, or subscription event by itself.
select
  (select count(*) from public.organization_company_profile) as company_profile_count,
  (select count(*) from public.cleaning_company_onboarding_command) as onboarding_command_count,
  (select count(*) from public.cleaning_company_onboarding_consent_audit) as onboarding_consent_audit_count,
  (select count(*) from public.cleaning_company_trial_redemption) as trial_redemption_count,
  (select count(*) from public.subscription_event) as subscription_event_count;
