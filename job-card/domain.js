'use strict'

const crypto = require('node:crypto')

const JOB_CARD_SCHEMA_VERSION = '1.0.0'
const JOB_CARD_COMPILER_VERSION = '1.0.0'
const JOB_CARD_CONTRACT_VERSION = '0.1.0-draft.8'
const JOB_CARD_CUSTOMER_TYPES = new Set(['B2B', 'B2C'])
const JOB_CARD_SITE_MODES = new Set(['FIXED_CONTRACT_SITE', 'VISIT_SITE'])
const JOB_CARD_SCHEDULE_MODES = new Set(['ONE_OFF', 'RECURRING'])
const JOB_CARD_CREW_SOURCES = new Set(['SITE', 'DISPATCHED', 'MIXED'])
const JOB_CARD_STAFFING_MODES = new Set(['FIXED', 'VARIABLE_WEEKLY', 'BUFFER'])
const JOB_CARD_PAYMENT_METHODS = new Set(['PREPAID', 'CASH', 'CARD', 'DEFERRED'])
const JOB_CARD_PRICING_MODES = new Set(['PER_JOB', 'HOURLY', 'PER_OCCURRENCE', 'MONTHLY_CONTRACT'])
const JOB_CARD_MOBILE_ROLES = new Set(['WORKER', 'LEADER', 'DRIVER', 'COORDINATOR'])

function text(value = '') {
  return String(value ?? '').trim()
}

function issue(severity, code, message, path = '') {
  return { severity, code, message, path }
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        if (value[key] !== undefined) result[key] = canonicalValue(value[key])
        return result
      }, {})
  }
  return value
}

function stableSerialize(value) {
  return JSON.stringify(canonicalValue(value))
}

function sha256(value) {
  return crypto.createHash('sha256').update(stableSerialize(value)).digest('hex')
}

function jobCardContent(card = {}) {
  const normalized = canonicalValue(card)
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) return normalized
  const content = { ...normalized }
  delete content.publication
  delete content.status
  if (content.source && typeof content.source === 'object' && !Array.isArray(content.source)) {
    content.source = { ...content.source }
    delete content.source.sourceUpdatedAt
  }
  return content
}

function jobCardOutputHash(card = {}) {
  return sha256(jobCardContent(card))
}

