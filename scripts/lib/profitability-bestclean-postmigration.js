'use strict'

const crypto = require('node:crypto')
const {
  CATALOG_FINGERPRINT_SCHEMA_VERSION,
  CATALOG_VERIFICATION_SCHEMA_VERSION,
  ENFORCEMENT_SCHEMA_VERSION: ACCESS_ENFORCEMENT_SCHEMA_VERSION,
  MANIFEST_SCHEMA_VERSION: ACCESS_MANIFEST_SCHEMA_VERSION,
  assertCatalogVerificationMatchesState,
  buildProvisioningPlan,
  manifestSha256: accessManifestSha256,
  markerReason: accessMarkerReason,
  normalizeManifest: normalizeAccessManifest,
  readAuthorizationState,
  readCatalogFingerprintState,
  readTargetState: readAccessTargetState,
  runProvisioning,
  sourceStateSha256,
} = require('./profitability-access-v2-provisioning')
const {
  EXPECTED_ORG_ID,
  profitabilityActivationLockKey,
  runCatalogSeed,
} = require('./profitability-service-object-catalog-seed')

const EXPECTED = Object.freeze({
  project: 'iclean-room',
  instance: 'iclean-room-instance',
  region: 'europe-west3',
  database: 'iclean-room-database',
  backupId: '1790505049269',
  orgId: EXPECTED_ORG_ID,
  provisioner: 'profitability_provisioner',
  executor: 'profitability_migration_executor',
  confirmation: 'APPLY_PROFITABILITY_BESTCLEAN_POSTMIGRATION_ONLY_20260927',
})

const FINANCIAL_SCHEMA_VERSION = 'v2.1'
const ACCESS_ACTIVATION_REASON = 'Best Clean profitability access v2 approved 2026-09-27'
const SECRET_FLAG = /(?:password|passwd|secret|credential|access[-_]?token|id[-_]?token|database[-_]?url|uri)/i
const SAFE_VALUE = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-]{0,255}$/

const EXPECTED_WORKERS = Object.freeze([
  Object.freeze({
    workerId: 'W001',
    membershipRole: 'OWNER',
    operationalProfile: 'OWNER',
    financeProfile: 'OWNER_FULL',
    canEditOperationalCosts: true,
    canEditContractTerms: true,
    canEditProfitabilityTargets: true,
    canViewWorkerRates: true,
    canEditWorkerRates: true,
    actor: true,
  }),
  Object.freeze({
    workerId: 'W002',
    membershipRole: 'ADMIN',
    operationalProfile: 'OPERATIONS_ADMIN',
    financeProfile: 'COST_CONTROL',
    canEditOperationalCosts: true,
    canEditContractTerms: false,
    canEditProfitabilityTargets: false,
    canViewWorkerRates: false,
    canEditWorkerRates: false,
  }),
  Object.freeze({
    workerId: 'W003',
    membershipRole: 'ADMIN',
    operationalProfile: 'ADMIN',
    financeProfile: 'COST_CONTROL',
    canEditOperationalCosts: false,
    canEditContractTerms: false,
    canEditProfitabilityTargets: false,
    canViewWorkerRates: false,
    canEditWorkerRates: false,
  }),
  Object.freeze({
    workerId: 'W005',
    membershipRole: 'ADMIN',
    operationalProfile: 'ADMIN',
    financeProfile: 'OWNER_FULL',
    canEditOperationalCosts: true,
    canEditContractTerms: true,
    canEditProfitabilityTargets: true,
    canViewWorkerRates: true,
    canEditWorkerRates: true,
  }),
])

class ProfitabilityBestcleanPostmigrationError extends Error {
  constructor(code, metadata = {}) {
    super(code)
    this.name = 'ProfitabilityBestcleanPostmigrationError'
    this.code = code
    this.cleanupIncomplete = metadata.cleanupIncomplete === true
    this.persistentChange = metadata.persistentChange === true
    this.progress = metadata.progress || null
  }
}

function fail(code, metadata = {}) {
  throw new ProfitabilityBestcleanPostmigrationError(code, metadata)
}

function text(value) {
  return String(value ?? '').trim()
}

