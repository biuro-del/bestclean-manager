'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  FINANCE_PROFILE,
  ProfitabilityProjectionError,
  evaluateProfitabilityTarget,
  projectProfitabilityHistory,
  projectProfitabilityPayload,
} = require('../profitability/projection-v2')

const FORBIDDEN_KEY = /(revenue|profit|margin|target|hourly|rateid|workercost)/i

function fullPayload() {
  return {
    currency: 'PLN',
    period: '2026-09',
    revenueMinor: 9_999_999n,
    profitabilityBps: 2222n,
    targetProfitabilityBps: 2000n,
    freshness: {
      status: 'FRESH',
      asOf: '2026-09-25T08:00:00.000Z',
      internalRevenueChecksum: 'SENTINEL-FRESHNESS-SECRET',
    },
    summary: {
      currency: 'PLN',
      objectCount: 1,
      revenueMinor: 9_999_999n,
      totalCostMinor: 4_800_000n,
      knownCostMinor: 4_800_000n,
      laborCostMinor: 3_000_000n,
      materialCostMinor: 600_000n,
      equipmentCostMinor: 400_000n,
      periodicCostMinor: 300_000n,
      otherDirectCostMinor: 500_000n,
      marginMinor: 5_199_999n,
      profitabilityBps: 5200n,
      targetAmountMinor: 5_000_000n,
      completenessPercent: 97.5,
      incomplete: false,
      laborIncomplete: false,
      laborComparison: {
        actualSeconds: 360_001n,
        plannedSeconds: 350_000n,
        secondsDelta: 10_001n,
        actualCostMinor: 3_000_000n,
        plannedCostMinor: 2_700_000n,
        costDeltaMinor: 300_000n,
      },
      laborCostBreakdown: {
        byWorker: { 'worker@example.com': 3_000_000n },
      },
      costEntries: [
        {
          id: 'COST-SECRET-ID',
          category: 'CHEMICALS',
          amountMinor: '600000',
          name: 'SENTINEL-COST-NAME',
          source: 'SENTINEL-COST-SOURCE',
        },
        { category: 'TRANSPORT', amountMinor: 500_000n },
      ],
      planDataQuality: {
        complete: false,
        issues: [{ code: 'PLAN_GAP', workerLogin: 'SENTINEL-PLAN-WORKER' }],
      },
      operationalStatus: 'BELOW_TARGET',
      improvementGapMinor: 123_456n,
    },
    objects: [
      {
        clientId: 'CLIENT-1',
        objectId: 'OBJ-1',
        name: 'Edukatorium',
        timeZone: 'Europe/Warsaw',
        currency: 'PLN',
        revenueMinor: 9_999_999n,
        laborCostMinor: 3_000_000n,
        materialCostMinor: 600_000n,
        equipmentCostMinor: 400_000n,
        periodicCostMinor: 300_000n,
        otherDirectCostMinor: 500_000n,
        marginMinor: 5_199_999n,
        profitabilityBps: 5200n,
        completenessPercent: 97.5,
        incomplete: false,
        laborComparison: {
          actualSeconds: 360_001n,
          plannedSeconds: 350_000n,
          secondsDelta: 10_001n,
        },
        laborCostBreakdown: {
          byWorker: {
            'worker@example.com': 3_000_000n,
          },
        },
        costEntries: [
          {
            id: 'SENTINEL-COST-ID',
            category: 'CHEMICALS',
            amountMinor: 600_000n,
            source: 'SENTINEL-COST-SOURCE',
          },
          { category: 'TRANSPORT', amountMinor: 500_000n },
        ],
        operationalStatus: 'BELOW_TARGET',
        improvementGapMinor: 123_456n,
        issues: [{ code: 'MISSING_DATA', workerLogin: 'SENTINEL-WORKER-LOGIN' }],
        workerCosts: [{ workerLogin: 'SENTINEL-WORKER', hourlyCostMinor: 4_321n }],
        rateId: 'SENTINEL-RATE-ID',
      },
    ],
    trend: {
      points: [{
        period: '2026-08',
        totalCostMinor: 4_700_000n,
        completenessBps: 9_900n,
        incomplete: false,
        revenueMinor: 'SENTINEL-REVENUE',
        marginMinor: 'SENTINEL-MARGIN',
      }],
    },
    warnings: [
      {
        code: 'MISSING_DATA',
        message: 'Uzupełnij dane kosztowe.',
        details: 'Obiekt: Edukatorium',
        objectId: 'OBJ-1',
        workerLogin: 'SENTINEL-WARNING-WORKER',
      },
    ],
    internalSecret: 'SENTINEL-INTERNAL-SECRET',
  }
}

function walk(value, visitor, path = '$') {
  visitor(value, path)
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walk(entry, visitor, `${path}[${index}]`))
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, entry] of Object.entries(value)) walk(entry, visitor, `${path}.${key}`)
}