function validateJobCardDraft(card = {}, options = {}) {
  const errors = []
  const warnings = []
  const blocks = Array.isArray(card?.schedule?.serviceBlocks) ? card.schedule.serviceBlocks : []
  const assignments = Array.isArray(card?.fulfillment?.assignments) ? card.fulfillment.assignments : []
  const staffingMode = JOB_CARD_STAFFING_MODES.has(text(card?.fulfillment?.staffingMode).toUpperCase())
    ? text(card.fulfillment.staffingMode).toUpperCase()
    : ''
  const requiresConcreteAssignments = options?.requireConcreteAssignments === true
  const scopeItems = Array.isArray(card?.service?.scopeItems) ? card.service.scopeItems : []
  const supplies = Array.isArray(card?.resources?.supplies) ? card.resources.supplies : []

  if (text(card?.schemaVersion) !== JOB_CARD_SCHEMA_VERSION) {
    errors.push(issue('ERROR', 'SCHEMA_VERSION_UNSUPPORTED', 'Wersja Karty Zlecenia nie jest obsługiwana.', 'schemaVersion'))
  }
  if (!JOB_CARD_CUSTOMER_TYPES.has(text(card?.customer?.type).toUpperCase())) {
    errors.push(issue('ERROR', 'CUSTOMER_TYPE_REQUIRED', 'Wybierz typ klienta: B2B albo B2C.', 'customer.type'))
  }
  if (!text(card?.customer?.name)) {
    errors.push(issue('ERROR', 'CUSTOMER_REQUIRED', 'Wybierz klienta lub uzupełnij jego nazwę.', 'customer.name'))
  }
  if (!JOB_CARD_SITE_MODES.has(text(card?.site?.mode).toUpperCase())) {
    errors.push(issue('ERROR', 'SITE_MODE_REQUIRED', 'Wybierz obiekt stały albo adres wizyty.', 'site.mode'))
  }
  if (!text(card?.site?.address)) {
    errors.push(issue('ERROR', 'SITE_ADDRESS_REQUIRED', 'Uzupełnij adres wykonania usługi.', 'site.address'))
  }
  if (!text(card?.service?.serviceType)) {
    errors.push(issue('ERROR', 'SERVICE_TYPE_REQUIRED', 'Wybierz rodzaj usługi.', 'service.serviceType'))
  }
  if (!JOB_CARD_SCHEDULE_MODES.has(text(card?.schedule?.mode).toUpperCase())) {
    errors.push(issue('ERROR', 'SCHEDULE_MODE_REQUIRED', 'Wybierz zlecenie jednorazowe albo cykliczne.', 'schedule.mode'))
  }
  if (!text(card?.schedule?.startDateYmd)) {
    errors.push(issue('ERROR', 'SCHEDULE_START_REQUIRED', 'Uzupełnij datę rozpoczęcia.', 'schedule.startDateYmd'))
  }
  if (card?.schedule?.mode === 'RECURRING' && !text(card?.schedule?.recurrenceUntilYmd)) {
    errors.push(issue('ERROR', 'RECURRENCE_UNTIL_REQUIRED', 'Potwierdź, do kiedy utworzyć wystąpienia cykliczne.', 'schedule.recurrenceUntilYmd'))
  }
  if (card?.schedule?.mode === 'RECURRING' && card?.schedule?.recurrenceHorizonConfirmed !== true) {
    errors.push(issue('ERROR', 'RECURRENCE_HORIZON_CONFIRMATION_REQUIRED', 'Potwierdź zakres tworzenia wystąpień cyklicznych.', 'schedule.recurrenceHorizonConfirmed'))
  }
  if (!blocks.length) {
    errors.push(issue('ERROR', 'SERVICE_BLOCK_REQUIRED', 'Dodaj co najmniej jeden przedział pracy.', 'schedule.serviceBlocks'))
  }
  blocks.forEach((block, index) => {
    if (!text(block?.startTime) || !text(block?.endTime)) {
      errors.push(issue('ERROR', 'SERVICE_BLOCK_TIME_REQUIRED', 'Każda zmiana musi mieć godzinę rozpoczęcia i zakończenia.', `schedule.serviceBlocks.${index}`))
    }
  })
  if (!scopeItems.length && !text(card?.service?.internalDescription)) {
    errors.push(issue('ERROR', 'SERVICE_SCOPE_REQUIRED', 'Dodaj strefę, checklistę albo jednoznaczny opis prac.', 'service.scopeItems'))
  }
  if (
    !assignments.length &&
    !requiresConcreteAssignments &&
    ['VARIABLE_WEEKLY', 'BUFFER'].includes(staffingMode)
  ) {
    warnings.push(issue(
      'WARNING',
      'ASSIGNEE_REQUIRED',
      staffingMode === 'BUFFER'
        ? 'Obsada zostanie uzupełniona w buforze planowania przed publikacją konkretnego wystąpienia.'
        : 'Obsada jest ustalana co tydzień i musi zostać uzupełniona przed publikacją konkretnego wystąpienia.',
      'fulfillment.assignments',
    ))
  } else if (!assignments.length) {
    errors.push(issue('ERROR', 'ASSIGNEE_REQUIRED', 'Przypisz co najmniej jednego pracownika lub zespół obiektu.', 'fulfillment.assignments'))
  }
  if (!JOB_CARD_CREW_SOURCES.has(text(card?.fulfillment?.crewSource).toUpperCase())) {
    errors.push(issue('ERROR', 'CREW_SOURCE_REQUIRED', 'Wybierz źródło załogi: obiekt, wysyłana albo mieszana.', 'fulfillment.crewSource'))
  }
  if (typeof card?.fulfillment?.dispatchRequired !== 'boolean') {
    errors.push(issue('ERROR', 'DISPATCH_DECISION_REQUIRED', 'Określ, czy zlecenie wymaga dojazdu.', 'fulfillment.dispatchRequired'))
  }
  if (!text(card?.site?.accessInstruction) && card?.site?.accessInstructionConfirmedNone !== true) {
    errors.push(issue('ERROR', 'ACCESS_INSTRUCTION_REQUIRED', 'Dodaj instrukcję wejścia albo potwierdź jej brak.', 'site.accessInstruction'))
  }
  if (!text(card?.service?.safetyInstruction) && card?.service?.safetyInstructionConfirmedNone !== true) {
    errors.push(issue('ERROR', 'SAFETY_INSTRUCTION_REQUIRED', 'Dodaj zasady bezpieczeństwa albo potwierdź ich brak.', 'service.safetyInstruction'))
  }
  if (typeof card?.resources?.packingRequired !== 'boolean') {
    errors.push(issue('ERROR', 'PACKING_DECISION_REQUIRED', 'Określ, czy zlecenie wymaga przygotowania rzeczy do zabrania.', 'resources.packingRequired'))
  }
  if (!JOB_CARD_PAYMENT_METHODS.has(text(card?.commercial?.paymentMethod).toUpperCase())) {
    errors.push(issue('ERROR', 'PAYMENT_METHOD_REQUIRED', 'Wybierz sposób płatności.', 'commercial.paymentMethod'))
  }
  if (!JOB_CARD_PRICING_MODES.has(text(card?.commercial?.pricingMode).toUpperCase())) {
    errors.push(issue('ERROR', 'PRICING_MODE_REQUIRED', 'Wybierz sposób rozliczenia ceny.', 'commercial.pricingMode'))
  }
  if (
    JOB_CARD_PRICING_MODES.has(text(card?.commercial?.pricingMode).toUpperCase()) &&
    Number(card?.commercial?.amount) <= 0 &&
    !text(card?.commercial?.contractId)
  ) {
    errors.push(issue('ERROR', 'PRICE_OR_CONTRACT_REQUIRED', 'Uzupełnij cenę albo powiąż zlecenie z kontraktem.', 'commercial.amount'))
  }
  if (
    card?.commercial?.paymentMethod === 'DEFERRED' &&
    !text(card?.commercial?.paymentDueDateYmd) &&
    Number(card?.commercial?.paymentTermDays) <= 0
  ) {
    errors.push(issue('ERROR', 'DEFERRED_TERM_REQUIRED', 'Dla terminu odroczonego podaj datę lub liczbę dni płatności.', 'commercial.paymentTermDays'))
  }

  if (
    assignments.length &&
    !text(card?.fulfillment?.leaderWorkerId) &&
    !assignments.some((assignment) => text(assignment?.role).toUpperCase() === 'LEADER')
  ) {
    warnings.push(issue('WARNING', 'LEADER_MISSING', 'Nie wyznaczono lidera załogi.', 'fulfillment.assignments'))
  }
  if (
    card?.fulfillment?.dispatchRequired === true &&
    !text(card?.fulfillment?.driverWorkerId) &&
    !assignments.some((assignment) => text(assignment?.role).toUpperCase() === 'DRIVER')
  ) {
    warnings.push(issue('WARNING', 'DRIVER_MISSING', 'Wymagany jest dojazd, ale nie wyznaczono kierowcy.', 'fulfillment.assignments'))
  }
  if (card?.fulfillment?.dispatchRequired === true && !text(card?.fulfillment?.vehicle?.vehicleId)) {
    warnings.push(issue('WARNING', 'VEHICLE_MISSING', 'Wymagany jest dojazd, ale nie wybrano pojazdu.', 'fulfillment.vehicle'))
  }
  if (!text(card?.site?.contactPhone) && !text(card?.customer?.phone)) {
    warnings.push(issue('WARNING', 'CONTACT_PHONE_MISSING', 'Brak telefonu kontaktowego do klienta lub obiektu.', 'site.contactPhone'))
  }
  if (!Array.isArray(card?.site?.photos) || !card.site.photos.length) {
    warnings.push(issue('WARNING', 'SITE_PHOTOS_MISSING', 'Nie dodano zdjęć obiektu.', 'site.photos'))
  }
  if (card?.resources?.packingRequired === true && !supplies.length) {
    warnings.push(issue('WARNING', 'PACKING_LIST_EMPTY', 'Wymagane jest pakowanie, ale lista rzeczy jest pusta.', 'resources.supplies'))
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    issues: [...errors, ...warnings],
  }
}

