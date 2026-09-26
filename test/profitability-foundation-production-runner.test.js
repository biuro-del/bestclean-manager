'use strict'

const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const test = require('node:test')

const {
  EXPECTED,
  classifyMigrationOutcome,
  classifyRolesOutcome,
  classifySourceReferenceOutcome,
  createCancellationController,
  installTerminationGuard,
  main,
  parseArguments,
  resolveOptions,
  runApply,
  runAudit,
  safeFailureReport,
} = require('../scripts/apply-profitability-foundation-v2-production')

const HEAD = 'a'.repeat(40)

function auditSnapshot() {
  return {
    source: { head: HEAD, clean: true, remoteContainsHead: true },
    cloud: {
      project: EXPECTED.project,
      instance: EXPECTED.instance,
      region: EXPECTED.region,
      state: 'RUNNABLE',
      backup: { id: EXPECTED.backupId, status: 'SUCCESSFUL' },
      pgAuthidSelectRoleEnabled: false,
    },
    database: {
      database: EXPECTED.database,
      pgMajor: EXPECTED.pgMajor,
      primary: true,
      readWrite: true,
      bootstrapGrantor: EXPECTED.bootstrapGrantor,
      databaseOwner: EXPECTED.databaseOwner,
      schemaOwner: EXPECTED.schemaOwner,
      extension: {
        name: EXPECTED.extensionName,
        version: EXPECTED.extensionVersion,
        schema: EXPECTED.extensionSchema,
      },
      featureEnabled: false,
      allowlistCount: 0,
      targetRoleCount: 0,
      targetRelationCount: 0,
    },
  }
}

