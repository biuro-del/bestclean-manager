'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  WORK_TIME_DAY_STATE,
  buildWorkTimeDay,
} = require('../work-time-days-policy')

const DAY = '2026-08-01'

function workday(workdayId, startAt, endAt, extra = {}) {
  return {
    workday_id: workdayId,
    worker_login: 'W034',
    worker_name: 'Małgorzata Piprek',
    start_at: startAt,
    end_at: endAt,
    status: endAt ? 'CLOSED' : 'RUNNING',
    updated_at: '2026-08-02T08:00:00.000Z',
    ...extra,
  }
}

function event(eventId, workdayId, startAt, endAt, extra = {}) {
  return {
    event_id: eventId,
    workday_id: workdayId,
    worker_login: 'W034',
    start_at: startAt,
    end_at: endAt,
    status: endAt ? 'CLOSED' : 'RUNNING',
    ...extra,
  }
}

test('unlimited Workday sessions are summed without counting gaps', () => {
  const result = buildWorkTimeDay({
    businessDateYmd: DAY,
    now: new Date('2026-08-03T00:00:00Z'),
    workdays: [
      workday('WD-1', '2026-08-01T06:00:00Z', '2026-08-01T08:00:00Z'),
      workday('WD-2', '2026-08-01T12:00:00Z', '2026-08-01T14:00:00Z'),
    ],
  })

  assert.equal(result.workedSec, 4 * 3600)
  assert.equal(result.realWorkSec, 4 * 3600)
  assert.equal(result.firstStartAt, '2026-08-01T06:00:00.000Z')
  assert.equal(result.lastStopAt, '2026-08-01T14:00:00.000Z')
  assert.equal(result.sessions.length, 2)
  assert.equal(result.integrityState, WORK_TIME_DAY_STATE.COMPLETE)
  assert.equal(result.issues.some((entry) => entry.code === 'MULTIPLE_WORKDAYS_FOR_BUSINESS_DATE'), false)
})

test('linked operational events are nested but never increase attendance time', () => {
  const result = buildWorkTimeDay({
    businessDateYmd: DAY,
    now: new Date('2026-08-03T00:00:00Z'),
    workdays: [workday('WD-1', '2026-08-01T06:00:00Z', '2026-08-01T10:00:00Z')],
    events: [
      event('EV-1', 'WD-1', '2026-08-01T06:10:00Z', '2026-08-01T06:20:00Z', { client_name: 'Best Clean', zone_name: 'Biuro' }),
      event('EV-2', 'WD-1', '2026-08-01T08:00:00Z', '2026-08-01T09:30:00Z'),
    ],
  })

  assert.equal(result.workedSec, 4 * 3600)
  assert.equal(result.sessions[0].activities.length, 2)
  assert.equal(result.sessions[0].activities[0].clientName, 'Best Clean')
})

test('a CLEAN code mistakenly stored as STOP recovers attendance through the last linked activity', () => {
  const result = buildWorkTimeDay({
    businessDateYmd: DAY,
    now: new Date('2026-08-03T00:00:00Z'),
    workdays: [workday('WD-CLEAN-STOP', '2026-08-01T16:03:06Z', '2026-08-01T16:04:00Z', {
      stop_object: 'BC0326',
      stop_zone_function: 'clean (spoza listy)',
    })],
    events: [
      event('EV-CLEAN-1', 'WD-CLEAN-STOP', '2026-08-01T16:09:00Z', '2026-08-01T16:38:00Z'),
      event('EV-CLEAN-2', 'WD-CLEAN-STOP', '2026-08-01T16:38:00Z', '2026-08-01T18:26:00Z'),
    ],
  })

  assert.equal(result.workedSec, 2 * 3600 + 22 * 60 + 54)
  assert.equal(result.lastStopAt, '2026-08-01T18:26:00.000Z')
  assert.equal(result.sessions[0].recordedEndAt, '2026-08-01T16:04:00.000Z')
  assert.equal(result.sessions[0].stopRecoveredFromActivity, true)
  assert.equal(result.issues.some((entry) => entry.code === 'ACTIVITY_OUTSIDE_SESSION'), false)
  assert.equal(result.integrityState, WORK_TIME_DAY_STATE.COMPLETE)
})

