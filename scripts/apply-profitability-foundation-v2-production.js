'use strict'

const {
  matchesGeneratedBootstrapUser,
} = require('./lib/profitability-foundation-production-adapters')

const EXPECTED = Object.freeze({
  project: 'iclean-room',
  instance: 'iclean-room-instance',
  region: 'europe-west3',
  database: 'iclean-room-database',
  backupId: '1790402094445',
  confirmation: 'APPLY_PROFITABILITY_DOMAIN_FOUNDATION_V2_ONLY_20260926',
  pgMajor: 17,
  extensionName: 'btree_gist',
  extensionVersion: '1.7',
  extensionSchema: 'public',
  bootstrapGrantor: 'cloudsqladmin',
  databaseOwner: 'cloudsqlsuperuser',
  schemaOwner: 'firebaseowner_iclean-room-database_public',
  provisioner: 'profitability_provisioner',
  executor: 'profitability_migration_executor',
  owner: 'profitability_owner',
  targetRoleCount: 5,
  targetRelationCount: 10,
})

const SECRET_FLAG = /(?:password|passwd|secret|credential|access[-_]?token|id[-_]?token|database[-_]?url|uri)/i
const SAFE_VALUE = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-]{0,255}$/

class ProfitabilityProductionError extends Error {
  constructor(code, metadata = {}) {
    super(code)
    this.name = 'ProfitabilityProductionError'
    this.code = code
    this.phase = metadata.phase || null
    this.cleanupIncomplete = Boolean(metadata.cleanupIncomplete)
  }
}

function fail(code, metadata) {
  throw new ProfitabilityProductionError(code, metadata)
}

function createCancellationController() {
  let requestedSignal = null
  const abortController = new AbortController()
  return Object.freeze({
    request(signal) {
      if (!requestedSignal) {
        requestedSignal = String(signal || 'INTERRUPT')
        abortController.abort()
      }
      return requestedSignal
    },
    get abortSignal() {
      return abortController.signal
    },
    get requested() {
      return requestedSignal !== null
    },
    get signal() {
      return requestedSignal
    },
    get exitCode() {
      if (requestedSignal === 'SIGINT') return 130
      if (requestedSignal === 'SIGTERM') return 143
      return requestedSignal ? 1 : 0
    },
    throwIfRequested() {
      if (requestedSignal) fail('PRODUCTION_APPLY_INTERRUPTED')
    },
  })
}

function installTerminationGuard(controller, processObject = process) {
  if (!controller?.request || !processObject?.on || !processObject?.off) {
    fail('TERMINATION_GUARD_DEPENDENCY_MISSING')
  }
  const onSigint = () => controller.request('SIGINT')
  const onSigterm = () => controller.request('SIGTERM')
  // Keep both handlers installed throughout cleanup. Repeated signals are
  // intentionally absorbed so Node cannot bypass the asynchronous `finally`.
  processObject.on('SIGINT', onSigint)
  processObject.on('SIGTERM', onSigterm)
  return () => {
    processObject.off('SIGINT', onSigint)
    processObject.off('SIGTERM', onSigterm)
  }
}