function parseArguments(argv = []) {
  const result = { mode: 'audit' }
  const booleanFlags = new Set(['apply', 'help'])
  const valueFlags = new Set([
    'project', 'instance', 'region', 'database', 'backup-id', 'org',
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
    if (!SAFE_VALUE.test(normalized) || /:\/\//.test(normalized)) fail('INVALID_ARGUMENT_VALUE')
    result[name] = normalized
  }
  return result
}

function resolveOptions(argv = []) {
  const values = parseArguments(argv)
  if (values.help) return { mode: 'audit', help: true }
  const options = {
    mode: values.mode,
    project: values.project || EXPECTED.project,
    instance: values.instance || EXPECTED.instance,
    region: values.region || EXPECTED.region,
    database: values.database || EXPECTED.database,
    backupId: values['backup-id'] || EXPECTED.backupId,
    orgId: values.org || EXPECTED.orgId,
    expectedHead: values['expected-head'] || '',
    confirmation: values.confirmation || '',
  }
  if (options.mode === 'apply') {
    if (!/^[0-9a-f]{40}$/.test(options.expectedHead)) fail('EXPECTED_HEAD_INVALID')
    if (options.confirmation !== EXPECTED.confirmation) fail('CONFIRMATION_MISMATCH')
  }
  return options
}

function exact(actual, expected, code) {
  if (String(actual) !== String(expected)) fail(code)
}

function assertNotCancelled(signal) {
  if (signal?.aborted) fail('APPLY_CANCELLED')
}

function validateEnvironmentSnapshot(snapshot, options, {
  applying = false,
  authenticated = false,
} = {}) {
  exact(options?.project, EXPECTED.project, 'PROJECT_MISMATCH')
  exact(options?.instance, EXPECTED.instance, 'INSTANCE_MISMATCH')
  exact(options?.region, EXPECTED.region, 'REGION_MISMATCH')
  exact(options?.database, EXPECTED.database, 'DATABASE_MISMATCH')
  exact(options?.backupId, EXPECTED.backupId, 'BACKUP_REFERENCE_MISMATCH')
  exact(options?.orgId, EXPECTED.orgId, 'ORG_NOT_ALLOWLISTED')
  if (!snapshot?.source || !snapshot?.cloud || !snapshot?.database) {
    fail('AUDIT_SNAPSHOT_INCOMPLETE')
  }
  const { source, cloud, database } = snapshot
  if (options.expectedHead) exact(source.head, options.expectedHead, 'HEAD_MISMATCH')
  if (applying && source.clean !== true) fail('DIRTY_WORKTREE')
  if (applying && source.remoteContainsHead !== true) fail('REMOTE_HEAD_NOT_VERIFIED')
  exact(cloud.project, EXPECTED.project, 'PROJECT_MISMATCH')
  exact(cloud.instance, EXPECTED.instance, 'INSTANCE_MISMATCH')
  exact(cloud.region, EXPECTED.region, 'REGION_MISMATCH')
  if (cloud.state !== 'RUNNABLE') fail('CLOUD_SQL_NOT_RUNNABLE')
  if (String(cloud.backup?.id) !== EXPECTED.backupId || cloud.backup?.status !== 'SUCCESSFUL') {
    fail('BACKUP_NOT_SUCCESSFUL')
  }
  if (cloud.gates?.allDisabled !== true || Number(cloud.gates?.allowlistCount) !== 0) {
    fail('PROFITABILITY_GATES_MUST_REMAIN_OFF')
  }
  exact(database.database, EXPECTED.database, 'DATABASE_MISMATCH')
  if (database.pgMajor !== 17 || database.primary !== true || database.readWrite !== true) {
    fail('DATABASE_NOT_WRITABLE_PG17_PRIMARY')
  }
  if (database.foundationExact !== true || database.roleGraphExact !== true) {
    fail('FOUNDATION_STATE_INVALID')
  }
  if (database.accessSourceReferences?.status !== 'exact') {
    fail('ACCESS_SOURCE_REFERENCES_NOT_EXACT')
  }
  if (database.sourceReadBridge?.status !== 'exact') {
    fail('SOURCE_READ_BRIDGE_NOT_EXACT')
  }
  const allowedStatus = authenticated ? new Set(['exact']) : new Set(['exact', 'verification_required'])
  if (!allowedStatus.has(database.accessProfile?.status)) fail('ACCESS_PROFILE_V2_NOT_EXACT')
  if (!allowedStatus.has(database.financialModel?.status)) fail('FINANCIAL_MODEL_V21_NOT_EXACT')
  return snapshot
}

function canonicalStringify(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalStringify(value[key])}`
    )).join(',')}}`
  }
  return JSON.stringify(value)
}

function workerBindingFingerprint(bindings) {
  return crypto.createHash('sha256')
    .update(canonicalStringify(bindings.map((entry) => ({
      workerId: entry.workerId,
      uid: entry.uid,
      role: entry.role,
      status: entry.status,
    }))), 'utf8')
    .digest('hex')
}

