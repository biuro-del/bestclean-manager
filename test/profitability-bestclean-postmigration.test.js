'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const {
  ACCESS_ACTIVATION_REASON,
  CATALOG_FINGERPRINT_SCHEMA_VERSION,
  CATALOG_VERIFICATION_SCHEMA_VERSION,
  EXPECTED,
  EXPECTED_WORKERS,
  ProfitabilityBestcleanPostmigrationError,
  buildBestcleanAccessManifest,
  parseArguments,
  readBestcleanWorkerBindings,
  resolveOptions,
  runApply,
  runAudit,
  runFinancialMarker,
  safeFailureReport,
  validateEnvironmentSnapshot,
} = require('../scripts/lib/profitability-bestclean-postmigration')
const {
  IAM_SOURCE_READER,
  SOURCE_OWNER,
  assertConnectionIdentity,
  assumeSourceOwner,
  inspectSourceReadBridge,
} = require('../scripts/lib/profitability-bestclean-postmigration-adapters')
const {
  manifestSha256: accessManifestSha256,
  markerReason: accessMarkerReason,
  normalizeManifest: normalizeAccessManifest,
} = require('../scripts/lib/profitability-access-v2-provisioning')
const {
  catalogFingerprintFromSourceRows,
  catalogFingerprintSha256,
  profitabilityActivationLockKey,
} = require('../scripts/lib/profitability-service-object-catalog-seed')
const { main } = require('../scripts/apply-profitability-bestclean-postmigration')

const HEAD = '1'.repeat(40)
const ACCESS_SHA = 'b'.repeat(64)

function catalogSourceRows() {
  return Array.from({ length: 79 }, (_, index) => {
    const suffix = String(index + 1).padStart(3, '0')
    return {
      org_id: EXPECTED.orgId,
      client_id: `CLIENT-${suffix}`,
      name: `Client ${suffix}`,
      address: null,
      city: null,
      postal_code: null,
      status: 'AKTYWNY',
    }
  })
}

function catalogTargetRows(sourceRows = catalogSourceRows()) {
  return sourceRows.map((row) => ({
    org_id: row.org_id,
    object_id: row.client_id,
    client_id: row.client_id,
    name: row.name,
    status: 'ACTIVE',
    archived_at: null,
  }))
}

const CATALOG_SHA = catalogFingerprintSha256(
  catalogFingerprintFromSourceRows(EXPECTED.orgId, catalogSourceRows()),
)

function options(mode = 'apply') {
  return {
    mode,
    project: EXPECTED.project,
    instance: EXPECTED.instance,
    region: EXPECTED.region,
    database: EXPECTED.database,
    backupId: EXPECTED.backupId,
    orgId: EXPECTED.orgId,
    expectedHead: mode === 'apply' ? HEAD : '',
    confirmation: mode === 'apply' ? EXPECTED.confirmation : '',
  }
}

function snapshot({ authenticated = false } = {}) {
  return {
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
      foundationExact: authenticated,
      foundationStatus: authenticated ? 'exact' : 'verification_required',
      roleGraphExact: true,
      accessSourceReferences: { status: 'exact' },
      sourceReadBridge: { status: 'exact' },
      accessProfile: { status: authenticated ? 'exact' : 'verification_required' },
      financialModel: { status: authenticated ? 'exact' : 'verification_required' },
    },
  }
}

function workerRows() {
  return [
    { worker_id: 'W001', uid: 'uid-owner', role: 'OWNER', status: 'ACTIVE' },
    { worker_id: 'W002', uid: 'uid-marta', role: 'ADMIN', status: 'ACTIVE' },
    { worker_id: 'W003', uid: 'uid-szymon', role: 'ADMIN', status: 'ACTIVE' },
    { worker_id: 'W005', uid: 'uid-sabina', role: 'ADMIN', status: 'ACTIVE' },
  ]
}

class SourceClient {
  constructor(rows = workerRows(), events = []) {
    this.rows = rows
    this.events = events
  }

