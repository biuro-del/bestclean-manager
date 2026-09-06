'use strict'

const crypto = require('node:crypto')

const WORKFORCE_SCHEDULE_MAX_RANGE_DAYS = 93
const WORKFORCE_SCHEDULE_MAX_PUBLICATION_ITEMS = 500
const WORKFORCE_SCHEDULE_MAX_ASSIGNEES = 100
const WORKFORCE_SCHEDULE_MAX_INSTRUCTIONS = 50
const WORKFORCE_SCHEDULE_INTERNAL_EFFECTS = Object.freeze({
  delivery: false,
  notifications: false,
  downstream: false,
})

class WorkforceScheduleError extends Error {
  constructor(statusCode, code, message, details = undefined) {
    super(message)
    this.name = 'WorkforceScheduleError'
    this.statusCode = statusCode
    this.code = code
    this.publicCode = code
    this.publicMessage = message
    this.details = details
    this.publicDetails = details
  }
}

function fail(statusCode, code, message, details) {
  throw new WorkforceScheduleError(statusCode, code, message, details)
}

function text(value) {
  return String(value ?? '').trim()
}

function identifier(value, field, maxLength = 128) {
  const normalized = text(value)
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001f\u007f]/.test(normalized)) {
    fail(400, 'WORKFORCE_SCHEDULE_VALIDATION_ERROR', `Niepoprawne pole: ${field}.`, { field })
  }
  return normalized
}

function optionalText(value, maxLength = 2000) {
  const normalized = text(value)
  if (!normalized) return ''
  if (normalized.length > maxLength || /[\u0000\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)) {
    fail(400, 'WORKFORCE_SCHEDULE_VALIDATION_ERROR', 'Tekst jest zbyt długi albo zawiera niedozwolone znaki.')
  }
  return normalized
}

function isoDate(value, field = 'date') {
  const normalized = text(value)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized)
  if (!match) fail(400, 'WORKFORCE_SCHEDULE_INVALID_DATE', `Pole ${field} musi mieć format RRRR-MM-DD.`, { field })
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12))
  if (parsed.toISOString().slice(0, 10) !== normalized) {
    fail(400, 'WORKFORCE_SCHEDULE_INVALID_DATE', `Pole ${field} zawiera nieistniejącą datę.`, { field })
  }
  return normalized
}

function localTime(value, field = 'time') {
  const normalized = text(value)
  const match = /^(\d{2}):(\d{2})$/.exec(normalized)
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    fail(400, 'WORKFORCE_SCHEDULE_INVALID_TIME', `Pole ${field} musi mieć format GG:MM.`, { field })
  }
  return normalized
}

function integer(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER, required = true } = {}) {
  if ((value === '' || value === null || value === undefined) && !required) return null
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    fail(400, 'WORKFORCE_SCHEDULE_VALIDATION_ERROR', `Niepoprawne pole: ${field}.`, { field })
  }
  return parsed
}

function normalizeInternalEffects(value) {
  const requiredKeys = Object.keys(WORKFORCE_SCHEDULE_INTERNAL_EFFECTS).sort()
  const providedKeys = value && typeof value === 'object' && !Array.isArray(value)
    ? Object.keys(value).sort()
    : []
  if (providedKeys.length !== requiredKeys.length || providedKeys.some((key, index) => key !== requiredKeys[index])) {
    fail(
      400,
      'WORKFORCE_SCHEDULE_INTERNAL_EFFECTS_REQUIRED',
      'Operacja Grafiku wymaga jawnego potwierdzenia braku dostarczania, powiadomień i efektów downstream.',
      { expected: WORKFORCE_SCHEDULE_INTERNAL_EFFECTS },
    )
  }
  for (const key of requiredKeys) {
    if (value[key] !== false) {
      fail(
        409,
        'WORKFORCE_SCHEDULE_EXTERNAL_EFFECTS_FORBIDDEN',
        'Grafik działa obecnie wyłącznie wewnętrznie i nie może wywoływać efektów w innych modułach.',
        { field: `effects.${key}`, expected: false },
      )
    }
  }
  return { ...WORKFORCE_SCHEDULE_INTERNAL_EFFECTS }
}

