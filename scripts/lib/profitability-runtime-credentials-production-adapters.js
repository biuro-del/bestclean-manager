'use strict'

const crypto = require('node:crypto')
const { GoogleAuth } = require('google-auth-library')

const {
  createCloudSqlAdminApiAdapter,
  createCloudSqlPgAdapter,
} = require('./profitability-foundation-production-adapters')
const {
  createProfitabilityAccessV21ProductionDependencies,
} = require('./profitability-access-v21-production-adapters')
const { EXPECTED } = require('./profitability-runtime-credentials-activation')

const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'
const SECRET_MANAGER_BASE_URL = 'https://secretmanager.googleapis.com/v1'
const RESOURCE_MANAGER_BASE_URL = 'https://cloudresourcemanager.googleapis.com/v1'
const IAM_BASE_URL = 'https://iam.googleapis.com/v1'
const POLICY_TROUBLESHOOTER_URL = 'https://policytroubleshooter.googleapis.com/v3/iam:troubleshoot'
const REQUEST_TIMEOUT_MS = 30000
const IAM_DATABASE_USER = 'biuro@bestclean.pl'
const REMOTE = 'cleanzi01'
const REMOTE_URL = 'https://github.com/biuro-del/Cleanzi-01.git'
const SECRET_ACCESSOR_ROLE = 'roles/secretmanager.secretAccessor'
const RUNTIME_MEMBER = `serviceAccount:${EXPECTED.runtimeServiceAccount}`
const MANAGED_LABELS = Object.freeze({
  component: 'profitability-runtime-credentials',
  managed_by: 'cleanzi',
  schema: 'v1',
})
const BROAD_SECRET_ROLES = Object.freeze(new Set([
  'roles/owner',
  'roles/editor',
  'roles/secretmanager.admin',
  SECRET_ACCESSOR_ROLE,
]))

function text(value) {
  return String(value ?? '').trim()
}

function requireMutation(value, code) {
  if (value !== true) throw new Error(code)
}

function safeApiError(code, error) {
  const wrapped = new Error(code)
  const status = Number(error?.response?.status || error?.code)
  if (Number.isFinite(status)) wrapped.status = status
  return wrapped
}

function unwrap(response) {
  return response && Object.prototype.hasOwnProperty.call(response, 'data')
    ? response.data
    : response
}

function clonePolicy(policy = {}) {
  return {
    version: Number(policy.version || 3),
    etag: text(policy.etag),
    bindings: (Array.isArray(policy.bindings) ? policy.bindings : []).map((binding) => ({
      role: text(binding.role),
      members: [...new Set((binding.members || []).map(text).filter(Boolean))].sort(),
      ...(binding.condition ? { condition: { ...binding.condition } } : {}),
    })),
  }
}

function policyHasExactRuntimeAccessor(policy) {
  const bindings = (policy?.bindings || []).filter(
    (binding) => text(binding.role) === SECRET_ACCESSOR_ROLE,
  )
  return bindings.length === 1
    && !bindings[0].condition
    && bindings[0].members?.length === 1
    && bindings[0].members[0] === RUNTIME_MEMBER
}

function policyHasNoRuntimeAccessor(policy) {
  return !(policy?.bindings || []).some(
    (binding) => text(binding.role) === SECRET_ACCESSOR_ROLE,
  )
}

function policyHasNoRuntimeMember(policy) {
  return !(policy?.bindings || []).some((binding) => (
    text(binding.role) === SECRET_ACCESSOR_ROLE
      && (binding.members || []).map(text).includes(RUNTIME_MEMBER)
  ))
}

function secretMetadataExact(secret) {
  if (!secret || text(secret.name) !== secretResourceName()) return false
  const labels = secret.labels || {}
  const expectedEntries = Object.entries(MANAGED_LABELS)
  return Boolean(Object.keys(labels).length === expectedEntries.length
    && expectedEntries.every(([key, value]) => labels[key] === value)
    && secret.replication?.automatic
    && !secret.replication?.userManaged)
}

