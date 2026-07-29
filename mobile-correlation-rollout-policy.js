'use strict'

function normalizeIdentifier(value) {
  return String(value ?? '').trim().toLowerCase()
}

function isEnabled(value) {
  return ['1', 'true', 'yes', 'tak'].includes(normalizeIdentifier(value))
}

function parseCanaryWorkerIdentifiers(value) {
  return new Set(
    String(value ?? '')
      .split(',')
      .map(normalizeIdentifier)
      .filter(Boolean),
  )
}

function mobileCorrelationRolloutDecision({ enabled, canaryWorkerIds, worker } = {}) {
  if (!isEnabled(enabled)) {
    return { allowed: false, reason: 'DISABLED' }
  }

  const canaryIdentifiers = parseCanaryWorkerIdentifiers(canaryWorkerIds)
  if (canaryIdentifiers.size === 0) {
    return { allowed: true, reason: 'FULL_ROLLOUT' }
  }

  const workerIdentifiers = [
    worker?.workerId,
    worker?.worker_id,
    worker?.login,
    worker?.workerLogin,
    worker?.worker_login,
  ]
    .map(normalizeIdentifier)
    .filter(Boolean)

  const allowed = workerIdentifiers.some((identifier) => canaryIdentifiers.has(identifier))
  return {
    allowed,
    reason: allowed ? 'CANARY_MATCH' : 'CANARY_RESTRICTED',
  }
}

module.exports = {
  mobileCorrelationRolloutDecision,
  parseCanaryWorkerIdentifiers,
}
