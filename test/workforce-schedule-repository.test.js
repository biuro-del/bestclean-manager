'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const {
  FORBIDDEN_PRIVILEGES,
  REQUIRED_COLUMNS,
  REQUIRED_FUNCTION_BODY_HASHES,
  REQUIRED_FUNCTION_RESULTS,
  REQUIRED_FUNCTIONS,
  REQUIRED_PRIVILEGES,
  REQUIRED_RELATIONS,
  RUNTIME_FUNCTIONS,
  SESSION_FUNCTIONS,
  SOURCE_FORBIDDEN_PRIVILEGES,
  SOURCE_RELATIONS,
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
} = require('../workforce-schedule-repository')

const root = path.join(__dirname, '..')
const repositorySource = fs.readFileSync(path.join(root, 'workforce-schedule-repository.js'), 'utf8')
const migrationSource = fs.readFileSync(
  path.join(root, 'dataconnect', 'migrations', '20260906_workforce_schedule_core_additive.sql'),
  'utf8',
)

test('repozytorium zna wyłącznie własny schemat rdzenia Grafiku', () => {
  assert.equal(REQUIRED_RELATIONS.length, 11)
  assert.ok(REQUIRED_RELATIONS.every((relation) => relation.startsWith('public.workforce_schedule_')))
  assert.deepEqual(SOURCE_RELATIONS, [
    'public.organizations',
    'public.organization_member',
    'public.organization_subscription',
    'public.worker',
    'public.client',
  ])
  assert.deepEqual(Object.keys(SOURCE_FORBIDDEN_PRIVILEGES), [
    'public.organizations',
    'public.organization_member',
    'public.organization_subscription',
    'public.worker',
    'public.client',
  ])
  assert.deepEqual(SOURCE_SELECT_RELATIONS, [])
  assert.deepEqual(SOURCE_FORBIDDEN_PRIVILEGES['public.worker'], [
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN',
  ])
  assert.deepEqual(
    SOURCE_FORBIDDEN_PRIVILEGES['public.client'],
    SOURCE_FORBIDDEN_PRIVILEGES['public.worker'],
  )
  assert.deepEqual(
    SOURCE_FORBIDDEN_PRIVILEGES['public.organization_member'],
    SOURCE_FORBIDDEN_PRIVILEGES['public.worker'],
  )
  assert.deepEqual(
    SOURCE_FORBIDDEN_PRIVILEGES['public.organization_subscription'],
    SOURCE_FORBIDDEN_PRIVILEGES['public.worker'],
  )
  assert.deepEqual(
    SOURCE_FORBIDDEN_PRIVILEGES['public.organizations'],
    SOURCE_FORBIDDEN_PRIVILEGES['public.worker'],
  )
  assert.equal(WORKFORCE_SCHEDULE_SCHEMA_MARKER, 'cleanzi.workforce_schedule.core.v1')
  assert.deepEqual(SESSION_FUNCTIONS, [
    'public.workforce_schedule_authorize_session(text,text)',
  ])
  assert.deepEqual(RUNTIME_FUNCTIONS, [
    'public.workforce_schedule_actor_is_active(text)',
    'public.workforce_schedule_read_active_workers(text)',
    'public.workforce_schedule_read_active_objects(text)',
    'public.workforce_schedule_lock_worker_sources(text,text[])',
    'public.workforce_schedule_lock_object_sources(text,text[])',
  ])
  assert.deepEqual(REQUIRED_FUNCTIONS, [...SESSION_FUNCTIONS, ...RUNTIME_FUNCTIONS])
  assert.deepEqual(Object.keys(REQUIRED_FUNCTION_BODY_HASHES), REQUIRED_FUNCTIONS)
  assert.deepEqual(Object.keys(REQUIRED_FUNCTION_RESULTS), REQUIRED_FUNCTIONS)
  assert.equal(WORKFORCE_SCHEDULE_SESSION_ROLE, 'workforce_schedule_session')
  assert.equal(WORKFORCE_SCHEDULE_DB_ROLE, 'workforce_schedule_app')
  assert.equal(WORKFORCE_SCHEDULE_OWNER_ROLE, 'workforce_schedule_owner')
})

