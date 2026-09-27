'use strict'

const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')
const http = require('node:http')
const net = require('node:net')
const { spawn, execFile } = require('node:child_process')
const { Client } = require('pg')
const {
  AuthTypes,
  Connector,
  IpAddressTypes,
} = require('@google-cloud/cloud-sql-connector')
const { GoogleAuth } = require('google-auth-library')

const DEFAULT_PSQL_PATH = 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe'
const DEFAULT_PSQL_TIMEOUT_MS = 240000
const DEFAULT_PSQL_KILL_ESCALATION_MS = 5000
const MAX_PSQL_KILL_ESCALATION_MS = 30000
const CLOUD_SQL_PROXY_VERSION = '2.25.4'
const CLOUD_SQL_PROXY_SHA256 = 'b21dd82708248976e2048d06f77e18bce70d329e7278b853abcc13f1ef30036a'
const CLOUD_SQL_PROXY_CONNECTION_NAME = 'iclean-room:europe-west3:iclean-room-instance'
const DEFAULT_CLOUD_SQL_PROXY_STARTUP_TIMEOUT_MS = 30000
const DEFAULT_CLOUD_SQL_PROXY_STOP_TIMEOUT_MS = 5000
const DEFAULT_CLOUD_SQL_PROXY_HEALTH_POLL_MS = 100
const DEFAULT_CLOUD_SQL_PROXY_MAX_OUTPUT_BYTES = 256 * 1024
const DEFAULT_CLOUD_SQL_RECONCILIATION_TIMEOUT_MS = 10000
const DEFAULT_CLOUD_SQL_RECONCILIATION_POLL_INTERVAL_MS = 500
const DEFAULT_GOOGLE_CLOUD_REQUEST_TIMEOUT_MS = 30000
const MAX_GOOGLE_CLOUD_REQUEST_TIMEOUT_MS = 30000
const DEFAULT_PG_CONNECT_TIMEOUT_MS = 30000
const DEFAULT_PG_QUERY_TIMEOUT_MS = 60000
const MAX_PG_CONNECT_TIMEOUT_MS = 30000
const MAX_PG_QUERY_TIMEOUT_MS = 120000
const CLOUD_SQL_ADMIN_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'
const CLOUD_SQL_ADMIN_BASE_URL = 'https://sqladmin.googleapis.com/sql/v1beta4'
const PROVISIONER_ROLE = 'profitability_provisioner'
const GENERATED_BOOTSTRAP_USER_PATTERN = /^profitability_bootstrap_[a-z0-9]+$/
const PASSWORD_GUC = 'cleanzi.profitability_foundation_v2_ephemeral_password'
const SOURCE_GUARD_TAG = '$profitability_foundation_v2_source_guard$'
const TARGET_STATE_GUARD_TAG = '$profitability_foundation_v2_target_state_guard$'
const EXACT_CATALOG_POSTFLIGHT_TAG = '$profitability_foundation_v2_exact_catalog_postflight$'
const OWNER_ACL_POSTFLIGHT_TAG = '$profitability_foundation_v2_owner_acl_postflight$'
const FINAL_GUARD_TAG = '$profitability_foundation_v2_final_guard$'
const FINANCIAL_V21_POSTFLIGHT_TAG = '$profitability_v21_postflight$'
const ACCESS_PROFILE_V2_MIGRATION_FILE =
  '20260925_profitability_access_profile_v2_additive.sql'
const FINANCIAL_MODEL_V21_MIGRATION_FILE =
  '20260926_profitability_financial_model_v21_additive.sql'
const FOUNDATION_MIGRATION_RELATIVE_PATH = path.join(
  'dataconnect',
  'migrations',
  '20260925_profitability_foundation_v2_additive.sql',
)
const TARGET_ROLES = Object.freeze([
  'profitability_migration_executor',
  'profitability_migration_runner',
  'profitability_owner',
  'profitability_session',
  'profitability_runtime',
])
const FOUNDATION_TABLES = Object.freeze([
  'service_object',
  'worker_cost_rate',
  'object_contract_version',
  'periodic_work',
  'periodic_work_zone',
  'object_equipment',
  'object_financial_entry',
  'financial_period',
  'profitability_snapshot',
  'profitability_audit',
])
const SOURCE_TABLES = Object.freeze([
  'organizations',
  'organization_member',
  'client',
  'worker',
  'task',
  'zone',
  'event',
])
const SOURCE_REFERENCE_COLUMNS = Object.freeze([
  Object.freeze({ table: 'organizations', columns: Object.freeze(['org_id']) }),
  Object.freeze({ table: 'client', columns: Object.freeze(['org_id', 'client_id']) }),
  Object.freeze({ table: 'worker', columns: Object.freeze(['org_id', 'login']) }),
  Object.freeze({ table: 'task', columns: Object.freeze(['org_id', 'id_task']) }),
  Object.freeze({ table: 'zone', columns: Object.freeze(['org_id', 'id']) }),
])
const PSQL_CHILD_ENV_ALLOWLIST = Object.freeze(new Set([
  'COMSPEC',
  'PATH',
  'PATHEXT',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'WINDIR',
]))
const CLOUD_SQL_PROXY_CHILD_ENV_ALLOWLIST = Object.freeze(new Set([
  'APPDATA',
  'COMSPEC',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GOOGLE_CLOUD_QUOTA_PROJECT',
  'LOCALAPPDATA',
  'PATH',
  'PATHEXT',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'WINDIR',
]))

function text(value) {
  return String(value ?? '').trim()
}

function requireText(value, code) {
  const normalized = text(value)
  if (!normalized) throw new Error(code)
  return normalized
}

function requireMutation(options, code = 'EXPLICIT_MUTATION_OPT_IN_REQUIRED') {
  if (options?.mutate !== true) throw new Error(code)
}

function matchesGeneratedBootstrapUser(user, name) {
  const userName = text(name)
  if (!user || user.name !== userName
      || !GENERATED_BOOTSTRAP_USER_PATTERN.test(userName)
      || text(user.host)) {
    return false
  }
  const userType = text(user.type).toUpperCase()
  return !userType || userType === 'BUILT_IN'
}

function assertSafeIdentifier(value, code = 'UNSAFE_IDENTIFIER') {
  const identifier = requireText(value, code)
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(identifier)) throw new Error(code)
  return identifier
}

function assertSafePrincipalName(value, code = 'UNSAFE_PRINCIPAL_NAME') {
  const principal = requireText(value, code)
  if (!/^[a-z][a-z0-9_-]{0,62}$/.test(principal)) throw new Error(code)
  return principal
}

function quoteIdentifier(value) {
  return `"${assertSafeIdentifier(value).replaceAll('"', '""')}"`
}

function quoteDatabaseIdentifier(value) {
  const identifier = requireText(value, 'UNSAFE_DATABASE_IDENTIFIER')
  if (identifier.length > 63 || identifier.includes('\0')) {
    throw new Error('UNSAFE_DATABASE_IDENTIFIER')
  }
  return `"${identifier.replaceAll('"', '""')}"`
}

function assertPassword(password) {
  if (typeof password !== 'string' || password.length < 24 || password.includes('\0')) {
    throw new Error('EPHEMERAL_PASSWORD_POLICY_FAILED')
  }
  return password
}

function redact(value, secrets = []) {
  let result = String(value ?? '')
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret) result = result.split(secret).join('[REDACTED]')
  }
  return result
}

function extractTaggedDoBlock(source, tag, code) {
  const sql = String(source ?? '')
  const opening = `do ${tag}`
  const closing = `${tag};`
  const start = sql.indexOf(opening)
  if (start < 0 || sql.indexOf(opening, start + opening.length) >= 0) {
    throw new Error(code)
  }
  const end = sql.indexOf(closing, start + opening.length)
  if (end < 0 || sql.indexOf(closing, end + closing.length) >= 0) {
    throw new Error(code)
  }
  const block = sql.slice(start, end + closing.length)
  if (block.includes('\0') || /(^|\r?\n)\s*\\/m.test(block)) {
    throw new Error(code)
  }
  return block
}

function extractExactCatalogPostflight(source) {
  return extractTaggedDoBlock(
    source,
    EXACT_CATALOG_POSTFLIGHT_TAG,
    'EXACT_CATALOG_POSTFLIGHT_SOURCE_INVALID',
  )
}

function loadIndependentPreflights(migrationFile) {
  try {
    const source = fs.readFileSync(migrationFile, 'utf8')
    return Object.freeze({
      sourceGuard: extractTaggedDoBlock(
        source,
        SOURCE_GUARD_TAG,
        'SOURCE_GUARD_SOURCE_INVALID',
      ),
      targetStateGuard: extractTaggedDoBlock(
        source,
        TARGET_STATE_GUARD_TAG,
        'TARGET_STATE_GUARD_SOURCE_INVALID',
      ),
    })
  } catch (error) {
    if (/_SOURCE_INVALID$/.test(error?.message || '')) throw error
    throw new Error('INDEPENDENT_PREFLIGHT_SOURCE_UNREADABLE')
  }
}

function loadIndependentPostflights(migrationFile) {
  try {
    const source = fs.readFileSync(migrationFile, 'utf8')
    return Object.freeze({
      exactCatalog: extractExactCatalogPostflight(source),
      ownerAcl: extractTaggedDoBlock(
        source,
        OWNER_ACL_POSTFLIGHT_TAG,
        'OWNER_ACL_POSTFLIGHT_SOURCE_INVALID',
      ),
      finalGuard: extractTaggedDoBlock(
        source,
        FINAL_GUARD_TAG,
        'FINAL_GUARD_SOURCE_INVALID',
      ),
    })
  } catch (error) {
    if (/_SOURCE_INVALID$/.test(error?.message || '')) throw error
    throw new Error('INDEPENDENT_POSTFLIGHT_SOURCE_UNREADABLE')
  }
}

function safeCloudSqlError(code, error) {
  const safe = new Error(code)
  const status = Number(error?.response?.status || error?.code)
  if (Number.isFinite(status)) safe.status = status
  return safe
}

function unwrapResponse(response) {
  return response && Object.prototype.hasOwnProperty.call(response, 'data')
    ? response.data
    : response
}

