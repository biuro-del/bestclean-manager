'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { buildFirebaseRestDecodedToken } = require('../firebase-rest-token-policy')

const PROJECT_ID = 'iclean-room'

function tokenFor(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(payload)}.verified-by-identity-toolkit`
}

function validPayload(overrides = {}) {
  return {
    aud: PROJECT_ID,
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    sub: 'platform-uid',
    user_id: 'platform-uid',
    email: 'cleanzi@admin.com',
    email_verified: true,
    platformRole: 'PLATFORM_OWNER',
    auth_time: 1_721_200_000,
    firebase: { sign_in_second_factor: 'totp' },
    ...overrides,
  }
}

test('REST fallback preserves verified platform and MFA claims', () => {
  const decoded = buildFirebaseRestDecodedToken({
    token: tokenFor(validPayload()),
    lookupUser: {
      localId: 'platform-uid',
      email: 'Cleanzi@Admin.com',
      emailVerified: true,
      displayName: 'Cleanzi Platform Owner',
    },
    projectId: PROJECT_ID,
  })

  assert.equal(decoded.uid, 'platform-uid')
  assert.equal(decoded.email, 'cleanzi@admin.com')
  assert.equal(decoded.email_verified, true)
  assert.equal(decoded.platformRole, 'PLATFORM_OWNER')
  assert.equal(decoded.firebase.sign_in_second_factor, 'totp')
})

test('REST fallback rejects a token whose UID differs from lookup response', () => {
  assert.throws(
    () => buildFirebaseRestDecodedToken({
      token: tokenFor(validPayload({ sub: 'attacker', user_id: 'attacker' })),
      lookupUser: { localId: 'platform-uid', email: 'cleanzi@admin.com', emailVerified: true },
      projectId: PROJECT_ID,
    }),
    /INVALID_ID_TOKEN/,
  )
})

test('REST fallback rejects a token for another Firebase project', () => {
  assert.throws(
    () => buildFirebaseRestDecodedToken({
      token: tokenFor(validPayload({ aud: 'other-project' })),
      lookupUser: { localId: 'platform-uid', email: 'cleanzi@admin.com', emailVerified: true },
      projectId: PROJECT_ID,
    }),
    /INVALID_ID_TOKEN/,
  )
})

test('REST fallback rejects mismatched account email', () => {
  assert.throws(
    () => buildFirebaseRestDecodedToken({
      token: tokenFor(validPayload()),
      lookupUser: { localId: 'platform-uid', email: 'different@example.com', emailVerified: true },
      projectId: PROJECT_ID,
    }),
    /INVALID_ID_TOKEN/,
  )
})
