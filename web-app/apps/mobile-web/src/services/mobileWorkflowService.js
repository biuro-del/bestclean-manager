import {
  backupCyclesForOrg,
  clientsForOrg,
  insertWorkdayForOrg,
  updateWorkdayForOrg,
  workdaysForOrg,
  workersForOrg,
  zonesForOrg,
} from '@dataconnect/generated'
import { executeMutation, executeQuery, mutationRef, queryRef } from 'firebase/data-connect'
import { ensureFirebase, isFirebaseConfigured, waitForFirebaseAuthReady } from '../firebase/firebaseClient'
let eventsForOrgUnavailable = false
let backupCyclesForOrgUnavailable = false

function toText(value) {
  return String(value ?? '').trim()
}

function toUpper(value) {
  return toText(value).toUpperCase()
}

function normalizeKey(value) {
  return toText(value).toLowerCase()
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

function classifyZone(functionLabel) {
  const token = functionToken(functionLabel)
  if (token === 'START' || token === 'STARTCZASPRACY') {
    return { kind: 'START', stopGraceMin: null }
  }

  const stopMatch = token.match(/^STOP(0|5|10|15)$/)
  if (stopMatch) {
    return { kind: 'STOP', stopGraceMin: Number(stopMatch[1]) }
  }

  if (token === 'SPRZATANIEINDYWIDUALNE' || token === 'ZLECENIEINDYWIDUALNE') {
    return { kind: 'INDIVIDUAL', stopGraceMin: null }
  }

  return { kind: 'CLEAN', stopGraceMin: null }
}

function pickBestWorker(workers, session) {
  const email = toText(session?.email).toLowerCase()
  const emailLogin = email.includes('@') ? email.split('@')[0] : ''
  const sessionLogin = toText(session?.workerLogin).toLowerCase()
  const loginSet = new Set([sessionLogin, emailLogin].filter(Boolean))

  const direct = workers.find((worker) => loginSet.has(toText(worker.login).toLowerCase()))
  if (direct) return direct

  const byEmail = workers.find((worker) => toText(worker.email).toLowerCase() === email)
  if (byEmail) return byEmail

  return workers[0] ?? null
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
    comment: toText(row?.comment),
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
  const status = toUpper(workday.status)
  if (status === 'CLOSED') {
    if (Number.isFinite(workday.durationSec) && workday.durationSec > 0) {
      return workday.durationSec
    }
    return elapsedSec(workday.startAt, workday.endAt)
  }

  if (status === 'ENDING') {
    const plannedEnd = parseIso(workday.endAt) || nowValue
    const endForCalc = new Date(plannedEnd).getTime() > new Date(nowValue).getTime() ? nowValue : plannedEnd
    return elapsedSec(workday.startAt, endForCalc)
  }

  return elapsedSec(workday.startAt, nowValue)
}

function pickActiveWorkday(rows) {
  const sorted = [...rows].sort((a, b) => new Date(b.startAt || b.updatedAt || 0).getTime() - new Date(a.startAt || a.updatedAt || 0).getTime())
  return sorted.find((row) => isWorkdayOpen(row)) ?? null
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

function summaryFromWorkdays(workdays, activeWorkday) {
  const monthSeconds = workdays
    .filter((row) => isThisMonthIso(row.startAt))
    .reduce((acc, row) => acc + getWorkdayDuration(row), 0)

  const todayRows = workdays.filter((row) => isTodayIso(row.startAt))
  const todaySeconds = todayRows.reduce((acc, row) => acc + getWorkdayDuration(row), 0)
  const latestToday = [...todayRows].sort(
    (a, b) => new Date(b.startAt || 0).getTime() - new Date(a.startAt || 0).getTime(),
  )[0]

  return {
    monthSeconds,
    todaySeconds,
    todayStart: latestToday?.startAt ? formatTime(latestToday.startAt) : '--:--',
    todayStop: latestToday?.endAt ? formatTime(latestToday.endAt) : '--:--',
    activeSeconds: getWorkdayDuration(activeWorkday),
  }
}

function parseQr(value) {
  return toText(value).replace(/\s+/g, '')
}

function findZoneByQr(zones, qrCode) {
  const key = normalizeKey(qrCode)
  return zones.find((zone) => normalizeKey(zone.id) === key) ?? null
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
      workerType: 'Pracownik',
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

function normalizeZones(zoneRows, clientRows) {
  const clientMap = new Map(clientRows.map((row) => [toText(row.clientId), toText(row.name)]))
  return zoneRows.map((row) => {
    const id = toText(row.ZoneId)
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

  const fromSession = toText(session?.workerLogin)
  const fromEmail = toText(session?.email).split('@')[0] || ''
  const byKey = new Map((workers || []).map((item) => [normalizeKey(item?.login), toText(item?.login)]))
  const canonical =
    byKey.get(normalizeKey(fromSession)) ||
    byKey.get(normalizeKey(fromEmail)) ||
    byKey.get(normalizeKey(toText(session?.login)))

  return toText(canonical || fromSession || fromEmail)
}

function selectWorkerScopedWorkdays(workdayRows, workerLogin) {
  const key = normalizeKey(workerLogin)
  return workdayRows
    .map((row) => normalizeWorkday(row))
    .filter((row) => normalizeKey(row.workerLogin) === key)
}

function selectWorkerScopedEvents(eventRows, workerLogin, zoneById, workerWorkdayIds = new Set()) {
  const key = normalizeKey(workerLogin)
  return eventRows
    .map((row) => normalizeEvent(row, zoneById))
    .filter((row) => {
      const byWorkerLogin = key && normalizeKey(row.workerLogin) === key
      const byWorkday = toText(row.workdayId) && workerWorkdayIds.has(toText(row.workdayId))
      return Boolean(byWorkerLogin || byWorkday)
    })
}

async function closeEndingIfDue(session, workday) {
  const status = toUpper(workday?.status)
  if (status !== 'ENDING') {
    return workday
  }

  const endAt = parseIso(workday?.endAt)
  if (!endAt) {
    return workday
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
    workerType: toText(row.workerType || 'Pracownik'),
    email: toText(row.loginEmail || row.email),
  }))
  const worker = pickBestWorker(workers, session)
  const workerLogin = resolveWorkerLogin(worker, session, workers)
  const workerName = toText(worker?.fullName || session?.workerName || workerLogin)

  const zones = normalizeZones(data.zoneRows, data.clientRows)
  const zoneById = new Map(zones.map((zone) => [zone.id, zone]))
  const workdays = selectWorkerScopedWorkdays(data.workdayRows, workerLogin)
  const workerWorkdayIds = new Set(workdays.map((row) => toText(row.workdayId)).filter(Boolean))
  let activeWorkday = pickActiveWorkday(workdays)

  if (activeWorkday) {
    activeWorkday = await closeEndingIfDue({ ...session, orgId }, activeWorkday)
  }

  const events = selectWorkerScopedEvents(data.eventRows, workerLogin, zoneById, workerWorkdayIds)
  const activeCycle = pickActiveCycle(events, activeWorkday?.workdayId)
  const summary = summaryFromWorkdays(workdays, activeWorkday)

  return {
    orgId,
    worker: {
      login: workerLogin,
      name: workerName,
      type: toText(worker?.workerType || 'Pracownik'),
    },
    zones,
    stopRules: zones.filter((zone) => zone.kind === 'STOP').map((zone) => ({
      roomId: zone.id,
      graceMin: zone.stopGraceMin,
      label: zone.name || zone.id,
    })),
    startZone: zones.find((zone) => zone.kind === 'START') ?? null,
    activeWorkday,
    activeCycle,
    summary,
    workdayEvents: buildWorkdayEventFeed(workdays),
    workdays: [...workdays].sort(
      (a, b) => new Date(b.startAt || b.updatedAt || 0).getTime() - new Date(a.startAt || a.updatedAt || 0).getTime(),
    ),
    cycleHistory: buildCycleHistory(events),
  }
}

async function createWorkdayForScan(snapshot, startZone) {
  const startAt = nowIso()
  const workdayId = makeId('WD')
  await insertWorkdayForOrg({
    orgId: snapshot.orgId,
    workdayId,
    workerLogin: snapshot.worker.login,
    workerName: snapshot.worker.name || null,
    utilityRoomId: startZone?.id || null,
    startAt,
    endAt: null,
    durationSec: null,
    status: 'RUNNING',
    comment: null,
    updatedBy: snapshot.worker.login || null,
  })

  return {
    message: 'Rozpoczeto dzien pracy.',
    workdayId,
  }
}

async function closeWorkdayNow(snapshot, workday, stopZone) {
  const endAt = nowIso()
  const graceMin = Number(stopZone?.stopGraceMin ?? 0)

  if (graceMin > 0) {
    const plannedEndAt = new Date(Date.now() + graceMin * 60_000).toISOString()
    const durationSec = elapsedSec(workday.startAt, plannedEndAt)
    await updateWorkdayForOrg({
      orgId: snapshot.orgId,
      workdayId: workday.workdayId,
      workerLogin: workday.workerLogin,
      workerName: workday.workerName || null,
      utilityRoomId: workday.utilityRoomId || null,
      startAt: workday.startAt || null,
      endAt: plannedEndAt,
      durationSec,
      status: 'ENDING',
      comment: toText(workday.comment || `STOP ${stopZone.id}`) || null,
      updatedBy: snapshot.worker.login || null,
    })

    return `Zeskanowano STOP${graceMin}. Dzien przechodzi w ENDING na ${graceMin} min.`
  }

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
    comment: toText(workday.comment || `STOP ${stopZone.id}`) || null,
    updatedBy: snapshot.worker.login || null,
  })

  return 'Zakonczono dzien pracy.'
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

async function startCycle(snapshot, zone) {
  const eventId = makeId('EV')
  try {
    await runMutationOperation('InsertEventForOrg', {
      orgId: snapshot.orgId,
      eventId,
      zoneId: zone.id || null,
      workerLogin: snapshot.worker.login || null,
      startAt: nowIso(),
      endAt: null,
      durationSec: null,
      status: 'RUNNING',
      closeMarkedAt: null,
      endReason: null,
      comment: null,
      deviceId: null,
      startEventId: null,
      endEventId: null,
    })
  } catch (error) {
    if (!operationMissing(error, 'InsertEventForOrg')) {
      throw error
    }

    throw new Error('Brak operacji InsertEventForOrg w Data Connect. Wdroz dataconnect (firebase deploy --only dataconnect).')
  }
}

async function stopCycle(snapshot, cycle, reason, commentValue) {
  const endAt = nowIso()
  const durationSec = elapsedSec(cycle.startAt, endAt)

  try {
    await runMutationOperation('UpdateEventForOrg', {
      orgId: snapshot.orgId,
      eventId: cycle.eventId,
      zoneId: cycle.zoneId || null,
      workerLogin: cycle.workerLogin || snapshot.worker.login || null,
      startAt: cycle.startAt || null,
      endAt,
      durationSec,
      status: 'CLOSED',
      closeMarkedAt: endAt,
      endReason: reason || 'CYCLE_STOP',
      comment: toText(commentValue || cycle.comment) || null,
      deviceId: null,
      startEventId: null,
      endEventId: null,
    })
  } catch (error) {
    if (!operationMissing(error, 'UpdateEventForOrg')) {
      throw error
    }

    throw new Error('Brak operacji UpdateEventForOrg w Data Connect. Wdroz dataconnect (firebase deploy --only dataconnect).')
  }
}

export async function scanMobileQr({ session, snapshot, qrCode, comment }) {
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
  const workdayOpen = isWorkdayOpen(activeWorkday)

  if (zone.kind === 'START') {
    if (workdayOpen) {
      return {
        message: 'Dzien pracy jest juz aktywny.',
        snapshot: await getMobileSnapshot(session),
      }
    }

    await createWorkdayForScan(snapshot, zone)
    return {
      message: 'Rozpoczeto dzien pracy (START).',
      snapshot: await getMobileSnapshot(session),
    }
  }

  if (zone.kind === 'STOP') {
    if (!workdayOpen) {
      throw new Error('Brak aktywnego dnia. Najpierw zeskanuj START.')
    }

    if (activeCycle && isEventOpen(activeCycle)) {
      await stopCycle(snapshot, activeCycle, 'STOP_END_DAY', comment)
    }

    const stopMessage = await closeWorkdayNow(snapshot, activeWorkday, zone)
    return {
      message: stopMessage,
      snapshot: await getMobileSnapshot(session),
    }
  }

  if (!workdayOpen) {
    if (zone.kind === 'INDIVIDUAL') {
      await createWorkdayForScan(snapshot, zone)
      await startCycle(snapshot, zone)
      return {
        message: 'Rozpoczeto dzien i zlecenie indywidualne.',
        snapshot: await getMobileSnapshot(session),
      }
    }

    throw new Error('Brak aktywnego dnia. Zeskanuj START lub kod indywidualny.')
  }

  if (toUpper(activeWorkday?.status) === 'ENDING') {
    await setWorkdayRunning(snapshot, activeWorkday)
  }

  if (activeCycle && isEventOpen(activeCycle)) {
    if (normalizeKey(activeCycle.zoneId) === normalizeKey(zone.id)) {
      await stopCycle(snapshot, activeCycle, 'QR_SAME', comment)
      return {
        message: 'Zakonczono sprzatanie tej strefy.',
        snapshot: await getMobileSnapshot(session),
      }
    }

    await stopCycle(snapshot, activeCycle, 'QR_SWITCH', comment)
    await startCycle(snapshot, zone)
    return {
      message: `Zmiana strefy na: ${zone.name || zone.id}.`,
      snapshot: await getMobileSnapshot(session),
    }
  }

  await startCycle(snapshot, zone)
  return {
    message: `Rozpoczeto sprzatanie: ${zone.name || zone.id}.`,
    snapshot: await getMobileSnapshot(session),
  }
}