test('a real STOP keeps the recorded end and still reports later activities as inconsistent', () => {
  const result = buildWorkTimeDay({
    businessDateYmd: DAY,
    now: new Date('2026-08-03T00:00:00Z'),
    workdays: [workday('WD-REAL-STOP', '2026-08-01T16:03:06Z', '2026-08-01T16:04:00Z', {
      stop_object: 'STOP-1',
      stop_zone_function: 'STOP',
    })],
    events: [event('EV-AFTER-STOP', 'WD-REAL-STOP', '2026-08-01T16:09:00Z', '2026-08-01T18:26:00Z')],
  })

  assert.equal(result.workedSec, 54)
  assert.equal(result.sessions[0].stopRecoveredFromActivity, undefined)
  assert.ok(result.issues.some((entry) => entry.code === 'ACTIVITY_OUTSIDE_SESSION'))
  assert.equal(result.integrityState, WORK_TIME_DAY_STATE.INVALID)
})

test('session exposes its editable zone and zone changes affect the optimistic version', () => {
  const source = workday('WD-ZONE', '2026-08-01T06:00:00Z', '2026-08-01T08:00:00Z', {
    utility_room_id: 'Z-1',
    zone_name: 'Biuro',
    client_id: 'C-1',
    client_name: 'Best Clean',
    zone_location: 'Piętro 1',
  })
  const first = buildWorkTimeDay({ businessDateYmd: DAY, now: new Date('2026-08-03T00:00:00Z'), workdays: [source] })
  const second = buildWorkTimeDay({
    businessDateYmd: DAY,
    now: new Date('2026-08-03T00:00:00Z'),
    workdays: [{ ...source, utility_room_id: 'Z-2', zone_name: 'Magazyn' }],
  })

  assert.equal(first.sessions[0].zoneId, 'Z-1')
  assert.equal(first.sessions[0].zoneName, 'Biuro')
  assert.equal(first.sessions[0].clientName, 'Best Clean')
  assert.notEqual(first.version, second.version)
})

test('activity boundaries use the displayed minute without changing exact durations', () => {
  const result = buildWorkTimeDay({
    businessDateYmd: DAY,
    now: new Date('2026-08-03T00:00:00Z'),
    workdays: [workday('WD-MINUTE', '2026-08-01T15:16:04+02:00', '2026-08-01T20:42:00+02:00')],
    events: [
      event('EV-MINUTE-1', 'WD-MINUTE', '2026-08-01T20:41:54+02:00', '2026-08-01T20:42:05+02:00'),
      event('EV-MINUTE-2', 'WD-MINUTE', '2026-08-01T20:42:13+02:00', '2026-08-01T20:42:28+02:00'),
    ],
  })

  assert.equal(result.issues.some((entry) => entry.code === 'ACTIVITY_OUTSIDE_SESSION'), false)
  assert.equal(result.sessions[0].activities[0].durationSec, 11)
  assert.equal(result.sessions[0].activities[1].durationSec, 15)
  assert.equal(result.workedSec, 5 * 3600 + 25 * 60 + 56)
  assert.equal(result.integrityState, WORK_TIME_DAY_STATE.COMPLETE)
})

test('an open later Workday leaves lastStopAt empty and excludes the open interval', () => {
  const result = buildWorkTimeDay({
    businessDateYmd: DAY,
    now: new Date('2026-08-01T16:00:00Z'),
    workdays: [
      workday('WD-1', '2026-08-01T06:00:00Z', '2026-08-01T08:00:00Z'),
      workday('WD-2', '2026-08-01T12:00:00Z', null),
    ],
  })

  assert.equal(result.workedSec, 2 * 3600)
  assert.equal(result.lastStopAt, null)
  assert.equal(result.openSessionCount, 1)
  assert.equal(result.integrityState, WORK_TIME_DAY_STATE.OPEN_SESSION)
  assert.ok(result.issues.some((entry) => entry.code === 'OPEN_SESSION' && entry.workdayId === 'WD-2'))
})

test('overlapping Workdays use the interval union and block finalization', () => {
  const result = buildWorkTimeDay({
    businessDateYmd: DAY,
    now: new Date('2026-08-03T00:00:00Z'),
    workdays: [
      workday('WD-1', '2026-08-01T06:00:00Z', '2026-08-01T10:00:00Z'),
      workday('WD-2', '2026-08-01T08:00:00Z', '2026-08-01T12:00:00Z'),
    ],
  })

  assert.equal(result.workedSec, 6 * 3600)
  assert.equal(result.integrityState, WORK_TIME_DAY_STATE.INVALID)
  assert.equal(result.canFinalize, false)
  assert.ok(result.issues.some((entry) => entry.code === 'OVERLAPPING_WORK_SESSIONS'))
})

