'use strict'

const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const test = require('node:test')

const {
  EXPECTED,
  createCancellation,
  parseArguments,
  resolveOptions,
  runApply,
  runAudit,
  safeFailureReport,
} = require('../scripts/apply-profitability-access-v21-production')

const HEAD = 'a'.repeat(40)

function options() {
  return {
    mode: 'apply',
    project: EXPECTED.project,
    instance: EXPECTED.instance,
    region: EXPECTED.region,
    database: EXPECTED.database,
    backupId: EXPECTED.backupId,
    expectedHead: HEAD,
    confirmation: EXPECTED.confirmation,
  }
}

function fakeDeps(config = {}) {
  const events = []
  const secrets = []
  let references = config.references || 'repairable'
  let access = config.access || 'absent'
  let financial = config.financial || 'absent'
  let provisionerActive = false
  let executorActive = false
  let proxyPrepared = false
  let cloudInspections = 0

  const source = () => ({
    head: config.head || HEAD,
    clean: config.clean !== false,
    remote: config.remote || EXPECTED.remote,
    remoteUrl: config.remoteUrl || EXPECTED.remoteUrl,
    remoteContainsHead: config.remoteContainsHead !== false,
  })
  const cloud = () => ({
    project: EXPECTED.project,
    instance: EXPECTED.instance,
    region: EXPECTED.region,
    runtimeRegion: config.runtimeRegion || EXPECTED.runtimeRegion,
    runtimeService: config.runtimeService || EXPECTED.runtimeService,
    state: 'RUNNABLE',
    backup: {
      id: config.backupId || EXPECTED.backupId,
      status: config.backupStatus || 'SUCCESSFUL',
    },
    gates: {
      allDisabled: config.gatesDisabled !== false,
      allowlistCount: config.allowlistCount || 0,
    },
  })
  const database = ({ verified = false } = {}) => {
    const visibleAccess = config.unverifiedExisting && !verified
      ? 'verification_required'
      : access
    const visibleFinancial = config.unverifiedExisting && !verified
      ? 'verification_required'
      : financial
    return {
      database: EXPECTED.database,
      iamDatabaseUser: config.iamDatabaseUser || EXPECTED.iamDatabaseUser,
      pgMajor: 17,
      primary: true,
      readWrite: true,
      foundationExact: config.foundationPostflightFails && verified
        ? false
        : config.foundationVerificationRequired ? verified : true,
      foundationStatus: config.foundationPostflightFails && verified
        ? 'partial'
        : config.foundationVerificationRequired && !verified
          ? 'verification_required'
          : 'exact',
      roleGraphExact: true,
      accessSourceReferences: { status: references },
      accessProfile: {
        status: visibleAccess,
        seedRowCount: visibleAccess === 'exact' || visibleAccess === 'absent' ? 0 : null,
      },
      financialModel: {
        status: visibleFinancial,
        seedRowCount: visibleFinancial === 'exact' || visibleFinancial === 'absent' ? 0 : null,
      },
    }
  }

  const provisionerSession = {
    async activateExecutor() {
      events.push('activate-executor')
      executorActive = true
      if (config.executorActivationAmbiguous) throw new Error('LOST_EXECUTOR_RESPONSE')
    },
    async lockExecutor() {
      events.push('lock-executor')
      if (config.executorLockAmbiguous) {
        executorActive = false
        throw new Error('LOST_LOCK_RESPONSE')
      }
      if (config.executorLockFails) throw new Error('LOCK_FAILED')
      executorActive = false
    },
    async lockSelf() {
      events.push('lock-provisioner')
      if (config.provisionerLockAmbiguous) {
        provisionerActive = false
        throw new Error('LOST_LOCK_RESPONSE')
      }
      if (config.provisionerLockFails) throw new Error('LOCK_FAILED')
      provisionerActive = false
      if (config.dropTargetsAfterLock) {
        access = 'absent'
        financial = 'absent'
      }
    },
    async close() { events.push('close-provisioner') },
  }

  return {
    events,
    secrets,
    sourceControl: {
      async inspect() { events.push('inspect-source'); return source() },
    },
    cloudSqlAdmin: {
      async inspect() {
        events.push('inspect-cloud')
        cloudInspections += 1
        const snapshot = cloud()
        if (config.enableGatesAfterInitialAudit && cloudInspections > 1) {
          snapshot.gates.allDisabled = false
        }
        return snapshot
      },
      async activateProvisioner() {
        events.push('activate-provisioner')
        provisionerActive = config.provisionerActivationEffect !== false
        if (config.provisionerActivationAmbiguous) {
          const error = new Error('AMBIGUOUS')
          if (config.provisionerOperationName) {
            error.cloudSqlOperation = {
              name: config.provisionerOperationName,
              status: 'PENDING',
            }
          }
          throw error
        }
      },
      async settleProvisionerActivation() {
        events.push('settle-provisioner')
        return config.provisionerSettlement || {
          terminal: true,
          succeeded: provisionerActive,
          operationName: config.provisionerOperationName,
        }
      },
    },
    databaseAdmin: {
      async audit({ executorPassword } = {}) {
        events.push(executorPassword === undefined
          ? 'inspect-database'
          : 'inspect-database-authenticated')
        return database({ verified: executorPassword !== undefined })
      },
      async inspectAccessSourceReferences() {
        events.push('inspect-source-references')
        return { status: references }
      },
      async grantAccessSourceReferences() {
        events.push('grant-source-references')
        references = 'exact'
        if (config.referenceGrantAmbiguous) throw new Error('LOST_GRANT_RESPONSE')
      },
      async openProvisioner({ containment = false } = {}) {
        events.push(containment ? 'open-provisioner-containment' : 'open-provisioner')
        if (!provisionerActive || config.openProvisionerFails) {
          throw new Error('LOGIN_REJECTED')
        }
        return provisionerSession
      },
      async verifyPasswordAccepted({ role }) {
        events.push(`accepted:${role}`)
        return role === EXPECTED.provisioner ? provisionerActive : executorActive
      },
      async verifyPasswordRejected({ role }) {
        events.push(`rejected:${role}`)
        return role === EXPECTED.provisioner ? !provisionerActive : !executorActive
      },
      async inspectAccessProfile() {
        events.push('inspect-access')
        return {
          status: access,
          seedRowCount: access === 'exact' ? 0 : access === 'absent' ? 0 : null,
        }
      },
      async inspectFinancialModel() {
        events.push('inspect-financial')
        return {
          status: financial,
          seedRowCount: financial === 'exact' ? 0 : financial === 'absent' ? 0 : null,
        }
      },
    },
    psqlRunner: {
      async prepare() { events.push('proxy-prepare'); proxyPrepared = true },
      async runAccessProfile() {
        events.push('run-access')
        config.onRunAccess?.()
        access = config.accessApplyPartial ? 'partial' : 'exact'
        if (config.accessApplyFails || config.accessApplyPartial || config.onRunAccess) {
          throw new Error('ACCESS_FAILED')
        }
      },
      async runFinancialModel() {
        events.push('run-financial')
        financial = 'exact'
        if (config.financialApplyFails) throw new Error('FINANCIAL_FAILED')
      },
      async close() { events.push('proxy-close'); proxyPrepared = false },
    },
    randomSecret() {
      const secret = Buffer.alloc(48, secrets.length + 65)
      secrets.push(secret)
      events.push('random-secret')
      return secret
    },
    getState() {
      return { references, access, financial, provisionerActive, executorActive, proxyPrepared }
    },
  }
}