function secretResourceName() {
  return `projects/${EXPECTED.project}/secrets/${EXPECTED.secretId}`
}

function createGoogleCloudRequestAdapter(options = {}) {
  const auth = options.auth || new GoogleAuth({ scopes: [CLOUD_PLATFORM_SCOPE] })
  let clientPromise = null
  const injectedRequest = options.request

  async function getRequest() {
    if (injectedRequest) return injectedRequest
    if (!clientPromise) clientPromise = auth.getClient()
    const pending = clientPromise
    let client
    try {
      client = await pending
    } catch (error) {
      if (clientPromise === pending) clientPromise = null
      throw error
    }
    return (requestOptions) => client.request(requestOptions)
  }

  async function request(method, url, {
    containment = false,
    data,
    query,
    code = 'GOOGLE_CLOUD_REQUEST_FAILED',
  } = {}) {
    const target = new URL(url)
    for (const [name, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null && value !== '') {
        target.searchParams.set(name, String(value))
      }
    }
    const controller = new AbortController()
    const timeoutMs = options.timeoutMs || REQUEST_TIMEOUT_MS
    let timer = null
    let onExternalAbort = null
    const deadline = new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new Error('GOOGLE_CLOUD_REQUEST_TIMEOUT'))
      }, timeoutMs)
      if (!containment && options.signal) {
        onExternalAbort = () => {
          controller.abort()
          reject(new Error('GOOGLE_CLOUD_REQUEST_ABORTED'))
        }
        if (options.signal.aborted) onExternalAbort()
        else options.signal.addEventListener('abort', onExternalAbort, { once: true })
      }
    })
    const invocation = Promise.resolve().then(async () => {
      if (controller.signal.aborted) throw new Error('GOOGLE_CLOUD_REQUEST_ABORTED')
      const invoke = await getRequest()
      return invoke({
        method,
        url: target.toString(),
        data,
        signal: controller.signal,
        timeout: timeoutMs,
      })
    })
    try {
      return unwrap(await Promise.race([invocation, deadline]))
    } catch (error) {
      if (error?.message === 'GOOGLE_CLOUD_REQUEST_TIMEOUT') clientPromise = null
      throw safeApiError(code, error)
    } finally {
      if (timer) clearTimeout(timer)
      if (onExternalAbort && options.signal) {
        options.signal.removeEventListener('abort', onExternalAbort)
      }
    }
  }

  return Object.freeze({ request })
}

