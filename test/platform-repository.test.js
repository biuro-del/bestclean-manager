'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  getDataConnectOperationOptions,
  preserveTenantMutationAuthors,
} = require('../platform-repository')

test('platform Data Connect reads impersonate an active tenant member', async () => {
  const calls = []
  const client = {
    async query(sql, params) {
      calls.push({ sql, params })
      return { rows: [{ uid: 'tenant-owner-uid', role: 'OWNER' }] }
    },
  }

  const options = await getDataConnectOperationOptions(client, {
    orgId: 'org1',
    kind: 'query',
  })

  assert.deepEqual(options, {
    impersonate: { authClaims: { sub: 'tenant-owner-uid' } },
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].params[0], 'org1')
  assert.ok(calls[0].params[1].includes('WORKER'))
})

test('platform Data Connect mutations use only a privileged tenant member', async () => {
  const client = {
    async query(_sql, params) {
      assert.deepEqual(params[1], ['OWNER', 'ADMIN', 'ADMINISTRATOR', 'SUPERADMIN'])
      return { rows: [{ uid: 'tenant-admin-uid', role: 'ADMIN' }] }
    },
  }

  const options = await getDataConnectOperationOptions(client, {
    orgId: 'org1',
    kind: 'mutation',
  })

  assert.equal(options.impersonate.authClaims.sub, 'tenant-admin-uid')
})

test('platform Data Connect fails clearly when an organization has no active actor', async () => {
  const client = { query: async () => ({ rows: [] }) }

  await assert.rejects(
    getDataConnectOperationOptions(client, { orgId: 'org1', kind: 'query' }),
    (error) => error?.publicCode === 'PLATFORM_DATACONNECT_ACTOR_MISSING' && error?.statusCode === 503,
  )
})

test('platform update preserves existing tenant author fields', async () => {
  const calls = []
  const client = {
    async query(sql, params) {
      calls.push({ sql, params })
      return { rows: [{ created_by_uid: 'tenant-creator', updated_by_uid: 'tenant-editor' }] }
    },
  }
  const result = await preserveTenantMutationAuthors(client, 'UpsertTaskForOrg', {
    orgId: 'org1',
    idTask: 'task1',
    createdByUid: null,
    updatedByUid: null,
    title: 'Zlecenie',
  })

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].params, ['org1', 'task1'])
  assert.deepEqual(result, {
    orgId: 'org1',
    idTask: 'task1',
    createdByUid: 'tenant-creator',
    updatedByUid: 'tenant-editor',
    title: 'Zlecenie',
  })
})

test('platform insert leaves tenant author fields empty', async () => {
  const client = { query: async () => ({ rows: [] }) }
  const result = await preserveTenantMutationAuthors(client, 'UpdateZoneForOrg', {
    orgId: 'org1',
    zoneId: 'zone1',
    editedBy: null,
  })

  assert.equal(result.editedBy, null)
})