function createCloudSqlAdminApiAdapter(options = {}) {
  const projectId = requireText(options.projectId, 'CLOUD_SQL_PROJECT_REQUIRED')
  const instanceId = requireText(options.instanceId, 'CLOUD_SQL_INSTANCE_REQUIRED')
  const baseUrl = text(options.baseUrl) || CLOUD_SQL_ADMIN_BASE_URL
  const sleep = options.sleep || ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)))
  const now = options.now || Date.now
  const requestTimeoutMs = Number(
    options.requestTimeoutMs ?? DEFAULT_GOOGLE_CLOUD_REQUEST_TIMEOUT_MS,
  )
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1
      || requestTimeoutMs > MAX_GOOGLE_CLOUD_REQUEST_TIMEOUT_MS) {
    throw new Error('GOOGLE_CLOUD_REQUEST_TIMEOUT_INVALID')
  }
  const externalSignal = options.signal
  let authClientPromise = null

  const runBounded = async (operation, { containment = false } = {}) => {
    const controller = new AbortController()
    if (!containment && externalSignal?.aborted) {
      controller.abort()
      throw new Error('GOOGLE_CLOUD_REQUEST_ABORTED')
    }
    let timeoutId = null
    let onExternalAbort = null
    const deadline = new Promise((resolve, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort()
        reject(new Error('GOOGLE_CLOUD_REQUEST_TIMEOUT'))
      }, requestTimeoutMs)
      if (!containment && externalSignal) {
        onExternalAbort = () => {
          controller.abort()
          reject(new Error('GOOGLE_CLOUD_REQUEST_ABORTED'))
        }
        if (externalSignal.aborted) onExternalAbort()
        else externalSignal.addEventListener('abort', onExternalAbort, { once: true })
      }
    })
    const invocation = Promise.resolve().then(() => {
      if (controller.signal.aborted) throw new Error('GOOGLE_CLOUD_REQUEST_ABORTED')
      return operation(controller.signal)
    })
    try {
      // The explicit race is required even when the injected/auth client ignores
      // AbortSignal and its own timeout option.  A late rejection remains handled
      // by Promise.race and cannot leak raw response details.
      return await Promise.race([invocation, deadline])
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
      if (onExternalAbort && externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort)
      }
    }
  }

  const getRequest = async ({ containment = false } = {}) => {
    if (options.request) return options.request
    if (!authClientPromise) {
      const auth = options.auth || new GoogleAuth({ scopes: [CLOUD_SQL_ADMIN_SCOPE] })
      authClientPromise = runBounded(() => auth.getClient(), { containment })
    }
    const pending = authClientPromise
    let authClient
    try {
      authClient = await pending
    } catch (error) {
      // Never retain a rejected/timed-out acquisition. Containment can then
      // acquire a fresh client with its own deadline after a top-level abort.
      if (authClientPromise === pending) authClientPromise = null
      throw error
    }
    return (requestOptions) => authClient.request(requestOptions)
  }

  const invokeBounded = (invoke, requestOptions, { containment = false } = {}) => runBounded(
    (signal) => invoke({
      ...requestOptions,
      timeout: requestTimeoutMs,
      signal,
    }),
    { containment },
  )

  const request = async (method, resourcePath, { query = {}, data, containment = false } = {}) => {
    const url = new URL(`${baseUrl}${resourcePath}`)
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
    }
    try {
      const invoke = await getRequest({ containment })
      return unwrapResponse(await invokeBounded(
        invoke,
        { method, url: url.toString(), data },
        { containment },
      ))
    } catch (error) {
      throw safeCloudSqlError('CLOUD_SQL_ADMIN_REQUEST_FAILED', error)
    }
  }

  const requestAbsolute = async (method, absoluteUrl, { containment = false } = {}) => {
    try {
      const invoke = await getRequest({ containment })
      return unwrapResponse(await invokeBounded(
        invoke,
        { method, url: absoluteUrl },
        { containment },
      ))
    } catch (error) {
      throw safeCloudSqlError('GOOGLE_CLOUD_READ_REQUEST_FAILED', error)
    }
  }

  const instancePath = `/projects/${encodeURIComponent(projectId)}/instances/${encodeURIComponent(instanceId)}`

  async function inspectInstance() {
    return request('GET', instancePath)
  }

  async function inspectBackupRun(backupId) {
    const id = requireText(backupId, 'CLOUD_SQL_BACKUP_ID_REQUIRED')
    return request('GET', `${instancePath}/backupRuns/${encodeURIComponent(id)}`)
  }

  async function inspectCloudRunService({ region, service } = {}) {
    const serviceRegion = requireText(region, 'CLOUD_RUN_REGION_REQUIRED')
    const serviceName = requireText(service, 'CLOUD_RUN_SERVICE_REQUIRED')
    return requestAbsolute(
      'GET',
      `https://run.googleapis.com/v2/projects/${encodeURIComponent(projectId)}`
        + `/locations/${encodeURIComponent(serviceRegion)}/services/${encodeURIComponent(serviceName)}`,
    )
  }

  async function inspectCloudRunRevision({ region, service, revision } = {}) {
    const serviceRegion = requireText(region, 'CLOUD_RUN_REGION_REQUIRED')
    const serviceName = requireText(service, 'CLOUD_RUN_SERVICE_REQUIRED')
    const revisionName = requireText(revision, 'CLOUD_RUN_REVISION_REQUIRED').split('/').at(-1)
    return requestAbsolute(
      'GET',
      `https://run.googleapis.com/v2/projects/${encodeURIComponent(projectId)}`
        + `/locations/${encodeURIComponent(serviceRegion)}`
        + `/services/${encodeURIComponent(serviceName)}`
        + `/revisions/${encodeURIComponent(revisionName)}`,
    )
  }

  async function listUsers({ containment = false } = {}) {
    const payload = await request('GET', `${instancePath}/users`, { containment })
    return Array.isArray(payload?.items) ? payload.items : []
  }

  async function inspectBuiltinUser(name, { containment = false } = {}) {
    const userName = requireText(name, 'CLOUD_SQL_USER_NAME_REQUIRED')
    const users = await listUsers({ containment })
    const matches = users.filter((user) => user?.name === userName)
    if (matches.length === 0) return null
    if (matches.length !== 1) throw new Error('CLOUD_SQL_USER_STATE_AMBIGUOUS')
    const user = matches[0]
    // Cloud SQL for PostgreSQL can omit both TYPE and HOST for a BUILT_IN
    // user. Accept that representation only for our generated, exact
    // bootstrap namespace; every explicit conflicting type or non-empty host
    // remains a hard stop rather than being misclassified as absence.
    if (matchesGeneratedBootstrapUser(user, userName)) return user
    throw new Error('CLOUD_SQL_USER_STATE_CONFLICT')
  }

  async function inspectExactBuiltinUser(name, { containment = false } = {}) {
    const userName = assertSafeIdentifier(name, 'CLOUD_SQL_USER_NAME_INVALID')
    const users = await listUsers({ containment })
    const matches = users.filter((user) => user?.name === userName)
    if (matches.length !== 1) throw new Error('CLOUD_SQL_USER_STATE_AMBIGUOUS')
    const user = matches[0]
    const userType = text(user?.type).toUpperCase()
    if (text(user?.host) || (userType && userType !== 'BUILT_IN')) {
      throw new Error('CLOUD_SQL_USER_STATE_CONFLICT')
    }
    return user
  }

  async function updateBuiltinUserPassword({
    name,
    password,
    mutate,
    operationTimeoutMs,
    operationPollIntervalMs,
  } = {}) {
    requireMutation({ mutate }, 'CLOUD_SQL_PASSWORD_UPDATE_OPT_IN_REQUIRED')
    const userName = assertSafeIdentifier(name, 'CLOUD_SQL_USER_NAME_INVALID')
    const ephemeralPassword = assertPassword(password)
    await inspectExactBuiltinUser(userName)
    let operation = null
    try {
      operation = await request('PUT', `${instancePath}/users`, {
        query: { name: userName },
        data: { name: userName, password: ephemeralPassword },
      })
      operation = await waitForOperation(operation, {
        timeoutMs: operationTimeoutMs,
        pollIntervalMs: operationPollIntervalMs,
      })
      return Object.freeze({
        status: 'updated',
        operation: Object.freeze({ name: text(operation?.name), status: 'DONE' }),
      })
    } catch (cause) {
      const error = new Error('CLOUD_SQL_PASSWORD_UPDATE_AMBIGUOUS')
      const evidence = cause?.cloudSqlOperation || operation
      if (evidence?.name) {
        error.cloudSqlOperation = Object.freeze({
          name: text(evidence.name),
          status: text(evidence.status) || 'UNKNOWN',
        })
      }
      throw error
    }
  }

  async function settleBuiltinUserPasswordUpdate({ operationName } = {}) {
    const normalized = text(operationName)
    if (!normalized) {
      return Object.freeze({ terminal: false, succeeded: false, operationName: null })
    }
    try {
      const operation = await inspectOperation(normalized, { containment: true })
      const settled = await waitForOperation(operation, { containment: true })
      return Object.freeze({
        terminal: true,
        succeeded: true,
        operationName: text(settled?.name) || normalized,
      })
    } catch (error) {
      return Object.freeze({
        terminal: error?.cloudSqlOperation?.status === 'DONE',
        succeeded: false,
        operationName: normalized,
      })
    }
  }

  async function inspectOperation(operationName, { containment = false } = {}) {
    const name = requireText(operationName, 'CLOUD_SQL_OPERATION_NAME_REQUIRED')
    return request(
      'GET',
      `/projects/${encodeURIComponent(projectId)}/operations/${encodeURIComponent(name)}`,
      { containment },
    )
  }

  async function waitForOperation(operation, waitOptions = {}) {
    let current = operation
    const operationName = requireText(operation?.name, 'CLOUD_SQL_OPERATION_NAME_REQUIRED')
    const timeoutMs = Number(waitOptions.timeoutMs ?? 120000)
    const pollIntervalMs = Number(waitOptions.pollIntervalMs ?? 1000)
    const startedAt = now()
    while (current?.status !== 'DONE') {
      if (now() - startedAt >= timeoutMs) {
        const error = new Error('CLOUD_SQL_OPERATION_TIMEOUT')
        error.cloudSqlOperation = Object.freeze({
          name: operationName,
          status: text(current?.status) || 'UNKNOWN',
        })
        throw error
      }
      await sleep(pollIntervalMs)
      current = await inspectOperation(operationName, {
        containment: waitOptions.containment === true,
      })
    }
    if (Array.isArray(current?.error?.errors) && current.error.errors.length > 0) {
      const error = new Error('CLOUD_SQL_OPERATION_FAILED')
      error.cloudSqlOperation = Object.freeze({ name: operationName, status: 'DONE' })
      throw error
    }
    return current
  }

  async function settleCreateOperation({
    name,
    operationName,
    timeoutMs,
    pollIntervalMs,
    reconciliationTimeoutMs,
    reconciliationPollIntervalMs,
  } = {}) {
    const userName = assertSafePrincipalName(name, 'CLOUD_SQL_USER_NAME_INVALID')
    const normalizedOperationName = text(operationName)
    if (!normalizedOperationName) {
      return Object.freeze({
        operationName: null,
        status: 'UNKNOWN',
        terminal: false,
        succeeded: false,
        effectConfirmed: false,
      })
    }

    const terminalTimeoutMs = Number(timeoutMs ?? DEFAULT_CLOUD_SQL_RECONCILIATION_TIMEOUT_MS)
    const terminalPollIntervalMs = Number(
      pollIntervalMs ?? DEFAULT_CLOUD_SQL_RECONCILIATION_POLL_INTERVAL_MS,
    )
    if (!Number.isInteger(terminalTimeoutMs) || terminalTimeoutMs < 0
        || !Number.isInteger(terminalPollIntervalMs) || terminalPollIntervalMs < 1) {
      throw new Error('CLOUD_SQL_OPERATION_RECONCILIATION_OPTIONS_INVALID')
    }

    const startedAt = now()
    let operation = null
    while (true) {
      try {
        operation = await inspectOperation(normalizedOperationName, { containment: true })
      } catch {
        operation = null
      }
      if (operation?.status === 'DONE') break
      if (now() - startedAt >= terminalTimeoutMs) {
        return Object.freeze({
          operationName: normalizedOperationName,
          status: text(operation?.status) || 'UNKNOWN',
          terminal: false,
          succeeded: false,
          effectConfirmed: false,
        })
      }
      await sleep(terminalPollIntervalMs)
    }

    const succeeded = !(Array.isArray(operation?.error?.errors)
      && operation.error.errors.length > 0)
    let effectConfirmed = true
    if (succeeded) {
      const reconciliation = await waitForBuiltinUserReconciliation(userName, true, {
        timeoutMs: reconciliationTimeoutMs,
        pollIntervalMs: reconciliationPollIntervalMs,
        containment: true,
      })
      effectConfirmed = reconciliation.matches === true
    }
    return Object.freeze({
      operationName: normalizedOperationName,
      status: 'DONE',
      terminal: true,
      succeeded,
      effectConfirmed,
    })
  }

  async function reconcileBuiltinUser(name, expectedPresent, { containment = false } = {}) {
    const user = await inspectBuiltinUser(name, { containment })
    return {
      expectedPresent: Boolean(expectedPresent),
      present: Boolean(user),
      matches: Boolean(user) === Boolean(expectedPresent),
      user,
    }
  }

  async function waitForBuiltinUserReconciliation(name, expectedPresent, waitOptions = {}) {
    const timeoutMs = Number(
      waitOptions.timeoutMs ?? DEFAULT_CLOUD_SQL_RECONCILIATION_TIMEOUT_MS,
    )
    const pollIntervalMs = Number(
      waitOptions.pollIntervalMs ?? DEFAULT_CLOUD_SQL_RECONCILIATION_POLL_INTERVAL_MS,
    )
    if (!Number.isInteger(timeoutMs) || timeoutMs < 0
        || !Number.isInteger(pollIntervalMs) || pollIntervalMs < 1) {
      throw new Error('CLOUD_SQL_RECONCILIATION_OPTIONS_INVALID')
    }
    const startedAt = now()
    let last = Object.freeze({
      expectedPresent: Boolean(expectedPresent),
      present: false,
      matches: false,
      user: null,
    })
    while (true) {
      try {
        last = await reconcileBuiltinUser(name, expectedPresent, {
          containment: waitOptions.containment === true,
        })
        if (last.matches) return last
      } catch (error) {
        if (waitOptions.containment !== true && externalSignal?.aborted) throw error
        // A read failure cannot prove absence. Keep polling until the bounded deadline.
      }
      if (now() - startedAt >= timeoutMs) return last
      await sleep(pollIntervalMs)
    }
  }

  function ambiguousCreateError(code, cause, operation) {
    const error = safeCloudSqlError(code, cause)
    error.cleanupRequired = true
    const evidence = operation || cause?.cloudSqlOperation
    if (evidence?.name) {
      error.cloudSqlOperation = Object.freeze({
        name: text(evidence.name),
        status: text(evidence.status) || 'UNKNOWN',
      })
    }
    return error
  }

  async function createEphemeralBuiltinUser({
    name,
    password,
    mutate,
    operationTimeoutMs,
    operationPollIntervalMs,
    reconciliationTimeoutMs,
    reconciliationPollIntervalMs,
  } = {}) {
    requireMutation({ mutate }, 'CLOUD_SQL_CREATE_OPT_IN_REQUIRED')
    const userName = assertSafePrincipalName(name, 'CLOUD_SQL_USER_NAME_INVALID')
    const ephemeralPassword = assertPassword(password)
    if (await inspectBuiltinUser(userName)) throw new Error('CLOUD_SQL_EPHEMERAL_USER_ALREADY_EXISTS')
    let operation = null
    try {
      operation = await request('POST', `${instancePath}/users`, {
        data: { name: userName, password: ephemeralPassword, type: 'BUILT_IN' },
      })
      operation = await waitForOperation(operation, {
        timeoutMs: operationTimeoutMs,
        pollIntervalMs: operationPollIntervalMs,
      })
    } catch (error) {
      const reconciliation = await waitForBuiltinUserReconciliation(userName, true, {
        timeoutMs: reconciliationTimeoutMs,
        pollIntervalMs: reconciliationPollIntervalMs,
        containment: true,
      })
      throw ambiguousCreateError(
        reconciliation.matches
          ? 'CLOUD_SQL_EPHEMERAL_USER_CREATE_AMBIGUOUS_PRESENT'
          : 'CLOUD_SQL_EPHEMERAL_USER_CREATE_AMBIGUOUS_PENDING',
        error,
        error?.cloudSqlOperation || operation,
      )
    }
    const reconciliation = await waitForBuiltinUserReconciliation(userName, true, {
      timeoutMs: reconciliationTimeoutMs,
      pollIntervalMs: reconciliationPollIntervalMs,
    })
    if (!reconciliation.matches) {
      throw ambiguousCreateError(
        'CLOUD_SQL_EPHEMERAL_USER_CREATE_AMBIGUOUS_PENDING',
        null,
        operation,
      )
    }
    return {
      status: 'created',
      user: reconciliation.user,
      operation: Object.freeze({ name: text(operation?.name), status: 'DONE' }),
    }
  }

  async function deleteEphemeralBuiltinUser({ name, host, mutate } = {}) {
    requireMutation({ mutate }, 'CLOUD_SQL_DELETE_OPT_IN_REQUIRED')
    const userName = assertSafePrincipalName(name, 'CLOUD_SQL_USER_NAME_INVALID')
    const existingUser = await inspectBuiltinUser(userName, { containment: true })
    if (!existingUser) {
      return { status: 'already-absent', user: null }
    }
    try {
      const operation = await request('DELETE', `${instancePath}/users`, {
        // PostgreSQL users are instance principals, not MySQL name@host
        // accounts. Omit host by default; retain an explicit DI seam only for
        // isolated adapter tests or a future non-PostgreSQL caller.
        query: { name: userName, host: text(host) },
        containment: true,
      })
      await waitForOperation(operation, { containment: true })
    } catch (error) {
      const reconciliation = await reconcileBuiltinUser(userName, false, { containment: true })
      if (!reconciliation.matches) throw safeCloudSqlError('CLOUD_SQL_EPHEMERAL_USER_DELETE_FAILED', error)
      return { status: 'deleted-reconciled', user: null }
    }
    const reconciliation = await reconcileBuiltinUser(userName, false, { containment: true })
    if (!reconciliation.matches) throw new Error('CLOUD_SQL_EPHEMERAL_USER_DELETE_STILL_PRESENT')
    return { status: 'deleted', user: null }
  }

  return Object.freeze({
    projectId,
    instanceId,
    inspectInstance,
    inspectBackupRun,
    inspectCloudRunService,
    inspectCloudRunRevision,
    listUsers,
    inspectBuiltinUser,
    inspectExactBuiltinUser,
    inspectOperation,
    waitForOperation,
    settleCreateOperation,
    reconcileBuiltinUser,
    waitForBuiltinUserReconciliation,
    createEphemeralBuiltinUser,
    deleteEphemeralBuiltinUser,
    updateBuiltinUserPassword,
    settleBuiltinUserPasswordUpdate,
  })
}

function replaceExactlyOnce(source, expected, replacement, code) {
  const start = source.indexOf(expected)
  if (start < 0 || source.indexOf(expected, start + expected.length) >= 0) {
    throw new Error(code)
  }
  return `${source.slice(0, start)}${replacement}${source.slice(start + expected.length)}`
}

// Financial V2.1 deliberately extends one Foundation table.  The historical
// Foundation fingerprint must remain immutable, so post-upgrade verification
// projects only these reviewed additions out of the Foundation catalog before
// recomputing the original fingerprint.  The additions themselves are checked
// independently by the V2.1 postflight in the same read-only snapshot.
function buildPostUpgradeFoundationExactCatalogPostflight(source) {
  let result = source
  result = replaceExactlyOnce(
    result,
    `                   and attribute_row.attnum > 0
                   and not attribute_row.attisdropped
              ),
              'defaults', (`,
    `                   and attribute_row.attnum > 0
                   and not attribute_row.attisdropped
                   and not (
                     relation_row.relname = 'object_financial_entry'
                     and attribute_row.attname = any(
                       array['value_basis', 'value_key']::name[]
                     )
                   )
              ),
              'defaults', (`,
    'FOUNDATION_POST_UPGRADE_COLUMNS_PROJECTION_INVALID',
  )
  result = replaceExactlyOnce(
    result,
    `                where namespace_row.nspname = 'public'
                  and relation_row.relname = any(target_relations)
             ),
              'constraints', (`,
    `                where namespace_row.nspname = 'public'
                  and relation_row.relname = any(target_relations)
                  and not (
                    relation_row.relname = 'object_financial_entry'
                    and attribute_row.attname = 'value_basis'
                  )
             ),
              'constraints', (`,
    'FOUNDATION_POST_UPGRADE_DEFAULTS_PROJECTION_INVALID',
  )
  result = replaceExactlyOnce(
    result,
    `                 where namespace_row.nspname = 'public'
                   and relation_row.relname = any(target_relations)
              ),
              'indexes', (`,
    `                 where namespace_row.nspname = 'public'
                   and relation_row.relname = any(target_relations)
                   and not (
                     relation_row.relname = 'object_financial_entry'
                     and constraint_row.conname = any(array[
                       'object_financial_entry_value_basis_check',
                       'object_financial_entry_value_key_check'
                     ]::name[])
                   )
              ),
              'indexes', (`,
    'FOUNDATION_POST_UPGRADE_CONSTRAINTS_PROJECTION_INVALID',
  )
  result = replaceExactlyOnce(
    result,
    `                 where namespace_row.nspname = 'public'
                   and relation_row.relname = any(target_relations)
              ),
              'immutable_function', (`,
    `                 where namespace_row.nspname = 'public'
                   and relation_row.relname = any(target_relations)
                   and not (
                     relation_row.relname = 'object_financial_entry'
                     and index_row.relname =
                       'object_financial_entry_active_value_basis_uidx'
                   )
              ),
              'immutable_function', (`,
    'FOUNDATION_POST_UPGRADE_INDEXES_PROJECTION_INVALID',
  )
  result = replaceExactlyOnce(
    result,
    `                where namespace_row.nspname = 'public'
                   and relation_row.relname = any(target_relations)
                   and not trigger_row.tgisinternal
              ),
              'internal_ri_triggers', (`,
    `                where namespace_row.nspname = 'public'
                   and relation_row.relname = any(target_relations)
                   and not trigger_row.tgisinternal
                   and not (
                     relation_row.relname = 'object_financial_entry'
                     and trigger_row.tgname =
                       'object_financial_entry_pair_dimensions_v21'
                   )
              ),
              'internal_ri_triggers', (`,
    'FOUNDATION_POST_UPGRADE_TRIGGERS_PROJECTION_INVALID',
  )
  return result
}

