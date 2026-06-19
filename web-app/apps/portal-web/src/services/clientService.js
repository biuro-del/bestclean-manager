import {
  clientsForOrg,
  deleteClientForOrg,
  insertClientForOrg,
  updateClientForOrg,
} from '@dataconnect/generated'
import { ensureFirebase, isFirebaseConfigured } from '../firebase/firebaseClient'

const READ_CACHE_MS = 30000
const clientsCache = new Map()
const CLIENT_TYPE_RETAIL = 'DETALICZNY'
const CLIENT_TYPE_RECURRING = 'CYKLICZNY'

const CLIENT_TEXT_FIELD_DEFINITIONS = [
  { field: 'name' },
  { field: 'nip' },
  { field: 'city' },
  { field: 'address' },
  { field: 'contact', aliases: ['phone', 'email'] },
  { field: 'status' },
  { field: 'clientType', aliases: ['client_type', 'typKlienta', 'cooperationModel'] },
  { field: 'coordinator' },
  { field: 'serviceFrequency', aliases: ['frequency', 'czestotliwosc'] },
  { field: 'assignees', aliases: ['workers', 'osobyWykonujace', 'osoby'] },
  { field: 'chemistry', aliases: ['chemia'] },
  { field: 'equipment', aliases: ['sprzet'] },
  { field: 'clientInfo', aliases: ['info', 'informacje'] },
  { field: 'objectType' },
  { field: 'contactPerson' },
  { field: 'phone' },
  { field: 'email' },
  { field: 'emergencyContact' },
  { field: 'contactPosition' },
  { field: 'postalCode' },
  { field: 'accessHours' },
  { field: 'accessMethod' },
  { field: 'serviceEntry' },
  { field: 'serviceType' },
  { field: 'serviceDays' },
  { field: 'preferredHours' },
  { field: 'workMode' },
  { field: 'sla' },
  { field: 'requiredPermissions', aliases: ['permissions'] },
  { field: 'bhpRequirements', aliases: ['bhp'] },
  { field: 'workRestrictions', aliases: ['restrictions'] },
  { field: 'excludedZones' },
  { field: 'operationalRisks' },
  { field: 'specialInstructions' },
  { field: 'specialEquipment' },
  { field: 'storagePlace', aliases: ['storage'] },
  { field: 'backroomAccess' },
  { field: 'technicalNotes' },
  { field: 'internalNotes' },
]

const CLIENT_NUMBER_FIELD_DEFINITIONS = [
  { field: 'rbhAmount', aliases: ['rbh', 'rbhIlosc', 'iloscRbh'] },
]

const CLIENT_TIMESTAMP_FIELD_DEFINITIONS = [
  { field: 'cooperationStartAt', aliases: ['cooperationStart'] },
  { field: 'cooperationEndAt', aliases: ['cooperationEnd'] },
  { field: 'coordinatorChangedAt' },
  { field: 'lastExecutionAt' },
  { field: 'lastWorkerAssignmentAt' },
]

const CLIENT_READONLY_TIMESTAMP_FIELDS = ['createdAt', 'updatedAt']
const CLIENT_DEPLOY_PENDING_FIELDS = ['cooperationEndAt', 'rbhAmount', 'clientType']

function cachedClientsKey(orgId) {
  return String(orgId ?? '').trim()
}

function invalidateClientsCache(orgId) {
  const key = cachedClientsKey(orgId)
  if (key) {
    clientsCache.delete(key)
    return
  }
  clientsCache.clear()
}

function shouldRefreshClientsCache(options = {}) {
  return Boolean(options?.forceRefresh === true || options?.bypassCache === true || options?.noCache === true)
}

async function readClientsCached(orgId, loader, options = {}) {
  const key = cachedClientsKey(orgId)
  const now = Date.now()
  const cached = key ? clientsCache.get(key) : null
  const force = shouldRefreshClientsCache(options)

  if (!force && cached?.promise) {
    return cached.promise
  }

  if (!force && cached?.expiresAt > now && Array.isArray(cached.value)) {
    return cached.value
  }

  const promise = loader()
    .then((value) => {
      if (key) {
        clientsCache.set(key, { value, expiresAt: Date.now() + READ_CACHE_MS, promise: null })
      }
      return value
    })
    .catch((error) => {
      if (key) {
        clientsCache.delete(key)
      }
      throw error
    })

  if (key) {
    clientsCache.set(key, { value: cached?.value ?? null, expiresAt: cached?.expiresAt ?? 0, promise })
  }

  return promise
}

function normalizeStatus(status) {
  const value = String(status ?? '').trim().toLowerCase()

  if (value === 'active' || value === 'aktywny') {
    return 'Aktywny'
  }

  if (value === 'inactive' || value === 'nieaktywny') {
    return 'Nieaktywny'
  }

  if (value === 'wstrzymany' || value === 'suspended') {
    return 'Wstrzymany'
  }

  if (value === 'archiwalny' || value === 'archived') {
    return 'Archiwalny'
  }

  return String(status ?? '').trim() || 'Aktywny'
}

