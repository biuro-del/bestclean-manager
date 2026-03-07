import {
  backupCyclesForOrg,
  clientsForOrg,
  insertWorkdayForOrg,
  updateWorkdayForOrg,
  workerWorkdaysForOrg,
  workdaysForOrg,
  workersForOrg,
  zonesForOrg,
} from '@dataconnect/generated'
import { executeMutation, executeQuery, mutationRef, queryRef } from 'firebase/data-connect'
import { ensureFirebase, isFirebaseConfigured, waitForFirebaseAuthReady } from '../firebase/firebaseClient'
let eventsForOrgUnavailable = false
let backupCyclesForOrgUnavailable = false
let insertBackupCycleForOrgUnavailable = false
let updateBackupCycleForOrgUnavailable = false
let workdayPausesForOrgUnavailable = false
let activeWorkdayPauseForWorkerUnavailable = false
let startWorkdayPauseUnavailable = false
let stopWorkdayPauseUnavailable = false
const eventMutationsEnabled = envFlag('VITE_MOBILE_EVENT_MUTATIONS', true)
const backupCycleDualWriteEnabled = envFlag('VITE_MOBILE_DUAL_WRITE_BACKUP_CYCLE', true)
const cycleFallbackFromWorkdayEnabled = envFlag('VITE_MOBILE_CYCLE_WORKDAY_FALLBACK', false)
let insertEventForOrgUnavailable = !eventMutationsEnabled
let updateEventForOrgUnavailable = !eventMutationsEnabled
const MAX_REASONABLE_WORKDAY_SEC = 20 * 60 * 60
const GPS_COLUMN_MAX_LEN = 255

function envFlag(name, defaultValue = false) {
  try {
    const raw = typeof import.meta !== 'undefined' ? import.meta?.env?.[name] : undefined
    const text = String(raw ?? '').trim().toLowerCase()
    if (!text) return Boolean(defaultValue)
    return ['1', 'true', 'yes', 'on'].includes(text)
  } catch {
    return Boolean(defaultValue)
  }
}

function toText(value) {
  return String(value ?? '').trim()
}

function toUpper(value) {
  return toText(value).toUpperCase()
}

function normalizeRoleToken(value) {
  const role = toUpper(value)
  if (!role) return ''
  if (role === 'ADMIN' || role === 'ADMINISTRATOR') return 'ADMIN'
  if (role === 'MANAGER' || role === 'KIEROWNIK') return 'MANAGER'
  if (role === 'COORDINATOR' || role === 'KOORDYNATOR') return 'COORDINATOR'
  if (role === 'WORKER' || role === 'PRACOWNIK') return 'WORKER'
  return ''
}

function normalizeKey(value) {
  return toText(value).toLowerCase()
}

function loginMatchKeys(value) {
  const raw = normalizeKey(value)
  const keys = new Set()
  if (!raw) {
    return keys
  }

  keys.add(raw)
  if (raw.includes('@')) {
    keys.add(raw.split('@')[0])
  }
  return keys
}

function appendLoginMatchKeys(targetSet, value) {
  for (const key of loginMatchKeys(value)) {
    targetSet.add(key)
  }
}

function hasLoginIntersection(leftKeys, rightKeys) {
  for (const key of leftKeys) {
    if (rightKeys.has(key)) {
      return true
    }
  }
  return false
}

function normalizePersonName(value) {
  const raw = toText(value)
  if (!raw) return ''
  return removeDiacritics(raw).toLowerCase().replace(/\s+/g, ' ').trim()
}

function loginCandidates(value) {
  const text = toText(value).toLowerCase()
  if (!text) {
    return []
  }

  const local = text.includes('@') ? text.split('@')[0] : text
  const parts = local.split(/[^a-z0-9]+/).filter(Boolean)
  return [...new Set([local, ...parts])]
}

function primaryLoginCandidate(value) {
  const text = toText(value).toLowerCase()
  if (!text) {
    return ''
  }
  const local = text.includes('@') ? text.split('@')[0] : text
  const token = local.split(/[^a-z0-9]+/).filter(Boolean)[0]
  return token || local
}

function removeDiacritics(value) {
  const raw = toText(value)
  if (!raw) return ''
  try {
    return raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  } catch {
    return raw
  }
}

function functionToken(value) {
  return removeDiacritics(value).toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function nowIso() {
  return new Date().toISOString()
}

function parseIso(value) {
  const raw = toText(value)
  if (!raw) return ''
  const date = new Date(raw)
  if (!Number.isFinite(date.getTime())) return ''
  return date.toISOString()
}

function toDateKey(value) {
  const iso = parseIso(value)
  if (!iso) return ''
  return iso.slice(0, 10)
}

function isTodayIso(value) {
  const key = toDateKey(value)
  if (!key) return false
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return key === today
}

function isThisMonthIso(value) {
  const iso = parseIso(value)
  if (!iso) return false
  const date = new Date(iso)
  const now = new Date()
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
}

function elapsedSec(fromIso, toIsoValue = nowIso()) {
  const from = new Date(parseIso(fromIso) || 0).getTime()
  const to = new Date(parseIso(toIsoValue) || 0).getTime()
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 0
  return Math.floor((to - from) / 1000)
}

function nonNegativeInt(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return 0
  return Math.floor(numeric)
}

function isPauseOpen(pause) {
  if (!pause) return false
  if (toUpper(pause?.status) === 'CLOSED' || toUpper(pause?.status) === 'STOPPED') return false
  return !toText(pause?.stopAt)
}

function normalizePause(row) {
  const startAt = parseIso(row?.startAt)
  const stopAt = parseIso(row?.stopAt)
  const statusRaw = toUpper(row?.status)
  const status = statusRaw || (stopAt ? 'CLOSED' : 'RUNNING')
  return {
    pauseId: toText(row?.pauseId),
    workdayId: toText(row?.workdayId),
    workerLogin: toText(row?.workerLogin),
    workerName: toText(row?.workerName),
    startAt,
    stopAt,
    durationSec: nonNegativeInt(row?.durationSec),
    status,
    pauseEventId: toText(row?.pauseEventId),
    deviceId: toText(row?.deviceId),
    createdAt: parseIso(row?.createdAt),
    updatedAt: parseIso(row?.updatedAt),
  }
}

function pauseDurationSec(row, nowValue = nowIso()) {
  if (!row) return 0
  const storedDuration = nonNegativeInt(row?.durationSec)
  if (storedDuration > 0) {
    return storedDuration
  }
  const stopAt = parseIso(row?.stopAt)
  if (stopAt) {
    return elapsedSec(row?.startAt, stopAt)
  }
  if (isPauseOpen(row)) {
    return elapsedSec(row?.startAt, nowValue)
  }
  return 0
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
    if (!Array.isArray(value)) {
      continue
    }
    if (!value.length) {
      continue
    }
    const sample = value[0] || {}
    if (toText(sample?.pauseId) || toText(sample?.workdayId) || parseIso(sample?.startAt)) {
      return value
    }
  }

  return []
}

function extractPauseFromData(data) {
  if (!data || typeof data !== 'object') {
    return null
  }

  const directCandidates = [
    data.activeWorkdayPause,
    data.activePause,
    data.workdayPause,
    data.pause,
  ]
  for (const candidate of directCandidates) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      return candidate
    }
  }

  const rows = extractPauseRowsFromData(data)
  if (rows.length) {
    return rows[0]
  }
  return null
}

function variableShapeMismatch(error) {
  const text = normalizeErrorText(error)
  return (
    text.includes('variable') ||
    text.includes('required type') ||
    text.includes('not provided') ||
    text.includes('unknown argument') ||
    (text.includes('argument') && text.includes('required'))
  )
}

function pickLatestOpenPause(rows, workerLogin = '', workdayId = '') {
  const targetWorker = normalizeKey(workerLogin)
  const targetWorkday = toText(workdayId)
  const openRows = (rows || [])
    .map((row) => normalizePause(row))
    .filter((row) => isPauseOpen(row))
    .filter((row) => {
      if (targetWorker && normalizeKey(row.workerLogin) !== targetWorker) return false
      if (targetWorkday && toText(row.workdayId) !== targetWorkday) return false
      return true
    })
    .sort((a, b) => new Date(b.startAt || b.updatedAt || 0).getTime() - new Date(a.startAt || a.updatedAt || 0).getTime())
  return openRows[0] ?? null
}

function buildPauseRowsByWorkday(pauseRows = []) {
  const map = new Map()
  pauseRows.forEach((row) => {
    const normalized = normalizePause(row)
    const workdayId = toText(normalized?.workdayId)
    if (!workdayId) return
    const list = map.get(workdayId) || []
    list.push(normalized)
    map.set(workdayId, list)
  })

  for (const [key, list] of map.entries()) {
    map.set(
      key,
      [...list].sort((a, b) => new Date(a.startAt || a.updatedAt || 0).getTime() - new Date(b.startAt || b.updatedAt || 0).getTime()),
    )
  }
  return map
}

function workdayPauseTotalFromLegacy(workday, nowValue = nowIso()) {
  let total = nonNegativeInt(workday?.pauseTotalSec)
  const pauseOpenAt = parseIso(workday?.pauseOpenAt)
  if (pauseOpenAt && isWorkdayOpen(workday)) {
    total += elapsedSec(pauseOpenAt, nowValue)
  }
  return total
}

function workdayPauseTotalFromRows(workday, pauseRowsByWorkday, nowValue = nowIso(), activePause = null) {
  const workdayId = toText(workday?.workdayId)
  if (!workdayId) {
    return workdayPauseTotalFromLegacy(workday, nowValue)
  }

  const rows = pauseRowsByWorkday?.get(workdayId) || []
  if (!rows.length) {
    const legacy = workdayPauseTotalFromLegacy(workday, nowValue)
    if (isPauseOpen(activePause) && toText(activePause?.workdayId) === workdayId) {
      return Math.max(legacy, pauseDurationSec(activePause, nowValue) + nonNegativeInt(workday?.pauseTotalSec))
    }
    return legacy
  }

  const ids = new Set(rows.map((row) => toText(row.pauseId)).filter(Boolean))
  let total = rows.reduce((acc, row) => acc + pauseDurationSec(row, nowValue), 0)
  if (
    isPauseOpen(activePause) &&
    toText(activePause?.workdayId) === workdayId &&
    toText(activePause?.pauseId) &&
    !ids.has(toText(activePause.pauseId))
  ) {
    total += pauseDurationSec(activePause, nowValue)
  }
  return Math.max(0, Math.floor(total))
}

