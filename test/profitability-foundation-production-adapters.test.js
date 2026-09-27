'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')

const adapters = require('../scripts/lib/profitability-foundation-production-adapters')

const strongPassword = 'A-random-ephemeral-password-1234567890!'

function createHandoffIamClient({
  bootstrap = 'profitability_bootstrap_123',
  footprint = { owned_count: 0, acl_count: 0, default_acl_count: 0 },
  memberships,
  queries = [],
} = {}) {
  return {
    async query(sql) {
      queries.push(sql)
      if (sql.includes("current_setting('server_version_num')")) {
        return {
          rows: [{
            database_name: 'iclean-room-database',
            server_version_num: 170010,
            in_recovery: false,
            transaction_read_only: 'off',
            default_transaction_read_only: 'off',
            bootstrap_grantor: 'cloudsqladmin',
            database_owner: 'cloudsqlsuperuser',
            schema_owner: 'firebaseowner_iclean-room-database_public',
          }],
        }
      }
      if (sql.includes('from pg_extension')) {
        return { rows: [{ extname: 'btree_gist', extversion: '1.7', schema_name: 'public' }] }
      }
      if (sql.includes('select rolname, rolcanlogin')) {
        return {
          rows: [{
            rolname: adapters.PROVISIONER_ROLE,
            rolcanlogin: true,
            rolinherit: false,
            rolsuper: false,
            rolcreatedb: false,
            rolcreaterole: true,
            rolreplication: false,
            rolbypassrls: false,
            rolconnlimit: -1,
            rolvaliduntil: null,
            rolconfig: null,
          }],
        }
      }
      if (sql.includes('from pg_auth_members membership')) {
        return {
          rows: memberships || [{
            granted_role: 'cloudsqlsuperuser',
            member_role: bootstrap,
            grantor_role: 'cloudsqladmin',
            admin_option: false,
            inherit_option: true,
            set_option: true,
          }],
        }
      }
      if (sql.includes('from information_schema.tables')) return { rows: [] }
      if (sql.includes('from pg_database database_row')) {
        return {
          rows: [{
            grantee: adapters.PROVISIONER_ROLE,
            privilege_type: 'CONNECT',
            is_grantable: true,
            grantor: 'cloudsqlsuperuser',
          }],
        }
      }
      if (sql.includes('from pg_namespace namespace_row')) {
        return {
          rows: [
            {
              grantee: adapters.PROVISIONER_ROLE,
              privilege_type: 'CREATE',
              is_grantable: true,
              grantor: 'firebaseowner_iclean-room-database_public',
            },
            {
              grantee: adapters.PROVISIONER_ROLE,
              privilege_type: 'USAGE',
              is_grantable: true,
              grantor: 'firebaseowner_iclean-room-database_public',
            },
          ],
        }
      }
      if (sql.includes('default_acl_owners')) return { rows: [footprint] }
      throw new Error(`unexpected query: ${sql}`)
    },
    async end() {},
  }
}

test('Cloud SQL adapter is read-only by default and never returns the bootstrap password', async () => {
  let requests = 0
  const adapter = adapters.createCloudSqlAdminApiAdapter({
    projectId: 'iclean-room',
    instanceId: 'iclean-room-instance',
    request: async () => {
      requests += 1
      return { data: { items: [] } }
    },
  })

  await assert.rejects(
    adapter.createEphemeralBuiltinUser({ name: 'temporary_bootstrap', password: strongPassword }),
    /CLOUD_SQL_CREATE_OPT_IN_REQUIRED/,
  )
  await assert.rejects(
    adapter.deleteEphemeralBuiltinUser({ name: 'temporary_bootstrap' }),
    /CLOUD_SQL_DELETE_OPT_IN_REQUIRED/,
  )
  assert.equal(requests, 0)
})

test('Cloud SQL users.update is opt-in, targets the exact provisioner and never returns its password', async () => {
  const calls = []
  const adapter = adapters.createCloudSqlAdminApiAdapter({
    projectId: 'iclean-room',
    instanceId: 'iclean-room-instance',
    sleep: async () => {},
    request: async ({ method, url, data }) => {
      calls.push({ method, url, data })
      if (method === 'GET' && url.endsWith('/users')) {
        return {
          data: {
            items: [{ name: 'profitability_provisioner', type: 'BUILT_IN', host: '' }],
          },
        }
      }
      if (method === 'PUT') {
        return { data: { name: 'update-provisioner-op', status: 'PENDING' } }
      }
      if (method === 'GET' && url.includes('/operations/')) {
        return { data: { name: 'update-provisioner-op', status: 'DONE' } }
      }
      throw new Error('unexpected request')
    },
  })

  await assert.rejects(
    adapter.updateBuiltinUserPassword({
      name: 'profitability_provisioner',
      password: strongPassword,
    }),
    /CLOUD_SQL_PASSWORD_UPDATE_OPT_IN_REQUIRED/,
  )

  const result = await adapter.updateBuiltinUserPassword({
    name: 'profitability_provisioner',
    password: strongPassword,
    mutate: true,
  })
  assert.deepEqual(result, {
    status: 'updated',
    operation: { name: 'update-provisioner-op', status: 'DONE' },
  })
  const update = calls.find((call) => call.method === 'PUT')
  assert.match(update.url, /\/users\?name=profitability_provisioner$/)
  assert.deepEqual(update.data, {
    name: 'profitability_provisioner',
    password: strongPassword,
  })
  assert.equal(JSON.stringify(result).includes(strongPassword), false)
})

test('ambiguous Cloud SQL users.update exposes only operation metadata for containment settlement', async () => {
  let clock = 0
  let terminal = false
  const adapter = adapters.createCloudSqlAdminApiAdapter({
    projectId: 'iclean-room',
    instanceId: 'iclean-room-instance',
    now: () => clock,
    sleep: async () => { clock += 1 },
    request: async ({ method, url }) => {
      if (method === 'GET' && url.endsWith('/users')) {
        return {
          data: {
            items: [{ name: 'profitability_provisioner', type: 'BUILT_IN', host: '' }],
          },
        }
      }
      if (method === 'PUT') {
        return { data: { name: 'update-ambiguous-op', status: 'PENDING' } }
      }
      if (method === 'GET' && url.includes('/operations/')) {
        return {
          data: {
            name: 'update-ambiguous-op',
            status: terminal ? 'DONE' : 'PENDING',
          },
        }
      }
      throw new Error('unexpected request')
    },
  })

  let failure
  try {
    await adapter.updateBuiltinUserPassword({
      name: 'profitability_provisioner',
      password: strongPassword,
      mutate: true,
      operationTimeoutMs: 1,
      operationPollIntervalMs: 1,
    })
  } catch (error) {
    failure = error
  }
  assert.equal(failure?.message, 'CLOUD_SQL_PASSWORD_UPDATE_AMBIGUOUS')
  assert.deepEqual(failure?.cloudSqlOperation, {
    name: 'update-ambiguous-op',
    status: 'PENDING',
  })
  assert.equal(failure.message.includes(strongPassword), false)

  terminal = true
  const settlement = await adapter.settleBuiltinUserPasswordUpdate({
    operationName: failure.cloudSqlOperation.name,
  })
  assert.deepEqual(settlement, {
    terminal: true,
    succeeded: true,
    operationName: 'update-ambiguous-op',
  })
})

test('Cloud SQL adapter creates and deletes an ephemeral BUILT_IN user with operation polling', async () => {
  const calls = []
  let present = false
  const request = async ({ method, url, data }) => {
    calls.push({ method, url, data })
    if (method === 'POST') {
      assert.deepEqual(data, {
        name: 'profitability_bootstrap_123',
        password: strongPassword,
        type: 'BUILT_IN',
      })
      present = true
      return { data: { name: 'create-op', status: 'PENDING' } }
    }
    if (method === 'DELETE') {
      present = false
      return { data: { name: 'delete-op', status: 'PENDING' } }
    }
    if (url.includes('/operations/')) return { data: { name: 'op', status: 'DONE' } }
    if (url.endsWith('/users')) {
      return {
        data: {
          items: present
            ? [{ name: 'profitability_bootstrap_123', type: 'BUILT_IN', host: '' }]
            : [],
        },
      }
    }
    throw new Error('unexpected request')
  }
  const adapter = adapters.createCloudSqlAdminApiAdapter({
    projectId: 'iclean-room',
    instanceId: 'iclean-room-instance',
    request,
    sleep: async () => {},
  })

  const created = await adapter.createEphemeralBuiltinUser({
    name: 'profitability_bootstrap_123',
    password: strongPassword,
    mutate: true,
  })
  assert.equal(created.status, 'created')
  assert.equal(created.user.name, 'profitability_bootstrap_123')
  assert.equal(JSON.stringify(created).includes(strongPassword), false)

  const deleted = await adapter.deleteEphemeralBuiltinUser({
    name: 'profitability_bootstrap_123',
    mutate: true,
  })
  assert.equal(deleted.status, 'deleted')
  assert.equal(present, false)
  const deleteCall = calls.find((call) => call.method === 'DELETE')
  assert.match(deleteCall.url, /name=profitability_bootstrap_123/)
  assert.equal(deleteCall.url.includes('host='), false)
})

test('Cloud SQL recognizes and deletes the exact generated PostgreSQL user when type and host are omitted', async () => {
  const userName = 'profitability_bootstrap_mui6yj06'
  let present = false
  let deleteUrl = null
  const adapter = adapters.createCloudSqlAdminApiAdapter({
    projectId: 'iclean-room',
    instanceId: 'iclean-room-instance',
    request: async ({ method, url }) => {
      if (method === 'POST') {
        present = true
        return { data: { name: 'create-blank-type', status: 'DONE' } }
      }
      if (method === 'DELETE') {
        deleteUrl = url
        present = false
        return { data: { name: 'delete-blank-type', status: 'DONE' } }
      }
      if (method === 'GET' && url.endsWith('/users')) {
        return {
          data: {
            items: present ? [{ name: userName, type: null, host: '' }] : [],
          },
        }
      }
      throw new Error('unexpected request')
    },
  })

  const created = await adapter.createEphemeralBuiltinUser({
    name: userName,
    password: strongPassword,
    mutate: true,
  })
  assert.equal(created.status, 'created')
  assert.equal(created.user.name, userName)

  const deleted = await adapter.deleteEphemeralBuiltinUser({ name: userName, mutate: true })
  assert.equal(deleted.status, 'deleted')
  assert.equal(present, false)
  assert.match(deleteUrl, new RegExp(`name=${userName}`))
  assert.equal(deleteUrl.includes('host='), false)
})

test('Cloud SQL blank-type normalization fails closed for conflicting type, prefix or host', async () => {
  const cases = [
    {
      requested: 'profitability_bootstrap_wrongtype',
      user: { name: 'profitability_bootstrap_wrongtype', type: 'CLOUD_IAM_USER', host: '' },
    },
    {
      requested: 'profitability_temp_wrongprefix',
      user: { name: 'profitability_temp_wrongprefix', type: null, host: '' },
    },
    {
      requested: 'profitability_bootstrap_wronghost',
      user: { name: 'profitability_bootstrap_wronghost', type: null, host: '%' },
    },
    {
      requested: 'profitability_temp_explicitbuiltin',
      user: { name: 'profitability_temp_explicitbuiltin', type: 'BUILT_IN', host: '' },
    },
    {
      requested: 'profitability_bootstrap_explicitbuiltinhost',
      user: {
        name: 'profitability_bootstrap_explicitbuiltinhost',
        type: 'BUILT_IN',
        host: '%',
      },
    },
    {
      requested: 'profitability_bootstrap_duplicate',
      users: [
        { name: 'profitability_bootstrap_duplicate', type: 'BUILT_IN', host: '' },
        { name: 'profitability_bootstrap_duplicate', type: null, host: '' },
      ],
      error: 'CLOUD_SQL_USER_STATE_AMBIGUOUS',
    },
  ]
  for (const scenario of cases) {
    let postCalls = 0
    let deleteCalls = 0
    const adapter = adapters.createCloudSqlAdminApiAdapter({
      projectId: 'iclean-room',
      instanceId: 'iclean-room-instance',
      request: async ({ method }) => {
        if (method === 'POST') postCalls += 1
        if (method === 'DELETE') deleteCalls += 1
        return { data: { items: scenario.users || [scenario.user] } }
      },
    })

    await assert.rejects(
      adapter.createEphemeralBuiltinUser({
        name: scenario.requested,
        password: strongPassword,
        mutate: true,
      }),
      new RegExp(scenario.error || 'CLOUD_SQL_USER_STATE_CONFLICT'),
    )
    assert.equal(postCalls, 0)
    await assert.rejects(
      adapter.deleteEphemeralBuiltinUser({ name: scenario.requested, mutate: true }),
      new RegExp(scenario.error || 'CLOUD_SQL_USER_STATE_CONFLICT'),
    )
    assert.equal(deleteCalls, 0)
  }
})