async function readBestcleanWorkerBindings(sourceClient, orgId = EXPECTED.orgId) {
  if (!sourceClient?.query) fail('SOURCE_READER_CLIENT_REQUIRED')
  exact(orgId, EXPECTED.orgId, 'ORG_NOT_ALLOWLISTED')
  const workerIds = EXPECTED_WORKERS.map((entry) => entry.workerId)
  const result = await sourceClient.query(
    `/* profitability-bestclean-postmigration:worker-bindings */
     select worker_id, uid, role, status
       from public.organization_member
      where org_id = $1
        and worker_id = any($2::text[])
      order by worker_id`,
    [orgId, workerIds],
  )
  const rows = result.rows || []
  if (rows.length !== EXPECTED_WORKERS.length) fail('EXPECTED_WORKER_BINDINGS_NOT_EXACT')
  const byWorkerId = new Map()
  for (const row of rows) {
    const workerId = text(row.worker_id)
    const uid = text(row.uid)
    const role = text(row.role).toUpperCase()
    const status = text(row.status).toUpperCase()
    if (!workerId || !uid || byWorkerId.has(workerId)) fail('EXPECTED_WORKER_BINDINGS_NOT_EXACT')
    byWorkerId.set(workerId, { workerId, uid, role, status })
  }
  const bindings = EXPECTED_WORKERS.map((expected) => {
    const actual = byWorkerId.get(expected.workerId)
    if (!actual || actual.role !== expected.membershipRole || actual.status !== 'ACTIVE') {
      fail('EXPECTED_WORKER_MEMBERSHIP_MISMATCH')
    }
    return actual
  })
  return Object.freeze({
    bindings: Object.freeze(bindings.map((entry) => Object.freeze({ ...entry }))),
    fingerprint: workerBindingFingerprint(bindings),
  })
}

function profileFor(expected) {
  return {
    operationalProfile: expected.operationalProfile,
    objectScope: 'ALL',
    workerScope: 'ALL',
    financeProfile: expected.financeProfile,
    accessMode: 'MANAGE',
    canEditOperationalCosts: expected.canEditOperationalCosts,
    canEditContractTerms: expected.canEditContractTerms,
    canEditProfitabilityTargets: expected.canEditProfitabilityTargets,
    canViewWorkerRates: expected.canViewWorkerRates,
    canEditWorkerRates: expected.canEditWorkerRates,
  }
}

function buildBestcleanAccessManifest(resolvedBindings, catalogVerification) {
  if (!resolvedBindings?.bindings || !resolvedBindings?.fingerprint) {
    fail('WORKER_BINDINGS_REQUIRED')
  }
  assertCatalogVerification(catalogVerification)
  const byWorkerId = new Map(resolvedBindings.bindings.map((entry) => [entry.workerId, entry]))
  const actorExpected = EXPECTED_WORKERS.find((entry) => entry.actor)
  const actorBinding = byWorkerId.get(actorExpected.workerId)
  if (!actorBinding) fail('ACTOR_BINDING_REQUIRED')
  return {
    schemaVersion: ACCESS_MANIFEST_SCHEMA_VERSION,
    orgId: EXPECTED.orgId,
    authoritative: true,
    actor: {
      uid: actorBinding.uid,
      expectedMembershipRole: actorExpected.membershipRole,
      expectedMembershipStatus: 'ACTIVE',
    },
    profiles: EXPECTED_WORKERS.map((expected) => {
      const binding = byWorkerId.get(expected.workerId)
      if (!binding) fail('EXPECTED_WORKER_BINDINGS_NOT_EXACT')
      return {
        uid: binding.uid,
        expectedWorkerId: expected.workerId,
        expectedMembershipRole: expected.membershipRole,
        expectedMembershipStatus: 'ACTIVE',
        profile: profileFor(expected),
        assignments: [],
      }
    }),
    activation: {
      reason: ACCESS_ACTIVATION_REASON,
    },
  }
}

function catalogVerificationFromResult(result) {
  const candidate = result?.catalogVerification || result?.verification
  if (candidate) return assertCatalogVerification(candidate)
  const activeSourceClients = Number(result?.counts?.activeSourceClients)
  const serviceObjects = Number(
    result?.counts?.serviceObjects ?? result?.counts?.existingObjects,
  )
  return assertCatalogVerification({
    schemaVersion: CATALOG_VERIFICATION_SCHEMA_VERSION,
    fingerprintSchemaVersion: result?.fingerprintSchemaVersion,
    orgId: EXPECTED.orgId,
    fingerprintSha256: result?.fingerprintSha256,
    exact: result?.exact,
    counts: { activeSourceClients, serviceObjects },
  })
}

