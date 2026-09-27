'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const {
  CATALOG_FINGERPRINT_SCHEMA_VERSION,
  CATALOG_VERIFICATION_SCHEMA_VERSION,
  MANIFEST_SCHEMA_VERSION,
  ProfitabilityAccessProvisioningError,
  buildProvisioningPlan,
  manifestSha256,
  markerReason,
  normalizeManifest,
  runProvisioning,
} = require('../scripts/lib/profitability-access-v2-provisioning')
const {
  catalogFingerprintFromSourceRows,
  catalogFingerprintSha256,
  profitabilityActivationLockKey,
} = require('../scripts/lib/profitability-service-object-catalog-seed')
const {
  ACTIVATE_CONFIRMATION,
  EXPECTED_SESSION_ROLE,
  EXPECTED_SOURCE_CURRENT_ROLE,
  EXPECTED_SOURCE_READER_ROLE,
  assertDatabaseIdentity,
  assertMutationConfirmation,
} = require('../scripts/provision-profitability-access-v2')

const snapshotAt = new Date('2026-09-27T12:00:00.000Z')

function ownerProfile(overrides = {}) {
  return {
    operationalProfile: 'OWNER',
    objectScope: 'ALL',
    workerScope: 'ALL',
    financeProfile: 'OWNER_FULL',
    accessMode: 'MANAGE',
    canEditOperationalCosts: true,
    canEditContractTerms: true,
    canEditProfitabilityTargets: true,
    canViewWorkerRates: true,
    canEditWorkerRates: true,
    ...overrides,
  }
}

function coordinatorProfile(overrides = {}) {
  return {
    operationalProfile: 'COORDINATOR',
    objectScope: 'ASSIGNED',
    workerScope: 'OBJECT_ASSIGNED',
    financeProfile: 'COST_CONTROL',
    accessMode: 'READ',
    canEditOperationalCosts: false,
    canEditContractTerms: false,
    canEditProfitabilityTargets: false,
    canViewWorkerRates: false,
    canEditWorkerRates: false,
    ...overrides,
  }
}

function rawManifest({ authoritative = true, includeCoordinator = false } = {}) {
  const profiles = [{
    uid: 'uid-owner-001',
    expectedMembershipRole: 'OWNER',
    expectedMembershipStatus: 'ACTIVE',
    profile: ownerProfile(),
    assignments: [],
  }]
  if (includeCoordinator) {
    profiles.push({
      uid: 'uid-coordinator-001',
      expectedMembershipRole: 'WORKER',
      expectedMembershipStatus: 'ACTIVE',
      profile: coordinatorProfile(),
      assignments: [{
        objectId: 'object-001',
        assignmentRole: 'COORDINATOR',
        accessMode: 'ALLOW',
      }],
    })
  }
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    orgId: 'bestclean',
    authoritative,
    actor: {
      uid: 'uid-owner-001',
      expectedMembershipRole: 'OWNER',
      expectedMembershipStatus: 'ACTIVE',
    },
    profiles,
    activation: { reason: 'Approved access profile v2 rollout' },
  }
}

function profileRow(uid, profile, id = `profile-${uid}`) {
  return {
    org_id: 'bestclean',
    profile_id: id,
    uid,
    operational_profile: profile.operationalProfile,
    object_scope: profile.objectScope,
    worker_scope: profile.workerScope,
    finance_profile: profile.financeProfile,
    access_mode: profile.accessMode,
    can_edit_operational_costs: profile.canEditOperationalCosts,
    can_edit_contract_terms: profile.canEditContractTerms,
    can_edit_profitability_targets: profile.canEditProfitabilityTargets,
    can_view_worker_rates: profile.canViewWorkerRates,
    can_edit_worker_rates: profile.canEditWorkerRates,
    valid_from: new Date('2026-09-27T10:00:00.000Z'),
    valid_to: null,
    revoked_at: null,
  }
}

function assignmentRow({
  uid = 'uid-coordinator-001',
  objectId = 'object-001',
  assignmentRole = 'COORDINATOR',
  accessMode = 'ALLOW',
  id = `assignment-${objectId}`,
} = {}) {
  return {
    org_id: 'bestclean',
    assignment_id: id,
    object_id: objectId,
    uid,
    assignment_role: assignmentRole,
    access_mode: accessMode,
    valid_from: new Date('2026-09-27T10:00:00.000Z'),
    valid_to: null,
    revoked_at: null,
  }
}

