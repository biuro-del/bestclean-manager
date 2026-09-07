import { dirtyShifts } from './scheduleModel.js'

function text(value) {
  return String(value ?? '').trim()
}

function positiveInteger(value) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0
}

function plainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function exactKeys(value, keys) {
  return plainObject(value)
    && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}

function catalogSelectable(value = {}) {
  const status = text(value.status).toUpperCase()
  if (value.selectable === false) return false
  return !status || status === 'ACTIVE'
}

function normalizeBootstrapCatalogSync(value) {
  if (!exactKeys(value, ['lastSyncedAt', 'locations', 'people'])) return null
  const timestamp = text(value.lastSyncedAt)
  const timestampMs = Date.parse(timestamp)
  if (!Number.isFinite(timestampMs) || new Date(timestampMs).toISOString() !== timestamp) return null
  if (!exactKeys(value.people, ['active', 'inactive']) || !exactKeys(value.locations, ['active', 'inactive'])) return null
  const people = {
    active: nonNegativeInteger(value.people.active),
    inactive: nonNegativeInteger(value.people.inactive),
  }
  const locations = {
    active: nonNegativeInteger(value.locations.active),
    inactive: nonNegativeInteger(value.locations.inactive),
  }
  if (Object.values(people).includes(null) || Object.values(locations).includes(null)) return null
  return { lastSyncedAt: timestamp, source: 'bootstrap', people, locations }
}

export function normalizeWorkforceScheduleShift(shift = {}) {
  const shiftId = text(shift.shiftId || shift.id)
  return {
    ...shift,
    id: shiftId,
    shiftId,
    assigneeIds: Array.isArray(shift.personIds)
      ? shift.personIds.map(text).filter(Boolean)
      : Array.isArray(shift.assigneeIds)
        ? shift.assigneeIds.map(text).filter(Boolean)
        : [],
    tasks: Array.isArray(shift.instructions)
      ? shift.instructions.map(text).filter(Boolean)
      : Array.isArray(shift.tasks)
        ? shift.tasks.map(text).filter(Boolean)
        : [],
    revision: positiveInteger(shift.revision),
    version: positiveInteger(shift.version),
  }
}

export function isConfirmedWorkforceScheduleShift(shift = {}) {
  const normalized = normalizeWorkforceScheduleShift(shift)
  return Boolean(normalized.id && normalized.revision > 0 && normalized.version > 0)
}

export function normalizeWorkforceScheduleSettings(settings) {
  if (!plainObject(settings)) return null
  const weeklyLimitMinutes = Number(settings.weeklyLimitMinutes)
  return {
    ...settings,
    orgId: text(settings.orgId),
    timeZone: text(settings.timeZone),
    weeklyLimitMinutes: Number.isSafeInteger(weeklyLimitMinutes) && weeklyLimitMinutes >= 1 && weeklyLimitMinutes <= 10080
      ? weeklyLimitMinutes
      : 0,
    version: positiveInteger(settings.version),
  }
}

export function isConfirmedWorkforceScheduleSettings(settings, expected = {}) {
  const normalized = normalizeWorkforceScheduleSettings(settings)
  const expectedVersion = Number(expected.expectedVersion)
  const weeklyLimitMinutes = Number(expected.weeklyLimitMinutes)
  return Boolean(
    normalized
    && normalized.orgId
    && normalized.orgId === text(expected.orgId)
    && normalized.timeZone
    && normalized.timeZone === text(expected.timeZone)
    && Number.isSafeInteger(weeklyLimitMinutes)
    && normalized.weeklyLimitMinutes === weeklyLimitMinutes
    && Number.isSafeInteger(expectedVersion)
    && expectedVersion >= 0
    && normalized.version === expectedVersion + 1
  )
}