function normalizeIanaTimeZone(value) {
  const timeZone = identifier(value, 'timeZone', 64)
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date(0))
  } catch {
    fail(400, 'WORKFORCE_SCHEDULE_INVALID_TIME_ZONE', 'Podaj poprawną strefę czasową IANA, np. Europe/Warsaw.')
  }
  if (!/^[A-Za-z_]+\/[A-Za-z0-9_.+-]+(?:\/[A-Za-z0-9_.+-]+)*$/.test(timeZone) || /^Etc\//i.test(timeZone)) {
    fail(400, 'WORKFORCE_SCHEDULE_INVALID_TIME_ZONE', 'Wybierz regionalną strefę czasową IANA zamiast technicznego skrótu.')
  }
  return timeZone
}

function dateParts(value) {
  return isoDate(value).split('-').map(Number)
}

function timeParts(value) {
  return localTime(value).split(':').map(Number)
}

function localPartsAt(instantMs, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instantMs))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return [Number(values.year), Number(values.month), Number(values.day), Number(values.hour), Number(values.minute)]
}

function sameParts(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function addLocalDays(date, days) {
  const [year, month, day] = dateParts(date)
  return new Date(Date.UTC(year, month - 1, day + days, 12)).toISOString().slice(0, 10)
}

function zonedDateTimeCandidates(date, time, timeZoneValue) {
  const timeZone = normalizeIanaTimeZone(timeZoneValue)
  const [year, month, day] = dateParts(date)
  const [hour, minute] = timeParts(time)
  const target = [year, month, day, hour, minute]
  const naiveMs = Date.UTC(year, month - 1, day, hour, minute)
  const offsets = new Set()

  for (let deltaMinutes = -36 * 60; deltaMinutes <= 36 * 60; deltaMinutes += 30) {
    const sampleMs = naiveMs + deltaMinutes * 60_000
    const sampleParts = localPartsAt(sampleMs, timeZone)
    offsets.add(Date.UTC(sampleParts[0], sampleParts[1] - 1, sampleParts[2], sampleParts[3], sampleParts[4]) - sampleMs)
  }

  const candidates = []
  for (const offset of offsets) {
    const candidateMs = naiveMs - offset
    if (sameParts(localPartsAt(candidateMs, timeZone), target)) candidates.push(candidateMs)
  }
  return [...new Set(candidates)].sort((left, right) => left - right)
}

function resolveZonedInstant(date, time, timeZone, field) {
  const candidates = zonedDateTimeCandidates(date, time, timeZone)
  if (candidates.length === 0) {
    fail(400, 'WORKFORCE_SCHEDULE_DST_GAP', `Godzina ${field} nie istnieje w wybranej strefie czasowej.`, { date, time, timeZone, field })
  }
  if (candidates.length > 1) {
    fail(400, 'WORKFORCE_SCHEDULE_DST_AMBIGUOUS', `Godzina ${field} występuje dwukrotnie po zmianie czasu. Wybierz inną godzinę.`, { date, time, timeZone, field })
  }
  return new Date(candidates[0]).toISOString()
}

function grossShiftMinutes(startTimeValue, endTimeValue) {
  const [startHour, startMinute] = timeParts(startTimeValue)
  const [endHour, endMinute] = timeParts(endTimeValue)
  const start = startHour * 60 + startMinute
  let end = endHour * 60 + endMinute
  if (end < start) end += 24 * 60
  return end - start
}

function resolveShiftInterval({ date, startTime, endTime, timeZone }) {
  const normalizedDate = isoDate(date)
  const normalizedStart = localTime(startTime, 'startTime')
  const normalizedEnd = localTime(endTime, 'endTime')
  const normalizedZone = normalizeIanaTimeZone(timeZone)
  if (normalizedEnd === normalizedStart) {
    fail(400, 'WORKFORCE_SCHEDULE_INVALID_INTERVAL', 'Początek i koniec zmiany nie mogą wskazywać tej samej godziny.')
  }
  const endDate = normalizedEnd < normalizedStart ? addLocalDays(normalizedDate, 1) : normalizedDate
  const startsAt = resolveZonedInstant(normalizedDate, normalizedStart, normalizedZone, 'startTime')
  const endsAt = resolveZonedInstant(endDate, normalizedEnd, normalizedZone, 'endTime')
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    fail(400, 'WORKFORCE_SCHEDULE_INVALID_INTERVAL', 'Koniec zmiany musi wypadać po jej rozpoczęciu.')
  }
  return { date: normalizedDate, startTime: normalizedStart, endTime: normalizedEnd, timeZone: normalizedZone, startsAt, endsAt }
}