function extractAccessProfileV2Postflight(source) {
  const marker = '-- Idempotent postflight:'
  const markerOffset = source.indexOf(marker)
  if (markerOffset < 0 || source.indexOf(marker, markerOffset + marker.length) >= 0) {
    throw new Error('ACCESS_PROFILE_V2_POSTFLIGHT_SOURCE_INVALID')
  }
  const start = source.indexOf('do $$', markerOffset)
  const end = source.indexOf('\n$$;', start)
  if (start < 0 || end < 0) {
    throw new Error('ACCESS_PROFILE_V2_POSTFLIGHT_SOURCE_INVALID')
  }
  const block = source.slice(start, end + 4)
  if (block.includes('\0') || /(^|\r?\n)\s*\\/m.test(block)) {
    throw new Error('ACCESS_PROFILE_V2_POSTFLIGHT_SOURCE_INVALID')
  }
  return block
}

function loadPostUpgradeFoundationPostflights(foundationMigrationFile) {
  try {
    const migrationDirectory = path.dirname(path.resolve(foundationMigrationFile))
    const accessSource = fs.readFileSync(
      path.join(migrationDirectory, ACCESS_PROFILE_V2_MIGRATION_FILE),
      'utf8',
    )
    const financialSource = fs.readFileSync(
      path.join(migrationDirectory, FINANCIAL_MODEL_V21_MIGRATION_FILE),
      'utf8',
    )
    return Object.freeze({
      access: extractAccessProfileV2Postflight(accessSource),
      financial: extractTaggedDoBlock(
        financialSource,
        FINANCIAL_V21_POSTFLIGHT_TAG,
        'FINANCIAL_V21_POSTFLIGHT_SOURCE_INVALID',
      ),
    })
  } catch (error) {
    if (/_SOURCE_INVALID$/.test(error?.message || '')) throw error
    throw new Error('POST_UPGRADE_FOUNDATION_POSTFLIGHT_SOURCE_UNREADABLE')
  }
}

const POST_UPGRADE_FOUNDATION_MARKERS_SQL = `select
  (
      case when to_regclass('public.profitability_access_enforcement') is not null then 1 else 0 end
    + case when to_regclass('public.organization_access_profile') is not null then 1 else 0 end
    + case when to_regclass('public.service_object_assignment') is not null then 1 else 0 end
    + case when to_regclass('public.profitability_target_history') is not null then 1 else 0 end
    + case when to_regclass('public.organization_access_profile_active_uid_idx') is not null then 1 else 0 end
    + case when to_regclass('public.organization_access_profile_lookup_idx') is not null then 1 else 0 end
    + case when to_regclass('public.service_object_assignment_active_scope_idx') is not null then 1 else 0 end
    + case when to_regclass('public.service_object_assignment_member_lookup_idx') is not null then 1 else 0 end
    + case when to_regclass('public.service_object_assignment_object_lookup_idx') is not null then 1 else 0 end
    + case when to_regclass('public.profitability_target_history_lookup_idx') is not null then 1 else 0 end
  )::integer as access_marker_count,
  (
      case when exists (
        select 1 from pg_attribute
         where attrelid = to_regclass('public.object_financial_entry')
           and attname = 'value_basis' and attnum > 0 and not attisdropped
      ) then 1 else 0 end
    + case when exists (
        select 1 from pg_attribute
         where attrelid = to_regclass('public.object_financial_entry')
           and attname = 'value_key' and attnum > 0 and not attisdropped
      ) then 1 else 0 end
    + case when to_regclass('public.profitability_command_receipt') is not null then 1 else 0 end
    + case when to_regclass('public.object_hygiene_package_version') is not null then 1 else 0 end
    + case when to_regclass('public.profitability_financial_model_enforcement') is not null then 1 else 0 end
    + case when to_regclass('public.profitability_effective_financial_entry') is not null then 1 else 0 end
    + case when to_regclass('public.profitability_effective_hygiene_package') is not null then 1 else 0 end
    + case when to_regclass('public.object_financial_entry_active_value_basis_uidx') is not null then 1 else 0 end
    + case when to_regclass('public.profitability_command_receipt_created_idx') is not null then 1 else 0 end
    + case when to_regclass('public.object_hygiene_package_active_recognition_uidx') is not null then 1 else 0 end
    + case when to_regclass('public.object_hygiene_package_lookup_idx') is not null then 1 else 0 end
    + case when to_regprocedure('public.profitability_v21_guard_command_receipt()') is not null then 1 else 0 end
    + case when to_regprocedure('public.profitability_v21_guard_hygiene_package()') is not null then 1 else 0 end
    + case when to_regprocedure('public.profitability_v21_validate_financial_pair()') is not null then 1 else 0 end
    + case when to_regprocedure('public.profitability_v21_validate_hygiene_pair()') is not null then 1 else 0 end
    + case when exists (
        select 1 from pg_trigger
         where tgrelid = to_regclass('public.profitability_command_receipt')
           and tgname = 'profitability_command_receipt_transition_v21'
           and not tgisinternal
      ) then 1 else 0 end
    + case when exists (
        select 1 from pg_trigger
         where tgrelid = to_regclass('public.object_hygiene_package_version')
           and tgname = 'object_hygiene_package_transition_v21'
           and not tgisinternal
      ) then 1 else 0 end
    + case when exists (
        select 1 from pg_trigger
         where tgrelid = to_regclass('public.object_financial_entry')
           and tgname = 'object_financial_entry_pair_dimensions_v21'
           and not tgisinternal
      ) then 1 else 0 end
    + case when exists (
        select 1 from pg_trigger
         where tgrelid = to_regclass('public.object_hygiene_package_version')
           and tgname = 'object_hygiene_package_pair_dimensions_v21'
           and not tgisinternal
      ) then 1 else 0 end
  )::integer as financial_marker_count`

const POST_UPGRADE_FOUNDATION_EXTENSION_EXACT_SQL = `do $profitability_foundation_v2_post_upgrade_extension_exact$
declare
  owner_role_oid oid := (select oid from pg_roles where rolname = 'profitability_owner');
begin
  if owner_role_oid is null then
    raise exception 'PROFITABILITY_POST_UPGRADE_OWNER_ROLE_MISSING';
  end if;

  if (
    select count(*)
      from pg_attribute attribute_row
      join pg_type type_row
        on type_row.oid = attribute_row.atttypid
      join pg_namespace type_namespace
        on type_namespace.oid = type_row.typnamespace
      left join pg_collation collation_row
        on collation_row.oid = attribute_row.attcollation
      left join pg_namespace collation_namespace
        on collation_namespace.oid = collation_row.collnamespace
      left join pg_attrdef default_row
        on default_row.adrelid = attribute_row.attrelid
       and default_row.adnum = attribute_row.attnum
     where attribute_row.attrelid = 'public.object_financial_entry'::regclass
       and attribute_row.attnum > 0
       and not attribute_row.attisdropped
       and (
         (
           attribute_row.attname = 'value_basis'
           and attribute_row.attnum = 26
           and attribute_row.atttypid = 1043
           and attribute_row.atttypmod = 20
           and format_type(attribute_row.atttypid, attribute_row.atttypmod) =
               'character varying(16)'
           and type_namespace.nspname = 'pg_catalog'
           and type_row.typname = 'varchar'
           and type_row.typtype = 'b'
           and type_row.typcategory = 'S'
           and type_row.typbasetype = 0
           and not type_row.typnotnull
           and type_row.typalign = 'i'
           and type_row.typstorage = 'x'
           and attribute_row.attnotnull
           and collation_namespace.nspname = 'pg_catalog'
           and collation_row.collname = 'default'
           and attribute_row.attidentity = ''
           and attribute_row.attgenerated = ''
           and pg_get_expr(default_row.adbin, default_row.adrelid, true) =
               '''ACTUAL''::character varying'
         )
         or (
           attribute_row.attname = 'value_key'
           and attribute_row.attnum = 27
           and attribute_row.atttypid = 1043
           and attribute_row.atttypmod = 100
           and format_type(attribute_row.atttypid, attribute_row.atttypmod) =
               'character varying(96)'
           and type_namespace.nspname = 'pg_catalog'
           and type_row.typname = 'varchar'
           and type_row.typtype = 'b'
           and type_row.typcategory = 'S'
           and type_row.typbasetype = 0
           and not type_row.typnotnull
           and type_row.typalign = 'i'
           and type_row.typstorage = 'x'
           and not attribute_row.attnotnull
           and collation_namespace.nspname = 'pg_catalog'
           and collation_row.collname = 'default'
           and attribute_row.attidentity = ''
           and attribute_row.attgenerated = ''
           and default_row.oid is null
         )
       )
  ) <> 2 then
    raise exception 'PROFITABILITY_POST_UPGRADE_COLUMN_EXTENSION_DRIFT';
  end if;

  if (
    select count(*)
      from pg_constraint constraint_row
     where constraint_row.conrelid = 'public.object_financial_entry'::regclass
       and constraint_row.contype = 'c'
       and constraint_row.convalidated
       and not constraint_row.connoinherit
       and not constraint_row.condeferrable
       and not constraint_row.condeferred
       and (
         (
           constraint_row.conname = 'object_financial_entry_value_basis_check'
           and pg_get_constraintdef(constraint_row.oid, true) =
             'CHECK (value_basis::text = ANY (ARRAY[''PLAN''::character varying, ''ESTIMATE''::character varying, ''ACTUAL''::character varying]::text[]))'
         )
         or (
           constraint_row.conname = 'object_financial_entry_value_key_check'
           and pg_get_constraintdef(constraint_row.oid, true) =
             'CHECK (value_key IS NULL AND value_basis::text = ''ACTUAL''::text OR value_key IS NOT NULL AND value_key::text = btrim(value_key::text) AND value_key::text <> ''''::text)'
         )
       )
  ) <> 2 then
    raise exception 'PROFITABILITY_POST_UPGRADE_CONSTRAINT_EXTENSION_DRIFT';
  end if;

  if not exists (
    select 1
      from pg_index index_meta
      join pg_class index_row on index_row.oid = index_meta.indexrelid
      join pg_am access_method on access_method.oid = index_row.relam
     where index_meta.indrelid = 'public.object_financial_entry'::regclass
       and index_row.relname = 'object_financial_entry_active_value_basis_uidx'
       and index_row.relowner = owner_role_oid
       and index_row.relpersistence = 'p'
       and access_method.amname = 'btree'
       and index_meta.indisunique
       and not index_meta.indisprimary
       and not index_meta.indisexclusion
       and index_meta.indimmediate
       and index_meta.indisvalid
       and index_meta.indisready
       and index_meta.indislive
       and not index_meta.indcheckxmin
       and not index_meta.indisclustered
       and not index_meta.indisreplident
       and not index_meta.indnullsnotdistinct
       and index_meta.indnkeyatts = 4
       and index_meta.indnatts = 4
       and pg_get_indexdef(index_meta.indexrelid, 0, true) =
         'CREATE UNIQUE INDEX object_financial_entry_active_value_basis_uidx ON object_financial_entry USING btree (org_id, object_id, value_key, value_basis) WHERE value_key IS NOT NULL AND status::text = ''POSTED''::text AND archived_at IS NULL'
       and pg_get_expr(index_meta.indpred, index_meta.indrelid, true) =
         'value_key IS NOT NULL AND status::text = ''POSTED''::text AND archived_at IS NULL'
  ) then
    raise exception 'PROFITABILITY_POST_UPGRADE_INDEX_EXTENSION_DRIFT';
  end if;

  if not exists (
    select 1
      from pg_trigger trigger_row
     where trigger_row.tgrelid = 'public.object_financial_entry'::regclass
       and trigger_row.tgname = 'object_financial_entry_pair_dimensions_v21'
       and not trigger_row.tgisinternal
       and trigger_row.tgenabled = 'O'
       and trigger_row.tgconstraint = 0
       and trigger_row.tgqual is null
       and trigger_row.tgargs = ''::bytea
       and trigger_row.tgfoid =
           'public.profitability_v21_validate_financial_pair()'::regprocedure
       and pg_get_triggerdef(trigger_row.oid, true) =
         'CREATE TRIGGER object_financial_entry_pair_dimensions_v21 BEFORE INSERT OR UPDATE ON object_financial_entry FOR EACH ROW EXECUTE FUNCTION profitability_v21_validate_financial_pair()'
  ) then
    raise exception 'PROFITABILITY_POST_UPGRADE_TRIGGER_EXTENSION_DRIFT';
  end if;
end
$profitability_foundation_v2_post_upgrade_extension_exact$;`

async function inspectPostUpgradeFoundationMarkers(client) {
  const markerResult = await client.query(POST_UPGRADE_FOUNDATION_MARKERS_SQL)
  if (markerResult.rows.length !== 1) {
    throw new Error('POST_UPGRADE_FOUNDATION_MARKERS_UNVERIFIABLE')
  }
  const accessMarkerCount = Number(markerResult.rows[0]?.access_marker_count)
  const financialMarkerCount = Number(markerResult.rows[0]?.financial_marker_count)
  if (![0, 10].includes(accessMarkerCount)) {
    throw new Error('ACCESS_PROFILE_V2_COMPOSITE_STATE_PARTIAL')
  }
  if (![0, 19].includes(financialMarkerCount)) {
    throw new Error('FINANCIAL_V21_COMPOSITE_STATE_PARTIAL')
  }
  return Object.freeze({
    access: accessMarkerCount === 10 ? 'present' : 'absent',
    financial: financialMarkerCount === 19 ? 'present' : 'absent',
  })
}

function boundedMilliseconds(value, fallback, maximum, code) {
  const normalized = Number(value ?? fallback)
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > maximum) {
    throw new Error(code)
  }
  return normalized
}

function runBoundedOperation(factory, options = {}) {
  const timeoutMs = boundedMilliseconds(
    options.timeoutMs,
    options.defaultTimeoutMs,
    options.maximumTimeoutMs,
    'PG_OPERATION_TIMEOUT_INVALID',
  )
  const signal = options.signal
  const abortCode = options.abortCode || 'PG_OPERATION_ABORTED'
  const timeoutCode = options.timeoutCode || 'PG_OPERATION_TIMEOUT'
  if (signal?.aborted) {
    try {
      Promise.resolve(options.onInterrupt?.()).catch(() => {})
    } catch {}
    return Promise.reject(new Error(abortCode))
  }

  return new Promise((resolve, reject) => {
    let settled = false
    let timeout = null
    let onAbort = null
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      if (onAbort && signal) signal.removeEventListener('abort', onAbort)
      callback(value)
    }
    const interrupt = (code) => {
      try {
        Promise.resolve(options.onInterrupt?.()).catch(() => {})
      } catch {}
      finish(reject, new Error(code))
    }
    timeout = setTimeout(() => interrupt(timeoutCode), timeoutMs)
    if (signal) {
      onAbort = () => interrupt(abortCode)
      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) {
        onAbort()
        return
      }
    }
    let operation
    try {
      operation = factory()
    } catch (error) {
      finish(reject, error)
      return
    }
    Promise.resolve(operation).then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error),
    )
  })
}

