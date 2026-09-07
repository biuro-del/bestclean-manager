'use strict'

const { WorkforceScheduleError, text } = require('./workforce-schedule-policy')

const REQUIRED_RELATIONS = Object.freeze([
  'public.workforce_schedule_settings',
  'public.workforce_schedule_location',
  'public.workforce_schedule_person',
  'public.workforce_schedule_shift',
  'public.workforce_schedule_shift_revision',
  'public.workforce_schedule_shift_revision_assignee',
  'public.workforce_schedule_shift_instruction',
  'public.workforce_schedule_command',
  'public.workforce_schedule_publication',
  'public.workforce_schedule_publication_item',
  'public.workforce_schedule_audit',
])

const SOURCE_RELATIONS = Object.freeze([
  'public.organizations',
  'public.organization_member',
  'public.organization_subscription',
  'public.worker',
  'public.client',
])

// Kept as an exported compatibility constant: runtime roles intentionally have
// no direct SELECT on any shared source relation.
const SOURCE_SELECT_RELATIONS = Object.freeze([])

const SOURCE_FORBIDDEN_PRIVILEGES = Object.freeze({
  'public.organizations': ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'],
  'public.organization_member': ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'],
  'public.organization_subscription': ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'],
  'public.worker': ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'],
  'public.client': ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'],
})

const SESSION_FUNCTIONS = Object.freeze([
  'public.workforce_schedule_authorize_session(text,text)',
])

const RUNTIME_FUNCTIONS = Object.freeze([
  'public.workforce_schedule_actor_is_active(text)',
  'public.workforce_schedule_read_active_workers(text)',
  'public.workforce_schedule_read_active_objects(text)',
  'public.workforce_schedule_lock_worker_sources(text,text[])',
  'public.workforce_schedule_lock_object_sources(text,text[])',
])

const REQUIRED_FUNCTIONS = Object.freeze([...SESSION_FUNCTIONS, ...RUNTIME_FUNCTIONS])

// PostgreSQL stores SQL function bodies in pg_proc.prosrc. These fingerprints
// pin the exact reviewed bodies from the additive migration. Metadata and ACL
// checks below remain separate, so a matching body alone is never sufficient.
const REQUIRED_FUNCTION_BODY_HASHES = Object.freeze({
  'public.workforce_schedule_authorize_session(text,text)': '3bba22c35e0482a74db7247fe6e03600',
  'public.workforce_schedule_actor_is_active(text)': '7f09b196e5d582cc5f16acf95f027ceb',
  'public.workforce_schedule_read_active_workers(text)': '77cfb9e6db18ec091c45460373018376',
  'public.workforce_schedule_read_active_objects(text)': 'f951f3d9209c0b51145c22ae67fbcc05',
  'public.workforce_schedule_lock_worker_sources(text,text[])': '3c8cc5501edefbb451b8efc5993af6f7',
  'public.workforce_schedule_lock_object_sources(text,text[])': '95cbccda4e8620a3c9f0161ebd39fca7',
})

const REQUIRED_FUNCTION_RESULTS = Object.freeze({
  'public.workforce_schedule_authorize_session(text,text)': 'TABLE(role text, status text, worker_id text, organization_kind text, organization_status text, onboarding_status text, organization_deleted_at text, plan_code text, subscription_status text, trial_ends_at text, current_period_ends_at text, active_worker_id text)',
  'public.workforce_schedule_actor_is_active(text)': 'boolean',
  'public.workforce_schedule_read_active_workers(text)': 'TABLE(source_worker_id_normalized text, source_worker_login text, source_auth_uid text, display_name text, role_snapshot text)',
  'public.workforce_schedule_read_active_objects(text)': 'TABLE(source_object_id text, display_name text)',
  'public.workforce_schedule_lock_worker_sources(text,text[])': 'TABLE(source_worker_id_normalized text, active boolean, status text)',
  'public.workforce_schedule_lock_object_sources(text,text[])': 'TABLE(source_object_id text, active boolean, status text)',
})

const WORKFORCE_SCHEDULE_DB_ROLE = 'workforce_schedule_app'
const WORKFORCE_SCHEDULE_OWNER_ROLE = 'workforce_schedule_owner'
const WORKFORCE_SCHEDULE_SESSION_ROLE = 'workforce_schedule_session'

const WORKFORCE_SCHEDULE_SCHEMA_MARKER = 'cleanzi.workforce_schedule.core.v1'

const REQUIRED_COLUMNS = Object.freeze({
  'public.workforce_schedule_settings': ['org_id', 'time_zone', 'weekly_limit_minutes', 'version'],
  'public.workforce_schedule_location': ['org_id', 'location_id', 'source_object_id', 'name', 'status', 'version'],
  'public.workforce_schedule_person': ['org_id', 'person_id', 'source_worker_login', 'source_worker_id_normalized', 'source_auth_uid', 'display_name', 'status', 'version'],
  'public.workforce_schedule_shift': ['org_id', 'shift_id', 'lifecycle_status', 'current_revision_no', 'published_revision_no', 'version'],
  'public.workforce_schedule_shift_revision': ['org_id', 'shift_id', 'revision_no', 'business_date', 'starts_at', 'ends_at', 'time_zone', 'location_id', 'is_deleted'],
  'public.workforce_schedule_shift_revision_assignee': ['org_id', 'shift_id', 'revision_no', 'person_id'],
  'public.workforce_schedule_shift_instruction': ['org_id', 'shift_id', 'revision_no', 'position', 'instruction'],
  'public.workforce_schedule_command': ['org_id', 'actor_uid', 'idempotency_key', 'command_type', 'request_hash', 'effects_json', 'status', 'response_json'],
  'public.workforce_schedule_publication': ['org_id', 'publication_id', 'period_start', 'period_end', 'time_zone', 'effects_json', 'warning_fingerprint', 'warnings_json'],
  'public.workforce_schedule_publication_item': ['org_id', 'publication_id', 'shift_id', 'revision_no'],
  'public.workforce_schedule_audit': ['org_id', 'audit_id', 'entity_type', 'entity_id', 'action', 'actor_uid', 'before_json', 'after_json'],
})

const REQUIRED_PRIVILEGES = Object.freeze({
  'public.workforce_schedule_settings': ['SELECT', 'INSERT', 'UPDATE'],
  'public.workforce_schedule_location': ['SELECT', 'INSERT', 'UPDATE'],
  'public.workforce_schedule_person': ['SELECT', 'INSERT', 'UPDATE'],
  'public.workforce_schedule_shift': ['SELECT', 'INSERT', 'UPDATE'],
  'public.workforce_schedule_command': ['SELECT', 'INSERT', 'UPDATE'],
  'public.workforce_schedule_shift_revision': ['SELECT', 'INSERT'],
  'public.workforce_schedule_shift_revision_assignee': ['SELECT', 'INSERT'],
  'public.workforce_schedule_shift_instruction': ['SELECT', 'INSERT'],
  'public.workforce_schedule_publication': ['SELECT', 'INSERT'],
  'public.workforce_schedule_publication_item': ['INSERT'],
  'public.workforce_schedule_audit': ['INSERT'],
})

const FORBIDDEN_PRIVILEGES = Object.freeze({
  'public.workforce_schedule_settings': ['DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'],
  'public.workforce_schedule_location': ['DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'],
  'public.workforce_schedule_person': ['DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'],
  'public.workforce_schedule_shift': ['DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'],
  'public.workforce_schedule_command': ['DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'],
  'public.workforce_schedule_shift_revision': ['UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'],
  'public.workforce_schedule_shift_revision_assignee': ['UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'],
  'public.workforce_schedule_shift_instruction': ['UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'],
  'public.workforce_schedule_publication': ['UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'],
  'public.workforce_schedule_publication_item': ['SELECT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'],
  'public.workforce_schedule_audit': ['SELECT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'],
})

function error(statusCode, code, message, details) {
  return new WorkforceScheduleError(statusCode, code, message, details)
}

function iso(value) {
  if (!value) return ''
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : ''
}

function ymd(value) {
  if (!value) return ''
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return ''
    const year = String(value.getFullYear()).padStart(4, '0')
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  return text(value).slice(0, 10)
}

function hhmm(value) {
  return text(value).slice(0, 5)
}

function asJson(value, fallback) {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function initialsFromName(value) {
  const parts = text(value).split(/\s+/).filter(Boolean)
  return parts.slice(0, 2).map((part) => part[0] || '').join('').toLocaleUpperCase('pl-PL') || '?'
}

function locationColors(value) {
  const palette = [
    ['#2563eb', '#dbeafe'],
    ['#0f766e', '#ccfbf1'],
    ['#7c3aed', '#ede9fe'],
    ['#b45309', '#fef3c7'],
    ['#be123c', '#ffe4e6'],
  ]
  let hash = 0
  for (const character of text(value)) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0
  const [color, softColor] = palette[hash % palette.length]
  return { color, softColor }
}

function mapPerson(row = {}) {
  return {
    id: text(row.person_id),
    personId: text(row.person_id),
    // Preserve the response key without exposing an authentication identifier.
    sourceWorkerLogin: '',
    sourceWorkerId: text(row.source_worker_id_normalized),
    displayName: text(row.display_name),
    initials: text(row.initials),
    role: text(row.role_snapshot),
    status: text(row.status),
    version: Number(row.version ?? 0),
  }
}

function mapLocation(row = {}) {
  return {
    id: text(row.location_id),
    locationId: text(row.location_id),
    sourceObjectId: text(row.source_object_id),
    name: text(row.name),
    shortName: text(row.short_name),
    color: text(row.color),
    softColor: text(row.soft_color),
    status: text(row.status),
    version: Number(row.version ?? 0),
  }
}

function nonNegativeCount(value) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0
}

function uniqueIdentifiers(values) {
  return [...new Set(values.map(text).filter(Boolean))].sort()
}

