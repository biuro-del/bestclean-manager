'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  aggregateSnapshotTrend,
  ProfitabilityApiError,
  buildSummary,
  createProfitabilityApi,
  mapError,
  monthPeriod,
} = require('../profitability-api')

const PERIOD = { start: '2026-07-01', end: '2026-08-01' }

function entry(id, amountMinor, category = 'OTHER') {
  return {
    id,
    orgId: 'ORG-1',
    objectId: 'OBJ-1',
    amountMinor,
    currency: 'PLN',
    category,
    name: category,
    activeFrom: PERIOD.start,
    recurrence: 'MONTHLY',
    source: 'MANUAL',
  }
}

test('miesiąc jest zamieniany na półotwarty okres bez obliczeń zmiennoprzecinkowych', () => {
  assert.deepEqual(monthPeriod('2026-07'), {
    key: '2026-07',
    start: '2026-07-01',
    end: '2026-08-01',
  })
  assert.deepEqual(monthPeriod('2026-12'), {
    key: '2026-12',
    start: '2026-12-01',
    end: '2027-01-01',
  })
  assert.throws(() => monthPeriod('2026-13'), (error) => error.code === 'PROFITABILITY_INVALID_PERIOD')
})

test('trend klienta sumuje snapshoty obiektów w minor units i oznacza brak pokrycia jako niepełny', () => {
  const window = { start: '2025-08-01', end: '2026-08-01', months: 12 }
  const base = {
    completenessBps: '10000',
    currency: 'PLN',
    status: 'CALCULATED',
  }
  const trend = aggregateSnapshotTrend([
    {
      window,
      points: [
        { ...base, period: '2026-06', revenueMinor: '3000000', totalCostMinor: '2300000', marginMinor: '700000', snapshotId: 'S1' },
        { ...base, period: '2026-07', revenueMinor: '3100000', totalCostMinor: '2400000', marginMinor: '700000', snapshotId: 'S2' },
      ],
    },
    {
      window,
      points: [
        { ...base, period: '2026-07', revenueMinor: '1900000', totalCostMinor: '1600000', marginMinor: '300000', snapshotId: 'S3' },
      ],
    },
  ], 2, 'PLN')

  assert.equal(trend.points[0].period, '2026-06')
  assert.equal(trend.points[0].incomplete, true)
  assert.equal(trend.points[0].totalCostMinor, null)
  assert.equal(trend.points[0].completenessBps, 5000n)
  assert.equal(trend.points[1].period, '2026-07')
  assert.equal(trend.points[1].revenueMinor, 5000000n)
  assert.equal(trend.points[1].totalCostMinor, 4000000n)
  assert.equal(trend.points[1].marginMinor, 1000000n)
  assert.equal(trend.points[1].profitabilityBps, 2000n)
  assert.equal(trend.points[1].incomplete, false)
})

