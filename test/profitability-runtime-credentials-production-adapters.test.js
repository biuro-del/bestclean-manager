'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const { EXPECTED } = require('../scripts/lib/profitability-runtime-credentials-activation')
const {
  APP_HOSTING_SERVICE_AGENT_MEMBER,
  EXPECTED_APP_HOSTING_SECRET_MEMBERS,
  MANAGED_LABELS,
  RUNTIME_MEMBER,
  SECRET_ACCESSOR_ROLE,
  SECRET_VERSION_MANAGER_ROLE,
  SECRET_VIEWER_ROLE,
  createRuntimeDatabaseAdapter,
  createRuntimeIdentityAdapter,
  createSecretManagerAdapter,
  policyHasExactAppHostingSecretPolicy,
  policyHasExactRuntimeAccessor,
  policyHasNoAppHostingSecretPolicy,
  policyHasNoRuntimeAccessor,
  policyHasNoRuntimeMember,
  secretMetadataExact,
  secretResourceName,
  secretResourceNames,
  secretVersionNameExact,
} = require('../scripts/lib/profitability-runtime-credentials-production-adapters')

function managedSecret() {
  return {
    name: secretResourceName(),
    labels: { ...MANAGED_LABELS },
    replication: { automatic: {} },
  }
}

test('managed Secret Manager container is pinned to exact metadata', () => {
  assert.equal(secretMetadataExact(managedSecret()), true)
  const numericName = `projects/${EXPECTED.projectNumber}/secrets/${EXPECTED.secretId}`
  assert.equal(secretMetadataExact({ ...managedSecret(), name: numericName }), true)
  assert.deepEqual(secretResourceNames(), [secretResourceName(), numericName])
  assert.equal(secretVersionNameExact(`${numericName}/versions/7`), true)
  assert.equal(secretVersionNameExact('projects/999999999999/secrets/PROFITABILITY_DB_PASS/versions/7'), false)
  assert.equal(secretMetadataExact({
    ...managedSecret(),
    labels: { ...MANAGED_LABELS, extra: 'unsafe' },
  }), false)
  assert.equal(secretMetadataExact({
    ...managedSecret(),
    replication: { userManaged: { replicas: [] } },
  }), false)
})

test('Secret Manager adapter sends payload only in the API body and never returns it', async () => {
  const calls = []
  let metadataExists = false
  let storedPayload = null
  const api = {
    async request(method, url, options = {}) {
      calls.push({ method, url, options })
      if (method === 'GET' && url.endsWith(`/secrets/${EXPECTED.secretId}`)) {
        if (!metadataExists) {
          const error = new Error('not found')
          error.status = 404
          throw error
        }
        return managedSecret()
      }
      if (method === 'POST' && url.endsWith('/secrets')
          && options.query?.secretId === EXPECTED.secretId) {
        metadataExists = true
        return managedSecret()
      }
      if (method === 'POST' && url.endsWith(':addVersion')) {
        storedPayload = options.data.payload.data
        return {
          name: `${secretResourceName()}/versions/7`,
          state: 'ENABLED',
        }
      }
      if (method === 'GET' && url.endsWith('/versions/7:access')) {
        return { payload: { data: storedPayload } }
      }
      throw new Error(`unexpected API call ${method} ${url}`)
    },
  }
  const adapter = createSecretManagerAdapter({ api })
  const payload = Buffer.alloc(48, 11)
  const secretText = payload.toString('base64')

  assert.deepEqual(await adapter.ensureContainer({ mutate: true }), {
    created: true,
    name: secretResourceName(),
  })
  const version = await adapter.addVersion({ payload, mutate: true })
  assert.deepEqual(version, {
    name: `${secretResourceName()}/versions/7`,
    state: 'ENABLED',
  })
  const versionCall = calls.find((call) => call.url.endsWith(':addVersion'))
  assert.equal(versionCall.options.data.payload.data, secretText)
  assert.equal(versionCall.url.includes(secretText), false)
  assert.equal(JSON.stringify(version).includes(secretText), false)
  assert.equal(await adapter.verifyVersionPayload({
    versionName: version.name,
    expectedPayload: payload,
  }), true)
  assert.equal(await adapter.verifyVersionPayload({
    versionName: version.name,
    expectedPayload: Buffer.alloc(48, 12),
  }), false)
  await assert.rejects(adapter.addVersion({ payload }), /SECRET_VERSION_CREATE_OPT_IN_REQUIRED/)
})