function stateFor(manifest, { exact = false } = {}) {
  const assignedObjectIds = [...new Set(manifest.profiles.flatMap((entry) => (
    entry.assignments.map((assignment) => assignment.objectId)
  )))]
  const catalogObjectIds = assignedObjectIds.length ? assignedObjectIds : ['object-active-001']
  const catalogObjects = catalogObjectIds.map((objectId) => ({
    org_id: manifest.orgId,
    object_id: objectId,
    client_id: objectId,
    name: `Object ${objectId}`,
    status: 'ACTIVE',
    archived_at: null,
  }))
  return {
    snapshotAt,
    organizationCount: 1,
    memberships: manifest.profiles.map((entry) => ({
      org_id: manifest.orgId,
      uid: entry.uid,
      role: entry.expectedMembershipRole,
      status: entry.expectedMembershipStatus,
    })),
    objects: manifest.profiles.flatMap((entry) => entry.assignments.map((assignment) => ({
      org_id: manifest.orgId,
      object_id: assignment.objectId,
      status: 'ACTIVE',
      archived_at: null,
    }))),
    profiles: exact
      ? manifest.profiles.map((entry) => profileRow(entry.uid, entry.profile))
      : [],
    assignments: exact
      ? manifest.profiles.flatMap((entry) => entry.assignments.map((assignment) => (
        assignmentRow({ uid: entry.uid, ...assignment })
      )))
      : [],
    marker: null,
    catalogObjects,
    sourceClients: catalogObjects.map((row) => ({
      org_id: row.org_id,
      client_id: row.client_id,
      name: row.name,
      address: 'Address 1',
      city: 'Rybnik',
      postal_code: '44-200',
      status: 'AKTYWNY',
    })),
    activeObjects: catalogObjects.map((row) => ({ object_id: row.object_id })),
  }
}

function catalogVerification(state) {
  const fingerprint = catalogFingerprintFromSourceRows('bestclean', state.sourceClients)
  const activeSourceClients = fingerprint.objects.length
  return {
    schemaVersion: CATALOG_VERIFICATION_SCHEMA_VERSION,
    fingerprintSchemaVersion: CATALOG_FINGERPRINT_SCHEMA_VERSION,
    orgId: 'bestclean',
    fingerprintSha256: catalogFingerprintSha256(fingerprint),
    exact: true,
    counts: {
      activeSourceClients,
      serviceObjects: activeSourceClients,
    },
  }
}

function cloneRows(rows) {
  return rows.map((row) => ({ ...row }))
}