test('fingerprinty funkcji SECURITY DEFINER odpowiadają dokładnym treściom migracji', () => {
  for (const signature of REQUIRED_FUNCTIONS) {
    const functionName = signature.match(/\.([a-z0-9_]+)\(/i)?.[1]
    assert.ok(functionName, `Brak nazwy funkcji w sygnaturze ${signature}`)
    const definition = migrationSource.match(new RegExp(
      `create function public\\.${functionName}\\([\\s\\S]*?\\)\\s*returns[\\s\\S]*?as \\$function\\$([\\s\\S]*?)\\$function\\$;`,
      'i',
    ))
    assert.ok(definition, `Brak definicji ${signature} w migracji`)
    const bodyHash = crypto.createHash('md5').update(definition[1], 'utf8').digest('hex')
    assert.equal(bodyHash, REQUIRED_FUNCTION_BODY_HASHES[signature], signature)
  }
})

test('mapowanie katalogów zachowuje stabilne ID i nie ujawnia loginu', () => {
  const person = mapPerson({
    person_id: 'person-1',
    source_worker_login: 'maria',
    source_worker_id_normalized: 'w066',
    display_name: 'Maria Czarnula',
    status: 'ACTIVE',
    version: 2,
  })
  const location = mapLocation({
    location_id: 'location-1',
    source_object_id: 'object-012',
    name: 'Edukatorium',
    status: 'ACTIVE',
    version: 3,
  })
  assert.equal(person.sourceWorkerLogin, '')
  assert.equal(person.sourceWorkerId, 'w066')
  assert.equal(location.sourceObjectId, 'object-012')
})

test('mapowanie zmiany zachowuje rewizję, wersję, obsadę i pełne czasy', () => {
  const shift = mapShift({
    shift_id: 'shift-1',
    title: 'Nocna',
    business_date: '2026-08-24',
    local_start_time: '22:00:00',
    local_end_time: '06:00:00',
    starts_at: '2026-08-24T20:00:00Z',
    ends_at: '2026-08-25T04:00:00Z',
    time_zone: 'Europe/Warsaw',
    break_minutes: 30,
    required_headcount: 2,
    location_id: 'location-1',
    person_ids: ['person-1', 'person-2'],
    instructions: ['A', 'B'],
    current_revision_no: 3,
    published_revision_no: 2,
    published_business_date: '2026-08-23',
    version: 4,
    lifecycle_status: 'CHANGED_AFTER_PUBLISH',
    is_deleted: false,
  })
  assert.equal(shift.revision, 3)
  assert.equal(shift.publishedRevision, 2)
  assert.equal(shift.publishedDate, '2026-08-23')
  assert.deepEqual(shift.personIds, ['person-1', 'person-2'])
  assert.equal(shift.endsAt, '2026-08-25T04:00:00.000Z')
})

test('kolor obiektu jest deterministyczny względem stabilnego object_id', () => {
  assert.deepEqual(locationColors('object-012'), locationColors('object-012'))
  assert.match(locationColors('object-012').color, /^#[0-9a-f]{6}$/i)
})

test('SQL Grafiku nie korzysta ze Zleceń, Kalendarza, QR ani ewidencji czasu', () => {
  const combined = `${repositorySource}\n${migrationSource}`
  for (const forbidden of [
    /public\.task\b/i,
    /public\.zone\b/i,
    /public\.workday\b/i,
    /public\.event\b/i,
    /public\.calendar\b/i,
    /schedule[-_ ]orders/i,
  ]) {
    assert.doesNotMatch(combined, forbidden)
  }
  assert.doesNotMatch(combined, /workforce_schedule_(?:request|outbox)/i)
})

test('kanoniczne źródła są dostępne tylko przez wąskie funkcje SECURITY DEFINER', () => {
  assert.doesNotMatch(
    repositorySource,
    /\b(?:from|join)\s+public\.(?:organizations|organization_member|organization_subscription|worker|client)\b/i,
  )
  assert.match(repositorySource, /from public\.workforce_schedule_read_active_workers\(\$1::text\)/i)
  assert.match(repositorySource, /from public\.workforce_schedule_read_active_objects\(\$1::text\)/i)
  assert.doesNotMatch(repositorySource, /(?:insert into|update|delete from) public\.(?:worker|client)\b/i)
  assert.doesNotMatch(migrationSource, /references public\.(?:worker|client)\b/i)
  assert.match(repositorySource, /source_worker_login/i)
  assert.match(repositorySource, /source_object_id/i)
  assert.doesNotMatch(repositorySource, /= p\.source_worker_login/i)
  assert.doesNotMatch(repositorySource, /= p\.source_auth_uid/i)
  assert.match(migrationSource, /create function public\.workforce_schedule_authorize_session\([\s\S]*?security definer[\s\S]*?from public\.organization_member member_source[\s\S]*?join public\.organizations organization_source[\s\S]*?left join public\.organization_subscription subscription_source[\s\S]*?left join public\.worker worker_source[\s\S]*?worker_source\.org_id = member_source\.org_id[\s\S]*?worker_source\.worker_id = member_source\.worker_id[\s\S]*?worker_source\.auth_uid = member_source\.uid[\s\S]*?worker_source\.active is true/i)
  assert.match(migrationSource, /case[\s\S]*?when worker_source\.worker_id is not null[\s\S]*?organization_source\.owner_worker_id = member_source\.worker_id then 'OWNER'/i)
  assert.match(migrationSource, /create function public\.workforce_schedule_actor_is_active\([\s\S]*?security definer[\s\S]*?from public\.organization_member member_source[\s\S]*?join public\.worker worker_source[\s\S]*?worker_source\.worker_id = member_source\.worker_id[\s\S]*?worker_source\.auth_uid = member_source\.uid[\s\S]*?worker_source\.active is true/i)
  assert.match(repositorySource, /function_signature = 'public\.workforce_schedule_actor_is_active\(text\)'[\s\S]*?organization_member'[\s\S]*?worker'/i)
  assert.match(migrationSource, /create function public\.workforce_schedule_read_active_workers\([\s\S]*?security definer[\s\S]*?from public\.worker worker_source[\s\S]*?worker_source\.active is true[\s\S]*?upper\(btrim\(worker_source\.status\)\) = 'ACTIVE'/i)
  assert.match(migrationSource, /create function public\.workforce_schedule_read_active_objects\([\s\S]*?security definer[\s\S]*?from public\.client object_source[\s\S]*?array\['ACTIVE', 'AKTYWNY'\]::text\[\]/i)
  assert.match(repositorySource, /row\.active === true[\s\S]*?\['ACTIVE', 'AKTYWNY'\]\.includes/i)
  assert.doesNotMatch(`${repositorySource}\n${migrationSource}`, /public\.facility_manager_object/i)
  assert.doesNotMatch(`${repositorySource}\n${migrationSource}`, /public\.service_object/i)
  assert.match(migrationSource, /source_worker_id_normalized varchar\(128\) not null/i)
  assert.match(migrationSource, /unique \(org_id, source_worker_id_normalized\)/i)
  assert.doesNotMatch(repositorySource, /w\.login is null/i)
  assert.match(repositorySource, /from public\.workforce_schedule_lock_worker_sources\(\$1::text, \$2::text\[\]\)/i)
  assert.match(repositorySource, /from public\.workforce_schedule_lock_object_sources\(\$1::text, \$2::text\[\]\)/i)
  assert.match(migrationSource, /create function public\.workforce_schedule_lock_worker_sources[\s\S]*?for share of worker_source/i)
  assert.match(migrationSource, /create function public\.workforce_schedule_lock_object_sources[\s\S]*?for share of object_source/i)
  assert.match(migrationSource, /security definer[\s\S]*?set search_path = pg_catalog\s/i)
  assert.doesNotMatch(migrationSource, /set search_path = pg_catalog, public/i)
  assert.match(migrationSource, /revoke all privileges on function[\s\S]*?from public, workforce_schedule_session/i)
  assert.match(migrationSource, /grant execute on function[\s\S]*?to workforce_schedule_app/i)
  assert.match(migrationSource, /workforce_schedule_owner needs SELECT and UPDATE[\s\S]*?FOR SHARE lock function/i)
  assert.match(migrationSource, /perform \*[\s\S]*?workforce_schedule_lock_worker_sources[\s\S]*?perform \*[\s\S]*?workforce_schedule_lock_object_sources/i)
  assert.match(repositorySource, /OWNER_SOURCE_PRIVILEGE/i)
  assert.doesNotMatch(migrationSource, /grant\s+update[\s\S]{0,200}public\.(?:worker|client)/i)
  assert.match(migrationSource, /current_setting\('cleanzi\.org_id', true\)/i)
  assert.match(migrationSource, /current_setting\('cleanzi\.actor_uid', true\)/i)
  assert.match(migrationSource, /grant execute on function[\s\S]*?workforce_schedule_authorize_session\(text, text\)[\s\S]*?to workforce_schedule_session/i)
})

test('SQL odrzuca START równy STOP, ale zachowuje zmianę nocną', () => {
  assert.match(migrationSource, /local_start_time <> local_end_time/i)
  assert.match(migrationSource, /ends_at > starts_at/i)
  assert.match(migrationSource, /ends_at at time zone time_zone\)::date in \(business_date, business_date \+ 1\)/i)
})

test('każda własna tabela ma tenantowy klucz i wymuszoną politykę RLS', () => {
  assert.doesNotMatch(migrationSource, /create\s+(?:unique\s+)?(?:table|index)\s+if\s+not\s+exists/i)
  for (const relation of REQUIRED_RELATIONS) {
    const table = relation.split('.')[1]
    assert.match(
      migrationSource,
      new RegExp(`create table public\\.${table} \\([\\s\\S]*?primary key \\([^)]*org_id`, 'i'),
      `${table} musi mieć org_id w primary key`,
    )
    assert.match(migrationSource, new RegExp(`'${table}'`))
    assert.ok(REQUIRED_COLUMNS[relation]?.includes('org_id'))
    assert.ok(Array.isArray(REQUIRED_PRIVILEGES[relation]))
    assert.ok(FORBIDDEN_PRIVILEGES[relation]?.includes('MAINTAIN'))
  }
  assert.match(migrationSource, /enable row level security/i)
  assert.match(migrationSource, /force row level security/i)
  assert.match(migrationSource, /current_setting\(''cleanzi\.org_id'', true\)/i)
  assert.match(migrationSource, /create function public\.workforce_schedule_actor_is_active\([\s\S]*?current_setting\('cleanzi\.actor_uid', true\)/i)
  assert.match(migrationSource, /using \([\s\S]*?workforce_schedule_actor_is_active\(org_id\)[\s\S]*?with check/i)
  assert.match(repositorySource, /set_config\('cleanzi\.org_id'/i)
  assert.match(repositorySource, /set_config\('cleanzi\.actor_uid'/i)
  assert.match(repositorySource, /regexp_replace\(lower\(policy\.qual\), '\[\[:space:\]\(\)\]'/i)
  assert.match(repositorySource, /workforce_schedule_actor_is_activeorg_id/i)
  assert.doesNotMatch(repositorySource, /position\('cleanzi\.org_id' in coalesce\(policy\.qual/i)
})

test('runtime ma minimalne uprawnienia i nie może usuwać historii', () => {
  assert.doesNotMatch(migrationSource, /grant\s+delete/i)
  assert.match(migrationSource, /revoke all privileges[\s\S]*from public, workforce_schedule_session/i)
  assert.match(migrationSource, /privilege\.is_grantable/i)
  assert.match(migrationSource, /inherits a privileged database role/i)
  assert.match(repositorySource, /runtime:GRANT_OPTION/i)
  assert.match(repositorySource, /runtime:PRIVILEGED_MEMBERSHIP/i)
  assert.match(repositorySource, /runtime:SCHEMA_USAGE/i)
  assert.match(repositorySource, /runtime:SCHEMA_CREATE/i)
  assert.match(migrationSource, /workforce_schedule_session membership in workforce_schedule_app must be SET TRUE, INHERIT FALSE, ADMIN FALSE/i)
  assert.match(migrationSource, /Role % must be restricted NOLOGIN NOINHERIT/i)
  assert.match(migrationSource, /set local role workforce_schedule_owner/i)
  assert.match(migrationSource, /grant select, insert, update on table[\s\S]*?to workforce_schedule_app/i)
  assert.doesNotMatch(migrationSource, /grant create on schema public/i)
  assert.match(migrationSource, /not has_schema_privilege\('workforce_schedule_app', 'public', 'USAGE'\)/i)
  assert.match(repositorySource, /not has_schema_privilege\(current_user, 'public', 'CREATE'\)/i)
  assert.match(migrationSource, /must not have source privilege % on public\.%/i)
  assert.match(migrationSource, /Runtime\/session source boundary postflight failed/i)
  assert.match(repositorySource, /has_any_column_privilege\(current_user,[\s\S]*?required\.privilege_name\)/i)
  assert.match(repositorySource, /has_any_column_privilege\(session_user,[\s\S]*?required_privilege\.privilege_name\)/i)
  assert.match(migrationSource, /has_any_column_privilege\('workforce_schedule_app',[\s\S]*?privilege_name\)/i)
  assert.doesNotMatch(
    migrationSource,
    /revoke[\s\S]{0,80}on table[\s\S]{0,160}public\.(?:worker|client)\b/i,
  )
  assert.match(repositorySource, /end as exact_acl[\s\S]*?FUNCTION_ACL/i)
  assert.match(migrationSource, /pg_has_role\('workforce_schedule_session', function_row\.proowner, 'MEMBER'\)[\s\S]*?pg_has_role\('workforce_schedule_session', function_row\.proowner, 'SET'\)/i)
  assert.doesNotMatch(repositorySource, /portal_app/i)
  assert.match(migrationSource, /to_regrole\('portal_app'\)[\s\S]*?revoke all privileges/i)
  assert.doesNotMatch(migrationSource, /grant[^;]*\bto\s+portal_app\b/i)
  assert.match(migrationSource, /SESSION_ROLE_GRAPH_MISMATCH[\s\S]*?session may SET only workforce_schedule_app/i)
  assert.match(migrationSource, /APP_ROLE_GRAPH_MISMATCH[\s\S]*?must not be a member of another role/i)
  assert.match(migrationSource, /with recursive set_reachable[\s\S]*?where roleid <> \(select oid from pg_roles where rolname = 'workforce_schedule_app'\)/i)
  assert.match(repositorySource, /exact_session_role_graph[\s\S]*?exact_session_set_graph[\s\S]*?empty_runtime_role_graph/i)
  assert.match(repositorySource, /runtime:SESSION_ROLE_GRAPH/i)
  assert.match(repositorySource, /runtime:SESSION_SET_GRAPH/i)
  assert.match(repositorySource, /runtime:APP_ROLE_GRAPH/i)
})

test('migracja i readiness wymuszaja dokladna allowliste funkcji Grafiku', () => {
  assert.match(migrationSource, /Refuse every pre-existing schedule function, including unknown overloads/i)
  assert.match(migrationSource, /from pg_proc function_row[\s\S]*?proname like 'workforce\\_schedule\\_%'/i)
  assert.doesNotMatch(migrationSource.slice(0, migrationSource.indexOf('set local role workforce_schedule_owner')), /to_regprocedure\(target_function\)/i)
  assert.match(migrationSource, /count\(\*\) <> 6[\s\S]*?WORKFORCE_SCHEDULE_FUNCTION_ALLOWLIST_POSTFLIGHT_FAILED/i)
  assert.match(migrationSource, /function_row\.proconfig = array\['search_path=pg_catalog'\]/i)
  assert.match(migrationSource, /function_row\.prokind = 'f' and not function_row\.proleakproof/i)
  assert.match(repositorySource, /as function_count[\s\S]*?as only_allowed[\s\S]*?runtime:FUNCTION_ALLOWLIST/i)
  assert.match(repositorySource, /target\.proconfig = array\['search_path=pg_catalog'\]/i)
  assert.match(repositorySource, /target\.prolang = \(select oid from pg_language where lanname = 'sql'\)/i)
})

function createSchemaReadyClient({
  grantOption = false,
  directSessionAcl = false,
  unexpectedTableAcl = false,
  unexpectedColumnAcl = false,
  privilegedMembership = false,
  ownerSourceReady = true,
  functionAclReady = true,
  functionOwnerMembership = false,
  unexpectedFunctionExecute = false,
  schemaUsage = true,
  sourcePrivilege = '',
  sessionSchedulePrivilege = false,
  scheduleColumnPrivilege = false,
  expectedOwner = true,
  policyCountReady = true,
  policyReady = true,
  noUserTriggers = true,
  functionAllowlistReady = true,
  functionDefinitionReady = true,
  functionBodyStorageReady = true,
  functionResultReady = true,
  functionTraitsReady = true,
  exactSessionRoleGraph = true,
  exactSessionSetGraph = true,
  emptyRuntimeRoleGraph = true,
} = {}) {
  return {
    async query(sql, params = []) {
      if (/select session_user = \$1::text as session_role/.test(sql)) {
        assert.deepEqual(params, [WORKFORCE_SCHEDULE_SESSION_ROLE, WORKFORCE_SCHEDULE_DB_ROLE])
        return {
          rows: [{
            session_role: true,
            runtime_role: true,
            schema_usage: schemaUsage,
            no_schema_create: true,
          }],
        }
      }
      if (/policy_count_ready/.test(sql) && /no_user_triggers/.test(sql)) {
        assert.equal(params[1], WORKFORCE_SCHEDULE_OWNER_ROLE)
        assert.equal(params[2], WORKFORCE_SCHEDULE_DB_ROLE)
        return {
          rows: params[0].map((relationName) => ({
            relation_name: relationName,
            relation_ready: true,
            expected_owner: expectedOwner,
            rls_enabled: true,
            rls_forced: true,
            no_user_triggers: noUserTriggers,
            policy_count_ready: policyCountReady,
            policy_ready: policyReady,
          })),
        }
      }
      if (/from jsonb_to_recordset\(\$1::jsonb\)[\s\S]*column_name text/.test(sql)) {
        assert.equal(typeof params[0], 'string')
        return { rows: JSON.parse(params[0]).map((requirement) => ({ ...requirement, ready: true })) }
      }
      if (/from jsonb_to_recordset\(\$1::jsonb\)[\s\S]*privilege_name text/.test(sql)) {
        assert.equal(typeof params[0], 'string')
        const forbidden = /as excessive/.test(sql)
        const requirements = JSON.parse(params[0])
        const sourceBoundary = requirements.some(({ relation_name: relationName }) => (
          SOURCE_RELATIONS.includes(relationName)
        ))
        return {
          rows: requirements.map((requirement) => ({
            ...requirement,
            ready: !forbidden,
            excessive: Boolean(
              forbidden
              && sourceBoundary
              && sourcePrivilege
              && requirement.privilege_name === sourcePrivilege
            ) || (
              forbidden
              && scheduleColumnPrivilege
              && requirement.relation_name === 'public.workforce_schedule_shift_revision'
              && requirement.privilege_name === 'UPDATE'
            ),
          })),
        }
      }
      if (/relation_acl as/.test(sql) && /direct_session_acl/.test(sql)) {
        assert.ok(Array.isArray(params[0]))
        assert.equal(typeof params[1], 'string')
        assert.deepEqual(
          JSON.parse(params[1]),
          Object.entries(REQUIRED_PRIVILEGES).flatMap(([relationName, privileges]) => (
            privileges.map((privilegeName) => ({
              relation_name: relationName,
              privilege_name: privilegeName,
            }))
          )),
        )
        return {
          rows: [{
            excessive: grantOption,
            unexpected_table_acl: unexpectedTableAcl,
            unexpected_column_acl: unexpectedColumnAcl,
            direct_session_acl: directSessionAcl,
          }],
        }
      }
      if (/to_regclass\(required\.relation_name\) is not null as relation_ready/.test(sql)) {
        return {
          rows: params[0].map((relationName) => ({
            relation_name: relationName,
            relation_ready: true,
          })),
        }
      }
      if (/as function_count/.test(sql) && /as only_allowed/.test(sql)) {
        assert.deepEqual(params, [REQUIRED_FUNCTIONS])
        return {
          rows: [{
            function_count: functionAllowlistReady ? REQUIRED_FUNCTIONS.length : REQUIRED_FUNCTIONS.length + 1,
            only_allowed: functionAllowlistReady,
          }],
        }
      }
      if (/from unnest\(\$1::text\[\], \$4::text\[\], \$5::text\[\]\)/.test(sql)) {
        assert.equal(params[1], WORKFORCE_SCHEDULE_OWNER_ROLE)
        assert.deepEqual(params[2], SESSION_FUNCTIONS)
        assert.deepEqual(params[3], REQUIRED_FUNCTIONS.map((signature) => REQUIRED_FUNCTION_BODY_HASHES[signature]))
        assert.deepEqual(params[4], REQUIRED_FUNCTIONS.map((signature) => REQUIRED_FUNCTION_RESULTS[signature]))
        return {
          rows: params[0].map((functionSignature) => ({
            function_signature: functionSignature,
            function_ready: true,
            security_definer: true,
            expected_owner: expectedOwner,
            fixed_search_path: true,
            safe_function_kind: functionTraitsReady,
            expected_language: functionTraitsReady,
            expected_body_storage: functionBodyStorageReady,
            expected_body: functionDefinitionReady,
            expected_result: functionResultReady,
            expected_volatility: functionTraitsReady,
            execute_ready: true,
            unexpected_execute: unexpectedFunctionExecute,
            no_owner_membership: !functionOwnerMembership,
            owner_source_ready: ownerSourceReady,
            no_public_execute: true,
            exact_acl: functionAclReady,
          })),
        }
      }
      if (/session_user = \$2::text as session_role/.test(sql)) {
        assert.deepEqual(params.slice(1, 4), [
          WORKFORCE_SCHEDULE_SESSION_ROLE,
          WORKFORCE_SCHEDULE_DB_ROLE,
          WORKFORCE_SCHEDULE_OWNER_ROLE,
        ])
        assert.deepEqual(params[4], [...REQUIRED_RELATIONS, ...SOURCE_RELATIONS])
        assert.deepEqual(params[5], RUNTIME_FUNCTIONS)
        return {
          rows: [{
            session_role: true,
            restricted_session_role: true,
            runtime_role: true,
            restricted_role: true,
            role_switch_ready: true,
            role_switch_exact: true,
            exact_session_role_graph: exactSessionRoleGraph,
            exact_session_set_graph: exactSessionSetGraph,
            empty_runtime_role_graph: emptyRuntimeRoleGraph,
            no_inherited_runtime: true,
            no_privileged_membership: !privilegedMembership,
            session_no_privileged_membership: true,
            restricted_owner: true,
            owner_no_privileged_membership: true,
            no_owner_membership: true,
            session_no_schedule_privileges: !sessionSchedulePrivilege,
            session_no_function_execute: true,
            schema_usage: schemaUsage,
            no_schema_create: true,
            marker_ready: true,
          }],
        }
      }
      throw new Error(`Unexpected schema readiness query: ${sql}`)
    },
  }
}

test('schemaReady akceptuje ograniczone konto runtime bez grant option', async () => {
  const repository = createWorkforceScheduleRepository(createSchemaReadyClient())
  assert.deepEqual(await repository.schemaReady(), { ready: true, missing: [] })
})

test('schemaReady blokuje dziedziczone role uprzywilejowane i grant option', async () => {
  const repository = createWorkforceScheduleRepository(createSchemaReadyClient({
    grantOption: true,
    privilegedMembership: true,
  }))
  const result = await repository.schemaReady()
  assert.equal(result.ready, false)
  assert.ok(result.missing.includes('runtime:GRANT_OPTION'))
  assert.ok(result.missing.includes('runtime:PRIVILEGED_MEMBERSHIP'))
})

test('schemaReady blokuje dodatkowa funkcje lub overload spoza allowlisty', async () => {
  const repository = createWorkforceScheduleRepository(createSchemaReadyClient({
    functionAllowlistReady: false,
  }))
  const result = await repository.schemaReady()
  assert.equal(result.ready, false)
  assert.ok(result.missing.includes('runtime:FUNCTION_ALLOWLIST'))
})

test('schemaReady blokuje drift cech funkcji SECURITY DEFINER', async () => {
  const repository = createWorkforceScheduleRepository(createSchemaReadyClient({
    functionTraitsReady: false,
  }))
  const result = await repository.schemaReady()
  assert.equal(result.ready, false)
  assert.ok(result.missing.some((item) => item.endsWith(':FUNCTION_KIND')))
  assert.ok(result.missing.some((item) => item.endsWith(':LANGUAGE')))
  assert.ok(result.missing.some((item) => item.endsWith(':VOLATILITY')))
})

test('schemaReady blokuje drift treści funkcji SECURITY DEFINER', async () => {
  const repository = createWorkforceScheduleRepository(createSchemaReadyClient({
    functionDefinitionReady: false,
  }))
  const result = await repository.schemaReady()
  assert.equal(result.ready, false)
  assert.ok(result.missing.every((item) => item.endsWith(':DEFINITION')))
})

test('schemaReady blokuje zmianę sposobu przechowywania ciała funkcji SECURITY DEFINER', async () => {
  const repository = createWorkforceScheduleRepository(createSchemaReadyClient({
    functionBodyStorageReady: false,
  }))
  const result = await repository.schemaReady()
  assert.equal(result.ready, false)
  assert.ok(result.missing.every((item) => item.endsWith(':SQL_BODY_STORAGE')))
})

test('schemaReady blokuje drift kontraktu zwracanego przez funkcję SECURITY DEFINER', async () => {
  const repository = createWorkforceScheduleRepository(createSchemaReadyClient({
    functionResultReady: false,
  }))
  const result = await repository.schemaReady()
  assert.equal(result.ready, false)
  assert.ok(result.missing.every((item) => item.endsWith(':RESULT')))
})

test('schemaReady blokuje dodatkowe krawedzie grafu SET ROLE', async () => {
  const sessionDrift = await createWorkforceScheduleRepository(createSchemaReadyClient({
    exactSessionRoleGraph: false,
    exactSessionSetGraph: false,
  })).schemaReady()
  assert.equal(sessionDrift.ready, false)
  assert.ok(sessionDrift.missing.includes('runtime:SESSION_ROLE_GRAPH'))
  assert.ok(sessionDrift.missing.includes('runtime:SESSION_SET_GRAPH'))

  const appDrift = await createWorkforceScheduleRepository(createSchemaReadyClient({
    emptyRuntimeRoleGraph: false,
  })).schemaReady()
  assert.equal(appDrift.ready, false)
  assert.ok(appDrift.missing.includes('runtime:APP_ROLE_GRAPH'))
})

test('schemaReady blokuje funkcję, której owner utracił wymagany dostęp do źródła', async () => {
  const repository = createWorkforceScheduleRepository(createSchemaReadyClient({ ownerSourceReady: false }))
  const result = await repository.schemaReady()
  assert.equal(result.ready, false)
  assert.ok(result.missing.some((item) => item.endsWith(':OWNER_SOURCE_PRIVILEGE')))
})

test('schemaReady blokuje dziedziczony EXECUTE WITH GRANT OPTION funkcji', async () => {
  const repository = createWorkforceScheduleRepository(createSchemaReadyClient({ functionAclReady: false }))
  const result = await repository.schemaReady()
  assert.equal(result.ready, false)
  assert.ok(result.missing.some((item) => item.endsWith(':FUNCTION_ACL')))
  assert.match(repositorySource, /privilege\.privilege_type <> 'EXECUTE' or privilege\.is_grantable/i)
})

test('schemaReady blokuje wykonanie funkcji przez niewłaściwą rolę', async () => {
  const repository = createWorkforceScheduleRepository(createSchemaReadyClient({
    unexpectedFunctionExecute: true,
  }))
  const result = await repository.schemaReady()
  assert.equal(result.ready, false)
  assert.ok(result.missing.some((item) => item.endsWith(':UNEXPECTED_EXECUTE')))
})

test('schemaReady blokuje MEMBER lub SET do ownera SECURITY DEFINER', async () => {
  const repository = createWorkforceScheduleRepository(createSchemaReadyClient({ functionOwnerMembership: true }))
  const result = await repository.schemaReady()
  assert.equal(result.ready, false)
  assert.ok(result.missing.some((item) => item.endsWith(':OWNER_MEMBERSHIP')))
  assert.match(repositorySource, /pg_has_role\(current_user, target\.proowner, 'MEMBER'\)[\s\S]*?pg_has_role\(current_user, target\.proowner, 'SET'\)/i)
})

test('schemaReady blokuje runtime po utracie USAGE na schema public', async () => {
  const repository = createWorkforceScheduleRepository(createSchemaReadyClient({ schemaUsage: false }))
  const result = await repository.schemaReady()
  assert.equal(result.ready, false)
  assert.ok(result.missing.includes('runtime:SCHEMA_USAGE'))
})

test('schemaReady blokuje zapis runtime do kanonicznych katalogów', async () => {
  const repository = createWorkforceScheduleRepository(createSchemaReadyClient({ sourcePrivilege: 'UPDATE' }))
  const result = await repository.schemaReady()
  assert.equal(result.ready, false)
  assert.ok(result.missing.includes('public.worker:UPDATE:EXCESS'))
})

test('schemaReady blokuje surowy SELECT runtime do kanonicznych katalogów', async () => {
  const repository = createWorkforceScheduleRepository(createSchemaReadyClient({ sourcePrivilege: 'SELECT' }))
  const result = await repository.schemaReady()
  assert.equal(result.ready, false)
  assert.ok(result.missing.includes('public.organizations:SELECT:EXCESS'))
  assert.ok(result.missing.includes('public.organization_subscription:SELECT:EXCESS'))
  assert.ok(result.missing.includes('public.client:SELECT:EXCESS'))
})

test('schemaReady blokuje bezpośrednie uprawnienia sesji do tabel', async () => {
  const repository = createWorkforceScheduleRepository(createSchemaReadyClient({
    sessionSchedulePrivilege: true,
  }))
  const result = await repository.schemaReady()
  assert.equal(result.ready, false)
  assert.ok(result.missing.includes('runtime:SESSION_SCHEDULE_PRIVILEGE'))
})

test('schemaReady blokuje uprawnienie kolumnowe omijające append-only', async () => {
  const repository = createWorkforceScheduleRepository(createSchemaReadyClient({
    scheduleColumnPrivilege: true,
  }))
  const result = await repository.schemaReady()
  assert.equal(result.ready, false)
  assert.ok(result.missing.includes('public.workforce_schedule_shift_revision:UPDATE:EXCESS'))
})

test('schemaReady blokuje dodatkową politykę RLS i trigger użytkownika', async () => {
  const repository = createWorkforceScheduleRepository(createSchemaReadyClient({
    policyCountReady: false,
    noUserTriggers: false,
  }))
  const result = await repository.schemaReady()
  assert.equal(result.ready, false)
  assert.ok(result.missing.includes('public.workforce_schedule_settings:POLICY'))
  assert.ok(result.missing.includes('public.workforce_schedule_settings:TRIGGER'))
})

test('schemaReady blokuje bezpośrednie ACL roli workforce_schedule_session', async () => {
  const repository = createWorkforceScheduleRepository(createSchemaReadyClient({ directSessionAcl: true }))
  const result = await repository.schemaReady()
  assert.equal(result.ready, false)
  assert.ok(result.missing.includes('runtime:DIRECT_SESSION_ACL'))
})

test('schemaReady blokuje nieoczekiwane tabelowe i kolumnowe ACL Grafiku', async () => {
  const repository = createWorkforceScheduleRepository(createSchemaReadyClient({
    unexpectedTableAcl: true,
    unexpectedColumnAcl: true,
  }))
  const result = await repository.schemaReady()
  assert.equal(result.ready, false)
  assert.ok(result.missing.includes('runtime:TABLE_ACL'))
  assert.ok(result.missing.includes('runtime:COLUMN_ACL'))
  assert.match(repositorySource, /allowed_runtime_acl[\s\S]*?unexpected_table_acl/i)
  assert.match(repositorySource, /true as is_column_acl[\s\S]*?unexpected_column_acl/i)
})

test('komendy i publikacje zapisują dokładny kontrakt zerowych efektów', () => {
  const exactEffects = /effects_json\s*=\s*'\{"delivery": false, "notifications": false, "downstream": false\}'::jsonb/i
  assert.equal((migrationSource.match(new RegExp(exactEffects.source, 'gi')) || []).length, 2)
  assert.match(repositorySource, /effects_json/i)
  assert.doesNotMatch(repositorySource, /workforce_schedule_outbox|insert into public\.(?:task|event|workday)/i)
})

test('bootstrap dołącza wyłącznie nieaktywne snapshoty referencjonowane w widocznym zakresie', async () => {
  const calls = []
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params })
      if (/from public\.workforce_schedule_settings/i.test(sql)) {
        return { rows: [{ org_id: 'bestclean', time_zone: 'Europe/Warsaw', weekly_limit_minutes: 2400, version: 1 }] }
      }
      if (/from public\.workforce_schedule_shift h/i.test(sql)) {
        return { rows: [{
          shift_id: 'shift-1',
          lifecycle_status: 'DRAFT',
          current_revision_no: 1,
          published_revision_no: null,
          version: 1,
          revision_no: 1,
          business_date: '2026-09-07',
          title: 'Zmiana historyczna',
          local_start_time: '08:00:00',
          local_end_time: '16:00:00',
          starts_at: '2026-09-07T06:00:00.000Z',
          ends_at: '2026-09-07T14:00:00.000Z',
          time_zone: 'Europe/Warsaw',
          break_minutes: 0,
          required_headcount: 2,
          location_id: 'location-inactive-ref',
          person_ids: ['person-active', 'person-inactive-ref'],
          instructions: [],
          is_deleted: false,
        }] }
      }
      if (/from public\.workforce_schedule_publication/i.test(sql)) return { rows: [] }
      if (/select\s+\(select \(count\(\*\) filter/i.test(sql)) {
        return { rows: [{
          active_people: 1,
          inactive_people: 2,
          active_locations: 1,
          inactive_locations: 2,
          last_synced_at: '2026-09-07T07:55:00.000Z',
        }] }
      }
      if (/select person_id, source_worker_id_normalized/i.test(sql)) {
        return { rows: [
          { person_id: 'person-active', source_worker_id_normalized: 'w001', display_name: 'Aktywna Osoba', status: 'ACTIVE', version: 1 },
          { person_id: 'person-inactive-ref', source_worker_id_normalized: 'w002', source_worker_login: 'hidden-login', source_auth_uid: 'hidden-uid', display_name: 'Historyczna Osoba', status: 'INACTIVE', version: 2 },
        ] }
      }
      if (/select location_id, source_object_id/i.test(sql)) {
        return { rows: [
          { location_id: 'location-active', source_object_id: 'object-1', name: 'Aktywny obiekt', status: 'ACTIVE', version: 1 },
          { location_id: 'location-inactive-ref', source_object_id: 'object-2', name: 'Historyczny obiekt', status: 'INACTIVE', version: 2 },
        ] }
      }
      return { rows: [] }
    },
  }
  const repository = createWorkforceScheduleRepository(client)

  const result = await repository.bootstrap({
    orgId: 'bestclean',
    from: '2026-09-07',
    to: '2026-09-07',
  })

  assert.deepEqual(result.people.map(({ personId, status }) => ({ personId, status })), [
    { personId: 'person-active', status: 'ACTIVE' },
    { personId: 'person-inactive-ref', status: 'INACTIVE' },
  ])
  assert.deepEqual(result.locations.map(({ locationId, status }) => ({ locationId, status })), [
    { locationId: 'location-active', status: 'ACTIVE' },
    { locationId: 'location-inactive-ref', status: 'INACTIVE' },
  ])
  assert.deepEqual(result.catalogSync, {
    lastSyncedAt: '2026-09-07T07:55:00.000Z',
    people: { active: 1, inactive: 2 },
    locations: { active: 1, inactive: 2 },
  })
  const peopleRead = calls.find(({ sql }) => /select person_id, source_worker_id_normalized/i.test(sql))
  const locationRead = calls.find(({ sql }) => /select location_id, source_object_id/i.test(sql))
  assert.deepEqual(peopleRead.params, ['bestclean', '', ['person-active', 'person-inactive-ref']])
  assert.deepEqual(locationRead.params, ['bestclean', ['location-inactive-ref']])
  assert.match(peopleRead.sql, /status = 'INACTIVE' and person_id = any\(\$3::text\[\]\)/i)
  assert.match(locationRead.sql, /status = 'INACTIVE' and location_id = any\(\$2::text\[\]\)/i)
  assert.doesNotMatch(peopleRead.sql, /source_worker_login|source_auth_uid/i)
  assert.doesNotMatch(JSON.stringify(result), /hidden-login|hidden-uid/)
  const catalogStateRead = calls.find(({ sql }) => /select\s+\(select \(count\(\*\) filter/i.test(sql))
  assert.match(catalogStateRead.sql, /command_type = 'SYNC_CATALOGS'/i)
  assert.match(catalogStateRead.sql, /command\.status = 'COMPLETED'/i)
  assert.match(catalogStateRead.sql, /response_json #>> '\{receipt,synchronizedAt\}'/i)
})

test('synchronizacja zwraca wyłącznie licznikowy diff bez danych katalogowych', async () => {
  const client = {
    async query(sql) {
      if (/from public\.workforce_schedule_read_active_workers/i.test(sql)) {
        return { rows: [
          { source_worker_id_normalized: 'w001', source_worker_login: 'new-login', source_auth_uid: 'new-uid', display_name: 'Nowa nazwa', role_snapshot: 'WORKER' },
          { source_worker_id_normalized: 'w002', source_worker_login: 'second-login', source_auth_uid: 'second-uid', display_name: 'Druga osoba', role_snapshot: 'WORKER' },
        ] }
      }
      if (/select \* from public\.workforce_schedule_person/i.test(sql)) {
        return { rows: [
          { person_id: 'person-1', source_worker_id_normalized: 'w001', source_worker_login: 'old-login', source_auth_uid: 'old-uid', display_name: 'Stara nazwa', initials: 'SN', role_snapshot: 'WORKER', status: 'ACTIVE' },
        ] }
      }
      if (/from public\.workforce_schedule_read_active_objects/i.test(sql)) {
        return { rows: [
          { source_object_id: 'object-1', display_name: 'Nowa nazwa obiektu' },
          { source_object_id: 'object-2', display_name: 'Nowy obiekt' },
        ] }
      }
      if (/select \* from public\.workforce_schedule_location/i.test(sql)) {
        return { rows: [
          { location_id: 'location-1', source_object_id: 'object-1', name: 'Stara nazwa obiektu', short_name: 'Stara nazwa obiektu', color: '#2563eb', soft_color: '#dbeafe', status: 'ACTIVE' },
        ] }
      }
      if (/select transaction_timestamp\(\) as synchronized_at/i.test(sql)) {
        return { rows: [{ synchronized_at: '2026-09-07T09:30:00.000Z' }] }
      }
      return { rows: [] }
    },
  }
  let nextPerson = 1
  let nextLocation = 1
  const result = await createWorkforceScheduleRepository(client).syncCatalogs({
    orgId: 'bestclean',
    actorUid: 'admin-1',
    createPersonId: () => `person-new-${nextPerson++}`,
    createLocationId: () => `location-new-${nextLocation++}`,
  })

  assert.deepEqual(result, {
    synchronizedAt: '2026-09-07T09:30:00.000Z',
    people: { active: 2, created: 1, updated: 1, deactivated: 0 },
    locations: { active: 2, created: 1, updated: 1, deactivated: 0 },
  })
  assert.doesNotMatch(JSON.stringify(result), /login|uid|Nowa nazwa|object-|person-/i)
})

test('niepełny odczyt źródłowy nie dezaktywuje aktywnego katalogu ani nie wykonuje zapisu', async () => {
  const calls = []
  const peopleRepository = createWorkforceScheduleRepository({
    async query(sql) {
      calls.push(sql)
      if (/from public\.workforce_schedule_read_active_workers/i.test(sql)) {
        return { rows: [{ source_worker_id_normalized: 'w001', display_name: 'Osoba 1' }] }
      }
      if (/select \* from public\.workforce_schedule_person/i.test(sql)) {
        return { rows: [
          { person_id: 'person-1', source_worker_id_normalized: 'w001', status: 'ACTIVE' },
          { person_id: 'person-2', source_worker_id_normalized: 'w002', status: 'ACTIVE' },
        ] }
      }
      return { rows: [] }
    },
  })

  await assert.rejects(
    peopleRepository.syncCatalogs({
      orgId: 'bestclean',
      actorUid: 'admin-1',
      createPersonId: () => 'unused-person',
      createLocationId: () => 'unused-location',
    }),
    (caught) => caught.code === 'WORKFORCE_SCHEDULE_ROSTER_DEACTIVATION_BLOCKED'
      && caught.details?.activeCount === 2
      && caught.details?.deactivationCount === 1
      && caught.details?.sourceCount === 1,
  )
  assert.equal(calls.some((sql) => /insert into public\.workforce_schedule_person|update public\.workforce_schedule_person/i.test(sql)), false)

  const locationCalls = []
  const locationRepository = createWorkforceScheduleRepository({
    async query(sql) {
      locationCalls.push(sql)
      if (/from public\.workforce_schedule_read_active_workers/i.test(sql)) {
        return { rows: [{ source_worker_id_normalized: 'w003', display_name: 'Nowa osoba' }] }
      }
      if (/select \* from public\.workforce_schedule_person/i.test(sql)) return { rows: [] }
      if (/select distinct p\.person_id, h\.shift_id/i.test(sql)) return { rows: [] }
      if (/from public\.workforce_schedule_read_active_objects/i.test(sql)) {
        return { rows: [{ source_object_id: 'object-1', display_name: 'Obiekt 1' }] }
      }
      if (/select \* from public\.workforce_schedule_location/i.test(sql)) {
        return { rows: [
          { location_id: 'location-1', source_object_id: 'object-1', status: 'ACTIVE' },
          { location_id: 'location-2', source_object_id: 'object-2', status: 'ACTIVE' },
        ] }
      }
      return { rows: [] }
    },
  })

  await assert.rejects(
    locationRepository.syncCatalogs({
      orgId: 'bestclean',
      actorUid: 'admin-1',
      createPersonId: () => 'unused-person',
      createLocationId: () => 'unused-location',
    }),
    (caught) => caught.code === 'WORKFORCE_SCHEDULE_OBJECT_DEACTIVATION_BLOCKED'
      && caught.details?.activeCount === 2
      && caught.details?.deactivationCount === 1
      && caught.details?.sourceCount === 1,
  )
  assert.equal(locationCalls.some((sql) => (
    /insert into public\.workforce_schedule_person|update public\.workforce_schedule_person/i.test(sql)
    || /insert into public\.workforce_schedule_location|update public\.workforce_schedule_location/i.test(sql)
  )), false)
})

test('nieaktywne snapshoty pozostają niedostępne dla nowych przypisań', () => {
  assert.match(repositorySource, /assertActiveLocation[\s\S]*status = 'ACTIVE'[\s\S]*for share of l/i)
  assert.match(repositorySource, /assertActivePeople[\s\S]*p\.status = 'ACTIVE'[\s\S]*for share of p/i)
  assert.match(repositorySource, /saveShift[\s\S]*assertActiveLocation[\s\S]*assertActivePeople/i)
})

test('synchronizacja używa stabilnych ID źródłowych, nie nazwy ani adresu', async () => {
  const calls = []
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params })
      if (/from public\.workforce_schedule_read_active_workers/i.test(sql)) {
        return { rows: [{
          source_worker_login: 'maria',
          source_worker_id_normalized: 'w066',
          source_auth_uid: 'uid-maria',
          display_name: 'Maria Czarnula',
          role_snapshot: 'WORKER',
        }] }
      }
      if (/select \* from public\.workforce_schedule_person/i.test(sql)) return { rows: [] }
      if (/select distinct p\.person_id, h\.shift_id/i.test(sql)) return { rows: [] }
      if (/select person_id, source_worker_login/i.test(sql)) {
        return { rows: [{ person_id: 'person-1', source_worker_login: 'maria', source_worker_id_normalized: 'w066', display_name: 'Maria Czarnula', status: 'ACTIVE', version: 1 }] }
      }
      if (/from public\.workforce_schedule_read_active_objects/i.test(sql)) {
        return { rows: [{ source_object_id: 'client-012', display_name: 'Edukatorium' }] }
      }
      if (/select \* from public\.workforce_schedule_location/i.test(sql)) return { rows: [] }
      if (/select distinct l\.location_id, h\.shift_id/i.test(sql)) return { rows: [] }
      if (/select location_id, source_object_id/i.test(sql)) {
        return { rows: [{ location_id: 'location-1', source_object_id: 'client-012', name: 'Edukatorium', short_name: 'Edukatorium', color: '#2563eb', soft_color: '#dbeafe', status: 'ACTIVE', version: 1 }] }
      }
      if (/select transaction_timestamp\(\) as synchronized_at/i.test(sql)) {
        return { rows: [{ synchronized_at: '2026-09-07T08:15:30.000Z' }] }
      }
      return { rows: [] }
    },
  }
  const repository = createWorkforceScheduleRepository(client)
  const result = await repository.syncCatalogs({
    orgId: 'bestclean',
    actorUid: 'admin-1',
    createPersonId: () => 'person-1',
    createLocationId: () => 'location-1',
  })

  assert.deepEqual(result, {
    synchronizedAt: '2026-09-07T08:15:30.000Z',
    people: { active: 1, created: 1, updated: 0, deactivated: 0 },
    locations: { active: 1, created: 1, updated: 0, deactivated: 0 },
  })
  const personInsert = calls.find(({ sql }) => /insert into public\.workforce_schedule_person/i.test(sql))
  const locationInsert = calls.find(({ sql }) => /insert into public\.workforce_schedule_location/i.test(sql))
  assert.equal(personInsert.params[2], 'w066')
  assert.equal(locationInsert.params[2], 'client-012')
})

test('zmiana loginu lub UID aktualizuje snapshot tej samej osoby wskazanej przez worker_id', async () => {
  const calls = []
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params })
      if (/from public\.workforce_schedule_read_active_workers/i.test(sql)) {
        return { rows: [{
          source_worker_id_normalized: 'w066',
          source_worker_login: 'maria.nowa',
          source_auth_uid: 'uid-new',
          display_name: 'Maria Nowa',
          role_snapshot: 'WORKER',
        }] }
      }
      if (/select \* from public\.workforce_schedule_person/i.test(sql)) {
        return { rows: [{
          person_id: 'person-existing',
          source_worker_id_normalized: 'w066',
          source_worker_login: 'maria.stara',
          source_auth_uid: 'uid-old',
        }] }
      }
      if (/select distinct p\.person_id, h\.shift_id/i.test(sql)) return { rows: [] }
      if (/select person_id, source_worker_login/i.test(sql)) {
        return { rows: [{
          person_id: 'person-existing',
          source_worker_id_normalized: 'w066',
          source_worker_login: 'maria.nowa',
          display_name: 'Maria Nowa',
          status: 'ACTIVE',
          version: 2,
        }] }
      }
      if (/from public\.workforce_schedule_read_active_objects/i.test(sql)) {
        return { rows: [{ source_object_id: 'client-012', display_name: 'Edukatorium' }] }
      }
      if (/select \* from public\.workforce_schedule_location/i.test(sql)) {
        return { rows: [{
          location_id: 'location-existing',
          source_object_id: 'client-012',
          name: 'Edukatorium',
          short_name: 'Edukatorium',
          color: '#2563eb',
          soft_color: '#dbeafe',
        }] }
      }
      if (/select distinct l\.location_id, h\.shift_id/i.test(sql)) return { rows: [] }
      if (/select location_id, source_object_id/i.test(sql)) {
        return { rows: [{ location_id: 'location-existing', source_object_id: 'client-012', name: 'Edukatorium', short_name: 'Edukatorium', color: '#2563eb', soft_color: '#dbeafe', status: 'ACTIVE', version: 1 }] }
      }
      return { rows: [] }
    },
  }
  const repository = createWorkforceScheduleRepository(client)
  await repository.syncCatalogs({
    orgId: 'bestclean',
    actorUid: 'admin-1',
    createPersonId: () => 'person-unexpected',
    createLocationId: () => 'location-unexpected',
  })

  const personUpdate = calls.find(({ sql }) => /update public\.workforce_schedule_person/i.test(sql))
  assert.ok(personUpdate)
  assert.deepEqual(personUpdate.params.slice(0, 5), [
    'bestclean',
    'person-existing',
    'w066',
    'maria.nowa',
    'uid-new',
  ])
  assert.equal(calls.some(({ sql }) => /insert into public\.workforce_schedule_person/i.test(sql)), false)
})

test('publikacja jest wewnętrzna i nie tworzy kolejki downstream', async () => {
  const calls = []
  const repository = createWorkforceScheduleRepository({
    async query(sql, params = []) {
      calls.push({ sql, params })
      if (/update public\.workforce_schedule_shift[\s\S]*returning version/i.test(sql)) {
        return { rows: [{ version: 4 }] }
      }
      return { rows: [] }
    },
  })
  const effects = { delivery: false, notifications: false, downstream: false }
  const result = await repository.publish({
    orgId: 'bestclean',
    publicationId: 'publication-1',
    from: '2026-09-07',
    to: '2026-09-13',
    timeZone: 'Europe/Warsaw',
    effects,
    warningFingerprint: '',
    warnings: [],
    actorUid: 'admin-1',
    idempotencyKey: 'publish-1',
    shifts: [{ shiftId: 'shift-1', revision: 2, version: 3, isDeleted: false }],
  })
  assert.equal(result.visibility, 'INTERNAL_ONLY')
  assert.deepEqual(result.effects, effects)
  assert.equal(calls.some(({ sql }) => /outbox|notify|delivery/i.test(sql)), false)
})