function normalizeClientType(value) {
  const key = String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_-]+/g, '')

  if (key.includes('detal') || key.includes('jednoraz') || key === 'oneoff' || key === 'single') {
    return CLIENT_TYPE_RETAIL
  }

  return CLIENT_TYPE_RECURRING
}

function normalizeClientNameForUniqueness(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function assertClientNameAvailable(rows = [], name = '', currentClientId = '') {
  const normalizedName = normalizeClientNameForUniqueness(name)
  if (!normalizedName) {
    throw new Error('Nazwa klienta jest wymagana.')
  }

  const currentId = String(currentClientId ?? '').trim()
  const duplicate = rows.find((row) => {
    const rowClientId = String(row?.clientId ?? row?.id ?? '').trim()
    if (currentId && rowClientId === currentId) {
      return false
    }
    return normalizeClientNameForUniqueness(row?.name) === normalizedName
  })

  if (duplicate) {
    throw new Error('Taki klient już istnieje.')
  }
}

function asNullableText(value) {
  const raw = String(value ?? '').trim()
  return raw ? raw : null
}

function asNullableTimestamp(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString()
  }

  const raw = String(value ?? '').trim()
  if (!raw) {
    return null
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return `${raw}T00:00:00.000Z`
  }

  return raw
}

function asNullableNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  const raw = String(value ?? '').trim().replace(',', '.')
  if (!raw) {
    return null
  }

  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function pickFirstDefined(source = {}, field = '', aliases = []) {
  if (Object.prototype.hasOwnProperty.call(source, field)) {
    return source[field]
  }

  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(source, alias)) {
      return source[alias]
    }
  }

  return undefined
}

function buildClientSource(payload = {}) {
  const source = { ...payload }

  for (const definition of CLIENT_TEXT_FIELD_DEFINITIONS) {
    const value = pickFirstDefined(payload, definition.field, definition.aliases)
    if (value !== undefined) {
      source[definition.field] = value
    }
  }

  for (const definition of CLIENT_TIMESTAMP_FIELD_DEFINITIONS) {
    const value = pickFirstDefined(payload, definition.field, definition.aliases)
    if (value !== undefined) {
      source[definition.field] = value
    }
  }

  for (const definition of CLIENT_NUMBER_FIELD_DEFINITIONS) {
    const value = pickFirstDefined(payload, definition.field, definition.aliases)
    if (value !== undefined) {
      source[definition.field] = value
    }
  }

  return source
}

function buildMergedClientSource(currentRow = {}, payload = {}) {
  return {
    ...currentRow,
    ...buildClientSource(payload),
  }
}

function nextClientIdFromRows(rows = []) {
  const usedNumbers = new Set()
  const usedIds = new Set()

  rows.forEach((row) => {
    const raw = String(row?.clientId ?? row?.id ?? '').trim()
    if (!raw) return
    usedIds.add(raw.toUpperCase())
    const match = raw.match(/^LK(\d+)$/i)
    if (match) {
      usedNumbers.add(Number(match[1]))
    }
  })

  let nextNumber = 1
  while (usedNumbers.has(nextNumber) || usedIds.has(`LK${String(nextNumber).padStart(3, '0')}`)) {
    nextNumber += 1
  }

  return `LK${String(nextNumber).padStart(3, '0')}`
}

function buildClientMutationPayload(orgId, clientId, source = {}) {
  const payload = {
    orgId,
    clientId,
  }

  for (const definition of CLIENT_TEXT_FIELD_DEFINITIONS) {
    const value = source[definition.field]
    if (definition.field === 'status') {
      payload[definition.field] = asNullableText(value) ?? 'Aktywny'
    } else if (definition.field === 'clientType') {
      payload[definition.field] = normalizeClientType(value)
    } else {
      payload[definition.field] = asNullableText(value)
    }
  }

  for (const definition of CLIENT_TIMESTAMP_FIELD_DEFINITIONS) {
    payload[definition.field] = asNullableTimestamp(source[definition.field])
  }

  for (const definition of CLIENT_NUMBER_FIELD_DEFINITIONS) {
    payload[definition.field] = asNullableNumber(source[definition.field])
  }

  return payload
}

function dataConnectErrorText(error) {
  if (error instanceof Error) {
    return error.message
  }

  try {
    return JSON.stringify(error)
  } catch {
    return String(error ?? '')
  }
}

function unexpectedDataConnectFields(error) {
  const message = dataConnectErrorText(error)
  return CLIENT_DEPLOY_PENDING_FIELDS.filter((field) => message.includes(`$${field} is not expected`))
}

function omitFields(source = {}, fields = []) {
  const next = { ...source }
  fields.forEach((field) => {
    delete next[field]
  })
  return next
}