test('OWNER_FULL otrzymuje pełną, niezależną kopię bez mutacji payloadu wejściowego', () => {
  const payload = fullPayload()
  const projected = projectProfitabilityPayload(payload, FINANCE_PROFILE.OWNER_FULL)

  assert.deepEqual(projected, payload)
  assert.notStrictEqual(projected, payload)
  assert.notStrictEqual(projected.summary, payload.summary)
  assert.notStrictEqual(projected.objects, payload.objects)

  projected.summary.revenueMinor = 0n
  projected.objects[0].name = 'Zmieniona nazwa'
  assert.equal(payload.summary.revenueMinor, 9_999_999n)
  assert.equal(payload.objects[0].name, 'Edukatorium')
})

test('COST_CONTROL dostaje tylko agregaty godzin, kosztów operacyjnych i jakości danych', () => {
  const projected = projectProfitabilityPayload(fullPayload(), FINANCE_PROFILE.COST_CONTROL)

  assert.equal(projected.financeProfile, 'COST_CONTROL')
  assert.equal(projected.period, '2026-09')
  assert.equal(projected.summary.labor.actualSeconds, 360_001n)
  assert.equal(projected.summary.labor.totalLaborCostMinor, undefined)
  assert.equal(projected.summary.labor.costVisibility, 'WITHHELD_SMALL_COHORT')
  assert.equal(projected.summary.operationalCosts.totalOperationalCostMinor, 1_800_000n)
  assert.deepEqual(projected.summary.operationalCosts.categories, [
    { category: 'CHEMICALS', amountMinor: 600_000n },
    { category: 'EQUIPMENT', amountMinor: 400_000n },
    { category: 'PERIODIC', amountMinor: 300_000n },
    { category: 'TRANSPORT', amountMinor: 500_000n },
  ])
  assert.equal(projected.summary.dataQuality.completenessPercent, 97.5)
  assert.equal(projected.summary.dataQuality.plan.complete, false)
  assert.equal(projected.summary.operationalStatus, 'BELOW_TARGET')
  assert.equal(projected.summary.improvementGapMinor, 123_456n)
  assert.equal(projected.objects[0].objectId, 'OBJ-1')
  assert.equal(projected.objects[0].clientId, 'CLIENT-1')
  assert.equal(projected.objects[0].name, 'Edukatorium')
  assert.equal(projected.objects[0].labor.actualSeconds, 360_001n)
  assert.equal(projected.objects[0].labor.totalLaborCostMinor, undefined)
  assert.equal(projected.objects[0].labor.costVisibility, 'WITHHELD_SMALL_COHORT')
  assert.equal(projected.warnings[0].objectId, 'OBJ-1')
  assert.deepEqual(projected.trend.points, [{
    period: '2026-08',
    totalCostMinor: 4_700_000n,
    completenessBps: 9_900n,
    incomplete: false,
  }])
})

test('COST_CONTROL pokazuje laczny koszt pracy dopiero dla kohorty co najmniej trzech osob', () => {
  const payload = fullPayload()
  payload.summary.laborTimeBreakdown = [
    { workerLogin: 'worker-1@example.com', durationSeconds: 1200 },
    { workerLogin: 'worker-2@example.com', durationSeconds: 1800 },
    { workerLogin: 'worker-3@example.com', durationSeconds: 2400 },
  ]
  payload.objects[0].laborTimeBreakdown = payload.summary.laborTimeBreakdown

  const projected = projectProfitabilityPayload(payload, FINANCE_PROFILE.COST_CONTROL)

  assert.equal(projected.summary.labor.totalLaborCostMinor, 3_000_000n)
  assert.equal(projected.summary.labor.costVisibility, undefined)
  assert.equal(projected.objects[0].labor.totalLaborCostMinor, 3_000_000n)
  assert.equal(projected.objects[0].labor.costVisibility, undefined)
})

test('COST_CONTROL nie zawiera zabronionych kluczy ani wartości-sentineli na żadnym poziomie', () => {
  const projected = projectProfitabilityPayload(fullPayload(), FINANCE_PROFILE.COST_CONTROL)
  const leakedKeys = []
  const leakedSentinels = []

  walk(projected, (value, path) => {
    const key = path.split('.').at(-1).replace(/\[\d+\]$/, '')
    if (FORBIDDEN_KEY.test(key)) leakedKeys.push(path)
    if (typeof value === 'string' && value.includes('SENTINEL')) leakedSentinels.push(`${path}=${value}`)
  })

  assert.deepEqual(leakedKeys, [])
  assert.deepEqual(leakedSentinels, [])
})

test('nieznany lub brakujący profil finansowy odmawia projekcji', () => {
  for (const profile of [undefined, null, '', 'ADMIN', 'FULL']) {
    assert.throws(
      () => projectProfitabilityPayload(fullPayload(), profile),
      (error) => error instanceof ProfitabilityProjectionError &&
        ['PROFITABILITY_FINANCE_PROFILE_REQUIRED', 'PROFITABILITY_FINANCE_PROFILE_FORBIDDEN'].includes(error.code),
    )
  }
})