function validateJobCardOccurrencePublication(card = {}) {
  return validateJobCardDraft(card, { requireConcreteAssignments: true })
}

function generationStatus(validation = {}) {
  if ((validation.errors || []).length) return 'BLOCKED'
  if ((validation.warnings || []).length) return 'READY_WITH_WARNINGS'
  return 'READY'
}

function normalizeWarningAcknowledgements(warnings = [], acknowledgements = []) {
  const requiredCodes = [...new Set(warnings.map((warning) => text(warning?.code)).filter(Boolean))]
  const supplied = new Map(
    (Array.isArray(acknowledgements) ? acknowledgements : [])
      .map((entry) => [text(entry?.code), entry])
      .filter(([code]) => code),
  )
  const missing = requiredCodes.filter((code) => supplied.get(code)?.accepted !== true)
  return {
    accepted: requiredCodes.map((code) => ({
      accepted: true,
      code,
    })).filter((entry) => supplied.get(entry.code)?.accepted === true),
    missing,
  }
}

function diffValues(previous, next, path = '') {
  if (stableSerialize(previous) === stableSerialize(next)) return []
  const previousObject = previous && typeof previous === 'object' && !Array.isArray(previous)
  const nextObject = next && typeof next === 'object' && !Array.isArray(next)
  if (previousObject && nextObject) {
    return [...new Set([...Object.keys(previous), ...Object.keys(next)])]
      .sort()
      .flatMap((key) => diffValues(previous[key], next[key], path ? `${path}.${key}` : key))
  }
  return [{
    path: path || '$',
    previous: previous === undefined ? null : canonicalValue(previous),
    next: next === undefined ? null : canonicalValue(next),
  }]
}

