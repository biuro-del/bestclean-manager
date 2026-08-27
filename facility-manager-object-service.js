'use strict'

const crypto = require('node:crypto')

const ORGANIZATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const OBJECT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const CLIENT_ACTION_ID_PATTERN = /^[A-Za-z0-9_-]{16,160}$/
const POSTAL_CODE_PATTERN = /^\d{2}-\d{3}$/
const WRITE_ROLES = new Set(['OWNER', 'ADMIN', 'ADMINISTRATOR'])

class FacilityManagerObjectError extends Error {
  constructor(publicCode, publicMessage, statusCode = 400) {
    super(publicMessage)
    this.name = 'FacilityManagerObjectError'
    this.publicCode = publicCode
    this.publicMessage = publicMessage
    this.statusCode = statusCode
  }
}

function text(value) {
  return String(value ?? '').trim()
}

function compactText(value) {
  return text(value).replace(/\s+/g, ' ')
}

function normalizeOrganizationId(value) {
  const orgId = text(value)
  return ORGANIZATION_ID_PATTERN.test(orgId) ? orgId : ''
}

function normalizeObjectId(value) {
  const objectId = text(value)
  return OBJECT_ID_PATTERN.test(objectId) ? objectId : ''
}

function normalizeClientActionId(value) {
  const clientActionId = text(value)
  if (!CLIENT_ACTION_ID_PATTERN.test(clientActionId)) {
    throw new FacilityManagerObjectError(
      'INVALID_FACILITY_MANAGER_OBJECT_ACTION_ID',
      'Nie udało się bezpiecznie przygotować zapisu obiektu. Odśwież stronę i spróbuj ponownie.',
    )
  }
  return clientActionId
}

function requiredText(value, field, label, { min = 2, max = 160 } = {}) {
  const normalized = compactText(value)
  if (normalized.length < min || normalized.length > max) {
    throw new FacilityManagerObjectError(
      `INVALID_FACILITY_MANAGER_OBJECT_${field}`,
      `${label} musi mieć od ${min} do ${max} znaków.`,
    )
  }
  return normalized
}

function optionalText(value, field, label, max = 160) {
  const normalized = compactText(value)
  if (normalized.length > max) {
    throw new FacilityManagerObjectError(
      `INVALID_FACILITY_MANAGER_OBJECT_${field}`,
      `${label} może mieć maksymalnie ${max} znaków.`,
    )
  }
  return normalized
}

function normalizePostalCode(value) {
  const raw = compactText(value).replace(/\s+/g, '')
  const normalized = /^\d{5}$/.test(raw) ? `${raw.slice(0, 2)}-${raw.slice(2)}` : raw
  if (!POSTAL_CODE_PATTERN.test(normalized)) {
    throw new FacilityManagerObjectError(
      'INVALID_FACILITY_MANAGER_OBJECT_POSTAL_CODE',
      'Podaj kod pocztowy w formacie 00-000.',
    )
  }
  return normalized
}

function assertAllowedFields(payload, allowedFields) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new FacilityManagerObjectError(
      'INVALID_FACILITY_MANAGER_OBJECT_PAYLOAD',
      'Dane obiektu są nieprawidłowe.',
    )
  }
  const disallowed = Object.keys(payload).filter((key) => !allowedFields.has(key))
  if (disallowed.length) {
    throw new FacilityManagerObjectError(
      'INVALID_FACILITY_MANAGER_OBJECT_PAYLOAD',
      'Dane obiektu zawierają niedozwolone pola.',
    )
  }
}

function normalizeCreatePayload(payload) {
  assertAllowedFields(payload, new Set(['orgId', 'name', 'addressLine1', 'postalCode', 'city', 'reference', 'clientActionId']))
  const orgId = normalizeOrganizationId(payload.orgId)
  if (!orgId) {
    throw new FacilityManagerObjectError('INVALID_ORG_ID', 'Brak poprawnej organizacji zarządcy.')
  }
  return {
    orgId,
    name: requiredText(payload.name, 'NAME', 'Nazwa obiektu', { min: 2, max: 160 }),
    addressLine1: requiredText(payload.addressLine1, 'ADDRESS', 'Adres obiektu', { min: 2, max: 180 }),
    postalCode: normalizePostalCode(payload.postalCode),
    city: requiredText(payload.city, 'CITY', 'Miejscowość', { min: 2, max: 100 }),
    reference: optionalText(payload.reference, 'REFERENCE', 'Oznaczenie wewnętrzne', 160),
    clientActionId: normalizeClientActionId(payload.clientActionId),
  }
}

