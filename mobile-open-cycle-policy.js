'use strict'

const MOBILE_OPEN_CYCLE_ERROR = Object.freeze({
  MULTIPLE_OPEN: 'MULTIPLE_OPEN_CLEAN_EVENTS',
  OTHER_WORKDAY: 'OPEN_CLEAN_FROM_ANOTHER_WORKDAY',
  UNRESOLVED_LEGACY: 'UNRESOLVED_LEGACY_OPEN_EVENT',
})

function text(value) {
  return String(value ?? '').trim()
}

function eventId(row = {}) {
  return text(row.event_id ?? row.eventId ?? row.id)
}

function workdayId(row = {}) {
  return text(row.workday_id ?? row.workdayId)
}

function uniqueOpenCycles(rows = []) {
  const unique = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object') continue
    const id = eventId(row)
    if (!id || unique.has(id)) continue
    unique.set(id, row)
  }
  return [...unique.values()]
}

function openCycleConflictError(code, rows = []) {
  const error = new Error(code)
  error.statusCode = 409
  error.publicCode = code
  error.publicMessage =
    code === MOBILE_OPEN_CYCLE_ERROR.MULTIPLE_OPEN
      ? 'Wykryto kilka otwartych statusow CLEAN. Koordynator musi je sprawdzic przed kolejnym skanem.'
      : code === MOBILE_OPEN_CYCLE_ERROR.UNRESOLVED_LEGACY
        ? 'Wykryto otwarty wpis bez typu zdarzenia. Koordynator musi zweryfikowac jego powiazanie z dniem pracy.'
        : 'Poprzedni status CLEAN nadal jest otwarty w innym dniu pracy. Koordynator musi uzupelnic STOP.'
  error.publicDetails = {
    openCount: rows.length,
    eventIds: rows.map(eventId).filter(Boolean),
    workdayIds: [...new Set(rows.map(workdayId).filter(Boolean))],
  }
  return error
}

function assertNoUnresolvedOpenEvents(rows = []) {
  const unresolved = uniqueOpenCycles(rows)
  if (unresolved.length) {
    throw openCycleConflictError(MOBILE_OPEN_CYCLE_ERROR.UNRESOLVED_LEGACY, unresolved)
  }
}

function resolveSingleOpenCycle(rows = [], activeWorkdayId = '') {
  const openCycles = uniqueOpenCycles(rows)
  if (openCycles.length > 1) {
    throw openCycleConflictError(MOBILE_OPEN_CYCLE_ERROR.MULTIPLE_OPEN, openCycles)
  }

  const activeCycle = openCycles[0] ?? null
  if (!activeCycle) {
    return null
  }

  const normalizedActiveWorkdayId = text(activeWorkdayId)
  if (!normalizedActiveWorkdayId || workdayId(activeCycle) !== normalizedActiveWorkdayId) {
    throw openCycleConflictError(MOBILE_OPEN_CYCLE_ERROR.OTHER_WORKDAY, openCycles)
  }
  return activeCycle
}

module.exports = {
  MOBILE_OPEN_CYCLE_ERROR,
  assertNoUnresolvedOpenEvents,
  resolveSingleOpenCycle,
  uniqueOpenCycles,
}
