'use strict'

const { WorkforceScheduleError } = require('./workforce-schedule-policy')

const WORKFORCE_SCHEDULE_RECURRENCE_MIN_INTERVAL = 1
const WORKFORCE_SCHEDULE_RECURRENCE_MAX_INTERVAL = 30
const WORKFORCE_SCHEDULE_RECURRENCE_MIN_COUNT = 1
const WORKFORCE_SCHEDULE_RECURRENCE_MAX_COUNT = 366
const WORKFORCE_SCHEDULE_RECURRENCE_MAX_HORIZON_DAYS = 3660

const INVALID_RECURRENCE_CODE = 'WORKFORCE_SCHEDULE_INVALID_RECURRENCE'
const RECURRENCE_LIMIT_CODE = 'RECURRENCE_LIMIT'
const DAY_MS = 86_400_000

function fail(code, message, details) {
  throw new WorkforceScheduleError(400, code, message, details)
}

function invalid(message, details) {
  fail(INVALID_RECURRENCE_CODE, message, details)
}

function limit(message, details) {
  fail(RECURRENCE_LIMIT_CODE, message, details)
}

function record(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid(`Pole ${field} musi być obiektem.`, { field })
  }
  return value
}

function rejectUnknownKeys(value, allowedKeys, field) {
  const unknownFields = Object.keys(value).filter((key) => !allowedKeys.has(key)).sort()
  if (unknownFields.length) {
    invalid(`Pole ${field} zawiera nieobsługiwane wartości.`, { field, unknownFields })
  }
}

function enumValue(value, allowed, field) {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (!allowed.has(normalized)) {
    invalid(`Pole ${field} ma nieobsługiwaną wartość.`, { field })
  }
  return normalized
}

function integer(value, field, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    invalid(`Pole ${field} musi być liczbą całkowitą od ${min} do ${max}.`, { field, min, max })
  }
  return value
}

function parseIsoDate(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    invalid(`Pole ${field} musi być datą ISO YYYY-MM-DD.`, { field })
  }
  const timestamp = Date.parse(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    invalid(`Pole ${field} musi być prawidłową datą.`, { field })
  }
  const date = new Date(timestamp)
  return {
    day: date.getUTCDate(),
    iso: value,
    month: date.getUTCMonth() + 1,
    timestamp,
    year: date.getUTCFullYear(),
  }
}

function isoDateFromTimestamp(timestamp) {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() > 9999) {
    limit('Zakres powtarzalności wykracza poza obsługiwany zakres dat ISO.', {
      maxDate: '9999-12-31',
    })
  }
  return date.toISOString().slice(0, 10)
}

function isoWeekday(timestamp) {
  const weekday = new Date(timestamp).getUTCDay()
  return weekday === 0 ? 7 : weekday
}

function daysInMonth(year, month) {
  const date = new Date(0)
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCFullYear(year, month, 0)
  return date.getUTCDate()
}

function normalizeEnds(value, start) {
  const ends = record(value, 'ends')
  rejectUnknownKeys(ends, new Set(['type', 'count', 'until']), 'ends')
  const type = enumValue(ends.type, new Set(['COUNT', 'UNTIL']), 'ends.type')

  if (type === 'COUNT') {
    if (Object.hasOwn(ends, 'until')) {
      invalid('Kończenie COUNT nie może zawierać daty until.', { field: 'ends.until' })
    }
    return {
      type,
      count: integer(
        ends.count,
        'ends.count',
        WORKFORCE_SCHEDULE_RECURRENCE_MIN_COUNT,
        WORKFORCE_SCHEDULE_RECURRENCE_MAX_COUNT,
      ),
    }
  }

  if (Object.hasOwn(ends, 'count')) {
    invalid('Kończenie UNTIL nie może zawierać liczby count.', { field: 'ends.count' })
  }
  const until = parseIsoDate(ends.until, 'ends.until')
  const horizonDays = Math.round((until.timestamp - start.timestamp) / DAY_MS)
  if (horizonDays < 0) {
    invalid('Data końcowa nie może być wcześniejsza od daty początkowej.', { field: 'ends.until' })
  }
  if (horizonDays > WORKFORCE_SCHEDULE_RECURRENCE_MAX_HORIZON_DAYS) {
    limit(`Zakres powtarzalności nie może przekraczać ${WORKFORCE_SCHEDULE_RECURRENCE_MAX_HORIZON_DAYS} dni.`, {
      field: 'ends.until',
      maxHorizonDays: WORKFORCE_SCHEDULE_RECURRENCE_MAX_HORIZON_DAYS,
    })
  }
  return { type, until: until.iso }
}