function normalizeUpdatePayload(payload) {
  assertAllowedFields(payload, new Set(['orgId', 'objectId', 'name', 'addressLine1', 'postalCode', 'city', 'reference', 'expectedVersion']))
  const orgId = normalizeOrganizationId(payload.orgId)
  const objectId = normalizeObjectId(payload.objectId)
  const expectedVersion = Number(payload.expectedVersion)
  if (!orgId) {
    throw new FacilityManagerObjectError('INVALID_ORG_ID', 'Brak poprawnej organizacji zarządcy.')
  }
  if (!objectId) {
    throw new FacilityManagerObjectError('INVALID_FACILITY_MANAGER_OBJECT_ID', 'Brak poprawnego obiektu.')
  }
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new FacilityManagerObjectError('INVALID_FACILITY_MANAGER_OBJECT_VERSION', 'Obiekt został zmieniony. Odśwież dane i spróbuj ponownie.')
  }
  return {
    orgId,
    objectId,
    name: requiredText(payload.name, 'NAME', 'Nazwa obiektu', { min: 2, max: 160 }),
    addressLine1: requiredText(payload.addressLine1, 'ADDRESS', 'Adres obiektu', { min: 2, max: 180 }),
    postalCode: normalizePostalCode(payload.postalCode),
    city: requiredText(payload.city, 'CITY', 'Miejscowość', { min: 2, max: 100 }),
    reference: optionalText(payload.reference, 'REFERENCE', 'Oznaczenie wewnętrzne', 160),
    expectedVersion,
  }
}

function normalizeArchivePayload(payload) {
  assertAllowedFields(payload, new Set(['orgId', 'objectId', 'expectedVersion']))
  const orgId = normalizeOrganizationId(payload.orgId)
  const objectId = normalizeObjectId(payload.objectId)
  const expectedVersion = Number(payload.expectedVersion)
  if (!orgId) {
    throw new FacilityManagerObjectError('INVALID_ORG_ID', 'Brak poprawnej organizacji zarządcy.')
  }
  if (!objectId) {
    throw new FacilityManagerObjectError('INVALID_FACILITY_MANAGER_OBJECT_ID', 'Brak poprawnego obiektu.')
  }
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new FacilityManagerObjectError('INVALID_FACILITY_MANAGER_OBJECT_VERSION', 'Obiekt został zmieniony. Odśwież dane i spróbuj ponownie.')
  }
  return { orgId, objectId, expectedVersion }
}

function payloadFingerprint(payload) {
  const canonical = JSON.stringify({
    name: payload.name,
    addressLine1: payload.addressLine1,
    postalCode: payload.postalCode,
    city: payload.city,
    reference: payload.reference,
  })
  return crypto.createHash('sha256').update(canonical).digest('hex')
}

function createObjectId() {
  return `fmobj_${crypto.randomBytes(12).toString('hex')}`
}

function mapObjectRow(row = {}) {
  return {
    orgId: text(row.org_id),
    objectId: text(row.object_id),
    name: text(row.name),
    addressLine1: text(row.address_line_1),
    postalCode: text(row.postal_code),
    city: text(row.city),
    reference: text(row.reference),
    status: text(row.status).toUpperCase(),
    version: Number(row.version) || 1,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : '',
    archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : '',
  }
}

function isAllowedManagerRole(value) {
  return WRITE_ROLES.has(text(value).toUpperCase())
}

async function rollbackQuietly(client) {
  try {
    await client.query('ROLLBACK')
  } catch {
    // The original failure is more useful than an unsuccessful rollback.
  }
}

function databaseUnavailableError(error) {
  if (error?.code === '42P01') {
    return new FacilityManagerObjectError(
      'FACILITY_MANAGER_OBJECTS_UNAVAILABLE',
      'Moduł obiektów zarządcy nie jest jeszcze gotowy. Spróbuj ponownie później.',
      503,
    )
  }
  return error
}

