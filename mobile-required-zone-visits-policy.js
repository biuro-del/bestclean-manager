'use strict'

const REQUIRED_ZONE_VISIT_MODES = Object.freeze({
  OFF: 'OFF',
  OBSERVE: 'OBSERVE',
  ENFORCE: 'ENFORCE',
})

function text(value) {
  return String(value ?? '').trim()
}

function key(value) {
  return text(value).toUpperCase()
}

function normalizeRequiredZoneVisitMode(value) {
  const normalized = key(value)
  return Object.prototype.hasOwnProperty.call(REQUIRED_ZONE_VISIT_MODES, normalized)
    ? REQUIRED_ZONE_VISIT_MODES[normalized]
    : REQUIRED_ZONE_VISIT_MODES.OFF
}

function allowList(value) {
  const source = Array.isArray(value) ? value : text(value).split(',')
  return new Set(source.map(key).filter(Boolean))
}

function workerKeys(worker = {}) {
  return new Set([
    worker?.workerId,
    worker?.id,
    worker?.login,
    worker?.workerLogin,
    worker?.email,
  ].map(key).filter(Boolean))
}

function selectBlockingRequiredZoneVisit({
  objects,
  activeObject,
  activeCycleClientId,
  targetClientId,
} = {}) {
  const incomplete = (Array.isArray(objects) ? objects : []).filter((visit) => visit?.complete !== true)
  const activeClientKey = key(activeCycleClientId)
  const targetClientKey = key(targetClientId)
  const activeVisit = activeClientKey
    ? incomplete.find((visit) => key(visit?.clientId) === activeClientKey)
    : null
  const selectedActiveVisit = activeObject?.complete !== true && text(activeObject?.visitId)
    ? activeObject
    : null
  const guardedVisit = activeVisit || selectedActiveVisit || incomplete[0] || null

  if (!guardedVisit || key(guardedVisit?.clientId) === targetClientKey) {
    return null
  }
  return guardedVisit
}

function requiredZoneVisitRolloutDecision({
  mode,
  canaryOrgIds,
  canaryWorkerIds,
  orgId,
  worker,
} = {}) {
  const configuredMode = normalizeRequiredZoneVisitMode(mode)
  if (configuredMode === REQUIRED_ZONE_VISIT_MODES.OFF) {
    return {
      allowed: false,
      enabled: false,
      enforce: false,
      mode: REQUIRED_ZONE_VISIT_MODES.OFF,
      configuredMode,
      reason: 'DISABLED',
    }
  }

  const organizations = allowList(canaryOrgIds)
  if (organizations.size && !organizations.has(key(orgId))) {
    return {
      allowed: false,
      enabled: false,
      enforce: false,
      mode: REQUIRED_ZONE_VISIT_MODES.OFF,
      configuredMode,
      reason: 'ORG_CANARY_RESTRICTED',
    }
  }

  const workers = allowList(canaryWorkerIds)
  const identities = workerKeys(worker)
  if (workers.size && ![...identities].some((identity) => workers.has(identity))) {
    return {
      allowed: false,
      enabled: false,
      enforce: false,
      mode: REQUIRED_ZONE_VISIT_MODES.OFF,
      configuredMode,
      reason: 'WORKER_CANARY_RESTRICTED',
    }
  }

  return {
    allowed: true,
    enabled: true,
    enforce: configuredMode === REQUIRED_ZONE_VISIT_MODES.ENFORCE,
    mode: configuredMode,
    configuredMode,
    reason: configuredMode === REQUIRED_ZONE_VISIT_MODES.ENFORCE ? 'ENFORCED' : 'OBSERVED',
  }
}

module.exports = {
  REQUIRED_ZONE_VISIT_MODES,
  normalizeRequiredZoneVisitMode,
  requiredZoneVisitRolloutDecision,
  selectBlockingRequiredZoneVisit,
}
