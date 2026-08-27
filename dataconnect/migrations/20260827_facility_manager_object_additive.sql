-- Facility-manager-owned objects. Additive only; do not replace existing cleaning-service domain tables.
-- Apply only with the dedicated audited migration runner after production preflight.

begin;

-- Bound DDL wait time even if this file is run outside the dedicated runner.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table if not exists public.facility_manager_object (
  org_id varchar(64) not null,
  object_id varchar(64) not null,
  name varchar(160) not null,
  address_line_1 varchar(180) not null,
  postal_code varchar(16) not null,
  city varchar(100) not null,
  reference varchar(160),
  status varchar(24) not null default 'ACTIVE',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by_uid varchar(128) not null,
  updated_at timestamptz not null default now(),
  updated_by_uid varchar(128) not null,
  archived_at timestamptz,
  archived_by_uid varchar(128),
  create_request_key varchar(160) not null,
  create_payload_fingerprint char(64) not null,
  primary key (org_id, object_id),
  constraint facility_manager_object_org_fk
    foreign key (org_id)
    references public.organizations (org_id)
    on delete cascade,
  constraint facility_manager_object_status_check
    check (status in ('ACTIVE', 'ARCHIVED')),
  constraint facility_manager_object_version_check
    check (version > 0),
  constraint facility_manager_object_create_request_key_check
    check (create_request_key ~ '^[A-Za-z0-9_-]{16,160}$'),
  constraint facility_manager_object_payload_fingerprint_check
    check (create_payload_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint facility_manager_object_create_request_unique
    unique (org_id, created_by_uid, create_request_key)
);

create index if not exists facility_manager_object_org_status_idx
  on public.facility_manager_object (org_id, status, lower(name), object_id);

create index if not exists facility_manager_object_org_updated_idx
  on public.facility_manager_object (org_id, updated_at desc, object_id);

create table if not exists public.facility_manager_object_audit (
  audit_id bigserial primary key,
  org_id varchar(64) not null,
  object_id varchar(64) not null,
  action varchar(24) not null,
  actor_uid varchar(128) not null,
  occurred_at timestamptz not null default now(),
  constraint facility_manager_object_audit_object_fk
    foreign key (org_id, object_id)
    references public.facility_manager_object (org_id, object_id)
    on delete cascade,
  constraint facility_manager_object_audit_action_check
    check (action in ('CREATED', 'UPDATED', 'ARCHIVED'))
);

create index if not exists facility_manager_object_audit_object_idx
  on public.facility_manager_object_audit (org_id, object_id, occurred_at desc);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'portal_app') then
    grant select, insert, update on table public.facility_manager_object to portal_app;
    grant insert on table public.facility_manager_object_audit to portal_app;
    grant usage, select on sequence public.facility_manager_object_audit_audit_id_seq to portal_app;
  end if;
end $$;

commit;
