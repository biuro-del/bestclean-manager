'use strict'

const EXPECTED = Object.freeze({
  project: 'iclean-room',
  instance: 'iclean-room-instance',
  region: 'europe-west3',
  database: 'iclean-room-database',
  backupId: '1790505049269',
  confirmation: 'APPLY_PROFITABILITY_ACCESS_AND_FINANCIAL_V21_ONLY_20260927',
  provisioner: 'profitability_provisioner',
  executor: 'profitability_migration_executor',
  runtimeRegion: 'europe-west4',
  runtimeService: 'cleanzi-01',
  iamDatabaseUser: 'biuro@bestclean.pl',
  remote: 'cleanzi01',
  remoteUrl: 'https://github.com/biuro-del/Cleanzi-01.git',
})

const SAFE_COMPLETED_STAGES = Object.freeze(new Set([
  'foundation_postflight_verified',
  'source_references_granted',
  'provisioner_activated',
  'executor_activated',
  'access_profile_applied',
  'financial_model_applied',
  'migration_postflight_verified',
  'credentials_contained',
]))

const SECRET_FLAG = /(?:password|passwd|secret|credential|access[-_]?token|id[-_]?token|database[-_]?url|uri)/i
const SAFE_VALUE = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-]{0,255}$/

class ProfitabilityAccessV21ProductionError extends Error {
  constructor(code, metadata = {}) {
    super(code)
    this.name = 'ProfitabilityAccessV21ProductionError'
    this.code = code
    this.cleanupIncomplete = metadata.cleanupIncomplete === true
    this.changed = metadata.changed === true
    this.completedStages = Array.isArray(metadata.completedStages)
      ? metadata.completedStages.filter((stage) => SAFE_COMPLETED_STAGES.has(stage))
      : []
    this.manualReviewRequired = metadata.manualReviewRequired === true
    this.reauditRequired = metadata.reauditRequired === true
  }
}

function fail(code, metadata) {
  throw new ProfitabilityAccessV21ProductionError(code, metadata)
}

function annotateFailure(error, metadata = {}) {
  if (!error || typeof error !== 'object') return error
  const completedStages = [...new Set(metadata.completedStages || [])]
    .filter((stage) => SAFE_COMPLETED_STAGES.has(stage))
  error.changed = metadata.changed === true
  error.completedStages = completedStages
  if (metadata.cleanupIncomplete === true) error.cleanupIncomplete = true
  const partialSuccess = error.changed
    || completedStages.length > 0
    || error.cleanupIncomplete === true
  error.manualReviewRequired = partialSuccess
  error.reauditRequired = partialSuccess
  return error
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
    for (const field of [
      'project', 'instance', 'region', 'database', 'backupId',
      'expectedHead', 'confirmation',
    ]) {
      if (!options[field]) fail('APPLY_GUARD_REQUIRED')
    }
  }
  return options
}

function exact(value, expected, code) {
  if (String(value) !== String(expected)) fail(code)
}

function validateTargetState(state, name) {
  if (!state || !['absent', 'exact', 'verification_required'].includes(state.status)) {
    fail(`${name}_STATE_REQUIRES_REVIEW`)
  }
  if (state.status === 'exact' && Number(state.seedRowCount) !== 0) {
    fail(`${name}_SEED_ROWS_PRESENT`)
  }
}

