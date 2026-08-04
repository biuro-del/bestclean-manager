'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const { validateDetachedDraftCorrelation } = require('../job-card/correlation')

function correlatedFixture() {
  return {
    sourceOrderId: 'TASK-CORRELATION-001',
    card: {
      source: { orderId: 'TASK-CORRELATION-001' },
      customer: { customerId: 'CLIENT-001' },
      site: { siteId: 'OBJECT-001', address: 'ul. Testowa 1, Żory' },
      schedule: {
        mode: 'RECURRING',
        startDateYmd: '2026-08-10',
        recurrenceUntilYmd: '2026-12-31',
        serviceBlocks: [{
          startTime: '08:00',
          endTime: '16:00',
          weekdays: [1, 3, 5],
          requiredPeople: 2,
        }],
      },
      service: {
        title: 'Sprzątanie biura',
        scopeItems: [
          { id: 'TASK-1', zoneId: 'ZONE-1', title: 'Biurka' },
          { id: 'TASK-2', zoneId: 'ZONE-2', title: 'Podłogi' },
        ],
      },
      fulfillment: {
        staffingMode: 'FIXED',
        assignments: [{ workerId: 'W002' }, { workerId: 'W001' }],
      },
      commercial: {
        paymentMethod: 'DEFERRED',
        pricingMode: 'MONTHLY_CONTRACT',
        amount: 1250.5,
        contractId: 'CONTRACT-1',
        paymentDueDateYmd: '2026-09-14',
      },
    },
    order: {
      id: 'TASK-CORRELATION-001',
      clientId: 'CLIENT-001',
      objectId: 'OBJECT-001',
      executionAddressLabel: 'ul. Testowa 1, Żory',
      scheduleMode: 'repeat',
      type: 'cyclic',
      dateYmd: '2026-08-10',
      startTime: '08:00',
      endTime: '16:00',
      repeatUntil: '2026-12-31',
      repeatWeekdays: [5, 1, 3],
      requiredPeople: 2,
      staffingMode: 'FIXED',
      workerAssignments: [{ workerId: 'W001' }, { workerId: 'W002' }],
      serviceName: 'Sprzątanie biura',
      objectPlanTasks: [
        { id: 'TASK-2', zoneId: 'ZONE-2', title: 'Podłogi' },
        { id: 'TASK-1', zoneId: 'ZONE-1', title: 'Biurka' },
      ],
      paymentMethod: 'DEFERRED',
      pricingMode: 'MONTHLY_CONTRACT',
      price: 1250.5,
      contractId: 'CONTRACT-1',
      paymentDueDateYmd: '2026-09-14',
    },
    editorDraft: {
      id: 'TASK-CORRELATION-001',
      clientId: 'CLIENT-001',
      objectId: 'OBJECT-001',
      address: 'ul. Testowa 1, Żory',
      scheduleMode: 'RECURRING',
      dateStart: '2026-08-10',
      startTime: '08:00',
      endTime: '16:00',
      recurrenceUntil: '2026-12-31',
      weekdays: [3, 1, 5],
      requiredPeople: 2,
      staffingMode: 'FIXED',
      workerIds: ['W002', 'W001'],
      serviceName: 'Sprzątanie biura',
      tasks: [
        { id: 'TASK-1', zoneId: 'ZONE-1', title: 'Biurka' },
        { id: 'TASK-2', zoneId: 'ZONE-2', title: 'Podłogi' },
      ],
      paymentMethod: 'DEFERRED',
      pricingMode: 'MONTHLY_CONTRACT',
      amount: '1250,50',
      contractId: 'CONTRACT-1',
      deferredDueDate: '2026-09-14',
    },
  }
}

test('korelacja akceptuje ten sam plan niezależnie od kolejności dni, pracowników i zadań', () => {
  const result = validateDetachedDraftCorrelation(correlatedFixture())

  assert.equal(result.valid, true)
  assert.deepEqual(result.mismatches, [])
})

test('korelacja odrzuca rozbieżny obiekt, termin i klienta', () => {
  const fixture = correlatedFixture()
  fixture.editorDraft.clientId = 'CLIENT-OTHER'
  fixture.order.objectId = 'OBJECT-OTHER'
  fixture.card.schedule.serviceBlocks[0].endTime = '17:00'

  const result = validateDetachedDraftCorrelation(fixture)
  const fields = result.mismatches.map((item) => item.field)

  assert.equal(result.valid, false)
  assert.ok(fields.includes('clientId'))
  assert.ok(fields.includes('objectId'))
  assert.ok(fields.includes('endTime'))
})

test('korelacja odrzuca rozbieżny zakres i rozliczenie', () => {
  const fixture = correlatedFixture()
  fixture.order.objectPlanTasks[0].title = 'Okna'
  fixture.editorDraft.paymentMethod = 'CARD'
  fixture.card.commercial.contractId = 'CONTRACT-OTHER'

  const result = validateDetachedDraftCorrelation(fixture)
  const fields = result.mismatches.map((item) => item.field)

  assert.equal(result.valid, false)
  assert.ok(fields.includes('tasks'))
  assert.ok(fields.includes('paymentMethod'))
  assert.ok(fields.includes('contractId'))
})

test('dla zlecenia jednorazowego pomija nieaktywne ustawienia cyklu z edytora', () => {
  const fixture = correlatedFixture()
  fixture.card.schedule.mode = 'ONE_OFF'
  fixture.card.schedule.recurrenceUntilYmd = ''
  fixture.card.schedule.serviceBlocks[0].weekdays = []
  fixture.order.scheduleMode = 'once'
  fixture.order.type = 'individual'
  fixture.order.repeatUntil = ''
  fixture.order.repeatWeekdays = []
  fixture.editorDraft.scheduleMode = 'ONE_OFF'
  fixture.editorDraft.recurrenceUntil = '2026-12-31'
  fixture.editorDraft.weekdays = [1, 2, 3, 4, 5]

  const result = validateDetachedDraftCorrelation(fixture)

  assert.equal(result.valid, true)
})

test('korelacja wymaga zgodnego identyfikatora źródłowego', () => {
  const fixture = correlatedFixture()
  fixture.order.id = 'TASK-OTHER'

  const result = validateDetachedDraftCorrelation(fixture)

  assert.equal(result.valid, false)
  assert.ok(result.mismatches.some((item) => item.field === 'sourceOrderId'))
})
