'use strict'

const EXPECTED = Object.freeze({
  project: 'iclean-room',
  instance: 'iclean-room-instance',
  region: 'europe-west3',
  database: 'iclean-room-database',
  backupId: '1790505049269',
  runtimeService: 'cleanzi-01',
  runtimeRegion: 'europe-west4',
  runtimeServiceAccount:
    'cleanzi-01-apphosting-runtime@iclean-room.iam.gserviceaccount.com',
  secretId: 'PROFITABILITY_DB_PASS',
  sessionRole: 'profitability_session',
  runtimeRole: 'profitability_runtime',
  confirmation: 'ACTIVATE_PROFITABILITY_RUNTIME_CREDENTIALS_ONLY_20260927',
})

const SECRET_FLAG = /(?:password|passwd|secret|credential|access[-_]?token|id[-_]?token|database[-_]?url|uri)/i
const SAFE_VALUE = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-]{0,255}$/

class ProfitabilityRuntimeCredentialsError extends Error {
  constructor(code, metadata = {}) {
    super(code)
    this.name = 'ProfitabilityRuntimeCredentialsError'
    this.code = code
    this.cleanupIncomplete = metadata.cleanupIncomplete === true
    this.persistentChange = metadata.persistentChange === true
    this.progress = metadata.progress || null
  }
}

function fail(code, metadata = {}) {
  throw new ProfitabilityRuntimeCredentialsError(code, metadata)
}

function text(value) {
  return String(value ?? '').trim()
}

function exact(actual, expected, code) {
  if (String(actual) !== String(expected)) fail(code)
}

function parseArguments(argv = []) {
  const result = { mode: 'audit' }
  const booleanFlags = new Set(['apply', 'help'])
  const valueFlags = new Set([
    'project', 'instance', 'region', 'database', 'backup-id',
    'expected-head', 'confirmation',
  ])
  for (let index = 0; index < argv.length; index += 1) {
    const raw = String(argv[index] || '')
    if (!raw.startsWith('--')) fail('UNKNOWN_ARGUMENT')
    const separator = raw.indexOf('=')
    const name = raw.slice(2, separator === -1 ? undefined : separator)
    if (!name || SECRET_FLAG.test(name)) fail('SECRET_ARGUMENT_FORBIDDEN')
    if (booleanFlags.has(name)) {
      if (separator !== -1 || Object.hasOwn(result, name)) fail('INVALID_ARGUMENT')
      result[name] = true
      if (name === 'apply') result.mode = 'apply'
      continue
    }
    if (!valueFlags.has(name) || Object.hasOwn(result, name)) fail('UNKNOWN_ARGUMENT')
    const value = separator === -1 ? argv[++index] : raw.slice(separator + 1)
    if (value === undefined || String(value).startsWith('--')) fail('MISSING_ARGUMENT_VALUE')
    const normalized = text(value)
    if (!SAFE_VALUE.test(normalized) || /:\/\//.test(normalized)) {
      fail('INVALID_ARGUMENT_VALUE')
    }
    result[name] = normalized
  }
  return result
}

function resolveOptions(argv = []) {
  const values = parseArguments(argv)
  if (values.help) return { help: true, mode: 'audit' }
  const options = Object.freeze({
    mode: values.mode,
    project: values.project || EXPECTED.project,
    instance: values.instance || EXPECTED.instance,
    region: values.region || EXPECTED.region,
    database: values.database || EXPECTED.database,
    backupId: values['backup-id'] || EXPECTED.backupId,
    expectedHead: values['expected-head'] || '',
    confirmation: values.confirmation || '',
  })
  if (options.mode === 'apply') {
    if (!/^[0-9a-f]{40}$/.test(options.expectedHead)) fail('EXPECTED_HEAD_INVALID')
    if (options.confirmation !== EXPECTED.confirmation) fail('CONFIRMATION_MISMATCH')
  }
  return options
}

