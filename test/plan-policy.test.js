'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  assertCanonicalPlanCode,
  calculateMeteredOverage,
  evaluateSubscriptionAccess,
  normalizePlanCode,
  resolvePlanDefinition,
  resolvePlanEntitlements,
} = require('../plan-policy')

test('normalizacja planów obsługuje kanoniczne kody i wyłącznie odczytowe aliasy', () => {
  const cases = [
    ['TRIAL', 'TRIAL'], ['DEMO', 'TRIAL'],
    ['GO+', 'GO_PLUS'], ['Go Plus', 'GO_PLUS'], ['GO-PLUS', 'GO_PLUS'], ['GO_PLUS', 'GO_PLUS'],
    ['START', 'PLUS'], ['PLUS', 'PLUS'],
    ['PRO', 'PRO'], ['ENTERPRISE', 'PRO'],
    ['BUSINESS', 'UNKNOWN'], ['', 'UNKNOWN'],
  ]
  for (const [input, expected] of cases) assert.equal(normalizePlanCode(input), expected, input)
})

test('nowe zapisy przyjmują tylko cztery kody kanoniczne', () => {
  for (const planCode of ['TRIAL', 'GO_PLUS', 'PLUS', 'PRO']) {
    assert.equal(assertCanonicalPlanCode(planCode), planCode)
  }
  for (const alias of ['DEMO', 'START', 'ENTERPRISE', 'GO+']) {
    assert.throws(() => assertCanonicalPlanCode(alias), (error) => error.publicCode === 'INVALID_PLAN')
  }
})

test('TRIAL ma dokładnie możliwości i limity GO_PLUS', () => {
  const trial = resolvePlanEntitlements('TRIAL')
  const goPlus = resolvePlanEntitlements('GO_PLUS')
  assert.equal(resolvePlanDefinition('TRIAL').trialDays, 30)
  assert.deepEqual(trial.capabilities, goPlus.capabilities)
  assert.deepEqual(trial.limits, goPlus.limits)
  assert.equal(trial.capabilities.scheduling, false)
  assert.equal(trial.capabilities.workforceScheduling, false)
  assert.equal(trial.capabilities.profitabilityModule, false)
})

test('PLUS i PRO rozszerzają macierz bez twardych limitów użycia', () => {
  const plus = resolvePlanEntitlements('PLUS')
  const pro = resolvePlanEntitlements('PRO')
  assert.equal(plus.capabilities.scheduling, true)
  assert.equal(plus.capabilities.workforceScheduling, true)
  assert.equal(plus.capabilities.zoneTasks, false)
  assert.equal(pro.capabilities.zoneTasks, true)
  assert.equal(pro.capabilities.profitabilityModule, true)
  assert.equal(pro.limits.includedWorkerSlots, 10)
  assert.equal(pro.limits.includedProObjects, 1)
  assert.equal(pro.limits.includedZonesPerProObject, 20)
  assert.equal(pro.limits.overageAllowed, true)
  assert.deepEqual(calculateMeteredOverage(13, pro.limits.includedWorkerSlots), {
    used: 13,
    included: 10,
    overage: 3,
  })
})

test('Trial wymaga przyszłej daty, a plan płatny statusu ACTIVE', () => {
  const now = new Date('2026-07-31T10:00:00Z')
  assert.equal(evaluateSubscriptionAccess({ planCode: 'TRIAL', status: 'TRIALING', trialEndsAt: '2026-08-01T10:00:00Z' }, now).allowed, true)
  assert.equal(evaluateSubscriptionAccess({ planCode: 'TRIAL', status: 'TRIALING', trialEndsAt: now }, now).code, 'TRIAL_INACTIVE')
  assert.equal(evaluateSubscriptionAccess({ planCode: 'GO_PLUS', status: 'ACTIVE' }, now).allowed, true)
  for (const status of ['PENDING_PAYMENT', 'PAST_DUE', 'SUSPENDED', 'CANCELED', 'EXPIRED']) {
    assert.equal(evaluateSubscriptionAccess({ planCode: 'PRO', status }, now).allowed, false, status)
  }
})
