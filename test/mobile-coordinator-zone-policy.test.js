'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  isMobileCoordinatorZoneOrganizationAllowed,
  resolveMobileCoordinatorZonePolicy,
} = require('../mobile-coordinator-zone-policy')

test('mobile coordinator QR policy is fail-closed without an exact allowlist', () => {
  assert.equal(resolveMobileCoordinatorZonePolicy({}).enabled, false)
  assert.equal(resolveMobileCoordinatorZonePolicy({ MOBILE_COORDINATOR_QR_ENABLED: 'true' }).enabled, false)
})

test('mobile coordinator QR policy allows only exact normalized organization ids', () => {
  const policy = resolveMobileCoordinatorZonePolicy({
    MOBILE_COORDINATOR_QR_ENABLED: 'true',
    MOBILE_COORDINATOR_QR_ALLOWED_ORG_IDS: ' bestclean, ORG-2 ',
  })
  assert.equal(policy.enabled, true)
  assert.equal(isMobileCoordinatorZoneOrganizationAllowed(policy, 'bestclean'), true)
  assert.equal(isMobileCoordinatorZoneOrganizationAllowed(policy, 'ORG-2'), true)
  assert.equal(isMobileCoordinatorZoneOrganizationAllowed(policy, 'bestclean-other'), false)
})