async function runOperationWithVariants({
  kind,
  operationNames,
  variableVariants = [],
  unavailableRef = null,
}) {
  const names = (operationNames || []).map((name) => toText(name)).filter(Boolean)
  const variants = Array.isArray(variableVariants) && variableVariants.length ? variableVariants : [{}]
  const run = kind === 'mutation' ? runMutationOperation : runQueryOperation

  if (!names.length) {
    const error = new Error('Brak nazwy operacji Data Connect.')
    error.code = 'OPERATION_UNAVAILABLE'
    throw error
  }

  let validationError = null
  for (const operationName of names) {
    for (const variables of variants) {
      try {
        return await run(operationName, variables || {})
      } catch (error) {
        if (operationMissing(error, operationName)) {
          continue
        }
        if (variableShapeMismatch(error)) {
          validationError = error
          continue
        }
        throw error
      }
    }
  }

  if (typeof unavailableRef === 'function') {
    unavailableRef()
  }

  if (validationError) {
    throw validationError
  }

  const error = new Error(`Brak wdrozonej operacji Data Connect (${names.join(', ')}).`)
  error.code = 'OPERATION_UNAVAILABLE'
  throw error
}

function sanitizeClosedWorkdayDuration(seconds, startIso, endIso) {
  const value = Math.max(0, Math.floor(Number(seconds || 0)))
  if (value <= MAX_REASONABLE_WORKDAY_SEC) {
    return value
  }

  const range = elapsedSec(startIso, endIso)
  if (range > 0 && range <= MAX_REASONABLE_WORKDAY_SEC) {
    return range
  }
  return 0
}

function formatTime(value) {
  const iso = parseIso(value)
  if (!iso) return '--:--'
  return new Date(iso).toLocaleTimeString('pl-PL', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatDate(value) {
  const iso = parseIso(value)
  if (!iso) return '--'
  const date = new Date(iso)
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`
}

function makeId(prefix) {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`
    }
  } catch {
    // Ignore fallback.
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
}

function appendComment(base, addition) {
  const left = toText(base)
  const right = toText(addition)
  if (!right) return left || null
  return left ? `${left} | ${right}` : right
}

function geolocationErrorMessage(error, actionLabel) {
  const action = toText(actionLabel) || 'operacje'
  const code = Number(error?.code || 0)
  if (code === 1) {
    return `Aby wykonac ${action}, wlacz GPS i zezwol na lokalizacje dla tej strony.`
  }
  if (code === 2) {
    return `Nie mozna odczytac GPS dla ${action}. Sprawdz uslugi lokalizacji i sprobuj ponownie.`
  }
  if (code === 3) {
    return `Przekroczono czas oczekiwania na GPS dla ${action}. Sprobuj ponownie.`
  }
  return `Nie udalo sie pobrac GPS dla ${action}.`
}

function readCurrentPosition(options = {}) {
  if (typeof navigator === 'undefined' || !navigator?.geolocation?.getCurrentPosition) {
    const err = new Error('Ta przegladarka nie obsluguje GPS.')
    err.code = 'GEO_UNSUPPORTED'
    throw err
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: Number(options.timeoutMs || 12000),
      maximumAge: 0,
    })
  })
}

async function captureGpsForAction(actionLabel) {
  try {
    const position = await readCurrentPosition()
    const coords = position?.coords || {}
    return {
      action: toText(actionLabel),
      lat: Number.isFinite(Number(coords.latitude)) ? Number(coords.latitude) : null,
      lon: Number.isFinite(Number(coords.longitude)) ? Number(coords.longitude) : null,
      accM: Number.isFinite(Number(coords.accuracy)) ? Math.round(Number(coords.accuracy)) : null,
      atIso: new Date(position?.timestamp || Date.now()).toISOString(),
      tzOffsetMin: new Date().getTimezoneOffset() * -1,
    }
  } catch (error) {
    throw new Error(geolocationErrorMessage(error, actionLabel))
  }
}

function gpsColumnValue(gpsData) {
  if (!gpsData) return ''
  const data = gpsData || {}
  const action = toText(data.action).toUpperCase() || 'GPS'
  const lat = Number.isFinite(Number(data.lat)) ? Number(data.lat).toFixed(6) : 'NA'
  const lon = Number.isFinite(Number(data.lon)) ? Number(data.lon).toFixed(6) : 'NA'
  const acc = Number.isFinite(Number(data.accM)) ? `${Math.round(Number(data.accM))}m` : 'NA'
  const at = toText(data.atIso) || nowIso()
  const tz = Number.isFinite(Number(data.tzOffsetMin))
    ? `UTC${Number(data.tzOffsetMin) >= 0 ? '+' : ''}${Number(data.tzOffsetMin) / 60}`
    : 'UTC?'
  return `${action}_GPS lat=${lat} lon=${lon} acc=${acc} at=${at} tz=${tz}`
}

function fitGpsColumn(value) {
  const text = toText(value)
  if (!text) return null
  if (text.length <= GPS_COLUMN_MAX_LEN) return text
  return text.slice(0, GPS_COLUMN_MAX_LEN)
}

function mergeGpsColumn(base, latest) {
  const merged = appendComment(base, latest)
  if (!merged) return null
  if (merged.length <= GPS_COLUMN_MAX_LEN) return merged
  const latestText = toText(latest)
  if (latestText) {
    return fitGpsColumn(latestText)
  }
  return fitGpsColumn(merged)
}

function classifyZone(functionLabel) {
  const token = functionToken(functionLabel)
  if (token === 'START' || token === 'STARTCZASPRACY') {
    return { kind: 'START', stopGraceMin: null }
  }

  if (token.startsWith('STOP')) {
    const explicitGrace = token.match(/STOP(?:CZASPRACY)?(15|10|5|0)/)
    if (explicitGrace) {
      return { kind: 'STOP', stopGraceMin: Number(explicitGrace[1]) }
    }

    // Backward compatibility for legacy labels like "STOP" or "STOP (czas pracy)".
    if (token === 'STOP' || token === 'STOPCZASPRACY') {
      return { kind: 'STOP', stopGraceMin: 0 }
    }
  }

  if (token === 'SPRZATANIEINDYWIDUALNE' || token === 'ZLECENIEINDYWIDUALNE') {
    return { kind: 'INDIVIDUAL', stopGraceMin: null }
  }

  return { kind: 'CLEAN', stopGraceMin: null }
}

function isIndividualCleanToken(token) {
  return token === 'SPRZATANIEINDYWIDUALNE' || token === 'ZLECENIEINDYWIDUALNE'
}

function isSpecialCleanToken(token) {
  return token === 'STREFASPECJALNA'
}

function isAutoStartCleanZone(zone) {
  const kind = toUpper(zone?.kind)
  if (kind === 'INDIVIDUAL') return true
  const token = functionToken(zone?.functionName)
  return isIndividualCleanToken(token) || isSpecialCleanToken(token)
}

function cloneGpsWithAction(gpsData, actionLabel) {
  if (!gpsData) return null
  return {
    ...gpsData,
    action: toText(actionLabel) || gpsData.action,
  }
}

function resolveAutoStopZone(snapshot, fallbackZone = null) {
  const stopRules = Array.isArray(snapshot?.stopRules) ? snapshot.stopRules : []
  const zeroRule = stopRules.find((rule) => Number(rule?.graceMin) === 0)
  if (zeroRule) {
    return {
      id: toText(zeroRule.roomId || zeroRule.id || 'STOP0'),
      stopGraceMin: 0,
    }
  }

  if (toUpper(fallbackZone?.kind) === 'STOP') {
    return {
      id: toText(fallbackZone?.id || 'STOP0'),
      stopGraceMin: Number(fallbackZone?.stopGraceMin ?? 0),
    }
  }

  return {
    id: 'STOP0_AUTO',
    stopGraceMin: 0,
  }
}

function pickBestWorker(workers, session) {
  const email = toText(session?.email).toLowerCase()
  const emailLogin = email.includes('@') ? email.split('@')[0] : ''
  const sessionLogin = toText(session?.workerLogin).toLowerCase()
  const loginSet = new Set([
    ...loginCandidates(sessionLogin),
    ...loginCandidates(emailLogin),
    ...loginCandidates(session?.login),
    ...loginCandidates(email),
  ])

  const direct = workers.find((worker) => loginSet.has(toText(worker.login).toLowerCase()))
  if (direct) return direct

  const sessionWorkerName = normalizePersonName(session?.workerName)
  if (sessionWorkerName) {
    const byName = workers.find((worker) => normalizePersonName(worker?.fullName) === sessionWorkerName)
    if (byName) return byName
  }

  const byEmail = workers.find((worker) => toText(worker.email).toLowerCase() === email)
  if (byEmail) return byEmail

  return null
}

function buildSessionWorkerFallback(session) {
  const email = toText(session?.email).toLowerCase()
  const emailLogin = email.includes('@') ? email.split('@')[0] : ''
  const rawLogin = toText(session?.workerLogin || session?.login || emailLogin).toLowerCase()
  const login = rawLogin.includes('@') ? rawLogin.split('@')[0] : rawLogin
  const safeLogin = primaryLoginCandidate(login) || primaryLoginCandidate(emailLogin) || login || emailLogin || 'worker'
  const name = toText(session?.workerName || safeLogin)
  return {
    login: safeLogin,
    fullName: name || safeLogin,
    workerType: toText(session?.role || 'WORKER'),
    role: normalizeRoleToken(session?.role) || 'WORKER',
    email,
  }
}