class StatefulClient {
  constructor(state) {
    this.state = {
      ...state,
      memberships: cloneRows(state.memberships),
      objects: cloneRows(state.objects),
      profiles: cloneRows(state.profiles),
      assignments: cloneRows(state.assignments),
      marker: state.marker ? { ...state.marker } : null,
      catalogObjects: cloneRows(state.catalogObjects || []),
    }
    this.calls = []
  }

  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim()
    this.calls.push({ sql: normalized, params })
    if (/^(begin|commit|rollback|set local role)/i.test(normalized)) return { rows: [] }
    if (normalized.includes('organization-lock')) return { rows: [{}] }
    if (normalized.includes(':authorization-active-objects')) {
      return { rows: cloneRows(this.state.activeObjects || []) }
    }
    if (normalized.includes('profitability-service-object-seed:target-objects')) {
      return { rows: cloneRows(this.state.catalogObjects || []) }
    }
    if (normalized.includes(':authorization-objects')) {
      return { rows: cloneRows(this.state.objects) }
    }
    if (normalized.includes(':profiles')) {
      return { rows: cloneRows(this.state.profiles.filter((row) => row.revoked_at === null)) }
    }
    if (normalized.includes(':assignments')) {
      return { rows: cloneRows(this.state.assignments.filter((row) => row.revoked_at === null)) }
    }
    if (normalized.includes(':marker')) return { rows: this.state.marker ? [{ ...this.state.marker }] : [] }
    if (normalized.includes(':revoke-profile')) {
      const row = this.state.profiles.find((item) => item.profile_id === params[1])
      row.revoked_at = this.state.snapshotAt
      return { rows: [], rowCount: 1 }
    }
    if (normalized.includes(':revoke-assignment')) {
      const row = this.state.assignments.find((item) => item.assignment_id === params[1])
      row.revoked_at = this.state.snapshotAt
      return { rows: [], rowCount: 1 }
    }
    if (normalized.includes(':insert-profile')) {
      this.state.profiles.push(profileRow(params[2], {
        operationalProfile: params[3],
        objectScope: params[4],
        workerScope: params[5],
        financeProfile: params[6],
        accessMode: params[7],
        canEditOperationalCosts: params[8],
        canEditContractTerms: params[9],
        canEditProfitabilityTargets: params[10],
        canViewWorkerRates: params[11],
        canEditWorkerRates: params[12],
      }, params[1]))
      return { rows: [], rowCount: 1 }
    }
    if (normalized.includes(':insert-assignment')) {
      this.state.assignments.push(assignmentRow({
        id: params[1], objectId: params[2], uid: params[3], assignmentRole: params[4],
        accessMode: params[5],
      }))
      return { rows: [], rowCount: 1 }
    }
    if (normalized.includes(':insert-marker')) {
      this.state.marker = {
        org_id: params[0], schema_version: params[1], enforced_by_uid: params[2], reason: params[3],
      }
      return { rows: [], rowCount: 1 }
    }
    if (normalized.includes(':update-marker')) {
      if (!this.state.marker || this.state.marker.enforced_by_uid !== params[4] ||
          this.state.marker.reason !== params[5]) return { rows: [], rowCount: 0 }
      this.state.marker = {
        ...this.state.marker,
        enforced_by_uid: params[2],
        reason: params[3],
      }
      return { rows: [], rowCount: 1 }
    }
    throw new Error(`Unexpected query: ${normalized}`)
  }
}

class SourceClient {
  constructor(state, { changedMemberships = null, changedCatalogRows = null } = {}) {
    this.state = state
    this.changedMemberships = changedMemberships
    this.changedCatalogRows = changedCatalogRows
    this.calls = []
    this.membershipReadCount = 0
    this.catalogReadCount = 0
  }

  async query(sql) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim()
    this.calls.push({ sql: normalized })
    if (/^(begin|rollback)/i.test(normalized)) return { rows: [] }
    if (normalized.includes(':source-snapshot')) {
      return { rows: [{ snapshot_at: this.state.snapshotAt }] }
    }
    if (normalized.includes(':source-organization')) return { rows: [{ org_id: 'bestclean' }] }
    if (normalized.includes(':source-memberships')) {
      this.membershipReadCount += 1
      const rows = this.membershipReadCount > 1 && this.changedMemberships
        ? this.changedMemberships
        : this.state.memberships
      return { rows: cloneRows(rows) }
    }
    if (normalized.includes('profitability-service-object-seed:source-clients')) {
      this.catalogReadCount += 1
      const rows = this.catalogReadCount > 1 && this.changedCatalogRows
        ? this.changedCatalogRows
        : this.state.sourceClients
      return { rows: cloneRows(rows || []) }
    }
    throw new Error(`Unexpected source query: ${normalized}`)
  }
}

const schemaReady = async () => {}

test('manifest is strict and never accepts names or email as authorization input', () => {
  const source = rawManifest()
  source.profiles[0].email = 'not-an-authorization-key@example.invalid'
  assert.throws(
    () => normalizeManifest(source),
    (error) => error instanceof ProfitabilityAccessProvisioningError &&
      error.code === 'PROFILE_ENTRY_INVALID_UNKNOWN_FIELD',
  )
})

test('normalization sorts profiles and assignments for an exact stable SHA-256', () => {
  const first = rawManifest({ includeCoordinator: true })
  const second = rawManifest({ includeCoordinator: true })
  second.profiles.reverse()
  assert.equal(
    manifestSha256(normalizeManifest(first)),
    manifestSha256(normalizeManifest(second)),
  )
  assert.match(manifestSha256(normalizeManifest(first)), /^[a-f0-9]{64}$/)
})

test('actor must be an explicitly verified manifest member', () => {
  const source = rawManifest()
  source.actor.uid = 'uid-not-in-profiles'
  assert.throws(() => normalizeManifest(source), /ACTOR_PROFILE_ENTRY_REQUIRED/)
})

