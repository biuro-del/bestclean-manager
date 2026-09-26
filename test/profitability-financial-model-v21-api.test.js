'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const { createProfitabilityApi } = require('../profitability-api')

function repositoryStub(financeProfile = 'OWNER_FULL') {
  return {
    async listServiceObjectsForClient() {
      return [{ object_id: 'object-1', client_id: 'client-1', name: 'Obiekt', timezone: 'Europe/Warsaw' }]
    },
    async loadObjectCalculationInput() {
      return {
        accessProfileVersion: 'v2', clientId: 'client-1', contractConfigured: true,
        contractRevenues: [{
          id: 'contract-1', orgId: 'org-a', objectId: 'object-1', amountMinor: '10000',
          currency: 'PLN', category: 'CONTRACT', recurrence: 'MONTHLY',
          activeFrom: '2026-09-01',
        }],
        currency: 'PLN', equipment: [], laborSessions: [], materialCosts: [],
        objectId: 'object-1', orgId: 'org-a', otherCosts: [],
        period: { start: '2026-09-01', end: '2026-10-01' }, periodicWorks: [],
        workerRates: [],
      }
    },
    async listProfitabilityTrend() {
      return { source: 'PROFITABILITY_SNAPSHOT', window: {}, points: [] }
    },
    async resolveAccessProfileV2() {
      return {
        financeProfile, objectScope: 'ALL',
        capabilities: {
          editContractTerms: true, editProfitabilityTargets: true,
          editWorkerRates: true, editOperationalCosts: true,
        },
      }
    },
  }
}

function makeApi({
  body = {},
  environment,
  errors = [],
  financeProfile = 'OWNER_FULL',
  missingRelation = '',
  repository: suppliedRepository,
  repositoryOptions = [],
  responses = [],
}) {
  return createProfitabilityApi({
    environment,
    async connectDbClient() {
      return {
        async query(sql) {
          if (/profitability_access_enforcement/i.test(sql)) {
            return { rows: [{ schema_version: 'v2' }] }
          }
          if (/profitability_financial_model_enforcement/i.test(sql)) {
            return { rows: [{ schema_version: 'v2.1' }] }
          }
          throw new Error(`Unexpected query: ${sql}`)
        },
        release() {},
      }
    },
    createRepository(_client, options) {
      repositoryOptions.push(options)
      return suppliedRepository ?? repositoryStub(financeProfile)
    },
    async databaseRelationExists(_client, relation) {
      return relation !== missingRelation
    },
    parseBearerToken() { return 'token' },
    async readJsonBody() { return body },
    sendApiError(_res, status, code, message, details) {
      errors.push({ status, code, message, details })
    },
    sendJson(_res, status, payload) { responses.push({ status, payload }) },
    async verifyFirebaseIdToken() { return { uid: 'owner-1' } },
  })
}

const url = new URL(
  'http://localhost/api/portal/profitability?orgId=org-a&clientId=client-1&objectId=object-1&period=2026-09',
)

test('API activates V2.1 only with marker, flags, allowlist and complete schema', async () => {
  const errors = []
  const responses = []
  const repositoryOptions = []
  const api = makeApi({
    environment: {
      PROFITABILITY_ACCESS_PROFILE_V2_ENABLED: 'true',
      PROFITABILITY_ACCESS_PROFILE_V2_ALLOWED_ORG_IDS: 'org-a',
      PROFITABILITY_FINANCIAL_MODEL_V21_ENABLED: 'true',
      PROFITABILITY_FINANCIAL_MODEL_V21_ALLOWED_ORG_IDS: 'org-a',
    },
    errors,
    repositoryOptions,
    responses,
  })

  await api.handle({ method: 'GET' }, {}, url)

  assert.deepEqual(errors, [])
  assert.equal(responses[0].status, 200)
  assert.equal(repositoryOptions[0].financialModelV21.enabled, true)
  assert.equal(responses[0].payload.data.capability.financialModelVersion, 'v2.1')
})

