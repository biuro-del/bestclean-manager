import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import {
  aggregateWorkSessions,
  aggregateWorkTimeDay,
  assertWorkTimeRowsExportable,
  enrichWorkdaysWithEventIntervals,
  formatWorkDurationHms,
  mergeWorkIntervals,
  resolveWorkIntervalZoneSnapshot,
  WORKDAY_INTEGRITY_STATES,
  workIntervalCodes,
  workIntervalGpsCoordinates,
  workIntervalVisibleComment,
  workIntervalsFromRow,
  workIntervalsTotalSeconds,
  workSessionAccountingFromRow,
  workTimeCycleRowsFromDays,
  workTimeDayHasHistoryAlert,
  workdayPresenceFromRows,
  workSessionConfirmedTotalSeconds,
  workSessionProvisionalTotalSeconds,
  workSessionSummarySeconds,
  warsawBusinessDateKey,
} from '../web-app/apps/portal-web/src/features/workers/workIntervals.js'
import {
  buildWorkTimeEvidenceRowsForWorkers,
  createWorkTimeEvidenceColumns,
  workTimeEvidenceCsvContent,
} from '../web-app/apps/portal-web/src/features/workers/work_time_evidence_export.js'
import {
  buildWorkTimeExportRowsForWorkers,
  createWorkTimeExportColumns,
} from '../web-app/apps/portal-web/src/features/workers/work_time_export.js'

const require = createRequire(import.meta.url)
const { buildWorkTimeDay } = require('../work-time-days-policy.js')

test('wykrywa dowolny alert historii, ale nie zwykla dzisiejsza otwarta sesje', () => {
  const today = '2026-08-26'
  assert.equal(workTimeDayHasHistoryAlert({
    businessDateYmd: today,
    integrityState: 'OPEN_SESSION',
    issues: [{ code: 'OPEN_SESSION' }],
  }, { today }), false)
  assert.equal(workTimeDayHasHistoryAlert({
    businessDateYmd: today,
    integrityState: 'INVALID',
    issues: [
      { code: 'OPEN_SESSION' },
      { code: 'ACTIVITY_OUTSIDE_SESSION' },
    ],
  }, { today }), true)
  assert.equal(workTimeDayHasHistoryAlert({
    businessDateYmd: today,
    integrityState: 'OPEN_SESSION',
    issues: [{ code: 'OPEN_SESSION' }],
    activities: [{ startAt: '2026-08-26T08:00:00.000Z', endAt: '', isOpen: true }],
  }, { today }), true)
})

function exportDeps(getWorkdays) {
  return {
    getWorkdays,
    normalizeSearchText: (value) => String(value ?? '').trim().toLowerCase(),
    dashboardWorkerSurnameDisplayName: (value) => value,
    dashboardWorkerSurnameSortKey: (value) => String(value ?? ''),
    toIso: (value) => value || '',
    workerDetailComputeRangeSeconds: (startAt, endAt) => Math.floor((new Date(endAt) - new Date(startAt)) / 1000),
    workerDetailDateKeyFromIso: (value) => String(value ?? '').slice(0, 10),
    ymdToIsoRangeStart: (value) => `${value}T00:00:00.000Z`,
    ymdToIsoRangeEnd: (value) => `${value}T23:59:59.999Z`,
  }
}

test('uses the Workday envelope and keeps Event rows as nested activities', () => {
  const workdays = [{ workdayId: 'WD-1', startAt: '2026-07-22T05:00:00.000Z', endAt: '2026-07-22T18:00:00.000Z', durationSec: 13 * 3600 }]
  const events = [
    {
      eventId: 'EV-1',
      workdayId: 'WD-1',
      historySourceKind: 'event',
      clientName: 'Klient Testowy',
      zoneName: 'Strefa A',
      startAt: '2026-07-22T05:00:00.000Z',
      endAt: '2026-07-22T08:00:00.000Z',
      status: 'CLOSED',
    },
    {
      eventId: 'EV-2',
      workdayId: 'WD-1',
      historySourceKind: 'event',
      startAt: '2026-07-22T15:00:00.000Z',
      endAt: '2026-07-22T18:00:00.000Z',
      status: 'CLOSED',
    },
  ]

  const [result] = enrichWorkdaysWithEventIntervals(workdays, events)

  assert.equal(result.durationSec, 13 * 3600)
  assert.equal(result.recordedDurationSec, 13 * 3600)
  assert.equal(result.workIntervals.length, 1)
  const codes = workIntervalCodes(result.workIntervals)
  assert.deepEqual(codes.map((code) => code.type), ['START', 'STOP'])
  assert.equal(result.activities.length, 2)
  assert.equal(result.activities[0].eventId, 'EV-1')
  assert.equal(result.activities[0].clientName, 'Klient Testowy')
  assert.equal(result.activities[0].zoneName, 'Strefa A')
})

test('official totals never include provisional or active elapsed seconds', () => {
  const complete = {
    integrityState: WORKDAY_INTEGRITY_STATES.COMPLETE,
    closedSessionsSec: 3600,
    confirmedSec: 3600,
    provisionalSec: 0,
    activeElapsedSec: 0,
  }
  const incomplete = {
    integrityState: WORKDAY_INTEGRITY_STATES.OPEN_SESSION,
    closedSessionsSec: 1800,
    confirmedSec: 0,
    provisionalSec: 1800,
    activeElapsedSec: 7200,
    durationSec: 99 * 3600,
  }

  assert.deepEqual(workSessionSummarySeconds(incomplete), {
    activeElapsedSec: 7200,
    closedSessionsSec: 1800,
    confirmedSec: 0,
    provisionalSec: 1800,
  })
  assert.equal(workSessionConfirmedTotalSeconds([complete, incomplete]), 3600)
  assert.equal(workSessionProvisionalTotalSeconds([complete, incomplete]), 1800)
})

test('explicit canonical zero does not fall back to a legacy duration', () => {
  assert.deepEqual(workSessionSummarySeconds({
    integrityState: WORKDAY_INTEGRITY_STATES.INVALID,
    closedSessionsSec: 0,
    confirmedSec: 0,
    provisionalSec: 0,
    durationSec: 208 * 3600 + 51 * 60,
  }), {
    activeElapsedSec: 0,
    closedSessionsSec: 0,
    confirmedSec: 0,
    provisionalSec: 0,
  })
})

test('creates two codes for one closed work session', () => {
  const codes = workIntervalCodes([
    { startAt: '2026-07-20T05:00:00.000Z', endAt: '2026-07-20T08:00:00.000Z' },
  ])

  assert.equal(codes.length, 2)
  assert.deepEqual(codes.map((code) => code.type), ['START', 'STOP'])
  assert.deepEqual(codes.map((code) => code.session), [1, 1])
})

