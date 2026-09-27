'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const { createProfitabilityApi } = require('../profitability-api')

const FORBIDDEN_COST_CONTROL_KEY = /(revenue|profit|margin|target|hourly|rateid|workercost)/i

function walk(value, visit, path = '$') {
  visit(value, path)
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walk(entry, visit, `${path}[${index}]`))
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, entry]) => walk(entry, visit, `${path}.${key}`))
  }
}

function calculationInput() {
  return {
    accessProfileVersion: 'v2',
    orgId: 'org-a',
    objectId: 'object-1',
    clientId: 'client-1',
    currency: 'PLN',
    period: { start: '2026-09-01', end: '2026-10-01' },
    contractRevenues: [{
      id: 'contract-secret', orgId: 'org-a', objectId: 'object-1', amountMinor: '100000',
      currency: 'PLN', category: 'CONTRACT', recurrence: 'MONTHLY', activeFrom: '2026-09-01',
    }],
    additionalRevenues: [],
    laborSessions: [{
      id: 'event-1', orgId: 'org-a', objectId: 'object-1', workerLogin: 'worker-secret',
      startAt: '2026-09-10T08:00:00Z', endAt: '2026-09-10T09:00:00Z',
    }],
    workerRates: [{
      id: 'rate-secret', orgId: 'org-a', objectId: 'object-1', workerLogin: 'worker-secret',
      hourlyCostMinor: '10000', currency: 'PLN', effectiveFrom: '2026-01-01',
    }],
    materialCosts: [{
      id: 'cost-1', orgId: 'org-a', objectId: 'object-1', amountMinor: '5000',
      currency: 'PLN', category: 'MATERIALS', name: 'secret product', recurrence: 'MONTHLY',
      activeFrom: '2026-09-01',
    }],
    otherCosts: [],
    equipment: [],
    periodicWorks: [],
    targetMinimumResultMinor: '90000',
    targetMinimumMarginBps: '9000',
    targetPolicy: 'ALL_DEFINED',
  }
}

function profile(financeProfile) {
  const owner = financeProfile === 'OWNER_FULL'
  return {
    allowed: true,
    financeProfile,
    objectScope: 'ALL',
    capabilities: {
      editContractTerms: owner,
      editProfitabilityTargets: owner,
      editWorkerRates: owner,
      editOperationalCosts: true,
    },
  }
}

async function executeGet(financeProfile, { view = '', clientId = 'client-1', objectId = 'object-1' } = {}) {
  const responses = []
  const errors = []
  const repositoryOptions = []
  const repository = {
    async listAudit() {
      return [
        {
          action: 'CREATE_FINANCIAL_ENTRY', actor_uid: 'SECRET-ACTOR',
          reason: 'SECRET COST REASON', created_at: '2026-09-25T10:00:00Z',
          entity_type: 'OBJECT_FINANCIAL_ENTRY', entity_id: 'SECRET-COST-ID',
          new_value: { entry_group: 'TRANSPORT', amount_minor: '5000' },
        },
        {
          action: 'CREATE_CONTRACT_VERSION', actor_uid: 'SECRET-ACTOR',
          reason: 'SECRET REVENUE 100000', created_at: '2026-09-25T11:00:00Z',
          entity_type: 'OBJECT_CONTRACT_VERSION', entity_id: 'SECRET-CONTRACT-ID',
          new_value: { monthly_value_minor: '100000' },
        },
      ]
    },
    async listServiceObjectsForClient() {
      return [{ object_id: 'object-1', client_id: 'client-1', name: 'Edukatorium', timezone: 'Europe/Warsaw' }]
    },
    async listServiceObjectsForOrganization() {
      return [{ object_id: 'object-1', client_id: 'client-1', name: 'Edukatorium', timezone: 'Europe/Warsaw' }]
    },
    async loadObjectCalculationInput() {
      return calculationInput()
    },
    async listProfitabilityTrend() {
      return {
        source: 'PROFITABILITY_SNAPSHOT',
        window: { start: '2025-10-01', end: '2026-10-01', months: 12 },
        points: [{
          period: '2026-08',
          currency: 'PLN',
          revenueMinor: '100000',
          totalCostMinor: '15000',
          marginMinor: '85000',
          completenessBps: '10000',
          status: 'CALCULATED',
        }],
      }
    },
    async resolveAccessProfileV2() {
      return profile(financeProfile)
    },
  }
  const api = createProfitabilityApi({
    environment: {
      PROFITABILITY_ACCESS_PROFILE_V2_ENABLED: 'true',
      PROFITABILITY_ACCESS_PROFILE_V2_ALLOWED_ORG_IDS: 'org-a',
    },
    async connectDbClient() {
      return {
        async query(sql) {
          if (sql.includes('from public.profitability_access_enforcement')) {
            return { rows: [{ schema_version: 'v2' }] }
          }
          throw new Error(`Unexpected query: ${sql}`)
        },
        release() {},
      }
    },
    createRepository(_client, options) {
      repositoryOptions.push(options)
      return repository
    },
    async databaseRelationExists(_client, relationName) {
      return relationName !== 'public.profitability_financial_model_enforcement'
    },
    parseBearerToken() {
      return 'token'
    },
    async readJsonBody() {
      return {}
    },
    sendApiError(_res, status, code, message, details) {
      errors.push({ status, code, message, details })
    },
    sendJson(_res, status, payload) {
      responses.push({ status, payload })
    },
    async verifyFirebaseIdToken() {
      return { uid: 'uid-1' }
    },
  })

  await api.handle(
    { method: 'GET' },
    {},
    new URL(`http://localhost/api/portal/profitability?orgId=org-a${clientId ? `&clientId=${clientId}` : ''}&period=2026-09${objectId ? `&objectId=${objectId}` : ''}${view ? `&view=${view}` : ''}`),
  )
  return { errors, repositoryOptions, response: responses[0] }
}