  async query(sql, params) {
    this.events.push('source:read-bindings')
    assert.match(String(sql), /from public\.organization_member/)
    assert.doesNotMatch(String(sql), /\bname\b|\bemail\b/i)
    assert.deepEqual(params, ['bestclean', ['W001', 'W002', 'W003', 'W005']])
    return { rows: this.rows.map((row) => ({ ...row })) }
  }

  async end() {
    this.events.push('source:end')
  }
}

class TargetClient {
  constructor(events = []) {
    this.events = events
  }

  async end() {
    this.events.push('target:end')
  }

  async query(sql) {
    if (String(sql) === 'alter role profitability_migration_executor password null') {
      this.events.push('cleanup:executor-self-password-null')
      return { rows: [] }
    }
    throw new Error('Unexpected target query')
  }
}

function catalogVerification() {
  return {
    schemaVersion: CATALOG_VERIFICATION_SCHEMA_VERSION,
    fingerprintSchemaVersion: CATALOG_FINGERPRINT_SCHEMA_VERSION,
    orgId: 'bestclean',
    fingerprintSha256: CATALOG_SHA,
    exact: true,
    counts: { activeSourceClients: 79, serviceObjects: 79 },
  }
}

function fakeDependencies({
  failCatalogApply = false,
  failAccessApply = false,
  abortOnCatalogAudit = null,
  failProvisionerExecutorLock = false,
} = {}) {
  const events = []
  const state = {
    catalogExact: false,
    accessExact: false,
    activated: false,
    financial: false,
  }
  const sourceClient = new SourceClient(workerRows(), events)
  const targetClient = new TargetClient(events)
  const deps = {
    events,
    environment: {
      async inspect(runOptions, { executorPassword } = {}) {
        events.push(`guard:${executorPassword === undefined ? 'iam' : 'executor'}`)
        return snapshot({ authenticated: executorPassword !== undefined })
      },
    },
    connections: {
      async openSourceReader() {
        events.push('source:open:iam')
        return sourceClient
      },
      async openTargetExecutor() {
        events.push('target:open:executor')
        return targetClient
      },
    },
    credentials: {
      async activateProvisioner() { events.push('mutate:provisioner-password') },
      async openProvisioner() {
        events.push('provisioner:open')
        return {
          async activateExecutor() { events.push('mutate:executor-password') },
          async lockExecutor() {
            events.push('cleanup:executor-password-null')
            if (failProvisionerExecutorLock) throw new Error('LOCK_FAILED')
          },
          async lockSelf() { events.push('cleanup:provisioner-password-null') },
          async close() { events.push('provisioner:close') },
        }
      },
      async verifyPasswordAccepted() { return true },
      async verifyPasswordRejected({ role }) {
        if (role === EXPECTED.executor && failProvisionerExecutorLock) {
          if (events.includes('cleanup:executor-self-password-null')) return true
          return false
        }
        return true
      },
    },
    checks: {
      async accessSchema() {},
      async financialSchema() {},
    },
    operations: {
      async catalog(input) {
        events.push(`${input.mode === 'apply' ? 'mutate' : 'read'}:catalog:${input.mode}`)
        if (input.mode === 'audit') abortOnCatalogAudit?.abort()
        if (input.mode === 'apply' && failCatalogApply) throw new Error('CATALOG_FAILED')
        if (input.mode === 'apply') state.catalogExact = true
        if (input.mode === 'verify') {
          return {
            exact: state.catalogExact,
            manifestSha256: CATALOG_SHA,
            catalogVerification: catalogVerification(),
            counts: { activeSourceClients: 79, serviceObjects: 79 },
          }
        }
        return { exact: state.catalogExact, manifestSha256: CATALOG_SHA, changed: input.mode === 'apply' }
      },
      async provisioning(input) {
        events.push(`${['apply', 'activate'].includes(input.mode) ? 'mutate' : 'read'}:access:${input.mode}`)
        assert.equal(input.catalogVerification.fingerprintSha256, CATALOG_SHA)
        if (input.mode === 'apply' && failAccessApply) throw new Error('ACCESS_FAILED')
        if (input.mode === 'apply') state.accessExact = true
        if (input.mode === 'activate') state.activated = true
        return {
          exact: state.accessExact,
          activated: state.activated,
          changed: ['apply', 'activate'].includes(input.mode),
          manifestSha256: ACCESS_SHA,
        }
      },
      async financialMarker(input) {
        events.push(`${input.mode === 'apply' ? 'mutate' : 'read'}:financial:${input.mode}`)
        assert.equal(input.sourceClient, sourceClient)
        assert.equal(input.accessManifest.profiles.length, 4)
        assert.equal(input.catalogVerification.fingerprintSha256, CATALOG_SHA)
        assert.equal(input.accessSchemaCheck, deps.checks.accessSchema)
        assert.equal(input.financialSchemaCheck, deps.checks.financialSchema)
        if (input.mode === 'apply') state.financial = true
        return { exact: state.financial, changed: input.mode === 'apply' }
      },
    },
    randomSecret: (() => {
      let call = 0
      return () => Buffer.alloc(48, ++call)
    })(),
    async close() { events.push('deps:close') },
  }
  return deps
}