test('CLI is audit-only by default and rejects secret-bearing arguments', () => {
  assert.deepEqual(parseArguments([]), { mode: 'audit' })
  assert.equal(resolveOptions([]).mode, 'audit')
  for (const argument of [
    '--password=x', '--secret=x', '--database-url=x', '--access-token=x',
  ]) {
    assert.throws(() => parseArguments([argument]), /SECRET_ARGUMENT_FORBIDDEN/)
  }
})

test('audit verifies the pinned successful backup and all runtime gates OFF', async () => {
  const deps = fakeDeps({ references: 'exact', access: 'exact', financial: 'exact' })
  const snapshot = await runAudit({ ...options(), expectedHead: HEAD }, deps)
  assert.equal(snapshot.cloud.backup.id, EXPECTED.backupId)
  assert.equal(snapshot.cloud.gates.allDisabled, true)

  const wrongBackup = fakeDeps({ backupId: 'wrong' })
  await assert.rejects(runAudit(options(), wrongBackup), /BACKUP_NOT_SUCCESSFUL/)
  const enabled = fakeDeps({ gatesDisabled: false })
  await assert.rejects(runAudit(options(), enabled), /PROFITABILITY_GATES_MUST_REMAIN_OFF/)
})

test('audit refuses runtime service, IAM identity and git remote drift', async () => {
  for (const config of [
    { runtimeRegion: 'us-central1' },
    { runtimeService: 'other-service' },
    { iamDatabaseUser: 'other@example.com' },
    { remote: 'origin' },
    { remoteUrl: 'https://github.com/example/other.git' },
  ]) {
    await assert.rejects(runAudit(options(), fakeDeps(config)), /MISMATCH/)
  }
})