test('keeps stop and next start as separate codes when they share the same minute', () => {
  const codes = workIntervalCodes([
    { startAt: '2026-07-20T05:00:00.000Z', endAt: '2026-07-20T08:00:00.000Z' },
    { startAt: '2026-07-20T08:00:00.000Z', endAt: '2026-07-20T11:00:00.000Z' },
  ])

  assert.equal(codes.length, 4)
  assert.deepEqual(codes.map((code) => code.type), ['START', 'STOP', 'START', 'STOP'])
})

test('sums all start-stop sessions shown in the daily codes dialog', () => {
  const intervals = [
    { startAt: '2026-07-20T07:47:00.000Z', endAt: '2026-07-20T13:54:00.000Z' },
    { startAt: '2026-07-20T16:47:00.000Z', endAt: '2026-07-20T18:54:00.000Z' },
    { startAt: '2026-07-20T19:16:00.000Z', endAt: '2026-07-20T20:29:00.000Z' },
  ]

  assert.equal(workIntervalsTotalSeconds(intervals), (9 * 60 + 27) * 60)
})

test('regression 31.07 separates the Workday presence from Event session time', () => {
  const row = {
    workdayId: 'WD-31-07',
    startAt: '2026-07-31T15:16:29+02:00',
    endAt: '2026-07-31T20:42:28+02:00',
    recordedDurationSec: 5 * 3600 + 25 * 60 + 59,
    durationSource: 'event-intervals',
    workIntervals: [
      { eventId: 'EV-31-1', startAt: '2026-07-31T18:48:14+02:00', endAt: '2026-07-31T18:48:25+02:00' },
      { eventId: 'EV-31-2', startAt: '2026-07-31T19:26:14+02:00', endAt: '2026-07-31T20:16:16+02:00' },
      { eventId: 'EV-31-3', startAt: '2026-07-31T20:41:54+02:00', endAt: '2026-07-31T20:42:05+02:00' },
      { eventId: 'EV-31-4', startAt: '2026-07-31T20:42:13+02:00', endAt: '2026-07-31T20:42:28+02:00' },
    ],
  }

  assert.deepEqual(workdayPresenceFromRows([row]), {
    startAt: '2026-07-31T13:16:29.000Z',
    endAt: '2026-07-31T18:42:28.000Z',
    durationSec: 5 * 3600 + 25 * 60 + 59,
    isReliable: true,
  })
  assert.equal(
    workIntervalsTotalSeconds(workSessionAccountingFromRow(row).mergedWorkIntervals),
    5 * 3600 + 25 * 60 + 59,
  )
})

test('regression 31.07 exports the full Workday and ignores short operational activities', async () => {
  const presenceSec = 5 * 3600 + 25 * 60 + 59
  const [day] = enrichWorkdaysWithEventIntervals([{
    workdayId: 'WD-31-EXPORT',
    workerLogin: 'w034',
    workerName: 'Malgorzata Piprek',
    startAt: '2026-07-31T13:16:29.000Z',
    endAt: '2026-07-31T18:42:28.000Z',
    durationSec: presenceSec,
    status: 'CLOSED',
  }], [
    { eventId: 'EV-31-1', workdayId: 'WD-31-EXPORT', historySourceKind: 'event', startAt: '2026-07-31T16:48:14.000Z', endAt: '2026-07-31T16:48:25.000Z' },
    { eventId: 'EV-31-2', workdayId: 'WD-31-EXPORT', historySourceKind: 'event', startAt: '2026-07-31T17:26:14.000Z', endAt: '2026-07-31T18:16:16.000Z' },
    { eventId: 'EV-31-3', workdayId: 'WD-31-EXPORT', historySourceKind: 'event', startAt: '2026-07-31T18:41:54.000Z', endAt: '2026-07-31T18:42:05.000Z' },
    { eventId: 'EV-31-4', workdayId: 'WD-31-EXPORT', historySourceKind: 'event', startAt: '2026-07-31T18:42:13.000Z', endAt: '2026-07-31T18:42:28.000Z' },
  ])
  const deps = exportDeps(async () => ({ items: [day] }))
  const workers = [{ login: 'w034', workerId: 'W034', name: 'Malgorzata Piprek' }]

  const [evidenceRow] = await buildWorkTimeEvidenceRowsForWorkers({
    deps,
    orgId: 'ORG-1',
    workers,
    workerRows: workers,
    fromYmd: '2026-07-31',
    toYmd: '2026-07-31',
  })
  const [profileRow] = await buildWorkTimeExportRowsForWorkers({
    deps,
    orgId: 'ORG-1',
    workers,
    workerRows: workers,
    fromYmd: '2026-07-31',
    toYmd: '2026-07-31',
  })

  assert.equal(evidenceRow.workSec, presenceSec)
  assert.equal(evidenceRow.netSec, presenceSec)
  assert.equal(profileRow.durationSec, presenceSec)
  assert.equal(profileRow.netSec, presenceSec)
})

test('resolves separate GPS coordinates for START and STOP codes', () => {
  const interval = {
    dayGps: 'START_GPS lat=52.2297 lon=21.0122 | STOP_GPS lat=52.2301 lon=21.0134',
  }

  assert.deepEqual(workIntervalGpsCoordinates(interval, 'START'), { lat: '52.2297', lon: '21.0122' })
  assert.deepEqual(workIntervalGpsCoordinates(interval, 'STOP'), { lat: '52.2301', lon: '21.0134' })
  assert.equal(workIntervalGpsCoordinates({ dayGps: 'brak' }, 'START'), null)
})

test('phase-only STOP GPS never borrows the generic or START position', () => {
  assert.equal(
    workIntervalGpsCoordinates(
      { dayGps: 'START_GPS lat=52.2297 lon=21.0122' },
      'STOP',
      { phaseOnly: true },
    ),
    null,
  )
  assert.equal(
    workIntervalGpsCoordinates(
      { gps: '[[GPS lat=52.2297 lng=21.0122]]' },
      'STOP',
      { phaseOnly: true },
    ),
    null,
  )
  assert.deepEqual(
    workIntervalGpsCoordinates(
      { dayGps: 'STOP_GPS lat=52.2301 lon=21.0134' },
      'STOP',
      { phaseOnly: true },
    ),
    { lat: '52.2301', lon: '21.0134' },
  )
  assert.deepEqual(
    workIntervalGpsCoordinates(
      { stopGps: '52.2301, 21.0134' },
      'STOP',
      { phaseOnly: true },
    ),
    { lat: '52.2301', lon: '21.0134' },
  )
})

test('workday boundary GPS wins over CLEAN GPS for the same phase', () => {
  const dayGps = [
    'CLEAN_START_GPS lat=50.1000 lon=18.1000',
    'START_GPS lat=50.2000 lon=18.2000',
    'CLEAN_STOP_GPS lat=50.3000 lon=18.3000',
    'STOP_GPS lat=50.4000 lon=18.4000',
  ].join(' | ')

  assert.deepEqual(
    workIntervalGpsCoordinates({ dayGps }, 'START', { phaseOnly: true }),
    { lat: '50.2', lon: '18.2' },
  )
  assert.deepEqual(
    workIntervalGpsCoordinates({ dayGps }, 'STOP', { phaseOnly: true }),
    { lat: '50.4', lon: '18.4' },
  )
})