test('Cloud Run revision inspection uses the service-scoped v2 resource URL', async () => {
  const calls = []
  const adapter = adapters.createCloudSqlAdminApiAdapter({
    projectId: 'iclean-room',
    instanceId: 'iclean-room-instance',
    request: async (request) => {
      calls.push(request)
      return { data: { name: 'revision' } }
    },
  })

  await adapter.inspectCloudRunRevision({
    region: 'europe-west4',
    service: 'cleanzi-01',
    revision: 'projects/iclean-room/locations/europe-west4/services/cleanzi-01/revisions/cleanzi-01-00042-abc',
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'GET')
  assert.equal(calls[0].timeout, 30000)
  assert.equal(calls[0].signal instanceof AbortSignal, true)
  assert.equal(
    calls[0].url,
    'https://run.googleapis.com/v2/projects/iclean-room/locations/europe-west4/services/cleanzi-01/revisions/cleanzi-01-00042-abc',
  )
})

test('Google auth client acquisition is bounded and exposes only a safe adapter error', async () => {
  const rawSecret = 'raw-auth-acquisition-secret'
  const adapter = adapters.createCloudSqlAdminApiAdapter({
    projectId: 'iclean-room',
    instanceId: 'iclean-room-instance',
    requestTimeoutMs: 5,
    auth: {
      getClient() {
        const pending = new Promise(() => {})
        pending.rawSecret = rawSecret
        return pending
      },
    },
  })

  await assert.rejects(adapter.inspectInstance(), (error) => {
    assert.equal(error.message, 'CLOUD_SQL_ADMIN_REQUEST_FAILED')
    assert.equal(JSON.stringify(error).includes(rawSecret), false)
    return true
  })
})

test('Google auth client acquisition is cached and reused after one successful acquire', async () => {
  let acquisitions = 0
  let requests = 0
  const authClient = {
    async request(requestOptions) {
      requests += 1
      assert.equal(requestOptions.timeout, 25)
      assert.equal(requestOptions.signal instanceof AbortSignal, true)
      return { data: { name: `response-${requests}` } }
    },
  }
  const adapter = adapters.createCloudSqlAdminApiAdapter({
    projectId: 'iclean-room',
    instanceId: 'iclean-room-instance',
    requestTimeoutMs: 25,
    auth: {
      async getClient() {
        acquisitions += 1
        return authClient
      },
    },
  })

  assert.equal((await adapter.inspectInstance()).name, 'response-1')
  assert.equal((await adapter.inspectBackupRun('1790402094445')).name, 'response-2')
  assert.equal(acquisitions, 1)
  assert.equal(requests, 2)
})

test('Google Cloud GET is bounded even when the request implementation ignores AbortSignal', async () => {
  let captured = null
  const adapter = adapters.createCloudSqlAdminApiAdapter({
    projectId: 'iclean-room',
    instanceId: 'iclean-room-instance',
    requestTimeoutMs: 5,
    request: async (requestOptions) => {
      captured = requestOptions
      return new Promise(() => {})
    },
  })

  await assert.rejects(adapter.inspectInstance(), /CLOUD_SQL_ADMIN_REQUEST_FAILED/)
  assert.equal(captured.timeout, 5)
  assert.equal(captured.signal instanceof AbortSignal, true)
  assert.equal(captured.signal.aborted, true)
  assert.throws(
    () => adapters.createCloudSqlAdminApiAdapter({
      projectId: 'iclean-room',
      instanceId: 'iclean-room-instance',
      requestTimeoutMs: 30001,
    }),
    /GOOGLE_CLOUD_REQUEST_TIMEOUT_INVALID/,
  )
})

test('ordinary Google Cloud requests stop on the top-level abort even if invoke hangs', async () => {
  const cancellation = new AbortController()
  let captured = null
  const adapter = adapters.createCloudSqlAdminApiAdapter({
    projectId: 'iclean-room',
    instanceId: 'iclean-room-instance',
    requestTimeoutMs: 1000,
    signal: cancellation.signal,
    request: async (requestOptions) => {
      captured = requestOptions
      return new Promise(() => {})
    },
  })

  const pending = adapter.inspectInstance()
  await new Promise((resolve) => setImmediate(resolve))
  cancellation.abort()
  await assert.rejects(pending, /CLOUD_SQL_ADMIN_REQUEST_FAILED/)
  assert.equal(captured.signal.aborted, true)
})

test('timed-out Cloud SQL CREATE is ambiguous and remains cleanup-required', async () => {
  let postRequest = null
  const adapter = adapters.createCloudSqlAdminApiAdapter({
    projectId: 'iclean-room',
    instanceId: 'iclean-room-instance',
    requestTimeoutMs: 5,
    request: async (requestOptions) => {
      if (requestOptions.method === 'POST') {
        postRequest = requestOptions
        return new Promise(() => {})
      }
      if (requestOptions.method === 'GET' && requestOptions.url.endsWith('/users')) {
        return { data: { items: [] } }
      }
      throw new Error('unexpected request')
    },
  })

  await assert.rejects(
    adapter.createEphemeralBuiltinUser({
      name: 'profitability_bootstrap_timeout',
      password: strongPassword,
      mutate: true,
      reconciliationTimeoutMs: 0,
      reconciliationPollIntervalMs: 1,
    }),
    (error) => {
      assert.equal(error.message, 'CLOUD_SQL_EPHEMERAL_USER_CREATE_AMBIGUOUS_PENDING')
      assert.equal(error.cleanupRequired, true)
      return true
    },
  )
  assert.equal(postRequest.timeout, 5)
  assert.equal(postRequest.signal.aborted, true)
})

test('cleanup uses a fresh bounded request after the main signal is already aborted', async () => {
  const cancellation = new AbortController()
  cancellation.abort()
  let present = true
  let deleteRequest = null
  let acquisitions = 0
  const request = async (requestOptions) => {
    if (requestOptions.method === 'GET' && requestOptions.url.endsWith('/users')) {
      return {
        data: {
          items: present
            ? [{ name: 'profitability_bootstrap_cleanup', type: 'BUILT_IN' }]
            : [],
        },
      }
    }
    if (requestOptions.method === 'DELETE') {
      deleteRequest = requestOptions
      present = false
      return new Promise(() => {})
    }
    throw new Error('unexpected request')
  }
  const adapter = adapters.createCloudSqlAdminApiAdapter({
    projectId: 'iclean-room',
    instanceId: 'iclean-room-instance',
    requestTimeoutMs: 5,
    signal: cancellation.signal,
    auth: {
      async getClient() {
        acquisitions += 1
        return { request }
      },
    },
  })

  const result = await adapter.deleteEphemeralBuiltinUser({
    name: 'profitability_bootstrap_cleanup',
    mutate: true,
  })
  assert.deepEqual(result, { status: 'deleted-reconciled', user: null })
  assert.equal(deleteRequest.timeout, 5)
  assert.equal(deleteRequest.signal.aborted, true)
  assert.equal(present, false)
  assert.equal(acquisitions, 1)
})

test('Cloud SQL adapter aborts after an ambiguous create while preserving cleanup evidence', async () => {
  let present = false
  const adapter = adapters.createCloudSqlAdminApiAdapter({
    projectId: 'iclean-room',
    instanceId: 'iclean-room-instance',
    request: async ({ method }) => {
      if (method === 'POST') {
        present = true
        const error = new Error(`network failure ${strongPassword}`)
        error.response = { status: 503, config: { data: { password: strongPassword } } }
        throw error
      }
      return {
        data: {
          items: present
            ? [{ name: 'profitability_bootstrap_456', type: 'BUILT_IN' }]
            : [],
        },
      }
    },
  })

  await assert.rejects(
    adapter.createEphemeralBuiltinUser({
      name: 'profitability_bootstrap_456',
      password: strongPassword,
      mutate: true,
    }),
    (error) => {
      assert.equal(error.message, 'CLOUD_SQL_EPHEMERAL_USER_CREATE_AMBIGUOUS_PRESENT')
      assert.equal(error.cleanupRequired, true)
      assert.equal(error.message.includes(strongPassword), false)
      return true
    },
  )
  assert.equal(present, true)
})

test('Cloud SQL create timeout polls reconciliation and preserves cleanup for a late user', async () => {
  let clock = 0
  let userReads = 0
  let operationReads = 0
  const adapter = adapters.createCloudSqlAdminApiAdapter({
    projectId: 'iclean-room',
    instanceId: 'iclean-room-instance',
    now: () => clock,
    sleep: async () => { clock += 1 },
    request: async ({ method, url }) => {
      if (method === 'POST') return { data: { name: 'create-late', status: 'PENDING' } }
      if (url.includes('/operations/')) {
        operationReads += 1
        return { data: { name: 'create-late', status: 'PENDING' } }
      }
      if (url.endsWith('/users')) {
        userReads += 1
        return {
          data: {
            items: userReads >= 3
              ? [{ name: 'profitability_bootstrap_late', type: 'BUILT_IN' }]
              : [],
          },
        }
      }
      throw new Error('unexpected request')
    },
  })

  await assert.rejects(
    adapter.createEphemeralBuiltinUser({
      name: 'profitability_bootstrap_late',
      password: strongPassword,
      mutate: true,
      operationTimeoutMs: 1,
      operationPollIntervalMs: 1,
      reconciliationTimeoutMs: 5,
      reconciliationPollIntervalMs: 1,
    }),
    (error) => {
      assert.equal(error.message, 'CLOUD_SQL_EPHEMERAL_USER_CREATE_AMBIGUOUS_PRESENT')
      assert.equal(error.cleanupRequired, true)
      assert.deepEqual(error.cloudSqlOperation, { name: 'create-late', status: 'PENDING' })
      return true
    },
  )
  assert.equal(operationReads >= 1, true)
  assert.equal(userReads >= 3, true)
})

test('pending CREATE operation cannot be reconciled as safe absence before a late user appears', async () => {
  let clock = 0
  let operationReads = 0
  let userReads = 0
  const adapter = adapters.createCloudSqlAdminApiAdapter({
    projectId: 'iclean-room',
    instanceId: 'iclean-room-instance',
    now: () => clock,
    sleep: async () => { clock += 1 },
    request: async ({ method, url }) => {
      if (method === 'POST') return { data: { name: 'late-create-op', status: 'PENDING' } }
      if (url.includes('/operations/')) {
        operationReads += 1
        return { data: { name: 'late-create-op', status: 'PENDING' } }
      }
      if (url.endsWith('/users')) {
        userReads += 1
        return {
          data: {
            items: userReads >= 4
              ? [{ name: 'profitability_bootstrap_lateterminal', type: 'BUILT_IN' }]
              : [],
          },
        }
      }
      throw new Error('unexpected request')
    },
  })

  let createFailure
  try {
    await adapter.createEphemeralBuiltinUser({
      name: 'profitability_bootstrap_lateterminal',
      password: strongPassword,
      mutate: true,
      operationTimeoutMs: 1,
      operationPollIntervalMs: 1,
      reconciliationTimeoutMs: 1,
      reconciliationPollIntervalMs: 1,
    })
  } catch (error) {
    createFailure = error
  }
  assert.deepEqual(createFailure?.cloudSqlOperation, {
    name: 'late-create-op',
    status: 'PENDING',
  })

  const settlement = await adapter.settleCreateOperation({
    name: 'profitability_bootstrap_lateterminal',
    operationName: createFailure.cloudSqlOperation.name,
    timeoutMs: 2,
    pollIntervalMs: 1,
  })
  assert.deepEqual(settlement, {
    operationName: 'late-create-op',
    status: 'PENDING',
    terminal: false,
    succeeded: false,
    effectConfirmed: false,
  })
  assert.equal((await adapter.inspectBuiltinUser('profitability_bootstrap_lateterminal'))?.name,
    'profitability_bootstrap_lateterminal')
  assert.equal(operationReads >= 2, true)
})

test('Cloud SQL unresolved create remains cleanup-required and fails closed', async () => {
  let clock = 0
  const adapter = adapters.createCloudSqlAdminApiAdapter({
    projectId: 'iclean-room',
    instanceId: 'iclean-room-instance',
    now: () => clock,
    sleep: async () => { clock += 1 },
    request: async ({ method, url }) => {
      if (method === 'POST') throw new Error('ambiguous transport failure')
      if (url.endsWith('/users')) return { data: { items: [] } }
      throw new Error('unexpected request')
    },
  })

  await assert.rejects(
    adapter.createEphemeralBuiltinUser({
      name: 'profitability_bootstrap_pending',
      password: strongPassword,
      mutate: true,
      reconciliationTimeoutMs: 2,
      reconciliationPollIntervalMs: 1,
    }),
    (error) => {
      assert.equal(error.message, 'CLOUD_SQL_EPHEMERAL_USER_CREATE_AMBIGUOUS_PENDING')
      assert.equal(error.cleanupRequired, true)
      return true
    },
  )
})

test('Cloud SQL PG adapter separates IAM and PASSWORD authentication and closes connector once', async () => {
  const connectorCalls = []
  const clientConfigs = []
  let closeCount = 0
  class FakeConnector {
    async getOptions(config) {
      connectorCalls.push(config)
      return { host: 'connector-host', port: 5432 }
    }
    async close() { closeCount += 1 }
  }
  class FakeClient {
    constructor(config) { clientConfigs.push(config) }
    async connect() { this.connected = true }
  }
  const adapter = adapters.createCloudSqlPgAdapter({
    instanceConnectionName: 'iclean-room:europe-west3:iclean-room-instance',
    ConnectorClass: FakeConnector,
    ClientClass: FakeClient,
  })

  await adapter.connectIamAdmin({
    database: 'iclean-room-database',
    user: 'biuro@bestclean.pl',
  })
  await adapter.connectBuiltin({
    database: 'iclean-room-database',
    user: 'profitability_provisioner',
    password: strongPassword,
  })
  assert.equal(connectorCalls.length, 2)
  assert.equal(clientConfigs[0].password, undefined)
  assert.equal(clientConfigs[1].password, strongPassword)
  await adapter.close()
  await adapter.close()
  assert.equal(closeCount, 1)
  await assert.rejects(
    adapter.connectIamAdmin({ database: 'iclean-room-database', user: 'admin' }),
    /CLOUD_SQL_CONNECTOR_ALREADY_CLOSED/,
  )
})

test('Cloud SQL PG adapter bounds queries and interrupts the underlying client exactly once', async () => {
  const clients = []
  class FakeConnector {
    async getOptions() { return { host: 'connector-host', port: 5432 } }
    async close() {}
  }
  class FakeClient {
    constructor(config) {
      this.config = config
      this.endCount = 0
      clients.push(this)
    }
    async connect() {}
    async query() { return new Promise(() => {}) }
    async end() { this.endCount += 1 }
  }
  const adapter = adapters.createCloudSqlPgAdapter({
    instanceConnectionName: 'iclean-room:europe-west3:iclean-room-instance',
    ConnectorClass: FakeConnector,
    ClientClass: FakeClient,
    queryTimeoutMs: 5,
  })
  const client = await adapter.connectBuiltin({
    database: 'iclean-room-database',
    user: 'profitability_migration_executor',
    password: strongPassword,
  })

  await assert.rejects(client.query('select pg_sleep(60)'), /PG_QUERY_TIMEOUT/)
  await client.end()
  assert.equal(clients[0].endCount, 1)
  assert.equal(clients[0].config.connectionTimeoutMillis, 30000)
  assert.equal(clients[0].config.query_timeout, 5)
  assert.equal(clients[0].config.statement_timeout, 5)
})

test('Cloud SQL PG adapter propagates abort, while a containment connection stays independently bounded', async () => {
  const controller = new AbortController()
  const clients = []
  class FakeConnector {
    async getOptions() { return { host: 'connector-host', port: 5432 } }
    async close() {}
  }
  class FakeClient {
    constructor() {
      this.endCount = 0
      clients.push(this)
    }
    async connect() {}
    async query() { return { rows: [{ ok: true }] } }
    async end() { this.endCount += 1 }
  }
  const adapter = adapters.createCloudSqlPgAdapter({
    instanceConnectionName: 'iclean-room:europe-west3:iclean-room-instance',
    ConnectorClass: FakeConnector,
    ClientClass: FakeClient,
    signal: controller.signal,
    connectTimeoutMs: 50,
    queryTimeoutMs: 50,
  })
  const ordinary = await adapter.connectBuiltin({
    database: 'iclean-room-database',
    user: 'profitability_migration_executor',
    password: strongPassword,
  })
  controller.abort()
  await assert.rejects(ordinary.query('select 1'), /PG_QUERY_ABORTED/)
  await Promise.resolve()
  assert.equal(clients[0].endCount, 1)

  const containment = await adapter.connectBuiltin({
    database: 'iclean-room-database',
    user: 'profitability_provisioner',
    password: strongPassword,
    containment: true,
  })
  assert.deepEqual(await containment.query('select 1'), { rows: [{ ok: true }] })
  await containment.end()
  assert.equal(clients[1].endCount, 1)
})

test('fresh-state evaluation fails closed on role, table, extension and server drift', () => {
  const baseline = {
    server: {
      database_name: 'iclean-room-database',
      server_version_num: 170010,
      in_recovery: false,
      transaction_read_only: 'off',
      default_transaction_read_only: 'off',
    },
    extension: { extversion: '1.7', schema_name: 'public' },
    roles: [],
    memberships: [],
    tables: [],
    databaseAcl: [],
    schemaAcl: [],
  }
  assert.deepEqual(
    adapters.evaluateFreshFoundationState(baseline, { expectedDatabase: 'iclean-room-database' }),
    { ready: true, problems: [] },
  )
  const drifted = {
    ...baseline,
    server: { ...baseline.server, in_recovery: true },
    extension: { extversion: '1.6', schema_name: 'public' },
    roles: [{ rolname: adapters.PROVISIONER_ROLE }],
    tables: ['service_object'],
  }
  const result = adapters.evaluateFreshFoundationState(drifted, {
    expectedDatabase: 'iclean-room-database',
  })
  assert.equal(result.ready, false)
  assert.deepEqual(result.problems, [
    'PRIMARY_REQUIRED',
    'BTREE_GIST_MISMATCH',
    'TARGET_ROLES_ALREADY_EXIST',
    'FOUNDATION_TABLES_ALREADY_EXIST',
  ])
})

test('provisioner creation passes password only as a bound value and rolls back on failure', async () => {
  const queries = []
  const client = {
    async query(sql, values) {
      queries.push({ sql, values })
      return { rows: [] }
    },
  }
  await assert.rejects(
    adapters.createProvisionerViaBootstrap(client, { password: strongPassword }),
    /PROVISIONER_CREATE_OPT_IN_REQUIRED/,
  )
  await adapters.createProvisionerViaBootstrap(client, {
    password: strongPassword,
    mutate: true,
  })
  assert.deepEqual(queries.map(({ sql }) => sql.trim()).slice(0, 2), [
    'begin',
    'select set_config($1, $2, true)',
  ])
  assert.deepEqual(queries[1].values, [adapters.PASSWORD_GUC, strongPassword])
  assert.equal(queries.some(({ sql }) => sql.includes(strongPassword)), false)
  assert.equal(queries.at(-1).sql, 'commit')

  const failingQueries = []
  const failingClient = {
    async query(sql) {
      failingQueries.push(sql)
      if (sql.includes('do $create_profitability_provisioner$')) throw new Error('boom')
      return { rows: [] }
    },
  }
  await assert.rejects(
    adapters.createProvisionerViaBootstrap(failingClient, {
      password: strongPassword,
      mutate: true,
    }),
    /boom/,
  )
  assert.equal(failingQueries.at(-1), 'rollback')
})

test('ACL and password operations require explicit mutation and use bounded identifiers', async () => {
  const queries = []
  const client = { async query(sql, values) { queries.push({ sql, values }); return { rows: [] } } }
  await assert.rejects(
    adapters.grantProvisionerDatabaseAcl(client, { database: 'iclean-room-database' }),
    /DATABASE_ACL_GRANT_OPT_IN_REQUIRED/,
  )
  await adapters.grantProvisionerDatabaseAcl(client, {
    database: 'iclean-room-database',
    mutate: true,
  })
  await adapters.grantProvisionerSchemaAcl(client, { mutate: true })
  await adapters.setRolePassword(client, {
    role: 'profitability_migration_executor',
    password: strongPassword,
    mutate: true,
  })
  await adapters.lockRolePassword(client, {
    role: 'profitability_migration_executor',
    mutate: true,
  })
  assert.match(queries[0].sql, /grant connect on database "iclean-room-database"/)
  assert.match(queries[1].sql, /grant usage, create on schema "public"/)
  assert.equal(queries.some(({ sql }) => sql.includes(strongPassword)), false)
  assert.equal(
    queries.some(({ values }) => Array.isArray(values) && values.includes(strongPassword)),
    true,
  )
  await assert.rejects(
    adapters.lockRolePassword(client, { role: 'unsafe; drop role x', mutate: true }),
    /UNSAFE_IDENTIFIER/,
  )
})

test('source REFERENCES handoff grants only the nine required columns and no table privilege', async () => {
  const owner = 'firebaseowner_iclean-room-database_public'
  const queries = []
  let granted = false
  const expectedColumnRows = adapters.SOURCE_REFERENCE_COLUMNS.flatMap(({ table, columns }) => (
    columns.map((column) => ({
      table_name: table,
      column_name: column,
      privilege_type: 'REFERENCES',
      is_grantable: false,
      grantor_name: owner,
    }))
  ))
  const client = {
    async query(sql, values) {
      queries.push({ sql, values })
      if (sql.includes('count(*)::integer as role_count')) {
        return { rows: [{ role_count: 1 }] }
      }
      if (sql.includes('owner_role.rolname as owner_name')) {
        return {
          rows: adapters.SOURCE_TABLES.map((table_name) => ({
            table_name,
            owner_name: owner,
          })),
        }
      }
      if (sql.includes('relation_row.relacl')) return { rows: [] }
      if (sql.includes('attribute_row.attacl')) {
        return { rows: granted ? expectedColumnRows : [] }
      }
      if (sql.includes('pg_has_role(session_user')) {
        return { rows: [{ direct_session: true, may_set_owner: true }] }
      }
      if (/^grant references/i.test(sql.trim())) {
        granted = true
        return { rows: [] }
      }
      return { rows: [] }
    },
  }

  await assert.rejects(
    adapters.grantOwnerSourceReferenceAcl(client, {
      role: 'profitability_owner',
      expectedOwner: owner,
    }),
    /SOURCE_REFERENCE_GRANT_OPT_IN_REQUIRED/,
  )
  const result = await adapters.grantOwnerSourceReferenceAcl(client, {
    role: 'profitability_owner',
    expectedOwner: owner,
    mutate: true,
  })
  assert.equal(result.exact, true)
  assert.equal(result.tableAclCount, 0)
  assert.equal(result.columnAclCount, 9)
  assert.equal(queries.filter(({ sql }) => /^grant references/i.test(sql.trim())).length, 5)
  assert.equal(queries.some(({ sql }) => /grant select/i.test(sql)), false)
  assert.equal(queries.some(({ sql }) => /with grant option/i.test(sql)), false)
  assert.equal(queries.at(-1).sql, 'commit')
})

test('source REFERENCES handoff rolls back on any pre-existing direct ACL drift', async () => {
  const owner = 'firebaseowner_iclean-room-database_public'
  const queries = []
  const client = {
    async query(sql) {
      queries.push(sql)
      if (sql.includes('count(*)::integer as role_count')) {
        return { rows: [{ role_count: 1 }] }
      }
      if (sql.includes('owner_role.rolname as owner_name')) {
        return {
          rows: adapters.SOURCE_TABLES.map((table_name) => ({ table_name, owner_name: owner })),
        }
      }
      if (sql.includes('relation_row.relacl')) {
        return {
          rows: [{
            table_name: 'organizations',
            privilege_type: 'SELECT',
            is_grantable: false,
            grantor_name: owner,
          }],
        }
      }
      if (sql.includes('attribute_row.attacl')) return { rows: [] }
      return { rows: [] }
    },
  }
  await assert.rejects(
    adapters.grantOwnerSourceReferenceAcl(client, {
      role: 'profitability_owner',
      expectedOwner: owner,
      mutate: true,
    }),
    /SOURCE_REFERENCE_ACL_PARTIAL_OR_UNEXPECTED/,
  )
  assert.equal(queries.includes('rollback'), true)
  assert.equal(queries.some((sql) => /^grant references/i.test(sql.trim())), false)
})

function createProxyTestChild(onKill = (child) => queueMicrotask(() => child.emit('close', 0, 'SIGTERM'))) {
  const child = new EventEmitter()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.kills = []
  child.kill = (signal) => {
    child.kills.push(signal)
    onKill(child, signal)
    return true
  }
  return child
}

function validProxyAdapterOptions(overrides = {}) {
  return {
    proxyPath: 'C:\\trusted\\cloud-sql-proxy.x64.exe',
    platform: 'win32',
    arch: 'x64',
    statFile: async () => ({ isFile: () => true }),
    sha256File: async () => adapters.CLOUD_SQL_PROXY_SHA256,
    runVersion: async () => ({
      stdout: `cloud-sql-proxy version ${adapters.CLOUD_SQL_PROXY_VERSION}`,
      stderr: '',
    }),
    reservePorts: async () => ({ dataPort: 65431, healthPort: 65432 }),
    requestHealth: async () => 200,
    ...overrides,
  }
}

test('Cloud SQL proxy pins binary, exact instance and argv while sanitizing inherited environment', async () => {
  const invocations = []
  const versionCalls = []
  const child = createProxyTestChild()
  const adapter = adapters.createCloudSqlAuthProxyAdapter(validProxyAdapterOptions({
    environment: {
      PATH: 'safe-path',
      USERPROFILE: 'C:\\Users\\safe',
      PROFITABILITY_PSQL_HOST: 'attacker.example',
      PROFITABILITY_PSQL_PORT: '9999',
      CSQL_PROXY_PORT: '7777',
      CSQL_PROXY_AUTO_IAM_AUTHN: 'true',
      PGHOST: 'attacker.example',
      PGPASSWORD: 'must-not-leak',
      SENTINEL_SECRET: 'must-not-leak',
    },
    runVersion: async (command, args, options) => {
      versionCalls.push({ command, args, options })
      return { stdout: 'cloud-sql-proxy version 2.25.4', stderr: '' }
    },
    spawn: (command, args, options) => {
      invocations.push({ command, args, options })
      return child
    },
  }))

  const first = await adapter.prepare()
  const second = await adapter.prepare()
  assert.deepEqual(first, { host: '127.0.0.1', port: 65431 })
  assert.equal(second, first)
  assert.equal(invocations.length, 1)
  assert.equal(versionCalls.length, 1)
  assert.equal(versionCalls[0].command, path.resolve('C:\\trusted\\cloud-sql-proxy.x64.exe'))
  assert.deepEqual(versionCalls[0].args, ['--version'])
  assert.deepEqual(invocations[0].args, [
    '--address=127.0.0.1',
    '--port=65431',
    '--health-check',
    '--http-address=127.0.0.1',
    '--http-port=65432',
    '--max-connections=1',
    '--max-sigterm-delay=5s',
    '--structured-logs',
    '--quiet',
    'iclean-room:europe-west3:iclean-room-instance',
  ])
  assert.equal(invocations[0].options.shell, false)
  assert.equal(invocations[0].options.windowsHide, true)
  assert.deepEqual(invocations[0].options.env, {
    PATH: 'safe-path',
    USERPROFILE: 'C:\\Users\\safe',
  })
  assert.equal(
    invocations[0].args.some((argument) => /auto-iam|credential|token|config/i.test(argument)),
    false,
  )
  assert.equal(JSON.stringify(invocations[0]).includes('attacker.example'), false)
  assert.equal(JSON.stringify(invocations[0]).includes('must-not-leak'), false)
  await adapter.close()
  assert.deepEqual(child.kills, ['SIGTERM'])
})

test('Cloud SQL proxy binary preflight fails before port reservation or spawn', async () => {
  const cases = [
    {
      name: 'unsupported platform',
      overrides: { platform: 'linux' },
      code: 'CLOUD_SQL_PROXY_PLATFORM_UNSUPPORTED',
    },
    {
      name: 'missing binary',
      overrides: { statFile: async () => { throw new Error('missing') } },
      code: 'CLOUD_SQL_PROXY_BINARY_MISSING',
    },
    {
      name: 'irregular binary',
      overrides: { statFile: async () => ({ isFile: () => false }) },
      code: 'CLOUD_SQL_PROXY_BINARY_MISSING',
    },
    {
      name: 'hash mismatch',
      overrides: { sha256File: async () => '0'.repeat(64) },
      code: 'CLOUD_SQL_PROXY_HASH_MISMATCH',
    },
    {
      name: 'version mismatch',
      overrides: { runVersion: async () => ({ stdout: 'cloud-sql-proxy version 2.25.3' }) },
      code: 'CLOUD_SQL_PROXY_VERSION_MISMATCH',
    },
  ]
  for (const current of cases) {
    let reserves = 0
    let spawns = 0
    const adapter = adapters.createCloudSqlAuthProxyAdapter(validProxyAdapterOptions({
      ...current.overrides,
      reservePorts: async () => { reserves += 1; return { dataPort: 1, healthPort: 2 } },
      spawn: () => { spawns += 1; return createProxyTestChild() },
    }))
    await assert.rejects(adapter.prepare(), new RegExp(current.code), current.name)
    assert.equal(reserves, 0, current.name)
    assert.equal(spawns, 0, current.name)
  }
})

test('Cloud SQL proxy requires both startup and readiness before exposing its endpoint', async () => {
  const requests = []
  let startupAttempts = 0
  let readinessAttempts = 0
  let clock = 0
  const child = createProxyTestChild()
  const adapter = adapters.createCloudSqlAuthProxyAdapter(validProxyAdapterOptions({
    spawn: () => child,
    now: () => clock,
    wait: async (delay) => { clock += delay },
    requestHealth: async (request) => {
      requests.push(request)
      if (request.path === '/startup') return ++startupAttempts >= 2 ? 200 : 503
      return ++readinessAttempts >= 2 ? 200 : 503
    },
  }))
  assert.deepEqual(await adapter.prepare(), { host: '127.0.0.1', port: 65431 })
  assert.deepEqual(requests.map((request) => request.path), [
    '/startup',
    '/startup',
    '/readiness',
    '/readiness',
  ])
  assert.equal(requests.every((request) => request.host === '127.0.0.1'), true)
  assert.equal(requests.every((request) => request.port === 65432), true)
  await adapter.close()
})

test('Cloud SQL proxy startup failures are fail-closed and terminate any spawned child', async () => {
  await assert.rejects(
    adapters.createCloudSqlAuthProxyAdapter(validProxyAdapterOptions({
      spawn: () => { throw new Error('raw spawn details') },
    })).prepare(),
    /CLOUD_SQL_PROXY_SPAWN_FAILED/,
  )

  let earlyChild
  const early = adapters.createCloudSqlAuthProxyAdapter(validProxyAdapterOptions({
    spawn: () => { earlyChild = createProxyTestChild(); return earlyChild },
    requestHealth: async () => { earlyChild.emit('close', 2, null); return 503 },
  }))
  await assert.rejects(early.prepare(), /CLOUD_SQL_PROXY_EARLY_EXIT/)

  let clock = 0
  const timeoutChild = createProxyTestChild()
  const timeout = adapters.createCloudSqlAuthProxyAdapter(validProxyAdapterOptions({
    spawn: () => timeoutChild,
    requestHealth: async () => 503,
    startupTimeoutMs: 3,
    healthPollMs: 1,
    now: () => clock,
    wait: async (delay) => {
      clock += delay
      await new Promise((resolve) => setImmediate(resolve))
    },
  }))
  await assert.rejects(timeout.prepare(), /CLOUD_SQL_PROXY_START_TIMEOUT/)
  assert.deepEqual(timeoutChild.kills, ['SIGTERM'])

  const controller = new AbortController()
  const abortedChild = createProxyTestChild()
  const aborted = adapters.createCloudSqlAuthProxyAdapter(validProxyAdapterOptions({
    signal: controller.signal,
    spawn: () => abortedChild,
    requestHealth: async () => { controller.abort(); return 503 },
  }))
  await assert.rejects(aborted.prepare(), /CLOUD_SQL_PROXY_START_ABORTED/)
  assert.deepEqual(abortedChild.kills, ['SIGTERM'])
})

test('Cloud SQL proxy close is idempotent, escalates and fails when exit is unconfirmed', async () => {
  const gracefulChild = createProxyTestChild()
  const graceful = adapters.createCloudSqlAuthProxyAdapter(validProxyAdapterOptions({
    spawn: () => gracefulChild,
    stopTimeoutMs: 5,
  }))
  await graceful.prepare()
  await Promise.all([graceful.close(), graceful.close()])
  await graceful.close()
  assert.deepEqual(gracefulChild.kills, ['SIGTERM'])

  const escalatedChild = createProxyTestChild((child, signal) => {
    if (signal === 'SIGKILL') queueMicrotask(() => child.emit('close', null, 'SIGKILL'))
  })
  const escalated = adapters.createCloudSqlAuthProxyAdapter(validProxyAdapterOptions({
    spawn: () => escalatedChild,
    stopTimeoutMs: 2,
  }))
  await escalated.prepare()
  await escalated.close()
  assert.deepEqual(escalatedChild.kills, ['SIGTERM', 'SIGKILL'])

  const stuckChild = createProxyTestChild(() => {})
  const stuck = adapters.createCloudSqlAuthProxyAdapter(validProxyAdapterOptions({
    spawn: () => stuckChild,
    stopTimeoutMs: 2,
  }))
  await stuck.prepare()
  await assert.rejects(stuck.close(), /CLOUD_SQL_PROXY_STOP_UNCONFIRMED/)
  await assert.rejects(stuck.close(), /CLOUD_SQL_PROXY_STOP_UNCONFIRMED/)
  assert.deepEqual(stuckChild.kills, ['SIGTERM', 'SIGKILL'])
})

test('psql adapter uses shell:false and PGPASSWORD only in child environment', async () => {
  let invocation = null
  const spawn = (command, args, options) => {
    invocation = { command, args, options }
    const child = new EventEmitter()
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    queueMicrotask(() => {
      child.stdout.end(`ok ${strongPassword}`)
      child.stderr.end(`notice ${strongPassword}`)
      child.emit('close', 0, null)
    })
    return child
  }
  const adapter = adapters.createPsqlAdapter({ spawn })
  await assert.rejects(
    adapter.runFile({
      host: '127.0.0.1',
      database: 'iclean-room-database',
      user: 'profitability_migration_executor',
      password: strongPassword,
      file: 'migration.psql',
    }),
    /PSQL_EXECUTION_OPT_IN_REQUIRED/,
  )
  const result = await adapter.runFile({
    host: '127.0.0.1',
    database: 'iclean-room-database',
    user: 'profitability_migration_executor',
    password: strongPassword,
    file: 'migration.psql',
    variables: { expected_database: 'iclean-room-database' },
    env: {
      PATH: 'safe',
      DATABASE_URL: `postgresql://u:${strongPassword}@host/db`,
      ACCIDENTAL_DUPLICATE: strongPassword,
    },
    mutate: true,
  })
  assert.equal(invocation.options.shell, false)
  assert.equal(invocation.options.env.PGPASSWORD, strongPassword)
  assert.equal(invocation.options.env.DATABASE_URL, undefined)
  assert.equal(invocation.options.env.ACCIDENTAL_DUPLICATE, undefined)
  assert.deepEqual(invocation.options.env, { PATH: 'safe', PGPASSWORD: strongPassword })
  assert.equal(invocation.args.some((arg) => arg.includes(strongPassword)), false)
  assert.equal(invocation.args.includes('--no-psqlrc'), true)
  assert.equal(result.stdout.includes(strongPassword), false)
  assert.equal(result.stderr.includes(strongPassword), false)
  assert.match(result.stdout, /\[REDACTED\]/)
  assert.match(result.stderr, /\[REDACTED\]/)
  assert.match(invocation.command, /PostgreSQL[\\/]17[\\/]bin[\\/]psql\.exe$/)
})

test('psql adapter rejects secret-looking variables and redacts failed output', async () => {
  const adapter = adapters.createPsqlAdapter({ spawn: () => { throw new Error('must not spawn') } })
  await assert.rejects(
    adapter.runFile({
      host: '127.0.0.1',
      database: 'iclean-room-database',
      user: 'executor',
      password: strongPassword,
      file: 'migration.psql',
      variables: { migration_token: 'not-safe' },
      mutate: true,
    }),
    /PSQL_VARIABLE_NAME_FORBIDDEN/,
  )
})

test('psql adapter redacts both captured streams on process failure', async () => {
  const adapter = adapters.createPsqlAdapter({
    spawn: () => {
      const child = new EventEmitter()
      child.stdout = new PassThrough()
      child.stderr = new PassThrough()
      queueMicrotask(() => {
        child.stdout.end(`stdout=${strongPassword}`)
        child.stderr.end(`stderr=${strongPassword}`)
        child.emit('close', 2, null)
      })
      return child
    },
  })
  await assert.rejects(
    adapter.runFile({
      host: '127.0.0.1',
      database: 'iclean-room-database',
      user: 'executor',
      password: strongPassword,
      file: 'migration.psql',
      mutate: true,
    }),
    (error) => {
      assert.equal(error.message, 'PSQL_EXECUTION_FAILED')
      assert.equal(JSON.stringify(error.result).includes(strongPassword), false)
      assert.match(error.result.stdout, /\[REDACTED\]/)
      assert.match(error.result.stderr, /\[REDACTED\]/)
      return true
    },
  )
})

test('psql adapter propagates abort signal, terminates child and fails closed', async () => {
  const controller = new AbortController()
  const kills = []
  let invocation = null
  let child = null
  const adapter = adapters.createPsqlAdapter({
    signal: controller.signal,
    spawn: (command, args, options) => {
      invocation = { command, args, options }
      child = new EventEmitter()
      child.stdout = new PassThrough()
      child.stderr = new PassThrough()
      child.kill = (signal) => { kills.push(signal); return true }
      return child
    },
  })
  const run = adapter.runFile({
    host: '127.0.0.1',
    database: 'iclean-room-database',
    user: 'executor',
    password: strongPassword,
    file: 'migration.psql',
    mutate: true,
  })
  let settled = false
  run.then(() => { settled = true }, () => { settled = true })
  controller.abort()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(settled, false)
  child.emit('error', new Error('AbortError before close'))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(settled, false)
  child.emit('close', null, 'SIGTERM')
  await assert.rejects(run, /PSQL_EXECUTION_ABORTED/)
  assert.equal(invocation.options.signal, controller.signal)
  assert.deepEqual(kills, ['SIGTERM'])
})

test('psql adapter escalates a bounded timeout and rejects only after child close', async () => {
  const kills = []
  let child = null
  const adapter = adapters.createPsqlAdapter({
    timeoutMs: 5,
    killEscalationMs: 5,
    spawn: () => {
      child = new EventEmitter()
      child.stdout = new PassThrough()
      child.stderr = new PassThrough()
      child.kill = (signal) => { kills.push(signal); return true }
      return child
    },
  })
  const run = adapter.runFile({
    host: '127.0.0.1',
    database: 'iclean-room-database',
    user: 'executor',
    password: strongPassword,
    file: 'migration.psql',
    mutate: true,
  })
  let settled = false
  run.then(() => { settled = true }, () => { settled = true })
  for (let attempt = 0; attempt < 20 && kills.length < 2; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  assert.deepEqual(kills, ['SIGTERM', 'SIGKILL'])
  assert.equal(settled, false)
  child.emit('close', null, 'SIGKILL')
  await assert.rejects(run, /PSQL_EXECUTION_TIMEOUT/)
  await assert.rejects(
    adapters.createPsqlAdapter({ timeoutMs: 240001, spawn: () => {} }).runFile({
      host: '127.0.0.1',
      database: 'iclean-room-database',
      user: 'executor',
      password: strongPassword,
      file: 'migration.psql',
      mutate: true,
    }),
    /PSQL_TIMEOUT_INVALID/,
  )
})

test('git status adapter performs only read-only inspection and verifies exact full SHA', async () => {
  const calls = []
  const outputs = new Map([
    ['branch --show-current', 'codex/object-profitability-foundation-v2-20260925\n'],
    ['rev-parse HEAD', 'ba27918251f5d584d4f40084edccbddf810be0da\n'],
    ['status --porcelain=v1 --untracked-files=all', ''],
    ['remote get-url cleanzi01', 'https://github.com/biuro-del/Cleanzi-01.git\n'],
  ])
  const adapter = adapters.createGitStatusAdapter({
    run: async (command, args, options) => {
      calls.push({ command, args, options })
      return { stdout: outputs.get(args.join(' ')) || '' }
    },
  })
  const state = await adapter.assertHead(
    '.',
    'ba27918251f5d584d4f40084edccbddf810be0da',
  )
  assert.equal(state.clean, true)
  assert.equal(
    await adapter.inspectRemoteUrl('.', { remote: 'cleanzi01' }),
    'https://github.com/biuro-del/Cleanzi-01.git',
  )
  assert.equal(calls.length, 4)
  assert.equal(calls.every((call) => call.command === 'git'), true)
  assert.equal(calls.every((call) => call.options.shell === false), true)
  assert.equal(
    calls.some((call) => /\b(?:commit|push|reset|clean)\b/.test(call.args.join(' '))),
    false,
  )
  await assert.rejects(adapter.assertHead('.', 'ba27918'), /EXPECTED_HEAD_INVALID/)
})

test('git status adapter resolves fetch URL through a real shell-free Git process', async (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanzi-git-status-adapter-'))
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }))
  execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore', windowsHide: true, shell: false })
  execFileSync(
    'git',
    ['remote', 'add', 'cleanzi01', 'https://github.com/biuro-del/Cleanzi-01.git'],
    { cwd: repo, stdio: 'ignore', windowsHide: true, shell: false },
  )

  const adapter = adapters.createGitStatusAdapter()
  assert.equal(
    await adapter.inspectRemoteUrl(repo, { remote: 'cleanzi01' }),
    'https://github.com/biuro-del/Cleanzi-01.git',
  )
})

