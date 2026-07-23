import assert from 'node:assert/strict'
import test from 'node:test'

import {
  enrichWorkdaysWithEventIntervals,
  mergeWorkIntervals,
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
