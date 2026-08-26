import assert from 'node:assert/strict'
import test from 'node:test'

import {
  EVENT_RECORD_KINDS,
  eventRecordKind,
  resolveContainingWorkdayId,
} from '../web-app/apps/portal-web/src/services/eventRecordModel.js'

test('odroznia caly okres pracy od czynnosci klienta lub strefy', () => {
  assert.equal(eventRecordKind({ historySourceKind: 'workday', hasExplicitEventId: false }), EVENT_RECORD_KINDS.WORKDAY)
  assert.equal(eventRecordKind({ historySourceKind: 'event', eventType: 'WORKDAY_STOP' }), EVENT_RECORD_KINDS.WORKDAY)
  assert.equal(eventRecordKind({ historySourceKind: 'event', eventType: 'CLEAN' }), EVENT_RECORD_KINDS.ACTIVITY)
  assert.equal(eventRecordKind({ historySourceKind: 'event', endReason: 'QR_START_STOP' }), EVENT_RECORD_KINDS.ACTIVITY)
})

test('czynność w strefie jest automatycznie przypisana do jednego obejmujacego Workday', () => {
  const workdayId = resolveContainingWorkdayId([
    {
      workdayId: 'WD-8-16',
      workerLogin: 'anna',
      startAt: '2026-08-04T06:00:00.000Z',
      endAt: '2026-08-04T14:00:00.000Z',
    },
  ], {
    workerLogin: 'ANNA',
    startAt: '2026-08-04T06:15:00.000Z',
    endAt: '2026-08-04T07:30:00.000Z',
  })

  assert.equal(workdayId, 'WD-8-16')
})

test('czynność poza dniem lub w dwóch nakładajacych się dniach nie jest przypisywana przez zgadywanie', () => {
  const workdays = [
    {
      workdayId: 'WD-1',
      workerLogin: 'anna',
      startAt: '2026-08-04T06:00:00.000Z',
      endAt: '2026-08-04T14:00:00.000Z',
    },
    {
      workdayId: 'WD-2',
      workerLogin: 'anna',
      startAt: '2026-08-04T07:00:00.000Z',
      endAt: '2026-08-04T10:00:00.000Z',
    },
  ]

  assert.equal(resolveContainingWorkdayId(workdays, {
    workerLogin: 'anna',
    startAt: '2026-08-04T07:15:00.000Z',
    endAt: '2026-08-04T08:00:00.000Z',
  }), '')
  assert.equal(resolveContainingWorkdayId(workdays, {
    workerLogin: 'anna',
    startAt: '2026-08-04T15:15:00.000Z',
    endAt: '2026-08-04T16:00:00.000Z',
  }), '')
})
