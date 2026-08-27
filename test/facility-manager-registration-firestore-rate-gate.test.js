const assert = require('node:assert/strict')
const test = require('node:test')

const {
  createFacilityManagerFirestoreRateGate,
  deriveSubjectRateKey,
} = require('../facility-manager-registration-firestore-rate-gate')

const HMAC_KEY = 'facility-manager-test-hmac-key-at-least-32-bytes'

test('rate key is a domain-separated pseudonym, not the Firebase UID', () => {
  const key = deriveSubjectRateKey(HMAC_KEY, 'firebase-uid-123')
  assert.notEqual(key, 'firebase-uid-123')
  assert.match(key, /^[A-Za-z0-9_-]{43}$/)
  assert.notEqual(key, deriveSubjectRateKey(`${HMAC_KEY}x`, 'firebase-uid-123'))
})

test('rate adapter gives the isolated Firestore guard only the pseudonymous key', async () => {
  let options = null
  let input = null
  const gate = createFacilityManagerFirestoreRateGate({
    hmacKey: HMAC_KEY,
    getFirestore: () => ({ opaque: true }),
    createAbuseGuard(received) {
      options = received
      return { async assertAllowed(value) { input = value } }
    },
  })

  await gate.assertAllowed({ channel: 'FACILITY_MANAGER_GOOGLE', subject: 'firebase-uid-123' })

  assert.equal(options.collectionName, 'cleanziFacilityManagerRegistrationAbuseCounters')
  assert.equal(options.maxAttemptsPerRegistration, 5)
  assert.equal(input.channel, 'FACILITY_MANAGER_GOOGLE')
  assert.equal(input.registrationId, input.emailHmac)
  assert.notEqual(input.registrationId, 'firebase-uid-123')
})