function normalizeWorkday(row) {
  const startAt = parseIso(row?.startAt)
  const endAt = parseIso(row?.endAt)
  const statusRaw = toUpper(row?.status)
  const status = statusRaw || (endAt ? 'CLOSED' : 'RUNNING')
  const durationSecRaw = Number(row?.durationSec)
  const durationSec = Number.isFinite(durationSecRaw) && durationSecRaw >= 0 ? Math.floor(durationSecRaw) : 0
  return {
    workdayId: toText(row?.workdayId),
    workerLogin: toText(row?.workerLogin),
    workerName: toText(row?.workerName),
    utilityRoomId: toText(row?.utilityRoomId),
    startAt,
    endAt,
    status,
    durationSec,
    pauseTotalSec: nonNegativeInt(row?.pauseTotalSec),
    pauseOpenId: toText(row?.pauseOpenId),
    pauseOpenAt: parseIso(row?.pauseOpenAt),
    comment: toText(row?.comment),
    gps: toText(row?.gps),
    updatedAt: parseIso(row?.updatedAt),
  }
}

function normalizeEvent(row, zoneById) {
  const zoneId = toText(row?.zoneId)
  const zone = zoneById.get(zoneId) ?? null
  const startAt = parseIso(row?.startAt)
  const endAt = parseIso(row?.endAt)
  const statusRaw = toUpper(row?.status)
  const status = statusRaw || (endAt ? 'CLOSED' : 'RUNNING')
  const durationSecRaw = Number(row?.durationSec)
  const durationSec = Number.isFinite(durationSecRaw) && durationSecRaw >= 0 ? Math.floor(durationSecRaw) : 0
  const workerLogin = toText(row?.workerLogin || row?.workday?.workerLogin)
  const workerName = toText(row?.worker?.fullName || row?.workday?.workerName)

  return {
    eventId: toText(row?.eventId),
    zoneId,
    zoneName: toText(zone?.name || row?.zone?.zone),
    zoneKind: zone?.kind || classifyZone(row?.zone?.function).kind,
    location: toText(zone?.location || row?.zone?.location),
    clientId: toText(row?.clientId || zone?.clientId || row?.zone?.client?.clientId),
    clientName: toText(zone?.clientName || row?.client?.name || row?.zone?.client?.name),
    workerLogin,
    workerName,
    workdayId: toText(row?.workdayId || row?.workday?.workdayId),
    startAt,
    endAt,
    status,
    durationSec,
    comment: toText(row?.comment),
    endReason: toText(row?.endReason),
  }
}

function isWorkdayOpen(workday) {
  const status = toUpper(workday?.status)
  if (status === 'CLOSED') return false
  if (!workday) return false
  if (status === 'ENDING') return true
  return !toText(workday?.endAt)
}

function isEventOpen(eventRow) {
  if (!eventRow) return false
  const status = toUpper(eventRow.status)
  if (status === 'CLOSED') return false
  return !toText(eventRow.endAt)
}

function getWorkdayDuration(workday, nowValue = nowIso()) {
  if (!workday) return 0
  const startAt = parseIso(workday.startAt)
  const endAt = parseIso(workday.endAt)
  const status = toUpper(workday.status)
  const directDurationRaw = Number(workday.durationSec)
  const hasDirectDuration = Number.isFinite(directDurationRaw) && directDurationRaw >= 0

  if (status === 'CLOSED') {
    if (hasDirectDuration) {
      return sanitizeClosedWorkdayDuration(directDurationRaw, startAt, endAt)
    }
    return sanitizeClosedWorkdayDuration(elapsedSec(startAt, endAt), startAt, endAt)
  }

  if (status === 'ENDING') {
    const plannedEnd = endAt || nowValue
    const endForCalc = new Date(plannedEnd).getTime() > new Date(nowValue).getTime() ? nowValue : plannedEnd
    return elapsedSec(startAt, endForCalc)
  }

  // Historical RUNNING rows should not inflate totals up to current time.
  if (!isTodayIso(startAt)) {
    if (endAt) {
      return elapsedSec(startAt, endAt)
    }
    if (hasDirectDuration) {
      return Math.floor(directDurationRaw)
    }
    return 0
  }

  return elapsedSec(startAt, nowValue)
}

function getWorkdayNetDuration(workday, nowValue = nowIso(), pauseRowsByWorkday = null, activePause = null) {
  const gross = getWorkdayDuration(workday, nowValue)
  const pauseTotal = pauseRowsByWorkday
    ? workdayPauseTotalFromRows(workday, pauseRowsByWorkday, nowValue, activePause)
    : workdayPauseTotalFromLegacy(workday, nowValue)
  return Math.max(0, gross - pauseTotal)
}

function pickActiveWorkday(rows) {
  const sorted = [...rows].sort((a, b) => new Date(b.startAt || b.updatedAt || 0).getTime() - new Date(a.startAt || a.updatedAt || 0).getTime())
  const openRows = sorted.filter((row) => isWorkdayOpen(row))
  const todayOpen = openRows.find((row) => isTodayIso(row?.startAt))
  if (todayOpen) return todayOpen
  return openRows[0] ?? null
}

function pickActiveCycle(events, activeWorkdayId) {
  const sorted = [...events]
    .filter((event) => event.zoneKind === 'CLEAN' || event.zoneKind === 'INDIVIDUAL')
    .sort((a, b) => new Date(b.startAt || 0).getTime() - new Date(a.startAt || 0).getTime())

  if (activeWorkdayId) {
    const scoped = sorted.find((event) => isEventOpen(event) && event.workdayId === activeWorkdayId)
    if (scoped) return scoped
  }

  return sorted.find((event) => isEventOpen(event)) ?? null
}

function fallbackActiveCycleFromWorkday(activeWorkday, zones) {
  if (!isWorkdayOpen(activeWorkday)) {
    return null
  }

  const zoneId = toText(activeWorkday?.utilityRoomId)
  if (!zoneId) {
    return null
  }

  const zone =
    (zones || []).find((row) => normalizeKey(row?.id) === normalizeKey(zoneId)) ??
    null
  const zoneKind = zone?.kind || classifyZone(zone?.functionName).kind
  if (zoneKind !== 'CLEAN' && zoneKind !== 'INDIVIDUAL') {
    return null
  }

  return {
    eventId: `WD-${toText(activeWorkday?.workdayId) || zoneId}`,
    zoneId,
    zoneName: toText(zone?.name || zoneId),
    zoneKind,
    location: toText(zone?.location),
    clientId: toText(zone?.clientId),
    clientName: toText(zone?.clientName),
    workerLogin: toText(activeWorkday?.workerLogin),
    workerName: toText(activeWorkday?.workerName),
    workdayId: toText(activeWorkday?.workdayId),
    startAt: parseIso(activeWorkday?.updatedAt || activeWorkday?.startAt),
    endAt: null,
    status: 'RUNNING',
    durationSec: 0,
    comment: toText(activeWorkday?.comment),
    endReason: '',
  }
}

function getCycleZone(snapshot, cycle, fallbackZone = null) {
  const cycleZoneId = normalizeKey(cycle?.zoneId)
  const byCycle = (snapshot?.zones || []).find((zone) => normalizeKey(zone?.id) === cycleZoneId)
  if (byCycle) {
    return byCycle
  }

  if (fallbackZone && toText(fallbackZone?.id)) {
    return fallbackZone
  }

  return null
}

async function insertBackupCycle(snapshot, payload) {
  if (insertBackupCycleForOrgUnavailable) {
    return false
  }

  try {
    await runMutationOperation('InsertBackupCycleForOrg', {
      ...payload,
      orgId: snapshot.orgId,
    })
    return true
  } catch (error) {
    if (operationMissing(error, 'InsertBackupCycleForOrg')) {
      insertBackupCycleForOrgUnavailable = true
      return false
    }
    throw error
  }
}

async function updateBackupCycle(snapshot, payload) {
  if (updateBackupCycleForOrgUnavailable) {
    return false
  }

  try {
    await runMutationOperation('UpdateBackupCycleForOrg', {
      ...payload,
      orgId: snapshot.orgId,
    })
    return true
  } catch (error) {
    if (operationMissing(error, 'UpdateBackupCycleForOrg')) {
      updateBackupCycleForOrgUnavailable = true
      return false
    }
    throw error
  }
}

function buildWorkdayEventFeed(workdays) {
  return workdays
    .flatMap((row) => {
      const startEntry = row.startAt
        ? {
            id: `${row.workdayId}-start`,
            type: 'START',
            color: 'start',
            at: row.startAt,
            label: 'Start dnia',
          }
        : null
      const stopEntry = row.endAt
        ? {
            id: `${row.workdayId}-stop`,
            type: 'STOP',
            color: 'stop',
            at: row.endAt,
            label: 'Stop dnia',
          }
        : null
      return [startEntry, stopEntry].filter(Boolean)
    })
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
}

function buildCycleHistory(events) {
  return [...events]
    .filter((row) => row.zoneKind === 'CLEAN' || row.zoneKind === 'INDIVIDUAL')
    .sort((a, b) => new Date(b.startAt || 0).getTime() - new Date(a.startAt || 0).getTime())
    .slice(0, 20)
    .map((row) => ({
      id: row.eventId,
      zoneName: row.zoneName || '-',
      clientName: row.clientName || '-',
      location: row.location || '-',
      start: formatTime(row.startAt),
      stop: row.endAt ? formatTime(row.endAt) : '--:--',
      date: formatDate(row.startAt || row.endAt),
      status: row.status,
      durationSec: row.endAt ? elapsedSec(row.startAt, row.endAt) : elapsedSec(row.startAt),
    }))
}

