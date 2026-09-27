'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const {
  CATALOG_FINGERPRINT_SCHEMA_VERSION,
  CATALOG_VERIFICATION_SCHEMA_VERSION,
  EXPECTED_ORG_ID,
  MANIFEST_SCHEMA_VERSION,
  REQUIRED_SOURCE_COLUMNS,
  REQUIRED_TARGET_COLUMNS,
  REQUIRED_TARGET_CONSTRAINTS,
  SOURCE_OWNER_ROLE,
  TARGET_COLUMN_RULES,
  TARGET_CONSTRAINT_RULES,
  TARGET_OWNER_ROLE,
  ProfitabilityCatalogSeedError,
  assertSourceSchema,
  assertTargetSchema,
  buildManifest,
  buildCatalogFingerprint,
  buildSeedPlan,
  catalogFingerprintFromSourceRows,
  catalogFingerprintFromTargetRows,
  catalogFingerprintSha256,
  canonicalStringify,
  manifestSha256,
  profitabilityActivationLockKey,
  runCatalogSeed,
} = require('../scripts/lib/profitability-service-object-catalog-seed')
const {
  EXPECTED_DATABASE,
  EXPECTED_SOURCE_CURRENT_ROLE,
  EXPECTED_SOURCE_SESSION_ROLE,
  EXPECTED_TARGET_SESSION_ROLE,
  assertApplyConfirmation,
  assertDatabaseIdentity,
  safeError,
  sourceClientConfig,
  writeManifestIfRequested,
} = require('../scripts/seed-profitability-service-objects')

function activeClient(overrides = {}) {
  return {
    org_id: EXPECTED_ORG_ID,
    client_id: 'LK012',
    name: 'Edukatorium',
    address: 'ul. Testowa 1',
    city: 'Rybnik',
    postal_code: '44-200',
    status: 'AKTYWNY',
    ...overrides,
  }
}

function inactiveClient(overrides = {}) {
  return activeClient({
    client_id: 'LK099',
    name: 'Dawny klient',
    status: 'NIEAKTYWNY',
    ...overrides,
  })
}

function targetObject(overrides = {}) {
  return {
    org_id: EXPECTED_ORG_ID,
    object_id: 'LK012',
    client_id: 'LK012',
    name: 'Edukatorium',
    status: 'ACTIVE',
    address: 'historyczny adres pozostaje bez zmian',
    city: 'Rybnik',
    postal_code: '44-200',
    archived_at: null,
    ...overrides,
  }
}

function sourceRows() {
  return [
    activeClient({ client_id: 'LK020', name: 'Zeta', address: null, city: null, postal_code: null }),
    inactiveClient(),
    activeClient(),
  ]
}

class SourceClient {
  constructor(rows, { changedRows = null } = {}) {
    this.rows = rows.map((row) => ({ ...row }))
    this.changedRows = changedRows?.map((row) => ({ ...row })) || null
    this.calls = []
    this.readCount = 0
  }

  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim()
    this.calls.push({ sql: normalized, params })
    if (/^(begin|rollback)/i.test(normalized)) return { rows: [] }
    if (normalized.includes(':source-clients')) {
      this.readCount += 1
      const rows = this.readCount > 1 && this.changedRows ? this.changedRows : this.rows
      return { rows: rows.map((row) => ({ ...row })) }
    }
    throw new Error(`Unexpected source query: ${normalized}`)
  }
}

class TargetClient {
  constructor(rows = []) {
    this.rows = rows.map((row) => ({ ...row }))
    this.calls = []
  }

  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim()
    this.calls.push({ sql: normalized, params })
    if (/^(begin|commit|rollback|set local role)/i.test(normalized)) return { rows: [] }
    if (normalized.includes(':organization-lock')) return { rows: [{}] }
    if (normalized.includes(':target-objects')) {
      return { rows: this.rows.map((row) => ({ ...row })) }
    }
    if (normalized.includes(':insert-object')) {
      this.rows.push(targetObject({
        org_id: params[0],
        object_id: params[1],
        client_id: params[2],
        name: params[3],
        address: params[4],
        city: params[5],
        postal_code: params[6],
      }))
      return { rows: [], rowCount: 1 }
    }
    throw new Error(`Unexpected target query: ${normalized}`)
  }
}

