const assert = require('node:assert/strict')
const test = require('node:test')

const {
  createFacilityManagerRegistrationGate,
} = require('../facility-manager-registration-gate')

test('gate is fail-closed until explicitly enabled with both durable adapters', async () => {
  const gate = createFacilityManagerRegistrationGate({ enabled: true, appCheckGate: async () => true })
  await assert.rejects(gate.assertEnabled(), (error) => error.publicCode === 'FACILITY_MANAGER_REGISTRATION_UNAVAILABLE')
})

test('gate validates App Check and rate-limits only a verified subject', async () => {
  const calls = []
  const gate = createFacilityManagerRegistrationGate({
    enabled: true,
    appCheckGate: async ({ token }) => {
      calls.push(['app', token])
      return true
    },
    rateGate: async ({ channel, subject }) => {
      calls.push(['rate', channel, subject])
      return true
    },
  })

  await gate.assertAppCheck({ appCheckToken: 'valid-token' })
  await gate.assertAllowed({ uid: 'verified-firebase-uid' })

  assert.deepEqual(calls, [
    ['app', 'valid-token'],
    ['rate', 'FACILITY_MANAGER_GOOGLE', 'verified-firebase-uid'],
  ])
})

test('gate maps a durable rate denial to a public 429', async () => {
  const gate = createFacilityManagerRegistrationGate({
    enabled: true,
    appCheckGate: async () => true,
    rateGate: async () => ({ allowed: false }),
  })
  await assert.rejects(
    gate.assertAllowed({ uid: 'verified-firebase-uid' }),
    (error) => error.statusCode === 429 && error.publicCode === 'FACILITY_MANAGER_REGISTRATION_RATE_LIMITED',
  )
})