function parseArguments(argv = []) {
  const result = { mode: 'audit' }
  const booleanFlags = new Set(['apply', 'help'])
  const valueFlags = new Set([
    'project',
    'instance',
    'region',
    'database',
    'backup-id',
    'expected-head',
    'confirmation',
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
    const normalized = String(value).trim()
    if (!SAFE_VALUE.test(normalized) || /:\/\//.test(normalized)) fail('INVALID_ARGUMENT_VALUE')
    result[name] = normalized
  }
  return result
}

function resolveOptions(argv = []) {
  const values = parseArguments(argv)
  if (values.help) return { help: true, mode: 'audit' }
  const options = {
    mode: values.mode,
    project: values.project || EXPECTED.project,
    instance: values.instance || EXPECTED.instance,
    region: values.region || EXPECTED.region,
    database: values.database || EXPECTED.database,
    backupId: values['backup-id'] || EXPECTED.backupId,
    expectedHead: values['expected-head'] || '',
    confirmation: values.confirmation || '',
  }
  if (options.mode === 'apply') {
    for (const field of ['project', 'instance', 'region', 'database', 'backupId', 'expectedHead', 'confirmation']) {
      if (!options[field]) fail('APPLY_GUARD_REQUIRED')
    }
  }
  return options
}

function exact(value, expected, code) {
  if (String(value) !== String(expected)) fail(code)
}

function validateAuditSnapshot(snapshot, options, { applying = false } = {}) {
  if (!snapshot || typeof snapshot !== 'object') fail('AUDIT_SNAPSHOT_REQUIRED')
  const { source, cloud, database } = snapshot
  if (!source || !cloud || !database) fail('AUDIT_SNAPSHOT_INCOMPLETE')
  exact(source.head, options.expectedHead || source.head, 'HEAD_MISMATCH')
  if (applying && source.clean !== true) fail('DIRTY_WORKTREE')
  if (applying && source.remoteContainsHead !== true) fail('REMOTE_HEAD_NOT_VERIFIED')
  exact(cloud.project, EXPECTED.project, 'PROJECT_MISMATCH')
  exact(cloud.instance, EXPECTED.instance, 'INSTANCE_MISMATCH')
  exact(cloud.region, EXPECTED.region, 'REGION_MISMATCH')
  exact(database.database, EXPECTED.database, 'DATABASE_MISMATCH')
  exact(String(options.backupId), EXPECTED.backupId, 'BACKUP_REFERENCE_MISMATCH')
  if (cloud.backup?.id !== EXPECTED.backupId || cloud.backup?.status !== 'SUCCESSFUL') {
    fail('BACKUP_NOT_SUCCESSFUL')
  }
  if (cloud.state !== 'RUNNABLE' || database.primary !== true || database.readWrite !== true) {
    fail('DATABASE_NOT_WRITABLE_PRIMARY')
  }
  exact(database.pgMajor, EXPECTED.pgMajor, 'POSTGRES_MAJOR_MISMATCH')
  exact(database.bootstrapGrantor, EXPECTED.bootstrapGrantor, 'BOOTSTRAP_GRANTOR_MISMATCH')
  exact(database.databaseOwner, EXPECTED.databaseOwner, 'DATABASE_OWNER_MISMATCH')
  exact(database.schemaOwner, EXPECTED.schemaOwner, 'SCHEMA_OWNER_MISMATCH')
  const extension = database.extension || {}
  exact(extension.name, EXPECTED.extensionName, 'EXTENSION_NAME_MISMATCH')
  exact(extension.version, EXPECTED.extensionVersion, 'EXTENSION_VERSION_MISMATCH')
  exact(extension.schema, EXPECTED.extensionSchema, 'EXTENSION_SCHEMA_MISMATCH')
  if (cloud.pgAuthidSelectRoleEnabled === true) fail('PG_AUTHID_FLAG_MUST_BE_OFF')
  if (database.featureEnabled !== false || Number(database.allowlistCount) !== 0) {
    fail('FEATURE_MUST_REMAIN_OFF')
  }
  if (applying && (Number(database.targetRoleCount) !== 0 || Number(database.targetRelationCount) !== 0)) {
    fail('FRESH_INSTALL_REQUIRED')
  }
  return snapshot
}

async function runAudit(options, deps) {
  if (!deps?.sourceControl?.inspect || !deps?.cloudSqlAdmin?.inspect || !deps?.databaseAdmin?.audit) {
    fail('AUDIT_DEPENDENCY_MISSING')
  }
  const [source, cloud, database] = await Promise.all([
    deps.sourceControl.inspect(options),
    deps.cloudSqlAdmin.inspect(options),
    deps.databaseAdmin.audit(options),
  ])
  return validateAuditSnapshot({ source, cloud, database }, options)
}

function userMatches(user, name) {
  return matchesGeneratedBootstrapUser(user, name)
}

async function reconcileBootstrapCreate(cloudSqlAdmin, bootstrapName) {
  let users
  try {
    users = await cloudSqlAdmin.listUsers()
  } catch {
    fail('BOOTSTRAP_CREATE_STATE_UNKNOWN')
  }
  const matches = (users || []).filter((user) => user?.name === bootstrapName)
  if (matches.length === 0) return 'absent'
  if (matches.length === 1 && userMatches(matches[0], bootstrapName)) return 'present'
  fail('BOOTSTRAP_CREATE_STATE_UNKNOWN')
}

async function reconcileBootstrapDelete(cloudSqlAdmin, bootstrapName) {
  let users
  try {
    // Cleanup must not inherit an already-aborted top-level signal.  The cloud
    // adapter still applies a fresh, bounded timeout to this containment read.
    users = await cloudSqlAdmin.listUsers({ containment: true })
  } catch {
    fail('BOOTSTRAP_DELETE_STATE_UNKNOWN')
  }
  const matches = (users || []).filter((user) => user?.name === bootstrapName)
  if (matches.length === 0) return 'absent'
  if (matches.length === 1 && userMatches(matches[0], bootstrapName)) return 'present'
  fail('BOOTSTRAP_DELETE_STATE_UNKNOWN')
}

function classifyRolesOutcome(state) {
  if (!state || typeof state !== 'object') return 'unknown'
  if (state.exact === true && state.roleCount === 6 && state.membershipCount === 8) return 'complete'
  if (Number(state.roleCount) === 0 && Number(state.membershipCount) === 0) return 'absent'
  return 'partial'
}

function classifyMigrationOutcome(state) {
  if (!state || typeof state !== 'object') return 'unknown'
  if (state.exact === true && state.relationCount === EXPECTED.targetRelationCount && state.rowCount === 0) return 'complete'
  if (Number(state.relationCount) === 0) return 'absent'
  return 'partial'
}

function classifySourceReferenceOutcome(state) {
  if (!state || typeof state !== 'object') return 'unknown'
  if (state.exact === true && Number(state.columnAclCount) === 9
      && Number(state.tableAclCount) === 0) return 'complete'
  if (state.absent === true && Number(state.columnAclCount) === 0
      && Number(state.tableAclCount) === 0) return 'absent'
  return 'partial'
}

async function safeClose(resource) {
  if (!resource?.close) return true
  try {
    await resource.close()
    return true
  } catch {
    return false
  }
}

async function containCredentials(state, deps) {
  let complete = true
  if (state.executorMayHaveCredential) {
    let lockFailed = false
    try {
      await state.provisionerSession?.lockExecutor?.({ mutate: true })
    } catch {
      lockFailed = true
    }
    try {
      const credentialRejected = await deps.databaseAdmin.verifyPasswordNull(EXPECTED.executor)
      if (credentialRejected !== true) complete = false
    } catch {
      complete = false
    }
    // A failed lock is safe only when an independent fresh-login probe proves
    // that the one-time credential cannot authenticate (including role absence).
    if (lockFailed && complete !== true) complete = false
  }
  if (state.provisionerMayHaveCredential) {
    let lockFailed = false
    try {
      if (state.provisionerSession?.lockSelf) {
        await state.provisionerSession.lockSelf({ mutate: true })
      } else if (state.bootstrapSession?.lockProvisioner) {
        await state.bootstrapSession.lockProvisioner({ mutate: true })
      } else {
        throw new Error('PROVISIONER_CONTAINMENT_CHANNEL_MISSING')
      }
    } catch {
      lockFailed = true
    }
    try {
      const credentialRejected = await deps.databaseAdmin.verifyPasswordNull(EXPECTED.provisioner)
      if (credentialRejected !== true) complete = false
    } catch {
      complete = false
    }
    if (lockFailed && complete !== true) complete = false
  }
  if (!(await safeClose(state.bootstrapSession))) complete = false
  state.bootstrapSession = null
  if (state.bootstrapMayExist) {
    let createTerminal = state.bootstrapCreateSettled === true
    try {
      if (!createTerminal) {
        const settlement = await deps.cloudSqlAdmin.settleBootstrapCreate?.({
          name: state.bootstrapName,
          operationName: state.bootstrapCreateOperationName,
        })
        createTerminal = settlement?.terminal === true
          && (settlement.succeeded !== true || settlement.effectConfirmed === true)
      }
      if (!createTerminal) {
        // Absence while CREATE is still pending/unknown is not proof of cleanup:
        // the control-plane operation can materialize the user after we return.
        complete = false
        // Still make a best-effort deletion when the user is already visible,
        // but never treat that as containment while CREATE can finish later.
        if (await reconcileBootstrapDelete(deps.cloudSqlAdmin, state.bootstrapName) === 'present') {
          await deps.cloudSqlAdmin.deleteBootstrap({ name: state.bootstrapName, mutate: true })
        }
      } else {
        const before = await reconcileBootstrapDelete(deps.cloudSqlAdmin, state.bootstrapName)
        if (before === 'present') {
          await deps.cloudSqlAdmin.deleteBootstrap({ name: state.bootstrapName, mutate: true })
        }
        if (await reconcileBootstrapDelete(deps.cloudSqlAdmin, state.bootstrapName) !== 'absent') complete = false
        if (await deps.databaseAdmin.verifyBootstrapAbsent(state.bootstrapName) !== true) complete = false
      }
    } catch {
      complete = false
    }
  }
  if (!(await safeClose(state.provisionerSession))) complete = false
  state.provisionerSession = null
  for (const secret of state.secretBuffers) {
    if (Buffer.isBuffer(secret)) secret.fill(0)
  }
  return complete
}

async function assertSourceStillExact(options, deps) {
  const source = await deps.sourceControl.inspect()
  exact(source.head, options.expectedHead, 'HEAD_CHANGED_DURING_APPLY')
  if (source.clean !== true) fail('WORKTREE_CHANGED_DURING_APPLY')
  if (source.remoteContainsHead !== true) fail('REMOTE_CHANGED_DURING_APPLY')
  return source
}

async function runIndependentPostflight(deps, {
  executorPassword,
  expectExecutorLocked = true,
} = {}) {
  const result = await deps.databaseAdmin.postflight({ executorPassword })
  if (classifyRolesOutcome(result.roles) !== 'complete') fail('ROLE_POSTFLIGHT_FAILED')
  if (classifyMigrationOutcome(result.migration) !== 'complete') fail('MIGRATION_POSTFLIGHT_FAILED')
  if (classifySourceReferenceOutcome(result.sourceReferences) !== 'complete') {
    fail('SOURCE_REFERENCE_POSTFLIGHT_FAILED')
  }
  if (result.bootstrapAbsent !== true
      || result.provisionerPasswordNull !== true
      || result.provisionerFreshLoginRejected !== true
      || result.featureEnabled !== false
      || Number(result.allowlistCount) !== 0) {
    fail('FINAL_POSTFLIGHT_FAILED')
  }
  if (expectExecutorLocked
      && (result.executorPasswordNull !== true
        || result.executorFreshLoginRejected !== true)) {
    fail('FINAL_POSTFLIGHT_FAILED')
  }
  return result
}

async function reconcileRolesExecution(deps) {
  const outcome = classifyRolesOutcome(await deps.databaseAdmin.inspectRoles())
  if (outcome === 'complete') return outcome
  if (outcome === 'absent') fail('ROLE_PROVISION_FAILED_WITHOUT_CHANGE')
  fail('ROLE_PROVISION_STATE_REQUIRES_REVIEW')
}

async function reconcileMigrationExecution(deps, { executorPassword } = {}) {
  const outcome = classifyMigrationOutcome(
    await deps.databaseAdmin.inspectMigration({ executorPassword }),
  )
  if (outcome === 'complete') return outcome
  if (outcome === 'absent') fail('MIGRATION_FAILED_WITHOUT_CHANGE')
  fail('MIGRATION_STATE_REQUIRES_REVIEW')
}

async function reconcileSourceReferenceExecution(deps) {
  const outcome = classifySourceReferenceOutcome(
    await deps.databaseAdmin.inspectOwnerSourceReferences({
      role: EXPECTED.owner,
      expectedOwner: EXPECTED.schemaOwner,
    }),
  )
  if (outcome === 'complete') return outcome
  if (outcome === 'absent') fail('SOURCE_REFERENCE_GRANT_FAILED_WITHOUT_CHANGE')
  fail('SOURCE_REFERENCE_STATE_REQUIRES_REVIEW')
}

function randomBuffer(deps) {
  const value = deps.randomSecret()
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8')
  if (buffer.length < 24) fail('GENERATED_SECRET_TOO_SHORT')
  return buffer
}

async function runApply(options, deps, { cancellation } = {}) {
  exact(options.project, EXPECTED.project, 'PROJECT_MISMATCH')
  exact(options.instance, EXPECTED.instance, 'INSTANCE_MISMATCH')
  exact(options.region, EXPECTED.region, 'REGION_MISMATCH')
  exact(options.database, EXPECTED.database, 'DATABASE_MISMATCH')
  exact(options.backupId, EXPECTED.backupId, 'BACKUP_REFERENCE_MISMATCH')
  exact(options.confirmation, EXPECTED.confirmation, 'CONFIRMATION_MISMATCH')
  if (!/^[0-9a-f]{40}$/.test(options.expectedHead)) fail('EXPECTED_HEAD_INVALID')
  if (!deps?.randomSecret || !deps?.cloudSqlAdmin || !deps?.databaseAdmin
      || typeof deps.databaseAdmin.grantOwnerSourceReferences !== 'function'
      || typeof deps.databaseAdmin.inspectOwnerSourceReferences !== 'function'
      || typeof deps?.psqlRunner?.prepare !== 'function'
      || typeof deps?.psqlRunner?.runRoles !== 'function'
      || typeof deps?.psqlRunner?.runMigration !== 'function'
      || typeof deps?.psqlRunner?.close !== 'function') {
    fail('APPLY_DEPENDENCY_MISSING')
  }

  const snapshot = await runAudit(options, deps)
  validateAuditSnapshot(snapshot, options, { applying: true })
  cancellation?.throwIfRequested?.()

  const state = {
    bootstrapName: `profitability_bootstrap_${(deps.now?.() ?? Date.now()).toString(36)}`,
    bootstrapMayExist: false,
    bootstrapCreateOperationName: null,
    bootstrapCreateSettled: false,
    bootstrapSession: null,
    provisionerSession: null,
    provisionerMayHaveCredential: false,
    executorMayHaveCredential: false,
    secretBuffers: [],
  }
  let succeeded = false
  let primaryError = null
  try {
    await deps.psqlRunner.prepare()
    cancellation?.throwIfRequested?.()

    const bootstrapPassword = randomBuffer(deps)
    const provisionerPassword = randomBuffer(deps)
    const executorPassword = randomBuffer(deps)
    state.secretBuffers.push(bootstrapPassword, provisionerPassword, executorPassword)

    state.bootstrapMayExist = true
    try {
      const creation = await deps.cloudSqlAdmin.createBootstrap({
        name: state.bootstrapName,
        password: bootstrapPassword,
        mutate: true,
      })
      state.bootstrapCreateOperationName = creation?.operation?.name || null
      // A successful adapter return guarantees terminal operation + observed user.
      state.bootstrapCreateSettled = true
    } catch (error) {
      state.bootstrapCreateOperationName = error?.cloudSqlOperation?.name || null
      state.bootstrapCreateSettled = error?.cloudSqlOperation?.status === 'DONE'
      throw error
    }
    if (await reconcileBootstrapCreate(deps.cloudSqlAdmin, state.bootstrapName) !== 'present') {
      fail('BOOTSTRAP_CREATE_NOT_CONFIRMED')
    }
    cancellation?.throwIfRequested?.()

    state.bootstrapSession = await deps.databaseAdmin.openBootstrap({
      name: state.bootstrapName,
      password: bootstrapPassword,
    })
    cancellation?.throwIfRequested?.()
    // Mark the credential as potentially live before the mutating call. If the
    // server commits but the acknowledgement is lost, cleanup must still lock it.
    state.provisionerMayHaveCredential = true
    await state.bootstrapSession.createRestrictedProvisioner({
      name: EXPECTED.provisioner,
      password: provisionerPassword,
      mutate: true,
    })
    cancellation?.throwIfRequested?.()
    await state.bootstrapSession.grantDatabaseConnectOption({
      database: EXPECTED.database,
      role: EXPECTED.provisioner,
      mutate: true,
    })
    cancellation?.throwIfRequested?.()
    await deps.databaseAdmin.grantSchemaOptionsAsIamOwner({
      role: EXPECTED.provisioner,
      schema: EXPECTED.extensionSchema,
      expectedOwner: EXPECTED.schemaOwner,
      mutate: true,
    })
    cancellation?.throwIfRequested?.()
    await deps.databaseAdmin.verifyProvisionerHandoff()
    cancellation?.throwIfRequested?.()
    state.provisionerSession = await deps.databaseAdmin.openProvisioner({
      name: EXPECTED.provisioner,
      password: provisionerPassword,
    })
    cancellation?.throwIfRequested?.()

    if (!(await safeClose(state.bootstrapSession))) fail('BOOTSTRAP_SESSION_CLOSE_FAILED')
    state.bootstrapSession = null
    await deps.cloudSqlAdmin.deleteBootstrap({ name: state.bootstrapName, mutate: true })
    if (await reconcileBootstrapDelete(deps.cloudSqlAdmin, state.bootstrapName) !== 'absent'
        || await deps.databaseAdmin.verifyBootstrapAbsent(state.bootstrapName) !== true) {
      fail('BOOTSTRAP_DELETE_NOT_CONFIRMED')
    }
    state.bootstrapMayExist = false
    cancellation?.throwIfRequested?.()

    await assertSourceStillExact(options, deps)
    cancellation?.throwIfRequested?.()
    try {
      await deps.psqlRunner.runRoles({ password: provisionerPassword, options })
    } catch {
      // A lost client response around COMMIT is reconciled from the catalog;
      // the mutating psql command is never retried automatically.
    }
    await reconcileRolesExecution(deps)
    cancellation?.throwIfRequested?.()
    if (await deps.databaseAdmin.verifyPasswordNull(EXPECTED.provisioner) !== true) {
      fail('PROVISIONER_PASSWORD_NOT_NULL')
    }
    state.provisionerMayHaveCredential = false

    await assertSourceStillExact(options, deps)
    cancellation?.throwIfRequested?.()
    try {
      await deps.databaseAdmin.grantOwnerSourceReferences({
        role: EXPECTED.owner,
        expectedOwner: EXPECTED.schemaOwner,
        mutate: true,
      })
    } catch {
      // A lost commit acknowledgement is reconciled from the exact column ACL.
    }
    await reconcileSourceReferenceExecution(deps)
    cancellation?.throwIfRequested?.()

    // The same ambiguous-commit rule applies to the executor credential.
    state.executorMayHaveCredential = true
    await state.provisionerSession.activateExecutor({
      name: EXPECTED.executor,
      password: executorPassword,
      mutate: true,
    })
    cancellation?.throwIfRequested?.()
    await assertSourceStillExact(options, deps)
    cancellation?.throwIfRequested?.()
    try {
      await deps.psqlRunner.runMigration({ password: executorPassword, options })
    } catch {
      // The exact Foundation fingerprint is authoritative after an ambiguous
      // psql outcome; never replay a migration merely because stdout was lost.
    }
    await reconcileMigrationExecution(deps, { executorPassword })
    cancellation?.throwIfRequested?.()
    const catalogPostflight = await runIndependentPostflight(deps, {
      executorPassword,
      expectExecutorLocked: false,
    })
    cancellation?.throwIfRequested?.()
    await state.provisionerSession.lockExecutor({ mutate: true })
    // Keep containment armed until a separate fresh-login probe proves that
    // the one-time executor credential can no longer authenticate.  Clearing
    // this flag immediately after ALTER ROLE would make a lost/ineffective
    // lock acknowledgement skip the retry in `finally`.
    let executorCredentialRejected = false
    try {
      executorCredentialRejected = await deps.databaseAdmin.verifyPasswordNull(EXPECTED.executor)
    } catch {
      // Normalize adapter/probe failures to the same fail-closed public error.
      // `executorMayHaveCredential` deliberately remains true so `finally`
      // performs an independent lock + verification attempt.
    }
    if (executorCredentialRejected !== true) {
      fail('EXECUTOR_PASSWORD_NOT_NULL')
    }
    state.executorMayHaveCredential = false
    if (!(await safeClose(state.provisionerSession))) fail('PROVISIONER_SESSION_CLOSE_FAILED')
    state.provisionerSession = null
    cancellation?.throwIfRequested?.()

    cancellation?.throwIfRequested?.()
    succeeded = true
    return {
      ok: true,
      mode: 'apply',
      postflight: Object.freeze({
        ...catalogPostflight,
        executorPasswordNull: true,
        executorFreshLoginRejected: true,
      }),
    }
  } catch (error) {
    primaryError = error instanceof ProfitabilityProductionError
      ? error
      : new ProfitabilityProductionError('PRODUCTION_APPLY_FAILED')
    throw primaryError
  } finally {
    let credentialCleanupComplete = false
    try {
      credentialCleanupComplete = await containCredentials(state, deps)
    } catch {
      credentialCleanupComplete = false
    }
    const proxyCleanupComplete = await safeClose(deps.psqlRunner)
    const cleanupComplete = credentialCleanupComplete && proxyCleanupComplete
    if (!cleanupComplete && !succeeded && primaryError) primaryError.cleanupIncomplete = true
    if (!cleanupComplete && succeeded) fail('CLEANUP_INCOMPLETE', { cleanupIncomplete: true })
  }
}

function safeFailureReport(error) {
  const failure = error instanceof ProfitabilityProductionError
    ? error
    : new ProfitabilityProductionError('PRODUCTION_RUNNER_FAILED')
  return {
    ok: false,
    error: failure.code,
    cleanupIncomplete: Boolean(failure.cleanupIncomplete),
  }
}

function safeAuditReport(snapshot) {
  return {
    ok: true,
    mode: 'audit',
    head: snapshot.source.head,
    clean: snapshot.source.clean === true,
    instanceState: snapshot.cloud.state,
    backupStatus: snapshot.cloud.backup?.status || 'UNKNOWN',
    pgMajor: snapshot.database.pgMajor,
    roleCount: Number(snapshot.database.targetRoleCount),
    relationCount: Number(snapshot.database.targetRelationCount),
    featureEnabled: snapshot.database.featureEnabled === true,
    allowlistCount: Number(snapshot.database.allowlistCount),
  }
}

function usage() {
  return [
    'Profitability Foundation V2 production runner.',
    'Default mode is read-only audit.',
    'Mutation requires --apply plus project, instance, region, database, backup-id, expected-head and confirmation.',
    'Passwords, tokens, URIs and other credentials are never accepted as arguments.',
  ].join('\n')
}

async function main({
  argv = process.argv.slice(2),
  deps,
  stdout = process.stdout,
  stderr = process.stderr,
  cancellation,
} = {}) {
  let exitCode = 0
  try {
    const options = resolveOptions(argv)
    if (options.help) {
      stdout.write(`${usage()}\n`)
    } else {
      const result = options.mode === 'apply'
        ? await runApply(options, deps, { cancellation })
        : safeAuditReport(await runAudit(options, deps))
      stdout.write(`${JSON.stringify(result)}\n`)
    }
  } catch (error) {
    stderr.write(`${JSON.stringify(safeFailureReport(error))}\n`)
    exitCode = 1
  }
  try {
    await deps?.close?.()
  } catch {
    if (exitCode === 0) {
      stderr.write(`${JSON.stringify(safeFailureReport(
        new ProfitabilityProductionError('PRODUCTION_DEPENDENCY_CLOSE_FAILED'),
      ))}\n`)
      exitCode = 1
    }
  }
  return exitCode
}

if (require.main === module) {
  // Real adapters are deliberately required only at execution time so unit
  // tests cannot accidentally open a cloud connection.
  const { createProductionDependencies } = require('./lib/profitability-foundation-production-adapters')
  const cancellation = createCancellationController()
  const removeTerminationGuard = installTerminationGuard(cancellation)
  main({
    deps: createProductionDependencies({ signal: cancellation.abortSignal }),
    cancellation,
  }).then((exitCode) => {
    process.exitCode = cancellation.requested ? cancellation.exitCode : exitCode
  }).finally(() => {
    removeTerminationGuard()
  })
}

module.exports = {
  EXPECTED,
  ProfitabilityProductionError,
  classifyMigrationOutcome,
  classifyRolesOutcome,
  classifySourceReferenceOutcome,
  containCredentials,
  createCancellationController,
  installTerminationGuard,
  main,
  parseArguments,
  reconcileBootstrapCreate,
  reconcileBootstrapDelete,
  reconcileMigrationExecution,
  reconcileRolesExecution,
  reconcileSourceReferenceExecution,
  resolveOptions,
  runApply,
  runAudit,
  runIndependentPostflight,
  safeFailureReport,
  validateAuditSnapshot,
}