function validateSnapshot(
  snapshot,
  options,
  { applying = false, foundationMustBeExact = false } = {},
) {
  if (!snapshot?.source || !snapshot?.cloud || !snapshot?.database) {
    fail('AUDIT_SNAPSHOT_INCOMPLETE')
  }
  const { source, cloud, database } = snapshot
  exact(source.head, options.expectedHead || source.head, 'HEAD_MISMATCH')
  exact(source.remote, EXPECTED.remote, 'GIT_REMOTE_MISMATCH')
  exact(source.remoteUrl, EXPECTED.remoteUrl, 'GIT_REMOTE_URL_MISMATCH')
  if (applying && source.clean !== true) fail('DIRTY_WORKTREE')
  if (applying && source.remoteContainsHead !== true) fail('REMOTE_HEAD_NOT_VERIFIED')
  exact(cloud.project, EXPECTED.project, 'PROJECT_MISMATCH')
  exact(cloud.instance, EXPECTED.instance, 'INSTANCE_MISMATCH')
  exact(cloud.region, EXPECTED.region, 'REGION_MISMATCH')
  exact(cloud.runtimeRegion, EXPECTED.runtimeRegion, 'RUNTIME_REGION_MISMATCH')
  exact(cloud.runtimeService, EXPECTED.runtimeService, 'RUNTIME_SERVICE_MISMATCH')
  if (cloud.state !== 'RUNNABLE') fail('CLOUD_SQL_NOT_RUNNABLE')
  if (String(cloud.backup?.id) !== EXPECTED.backupId
      || cloud.backup?.status !== 'SUCCESSFUL') {
    fail('BACKUP_NOT_SUCCESSFUL')
  }
  if (cloud.gates?.allDisabled !== true || Number(cloud.gates?.allowlistCount) !== 0) {
    fail('PROFITABILITY_GATES_MUST_REMAIN_OFF')
  }
  exact(database.database, EXPECTED.database, 'DATABASE_MISMATCH')
  exact(database.iamDatabaseUser, EXPECTED.iamDatabaseUser, 'IAM_DATABASE_USER_MISMATCH')
  if (database.pgMajor !== 17 || database.primary !== true || database.readWrite !== true) {
    fail('DATABASE_NOT_WRITABLE_PG17_PRIMARY')
  }
  const foundationStatus = database.foundationStatus
    || (database.foundationExact === true ? 'exact' : 'partial')
  if (!['exact', 'verification_required'].includes(foundationStatus)
      || database.roleGraphExact !== true) {
    fail('FOUNDATION_STATE_INVALID')
  }
  if (foundationMustBeExact
      && (foundationStatus !== 'exact' || database.foundationExact !== true)) {
    fail('FOUNDATION_POSTFLIGHT_NOT_EXACT')
  }
  if (!['repairable', 'exact'].includes(database.accessSourceReferences?.status)) {
    fail('ACCESS_SOURCE_REFERENCES_REQUIRES_REVIEW')
  }
  validateTargetState(database.accessProfile, 'ACCESS_PROFILE_V2')
  validateTargetState(database.financialModel, 'FINANCIAL_MODEL_V21')
  if (database.financialModel.status !== 'absent'
      && database.accessProfile.status === 'absent') {
    fail('FINANCIAL_MODEL_WITHOUT_ACCESS_PROFILE')
  }
  return snapshot
}

async function runAudit(options, deps, { executorPassword } = {}) {
  if (!deps?.sourceControl?.inspect || !deps?.cloudSqlAdmin?.inspect
      || !deps?.databaseAdmin?.audit) {
    fail('AUDIT_DEPENDENCY_MISSING')
  }
  const [source, cloud, database] = await Promise.all([
    deps.sourceControl.inspect(options),
    deps.cloudSqlAdmin.inspect(options),
    deps.databaseAdmin.audit({ ...options, executorPassword }),
  ])
  return validateSnapshot({ source, cloud, database }, options)
}

async function assertMutationGuards(
  options,
  deps,
  { allowRepairableReferences = false } = {},
) {
  const snapshot = await runAudit(options, deps)
  validateSnapshot(snapshot, options, { applying: true })
  if (!allowRepairableReferences
      && snapshot.database.accessSourceReferences.status !== 'exact') {
    fail('ACCESS_SOURCE_REFERENCES_NOT_EXACT')
  }
  return snapshot
}

