export const ORDER_CREATE_STEPS = Object.freeze([
  { id: 'object', label: 'Obiekt', description: 'Miejsce realizacji' },
  { id: 'rules', label: 'Zasady', description: 'Termin i powtarzalność' },
  { id: 'scope', label: 'Zakres prac', description: 'Strefy i zadania' },
  { id: 'staffing', label: 'Obsada', description: 'Zespół lub bufor' },
  { id: 'publication', label: 'Zatwierdzenie', description: 'Kontrola i wysłanie' },
])

export const ORDER_CREATE_WEEKDAYS = Object.freeze([
  { value: 1, short: 'Pn', label: 'Poniedziałek' },
  { value: 2, short: 'Wt', label: 'Wtorek' },
  { value: 3, short: 'Śr', label: 'Środa' },
  { value: 4, short: 'Cz', label: 'Czwartek' },
  { value: 5, short: 'Pt', label: 'Piątek' },
  { value: 6, short: 'Sb', label: 'Sobota' },
  { value: 0, short: 'Nd', label: 'Niedziela' },
])

function pad2(value) {
  return String(value).padStart(2, '0')
}

export function localDateYmd(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export function endOfLocalYearYmd(dateValue = '') {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(String(dateValue ?? ''))
    ? new Date(`${dateValue}T12:00:00`)
    : new Date()
  const year = Number.isFinite(parsed.getTime()) ? parsed.getFullYear() : new Date().getFullYear()
  return `${year}-12-31`
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value ?? '').trim()).filter(Boolean))]
}

function uniqueWeekdays(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(Number).filter((value) => value >= 0 && value <= 6))]
}

export function createOrderCreateDraft(seed = {}) {
  const today = String(seed.dateStart ?? seed.date ?? '').trim() || localDateYmd()
  const scheduleMode = String(seed.scheduleMode ?? '').toUpperCase() === 'RECURRING' ? 'RECURRING' : 'ONE_OFF'
  const staffingMode = ['FIXED', 'VARIABLE_WEEKLY', 'BUFFER'].includes(String(seed.staffingMode ?? '').toUpperCase())
    ? String(seed.staffingMode).toUpperCase()
    : 'BUFFER'

  return {
    id: String(seed.id ?? '').trim(),
    clientId: String(seed.clientId ?? '').trim(),
    clientLabel: String(seed.clientLabel ?? seed.clientName ?? '').trim(),
    objectId: String(seed.objectId ?? seed.siteId ?? '').trim(),
    objectLabel: String(seed.objectLabel ?? seed.siteName ?? '').trim(),
    address: String(seed.address ?? seed.location ?? '').trim(),
    scheduleMode,
    siteMode: String(seed.siteMode ?? '').toUpperCase() === 'VISIT_SITE' ? 'VISIT_SITE' : 'FIXED_CONTRACT_SITE',
    dateStart: today,
    startTime: String(seed.startTime ?? '08:00').trim() || '08:00',
    endTime: String(seed.endTime ?? '16:00').trim() || '16:00',
    recurrenceUntil: String(seed.recurrenceUntil ?? '').trim() || endOfLocalYearYmd(today),
    recurrenceUntilConfirmed: Boolean(seed.recurrenceUntilConfirmed),
    weekdays: uniqueWeekdays(seed.weekdays?.length ? seed.weekdays : [1, 2, 3, 4, 5]),
    serviceName: String(seed.serviceName ?? seed.title ?? '').trim(),
    serviceGoal: String(seed.serviceGoal ?? '').trim(),
    zoneIds: uniqueStrings(seed.zoneIds),
    tasks: (Array.isArray(seed.tasks) ? seed.tasks : []).map((task, index) => ({
      id: String(task?.id ?? `task-${index + 1}`).trim(),
      zoneId: String(task?.zoneId ?? '').trim(),
      title: String(task?.title ?? task?.name ?? '').trim(),
      instruction: String(task?.instruction ?? task?.how ?? '').trim(),
      expectedResult: String(task?.expectedResult ?? task?.result ?? '').trim(),
    })),
    accessNotes: String(seed.accessNotes ?? '').trim(),
    accessConfirmedNone: Boolean(seed.accessConfirmedNone),
    safetyConfirmed: Boolean(seed.safetyConfirmed),
    suppliesConfirmed: Boolean(seed.suppliesConfirmed),
    staffingMode,
    requiredPeople: Math.max(1, Number.parseInt(seed.requiredPeople, 10) || 1),
    workerIds: uniqueStrings(seed.workerIds),
    leaderId: String(seed.leaderId ?? '').trim(),
    driverId: String(seed.driverId ?? '').trim(),
    dispatchRequired: typeof seed.dispatchRequired === 'boolean' ? seed.dispatchRequired : null,
    paymentMethod: ['PREPAID', 'CASH', 'CARD', 'DEFERRED'].includes(String(seed.paymentMethod ?? '').toUpperCase())
      ? String(seed.paymentMethod).toUpperCase()
      : '',
    pricingMode: ['PER_JOB', 'HOURLY', 'PER_OCCURRENCE', 'MONTHLY_CONTRACT'].includes(String(seed.pricingMode ?? '').toUpperCase())
      ? String(seed.pricingMode).toUpperCase()
      : '',
    amount: String(seed.amount ?? '').trim(),
    contractId: String(seed.contractId ?? '').trim(),
    deferredDueDate: String(seed.deferredDueDate ?? '').trim(),
    revision: Number.parseInt(seed.revision, 10) || 0,
  }
}

