'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  buildSessionContext,
  evaluateOrganizationAccess,
  normalizeOrganizationId,
  resolveAccessibleOrganizations,
} = require('../auth-session-policy')

const NOW = new Date('2026-07-16T10:00:00.000Z')

function activeTrialRow(overrides = {}) {
  return {
    org_id: 'orgID_1',
    role: 'OWNER',
    membership_status: 'ACTIVE',
    organization_name: 'Testowa Firma1',
    organization_status: 'ACTIVE',
    organization_deleted_at: null,
    worker_record_id: 'workerID_1',
    worker_auth_uid: 'firebase-uid',
    worker_active: true,
    worker_status: 'ACTIVE',
    plan_code: 'TRIAL',
    subscription_status: 'TRIALING',
    trial_ends_at: '2026-07-17T10:00:00.000Z',
    current_period_ends_at: null,
    ...overrides,
  }
}

test('aktywny Trial daje dostep', () => {
  assert.deepEqual(evaluateOrganizationAccess(activeTrialRow(), NOW), {
    allowed: true,
    code: 'ACCESS_ALLOWED',
  })
  assert.equal(
    evaluateOrganizationAccess(activeTrialRow({ organization_status: 'TRIAL' }), NOW).allowed,
    true,
  )
})

test('Trial wygasajacy dokladnie teraz jest odrzucany', () => {
  assert.equal(
    evaluateOrganizationAccess(activeTrialRow({ trial_ends_at: NOW.toISOString() }), NOW).code,
    'TRIAL_INACTIVE',
  )
})

test('aktywny platny plan START lub PRO daje dostep', () => {
  for (const planCode of ['GO_PLUS', 'PLUS', 'PRO', 'START', 'ENTERPRISE']) {
    assert.equal(
      evaluateOrganizationAccess(
        activeTrialRow({
          plan_code: planCode,
          subscription_status: 'ACTIVE',
          trial_ends_at: null,
        }),
        NOW,
      ).allowed,
      true,
    )
  }
})

test('nieaktywny membership jest odrzucany', () => {
  assert.equal(
    evaluateOrganizationAccess(activeTrialRow({ membership_status: 'INACTIVE' }), NOW).code,
    'MEMBERSHIP_INACTIVE',
  )
})

test('brak powiazanego Workera jest odrzucany', () => {
  assert.equal(
    evaluateOrganizationAccess(activeTrialRow({ worker_record_id: null, worker_auth_uid: null }), NOW).code,
    'WORKER_MISSING',
  )
})

test('Worker nieaktywny albo usuniety jest odrzucany', () => {
  assert.equal(
    evaluateOrganizationAccess(activeTrialRow({ worker_active: false }), NOW).code,
    'WORKER_INACTIVE',
  )
  assert.equal(
    evaluateOrganizationAccess(activeTrialRow({ worker_status: 'DELETED' }), NOW).code,
    'WORKER_DELETED',
  )
})

test('organizacja zawieszona albo usunieta jest odrzucana', () => {
  assert.equal(
    evaluateOrganizationAccess(activeTrialRow({ organization_status: 'SUSPENDED' }), NOW).code,
    'ORGANIZATION_UNAVAILABLE',
  )
  assert.equal(
    evaluateOrganizationAccess(activeTrialRow({ organization_deleted_at: NOW.toISOString() }), NOW).code,
    'ORGANIZATION_UNAVAILABLE',
  )
})

test('brak poprawnej subskrypcji jest odrzucany', () => {
  assert.equal(
    evaluateOrganizationAccess(activeTrialRow({ plan_code: null, subscription_status: null }), NOW).code,
    'SUBSCRIPTION_MISSING',
  )
  assert.equal(
    evaluateOrganizationAccess(
      activeTrialRow({ plan_code: 'PRO', subscription_status: 'PAST_DUE', trial_ends_at: null }),
      NOW,
    ).code,
    'SUBSCRIPTION_INACTIVE',
  )
})

test('wartosci NULL statusow legacy nie blokuja same w sobie', () => {
  assert.equal(
    evaluateOrganizationAccess(
      activeTrialRow({
        worker_active: null,
        worker_status: null,
      }),
      NOW,
    ).allowed,
    true,
  )
})

test('rola WORKER i jej historyczne aliasy nie maja dostepu do portalu', () => {
  for (const role of ['WORKER', 'PRACOWNIK', 'INTERN', 'STAZYSTA', 'STAŻYSTA']) {
    assert.equal(
      evaluateOrganizationAccess(activeTrialRow({ role }), NOW).code,
      'PORTAL_ROLE_FORBIDDEN',
    )
  }
  assert.equal(
    evaluateOrganizationAccess(activeTrialRow({ role: '' }), NOW).code,
    'PORTAL_ROLE_MISSING',
  )
})

test('orgID zachowuje wielkosc liter w walidacji i kontekście', () => {
  assert.equal(normalizeOrganizationId('orgID_1'), 'orgID_1')
  assert.equal(normalizeOrganizationId('org ID 1'), '')
  const context = buildSessionContext('firebase-uid', activeTrialRow())
  assert.equal(context.uid, 'firebase-uid')
  assert.equal(context.activeOrgId, 'orgID_1')
  assert.equal(context.planCode, 'TRIAL')
  assert.equal(context.planName, 'Trial')
  assert.equal(context.onboardingRequired, true)
  assert.equal(context.capabilities.timeTracking, true)
  assert.equal(context.capabilities.scheduling, false)
  assert.equal(context.capabilities.profitabilityModule.enabled, false)
  assert.equal(context.limits.includedWorkerSlots, 10)
})

test('platny pakiet przekazuje koniec biezacego okresu rozliczeniowego', () => {
  assert.equal(
    buildSessionContext(
      'firebase-uid',
      activeTrialRow({
        plan_code: 'PRO',
        subscription_status: 'ACTIVE',
        trial_ends_at: null,
        current_period_ends_at: '2026-08-16T10:00:00.000Z',
      }),
    ).subscriptionEndsAt,
    '2026-08-16T10:00:00.000Z',
  )
})

test('lista organizacji zawiera tylko organizacje z pelnym aktywnym dostepem', () => {
  const rows = [
    activeTrialRow(),
    activeTrialRow({
      org_id: 'orgID_2',
      organization_name: 'Firma 2',
      worker_record_id: 'workerID_2',
      plan_code: 'PRO',
      subscription_status: 'INACTIVE',
      trial_ends_at: null,
    }),
  ]

  assert.deepEqual(
    resolveAccessibleOrganizations(rows, NOW).map((row) => row.org_id),
    ['orgID_1'],
  )
})