function validateEnvironmentSnapshot(snapshot, options, { applying = false } = {}) {
  exact(options?.project, EXPECTED.project, 'PROJECT_MISMATCH')
  exact(options?.instance, EXPECTED.instance, 'INSTANCE_MISMATCH')
  exact(options?.region, EXPECTED.region, 'REGION_MISMATCH')
  exact(options?.database, EXPECTED.database, 'DATABASE_MISMATCH')
  exact(options?.backupId, EXPECTED.backupId, 'BACKUP_REFERENCE_MISMATCH')
  if (!snapshot?.source || !snapshot?.cloud || !snapshot?.database
      || !snapshot?.identity || !snapshot?.secret) {
    fail('AUDIT_SNAPSHOT_INCOMPLETE')
  }
  if (applying) {
    exact(snapshot.source.head, options.expectedHead, 'HEAD_MISMATCH')
    if (snapshot.source.clean !== true) fail('DIRTY_WORKTREE')
    if (snapshot.source.remoteContainsHead !== true) fail('REMOTE_HEAD_NOT_VERIFIED')
  }
  exact(snapshot.cloud.project, EXPECTED.project, 'CLOUD_PROJECT_MISMATCH')
  exact(snapshot.cloud.instance, EXPECTED.instance, 'CLOUD_INSTANCE_MISMATCH')
  exact(snapshot.cloud.region, EXPECTED.region, 'CLOUD_REGION_MISMATCH')
  if (snapshot.cloud.state !== 'RUNNABLE') fail('CLOUD_SQL_NOT_RUNNABLE')
  if (snapshot.cloud.backup?.id !== EXPECTED.backupId
      || snapshot.cloud.backup?.status !== 'SUCCESSFUL') {
    fail('BACKUP_NOT_SUCCESSFUL')
  }
  if (snapshot.cloud.gates?.allDisabled !== true
      || Number(snapshot.cloud.gates?.allowlistCount) !== 0) {
    fail('PROFITABILITY_RUNTIME_GATES_MUST_REMAIN_OFF')
  }
  exact(snapshot.database.database, EXPECTED.database, 'DATABASE_NAME_MISMATCH')
  if (snapshot.database.pgMajor !== 17
      || snapshot.database.primary !== true
      || snapshot.database.readWrite !== true) {
    fail('DATABASE_NOT_WRITABLE_POSTGRESQL_17_PRIMARY')
  }
  const accessStatus = snapshot.database.accessProfile?.status
  const financialStatus = snapshot.database.financialModel?.status
  const foundationReadyForCredentialProbe = snapshot.database.foundationExact === true
    || snapshot.database.foundationStatus === 'verification_required'
  if (!foundationReadyForCredentialProbe
      || snapshot.database.roleGraphExact !== true
      || !['exact', 'verification_required'].includes(accessStatus)
      || !['exact', 'verification_required'].includes(financialStatus)
      || snapshot.database.runtimeCredentialRolesExact !== true) {
    fail('PROFITABILITY_SCHEMA_OR_ROLE_GRAPH_NOT_EXACT')
  }
  if (snapshot.database.runtimeCredentialVerified === true
      && snapshot.database.runtimeSchemaMarkersExact !== true) {
    fail('PROFITABILITY_RUNTIME_SCHEMA_MARKERS_NOT_EXACT')
  }
  exact(
    snapshot.identity.serviceAccount,
    EXPECTED.runtimeServiceAccount,
    'RUNTIME_SERVICE_ACCOUNT_MISMATCH',
  )
  if (snapshot.identity.exists !== true || snapshot.identity.disabled === true) {
    fail('RUNTIME_SERVICE_ACCOUNT_NOT_ACTIVE')
  }
  if (snapshot.identity.projectBroadSecretAccess === true) {
    fail('RUNTIME_SERVICE_ACCOUNT_HAS_BROAD_SECRET_ACCESS')
  }
  if (snapshot.identity.secretAccessAnalysisExact !== true) {
    fail('RUNTIME_SECRET_ACCESS_ANALYSIS_INCOMPLETE')
  }
  if (snapshot.identity.effectiveProjectSecretAccess !== 'CANNOT_ACCESS') {
    fail('RUNTIME_SERVICE_ACCOUNT_HAS_BROAD_SECRET_ACCESS')
  }
  if (snapshot.secret.exists === true && snapshot.secret.managedExact !== true) {
    fail('SECRET_CONTAINER_CONFLICT')
  }
  if (snapshot.secret.accessorExact !== true && snapshot.secret.accessorAbsent !== true) {
    fail('SECRET_ACCESS_POLICY_CONFLICT')
  }
  return snapshot
}