test('production dependency facade maps source, Cloud SQL backup and guarded psql contracts', async () => {
  const psqlCalls = []
  const proxyCalls = []
  const expectedHead = 'ba27918251f5d584d4f40084edccbddf810be0da'
  const dependencies = adapters.createProductionDependencies({
    rootDir: '.',
    environment: {
      PROFITABILITY_PSQL_HOST: 'attacker.example',
      PROFITABILITY_PSQL_PORT: '9999',
    },
    gitAdapter: {
      async inspect() {
        return {
          branch: 'codex/object-profitability-foundation-v2-20260925',
          head: expectedHead,
          status: '',
          clean: true,
        }
      },
      async inspectRemoteHead() { return expectedHead },
    },
    cloudApi: {
      async inspectInstance() {
        return {
          region: 'europe-west3',
          state: 'RUNNABLE',
          settings: { databaseFlags: [{ name: 'cloudsql.iam_authentication', value: 'on' }] },
        }
      },
      async inspectBackupRun(id) { return { id, status: 'SUCCESSFUL' } },
      async listUsers() { return [] },
    },
    pgAdapter: {},
    proxyAdapter: {
      async prepare() {
        proxyCalls.push('prepare')
        return { host: '127.0.0.1', port: 6543 }
      },
      async close() { proxyCalls.push('close') },
    },
    psqlAdapter: {
      async runFile(options) { psqlCalls.push(options); return { code: 0 } },
    },
    randomSecret: () => Buffer.alloc(48, 1),
  })

  const source = await dependencies.sourceControl.inspect()
  assert.equal(source.remoteContainsHead, true)
  const cloud = await dependencies.cloudSqlAdmin.inspect({ backupId: '1790402094445' })
  assert.deepEqual(cloud, {
    project: 'iclean-room',
    instance: 'iclean-room-instance',
    region: 'europe-west3',
    state: 'RUNNABLE',
    backup: { id: '1790402094445', status: 'SUCCESSFUL' },
    pgAuthidSelectRoleEnabled: false,
  })
  await assert.rejects(
    dependencies.psqlRunner.runRoles({
      password: Buffer.alloc(48, 2),
      options: { backupId: '1790402094445' },
    }),
    /CLOUD_SQL_PROXY_NOT_READY/,
  )
  const firstEndpoint = await dependencies.psqlRunner.prepare()
  const secondEndpoint = await dependencies.psqlRunner.prepare()
  assert.equal(firstEndpoint, secondEndpoint)
  assert.deepEqual(proxyCalls, ['prepare'])
  await dependencies.psqlRunner.runRoles({
    password: Buffer.alloc(48, 2),
    options: { backupId: '1790402094445' },
  })
  await dependencies.psqlRunner.runMigration({
    password: Buffer.alloc(48, 3),
    options: {
      backupId: '1790402094445',
      confirmation: 'APPLY_PROFITABILITY_DOMAIN_FOUNDATION_V2_ONLY_20260926',
    },
  })
  assert.equal(psqlCalls.length, 2)
  assert.equal(psqlCalls[0].host, '127.0.0.1')
  assert.equal(psqlCalls[0].port, 6543)
  assert.equal(psqlCalls[0].user, adapters.PROVISIONER_ROLE)
  assert.equal(psqlCalls[0].mutate, true)
  assert.equal(psqlCalls[0].variables.profitability_roles_backup_reference, '1790402094445')
  assert.equal(psqlCalls[0].file.endsWith('20260925_profitability_foundation_v2_roles_preprovision.psql'), true)
  assert.equal(psqlCalls[1].host, '127.0.0.1')
  assert.equal(psqlCalls[1].port, 6543)
  assert.equal(psqlCalls[1].user, 'profitability_migration_executor')
  assert.equal(JSON.stringify(psqlCalls).includes('attacker.example'), false)
  assert.equal(JSON.stringify(psqlCalls).includes('9999'), false)
  await dependencies.close()
  await dependencies.close()
  assert.deepEqual(proxyCalls, ['prepare', 'close'])
  await assert.rejects(dependencies.psqlRunner.prepare(), /CLOUD_SQL_PROXY_ALREADY_CLOSED/)
})

