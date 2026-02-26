import { deleteZoneForOrg, insertZoneForOrg, updateZoneForOrg, zonesForOrg } from '@dataconnect/generated'
import { ensureFirebase, isFirebaseConfigured } from '../firebase/firebaseClient'

function toText(value) {
  return String(value ?? '').trim()
}

function mapZone(orgId, row) {
  const zoneId = toText(row?.ZoneId ?? row?.zoneId ?? row?.id)
  const workerLogin = toText(row?.workerLogin)
  const workerName = toText(
    row?.worker?.workerName ?? row?.worker?.workername ?? row?.worker?.worker_name ?? row?.worker?.name ?? row?.worker?.fullName,
  )

  return {
    id: zoneId,
    zoneId,
    qr: zoneId,
    code: zoneId,
    orgId,
    clientId: toText(row?.clientId),
    name: toText(row?.zone),
    zone: toText(row?.zone),
    function: toText(row?.function),
    location: toText(row?.location),
    workerLogin,
    workerName,
    editedBy: toText(row?.editedBy),
    date: toText(row?.date),
  }
}

export async function getZones(orgId) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  ensureFirebase()
  const response = await zonesForOrg({ orgId })
  const rows = response?.data?.zones ?? []
  return rows.map((row) => mapZone(orgId, row))
}

export async function getZoneById(orgId, zoneId) {
  const zones = await getZones(orgId)
  return zones.find((zone) => zone.id === zoneId) ?? null
}

export async function createZone(orgId, payload) {
  const zoneId = toText(payload?.zoneId ?? payload?.id ?? payload?.code ?? payload?.qr)
  const clientId = toText(payload?.clientId)

  if (!zoneId) {
    throw new Error('Pole zoneId jest wymagane dla createZone(orgId).')
  }

  if (!clientId) {
    throw new Error('Pole clientId jest wymagane dla createZone(orgId).')
  }

  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  ensureFirebase()
  await insertZoneForOrg({
    orgId,
    zoneId,
    clientId,
    zone: payload?.name ?? payload?.zone ?? null,
    function: payload?.function ?? null,
    location: payload?.location ?? null,
    workerLogin: payload?.workerLogin ?? null,
    editedBy: payload?.editedBy ?? null,
    date: payload?.date ?? null,
  })

  return {
    id: zoneId,
    zoneId,
    orgId,
    clientId,
    name: toText(payload?.name ?? payload?.zone),
    function: toText(payload?.function),
    location: toText(payload?.location),
    workerLogin: toText(payload?.workerLogin),
    workerName: toText(payload?.workerName),
    editedBy: toText(payload?.editedBy),
    date: toText(payload?.date),
  }
}

export async function updateZone(orgId, zoneId, payload) {
  const clientId = toText(payload?.clientId)

  if (!clientId) {
    throw new Error('Pole clientId jest wymagane dla updateZone(orgId, zoneId).')
  }

  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  ensureFirebase()
  await updateZoneForOrg({
    orgId,
    zoneId: toText(zoneId),
    clientId,
    zone: payload?.name ?? payload?.zone ?? null,
    function: payload?.function ?? null,
    location: payload?.location ?? null,
    workerLogin: payload?.workerLogin ?? null,
    editedBy: payload?.editedBy ?? null,
    date: payload?.date ?? null,
  })

  return {
    id: zoneId,
    orgId,
    clientId,
    name: toText(payload?.name ?? payload?.zone),
    function: toText(payload?.function),
    location: toText(payload?.location),
    workerLogin: toText(payload?.workerLogin),
    workerName: toText(payload?.workerName),
    editedBy: toText(payload?.editedBy),
    date: toText(payload?.date),
  }
}

export async function deleteZone(orgId, zoneId) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  ensureFirebase()
  await deleteZoneForOrg({
    orgId,
    zoneId: toText(zoneId),
  })

  return {
    success: true,
    orgId,
    zoneId,
  }
}