test('hides technical GPS payloads without removing a user comment', () => {
  assert.equal(
    workIntervalVisibleComment('Sprawdzono wejście | [[GPS lat=49.917776 lng=18.48361 acc=15 ts=2026-07-21T17:06:00Z]]'),
    'Sprawdzono wejście',
  )
  assert.equal(workIntervalVisibleComment('[[GPS lat=49.917776 lng=18.48361 acc=15'), '')
  assert.equal(workIntervalVisibleComment('START_GPS lat=49.9 lon=18.4'), '')
  assert.equal(
    workIntervalVisibleComment(`[[GPS lat=50.028311 lng=18.685924 acc=20
ts=2026-08-19T13:48:36.304Z src=SPECIAL_START]]
STOP BC0823
[[GPS lat=50.028017 lng=18.686104 acc=16
ts=2026-08-19T16:50:27.268Z src=STOP]]`),
    '',
  )
  assert.equal(
    workIntervalVisibleComment('Komentarz pracownika | [[GPS lat=50.028311 lng=18.685924]] | STOP BC0823'),
    'Komentarz pracownika',
  )
  assert.equal(workIntervalVisibleComment('Sprawdź GPS w samochodzie'), 'Sprawdź GPS w samochodzie')
})

test('does not double count overlapping work sessions', () => {
  const intervals = mergeWorkIntervals([
    { startAt: '2026-07-22T07:00:00.000Z', endAt: '2026-07-22T10:00:00.000Z' },
    { startAt: '2026-07-22T09:00:00.000Z', endAt: '2026-07-22T11:00:00.000Z' },
  ])

  assert.equal(intervals.length, 1)
  assert.equal(workIntervalsTotalSeconds(intervals), 4 * 3600)
})

test('exact duplicate Workdays render as one session and preserve every activity', () => {
  const result = aggregateWorkTimeDay([
    {
      workdayId: 'WD-DUP-1', workerLogin: 'W034', startAt: '2026-07-31T13:16:04.000Z',
      endAt: '2026-07-31T18:42:00.000Z', status: 'CLOSED', pauseTotalSec: 600,
      activities: [{ eventId: 'EV-DUP-1', workdayId: 'WD-DUP-1', startAt: '2026-07-31T14:00:00.000Z', endAt: '2026-07-31T15:00:00.000Z' }],
    },
    {
      workdayId: 'WD-DUP-2', workerLogin: 'W034', startAt: '2026-07-31T13:16:04.000Z',
      endAt: '2026-07-31T18:42:00.000Z', status: 'CLOSED', pauseTotalSec: 300,
      activities: [{ eventId: 'EV-DUP-2', workdayId: 'WD-DUP-2', startAt: '2026-07-31T16:00:00.000Z', endAt: '2026-07-31T17:00:00.000Z' }],
    },
  ], { nowMs: Date.parse('2026-08-03T00:00:00Z') })

  assert.equal(result.sessions.length, 1)
  assert.deepEqual(result.sessions[0].sourceWorkdayIds, ['WD-DUP-1', 'WD-DUP-2'])
  assert.deepEqual(result.sessions[0].activities.map((activity) => activity.eventId), ['EV-DUP-1', 'EV-DUP-2'])
  assert.equal(result.collapsedDuplicateSessionCount, 1)
  assert.equal(result.workedSec, 5 * 3600 + 25 * 60 + 56)
  assert.equal(result.pauseSec, 600)
  assert.equal(result.integrityState, WORKDAY_INTEGRITY_STATES.COMPLETE)
  assert.equal(result.issues.some((entry) => entry.code === 'OVERLAPPING_WORK_SESSIONS'), false)
})

test('a unique closed Workday replaces a stale open copy from the same START minute', () => {
  const result = aggregateWorkTimeDay([
    {
      workdayId: 'WD-OPEN-COPY', workerLogin: 'W034', startAt: '2026-07-31T11:27:41.000Z',
      status: 'RUNNING',
      activities: [{ eventId: 'EV-CLEAN', workdayId: 'WD-OPEN-COPY', startAt: '2026-07-31T12:00:00.000Z', endAt: '2026-07-31T13:00:00.000Z' }],
    },
    {
      workdayId: 'WD-CLOSED', workerLogin: 'W034', startAt: '2026-07-31T11:27:03.000Z',
      endAt: '2026-07-31T17:02:00.000Z', status: 'CLOSED',
    },
  ], { nowMs: Date.parse('2026-08-03T00:00:00Z') })

  assert.equal(result.sessions.length, 1)
  assert.equal(result.sessions[0].workdayId, 'WD-CLOSED')
  assert.deepEqual(result.sessions[0].sourceWorkdayIds, ['WD-CLOSED', 'WD-OPEN-COPY'])
  assert.deepEqual(result.sessions[0].activities.map((activity) => activity.eventId), ['EV-CLEAN'])
  assert.equal(result.openSessionCount, 0)
  assert.equal(result.integrityState, WORKDAY_INTEGRITY_STATES.COMPLETE)
  assert.equal(result.issues.some((entry) => entry.code === 'OPEN_SESSION'), false)
  assert.equal(result.workedSec, 5 * 3600 + 34 * 60 + 57)
})

test('does not add an open Workday to the accounted duration', () => {
  const workdays = [{ workdayId: 'WD-2', startAt: '2026-07-22T05:00:00.000Z', status: 'RUNNING', durationSec: 0 }]
  const events = [
    {
      eventId: 'EV-3',
      workdayId: 'WD-2',
      historySourceKind: 'event',
      startAt: '2026-07-22T05:00:00.000Z',
      endAt: '2026-07-22T08:00:00.000Z',
      status: 'CLOSED',
    },
    {
      eventId: 'EV-4',
      workdayId: 'WD-2',
      historySourceKind: 'event',
      startAt: '2026-07-22T15:00:00.000Z',
      status: 'RUNNING',
    },
  ]

  const [result] = enrichWorkdaysWithEventIntervals(workdays, events, {
    nowMs: new Date('2026-07-22T18:00:00.000Z').getTime(),
  })

  assert.equal(result.durationSec, 0)
  assert.equal(result.closedSessionsSec, 0)
  assert.equal(result.confirmedSec, 0)
  assert.equal(result.provisionalSec, 0)
  assert.equal(result.integrityState, WORKDAY_INTEGRITY_STATES.OPEN_SESSION)
  assert.equal(result.openSessions.length, 1)
  assert.deepEqual(workIntervalCodes(result.workIntervals).map((code) => code.type), ['START'])
})