function assertCatalogVerification(value) {
  if (!value || value.schemaVersion !== CATALOG_VERIFICATION_SCHEMA_VERSION
      || value.fingerprintSchemaVersion !== CATALOG_FINGERPRINT_SCHEMA_VERSION
      || value.orgId !== EXPECTED.orgId || value.exact !== true
      || !/^[0-9a-f]{64}$/.test(text(value.fingerprintSha256))) {
    fail('CATALOG_VERIFICATION_INVALID')
  }
  const activeSourceClients = Number(value.counts?.activeSourceClients)
  const serviceObjects = Number(value.counts?.serviceObjects)
  if (!Number.isInteger(activeSourceClients) || activeSourceClients < 1
      || serviceObjects !== activeSourceClients) {
    fail('CATALOG_VERIFICATION_COUNTS_INVALID')
  }
  return Object.freeze({
    schemaVersion: CATALOG_VERIFICATION_SCHEMA_VERSION,
    fingerprintSchemaVersion: CATALOG_FINGERPRINT_SCHEMA_VERSION,
    orgId: EXPECTED.orgId,
    fingerprintSha256: value.fingerprintSha256,
    exact: true,
    counts: Object.freeze({ activeSourceClients, serviceObjects }),
  })
}

function newProgress() {
  return {
    environment: 'not_started',
    credentials: 'not_started',
    sourceBindings: 'not_started',
    catalog: 'not_started',
    profiles: 'not_started',
    accessMarker: 'not_started',
    financialMarker: 'not_started',
    finalVerification: 'not_started',
    cleanup: 'not_started',
  }
}

function safeProgress(progress) {
  return Object.fromEntries(Object.entries(progress || {}).map(([key, value]) => (
    [key, typeof value === 'string' ? value : 'unknown']
  )))
}

async function inspectEnvironment(options, deps, { executorPassword, applying = false } = {}) {
  if (!deps?.environment?.inspect) fail('ENVIRONMENT_INSPECTOR_REQUIRED')
  const snapshot = await deps.environment.inspect(options, { executorPassword })
  return validateEnvironmentSnapshot(snapshot, options, {
    applying,
    authenticated: executorPassword !== undefined,
  })
}

async function withSourceClient(deps, callback) {
  const client = await deps.connections.openSourceReader()
  try {
    return await callback(client)
  } finally {
    await client.end()
  }
}

async function runAudit(options, deps) {
  const snapshot = await inspectEnvironment(options, deps)
  const resolved = await withSourceClient(deps, (client) => (
    readBestcleanWorkerBindings(client, options.orgId)
  ))
  return {
    ok: true,
    mode: 'audit',
    source: {
      head: snapshot.source.head,
      clean: snapshot.source.clean,
      remoteContainsHead: snapshot.source.remoteContainsHead,
    },
    cloud: {
      project: snapshot.cloud.project,
      instance: snapshot.cloud.instance,
      region: snapshot.cloud.region,
      backup: snapshot.cloud.backup,
      gates: snapshot.cloud.gates,
    },
    database: {
      database: snapshot.database.database,
      pgMajor: snapshot.database.pgMajor,
      foundation: 'exact',
      accessProfileSchema: snapshot.database.accessProfile.status,
      financialModelSchema: snapshot.database.financialModel.status,
    },
    sourceBindings: {
      exact: true,
      count: resolved.bindings.length,
    },
    next: 'apply_requires_explicit_confirmation',
  }
}

async function safeClose(resource) {
  if (!resource?.close && !resource?.end) return true
  try {
    if (resource.close) await resource.close()
    else await resource.end()
    return true
  } catch {
    return false
  }
}

async function verifyRejected(deps, role, password) {
  try {
    return await deps.credentials.verifyPasswordRejected({ role, password }) === true
  } catch {
    return false
  }
}

async function containCredentials(state, deps, progress) {
  let complete = true
  if (!(await safeClose(state.sourceClient))) complete = false
  state.sourceClient = null

  let session = state.provisionerSession
  if ((state.executorMayHaveCredential || state.provisionerMayHaveCredential) && !session) {
    try {
      session = await deps.credentials.openProvisioner({
        password: state.provisionerPassword,
        containment: true,
      })
      state.provisionerSession = session
    } catch {
      session = null
    }
  }
  if (state.executorMayHaveCredential) {
    try { await session?.lockExecutor?.({ mutate: true }) } catch {}
    let rejected = await verifyRejected(deps, EXPECTED.executor, state.executorPassword)
    if (!rejected && state.targetClient?.query) {
      try {
        await state.targetClient.query(
          'alter role profitability_migration_executor password null',
        )
      } catch {}
      rejected = await verifyRejected(deps, EXPECTED.executor, state.executorPassword)
    }
    if (!rejected) complete = false
    else state.executorMayHaveCredential = false
  }
  if (!(await safeClose(state.targetClient))) complete = false
  state.targetClient = null
  if (state.provisionerMayHaveCredential) {
    try { await session?.lockSelf?.({ mutate: true }) } catch {}
    if (!(await verifyRejected(deps, EXPECTED.provisioner, state.provisionerPassword))) complete = false
    else state.provisionerMayHaveCredential = false
  }
  if (!(await safeClose(state.provisionerSession))) complete = false
  state.provisionerSession = null
  if (state.provisionerActivationUnsettled) complete = false
  for (const secret of state.secretBuffers) {
    if (Buffer.isBuffer(secret)) secret.fill(0)
  }
  progress.credentials = complete ? 'contained' : 'containment_failed'
  progress.cleanup = complete ? 'complete' : 'incomplete'
  return complete
}