test('global organization gate returns 404 without opening the profitability database', async () => {
  for (const testCase of [
    {
      environment: {
        PROFITABILITY_ACCESS_PROFILE_V2_ENABLED: 'true',
        PROFITABILITY_ACCESS_PROFILE_V2_ALLOWED_ORG_IDS: 'bestclean',
      },
      orgId: 'other-org',
    },
    {
      environment: {
        PROFITABILITY_ACCESS_PROFILE_V2_ENABLED: 'true',
        PROFITABILITY_ACCESS_PROFILE_V2_ALLOWED_ORG_IDS: '',
      },
      orgId: 'bestclean',
    },
  ]) {
    let connections = 0
    const errors = []
    const api = createProfitabilityApi({
      environment: testCase.environment,
      async connectDbClient() {
        connections += 1
        throw new Error('database connection must not be attempted')
      },
      createRepository() {
        throw new Error('repository must not be created')
      },
      async databaseRelationExists() { return true },
      parseBearerToken() { return 'token' },
      async readJsonBody() { return {} },
      sendApiError(_res, status, code, message, details) {
        errors.push({ status, code, message, details })
      },
      sendJson() {
        throw new Error('response must be an error')
      },
      async verifyFirebaseIdToken() {
        return { uid: 'uid-owner', role: 'OWNER', planCode: 'PRO' }
      },
    })

    await api.handle(
      { method: 'GET' },
      {},
      new URL(`http://localhost/api/portal/profitability?orgId=${testCase.orgId}&clientId=client-1&period=2026-09`),
    )

    assert.equal(connections, 0)
    assert.equal(errors.length, 1)
    assert.equal(errors[0].status, 404)
    assert.equal(errors[0].code, 'PROFITABILITY_NOT_ENABLED')
  }
})

test('COST_CONTROL response is allowlisted server-side and contains no hidden finance fields or sentinels', async () => {
  const result = await executeGet('COST_CONTROL')
  assert.deepEqual(result.errors, [])
  assert.equal(result.repositoryOptions[0].accessProfileV2.enabled, true)
  assert.equal(result.repositoryOptions[0].financialModelV21.enabled, false)
  assert.equal(result.response.status, 200)
  assert.equal(result.response.payload.data.capability.financeProfile, 'COST_CONTROL')
  assert.equal(result.response.payload.data.capability.canEdit, false)
  assert.equal(result.response.payload.data.capability.canEditOperationalCosts, true)
  assert.equal(result.response.payload.data.objects[0].labor.actualSeconds, '3600')
  assert.equal(result.response.payload.data.objects[0].operationalStatus, 'BELOW_TARGET')

  const leaked = []
  walk(result.response.payload.data, (value, path) => {
    const key = path.split('.').at(-1).replace(/\[\d+\]$/, '')
    if (!path.includes('.capability.') && FORBIDDEN_COST_CONTROL_KEY.test(key)) leaked.push(path)
    if (typeof value === 'string' && value.includes('SECRET')) leaked.push(`${path}=${value}`)
  })
  assert.deepEqual(leaked, [])
})

test('OWNER_FULL keeps the complete calculation while using the same v2 gate', async () => {
  const result = await executeGet('OWNER_FULL')
  assert.deepEqual(result.errors, [])
  assert.equal(result.response.payload.data.capability.canEdit, true)
  assert.equal(result.response.payload.data.summary.revenueMinor, '100000')
  assert.equal(result.response.payload.data.objects[0].target.minimumResultMinor, '90000')
  assert.equal(result.response.payload.data.objects[0].laborCostBreakdown.byWorker['worker-secret'], '10000')
})

test('organization portfolio does not require clientId and COST_CONTROL trend exposes only safe cost data', async () => {
  const result = await executeGet('COST_CONTROL', { view: 'portfolio', clientId: '' })

  assert.deepEqual(result.errors, [])
  assert.equal(result.response.status, 200)
  assert.equal(result.response.payload.data.objects[0].clientId, 'client-1')
  assert.deepEqual(result.response.payload.data.trend.points, [{
    period: '2026-08',
    totalCostMinor: '15000',
    completenessBps: '10000',
    incomplete: false,
  }])
  const leakedTrendKeys = []
  walk(result.response.payload.data.trend, (_value, path) => {
    const key = path.split('.').at(-1).replace(/\[\d+\]$/, '')
    if (FORBIDDEN_COST_CONTROL_KEY.test(key)) leakedTrendKeys.push(path)
  })
  assert.deepEqual(leakedTrendKeys, [])
})

test('COST_CONTROL history is server-projected and cannot expose contract audit text', async () => {
  const restricted = await executeGet('COST_CONTROL', { view: 'history' })
  assert.deepEqual(restricted.errors, [])
  assert.deepEqual(restricted.response.payload.data.history, [{
    action: 'CREATE_FINANCIAL_ENTRY',
    changedAt: '2026-09-25T10:00:00Z',
    objectId: 'object-1',
    recordType: 'OPERATIONAL_COST',
  }])
  assert.doesNotMatch(JSON.stringify(restricted.response.payload), /SECRET|CONTRACT|REVENUE/)

  const owner = await executeGet('OWNER_FULL', { view: 'history' })
  assert.equal(owner.response.payload.data.history.length, 2)
  assert.equal(owner.response.payload.data.history[1].reason, 'SECRET REVENUE 100000')
})
