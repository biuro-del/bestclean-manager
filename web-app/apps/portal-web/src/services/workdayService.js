import {
  deleteWorkdayForOrg,
  insertEventForOrg,
  insertWorkdayForOrg,
  reidentifyEventForOrg,
  updateEventForOrg,
  updateWorkdayForOrg,
  workdaysForOrg,
  workerWorkdaysForOrg,
} from './platformDataConnectService'
import { executeMutation, executeQuery, mutationRef, queryRef } from 'firebase/data-connect'
import { ensureFirebase, isFirebaseConfigured } from '../firebase/firebaseClient'
import { executePlatformDataConnect, isPlatformSession, platformContextHeaders } from './platformDataConnectService'
import { getClients } from './clientService'
import { getZones } from './zoneService'
import { getWorkers } from './workerService'
import { enrichWorkdaysWithEventIntervals } from '../features/workers/workIntervals.js'
import {
  findBlockingOpenEventForWorker,
  openEventRecordKey,
} from './openEventIntegrity'
import {
  findOpenWorkdayForWorker,
  openWorkdayRecordKey,
} from './openWorkdayIntegrity'
import { eventCorrelationIdentityChanged } from './eventCorrelationIdentityPolicy'
import {
  WORKDAY_READ_MAX_CHUNK_SIZE,
  WORKDAY_READ_MAX_RECORDS,
  assertCompletePagedResponse,
  assertWorkdayReadWindow,
  createPagedReadLimitError,
  createPagedReadUnavailableError,
  isPagedReadSafetyError,
} from './workdayReadCostPolicy'

const NINE_HOURS_SECONDS = 9 * 60 * 60
let eventsForOrgUnavailable = false
let eventsPageForOrgUnavailable = false
let workdaysPageForOrgUnavailable = false
let backupCyclesPageForOrgUnavailable = false
let eventsFingerprintForOrgUnavailable = false
const EVENTS_FINGERPRINT_FOR_ORG_ENABLED =
  String(import.meta.env?.VITE_ENABLE_DATACONNECT_FINGERPRINT ?? '').trim().toLowerCase() === 'true'
const READ_CACHE_MS = 30000
const EVENTS_FAST_PAGE_MAX_SIZE = WORKDAY_READ_MAX_CHUNK_SIZE
const EVENTS_FAST_PAGE_CHUNK_SIZE = 150
const EVENTS_FAST_PAGE_INITIAL_SCAN = 1200
const EVENTS_FAST_PAGE_MAX_SCAN = WORKDAY_READ_MAX_RECORDS
const WORKDAY_DAILY_READ_MAX_ROWS = 5000
const WORKDAY_SUMMARY_READ_MAX_ROWS = 5000
const PAGED_HISTORY_FROM_START_AT = '2000-01-01T00:00:00.000Z'
const PAGED_HISTORY_TO_START_AT = '2100-01-01T00:00:00.000Z'
const workdayCache = new Map()
const DEPLOY_HINT =
  'Brak wdro\u017conej operacji Data Connect. Wykonaj: firebase login --reauth, potem firebase deploy --only dataconnect --project iclean-room.'

function workdayCacheKey(orgId, bucket) {
  const normalizedOrgId = String(orgId ?? '').trim()
  const normalizedBucket = String(bucket ?? '').trim()
  return normalizedOrgId && normalizedBucket ? `${normalizedOrgId}:${normalizedBucket}` : ''
}

function invalidateWorkdayCache(orgId) {
  const normalizedOrgId = String(orgId ?? '').trim()
  if (!normalizedOrgId) {
    workdayCache.clear()
    return
  }

  const prefix = `${normalizedOrgId}:`
  ;[...workdayCache.keys()].forEach((key) => {
    if (key.startsWith(prefix)) {
      workdayCache.delete(key)
    }
  })
}

async function readWorkdayCached(orgId, bucket, loader) {
  const key = workdayCacheKey(orgId, bucket)
  const now = Date.now()
  const cached = key ? workdayCache.get(key) : null

  if (cached?.promise) {
    return cached.promise
  }

  if (cached?.expiresAt > now && Array.isArray(cached.value)) {
    return cached.value
  }

  const promise = loader()
    .then((value) => {
      if (key) {
        workdayCache.set(key, { value, expiresAt: Date.now() + READ_CACHE_MS, promise: null })
      }
      return value
    })
    .catch((error) => {
      if (key) {
        workdayCache.delete(key)
      }
      throw error
    })

  if (key) {
    workdayCache.set(key, { value: cached?.value ?? null, expiresAt: cached?.expiresAt ?? 0, promise })
  }

  return promise
}

function normalizePortalApiBase(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return '/api'
  if (raw.startsWith('/')) {
    const withoutTrailing = raw.replace(/\/+$/, '')
    return withoutTrailing.endsWith('/api') ? withoutTrailing : `${withoutTrailing}/api`
  }

  const withoutTrailing = raw.replace(/\/+$/, '')
  return withoutTrailing.endsWith('/api') ? withoutTrailing : `${withoutTrailing}/api`
}

function getPortalApiBase() {
  return normalizePortalApiBase(import.meta.env.VITE_ADMIN_API_BASE || '/api')
}

async function portalEventAuthHeaders() {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase.')
  }

  const firebase = ensureFirebase()
  const currentUser = firebase?.auth?.currentUser
  if (!currentUser) {
    throw new Error('Sesja wygasla. Zaloguj sie ponownie.')
  }

  const idToken = await currentUser.getIdToken()
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${idToken}`,
    ...platformContextHeaders(),
  }
}

async function parsePortalEventApiError(response, fallbackMessage) {
  const rawText = await response.text().catch(() => '')
  if (!rawText) {
    const error = new Error(fallbackMessage)
    error.status = response?.status
    throw error
  }

  if (/^\s*</.test(rawText)) {
    const error = new Error('Endpoint usuwania zdarzen zwrocil HTML zamiast JSON. Odswiez aplikacje i sprobuj ponownie.')
    error.status = response?.status
    throw error
  }

  try {
    const body = JSON.parse(rawText)
    const message = String(body?.error?.message ?? body?.message ?? fallbackMessage).trim() || fallbackMessage
    const error = new Error(message)
    error.status = response?.status
    error.code = body?.error?.code
    throw error
  } catch (error) {
    if (error instanceof Error && error.status) {
      throw error
    }
    const parsedError = new Error(rawText.slice(0, 500) || fallbackMessage)
    parsedError.status = response?.status
    throw parsedError
  }
}

function slimPortalEventDeleteRow(row = {}) {
  if (!row || typeof row !== 'object') {
    return row
  }

  return {
    id: row.id,
    eventId: row.eventId,
    workdayId: row.workdayId,
    linkedWorkdayId: row.linkedWorkdayId,
    cycleId: row.cycleId,
    backupCycleId: row.backupCycleId,
    startEventId: row.startEventId,
    endEventId: row.endEventId,
    pauseId: row.pauseId,
  }
}

export async function forceDeletePortalEvents(orgId, rows = [], ids = []) {
  const normalizedOrgId = String(orgId ?? '').trim()
  if (!normalizedOrgId) {
    throw new Error('Brak identyfikatora organizacji.')
  }

  const normalizedRows = (Array.isArray(rows) ? rows : [rows]).map((row) => slimPortalEventDeleteRow(row)).filter(Boolean)
  const normalizedIds = [
    ...new Set((Array.isArray(ids) ? ids : [ids]).map((value) => String(value ?? '').trim()).filter(Boolean)),
  ]
  if (!normalizedIds.length && !normalizedRows.length) {
    throw new Error('Brak identyfikatora zdarzenia do usuniecia.')
  }

  const headers = await portalEventAuthHeaders()
  const response = await fetch(`${getPortalApiBase()}/portal/events`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({
      orgId: normalizedOrgId,
      ids: normalizedIds,
      rows: normalizedRows,
    }),
  })

  if (!response.ok) {
    await parsePortalEventApiError(response, 'Nie udalo sie usunac zdarzen.')
  }

  const body = await response.json().catch(() => ({}))
  const counts = body?.data?.counts ?? {}
  const deletedTotal = Number(body?.data?.deletedTotal)
  const deletedAny =
    (Number.isFinite(deletedTotal) && deletedTotal > 0) ||
    Object.values(counts).some((value) => Number(value) > 0)

  if (deletedAny) {
    invalidateWorkdayCache(normalizedOrgId)
  }

  return {
    ...(body?.data ?? {}),
    deletedAny,
  }
}

function pad2(value) {
  return String(value).padStart(2, '0')
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

function toNullableIso(value) {
  const iso = toIso(value)
  return iso || null
}

function toNullableText(value) {
  const raw = String(value ?? '').trim()
  return raw || null
}

function messageFromError(error) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error ?? '')
}

function extractNestedErrorMessage(rawMessage) {
  const message = String(rawMessage ?? '').trim()
  if (!message || !message.startsWith('{')) {
    return ''
  }

  try {
    const parsed = JSON.parse(message)
    return String(parsed?.error?.message ?? parsed?.message ?? '').trim()
  } catch {
    return ''
  }
}

function isOperationNotFoundMessage(rawMessage, operationName) {
  const message = String(rawMessage ?? '')
  const nested = extractNestedErrorMessage(message)
  const fullMessage = `${message} ${nested}`.toLowerCase()
  const operation = String(operationName ?? '').trim().toLowerCase()
  if (!operation) {
    return false
  }

  return (
    fullMessage.includes(`operation "${operation}" not found`) ||
    fullMessage.includes(`operation \\"${operation}\\" not found`) ||
    fullMessage.includes(`operation '${operation}' not found`) ||
    (fullMessage.includes('operation') && fullMessage.includes('not found') && fullMessage.includes(operation)) ||
    ((fullMessage.includes('"status":"not_found"') ||
      fullMessage.includes('"code":404') ||
      fullMessage.includes('"code":"404"')) &&
      fullMessage.includes(operation))
  )
}

function withOperationNotFoundHint(error, operationName) {
  const message = messageFromError(error)
  if (isOperationNotFoundMessage(message, operationName)) {
    return new Error(`${DEPLOY_HINT} Brak operacji: ${operationName}.`)
  }

  return error instanceof Error ? error : new Error(message || DEPLOY_HINT)
}
function isOperationNotFoundError(error, operationName) {
  const message = messageFromError(error)
  return isOperationNotFoundMessage(message, operationName) || message.includes(`Brak operacji: ${operationName}.`)
}

function formatDatePl(isoValue) {
  const iso = toIso(isoValue)
  if (!iso) {
    return '-'
  }

  const date = new Date(iso)
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()}`
}

function formatTime(isoValue) {
  const iso = toIso(isoValue)
  if (!iso) {
    return '-'
  }

  const date = new Date(iso)
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

function durationToHms(secondsValue) {
  const seconds = Number(secondsValue ?? 0)
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '-'
  }

  const rounded = Math.floor(seconds)
  const hours = Math.floor(rounded / 3600)
  const minutes = Math.floor((rounded % 3600) / 60)
  const secondsRemainder = rounded % 60

  return `${pad2(hours)}:${pad2(minutes)}:${pad2(secondsRemainder)}`
}

function normalizeStatus(status, hasStop) {
  const normalized = String(status ?? '').trim().toUpperCase()
  if (hasStop) {
    return 'CLOSED'
  }

  if (normalized === 'CLOSED') {
    return 'CLOSED'
  }

  if (normalized === 'OPEN' || normalized === 'RUNNING') {
    return 'RUNNING'
  }

  return hasStop ? 'CLOSED' : 'RUNNING'
}

function calculateDuration(row) {
  const directDuration = Number(row?.durationSec)
  if (Number.isFinite(directDuration) && directDuration >= 0) {
    return Math.floor(directDuration)
  }

  const startIso = toIso(row?.startAt)
  const endIso = toIso(row?.endAt)
  if (!startIso || !endIso) {
    return 0
  }

  const startMs = new Date(startIso).getTime()
  const endMs = new Date(endIso).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return 0
  }

  return Math.floor((endMs - startMs) / 1000)
}

function normalizeFilterDate(rawDate) {
  const trimmed = String(rawDate ?? '').trim()
  if (!trimmed) {
    return ''
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed
  }

  const iso = toIso(trimmed)
  return iso ? iso.slice(0, 10) : ''
}

function normalizeHaystack(values) {
  return values
    .map((value) => String(value ?? '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ')
}

function normalizeLookupKey(value) {
  return String(value ?? '').trim().toLowerCase()
}

function extractLoginLocalPart(value) {
  const text = String(value ?? '').trim()
  if (!text) {
    return ''
  }

  const atIndex = text.indexOf('@')
  if (atIndex <= 0) {
    return ''
  }

  return text.slice(0, atIndex).trim()
}

function collectWorkerLookupValues(worker) {
  const primaryValues = [
    worker?.login,
    worker?.workerLogin,
    worker?.id,
    worker?.workerId,
    worker?.email,
    worker?.loginEmail,
  ]

  const values = new Set()
  primaryValues.forEach((value) => {
    const text = String(value ?? '').trim()
    if (text) {
      values.add(text)
    }

    const localPart = extractLoginLocalPart(text)
    if (localPart) {
      values.add(localPart)
    }
  })

  return [...values]
}

function canonicalWorkerId(value) {
  const raw = String(value ?? '').trim().toUpperCase()
  return /^W\d+$/.test(raw) ? raw : ''
}

function canonicalWorkerDigits(value) {
  const canonical = canonicalWorkerId(value)
  if (!canonical) {
    return ''
  }
  return canonical.replace(/[^0-9]/g, '').replace(/^0+/, '')
}

function resolveWorkerByLogin(lookupMaps, ...candidateValues) {
  for (const value of candidateValues) {
    const text = String(value ?? '').trim()
    if (!text) {
      continue
    }

    const variants = [text, extractLoginLocalPart(text)].filter(Boolean)
    for (const variant of variants) {
      const directMatch = lookupMaps.workerByLogin.get(variant)
      if (directMatch) {
        return directMatch
      }

      const normalizedMatch = lookupMaps.workerByNormalizedLogin.get(normalizeLookupKey(variant))
      if (normalizedMatch) {
        return normalizedMatch
      }
    }
  }

  return null
}

function normalizePersonName(value) {
  const raw = String(value ?? '').trim()
  if (!raw) {
    return ''
  }

  try {
    return raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
  } catch {
    return raw.toLowerCase().replace(/\s+/g, ' ').trim()
  }
}

function pickFirstText(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) {
      return text
    }
  }

  return ''
}

function pickWorkerNameValue(worker) {
  if (!worker) {
    return ''
  }

  return pickFirstText(
    worker.workerName,
    worker.workername,
    worker.worker_name,
    worker.name,
    worker.fullName,
  )
}

function pickWorkerLoginValue(worker) {
  if (!worker) {
    return ''
  }

  return pickFirstText(
    worker.login,
    worker.workerLogin,
    worker.id,
    worker.workerId,
    extractLoginLocalPart(worker.loginEmail),
    extractLoginLocalPart(worker.email),
  )
}

function createUniqueNameTracker() {
  return {
    name: '',
    count: 0,
  }
}

function formatPersonToken(value) {
  const raw = String(value ?? '').trim()
  if (!raw) {
    return ''
  }

  const lowered = raw.toLocaleLowerCase('pl')
  return lowered.charAt(0).toLocaleUpperCase('pl') + lowered.slice(1)
}

function extractPersonTokensFromLogin(workerLogin) {
  const source = extractLoginLocalPart(workerLogin) || String(workerLogin ?? '').trim()
  if (!source) {
    return []
  }

  return source
    .split(/[._+\-\s]+/)
    .map((token) => token.trim())
    .filter((token) => token && !/^\d+$/.test(token))
}

function composeDisplayNameFromLoginAndName(workerLogin, workerName) {
  const name = String(workerName ?? '').trim()
  const login = String(workerLogin ?? '').trim()
  const nameParts = normalizePersonName(name).split(' ').filter(Boolean)
  const loginTokens = extractPersonTokensFromLogin(login)
  const loginTokensNormalized = loginTokens.map((token) => normalizePersonName(token)).filter(Boolean)

  if (loginTokens.length >= 2 && nameParts.length < 2) {
    return loginTokens.map((token) => formatPersonToken(token)).join(' ')
  }

  if (loginTokens.length === 1 && nameParts.length === 1) {
    const loginPart = loginTokensNormalized[0]
    const surnamePart = nameParts[0]
    if (loginPart && surnamePart && loginPart !== surnamePart) {
      return `${formatPersonToken(loginTokens[0])} ${name}`
    }
  }

  if (name) {
    return name
  }

  if (loginTokens.length) {
    return loginTokens.map((token) => formatPersonToken(token)).join(' ')
  }

  return login
}

function registerTrackedName(trackerMap, key, fullName) {
  const normalizedKey = normalizePersonName(key)
  const normalizedName = String(fullName ?? '').trim()
  if (!normalizedKey || !normalizedName) {
    return
  }

  const existing = trackerMap.get(normalizedKey) ?? createUniqueNameTracker()
  if (!existing.name) {
    existing.name = normalizedName
    existing.count = 1
    trackerMap.set(normalizedKey, existing)
    return
  }

  if (existing.name !== normalizedName) {
    existing.count += 1
    trackerMap.set(normalizedKey, existing)
  }
}

function readTrackedUniqueName(trackerMap, key) {
  const normalizedKey = normalizePersonName(key)
  if (!normalizedKey) {
    return ''
  }

  const entry = trackerMap.get(normalizedKey)
  if (!entry || entry.count !== 1) {
    return ''
  }

  return String(entry.name ?? '').trim()
}

function createWorkerDisplayNameResolver(workers = []) {
  const aliasToFullName = new Map()
  const normalizedNameMap = new Map()
  const firstNameMap = new Map()
  const surnameMap = new Map()

  workers.forEach((worker) => {
    const fullName = pickWorkerNameValue(worker).trim()
    if (!fullName) {
      return
    }

    const normalizedFullName = normalizePersonName(fullName)
    if (normalizedFullName && !normalizedNameMap.has(normalizedFullName)) {
      normalizedNameMap.set(normalizedFullName, fullName)
    }

    const aliases = collectWorkerLookupValues(worker)
    aliases.forEach((aliasValue) => {
      const alias = normalizeLookupKey(aliasValue)
      if (alias && !aliasToFullName.has(alias)) {
        aliasToFullName.set(alias, fullName)
      }

      const localPart = normalizeLookupKey(extractLoginLocalPart(aliasValue))
      if (localPart && !aliasToFullName.has(localPart)) {
        aliasToFullName.set(localPart, fullName)
      }
    })

    const parts = normalizedFullName.split(' ').filter(Boolean)
    if (!parts.length) {
      return
    }

    registerTrackedName(firstNameMap, parts[0], fullName)
    registerTrackedName(surnameMap, parts[parts.length - 1], fullName)
  })

  return (workerLogin, workerName) => {
    const aliases = [workerLogin, extractLoginLocalPart(workerLogin), workerName]
      .map((value) => normalizeLookupKey(value))
      .filter(Boolean)

    for (const alias of aliases) {
      const fullName = aliasToFullName.get(alias)
      if (fullName) {
        return fullName
      }
    }

    const normalizedWorkerName = normalizePersonName(workerName)
    if (normalizedWorkerName) {
      const byExactName = normalizedNameMap.get(normalizedWorkerName)
      if (byExactName) {
        return byExactName
      }

      const nameParts = normalizedWorkerName.split(' ').filter(Boolean)
      if (nameParts.length === 1) {
        const bySurname = readTrackedUniqueName(surnameMap, nameParts[0])
        if (bySurname) {
          return bySurname
        }

        const byFirstName = readTrackedUniqueName(firstNameMap, nameParts[0])
        if (byFirstName) {
          return byFirstName
        }
      } else {
        const byLastToken = readTrackedUniqueName(surnameMap, nameParts[nameParts.length - 1])
        if (byLastToken) {
          return byLastToken
        }
      }
    }

    return composeDisplayNameFromLoginAndName(workerLogin, workerName)
  }
}

function looksLikeSerializedError(value) {
  const text = String(value ?? '').trim()
  if (!text) {
    return false
  }

  const lowered = text.toLowerCase()
  if (
    (lowered.includes('"error"') && lowered.includes('"code"')) ||
    (lowered.includes('operation "') && lowered.includes('not found')) ||
    lowered.includes('"status":"not_found"') ||
    lowered.includes('"code":404')
  ) {
    return true
  }

  if (!text.startsWith('{')) {
    return false
  }

  try {
    const parsed = JSON.parse(text)
    const errorValue = parsed?.error ?? parsed
    const code = String(errorValue?.code ?? '').trim()
    const message = String(errorValue?.message ?? '').trim()
    return Boolean(code || message)
  } catch {
    return false
  }
}

function sanitizeTextValue(value) {
  const text = String(value ?? '').trim()
  return looksLikeSerializedError(text) ? '' : text
}