function createCloudSqlPgAdapter(options = {}) {
  const instanceConnectionName = requireText(
    options.instanceConnectionName,
    'CLOUD_SQL_CONNECTION_NAME_REQUIRED',
  )
  const ConnectorClass = options.ConnectorClass || Connector
  const ClientClass = options.ClientClass || Client
  const connector = options.connector || new ConnectorClass(options.connectorOptions)
  const ipType = text(options.ipType).toUpperCase() === 'PRIVATE'
    ? IpAddressTypes.PRIVATE
    : IpAddressTypes.PUBLIC
  const defaultSignal = options.signal
  const connectTimeoutMs = boundedMilliseconds(
    options.connectTimeoutMs,
    DEFAULT_PG_CONNECT_TIMEOUT_MS,
    MAX_PG_CONNECT_TIMEOUT_MS,
    'PG_CONNECT_TIMEOUT_INVALID',
  )
  const queryTimeoutMs = boundedMilliseconds(
    options.queryTimeoutMs,
    DEFAULT_PG_QUERY_TIMEOUT_MS,
    MAX_PG_QUERY_TIMEOUT_MS,
    'PG_QUERY_TIMEOUT_INVALID',
  )
  let closed = false

  async function connect({
    database,
    user,
    password,
    authType,
    applicationName,
    containment = false,
    signal: callSignal,
  } = {}) {
    if (closed) throw new Error('CLOUD_SQL_CONNECTOR_ALREADY_CLOSED')
    const dbName = requireText(database, 'PG_DATABASE_REQUIRED')
    const dbUser = requireText(user, 'PG_USER_REQUIRED')
    const normalizedAuthType = text(authType).toUpperCase()
    if (!['IAM', 'PASSWORD'].includes(normalizedAuthType)) throw new Error('PG_AUTH_TYPE_INVALID')
    if (normalizedAuthType === 'PASSWORD') assertPassword(password)
    if (normalizedAuthType === 'IAM' && password !== undefined) throw new Error('IAM_PASSWORD_FORBIDDEN')

    const signal = containment === true ? undefined : (callSignal || defaultSignal)
    const connectorOptions = await runBoundedOperation(
      () => connector.getOptions({
        instanceConnectionName,
        ipType,
        authType: normalizedAuthType === 'IAM' ? AuthTypes.IAM : AuthTypes.PASSWORD,
      }),
      {
        signal,
        timeoutMs: connectTimeoutMs,
        defaultTimeoutMs: DEFAULT_PG_CONNECT_TIMEOUT_MS,
        maximumTimeoutMs: MAX_PG_CONNECT_TIMEOUT_MS,
        abortCode: 'PG_CONNECT_ABORTED',
        timeoutCode: 'PG_CONNECT_TIMEOUT',
      },
    )
    const client = new ClientClass({
      ...connectorOptions,
      database: dbName,
      user: dbUser,
      ...(normalizedAuthType === 'PASSWORD' ? { password } : {}),
      application_name: text(applicationName) || 'cleanzi-profitability-foundation-v2-operator',
      connectionTimeoutMillis: connectTimeoutMs,
      query_timeout: queryTimeoutMs,
      statement_timeout: queryTimeoutMs,
      idle_in_transaction_session_timeout: queryTimeoutMs,
    })
    const rawEnd = typeof client.end === 'function' ? client.end.bind(client) : null
    let endPromise = null
    const interruptClient = () => {
      if (!rawEnd) return undefined
      if (!endPromise) endPromise = Promise.resolve().then(() => rawEnd())
      return endPromise
    }
    await runBoundedOperation(() => client.connect(), {
      signal,
      timeoutMs: connectTimeoutMs,
      defaultTimeoutMs: DEFAULT_PG_CONNECT_TIMEOUT_MS,
      maximumTimeoutMs: MAX_PG_CONNECT_TIMEOUT_MS,
      abortCode: 'PG_CONNECT_ABORTED',
      timeoutCode: 'PG_CONNECT_TIMEOUT',
      onInterrupt: interruptClient,
    })
    if (typeof client.query === 'function') {
      const rawQuery = client.query.bind(client)
      client.query = (...args) => runBoundedOperation(() => rawQuery(...args), {
        signal,
        timeoutMs: queryTimeoutMs,
        defaultTimeoutMs: DEFAULT_PG_QUERY_TIMEOUT_MS,
        maximumTimeoutMs: MAX_PG_QUERY_TIMEOUT_MS,
        abortCode: 'PG_QUERY_ABORTED',
        timeoutCode: 'PG_QUERY_TIMEOUT',
        onInterrupt: interruptClient,
      })
    }
    if (rawEnd) {
      client.end = () => {
        if (!endPromise) endPromise = Promise.resolve().then(() => rawEnd())
        return endPromise
      }
    }
    return client
  }

  const connectIamAdmin = (config) => connect({ ...config, authType: 'IAM' })
  const connectBuiltin = (config) => connect({ ...config, authType: 'PASSWORD' })
  const close = async () => {
    if (closed) return
    closed = true
    await connector.close()
  }

  return Object.freeze({ connect, connectIamAdmin, connectBuiltin, close })
}

function requireClient(client) {
  if (!client || typeof client.query !== 'function') throw new Error('PG_CLIENT_REQUIRED')
  return client
}

async function inspectFoundationState(client, options = {}) {
  requireClient(client)
  const targetRoles = [...(options.targetRoles || TARGET_ROLES)]
  const extraRoles = [assertSafeIdentifier(options.provisionerRole || PROVISIONER_ROLE)]
  if (options.bootstrapRole) extraRoles.push(assertSafePrincipalName(options.bootstrapRole))
  const roleNames = [...new Set([...targetRoles, ...extraRoles])]
  const tableNames = [...(options.tableNames || FOUNDATION_TABLES)]

  const [server, extension, roles, memberships, tables, databaseAcl, schemaAcl] = await Promise.all([
    client.query(
      `select current_database() as database_name,
              current_setting('server_version_num')::integer as server_version_num,
              pg_is_in_recovery() as in_recovery,
              current_setting('transaction_read_only') as transaction_read_only,
              current_setting('default_transaction_read_only') as default_transaction_read_only,
              pg_get_userbyid(10) as bootstrap_grantor,
              (select pg_get_userbyid(datdba)
                 from pg_database
                where datname = current_database()) as database_owner,
              (select pg_get_userbyid(nspowner)
                 from pg_namespace
                where nspname = 'public') as schema_owner`,
    ),
    client.query(
      `select extname, extversion, extnamespace::regnamespace::text as schema_name
         from pg_extension
        where extname = 'btree_gist'`,
    ),
    client.query(
      `select rolname, rolcanlogin, rolinherit, rolsuper, rolcreatedb,
              rolcreaterole, rolreplication, rolbypassrls, rolconnlimit,
              rolvaliduntil, rolconfig
         from pg_roles
        where rolname = any($1::text[])
        order by rolname`,
      [roleNames],
    ),
    client.query(
      `select granted.rolname as granted_role,
              member_role.rolname as member_role,
              grantor_role.rolname as grantor_role,
              membership.admin_option,
              membership.inherit_option,
              membership.set_option
         from pg_auth_members membership
         join pg_roles granted on granted.oid = membership.roleid
         join pg_roles member_role on member_role.oid = membership.member
         join pg_roles grantor_role on grantor_role.oid = membership.grantor
        where granted.rolname = any($1::text[])
           or member_role.rolname = any($1::text[])
        order by granted.rolname, member_role.rolname, grantor_role.rolname`,
      [roleNames],
    ),
    client.query(
      `select table_name
         from information_schema.tables
        where table_schema = 'public'
          and table_name = any($1::text[])
        order by table_name`,
      [tableNames],
    ),
    client.query(
      `select grantee.rolname as grantee,
              privilege.privilege_type,
              privilege.is_grantable,
              grantor.rolname as grantor
         from pg_database database_row
         cross join lateral aclexplode(coalesce(database_row.datacl, acldefault('d', database_row.datdba))) privilege
         left join pg_roles grantee on grantee.oid = privilege.grantee
         left join pg_roles grantor on grantor.oid = privilege.grantor
        where database_row.datname = current_database()
          and privilege.grantee = any(
            select oid from pg_roles where rolname = any($1::text[])
          )
        order by grantee, privilege.privilege_type`,
      [roleNames],
    ),
    client.query(
      `select grantee.rolname as grantee,
              privilege.privilege_type,
              privilege.is_grantable,
              grantor.rolname as grantor
         from pg_namespace namespace_row
         cross join lateral aclexplode(coalesce(namespace_row.nspacl, acldefault('n', namespace_row.nspowner))) privilege
         left join pg_roles grantee on grantee.oid = privilege.grantee
         left join pg_roles grantor on grantor.oid = privilege.grantor
        where namespace_row.nspname = 'public'
          and privilege.grantee = any(
            select oid from pg_roles where rolname = any($1::text[])
          )
        order by grantee, privilege.privilege_type`,
      [roleNames],
    ),
  ])

  return Object.freeze({
    server: server.rows[0] || null,
    extension: extension.rows[0] || null,
    roles: roles.rows,
    memberships: memberships.rows,
    tables: tables.rows.map((row) => row.table_name),
    databaseAcl: databaseAcl.rows,
    schemaAcl: schemaAcl.rows,
  })
}

function evaluateFreshFoundationState(state, options = {}) {
  const expectedDatabase = requireText(options.expectedDatabase, 'EXPECTED_DATABASE_REQUIRED')
  const expectedExtensionVersion = text(options.expectedExtensionVersion) || '1.7'
  const problems = []
  if (state?.server?.database_name !== expectedDatabase) problems.push('DATABASE_MISMATCH')
  const version = Number(state?.server?.server_version_num)
  if (!(version >= 170000 && version <= 179999)) problems.push('POSTGRESQL_17_REQUIRED')
  if (state?.server?.in_recovery !== false) problems.push('PRIMARY_REQUIRED')
  if (state?.server?.transaction_read_only !== 'off' || state?.server?.default_transaction_read_only !== 'off') {
    problems.push('READ_WRITE_REQUIRED')
  }
  if (state?.extension?.extversion !== expectedExtensionVersion || state?.extension?.schema_name !== 'public') {
    problems.push('BTREE_GIST_MISMATCH')
  }
  if ((state?.roles || []).length !== 0) problems.push('TARGET_ROLES_ALREADY_EXIST')
  if ((state?.tables || []).length !== 0) problems.push('FOUNDATION_TABLES_ALREADY_EXIST')
  if ((state?.memberships || []).length !== 0) problems.push('TARGET_MEMBERSHIPS_ALREADY_EXIST')
  if ((state?.databaseAcl || []).length !== 0) problems.push('TARGET_DATABASE_ACL_ALREADY_EXISTS')
  if ((state?.schemaAcl || []).length !== 0) problems.push('TARGET_SCHEMA_ACL_ALREADY_EXISTS')
  return Object.freeze({ ready: problems.length === 0, problems })
}

async function auditFreshFoundationState(client, options = {}) {
  const state = await inspectFoundationState(client, options)
  return Object.freeze({ state, ...evaluateFreshFoundationState(state, options) })
}

async function withTransaction(client, callback) {
  await client.query('begin')
  try {
    const result = await callback()
    await client.query('commit')
    return result
  } catch (error) {
    try {
      await client.query('rollback')
    } catch {
      // Preserve the original failure; cleanup is verified by the caller.
    }
    throw error
  }
}

async function withReadOnlySnapshot(client, callback) {
  await client.query('begin transaction isolation level repeatable read read only')
  try {
    const result = await callback()
    await client.query('rollback')
    return result
  } catch (error) {
    try {
      await client.query('rollback')
    } catch {
      // Keep the original fail-closed inspection error.
    }
    throw error
  }
}

async function createProvisionerViaBootstrap(client, options = {}) {
  requireMutation(options, 'PROVISIONER_CREATE_OPT_IN_REQUIRED')
  requireClient(client)
  const role = assertSafeIdentifier(options.role || PROVISIONER_ROLE)
  const password = assertPassword(options.password)
  return withTransaction(client, async () => {
    await client.query('select set_config($1, $2, true)', [PASSWORD_GUC, password])
    await client.query(`
      do $create_profitability_provisioner$
      declare
        provisioner_password text := current_setting('${PASSWORD_GUC}', true);
      begin
        if provisioner_password is null or length(provisioner_password) < 24 then
          raise exception 'PROFITABILITY_PROVISIONER_PASSWORD_MISSING';
        end if;
        if exists (select 1 from pg_roles where rolname = '${role}') then
          raise exception 'PROFITABILITY_PROVISIONER_ALREADY_EXISTS';
        end if;
        execute format(
          'create role %I with login password %L noinherit nosuperuser nocreatedb createrole noreplication nobypassrls connection limit -1',
          '${role}',
          provisioner_password
        );
        perform set_config('${PASSWORD_GUC}', '', true);
      end
      $create_profitability_provisioner$;
    `)
    return { role }
  })
}

async function grantProvisionerDatabaseAcl(client, options = {}) {
  requireMutation(options, 'DATABASE_ACL_GRANT_OPT_IN_REQUIRED')
  requireClient(client)
  const role = quoteIdentifier(options.role || PROVISIONER_ROLE)
  const database = quoteDatabaseIdentifier(requireText(options.database, 'DATABASE_NAME_REQUIRED'))
  await client.query(`grant connect on database ${database} to ${role} with grant option`)
}

async function grantProvisionerSchemaAcl(client, options = {}) {
  requireMutation(options, 'SCHEMA_ACL_GRANT_OPT_IN_REQUIRED')
  requireClient(client)
  const role = quoteIdentifier(options.role || PROVISIONER_ROLE)
  const schema = quoteIdentifier(options.schema || 'public')
  await client.query(`grant usage, create on schema ${schema} to ${role} with grant option`)
}

async function inspectSourceReferenceAcl(client, options = {}) {
  requireClient(client)
  const role = assertSafeIdentifier(options.role || 'profitability_owner')
  const expectedOwner = requireText(
    options.expectedOwner,
    'SOURCE_REFERENCE_OWNER_REQUIRED',
  )
  const tables = SOURCE_TABLES
  const [roleResult, ownerResult, tableAclResult, columnAclResult] = await Promise.all([
    client.query(
      `select count(*)::integer as role_count
         from pg_roles
        where rolname = $1`,
      [role],
    ),
    client.query(
      `select relation_row.relname as table_name,
              owner_role.rolname as owner_name
         from pg_class relation_row
         join pg_namespace namespace_row
           on namespace_row.oid = relation_row.relnamespace
         join pg_roles owner_role
           on owner_role.oid = relation_row.relowner
        where namespace_row.nspname = 'public'
          and relation_row.relkind in ('r', 'p')
          and relation_row.relname = any($1::text[])
        order by relation_row.relname`,
      [tables],
    ),
    client.query(
      `select relation_row.relname as table_name,
              privilege_row.privilege_type,
              privilege_row.is_grantable,
              grantor_role.rolname as grantor_name
         from pg_class relation_row
         join pg_namespace namespace_row
           on namespace_row.oid = relation_row.relnamespace
         cross join lateral aclexplode(
           case when cardinality(relation_row.relacl) > 0
                then relation_row.relacl else null::aclitem[] end
         ) privilege_row
         join pg_roles grantee_role
           on grantee_role.oid = privilege_row.grantee
         left join pg_roles grantor_role
           on grantor_role.oid = privilege_row.grantor
        where namespace_row.nspname = 'public'
          and relation_row.relname = any($1::text[])
          and grantee_role.rolname = $2
        order by relation_row.relname, privilege_row.privilege_type`,
      [tables, role],
    ),
    client.query(
      `select relation_row.relname as table_name,
              attribute_row.attname as column_name,
              privilege_row.privilege_type,
              privilege_row.is_grantable,
              grantor_role.rolname as grantor_name
         from pg_attribute attribute_row
         join pg_class relation_row
           on relation_row.oid = attribute_row.attrelid
         join pg_namespace namespace_row
           on namespace_row.oid = relation_row.relnamespace
         cross join lateral aclexplode(
           case when cardinality(attribute_row.attacl) > 0
                then attribute_row.attacl else null::aclitem[] end
         ) privilege_row
         join pg_roles grantee_role
           on grantee_role.oid = privilege_row.grantee
         left join pg_roles grantor_role
           on grantor_role.oid = privilege_row.grantor
        where namespace_row.nspname = 'public'
          and relation_row.relname = any($1::text[])
          and attribute_row.attnum > 0
          and not attribute_row.attisdropped
          and grantee_role.rolname = $2
        order by relation_row.relname, attribute_row.attname,
                 privilege_row.privilege_type`,
      [tables, role],
    ),
  ])
  const expectedColumns = SOURCE_REFERENCE_COLUMNS.flatMap(({ table, columns }) => (
    columns.map((column) => `${table}|${column}|REFERENCES|false|${expectedOwner}`)
  )).sort()
  const actualColumns = columnAclResult.rows.map((row) => [
    row.table_name,
    row.column_name,
    row.privilege_type,
    Boolean(row.is_grantable),
    row.grantor_name,
  ].join('|')).sort()
  const ownersExact = ownerResult.rows.length === tables.length
    && ownerResult.rows.every((row) => row.owner_name === expectedOwner)
  const roleExists = Number(roleResult.rows[0]?.role_count) === 1
  const exact = roleExists
    && ownersExact
    && tableAclResult.rows.length === 0
    && actualColumns.join('\n') === expectedColumns.join('\n')
  const absent = ownersExact
    && tableAclResult.rows.length === 0
    && columnAclResult.rows.length === 0
  return Object.freeze({
    exact,
    absent,
    roleExists,
    ownersExact,
    tableAclCount: tableAclResult.rows.length,
    columnAclCount: columnAclResult.rows.length,
  })
}

