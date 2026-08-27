const assert = require('node:assert/strict')
const test = require('node:test')

const {
  FacilityManagerObjectError,
  __test,
  createFacilityManagerObjectService,
  normalizeArchivePayload,
  normalizeCreatePayload,
  normalizeUpdatePayload,
} = require('../facility-manager-object-service')

const MANAGER_MEMBERSHIP = {
  role: 'OWNER',
  membership_status: 'ACTIVE',
  organization_kind: 'FACILITY_MANAGER',
  organization_status: 'ACTIVE',
  organization_deleted_at: null,
  worker_active: true,
  worker_status: 'ACTIVE',
}

function objectRow(overrides = {}) {
  return {
    org_id: 'manager_01',
    object_id: 'fmobj_test_01',
    name: 'Biurowiec Zielony',
    address_line_1: 'ul. Ogrodowa 12',
    postal_code: '00-001',
    city: 'Warszawa',
    reference: 'UM/01',
    status: 'ACTIVE',
    version: 1,
    created_at: '2026-08-27T09:00:00.000Z',
    updated_at: '2026-08-27T09:00:00.000Z',
    archived_at: null,
    ...overrides,
  }
}

function createClient({ membership = MANAGER_MEMBERSHIP, insertedRow = objectRow(), replayRow = null, updatedRow = objectRow({ version: 2 }) } = {}) {
  const calls = []
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql: String(sql), params })
      const statement = String(sql)
      if (statement === 'BEGIN' || statement === 'COMMIT' || statement === 'ROLLBACK') return { rows: [] }
      if (statement.includes('from public.organization_member m')) return { rows: membership ? [membership] : [] }
      if (statement.includes('insert into public.facility_manager_object (')) return { rows: insertedRow ? [insertedRow] : [] }
      if (statement.includes('create_payload_fingerprint')) return { rows: replayRow ? [replayRow] : [] }
      if (statement.includes('update public.facility_manager_object')) return { rows: updatedRow ? [updatedRow] : [] }
      if (statement.includes('facility_manager_object_audit')) return { rows: [] }
      if (statement.includes('from public.facility_manager_object')) return { rows: [objectRow()] }
      throw new Error(`Unexpected SQL: ${statement.slice(0, 80)}`)
    },
  }
}

function validPayload() {
  return {
    orgId: 'manager_01',
    name: ' Biurowiec   Zielony ',
    addressLine1: ' ul. Ogrodowa 12 ',
    postalCode: '00001',
    city: ' Warszawa ',
    reference: ' UM/01 ',
    clientActionId: 'fm_action_1234567890',
  }
}

function validUpdatePayload(overrides = {}) {
  return {
    orgId: 'manager_01',
    objectId: 'fmobj_test_01',
    name: 'Biurowiec Zielony',
    addressLine1: 'ul. Ogrodowa 12',
    postalCode: '00-001',
    city: 'Warszawa',
    reference: 'UM/01',
    expectedVersion: 1,
    ...overrides,
  }
}

test('create payload normalizes Polish postcode and rejects foreign fields', () => {
  assert.deepEqual(normalizeCreatePayload(validPayload()), {
    orgId: 'manager_01',
    name: 'Biurowiec Zielony',
    addressLine1: 'ul. Ogrodowa 12',
    postalCode: '00-001',
    city: 'Warszawa',
    reference: 'UM/01',
    clientActionId: 'fm_action_1234567890',
  })
  assert.throws(
    () => normalizeCreatePayload({ ...validPayload(), ownerUid: 'attacker' }),
    (error) => error instanceof FacilityManagerObjectError && error.publicCode === 'INVALID_FACILITY_MANAGER_OBJECT_PAYLOAD',
  )
})

test('only an active owner or administrator in a facility-manager organization can create an object', async () => {
  const service = createFacilityManagerObjectService({
    now: () => new Date('2026-08-27T09:00:00.000Z'),
    objectIdFactory: () => 'fmobj_test_01',
  })
  const client = createClient()

  const result = await service.create({ client, uid: 'uid-owner', payload: validPayload() })

  assert.equal(result.createdNow, true)
  assert.equal(result.object.objectId, 'fmobj_test_01')
  assert.equal(result.object.postalCode, '00-001')
  assert.ok(client.calls.some((call) => call.sql.includes("organization_kind").toString()))
  assert.ok(client.calls.some((call) => call.sql === 'COMMIT'))

  const deniedClient = createClient({ membership: { ...MANAGER_MEMBERSHIP, organization_kind: 'CLEANING_PROVIDER' } })
  await assert.rejects(
    () => service.create({ client: deniedClient, uid: 'uid-owner', payload: validPayload() }),
    (error) => error instanceof FacilityManagerObjectError && error.publicCode === 'FACILITY_MANAGER_OBJECT_ACCESS_DENIED',
  )
  assert.ok(deniedClient.calls.some((call) => call.sql === 'ROLLBACK'))
})