const skipSchemaCheck = async () => {}

test('manifest uses only explicit source columns, stable client identity and production statuses', () => {
  const manifest = buildManifest(EXPECTED_ORG_ID, sourceRows())
  assert.equal(manifest.schemaVersion, MANIFEST_SCHEMA_VERSION)
  assert.equal(manifest.identityMapping, 'object_id=client_id')
  assert.equal(manifest.activeSourceStatus, 'AKTYWNY')
  assert.equal(manifest.inactiveSourceStatus, 'NIEAKTYWNY')
  assert.equal(manifest.inactiveSourceCount, 1)
  assert.deepEqual(manifest.inactiveSourceClientIds, ['LK099'])
  assert.deepEqual(manifest.objects.map((row) => row.clientId), ['LK012', 'LK020'])
  assert.deepEqual(manifest.objects[0], {
    orgId: EXPECTED_ORG_ID,
    objectId: 'LK012',
    clientId: 'LK012',
    name: 'Edukatorium',
    address: 'ul. Testowa 1',
    city: 'Rybnik',
    postalCode: '44-200',
    status: 'ACTIVE',
  })
  assert.doesNotMatch(canonicalStringify(manifest), /nip|coordinator|email/i)
})

test('manifest hash is canonical and insensitive to source row order', () => {
  const first = buildManifest(EXPECTED_ORG_ID, sourceRows())
  const second = buildManifest(EXPECTED_ORG_ID, [...sourceRows()].reverse())
  assert.equal(manifestSha256(first), manifestSha256(second))
  assert.match(manifestSha256(first), /^[0-9a-f]{64}$/)
})

test('authorization catalog fingerprint ignores address drift but binds identity, name and status', () => {
  const original = [activeClient()]
  const addressChanged = [activeClient({
    address: 'ul. Inna 9', city: 'Gliwice', postal_code: '44-100',
  })]
  const renamed = [activeClient({ name: 'Edukatorium po zmianie' })]
  assert.notEqual(
    manifestSha256(buildManifest(EXPECTED_ORG_ID, original)),
    manifestSha256(buildManifest(EXPECTED_ORG_ID, addressChanged)),
  )
  assert.equal(
    catalogFingerprintSha256(catalogFingerprintFromSourceRows(EXPECTED_ORG_ID, original)),
    catalogFingerprintSha256(catalogFingerprintFromSourceRows(EXPECTED_ORG_ID, addressChanged)),
  )
  assert.notEqual(
    catalogFingerprintSha256(catalogFingerprintFromSourceRows(EXPECTED_ORG_ID, original)),
    catalogFingerprintSha256(catalogFingerprintFromSourceRows(EXPECTED_ORG_ID, renamed)),
  )
  const target = catalogFingerprintFromTargetRows(EXPECTED_ORG_ID, [targetObject()])
  assert.equal(target.schemaVersion, CATALOG_FINGERPRINT_SCHEMA_VERSION)
  assert.equal(
    catalogFingerprintSha256(target),
    catalogFingerprintSha256(buildCatalogFingerprint(
      EXPECTED_ORG_ID,
      buildManifest(EXPECTED_ORG_ID, original).objects,
    )),
  )
})

test('source catalog fails closed for unknown status, incomplete active row and foreign org', () => {
  assert.throws(
    () => buildManifest(EXPECTED_ORG_ID, [activeClient({ status: 'ACTIVE' })]),
    /SOURCE_CLIENT_STATUS_UNSUPPORTED/,
  )
  assert.throws(
    () => buildManifest(EXPECTED_ORG_ID, [activeClient({ name: '   ' })]),
    /SOURCE_CLIENT_NAME_INVALID/,
  )
  assert.throws(
    () => buildManifest(EXPECTED_ORG_ID, [activeClient({ org_id: 'foreign' })]),
    /SOURCE_ORG_SCOPE_MISMATCH/,
  )
  assert.throws(
    () => buildManifest('foreign', [activeClient({ org_id: 'foreign' })]),
    /ORG_NOT_ALLOWLISTED/,
  )
  assert.throws(
    () => buildManifest(EXPECTED_ORG_ID, [inactiveClient()]),
    /ACTIVE_SOURCE_CLIENT_REQUIRED/,
  )
})

