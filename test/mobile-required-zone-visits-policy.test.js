'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  REQUIRED_ZONE_VISIT_MODES,
  normalizeRequiredZoneVisitMode,
  requiredZoneVisitRolloutDecision,
  selectBlockingRequiredZoneVisit,
} = require('../mobile-required-zone-visits-policy')

test('tryb wymaganych stref jest domyslnie i dla nieznanej wartosci wylaczony', () => {
  assert.equal(normalizeRequiredZoneVisitMode(), REQUIRED_ZONE_VISIT_MODES.OFF)
  assert.equal(normalizeRequiredZoneVisitMode('unexpected'), REQUIRED_ZONE_VISIT_MODES.OFF)
  assert.equal(requiredZoneVisitRolloutDecision().enabled, false)
})

test('OBSERVE zapisuje postep bez twardej blokady', () => {
  const decision = requiredZoneVisitRolloutDecision({
    mode: 'observe',
    orgId: 'CLZ',
    worker: { workerId: 'W001', login: 'worker-1' },
  })
  assert.deepEqual(decision, {
    allowed: true,
    enabled: true,
    enforce: false,
    mode: 'OBSERVE',
    configuredMode: 'OBSERVE',
    reason: 'OBSERVED',
  })
})

test('ENFORCE jest ograniczany allowlista organizacji i pracownikow', () => {
  const allowed = requiredZoneVisitRolloutDecision({
    mode: 'ENFORCE',
    canaryOrgIds: 'OTHER, clz ',
    canaryWorkerIds: 'W005, w001',
    orgId: 'CLZ',
    worker: { workerId: 'W001', login: 'worker-1' },
  })
  assert.equal(allowed.enabled, true)
  assert.equal(allowed.enforce, true)

  const wrongOrg = requiredZoneVisitRolloutDecision({
    mode: 'ENFORCE',
    canaryOrgIds: 'CLZ',
    orgId: 'OTHER',
    worker: { workerId: 'W001' },
  })
  assert.equal(wrongOrg.enabled, false)
  assert.equal(wrongOrg.reason, 'ORG_CANARY_RESTRICTED')

  const wrongWorker = requiredZoneVisitRolloutDecision({
    mode: 'ENFORCE',
    canaryWorkerIds: 'W001',
    orgId: 'CLZ',
    worker: { workerId: 'W002' },
  })
  assert.equal(wrongWorker.enabled, false)
  assert.equal(wrongWorker.reason, 'WORKER_CANARY_RESTRICTED')
})

test('pracownik moze skanowac strefy biezacego obiektu, ale nie przejsc do kolejnego z brakami', () => {
  const current = {
    visitId: 'VISIT-A',
    clientId: 'CLIENT-A',
    clientName: 'Obiekt A',
    complete: false,
    missingZones: [{ zoneId: 'A-2', name: 'WC' }],
  }
  const complete = { visitId: 'VISIT-B', clientId: 'CLIENT-B', complete: true }

  assert.equal(selectBlockingRequiredZoneVisit({
    objects: [current, complete],
    activeObject: current,
    activeCycleClientId: 'CLIENT-A',
    targetClientId: 'client-a',
  }), null)

  assert.equal(selectBlockingRequiredZoneVisit({
    objects: [current, complete],
    activeObject: current,
    activeCycleClientId: 'CLIENT-A',
    targetClientId: 'CLIENT-B',
  }), current)

  assert.equal(selectBlockingRequiredZoneVisit({
    objects: [{ ...current, complete: true }, complete],
    activeObject: { ...current, complete: true },
    activeCycleClientId: 'CLIENT-A',
    targetClientId: 'CLIENT-B',
  }), null)
})