test('an unavailable manager organization cannot call the object API directly', async () => {
  const service = createFacilityManagerObjectService({
    now: () => new Date('2026-08-27T09:00:00.000Z'),
    objectIdFactory: () => 'fmobj_test_01',
  })
  const expiredMembership = { ...MANAGER_MEMBERSHIP, organization_status: 'EXPIRED' }
  const expiredListClient = createClient({ membership: expiredMembership })

  await assert.rejects(
    () => service.list({ client: expiredListClient, uid: 'uid-owner', orgId: 'manager_01' }),
    (error) => error instanceof FacilityManagerObjectError && error.publicCode === 'FACILITY_MANAGER_OBJECT_ACCESS_DENIED',
  )
  assert.equal(expiredListClient.calls.some((call) => call.sql.includes('from public.facility_manager_object')), false)

  const expiredCreateClient = createClient({ membership: expiredMembership })
  await assert.rejects(
    () => service.create({ client: expiredCreateClient, uid: 'uid-owner', payload: validPayload() }),
    (error) => error instanceof FacilityManagerObjectError && error.publicCode === 'FACILITY_MANAGER_OBJECT_ACCESS_DENIED',
  )
  assert.equal(expiredCreateClient.calls.some((call) => call.sql.includes('insert into public.facility_manager_object')), false)
  assert.ok(expiredCreateClient.calls.some((call) => call.sql === 'ROLLBACK'))
})

test('a replayed create action returns the original object without writing a second audit record', async () => {
  const payload = normalizeCreatePayload(validPayload())
  const replay = {
    ...objectRow(),
    create_payload_fingerprint: __test.payloadFingerprint(payload),
  }
  const service = createFacilityManagerObjectService({
    now: () => new Date('2026-08-27T09:00:00.000Z'),
    objectIdFactory: () => 'fmobj_unused',
  })
  const client = createClient({ insertedRow: null, replayRow: replay })

  const result = await service.create({ client, uid: 'uid-owner', payload: validPayload() })

  assert.equal(result.createdNow, false)
  assert.equal(result.object.objectId, 'fmobj_test_01')
  assert.equal(client.calls.filter((call) => call.sql.includes('facility_manager_object_audit')).length, 0)
  assert.ok(client.calls.some((call) => call.sql === 'COMMIT'))
})

test('list reports a retryable module-unavailable error until the additive migration exists', async () => {
  const service = createFacilityManagerObjectService()
  const client = {
    async query(sql) {
      if (String(sql).includes('from public.organization_member m')) return { rows: [MANAGER_MEMBERSHIP] }
      const error = new Error('relation does not exist')
      error.code = '42P01'
      throw error
    },
  }

  await assert.rejects(
    () => service.list({ client, uid: 'uid-owner', orgId: 'manager_01' }),
    (error) => error instanceof FacilityManagerObjectError &&
      error.publicCode === 'FACILITY_MANAGER_OBJECTS_UNAVAILABLE' &&
      error.statusCode === 503,
  )
})

test('edits and archives require a positive expected version and stay in the manager organization', async () => {
  assert.throws(
    () => normalizeUpdatePayload(validUpdatePayload({ expectedVersion: 0 })),
    (error) => error instanceof FacilityManagerObjectError && error.publicCode === 'INVALID_FACILITY_MANAGER_OBJECT_VERSION',
  )
  assert.throws(
    () => normalizeArchivePayload({ orgId: 'manager_01', objectId: 'fmobj_test_01', expectedVersion: 0 }),
    (error) => error instanceof FacilityManagerObjectError && error.publicCode === 'INVALID_FACILITY_MANAGER_OBJECT_VERSION',
  )

  const service = createFacilityManagerObjectService({ now: () => new Date('2026-08-27T09:00:00.000Z') })
  const updateClient = createClient({ updatedRow: objectRow({ version: 2 }) })
  const updated = await service.update({
    client: updateClient,
    uid: 'uid-owner',
    payload: validUpdatePayload(),
  })
  assert.equal(updated.object.version, 2)
  assert.ok(updateClient.calls.some((call) => call.sql.includes("'UPDATED'")))

  const archiveClient = createClient({ updatedRow: objectRow({ status: 'ARCHIVED', version: 3, archived_at: '2026-08-27T09:00:00.000Z' }) })
  const archived = await service.archive({
    client: archiveClient,
    uid: 'uid-owner',
    payload: { orgId: 'manager_01', objectId: 'fmobj_test_01', expectedVersion: 2 },
  })
  assert.equal(archived.object.status, 'ARCHIVED')
  assert.ok(archiveClient.calls.some((call) => call.sql.includes("'ARCHIVED'")))
})