function normalizeIdList(values, field, maxItems = WORKFORCE_SCHEDULE_MAX_ASSIGNEES) {
  if (!Array.isArray(values)) fail(400, 'WORKFORCE_SCHEDULE_VALIDATION_ERROR', `Pole ${field} musi być listą.`, { field })
  if (values.length > maxItems) fail(400, 'WORKFORCE_SCHEDULE_VALIDATION_ERROR', `Pole ${field} zawiera zbyt wiele pozycji.`, { field })
  const normalized = values.map((value) => identifier(value, `${field}[]`, 128))
  if (new Set(normalized).size !== normalized.length) {
    fail(400, 'WORKFORCE_SCHEDULE_VALIDATION_ERROR', `Pole ${field} zawiera duplikaty.`, { field })
  }
  return normalized
}

function normalizeInstructions(values) {
  if (values === undefined) return []
  if (!Array.isArray(values) || values.length > WORKFORCE_SCHEDULE_MAX_INSTRUCTIONS) {
    fail(400, 'WORKFORCE_SCHEDULE_VALIDATION_ERROR', 'Lista instrukcji zmiany jest niepoprawna.')
  }
  return values.map((value, index) => ({ position: index + 1, text: identifier(value, `instructions[${index}]`, 500) }))
}

function normalizeShiftInput(value, timeZone) {
  const date = isoDate(value?.date)
  const startTime = localTime(value?.startTime, 'startTime')
  const endTime = localTime(value?.endTime, 'endTime')
  const breakMinutes = integer(value?.breakMinutes, 'breakMinutes', { min: 0, max: 24 * 60 })
  const interval = resolveShiftInterval({ date, startTime, endTime, timeZone })
  const elapsedMinutes = Math.round((new Date(interval.endsAt).getTime() - new Date(interval.startsAt).getTime()) / 60_000)
  if (breakMinutes >= elapsedMinutes) {
    fail(400, 'WORKFORCE_SCHEDULE_INVALID_BREAK', 'Przerwa musi być krótsza od całej zmiany.')
  }
  return {
    shiftId: value?.shiftId ? identifier(value.shiftId, 'shiftId', 96) : '',
    expectedVersion: integer(value?.expectedVersion, 'expectedVersion', { min: 0 }),
    title: identifier(value?.title, 'title', 180),
    date,
    startTime,
    endTime,
    ...interval,
    breakMinutes,
    requiredHeadcount: integer(value?.requiredHeadcount, 'requiredHeadcount', { min: 1, max: 100 }),
    locationId: identifier(value?.locationId, 'locationId', 96),
    notes: optionalText(value?.notes, 4000),
    personIds: normalizeIdList(value?.personIds ?? [], 'personIds'),
    instructions: normalizeInstructions(value?.instructions),
  }
}

function parseDateRange(fromValue, toValue, maxDays = WORKFORCE_SCHEDULE_MAX_RANGE_DAYS) {
  const from = isoDate(fromValue, 'from')
  const to = isoDate(toValue, 'to')
  const fromMs = Date.parse(`${from}T12:00:00.000Z`)
  const toMs = Date.parse(`${to}T12:00:00.000Z`)
  const days = Math.round((toMs - fromMs) / 86_400_000) + 1
  if (days < 1 || days > maxDays) {
    fail(400, 'WORKFORCE_SCHEDULE_INVALID_RANGE', `Zakres musi obejmować od 1 do ${maxDays} dni.`)
  }
  return { from, to, days }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
  }
  return value
}

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')
}

function normalizeExpectedVersions(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > WORKFORCE_SCHEDULE_MAX_PUBLICATION_ITEMS) {
    fail(400, 'WORKFORCE_SCHEDULE_INVALID_VERSIONS', `Podaj od 1 do ${WORKFORCE_SCHEDULE_MAX_PUBLICATION_ITEMS} dokładnych wersji zmian.`)
  }
  const rows = value.map((row) => ({
    shiftId: identifier(row?.shiftId, 'expectedVersions[].shiftId', 96),
    version: integer(row?.version, 'expectedVersions[].version', { min: 1 }),
  }))
  if (new Set(rows.map((row) => row.shiftId)).size !== rows.length) {
    fail(400, 'WORKFORCE_SCHEDULE_INVALID_VERSIONS', 'Lista wersji zmian zawiera duplikaty.')
  }
  return rows.sort((left, right) => left.shiftId.localeCompare(right.shiftId, 'en'))
}

function normalizeCommand(value) {
  const type = identifier(value?.type, 'type', 48).toUpperCase()
  const orgId = identifier(value?.orgId, 'orgId', 64)
  const idempotencyKey = identifier(value?.idempotencyKey, 'idempotencyKey', 128)
  const effects = normalizeInternalEffects(value?.effects)
  const payload = value?.payload && typeof value.payload === 'object' && !Array.isArray(value.payload) ? value.payload : {}
  return { type, orgId, idempotencyKey, effects, payload, requestHash: stableHash({ type, orgId, effects, payload }) }
}

