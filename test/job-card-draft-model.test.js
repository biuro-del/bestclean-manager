'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const test = require('node:test')

async function loadModel() {
  const modulePath = path.join(
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
  return import(pathToFileURL(modulePath).href)
}

function completeOrder(overrides = {}) {
  return {
    id: 'TASK-001',
    updatedAt: '2026-07-28T12:00:00.000Z',
    customerType: 'B2C',
    clientName: 'Jan Kowalski',
    phone: '500600700',
    siteMode: 'VISIT_SITE',
    executionAddressLabel: 'ul. Testowa 1, Żory',
    accessInstruction: 'Kod do bramy: 1234',
    scheduleMode: 'once',
    dateYmd: '2026-08-01',
    serviceType: 'GENERAL_CLEANING',
    title: 'Sprzątanie mieszkania',
    description: 'Posprzątać mieszkanie zgodnie z checklistą.',
    workerComment: 'Klucz u ochrony.',
    safetyInstruction: 'Używać rękawic ochronnych.',
    dispatchRequired: false,
    crewSource: 'DISPATCHED',
    workerAssignments: [
      {
        workerId: 'W001',
        name: 'Rafał Dudek',
        role: 'LEADER',
      },
    ],
    serviceBlocks: [
      {
        id: 'main',
        label: 'Zmiana główna',
        dateYmd: '2026-08-01',
        startTime: '08:00',
        endTime: '12:00',
        requiredPeople: 1,
        requiredWorkMinutes: 240,
      },
    ],
    objectPlanTasks: [
      {
        id: 'ZONE-1',
        zoneId: 'ZONE-1',
        zoneName: 'Salon',
        title: 'Odkurzanie i mycie podłogi',
      },
    ],
    paymentMethod: 'CARD',
    pricingMode: 'PER_JOB',
    price: 350,
    signatureRequired: true,
    packingRequired: false,
    recurrenceHorizonConfirmed: true,
    ...overrides,
  }
}

test('kompilator tworzy kompletny deterministyczny szkic karty', async () => {
  const {
    JOB_CARD_SCHEMA_VERSION,
    compileOrderDraftToJobCardDraft,
    validateJobCardDraft,
  } = await loadModel()

  const card = compileOrderDraftToJobCardDraft(completeOrder())
  const validation = validateJobCardDraft(card)

  assert.equal(card.schemaVersion, JOB_CARD_SCHEMA_VERSION)
  assert.equal(card.customer.type, 'B2C')
  assert.equal(card.schedule.mode, 'ONE_OFF')
  assert.equal(card.completion.signatureRequired, true)
  assert.equal(card.completion.returnsEnabled, false)
  assert.equal(validation.valid, true)
  assert.deepEqual(validation.errors, [])
})

test('stabilna serializacja nie zalezy od kolejnosci kluczy obiektu', async () => {
  const { stableSerializeJobCardDraft } = await loadModel()

  assert.equal(
    stableSerializeJobCardDraft({ z: 1, a: { y: 2, b: 3 } }),
    stableSerializeJobCardDraft({ a: { b: 3, y: 2 }, z: 1 }),
  )
})

test('krytyczne wymiary biznesowe nie sa zgadywane', async () => {
  const { compileOrderDraftToJobCardDraft, validateJobCardDraft } = await loadModel()
  const card = compileOrderDraftToJobCardDraft(completeOrder({
    siteMode: '',
    crewSource: '',
    dispatchRequired: undefined,
  }))
  const validation = validateJobCardDraft(card)

  assert.equal(card.site.mode, '')
  assert.equal(card.fulfillment.crewSource, '')
  assert.equal(card.fulfillment.dispatchRequired, null)
  assert.deepEqual(
    validation.errors.map((item) => item.code).filter((code) => [
      'SITE_MODE_REQUIRED',
      'CREW_SOURCE_REQUIRED',
      'DISPATCH_DECISION_REQUIRED',
    ].includes(code)),
    ['SITE_MODE_REQUIRED', 'CREW_SOURCE_REQUIRED', 'DISPATCH_DECISION_REQUIRED'],
  )
})

test('zlecenie cykliczne wymaga potwierdzonego horyzontu', async () => {
  const {
    compileOrderDraftToJobCardDraft,
    defaultJobCardRecurrenceUntil,
    validateJobCardDraft,
  } = await loadModel()
  const card = compileOrderDraftToJobCardDraft(completeOrder({
    scheduleMode: 'repeat',
    repeatUntil: '',
  }))
  const validation = validateJobCardDraft(card)

  assert.equal(defaultJobCardRecurrenceUntil('2026-08-01'), '2026-12-31')
  assert.equal(validation.errors.some((item) => item.code === 'RECURRENCE_UNTIL_REQUIRED'), true)
})

test('brak lidera i kierowcy ostrzega, ale nie blokuje publikacji', async () => {
  const { compileOrderDraftToJobCardDraft, validateJobCardDraft } = await loadModel()
  const card = compileOrderDraftToJobCardDraft(completeOrder({
    dispatchRequired: true,
    workerAssignments: [
      {
        workerId: 'W002',
        name: 'Anna Testowa',
        role: 'WORKER',
      },
    ],
    vehicle: {
      vehicleId: 'CAR-1',
      label: 'Auto 1',
    },
  }))
  const validation = validateJobCardDraft(card)

  assert.equal(validation.valid, true)
  assert.equal(validation.warnings.some((item) => item.code === 'LEADER_MISSING'), true)
  assert.equal(validation.warnings.some((item) => item.code === 'DRIVER_MISSING'), true)
})

test('termin odroczony wymaga daty lub liczby dni platnosci', async () => {
  const { compileOrderDraftToJobCardDraft, validateJobCardDraft } = await loadModel()
  const invalid = validateJobCardDraft(compileOrderDraftToJobCardDraft(completeOrder({
    paymentMethod: 'DEFERRED',
    paymentDueDateYmd: '',
    paymentTermDays: 0,
  })))
  const valid = validateJobCardDraft(compileOrderDraftToJobCardDraft(completeOrder({
    paymentMethod: 'DEFERRED',
    paymentTermDays: 14,
  })))

  assert.equal(invalid.errors.some((item) => item.code === 'DEFERRED_TERM_REQUIRED'), true)
  assert.equal(valid.errors.some((item) => item.code === 'DEFERRED_TERM_REQUIRED'), false)
})

test('pakowanie i zasady bezpieczenstwa wymagaja jawnej decyzji', async () => {
  const { compileOrderDraftToJobCardDraft, validateJobCardDraft } = await loadModel()
  const validation = validateJobCardDraft(compileOrderDraftToJobCardDraft(completeOrder({
    packingRequired: undefined,
    safetyInstruction: '',
    safetyInstructionConfirmedNone: false,
  })))

  assert.equal(validation.errors.some((item) => item.code === 'PACKING_DECISION_REQUIRED'), true)
  assert.equal(validation.errors.some((item) => item.code === 'SAFETY_INSTRUCTION_REQUIRED'), true)
})

test('jawnie wybrany lider i kierowca usuwaja ostrzezenia bez zmiany przydzialu', async () => {
  const { compileOrderDraftToJobCardDraft, validateJobCardDraft } = await loadModel()
  const validation = validateJobCardDraft(compileOrderDraftToJobCardDraft(completeOrder({
    dispatchRequired: true,
    leaderWorkerId: 'W001',
    driverWorkerId: 'W001',
    vehicleId: 'CAR-1',
    workerAssignments: [
      {
        workerId: 'W001',
        name: 'Rafał Dudek',
        role: 'WORKER',
      },
    ],
  })))

  assert.equal(validation.warnings.some((item) => item.code === 'LEADER_MISSING'), false)
  assert.equal(validation.warnings.some((item) => item.code === 'DRIVER_MISSING'), false)
})

test('jawny bufor obsady jest legalnym ostrzezeniem przy publikacji Karty Zlecenia', async () => {
  const { compileOrderDraftToJobCardDraft, validateJobCardDraft } = await loadModel()
  const card = compileOrderDraftToJobCardDraft(completeOrder({
    staffingMode: 'BUFFER',
    workerAssignments: [],
  }))
  const validation = validateJobCardDraft(card)

  assert.equal(card.fulfillment.staffingMode, 'BUFFER')
  assert.equal(validation.valid, true)
  assert.equal(validation.errors.some((item) => item.code === 'ASSIGNEE_REQUIRED'), false)
  assert.equal(validation.warnings.some((item) => (
    item.code === 'ASSIGNEE_REQUIRED' && item.severity === 'WARNING'
  )), true)
})

test('cotygodniowa zmienna obsada nie blokuje publikacji Karty Zlecenia', async () => {
  const { compileOrderDraftToJobCardDraft, validateJobCardDraft } = await loadModel()
  const card = compileOrderDraftToJobCardDraft(completeOrder({
    staffingMode: 'VARIABLE_WEEKLY',
    workerAssignments: [],
  }))
  const validation = validateJobCardDraft(card)

  assert.equal(card.fulfillment.staffingMode, 'VARIABLE_WEEKLY')
  assert.equal(validation.valid, true)
  assert.equal(validation.warnings.some((item) => item.code === 'ASSIGNEE_REQUIRED'), true)
})

test('stala lub nierozstrzygnieta obsada bez pracownika nadal blokuje Karte Zlecenia', async () => {
  const { compileOrderDraftToJobCardDraft, validateJobCardDraft } = await loadModel()

  for (const staffingMode of ['FIXED', '']) {
    const card = compileOrderDraftToJobCardDraft(completeOrder({
      staffingMode,
      workerAssignments: [],
    }))
    const validation = validateJobCardDraft(card)

    assert.equal(validation.valid, false, staffingMode || 'brak trybu')
    assert.equal(validation.errors.some((item) => item.code === 'ASSIGNEE_REQUIRED'), true)
  }
})

test('publikacja konkretnego wystapienia zawsze wymaga realnej obsady', async () => {
  const {
    compileOrderDraftToJobCardDraft,
    validateJobCardOccurrencePublication,
  } = await loadModel()

  for (const staffingMode of ['BUFFER', 'VARIABLE_WEEKLY']) {
    const card = compileOrderDraftToJobCardDraft(completeOrder({
      staffingMode,
      workerAssignments: [],
    }))
    const validation = validateJobCardOccurrencePublication(card)

    assert.equal(validation.valid, false, staffingMode)
    assert.equal(validation.errors.some((item) => (
      item.code === 'ASSIGNEE_REQUIRED' && item.severity === 'ERROR'
    )), true)
    assert.equal(validation.warnings.some((item) => item.code === 'ASSIGNEE_REQUIRED'), false)
  }
})