test('source catalog rejects whitespace drift and duplicate stable ids', () => {
  assert.throws(
    () => buildManifest(EXPECTED_ORG_ID, [activeClient({ client_id: ' LK012' })]),
    /SOURCE_CLIENT_ID_INVALID/,
  )
  assert.throws(
    () => buildManifest(EXPECTED_ORG_ID, [activeClient(), activeClient()]),
    /SOURCE_CLIENT_DUPLICATE/,
  )
})

test('plan inserts only missing active clients and preserves compatible rows without updates', () => {
  const manifest = buildManifest(EXPECTED_ORG_ID, sourceRows())
  const plan = buildSeedPlan(manifest, [targetObject()])
  assert.equal(plan.conflicts.length, 0)
  assert.deepEqual(plan.preserved.map((row) => row.clientId), ['LK012'])
  assert.deepEqual(plan.inserts.map((row) => row.clientId), ['LK020'])
  assert.equal(plan.exact, false)
})

test('plan blocks identity, name, status and unmanaged target conflicts', () => {
  const manifest = buildManifest(EXPECTED_ORG_ID, [activeClient()])
  const cases = [
    [targetObject({ client_id: 'OTHER' }), 'TARGET_IDENTITY_CONFLICT'],
    [targetObject({ object_id: 'OTHER' }), 'TARGET_IDENTITY_CONFLICT'],
    [targetObject({ name: 'Inna nazwa' }), 'TARGET_NAME_CONFLICT'],
    [targetObject({ status: 'INACTIVE' }), 'TARGET_STATUS_CONFLICT'],
    [targetObject({ archived_at: new Date() }), 'TARGET_STATUS_CONFLICT'],
    [targetObject({ object_id: 'EXTRA', client_id: 'EXTRA' }), 'TARGET_WITHOUT_ACTIVE_SOURCE'],
  ]
  for (const [row, expectedKind] of cases) {
    const plan = buildSeedPlan(manifest, [row])
    assert.ok(plan.conflicts.some((item) => item.kind === expectedKind), expectedKind)
  }
})

test('audit uses separate read-only source and serializable target transactions without writes', async () => {
  const sourceClient = new SourceClient(sourceRows())
  const targetClient = new TargetClient([targetObject()])
  const result = await runCatalogSeed({
    sourceClient,
    targetClient,
    mode: 'audit',
    sourceSchemaCheck: skipSchemaCheck,
    targetSchemaCheck: skipSchemaCheck,
  })
  assert.equal(result.exact, false)
  assert.equal(result.counts.missingObjects, 1)
  assert.equal(result.counts.inactiveSourceClients, 1)
  assert.equal(targetClient.calls.some((call) => call.sql.includes(':insert-object')), false)
  assert.match(sourceClient.calls[0].sql, /begin isolation level read committed read only/i)
  assert.match(targetClient.calls[0].sql, /begin isolation level serializable read only/i)
  assert.ok(targetClient.calls.some((call) => call.sql === 'set local role profitability_owner'))
  assert.equal(
    targetClient.calls.find((call) => call.sql.includes(':organization-lock')).params[0],
    profitabilityActivationLockKey(EXPECTED_ORG_ID),
  )
  assert.equal(targetClient.calls.at(-1).sql.toLowerCase(), 'rollback')
  assert.equal(sourceClient.calls.at(-1).sql.toLowerCase(), 'rollback')
})

test('audit reports safe conflict kinds without mutating or exposing source names', async () => {
  const result = await runCatalogSeed({
    sourceClient: new SourceClient([activeClient()]),
    targetClient: new TargetClient([targetObject({ name: 'Konflikt' })]),
    mode: 'audit',
    sourceSchemaCheck: skipSchemaCheck,
    targetSchemaCheck: skipSchemaCheck,
  })
  assert.equal(result.exact, false)
  assert.deepEqual(result.conflictKinds, ['TARGET_NAME_CONFLICT'])
  assert.equal(result.counts.conflicts, 1)
  assert.equal(JSON.stringify({ ...result, manifest: undefined }).includes('Konflikt'), false)
})