async function inspectEnvironment(options, deps) {
  if (!deps?.environment?.inspect) fail('ENVIRONMENT_INSPECTOR_REQUIRED')
  const snapshot = await deps.environment.inspect(options)
  return validateEnvironmentSnapshot(snapshot, options, {
    applying: options.mode === 'apply',
  })
}

function newProgress() {
  return {
    environment: 'not_started',
    secretContainer: 'not_started',
    secretVersion: 'not_started',
    databasePassword: 'not_started',
    databaseProbe: 'not_started',
    secretIam: 'not_started',
    postflight: 'not_started',
    cleanup: 'not_required',
  }
}

function safeProgress(progress) {
  return Object.freeze({ ...progress })
}

function assertNotCancelled(signal) {
  if (signal?.aborted) fail('ACTIVATION_CANCELLED')
}

function normalizeSecretMaterial(value) {
  if (!Buffer.isBuffer(value) || value.length < 32) fail('RANDOM_SECRET_POLICY_FAILED')
  const entropy = value
  const password = entropy.toString('base64url')
  if (password.length < 40 || password.includes('\0')) {
    entropy.fill(0)
    fail('RANDOM_SECRET_POLICY_FAILED')
  }
  const payload = Buffer.from(password, 'utf8')
  entropy.fill(0)
  return { payload, password }
}

async function runAudit(options, deps) {
  const snapshot = await inspectEnvironment(options, deps)
  return Object.freeze({
    ok: true,
    mode: 'audit',
    source: Object.freeze({
      head: snapshot.source.head,
      clean: snapshot.source.clean,
      remoteContainsHead: snapshot.source.remoteContainsHead,
    }),
    cloud: Object.freeze({
      project: snapshot.cloud.project,
      instance: snapshot.cloud.instance,
      region: snapshot.cloud.region,
      state: snapshot.cloud.state,
      gates: snapshot.cloud.gates,
    }),
    database: Object.freeze({
      database: snapshot.database.database,
      pgMajor: snapshot.database.pgMajor,
      foundationStatus: snapshot.database.foundationStatus,
      runtimeCredentialRolesExact: snapshot.database.runtimeCredentialRolesExact,
    }),
    secret: Object.freeze({
      id: EXPECTED.secretId,
      exists: snapshot.secret.exists,
      managedExact: snapshot.secret.managedExact,
      accessorExact: snapshot.secret.accessorExact,
      accessorAbsent: snapshot.secret.accessorAbsent,
    }),
    identity: Object.freeze({
      serviceAccount: EXPECTED.runtimeServiceAccount,
      projectBroadSecretAccess: snapshot.identity.projectBroadSecretAccess,
      effectiveProjectSecretAccess: snapshot.identity.effectiveProjectSecretAccess,
    }),
    next: 'apply_requires_explicit_confirmation',
  })
}