function randomBuffer(deps) {
  const value = deps.randomSecret()
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8')
  if (buffer.length < 24) fail('GENERATED_SECRET_TOO_SHORT')
  return buffer
}

async function assertMutationGuard(options, deps, executorPassword, signal) {
  assertNotCancelled(signal)
  const snapshot = await inspectEnvironment(options, deps, { executorPassword, applying: true })
  assertNotCancelled(signal)
  return snapshot
}

async function activateCredentials(options, deps, state, progress, signal) {
  await assertMutationGuard(options, deps, undefined, signal)
  state.provisionerMayHaveCredential = true
  let activationError = null
  try {
    await deps.credentials.activateProvisioner({
      password: state.provisionerPassword,
      mutate: true,
    })
  } catch (error) {
    activationError = error
    const operationName = text(error?.cloudSqlOperation?.name)
    if (operationName && deps.credentials.settleProvisionerActivation) {
      const settlement = await deps.credentials.settleProvisionerActivation({ operationName })
      if (settlement?.terminal !== true) {
        state.provisionerActivationUnsettled = true
        fail('PROVISIONER_ACTIVATION_NOT_TERMINAL', { cleanupIncomplete: true })
      }
      if (settlement?.succeeded !== true) {
        const rejected = await verifyRejected(
          deps,
          EXPECTED.provisioner,
          state.provisionerPassword,
        )
        if (rejected) {
          state.provisionerMayHaveCredential = false
          fail('PROVISIONER_ACTIVATION_FAILED')
        }
        fail('PROVISIONER_ACTIVATION_FAILED_UNCONTAINED', { cleanupIncomplete: true })
      }
    }
  }
  try {
    state.provisionerSession = await deps.credentials.openProvisioner({
      password: state.provisionerPassword,
    })
  } catch {
    fail(activationError ? 'PROVISIONER_ACTIVATION_STATE_UNKNOWN' : 'PROVISIONER_LOGIN_FAILED', {
      cleanupIncomplete: true,
    })
  }

  await assertMutationGuard(options, deps, undefined, signal)
  state.executorMayHaveCredential = true
  try {
    await state.provisionerSession.activateExecutor({
      password: state.executorPassword,
      mutate: true,
    })
  } catch {
    const accepted = await deps.credentials.verifyPasswordAccepted({
      role: EXPECTED.executor,
      password: state.executorPassword,
    })
    if (accepted !== true) fail('EXECUTOR_ACTIVATION_STATE_UNKNOWN')
  }
  progress.credentials = 'temporary_active'
}

function accessMarkerIsExact(marker, manifest, manifestHash, catalogVerification) {
  return Boolean(marker) &&
    text(marker.schemaVersion ?? marker.schema_version) === ACCESS_ENFORCEMENT_SCHEMA_VERSION &&
    text(marker.enforcedByUid ?? marker.enforced_by_uid) === manifest.actor.uid &&
    text(marker.reason) === accessMarkerReason(manifest, manifestHash, catalogVerification)
}

async function readExactFinancialPrerequisites({
  sourceClient,
  targetClient,
  orgId,
  accessManifest,
  accessManifestHash,
  catalogVerification,
}) {
  const catalogState = await readCatalogFingerprintState(sourceClient, targetClient, orgId)
  assertCatalogVerificationMatchesState(catalogVerification, catalogState)

  const sourceState = await readAuthorizationState(sourceClient, targetClient, accessManifest)
  const targetState = await readAccessTargetState(targetClient, accessManifest, sourceState)
  const plan = buildProvisioningPlan(accessManifest, targetState)
  if (!plan.exact) fail('ACCESS_PROFILES_NOT_EXACT')
  if (!accessMarkerIsExact(
    targetState.marker,
    accessManifest,
    accessManifestHash,
    catalogVerification,
  )) fail('ACCESS_ENFORCEMENT_MARKER_NOT_EXACT')

  return {
    sourceStateSha256: sourceStateSha256(sourceState),
  }
}