test('persistent marker blocks foundation fallback when V2.1 rollout is disabled', async () => {
  const errors = []
  const api = makeApi({
    environment: {
      PROFITABILITY_ACCESS_PROFILE_V2_ENABLED: 'true',
      PROFITABILITY_ACCESS_PROFILE_V2_ALLOWED_ORG_IDS: 'org-a',
    },
    errors,
  })

  await api.handle({ method: 'GET' }, {}, url)

  assert.equal(errors[0].status, 503)
  assert.equal(errors[0].code, 'PROFITABILITY_FINANCIAL_MODEL_NOT_READY')
})

test('V2.1 fails closed when one required effective relation is missing', async () => {
  const errors = []
  const api = makeApi({
    environment: {
      PROFITABILITY_ACCESS_PROFILE_V2_ENABLED: 'true',
      PROFITABILITY_ACCESS_PROFILE_V2_ALLOWED_ORG_IDS: 'org-a',
      PROFITABILITY_FINANCIAL_MODEL_V21_ENABLED: 'true',
      PROFITABILITY_FINANCIAL_MODEL_V21_ALLOWED_ORG_IDS: 'org-a',
    },
    errors,
    missingRelation: 'public.profitability_effective_hygiene_package',
  })

  await api.handle({ method: 'GET' }, {}, url)

  assert.equal(errors[0].status, 503)
  assert.equal(errors[0].code, 'PROFITABILITY_FINANCIAL_MODEL_NOT_READY')
})

const v21Environment = {
  PROFITABILITY_ACCESS_PROFILE_V2_ENABLED: 'true',
  PROFITABILITY_ACCESS_PROFILE_V2_ALLOWED_ORG_IDS: 'org-a',
  PROFITABILITY_FINANCIAL_MODEL_V21_ENABLED: 'true',
  PROFITABILITY_FINANCIAL_MODEL_V21_ALLOWED_ORG_IDS: 'org-a',
}

function hygieneRepository(financeProfile, onSave = () => {}) {
  const rawRow = () => ({
    org_id: 'org-a', object_id: 'object-1', package_id: 'package-1',
    package_version_id: 'package-version-1', version_no: 1,
    package_name: 'Pakiet', billing_mode: 'IN_CONTRACT', value_basis: 'ACTUAL',
    price_net_minor: '999999', cost_minor: '12000', currency: 'PLN',
    recognition_key: 'hygiene:2026-09', effective_from: '2026-09-01',
    effective_to: null, occurred_on: null, status: 'POSTED',
    created_by_uid: 'SECRET-UID', created_at: 'SECRET-TIMESTAMP',
    recognized_revenue_minor: '999999', margin_bps: 9876,
  })
  return {
    async resolveAccessProfileV2() {
      return {
        financeProfile,
        objectScope: 'ALL',
        capabilities: {
          editContractTerms: financeProfile === 'OWNER_FULL',
          editProfitabilityTargets: financeProfile === 'OWNER_FULL',
          editWorkerRates: financeProfile === 'OWNER_FULL',
          editOperationalCosts: true,
        },
      }
    },
    async saveHygienePackage(input) {
      onSave(input)
      return rawRow()
    },
    async archiveHygienePackage() {
      return { ...rawRow(), status: 'ARCHIVED', archived_by_uid: 'SECRET-UID' }
    },
  }
}

function hygieneBody(packageInput) {
  return {
    action: 'save-hygiene-package',
    commandId: 'hygiene-command-1',
    orgId: 'org-a', clientId: 'client-1', objectId: 'object-1', period: '2026-09',
    package: packageInput,
  }
}

test('COST_CONTROL rejects price, margin and revenue fields before calling hygiene repository', async () => {
  let saveCalls = 0
  const errors = []
  const api = makeApi({
    body: hygieneBody({
      billingMode: 'IN_CONTRACT', costMinor: '12000', priceNetMinor: '15000',
      marginBps: 2000, recognizedRevenueMinor: '15000',
    }),
    environment: v21Environment,
    errors,
    financeProfile: 'COST_CONTROL',
    repository: hygieneRepository('COST_CONTROL', () => { saveCalls += 1 }),
  })

  await api.handle({ method: 'POST' }, {}, url)

  assert.equal(saveCalls, 0)
  assert.equal(errors[0].status, 403)
  assert.equal(errors[0].code, 'PROFITABILITY_HYGIENE_FINANCIAL_FIELDS_FORBIDDEN')
  assert.deepEqual(errors[0].details.fields, ['marginBps', 'priceNetMinor', 'recognizedRevenueMinor'])
})

