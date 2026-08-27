-- READ-ONLY base preflight. Run before the registry migration, against only an
-- explicitly approved database. It cannot create users, organizations or tables.

BEGIN TRANSACTION READ ONLY;

SET LOCAL statement_timeout = '30s';

SELECT current_database() AS database_name,
       current_user AS database_user,
       current_setting('server_version') AS postgres_version,
       to_regclass('public.facility_manager_google_identity') AS existing_google_identity_registry;

DO $$
DECLARE
  missing_tables text[];
  missing_columns text[];
  unique_requirement record;
BEGIN
  SELECT array_agg(required.table_name ORDER BY required.table_name)
    INTO missing_tables
    FROM (VALUES ('audit_log'), ('organization_member'), ('organizations'), ('worker'))
      AS required(table_name)
   WHERE to_regclass('public.' || required.table_name) IS NULL;
  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'FACILITY_MANAGER_BASE_PREFLIGHT_TABLE_MISSING: %', array_to_string(missing_tables, ', ');
  END IF;

  SELECT array_agg(required.label ORDER BY required.label)
    INTO missing_columns
    FROM (
      VALUES
        ('organizations', 'org_id', 'organizations.org_id'),
        ('organizations', 'name', 'organizations.name'),
        ('organizations', 'status', 'organizations.status'),
        ('organizations', 'created_at', 'organizations.created_at'),
        ('organizations', 'owner_uid', 'organizations.owner_uid'),
        ('organizations', 'owner_worker_id', 'organizations.owner_worker_id'),
        ('organizations', 'country_code', 'organizations.country_code'),
        ('organizations', 'locale', 'organizations.locale'),
        ('organizations', 'timezone', 'organizations.timezone'),
        ('organizations', 'currency_code', 'organizations.currency_code'),
        ('organizations', 'data_region', 'organizations.data_region'),
        ('organizations', 'onboarding_status', 'organizations.onboarding_status'),
        ('organizations', 'registration_source', 'organizations.registration_source'),
        ('organizations', 'organization_kind', 'organizations.organization_kind'),
        ('organizations', 'created_by_uid', 'organizations.created_by_uid'),
        ('organizations', 'updated_by_uid', 'organizations.updated_by_uid'),
        ('organizations', 'updated_at', 'organizations.updated_at'),
        ('worker', 'org_id', 'worker.org_id'),
        ('worker', 'login', 'worker.login'),
        ('worker', 'worker_id', 'worker.worker_id'),
        ('worker', 'worker_id_normalized', 'worker.worker_id_normalized'),
        ('worker', 'full_name', 'worker.full_name'),
        ('worker', 'first_name', 'worker.first_name'),
        ('worker', 'last_name', 'worker.last_name'),
        ('worker', 'login_normalized', 'worker.login_normalized'),
        ('worker', 'email_normalized', 'worker.email_normalized'),
        ('worker', 'phone_normalized', 'worker.phone_normalized'),
        ('worker', 'login_email', 'worker.login_email'),
        ('worker', 'auth_uid', 'worker.auth_uid'),
        ('worker', 'role', 'worker.role'),
        ('worker', 'role_locked', 'worker.role_locked'),
        ('worker', 'role_locked_reason', 'worker.role_locked_reason'),
        ('worker', 'role_assigned_at', 'worker.role_assigned_at'),
        ('worker', 'role_locked_at', 'worker.role_locked_at'),
        ('worker', 'active', 'worker.active'),
        ('worker', 'email', 'worker.email'),
        ('worker', 'phone', 'worker.phone'),
        ('worker', 'worker_type', 'worker.worker_type'),
        ('worker', 'status', 'worker.status'),
        ('worker', 'employment_status', 'worker.employment_status'),
        ('worker', 'position', 'worker.position'),
        ('worker', 'locale', 'worker.locale'),
        ('worker', 'timezone', 'worker.timezone'),
        ('worker', 'invited_at', 'worker.invited_at'),
        ('worker', 'activated_at', 'worker.activated_at'),
        ('worker', 'created_by_uid', 'worker.created_by_uid'),
        ('worker', 'updated_by_uid', 'worker.updated_by_uid'),
        ('worker', 'created_at', 'worker.created_at'),
        ('worker', 'updated_at', 'worker.updated_at'),
        ('organization_member', 'org_id', 'organization_member.org_id'),
        ('organization_member', 'uid', 'organization_member.uid'),
        ('organization_member', 'role', 'organization_member.role'),
        ('organization_member', 'worker_id', 'organization_member.worker_id'),
        ('organization_member', 'status', 'organization_member.status'),
        ('organization_member', 'consumes_seat', 'organization_member.consumes_seat'),
        ('organization_member', 'invited_at', 'organization_member.invited_at'),
        ('organization_member', 'joined_at', 'organization_member.joined_at'),
        ('organization_member', 'created_by_uid', 'organization_member.created_by_uid'),
        ('organization_member', 'updated_at', 'organization_member.updated_at'),
        ('organization_member', 'created_at', 'organization_member.created_at'),
        ('audit_log', 'audit_id', 'audit_log.audit_id'),
        ('audit_log', 'org_id', 'audit_log.org_id'),
        ('audit_log', 'actor_uid', 'audit_log.actor_uid'),
        ('audit_log', 'actor_worker_id', 'audit_log.actor_worker_id'),
        ('audit_log', 'entity_type', 'audit_log.entity_type'),
        ('audit_log', 'entity_id', 'audit_log.entity_id'),
        ('audit_log', 'action', 'audit_log.action'),
        ('audit_log', 'ip_hash', 'audit_log.ip_hash'),
        ('audit_log', 'user_agent', 'audit_log.user_agent'),
        ('audit_log', 'metadata', 'audit_log.metadata'),
        ('audit_log', 'occurred_at', 'audit_log.occurred_at')
    ) AS required(table_name, column_name, label)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns column_info
      WHERE column_info.table_schema = 'public'
        AND column_info.table_name = required.table_name
        AND column_info.column_name = required.column_name
   );
  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'FACILITY_MANAGER_BASE_PREFLIGHT_SCHEMA_MISSING: %', array_to_string(missing_columns, ', ');
  END IF;

  FOR unique_requirement IN
    SELECT * FROM (
      VALUES
        ('organizations', ARRAY['org_id']::text[], 'FACILITY_MANAGER_BASE_PREFLIGHT_ORG_ID_UNIQUE_MISSING'),
        ('organization_member', ARRAY['org_id', 'uid']::text[], 'FACILITY_MANAGER_BASE_PREFLIGHT_MEMBER_ORG_UID_UNIQUE_MISSING'),
        ('worker', ARRAY['org_id', 'login']::text[], 'FACILITY_MANAGER_BASE_PREFLIGHT_WORKER_ORG_LOGIN_UNIQUE_MISSING'),
        ('worker', ARRAY['org_id', 'login_normalized']::text[], 'FACILITY_MANAGER_BASE_PREFLIGHT_WORKER_LOGIN_NORMALIZED_UNIQUE_MISSING'),
        ('worker', ARRAY['org_id', 'worker_id_normalized']::text[], 'FACILITY_MANAGER_BASE_PREFLIGHT_WORKER_ID_NORMALIZED_UNIQUE_MISSING'),
        ('audit_log', ARRAY['audit_id']::text[], 'FACILITY_MANAGER_BASE_PREFLIGHT_AUDIT_ID_UNIQUE_MISSING')
    ) AS requirement(table_name, column_names, error_code)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_index index_info
       WHERE index_info.indrelid = ('public.' || unique_requirement.table_name)::regclass
         AND index_info.indisvalid
         AND index_info.indisready
         AND index_info.indisunique
         AND index_info.indpred IS NULL
         AND (
           SELECT array_agg(attribute_info.attname::text ORDER BY index_key.ordinality)
             FROM unnest(index_info.indkey) WITH ORDINALITY AS index_key(attnum, ordinality)
             JOIN pg_attribute attribute_info
               ON attribute_info.attrelid = index_info.indrelid
              AND attribute_info.attnum = index_key.attnum
         ) = unique_requirement.column_names
    ) THEN
      RAISE EXCEPTION '%', unique_requirement.error_code;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger trigger_info
     WHERE trigger_info.tgrelid = 'public.worker'::regclass
       AND trigger_info.tgname = 'worker_identity_normalized_biu'
       AND NOT trigger_info.tgisinternal
  ) THEN
    RAISE EXCEPTION 'FACILITY_MANAGER_BASE_PREFLIGHT_WORKER_NORMALIZATION_TRIGGER_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.worker
     WHERE login_normalized IS DISTINCT FROM lower(btrim(login))
        OR worker_id_normalized IS DISTINCT FROM nullif(lower(btrim(worker_id)), '')
  ) THEN
    RAISE EXCEPTION 'FACILITY_MANAGER_BASE_PREFLIGHT_WORKER_NORMALIZATION_MISMATCH';
  END IF;
END
$$;

SELECT relation_info.relname AS table_name,
       constraint_info.conname AS constraint_name,
       pg_get_constraintdef(constraint_info.oid) AS constraint_definition
  FROM pg_constraint constraint_info
  JOIN pg_class relation_info ON relation_info.oid = constraint_info.conrelid
  JOIN pg_namespace namespace_info ON namespace_info.oid = relation_info.relnamespace
 WHERE namespace_info.nspname = 'public'
   AND relation_info.relname IN ('organizations', 'worker', 'organization_member', 'audit_log')
   AND constraint_info.contype = 'c'
 ORDER BY relation_info.relname, constraint_info.conname;

SELECT trigger_info.tgname AS trigger_name,
       pg_get_triggerdef(trigger_info.oid, true) AS trigger_definition
  FROM pg_trigger trigger_info
 WHERE trigger_info.tgrelid = 'public.worker'::regclass
   AND trigger_info.tgname = 'worker_identity_normalized_biu'
   AND NOT trigger_info.tgisinternal;

ROLLBACK;
