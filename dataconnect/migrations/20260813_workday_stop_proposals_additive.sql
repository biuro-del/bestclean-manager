-- Additive migration. It is deliberately not executed by this application change.
-- A production run requires separate owner approval and a privileged migration identity.
-- It introduces a proposal and audit trail; public.workday.end_at remains the only official STOP source.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

select pg_advisory_xact_lock(
  hashtextextended('cleanzi:workday-stop-proposals:v1', 0)
);

do $$
begin
  if to_regclass('public.organizations') is null then
    raise exception 'Required table public.organizations does not exist.';
  end if;
  if to_regclass('public.workday') is null then
    raise exception 'Required table public.workday does not exist.';
  end if;
end
$$;

create table if not exists public.workday_time_permission (
  org_id varchar(64) not null,
  uid varchar(128) not null,
  permission_code varchar(64) not null,
  granted_by varchar(128) not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by varchar(128),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, uid, permission_code),
  constraint workday_time_permission_org_fk
    foreign key (org_id) references public.organizations(org_id),
  constraint workday_time_permission_code_check
    check (permission_code in ('workday_time_approver')),
  constraint workday_time_permission_revocation_check
    check ((revoked_at is null and revoked_by is null) or (revoked_at is not null and revoked_by is not null))
);

create table if not exists public.workday_stop_proposal (
  proposal_id varchar(96) not null,
  org_id varchar(64) not null,
  worker_id varchar(128) not null,
  workday_id varchar(64) not null,
  proposed_stop_at timestamptz not null,
  proposed_stop_local varchar(16) not null,
  time_zone varchar(64) not null,
  submitted_at timestamptz not null default now(),
  submitted_by varchar(128) not null,
  employee_note text,
  status varchar(20) not null default 'PENDING',
  reviewed_at timestamptz,
  reviewed_by varchar(128),
  decision_note text,
  official_stop_at timestamptz,
  version integer not null default 1,
  client_action_id varchar(128) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, proposal_id),
  constraint workday_stop_proposal_org_fk
    foreign key (org_id) references public.organizations(org_id),
  constraint workday_stop_proposal_workday_fk
    foreign key (org_id, workday_id) references public.workday(org_id, workday_id),
  constraint workday_stop_proposal_status_check
    check (status in ('PENDING', 'APPROVED', 'CORRECTED', 'REJECTED', 'SUPERSEDED')),
  constraint workday_stop_proposal_time_zone_check
    check (time_zone = 'Europe/Warsaw'),
  constraint workday_stop_proposal_local_time_check
    check (proposed_stop_local ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$'),
  constraint workday_stop_proposal_version_check
    check (version >= 1),
  constraint workday_stop_proposal_decision_shape_check
    check (
      (status = 'PENDING' and reviewed_at is null and reviewed_by is null and official_stop_at is null)
      or (status in ('APPROVED', 'CORRECTED') and reviewed_at is not null and reviewed_by is not null and official_stop_at is not null)
      or (status in ('REJECTED', 'SUPERSEDED') and reviewed_at is not null and reviewed_by is not null and official_stop_at is null)
    )
);

create unique index if not exists workday_stop_proposal_worker_client_action_uidx
  on public.workday_stop_proposal (org_id, worker_id, client_action_id);

create unique index if not exists workday_stop_proposal_one_pending_uidx
  on public.workday_stop_proposal (org_id, workday_id)
  where status = 'PENDING';

create index if not exists workday_stop_proposal_review_queue_idx
  on public.workday_stop_proposal (org_id, status, submitted_at asc, proposal_id asc);

create index if not exists workday_stop_proposal_worker_history_idx
  on public.workday_stop_proposal (org_id, worker_id, submitted_at desc, proposal_id desc);

create table if not exists public.workday_stop_proposal_audit (
  audit_id varchar(160) not null,
  org_id varchar(64) not null,
  proposal_id varchar(96) not null,
  action varchar(20) not null,
  from_status varchar(20),
  to_status varchar(20) not null,
  actor_uid varchar(128) not null,
  note text,
  proposed_stop_at timestamptz,
  official_stop_at timestamptz,
  client_action_id varchar(128),
  occurred_at timestamptz not null default now(),
  primary key (org_id, audit_id),
  constraint workday_stop_proposal_audit_proposal_fk
    foreign key (org_id, proposal_id) references public.workday_stop_proposal(org_id, proposal_id),
  constraint workday_stop_proposal_audit_action_check
    check (action in ('SUBMITTED', 'APPROVED', 'CORRECTED', 'REJECTED', 'SUPERSEDED')),
  constraint workday_stop_proposal_audit_status_check
    check (to_status in ('PENDING', 'APPROVED', 'CORRECTED', 'REJECTED', 'SUPERSEDED'))
);

create unique index if not exists workday_stop_proposal_audit_client_action_uidx
  on public.workday_stop_proposal_audit (org_id, proposal_id, client_action_id)
  where client_action_id is not null;

create index if not exists workday_stop_proposal_audit_history_idx
  on public.workday_stop_proposal_audit (org_id, proposal_id, occurred_at asc, audit_id asc);

-- Minimal runtime access for the existing App Hosting database principal.
-- No schema-level or other DDL privilege is granted by this migration.
grant usage on schema public to portal_app;
grant select on table public.workday_time_permission to portal_app;
grant select, insert, update on table public.workday_stop_proposal to portal_app;
grant select, insert on table public.workday_stop_proposal_audit to portal_app;

commit;

-- Read-only preflight before any future test/preview migration:
-- select tgname, tgenabled, pg_get_triggerdef(oid)
--   from pg_trigger where tgrelid = 'public.workday'::regclass and not tgisinternal;
-- select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'workday';