test('apply requires the confirmed source manifest, inserts only missing objects and verifies exactly', async () => {
  const rows = sourceRows()
  const sourceClient = new SourceClient(rows)
  const targetClient = new TargetClient([targetObject()])
  const hash = manifestSha256(buildManifest(EXPECTED_ORG_ID, rows))
  const result = await runCatalogSeed({
    sourceClient,
    targetClient,
    mode: 'apply',
    expectedManifestSha256: hash,
    sourceSchemaCheck: skipSchemaCheck,
    targetSchemaCheck: skipSchemaCheck,
  })
  assert.equal(result.exact, true)
  assert.equal(result.changed, true)
  assert.equal(result.counts.insertedObjects, 1)
  assert.equal(result.catalogVerification.schemaVersion, CATALOG_VERIFICATION_SCHEMA_VERSION)
  assert.equal(
    result.catalogVerification.fingerprintSchemaVersion,
    CATALOG_FINGERPRINT_SCHEMA_VERSION,
  )
  assert.match(result.catalogVerification.fingerprintSha256, /^[0-9a-f]{64}$/)
  assert.equal(targetClient.calls.filter((call) => call.sql.includes(':insert-object')).length, 1)
  assert.equal(targetClient.calls.at(-1).sql.toLowerCase(), 'commit')
  assert.equal(sourceClient.readCount, 2)
})

test('apply rolls back before writes on wrong confirmation or existing conflict', async () => {
  const wrongHashTarget = new TargetClient([])
  await assert.rejects(
    runCatalogSeed({
      sourceClient: new SourceClient([activeClient()]),
      targetClient: wrongHashTarget,
      mode: 'apply',
      expectedManifestSha256: '0'.repeat(64),
      sourceSchemaCheck: skipSchemaCheck,
      targetSchemaCheck: skipSchemaCheck,
    }),
    /CONFIRM_MANIFEST_SHA256_MISMATCH/,
  )
  assert.equal(wrongHashTarget.calls.length, 0)

  const rows = [activeClient()]
  const conflictTarget = new TargetClient([targetObject({ name: 'Konflikt' })])
  await assert.rejects(
    runCatalogSeed({
      sourceClient: new SourceClient(rows),
      targetClient: conflictTarget,
      mode: 'apply',
      expectedManifestSha256: manifestSha256(buildManifest(EXPECTED_ORG_ID, rows)),
      sourceSchemaCheck: skipSchemaCheck,
      targetSchemaCheck: skipSchemaCheck,
    }),
    /CATALOG_CONFLICT/,
  )
  assert.equal(conflictTarget.calls.some((call) => call.sql.includes(':insert-object')), false)
  assert.equal(conflictTarget.calls.at(-1).sql.toLowerCase(), 'rollback')
})

test('apply detects a changed source snapshot before target commit', async () => {
  const rows = [activeClient()]
  const sourceClient = new SourceClient(rows, {
    changedRows: [activeClient({ name: 'Edukatorium po zmianie' })],
  })
  const targetClient = new TargetClient([])
  await assert.rejects(
    runCatalogSeed({
      sourceClient,
      targetClient,
      mode: 'apply',
      expectedManifestSha256: manifestSha256(buildManifest(EXPECTED_ORG_ID, rows)),
      sourceSchemaCheck: skipSchemaCheck,
      targetSchemaCheck: skipSchemaCheck,
    }),
    /SOURCE_CATALOG_CHANGED_DURING_APPLY/,
  )
  assert.equal(targetClient.calls.some((call) => call.sql.toLowerCase() === 'commit'), false)
  assert.equal(targetClient.calls.at(-1).sql.toLowerCase(), 'rollback')
})

test('apply permits non-authoritative address drift when authorization fingerprint is unchanged', async () => {
  const rows = [activeClient()]
  const sourceClient = new SourceClient(rows, {
    changedRows: [activeClient({
      address: 'ul. Zmieniona 2', city: 'Żory', postal_code: '44-240',
    })],
  })
  const targetClient = new TargetClient([])
  const result = await runCatalogSeed({
    sourceClient,
    targetClient,
    mode: 'apply',
    expectedManifestSha256: manifestSha256(buildManifest(EXPECTED_ORG_ID, rows)),
    sourceSchemaCheck: skipSchemaCheck,
    targetSchemaCheck: skipSchemaCheck,
  })
  assert.equal(result.exact, true)
  assert.equal(result.catalogVerification.exact, true)
  assert.ok(targetClient.calls.some((call) => call.sql.toLowerCase() === 'commit'))
})

