'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  ACCESS_MODES,
  FINANCE_PROFILES,
  OBJECT_ACTIONS,
  OBJECT_SCOPES,
  OPERATIONAL_PROFILES,
  WORKER_SCOPES,
  WRITE_KINDS,
  evaluateProfitabilityObjectAccess,
  evaluateProfitabilityWriteAccess,
  resolveProfitabilityAccessProfile,
} = require('../profitability/access-profile-v2')

const NOW = new Date('2026-09-25T10:00:00.000Z')
const ORG_A = 'org-a'
const ORG_B = 'org-b'

function membership(overrides = {}) {
  return {
    orgId: ORG_A,
    uid: 'user-1',
    role: 'COORDINATOR',
    status: 'ACTIVE',
    ...overrides,
  }
}

function binding(overrides = {}) {
  return {
    orgId: ORG_A,
    uid: 'user-1',
    status: 'ACTIVE',
    operationalProfile: OPERATIONAL_PROFILES.COORDINATOR,
    financeProfile: FINANCE_PROFILES.COST_CONTROL,
    objectScope: OBJECT_SCOPES.ASSIGNED,
    workerScope: WORKER_SCOPES.OBJECT_ASSIGNED,
    accessMode: ACCESS_MODES.READ,
    canEditOperationalCosts: false,
    ...overrides,
  }
}

function assignment(objectId, overrides = {}) {
  return {
    orgId: ORG_A,
    uid: 'user-1',
    objectId,
    accessMode: 'ALLOW',
    status: 'ACTIVE',
    ...overrides,
  }
}

function resolve(overrides = {}) {
  return resolveProfitabilityAccessProfile({
    requestOrgId: ORG_A,
    authenticatedOrgId: ORG_A,
    authenticatedUid: 'user-1',
    membership: membership(),
    binding: binding(),
    trustedObjectAssignments: [],
    now: NOW,
    ...overrides,
  })
}

test('Marta-like coordinator owner behavior uses a supported ADMIN membership plus an explicit operations profile', () => {
  const decision = resolve({
    authenticatedUid: 'marta-uid',
    membership: membership({ uid: 'marta-uid', role: 'ADMIN', displayName: 'ignored' }),
    binding: binding({
      uid: 'marta-uid',
      operationalProfile: OPERATIONAL_PROFILES.OPERATIONS_ADMIN,
      financeProfile: FINANCE_PROFILES.COST_CONTROL,
      objectScope: OBJECT_SCOPES.ALL,
      workerScope: WORKER_SCOPES.ALL,
      accessMode: ACCESS_MODES.MANAGE,
      canEditOperationalCosts: true,
      email: 'ignored@example.invalid',
    }),
  })

  assert.equal(decision.allowed, true)
  assert.equal(decision.financeProfile, FINANCE_PROFILES.COST_CONTROL)
  assert.equal(decision.capabilities.readFullFinancials, false)
  assert.equal(decision.capabilities.readCostControl, true)
  assert.equal(decision.capabilities.manageOperations, true)
  assert.equal(decision.capabilities.editOperationalCosts, true)

  assert.equal(evaluateProfitabilityObjectAccess(decision, { objectId: 'object-any' }).allowed, true)
  assert.equal(evaluateProfitabilityWriteAccess(decision, {
    objectId: 'object-any',
    writeKind: WRITE_KINDS.OPERATIONAL_DATA,
  }).allowed, true)
  assert.equal(evaluateProfitabilityWriteAccess(decision, {
    objectId: 'object-any',
    writeKind: WRITE_KINDS.OPERATIONAL_COST,
  }).allowed, true)

  for (const writeKind of [
    WRITE_KINDS.CONTRACT_TERMS,
    WRITE_KINDS.PROFITABILITY_TARGET,
    WRITE_KINDS.WORKER_RATE,
  ]) {
    const write = evaluateProfitabilityWriteAccess(decision, { objectId: 'object-any', writeKind })
    assert.equal(write.allowed, false, writeKind)
    assert.equal(write.code, 'WRITE_FORBIDDEN', writeKind)
  }
})

