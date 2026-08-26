'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  buildWorkerId,
  buildWorkerLogin,
  canAssignWorkerRole,
  isWorkerDeleteRole,
  nextWorkerNumber,
  normalizeWorkerNumber,
  normalizeWorkerRole,
  parseWorkerNumber,
} = require('../worker-id-policy')

test('builds organization-scoped worker ids without zero padding', () => {
  assert.equal(buildWorkerId('org123', 1), 'worker_org123_1')
  assert.equal(buildWorkerId('org-abc', 2137), 'worker_org-abc_2137')
})

test('builds lowercase backend-only logins from organization and worker number', () => {
  assert.equal(buildWorkerLogin('orgA', 1), 'u_orga_1')
  assert.equal(buildWorkerLogin('ORG-ABC', 2137), 'u_org-abc_2137')
})

test('generated worker login fits the existing varchar 80 schema limit', () => {
  const login = buildWorkerLogin('a'.repeat(64), 2147483647)
  assert.equal(login.length, 77)
})

test('reads only ids that belong to the requested organization', () => {
  assert.equal(parseWorkerNumber('org123', 'worker_org123_18'), 18)
  assert.equal(parseWorkerNumber('org123', 'worker_other_18'), null)
  assert.equal(parseWorkerNumber('org123', 'W047'), null)
  assert.equal(parseWorkerNumber('org123', 'worker_org123_01'), null)
})

test('next number includes reservations and already formatted workers', () => {
  const reservations = [{ workerNumber: 3 }, { worker_number: 8 }]
  const workers = [
    { workerId: 'W047' },
    { workerId: 'worker_org123_12' },
    { workerId: 'worker_other_99' },
  ]
  assert.equal(nextWorkerNumber('org123', reservations, workers), 13)
})

test('deleted worker numbers remain consumed through reservations', () => {
  assert.equal(nextWorkerNumber('org123', [{ workerNumber: 3 }], []), 4)
})

test('manual high reservation advances the next automatic number', () => {
  assert.equal(nextWorkerNumber('org123', [{ workerNumber: 2137 }], []), 2138)
})

test('manual worker numbers must be positive integers without leading zeros', () => {
  assert.equal(normalizeWorkerNumber('2137', { optional: true }), 2137)
  assert.equal(normalizeWorkerNumber('01', { optional: true }), null)
  assert.equal(normalizeWorkerNumber('0', { optional: true }), null)
  assert.equal(normalizeWorkerNumber('-1', { optional: true }), null)
})

test('only exact ADMIN and OWNER roles may delete workers', () => {
  assert.equal(isWorkerDeleteRole('ADMIN'), true)
  assert.equal(isWorkerDeleteRole('owner'), true)
  assert.equal(isWorkerDeleteRole('ADMINISTRATOR'), false)
  assert.equal(isWorkerDeleteRole('SUPERADMIN'), false)
  assert.equal(isWorkerDeleteRole('MANAGER'), false)
})

test('canonical worker roles keep OWNER separate and rename legacy KIEROWNIK to MANAGER', () => {
  assert.equal(normalizeWorkerRole('owner'), 'OWNER')
  assert.equal(normalizeWorkerRole('administrator'), 'ADMIN')
  assert.equal(normalizeWorkerRole('KIEROWNIK'), 'MANAGER')
  assert.equal(normalizeWorkerRole('koordynator'), 'COORDINATOR')
  assert.equal(normalizeWorkerRole('pracownik'), 'WORKER')
})

test('only full administrators can assign portal roles while managers keep existing roles', () => {
  assert.equal(canAssignWorkerRole('ADMIN', 'MANAGER', { creating: true }), true)
  assert.equal(canAssignWorkerRole('OWNER', 'ADMIN', { creating: true }), true)
  assert.equal(canAssignWorkerRole('MANAGER', 'WORKER', { creating: true }), true)
  assert.equal(canAssignWorkerRole('MANAGER', 'COORDINATOR', { creating: true }), false)
  assert.equal(canAssignWorkerRole('MANAGER', 'COORDINATOR', { currentRole: 'COORDINATOR' }), true)
  assert.equal(canAssignWorkerRole('MANAGER', 'ADMIN', { currentRole: 'WORKER' }), false)
  assert.equal(canAssignWorkerRole('ADMIN', 'OWNER', { creating: true }), false)
  assert.equal(canAssignWorkerRole('ADMIN', 'OWNER', { targetIsOwner: true }), true)
  assert.equal(canAssignWorkerRole('ADMIN', 'ADMIN', { targetIsOwner: true }), false)
})