function createSecretManagerAdapter(options = {}) {
  const api = options.api || createGoogleCloudRequestAdapter(options)
  const secretName = secretResourceName()
  const secretUrl = `${SECRET_MANAGER_BASE_URL}/${secretName}`

  async function inspectMetadata({ containment = false } = {}) {
    try {
      return await api.request('GET', secretUrl, {
        code: 'SECRET_METADATA_READ_FAILED',
        containment,
      })
    } catch (error) {
      if (error.status === 404) return null
      throw error
    }
  }

  async function getPolicy({ containment = false } = {}) {
    const policy = await api.request('GET', `${secretUrl}:getIamPolicy`, {
      query: { 'options.requestedPolicyVersion': 3 },
      code: 'SECRET_IAM_READ_FAILED',
      containment,
    })
    return clonePolicy(policy)
  }

  async function setPolicy(policy, { mutate, containment = false } = {}) {
    requireMutation(mutate, 'SECRET_IAM_MUTATION_OPT_IN_REQUIRED')
    const desired = clonePolicy(policy)
    if (!desired.etag) throw new Error('SECRET_IAM_ETAG_REQUIRED')
    return clonePolicy(await api.request('POST', `${secretUrl}:setIamPolicy`, {
      data: {
        policy: {
          version: 3,
          etag: desired.etag,
          bindings: desired.bindings,
        },
      },
      code: containment ? 'SECRET_IAM_CONTAINMENT_FAILED' : 'SECRET_IAM_WRITE_FAILED',
      containment,
    }))
  }

  async function inspectLatestVersion({ containment = false } = {}) {
    try {
      return await api.request('GET', `${secretUrl}/versions/latest`, {
        code: 'SECRET_VERSION_READ_FAILED',
        containment,
      })
    } catch (error) {
      if (error.status === 404) return null
      throw error
    }
  }

  async function inspect({ containment = false } = {}) {
    const metadata = await inspectMetadata({ containment })
    if (!metadata) {
      return Object.freeze({
        exists: false,
        managedExact: false,
        accessorExact: false,
        accessorAbsent: true,
        latestVersionName: null,
        latestVersionState: null,
      })
    }
    const [policy, latest] = await Promise.all([
      getPolicy({ containment }),
      inspectLatestVersion({ containment }),
    ])
    return Object.freeze({
      exists: true,
      managedExact: secretMetadataExact(metadata),
      accessorExact: policyHasExactRuntimeAccessor(policy),
      accessorAbsent: policyHasNoRuntimeAccessor(policy),
      latestVersionName: text(latest?.name) || null,
      latestVersionState: text(latest?.state) || null,
    })
  }

  async function ensureContainer({ mutate } = {}) {
    requireMutation(mutate, 'SECRET_CREATE_OPT_IN_REQUIRED')
    const existing = await inspectMetadata()
    if (existing) {
      if (!secretMetadataExact(existing)) throw new Error('SECRET_CONTAINER_CONFLICT')
      return Object.freeze({ created: false, name: secretName })
    }
    const created = await api.request(
      'POST',
      `${SECRET_MANAGER_BASE_URL}/projects/${EXPECTED.project}/secrets`,
      {
        query: { secretId: EXPECTED.secretId },
        data: { labels: MANAGED_LABELS, replication: { automatic: {} } },
        code: 'SECRET_CREATE_FAILED',
      },
    )
    if (!secretMetadataExact(created)) throw new Error('SECRET_CREATE_POSTFLIGHT_FAILED')
    return Object.freeze({ created: true, name: secretName })
  }

  async function addVersion({ payload, mutate } = {}) {
    requireMutation(mutate, 'SECRET_VERSION_CREATE_OPT_IN_REQUIRED')
    if (!Buffer.isBuffer(payload) || payload.length < 32) {
      throw new Error('SECRET_VERSION_PAYLOAD_INVALID')
    }
    const version = await api.request('POST', `${secretUrl}:addVersion`, {
      // The secret is carried only in the authenticated request body. It never
      // enters argv, environment variables, command output or child processes.
      data: { payload: { data: payload.toString('base64') } },
      code: 'SECRET_VERSION_CREATE_FAILED',
    })
    const name = text(version?.name)
    if (!name.startsWith(`${secretName}/versions/`) || text(version?.state) !== 'ENABLED') {
      throw new Error('SECRET_VERSION_CREATE_POSTFLIGHT_FAILED')
    }
    return Object.freeze({ name, state: 'ENABLED' })
  }

  async function verifyVersionPayload({ versionName, expectedPayload } = {}) {
    const name = text(versionName)
    if (!name.startsWith(`${secretName}/versions/`)
        || !Buffer.isBuffer(expectedPayload)
        || expectedPayload.length < 32) {
      throw new Error('SECRET_VERSION_PAYLOAD_VERIFICATION_INVALID')
    }
    const accessed = await api.request(
      'GET',
      `${SECRET_MANAGER_BASE_URL}/${name}:access`,
      { code: 'SECRET_VERSION_PAYLOAD_READ_FAILED' },
    )
    const encoded = text(accessed?.payload?.data)
    if (!encoded) throw new Error('SECRET_VERSION_PAYLOAD_READ_FAILED')
    const actual = Buffer.from(encoded, 'base64')
    try {
      return actual.length === expectedPayload.length
        && crypto.timingSafeEqual(actual, expectedPayload)
    } finally {
      actual.fill(0)
    }
  }

  async function destroyVersion({ versionName, mutate, containment } = {}) {
    requireMutation(mutate, 'SECRET_VERSION_DESTROY_OPT_IN_REQUIRED')
    const name = text(versionName)
    if (!name.startsWith(`${secretName}/versions/`)) {
      throw new Error('SECRET_VERSION_NAME_INVALID')
    }
    const version = await api.request('POST', `${SECRET_MANAGER_BASE_URL}/${name}:destroy`, {
      data: {},
      code: containment
        ? 'SECRET_VERSION_DESTROY_CONTAINMENT_FAILED'
        : 'SECRET_VERSION_DESTROY_FAILED',
      containment,
    })
    if (text(version?.state) !== 'DESTROYED') throw new Error('SECRET_VERSION_NOT_DESTROYED')
  }

  async function disableVersion({ versionName, mutate, containment } = {}) {
    requireMutation(mutate, 'SECRET_VERSION_DISABLE_OPT_IN_REQUIRED')
    const name = text(versionName)
    if (!name.startsWith(`${secretName}/versions/`)) {
      throw new Error('SECRET_VERSION_NAME_INVALID')
    }
    const version = await api.request('POST', `${SECRET_MANAGER_BASE_URL}/${name}:disable`, {
      data: {},
      code: containment
        ? 'SECRET_VERSION_DISABLE_CONTAINMENT_FAILED'
        : 'SECRET_VERSION_DISABLE_FAILED',
      containment,
    })
    if (!['DISABLED', 'DESTROYED'].includes(text(version?.state))) {
      throw new Error('SECRET_VERSION_NOT_DISABLED')
    }
  }

  async function setExactRuntimeAccessor({ mutate } = {}) {
    requireMutation(mutate, 'SECRET_IAM_MUTATION_OPT_IN_REQUIRED')
    const current = await getPolicy()
    if (policyHasExactRuntimeAccessor(current)) return current
    if (!policyHasNoRuntimeAccessor(current)) throw new Error('SECRET_ACCESS_POLICY_CONFLICT')
    const bindings = [...current.bindings]
    bindings.push({ role: SECRET_ACCESSOR_ROLE, members: [RUNTIME_MEMBER] })
    const updated = await setPolicy({ ...current, bindings }, { mutate: true })
    if (!policyHasExactRuntimeAccessor(updated)) throw new Error('SECRET_IAM_POSTFLIGHT_FAILED')
    return updated
  }

  async function removeRuntimeAccessor({ mutate, containment = false } = {}) {
    requireMutation(mutate, 'SECRET_IAM_MUTATION_OPT_IN_REQUIRED')
    const current = await getPolicy({ containment })
    const bindings = current.bindings.flatMap((binding) => {
      if (binding.role !== SECRET_ACCESSOR_ROLE) return [binding]
      const members = (binding.members || []).filter((member) => member !== RUNTIME_MEMBER)
      return members.length ? [{ ...binding, members }] : []
    })
    if (policyHasNoRuntimeMember(current)) return current
    const updated = await setPolicy(
      { ...current, bindings },
      { mutate: true, containment },
    )
    if (!policyHasNoRuntimeMember(updated)) throw new Error('SECRET_IAM_CONTAINMENT_POSTFLIGHT_FAILED')
    return updated
  }

  return Object.freeze({
    addVersion,
    destroyVersion,
    disableVersion,
    ensureContainer,
    getPolicy,
    inspect,
    policyHasExactRuntimeAccessor,
    removeRuntimeAccessor,
    setExactRuntimeAccessor,
    verifyVersionPayload,
  })
}

