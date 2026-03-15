import JSZip from 'jszip'
import {
  clientsForOrg,
  deleteClientForOrg,
  deleteEventForOrg,
  deleteIndividualJobForOrg,
  deleteWorkdayForOrg,
  deleteZoneForOrg,
  eventsForOrg,
  individualJobsForOrg,
  insertClientForOrg,
  insertEventForOrg,
  insertIndividualJobForOrg,
  insertWorkdayForOrg,
  insertWorkerForOrg,
  insertZoneForOrg,
  updateClientForOrg,
  updateEventForOrg,
  updateIndividualJobForOrg,
  updateWorkdayForOrg,
  updateZoneForOrg,
  workersForOrg,
  workdaysForOrg,
  zonesForOrg,
} from '@dataconnect/generated'
import { executeMutation, mutationRef } from 'firebase/data-connect'
import { ensureFirebase, isFirebaseConfigured } from '../firebase/firebaseClient'
import {
  deleteOrgStyleForBackup,
  deleteUserStyleForBackup,
  getOrgAndUserStylesForBackup,
  listAvailableStyles,
  upsertOrgStyleForBackup,
  upsertUserStyleForBackup,
} from './styleService'

const BACKUP_SCHEMA_VERSION = '1.0.0'
const BACKUP_DB_NAME = 'portal-backups'
const BACKUP_DB_VERSION = 1
const BACKUP_STORE_NAME = 'archives'
const RETENTION_DAYS = 5
const ONE_DAY_MS = 24 * 60 * 60 * 1000
const AUTH_SNAPSHOT_NOTE =
  'Migawka auth/users.json jest oparta o dane pracownikow z Data Connect (login/email/rola/active). Pelny backup Firebase Auth wymaga backendu z uprawnieniami admin.'

const TYPE_LABELS = {
  full: 'Pelna kopia',
  workers: 'Pracownicy',
  objects: 'Obiekty',
}

const TYPE_FILE_TOKENS = {
  full: 'PELNA',
  workers: 'PRACOWNICY',
  objects: 'OBIEKTY',
}

const PROVIDER_REGISTRY = [
  { id: 'workers', label: 'Pracownicy', types: ['full', 'workers'] },
  { id: 'styles', label: 'Style UI', types: ['full', 'workers'] },
  { id: 'clients', label: 'Klienci/obiekty', types: ['full', 'objects'] },
  { id: 'zones', label: 'Strefy', types: ['full', 'objects'] },
  { id: 'individualOrders', label: 'Zlecenia indywidualne', types: ['full', 'objects'] },
  { id: 'workdays', label: 'Dni pracy', types: ['full', 'workers', 'objects'] },
  { id: 'events', label: 'Zdarzenia', types: ['full', 'workers', 'objects'] },
]

const REQUIRED_PROVIDER_IDS = ['workers', 'styles', 'clients', 'zones', 'individualOrders', 'workdays', 'events']

export const BACKUP_TYPE_OPTIONS = [
  { value: 'full', label: TYPE_LABELS.full },
  { value: 'workers', label: TYPE_LABELS.workers },
  { value: 'objects', label: TYPE_LABELS.objects },
]

function ensureFirebaseOrThrow() {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase/Data Connect. Backup jest niedostepny.')
  }

  const firebase = ensureFirebase()
  if (!firebase?.dataConnect) {
    throw new Error('Nie udalo sie zainicjalizowac Data Connect.')
  }
}

function getDataConnectOrThrow() {
  ensureFirebaseOrThrow()
  const firebase = ensureFirebase()
  if (!firebase?.dataConnect) {
    throw new Error('Nie udalo sie pobrac instancji Data Connect.')
  }
  return firebase.dataConnect
}

function roleSafeText(value) {
  return String(value ?? '').trim()
}

function toNullableText(value) {
  const text = String(value ?? '').trim()
  return text ? text : null
}

function toBoolean(value, fallback = true) {
  if (typeof value === 'boolean') {
    return value
  }
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) {
    return fallback
  }
  if (['1', 'true', 'tak', 'yes', 'y'].includes(normalized)) {
    return true
  }
  if (['0', 'false', 'nie', 'no', 'n'].includes(normalized)) {
    return false
  }
  return fallback
}

function toIso(value) {
  const raw = String(value ?? '').trim()
  if (!raw) {
    return ''
  }
  const date = new Date(raw)
  if (!Number.isFinite(date.getTime())) {
    return ''
  }
  return date.toISOString()
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function nowIso() {
  return new Date().toISOString()
}

function localYmd(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function localYm(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`
}

function previousMonthKey(date = new Date()) {
  const copy = new Date(date.getTime())
  copy.setDate(1)
  copy.setMonth(copy.getMonth() - 1)
  return localYm(copy)
}

function parseTs(value) {
  const iso = toIso(value)
  if (!iso) {
    return 0
  }
  const ts = new Date(iso).getTime()
  return Number.isFinite(ts) ? ts : 0
}

function formatDateTime(value) {
  const iso = toIso(value)
  if (!iso) {
    return '-'
  }
  const date = new Date(iso)
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function formatFileDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}_${pad2(date.getHours())}-${pad2(date.getMinutes())}`
}

function sanitizeTitle(value) {
  const normalized = String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  return normalized || 'KOPIA'
}

function buildFileName(title, type, createdAt = new Date()) {
  const safeTitle = sanitizeTitle(title)
  const typeToken = TYPE_FILE_TOKENS[type] ?? 'PELNA'
  return `${safeTitle}__${typeToken}__${formatFileDateTime(createdAt)}.zip`
}

function normalizeType(type) {
  const raw = String(type ?? '').trim().toLowerCase()
  if (raw === 'workers') return 'workers'
  if (raw === 'objects') return 'objects'
  return 'full'
}

function normalizeSource(source) {
  const raw = String(source ?? '').trim().toLowerCase()
  if (!raw) return 'manual'
  if (['manual', 'auto-daily', 'auto-monthly', 'pre-restore', 'imported-file'].includes(raw)) {
    return raw
  }
  return 'manual'
}

function ensureProviderRegistry() {
  const ids = new Set(PROVIDER_REGISTRY.map((provider) => provider.id))
  const missing = REQUIRED_PROVIDER_IDS.filter((id) => !ids.has(id))
  if (missing.length) {
    throw new Error(`Rejestr providerow backupu jest niekompletny: ${missing.join(', ')}.`)
  }
}

function providersForType(type) {
  const normalizedType = normalizeType(type)
  ensureProviderRegistry()
  return PROVIDER_REGISTRY.filter((provider) => provider.types.includes(normalizedType))
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value))
}