test('production facade ignores ambient psql executable override', async () => {
  let invokedCommand = null
  const dependencies = adapters.createProductionDependencies({
    rootDir: '.',
    environment: { PROFITABILITY_PSQL_PATH: 'C:\\attacker\\psql.exe' },
    cloudApi: {},
    gitAdapter: {},
    pgAdapter: { async close() {} },
    proxyAdapter: {
      async prepare() { return { host: '127.0.0.1', port: 6543 } },
      async close() {},
    },
    spawn(command) {
      invokedCommand = command
      const child = new EventEmitter()
      child.stdout = new PassThrough()
      child.stderr = new PassThrough()
      queueMicrotask(() => {
        child.stdout.end('ok')
        child.stderr.end('')
        child.emit('close', 0, null)
      })
      return child
    },
  })
  await dependencies.psqlRunner.prepare()
  await dependencies.psqlRunner.runRoles({
    password: strongPassword,
    options: { backupId: '1790402094445' },
  })
  assert.equal(path.resolve(invokedCommand), path.resolve(adapters.DEFAULT_PSQL_PATH))
  assert.notEqual(path.resolve(invokedCommand), path.resolve('C:\\attacker\\psql.exe'))
  await dependencies.close()
})

test('dependency close clears remembered one-time passwords even when cleanup fails', async () => {
  let provisionerLoginAttempts = 0
  const bootstrapClient = {
    async query() { return { rows: [] } },
    async end() {},
  }
  const dependencies = adapters.createProductionDependencies({
    rootDir: '.',
    cloudApi: {},
    gitAdapter: {},
    psqlAdapter: {},
    proxyAdapter: { async close() { throw new Error('proxy close failure') } },
    pgAdapter: {
      async connectBuiltin({ user }) {
        if (user === adapters.PROVISIONER_ROLE) {
          provisionerLoginAttempts += 1
          const error = new Error('password rejected')
          error.code = '28P01'
          throw error
        }
        return bootstrapClient
      },
      async close() {},
    },
  })
  const session = await dependencies.databaseAdmin.openBootstrap({
    name: 'profitability_bootstrap_clear_test',
    password: strongPassword,
  })
  await session.createRestrictedProvisioner({
    name: adapters.PROVISIONER_ROLE,
    password: strongPassword,
    mutate: true,
  })
  assert.equal(await dependencies.databaseAdmin.verifyPasswordNull(adapters.PROVISIONER_ROLE), true)
  assert.equal(provisionerLoginAttempts, 1)
  await assert.rejects(dependencies.close(), /PRODUCTION_DEPENDENCY_CLOSE_FAILED/)
  assert.equal(await dependencies.databaseAdmin.verifyPasswordNull(adapters.PROVISIONER_ROLE), false)
  assert.equal(provisionerLoginAttempts, 1)
})