test('API mapuje wzorcowy wynik 30k / 23.5k / 6.5k / 21.67% do kontraktu frontendu', async () => {
  const repository = {
    async listServiceObjectsForClient() {
      return [{ object_id: 'OBJ-1', name: 'Best Clean', timezone: 'Europe/Warsaw' }]
    },
    async loadObjectCalculationInput() {
      return {
        orgId: 'ORG-1',
        objectId: 'OBJ-1',
        clientId: 'CLIENT-1',
        currency: 'PLN',
        period: PERIOD,
        contractRevenues: [entry('CONTRACT', '3000000', 'CONTRACT')],
        additionalRevenues: [],
        laborSessions: [{
          id: 'EV-1',
          orgId: 'ORG-1',
          objectId: 'OBJ-1',
          workerLogin: 'worker@example.com',
          startAt: '2026-07-01T00:00:00Z',
          endAt: '2026-07-08T12:00:00Z',
        }],
        workerRates: [{
          id: 'RATE-1',
          orgId: 'ORG-1',
          objectId: 'OBJ-1',
          workerLogin: 'worker@example.com',
          hourlyCostMinor: '10000',
          currency: 'PLN',
          effectiveFrom: '2026-01-01',
        }],
        materialCosts: [entry('MATERIAL', '200000', 'MATERIAL')],
        otherCosts: [entry('TRANSPORT', '150000', 'TRANSPORT')],
        equipment: [{
          id: 'EQ-1',
          orgId: 'ORG-1',
          objectId: 'OBJ-1',
          financing: 'RENTAL',
          recognitionMethod: 'INSTALLMENT',
          monthlyInstallmentMinor: '100000',
          currency: 'PLN',
          startedOn: '2026-01-01',
        }],
        periodicWorks: [{
          id: 'PW-1',
          name: 'Mycie okien',
          plannedOn: '2026-07-14',
          executedOn: '2026-07-15',
          status: 'COMPLETED',
          orgId: 'ORG-1',
          objectId: 'OBJ-1',
          laborSessionIds: [],
          directCostEntries: [entry('PERIODIC-COST', '100000', 'PERIODIC_DIRECT')],
          revenueEntries: [entry('PERIODIC-REVENUE', '0', 'REVENUE')],
        }],
      }
    },
    async listProfitabilityTrend() {
      return {
        source: 'PROFITABILITY_SNAPSHOT',
        window: { start: '2025-08-01', end: '2026-08-01', months: 12 },
        points: [{
          completenessBps: '10000',
          currency: 'PLN',
          marginMinor: '600000',
          objectId: 'OBJ-1',
          period: '2026-06',
          profitabilityBps: '2069',
          revenueMinor: '2900000',
          snapshotId: 'SNAP-1',
          status: 'CALCULATED',
          totalCostMinor: '2300000',
        }],
      }
    },
  }

  const payload = await buildSummary(repository, {
    orgId: 'ORG-1',
    clientId: 'CLIENT-1',
    period: PERIOD,
    uid: 'USER-1',
  })

  assert.equal(payload.summary.revenueMinor, 3000000n)
  assert.equal(payload.summary.totalCostMinor, 2350000n)
  assert.equal(payload.summary.marginMinor, 650000n)
  assert.equal(payload.summary.profitabilityBps, 2167n)
  assert.equal(payload.objects[0].laborCostMinor, 1800000n)
  assert.equal(payload.objects[0].materialCostMinor, 200000n)
  assert.equal(payload.objects[0].equipmentCostMinor, 100000n)
  assert.equal(payload.objects[0].periodicCostMinor, 100000n)
  assert.equal(payload.objects[0].otherDirectCostMinor, 150000n)
  assert.equal(payload.objects[0].laborComparison.actualSeconds, 648000n)
  assert.equal(payload.objects[0].laborCostBreakdown.byWorker['worker@example.com'], 1800000n)
  assert.equal(payload.objects[0].periodicBreakdown[0].name, 'Mycie okien')
  assert.equal(payload.objects[0].periodicBreakdown[0].plannedAt, '2026-07-14')
  assert.equal(payload.objects[0].periodicBreakdown[0].performedAt, '2026-07-15')
  assert.equal(payload.objects[0].costEntries[0].amountMinor, '200000')
  assert.equal(payload.objects[0].costEntries[0].name, 'MATERIAL')
  assert.equal(payload.objects[0].costEntries[0].source, 'MANUAL')
  assert.equal(payload.summary.objectCount, 1)
  assert.equal(payload.summary.profitableObjects, 1)
  assert.equal(payload.summary.unprofitableObjects, 0)
  assert.equal(payload.summary.notCalculableObjects, 0)
  assert.equal(payload.summary.laborComparison.actualCostMinor, 1800000n)
  assert.equal(payload.summary.periodicBreakdown[0].objectName, 'Best Clean')
  assert.equal(payload.trend.status, 'AVAILABLE')
  assert.equal(payload.trend.points[0].revenueMinor, 2900000n)
  assert.equal(payload.trend.points[0].profitabilityBps, 2069n)
  assert.equal(payload.trend.points[0].objectCount, 1)
  assert.equal(payload.warnings.length, 0)
})

