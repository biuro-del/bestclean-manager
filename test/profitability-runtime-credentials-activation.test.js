'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  EXPECTED,
  parseArguments,
  resolveOptions,
  runApply,
  runAudit,
  safeFailureReport,
  validateEnvironmentSnapshot,
} = require('../scripts/lib/profitability-runtime-credentials-activation')
const { main } = require('../scripts/activate-profitability-runtime-credentials-production')

const HEAD = 'a'.repeat(40)

function options(mode = 'apply') {
  return {
    mode,
    project: EXPECTED.project,
    instance: EXPECTED.instance,
    region: EXPECTED.region,
    database: EXPECTED.database,
    backupId: EXPECTED.backupId,
    expectedHead: mode === 'apply' ? HEAD : '',
    confirmation: mode === 'apply' ? EXPECTED.confirmation : '',
  }
}

function snapshot(overrides = {}) {
  const base = {
    source: { head: HEAD, clean: true, remoteContainsHead: true },
    cloud: {
      project: EXPECTED.project,
      instance: EXPECTED.instance,
      region: EXPECTED.region,
      state: 'RUNNABLE',
      backup: { id: EXPECTED.backupId, status: 'SUCCESSFUL' },
      gates: { allDisabled: true, allowlistCount: 0 },
    },
    database: {
      database: EXPECTED.database,
      pgMajor: 17,
      primary: true,
      readWrite: true,
      foundationExact: true,
      foundationStatus: 'exact',
      roleGraphExact: true,
      accessProfile: { status: 'verification_required' },
      financialModel: { status: 'verification_required' },
      runtimeCredentialRolesExact: true,
      runtimeCredentialVerified: false,
      runtimeSchemaMarkersExact: false,
    },
    identity: {
      serviceAccount: EXPECTED.runtimeServiceAccount,
      exists: true,
      disabled: false,
      projectBroadSecretAccess: false,
      effectiveProjectSecretAccess: 'CANNOT_ACCESS',
      secretAccessAnalysisExact: true,
      inheritedSecretAccess: false,
    },
    secret: {
      exists: false,
      managedExact: false,
      accessorExact: false,
      accessorAbsent: true,
      appHostingPolicyExact: false,
      appHostingPolicyAbsent: true,
      latestVersionName: null,
      latestVersionState: null,
    },
  }
  return {
    ...base,
    ...overrides,
    source: { ...base.source, ...(overrides.source || {}) },
    cloud: { ...base.cloud, ...(overrides.cloud || {}) },
    database: { ...base.database, ...(overrides.database || {}) },
    identity: { ...base.identity, ...(overrides.identity || {}) },
    secret: { ...base.secret, ...(overrides.secret || {}) },
  }
}

function fakeDependencies({
  ambiguousUpdate = false,
  ambiguousWithoutOperation = false,
  failPostflight = false,
  failContainment = false,
  payloadMismatch = false,
  settleTerminal = true,
} = {}) {
  const events = []
  const state = {
    accessor: false,
    secretExists: false,
    latestVersionName: null,
    latestVersionState: null,
    passwordUpdates: 0,
    versionDestroyed: false,
    secretPayloadText: null,
  }
  const random = Buffer.alloc(48, 7)
  const previousPolicy = { version: 3, etag: 'before', bindings: [] }
  const deps = {
    events,
    random,
    state,
    environment: {
      async inspect(_runOptions, probe = {}) {
        events.push(probe.credentialPassword ? 'postflight' : 'preflight')
        const postflight = Boolean(probe.credentialPassword)
        return snapshot({
          database: {
            runtimeCredentialVerified: postflight,
            runtimeSchemaMarkersExact: postflight,
          },
          secret: state.secretExists
            ? {
              exists: true,
              managedExact: true,
              accessorExact: postflight && !failPostflight ? state.accessor : false,
              accessorAbsent: !state.accessor,
              appHostingPolicyExact: postflight && !failPostflight ? state.accessor : false,
              appHostingPolicyAbsent: !state.accessor,
              latestVersionName: state.latestVersionName,
              latestVersionState: state.latestVersionState,
            }
            : {},
        })
      },
    },
    secretManager: {
      async ensureContainer() {
        events.push('secret:create')
        state.secretExists = true
        return { created: true, name: `projects/${EXPECTED.project}/secrets/${EXPECTED.secretId}` }
      },
      async addVersion({ payload }) {
        events.push('secret:add-version')
        assert.equal(Buffer.isBuffer(payload), true)
        state.secretPayloadText = payload.toString('utf8')
        state.latestVersionName = `projects/${EXPECTED.project}/secrets/${EXPECTED.secretId}/versions/1`
        state.latestVersionState = 'ENABLED'
        return { name: state.latestVersionName, state: 'ENABLED' }
      },
      async verifyVersionPayload({ expectedPayload }) {
        events.push('secret:verify-version')
        return !payloadMismatch
          && expectedPayload.toString('utf8') === state.secretPayloadText
      },
      async getPolicy() {
        events.push('secret:get-policy')
        return previousPolicy
      },
      policyHasExactAppHostingSecretPolicy() { return false },
      async setExactAppHostingSecretPolicy() {
        events.push('secret:set-accessor')
        state.accessor = true
      },
      async removeRuntimeAccessor() {
        events.push('cleanup:remove-accessor')
        state.accessor = false
        if (failContainment) throw new Error('restore failed')
      },
      async destroyVersion() {
        events.push('cleanup:destroy-version')
        state.versionDestroyed = true
        state.latestVersionState = 'DESTROYED'
      },
      async disableVersion() { events.push('cleanup:disable-version') },
      async inspect() {
        events.push('cleanup:inspect-secret')
        return {
          accessorExact: state.accessor,
          appHostingPolicyExact: state.accessor,
        }
      },
    },
    cloudSqlAdmin: {
      async updateRuntimePassword({ containment }) {
        events.push(containment ? 'cleanup:rotate-password' : 'database:update-password')
        state.passwordUpdates += 1
        if (ambiguousUpdate && !containment) {
          const error = new Error('CLOUD_SQL_PASSWORD_UPDATE_AMBIGUOUS')
          if (!ambiguousWithoutOperation) {
            error.cloudSqlOperation = { name: 'operation-1', status: 'PENDING' }
          }
          throw error
        }
      },
      async settleRuntimePasswordUpdate() {
        events.push('cleanup:settle-password-update')
        return { terminal: settleTerminal, succeeded: settleTerminal }
      },
    },
    databaseAdmin: {
      async verifyRuntimeCredential() {
        events.push('database:probe')
        return {
          sessionRole: EXPECTED.sessionRole,
          assumedRole: EXPECTED.runtimeRole,
          maySetRuntimeRole: true,
          runtimeSchemaMarkersExact: true,
        }
      },
      async verifyPasswordRejected() {
        events.push('cleanup:password-rejected')
        return true
      },
    },
    async randomSecret() {
      events.push('random')
      return random
    },
    async close() { events.push('close') },
  }
  return deps
}

