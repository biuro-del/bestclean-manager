'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const { ProfitabilityRepository } = require('../profitability/repository')
const { WRITE_KINDS } = require('../profitability/access-profile-v2')

function profile(overrides = {}) {
  return {
    allowed: true,
    financeProfile: 'COST_CONTROL',
    objectScope: 'ASSIGNED',
    assignedObjectIds: ['object-allowed'],
    deniedObjectIds: [],
    capabilities: { editOperationalCosts: true },
    ...overrides,
  }
}

test('v2 resolves object assignment before querying service objects and pushes scope into SQL', async () => {
  const events = []
  const accessProfileRepository = {
    async schemaReady() {
      events.push('schema')
      return { ready: true, missing: [] }
    },
    async assertRead() {
      events.push('authorize')
      return profile()
    },
  }
  const client = {
    async query(sql, params) {
      events.push('service-object-query')
      assert.match(sql, /object_id = any\(\$4::text\[\]\)/)
      assert.match(sql, /not \(object_id = any\(\$5::text\[\]\)\)/)
      assert.deepEqual(params, ['org-a', 'client-a', false, ['object-allowed'], []])
      return { rows: [{ object_id: 'object-allowed', client_id: 'client-a' }] }
    },
  }
  const repository = new ProfitabilityRepository(client, {
    accessProfileV2: { enabled: true, repository: accessProfileRepository },
  })

  const rows = await repository.listServiceObjectsForClient({
    orgId: 'org-a', clientId: 'client-a', uid: 'uid-a',
  })
  assert.deepEqual(rows, [{ object_id: 'object-allowed', client_id: 'client-a' }])
  assert.deepEqual(events, ['schema', 'authorize', 'service-object-query'])
})

test('v2 portfolio query applies organization object scope and explicit DENY in SQL', async () => {
  const accessProfileRepository = {
    async schemaReady() {
      return { ready: true, missing: [] }
    },
    async assertRead() {
      return profile({
        assignedObjectIds: ['object-a', 'object-b'],
        deniedObjectIds: ['object-b'],
      })
    },
  }
  const client = {
    async query(sql, params) {
      assert.match(sql, /object_id = any\(\$3::text\[\]\)/)
      assert.match(sql, /not \(object_id = any\(\$4::text\[\]\)\)/)
      assert.doesNotMatch(sql, /client_id =/)
      assert.deepEqual(params, ['org-a', false, ['object-a', 'object-b'], ['object-b']])
      return { rows: [{ object_id: 'object-a', client_id: 'client-a' }] }
    },
  }
  const repository = new ProfitabilityRepository(client, {
    accessProfileV2: { enabled: true, repository: accessProfileRepository },
  })

  assert.deepEqual(await repository.listServiceObjectsForOrganization({
    orgId: 'org-a', uid: 'uid-a',
  }), [{ object_id: 'object-a', client_id: 'client-a' }])
})

test('v2 excludes explicit DENY rows in SQL even when object scope is ALL', async () => {
  const accessProfileRepository = {
    async schemaReady() {
      return { ready: true, missing: [] }
    },
    async assertRead() {
      return profile({
        objectScope: 'ALL',
        assignedObjectIds: [],
        deniedObjectIds: ['object-denied'],
      })
    },
  }
  const client = {
    async query(sql, params) {
      assert.match(sql, /not \(object_id = any\(\$5::text\[\]\)\)/)
      assert.deepEqual(params, ['org-a', 'client-a', true, [], ['object-denied']])
      return { rows: [{ object_id: 'object-visible', client_id: 'client-a' }] }
    },
  }
  const repository = new ProfitabilityRepository(client, {
    accessProfileV2: { enabled: true, repository: accessProfileRepository },
  })

  assert.deepEqual(await repository.listServiceObjectsForClient({
    orgId: 'org-a', clientId: 'client-a', uid: 'uid-a',
  }), [{ object_id: 'object-visible', client_id: 'client-a' }])
})

test('v2 maps operational-cost writes separately from sensitive finance writes', async () => {
  const writes = []
  const accessProfileRepository = {
    async schemaReady() {
      return { ready: true, missing: [] }
    },
    async assertWrite(input) {
      writes.push(input)
      if (input.writeKind !== WRITE_KINDS.OPERATIONAL_COST) {
        const error = new Error('forbidden')
        error.code = 'WRITE_FORBIDDEN'
        error.statusCode = 403
        throw error
      }
      return profile()
    },
  }
  const repository = new ProfitabilityRepository({ query: async () => ({ rows: [] }) }, {
    accessProfileV2: { enabled: true, repository: accessProfileRepository },
  })

  assert.equal((await repository.assertAccess({
    action: 'edit', orgId: 'org-a', uid: 'uid-a', objectId: 'object-a',
    writeKind: WRITE_KINDS.OPERATIONAL_COST,
  })).allowed, true)
  await assert.rejects(
    repository.assertAccess({
      action: 'edit', orgId: 'org-a', uid: 'uid-a', objectId: 'object-a',
      writeKind: WRITE_KINDS.CONTRACT_TERMS,
    }),
    (error) => error.code === 'WRITE_FORBIDDEN',
  )
  assert.deepEqual(writes.map((entry) => entry.writeKind), [
    WRITE_KINDS.OPERATIONAL_COST,
    WRITE_KINDS.CONTRACT_TERMS,
  ])
})

test('v2 schema drift fails closed before any domain table read', async () => {
  let domainRead = false
  const repository = new ProfitabilityRepository({
    async query() {
      domainRead = true
      return { rows: [] }
    },
  }, {
    accessProfileV2: {
      enabled: true,
      repository: {
        async schemaReady() {
          return { ready: false, missing: ['public.organization_access_profile'] }
        },
      },
    },
  })

  await assert.rejects(
    repository.listServiceObjectsForClient({ orgId: 'org-a', clientId: 'client-a', uid: 'uid-a' }),
    (error) => error.code === 'PROFITABILITY_ACCESS_PROFILE_SCHEMA_NOT_READY' && error.statusCode === 503,
  )
  assert.equal(domainRead, false)
})