test('production dependency close always attempts proxy and PG cleanup and is idempotent', async () => {
  for (const failure of ['proxy', 'pg', 'both']) {
    const calls = []
    const dependencies = adapters.createProductionDependencies({
      rootDir: '.',
      cloudApi: {},
      gitAdapter: {},
      psqlAdapter: {},
      proxyAdapter: {
        async prepare() { return { host: '127.0.0.1', port: 6543 } },
        async close() {
          calls.push('proxy-close')
          if (failure === 'proxy' || failure === 'both') throw new Error('raw proxy failure')
        },
      },
      pgAdapter: {
        async close() {
          calls.push('pg-close')
          if (failure === 'pg' || failure === 'both') throw new Error('raw pg failure')
        },
      },
    })
    await assert.rejects(
      dependencies.close(),
      (error) => {
        assert.equal(error.message, 'PRODUCTION_DEPENDENCY_CLOSE_FAILED')
        assert.equal(error.message.includes('raw'), false)
        return true
      },
    )
    await assert.rejects(dependencies.close(), /PRODUCTION_DEPENDENCY_CLOSE_FAILED/)
    assert.deepEqual(calls, ['proxy-close', 'pg-close'])
  }
})

test('production database audit reads owners, extension, fresh catalogs and active runtime gates', async () => {
  let ended = 0
  const queries = []
  const client = {
    async query(sql) {
      queries.push(sql)
      if (sql.includes("current_setting('server_version_num')")) {
        return {
          rows: [{
            database_name: 'iclean-room-database',
            server_version_num: 170010,
            in_recovery: false,
            transaction_read_only: 'off',
            default_transaction_read_only: 'off',
            bootstrap_grantor: 'cloudsqladmin',
            database_owner: 'cloudsqlsuperuser',
            schema_owner: 'firebaseowner_iclean-room-database_public',
          }],
        }
      }
      if (sql.includes('from pg_extension')) {
        return { rows: [{ extname: 'btree_gist', extversion: '1.7', schema_name: 'public' }] }
      }
      return { rows: [] }
    },
    async end() { ended += 1 },
  }
  const cloudApi = {
    async inspectCloudRunService() {
      return { trafficStatuses: [{ percent: 100, revision: 'cleanzi-01-rev-safe' }] }
    },
    async inspectCloudRunRevision() {
      return { containers: [{ env: [] }] }
    },
  }
  const dependencies = adapters.createProductionDependencies({
    rootDir: '.',
    cloudApi,
    gitAdapter: {},
    psqlAdapter: {},
    pgAdapter: {
      async connectIamAdmin() { return client },
    },
  })
  const audit = await dependencies.databaseAdmin.audit()
  assert.deepEqual(audit, {
    database: 'iclean-room-database',
    pgMajor: 17,
    primary: true,
    readWrite: true,
    bootstrapGrantor: 'cloudsqladmin',
    databaseOwner: 'cloudsqlsuperuser',
    schemaOwner: 'firebaseowner_iclean-room-database_public',
    extension: { name: 'btree_gist', version: '1.7', schema: 'public' },
    targetRoleCount: 0,
    targetRelationCount: 0,
    featureEnabled: false,
    allowlistCount: 0,
  })
  assert.equal(ended, 1)
  const sourceGuardIndex = queries.findIndex((sql) => (
    sql.startsWith('do $profitability_foundation_v2_source_guard$')
  ))
  const targetGuardIndex = queries.findIndex((sql) => (
    sql.startsWith('do $profitability_foundation_v2_target_state_guard$')
  ))
  const catalogIndex = queries.findIndex((sql) => sql.includes("current_setting('server_version_num')"))
  assert.equal(queries[0], 'begin transaction isolation level repeatable read read only')
  assert.equal(sourceGuardIndex > 0, true)
  assert.equal(targetGuardIndex > sourceGuardIndex, true)
  const rollbackIndex = queries.indexOf('rollback')
  assert.equal(rollbackIndex > targetGuardIndex, true)
  assert.equal(catalogIndex > rollbackIndex, true)
})

