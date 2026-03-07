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
const DEPLOY_HINT =
  'Brak wdrożonej operacji Data Connect. Wykonaj: firebase login --reauth, potem firebase deploy --only dataconnect --project iclean2-2e798.'
let workdayPausesForOrgUnavailable = false

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

function nonNegativeInt(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0
  }
  return Math.floor(numeric)
}

function pauseDurationSec(row, nowIsoValue = new Date().toISOString()) {
  const direct = nonNegativeInt(row?.durationSec)
  if (direct > 0) {
    return direct
  }
  const startIso = toIso(row?.startAt)
  if (!startIso) {
    return 0
  }
  const stopIso = toIso(row?.stopAt)
  const endIso = stopIso || nowIsoValue
  const startMs = new Date(startIso).getTime()
  const endMs = new Date(endIso).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return 0
  }
  return Math.floor((endMs - startMs) / 1000)
}

function extractPauseRowsFromData(data) {
  if (!data || typeof data !== 'object') {
    return []
  }

  const directCandidates = [
    data.workdayPauses,
    data.pauses,
    data.pauseRows,
  ]
  for (const candidate of directCandidates) {
    if (Array.isArray(candidate)) {
      return candidate
    }
  }

  for (const value of Object.values(data)) {
    if (!Array.isArray(value) || !value.length) {
      continue
    }
    const sample = value[0] || {}
    if (String(sample?.pauseId ?? '').trim() || String(sample?.workdayId ?? '').trim()) {
      return value
    }
  }

  return []
}

function variableMismatchError(error) {
  const message = String(messageFromError(error) ?? '').toLowerCase()
  return (
    message.includes('variable') ||
    (message.includes('required') && message.includes('argument')) ||
    message.includes('unknown argument') ||
    message.includes('invalid value')
  )
}

function operationUnavailable(error, operationName) {
  const message = String(messageFromError(error) ?? '')
  return (
    isOperationNotFoundMessage(message, operationName) ||
    message.includes(`Brak operacji: ${operationName}`) ||
    message.includes(`Brak operacji: ${String(operationName).toLowerCase()}`)
  )
}

async function fetchWorkdayPauseRows(orgId, workerLogin = '') {
  const org = String(orgId ?? '').trim()
  if (!org || workdayPausesForOrgUnavailable) {
    return []
  }

  const variants = workerLogin
    ? [{ orgId: org, workerLogin: String(workerLogin).trim() }, { orgId: org }]
    : [{ orgId: org }]

  for (const variables of variants) {
    try {
      const response = await runQueryOperation('WorkdayPausesForOrg', variables)
      return extractPauseRowsFromData(response?.data)
    } catch (error) {
      if (operationUnavailable(error, 'WorkdayPausesForOrg')) {
        workdayPausesForOrgUnavailable = true
        return []
      }
      if (variableMismatchError(error)) {
        continue
      }
      return []
    }
  }

  return []
}

function buildPauseTotalsByWorkday(pauseRows, nowIsoValue = new Date().toISOString()) {
  const totals = new Map()
  ;(pauseRows || []).forEach((row) => {
    const workdayId = String(row?.workdayId ?? '').trim()
    if (!workdayId) {
      return
    }
    const current = totals.get(workdayId) || 0
    totals.set(workdayId, current + pauseDurationSec(row, nowIsoValue))
  })
  return totals
}

