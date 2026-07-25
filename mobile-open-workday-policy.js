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
  return value === true || value === 1 || text(value).toLowerCase() === 't'
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
      : 'Poprzedni dzien pracy nadal jest otwarty. Koordynator musi uzupelnic STOP przed rozpoczeciem kolejnego dnia.'
  error.publicDetails = {
    openCount: rows.length,
    workdayIds: rows.map(workdayId).filter(Boolean),
    startedAt: rows.map((row) => text(row.start_at ?? row.startAt)).filter(Boolean),
  }
  return error
}

function resolveSingleOpenWorkday(rows = []) {
  const openWorkdays = uniqueOpenWorkdays(rows)
  if (openWorkdays.length > 1) {
    throw openWorkdayConflictError(MOBILE_OPEN_WORKDAY_ERROR.MULTIPLE_OPEN, openWorkdays)
  }

  const activeWorkday = openWorkdays[0] ?? null
  if (!activeWorkday) {
    return null
  }

  if (!isTodayWarsaw(activeWorkday)) {
    throw openWorkdayConflictError(MOBILE_OPEN_WORKDAY_ERROR.OTHER_DAY, openWorkdays)
  }
  return activeWorkday
}

module.exports = {
  MOBILE_OPEN_WORKDAY_ERROR,
  resolveSingleOpenWorkday,
  uniqueOpenWorkdays,
}