test('Szymon-like ADMIN exception is scoped by explicit binding to one organization', () => {
  const orgADecision = resolve({
    authenticatedUid: 'szymon-uid',
    membership: membership({ uid: 'szymon-uid', role: 'ADMIN' }),
    binding: binding({
      uid: 'szymon-uid',
      operationalProfile: OPERATIONAL_PROFILES.ADMIN,
      financeProfile: FINANCE_PROFILES.COST_CONTROL,
      objectScope: OBJECT_SCOPES.ALL,
      workerScope: WORKER_SCOPES.ALL,
      accessMode: ACCESS_MODES.MANAGE,
    }),
  })
  assert.equal(orgADecision.allowed, true)
  assert.equal(orgADecision.capabilities.readFullFinancials, false)

  const orgBWithoutBinding = resolve({
    requestOrgId: ORG_B,
    authenticatedOrgId: ORG_B,
    authenticatedUid: 'szymon-uid',
    membership: membership({ orgId: ORG_B, uid: 'szymon-uid', role: 'ADMIN' }),
    binding: undefined,
  })
  assert.equal(orgBWithoutBinding.allowed, false)
  assert.equal(orgBWithoutBinding.code, 'ACTIVE_BINDING_REQUIRED')

  const orgBWithSpoofedOrgABinding = resolve({
    requestOrgId: ORG_B,
    authenticatedOrgId: ORG_B,
    authenticatedUid: 'szymon-uid',
    membership: membership({ orgId: ORG_B, uid: 'szymon-uid', role: 'ADMIN' }),
    binding: binding({ orgId: ORG_A, uid: 'szymon-uid' }),
  })
  assert.equal(orgBWithSpoofedOrgABinding.allowed, false)
  assert.equal(orgBWithSpoofedOrgABinding.code, 'ACTIVE_BINDING_REQUIRED')
})

test('ordinary coordinator can read only active assignments for matching organization and uid', () => {
  const decision = resolve({
    trustedObjectAssignments: [
      assignment('object-allowed'),
      assignment('object-duplicate'),
      assignment('object-duplicate'),
      assignment('object-other-org', { orgId: ORG_B }),
      assignment('object-other-user', { uid: 'user-2' }),
      assignment('object-revoked', { status: 'REVOKED' }),
      assignment('object-expired', { validUntil: '2026-09-25T09:59:59.000Z' }),
    ],
  })

  assert.equal(decision.allowed, true)
  assert.deepEqual(decision.assignedObjectIds, ['object-allowed', 'object-duplicate'])
  assert.equal(evaluateProfitabilityObjectAccess(decision, { objectId: 'object-allowed' }).allowed, true)
  assert.equal(evaluateProfitabilityObjectAccess(decision, { objectId: 'object-other-org' }).allowed, false)
  assert.equal(evaluateProfitabilityObjectAccess(decision, { objectId: 'object-revoked' }).allowed, false)
  assert.equal(evaluateProfitabilityObjectAccess(decision, {
    objectId: 'object-allowed',
    action: OBJECT_ACTIONS.MANAGE,
  }).code, 'OBJECT_MANAGE_FORBIDDEN')
})

test('explicit owner mapping enables full finance and sensitive writes', () => {
  const decision = resolve({
    authenticatedUid: 'owner-uid',
    membership: membership({ uid: 'owner-uid', role: 'OWNER' }),
    binding: binding({
      uid: 'owner-uid',
      operationalProfile: OPERATIONAL_PROFILES.OWNER,
      financeProfile: FINANCE_PROFILES.OWNER_FULL,
      objectScope: OBJECT_SCOPES.ALL,
      workerScope: WORKER_SCOPES.ALL,
      accessMode: ACCESS_MODES.MANAGE,
    }),
  })

  assert.equal(decision.allowed, true)
  assert.equal(decision.capabilities.readFullFinancials, true)
  for (const writeKind of Object.values(WRITE_KINDS)) {
    assert.equal(evaluateProfitabilityWriteAccess(decision, {
      objectId: 'object-any',
      writeKind,
    }).allowed, true, writeKind)
  }
})