test('CLI rejects every secret-bearing argument and requires exact apply confirmation', () => {
  assert.throws(() => parseArguments(['--password', 'unsafe']), /SECRET_ARGUMENT_FORBIDDEN/)
  assert.throws(() => parseArguments(['--secret=value']), /SECRET_ARGUMENT_FORBIDDEN/)
  assert.throws(
    () => resolveOptions(['--apply', '--expected-head', HEAD, '--confirmation', 'wrong']),
    /CONFIRMATION_MISMATCH/,
  )
  assert.equal(resolveOptions([
    '--apply', '--expected-head', HEAD, '--confirmation', EXPECTED.confirmation,
  ]).mode, 'apply')
})

test('preflight fails closed for active gates, broad IAM, or a conflicting secret', () => {
  assert.throws(
    () => validateEnvironmentSnapshot(snapshot({
      cloud: { gates: { allDisabled: false, allowlistCount: 1 } },
    }), options(), { applying: true }),
    /PROFITABILITY_RUNTIME_GATES_MUST_REMAIN_OFF/,
  )
  assert.throws(
    () => validateEnvironmentSnapshot(snapshot({
      identity: { projectBroadSecretAccess: true },
    }), options(), { applying: true }),
    /RUNTIME_SERVICE_ACCOUNT_HAS_BROAD_SECRET_ACCESS/,
  )
  assert.throws(
    () => validateEnvironmentSnapshot(snapshot({
      identity: {
        secretAccessAnalysisExact: false,
        effectiveProjectSecretAccess: 'UNKNOWN_INFO',
      },
    }), options(), { applying: true }),
    /RUNTIME_SECRET_ACCESS_ANALYSIS_INCOMPLETE/,
  )
  assert.throws(
    () => validateEnvironmentSnapshot(snapshot({
      secret: { exists: true, managedExact: false, accessorAbsent: true },
    }), options(), { applying: true }),
    /SECRET_CONTAINER_CONFLICT/,
  )
  assert.throws(
    () => validateEnvironmentSnapshot(snapshot({
      secret: {
        exists: true,
        managedExact: true,
        accessorExact: true,
        accessorAbsent: false,
        appHostingPolicyExact: false,
        appHostingPolicyAbsent: false,
      },
    }), options(), { applying: true }),
    /SECRET_ACCESS_POLICY_CONFLICT/,
  )
})

test('audit is read-only and does not expose secret material', async () => {
  const deps = fakeDependencies()
  const result = await runAudit(options('audit'), deps)
  assert.equal(result.ok, true)
  assert.equal(result.mode, 'audit')
  assert.equal(result.secret.id, EXPECTED.secretId)
  assert.deepEqual(deps.events, ['preflight'])
  assert.equal(JSON.stringify(result).includes(deps.random.toString('base64url')), false)
})