test('CLI is audit-only by default and rejects secret-bearing arguments', () => {
  assert.deepEqual(parseArguments([]), { mode: 'audit' })
  assert.equal(resolveOptions([]).mode, 'audit')
  assert.throws(() => parseArguments(['--password=x']), { code: 'SECRET_ARGUMENT_FORBIDDEN' })
  assert.throws(() => resolveOptions(['--apply']), { code: 'EXPECTED_HEAD_INVALID' })
  assert.throws(() => resolveOptions([
    '--apply', '--expected-head', HEAD, '--confirmation', 'WRONG',
  ]), { code: 'CONFIRMATION_MISMATCH' })
})

test('environment preflight fails closed on gates, backup, dirty tree and partial schema', () => {
  const base = snapshot()
  assert.equal(validateEnvironmentSnapshot(base, options('audit')), base)
  assert.equal(base.database.foundationExact, false)
  assert.equal(base.database.foundationStatus, 'verification_required')
  assert.throws(() => validateEnvironmentSnapshot(base, {
    ...options('audit'),
    backupId: '1790505049270',
  }), { code: 'BACKUP_REFERENCE_MISMATCH' })
  assert.throws(() => validateEnvironmentSnapshot(base, {
    ...options('audit'),
    orgId: 'other-org',
  }), { code: 'ORG_NOT_ALLOWLISTED' })
  assert.throws(() => validateEnvironmentSnapshot({
    ...base,
    cloud: { ...base.cloud, gates: { allDisabled: false, allowlistCount: 1 } },
  }, options('audit')), { code: 'PROFITABILITY_GATES_MUST_REMAIN_OFF' })
  assert.throws(() => validateEnvironmentSnapshot({
    ...base,
    source: { ...base.source, clean: false },
  }, options(), { applying: true }), { code: 'DIRTY_WORKTREE' })
  assert.throws(() => validateEnvironmentSnapshot({
    ...base,
    database: { ...base.database, accessProfile: { status: 'partial' } },
  }, options('audit')), { code: 'ACCESS_PROFILE_V2_NOT_EXACT' })
  assert.throws(() => validateEnvironmentSnapshot({
    ...base,
    database: { ...base.database, foundationStatus: 'partial' },
  }, options('audit')), { code: 'FOUNDATION_STATE_INVALID' })
  assert.throws(() => validateEnvironmentSnapshot({
    ...base,
    database: { ...base.database, roleGraphExact: false },
  }, options('audit')), { code: 'FOUNDATION_STATE_INVALID' })
  const authenticatedFoundationUnverified = snapshot({ authenticated: true })
  authenticatedFoundationUnverified.database.foundationExact = false
  authenticatedFoundationUnverified.database.foundationStatus = 'verification_required'
  assert.throws(() => validateEnvironmentSnapshot(
    authenticatedFoundationUnverified,
    options(),
    { applying: true, authenticated: true },
  ), { code: 'FOUNDATION_STATE_INVALID' })
  const authenticatedTargetUnverified = snapshot({ authenticated: true })
  authenticatedTargetUnverified.database.accessProfile = { status: 'verification_required' }
  authenticatedTargetUnverified.database.financialModel = { status: 'verification_required' }
  assert.throws(() => validateEnvironmentSnapshot(authenticatedTargetUnverified, options(), {
    applying: true,
    authenticated: true,
  }), { code: 'ACCESS_PROFILE_V2_NOT_EXACT' })
})