test('IAM Foundation shape is verification-required and apply runs full authenticated postflight before Access', async () => {
  const deps = fakeDeps({ foundationVerificationRequired: true })
  const audit = await runAudit(options(), deps)
  assert.equal(audit.database.foundationExact, false)
  assert.equal(audit.database.foundationStatus, 'verification_required')

  const result = await runApply(options(), deps)
  assert.equal(result.ok, true)
  const authenticated = deps.events.indexOf('inspect-database-authenticated')
  assert.ok(authenticated > deps.events.indexOf('activate-executor'))
  assert.ok(authenticated < deps.events.indexOf('grant-source-references'))
  assert.ok(authenticated < deps.events.indexOf('run-access'))
})

test('apply blocks all Access mutations when authenticated Foundation postflight is not exact', async () => {
  const deps = fakeDeps({
    foundationVerificationRequired: true,
    foundationPostflightFails: true,
  })
  await assert.rejects(runApply(options(), deps), /FOUNDATION_STATE_INVALID/)
  assert.equal(deps.events.includes('grant-source-references'), false)
  assert.equal(deps.events.includes('run-access'), false)
  assert.equal(deps.getState().provisionerActive, false)
  assert.equal(deps.getState().executorActive, false)
})

test('exact Access and V2.1 is a credential-free no-op', async () => {
  const deps = fakeDeps({ references: 'exact', access: 'exact', financial: 'exact' })
  const result = await runApply(options(), deps)
  assert.deepEqual(result, { ok: true, mode: 'apply', changed: false })
  assert.equal(deps.events.includes('proxy-prepare'), false)
  assert.equal(deps.events.includes('activate-provisioner'), false)
  assert.equal(deps.secrets.length, 0)
})

test('an IAM-only audit reports exact relation shape as verification-required and apply verifies it with the executor', async () => {
  const deps = fakeDeps({
    references: 'exact',
    access: 'exact',
    financial: 'exact',
    unverifiedExisting: true,
  })
  const audit = await runAudit(options(), deps)
  assert.equal(audit.database.accessProfile.status, 'verification_required')
  assert.equal(audit.database.financialModel.status, 'verification_required')

  const result = await runApply(options(), deps)
  assert.deepEqual(result, { ok: true, mode: 'apply', changed: false })
  assert.equal(deps.events.includes('inspect-database-authenticated'), true)
  assert.equal(deps.events.includes('run-access'), false)
  assert.equal(deps.events.includes('run-financial'), false)
  assert.equal(deps.events.includes('proxy-prepare'), false)
  assert.equal(deps.getState().provisionerActive, false)
  assert.equal(deps.getState().executorActive, false)
})

test('repairing only source REFERENCES is reported as a persistent change', async () => {
  const deps = fakeDeps({ access: 'exact', financial: 'exact' })
  const result = await runApply(options(), deps)
  assert.deepEqual(result, { ok: true, mode: 'apply', changed: true })
  assert.equal(deps.events.includes('inspect-database-authenticated'), true)
  assert.equal(deps.events.includes('activate-provisioner'), true)
})