test('COST_CONTROL cannot expose contract, target, or worker-rate data', () => {
  const source = rawManifest({ includeCoordinator: true })
  source.profiles[1].profile.canViewWorkerRates = true
  assert.throws(() => normalizeManifest(source), /COST_CONTROL_CAPABILITY_EXCESS/)
})

test('plan refuses membership role drift and inactive objects before writes', () => {
  const manifest = normalizeManifest(rawManifest({ includeCoordinator: true }))
  const roleDrift = stateFor(manifest)
  roleDrift.memberships[1].role = 'ADMIN'
  assert.throws(() => buildProvisioningPlan(manifest, roleDrift), /MEMBERSHIP_STATE_MISMATCH/)

  const inactiveObject = stateFor(manifest)
  inactiveObject.objects[0].status = 'INACTIVE'
  assert.throws(() => buildProvisioningPlan(manifest, inactiveObject), /SERVICE_OBJECT_INACTIVE/)
})

test('exact desired state produces only NOOP actions without timestamp churn', () => {
  const manifest = normalizeManifest(rawManifest({ includeCoordinator: true }))
  const plan = buildProvisioningPlan(manifest, stateFor(manifest, { exact: true }))
  assert.equal(plan.exact, true)
  assert.deepEqual(plan.profileActions.map(({ type }) => type), ['NOOP', 'NOOP'])
  assert.deepEqual(plan.assignmentActions.map(({ type }) => type), ['NOOP'])
})

test('profile changes use revoke plus insert and stale assignments are revoked', () => {
  const manifest = normalizeManifest(rawManifest({ includeCoordinator: true }))
  const state = stateFor(manifest, { exact: true })
  const changedProfile = state.profiles.find((row) => row.uid === 'uid-coordinator-001')
  changedProfile.access_mode = 'MANAGE'
  state.assignments.push(assignmentRow({ objectId: 'object-stale', id: 'assignment-stale' }))
  const plan = buildProvisioningPlan(manifest, state)
  assert.equal(
    plan.profileActions.find((action) => action.uid === changedProfile.uid).type,
    'REPLACE',
  )
  assert.ok(plan.assignmentActions.some((action) => (
    action.type === 'REVOKE' && action.objectId === 'object-stale'
  )))
})

test('expired but unrevoked rows are replaced to release partial-unique slots', () => {
  const manifest = normalizeManifest(rawManifest())
  const state = stateFor(manifest, { exact: true })
  state.profiles[0].valid_to = new Date('2026-09-27T11:00:00.000Z')
  const plan = buildProvisioningPlan(manifest, state)
  assert.equal(plan.profileActions[0].type, 'REPLACE')
})

test('apply runs serializable under the guarded role chain and verifies after writes', async () => {
  const manifest = normalizeManifest(rawManifest({ includeCoordinator: true }))
  const state = stateFor(manifest)
  const client = new StatefulClient(state)
  const sourceClient = new SourceClient(state)
  let nextId = 0
  const result = await runProvisioning({
    client,
    sourceClient,
    manifest,
    mode: 'apply',
    schemaCheck: schemaReady,
    idFactory: () => `new-id-${++nextId}`,
  })
  assert.equal(result.exact, true)
  assert.equal(result.changed, true)
  assert.equal(result.counts.profileChanges, 2)
  assert.match(client.calls[0].sql, /^begin isolation level serializable$/i)
  assert.match(client.calls[1].sql, /set local role profitability_migration_runner/i)
  assert.match(client.calls[2].sql, /set local role profitability_owner/i)
  assert.equal(
    client.calls.find(({ sql }) => sql.includes('organization-lock')).params[0],
    profitabilityActivationLockKey(manifest.orgId),
  )
  assert.match(client.calls.at(-1).sql, /^commit$/i)
  assert.match(sourceClient.calls[0].sql, /^begin isolation level read committed read only$/i)
  assert.equal(
    sourceClient.calls.some(({ sql }) => /\b(insert|update|delete|grant|revoke)\b/i.test(sql)),
    false,
  )
  assert.equal(
    sourceClient.calls.some(({ sql }) => sql.includes('service_object')),
    false,
  )
  assert.ok(client.calls.some(({ sql }) => sql.includes(':authorization-active-objects')))

  const writeCount = client.calls.filter(({ sql }) => /:insert-|:revoke-/.test(sql)).length
  const second = await runProvisioning({
    client, sourceClient, manifest, mode: 'apply', schemaCheck: schemaReady,
  })
  assert.equal(second.changed, false)
  assert.equal(client.calls.filter(({ sql }) => /:insert-|:revoke-/.test(sql)).length, writeCount)
})