test('Secret Manager adapter accepts canonical numeric project names returned by Google', async () => {
  const numericName = `projects/${EXPECTED.projectNumber}/secrets/${EXPECTED.secretId}`
  let storedPayload = null
  const api = {
    async request(method, url, options = {}) {
      if (method === 'GET' && url.endsWith(`/secrets/${EXPECTED.secretId}`)) {
        return { ...managedSecret(), name: numericName }
      }
      if (method === 'POST' && url.endsWith(':addVersion')) {
        storedPayload = options.data.payload.data
        return { name: `${numericName}/versions/8`, state: 'ENABLED' }
      }
      if (method === 'GET' && url.endsWith(`${numericName}/versions/8:access`)) {
        return { payload: { data: storedPayload } }
      }
      throw new Error(`unexpected API call ${method} ${url}`)
    },
  }
  const adapter = createSecretManagerAdapter({ api })
  const payload = Buffer.alloc(48, 13)

  assert.deepEqual(await adapter.ensureContainer({ mutate: true }), {
    created: false,
    name: secretResourceName(),
  })
  const version = await adapter.addVersion({ payload, mutate: true })
  assert.deepEqual(version, { name: `${numericName}/versions/8`, state: 'ENABLED' })
  assert.equal(await adapter.verifyVersionPayload({
    versionName: version.name,
    expectedPayload: payload,
  }), true)
})

test('Secret Manager adapter resolves an ambiguous create before reporting persistent state', async () => {
  const numericName = `projects/${EXPECTED.projectNumber}/secrets/${EXPECTED.secretId}`
  let exists = false
  const api = {
    async request(method, url) {
      if (method === 'GET' && url.endsWith(`/secrets/${EXPECTED.secretId}`)) {
        if (!exists) {
          const error = new Error('not found')
          error.status = 404
          throw error
        }
        return { ...managedSecret(), name: numericName }
      }
      if (method === 'POST' && url.endsWith('/secrets')) {
        exists = true
        throw new Error('SECRET_CREATE_FAILED')
      }
      throw new Error(`unexpected API call ${method} ${url}`)
    },
  }

  assert.deepEqual(
    await createSecretManagerAdapter({ api }).ensureContainer({ mutate: true }),
    { created: true, name: secretResourceName() },
  )
})

test('Secret Manager IAM replacement grants only exact App Hosting secret access', async () => {
  const calls = []
  let policy = {
    version: 3,
    etag: 'etag-1',
    bindings: [],
  }
  const api = {
    async request(method, url, options = {}) {
      calls.push({ method, url, options })
      if (method === 'GET' && url.endsWith(':getIamPolicy')) return policy
      if (method === 'POST' && url.endsWith(':setIamPolicy')) {
        policy = { ...options.data.policy, etag: 'etag-2' }
        return policy
      }
      throw new Error('unexpected API call')
    },
  }
  const adapter = createSecretManagerAdapter({ api })
  const updated = await adapter.setExactRuntimeAccessor({ mutate: true })
  assert.equal(policyHasExactRuntimeAccessor(updated), true)
  assert.equal(policyHasExactAppHostingSecretPolicy(updated), true)
  assert.equal(policyHasNoRuntimeAccessor(updated), false)
  assert.equal(policyHasNoAppHostingSecretPolicy(updated), false)
  assert.equal(policyHasNoRuntimeAccessor({
    bindings: [{
      role: SECRET_ACCESSOR_ROLE,
      members: ['allAuthenticatedUsers'],
    }],
  }), false)
  assert.deepEqual(
    updated.bindings.find((binding) => binding.role === SECRET_ACCESSOR_ROLE),
    { role: SECRET_ACCESSOR_ROLE, members: [RUNTIME_MEMBER] },
  )
  assert.deepEqual(
    updated.bindings.find((binding) => binding.role === SECRET_VIEWER_ROLE),
    { role: SECRET_VIEWER_ROLE, members: [RUNTIME_MEMBER] },
  )
  assert.deepEqual(
    updated.bindings.find((binding) => binding.role === SECRET_VERSION_MANAGER_ROLE),
    { role: SECRET_VERSION_MANAGER_ROLE, members: [APP_HOSTING_SERVICE_AGENT_MEMBER] },
  )
  assert.deepEqual(EXPECTED_APP_HOSTING_SECRET_MEMBERS, {
    [SECRET_ACCESSOR_ROLE]: [RUNTIME_MEMBER],
    [SECRET_VIEWER_ROLE]: [RUNTIME_MEMBER],
    [SECRET_VERSION_MANAGER_ROLE]: [APP_HOSTING_SERVICE_AGENT_MEMBER],
  })
  assert.equal(updated.bindings.length, 3)
  const setCall = calls.find((call) => call.url.endsWith(':setIamPolicy'))
  assert.equal(setCall.options.data.policy.etag, 'etag-1')
  assert.equal(calls.filter((call) => call.url.endsWith(':getIamPolicy')).length, 1)
})