async function grantOwnerSourceReferenceAcl(client, options = {}) {
  requireMutation(options, 'SOURCE_REFERENCE_GRANT_OPT_IN_REQUIRED')
  requireClient(client)
  const role = assertSafeIdentifier(options.role || 'profitability_owner')
  const expectedOwner = requireText(
    options.expectedOwner,
    'SOURCE_REFERENCE_OWNER_REQUIRED',
  )
  const ownerIdentifier = quoteDatabaseIdentifier(expectedOwner)
  const roleIdentifier = quoteIdentifier(role)
  return withTransaction(client, async () => {
    const before = await inspectSourceReferenceAcl(client, { role, expectedOwner })
    if (before.exact) return before
    if (!before.roleExists || !before.absent) {
      throw new Error('SOURCE_REFERENCE_ACL_PARTIAL_OR_UNEXPECTED')
    }
    const identity = await client.query(
      `select current_user = session_user as direct_session,
              pg_has_role(session_user, $1, 'SET') as may_set_owner`,
      [expectedOwner],
    )
    if (identity.rows[0]?.direct_session !== true
        || identity.rows[0]?.may_set_owner !== true) {
      throw new Error('SOURCE_REFERENCE_OWNER_HANDOFF_FORBIDDEN')
    }
    await client.query(`set local role ${ownerIdentifier}`)
    for (const reference of SOURCE_REFERENCE_COLUMNS) {
      const table = quoteIdentifier(reference.table)
      const columns = reference.columns.map(quoteIdentifier).join(', ')
      await client.query(
        `grant references (${columns}) on table public.${table} to ${roleIdentifier}`,
      )
    }
    const after = await inspectSourceReferenceAcl(client, { role, expectedOwner })
    if (!after.exact) throw new Error('SOURCE_REFERENCE_ACL_POSTFLIGHT_FAILED')
    return after
  })
}

async function setRolePassword(client, options = {}) {
  requireMutation(options, 'ROLE_PASSWORD_SET_OPT_IN_REQUIRED')
  requireClient(client)
  const role = assertSafeIdentifier(options.role)
  const password = assertPassword(options.password)
  return withTransaction(client, async () => {
    await client.query('select set_config($1, $2, true)', [PASSWORD_GUC, password])
    await client.query(`
      do $set_profitability_role_password$
      declare
        role_password text := current_setting('${PASSWORD_GUC}', true);
      begin
        if role_password is null or length(role_password) < 24 then
          raise exception 'PROFITABILITY_ROLE_PASSWORD_MISSING';
        end if;
        execute format('alter role %I password %L', '${role}', role_password);
        perform set_config('${PASSWORD_GUC}', '', true);
      end
      $set_profitability_role_password$;
    `)
    return { role }
  })
}

async function lockRolePassword(client, options = {}) {
  requireMutation(options, 'ROLE_PASSWORD_LOCK_OPT_IN_REQUIRED')
  requireClient(client)
  const role = quoteIdentifier(options.role)
  await client.query(`alter role ${role} password null`)
}

function sha256File(file) {
  const filePath = path.resolve(requireText(file, 'CLOUD_SQL_PROXY_BINARY_REQUIRED'))
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.once('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.once('end', () => resolve(hash.digest('hex')))
  })
}

function listenOnLoopback(server) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.removeListener('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.removeListener('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true })
  })
}

function closeServer(server) {
  if (!server?.listening) return Promise.resolve()
  return new Promise((resolve) => server.close(() => resolve()))
}

async function reserveLoopbackPorts(options = {}) {
  const netModule = options.netModule || net
  const dataServer = netModule.createServer()
  const healthServer = netModule.createServer()
  try {
    await listenOnLoopback(dataServer)
    await listenOnLoopback(healthServer)
    const dataPort = Number(dataServer.address()?.port)
    const healthPort = Number(healthServer.address()?.port)
    if (!Number.isInteger(dataPort) || !Number.isInteger(healthPort)
        || dataPort < 1 || healthPort < 1 || dataPort === healthPort) {
      throw new Error('CLOUD_SQL_PROXY_PORT_RESERVATION_FAILED')
    }
    return Object.freeze({ dataPort, healthPort })
  } catch {
    throw new Error('CLOUD_SQL_PROXY_PORT_RESERVATION_FAILED')
  } finally {
    await Promise.all([closeServer(dataServer), closeServer(healthServer)])
  }
}

function requestLoopbackHealth({ port, path: healthPath, timeoutMs = 1000 } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port,
      path: healthPath,
      method: 'GET',
      timeout: timeoutMs,
    }, (response) => {
      response.resume()
      response.once('end', () => resolve(Number(response.statusCode || 0)))
    })
    request.once('timeout', () => request.destroy(new Error('HEALTH_TIMEOUT')))
    request.once('error', reject)
    request.end()
  })
}

function cloudSqlProxyChildEnvironment(environment = process.env) {
  const childEnvironment = {}
  for (const [key, value] of Object.entries(environment || {})) {
    const canonicalKey = key.toUpperCase()
    if (CLOUD_SQL_PROXY_CHILD_ENV_ALLOWLIST.has(canonicalKey) && typeof value === 'string') {
      childEnvironment[canonicalKey] = value
    }
  }
  return childEnvironment
}

function proxyError(code) {
  return new Error(code)
}

function normalizeProxyError(error, fallback = 'CLOUD_SQL_PROXY_START_FAILED') {
  const code = text(error?.message)
  return /^CLOUD_SQL_PROXY_[A-Z0-9_]+$/.test(code) ? proxyError(code) : proxyError(fallback)
}

function createCloudSqlAuthProxyAdapter(options = {}) {
  const environment = options.environment || process.env
  const proxyBase = text(environment.LOCALAPPDATA) || 'C:\\ProgramData'
  const proxyPath = path.resolve(options.proxyPath || path.join(
    proxyBase,
    'Cleanzi',
    'tools',
    'cloud-sql-proxy',
    `v${CLOUD_SQL_PROXY_VERSION}`,
    'cloud-sql-proxy.x64.exe',
  ))
  const platform = options.platform || process.platform
  const arch = options.arch || process.arch
  const statFile = options.statFile || ((file) => fs.promises.stat(file))
  const hashFile = options.sha256File || sha256File
  const runVersion = options.runVersion || defaultExecFile
  const reservePorts = options.reservePorts || reserveLoopbackPorts
  const spawnImpl = options.spawn || spawn
  const requestHealth = options.requestHealth || requestLoopbackHealth
  const wait = options.wait || ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)))
  const now = options.now || Date.now
  const signal = options.signal
  const startupTimeoutMs = Number(
    options.startupTimeoutMs ?? DEFAULT_CLOUD_SQL_PROXY_STARTUP_TIMEOUT_MS,
  )
  const stopTimeoutMs = Number(options.stopTimeoutMs ?? DEFAULT_CLOUD_SQL_PROXY_STOP_TIMEOUT_MS)
  const healthPollMs = Number(
    options.healthPollMs ?? DEFAULT_CLOUD_SQL_PROXY_HEALTH_POLL_MS,
  )
  const versionTimeoutMs = Number(options.versionTimeoutMs ?? 5000)
  const maxOutputBytes = Number(
    options.maxOutputBytes ?? DEFAULT_CLOUD_SQL_PROXY_MAX_OUTPUT_BYTES,
  )
  if (!Number.isInteger(startupTimeoutMs) || startupTimeoutMs < 1 || startupTimeoutMs > 120000
      || !Number.isInteger(stopTimeoutMs) || stopTimeoutMs < 1 || stopTimeoutMs > 30000
      || !Number.isInteger(healthPollMs) || healthPollMs < 1 || healthPollMs > 5000
      || !Number.isInteger(versionTimeoutMs) || versionTimeoutMs < 1 || versionTimeoutMs > 30000
      || !Number.isInteger(maxOutputBytes) || maxOutputBytes < 1024) {
    throw proxyError('CLOUD_SQL_PROXY_OPTIONS_INVALID')
  }

  let lifecycle = 'IDLE'
  let child = null
  let childClosed = true
  let childSpawnError = false
  let childExitPromise = Promise.resolve()
  let resolveChildExit = null
  let endpoint = null
  let preparePromise = null
  let closePromise = null
  let stdout = ''
  let stderr = ''

  const append = (current, chunk) => (current + chunk.toString('utf8')).slice(-maxOutputBytes)
  const healthStatus = (value) => Number(value?.statusCode ?? value)

  async function validateBinary() {
    if (platform !== 'win32' || arch !== 'x64') {
      throw proxyError('CLOUD_SQL_PROXY_PLATFORM_UNSUPPORTED')
    }
    let stats
    try {
      stats = await statFile(proxyPath)
    } catch {
      throw proxyError('CLOUD_SQL_PROXY_BINARY_MISSING')
    }
    if (!stats?.isFile?.()) throw proxyError('CLOUD_SQL_PROXY_BINARY_MISSING')
    let digest
    try {
      digest = text(await hashFile(proxyPath)).toLowerCase()
    } catch {
      throw proxyError('CLOUD_SQL_PROXY_BINARY_UNREADABLE')
    }
    if (digest !== CLOUD_SQL_PROXY_SHA256) {
      throw proxyError('CLOUD_SQL_PROXY_HASH_MISMATCH')
    }
    let versionOutput
    try {
      const result = await runVersion(proxyPath, ['--version'], {
        env: cloudSqlProxyChildEnvironment(environment),
        timeout: versionTimeoutMs,
        maxBuffer: 64 * 1024,
      })
      versionOutput = `${String(result?.stdout || '')}\n${String(result?.stderr || '')}`
    } catch {
      throw proxyError('CLOUD_SQL_PROXY_VERSION_MISMATCH')
    }
    const expectedVersionPattern = new RegExp(
      `(?:^|[^0-9])${CLOUD_SQL_PROXY_VERSION.replaceAll('.', '\\.')}(?:[^0-9]|$)`,
    )
    if (!expectedVersionPattern.test(versionOutput)) {
      throw proxyError('CLOUD_SQL_PROXY_VERSION_MISMATCH')
    }
  }

  async function waitForExit(timeoutMs) {
    if (!child || childClosed) return true
    return Promise.race([
      childExitPromise.then(() => true),
      wait(timeoutMs).then(() => false),
    ])
  }

  async function stopSpawnedChild() {
    if (!child || childClosed) return
    try { child.kill?.('SIGTERM') } catch {}
    if (await waitForExit(stopTimeoutMs)) return
    try { child.kill?.('SIGKILL') } catch {}
    if (await waitForExit(stopTimeoutMs)) return
    throw proxyError('CLOUD_SQL_PROXY_STOP_UNCONFIRMED')
  }

  function assertStartMayContinue() {
    if (signal?.aborted) throw proxyError('CLOUD_SQL_PROXY_START_ABORTED')
    if (childSpawnError) throw proxyError('CLOUD_SQL_PROXY_SPAWN_FAILED')
    if (childClosed) throw proxyError('CLOUD_SQL_PROXY_EARLY_EXIT')
  }

  async function waitForReady(healthPort) {
    const deadline = now() + startupTimeoutMs
    let startupReady = false
    while (now() < deadline) {
      assertStartMayContinue()
      try {
        if (!startupReady) {
          startupReady = healthStatus(await requestHealth({
            host: '127.0.0.1',
            port: healthPort,
            path: '/startup',
            timeoutMs: Math.min(1000, Math.max(1, deadline - now())),
          })) === 200
        }
        if (startupReady) {
          assertStartMayContinue()
          const ready = healthStatus(await requestHealth({
            host: '127.0.0.1',
            port: healthPort,
            path: '/readiness',
            timeoutMs: Math.min(1000, Math.max(1, deadline - now())),
          })) === 200
          if (ready) {
            assertStartMayContinue()
            return
          }
        }
      } catch (error) {
        if (/^CLOUD_SQL_PROXY_/.test(text(error?.message))) throw error
      }
      assertStartMayContinue()
      await wait(Math.min(healthPollMs, Math.max(1, deadline - now())))
    }
    assertStartMayContinue()
    throw proxyError('CLOUD_SQL_PROXY_START_TIMEOUT')
  }

  async function start() {
    await validateBinary()
    if (signal?.aborted) throw proxyError('CLOUD_SQL_PROXY_START_ABORTED')
    let ports
    try {
      ports = await reservePorts()
    } catch {
      throw proxyError('CLOUD_SQL_PROXY_PORT_RESERVATION_FAILED')
    }
    const dataPort = Number(ports?.dataPort)
    const healthPort = Number(ports?.healthPort)
    if (!Number.isInteger(dataPort) || dataPort < 1 || dataPort > 65535
        || !Number.isInteger(healthPort) || healthPort < 1 || healthPort > 65535
        || dataPort === healthPort) {
      throw proxyError('CLOUD_SQL_PROXY_PORT_RESERVATION_FAILED')
    }
    if (signal?.aborted) throw proxyError('CLOUD_SQL_PROXY_START_ABORTED')
    const args = [
      '--address=127.0.0.1',
      `--port=${dataPort}`,
      '--health-check',
      '--http-address=127.0.0.1',
      `--http-port=${healthPort}`,
      '--max-connections=1',
      '--max-sigterm-delay=5s',
      '--structured-logs',
      '--quiet',
      CLOUD_SQL_PROXY_CONNECTION_NAME,
    ]
    try {
      child = spawnImpl(proxyPath, args, {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: cloudSqlProxyChildEnvironment(environment),
      })
    } catch {
      throw proxyError('CLOUD_SQL_PROXY_SPAWN_FAILED')
    }
    if (!child || typeof child.once !== 'function') {
      child = null
      throw proxyError('CLOUD_SQL_PROXY_SPAWN_FAILED')
    }
    childClosed = false
    childSpawnError = false
    childExitPromise = new Promise((resolve) => { resolveChildExit = resolve })
    child.stdout?.on?.('data', (chunk) => { stdout = append(stdout, chunk) })
    child.stderr?.on?.('data', (chunk) => { stderr = append(stderr, chunk) })
    child.once('error', () => { childSpawnError = true })
    child.once('close', () => {
      childClosed = true
      resolveChildExit?.()
      resolveChildExit = null
    })
    await waitForReady(healthPort)
    return Object.freeze({ host: '127.0.0.1', port: dataPort })
  }

  async function prepare() {
    if (lifecycle === 'CLOSED' || lifecycle === 'STOPPING') {
      throw proxyError('CLOUD_SQL_PROXY_ALREADY_CLOSED')
    }
    if (lifecycle === 'FAILED') throw proxyError('CLOUD_SQL_PROXY_START_FAILED')
    if (endpoint) return endpoint
    if (preparePromise) return preparePromise
    lifecycle = 'STARTING'
    preparePromise = (async () => {
      try {
        endpoint = await start()
        lifecycle = 'READY'
        return endpoint
      } catch (error) {
        lifecycle = 'FAILED'
        try {
          await stopSpawnedChild()
        } catch (stopError) {
          throw normalizeProxyError(stopError, 'CLOUD_SQL_PROXY_STOP_UNCONFIRMED')
        }
        throw normalizeProxyError(error)
      }
    })()
    return preparePromise
  }

  async function close() {
    if (closePromise) return closePromise
    closePromise = (async () => {
      lifecycle = 'STOPPING'
      endpoint = null
      try {
        await stopSpawnedChild()
        lifecycle = 'CLOSED'
      } catch (error) {
        lifecycle = 'FAILED'
        throw normalizeProxyError(error, 'CLOUD_SQL_PROXY_STOP_UNCONFIRMED')
      }
    })()
    return closePromise
  }

  return Object.freeze({
    proxyPath,
    prepare,
    close,
  })
}