async function runFinancialMarker({
  targetClient,
  sourceClient,
  orgId,
  accessManifest: rawAccessManifest,
  catalogVerification: rawCatalogVerification,
  mode,
  accessSchemaCheck,
  financialSchemaCheck,
}) {
  if (!targetClient?.query) fail('TARGET_DATABASE_CLIENT_REQUIRED')
  if (!sourceClient?.query || sourceClient === targetClient) {
    fail('DISTINCT_SOURCE_READER_CLIENT_REQUIRED')
  }
  if (!['audit', 'apply', 'verify'].includes(mode)) fail('MODE_INVALID')
  if (typeof accessSchemaCheck !== 'function' || typeof financialSchemaCheck !== 'function') {
    fail('FINANCIAL_MARKER_SCHEMA_CHECKS_REQUIRED')
  }
  exact(orgId, EXPECTED.orgId, 'ORG_NOT_ALLOWLISTED')
  const catalogVerification = assertCatalogVerification(rawCatalogVerification)
  const accessManifest = normalizeAccessManifest(rawAccessManifest)
  exact(accessManifest.orgId, orgId, 'ACCESS_MANIFEST_ORG_MISMATCH')
  const accessManifestHash = accessManifestSha256(accessManifest)
  const actorUid = accessManifest.actor.uid

  const readOnly = mode !== 'apply'
  let targetStarted = false
  let targetFinished = false
  let sourceStarted = false
  let targetCommitted = false
  try {
    await targetClient.query(`begin isolation level serializable${readOnly ? ' read only' : ''}`)
    targetStarted = true
    await targetClient.query('set local role profitability_migration_runner')
    await targetClient.query('set local role profitability_owner')
    await targetClient.query(
      `select pg_advisory_xact_lock(hashtextextended($1::text, 0))
         /* profitability-bestclean-postmigration:activation-lock */`,
      [profitabilityActivationLockKey(orgId)],
    )
    await sourceClient.query('begin isolation level read committed read only')
    sourceStarted = true

    await accessSchemaCheck(targetClient)
    await financialSchemaCheck(targetClient)
    const initialPrerequisites = await readExactFinancialPrerequisites({
      sourceClient,
      targetClient,
      orgId,
      accessManifest,
      accessManifestHash,
      catalogVerification,
    })

    const marker = await targetClient.query(
      `select schema_version, enforced_by_uid
         from public.profitability_financial_model_enforcement
        where org_id = $1`,
      [orgId],
    )
    let current = marker.rows?.[0] || null
    if (current && (current.schema_version !== FINANCIAL_SCHEMA_VERSION
        || current.enforced_by_uid !== actorUid)) {
      fail('FINANCIAL_ENFORCEMENT_MARKER_MISMATCH')
    }
    let changed = false
    if (!current && mode === 'apply') {
      const inserted = await targetClient.query(
        `insert into public.profitability_financial_model_enforcement (
           org_id, schema_version, enforced_by_uid
         ) values ($1, $2, $3)`,
        [orgId, FINANCIAL_SCHEMA_VERSION, actorUid],
      )
      if (inserted.rowCount !== 1) fail('FINANCIAL_ENFORCEMENT_MARKER_INSERT_FAILED')
      changed = true
      current = { schema_version: FINANCIAL_SCHEMA_VERSION, enforced_by_uid: actorUid }
    }
    if (mode === 'verify' && !current) fail('FINANCIAL_ENFORCEMENT_MARKER_MISSING')

    const finalPrerequisites = await readExactFinancialPrerequisites({
      sourceClient,
      targetClient,
      orgId,
      accessManifest,
      accessManifestHash,
      catalogVerification,
    })
    if (finalPrerequisites.sourceStateSha256 !== initialPrerequisites.sourceStateSha256) {
      fail('SOURCE_AUTHORIZATION_CHANGED_DURING_FINANCIAL_MARKER')
    }

    if (readOnly) await targetClient.query('rollback')
    else {
      await targetClient.query('commit')
      targetCommitted = true
    }
    targetFinished = true
    await sourceClient.query('rollback')
    sourceStarted = false
    return { exact: Boolean(current), changed }
  } catch (error) {
    if (targetStarted && !targetFinished) {
      try { await targetClient.query('rollback') } catch {}
    }
    if (sourceStarted) {
      try { await sourceClient.query('rollback') } catch {}
    }
    if (targetCommitted) error.persistentChange = true
    throw error
  }
}

