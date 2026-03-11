import {
  backupCyclesForOrg,
  deleteWorkdayForOrg,
  insertWorkdayForOrg,
  updateWorkdayForOrg,
  workdaysForOrg,
  workerWorkdaysForOrg,
} from '@dataconnect/generated'
import { executeMutation, executeQuery, mutationRef, queryRef } from 'firebase/data-connect'
import { ensureFirebase, isFirebaseConfigured } from '../firebase/firebaseClient'
import { getClients } from './clientService'
import { getZones } from './zoneService'
import { getWorkers } from './workerService'

const NINE_HOURS_SECONDS = 9 * 60 * 60
let eventsForOrgUnavailable = false
const DEPLOY_HINT =
  'Brak wdrożonej operacji Data Connect. Wykonaj: firebase login --reauth, potem firebase deploy --only dataconnect --project iclean-room.'

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

function toDayKey(isoValue) {
  const iso = toIso(isoValue)
  return iso ? iso.slice(0, 10) : ''
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

  return {
    id: pickFirstText(primary?.id, secondary?.id),
    clientId: pickFirstText(primary?.clientId, secondary?.clientId),
    name: pickFirstText(primary?.name, secondary?.name),
    zone: pickFirstText(primary?.zone, secondary?.zone),
    location: pickFirstText(primary?.location, secondary?.location),
    workerLogin: pickFirstText(primary?.workerLogin, secondary?.workerLogin),
    workerName: pickFirstText(primary?.workerName, secondary?.workerName),
  }
}

function getDataConnectInstance() {
  const firebase = ensureFirebase()
  const dataConnect = firebase?.dataConnect
  if (!dataConnect) {
    throw new Error('Nie udało się zainicjalizować Data Connect.')
  }

  return dataConnect
}

async function runQueryOperation(operationName, variables) {
  try {
    return await executeQuery(queryRef(getDataConnectInstance(), operationName, variables))
  } catch (error) {
    throw withOperationNotFoundHint(error, operationName)
  }
}

async function runMutationOperation(operationName, variables) {
  try {
    return await executeMutation(mutationRef(getDataConnectInstance(), operationName, variables))
  } catch (error) {
    throw withOperationNotFoundHint(error, operationName)
  }
}