test('explicit object DENY wins even for an ALL scope profile', () => {
  const decision = resolve({
    binding: binding({ objectScope: OBJECT_SCOPES.ALL }),
    trustedObjectAssignments: [
      assignment('object-safe'),
      assignment('object-secret', { accessMode: 'ALLOW' }),
      assignment('object-secret', { accessMode: 'DENY' }),
    ],
  })

  assert.deepEqual(decision.deniedObjectIds, ['object-secret'])
  assert.equal(evaluateProfitabilityObjectAccess(decision, { objectId: 'object-safe' }).allowed, true)
  assert.equal(evaluateProfitabilityObjectAccess(decision, { objectId: 'object-secret' }).allowed, false)
})

test('ADMIN does not receive any finance profile without an explicit active binding', () => {
  const decision = resolve({
    membership: membership({ role: 'ADMIN' }),
    binding: undefined,
  })

  assert.equal(decision.allowed, false)
  assert.equal(decision.code, 'ACTIVE_BINDING_REQUIRED')
  assert.equal(decision.financeProfile, FINANCE_PROFILES.NONE)
})

test('cross-org request, uid spoof, revoked and expired rows fail closed', () => {
  const cases = [
    resolve({ authenticatedOrgId: ORG_B }),
    resolve({ authenticatedUid: 'attacker-uid' }),
    resolve({ membership: membership({ status: 'REVOKED' }) }),
    resolve({ membership: membership({ validUntil: '2026-09-25T09:59:59.000Z' }) }),
    resolve({ binding: binding({ status: 'REVOKED' }) }),
    resolve({ binding: binding({ validUntil: '2026-09-25T09:59:59.000Z' }) }),
  ]

  for (const decision of cases) {
    assert.equal(decision.allowed, false)
    assert.equal(decision.financeProfile, FINANCE_PROFILES.NONE)
    assert.deepEqual(decision.capabilities, {
      readFullFinancials: false,
      readCostControl: false,
      manageOperations: false,
      editOperationalCosts: false,
      editContractTerms: false,
      editProfitabilityTargets: false,
      viewWorkerRates: false,
      editWorkerRates: false,
    })
  }
})

test('unknown profile, scope, mode and explicit NONE fail closed', () => {
  const cases = [
    binding({ financeProfile: 'ADMIN_FULL' }),
    binding({ operationalProfile: 'COORDINATOR_OWNER' }),
    binding({ objectScope: 'ORGANIZATION' }),
    binding({ workerScope: 'EVERYONE' }),
    binding({ accessMode: 'WRITE' }),
    binding({ financeProfile: FINANCE_PROFILES.NONE }),
    binding({ objectScope: OBJECT_SCOPES.NONE }),
    binding({ workerScope: WORKER_SCOPES.NONE }),
    binding({ accessMode: ACCESS_MODES.NONE }),
  ]

  for (const candidate of cases) {
    const decision = resolve({ binding: candidate })
    assert.equal(decision.allowed, false)
    assert.equal(decision.financeProfile, FINANCE_PROFILES.NONE)
  }
})

test('binding cannot inject sensitive capabilities into COST_CONTROL', () => {
  const decision = resolve({
    binding: binding({
      objectScope: OBJECT_SCOPES.ALL,
      workerScope: WORKER_SCOPES.ALL,
      accessMode: ACCESS_MODES.MANAGE,
      canEditOperationalCosts: true,
      capabilities: {
        readFullFinancials: true,
        editContractTerms: true,
        editProfitabilityTargets: true,
        editWorkerRates: true,
      },
    }),
  })

  assert.equal(decision.capabilities.readFullFinancials, false)
  assert.equal(decision.capabilities.editContractTerms, false)
  assert.equal(decision.capabilities.editProfitabilityTargets, false)
  assert.equal(decision.capabilities.editWorkerRates, false)
})