function mergeZoneData(primary, secondary) {
  if (!primary && !secondary) {
    return null
  }

  const primarySpecial = primary?.isSpecialZone === true
  const secondarySpecial = secondary?.isSpecialZone === true
  return {
    id: pickFirstText(primary?.id, secondary?.id),
    clientId: pickFirstText(primary?.clientId, secondary?.clientId),
    name: pickFirstText(primary?.name, secondary?.name),
    zone: pickFirstText(primary?.zone, secondary?.zone),
    functionName: pickFirstText(primary?.functionName, primary?.function, secondary?.functionName, secondary?.function),
    isSpecialZone: primarySpecial || secondarySpecial,
    location: pickFirstText(primary?.location, secondary?.location),
    workerLogin: pickFirstText(primary?.workerLogin, secondary?.workerLogin),
    workerName: pickFirstText(primary?.workerName, secondary?.workerName),
  }
}

function getDataConnectInstance() {
  const firebase = ensureFirebase()
  const dataConnect = firebase?.dataConnect
  if (!dataConnect) {
    throw new Error('Nie uda\u0142o si\u0119 zainicjalizowa\u0107 Data Connect.')
  }

  return dataConnect
}

async function runQueryOperation(operationName, variables, options = {}) {
  try {
    if (isPlatformSession()) return await executePlatformDataConnect('query', operationName, variables)
    const reference = queryRef(getDataConnectInstance(), operationName, variables)
    return await executeQuery(
      reference,
      options.forceRefresh === true ? { fetchPolicy: 'SERVER_ONLY' } : undefined,
    )
  } catch (error) {
    throw withOperationNotFoundHint(error, operationName)
  }
}

async function runMutationOperation(operationName, variables) {
  try {
    if (isPlatformSession()) return await executePlatformDataConnect('mutation', operationName, variables)
    return await executeMutation(mutationRef(getDataConnectInstance(), operationName, variables))
  } catch (error) {
    throw withOperationNotFoundHint(error, operationName)
  }
}

async function getRawWorkdaysForOrg(orgId) {
  return readWorkdayCached(orgId, 'raw-workdays', async () => {
    const response = await workdaysForOrg({ orgId })
    return response?.data?.workdays ?? []
  })
}

async function getRawEventsForOrg(orgId) {
  return readWorkdayCached(orgId, 'raw-events', async () => {
    const response = await runQueryOperation('EventsForOrg', { orgId })
    return response?.data?.events ?? []
  })
}

function clampPositiveInteger(value, fallback, maxValue = Number.POSITIVE_INFINITY) {
  const parsed = Number(value)
  const normalized = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
  return Math.min(Math.max(normalized, 1), maxValue)
}

function normalizedPageOffset(page, pageSize) {
  const normalizedPage = clampPositiveInteger(page, 1)
  return (normalizedPage - 1) * pageSize
}