async function runClientMutationWithDeployCompatibility(runMutation, mutationPayload) {
  try {
    await runMutation(mutationPayload)
    return { savedPayload: mutationPayload, omittedFields: [] }
  } catch (error) {
    const omittedFields = unexpectedDataConnectFields(error)
    if (!omittedFields.length) {
      throw error
    }

    const compatiblePayload = omitFields(mutationPayload, omittedFields)
    await runMutation(compatiblePayload)
    return { savedPayload: compatiblePayload, omittedFields }
  }
}

function mapClient(orgId, row) {
  const base = {
    id: row.clientId,
    clientId: row.clientId,
    orgId,
  }

  for (const definition of CLIENT_TEXT_FIELD_DEFINITIONS) {
    if (definition.field === 'status') {
      base[definition.field] = normalizeStatus(row[definition.field])
    } else if (definition.field === 'clientType') {
      base.clientTypeRaw = String(row[definition.field] ?? '')
      base[definition.field] = normalizeClientType(row[definition.field])
    } else {
      base[definition.field] = String(row[definition.field] ?? '')
    }
  }

  for (const definition of CLIENT_TIMESTAMP_FIELD_DEFINITIONS) {
    base[definition.field] = row[definition.field] ?? ''
  }

  for (const definition of CLIENT_NUMBER_FIELD_DEFINITIONS) {
    base[definition.field] = row[definition.field] ?? ''
  }

  for (const field of CLIENT_READONLY_TIMESTAMP_FIELDS) {
    base[field] = row[field] ?? ''
  }

  return {
    ...base,
    frequency: base.serviceFrequency,
    workers: base.assignees,
    chemia: base.chemistry,
    sprzet: base.equipment,
    info: base.clientInfo,
    informacje: base.clientInfo,
    permissions: base.requiredPermissions,
    bhp: base.bhpRequirements,
    restrictions: base.workRestrictions,
    storage: base.storagePlace,
    cooperationStart: base.cooperationStartAt,
    cooperationEnd: base.cooperationEndAt,
  }
}

export async function getClients(orgId, options = {}) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupelnij web-app/.env.')
  }

  ensureFirebase()
  return readClientsCached(orgId, async () => {
    const response = await clientsForOrg({ orgId })
    const rows = response?.data?.clients ?? []
    return rows.map((row) => mapClient(orgId, row))
  }, options)
}

export async function getClientById(orgId, clientId) {
  const clients = await getClients(orgId)
  return clients.find((client) => client.id === clientId) ?? null
}

export async function createClient(orgId, payload, options = {}) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupelnij web-app/.env.')
  }

  ensureFirebase()
  if (shouldRefreshClientsCache(options)) {
    invalidateClientsCache(orgId)
  }
  const source = buildClientSource(payload)
  const response = await clientsForOrg({ orgId })
  const rows = response?.data?.clients ?? []
  assertClientNameAvailable(rows, source.name)

  const requestedClientId = String(payload?.clientId ?? payload?.id ?? '').trim()
  let clientId = requestedClientId
  if (!clientId) {
    clientId = nextClientIdFromRows(rows)
  }

  const mutationResult = await runClientMutationWithDeployCompatibility(
    insertClientForOrg,
    buildClientMutationPayload(orgId, clientId, source),
  )
  const savedSource = omitFields(source, mutationResult.omittedFields)
  mutationResult.omittedFields.forEach((field) => {
    savedSource[field] = ''
  })
  invalidateClientsCache(orgId)

  return {
    id: clientId,
    clientId,
    orgId,
    ...savedSource,
  }
}

export async function updateClient(orgId, clientId, payload) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupelnij web-app/.env.')
  }

  ensureFirebase()
  const clientsResponse = await clientsForOrg({ orgId })
  const currentRow = (clientsResponse?.data?.clients ?? []).find(
    (row) => String(row?.clientId ?? '').trim() === String(clientId ?? '').trim(),
  )
  const mergedSource = buildMergedClientSource(currentRow ?? {}, payload)
  assertClientNameAvailable(clientsResponse?.data?.clients ?? [], mergedSource.name, clientId)
  const mutationResult = await runClientMutationWithDeployCompatibility(
    updateClientForOrg,
    buildClientMutationPayload(orgId, clientId, mergedSource),
  )
  const savedSource = omitFields(mergedSource, mutationResult.omittedFields)
  mutationResult.omittedFields.forEach((field) => {
    savedSource[field] = currentRow?.[field] ?? ''
  })
  invalidateClientsCache(orgId)

  return {
    id: clientId,
    clientId,
    orgId,
    ...savedSource,
  }
}

export async function deleteClient(orgId, clientId) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupelnij web-app/.env.')
  }

  ensureFirebase()
  await deleteClientForOrg({
    orgId,
    clientId,
  })
  invalidateClientsCache(orgId)

  return {
    success: true,
    orgId,
    clientId,
  }
}
