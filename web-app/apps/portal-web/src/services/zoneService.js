import { deleteZoneForOrg, insertZoneForOrg, updateZoneForOrg, zonesForOrg } from '@dataconnect/generated'
import { ensureFirebase, isFirebaseConfigured } from '../firebase/firebaseClient'

const READ_CACHE_MS = 30000
const zonesCache = new Map()

function cachedZonesKey(orgId) {
  return String(orgId ?? '').trim()
}

function invalidateZonesCache(orgId) {
  const key = cachedZonesKey(orgId)
  if (key) {
    zonesCache.delete(key)
    return
  }
  zonesCache.clear()
}

async function readZonesCached(orgId, loader) {
  const key = cachedZonesKey(orgId)
  const now = Date.now()
  const cached = key ? zonesCache.get(key) : null

  if (cached?.promise) {
    return cached.promise
  }

  if (cached?.expiresAt > now && Array.isArray(cached.value)) {
    return cached.value
  }

  const promise = loader()
    .then((value) => {
      if (key) {
        zonesCache.set(key, { value, expiresAt: Date.now() + READ_CACHE_MS, promise: null })
      }
      return value
    })
    .catch((error) => {
      if (key) {
        zonesCache.delete(key)
      }
      throw error
    })

  if (key) {
    zonesCache.set(key, { value: cached?.value ?? null, expiresAt: cached?.expiresAt ?? 0, promise })
  }

  return promise
}

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

export async function getZones(orgId, options = {}) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  ensureFirebase()
  if (options?.forceRefresh === true || options?.bypassCache === true || options?.noCache === true) {
    invalidateZonesCache(orgId)
  }
  return readZonesCached(orgId, async () => {
    const response = await zonesForOrg({ orgId })
    const rows = response?.data?.zones ?? []
    return rows.map((row) => mapZone(orgId, row))
  })
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
    editedBy: payload?.editedBy ?? null,
    date: payload?.date ?? null,
  })
  invalidateZonesCache(orgId)

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
    editedBy: payload?.editedBy ?? null,
    date: payload?.date ?? null,
  })
  invalidateZonesCache(orgId)

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
  invalidateZonesCache(orgId)

  return {
    success: true,
    orgId,
    zoneId,
  }
}