test('happy path grants only the missing source reference, applies Access before V2.1 and revokes both passwords', async () => {
  const deps = fakeDeps()
  const result = await runApply(options(), deps)
  assert.deepEqual(result, { ok: true, mode: 'apply', changed: true })
  const index = (event) => deps.events.indexOf(event)
  assert.ok(index('activate-provisioner') < index('activate-executor'))
  assert.ok(index('activate-executor') < index('inspect-database-authenticated'))
  assert.ok(index('inspect-database-authenticated') < index('grant-source-references'))
  assert.ok(index('run-access') < index('run-financial'))
  assert.ok(index('run-financial') < index('lock-executor'))
  assert.ok(index('lock-executor') < index('lock-provisioner'))
  assert.equal(deps.events.includes(`rejected:${EXPECTED.executor}`), true)
  assert.equal(deps.events.includes(`rejected:${EXPECTED.provisioner}`), true)
  assert.deepEqual(deps.getState(), {
    references: 'exact',
    access: 'exact',
    financial: 'exact',
    provisionerActive: false,
    executorActive: false,
    proxyPrepared: false,
  })
  assert.equal(deps.secrets.length, 2)
  assert.equal(deps.secrets.every((secret) => secret.every((byte) => byte === 0)), true)
})

test('ambiguous users.update with no operation id proceeds only after an exact fresh login', async () => {
  const deps = fakeDeps({ provisionerActivationAmbiguous: true })
  const result = await runApply(options(), deps)
  assert.equal(result.ok, true)
  assert.equal(deps.events.includes('settle-provisioner'), false)
  assert.equal(deps.events.includes('open-provisioner'), true)
  assert.equal(deps.getState().provisionerActive, false)
})

test('lost PASSWORD NULL responses are accepted only after fresh exact-password rejection probes', async () => {
  const deps = fakeDeps({
    executorLockAmbiguous: true,
    provisionerLockAmbiguous: true,
  })
  const result = await runApply(options(), deps)
  assert.equal(result.ok, true)
  assert.equal(deps.events.includes(`rejected:${EXPECTED.executor}`), true)
  assert.equal(deps.events.includes(`rejected:${EXPECTED.provisioner}`), true)
  assert.equal(deps.getState().executorActive, false)
  assert.equal(deps.getState().provisionerActive, false)
})

test('a failed PASSWORD NULL command without an independently rejected credential fails cleanup closed', async () => {
  const deps = fakeDeps({ executorLockFails: true })
  let failure
  try {
    await runApply(options(), deps)
  } catch (error) {
    failure = error
  }

  assert.equal(failure?.code, 'EXECUTOR_PASSWORD_NOT_NULL')
  assert.equal(failure?.cleanupIncomplete, true)
  assert.equal(deps.events.includes(`rejected:${EXPECTED.executor}`), true)
  assert.equal(deps.events.includes('lock-provisioner'), true)
  assert.equal(deps.secrets.every((secret) => secret.every((byte) => byte === 0)), true)
})

test('post-containment audit refuses target relations disappearing after the exact fingerprint', async () => {
  const deps = fakeDeps({ dropTargetsAfterLock: true })
  await assert.rejects(
    runApply(options(), deps),
    /MIGRATION_RELATIONS_CHANGED_AFTER_POSTFLIGHT/,
  )
  assert.equal(deps.getState().provisionerActive, false)
  assert.equal(deps.getState().executorActive, false)
})

test('unknown users.update without operation id and without accepted login fails cleanup-unknown', async () => {
  const deps = fakeDeps({
    provisionerActivationAmbiguous: true,
    provisionerActivationEffect: false,
  })
  let failure
  try {
    await runApply(options(), deps)
  } catch (error) {
    failure = error
  }
  assert.equal(failure?.code, 'PROVISIONER_ACTIVATION_STATE_UNKNOWN')
  assert.equal(failure?.cleanupIncomplete, true)
  assert.equal(deps.events.includes('run-access'), false)
  assert.equal(deps.secrets.every((secret) => secret.every((byte) => byte === 0)), true)
})

test('known terminal failed users.update must prove fresh rejection before stopping', async () => {
  const deps = fakeDeps({
    provisionerActivationAmbiguous: true,
    provisionerActivationEffect: false,
    provisionerOperationName: 'operation-1',
    provisionerSettlement: {
      terminal: true,
      succeeded: false,
      operationName: 'operation-1',
    },
  })
  await assert.rejects(runApply(options(), deps), /PROVISIONER_ACTIVATION_FAILED/)
  assert.equal(deps.events.includes('settle-provisioner'), true)
  assert.equal(deps.events.includes(`rejected:${EXPECTED.provisioner}`), true)
})

