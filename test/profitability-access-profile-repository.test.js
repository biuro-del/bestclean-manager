'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  ProfitabilityAccessProfileError,
  REQUIRED_ACCESS_PROFILE_COLUMNS,
  REQUIRED_ACCESS_PROFILE_COLUMN_RULES,
  REQUIRED_ACCESS_PROFILE_CONSTRAINTS,
  REQUIRED_ACCESS_PROFILE_CONSTRAINT_RULES,
  REQUIRED_ACCESS_PROFILE_INDEXES,
  REQUIRED_ACCESS_PROFILE_INDEX_RULES,
  createProfitabilityAccessProfileRepository,
} = require('../profitability/access-profile-repository')
const { WRITE_KINDS } = require('../profitability/access-profile-v2')

function schemaCatalog(overrides = {}) {
  return {
    boundary: { schema_usage: true, no_schema_create: true, extension_ready: true },
    columns: Object.entries(REQUIRED_ACCESS_PROFILE_COLUMN_RULES).map(([fingerprint, rule]) => {
      const [table_name, column_name] = fingerprint.split('.')
      const [data_type, is_nullable, character_maximum_length, column_default] = rule
      return {
        table_name, column_name, data_type, is_nullable,
        character_maximum_length, column_default: column_default ?? null,
      }
    }),
    constraints: Object.entries(REQUIRED_ACCESS_PROFILE_CONSTRAINT_RULES).map(([fingerprint, rule]) => {
      const [table_name, constraint_name] = fingerprint.split('.')
      const [constraint_type, definition] = rule
      return {
        table_name, constraint_name, constraint_type, validated: true,
        definition,
      }
    }),
    indexes: Object.entries(REQUIRED_ACCESS_PROFILE_INDEX_RULES).map(([index_name, rule]) => {
      const [table_name, is_unique, definition] = rule
      return {
        index_name, table_name, is_unique, is_valid: true, is_ready: true,
        definition,
      }
    }),
    privileges: [
      { relation_name: 'public.profitability_access_enforcement', ready: true, excessive: false },
      { relation_name: 'public.organization_access_profile', ready: true, excessive: false },
      { relation_name: 'public.service_object_assignment', ready: true, excessive: false },
      { relation_name: 'public.profitability_target_history', ready: true, excessive: false },
    ],
    ...overrides,
  }
}

function fakeClient({ membership = [], bindings = [], assignments = [], schema, catalog } = {}) {
  const queries = []
  const resolvedCatalog = schemaCatalog(catalog)
  return {
    queries,
    async query(sql, params = []) {
      queries.push({ sql, params })
      if (sql.includes("to_regclass('public.organization_access_profile')")) {
        return { rows: [schema ?? {
          enforcement: true, access_profile: true, object_assignment: true, target_history: true,
        }] }
      }
      if (sql.includes("has_schema_privilege(current_user, 'public'")) return { rows: [resolvedCatalog.boundary] }
      if (sql.includes('from information_schema.columns')) return { rows: resolvedCatalog.columns }
      if (sql.includes('from pg_constraint constraint_row')) return { rows: resolvedCatalog.constraints }
      if (sql.includes('from pg_index index_meta')) return { rows: resolvedCatalog.indexes }
      if (sql.includes('has_table_privilege(current_user')) return { rows: resolvedCatalog.privileges }
      if (sql.includes('from public.organization_member')) return { rows: membership }
      if (sql.includes('from public.organization_access_profile')) return { rows: bindings }
      if (sql.includes('from public.service_object_assignment')) return { rows: assignments }
      throw new Error(`Unexpected query: ${sql}`)
    },
  }
}

function activeMembership(overrides = {}) {
  return { org_id: 'org-a', uid: 'uid-1', role: 'ADMIN', status: 'ACTIVE', ...overrides }
}

function accessBinding(overrides = {}) {
  return {
    org_id: 'org-a',
    uid: 'uid-1',
    operational_profile: 'ADMIN',
    object_scope: 'ALL',
    worker_scope: 'ALL',
    finance_profile: 'COST_CONTROL',
    access_mode: 'MANAGE',
    can_edit_operational_costs: true,
    can_edit_contract_terms: false,
    can_edit_profitability_targets: false,
    can_view_worker_rates: false,
    can_edit_worker_rates: false,
    valid_from: '2026-01-01T00:00:00.000Z',
    valid_to: null,
    revoked_at: null,
    ...overrides,
  }
}

test('repository resolves an explicit organization-scoped profile and caches it per request time', async () => {
  const client = fakeClient({ membership: [activeMembership()], bindings: [accessBinding()] })
  const repository = createProfitabilityAccessProfileRepository(client)
  const now = new Date('2026-09-25T12:00:00.000Z')

  const first = await repository.assertRead({ orgId: 'org-a', uid: 'uid-1', objectId: 'object-1', now })
  const second = await repository.assertRead({ orgId: 'org-a', uid: 'uid-1', objectId: 'object-2', now })

  assert.equal(first.financeProfile, 'COST_CONTROL')
  assert.equal(first.operationalProfile, 'ADMIN')
  assert.equal(second, first)
  assert.equal(client.queries.filter(({ sql }) => sql.includes('organization_access_profile')).length, 1)
})

test('request-scoped repository caches default-time access across object reads', async () => {
  const client = fakeClient({ membership: [activeMembership()], bindings: [accessBinding()] })
  const repository = createProfitabilityAccessProfileRepository(client)

  const first = await repository.assertRead({ orgId: 'org-a', uid: 'uid-1', objectId: 'object-1' })
  const second = await repository.assertRead({ orgId: 'org-a', uid: 'uid-1', objectId: 'object-2' })

  assert.equal(second, first)
  assert.equal(client.queries.filter(({ sql }) => sql.includes('organization_access_profile')).length, 1)
})

