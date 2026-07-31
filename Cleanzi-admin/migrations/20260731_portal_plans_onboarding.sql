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
  ('GO_PLUS', 'GO+', true, null, null, 'MONTH', 1),
  ('PLUS', 'PLUS', true, null, null, 'MONTH', 1)
on conflict (plan_code) do nothing;

create table if not exists public.organization_profile (
  org_id varchar(64) primary key references public.organizations(org_id) on delete restrict,
  nip varchar(10),
  regon varchar(14),
  legal_name varchar(300),
  registered_address text,
  street varchar(180),
  building_number varchar(40),
  unit_number varchar(40),
  postal_code varchar(12),
  city varchar(120),
  country_code varchar(2) not null default 'PL',
  owner_full_name varchar(200),
  billing_name varchar(300),
  billing_nip varchar(10),
  billing_address text,
  billing_postal_code varchar(12),
  billing_city varchar(120),
  billing_country_code varchar(2) not null default 'PL',
  billing_email varchar(160),
  registry_provider varchar(40),
  registry_fetched_at timestamptz,
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_uid varchar(128),
  constraint organization_profile_nip_check check (nip is null or nip ~ '^[0-9]{10}$'),
  constraint organization_profile_billing_nip_check check (billing_nip is null or billing_nip ~ '^[0-9]{10}$'),
  constraint organization_profile_country_check check (country_code ~ '^[A-Z]{2}$'),
  constraint organization_profile_billing_country_check check (billing_country_code ~ '^[A-Z]{2}$')
);

create index if not exists organization_profile_nip_idx
  on public.organization_profile (nip)
  where nip is not null;

create table if not exists public.billing_provider_event (
  provider_code varchar(40) not null,
  event_id varchar(255) not null,
  event_type varchar(120) not null,
  org_id varchar(64) references public.organizations(org_id) on delete restrict,
  status varchar(30) not null default 'RECEIVED',
  payload_hash varchar(64) not null,
  error_message varchar(1000),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  primary key (provider_code, event_id),
  constraint billing_provider_event_status_check
    check (status in ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED'))
);

create index if not exists billing_provider_event_org_received_idx
  on public.billing_provider_event (org_id, received_at desc)
  where org_id is not null;

drop trigger if exists organization_profile_set_updated_at on public.organization_profile;
create trigger organization_profile_set_updated_at
before update on public.organization_profile
for each row execute function public.cleanzi_set_updated_at();

revoke all on public.organization_profile from public;
revoke all on public.billing_provider_event from public;
