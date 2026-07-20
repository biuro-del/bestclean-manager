create table if not exists public.platform_email_mfa_challenge (
  challenge_id varchar(36) primary key,
  admin_uid varchar(128) not null references public.platform_admin(uid) on delete cascade,
  email varchar(160) not null,
  code_hash varchar(64) not null,
  expires_at timestamptz not null,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  delivered_at timestamptz,
  consumed_at timestamptz,
  delivery_error varchar(500),
  ip_address varchar(128),
  user_agent varchar(500),
  created_at timestamptz not null default now(),
  constraint platform_email_mfa_attempt_count_check check (attempt_count >= 0),
  constraint platform_email_mfa_max_attempts_check check (max_attempts between 1 and 10)
);

create index if not exists platform_email_mfa_challenge_admin_created_idx
  on public.platform_email_mfa_challenge (admin_uid, created_at desc);

create table if not exists public.platform_email_mfa_session (
  session_id varchar(36) primary key,
  token_hash varchar(64) not null unique,
  admin_uid varchar(128) not null references public.platform_admin(uid) on delete cascade,
  email varchar(160) not null,
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  ip_address varchar(128),
  user_agent varchar(500),
  created_at timestamptz not null default now()
);

create index if not exists platform_email_mfa_session_admin_expires_idx
  on public.platform_email_mfa_session (admin_uid, expires_at desc);

create index if not exists platform_email_mfa_session_active_idx
  on public.platform_email_mfa_session (admin_uid, expires_at desc)
  where revoked_at is null;
