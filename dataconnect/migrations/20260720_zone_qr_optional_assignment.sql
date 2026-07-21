begin;

alter table if exists public.zone
  alter column client_id drop not null;

commit;
