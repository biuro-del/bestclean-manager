'use strict'

const MOBILE_OPEN_CYCLE_ERROR = Object.freeze({
  MULTIPLE_OPEN: 'MULTIPLE_OPEN_CLEAN_EVENTS',
  OTHER_WORKDAY: 'OPEN_CLEAN_FROM_ANOTHER_WORKDAY',
  INTEGRITY: 'OPEN_CLEAN_INTEGRITY_CONFLICT',
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
      ? 'Wykryto kilka otwartych statusow CLEAN w aktywnym dniu pracy. Koordynator musi je sprawdzic przed kolejnym skanem.'
      : code === MOBILE_OPEN_CYCLE_ERROR.UNRESOLVED_LEGACY
        ? 'Wykryto otwarty wpis bez typu zdarzenia. Koordynator musi zweryfikowac jego powiazanie z dniem pracy.'
        : code === MOBILE_OPEN_CYCLE_ERROR.INTEGRITY
          ? 'Nie mozna jednoznacznie powiazac otwartego statusu CLEAN z dniem pracy. Koordynator musi sprawdzic jego dane.'
        : 'Poprzedni status CLEAN nadal jest otwarty w innym dniu pracy. Koordynator musi uzupelnic STOP.'
  error.publicDetails = {
    openCount: rows.length,
    eventIds: rows.map(eventId).filter(Boolean),
    workdayIds: [...new Set(rows.map(workdayId).filter(Boolean))],
  }
  return error
}

function openCycleIntegrityError(issues = []) {
  const rows = issues.map((issue) => issue.row)
  const error = openCycleConflictError(MOBILE_OPEN_CYCLE_ERROR.INTEGRITY, rows)
  error.publicDetails.integrityIssues = issues.map((issue) => ({
    eventId: eventId(issue.row) || null,
    reason: issue.reason,
  }))
  return error
}

function assertNoUnresolvedOpenEvents(rows = []) {
  const unresolved = uniqueOpenCycles(rows)
  if (unresolved.length) {
    throw openCycleConflictError(MOBILE_OPEN_CYCLE_ERROR.UNRESOLVED_LEGACY, unresolved)
  }
}

function resolveOpenCycleState(rows = [], activeWorkdayId = '') {
  const openCycles = uniqueOpenCycles(rows)
  const normalizedActiveWorkdayId = text(activeWorkdayId)
  const activeCycles = []
  const staleCycles = []
  const integrityIssues = []

  for (const row of openCycles) {
    const rowWorkdayId = workdayId(row)
    if (!rowWorkdayId) {
      integrityIssues.push({ row, reason: 'MISSING_WORKDAY_ID' })
      continue
    }

    if (normalizedActiveWorkdayId && rowWorkdayId === normalizedActiveWorkdayId) {
      activeCycles.push(row)
    } else {
      staleCycles.push(row)
    }
  }

  if (integrityIssues.length) {
    throw openCycleIntegrityError(integrityIssues)
  }

  if (activeCycles.length > 1) {
    throw openCycleConflictError(MOBILE_OPEN_CYCLE_ERROR.MULTIPLE_OPEN, activeCycles)
  }

  return {
    activeCycle: activeCycles[0] ?? null,
    staleCycles,
  }
}

function resolveSingleOpenCycle(rows = [], activeWorkdayId = '') {
  return resolveOpenCycleState(rows, activeWorkdayId).activeCycle
}

module.exports = {
  MOBILE_OPEN_CYCLE_ERROR,
  assertNoUnresolvedOpenEvents,
  resolveOpenCycleState,
  resolveSingleOpenCycle,
  uniqueOpenCycles,
}