test('stable worker ids resolve exact roles without names or emails', async () => {
  const client = new SourceClient()
  const resolved = await readBestcleanWorkerBindings(client)
  assert.equal(resolved.bindings.length, 4)
  assert.deepEqual(resolved.bindings.map((entry) => entry.workerId), ['W001', 'W002', 'W003', 'W005'])
  assert.match(resolved.fingerprint, /^[0-9a-f]{64}$/)

  await assert.rejects(
    readBestcleanWorkerBindings(new SourceClient(workerRows().slice(0, 3))),
    { code: 'EXPECTED_WORKER_BINDINGS_NOT_EXACT' },
  )
  const wrong = workerRows()
  wrong[2] = { ...wrong[2], role: 'OWNER' }
  await assert.rejects(
    readBestcleanWorkerBindings(new SourceClient(wrong)),
    { code: 'EXPECTED_WORKER_MEMBERSHIP_MISMATCH' },
  )
})

test('Best Clean manifest contains only approved four profiles and no inferred coordinators', async () => {
  const resolved = await readBestcleanWorkerBindings(new SourceClient())
  const manifest = buildBestcleanAccessManifest(resolved, catalogVerification())
  assert.equal(manifest.authoritative, true)
  assert.equal(manifest.profiles.length, 4)
  assert.deepEqual(manifest.profiles.map((entry) => entry.expectedWorkerId), [
    'W001', 'W002', 'W003', 'W005',
  ])
  assert.ok(manifest.profiles.every((entry) => entry.assignments.length === 0))
  const byWorker = new Map(manifest.profiles.map((entry) => [entry.expectedWorkerId, entry]))
  assert.equal(byWorker.get('W001').profile.financeProfile, 'OWNER_FULL')
  assert.equal(byWorker.get('W005').profile.financeProfile, 'OWNER_FULL')
  assert.equal(byWorker.get('W002').profile.financeProfile, 'COST_CONTROL')
  assert.equal(byWorker.get('W002').profile.canEditOperationalCosts, true)
  assert.equal(byWorker.get('W003').profile.financeProfile, 'COST_CONTROL')
  assert.equal(byWorker.get('W003').profile.canEditOperationalCosts, false)
  assert.equal(EXPECTED_WORKERS.some((entry) => entry.operationalProfile === 'COORDINATOR'), false)
})

test('default audit reads through IAM and performs no mutation', async () => {
  const deps = fakeDependencies()
  const result = await runAudit(options('audit'), deps)
  assert.equal(result.mode, 'audit')
  assert.equal(result.sourceBindings.count, 4)
  assert.ok(deps.events.includes('source:open:iam'))
  assert.equal(deps.events.some((entry) => entry.startsWith('mutate:')), false)
})

test('apply is ordered, guarded before every mutation and cleans both passwords', async () => {
  const deps = fakeDependencies()
  const result = await runApply(options(), deps)
  assert.equal(result.ok, true)
  assert.equal(result.progress.cleanup, 'complete')
  assert.deepEqual(result.counts, { serviceObjects: 79, profiles: 4, inferredCoordinators: 0 })
  assert.ok(deps.events.indexOf('source:open:iam') < deps.events.indexOf('target:open:executor'))
  assert.ok(deps.events.indexOf('mutate:catalog:apply') < deps.events.indexOf('mutate:access:apply'))
  assert.ok(deps.events.indexOf('mutate:access:activate') < deps.events.indexOf('mutate:financial:apply'))
  for (let index = 0; index < deps.events.length; index += 1) {
    if (!deps.events[index].startsWith('mutate:')) continue
    assert.ok(deps.events.slice(0, index).some((entry) => entry.startsWith('guard:')))
  }
  assert.ok(deps.events.includes('cleanup:executor-password-null'))
  assert.ok(deps.events.includes('cleanup:provisioner-password-null'))
})