export function normalizeWorkforceScheduleBootstrap(schedule = {}) {
  const users = (Array.isArray(schedule.people) ? schedule.people : []).map((person) => {
    const displayName = text(person.displayName)
    const status = text(person.status).toLowerCase()
    return {
      ...person,
      id: text(person.personId || person.id),
      displayName,
      firstName: text(person.firstName || displayName.split(/\s+/)[0]),
      initials: text(person.initials) || '?',
      status,
      selectable: catalogSelectable(person),
    }
  }).filter((person) => person.id)

  const locations = (Array.isArray(schedule.locations) ? schedule.locations : []).map((location) => {
    const status = text(location.status).toLowerCase()
    return {
      ...location,
      id: text(location.locationId || location.id),
      color: text(location.color) || '#2563eb',
      softColor: text(location.softColor) || '#eff6ff',
      status,
      selectable: catalogSelectable(location),
    }
  }).filter((location) => location.id)

  const shifts = (Array.isArray(schedule.shifts) ? schedule.shifts : [])
    .map(normalizeWorkforceScheduleShift)
    .filter((shift) => shift.id)

  const requests = (Array.isArray(schedule.requests) ? schedule.requests : []).map((request) => ({
    ...request,
    id: text(request.requestId || request.id),
    userId: text(request.personId || request.userId),
    status: text(request.status).toLowerCase(),
    type: text(request.type).toLowerCase(),
  })).filter((request) => request.id)

  return {
    users,
    locations,
    shifts,
    requests,
    templates: Array.isArray(schedule.templates) ? schedule.templates : [],
    settings: normalizeWorkforceScheduleSettings(schedule.settings),
    setupRequired: schedule.setupRequired === true,
    publications: Array.isArray(schedule.publications) ? schedule.publications : [],
    catalogSync: normalizeBootstrapCatalogSync(schedule.catalogSync),
    integration: schedule.integration && typeof schedule.integration === 'object'
      ? schedule.integration
      : null,
    range: schedule.range && typeof schedule.range === 'object' ? schedule.range : null,
  }
}

const STRUCTURAL_CONFLICT_COPY = Object.freeze({
  OVERLAP: ['Nakładające się zmiany', 'Ta sama osoba ma w tym czasie inną zmianę.'],
  INACTIVE_PERSON: ['Nieaktywny pracownik', 'Zmiana odwołuje się do pracownika, którego nie można już przypisywać.'],
  MISSING_PERSON: ['Brak pracownika', 'Pracownik zapisany w zmianie nie istnieje w katalogu Grafiku.'],
  MISSING_LOCATION: ['Niedostępny obiekt', 'Obiekt zapisany w zmianie nie jest dostępny do planowania.'],
  INVALID_INTERVAL: ['Nieprawidłowy czas zmiany', 'Początek i koniec zmiany tworzą nieprawidłowy przedział.'],
  DST_GAP: ['Nieistniejąca godzina', 'Godzina zmiany nie istnieje po zmianie czasu.'],
  DST_AMBIGUOUS: ['Niejednoznaczna godzina', 'Godzina zmiany występuje dwukrotnie po zmianie czasu.'],
  CAPACITY_EXCEEDED: ['Przekroczony limit', 'Zmiana przekracza dozwolony limit systemowy.'],
})

const MAX_VISIBLE_STRUCTURAL_CONFLICTS = 20

function sanitizeAffected(value) {
  if (!plainObject(value)) return {}
  return Object.fromEntries(['personId', 'locationId', 'shiftId', 'date']
    .map((key) => {
      const fieldValue = text(value[key])
      return [key, key === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(fieldValue) ? '' : fieldValue]
    })
    .filter(([, fieldValue]) => fieldValue))
}

function conflictAffected(conflict = {}) {
  const affected = plainObject(conflict.affected) ? conflict.affected : {}
  const details = plainObject(conflict.details) ? conflict.details : {}
  return sanitizeAffected({
    personId: affected.personId ?? conflict.personId ?? details.personId,
    locationId: affected.locationId ?? conflict.locationId ?? details.locationId,
    shiftId: affected.shiftId ?? conflict.shiftId ?? details.shiftId,
    date: affected.date ?? conflict.date ?? details.date,
  })
}

export function normalizeWorkforceScheduleStructuralConflicts(value = []) {
  const source = Array.isArray(value) ? value : []
  return source.slice(0, MAX_VISIBLE_STRUCTURAL_CONFLICTS).map((conflict, index) => {
    const type = text(conflict?.type || conflict?.code).toUpperCase()
    const [label, message] = STRUCTURAL_CONFLICT_COPY[type] || [
      'Konflikt strukturalny',
      'Zmiana wymaga poprawienia przed zatwierdzeniem Grafiku.',
    ]
    return {
      id: `${type || 'UNKNOWN'}-${index}`,
      type,
      label,
      message,
      affected: conflictAffected(conflict),
    }
  })
}