test('verify fails closed when any active source object is missing', async () => {
  await assert.rejects(
    runCatalogSeed({
      sourceClient: new SourceClient([activeClient()]),
      targetClient: new TargetClient([]),
      mode: 'verify',
      sourceSchemaCheck: skipSchemaCheck,
      targetSchemaCheck: skipSchemaCheck,
    }),
    /CATALOG_STATE_NOT_EXACT/,
  )
})

test('source and target schema checks require every column, SELECT and exact owner role', async () => {
  const sourceClient = {
    calls: 0,
    async query() {
      this.calls += 1
      if (this.calls === 1) return { rows: [{
        current_role: SOURCE_OWNER_ROLE,
        table_owner: SOURCE_OWNER_ROLE,
        relpersistence: 'p',
        relrowsecurity: false,
        relforcerowsecurity: false,
      }] }
      if (this.calls === 2) return { rows: REQUIRED_SOURCE_COLUMNS.map((column_name) => ({ column_name })) }
      return { rows: REQUIRED_SOURCE_COLUMNS.map(() => ({ allowed: true })) }
    },
  }
  await assert.doesNotReject(assertSourceSchema(sourceClient))

  const deniedSource = {
    calls: 0,
    async query() {
      this.calls += 1
      if (this.calls === 1) return { rows: [{
        current_role: SOURCE_OWNER_ROLE,
        table_owner: SOURCE_OWNER_ROLE,
        relpersistence: 'p',
        relrowsecurity: false,
        relforcerowsecurity: false,
      }] }
      if (this.calls === 2) return { rows: REQUIRED_SOURCE_COLUMNS.map((column_name) => ({ column_name })) }
      return { rows: REQUIRED_SOURCE_COLUMNS.map((_, index) => ({ allowed: index !== 2 })) }
    },
  }
  await assert.rejects(assertSourceSchema(deniedSource), /SOURCE_READER_PRIVILEGES_NOT_READY/)

  const columnRows = Object.entries(TARGET_COLUMN_RULES).map(([column_name, rule]) => ({
    column_name,
    data_type: rule[0],
    is_nullable: rule[1],
    character_maximum_length: rule[2],
    column_default: rule[3] === undefined ? null : rule[3],
  }))
  const constraintRows = Object.entries(TARGET_CONSTRAINT_RULES).map(([conname, rule]) => ({
    conname,
    contype: rule[0],
    convalidated: true,
    definition: rule[1],
  }))
  const indexRows = [
    'service_object_org_client_idx',
    'service_object_org_object_client_key',
    'service_object_pkey',
  ].map((index_name) => ({
    index_name,
    index_owner: TARGET_OWNER_ROLE,
    is_valid: true,
    is_ready: true,
    definition: index_name === 'service_object_org_client_idx'
      ? 'create index service_object_org_client_idx on public.service_object using btree (org_id, client_id, status) where archived_at is null'
      : `create unique index ${index_name} on public.service_object using btree (org_id)`,
  }))
  const targetClient = {
    calls: 0,
    async query() {
      this.calls += 1
      if (this.calls === 1) {
        return { rows: [{
          current_role: TARGET_OWNER_ROLE,
          table_owner: TARGET_OWNER_ROLE,
          relpersistence: 'p',
          relrowsecurity: false,
          relforcerowsecurity: false,
        }] }
      }
      if (this.calls === 2) return { rows: columnRows }
      if (this.calls === 3) return { rows: constraintRows }
      if (this.calls === 4) return { rows: indexRows }
      return { rows: [{ can_select: true, can_insert: true }] }
    },
  }
  await assert.doesNotReject(assertTargetSchema(targetClient))

  const missingConstraint = {
    calls: 0,
    async query() {
      this.calls += 1
      if (this.calls === 1) {
        return { rows: [{
          current_role: TARGET_OWNER_ROLE,
          table_owner: TARGET_OWNER_ROLE,
          relpersistence: 'p',
          relrowsecurity: false,
          relforcerowsecurity: false,
        }] }
      }
      if (this.calls === 2) return { rows: columnRows }
      return { rows: [] }
    },
  }
  await assert.rejects(
    assertTargetSchema(missingConstraint),
    /TARGET_SERVICE_OBJECT_CONSTRAINT_SET_FINGERPRINT_MISMATCH/,
  )

  const wrongOwner = {
    async query() {
      return { rows: [{
        current_role: 'postgres', table_owner: TARGET_OWNER_ROLE,
        relpersistence: 'p', relrowsecurity: false, relforcerowsecurity: false,
      }] }
    },
  }
  await assert.rejects(assertTargetSchema(wrongOwner), /TARGET_OWNER_ROLE_NOT_READY/)
})