async function cleanupFailedActivation(state, deps, progress) {
  let complete = true
  progress.cleanup = 'running'

  if (state.secretPolicyMayHaveChanged && !state.previousSecretPolicyAccessorExact) {
    try {
      await deps.secretManager.removeRuntimeAccessor({
        mutate: true,
        containment: true,
      })
    } catch {
      complete = false
    }
  }

  if (state.secretVersionName) {
    try {
      await deps.secretManager.destroyVersion({
        versionName: state.secretVersionName,
        mutate: true,
        containment: true,
      })
    } catch {
      try {
        await deps.secretManager.disableVersion({
          versionName: state.secretVersionName,
          mutate: true,
          containment: true,
        })
      } catch {
        complete = false
      }
    }
  }

  if (state.databasePasswordMayHaveChanged) {
    let containment = null
    let passwordKnownApplied = state.databasePasswordUpdateConfirmed === true
    let passwordKnownNotApplied = false
    if (!passwordKnownApplied
        && state.passwordOperationName
        && deps.cloudSqlAdmin.settleRuntimePasswordUpdate) {
      try {
        const settlement = await deps.cloudSqlAdmin.settleRuntimePasswordUpdate({
          operationName: state.passwordOperationName,
        })
        if (settlement?.terminal === true && settlement?.succeeded === true) {
          passwordKnownApplied = true
        } else if (settlement?.terminal === true && settlement?.succeeded === false) {
          passwordKnownNotApplied = true
        }
      } catch {
        passwordKnownApplied = false
      }
    }
    try {
      if (!passwordKnownApplied && !passwordKnownNotApplied) {
        throw new Error('PASSWORD_UPDATE_NOT_SETTLED')
      }
      if (passwordKnownApplied) {
        containment = normalizeSecretMaterial(await deps.randomSecret())
        await deps.cloudSqlAdmin.updateRuntimePassword({
          password: containment.password,
          mutate: true,
          containment: true,
        })
        if (state.password) {
          const rejected = await deps.databaseAdmin.verifyPasswordRejected({
            password: state.password,
            containment: true,
          })
          if (rejected !== true) complete = false
        }
      }
    } catch {
      complete = false
    } finally {
      if (containment?.payload) containment.payload.fill(0)
      if (containment) containment.password = null
    }
  }

  try {
    const stateAfter = await deps.secretManager.inspect({ containment: true })
    if (stateAfter.accessorExact === true && state.previousSecretPolicyAccessorExact !== true) {
      complete = false
    }
  } catch {
    complete = false
  }

  progress.cleanup = complete ? 'complete_fail_closed' : 'incomplete'
  return complete
}