function summaryFromWorkdays(workdays, activeWorkday, pauseRowsByWorkday = null, activePause = null) {
  const nowValue = nowIso()
  const monthSeconds = workdays
    .filter((row) => isThisMonthIso(row.startAt))
    .reduce((acc, row) => acc + getWorkdayNetDuration(row, nowValue, pauseRowsByWorkday, activePause), 0)

  const todayRows = workdays.filter((row) => isTodayIso(row.startAt))
  const todaySeconds = todayRows.reduce((acc, row) => acc + getWorkdayNetDuration(row, nowValue, pauseRowsByWorkday, activePause), 0)
  const latestToday = [...todayRows].sort(
    (a, b) => new Date(b.startAt || 0).getTime() - new Date(a.startAt || 0).getTime(),
  )[0]

  return {
    monthSeconds,
    todaySeconds,
    todayStart: latestToday?.startAt ? formatTime(latestToday.startAt) : '--:--',
    todayStop: latestToday?.endAt ? formatTime(latestToday.endAt) : '--:--',
    activeSeconds: getWorkdayNetDuration(activeWorkday, nowValue, pauseRowsByWorkday, activePause),
  }
}

function parseQr(value) {
  return toText(value).replace(/\s+/g, '')
}

function compactQrKey(value) {
  return toText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function findZoneByQr(zones, qrCode) {
  const key = normalizeKey(qrCode)
  const compactKey = compactQrKey(qrCode)
  return (
    zones.find((zone) => {
      const zoneId = toText(zone?.id || zone?.zoneId)
      if (!zoneId) {
        return false
      }
      return normalizeKey(zoneId) === key || compactQrKey(zoneId) === compactKey
    }) ?? null
  )
}

function assertConfigured() {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase/Data Connect dla mobile-web.')
  }
}

function operationMissing(error, operationName) {
  const operation = toText(operationName)
  if (!operation) {
    return false
  }

  const message = toText(error?.message)
  let nestedMessage = ''
  try {
    if (message.startsWith('{')) {
      const parsed = JSON.parse(message)
      nestedMessage = toText(parsed?.error?.message || parsed?.message)
    }
  } catch {
    // Keep best-effort parsing only.
  }

  const full = `${message} ${nestedMessage}`.toLowerCase()
  const op = operation.toLowerCase()
  return (
    full.includes(`operation "${op}" not found`) ||
    full.includes(`operation \\"${op}\\" not found`) ||
    full.includes(`operation '${op}' not found`) ||
    (full.includes('operation') && full.includes('not found') && full.includes(op)) ||
    ((full.includes('"status":"not_found"') ||
      full.includes('"code":404') ||
      full.includes('"code":"404"')) &&
      full.includes(op))
  )
}

function normalizeErrorText(error) {
  const direct = toText(error?.message)
  let nested = ''
  try {
    const parsed = JSON.parse(direct)
    if (Array.isArray(parsed)) {
      nested = parsed
        .map((item) => toText(item?.message))
        .filter(Boolean)
        .join(' ')
    } else if (parsed && typeof parsed === 'object') {
      nested = toText(parsed?.error?.message || parsed?.message)
    }
  } catch {
    // Best effort only.
  }

  return removeDiacritics(`${direct} ${nested}`).toLowerCase()
}

function insertBlockedByEventPermission(error) {
  const message = normalizeErrorText(error)
  return (
    message.includes('brak uprawnien do dodawania zdarzen') ||
    (message.includes('permission_denied') && message.includes('workday_insert'))
  )
}

function workersPathMissing(error) {
  const message = toText(error?.message).toLowerCase()
  return message.includes('is missing') && message.includes('workers')
}

function getDataConnectInstance() {
  const firebase = ensureFirebase()
  const dataConnect = firebase?.dataConnect
  if (!dataConnect) {
    throw new Error('Nie udalo sie zainicjalizowac Data Connect.')
  }
  return dataConnect
}

async function runQueryOperation(operationName, variables) {
  return executeQuery(queryRef(getDataConnectInstance(), operationName, variables))
}

async function runMutationOperation(operationName, variables) {
  return executeMutation(mutationRef(getDataConnectInstance(), operationName, variables))
}

function mapBackupCycleToEventRow(row) {
  return {
    eventId: toText(row?.eventId || row?.workdayId || row?.cycleId),
    workdayId: toText(row?.workdayId || row?.startEventId),
    zoneId: toText(row?.zoneId || row?.utilityRoomId || row?.roomId),
    workerLogin: toText(row?.workerLogin),
    workerName: toText(row?.workerName),
    startAt: row?.startAt || null,
    endAt: row?.endAt || null,
    durationSec: row?.durationSec ?? null,
    status: toText(row?.status),
    comment: toText(row?.comment),
    endReason: toText(row?.endReason),
    closeMarkedAt: row?.closeMarkedAt || row?.updatedAt || null,
    deviceId: toText(row?.deviceId),
    startEventId: toText(row?.startEventId),
    endEventId: toText(row?.endEventId),
  }
}

async function fetchEventRows(orgId) {
  if (!eventsForOrgUnavailable) {
    try {
      const eventsResponse = await runQueryOperation('EventsForOrg', { orgId })
      return eventsResponse?.data?.events ?? []
    } catch (error) {
      if (!operationMissing(error, 'EventsForOrg')) {
        throw error
      }
      eventsForOrgUnavailable = true
    }
  }

  if (!backupCyclesForOrgUnavailable) {
    try {
      const fallback = await backupCyclesForOrg({ orgId })
      const rows = fallback?.data?.backupCycles ?? []
      return rows.map(mapBackupCycleToEventRow)
    } catch (error) {
      if (!operationMissing(error, 'BackupCyclesForOrg')) {
        throw error
      }
      backupCyclesForOrgUnavailable = true
    }
  }

  return []
}

function fallbackWorkersFromWorkdays(workdayRows) {
  const byLogin = new Map()
  for (const row of workdayRows || []) {
    const login = toText(row?.workerLogin)
    if (!login || byLogin.has(login)) {
      continue
    }

    byLogin.set(login, {
      login,
      fullName: toText(row?.workerName || login),
      workerType: 'WORKER',
      role: 'WORKER',
      email: '',
    })
  }

  return [...byLogin.values()]
}

async function fetchWorkerRows(orgId, fallbackWorkdayRows = []) {
  try {
    const response = await workersForOrg({ orgId })
    const rows = response?.data?.workers ?? []
    if (Array.isArray(rows)) {
      return rows
    }
  } catch (error) {
    if (workersPathMissing(error)) {
      return fallbackWorkersFromWorkdays(fallbackWorkdayRows)
    }
  }

  try {
    const response = await runQueryOperation('WorkersForOrg', { orgId })
    const rows = response?.data?.workers ?? []
    if (Array.isArray(rows)) {
      return rows
    }
  } catch (error) {
    if (workersPathMissing(error)) {
      return fallbackWorkersFromWorkdays(fallbackWorkdayRows)
    }
  }

  return fallbackWorkersFromWorkdays(fallbackWorkdayRows)
}

async function assertSignedInUser() {
  const user = await waitForFirebaseAuthReady()
  if (!user) {
    const error = new Error('Sesja wygasla. Zaloguj sie ponownie.')
    error.code = 'UNAUTHENTICATED'
    throw error
  }
}

async function fetchBaseData(orgId) {
  const [zoneRows, clientRows, workdayRows, eventRows] = await Promise.all([
    zonesForOrg({ orgId })
      .then((response) => response?.data?.zones ?? [])
      .catch(() => []),
    clientsForOrg({ orgId })
      .then((response) => response?.data?.clients ?? [])
      .catch(() => []),
    workdaysForOrg({ orgId })
      .then((response) => response?.data?.workdays ?? [])
      .catch(() => []),
    fetchEventRows(orgId).catch(() => []),
  ])

  const workerRows = await fetchWorkerRows(orgId, workdayRows)

  return {
    workerRows,
    zoneRows,
    clientRows,
    workdayRows,
    eventRows,
  }
}

async function fetchWorkerWorkdayRows(orgId, workerLogin) {
  const login = toText(workerLogin)
  if (!login) {
    return []
  }

  try {
    const response = await workerWorkdaysForOrg({ orgId, workerLogin: login })
    const rows = response?.data?.workdays ?? []
    if (Array.isArray(rows)) {
      return rows
    }
  } catch (error) {
    if (!operationMissing(error, 'WorkerWorkdaysForOrg')) {
      return []
    }
  }

  try {
    const response = await runQueryOperation('WorkerWorkdaysForOrg', { orgId, workerLogin: login })
    const rows = response?.data?.workdays ?? []
    if (Array.isArray(rows)) {
      return rows
    }
  } catch (error) {
    if (!operationMissing(error, 'WorkerWorkdaysForOrg')) {
      return []
    }
  }

  return []
}

async function fetchWorkdayPauseRows(orgId, workerLogin = '') {
  const org = toText(orgId)
  if (!org || workdayPausesForOrgUnavailable) {
    return []
  }

  try {
    const response = await runOperationWithVariants({
      kind: 'query',
      operationNames: ['WorkdayPausesForOrg', 'workdayPausesForOrg'],
      variableVariants: [
        { orgId: org, workerLogin: toText(workerLogin) || null },
        { orgId: org },
      ],
      unavailableRef: () => {
        workdayPausesForOrgUnavailable = true
      },
    })
    return extractPauseRowsFromData(response?.data).map((row) => normalizePause(row))
  } catch (error) {
    if (toText(error?.code) === 'OPERATION_UNAVAILABLE' || variableShapeMismatch(error) || operationMissing(error, 'WorkdayPausesForOrg')) {
      workdayPausesForOrgUnavailable = true
      return []
    }
    return []
  }
}