test('partial apply failure remains fail-closed and contains credentials', async () => {
  const deps = fakeDependencies({ failCatalogApply: true })
  await assert.rejects(runApply(options(), deps), (error) => {
    const report = safeFailureReport(error)
    assert.equal(report.ok, false)
    assert.equal(report.cleanupIncomplete, false)
    assert.equal(report.persistentChange, false)
    assert.equal(report.progress.cleanup, 'complete')
    assert.doesNotMatch(JSON.stringify(report), /uid-owner|uid-marta|uid-szymon|uid-sabina/)
    return true
  })
  assert.ok(deps.events.includes('cleanup:executor-password-null'))
  assert.ok(deps.events.includes('cleanup:provisioner-password-null'))
})

test('failure report marks already committed durable changes without exposing identifiers', async () => {
  const deps = fakeDependencies({ failAccessApply: true })
  await assert.rejects(runApply(options(), deps), (error) => {
    const report = safeFailureReport(error)
    assert.equal(report.persistentChange, true)
    assert.equal(report.progress.catalog, 'exact')
    assert.doesNotMatch(JSON.stringify(report), /uid-owner|uid-marta|uid-szymon|uid-sabina/)
    return true
  })
})

test('cancellation stops before the next mutation and still contains credentials', async () => {
  const controller = new AbortController()
  const deps = fakeDependencies({ abortOnCatalogAudit: controller })
  await assert.rejects(
    runApply(options(), deps, { signal: controller.signal }),
    { code: 'APPLY_CANCELLED' },
  )
  assert.equal(deps.events.includes('mutate:catalog:apply'), false)
  assert.ok(deps.events.includes('cleanup:executor-password-null'))
  assert.ok(deps.events.includes('cleanup:provisioner-password-null'))
})

test('credential containment self-locks executor if provisioner cleanup path fails', async () => {
  const deps = fakeDependencies({ failCatalogApply: true, failProvisionerExecutorLock: true })
  await assert.rejects(runApply(options(), deps), (error) => {
    assert.notEqual(error.cleanupIncomplete, true)
    return true
  })
  assert.ok(deps.events.includes('cleanup:executor-self-password-null'))
  assert.ok(deps.events.includes('cleanup:provisioner-password-null'))
})

function financialAccessManifest() {
  return normalizeAccessManifest(buildBestcleanAccessManifest({
    fingerprint: 'bindings-exact',
    bindings: workerRows().map((row) => ({
      workerId: row.worker_id,
      uid: row.uid,
      role: row.role,
      status: row.status,
    })),
  }, catalogVerification()))
}

function accessProfileRows(manifest) {
  return manifest.profiles.map((entry, index) => ({
    profile_id: `profile-${index + 1}`,
    uid: entry.uid,
    operational_profile: entry.profile.operationalProfile,
    object_scope: entry.profile.objectScope,
    worker_scope: entry.profile.workerScope,
    finance_profile: entry.profile.financeProfile,
    access_mode: entry.profile.accessMode,
    can_edit_operational_costs: entry.profile.canEditOperationalCosts,
    can_edit_contract_terms: entry.profile.canEditContractTerms,
    can_edit_profitability_targets: entry.profile.canEditProfitabilityTargets,
    can_view_worker_rates: entry.profile.canViewWorkerRates,
    can_edit_worker_rates: entry.profile.canEditWorkerRates,
    valid_from: '2026-01-01T00:00:00.000Z',
    valid_to: null,
    revoked_at: null,
  }))
}