test('production database audit fails closed before role mutation on source-catalog drift', async () => {
  const queries = []
  let ended = 0
  const dependencies = adapters.createProductionDependencies({
    rootDir: '.',
    cloudApi: {
      async inspectCloudRunService() {
        return { trafficStatuses: [{ percent: 100, revision: 'cleanzi-01-rev-safe' }] }
      },
      async inspectCloudRunRevision() { return { containers: [{ env: [] }] } },
    },
    gitAdapter: {},
    psqlAdapter: {},
    pgAdapter: {
      async connectIamAdmin() {
        return {
          async query(sql) {
            queries.push(sql)
            if (sql.startsWith('do $profitability_foundation_v2_source_guard$')) {
              throw new Error('source key drift')
            }
            return { rows: [] }
          },
          async end() { ended += 1 },
        }
      },
    },
  })
  await assert.rejects(
    dependencies.databaseAdmin.audit(),
    /INDEPENDENT_PREFLIGHT_FAILED/,
  )
  assert.equal(queries[0], 'begin transaction isolation level repeatable read read only')
  assert.equal(queries.at(-1), 'rollback')
  assert.equal(ended, 1)
})

test('Cloud SQL pg_authid flag parsing treats off, false and zero as disabled', async () => {
  for (const value of ['off', 'false', '0', 'NO', '']) {
    const dependencies = adapters.createProductionDependencies({
      rootDir: '.',
      cloudApi: {
        async inspectInstance() {
          return {
            region: 'europe-west3',
            state: 'RUNNABLE',
            settings: {
              databaseFlags: value
                ? [{ name: 'cloudsql.pg_authid_select_role', value }]
                : [],
            },
          }
        },
        async inspectBackupRun(id) { return { id, status: 'SUCCESSFUL' } },
      },
      gitAdapter: {},
      pgAdapter: {},
      psqlAdapter: {},
    })
    const state = await dependencies.cloudSqlAdmin.inspect({ backupId: '1790402094445' })
    assert.equal(state.pgAuthidSelectRoleEnabled, false, `value=${value}`)
  }
})

test('provisioner handoff accepts only the exact grants and no bootstrap catalog footprint', async () => {
  const bootstrap = 'profitability_bootstrap_123'
  const queries = []
  const bootstrapClient = { async query() { return { rows: [] } }, async end() {} }
  const dependencies = adapters.createProductionDependencies({
    rootDir: '.',
    cloudApi: {},
    gitAdapter: {},
    psqlAdapter: {},
    pgAdapter: {
      async connectBuiltin() { return bootstrapClient },
      async connectIamAdmin() { return createHandoffIamClient({ bootstrap, queries }) },
    },
  })
  const session = await dependencies.databaseAdmin.openBootstrap({
    name: bootstrap,
    password: strongPassword,
  })
  assert.equal(await dependencies.databaseAdmin.verifyProvisionerHandoff(), true)
  const footprintQuery = queries.find((sql) => sql.includes('default_acl_owners'))
  assert.ok(footprintQuery)
  assert.equal(footprintQuery.includes("coalesce(row.datacl, '{}'::aclitem[])"), false)
  assert.equal((footprintQuery.match(/case when cardinality\(row\.[a-z]+\) > 0/g) || []).length, 12)
  assert.equal((footprintQuery.match(/else null::aclitem\[\] end/g) || []).length, 12)
  await session.close()
})

test('provisioner handoff rejects any bootstrap ACL or default ACL footprint', async () => {
  const bootstrap = 'profitability-bootstrap-456'
  const bootstrapClient = { async query() { return { rows: [] } }, async end() {} }
  const dependencies = adapters.createProductionDependencies({
    rootDir: '.',
    cloudApi: {},
    gitAdapter: {},
    psqlAdapter: {},
    pgAdapter: {
      async connectBuiltin() { return bootstrapClient },
      async connectIamAdmin() {
        return createHandoffIamClient({
          bootstrap,
          footprint: { owned_count: 0, acl_count: 0, default_acl_count: 1 },
        })
      },
    },
  })
  await dependencies.databaseAdmin.openBootstrap({ name: bootstrap, password: strongPassword })
  await assert.rejects(
    dependencies.databaseAdmin.verifyProvisionerHandoff(),
    /PROVISIONER_HANDOFF_INVALID/,
  )
})

test('provisioner handoff rejects a role-admin edge absent from the Cloud SQL bootstrap fingerprint', async () => {
  const bootstrap = 'profitability_bootstrap_456'
  const bootstrapClient = { async query() { return { rows: [] } }, async end() {} }
  const dependencies = adapters.createProductionDependencies({
    rootDir: '.',
    cloudApi: {},
    gitAdapter: {},
    psqlAdapter: {},
    pgAdapter: {
      async connectBuiltin() { return bootstrapClient },
      async connectIamAdmin() {
        return createHandoffIamClient({
          bootstrap,
          memberships: [
            {
              granted_role: 'cloudsqlsuperuser',
              member_role: bootstrap,
              grantor_role: 'cloudsqladmin',
              admin_option: false,
              inherit_option: true,
              set_option: true,
            },
            {
              granted_role: adapters.PROVISIONER_ROLE,
              member_role: bootstrap,
              grantor_role: 'cloudsqladmin',
              admin_option: true,
              inherit_option: false,
              set_option: false,
            },
          ],
        })
      },
    },
  })
  await dependencies.databaseAdmin.openBootstrap({ name: bootstrap, password: strongPassword })
  await assert.rejects(
    dependencies.databaseAdmin.verifyProvisionerHandoff(),
    /PROVISIONER_HANDOFF_INVALID/,
  )
})

