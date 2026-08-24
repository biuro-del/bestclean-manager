'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const modelModule = import(
  '../web-app/apps/portal-web/src/features/workers/account/workdayReconciliationModel.js'
)
const serviceModule = import(
  '../web-app/apps/portal-web/src/services/workdayReconciliationTransport.js'
)

test('fallback zachowuje otwarta sesje i nie dolicza jej do potwierdzonego czasu', async () => {
  const { normalizeWorkdayReconciliation } = await modelModule
  const result = normalizeWorkdayReconciliation({}, {
    dayKey: '2026-07-23',
    integrityState: 'OPEN_SESSION',
    closedSessionsSec: (2 * 60 * 60) + (15 * 60) + (1 * 60 * 60) + (36 * 60),
    workIntervals: [
      { eventId: 'E1', startAt: '2026-07-23T12:47:00.000Z', endAt: '2026-07-23T15:02:00.000Z' },
      { eventId: 'E2', startAt: '2026-07-23T15:46:00.000Z', endAt: '2026-07-23T17:22:00.000Z' },
    ],
    openSessions: [
      { eventId: 'E3', startAt: '2026-07-23T17:42:00.000Z', endAt: null, isOpen: true },
    ],
    sourceRows: [{ workdayId: 'WD23', status: 'RUNNING' }],
  }, 'WD23')

  assert.equal(result.integrityState, 'OPEN_SESSION')
  assert.equal(result.confirmedSec, 13_860)
  assert.equal(result.provisionalSec, 0)
  assert.equal(result.openSessions.length, 1)
  assert.equal(result.sessions.length, 3)
  assert.equal(result.canFinalize, false)
})

test('zamkniety Workday z otwarta sesja ma stan INCONSISTENT', async () => {
  const { normalizeWorkdayReconciliation } = await modelModule
  const result = normalizeWorkdayReconciliation({}, {
    dayKey: '2026-07-23',
    workIntervals: [{ eventId: 'E3', startAt: '2026-07-23T17:42:00.000Z', isOpen: true }],
    sourceRows: [{ workdayId: 'WD23', status: 'CLOSED' }],
  }, 'WD23')

  assert.equal(result.integrityState, 'INCONSISTENT')
  assert.equal(result.canFinalize, false)
})

test('korekta STOP odblokowuje warunek otwartej sesji', async () => {
  const { normalizeWorkdayReconciliation, reconciliationHasBlockingProblems } = await modelModule
  const model = normalizeWorkdayReconciliation({
    integrityState: 'OPEN_SESSION',
    sessions: [{
      eventId: 'E3',
      startAt: '2026-07-23T17:42:00.000Z',
      isOpen: true,
      isValid: true,
      issues: [{ code: 'OPEN_SESSION', eventId: 'E3' }],
    }],
    issues: [
      { code: 'OPEN_SESSION', eventId: 'E3' },
      { code: 'CLOSED_WORKDAY_WITH_OPEN_SESSION' },
      { code: 'WORKDAY_DURATION_MISMATCH' },
    ],
  })

  assert.equal(reconciliationHasBlockingProblems(model, []), true)
  assert.equal(reconciliationHasBlockingProblems(model, [{
    eventId: 'E3',
    endAt: '2026-07-23T19:36:00.000Z',
  }]), false)
})

test('rozbieznosc sumy i niezfinalizowany Workday sa naprawiane przez finalizacje', async () => {
  const { normalizeWorkdayReconciliation, reconciliationHasBlockingProblems } = await modelModule
  const model = normalizeWorkdayReconciliation({
    integrityState: 'INCONSISTENT',
    sessions: [
      { eventId: 'E1', startAt: '2026-07-23T12:47:00.000Z', endAt: '2026-07-23T15:02:00.000Z' },
      { eventId: 'E2', startAt: '2026-07-23T15:46:00.000Z', endAt: '2026-07-23T17:22:00.000Z' },
    ],
    issues: [
      { code: 'WORKDAY_DURATION_MISMATCH' },
      { code: 'WORKDAY_NOT_CLOSED' },
    ],
  })

  assert.equal(reconciliationHasBlockingProblems(model, []), false)
})

test('dialog usuwa falszywy EMPTY_SESSION_SET i legacy blad wielu Workday, gdy dzien ma sesje', async () => {
  const { normalizeWorkdayReconciliation, reconciliationHasBlockingProblems } = await modelModule
  const model = normalizeWorkdayReconciliation({
    integrityState: 'INVALID',
    sessions: [
      { eventId: 'E1', startAt: '2026-07-20T14:47:03.000Z', endAt: '2026-07-20T16:54:54.000Z', durationSec: 2 * 3600 + 7 * 60 + 50 },
      { eventId: 'E2', startAt: '2026-07-20T17:16:09.000Z', endAt: '2026-07-20T18:29:30.000Z', durationSec: 1 * 3600 + 13 * 60 + 21 },
    ],
    issues: [
      'MULTIPLE_WORKDAYS_FOR_BUSINESS_DATE',
      { code: 'ISSUE_2', message: 'EMPTY_SESSION_SET' },
    ],
  })

  assert.deepEqual(model.issues, [])
  assert.equal(model.integrityState, 'COMPLETE')
  assert.equal(model.closedSessionsSec, 3 * 3600 + 21 * 60 + 11)
  assert.equal(reconciliationHasBlockingProblems(model, []), false)
})

