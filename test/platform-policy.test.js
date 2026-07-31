'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  PLATFORM_ROLE,
  hasFreshAuthentication,
  hasPlatformOwnerClaim,
  hasSecondFactor,
  isAllowedPlatformOperation,
  sanitizeAuditValue,
  sanitizeTenantMutationVariables,
} = require('../platform-policy')

test('platform access requires the exact PLATFORM_OWNER claim', () => {
  assert.equal(hasPlatformOwnerClaim({ platformRole: PLATFORM_ROLE }), true)
  assert.equal(hasPlatformOwnerClaim({ platformRole: 'OWNER' }), false)
  assert.equal(hasPlatformOwnerClaim({}), false)
})

test('MFA and fresh auth are derived from the verified token', () => {
  const token = {
    auth_time: 1_000,
    firebase: { sign_in_second_factor: 'totp' },
  }
  assert.equal(hasSecondFactor(token), true)
  assert.equal(hasFreshAuthentication(token, 1_299), true)
  assert.equal(hasFreshAuthentication(token, 1_301), false)
})

test('gateway accepts only named operations from the allowlist', () => {
  assert.equal(isAllowedPlatformOperation('query', 'WorkersForOrg'), true)
  assert.equal(isAllowedPlatformOperation('mutation', 'DeleteClientForOrg'), true)
  assert.equal(isAllowedPlatformOperation('mutation', 'ArbitraryGraphql'), false)
  assert.equal(isAllowedPlatformOperation('graphql', 'WorkersForOrg'), false)
})

test('audit payload removes secrets recursively', () => {
  assert.deepEqual(sanitizeAuditValue({ email: 'a@example.com', password: 'secret', nested: { idToken: 'x' } }), {
    email: 'a@example.com',
    password: '[REDACTED]',
    nested: { idToken: '[REDACTED]' },
  })
})

test('tenant author fields never receive the platform identity', () => {
  assert.deepEqual(
    sanitizeTenantMutationVariables({ orgId: 'org1', updatedBy: 'admin@example.com', editedBy: 'uid', name: 'Test' }),
    { orgId: 'org1', updatedBy: null, editedBy: null, name: 'Test' },
  )
})