test('partial Access result fails closed, never starts V2.1 and still contains credentials', async () => {
  const deps = fakeDeps({ accessApplyPartial: true })
  let failure
  try {
    await runApply(options(), deps)
  } catch (error) {
    failure = error
  }
  assert.equal(failure?.code, 'ACCESS_PROFILE_V2_STATE_REQUIRES_REVIEW')
  assert.equal(deps.events.includes('run-financial'), false)
  assert.equal(deps.getState().provisionerActive, false)
  assert.equal(deps.getState().executorActive, false)
  assert.equal(failure.cleanupIncomplete, false)
  const report = safeFailureReport(failure)
  assert.equal(report.changed, true)
  assert.equal(report.manualReviewRequired, true)
  assert.equal(report.reauditRequired, true)
  assert.equal(report.completedStages.includes('source_references_granted'), true)
  assert.equal(report.completedStages.includes('credentials_contained'), true)
  assert.equal(JSON.stringify(report).includes('AAAA'), false)
})

test('dirty or unpushed source fails before every mutation', async () => {
  for (const config of [{ clean: false }, { remoteContainsHead: false }]) {
    const deps = fakeDeps(config)
    await assert.rejects(runApply(options(), deps))
    assert.equal(deps.events.includes('grant-source-references'), false)
    assert.equal(deps.events.includes('activate-provisioner'), false)
  }
})

test('runtime gates are rechecked and stop a mutation if they change after the initial audit', async () => {
  const deps = fakeDeps({ enableGatesAfterInitialAudit: true })
  await assert.rejects(runApply(options(), deps), /PROFITABILITY_GATES_MUST_REMAIN_OFF/)
  assert.equal(deps.events.includes('grant-source-references'), false)
  assert.equal(deps.events.includes('activate-provisioner'), false)
})

test('SIGINT/SIGTERM guard aborts mutation entrypoints and is removable for cleanup', async () => {
  const processRef = new EventEmitter()
  const cancellation = createCancellation(processRef)
  processRef.emit('SIGTERM')
  assert.equal(cancellation.signal.aborted, true)

  const deps = fakeDeps()
  await assert.rejects(
    runApply(options(), deps, { cancellation }),
    /APPLY_CANCELLED/,
  )
  assert.equal(deps.events.includes('grant-source-references'), false)
  cancellation.dispose()
  assert.equal(processRef.listenerCount('SIGINT'), 0)
  assert.equal(processRef.listenerCount('SIGTERM'), 0)
})

test('cancellation during a database operation fails closed and uses fresh containment cleanup', async () => {
  const processRef = new EventEmitter()
  const cancellation = createCancellation(processRef)
  const deps = fakeDeps({
    onRunAccess() { processRef.emit('SIGINT') },
  })

  let failure
  try {
    await runApply(options(), deps, { cancellation })
  } catch (error) {
    failure = error
  } finally {
    cancellation.dispose()
  }

  assert.equal(failure?.code, 'APPLY_CANCELLED')
  assert.equal(deps.events.includes('open-provisioner-containment'), true)
  assert.equal(deps.events.includes(`rejected:${EXPECTED.executor}`), true)
  assert.equal(deps.events.includes(`rejected:${EXPECTED.provisioner}`), true)
  assert.equal(deps.getState().executorActive, false)
  assert.equal(deps.getState().provisionerActive, false)
  assert.equal(deps.secrets.every((secret) => secret.every((byte) => byte === 0)), true)
  const report = safeFailureReport(failure)
  assert.equal(report.changed, true)
  assert.equal(report.manualReviewRequired, true)
  assert.equal(report.reauditRequired, true)
  assert.equal(report.completedStages.includes('credentials_contained'), true)
})

test('safe failure report never serializes raw error details or generated secrets', () => {
  const secret = 'TOP_SECRET_SENTINEL'
  const error = new Error(secret)
  error.code = 'SAFE_CODE'
  error.stack = `${secret}\nstack`
  const report = safeFailureReport(error)
  assert.deepEqual(report, {
    ok: false,
    error: 'SAFE_CODE',
    cleanupIncomplete: false,
    changed: false,
    completedStages: [],
    manualReviewRequired: false,
    reauditRequired: false,
  })
  assert.equal(JSON.stringify(report).includes(secret), false)
})
