-- Read-only production preflight for facility-manager-owned objects.
-- This query never changes schema or data.

with required_relations(relation_name) as (
  values
    ('organizations'),
    ('organization_member'),
    ('worker'),
    ('facility_manager_object'),
    ('facility_manager_object_audit')
)
select
  required_relations.relation_name,
  exists (
    select 1
      from information_schema.tables
     where table_schema = 'public'
       and table_name = required_relations.relation_name
  ) as exists_in_public
from required_relations
order by required_relations.relation_name;

select
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('organizations', 'organization_member', 'worker', 'facility_manager_object', 'facility_manager_object_audit')
order by table_name, ordinal_position;

select
  conrelid::regclass::text as relation_name,
  conname as constraint_name,
  pg_get_constraintdef(oid) as definition
from pg_constraint
join pg_class relation on relation.oid = conrelid
where connamespace = 'public'::regnamespace
  and relation.relname in (
    'organizations',
    'organization_member',
    'worker',
    'facility_manager_object',
    'facility_manager_object_audit'
  )
order by relation_name, constraint_name;

select
  indexrelid::regclass::text as index_name,
  indrelid::regclass::text as relation_name,
  pg_get_indexdef(indexrelid) as definition
from pg_index
join pg_class relation on relation.oid = indrelid
where relation.relname in ('facility_manager_object', 'facility_manager_object_audit')
order by relation_name, index_name;