function createRuntimeIdentityAdapter(options = {}) {
  const api = options.api || createGoogleCloudRequestAdapter(options)
  const projectFullResourceName = `//cloudresourcemanager.googleapis.com/projects/${EXPECTED.project}`

  async function inspect() {
    const accountName = encodeURIComponent(EXPECTED.runtimeServiceAccount)
    const [account, projectPolicy, troubleshoot] = await Promise.all([
      api.request(
        'GET',
        `${IAM_BASE_URL}/projects/${EXPECTED.project}/serviceAccounts/${accountName}`,
        { code: 'RUNTIME_SERVICE_ACCOUNT_READ_FAILED' },
      ),
      api.request(
        'POST',
        `${RESOURCE_MANAGER_BASE_URL}/projects/${EXPECTED.project}:getIamPolicy`,
        {
          data: { options: { requestedPolicyVersion: 3 } },
          code: 'PROJECT_IAM_READ_FAILED',
        },
      ),
      api.request('POST', POLICY_TROUBLESHOOTER_URL, {
        data: {
          accessTuple: {
            principal: EXPECTED.runtimeServiceAccount,
            fullResourceName: projectFullResourceName,
            permission: 'secretmanager.versions.access',
          },
        },
        code: 'SECRET_ACCESS_TROUBLESHOOT_FAILED',
      }),
    ])
    const broadBindings = (projectPolicy?.bindings || []).filter((binding) => (
      BROAD_SECRET_ROLES.has(text(binding.role))
        && (binding.members || []).map(text).includes(RUNTIME_MEMBER)
    ))
    const overallAccessState = text(troubleshoot?.overallAccessState)
    const inheritedSecretAccess = overallAccessState === 'CAN_ACCESS'
    return Object.freeze({
      serviceAccount: text(account?.email),
      exists: text(account?.email) === EXPECTED.runtimeServiceAccount,
      disabled: account?.disabled === true,
      projectBroadSecretAccess: broadBindings.length > 0 || inheritedSecretAccess,
      projectBroadSecretRoles: Object.freeze(broadBindings.map((binding) => text(binding.role))),
      effectiveProjectSecretAccess: overallAccessState,
      secretAccessAnalysisExact: ['CAN_ACCESS', 'CANNOT_ACCESS'].includes(overallAccessState),
      inheritedSecretAccess,
    })
  }

  return Object.freeze({ inspect })
}