async function fetchActivePauseForWorker(orgId, workerLogin, activeWorkdayId = '', fallbackRows = []) {
  const org = toText(orgId)
  const login = toText(workerLogin)
  if (!org || !login) {
    return pickLatestOpenPause(fallbackRows, login, activeWorkdayId)
  }

  if (activeWorkdayPauseForWorkerUnavailable) {
    return pickLatestOpenPause(fallbackRows, login, activeWorkdayId)
  }

  try {
    const response = await runOperationWithVariants({
      kind: 'query',
      operationNames: ['ActiveWorkdayPauseForWorker', 'activeWorkdayPauseForWorker'],
      variableVariants: [
        { orgId: org, workerLogin: login },
        { orgId: org, login },
        { workerLogin: login },
        { orgId: org },
      ],
      unavailableRef: () => {
        activeWorkdayPauseForWorkerUnavailable = true
      },
    })
    const row = extractPauseFromData(response?.data)
    if (!row) {
      return pickLatestOpenPause(fallbackRows, login, activeWorkdayId)
    }
    const pause = normalizePause(row)
    if (!isPauseOpen(pause)) {
      return null
    }
    if (toText(activeWorkdayId) && toText(pause?.workdayId) && toText(pause?.workdayId) !== toText(activeWorkdayId)) {
      const fallbackScoped = pickLatestOpenPause(fallbackRows, login, activeWorkdayId)
      if (fallbackScoped) {
        return fallbackScoped
      }
    }
    return pause
  } catch (error) {
    if (toText(error?.code) === 'OPERATION_UNAVAILABLE' || variableShapeMismatch(error) || operationMissing(error, 'ActiveWorkdayPauseForWorker')) {
      activeWorkdayPauseForWorkerUnavailable = true
      return pickLatestOpenPause(fallbackRows, login, activeWorkdayId)
    }
    return pickLatestOpenPause(fallbackRows, login, activeWorkdayId)
  }
}

async function startWorkdayPauseRecord(snapshot, workday) {
  if (startWorkdayPauseUnavailable) {
    const error = new Error('Tryb pauzy nie jest jeszcze wdrozony w backendzie.')
    error.code = 'OPERATION_UNAVAILABLE'
    throw error
  }

  const pauseId = makeId('PAUSE')
  const nowValue = nowIso()
  const workerLogin = toText(snapshot?.worker?.login || workday?.workerLogin)
  const workerName = toText(snapshot?.worker?.name || workday?.workerName)
  const workdayId = toText(workday?.workdayId)

  const variableVariants = [
    {
      orgId: snapshot.orgId,
      pauseId,
      workdayId,
      workerLogin,
      workerName: workerName || null,
      startAt: nowValue,
      stopAt: null,
      durationSec: null,
      status: 'RUNNING',
      pauseEventId: pauseId,
      deviceId: null,
    },
    {
      orgId: snapshot.orgId,
      pauseId,
      workdayId,
      workerLogin,
      startAt: nowValue,
      status: 'RUNNING',
    },
    {
      orgId: snapshot.orgId,
      workdayId,
      workerLogin,
      startAt: nowValue,
    },
    {
      orgId: snapshot.orgId,
      workdayId,
    },
  ]

  try {
    await runOperationWithVariants({
      kind: 'mutation',
      operationNames: ['StartWorkdayPause', 'startWorkdayPause'],
      variableVariants,
      unavailableRef: () => {
        startWorkdayPauseUnavailable = true
      },
    })
  } catch (error) {
    if (toText(error?.code) === 'OPERATION_UNAVAILABLE' || operationMissing(error, 'StartWorkdayPause')) {
      startWorkdayPauseUnavailable = true
      const unavailable = new Error('Tryb pauzy nie jest jeszcze wdrozony w backendzie.')
      unavailable.code = 'OPERATION_UNAVAILABLE'
      throw unavailable
    }
    throw error
  }

  return {
    pauseId,
    workdayId,
    workerLogin,
    workerName,
    startAt: nowValue,
    stopAt: '',
    status: 'RUNNING',
  }
}

async function stopWorkdayPauseRecord(snapshot, pause) {
  if (stopWorkdayPauseUnavailable) {
    const error = new Error('Tryb pauzy nie jest jeszcze wdrozony w backendzie.')
    error.code = 'OPERATION_UNAVAILABLE'
    throw error
  }

  const pauseId = toText(pause?.pauseId)
  if (!pauseId) {
    throw new Error('Brak aktywnej pauzy do zakonczenia.')
  }
  const nowValue = nowIso()
  const durationSec = pauseDurationSec(
    {
      ...pause,
      stopAt: nowValue,
    },
    nowValue,
  )

  const variableVariants = [
    {
      orgId: snapshot.orgId,
      pauseId,
      stopAt: nowValue,
      durationSec,
      status: 'CLOSED',
    },
    {
      orgId: snapshot.orgId,
      pauseId,
      stopAt: nowValue,
      status: 'CLOSED',
    },
    {
      orgId: snapshot.orgId,
      pauseId,
      stopAt: nowValue,
    },
    {
      pauseId,
      stopAt: nowValue,
    },
  ]

  try {
    await runOperationWithVariants({
      kind: 'mutation',
      operationNames: ['StopWorkdayPause', 'stopWorkdayPause'],
      variableVariants,
      unavailableRef: () => {
        stopWorkdayPauseUnavailable = true
      },
    })
  } catch (error) {
    if (toText(error?.code) === 'OPERATION_UNAVAILABLE' || operationMissing(error, 'StopWorkdayPause')) {
      stopWorkdayPauseUnavailable = true
      const unavailable = new Error('Tryb pauzy nie jest jeszcze wdrozony w backendzie.')
      unavailable.code = 'OPERATION_UNAVAILABLE'
      throw unavailable
    }
    throw error
  }

  return {
    ...pause,
    stopAt: nowValue,
    durationSec,
    status: 'CLOSED',
  }
}

function normalizeZones(zoneRows, clientRows) {
  const clientMap = new Map(clientRows.map((row) => [toText(row.clientId), toText(row.name)]))
  return zoneRows.map((row) => {
    const id = toText(row.ZoneId || row.zoneId || row.zoneID || row.id)
    const functionName = toText(row.function)
    const kindData = classifyZone(functionName)
    return {
      id,
      clientId: toText(row.clientId),
      clientName: clientMap.get(toText(row.clientId)) || '',
      name: toText(row.zone),
      functionName,
      location: toText(row.location),
      workerLogin: toText(row.workerLogin),
      workerName: toText(row.worker?.fullName),
      kind: kindData.kind,
      stopGraceMin: kindData.stopGraceMin,
    }
  })
}

function resolveWorkerLogin(worker, session, workers) {
  const direct = toText(worker?.login)
  if (direct) {
    return direct
  }

  const byKey = new Map((workers || []).map((item) => [normalizeKey(item?.login), toText(item?.login)]))
  const byName = new Map(
    (workers || [])
      .map((item) => [normalizePersonName(item?.fullName), toText(item?.login)])
      .filter(([name, login]) => Boolean(name && login)),
  )

  const candidateValues = [session?.workerLogin, session?.login, session?.email]
  for (const value of candidateValues) {
    for (const candidate of loginCandidates(value)) {
      const canonical = byKey.get(normalizeKey(candidate))
      if (canonical) {
        return canonical
      }
    }
  }

  const sessionName = normalizePersonName(session?.workerName)
  if (sessionName) {
    const canonicalByName = byName.get(sessionName)
    if (canonicalByName) {
      return canonicalByName
    }
  }

  const fromSession = toText(session?.workerLogin)
  const fromEmail = toText(session?.email).split('@')[0] || ''
  return toText(primaryLoginCandidate(fromSession) || primaryLoginCandidate(fromEmail) || fromSession || fromEmail)
}

function selectWorkerScopedWorkdays(workdayRows, workerLogin, workerName = '', session = null) {
  const loginKeys = new Set()
  appendLoginMatchKeys(loginKeys, workerLogin)
  appendLoginMatchKeys(loginKeys, session?.workerLogin)
  appendLoginMatchKeys(loginKeys, session?.login)
  appendLoginMatchKeys(loginKeys, session?.email)

  const nameKeys = new Set()
  const canonicalName = normalizePersonName(workerName)
  const sessionName = normalizePersonName(session?.workerName)
  if (canonicalName) {
    nameKeys.add(canonicalName)
  }
  if (sessionName) {
    nameKeys.add(sessionName)
  }

  return workdayRows
    .map((row) => normalizeWorkday(row))
    .filter((row) => {
      const byLogin = hasLoginIntersection(loginMatchKeys(row.workerLogin), loginKeys)
      const rowName = normalizePersonName(row.workerName)
      const byName = Boolean(rowName && nameKeys.has(rowName))
      return byLogin || byName
    })
}

function selectWorkerScopedEvents(eventRows, workerLogin, zoneById, workerWorkdayIds = new Set(), workerName = '', session = null) {
  const loginKeys = new Set()
  appendLoginMatchKeys(loginKeys, workerLogin)
  appendLoginMatchKeys(loginKeys, session?.workerLogin)
  appendLoginMatchKeys(loginKeys, session?.login)
  appendLoginMatchKeys(loginKeys, session?.email)

  const nameKeys = new Set()
  const canonicalName = normalizePersonName(workerName)
  const sessionName = normalizePersonName(session?.workerName)
  if (canonicalName) {
    nameKeys.add(canonicalName)
  }
  if (sessionName) {
    nameKeys.add(sessionName)
  }

  return eventRows
    .map((row) => normalizeEvent(row, zoneById))
    .filter((row) => {
      const byWorkerLogin = hasLoginIntersection(loginMatchKeys(row.workerLogin), loginKeys)
      const rowName = normalizePersonName(row.workerName)
      const byWorkerName = Boolean(rowName && nameKeys.has(rowName))
      const byWorkday = toText(row.workdayId) && workerWorkdayIds.has(toText(row.workdayId))
      return Boolean(byWorkerLogin || byWorkerName || byWorkday)
    })
}