test('bootstrap absence requires both role and membership to be absent', async () => {
  const responses = [
    { role_count: 0, membership_count: 0 },
    { role_count: 0, membership_count: 1 },
  ]
  const queries = []
  const dependencies = adapters.createProductionDependencies({
    rootDir: '.',
    cloudApi: {},
    gitAdapter: {},
    psqlAdapter: {},
    pgAdapter: {
      async connectIamAdmin() {
        return {
          async query(sql, values) {
            queries.push({ sql, values })
            return { rows: [responses.shift()] }
          },
          async end() {},
        }
      },
    },
  })
  assert.equal(
    await dependencies.databaseAdmin.verifyBootstrapAbsent('profitability_bootstrap_789'),
    true,
  )
  assert.equal(
    await dependencies.databaseAdmin.verifyBootstrapAbsent('profitability_bootstrap_789'),
    false,
  )
  assert.equal(queries.every(({ sql }) => sql.includes('pg_auth_members')), true)
  assert.deepEqual(queries[0].values, ['profitability_bootstrap_789'])
})

test('bootstrap session exposes an explicit fail-closed provisioner password lock fallback', async () => {
  const queries = []
  const bootstrapClient = {
    async query(sql) { queries.push(sql); return { rows: [] } },
    async end() {},
  }
  const dependencies = adapters.createProductionDependencies({
    rootDir: '.',
    cloudApi: {},
    gitAdapter: {},
    psqlAdapter: {},
    pgAdapter: {
      async connectBuiltin() { return bootstrapClient },
    },
  })
  const session = await dependencies.databaseAdmin.openBootstrap({
    name: 'profitability_bootstrap_999',
    password: strongPassword,
  })
  await assert.rejects(session.lockProvisioner({}), /ROLE_PASSWORD_LOCK_OPT_IN_REQUIRED/)
  await session.lockProvisioner({ mutate: true })
  assert.deepEqual(queries, ['alter role "profitability_provisioner" password null'])
})

test('ambiguous provisioner creation still retains the credential for rejection verification', async () => {
  const connectionAttempts = []
  const bootstrapClient = {
    async query(sql) {
      if (sql === 'commit') throw new Error('lost commit acknowledgement')
      return { rows: [] }
    },
    async end() {},
  }
  const dependencies = adapters.createProductionDependencies({
    rootDir: '.',
    cloudApi: {},
    gitAdapter: {},
    psqlAdapter: {},
    pgAdapter: {
      async connectBuiltin(options) {
        connectionAttempts.push(options)
        if (options.user === adapters.PROVISIONER_ROLE) {
          const error = new Error('password authentication failed')
          error.code = '28P01'
          throw error
        }
        return bootstrapClient
      },
    },
  })
  const session = await dependencies.databaseAdmin.openBootstrap({
    name: 'profitability_bootstrap_ambiguous',
    password: strongPassword,
  })
  await assert.rejects(
    session.createRestrictedProvisioner({
      name: adapters.PROVISIONER_ROLE,
      password: `${strongPassword}-provisioner`,
      mutate: true,
    }),
    /lost commit acknowledgement/,
  )
  assert.equal(
    await dependencies.databaseAdmin.verifyPasswordNull(adapters.PROVISIONER_ROLE),
    true,
  )
  assert.equal(connectionAttempts.at(-1).user, adapters.PROVISIONER_ROLE)
  assert.equal(connectionAttempts.at(-1).password, `${strongPassword}-provisioner`)
})

function createMigrationInspectionClient({
  drift = null,
  foundationPresent = true,
  accessProfile = false,
  financialModel = false,
  accessMarkerCount,
  financialMarkerCount,
} = {}) {
  const queries = []
  const configValues = []
  const relations = foundationPresent
    ? adapters.FOUNDATION_TABLES.map((table_name) => ({
      table_name,
      owner_name: 'profitability_owner',
    }))
    : []
  return {
    queries,
    configValues,
    async query(sql, values) {
      queries.push(sql)
      if (sql === 'begin transaction isolation level repeatable read read only') return { rows: [] }
      if (sql === 'rollback') return { rows: [] }
      if (sql === 'set local role profitability_migration_runner') return { rows: [] }
      if (sql === 'set local role profitability_owner') return { rows: [] }
      if (sql === 'select set_config($1, $2, true)') {
        configValues.push(values)
        return { rows: [{ set_config: values?.[1] }] }
      }
      if (sql.includes('from pg_class class')) return { rows: relations }
      if (sql === adapters.POST_UPGRADE_FOUNDATION_MARKERS_SQL) {
        return {
          rows: [{
            access_marker_count: accessMarkerCount ?? (accessProfile ? 10 : 0),
            financial_marker_count: financialMarkerCount ?? (financialModel ? 19 : 0),
          }],
        }
      }
      if (sql.startsWith('select count(*)::bigint as row_count')) {
        return { rows: [{ row_count: '0' }] }
      }
      if (sql.startsWith('do $profitability_foundation_v2_exact_catalog_postflight$')) {
        if (drift === true || drift === 'exact') throw new Error('database fingerprint and internal details')
        return { rows: [] }
      }
      if (sql.startsWith('do $$') && sql.includes('PROFITABILITY_ACCESS_V2_')) {
        if (drift === 'access-profile-v2') throw new Error('sensitive access drift')
        return { rows: [] }
      }
      if (sql.startsWith('do $profitability_foundation_v2_post_upgrade_extension_exact$')) {
        if (drift === 'foundation-extension') throw new Error('sensitive extension drift')
        return { rows: [] }
      }
      if (sql.startsWith('do $profitability_v21_postflight$')) {
        if (drift === 'financial-v21') throw new Error('sensitive financial drift')
        return { rows: [] }
      }
      if (sql.startsWith('do $profitability_foundation_v2_owner_acl_postflight$')) {
        if (['owner', 'table-acl', 'sequence-acl', 'function-acl'].includes(drift)) {
          throw new Error(`sensitive ${drift} details`)
        }
        return { rows: [] }
      }
      if (sql.startsWith('do $profitability_foundation_v2_final_guard$')) {
        if (drift === 'final') throw new Error('sensitive final guard details')
        return { rows: [] }
      }
      throw new Error(`unexpected query: ${sql}`)
    },
    async end() {},
  }
}

test('shared Foundation postflight executes every independent production guard', async () => {
  const client = createMigrationInspectionClient()
  const result = await adapters.inspectExistingFoundationPostflight(client, {
    migrationFile: path.join(
      __dirname,
      '..',
      'dataconnect',
      'migrations',
      '20260925_profitability_foundation_v2_additive.sql',
    ),
    executorSession: true,
  })

  assert.deepEqual(result, {
    status: 'exact',
    exact: true,
    relationCount: adapters.FOUNDATION_TABLES.length,
    rowCount: 0,
  })
  assert.equal(
    client.queries.some((sql) => sql.startsWith(
      'do $profitability_foundation_v2_exact_catalog_postflight$',
    )),
    true,
  )
  assert.equal(
    client.queries.some((sql) => sql.startsWith(
      'do $profitability_foundation_v2_owner_acl_postflight$',
    )),
    true,
  )
  assert.equal(
    client.queries.some((sql) => sql.startsWith(
      'do $profitability_foundation_v2_final_guard$',
    )),
    true,
  )
  assert.equal(client.queries.at(-1), 'rollback')
})