function timelineItemDurationSec(item) {
  const direct = nonNegativeInt(item?.durationSec)
  if (direct > 0) {
    return direct
  }
  const startIso = toIso(item?.startAt)
  const endIso = toIso(item?.endAt)
  if (!startIso || !endIso) {
    return 0
  }
  return nonNegativeInt((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000)
}

function applyPauseMetrics(items = [], pauseTotalsByWorkday = new Map()) {
  return items.map((item) => {
    const sourceType = String(item?.sourceType ?? '').trim().toUpperCase()
    const workdayId = String(item?.workdayId ?? '').trim()
    const breakSec = sourceType === 'WORKDAY' && workdayId
      ? nonNegativeInt(pauseTotalsByWorkday.get(workdayId))
      : 0
    const workSec = timelineItemDurationSec(item)
    const netSec = Math.max(0, workSec - breakSec)

    return {
      ...item,
      breakSec,
      pauseTotalSec: breakSec,
      netSec,
    }
  })
}

function applyWorkdayFilters(items, filters = {}) {
  const fromDay = normalizeFilterDate(filters.fromIso)
  const toDay = normalizeFilterDate(filters.toIso)
  const workerFilter = String(filters.worker ?? '').trim().toLowerCase()
  const workerLoginFilter = normalizeLookupKey(filters.workerLogin)
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

    if (workerFilter && !String(item.workerName ?? '').toLowerCase().includes(workerFilter)) {
      return false
    }

    if (workerLoginFilter && normalizeLookupKey(item.workerLogin) !== workerLoginFilter) {
      return false
    }

    if (zoneFilter && !String(item.strefa ?? '').toLowerCase().includes(zoneFilter)) {
      return false
    }

    if (zoneIdFilter && normalizeLookupKey(item.zoneId ?? item.utilityRoomId ?? item.roomId) !== zoneIdFilter) {
      return false
    }

    if (clientFilter && !String(item.klient ?? '').toLowerCase().includes(clientFilter)) {
      return false
    }

    if (clientIdFilter && normalizeLookupKey(item.clientId) !== clientIdFilter) {
      return false
    }

    if (roomFilter && !String(item.roomId ?? '').toLowerCase().includes(roomFilter)) {
      return false
    }

    if (statusFilter) {
      const normalizedStatus = normalizeStatus(item.status, Boolean(item.endAt))
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
    const leftTs = new Date(toIso(left.startAt) || toIso(left.updatedAt) || 0).getTime()
    const rightTs = new Date(toIso(right.startAt) || toIso(right.updatedAt) || 0).getTime()
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
        const normalizedName = normalizePersonName(worker.name ?? worker.fullName ?? '')
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
    const dayKey = toDayKey(startAt || endAt)
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
    const leftTs = new Date(left.startAt || left.updatedAt || 0).getTime()
    const rightTs = new Date(right.startAt || right.updatedAt || 0).getTime()
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

function mapTimelineRow(orgId, row, lookupMaps, options = {}) {
  const requestedSourceType = String(options.sourceType ?? '').trim().toUpperCase()
  const sourceType = requestedSourceType === 'WORKDAY' ? 'WORKDAY' : 'EVENT'
  const rawEventId = sanitizeTextValue(row.eventId ?? row.cycleId)
  const rawWorkdayId = sanitizeTextValue(row.workdayId)
  const sourceId =
    sourceType === 'WORKDAY' ? rawWorkdayId || rawEventId : rawEventId || rawWorkdayId
  const sourceKey = sourceId
    ? `${sourceType}:${sourceId}`
    : `${sourceType}:${toIso(row.startAt) || toIso(row.updatedAt) || Date.now()}`
  const workdayId = sourceType === 'WORKDAY' ? sourceId : rawWorkdayId || null
  const eventId = sourceType === 'EVENT' ? sourceId : null
  const linkedWorkday = lookupMaps.workdayById.get(rawWorkdayId) ?? null
  const workerLoginCandidate = sanitizeTextValue(
    row.workerLogin ?? row.worker?.login ?? row.workday?.workerLogin ?? linkedWorkday?.workerLogin ?? '',
  )
  const roomId = sanitizeTextValue(row.zoneId ?? row.utilityRoomId ?? row.roomId)
  const normalizedRoomId = normalizeLookupKey(roomId)
  const startAt = toIso(row.startAt)
  const endAt = toIso(row.endAt)
  const durationSec = calculateDuration(row)
  const zoneFromRow = row?.zone
    ? {
        id: sanitizeTextValue(row.zone.ZoneId ?? row.zone.zoneId ?? row.zoneId ?? roomId),
        clientId: sanitizeTextValue(row.zone.client?.clientId ?? row.clientId),
        name: sanitizeTextValue(row.zone.zone),
        zone: sanitizeTextValue(row.zone.zone),
        location: sanitizeTextValue(row.zone.location),
        workerLogin: sanitizeTextValue(row.zone.workerLogin),
        workerName: sanitizeTextValue(row.zone.worker?.fullName),
      }
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

  const client = clientFromEvent || clientFromZone || clientFromRoomId || null
  const resolvedClientId = sanitizeTextValue(row.clientId ?? zone?.clientId ?? clientFromRoomId?.id)
  const eventDayKey = toDayKey(startAt || endAt)
  const roomDayKey = normalizedRoomId && eventDayKey ? `${normalizedRoomId}|${eventDayKey}` : ''
  const inferredFromRoomDay = roomDayKey
    ? pickClosestWorkerCandidate(lookupMaps.workdaysByRoomDay.get(roomDayKey), startAt)
    : null
  const inferredFromRoom = pickClosestWorkerCandidate(lookupMaps.workdaysByRoom.get(normalizedRoomId), startAt)
  const inferredFromDay = pickClosestWorkerCandidate(lookupMaps.workdaysByDay.get(eventDayKey), startAt)
  const inferredWorker = inferredFromRoomDay || inferredFromRoom || inferredFromDay || null

  const rawWorkerName = pickFirstText(
    row.worker?.fullName,
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
  const status = normalizeStatus(row.status, Boolean(endAt))
  const workerNameFromWorker = pickFirstText(worker?.name, worker?.fullName, workerFromName?.name)
  const workerNameValue = sanitizeTextValue(
    pickFirstText(workerNameFromWorker, rawWorkerName, resolvedWorkerLogin),
  )

  return {
    id: sourceKey,
    sourceType,
    sourceId: sourceId || null,
    sourceKey,
    eventId,
    workdayId,
    linkedWorkdayId: rawWorkdayId,
    orgId,
    workerLogin: resolvedWorkerLogin,
    workerName: workerNameValue,
    workerType: sanitizeTextValue(worker?.type ?? worker?.role),
    roomId,
    utilityRoomId: roomId,
    zoneId: roomId,
    strefa: sanitizeTextValue(zone?.name ?? zone?.zone),
    zoneName: sanitizeTextValue(zone?.name ?? zone?.zone),
    clientId: resolvedClientId,
    klient: sanitizeTextValue((client?.name ?? resolvedClientId) || '-'),
    clientName: sanitizeTextValue((client?.name ?? resolvedClientId) || '-'),
    lokalizacja: sanitizeTextValue(zone?.location ?? '-'),
    startAt,
    endAt,
    date: formatDatePl(startAt || endAt),
    start: formatTime(startAt),
    stop: formatTime(endAt),
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
    dayKey: toDayKey(startAt || endAt),
  }
}

function mapEventRow(orgId, row, lookupMaps) {
  return mapTimelineRow(orgId, row, lookupMaps, { sourceType: 'EVENT' })
}

function mapWorkdayRow(orgId, row, lookupMaps) {
  return mapTimelineRow(orgId, row, lookupMaps, { sourceType: 'WORKDAY' })
}

function isDisplayableMappedItem(item) {
  const eventId = String(item?.sourceId ?? item?.eventId ?? item?.workdayId ?? '').trim()
  const workerLogin = String(item?.workerLogin ?? '').trim()
  const workerName = String(item?.workerName ?? '').trim()
  const zoneId = String(item?.zoneId ?? item?.roomId ?? '').trim()
  const zoneName = String(item?.zoneName ?? item?.strefa ?? '').trim()
  const clientName = String(item?.clientName ?? item?.klient ?? '').trim()
  const hasTime = Boolean(item?.startAt || item?.endAt || Number(item?.durationSec) > 0)
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

async function fetchLookupMapsFromRows(orgId, workdayRows = []) {
  const [clients, zones, workers] = await Promise.all([getClients(orgId), getZones(orgId), getWorkers(orgId)])
  return buildLookupMaps(clients, zones, workers, workdayRows)
}

async function fetchLookupMaps(orgId, options = {}) {
  const includeWorkdays = Boolean(options.includeWorkdays)
  const workdayRows = includeWorkdays
    ? await workdaysForOrg({ orgId })
        .then((response) => response?.data?.workdays ?? [])
        .catch(() => [])
    : []
  return fetchLookupMapsFromRows(orgId, workdayRows)
}

async function fetchMappedWorkdays(orgId, rowsPromise, operationName, options = {}) {
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
  const mappedRows = rows.map((row) => mapWorkdayRow(orgId, row, lookupMaps))
  const pauseRows = await fetchWorkdayPauseRows(orgId, options.workerLogin)
  const pauseTotalsByWorkday = buildPauseTotalsByWorkday(pauseRows)
  return applyPauseMetrics(mappedRows, pauseTotalsByWorkday)
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

  const lookupMaps = await fetchLookupMaps(orgId)
  const rows = response?.data?.backupCycles ?? []
  return rows
    .map((row) => mapEventRow(orgId, row, lookupMaps))
    .filter((item) => isDisplayableMappedItem(item))
}

function mergeMappedTimelineRows(items = []) {
  const merged = new Map()
  items.forEach((item) => {
    const key = String(item?.sourceKey ?? `${item?.sourceType ?? 'EVENT'}:${item?.sourceId ?? ''}`).trim()
    if (!key) {
      return
    }

    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, item)
      return
    }

    const existingTs = new Date(toIso(existing.startAt) || toIso(existing.updatedAt) || 0).getTime()
    const itemTs = new Date(toIso(item.startAt) || toIso(item.updatedAt) || 0).getTime()
    if (itemTs >= existingTs) {
      merged.set(key, item)
    }
  })
  return [...merged.values()]
}

async function fetchMappedEvents(orgId) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  ensureFirebase()
  const [eventsResponse, workdaysResponse] = await Promise.all([
    runQueryOperation('EventsForOrg', { orgId }),
    workdaysForOrg({ orgId }).catch((error) => {
      throw withOperationNotFoundHint(error, 'WorkdaysForOrg')
    }),
  ])

  const workdayRows = workdaysResponse?.data?.workdays ?? []
  const lookupMaps = await fetchLookupMapsFromRows(orgId, workdayRows)
  const eventRows = eventsResponse?.data?.events ?? []
  const mappedEvents = eventRows.map((row) => mapEventRow(orgId, row, lookupMaps))
  const mappedWorkdays = workdayRows.map((row) => mapWorkdayRow(orgId, row, lookupMaps))
  const pauseRows = await fetchWorkdayPauseRows(orgId)
  const pauseTotalsByWorkday = buildPauseTotalsByWorkday(pauseRows)

  return applyPauseMetrics(mergeMappedTimelineRows([...mappedEvents, ...mappedWorkdays]), pauseTotalsByWorkday).filter((item) =>
    isDisplayableMappedItem(item),
  )
}

export async function getWorkdays(orgId, filters = {}) {
  const source = String(filters.source ?? '').trim().toLowerCase()
  let mapped
  if (source === 'events' || source === 'event') {
    mapped = await fetchMappedEvents(orgId)
  } else if (source === 'backupcycle' || source === 'backup_cycle') {
    mapped = await fetchMappedBackupCycles(orgId)
  } else {
    mapped = await fetchMappedWorkdays(orgId, workdaysForOrg({ orgId }), 'WorkdaysForOrg', {
      workerLogin: String(filters.workerLogin ?? '').trim(),
    })
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
    { workerLogin },
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
  const response = await getWorkdays(orgId, { source: 'events', page: 1, pageSize })

  return response.items.map((item) => ({
    id: item.sourceKey || item.eventId || item.workdayId || item.id,
    workerName: item.workerName || '-',
    zoneName: item.zoneName || '-',
    clientName: item.clientName || '-',
    date: item.date || '-',
    start: item.start || '-',
    stop: item.stop || '-',
    duration: item.duration || '-',
  }))
}

export async function getDashboardSummary(orgId) {
  const response = await getWorkdays(orgId, { page: 1, pageSize: 5000 })
  const items = response.items

  const openWorkers = new Set(
    items
      .filter((item) => !item.endAt && normalizeStatus(item.status, Boolean(item.endAt)) !== 'CLOSED')
      .map((item) => item.workerName || item.workerLogin)
      .filter(Boolean),
  )

  const over9Workers = new Set(
    items
      .filter((item) => Boolean(item.endAt) && Number(item.durationSec) > NINE_HOURS_SECONDS)
      .map((item) => item.workerName || item.workerLogin)
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
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  const eventId = String(payload.eventId ?? payload.id ?? `EV-${Date.now()}`).trim()
  if (!eventId) {
    throw new Error('Pole eventId jest wymagane dla createEvent(orgId).')
  }

  ensureFirebase()
  const mutationPayload = buildEventMutationPayload(payload)
  const eventPayload = {
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
  await runMutationOperation('InsertEventForOrg', {
    orgId,
    eventId,
    ...eventPayload,
  })

  return {
    id: eventId,
    eventId,
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

  ensureFirebase()
  const mutationPayload = buildEventMutationPayload(payload)
  const eventPayload = {
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
  await runMutationOperation('UpdateEventForOrg', {
    orgId,
    eventId: normalizedEventId,
    ...eventPayload,
  })

  return {
    id: normalizedEventId,
    eventId: normalizedEventId,
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
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  const normalizedEventId = String(eventId ?? '').trim()
  if (!normalizedEventId) {
    throw new Error('Pole eventId jest wymagane dla deleteEvent(orgId, eventId).')
  }

  ensureFirebase()
  await runMutationOperation('DeleteEventForOrg', {
    orgId,
    eventId: normalizedEventId,
  })

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
  await insertWorkdayForOrg({
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