function applyOptions() {
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

function fakeDeps({
  failAt,
  ambiguousAt,
  cleanupFailAt,
  executorLockResults = [],
  executorVerificationResults = [],
} = {}) {
  const events = []
  const secrets = []
  const snapshot = auditSnapshot()
  let users = []
  let roleState = { exact: false, roleCount: 0, membershipCount: 0 }
  let migrationState = { exact: false, relationCount: 0, rowCount: 0 }
  let sourceReferenceState = {
    exact: false,
    absent: true,
    roleExists: false,
    ownersExact: true,
    tableAclCount: 0,
    columnAclCount: 0,
  }
  let provisionerNull = false
  let executorNull = false
  const maybeFail = (name) => {
    events.push(name)
    if (failAt === name) throw new Error('SENTINEL_SECRET_SHOULD_NEVER_BE_PRINTED')
  }
  const provisionerSession = {
    async activateExecutor() {
      events.push('activate-executor')
      executorNull = false
      if (ambiguousAt === 'activate-executor') throw new Error('LOST_RESPONSE_AFTER_COMMIT')
      if (failAt === 'activate-executor') throw new Error('SENTINEL_SECRET_SHOULD_NEVER_BE_PRINTED')
    },
    async lockExecutor() {
      events.push('lock-executor')
      if (executorLockResults.length > 0) {
        const result = executorLockResults.shift()
        if (result instanceof Error) throw result
      }
      if (cleanupFailAt === 'lock-executor') throw new Error('CLEANUP_FAILED')
      executorNull = true
    },
    async lockSelf() {
      events.push('lock-provisioner')
      if (cleanupFailAt === 'lock-provisioner') throw new Error('CLEANUP_FAILED')
      provisionerNull = true
    },
    async close() {
      events.push('close-provisioner')
      if (cleanupFailAt === 'close-provisioner') throw new Error('CLEANUP_FAILED')
    },
  }
  const bootstrapSession = {
    async createRestrictedProvisioner() {
      events.push('create-provisioner')
      provisionerNull = false
      if (ambiguousAt === 'create-provisioner') throw new Error('LOST_RESPONSE_AFTER_COMMIT')
      if (failAt === 'create-provisioner') throw new Error('SENTINEL_SECRET_SHOULD_NEVER_BE_PRINTED')
    },
    async grantDatabaseConnectOption() { maybeFail('grant-database') },
    async lockProvisioner() {
      events.push('lock-provisioner')
      if (cleanupFailAt === 'lock-provisioner') throw new Error('CLEANUP_FAILED')
      provisionerNull = true
    },
    async close() {
      events.push('close-bootstrap')
      if (cleanupFailAt === 'close-bootstrap') throw new Error('CLEANUP_FAILED')
    },
  }
  return {
    events,
    secrets,
    sourceControl: { async inspect() { events.push('audit-source'); return snapshot.source } },
    cloudSqlAdmin: {
      async inspect() { events.push('audit-cloud'); return snapshot.cloud },
      async createBootstrap({ name }) {
        maybeFail('create-bootstrap')
        users = [{ name, type: 'BUILT_IN' }]
      },
      async listUsers() { events.push('list-users'); return users },
      async deleteBootstrap({ name }) {
        events.push('delete-bootstrap')
        if (cleanupFailAt === 'delete-bootstrap') throw new Error('CLEANUP_FAILED')
        users = users.filter((user) => user.name !== name)
      },
    },
    databaseAdmin: {
      async audit() { events.push('audit-database'); return snapshot.database },
      async openBootstrap() { maybeFail('open-bootstrap'); return bootstrapSession },
      async grantSchemaOptionsAsIamOwner() { maybeFail('grant-schema') },
      async verifyProvisionerHandoff() { maybeFail('verify-handoff'); return true },
      async openProvisioner() { maybeFail('open-provisioner'); return provisionerSession },
      async verifyBootstrapAbsent() { events.push('verify-bootstrap-absent'); return users.length === 0 },
      async inspectRoles() { events.push('inspect-roles'); return roleState },
      async grantOwnerSourceReferences() {
        events.push('grant-source-references')
        sourceReferenceState = {
          exact: true,
          absent: false,
          roleExists: true,
          ownersExact: true,
          tableAclCount: 0,
          columnAclCount: 9,
        }
        if (ambiguousAt === 'grant-source-references') throw new Error('LOST_RESPONSE')
        if (failAt === 'grant-source-references') {
          sourceReferenceState = {
            exact: false,
            absent: true,
            roleExists: true,
            ownersExact: true,
            tableAclCount: 0,
            columnAclCount: 0,
          }
          throw new Error('FAILED_BEFORE_COMMIT')
        }
      },
      async inspectOwnerSourceReferences() {
        events.push('inspect-source-references')
        return sourceReferenceState
      },
      async inspectMigration() { events.push('inspect-migration'); return migrationState },
      async verifyPasswordNull(role) {
        events.push(`password-null:${role}`)
        if (role === EXPECTED.executor && executorVerificationResults.length > 0) {
          const result = executorVerificationResults.shift()
          if (result instanceof Error) throw result
          return result
        }
        return role === EXPECTED.provisioner ? provisionerNull : executorNull
      },
      async postflight() {
        events.push('postflight')
        return {
          roles: roleState,
          migration: migrationState,
          sourceReferences: sourceReferenceState,
          bootstrapAbsent: users.length === 0,
          provisionerPasswordNull: provisionerNull,
          executorPasswordNull: executorNull,
          provisionerFreshLoginRejected: true,
          executorFreshLoginRejected: true,
          featureEnabled: false,
          allowlistCount: 0,
        }
      },
    },
    psqlRunner: {
      async prepare() {
        events.push('proxy-prepare')
        if (failAt === 'proxy-prepare') throw new Error('SENTINEL_PROXY_START_FAILURE')
        return { host: '127.0.0.1', port: 65431 }
      },
      async runRoles() {
        events.push('psql-roles')
        roleState = { exact: true, roleCount: 6, membershipCount: 8 }
        sourceReferenceState = { ...sourceReferenceState, roleExists: true }
        provisionerNull = true
        if (ambiguousAt === 'psql-roles') throw new Error('LOST_RESPONSE')
        if (failAt === 'psql-roles') {
          roleState = { exact: false, roleCount: 0, membershipCount: 0 }
          provisionerNull = false
          throw new Error('FAILED_BEFORE_COMMIT')
        }
      },
      async runMigration() {
        events.push('psql-migration')
        migrationState = { exact: true, relationCount: 10, rowCount: 0 }
        if (ambiguousAt === 'psql-migration') throw new Error('LOST_RESPONSE')
        if (failAt === 'psql-migration') {
          migrationState = { exact: false, relationCount: 0, rowCount: 0 }
          throw new Error('FAILED_BEFORE_COMMIT')
        }
      },
      async close() {
        events.push('proxy-close')
        if (cleanupFailAt === 'proxy-close') throw new Error('SENTINEL_PROXY_CLOSE_FAILURE')
      },
    },
    randomSecret() {
      events.push('random-secret')
      const secret = Buffer.alloc(32, 65)
      secrets.push(secret)
      return secret
    },
  }
}

test('CLI defaults to audit and rejects all secret-bearing arguments', () => {
  assert.deepEqual(parseArguments([]), { mode: 'audit' })
  assert.equal(resolveOptions([]).mode, 'audit')
  for (const argument of ['--password=x', '--access-token=x', '--database-url=x', '--uri=x']) {
    assert.throws(() => parseArguments([argument]), /SECRET_ARGUMENT_FORBIDDEN/)
  }
  assert.throws(() => parseArguments(['--project=https://credential@example.test']), /INVALID_ARGUMENT_VALUE/)
})

test('audit invokes read-only dependencies and never generates credentials', async () => {
  const deps = fakeDeps()
  const result = await runAudit({ ...applyOptions(), mode: 'audit' }, deps)
  assert.equal(result.database.targetRelationCount, 0)
  assert.deepEqual(deps.events.sort(), ['audit-cloud', 'audit-database', 'audit-source'])
})

test('apply guards fail before the first mutating call', async () => {
  const deps = fakeDeps()
  await assert.rejects(
    runApply({ ...applyOptions(), project: 'wrong-project' }, deps),
    /PROJECT_MISMATCH/,
  )
  assert.deepEqual(deps.events, [])

  const dirty = fakeDeps()
  dirty.sourceControl.inspect = async () => ({ ...auditSnapshot().source, clean: false })
  await assert.rejects(runApply(applyOptions(), dirty), /DIRTY_WORKTREE/)
  assert.equal(dirty.events.includes('random-secret'), false)
  assert.equal(dirty.events.includes('create-bootstrap'), false)
})

test('apply prepares the owned proxy after validated audit and before secrets or mutation', async () => {
  const deps = fakeDeps()
  await runApply(applyOptions(), deps)
  const position = (name) => deps.events.indexOf(name)
  assert.ok(position('audit-source') < position('proxy-prepare'))
  assert.ok(position('audit-cloud') < position('proxy-prepare'))
  assert.ok(position('audit-database') < position('proxy-prepare'))
  assert.ok(position('proxy-prepare') < position('random-secret'))
  assert.ok(position('random-secret') < position('create-bootstrap'))
  assert.ok(position('postflight') < position('proxy-close'))
  assert.equal(deps.events.filter((event) => event === 'proxy-prepare').length, 1)
  assert.equal(deps.events.filter((event) => event === 'proxy-close').length, 1)
})

test('proxy preparation failure closes the lifecycle before any secret or mutation', async () => {
  const deps = fakeDeps({ failAt: 'proxy-prepare' })
  let failure
  try {
    await runApply(applyOptions(), deps)
  } catch (error) {
    failure = error
  }
  assert.equal(failure?.code, 'PRODUCTION_APPLY_FAILED')
  assert.equal(failure?.cleanupIncomplete, false)
  assert.equal(deps.events.includes('proxy-close'), true)
  assert.equal(deps.events.includes('random-secret'), false)
  assert.equal(deps.events.includes('create-bootstrap'), false)
  assert.equal(deps.events.includes('create-provisioner'), false)
  assert.equal(deps.events.includes('psql-roles'), false)
})

test('SIGINT and SIGTERM are absorbed until asynchronous cleanup completes', async () => {
  const controller = createCancellationController()
  const fakeProcess = new EventEmitter()
  const remove = installTerminationGuard(controller, fakeProcess)
  fakeProcess.emit('SIGINT')
  fakeProcess.emit('SIGTERM')
  assert.equal(controller.requested, true)
  assert.equal(controller.signal, 'SIGINT')
  assert.equal(controller.exitCode, 130)
  assert.equal(fakeProcess.listenerCount('SIGINT'), 1)
  remove()
  assert.equal(fakeProcess.listenerCount('SIGINT'), 0)
  assert.equal(fakeProcess.listenerCount('SIGTERM'), 0)
})

test('an interrupt after bootstrap creation cleans it up before returning', async () => {
  const deps = fakeDeps()
  const cancellation = createCancellationController()
  const createBootstrap = deps.cloudSqlAdmin.createBootstrap
  deps.cloudSqlAdmin.createBootstrap = async (options) => {
    await createBootstrap(options)
    cancellation.request('SIGINT')
  }
  await assert.rejects(
    runApply(applyOptions(), deps, { cancellation }),
    /PRODUCTION_APPLY_INTERRUPTED/,
  )
  assert.equal(deps.events.includes('delete-bootstrap'), true)
  assert.equal(deps.events.includes('create-provisioner'), false)
})

test('happy path deletes bootstrap before role provisioning and locks both credentials', async () => {
  const deps = fakeDeps()
  const result = await runApply(applyOptions(), deps)
  assert.equal(result.ok, true)
  const position = (name) => deps.events.indexOf(name)
  assert.ok(position('create-bootstrap') < position('create-provisioner'))
  assert.ok(position('grant-database') < position('grant-schema'))
  assert.ok(position('close-bootstrap') < position('delete-bootstrap'))
  assert.ok(position('delete-bootstrap') < position('psql-roles'))
  assert.ok(position('psql-roles') < position('grant-source-references'))
  assert.ok(position('grant-source-references') < position('activate-executor'))
  assert.ok(position('activate-executor') < position('psql-migration'))
  assert.ok(position('psql-migration') < position('postflight'))
  assert.ok(position('postflight') < position('lock-executor'))
  assert.ok(position('postflight') < position('proxy-close'))
  assert.equal(deps.events.includes('lock-provisioner'), false)
})

test('runner reconciles the exact generated PostgreSQL bootstrap user with omitted type and host', async () => {
  const deps = fakeDeps()
  const listUsers = deps.cloudSqlAdmin.listUsers
  deps.cloudSqlAdmin.listUsers = async (runOptions) => (
    (await listUsers(runOptions)).map((user) => ({
      ...user,
      type: null,
      host: '',
    }))
  )

  const result = await runApply(applyOptions(), deps)
  assert.equal(result.ok, true)
  assert.equal(deps.events.includes('delete-bootstrap'), true)
  assert.equal(deps.events.includes('psql-roles'), true)
  assert.equal(deps.events.includes('psql-migration'), true)
})

test('failure performs credential containment and safe report never leaks raw errors', async () => {
  const deps = fakeDeps({ failAt: 'grant-schema' })
  let failure
  try {
    await runApply(applyOptions(), deps)
  } catch (error) {
    failure = error
  }
  assert.ok(failure)
  assert.equal(deps.events.includes('lock-provisioner'), true)
  assert.equal(deps.events.includes('delete-bootstrap'), true)
  assert.equal(deps.secrets.every((secret) => secret.every((byte) => byte === 0)), true)
  const serialized = JSON.stringify(safeFailureReport(failure))
  assert.doesNotMatch(serialized, /SENTINEL_SECRET/)
})

test('late bootstrap user from unresolved CREATE stays cleanup-incomplete and blocks migration', async () => {
  const deps = fakeDeps()
  let bootstrapName = null
  let lateUserVisible = false
  deps.cloudSqlAdmin.createBootstrap = async ({ name }) => {
    deps.events.push('create-bootstrap')
    bootstrapName = name
    const error = new Error('control plane timeout')
    error.cloudSqlOperation = { name: 'late-bootstrap-create-op', status: 'PENDING' }
    throw error
  }
  deps.cloudSqlAdmin.settleBootstrapCreate = async ({ name, operationName }) => {
    deps.events.push('settle-bootstrap-create')
    assert.equal(name, bootstrapName)
    assert.equal(operationName, 'late-bootstrap-create-op')
    // CREATE remains pending after bounded reconciliation. The user is still
    // absent at cleanup time, but may materialize after the runner returns.
    return {
      operationName,
      status: 'PENDING',
      terminal: false,
      succeeded: false,
      effectConfirmed: false,
    }
  }
  deps.cloudSqlAdmin.listUsers = async () => (
    lateUserVisible ? [{ name: bootstrapName, type: 'BUILT_IN' }] : []
  )

  let failure
  try {
    await runApply(applyOptions(), deps)
  } catch (error) {
    failure = error
  }
  assert.equal(failure?.code, 'PRODUCTION_APPLY_FAILED')
  assert.equal(failure?.cleanupIncomplete, true)
  lateUserVisible = true
  assert.equal(lateUserVisible, true)
  assert.equal((await deps.cloudSqlAdmin.listUsers()).length, 1)
  assert.equal(deps.events.includes('delete-bootstrap'), false)
  assert.equal(deps.events.includes('psql-roles'), false)
  assert.equal(deps.events.includes('psql-migration'), false)
})

test('source is rechecked immediately before each irreversible mutation', async () => {
  const beforeRoles = fakeDeps()
  let sourceReads = 0
  beforeRoles.sourceControl.inspect = async () => {
    beforeRoles.events.push('audit-source')
    sourceReads += 1
    return sourceReads === 2
      ? { ...auditSnapshot().source, clean: false }
      : auditSnapshot().source
  }
  await assert.rejects(runApply(applyOptions(), beforeRoles), /WORKTREE_CHANGED_DURING_APPLY/)
  assert.equal(beforeRoles.events.includes('psql-roles'), false)
  assert.equal(beforeRoles.events.includes('psql-migration'), false)

  const beforeReferences = fakeDeps()
  sourceReads = 0
  beforeReferences.sourceControl.inspect = async () => {
    beforeReferences.events.push('audit-source')
    sourceReads += 1
    return sourceReads === 3
      ? { ...auditSnapshot().source, head: 'b'.repeat(40), remoteContainsHead: false }
      : auditSnapshot().source
  }
  await assert.rejects(runApply(applyOptions(), beforeReferences), /HEAD_CHANGED_DURING_APPLY/)
  assert.equal(beforeReferences.events.includes('psql-roles'), true)
  assert.equal(beforeReferences.events.includes('grant-source-references'), false)
  assert.equal(beforeReferences.events.includes('activate-executor'), false)
  assert.equal(beforeReferences.events.includes('psql-migration'), false)

  const beforeMigration = fakeDeps()
  sourceReads = 0
  beforeMigration.sourceControl.inspect = async () => {
    beforeMigration.events.push('audit-source')
    sourceReads += 1
    return sourceReads === 4
      ? { ...auditSnapshot().source, head: 'b'.repeat(40), remoteContainsHead: false }
      : auditSnapshot().source
  }
  await assert.rejects(runApply(applyOptions(), beforeMigration), /HEAD_CHANGED_DURING_APPLY/)
  assert.equal(beforeMigration.events.includes('grant-source-references'), true)
  assert.equal(beforeMigration.events.includes('activate-executor'), true)
  assert.equal(beforeMigration.events.includes('psql-migration'), false)
  assert.equal(beforeMigration.events.includes('lock-executor'), true)
})

test('cleanup failures are reported without exposing the original error', async () => {
  const deps = fakeDeps({ failAt: 'grant-schema', cleanupFailAt: 'lock-provisioner' })
  let failure
  try {
    await runApply(applyOptions(), deps)
  } catch (error) {
    failure = error
  }
  assert.ok(failure)
  assert.equal(failure.cleanupIncomplete, true)
  assert.deepEqual(safeFailureReport(failure), {
    ok: false,
    error: 'PRODUCTION_APPLY_FAILED',
    cleanupIncomplete: true,
  })
  assert.equal(deps.secrets.every((secret) => secret.every((byte) => byte === 0)), true)
  assert.equal(deps.events.includes('proxy-close'), true)
})

test('proxy stop failure fails a successful apply and marks a failed apply cleanup incomplete', async () => {
  const successful = fakeDeps({ cleanupFailAt: 'proxy-close' })
  await assert.rejects(
    runApply(applyOptions(), successful),
    (error) => {
      assert.equal(error.code, 'CLEANUP_INCOMPLETE')
      assert.equal(error.cleanupIncomplete, true)
      return true
    },
  )
  assert.equal(successful.events.includes('postflight'), true)
  assert.equal(successful.events.includes('proxy-close'), true)

  const failed = fakeDeps({ failAt: 'grant-schema', cleanupFailAt: 'proxy-close' })
  let failure
  try {
    await runApply(applyOptions(), failed)
  } catch (error) {
    failure = error
  }
  assert.equal(failure?.code, 'PRODUCTION_APPLY_FAILED')
  assert.equal(failure?.cleanupIncomplete, true)
  assert.deepEqual(safeFailureReport(failure), {
    ok: false,
    error: 'PRODUCTION_APPLY_FAILED',
    cleanupIncomplete: true,
  })
  assert.equal(failed.events.includes('lock-provisioner'), true)
  assert.equal(failed.events.includes('delete-bootstrap'), true)
  assert.equal(failed.events.includes('proxy-close'), true)
  assert.doesNotMatch(JSON.stringify(safeFailureReport(failure)), /SENTINEL/)
})

test('ambiguous credential writes are contained even when the mutating call throws', async () => {
  const provisioner = fakeDeps({ ambiguousAt: 'create-provisioner' })
  await assert.rejects(runApply(applyOptions(), provisioner), /PRODUCTION_APPLY_FAILED/)
  assert.equal(provisioner.events.includes('lock-provisioner'), true)
  assert.equal(provisioner.events.includes(`password-null:${EXPECTED.provisioner}`), true)
  assert.equal(provisioner.events.includes('delete-bootstrap'), true)

  const executor = fakeDeps({ ambiguousAt: 'activate-executor' })
  await assert.rejects(runApply(applyOptions(), executor), /PRODUCTION_APPLY_FAILED/)
  assert.equal(executor.events.includes('lock-executor'), true)
  assert.equal(executor.events.includes(`password-null:${EXPECTED.executor}`), true)
})

test('executor lock is retried when the independent credential probe returns false or errors', async () => {
  for (const rejectedProbe of [false, new Error('FRESH_LOGIN_PROBE_FAILED')]) {
    const deps = fakeDeps({ executorVerificationResults: [rejectedProbe, true] })
    let failure
    try {
      await runApply(applyOptions(), deps)
    } catch (error) {
      failure = error
    }

    assert.equal(failure?.code, 'EXECUTOR_PASSWORD_NOT_NULL')
    assert.equal(failure?.cleanupIncomplete, false)
    assert.equal(deps.events.filter((event) => event === 'lock-executor').length, 2)
    assert.equal(
      deps.events.filter((event) => event === `password-null:${EXPECTED.executor}`).length,
      2,
    )
    assert.equal(deps.events.includes('postflight'), true)
  }
})

test('executor containment stays fail-closed when the verification retry cannot prove lock', async () => {
  const deps = fakeDeps({
    executorLockResults: [true, new Error('CLEANUP_LOCK_FAILED')],
    executorVerificationResults: [false, new Error('FRESH_LOGIN_PROBE_FAILED')],
  })
  let failure
  try {
    await runApply(applyOptions(), deps)
  } catch (error) {
    failure = error
  }

  assert.equal(failure?.code, 'EXECUTOR_PASSWORD_NOT_NULL')
  assert.equal(failure?.cleanupIncomplete, true)
  assert.deepEqual(safeFailureReport(failure), {
    ok: false,
    error: 'EXECUTOR_PASSWORD_NOT_NULL',
    cleanupIncomplete: true,
  })
  assert.equal(deps.events.filter((event) => event === 'lock-executor').length, 2)
  assert.equal(
    deps.events.filter((event) => event === `password-null:${EXPECTED.executor}`).length,
    2,
  )
})

test('interrupt requested during executor lock is observed only after lock verification', async () => {
  const deps = fakeDeps()
  const cancellation = createCancellationController()
  const originalLockExecutor = deps.databaseAdmin.openProvisioner
  deps.databaseAdmin.openProvisioner = async (...args) => {
    const session = await originalLockExecutor(...args)
    const lockExecutor = session.lockExecutor
    session.lockExecutor = async (options) => {
      await lockExecutor(options)
      cancellation.request('SIGTERM')
    }
    return session
  }

  await assert.rejects(
    runApply(applyOptions(), deps, { cancellation }),
    /PRODUCTION_APPLY_INTERRUPTED/,
  )
  const lockPosition = deps.events.indexOf('lock-executor')
  const verifyPosition = deps.events.indexOf(`password-null:${EXPECTED.executor}`, lockPosition)
  assert.ok(lockPosition >= 0)
  assert.ok(verifyPosition > lockPosition)
  assert.equal(deps.events.filter((event) => event === 'lock-executor').length, 1)
})

test('ambiguous catalog mutations are reconciled without a blind retry', async () => {
  for (const ambiguousAt of ['psql-roles', 'grant-source-references', 'psql-migration']) {
    const deps = fakeDeps({ ambiguousAt })
    const result = await runApply(applyOptions(), deps)
    assert.equal(result.ok, true)
    assert.equal(deps.events.filter((event) => event === ambiguousAt).length, 1)
  }
})

test('outcome classifiers distinguish complete, absent and partial states', () => {
  assert.equal(classifyRolesOutcome({ exact: true, roleCount: 6, membershipCount: 8 }), 'complete')
  assert.equal(classifyRolesOutcome({ exact: false, roleCount: 0, membershipCount: 0 }), 'absent')
  assert.equal(classifyRolesOutcome({ exact: false, roleCount: 2, membershipCount: 1 }), 'partial')
  assert.equal(classifyMigrationOutcome({ exact: true, relationCount: 10, rowCount: 0 }), 'complete')
  assert.equal(classifyMigrationOutcome({ exact: false, relationCount: 0, rowCount: 0 }), 'absent')
  assert.equal(classifyMigrationOutcome({ exact: false, relationCount: 4, rowCount: 0 }), 'partial')
  assert.equal(classifySourceReferenceOutcome({ exact: true, tableAclCount: 0, columnAclCount: 9 }), 'complete')
  assert.equal(classifySourceReferenceOutcome({ absent: true, tableAclCount: 0, columnAclCount: 0 }), 'absent')
  assert.equal(classifySourceReferenceOutcome({ exact: false, tableAclCount: 0, columnAclCount: 3 }), 'partial')
})

test('main audit output is allowlisted and excludes adapter errors or secrets', async () => {
  const deps = fakeDeps()
  deps.close = async () => { deps.events.push('close-dependencies') }
  let stdout = ''
  let stderr = ''
  const exitCode = await main({
    argv: [],
    deps,
    stdout: { write(chunk) { stdout += chunk } },
    stderr: { write(chunk) { stderr += chunk } },
  })
  assert.equal(exitCode, 0)
  assert.equal(stderr, '')
  assert.equal(deps.events.includes('close-dependencies'), true)
  assert.match(stdout, /"mode":"audit"/)
  assert.doesNotMatch(stdout, /password|credential|SENTINEL/i)
})
