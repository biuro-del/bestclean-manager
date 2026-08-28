-- Additive, short-lived authorization for an existing Google identity that
-- explicitly chooses to register its first cleaning company. This is not a
-- replacement for the immutable initial-registration provenance claim.
--
-- Apply only through scripts/migrate-cleaning-company-onboarding.js after a
-- read-only audit and explicit production confirmation.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

select pg_advisory_xact_lock(
  hashtextextended('cleanzi:cleaning-company-existing-google-enrollment:v1', 0)
);

do $$
begin
  if to_regclass('public.cleaning_company_onboarding_command') is null then
    raise exception 'Required table public.cleaning_company_onboarding_command does not exist.';
  end if;
  if to_regclass('public.cleaning_company_trial_redemption') is null then
    raise exception 'Required table public.cleaning_company_trial_redemption does not exist.';
  end if;
end
$$;

-- The record is created only after an authenticated, verified Google user
-- explicitly selects company registration. It is consumed in the same database
-- transaction that creates the company, owner membership and trial.
create table if not exists public.cleaning_company_onboarding_enrollment (
  enrollment_id uuid not null,
  actor_uid varchar(128) not null,
  email_normalized varchar(320) not null,
  provider_id varchar(40) not null,
  status varchar(16) not null default 'ACTIVE',
  expires_at timestamptz not null,
  onboarding_command_id uuid,
  created_at timestamptz not null default now(),
  activated_at timestamptz not null default now(),
  consumed_at timestamptz,
  expired_at timestamptz,
  primary key (enrollment_id),
  constraint cleaning_company_onboarding_enrollment_command_fk
    foreign key (onboarding_command_id)
    references public.cleaning_company_onboarding_command(command_id),
  constraint cleaning_company_onboarding_enrollment_provider_check
    check (provider_id = 'google.com'),
  constraint cleaning_company_onboarding_enrollment_status_check
    check (status in ('ACTIVE', 'CONSUMED', 'EXPIRED')),
  constraint cleaning_company_onboarding_enrollment_expiry_check
    check (expires_at > activated_at),
  constraint cleaning_company_onboarding_enrollment_lifecycle_check
    check (
      (status = 'ACTIVE' and consumed_at is null and onboarding_command_id is null)
      or (status = 'CONSUMED' and consumed_at is not null and onboarding_command_id is not null)
      or (status = 'EXPIRED' and consumed_at is null and onboarding_command_id is null)
    )
);

alter table public.cleaning_company_onboarding_enrollment
  add column if not exists actor_uid varchar(128),
  add column if not exists email_normalized varchar(320),
  add column if not exists provider_id varchar(40),
  add column if not exists status varchar(16),
  add column if not exists expires_at timestamptz,
  add column if not exists onboarding_command_id uuid,
  add column if not exists created_at timestamptz,
  add column if not exists activated_at timestamptz,
  add column if not exists consumed_at timestamptz,
  add column if not exists expired_at timestamptz;

-- If a prior interrupted local candidate created this relation, do not accept
-- nullable recovery columns. The transaction fails rather than silently
-- enabling a weakened enrollment store.
alter table public.cleaning_company_onboarding_enrollment
  alter column actor_uid set not null,
  alter column email_normalized set not null,
  alter column provider_id set not null,
  alter column status set not null,
  alter column expires_at set not null,
  alter column created_at set not null,
  alter column activated_at set not null,
  alter column status set default 'ACTIVE',
  alter column created_at set default now(),
  alter column activated_at set default now();

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.cleaning_company_onboarding_enrollment'::regclass
       and conname = 'cleaning_company_onboarding_enrollment_command_fk'
  ) then
    alter table public.cleaning_company_onboarding_enrollment
      add constraint cleaning_company_onboarding_enrollment_command_fk
      foreign key (onboarding_command_id)
      references public.cleaning_company_onboarding_command(command_id)
      not valid;
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.cleaning_company_onboarding_enrollment'::regclass
       and conname = 'cleaning_company_onboarding_enrollment_provider_check'
  ) then
    alter table public.cleaning_company_onboarding_enrollment
      add constraint cleaning_company_onboarding_enrollment_provider_check
      check (provider_id = 'google.com') not valid;
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.cleaning_company_onboarding_enrollment'::regclass
       and conname = 'cleaning_company_onboarding_enrollment_status_check'
  ) then
    alter table public.cleaning_company_onboarding_enrollment
      add constraint cleaning_company_onboarding_enrollment_status_check
      check (status in ('ACTIVE', 'CONSUMED', 'EXPIRED')) not valid;
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.cleaning_company_onboarding_enrollment'::regclass
       and conname = 'cleaning_company_onboarding_enrollment_expiry_check'
  ) then
    alter table public.cleaning_company_onboarding_enrollment
      add constraint cleaning_company_onboarding_enrollment_expiry_check
      check (expires_at > activated_at) not valid;
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.cleaning_company_onboarding_enrollment'::regclass
       and conname = 'cleaning_company_onboarding_enrollment_lifecycle_check'
  ) then
    alter table public.cleaning_company_onboarding_enrollment
      add constraint cleaning_company_onboarding_enrollment_lifecycle_check
      check (
        (status = 'ACTIVE' and consumed_at is null and onboarding_command_id is null)
        or (status = 'CONSUMED' and consumed_at is not null and onboarding_command_id is not null)
        or (status = 'EXPIRED' and consumed_at is null and onboarding_command_id is null)
      ) not valid;
  end if;
end
$$;

-- Constraints introduced on an already existing relation are added NOT VALID
-- above to keep the recovery branch explicit. Validate them before indexes or
-- runtime are allowed to rely on the table; any malformed pre-existing row
-- stops this additive migration safely.
do $$
declare
  enrollment_constraint record;
begin
  for enrollment_constraint in
    select conname
      from pg_constraint
     where conrelid = 'public.cleaning_company_onboarding_enrollment'::regclass
       and conname in (
         'cleaning_company_onboarding_enrollment_command_fk',
         'cleaning_company_onboarding_enrollment_provider_check',
         'cleaning_company_onboarding_enrollment_status_check',
         'cleaning_company_onboarding_enrollment_expiry_check',
         'cleaning_company_onboarding_enrollment_lifecycle_check'
       )
       and not convalidated
  loop
    execute format(
      'alter table public.cleaning_company_onboarding_enrollment validate constraint %I',
      enrollment_constraint.conname
    );
  end loop;
end
$$;

-- At most one live authorization may exist for a Firebase identity or e-mail.
-- Expired and consumed rows stay for reconciliation and support audit.
create unique index if not exists cleaning_company_onboarding_enrollment_active_uidx
  on public.cleaning_company_onboarding_enrollment (actor_uid)
  where status = 'ACTIVE';

create unique index if not exists cleaning_company_onboarding_enrollment_active_email_uidx
  on public.cleaning_company_onboarding_enrollment (email_normalized)
  where status = 'ACTIVE';

create index if not exists cleaning_company_onboarding_enrollment_actor_status_idx
  on public.cleaning_company_onboarding_enrollment (actor_uid, status, created_at desc);

commit;

-- Read-only postflight. The migration itself never creates a company, owner,
-- trial, consent, subscription or access to an existing organization.
select
  (select count(*) from public.cleaning_company_onboarding_enrollment) as enrollment_count,
  (
    select count(*)
      from public.cleaning_company_onboarding_enrollment
     where status = 'ACTIVE'
  ) as active_enrollment_count;