function applyWorkdayFilters(items, filters = {}) {
  const fromDay = normalizeFilterDate(filters.fromIso)
  const toDay = normalizeFilterDate(filters.toIso)
  const workerFilter = String(filters.worker ?? '').trim().toLowerCase()
  const workerLoginFilter = normalizeLookupKey(filters.workerLogin)
  const workerLoginFilterLocal = normalizeLookupKey(extractLoginLocalPart(workerLoginFilter))
  const workerLoginNameFilter = normalizePersonName(filters.workerLogin)
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
      if (!workerName.includes(workerFilter) && !workerLogin.includes(workerFilter)) {
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
          workerLoginNameFilter.includes(itemName))
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

function findClientByTextHints(lookupMaps, hints = []) {
  if (!lookupMaps || !Array.isArray(hints) || !hints.length) {
    return null
  }

  const clientEntries = [...(lookupMaps.clientByNormalizedName?.entries?.() ?? [])]

  for (const rawHint of hints) {
    const text = sanitizeTextValue(rawHint)
    if (!text) {
      continue
    }

    const normalized = normalizeLookupKey(text)
    if (!normalized) {
      continue
    }

    const exact =
      lookupMaps.clientByNormalizedId.get(normalized) ||
      lookupMaps.clientByNormalizedName.get(normalized) ||
      null
    if (exact) {
      return exact
    }

    const partial = clientEntries.find(
      ([nameKey]) =>
        Boolean(nameKey) &&
        (nameKey.includes(normalized) || normalized.includes(nameKey)),
    )
    if (partial?.[1]) {
      return partial[1]
    }
  }

  return null
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

function extractQrCodeByPhase(value, phase) {
  const text = sanitizeTextValue(value)
  if (!text) {
    return ''
  }

  const normalizedPhase = String(phase ?? '').trim().toLowerCase() === 'start' ? 'start' : 'stop'
  const regex =
    normalizedPhase === 'start'
      ? /(START|QR\s*START|START_QR)\s*[:=-]?\s*([A-Z0-9-]{3,})/i
      : /(STOP|QR\s*STOP|STOP_QR)\s*[:=-]?\s*([A-Z0-9-]{3,})/i
  const match = text.match(regex)
  if (match?.[2]) {
    return String(match[2]).trim().toUpperCase()
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
    lookupMaps.zoneByNormalizedName.get(normalized) ||
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

function resolveClientFromQrHints(lookupMaps, hints = []) {
  if (!lookupMaps || !Array.isArray(hints) || !hints.length) {
    return null
  }

  for (const hint of hints) {
    const directCode = sanitizeTextValue(hint)
    const codes = directCode ? [directCode, ...extractQrCodesFromText(directCode)] : []
    for (const code of codes) {
      const zone = findZoneByCode(lookupMaps, code)
      if (!zone) {
        continue
      }
      const client = resolveClientFromZone(lookupMaps, zone)
      if (client) {
        return client
      }
    }
  }

  return null
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
  const dayStartQrFromComment = extractQrCodeByPhase(dayComment, 'start')
  const dayStopQrFromComment = extractQrCodeByPhase(dayComment, 'stop')
  const commentQrHints = extractQrCodesFromText(dayComment)
  const dayStartObject = sanitizeTextValue(
    pickFirstText(dayStartObjectRaw, dayStartQrFromComment, commentQrHints[0]),
  )
  const dayStopObject = sanitizeTextValue(pickFirstText(dayStopObjectRaw, dayStopQrFromComment, commentQrHints[0]))
  roomId = sanitizeTextValue(pickFirstText(roomId, dayStartObject, dayStopObject, commentQrHints[0]))
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
    location: sanitizeTextValue(pickFirstText(row?.zone?.location, fallbackZoneLocationFromRow)),
    workerLogin: sanitizeTextValue(row?.zone?.workerLogin),
    workerName: sanitizeTextValue(pickWorkerNameValue(row?.zone?.worker)),
  }
  const zoneFromRow = Object.values(zoneFromRowRaw).some((value) => mappedItemHasValue(value))
    ? zoneFromRowRaw
    : null

  const zoneFromLookup =
    lookupMaps.zoneById.get(roomId) ||
    lookupMaps.zoneByNormalizedId.get(normalizedRoomId) ||
    lookupMaps.zoneByNormalizedName.get(normalizedRoomId) ||
    null
  const zone = mergeZoneData(zoneFromRow, zoneFromLookup)

  const zoneClientId = sanitizeTextValue(zone?.clientId ?? row.clientId)
  const normalizedZoneClientId = normalizeLookupKey(zoneClientId)
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

  const clientFromZone =
    lookupMaps.clientById.get(zoneClientId) ||
    lookupMaps.clientByNormalizedId.get(normalizedZoneClientId) ||
    lookupMaps.clientByNormalizedName.get(normalizedZoneClientId) ||
    null

  const clientFromRoomId =
    lookupMaps.clientById.get(roomId) ||
    lookupMaps.clientByNormalizedId.get(normalizedRoomId) ||
    lookupMaps.clientByNormalizedName.get(normalizedRoomId) ||
    null

  const clientFromObjectHints = findClientByTextHints(lookupMaps, [
    dayStartObject,
    dayStopObject,
    rawStartObject,
    rawStopObject,
    dayComment,
    row?.comment,
  ])
  const clientFromQrHints = resolveClientFromQrHints(lookupMaps, [
    dayStartObject,
    dayStopObject,
    ...commentQrHints,
    roomId,
    workdayUtilityRoomId,
    rawStartObject,
    rawStopObject,
  ])

  const client =
    clientFromEvent || clientFromZone || clientFromRoomId || clientFromQrHints || clientFromObjectHints || null
  const resolvedClientId = sanitizeTextValue(
    pickFirstText(
      row.clientId,
      zone?.clientId,
      client?.id,
      clientFromRoomId?.id,
      clientFromQrHints?.id,
      clientFromObjectHints?.id,
    ),
  )
  const resolvedClientName = sanitizeTextValue(
    pickFirstText(
      client?.name,
      fallbackClientNameFromRow,
      clientFromQrHints?.name,
      clientFromObjectHints?.name,
      resolvedClientId,
    ),
  )
  const resolvedZoneName = sanitizeTextValue(pickFirstText(zone?.name, zone?.zone, fallbackZoneNameFromRow))
  const resolvedZoneLocation = sanitizeTextValue(pickFirstText(zone?.location, fallbackZoneLocationFromRow))
  const eventDayKey = toLocalDayKey(startAt || endAt)
  const roomDayKey = normalizedRoomId && eventDayKey ? `${normalizedRoomId}|${eventDayKey}` : ''
  const inferredFromRoomDay = roomDayKey
    ? pickClosestWorkerCandidate(lookupMaps.workdaysByRoomDay.get(roomDayKey), startAt)
    : null
  const inferredFromRoom = pickClosestWorkerCandidate(lookupMaps.workdaysByRoom.get(normalizedRoomId), startAt)
  const inferredFromDay = pickClosestWorkerCandidate(lookupMaps.workdaysByDay.get(eventDayKey), startAt)
  const inferredWorker = inferredFromRoomDay || inferredFromRoom || inferredFromDay || null

  const rawWorkerName = pickFirstText(
    pickWorkerNameValue(row.worker),
    row.workerName,
    row.workday?.workerName,
    zone?.workerName,
    inferredWorker?.workerName,
    linkedWorkday?.workerName,
  )
  const workerFromName =
    lookupMaps.workerByNormalizedName.get(normalizePersonName(rawWorkerName)) || null

  const resolvedWorkerLogin = pickFirstText(
    resolveWorkerByLogin(
      lookupMaps,
      workerLoginCandidate,
      row.workerLogin,
      row.workday?.workerLogin,
      zone?.workerLogin,
      inferredWorker?.workerLogin,
      linkedWorkday?.workerLogin,
    )?.login,
    workerLoginCandidate,
    extractLoginLocalPart(workerLoginCandidate),
    zone?.workerLogin,
    inferredWorker?.workerLogin,
    workerFromName?.login,
  )
  const worker =
    resolveWorkerByLogin(
      lookupMaps,
      resolvedWorkerLogin,
      workerLoginCandidate,
      row.workerLogin,
      row.workday?.workerLogin,
      zone?.workerLogin,
      inferredWorker?.workerLogin,
      linkedWorkday?.workerLogin,
    ) || null
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
    orgId,
    workerLogin: resolvedWorkerLogin,
    workerName: workerNameValue,
    workerType: sanitizeTextValue(worker?.type ?? worker?.role),
    roomId,
    utilityRoomId: roomId,
    zoneId: roomId,
    strefa: sanitizeTextValue(resolvedZoneName || '-'),
    zoneName: sanitizeTextValue(resolvedZoneName || '-'),
    clientId: resolvedClientId,
    klient: sanitizeTextValue(resolvedClientName || '-'),
    clientName: sanitizeTextValue(resolvedClientName || '-'),
    lokalizacja: sanitizeTextValue(resolvedZoneLocation || '-'),
    startAt,
    endAt,
    dayStartAt,
    dayEndAt,
    dayEndScanAt,
    dayGps,
    dayStartObject,
    dayStopObject,
    workdayUtilityRoomId,
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
  const [clients, zones, workers, workdayRows] = await Promise.all([
    getClients(orgId),
    getZones(orgId),
    getWorkers(orgId),
    includeWorkdays
      ? workdaysForOrg({ orgId })
          .then((response) => response?.data?.workdays ?? [])
          .catch(() => [])
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
  const rows = response?.data?.workdays ?? []
  return rows.map((row) => mapWorkday(orgId, row, lookupMaps))
}

async function fetchMappedBackupCycles(orgId) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. UzupeĹ‚nij web-app/.env.')
  }

  ensureFirebase()
  let response
  try {
    response = await backupCyclesForOrg({ orgId })
  } catch (error) {
    throw withOperationNotFoundHint(error, 'BackupCyclesForOrg')
  }

  const lookupMaps = await fetchLookupMaps(orgId, { includeWorkdays: true })
  const rows = response?.data?.backupCycles ?? []
  return rows
    .map((row) => mapWorkday(orgId, row, lookupMaps))
    .filter((item) => isDisplayableMappedItem(item))
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

function delayMs(durationMs) {
  const ms = Number(durationMs)
  const normalized = Number.isFinite(ms) && ms > 0 ? Math.floor(ms) : 0
  if (!normalized) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    setTimeout(resolve, normalized)
  })
}

async function assertWorkdayVisibleAfterSave(orgId, workdayId, options = {}) {
  const targetId = String(workdayId ?? '').trim()
  if (!targetId) {
    return
  }

  const attempts = Math.max(Number(options.attempts) || 4, 1)
  const waitMs = Math.max(Number(options.waitMs) || 200, 0)

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await getWorkdays(orgId, {
      source: 'events',
      q: targetId,
      page: 1,
      pageSize: 20,
    })
    const found = (response.items ?? []).some((item) => {
      const candidate = String(item?.workdayId ?? item?.eventId ?? item?.id ?? '').trim()
      return candidate === targetId
    })
    if (found) {
      return
    }

    if (attempt < attempts - 1 && waitMs > 0) {
      await delayMs(waitMs)
    }
  }

  throw new Error(
    `Zdarzenie ${targetId} nie zostalo potwierdzone w bazie po zapisie. Sprobuj ponownie lub odswiez liste.`,
  )
}

function mergeMappedEventCollections(primaryItems, secondaryItems) {
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
    const identity = mappedItemIdentity(merged)

    if (identity && !mappedItemHasValue(merged.id)) {
      merged.id = identity
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

async function fetchMappedEvents(orgId) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  ensureFirebase()
  let mappedEvents = []
  let mappedWorkdays = []
  let mappedBackupCycles = []
  if (!eventsForOrgUnavailable) {
    try {
      const response = await runQueryOperation('EventsForOrg', { orgId })
      const lookupMaps = await fetchLookupMaps(orgId, { includeWorkdays: true })
      const rows = response?.data?.events ?? []
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
    mappedWorkdays = await fetchMappedWorkdays(orgId, workdaysForOrg({ orgId }), 'WorkdaysForOrg')
  } catch (error) {
    if (!isOperationNotFoundError(error, 'WorkdaysForOrg')) {
      throw error
    }
  }

  // Fallback to backup cycles only when events source is unavailable/empty.
  const shouldUseBackupFallback = eventsForOrgUnavailable || !mappedEvents.length
  if (shouldUseBackupFallback) {
    try {
      mappedBackupCycles = await fetchMappedBackupCycles(orgId)
    } catch (error) {
      if (!isOperationNotFoundError(error, 'BackupCyclesForOrg')) {
        throw error
      }
    }
  }

  const collections = [mappedEvents, mappedWorkdays]
  if (!mappedEvents.length && mappedBackupCycles.length) {
    collections.push(mappedBackupCycles)
  }
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

  return merged.filter((item) => isDisplayableMappedItem(item))
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
  const source = String(filters.source ?? '').trim().toLowerCase()
  let mapped
  if (source === 'events' || source === 'event') {
    mapped = await fetchMappedEvents(orgId)
    const workerLoginHint = await resolveWorkerLoginHint(orgId, filters)
    if (workerLoginHint) {
      try {
        const mappedWorkerRows = await fetchMappedWorkdays(
          orgId,
          workerWorkdaysForOrg({ orgId, workerLogin: workerLoginHint }),
          'WorkerWorkdaysForOrg',
        )
        if (mappedWorkerRows.length) {
          mapped = mergeMappedEventCollections(mapped, mappedWorkerRows)
            .filter((item) => isDisplayableMappedItem(item))
        }
      } catch (error) {
        if (!isOperationNotFoundError(error, 'WorkerWorkdaysForOrg')) {
          throw error
        }
      }
    }
  } else if (source === 'backupcycle' || source === 'backup_cycle') {
    mapped = await fetchMappedBackupCycles(orgId)
  } else {
    mapped = await fetchMappedWorkdays(orgId, workdaysForOrg({ orgId }), 'WorkdaysForOrg')
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
  const workerLogin = String(workerId ?? range.workerLogin ?? '').trim()
  if (!workerLogin) {
    return {
      orgId,
      workerId,
      range,
      items: [],
      page: 1,
      pageSize: Number(range.pageSize) || 50,
      total: 0,
      totalPages: 1,
    }
  }

  const mapped = await fetchMappedWorkdays(
    orgId,
    workerWorkdaysForOrg({ orgId, workerLogin }),
    'WorkerWorkdaysForOrg',
  )
  const sorted = sortByLatest(mapped)
  const filtered = applyWorkdayFilters(sorted, range)
  const paged = paginate(filtered, range.page, range.pageSize)

  return {
    orgId,
    workerId: workerLogin,
    range,
    ...paged,
  }
}

export async function getRecentEvents(orgId, limit = 5) {
  const pageSize = Math.max(Number(limit) || 5, 1)
  const response = await getWorkdays(orgId, { page: 1, pageSize })

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
    throw new Error('Brak konfiguracji Firebase. UzupeĹ‚nij web-app/.env.')
  }

  ensureFirebase()
  const day = currentDayYmd()

  let workdayRows = []
  try {
    const workdayResponse = await workdaysForOrg({ orgId })
    workdayRows = workdayResponse?.data?.workdays ?? []
  } catch (error) {
    throw withOperationNotFoundHint(error, 'WorkdaysForOrg')
  }

  let eventRows = []
  if (!eventsForOrgUnavailable) {
    try {
      const eventsResponse = await runQueryOperation('EventsForOrg', { orgId })
      eventRows = eventsResponse?.data?.events ?? []
    } catch (error) {
      if (!isOperationNotFoundError(error, 'EventsForOrg')) {
        throw error
      }

      eventsForOrgUnavailable = true
    }
  }

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

export async function getTodayActiveWorkers(orgId) {
  const day = currentDayYmd()
  const [workdayResponse, eventsResponse, workerDirectory] = await Promise.all([
    getWorkdays(orgId, { page: 1, pageSize: 100000 }),
    getWorkdays(orgId, { source: 'events', page: 1, pageSize: 100000 }).catch(() => ({ items: [] })),
    getWorkers(orgId).catch(() => []),
  ])
  const nowTs = Date.now()
  const workers = new Map()
  const workerAliases = new Map()
  const resolveDisplayName = createWorkerDisplayNameResolver(workerDirectory)
  const hasReadableLabel = (value) => {
    const text = String(value ?? '').trim()
    return Boolean(text) && text !== '-'
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
    const workerLogin = String(item?.workerLogin ?? '').trim()
    const workerName = String(item?.workerName ?? '').trim()
    const primaryLabel = resolveDisplayName(workerLogin, workerName)
    const aliases = [workerLogin, extractLoginLocalPart(workerLogin), workerName]
      .map((value) => normalizeLookupKey(value))
      .filter(Boolean)

    let key = aliases.map((alias) => workerAliases.get(alias)).find(Boolean)
    if (!key) {
      key = aliases[0] || ''
    }
    if (!key) {
      return null
    }

    if (!workers.has(key)) {
      workers.set(key, {
        id: workerLogin || workerName || key,
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
        firstStartLocation: '-',
        latestStopIso: '',
        latestStopTs: 0,
        latestDayStopIso: '',
        latestDayStopTs: 0,
        closedSec: 0,
        runningCandidates: [],
      })
    }

    const bucket = workers.get(key)
    if (workerLogin && !String(bucket.id ?? '').trim()) {
      bucket.id = workerLogin
    }
    if (workerLogin && !String(bucket.workerLogin ?? '').trim()) {
      bucket.workerLogin = workerLogin
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

  ;enrichedRows
    .filter((item) => isItemFromLocalDay(item, day))
    .forEach((item) => {
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
      const startObjectLabel = String(item.dayStartObject ?? '').trim()
      const clientLabelRaw = String(item.clientName ?? item.klient ?? item.clientId ?? '').trim()
      const zoneLabelRaw = String(item.zoneName ?? item.strefa ?? '').trim()
      const locationLabelRaw = String(item.lokalizacja ?? item.location ?? '').trim()
      const clientLabel = hasReadableLabel(clientLabelRaw)
        ? clientLabelRaw
        : hasReadableLabel(startObjectLabel)
          ? startObjectLabel
          : '-'
      const zoneLabel = hasReadableLabel(zoneLabelRaw) ? zoneLabelRaw : '-'
      const locationLabel = hasReadableLabel(locationLabelRaw) ? locationLabelRaw : '-'
      const eventTs = toTimestamp(item.updatedAt || item.createdAt || endIso || startIso)
      if (eventTs > bucket.latestEventTs) {
        bucket.latestEventTs = eventTs
      }

      if (startTs > 0 && (bucket.firstStartTs <= 0 || startTs < bucket.firstStartTs)) {
        bucket.firstStartTs = startTs
        bucket.firstStartIso = startIso
        bucket.firstStartClient = clientLabel
        bucket.firstStartZone = zoneLabel
        bucket.firstStartLocation = locationLabel
      } else if (startTs > 0 && startTs === bucket.firstStartTs) {
        if (!hasReadableLabel(bucket.firstStartClient) && hasReadableLabel(clientLabel)) {
          bucket.firstStartClient = clientLabel
        }
        if (!hasReadableLabel(bucket.firstStartZone) && hasReadableLabel(zoneLabel)) {
          bucket.firstStartZone = zoneLabel
        }
        if (!hasReadableLabel(bucket.firstStartLocation) && hasReadableLabel(locationLabel)) {
          bucket.firstStartLocation = locationLabel
        }
      }
      if (endTs > bucket.latestStopTs) {
        bucket.latestStopTs = endTs
        bucket.latestStopIso = endIso
      }

      const isDayStopMarker =
        endTs > 0 && (endReason === 'WORKDAY_STOP' || endReason === 'STOP_END_DAY' || rawStatus === 'WORKDAY_CLOSED')
      if (isDayStopMarker && endTs > bucket.latestDayStopTs) {
        bucket.latestDayStopTs = endTs
        bucket.latestDayStopIso = endIso
      }

      if (status === 'RUNNING' && startTs > 0) {
        bucket.runningCandidates.push({
          startTs,
          startIso,
          clientLabel,
          zoneLabel,
          locationLabel,
        })
        return
      }

      if (status === 'CLOSED' && startTs > 0 && endTs > startTs) {
        bucket.closedSec += Math.floor((endTs - startTs) / 1000)
      }
    })

  const items = [...workers.values()]
    .map((bucket) => {
      const activeCandidates = bucket.runningCandidates
        .filter((candidate) => candidate.startTs > bucket.latestStopTs)
        .sort((left, right) => right.startTs - left.startTs)
      const activeCandidate = activeCandidates[0] ?? null
      const runningSec = activeCandidates.reduce(
        (sum, candidate) => sum + Math.max(0, Math.floor((nowTs - candidate.startTs) / 1000)),
        0,
      )
      const fallbackMarkerSec = (() => {
        if (bucket.latestStopTs <= 0 || !bucket.runningCandidates.length) {
          return 0
        }

        const latestStartBeforeStop = bucket.runningCandidates
          .filter((candidate) => candidate.startTs > 0 && candidate.startTs <= bucket.latestStopTs)
          .sort((left, right) => right.startTs - left.startTs)[0]
        if (!latestStartBeforeStop) {
          return 0
        }

        return Math.max(0, Math.floor((bucket.latestStopTs - latestStartBeforeStop.startTs) / 1000))
      })()
      const totalSec = Math.max(0, Math.floor(Math.max(bucket.closedSec, fallbackMarkerSec) + runningSec))
      const isRunning = Boolean(activeCandidate)
      const startIso = isRunning ? activeCandidate.startIso : bucket.firstStartIso
      const stopIso = !isRunning && bucket.latestStopTs > 0 ? bucket.latestStopIso : ''
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
      const resolvedLocation = isRunning
        ? activeCandidate?.locationLabel ?? bucket.firstStartLocation ?? '-'
        : bucket.firstStartLocation ?? '-'

      return {
        id: bucket.id,
        workerLogin: bucket.workerLogin || bucket.id,
        workerName: bucket.workerName,
        entriesCount: bucket.entriesCount,
        activeClient: hasReadableLabel(resolvedClient) ? resolvedClient : '-',
        activeZone: hasReadableLabel(resolvedZone) ? resolvedZone : '-',
        activeLocation: hasReadableLabel(resolvedLocation) ? resolvedLocation : '-',
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
    .map(({ activeSortTs, latestEventTs, ...item }) => item)

  return {
    orgId,
    day,
    items,
  }
}

export async function getDashboardSummary(orgId) {
  const [response, workerDirectory] = await Promise.all([
    getWorkdays(orgId, { page: 1, pageSize: 5000 }),
    getWorkers(orgId).catch(() => []),
  ])
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

export async function createEvent(orgId, payload = {}) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupelnij web-app/.env.')
  }

  const eventId = String(payload.eventId ?? payload.id ?? `EV-${Date.now()}`).trim()
  if (!eventId) {
    throw new Error('Pole eventId jest wymagane dla createEvent(orgId).')
  }

  ensureFirebase()
  const mutationPayload = buildEventMutationPayload(payload)
  const canonicalWorkdayId = String(payload.workdayId ?? payload.linkedWorkdayId ?? eventId).trim() || eventId
  const eventMutationPayload = {
    zoneId: mutationPayload.zoneId,
    workerLogin: mutationPayload.workerLogin,
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
  const writeErrors = []
  let eventSaved = false
  let workdaySaved = false

  try {
    await runMutationOperation('InsertEventForOrg', {
      orgId,
      eventId: canonicalWorkdayId,
      ...eventMutationPayload,
    })
    eventSaved = true
  } catch (error) {
    if (!isOperationNotFoundError(error, 'InsertEventForOrg')) {
      writeErrors.push(error)
    }
  }

  try {
    await createWorkday(orgId, {
      workdayId: canonicalWorkdayId,
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
    workdaySaved = true
  } catch (error) {
    writeErrors.push(error)
  }

  if (!eventSaved && !workdaySaved) {
    const firstError = writeErrors[0]
    throw firstError instanceof Error ? firstError : new Error('Nie udalo sie zapisac zdarzenia.')
  }

  try {
    await assertWorkdayVisibleAfterSave(orgId, canonicalWorkdayId)
  } catch (error) {
    // Best-effort visibility probe: mutation already succeeded, eventual consistency may delay query results.
    console.warn('[workdayService] visibility probe after createEvent failed', {
      orgId,
      workdayId: canonicalWorkdayId,
      message: error instanceof Error ? error.message : String(error ?? ''),
    })
  }

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
    throw new Error('Brak konfiguracji Firebase. Uzupelnij web-app/.env.')
  }

  const normalizedEventId = String(eventId ?? payload.eventId ?? payload.workdayId ?? '').trim()
  if (!normalizedEventId) {
    throw new Error('Pole eventId jest wymagane dla updateEvent(orgId, eventId).')
  }

  ensureFirebase()
  const mutationPayload = buildEventMutationPayload(payload)
  const canonicalWorkdayId = String(payload.workdayId ?? payload.linkedWorkdayId ?? normalizedEventId).trim() || normalizedEventId
  const eventMutationPayload = {
    zoneId: mutationPayload.zoneId,
    workerLogin: mutationPayload.workerLogin,
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
  const updateErrors = []
  let workdayUpdated = false
  let eventUpdated = false

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
    workdayUpdated = true
  } catch (error) {
    updateErrors.push(error)
  }

  try {
    await runMutationOperation('UpdateEventForOrg', {
      orgId,
      eventId: normalizedEventId,
      ...eventMutationPayload,
    })
    eventUpdated = true
  } catch (error) {
    if (!isOperationNotFoundError(error, 'UpdateEventForOrg')) {
      updateErrors.push(error)
    }
  }

  if (!workdayUpdated && !eventUpdated) {
    const firstError = updateErrors[0]
    throw firstError instanceof Error ? firstError : new Error('Nie udalo sie zaktualizowac zdarzenia.')
  }

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

export async function deleteEvent(orgId, eventId) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupelnij web-app/.env.')
  }

  const normalizedEventId = String(eventId ?? '').trim()
  if (!normalizedEventId) {
    throw new Error('Pole eventId jest wymagane dla deleteEvent(orgId, eventId).')
  }

  ensureFirebase()
  const deleteErrors = []
  let workdayDeleted = false
  let eventDeleted = false

  try {
    await deleteWorkday(orgId, normalizedEventId)
    workdayDeleted = true
  } catch (error) {
    deleteErrors.push(error)
  }

  try {
    await runMutationOperation('DeleteEventForOrg', {
      orgId,
      eventId: normalizedEventId,
    })
    eventDeleted = true
  } catch (error) {
    if (!isOperationNotFoundError(error, 'DeleteEventForOrg')) {
      deleteErrors.push(error)
    }
  }

  if (!workdayDeleted && !eventDeleted) {
    const firstError = deleteErrors[0]
    throw firstError instanceof Error ? firstError : new Error('Nie udalo sie usunac zdarzenia.')
  }

  return {
    success: true,
    orgId,
    eventId: normalizedEventId,
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

  return {
    success: true,
    orgId,
    workdayId: normalizedWorkdayId,
  }
}
