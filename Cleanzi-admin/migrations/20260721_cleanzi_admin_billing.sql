create table if not exists public.platform_plan (
  plan_code varchar(30) primary key,
  display_name varchar(120) not null,
  active boolean not null default true,
  price_amount_minor bigint,
  currency varchar(3),
  billing_interval_unit varchar(20),
  billing_interval_count integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_plan_price_check check (
    (price_amount_minor is null and currency is null)
    or (price_amount_minor >= 0 and currency ~ '^[A-Z]{3}$')
  ),
  constraint platform_plan_interval_check check (
    (billing_interval_unit is null and billing_interval_count is null)
    or (
      billing_interval_unit in ('DAY', 'WEEK', 'MONTH', 'YEAR')
      and billing_interval_count between 1 and 120
    )
  )
);

insert into public.platform_plan (
  plan_code,
  display_name,
  active,
  price_amount_minor,
  currency,
  billing_interval_unit,
  billing_interval_count
)
values
  ('TRIAL', 'Trial', true, null, null, null, null),
  ('START', 'Start', true, null, null, null, null),
  ('PRO', 'Pro', true, null, null, null, null)
on conflict (plan_code) do nothing;

alter table if exists public.organization_subscription
  add column if not exists trial_started_at timestamptz,
  add column if not exists current_period_starts_at timestamptz,
  add column if not exists current_period_ends_at timestamptz,
  add column if not exists activated_at timestamptz,
  add column if not exists canceled_at timestamptz,
  add column if not exists provider_code varchar(40),
  add column if not exists provider_subscription_id varchar(255),
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz,
  add column if not exists version integer not null default 0;

alter table if exists public.organizations
  add column if not exists updated_at timestamptz;

update public.organization_subscription
   set created_at = coalesce(created_at, trial_started_at, now()),
       updated_at = coalesce(updated_at, created_at, trial_started_at, now())
 where created_at is null or updated_at is null;

alter table public.organization_subscription
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

update public.organizations
   set updated_at = coalesce(updated_at, created_at, now())
 where updated_at is null;

alter table public.organizations
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if to_regclass('public.organization_subscription') is not null
     and not exists (
       select 1
         from pg_constraint
        where conname = 'organization_subscription_plan_fk'
          and conrelid = 'public.organization_subscription'::regclass
     ) then
    alter table public.organization_subscription
      add constraint organization_subscription_plan_fk
      foreign key (plan_code)
      references public.platform_plan(plan_code)
      not valid;
  end if;
end
$$;

create table if not exists public.organization_subscription_history (
  history_id varchar(36) primary key,
  org_id varchar(64) not null references public.organizations(org_id) on delete restrict,
  request_id varchar(64) not null,
  operation varchar(80) not null,
  source varchar(20) not null,
  reason varchar(1000),
  admin_uid varchar(128),
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now(),
  constraint organization_subscription_history_source_check
    check (source in ('MANUAL', 'SYSTEM', 'PROVIDER')),
  constraint organization_subscription_history_manual_reason_check
    check (source <> 'MANUAL' or length(trim(coalesce(reason, ''))) >= 3)
);

create index if not exists organization_subscription_history_org_created_idx
  on public.organization_subscription_history (org_id, created_at desc);

create index if not exists organization_subscription_history_request_idx
  on public.organization_subscription_history (request_id, created_at asc);

create table if not exists public.organization_billing_account (
  billing_account_id varchar(36) primary key,
  org_id varchar(64) not null references public.organizations(org_id) on delete restrict,
  provider_code varchar(40) not null,
  provider_customer_id varchar(255) not null,
  status varchar(30) not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, provider_code),
  unique (provider_code, provider_customer_id)
);

create table if not exists public.billing_document (
  document_id varchar(36) primary key,
  org_id varchar(64) not null references public.organizations(org_id) on delete restrict,
  document_type varchar(30) not null,
  document_number varchar(120),
  status varchar(30) not null,
  amount_minor bigint not null,
  currency varchar(3) not null,
  source varchar(20) not null,
  reason varchar(1000),
  idempotency_key varchar(160) not null,
  request_fingerprint varchar(64) not null,
  provider_code varchar(40),
  provider_document_id varchar(255),
  storage_key varchar(500),
  issued_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_document_type_check
    check (document_type in ('INVOICE', 'CREDIT_NOTE', 'RECEIPT', 'OTHER')),
  constraint billing_document_status_check
    check (status in ('DRAFT', 'ISSUED', 'PAID', 'VOID')),
  constraint billing_document_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint billing_document_source_check
    check (source in ('MANUAL', 'SYSTEM', 'PROVIDER')),
  constraint billing_document_manual_reason_check
    check (source <> 'MANUAL' or length(trim(coalesce(reason, ''))) >= 3),
  unique (source, idempotency_key)
);

create unique index if not exists billing_document_provider_id_uidx
  on public.billing_document (provider_code, provider_document_id)
  where provider_code is not null and provider_document_id is not null;

create index if not exists billing_document_org_created_idx
  on public.billing_document (org_id, created_at desc);