test('an open third Workday keeps the two closed session total stable until STOP is supplied', () => {
  const rows = [
    { workdayId: 'WD-1', workerName: 'Małgorzata Piprek', dayKey: '2026-07-23', startAt: '2026-07-23T12:47:00.000Z', endAt: '2026-07-23T15:02:00.000Z', status: 'CLOSED' },
    { workdayId: 'WD-2', workerName: 'Małgorzata Piprek', dayKey: '2026-07-23', startAt: '2026-07-23T15:46:00.000Z', endAt: '2026-07-23T17:22:00.000Z', status: 'CLOSED' },
    { workdayId: 'WD-3', workerName: 'Małgorzata Piprek', dayKey: '2026-07-23', startAt: '2026-07-23T17:42:00.000Z', status: 'RUNNING' },
  ]

  const morning = aggregateWorkTimeDay(rows, { nowMs: Date.parse('2026-08-01T06:00:00Z') })
  const evening = aggregateWorkTimeDay(rows, { nowMs: Date.parse('2026-08-20T20:00:00Z') })

  assert.equal(morning.closedSessionsSec, 3 * 3600 + 51 * 60)
  assert.equal(evening.closedSessionsSec, morning.closedSessionsSec)
  assert.equal(morning.openSessions.length, 1)
  assert.equal(morning.integrityState, WORKDAY_INTEGRITY_STATES.OPEN_SESSION)
  assert.throws(
    () => assertWorkTimeRowsExportable([{
      ...morning,
      dayKey: '2026-07-23',
      workerName: 'Małgorzata Piprek',
    }]),
    (error) => error?.code === 'INCOMPLETE_WORKDAYS' &&
      error.message.includes('2026-07-23 - Małgorzata Piprek') &&
      error.message.includes('OPEN_SESSION'),
  )

  const corrected = aggregateWorkTimeDay(rows.map((row) => row.workdayId === 'WD-3'
    ? { ...row, endAt: '2026-07-23T19:36:00.000Z', status: 'CLOSED' }
    : row))
  assert.equal(corrected.closedSessionsSec, 5 * 3600 + 45 * 60)
  assert.equal(corrected.confirmedSec, 5 * 3600 + 45 * 60)
  assert.equal(corrected.provisionalSec, 0)
  assert.equal(corrected.integrityState, WORKDAY_INTEGRITY_STATES.COMPLETE)
  assert.equal(assertWorkTimeRowsExportable([{ ...corrected }]), true)
})

test('table projection splits two START STOP cycles and shows the latest cycle first', () => {
  const sourceRows = [{ workdayId: 'WD-1' }, { workdayId: 'WD-2' }]
  const [day] = [{
    dayKey: '2026-08-21',
    businessDateYmd: '2026-08-21',
    workerName: 'Agata Zalewska',
    workerLogin: 'zalewska.agata',
    workSec: 4 * 3600,
    breakSec: 2 * 3600,
    sourceRows,
    sessions: [
      {
        workdayId: 'WD-2',
        startAt: '2026-08-21T12:00:00.000Z',
        endAt: '2026-08-21T14:00:00.000Z',
        isValid: true,
        integrityState: WORKDAY_INTEGRITY_STATES.COMPLETE,
      },
      {
        workdayId: 'WD-1',
        startAt: '2026-08-21T08:00:00.000Z',
        endAt: '2026-08-21T10:00:00.000Z',
        isValid: true,
        integrityState: WORKDAY_INTEGRITY_STATES.COMPLETE,
      },
    ],
  }]

  const rows = workTimeCycleRowsFromDays([day])

  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map((row) => row.dayKey), ['2026-08-21', '2026-08-21'])
  assert.deepEqual(rows.map((row) => row.workdayId), ['WD-2', 'WD-1'])
  assert.deepEqual(rows.map((row) => [row.startAt, row.endAt]), [
    ['2026-08-21T12:00:00.000Z', '2026-08-21T14:00:00.000Z'],
    ['2026-08-21T08:00:00.000Z', '2026-08-21T10:00:00.000Z'],
  ])
  assert.deepEqual(rows.map((row) => row.workSec), [2 * 3600, 2 * 3600])
  assert.deepEqual(rows.map((row) => row.breakSec), [0, 0])
  assert.equal(rows[0].sourceRows, sourceRows)
  assert.equal(rows[1].sourceRows, sourceRows)
})

test('deduplicates operational eventId without treating activities as attendance sessions', () => {
  const workday = { workdayId: 'WD-DATA', startAt: '2026-07-24T07:00:00.000Z', endAt: '2026-07-24T12:00:00.000Z', status: 'CLOSED' }
  const accounting = aggregateWorkSessions(workday, [
    { eventId: 'EV-DUP', workdayId: 'WD-DATA', historySourceKind: 'event', startAt: '2026-07-24T07:00:00.000Z', endAt: '2026-07-24T09:00:00.000Z', updatedAt: '2026-07-24T09:01:00.000Z' },
    { eventId: 'EV-DUP', workdayId: 'WD-DATA', historySourceKind: 'event', startAt: '2026-07-24T07:00:00.000Z', endAt: '2026-07-24T10:00:00.000Z', updatedAt: '2026-07-24T10:01:00.000Z' },
    { eventId: 'EV-OTHER', workdayId: 'WD-DATA', historySourceKind: 'event', startAt: '2026-07-24T09:00:00.000Z', endAt: '2026-07-24T11:00:00.000Z' },
  ])

  assert.equal(accounting.workIntervals.length, 1)
  assert.equal(accounting.activities.length, 2)
  assert.equal(accounting.closedSessionsSec, 5 * 3600)
  assert.equal(accounting.integrityState, WORKDAY_INTEGRITY_STATES.INVALID)
  assert.ok(accounting.integrityIssues.some((entry) => entry.code === 'DUPLICATE_EVENT_ID'))
  assert.equal(accounting.integrityIssues.some((entry) => entry.code === 'OVERLAPPING_SESSIONS'), false)
})

test('frontend recovers a CLEAN code misclassified as attendance STOP through the last activity', () => {
  const accounting = aggregateWorkSessions({
    workdayId: 'WD-CLEAN-STOP',
    startAt: '2026-08-01T16:03:06Z',
    endAt: '2026-08-01T16:04:00Z',
    stopObject: 'BC0326',
    stopZoneFunction: 'clean (spoza listy)',
    status: 'CLOSED',
  }, [
    { eventId: 'EV-CLEAN-1', workdayId: 'WD-CLEAN-STOP', historySourceKind: 'event', startAt: '2026-08-01T16:09:00Z', endAt: '2026-08-01T16:38:00Z' },
    { eventId: 'EV-CLEAN-2', workdayId: 'WD-CLEAN-STOP', historySourceKind: 'event', startAt: '2026-08-01T16:38:00Z', endAt: '2026-08-01T18:26:00Z' },
  ], { nowMs: Date.parse('2026-08-03T00:00:00Z') })

  assert.equal(accounting.closedSessionsSec, 2 * 3600 + 22 * 60 + 54)
  assert.equal(accounting.workIntervals[0].recordedEndAt, '2026-08-01T16:04:00.000Z')
  assert.equal(accounting.workIntervals[0].endAt, '2026-08-01T18:26:00.000Z')
  assert.equal(accounting.workIntervals[0].stopRecoveredFromActivity, true)
  assert.equal(accounting.integrityIssues.some((entry) => entry.code === 'ACTIVITY_OUTSIDE_SESSION'), false)
  assert.equal(accounting.integrityState, WORKDAY_INTEGRITY_STATES.COMPLETE)
})

