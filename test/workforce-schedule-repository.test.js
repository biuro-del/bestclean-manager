'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  FORBIDDEN_PRIVILEGES,
  REQUIRED_COLUMNS,
  REQUIRED_FUNCTIONS,
  REQUIRED_PRIVILEGES,
  REQUIRED_RELATIONS,
  SOURCE_FORBIDDEN_PRIVILEGES,
  SOURCE_RELATIONS,
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
    'public.worker',
    'public.service_object',
  ])
  assert.deepEqual(Object.keys(SOURCE_FORBIDDEN_PRIVILEGES), [
    'public.organizations',
    'public.organization_member',
    'public.worker',
    'public.service_object',
  ])
  assert.deepEqual(SOURCE_FORBIDDEN_PRIVILEGES['public.worker'], [
    'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN',
  ])
  assert.deepEqual(
    SOURCE_FORBIDDEN_PRIVILEGES['public.service_object'],
    SOURCE_FORBIDDEN_PRIVILEGES['public.worker'],
  )
  assert.deepEqual(
    SOURCE_FORBIDDEN_PRIVILEGES['public.organization_member'],
    SOURCE_FORBIDDEN_PRIVILEGES['public.worker'],
  )
  assert.deepEqual(
    SOURCE_FORBIDDEN_PRIVILEGES['public.organizations'],
    SOURCE_FORBIDDEN_PRIVILEGES['public.worker'],
  )
  assert.equal(WORKFORCE_SCHEDULE_SCHEMA_MARKER, 'cleanzi.workforce_schedule.core.v1')
  assert.deepEqual(REQUIRED_FUNCTIONS, [
    'public.workforce_schedule_lock_worker_sources(text,text[])',
    'public.workforce_schedule_lock_object_sources(text,text[])',
  ])
  assert.equal(WORKFORCE_SCHEDULE_SESSION_ROLE, 'portal_app')
  assert.equal(WORKFORCE_SCHEDULE_DB_ROLE, 'workforce_schedule_app')
  assert.equal(WORKFORCE_SCHEDULE_OWNER_ROLE, 'workforce_schedule_owner')
})