function normalizeMonthlyPattern(value) {
  const pattern = record(value, 'pattern')
  rejectUnknownKeys(pattern, new Set(['type', 'day', 'ordinal', 'weekday']), 'pattern')
  const type = enumValue(pattern.type, new Set(['DAY_OF_MONTH', 'NTH_WEEKDAY', 'LAST_DAY']), 'pattern.type')

  if (type === 'DAY_OF_MONTH') {
    if (Object.hasOwn(pattern, 'ordinal') || Object.hasOwn(pattern, 'weekday')) {
      invalid('Wzorzec DAY_OF_MONTH przyjmuje wyłącznie pole day.', { field: 'pattern' })
    }
    return { type, day: integer(pattern.day, 'pattern.day', 1, 31) }
  }

  if (type === 'NTH_WEEKDAY') {
    if (Object.hasOwn(pattern, 'day')) {
      invalid('Wzorzec NTH_WEEKDAY nie przyjmuje pola day.', { field: 'pattern.day' })
    }
    const ordinal = pattern.ordinal
    if (!Number.isInteger(ordinal) || ![1, 2, 3, 4, -1].includes(ordinal)) {
      invalid('Pole pattern.ordinal musi mieć wartość 1, 2, 3, 4 albo -1.', { field: 'pattern.ordinal' })
    }
    return {
      type,
      ordinal,
      weekday: integer(pattern.weekday, 'pattern.weekday', 1, 7),
    }
  }

  if (Object.hasOwn(pattern, 'day') || Object.hasOwn(pattern, 'ordinal') || Object.hasOwn(pattern, 'weekday')) {
    invalid('Wzorzec LAST_DAY nie przyjmuje dodatkowych pól.', { field: 'pattern' })
  }
  return { type }
}

function normalizeWeekdays(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 7) {
    invalid('Pole weekdays musi zawierać od 1 do 7 dni tygodnia.', { field: 'weekdays' })
  }
  const weekdays = value.map((weekday, index) => integer(weekday, `weekdays[${index}]`, 1, 7))
  return [...new Set(weekdays)].sort((left, right) => left - right)
}

function normalizeRecurrenceRule(value, startDate) {
  const start = parseIsoDate(startDate, 'startDate')
  const rule = record(value, 'rule')
  rejectUnknownKeys(rule, new Set(['frequency', 'interval', 'weekdays', 'pattern', 'ends']), 'rule')

  const frequency = enumValue(rule.frequency, new Set(['DAILY', 'WEEKLY', 'MONTHLY']), 'frequency')
  const intervalValue = integer(
    rule.interval,
    'interval',
    WORKFORCE_SCHEDULE_RECURRENCE_MIN_INTERVAL,
    WORKFORCE_SCHEDULE_RECURRENCE_MAX_INTERVAL,
  )
  const ends = normalizeEnds(rule.ends, start)

  if (frequency === 'DAILY') {
    if (Object.hasOwn(rule, 'weekdays') || Object.hasOwn(rule, 'pattern')) {
      invalid('Reguła DAILY nie przyjmuje weekdays ani pattern.', { field: 'rule' })
    }
    return { frequency, interval: intervalValue, ends }
  }

  if (frequency === 'WEEKLY') {
    if (Object.hasOwn(rule, 'pattern')) {
      invalid('Reguła WEEKLY nie przyjmuje pattern.', { field: 'pattern' })
    }
    return {
      frequency,
      interval: intervalValue,
      weekdays: normalizeWeekdays(rule.weekdays),
      ends,
    }
  }

  if (Object.hasOwn(rule, 'weekdays')) {
    invalid('Reguła MONTHLY nie przyjmuje weekdays.', { field: 'weekdays' })
  }
  return {
    frequency,
    interval: intervalValue,
    pattern: normalizeMonthlyPattern(rule.pattern),
    ends,
  }
}