create table if not exists public.billing_transaction (
  transaction_id varchar(36) primary key,
  org_id varchar(64) not null references public.organizations(org_id) on delete restrict,
  transaction_type varchar(30) not null,
  status varchar(30) not null,
  amount_minor bigint not null,
  currency varchar(3) not null,
  source varchar(20) not null,
  reason varchar(1000),
  idempotency_key varchar(160) not null,
  request_fingerprint varchar(64) not null,
  related_transaction_id varchar(36) references public.billing_transaction(transaction_id) on delete restrict,
  document_id varchar(36) references public.billing_document(document_id) on delete set null,
  provider_code varchar(40),
  provider_payment_id varchar(255),
  provider_refund_id varchar(255),
  occurred_at timestamptz not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_transaction_type_check
    check (transaction_type in ('PAYMENT', 'REFUND', 'ADJUSTMENT')),
  constraint billing_transaction_status_check
    check (status in ('PENDING', 'CONFIRMED', 'FAILED', 'CANCELED')),
  constraint billing_transaction_source_check
    check (source in ('MANUAL', 'SYSTEM', 'PROVIDER')),
  constraint billing_transaction_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint billing_transaction_amount_check check (
    (transaction_type = 'PAYMENT' and amount_minor > 0)
    or (transaction_type = 'REFUND' and amount_minor < 0)
    or (transaction_type = 'ADJUSTMENT' and amount_minor <> 0)
  ),
  constraint billing_transaction_manual_reason_check
    check (source <> 'MANUAL' or length(trim(coalesce(reason, ''))) >= 3),
  unique (source, idempotency_key)
);

create unique index if not exists billing_transaction_provider_payment_uidx
  on public.billing_transaction (provider_code, provider_payment_id)
  where provider_code is not null and provider_payment_id is not null;

create unique index if not exists billing_transaction_provider_refund_uidx
  on public.billing_transaction (provider_code, provider_refund_id)
  where provider_code is not null and provider_refund_id is not null;

create index if not exists billing_transaction_org_occurred_idx
  on public.billing_transaction (org_id, occurred_at desc, transaction_id);

create index if not exists billing_transaction_related_idx
  on public.billing_transaction (related_transaction_id)
  where related_transaction_id is not null;

create table if not exists public.billing_transaction_event (
  event_id varchar(36) primary key,
  transaction_id varchar(36) not null references public.billing_transaction(transaction_id) on delete restrict,
  request_id varchar(64) not null,
  event_type varchar(50) not null,
  source varchar(20) not null,
  payload jsonb,
  created_at timestamptz not null default now(),
  constraint billing_transaction_event_source_check
    check (source in ('MANUAL', 'SYSTEM', 'PROVIDER'))
);

create index if not exists billing_transaction_event_transaction_created_idx
  on public.billing_transaction_event (transaction_id, created_at asc);

create or replace function public.cleanzi_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists cleanzi_admin_platform_plan_set_updated_at on public.platform_plan;
create trigger cleanzi_admin_platform_plan_set_updated_at
before update on public.platform_plan
for each row execute function public.cleanzi_set_updated_at();

drop trigger if exists cleanzi_admin_subscription_set_updated_at on public.organization_subscription;
create trigger cleanzi_admin_subscription_set_updated_at
before update on public.organization_subscription
for each row execute function public.cleanzi_set_updated_at();

drop trigger if exists cleanzi_admin_organizations_set_updated_at on public.organizations;
create trigger cleanzi_admin_organizations_set_updated_at
before update on public.organizations
for each row execute function public.cleanzi_set_updated_at();

drop trigger if exists cleanzi_admin_billing_account_set_updated_at on public.organization_billing_account;
create trigger cleanzi_admin_billing_account_set_updated_at
before update on public.organization_billing_account
for each row execute function public.cleanzi_set_updated_at();

drop trigger if exists cleanzi_admin_transaction_set_updated_at on public.billing_transaction;
create trigger cleanzi_admin_transaction_set_updated_at
before update on public.billing_transaction
for each row execute function public.cleanzi_set_updated_at();

drop trigger if exists cleanzi_admin_document_set_updated_at on public.billing_document;
create trigger cleanzi_admin_document_set_updated_at
before update on public.billing_document
for each row execute function public.cleanzi_set_updated_at();

create or replace function public.prevent_cleanzi_admin_history_change()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

drop trigger if exists organization_subscription_history_append_only
  on public.organization_subscription_history;
create trigger organization_subscription_history_append_only
before update or delete on public.organization_subscription_history
for each row execute function public.prevent_cleanzi_admin_history_change();

drop trigger if exists billing_transaction_event_append_only
  on public.billing_transaction_event;
create trigger billing_transaction_event_append_only
before update or delete on public.billing_transaction_event
for each row execute function public.prevent_cleanzi_admin_history_change();

revoke all on public.organization_subscription_history from public;
revoke all on public.platform_plan from public;
revoke all on public.organization_billing_account from public;
revoke all on public.billing_transaction from public;
revoke all on public.billing_transaction_event from public;
revoke all on public.billing_document from public;