function createPsqlAdapter(options = {}) {
  const spawnImpl = options.spawn || spawn
  const defaultPsqlPath = path.resolve(options.psqlPath || DEFAULT_PSQL_PATH)
  const maxOutputBytes = Number(options.maxOutputBytes || 2 * 1024 * 1024)
  const defaultSignal = options.signal
  const defaultTimeoutMs = Number(options.timeoutMs ?? DEFAULT_PSQL_TIMEOUT_MS)
  const defaultKillEscalationMs = Number(
    options.killEscalationMs ?? DEFAULT_PSQL_KILL_ESCALATION_MS,
  )

  async function runFile(runOptions = {}) {
    requireMutation(runOptions, 'PSQL_EXECUTION_OPT_IN_REQUIRED')
    const psqlPath = path.resolve(runOptions.psqlPath || defaultPsqlPath)
    const host = requireText(runOptions.host, 'PSQL_HOST_REQUIRED')
    const port = Number(runOptions.port || 5432)
    const database = requireText(runOptions.database, 'PSQL_DATABASE_REQUIRED')
    const user = requireText(runOptions.user, 'PSQL_USER_REQUIRED')
    const password = assertPassword(runOptions.password)
    const file = path.resolve(requireText(runOptions.file, 'PSQL_FILE_REQUIRED'))
    const signal = runOptions.signal || defaultSignal
    const timeoutMs = Number(runOptions.timeoutMs ?? defaultTimeoutMs)
    const killEscalationMs = Number(
      runOptions.killEscalationMs ?? defaultKillEscalationMs,
    )
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PSQL_PORT_INVALID')
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > DEFAULT_PSQL_TIMEOUT_MS) {
      throw new Error('PSQL_TIMEOUT_INVALID')
    }
    if (!Number.isInteger(killEscalationMs) || killEscalationMs < 1
        || killEscalationMs > MAX_PSQL_KILL_ESCALATION_MS) {
      throw new Error('PSQL_KILL_ESCALATION_INVALID')
    }
    if (signal?.aborted) throw new Error('PSQL_EXECUTION_ABORTED')

    const args = [
      '--no-password',
      '--no-psqlrc',
      '--set=ON_ERROR_STOP=on',
      `--host=${host}`,
      `--port=${port}`,
      `--username=${user}`,
      `--dbname=${database}`,
      `--file=${file}`,
    ]
    for (const [key, rawValue] of Object.entries(runOptions.variables || {}).sort()) {
      if (!/^[a-z][a-z0-9_]*$/i.test(key) || /pass|secret|token|credential|database_url/i.test(key)) {
        throw new Error('PSQL_VARIABLE_NAME_FORBIDDEN')
      }
      const value = String(rawValue)
      if (value.includes(password)) throw new Error('PSQL_SECRET_ARGUMENT_FORBIDDEN')
      args.push(`--set=${key}=${value}`)
    }
    if (args.some((argument) => argument.includes(password))) throw new Error('PSQL_SECRET_ARGUMENT_FORBIDDEN')

    const sourceEnv = runOptions.env || process.env
    const childEnv = {}
    for (const [key, value] of Object.entries(sourceEnv)) {
      if (PSQL_CHILD_ENV_ALLOWLIST.has(key.toUpperCase()) && typeof value === 'string') {
        childEnv[key] = value
      }
    }
    childEnv.PGPASSWORD = password

    return new Promise((resolve, reject) => {
      let child
      let settled = false
      let timedOut = false
      let aborted = false
      let timeout = null
      let killEscalation = null
      let terminationReason = null
      let stdout = ''
      let stderr = ''
      const capturedResult = (code = null, childSignal = null) => Object.freeze({
        code: Number.isInteger(code) ? code : null,
        signal: childSignal || null,
        stdout: redact(stdout, [password]),
        stderr: redact(stderr, [password]),
      })
      const cleanup = () => {
        if (timeout) clearTimeout(timeout)
        if (killEscalation) clearTimeout(killEscalation)
        signal?.removeEventListener?.('abort', abortChild)
      }
      const fail = (code, result) => {
        if (settled) return
        settled = true
        cleanup()
        const error = new Error(code)
        if (result) error.result = result
        reject(error)
      }
      const terminateChild = (reason) => {
        if (settled || terminationReason) return
        terminationReason = reason
        try { child?.kill?.('SIGTERM') } catch {}
        killEscalation = setTimeout(() => {
          if (settled) return
          try { child?.kill?.('SIGKILL') } catch {}
        }, killEscalationMs)
      }
      const abortChild = () => {
        if (settled) return
        aborted = true
        terminateChild('abort')
      }
      try {
        child = spawnImpl(psqlPath, args, {
          shell: false,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: childEnv,
          ...(signal ? { signal } : {}),
        })
      } catch {
        fail('PSQL_SPAWN_FAILED')
        return
      }
      const append = (current, chunk) => (current + chunk.toString('utf8')).slice(-maxOutputBytes)
      child.stdout?.on('data', (chunk) => { stdout = append(stdout, chunk) })
      child.stderr?.on('data', (chunk) => { stderr = append(stderr, chunk) })
      child.once('error', () => {
        // AbortSignal and explicit termination can emit error before close. Waiting for
        // close prevents the caller from cleaning credentials while psql is still alive.
        if (terminationReason || timedOut || aborted || signal?.aborted) return
        return fail('PSQL_SPAWN_FAILED', capturedResult())
      })
      child.once('close', (code, childSignal) => {
        if (settled) return
        const result = capturedResult(code, childSignal)
        if (timedOut) return fail('PSQL_EXECUTION_TIMEOUT', result)
        if (aborted || signal?.aborted) return fail('PSQL_EXECUTION_ABORTED', result)
        if (code !== 0) {
          fail('PSQL_EXECUTION_FAILED', result)
        } else {
          settled = true
          cleanup()
          resolve(result)
        }
      })
      signal?.addEventListener?.('abort', abortChild, { once: true })
      if (signal?.aborted) {
        abortChild()
        return
      }
      timeout = setTimeout(() => {
        if (settled) return
        timedOut = true
        terminateChild('timeout')
      }, timeoutMs)
    })
  }

  return Object.freeze({ defaultPsqlPath, runFile })
}

function defaultExecFile(command, args, options) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      ...options,
      encoding: 'utf8',
      windowsHide: true,
      shell: false,
    }, (error, stdout, stderr) => {
      if (error) {
        const safe = new Error('READ_ONLY_COMMAND_FAILED')
        safe.exitCode = error.code
        safe.stderr = text(stderr)
        reject(safe)
        return
      }
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') })
    })
  })
}

function createGitStatusAdapter(options = {}) {
  const run = options.run || defaultExecFile
  async function git(cwd, args) {
    const repo = path.resolve(requireText(cwd, 'GIT_CWD_REQUIRED'))
    const result = await run('git', args, {
      cwd: repo,
      maxBuffer: 1024 * 1024,
      shell: false,
    })
    return String(result?.stdout || '').trim()
  }
  async function inspect(cwd) {
    const [branch, head, status] = await Promise.all([
      git(cwd, ['branch', '--show-current']),
      git(cwd, ['rev-parse', 'HEAD']),
      git(cwd, ['status', '--porcelain=v1', '--untracked-files=all']),
    ])
    return Object.freeze({ branch, head, status, clean: status.length === 0 })
  }
  async function assertHead(cwd, expectedHead) {
    const expected = requireText(expectedHead, 'EXPECTED_HEAD_REQUIRED').toLowerCase()
    if (!/^[0-9a-f]{40}$/.test(expected)) throw new Error('EXPECTED_HEAD_INVALID')
    const state = await inspect(cwd)
    if (state.head.toLowerCase() !== expected) throw new Error('GIT_HEAD_MISMATCH')
    return state
  }
  async function inspectRemoteHead(cwd, { remote = 'cleanzi01', branch } = {}) {
    const remoteName = requireText(remote, 'GIT_REMOTE_REQUIRED')
    const branchName = requireText(branch, 'GIT_BRANCH_REQUIRED')
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,200}$/.test(remoteName)
        || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,240}$/.test(branchName)
        || branchName.includes('..')) {
      throw new Error('GIT_REF_INVALID')
    }
    const output = await git(cwd, ['ls-remote', '--heads', remoteName, `refs/heads/${branchName}`])
    const [head = ''] = output.split(/\s+/)
    return /^[0-9a-f]{40}$/i.test(head) ? head.toLowerCase() : null
  }
  async function inspectRemoteUrl(cwd, { remote = 'cleanzi01' } = {}) {
    const remoteName = requireText(remote, 'GIT_REMOTE_REQUIRED')
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,200}$/.test(remoteName)) {
      throw new Error('GIT_REF_INVALID')
    }
    // Fetch is Git's default URL direction. `--fetch` is not a supported
    // `git remote get-url` option (including Git for Windows) and made the
    // otherwise read-only production audit fail before any database check.
    return git(cwd, ['remote', 'get-url', remoteName])
  }
  return Object.freeze({ inspect, assertHead, inspectRemoteHead, inspectRemoteUrl })
}

async function inspectExistingFoundationPostflight(client, options = {}) {
  requireClient(client)
  const migrationFile = path.resolve(requireText(
    options.migrationFile,
    'FOUNDATION_MIGRATION_FILE_REQUIRED',
  ))
  const postflights = loadIndependentPostflights(migrationFile)
  const executorSession = options.executorSession === true
  const allowUnverified = options.allowUnverified === true

  return withReadOnlySnapshot(client, async () => {
    const relations = await client.query(
      `select class.relname as table_name,
              owner.rolname as owner_name
         from pg_class class
         join pg_namespace namespace_row on namespace_row.oid = class.relnamespace
         join pg_roles owner on owner.oid = class.relowner
        where namespace_row.nspname = 'public'
          and class.relkind = 'r'
          and class.relname = any($1::text[])
        order by class.relname`,
      [[...FOUNDATION_TABLES]],
    )
    const names = relations.rows.map((row) => row.table_name).sort()
    const shapeExact = names.join('\n') === [...FOUNDATION_TABLES].sort().join('\n')
      && relations.rows.every((row) => row.owner_name === 'profitability_owner')
    const upgradeProfile = await inspectPostUpgradeFoundationMarkers(client)
    if (relations.rows.length === 0) {
      if (upgradeProfile.access === 'present'
          || upgradeProfile.financial === 'present') {
        return Object.freeze({
          status: 'partial',
          exact: false,
          relationCount: 0,
          rowCount: null,
        })
      }
      return Object.freeze({
        status: 'absent',
        exact: false,
        relationCount: 0,
        rowCount: 0,
      })
    }
    if (!shapeExact) {
      return Object.freeze({
        status: 'partial',
        exact: false,
        relationCount: relations.rows.length,
        rowCount: null,
      })
    }
    if (!executorSession) {
      if (!allowUnverified) throw new Error('MIGRATION_VERIFICATION_CREDENTIAL_REQUIRED')
      return Object.freeze({
        status: 'verification_required',
        exact: false,
        relationCount: relations.rows.length,
        rowCount: null,
      })
    }

    await client.query('set local role profitability_migration_runner')
    await client.query('set local role profitability_owner')
    let rowCount = 0
    for (const table of relations.rows) {
      const tableName = assertSafeIdentifier(table.table_name)
      const count = await client.query(
        `select count(*)::bigint as row_count from public.${quoteIdentifier(tableName)}`,
      )
      rowCount += Number(count.rows[0]?.row_count || 0)
    }
    try {
      const exactCatalog = upgradeProfile.financial === 'present'
        ? buildPostUpgradeFoundationExactCatalogPostflight(postflights.exactCatalog)
        : postflights.exactCatalog
      await client.query(exactCatalog)
    } catch {
      throw new Error('EXACT_CATALOG_POSTFLIGHT_FAILED')
    }
    if (upgradeProfile.access === 'present'
        || upgradeProfile.financial === 'present') {
      const upgradePostflights = loadPostUpgradeFoundationPostflights(migrationFile)
      if (upgradeProfile.access === 'present') {
        try {
          await client.query(upgradePostflights.access)
        } catch {
          throw new Error('ACCESS_PROFILE_V2_COMPOSITE_POSTFLIGHT_FAILED')
        }
      }
      if (upgradeProfile.financial === 'present') {
        try {
          await client.query(POST_UPGRADE_FOUNDATION_EXTENSION_EXACT_SQL)
        } catch {
          throw new Error('FOUNDATION_POST_UPGRADE_EXTENSION_POSTFLIGHT_FAILED')
        }
        try {
          await client.query(upgradePostflights.financial)
        } catch {
          throw new Error('FINANCIAL_V21_COMPOSITE_POSTFLIGHT_FAILED')
        }
      }
    }
    try {
      await client.query('select set_config($1, $2, true)', [
        'cleanzi.profitability_foundation_v2_runtime_role',
        'profitability_runtime',
      ])
      await client.query('select set_config($1, $2, true)', [
        'cleanzi.profitability_foundation_v2_session_role',
        'profitability_session',
      ])
      await client.query('select set_config($1, $2, true)', [
        'cleanzi.profitability_foundation_v2_fresh_install',
        'false',
      ])
      await client.query('select set_config($1, $2, true)', [
        'cleanzi.profitability_foundation_v2_entrypoint',
        '',
      ])
      await client.query(postflights.ownerAcl)
    } catch {
      throw new Error('OWNER_ACL_POSTFLIGHT_FAILED')
    }
    try {
      await client.query(postflights.finalGuard)
    } catch {
      throw new Error('FINAL_GUARD_FAILED')
    }
    return Object.freeze({
      status: 'exact',
      exact: true,
      relationCount: relations.rows.length,
      rowCount,
    })
  })
}

function secretString(value) {
  if (Buffer.isBuffer(value)) return value.toString('base64url')
  return assertPassword(String(value ?? ''))
}

function parseBooleanGate(value, code) {
  const normalized = text(value).toLowerCase()
  if (!normalized || ['0', 'false', 'no', 'nie'].includes(normalized)) return false
  if (['1', 'true', 'yes', 'tak'].includes(normalized)) return true
  throw new Error(code)
}

function runtimeEnvironmentMap(revision) {
  const containers = revision?.containers || revision?.template?.containers || []
  const result = new Map()
  for (const container of containers) {
    for (const variable of container?.env || []) {
      const name = text(variable?.name)
      if (!name) continue
      if (Object.prototype.hasOwnProperty.call(variable, 'value')) {
        result.set(name, { kind: 'value', value: String(variable.value ?? '') })
      } else {
        result.set(name, { kind: 'valueSource' })
      }
    }
  }
  return result
}

function readProfitabilityRuntimeGates(revisions) {
  if (!Array.isArray(revisions) || revisions.length === 0) {
    throw new Error('CLOUD_RUN_ACTIVE_REVISION_REQUIRED')
  }
  let enabled = false
  const allowlist = new Set()
  for (const revision of revisions) {
    const environment = runtimeEnvironmentMap(revision)
    const enabledVariable = environment.get('PROFITABILITY_DB_ENABLED')
    if (enabledVariable?.kind === 'valueSource') throw new Error('PROFITABILITY_GATE_SECRET_SOURCE_FORBIDDEN')
    enabled ||= parseBooleanGate(enabledVariable?.value, 'PROFITABILITY_DB_ENABLED_INVALID')
    const allowed = environment.get('PROFITABILITY_ACCESS_PROFILE_V2_ALLOWED_ORG_IDS')
    if (allowed?.kind === 'valueSource') throw new Error('PROFITABILITY_ALLOWLIST_SECRET_SOURCE_FORBIDDEN')
    for (const orgId of String(allowed?.value || '').split(',').map(text).filter(Boolean)) {
      allowlist.add(orgId.toLowerCase())
    }
  }
  return Object.freeze({ enabled, allowlistCount: allowlist.size })
}