function normalizePublication(value) {
  const orgId = identifier(value?.orgId, 'orgId', 64)
  const idempotencyKey = identifier(value?.idempotencyKey, 'idempotencyKey', 128)
  const effects = normalizeInternalEffects(value?.effects)
  const range = parseDateRange(value?.from, value?.to)
  const expectedVersions = normalizeExpectedVersions(value?.expectedVersions)
  const warningFingerprint = text(value?.warningFingerprint)
  if (warningFingerprint && !/^[a-f0-9]{64}$/.test(warningFingerprint)) {
    fail(400, 'WORKFORCE_SCHEDULE_INVALID_WARNING_FINGERPRINT', 'Potwierdzenie ostrzeżeń jest niepoprawne.')
  }
  const payload = { ...range, expectedVersions, warningFingerprint }
  return { orgId, idempotencyKey, effects, ...payload, requestHash: stableHash({ type: 'PUBLISH_INTERNAL', orgId, effects, payload }) }
}

function classifyPublicationConflicts(value = []) {
  const blockingTypes = new Set([
    'OVERLAP',
    'INACTIVE_PERSON',
    'MISSING_PERSON',
    'MISSING_LOCATION',
    'INVALID_INTERVAL',
    'DST_GAP',
    'DST_AMBIGUOUS',
    'CAPACITY_EXCEEDED',
  ])
  const warningTypes = new Set(['UNDERSTAFFED', 'OVERSTAFFED', 'WEEKLY_LIMIT'])
  const normalized = (Array.isArray(value) ? value : []).map((item) => {
    const type = text(item?.type).toUpperCase()
    const details = item?.details && typeof item.details === 'object' ? canonicalize(item.details) : {}
    const presentation = {
      UNDERSTAFFED: {
        label: 'Niepełna obsada',
        message: `Przypisano ${Number(details.assigned ?? 0)} z wymaganych ${Number(details.required ?? 0)} osób.`,
      },
      OVERSTAFFED: {
        label: 'Obsada ponad plan',
        message: `Przypisano ${Number(details.assigned ?? 0)} osób przy planie ${Number(details.required ?? 0)}.`,
      },
      WEEKLY_LIMIT: {
        label: 'Przekroczony limit tygodniowy',
        message: `Zaplanowano ${Number(details.minutes ?? 0)} min przy limicie ${Number(details.limitMinutes ?? 0)} min.`,
      },
    }[type] || {
      label: 'Konflikt Grafiku',
      message: 'Grafik zawiera konflikt wymagający sprawdzenia.',
    }
    return {
      type,
      code: type,
      label: presentation.label,
      message: presentation.message,
      shiftId: text(item?.shiftId),
      personId: text(item?.personId),
      details,
    }
  }).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right), 'en'))
  const blocking = normalized.filter((item) => blockingTypes.has(item.type) || !warningTypes.has(item.type))
  const warnings = normalized.filter((item) => warningTypes.has(item.type))
  return { blocking, warnings, warningFingerprint: warnings.length ? stableHash(warnings) : '' }
}

function intervalsOverlap(first, second) {
  const firstStart = new Date(first?.startsAt).getTime()
  const firstEnd = new Date(first?.endsAt).getTime()
  const secondStart = new Date(second?.startsAt).getTime()
  const secondEnd = new Date(second?.endsAt).getTime()
  if (![firstStart, firstEnd, secondStart, secondEnd].every(Number.isFinite)) return false
  return firstStart < secondEnd && secondStart < firstEnd
}

module.exports = {
  WORKFORCE_SCHEDULE_INTERNAL_EFFECTS,
  WORKFORCE_SCHEDULE_MAX_PUBLICATION_ITEMS,
  WORKFORCE_SCHEDULE_MAX_RANGE_DAYS,
  WorkforceScheduleError,
  classifyPublicationConflicts,
  grossShiftMinutes,
  identifier,
  intervalsOverlap,
  normalizeCommand,
  normalizeExpectedVersions,
  normalizeIanaTimeZone,
  normalizeInternalEffects,
  normalizePublication,
  normalizeShiftInput,
  optionalText,
  parseDateRange,
  resolveShiftInterval,
  stableHash,
  text,
  zonedDateTimeCandidates,
}