async function closeEndingIfDue(session, workday) {
  const status = toUpper(workday?.status)
  if (status !== 'ENDING') {
    return workday
  }

  const endAt = parseIso(workday?.endAt)
  if (!endAt) {
    const fallbackEndAt = nowIso()
    const durationSec = elapsedSec(workday.startAt, fallbackEndAt)
    await updateWorkdayForOrg({
      orgId: session.orgId,
      workdayId: workday.workdayId,
      workerLogin: workday.workerLogin,
      workerName: workday.workerName || null,
      utilityRoomId: workday.utilityRoomId || null,
      startAt: workday.startAt || null,
      endAt: fallbackEndAt,
      durationSec,
      status: 'CLOSED',
      comment: workday.comment || null,
      updatedBy: workday.workerLogin || null,
    })

    return {
      ...workday,
      status: 'CLOSED',
      endAt: fallbackEndAt,
      durationSec,
    }
  }

  const nowMs = Date.now()
  const endMs = new Date(endAt).getTime()
  if (!Number.isFinite(endMs) || endMs > nowMs) {
    return workday
  }

  const durationSec = elapsedSec(workday.startAt, endAt)
  await updateWorkdayForOrg({
    orgId: session.orgId,
    workdayId: workday.workdayId,
    workerLogin: workday.workerLogin,
    workerName: workday.workerName || null,
    utilityRoomId: workday.utilityRoomId || null,
    startAt: workday.startAt || null,
    endAt,
    durationSec,
    status: 'CLOSED',
    comment: workday.comment || null,
    updatedBy: workday.workerLogin || null,
  })

  return {
    ...workday,
    status: 'CLOSED',
    endAt,
    durationSec,
  }
}

export async function getMobileSnapshot(session) {
  assertConfigured()
  await assertSignedInUser()
  const orgId = toText(session?.orgId)
  if (!orgId) {
    throw new Error('Brak orgId w sesji mobile.')
  }

  const data = await fetchBaseData(orgId)
  const workers = data.workerRows.map((row) => ({
    login: toText(row.login),
    fullName: toText(row.fullName || row.login),
    workerType: toText(row.workerType || 'WORKER'),
    role: normalizeRoleToken(row.role || row.workerType) || 'WORKER',
    email: toText(row.loginEmail || row.email),
  }))
  const fallbackWorker = buildSessionWorkerFallback(session)
  const worker = pickBestWorker(workers, session) || fallbackWorker
  const workerLogin = toText(resolveWorkerLogin(worker, session, workers) || fallbackWorker.login)
  const workerName = toText(worker?.fullName || session?.workerName || workerLogin)

  const zones = normalizeZones(data.zoneRows, data.clientRows)
  const zoneById = new Map(zones.map((zone) => [zone.id, zone]))
  const workerScopedRows = await fetchWorkerWorkdayRows(orgId, workerLogin)
  const workdaySourceRows = workerScopedRows.length ? workerScopedRows : data.workdayRows
  const scopedWorkdays = selectWorkerScopedWorkdays(workdaySourceRows, workerLogin, workerName, session)
  const workerWorkdayIds = new Set(scopedWorkdays.map((row) => toText(row.workdayId)).filter(Boolean))
  const pauseRowsRaw = await fetchWorkdayPauseRows(orgId, workerLogin)
  const pauseRowsScoped = pauseRowsRaw.filter((row) => {
    const pauseWorkdayId = toText(row?.workdayId)
    if (pauseWorkdayId && workerWorkdayIds.has(pauseWorkdayId)) {
      return true
    }
    if (!pauseWorkdayId) {
      return normalizeKey(row?.workerLogin) === normalizeKey(workerLogin)
    }
    return false
  })
  const pauseRowsByWorkday = buildPauseRowsByWorkday(pauseRowsScoped)
  const snapshotNow = nowIso()

  let workdays = scopedWorkdays.map((row) => {
    const workdayId = toText(row?.workdayId)
    const openPause = pickLatestOpenPause(pauseRowsByWorkday.get(workdayId) || [], workerLogin, workdayId)
    const pauseTotalSec = workdayPauseTotalFromRows(row, pauseRowsByWorkday, snapshotNow, openPause)
    return {
      ...row,
      pauseTotalSec,
      pauseOpenId: toText(openPause?.pauseId || row?.pauseOpenId),
      pauseOpenAt: parseIso(openPause?.startAt || row?.pauseOpenAt),
    }
  })

  let activeWorkday = pickActiveWorkday(workdays)
  let activePause = await fetchActivePauseForWorker(orgId, workerLogin, activeWorkday?.workdayId, pauseRowsScoped)

  if (activeWorkday) {
    activeWorkday = await closeEndingIfDue({ ...session, orgId }, activeWorkday)
  }

  if (!isPauseOpen(activePause) && activeWorkday) {
    const openFromRows = pickLatestOpenPause(
      pauseRowsByWorkday.get(toText(activeWorkday?.workdayId)) || [],
      workerLogin,
      activeWorkday?.workdayId,
    )
    if (openFromRows) {
      activePause = openFromRows
    } else if (parseIso(activeWorkday?.pauseOpenAt)) {
      activePause = normalizePause({
        pauseId: toText(activeWorkday?.pauseOpenId) || `PAUSE-${toText(activeWorkday?.workdayId)}`,
        workdayId: toText(activeWorkday?.workdayId),
        workerLogin,
        workerName,
        startAt: activeWorkday.pauseOpenAt,
        stopAt: '',
        status: 'RUNNING',
      })
    }
  }

  if (isPauseOpen(activePause)) {
    const activeWorkdayId = toText(activeWorkday?.workdayId)
    if (!activeWorkdayId || toText(activePause?.workdayId) !== activeWorkdayId || !isWorkdayOpen(activeWorkday)) {
      activePause = null
    }
  } else {
    activePause = null
  }

  const activePauseForWorkday = activePause && toText(activePause?.workdayId) === toText(activeWorkday?.workdayId)
    ? activePause
    : null
  const activePauseTotalSec = activeWorkday
    ? workdayPauseTotalFromRows(activeWorkday, pauseRowsByWorkday, snapshotNow, activePauseForWorkday)
    : 0
  if (activeWorkday) {
    activeWorkday = {
      ...activeWorkday,
      pauseTotalSec: activePauseTotalSec,
      pauseOpenId: toText(activePauseForWorkday?.pauseId),
      pauseOpenAt: parseIso(activePauseForWorkday?.startAt),
    }
  }

  workdays = workdays.map((row) => {
    if (toText(row?.workdayId) !== toText(activeWorkday?.workdayId)) {
      return row
    }
    return {
      ...row,
      pauseTotalSec: activePauseTotalSec,
      pauseOpenId: toText(activePauseForWorkday?.pauseId),
      pauseOpenAt: parseIso(activePauseForWorkday?.startAt),
    }
  })

  const events = selectWorkerScopedEvents(data.eventRows, workerLogin, zoneById, workerWorkdayIds, workerName, session)
  const fallbackCycle = cycleFallbackFromWorkdayEnabled ? fallbackActiveCycleFromWorkday(activeWorkday, zones) : null
  const activeCycle = pickActiveCycle(events, activeWorkday?.workdayId) || fallbackCycle
  const summary = summaryFromWorkdays(workdays, activeWorkday, pauseRowsByWorkday, activePauseForWorkday)

  return {
    orgId,
    worker: {
      login: workerLogin,
      name: workerName,
      type: toText(worker?.workerType || 'WORKER'),
      role: normalizeRoleToken(worker?.role || worker?.workerType || session?.role) || 'WORKER',
    },
    zones,
    stopRules: zones.filter((zone) => zone.kind === 'STOP').map((zone) => ({
      roomId: zone.id,
      graceMin: zone.stopGraceMin,
      label: zone.name || zone.id,
    })),
    startZone: zones.find((zone) => zone.kind === 'START') ?? null,
    activeWorkday,
    activePause: activePauseForWorkday,
    pauseTotalSec: activePauseTotalSec,
    activeCycle,
    summary,
    workdayEvents: buildWorkdayEventFeed(workdays),
    workdays: [...workdays].sort(
      (a, b) => new Date(b.startAt || b.updatedAt || 0).getTime() - new Date(a.startAt || a.updatedAt || 0).getTime(),
    ),
    cycleHistory: buildCycleHistory(events),
  }
}

async function createWorkdayForScan(snapshot, startZone, gpsData = null) {
  const startAt = nowIso()
  const workdayId = makeId('WD')
  const initialLogin = toText(snapshot?.worker?.login)
  const fallbackLogin = primaryLoginCandidate(initialLogin)
  const fallbackFromName = primaryLoginCandidate(snapshot?.worker?.name)
  const workerLoginCandidates = [...new Set([initialLogin, fallbackLogin, fallbackFromName].filter(Boolean))]

  if (!workerLoginCandidates.length) {
    throw new Error('Brak loginu pracownika w sesji. Zaloguj sie ponownie.')
  }

  let lastError = null
  for (const workerLogin of workerLoginCandidates) {
    const payload = {
      orgId: snapshot.orgId,
      workdayId,
      workerLogin,
      workerName: snapshot.worker.name || null,
      utilityRoomId: startZone?.id || null,
      startAt,
      endAt: null,
      durationSec: null,
      status: 'RUNNING',
      comment: null,
      gps: fitGpsColumn(gpsColumnValue(gpsData)),
      updatedBy: workerLogin || null,
    }

    try {
      try {
        await insertWorkdayForOrg(payload)
      } catch (error) {
        if (insertBlockedByEventPermission(error)) {
          const denied = new Error(
            'Brak uprawnien do dodawania zdarzen dla tego konta. Skontaktuj sie z administratorem.',
          )
          denied.code = 'PERMISSION_DENIED'
          throw denied
        }
        throw error
      }

      if (snapshot?.worker) {
        snapshot.worker.login = workerLogin
      }

      return {
        message: 'Rozpoczeto dzien pracy.',
        workdayId,
        startAt,
      }
    } catch (error) {
      lastError = error
      const message = toText(error?.message).toLowerCase()
      const isWorkerLoginFk =
        message.includes('workday_org_id_worker_login_fkey') ||
        (message.includes('foreign key constraint') && message.includes('worker') && message.includes('login'))

      if (!isWorkerLoginFk || workerLogin === workerLoginCandidates[workerLoginCandidates.length - 1]) {
        if (isWorkerLoginFk) {
          throw new Error(
            'Brak powiazania konta z tabela pracownikow (worker.login). Popros administratora o dopasowanie loginu pracownika.',
          )
        }
        throw error
      }
    }
  }

  if (lastError) {
    throw lastError
  }

  return {
    message: 'Rozpoczeto dzien pracy.',
    workdayId,
    startAt,
  }
}