function normalizeRoleState(state, options = {}) {
  const bootstrapGrantor = options.bootstrapGrantor || 'cloudsqladmin'
  const databaseOwner = options.databaseOwner || 'cloudsqlsuperuser'
  const schemaOwner = options.schemaOwner || 'firebaseowner_iclean-room-database_public'
  const expectedRoles = new Map([
    [PROVISIONER_ROLE, { login: true, createRole: true }],
    ['profitability_migration_executor', { login: true, createRole: false }],
    ['profitability_migration_runner', { login: false, createRole: false }],
    ['profitability_owner', { login: false, createRole: false }],
    ['profitability_session', { login: true, createRole: false }],
    ['profitability_runtime', { login: false, createRole: false }],
  ])
  let exact = state.roles.length === expectedRoles.size
  for (const role of state.roles) {
    const expected = expectedRoles.get(role.rolname)
    exact &&= Boolean(expected)
      && role.rolcanlogin === expected.login
      && role.rolcreaterole === expected.createRole
      && role.rolinherit === false
      && role.rolsuper === false
      && role.rolcreatedb === false
      && role.rolreplication === false
      && role.rolbypassrls === false
      && Number(role.rolconnlimit) === -1
      && role.rolvaliduntil === null
      && role.rolconfig === null
  }
  const expectedMemberships = [
    ...TARGET_ROLES.map((grantedRole) => ({
      granted_role: grantedRole,
      member_role: PROVISIONER_ROLE,
      grantor_role: bootstrapGrantor,
      admin_option: true,
      inherit_option: false,
      set_option: false,
    })),
    {
      granted_role: 'profitability_migration_runner',
      member_role: 'profitability_migration_executor',
      grantor_role: PROVISIONER_ROLE,
      admin_option: false,
      inherit_option: false,
      set_option: true,
    },
    {
      granted_role: 'profitability_owner',
      member_role: 'profitability_migration_runner',
      grantor_role: PROVISIONER_ROLE,
      admin_option: false,
      inherit_option: false,
      set_option: true,
    },
    {
      granted_role: 'profitability_runtime',
      member_role: 'profitability_session',
      grantor_role: PROVISIONER_ROLE,
      admin_option: false,
      inherit_option: false,
      set_option: true,
    },
  ]
  const membershipKey = (row) => [
    row.granted_role,
    row.member_role,
    row.grantor_role,
    Boolean(row.admin_option),
    Boolean(row.inherit_option),
    Boolean(row.set_option),
  ].join('|')
  exact &&= state.memberships.length === expectedMemberships.length
    && state.memberships.map(membershipKey).sort().join('\n')
      === expectedMemberships.map(membershipKey).sort().join('\n')

  const aclKey = (row) => [
    row.grantee,
    row.privilege_type,
    Boolean(row.is_grantable),
    row.grantor,
  ].join('|')
  const expectedDatabaseAcl = [
    [PROVISIONER_ROLE, 'CONNECT', true, databaseOwner],
    ['profitability_migration_executor', 'CONNECT', false, PROVISIONER_ROLE],
    ['profitability_session', 'CONNECT', false, PROVISIONER_ROLE],
  ].map(([grantee, privilege_type, is_grantable, grantor]) => ({
    grantee, privilege_type, is_grantable, grantor,
  }))
  const expectedSchemaAcl = [
    [PROVISIONER_ROLE, 'CREATE', true, schemaOwner],
    [PROVISIONER_ROLE, 'USAGE', true, schemaOwner],
    ['profitability_owner', 'CREATE', false, PROVISIONER_ROLE],
    ['profitability_owner', 'USAGE', false, PROVISIONER_ROLE],
    ['profitability_runtime', 'USAGE', false, PROVISIONER_ROLE],
  ].map(([grantee, privilege_type, is_grantable, grantor]) => ({
    grantee, privilege_type, is_grantable, grantor,
  }))
  exact &&= state.databaseAcl.map(aclKey).sort().join('\n')
      === expectedDatabaseAcl.map(aclKey).sort().join('\n')
    && state.schemaAcl.map(aclKey).sort().join('\n')
      === expectedSchemaAcl.map(aclKey).sort().join('\n')
  return Object.freeze({
    exact: Boolean(exact),
    roleCount: state.roles.length,
    membershipCount: state.memberships.length,
    state,
  })
}

