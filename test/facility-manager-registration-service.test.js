const assert = require('node:assert/strict')
const test = require('node:test')

const {
  createFacilityManagerRegistrationService,
  normalizeVerifiedGoogleIdentity,
} = require('../facility-manager-registration-service')

const HMAC_KEY = 'facility-manager-test-hmac-key-at-least-32-bytes'

function googleToken(overrides = {}) {
  return {
    uid: 'firebase-uid',
    email: 'Owner@Example.test',
    email_verified: true,
    firebase: {
      sign_in_provider: 'google.com',
      identities: { 'google.com': ['google-subject-1'] },
    },
    ...overrides,
  }
}

test('service gives the command only a verified Google identity', async () => {
  let commandInput = null
  let provisioned = null
  const service = createFacilityManagerRegistrationService({
    hmacKey: HMAC_KEY,
    createCommand(input) {
      commandInput = input
      return { operationId: 'fmreg_test' }
    },
    createProvisioner({ pool }) {
      assert.equal(typeof pool.connect, 'function')
      return {
        async provisionFacilityManager(command) {
          provisioned = command
          return { organizationId: 'org_fm_test', createdNow: true }
        },
      }
    },
  })

  const client = { async query() {}, release() {} }
  const result = await service.register({
    client,
    decodedToken: googleToken(),
    payload: { idempotencyKey: 'fm_1234567890123456', organizationName: 'Panel zarządcy' },
  })

  assert.equal(result.organizationId, 'org_fm_test')
  assert.equal(commandInput.googleIdentity.uid, 'firebase-uid')
  assert.equal(commandInput.googleIdentity.email, 'owner@example.test')
  assert.equal(commandInput.googleIdentity.subject, 'google-subject-1')
  assert.equal(commandInput.googleIdentity.providerId, 'google.com')
  assert.equal(provisioned.operationId, 'fmreg_test')
})

test('unverified or non-Google token is rejected before provisioner', () => {
  assert.throws(
    () => normalizeVerifiedGoogleIdentity(googleToken({ email_verified: false })),
    (error) => error.publicCode === 'EMAIL_VERIFICATION_REQUIRED',
  )
  assert.throws(
    () => normalizeVerifiedGoogleIdentity(googleToken({ firebase: { sign_in_provider: 'password', identities: {} } })),
    (error) => error.publicCode === 'FACILITY_MANAGER_GOOGLE_IDENTITY_REQUIRED',
  )
})