test('history resolves STOP phase metadata from the current zone catalog without a STOP fallback', () => {
  const snapshot = resolveWorkIntervalZoneSnapshot({
    startObject: 'START-1',
    stopObject: 'BC0326',
    zoneId: 'START-1',
    zoneFunction: 'START',
  }, 'STOP', [{
    id: 'BC0326',
    clientName: 'GAPR',
    name: 'WC / Prysznic',
    function: 'clean (spoza listy)',
    location: 'A2 damski I meski',
  }])

  assert.equal(snapshot.qrCode, 'BC0326')
  assert.equal(snapshot.zoneName, 'WC / Prysznic')
  assert.equal(snapshot.functionName, 'clean (spoza listy)')
  assert.equal(snapshot.clientName, 'GAPR')
})

test('history prioritizes the phase QR over shared fallbacks regardless of zone catalog order', () => {
  const interval = {
    startObject: 'BC-START',
    stopObject: 'BC-STOP',
    zoneId: 'BC-START',
  }
  const zones = [
    { id: 'BC-START', name: 'Wejscie A', location: 'Drzwi frontowe' },
    { id: 'BC-STOP', name: 'Wyjscie B', location: 'Brama tylna' },
  ]

  const startSnapshot = resolveWorkIntervalZoneSnapshot(interval, 'START', zones)
  const stopSnapshot = resolveWorkIntervalZoneSnapshot(interval, 'STOP', zones)

  assert.equal(startSnapshot.qrCode, 'BC-START')
  assert.equal(startSnapshot.location, 'Drzwi frontowe')
  assert.equal(stopSnapshot.qrCode, 'BC-STOP')
  assert.equal(stopSnapshot.location, 'Brama tylna')
})

test('phase-only STOP metadata never borrows the START QR or a generic location', () => {
  const interval = {
    startObject: 'BC-START',
    zoneId: 'BC-START',
    utilityRoomId: 'BC-START',
    location: 'Drzwi frontowe',
  }
  const zones = [
    { id: 'BC-START', name: 'Wejscie A', location: 'Drzwi frontowe' },
  ]

  const startSnapshot = resolveWorkIntervalZoneSnapshot(interval, 'START', zones, { phaseOnly: true })
  const stopSnapshot = resolveWorkIntervalZoneSnapshot(interval, 'STOP', zones, { phaseOnly: true })

  assert.equal(startSnapshot.qrCode, 'BC-START')
  assert.equal(startSnapshot.location, 'Drzwi frontowe')
  assert.equal(stopSnapshot.qrCode, '')
  assert.equal(stopSnapshot.location, '')
  assert.equal(stopSnapshot.zoneName, '')
})

test('phase-only history resolves mapped day START and STOP QR independently', () => {
  const interval = {
    dayStartObject: 'BC-START',
    dayStopObject: 'BC-STOP',
    zoneId: 'BC-CLEAN',
    location: 'Lokalizacja CLEAN',
  }
  const zones = [
    { id: 'BC-CLEAN', location: 'Lokalizacja CLEAN' },
    { id: 'BC-STOP', location: 'Wyjście tylne' },
    { id: 'BC-START', location: 'Wejście główne' },
  ]

  const start = resolveWorkIntervalZoneSnapshot(interval, 'START', zones, { phaseOnly: true })
  const stop = resolveWorkIntervalZoneSnapshot(interval, 'STOP', zones, { phaseOnly: true })

  assert.equal(start.qrCode, 'BC-START')
  assert.equal(start.location, 'Wejście główne')
  assert.equal(stop.qrCode, 'BC-STOP')
  assert.equal(stop.location, 'Wyjście tylne')
})

test('activity metadata keeps its own QR instead of the mapped Workday START QR', () => {
  const snapshot = resolveWorkIntervalZoneSnapshot({
    dayStartObject: 'BC-WORKDAY-START',
    startObject: 'BC-CLEAN',
    zoneId: 'BC-CLEAN',
  }, 'START', [
    { id: 'BC-WORKDAY-START', location: 'Wejście do pracy' },
    { id: 'BC-CLEAN', location: 'Pomieszczenie sprzątania' },
  ])

  assert.equal(snapshot.qrCode, 'BC-CLEAN')
  assert.equal(snapshot.location, 'Pomieszczenie sprzątania')
})

test('profile and evidence exports use the closed Workday even when an activity is open', async () => {
  const [incompleteDay] = enrichWorkdaysWithEventIntervals([
    {
      workdayId: 'WD-EXPORT-OPEN',
      workerLogin: 'anna',
      workerName: 'Anna Testowa',
      startAt: '2026-07-23T11:51:00.000Z',
      endAt: '2026-07-23T19:36:00.000Z',
      status: 'CLOSED',
    },
  ], [
    { eventId: 'EV-E1', workdayId: 'WD-EXPORT-OPEN', historySourceKind: 'event', startAt: '2026-07-23T12:47:00.000Z', endAt: '2026-07-23T15:02:00.000Z', status: 'CLOSED' },
    { eventId: 'EV-E2', workdayId: 'WD-EXPORT-OPEN', historySourceKind: 'event', startAt: '2026-07-23T15:46:00.000Z', endAt: '2026-07-23T17:22:00.000Z', status: 'CLOSED' },
    { eventId: 'EV-E3', workdayId: 'WD-EXPORT-OPEN', historySourceKind: 'event', startAt: '2026-07-23T17:42:00.000Z', status: 'RUNNING' },
  ])
  const deps = exportDeps(async () => ({ items: [incompleteDay] }))
  const workers = [{ login: 'anna', workerId: 'W002', name: 'Anna Testowa' }]

  const [evidenceRow] = await buildWorkTimeEvidenceRowsForWorkers({
    deps,
    orgId: 'ORG-1',
    workers,
    workerRows: workers,
    fromYmd: '2026-07-01',
    toYmd: '2026-07-31',
  })
  const [profileExportRow] = await buildWorkTimeExportRowsForWorkers({
    deps,
    orgId: 'ORG-1',
    workers,
    workerRows: workers,
    fromYmd: '2026-07-01',
    toYmd: '2026-07-31',
  })

  assert.equal(evidenceRow.workSec, 7 * 3600 + 45 * 60)
  assert.equal(profileExportRow.durationSec, evidenceRow.workSec)
  assert.equal(evidenceRow.integrityState, WORKDAY_INTEGRITY_STATES.INCONSISTENT)
  assert.equal(profileExportRow.integrityState, evidenceRow.integrityState)
  assert.throws(() => assertWorkTimeRowsExportable([evidenceRow]), { code: 'INCOMPLETE_WORKDAYS' })
})

