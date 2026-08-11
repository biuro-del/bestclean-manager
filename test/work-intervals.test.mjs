import assert from 'node:assert/strict'
import test from 'node:test'

import {
  enrichWorkdaysWithEventIntervals,
  mergeWorkIntervals,
  summarizeWorkTimeRows,
  workIntervalCodes,
  workIntervalGpsCoordinates,
  workIntervalsTotalSeconds,
} from '../web-app/apps/portal-web/src/features/workers/workIntervals.js'
import { buildWorkTimeEvidenceRowsForWorkers } from '../web-app/apps/portal-web/src/features/workers/work_time_evidence_export.js'
import { buildWorkTimeExportRowsForWorkers } from '../web-app/apps/portal-web/src/features/workers/work_time_export.js'

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

test('sums separate work sessions without counting the gap between them', () => {
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

  assert.equal(result.durationSec, 6 * 3600)
  assert.equal(result.recordedDurationSec, 13 * 3600)
  assert.equal(result.workIntervals.length, 2)
  const codes = workIntervalCodes(result.workIntervals)
  assert.deepEqual(codes.map((code) => code.type), ['START', 'STOP', 'START', 'STOP'])
  assert.equal(codes[0].interval.eventId, 'EV-1')
  assert.equal(codes[0].interval.clientName, 'Klient Testowy')
  assert.equal(codes[0].interval.zoneName, 'Strefa A')
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

test('resolves separate GPS coordinates for START and STOP codes', () => {
  const interval = {
    dayGps: 'START_GPS lat=52.2297 lon=21.0122 | STOP_GPS lat=52.2301 lon=21.0134',
  }

  assert.deepEqual(workIntervalGpsCoordinates(interval, 'START'), { lat: '52.2297', lon: '21.0122' })
  assert.deepEqual(workIntervalGpsCoordinates(interval, 'STOP'), { lat: '52.2301', lon: '21.0134' })
  assert.equal(workIntervalGpsCoordinates({ dayGps: 'brak' }, 'START'), null)
})

test('does not double count overlapping work sessions', () => {
  const intervals = mergeWorkIntervals([
    { startAt: '2026-07-22T07:00:00.000Z', endAt: '2026-07-22T10:00:00.000Z' },
    { startAt: '2026-07-22T09:00:00.000Z', endAt: '2026-07-22T11:00:00.000Z' },
  ])

  assert.equal(intervals.length, 1)
  assert.equal(workIntervalsTotalSeconds(intervals), 4 * 3600)
})

test('uses one canonical net-time calculation for separate sessions and recorded pauses', () => {
  const summary = summarizeWorkTimeRows([{
    workdayId: 'WD-SSOT-1',
    workIntervals: [
      { startAt: '2026-07-22T05:00:00.000Z', endAt: '2026-07-22T08:00:00.000Z' },
      { startAt: '2026-07-22T15:00:00.000Z', endAt: '2026-07-22T18:00:00.000Z' },
    ],
    pauseIntervals: [
      { startAt: '2026-07-22T06:00:00.000Z', endAt: '2026-07-22T06:30:00.000Z' },
      { startAt: '2026-07-22T16:00:00.000Z', endAt: '2026-07-22T16:15:00.000Z' },
    ],
  }])

  assert.equal(summary.grossSec, 6 * 3600)
  assert.equal(summary.pauseSec, 45 * 60)
  assert.equal(summary.netSec, 5 * 3600 + 15 * 60)
  assert.equal(summary.reviewRequired, false)
  assert.equal(summary.pauseSource, 'recorded-intervals')
})

test('keeps only the newest revision of one persisted work record', () => {
  const summary = summarizeWorkTimeRows([
    {
      eventId: 'EV-REVISION',
      startAt: '2026-07-22T07:00:00.000Z',
      endAt: '2026-07-22T09:00:00.000Z',
      updatedAt: '2026-07-22T09:05:00.000Z',
    },
    {
      eventId: 'EV-REVISION',
      startAt: '2026-07-22T07:00:00.000Z',
      endAt: '2026-07-22T10:00:00.000Z',
      updatedAt: '2026-07-22T10:05:00.000Z',
    },
  ])

  assert.equal(summary.grossSec, 3 * 3600)
  assert.equal(summary.netSec, 3 * 3600)
  assert.equal(summary.reviewRequired, false)
})

test('marks overlapping distinct work records for review and withholds net time', () => {
  const summary = summarizeWorkTimeRows([
    { eventId: 'EV-OVERLAP-1', startAt: '2026-07-22T07:00:00.000Z', endAt: '2026-07-22T10:00:00.000Z' },
    { eventId: 'EV-OVERLAP-2', startAt: '2026-07-22T09:00:00.000Z', endAt: '2026-07-22T11:00:00.000Z' },
  ])

  assert.equal(summary.grossSec, 4 * 3600)
  assert.equal(summary.netSec, null)
  assert.equal(summary.reviewRequired, true)
  assert.ok(summary.issues.some((issue) => issue.code === 'OVERLAPPING_WORK_INTERVALS'))
})

test('unions recorded pause intervals and does not multiply duplicate scalar pauses', () => {
  const intervalPauseSummary = summarizeWorkTimeRows([{
    workdayId: 'WD-PAUSE-1',
    startAt: '2026-07-22T08:00:00.000Z',
    endAt: '2026-07-22T12:00:00.000Z',
    pauseIntervals: [
      { startAt: '2026-07-22T09:00:00.000Z', endAt: '2026-07-22T10:00:00.000Z' },
      { startAt: '2026-07-22T09:30:00.000Z', endAt: '2026-07-22T10:30:00.000Z' },
    ],
  }])
  const scalarPauseSummary = summarizeWorkTimeRows([
    {
      workdayId: 'WD-PAUSE-2',
      startAt: '2026-07-22T08:00:00.000Z',
      endAt: '2026-07-22T12:00:00.000Z',
      breakSec: 10 * 60,
      updatedAt: '2026-07-22T12:01:00.000Z',
    },
    {
      workdayId: 'WD-PAUSE-2',
      startAt: '2026-07-22T08:00:00.000Z',
      endAt: '2026-07-22T12:00:00.000Z',
      breakSec: 30 * 60,
      updatedAt: '2026-07-22T12:02:00.000Z',
    },
  ])

  assert.equal(intervalPauseSummary.pauseSec, 90 * 60)
  assert.equal(intervalPauseSummary.netSec, 2 * 3600 + 30 * 60)
  assert.equal(scalarPauseSummary.pauseSec, 30 * 60)
  assert.equal(scalarPauseSummary.netSec, 3 * 3600 + 30 * 60)
})

test('requires review for malformed intervals and supports an explicitly open session', () => {
  const invalid = summarizeWorkTimeRows([
    { eventId: 'EV-BAD', startAt: '2026-07-22T10:00:00.000Z', endAt: '2026-07-22T09:00:00.000Z' },
  ])
  const open = summarizeWorkTimeRows([
    { eventId: 'EV-OPEN', startAt: '2026-07-22T15:00:00.000Z', status: 'RUNNING' },
  ], { allowOpen: true, nowMs: new Date('2026-07-22T18:00:00.000Z').getTime() })

  assert.equal(invalid.reviewRequired, true)
  assert.equal(invalid.netSec, null)
  assert.ok(invalid.issues.some((issue) => issue.code === 'INVALID_WORK_INTERVAL'))
  assert.equal(open.grossSec, 3 * 3600)
  assert.equal(open.netSec, 3 * 3600)
  assert.equal(open.hasOpenInterval, true)
})

test('adds only the active event time for an open workday', () => {
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

  assert.equal(result.durationSec, 6 * 3600)
  assert.deepEqual(workIntervalCodes(result.workIntervals).map((code) => code.type), ['START', 'STOP', 'START'])
})

test('uses exact event intervals in worker profile and evidence exports', async () => {
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
  assert.equal(evidenceRow.workSec, 6 * 3600)
  assert.equal(profileExportRow.durationSec, 6 * 3600)
})

test('carries a time-review requirement through both work-time exports', async () => {
  const getWorkdays = async () => ({
    items: [
      {
        eventId: 'EV-EXPORT-1',
        workdayId: 'WD-EXPORT',
        workerLogin: 'anna',
        workerName: 'Anna Testowa',
        startAt: '2026-07-22T07:00:00.000Z',
        endAt: '2026-07-22T10:00:00.000Z',
      },
      {
        eventId: 'EV-EXPORT-2',
        workdayId: 'WD-EXPORT',
        workerLogin: 'anna',
        workerName: 'Anna Testowa',
        startAt: '2026-07-22T09:00:00.000Z',
        endAt: '2026-07-22T11:00:00.000Z',
      },
    ],
  })
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

  for (const row of [evidenceRow, profileExportRow]) {
    assert.equal(row.reviewRequired, true)
    assert.equal(row.netSec, null)
    assert.equal(row.workSec ?? row.durationSec, 4 * 3600)
    assert.ok(row.reviewIssues.some((issue) => issue.code === 'OVERLAPPING_WORK_INTERVALS'))
  }
})
