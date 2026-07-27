'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  CALCULATION_STATUS,
  ISSUE_CODE,
  aggregateClientProfitability,
  calculateEntries,
  calculateEquipmentCostForPeriod,
  calculateLaborCost,
  calculateObjectProfitability,
  createProfitabilitySnapshot,
  minorUnits,
  normalizeCurrency,
} = require('./domain')

const PERIOD = Object.freeze({ start: '2026-07-01', end: '2026-08-01' })

function scoped(objectId = 'OBJ-1') {
  return { orgId: 'ORG-1', objectId }
}

function entry(id, amountMinor, overrides = {}) {
  return {
    ...scoped(overrides.objectId),
    activeFrom: '2026-07-01',
    amountMinor,
    category: 'OTHER',
    currency: 'PLN',
    id,
    recurrence: 'MONTHLY',
    ...overrides,
  }
}

function rate(id, workerLogin, hourlyCostMinor, overrides = {}) {
  return {
    ...scoped(overrides.objectId),
    currency: 'PLN',
    effectiveFrom: '2026-01-01',
    hourlyCostMinor,
    id,
    workerLogin,
    ...overrides,
  }
}

function session(id, workerLogin, startAt, endAt, overrides = {}) {
  return {
    ...scoped(overrides.objectId),
    endAt,
    id,
    startAt,
    workerLogin,
    ...overrides,
  }
}

function baseInput(objectId = 'OBJ-1', overrides = {}) {
  return {
    ...scoped(objectId),
    additionalRevenues: [],
    clientId: 'CLIENT-1',
    contractRevenues: [entry(`CONTRACT-${objectId}`, 3000000, { objectId })],
    currency: 'PLN',
    equipment: [],
    laborSessions: [],
    materialCosts: [],
    otherCosts: [],
    period: PERIOD,
    periodicWorks: [],
    workerRates: [],
    ...overrides,
  }
}

test('test wzorcowy: 30k przychodu daje 23.5k kosztu, 6.5k marży i 21.67%', () => {
  const laborSession = session(
    'EV-1',
    'worker@example.com',
    '2026-07-01T00:00:00.000Z',
    '2026-07-08T12:00:00.000Z',
  )
  const result = calculateObjectProfitability(baseInput('OBJ-1', {
    equipment: [{
      ...scoped(),
      currency: 'PLN',
      financing: 'RENTAL',
      id: 'EQ-1',
      monthlyInstallmentMinor: 100000,
      recognitionMethod: 'INSTALLMENT',
      startedOn: '2026-01-01',
    }],
    laborSessions: [laborSession],
    materialCosts: [entry('MAT-1', 200000)],
    otherCosts: [entry('TRANSPORT-1', 150000)],
    periodicWorks: [{
      ...scoped(),
      directCostEntries: [entry('PERIODIC-COST-1', 100000)],
      id: 'PW-1',
      laborSessionIds: [],
      revenueEntries: [entry('PERIODIC-REVENUE-1', 0)],
    }],
    workerRates: [rate('RATE-1', 'worker@example.com', 10000)],
  }))

  assert.equal(result.complete, true)
  assert.equal(result.revenueMinor, 3000000n)
  assert.equal(result.totalCostMinor, 2350000n)
  assert.equal(result.marginMinor, 650000n)
  assert.equal(result.profitabilityBps, 2167n)
})

test('klient z jednym obiektem zachowuje wynik obiektu w agregacji', () => {
  const objectResult = calculateObjectProfitability(baseInput())
  const clientResult = aggregateClientProfitability([objectResult])
  assert.equal(clientResult.objectCount, 1)
  assert.equal(clientResult.revenueMinor, 3000000n)
  assert.equal(clientResult.totalCostMinor, 0n)
  assert.equal(clientResult.marginMinor, 3000000n)
})

test('agreguje wiele obiektów wyłącznie w tym samym kliencie i okresie', () => {
  const first = calculateObjectProfitability(baseInput('OBJ-1', {
    contractRevenues: [entry('CONTRACT-1', 200000, { objectId: 'OBJ-1' })],
    materialCosts: [entry('COST-1', 50000, { objectId: 'OBJ-1' })],
  }))
  const second = calculateObjectProfitability(baseInput('OBJ-2', {
    contractRevenues: [entry('CONTRACT-2', 400000, { objectId: 'OBJ-2' })],
    otherCosts: [entry('COST-2', 100000, { objectId: 'OBJ-2' })],
  }))
  const result = aggregateClientProfitability([first, second])
  assert.equal(result.objectCount, 2)
  assert.equal(result.revenueMinor, 600000n)
  assert.equal(result.totalCostMinor, 150000n)
  assert.equal(result.marginMinor, 450000n)
  assert.equal(result.profitableObjects, 2)
})