test('exports a closed Workday even when it contains no operational events', async () => {
  const [emptyDay] = enrichWorkdaysWithEventIntervals([{
    workdayId: 'WD-EMPTY',
    workerLogin: 'anna',
    workerName: 'Anna Testowa',
    startAt: '2026-07-24T08:00:00.000Z',
    endAt: '2026-07-24T12:00:00.000Z',
    durationSec: 0,
    status: 'CLOSED',
  }], [])
  const deps = exportDeps(async () => ({ items: [emptyDay] }))
  const workers = [{ login: 'anna', workerId: 'W002', name: 'Anna Testowa' }]

  const [evidenceRow] = await buildWorkTimeEvidenceRowsForWorkers({
    deps,
    orgId: 'ORG-1',
    workers,
    workerRows: workers,
    fromYmd: '2026-07-01',
    toYmd: '2026-07-31',
  })
  const [profileExportRow] = await buildWorkTimeExportRowsForWorkers({
    deps,
    orgId: 'ORG-1',
    workers,
    workerRows: workers,
    fromYmd: '2026-07-01',
    toYmd: '2026-07-31',
  })

  assert.equal(emptyDay.closedSessionsSec, 4 * 3600)
  assert.equal(emptyDay.integrityState, WORKDAY_INTEGRITY_STATES.COMPLETE)
  assert.equal(evidenceRow.workSec, 4 * 3600)
  assert.equal(profileExportRow.durationSec, 4 * 3600)
  assert.equal(evidenceRow.integrityState, WORKDAY_INTEGRITY_STATES.COMPLETE)
  assert.equal(profileExportRow.integrityState, WORKDAY_INTEGRITY_STATES.COMPLETE)
})

test('jawnie pusta lista workIntervals nie wraca do obwiedni Workday w tabelach', () => {
  const intervals = workIntervalsFromRow({
    workIntervals: [],
    startAt: '2026-07-24T08:00:00.000Z',
    endAt: '2026-07-24T12:00:00.000Z',
    durationSec: 4 * 3600,
  })

  assert.deepEqual(intervals, [])
  assert.equal(workIntervalsTotalSeconds(intervals), 0)
})

test('legacy Workday remains the attendance source without Event rows', async () => {
  const legacyWorkday = {
    workdayId: 'WD-LEGACY-ENVELOPE',
    workerLogin: 'anna',
    workerName: 'Anna Testowa',
    dayKey: '2026-07-24',
    startAt: '2026-07-24T08:00:00.000Z',
    endAt: '2026-07-24T12:00:00.000Z',
    durationSec: 4 * 3600,
    status: 'CLOSED',
  }
  const accounting = aggregateWorkSessions(legacyWorkday, [])
  assert.equal(accounting.closedSessionsSec, 4 * 3600)
  assert.equal(accounting.confirmedSec, 4 * 3600)
  assert.equal(accounting.integrityState, WORKDAY_INTEGRITY_STATES.COMPLETE)

  const deps = exportDeps(async () => ({ items: [legacyWorkday] }))
  const workers = [{ login: 'anna', workerId: 'W002', name: 'Anna Testowa' }]
  const [evidenceRow] = await buildWorkTimeEvidenceRowsForWorkers({
    deps,
    orgId: 'ORG-1',
    workers,
    workerRows: workers,
    fromYmd: '2026-07-01',
    toYmd: '2026-07-31',
  })
  const [profileRow] = await buildWorkTimeExportRowsForWorkers({
    deps,
    orgId: 'ORG-1',
    workers,
    workerRows: workers,
    fromYmd: '2026-07-01',
    toYmd: '2026-07-31',
  })

  assert.equal(evidenceRow.workSec, 4 * 3600)
  assert.equal(profileRow.durationSec, 4 * 3600)
  assert.equal(evidenceRow.integrityState, WORKDAY_INTEGRITY_STATES.COMPLETE)
  assert.equal(profileRow.integrityState, WORKDAY_INTEGRITY_STATES.COMPLETE)
})

test('many Workdays on one business date remain valid and sum only closed START-STOP pairs', async () => {
  const enrichedDays = enrichWorkdaysWithEventIntervals([
    {
      workdayId: 'WD-MULTI-1',
      workerLogin: 'anna',
      workerName: 'Anna Testowa',
      businessDateYmd: '2026-07-25',
      startAt: '2026-07-25T06:00:00.000Z',
      endAt: '2026-07-25T08:00:00.000Z',
      durationSec: 2 * 3600,
      status: 'CLOSED',
    },
    {
      workdayId: 'WD-MULTI-2',
      workerLogin: 'anna',
      workerName: 'Anna Testowa',
      businessDateYmd: '2026-07-25',
      startAt: '2026-07-25T09:00:00.000Z',
      endAt: '2026-07-25T11:00:00.000Z',
      durationSec: 2 * 3600,
      status: 'CLOSED',
    },
  ], [
    { eventId: 'EV-MULTI-1', workdayId: 'WD-MULTI-1', historySourceKind: 'event', workerLogin: 'anna', startAt: '2026-07-25T06:00:00.000Z', endAt: '2026-07-25T08:00:00.000Z', status: 'CLOSED' },
    { eventId: 'EV-MULTI-2', workdayId: 'WD-MULTI-2', historySourceKind: 'event', workerLogin: 'anna', startAt: '2026-07-25T09:00:00.000Z', endAt: '2026-07-25T11:00:00.000Z', status: 'CLOSED' },
  ])

  assert.equal(enrichedDays.length, 2)
  for (const row of enrichedDays) {
    assert.equal(row.integrityState, WORKDAY_INTEGRITY_STATES.COMPLETE)
    assert.equal(row.confirmedSec, 2 * 3600)
    assert.equal(row.provisionalSec, 0)
    assert.equal(row.integrityIssues.some((entry) => entry.code === 'MULTIPLE_WORKDAYS_FOR_BUSINESS_DATE'), false)
  }
  assert.equal(enrichedDays.reduce((sum, row) => sum + row.closedSessionsSec, 0), 4 * 3600)
  assert.equal(assertWorkTimeRowsExportable(enrichedDays), true)

  const deps = exportDeps(async () => ({ items: enrichedDays }))
  const workers = [{ login: 'anna', workerId: 'W002', name: 'Anna Testowa' }]
  const evidenceRows = await buildWorkTimeEvidenceRowsForWorkers({
    deps,
    orgId: 'ORG-1',
    workers,
    workerRows: workers,
    fromYmd: '2026-07-01',
    toYmd: '2026-07-31',
  })
  const profileRows = await buildWorkTimeExportRowsForWorkers({
    deps,
    orgId: 'ORG-1',
    workers,
    workerRows: workers,
    fromYmd: '2026-07-01',
    toYmd: '2026-07-31',
  })
  assert.equal(evidenceRows.length, 2)
  assert.equal(profileRows.length, 2)
  assert.deepEqual(
    evidenceRows.map((row) => [row.startAt, row.endAt, row.workSec]),
    [
      ['2026-07-25T06:00:00.000Z', '2026-07-25T08:00:00.000Z', 2 * 3600],
      ['2026-07-25T09:00:00.000Z', '2026-07-25T11:00:00.000Z', 2 * 3600],
    ],
  )
  assert.deepEqual(
    profileRows.map((row) => [row.startIso, row.endIso, row.durationSec]),
    [
      ['2026-07-25T06:00:00.000Z', '2026-07-25T08:00:00.000Z', 2 * 3600],
      ['2026-07-25T09:00:00.000Z', '2026-07-25T11:00:00.000Z', 2 * 3600],
    ],
  )
  assert.equal(evidenceRows.every((row) => row.integrityState === WORKDAY_INTEGRITY_STATES.COMPLETE), true)
  assert.equal(profileRows.every((row) => row.integrityState === WORKDAY_INTEGRITY_STATES.COMPLETE), true)
  assert.equal(evidenceRows.reduce((sum, row) => sum + row.workSec, 0), 4 * 3600)
  assert.equal(profileRows.reduce((sum, row) => sum + row.durationSec, 0), 4 * 3600)
  assert.equal(assertWorkTimeRowsExportable(evidenceRows), true)
  assert.equal(assertWorkTimeRowsExportable(profileRows), true)
})