test('exact duplicate Workdays collapse into one session without losing linked activities', () => {
  const result = buildWorkTimeDay({
    businessDateYmd: DAY,
    now: new Date('2026-08-03T00:00:00Z'),
    workdays: [
      workday('WD-DUP-1', '2026-08-01T13:16:04Z', '2026-08-01T18:42:00Z', { pause_total_sec: 600 }),
      workday('WD-DUP-2', '2026-08-01T13:16:04Z', '2026-08-01T18:42:00Z', { pause_total_sec: 300 }),
    ],
    events: [
      event('EV-DUP-1', 'WD-DUP-1', '2026-08-01T14:00:00Z', '2026-08-01T15:00:00Z'),
      event('EV-DUP-2', 'WD-DUP-2', '2026-08-01T16:00:00Z', '2026-08-01T17:00:00Z'),
    ],
  })

  assert.equal(result.sessions.length, 1)
  assert.deepEqual(result.sessions[0].sourceWorkdayIds, ['WD-DUP-1', 'WD-DUP-2'])
  assert.deepEqual(result.sessions[0].activities.map((activity) => activity.eventId), ['EV-DUP-1', 'EV-DUP-2'])
  assert.equal(result.collapsedDuplicateSessionCount, 1)
  assert.equal(result.workedSec, 5 * 3600 + 25 * 60 + 56)
  assert.equal(result.pauseSec, 600)
  assert.equal(result.integrityState, WORK_TIME_DAY_STATE.COMPLETE)
  assert.equal(result.issues.some((entry) => entry.code === 'OVERLAPPING_WORK_SESSIONS'), false)
})

test('a stale open Workday with the same START is absorbed by its unique closed record', () => {
  const result = buildWorkTimeDay({
    businessDateYmd: DAY,
    now: new Date('2026-08-03T00:00:00Z'),
    workdays: [
      workday('WD-OPEN-COPY', '2026-08-01T11:27:41Z', null),
      workday('WD-CLOSED', '2026-08-01T11:27:03Z', '2026-08-01T17:02:00Z'),
    ],
    events: [
      event('EV-CLEAN', 'WD-OPEN-COPY', '2026-08-01T12:00:00Z', '2026-08-01T13:00:00Z'),
    ],
  })

  assert.equal(result.sessions.length, 1)
  assert.equal(result.sessions[0].workdayId, 'WD-CLOSED')
  assert.deepEqual(result.sessions[0].sourceWorkdayIds, ['WD-CLOSED', 'WD-OPEN-COPY'])
  assert.deepEqual(result.sessions[0].activities.map((activity) => activity.eventId), ['EV-CLEAN'])
  assert.equal(result.openSessionCount, 0)
  assert.equal(result.integrityState, WORK_TIME_DAY_STATE.COMPLETE)
  assert.equal(result.issues.some((entry) => entry.code === 'OPEN_SESSION'), false)
  assert.equal(result.workedSec, 5 * 3600 + 34 * 60 + 57)
})

test('orphan activities are visible separately and do not affect time', () => {
  const result = buildWorkTimeDay({
    businessDateYmd: DAY,
    now: new Date('2026-08-03T00:00:00Z'),
    workdays: [workday('WD-1', '2026-08-01T06:00:00Z', '2026-08-01T08:00:00Z')],
    events: [event('EV-ORPHAN', 'WD-MISSING', '2026-08-01T06:30:00Z', '2026-08-01T07:00:00Z')],
  })

  assert.equal(result.workedSec, 2 * 3600)
  assert.equal(result.unassignedActivities.length, 1)
  assert.equal(result.integrityState, WORK_TIME_DAY_STATE.INVALID)
  assert.ok(result.issues.some((entry) => entry.code === 'UNASSIGNED_ACTIVITY'))
})

test('a linked activity cannot silently change the worker identity of its Workday', () => {
  const result = buildWorkTimeDay({
    businessDateYmd: DAY,
    now: new Date('2026-08-03T00:00:00Z'),
    workdays: [workday('WD-1', '2026-08-01T06:00:00Z', '2026-08-01T08:00:00Z')],
    events: [event('EV-FOREIGN', 'WD-1', '2026-08-01T06:30:00Z', '2026-08-01T07:00:00Z', { worker_login: 'OTHER' })],
  })

  assert.equal(result.workedSec, 2 * 3600)
  assert.equal(result.integrityState, WORK_TIME_DAY_STATE.INVALID)
  assert.ok(result.issues.some((entry) => entry.code === 'ACTIVITY_WORKER_MISMATCH'))
})

test('a session crossing midnight belongs to the Warsaw date of START', () => {
  const result = buildWorkTimeDay({
    businessDateYmd: DAY,
    now: new Date('2026-08-03T00:00:00Z'),
    workdays: [workday('WD-NIGHT', '2026-08-01T21:30:00Z', '2026-08-02T01:30:00Z')],
  })

  assert.equal(result.workedSec, 4 * 3600)
  assert.equal(result.integrityState, WORK_TIME_DAY_STATE.COMPLETE)
})