async function applyStopToWorkday(snapshot, workday, stopZone, gpsData = null, endAtOverride = '') {
  const scannedAt = parseIso(endAtOverride) || nowIso()
  const graceMin = Number(stopZone?.stopGraceMin ?? 0)
  const gpsValue = gpsColumnValue(gpsData)
  const fullGps = mergeGpsColumn(workday?.gps, gpsValue)
  const stopComment = appendComment(workday.comment, `STOP ${stopZone.id}`)
  const fullComment = stopComment
  const endAt = graceMin > 0
    ? new Date(new Date(scannedAt).getTime() + graceMin * 60_000).toISOString()
    : scannedAt
  const durationSec = elapsedSec(workday.startAt, endAt)
  await updateWorkdayForOrg({
    orgId: snapshot.orgId,
    workdayId: workday.workdayId,
    workerLogin: workday.workerLogin,
    workerName: workday.workerName || null,
    utilityRoomId: workday.utilityRoomId || null,
    startAt: workday.startAt || null,
    endAt,
    durationSec,
    status: 'CLOSED',
    comment: fullComment,
    gps: fullGps,
    updatedBy: snapshot.worker.login || null,
  })
  if (graceMin > 0) {
    return `Zakonczono dzien pracy. Doliczono ${graceMin} min (STOP${graceMin}).`
  }
  return 'Zakonczono dzien pracy.'
}

async function startWorkdayEnding(snapshot, workday, stopZone, gpsData = null, endAtOverride = '') {
  const scannedAt = parseIso(endAtOverride) || nowIso()
  const graceMin = Number(stopZone?.stopGraceMin ?? 0)
  const gpsValue = gpsColumnValue(gpsData)
  const fullGps = mergeGpsColumn(workday?.gps, gpsValue)
  const stopComment = appendComment(workday.comment, `STOP ${stopZone.id}`)
  const endAt = graceMin > 0
    ? new Date(new Date(scannedAt).getTime() + graceMin * 60_000).toISOString()
    : scannedAt
  const durationSec = elapsedSec(workday.startAt, endAt)

  await updateWorkdayForOrg({
    orgId: snapshot.orgId,
    workdayId: workday.workdayId,
    workerLogin: workday.workerLogin,
    workerName: workday.workerName || null,
    utilityRoomId: workday.utilityRoomId || null,
    startAt: workday.startAt || null,
    endAt,
    durationSec,
    status: 'ENDING',
    comment: stopComment,
    gps: fullGps,
    updatedBy: snapshot.worker.login || null,
  })

  if (graceMin > 0) {
    return `Rozpoczeto konczenie dnia. Doliczono ${graceMin} min (STOP${graceMin}).`
  }
  return 'Rozpoczeto konczenie dnia.'
}

async function closeWorkdayNow(snapshot, workday, stopZone, gpsData = null) {
  return applyStopToWorkday(snapshot, workday, stopZone, gpsData)
}

async function closeAdditionalOpenWorkdays(snapshot, activeWorkday, stopZone, gpsData = null) {
  const workerLogin = toText(activeWorkday?.workerLogin || snapshot?.worker?.login)
  const orgId = toText(snapshot?.orgId)
  const activeWorkdayId = toText(activeWorkday?.workdayId)
  if (!workerLogin || !orgId || !activeWorkdayId) {
    return 0
  }

  const dayKey = toDateKey(activeWorkday?.startAt) || toDateKey(nowIso())
  const stopAt = nowIso()
  let rows = []
  try {
    rows = await fetchWorkerWorkdayRows(orgId, workerLogin)
  } catch {
    return 0
  }

  const candidates = (rows || [])
    .map((row) => normalizeWorkday(row))
    .filter((row) => {
      const rowId = toText(row?.workdayId)
      if (!rowId || rowId === activeWorkdayId) return false
      if (!isWorkdayOpen(row)) return false
      if (dayKey && toDateKey(row?.startAt) !== dayKey) return false
      return true
    })

  if (!candidates.length) {
    return 0
  }

  let closedCount = 0
  for (const row of candidates) {
    try {
      await applyStopToWorkday(snapshot, row, stopZone, gpsData, stopAt)
      closedCount += 1
    } catch {
      // Best effort to avoid blocking the main STOP flow.
    }
  }
  return closedCount
}

async function setWorkdayRunning(snapshot, workday) {
  await updateWorkdayForOrg({
    orgId: snapshot.orgId,
    workdayId: workday.workdayId,
    workerLogin: workday.workerLogin,
    workerName: workday.workerName || null,
    utilityRoomId: workday.utilityRoomId || null,
    startAt: workday.startAt || null,
    endAt: null,
    durationSec: null,
    status: 'RUNNING',
    comment: workday.comment || null,
    updatedBy: snapshot.worker.login || null,
  })
}

async function startCycle(snapshot, zone, workdayIdHint = '', gpsData = null, workdayStartAtHint = '') {
  const eventId = makeId('EV')
  const targetWorkdayId = toText(workdayIdHint || snapshot?.activeWorkday?.workdayId)
  if (!targetWorkdayId) {
    throw new Error('Brak aktywnego dnia pracy do rozpoczecia strefy CLEAN.')
  }

  const startAt = nowIso()
  const workerLogin = toText(snapshot?.worker?.login || snapshot?.activeWorkday?.workerLogin) || null
  const workerName = toText(snapshot?.worker?.name || snapshot?.activeWorkday?.workerName) || null
  const workdayMarker = toText(targetWorkdayId || workdayStartAtHint) || null
  const gpsNote = fitGpsColumn(gpsColumnValue(gpsData))

  let eventSaved = false
  if (!insertEventForOrgUnavailable) {
    try {
      await runMutationOperation('InsertEventForOrg', {
        orgId: snapshot.orgId,
        eventId,
        workdayId: targetWorkdayId,
        zoneId: zone.id || null,
        workerLogin,
        workerName,
        startAt,
        endAt: null,
        durationSec: null,
        status: 'RUNNING',
        closeMarkedAt: null,
        endReason: null,
        comment: gpsNote,
        deviceId: null,
        startEventId: workdayMarker,
        endEventId: null,
      })
      eventSaved = true
    } catch (error) {
      if (!operationMissing(error, 'InsertEventForOrg')) {
        throw error
      }
      insertEventForOrgUnavailable = true
    }
  }

  if (!eventSaved) {
    const insertedToBackup = await insertBackupCycle(snapshot, {
      cycleId: eventId,
      workerLogin,
      workerName,
      roomId: toText(zone?.id) || null,
      strefa: toText(zone?.name) || null,
      pomieszczenie: toText(zone?.location) || null,
      startAt,
      endAt: null,
      durationSec: null,
      status: 'RUNNING',
      closeMarkedAt: null,
      endReason: null,
      comment: gpsNote,
      deviceId: null,
      startEventId: workdayMarker,
      endEventId: null,
    })
    if (!insertedToBackup) {
      throw new Error('Brak wdrozonej operacji InsertEventForOrg/InsertBackupCycleForOrg.')
    }
  } else if (backupCycleDualWriteEnabled) {
    try {
      await insertBackupCycle(snapshot, {
        cycleId: eventId,
        workerLogin,
        workerName,
        roomId: toText(zone?.id) || null,
        strefa: toText(zone?.name) || null,
        pomieszczenie: toText(zone?.location) || null,
        startAt,
        endAt: null,
        durationSec: null,
        status: 'RUNNING',
        closeMarkedAt: null,
        endReason: null,
        comment: gpsNote,
        deviceId: null,
        startEventId: workdayMarker,
        endEventId: null,
      })
    } catch {
      // Dual-write is best effort and should not block CLEAN flow.
    }
  }
}

async function stopCycle(snapshot, cycle, reason, commentValue, gpsData = null) {
  const endAt = nowIso()
  const durationSec = elapsedSec(cycle.startAt, endAt)
  const cycleId = toText(cycle?.eventId)
  if (!cycleId) {
    throw new Error('Brak eventId aktywnej strefy CLEAN.')
  }

  const workdayId = toText(cycle?.workdayId || snapshot?.activeWorkday?.workdayId) || null
  const workerLogin = toText(cycle?.workerLogin || snapshot?.worker?.login || snapshot?.activeWorkday?.workerLogin) || null
  const workerName = toText(cycle?.workerName || snapshot?.worker?.name || snapshot?.activeWorkday?.workerName) || null
  const zone = getCycleZone(snapshot, cycle)
  const gpsNote = gpsColumnValue(gpsData)
  const cycleComment = appendComment(toText(commentValue || cycle.comment) || null, gpsNote)

  const updatePayload = {
    orgId: snapshot.orgId,
    eventId: cycleId,
    workdayId,
    zoneId: cycle.zoneId || null,
    workerLogin,
    workerName,
    startAt: cycle.startAt || null,
    endAt,
    durationSec,
    status: 'CLOSED',
    closeMarkedAt: endAt,
    endReason: reason || 'CYCLE_STOP',
    comment: cycleComment,
    deviceId: null,
    startEventId: workdayId,
    endEventId: null,
  }

  let eventUpdated = false
  if (!updateEventForOrgUnavailable) {
    try {
      await runMutationOperation('UpdateEventForOrg', updatePayload)
      eventUpdated = true
    } catch (error) {
      if (!operationMissing(error, 'UpdateEventForOrg')) {
        throw error
      }
      updateEventForOrgUnavailable = true
    }
  }

  if (!eventUpdated) {
    const updatedToBackup = await updateBackupCycle(snapshot, {
      cycleId,
      workerLogin,
      workerName,
      roomId: toText(cycle?.zoneId || zone?.id) || null,
      strefa: toText(cycle?.zoneName || zone?.name) || null,
      pomieszczenie: toText(cycle?.location || zone?.location) || null,
      startAt: cycle.startAt || null,
      endAt,
      durationSec,
      status: 'CLOSED',
      closeMarkedAt: endAt,
      endReason: reason || 'CYCLE_STOP',
      comment: cycleComment,
      deviceId: null,
      startEventId: workdayId,
      endEventId: null,
    })
    if (!updatedToBackup) {
      throw new Error('Brak wdrozonej operacji UpdateEventForOrg/UpdateBackupCycleForOrg.')
    }
  } else if (backupCycleDualWriteEnabled) {
    try {
      await updateBackupCycle(snapshot, {
        cycleId,
        workerLogin,
        workerName,
        roomId: toText(cycle?.zoneId || zone?.id) || null,
        strefa: toText(cycle?.zoneName || zone?.name) || null,
        pomieszczenie: toText(cycle?.location || zone?.location) || null,
        startAt: cycle.startAt || null,
        endAt,
        durationSec,
        status: 'CLOSED',
        closeMarkedAt: endAt,
        endReason: reason || 'CYCLE_STOP',
        comment: cycleComment,
        deviceId: null,
        startEventId: workdayId,
        endEventId: null,
      })
    } catch {
      // Dual-write is best effort and should not block CLEAN flow.
    }
  }
}