class FinancialSourceClient {
  constructor({ staleCatalogOnFinal = false, staleMembershipOnFinal = false } = {}) {
    this.staleCatalogOnFinal = staleCatalogOnFinal
    this.staleMembershipOnFinal = staleMembershipOnFinal
    this.catalogReads = 0
    this.membershipReads = 0
    this.calls = []
  }

  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim()
    this.calls.push({ sql: normalized, params })
    if (/^(begin|rollback)/i.test(normalized)) return { rows: [] }
    if (normalized.includes('profitability-service-object-seed:source-clients')) {
      this.catalogReads += 1
      const rows = catalogSourceRows()
      if (this.staleCatalogOnFinal && this.catalogReads > 1) rows[0].name = 'Changed client'
      return { rows }
    }
    if (normalized.includes('profitability-access-v2:source-snapshot')) {
      return { rows: [{ snapshot_at: '2026-09-27T10:00:00.000Z' }] }
    }
    if (normalized.includes('profitability-access-v2:source-organization')) {
      return { rows: [{ org_id: EXPECTED.orgId }] }
    }
    if (normalized.includes('profitability-access-v2:source-memberships')) {
      this.membershipReads += 1
      const rows = workerRows().map((row) => ({ ...row, org_id: EXPECTED.orgId }))
      if (this.staleMembershipOnFinal && this.membershipReads > 1) rows[1].role = 'WORKER'
      return { rows }
    }
    throw new Error(`Unexpected source query: ${normalized}`)
  }
}

class FinancialClient {
  constructor({ existing = false, accessReason = null, staleAccessMarkerOnFinal = false } = {}) {
    this.existing = existing
    this.manifest = financialAccessManifest()
    this.accessReason = accessReason || accessMarkerReason(
      this.manifest,
      accessManifestSha256(this.manifest),
      catalogVerification(),
    )
    this.staleAccessMarkerOnFinal = staleAccessMarkerOnFinal
    this.markerReads = 0
    this.calls = []
  }

  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim()
    this.calls.push({ sql: normalized, params })
    if (/^(begin|set local role|commit|rollback)/i.test(normalized)
        || normalized.includes('activation-lock')) return { rows: [] }
    if (normalized.includes('profitability-service-object-seed:target-objects')) {
      return { rows: catalogTargetRows() }
    }
    if (normalized.includes('profitability-access-v2:authorization-active-objects')) {
      return { rows: catalogTargetRows().map((row) => ({ object_id: row.object_id })) }
    }
    if (normalized.includes('profitability-access-v2:profiles')) {
      return { rows: accessProfileRows(this.manifest) }
    }
    if (normalized.includes('profitability-access-v2:assignments')) return { rows: [] }
    if (normalized.includes('profitability-access-v2:marker')) {
      this.markerReads += 1
      const reason = this.staleAccessMarkerOnFinal && this.markerReads > 1
        ? `${this.accessReason} stale`
        : this.accessReason
      return { rows: [{
        org_id: EXPECTED.orgId,
        schema_version: 'v2',
        enforced_by_uid: 'uid-owner',
        reason,
      }] }
    }
    if (normalized.includes('from public.profitability_financial_model_enforcement')) {
      return { rows: this.existing
        ? [{ schema_version: 'v2.1', enforced_by_uid: 'uid-owner' }]
        : [] }
    }
    if (normalized.startsWith('insert into public.profitability_financial_model_enforcement')) {
      this.existing = true
      return { rows: [], rowCount: 1 }
    }
    throw new Error(`Unexpected target query: ${normalized}`)
  }
}

function financialMarkerInput({ sourceClient = new FinancialSourceClient(), targetClient = new FinancialClient(), orgId = EXPECTED.orgId } = {}) {
  return {
    targetClient,
    sourceClient,
    orgId,
    accessManifest: financialAccessManifest(),
    catalogVerification: catalogVerification(),
    mode: 'apply',
    accessSchemaCheck: async () => {},
    financialSchemaCheck: async () => {},
  }
}

test('financial marker revalidates exact catalog and access under the common activation lock', async () => {
  const sourceClient = new FinancialSourceClient()
  const targetClient = new FinancialClient()
  const result = await runFinancialMarker(financialMarkerInput({ sourceClient, targetClient }))
  assert.deepEqual(result, { exact: true, changed: true })
  assert.ok(targetClient.calls.some((call) => call.sql === 'commit'))
  const lock = targetClient.calls.find((call) => call.sql.includes('activation-lock'))
  assert.deepEqual(lock.params, [profitabilityActivationLockKey(EXPECTED.orgId)])

  await assert.rejects(runFinancialMarker(financialMarkerInput({
    targetClient: new FinancialClient({ accessReason: 'not-the-approved-marker' }),
  })), { code: 'ACCESS_ENFORCEMENT_MARKER_NOT_EXACT' })

  await assert.rejects(runFinancialMarker({
    ...financialMarkerInput(),
    orgId: 'other-org',
  }), { code: 'ORG_NOT_ALLOWLISTED' })
})