async function sha256(text) {
  const raw = String(text ?? '')
  if (!globalThis.crypto?.subtle) {
    return ''
  }
  const bytes = new TextEncoder().encode(raw)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function assertIndexedDb() {
  if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
    throw new Error('Przegladarka nie obsluguje IndexedDB. Backup lokalny jest niedostepny.')
  }
}

function openBackupDb() {
  assertIndexedDb()
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(BACKUP_DB_NAME, BACKUP_DB_VERSION)
    request.onerror = () => reject(request.error ?? new Error('Nie mozna otworzyc bazy backupu.'))
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(BACKUP_STORE_NAME)) {
        db.createObjectStore(BACKUP_STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

function withStore(mode, action) {
  return openBackupDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(BACKUP_STORE_NAME, mode)
        const store = tx.objectStore(BACKUP_STORE_NAME)
        const done = () => db.close()
        tx.oncomplete = () => {
          done()
          resolve()
        }
        tx.onerror = () => {
          const error = tx.error ?? new Error('Blad transakcji IndexedDB.')
          done()
          reject(error)
        }
        tx.onabort = () => {
          const error = tx.error ?? new Error('Transakcja IndexedDB zostala przerwana.')
          done()
          reject(error)
        }
        try {
          action(store, tx, resolve, reject)
        } catch (error) {
          done()
          reject(error)
        }
      }),
  )
}

function putBackupRecord(record) {
  return withStore('readwrite', (store) => {
    store.put(record)
  })
}

function deleteBackupRecord(id) {
  return withStore('readwrite', (store) => {
    store.delete(id)
  })
}

function getBackupRecordById(id) {
  return withStore('readonly', (store, _tx, resolve, reject) => {
    const request = store.get(id)
    request.onsuccess = () => resolve(request.result ?? null)
    request.onerror = () => reject(request.error ?? new Error('Nie mozna odczytac backupu.'))
  })
}

function getAllBackupRecords() {
  return withStore('readonly', (store, _tx, resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : [])
    request.onerror = () => reject(request.error ?? new Error('Nie mozna odczytac listy backupow.'))
  })
}

function mapRecordToListItem(record) {
  return {
    id: String(record?.id ?? ''),
    orgId: String(record?.orgId ?? ''),
    type: normalizeType(record?.type),
    typeLabel: TYPE_LABELS[normalizeType(record?.type)] ?? TYPE_LABELS.full,
    title: String(record?.title ?? ''),
    createdAt: String(record?.createdAt ?? ''),
    createdAtLabel: formatDateTime(record?.createdAt),
    createdBy: String(record?.createdBy ?? '-'),
    fileName: String(record?.fileName ?? ''),
    source: normalizeSource(record?.source),
    monthKey: String(record?.monthKey ?? ''),
    sizeBytes: Number(record?.sizeBytes ?? 0) || 0,
    integrityStatus: String(record?.integrityStatus ?? 'unknown'),
    integrityMessage: String(record?.integrityMessage ?? ''),
    schemaVersion: String(record?.schemaVersion ?? ''),
    modules: Array.isArray(record?.modules) ? deepClone(record.modules) : [],
    hasBlob: record?.blob instanceof Blob,
  }
}