test('Secret Manager IAM CAS refuses a concurrent policy change without losing bindings', async () => {
  let policy = {
    version: 3,
    etag: 'etag-1',
    bindings: [],
  }
  const api = {
    async request(method, url, options = {}) {
      if (method === 'GET' && url.endsWith(':getIamPolicy')) {
        const snapshot = structuredClone(policy)
        policy = {
          version: 3,
          etag: 'etag-2',
          bindings: [
            ...policy.bindings,
            { role: 'roles/logging.viewer', members: ['user:concurrent@example.com'] },
          ],
        }
        return snapshot
      }
      if (method === 'POST' && url.endsWith(':setIamPolicy')) {
        assert.equal(options.data.policy.etag, 'etag-1')
        const error = new Error('conflict')
        error.response = { status: 409 }
        throw error
      }
      throw new Error('unexpected API call')
    },
  }
  await assert.rejects(
    createSecretManagerAdapter({ api }).setExactRuntimeAccessor({ mutate: true }),
    /conflict/,
  )
  assert.ok(policy.bindings.some((binding) => (
    binding.members.includes('user:concurrent@example.com')
  )))
})

test('Secret Manager containment removes only managed App Hosting secret grants', async () => {
  let policy = {
    version: 3,
    etag: 'etag-7',
    bindings: [
      {
        role: SECRET_VIEWER_ROLE,
        members: [RUNTIME_MEMBER, 'user:auditor@example.com'],
      },
      { role: SECRET_ACCESSOR_ROLE, members: [RUNTIME_MEMBER, 'serviceAccount:other@example.com'] },
      {
        role: SECRET_VERSION_MANAGER_ROLE,
        members: [APP_HOSTING_SERVICE_AGENT_MEMBER, 'serviceAccount:other@example.com'],
      },
      {
        role: SECRET_ACCESSOR_ROLE,
        members: [APP_HOSTING_SERVICE_AGENT_MEMBER],
      },
      {
        role: 'roles/secretmanager.admin',
        members: [RUNTIME_MEMBER, 'group:security@example.com'],
      },
    ],
  }
  const api = {
    async request(method, url, options = {}) {
      if (method === 'GET' && url.endsWith(':getIamPolicy')) return structuredClone(policy)
      if (method === 'POST' && url.endsWith(':setIamPolicy')) {
        assert.equal(options.data.policy.etag, 'etag-7')
        policy = { ...options.data.policy, etag: 'etag-8' }
        return policy
      }
      throw new Error('unexpected API call')
    },
  }
  const updated = await createSecretManagerAdapter({ api }).removeRuntimeAccessor({
    mutate: true,
    containment: true,
  })
  assert.equal(policyHasNoRuntimeMember(updated), true)
  assert.ok(updated.bindings.some((binding) => (
    binding.role === SECRET_VIEWER_ROLE
      && binding.members.includes('user:auditor@example.com')
      && !binding.members.includes(RUNTIME_MEMBER)
  )))
  assert.ok(updated.bindings.some((binding) => (
    binding.role === SECRET_ACCESSOR_ROLE
      && binding.members.includes('serviceAccount:other@example.com')
  )))
  assert.ok(updated.bindings.some((binding) => (
    binding.role === SECRET_VERSION_MANAGER_ROLE
      && binding.members.includes('serviceAccount:other@example.com')
      && !binding.members.includes(APP_HOSTING_SERVICE_AGENT_MEMBER)
  )))
  assert.ok(updated.bindings.some((binding) => (
    binding.role === 'roles/secretmanager.admin'
      && binding.members.includes('group:security@example.com')
      && !binding.members.includes(RUNTIME_MEMBER)
  )))
  assert.equal(updated.bindings.some((binding) => (
    (binding.members || []).includes(APP_HOSTING_SERVICE_AGENT_MEMBER)
  )), false)
})