function createRuntimeDatabaseAdapter(options = {}) {
  const pgAdapter = options.pgAdapter || createCloudSqlPgAdapter({
    instanceConnectionName: `${EXPECTED.project}:${EXPECTED.region}:${EXPECTED.instance}`,
    ipType: options.ipType || 'PUBLIC',
    ConnectorClass: options.ConnectorClass,
    ClientClass: options.ClientClass,
    connector: options.connector,
    signal: options.signal,
    connectTimeoutMs: options.pgConnectTimeoutMs,
    queryTimeoutMs: options.pgQueryTimeoutMs,
  })

  async function withIamClient(callback, { containment = false } = {}) {
    const client = await pgAdapter.connectIamAdmin({
      database: EXPECTED.database,
      user: IAM_DATABASE_USER,
      applicationName: 'cleanzi-profitability-runtime-credential-audit',
      containment,
    })
    try {
      return await callback(client)
    } finally {
      await client.end()
    }
  }

  async function inspectRoles() {
    return withIamClient(async (client) => {
      const result = await client.query(
        `with role_state as (
           select rolname, rolcanlogin, rolinherit, rolsuper, rolcreaterole,
                  rolcreatedb, rolreplication, rolbypassrls, rolconnlimit,
                  rolvaliduntil, rolconfig
             from pg_roles
            where rolname = any($1::text[])
         ), memberships as (
           select granted.rolname as granted_role,
                  member_role.rolname as member_role,
                  membership.admin_option,
                  membership.inherit_option,
                  membership.set_option
             from pg_auth_members membership
             join pg_roles granted on granted.oid = membership.roleid
             join pg_roles member_role on member_role.oid = membership.member
            where member_role.rolname = $2::text
         )
         select current_database() as database_name,
                current_setting('server_version_num')::integer as server_version_num,
                pg_is_in_recovery() as in_recovery,
                current_setting('transaction_read_only') as transaction_read_only,
                current_setting('default_transaction_read_only') as default_transaction_read_only,
                count(*) filter (
                  where rolname = $2::text and rolcanlogin and not rolinherit
                    and not rolsuper and not rolcreaterole and not rolcreatedb
                    and not rolreplication and not rolbypassrls and rolconnlimit = -1
                    and rolvaliduntil is null and rolconfig is null
                )::integer as session_exact_count,
                count(*) filter (
                  where rolname = $3::text and not rolcanlogin and not rolinherit
                    and not rolsuper and not rolcreaterole and not rolcreatedb
                    and not rolreplication and not rolbypassrls and rolconnlimit = -1
                    and rolvaliduntil is null and rolconfig is null
                )::integer as runtime_exact_count,
                (select count(*)::integer from memberships) as membership_total_count,
                (select count(*)::integer from memberships
                  where granted_role = $3::text and member_role = $2::text
                    and not admin_option and not inherit_option and set_option
                ) as membership_exact_count
           from role_state`,
        [[EXPECTED.sessionRole, EXPECTED.runtimeRole], EXPECTED.sessionRole, EXPECTED.runtimeRole],
      )
      const row = result.rows?.[0] || {}
      return Object.freeze({
        database: row.database_name,
        pgMajor: Math.floor(Number(row.server_version_num || 0) / 10000),
        primary: row.in_recovery === false,
        readWrite: row.transaction_read_only === 'off'
          && row.default_transaction_read_only === 'off',
        runtimeCredentialRolesExact: Number(row.session_exact_count) === 1
          && Number(row.runtime_exact_count) === 1
          && Number(row.membership_total_count) === 1
          && Number(row.membership_exact_count) === 1,
      })
    })
  }

  async function verifyRuntimeCredential({ password, containment = false } = {}) {
    let client = null
    try {
      client = await pgAdapter.connectBuiltin({
        database: EXPECTED.database,
        user: EXPECTED.sessionRole,
        password,
        applicationName: 'cleanzi-profitability-runtime-credential-probe',
        containment,
      })
      const before = await client.query(
        `select session_user as session_role,
                current_user as current_role,
                pg_has_role(session_user, $1::text, 'SET') as may_set_runtime_role`,
        [EXPECTED.runtimeRole],
      )
      const initial = before.rows?.[0] || {}
      if (initial.session_role !== EXPECTED.sessionRole
          || initial.current_role !== EXPECTED.sessionRole
          || initial.may_set_runtime_role !== true) {
        throw new Error('RUNTIME_DATABASE_IDENTITY_NOT_EXACT')
      }
      await client.query(`set role ${EXPECTED.runtimeRole}`)
      const after = await client.query(
        `select session_user as session_role,
                current_user as assumed_role,
                (select count(*)::integer
                   from public.profitability_access_enforcement
                  where org_id = 'bestclean' and schema_version = 'v2') as access_marker_count,
                (select count(*)::integer
                   from public.profitability_financial_model_enforcement
                  where org_id = 'bestclean' and schema_version = 'v2.1') as financial_marker_count`,
      )
      const assumed = after.rows?.[0] || {}
      return Object.freeze({
        sessionRole: assumed.session_role,
        assumedRole: assumed.assumed_role,
        maySetRuntimeRole: true,
        runtimeSchemaMarkersExact: Number(assumed.access_marker_count) === 1
          && Number(assumed.financial_marker_count) === 1,
      })
    } finally {
      try { await client?.end?.() } catch {}
    }
  }

  async function verifyPasswordRejected({ password, containment = false } = {}) {
    try {
      await verifyRuntimeCredential({ password, containment })
      return false
    } catch (error) {
      if (text(error?.code).toUpperCase() === '28P01') return true
      throw new Error('RUNTIME_CREDENTIAL_REJECTION_UNVERIFIABLE')
    }
  }

  return Object.freeze({ inspectRoles, verifyPasswordRejected, verifyRuntimeCredential, close: () => pgAdapter.close() })
}