export function workforceScheduleStructuralConflictsFromError(error = {}) {
  if (![
    'WORKFORCE_SCHEDULE_PUBLICATION_BLOCKED',
    'WORKFORCE_SCHEDULE_INACTIVE_CATALOG_SELECTION',
  ].includes(text(error?.code).toUpperCase())) return []
  return normalizeWorkforceScheduleStructuralConflicts(error?.details?.blocking)
}

export function workforceScheduleCatalogConflictsFromError(error = {}) {
  const type = {
    WORKFORCE_SCHEDULE_ROSTER_IN_USE: 'INACTIVE_PERSON',
    WORKFORCE_SCHEDULE_OBJECT_IN_USE: 'MISSING_LOCATION',
  }[text(error?.code).toUpperCase()]
  if (!type) return { conflicts: [], hasMore: false }
  const affected = Array.isArray(error?.details?.affected) ? error.details.affected : []
  return {
    conflicts: normalizeWorkforceScheduleStructuralConflicts(
      affected.map((item) => ({ type, affected: sanitizeAffected(item) })),
    ),
    hasMore: error?.details?.hasMore === true || affected.length > MAX_VISIBLE_STRUCTURAL_CONFLICTS,
  }
}

export function assertWorkforceScheduleSelectableReferences(shift = {}, catalog = {}) {
  const people = Array.isArray(catalog.people) ? catalog.people : Array.isArray(catalog.users) ? catalog.users : []
  const locations = Array.isArray(catalog.locations) ? catalog.locations : []
  const shiftId = text(shift.shiftId || shift.id)
  const date = text(shift.date)
  const blocking = []
  const locationId = text(shift.locationId)
  const location = locations.find((candidate) => text(candidate?.locationId || candidate?.id) === locationId)
  if (!location || location.selectable === false) {
    blocking.push({
      type: 'MISSING_LOCATION',
      affected: { ...(shiftId ? { shiftId } : {}), ...(date ? { date } : {}), ...(locationId ? { locationId } : {}) },
    })
  }
  for (const personId of (Array.isArray(shift.assigneeIds) ? shift.assigneeIds : []).map(text).filter(Boolean)) {
    const person = people.find((candidate) => text(candidate?.personId || candidate?.id) === personId)
    if (!person || person.selectable === false) {
      blocking.push({
        type: person ? 'INACTIVE_PERSON' : 'MISSING_PERSON',
        affected: { ...(shiftId ? { shiftId } : {}), ...(date ? { date } : {}), personId },
      })
    }
  }
  if (!blocking.length) return true
  const error = new Error('Wybierz aktywnego pracownika i aktywny obiekt przed zapisaniem zmiany.')
  error.code = 'WORKFORCE_SCHEDULE_INACTIVE_CATALOG_SELECTION'
  error.details = { blocking }
  throw error
}

export function buildWorkforceScheduleShiftPayload(shift = {}) {
  const expectedVersion = Number(shift.version || 0)
  const persistedShiftId = expectedVersion > 0 ? text(shift.id || shift.shiftId) : ''
  const startTime = text(shift.startTime)
  const endTime = text(shift.endTime)
  if (startTime && startTime === endTime) {
    const error = new Error('Godzina zakończenia musi być inna niż godzina rozpoczęcia. Zmiana o zerowym czasie nie może zostać zapisana.')
    error.code = 'WORKFORCE_SCHEDULE_ZERO_DURATION'
    throw error
  }
  return {
    ...(persistedShiftId ? { shiftId: persistedShiftId } : {}),
    expectedVersion,
    title: text(shift.title),
    date: text(shift.date),
    startTime,
    endTime,
    breakMinutes: Number(shift.breakMinutes || 0),
    requiredHeadcount: Number(shift.requiredHeadcount || 0),
    locationId: text(shift.locationId),
    notes: text(shift.notes),
    personIds: Array.isArray(shift.assigneeIds) ? shift.assigneeIds.map(text).filter(Boolean) : [],
    instructions: Array.isArray(shift.tasks)
      ? shift.tasks.map(text).filter(Boolean)
      : Array.isArray(shift.instructions)
        ? shift.instructions.map(text).filter(Boolean)
        : [],
  }
}