async function runApply(options, deps, { signal } = {}) {
  exact(options.project, EXPECTED.project, 'PROJECT_MISMATCH')
  exact(options.instance, EXPECTED.instance, 'INSTANCE_MISMATCH')
  exact(options.region, EXPECTED.region, 'REGION_MISMATCH')
  exact(options.database, EXPECTED.database, 'DATABASE_MISMATCH')
  exact(options.backupId, EXPECTED.backupId, 'BACKUP_REFERENCE_MISMATCH')
  exact(options.orgId, EXPECTED.orgId, 'ORG_NOT_ALLOWLISTED')
  exact(options.confirmation, EXPECTED.confirmation, 'CONFIRMATION_MISMATCH')
  if (!deps?.randomSecret || !deps?.credentials || !deps?.connections
      || !deps?.checks?.accessSchema || !deps?.checks?.financialSchema) {
    fail('APPLY_DEPENDENCY_MISSING')
  }

  const operations = {
    catalog: deps.operations?.catalog || runCatalogSeed,
    provisioning: deps.operations?.provisioning || runProvisioning,
    financialMarker: deps.operations?.financialMarker || runFinancialMarker,
  }
  const progress = newProgress()
  const state = {
    provisionerPassword: null,
    executorPassword: null,
    provisionerSession: null,
    sourceClient: null,
    targetClient: null,
    provisionerMayHaveCredential: false,
    executorMayHaveCredential: false,
    provisionerActivationUnsettled: false,
    secretBuffers: [],
  }
  let persistentChange = false
  let result = null
  let primaryError = null
  try {
    assertNotCancelled(signal)
    await inspectEnvironment(options, deps, { applying: true })
    progress.environment = 'verified'

    state.provisionerPassword = randomBuffer(deps)
    state.executorPassword = randomBuffer(deps)
    state.secretBuffers.push(state.provisionerPassword, state.executorPassword)
    await activateCredentials(options, deps, state, progress, signal)

    await assertMutationGuard(options, deps, state.executorPassword, signal)
    state.sourceClient = await deps.connections.openSourceReader()
    state.targetClient = await deps.connections.openTargetExecutor({
      password: state.executorPassword,
    })
    const initialBindings = await readBestcleanWorkerBindings(state.sourceClient, options.orgId)
    progress.sourceBindings = 'exact'

    const catalogAudit = await operations.catalog({
      targetClient: state.targetClient,
      sourceClient: state.sourceClient,
      orgId: options.orgId,
      mode: 'audit',
    })
    if (!catalogAudit.exact) {
      await assertMutationGuard(options, deps, state.executorPassword, signal)
      const applied = await operations.catalog({
        targetClient: state.targetClient,
        sourceClient: state.sourceClient,
        orgId: options.orgId,
        mode: 'apply',
        expectedManifestSha256: catalogAudit.manifestSha256,
      })
      persistentChange = persistentChange || applied.changed === true
    }
    const catalogVerified = await operations.catalog({
      targetClient: state.targetClient,
      sourceClient: state.sourceClient,
      orgId: options.orgId,
      mode: 'verify',
    })
    const catalogVerification = catalogVerificationFromResult(catalogVerified)
    progress.catalog = 'exact'

    const confirmedBindings = await readBestcleanWorkerBindings(state.sourceClient, options.orgId)
    if (confirmedBindings.fingerprint !== initialBindings.fingerprint) {
      fail('WORKER_BINDINGS_CHANGED_DURING_APPLY')
    }
    const accessManifest = buildBestcleanAccessManifest(confirmedBindings, catalogVerification)

    const accessAudit = await operations.provisioning({
      client: state.targetClient,
      sourceClient: state.sourceClient,
      manifest: accessManifest,
      catalogVerification,
      mode: 'audit',
      schemaCheck: deps.checks.accessSchema,
    })
    if (!accessAudit.exact) {
      await assertMutationGuard(options, deps, state.executorPassword, signal)
      const applied = await operations.provisioning({
        client: state.targetClient,
        sourceClient: state.sourceClient,
        manifest: accessManifest,
        catalogVerification,
        mode: 'apply',
        schemaCheck: deps.checks.accessSchema,
      })
      persistentChange = persistentChange || applied.changed === true
    }
    const accessVerified = await operations.provisioning({
      client: state.targetClient,
      sourceClient: state.sourceClient,
      manifest: accessManifest,
      catalogVerification,
      mode: 'verify',
      schemaCheck: deps.checks.accessSchema,
    })
    if (!accessVerified.exact) fail('ACCESS_PROFILES_NOT_EXACT')
    progress.profiles = 'exact'

    let accessActivated = accessVerified
    if (!accessVerified.activated) {
      await assertMutationGuard(options, deps, state.executorPassword, signal)
      accessActivated = await operations.provisioning({
        client: state.targetClient,
        sourceClient: state.sourceClient,
        manifest: accessManifest,
        catalogVerification,
        mode: 'activate',
        schemaCheck: deps.checks.accessSchema,
      })
      persistentChange = persistentChange || accessActivated.changed === true
    }
    if (!accessActivated.exact || !accessActivated.activated) {
      fail('ACCESS_ENFORCEMENT_NOT_ACTIVE')
    }
    progress.accessMarker = 'exact'

    const financialAudit = await operations.financialMarker({
      targetClient: state.targetClient,
      sourceClient: state.sourceClient,
      orgId: options.orgId,
      accessManifest,
      catalogVerification,
      mode: 'audit',
      accessSchemaCheck: deps.checks.accessSchema,
      financialSchemaCheck: deps.checks.financialSchema,
    })
    if (!financialAudit.exact) {
      await assertMutationGuard(options, deps, state.executorPassword, signal)
      const applied = await operations.financialMarker({
        targetClient: state.targetClient,
        sourceClient: state.sourceClient,
        orgId: options.orgId,
        accessManifest,
        catalogVerification,
        mode: 'apply',
        accessSchemaCheck: deps.checks.accessSchema,
        financialSchemaCheck: deps.checks.financialSchema,
      })
      persistentChange = persistentChange || applied.changed === true
    }
    const financialVerified = await operations.financialMarker({
      targetClient: state.targetClient,
      sourceClient: state.sourceClient,
      orgId: options.orgId,
      accessManifest,
      catalogVerification,
      mode: 'verify',
      accessSchemaCheck: deps.checks.accessSchema,
      financialSchemaCheck: deps.checks.financialSchema,
    })
    if (!financialVerified.exact) fail('FINANCIAL_ENFORCEMENT_NOT_ACTIVE')
    progress.financialMarker = 'exact'

    const finalBindings = await readBestcleanWorkerBindings(state.sourceClient, options.orgId)
    if (finalBindings.fingerprint !== initialBindings.fingerprint) {
      fail('WORKER_BINDINGS_CHANGED_DURING_APPLY')
    }
    await inspectEnvironment(options, deps, {
      executorPassword: state.executorPassword,
      applying: true,
    })
    assertNotCancelled(signal)
    progress.finalVerification = 'exact'
    result = {
      ok: true,
      mode: 'apply',
      changed: persistentChange,
      orgId: EXPECTED.orgId,
      counts: {
        serviceObjects: catalogVerification.counts.serviceObjects,
        profiles: EXPECTED_WORKERS.length,
        inferredCoordinators: 0,
      },
      progress,
    }
  } catch (error) {
    primaryError = error
  } finally {
    const contained = await containCredentials(state, deps, progress)
    if (!contained && !primaryError) {
      primaryError = new ProfitabilityBestcleanPostmigrationError('CLEANUP_INCOMPLETE', {
        cleanupIncomplete: true,
      })
    } else if (!contained && primaryError) {
      primaryError.cleanupIncomplete = true
    }
    try { await deps.close?.() } catch {
      if (!primaryError) {
        primaryError = new ProfitabilityBestcleanPostmigrationError('DEPENDENCY_CLOSE_FAILED', {
          cleanupIncomplete: true,
        })
      } else primaryError.cleanupIncomplete = true
    }
  }
  if (primaryError) {
    primaryError.progress = safeProgress(progress)
    primaryError.persistentChange = persistentChange || primaryError.persistentChange === true
    throw primaryError
  }
  result.progress = safeProgress(progress)
  return result
}

function safeFailureReport(error) {
  const candidate = text(error?.code || error?.message)
  return {
    ok: false,
    error: /^[A-Z0-9_]{3,160}$/.test(candidate) ? candidate : 'POSTMIGRATION_APPLY_FAILED',
    cleanupIncomplete: error?.cleanupIncomplete === true,
    persistentChange: error?.persistentChange === true,
    progress: safeProgress(error?.progress || newProgress()),
  }
}

module.exports = {
  ACCESS_ACTIVATION_REASON,
  CATALOG_FINGERPRINT_SCHEMA_VERSION,
  CATALOG_VERIFICATION_SCHEMA_VERSION,
  EXPECTED,
  EXPECTED_WORKERS,
  FINANCIAL_SCHEMA_VERSION,
  ProfitabilityBestcleanPostmigrationError,
  assertCatalogVerification,
  assertNotCancelled,
  buildBestcleanAccessManifest,
  catalogVerificationFromResult,
  containCredentials,
  inspectEnvironment,
  parseArguments,
  readBestcleanWorkerBindings,
  resolveOptions,
  runApply,
  runAudit,
  runFinancialMarker,
  safeFailureReport,
  validateEnvironmentSnapshot,
  workerBindingFingerprint,
}