test('financial marker rolls back when the catalog becomes stale before final commit', async () => {
  const sourceClient = new FinancialSourceClient({ staleCatalogOnFinal: true })
  const targetClient = new FinancialClient()
  await assert.rejects(
    runFinancialMarker(financialMarkerInput({ sourceClient, targetClient })),
    { code: 'CATALOG_FINGERPRINT_MISMATCH' },
  )
  assert.equal(targetClient.calls.some((call) => call.sql === 'commit'), false)
  assert.ok(targetClient.calls.some((call) => call.sql === 'rollback'))
})

test('financial marker rolls back when access becomes stale before final commit', async () => {
  const sourceClient = new FinancialSourceClient()
  const targetClient = new FinancialClient({ staleAccessMarkerOnFinal: true })
  await assert.rejects(
    runFinancialMarker(financialMarkerInput({ sourceClient, targetClient })),
    { code: 'ACCESS_ENFORCEMENT_MARKER_NOT_EXACT' },
  )
  assert.equal(targetClient.calls.some((call) => call.sql === 'commit'), false)
  assert.ok(targetClient.calls.some((call) => call.sql === 'rollback'))

  const membershipSource = new FinancialSourceClient({ staleMembershipOnFinal: true })
  const membershipTarget = new FinancialClient()
  await assert.rejects(
    runFinancialMarker(financialMarkerInput({
      sourceClient: membershipSource,
      targetClient: membershipTarget,
    })),
    /MEMBERSHIP_STATE_MISMATCH/,
  )
  assert.equal(membershipTarget.calls.some((call) => call.sql === 'commit'), false)
  assert.ok(membershipTarget.calls.some((call) => call.sql === 'rollback'))
})

test('production adapter pins IAM source reader and owner-specific postflights', async () => {
  assert.equal(IAM_SOURCE_READER, 'biuro@bestclean.pl')
  const adapterSource = fs.readFileSync(path.join(
    __dirname,
    '..',
    'scripts',
    'lib',
    'profitability-bestclean-postmigration-adapters.js',
  ), 'utf8')
  assert.match(adapterSource, /connectIamAdmin/)
  assert.match(adapterSource, /set role "\$\{SOURCE_OWNER\}"/)
  assert.match(adapterSource, /postflights\.access/)
  assert.match(adapterSource, /postflights\.financial/)
  assert.doesNotMatch(adapterSource, /openSourceReader[\s\S]{0,500}profitability_provisioner/)

  await assertConnectionIdentity({
    async query() {
      return { rows: [{
        database_name: 'iclean-room-database',
        session_role: 'biuro@bestclean.pl',
        current_role: 'biuro@bestclean.pl',
        server_version_num: 170006,
        in_recovery: false,
        transaction_read_only: 'off',
      }] }
    },
  }, 'biuro@bestclean.pl')

  const handoffQueries = []
  await assumeSourceOwner({
    async query(sql, params) {
      handoffQueries.push({ sql: String(sql), params })
      if (handoffQueries.length === 1) {
        return { rows: [{
          session_role: IAM_SOURCE_READER,
          current_role: IAM_SOURCE_READER,
          may_set_source_owner: true,
        }] }
      }
      if (handoffQueries.length === 2) return { rows: [] }
      return { rows: [{ session_role: IAM_SOURCE_READER, current_role: SOURCE_OWNER }] }
    },
  })
  assert.deepEqual(handoffQueries[0].params, [SOURCE_OWNER])
  assert.equal(handoffQueries[1].sql, `set role "${SOURCE_OWNER}"`)

  await assert.rejects(assumeSourceOwner({
    async query() {
      return { rows: [{
        session_role: IAM_SOURCE_READER,
        current_role: IAM_SOURCE_READER,
        may_set_source_owner: false,
      }] }
    },
  }), /SOURCE_OWNER_HANDOFF_FORBIDDEN/)
})