export function applyWorkforceSchedulePublication(shifts = [], publication = {}) {
  const published = Array.isArray(publication?.published) ? publication.published : []
  if (!text(publication?.publicationId) || !published.length) {
    const error = new Error('Serwer nie potwierdził wersji zmian zatwierdzonych w Grafiku. Odśwież widok przed kolejną operacją.')
    error.code = 'WORKFORCE_SCHEDULE_INVALID_PUBLICATION_RESPONSE'
    throw error
  }

  const confirmations = new Map()
  for (const item of published) {
    const shiftId = text(item?.shiftId)
    const revision = positiveInteger(item?.revision)
    const version = positiveInteger(item?.version)
    if (!shiftId || !revision || !version || confirmations.has(shiftId)) {
      const error = new Error('Serwer zwrócił niepełne potwierdzenie zatwierdzenia Grafiku. Odśwież widok przed kolejną operacją.')
      error.code = 'WORKFORCE_SCHEDULE_INVALID_PUBLICATION_RESPONSE'
      throw error
    }
    confirmations.set(shiftId, { archived: item.archived === true, revision, version })
  }

  return shifts.flatMap((shift) => {
    const shiftId = text(shift.shiftId || shift.id)
    const confirmed = confirmations.get(shiftId)
    if (!confirmed) return [shift]
    if (confirmed.archived) return []
    return [{
      ...shift,
      id: shiftId,
      shiftId,
      pendingDeletion: false,
      publishedRevision: confirmed.revision,
      revision: confirmed.revision,
      version: confirmed.version,
    }]
  })
}

export function formatWorkforceScheduleWarning(warning = {}) {
  if (typeof warning === 'string') return text(warning) || 'Ostrzeżenie Grafiku wymaga sprawdzenia.'
  const type = text(warning?.type).toUpperCase()
  const details = warning?.details && typeof warning.details === 'object' ? warning.details : {}
  const shift = text(warning?.shiftId) ? `Zmiana ${text(warning.shiftId)}` : 'Zmiana'
  const person = text(warning?.personId) ? `Pracownik ${text(warning.personId)}` : 'Pracownik'

  if (type === 'UNDERSTAFFED') {
    const assigned = Number.isFinite(Number(details.assigned)) ? Number(details.assigned) : '?'
    const required = Number.isFinite(Number(details.required)) ? Number(details.required) : '?'
    return `${shift}: niepełna obsada (${assigned} z ${required}).`
  }
  if (type === 'OVERSTAFFED') {
    const assigned = Number.isFinite(Number(details.assigned)) ? Number(details.assigned) : '?'
    const required = Number.isFinite(Number(details.required)) ? Number(details.required) : '?'
    return `${shift}: obsada przekracza plan (${assigned} przy wymaganych ${required}).`
  }
  if (type === 'WEEKLY_LIMIT') {
    const minutes = Number.isFinite(Number(details.minutes)) ? Number(details.minutes) : '?'
    const limit = Number.isFinite(Number(details.limitMinutes)) ? Number(details.limitMinutes) : '?'
    const week = text(details.weekStart) ? ` w tygodniu od ${text(details.weekStart)}` : ''
    return `${person}: przekroczony limit tygodniowy${week} (${minutes} min przy limicie ${limit} min).`
  }

  const suppliedValue = warning?.message ?? warning?.label
  const supplied = ['string', 'number'].includes(typeof suppliedValue) ? text(suppliedValue) : ''
  if (supplied) return supplied
  return type
    ? `Ostrzeżenie Grafiku (${type}) wymaga sprawdzenia.`
    : 'Ostrzeżenie Grafiku wymaga sprawdzenia.'
}

export function workforceSchedulePublicationCandidates(shifts = [], range = {}) {
  const from = text(range.from)
  const to = text(range.to)
  if (!from || !to || from > to) return []
  const inRange = (value) => {
    const date = text(value)
    return Boolean(date && date >= from && date <= to)
  }
  return dirtyShifts(shifts).filter((shift) => inRange(shift.date) || inRange(shift.publishedDate))
}
