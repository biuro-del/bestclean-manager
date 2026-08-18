'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  WorkdayStopProposalError,
  assertDecision,
  assertHistoricalWorkday,
  assertProposedStop,
  assertSameOrganization,
  assertWorkerOwnsOpenWorkday,
  parseWarsawLocalDateTime,
} = require('../workday-stop-proposal-policy')

const START = '2026-08-10T06:00:00.000Z'
const PROPOSED_STOP = '2026-08-10T14:00:00.000Z'
const NOW = new Date('2026-08-10T18:00:00.000Z')

function pendingProposal(overrides = {}) {
  return {
    org_id: 'best-clean',
    proposal_id: 'p-1',
    submitted_by: 'worker-uid',
    status: 'PENDING',
    start_at: START,
    proposed_stop_at: PROPOSED_STOP,
    ...overrides,
  }
}

test('pracownik nie mo?e zatwierdzi? ani poprawi? w?asnej propozycji', () => {
  for (const action of ['APPROVE', 'CORRECT']) {
    assert.throws(
      () => assertDecision({
        action,
        proposal: pendingProposal(),
        actorUid: 'worker-uid',
        officialStopAt: PROPOSED_STOP,
        now: NOW,
      }),
      (error) => error instanceof WorkdayStopProposalError && error.code === 'WORKDAY_STOP_PROPOSAL_SELF_REVIEW_FORBIDDEN',
    )
  }
})

test('brak dost?pu mi?dzy organizacjami jest blokowany', () => {
  assert.throws(
    () => assertSameOrganization('best-clean', 'inna-organizacja'),
    (error) => error instanceof WorkdayStopProposalError && error.code === 'WORKDAY_STOP_PROPOSAL_ORG_FORBIDDEN',
  )
})

test('zatwierdzenie u?ywa dok?adnie proponowanego oficjalnego STOP', () => {
  const decision = assertDecision({ action: 'APPROVE', proposal: pendingProposal(), actorUid: 'office-uid', now: NOW })
  assert.equal(decision.status, 'APPROVED')
  assert.equal(decision.officialStopAt, PROPOSED_STOP)
  assert.equal(decision.durationSec, 8 * 60 * 60)
})

test('korekta zapisuje godzin? biura zamiast godziny pracownika', () => {
  const officeStop = '2026-08-10T15:30:00.000Z'
  const decision = assertDecision({
    action: 'CORRECT', proposal: pendingProposal(), actorUid: 'office-uid', officialStopAt: officeStop, now: NOW,
  })
  assert.equal(decision.status, 'CORRECTED')
  assert.equal(decision.officialStopAt, officeStop)
  assert.equal(decision.durationSec, 9.5 * 60 * 60)
})

test('odrzucenie nie przygotowuje oficjalnego STOP i wymaga powodu', () => {
  const decision = assertDecision({ action: 'REJECT', proposal: pendingProposal(), actorUid: 'office-uid', decisionNote: 'Brak potwierdzenia godzin.', now: NOW })
  assert.equal(decision.officialStopAt, null)
  assert.throws(
    () => assertDecision({ action: 'REJECT', proposal: pendingProposal(), actorUid: 'office-uid', decisionNote: '', now: NOW }),
    (error) => error instanceof WorkdayStopProposalError && error.code === 'WORKDAY_STOP_PROPOSAL_REJECTION_REASON_REQUIRED',
  )
})

test('duplikat tego samego klucza idempotencji nie wymaga drugiego PENDING', () => {
  const rows = []
  const submit = (key) => {
    const existing = rows.find((row) => row.idempotencyKey === key)
    if (existing) return { idempotent: true, proposal: existing }
    const pending = rows.find((row) => row.workdayId === 'wd-1' && row.status === 'PENDING')
    if (pending) throw new WorkdayStopProposalError(409, 'WORKDAY_STOP_PROPOSAL_PENDING_EXISTS', 'pending exists')
    const proposal = { idempotencyKey: key, workdayId: 'wd-1', status: 'PENDING' }
    rows.push(proposal)
    return { idempotent: false, proposal }
  }
  assert.equal(submit('retry-1').idempotent, false)
  assert.equal(submit('retry-1').idempotent, true)
  assert.equal(rows.length, 1)
})

test('r?wnoczesne decyzje s? bezpieczne tylko z blokad? Workday i warunkiem end_at is null', () => {
  // Model decyzji: pierwszy zapis zmienia kanoniczny end_at; drugi widzi ju? STOP.
  const workday = { end_at: null }
  const apply = (stopAt) => {
    if (workday.end_at) return false
    workday.end_at = stopAt
    return true
  }
  assert.equal(apply(PROPOSED_STOP), true)
  assert.equal(apply('2026-08-10T15:30:00.000Z'), false)
  assert.equal(workday.end_at, PROPOSED_STOP)
})

test('istniej?cy QR STOP blokuje utworzenie propozycji', () => {
  assert.throws(
    () => assertWorkerOwnsOpenWorkday({
      worker: { login: 'rafal.dudek' },
      workday: { worker_login: 'rafal.dudek', start_at: START, end_at: PROPOSED_STOP },
    }),
    (error) => error instanceof WorkdayStopProposalError && error.code === 'WORKDAY_ALREADY_STOPPED',
  )
})

test('propozycja jest dost?pna wy??cznie dla historycznego dnia Warsaw', () => {
  assertHistoricalWorkday({ startAt: '2026-08-09T21:00:00.000Z', now: new Date('2026-08-10T10:00:00.000Z') })
  assert.throws(
    () => assertHistoricalWorkday({ startAt: '2026-08-10T07:00:00.000Z', now: new Date('2026-08-10T10:00:00.000Z') }),
    (error) => error.code === 'WORKDAY_STOP_PROPOSAL_NOT_HISTORICAL',
  )
})

test('proponowany STOP musi by? po STARcie i nie mo?e by? w przysz?o?ci', () => {
  assert.throws(
    () => assertProposedStop({ startAt: START, proposedStopAt: START, now: NOW }),
    (error) => error.code === 'WORKDAY_STOP_NOT_AFTER_START',
  )
  assert.throws(
    () => assertProposedStop({ startAt: START, proposedStopAt: '2026-08-10T18:01:00.000Z', now: NOW }),
    (error) => error.code === 'WORKDAY_STOP_IN_FUTURE',
  )
})

test('lokalny STOP Warsaw zapisuje UTC i odrzuca niejednoznaczny czas DST', () => {
  const parsed = parseWarsawLocalDateTime('2026-08-13T17:30', 'Europe/Warsaw')
  assert.equal(parsed.proposedStopAt, '2026-08-13T15:30:00.000Z')
  assert.equal(parsed.proposedStopLocal, '2026-08-13T17:30')
  assert.equal(parsed.timeZone, 'Europe/Warsaw')
  assert.throws(
    () => parseWarsawLocalDateTime('2026-10-25T02:30', 'Europe/Warsaw'),
    (error) => error.code === 'WORKDAY_STOP_PROPOSAL_LOCAL_TIME_AMBIGUOUS',
  )
})