test('zmiana stawki w połowie miesiąca nie przelicza wcześniejszej sesji', () => {
  const result = calculateLaborCost({
    ...scoped(),
    currency: 'PLN',
    rates: [
      rate('RATE-A', 'worker', 1000, { effectiveFrom: '2026-07-01', effectiveTo: '2026-07-15' }),
      rate('RATE-B', 'worker', 2000, { effectiveFrom: '2026-07-15' }),
    ],
    sessions: [
      session('EV-A', 'worker', '2026-07-10T10:00:00Z', '2026-07-10T11:00:00Z'),
      session('EV-B', 'worker', '2026-07-20T10:00:00Z', '2026-07-20T11:00:00Z'),
    ],
  })
  assert.equal(result.complete, true)
  assert.equal(result.actualCostMinor, 3000n)
})

test('nakładające się stawki są błędem jakości danych, nie wyborem losowej stawki', () => {
  const result = calculateLaborCost({
    ...scoped(),
    currency: 'PLN',
    rates: [
      rate('RATE-A', 'worker', 1000, { effectiveFrom: '2026-07-01' }),
      rate('RATE-B', 'worker', 2000, { effectiveFrom: '2026-07-10' }),
    ],
    sessions: [session('EV-1', 'worker', '2026-07-20T10:00:00Z', '2026-07-20T11:00:00Z')],
  })
  assert.equal(result.complete, false)
  assert.equal(result.actualCostMinor, null)
  assert.ok(result.issues.some((issue) => issue.code === ISSUE_CODE.OVERLAPPING_RATE))
})

test('brak stawki oznacza niepełne dane i nie zwraca kosztu zero', () => {
  const result = calculateObjectProfitability(baseInput('OBJ-1', {
    laborSessions: [session('EV-1', 'worker', '2026-07-10T10:00:00Z', '2026-07-10T11:00:00Z')],
  }))
  assert.equal(result.complete, false)
  assert.equal(result.totalCostMinor, null)
  assert.equal(result.marginMinor, null)
  assert.equal(result.profitabilityBps, null)
  assert.equal(result.status, CALCULATION_STATUS.INCOMPLETE)
  assert.ok(result.issues.some((issue) => issue.code === ISSUE_CODE.MISSING_RATE))
})

test('otwarty START bez STOP oznacza niepełne dane i nie zwraca kosztu zero', () => {
  const result = calculateObjectProfitability(baseInput('OBJ-1', {
    laborSessions: [session('EV-OPEN', 'worker', '2026-07-10T10:00:00Z', null)],
    workerRates: [rate('RATE-1', 'worker', 2500)],
  }))
  assert.equal(result.totalCostMinor, null)
  assert.equal(result.status, CALCULATION_STATUS.INCOMPLETE)
  assert.ok(result.issues.some((issue) => issue.code === ISSUE_CODE.OPEN_START_STOP))
})

test('praca okresowa alokuje koszt pracy, ale nie nalicza tej samej sesji drugi raz', () => {
  const sharedSession = session('EV-SHARED', 'worker', '2026-07-10T10:00:00Z', '2026-07-10T12:00:00Z')
  const sharedDirectCost = entry('DIRECT-SHARED', 5000)
  const result = calculateObjectProfitability(baseInput('OBJ-1', {
    laborSessions: [sharedSession, { ...sharedSession }],
    otherCosts: [sharedDirectCost],
    periodicWorks: [{
      ...scoped(),
      directCostEntries: [{ ...sharedDirectCost }],
      id: 'PW-1',
      laborSessionIds: ['EV-SHARED', 'EV-SHARED'],
      revenueEntries: [entry('PW-REV-1', 0)],
    }],
    workerRates: [rate('RATE-1', 'worker', 3000)],
  }))
  assert.equal(result.complete, true)
  assert.equal(result.costBreakdown.laborMinor, 6000n)
  assert.equal(result.costBreakdown.directMinor, 5000n)
  assert.equal(result.totalCostMinor, 11000n)
  assert.equal(result.periodicBreakdown[0].allocatedLaborMinor, 6000n)
})

test('porównanie planu z wykonaniem oraz przekroje pracownik/strefa/zadanie są wyliczane osobno', () => {
  const result = calculateObjectProfitability(baseInput('OBJ-1', {
    laborSessions: [session(
      'EV-ACTUAL',
      'worker',
      '2026-07-10T10:00:00Z',
      '2026-07-10T12:00:00Z',
      { taskId: 'TASK-1', zoneId: 'ZONE-1' },
    )],
    plannedLaborSessions: [session(
      'PLAN-1',
      'worker',
      '2026-07-10T10:00:00Z',
      '2026-07-10T11:00:00Z',
      { taskId: 'TASK-1', zoneId: 'ZONE-1' },
    )],
    workerRates: [rate('RATE-1', 'worker', 3000)],
  }))
  assert.equal(result.laborComparison.actualSeconds, 7200n)
  assert.equal(result.laborComparison.plannedSeconds, 3600n)
  assert.equal(result.laborComparison.secondsDelta, 3600n)
  assert.equal(result.laborComparison.costDeltaMinor, 3000n)
  assert.equal(result.laborCostBreakdown.byWorker.worker, 6000n)
  assert.equal(result.laborCostBreakdown.byZone['ZONE-1'], 6000n)
  assert.equal(result.laborCostBreakdown.byTask['TASK-1'], 6000n)
})