async function runApply(options, deps, { signal } = {}) {
  if (!deps?.secretManager || !deps?.cloudSqlAdmin || !deps?.databaseAdmin
      || typeof deps.randomSecret !== 'function'
      || typeof deps.secretManager.verifyVersionPayload !== 'function'
      || typeof deps.secretManager.removeRuntimeAccessor !== 'function') {
    fail('ACTIVATION_DEPENDENCY_MISSING')
  }
  const progress = newProgress()
  const state = {
    password: null,
    secretBytes: null,
    secretVersionName: null,
    previousSecretPolicyAccessorExact: false,
    secretPolicyMayHaveChanged: false,
    databasePasswordMayHaveChanged: false,
    databasePasswordUpdateConfirmed: false,
    passwordOperationName: null,
  }
  let persistentChange = false
  let primaryError = null
  let result = null
  try {
    await inspectEnvironment(options, deps)
    progress.environment = 'exact_gates_off'
    assertNotCancelled(signal)

    const material = normalizeSecretMaterial(await deps.randomSecret())
    state.secretBytes = material.payload
    state.password = material.password

    const container = await deps.secretManager.ensureContainer({ mutate: true })
    progress.secretContainer = container.created === true ? 'created' : 'exact'
    persistentChange = persistentChange || container.created === true
    assertNotCancelled(signal)

    const version = await deps.secretManager.addVersion({
      payload: state.secretBytes,
      mutate: true,
    })
    state.secretVersionName = version.name
    progress.secretVersion = 'created_without_runtime_access'
    persistentChange = true
    const payloadExact = await deps.secretManager.verifyVersionPayload({
      versionName: state.secretVersionName,
      expectedPayload: state.secretBytes,
    })
    if (payloadExact !== true) fail('SECRET_VERSION_PAYLOAD_MISMATCH')
    assertNotCancelled(signal)

    state.databasePasswordMayHaveChanged = true
    try {
      await deps.cloudSqlAdmin.updateRuntimePassword({
        password: state.password,
        mutate: true,
      })
      state.databasePasswordUpdateConfirmed = true
    } catch (error) {
      state.passwordOperationName = text(error?.cloudSqlOperation?.name) || null
      throw error
    }
    progress.databasePassword = 'updated'
    persistentChange = true
    assertNotCancelled(signal)

    const probe = await deps.databaseAdmin.verifyRuntimeCredential({
      password: state.password,
    })
    if (probe?.sessionRole !== EXPECTED.sessionRole
        || probe?.assumedRole !== EXPECTED.runtimeRole
        || probe?.maySetRuntimeRole !== true) {
      fail('RUNTIME_DATABASE_PROBE_FAILED')
    }
    progress.databaseProbe = 'login_and_set_role_exact'
    assertNotCancelled(signal)

    const currentSecretPolicy = await deps.secretManager.getPolicy()
    state.previousSecretPolicyAccessorExact =
      deps.secretManager.policyHasExactRuntimeAccessor(currentSecretPolicy)
    state.secretPolicyMayHaveChanged = true
    await deps.secretManager.setExactRuntimeAccessor({ mutate: true })
    progress.secretIam = 'exact_secret_only'
    assertNotCancelled(signal)

    const postflight = await deps.environment.inspect(options, {
      credentialPassword: state.password,
      expectedVersionName: state.secretVersionName,
    })
    validateEnvironmentSnapshot(postflight, options, { applying: true })
    if (postflight.secret.latestVersionName !== state.secretVersionName
        || postflight.secret.latestVersionState !== 'ENABLED'
        || postflight.secret.accessorExact !== true
        || postflight.identity.projectBroadSecretAccess === true
        || postflight.database.runtimeCredentialVerified !== true) {
      fail('RUNTIME_CREDENTIAL_POSTFLIGHT_NOT_EXACT')
    }
    progress.postflight = 'exact'
    progress.cleanup = 'not_required'
    result = Object.freeze({
      ok: true,
      mode: 'apply',
      changed: true,
      project: EXPECTED.project,
      secretId: EXPECTED.secretId,
      secretVersion: state.secretVersionName.split('/').at(-1),
      runtimeServiceAccount: EXPECTED.runtimeServiceAccount,
      databaseUser: EXPECTED.sessionRole,
      databaseRole: EXPECTED.runtimeRole,
      progress: safeProgress(progress),
    })
  } catch (error) {
    primaryError = error
    const cleanupRequired = persistentChange
      || state.secretPolicyMayHaveChanged
      || state.databasePasswordMayHaveChanged
      || Boolean(state.secretVersionName)
    const complete = cleanupRequired
      ? await cleanupFailedActivation(state, deps, progress)
      : true
    if (!(primaryError instanceof ProfitabilityRuntimeCredentialsError)) {
      primaryError = new ProfitabilityRuntimeCredentialsError(
        'RUNTIME_CREDENTIAL_ACTIVATION_FAILED',
        { cleanupIncomplete: !complete },
      )
    } else if (!complete) {
      primaryError.cleanupIncomplete = true
    }
    primaryError.persistentChange = persistentChange
    primaryError.progress = safeProgress(progress)
  } finally {
    if (state.secretBytes) state.secretBytes.fill(0)
    state.password = null
    try { await deps.close?.() } catch {
      if (!primaryError) {
        primaryError = new ProfitabilityRuntimeCredentialsError('DEPENDENCY_CLOSE_FAILED', {
          cleanupIncomplete: true,
          persistentChange,
          progress: safeProgress(progress),
        })
      } else primaryError.cleanupIncomplete = true
    }
  }
  if (primaryError) throw primaryError
  return result
}

function safeFailureReport(error) {
  const candidate = text(error?.code || error?.message)
  return Object.freeze({
    ok: false,
    error: /^[A-Z0-9_]{3,160}$/.test(candidate)
      ? candidate
      : 'RUNTIME_CREDENTIAL_ACTIVATION_FAILED',
    cleanupIncomplete: error?.cleanupIncomplete === true,
    persistentChange: error?.persistentChange === true,
    progress: safeProgress(error?.progress || newProgress()),
  })
}

module.exports = {
  EXPECTED,
  ProfitabilityRuntimeCredentialsError,
  cleanupFailedActivation,
  inspectEnvironment,
  parseArguments,
  resolveOptions,
  runApply,
  runAudit,
  safeFailureReport,
  validateEnvironmentSnapshot,
}