test('brak stawki pozostaje niepełnym wynikiem i nie jest zamieniany na koszt zero', async () => {
  const repository = {
    async listServiceObjectsForClient() {
      return [{ object_id: 'OBJ-1', name: 'Obiekt 1', timezone: 'Europe/Warsaw' }]
    },
    async loadObjectCalculationInput() {
      return {
        orgId: 'ORG-1', objectId: 'OBJ-1', clientId: 'CLIENT-1', currency: 'PLN', period: PERIOD,
        contractRevenues: [entry('CONTRACT', '3000000')], additionalRevenues: [], materialCosts: [],
        otherCosts: [], equipment: [], periodicWorks: [], workerRates: [],
        laborSessions: [{
          id: 'EV-1', orgId: 'ORG-1', objectId: 'OBJ-1', workerLogin: 'worker',
          startAt: '2026-07-10T10:00:00Z', endAt: '2026-07-10T11:00:00Z',
        }],
      }
    },
    async listProfitabilityTrend() {
      return {
        source: 'PROFITABILITY_SNAPSHOT',
        window: { start: '2025-08-01', end: '2026-08-01', months: 12 },
        points: [],
      }
    },
  }
  const payload = await buildSummary(repository, { orgId: 'ORG-1', clientId: 'CLIENT-1', period: PERIOD, uid: 'U-1' })
  assert.equal(payload.summary.totalCostMinor, null)
  assert.equal(payload.summary.marginMinor, null)
  assert.equal(payload.summary.profitabilityBps, null)
  assert.equal(payload.summary.laborCostMinor, null)
  assert.equal(payload.summary.incomplete, true)
  assert.equal(payload.summary.notCalculableObjects, 1)
  assert.equal(payload.trend.status, 'EMPTY')
  assert.match(payload.trend.emptyReason, /Brak historycznych snapshotów/)
  assert.ok(payload.warnings.some((warning) => warning.code === 'MISSING_RATE'))
})

test('filtr obiektu nie zwraca danych innego obiektu klienta', async () => {
  const repository = {
    async listServiceObjectsForClient() {
      return [{ object_id: 'OBJ-1', name: 'Obiekt 1', timezone: 'Europe/Warsaw' }]
    },
  }
  await assert.rejects(
    buildSummary(repository, {
      orgId: 'ORG-1',
      clientId: 'CLIENT-1',
      objectId: 'OBJ-2',
      period: PERIOD,
      uid: 'U-1',
    }),
    (error) => error.code === 'PROFITABILITY_OBJECT_NOT_FOUND' && error.statusCode === 404,
  )
})

test('błędy schematu i walidacji mają stabilne publiczne kody', () => {
  const schema = mapError({ code: '42P01' })
  assert.equal(schema.statusCode, 503)
  assert.equal(schema.code, 'PROFITABILITY_SCHEMA_NOT_READY')

  const validation = mapError(new TypeError('invalid field'))
  assert.equal(validation.statusCode, 400)
  assert.equal(validation.code, 'PROFITABILITY_VALIDATION_ERROR')

  const explicit = new ProfitabilityApiError(409, 'CUSTOM', 'Conflict')
  assert.equal(mapError(explicit), explicit)

  const incomplete = mapError({ code: 'INCOMPLETE_DATA', details: [{ code: 'MISSING_RATE' }] })
  assert.equal(incomplete.statusCode, 409)
  assert.equal(incomplete.code, 'PROFITABILITY_PERIOD_INCOMPLETE')

  const invalidConstraint = mapError({ code: '23514' })
  assert.equal(invalidConstraint.statusCode, 400)
  assert.equal(invalidConstraint.code, 'PROFITABILITY_VALIDATION_ERROR')

  const missingReference = mapError({ code: '23503' })
  assert.equal(missingReference.statusCode, 400)
  assert.equal(missingReference.code, 'PROFITABILITY_REFERENCE_NOT_FOUND')

  const scoped = mapError({ code: 'OBJECT_NOT_FOUND', message: 'missing', statusCode: 404 })
  assert.equal(scoped.statusCode, 404)
  assert.equal(scoped.code, 'PROFITABILITY_OBJECT_NOT_FOUND')
})