test('Secret Manager containment detects a forbidden P4SA accessor', () => {
  const policy = {
    bindings: [{
      role: SECRET_ACCESSOR_ROLE,
      members: [APP_HOSTING_SERVICE_AGENT_MEMBER],
    }],
  }
  assert.equal(policyHasNoRuntimeMember(policy), false)
})

test('Secret Manager IAM refuses to replace an unexpected existing accessor', async () => {
  const forbiddenAccessors = [
    APP_HOSTING_SERVICE_AGENT_MEMBER,
    'serviceAccount:firebase-app-hosting-compute@iclean-room.iam.gserviceaccount.com',
    'serviceAccount:other@example.com',
  ]
  for (const forbiddenMember of forbiddenAccessors) {
    const api = {
      async request(method, url) {
        if (method === 'GET' && url.endsWith(':getIamPolicy')) {
          return {
            version: 3,
            etag: 'etag-1',
            bindings: [{ role: SECRET_ACCESSOR_ROLE, members: [forbiddenMember] }],
          }
        }
        throw new Error('unexpected mutation')
      }
    }
    await assert.rejects(
      createSecretManagerAdapter({ api }).setExactRuntimeAccessor({ mutate: true }),
      /SECRET_ACCESS_POLICY_CONFLICT/,
    )
  }
})

test('Secret Manager IAM refuses unexpected App Hosting viewer or version-manager bindings', async () => {
  for (const role of [SECRET_VIEWER_ROLE, SECRET_VERSION_MANAGER_ROLE]) {
    const api = {
      async request(method, url) {
        if (method === 'GET' && url.endsWith(':getIamPolicy')) {
          return {
            version: 3,
            etag: 'etag-1',
            bindings: [{ role, members: ['serviceAccount:other@example.com'] }],
          }
        }
        throw new Error('unexpected mutation')
      },
    }
    await assert.rejects(
      createSecretManagerAdapter({ api }).setExactRuntimeAccessor({ mutate: true }),
      /SECRET_ACCESS_POLICY_CONFLICT/,
    )
  }
})

test('Secret Manager IAM refuses every unrelated existing secret binding', async () => {
  const api = {
    async request(method, url) {
      if (method === 'GET' && url.endsWith(':getIamPolicy')) {
        return {
          version: 3,
          etag: 'etag-1',
          bindings: [{ role: 'roles/logging.viewer', members: ['user:auditor@example.com'] }],
        }
      }
      throw new Error('unexpected mutation')
    },
  }
  await assert.rejects(
    createSecretManagerAdapter({ api }).setExactRuntimeAccessor({ mutate: true }),
    /SECRET_ACCESS_POLICY_CONFLICT/,
  )
})

test('runtime identity audit detects project-wide secret access', async () => {
  const api = {
    async request(method, url) {
      if (method === 'GET' && url.includes('/serviceAccounts/')) {
        return { email: EXPECTED.runtimeServiceAccount, disabled: false }
      }
      if (method === 'POST' && url.endsWith(':getIamPolicy')) {
        return {
          bindings: [{ role: SECRET_ACCESSOR_ROLE, members: [RUNTIME_MEMBER] }],
        }
      }
      if (method === 'POST' && url.includes('policytroubleshooter.googleapis.com')) {
        return {
          overallAccessState: 'CAN_ACCESS',
          allowPolicyExplanation: {
            explainedPolicies: [{
              fullResourceName: '//cloudresourcemanager.googleapis.com/projects/iclean-room',
              allowAccessState: 'ALLOW_ACCESS_STATE_GRANTED',
            }],
          },
        }
      }
      throw new Error('unexpected API call')
    },
  }
  const state = await createRuntimeIdentityAdapter({ api }).inspect()
  assert.equal(state.exists, true)
  assert.equal(state.disabled, false)
  assert.equal(state.projectBroadSecretAccess, true)
  assert.equal(state.inheritedSecretAccess, true)
  assert.equal(state.secretAccessAnalysisExact, true)
  assert.deepEqual(state.projectBroadSecretRoles, [SECRET_ACCESSOR_ROLE])
})

