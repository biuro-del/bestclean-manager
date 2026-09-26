import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeProfitabilityViewPayload,
} from '../web-app/apps/portal-web/src/features/clients/profitability/viewModel.js'

const FORBIDDEN_KEY = /(revenue|profit|margin|target|hourly|rateid|workercost)/i

function walk(value, visitor, path = '$') {
  visitor(value, path)
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walk(entry, visitor, `${path}[${index}]`))
    return
  }
  if (!value || typeof value !== 'object') return
  Object.entries(value).forEach(([key, entry]) => walk(entry, visitor, `${path}.${key}`))
}

function restrictedPayload() {
  const safe = {
    labor: {
      actualSeconds: '3600',
      plannedSeconds: '4200',
      secondsDelta: '-600',
      totalLaborCostMinor: '300000',
    },
    operationalCosts: {
      categories: [
        { category: 'CHEMICALS', amountMinor: '60000' },
        { category: 'EQUIPMENT', amountMinor: '40000' },
        { category: 'TRANSPORT', amountMinor: '50000' },
      ],
      totalOperationalCostMinor: '150000',
    },
    dataQuality: {
      completenessPercent: 100,
      incomplete: false,
      laborIncomplete: false,
    },
    operationalStatus: 'BELOW_TARGET',
    improvementGapMinor: '123456',
  }
  return {
    financeProfile: 'COST_CONTROL',
    capability: { financeProfile: 'COST_CONTROL', canRead: true },
    currency: 'PLN',
    period: '2026-09',
    summary: { ...safe, objectCount: 1, revenueMinor: 'SENTINEL-REVENUE' },
    objects: [{
      ...safe,
      objectId: 'OBJ-1',
      name: 'Edukatorium',
      marginMinor: 'SENTINEL-MARGIN',
      workerCosts: [{ hourlyCostMinor: 'SENTINEL-RATE' }],
    }],
    warnings: [{ code: 'MISSING_COST', objectId: 'OBJ-1', details: 'SENTINEL-WARNING' }],
    freshness: { status: 'FRESH', internalRevenueChecksum: 'SENTINEL-FRESHNESS' },
    internalTarget: 'SENTINEL-TARGET',
  }
}

test('COST_CONTROL maps the safe nested projection into the portal cost view', () => {
  const result = normalizeProfitabilityViewPayload(restrictedPayload())
  const row = result.objects[0]

  assert.equal(result.period, '2026-09')
  assert.equal(result.summary.totalCostMinor, '450000')
  assert.equal(row.laborCostMinor, '300000')
  assert.equal(row.materialCostMinor, '60000')
  assert.equal(row.equipmentCostMinor, '40000')
  assert.equal(row.otherCostMinor, '90000')
  assert.equal(row.totalCostMinor, '450000')
  assert.equal(row.laborComparison.actualSeconds, '3600')
  assert.equal(row.laborComparison.actualCostMinor, '300000')
  assert.equal(row.completenessPercent, 100)
  assert.equal(row.status, 'BELOW_TARGET')
  assert.equal(row.improvementGapMinor, '123456')
  assert.deepEqual(row.costBreakdown, [
    { category: 'LABOR', amountMinor: '300000' },
    { category: 'CHEMICALS', amountMinor: '60000' },
    { category: 'EQUIPMENT', amountMinor: '40000' },
    { category: 'TRANSPORT', amountMinor: '50000' },
  ])
})

test('COST_CONTROL allowlist does not preserve injected company-finance fields', () => {
  const result = normalizeProfitabilityViewPayload(restrictedPayload())
  const leaked = []
  const sentinels = []

  walk(result, (value, path) => {
    const key = path.split('.').at(-1).replace(/\[\d+\]$/, '')
    if (!path.includes('.capability.') && FORBIDDEN_KEY.test(key)) leaked.push(path)
    if (typeof value === 'string' && value.includes('SENTINEL')) sentinels.push(path)
  })

  assert.deepEqual(leaked, [])
  assert.deepEqual(sentinels, [])
})

test('invalid or incomplete cost aggregates fail closed instead of understating total cost', () => {
  const payload = restrictedPayload()
  delete payload.objects[0].labor.totalLaborCostMinor
  payload.objects[0].operationalCosts.categories.push({ category: 'OTHER', amountMinor: 'not-an-integer' })
  const row = normalizeProfitabilityViewPayload(payload).objects[0]

  assert.equal(row.laborCostMinor, undefined)
  assert.equal(row.totalCostMinor, undefined)
  assert.equal(row.costBreakdown.some((entry) => entry.category === 'OTHER'), false)
})

test('OWNER_FULL payload is not rewritten by the restricted view adapter', () => {
  const payload = {
    capability: { financeProfile: 'OWNER_FULL' },
    summary: { revenueMinor: '10000', marginMinor: '2500' },
  }
  assert.strictEqual(normalizeProfitabilityViewPayload(payload), payload)
})
