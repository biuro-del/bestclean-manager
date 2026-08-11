import {
  deleteZoneForOrg,
  insertZoneForOrg,
  platformAuthHeaders,
  updateZoneForOrg,
  zonesPageForOrg,
  zonesForOrg,
} from './platformDataConnectService'
import {
  fetchAllReferenceRows,
  isDataConnectOperationNotFound,
} from './referenceDataReadPolicy'
import { ensureFirebase, isFirebaseConfigured } from '../firebase/firebaseClient'

const READ_CACHE_MS = 5 * 60 * 1000
const zonesCache = new Map()
let zonesPageForOrgUnavailable = false

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

function portalApiBase() {
  const raw = toText(import.meta.env.VITE_ADMIN_API_BASE || '/api').replace(/\/+$/, '')
  if (!raw) return '/api'
  return raw.endsWith('/api') ? raw : `${raw}/api`
}

const GENERATED_ZONE_QR_FUNCTIONS = new Set([
  'START',
  'STOP',
  'STOP0',
  'STOP5',
  'STOP10',
  'STOP15',
  'CLEAN',
  'STREFA_SPECJALNA',
])
const LEGACY_UNASSIGNED_CLIENT_ID = 'UNASSIGNED'

function normalizedZoneClientId(value) {
  const clientId = toText(value)
  return clientId.toUpperCase() === LEGACY_UNASSIGNED_CLIENT_ID ? '' : clientId
}

function isGeneratedZoneQr(zone) {
  const zoneId = toText(zone?.zoneId ?? zone?.id ?? zone?.qr)
  const functionName = toText(zone?.function).toUpperCase()
  return /^QRC_[a-z0-9_-]+_Z\d+$/i.test(zoneId) && GENERATED_ZONE_QR_FUNCTIONS.has(functionName)
}

async function parsePortalApiResponse(response) {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(toText(body?.error?.message) || 'Operacja na kodach QR nie powiodła się.')
    error.code = toText(body?.error?.code) || 'PORTAL_ZONE_QR_ERROR'
    error.status = response.status
    throw error
  }
  return body?.data ?? {}
}

function mapZone(orgId, row) {
  const zoneId = toText(row?.ZoneId ?? row?.zoneId ?? row?.id)
  const clientId = normalizedZoneClientId(row?.clientId)
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
    clientId,
    clientName: toText(row?.clientName ?? row?.client?.name),
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

async function fetchZoneRows(orgId) {
  if (!zonesPageForOrgUnavailable) {
    try {
      return await fetchAllReferenceRows({
        loadPage: ({ limit, offset }) => zonesPageForOrg({ orgId, limit, offset }),
        listKey: 'zones',
        keyFields: 'zoneId',
        label: 'stref',
      })
    } catch (error) {
      if (!isDataConnectOperationNotFound(error, 'ZonesPageForOrg')) {
        throw error
      }
      zonesPageForOrgUnavailable = true
    }
  }

  const response = await zonesForOrg({ orgId })
  return Array.isArray(response?.data?.zones) ? response.data.zones : []
}

function sortZonesForDisplay(items = []) {
  return [...items].sort((left, right) => {
    const nameOrder = String(left?.name ?? left?.zone ?? '').localeCompare(
      String(right?.name ?? right?.zone ?? ''),
      'pl',
      { sensitivity: 'base' },
    )
    if (nameOrder) return nameOrder
    return String(left?.zoneId ?? '').localeCompare(String(right?.zoneId ?? ''), 'pl', {
      sensitivity: 'base',
    })
  })
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
    const rows = await fetchZoneRows(orgId)
    return sortZonesForDisplay(rows.map((row) => mapZone(orgId, row)))
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
  const existingZone = await getZoneById(orgId, zoneId)
  const generatedZoneQr = isGeneratedZoneQr(existingZone)

  if (!clientId && !generatedZoneQr) {
    throw new Error('Pole clientId jest wymagane dla updateZone(orgId, zoneId).')
  }

  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  ensureFirebase()
  await updateZoneForOrg({
    orgId,
    zoneId: toText(zoneId),
    clientId: clientId || (generatedZoneQr ? LEGACY_UNASSIGNED_CLIENT_ID : null),
    zone: payload?.name ?? payload?.zone ?? null,
    function: generatedZoneQr ? existingZone.function : payload?.function ?? null,
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
    function: generatedZoneQr ? existingZone.function : toText(payload?.function),
    location: toText(payload?.location),
    workerLogin: toText(payload?.workerLogin),
    workerName: toText(payload?.workerName),
    editedBy: toText(payload?.editedBy),
    date: toText(payload?.date),
  }
}

export async function generateZoneQrCodes(orgId, payload = {}) {
  const supportedFunctions = GENERATED_ZONE_QR_FUNCTIONS
  const fallbackQuantity = Number(payload?.quantity ?? 1)
  const rawItems = Array.isArray(payload?.items)
    ? payload.items
    : (Array.isArray(payload?.functions) ? payload.functions : []).map((functionName) => ({
        function: functionName,
        quantity: fallbackQuantity,
      }))
  const items = rawItems.map((item) => ({
    function: toText(item?.function).toUpperCase(),
    quantity: Number(item?.quantity),
  }))
  if (
    items.length < 1 ||
    items.length > supportedFunctions.size ||
    new Set(items.map((item) => item.function)).size !== items.length ||
    items.some(
      (item) =>
        !supportedFunctions.has(item.function) ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 100,
    )
  ) {
    throw new Error('Wybierz obsługiwane funkcje i podaj dla każdej ilość od 1 do 100.')
  }

  const response = await fetch(`${portalApiBase()}/portal/zones/qr-codes`, {
    method: 'POST',
    headers: {
      ...(await platformAuthHeaders({ requireContext: false })),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      orgId: toText(orgId),
      items,
      clientId: toText(payload?.clientId) || null,
      zone: toText(payload?.zone ?? payload?.name) || null,
    }),
  })
  const data = await parsePortalApiResponse(response)
  const codes = (Array.isArray(data?.codes) ? data.codes : []).map((row) => mapZone(orgId, row))
  invalidateZonesCache(orgId)
  return codes
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
