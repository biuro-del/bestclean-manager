'use strict'

function text(value) {
  return String(value ?? '').trim()
}

function enabledValue(value) {
  return ['1', 'true', 'yes', 'tak'].includes(text(value).toLowerCase())
}

function parseAllowedOrganizationIds(value) {
  return [...new Set(
    text(value)
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  )]
}

function resolveMobileCoordinatorZonePolicy(env = {}) {
  const allowedOrganizationIds = parseAllowedOrganizationIds(
    env.MOBILE_COORDINATOR_QR_ALLOWED_ORG_IDS,
  )
  const masterEnabled = enabledValue(env.MOBILE_COORDINATOR_QR_ENABLED)
  return Object.freeze({
    masterEnabled,
    allowedOrganizationIds: Object.freeze(allowedOrganizationIds),
    enabled: masterEnabled && allowedOrganizationIds.length > 0,
  })
}

function isMobileCoordinatorZoneOrganizationAllowed(policy, orgId) {
  if (!policy?.enabled) return false
  const normalized = text(orgId).toLowerCase()
  return Boolean(normalized) && policy.allowedOrganizationIds.includes(normalized)
}

module.exports = {
  isMobileCoordinatorZoneOrganizationAllowed,
  parseAllowedOrganizationIds,
  resolveMobileCoordinatorZonePolicy,
}