test('ASSIGNED scope is resolved before financial reads and explicit assignment DENY wins', async () => {
  const client = fakeClient({
    membership: [activeMembership({ role: 'COORDINATOR' })],
    bindings: [accessBinding({ object_scope: 'ASSIGNED', worker_scope: 'OBJECT_ASSIGNED', access_mode: 'READ' })],
    assignments: [
      { org_id: 'org-a', uid: 'uid-1', object_id: 'object-ok', access_mode: 'ALLOW' },
      { org_id: 'org-a', uid: 'uid-1', object_id: 'object-denied', access_mode: 'ALLOW' },
      { org_id: 'org-a', uid: 'uid-1', object_id: 'object-denied', access_mode: 'DENY' },
    ],
  })
  const repository = createProfitabilityAccessProfileRepository(client)

  assert.equal((await repository.assertRead({ orgId: 'org-a', uid: 'uid-1', objectId: 'object-ok' })).allowed, true)
  await assert.rejects(
    repository.assertRead({ orgId: 'org-a', uid: 'uid-1', objectId: 'object-denied' }),
    (error) => error instanceof ProfitabilityAccessProfileError && error.code === 'OBJECT_NOT_ASSIGNED',
  )
})

test('COST_CONTROL can edit operational costs only when explicitly enabled', async () => {
  const allowedRepository = createProfitabilityAccessProfileRepository(fakeClient({
    membership: [activeMembership()],
    bindings: [accessBinding()],
  }))
  assert.equal((await allowedRepository.assertWrite({
    orgId: 'org-a', uid: 'uid-1', objectId: 'object-1', writeKind: WRITE_KINDS.OPERATIONAL_COST,
  })).allowed, true)

  const deniedRepository = createProfitabilityAccessProfileRepository(fakeClient({
    membership: [activeMembership()],
    bindings: [accessBinding({ can_edit_operational_costs: false })],
  }))
  await assert.rejects(
    deniedRepository.assertWrite({
      orgId: 'org-a', uid: 'uid-1', objectId: 'object-1', writeKind: WRITE_KINDS.OPERATIONAL_COST,
    }),
    (error) => error.code === 'WRITE_FORBIDDEN',
  )
})

test('missing, duplicate or revoked binding fails closed', async () => {
  for (const bindings of [[], [accessBinding(), accessBinding({ profile_id: 'second' })], [accessBinding({ revoked_at: '2026-09-25T00:00:00Z' })]]) {
    const repository = createProfitabilityAccessProfileRepository(fakeClient({
      membership: [activeMembership()],
      bindings,
    }))
    await assert.rejects(
      repository.assertRead({ orgId: 'org-a', uid: 'uid-1', objectId: 'object-1' }),
      (error) => error instanceof ProfitabilityAccessProfileError,
    )
  }
})

test('schema readiness reports every missing v2 relation', async () => {
  const repository = createProfitabilityAccessProfileRepository(fakeClient({
    schema: { enforcement: true, access_profile: true, object_assignment: false, target_history: false },
  }))
  assert.deepEqual(await repository.schemaReady(), {
    ready: false,
    missing: ['public.service_object_assignment', 'public.profitability_target_history'],
  })
})

test('schema readiness fails closed for a partial fingerprint or missing runtime SELECT', async () => {
  const missingColumnRepository = createProfitabilityAccessProfileRepository(fakeClient({
    catalog: {
      columns: schemaCatalog().columns.filter((entry) => !(
        entry.table_name === 'organization_access_profile'
          && entry.column_name === 'finance_profile'
      )),
    },
  }))
  assert.deepEqual(await missingColumnRepository.schemaReady(), {
    ready: false,
    missing: ['column:organization_access_profile.finance_profile'],
  })

  const missingPrivilegeRepository = createProfitabilityAccessProfileRepository(fakeClient({
    catalog: {
      privileges: schemaCatalog().privileges.map((entry) => (
        entry.relation_name === 'public.service_object_assignment'
          ? { ...entry, ready: false }
          : entry
      )),
    },
  }))
  assert.deepEqual(await missingPrivilegeRepository.schemaReady(), {
    ready: false,
    missing: ['privilege:public.service_object_assignment.SELECT'],
  })
})

test('schema readiness rejects same-name objects with unsafe definitions or excessive DML', async () => {
  const base = schemaCatalog()
  const repository = createProfitabilityAccessProfileRepository(fakeClient({
    catalog: {
      columns: base.columns.map((entry) => entry.table_name === 'organization_access_profile'
        && entry.column_name === 'access_mode'
        ? { ...entry, column_default: "'MANAGE'::character varying" }
        : entry),
      constraints: base.constraints.map((entry) => (
        entry.constraint_name === 'organization_access_profile_finance_capabilities_check'
          ? { ...entry, definition: `${entry.definition} OR TRUE` }
          : entry
      )),
      indexes: base.indexes.map((entry) => entry.index_name === 'organization_access_profile_active_uid_idx'
        ? { ...entry, definition: `${entry.definition} OR TRUE` }
        : entry),
      privileges: base.privileges.map((entry) => entry.relation_name === 'public.organization_access_profile'
        ? { ...entry, excessive: true }
        : entry),
    },
  }))

  const readiness = await repository.schemaReady()
  assert.equal(readiness.ready, false)
  assert.ok(readiness.missing.includes('column:organization_access_profile.access_mode'))
  assert.ok(readiness.missing.includes('constraint:organization_access_profile.organization_access_profile_finance_capabilities_check'))
  assert.ok(readiness.missing.includes('index:public.organization_access_profile_active_uid_idx'))
  assert.ok(readiness.missing.includes('privilege:public.organization_access_profile.DML_EXCESS'))
})