function createRecordId() {
  return `BK-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function buildStylesBackupRows(snapshot = {}) {
  const rows = []
  const orgStyleId = roleSafeText(snapshot?.orgDefault?.defaultStyleId)
  if (orgStyleId) {
    rows.push({
      kind: 'org-default',
      styleId: orgStyleId,
      updatedAt: roleSafeText(snapshot?.orgDefault?.updatedAt),
      updatedBy: roleSafeText(snapshot?.orgDefault?.updatedBy),
    })
  }

  const preferences = Array.isArray(snapshot?.userPreferences) ? snapshot.userPreferences : []
  preferences.forEach((item) => {
    const uid = roleSafeText(item?.uid)
    const styleId = roleSafeText(item?.styleId)
    if (!uid || !styleId) {
      return
    }

    rows.push({
      kind: 'user-preference',
      uid,
      styleId,
      updatedAt: roleSafeText(item?.updatedAt),
      updatedBy: roleSafeText(item?.updatedBy),
    })
  })

  return rows
}

async function fetchRawDataset(orgId) {
  ensureFirebaseOrThrow()

  const [workersResponse, clientsResponse, zonesResponse, individualResponse, eventsResponse, workdaysResponse, styleSnapshot] = await Promise.all([
    workersForOrg({ orgId }),
    clientsForOrg({ orgId }),
    zonesForOrg({ orgId }),
    individualJobsForOrg({ orgId }),
    eventsForOrg({ orgId }),
    workdaysForOrg({ orgId }),
    getOrgAndUserStylesForBackup(orgId),
  ])

  return {
    workers: deepClone(workersResponse?.data?.workers ?? []),
    styles: deepClone(buildStylesBackupRows(styleSnapshot)),
    clients: deepClone(clientsResponse?.data?.clients ?? []),
    zones: deepClone(zonesResponse?.data?.zones ?? []),
    individualOrders: deepClone(individualResponse?.data?.individualClientJobs ?? []),
    events: deepClone(eventsResponse?.data?.events ?? []),
    workdays: deepClone(workdaysResponse?.data?.workdays ?? []),
  }
}

function filterDatasetByType(dataset, type) {
  const normalizedType = normalizeType(type)
  const source = {
    workers: Array.isArray(dataset?.workers) ? dataset.workers : [],
    styles: Array.isArray(dataset?.styles) ? dataset.styles : [],
    clients: Array.isArray(dataset?.clients) ? dataset.clients : [],
    zones: Array.isArray(dataset?.zones) ? dataset.zones : [],
    individualOrders: Array.isArray(dataset?.individualOrders) ? dataset.individualOrders : [],
    events: Array.isArray(dataset?.events) ? dataset.events : [],
    workdays: Array.isArray(dataset?.workdays) ? dataset.workdays : [],
  }

  if (normalizedType === 'full') {
    return source
  }

  if (normalizedType === 'workers') {
    const workerLogins = new Set(
      source.workers
        .map((row) => String(row?.login ?? '').trim())
        .filter(Boolean),
    )
    return {
      ...source,
      clients: [],
      zones: [],
      individualOrders: [],
      events: source.events.filter((row) => workerLogins.has(String(row?.workerLogin ?? '').trim())),
      workdays: source.workdays.filter((row) => workerLogins.has(String(row?.workerLogin ?? '').trim())),
    }
  }

  const zoneIds = new Set(
    source.zones
      .map((row) => String(row?.zoneId ?? '').trim())
      .filter(Boolean),
  )

  return {
    ...source,
    workers: [],
    styles: [],
    events: source.events.filter((row) => zoneIds.has(String(row?.zoneId ?? '').trim())),
    workdays: source.workdays.filter((row) => zoneIds.has(String(row?.utilityRoomId ?? '').trim())),
  }
}

function deriveAuthSnapshot(workersRows = []) {
  const users = workersRows
    .map((row) => {
      const login = roleSafeText(row?.login)
      if (!login) {
        return null
      }
      return {
        login,
        email: roleSafeText(row?.email ?? row?.loginEmail),
        loginEmail: roleSafeText(row?.loginEmail ?? row?.email),
        role: roleSafeText(row?.role),
        workerType: roleSafeText(row?.workerType),
        active: toBoolean(row?.active, true),
      }
    })
    .filter(Boolean)

  return {
    mode: 'derived-from-workers',
    note: AUTH_SNAPSHOT_NOTE,
    users,
  }
}

function createManifestBase({ orgId, type, title, createdAt, createdBy, source, monthKey }) {
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    orgId: String(orgId ?? '').trim(),
    type: normalizeType(type),
    title: String(title ?? '').trim(),
    createdAt: String(createdAt ?? nowIso()),
    createdBy: String(createdBy ?? '-').trim() || '-',
    source: normalizeSource(source),
    monthKey: String(monthKey ?? '').trim(),
    modules: [],
    checksums: {},
  }
}

async function buildBackupArchive({ orgId, type, title, createdBy, source = 'manual', monthKey = '' }) {
  const normalizedType = normalizeType(type)
  const createdAt = nowIso()
  const dataset = await fetchRawDataset(orgId)
  const filteredDataset = filterDatasetByType(dataset, normalizedType)
  const selectedProviders = providersForType(normalizedType)

  const manifest = createManifestBase({
    orgId,
    type: normalizedType,
    title,
    createdAt,
    createdBy,
    source,
    monthKey,
  })

  const zip = new JSZip()
  const moduleSummaries = []

  for (const provider of selectedProviders) {
    const rows = Array.isArray(filteredDataset?.[provider.id]) ? filteredDataset[provider.id] : []
    const filePath = `data/${provider.id}.json`
    const payload = {
      moduleId: provider.id,
      moduleLabel: provider.label,
      records: rows,
    }
    const json = JSON.stringify(payload, null, 2)
    const checksum = await sha256(json)

    zip.file(filePath, json)
    manifest.checksums[filePath] = checksum
    moduleSummaries.push({
      id: provider.id,
      label: provider.label,
      file: filePath,
      records: rows.length,
      checksum,
    })
  }

  if (normalizedType === 'full') {
    const authSnapshot = deriveAuthSnapshot(filteredDataset.workers ?? [])
    const authFilePath = 'auth/users.json'
    const authJson = JSON.stringify(authSnapshot, null, 2)
    const authChecksum = await sha256(authJson)
    zip.file(authFilePath, authJson)
    manifest.checksums[authFilePath] = authChecksum
    manifest.auth = {
      file: authFilePath,
      mode: authSnapshot.mode,
      users: authSnapshot.users.length,
      checksum: authChecksum,
      note: authSnapshot.note,
    }
  }

  manifest.modules = moduleSummaries
  const manifestJson = JSON.stringify(manifest, null, 2)
  zip.file('manifest.json', manifestJson)
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  return {
    blob,
    manifest,
    createdAt,
    fileName: buildFileName(title, normalizedType, new Date(createdAt)),
  }
}

async function parseBackupArchiveBlob(blob) {
  if (!(blob instanceof Blob)) {
    throw new Error('Niepoprawny plik backupu (oczekiwano Blob).')
  }

  const zip = await JSZip.loadAsync(blob)
  const manifestEntry = zip.file('manifest.json')
  if (!manifestEntry) {
    throw new Error('Brak pliku manifest.json w backupie.')
  }

  const manifestRaw = await manifestEntry.async('string')
  let manifest
  try {
    manifest = JSON.parse(manifestRaw)
  } catch {
    throw new Error('manifest.json ma niepoprawny format JSON.')
  }

  const schemaVersion = String(manifest?.schemaVersion ?? '').trim()
  if (!schemaVersion) {
    throw new Error('Brak schemaVersion w manifeście backupu.')
  }

  const modulePayloads = {}
  const integrityIssues = []
  const modules = Array.isArray(manifest?.modules) ? manifest.modules : []

  for (const moduleInfo of modules) {
    const moduleId = String(moduleInfo?.id ?? '').trim()
    const filePath = String(moduleInfo?.file ?? '').trim()
    if (!moduleId || !filePath) {
      integrityIssues.push(`Niepoprawna definicja modułu w manifeście: ${JSON.stringify(moduleInfo)}`)
      continue
    }

    const entry = zip.file(filePath)
    if (!entry) {
      integrityIssues.push(`Brak pliku modułu ${filePath}.`)
      continue
    }

    const raw = await entry.async('string')
    const expectedChecksum = String(moduleInfo?.checksum ?? manifest?.checksums?.[filePath] ?? '').trim()
    const currentChecksum = await sha256(raw)

    if (expectedChecksum && currentChecksum && expectedChecksum !== currentChecksum) {
      integrityIssues.push(`Niezgodna suma kontrolna modułu ${moduleId}.`)
      continue
    }

    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      integrityIssues.push(`Moduł ${moduleId} nie jest poprawnym JSON.`)
      continue
    }

    const rows = Array.isArray(parsed?.records) ? parsed.records : []
    modulePayloads[moduleId] = rows
  }

  if (manifest?.auth?.file) {
    const authPath = String(manifest.auth.file)
    const authEntry = zip.file(authPath)
    if (!authEntry) {
      integrityIssues.push(`Brak pliku auth ${authPath}.`)
    } else {
      const raw = await authEntry.async('string')
      const expectedChecksum = String(manifest?.auth?.checksum ?? manifest?.checksums?.[authPath] ?? '').trim()
      const currentChecksum = await sha256(raw)
      if (expectedChecksum && currentChecksum && expectedChecksum !== currentChecksum) {
        integrityIssues.push('Niezgodna suma kontrolna auth/users.json.')
      } else {
        try {
          manifest.authPreview = JSON.parse(raw)
        } catch {
          integrityIssues.push('auth/users.json nie jest poprawnym JSON.')
        }
      }
    }
  }

  return {
    manifest,
    modulePayloads,
    integrityOk: integrityIssues.length === 0,
    integrityIssues,
    blob,
  }
}

async function storeBackupRecord({
  orgId,
  type,
  title,
  createdAt,
  createdBy,
  source,
  monthKey = '',
  blob,
  manifest,
  integrityStatus = 'ok',
  integrityMessage = '',
}) {
  const normalizedType = normalizeType(type)
  const record = {
    id: createRecordId(),
    orgId: String(orgId ?? '').trim(),
    type: normalizedType,
    title: String(title ?? '').trim() || TYPE_LABELS[normalizedType],
    createdAt: String(createdAt ?? nowIso()),
    createdBy: String(createdBy ?? '-').trim() || '-',
    source: normalizeSource(source),
    monthKey: String(monthKey ?? '').trim(),
    fileName: buildFileName(title, normalizedType, new Date(createdAt ?? nowIso())),
    sizeBytes: Number(blob?.size ?? 0) || 0,
    integrityStatus: String(integrityStatus ?? 'unknown'),
    integrityMessage: String(integrityMessage ?? ''),
    schemaVersion: String(manifest?.schemaVersion ?? ''),
    modules: Array.isArray(manifest?.modules) ? deepClone(manifest.modules) : [],
    blob,
  }
  await putBackupRecord(record)
  return mapRecordToListItem(record)
}

function maybeParseDateYmd(createdAt) {
  const iso = toIso(createdAt)
  if (!iso) {
    return ''
  }
  return iso.slice(0, 10)
}

async function applyRetentionPolicy(orgId, options = {}) {
  const keepPreRestoreId = String(options.keepPreRestoreId ?? '').trim()
  const records = (await getAllBackupRecords())
    .filter((record) => String(record?.orgId ?? '') === String(orgId ?? ''))
    .sort((left, right) => parseTs(right?.createdAt) - parseTs(left?.createdAt))

  const nowTs = Date.now()
  const cutoffTs = nowTs - RETENTION_DAYS * ONE_DAY_MS
  const toDelete = new Set()

  const monthly = records.filter((record) => normalizeSource(record?.source) === 'auto-monthly')
  monthly.slice(1).forEach((record) => {
    toDelete.add(String(record.id))
  })

  const preRestore = records.filter((record) => normalizeSource(record?.source) === 'pre-restore')
  preRestore.forEach((record, index) => {
    const id = String(record.id)
    if (id === keepPreRestoreId) {
      return
    }
    if (index > 0) {
      toDelete.add(id)
    }
  })

  records.forEach((record) => {
    const source = normalizeSource(record?.source)
    if (source === 'auto-monthly' || source === 'pre-restore') {
      return
    }

    const createdTs = parseTs(record?.createdAt)
    if (createdTs && createdTs < cutoffTs) {
      toDelete.add(String(record.id))
    }
  })

  for (const id of toDelete) {
    await deleteBackupRecord(id)
  }

  return {
    deleted: toDelete.size,
  }
}

function mapRowsByKey(rows, keyName) {
  const map = new Map()
  ;(Array.isArray(rows) ? rows : []).forEach((row) => {
    const key = String(row?.[keyName] ?? '').trim()
    if (key) {
      map.set(key, row)
    }
  })
  return map
}

const AVAILABLE_STYLE_IDS = new Set(
  listAvailableStyles()
    .map((item) => roleSafeText(item?.id))
    .filter(Boolean),
)

function isKnownStyleId(styleId) {
  const normalized = roleSafeText(styleId)
  return Boolean(normalized) && AVAILABLE_STYLE_IDS.has(normalized)
}

function normalizeWorkerInsertVars(orgId, row) {
  const login = roleSafeText(row?.login)
  if (!login) {
    return null
  }

  return {
    orgId,
    login,
    fullName: toNullableText(row?.fullName ?? row?.workerName),
    loginEmail: toNullableText(row?.loginEmail ?? row?.email),
    role: toNullableText(row?.role),
    active: toBoolean(row?.active, true),
    email: toNullableText(row?.email ?? row?.loginEmail),
    phone: toNullableText(row?.phone),
    workerType: toNullableText(row?.workerType ?? row?.role),
    workerId: toNullableText(row?.workerId ?? row?.id),
  }
}

async function updateWorkerViaOperation(orgId, row) {
  const login = roleSafeText(row?.login)
  if (!login) {
    return false
  }

  const dataConnect = getDataConnectOrThrow()
  await executeMutation(
    mutationRef(dataConnect, 'UpdateWorkerForOrg', {
      orgId,
      login,
      workerName: toNullableText(row?.fullName ?? row?.workerName),
      loginEmail: toNullableText(row?.loginEmail ?? row?.email),
      role: toNullableText(row?.role ?? row?.workerType) ?? 'Worker',
      active: toBoolean(row?.active, true),
      email: toNullableText(row?.email ?? row?.loginEmail),
      phone: toNullableText(row?.phone),
      workerType: toNullableText(row?.workerType ?? row?.role),
      workerId: toNullableText(row?.workerId ?? row?.id) ?? login,
      edit: toNullableText(row?.edit ?? row?.updatedBy ?? row?.editedBy),
    }),
  )

  return true
}

async function restoreWorkersModule(orgId, rows) {
  const importedRows = Array.isArray(rows) ? rows : []
  const currentResponse = await workersForOrg({ orgId })
  const currentRows = currentResponse?.data?.workers ?? []

  const importedMap = mapRowsByKey(importedRows, 'login')
  const currentMap = mapRowsByKey(currentRows, 'login')

  let created = 0
  let updated = 0
  let deactivated = 0
  let skipped = 0

  for (const row of importedRows) {
    const vars = normalizeWorkerInsertVars(orgId, row)
    if (!vars) {
      skipped += 1
      continue
    }

    if (currentMap.has(vars.login)) {
      await updateWorkerViaOperation(orgId, row)
      updated += 1
      continue
    }

    await insertWorkerForOrg(vars)
    created += 1
  }

  for (const currentRow of currentRows) {
    const login = roleSafeText(currentRow?.login)
    if (!login || importedMap.has(login)) {
      continue
    }

    const deactivatePayload = {
      ...currentRow,
      login,
      active: false,
    }
    await updateWorkerViaOperation(orgId, deactivatePayload)
    deactivated += 1
  }

  return {
    moduleId: 'workers',
    created,
    updated,
    deleted: 0,
    deactivated,
    skipped,
  }
}

async function restoreStylesModule(orgId, rows) {
  const importedRows = Array.isArray(rows) ? rows : []
  const importedUserPreferences = new Map()
  let importedOrgStyleId = ''
  let skipped = 0

  importedRows.forEach((row) => {
    const kind = roleSafeText(row?.kind).toLowerCase()
    const styleId = roleSafeText(row?.styleId)
    if (!isKnownStyleId(styleId)) {
      skipped += 1
      return
    }

    if (kind === 'org-default') {
      importedOrgStyleId = styleId
      return
    }

    if (kind === 'user-preference') {
      const uid = roleSafeText(row?.uid)
      if (!uid) {
        skipped += 1
        return
      }
      importedUserPreferences.set(uid, {
        uid,
        styleId,
        updatedBy: roleSafeText(row?.updatedBy) || 'backup-restore',
      })
      return
    }

    skipped += 1
  })

  const current = await getOrgAndUserStylesForBackup(orgId)
  const currentOrgStyleId = roleSafeText(current?.orgDefault?.defaultStyleId)
  const currentUserPreferences = new Map(
    (Array.isArray(current?.userPreferences) ? current.userPreferences : [])
      .map((item) => {
        const uid = roleSafeText(item?.uid)
        const styleId = roleSafeText(item?.styleId)
        if (!uid || !styleId) {
          return null
        }
        return [uid, styleId]
      })
      .filter(Boolean),
  )

  let created = 0
  let updated = 0
  let deleted = 0

  if (importedOrgStyleId) {
    await upsertOrgStyleForBackup({
      orgId,
      styleId: importedOrgStyleId,
      updatedBy: 'backup-restore',
    })
    if (currentOrgStyleId) {
      updated += 1
    } else {
      created += 1
    }
  } else if (currentOrgStyleId) {
    await deleteOrgStyleForBackup({ orgId })
    deleted += 1
  }

  for (const preference of importedUserPreferences.values()) {
    await upsertUserStyleForBackup({
      orgId,
      uid: preference.uid,
      styleId: preference.styleId,
      updatedBy: preference.updatedBy || 'backup-restore',
    })
    if (currentUserPreferences.has(preference.uid)) {
      updated += 1
    } else {
      created += 1
    }
  }

  for (const uid of currentUserPreferences.keys()) {
    if (importedUserPreferences.has(uid)) {
      continue
    }

    await deleteUserStyleForBackup({ orgId, uid })
    deleted += 1
  }

  return {
    moduleId: 'styles',
    created,
    updated,
    deleted,
    skipped,
  }
}

async function restoreClientsModule(orgId, rows) {
  const importedRows = Array.isArray(rows) ? rows : []
  const currentResponse = await clientsForOrg({ orgId })
  const currentRows = currentResponse?.data?.clients ?? []
  const currentMap = mapRowsByKey(currentRows, 'clientId')
  const importedMap = mapRowsByKey(importedRows, 'clientId')

  let created = 0
  let updated = 0
  let deleted = 0
  let skipped = 0

  for (const row of importedRows) {
    const clientId = roleSafeText(row?.clientId)
    if (!clientId) {
      skipped += 1
      continue
    }

    const payload = {
      orgId,
      clientId,
      name: toNullableText(row?.name),
      nip: toNullableText(row?.nip),
      city: toNullableText(row?.city),
      address: toNullableText(row?.address),
      contact: toNullableText(row?.contact),
      status: toNullableText(row?.status),
      coordinator: toNullableText(row?.coordinator),
      serviceFrequency: toNullableText(row?.serviceFrequency),
      assignees: toNullableText(row?.assignees),
      chemistry: toNullableText(row?.chemistry),
      equipment: toNullableText(row?.equipment),
      clientInfo: toNullableText(row?.clientInfo),
    }

    if (currentMap.has(clientId)) {
      await updateClientForOrg(payload)
      updated += 1
    } else {
      await insertClientForOrg(payload)
      created += 1
    }
  }

  for (const row of currentRows) {
    const clientId = roleSafeText(row?.clientId)
    if (!clientId || importedMap.has(clientId)) {
      continue
    }
    await deleteClientForOrg({ orgId, clientId })
    deleted += 1
  }

  return {
    moduleId: 'clients',
    created,
    updated,
    deleted,
    skipped,
  }
}

async function restoreZonesModule(orgId, rows) {
  const importedRows = Array.isArray(rows) ? rows : []
  const currentResponse = await zonesForOrg({ orgId })
  const currentRows = currentResponse?.data?.zones ?? []
  const currentMap = mapRowsByKey(currentRows, 'zoneId')
  const importedMap = mapRowsByKey(importedRows, 'zoneId')

  let created = 0
  let updated = 0
  let deleted = 0
  let skipped = 0

  for (const row of importedRows) {
    const zoneId = roleSafeText(row?.zoneId)
    const clientId = roleSafeText(row?.clientId)
    if (!zoneId || !clientId) {
      skipped += 1
      continue
    }

    const payload = {
      orgId,
      zoneId,
      clientId,
      zone: toNullableText(row?.zone),
      function: toNullableText(row?.function),
      editedBy: toNullableText(row?.editedBy),
      date: toNullableText(row?.date),
      location: toNullableText(row?.location),
    }

    if (currentMap.has(zoneId)) {
      await updateZoneForOrg(payload)
      updated += 1
    } else {
      await insertZoneForOrg(payload)
      created += 1
    }
  }

  for (const row of currentRows) {
    const zoneId = roleSafeText(row?.zoneId)
    if (!zoneId || importedMap.has(zoneId)) {
      continue
    }
    await deleteZoneForOrg({ orgId, zoneId })
    deleted += 1
  }

  return {
    moduleId: 'zones',
    created,
    updated,
    deleted,
    skipped,
  }
}

async function restoreIndividualOrdersModule(orgId, rows) {
  const importedRows = Array.isArray(rows) ? rows : []
  const currentResponse = await individualJobsForOrg({ orgId })
  const currentRows = currentResponse?.data?.individualClientJobs ?? []
  const currentMap = mapRowsByKey(currentRows, 'clientIndId')
  const importedMap = mapRowsByKey(importedRows, 'clientIndId')

  let created = 0
  let updated = 0
  let deleted = 0
  let skipped = 0

  for (const row of importedRows) {
    const clientIndId = roleSafeText(row?.clientIndId)
    if (!clientIndId) {
      skipped += 1
      continue
    }

    const payload = {
      orgId,
      clientIndId,
      date: toNullableText(row?.date),
      name: toNullableText(row?.name),
      nip: toNullableText(row?.nip),
      city: toNullableText(row?.city),
      address: toNullableText(row?.address),
      contact: toNullableText(row?.contact),
      clientInfo: toNullableText(row?.clientInfo),
      qrCode: toNullableText(row?.qrCode),
    }

    if (currentMap.has(clientIndId)) {
      await updateIndividualJobForOrg(payload)
      updated += 1
    } else {
      await insertIndividualJobForOrg(payload)
      created += 1
    }
  }

  for (const row of currentRows) {
    const clientIndId = roleSafeText(row?.clientIndId)
    if (!clientIndId || importedMap.has(clientIndId)) {
      continue
    }
    await deleteIndividualJobForOrg({ orgId, clientIndId })
    deleted += 1
  }

  return {
    moduleId: 'individualOrders',
    created,
    updated,
    deleted,
    skipped,
  }
}

async function restoreWorkdaysModule(orgId, rows) {
  const importedRows = Array.isArray(rows) ? rows : []
  const currentResponse = await workdaysForOrg({ orgId })
  const currentRows = currentResponse?.data?.workdays ?? []
  const currentMap = mapRowsByKey(currentRows, 'workdayId')
  const importedMap = mapRowsByKey(importedRows, 'workdayId')

  let created = 0
  let updated = 0
  let deleted = 0
  let skipped = 0

  for (const row of importedRows) {
    const workdayId = roleSafeText(row?.workdayId)
    const workerLogin = roleSafeText(row?.workerLogin)
    if (!workdayId || !workerLogin) {
      skipped += 1
      continue
    }

    const payload = {
      orgId,
      workdayId,
      workerLogin,
      workerName: toNullableText(row?.workerName),
      utilityRoomId: toNullableText(row?.utilityRoomId),
      startAt: toNullableText(row?.startAt),
      endAt: toNullableText(row?.endAt),
      durationSec: Number.isFinite(Number(row?.durationSec)) ? Number(row.durationSec) : null,
      status: toNullableText(row?.status),
      comment: toNullableText(row?.comment),
      updatedBy: toNullableText(row?.updatedBy),
    }

    if (currentMap.has(workdayId)) {
      await updateWorkdayForOrg(payload)
      updated += 1
    } else {
      await insertWorkdayForOrg(payload)
      created += 1
    }
  }

  for (const row of currentRows) {
    const workdayId = roleSafeText(row?.workdayId)
    if (!workdayId || importedMap.has(workdayId)) {
      continue
    }
    await deleteWorkdayForOrg({ orgId, workdayId })
    deleted += 1
  }

  return {
    moduleId: 'workdays',
    created,
    updated,
    deleted,
    skipped,
  }
}

async function restoreEventsModule(orgId, rows) {
  const importedRows = Array.isArray(rows) ? rows : []
  const currentResponse = await eventsForOrg({ orgId })
  const currentRows = currentResponse?.data?.events ?? []
  const currentMap = mapRowsByKey(currentRows, 'eventId')
  const importedMap = mapRowsByKey(importedRows, 'eventId')

  let created = 0
  let updated = 0
  let deleted = 0
  let skipped = 0

  for (const row of importedRows) {
    const eventId = roleSafeText(row?.eventId)
    if (!eventId) {
      skipped += 1
      continue
    }

    const payload = {
      orgId,
      eventId,
      zoneId: toNullableText(row?.zoneId),
      workerLogin: toNullableText(row?.workerLogin),
      startAt: toNullableText(row?.startAt),
      endAt: toNullableText(row?.endAt),
      durationSec: Number.isFinite(Number(row?.durationSec)) ? Number(row.durationSec) : null,
      status: toNullableText(row?.status),
      closeMarkedAt: toNullableText(row?.closeMarkedAt),
      endReason: toNullableText(row?.endReason),
      comment: toNullableText(row?.comment),
      deviceId: toNullableText(row?.deviceId),
      startEventId: toNullableText(row?.startEventId),
      endEventId: toNullableText(row?.endEventId),
    }

    if (currentMap.has(eventId)) {
      await updateEventForOrg(payload)
      updated += 1
    } else {
      await insertEventForOrg(payload)
      created += 1
    }
  }

  for (const row of currentRows) {
    const eventId = roleSafeText(row?.eventId)
    if (!eventId || importedMap.has(eventId)) {
      continue
    }
    await deleteEventForOrg({ orgId, eventId })
    deleted += 1
  }

  return {
    moduleId: 'events',
    created,
    updated,
    deleted,
    skipped,
  }
}

const RESTORE_HANDLERS = {
  workers: restoreWorkersModule,
  styles: restoreStylesModule,
  clients: restoreClientsModule,
  zones: restoreZonesModule,
  individualOrders: restoreIndividualOrdersModule,
  workdays: restoreWorkdaysModule,
  events: restoreEventsModule,
}

function sortRestoreModules(moduleIds = []) {
  const order = ['workers', 'styles', 'clients', 'zones', 'individualOrders', 'workdays', 'events']
  return [...new Set(moduleIds)].sort((left, right) => order.indexOf(left) - order.indexOf(right))
}

async function createPreRestoreSnapshot(orgId, createdBy, reason = '') {
  const title = reason ? `pre-restore ${reason}` : 'pre-restore'
  return createBackup({
    orgId,
    type: 'full',
    title,
    createdBy,
    source: 'pre-restore',
  })
}

async function restoreFromParsedArchive({ orgId, parsed, restoredBy, sourceLabel = '' }) {
  const manifestOrgId = String(parsed?.manifest?.orgId ?? '').trim()
  if (manifestOrgId && manifestOrgId !== String(orgId ?? '').trim()) {
    throw new Error(`Backup dotyczy organizacji ${manifestOrgId}, a aktywna jest ${orgId}.`)
  }

  const modulePayloads = parsed?.modulePayloads ?? {}
  const moduleIds = sortRestoreModules(Object.keys(modulePayloads).filter((id) => RESTORE_HANDLERS[id]))
  if (!moduleIds.length) {
    throw new Error('Backup nie zawiera wspieranych modułów do odtworzenia.')
  }

  const preRestore = await createPreRestoreSnapshot(orgId, restoredBy, sourceLabel || 'restore')
  const moduleResults = []

  for (const moduleId of moduleIds) {
    const handler = RESTORE_HANDLERS[moduleId]
    if (typeof handler !== 'function') {
      continue
    }
    const rows = Array.isArray(modulePayloads[moduleId]) ? modulePayloads[moduleId] : []
    const result = await handler(orgId, rows)
    moduleResults.push(result)
  }

  await applyRetentionPolicy(orgId, { keepPreRestoreId: preRestore.id })

  return {
    preRestore,
    moduleResults,
  }
}

export async function listBackups(orgId) {
  const normalizedOrgId = String(orgId ?? '').trim()
  if (!normalizedOrgId) {
    return []
  }

  const records = await getAllBackupRecords()
  return records
    .filter((record) => String(record?.orgId ?? '') === normalizedOrgId)
    .sort((left, right) => parseTs(right?.createdAt) - parseTs(left?.createdAt))
    .map(mapRecordToListItem)
}

export async function createBackup({
  orgId,
  type = 'full',
  title = '',
  createdBy = '-',
  source = 'manual',
  monthKey = '',
}) {
  const normalizedOrgId = String(orgId ?? '').trim()
  if (!normalizedOrgId) {
    throw new Error('Brak orgId dla tworzenia backupu.')
  }

  const normalizedType = normalizeType(type)
  const normalizedTitle = String(title ?? '').trim() || TYPE_LABELS[normalizedType]
  const archive = await buildBackupArchive({
    orgId: normalizedOrgId,
    type: normalizedType,
    title: normalizedTitle,
    createdBy,
    source,
    monthKey,
  })

  const stored = await storeBackupRecord({
    orgId: normalizedOrgId,
    type: normalizedType,
    title: normalizedTitle,
    createdAt: archive.createdAt,
    createdBy,
    source,
    monthKey,
    blob: archive.blob,
    manifest: archive.manifest,
    integrityStatus: 'ok',
  })

  await applyRetentionPolicy(normalizedOrgId)

  return {
    ...stored,
    fileName: archive.fileName,
  }
}

export async function inspectBackupFile(file) {
  if (!(file instanceof Blob)) {
    throw new Error('Nie wybrano poprawnego pliku ZIP.')
  }

  const parsed = await parseBackupArchiveBlob(file)
  if (!parsed.integrityOk) {
    throw new Error(`Plik backupu jest uszkodzony: ${parsed.integrityIssues.join(' ')}`)
  }

  const manifest = parsed.manifest ?? {}
  const modules = Array.isArray(manifest?.modules) ? manifest.modules : []
  const sourceType = normalizeType(manifest?.type)
  const title = String(manifest?.title ?? '').trim() || TYPE_LABELS[sourceType]

  return {
    parsed,
    summary: {
      title,
      type: sourceType,
      typeLabel: TYPE_LABELS[sourceType] ?? TYPE_LABELS.full,
      orgId: String(manifest?.orgId ?? '').trim(),
      createdAt: String(manifest?.createdAt ?? ''),
      createdAtLabel: formatDateTime(manifest?.createdAt),
      createdBy: String(manifest?.createdBy ?? '-'),
      schemaVersion: String(manifest?.schemaVersion ?? ''),
      modules: modules.map((moduleInfo) => ({
        id: String(moduleInfo?.id ?? ''),
        label: String(moduleInfo?.label ?? moduleInfo?.id ?? ''),
        records: Number(moduleInfo?.records ?? 0) || 0,
      })),
      authUsers: Number(manifest?.auth?.users ?? 0) || 0,
    },
  }
}

export async function restoreBackupFromFile({ orgId, file, restoredBy = '-' }) {
  const inspection = await inspectBackupFile(file)
  const parsed = inspection.parsed
  const summary = inspection.summary

  const restoreResult = await restoreFromParsedArchive({
    orgId,
    parsed,
    restoredBy,
    sourceLabel: 'import',
  })

  const manifest = parsed.manifest ?? {}
  const normalizedType = normalizeType(manifest?.type)
  const normalizedTitle = String(manifest?.title ?? '').trim() || TYPE_LABELS[normalizedType]
  const stored = await storeBackupRecord({
    orgId,
    type: normalizedType,
    title: normalizedTitle,
    createdAt: toIso(manifest?.createdAt) || nowIso(),
    createdBy: String(manifest?.createdBy ?? restoredBy ?? '-'),
    source: 'imported-file',
    monthKey: String(manifest?.monthKey ?? ''),
    blob: file,
    manifest,
    integrityStatus: 'ok',
    integrityMessage: '',
  })

  await applyRetentionPolicy(orgId, { keepPreRestoreId: restoreResult?.preRestore?.id })

  return {
    summary,
    stored,
    ...restoreResult,
  }
}

export async function restoreBackupById({ orgId, backupId, restoredBy = '-' }) {
  const normalizedId = String(backupId ?? '').trim()
  if (!normalizedId) {
    throw new Error('Brak ID backupu do przywrocenia.')
  }

  const record = await getBackupRecordById(normalizedId)
  if (!record || String(record?.orgId ?? '') !== String(orgId ?? '')) {
    throw new Error('Nie znaleziono backupu do przywrocenia.')
  }
  if (!(record.blob instanceof Blob)) {
    throw new Error('Backup nie zawiera danych binarnych.')
  }

  const parsed = await parseBackupArchiveBlob(record.blob)
  if (!parsed.integrityOk) {
    throw new Error(`Backup ma bledna integralnosc: ${parsed.integrityIssues.join(' ')}`)
  }

  const restoreResult = await restoreFromParsedArchive({
    orgId,
    parsed,
    restoredBy,
    sourceLabel: `restore:${record.title ?? record.id}`,
  })

  await applyRetentionPolicy(orgId, { keepPreRestoreId: restoreResult?.preRestore?.id })

  return {
    backup: mapRecordToListItem(record),
    ...restoreResult,
  }
}

export async function deleteBackup({ orgId, backupId }) {
  const normalizedId = String(backupId ?? '').trim()
  if (!normalizedId) {
    throw new Error('Brak ID backupu do usuniecia.')
  }

  const record = await getBackupRecordById(normalizedId)
  if (!record || String(record?.orgId ?? '') !== String(orgId ?? '')) {
    throw new Error('Nie znaleziono backupu do usuniecia.')
  }

  await deleteBackupRecord(normalizedId)
  return {
    id: normalizedId,
  }
}

export async function getBackupDownload({ orgId, backupId }) {
  const normalizedId = String(backupId ?? '').trim()
  if (!normalizedId) {
    throw new Error('Brak ID backupu do pobrania.')
  }

  const record = await getBackupRecordById(normalizedId)
  if (!record || String(record?.orgId ?? '') !== String(orgId ?? '')) {
    throw new Error('Nie znaleziono backupu do pobrania.')
  }
  if (!(record.blob instanceof Blob)) {
    throw new Error('Backup nie zawiera danych do pobrania.')
  }

  return {
    fileName: String(record?.fileName ?? buildFileName(record?.title ?? 'KOPIA', record?.type ?? 'full')),
    blob: record.blob,
  }
}

function hasBackupForDay(records, dayKey, source) {
  return records.some((record) => {
    if (normalizeSource(record?.source) !== source) {
      return false
    }
    return maybeParseDateYmd(record?.createdAt) === dayKey
  })
}

function hasMonthlyBackup(records, monthKey) {
  return records.some((record) => {
    if (normalizeSource(record?.source) !== 'auto-monthly') {
      return false
    }
    return String(record?.monthKey ?? '').trim() === String(monthKey ?? '').trim()
  })
}

export async function ensureBackupAutomation({ orgId, createdBy = 'system' }) {
  const normalizedOrgId = String(orgId ?? '').trim()
  if (!normalizedOrgId) {
    return { createdDaily: false, createdMonthly: false, retentionDeleted: 0 }
  }

  const records = await listBackups(normalizedOrgId)
  let createdDaily = false
  let createdMonthly = false

  const todayKey = localYmd()
  if (!hasBackupForDay(records, todayKey, 'auto-daily')) {
    await createBackup({
      orgId: normalizedOrgId,
      type: 'full',
      title: `AUTO DZIENNA ${todayKey}`,
      createdBy,
      source: 'auto-daily',
    })
    createdDaily = true
  }

  const lastMonthKey = previousMonthKey()
  if (!hasMonthlyBackup(await listBackups(normalizedOrgId), lastMonthKey)) {
    await createBackup({
      orgId: normalizedOrgId,
      type: 'full',
      title: `AUTO MIESIECZNA ${lastMonthKey}`,
      createdBy,
      source: 'auto-monthly',
      monthKey: lastMonthKey,
    })
    createdMonthly = true
  }

  const retention = await applyRetentionPolicy(normalizedOrgId)
  return {
    createdDaily,
    createdMonthly,
    retentionDeleted: Number(retention?.deleted ?? 0) || 0,
  }
}

export async function restoreLatestPreRestore({ orgId, restoredBy = '-' }) {
  const backups = await listBackups(orgId)
  const preRestore = backups.find((backup) => normalizeSource(backup.source) === 'pre-restore')
  if (!preRestore) {
    throw new Error('Brak dostepnego punktu pre-restore.')
  }

  return restoreBackupById({
    orgId,
    backupId: preRestore.id,
    restoredBy,
  })
}
