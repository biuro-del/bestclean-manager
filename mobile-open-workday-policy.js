'use strict'

const MOBILE_OPEN_WORKDAY_ERROR = Object.freeze({
  MULTIPLE_OPEN: 'MULTIPLE_OPEN_WORKDAYS',
  OTHER_DAY: 'OPEN_WORKDAY_FROM_ANOTHER_DAY',
})

function text(value) {
  return String(value ?? '').trim()
}

function workdayId(row = {}) {
  return text(row.workday_id ?? row.workdayId ?? row.id)
}

function isTodayWarsaw(row = {}) {
  const value = row.is_today_warsaw ?? row.isTodayWarsaw
  const normalized = text(value).toLowerCase()
  return value === true || value === 1 || normalized === 'true' || normalized === 't' || normalized === '1'
}

function hasConfirmedWarsawDay(row = {}) {
  const value = row.is_today_warsaw ?? row.isTodayWarsaw
  const normalized = text(value).toLowerCase()
  return (
    value === true ||
    value === false ||
    value === 1 ||
    value === 0 ||
    normalized === 'true' ||
    normalized === 'false' ||
    normalized === 't' ||
    normalized === 'f' ||
    normalized === '1' ||
    normalized === '0'
  )
}

function uniqueOpenWorkdays(rows = []) {
  const unique = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object') continue
    const id = workdayId(row)
    if (!id || unique.has(id)) continue
    unique.set(id, row)
  }
  return [...unique.values()]
}

function openWorkdayConflictError(code, rows = []) {
  const error = new Error(code)
  error.statusCode = 409
  error.publicCode = code
  error.publicMessage =
    code === MOBILE_OPEN_WORKDAY_ERROR.MULTIPLE_OPEN
      ? 'Wykryto kilka otwartych dni pracy. Koordynator musi je sprawdzic przed kolejnym skanem.'
      : 'Nie mozna jednoznacznie ustalic daty otwartego dnia pracy w Warszawie. Koordynator musi go sprawdzic przed kolejnym skanem.'
  error.publicDetails = {
    openCount: rows.length,
    workdayIds: rows.map(workdayId).filter(Boolean),
    startedAt: rows.map((row) => text(row.start_at ?? row.startAt)).filter(Boolean),
  }
  return error
}

function resolveSingleOpenWorkday(rows = []) {
  const openWorkdays = uniqueOpenWorkdays(rows)
  const currentWarsawWorkdays = openWorkdays.filter(isTodayWarsaw)
  const ambiguousWarsawWorkdays = openWorkdays.filter((row) => !hasConfirmedWarsawDay(row))

  // Historical rows are retained for History and never closed or altered here.
  // They cannot block a current QR START. An undated/ambiguous open row remains
  // fail-closed because it could be a duplicate current day.
  if (ambiguousWarsawWorkdays.length > 0) {
    throw openWorkdayConflictError(
      MOBILE_OPEN_WORKDAY_ERROR.OTHER_DAY,
      [...currentWarsawWorkdays, ...ambiguousWarsawWorkdays],
    )
  }

  if (currentWarsawWorkdays.length > 1) {
    throw openWorkdayConflictError(MOBILE_OPEN_WORKDAY_ERROR.MULTIPLE_OPEN, currentWarsawWorkdays)
  }

  return currentWarsawWorkdays[0] ?? null
}

module.exports = {
  MOBILE_OPEN_WORKDAY_ERROR,
  resolveSingleOpenWorkday,
  uniqueOpenWorkdays,
}