function createProfitabilityRuntimeCredentialDependencies(options = {}) {
  const base = options.base || createProfitabilityAccessV21ProductionDependencies({
    ...options,
    remote: REMOTE,
    remoteUrl: REMOTE_URL,
  })
  const api = options.api || createGoogleCloudRequestAdapter(options)
  const secretManager = options.secretManager || createSecretManagerAdapter({ ...options, api })
  const identity = options.identity || createRuntimeIdentityAdapter({ ...options, api })
  const databaseAdmin = options.databaseAdmin || createRuntimeDatabaseAdapter(options)
  const cloudApi = options.cloudApi || createCloudSqlAdminApiAdapter({
    projectId: EXPECTED.project,
    instanceId: EXPECTED.instance,
    auth: options.auth,
    request: options.cloudSqlRequest,
    sleep: options.sleep,
    now: options.now,
    requestTimeoutMs: options.cloudRequestTimeoutMs,
  })

  const cloudSqlAdmin = Object.freeze({
    updateRuntimePassword: ({ password, mutate, containment = false }) => (
      cloudApi.updateBuiltinUserPassword({
        name: EXPECTED.sessionRole,
        password,
        mutate,
        ...(containment ? {
          operationTimeoutMs: 30000,
          operationPollIntervalMs: 500,
        } : {}),
      })
    ),
    settleRuntimePasswordUpdate: ({ operationName }) => (
      cloudApi.settleBuiltinUserPasswordUpdate({ operationName })
    ),
  })

  const environment = Object.freeze({
    async inspect(runOptions, probe = {}) {
      const [source, cloud, baseDatabase, credentialRoles, runtimeIdentity, secret] =
        await Promise.all([
          base.sourceControl.inspect(runOptions),
          base.cloudSqlAdmin.inspect(runOptions),
          base.databaseAdmin.audit(runOptions),
          databaseAdmin.inspectRoles(),
          identity.inspect(),
          secretManager.inspect(),
        ])
      let credential = null
      if (probe.credentialPassword !== undefined) {
        credential = await databaseAdmin.verifyRuntimeCredential({
          password: probe.credentialPassword,
        })
      }
      return Object.freeze({
        source,
        cloud,
        database: Object.freeze({
          ...baseDatabase,
          ...credentialRoles,
          runtimeCredentialVerified: Boolean(credential),
          runtimeSchemaMarkersExact: credential?.runtimeSchemaMarkersExact === true,
        }),
        identity: runtimeIdentity,
        secret,
      })
    },
  })

  let closePromise = null
  async function close() {
    if (!closePromise) {
      closePromise = Promise.allSettled([base.close(), databaseAdmin.close()]).then((results) => {
        if (results.some((result) => result.status === 'rejected')) {
          throw new Error('RUNTIME_CREDENTIAL_DEPENDENCY_CLOSE_FAILED')
        }
      })
    }
    return closePromise
  }

  return Object.freeze({
    cloudSqlAdmin,
    databaseAdmin,
    environment,
    secretManager,
    randomSecret: options.randomSecret || (() => crypto.randomBytes(48)),
    close,
  })
}

module.exports = {
  BROAD_SECRET_ROLES,
  MANAGED_LABELS,
  RUNTIME_MEMBER,
  SECRET_ACCESSOR_ROLE,
  clonePolicy,
  createGoogleCloudRequestAdapter,
  createProfitabilityRuntimeCredentialDependencies,
  createRuntimeDatabaseAdapter,
  createRuntimeIdentityAdapter,
  createSecretManagerAdapter,
  policyHasExactRuntimeAccessor,
  policyHasNoRuntimeAccessor,
  policyHasNoRuntimeMember,
  secretMetadataExact,
  secretResourceName,
}
