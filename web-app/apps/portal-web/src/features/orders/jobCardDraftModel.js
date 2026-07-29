export const JOB_CARD_SCHEMA_VERSION = '1.0.0'

export const JOB_CARD_CUSTOMER_TYPES = Object.freeze(['B2B', 'B2C'])
export const JOB_CARD_SITE_MODES = Object.freeze(['FIXED_CONTRACT_SITE', 'VISIT_SITE'])
export const JOB_CARD_SCHEDULE_MODES = Object.freeze(['ONE_OFF', 'RECURRING'])
export const JOB_CARD_CREW_SOURCES = Object.freeze(['SITE', 'DISPATCHED', 'MIXED'])
export const JOB_CARD_PAYMENT_METHODS = Object.freeze(['PREPAID', 'CASH', 'CARD', 'DEFERRED'])
export const JOB_CARD_PRICING_MODES = Object.freeze(['PER_JOB', 'HOURLY', 'PER_OCCURRENCE', 'MONTHLY_CONTRACT'])

function text(value = '') {
  return String(value ?? '').trim()
}

function upper(value = '') {
  return text(value).toUpperCase()
}

function finiteNumber(value, fallback = null) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function uniqueBy(items = [], keyFn = (item) => item) {
  const seen = new Set()
  return items.filter((item) => {
    const key = keyFn(item)
    if (!key || seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function normalizedEnum(value, allowed = []) {
  const candidate = upper(value)
  return allowed.includes(candidate) ? candidate : ''
}

function normalizeCustomerType(order = {}) {
  const source = upper(order.customerType || order.clientType || order.customerKind)
  if (['B2C', 'INDIVIDUAL', 'RETAIL', 'CONSUMER', 'PRIVATE'].includes(source)) {
    return 'B2C'
  }
  if (['B2B', 'BUSINESS', 'COMPANY', 'CONTRACT'].includes(source)) {
    return 'B2B'
  }
  return ''
}

function normalizeScheduleMode(order = {}) {
  const source = upper(order.scheduleMode || order.scheduleType || order.type)
  if (['RECURRING', 'REPEAT', 'CYCLIC'].includes(source)) {
    return 'RECURRING'
  }
  if (['ONE_OFF', 'ONCE', 'INDIVIDUAL', 'SINGLE'].includes(source)) {
    return 'ONE_OFF'
  }
  return ''
}

function normalizeWeekdays(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6))]
    .sort((left, right) => left - right)
}

function normalizeServiceBlocks(order = {}) {
  const source = Array.isArray(order.serviceBlocks) ? order.serviceBlocks : []
  return source.map((block, index) => ({
    id: text(block?.id || `service-block-${index + 1}`),
    label: text(block?.label || block?.name || `Zmiana ${index + 1}`),
    dateYmd: text(block?.dateYmd || block?.planDateYmd || order.dateYmd),
    startTime: text(block?.startTime || block?.planStartTime || order.startTime),
    endTime: text(block?.endTime || block?.planEndTime || order.endTime),
    weekdays: normalizeWeekdays(block?.weekdays || order.repeatWeekdays),
    requiredPeople: Math.max(0, Math.floor(finiteNumber(block?.requiredPeople ?? block?.requiredWorkers, 0))),
    requiredWorkMinutes: Math.max(0, Math.round(finiteNumber(block?.requiredWorkMinutes ?? block?.serviceWorkMinutes, 0))),
    description: text(block?.description || block?.note),
  }))
}

function assignmentSources(order = {}) {
  const serviceBlocks = Array.isArray(order.serviceBlocks) ? order.serviceBlocks : []
  return [
    ...(Array.isArray(order.workerAssignments) ? order.workerAssignments : []),
    ...(Array.isArray(order.workAllocations) ? order.workAllocations : []),
    ...serviceBlocks.flatMap((block) => [
      ...(Array.isArray(block?.workerAssignments) ? block.workerAssignments : []),
      ...(Array.isArray(block?.workAllocations) ? block.workAllocations : []),
      ...(Array.isArray(block?.slots) ? block.slots : []),
    ]),
  ]
}

function normalizeAssignments(order = {}) {
  return uniqueBy(assignmentSources(order)
    .map((assignment) => {
      const workerId = text(
        assignment?.workerId ||
        assignment?.workerLogin ||
        assignment?.workerKey ||
        assignment?.idWorker ||
        assignment?.id,
      )
      const assignmentType = upper(assignment?.type)
      if (!workerId || ['UNASSIGNED', 'BUFFER'].includes(assignmentType)) {
        return null
      }
      return {
        workerId,
        name: text(assignment?.name || assignment?.label || assignment?.workerName),
        role: upper(assignment?.role || assignment?.crewRole || 'WORKER'),
        serviceBlockId: text(assignment?.serviceBlockId || assignment?.teamId),
        plannedMinutes: Math.max(0, Math.round(finiteNumber(assignment?.minutes ?? assignment?.plannedMinutes, 0))),
      }
    })
    .filter(Boolean), (assignment) => `${assignment.workerId}:${assignment.serviceBlockId}:${assignment.role}`)
}

function normalizeScopeItems(order = {}) {
  const source = [
    ...(Array.isArray(order.objectPlanTasks) ? order.objectPlanTasks : []),
    ...(Array.isArray(order.zoneTaskPlan) ? order.zoneTaskPlan : []),
  ]
  return uniqueBy(source.map((item, index) => ({
    id: text(item?.id || item?.taskId || item?.zoneId || `scope-${index + 1}`),
    zoneId: text(item?.zoneId || item?.idZone),
    zoneName: text(item?.zoneName || item?.zoneLabel || item?.areaName),
    title: text(item?.title || item?.name || item?.taskName || item?.description),
    instructions: text(item?.instructions || item?.comment || item?.note),
    required: item?.required !== false,
  })).filter((item) => item.title || item.zoneId || item.zoneName), (item) => item.id)
}

function normalizeSupplies(order = {}) {
  const source = Array.isArray(order.supplies)
    ? order.supplies
    : Array.isArray(order.itemsToTake)
      ? order.itemsToTake
      : []
  return source.map((item, index) => ({
    id: text(item?.id || item?.qrCode || `supply-${index + 1}`),
    kind: upper(item?.kind || item?.type || 'OTHER'),
    name: text(item?.name || item?.label),
    qrCode: text(item?.qrCode || item?.qr),
    quantity: Math.max(0, finiteNumber(item?.quantity, 1)),
  })).filter((item) => item.name || item.qrCode)
}

function normalizeVehicle(order = {}) {
  const source = order.vehicle && typeof order.vehicle === 'object' ? order.vehicle : {}
  return {
    vehicleId: text(source.vehicleId || source.id || order.vehicleId),
    label: text(source.label || source.name || order.vehicleLabel),
    registrationNumber: text(source.registrationNumber || source.registration || order.vehicleRegistrationNumber),
  }
}

function normalizePhotos(order = {}) {
  const source = Array.isArray(order.sitePhotos)
    ? order.sitePhotos
    : Array.isArray(order.photos)
      ? order.photos
      : []
  return source.map((photo) => ({
    id: text(photo?.id || photo?.storagePath || photo?.url),
    label: text(photo?.label || photo?.name),
    storagePath: text(photo?.storagePath),
    url: text(photo?.url),
  })).filter((photo) => photo.id)
}

function issue(severity, code, message, path = '') {
  return { severity, code, message, path }
}

export function defaultJobCardRecurrenceUntil(startDateYmd = '') {
  const match = text(startDateYmd).match(/^(\d{4})-\d{2}-\d{2}$/)
  return match ? `${match[1]}-12-31` : ''
}

export function compileOrderDraftToJobCardDraft(order = {}) {
  const customerType = normalizeCustomerType(order)
  const scheduleMode = normalizeScheduleMode(order)
  const dispatchRequired = typeof order.dispatchRequired === 'boolean' ? order.dispatchRequired : null
  const signatureRequired = typeof order.signatureRequired === 'boolean'
    ? order.signatureRequired
    : customerType === 'B2C'
  const siteMode = normalizedEnum(order.siteMode, JOB_CARD_SITE_MODES)
  const crewSource = normalizedEnum(order.crewSource || order.fulfillment?.crewSource, JOB_CARD_CREW_SOURCES)
  const paymentMethod = normalizedEnum(order.paymentMethod || order.commercial?.paymentMethod, JOB_CARD_PAYMENT_METHODS)
  const pricingMode = normalizedEnum(order.pricingMode || order.commercial?.pricingMode, JOB_CARD_PRICING_MODES)
  const serviceBlocks = normalizeServiceBlocks(order)
  const assignments = normalizeAssignments(order)
  const scopeItems = normalizeScopeItems(order)
  const supplies = normalizeSupplies(order)

  return {
    schemaVersion: JOB_CARD_SCHEMA_VERSION,
    status: 'DRAFT',
    source: {
      orderId: text(order.id || order.taskId || order.sourceOrderId),
      sourceUpdatedAt: text(order.updatedAt || order.sourceUpdatedAt),
    },
    customer: {
      type: customerType,
      customerId: text(order.clientId || order.customerId),
      name: text(order.clientName || order.clientLabel || order.customerName),
      nip: text(order.clientNip || order.nip),
      phone: text(order.phone || order.contactPhone),
      email: text(order.email || order.contactEmail),
    },
    site: {
      mode: siteMode,
      siteId: text(order.siteId || order.objectId || order.clientId),
      name: text(order.siteName || order.clientName || order.clientLabel),
      address: text(order.executionAddressLabel || order.customAddressLabel || order.addressLabel || order.address),
      placeId: text(order.googlePlaceId || order.placeId),
      latitude: finiteNumber(order.lat ?? order.latitude),
      longitude: finiteNumber(order.lng ?? order.longitude),
      contactName: text(order.siteContactName || order.contactName),
      contactPhone: text(order.siteContactPhone || order.contactPhone || order.phone),
      accessInstruction: text(order.accessInstruction || order.entryInstruction),
      accessInstructionConfirmedNone: order.accessInstructionConfirmedNone === true,
      photos: normalizePhotos(order),
    },
    schedule: {
      mode: scheduleMode,
      startDateYmd: text(order.dateYmd || order.startDateYmd),
      recurrenceUntilYmd: text(order.repeatUntil || order.repeatEndDate || order.recurrenceEndDate || order.seriesEndDate),
      recurrenceHorizonConfirmed: order.recurrenceHorizonConfirmed === true,
      serviceBlocks,
    },
    service: {
      serviceType: text(order.serviceType || order.serviceKind),
      title: text(order.title || order.name),
      internalDescription: text(order.description),
      workerInstructions: text(order.workerComment || order.commentForWorkers || order.mobileComment),
      safetyInstruction: text(order.safetyInstruction || order.safetyNote),
      safetyInstructionConfirmedNone: order.safetyInstructionConfirmedNone === true,
      escalationInstruction: text(order.escalationInstruction || order.helpInstruction),
      scopeItems,
    },
    fulfillment: {
      dispatchRequired,
      crewSource,
      leaderWorkerId: text(order.leaderWorkerId || order.fulfillment?.leaderWorkerId),
      driverWorkerId: text(order.driverWorkerId || order.fulfillment?.driverWorkerId),
      assignments,
      vehicle: normalizeVehicle(order),
    },
    resources: {
      packingRequired: typeof order.packingRequired === 'boolean' ? order.packingRequired : null,
      supplies,
    },
    commercial: {
      paymentMethod,
      pricingMode,
      amount: Math.max(0, finiteNumber(order.price ?? order.amount, 0)),
      currency: upper(order.currency || 'PLN'),
      contractId: text(order.contractId),
      paymentDueDateYmd: text(order.paymentDueDateYmd || order.dueDateYmd),
      paymentTermDays: Math.max(0, Math.floor(finiteNumber(order.paymentTermDays, 0))),
    },
    completion: {
      signatureRequired,
      complaintPathEnabled: true,
      returnsEnabled: false,
    },
  }
}

export function validateJobCardDraft(card = {}) {
  const errors = []
  const warnings = []
  const blocks = Array.isArray(card?.schedule?.serviceBlocks) ? card.schedule.serviceBlocks : []
  const assignments = Array.isArray(card?.fulfillment?.assignments) ? card.fulfillment.assignments : []
  const scopeItems = Array.isArray(card?.service?.scopeItems) ? card.service.scopeItems : []
  const supplies = Array.isArray(card?.resources?.supplies) ? card.resources.supplies : []

  if (!JOB_CARD_CUSTOMER_TYPES.includes(card?.customer?.type)) {
    errors.push(issue('ERROR', 'CUSTOMER_TYPE_REQUIRED', 'Wybierz typ klienta: B2B albo B2C.', 'customer.type'))
  }
  if (!text(card?.customer?.name)) {
    errors.push(issue('ERROR', 'CUSTOMER_REQUIRED', 'Wybierz klienta lub uzupełnij jego nazwę.', 'customer.name'))
  }
  if (!JOB_CARD_SITE_MODES.includes(card?.site?.mode)) {
    errors.push(issue('ERROR', 'SITE_MODE_REQUIRED', 'Wybierz obiekt stały albo adres wizyty.', 'site.mode'))
  }
  if (!text(card?.site?.address)) {
    errors.push(issue('ERROR', 'SITE_ADDRESS_REQUIRED', 'Uzupełnij adres wykonania usługi.', 'site.address'))
  }
  if (!text(card?.service?.serviceType)) {
    errors.push(issue('ERROR', 'SERVICE_TYPE_REQUIRED', 'Wybierz rodzaj usługi.', 'service.serviceType'))
  }
  if (!JOB_CARD_SCHEDULE_MODES.includes(card?.schedule?.mode)) {
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
  if (!assignments.length) {
    errors.push(issue('ERROR', 'ASSIGNEE_REQUIRED', 'Przypisz co najmniej jednego pracownika lub zespół obiektu.', 'fulfillment.assignments'))
  }
  if (!JOB_CARD_CREW_SOURCES.includes(card?.fulfillment?.crewSource)) {
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
  if (!JOB_CARD_PAYMENT_METHODS.includes(card?.commercial?.paymentMethod)) {
    errors.push(issue('ERROR', 'PAYMENT_METHOD_REQUIRED', 'Wybierz sposób płatności.', 'commercial.paymentMethod'))
  }
  if (!JOB_CARD_PRICING_MODES.includes(card?.commercial?.pricingMode)) {
    errors.push(issue('ERROR', 'PRICING_MODE_REQUIRED', 'Wybierz sposób rozliczenia ceny.', 'commercial.pricingMode'))
  }
  if (
    JOB_CARD_PRICING_MODES.includes(card?.commercial?.pricingMode) &&
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
    !assignments.some((assignment) => assignment.role === 'LEADER')
  ) {
    warnings.push(issue('WARNING', 'LEADER_MISSING', 'Nie wyznaczono lidera załogi.', 'fulfillment.assignments'))
  }
  if (
    card?.fulfillment?.dispatchRequired === true &&
    !text(card?.fulfillment?.driverWorkerId) &&
    !assignments.some((assignment) => assignment.role === 'DRIVER')
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

function canonicalValue(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalValue)
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        if (value[key] !== undefined) {
          result[key] = canonicalValue(value[key])
        }
        return result
      }, {})
  }
  return value
}

export function stableSerializeJobCardDraft(card = {}) {
  return JSON.stringify(canonicalValue(card))
}