test('mapowanie katalogów zachowuje stabilne identyfikatory źródłowe', () => {
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
  assert.equal(person.sourceWorkerLogin, 'maria')
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

test('kanoniczne źródła są tylko odczytywane, blokowane do COMMIT i nie mają FK z Grafiku', () => {
  assert.match(repositorySource, /from public\.worker w/i)
  assert.match(repositorySource, /from public\.service_object o/i)
  assert.doesNotMatch(repositorySource, /(?:insert into|update|delete from) public\.(?:worker|service_object)\b/i)
  assert.doesNotMatch(migrationSource, /references public\.(?:worker|service_object)\b/i)
  assert.match(repositorySource, /source_worker_login/i)
  assert.match(repositorySource, /source_object_id/i)
  assert.match(repositorySource, /btrim\(o\.object_id\) = l\.source_object_id/i)
  assert.match(repositorySource, /worker_id_normalized[\s\S]{0,120}= p\.source_worker_id_normalized/i)
  assert.doesNotMatch(repositorySource, /= p\.source_worker_login/i)
  assert.doesNotMatch(repositorySource, /= p\.source_auth_uid/i)
  assert.match(repositorySource, /w\.active is true/i)
  assert.doesNotMatch(repositorySource, /coalesce\(w\.active/i)
  assert.match(repositorySource, /upper\(btrim\(o\.status\)\) = 'ACTIVE'/i)
  assert.match(repositorySource, /o\.archived_at is null/i)
  assert.match(migrationSource, /source_worker_id_normalized varchar\(128\) not null/i)
  assert.match(migrationSource, /unique \(org_id, source_worker_id_normalized\)/i)
  assert.doesNotMatch(repositorySource, /w\.login is null/i)
  assert.match(repositorySource, /from public\.workforce_schedule_lock_worker_sources\(\$1::text, \$2::text\[\]\)/i)
  assert.match(repositorySource, /from public\.workforce_schedule_lock_object_sources\(\$1::text, \$2::text\[\]\)/i)
  assert.match(migrationSource, /create function public\.workforce_schedule_lock_worker_sources[\s\S]*?for share of worker_source/i)
  assert.match(migrationSource, /create function public\.workforce_schedule_lock_object_sources[\s\S]*?for share of object_source/i)
  assert.match(migrationSource, /security definer[\s\S]*?set search_path = pg_catalog\s/i)
  assert.doesNotMatch(migrationSource, /set search_path = pg_catalog, public/i)
  assert.match(migrationSource, /revoke all privileges on function[\s\S]*?from public, portal_app/i)
  assert.match(migrationSource, /grant execute on function[\s\S]*?to workforce_schedule_app/i)
  assert.match(migrationSource, /workforce_schedule_owner needs SELECT and UPDATE[\s\S]*?FOR SHARE lock function/i)
  assert.match(migrationSource, /perform \*[\s\S]*?workforce_schedule_lock_worker_sources[\s\S]*?perform \*[\s\S]*?workforce_schedule_lock_object_sources/i)
  assert.match(repositorySource, /OWNER_LOCK_PRIVILEGE/i)
  assert.doesNotMatch(migrationSource, /grant\s+update[\s\S]{0,200}public\.(?:worker|service_object)/i)
  assert.match(migrationSource, /current_setting\('cleanzi\.org_id', true\)/i)
  assert.match(migrationSource, /current_setting\('cleanzi\.actor_uid', true\)/i)
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
  assert.match(migrationSource, /current_setting\(''cleanzi\.actor_uid'', true\)/i)
  assert.match(repositorySource, /set_config\('cleanzi\.org_id'/i)
  assert.match(repositorySource, /set_config\('cleanzi\.actor_uid'/i)
  assert.match(repositorySource, /regexp_replace\(lower\(policy\.qual\), '\[\[:space:\]\(\)\]'/i)
  assert.match(repositorySource, /workforce_schedule_member\.status=''active''/i)
  assert.doesNotMatch(repositorySource, /position\('cleanzi\.org_id' in coalesce\(policy\.qual/i)
})

test('runtime ma minimalne uprawnienia i nie może usuwać historii', () => {
  assert.doesNotMatch(migrationSource, /grant\s+delete/i)
  assert.match(migrationSource, /revoke all privileges[\s\S]*from public, portal_app/i)
  assert.match(migrationSource, /privilege\.is_grantable/i)
  assert.match(migrationSource, /inherits a privileged database role/i)
  assert.match(repositorySource, /runtime:GRANT_OPTION/i)
  assert.match(repositorySource, /runtime:PRIVILEGED_MEMBERSHIP/i)
  assert.match(repositorySource, /runtime:SCHEMA_USAGE/i)
  assert.match(repositorySource, /runtime:SCHEMA_CREATE/i)
  assert.match(migrationSource, /portal_app membership in workforce_schedule_app must be SET TRUE, INHERIT FALSE, ADMIN FALSE/i)
  assert.match(migrationSource, /Role % must be restricted NOLOGIN NOINHERIT/i)
  assert.match(migrationSource, /set local role workforce_schedule_owner/i)
  assert.match(migrationSource, /grant select, insert, update on table[\s\S]*?to workforce_schedule_app/i)
  assert.doesNotMatch(migrationSource, /grant create on schema public/i)
  assert.match(migrationSource, /not has_schema_privilege\('workforce_schedule_app', 'public', 'USAGE'\)/i)
  assert.match(repositorySource, /not has_schema_privilege\(current_user, 'public', 'CREATE'\)/i)
  assert.match(migrationSource, /source write privilege % on public\.%/i)
  assert.match(migrationSource, /Runtime source boundary postflight failed/i)
  assert.match(repositorySource, /has_any_column_privilege\(current_user,[\s\S]*?required\.privilege_name\)/i)
  assert.match(repositorySource, /has_any_column_privilege\(session_user,[\s\S]*?required_privilege\.privilege_name\)/i)
  assert.match(migrationSource, /has_any_column_privilege\('workforce_schedule_app',[\s\S]*?privilege_name\)/i)
  assert.doesNotMatch(
    migrationSource,
    /revoke[\s\S]{0,80}on table[\s\S]{0,160}public\.(?:worker|service_object)\b/i,
  )
  assert.match(migrationSource, /with recursive accessible_roles\(role_oid\)[\s\S]*?privilege_type = 'EXECUTE'[\s\S]*?privilege\.is_grantable/i)
  assert.match(migrationSource, /pg_has_role\('portal_app', function_row\.proowner, 'MEMBER'\)[\s\S]*?pg_has_role\('portal_app', function_row\.proowner, 'SET'\)/i)
})

function createSchemaReadyClient({
  grantOption = false,
  directSessionAcl = false,
  privilegedMembership = false,
  ownerLockReady = true,
  functionGrantOption = false,
  functionOwnerMembership = false,
  schemaUsage = true,
  sourceWritePrivilege = false,
  scheduleColumnPrivilege = false,
  expectedOwner = true,
  policyCountReady = true,
  policyReady = true,
  noUserTriggers = true,
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
              && sourceWritePrivilege
              && requirement.privilege_name === 'UPDATE'
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
        return { rows: [{ excessive: grantOption, direct_session_acl: directSessionAcl }] }
      }
      if (/select_ready/.test(sql)) {
        return {
          rows: params[0].map((relationName) => ({
            relation_name: relationName,
            relation_ready: true,
            select_ready: true,
          })),
        }
      }
      if (/from unnest\(\$1::text\[\]\) as required\(function_signature\)/.test(sql)) {
        assert.equal(params[1], WORKFORCE_SCHEDULE_OWNER_ROLE)
        return {
          rows: params[0].map((functionSignature) => ({
            function_signature: functionSignature,
            function_ready: true,
            security_definer: true,
            expected_owner: expectedOwner,
            fixed_search_path: true,
            execute_ready: true,
            no_owner_membership: !functionOwnerMembership,
            owner_lock_ready: ownerLockReady,
            no_public_execute: true,
            no_session_execute: true,
            no_execute_grant_option: !functionGrantOption,
          })),
        }
      }
      if (/session_user = \$2::text as session_role/.test(sql)) {
        assert.deepEqual(params.slice(1, 4), [
          WORKFORCE_SCHEDULE_SESSION_ROLE,
          WORKFORCE_SCHEDULE_DB_ROLE,
          WORKFORCE_SCHEDULE_OWNER_ROLE,
        ])
        return {
          rows: [{
            session_role: true,
            restricted_session_role: true,
            runtime_role: true,
            restricted_role: true,
            role_switch_ready: true,
            role_switch_exact: true,
            no_inherited_runtime: true,
            no_privileged_membership: !privilegedMembership,
            session_no_privileged_membership: true,
            restricted_owner: true,
            owner_no_privileged_membership: true,
            no_owner_membership: true,
            session_no_schedule_privileges: true,
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

test('schemaReady blokuje funkcję, której owner utracił prawo blokowania źródła', async () => {
  const repository = createWorkforceScheduleRepository(createSchemaReadyClient({ ownerLockReady: false }))
  const result = await repository.schemaReady()
  assert.equal(result.ready, false)
  assert.ok(result.missing.some((item) => item.endsWith(':OWNER_LOCK_PRIVILEGE')))
})

test('schemaReady blokuje dziedziczony EXECUTE WITH GRANT OPTION funkcji', async () => {
  const repository = createWorkforceScheduleRepository(createSchemaReadyClient({ functionGrantOption: true }))
  const result = await repository.schemaReady()
  assert.equal(result.ready, false)
  assert.ok(result.missing.some((item) => item.endsWith(':EXECUTE_GRANT_OPTION')))
  assert.match(repositorySource, /with recursive accessible_roles\(role_oid\)[\s\S]*?privilege_type = 'EXECUTE'[\s\S]*?privilege\.is_grantable[\s\S]*?select role_oid from accessible_roles/i)
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
  const repository = createWorkforceScheduleRepository(createSchemaReadyClient({ sourceWritePrivilege: true }))
  const result = await repository.schemaReady()
  assert.equal(result.ready, false)
  assert.ok(result.missing.includes('public.worker:UPDATE:EXCESS'))
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

test('schemaReady blokuje bezpośrednie ACL roli sesyjnej portal_app', async () => {
  const repository = createWorkforceScheduleRepository(createSchemaReadyClient({ directSessionAcl: true }))
  const result = await repository.schemaReady()
  assert.equal(result.ready, false)
  assert.ok(result.missing.includes('runtime:DIRECT_SESSION_ACL'))
})

test('komendy i publikacje zapisują dokładny kontrakt zerowych efektów', () => {
  const exactEffects = /effects_json\s*=\s*'\{"delivery": false, "notifications": false, "downstream": false\}'::jsonb/i
  assert.equal((migrationSource.match(new RegExp(exactEffects.source, 'gi')) || []).length, 2)
  assert.match(repositorySource, /effects_json/i)
  assert.doesNotMatch(repositorySource, /workforce_schedule_outbox|insert into public\.(?:task|event|workday)/i)
})

test('synchronizacja używa stabilnych ID źródłowych, nie nazwy ani adresu', async () => {
  const calls = []
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params })
      if (/from public\.worker w/i.test(sql)) {
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
      if (/from public\.service_object o/i.test(sql)) {
        return { rows: [{ source_object_id: 'object-012', display_name: 'Edukatorium' }] }
      }
      if (/select \* from public\.workforce_schedule_location/i.test(sql)) return { rows: [] }
      if (/select distinct l\.location_id, h\.shift_id/i.test(sql)) return { rows: [] }
      if (/select location_id, source_object_id/i.test(sql)) {
        return { rows: [{ location_id: 'location-1', source_object_id: 'object-012', name: 'Edukatorium', short_name: 'Edukatorium', color: '#2563eb', soft_color: '#dbeafe', status: 'ACTIVE', version: 1 }] }
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

  assert.equal(result.people[0].sourceWorkerLogin, 'maria')
  assert.equal(result.people[0].sourceWorkerId, 'w066')
  assert.equal(result.locations[0].sourceObjectId, 'object-012')
  const personInsert = calls.find(({ sql }) => /insert into public\.workforce_schedule_person/i.test(sql))
  const locationInsert = calls.find(({ sql }) => /insert into public\.workforce_schedule_location/i.test(sql))
  assert.equal(personInsert.params[2], 'w066')
  assert.equal(locationInsert.params[2], 'object-012')
})

test('zmiana loginu lub UID aktualizuje snapshot tej samej osoby wskazanej przez worker_id', async () => {
  const calls = []
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params })
      if (/from public\.worker w/i.test(sql)) {
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
      if (/from public\.service_object o/i.test(sql)) {
        return { rows: [{ source_object_id: 'object-012', display_name: 'Edukatorium' }] }
      }
      if (/select \* from public\.workforce_schedule_location/i.test(sql)) {
        return { rows: [{
          location_id: 'location-existing',
          source_object_id: 'object-012',
          name: 'Edukatorium',
          short_name: 'Edukatorium',
          color: '#2563eb',
          soft_color: '#dbeafe',
        }] }
      }
      if (/select distinct l\.location_id, h\.shift_id/i.test(sql)) return { rows: [] }
      if (/select location_id, source_object_id/i.test(sql)) {
        return { rows: [{ location_id: 'location-existing', source_object_id: 'object-012', name: 'Edukatorium', short_name: 'Edukatorium', color: '#2563eb', soft_color: '#dbeafe', status: 'ACTIVE', version: 1 }] }
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
