alter table if exists public.organizations
  add column if not exists owner_uid varchar(128),
  add column if not exists owner_worker_id varchar(128);

alter table if exists public.organizations
  alter column owner_uid type varchar(128),
  alter column owner_worker_id type varchar(128);

-- The organization founder is authoritative through organizations.owner_worker_id.
update public.worker w
   set role = 'OWNER',
       updated_at = now()
  from public.organizations o
 where o.org_id = w.org_id
   and nullif(o.owner_worker_id, '') is not null
   and o.owner_worker_id = w.worker_id
   and w.role is distinct from 'OWNER';

update public.organization_member m
   set role = 'OWNER'
  from public.organizations o
 where o.org_id = m.org_id
   and nullif(o.owner_worker_id, '') is not null
   and o.owner_worker_id = m.worker_id
   and m.role is distinct from 'OWNER';

-- Keep old data working while canonicalizing historical aliases.
update public.worker
   set role = case
     when upper(coalesce(role, '')) in ('ADMINISTRATOR', 'SUPERADMIN') then 'ADMIN'
     when upper(coalesce(role, '')) = 'KIEROWNIK' then 'MANAGER'
     when upper(coalesce(role, '')) in ('KOORDYNATOR', 'MEMBER') then 'COORDINATOR'
     when upper(coalesce(role, '')) in ('PRACOWNIK', 'INTERN', 'STAZYSTA', 'STAŻYSTA') then 'WORKER'
     else role
   end,
       updated_at = now()
 where upper(coalesce(role, '')) in (
   'ADMINISTRATOR', 'SUPERADMIN', 'KIEROWNIK', 'KOORDYNATOR', 'MEMBER',
   'PRACOWNIK', 'INTERN', 'STAZYSTA', 'STAŻYSTA'
 );

update public.organization_member
   set role = case
     when upper(coalesce(role, '')) in ('ADMINISTRATOR', 'SUPERADMIN') then 'ADMIN'
     when upper(coalesce(role, '')) = 'KIEROWNIK' then 'MANAGER'
     when upper(coalesce(role, '')) in ('KOORDYNATOR', 'MEMBER') then 'COORDINATOR'
     when upper(coalesce(role, '')) in ('PRACOWNIK', 'INTERN', 'STAZYSTA', 'STAŻYSTA') then 'WORKER'
     else role
   end
 where upper(coalesce(role, '')) in (
   'ADMINISTRATOR', 'SUPERADMIN', 'KIEROWNIK', 'KOORDYNATOR', 'MEMBER',
   'PRACOWNIK', 'INTERN', 'STAZYSTA', 'STAŻYSTA'
 );

-- Split legacy combined role/type values into the new informational worker types.
update public.worker
   set worker_type = case
     when upper(coalesce(worker_type, '')) in ('ADMIN', 'ADMINISTRATOR', 'OWNER', 'SUPERADMIN')
       then 'Administrator'
     when lower(coalesce(worker_type, '')) in ('koordynator', 'coordinator', 'manager', 'kierownik')
       then 'Pracownik Biurowy'
     when lower(coalesce(worker_type, '')) in ('zespół mobilny', 'zespol mobilny')
       then 'Zespół Mobilny'
     else worker_type
   end,
   updated_at = now()
 where upper(coalesce(worker_type, '')) in ('ADMIN', 'ADMINISTRATOR', 'OWNER', 'SUPERADMIN')
    or lower(coalesce(worker_type, '')) in (
      'koordynator',
      'coordinator',
      'manager',
      'kierownik',
      'zespół mobilny',
      'zespol mobilny'
    );