test('historia COST_CONTROL pokazuje wyłącznie bezpieczne operacje kosztowe bez reason i identyfikatorów', () => {
  const rows = [
    {
      action: 'CREATE_FINANCIAL_ENTRY',
      actor_uid: 'SENTINEL-ACTOR',
      reason: 'SENTINEL-REVENUE-100000',
      created_at: '2026-09-25T10:00:00Z',
      entity_type: 'OBJECT_FINANCIAL_ENTRY',
      entity_id: 'SENTINEL-COST-ID',
      new_value: { entry_group: 'TRANSPORT', amount_minor: '5000' },
    },
    {
      action: 'CREATE_FINANCIAL_ENTRY',
      actor_uid: 'SENTINEL-ACTOR',
      reason: 'SENTINEL-CONTRACT-PRICE',
      created_at: '2026-09-25T11:00:00Z',
      entity_type: 'OBJECT_FINANCIAL_ENTRY',
      entity_id: 'SENTINEL-REVENUE-ID',
      new_value: { entry_group: 'REVENUE', amount_minor: '100000' },
    },
    {
      action: 'CREATE_CONTRACT_VERSION',
      actor_uid: 'SENTINEL-ACTOR',
      reason: 'SENTINEL-MARGIN-TARGET',
      created_at: '2026-09-25T12:00:00Z',
      entity_type: 'OBJECT_CONTRACT_VERSION',
      entity_id: 'SENTINEL-CONTRACT-ID',
      new_value: { monthly_value_minor: '100000' },
    },
  ]

  assert.deepEqual(projectProfitabilityHistory(rows, FINANCE_PROFILE.COST_CONTROL, {
    objectId: 'object-1',
  }), [{
    action: 'CREATE_FINANCIAL_ENTRY',
    changedAt: '2026-09-25T10:00:00Z',
    objectId: 'object-1',
    recordType: 'OPERATIONAL_COST',
  }])

  const ownerHistory = projectProfitabilityHistory(rows, FINANCE_PROFILE.OWNER_FULL)
  assert.equal(ownerHistory.length, 3)
  assert.equal(ownerHistory[0].reason, 'SENTINEL-REVENUE-100000')
})

test('cel kwotowy i marżowy muszą przejść jednocześnie, a luka jest większą z obu luk', () => {
  const result = evaluateProfitabilityTarget({
    resultMinor: 100n,
    revenueMinor: 1_000n,
    targetAmountMinor: 150n,
    targetMarginBps: 2_000n,
  })

  assert.deepEqual(result, {
    evaluated: true,
    meetsTarget: false,
    amountTargetMet: false,
    marginTargetMet: false,
    improvementGapMinor: 100n,
    operationalStatus: 'BELOW_TARGET',
  })

  const onlyAmountFails = evaluateProfitabilityTarget({
    resultMinor: 210n,
    revenueMinor: 1_000n,
    targetAmountMinor: 250n,
    targetMarginBps: 2_000n,
  })
  assert.equal(onlyAmountFails.amountTargetMet, false)
  assert.equal(onlyAmountFails.marginTargetMet, true)
  assert.equal(onlyAmountFails.meetsTarget, false)
  assert.equal(onlyAmountFails.improvementGapMinor, 40n)
})

test('cel marżowy używa dokładnej arytmetyki BigInt i zaokrągla wymagany wynik w górę', () => {
  const revenueMinor = 9_007_199_254_740_993_123_451n
  const targetMarginBps = 3_333n
  const required = (revenueMinor * targetMarginBps + 9_999n) / 10_000n

  const below = evaluateProfitabilityTarget({
    resultMinor: required - 1n,
    revenueMinor,
    targetMarginBps,
  })
  assert.equal(below.meetsTarget, false)
  assert.equal(below.improvementGapMinor, 1n)

  const exact = evaluateProfitabilityTarget({
    resultMinor: required,
    revenueMinor,
    targetMarginBps,
  })
  assert.equal(exact.meetsTarget, true)
  assert.equal(exact.improvementGapMinor, 0n)
  assert.equal(exact.operationalStatus, 'OK')
})

test('brak przychodu nie udaje wyniku celu marżowego ani luki', () => {
  for (const revenueMinor of [undefined, null, 0n, -1n]) {
    const result = evaluateProfitabilityTarget({
      resultMinor: 100n,
      revenueMinor,
      targetAmountMinor: 80n,
      targetMarginBps: 2_000n,
    })
    assert.equal(result.evaluated, false)
    assert.equal(result.amountTargetMet, true)
    assert.equal(result.marginTargetMet, null)
    assert.equal(result.meetsTarget, null)
    assert.equal(result.improvementGapMinor, null)
    assert.equal(result.operationalStatus, 'NOT_CALCULABLE')
  }
})

test('cel kwotowy działa bez przychodu, a brak celów ma jawny stan', () => {
  const amountOnly = evaluateProfitabilityTarget({
    resultMinor: '450',
    targetAmountMinor: '500',
  })
  assert.equal(amountOnly.evaluated, true)
  assert.equal(amountOnly.meetsTarget, false)
  assert.equal(amountOnly.improvementGapMinor, 50n)

  assert.deepEqual(evaluateProfitabilityTarget({ resultMinor: 100n }), {
    evaluated: false,
    meetsTarget: null,
    amountTargetMet: null,
    marginTargetMet: null,
    improvementGapMinor: null,
    operationalStatus: 'NO_TARGET',
  })
})