test('29.07 evidence export emits one row per START-STOP session instead of one day envelope', async () => {
  const enrichedDays = enrichWorkdaysWithEventIntervals([
    {
      workdayId: 'WD-2026-07-29-1',
      workerLogin: 'piprek',
      workerName: 'Malgorzata Piprek',
      businessDateYmd: '2026-07-29',
      startAt: '2026-07-29T05:27:13.000Z',
      endAt: '2026-07-29T11:26:00.000Z',
      durationSec: 5 * 3600 + 58 * 60 + 47,
      status: 'CLOSED',
    },
    {
      workdayId: 'WD-2026-07-29-2',
      workerLogin: 'piprek',
      workerName: 'Malgorzata Piprek',
      businessDateYmd: '2026-07-29',
      startAt: '2026-07-29T16:20:00.000Z',
      endAt: '2026-07-29T19:38:00.000Z',
      durationSec: 3 * 3600 + 18 * 60,
      status: 'CLOSED',
    },
  ], [])
  const deps = exportDeps(async () => ({ items: enrichedDays }))
  const workers = [{ login: 'piprek', workerId: 'W034', name: 'Malgorzata Piprek' }]

  const evidenceRows = await buildWorkTimeEvidenceRowsForWorkers({
    deps,
    orgId: 'ORG-1',
    workers,
    workerRows: workers,
    fromYmd: '2026-07-29',
    toYmd: '2026-07-29',
  })
  const profileRows = await buildWorkTimeExportRowsForWorkers({
    deps,
    orgId: 'ORG-1',
    workers,
    workerRows: workers,
    fromYmd: '2026-07-29',
    toYmd: '2026-07-29',
  })

  assert.equal(evidenceRows.length, 2)
  assert.equal(profileRows.length, 2)
  assert.deepEqual(evidenceRows.map((row) => row.dayKey), ['2026-07-29', '2026-07-29'])
  assert.deepEqual(
    evidenceRows.map((row) => [row.startAt, row.endAt, row.workSec]),
    [
      ['2026-07-29T05:27:13.000Z', '2026-07-29T11:26:00.000Z', 5 * 3600 + 58 * 60 + 47],
      ['2026-07-29T16:20:00.000Z', '2026-07-29T19:38:00.000Z', 3 * 3600 + 18 * 60],
    ],
  )
  assert.deepEqual(
    profileRows.map((row) => [row.startIso, row.endIso, row.durationSec]),
    [
      ['2026-07-29T05:27:13.000Z', '2026-07-29T11:26:00.000Z', 5 * 3600 + 58 * 60 + 47],
      ['2026-07-29T16:20:00.000Z', '2026-07-29T19:38:00.000Z', 3 * 3600 + 18 * 60],
    ],
  )
  assert.equal(evidenceRows.reduce((sum, row) => sum + row.workSec, 0), 9 * 3600 + 16 * 60 + 47)
  assert.equal(profileRows.reduce((sum, row) => sum + row.durationSec, 0), 9 * 3600 + 16 * 60 + 47)
})

test('keeps exact seconds instead of rounding each session to minutes', () => {
  const accounting = aggregateWorkSessions({
    workdayId: 'WD-SECONDS',
    startAt: '2026-07-31T19:26:10.000Z',
    endAt: '2026-07-31T20:42:59.000Z',
    durationSec: 50 * 60 + 35 + 72,
    status: 'CLOSED',
  }, [
    { eventId: 'EV-S1', workdayId: 'WD-SECONDS', historySourceKind: 'event', startAt: '2026-07-31T19:26:10.000Z', endAt: '2026-07-31T20:16:45.000Z' },
    { eventId: 'EV-S2', workdayId: 'WD-SECONDS', historySourceKind: 'event', startAt: '2026-07-31T20:41:05.000Z', endAt: '2026-07-31T20:42:17.000Z' },
  ])

  assert.equal(accounting.closedSessionsSec, 76 * 60 + 49)
  assert.equal(accounting.confirmedSec, accounting.closedSessionsSec)
})

test('same displayed minute does not mark an activity as outside its Workday', () => {
  const accounting = aggregateWorkSessions({
    workdayId: 'WD-MINUTE',
    startAt: '2026-07-31T15:16:04+02:00',
    endAt: '2026-07-31T20:42:00+02:00',
    status: 'CLOSED',
  }, [
    { eventId: 'EV-MINUTE-1', workdayId: 'WD-MINUTE', historySourceKind: 'event', startAt: '2026-07-31T20:41:54+02:00', endAt: '2026-07-31T20:42:05+02:00' },
    { eventId: 'EV-MINUTE-2', workdayId: 'WD-MINUTE', historySourceKind: 'event', startAt: '2026-07-31T20:42:13+02:00', endAt: '2026-07-31T20:42:28+02:00' },
  ], { nowMs: Date.parse('2026-08-03T00:00:00Z') })

  assert.equal(accounting.integrityIssues.some((entry) => entry.code === 'ACTIVITY_OUTSIDE_SESSION'), false)
  assert.deepEqual(accounting.activities.map((activity) => activity.durationSec), [11, 15])
  assert.equal(accounting.closedSessionsSec, 5 * 3600 + 25 * 60 + 56)
  assert.equal(accounting.integrityState, WORKDAY_INTEGRITY_STATES.COMPLETE)
})

