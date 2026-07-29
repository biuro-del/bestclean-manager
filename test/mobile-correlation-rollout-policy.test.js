'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  mobileCorrelationRolloutDecision,
  parseCanaryWorkerIdentifiers,
} = require('../mobile-correlation-rollout-policy')

test('wylaczona flaga blokuje CLEAN rowniez dla pracownika z allowlisty', () => {
  assert.deepEqual(
    mobileCorrelationRolloutDecision({
      enabled: 'false',
      canaryWorkerIds: 'W001',
      worker: { workerId: 'W001', login: 'Rafal' },
    }),
    { allowed: false, reason: 'DISABLED' },
  )
})

test('canary przepuszcza tylko wskazanego pracownika po ID lub loginie', () => {
  assert.deepEqual(
    mobileCorrelationRolloutDecision({
      enabled: 'true',
      canaryWorkerIds: 'W001',
      worker: { workerId: 'W001', login: 'Rafal' },
    }),
    { allowed: true, reason: 'CANARY_MATCH' },
  )
  assert.deepEqual(
    mobileCorrelationRolloutDecision({
      enabled: 'true',
      canaryWorkerIds: 'rafal',
      worker: { workerId: 'W001', login: 'Rafal' },
    }),
    { allowed: true, reason: 'CANARY_MATCH' },
  )
  assert.deepEqual(
    mobileCorrelationRolloutDecision({
      enabled: 'true',
      canaryWorkerIds: 'W001',
      worker: { workerId: 'W002', login: 'Marta' },
    }),
    { allowed: false, reason: 'CANARY_RESTRICTED' },
  )
})

test('pusta allowlista oznacza pelne uruchomienie dopiero po wlaczeniu flagi', () => {
  assert.deepEqual(
    mobileCorrelationRolloutDecision({
      enabled: 'true',
      canaryWorkerIds: '',
      worker: { workerId: 'W002', login: 'Marta' },
    }),
    { allowed: true, reason: 'FULL_ROLLOUT' },
  )
})

test('allowlista jest normalizowana i ignoruje puste elementy', () => {
  assert.deepEqual(
    [...parseCanaryWorkerIdentifiers(' W001, Rafal, ,W001 ')],
    ['w001', 'rafal'],
  )
})
