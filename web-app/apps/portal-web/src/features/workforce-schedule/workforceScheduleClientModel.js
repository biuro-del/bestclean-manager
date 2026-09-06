import { dirtyShifts } from './scheduleModel.js'

function text(value) {
  return String(value ?? '').trim()
}

function positiveInteger(value) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0
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

export function normalizeWorkforceScheduleBootstrap(schedule = {}) {
  const users = (Array.isArray(schedule.people) ? schedule.people : []).map((person) => {
    const displayName = text(person.displayName)
    return {
      ...person,
      id: text(person.personId || person.id),
      displayName,
      firstName: text(person.firstName || displayName.split(/\s+/)[0]),
      initials: text(person.initials) || '?',
      status: text(person.status).toLowerCase(),
    }
  }).filter((person) => person.id)

  const locations = (Array.isArray(schedule.locations) ? schedule.locations : []).map((location) => ({
    ...location,
    id: text(location.locationId || location.id),
    color: text(location.color) || '#2563eb',
    softColor: text(location.softColor) || '#eff6ff',
  })).filter((location) => location.id)

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
    settings: schedule.settings && typeof schedule.settings === 'object' && !Array.isArray(schedule.settings)
      ? schedule.settings
      : null,
    setupRequired: schedule.setupRequired === true,
    publications: Array.isArray(schedule.publications) ? schedule.publications : [],
    integration: schedule.integration && typeof schedule.integration === 'object'
      ? schedule.integration
      : null,
    range: schedule.range && typeof schedule.range === 'object' ? schedule.range : null,
  }
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
