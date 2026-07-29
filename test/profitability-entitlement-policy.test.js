'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  PROFITABILITY_CAPABILITY,
  ProfitabilityAccessError,
  assertProfitabilityAccess,
  assertProfitabilityTenantIsolation,
  hasProfitabilityCapability,
  normalizePlanCode,
  resolvePlanEntitlements,
  resolveProfitabilityAccess,
} = require('../profitability-entitlement-policy')

const ORG_ID = 'org-best-clean'

function accessInput(overrides = {}) {
  const actor = {
    uid: 'user-1',
    role: 'OWNER',
    activeOrgId: ORG_ID,
    ...(overrides.actor || {}),
  }

  return {
    action: 'read',
    requestOrgId: ORG_ID,
    planCode: 'PRO',
    subscriptionStatus: 'ACTIVE',
    ...overrides,
    actor,
  }
}

test('centralna macierz udostępnia profitabilityModule tylko planom PRO i ENTERPRISE', () => {
  const cases = [
    ['PRO', 'PRO', true],
    [' pro ', 'PRO', true],
    ['ENTERPRISE', 'ENTERPRISE', true],
    ['GO+', 'GO_PLUS', false],
    ['Go Plus', 'GO_PLUS', false],
    ['GO_PLUS', 'GO_PLUS', false],
    ['GO-PLUS', 'GO_PLUS', false],
    ['PLUS', 'PLUS', false],
    ['START', 'START', false],
    ['TRIAL', 'TRIAL', false],
    ['GOPLUS', 'UNKNOWN', false],
    ['PRO PLUS', 'UNKNOWN', false],
    ['BUSINESS', 'UNKNOWN', false],
    ['', 'UNKNOWN', false],
  ]

  for (const [input, expectedPlan, expectedCapability] of cases) {
    assert.equal(normalizePlanCode(input), expectedPlan, input)
    assert.equal(hasProfitabilityCapability(input), expectedCapability, input)
    assert.equal(
      resolvePlanEntitlements(input).capabilities[PROFITABILITY_CAPABILITY],
      expectedCapability,
      input,
    )
  }
})

test('OWNER może czytać i edytować w aktywnym planie z capability', () => {
  assert.equal(resolveProfitabilityAccess(accessInput({ action: 'read' })).allowed, true)
  assert.equal(resolveProfitabilityAccess(accessInput({ action: 'edit' })).allowed, true)
})

test('administrator finansowy może czytać i edytować', () => {
  for (const role of ['FINANCE_ADMIN', 'Finance admin', 'Administrator finansowy']) {
    assert.equal(resolveProfitabilityAccess(accessInput({ action: 'read', actor: { role } })).allowed, true, role)
    assert.equal(resolveProfitabilityAccess(accessInput({ action: 'edit', actor: { role } })).allowed, true, role)
  }

  assert.equal(
    resolveProfitabilityAccess(accessInput({ action: 'edit', actor: { role: 'ADMIN', isFinanceAdmin: true } })).allowed,
    true,
  )
})

test('zwykły ADMIN i MANAGER nie dziedziczą automatycznie dostępu finansowego', () => {
  for (const role of ['ADMIN', 'MANAGER']) {
    assert.equal(resolveProfitabilityAccess(accessInput({ action: 'read', actor: { role } })).allowed, false, role)
    assert.equal(resolveProfitabilityAccess(accessInput({ action: 'edit', actor: { role } })).allowed, false, role)
  }
})

test('COORDINATOR widzi moduł tylko z osobnym grantem i nigdy nie edytuje', () => {
  const withoutGrant = resolveProfitabilityAccess(accessInput({ actor: { role: 'COORDINATOR' } }))
  assert.equal(withoutGrant.allowed, false)
  assert.equal(withoutGrant.code, 'PROFITABILITY_GRANT_REQUIRED')

  for (const grants of [
    { profitabilityModule: true },
    { profitabilityModule: 'read' },
    { profitabilityModule: { read: true } },
    ['profitabilityModule'],
  ]) {
    const read = resolveProfitabilityAccess(accessInput({ actor: { role: 'COORDINATOR' }, grants }))
    assert.equal(read.allowed, true)
    assert.equal(read.explicitGrant, true)

    const edit = resolveProfitabilityAccess(accessInput({
      action: 'edit',
      actor: { role: 'COORDINATOR' },
      grants,
    }))
    assert.equal(edit.allowed, false)
    assert.equal(edit.code, 'PROFITABILITY_EDIT_FORBIDDEN')
  }
})

test('ADMIN z osobnym grantem może czytać, ale nie uzyskuje prawa edycji', () => {
  const grants = { profitabilityModule: { read: true, edit: false } }
  const read = resolveProfitabilityAccess(accessInput({ actor: { role: 'ADMIN' }, grants }))
  const edit = resolveProfitabilityAccess(accessInput({ action: 'edit', actor: { role: 'ADMIN' }, grants }))

  assert.equal(read.allowed, true)
  assert.equal(read.explicitGrant, true)
  assert.equal(edit.allowed, false)
  assert.equal(edit.code, 'PROFITABILITY_EDIT_FORBIDDEN')
})