function createFacilityManagerObjectService({ now = () => new Date(), objectIdFactory = createObjectId } = {}) {
  if (typeof now !== 'function' || typeof objectIdFactory !== 'function') {
    throw new TypeError('Facility-manager object service dependencies are invalid.')
  }

  async function assertManagerWriteAccess(client, { orgId, uid }) {
    const result = await client.query(
      `select
         case
           when nullif(o.owner_worker_id, '') is not null
            and o.owner_worker_id = m.worker_id then 'OWNER'
           else m.role
         end as role,
         m.status as membership_status,
         o.organization_kind,
         o.status as organization_status,
         o.deleted_at as organization_deleted_at,
         w.active as worker_active,
         w.status as worker_status
       from public.organization_member m
       join public.organizations o
         on o.org_id = m.org_id
       join public.worker w
         on w.org_id = m.org_id
        and w.worker_id = m.worker_id
        and w.auth_uid = m.uid
      where m.org_id = $1::text
        and m.uid = $2::text
      limit 1`,
      [orgId, uid],
    )
    const membership = result.rows?.[0]
    if (
      !membership ||
      text(membership.membership_status).toUpperCase() !== 'ACTIVE' ||
      text(membership.organization_kind).toUpperCase() !== 'FACILITY_MANAGER' ||
      text(membership.organization_status).toUpperCase() === 'SUSPENDED' ||
      membership.organization_deleted_at ||
      membership.worker_active === false ||
      text(membership.worker_status).toUpperCase() === 'DELETED' ||
      !isAllowedManagerRole(membership.role)
    ) {
      throw new FacilityManagerObjectError(
        'FACILITY_MANAGER_OBJECT_ACCESS_DENIED',
        'Nie masz uprawnień do zarządzania obiektami tego panelu.',
        403,
      )
    }
    return membership
  }

  async function list({ client, uid, orgId }) {
    const normalizedOrgId = normalizeOrganizationId(orgId)
    const normalizedUid = text(uid)
    if (!normalizedOrgId || !normalizedUid) {
      throw new FacilityManagerObjectError('INVALID_ORG_ID', 'Brak poprawnej organizacji zarządcy.')
    }
    try {
      await assertManagerWriteAccess(client, { orgId: normalizedOrgId, uid: normalizedUid })
      const result = await client.query(
        `select org_id, object_id, name, address_line_1, postal_code, city, reference,
                status, version, created_at, updated_at, archived_at
           from public.facility_manager_object
          where org_id = $1::text
            and status = 'ACTIVE'
          order by lower(name) asc, object_id asc`,
        [normalizedOrgId],
      )
      return { objects: (result.rows || []).map(mapObjectRow) }
    } catch (error) {
      throw databaseUnavailableError(error)
    }
  }

  async function create({ client, uid, payload }) {
    const input = normalizeCreatePayload(payload)
    const normalizedUid = text(uid)
    if (!normalizedUid) {
      throw new FacilityManagerObjectError('UNAUTHENTICATED', 'Brak tożsamości użytkownika.', 401)
    }
    const fingerprint = payloadFingerprint(input)
    const objectId = objectIdFactory()
    if (!normalizeObjectId(objectId)) {
      throw new Error('Facility-manager object ID generator returned an invalid ID.')
    }

    await client.query('BEGIN')
    try {
      await assertManagerWriteAccess(client, { orgId: input.orgId, uid: normalizedUid })
      const inserted = await client.query(
        `insert into public.facility_manager_object (
           org_id, object_id, name, address_line_1, postal_code, city, reference,
           status, version, created_at, created_by_uid, updated_at, updated_by_uid,
           create_request_key, create_payload_fingerprint
         )
         values (
           $1::text, $2::text, $3::text, $4::text, $5::text, $6::text, nullif($7::text, ''),
           'ACTIVE', 1, $8::timestamptz, $9::text, $8::timestamptz, $9::text,
           $10::text, $11::text
         )
         on conflict (org_id, created_by_uid, create_request_key) do nothing
         returning org_id, object_id, name, address_line_1, postal_code, city, reference,
                   status, version, created_at, updated_at, archived_at`,
        [
          input.orgId,
          objectId,
          input.name,
          input.addressLine1,
          input.postalCode,
          input.city,
          input.reference,
          now().toISOString(),
          normalizedUid,
          input.clientActionId,
          fingerprint,
        ],
      )

      let objectRow = inserted.rows?.[0] ?? null
      let createdNow = Boolean(objectRow)
      if (!objectRow) {
        const replay = await client.query(
          `select org_id, object_id, name, address_line_1, postal_code, city, reference,
                  status, version, created_at, updated_at, archived_at, create_payload_fingerprint
             from public.facility_manager_object
            where org_id = $1::text
              and created_by_uid = $2::text
              and create_request_key = $3::text
            limit 1`,
          [input.orgId, normalizedUid, input.clientActionId],
        )
        objectRow = replay.rows?.[0] ?? null
        if (!objectRow || text(objectRow.create_payload_fingerprint) !== fingerprint) {
          throw new FacilityManagerObjectError(
            'FACILITY_MANAGER_OBJECT_ACTION_REUSED',
            'Ten zapis został już użyty dla innych danych. Odśwież stronę i spróbuj ponownie.',
            409,
          )
        }
        createdNow = false
      }

      if (createdNow) {
        await client.query(
          `insert into public.facility_manager_object_audit (
             org_id, object_id, action, actor_uid, occurred_at
           ) values ($1::text, $2::text, 'CREATED', $3::text, $4::timestamptz)`,
          [input.orgId, text(objectRow.object_id), normalizedUid, now().toISOString()],
        )
      }
      await client.query('COMMIT')
      return { object: mapObjectRow(objectRow), createdNow }
    } catch (error) {
      await rollbackQuietly(client)
      throw databaseUnavailableError(error)
    }
  }

  async function update({ client, uid, payload }) {
    const input = normalizeUpdatePayload(payload)
    const normalizedUid = text(uid)
    if (!normalizedUid) {
      throw new FacilityManagerObjectError('UNAUTHENTICATED', 'Brak tożsamości użytkownika.', 401)
    }
    await client.query('BEGIN')
    try {
      await assertManagerWriteAccess(client, { orgId: input.orgId, uid: normalizedUid })
      const result = await client.query(
        `update public.facility_manager_object
            set name = $3::text,
                address_line_1 = $4::text,
                postal_code = $5::text,
                city = $6::text,
                reference = nullif($7::text, ''),
                version = version + 1,
                updated_at = $8::timestamptz,
                updated_by_uid = $9::text
          where org_id = $1::text
            and object_id = $2::text
            and status = 'ACTIVE'
            and version = $10::integer
        returning org_id, object_id, name, address_line_1, postal_code, city, reference,
                  status, version, created_at, updated_at, archived_at`,
        [
          input.orgId,
          input.objectId,
          input.name,
          input.addressLine1,
          input.postalCode,
          input.city,
          input.reference,
          now().toISOString(),
          normalizedUid,
          input.expectedVersion,
        ],
      )
      const objectRow = result.rows?.[0]
      if (!objectRow) {
        throw new FacilityManagerObjectError(
          'FACILITY_MANAGER_OBJECT_VERSION_CONFLICT',
          'Obiekt został zmieniony lub zarchiwizowany. Odśwież dane i spróbuj ponownie.',
          409,
        )
      }
      await client.query(
        `insert into public.facility_manager_object_audit (
           org_id, object_id, action, actor_uid, occurred_at
         ) values ($1::text, $2::text, 'UPDATED', $3::text, $4::timestamptz)`,
        [input.orgId, input.objectId, normalizedUid, now().toISOString()],
      )
      await client.query('COMMIT')
      return { object: mapObjectRow(objectRow) }
    } catch (error) {
      await rollbackQuietly(client)
      throw databaseUnavailableError(error)
    }
  }

  async function archive({ client, uid, payload }) {
    const input = normalizeArchivePayload(payload)
    const normalizedUid = text(uid)
    if (!normalizedUid) {
      throw new FacilityManagerObjectError('UNAUTHENTICATED', 'Brak tożsamości użytkownika.', 401)
    }
    await client.query('BEGIN')
    try {
      await assertManagerWriteAccess(client, { orgId: input.orgId, uid: normalizedUid })
      const result = await client.query(
        `update public.facility_manager_object
            set status = 'ARCHIVED',
                version = version + 1,
                archived_at = $4::timestamptz,
                archived_by_uid = $5::text,
                updated_at = $4::timestamptz,
                updated_by_uid = $5::text
          where org_id = $1::text
            and object_id = $2::text
            and status = 'ACTIVE'
            and version = $3::integer
        returning org_id, object_id, name, address_line_1, postal_code, city, reference,
                  status, version, created_at, updated_at, archived_at`,
        [input.orgId, input.objectId, input.expectedVersion, now().toISOString(), normalizedUid],
      )
      const objectRow = result.rows?.[0]
      if (!objectRow) {
        throw new FacilityManagerObjectError(
          'FACILITY_MANAGER_OBJECT_VERSION_CONFLICT',
          'Obiekt został zmieniony lub zarchiwizowany. Odśwież dane i spróbuj ponownie.',
          409,
        )
      }
      await client.query(
        `insert into public.facility_manager_object_audit (
           org_id, object_id, action, actor_uid, occurred_at
         ) values ($1::text, $2::text, 'ARCHIVED', $3::text, $4::timestamptz)`,
        [input.orgId, input.objectId, normalizedUid, now().toISOString()],
      )
      await client.query('COMMIT')
      return { object: mapObjectRow(objectRow) }
    } catch (error) {
      await rollbackQuietly(client)
      throw databaseUnavailableError(error)
    }
  }

  return Object.freeze({ archive, create, list, update })
}

module.exports = {
  FacilityManagerObjectError,
  createFacilityManagerObjectService,
  normalizeArchivePayload,
  normalizeCreatePayload,
  normalizeUpdatePayload,
  __test: Object.freeze({
    mapObjectRow,
    normalizePostalCode,
    payloadFingerprint,
  }),
}
