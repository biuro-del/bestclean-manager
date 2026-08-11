'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const test = require('node:test')

const {
  diffValues,
  jobCardOutputHash,
  normalizeWarningAcknowledgements,
  projectJobCardForMobile,
  validateJobCardDraft,
} = require('../job-card/domain')

function completeCard(overrides = {}) {
  return {
    schemaVersion: '1.0.0',
    status: 'DRAFT',
    source: { orderId: 'TASK-001', sourceUpdatedAt: '2026-07-28T12:00:00.000Z' },
    customer: { type: 'B2B', name: 'Best Clean', phone: '500600700' },
    site: {
      mode: 'FIXED_CONTRACT_SITE',
      siteId: 'C001',
      name: 'Best Clean',
      address: 'Żory',
      accessInstruction: 'Wejście główne',
      photos: [],
    },
    schedule: {
      mode: 'ONE_OFF',
      startDateYmd: '2026-07-28',
      serviceBlocks: [{ id: 'main', startTime: '08:00', endTime: '16:00' }],
    },
    service: {
      serviceType: 'GENERAL_CLEANING',
      title: 'Sprzątanie',
      internalDescription: 'Zakres uzgodniony',
      safetyInstruction: 'Rękawice',
      scopeItems: [{ id: 'ZONE-1', title: 'Biuro' }],
    },
    fulfillment: {
      crewSource: 'DISPATCHED',
      dispatchRequired: false,
      assignments: [{ workerId: 'W001', name: 'Rafał Dudek', role: 'LEADER' }],
      vehicle: {},
    },
    resources: { packingRequired: false, supplies: [] },
    commercial: {
      paymentMethod: 'DEFERRED',
      pricingMode: 'MONTHLY_CONTRACT',
      amount: 0,
      contractId: 'CONTRACT-1',
      paymentTermDays: 14,
      currency: 'PLN',
    },
    completion: { complaintPathEnabled: true, returnsEnabled: false, signatureRequired: true },
    ...overrides,
  }
}

test('backend niezależnie waliduje gotowość publikacji', () => {
  const validation = validateJobCardDraft(completeCard())
  assert.equal(validation.valid, true)
  assert.equal(validation.errors.length, 0)
  assert.equal(validation.warnings.some((warning) => warning.code === 'SITE_PHOTOS_MISSING'), true)
})

test('hash treści nie zmienia się wyłącznie przez techniczny znacznik zapisu', () => {
  const first = completeCard()
  const second = completeCard({
    source: { ...first.source, sourceUpdatedAt: '2026-07-28T12:05:00.000Z' },
    status: 'PUBLISHED',
    publication: { revision: 2 },
  })
  assert.equal(jobCardOutputHash(first), jobCardOutputHash(second))
})

test('każde ostrzeżenie wymaga osobnego potwierdzenia', () => {
  const warnings = [{ code: 'LEADER_MISSING' }, { code: 'DRIVER_MISSING' }]
  const partial = normalizeWarningAcknowledgements(warnings, [
    { accepted: true, code: 'LEADER_MISSING' },
  ])
  assert.deepEqual(partial.missing, ['DRIVER_MISSING'])
  assert.deepEqual(partial.accepted, [{ accepted: true, code: 'LEADER_MISSING' }])
})

test('projekcja mobilna nie ujawnia ceny ani danych administracyjnych i wyłącza śledzenie trasy', () => {
  const projection = projectJobCardForMobile(completeCard(), 'WORKER')
  assert.equal('commercial' in projection, false)
  assert.equal(projection.telemetry.backgroundGps, false)
  assert.equal(projection.telemetry.continuousGps, false)
  assert.equal(projection.telemetry.routeTracking, false)
  assert.equal(projection.site.name, 'Best Clean')
})

test('różnica rewizji wskazuje dokładną ścieżkę zmiany', () => {
  assert.deepEqual(
    diffValues({ service: { title: 'Przed' } }, { service: { title: 'Po' } }),
    [{ path: 'service.title', previous: 'Przed', next: 'Po' }],
  )
})

test('walidator backendu pozostaje zgodny z walidatorem formularza portalu', async () => {
  const modelPath = path.join(
    __dirname,
    '..',
    'web-app',
    'apps',
    'portal-web',
    'src',
    'features',
    'orders',
    'jobCardDraftModel.js',
  )
  const frontend = await import(pathToFileURL(modelPath).href)
  const payload = completeCard({
    fulfillment: {
      crewSource: 'DISPATCHED',
      dispatchRequired: true,
      assignments: [{ workerId: 'W001', name: 'Rafał Dudek', role: 'WORKER' }],
      vehicle: {},
    },
  })
  const frontendValidation = frontend.validateJobCardDraft(payload)
  const backendValidation = validateJobCardDraft(payload)
  assert.deepEqual(
    backendValidation.errors.map((entry) => entry.code),
    frontendValidation.errors.map((entry) => entry.code),
  )
  assert.deepEqual(
    backendValidation.warnings.map((entry) => entry.code),
    frontendValidation.warnings.map((entry) => entry.code),
  )
})
