'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const { buildSessionContext, evaluateOrganizationAccess } = require('../auth-session-policy')

function row(overrides = {}) {
  return {
    org_id: 'ORG-1',
    organization_name: 'Best Clean',
    organization_status: 'ACTIVE',
    membership_status: 'ACTIVE',
    worker_record_id: 'WORKER-1',
    worker_auth_uid: 'UID-1',
    worker_active: true,
    worker_status: 'ACTIVE',
    role: 'OWNER',
    plan_code: 'PRO',
    subscription_status: 'ACTIVE',
    current_period_ends_at: '2026-08-01T00:00:00Z',
    ...overrides,
  }
}

test('sesja OWNER w PRO dostaje read/edit z centralnej capability', () => {
  const context = buildSessionContext('UID-1', row())
  assert.deepEqual(context.capabilities.profitabilityModule, {
    enabled: true,
    canRead: true,
    canEdit: true,
    readCode: 'PROFITABILITY_ACCESS_ALLOWED',
    editCode: 'PROFITABILITY_ACCESS_ALLOWED',
  })
})

test('zwykły ADMIN nie dostaje finansów tylko dlatego, że administruje portalem', () => {
  const context = buildSessionContext('UID-1', row({ role: 'ADMIN' }))
  assert.equal(context.capabilities.profitabilityModule.enabled, true)
  assert.equal(context.capabilities.profitabilityModule.canRead, false)
  assert.equal(context.capabilities.profitabilityModule.canEdit, false)
})

test('ADMIN z zaufanym grantem odczytu nie dostaje automatycznie edycji', () => {
  const context = buildSessionContext('UID-1', row({
    role: 'ADMIN',
    profitability_grants: { profitabilityModule: { read: true, edit: false } },
  }))

  assert.equal(context.capabilities.profitabilityModule.canRead, true)
  assert.equal(context.capabilities.profitabilityModule.canEdit, false)
})

test('ADMIN oznaczony przez backend jako finansowy może czytać i edytować', () => {
  const context = buildSessionContext('UID-1', row({ role: 'ADMIN', is_finance_admin: true }))
  assert.equal(context.capabilities.profitabilityModule.canRead, true)
  assert.equal(context.capabilities.profitabilityModule.canEdit, true)
})

test('ENTERPRISE jest aktywnym planem portalu i ma tę samą capability co PRO', () => {
  const enterprise = row({ plan_code: 'ENTERPRISE' })
  assert.deepEqual(evaluateOrganizationAccess(enterprise), { allowed: true, code: 'ACCESS_ALLOWED' })
  assert.equal(buildSessionContext('UID-1', enterprise).planCode, 'PRO')
  assert.equal(buildSessionContext('UID-1', enterprise).capabilities.profitabilityModule.canRead, true)
})

test('START pozostaje dostępny w portalu, ale bez capability rentowności', () => {
  const start = row({ plan_code: 'START' })
  assert.deepEqual(evaluateOrganizationAccess(start), { allowed: true, code: 'ACCESS_ALLOWED' })
  assert.equal(buildSessionContext('UID-1', start).planCode, 'PLUS')
  assert.equal(buildSessionContext('UID-1', start).capabilities.profitabilityModule.enabled, false)
  assert.equal(buildSessionContext('UID-1', start).capabilities.profitabilityModule.canRead, false)
})
