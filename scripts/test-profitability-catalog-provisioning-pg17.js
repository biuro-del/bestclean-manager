'use strict'

const assert = require('node:assert/strict')
const { Client } = require('pg')

const accessHarness = require('./test-profitability-access-profile-pg17')
const foundation = require('./test-profitability-foundation-pg17')
const {
  SOURCE_OWNER_ROLE,
  assertSourceSchema,
  assertTargetSchema,
  buildManifest,
  manifestSha256: catalogManifestSha256,
  runCatalogSeed,
} = require('./lib/profitability-service-object-catalog-seed')
const {
  MANIFEST_SCHEMA_VERSION,
  defaultSchemaCheck,
  markerReason,
  manifestSha256,
  normalizeManifest,
  runProvisioning,
} = require('./lib/profitability-access-v2-provisioning')

const EFFECTS = Object.freeze({
  production: false,
  deploy: false,
  notifications: false,
  downstream: false,
})
const BACKUP_REFERENCE = 'local-catalog-provisioning-harness-20260927'

function connectionUrlForRole(connectionString, roleName) {
  const parsed = new URL(connectionString)
  parsed.username = roleName
  parsed.password = ''
  return parsed.toString()
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`
}

async function prepareSource(admin) {
  const sourceOwner = quoteIdentifier(SOURCE_OWNER_ROLE)
  await admin.query(`create role ${sourceOwner} login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls`)
  await admin.query(`alter table public.client add column address text`)
  await admin.query(`alter table public.client add column city varchar(120)`)
  await admin.query(`alter table public.client add column postal_code varchar(20)`)
  await admin.query(`alter table public.client add column status varchar(30) not null default 'AKTYWNY'`)
  await admin.query(`alter table public.organization_member add column worker_id varchar(64)`)
  await admin.query(`alter table public.organization_member add column role varchar(32)`)
  await admin.query(`alter table public.organization_member add column status varchar(20)`)
  await admin.query(
    `insert into public.organizations (org_id, name) values ('bestclean', 'Best Clean')`,
  )
  await admin.query(
    `insert into public.client (
       org_id, client_id, name, address, city, postal_code, status
     ) values ('bestclean', 'LK012', 'Edukatorium', 'Testowa 1', 'Rybnik', '44-200', 'AKTYWNY')`,
  )
  await admin.query(
    `insert into public.organization_member (org_id, uid, worker_id, role, status)
     values ('bestclean', 'uid-owner-001', 'W001', 'OWNER', 'ACTIVE')`,
  )
  await admin.query(`alter table public.client owner to ${sourceOwner}`)
  await admin.query(`grant usage on schema public to ${sourceOwner}`)
  await admin.query(`grant select on public.organizations, public.organization_member to ${sourceOwner}`)
}

function accessManifest() {
  return normalizeManifest({
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    orgId: 'bestclean',
    authoritative: true,
    actor: {
      uid: 'uid-owner-001',
      expectedMembershipRole: 'OWNER',
      expectedMembershipStatus: 'ACTIVE',
    },
    profiles: [{
      uid: 'uid-owner-001',
      expectedWorkerId: 'W001',
      expectedMembershipRole: 'OWNER',
      expectedMembershipStatus: 'ACTIVE',
      profile: {
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
      },
      assignments: [],
    }],
    activation: { reason: 'Local PG17 catalog provisioning harness' },
  })
}

async function runHarness() {
  assert.equal(process.env[foundation.CONFIRMATION_ENV], foundation.EXACT_CONFIRMATION)
  const foundationUrl = process.env[foundation.DATABASE_URL_ENV]
  assert.ok(foundationUrl)
  await accessHarness.runHarness()

  const admin = new Client({ connectionString: foundationUrl })
  await admin.connect()
  try {
    await prepareSource(admin)
  } finally {
    await admin.end()
  }

  const target = new Client({
    connectionString: connectionUrlForRole(foundationUrl, foundation.MIGRATION_EXECUTOR_ROLE),
  })
  const source = new Client({
    connectionString: connectionUrlForRole(foundationUrl, SOURCE_OWNER_ROLE),
  })
  await Promise.all([target.connect(), source.connect()])
  try {
    await source.query(`set role ${quoteIdentifier(SOURCE_OWNER_ROLE)}`)

    await source.query('begin read only')
    await assertSourceSchema(source)
    await source.query('rollback')

    await target.query('begin')
    await target.query(`set local role ${foundation.MIGRATION_RUNNER_ROLE}`)
    await target.query(`set local role ${foundation.OWNER_ROLE}`)
    await assertTargetSchema(target)
    await defaultSchemaCheck(target)
    await target.query('rollback')

    const sourceRows = [{
      org_id: 'bestclean', client_id: 'LK012', name: 'Edukatorium',
      address: 'Testowa 1', city: 'Rybnik', postal_code: '44-200', status: 'AKTYWNY',
    }]
    const expectedCatalogHash = catalogManifestSha256(buildManifest('bestclean', sourceRows))
    const seeded = await runCatalogSeed({
      targetClient: target,
      sourceClient: source,
      mode: 'apply',
      expectedManifestSha256: expectedCatalogHash,
    })
    assert.equal(seeded.exact, true)

    const verifiedCatalog = await runCatalogSeed({
      targetClient: target,
      sourceClient: source,
      mode: 'verify',
    })
    assert.equal(verifiedCatalog.catalogVerification.exact, true)
    assert.equal(verifiedCatalog.catalogVerification.counts.serviceObjects, 1)

    const manifest = accessManifest()
    const applied = await runProvisioning({
      client: target, sourceClient: source, manifest, mode: 'apply',
    })
    assert.equal(applied.exact, true)

    await source.query(
      `update public.client
          set address = 'Address changed after catalog verification', city = 'Gliwice'
        where org_id = 'bestclean' and client_id = 'LK012'`,
    )
    const activated = await runProvisioning({
      client: target,
      sourceClient: source,
      manifest,
      mode: 'activate',
      catalogVerification: verifiedCatalog.catalogVerification,
    })
    assert.equal(activated.activated, true)

    await source.query(
      `update public.client
          set name = 'Edukatorium changed after activation'
        where org_id = 'bestclean' and client_id = 'LK012'`,
    )
    await assert.rejects(
      runProvisioning({
        client: target,
        sourceClient: source,
        manifest,
        mode: 'activate',
        catalogVerification: verifiedCatalog.catalogVerification,
      }),
      (error) => error?.code === 'CATALOG_FINGERPRINT_MISMATCH',
    )
    await source.query(
      `update public.client
          set name = 'Edukatorium'
        where org_id = 'bestclean' and client_id = 'LK012'`,
    )

    await target.query('begin read only')
    await target.query(`set local role ${foundation.MIGRATION_RUNNER_ROLE}`)
    await target.query(`set local role ${foundation.OWNER_ROLE}`)
    const marker = await target.query(
      `select reason from public.profitability_access_enforcement where org_id = 'bestclean'`,
    )
    await target.query('rollback')
    assert.equal(
      marker.rows[0].reason,
      markerReason(manifest, manifestSha256(manifest), verifiedCatalog.catalogVerification),
    )
  } finally {
    await Promise.allSettled([target.end(), source.end()])
  }

  return {
    ok: true,
    backupReference: BACKUP_REFERENCE,
    effects: EFFECTS,
    checks: [
      'foundation-and-access-profile-real-pg17',
      'catalog-default-schema-check',
      'access-provisioning-default-schema-check',
      'source-owner-read-only-catalog',
      'catalog-apply-and-exact-verify',
      'profile-apply-and-catalog-bound-activate',
      'address-drift-does-not-invalidate-authorization-catalog',
      'catalog-name-drift-fails-closed-before-reactivation',
    ],
  }
}

if (require.main === module) {
  runHarness()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error.stack || error)
      process.exitCode = 1
    })
}

module.exports = { BACKUP_REFERENCE, EFFECTS, runHarness }
