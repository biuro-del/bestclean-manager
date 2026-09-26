'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  MOBILE_WORKER_ERROR,
  resolveAuthenticatedMobileWorker,
  resolveAuthoritativeMobileScanAt,
} = require('../mobile-workflow-security-policy')

function worker(overrides = {}) {
  return {
    login: 'worker.a',
    worker_id: 'WORKER-A',
    full_name: 'Worker A',
    login_email: 'worker.a@bestclean.pl',
    email: 'worker.a@bestclean.pl',
    auth_uid: 'firebase-uid-a',
    active: true,
    ...overrides,
  }
}

function assertPolicyCode(expectedCode, callback) {
  assert.throws(callback, (error) => {
    assert.equal(error.publicCode, expectedCode)
    assert.ok(Number.isInteger(error.statusCode))
    return true
  })
}

test('UID tokenu wybiera pracownika, a zgodne dane body tylko potwierdzaja tozsamosc', () => {
  const resolved = resolveAuthenticatedMobileWorker({
    rows: [
      worker(),
      worker({
        login: 'worker.b',
        worker_id: 'WORKER-B',
        login_email: 'worker.b@bestclean.pl',
        email: 'worker.b@bestclean.pl',
        auth_uid: 'firebase-uid-b',
      }),
    ],
    tokenUid: 'firebase-uid-a',
    tokenEmail: 'worker.a@bestclean.pl',
    membershipWorkerId: 'WORKER-A',
    requestedWorkerId: 'worker-a',
    requestedLogin: 'WORKER.A',
  })

  assert.equal(resolved.worker_id, 'WORKER-A')
  assert.equal(resolved.login, 'worker.a')
})
test('body nie moze podszyc sesji pod innego pracownika', () => {
  assertPolicyCode(MOBILE_WORKER_ERROR.CLAIM_MISMATCH, () =>
    resolveAuthenticatedMobileWorker({
      rows: [
        worker(),
        worker({
          login: 'worker.b',
          worker_id: 'WORKER-B',
          login_email: 'worker.b@bestclean.pl',
          email: 'worker.b@bestclean.pl',
          auth_uid: 'firebase-uid-b',
        }),
      ],
      tokenUid: 'firebase-uid-a',
      tokenEmail: 'worker.a@bestclean.pl',
      membershipWorkerId: 'WORKER-A',
      requestedWorkerId: 'WORKER-B',
      requestedLogin: 'worker.b',
    }),
  )
})

test('membership.worker_id moze rozwiazac profil bez auth_uid, ale nie deleguje do innego worker_id', () => {
  const resolved = resolveAuthenticatedMobileWorker({
    rows: [worker({ auth_uid: '', login_email: '', email: '' })],
    tokenUid: 'firebase-uid-a',
    membershipWorkerId: 'WORKER-A',
  })
  assert.equal(resolved.worker_id, 'WORKER-A')

  assertPolicyCode(MOBILE_WORKER_ERROR.MEMBERSHIP_CONFLICT, () =>
    resolveAuthenticatedMobileWorker({
      rows: [worker()],
      tokenUid: 'firebase-uid-a',
      membershipWorkerId: 'WORKER-OTHER',
    }),
  )
})

test('fallback po emailu wymaga dokladnego emaila tokenu', () => {
  const exact = resolveAuthenticatedMobileWorker({
    rows: [worker({ auth_uid: '' })],
    tokenUid: 'firebase-uid-a',
    tokenEmail: 'worker.a@bestclean.pl',
  })
  assert.equal(exact.login, 'worker.a')

  assertPolicyCode(MOBILE_WORKER_ERROR.NOT_FOUND, () =>
    resolveAuthenticatedMobileWorker({
      rows: [worker({ auth_uid: '', login_email: '', email: '' })],
      tokenUid: 'firebase-uid-a',
      tokenEmail: 'worker.a@bestclean.pl',
    }),
  )
})

test('sprzeczny auth_uid profilu jest odrzucany stabilnym kodem', () => {
  assertPolicyCode(MOBILE_WORKER_ERROR.AUTH_UID_CONFLICT, () =>
    resolveAuthenticatedMobileWorker({
      rows: [worker({ auth_uid: 'firebase-uid-b' })],
      tokenUid: 'firebase-uid-a',
      membershipWorkerId: 'WORKER-A',
    }),
  )
})

test('niejednoznaczny auth_uid jest odrzucany zamiast wyboru pierwszego wiersza', () => {
  assertPolicyCode(MOBILE_WORKER_ERROR.AUTH_UID_AMBIGUOUS, () =>
    resolveAuthenticatedMobileWorker({
      rows: [
        worker(),
        worker({
          login: 'worker.copy',
          worker_id: 'WORKER-COPY',
          login_email: 'worker.copy@bestclean.pl',
          email: 'worker.copy@bestclean.pl',
        }),
      ],
      tokenUid: 'firebase-uid-a',
    }),
  )
})

test('brak UID w zweryfikowanym kontekście ma stabilny blad', () => {
  assertPolicyCode(MOBILE_WORKER_ERROR.AUTH_UID_MISSING, () =>
    resolveAuthenticatedMobileWorker({
      rows: [worker()],
      tokenUid: '',
      tokenEmail: 'worker.a@bestclean.pl',
    }),
  )
})

test('online zawsze uzywa czasu serwera niezaleznie od czasu klienta', () => {
  const serverNow = new Date('2026-07-23T10:15:30.000Z')

  for (const clientScannedAt of [
    '1999-01-01T00:00:00.000Z',
    '2099-12-31T23:59:59.999Z',
    'not-a-date',
  ]) {
    const resolved = resolveAuthoritativeMobileScanAt({
      serverNow,
      clientOccurredAt: clientScannedAt,
    })
    assert.equal(resolved.toISOString(), serverNow.toISOString())
    assert.notEqual(resolved, serverNow)
  }
})

test('offline akceptuje czas klienta tylko w ograniczonym oknie siedmiu dni', () => {
  const serverNow = new Date('2026-09-26T10:00:00.000Z')
  assert.equal(
    resolveAuthoritativeMobileScanAt({
      serverNow,
      offline: true,
      clientOccurredAt: '2026-09-26T08:30:00.000Z',
    }).toISOString(),
    '2026-09-26T08:30:00.000Z',
  )
  assertPolicyCode(MOBILE_WORKER_ERROR.OFFLINE_TIME_INVALID, () =>
    resolveAuthoritativeMobileScanAt({ serverNow, offline: true, clientOccurredAt: 'invalid' }),
  )
  assertPolicyCode(MOBILE_WORKER_ERROR.OFFLINE_TIME_TOO_OLD, () =>
    resolveAuthoritativeMobileScanAt({
      serverNow,
      offline: true,
      clientOccurredAt: '2026-09-18T09:59:59.000Z',
    }),
  )
  assertPolicyCode(MOBILE_WORKER_ERROR.OFFLINE_TIME_IN_FUTURE, () =>
    resolveAuthoritativeMobileScanAt({
      serverNow,
      offline: true,
      clientOccurredAt: '2026-09-26T10:05:01.000Z',
    }),
  )
})