test('source read bridge accepts only exact column-scoped runtime ACL evidence', async () => {
  let inspectedSql = ''
  const exact = await inspectSourceReadBridge({
    async query(sql) {
      inspectedSql = String(sql)
      return { rows: [{
        runtime_role_count: 1,
        source_relation_count: 3,
        required_column_count: 15,
        runtime_table_acl_count: 0,
        runtime_column_acl_count: 15,
        runtime_expected_acl_count: 15,
        runtime_excess_acl_count: 0,
        runtime_effective_table_privilege_count: 0,
        runtime_effective_expected_select_count: 15,
        runtime_effective_excess_column_privilege_count: 0,
        runtime_indirect_acl_count: 0,
      }] }
    },
  })
  assert.equal(exact.status, 'exact')
  assert.match(inspectedSql, /has_table_privilege\(/)
  assert.match(inspectedSql, /has_column_privilege\(/)
  assert.match(inspectedSql, /pg_has_role\(role_ids\.runtime_oid, indirect_acl\.grantee, 'USAGE'\)/)
  const broad = await inspectSourceReadBridge({
    async query() {
      return { rows: [{
        runtime_role_count: 1,
        source_relation_count: 3,
        required_column_count: 15,
        runtime_table_acl_count: 1,
        runtime_column_acl_count: 15,
        runtime_expected_acl_count: 15,
        runtime_excess_acl_count: 0,
        runtime_effective_table_privilege_count: 1,
        runtime_effective_expected_select_count: 15,
        runtime_effective_excess_column_privilege_count: 0,
        runtime_indirect_acl_count: 1,
      }] }
    },
  })
  assert.equal(broad.status, 'partial')

  const excessColumn = await inspectSourceReadBridge({
    async query() {
      return { rows: [{
        runtime_role_count: 1,
        source_relation_count: 3,
        required_column_count: 15,
        runtime_table_acl_count: 0,
        runtime_column_acl_count: 15,
        runtime_expected_acl_count: 15,
        runtime_excess_acl_count: 0,
        runtime_effective_table_privilege_count: 0,
        runtime_effective_expected_select_count: 15,
        runtime_effective_excess_column_privilege_count: 1,
        runtime_indirect_acl_count: 1,
      }] }
    },
  })
  assert.equal(excessColumn.status, 'partial')

  const indirectOnly = await inspectSourceReadBridge({
    async query() {
      return { rows: [{
        runtime_role_count: 1,
        source_relation_count: 3,
        required_column_count: 15,
        runtime_table_acl_count: 0,
        runtime_column_acl_count: 15,
        runtime_expected_acl_count: 15,
        runtime_excess_acl_count: 0,
        runtime_effective_table_privilege_count: 0,
        runtime_effective_expected_select_count: 15,
        runtime_effective_excess_column_privilege_count: 0,
        runtime_indirect_acl_count: 1,
      }] }
    },
  })
  assert.equal(indirectOnly.status, 'partial')
})

test('CLI main remains audit-only without --apply', async () => {
  const deps = fakeDependencies()
  let stdout = ''
  let stderr = ''
  const exitCode = await main({
    argv: [],
    deps,
    stdout: { write(value) { stdout += value } },
    stderr: { write(value) { stderr += value } },
  })
  assert.equal(exitCode, 0)
  assert.equal(stderr, '')
  assert.equal(JSON.parse(stdout).mode, 'audit')
  assert.equal(deps.events.some((entry) => entry.startsWith('mutate:')), false)
})

test('safe reports never expose error messages, secrets or user identifiers', () => {
  const error = new Error('password=top-secret uid-owner')
  const report = safeFailureReport(error)
  assert.deepEqual(report.error, 'POSTMIGRATION_APPLY_FAILED')
  assert.equal(report.persistentChange, false)
  assert.doesNotMatch(JSON.stringify(report), /top-secret|uid-owner|password=/)
  assert.ok(ProfitabilityBestcleanPostmigrationError)
})