export async function startMobilePause({ session, snapshot }) {
  assertConfigured()
  await assertSignedInUser()

  const nextSnapshot = snapshot || (await getMobileSnapshot(session))
  const activeWorkday = nextSnapshot?.activeWorkday
  const activePause = nextSnapshot?.activePause

  if (!isWorkdayOpen(activeWorkday)) {
    throw new Error('Brak aktywnego dnia pracy. Najpierw zeskanuj START.')
  }
  if (toUpper(activeWorkday?.status) !== 'RUNNING') {
    throw new Error('Pauza jest dostepna tylko podczas aktywnego dnia (RUNNING).')
  }
  if (isPauseOpen(activePause)) {
    return {
      message: 'Masz juz aktywna przerwe.',
      snapshot: await getMobileSnapshot(session),
    }
  }

  await startWorkdayPauseRecord(nextSnapshot, activeWorkday)

  let pauseGps = null
  try {
    pauseGps = await captureGpsForAction('PAUSE_START')
  } catch {
    pauseGps = null
  }
  const activeCycle = nextSnapshot?.activeCycle
  if (activeCycle && isEventOpen(activeCycle)) {
    try {
      await stopCycle(nextSnapshot, activeCycle, 'PAUSE_START', '', cloneGpsWithAction(pauseGps, 'CLEAN_STOP'))
    } catch {
      // Pause should remain active even if cycle close fails transiently.
    }
  }

  return {
    message: 'Rozpoczeto przerwe.',
    snapshot: await getMobileSnapshot(session),
  }
}

export async function stopMobilePause({ session, snapshot }) {
  assertConfigured()
  await assertSignedInUser()

  const nextSnapshot = snapshot || (await getMobileSnapshot(session))
  const activePause = nextSnapshot?.activePause
  if (!isPauseOpen(activePause)) {
    return {
      message: 'Brak aktywnej przerwy.',
      snapshot: await getMobileSnapshot(session),
    }
  }

  await stopWorkdayPauseRecord(nextSnapshot, activePause)

  return {
    message: 'Przerwa zakonczona. Wroc do skanowania stref.',
    snapshot: await getMobileSnapshot(session),
  }
}

export async function scanMobileQr({ session, snapshot, qrCode, comment, closeWorkdayImmediately = false }) {
  assertConfigured()
  await assertSignedInUser()
  const code = parseQr(qrCode)
  if (!code) {
    throw new Error('Wpisz kod QR.')
  }

  const zone = findZoneByQr(snapshot.zones, code)
  if (!zone) {
    throw new Error('Nie znaleziono kodu QR w tabeli stref.')
  }

  const activeWorkday = snapshot.activeWorkday
  const activeCycle = snapshot.activeCycle
  const activePause = snapshot.activePause
  const workdayOpen = isWorkdayOpen(activeWorkday)
  const staleWorkdayOpen = workdayOpen && !isTodayIso(activeWorkday?.startAt)
  const effectiveWorkdayOpen = workdayOpen && !staleWorkdayOpen

  if (zone.kind === 'START') {
    const startGps = await captureGpsForAction('START')
    if (effectiveWorkdayOpen) {
      return {
        message: 'Dzien pracy jest juz aktywny.',
        snapshot: await getMobileSnapshot(session),
      }
    }

    await createWorkdayForScan(snapshot, zone, startGps)
    return {
      message: 'Rozpoczeto dzien pracy (START).',
      snapshot: await getMobileSnapshot(session),
    }
  }

  if (zone.kind === 'STOP') {
    const stopGps = await captureGpsForAction('STOP')
    if (!effectiveWorkdayOpen) {
      throw new Error('Brak aktywnego dnia. Najpierw zeskanuj START.')
    }

    if (isPauseOpen(activePause)) {
      await stopWorkdayPauseRecord(snapshot, activePause)
    }

    if (activeCycle && isEventOpen(activeCycle)) {
      await stopCycle(snapshot, activeCycle, 'STOP_END_DAY', comment, cloneGpsWithAction(stopGps, 'CLEAN_STOP'))
    }

    if (Number(zone.stopGraceMin || 0) > 0) {
      const stopMessage = await startWorkdayEnding(snapshot, activeWorkday, zone, stopGps)
      return {
        message: stopMessage,
        snapshot: await getMobileSnapshot(session),
      }
    }

    const stopMessage = await closeWorkdayNow(snapshot, activeWorkday, zone, stopGps)
    const additionallyClosed = await closeAdditionalOpenWorkdays(snapshot, activeWorkday, zone, stopGps)
    const messageSuffix = additionallyClosed > 0
      ? ` Dodatkowo zamknieto ${additionallyClosed} zaleglych wpisow dnia.`
      : ''
    return {
      message: `${stopMessage}${messageSuffix}`.trim(),
      snapshot: await getMobileSnapshot(session),
    }
  }

  if (isPauseOpen(activePause)) {
    throw new Error('Masz aktywna przerwe. Kliknij "Wroc do pracy", aby ja zakonczyc.')
  }

  if (!effectiveWorkdayOpen) {
    if (isAutoStartCleanZone(zone)) {
      const startGps = await captureGpsForAction('START')
      const created = await createWorkdayForScan(snapshot, snapshot?.startZone || zone, startGps)
      await startCycle(snapshot, zone, created.workdayId, cloneGpsWithAction(startGps, 'CLEAN_START'), created.startAt)
      return {
        message: 'Rozpoczeto dzien i sprzatanie strefy.',
        snapshot: await getMobileSnapshot(session),
      }
    }

    throw new Error('Brak aktywnego dnia. Zeskanuj START lub kod strefy/zlecenia.')
  }

  if (toUpper(activeWorkday?.status) === 'ENDING') {
    await setWorkdayRunning(snapshot, activeWorkday)
  }

  if (activeCycle && isEventOpen(activeCycle)) {
    if (normalizeKey(activeCycle.zoneId) === normalizeKey(zone.id)) {
      const closeGps = await captureGpsForAction('CLEAN_STOP')
      await stopCycle(snapshot, activeCycle, 'QR_SAME', comment, closeGps)
      if (closeWorkdayImmediately) {
        const autoStopZone = resolveAutoStopZone(snapshot, zone)
        const stopMessage = await closeWorkdayNow(snapshot, activeWorkday, autoStopZone, cloneGpsWithAction(closeGps, 'STOP'))
        return {
          message: `Zakonczono sprzatanie tej strefy. ${stopMessage}`.trim(),
          snapshot: await getMobileSnapshot(session),
        }
      }
      return {
        message: 'Zakonczono sprzatanie tej strefy.',
        snapshot: await getMobileSnapshot(session),
      }
    }

    const switchGps = await captureGpsForAction('CLEAN')
    await stopCycle(snapshot, activeCycle, 'QR_SWITCH', comment, cloneGpsWithAction(switchGps, 'CLEAN_STOP'))
    await startCycle(snapshot, zone, '', cloneGpsWithAction(switchGps, 'CLEAN_START'))
    return {
      message: `Zmiana strefy na: ${zone.name || zone.id}.`,
      snapshot: await getMobileSnapshot(session),
    }
  }

  const cleanStartGps = await captureGpsForAction('CLEAN_START')
  await startCycle(snapshot, zone, '', cleanStartGps)
  return {
    message: `Rozpoczeto sprzatanie: ${zone.name || zone.id}.`,
    snapshot: await getMobileSnapshot(session),
  }
}

export async function closeMobileWorkdayImmediately({ session, snapshot, comment = '' }) {
  assertConfigured()
  await assertSignedInUser()

  const nextSnapshot = snapshot || (await getMobileSnapshot(session))
  const activeWorkday = nextSnapshot?.activeWorkday
  if (!isWorkdayOpen(activeWorkday)) {
    return {
      message: 'Brak aktywnego dnia pracy.',
      snapshot: await getMobileSnapshot(session),
    }
  }

  const stopGps = await captureGpsForAction('STOP')
  if (isPauseOpen(nextSnapshot?.activePause)) {
    await stopWorkdayPauseRecord(nextSnapshot, nextSnapshot.activePause)
  }
  const activeCycle = nextSnapshot?.activeCycle
  if (activeCycle && isEventOpen(activeCycle)) {
    await stopCycle(nextSnapshot, activeCycle, 'STOP_END_DAY', comment, cloneGpsWithAction(stopGps, 'CLEAN_STOP'))
  }

  const stopZone = resolveAutoStopZone(nextSnapshot)
  const stopMessage = await closeWorkdayNow(nextSnapshot, activeWorkday, stopZone, stopGps)
  const additionallyClosed = await closeAdditionalOpenWorkdays(nextSnapshot, activeWorkday, stopZone, stopGps)
  const messageSuffix = additionallyClosed > 0
    ? ` Dodatkowo zamknieto ${additionallyClosed} zaleglych wpisow dnia.`
    : ''

  return {
    message: `${stopMessage}${messageSuffix}`.trim(),
    snapshot: await getMobileSnapshot(session),
  }
}