function matchesMonthlyPattern(date, pattern) {
  if (pattern.type === 'DAY_OF_MONTH') return date.day === pattern.day
  if (pattern.type === 'LAST_DAY') return date.day === daysInMonth(date.year, date.month)

  const weekday = isoWeekday(date.timestamp)
  if (weekday !== pattern.weekday) return false
  if (pattern.ordinal === -1) {
    return date.day + 7 > daysInMonth(date.year, date.month)
  }
  return Math.floor((date.day - 1) / 7) + 1 === pattern.ordinal
}

function matchesRecurrenceDate(date, start, rule, weeklyAnchorTimestamp, monthlyAnchorIndex) {
  const elapsedDays = Math.round((date.timestamp - start.timestamp) / DAY_MS)
  if (rule.frequency === 'DAILY') return elapsedDays % rule.interval === 0

  if (rule.frequency === 'WEEKLY') {
    const elapsedWeeks = Math.floor((date.timestamp - weeklyAnchorTimestamp) / (7 * DAY_MS))
    return elapsedWeeks % rule.interval === 0 && rule.weekdays.includes(isoWeekday(date.timestamp))
  }

  const monthIndex = date.year * 12 + date.month - 1
  return (monthIndex - monthlyAnchorIndex) % rule.interval === 0
    && matchesMonthlyPattern(date, rule.pattern)
}

function expandRecurrenceDates(startDate, value) {
  const start = parseIsoDate(startDate, 'startDate')
  const rule = normalizeRecurrenceRule(value, start.iso)
  const requestedCount = rule.ends.type === 'COUNT' ? rule.ends.count : undefined
  const scanDays = rule.ends.type === 'UNTIL'
    ? Math.round((parseIsoDate(rule.ends.until, 'ends.until').timestamp - start.timestamp) / DAY_MS)
    : WORKFORCE_SCHEDULE_RECURRENCE_MAX_HORIZON_DAYS
  const weeklyAnchorTimestamp = start.timestamp - (isoWeekday(start.timestamp) - 1) * DAY_MS
  const monthlyAnchorIndex = start.year * 12 + start.month - 1
  const dates = []

  for (let offset = 0; offset <= scanDays; offset += 1) {
    const timestamp = start.timestamp + offset * DAY_MS
    const candidate = parseIsoDate(isoDateFromTimestamp(timestamp), 'candidateDate')
    if (!matchesRecurrenceDate(candidate, start, rule, weeklyAnchorTimestamp, monthlyAnchorIndex)) continue
    dates.push(candidate.iso)
    if (dates.length > WORKFORCE_SCHEDULE_RECURRENCE_MAX_COUNT) {
      limit(`Reguła nie może tworzyć więcej niż ${WORKFORCE_SCHEDULE_RECURRENCE_MAX_COUNT} wystąpień.`, {
        generatedCount: dates.length,
        maxCount: WORKFORCE_SCHEDULE_RECURRENCE_MAX_COUNT,
      })
    }
    if (requestedCount !== undefined && dates.length === requestedCount) return dates
  }

  if (requestedCount !== undefined && dates.length < requestedCount) {
    limit(`Nie można wygenerować wszystkich wystąpień w limicie ${WORKFORCE_SCHEDULE_RECURRENCE_MAX_HORIZON_DAYS} dni.`, {
      generatedCount: dates.length,
      maxHorizonDays: WORKFORCE_SCHEDULE_RECURRENCE_MAX_HORIZON_DAYS,
      requestedCount,
    })
  }

  return [...new Set(dates)].sort()
}

module.exports = {
  WORKFORCE_SCHEDULE_RECURRENCE_MAX_COUNT,
  WORKFORCE_SCHEDULE_RECURRENCE_MAX_HORIZON_DAYS,
  WORKFORCE_SCHEDULE_RECURRENCE_MAX_INTERVAL,
  WORKFORCE_SCHEDULE_RECURRENCE_MIN_COUNT,
  WORKFORCE_SCHEDULE_RECURRENCE_MIN_INTERVAL,
  expandRecurrenceDates,
  normalizeRecurrenceRule,
}