test('CLI identity, confirmation, prefixed source config and sanitized errors are fail closed', async () => {
  await assert.doesNotReject(assertDatabaseIdentity({
    query: async () => ({ rows: [{
      database_name: EXPECTED_DATABASE,
      session_role: EXPECTED_TARGET_SESSION_ROLE,
      current_role: EXPECTED_TARGET_SESSION_ROLE,
      server_version_num: 170004,
      in_recovery: false,
    }] }),
  }, EXPECTED_TARGET_SESSION_ROLE))
  await assert.doesNotReject(assertDatabaseIdentity({
    query: async () => ({ rows: [{
      database_name: EXPECTED_DATABASE,
      session_role: EXPECTED_SOURCE_SESSION_ROLE,
      current_role: EXPECTED_SOURCE_CURRENT_ROLE,
      server_version_num: 170004,
      in_recovery: false,
    }] }),
  }, EXPECTED_SOURCE_SESSION_ROLE, EXPECTED_SOURCE_CURRENT_ROLE))
  await assert.rejects(assertDatabaseIdentity({
    query: async () => ({ rows: [{
      database_name: EXPECTED_DATABASE,
      session_role: 'postgres',
      current_role: 'postgres',
      server_version_num: 170004,
      in_recovery: false,
    }] }),
  }, EXPECTED_TARGET_SESSION_ROLE), /DATABASE_SESSION_ROLE_MISMATCH/)

  const originalArgv = process.argv
  try {
    process.argv = ['node', 'seed', '--apply', `--confirm-manifest-sha256=${'a'.repeat(64)}`]
    assert.doesNotThrow(() => assertApplyConfirmation('apply', 'a'.repeat(64)))
    assert.throws(() => assertApplyConfirmation('apply', 'b'.repeat(64)), /CONFIRM_MANIFEST/)
  } finally {
    process.argv = originalArgv
  }

  assert.deepEqual(sourceClientConfig({
    PROFITABILITY_SOURCE_PGUSER: 'reader',
    PROFITABILITY_SOURCE_PGPASSWORD: 'not-logged',
    PROFITABILITY_SOURCE_PGHOST: '127.0.0.1',
    PROFITABILITY_SOURCE_PGDATABASE: EXPECTED_DATABASE,
    PROFITABILITY_SOURCE_PGPORT: '5432',
  }), {
    user: 'reader', password: 'not-logged', host: '127.0.0.1',
    database: EXPECTED_DATABASE, port: 5432,
  })
  assert.deepEqual(safeError(new Error('password=super-secret')), {
    ok: false,
    code: 'CATALOG_SEED_FAILED',
  })
})

test('manifest export is explicit, exclusive and contains canonical data only', () => {
  const manifest = buildManifest(EXPECTED_ORG_ID, [activeClient()])
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'profitability-catalog-'))
  const output = path.join(directory, 'manifest.json')
  const originalArgv = process.argv
  try {
    process.argv = ['node', 'seed', `--manifest-out=${output}`]
    assert.equal(writeManifestIfRequested(manifest), output)
    assert.equal(fs.readFileSync(output, 'utf8'), `${canonicalStringify(manifest)}\n`)
    assert.throws(() => writeManifestIfRequested(manifest), /EEXIST/)
  } finally {
    process.argv = originalArgv
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('error type exposes only stable code to callers', () => {
  const error = new ProfitabilityCatalogSeedError('CATALOG_CONFLICT', {
    conflicts: [{ kind: 'TARGET_NAME_CONFLICT', objectId: 'LK012' }],
  })
  assert.equal(error.code, 'CATALOG_CONFLICT')
  assert.equal(error.details.conflicts[0].kind, 'TARGET_NAME_CONFLICT')
})