function createProductionDependencies(options = {}) {
  const environment = options.environment || process.env
  const rootDir = path.resolve(options.rootDir || path.join(__dirname, '..', '..'))
  const foundationMigrationFile = path.resolve(
    options.foundationMigrationFile || path.join(rootDir, FOUNDATION_MIGRATION_RELATIVE_PATH),
  )
  const projectId = text(options.projectId || environment.PROFITABILITY_PRODUCTION_PROJECT) || 'iclean-room'
  const instanceId = text(options.instanceId || environment.PROFITABILITY_PRODUCTION_INSTANCE) || 'iclean-room-instance'
  const instanceRegion = text(options.instanceRegion || environment.PROFITABILITY_PRODUCTION_INSTANCE_REGION) || 'europe-west3'
  const database = text(options.database || environment.PROFITABILITY_PRODUCTION_DATABASE) || 'iclean-room-database'
  const connectionName = `${projectId}:${instanceRegion}:${instanceId}`
  const runtimeRegion = text(options.runtimeRegion || environment.PROFITABILITY_RUNTIME_REGION) || 'europe-west4'
  const runtimeService = text(options.runtimeService || environment.PROFITABILITY_RUNTIME_SERVICE) || 'cleanzi-01'
  const iamDatabaseUser = text(options.iamDatabaseUser || environment.PROFITABILITY_IAM_DATABASE_USER)
    || 'biuro@bestclean.pl'
  const remote = text(options.remote || environment.PROFITABILITY_GIT_REMOTE) || 'cleanzi01'
  const cloudApi = options.cloudApi || createCloudSqlAdminApiAdapter({
    projectId,
    instanceId,
    auth: options.auth,
    request: options.request,
    sleep: options.sleep,
    now: options.now,
    signal: options.signal,
    requestTimeoutMs: options.cloudRequestTimeoutMs,
  })
  const pgAdapter = options.pgAdapter || createCloudSqlPgAdapter({
    instanceConnectionName: connectionName,
    ipType: options.ipType || environment.PROFITABILITY_CLOUD_SQL_IP_TYPE || 'PUBLIC',
    ConnectorClass: options.ConnectorClass,
    ClientClass: options.ClientClass,
    connector: options.connector,
  })
  const gitAdapter = options.gitAdapter || createGitStatusAdapter({ run: options.gitRun })
  const psqlAdapter = options.psqlAdapter || createPsqlAdapter({
    // Production never accepts an executable path from ambient environment.
    // `options.psqlPath` remains an explicit dependency-injection seam for tests.
    psqlPath: options.psqlPath || DEFAULT_PSQL_PATH,
    spawn: options.spawn,
    signal: options.signal,
    timeoutMs: options.psqlTimeoutMs,
  })
  const cloudSqlProxyAdapter = options.cloudSqlProxyAdapter || options.proxyAdapter
    || createCloudSqlAuthProxyAdapter({
      proxyPath: options.cloudSqlProxyPath || environment.PROFITABILITY_CLOUD_SQL_PROXY_PATH,
      environment,
      signal: options.signal,
      spawn: options.proxySpawn,
      statFile: options.proxyStatFile,
      sha256File: options.proxySha256File,
      runVersion: options.proxyRunVersion,
      reservePorts: options.proxyReservePorts,
      requestHealth: options.proxyRequestHealth,
      wait: options.proxyWait,
      now: options.proxyNow,
      platform: options.platform,
      arch: options.arch,
      startupTimeoutMs: options.proxyStartupTimeoutMs,
      stopTimeoutMs: options.proxyStopTimeoutMs,
      healthPollMs: options.proxyHealthPollMs,
    })
  const knownPasswords = new Map()
  let lastBootstrapName = null

  async function withIamClient(callback) {
    const client = await pgAdapter.connectIamAdmin({
      database,
      user: iamDatabaseUser,
      applicationName: 'cleanzi-profitability-foundation-v2-audit',
    })
    try {
      return await callback(client)
    } finally {
      await client.end()
    }
  }

  async function inspectActiveRuntimeGates() {
    const service = await cloudApi.inspectCloudRunService({ region: runtimeRegion, service: runtimeService })
    const traffic = Array.isArray(service?.trafficStatuses) ? service.trafficStatuses : []
    const active = traffic.filter((entry) => Number(entry?.percent || 0) > 0)
    const revisionNames = [...new Set(active.map((entry) => text(entry?.revision)).filter(Boolean))]
    if (active.reduce((sum, entry) => sum + Number(entry?.percent || 0), 0) !== 100
        || revisionNames.length === 0) {
      throw new Error('CLOUD_RUN_TRAFFIC_STATE_UNVERIFIABLE')
    }
    const revisions = await Promise.all(
      revisionNames.map((revision) => cloudApi.inspectCloudRunRevision({
        region: runtimeRegion,
        service: runtimeService,
        revision,
      })),
    )
    return readProfitabilityRuntimeGates(revisions)
  }

  async function inspectRoleState() {
    return withIamClient(async (client) => normalizeRoleState(
      await inspectFoundationState(client),
      {
        bootstrapGrantor: 'cloudsqladmin',
        databaseOwner: 'cloudsqlsuperuser',
        schemaOwner: 'firebaseowner_iclean-room-database_public',
      },
    ))
  }

  async function inspectMigrationState({ executorPassword } = {}) {
    const inspectWithClient = async (client, mayAssumeOwner) => {
      const result = await inspectExistingFoundationPostflight(client, {
        migrationFile: foundationMigrationFile,
        executorSession: mayAssumeOwner,
      })
      return Object.freeze({
        exact: result.exact,
        relationCount: result.relationCount,
        rowCount: result.rowCount || 0,
      })
    }
    if (executorPassword !== undefined) {
      const client = await pgAdapter.connectBuiltin({
        database,
        user: 'profitability_migration_executor',
        password: secretString(executorPassword),
        applicationName: 'cleanzi-profitability-foundation-v2-postflight',
      })
      try {
        return await inspectWithClient(client, true)
      } finally {
        await client.end()
      }
    }
    return withIamClient((client) => inspectWithClient(client, false))
  }

  async function inspectPreMigrationState() {
    const preflights = loadIndependentPreflights(foundationMigrationFile)
    return withIamClient(async (client) => {
      await withReadOnlySnapshot(client, async () => {
        try {
          await client.query(preflights.sourceGuard)
          await client.query(preflights.targetStateGuard)
        } catch {
          throw new Error('INDEPENDENT_PREFLIGHT_FAILED')
        }
      })
      // Inspect server writability only after the read-only verification
      // transaction has rolled back; otherwise transaction_read_only would be
      // reported as "on" because of the verifier itself.
      return inspectFoundationState(client)
    })
  }

  async function verifyKnownPasswordRejected(roleName) {
    const role = assertSafeIdentifier(roleName)
    const password = knownPasswords.get(role)
    if (!password) return false
    let client = null
    try {
      client = await pgAdapter.connectBuiltin({ database, user: role, password })
      return false
    } catch (error) {
      return text(error?.code).toUpperCase() === '28P01'
    } finally {
      try { await client?.end?.() } catch {}
    }
  }

  const sourceControl = Object.freeze({
    async inspect() {
      const state = await gitAdapter.inspect(rootDir)
      const remoteHead = await gitAdapter.inspectRemoteHead(rootDir, {
        remote,
        branch: state.branch,
      })
      return Object.freeze({
        ...state,
        remoteHead,
        remoteContainsHead: remoteHead === state.head.toLowerCase(),
      })
    },
  })

  const cloudSqlAdmin = Object.freeze({
    async inspect(runOptions = {}) {
      const [instance, backup] = await Promise.all([
        cloudApi.inspectInstance(),
        cloudApi.inspectBackupRun(runOptions.backupId),
      ])
      const flags = new Map(
        (instance?.settings?.databaseFlags || []).map((flag) => [flag.name, String(flag.value ?? '')]),
      )
      const pgAuthidFlag = text(flags.get('cloudsql.pg_authid_select_role')).toLowerCase()
      return Object.freeze({
        project: projectId,
        instance: instanceId,
        region: instance?.region || instanceRegion,
        state: instance?.state || 'UNKNOWN',
        backup: { id: String(backup?.id ?? ''), status: backup?.status || 'UNKNOWN' },
        pgAuthidSelectRoleEnabled: !['', '0', 'false', 'off', 'no'].includes(pgAuthidFlag),
      })
    },
    listUsers: (runOptions) => cloudApi.listUsers(runOptions),
    createBootstrap: ({ name, password, mutate }) => cloudApi.createEphemeralBuiltinUser({
      name,
      password: secretString(password),
      mutate,
    }),
    settleBootstrapCreate: ({ name, operationName }) => cloudApi.settleCreateOperation({
      name,
      operationName,
    }),
    deleteBootstrap: ({ name, mutate }) => cloudApi.deleteEphemeralBuiltinUser({ name, mutate }),
  })

  const databaseAdmin = Object.freeze({
    async audit() {
      const [state, gates] = await Promise.all([
        inspectPreMigrationState(),
        inspectActiveRuntimeGates(),
      ])
      if (state.server?.database_owner !== 'cloudsqlsuperuser') {
        throw new Error('DATABASE_OWNER_MISMATCH')
      }
      return Object.freeze({
        database: state.server?.database_name,
        pgMajor: Math.floor(Number(state.server?.server_version_num || 0) / 10000),
        primary: state.server?.in_recovery === false,
        readWrite: state.server?.transaction_read_only === 'off'
          && state.server?.default_transaction_read_only === 'off',
        bootstrapGrantor: state.server?.bootstrap_grantor,
        databaseOwner: state.server?.database_owner,
        schemaOwner: state.server?.schema_owner,
        extension: {
          name: state.extension?.extname,
          version: state.extension?.extversion,
          schema: state.extension?.schema_name,
        },
        targetRoleCount: state.roles.length,
        targetRelationCount: state.tables.length,
        featureEnabled: gates.enabled,
        allowlistCount: gates.allowlistCount,
      })
    },
    async openBootstrap({ name, password }) {
      const bootstrapName = assertSafePrincipalName(name)
      const bootstrapPassword = secretString(password)
      const client = await pgAdapter.connectBuiltin({
        database,
        user: bootstrapName,
        password: bootstrapPassword,
        applicationName: 'cleanzi-profitability-foundation-v2-bootstrap',
      })
      lastBootstrapName = bootstrapName
      return Object.freeze({
        createRestrictedProvisioner: async ({ name: role, password: provisionerPassword, mutate }) => {
          const normalizedPassword = secretString(provisionerPassword)
          const normalizedRole = assertSafeIdentifier(role)
          knownPasswords.set(normalizedRole, normalizedPassword)
          return createProvisionerViaBootstrap(client, {
            role: normalizedRole,
            password: normalizedPassword,
            mutate,
          })
        },
        grantDatabaseConnectOption: ({ database: databaseName, role, mutate }) => (
          grantProvisionerDatabaseAcl(client, { database: databaseName, role, mutate })
        ),
        lockProvisioner: ({ mutate }) => lockRolePassword(client, {
          role: PROVISIONER_ROLE,
          mutate,
        }),
        close: () => client.end(),
      })
    },
    async grantSchemaOptionsAsIamOwner({ role, schema, expectedOwner, mutate }) {
      requireMutation({ mutate }, 'SCHEMA_OWNER_GRANT_OPT_IN_REQUIRED')
      return withIamClient(async (client) => {
        const result = await client.query(
          `select pg_get_userbyid(nspowner) as owner_name
             from pg_namespace
            where nspname = $1`,
          [assertSafeIdentifier(schema)],
        )
        if (result.rows[0]?.owner_name !== expectedOwner) throw new Error('SCHEMA_OWNER_MISMATCH')
        return grantProvisionerSchemaAcl(client, { role, schema, mutate: true })
      })
    },
    async verifyProvisionerHandoff() {
      return withIamClient(async (client) => {
        if (!lastBootstrapName) throw new Error('BOOTSTRAP_IDENTITY_REQUIRED')
        const state = await inspectFoundationState(client, { bootstrapRole: lastBootstrapName })
        const bootstrapFootprintResult = await client.query(
          `with bootstrap as (
             select oid from pg_roles where rolname = $1
           ), owned_objects(owner_oid) as (
             select datdba from pg_database
             union all select nspowner from pg_namespace
             union all select relowner from pg_class
             union all select proowner from pg_proc
             union all select typowner from pg_type
             union all select spcowner from pg_tablespace
             union all select fdwowner from pg_foreign_data_wrapper
             union all select srvowner from pg_foreign_server
             union all select lanowner from pg_language
             union all select lomowner from pg_largeobject_metadata
           ), acl_edges(grantee, grantor) as (
             select acl.grantee, acl.grantor
               from pg_database row
               cross join lateral aclexplode(
                 case when cardinality(row.datacl) > 0 then row.datacl else null::aclitem[] end
               ) acl
             union all
             select acl.grantee, acl.grantor
               from pg_namespace row
               cross join lateral aclexplode(
                 case when cardinality(row.nspacl) > 0 then row.nspacl else null::aclitem[] end
               ) acl
             union all
             select acl.grantee, acl.grantor
               from pg_class row
               cross join lateral aclexplode(
                 case when cardinality(row.relacl) > 0 then row.relacl else null::aclitem[] end
               ) acl
             union all
             select acl.grantee, acl.grantor
               from pg_proc row
               cross join lateral aclexplode(
                 case when cardinality(row.proacl) > 0 then row.proacl else null::aclitem[] end
               ) acl
             union all
             select acl.grantee, acl.grantor
               from pg_type row
               cross join lateral aclexplode(
                 case when cardinality(row.typacl) > 0 then row.typacl else null::aclitem[] end
               ) acl
             union all
             select acl.grantee, acl.grantor
               from pg_tablespace row
               cross join lateral aclexplode(
                 case when cardinality(row.spcacl) > 0 then row.spcacl else null::aclitem[] end
               ) acl
             union all
             select acl.grantee, acl.grantor
               from pg_foreign_data_wrapper row
               cross join lateral aclexplode(
                 case when cardinality(row.fdwacl) > 0 then row.fdwacl else null::aclitem[] end
               ) acl
             union all
             select acl.grantee, acl.grantor
               from pg_foreign_server row
               cross join lateral aclexplode(
                 case when cardinality(row.srvacl) > 0 then row.srvacl else null::aclitem[] end
               ) acl
             union all
             select acl.grantee, acl.grantor
               from pg_language row
               cross join lateral aclexplode(
                 case when cardinality(row.lanacl) > 0 then row.lanacl else null::aclitem[] end
               ) acl
             union all
             select acl.grantee, acl.grantor
               from pg_largeobject_metadata row
               cross join lateral aclexplode(
                 case when cardinality(row.lomacl) > 0 then row.lomacl else null::aclitem[] end
               ) acl
             union all
             select acl.grantee, acl.grantor
               from pg_parameter_acl row
               cross join lateral aclexplode(
                 case when cardinality(row.paracl) > 0 then row.paracl else null::aclitem[] end
               ) acl
           ), default_acl_owners(owner_oid) as (
             select defaclrole from pg_default_acl
           ), default_acl_edges(grantee, grantor) as (
             select acl.grantee, acl.grantor
               from pg_default_acl row
               cross join lateral aclexplode(
                 case when cardinality(row.defaclacl) > 0 then row.defaclacl else null::aclitem[] end
               ) acl
           )
           select
             (select count(*)::integer
                from owned_objects, bootstrap
               where owner_oid = bootstrap.oid) as owned_count,
             (select count(*)::integer
                from acl_edges, bootstrap
               where grantee = bootstrap.oid or grantor = bootstrap.oid) as acl_count,
             (select count(*)::integer
                from bootstrap
               where exists (
                 select 1 from default_acl_owners where owner_oid = bootstrap.oid
               ) or exists (
                 select 1
                   from default_acl_edges
                  where grantee = bootstrap.oid or grantor = bootstrap.oid
               )) as default_acl_count`,
          [lastBootstrapName],
        )
        const bootstrapFootprint = bootstrapFootprintResult.rows[0] || {}
        const provisioner = state.roles.find((role) => role.rolname === PROVISIONER_ROLE)
        const dbAcl = state.databaseAcl.filter((acl) => acl.grantee === PROVISIONER_ROLE)
        const schemaAcl = state.schemaAcl.filter((acl) => acl.grantee === PROVISIONER_ROLE)
        const exactDbAcl = dbAcl.length === 1
          && dbAcl[0].privilege_type === 'CONNECT'
          && dbAcl[0].is_grantable === true
          && dbAcl[0].grantor === state.server?.database_owner
        const schemaKeys = schemaAcl
          .map((acl) => `${acl.privilege_type}|${Boolean(acl.is_grantable)}|${acl.grantor}`)
          .sort()
        // A Cloud SQL BUILT_IN user is represented by one platform-managed
        // membership while it exists.  Creating a role through that user does
        // not add an ADMIN edge from the created role back to the user.  Treat
        // the exact Cloud SQL edge as part of the handoff fingerprint and
        // reject every additional target/bootstrap membership.
        const exactBootstrapMembership = state.memberships.length === 1
          && state.memberships[0].granted_role === 'cloudsqlsuperuser'
          && state.memberships[0].member_role === lastBootstrapName
          && state.memberships[0].grantor_role === state.server?.bootstrap_grantor
          && state.memberships[0].admin_option === false
          && state.memberships[0].inherit_option === true
          && state.memberships[0].set_option === true
        const targetsAbsent = state.roles.every((role) => !TARGET_ROLES.includes(role.rolname))
        if (!provisioner
            || provisioner.rolcanlogin !== true
            || provisioner.rolcreaterole !== true
            || provisioner.rolinherit !== false
            || provisioner.rolsuper !== false
            || provisioner.rolcreatedb !== false
            || provisioner.rolreplication !== false
            || provisioner.rolbypassrls !== false
            || Number(provisioner.rolconnlimit) !== -1
            || provisioner.rolvaliduntil !== null
            || provisioner.rolconfig !== null
            || !exactBootstrapMembership
            || !targetsAbsent
            || state.tables.length !== 0
            || Number(bootstrapFootprint.owned_count) !== 0
            || Number(bootstrapFootprint.acl_count) !== 0
            || Number(bootstrapFootprint.default_acl_count) !== 0
            || state.server?.database_owner !== 'cloudsqlsuperuser'
            || state.server?.schema_owner !== 'firebaseowner_iclean-room-database_public'
            || state.server?.database_owner === PROVISIONER_ROLE
            || state.server?.schema_owner === PROVISIONER_ROLE
            || !exactDbAcl
            || schemaKeys.join(',') !== [
              `CREATE|true|${state.server?.schema_owner}`,
              `USAGE|true|${state.server?.schema_owner}`,
            ].join(',')) {
          throw new Error('PROVISIONER_HANDOFF_INVALID')
        }
        return true
      })
    },
    async grantOwnerSourceReferences({ role, expectedOwner, mutate }) {
      requireMutation({ mutate }, 'SOURCE_REFERENCE_GRANT_OPT_IN_REQUIRED')
      return withIamClient((client) => grantOwnerSourceReferenceAcl(client, {
        role,
        expectedOwner,
        mutate: true,
      }))
    },
    async inspectOwnerSourceReferences({ role, expectedOwner } = {}) {
      return withIamClient((client) => inspectSourceReferenceAcl(client, {
        role: role || 'profitability_owner',
        expectedOwner: expectedOwner || 'firebaseowner_iclean-room-database_public',
      }))
    },
    async openProvisioner({ name, password }) {
      const role = assertSafeIdentifier(name)
      const provisionerPassword = secretString(password)
      const client = await pgAdapter.connectBuiltin({
        database,
        user: role,
        password: provisionerPassword,
        applicationName: 'cleanzi-profitability-foundation-v2-provisioner',
      })
      knownPasswords.set(role, provisionerPassword)
      return Object.freeze({
        async activateExecutor({ name: executorName, password: executorPassword, mutate }) {
          const normalizedPassword = secretString(executorPassword)
          const normalizedRole = assertSafeIdentifier(executorName)
          knownPasswords.set(normalizedRole, normalizedPassword)
          return setRolePassword(client, {
            role: normalizedRole,
            password: normalizedPassword,
            mutate,
          })
        },
        lockExecutor: ({ mutate }) => lockRolePassword(client, {
          role: 'profitability_migration_executor',
          mutate,
        }),
        lockSelf: ({ mutate }) => lockRolePassword(client, { role, mutate }),
        close: () => client.end(),
      })
    },
    inspectRoles: inspectRoleState,
    verifyPasswordNull: verifyKnownPasswordRejected,
    async verifyBootstrapAbsent(name) {
      const bootstrapName = assertSafePrincipalName(name)
      return withIamClient(async (client) => {
        const result = await client.query(
          `select
             (select count(*)::integer from pg_roles where rolname = $1) as role_count,
             (select count(*)::integer
                from pg_auth_members membership
                join pg_roles granted_role on granted_role.oid = membership.roleid
                join pg_roles member_role on member_role.oid = membership.member
               where granted_role.rolname = $1 or member_role.rolname = $1) as membership_count`,
          [bootstrapName],
        )
        return Number(result.rows[0]?.role_count) === 0
          && Number(result.rows[0]?.membership_count) === 0
      })
    },
    inspectMigration: inspectMigrationState,
    async postflight({ executorPassword } = {}) {
      const [
        roles,
        migration,
        sourceReferences,
        gates,
        bootstrapAbsent,
        provisionerLocked,
        executorLocked,
      ] = await Promise.all([
        inspectRoleState(),
        inspectMigrationState({ executorPassword }),
        databaseAdmin.inspectOwnerSourceReferences(),
        inspectActiveRuntimeGates(),
        lastBootstrapName
          ? databaseAdmin.verifyBootstrapAbsent(lastBootstrapName)
          : Promise.resolve(false),
        verifyKnownPasswordRejected(PROVISIONER_ROLE),
        verifyKnownPasswordRejected('profitability_migration_executor'),
      ])
      return Object.freeze({
        roles,
        migration,
        sourceReferences,
        bootstrapAbsent,
        provisionerPasswordNull: provisionerLocked,
        executorPasswordNull: executorLocked,
        provisionerFreshLoginRejected: provisionerLocked,
        executorFreshLoginRejected: executorLocked,
        featureEnabled: gates.enabled,
        allowlistCount: gates.allowlistCount,
      })
    },
  })

  let psqlProxyEndpoint = null
  let psqlProxyPreparePromise = null
  let psqlProxyClosePromise = null
  let psqlProxyClosed = false

  function requirePsqlProxyEndpoint() {
    if (!psqlProxyEndpoint) throw new Error('CLOUD_SQL_PROXY_NOT_READY')
    return psqlProxyEndpoint
  }

  const psqlRunner = Object.freeze({
    async prepare() {
      if (psqlProxyClosed) throw new Error('CLOUD_SQL_PROXY_ALREADY_CLOSED')
      if (psqlProxyEndpoint) return psqlProxyEndpoint
      if (!psqlProxyPreparePromise) {
        psqlProxyPreparePromise = Promise.resolve().then(
          () => cloudSqlProxyAdapter.prepare(),
        ).then((candidate) => {
          const host = text(candidate?.host)
          const port = Number(candidate?.port)
          if (host !== '127.0.0.1' || !Number.isInteger(port) || port < 1 || port > 65535) {
            throw new Error('CLOUD_SQL_PROXY_ENDPOINT_INVALID')
          }
          psqlProxyEndpoint = Object.freeze({ host, port })
          return psqlProxyEndpoint
        })
      }
      return psqlProxyPreparePromise
    },
    async runRoles({ password, options: runOptions }) {
      const connection = requirePsqlProxyEndpoint()
      return psqlAdapter.runFile({
        ...connection,
        database,
        user: PROVISIONER_ROLE,
        password: secretString(password),
        file: path.join(rootDir, 'dataconnect', 'admin', '20260925_profitability_foundation_v2_roles_preprovision.psql'),
        variables: {
          profitability_roles_expected_database: database,
          profitability_roles_expected_admin: PROVISIONER_ROLE,
          profitability_roles_expected_bootstrap_grantor: 'cloudsqladmin',
          profitability_roles_backup_reference: runOptions.backupId,
          profitability_roles_confirmation: 'PROVISION_PROFITABILITY_FOUNDATION_V2_ROLES_ONLY_20260926',
        },
        mutate: true,
      })
    },
    async runMigration({ password, options: runOptions }) {
      const connection = requirePsqlProxyEndpoint()
      return psqlAdapter.runFile({
        ...connection,
        database,
        user: 'profitability_migration_executor',
        password: secretString(password),
        file: path.join(rootDir, 'dataconnect', 'admin', '20260925_profitability_domain_foundation_v2_apply.psql'),
        variables: {
          profitability_foundation_expected_database: database,
          profitability_foundation_expected_executor: 'profitability_migration_executor',
          profitability_foundation_expected_provisioner: PROVISIONER_ROLE,
          profitability_foundation_expected_bootstrap_grantor: 'cloudsqladmin',
          profitability_foundation_expected_migration_runner: 'profitability_migration_runner',
          profitability_foundation_owner_role: 'profitability_owner',
          profitability_foundation_runtime_role: 'profitability_runtime',
          profitability_foundation_session_role: 'profitability_session',
          profitability_foundation_expected_btree_gist_version: '1.7',
          profitability_foundation_expected_btree_gist_schema: 'public',
          profitability_foundation_backup_reference: runOptions.backupId,
          profitability_foundation_confirmation: runOptions.confirmation,
        },
        mutate: true,
      })
    },
    async close() {
      if (!psqlProxyClosePromise) {
        psqlProxyClosed = true
        psqlProxyClosePromise = Promise.resolve().then(() => cloudSqlProxyAdapter.close()).finally(() => {
          psqlProxyEndpoint = null
        })
      }
      return psqlProxyClosePromise
    },
  })

  let dependencyClosePromise = null
  async function close() {
    if (dependencyClosePromise) return dependencyClosePromise
    dependencyClosePromise = (async () => {
      let complete = true
      try {
        for (const resource of [psqlRunner, pgAdapter]) {
          try {
            await resource?.close?.()
          } catch {
            complete = false
          }
        }
      } finally {
        knownPasswords.clear()
      }
      if (!complete) throw new Error('PRODUCTION_DEPENDENCY_CLOSE_FAILED')
    })()
    return dependencyClosePromise
  }

  return Object.freeze({
    sourceControl,
    cloudSqlAdmin,
    databaseAdmin,
    psqlRunner,
    close,
    randomSecret: options.randomSecret || (() => crypto.randomBytes(48)),
    now: options.now || Date.now,
  })
}

module.exports = {
  CLOUD_SQL_ADMIN_BASE_URL,
  CLOUD_SQL_PROXY_CONNECTION_NAME,
  CLOUD_SQL_PROXY_SHA256,
  CLOUD_SQL_PROXY_VERSION,
  DEFAULT_PSQL_PATH,
  DEFAULT_PG_CONNECT_TIMEOUT_MS,
  DEFAULT_PG_QUERY_TIMEOUT_MS,
  FOUNDATION_TABLES,
  SOURCE_REFERENCE_COLUMNS,
  SOURCE_TABLES,
  PASSWORD_GUC,
  POST_UPGRADE_FOUNDATION_MARKERS_SQL,
  POST_UPGRADE_FOUNDATION_EXTENSION_EXACT_SQL,
  PROVISIONER_ROLE,
  TARGET_ROLES,
  auditFreshFoundationState,
  buildPostUpgradeFoundationExactCatalogPostflight,
  createCloudSqlAuthProxyAdapter,
  createCloudSqlAdminApiAdapter,
  createCloudSqlPgAdapter,
  createGitStatusAdapter,
  createProductionDependencies,
  createProvisionerViaBootstrap,
  createPsqlAdapter,
  evaluateFreshFoundationState,
  extractExactCatalogPostflight,
  grantProvisionerDatabaseAcl,
  grantProvisionerSchemaAcl,
  inspectFoundationState,
  inspectExistingFoundationPostflight,
  inspectSourceReferenceAcl,
  lockRolePassword,
  matchesGeneratedBootstrapUser,
  grantOwnerSourceReferenceAcl,
  normalizeRoleState,
  redact,
  reserveLoopbackPorts,
  setRolePassword,
  sha256File,
}