test('failed source verification rolls back before any provisioning write', async () => {
  const manifest = normalizeManifest(rawManifest({ includeCoordinator: true }))
  const state = stateFor(manifest)
  state.objects[0].archived_at = snapshotAt
  const client = new StatefulClient(state)
  const sourceClient = new SourceClient(state)
  await assert.rejects(
    runProvisioning({ client, sourceClient, manifest, mode: 'apply', schemaCheck: schemaReady }),
    /SERVICE_OBJECT_INACTIVE/,
  )
  assert.equal(client.calls.some(({ sql }) => /:insert-|:revoke-/.test(sql)), false)
  assert.match(client.calls.at(-1).sql, /^rollback$/i)
})

test('verify is read-only and authoritative manifests detect unexpected active access', async () => {
  const manifest = normalizeManifest(rawManifest())
  const state = stateFor(manifest, { exact: true })
  state.profiles.push(profileRow('uid-unexpected', ownerProfile()))
  const client = new StatefulClient(state)
  const sourceClient = new SourceClient(state)
  await assert.rejects(
    runProvisioning({ client, sourceClient, manifest, mode: 'verify', schemaCheck: schemaReady }),
    /PROVISIONING_STATE_NOT_EXACT/,
  )
  assert.match(client.calls[0].sql, /serializable read only/i)
  assert.match(client.calls.at(-1).sql, /^rollback$/i)
})

test('activation is separate, hash-bound, idempotent, and only after full verify', async () => {
  const manifest = normalizeManifest(rawManifest())
  const hash = manifestSha256(manifest)
  const state = stateFor(manifest, { exact: true })
  const client = new StatefulClient(state)
  const sourceClient = new SourceClient(state)
  const catalog = catalogVerification(state)
  const first = await runProvisioning({
    client, sourceClient, manifest, mode: 'activate', schemaCheck: schemaReady,
    catalogVerification: catalog,
  })
  assert.equal(first.activated, true)
  assert.equal(first.changed, true)
  assert.equal(client.state.marker.reason, markerReason(manifest, hash, catalog))
  const second = await runProvisioning({
    client, sourceClient, manifest, mode: 'activate', schemaCheck: schemaReady,
    catalogVerification: catalog,
  })
  assert.equal(second.activated, true)
  assert.equal(second.changed, false)
  assert.equal(client.calls.filter(({ sql }) => sql.includes(':insert-marker')).length, 1)
})

test('activation rechecks exact catalog fingerprint and ignores address-only drift', async () => {
  const manifest = normalizeManifest(rawManifest())

  const addressState = stateFor(manifest, { exact: true })
  const addressVerification = catalogVerification(addressState)
  addressState.sourceClients[0].address = 'Changed after catalog verification'
  addressState.sourceClients[0].city = 'Gliwice'
  const addressClient = new StatefulClient(addressState)
  const addressResult = await runProvisioning({
    client: addressClient,
    sourceClient: new SourceClient(addressState),
    manifest,
    mode: 'activate',
    schemaCheck: schemaReady,
    catalogVerification: addressVerification,
  })
  assert.equal(addressResult.activated, true)

  const sourceDriftState = stateFor(manifest, { exact: true })
  const staleVerification = catalogVerification(sourceDriftState)
  sourceDriftState.sourceClients[0].name = 'Changed after catalog verification'
  const sourceDriftClient = new StatefulClient(sourceDriftState)
  await assert.rejects(
    runProvisioning({
      client: sourceDriftClient,
      sourceClient: new SourceClient(sourceDriftState),
      manifest,
      mode: 'activate',
      schemaCheck: schemaReady,
      catalogVerification: staleVerification,
    }),
    /CATALOG_FINGERPRINT_MISMATCH/,
  )
  assert.equal(sourceDriftClient.calls.some(({ sql }) => sql.includes(':insert-marker')), false)

  const targetDriftState = stateFor(manifest, { exact: true })
  const targetVerification = catalogVerification(targetDriftState)
  targetDriftState.catalogObjects[0].name = 'Changed target name'
  const targetDriftClient = new StatefulClient(targetDriftState)
  await assert.rejects(
    runProvisioning({
      client: targetDriftClient,
      sourceClient: new SourceClient(targetDriftState),
      manifest,
      mode: 'activate',
      schemaCheck: schemaReady,
      catalogVerification: targetVerification,
    }),
    /CATALOG_FINGERPRINT_MISMATCH/,
  )
  assert.equal(targetDriftClient.calls.some(({ sql }) => sql.includes(':insert-marker')), false)
})

