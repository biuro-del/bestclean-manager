'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  challengeHash,
  maskEmail,
  normalizeEmail,
  resolveChallengeDestination,
  sessionTokenHash,
} = require('../platform-email-mfa')
const { hasFreshPlatformAuthentication } = require('../platform-repository')

const SECRET = 'test-secret-with-at-least-32-characters'

test('email MFA accepts valid addresses and masks the destination', () => {
  assert.equal(normalizeEmail(' Admin.Example+MFA@Gmail.com '), 'admin.example+mfa@gmail.com')
  assert.equal(normalizeEmail('not-an-email'), '')
  assert.equal(maskEmail('admin@example.com'), 'ad***@example.com')
})

test('temporary custom recipient must be present on the backend allowlist', () => {
  const previousMode = process.env.PLATFORM_EMAIL_MFA_RECIPIENT_MODE
  const previousAllowed = process.env.PLATFORM_EMAIL_MFA_ALLOWED_RECIPIENTS
  process.env.PLATFORM_EMAIL_MFA_RECIPIENT_MODE = 'custom'
  process.env.PLATFORM_EMAIL_MFA_ALLOWED_RECIPIENTS = 'backup@example.com,second@example.com'
  try {
    assert.equal(resolveChallengeDestination({ email: 'firebase@example.com' }, 'BACKUP@example.com'), 'backup@example.com')
    assert.throws(
      () => resolveChallengeDestination({ email: 'firebase@example.com' }, 'attacker@example.com'),
      /PLATFORM_EMAIL_RECIPIENT_NOT_ALLOWED/,
    )
  } finally {
    if (previousMode === undefined) delete process.env.PLATFORM_EMAIL_MFA_RECIPIENT_MODE
    else process.env.PLATFORM_EMAIL_MFA_RECIPIENT_MODE = previousMode
    if (previousAllowed === undefined) delete process.env.PLATFORM_EMAIL_MFA_ALLOWED_RECIPIENTS
    else process.env.PLATFORM_EMAIL_MFA_ALLOWED_RECIPIENTS = previousAllowed
  }
})

test('firebase recipient mode ignores the temporary input address', () => {
  const previousMode = process.env.PLATFORM_EMAIL_MFA_RECIPIENT_MODE
  process.env.PLATFORM_EMAIL_MFA_RECIPIENT_MODE = 'firebase'
  try {
    assert.equal(resolveChallengeDestination({ email: 'firebase@example.com' }, 'other@example.com'), 'firebase@example.com')
  } finally {
    if (previousMode === undefined) delete process.env.PLATFORM_EMAIL_MFA_RECIPIENT_MODE
    else process.env.PLATFORM_EMAIL_MFA_RECIPIENT_MODE = previousMode
  }
})

test('email MFA code hash is bound to UID and challenge', () => {
  const base = challengeHash({ uid: 'uid-1', challengeId: 'challenge-1', code: '123456', secret: SECRET })
  assert.equal(base.length, 64)
  assert.notEqual(base, challengeHash({ uid: 'uid-2', challengeId: 'challenge-1', code: '123456', secret: SECRET }))
  assert.notEqual(base, challengeHash({ uid: 'uid-1', challengeId: 'challenge-2', code: '123456', secret: SECRET }))
  assert.notEqual(base, challengeHash({ uid: 'uid-1', challengeId: 'challenge-1', code: '654321', secret: SECRET }))
})

test('email MFA session stores only a one-way token hash', () => {
  const token = 'long-random-email-mfa-session-token'
  const hash = sessionTokenHash(token)
  assert.equal(hash.length, 64)
  assert.equal(hash.includes(token), false)
})

test('email MFA is fresh for five minutes and Firebase MFA keeps its existing policy', () => {
  const verifiedAt = new Date('2026-07-17T12:00:00.000Z')
  const emailPrincipal = { mfaMethod: 'email', mfaVerifiedAt: verifiedAt }
  assert.equal(hasFreshPlatformAuthentication({}, emailPrincipal, verifiedAt.getTime() + 299_000), true)
  assert.equal(hasFreshPlatformAuthentication({}, emailPrincipal, verifiedAt.getTime() + 301_000), false)

  const firebaseToken = { auth_time: 1_000, firebase: { sign_in_second_factor: 'totp' } }
  assert.equal(hasFreshPlatformAuthentication(firebaseToken, {}, 1_299_000), true)
  assert.equal(hasFreshPlatformAuthentication(firebaseToken, {}, 1_301_000), false)
})