export function orderCreateValidation(draft = {}) {
  const errors = []
  const warnings = []
  const tasks = Array.isArray(draft.tasks) ? draft.tasks : []

  if (!String(draft.objectId ?? '').trim()) {
    errors.push({ step: 0, code: 'OBJECT_REQUIRED', message: 'Wybierz obiekt realizacji.' })
  }
  if (!String(draft.dateStart ?? '').trim()) {
    errors.push({ step: 1, code: 'DATE_REQUIRED', message: 'Wskaż datę rozpoczęcia.' })
  }
  if (!String(draft.startTime ?? '').trim() || !String(draft.endTime ?? '').trim()) {
    errors.push({ step: 1, code: 'TIME_REQUIRED', message: 'Podaj godziny rozpoczęcia i zakończenia.' })
  }
  if (draft.scheduleMode === 'RECURRING') {
    if (!(Array.isArray(draft.weekdays) && draft.weekdays.length)) {
      errors.push({ step: 1, code: 'WEEKDAY_REQUIRED', message: 'Wybierz co najmniej jeden dzień realizacji.' })
    }
    if (!String(draft.recurrenceUntil ?? '').trim()) {
      errors.push({ step: 1, code: 'RECURRENCE_UNTIL_REQUIRED', message: 'Wskaż koniec planowania cyklu.' })
    }
    if (!draft.recurrenceUntilConfirmed) {
      errors.push({ step: 1, code: 'RECURRENCE_CONFIRMATION_REQUIRED', message: 'Potwierdź datę końca cyklu.' })
    }
  }
  if (!String(draft.serviceName ?? '').trim()) {
    errors.push({ step: 2, code: 'SERVICE_NAME_REQUIRED', message: 'Nazwij usługę.' })
  }
  if (!draft.zoneIds?.length) {
    errors.push({ step: 2, code: 'ZONE_REQUIRED', message: 'Wybierz co najmniej jedną strefę.' })
  }
  if (!tasks.some((task) => String(task?.title ?? '').trim())) {
    errors.push({ step: 2, code: 'TASK_REQUIRED', message: 'Dodaj co najmniej jedno zadanie.' })
  }
  if (!draft.safetyConfirmed) {
    errors.push({ step: 2, code: 'SAFETY_CONFIRMATION_REQUIRED', message: 'Potwierdź wymagania bezpieczeństwa.' })
  }
  if (!draft.suppliesConfirmed) {
    errors.push({ step: 2, code: 'SUPPLIES_CONFIRMATION_REQUIRED', message: 'Potwierdź wyposażenie i materiały.' })
  }
  if (!String(draft.accessNotes ?? '').trim() && !draft.accessConfirmedNone) {
    errors.push({ step: 2, code: 'ACCESS_REQUIRED', message: 'Opisz dostęp do obiektu albo potwierdź brak dodatkowych zasad dostępu.' })
  }
  if (draft.staffingMode === 'FIXED' && !draft.workerIds?.length) {
    errors.push({ step: 3, code: 'ASSIGNEE_REQUIRED', message: 'Dla stałej obsady wybierz co najmniej jednego pracownika.' })
  }
  if (draft.staffingMode === 'FIXED' && draft.workerIds.length < Number(draft.requiredPeople || 1)) {
    warnings.push({ step: 3, code: 'STAFFING_GAP', message: 'Liczba wybranych osób jest mniejsza niż wymagana obsada.' })
  }
  if (typeof draft.dispatchRequired !== 'boolean') {
    errors.push({ step: 3, code: 'DISPATCH_DECISION_REQUIRED', message: 'Określ, czy zlecenie wymaga organizacji dojazdu.' })
  }
  if (draft.staffingMode !== 'FIXED') {
    warnings.push({
      step: 3,
      code: 'STAFFING_BUFFER',
      message: draft.staffingMode === 'VARIABLE_WEEKLY'
        ? 'Obsada będzie uzupełniana przed każdym tygodniem.'
        : 'Zlecenie trafi do bufora zadań do obsady.',
    })
  }
  if (!draft.leaderId) {
    warnings.push({ step: 3, code: 'LEADER_MISSING', message: 'Nie wskazano lidera. To nie blokuje wysłania do realizacji.' })
  }
  if (!draft.driverId) {
    warnings.push({ step: 3, code: 'DRIVER_MISSING', message: 'Nie wskazano kierowcy. To nie blokuje wysłania do realizacji.' })
  }
  if (!draft.paymentMethod) {
    errors.push({ step: 4, code: 'PAYMENT_METHOD_REQUIRED', message: 'Wybierz sposób płatności.' })
  }
  if (!draft.pricingMode) {
    errors.push({ step: 4, code: 'PRICING_MODE_REQUIRED', message: 'Wybierz sposób rozliczenia zlecenia.' })
  }
  const amountText = String(draft.amount ?? '').trim()
  const amountValue = Number(amountText.replace(',', '.'))
  if (!String(draft.contractId ?? '').trim() && !(amountText && Number.isFinite(amountValue) && amountValue > 0)) {
    errors.push({ step: 4, code: 'PRICING_SOURCE_REQUIRED', message: 'Podaj kwotę albo wskaż kontrakt rozliczeniowy.' })
  }
  if (draft.paymentMethod === 'DEFERRED' && !String(draft.deferredDueDate ?? '').trim()) {
    errors.push({ step: 4, code: 'DEFERRED_DUE_DATE_REQUIRED', message: 'Dla terminu odroczonego wskaż termin płatności.' })
  }

  return {
    errors,
    warnings,
    ready: errors.length === 0,
    completedSteps: ORDER_CREATE_STEPS.map((_, step) => !errors.some((item) => item.step === step)),
  }
}

export function serializeOrderCreateDraft(draft = {}) {
  const normalized = createOrderCreateDraft(draft)
  return {
    ...normalized,
    siteId: normalized.objectId,
    title: normalized.serviceName,
    location: normalized.address,
    workerIds: normalized.staffingMode === 'FIXED' ? normalized.workerIds : [],
    assignmentMode: normalized.staffingMode,
    bufferRequiredPeople: normalized.staffingMode === 'FIXED' ? 0 : normalized.requiredPeople,
    billing: {
      paymentMethod: normalized.paymentMethod,
      pricingMode: normalized.pricingMode,
      amount: normalized.amount,
      contractId: normalized.contractId,
      deferredDueDate: normalized.deferredDueDate,
    },
    paymentDueDateYmd: normalized.deferredDueDate,
    status: 'DRAFT',
    source: 'ORDER_CREATE_V2',
  }
}
