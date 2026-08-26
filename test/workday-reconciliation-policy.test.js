'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  WORKDAY_INTEGRITY_STATE,
  buildWorkdayReconciliation,
  normalizeReconciliationInput,
  warsawBusinessDateYmd,
} = require('../workday-reconciliation-policy')

const NOW = new Date('2026-08-03T10:00:00.000Z')

function july23Workday(overrides = {}) {
  return {
    org_id: 'ORG-1',
    workday_id: 'WD-23',
    worker_login: 'W034',
    worker_name: 'Malgorzata Piprek',
    start_at: '2026-07-23T11:51:00.000Z',
    end_at: '2026-07-23T19:36:00.000Z',
    duration_sec: 208 * 3600 + 51 * 60,
    status: 'CLOSED',
    updated_at: '2026-07-23T20:00:00.000Z',
    ...overrides,
  }
}

function july23Sessions(lastEndAt = null) {
  return [
    { event_id: 'E-1', workday_id: 'WD-23', start_at: '2026-07-23T12:47:00.000Z', end_at: '2026-07-23T15:02:00.000Z' },
    { event_id: 'E-2', workday_id: 'WD-23', start_at: '2026-07-23T15:46:00.000Z', end_at: '2026-07-23T17:22:00.000Z' },
    { event_id: 'E-3', workday_id: 'WD-23', start_at: '2026-07-23T17:42:00.000Z', end_at: lastEndAt },
  ]
}

test('regresja 23.07 nie dolicza Date.now do otwartej sesji i zwraca 03:51 roboczo', () => {
  const first = buildWorkdayReconciliation({
    workday: july23Workday(),
    sessions: july23Sessions(),
    now: NOW,
  })
  const later = buildWorkdayReconciliation({
    workday: july23Workday(),
    sessions: july23Sessions(),
    now: new Date('2026-08-10T18:00:00.000Z'),
  })

  assert.equal(first.closedSessionsSec, 3 * 3600 + 51 * 60)
  assert.equal(first.provisionalSec, 3 * 3600 + 51 * 60)
  assert.equal(first.confirmedSec, 0)
  assert.equal(first.activeElapsedSec, 0)
  assert.equal(first.integrityState, WORKDAY_INTEGRITY_STATE.INCONSISTENT)
  assert.equal(first.openSessions.length, 1)
  assert.equal(first.openSessions[0].eventId, 'E-3')
  assert.equal(first.closedSessionsSec, later.closedSessionsSec)
  assert.ok(first.issues.some((entry) => entry.code === 'CLOSED_WORKDAY_WITH_OPEN_SESSION'))
})

test('uzupelnienie STOP 21:36 daje 05:45 i kompletny dzien', () => {
  const result = buildWorkdayReconciliation({
    workday: july23Workday({ duration_sec: 5 * 3600 + 45 * 60 }),
    sessions: july23Sessions('2026-07-23T19:36:00.000Z'),
    now: NOW,
  })

  assert.equal(result.closedSessionsSec, 5 * 3600 + 45 * 60)
  assert.equal(result.confirmedSec, 5 * 3600 + 45 * 60)
  assert.equal(result.provisionalSec, 0)
  assert.equal(result.integrityState, WORKDAY_INTEGRITY_STATE.COMPLETE)
  assert.equal(result.canFinalize, true)
})

test('wiele Workday tej samej daty jest dozwolone i nie zmienia sumy par START-STOP', () => {
  const result = buildWorkdayReconciliation({
    workday: july23Workday({ duration_sec: 5 * 3600 + 45 * 60 }),
    sessions: july23Sessions('2026-07-23T19:36:00.000Z'),
    businessDateWorkdayIds: ['WD-23', 'WD-23-B'],
    now: NOW,
  })

  assert.deepEqual(result.businessDateWorkdayIds, ['WD-23', 'WD-23-B'])
  assert.equal(result.closedSessionsSec, 5 * 3600 + 45 * 60)
  assert.equal(result.integrityState, WORKDAY_INTEGRITY_STATE.COMPLETE)
  assert.equal(result.canFinalize, true)
  assert.equal(result.issues.some((entry) => entry.code === 'MULTIPLE_WORKDAYS_FOR_BUSINESS_DATE'), false)
})

test('nakladajace sie sesje sa INVALID, ale podglad liczy unie zamiast zawyzac czas', () => {
  const result = buildWorkdayReconciliation({
    workday: {
      ...july23Workday(),
      duration_sec: 3 * 3600,
      start_at: '2026-07-23T08:00:00.000Z',
      end_at: '2026-07-23T11:00:00.000Z',
    },
    sessions: [
      { event_id: 'E-1', start_at: '2026-07-23T08:00:00.000Z', end_at: '2026-07-23T10:00:00.000Z' },
      { event_id: 'E-2', start_at: '2026-07-23T09:00:00.000Z', end_at: '2026-07-23T11:00:00.000Z' },
    ],
    now: NOW,
  })

  assert.equal(result.closedSessionsSec, 3 * 3600)
  assert.equal(result.integrityState, WORKDAY_INTEGRITY_STATE.INVALID)
  assert.equal(result.canFinalize, false)
  assert.ok(result.issues.some((entry) => entry.code === 'SESSION_OVERLAP'))
})

