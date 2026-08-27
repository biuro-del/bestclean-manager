import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildReportWorkerHistoryDays,
  reportWorkerHistoryOpenState,
} from '../web-app/apps/portal-web/src/features/reports/zestawienia/reportWorkerHistoryModel.js'

function workday(id, startAt, endAt = '') {
  return {
    workdayId: id,
    workerLogin: 'anna@example.com',
    workerName: 'Anna Nowak',
    dayStartAt: startAt,
    dayEndAt: endAt,
    status: endAt ? 'CLOSED' : 'OPEN',
  }
}

test('raport pracownika liczy czas z Workday nawet bez zdarzenia CLEAN', () => {
  const [day] = buildReportWorkerHistoryDays({
    workdays: [workday('WD-1', '2026-08-25T05:05:55.000Z', '2026-08-25T13:17:45.000Z')],
  })

  assert.equal(day.closedSec, 8 * 3600 + 11 * 60 + 50)
  assert.equal(day.sessions.length, 1)
  assert.equal(day.integrityState, 'COMPLETE')
})

test('raport sumuje osobne sesje bez doliczania przerwy', () => {
  const [day] = buildReportWorkerHistoryDays({
    workdays: [
      workday('WD-1', '2026-08-25T06:00:00.000Z', '2026-08-25T08:00:00.000Z'),
      workday('WD-2', '2026-08-25T09:00:00.000Z', '2026-08-25T10:30:00.000Z'),
    ],
  })

  assert.equal(day.closedSec, 3.5 * 3600)
  assert.equal(day.sessions.length, 2)
})

test('nakładające się sesje nie dublują czasu i zgłaszają problem', () => {
  const [day] = buildReportWorkerHistoryDays({
    workdays: [
      workday('WD-1', '2026-08-25T06:00:00.000Z', '2026-08-25T08:00:00.000Z'),
      workday('WD-2', '2026-08-25T07:00:00.000Z', '2026-08-25T09:00:00.000Z'),
    ],
  })

  assert.equal(day.closedSec, 3 * 3600)
  assert.equal(day.integrityState, 'INVALID')
  assert.ok(day.integrityIssues.some((entry) => entry.code === 'OVERLAPPING_WORK_SESSIONS'))
})

test('duplikat Workday nie zwiększa czasu', () => {
  const source = workday('WD-1', '2026-08-25T06:00:00.000Z', '2026-08-25T08:00:00.000Z')
  const [day] = buildReportWorkerHistoryDays({ workdays: [source, { ...source }] })

  assert.equal(day.closedSec, 2 * 3600)
  assert.ok(day.integrityIssues.some((entry) => entry.code === 'DUPLICATE_WORKDAY_ID'))
})

test('otwarta sesja jest widoczna, ale nie zwiększa potwierdzonego czasu', () => {
  const [day] = buildReportWorkerHistoryDays({
    workdays: [workday('WD-OPEN', '2026-08-25T06:00:00.000Z')],
  })

  assert.equal(day.closedSec, 0)
  assert.equal(day.openSessionCount, 1)
  assert.equal(day.integrityState, 'OPEN_SESSION')
})

test('stary otwarty dzień jest oznaczony jako Brak STOP, a bieżący pozostaje W toku', () => {
  assert.deepEqual(
    reportWorkerHistoryOpenState(
      { dayKey: '2026-08-20', integrityState: 'OPEN_SESSION', openSessionCount: 1 },
      '2026-08-27',
    ),
    { isOpen: true, isMissingStop: true, label: 'Brak STOP', tone: 'missing-stop' },
  )
  assert.deepEqual(
    reportWorkerHistoryOpenState(
      { dayKey: '2026-08-27', integrityState: 'OPEN_SESSION', openSessionCount: 1 },
      '2026-08-27',
    ),
    { isOpen: true, isMissingStop: false, label: 'W toku', tone: 'open' },
  )
})

test('zdarzenie jest przypisane do sesji po linkedWorkdayId i nie zmienia czasu pracy', () => {
  const [day] = buildReportWorkerHistoryDays({
    workdays: [workday('WD-1', '2026-08-25T06:00:00.000Z', '2026-08-25T09:00:00.000Z')],
    events: [{
      eventId: 'EV-1',
      linkedWorkdayId: 'WD-1',
      workerLogin: 'anna@example.com',
      eventType: 'CLEAN',
      startAt: '2026-08-25T06:30:00.000Z',
      endAt: '2026-08-25T08:30:00.000Z',
    }],
  })

  assert.equal(day.closedSec, 3 * 3600)
  assert.equal(day.sessions[0].activities.length, 1)
  assert.equal(day.unassignedActivities.length, 0)
})

test('aktywność bez Workday trafia do grupy Poza sesją', () => {
  const [day] = buildReportWorkerHistoryDays({
    events: [{
      eventId: 'EV-ORPHAN',
      workerLogin: 'anna@example.com',
      startAt: '2026-08-25T06:30:00.000Z',
      endAt: '2026-08-25T07:00:00.000Z',
    }],
  })

  assert.equal(day.closedSec, 0)
  assert.equal(day.integrityState, 'INVALID')
  assert.equal(day.unassignedActivities.length, 1)
  assert.ok(day.integrityIssues.some((entry) => entry.code === 'WORKDAY_MISSING'))
})

test('grupowanie respektuje warszawską granicę dnia', () => {
  const [day] = buildReportWorkerHistoryDays({
    workdays: [workday('WD-NIGHT', '2026-08-01T22:30:00.000Z', '2026-08-01T23:30:00.000Z')],
  })

  assert.equal(day.dayKey, '2026-08-02')
  assert.equal(day.closedSec, 3600)
})