test('odpowiedz API zachowuje fingerprint sesji i metadane lokalnego interwalu', async () => {
  const { normalizeWorkdayReconciliation } = await modelModule
  const sessionVersion = 'a'.repeat(64)
  const result = normalizeWorkdayReconciliation({
    sessionVersion,
    sessions: [{
      eventId: 'E1',
      startAt: '2026-07-23T12:48:00.000Z',
      endAt: '2026-07-23T15:02:00.000Z',
      status: 'CLOSED',
    }],
  }, {
    dayKey: '2026-07-23',
    workIntervals: [{
      eventId: 'E1',
      startAt: '2026-07-23T12:47:00.000Z',
      endAt: '2026-07-23T15:02:00.000Z',
      clientName: 'Nash Tackle Żory',
      zoneName: 'BC0759',
      latitude: 50.1,
      longitude: 18.6,
    }],
  })

  assert.equal(result.sessionVersion, sessionVersion)
  assert.equal(result.sessions[0].startAt, '2026-07-23T12:48:00.000Z')
  assert.equal(result.sessions[0].clientName, 'Nash Tackle Żory')
  assert.equal(result.sessions[0].zoneName, 'BC0759')
  assert.equal(result.sessions[0].latitude, 50.1)
})

test('odpowiedz jednego Workday nie ukrywa pozostalych par START-STOP zagregowanego dnia', async () => {
  const { normalizeWorkdayReconciliation } = await modelModule
  const result = normalizeWorkdayReconciliation({
    workdayId: 'WD-1',
    integrityState: 'COMPLETE',
    sessions: [{
      eventId: 'E1', workdayId: 'WD-1',
      startAt: '2026-08-01T06:00:00.000Z', endAt: '2026-08-01T07:00:00.000Z',
    }],
  }, {
    dayKey: '2026-08-01',
    sourceRows: [
      {
        workdayId: 'WD-1',
        workIntervals: [{ eventId: 'E1', workdayId: 'WD-1', startAt: '2026-08-01T06:00:00.000Z', endAt: '2026-08-01T07:00:00.000Z' }],
      },
      {
        workdayId: 'WD-2',
        workIntervals: [{ eventId: 'E2', workdayId: 'WD-2', startAt: '2026-08-01T08:30:00.000Z', endAt: '2026-08-01T10:00:00.000Z' }],
      },
    ],
  }, 'WD-1')

  assert.deepEqual(result.sessions.map((session) => session.eventId), ['E1', 'E2'])
  assert.equal(result.closedSessionsSec, 2 * 3600 + 30 * 60)
})

test('dokladne duplikaty Workday sa jedna sesja z zachowaniem identyfikatorow zrodlowych', async () => {
  const { normalizeWorkdayReconciliation } = await modelModule
  const result = normalizeWorkdayReconciliation({
    integrityState: 'INVALID',
    sessions: [
      {
        workdayId: 'WD-DUP-1', startAt: '2026-07-31T13:16:04.000Z', endAt: '2026-07-31T18:42:00.000Z',
        activities: [{ eventId: 'EV-DUP-1', workdayId: 'WD-DUP-1', startAt: '2026-07-31T14:00:00.000Z', endAt: '2026-07-31T15:00:00.000Z' }],
      },
      {
        workdayId: 'WD-DUP-2', startAt: '2026-07-31T13:16:04.000Z', endAt: '2026-07-31T18:42:00.000Z',
        activities: [{ eventId: 'EV-DUP-2', workdayId: 'WD-DUP-2', startAt: '2026-07-31T16:00:00.000Z', endAt: '2026-07-31T17:00:00.000Z' }],
      },
    ],
    issues: [{ code: 'OVERLAPPING_WORK_SESSIONS', message: 'Sesje pracy nakladaja sie na siebie.' }],
  })

  assert.equal(result.sessions.length, 1)
  assert.deepEqual(result.sessions[0].sourceWorkdayIds, ['WD-DUP-1', 'WD-DUP-2'])
  assert.deepEqual(result.sessions[0].activities.map((activity) => activity.eventId), ['EV-DUP-1', 'EV-DUP-2'])
  assert.equal(result.closedSessionsSec, 5 * 3600 + 25 * 60 + 56)
  assert.equal(result.collapsedDuplicateSessionCount, 1)
  assert.equal(result.integrityState, 'COMPLETE')
  assert.deepEqual(result.issues, [])
})

test('formatter UI zawsze pokazuje HH:MM:SS', async () => {
  const { formatReconciliationDuration } = await modelModule
  assert.equal(formatReconciliationDuration(50 * 60), '00:50:00')
  assert.equal(formatReconciliationDuration(5 * 60 * 60 + 45 * 60 + 6), '05:45:06')
})

test('formularz sesji uzywa strefy Europe/Warsaw niezaleznie od strefy przegladarki', async () => {
  const { isoToWarsawDateTimeInput, warsawDateTimeInputToIso } = await modelModule
  assert.equal(isoToWarsawDateTimeInput('2026-07-23T12:47:00.000Z'), '2026-07-23T14:47:00')
  assert.equal(warsawDateTimeInputToIso('2026-07-23T14:47:00'), '2026-07-23T12:47:00.000Z')
  assert.equal(warsawDateTimeInputToIso('2026-03-29T02:30:00'), '')
})

test('klient API rozpakowuje reconciliation i zachowuje schemaReady=false', async () => {
  const { unwrapWorkdayReconciliationResponse } = await serviceModule
  assert.deepEqual(
    unwrapWorkdayReconciliationResponse({
      ok: true,
      schemaReady: false,
      reconciliation: { workdayId: 'WD23', sessions: [] },
    }),
    { workdayId: 'WD23', sessions: [], schemaReady: false },
  )
  assert.deepEqual(
    unwrapWorkdayReconciliationResponse({
      ok: true,
      data: { reconciliation: { workdayId: 'WD31' } },
    }),
    { workdayId: 'WD31' },
  )
})