test('ALL profiles may be provisioned before catalog sync but activation requires an active object', async () => {
  const manifest = normalizeManifest(rawManifest())
  const state = stateFor(manifest)
  state.activeObjects = []
  const client = new StatefulClient(state)
  const sourceClient = new SourceClient(state)
  const applied = await runProvisioning({
    client, sourceClient, manifest, mode: 'apply', schemaCheck: schemaReady,
  })
  assert.equal(applied.exact, true)
  await assert.rejects(
    runProvisioning({
      client, sourceClient, manifest, mode: 'activate', schemaCheck: schemaReady,
      catalogVerification: catalogVerification(state),
    }),
    /ACTIVATION_REQUIRES_ACTIVE_SERVICE_OBJECT/,
  )
  assert.equal(client.calls.some(({ sql }) => sql.includes(':insert-marker')), false)
})

test('activation refuses a non-authoritative manifest and explicitly rebinds an old marker', async () => {
  const partial = normalizeManifest(rawManifest({ authoritative: false }))
  const partialState = stateFor(partial, { exact: true })
  const partialClient = new StatefulClient(partialState)
  const partialSourceClient = new SourceClient(partialState)
  await assert.rejects(
    runProvisioning({
      client: partialClient,
      sourceClient: partialSourceClient,
      manifest: partial,
      mode: 'activate',
      schemaCheck: schemaReady,
      catalogVerification: catalogVerification(partialState),
    }),
    /ACTIVATION_REQUIRES_AUTHORITATIVE_MANIFEST/,
  )
  assert.equal(partialClient.calls.length, 0)

  const manifest = normalizeManifest(rawManifest())
  const state = stateFor(manifest, { exact: true })
  state.marker = {
    org_id: 'bestclean', schema_version: 'v2', enforced_by_uid: 'uid-owner-001', reason: 'other',
  }
  const client = new StatefulClient(state)
  const sourceClient = new SourceClient(state)
  const catalog = catalogVerification(state)
  const result = await runProvisioning({
    client, sourceClient, manifest, mode: 'activate', schemaCheck: schemaReady,
    catalogVerification: catalog,
  })
  assert.equal(result.activated, true)
  assert.equal(result.changed, true)
  assert.equal(client.state.marker.reason, markerReason(manifest, manifestSha256(manifest), catalog))
  assert.ok(client.calls.some(({ sql }) => sql.includes(':update-marker')))
})

test('an existing enforcement marker blocks non-NOOP apply and requires activate', async () => {
  const manifest = normalizeManifest(rawManifest())
  const state = stateFor(manifest)
  state.marker = {
    org_id: 'bestclean', schema_version: 'v2', enforced_by_uid: 'uid-owner-001', reason: 'old',
  }
  const client = new StatefulClient(state)
  const sourceClient = new SourceClient(state)
  await assert.rejects(
    runProvisioning({ client, sourceClient, manifest, mode: 'apply', schemaCheck: schemaReady }),
    /ACTIVE_ENFORCEMENT_REQUIRES_REACTIVATION/,
  )
  assert.equal(client.calls.some(({ sql }) => /:insert-|:revoke-/.test(sql)), false)

  const activated = await runProvisioning({
    client, sourceClient, manifest, mode: 'activate', schemaCheck: schemaReady,
    catalogVerification: catalogVerification(state),
    idFactory: () => 'reactivated-profile-id',
  })
  assert.equal(activated.activated, true)
  assert.equal(client.state.profiles.filter((row) => row.revoked_at === null).length, 1)
  assert.ok(client.calls.some(({ sql }) => sql.includes(':update-marker')))
})

