'use strict'

const MOBILE_OPEN_WORKDAY_ERROR = Object.freeze({
  MULTIPLE_OPEN: 'MULTIPLE_OPEN_WORKDAYS',
  OTHER_DAY: 'OPEN_WORKDAY_FROM_ANOTHER_DAY',
  INTEGRITY: 'OPEN_WORKDAY_INTEGRITY_CONFLICT',
})

function text(value) {
  return String(value ?? '').trim()
}

function workdayId(row = {}) {
  return text(row.workday_id ?? row.workdayId ?? row.id)
}

function classifyWarsawDay(row = {}) {
  const businessDayRelation = text(
    row.business_day_relation ?? row.businessDayRelation,
  ).toUpperCase()
  if (['TODAY', 'PRIOR', 'FUTURE'].includes(businessDayRelation)) {
    return businessDayRelation
  }

  const value = row.is_today_warsaw ?? row.isTodayWarsaw
  const normalized = text(value).toLowerCase()
  if (value === true || value === 1 || ['1', 't', 'true'].includes(normalized)) {
    return 'TODAY'
  }
  if (value === false || value === 0 || ['0', 'f', 'false'].includes(normalized)) {
    return 'PRIOR'
  }
  return 'UNKNOWN'
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
      ? 'Wykryto kilka otwartych dni pracy z dzisiejsza data. Koordynator musi je sprawdzic przed kolejnym skanem.'
      : 'Nie mozna jednoznacznie okreslic daty otwartego dnia pracy. Koordynator musi sprawdzic jego dane.'
  error.publicDetails = {
    openCount: rows.length,
    workdayIds: rows.map(workdayId).filter(Boolean),
    startedAt: rows.map((row) => text(row.start_at ?? row.startAt)).filter(Boolean),
  }
  return error
}

function openWorkdayIntegrityError(issues = []) {
  const rows = issues.map((issue) => issue.row)
  const error = openWorkdayConflictError(MOBILE_OPEN_WORKDAY_ERROR.INTEGRITY, rows)
  error.publicDetails.integrityIssues = issues.map((issue) => ({
    workdayId: workdayId(issue.row) || null,
    reason: issue.reason,
  }))
  return error
}

function resolveOpenWorkdayState(rows = []) {
  const openWorkdays = uniqueOpenWorkdays(rows)
  const todayWorkdays = []
  const staleWorkdays = []
  const integrityIssues = []

  for (const row of openWorkdays) {
    if (!text(row.start_at ?? row.startAt)) {
      integrityIssues.push({ row, reason: 'MISSING_START_AT' })
      continue
    }

    const classification = classifyWarsawDay(row)
    if (classification === 'TODAY') {
      todayWorkdays.push(row)
    } else if (classification === 'PRIOR') {
      staleWorkdays.push(row)
    } else if (classification === 'FUTURE') {
      integrityIssues.push({ row, reason: 'FUTURE_START_AT' })
    } else {
      integrityIssues.push({ row, reason: 'UNKNOWN_TODAY_FLAG' })
    }
  }

  if (integrityIssues.length) {
    throw openWorkdayIntegrityError(integrityIssues)
  }

  if (todayWorkdays.length > 1) {
    throw openWorkdayConflictError(MOBILE_OPEN_WORKDAY_ERROR.MULTIPLE_OPEN, todayWorkdays)
  }

  return {
    activeWorkday: todayWorkdays[0] ?? null,
    staleWorkdays,
  }
}

function resolveSingleOpenWorkday(rows = []) {
  return resolveOpenWorkdayState(rows).activeWorkday
}

module.exports = {
  MOBILE_OPEN_WORKDAY_ERROR,
  resolveOpenWorkdayState,
  resolveSingleOpenWorkday,
  uniqueOpenWorkdays,
}
