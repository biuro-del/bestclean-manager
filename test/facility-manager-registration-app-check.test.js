const assert = require('node:assert/strict')
const test = require('node:test')

const { createFacilityManagerFirebaseAppCheckGate } = require('../facility-manager-registration-app-check')

test('App Check gate requires the exact allowed Firebase App ID', async () => {
  const gate = createFacilityManagerFirebaseAppCheckGate({
    allowedAppIds: ['1:1080573912983:web:d64286e3776c009788c6d2'],
    appCheck: {
      async verifyToken(token) {
        assert.equal(token, 'valid-token')
        return { appId: '1:1080573912983:web:d64286e3776c009788c6d2' }
      },
    },
  })
  assert.deepEqual(await gate.assertAllowed({ token: 'valid-token' }), {
    appId: '1:1080573912983:web:d64286e3776c009788c6d2',
  })
})

test('App Check gate rejects an app outside the registration allowlist', async () => {
  const gate = createFacilityManagerFirebaseAppCheckGate({
    allowedAppIds: ['1:allowed:web:one'],
    appCheck: { async verifyToken() { return { appId: '1:other:web:two' } } },
  })
  await assert.rejects(
    gate.assertAllowed({ token: 'valid-token' }),
    (error) => error.statusCode === 403 && error.publicCode === 'APP_CHECK_APP_NOT_ALLOWED',
  )
})