function randomBuffer(deps) {
  const value = deps.randomSecret()
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8')
  if (buffer.length < 24) fail('GENERATED_SECRET_TOO_SHORT')
  return buffer
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

async function verifyCredentialRejected(deps, role, password) {
  try {
    return await deps.databaseAdmin.verifyPasswordRejected({
      role,
      password,
      containment: true,
    }) === true
  } catch {
    return false
  }
}

async function containCredentials(state, deps) {
  let complete = true
  let session = state.provisionerSession

  // Ordinary clients are tied to the top-level cancellation signal. Cleanup
  // deliberately closes them and acquires a fresh, independently bounded
  // containment session so SIGINT/SIGTERM cannot strand a generated password.
  if (state.executorMayHaveCredential || state.provisionerMayHaveCredential) {
    if (session && !(await safeClose(session))) complete = false
    state.provisionerSession = null
    session = null
    try {
      session = await deps.databaseAdmin.openProvisioner({
        password: state.provisionerPassword,
        containment: true,
      })
      state.provisionerSession = session
    } catch {
      session = null
    }
  }

  if (state.executorMayHaveCredential) {
    try {
      if (session?.lockExecutor) await session.lockExecutor({ mutate: true })
    } catch {}
    // ALTER ROLE can commit even when its response is lost.  The strict 28P01
    // probe is the independent containment proof for the exact generated key.
    if (!(await verifyCredentialRejected(
      deps,
      EXPECTED.executor,
      state.executorPassword,
    ))) complete = false
  }

  if (state.provisionerMayHaveCredential) {
    try {
      if (session?.lockSelf) {
        await session.lockSelf({ mutate: true })
      }
    } catch {}
    if (!(await verifyCredentialRejected(
      deps,
      EXPECTED.provisioner,
      state.provisionerPassword,
    ))) complete = false
  }

  if (!(await safeClose(state.provisionerSession))) complete = false
  state.provisionerSession = null
  if (state.provisionerActivationUnsettled) complete = false

  for (const secret of state.secretBuffers) {
    if (Buffer.isBuffer(secret)) secret.fill(0)
  }
  return complete
}

function assertNotCancelled(cancellation) {
  if (cancellation?.signal?.aborted) fail('APPLY_CANCELLED')
}

async function activateProvisioner(state, options, deps, cancellation) {
  state.provisionerMayHaveCredential = true
  await assertMutationGuards(options, deps, { allowRepairableReferences: true })
  assertNotCancelled(cancellation)

  let activationError = null
  let settlement = null
  try {
    await deps.cloudSqlAdmin.activateProvisioner({
      password: state.provisionerPassword,
      mutate: true,
    })
  } catch (error) {
    activationError = error
    const operationName = error?.cloudSqlOperation?.name
    if (operationName) {
      settlement = await deps.cloudSqlAdmin.settleProvisionerActivation({ operationName })
      if (settlement?.terminal !== true) {
        state.provisionerActivationUnsettled = true
        fail('PROVISIONER_ACTIVATION_NOT_TERMINAL', { cleanupIncomplete: true })
      }
      if (settlement.succeeded !== true) {
        if (await verifyCredentialRejected(
          deps,
          EXPECTED.provisioner,
          state.provisionerPassword,
        )) {
          state.provisionerMayHaveCredential = false
          fail('PROVISIONER_ACTIVATION_FAILED')
        }
        fail('PROVISIONER_ACTIVATION_FAILED_UNCONTAINED', { cleanupIncomplete: true })
      }
    }
  }

  try {
    state.provisionerSession = await deps.databaseAdmin.openProvisioner({
      password: state.provisionerPassword,
    })
  } catch {
    if (activationError && !settlement) state.provisionerActivationUnsettled = true
    fail('PROVISIONER_ACTIVATION_STATE_UNKNOWN', { cleanupIncomplete: true })
  }

  // A timeout or broken response without an operation id is reconciled only by
  // a fresh authenticated login with the exact generated secret.  This proves
  // the effect already happened; cleanup can then revoke it in this session.
  state.provisionerActivationUnsettled = false
}

function outcome(state, name) {
  if (state?.status === 'exact' && Number(state.seedRowCount) === 0) return 'complete'
  if (state?.status === 'absent') return 'absent'
  fail(`${name}_STATE_REQUIRES_REVIEW`)
}

async function reconcileMigration(deps, kind, password) {
  const state = kind === 'access'
    ? await deps.databaseAdmin.inspectAccessProfile({ executorPassword: password })
    : await deps.databaseAdmin.inspectFinancialModel({ executorPassword: password })
  return outcome(
    state,
    kind === 'access' ? 'ACCESS_PROFILE_V2' : 'FINANCIAL_MODEL_V21',
  )
}

async function runApply(options, deps, { cancellation } = {}) {
  exact(options.project, EXPECTED.project, 'PROJECT_MISMATCH')
  exact(options.instance, EXPECTED.instance, 'INSTANCE_MISMATCH')
  exact(options.region, EXPECTED.region, 'REGION_MISMATCH')
  exact(options.database, EXPECTED.database, 'DATABASE_MISMATCH')
  exact(options.backupId, EXPECTED.backupId, 'BACKUP_REFERENCE_MISMATCH')
  exact(options.confirmation, EXPECTED.confirmation, 'CONFIRMATION_MISMATCH')
  if (!/^[0-9a-f]{40}$/.test(options.expectedHead)) fail('EXPECTED_HEAD_INVALID')
  if (!deps?.randomSecret || !deps?.databaseAdmin || !deps?.cloudSqlAdmin
      || !deps?.psqlRunner?.prepare || !deps?.psqlRunner?.runAccessProfile
      || !deps?.psqlRunner?.runFinancialModel || !deps?.psqlRunner?.close) {
    fail('APPLY_DEPENDENCY_MISSING')
  }

  const initial = await runAudit(options, deps)
  validateSnapshot(initial, options, { applying: true })
  let accessStatus = initial.database.accessProfile.status
  let financialStatus = initial.database.financialModel.status
  const state = {
    provisionerSession: null,
    provisionerMayHaveCredential: false,
    provisionerActivationUnsettled: false,
    executorMayHaveCredential: false,
    provisionerPassword: null,
    executorPassword: null,
    secretBuffers: [],
    completedStages: [],
  }
  const completeStage = (stage) => {
    if (!SAFE_COMPLETED_STAGES.has(stage)) fail('UNSAFE_COMPLETED_STAGE')
    if (!state.completedStages.includes(stage)) state.completedStages.push(stage)
  }
  let proxyPrepared = false
  let persistentChange = false
  let succeeded = false
  let primaryError = null

  try {
    if (initial.database.foundationExact === true
        && accessStatus === 'exact' && financialStatus === 'exact'
        && initial.database.accessSourceReferences.status === 'exact') {
      const postflight = await runAudit(options, deps)
      validateSnapshot(postflight, options, {
        applying: true,
        foundationMustBeExact: true,
      })
      if (postflight.database.accessSourceReferences.status !== 'exact') {
        fail('ACCESS_SOURCE_REFERENCES_NOT_EXACT')
      }
      succeeded = true
      return { ok: true, mode: 'apply', changed: persistentChange }
    }

    state.provisionerPassword = randomBuffer(deps)
    state.executorPassword = randomBuffer(deps)
    state.secretBuffers.push(state.provisionerPassword, state.executorPassword)

    await activateProvisioner(state, options, deps, cancellation)
    completeStage('provisioner_activated')

    state.executorMayHaveCredential = true
    await assertMutationGuards(options, deps, { allowRepairableReferences: true })
    assertNotCancelled(cancellation)
    try {
      await state.provisionerSession.activateExecutor({
        password: state.executorPassword,
        mutate: true,
      })
    } catch {
      const verified = await deps.databaseAdmin.verifyPasswordAccepted({
        role: EXPECTED.executor,
        password: state.executorPassword,
        containment: true,
      })
      if (verified !== true) fail('EXECUTOR_ACTIVATION_STATE_UNKNOWN')
    }
    completeStage('executor_activated')

    // The IAM audit can only prove the relation/owner shape. Before any Access
    // or Financial mutation, the temporary executor must run the complete,
    // independent Foundation postflight (catalog, indexes, constraints,
    // functions, triggers and ACL), not a shortened heuristic.
    const authenticatedFoundation = await runAudit(options, deps, {
      executorPassword: state.executorPassword,
    })
    validateSnapshot(authenticatedFoundation, options, {
      applying: true,
      foundationMustBeExact: true,
    })
    completeStage('foundation_postflight_verified')

    if (authenticatedFoundation.database.accessSourceReferences.status === 'repairable') {
      await assertMutationGuards(options, deps, { allowRepairableReferences: true })
      assertNotCancelled(cancellation)
      try {
        await deps.databaseAdmin.grantAccessSourceReferences({ mutate: true })
      } catch {
        const repaired = await deps.databaseAdmin.inspectAccessSourceReferences()
        if (repaired?.status !== 'exact') fail('ACCESS_SOURCE_REFERENCE_GRANT_FAILED')
      }
      const repaired = await deps.databaseAdmin.inspectAccessSourceReferences()
      if (repaired?.status !== 'exact') fail('ACCESS_SOURCE_REFERENCE_POSTFLIGHT_FAILED')
      persistentChange = true
      completeStage('source_references_granted')
    }

    if (accessStatus === 'verification_required') {
      accessStatus = await reconcileMigration(deps, 'access', state.executorPassword)
    }
    if (financialStatus === 'verification_required') {
      financialStatus = await reconcileMigration(deps, 'financial', state.executorPassword)
    }

    if (accessStatus === 'absent' || financialStatus === 'absent') {
      await deps.psqlRunner.prepare()
      proxyPrepared = true
    }

    if (accessStatus === 'absent') {
      await assertMutationGuards(options, deps)
      assertNotCancelled(cancellation)
      try {
        await deps.psqlRunner.runAccessProfile({
          password: state.executorPassword,
          options,
        })
        accessStatus = 'exact'
        persistentChange = true
      } catch {
        const reconciled = await reconcileMigration(
          deps,
          'access',
          state.executorPassword,
        )
        if (reconciled !== 'complete') {
          assertNotCancelled(cancellation)
          fail('ACCESS_PROFILE_V2_APPLY_FAILED_WITHOUT_CHANGE')
        }
        accessStatus = 'exact'
        persistentChange = true
      }
      completeStage('access_profile_applied')
    }

    if (financialStatus === 'absent') {
      await assertMutationGuards(options, deps)
      assertNotCancelled(cancellation)
      try {
        await deps.psqlRunner.runFinancialModel({
          password: state.executorPassword,
          options,
        })
        financialStatus = 'exact'
        persistentChange = true
      } catch {
        const reconciled = await reconcileMigration(
          deps,
          'financial',
          state.executorPassword,
        )
        if (reconciled !== 'complete') {
          assertNotCancelled(cancellation)
          fail('FINANCIAL_MODEL_V21_APPLY_FAILED_WITHOUT_CHANGE')
        }
        financialStatus = 'exact'
        persistentChange = true
      }
      completeStage('financial_model_applied')
    }

    const [accessPostflight, financialPostflight] = await Promise.all([
      deps.databaseAdmin.inspectAccessProfile({ executorPassword: state.executorPassword }),
      deps.databaseAdmin.inspectFinancialModel({ executorPassword: state.executorPassword }),
    ])
    if (outcome(accessPostflight, 'ACCESS_PROFILE_V2') !== 'complete'
        || outcome(financialPostflight, 'FINANCIAL_MODEL_V21') !== 'complete') {
      fail('MIGRATION_POSTFLIGHT_FAILED')
    }
    completeStage('migration_postflight_verified')
    const cloudPostflight = await deps.cloudSqlAdmin.inspect(options)
    if (cloudPostflight.gates?.allDisabled !== true
        || Number(cloudPostflight.gates?.allowlistCount) !== 0) {
      fail('PROFITABILITY_GATES_CHANGED_DURING_APPLY')
    }

    const authenticatedFinalSnapshot = await runAudit(options, deps, {
      executorPassword: state.executorPassword,
    })
    validateSnapshot(authenticatedFinalSnapshot, options, {
      applying: true,
      foundationMustBeExact: true,
    })

    try {
      await state.provisionerSession.lockExecutor({ mutate: true })
    } catch {
      // Reconcile a committed ALTER ROLE whose response was lost below.
    }
    if (!(await verifyCredentialRejected(
      deps,
      EXPECTED.executor,
      state.executorPassword,
    ))) fail('EXECUTOR_PASSWORD_NOT_NULL', { cleanupIncomplete: true })
    state.executorMayHaveCredential = false

    try {
      await state.provisionerSession.lockSelf({ mutate: true })
    } catch {
      // Reconcile a committed ALTER ROLE whose response was lost below.
    }
    if (!(await verifyCredentialRejected(
      deps,
      EXPECTED.provisioner,
      state.provisionerPassword,
    ))) fail('PROVISIONER_PASSWORD_NOT_NULL', { cleanupIncomplete: true })
    state.provisionerMayHaveCredential = false

    // After PASSWORD NULL the read-only IAM audit can prove exact relation
    // presence but cannot SET ROLE to execute the owner-only fingerprints. The
    // authenticated snapshot above is the exact fingerprint; this final audit
    // rechecks source, backup, flags and the fail-closed relation shape.
    const containedFinalSnapshot = await runAudit(options, deps)
    validateSnapshot(containedFinalSnapshot, options, { applying: true })
    if (containedFinalSnapshot.database.accessSourceReferences.status !== 'exact') {
      fail('ACCESS_SOURCE_REFERENCES_CHANGED_AFTER_POSTFLIGHT')
    }
    if (!['exact', 'verification_required'].includes(
      containedFinalSnapshot.database.accessProfile.status,
    ) || !['exact', 'verification_required'].includes(
      containedFinalSnapshot.database.financialModel.status,
    )) {
      fail('MIGRATION_RELATIONS_CHANGED_AFTER_POSTFLIGHT')
    }
    succeeded = true
    return { ok: true, mode: 'apply', changed: persistentChange }
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    const credentialsContained = await containCredentials(state, deps)
    if (credentialsContained && state.secretBuffers.length > 0) {
      completeStage('credentials_contained')
    }
    let proxyClosed = true
    if (proxyPrepared) {
      try {
        await deps.psqlRunner.close()
      } catch {
        proxyClosed = false
      }
    }
    if ((!credentialsContained || !proxyClosed) && succeeded) {
      throw new ProfitabilityAccessV21ProductionError('CLEANUP_INCOMPLETE', {
        cleanupIncomplete: true,
        changed: persistentChange,
        completedStages: state.completedStages,
        manualReviewRequired: true,
        reauditRequired: true,
      })
    }
    if (primaryError) {
      annotateFailure(primaryError, {
        changed: persistentChange,
        completedStages: state.completedStages,
        cleanupIncomplete: !credentialsContained || !proxyClosed,
      })
    }
  }
}

function createCancellation(processRef = process) {
  const controller = new AbortController()
  const onSignal = () => controller.abort()
  processRef.on('SIGINT', onSignal)
  processRef.on('SIGTERM', onSignal)
  return Object.freeze({
    signal: controller.signal,
    dispose() {
      processRef.removeListener('SIGINT', onSignal)
      processRef.removeListener('SIGTERM', onSignal)
    },
  })
}

function safeFailureReport(error) {
  const completedStages = Array.isArray(error?.completedStages)
    ? [...new Set(error.completedStages)].filter((stage) => SAFE_COMPLETED_STAGES.has(stage))
    : []
  return {
    ok: false,
    error: error?.code || 'PRODUCTION_APPLY_FAILED',
    cleanupIncomplete: error?.cleanupIncomplete === true,
    changed: error?.changed === true,
    completedStages,
    manualReviewRequired: error?.manualReviewRequired === true,
    reauditRequired: error?.reauditRequired === true,
  }
}

function safeAuditReport(snapshot) {
  return {
    ok: true,
    mode: 'audit',
    source: {
      head: snapshot.source.head,
      clean: snapshot.source.clean,
      remote: snapshot.source.remote,
      remoteUrl: snapshot.source.remoteUrl,
      remoteContainsHead: snapshot.source.remoteContainsHead,
    },
    cloud: {
      project: snapshot.cloud.project,
      instance: snapshot.cloud.instance,
      region: snapshot.cloud.region,
      runtimeRegion: snapshot.cloud.runtimeRegion,
      runtimeService: snapshot.cloud.runtimeService,
      state: snapshot.cloud.state,
      backup: snapshot.cloud.backup,
      gates: snapshot.cloud.gates,
    },
    database: {
      database: snapshot.database.database,
      iamDatabaseUser: snapshot.database.iamDatabaseUser,
      pgMajor: snapshot.database.pgMajor,
      primary: snapshot.database.primary,
      readWrite: snapshot.database.readWrite,
      foundationExact: snapshot.database.foundationExact,
      foundationStatus: snapshot.database.foundationStatus,
      roleGraphExact: snapshot.database.roleGraphExact,
      accessSourceReferences: snapshot.database.accessSourceReferences.status,
      accessProfile: snapshot.database.accessProfile.status,
      financialModel: snapshot.database.financialModel.status,
    },
  }
}

async function main({ argv = process.argv.slice(2), deps, stdout = process.stdout, stderr = process.stderr } = {}) {
  let dependencies = deps
  let cancellation = null
  try {
    const options = resolveOptions(argv)
    if (options.help) {
      stdout.write('Usage: node scripts/apply-profitability-access-v21-production.js [--apply ...]\n')
      return 0
    }
    cancellation = createCancellation()
    if (!dependencies) {
      const { createProfitabilityAccessV21ProductionDependencies } = require(
        './lib/profitability-access-v21-production-adapters'
      )
      dependencies = createProfitabilityAccessV21ProductionDependencies({
        signal: cancellation.signal,
      })
    }
    const result = options.mode === 'apply'
      ? await runApply(options, dependencies, { cancellation })
      : safeAuditReport(await runAudit(options, dependencies))
    stdout.write(`${JSON.stringify(result)}\n`)
    return 0
  } catch (error) {
    stderr.write(`${JSON.stringify(safeFailureReport(error))}\n`)
    return 1
  } finally {
    try {
      await dependencies?.close?.()
    } catch {
      // The command result already fails closed; never print adapter details.
    }
    cancellation?.dispose()
  }
}

if (require.main === module) {
  main().then((exitCode) => { process.exitCode = exitCode })
}

module.exports = {
  EXPECTED,
  ProfitabilityAccessV21ProductionError,
  containCredentials,
  createCancellation,
  main,
  parseArguments,
  resolveOptions,
  runApply,
  runAudit,
  safeAuditReport,
  safeFailureReport,
  validateSnapshot,
}