test('zerowa, przyszla i dluzsza niz 24h sesja nie moze zostac sfinalizowana', () => {
  const fixtures = [
    { event_id: 'ZERO', start_at: '2026-07-23T08:00:00Z', end_at: '2026-07-23T08:00:00Z' },
    { event_id: 'FUTURE', start_at: '2026-08-04T08:00:00Z', end_at: '2026-08-04T09:00:00Z' },
    { event_id: 'LONG', start_at: '2026-07-23T08:00:00Z', end_at: '2026-07-24T08:00:01Z' },
  ]
  for (const session of fixtures) {
    const result = buildWorkdayReconciliation({
      workday: july23Workday({ duration_sec: 0 }),
      sessions: [session],
      now: NOW,
    })
    assert.equal(result.integrityState, WORKDAY_INTEGRITY_STATE.INVALID)
    assert.equal(result.canFinalize, false)
  }
})

test('Europe/Warsaw wyznacza dzien biznesowy niezaleznie od strefy procesu i uwzglednia DST', () => {
  assert.equal(warsawBusinessDateYmd('2026-03-28T23:30:00.000Z'), '2026-03-29')
  const result = buildWorkdayReconciliation({
    workday: {
      org_id: 'ORG-1', workday_id: 'DST', worker_login: 'W1', status: 'CLOSED',
      start_at: '2026-03-29T00:30:00.000Z', end_at: '2026-03-29T02:30:00.000Z',
      duration_sec: 7200, updated_at: '2026-03-29T03:00:00.000Z',
    },
    sessions: [{ event_id: 'DST-1', start_at: '2026-03-29T00:30:00.000Z', end_at: '2026-03-29T02:30:00.000Z' }],
    now: NOW,
  })
  assert.equal(result.businessDateYmd, '2026-03-29')
  assert.equal(result.closedSessionsSec, 7200)
  assert.equal(result.integrityState, WORKDAY_INTEGRITY_STATE.COMPLETE)
})

test('sesja innego pracownika jest INVALID nawet przy poprawnych godzinach', () => {
  const result = buildWorkdayReconciliation({
    workday: july23Workday({ duration_sec: 3 * 3600 }),
    sessions: [{
      event_id: 'WRONG-SCOPE',
      worker_login: 'W999',
      start_at: '2026-07-23T10:00:00.000Z',
      end_at: '2026-07-23T13:00:00.000Z',
    }],
    now: NOW,
  })

  assert.equal(result.integrityState, WORKDAY_INTEGRITY_STATE.INVALID)
  assert.equal(result.canFinalize, false)
  assert.ok(result.issues.some((entry) => entry.code === 'SESSION_WORKER_MISMATCH'))
})

test('payload korekty wymaga wersji, powodu, idempotencji i czasu ISO ze strefa', () => {
  const valid = normalizeReconciliationInput({
    expectedUpdatedAt: '2026-07-23T20:00:00.000Z',
    expectedSessionVersion: 'a'.repeat(64),
    idempotencyKey: 'repair-WD-23-1',
    reason: 'Brakujacy STOP potwierdzony przez administratora',
    sessionCorrections: [{ eventId: 'E-3', endAt: '2026-07-23T19:36:00+00:00' }],
    finalize: true,
  })
  assert.equal(valid.sessionCorrections[0].endAt, '2026-07-23T19:36:00.000Z')
  assert.equal(valid.finalize, true)

  assert.throws(
    () => normalizeReconciliationInput({
      expectedUpdatedAt: '2026-07-23 20:00',
      expectedSessionVersion: 'a'.repeat(64),
      idempotencyKey: 'repair-WD-23-2',
      reason: 'Korekta',
      finalize: true,
    }),
    (error) => error.code === 'WORKDAY_TIMESTAMP_INVALID',
  )
  assert.throws(
    () => normalizeReconciliationInput({
      expectedUpdatedAt: '2026-07-23T20:00:00Z',
      expectedSessionVersion: 'a'.repeat(64),
      idempotencyKey: 'repair-WD-23-3',
      reason: 'Korekta',
      sessionCorrections: [{ eventId: 'E-3', endAt: '2026-07-23T19:36:00Z' }, { eventId: 'E-3', comment: 'x' }],
    }),
    (error) => error.code === 'WORKDAY_DUPLICATE_SESSION_CORRECTION',
  )
  for (const businessDateYmd of ['2026-07-23garbage', '2026-02-31']) {
    assert.throws(
      () => normalizeReconciliationInput({
        expectedUpdatedAt: '2026-07-23T20:00:00Z',
        expectedSessionVersion: 'a'.repeat(64),
        idempotencyKey: `repair-invalid-date-${businessDateYmd}`,
        reason: 'Korekta daty',
        businessDateYmd,
      }),
      (error) => error.code === 'WORKDAY_BUSINESS_DATE_INVALID',
    )
  }
})

test('workdayEndAt bez finalizacji jest odrzucany stabilnym bledem 400', () => {
  assert.throws(
    () => normalizeReconciliationInput({
      expectedUpdatedAt: '2026-07-23T20:00:00Z',
      expectedSessionVersion: 'a'.repeat(64),
      idempotencyKey: 'repair-end-without-finalize',
      reason: 'Proba ustawienia konca bez finalizacji',
      workdayEndAt: '2026-07-23T19:36:00Z',
      finalize: false,
    }),
    (error) =>
      error.statusCode === 400 &&
      error.code === 'WORKDAY_END_REQUIRES_FINALIZE',
  )
})