test('apply creates an inaccessible version, verifies DB and SET ROLE, then grants exact IAM', async () => {
  const deps = fakeDependencies()
  const rawSecret = deps.random.toString('base64url')
  const result = await runApply(options(), deps)

  assert.equal(result.ok, true)
  assert.equal(result.secretVersion, '1')
  assert.equal(JSON.stringify(result).includes(rawSecret), false)
  assert.equal(deps.state.secretPayloadText, rawSecret)
  assert.equal(deps.random.every((byte) => byte === 0), true)
  assert.deepEqual(deps.events, [
    'preflight',
    'random',
    'secret:create',
    'secret:add-version',
    'secret:verify-version',
    'database:update-password',
    'database:probe',
    'secret:get-policy',
    'secret:set-accessor',
    'postflight',
    'close',
  ])
})

test('a failed postflight revokes IAM, destroys the version and invalidates the delivered password', async () => {
  const deps = fakeDependencies({ failPostflight: true })
  const rawSecret = deps.random.toString('base64url')
  let failure
  try {
    await runApply(options(), deps)
  } catch (error) {
    failure = error
  }
  const report = safeFailureReport(failure)
  assert.equal(report.ok, false)
  assert.equal(report.cleanupIncomplete, false)
  assert.equal(report.persistentChange, true)
  assert.equal(JSON.stringify(report).includes(rawSecret), false)
  assert.equal(deps.state.accessor, false)
  assert.equal(deps.state.versionDestroyed, true)
  assert.equal(deps.state.passwordUpdates, 2)
  assert.ok(deps.events.indexOf('cleanup:remove-accessor') < deps.events.indexOf('cleanup:destroy-version'))
  assert.ok(deps.events.includes('cleanup:rotate-password'))
  assert.ok(deps.events.includes('cleanup:password-rejected'))
})

test('containment failure is reported without leaking the credential', async () => {
  const deps = fakeDependencies({ failPostflight: true, failContainment: true })
  let failure
  try {
    await runApply(options(), deps)
  } catch (error) {
    failure = error
  }
  const report = safeFailureReport(failure)
  assert.equal(report.cleanupIncomplete, true)
  assert.equal(report.progress.cleanup, 'incomplete')
})

test('ambiguous Cloud SQL password update settles before fail-closed rotation', async () => {
  const deps = fakeDependencies({ ambiguousUpdate: true })
  let failure
  try {
    await runApply(options(), deps)
  } catch (error) {
    failure = error
  }
  const report = safeFailureReport(failure)
  assert.equal(report.cleanupIncomplete, false)
  assert.ok(
    deps.events.indexOf('cleanup:settle-password-update')
      < deps.events.indexOf('cleanup:rotate-password'),
  )
  assert.equal(deps.state.passwordUpdates, 2)
})

test('an unsettled Cloud SQL update never races a containment rotation', async () => {
  const deps = fakeDependencies({ ambiguousUpdate: true, settleTerminal: false })
  let failure
  try {
    await runApply(options(), deps)
  } catch (error) {
    failure = error
  }
  const report = safeFailureReport(failure)
  assert.equal(report.cleanupIncomplete, true)
  assert.equal(deps.events.includes('cleanup:rotate-password'), false)
})

test('an ambiguous Cloud SQL update without operation id remains fail-closed and never rotates', async () => {
  const deps = fakeDependencies({ ambiguousUpdate: true, ambiguousWithoutOperation: true })
  let failure
  try {
    await runApply(options(), deps)
  } catch (error) {
    failure = error
  }
  const report = safeFailureReport(failure)
  assert.equal(report.cleanupIncomplete, true)
  assert.equal(deps.events.includes('cleanup:settle-password-update'), false)
  assert.equal(deps.events.includes('cleanup:rotate-password'), false)
  assert.equal(deps.state.passwordUpdates, 1)
})

test('a stored secret payload mismatch fails before changing the database password', async () => {
  const deps = fakeDependencies({ payloadMismatch: true })
  let failure
  try {
    await runApply(options(), deps)
  } catch (error) {
    failure = error
  }
  const report = safeFailureReport(failure)
  assert.equal(report.error, 'SECRET_VERSION_PAYLOAD_MISMATCH')
  assert.equal(deps.state.passwordUpdates, 0)
  assert.equal(deps.state.versionDestroyed, true)
})

test('CLI prints only the safe report', async () => {
  const deps = fakeDependencies()
  let output = ''
  let errors = ''
  const exitCode = await main({
    argv: [
      '--apply', '--expected-head', HEAD, '--confirmation', EXPECTED.confirmation,
    ],
    deps,
    stdout: { write(value) { output += value } },
    stderr: { write(value) { errors += value } },
  })
  assert.equal(exitCode, 0)
  assert.equal(errors, '')
  assert.equal(JSON.parse(output).ok, true)
  assert.doesNotMatch(output, /BwcHBwcH/)
})