test('shared Foundation postflight verifies reviewed Access V2 and Financial V2.1 extensions', async () => {
  assert.match(
    adapters.POST_UPGRADE_FOUNDATION_EXTENSION_EXACT_SQL,
    /attribute_row\.attname = 'value_basis'[\s\S]*attribute_row\.attnum = 26[\s\S]*attribute_row\.atttypid = 1043[\s\S]*attribute_row\.atttypmod = 20/,
  )
  assert.match(
    adapters.POST_UPGRADE_FOUNDATION_EXTENSION_EXACT_SQL,
    /attribute_row\.attname = 'value_key'[\s\S]*attribute_row\.attnum = 27[\s\S]*attribute_row\.atttypid = 1043[\s\S]*attribute_row\.atttypmod = 100/,
  )
  assert.match(
    adapters.POST_UPGRADE_FOUNDATION_EXTENSION_EXACT_SQL,
    /type_namespace\.nspname = 'pg_catalog'[\s\S]*type_row\.typname = 'varchar'[\s\S]*type_row\.typtype = 'b'[\s\S]*type_row\.typcategory = 'S'[\s\S]*type_row\.typbasetype = 0[\s\S]*not type_row\.typnotnull[\s\S]*type_row\.typalign = 'i'[\s\S]*type_row\.typstorage = 'x'/,
  )
  assert.match(
    adapters.POST_UPGRADE_FOUNDATION_EXTENSION_EXACT_SQL,
    /collation_namespace\.nspname = 'pg_catalog'[\s\S]*collation_row\.collname = 'default'/,
  )
  assert.match(
    adapters.POST_UPGRADE_FOUNDATION_EXTENSION_EXACT_SQL,
    /index_meta\.indimmediate/,
  )
  assert.match(
    adapters.POST_UPGRADE_FOUNDATION_EXTENSION_EXACT_SQL,
    /not index_meta\.indcheckxmin/,
  )
  assert.doesNotMatch(
    adapters.POST_UPGRADE_FOUNDATION_EXTENSION_EXACT_SQL,
    /index_meta\.indisimmediate/,
  )
  const client = createMigrationInspectionClient({
    accessProfile: true,
    financialModel: true,
  })
  const result = await adapters.inspectExistingFoundationPostflight(client, {
    migrationFile: path.join(
      __dirname,
      '..',
      'dataconnect',
      'migrations',
      '20260925_profitability_foundation_v2_additive.sql',
    ),
    executorSession: true,
  })

  assert.equal(result.status, 'exact')
  const exactCatalog = client.queries.find((sql) => sql.startsWith(
    'do $profitability_foundation_v2_exact_catalog_postflight$',
  ))
  assert.match(exactCatalog, /attribute_row\.attname = any\([\s\S]*'value_basis', 'value_key'/)
  assert.match(exactCatalog, /object_financial_entry_active_value_basis_uidx/)
  assert.match(exactCatalog, /object_financial_entry_pair_dimensions_v21/)
  assert.equal(
    client.queries.some((sql) => sql.startsWith('do $$')
      && sql.includes('PROFITABILITY_ACCESS_V2_')),
    true,
  )
  assert.equal(
    client.queries.some((sql) => sql.startsWith(
      'do $profitability_foundation_v2_post_upgrade_extension_exact$',
    )),
    true,
  )
  assert.equal(
    client.queries.some((sql) => sql.startsWith('do $profitability_v21_postflight$')),
    true,
  )
  assert.equal(client.queries.at(-1), 'rollback')
})

test('shared Foundation postflight fails closed on partial post-upgrade footprints', async () => {
  for (const fixture of [
    { accessMarkerCount: 9, expected: 'ACCESS_PROFILE_V2_COMPOSITE_STATE_PARTIAL' },
    { financialMarkerCount: 18, expected: 'FINANCIAL_V21_COMPOSITE_STATE_PARTIAL' },
  ]) {
    const client = createMigrationInspectionClient(fixture)
    await assert.rejects(
      adapters.inspectExistingFoundationPostflight(client, {
        migrationFile: path.join(
          __dirname,
          '..',
          'dataconnect',
          'migrations',
          '20260925_profitability_foundation_v2_additive.sql',
        ),
        executorSession: true,
      }),
      new RegExp(fixture.expected),
    )
    assert.equal(client.queries.at(-1), 'rollback')
  }
})

test('shared Foundation postflight does not treat upgrade remnants without Foundation as absent', async () => {
  for (const fixture of [
    { accessMarkerCount: 10, financialMarkerCount: 0 },
    { accessMarkerCount: 0, financialMarkerCount: 19 },
  ]) {
    const client = createMigrationInspectionClient({
      foundationPresent: false,
      ...fixture,
    })
    const result = await adapters.inspectExistingFoundationPostflight(client, {
      migrationFile: path.join(
        __dirname,
        '..',
        'dataconnect',
        'migrations',
        '20260925_profitability_foundation_v2_additive.sql',
      ),
      executorSession: true,
    })
    assert.deepEqual(result, {
      status: 'partial',
      exact: false,
      relationCount: 0,
      rowCount: null,
    })
    assert.equal(client.queries.includes(adapters.POST_UPGRADE_FOUNDATION_MARKERS_SQL), true)
    assert.equal(client.queries.at(-1), 'rollback')
  }
})

test('shared Foundation postflight rejects partial Financial remnants without Foundation', async () => {
  const client = createMigrationInspectionClient({
    foundationPresent: false,
    financialMarkerCount: 18,
  })
  await assert.rejects(
    adapters.inspectExistingFoundationPostflight(client, {
      migrationFile: path.join(
        __dirname,
        '..',
        'dataconnect',
        'migrations',
        '20260925_profitability_foundation_v2_additive.sql',
      ),
      executorSession: true,
    }),
    /FINANCIAL_V21_COMPOSITE_STATE_PARTIAL/,
  )
  assert.equal(client.queries.includes(adapters.POST_UPGRADE_FOUNDATION_MARKERS_SQL), true)
  assert.equal(client.queries.at(-1), 'rollback')
})

test('shared Foundation postflight fails closed on Access or Financial extension drift', async () => {
  for (const drift of ['access-profile-v2', 'foundation-extension', 'financial-v21']) {
    const client = createMigrationInspectionClient({
      drift,
      accessProfile: true,
      financialModel: true,
    })
    await assert.rejects(
      adapters.inspectExistingFoundationPostflight(client, {
        migrationFile: path.join(
          __dirname,
          '..',
          'dataconnect',
          'migrations',
          '20260925_profitability_foundation_v2_additive.sql',
        ),
        executorSession: true,
      }),
      new RegExp(drift === 'access-profile-v2'
        ? 'ACCESS_PROFILE_V2_COMPOSITE_POSTFLIGHT_FAILED'
        : drift === 'foundation-extension'
          ? 'FOUNDATION_POST_UPGRADE_EXTENSION_POSTFLIGHT_FAILED'
          : 'FINANCIAL_V21_COMPOSITE_POSTFLIGHT_FAILED'),
    )
    assert.equal(client.queries.at(-1), 'rollback')
  }
})

function exactNormalizedRoleState() {
  const role = (rolname, rolcanlogin, rolcreaterole = false) => ({
    rolname,
    rolcanlogin,
    rolinherit: false,
    rolsuper: false,
    rolcreatedb: false,
    rolcreaterole,
    rolreplication: false,
    rolbypassrls: false,
    rolconnlimit: -1,
    rolvaliduntil: null,
    rolconfig: null,
  })
  const creatorEdge = (granted_role) => ({
    granted_role,
    member_role: adapters.PROVISIONER_ROLE,
    grantor_role: 'cloudsqladmin',
    admin_option: true,
    inherit_option: false,
    set_option: false,
  })
  return {
    roles: [
      role(adapters.PROVISIONER_ROLE, true, true),
      role('profitability_migration_executor', true),
      role('profitability_migration_runner', false),
      role('profitability_owner', false),
      role('profitability_session', true),
      role('profitability_runtime', false),
    ],
    memberships: [
      ...adapters.TARGET_ROLES.map(creatorEdge),
      {
        granted_role: 'profitability_migration_runner',
        member_role: 'profitability_migration_executor',
        grantor_role: adapters.PROVISIONER_ROLE,
        admin_option: false,
        inherit_option: false,
        set_option: true,
      },
      {
        granted_role: 'profitability_owner',
        member_role: 'profitability_migration_runner',
        grantor_role: adapters.PROVISIONER_ROLE,
        admin_option: false,
        inherit_option: false,
        set_option: true,
      },
      {
        granted_role: 'profitability_runtime',
        member_role: 'profitability_session',
        grantor_role: adapters.PROVISIONER_ROLE,
        admin_option: false,
        inherit_option: false,
        set_option: true,
      },
    ],
    databaseAcl: [
      {
        grantee: adapters.PROVISIONER_ROLE,
        privilege_type: 'CONNECT',
        is_grantable: true,
        grantor: 'cloudsqlsuperuser',
      },
      {
        grantee: 'profitability_migration_executor',
        privilege_type: 'CONNECT',
        is_grantable: false,
        grantor: adapters.PROVISIONER_ROLE,
      },
      {
        grantee: 'profitability_session',
        privilege_type: 'CONNECT',
        is_grantable: false,
        grantor: adapters.PROVISIONER_ROLE,
      },
    ],
    schemaAcl: [
      {
        grantee: adapters.PROVISIONER_ROLE,
        privilege_type: 'CREATE',
        is_grantable: true,
        grantor: 'firebaseowner_iclean-room-database_public',
      },
      {
        grantee: adapters.PROVISIONER_ROLE,
        privilege_type: 'USAGE',
        is_grantable: true,
        grantor: 'firebaseowner_iclean-room-database_public',
      },
      {
        grantee: 'profitability_owner',
        privilege_type: 'CREATE',
        is_grantable: false,
        grantor: adapters.PROVISIONER_ROLE,
      },
      {
        grantee: 'profitability_owner',
        privilege_type: 'USAGE',
        is_grantable: false,
        grantor: adapters.PROVISIONER_ROLE,
      },
      {
        grantee: 'profitability_runtime',
        privilege_type: 'USAGE',
        is_grantable: false,
        grantor: adapters.PROVISIONER_ROLE,
      },
    ],
  }
}

test('role normalization accepts the exact six-role graph and rejects one-field drift', () => {
  const state = exactNormalizedRoleState()
  const exact = adapters.normalizeRoleState(state)
  assert.equal(exact.exact, true)
  assert.equal(exact.roleCount, 6)
  assert.equal(exact.membershipCount, 8)

  const drifted = structuredClone(state)
  drifted.memberships[0].set_option = true
  assert.equal(adapters.normalizeRoleState(drifted).exact, false)
})

test('migration inspection executes the exact source fingerprint block in a read-only snapshot', async () => {
  const migrationFile = path.join(
    __dirname,
    '..',
    'dataconnect',
    'migrations',
    '20260925_profitability_foundation_v2_additive.sql',
  )
  const expectedBlock = adapters.extractExactCatalogPostflight(
    fs.readFileSync(migrationFile, 'utf8'),
  )
  const client = createMigrationInspectionClient()
  const dependencies = adapters.createProductionDependencies({
    rootDir: path.join(__dirname, '..'),
    cloudApi: {},
    gitAdapter: {},
    psqlAdapter: {},
    pgAdapter: {
      async connectBuiltin() { return client },
    },
  })

  const result = await dependencies.databaseAdmin.inspectMigration({
    executorPassword: 'x'.repeat(24),
  })
  assert.equal(result.exact, true)
  assert.equal(result.relationCount, adapters.FOUNDATION_TABLES.length)
  assert.equal(result.rowCount, 0)
  assert.equal(client.queries[0], 'begin transaction isolation level repeatable read read only')
  assert.equal(client.queries.includes('set local role profitability_migration_runner'), true)
  assert.equal(client.queries.includes('set local role profitability_owner'), true)
  assert.equal(client.queries.filter((sql) => sql === expectedBlock).length, 1)
  assert.equal(
    client.queries.some((sql) => sql.startsWith('do $profitability_foundation_v2_owner_acl_postflight$')),
    true,
  )
  assert.equal(
    client.queries.some((sql) => sql.startsWith('do $profitability_foundation_v2_final_guard$')),
    true,
  )
  assert.equal(
    client.queries.filter((sql) => sql === 'select set_config($1, $2, true)').length,
    4,
  )
  assert.deepEqual(client.configValues, [
    ['cleanzi.profitability_foundation_v2_runtime_role', 'profitability_runtime'],
    ['cleanzi.profitability_foundation_v2_session_role', 'profitability_session'],
    ['cleanzi.profitability_foundation_v2_fresh_install', 'false'],
    ['cleanzi.profitability_foundation_v2_entrypoint', ''],
  ])
  assert.equal(client.queries.at(-1), 'rollback')
})

test('migration inspection refuses full-table verification through the IAM audit identity', async () => {
  const client = createMigrationInspectionClient()
  const dependencies = adapters.createProductionDependencies({
    rootDir: path.join(__dirname, '..'),
    cloudApi: {},
    gitAdapter: {},
    psqlAdapter: {},
    pgAdapter: {
      async connectIamAdmin() { return client },
    },
  })

  await assert.rejects(
    dependencies.databaseAdmin.inspectMigration(),
    /MIGRATION_VERIFICATION_CREDENTIAL_REQUIRED/,
  )
  assert.equal(
    client.queries.some((sql) => sql.startsWith('select count(*)::bigint as row_count')),
    false,
  )
  assert.equal(client.queries.at(-1), 'rollback')
})

test('migration inspection fails closed and rolls back on exact catalog drift', async () => {
  const client = createMigrationInspectionClient({ drift: true })
  const dependencies = adapters.createProductionDependencies({
    rootDir: path.join(__dirname, '..'),
    cloudApi: {},
    gitAdapter: {},
    psqlAdapter: {},
    pgAdapter: {
      async connectBuiltin() { return client },
    },
  })

  await assert.rejects(
    dependencies.databaseAdmin.inspectMigration({ executorPassword: 'x'.repeat(24) }),
    (error) => {
      assert.equal(error.message, 'EXACT_CATALOG_POSTFLIGHT_FAILED')
      assert.equal(error.message.includes('internal details'), false)
      return true
    },
  )
  assert.equal(client.queries.at(-1), 'rollback')
})

test('migration inspection detects owner, table, sequence and function ACL drift', async () => {
  for (const drift of ['owner', 'table-acl', 'sequence-acl', 'function-acl']) {
    const client = createMigrationInspectionClient({ drift })
    const dependencies = adapters.createProductionDependencies({
      rootDir: path.join(__dirname, '..'),
      cloudApi: {},
      gitAdapter: {},
      psqlAdapter: {},
      pgAdapter: {
        async connectBuiltin() { return client },
      },
    })

    await assert.rejects(
      dependencies.databaseAdmin.inspectMigration({ executorPassword: 'x'.repeat(24) }),
      (error) => {
        assert.equal(error.message, 'OWNER_ACL_POSTFLIGHT_FAILED', drift)
        assert.equal(error.message.includes('sensitive'), false)
        return true
      },
    )
    assert.equal(client.queries.at(-1), 'rollback', drift)
  }
})

test('migration inspection fails closed on final guard drift', async () => {
  const client = createMigrationInspectionClient({ drift: 'final' })
  const dependencies = adapters.createProductionDependencies({
    rootDir: path.join(__dirname, '..'),
    cloudApi: {},
    gitAdapter: {},
    psqlAdapter: {},
    pgAdapter: {
      async connectBuiltin() { return client },
    },
  })

  await assert.rejects(
    dependencies.databaseAdmin.inspectMigration({ executorPassword: 'x'.repeat(24) }),
    (error) => {
      assert.equal(error.message, 'FINAL_GUARD_FAILED')
      assert.equal(error.message.includes('sensitive'), false)
      return true
    },
  )
  assert.equal(client.queries.at(-1), 'rollback')
})

test('migration inspection returns partial shape without executing the fingerprint block', async () => {
  const client = createMigrationInspectionClient()
  const originalQuery = client.query.bind(client)
  client.query = async (sql) => {
    if (sql.includes('from pg_class class')) {
      return {
        rows: adapters.FOUNDATION_TABLES.slice(0, -1).map((table_name) => ({
          table_name,
          owner_name: 'profitability_owner',
        })),
      }
    }
    return originalQuery(sql)
  }
  const dependencies = adapters.createProductionDependencies({
    rootDir: path.join(__dirname, '..'),
    cloudApi: {},
    gitAdapter: {},
    psqlAdapter: {},
    pgAdapter: {
      async connectIamAdmin() { return client },
    },
  })

  const result = await dependencies.databaseAdmin.inspectMigration()
  assert.equal(result.exact, false)
  assert.equal(result.relationCount, adapters.FOUNDATION_TABLES.length - 1)
  assert.equal(
    client.queries.some((sql) => sql.startsWith('do $profitability_foundation_v2_exact_catalog_postflight$')),
    false,
  )
  assert.equal(client.queries.at(-1), 'rollback')
})