function projectJobCardForMobile(card = {}, role = 'WORKER') {
  const normalizedRole = text(role).toUpperCase()
  if (!JOB_CARD_MOBILE_ROLES.has(normalizedRole)) {
    const error = new Error('Unsupported mobile job-card role')
    error.code = 'JOB_CARD_ROLE_UNSUPPORTED'
    throw error
  }
  const assignments = Array.isArray(card?.fulfillment?.assignments) ? card.fulfillment.assignments : []
  const common = {
    schemaVersion: card?.schemaVersion,
    source: { orderId: text(card?.source?.orderId) },
    customer: {
      name: text(card?.customer?.name),
      phone: text(card?.customer?.phone),
    },
    site: {
      siteId: text(card?.site?.siteId),
      name: text(card?.site?.name),
      address: text(card?.site?.address),
      latitude: card?.site?.latitude ?? null,
      longitude: card?.site?.longitude ?? null,
      contactName: text(card?.site?.contactName),
      contactPhone: text(card?.site?.contactPhone),
      accessInstruction: text(card?.site?.accessInstruction),
      photos: Array.isArray(card?.site?.photos) ? card.site.photos : [],
    },
    schedule: {
      mode: text(card?.schedule?.mode),
      startDateYmd: text(card?.schedule?.startDateYmd),
      recurrenceUntilYmd: text(card?.schedule?.recurrenceUntilYmd),
      serviceBlocks: Array.isArray(card?.schedule?.serviceBlocks) ? card.schedule.serviceBlocks : [],
    },
    service: {
      serviceType: text(card?.service?.serviceType),
      title: text(card?.service?.title),
      workerInstructions: text(card?.service?.workerInstructions),
      safetyInstruction: text(card?.service?.safetyInstruction),
      escalationInstruction: text(card?.service?.escalationInstruction),
      scopeItems: Array.isArray(card?.service?.scopeItems) ? card.service.scopeItems : [],
    },
    fulfillment: {
      assignments,
      crewSource: text(card?.fulfillment?.crewSource),
      dispatchRequired: card?.fulfillment?.dispatchRequired === true,
      leaderWorkerId: text(card?.fulfillment?.leaderWorkerId),
    },
    resources: {
      packingRequired: card?.resources?.packingRequired === true,
      supplies: Array.isArray(card?.resources?.supplies) ? card.resources.supplies : [],
    },
    completion: {
      complaintPathEnabled: card?.completion?.complaintPathEnabled !== false,
      signatureRequired: card?.completion?.signatureRequired === true,
    },
    telemetry: {
      backgroundGps: false,
      continuousGps: false,
      routeTracking: false,
    },
  }

  if (normalizedRole === 'DRIVER' || normalizedRole === 'LEADER' || normalizedRole === 'COORDINATOR') {
    common.fulfillment.driverWorkerId = text(card?.fulfillment?.driverWorkerId)
    common.fulfillment.vehicle = {
      vehicleId: text(card?.fulfillment?.vehicle?.vehicleId),
      label: text(card?.fulfillment?.vehicle?.label),
      registrationNumber: text(card?.fulfillment?.vehicle?.registrationNumber),
    }
  }
  return common
}

function buildMobileProjections(card = {}) {
  return [...JOB_CARD_MOBILE_ROLES].reduce((result, role) => {
    result[role.toLowerCase()] = projectJobCardForMobile(card, role)
    return result
  }, {})
}

module.exports = {
  JOB_CARD_COMPILER_VERSION,
  JOB_CARD_CONTRACT_VERSION,
  JOB_CARD_SCHEMA_VERSION,
  buildMobileProjections,
  canonicalValue,
  diffValues,
  generationStatus,
  jobCardContent,
  jobCardOutputHash,
  normalizeWarningAcknowledgements,
  projectJobCardForMobile,
  sha256,
  stableSerialize,
  validateJobCardDraft,
  validateJobCardOccurrencePublication,
}