test('COST_CONTROL can save only IN_CONTRACT and receives an allowlisted cost-only response', async () => {
  let savedInput
  const responses = []
  const api = makeApi({
    body: hygieneBody({
      billingMode: 'IN_CONTRACT', costMinor: '12000', priceNetMinor: '', marginBps: '',
      packageName: 'Pakiet', effectiveFrom: '2026-09-01',
      recognitionKey: 'hygiene:2026-09', valueBasis: 'ACTUAL',
    }),
    environment: v21Environment,
    financeProfile: 'COST_CONTROL',
    repository: hygieneRepository('COST_CONTROL', (input) => { savedInput = input }),
    responses,
  })

  await api.handle({ method: 'POST' }, {}, url)

  assert.equal(savedInput.package.billingMode, 'IN_CONTRACT')
  assert.equal('priceNetMinor' in savedInput.package, false)
  assert.equal('marginBps' in savedInput.package, false)
  assert.deepEqual(responses[0].payload.data.saved, {
    billingMode: 'IN_CONTRACT',
    costMinor: '12000',
    currency: 'PLN',
    effectiveFrom: '2026-09-01',
    packageId: 'package-1',
    packageName: 'Pakiet',
    packageVersionId: 'package-version-1',
    recognitionKey: 'hygiene:2026-09',
    status: 'POSTED',
    valueBasis: 'ACTUAL',
    versionNo: 1,
  })
})

test('COST_CONTROL cannot save a separately billed hygiene package', async () => {
  let saveCalls = 0
  const errors = []
  const api = makeApi({
    body: hygieneBody({ billingMode: 'MONTHLY_EXTRA', costMinor: '12000' }),
    environment: v21Environment,
    errors,
    repository: hygieneRepository('COST_CONTROL', () => { saveCalls += 1 }),
  })

  await api.handle({ method: 'POST' }, {}, url)

  assert.equal(saveCalls, 0)
  assert.equal(errors[0].status, 403)
  assert.equal(errors[0].code, 'PROFITABILITY_HYGIENE_CONTRACT_TERMS_FORBIDDEN')
})

test('OWNER_FULL hygiene mutation is allowlisted and never returns raw database metadata', async () => {
  const responses = []
  const api = makeApi({
    body: hygieneBody({ billingMode: 'MONTHLY_EXTRA', costMinor: '12000' }),
    environment: v21Environment,
    repository: hygieneRepository('OWNER_FULL'),
    responses,
  })

  await api.handle({ method: 'POST' }, {}, url)

  const saved = responses[0].payload.data.saved
  assert.equal(saved.priceNetMinor, '999999')
  assert.equal(saved.costMinor, '12000')
  assert.equal('created_by_uid' in saved, false)
  assert.equal('created_at' in saved, false)
  assert.equal('recognized_revenue_minor' in saved, false)
  assert.equal('margin_bps' in saved, false)
  assert.equal('org_id' in saved, false)
  assert.equal('object_id' in saved, false)
})

test('COST_CONTROL archive response is projected and does not echo stored sales data', async () => {
  const responses = []
  const api = makeApi({
    body: {
      action: 'archive-hygiene-package', commandId: 'hygiene-archive-1',
      orgId: 'org-a', clientId: 'client-1', objectId: 'object-1', period: '2026-09',
      packageVersionId: 'package-version-1', reason: 'ZakoĹ„czono pakiet',
    },
    environment: v21Environment,
    repository: hygieneRepository('COST_CONTROL'),
    responses,
  })

  await api.handle({ method: 'POST' }, {}, url)

  const saved = responses[0].payload.data.saved
  assert.equal(saved.status, 'ARCHIVED')
  assert.equal(saved.costMinor, '12000')
  assert.equal('priceNetMinor' in saved, false)
  assert.equal('recognized_revenue_minor' in saved, false)
  assert.equal('archived_by_uid' in saved, false)
})