test('runtime identity audit detects custom-role access through a group', async () => {
  const api = {
    async request(method, url) {
      if (method === 'GET' && url.includes('/serviceAccounts/')) {
        return { email: EXPECTED.runtimeServiceAccount, disabled: false }
      }
      if (method === 'POST' && url.endsWith(':getIamPolicy')) {
        return {
          bindings: [{
            role: 'projects/iclean-room/roles/customSecretReader',
            members: ['group:runtime-access@example.com'],
          }],
        }
      }
      if (method === 'POST' && url.includes('policytroubleshooter.googleapis.com')) {
        return {
          overallAccessState: 'CAN_ACCESS',
          allowPolicyExplanation: {
            explainedPolicies: [{
              fullResourceName: '//cloudresourcemanager.googleapis.com/projects/iclean-room',
              allowAccessState: 'ALLOW_ACCESS_STATE_GRANTED',
            }],
          },
        }
      }
      throw new Error('unexpected API call')
    },
  }
  const state = await createRuntimeIdentityAdapter({ api }).inspect()
  assert.equal(state.projectBroadSecretRoles.length, 0)
  assert.equal(state.inheritedSecretAccess, true)
  assert.equal(state.projectBroadSecretAccess, true)
})

test('runtime DB adapter verifies exact roles, password login, SET ROLE and enforcement markers', async () => {
  const calls = []
  const iamClient = {
    async query(sql, values) {
      calls.push({ kind: 'iam', sql: String(sql), values })
      return {
        rows: [{
          database_name: EXPECTED.database,
          server_version_num: 170006,
          in_recovery: false,
          transaction_read_only: 'off',
          default_transaction_read_only: 'off',
          session_exact_count: 1,
          runtime_exact_count: 1,
          membership_total_count: 1,
          membership_exact_count: 1,
        }],
      }
    },
    async end() { calls.push({ kind: 'iam:end' }) },
  }
  const runtimeClient = {
    async query(sql, values) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim()
      calls.push({ kind: 'runtime', sql: normalized, values })
      if (normalized.includes('access_marker_count')) {
        return {
          rows: [{
            session_role: EXPECTED.sessionRole,
            assumed_role: EXPECTED.runtimeRole,
            access_marker_count: 1,
            financial_marker_count: 1,
          }],
        }
      }
      if (normalized.startsWith('select session_user as session_role')) {
        return {
          rows: [{
            session_role: EXPECTED.sessionRole,
            current_role: EXPECTED.sessionRole,
            may_set_runtime_role: true,
          }],
        }
      }
      if (normalized === `set role ${EXPECTED.runtimeRole}`) return { rows: [] }
      throw new Error(`unexpected query: ${normalized}`)
    },
    async end() { calls.push({ kind: 'runtime:end' }) },
  }
  const pgAdapter = {
    async connectIamAdmin(config) {
      assert.equal(config.user, 'biuro@bestclean.pl')
      return iamClient
    },
    async connectBuiltin(config) {
      assert.equal(config.user, EXPECTED.sessionRole)
      assert.equal(config.password, 'x'.repeat(48))
      return runtimeClient
    },
    async close() {},
  }
  const adapter = createRuntimeDatabaseAdapter({ pgAdapter })
  const roleState = await adapter.inspectRoles()
  assert.equal(roleState.runtimeCredentialRolesExact, true)
  const probe = await adapter.verifyRuntimeCredential({ password: 'x'.repeat(48) })
  assert.deepEqual(probe, {
    sessionRole: EXPECTED.sessionRole,
    assumedRole: EXPECTED.runtimeRole,
    maySetRuntimeRole: true,
    runtimeSchemaMarkersExact: true,
  })
  assert.ok(calls.some((call) => call.sql === `set role ${EXPECTED.runtimeRole}`))
})

test('runtime DB rejection check accepts only PostgreSQL invalid-password evidence', async () => {
  const invalidPassword = Object.assign(new Error('password authentication failed'), { code: '28P01' })
  const pgAdapter = {
    async connectBuiltin() { throw invalidPassword },
    async connectIamAdmin() { throw new Error('not used') },
    async close() {},
  }
  const adapter = createRuntimeDatabaseAdapter({ pgAdapter })
  assert.equal(await adapter.verifyPasswordRejected({ password: 'x'.repeat(48) }), true)

  const timeoutAdapter = createRuntimeDatabaseAdapter({
    pgAdapter: {
      async connectBuiltin() { throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }) },
      async connectIamAdmin() { throw new Error('not used') },
      async close() {},
    },
  })
  await assert.rejects(
    timeoutAdapter.verifyPasswordRejected({ password: 'x'.repeat(48) }),
    /RUNTIME_CREDENTIAL_REJECTION_UNVERIFIABLE/,
  )
})