test('amortyzacja dzieli wartość zakupu na miesiące bez utraty groszy', () => {
  const result = calculateEquipmentCostForPeriod({
    currency: 'PLN',
    equipment: [{
      ...scoped(),
      currency: 'PLN',
      depreciationMonths: 12,
      financing: 'PURCHASE',
      id: 'EQ-1',
      purchaseValueMinor: 100,
      recognitionMethod: 'DEPRECIATION',
      startedOn: '2026-01-01',
    }],
    period: { start: '2026-01-01', end: '2027-01-01' },
    scope: scoped(),
  })
  assert.equal(result.complete, true)
  assert.equal(result.knownCostMinor, 100n)
})

test('zakup bez wyboru sposobu rozliczenia jest niepełny, a nie zerowy', () => {
  const result = calculateEquipmentCostForPeriod({
    currency: 'PLN',
    equipment: [{
      ...scoped(),
      currency: 'PLN',
      financing: 'PURCHASE',
      id: 'EQ-1',
      purchaseValueMinor: 100000,
      recognitionMethod: '',
      startedOn: '2026-01-01',
    }],
    period: PERIOD,
    scope: scoped(),
  })
  assert.equal(result.complete, false)
  assert.ok(result.issues.some((issue) => issue.code === ISSUE_CODE.EQUIPMENT_CONFIGURATION))
})

test('koszt jednorazowy i miesięczny są rozpoznawane tylko w swoim okresie', () => {
  const result = calculateEntries({
    currency: 'PLN',
    entries: [
      entry('MONTHLY', 1000, { activeFrom: '2026-07-01', activeTo: '2026-10-01' }),
      entry('ONE-TIME', 500, { date: '2026-08-12', recurrence: 'ONE_TIME' }),
      entry('OUTSIDE', 999, { date: '2026-10-01', recurrence: 'ONE_TIME' }),
    ],
    label: 'costs',
    period: { start: '2026-07-01', end: '2026-10-01' },
    scope: scoped(),
  })
  assert.equal(result.totalMinor, 3500n)
})

test('zerowy przychód nie generuje mylącego procentu', () => {
  const result = calculateObjectProfitability(baseInput('OBJ-1', {
    contractRevenues: [entry('CONTRACT-ZERO', 0)],
    otherCosts: [entry('COST-1', 10000)],
  }))
  assert.equal(result.complete, true)
  assert.equal(result.marginMinor, -10000n)
  assert.equal(result.profitabilityBps, null)
  assert.equal(result.status, CALCULATION_STATUS.NOT_CALCULABLE)
})

test('agregacja z niepełnym obiektem zachowuje znany koszt, ale blokuje wynik łączny', () => {
  const complete = calculateObjectProfitability(baseInput('OBJ-1'))
  const incomplete = calculateObjectProfitability(baseInput('OBJ-2', {
    laborSessions: [session(
      'EV-OPEN',
      'worker',
      '2026-07-10T10:00:00Z',
      null,
      { objectId: 'OBJ-2' },
    )],
  }))
  const result = aggregateClientProfitability([complete, incomplete])
  assert.equal(result.complete, false)
  assert.equal(result.totalCostMinor, null)
  assert.equal(result.profitabilityBps, null)
})

test('snapshot historyczny pozostaje niezmienny po późniejszej zmianie stawki', () => {
  const input = baseInput('OBJ-1', {
    laborSessions: [session('EV-1', 'worker', '2026-07-10T10:00:00Z', '2026-07-10T11:00:00Z')],
    workerRates: [rate('RATE-1', 'worker', 1000)],
  })
  const originalResult = calculateObjectProfitability(input)
  const snapshot = createProfitabilitySnapshot(originalResult, {
    calculatedAt: '2026-08-01T00:00:00Z',
    dataVersion: 'rates-v1',
    snapshotId: 'SNAP-1',
  })
  const recalculated = calculateObjectProfitability({
    ...input,
    workerRates: [rate('RATE-2', 'worker', 9000)],
  })

  assert.equal(snapshot.calculation.totalCostMinor, '1000')
  assert.equal(recalculated.totalCostMinor, 9000n)
  assert.equal(Object.isFrozen(snapshot), true)
  assert.equal(Object.isFrozen(snapshot.calculation), true)
})

test('kwoty nie przyjmują floatów, a waluta musi być ISO 4217', () => {
  assert.equal(minorUnits('900719925474099312345'), 900719925474099312345n)
  assert.throws(() => minorUnits(1.5), /safe integer/)
  assert.equal(normalizeCurrency('pln'), 'PLN')
  assert.throws(() => normalizeCurrency('ZZZ'), /ISO 4217/)
})

test('rekord kosztu z innej organizacji lub obiektu jest odrzucany', () => {
  assert.throws(
    () => calculateObjectProfitability(baseInput('OBJ-1', {
      otherCosts: [entry('FOREIGN', 1000, { objectId: 'OBJ-2' })],
    })),
    (error) => error.code === 'SCOPE_MISMATCH',
  )
})
