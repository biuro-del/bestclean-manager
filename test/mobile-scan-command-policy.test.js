'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const {
  assertMobileScanReplayFingerprint,
  fingerprintMobileScanRequest,
} = require('../mobile-scan-command-policy')

test('fingerprint jest stabilny dla tej samej tresci niezaleznie od kolejnosci kluczy', () => {
  const left = fingerprintMobileScanRequest({
    orgId: 'bestclean', qrCode: 'START01', offline: true,
    gpsData: { lon: 18.1, lat: 50.2 },
  })
  const right = fingerprintMobileScanRequest({
    gpsData: { lat: 50.2, lon: 18.1 }, offline: true,
    qrCode: 'START01', orgId: 'bestclean',
  })
  assert.equal(left, right)
  assert.match(left, /^[a-f0-9]{64}$/)
})

test('ten sam clientActionId z innym payloadem musi byc odrzucony', () => {
  const stored = fingerprintMobileScanRequest({ qrCode: 'START01' })
  const changed = fingerprintMobileScanRequest({ qrCode: 'STOP01' })
  assert.doesNotThrow(() => assertMobileScanReplayFingerprint(stored, stored))
  assert.throws(
    () => assertMobileScanReplayFingerprint(stored, changed),
    (error) => error.statusCode === 409 && error.publicCode === 'MOBILE_SCAN_IDEMPOTENCY_CONFLICT',
  )
  assert.throws(
    () => assertMobileScanReplayFingerprint(null, stored),
    (error) => error.statusCode === 409,
  )
})
