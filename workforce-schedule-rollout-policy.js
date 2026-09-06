'use strict'

const WORKFORCE_SCHEDULE_ROLLOUT_MODES = Object.freeze({
  OFF: 'OFF',
  CANARY: 'CANARY',
  ALL: 'ALL',
})

const ORGANIZATION_ID_PATTERN = /^[a-z0-9_-]{1,64}$/i

function text(value) {
  return String(value ?? '').trim()
}

function isTrue(value) {
  return ['1', 'true', 'yes', 'tak'].includes(text(value).toLowerCase())
}

function resolveWorkforceScheduleRolloutMode(value) {
  const mode = text(value).toUpperCase()
  return Object.values(WORKFORCE_SCHEDULE_ROLLOUT_MODES).includes(mode)
    ? mode
    : WORKFORCE_SCHEDULE_ROLLOUT_MODES.OFF
}

function parseWorkforceScheduleAllowedOrganizationIds(value) {
  const source = text(value)
  if (!source) return Object.freeze([])
  const entries = source.split(',').map((entry) => entry.trim())

  if (entries.some((entry) => !entry || !ORGANIZATION_ID_PATTERN.test(entry))) {
    return Object.freeze([])
  }

  return Object.freeze([...new Set(entries)])
}

function resolveWorkforceScheduleRollout(environment = {}) {
  const mode = resolveWorkforceScheduleRolloutMode(
    environment.WORKFORCE_SCHEDULE_ROLLOUT_MODE,
  )
  const allowedOrganizationIds = parseWorkforceScheduleAllowedOrganizationIds(
    environment.WORKFORCE_SCHEDULE_ALLOWED_ORG_IDS,
  )
  const internalOnly = !isTrue(environment.WORKFORCE_SCHEDULE_DELIVERY_ENABLED)
    && !isTrue(environment.WORKFORCE_SCHEDULE_NOTIFICATIONS_ENABLED)
    && !isTrue(environment.WORKFORCE_SCHEDULE_DOWNSTREAM_ENABLED)
  const masterEnabled = isTrue(environment.WORKFORCE_SCHEDULE_ENABLED)
  const enabled = masterEnabled
    && internalOnly
    && mode !== WORKFORCE_SCHEDULE_ROLLOUT_MODES.OFF

  return Object.freeze({
    allowedOrganizationIds,
    enabled,
    internalOnly,
    masterEnabled,
    mode,
  })
}

function isWorkforceScheduleOrganizationAllowed(policy, organizationIdValue) {
  const organizationId = text(organizationIdValue)
  if (!policy?.enabled || !organizationId || !ORGANIZATION_ID_PATTERN.test(organizationId)) {
    return false
  }
  if (policy.mode === WORKFORCE_SCHEDULE_ROLLOUT_MODES.ALL) return true
  if (policy.mode !== WORKFORCE_SCHEDULE_ROLLOUT_MODES.CANARY) return false
  return Array.isArray(policy.allowedOrganizationIds)
    && policy.allowedOrganizationIds.includes(organizationId)
}

module.exports = {
  WORKFORCE_SCHEDULE_ROLLOUT_MODES,
  isWorkforceScheduleOrganizationAllowed,
  parseWorkforceScheduleAllowedOrganizationIds,
  resolveWorkforceScheduleRollout,
  resolveWorkforceScheduleRolloutMode,
}