test('WORKER nie ma dostępu nawet po przekazaniu grantu', () => {
  for (const action of ['read', 'edit']) {
    const decision = resolveProfitabilityAccess(accessInput({
      action,
      actor: { role: 'WORKER' },
      grants: { profitabilityModule: { read: true, edit: true } },
    }))
    assert.equal(decision.allowed, false)
    assert.equal(decision.code, 'PROFITABILITY_ROLE_FORBIDDEN')
  }
})

test('nieznana rola nie otrzymuje dostępu', () => {
  const decision = resolveProfitabilityAccess(accessInput({ actor: { role: 'CLIENT' } }))
  assert.equal(decision.allowed, false)
  assert.equal(decision.role, 'UNKNOWN')
})

test('capability planu i aktywna subskrypcja są wymagane przed oceną roli', () => {
  const plus = resolveProfitabilityAccess(accessInput({ planCode: 'GO+' }))
  assert.equal(plus.allowed, false)
  assert.equal(plus.code, 'PROFITABILITY_PLAN_REQUIRED')

  const inactive = resolveProfitabilityAccess(accessInput({ subscriptionStatus: 'PAST_DUE' }))
  assert.equal(inactive.allowed, false)
  assert.equal(inactive.code, 'PROFITABILITY_SUBSCRIPTION_INACTIVE')
})

test('PLATFORM_OWNER ma read/edit wyłącznie w aktywnym audytowanym kontekście organizacji', () => {
  const platformActor = {
    uid: 'platform-1',
    role: 'PLATFORM_OWNER',
    actorType: 'PLATFORM',
    activeOrgId: ORG_ID,
    platformContextId: 'context-1',
  }
  const platformAccessContext = {
    contextId: 'context-1',
    adminUid: 'platform-1',
    orgId: ORG_ID,
    reason: 'Weryfikacja kosztów na zgłoszenie właściciela',
    openedAt: '2026-07-22T08:00:00.000Z',
    closedAt: null,
    planCode: 'ENTERPRISE',
    subscriptionStatus: 'ACTIVE',
  }

  for (const action of ['read', 'edit']) {
    const decision = resolveProfitabilityAccess(accessInput({
      action,
      actor: platformActor,
      planCode: undefined,
      subscriptionStatus: undefined,
      platformAccessContext,
      now: new Date('2026-07-22T09:00:00.000Z'),
    }))
    assert.equal(decision.allowed, true, action)
  }

  const invalidContexts = [
    { ...platformAccessContext, contextId: 'context-other' },
    { ...platformAccessContext, adminUid: 'platform-other' },
    { ...platformAccessContext, reason: '' },
    { ...platformAccessContext, openedAt: 'invalid' },
    { ...platformAccessContext, closedAt: '2026-07-22T08:30:00.000Z' },
    { ...platformAccessContext, expiresAt: '2026-07-22T08:30:00.000Z' },
    { ...platformAccessContext, status: 'CLOSED' },
  ]

  for (const context of invalidContexts) {
    const decision = resolveProfitabilityAccess(accessInput({
      actor: platformActor,
      platformAccessContext: context,
    }))
    assert.equal(decision.allowed, false)
    assert.equal(decision.code, 'PROFITABILITY_PLATFORM_CONTEXT_REQUIRED')
  }
})

test('separacja tenantów odrzuca request do innej organizacji niż sesja', () => {
  assert.throws(
    () => assertProfitabilityTenantIsolation({
      requestOrgId: 'org-a',
      authenticatedOrgId: 'org-b',
    }),
    (error) => error instanceof ProfitabilityAccessError && error.code === 'PROFITABILITY_CROSS_ORG_FORBIDDEN',
  )
})

test('separacja tenantów sprawdza także organizationId access-context', () => {
  assert.throws(
    () => resolveProfitabilityAccess(accessInput({
      requestOrgId: 'org-a',
      authenticatedOrgId: 'org-a',
      accessContextOrgId: 'org-b',
    })),
    (error) => error instanceof ProfitabilityAccessError && error.code === 'PROFITABILITY_CROSS_ORG_FORBIDDEN',
  )
})

test('brak zaufanego organizationId jest odrzucany, a zgodny kontekst przechodzi', () => {
  assert.throws(
    () => assertProfitabilityTenantIsolation({ requestOrgId: ORG_ID }),
    (error) => error.code === 'PROFITABILITY_TENANT_CONTEXT_REQUIRED',
  )
  assert.equal(
    assertProfitabilityTenantIsolation({ requestOrgId: ORG_ID, authenticatedOrgId: ORG_ID }),
    ORG_ID,
  )
  assert.throws(
    () => assertProfitabilityTenantIsolation({
      requestOrgId: ORG_ID,
      authenticatedOrgId: '***',
      accessContextOrgId: ORG_ID,
    }),
    (error) => error.code === 'PROFITABILITY_TENANT_CONTEXT_INVALID',
  )
})

test('assertProfitabilityAccess zwraca decyzję lub błąd z kodem polityki', () => {
  assert.equal(assertProfitabilityAccess(accessInput({ action: 'edit' })).allowed, true)
  assert.throws(
    () => assertProfitabilityAccess(accessInput({ actor: { role: 'WORKER' } })),
    (error) => error instanceof ProfitabilityAccessError && error.code === 'PROFITABILITY_ROLE_FORBIDDEN',
  )
})