test('31.07 uses one HH:MM:SS formatter in table, PDF columns and CSV', () => {
  const seconds = 50 * 60 + 47
  const deps = {
    dashboardWorkerSurnameDisplayName: (value) => value,
    durationSecondsToHm: () => 'WRONG-HH-MM',
    normalizeSearchText: (value) => String(value ?? '').toLowerCase(),
    workerDetailDateKeyToLabel: (value) => value,
    workerDetailIsoToHm: () => '20:42',
  }
  const profileWorkColumn = createWorkTimeExportColumns(deps).find((column) => column.id === 'work')
  const evidenceColumns = createWorkTimeEvidenceColumns(deps)
  const evidenceWorkColumn = evidenceColumns.find((column) => column.id === 'work')
  const row = {
    dayKey: '2026-07-31',
    integrityState: 'COMPLETE',
    workSec: seconds,
    netSec: seconds,
    breakSec: 0,
    workerName: 'Rafal Dudek',
  }

  assert.equal(formatWorkDurationHms(seconds), '00:50:47')
  assert.equal(profileWorkColumn.getValue({ durationSec: seconds }), '00:50:47')
  assert.equal(evidenceWorkColumn.getValue(row), '00:50:47')
  const csv = workTimeEvidenceCsvContent({ rows: [row], columns: evidenceColumns, deps })
  assert.match(csv, /00:50:47/)
  assert.doesNotMatch(csv, /WRONG-HH-MM/)
})

test('uses exact Workday intervals in worker profile and evidence exports', async () => {
  let requestedSource = ''
  const workIntervals = [
    { startAt: '2026-07-22T05:00:00.000Z', endAt: '2026-07-22T08:00:00.000Z' },
    { startAt: '2026-07-22T15:00:00.000Z', endAt: '2026-07-22T18:00:00.000Z' },
  ]
  const getWorkdays = async (_orgId, filters) => {
    requestedSource = filters.source
    return {
      items: [{
        workdayId: 'WD-3',
        workerLogin: 'anna',
        workerName: 'Anna Testowa',
        startAt: '2026-07-22T05:00:00.000Z',
        endAt: '2026-07-22T18:00:00.000Z',
        durationSec: 6 * 3600,
        workIntervals,
      }],
    }
  }
  const deps = exportDeps(getWorkdays)
  const workers = [{ login: 'anna', workerId: 'W002', name: 'Anna Testowa' }]

  const [evidenceRow] = await buildWorkTimeEvidenceRowsForWorkers({
    deps,
    orgId: 'ORG-1',
    workers,
    workerRows: workers,
    fromYmd: '2026-07-01',
    toYmd: '2026-07-31',
  })
  const [profileExportRow] = await buildWorkTimeExportRowsForWorkers({
    deps,
    orgId: 'ORG-1',
    workers,
    workerRows: workers,
    fromYmd: '2026-07-01',
    toYmd: '2026-07-31',
  })

  assert.equal(requestedSource, 'worktime')
  assert.equal(evidenceRow.workSec, 13 * 3600)
  assert.equal(profileExportRow.durationSec, 13 * 3600)
})

test('frontend and backend aggregators share the same accounting contract', () => {
  const now = new Date('2026-08-03T10:00:00.000Z')
  const fixtures = [
    {
      workday: { start_at: '2026-07-23T08:00:00Z', end_at: '2026-07-23T12:00:00Z', duration_sec: 10800, status: 'CLOSED', business_date_ymd: '2026-07-23' },
      sessions: [{ event_id: 'E-COMPLETE', worker_login: 'W1', start_at: '2026-07-23T08:30:00Z', end_at: '2026-07-23T11:30:00Z' }],
    },
    {
      workday: { start_at: '2026-07-23T08:00:00Z', end_at: '2026-07-23T12:00:00Z', duration_sec: 0, status: 'CLOSED', business_date_ymd: '2026-07-23' },
      sessions: [{ event_id: 'E-OPEN', worker_login: 'W1', start_at: '2026-07-23T09:00:00Z', end_at: null }],
    },
    {
      workday: { start_at: '2026-07-23T08:00:00Z', end_at: '2026-07-23T12:00:00Z', duration_sec: 7200, status: 'CLOSED', business_date_ymd: '2026-07-23' },
      sessions: [{ event_id: 'E-MISMATCH', worker_login: 'W1', start_at: '2026-07-23T09:00:00Z', end_at: '2026-07-23T10:00:00Z' }],
    },
    {
      workday: { start_at: '2026-08-04T08:00:00Z', end_at: '2026-08-04T10:00:00Z', duration_sec: 3600, status: 'CLOSED', business_date_ymd: '2026-08-04' },
      sessions: [{ event_id: 'E-FUTURE', worker_login: 'W1', start_at: '2026-08-04T08:30:00Z', end_at: '2026-08-04T09:30:00Z' }],
    },
    {
      workday: { start_at: '2026-07-23T08:00:00Z', end_at: '2026-07-23T12:00:00Z', duration_sec: 0, status: 'CLOSED', business_date_ymd: '2026-07-23' },
      sessions: [],
    },
  ]

  for (const [index, fixture] of fixtures.entries()) {
    const backendWorkday = {
      org_id: 'ORG-1',
      workday_id: `WD-PARITY-${index}`,
      worker_login: 'W1',
      updated_at: '2026-08-01T10:00:00Z',
      ...fixture.workday,
    }
    const backendSessions = fixture.sessions.map((session) => ({
      workday_id: backendWorkday.workday_id,
      ...session,
    }))
    const frontendWorkday = {
      workdayId: backendWorkday.workday_id,
      workerLogin: backendWorkday.worker_login,
      startAt: backendWorkday.start_at,
      endAt: backendWorkday.end_at,
      durationSec: backendWorkday.duration_sec,
      status: backendWorkday.status,
      businessDateYmd: backendWorkday.business_date_ymd,
    }
    const frontendSessions = backendSessions.map((session) => ({
      eventId: session.event_id,
      workdayId: backendWorkday.workday_id,
      historySourceKind: 'event',
      workerLogin: session.worker_login,
      startAt: session.start_at,
      endAt: session.end_at,
      status: session.end_at ? 'CLOSED' : 'RUNNING',
    }))

    const backend = buildWorkTimeDay({
      workdays: [backendWorkday],
      events: backendSessions,
      businessDateYmd: backendWorkday.business_date_ymd,
      now,
      orgId: 'ORG-1',
      workerLogin: 'W1',
    })
    const frontend = aggregateWorkSessions(frontendWorkday, frontendSessions, {
      nowMs: now.getTime(),
    })
    assert.deepEqual(
      {
        canFinalize: frontend.canFinalize,
        closedSessionsSec: frontend.closedSessionsSec,
        confirmedSec: frontend.confirmedSec,
        integrityState: frontend.integrityState,
        provisionalSec: frontend.provisionalSec,
      },
      {
        canFinalize: backend.canFinalize,
        closedSessionsSec: backend.closedSessionsSec,
        confirmedSec: backend.confirmedSec,
        integrityState: backend.integrityState,
        provisionalSec: backend.provisionalSec,
      },
      `fixture ${index}`,
    )
  }
})

test('frontend derives legacy business dates in Europe/Warsaw, including DST boundary', () => {
  assert.equal(warsawBusinessDateKey('2026-03-28T23:30:00.000Z'), '2026-03-29')
  assert.equal(warsawBusinessDateKey('2026-10-24T22:30:00.000Z'), '2026-10-25')
})