function mapShift(row = {}) {
  return {
    id: text(row.shift_id),
    shiftId: text(row.shift_id),
    title: text(row.title),
    date: ymd(row.business_date),
    startTime: hhmm(row.local_start_time),
    endTime: hhmm(row.local_end_time),
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    timeZone: text(row.time_zone),
    breakMinutes: Number(row.break_minutes ?? 0),
    requiredHeadcount: Number(row.required_headcount ?? 0),
    locationId: text(row.location_id),
    notes: text(row.notes),
    personIds: asJson(row.person_ids, []).map(text).filter(Boolean),
    instructions: asJson(row.instructions, []).map(text).filter(Boolean),
    revision: Number(row.current_revision_no ?? row.revision_no ?? 0),
    publishedRevision: row.published_revision_no == null ? null : Number(row.published_revision_no),
    publishedDate: ymd(row.published_business_date),
    version: Number(row.version ?? 0),
    status: text(row.lifecycle_status),
    pendingDeletion: row.is_deleted === true,
  }
}

function createWorkforceScheduleRepository(client) {
  if (!client || typeof client.query !== 'function') {
    throw new TypeError('Workforce schedule repository requires a PostgreSQL client.')
  }

  async function setTenantContext(orgId) {
    await client.query(`select set_config('cleanzi.org_id', $1::text, true)`, [orgId])
  }

  async function setActorContext(actorUid) {
    await client.query(`select set_config('cleanzi.actor_uid', $1::text, true)`, [actorUid])
  }

  async function lockOrganization(orgId) {
    await client.query(
      `select pg_advisory_xact_lock(hashtextextended('workforce-schedule-write:' || $1::text, 0))`,
      [orgId],
    )
  }

  async function schemaReady() {
    const boundaryResult = await client.query(
      `select session_user = $1::text as session_role,
              current_user = $2::text as runtime_role,
              has_schema_privilege(current_user, 'public', 'USAGE') as schema_usage,
              not has_schema_privilege(current_user, 'public', 'CREATE') as no_schema_create`,
      [WORKFORCE_SCHEDULE_SESSION_ROLE, WORKFORCE_SCHEDULE_DB_ROLE],
    )
    const boundary = boundaryResult.rows[0]
    const boundaryMissing = []
    if (!boundary || boundary.session_role !== true) boundaryMissing.push('runtime:SESSION_ROLE')
    if (!boundary || boundary.runtime_role !== true) boundaryMissing.push(`runtime:${WORKFORCE_SCHEDULE_DB_ROLE}`)
    if (!boundary || boundary.schema_usage !== true) boundaryMissing.push('runtime:SCHEMA_USAGE')
    if (!boundary || boundary.no_schema_create !== true) boundaryMissing.push('runtime:SCHEMA_CREATE')
    if (boundaryMissing.length) return { ready: false, missing: boundaryMissing }

    const relationResult = await client.query(
      `select required.relation_name,
              target.oid is not null as relation_ready,
              coalesce(target.relowner = (select oid from pg_roles where rolname = $2::text), false) as expected_owner,
              coalesce(target.relrowsecurity, false) as rls_enabled,
              coalesce(target.relforcerowsecurity, false) as rls_forced,
              not exists (
                select 1
                  from pg_trigger trigger_row
                 where trigger_row.tgrelid = target.oid
                   and not trigger_row.tgisinternal
              ) as no_user_triggers,
              (
                select count(*) = 1
                  from pg_policies policy_count
                 where policy_count.schemaname = 'public'
                   and policy_count.tablename = split_part(required.relation_name, '.', 2)
              ) as policy_count_ready,
              exists (
                select 1
                  from pg_policies policy
                 where policy.schemaname = 'public'
                   and policy.tablename = split_part(required.relation_name, '.', 2)
                   and policy.policyname = split_part(required.relation_name, '.', 2) || '_tenant_policy'
                   and policy.permissive = 'PERMISSIVE'
                   and policy.cmd = 'ALL'
                   and policy.roles = array[$3::name]
                    and replace(replace(replace(
                      regexp_replace(lower(policy.qual), '[[:space:]()]', '', 'g'),
                      '::text', ''), 'public.', ''), 'pg_catalog.', '') = format(
                        'org_id=nullifcurrent_setting''cleanzi.org_id'',true,''''andworkforce_schedule_actor_is_activeorg_id'
                      )
                    and replace(replace(replace(
                      regexp_replace(lower(policy.with_check), '[[:space:]()]', '', 'g'),
                      '::text', ''), 'public.', ''), 'pg_catalog.', '') = format(
                        'org_id=nullifcurrent_setting''cleanzi.org_id'',true,''''andworkforce_schedule_actor_is_activeorg_id'
                      )
              ) as policy_ready
         from unnest($1::text[]) as required(relation_name)
         left join pg_class target on target.oid = to_regclass(required.relation_name)`,
      [REQUIRED_RELATIONS, WORKFORCE_SCHEDULE_OWNER_ROLE, WORKFORCE_SCHEDULE_DB_ROLE],
    )
    const missing = []
    for (const row of relationResult.rows) {
      const relation = text(row.relation_name)
      if (row.relation_ready !== true) missing.push(relation)
      else {
        if (row.expected_owner !== true) missing.push(`${relation}:OWNER`)
        if (row.rls_enabled !== true || row.rls_forced !== true) missing.push(`${relation}:RLS`)
        if (row.no_user_triggers !== true) missing.push(`${relation}:TRIGGER`)
        if (row.policy_count_ready !== true || row.policy_ready !== true) missing.push(`${relation}:POLICY`)
      }
    }

    const columnRequirements = Object.entries(REQUIRED_COLUMNS).flatMap(([relationName, columns]) => (
      columns.map((columnName) => ({ relation_name: relationName, column_name: columnName }))
    ))
    const columnResult = await client.query(
      `select required.relation_name, required.column_name,
              exists (
                select 1 from pg_attribute attribute
                 where attribute.attrelid = to_regclass(required.relation_name)
                   and attribute.attname = required.column_name
                   and attribute.attnum > 0 and not attribute.attisdropped
              ) as ready
         from jsonb_to_recordset($1::jsonb)
              as required(relation_name text, column_name text)`,
      [JSON.stringify(columnRequirements)],
    )
    for (const row of columnResult.rows) {
      if (row.ready !== true) missing.push(`${text(row.relation_name)}:${text(row.column_name)}`)
    }

    const privilegeRequirements = Object.entries(REQUIRED_PRIVILEGES).flatMap(([relationName, privileges]) => (
      privileges.map((privilege) => ({ relation_name: relationName, privilege_name: privilege }))
    ))
    const privilegeResult = await client.query(
      `select required.relation_name, required.privilege_name,
              has_table_privilege(current_user, required.relation_name, required.privilege_name) as ready
         from jsonb_to_recordset($1::jsonb)
              as required(relation_name text, privilege_name text)`,
      [JSON.stringify(privilegeRequirements)],
    )
    for (const row of privilegeResult.rows) {
      if (row.ready !== true) missing.push(`${text(row.relation_name)}:${text(row.privilege_name)}`)
    }

    const forbiddenRequirements = Object.entries(FORBIDDEN_PRIVILEGES).flatMap(([relationName, privileges]) => (
      privileges.map((privilege) => ({ relation_name: relationName, privilege_name: privilege }))
    ))
    const forbiddenResult = await client.query(
      `select required.relation_name, required.privilege_name,
              has_table_privilege(current_user, required.relation_name, required.privilege_name)
              or case
                   when required.privilege_name = any(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']::text[])
                     then has_any_column_privilege(current_user, required.relation_name, required.privilege_name)
                   else false
                 end as excessive
         from jsonb_to_recordset($1::jsonb)
              as required(relation_name text, privilege_name text)`,
      [JSON.stringify(forbiddenRequirements)],
    )
    for (const row of forbiddenResult.rows) {
      if (row.excessive === true) missing.push(`${text(row.relation_name)}:${text(row.privilege_name)}:EXCESS`)
    }

    const grantOptionResult = await client.query(
      `with recursive accessible_roles(role_oid) as (
         select oid from pg_roles where rolname = current_user
         union
         select membership.roleid
           from pg_auth_members membership
           join accessible_roles child on child.role_oid = membership.member
       ), allowed_runtime_acl as (
         select required.relation_name, required.privilege_name
           from jsonb_to_recordset($2::jsonb)
                as required(relation_name text, privilege_name text)
       ), relation_acl as (
         select namespace.nspname || '.' || relation.relname as relation_name,
                relation.relowner as relation_owner,
                privilege.grantee, privilege.privilege_type, privilege.is_grantable,
                false as is_column_acl
           from pg_class relation
           join pg_namespace namespace on namespace.oid = relation.relnamespace
           cross join lateral aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) privilege
          where namespace.nspname = 'public' and relation.relname = any($1::text[])
         union all
         select namespace.nspname || '.' || relation.relname as relation_name,
                relation.relowner as relation_owner,
                privilege.grantee, privilege.privilege_type, privilege.is_grantable,
                true as is_column_acl
           from pg_class relation
           join pg_namespace namespace on namespace.oid = relation.relnamespace
           join pg_attribute attribute on attribute.attrelid = relation.oid
            and attribute.attnum > 0 and not attribute.attisdropped
           cross join lateral aclexplode(attribute.attacl) privilege
          where namespace.nspname = 'public' and relation.relname = any($1::text[])
       )
       select exists (
         select 1 from relation_acl privilege
          where privilege.is_grantable
            and (privilege.grantee = 0 or privilege.grantee in (select role_oid from accessible_roles))
       ) as excessive,
       exists (
         select 1 from relation_acl privilege
          where not privilege.is_column_acl
            and (
              privilege.grantee not in (
                privilege.relation_owner,
                (select oid from pg_roles where rolname = current_user)
              )
              or (
                privilege.grantee = (select oid from pg_roles where rolname = current_user)
                and (
                  privilege.is_grantable
                  or not exists (
                    select 1 from allowed_runtime_acl allowed
                     where allowed.relation_name = privilege.relation_name
                       and allowed.privilege_name = privilege.privilege_type
                  )
                )
              )
            )
       ) as unexpected_table_acl,
       exists (
         select 1 from relation_acl privilege where privilege.is_column_acl
       ) as unexpected_column_acl,
       exists (
         select 1 from relation_acl privilege
          where privilege.grantee = 0
             or privilege.grantee = (select oid from pg_roles where rolname = session_user)
       ) as direct_session_acl`,
      [
        REQUIRED_RELATIONS.map((relation) => relation.split('.')[1]),
        JSON.stringify(privilegeRequirements),
      ],
    )
    if (grantOptionResult.rows[0]?.excessive === true) missing.push('runtime:GRANT_OPTION')
    if (grantOptionResult.rows[0]?.unexpected_table_acl === true) missing.push('runtime:TABLE_ACL')
    if (grantOptionResult.rows[0]?.unexpected_column_acl === true) missing.push('runtime:COLUMN_ACL')
    if (grantOptionResult.rows[0]?.direct_session_acl === true) missing.push('runtime:DIRECT_SESSION_ACL')

    const sourceResult = await client.query(
      `select required.relation_name,
              to_regclass(required.relation_name) is not null as relation_ready
         from unnest($1::text[]) as required(relation_name)`,
      [SOURCE_RELATIONS],
    )
    for (const row of sourceResult.rows) {
      if (row.relation_ready !== true) missing.push(`${text(row.relation_name)}:SOURCE`)
    }

    const sourceForbiddenRequirements = Object.entries(SOURCE_FORBIDDEN_PRIVILEGES)
      .flatMap(([relationName, privileges]) => (
        privileges.map((privilege) => ({ relation_name: relationName, privilege_name: privilege }))
      ))
    const sourceForbiddenResult = await client.query(
      `select required.relation_name, required.privilege_name,
              has_table_privilege(current_user, required.relation_name, required.privilege_name)
              or case
                   when required.privilege_name = any(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']::text[])
                     then has_any_column_privilege(current_user, required.relation_name, required.privilege_name)
                   else false
                 end as excessive
         from jsonb_to_recordset($1::jsonb)
              as required(relation_name text, privilege_name text)`,
      [JSON.stringify(sourceForbiddenRequirements)],
    )
    for (const row of sourceForbiddenResult.rows) {
      if (row.excessive === true) {
        missing.push(`${text(row.relation_name)}:${text(row.privilege_name)}:EXCESS`)
      }
    }

    const functionAllowlistResult = await client.query(
      `select count(*)::integer as function_count,
              coalesce(bool_and(
                replace(format(
                  '%I.%I(%s)',
                  namespace.nspname,
                  function_row.proname,
                  pg_catalog.oidvectortypes(function_row.proargtypes)
                ), ' ', '') = any($1::text[])
              ), false) as only_allowed
         from pg_proc function_row
         join pg_namespace namespace on namespace.oid = function_row.pronamespace
        where namespace.nspname = 'public'
          and function_row.proname like 'workforce\\_schedule\\_%' escape '\\'`,
      [REQUIRED_FUNCTIONS],
    )
    const functionAllowlist = functionAllowlistResult.rows[0]
    if (!functionAllowlist
        || Number(functionAllowlist.function_count) !== REQUIRED_FUNCTIONS.length
        || functionAllowlist.only_allowed !== true) {
      missing.push('runtime:FUNCTION_ALLOWLIST')
    }

    const functionResult = await client.query(
      `select required.function_signature,
              target.oid is not null as function_ready,
              coalesce(target.prosecdef, false) as security_definer,
              coalesce(target.proowner = (select oid from pg_roles where rolname = $2::text), false) as expected_owner,
               coalesce(target.proconfig = array['search_path=pg_catalog']::text[], false) as fixed_search_path,
               coalesce(target.prokind = 'f' and not target.proleakproof, false) as safe_function_kind,
               coalesce(target.prolang = (select oid from pg_language where lanname = 'sql'), false) as expected_language,
               coalesce(target.prosqlbody is null, false) as expected_body_storage,
               coalesce(pg_catalog.md5(target.prosrc) = required.body_hash, false) as expected_body,
               coalesce(pg_catalog.pg_get_function_result(target.oid) = required.result_signature, false) as expected_result,
               coalesce(case
                 when required.function_signature = any(array[
                   'public.workforce_schedule_authorize_session(text,text)',
                   'public.workforce_schedule_actor_is_active(text)',
                   'public.workforce_schedule_read_active_workers(text)',
                   'public.workforce_schedule_read_active_objects(text)'
                 ]::text[]) then target.provolatile = 's'
                 else target.provolatile = 'v'
               end, false) as expected_volatility,
              case when target.oid is null then false
                   when required.function_signature = any($3::text[])
                     then has_function_privilege(session_user, target.oid, 'EXECUTE')
                   else has_function_privilege(current_user, target.oid, 'EXECUTE')
              end as execute_ready,
              case when target.oid is null then true
                   when required.function_signature = any($3::text[])
                     then has_function_privilege(current_user, target.oid, 'EXECUTE')
                   else has_function_privilege(session_user, target.oid, 'EXECUTE')
              end as unexpected_execute,
              case when target.oid is null then false
                   else not pg_has_role(current_user, target.proowner, 'MEMBER')
                    and not pg_has_role(current_user, target.proowner, 'SET') end as no_owner_membership,
              case
                when target.oid is null then false
                when required.function_signature = 'public.workforce_schedule_authorize_session(text,text)'
                  then has_table_privilege(target.proowner, 'public.organizations', 'SELECT')
                   and has_table_privilege(target.proowner, 'public.organization_member', 'SELECT')
                   and has_table_privilege(target.proowner, 'public.organization_subscription', 'SELECT')
                   and has_table_privilege(target.proowner, 'public.worker', 'SELECT')
                when required.function_signature = 'public.workforce_schedule_actor_is_active(text)'
                  then has_table_privilege(target.proowner, 'public.organization_member', 'SELECT')
                   and has_table_privilege(target.proowner, 'public.worker', 'SELECT')
                when required.function_signature = 'public.workforce_schedule_read_active_workers(text)'
                  then has_table_privilege(target.proowner, 'public.worker', 'SELECT')
                when required.function_signature = 'public.workforce_schedule_read_active_objects(text)'
                  then has_table_privilege(target.proowner, 'public.client', 'SELECT')
                when required.function_signature like '%lock_worker_sources%'
                  then has_table_privilege(target.proowner, 'public.worker', 'SELECT')
                   and has_table_privilege(target.proowner, 'public.worker', 'UPDATE')
                else has_table_privilege(target.proowner, 'public.client', 'SELECT')
                   and has_table_privilege(target.proowner, 'public.client', 'UPDATE')
              end as owner_source_ready,
              case when target.oid is null then false else not exists (
                select 1
                  from aclexplode(coalesce(target.proacl, acldefault('f', target.proowner))) privilege
                 where privilege.grantee = 0 and privilege.privilege_type = 'EXECUTE'
              ) end as no_public_execute,
              case when target.oid is null then false else not exists (
                select 1
                  from aclexplode(
                    case
                      when target.proacl is null then acldefault('f', target.proowner)
                      when cardinality(target.proacl) > 0 then target.proacl
                      else null::aclitem[]
                    end
                  ) privilege
                 where privilege.grantee not in (
                         target.proowner,
                         case when required.function_signature = any($3::text[])
                           then (select oid from pg_roles where rolname = session_user)
                           else (select oid from pg_roles where rolname = current_user)
                         end
                       )
                    or (
                      privilege.grantee = case when required.function_signature = any($3::text[])
                        then (select oid from pg_roles where rolname = session_user)
                        else (select oid from pg_roles where rolname = current_user)
                      end
                      and (privilege.privilege_type <> 'EXECUTE' or privilege.is_grantable)
                    )
              ) end as exact_acl
         from unnest($1::text[], $4::text[], $5::text[])
              as required(function_signature, body_hash, result_signature)
         left join pg_proc target on target.oid = to_regprocedure(required.function_signature)`,
      [
        REQUIRED_FUNCTIONS,
        WORKFORCE_SCHEDULE_OWNER_ROLE,
        SESSION_FUNCTIONS,
        REQUIRED_FUNCTIONS.map((signature) => REQUIRED_FUNCTION_BODY_HASHES[signature]),
        REQUIRED_FUNCTIONS.map((signature) => REQUIRED_FUNCTION_RESULTS[signature]),
      ],
    )
    for (const row of functionResult.rows) {
      const signature = text(row.function_signature)
      if (row.function_ready !== true) missing.push(`${signature}:FUNCTION`)
      else {
        if (row.security_definer !== true) missing.push(`${signature}:SECURITY_DEFINER`)
        if (row.expected_owner !== true) missing.push(`${signature}:OWNER`)
        if (row.fixed_search_path !== true) missing.push(`${signature}:SEARCH_PATH`)
        if (row.safe_function_kind !== true) missing.push(`${signature}:FUNCTION_KIND`)
        if (row.expected_language !== true) missing.push(`${signature}:LANGUAGE`)
        if (row.expected_body_storage !== true) missing.push(`${signature}:SQL_BODY_STORAGE`)
        if (row.expected_body !== true) missing.push(`${signature}:DEFINITION`)
        if (row.expected_result !== true) missing.push(`${signature}:RESULT`)
        if (row.expected_volatility !== true) missing.push(`${signature}:VOLATILITY`)
        if (row.execute_ready !== true) missing.push(`${signature}:EXECUTE`)
        if (row.unexpected_execute !== false) missing.push(`${signature}:UNEXPECTED_EXECUTE`)
        if (row.no_owner_membership !== true) missing.push(`${signature}:OWNER_MEMBERSHIP`)
        if (row.owner_source_ready !== true) missing.push(`${signature}:OWNER_SOURCE_PRIVILEGE`)
        if (row.no_public_execute !== true) missing.push(`${signature}:PUBLIC_EXECUTE`)
        if (row.exact_acl !== true) missing.push(`${signature}:FUNCTION_ACL`)
      }
    }

    const securityResult = await client.query(
      `select session_user = $2::text as session_role,
              current_user = $3::text as runtime_role,
              session_role.oid is not null and session_role.rolcanlogin
                and not session_role.rolsuper and not session_role.rolbypassrls
                and not session_role.rolcreaterole and not session_role.rolcreatedb
                and not session_role.rolreplication as restricted_session_role,
              not role.rolcanlogin and not role.rolinherit
                and not role.rolsuper and not role.rolbypassrls and not role.rolcreaterole
                and not role.rolcreatedb and not role.rolreplication as restricted_role,
              exists (
                select 1
                  from pg_auth_members membership
                  join pg_roles session_role on session_role.oid = membership.member
                 where membership.roleid = role.oid
                   and session_role.rolname = session_user
                   and membership.set_option
                   and not membership.inherit_option
                   and not membership.admin_option
               ) as role_switch_ready,
              not exists (
                select 1
                  from pg_auth_members membership
                 where membership.roleid = role.oid
                   and membership.member = session_role.oid
                   and (
                     membership.admin_option
                     or membership.inherit_option
                     or not membership.set_option
                   )
               ) as role_switch_exact,
               (
                 select count(*) = 1
                    and bool_and(
                      membership.roleid = role.oid
                      and membership.set_option
                      and not membership.inherit_option
                      and not membership.admin_option
                    )
                   from pg_auth_members membership
                  where membership.member = session_role.oid
               ) as exact_session_role_graph,
               not exists (
                 with recursive set_reachable(role_oid) as (
                   select membership.roleid
                     from pg_auth_members membership
                    where membership.member = session_role.oid
                      and membership.set_option
                   union
                   select membership.roleid
                     from pg_auth_members membership
                     join set_reachable parent on parent.role_oid = membership.member
                    where membership.set_option
                 )
                 select 1
                   from set_reachable
                  where set_reachable.role_oid <> role.oid
               ) as exact_session_set_graph,
               not exists (
                 select 1
                   from pg_auth_members membership
                  where membership.member = role.oid
               ) as empty_runtime_role_graph,
               not exists (
                with recursive inherited(role_oid) as (
                  select membership.roleid
                    from pg_auth_members membership
                    join pg_roles session_role on session_role.oid = membership.member
                   where session_role.rolname = session_user and membership.inherit_option
                  union
                  select membership.roleid
                    from pg_auth_members membership
                    join inherited child on child.role_oid = membership.member
                   where membership.inherit_option
                )
                select 1 from inherited where inherited.role_oid = role.oid
              ) as no_inherited_runtime,
              not exists (
                with recursive inherited(role_oid) as (
                  select membership.roleid from pg_auth_members membership where membership.member = role.oid
                  union
                  select membership.roleid
                    from pg_auth_members membership
                    join inherited child on child.role_oid = membership.member
                )
                select 1
                  from inherited
                  join pg_roles inherited_role on inherited_role.oid = inherited.role_oid
                 where inherited_role.rolsuper or inherited_role.rolbypassrls
                    or inherited_role.rolcreaterole or inherited_role.rolcreatedb
                    or inherited_role.rolreplication or left(inherited_role.rolname, 3) = 'pg_'
               ) as no_privileged_membership,
              not exists (
                with recursive accessible(role_oid) as (
                  select membership.roleid
                    from pg_auth_members membership
                   where membership.member = session_role.oid
                  union
                  select membership.roleid
                    from pg_auth_members membership
                    join accessible child on child.role_oid = membership.member
                )
                select 1
                  from accessible
                  join pg_roles inherited_role on inherited_role.oid = accessible.role_oid
                 where inherited_role.rolsuper or inherited_role.rolbypassrls
                    or inherited_role.rolcreaterole or inherited_role.rolcreatedb
                    or inherited_role.rolreplication or left(inherited_role.rolname, 3) = 'pg_'
              ) as session_no_privileged_membership,
              owner_role.oid is not null and not owner_role.rolcanlogin and not owner_role.rolinherit
                and not owner_role.rolsuper and not owner_role.rolbypassrls and not owner_role.rolcreaterole
                and not owner_role.rolcreatedb and not owner_role.rolreplication as restricted_owner,
              not exists (
                with recursive inherited(role_oid) as (
                  select membership.roleid from pg_auth_members membership where membership.member = owner_role.oid
                  union
                  select membership.roleid
                    from pg_auth_members membership
                    join inherited child on child.role_oid = membership.member
                )
                select 1
                  from inherited
                  join pg_roles inherited_role on inherited_role.oid = inherited.role_oid
                 where inherited_role.rolsuper or inherited_role.rolbypassrls
                    or inherited_role.rolcreaterole or inherited_role.rolcreatedb
                    or inherited_role.rolreplication or left(inherited_role.rolname, 3) = 'pg_'
              ) as owner_no_privileged_membership,
              not pg_has_role(current_user, owner_role.oid, 'MEMBER')
                and not pg_has_role(current_user, owner_role.oid, 'SET') as no_owner_membership,
              not exists (
                select 1
                  from unnest($5::text[]) required(relation_name)
                  cross join unnest(array[
                    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
                    'REFERENCES', 'TRIGGER', 'MAINTAIN'
                  ]::text[]) required_privilege(privilege_name)
                 where has_table_privilege(session_user, required.relation_name, required_privilege.privilege_name)
                    or case
                         when required_privilege.privilege_name = any(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']::text[])
                           then has_any_column_privilege(session_user, required.relation_name, required_privilege.privilege_name)
                         else false
                       end
              ) as session_no_schedule_privileges,
              not exists (
                select 1
                  from unnest($6::text[]) required(function_signature)
                 where has_function_privilege(session_user, required.function_signature, 'EXECUTE')
              ) as session_no_function_execute,
              has_schema_privilege(current_user, 'public', 'USAGE') as schema_usage,
              not has_schema_privilege(current_user, 'public', 'CREATE') as no_schema_create,
              obj_description(to_regclass('public.workforce_schedule_settings'), 'pg_class') = $1::text as marker_ready
         from pg_roles role
         left join pg_roles session_role on session_role.rolname = session_user
         left join pg_roles owner_role on owner_role.rolname = $4::text
        where role.rolname = current_user`,
      [
        WORKFORCE_SCHEDULE_SCHEMA_MARKER,
        WORKFORCE_SCHEDULE_SESSION_ROLE,
        WORKFORCE_SCHEDULE_DB_ROLE,
        WORKFORCE_SCHEDULE_OWNER_ROLE,
        [...REQUIRED_RELATIONS, ...SOURCE_RELATIONS],
        RUNTIME_FUNCTIONS,
      ],
    )
    const security = securityResult.rows[0]
    if (!security || security.session_role !== true) missing.push('runtime:SESSION_ROLE')
    if (!security || security.restricted_session_role !== true) missing.push('runtime:SESSION_ROLE_PRIVILEGED')
    if (!security || security.runtime_role !== true) missing.push(`runtime:${WORKFORCE_SCHEDULE_DB_ROLE}`)
    if (!security || security.restricted_role !== true) missing.push('runtime:RLS_BYPASS')
    if (!security || security.role_switch_ready !== true) missing.push('runtime:ROLE_MEMBERSHIP')
    if (!security || security.role_switch_exact !== true) missing.push('runtime:ROLE_MEMBERSHIP_OPTIONS')
    if (!security || security.exact_session_role_graph !== true) missing.push('runtime:SESSION_ROLE_GRAPH')
    if (!security || security.exact_session_set_graph !== true) missing.push('runtime:SESSION_SET_GRAPH')
    if (!security || security.empty_runtime_role_graph !== true) missing.push('runtime:APP_ROLE_GRAPH')
    if (!security || security.no_inherited_runtime !== true) missing.push('runtime:ROLE_INHERIT')
    if (!security || security.no_privileged_membership !== true) missing.push('runtime:PRIVILEGED_MEMBERSHIP')
    if (!security || security.session_no_privileged_membership !== true) missing.push('runtime:SESSION_PRIVILEGED_MEMBERSHIP')
    if (!security || security.restricted_owner !== true) missing.push('runtime:OWNER_ROLE')
    if (!security || security.owner_no_privileged_membership !== true) missing.push('runtime:OWNER_PRIVILEGED_MEMBERSHIP')
    if (!security || security.no_owner_membership !== true) missing.push('runtime:OWNER_MEMBERSHIP')
    if (!security || security.session_no_schedule_privileges !== true) missing.push('runtime:SESSION_SCHEDULE_PRIVILEGE')
    if (!security || security.session_no_function_execute !== true) missing.push('runtime:SESSION_FUNCTION_EXECUTE')
    if (!security || security.schema_usage !== true) missing.push('runtime:SCHEMA_USAGE')
    if (!security || security.no_schema_create !== true) missing.push('runtime:SCHEMA_CREATE')
    if (!security || security.marker_ready !== true) missing.push('schema:VERSION')
    return { ready: missing.length === 0, missing }
  }

  async function readSettings(orgId, { lock = false } = {}) {
    const result = await client.query(
      `select org_id, time_zone, weekly_limit_minutes, version, created_at, updated_at
         from public.workforce_schedule_settings
        where org_id = $1::text ${lock ? 'for update' : ''}`,
      [orgId],
    )
    const row = result.rows[0]
    return row ? {
      orgId: text(row.org_id),
      timeZone: text(row.time_zone),
      weeklyLimitMinutes: Number(row.weekly_limit_minutes),
      version: Number(row.version),
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    } : null
  }

  async function listPeople(orgId, { personId = '', referencedPersonIds = [] } = {}) {
    const referenced = uniqueIdentifiers(referencedPersonIds)
    const result = await client.query(
      `select person_id, source_worker_id_normalized, display_name,
              initials, role_snapshot, status, version
         from public.workforce_schedule_person
        where org_id = $1::text
          and (status = 'ACTIVE'
               or (status = 'INACTIVE' and person_id = any($3::text[])))
          and (nullif($2::text, '') is null or person_id = $2::text)
        order by display_name asc, person_id asc`,
      [orgId, personId, referenced],
    )
    return result.rows.map(mapPerson)
  }

  async function listLocations(orgId, { referencedLocationIds = [] } = {}) {
    const referenced = uniqueIdentifiers(referencedLocationIds)
    const result = await client.query(
      `select location_id, source_object_id, name, short_name, color, soft_color, status, version
         from public.workforce_schedule_location
        where org_id = $1::text
          and (status = 'ACTIVE'
               or (status = 'INACTIVE' and location_id = any($2::text[])))
        order by name asc, location_id asc`,
      [orgId, referenced],
    )
    return result.rows.map(mapLocation)
  }

  async function readCatalogSync(orgId) {
    // CATALOGS/SYNCED audit is appended before the command is marked COMPLETED,
    // in the same transaction. A completed receipt is therefore a safe,
    // committed projection of that append-only audit without granting runtime
    // SELECT access to workforce_schedule_audit.
    const result = await client.query(
      `select
         (select (count(*) filter (where status = 'ACTIVE'))::integer
            from public.workforce_schedule_person where org_id = $1::text) as active_people,
         (select (count(*) filter (where status = 'INACTIVE'))::integer
            from public.workforce_schedule_person where org_id = $1::text) as inactive_people,
         (select (count(*) filter (where status = 'ACTIVE'))::integer
            from public.workforce_schedule_location where org_id = $1::text) as active_locations,
         (select (count(*) filter (where status = 'INACTIVE'))::integer
            from public.workforce_schedule_location where org_id = $1::text) as inactive_locations,
         (select coalesce(
                   nullif(command.response_json #>> '{receipt,synchronizedAt}', ''),
                   command.completed_at::text
                 )
            from public.workforce_schedule_command command
           where command.org_id = $1::text
             and command.command_type = 'SYNC_CATALOGS'
             and command.status = 'COMPLETED'
           order by command.completed_at desc nulls last, command.created_at desc
           limit 1) as last_synced_at`,
      [orgId],
    )
    const row = result.rows[0] || {}
    return {
      lastSyncedAt: iso(row.last_synced_at),
      people: {
        active: nonNegativeCount(row.active_people),
        inactive: nonNegativeCount(row.inactive_people),
      },
      locations: {
        active: nonNegativeCount(row.active_locations),
        inactive: nonNegativeCount(row.inactive_locations),
      },
    }
  }

  async function readShiftRows({ orgId, from, to, personId = '', shiftId = '', onlyCurrent = true }) {
    const revisionJoin = onlyCurrent ? 'r.revision_no = h.current_revision_no' : 'r.revision_no = h.published_revision_no'
    const rangePredicate = onlyCurrent
      ? `(r.business_date between $2::date and $3::date
          or (h.lifecycle_status = 'CHANGED_AFTER_PUBLISH'
              and published.business_date between $2::date and $3::date))`
      : 'r.business_date between $2::date and $3::date'
    const result = await client.query(
      `select h.shift_id, h.lifecycle_status, h.current_revision_no, h.published_revision_no, h.version,
              r.revision_no, r.business_date, r.title, r.local_start_time, r.local_end_time,
              r.starts_at, r.ends_at, r.time_zone, r.break_minutes, r.required_headcount,
              r.location_id, r.notes, r.is_deleted, published.business_date as published_business_date,
              coalesce((
                select jsonb_agg(a.person_id order by a.person_id)
                  from public.workforce_schedule_shift_revision_assignee a
                 where a.org_id = h.org_id and a.shift_id = h.shift_id and a.revision_no = r.revision_no
              ), '[]'::jsonb) as person_ids,
              coalesce((
                select jsonb_agg(i.instruction order by i.position)
                  from public.workforce_schedule_shift_instruction i
                 where i.org_id = h.org_id and i.shift_id = h.shift_id and i.revision_no = r.revision_no
              ), '[]'::jsonb) as instructions
         from public.workforce_schedule_shift h
         join public.workforce_schedule_shift_revision r
           on r.org_id = h.org_id and r.shift_id = h.shift_id and ${revisionJoin}
         left join public.workforce_schedule_shift_revision published
           on published.org_id = h.org_id and published.shift_id = h.shift_id
          and published.revision_no = h.published_revision_no
        where h.org_id = $1::text
          and ${rangePredicate}
          and ($4::text = '' or exists (
                select 1 from public.workforce_schedule_shift_revision_assignee own_assignment
                 where own_assignment.org_id = h.org_id and own_assignment.shift_id = h.shift_id
                   and own_assignment.revision_no = r.revision_no and own_assignment.person_id = $4::text
              ))
          and ($5::text = '' or h.shift_id = $5::text)
          and (${onlyCurrent ? 'true' : "h.lifecycle_status <> 'ARCHIVED'"})
        order by least(r.business_date, coalesce(published.business_date, r.business_date)) asc,
                 r.starts_at asc, h.shift_id asc`,
      [orgId, from, to, personId, shiftId],
    )
    return result.rows
  }

  async function listPublications({ orgId, from, to }) {
    const result = await client.query(
      `select publication_id, period_start, period_end, time_zone, effects_json,
              warning_fingerprint, warnings_json, actor_uid, created_at
         from public.workforce_schedule_publication
        where org_id = $1::text and period_start <= $3::date and period_end >= $2::date
        order by created_at desc, publication_id desc limit 100`,
      [orgId, from, to],
    )
    return result.rows.map((row) => ({
      publicationId: text(row.publication_id),
      from: ymd(row.period_start),
      to: ymd(row.period_end),
      timeZone: text(row.time_zone),
      effects: asJson(row.effects_json, {}),
      visibility: 'INTERNAL_ONLY',
      warningFingerprint: text(row.warning_fingerprint),
      warnings: asJson(row.warnings_json, []),
      actorUid: text(row.actor_uid),
      createdAt: iso(row.created_at),
    }))
  }

  async function bootstrap({ orgId, from, to, personId = '' }) {
    const settings = await readSettings(orgId)
    const [shiftRows, publications, catalogSync] = await Promise.all([
      readShiftRows({ orgId, from, to, personId }),
      listPublications({ orgId, from, to }),
      readCatalogSync(orgId),
    ])
    const referencedPersonIds = uniqueIdentifiers(
      shiftRows.flatMap((row) => asJson(row.person_ids, [])),
    )
    const referencedLocationIds = uniqueIdentifiers(
      shiftRows.map((row) => row.location_id),
    )
    const [people, locations] = await Promise.all([
      listPeople(orgId, { personId, referencedPersonIds }),
      listLocations(orgId, { referencedLocationIds }),
    ])
    return {
      settings,
      setupRequired: !settings,
      people,
      locations,
      shifts: shiftRows.map(mapShift),
      publications,
      catalogSync,
      requests: [],
      templates: [],
      integration: { delivery: false, notifications: false, downstream: false },
      range: { from, to },
    }
  }

  async function claimCommand({ orgId, actorUid, idempotencyKey, commandType, requestHash, effects }) {
    const inserted = await client.query(
      `insert into public.workforce_schedule_command (
         org_id, actor_uid, idempotency_key, command_type, request_hash, effects_json, status, created_at
       ) values ($1::text, $2::text, $3::text, $4::text, $5::text, $6::jsonb, 'IN_PROGRESS', now())
       on conflict (org_id, actor_uid, idempotency_key) do nothing
       returning request_hash, status, response_json`,
      [orgId, actorUid, idempotencyKey, commandType, requestHash, JSON.stringify(effects)],
    )
    if (inserted.rows[0]) return { claimed: true, replay: false }

    const existing = await client.query(
      `select request_hash, status, response_json, completed_at
         from public.workforce_schedule_command
        where org_id = $1::text and actor_uid = $2::text and idempotency_key = $3::text
        for update`,
      [orgId, actorUid, idempotencyKey],
    )
    const row = existing.rows[0]
    if (!row || text(row.request_hash) !== requestHash) {
      throw error(409, 'WORKFORCE_SCHEDULE_IDEMPOTENCY_CONFLICT', 'Ten klucz idempotencji został użyty dla innego żądania.')
    }
    if (text(row.status) !== 'COMPLETED' || !row.response_json) {
      throw error(409, 'WORKFORCE_SCHEDULE_COMMAND_IN_PROGRESS', 'Ta operacja jest już przetwarzana.')
    }
    return {
      claimed: false,
      replay: true,
      response: asJson(row.response_json, {}),
      completedAt: iso(row.completed_at),
    }
  }

  async function completeCommand({ orgId, actorUid, idempotencyKey, response }) {
    const result = await client.query(
      `update public.workforce_schedule_command
          set status = 'COMPLETED', response_json = $4::jsonb, completed_at = now()
        where org_id = $1::text and actor_uid = $2::text and idempotency_key = $3::text
          and status = 'IN_PROGRESS'
        returning status`,
      [orgId, actorUid, idempotencyKey, JSON.stringify(response)],
    )
    if (result.rows.length !== 1) {
      throw error(409, 'WORKFORCE_SCHEDULE_COMMAND_LOST', 'Nie można bezpiecznie zakończyć tej operacji Grafiku. Spróbuj ponownie.')
    }
  }

  async function appendAudit({ orgId, auditId, entityType, entityId, action, actorUid, idempotencyKey = '', before = null, after = null }) {
    await client.query(
      `insert into public.workforce_schedule_audit (
         org_id, audit_id, entity_type, entity_id, action, actor_uid, idempotency_key,
         before_json, after_json, occurred_at
       ) values ($1::text, $2::text, $3::text, $4::text, $5::text, $6::text,
                 nullif($7::text, ''), $8::jsonb, $9::jsonb, now())`,
      [orgId, auditId, entityType, entityId, action, actorUid, idempotencyKey, before && JSON.stringify(before), after && JSON.stringify(after)],
    )
  }

  async function saveSettings({ orgId, timeZone, weeklyLimitMinutes, expectedVersion, actorUid }) {
    const current = await readSettings(orgId, { lock: true })
    if (!current && expectedVersion !== 0) {
      throw error(409, 'WORKFORCE_SCHEDULE_STALE_VERSION', 'Ustawienia Grafiku nie istnieją w oczekiwanej wersji.', { currentVersion: 0 })
    }
    if (current && current.version !== expectedVersion) {
      throw error(409, 'WORKFORCE_SCHEDULE_STALE_VERSION', 'Ustawienia Grafiku zostały zmienione przez inną osobę.', { currentVersion: current.version })
    }
    if (current && current.timeZone !== timeZone) {
      const shifts = await client.query(
        `select 1 from public.workforce_schedule_shift where org_id = $1::text limit 1`,
        [orgId],
      )
      if (shifts.rows[0]) {
        throw error(409, 'WORKFORCE_SCHEDULE_TIME_ZONE_LOCKED', 'Nie można zmienić strefy czasowej po utworzeniu pierwszej zmiany.')
      }
    }
    if (current) {
      await client.query(
        `update public.workforce_schedule_settings
            set time_zone = $3::text, weekly_limit_minutes = $4::integer,
                version = version + 1, updated_at = now(), updated_by_uid = $5::text
          where org_id = $1::text and version = $2::integer`,
        [orgId, expectedVersion, timeZone, weeklyLimitMinutes, actorUid],
      )
    } else {
      await client.query(
        `insert into public.workforce_schedule_settings (
           org_id, time_zone, weekly_limit_minutes, version, created_by_uid, updated_by_uid
         ) values ($1::text, $2::text, $3::integer, 1, $4::text, $4::text)`,
        [orgId, timeZone, weeklyLimitMinutes, actorUid],
      )
    }
    return readSettings(orgId)
  }

  async function readActiveRoster(orgId) {
    const result = await client.query(
      `select source_worker_id_normalized, source_worker_login, source_auth_uid,
              display_name, role_snapshot
         from public.workforce_schedule_read_active_workers($1::text)`,
      [orgId],
    )
    return result.rows
  }

  async function readActiveObjects(orgId) {
    const result = await client.query(
      `select source_object_id, display_name
         from public.workforce_schedule_read_active_objects($1::text)`,
      [orgId],
    )
    return result.rows
  }

  async function prepareRosterSync({ orgId }) {
    await client.query(`select pg_advisory_xact_lock(hashtextextended('workforce-schedule-roster:' || $1::text, 0))`, [orgId])
    const [sourceRows, existingResult] = await Promise.all([
      readActiveRoster(orgId),
      client.query(`select * from public.workforce_schedule_person where org_id = $1::text for update`, [orgId]),
    ])
    const existingByWorkerId = new Map(
      existingResult.rows.map((row) => [text(row.source_worker_id_normalized), row]),
    )
    const sourceWorkerIds = new Set()

    for (const source of sourceRows) {
      const sourceWorkerId = text(source.source_worker_id_normalized)
      if (sourceWorkerIds.has(sourceWorkerId)) {
        throw error(
          409,
          'WORKFORCE_SCHEDULE_ROSTER_SOURCE_CONFLICT',
          'Katalog pracowników zawiera powielone stabilne ID pracownika.',
          { sourceWorkerId },
        )
      }
      sourceWorkerIds.add(sourceWorkerId)
    }
    const activeExisting = existingResult.rows.filter((row) => text(row.status).toUpperCase() === 'ACTIVE')
    const deactivated = activeExisting.filter((row) => (
      !sourceWorkerIds.has(text(row.source_worker_id_normalized))
    )).length
    if (deactivated > 0) {
      throw error(
        409,
        'WORKFORCE_SCHEDULE_ROSTER_DEACTIVATION_BLOCKED',
        'Synchronizacja nie może automatycznie wyłączyć pracowników. Sprawdź kompletność katalogu źródłowego.',
        { activeCount: activeExisting.length, deactivationCount: deactivated, sourceCount: sourceRows.length },
      )
    }

    return { sourceRows, existingByWorkerId, deactivated }
  }

  async function applyRosterSync({ orgId, createPersonId, plan }) {
    const { sourceRows, existingByWorkerId, deactivated } = plan
    const activePersonIds = []
    let created = 0
    let updated = 0

    for (const source of sourceRows) {
      const sourceWorkerId = text(source.source_worker_id_normalized)
      const sourceLogin = text(source.source_worker_login)
      const sourceAuthUid = text(source.source_auth_uid)
      const current = existingByWorkerId.get(sourceWorkerId) || null
      const personId = text(current?.person_id) || createPersonId()
      const displayName = text(source.display_name)
      const initials = initialsFromName(source.display_name)
      const roleSnapshot = text(source.role_snapshot)
      const changed = current && (
        text(current.source_worker_login) !== sourceLogin
        || text(current.source_auth_uid) !== sourceAuthUid
        || text(current.display_name) !== displayName
        || text(current.initials) !== initials
        || text(current.role_snapshot) !== roleSnapshot
        || text(current.status).toUpperCase() !== 'ACTIVE'
      )
      if (!current) created += 1
      else if (changed) updated += 1
      activePersonIds.push(personId)
      const values = [
        orgId,
        personId,
        sourceWorkerId,
        sourceLogin || null,
        sourceAuthUid || null,
        displayName,
        initials,
        roleSnapshot || null,
      ]
      if (current) {
        await client.query(
          `update public.workforce_schedule_person
              set source_worker_id_normalized = $3::text,
                  source_worker_login = $4::text,
                  source_auth_uid = $5::text,
                  display_name = $6::text,
                  initials = $7::text,
                  role_snapshot = $8::text,
                  status = 'ACTIVE',
                  version = version + 1,
                  synced_at = now(), updated_at = now()
            where org_id = $1::text and person_id = $2::text
              and (source_worker_id_normalized, source_worker_login, source_auth_uid,
                   display_name, initials, role_snapshot, status)
                  is distinct from ($3::text, $4::text, $5::text, $6::text, $7::text, $8::text, 'ACTIVE'::text)`,
          values,
        )
      } else {
        await client.query(
          `insert into public.workforce_schedule_person (
             org_id, person_id, source_worker_id_normalized, source_worker_login, source_auth_uid,
             display_name, initials, role_snapshot, status, version, synced_at
           ) values ($1::text, $2::text, $3::text, $4::text, $5::text,
                     $6::text, $7::text, $8::text, 'ACTIVE', 1, now())`,
          values,
        )
      }
      existingByWorkerId.set(sourceWorkerId, { person_id: personId, source_worker_id_normalized: sourceWorkerId })
    }

    return {
      active: activePersonIds.length,
      created,
      updated,
      deactivated,
    }
  }

  async function prepareLocationSync({ orgId }) {
    await client.query(`select pg_advisory_xact_lock(hashtextextended('workforce-schedule-objects:' || $1::text, 0))`, [orgId])
    const [sourceRows, existingResult] = await Promise.all([
      readActiveObjects(orgId),
      client.query(`select * from public.workforce_schedule_location where org_id = $1::text for update`, [orgId]),
    ])
    const existingBySource = new Map(existingResult.rows.map((row) => [text(row.source_object_id), row]))
    const seenSourceIds = new Set()

    for (const source of sourceRows) {
      const sourceObjectId = text(source.source_object_id)
      if (seenSourceIds.has(sourceObjectId)) {
        throw error(409, 'WORKFORCE_SCHEDULE_OBJECT_SOURCE_CONFLICT', 'Katalog obiektów zawiera powielone ID.', { sourceObjectId })
      }
      seenSourceIds.add(sourceObjectId)
    }
    const activeExisting = existingResult.rows.filter((row) => text(row.status).toUpperCase() === 'ACTIVE')
    const deactivated = activeExisting.filter((row) => (
      !seenSourceIds.has(text(row.source_object_id))
    )).length
    if (deactivated > 0) {
      throw error(
        409,
        'WORKFORCE_SCHEDULE_OBJECT_DEACTIVATION_BLOCKED',
        'Synchronizacja nie może automatycznie wyłączyć obiektów. Sprawdź kompletność katalogu źródłowego.',
        { activeCount: activeExisting.length, deactivationCount: deactivated, sourceCount: sourceRows.length },
      )
    }

    return { sourceRows, existingBySource, deactivated }
  }

  async function applyLocationSync({ orgId, actorUid, createLocationId, plan }) {
    const { sourceRows, existingBySource, deactivated } = plan
    const activeLocationIds = []
    let created = 0
    let updated = 0

    for (const source of sourceRows) {
      const sourceObjectId = text(source.source_object_id)
      const current = existingBySource.get(sourceObjectId) || null
      const locationId = text(current?.location_id) || createLocationId()
      const name = text(source.display_name)
      const shortName = name.slice(0, 80)
      const changed = current && (
        text(current.name) !== name
        || text(current.short_name) !== shortName
        || text(current.status).toUpperCase() !== 'ACTIVE'
      )
      if (!current) created += 1
      else if (changed) updated += 1
      const colors = current
        ? { color: text(current.color), softColor: text(current.soft_color) }
        : locationColors(sourceObjectId)
      activeLocationIds.push(locationId)
      if (current) {
        await client.query(
          `update public.workforce_schedule_location
              set name = $4::text, short_name = $5::text, status = 'ACTIVE',
                  version = version + 1, synced_at = now(), updated_at = now(), updated_by_uid = $6::text
            where org_id = $1::text and location_id = $2::text and source_object_id = $3::text
              and (name, short_name, status) is distinct from ($4::text, $5::text, 'ACTIVE'::text)`,
          [orgId, locationId, sourceObjectId, name, shortName, actorUid],
        )
      } else {
        await client.query(
          `insert into public.workforce_schedule_location (
             org_id, location_id, source_object_id, name, short_name, color, soft_color,
             status, version, synced_at, created_by_uid, updated_by_uid
           ) values ($1::text, $2::text, $3::text, $4::text, $5::text, $6::text, $7::text,
                     'ACTIVE', 1, now(), $8::text, $8::text)`,
          [orgId, locationId, sourceObjectId, name, shortName, colors.color, colors.softColor, actorUid],
        )
      }
    }

    return {
      active: activeLocationIds.length,
      created,
      updated,
      deactivated,
    }
  }

  async function syncCatalogs({ orgId, actorUid, createPersonId, createLocationId }) {
    // Validate both source snapshots before any catalog write. A partial object
    // read must not allow roster writes (or vice versa), even if a caller fails
    // to provide the API transaction wrapper.
    const rosterPlan = await prepareRosterSync({ orgId })
    const locationPlan = await prepareLocationSync({ orgId })
    const people = await applyRosterSync({ orgId, createPersonId, plan: rosterPlan })
    const locations = await applyLocationSync({ orgId, actorUid, createLocationId, plan: locationPlan })
    const timestamp = await client.query('select transaction_timestamp() as synchronized_at')
    return {
      synchronizedAt: iso(timestamp.rows[0]?.synchronized_at),
      people,
      locations,
    }
  }

  async function lockWorkerSources(orgId, sourceWorkerIds) {
    const expected = [...new Set(sourceWorkerIds.map(text).filter(Boolean))].sort()
    if (!expected.length) return
    const result = await client.query(
      `select source_worker_id_normalized, active, status
         from public.workforce_schedule_lock_worker_sources($1::text, $2::text[])`,
      [orgId, expected],
    )
    const active = new Set(result.rows
      .filter((row) => row.active === true && text(row.status).toUpperCase() === 'ACTIVE')
      .map((row) => text(row.source_worker_id_normalized)))
    const unavailable = expected.filter((sourceWorkerId) => !active.has(sourceWorkerId))
    if (unavailable.length) {
      throw error(409, 'WORKFORCE_SCHEDULE_PERSON_UNAVAILABLE', 'Co najmniej jedna osoba nie jest już aktywna w organizacji.', { sourceWorkerIds: unavailable })
    }
  }

  async function lockObjectSources(orgId, sourceObjectIds) {
    const expected = [...new Set(sourceObjectIds.map(text).filter(Boolean))].sort()
    if (!expected.length) return
    const result = await client.query(
      `select source_object_id, active, status
         from public.workforce_schedule_lock_object_sources($1::text, $2::text[])`,
      [orgId, expected],
    )
    const active = new Set(result.rows
      .filter((row) => (
        row.active === true
        && ['ACTIVE', 'AKTYWNY'].includes(text(row.status).toUpperCase())
      ))
      .map((row) => text(row.source_object_id)))
    const unavailable = expected.filter((sourceObjectId) => !active.has(sourceObjectId))
    if (unavailable.length) {
      throw error(409, 'WORKFORCE_SCHEDULE_LOCATION_UNAVAILABLE', 'Co najmniej jeden obiekt nie jest już aktywny w organizacji.', { sourceObjectIds: unavailable })
    }
  }

  async function assertActiveLocation(orgId, locationId) {
    const result = await client.query(
      `select l.location_id, l.source_object_id
         from public.workforce_schedule_location l
        where l.org_id = $1::text and l.location_id = $2::text and l.status = 'ACTIVE'
        for share of l`,
      [orgId, locationId],
    )
    const location = result.rows[0]
    if (!location) throw error(409, 'WORKFORCE_SCHEDULE_LOCATION_UNAVAILABLE', 'Wybrany obiekt nie jest aktywny w Grafiku.')
    await lockObjectSources(orgId, [location.source_object_id])
  }

  async function assertActivePeople(orgId, personIds) {
    if (!personIds.length) return
    const result = await client.query(
      `select p.person_id, p.source_worker_id_normalized
         from public.workforce_schedule_person p
        where p.org_id = $1::text and p.status = 'ACTIVE' and p.person_id = any($2::text[])
        for share of p`,
      [orgId, personIds],
    )
    const found = new Set(result.rows.map((row) => text(row.person_id)))
    const missing = personIds.filter((personId) => !found.has(personId))
    if (missing.length) {
      throw error(409, 'WORKFORCE_SCHEDULE_PERSON_UNAVAILABLE', 'Co najmniej jedna osoba nie jest aktywna w Grafiku.', { personIds: missing })
    }
    await lockWorkerSources(orgId, result.rows.map((row) => row.source_worker_id_normalized))
  }

  async function lockShift(orgId, shiftId) {
    const result = await client.query(
      `select * from public.workforce_schedule_shift
        where org_id = $1::text and shift_id = $2::text for update`,
      [orgId, shiftId],
    )
    return result.rows[0] || null
  }

  async function readOneShift(orgId, shiftId) {
    const rows = await readShiftRows({ orgId, from: '1900-01-01', to: '9999-12-31', shiftId })
    return rows[0] ? mapShift(rows[0]) : null
  }

  async function insertRevision({ orgId, shiftId, revisionNo, shift, actorUid, isDeleted = false }) {
    await client.query(
      `insert into public.workforce_schedule_shift_revision (
         org_id, shift_id, revision_no, business_date, title, local_start_time, local_end_time,
         starts_at, ends_at, time_zone, break_minutes, required_headcount, location_id, notes,
         is_deleted, created_by_uid
       ) values (
         $1::text, $2::text, $3::integer, $4::date, $5::text, $6::time, $7::time,
         $8::timestamptz, $9::timestamptz, $10::text, $11::integer, $12::integer,
         $13::text, nullif($14::text, ''), $15::boolean, $16::text
       )`,
      [orgId, shiftId, revisionNo, shift.date, shift.title, shift.startTime, shift.endTime, shift.startsAt, shift.endsAt, shift.timeZone, shift.breakMinutes, shift.requiredHeadcount, shift.locationId, shift.notes, isDeleted, actorUid],
    )
    for (const personId of shift.personIds) {
      await client.query(
        `insert into public.workforce_schedule_shift_revision_assignee
           (org_id, shift_id, revision_no, person_id)
         values ($1::text, $2::text, $3::integer, $4::text)`,
        [orgId, shiftId, revisionNo, personId],
      )
    }
    for (const instruction of shift.instructions) {
      await client.query(
        `insert into public.workforce_schedule_shift_instruction
           (org_id, shift_id, revision_no, position, instruction)
         values ($1::text, $2::text, $3::integer, $4::integer, $5::text)`,
        [orgId, shiftId, revisionNo, instruction.position, instruction.text],
      )
    }
  }

  async function saveShift({ orgId, shift, actorUid, createShiftId }) {
    await assertActiveLocation(orgId, shift.locationId)
    await assertActivePeople(orgId, shift.personIds)
    const shiftId = shift.shiftId || createShiftId()
    const current = await lockShift(orgId, shiftId)
    if ((!current && shift.expectedVersion !== 0) || (current && Number(current.version) !== shift.expectedVersion)) {
      throw error(409, 'WORKFORCE_SCHEDULE_STALE_VERSION', 'Zmiana została zmieniona przez inną osobę.', { currentVersion: Number(current?.version ?? 0) })
    }
    const before = current ? await readOneShift(orgId, shiftId) : null
    const revisionNo = current ? Number(current.current_revision_no) + 1 : 1
    if (!current) {
      await client.query(
        `insert into public.workforce_schedule_shift (
           org_id, shift_id, lifecycle_status, current_revision_no, published_revision_no,
           version, created_by_uid, updated_by_uid
         ) values ($1::text, $2::text, 'DRAFT', 1, null, 1, $3::text, $3::text)`,
        [orgId, shiftId, actorUid],
      )
    }
    await insertRevision({ orgId, shiftId, revisionNo, shift, actorUid })
    if (current) {
      const updated = await client.query(
        `update public.workforce_schedule_shift
            set current_revision_no = $4::integer,
                lifecycle_status = case when published_revision_no is null then 'DRAFT' else 'CHANGED_AFTER_PUBLISH' end,
                version = version + 1, updated_at = now(), updated_by_uid = $5::text
          where org_id = $1::text and shift_id = $2::text and version = $3::integer
          returning version`,
        [orgId, shiftId, shift.expectedVersion, revisionNo, actorUid],
      )
      if (!updated.rows[0]) throw error(409, 'WORKFORCE_SCHEDULE_STALE_VERSION', 'Zmiana została zmieniona przez inną osobę.')
    }
    return { before, shift: await readOneShift(orgId, shiftId) }
  }

  async function copyRevision({ orgId, shift, actorUid, isDeleted = false }) {
    const nextRevision = Number(shift.revision) + 1
    const revision = {
      ...shift,
      instructions: shift.instructions.map((instruction, index) => ({ position: index + 1, text: instruction })),
    }
    await insertRevision({ orgId, shiftId: shift.shiftId, revisionNo: nextRevision, shift: revision, actorUid, isDeleted })
    const result = await client.query(
      `update public.workforce_schedule_shift
          set current_revision_no = $3::integer,
              lifecycle_status = case when published_revision_no is null then 'DRAFT' else 'CHANGED_AFTER_PUBLISH' end,
              version = version + 1, updated_at = now(), updated_by_uid = $4::text
        where org_id = $1::text and shift_id = $2::text and version = $5::integer
        returning version`,
      [orgId, shift.shiftId, nextRevision, actorUid, shift.version],
    )
    if (!result.rows[0]) throw error(409, 'WORKFORCE_SCHEDULE_STALE_VERSION', 'Zmiana została zmieniona przez inną osobę.')
    return readOneShift(orgId, shift.shiftId)
  }

  async function archiveShift({ orgId, shiftId, expectedVersion, actorUid }) {
    const current = await lockShift(orgId, shiftId)
    if (!current) throw error(404, 'WORKFORCE_SCHEDULE_SHIFT_NOT_FOUND', 'Nie znaleziono zmiany.')
    if (Number(current.version) !== expectedVersion) {
      throw error(409, 'WORKFORCE_SCHEDULE_STALE_VERSION', 'Zmiana została zmieniona przez inną osobę.', { currentVersion: Number(current.version) })
    }
    const before = await readOneShift(orgId, shiftId)
    if (before.pendingDeletion) return { before, shift: before }
    const after = await copyRevision({ orgId, shift: before, actorUid, isDeleted: true })
    return { before, shift: after }
  }

  async function lockPublicationScope({ orgId, from, to }) {
    await client.query(`select pg_advisory_xact_lock(hashtextextended('workforce-schedule-publish:' || $1::text, 0))`, [orgId])
    const result = await client.query(
      `select h.shift_id, h.version, h.current_revision_no, h.published_revision_no,
              r.is_deleted, r.business_date, published.business_date as published_business_date
         from public.workforce_schedule_shift h
         join public.workforce_schedule_shift_revision r
           on r.org_id = h.org_id and r.shift_id = h.shift_id and r.revision_no = h.current_revision_no
         left join public.workforce_schedule_shift_revision published
           on published.org_id = h.org_id and published.shift_id = h.shift_id
          and published.revision_no = h.published_revision_no
        where h.org_id = $1::text
          and (r.business_date between $2::date and $3::date
               or published.business_date between $2::date and $3::date)
          and h.lifecycle_status in ('DRAFT', 'CHANGED_AFTER_PUBLISH')
        order by h.shift_id asc for update of h`,
      [orgId, from, to],
    )
    return result.rows.map((row) => ({
      shiftId: text(row.shift_id),
      version: Number(row.version),
      revision: Number(row.current_revision_no),
      publishedRevision: row.published_revision_no == null ? null : Number(row.published_revision_no),
      isDeleted: row.is_deleted === true,
      date: ymd(row.business_date),
      publishedDate: ymd(row.published_business_date),
    }))
  }

  function effectiveScheduleCte() {
    return `with effective as (
      select h.org_id, h.shift_id,
             case when h.shift_id = any($2::text[]) then h.current_revision_no else h.published_revision_no end as revision_no
        from public.workforce_schedule_shift h
       where h.org_id = $1::text and h.lifecycle_status <> 'ARCHIVED'
         and (h.shift_id = any($2::text[]) or h.published_revision_no is not null)
    ), schedule as (
      select e.org_id, e.shift_id, e.revision_no, r.business_date, r.starts_at, r.ends_at,
             r.break_minutes, r.required_headcount, r.location_id, r.is_deleted
        from effective e
        join public.workforce_schedule_shift_revision r
          on r.org_id = e.org_id and r.shift_id = e.shift_id and r.revision_no = e.revision_no
       where r.is_deleted is false
    )`
  }

  async function lockPublicationDependencies({ orgId, candidateShiftIds, from, to }) {
    const params = [orgId, candidateShiftIds, from, to]
    const cte = effectiveScheduleCte()
    const people = await client.query(
      `${cte}
       select p.person_id, p.source_worker_id_normalized, p.status
         from schedule s
         join public.workforce_schedule_shift_revision_assignee a
           on a.org_id = s.org_id and a.shift_id = s.shift_id and a.revision_no = s.revision_no
         join public.workforce_schedule_person p
           on p.org_id = a.org_id and p.person_id = a.person_id
        where s.shift_id = any($2::text[]) or s.business_date between $3::date and $4::date
        order by p.person_id asc for share of p`,
      params,
    )
    const inactivePeople = people.rows.filter((row) => text(row.status).toUpperCase() !== 'ACTIVE').map((row) => text(row.person_id))
    if (inactivePeople.length) {
      throw error(409, 'WORKFORCE_SCHEDULE_PERSON_UNAVAILABLE', 'Co najmniej jedna osoba nie jest aktywna w Grafiku.', { personIds: inactivePeople })
    }
    await lockWorkerSources(orgId, people.rows.map((row) => row.source_worker_id_normalized))

    const locations = await client.query(
      `${cte}
       select l.location_id, l.source_object_id, l.status
         from schedule s
         join public.workforce_schedule_location l
           on l.org_id = s.org_id and l.location_id = s.location_id
        where s.shift_id = any($2::text[]) or s.business_date between $3::date and $4::date
        order by l.location_id asc for share of l`,
      params,
    )
    const inactiveLocations = locations.rows.filter((row) => text(row.status).toUpperCase() !== 'ACTIVE').map((row) => text(row.location_id))
    if (inactiveLocations.length) {
      throw error(409, 'WORKFORCE_SCHEDULE_LOCATION_UNAVAILABLE', 'Co najmniej jeden obiekt nie jest aktywny w Grafiku.', { locationIds: inactiveLocations })
    }
    await lockObjectSources(orgId, locations.rows.map((row) => row.source_object_id))
  }

  async function listPublicationConflicts({ orgId, candidateShiftIds, from, to }) {
    const params = [orgId, candidateShiftIds, from, to]
    const candidateParams = [orgId, candidateShiftIds]
    const cte = effectiveScheduleCte()
    const staffing = await client.query(
      `${cte}
       select s.shift_id, count(a.person_id)::integer as assigned_count, s.required_headcount
         from schedule s
         left join public.workforce_schedule_shift_revision_assignee a
           on a.org_id = s.org_id and a.shift_id = s.shift_id and a.revision_no = s.revision_no
        where s.shift_id = any($2::text[])
        group by s.shift_id, s.required_headcount`,
      candidateParams,
    )
    const people = await client.query(
      `${cte}
       select s.shift_id, a.person_id, p.status
         from schedule s
         join public.workforce_schedule_shift_revision_assignee a
           on a.org_id = s.org_id and a.shift_id = s.shift_id and a.revision_no = s.revision_no
         left join public.workforce_schedule_person p
           on p.org_id = a.org_id and p.person_id = a.person_id
        where (s.shift_id = any($2::text[]) or s.business_date between $3::date and $4::date)
          and (p.person_id is null or p.status <> 'ACTIVE')`,
      params,
    )
    const locations = await client.query(
      `${cte}
       select s.shift_id, s.location_id
         from schedule s
         left join public.workforce_schedule_location l
           on l.org_id = s.org_id and l.location_id = s.location_id
        where (s.shift_id = any($2::text[]) or s.business_date between $3::date and $4::date)
          and (l.location_id is null or l.status <> 'ACTIVE')`,
      params,
    )
    const overlaps = await client.query(
      `${cte}, assignments as (
        select s.*, a.person_id
          from schedule s
          join public.workforce_schedule_shift_revision_assignee a
            on a.org_id = s.org_id and a.shift_id = s.shift_id and a.revision_no = s.revision_no
       )
       select left_side.shift_id, right_side.shift_id as other_shift_id, left_side.person_id
         from assignments left_side
         join assignments right_side
           on right_side.org_id = left_side.org_id
          and right_side.person_id = left_side.person_id
          and right_side.shift_id > left_side.shift_id
          and left_side.starts_at < right_side.ends_at
          and right_side.starts_at < left_side.ends_at
        where left_side.shift_id = any($2::text[]) or right_side.shift_id = any($2::text[])`,
      candidateParams,
    )
    const weekly = await client.query(
      `${cte}, assignments as (
        select s.*, a.person_id
          from schedule s
          join public.workforce_schedule_shift_revision_assignee a
            on a.org_id = s.org_id and a.shift_id = s.shift_id and a.revision_no = s.revision_no
       ), candidate_weeks as (
        select distinct date_trunc('week', business_date::timestamp)::date as week_start
          from schedule where shift_id = any($2::text[])
       )
       select a.person_id,
              date_trunc('week', a.business_date::timestamp)::date as week_start,
              floor(sum(extract(epoch from (a.ends_at - a.starts_at)) / 60 - a.break_minutes))::integer as minutes,
              settings.weekly_limit_minutes
         from assignments a
         join public.workforce_schedule_settings settings on settings.org_id = a.org_id
         join candidate_weeks cw on cw.week_start = date_trunc('week', a.business_date::timestamp)::date
        group by a.person_id, date_trunc('week', a.business_date::timestamp), settings.weekly_limit_minutes
       having sum(extract(epoch from (a.ends_at - a.starts_at)) / 60 - a.break_minutes) > settings.weekly_limit_minutes`,
      candidateParams,
    )

    const conflicts = []
    for (const row of staffing.rows) {
      const assigned = Number(row.assigned_count)
      const required = Number(row.required_headcount)
      if (assigned < required) conflicts.push({ type: 'UNDERSTAFFED', shiftId: text(row.shift_id), details: { assigned, required } })
      if (assigned > required) conflicts.push({ type: 'OVERSTAFFED', shiftId: text(row.shift_id), details: { assigned, required } })
    }
    for (const row of people.rows) conflicts.push({ type: row.status ? 'INACTIVE_PERSON' : 'MISSING_PERSON', shiftId: text(row.shift_id), personId: text(row.person_id) })
    for (const row of locations.rows) conflicts.push({ type: 'MISSING_LOCATION', shiftId: text(row.shift_id), details: { locationId: text(row.location_id) } })
    for (const row of overlaps.rows) conflicts.push({ type: 'OVERLAP', shiftId: text(row.shift_id), personId: text(row.person_id), details: { otherShiftId: text(row.other_shift_id) } })
    for (const row of weekly.rows) conflicts.push({ type: 'WEEKLY_LIMIT', personId: text(row.person_id), details: { weekStart: ymd(row.week_start), minutes: Number(row.minutes), limitMinutes: Number(row.weekly_limit_minutes) } })
    return conflicts
  }

  async function publish({ orgId, publicationId, from, to, timeZone, effects, warningFingerprint, warnings, actorUid, idempotencyKey, shifts }) {
    await client.query(
      `insert into public.workforce_schedule_publication (
         org_id, publication_id, period_start, period_end, time_zone, effects_json,
         warning_fingerprint, warnings_json, actor_uid, idempotency_key
       ) values ($1::text, $2::text, $3::date, $4::date, $5::text, $6::jsonb,
                 nullif($7::text, ''), $8::jsonb, $9::text, $10::text)`,
      [orgId, publicationId, from, to, timeZone, JSON.stringify(effects), warningFingerprint, JSON.stringify(warnings), actorUid, idempotencyKey],
    )
    for (const shift of shifts) {
      await client.query(
        `insert into public.workforce_schedule_publication_item
           (org_id, publication_id, shift_id, revision_no)
         values ($1::text, $2::text, $3::text, $4::integer)`,
        [orgId, publicationId, shift.shiftId, shift.revision],
      )
      const updated = await client.query(
        `update public.workforce_schedule_shift
            set published_revision_no = $4::integer,
                lifecycle_status = case when $5::boolean then 'ARCHIVED' else 'PUBLISHED' end,
                archived_at = case when $5::boolean then now() else null end,
                archived_by_uid = case when $5::boolean then $6::text else null end,
                version = version + 1, updated_at = now(), updated_by_uid = $6::text
          where org_id = $1::text and shift_id = $2::text and version = $3::integer
          returning version`,
        [orgId, shift.shiftId, shift.version, shift.revision, shift.isDeleted, actorUid],
      )
      if (!updated.rows[0]) {
        throw error(409, 'WORKFORCE_SCHEDULE_STALE_VERSION', 'Zmiana została zmieniona podczas publikacji.')
      }
    }
    return {
      publicationId,
      from,
      to,
      visibility: 'INTERNAL_ONLY',
      effects,
      published: shifts.map((shift) => ({
        shiftId: shift.shiftId,
        revision: shift.revision,
        version: shift.version + 1,
        archived: shift.isDeleted,
      })),
    }
  }

  return {
    appendAudit,
    archiveShift,
    bootstrap,
    claimCommand,
    completeCommand,
    listPublicationConflicts,
    lockOrganization,
    lockPublicationDependencies,
    lockPublicationScope,
    publish,
    readSettings,
    saveSettings,
    saveShift,
    schemaReady,
    setActorContext,
    setTenantContext,
    syncCatalogs,
  }
}

module.exports = {
  FORBIDDEN_PRIVILEGES,
  REQUIRED_COLUMNS,
  REQUIRED_FUNCTION_BODY_HASHES,
  REQUIRED_FUNCTION_RESULTS,
  REQUIRED_FUNCTIONS,
  REQUIRED_PRIVILEGES,
  REQUIRED_RELATIONS,
  RUNTIME_FUNCTIONS,
  SESSION_FUNCTIONS,
  SOURCE_RELATIONS,
  SOURCE_FORBIDDEN_PRIVILEGES,
  SOURCE_SELECT_RELATIONS,
  WORKFORCE_SCHEDULE_DB_ROLE,
  WORKFORCE_SCHEDULE_OWNER_ROLE,
  WORKFORCE_SCHEDULE_SCHEMA_MARKER,
  WORKFORCE_SCHEDULE_SESSION_ROLE,
  createWorkforceScheduleRepository,
  locationColors,
  mapLocation,
  mapPerson,
  mapShift,
}