function normalizeEventsFastRangeBoundary(value, endOfDay = false) {
  const raw = String(value ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const localDate = new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`)
    return Number.isFinite(localDate.getTime()) ? localDate.toISOString() : ''
  }

  return toIso(value)
}

function normalizeEventsFastRange(filters = {}, context = {}) {
  const fromStartAt = normalizeEventsFastRangeBoundary(filters.fromIso)
  const toStartAt = normalizeEventsFastRangeBoundary(filters.toIso, true)
  if (fromStartAt && toStartAt) {
    return {
      fromStartAt,
      toStartAt,
    }
  }

  const workerLogin = String(context.workerLogin ?? '').trim()
  const status = normalizeEventsStatusFilter(context.status ?? filters.status)
  if (!workerLogin && status !== 'RUNNING') {
    return null
  }

  return {
    fromStartAt: PAGED_HISTORY_FROM_START_AT,
    toStartAt: PAGED_HISTORY_TO_START_AT,
  }
}

function normalizeEventsStatusFilter(value) {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (!normalized) {
    return ''
  }
  return normalized === 'OPEN' ? 'RUNNING' : normalized
}

function eventsFastPageShouldFallback(filters = {}, context = {}) {
  return !normalizeEventsFastRange(filters, context)
}

function fastPageScanLimit(pageOffset, pageSize) {
  const desiredCount = pageOffset + pageSize + 1
  return Math.min(
    EVENTS_FAST_PAGE_MAX_SCAN,
    Math.max(EVENTS_FAST_PAGE_INITIAL_SCAN, desiredCount + EVENTS_FAST_PAGE_MAX_SIZE),
  )
}

function pagedReadLimitError(sourceLabel) {
  return createPagedReadLimitError(sourceLabel)
}

function pagedReadUnavailableError(sourceLabel) {
  return createPagedReadUnavailableError(sourceLabel)
}

function eventFastPageOperationNames(mode) {
  switch (mode) {
    case 'worker':
      return {
        events: 'EventsPageForOrgByWorker',
        workdays: 'WorkdaysPageForOrgByWorker',
      }
    case 'room':
      return {
        events: 'EventsPageForOrgByZone',
        workdays: 'WorkdaysPageForOrgByRoom',
      }
    case 'status':
      return {
        events: 'EventsPageForOrgByStatus',
        workdays: 'WorkdaysPageForOrgByStatus',
      }
    default:
      return {
        events: 'EventsPageForOrg',
        workdays: 'WorkdaysPageForOrg',
      }
  }
}

function buildEventsFastVariables(orgId, filters, mode, extra = {}) {
  const range = normalizeEventsFastRange(filters, extra)
  if (!range) {
    return null
  }

  const variables = {
    orgId,
    ...range,
    limit: extra.limit,
    offset: extra.offset,
  }

  if (mode === 'worker') {
    variables.workerLogin = String(extra.workerLogin ?? '').trim()
  } else if (mode === 'room') {
    variables.zoneId = String(extra.roomId ?? '').trim()
    variables.utilityRoomId = String(extra.roomId ?? '').trim()
  } else if (mode === 'status') {
    variables.status = normalizeEventsStatusFilter(extra.status)
  }

  return variables
}

async function runEventsPageQuery(operationName, variables, collectionName, options = {}) {
  const response = await runQueryOperation(operationName, variables, options)
  return response?.data?.[collectionName] ?? []
}

function chooseEventsFastMode(filters = {}, workerLoginHint = '') {
  const normalizedWorkerLogin = String(workerLoginHint ?? '').trim()
  if (normalizedWorkerLogin) {
    return {
      mode: 'worker',
      workerLogin: normalizedWorkerLogin,
    }
  }

  const roomId = String(filters.roomId ?? filters.zoneId ?? filters.utilityRoomId ?? '').trim()
  if (roomId) {
    return {
      mode: 'room',
      roomId,
    }
  }

  const status = normalizeEventsStatusFilter(filters.status)
  if (status) {
    return {
      mode: 'status',
      status,
    }
  }

  return {
    mode: 'default',
  }
}

function applyWorkdayFilters(items, filters = {}) {
  const fromDay = normalizeFilterDate(filters.fromIso)
  const toDay = normalizeFilterDate(filters.toIso)
  const workerFilter = String(filters.worker ?? '').trim().toLowerCase()
  const workerNameFilter = normalizePersonName(filters.worker)
  const workerNameFilterReversed = workerNameFilter.split(' ').filter(Boolean).slice().reverse().join(' ')
  const workerLoginFilter = normalizeLookupKey(filters.workerLogin)
  const workerLoginFilterLocal = normalizeLookupKey(extractLoginLocalPart(workerLoginFilter))
  const workerLoginNameFilter = normalizePersonName(filters.workerLogin)
  const workerLoginNameFilterReversed = workerLoginNameFilter.split(' ').filter(Boolean).slice().reverse().join(' ')
  const zoneFilter = String(filters.strefa ?? '').trim().toLowerCase()
  const zoneIdFilter = normalizeLookupKey(filters.zoneId ?? filters.utilityRoomId)
  const clientFilter = String(filters.pomieszczenie ?? '').trim().toLowerCase()
  const clientIdFilter = normalizeLookupKey(filters.clientId)
  const roomFilter = String(filters.roomId ?? '').trim().toLowerCase()
  const rawStatusFilter = String(filters.status ?? '').trim().toUpperCase()
  const statusFilter = rawStatusFilter === 'OPEN' ? 'RUNNING' : rawStatusFilter
  const q = String(filters.q ?? '').trim().toLowerCase()

  return items.filter((item) => {
    const dayKey = item.dayKey
    if (fromDay && dayKey && dayKey < fromDay) {
      return false
    }

    if (toDay && dayKey && dayKey > toDay) {
      return false
    }

    if (workerFilter) {
      const workerName = String(item.workerName ?? '').toLowerCase()
      const workerLogin = String(item.workerLogin ?? '').toLowerCase()
      const normalizedWorkerName = normalizePersonName(item.workerName)
      const matchesWorkerName =
        Boolean(workerNameFilter) &&
        Boolean(normalizedWorkerName) &&
        (normalizedWorkerName === workerNameFilter ||
          normalizedWorkerName.includes(workerNameFilter) ||
          workerNameFilter.includes(normalizedWorkerName) ||
          (workerNameFilterReversed &&
            (normalizedWorkerName === workerNameFilterReversed ||
              normalizedWorkerName.includes(workerNameFilterReversed) ||
              workerNameFilterReversed.includes(normalizedWorkerName))))
      if (!workerName.includes(workerFilter) && !workerLogin.includes(workerFilter) && !matchesWorkerName) {
        return false
      }
    }

    if (workerLoginFilter) {
      const itemLoginRaw = String(item.workerLogin ?? '').trim()
      const itemLogin = normalizeLookupKey(itemLoginRaw)
      const itemLoginLocal = normalizeLookupKey(extractLoginLocalPart(itemLoginRaw))
      const itemName = normalizePersonName(item.workerName)
      const matchesLogin =
        itemLogin === workerLoginFilter ||
        (workerLoginFilterLocal && itemLogin === workerLoginFilterLocal) ||
        (itemLoginLocal && itemLoginLocal === workerLoginFilter) ||
        (workerLoginFilterLocal && itemLoginLocal && itemLoginLocal === workerLoginFilterLocal)
      const matchesName =
        Boolean(workerLoginNameFilter) && Boolean(itemName) &&
        (itemName === workerLoginNameFilter ||
          itemName.includes(workerLoginNameFilter) ||
          workerLoginNameFilter.includes(itemName) ||
          (workerLoginNameFilterReversed &&
            (itemName === workerLoginNameFilterReversed ||
              itemName.includes(workerLoginNameFilterReversed) ||
              workerLoginNameFilterReversed.includes(itemName))))
      if (!matchesLogin && !matchesName) {
        return false
      }
    }

    if (zoneFilter && !String(item.strefa ?? '').toLowerCase().includes(zoneFilter)) {
      return false
    }

    if (zoneIdFilter && normalizeLookupKey(item.zoneId ?? item.utilityRoomId ?? item.roomId) !== zoneIdFilter) {
      return false
    }

    if (clientFilter) {
      const clientHaystack = normalizeHaystack([
        item.klient,
        item.clientName,
        item.clientId,
        item.dayStartObject,
        item.dayStopObject,
        item.dayComment,
      ])
      if (!clientHaystack.includes(clientFilter)) {
        return false
      }
    }

    if (clientIdFilter && normalizeLookupKey(item.clientId) !== clientIdFilter) {
      return false
    }

    if (roomFilter && !String(item.roomId ?? '').toLowerCase().includes(roomFilter)) {
      return false
    }

    if (statusFilter) {
      const normalizedStatus = normalizeStatus(item.status, Boolean(item.endAt || item.dayEndAt))
      if (normalizedStatus !== statusFilter) {
        return false
      }
    }

    if (!q) {
      return true
    }

    const haystack = normalizeHaystack([
      item.workdayId,
      item.workerName,
      item.workerLogin,
      item.roomId,
      item.strefa,
      item.klient,
      item.clientId,
      item.lokalizacja,
      item.status,
      item.comment,
      item.editedBy,
    ])

    return haystack.includes(q)
  })
}

function paginate(items, pageValue, pageSizeValue) {
  const pageSize = Number(pageSizeValue) > 0 ? Number(pageSizeValue) : 50
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(Math.max(Number(pageValue) || 1, 1), totalPages)
  const offset = (page - 1) * pageSize

  return {
    items: items.slice(offset, offset + pageSize),
    page,
    pageSize,
    total,
    totalPages,
  }
}

function sortByLatest(items) {
  return [...items].sort((left, right) => {
    const leftTs = new Date(
      toIso(left.startAt) || toIso(left.endAt) || toIso(left.dayStartAt) || toIso(left.dayEndAt) || toIso(left.updatedAt) || 0,
    ).getTime()
    const rightTs = new Date(
      toIso(right.startAt) || toIso(right.endAt) || toIso(right.dayStartAt) || toIso(right.dayEndAt) || toIso(right.updatedAt) || 0,
    ).getTime()
    return rightTs - leftTs
  })
}

function buildLookupMaps(clients, zones, workers, workdayRows = []) {
  const clientById = new Map(clients.map((client) => [String(client.id), client]))
  const clientByNormalizedId = new Map(clients.map((client) => [normalizeLookupKey(client.id), client]))
  const clientByNormalizedName = new Map(clients.map((client) => [normalizeLookupKey(client.name), client]))
  const zoneById = new Map(zones.map((zone) => [String(zone.id), zone]))
  const zoneByNormalizedId = new Map(zones.map((zone) => [normalizeLookupKey(zone.id), zone]))
  const zoneByNormalizedName = new Map(
    zones
      .map((zone) => [normalizeLookupKey(zone.name ?? zone.zone), zone])
      .filter((pair) => Boolean(pair[0])),
  )
  const workerByLogin = new Map()
  const workerByNormalizedLogin = new Map()
  workers.forEach((worker) => {
    const keys = collectWorkerLookupValues(worker)
    keys.forEach((key) => {
      if (!workerByLogin.has(key)) {
        workerByLogin.set(key, worker)
      }

      const normalizedKey = normalizeLookupKey(key)
      if (normalizedKey && !workerByNormalizedLogin.has(normalizedKey)) {
        workerByNormalizedLogin.set(normalizedKey, worker)
      }
    })
  })
  const workerByNormalizedName = new Map(
    workers
      .map((worker) => {
        const normalizedName = normalizePersonName(pickWorkerNameValue(worker))
        if (!normalizedName) {
          return null
        }

        return [normalizedName, worker]
      })
      .filter(Boolean),
  )
  const workdayById = new Map(
    workdayRows
      .map((row) => {
        const workdayId = String(row?.workdayId ?? '').trim()
        if (!workdayId) {
          return null
        }

        return [
          workdayId,
          {
            workdayId,
            workerLogin: String(row?.workerLogin ?? '').trim(),
            workerName: String(row?.workerName ?? '').trim(),
            startAt: toIso(row?.startAt),
            endAt: toIso(row?.endAt),
            status: normalizeStatus(row?.status, Boolean(row?.endAt)),
            utilityRoomId: String(row?.utilityRoomId ?? row?.roomId ?? '').trim(),
            gps: String(row?.gps ?? '').trim(),
            startObject: String(row?.startObject ?? '').trim(),
            stopObject: String(row?.stopObject ?? '').trim(),
            endScanAt: toIso(row?.endScanAt),
            comment: String(row?.comment ?? '').trim(),
          },
        ]
      })
      .filter(Boolean),
  )
  const workdaysByRoomDay = new Map()
  const workdaysByRoom = new Map()
  const workdaysByDay = new Map()

  workdayRows.forEach((row) => {
    const roomId = String(row?.utilityRoomId ?? row?.roomId ?? '').trim()
    const normalizedRoomId = normalizeLookupKey(roomId)
    const workerLogin = String(row?.workerLogin ?? '').trim()
    if (!normalizedRoomId || !workerLogin) {
      return
    }

    const startAt = toIso(row?.startAt)
    const endAt = toIso(row?.endAt)
    const updatedAt = toIso(row?.updatedAt)
    const dayKey = toLocalDayKey(startAt || endAt)
    const candidate = {
      workerLogin,
      workerName: String(row?.workerName ?? '').trim(),
      startAt,
      endAt,
      updatedAt,
    }

    if (dayKey) {
      const roomDayKey = `${normalizedRoomId}|${dayKey}`
      const list = workdaysByRoomDay.get(roomDayKey) ?? []
      list.push(candidate)
      workdaysByRoomDay.set(roomDayKey, list)

      const dayList = workdaysByDay.get(dayKey) ?? []
      dayList.push(candidate)
      workdaysByDay.set(dayKey, dayList)
    }

    const roomList = workdaysByRoom.get(normalizedRoomId) ?? []
    roomList.push(candidate)
    workdaysByRoom.set(normalizedRoomId, roomList)
  })

  const byLatest = (left, right) => {
    const leftTs = new Date(left.startAt || left.endAt || left.updatedAt || 0).getTime()
    const rightTs = new Date(right.startAt || right.endAt || right.updatedAt || 0).getTime()
    return rightTs - leftTs
  }
  workdaysByRoomDay.forEach((list, key) => {
    workdaysByRoomDay.set(key, [...list].sort(byLatest))
  })
  workdaysByRoom.forEach((list, key) => {
    workdaysByRoom.set(key, [...list].sort(byLatest))
  })
  workdaysByDay.forEach((list, key) => {
    workdaysByDay.set(key, [...list].sort(byLatest))
  })

  return {
    clientById,
    clientByNormalizedId,
    clientByNormalizedName,
    zoneById,
    zoneByNormalizedId,
    zoneByNormalizedName,
    workerByLogin,
    workerByNormalizedLogin,
    workerByNormalizedName,
    workdayById,
    workdaysByRoomDay,
    workdaysByRoom,
    workdaysByDay,
  }
}

function extractQrCodesFromText(value) {
  const text = sanitizeTextValue(value)
  if (!text) {
    return []
  }

  const codes = []
  const regex = /\b([A-Z]{1,6}\d{2,}[A-Z0-9-]*)\b/gi
  let match = regex.exec(text)
  while (match) {
    const code = String(match?.[1] ?? '')
      .trim()
      .toUpperCase()
    if (code && !codes.includes(code)) {
      codes.push(code)
    }
    match = regex.exec(text)
  }

  return codes
}

function isAssignedQrCodeLike(value) {
  const text = sanitizeTextValue(value).toUpperCase()
  if (!text || text === '-') {
    return false
  }
  return /^[A-Z]{1,8}\d{2,}[A-Z0-9-]*$/.test(text)
}

function firstAssignedQrCode(candidates = []) {
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const direct = sanitizeTextValue(candidate).toUpperCase()
    if (isAssignedQrCodeLike(direct)) {
      return direct
    }
    const extracted = extractQrCodesFromText(direct).find((code) => isAssignedQrCodeLike(code))
    if (extracted) {
      return extracted
    }
  }
  return ''
}

function firstExplicitQrCode(candidates = []) {
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const direct = sanitizeTextValue(candidate).toUpperCase()
    if (isAssignedQrCodeLike(direct)) {
      return direct
    }
  }
  return ''
}

function firstExplicitTextCode(candidates = []) {
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const direct = sanitizeTextValue(candidate)
    if (direct) {
      return direct
    }
  }
  return ''
}

function findZoneByCode(lookupMaps, code) {
  const text = sanitizeTextValue(code)
  if (!lookupMaps || !text) {
    return null
  }

  const normalized = normalizeLookupKey(text)
  return (
    lookupMaps.zoneById.get(text) ||
    lookupMaps.zoneByNormalizedId.get(normalized) ||
    null
  )
}

function resolveClientFromZone(lookupMaps, zone) {
  const zoneClientId = sanitizeTextValue(zone?.clientId)
  if (!lookupMaps || !zoneClientId) {
    return null
  }

  const normalizedClientId = normalizeLookupKey(zoneClientId)
  return (
    lookupMaps.clientById.get(zoneClientId) ||
    lookupMaps.clientByNormalizedId.get(normalizedClientId) ||
    lookupMaps.clientByNormalizedName.get(normalizedClientId) ||
    null
  )
}

function resolveClientByIdStrict(lookupMaps, clientId) {
  const id = sanitizeTextValue(clientId)
  if (!lookupMaps || !id) {
    return null
  }

  const normalized = normalizeLookupKey(id)
  return lookupMaps.clientById.get(id) || lookupMaps.clientByNormalizedId.get(normalized) || null
}

function qrFunctionToken(value) {
  const raw = sanitizeTextValue(value)
  if (!raw) return ''
  let normalized = raw
  try {
    normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  } catch {
    normalized = raw
  }
  return normalized.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function isSpecialQrFunction(value) {
  const token = qrFunctionToken(value)
  return token.includes('STREFASPECJALNA') || token.includes('KODSPECJALNY')
}

function resolveCurrentQrZoneMeta(qrCode, lookupMaps) {
  const code = firstExplicitQrCode([qrCode])
  if (!code || !lookupMaps) {
    return {
      qrCode: code,
      zone: null,
      client: null,
      clientId: '',
      clientName: '',
      zoneName: '',
      functionName: '',
      isSpecialZone: false,
      location: '',
    }
  }

  const zone = findZoneByCode(lookupMaps, code)
  const clientId = sanitizeTextValue(zone?.clientId)
  const client = resolveClientByIdStrict(lookupMaps, clientId)
  const functionName = sanitizeTextValue(pickFirstText(zone?.functionName, zone?.function, zone?.function_name))

  return {
    qrCode: code,
    zone,
    client,
    clientId,
    clientName: sanitizeTextValue(client?.name || clientId),
    zoneName: sanitizeTextValue(pickFirstText(zone?.name, zone?.zone, zone?.zoneName)),
    functionName,
    isSpecialZone: isSpecialQrFunction(functionName),
    location: sanitizeTextValue(zone?.location),
  }
}

function pickClosestWorkerCandidate(candidates, eventStartAt) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null
  }

  const startTs = new Date(toIso(eventStartAt) || 0).getTime()
  if (!Number.isFinite(startTs) || startTs <= 0) {
    return candidates[0] ?? null
  }

  let best = null
  let bestDistance = Number.POSITIVE_INFINITY
  candidates.forEach((candidate) => {
    const candidateTs = new Date(toIso(candidate?.startAt) || 0).getTime()
    if (!Number.isFinite(candidateTs) || candidateTs <= 0) {
      return
    }
    const distance = Math.abs(candidateTs - startTs)
    if (distance < bestDistance) {
      bestDistance = distance
      best = candidate
    }
  })

  return best ?? candidates[0] ?? null
}

function mapWorkday(orgId, row, lookupMaps) {
  const rawEventId = sanitizeTextValue(row.eventId ?? row.cycleId)
  const rawWorkdayId = sanitizeTextValue(row.workdayId)
  const workdayId = rawWorkdayId || rawEventId
  const eventId = rawEventId || workdayId
  const linkedWorkday = lookupMaps.workdayById.get(rawWorkdayId) ?? null
  const workerLoginCandidate = sanitizeTextValue(
    row.workerLogin ?? row.worker?.login ?? row.workday?.workerLogin ?? linkedWorkday?.workerLogin ?? '',
  )
  const workdayUtilityRoomId = sanitizeTextValue(
    row?.workday?.utilityRoomId ??
      linkedWorkday?.utilityRoomId ??
      row?.utilityRoomId ??
      row?.roomId ??
      row?.zoneId ??
      row?.zone?.ZoneId ??
      row?.zone?.zoneId,
  )
  let roomId = sanitizeTextValue(
    row.zoneId ?? row.utilityRoomId ?? row.roomId ?? workdayUtilityRoomId ?? row.zone?.ZoneId ?? row.zone?.zoneId,
  )
  let normalizedRoomId = normalizeLookupKey(roomId)
  const startAt = toIso(row.startAt)
  const endAt = toIso(row.endAt)
  const rawStartObject = sanitizeTextValue(row?.startObject)
  const rawStopObject = sanitizeTextValue(row?.stopObject)
  const dayStartAt = toIso(row?.workday?.startAt ?? linkedWorkday?.startAt ?? row?.startAt)
  const dayEndScanAt = toIso(row?.workday?.endScanAt ?? linkedWorkday?.endScanAt ?? row?.endScanAt)
  const dayEndAt = toIso(row?.workday?.endAt ?? linkedWorkday?.endAt ?? row?.endAt ?? dayEndScanAt)
  const dayGps = sanitizeTextValue(row?.workday?.gps ?? linkedWorkday?.gps ?? row?.gps)
  const dayStartObjectRaw = sanitizeTextValue(
    row?.workday?.startObject ?? linkedWorkday?.startObject ?? rawStartObject,
  )
  const dayStopObjectRaw = sanitizeTextValue(row?.workday?.stopObject ?? linkedWorkday?.stopObject ?? rawStopObject)
  const dayComment = sanitizeTextValue(row?.workday?.comment ?? linkedWorkday?.comment ?? row?.comment)
  const dayStartObject = sanitizeTextValue(dayStartObjectRaw)
  const dayStopObject = sanitizeTextValue(dayStopObjectRaw)
  const explicitEventQrCode = firstAssignedQrCode([
    row?.zoneId,
    row?.utilityRoomId,
    row?.roomId,
    rawStartObject,
    rawStopObject,
    row?.comment,
  ])
  const workdayStartQrCode = firstAssignedQrCode([
    dayStartObjectRaw,
    rawStartObject,
    workdayUtilityRoomId,
    row?.utilityRoomId,
    row?.roomId,
    dayComment,
    row?.comment,
  ])
  const workdayStopQrCode = firstAssignedQrCode([dayStopObjectRaw, rawStopObject, dayComment, row?.comment])
  const authoritativeQrCode = rawEventId
    ? explicitEventQrCode || workdayStartQrCode || workdayStopQrCode
    : workdayStartQrCode || workdayStopQrCode
  roomId = sanitizeTextValue(
    pickFirstText(
      authoritativeQrCode,
      roomId,
      firstExplicitTextCode([workdayUtilityRoomId, dayStartObjectRaw, rawStartObject]),
    ),
  )
  normalizedRoomId = normalizeLookupKey(roomId)
  const durationSec = calculateDuration(row)
  const fallbackZoneNameFromRow = sanitizeTextValue(
    pickFirstText(row?.strefa, row?.zoneName, row?.zoneLabel, row?.zone?.zone, row?.zone?.name),
  )
  const fallbackZoneLocationFromRow = sanitizeTextValue(
    pickFirstText(row?.lokalizacja, row?.location, row?.zone?.location),
  )
  const fallbackClientNameFromRow = sanitizeTextValue(
    pickFirstText(row?.pomieszczenie, row?.clientName, row?.klient, row?.client?.name, row?.zone?.client?.name),
  )
  const zoneFromRowRaw = {
    id: sanitizeTextValue(row?.zone?.ZoneId ?? row?.zone?.zoneId ?? row?.zoneId ?? roomId),
    clientId: sanitizeTextValue(row?.zone?.client?.clientId ?? row?.clientId),
    name: sanitizeTextValue(pickFirstText(row?.zone?.zone, row?.zone?.name, fallbackZoneNameFromRow)),
    zone: sanitizeTextValue(pickFirstText(row?.zone?.zone, row?.zone?.name, fallbackZoneNameFromRow)),
    functionName: sanitizeTextValue(
      pickFirstText(row?.zone?.functionName, row?.zone?.function, row?.zoneFunction, row?.functionName, row?.function),
    ),
    location: sanitizeTextValue(pickFirstText(row?.zone?.location, fallbackZoneLocationFromRow)),
    workerLogin: sanitizeTextValue(row?.zone?.workerLogin),
    workerName: sanitizeTextValue(pickWorkerNameValue(row?.zone?.worker)),
  }
  const zoneFromRow = Object.values(zoneFromRowRaw).some((value) => mappedItemHasValue(value))
    ? zoneFromRowRaw
    : null

  const currentQrMeta = resolveCurrentQrZoneMeta(authoritativeQrCode, lookupMaps)
  const fallbackZoneMeta = !authoritativeQrCode ? resolveCurrentQrZoneMeta(roomId, lookupMaps) : null
  const zoneFromLookup = currentQrMeta.zone || fallbackZoneMeta?.zone || null
  const zone = currentQrMeta.zone
    ? mergeZoneData(currentQrMeta.zone, zoneFromRow)
    : !authoritativeQrCode
      ? mergeZoneData(zoneFromRow, zoneFromLookup)
      : null

  const clientFromEvent = row?.client
    ? {
        id: sanitizeTextValue(row.client.clientId ?? row.clientId),
        name: sanitizeTextValue(row.client.name),
      }
    : row?.zone?.client
      ? {
          id: sanitizeTextValue(row.zone.client.clientId),
          name: sanitizeTextValue(row.zone.client.name),
        }
      : fallbackClientNameFromRow
        ? {
            id: sanitizeTextValue(row.clientId),
            name: fallbackClientNameFromRow,
          }
      : null

  const clientFromZone = currentQrMeta.zone
    ? currentQrMeta.client
    : !authoritativeQrCode
      ? resolveClientFromZone(lookupMaps, zone)
      : null

  const assignedQrCode = firstExplicitQrCode([authoritativeQrCode]) || (!rawEventId ? workdayStopQrCode : '')
  const client = clientFromZone || (!authoritativeQrCode ? clientFromEvent : null)
  const resolvedClientId = sanitizeTextValue(
    pickFirstText(
      currentQrMeta.clientId,
      zone?.clientId,
      client?.id,
      !authoritativeQrCode ? row.clientId : '',
    ),
  )
  const resolvedClientName = sanitizeTextValue(
    pickFirstText(
      currentQrMeta.clientName,
      client?.name,
      !authoritativeQrCode ? fallbackClientNameFromRow : '',
      resolvedClientId,
    ),
  )
  const resolvedZoneName = sanitizeTextValue(
    authoritativeQrCode
      ? pickFirstText(currentQrMeta.zoneName, authoritativeQrCode)
      : pickFirstText(zone?.name, zone?.zone, fallbackZoneNameFromRow),
  )
  const resolvedZoneLocation = sanitizeTextValue(
    authoritativeQrCode ? pickFirstText(currentQrMeta.location) : pickFirstText(zone?.location, fallbackZoneLocationFromRow),
  )
  const resolvedZoneFunction = sanitizeTextValue(
    authoritativeQrCode
      ? pickFirstText(currentQrMeta.functionName, zone?.functionName, zone?.function)
      : pickFirstText(zone?.functionName, zone?.function, row?.zoneFunction, row?.functionName, row?.function),
  )
  const resolvedScanObjectLabel = sanitizeTextValue(
    pickFirstText(resolvedClientName, resolvedZoneLocation, resolvedZoneName, roomId),
  )
  const resolvedIsSpecialZone = Boolean(
    currentQrMeta.isSpecialZone ||
      fallbackZoneMeta?.isSpecialZone ||
      zone?.isSpecialZone ||
      row?.isSpecialZone === true ||
      isSpecialQrFunction(resolvedZoneFunction),
  )
  const eventDayKey = toLocalDayKey(startAt || endAt)
  const roomDayKey = normalizedRoomId && eventDayKey ? `${normalizedRoomId}|${eventDayKey}` : ''
  const inferredFromRoomDay = roomDayKey
    ? pickClosestWorkerCandidate(lookupMaps.workdaysByRoomDay.get(roomDayKey), startAt)
    : null
  const inferredFromRoom = pickClosestWorkerCandidate(lookupMaps.workdaysByRoom.get(normalizedRoomId), startAt)
  const inferredFromDay = pickClosestWorkerCandidate(lookupMaps.workdaysByDay.get(eventDayKey), startAt)
  const inferredWorker = inferredFromRoomDay || inferredFromRoom || inferredFromDay || null
  const allowWorkerFallbackFromPlace = !rawEventId

  const rawWorkerName = pickFirstText(
    pickWorkerNameValue(row.worker),
    row.workerName,
    row.workday?.workerName,
    linkedWorkday?.workerName,
    allowWorkerFallbackFromPlace ? zone?.workerName : '',
    allowWorkerFallbackFromPlace ? inferredWorker?.workerName : '',
  )
  const workerFromName =
    lookupMaps.workerByNormalizedName.get(normalizePersonName(rawWorkerName)) || null

  const resolvedWorkerLogin = pickFirstText(
    resolveWorkerByLogin(
      lookupMaps,
      workerLoginCandidate,
      row.workerLogin,
      row.workday?.workerLogin,
      linkedWorkday?.workerLogin,
      allowWorkerFallbackFromPlace ? zone?.workerLogin : '',
      allowWorkerFallbackFromPlace ? inferredWorker?.workerLogin : '',
    )?.login,
    workerLoginCandidate,
    extractLoginLocalPart(workerLoginCandidate),
    allowWorkerFallbackFromPlace ? zone?.workerLogin : '',
    allowWorkerFallbackFromPlace ? inferredWorker?.workerLogin : '',
    workerFromName?.login,
  )
  const workerFromExplicitLogin =
    resolveWorkerByLogin(
      lookupMaps,
      workerLoginCandidate,
      row.workerLogin,
      row.workday?.workerLogin,
      linkedWorkday?.workerLogin,
    ) || null
  const worker =
    workerFromExplicitLogin ||
    resolveWorkerByLogin(
      lookupMaps,
      resolvedWorkerLogin,
      workerLoginCandidate,
      row.workerLogin,
      row.workday?.workerLogin,
      linkedWorkday?.workerLogin,
      allowWorkerFallbackFromPlace ? zone?.workerLogin : '',
      allowWorkerFallbackFromPlace ? inferredWorker?.workerLogin : '',
    ) || null
  const directWorkerId = canonicalWorkerId(
    pickFirstText(
      row.workerId,
      row.worker?.workerId,
      row.worker?.id,
      row.workday?.workerId,
      row.workday?.worker?.workerId,
      row.workday?.worker?.id,
      linkedWorkday?.workerId,
      linkedWorkday?.worker?.workerId,
      linkedWorkday?.worker?.id,
    ),
  )
  const workerIdValue =
    directWorkerId || canonicalWorkerId(workerFromExplicitLogin?.workerId ?? workerFromExplicitLogin?.id)
  const hasStop = Boolean(endAt || (!rawEventId && dayEndAt))
  const status = normalizeStatus(row.status, hasStop)
  const stopIsoForView = endAt || (!rawEventId ? dayEndAt : '')
  const workerNameFromWorker = pickFirstText(
    pickWorkerNameValue(worker),
    pickWorkerNameValue(workerFromName),
  )
  const workerNameValue = sanitizeTextValue(
    pickFirstText(workerNameFromWorker, rawWorkerName, resolvedWorkerLogin),
  )

  return {
    id: eventId || workdayId,
    eventId: eventId || workdayId,
    workdayId: workdayId || eventId,
    linkedWorkdayId: rawWorkdayId,
    linkedWorkdayFound: Boolean(linkedWorkday),
    linkedWorkdayWorkerLogin: linkedWorkday?.workerLogin ?? '',
    linkedWorkdayMatchesWorker: Boolean(
      linkedWorkday &&
        normalizeLookupKey(linkedWorkday.workerLogin) &&
        normalizeLookupKey(linkedWorkday.workerLogin) === normalizeLookupKey(resolvedWorkerLogin),
    ),
    linkedWorkdayStatus: linkedWorkday?.status ?? '',
    linkedWorkdayEndAt: linkedWorkday?.endAt ?? '',
    historySourceKind: rawEventId ? 'event' : 'workday',
    hasExplicitEventId: Boolean(rawEventId),
    orgId,
    taskId: row.taskId ?? row.task_id,
    occurrenceDateYmd: row.occurrenceDateYmd ?? row.occurrence_date_ymd,
    serviceBlockId: row.serviceBlockId ?? row.service_block_id,
    allocationId: row.allocationId ?? row.allocation_id,
    workSlotKey: row.workSlotKey ?? row.work_slot_key,
    eventType: row.eventType ?? row.event_type,
    matchStatus: row.matchStatus ?? row.match_status,
    matchMethod: row.matchMethod ?? row.match_method,
    matchReason: row.matchReason ?? row.match_reason,
    matchedAt: row.matchedAt ?? row.matched_at,
    planSnapshotVersion: row.planSnapshotVersion ?? row.plan_snapshot_version,
    plannedStartAt: row.plannedStartAt ?? row.planned_start_at,
    plannedEndAt: row.plannedEndAt ?? row.planned_end_at,
    plannedDurationMinutes: row.plannedDurationMinutes ?? row.planned_duration_minutes,
    taskUpdatedAtSnapshot: row.taskUpdatedAtSnapshot ?? row.task_updated_at_snapshot,
    workerId: workerIdValue,
    workerLogin: resolvedWorkerLogin,
    workerName: workerNameValue,
    workerType: sanitizeTextValue(worker?.type ?? worker?.role),
    roomId,
    utilityRoomId: roomId,
    zoneId: roomId,
    strefa: sanitizeTextValue(resolvedZoneName || '-'),
    zoneName: sanitizeTextValue(resolvedZoneName || '-'),
    zoneFunction: resolvedZoneFunction,
    functionName: resolvedZoneFunction,
    isSpecialZone: resolvedIsSpecialZone,
    clientId: resolvedClientId,
    klient: sanitizeTextValue(resolvedClientName || '-'),
    clientName: sanitizeTextValue(resolvedClientName || '-'),
    lokalizacja: sanitizeTextValue(resolvedZoneLocation || '-'),
    scanObjectLabel: sanitizeTextValue(resolvedScanObjectLabel || '-'),
    startAt,
    endAt,
    dayStartAt,
    dayEndAt,
    dayEndScanAt,
    dayGps,
    dayStartObject,
    dayStopObject,
    workdayUtilityRoomId,
    qrCode: assignedQrCode,
    dayComment,
    date: formatDatePl(startAt || endAt),
    start: formatTime(startAt),
    stop: formatTime(stopIsoForView),
    durationSec,
    duration: durationToHms(durationSec),
    status,
    closeMarkedAt: toIso(row.closeMarkedAt),
    endReason: sanitizeTextValue(row.endReason),
    comment: sanitizeTextValue(row.comment),
    pauseId: sanitizeTextValue(row.pauseId),
    clientIndId: sanitizeTextValue(row.clientIndId),
    clientStatus: sanitizeTextValue(row.clientStatus),
    deviceId: sanitizeTextValue(row.deviceId),
    startEventId: sanitizeTextValue(row.startEventId),
    endEventId: sanitizeTextValue(row.endEventId),
    editedBy: sanitizeTextValue(row.updatedBy),
    updatedAt: toIso(row.updatedAt),
    dayKey: toLocalDayKey(startAt || endAt || dayStartAt || dayEndAt),
  }
}

function isDisplayableMappedItem(item) {
  const eventId = String(item?.eventId ?? item?.workdayId ?? '').trim()
  const workerLogin = String(item?.workerLogin ?? '').trim()
  const workerName = String(item?.workerName ?? '').trim()
  const zoneId = String(item?.zoneId ?? item?.roomId ?? '').trim()
  const zoneName = String(item?.zoneName ?? item?.strefa ?? '').trim()
  const clientName = String(item?.clientName ?? item?.klient ?? '').trim()
  const hasTime = Boolean(item?.startAt || item?.endAt || item?.dayStartAt || item?.dayEndAt || Number(item?.durationSec) > 0)
  const hasContext = Boolean(zoneId || zoneName || clientName)
  const hasWorker = Boolean(workerLogin || workerName)
  const hasErrorPayload = looksLikeSerializedError(workerLogin) || looksLikeSerializedError(workerName)

  if (hasErrorPayload && !hasTime && !hasContext) {
    return false
  }

  if (!eventId && !hasTime && !hasContext && !hasWorker) {
    return false
  }

  return true
}

function normalizeDurationSeconds(value, startAt, endAt) {
  const parsed = Number(value)
  if (Number.isFinite(parsed) && parsed >= 0) {
    return Math.floor(parsed)
  }

  const startIso = toIso(startAt)
  const endIso = toIso(endAt)
  if (!startIso || !endIso) {
    return 0
  }

  const diff = Math.floor((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000)
  return Number.isFinite(diff) && diff > 0 ? diff : 0
}

function buildEventMutationPayload(payload = {}) {
  const zoneId = toNullableText(payload.zoneId ?? payload.utilityRoomId ?? payload.roomId)
  const clientId = toNullableText(payload.clientId)
  const startAt = toNullableIso(payload.startAt)
  const endAt = toNullableIso(payload.endAt)
  const durationSec = normalizeDurationSeconds(payload.durationSec, startAt, endAt)
  const normalizedStatus = normalizeStatus(payload.status, Boolean(endAt))
  const closeMarkedAt = toNullableIso(payload.closeMarkedAt) ?? (normalizedStatus === 'CLOSED' ? endAt : null)

  return {
    zoneId,
    clientId,
    workdayId: toNullableText(payload.workdayId ?? payload.linkedWorkdayId),
    workerLogin: toNullableText(payload.workerLogin),
    pauseId: toNullableText(payload.pauseId),
    clientIndId: toNullableText(payload.clientIndId),
    clientStatus: toNullableText(payload.clientStatus ?? (clientId ? 'CLIENT' : null)),
    startAt,
    endAt,
    durationSec,
    status: normalizedStatus || null,
    closeMarkedAt,
    endReason: toNullableText(payload.endReason),
    comment: toNullableText(payload.comment),
    deviceId: toNullableText(payload.deviceId),
    startEventId: toNullableText(payload.startEventId),
    endEventId: toNullableText(payload.endEventId),
  }
}

async function fetchLookupMaps(orgId, options = {}) {
  const includeWorkdays = Boolean(options.includeWorkdays)
  const explicitWorkdayRows = Array.isArray(options.workdayRows) ? options.workdayRows : null
  const [clients, zones, workers, workdayRows] = await Promise.all([
    getClients(orgId),
    getZones(orgId),
    getWorkers(orgId),
    explicitWorkdayRows
      ? Promise.resolve(explicitWorkdayRows)
      : includeWorkdays
        ? getRawWorkdaysForOrg(orgId).catch(() => [])
        : Promise.resolve([]),
  ])
  return buildLookupMaps(clients, zones, workers, workdayRows)
}

async function fetchMappedWorkdays(orgId, rowsPromise, operationName) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  ensureFirebase()
  let response
  try {
    response = await rowsPromise
  } catch (error) {
    throw withOperationNotFoundHint(error, operationName)
  }

  const lookupMaps = await fetchLookupMaps(orgId, { includeWorkdays: true })
  const rows = Array.isArray(response) ? response : response?.data?.workdays ?? []
  return rows.map((row) => mapWorkday(orgId, row, lookupMaps))
}

async function getMappedWorkdaysForOrg(orgId) {
  return readWorkdayCached(orgId, 'mapped-workdays', () =>
    fetchMappedWorkdays(orgId, getRawWorkdaysForOrg(orgId), 'WorkdaysForOrg'),
  )
}

function mappedItemIdentity(item, fallback = '') {
  const baseId = String(item?.workdayId ?? item?.eventId ?? item?.id ?? fallback).trim()
  if (!baseId) {
    return ''
  }

  const startAt = toIso(item?.startAt)
  const endAt = toIso(item?.endAt)
  const role = startAt && !endAt ? 'start' : !startAt && endAt ? 'stop' : 'cycle'

  return `${baseId}|${role}|${startAt || ''}|${endAt || ''}`
}

function mappedItemHasValue(value) {
  if (value == null) {
    return false
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) && value !== 0
  }
  if (typeof value === 'boolean') {
    return true
  }
  const text = String(value).trim()
  return Boolean(text) && text !== '-'
}

function mappedItemScore(item) {
  const fields = [
    'workdayId',
    'eventId',
    'workerLogin',
    'workerName',
    'roomId',
    'zoneId',
    'strefa',
    'klient',
    'clientName',
    'startAt',
    'endAt',
    'status',
    'comment',
    'updatedAt',
  ]

  return fields.reduce((score, field) => score + (mappedItemHasValue(item?.[field]) ? 1 : 0), 0)
}

function mappedItemStamp(item) {
  const candidates = [item?.updatedAt, item?.closeMarkedAt, item?.endAt, item?.startAt]
  let bestTs = 0
  candidates.forEach((value) => {
    const ts = toTimestamp(value)
    if (ts > bestTs) {
      bestTs = ts
    }
  })
  return bestTs
}

export function mergeMappedEventCollections(primaryItems, secondaryItems) {
  const mergedById = new Map()

  const mergeTwoItems = (left, right) => {
    const leftScore = mappedItemScore(left)
    const rightScore = mappedItemScore(right)
    const leftStamp = mappedItemStamp(left)
    const rightStamp = mappedItemStamp(right)

    const preferRight = rightScore > leftScore || (rightScore === leftScore && rightStamp > leftStamp)
    const preferred = preferRight ? right : left
    const fallback = preferRight ? left : right
    const merged = { ...fallback, ...preferred }
    const explicitSource = [left, right].find((item) => {
      const sourceKind = String(item?.historySourceKind ?? '').trim().toLowerCase()
      const eventId = String(item?.eventId ?? item?.id ?? '').trim()
      return item?.hasExplicitEventId === true || (sourceKind === 'event' && eventId)
    })
    const identity = mappedItemIdentity(merged)

    if (identity && !mappedItemHasValue(merged.id)) {
      merged.id = identity
    }
    if (explicitSource) {
      const explicitEventId = String(explicitSource?.eventId ?? explicitSource?.id ?? '').trim()
      if (explicitEventId) {
        merged.id = explicitEventId
        merged.eventId = explicitEventId
      }
      const canonicalEventFields = [
        'workdayId',
        'eventType',
        'workerId',
        'workerLogin',
        'workerName',
        'roomId',
        'utilityRoomId',
        'zoneId',
        'startAt',
        'endAt',
        'durationSec',
        'status',
        'closeMarkedAt',
        'endReason',
        'comment',
        'deviceId',
        'startEventId',
        'endEventId',
        'taskId',
        'occurrenceDateYmd',
        'serviceBlockId',
        'allocationId',
        'workSlotKey',
        'matchStatus',
        'matchMethod',
        'matchReason',
        'matchedAt',
        'planSnapshotVersion',
        'plannedStartAt',
        'plannedEndAt',
        'plannedDurationMinutes',
        'taskUpdatedAtSnapshot',
        'linkedWorkdayId',
        'linkedWorkdayFound',
        'linkedWorkdayWorkerLogin',
        'linkedWorkdayMatchesWorker',
        'linkedWorkdayStatus',
        'linkedWorkdayEndAt',
      ]
      canonicalEventFields.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(explicitSource, field)) {
          merged[field] = explicitSource[field]
        }
      })
      merged.historySourceKind = 'event'
      merged.hasExplicitEventId = true
    }
    if (!mappedItemHasValue(merged.eventId) && mappedItemHasValue(merged.workdayId)) {
      merged.eventId = merged.workdayId
    }
    if (!mappedItemHasValue(merged.workdayId) && mappedItemHasValue(merged.eventId)) {
      merged.workdayId = merged.eventId
    }

    return merged
  }

  const upsert = (item, index, prefix) => {
    const identity = mappedItemIdentity(item, `${prefix}-${index}`)
    const existing = mergedById.get(identity)
    if (!existing) {
      mergedById.set(identity, item)
      return
    }
    mergedById.set(identity, mergeTwoItems(existing, item))
  }

  primaryItems.forEach((item, index) => upsert(item, index, 'event'))
  secondaryItems.forEach((item, index) => upsert(item, index, 'workday'))

  return [...mergedById.values()]
}

function mappedEventIntervalMinute(value) {
  const iso = toIso(value)
  if (!iso) {
    return ''
  }

  const timestamp = new Date(iso).getTime()
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return ''
  }

  return String(Math.floor(timestamp / 60000))
}

function mappedEventIntervalIdentityKeys(item = {}) {
  const startMinute = mappedEventIntervalMinute(item?.startAt || item?.dayStartAt)
  const endMinute = mappedEventIntervalMinute(item?.endAt || item?.dayEndAt || item?.closeMarkedAt)
  if (!startMinute || !endMinute) {
    return []
  }

  return [
    item?.workerId,
    item?.workerLogin,
    item?.workerName,
  ]
    .map((value) => normalizeLookupKey(value))
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
    .map((workerKey) => `${workerKey}|${startMinute}|${endMinute}`)
}

function mappedEventScannedQrCode(item = {}) {
  return firstAssignedQrCode([
    item?.dayStartObject,
    item?.dayStopObject,
    item?.startObject,
    item?.stopObject,
    item?.dayComment,
    item?.comment,
  ])
}

function mappedEventIntervalQrCode(item = {}) {
  return firstAssignedQrCode([
    mappedEventScannedQrCode(item),
    item?.comment,
    item?.dayComment,
  ])
}

function mappedEventHasAssignedQrObject(item = {}) {
  const qrCode = mappedEventIntervalQrCode(item)
  if (!qrCode) {
    return false
  }
  const zoneLabel = sanitizeTextValue(item?.strefa ?? item?.zoneName)
  const clientLabel = sanitizeTextValue(item?.clientName ?? item?.klient ?? item?.clientId)
  return Boolean(zoneLabel && zoneLabel !== '-' && clientLabel && clientLabel !== '-')
}

function mappedEventIntervalScore(item = {}) {
  let score = mappedItemScore(item)
  const sourceKind = String(item?.historySourceKind ?? '').trim().toLowerCase()
  const scannedQr = mappedEventScannedQrCode(item)
  if (scannedQr) score += 2000
  if (sourceKind === 'workday' || item?.hasExplicitEventId === false) score += 1000
  if (mappedEventHasAssignedQrObject(item)) score += scannedQr ? 500 : 50
  if (mappedEventIntervalQrCode(item)) score += 250
  if (mappedItemHasValue(item?.zoneId ?? item?.roomId ?? item?.utilityRoomId)) score += 8
  if (mappedItemHasValue(item?.strefa ?? item?.zoneName)) score += 6
  if (mappedItemHasValue(item?.clientName ?? item?.klient ?? item?.clientId)) score += 5
  if (mappedItemHasValue(item?.dayStartObject ?? item?.dayStopObject ?? item?.workdayUtilityRoomId)) score += 4
  if (mappedItemHasValue(item?.lokalizacja ?? item?.location)) score += 2
  if (sourceKind === 'event') score -= 25
  return {
    score,
    stamp: mappedItemStamp(item),
  }
}

function dedupeMappedEventIntervals(items = []) {
  const byInterval = new Map()
  ;(Array.isArray(items) ? items : []).forEach((item, index) => {
    const keys = mappedEventIntervalIdentityKeys(item)
    const key = keys.find((candidate) => byInterval.has(candidate)) || keys[0] || `row-${index}`
    const existing = byInterval.get(key)
    if (!existing) {
      ;(keys.length ? keys : [key]).forEach((candidate) => {
        byInterval.set(candidate, item)
      })
      return
    }

    const existingHasScannedQr = Boolean(mappedEventScannedQrCode(existing))
    const incomingHasScannedQr = Boolean(mappedEventScannedQrCode(item))
    const mergedKeys = [
      ...mappedEventIntervalIdentityKeys(existing),
      ...mappedEventIntervalIdentityKeys(item),
      key,
    ].filter(Boolean)

    const existingIsExplicitEvent =
      existing?.hasExplicitEventId === true ||
      String(existing?.historySourceKind ?? '').trim().toLowerCase() === 'event'
    const incomingIsExplicitEvent =
      item?.hasExplicitEventId === true ||
      String(item?.historySourceKind ?? '').trim().toLowerCase() === 'event'
    if (existingIsExplicitEvent !== incomingIsExplicitEvent) {
      const preferred = incomingIsExplicitEvent ? item : existing
      ;[...new Set(mergedKeys)].forEach((candidate) => {
        byInterval.set(candidate, preferred)
      })
      return
    }

    if (existingHasScannedQr !== incomingHasScannedQr) {
      const preferred = incomingHasScannedQr ? item : existing
      ;[...new Set(mergedKeys)].forEach((candidate) => {
        byInterval.set(candidate, preferred)
      })
      return
    }

    const existingScore = mappedEventIntervalScore(existing)
    const incomingScore = mappedEventIntervalScore(item)
    const preferred =
      incomingScore.score > existingScore.score ||
      (incomingScore.score === existingScore.score && incomingScore.stamp > existingScore.stamp)
        ? item
        : existing
    ;[...new Set(mergedKeys)].forEach((candidate) => {
      byInterval.set(candidate, preferred)
    })
  })

  return [...new Set(byInterval.values())]
}

async function fetchMappedEvents(orgId) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  ensureFirebase()
  let mappedEvents = []
  let mappedWorkdays = []
  if (!eventsForOrgUnavailable) {
    try {
      const rows = await getRawEventsForOrg(orgId)
      const lookupMaps = await fetchLookupMaps(orgId, { includeWorkdays: true })
      mappedEvents = rows
        .map((row) => mapWorkday(orgId, row, lookupMaps))
        .filter((item) => isDisplayableMappedItem(item))
    } catch (error) {
      if (!isOperationNotFoundError(error, 'EventsForOrg')) {
        throw error
      }

      eventsForOrgUnavailable = true
    }
  }

  // Always include workdays - new edits are written there and can appear earlier than EventsForOrg.
  try {
    mappedWorkdays = await getMappedWorkdaysForOrg(orgId)
  } catch (error) {
    if (!isOperationNotFoundError(error, 'WorkdaysForOrg')) {
      throw error
    }
  }

  const collections = [mappedEvents, mappedWorkdays]
  const nonEmptyCollections = collections.filter((items) => Array.isArray(items) && items.length)
  if (!nonEmptyCollections.length) {
    return []
  }

  const merged = nonEmptyCollections.reduce((acc, items) => {
    if (!acc.length) {
      return items
    }
    return mergeMappedEventCollections(acc, items)
  }, [])

  return dedupeMappedEventIntervals(merged.filter((item) => isDisplayableMappedItem(item)))
}

async function getMappedEventsForOrg(orgId) {
  return readWorkdayCached(orgId, 'mapped-events', () => fetchMappedEvents(orgId))
}

async function fetchMappedOpenEventIntegrityRows(orgId) {
  const rows = []
  const pageSize = EVENTS_FAST_PAGE_MAX_SIZE
  const maxPages = 80

  for (let page = 1; page <= maxPages; page += 1) {
    let nextRows
    try {
      nextRows = await runEventsPageQuery(
        'EventsIntegrityPageForOrg',
        {
          orgId,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        },
        'events',
        { forceRefresh: true },
      )
    } catch (cause) {
      const error = new Error(
        'Nie można potwierdzić kompletnego stanu otwartych Eventów. Wymagana operacja EventsIntegrityPageForOrg jest niedostępna.',
      )
      error.code = 'INTEGRITY_CHECK_INCOMPLETE'
      error.cause = cause
      throw error
    }

    rows.push(...nextRows)
    if (nextRows.length < pageSize) {
      const lookupMaps = await fetchLookupMaps(orgId, { includeWorkdays: true })
      return rows
        .map((row) => mapWorkday(orgId, row, lookupMaps))
        .filter((item) => isDisplayableMappedItem(item))
        .filter(
          (item) =>
            item?.hasExplicitEventId === true &&
            !String(item?.endAt ?? '').trim() &&
            String(item?.status ?? '').trim().toUpperCase() !== 'CLOSED',
        )
    }
  }

  const error = new Error(
    'Nie można bezpiecznie zweryfikować otwartych Eventów: historia organizacji przekracza limit 20000 rekordów.',
  )
  error.code = 'INTEGRITY_CHECK_INCOMPLETE'
  throw error
}

async function getMappedOpenEventIntegrityRows(orgId) {
  return readWorkdayCached(orgId, 'mapped-open-event-integrity', () =>
    fetchMappedOpenEventIntegrityRows(orgId))
}

function buildFastPageResponse(orgId, filters, filteredRows, page, pageSize, hasMoreSourceRows) {
  const pageOffset = normalizedPageOffset(page, pageSize)
  const hasNext = filteredRows.length > pageOffset + pageSize || hasMoreSourceRows
  const items = filteredRows.slice(pageOffset, pageOffset + pageSize)
  const visibleTotal = pageOffset + items.length + (hasNext ? 1 : 0)

  return {
    orgId,
    filters,
    items,
    page,
    pageSize,
    total: visibleTotal,
    totalPages: hasNext ? page + 1 : Math.max(1, Math.ceil(Math.max(visibleTotal, 1) / pageSize)),
    hasNext,
    estimatedTotal: hasNext,
  }
}

async function fetchFastEventsPage(orgId, filters = {}, workerLoginHint = '', options = {}) {
  const modeConfig = chooseEventsFastMode(filters, workerLoginHint)
  if (eventsPageForOrgUnavailable || eventsFastPageShouldFallback(filters, modeConfig)) {
    return null
  }

  const includeWorkdays = options.includeWorkdays !== false
  const { page, pageSize, pageOffset } = assertWorkdayReadWindow(filters, 'zdarzeń')
  const desiredCount = pageOffset + pageSize + 1
  const chunkLimit = Math.min(Math.max(pageSize * 3, EVENTS_FAST_PAGE_CHUNK_SIZE), EVENTS_FAST_PAGE_MAX_SIZE)
  const operations = eventFastPageOperationNames(modeConfig.mode)
  const scanLimit = fastPageScanLimit(pageOffset, pageSize)
  const eventRows = []
  const workdayRows = []
  const [clients, zones, workers] = await Promise.all([
    getClients(orgId),
    getZones(orgId),
    getWorkers(orgId),
  ])
  let nextOffset = 0
  let eventsExhausted = false
  let workdaysExhausted = !includeWorkdays
  let filteredRows = []

  try {
    while (nextOffset < scanLimit && filteredRows.length < desiredCount && (!eventsExhausted || !workdaysExhausted)) {
      const variables = buildEventsFastVariables(orgId, filters, modeConfig.mode, {
        ...modeConfig,
        limit: Math.min(chunkLimit, scanLimit - nextOffset),
        offset: nextOffset,
      })
      if (!variables) {
        return null
      }

      const [nextEvents, nextWorkdays] = await Promise.all([
        eventsExhausted
          ? Promise.resolve([])
          : runEventsPageQuery(operations.events, variables, 'events', {
              forceRefresh: filters.forceRefresh === true,
            }),
        workdaysExhausted || !includeWorkdays
          ? Promise.resolve([])
          : runEventsPageQuery(operations.workdays, variables, 'workdays', {
              forceRefresh: filters.forceRefresh === true,
            }),
      ])

      if (nextEvents.length < variables.limit) {
        eventsExhausted = true
      }
      if (nextWorkdays.length < variables.limit) {
        workdaysExhausted = true
      }

      eventRows.push(...nextEvents)
      workdayRows.push(...nextWorkdays)

      const lookupMaps = buildLookupMaps(clients, zones, workers, workdayRows)
      const mappedEvents = eventRows
        .map((row) => mapWorkday(orgId, row, lookupMaps))
        .filter((item) => isDisplayableMappedItem(item))
      const mappedWorkdays = workdayRows
        .map((row) => mapWorkday(orgId, row, lookupMaps))
        .filter((item) => isDisplayableMappedItem(item))
      const merged = mappedEvents.length
        ? mergeMappedEventCollections(mappedEvents, mappedWorkdays)
        : mappedWorkdays
      filteredRows = applyWorkdayFilters(
        sortByLatest(dedupeMappedEventIntervals(merged.filter((item) => isDisplayableMappedItem(item)))),
        filters,
      )

      nextOffset += variables.limit
    }
  } catch (error) {
    if (
      isOperationNotFoundError(error, operations.events) ||
      (includeWorkdays && isOperationNotFoundError(error, operations.workdays))
    ) {
      eventsPageForOrgUnavailable = true
      return null
    }
    throw error
  }

  const hasMoreSourceRows = !eventsExhausted || !workdaysExhausted
  if (hasMoreSourceRows && filteredRows.length < desiredCount) {
    throw pagedReadLimitError('zdarzeń')
  }

  return buildFastPageResponse(orgId, filters, filteredRows, page, pageSize, hasMoreSourceRows)
}

async function fetchFastWorkdaysPage(orgId, filters = {}, workerLoginHint = '') {
  const modeConfig = chooseEventsFastMode(filters, workerLoginHint)
  if (workdaysPageForOrgUnavailable || eventsFastPageShouldFallback(filters, modeConfig)) {
    return null
  }

  const { page, pageSize, pageOffset } = assertWorkdayReadWindow(filters, 'dni pracy')
  const desiredCount = pageOffset + pageSize + 1
  const chunkLimit = Math.min(Math.max(pageSize * 3, EVENTS_FAST_PAGE_CHUNK_SIZE), EVENTS_FAST_PAGE_MAX_SIZE)
  const operationName = eventFastPageOperationNames(modeConfig.mode).workdays
  const scanLimit = fastPageScanLimit(pageOffset, pageSize)
  const workdayRows = []
  const [clients, zones, workers] = await Promise.all([
    getClients(orgId),
    getZones(orgId),
    getWorkers(orgId),
  ])
  let nextOffset = 0
  let sourceExhausted = false
  let filteredRows = []

  try {
    while (nextOffset < scanLimit && filteredRows.length < desiredCount && !sourceExhausted) {
      const variables = buildEventsFastVariables(orgId, filters, modeConfig.mode, {
        ...modeConfig,
        limit: Math.min(chunkLimit, scanLimit - nextOffset),
        offset: nextOffset,
      })
      if (!variables) {
        return null
      }

      const nextWorkdays = await runEventsPageQuery(operationName, variables, 'workdays', {
        forceRefresh: filters.forceRefresh === true,
      })
      if (nextWorkdays.length < variables.limit) {
        sourceExhausted = true
      }
      workdayRows.push(...nextWorkdays)

      const lookupMaps = buildLookupMaps(clients, zones, workers, workdayRows)
      const mappedWorkdays = workdayRows
        .map((row) => mapWorkday(orgId, row, lookupMaps))
        .filter((item) => isDisplayableMappedItem(item))
      filteredRows = applyWorkdayFilters(sortByLatest(mappedWorkdays), filters)
      nextOffset += variables.limit
    }
  } catch (error) {
    if (isOperationNotFoundError(error, operationName)) {
      workdaysPageForOrgUnavailable = true
      return null
    }
    throw error
  }

  const hasMoreSourceRows = !sourceExhausted
  if (hasMoreSourceRows && filteredRows.length < desiredCount) {
    throw pagedReadLimitError('dni pracy')
  }

  return buildFastPageResponse(orgId, filters, filteredRows, page, pageSize, hasMoreSourceRows)
}

async function fetchFastBackupCyclesPage(orgId, filters = {}) {
  if (backupCyclesPageForOrgUnavailable) {
    return null
  }

  const { page, pageSize, pageOffset } = assertWorkdayReadWindow(filters, 'kopii cykli')
  const desiredCount = pageOffset + pageSize + 1
  const chunkLimit = Math.min(Math.max(pageSize * 3, EVENTS_FAST_PAGE_CHUNK_SIZE), EVENTS_FAST_PAGE_MAX_SIZE)
  const scanLimit = fastPageScanLimit(pageOffset, pageSize)
  const backupCycleRows = []
  const [clients, zones, workers] = await Promise.all([
    getClients(orgId),
    getZones(orgId),
    getWorkers(orgId),
  ])
  let nextOffset = 0
  let sourceExhausted = false
  let filteredRows = []

  try {
    while (nextOffset < scanLimit && filteredRows.length < desiredCount && !sourceExhausted) {
      const limit = Math.min(chunkLimit, scanLimit - nextOffset)
      const nextRows = await runEventsPageQuery(
        'BackupCyclesPageForOrg',
        { orgId, limit, offset: nextOffset },
        'backupCycles',
        { forceRefresh: filters.forceRefresh === true },
      )
      if (nextRows.length < limit) {
        sourceExhausted = true
      }
      backupCycleRows.push(...nextRows)

      const lookupMaps = buildLookupMaps(clients, zones, workers, [])
      const mappedRows = backupCycleRows
        .map((row) => mapWorkday(orgId, row, lookupMaps))
        .filter((item) => isDisplayableMappedItem(item))
      filteredRows = applyWorkdayFilters(sortByLatest(mappedRows), filters)
      nextOffset += limit
    }
  } catch (error) {
    if (isOperationNotFoundError(error, 'BackupCyclesPageForOrg')) {
      backupCyclesPageForOrgUnavailable = true
      return null
    }
    throw error
  }

  const hasMoreSourceRows = !sourceExhausted
  if (hasMoreSourceRows && filteredRows.length < desiredCount) {
    throw pagedReadLimitError('kopii cykli')
  }

  return buildFastPageResponse(orgId, filters, filteredRows, page, pageSize, hasMoreSourceRows)
}

async function resolveWorkerLoginHint(orgId, filters = {}) {
  const explicitLogin = String(filters.workerLogin ?? '').trim()
  if (explicitLogin) {
    return explicitLogin
  }

  const workerFilter = String(filters.worker ?? '').trim()
  if (!workerFilter) {
    return ''
  }

  const normalizedFilter = normalizeLookupKey(workerFilter)
  const normalizedNameFilter = normalizePersonName(workerFilter)
  const workers = await getWorkers(orgId).catch(() => [])
  if (!workers.length) {
    return ''
  }

  const exactByLogin =
    workers.find((worker) => {
      const aliases = collectWorkerLookupValues(worker)
      return aliases.some((alias) => normalizeLookupKey(alias) === normalizedFilter)
    }) ?? null
  if (exactByLogin) {
    return pickWorkerLoginValue(exactByLogin)
  }

  const exactByName = workers.filter(
    (worker) => normalizePersonName(pickWorkerNameValue(worker)) === normalizedNameFilter,
  )
  if (exactByName.length === 1) {
    return pickWorkerLoginValue(exactByName[0])
  }

  const partialMatches = workers.filter((worker) => {
    const login = normalizeLookupKey(pickWorkerLoginValue(worker))
    const name = normalizePersonName(pickWorkerNameValue(worker))
    return (
      (normalizedFilter && login.includes(normalizedFilter)) ||
      (normalizedNameFilter && name.includes(normalizedNameFilter))
    )
  })
  if (partialMatches.length === 1) {
    return pickWorkerLoginValue(partialMatches[0])
  }

  return ''
}

export async function getWorkdays(orgId, filters = {}) {
  if (filters.forceRefresh === true || filters.bypassCache === true || filters.noCache === true) {
    invalidateWorkdayCache(orgId)
  }

  const source = String(filters.source ?? '').trim().toLowerCase()
  const sourceLabel =
    source === 'events' || source === 'event'
      ? 'zdarzeń'
      : source === 'worktime' || source === 'work_time'
        ? 'ewidencji czasu pracy'
        : source === 'backupcycle' || source === 'backup_cycle'
          ? 'kopii cykli'
          : 'dni pracy'
  const readWindow = assertWorkdayReadWindow(filters, sourceLabel)
  let mapped
  if (source === 'events-integrity' || source === 'event-integrity') {
    mapped = await getMappedOpenEventIntegrityRows(orgId)
  } else if (source === 'events' || source === 'event') {
    const workerLoginHint = await resolveWorkerLoginHint(orgId, filters)
    const fastResponse = await fetchFastEventsPage(orgId, filters, workerLoginHint)
    if (fastResponse) {
      return fastResponse
    }
    if (filters.requireCompletePagedSource === true) {
      const error = new Error(
        'Nie można potwierdzić kompletnego stanu otwartych rekordów. Wymagana paginowana operacja Data Connect jest niedostępna albo zakres przekracza bezpieczny limit.',
      )
      error.code = 'INTEGRITY_CHECK_INCOMPLETE'
      throw error
    }
    if (filters.allowLegacyFullOrgFallback !== true) {
      throw pagedReadUnavailableError('zdarzeń')
    }

    mapped = await getMappedEventsForOrg(orgId)
    if (workerLoginHint) {
      try {
        const mappedWorkerRows = await fetchMappedWorkdays(
          orgId,
          workerWorkdaysForOrg({ orgId, workerLogin: workerLoginHint }),
          'WorkerWorkdaysForOrg',
        )
        if (mappedWorkerRows.length) {
          mapped = dedupeMappedEventIntervals(mergeMappedEventCollections(mapped, mappedWorkerRows))
            .filter((item) => isDisplayableMappedItem(item))
        }
      } catch (error) {
        if (!isOperationNotFoundError(error, 'WorkerWorkdaysForOrg')) {
          throw error
        }
      }
    }
  } else if (source === 'worktime' || source === 'work_time') {
    const workerLoginHint = await resolveWorkerLoginHint(orgId, filters)
    const modeContext = chooseEventsFastMode(filters, workerLoginHint)
    const fastWorktimeUnavailable = eventsFastPageShouldFallback(filters, modeContext) || readWindow.page !== 1
    if (!fastWorktimeUnavailable) {
      const [workdayResponse, eventResponse] = await Promise.all([
        fetchFastWorkdaysPage(orgId, filters, workerLoginHint),
        fetchFastEventsPage(orgId, filters, workerLoginHint, { includeWorkdays: false }),
      ])
      if (workdayResponse && eventResponse) {
        const fastPageSize = Math.min(workdayResponse.pageSize, eventResponse.pageSize)
        const fastMapped = enrichWorkdaysWithEventIntervals(workdayResponse.items, eventResponse.items)
          .map((item) => ({
            ...item,
            duration: durationToHms(item?.durationSec),
          }))
        const fastFiltered = applyWorkdayFilters(sortByLatest(fastMapped), filters)
        const hasNext = workdayResponse.hasNext === true || eventResponse.hasNext === true
        const items = fastFiltered.slice(0, fastPageSize)
        return {
          orgId,
          filters,
          items,
          page: 1,
          pageSize: fastPageSize,
          total: items.length + (hasNext ? 1 : 0),
          totalPages: hasNext ? 2 : 1,
          hasNext,
          estimatedTotal: hasNext,
        }
      }
      if (filters.allowLegacyFullOrgFallback !== true) {
        throw pagedReadUnavailableError('ewidencji czasu pracy')
      }
    }

    if (fastWorktimeUnavailable && filters.allowLegacyFullOrgFallback !== true) {
      throw pagedReadUnavailableError('ewidencji czasu pracy')
    }

    const [mappedWorkdays, mappedEvents] = await Promise.all([
      getMappedWorkdaysForOrg(orgId),
      getMappedEventsForOrg(orgId).catch(() => []),
    ])
    mapped = enrichWorkdaysWithEventIntervals(mappedWorkdays, mappedEvents)
      .map((item) => ({
        ...item,
        duration: durationToHms(item?.durationSec),
      }))
  } else if (source === 'backupcycle' || source === 'backup_cycle') {
    const fastResponse = await fetchFastBackupCyclesPage(orgId, filters)
    if (fastResponse) {
      return fastResponse
    }
    throw pagedReadUnavailableError('kopii cykli')
  } else {
    const workerLoginHint = await resolveWorkerLoginHint(orgId, filters)
    const fastResponse = await fetchFastWorkdaysPage(orgId, filters, workerLoginHint)
    if (fastResponse) {
      return fastResponse
    }
    if (filters.requireCompletePagedSource === true) {
      const error = new Error(
        'Nie można potwierdzić kompletnego stanu otwartych dni pracy. Wymagana paginowana operacja Data Connect jest niedostępna albo zakres przekracza bezpieczny limit.',
      )
      error.code = 'INTEGRITY_CHECK_INCOMPLETE'
      throw error
    }
    if (filters.allowLegacyFullOrgFallback !== true) {
      throw pagedReadUnavailableError('dni pracy')
    }
    mapped = await getMappedWorkdaysForOrg(orgId)
  }

  const sorted = sortByLatest(mapped)
  const filtered = applyWorkdayFilters(sorted, filters)
  const paged = paginate(filtered, filters.page, filters.pageSize)

  return {
    orgId,
    filters,
    ...paged,
  }
}

export async function getWorkerTime(orgId, workerId, range = {}) {
  const requestedRead = assertWorkdayReadWindow(range, 'ewidencji czasu pracy pracownika')
  const workerLogin = String(workerId ?? range.workerLogin ?? '').trim()
  if (!workerLogin) {
    return {
      orgId,
      workerId,
      range,
      items: [],
      page: requestedRead.page,
      pageSize: requestedRead.pageSize,
      total: 0,
      totalPages: 1,
    }
  }

  const sourcePageSize = Math.min(WORKDAY_READ_MAX_RECORDS, requestedRead.windowEnd)

  const [workdayResponse, eventResponse] = await Promise.all([
    getWorkdays(orgId, {
      source: 'workdays',
      workerLogin,
      fromIso: range.fromIso,
      toIso: range.toIso,
      page: 1,
      pageSize: sourcePageSize,
      forceRefresh: range.forceRefresh === true,
    }),
    getWorkdays(orgId, {
      source: 'events',
      workerLogin,
      fromIso: range.fromIso,
      toIso: range.toIso,
      page: 1,
      pageSize: sourcePageSize,
      forceRefresh: range.forceRefresh === true,
    }).catch((error) => {
      if (isPagedReadSafetyError(error)) {
        throw error
      }
      return { items: [] }
    }),
  ])
  const mapped = enrichWorkdaysWithEventIntervals(workdayResponse.items, eventResponse.items)
    .map((item) => ({
      ...item,
      duration: durationToHms(item?.durationSec),
    }))
  const sorted = sortByLatest(mapped)
  const filtered = applyWorkdayFilters(sorted, range)
  const paged = paginate(filtered, requestedRead.page, requestedRead.pageSize)
  const sourceHasNext = workdayResponse.hasNext === true || eventResponse.hasNext === true

  return {
    orgId,
    workerId: workerLogin,
    range,
    ...paged,
    hasNext: paged.hasNext === true || sourceHasNext,
    estimatedTotal: sourceHasNext,
  }
}

export async function getRecentEvents(orgId, limit = 5) {
  const pageSize = Math.min(Math.max(Number(limit) || 5, 1), WORKDAY_READ_MAX_RECORDS)
  const response = await getWorkdays(orgId, {
    source: 'workdays',
    fromIso: PAGED_HISTORY_FROM_START_AT,
    toIso: PAGED_HISTORY_TO_START_AT,
    page: 1,
    pageSize,
  })

  return response.items.map((item) => ({
    id: item.workdayId,
    workerName: item.workerName || '-',
    zoneName: item.zoneName || '-',
    clientName: item.clientName || '-',
    date: item.date || '-',
    start: item.start || '-',
    stop: item.stop || '-',
    duration: item.duration || '-',
  }))
}

function currentDayYmd() {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

function toTimestamp(value) {
  const iso = toIso(value)
  if (!iso) {
    return 0
  }

  const ts = new Date(iso).getTime()
  return Number.isFinite(ts) ? ts : 0
}

function toLocalDayKey(value) {
  const iso = toIso(value)
  if (!iso) {
    return ''
  }

  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) {
    return ''
  }

  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function isItemFromLocalDay(item, dayKey) {
  const keys = [
    toLocalDayKey(item?.startAt),
    toLocalDayKey(item?.endAt),
    toLocalDayKey(item?.dayStartAt),
    toLocalDayKey(item?.dayEndAt),
    toLocalDayKey(item?.workday?.startAt),
    toLocalDayKey(item?.workday?.endAt),
    String(item?.dayKey ?? '').trim(),
  ].filter(Boolean)

  return keys.includes(dayKey)
}

function extractRawRecordId(item, fallback = '') {
  return String(
    item?.eventId ??
      item?.workdayId ??
      item?.id ??
      item?.cycleId ??
      item?.backupCycleId ??
      item?.workday?.workdayId ??
      fallback,
  ).trim()
}

function extractRawRecordStampTs(item) {
  const candidates = [
    item?.updatedAt,
    item?.createdAt,
    item?.closeMarkedAt,
    item?.endAt,
    item?.startAt,
    item?.workday?.updatedAt,
    item?.workday?.createdAt,
    item?.workday?.endAt,
    item?.workday?.startAt,
  ]

  let bestTs = 0
  candidates.forEach((value) => {
    const ts = toTimestamp(value)
    if (ts > bestTs) {
      bestTs = ts
    }
  })

  return bestTs
}

function upsertTodayFingerprintRecord(recordsMap, item, dayKey, fallbackId) {
  if (!isItemFromLocalDay(item, dayKey)) {
    return
  }

  const id = extractRawRecordId(item, fallbackId) || fallbackId
  const stampTs = extractRawRecordStampTs(item)
  const status = normalizeStatus(item?.status ?? item?.workday?.status, Boolean(item?.endAt ?? item?.workday?.endAt))
  const existing = recordsMap.get(id)

  if (!existing) {
    recordsMap.set(id, { id, stampTs, status })
    return
  }

  if (stampTs > existing.stampTs) {
    recordsMap.set(id, { id, stampTs, status })
    return
  }

  if (stampTs === existing.stampTs && existing.status !== status) {
    recordsMap.set(id, { id, stampTs, status })
  }
}

function buildTodayFingerprint(dayKey, recordsMap) {
  const records = [...recordsMap.values()]
  const total = records.length
  const runningCount = records.filter((row) => row.status === 'RUNNING').length

  let latestTs = 0
  let latestId = ''
  records.forEach((row) => {
    if (row.stampTs > latestTs) {
      latestTs = row.stampTs
      latestId = row.id
      return
    }

    if (row.stampTs === latestTs && row.id > latestId) {
      latestId = row.id
    }
  })

  return {
    day: dayKey,
    total,
    runningCount,
    latestTs,
    latestId,
    token: `${dayKey}|${total}|${runningCount}|${latestTs}|${latestId}`,
  }
}

export async function getTodayWorktimeFingerprint(orgId) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  const day = currentDayYmd()
  const [workdayResponse, eventResponse] = await Promise.all([
    getWorkdays(orgId, {
      source: 'workdays',
      fromIso: day,
      toIso: day,
      page: 1,
      pageSize: WORKDAY_DAILY_READ_MAX_ROWS,
      forceRefresh: true,
    }),
    getWorkdays(orgId, {
      source: 'events',
      fromIso: day,
      toIso: day,
      page: 1,
      pageSize: WORKDAY_DAILY_READ_MAX_ROWS,
      forceRefresh: true,
    }),
  ])
  assertCompletePagedResponse(workdayResponse, 'dzisiejszych dni pracy')
  assertCompletePagedResponse(eventResponse, 'dzisiejszych zdarzen')
  const workdayRows = Array.isArray(workdayResponse?.items) ? workdayResponse.items : []
  const eventRows = Array.isArray(eventResponse?.items) ? eventResponse.items : []

  const recordsMap = new Map()
  workdayRows.forEach((row, index) => {
    upsertTodayFingerprintRecord(recordsMap, row, day, `workday-${index}`)
  })
  eventRows.forEach((row, index) => {
    upsertTodayFingerprintRecord(recordsMap, row, day, `event-${index}`)
  })

  return {
    orgId,
    ...buildTodayFingerprint(day, recordsMap),
  }
}

export async function getEventsFingerprintForOrg(orgId, filters = {}) {
  const unavailable = (reason) => ({
    orgId,
    filters,
    unavailable: true,
    reason,
    token: '',
  })

  if (!EVENTS_FINGERPRINT_FOR_ORG_ENABLED) {
    return unavailable('disabled')
  }

  if (!isFirebaseConfigured() || eventsFingerprintForOrgUnavailable) {
    return unavailable(eventsFingerprintForOrgUnavailable ? 'operation-unavailable' : 'firebase-not-configured')
  }

  const range = normalizeEventsFastRange(filters)
  if (!range) {
    return unavailable('invalid-range')
  }

  ensureFirebase()
  const variables = {
    orgId,
    ...range,
  }

  try {
    const [eventResponse, workdayResponse] = await Promise.all([
      runQueryOperation('EventsFingerprintForOrg', variables),
      runQueryOperation('WorkdaysFingerprintForOrg', variables),
    ])
    const eventRow = eventResponse?.data?.events?.[0] ?? null
    const workdayRow = workdayResponse?.data?.workdays?.[0] ?? null
    const eventToken = eventRow
      ? ['event', eventRow.eventId, eventRow.workdayId, eventRow.updatedAt, eventRow.startAt, eventRow.endAt, eventRow.status]
          .map((value) => String(value ?? ''))
          .join(':')
      : 'event:none'
    const workdayToken = workdayRow
      ? ['workday', workdayRow.workdayId, workdayRow.updatedAt, workdayRow.startAt, workdayRow.endAt, workdayRow.status]
          .map((value) => String(value ?? ''))
          .join(':')
      : 'workday:none'

    return {
      orgId,
      filters,
      token: `${range.fromStartAt}|${range.toStartAt}|${eventToken}|${workdayToken}`,
      eventRow,
      workdayRow,
    }
  } catch (error) {
    if (
      isOperationNotFoundError(error, 'EventsFingerprintForOrg') ||
      isOperationNotFoundError(error, 'WorkdaysFingerprintForOrg')
    ) {
      eventsFingerprintForOrgUnavailable = true
      return unavailable('operation-not-found')
    }
    throw error
  }
}

async function getTodayActiveWorkersFromWorkdays(orgId, options = {}) {
  const day = currentDayYmd()
  const [workdayResponse, workerDirectory] = await Promise.all([
    getWorkdays(orgId, {
      source: 'worktime',
      fromIso: day,
      toIso: day,
      page: 1,
      pageSize: WORKDAY_DAILY_READ_MAX_ROWS,
      forceRefresh: options.forceRefresh === true,
    }),
    getWorkers(orgId).catch(() => []),
  ])
  assertCompletePagedResponse(workdayResponse, 'aktywnych dni pracy')
  const nowTs = Date.now()
  const workers = new Map()
  const workerAliases = new Map()
  const resolveDisplayName = createWorkerDisplayNameResolver(workerDirectory)
  const workerByCanonicalId = new Map()
  const workerByCanonicalDigits = new Map()
  const workerByNormalizedName = new Map()

  workerDirectory.forEach((worker) => {
    const workerId = canonicalWorkerId(worker?.workerId ?? worker?.id)
    if (workerId && !workerByCanonicalId.has(workerId)) {
      workerByCanonicalId.set(workerId, worker)
    }

    const workerDigits = canonicalWorkerDigits(workerId)
    if (workerDigits && !workerByCanonicalDigits.has(workerDigits)) {
      workerByCanonicalDigits.set(workerDigits, worker)
    }

    const workerNameKey = normalizePersonName(pickWorkerNameValue(worker))
    if (!workerNameKey) {
      return
    }

    if (!workerByNormalizedName.has(workerNameKey)) {
      workerByNormalizedName.set(workerNameKey, worker)
      return
    }

    workerByNormalizedName.set(workerNameKey, null)
  })

  const resolveWorkerDirectoryEntry = (item) => {
    const directWorkerId = canonicalWorkerId(item?.workerId ?? item?.worker?.workerId ?? item?.id)
    return directWorkerId ? workerByCanonicalId.get(directWorkerId) || null : null
  }

  const hasReadableLabel = (value) => {
    const text = String(value ?? '').trim()
    return Boolean(text) && text !== '-'
  }
  const hasReadableClientLabel = (value) => {
    const text = String(value ?? '').trim()
    if (!text || text === '-') {
      return false
    }
    const normalized = normalizeLookupKey(text)
    return normalized !== 'unassigned' && normalized !== 'brakklienta' && normalized !== 'nieprzypisany'
  }
  const isQrZoneCodeLike = (value) => {
    const text = String(value ?? '').trim().toUpperCase()
    if (!text || text === '-') {
      return false
    }
    return /^[A-Z]{1,8}\d{2,}[A-Z0-9-]*$/.test(text)
  }
  const resolveZoneCode = (item) => {
    const candidates = [
      item?.zoneId,
      item?.utilityRoomId,
      item?.roomId,
      item?.workdayUtilityRoomId,
      item?.dayStartObject,
      item?.dayStopObject,
    ]
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)

    const qrCode = candidates.find((value) => isQrZoneCodeLike(value))
    if (qrCode) {
      return qrCode
    }

    return candidates[0] || ''
  }

  const shouldReplaceDisplayName = (currentName, candidateName, workerLogin) => {
    const current = String(currentName ?? '').trim()
    const candidate = String(candidateName ?? '').trim()
    if (!candidate) {
      return false
    }
    if (!current) {
      return true
    }

    const currentParts = current.split(/\s+/).filter(Boolean).length
    const candidateParts = candidate.split(/\s+/).filter(Boolean).length
    if (candidateParts > currentParts) {
      return true
    }

    const loginNormalized = normalizeLookupKey(workerLogin)
    const currentNormalized = normalizeLookupKey(current)
    const candidateNormalized = normalizeLookupKey(candidate)
    if (loginNormalized && currentNormalized === loginNormalized && candidateNormalized !== loginNormalized) {
      return true
    }

    return false
  }

  const resolveBucket = (item) => {
    const resolvedWorkerId = canonicalWorkerId(item?.workerId ?? item?.worker?.workerId ?? item?.id)
    if (!resolvedWorkerId) {
      return null
    }
    const linkedWorker = resolveWorkerDirectoryEntry(item)
    const resolvedWorkerLogin = String(
      linkedWorker?.login ?? linkedWorker?.workerLogin ?? item?.workerLogin ?? item?.login ?? '',
    ).trim()
    const resolvedWorkerName = String(
      pickWorkerNameValue(linkedWorker) || item?.workerName || item?.name || '',
    ).trim()
    const primaryLabel = resolveDisplayName(resolvedWorkerLogin, resolvedWorkerName)
    const aliases = [`id:${normalizeLookupKey(resolvedWorkerId)}`]
      .map((value) => normalizeLookupKey(value))
      .filter(Boolean)

    let key = aliases.map((alias) => workerAliases.get(alias)).find(Boolean)
    if (!key) {
      key = aliases[0] || (resolvedWorkerId ? `id:${normalizeLookupKey(resolvedWorkerId)}` : '')
    }
    if (!key) {
      return null
    }

    if (!workers.has(key)) {
      workers.set(key, {
        id: resolvedWorkerId || resolvedWorkerLogin || resolvedWorkerName || key,
        workerId: resolvedWorkerId || '',
        workerLogin: resolvedWorkerLogin || '',
        workerName: primaryLabel,
        entriesCount: 0,
        activeClient: '-',
        activeZone: '-',
        activeLocation: '-',
        activeSortTs: 0,
        latestEventTs: 0,
        firstStartIso: '',
        firstStartTs: 0,
        firstStartClient: '-',
        firstStartZone: '-',
        firstStartZoneId: '',
        firstStartLocation: '-',
        latestStopIso: '',
        latestStopTs: 0,
        closedSec: 0,
        closedIntervals: new Set(),
        runningCandidates: [],
      })
    }

    const bucket = workers.get(key)
    if (resolvedWorkerId && !String(bucket.workerId ?? '').trim()) {
      bucket.workerId = resolvedWorkerId
    }
    if (resolvedWorkerLogin && !String(bucket.workerLogin ?? '').trim()) {
      bucket.workerLogin = resolvedWorkerLogin
    }
    if (resolvedWorkerId && !String(bucket.id ?? '').trim()) {
      bucket.id = resolvedWorkerId
    } else if (resolvedWorkerLogin && !String(bucket.id ?? '').trim()) {
      bucket.id = resolvedWorkerLogin
    }
    if (shouldReplaceDisplayName(bucket.workerName, primaryLabel, resolvedWorkerLogin)) {
      bucket.workerName = primaryLabel
    }

    aliases.forEach((alias) => {
      workerAliases.set(alias, key)
    })

    return bucket
  }

  const uniqueRows = new Map()
  ;(workdayResponse.items ?? [])
    .filter((item) => isItemFromLocalDay(item, day))
    .forEach((item, index) => {
      const startIso = toIso(item?.dayStartAt || item?.startAt)
      const endIso = toIso(item?.dayEndAt || item?.endAt || item?.dayEndScanAt)
      if (!startIso && !endIso) {
        return
      }

      const rowId =
        String(item?.workdayId ?? item?.linkedWorkdayId ?? '').trim() ||
        [
          normalizeLookupKey(item?.workerLogin ?? item?.workerName),
          startIso,
          endIso,
          index,
        ].join('|')
      if (!uniqueRows.has(rowId)) {
        uniqueRows.set(rowId, item)
      }
    })

  ;[...uniqueRows.values()].forEach((item) => {
    const bucket = resolveBucket(item)
    if (!bucket) {
      return
    }

    bucket.entriesCount += 1
    const startIso = toIso(item?.dayStartAt || item?.startAt)
    const endIso = toIso(item?.dayEndAt || item?.endAt || item?.dayEndScanAt)
    const startTs = toTimestamp(startIso)
    const endTs = toTimestamp(endIso)
    const hasStop = endTs > 0
    const status = normalizeStatus(item?.status, hasStop)
    const startObjectLabel = String(item?.dayStartObject ?? '').trim()
    const zoneCode = resolveZoneCode(item)
    const scanObjectLabelRaw = String(item?.scanObjectLabel ?? item?.objectLabelAtScan ?? '').trim()
    const clientLabelRaw = String(item?.clientName ?? item?.klient ?? item?.clientId ?? '').trim()
    const zoneLabelRaw = String(item?.zoneName ?? item?.strefa ?? '').trim()
    const locationLabelRaw = String(item?.lokalizacja ?? item?.location ?? '').trim()
    const clientLabel = hasReadableClientLabel(clientLabelRaw)
      ? clientLabelRaw
      : hasReadableClientLabel(scanObjectLabelRaw)
        ? scanObjectLabelRaw
        : hasReadableLabel(startObjectLabel)
          ? startObjectLabel
          : '-'
    const zoneLabel = hasReadableLabel(zoneLabelRaw) ? zoneLabelRaw : '-'
    const locationLabel = hasReadableLabel(locationLabelRaw) ? locationLabelRaw : '-'
    const eventTs = toTimestamp(item?.updatedAt || endIso || startIso)
    if (eventTs > bucket.latestEventTs) {
      bucket.latestEventTs = eventTs
    }

    if (startTs > 0 && (bucket.firstStartTs <= 0 || startTs < bucket.firstStartTs)) {
      bucket.firstStartTs = startTs
      bucket.firstStartIso = startIso
      bucket.firstStartClient = clientLabel
      bucket.firstStartZone = zoneLabel
      bucket.firstStartZoneId = zoneCode
      bucket.firstStartLocation = locationLabel
    } else if (startTs > 0 && startTs === bucket.firstStartTs) {
      if (!hasReadableClientLabel(bucket.firstStartClient) && hasReadableClientLabel(clientLabel)) {
        bucket.firstStartClient = clientLabel
      }
      if (!hasReadableLabel(bucket.firstStartZone) && hasReadableLabel(zoneLabel)) {
        bucket.firstStartZone = zoneLabel
      }
      if (!String(bucket.firstStartZoneId ?? '').trim() && zoneCode) {
        bucket.firstStartZoneId = zoneCode
      }
      if (!hasReadableLabel(bucket.firstStartLocation) && hasReadableLabel(locationLabel)) {
        bucket.firstStartLocation = locationLabel
      }
    }

    if (endTs > bucket.latestStopTs) {
      bucket.latestStopTs = endTs
      bucket.latestStopIso = endIso
    }

    if (status === 'RUNNING' && startTs > 0 && !hasStop) {
      bucket.runningCandidates.push({
        startTs,
        startIso,
        workSec: Math.max(0, Math.floor(Number(item?.durationSec ?? 0) || 0)),
        clientLabel,
        zoneLabel,
        zoneId: zoneCode,
        locationLabel,
      })
      return
    }

    if (status === 'CLOSED') {
      const intervalKey = `${startTs}|${endTs}|${String(item?.workdayId ?? '').trim()}`
      if (!bucket.closedIntervals.has(intervalKey)) {
        const directDuration = Number(item?.durationSec)
        const intervalSec =
          Number.isFinite(directDuration) && directDuration > 0
            ? Math.floor(directDuration)
            : startTs > 0 && endTs > startTs
              ? Math.floor((endTs - startTs) / 1000)
              : 0
        if (intervalSec > 0) {
          bucket.closedIntervals.add(intervalKey)
          bucket.closedSec += intervalSec
        }
      }
    }
  })

  const items = [...workers.values()]
    .map((bucket) => {
      const activeCandidates = bucket.runningCandidates
        .slice()
        .sort((left, right) => right.startTs - left.startTs)
      const activeCandidate = activeCandidates[0] ?? null
      const isRunning = Boolean(activeCandidate)
      const startIso = bucket.firstStartIso || activeCandidate?.startIso || ''
      const stopIso = isRunning ? '' : bucket.latestStopIso || ''
      const activeSec =
        isRunning && Number(activeCandidate?.workSec) > 0
          ? Math.floor(Number(activeCandidate.workSec))
          : isRunning && activeCandidate?.startTs > 0 && nowTs > activeCandidate.startTs
            ? Math.floor((nowTs - activeCandidate.startTs) / 1000)
          : 0
      const totalSec = Math.max(0, bucket.closedSec + activeSec)
      let duration = durationToHms(totalSec)
      if (duration === '-' && (isRunning || bucket.firstStartTs > 0)) {
        duration = '00:00:00'
      }

      const resolvedClient = isRunning
        ? activeCandidate?.clientLabel ?? bucket.firstStartClient ?? '-'
        : bucket.firstStartClient ?? '-'
      const resolvedZone = isRunning
        ? activeCandidate?.zoneLabel ?? bucket.firstStartZone ?? '-'
        : bucket.firstStartZone ?? '-'
      const resolvedZoneId = String(
        isRunning ? activeCandidate?.zoneId ?? bucket.firstStartZoneId ?? '' : bucket.firstStartZoneId ?? '',
      ).trim()
      const resolvedLocation = isRunning
        ? activeCandidate?.locationLabel ?? bucket.firstStartLocation ?? '-'
        : bucket.firstStartLocation ?? '-'
      const resolvedScanObjectLabel = hasReadableClientLabel(resolvedClient)
        ? resolvedClient
        : hasReadableLabel(resolvedLocation)
          ? resolvedLocation
          : hasReadableLabel(resolvedZone)
            ? resolvedZone
            : resolvedZoneId || '-'

      return {
        id: bucket.workerId || bucket.id,
        workerId: bucket.workerId || '',
        workerLogin: bucket.workerLogin || bucket.workerId || bucket.id,
        workerName: bucket.workerName,
        entriesCount: bucket.entriesCount,
        activeClient: hasReadableClientLabel(resolvedClient) ? resolvedClient : '-',
        activeZone: hasReadableLabel(resolvedZone) ? resolvedZone : '-',
        activeZoneId: resolvedZoneId,
        zoneId: resolvedZoneId,
        roomId: resolvedZoneId,
        utilityRoomId: resolvedZoneId,
        activeLocation: hasReadableLabel(resolvedLocation) ? resolvedLocation : '-',
        scanObjectLabel: hasReadableLabel(resolvedScanObjectLabel) ? resolvedScanObjectLabel : '-',
        qrStart: formatTime(startIso),
        qrStop: stopIso ? formatTime(stopIso) : '-',
        duration,
        durationSec: totalSec,
        isRunning,
        status: isRunning ? 'RUNNING' : 'CLOSED',
        sourceOfTruth: 'workday',
        startAt: startIso,
        dayStartAt: startIso,
        endAt: stopIso,
        dayEndAt: stopIso,
        activeSortTs: isRunning ? activeCandidate?.startTs ?? 0 : 0,
        latestEventTs: bucket.latestEventTs,
      }
    })
    .sort((left, right) => {
      if (Number(right.isRunning) !== Number(left.isRunning)) {
        return Number(right.isRunning) - Number(left.isRunning)
      }

      if (right.activeSortTs !== left.activeSortTs) {
        return right.activeSortTs - left.activeSortTs
      }

      if (right.latestEventTs !== left.latestEventTs) {
        return right.latestEventTs - left.latestEventTs
      }

      return left.workerName.localeCompare(right.workerName, 'pl', { sensitivity: 'base' })
    })
    .map((item) => {
      const visibleItem = { ...item }
      delete visibleItem.latestEventTs
      return visibleItem
    })

  return {
    orgId,
    day,
    items,
  }
}

export async function getTodayActiveWorkers(orgId, options = {}) {
  if (options?.source !== 'legacy-events') {
    return getTodayActiveWorkersFromWorkdays(orgId, options)
  }

  const day = currentDayYmd()
  const [workdayResponse, eventsResponse, workerDirectory] = await Promise.all([
    getWorkdays(orgId, {
      source: 'workdays',
      fromIso: day,
      toIso: day,
      page: 1,
      pageSize: WORKDAY_DAILY_READ_MAX_ROWS,
      forceRefresh: options.forceRefresh === true,
    }),
    getWorkdays(orgId, {
      source: 'events',
      fromIso: day,
      toIso: day,
      page: 1,
      pageSize: WORKDAY_DAILY_READ_MAX_ROWS,
      forceRefresh: options.forceRefresh === true,
    }).catch(() => ({
      items: [],
    })),
    getWorkers(orgId).catch(() => []),
  ])
  const nowTs = Date.now()
  const workers = new Map()
  const workerAliases = new Map()
  const resolveDisplayName = createWorkerDisplayNameResolver(workerDirectory)
  const workerByCanonicalId = new Map()
  const workerByCanonicalDigits = new Map()
  const workerByNormalizedName = new Map()
  workerDirectory.forEach((worker) => {
    const workerId = canonicalWorkerId(worker?.workerId ?? worker?.id)
    if (workerId && !workerByCanonicalId.has(workerId)) {
      workerByCanonicalId.set(workerId, worker)
    }

    const workerDigits = canonicalWorkerDigits(workerId)
    if (workerDigits && !workerByCanonicalDigits.has(workerDigits)) {
      workerByCanonicalDigits.set(workerDigits, worker)
    }

    const workerNameKey = normalizePersonName(pickWorkerNameValue(worker))
    if (!workerNameKey) {
      return
    }

    if (!workerByNormalizedName.has(workerNameKey)) {
      workerByNormalizedName.set(workerNameKey, worker)
      return
    }

    // Ambiguous names are cleared so we do not map wrong person.
    workerByNormalizedName.set(workerNameKey, null)
  })

  const resolveWorkerDirectoryEntry = (item) => {
    const directWorkerId = canonicalWorkerId(item?.workerId ?? item?.worker?.workerId ?? item?.id)
    return directWorkerId ? workerByCanonicalId.get(directWorkerId) || null : null
  }
  const hasReadableLabel = (value) => {
    const text = String(value ?? '').trim()
    return Boolean(text) && text !== '-'
  }
  const hasReadableClientLabel = (value) => {
    const text = String(value ?? '').trim()
    if (!text || text === '-') {
      return false
    }
    const normalized = normalizeLookupKey(text)
    return normalized !== 'unassigned' && normalized !== 'brakklienta' && normalized !== 'nieprzypisany'
  }
  const isQrZoneCodeLike = (value) => {
    const text = String(value ?? '').trim().toUpperCase()
    if (!text || text === '-') {
      return false
    }
    return /^[A-Z]{1,8}\d{2,}[A-Z0-9-]*$/.test(text)
  }
  const resolveZoneCode = (item) => {
    const candidates = [
      item?.zoneId,
      item?.utilityRoomId,
      item?.roomId,
      item?.workdayUtilityRoomId,
      item?.dayStartObject,
      item?.dayStopObject,
    ]
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)

    const qrCode = candidates.find((value) => isQrZoneCodeLike(value))
    if (qrCode) {
      return qrCode
    }

    return candidates[0] || ''
  }

  const shouldReplaceDisplayName = (currentName, candidateName, workerLogin) => {
    const current = String(currentName ?? '').trim()
    const candidate = String(candidateName ?? '').trim()
    if (!candidate) {
      return false
    }
    if (!current) {
      return true
    }

    const currentParts = current.split(/\s+/).filter(Boolean).length
    const candidateParts = candidate.split(/\s+/).filter(Boolean).length
    if (candidateParts > currentParts) {
      return true
    }

    const loginNormalized = normalizeLookupKey(workerLogin)
    const currentNormalized = normalizeLookupKey(current)
    const candidateNormalized = normalizeLookupKey(candidate)
    if (loginNormalized && currentNormalized === loginNormalized && candidateNormalized !== loginNormalized) {
      return true
    }

    return false
  }

  const resolveBucket = (item) => {
    const resolvedWorkerId = canonicalWorkerId(item?.workerId ?? item?.worker?.workerId ?? item?.id)
    if (!resolvedWorkerId) {
      return null
    }
    const linkedWorker = resolveWorkerDirectoryEntry(item)
    const resolvedWorkerLogin = String(
      linkedWorker?.login ?? linkedWorker?.workerLogin ?? item?.workerLogin ?? item?.login ?? '',
    ).trim()
    const resolvedWorkerName = String(
      pickWorkerNameValue(linkedWorker) || item?.workerName || item?.name || '',
    ).trim()
    const workerLogin = resolvedWorkerLogin
    const workerName = resolvedWorkerName
    const primaryLabel = resolveDisplayName(workerLogin, workerName)
    const aliases = [`id:${normalizeLookupKey(resolvedWorkerId)}`]
      .map((value) => normalizeLookupKey(value))
      .filter(Boolean)

    let key = aliases.map((alias) => workerAliases.get(alias)).find(Boolean)
    if (!key) {
      key = aliases[0] || (resolvedWorkerId ? `id:${normalizeLookupKey(resolvedWorkerId)}` : '')
    }
    if (!key) {
      return null
    }

    if (!workers.has(key)) {
      workers.set(key, {
        id: resolvedWorkerId || workerLogin || workerName || key,
        workerId: resolvedWorkerId || '',
        workerLogin: workerLogin || '',
        workerName: primaryLabel,
        entriesCount: 0,
        activeClient: '-',
        activeZone: '-',
        activeLocation: '-',
        activeSortTs: 0,
        latestEventTs: 0,
        firstStartIso: '',
        firstStartTs: 0,
        firstStartClient: '-',
        firstStartZone: '-',
        firstStartZoneId: '',
        firstStartLocation: '-',
        latestStopIso: '',
        latestStopTs: 0,
        latestRelevantStopIso: '',
        latestRelevantStopTs: 0,
        latestDayStopIso: '',
        latestDayStopTs: 0,
        closedSec: 0,
        closedIntervals: new Set(),
        runningCandidates: [],
        runningCandidateKeys: new Set(),
      })
    }

    const bucket = workers.get(key)
    if (resolvedWorkerId && !String(bucket.workerId ?? '').trim()) {
      bucket.workerId = resolvedWorkerId
    }
    if (workerLogin && !String(bucket.workerLogin ?? '').trim()) {
      bucket.workerLogin = workerLogin
    }
    if (resolvedWorkerId && !String(bucket.id ?? '').trim()) {
      bucket.id = resolvedWorkerId
    } else if (workerLogin && !String(bucket.id ?? '').trim()) {
      bucket.id = workerLogin
    }
    if (shouldReplaceDisplayName(bucket.workerName, primaryLabel, workerLogin)) {
      bucket.workerName = primaryLabel
    }

    aliases.forEach((alias) => {
      workerAliases.set(alias, key)
    })

    return bucket
  }

  const uniqueRows = new Map()
  ;[...(eventsResponse.items ?? []), ...(workdayResponse.items ?? [])].forEach((item, index) => {
    const rowId = String(item?.eventId ?? item?.workdayId ?? item?.id ?? `row-${index}`).trim() || `row-${index}`
    if (!uniqueRows.has(rowId)) {
      uniqueRows.set(rowId, item)
    }
  })

  const mergedRows = [...uniqueRows.values()]
  const rowsById = new Map()
  mergedRows.forEach((row) => {
    const rowId = String(row?.eventId ?? row?.workdayId ?? row?.id ?? '').trim()
    if (rowId) {
      rowsById.set(rowId, row)
    }
  })
  const enrichedRows = mergedRows.map((row) => {
    const workerLogin = String(row?.workerLogin ?? '').trim()
    const workerName = String(row?.workerName ?? '').trim()
    if (workerLogin || workerName) {
      return row
    }

    const linkedEventId = String(row?.startEventId ?? row?.endEventId ?? '').trim()
    if (!linkedEventId) {
      return row
    }

    const linked = rowsById.get(linkedEventId)
    if (!linked) {
      return row
    }

    const linkedLogin = String(linked?.workerLogin ?? '').trim()
    const linkedName = String(linked?.workerName ?? '').trim()
    if (!linkedLogin && !linkedName) {
      return row
    }

    return {
      ...row,
      workerLogin: workerLogin || linkedLogin,
      workerName: workerName || linkedName,
    }
  })

  const dedupeRowKey = (item) => {
    const workerKey = normalizeLookupKey(item?.workerLogin ?? item?.workerName)
    const startIso = toIso(item?.startAt || item?.dayStartAt)
    const endIso = toIso(item?.endAt || item?.dayEndAt)
    const hasStop = toTimestamp(endIso) > 0
    const status = normalizeStatus(item?.status, hasStop)
    const durationSec = calculateDuration(item)
    const endReason = String(item?.endReason ?? '').trim().toUpperCase()
    const zoneKey = normalizeLookupKey(item?.zoneId ?? item?.utilityRoomId ?? item?.roomId ?? item?.strefa ?? item?.zoneName)
    const clientKey = normalizeLookupKey(item?.clientId ?? item?.clientName ?? item?.klient)
    const dayStartObject = normalizeLookupKey(item?.dayStartObject)
    const dayStopObject = normalizeLookupKey(item?.dayStopObject)

    return [
      workerKey,
      startIso,
      endIso,
      status,
      durationSec,
      endReason,
      zoneKey,
      clientKey,
      dayStartObject,
      dayStopObject,
    ].join('|')
  }

  const dedupeRowScore = (item) => {
    let score = 0
    if (String(item?.workerLogin ?? '').trim()) score += 8
    if (String(item?.workerName ?? '').trim()) score += 4
    if (String(item?.clientName ?? item?.klient ?? item?.clientId ?? '').trim()) score += 4
    if (String(item?.zoneName ?? item?.strefa ?? item?.zoneId ?? item?.utilityRoomId ?? item?.roomId ?? '').trim()) score += 4
    if (String(item?.lokalizacja ?? item?.location ?? '').trim()) score += 2
    if (String(item?.dayStartObject ?? item?.dayStopObject ?? '').trim()) score += 2
    if (String(item?.eventId ?? item?.id ?? '').trim()) score += 1
    if (String(item?.workdayId ?? '').trim()) score += 1
    const ts = toTimestamp(item?.updatedAt || item?.createdAt || item?.endAt || item?.startAt)
    return { score, ts }
  }

  const dedupedRowsMap = new Map()
  enrichedRows
    .filter((item) => isItemFromLocalDay(item, day))
    .forEach((item, index) => {
      const key = dedupeRowKey(item) || `row-${index}`
      const existing = dedupedRowsMap.get(key)
      if (!existing) {
        dedupedRowsMap.set(key, item)
        return
      }

      const existingScore = dedupeRowScore(existing)
      const incomingScore = dedupeRowScore(item)
      if (
        incomingScore.score > existingScore.score ||
        (incomingScore.score === existingScore.score && incomingScore.ts > existingScore.ts)
      ) {
        dedupedRowsMap.set(key, item)
      }
    })

  ;[...dedupedRowsMap.values()].forEach((item) => {
      const bucket = resolveBucket(item)
      if (!bucket) {
        return
      }

      bucket.entriesCount += 1
      const startIso = toIso(item.startAt || item.dayStartAt)
      const endIso = toIso(item.endAt || item.dayEndAt)
      const startTs = toTimestamp(startIso)
      const endTs = toTimestamp(endIso)
      const hasStop = endTs > 0
      const status = normalizeStatus(item.status, hasStop)
      const rawStatus = String(item.status ?? '').trim().toUpperCase()
      const endReason = String(item.endReason ?? '').trim().toUpperCase()
      const specialHaystack = [item?.strefa, item?.zoneName, item?.roomId, item?.clientStatus]
        .map((value) => String(value ?? '').toLowerCase())
        .join(' ')
      const isSpecial = specialHaystack.includes('specjal') || specialHaystack.includes('special')
      const isIndividual = Boolean(String(item?.clientIndId ?? '').trim()) || endReason === 'INDIVIDUAL_DONE'
      const isClean = endReason === 'QR_NEW' || endReason === 'QR_SAME' || endReason === 'QR_START_STOP'
      const isDayStopMarker =
        endTs > 0 && (endReason === 'WORKDAY_STOP' || endReason === 'STOP_END_DAY' || rawStatus === 'WORKDAY_CLOSED')
      const isExplicitEvent = item?.hasExplicitEventId === true || String(item?.historySourceKind ?? '').trim().toLowerCase() === 'event'
      const hasClientOrZoneContext = [
        item?.zoneId,
        item?.utilityRoomId,
        item?.roomId,
        item?.clientId,
        item?.clientName,
        item?.klient,
        item?.zoneName,
        item?.strefa,
      ].some((value) => {
        const text = String(value ?? '').trim()
        return Boolean(text) && text !== '-'
      })
      const isDayStartMarker =
        status === 'RUNNING' &&
        startTs > 0 &&
        !hasStop &&
        (!isExplicitEvent || !hasClientOrZoneContext) &&
        !isIndividual &&
        !isSpecial &&
        !isClean
      const isDurationRelevant = isIndividual || isSpecial || isDayStartMarker || isDayStopMarker || (hasStop && !isClean)
      const startObjectLabel = String(item.dayStartObject ?? '').trim()
      const zoneCode = resolveZoneCode(item)
      const scanObjectLabelRaw = String(item?.scanObjectLabel ?? item?.objectLabelAtScan ?? '').trim()
      const clientLabelRaw = String(item.clientName ?? item.klient ?? item.clientId ?? '').trim()
      const zoneLabelRaw = String(item.zoneName ?? item.strefa ?? '').trim()
      const locationLabelRaw = String(item.lokalizacja ?? item.location ?? '').trim()
      const clientLabel = hasReadableClientLabel(clientLabelRaw)
        ? clientLabelRaw
        : hasReadableClientLabel(scanObjectLabelRaw)
          ? scanObjectLabelRaw
          : hasReadableLabel(startObjectLabel)
            ? startObjectLabel
            : '-'
      const zoneLabel = hasReadableLabel(zoneLabelRaw) ? zoneLabelRaw : '-'
      const locationLabel = hasReadableLabel(locationLabelRaw) ? locationLabelRaw : '-'
      const eventTs = toTimestamp(item.updatedAt || item.createdAt || endIso || startIso)
      if (eventTs > bucket.latestEventTs) {
        bucket.latestEventTs = eventTs
      }

      if (isDurationRelevant && startTs > 0 && (bucket.firstStartTs <= 0 || startTs < bucket.firstStartTs)) {
        bucket.firstStartTs = startTs
        bucket.firstStartIso = startIso
        bucket.firstStartClient = clientLabel
        bucket.firstStartZone = zoneLabel
        bucket.firstStartZoneId = zoneCode
        bucket.firstStartLocation = locationLabel
      } else if (isDurationRelevant && startTs > 0 && startTs === bucket.firstStartTs) {
        if (!hasReadableClientLabel(bucket.firstStartClient) && hasReadableClientLabel(clientLabel)) {
          bucket.firstStartClient = clientLabel
        }
        if (!hasReadableLabel(bucket.firstStartZone) && hasReadableLabel(zoneLabel)) {
          bucket.firstStartZone = zoneLabel
        }
        if (!String(bucket.firstStartZoneId ?? '').trim() && zoneCode) {
          bucket.firstStartZoneId = zoneCode
        }
        if (!hasReadableLabel(bucket.firstStartLocation) && hasReadableLabel(locationLabel)) {
          bucket.firstStartLocation = locationLabel
        }
      }
      if (endTs > bucket.latestStopTs) {
        bucket.latestStopTs = endTs
        bucket.latestStopIso = endIso
      }

      if (isDurationRelevant && endTs > bucket.latestRelevantStopTs) {
        bucket.latestRelevantStopTs = endTs
        bucket.latestRelevantStopIso = endIso
      }

      if (isDayStopMarker && endTs > bucket.latestDayStopTs) {
        bucket.latestDayStopTs = endTs
        bucket.latestDayStopIso = endIso
      }

      if (isDayStartMarker) {
        const runningKey = `${startTs}|${startIso}`
        if (!bucket.runningCandidateKeys.has(runningKey)) {
          bucket.runningCandidateKeys.add(runningKey)
          bucket.runningCandidates.push({
            startTs,
            startIso,
            clientLabel,
            zoneLabel,
            zoneId: zoneCode,
            locationLabel,
          })
        }
        return
      }

      if (status === 'CLOSED' && startTs > 0 && endTs > startTs) {
        const intervalKey = `${startTs}|${endTs}`
        if (!bucket.closedIntervals.has(intervalKey)) {
          bucket.closedIntervals.add(intervalKey)
          bucket.closedSec += Math.floor((endTs - startTs) / 1000)
        }
      }
    })

  const items = [...workers.values()]
    .map((bucket) => {
      const activeCandidates = bucket.runningCandidates
        .filter((candidate) => candidate.startTs > bucket.latestDayStopTs)
        .sort((left, right) => right.startTs - left.startTs)
      const activeCandidate = activeCandidates[0] ?? null
      const isRunning = Boolean(activeCandidate)
      // Dashboard rule: always show the first QR START from the current day.
      const startIso = bucket.firstStartIso || (isRunning ? activeCandidate?.startIso : '')
      const stopIso = !isRunning ? bucket.latestDayStopIso || bucket.latestRelevantStopIso || '' : ''
      const startTs = toTimestamp(startIso)
      const stopReferenceTs = isRunning ? nowTs : toTimestamp(stopIso)
      const totalSec =
        startTs > 0 && stopReferenceTs > startTs
          ? Math.max(0, Math.floor((stopReferenceTs - startTs) / 1000))
          : 0
      let duration = durationToHms(totalSec)
      if (duration === '-' && (isRunning || bucket.firstStartTs > 0)) {
        duration = '00:00:00'
      }

      const resolvedClient = isRunning
        ? activeCandidate?.clientLabel ?? bucket.firstStartClient ?? '-'
        : bucket.firstStartClient ?? '-'
      const resolvedZone = isRunning
        ? activeCandidate?.zoneLabel ?? bucket.firstStartZone ?? '-'
        : bucket.firstStartZone ?? '-'
      const resolvedZoneId = String(
        isRunning ? activeCandidate?.zoneId ?? bucket.firstStartZoneId ?? '' : bucket.firstStartZoneId ?? '',
      ).trim()
      const resolvedLocation = isRunning
        ? activeCandidate?.locationLabel ?? bucket.firstStartLocation ?? '-'
        : bucket.firstStartLocation ?? '-'
      const resolvedScanObjectLabel = hasReadableClientLabel(resolvedClient)
        ? resolvedClient
        : hasReadableLabel(resolvedLocation)
          ? resolvedLocation
          : hasReadableLabel(resolvedZone)
            ? resolvedZone
            : resolvedZoneId || '-'

      return {
        id: bucket.workerId || bucket.id,
        workerId: bucket.workerId || '',
        workerLogin: bucket.workerLogin || bucket.workerId || bucket.id,
        workerName: bucket.workerName,
        entriesCount: bucket.entriesCount,
        activeClient: hasReadableClientLabel(resolvedClient) ? resolvedClient : '-',
        activeZone: hasReadableLabel(resolvedZone) ? resolvedZone : '-',
        activeZoneId: resolvedZoneId,
        zoneId: resolvedZoneId,
        roomId: resolvedZoneId,
        utilityRoomId: resolvedZoneId,
        activeLocation: hasReadableLabel(resolvedLocation) ? resolvedLocation : '-',
        scanObjectLabel: hasReadableLabel(resolvedScanObjectLabel) ? resolvedScanObjectLabel : '-',
        qrStart: formatTime(startIso),
        qrStop: stopIso ? formatTime(stopIso) : '-',
        duration,
        isRunning,
        activeSortTs: isRunning ? activeCandidate?.startTs ?? 0 : 0,
        latestEventTs: bucket.latestEventTs,
      }
    })
    .sort((left, right) => {
      if (right.latestEventTs !== left.latestEventTs) {
        return right.latestEventTs - left.latestEventTs
      }

      if (right.activeSortTs !== left.activeSortTs) {
        return right.activeSortTs - left.activeSortTs
      }

      if (right.entriesCount !== left.entriesCount) {
        return right.entriesCount - left.entriesCount
      }

      return left.workerName.localeCompare(right.workerName, 'pl', { sensitivity: 'base' })
    })
    .map((item) => {
      const visibleItem = { ...item }
      delete visibleItem.latestEventTs
      return visibleItem
    })

  return {
    orgId,
    day,
    items,
  }
}

export async function getDashboardSummary(orgId) {
  const [response, workerDirectory] = await Promise.all([
    getWorkdays(orgId, {
      source: 'workdays',
      fromIso: PAGED_HISTORY_FROM_START_AT,
      toIso: PAGED_HISTORY_TO_START_AT,
      page: 1,
      pageSize: WORKDAY_SUMMARY_READ_MAX_ROWS,
    }),
    getWorkers(orgId).catch(() => []),
  ])
  if (response?.hasNext === true) {
    throw pagedReadLimitError('podsumowania dni pracy')
  }
  const resolveDisplayName = createWorkerDisplayNameResolver(workerDirectory)
  const items = response.items

  const openWorkers = new Set(
    items
      .filter((item) => !item.endAt && !item.dayEndAt && normalizeStatus(item.status, Boolean(item.endAt || item.dayEndAt)) !== 'CLOSED')
      .map((item) => resolveDisplayName(item.workerLogin, item.workerName))
      .filter(Boolean),
  )

  const over9Workers = new Set(
    items
      .filter((item) => Boolean(item.endAt || item.dayEndAt) && Number(item.durationSec) > NINE_HOURS_SECONDS)
      .map((item) => resolveDisplayName(item.workerLogin, item.workerName))
      .filter(Boolean),
  )

  return {
    orgId,
    openNoStop: {
      count: openWorkers.size,
      workers: [...openWorkers].sort((left, right) => left.localeCompare(right, 'pl', { sensitivity: 'base' })),
    },
    over9h: {
      count: over9Workers.size,
      workers: [...over9Workers].sort((left, right) => left.localeCompare(right, 'pl', { sensitivity: 'base' })),
    },
  }
}

const WORKER_INTEGRITY_FROM_START_AT = '2000-01-01T00:00:00.000Z'
const WORKER_INTEGRITY_TO_START_AT = '2100-01-01T00:00:00.000Z'

async function readOrganizationIntegrityRows(collectionName, orgId, workerLogin) {
  const normalizedOrgId = String(orgId ?? '').trim()
  const normalizedWorkerLogin = String(workerLogin ?? '').trim().toLowerCase()
  if (!normalizedOrgId || !normalizedWorkerLogin) {
    return []
  }

  const operationName =
    collectionName === 'events'
      ? 'EventsIntegrityPageForOrg'
      : 'WorkdaysIntegrityPageForOrg'
  const rows = []
  const pageSize = EVENTS_FAST_PAGE_MAX_SIZE
  const maxPages = 80
  for (let page = 1; page <= maxPages; page += 1) {
    const nextRows = await runEventsPageQuery(
      operationName,
      {
        orgId: normalizedOrgId,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      },
      collectionName,
      { forceRefresh: true },
    )
    rows.push(
      ...nextRows.filter(
        (row) => String(row?.workerLogin ?? '').trim().toLowerCase() === normalizedWorkerLogin,
      ),
    )
    if (nextRows.length < pageSize) {
      return rows
    }
  }

  const error = new Error(
    'Nie można bezpiecznie zweryfikować otwartych rekordów: historia organizacji przekracza limit 20000 wpisów.',
  )
  error.code = 'INTEGRITY_CHECK_INCOMPLETE'
  throw error
}

function isMissingDataConnectVariable(error, variableName) {
  const expected = `$${String(variableName ?? '').trim()} is missing`.toLowerCase()
  if (!expected || expected === '$ is missing') {
    return false
  }

  let current = error
  for (let depth = 0; current && depth < 5; depth += 1) {
    const message = messageFromError(current).toLowerCase()
    if (message.includes(expected)) {
      return true
    }
    current = current?.cause
  }
  return false
}

async function readWorkerIntegrityOperationRows(
  operationName,
  collectionName,
  orgId,
  workerLogin,
) {
  const normalizedOrgId = String(orgId ?? '').trim()
  const normalizedWorkerLogin = String(workerLogin ?? '').trim()
  if (!normalizedOrgId || !normalizedWorkerLogin) {
    return []
  }

  const rows = []
  const pageSize = EVENTS_FAST_PAGE_MAX_SIZE
  const maxPages = 80
  for (let page = 1; page <= maxPages; page += 1) {
    let nextRows
    try {
      nextRows = await runEventsPageQuery(
        operationName,
        {
          orgId: normalizedOrgId,
          workerLogin: normalizedWorkerLogin,
          fromStartAt: WORKER_INTEGRITY_FROM_START_AT,
          toStartAt: WORKER_INTEGRITY_TO_START_AT,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        },
        collectionName,
        { forceRefresh: true },
      )
    } catch (cause) {
      try {
        return await readOrganizationIntegrityRows(
          collectionName,
          normalizedOrgId,
          normalizedWorkerLogin,
        )
      } catch (fallbackCause) {
        const error = new Error(
          `Nie można potwierdzić otwartych rekordów pracownika. Wymagana operacja ${operationName} jest niedostępna.`,
        )
        error.code = 'INTEGRITY_CHECK_INCOMPLETE'
        error.cause = fallbackCause
        error.primaryCause = cause
        throw error
      }
    }

    rows.push(...nextRows)
    if (nextRows.length < pageSize) {
      return rows
    }
  }

  const error = new Error(
    'Nie można bezpiecznie zweryfikować otwartych rekordów: historia pracownika przekracza limit 20000 wpisów.',
  )
  error.code = 'INTEGRITY_CHECK_INCOMPLETE'
  throw error
}

async function readWorkerIntegritySnapshot(orgId, workerLogin) {
  const normalizedOrgId = String(orgId ?? '').trim()
  const normalizedWorkerLogin = String(workerLogin ?? '').trim()
  if (!normalizedOrgId || !normalizedWorkerLogin) {
    return { events: [], workdays: [] }
  }

  const [eventRows, workdayRows, clients, zones, workers] = await Promise.all([
    readWorkerIntegrityOperationRows(
      'EventsPageForOrgByWorker',
      'events',
      normalizedOrgId,
      normalizedWorkerLogin,
    ),
    readWorkerIntegrityOperationRows(
      'WorkdaysPageForOrgByWorker',
      'workdays',
      normalizedOrgId,
      normalizedWorkerLogin,
    ),
    getClients(normalizedOrgId),
    getZones(normalizedOrgId),
    getWorkers(normalizedOrgId),
  ])
  const lookupMaps = buildLookupMaps(clients, zones, workers, workdayRows)

  return {
    events: eventRows
      .map((row) => mapWorkday(normalizedOrgId, row, lookupMaps))
      .filter((item) => isDisplayableMappedItem(item)),
    workdays: workdayRows
      .map((row) => mapWorkday(normalizedOrgId, row, lookupMaps))
      .filter((item) => isDisplayableMappedItem(item)),
  }
}

async function readOpenCleanEventsForWorker(orgId, workerLogin) {
  const snapshot = await readWorkerIntegritySnapshot(orgId, workerLogin)
  return snapshot.events
}

async function readAllWorkdaysForWorkerIntegrity(orgId, workerLogin) {
  return readWorkerIntegrityOperationRows(
    'WorkdaysPageForOrgByWorker',
    'workdays',
    orgId,
    workerLogin,
  )
}

async function assertNoOtherOpenWorkday(orgId, payload = {}, options = {}) {
  const workerLogin = String(payload.workerLogin ?? '').trim()
  const status = String(payload.status ?? '').trim().toUpperCase()
  const hasEnd = Boolean(String(payload.endAt ?? '').trim())
  if (!workerLogin || hasEnd || (status !== 'RUNNING' && status !== 'OPEN')) {
    return
  }

  const rows = Array.isArray(options.rows)
    ? options.rows
    : await readAllWorkdaysForWorkerIntegrity(orgId, workerLogin)
  const conflict = findOpenWorkdayForWorker(rows, { workerLogin }, {
    excludeRecordIds: options.excludeRecordIds,
  })
  if (!conflict) {
    return
  }

  const conflictId = openWorkdayRecordKey(conflict)
  const startedAt = String(conflict.startAt ?? conflict.start_at ?? '').trim()
  const error = new Error(
    `Nie można utworzyć drugiego otwartego dnia pracy. Pracownik ma już aktywny dzień${startedAt ? ` od ${startedAt}` : ''}. Najpierw uzupełnij STOP.`,
  )
  error.code = 'OPEN_WORKDAY_EXISTS'
  error.conflictingWorkdayId = conflictId
  throw error
}

async function assertNoOtherOpenCleanEvent(orgId, payload = {}, options = {}) {
  const workerLogin = String(payload.workerLogin ?? '').trim()
  const status = String(payload.status ?? '').trim().toUpperCase()
  const hasEnd = Boolean(String(payload.endAt ?? '').trim())
  if (!workerLogin || hasEnd || (status !== 'RUNNING' && status !== 'OPEN')) {
    return
  }

  const openRows = Array.isArray(options.rows)
    ? options.rows
    : await readOpenCleanEventsForWorker(orgId, workerLogin)
  const conflict = findBlockingOpenEventForWorker(openRows, { workerLogin }, {
    excludeRecordIds: options.excludeRecordIds,
    blockUnresolvedLegacy: options.blockUnresolvedLegacy,
  })
  if (!conflict) {
    return
  }

  const conflictId = openEventRecordKey(conflict)
  const startedAt = String(conflict.startAt ?? '').trim()
  const place = String(
    conflict.clientName ??
      conflict.klient ??
      conflict.zoneName ??
      conflict.strefa ??
      conflict.zoneId ??
      '',
  ).trim()
  const detail = [place, startedAt].filter(Boolean).join(', ')
  const isUnresolvedLegacy = !String(conflict.eventType ?? conflict.event_type ?? '').trim()
  const error = new Error(
    isUnresolvedLegacy
      ? `Nie można utworzyć nowego CLEAN. Pracownik ma nierozstrzygnięty otwarty wpis historyczny${detail ? ` (${detail})` : ''}. Najpierw zweryfikuj jego powiązanie z dniem pracy.`
      : `Nie można utworzyć drugiego otwartego statusu. Pracownik ma już aktywny CLEAN${detail ? ` (${detail})` : ''}. Najpierw uzupełnij STOP.`,
  )
  error.code = isUnresolvedLegacy ? 'UNRESOLVED_LEGACY_OPEN_EVENT' : 'OPEN_CLEAN_EVENT_EXISTS'
  error.conflictingEventId = conflictId
  throw error
}

function requiresOpenIntegrityCheck(payload = {}) {
  const workerLogin = String(payload.workerLogin ?? '').trim()
  const status = String(payload.status ?? '').trim().toUpperCase()
  const hasEnd = Boolean(String(payload.endAt ?? '').trim())
  return Boolean(workerLogin && !hasEnd && (status === 'RUNNING' || status === 'OPEN'))
}

async function assertManualEventZoneBelongsToClient(orgId, clientId, zoneId) {
  const normalizedClientId = String(clientId ?? '').trim()
  const normalizedZoneId = String(zoneId ?? '').trim()
  const zones = await getZones(orgId)
  const matches = (Array.isArray(zones) ? zones : []).filter(
    (zone) => String(zone?.id ?? zone?.zoneId ?? '').trim() === normalizedZoneId,
  )

  if (matches.length !== 1) {
    throw new Error('Nie można jednoznacznie potwierdzić wybranej strefy.')
  }

  const zoneClientId = String(matches[0]?.clientId ?? '').trim()
  if (!zoneClientId || zoneClientId !== normalizedClientId) {
    throw new Error('Wybrana strefa nie należy do wskazanego obiektu.')
  }
}

export async function createEvent(orgId, payload = {}) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  const manualClientId = String(payload.clientId ?? '').trim()
  const manualZoneId = String(payload.zoneId ?? payload.utilityRoomId ?? payload.roomId ?? '').trim()
  if (!manualClientId) {
    throw new Error('Ręczne zdarzenie wymaga wskazania obiektu.')
  }
  if (!manualZoneId) {
    throw new Error('Ręczne zdarzenie wymaga wskazania strefy należącej do obiektu.')
  }

  const eventId = String(payload.eventId ?? payload.id ?? `EV-${Date.now()}`).trim()
  if (!eventId) {
    throw new Error('Pole eventId jest wymagane dla createEvent(orgId).')
  }
  const workerLogin = String(payload.workerLogin ?? '').trim()
  if (!workerLogin) {
    throw new Error('Wybierz pracownika przed zapisaniem zdarzenia.')
  }

  ensureFirebase()
  const mutationPayload = buildEventMutationPayload(payload)
  mutationPayload.workerLogin = workerLogin
  const canonicalWorkdayId = String(payload.workdayId ?? payload.linkedWorkdayId ?? eventId).trim() || eventId
  const integrityPayload = {
    workerLogin,
    status: mutationPayload.status,
    endAt: mutationPayload.endAt,
  }
  const [, integritySnapshot] = await Promise.all([
    assertManualEventZoneBelongsToClient(orgId, manualClientId, manualZoneId),
    requiresOpenIntegrityCheck(integrityPayload)
      ? readWorkerIntegritySnapshot(orgId, integrityPayload.workerLogin)
      : Promise.resolve(null),
  ])
  await Promise.all([
    assertNoOtherOpenCleanEvent(orgId, integrityPayload, {
      rows: integritySnapshot?.events,
      // Ręczny zapis zarządczy może współistnieć z nierozstrzygniętym wpisem
      // historycznym. Jawny aktywny CLEAN nadal pozostaje blockerem.
      blockUnresolvedLegacy: false,
    }),
    assertNoOtherOpenWorkday(orgId, integrityPayload, {
      rows: integritySnapshot?.workdays,
    }),
  ])
  const eventMutationPayload = {
    zoneId: mutationPayload.zoneId,
    workerLogin,
    workerName: payload.workerName ?? null,
    startAt: mutationPayload.startAt,
    endAt: mutationPayload.endAt,
    durationSec: mutationPayload.durationSec,
    status: mutationPayload.status,
    closeMarkedAt: mutationPayload.closeMarkedAt,
    endReason: mutationPayload.endReason,
    comment: mutationPayload.comment,
    deviceId: mutationPayload.deviceId,
    startEventId: mutationPayload.startEventId,
    endEventId: mutationPayload.endEventId,
  }
  // Event jest rekordem kanonicznym dla ochrony pojedynczego otwartego CLEAN.
  // Nie zapisuj lustrzanego Workday, gdy Event nie zostal jednoznacznie potwierdzony.
  await insertEventForOrg({
    orgId,
    eventId: canonicalWorkdayId,
    // Workday jeszcze nie istnieje, więc przedwczesne powiązanie narusza FK
    // event(org_id, workday_id) -> workday(org_id, workday_id).
    workdayId: null,
    ...eventMutationPayload,
  })

  try {
    await createWorkday(orgId, {
      workdayId: canonicalWorkdayId,
      workerLogin,
      workerName: payload.workerName ?? null,
      utilityRoomId: mutationPayload.zoneId ?? payload.utilityRoomId ?? payload.roomId ?? null,
      startAt: mutationPayload.startAt,
      endAt: mutationPayload.endAt,
      durationSec: mutationPayload.durationSec,
      status: mutationPayload.status,
      comment: mutationPayload.comment,
      updatedBy: payload.updatedBy ?? payload.editedBy ?? null,
    })
  } catch (error) {
    const partialError = new Error(
      'Zapis Event został potwierdzony, ale wynik zapisu powiązanego dnia pracy jest niepewny. Odśwież dane i zweryfikuj rekord przed ponowieniem.',
    )
    partialError.code = 'PARTIAL_EVENT_WORKDAY_WRITE_UNKNOWN'
    partialError.eventId = canonicalWorkdayId
    partialError.cause = error
    throw partialError
  }

  try {
    await reidentifyEventForOrg({
      orgId,
      eventId: canonicalWorkdayId,
      workdayId: canonicalWorkdayId,
      ...eventMutationPayload,
    })
  } catch (error) {
    const partialError = new Error(
      'Event i dzień pracy zostały zapisane, ale ich powiązanie nie zostało potwierdzone. Odśwież dane i zweryfikuj rekord przed ponowieniem.',
    )
    partialError.code = 'PARTIAL_EVENT_WORKDAY_LINK_UNKNOWN'
    partialError.eventId = canonicalWorkdayId
    partialError.workdayId = canonicalWorkdayId
    partialError.cause = error
    throw partialError
  }

  invalidateWorkdayCache(orgId)

  return {
    id: canonicalWorkdayId,
    eventId: canonicalWorkdayId,
    orgId,
    workerLogin: String(payload.workerLogin ?? '').trim(),
    workerName: String(payload.workerName ?? '').trim(),
    roomId: String(mutationPayload.zoneId ?? ''),
    utilityRoomId: String(mutationPayload.zoneId ?? ''),
    zoneId: String(mutationPayload.zoneId ?? ''),
    clientId: String(mutationPayload.clientId ?? ''),
    startAt: mutationPayload.startAt,
    endAt: mutationPayload.endAt,
    durationSec: mutationPayload.durationSec,
    status: String(mutationPayload.status ?? ''),
    comment: String(mutationPayload.comment ?? ''),
  }
}

export async function updateEvent(orgId, eventId, payload = {}) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  const normalizedEventId = String(eventId ?? payload.eventId ?? payload.workdayId ?? '').trim()
  if (!normalizedEventId) {
    throw new Error('Pole eventId jest wymagane dla updateEvent(orgId, eventId).')
  }
  const workerLogin = String(payload.workerLogin ?? '').trim()
  if (!workerLogin) {
    throw new Error('Wybierz pracownika przed zapisaniem zdarzenia.')
  }

  ensureFirebase()
  const mutationPayload = buildEventMutationPayload(payload)
  mutationPayload.workerLogin = workerLogin
  const canonicalWorkdayId = String(payload.workdayId ?? payload.linkedWorkdayId ?? normalizedEventId).trim() || normalizedEventId
  const integrityPayload = {
    workerLogin,
    status: mutationPayload.status,
    endAt: mutationPayload.endAt,
  }
  const integritySnapshot = requiresOpenIntegrityCheck(integrityPayload)
    ? await readWorkerIntegritySnapshot(orgId, integrityPayload.workerLogin)
    : null
  await Promise.all([
    assertNoOtherOpenCleanEvent(orgId, integrityPayload, {
      rows: integritySnapshot?.events,
      excludeRecordIds: [normalizedEventId, canonicalWorkdayId],
      blockUnresolvedLegacy: false,
    }),
    assertNoOtherOpenWorkday(orgId, integrityPayload, {
      rows: integritySnapshot?.workdays,
      excludeRecordIds: [canonicalWorkdayId],
    }),
  ])
  const operationalMutationPayload = {
    workerName: payload.workerName ?? null,
    endAt: mutationPayload.endAt,
    durationSec: mutationPayload.durationSec,
    status: mutationPayload.status,
    closeMarkedAt: mutationPayload.closeMarkedAt,
    endReason: mutationPayload.endReason,
    comment: mutationPayload.comment,
    deviceId: mutationPayload.deviceId,
    startEventId: mutationPayload.startEventId,
    endEventId: mutationPayload.endEventId,
  }
  const identityBaseline = payload.correlationIdentityBaseline
  const shouldReidentify =
    payload.forceReidentify === true ||
    !identityBaseline ||
    eventCorrelationIdentityChanged(identityBaseline, {
        ...payload,
        eventId: normalizedEventId,
        workdayId: canonicalWorkdayId,
        zoneId: mutationPayload.zoneId,
        workerLogin: mutationPayload.workerLogin,
        startAt: mutationPayload.startAt,
      })
  const eventOperationPayload = shouldReidentify
    ? {
        workdayId: canonicalWorkdayId,
        zoneId: mutationPayload.zoneId,
        workerLogin: mutationPayload.workerLogin,
        startAt: mutationPayload.startAt,
        ...operationalMutationPayload,
      }
    : operationalMutationPayload

  // Nie aktualizuj Workday, jezeli kanoniczny Event nie zostal jednoznacznie potwierdzony.
  if (shouldReidentify) {
    await reidentifyEventForOrg({
      orgId,
      eventId: normalizedEventId,
      ...eventOperationPayload,
    })
  } else {
    try {
      await updateEventForOrg({
        orgId,
        eventId: normalizedEventId,
        ...eventOperationPayload,
      })
    } catch (error) {
      if (!isMissingDataConnectVariable(error, 'workerLogin')) {
        throw error
      }
      await runMutationOperation('UpdateEventForOrg', {
        orgId,
        eventId: normalizedEventId,
        workerLogin,
        ...operationalMutationPayload,
      })
    }
  }

  try {
    await updateWorkday(orgId, canonicalWorkdayId, {
      workerLogin: mutationPayload.workerLogin ?? payload.workerLogin ?? null,
      workerName: payload.workerName ?? null,
      utilityRoomId: mutationPayload.zoneId ?? payload.utilityRoomId ?? payload.roomId ?? null,
      startAt: mutationPayload.startAt,
      endAt: mutationPayload.endAt,
      durationSec: mutationPayload.durationSec,
      status: mutationPayload.status,
      comment: mutationPayload.comment,
      updatedBy: payload.updatedBy ?? payload.editedBy ?? null,
    })
  } catch (error) {
    const partialError = new Error(
      'Event został zaktualizowany, ale wynik aktualizacji powiązanego dnia pracy jest niepewny. Odśwież dane i zweryfikuj rekord przed ponowieniem.',
    )
    partialError.code = 'PARTIAL_EVENT_WORKDAY_UPDATE_UNKNOWN'
    partialError.eventId = normalizedEventId
    partialError.workdayId = canonicalWorkdayId
    partialError.cause = error
    throw partialError
  }
  invalidateWorkdayCache(orgId)

  return {
    id: canonicalWorkdayId,
    eventId: canonicalWorkdayId,
    orgId,
    workerLogin: String(payload.workerLogin ?? '').trim(),
    workerName: String(payload.workerName ?? '').trim(),
    roomId: String(mutationPayload.zoneId ?? ''),
    utilityRoomId: String(mutationPayload.zoneId ?? ''),
    zoneId: String(mutationPayload.zoneId ?? ''),
    clientId: String(mutationPayload.clientId ?? ''),
    startAt: mutationPayload.startAt,
    endAt: mutationPayload.endAt,
    durationSec: mutationPayload.durationSec,
    status: String(mutationPayload.status ?? ''),
    comment: String(mutationPayload.comment ?? ''),
  }
}

async function findEventIdsLinkedToWorkday(orgId, workdayId) {
  const normalizedWorkdayId = String(workdayId ?? '').trim()
  if (!normalizedWorkdayId) {
    return []
  }

  const linkedEventIds = new Set()
  let offset = 0

  try {
    while (offset < WORKDAY_READ_MAX_RECORDS) {
      const rows = await runEventsPageQuery(
        'EventsIntegrityPageForOrg',
        {
          orgId,
          limit: WORKDAY_READ_MAX_CHUNK_SIZE,
          offset,
        },
        'events',
        { forceRefresh: true },
      )

      rows.forEach((row) => {
        const ids = [row?.eventId, row?.workdayId, row?.startEventId, row?.endEventId]
          .map((value) => String(value ?? '').trim())
          .filter(Boolean)
        if (ids.includes(normalizedWorkdayId)) {
          const eventId = String(row?.eventId ?? '').trim()
          if (eventId) linkedEventIds.add(eventId)
        }
      })

      if (rows.length < WORKDAY_READ_MAX_CHUNK_SIZE) {
        return [...linkedEventIds]
      }
      offset += WORKDAY_READ_MAX_CHUNK_SIZE
    }

    throw pagedReadLimitError('zdarzeń powiązanych z dniem pracy')
  } catch (error) {
    if (isOperationNotFoundError(error, 'EventsIntegrityPageForOrg')) {
      throw pagedReadUnavailableError('zdarzeń powiązanych z dniem pracy')
    }
    throw error
  }
}

export async function deleteEvent(orgId, eventId, options = {}) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  const normalizedEventId = String(eventId ?? '').trim()
  if (!normalizedEventId) {
    throw new Error('Pole eventId jest wymagane dla deleteEvent(orgId, eventId).')
  }

  ensureFirebase()
  const deleteLinkedWorkday = Boolean(options?.deleteLinkedWorkday ?? options?.deleteWorkday)
  const deleteErrors = []
  let workdayDeleted = false
  let eventDeleted = false
  let eventDeleteFailures = 0
  let linkedEventIds = []

  if (deleteLinkedWorkday) {
    try {
      linkedEventIds = await findEventIdsLinkedToWorkday(orgId, normalizedEventId)
    } catch (error) {
      if (isPagedReadSafetyError(error)) {
        throw error
      }
      deleteErrors.push(error)
    }

    try {
      await deleteWorkday(orgId, normalizedEventId)
      workdayDeleted = true
    } catch (error) {
      deleteErrors.push(error)
    }
  }

  const eventIdsToDelete = [...new Set([normalizedEventId, ...linkedEventIds].filter(Boolean))]
  for (const targetEventId of eventIdsToDelete) {
    try {
      const response = await runMutationOperation('DeleteEventForOrg', {
        orgId,
        eventId: targetEventId,
      })
      eventDeleted = Boolean(response?.data?.event_delete?.eventId) || eventDeleted
    } catch (error) {
      if (!isOperationNotFoundError(error, 'DeleteEventForOrg')) {
        eventDeleteFailures += 1
        deleteErrors.push(error)
      }
    }
  }

  if ((!workdayDeleted && !eventDeleted) || (deleteLinkedWorkday && eventDeleteFailures > 0)) {
    const firstError = deleteErrors[0]
    throw firstError instanceof Error ? firstError : new Error('Nie udalo sie usunac zdarzenia.')
  }
  invalidateWorkdayCache(orgId)

  return {
    success: true,
    orgId,
    eventId: normalizedEventId,
    workdayDeleted,
    eventDeleted,
    linkedEventIds,
  }
}

export async function createWorkday(orgId, payload = {}) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  const workdayId = String(payload.workdayId ?? payload.id ?? `WD-${Date.now()}`)
  const workerLogin = String(payload.workerLogin ?? '').trim()

  if (!workerLogin) {
    throw new Error('Pole workerLogin jest wymagane dla createWorkday(orgId).')
  }

  const startAt = toNullableIso(payload.startAt)
  const endAt = toNullableIso(payload.endAt)
  const durationSec = normalizeDurationSeconds(payload.durationSec, startAt, endAt)

  ensureFirebase()
  const mutationResult = await insertWorkdayForOrg({
    orgId,
    workdayId,
    workerLogin,
    workerName: payload.workerName ?? null,
    utilityRoomId: payload.utilityRoomId ?? payload.roomId ?? null,
    startAt,
    endAt,
    durationSec,
    status: payload.status ?? null,
    comment: payload.comment ?? null,
    updatedBy: payload.updatedBy ?? null,
  })
  const insertedWorkdayId = String(mutationResult?.data?.workday_insert?.workdayId ?? '').trim()
  if (!insertedWorkdayId) {
    throw new Error('Data Connect nie potwierdzil zapisu nowego zdarzenia.')
  }
  invalidateWorkdayCache(orgId)

  return {
    workdayId,
    orgId,
    workerLogin,
    workerName: String(payload.workerName ?? ''),
    utilityRoomId: String(payload.utilityRoomId ?? payload.roomId ?? ''),
    startAt,
    endAt,
    durationSec,
    status: String(payload.status ?? ''),
    comment: String(payload.comment ?? ''),
    editedBy: String(payload.updatedBy ?? ''),
  }
}

export async function updateWorkday(orgId, workdayId, payload = {}) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  const normalizedWorkdayId = String(workdayId ?? payload.workdayId ?? '').trim()
  if (!normalizedWorkdayId) {
    throw new Error('Pole workdayId jest wymagane dla updateWorkday(orgId, workdayId).')
  }

  const workerLogin = String(payload.workerLogin ?? '').trim()
  if (!workerLogin) {
    throw new Error('Pole workerLogin jest wymagane dla updateWorkday(orgId, workdayId).')
  }

  const startAt = toNullableIso(payload.startAt)
  const endAt = toNullableIso(payload.endAt)
  const durationSec = normalizeDurationSeconds(payload.durationSec, startAt, endAt)

  ensureFirebase()
  await updateWorkdayForOrg({
    orgId,
    workdayId: normalizedWorkdayId,
    workerLogin,
    workerName: payload.workerName ?? null,
    utilityRoomId: payload.utilityRoomId ?? payload.roomId ?? null,
    startAt,
    endAt,
    durationSec,
    status: payload.status ?? null,
    comment: payload.comment ?? null,
    updatedBy: payload.updatedBy ?? null,
  })
  invalidateWorkdayCache(orgId)

  return {
    workdayId: normalizedWorkdayId,
    orgId,
    workerLogin,
    workerName: String(payload.workerName ?? ''),
    utilityRoomId: String(payload.utilityRoomId ?? payload.roomId ?? ''),
    startAt,
    endAt,
    durationSec,
    status: String(payload.status ?? ''),
    comment: String(payload.comment ?? ''),
    editedBy: String(payload.updatedBy ?? ''),
  }
}

export async function deleteWorkday(orgId, workdayId) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  const normalizedWorkdayId = String(workdayId ?? '').trim()
  if (!normalizedWorkdayId) {
    throw new Error('Pole workdayId jest wymagane dla deleteWorkday(orgId, workdayId).')
  }

  ensureFirebase()
  await deleteWorkdayForOrg({
    orgId,
    workdayId: normalizedWorkdayId,
  })
  invalidateWorkdayCache(orgId)

  return {
    success: true,
    orgId,
    workdayId: normalizedWorkdayId,
  }
}

