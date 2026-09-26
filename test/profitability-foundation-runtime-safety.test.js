'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  REQUIRED_DOMAIN_RELATIONS,
  REQUIRED_LEGACY_ACCESS_RELATIONS,
  createProfitabilityApi,
} = require('../profitability-api')
const { databaseDate } = require('../profitability/repository')

function createApiHarness({ v2, relationExists }) {
  const errors = []
  const responses = []
  let repositoryCreated = false
  const api = createProfitabilityApi({
    environment: v2
      ? {
          PROFITABILITY_ACCESS_PROFILE_V2_ENABLED: 'true',
          PROFITABILITY_ACCESS_PROFILE_V2_ALLOWED_ORG_IDS: 'org-a',
        }
      : {},
    async connectDbClient() {
      return {
        async query(sql) {
          if (sql.includes('from public.profitability_access_enforcement')) {
            return { rows: v2 ? [{ schema_version: 'v2' }] : [] }
          }
          throw new Error(`Unexpected query: ${sql}`)
        },
        release() {},
      }
    },
    createRepository() {
      repositoryCreated = true
      return {
        async listAudit() { return [] },
        async resolveAccessProfileV2() {
          return { financeProfile: 'OWNER_FULL' }
        },
      }
    },
    databaseRelationExists: relationExists,
    parseBearerToken() { return 'token' },
    async readJsonBody() { return {} },
    sendApiError(_res, status, code, message, details) {
      errors.push({ status, code, message, details })
    },
    sendJson(_res, status, payload) { responses.push({ status, payload }) },
    async verifyFirebaseIdToken() { return { uid: 'uid-a' } },
  })
  return { api, errors, responses, repositoryCreated: () => repositoryCreated }
}

async function executeHistory(harness) {
  await harness.api.handle(
    { method: 'GET' },
    {},
    new URL('http://localhost/api/portal/profitability?orgId=org-a&clientId=client-a&objectId=object-a&period=2026-09&view=history'),
  )
}

test('foundation readiness separates domain relations from legacy permissions', () => {
  assert.equal(REQUIRED_DOMAIN_RELATIONS.length, 10)
  assert.ok(REQUIRED_DOMAIN_RELATIONS.includes('public.periodic_work_zone'))
  assert.ok(!REQUIRED_DOMAIN_RELATIONS.includes('public.profitability_permission'))
  assert.deepEqual(REQUIRED_LEGACY_ACCESS_RELATIONS, ['public.profitability_permission'])
})

test('v2 history remains available without the retired legacy permission table', async () => {
  const checked = []
  const harness = createApiHarness({
    v2: true,
    async relationExists(_client, relation) {
      checked.push(relation)
      return ![
        'public.profitability_permission',
        'public.profitability_financial_model_enforcement',
      ].includes(relation)
    },
  })
  await executeHistory(harness)

  assert.deepEqual(harness.errors, [])
  assert.equal(harness.responses[0]?.status, 200)
  assert.equal(harness.repositoryCreated(), true)
  assert.ok(!checked.includes('public.profitability_permission'))
})

test('legacy mode fails closed when its permission table is absent', async () => {
  const harness = createApiHarness({
    v2: false,
    async relationExists(_client, relation) {
      return relation !== 'public.profitability_permission'
    },
  })
  await executeHistory(harness)

  assert.equal(harness.responses.length, 0)
  assert.equal(harness.errors[0]?.status, 503)
  assert.equal(harness.errors[0]?.code, 'PROFITABILITY_SCHEMA_NOT_READY')
  assert.equal(harness.repositoryCreated(), false)
})

test('database DATE values must be text and cannot be shifted through UTC', () => {
  assert.equal(databaseDate('2026-03-29'), '2026-03-29')
  assert.equal(databaseDate('2026-10-25'), '2026-10-25')

  // Europe/Warsaw midnight in CEST is the previous UTC calendar day. A Date
  // object here must fail closed instead of silently becoming 2026-09-13.
  const warsawMidnight = new Date('2026-09-13T22:00:00.000Z')
  assert.throws(
    () => databaseDate(warsawMidnight),
    /PostgreSQL DATE must be selected as YYYY-MM-DD text/,
  )
})

test('repository selects compared PostgreSQL DATE columns as text', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'profitability', 'repository.js'),
    'utf8',
  )
  for (const expression of [
    'r.effective_from::text as effective_from_ymd',
    'v.effective_from::text as effective_from_ymd',
    'period_start::text as period_start',
    'period_end::text as period_end',
  ]) {
    assert.match(source, new RegExp(expression.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.doesNotMatch(source, /String\(row\.effective_(?:from|to)\)\.slice\(0,\s*10\)/)
  assert.doesNotMatch(source, /String\(currentPeriod\.period_(?:start|end)\)\.slice\(0,\s*10\)/)
})

test('portal wires profitability only through the dedicated fail-closed database manager', () => {
  const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')
  const envExample = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8')

  assert.match(indexSource, /createProfitabilityDbConnectionManager\(/)
  const profitabilityApiBlock = indexSource.match(
    /const profitabilityApi = createProfitabilityApi\(\{[\s\S]*?\n\}\)/,
  )?.[0]
  assert.ok(profitabilityApiBlock)
  assert.match(profitabilityApiBlock, /connectDbClient: profitabilityDb\.connect,/)
  assert.doesNotMatch(profitabilityApiBlock, /^\s*connectDbClient,\s*$/m)
  assert.match(envExample, /PROFITABILITY_DB_ENABLED=false/)
  assert.match(envExample, /PROFITABILITY_DB_USER=profitability_session/)
  assert.doesNotMatch(envExample, /^PROFITABILITY_DB_PASS=.+$/m)
})