test('activate fails closed without exact catalog verification', async () => {
  const manifest = normalizeManifest(rawManifest())
  const state = stateFor(manifest, { exact: true })
  await assert.rejects(
    runProvisioning({
      client: new StatefulClient(state), sourceClient: new SourceClient(state),
      manifest, mode: 'activate', schemaCheck: schemaReady,
    }),
    /CATALOG_VERIFICATION_INVALID/,
  )
})

test('worker id binding and source re-read fail closed before target commit', async () => {
  const raw = rawManifest()
  raw.profiles[0].expectedWorkerId = 'W001'
  const manifest = normalizeManifest(raw)
  const state = stateFor(manifest)
  state.memberships[0].worker_id = 'W001'
  const changedMemberships = cloneRows(state.memberships)
  changedMemberships[0].worker_id = 'W999'
  const client = new StatefulClient(state)
  await assert.rejects(
    runProvisioning({
      client,
      sourceClient: new SourceClient(state, { changedMemberships }),
      manifest,
      mode: 'apply',
      schemaCheck: schemaReady,
    }),
    /SOURCE_AUTHORIZATION_CHANGED_DURING_PROVISIONING/,
  )
  assert.equal(client.calls.some(({ sql }) => /^commit$/i.test(sql)), false)
  assert.match(client.calls.at(-1).sql, /^rollback$/i)
})

test('transaction setup failure after BEGIN is rolled back', async () => {
  const calls = []
  const client = {
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim()
      calls.push(normalized)
      if (/^set local role profitability_migration_runner$/i.test(normalized)) {
        throw new Error('SET_ROLE_FAILED')
      }
      return { rows: [] }
    },
  }
  const sourceClient = { query: async () => { throw new Error('SOURCE_MUST_NOT_RUN') } }
  await assert.rejects(
    runProvisioning({ client, sourceClient, manifest: rawManifest(), mode: 'audit' }),
    /SET_ROLE_FAILED/,
  )
  assert.match(calls[0], /^begin isolation level serializable read only$/i)
  assert.match(calls.at(-1), /^rollback$/i)
})

test('CLI mutation gates require the exact manifest hash and explicit activation token', () => {
  const originalArgv = process.argv
  try {
    process.argv = ['node', 'script', '--apply', '--confirm-manifest-sha256=wrong']
    assert.throws(() => assertMutationConfirmation('apply', 'a'.repeat(64)), /MISMATCH/)
    process.argv = [
      'node', 'script', '--activate', `--confirm-manifest-sha256=${'a'.repeat(64)}`,
      `--confirm-activate=${ACTIVATE_CONFIRMATION}`,
    ]
    assert.doesNotThrow(() => assertMutationConfirmation('activate', 'a'.repeat(64)))
  } finally {
    process.argv = originalArgv
  }
})

test('CLI accepts only the dedicated executor on the pinned production database and PG17', async () => {
  const client = {
    query: async () => ({ rows: [{
      database_name: 'iclean-room-database',
      session_role: EXPECTED_SESSION_ROLE,
      current_role: EXPECTED_SESSION_ROLE,
      server_version_num: 170010,
      in_recovery: false,
    }] }),
  }
  await assert.doesNotReject(assertDatabaseIdentity(client))
  const sourceIdentity = {
    query: async () => ({ rows: [{
      database_name: 'iclean-room-database',
      session_role: EXPECTED_SOURCE_READER_ROLE,
      current_role: EXPECTED_SOURCE_CURRENT_ROLE,
      server_version_num: 170010,
      in_recovery: false,
    }] }),
  }
  await assert.doesNotReject(assertDatabaseIdentity(
    sourceIdentity,
    EXPECTED_SOURCE_READER_ROLE,
    EXPECTED_SOURCE_CURRENT_ROLE,
  ))
  await assert.rejects(assertDatabaseIdentity({
    query: async () => ({ rows: [{
      database_name: 'iclean-room-database', session_role: 'postgres', current_role: 'postgres',
      server_version_num: 170010, in_recovery: false,
    }] }),
  }), /DATABASE_SESSION_ROLE_MISMATCH/)
})

test('CLI default mode is audit and never accepts a database secret in argv', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'provision-profitability-access-v2.js'),
    'utf8',
  )
  assert.match(source, /return selected\[0\] \|\| 'audit'/)
  assert.doesNotMatch(source, /readOption\(['"](?:password|database-url|secret)['"]\)/i)
  assert.match(source, /statement_timeout: 30000/)
})
