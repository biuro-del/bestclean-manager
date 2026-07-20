create table if not exists public.platform_admin (
  uid varchar(128) primary key,
  email varchar(160) not null,
  display_name varchar(160),
  role varchar(40) not null default 'PLATFORM_OWNER',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_uid varchar(128),
  constraint platform_admin_role_check check (role = 'PLATFORM_OWNER')
);

create unique index if not exists platform_admin_email_ci_uidx
  on public.platform_admin (lower(email));

create table if not exists public.platform_access_context (
  context_id varchar(36) primary key,
  admin_uid varchar(128) not null references public.platform_admin(uid) on delete restrict,
  org_id varchar(64) not null references public.organizations(org_id) on delete restrict,
  reason varchar(1000) not null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  ip_address varchar(128),
  user_agent varchar(500),
  constraint platform_access_reason_check check (length(trim(reason)) >= 3)
);

create unique index if not exists platform_access_one_active_uidx
  on public.platform_access_context (admin_uid)
  where closed_at is null;

create index if not exists platform_access_org_opened_idx
  on public.platform_access_context (org_id, opened_at desc);

create table if not exists public.platform_admin_audit_log (
  audit_id varchar(36) primary key,
  request_id varchar(64) not null,
  phase varchar(20) not null,
  admin_uid varchar(128) not null,
  admin_email varchar(160) not null,
  context_id varchar(36),
  org_id varchar(64),
  operation varchar(160) not null,
  target varchar(500),
  payload jsonb,
  result jsonb,
  ip_address varchar(128),
  user_agent varchar(500),
  created_at timestamptz not null default now(),
  constraint platform_audit_phase_check check (phase in ('REQUESTED', 'SUCCEEDED', 'FAILED'))
);

create index if not exists platform_audit_request_idx
  on public.platform_admin_audit_log (request_id, created_at asc);

create index if not exists platform_audit_admin_created_idx
  on public.platform_admin_audit_log (admin_uid, created_at desc);

create index if not exists platform_audit_org_created_idx
  on public.platform_admin_audit_log (org_id, created_at desc);

create or replace function public.prevent_platform_audit_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'platform_admin_audit_log is append-only';
end;
$$;

drop trigger if exists platform_audit_append_only on public.platform_admin_audit_log;
create trigger platform_audit_append_only
before update or delete on public.platform_admin_audit_log
for each row execute function public.prevent_platform_audit_change();