test('publiczne POST-y delegują zapis i zamknięcie do transakcyjnego repozytorium', async () => {
  const calls = []
  const responses = []
  const errors = []
  let requestBody = {}
  const repository = {
    async createContractVersion(input) {
      calls.push({ method: 'createContractVersion', input })
      return { id: 'CONTRACT-1' }
    },
    async createCost(input) {
      calls.push({ method: 'createCost', input })
      return { id: 'COST-1' }
    },
    async createRevenue(input) {
      calls.push({ method: 'createRevenue', input })
      return { id: 'REVENUE-1' }
    },
    async createWorkerRateVersion(input) {
      calls.push({ method: 'createWorkerRateVersion', input })
      return { id: 'RATE-1' }
    },
    async createEquipment(input) {
      calls.push({ method: 'createEquipment', input })
      return { id: 'ASSET-1' }
    },
    async closePeriod(input) {
      calls.push({ method: 'closePeriod', input })
      return { id: 'SNAPSHOT-1' }
    },
  }
  const api = createProfitabilityApi({
    async connectDbClient() {
      return { release() {} }
    },
    createRepository() {
      return repository
    },
    async databaseRelationExists() {
      return true
    },
    parseBearerToken() {
      return 'TOKEN'
    },
    async readJsonBody() {
      return requestBody
    },
    sendApiError(_res, status, code, message, details) {
      errors.push({ status, code, message, details })
    },
    sendJson(_res, status, payload) {
      responses.push({ status, payload })
    },
    async verifyFirebaseIdToken() {
      return { uid: 'UID-1' }
    },
  })
  const requestUrl = new URL(
    'http://localhost/api/portal/profitability?orgId=ORG-1&clientId=CLIENT-1&objectId=OBJ-1&period=2026-07',
  )

  for (const fixture of [
    { action: 'upsert-contract', payload: { contract: { contractName: 'Kontrakt' } }, method: 'createContractVersion' },
    { action: 'create-cost', payload: { cost: { name: 'Chemia' } }, method: 'createCost' },
    { action: 'create-revenue', payload: { revenue: { name: 'Usługa dodatkowa' } }, method: 'createRevenue' },
    { action: 'upsert-worker-rate', payload: { rate: { workerLogin: 'worker@example.com' } }, method: 'createWorkerRateVersion' },
    { action: 'upsert-asset', payload: { asset: { name: 'Szorowarka' } }, method: 'createEquipment' },
    { action: 'close-period', payload: { reason: 'Miesiąc sprawdzony' }, method: 'closePeriod' },
  ]) {
    requestBody = { action: fixture.action, ...fixture.payload }
    await api.handle({ method: 'POST' }, {}, requestUrl)
    assert.equal(calls.at(-1).method, fixture.method)
    assert.equal(calls.at(-1).input.orgId, 'ORG-1')
    assert.equal(calls.at(-1).input.clientId, 'CLIENT-1')
    assert.equal(calls.at(-1).input.objectId, 'OBJ-1')
    assert.equal(calls.at(-1).input.uid, 'UID-1')
  }

  assert.equal(errors.length, 0)
  assert.equal(responses.length, 6)
  const closeInput = calls.find((call) => call.method === 'closePeriod').input
  assert.equal(closeInput.periodId, '2026-07:OBJ-1')
  assert.deepEqual(closeInput.period, { key: '2026-07', ...PERIOD })
})
