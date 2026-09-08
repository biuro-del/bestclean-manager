'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const {
  WORKFORCE_SCHEDULE_ROLLOUT_MODES,
  isWorkforceScheduleOrganizationAllowed,
  parseWorkforceScheduleAllowedOrganizationIds,
  resolveWorkforceScheduleRollout,
  resolveWorkforceScheduleRolloutMode,
} = require('../workforce-schedule-rollout-policy')

const root = path.join(__dirname, '..')

function safeEnvironment(overrides = {}) {
  return {
    WORKFORCE_SCHEDULE_ENABLED: 'true',
    WORKFORCE_SCHEDULE_DELIVERY_ENABLED: 'false',
    WORKFORCE_SCHEDULE_NOTIFICATIONS_ENABLED: 'false',
    WORKFORCE_SCHEDULE_DOWNSTREAM_ENABLED: 'false',
    WORKFORCE_SCHEDULE_ROLLOUT_MODE: 'CANARY',
    WORKFORCE_SCHEDULE_ALLOWED_ORG_IDS: 'bestclean',
    ...overrides,
  }
}

test('rollout jest domyślnie OFF nawet gdy stara flaga master jest włączona', () => {
  const policy = resolveWorkforceScheduleRollout({
    WORKFORCE_SCHEDULE_ENABLED: 'true',
  })
  assert.equal(policy.mode, WORKFORCE_SCHEDULE_ROLLOUT_MODES.OFF)
  assert.equal(policy.enabled, false)
  assert.equal(isWorkforceScheduleOrganizationAllowed(policy, 'bestclean'), false)
})

test('nieznany tryb jest mapowany do OFF', () => {
  assert.equal(resolveWorkforceScheduleRolloutMode(''), 'OFF')
  assert.equal(resolveWorkforceScheduleRolloutMode('staging'), 'OFF')
  assert.equal(resolveWorkforceScheduleRolloutMode(' canary '), 'CANARY')
  assert.equal(resolveWorkforceScheduleRolloutMode('all'), 'ALL')
})

test('każda flaga efektu zewnętrznego zamyka rollout niezależnie od trybu', () => {
  for (const variable of [
    'WORKFORCE_SCHEDULE_DELIVERY_ENABLED',
    'WORKFORCE_SCHEDULE_NOTIFICATIONS_ENABLED',
    'WORKFORCE_SCHEDULE_DOWNSTREAM_ENABLED',
  ]) {
    const policy = resolveWorkforceScheduleRollout(safeEnvironment({ [variable]: 'true' }))
    assert.equal(policy.enabled, false, variable)
    assert.equal(isWorkforceScheduleOrganizationAllowed(policy, 'bestclean'), false, variable)
  }
  assert.equal(
    resolveWorkforceScheduleRollout(safeEnvironment({ WORKFORCE_SCHEDULE_ENABLED: 'false' })).enabled,
    false,
  )
})

test('CANARY dopuszcza wyłącznie dokładny identyfikator z allowlisty', () => {
  const policy = resolveWorkforceScheduleRollout(safeEnvironment({
    WORKFORCE_SCHEDULE_ALLOWED_ORG_IDS: ' bestclean,org_2,bestclean ',
  }))
  assert.deepEqual(policy.allowedOrganizationIds, ['bestclean', 'org_2'])
  assert.equal(isWorkforceScheduleOrganizationAllowed(policy, 'bestclean'), true)
  assert.equal(isWorkforceScheduleOrganizationAllowed(policy, 'org_2'), true)
  assert.equal(isWorkforceScheduleOrganizationAllowed(policy, 'BESTCLEAN'), false)
  assert.equal(isWorkforceScheduleOrganizationAllowed(policy, 'bestclean '), true)
  assert.equal(isWorkforceScheduleOrganizationAllowed(policy, 'other-org'), false)
  assert.equal(isWorkforceScheduleOrganizationAllowed(policy, ''), false)
})

test('pusta lub nieprawidłowa allowlista CANARY jest fail-closed', () => {
  for (const value of ['', '   ', '*', 'bestclean,*', 'bestclean,', 'bestclean,,org_2', 'bestclean,../other', 'bestclean,org id']) {
    const policy = resolveWorkforceScheduleRollout(safeEnvironment({
      WORKFORCE_SCHEDULE_ALLOWED_ORG_IDS: value,
    }))
    assert.deepEqual(policy.allowedOrganizationIds, [], value)
    assert.equal(isWorkforceScheduleOrganizationAllowed(policy, 'bestclean'), false, value)
  }
  assert.deepEqual(parseWorkforceScheduleAllowedOrganizationIds('org-1,org_2'), ['org-1', 'org_2'])
})

test('ALL wymaga jawnego trybu i nadal respektuje master oraz bezpieczne flagi', () => {
  const policy = resolveWorkforceScheduleRollout(safeEnvironment({
    WORKFORCE_SCHEDULE_ROLLOUT_MODE: 'ALL',
    WORKFORCE_SCHEDULE_ALLOWED_ORG_IDS: '',
  }))
  assert.equal(policy.enabled, true)
  assert.equal(isWorkforceScheduleOrganizationAllowed(policy, 'bestclean'), true)
  assert.equal(isWorkforceScheduleOrganizationAllowed(policy, 'other-org'), true)
  assert.equal(isWorkforceScheduleOrganizationAllowed(policy, '*'), false)
})

test('konfiguracja produkcyjna ogranicza backend canary do jednej organizacji', () => {
  const appHosting = fs.readFileSync(path.join(root, 'apphosting.yaml'), 'utf8')
  const rootEnv = fs.readFileSync(path.join(root, '.env.example'), 'utf8')
  const webEnv = fs.readFileSync(path.join(root, 'web-app', '.env.example'), 'utf8')
  const documentation = fs.readFileSync(
    path.join(root, 'docs', 'workforce-schedule-core.md'),
    'utf8',
  )

  assert.match(
    appHosting,
    /variable: WORKFORCE_SCHEDULE_ENABLED[\s\S]{0,100}value: "true"[\s\S]{0,100}- RUNTIME/,
  )
  assert.match(
    appHosting,
    /variable: WORKFORCE_SCHEDULE_ROLLOUT_MODE[\s\S]{0,100}value: "CANARY"[\s\S]{0,100}- RUNTIME/,
  )
  assert.match(
    appHosting,
    /variable: WORKFORCE_SCHEDULE_ALLOWED_ORG_IDS\r?\n\s+value: bestclean\r?\n\s+availability:\r?\n\s+- RUNTIME/,
  )
  assert.equal((appHosting.match(/variable: WORKFORCE_SCHEDULE_ALLOWED_ORG_IDS/g) || []).length, 1)
  assert.match(rootEnv, /^WORKFORCE_SCHEDULE_ROLLOUT_MODE=OFF$/m)
  assert.match(rootEnv, /^# WORKFORCE_SCHEDULE_ALLOWED_ORG_IDS=bestclean$/m)
  assert.match(webEnv, /^# WORKFORCE_SCHEDULE_ROLLOUT_MODE=OFF$/m)
  assert.match(documentation, /`WORKFORCE_SCHEDULE_ROLLOUT_MODE=CANARY`/)
  assert.match(documentation, /`WORKFORCE_SCHEDULE_ALLOWED_ORG_IDS`/)
})
