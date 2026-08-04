import template from './template.html?raw'
import './orderCreate.css'
import {
  ORDER_CREATE_STEPS,
  ORDER_CREATE_WEEKDAYS,
  createOrderCreateDraft,
  endOfLocalYearYmd,
  orderCreateValidation,
  serializeOrderCreateDraft,
} from './model.js'

export const section = 'orders'
export const routes = ['orderCreate']
export const route = 'orderCreate'
export const viewId = 'view-orderCreate'
export { template }

const CREATE_ROUTE = 'orderCreate'

const ORDER_CREATE_ERROR_TARGETS = Object.freeze({
  OBJECT_REQUIRED: '[data-order-create-object-list]',
  DATE_REQUIRED: '[data-order-create-field="dateStart"]',
  TIME_REQUIRED: '[data-order-create-field="startTime"]',
  WEEKDAY_REQUIRED: '[data-order-create-weekday]',
  RECURRENCE_UNTIL_REQUIRED: '[data-order-create-field="recurrenceUntil"]',
  RECURRENCE_CONFIRMATION_REQUIRED: '[data-order-create-confirm-until]',
  SERVICE_NAME_REQUIRED: '[data-order-create-field="serviceName"]',
  ZONE_REQUIRED: '[data-order-create-zone-section]',
  TASK_REQUIRED: '[data-order-create-add-task]',
  SAFETY_CONFIRMATION_REQUIRED: '[data-order-create-confirm="safetyConfirmed"]',
  SUPPLIES_CONFIRMATION_REQUIRED: '[data-order-create-confirm="suppliesConfirmed"]',
  ACCESS_REQUIRED: '[data-order-create-field="accessNotes"]',
  ASSIGNEE_REQUIRED: '#orderCreateWorkerList',
  DISPATCH_DECISION_REQUIRED: '[data-order-create-choice="dispatchRequired"]',
  PAYMENT_METHOD_REQUIRED: '[data-order-create-field="paymentMethod"]',
  PRICING_MODE_REQUIRED: '[data-order-create-field="pricingMode"]',
  PRICING_SOURCE_REQUIRED: '[data-order-create-field="amount"]',
  DEFERRED_DUE_DATE_REQUIRED: '[data-order-create-field="deferredDueDate"]',
})

function stringValue(...values) {
  return values.map((value) => String(value ?? '').replace(/\s+/g, ' ').trim()).find(Boolean) ?? ''
}

function uniqueById(rows = []) {
  const seen = new Set()
  return rows.filter((row) => {
    const id = String(row?.id ?? '').trim()
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function normalizeObject(source = {}, client = null, index = 0) {
  const clientId = stringValue(source.clientId, source.client?.id, client?.id, client?.clientId)
  const clientLabel = stringValue(
    source.clientLabel,
    source.clientName,
    source.client?.name,
    client?.name,
    client?.clientName,
    client?.clientLabel,
  )
  const label = stringValue(
    source.objectLabel,
    source.siteName,
    source.objectName,
    source.buildingName,
    source.name,
    source.label,
    clientLabel,
  )
  const id = stringValue(source.objectId, source.siteId, source.id, source.clientId, clientId, `object-${index + 1}`)
  const address = stringValue(
    source.address,
    source.adres,
    source.location,
    source.street,
    source.ulica,
    client?.address,
    client?.adres,
    client?.street,
  )
  return { id, label: label || id, clientId: clientId || id, clientLabel: clientLabel || label || id, address, source }
}

function normalizeObjects(appState = {}, provided = []) {
  const rows = []
  const explicit = Array.isArray(provided) && provided.length
    ? provided
    : Array.isArray(appState.objects)
      ? appState.objects
      : []
  explicit.forEach((item, index) => rows.push(normalizeObject(item, null, index)))

  const clients = Array.isArray(appState.clients) ? appState.clients : []
  clients.forEach((client, clientIndex) => {
    const nested = [client?.objects, client?.obiekty, client?.sites, client?.buildings]
      .find((items) => Array.isArray(items) && items.length)
    if (nested) {
      nested.forEach((item, index) => rows.push(normalizeObject(item, client, rows.length + index)))
      return
    }
    rows.push(normalizeObject(client, client, rows.length + clientIndex))
  })
  return uniqueById(rows).sort((left, right) => left.label.localeCompare(right.label, 'pl', { sensitivity: 'base' }))
}

function normalizeZones(appState = {}, provided = []) {
  const source = Array.isArray(provided) && provided.length ? provided : Array.isArray(appState.zones) ? appState.zones : []
  return uniqueById(
    source.map((zone, index) => ({
      id: stringValue(zone?.id, zone?.zoneId, zone?.code, zone?.qrCode, `zone-${index + 1}`),
      label: stringValue(zone?.name, zone?.label, zone?.zoneName, zone?.code, zone?.qrCode, `Strefa ${index + 1}`),
      objectId: stringValue(zone?.objectId, zone?.siteId),
      clientId: stringValue(zone?.clientId, zone?.client),
      clientLabel: stringValue(zone?.clientLabel, zone?.clientName, zone?.objectName),
      source: zone,
    })),
  )
}

function normalizeWorkers(appState = {}, provided = [], resourcesFactory = null) {
  const resources = Array.isArray(provided) && provided.length
    ? provided
    : typeof resourcesFactory === 'function'
      ? resourcesFactory()
      : Array.isArray(appState.workers)
        ? appState.workers
        : []
  return uniqueById(
    (Array.isArray(resources) ? resources : [])
      .map((worker, index) => ({
        id: stringValue(worker?.workerId, worker?.id, worker?.uid, worker?.email, `worker-${index + 1}`),
        label: stringValue(worker?.name, worker?.workerName, worker?.label, worker?.fullName, worker?.email),
        role: stringValue(worker?.roleLabel, worker?.workerType, worker?.role),
        active: worker?.active !== false && worker?.isActive !== false,
        source: worker,
      }))
      .filter((worker) => worker.label && worker.active),
  ).sort((left, right) => left.label.localeCompare(right.label, 'pl', { sensitivity: 'base' }))
}

function initials(label = '') {
  const parts = String(label).trim().split(/\s+/).filter(Boolean)
  return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)[0]}` : parts[0]?.slice(0, 2) || '?').toUpperCase()
}

function nativeConfirm(message) {
  return typeof window === 'undefined' || typeof window.confirm !== 'function' ? true : window.confirm(message)
}

export function createOrderCreateFeature(ctx = {}) {
  const {
    appState = {},
    calendarTimelineResources,
    escapeHtml: escapeHtmlFromContext,
    normalizeSearchText: normalizeSearchTextFromContext,
    showPortalErrorNotice,
    showTransientNotice,
    todayYmd,
  } = ctx

  const escapeHtml = typeof escapeHtmlFromContext === 'function'
    ? escapeHtmlFromContext
    : (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      })[character])
  const normalizeSearchText = typeof normalizeSearchTextFromContext === 'function'
    ? normalizeSearchTextFromContext
    : (value) => String(value ?? '').toLocaleLowerCase('pl').normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  let controller = null
  let state = createState()

  function createState(seed = {}) {
    const draftSeed = { dateStart: typeof todayYmd === 'function' ? todayYmd() : undefined, ...(seed?.draft ?? seed) }
    return {
      currentStep: 0,
      objectQuery: '',
      workerQuery: '',
      draft: createOrderCreateDraft(draftSeed),
      objects: [],
      zones: [],
      workers: [],
      busy: '',
      loadError: '',
      actionError: '',
      validationRevealedSteps: new Set(),
      dirty: false,
      savedAt: '',
      savedDraftHash: String(seed?.draftHash || draftSeed?.draftHash || '').trim(),
      savedOrderId: String(draftSeed?.id || draftSeed?.orderId || '').trim(),
      acknowledgements: [],
      backendValidation: null,
      opened: false,
      sourceRoute: String(seed?.sourceRoute ?? seed?.returnRoute ?? 'dashboard'),
      returnRoute: String(seed?.returnRoute ?? seed?.sourceRoute ?? 'orders'),
      navigation: seed?.navigation ?? null,
    }
  }

  function rootElement(root = null) {
    return root?.id === 'view-orderCreate' ? root : document.getElementById('view-orderCreate')
  }

  function mountElement(root = null) {
    return rootElement(root)?.querySelector('#orderCreateMount') ?? document.getElementById('orderCreateMount')
  }

  function selectedObject() {
    return state.objects.find((item) => item.id === state.draft.objectId) ?? null
  }

  function zonesForSelectedObject() {
    const object = selectedObject()
    if (!object) return []
    const objectId = normalizeSearchText(object.id)
    const clientId = normalizeSearchText(object.clientId)
    const clientLabel = normalizeSearchText(object.clientLabel)
    return state.zones.filter((zone) => {
      const zoneObjectId = normalizeSearchText(zone.objectId)
      const zoneClientId = normalizeSearchText(zone.clientId)
      const zoneClientLabel = normalizeSearchText(zone.clientLabel)
      return Boolean(
        (objectId && zoneObjectId === objectId) ||
        (clientId && zoneClientId === clientId) ||
        (clientLabel && (zoneClientId === clientLabel || zoneClientLabel === clientLabel)),
      )
    })
  }

  function currentValidation() {
    const local = orderCreateValidation(state.draft)
    const backend = state.backendValidation
    if (!backend) return local
    const merge = (localRows, backendRows, type) => {
      const rows = [...localRows]
      const codes = new Set(rows.map((item) => String(item.code ?? '')))
      ;(Array.isArray(backendRows) ? backendRows : []).forEach((item, index) => {
        const code = stringValue(item?.code, `BACKEND_${type}_${index + 1}`)
        if (codes.has(code)) return
        codes.add(code)
        rows.push({
          step: Number.isInteger(item?.step) ? item.step : 4,
          code,
          message: stringValue(item?.message, item?.label, item?.path, code),
          source: 'BACKEND_JOB_CARD',
        })
      })
      return rows
    }
    const errors = merge(local.errors, backend.errors, 'ERROR')
    const warnings = merge(local.warnings, backend.warnings, 'WARNING')
    return {
      errors,
      warnings,
      ready: errors.length === 0 && backend.valid !== false && backend.validForPublication !== false,
      completedSteps: ORDER_CREATE_STEPS.map((_, step) => !errors.some((item) => item.step === step)),
    }
  }

  function stepErrors(step = state.currentStep) {
    return currentValidation().errors.filter((item) => item.step === step)
  }

  function hasStepError(code, validation = currentValidation()) {
    return validation.errors.some((item) => item.step === state.currentStep && item.code === code)
  }

  function issueClass(code, validation = currentValidation()) {
    return state.validationRevealedSteps.has(state.currentStep) && hasStepError(code, validation) ? ' has-error' : ''
  }

  function invalidAttribute(code, validation = currentValidation()) {
    return state.validationRevealedSteps.has(state.currentStep) && hasStepError(code, validation) ? ' aria-invalid="true"' : ''
  }

  function requiredBadge(label = 'Wymagane') {
    return `<small class="order-create-v2__required">${escapeHtml(label)}</small>`
  }

  function missingCountLabel(count) {
    if (count === 1) return '1 brak'
    if (count >= 2 && count <= 4) return `${count} braki`
    return `${count} braków`
  }

  function stepRequirementsHtml(validation = currentValidation()) {
    const errors = validation.errors.filter((item) => item.step === state.currentStep)
    if (!errors.length) {
      return `
        <section class="order-create-v2__step-requirements is-complete" aria-live="polite">
          <span class="order-create-v2__step-requirements-icon" aria-hidden="true">✓</span>
          <div><strong>Ten krok jest kompletny</strong><small>Możesz bezpiecznie przejść dalej.</small></div>
        </section>`
    }
    const revealed = state.validationRevealedSteps.has(state.currentStep)
    return `
      <section class="order-create-v2__step-requirements${revealed ? ' is-revealed' : ''}" ${revealed ? 'role="alert"' : 'aria-live="polite"'}>
        <span class="order-create-v2__step-requirements-icon" aria-hidden="true">!</span>
        <div class="order-create-v2__step-requirements-copy">
          <strong>${revealed ? 'Nie możemy jeszcze przejść dalej' : `Do uzupełnienia w tym kroku: ${errors.length}`}</strong>
          <small>Kliknij brakujący element, a pokażemy właściwe miejsce.</small>
          <div class="order-create-v2__step-requirements-list">
            ${errors.map((item) => `<button type="button" data-order-create-error-target="${escapeHtml(item.code)}" data-order-create-error-step="${item.step}"><span aria-hidden="true">○</span>${escapeHtml(item.message)}<b>Przejdź</b></button>`).join('')}
          </div>
        </div>
      </section>`
  }

  function focusValidationIssue(code) {
    let selector = ORDER_CREATE_ERROR_TARGETS[String(code ?? '')]
    if (code === 'TIME_REQUIRED' && String(state.draft.startTime ?? '').trim()) {
      selector = '[data-order-create-field="endTime"]'
    }
    if (!selector) return false
    const root = rootElement()
    const target = root?.querySelector(selector)
    if (!target) return false
    const focusable = target.matches?.('input, select, textarea, button')
      ? target
      : target.querySelector?.('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])')
    target.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    globalThis.requestAnimationFrame?.(() => focusable?.focus?.({ preventScroll: true }))
    return true
  }

  function revealStepErrors(step = state.currentStep, errors = stepErrors(step)) {
    state.validationRevealedSteps.add(step)
    state.actionError = errors.length === 1
      ? errors[0].message
      : `Uzupełnij ${errors.length} wymagane elementy w tym kroku.`
    render()
    if (errors[0]) globalThis.requestAnimationFrame?.(() => focusValidationIssue(errors[0].code))
  }

  function markDirty() {
    if (!state.dirty) {
      state.dirty = true
      ctx.onOrderCreateDirtyChange?.(true, serializeOrderCreateDraft(state.draft))
    }
    state.backendValidation = null
    state.acknowledgements = []
  }

  function notify(message, kind = 'info') {
    if (kind === 'error' && typeof showPortalErrorNotice === 'function') {
      showPortalErrorNotice(message)
      return
    }
    if (typeof showTransientNotice === 'function') {
      showTransientNotice(message, kind)
    }
  }

  async function loadSources(options = {}) {
    let provided = options?.sources ?? {}
    if (typeof ctx.ordersCreateWorkspaceOptions === 'function') {
      provided = { ...provided, ...(await ctx.ordersCreateWorkspaceOptions()) }
    } else if (typeof ctx.loadOrderCreateOptions === 'function') {
      provided = { ...provided, ...(await ctx.loadOrderCreateOptions({ route: CREATE_ROUTE })) }
    }
    state.objects = normalizeObjects(appState, provided.objects)
    state.zones = normalizeZones(appState, provided.zones)
    state.workers = normalizeWorkers(appState, provided.workers, calendarTimelineResources)
  }

  function statusLabel() {
    if (state.busy === 'save') return 'Zapisywanie roboczego zlecenia...'
    if (state.busy === 'publish') return 'Wysyłanie do realizacji...'
    if (state.dirty) return 'Niezapisane zmiany'
    if (state.savedAt) return `Robocze zlecenie zapisane ${state.savedAt}`
    if (state.savedOrderId) return 'Robocze zlecenie zapisane'
    return 'Nowe robocze zlecenie'
  }

  function stepRailHtml(validation) {
    return ORDER_CREATE_STEPS.map((step, index) => {
      const current = index === state.currentStep
      const done = validation.completedSteps[index] && index < state.currentStep
      const hasError = validation.errors.some((item) => item.step === index)
      const statusClass = current ? ' is-current' : done ? ' is-done' : hasError && index < state.currentStep ? ' has-error' : ''
      return `
        <button class="order-create-v2__step${statusClass}" type="button" data-order-create-step="${index}"${current ? ' aria-current="step"' : ''}>
          <span class="order-create-v2__step-number">${done ? '✓' : index + 1}</span>
          <span class="order-create-v2__step-copy">
            <strong>${escapeHtml(step.label)}</strong>
            <small>${escapeHtml(step.description)}</small>
          </span>
        </button>`
    }).join('')
  }

  function filteredObjects() {
    const query = normalizeSearchText(state.objectQuery)
    if (!query) return state.objects
    return state.objects.filter((item) => normalizeSearchText(`${item.label} ${item.clientLabel} ${item.address}`).includes(query))
  }

  function objectRowsHtml() {
    const rows = filteredObjects()
    if (!rows.length) {
      return `
        <div class="order-create-v2__empty">
          <strong>Nie znaleziono obiektu</strong>
          <span>Zmień wyszukiwanie albo dodaj nowy obiekt.</span>
        </div>`
    }
    return rows.map((item) => {
      const active = item.id === state.draft.objectId
      const zoneCount = state.zones.filter((zone) => {
        const objectId = normalizeSearchText(item.id)
        const clientId = normalizeSearchText(item.clientId)
        return normalizeSearchText(zone.objectId) === objectId || normalizeSearchText(zone.clientId) === clientId
      }).length
      return `
        <button class="order-create-v2__object${active ? ' is-selected' : ''}" type="button" data-order-create-object="${escapeHtml(item.id)}" aria-pressed="${active}">
          <span class="order-create-v2__object-icon" aria-hidden="true">⌂</span>
          <span class="order-create-v2__object-copy">
            <strong>${escapeHtml(item.label)}</strong>
            <span>${escapeHtml(item.clientLabel || 'Klient nieopisany')}</span>
            <small>${escapeHtml(item.address || 'Adres do uzupełnienia')}</small>
          </span>
          <span class="order-create-v2__object-meta">
            ${zoneCount ? `${zoneCount} ${zoneCount === 1 ? 'strefa' : 'stref'}` : 'Brak stref'}
            <b>${active ? 'Wybrano' : 'Wybierz'}</b>
          </span>
        </button>`
    }).join('')
  }

  function objectStepHtml() {
    return `
      <div class="order-create-v2__step-header">
        <span class="order-create-v2__eyebrow">Krok 1 z 5 · Obiekt</span>
        <h2>Wybierz obiekt, na którym zespół będzie pracować</h2>
        <p>Zlecenie powstaje na stabilnym identyfikatorze obiektu. Dzięki temu plan, QR i wykonanie można później połączyć bez zgadywania.</p>
      </div>
      <div class="order-create-v2__toolbar">
        <label class="order-create-v2__search">
          <span aria-hidden="true">⌕</span>
          <input id="orderCreateObjectSearch" type="search" value="${escapeHtml(state.objectQuery)}" placeholder="Szukaj obiektu lub klienta" autocomplete="off">
        </label>
        <button class="order-create-v2__button order-create-v2__button--secondary" type="button" data-order-create-new-object>
          <span aria-hidden="true">＋</span> Dodaj nowy obiekt
        </button>
      </div>
      ${stepRequirementsHtml()}
      <div class="order-create-v2__object-list${issueClass('OBJECT_REQUIRED')}" id="orderCreateObjectList" data-order-create-object-list>${objectRowsHtml()}</div>`
  }

  function radioCard(name, value, current, title, description, badge = '') {
    return `
      <label class="order-create-v2__choice${current === value ? ' is-selected' : ''}">
        <input type="radio" name="${escapeHtml(name)}" value="${escapeHtml(value)}" data-order-create-choice="${escapeHtml(name)}"${current === value ? ' checked' : ''}>
        <span class="order-create-v2__choice-indicator" aria-hidden="true"></span>
        <span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(description)}</small></span>
        ${badge ? `<b>${escapeHtml(badge)}</b>` : ''}
      </label>`
  }

  function rulesStepHtml() {
    const recurring = state.draft.scheduleMode === 'RECURRING'
    return `
      <div class="order-create-v2__step-header">
        <span class="order-create-v2__eyebrow">Krok 2 z 5 · Zasady</span>
        <h2>Ustal, kiedy i jak zlecenie ma wracać</h2>
        <p>Powtarzalność tworzy plan. Obsada tygodnia pozostaje osobną decyzją i może zmieniać się bez edycji całego kontraktu.</p>
      </div>
      ${stepRequirementsHtml()}
      <fieldset class="order-create-v2__fieldset">
        <legend>Rodzaj planu</legend>
        <div class="order-create-v2__choice-grid">
          ${radioCard('scheduleMode', 'ONE_OFF', state.draft.scheduleMode, 'Zlecenie jednorazowe', 'Jedna data i jeden plan wykonania.', 'Jednorazowe')}
          ${radioCard('scheduleMode', 'RECURRING', state.draft.scheduleMode, 'Zlecenie stałe', 'Cykl materializowany do wskazanej daty.', 'Cykliczne')}
        </div>
      </fieldset>
      <div class="order-create-v2__form-grid">
        <label class="order-create-v2__field${issueClass('DATE_REQUIRED')}">
          <span>${recurring ? 'Pierwszy dzień cyklu' : 'Data realizacji'} ${requiredBadge()}</span>
          <input type="date" value="${escapeHtml(state.draft.dateStart)}" data-order-create-field="dateStart"${invalidAttribute('DATE_REQUIRED')}>
        </label>
        <label class="order-create-v2__field${issueClass('TIME_REQUIRED')}">
          <span>Start planu ${requiredBadge()}</span>
          <input type="time" value="${escapeHtml(state.draft.startTime)}" data-order-create-field="startTime"${invalidAttribute('TIME_REQUIRED')}>
        </label>
        <label class="order-create-v2__field${issueClass('TIME_REQUIRED')}">
          <span>Koniec planu ${requiredBadge()}</span>
          <input type="time" value="${escapeHtml(state.draft.endTime)}" data-order-create-field="endTime"${invalidAttribute('TIME_REQUIRED')}>
          <small>Dla pracy nocnej koniec może przypadać następnego dnia.</small>
        </label>
      </div>
      ${recurring ? `
        <fieldset class="order-create-v2__fieldset${issueClass('WEEKDAY_REQUIRED')}">
          <legend>Dni realizacji ${requiredBadge()}</legend>
          <div class="order-create-v2__weekday-grid">
            ${ORDER_CREATE_WEEKDAYS.map((day) => `
              <label class="order-create-v2__weekday${state.draft.weekdays.includes(day.value) ? ' is-selected' : ''}" title="${escapeHtml(day.label)}">
                <input type="checkbox" value="${day.value}" data-order-create-weekday${state.draft.weekdays.includes(day.value) ? ' checked' : ''}>
                <span>${escapeHtml(day.short)}</span>
              </label>`).join('')}
          </div>
        </fieldset>
        <div class="order-create-v2__recurrence-confirmation${state.draft.recurrenceUntilConfirmed ? ' is-confirmed' : ''}">
          <label class="order-create-v2__field${issueClass('RECURRENCE_UNTIL_REQUIRED')}">
            <span>Materializuj plan do ${requiredBadge()}</span>
            <input type="date" value="${escapeHtml(state.draft.recurrenceUntil)}" data-order-create-field="recurrenceUntil"${invalidAttribute('RECURRENCE_UNTIL_REQUIRED')}>
          </label>
          <label class="order-create-v2__checkline${issueClass('RECURRENCE_CONFIRMATION_REQUIRED')}">
            <input type="checkbox" data-order-create-confirm-until${state.draft.recurrenceUntilConfirmed ? ' checked' : ''}${invalidAttribute('RECURRENCE_CONFIRMATION_REQUIRED')}>
            <span><strong>Potwierdzam zakres planowania ${requiredBadge()}</strong><small>System proponuje koniec roku, ale data musi być świadomie zaakceptowana.</small></span>
          </label>
        </div>` : ''}
      <fieldset class="order-create-v2__fieldset">
        <legend>Sposób realizacji</legend>
        <div class="order-create-v2__choice-grid">
          ${radioCard('siteMode', 'FIXED_CONTRACT_SITE', state.draft.siteMode, 'Stały obiekt kontraktowy', 'Zespół pracuje na znanym, zapisanym obiekcie.')}
          ${radioCard('siteMode', 'VISIT_SITE', state.draft.siteMode, 'Wizyta usługowa', 'Jednorazowa lub okresowa wizyta pod tym adresem.')}
        </div>
      </fieldset>`
  }

  function taskRowHtml(task, index, zones) {
    const titleMissing = !String(task.title ?? '').trim() && hasStepError('TASK_REQUIRED')
    return `
      <article class="order-create-v2__task${state.validationRevealedSteps.has(state.currentStep) && titleMissing ? ' has-error' : ''}" data-order-create-task-row="${escapeHtml(task.id)}">
        <div class="order-create-v2__task-index">${index + 1}</div>
        <div class="order-create-v2__task-fields">
          <label class="order-create-v2__field${state.validationRevealedSteps.has(state.currentStep) && titleMissing ? ' has-error' : ''}">
            <span>Co trzeba zrobić? ${requiredBadge()}</span>
            <input type="text" value="${escapeHtml(task.title)}" placeholder="Np. mycie podłogi" data-order-create-task-field="title"${state.validationRevealedSteps.has(state.currentStep) && titleMissing ? ' aria-invalid="true"' : ''}>
          </label>
          <label class="order-create-v2__field">
            <span>Gdzie?</span>
            <select data-order-create-task-field="zoneId">
              <option value="">Wybierz strefę</option>
              ${zones.map((zone) => `<option value="${escapeHtml(zone.id)}"${zone.id === task.zoneId ? ' selected' : ''}>${escapeHtml(zone.label)}</option>`).join('')}
            </select>
          </label>
          <label class="order-create-v2__field order-create-v2__field--wide">
            <span>Jak wykonać?</span>
            <input type="text" value="${escapeHtml(task.instruction)}" placeholder="Krótka instrukcja dla zespołu" data-order-create-task-field="instruction">
          </label>
          <label class="order-create-v2__field order-create-v2__field--wide">
            <span>Oczekiwany rezultat</span>
            <input type="text" value="${escapeHtml(task.expectedResult)}" placeholder="Po czym poznamy, że zadanie wykonano?" data-order-create-task-field="expectedResult">
          </label>
        </div>
        <button class="order-create-v2__icon-button" type="button" data-order-create-remove-task="${escapeHtml(task.id)}" aria-label="Usuń zadanie">×</button>
      </article>`
  }

  function scopeStepHtml() {
    const zones = zonesForSelectedObject()
    return `
      <div class="order-create-v2__step-header">
        <span class="order-create-v2__eyebrow">Krok 3 z 5 · Zakres prac</span>
        <h2>Opisz efekt, który zespół ma dostarczyć</h2>
        <p>Strefy i zadania trafiają do Karty Zlecenia. Nie wyliczamy czasu bez danych — plan godzinowy ustalasz świadomie.</p>
      </div>
      ${stepRequirementsHtml()}
      <div class="order-create-v2__form-grid order-create-v2__form-grid--two">
        <label class="order-create-v2__field${issueClass('SERVICE_NAME_REQUIRED')}">
          <span>Nazwa usługi ${requiredBadge()}</span>
          <input type="text" value="${escapeHtml(state.draft.serviceName)}" placeholder="Np. stałe sprzątanie biura" data-order-create-field="serviceName"${invalidAttribute('SERVICE_NAME_REQUIRED')}>
        </label>
        <label class="order-create-v2__field">
          <span>Cel usługi <small>(opcjonalnie)</small></span>
          <input type="text" value="${escapeHtml(state.draft.serviceGoal)}" placeholder="Jaki efekt biznesowy ma dać usługa?" data-order-create-field="serviceGoal">
        </label>
      </div>
      <fieldset class="order-create-v2__fieldset${issueClass('ZONE_REQUIRED')}" data-order-create-zone-section>
        <legend>Strefy objęte zleceniem ${requiredBadge()}</legend>
        ${zones.length ? `
          <div class="order-create-v2__zone-grid">
            ${zones.map((zone) => `
              <label class="order-create-v2__zone${state.draft.zoneIds.includes(zone.id) ? ' is-selected' : ''}">
                <input type="checkbox" value="${escapeHtml(zone.id)}" data-order-create-zone${state.draft.zoneIds.includes(zone.id) ? ' checked' : ''}>
                <span aria-hidden="true">▦</span>
                <strong>${escapeHtml(zone.label)}</strong>
              </label>`).join('')}
          </div>` : `
          <div class="order-create-v2__inline-warning">
            <strong>Ten obiekt nie ma jeszcze stref</strong>
            <span>Dodaj strefy w profilu obiektu, aby zbudować jednoznaczny zakres Karty Zlecenia.</span>
          </div>`}
      </fieldset>
      <div class="order-create-v2__section-heading">
        <div><span>Zadania ${requiredBadge()}</span><small>Każde zadanie wskazuje co, gdzie, jak i z jakim wynikiem.</small></div>
        <button class="order-create-v2__button order-create-v2__button--secondary" type="button" data-order-create-add-task>＋ Dodaj zadanie</button>
      </div>
      <div class="order-create-v2__task-list${issueClass('TASK_REQUIRED')}">
        ${state.draft.tasks.length
          ? state.draft.tasks.map((task, index) => taskRowHtml(task, index, zones)).join('')
          : `<button class="order-create-v2__empty-action" type="button" data-order-create-add-task><span>＋</span><strong>Dodaj pierwsze zadanie</strong><small>Zakres nie będzie zgadywany na podstawie samej nazwy obiektu.</small></button>`}
      </div>
      <div class="order-create-v2__confirmation-grid">
        <label class="order-create-v2__checkline${issueClass('SAFETY_CONFIRMATION_REQUIRED')}">
          <input type="checkbox" data-order-create-confirm="safetyConfirmed"${state.draft.safetyConfirmed ? ' checked' : ''}${invalidAttribute('SAFETY_CONFIRMATION_REQUIRED')}>
          <span><strong>Wymagania bezpieczeństwa są opisane ${requiredBadge()}</strong><small>Jeśli ich nie ma, potwierdzasz świadomie „brak dodatkowych wymagań”.</small></span>
        </label>
        <label class="order-create-v2__checkline${issueClass('SUPPLIES_CONFIRMATION_REQUIRED')}">
          <input type="checkbox" data-order-create-confirm="suppliesConfirmed"${state.draft.suppliesConfirmed ? ' checked' : ''}${invalidAttribute('SUPPLIES_CONFIRMATION_REQUIRED')}>
          <span><strong>Sprzęt i środki są ustalone ${requiredBadge()}</strong><small>Jeśli nie są potrzebne, potwierdzasz świadomie „brak”.</small></span>
        </label>
      </div>
      <label class="order-create-v2__field${issueClass('ACCESS_REQUIRED')}">
        <span>Dostęp do obiektu i uwagi dla zespołu ${requiredBadge('Wpisz lub potwierdź brak')}</span>
        <textarea rows="3" placeholder="Klucze, alarm, wejście, kontakt na miejscu..." data-order-create-field="accessNotes"${state.draft.accessConfirmedNone ? ' disabled' : ''}${invalidAttribute('ACCESS_REQUIRED')}>${escapeHtml(state.draft.accessNotes)}</textarea>
      </label>
      <label class="order-create-v2__checkline order-create-v2__checkline--standalone${issueClass('ACCESS_REQUIRED')}">
        <input type="checkbox" data-order-create-confirm="accessConfirmedNone"${state.draft.accessConfirmedNone ? ' checked' : ''}${invalidAttribute('ACCESS_REQUIRED')}>
        <span><strong>Brak dodatkowych zasad dostępu</strong><small>Potwierdzam świadomie, że zespół nie potrzebuje dodatkowych instrukcji wejścia.</small></span>
      </label>`
  }

  function workerListHtml() {
    const query = normalizeSearchText(state.workerQuery)
    const workers = state.workers.filter((worker) => !query || normalizeSearchText(`${worker.label} ${worker.role}`).includes(query))
    if (!workers.length) return `<div class="order-create-v2__empty"><strong>Brak pracowników</strong><span>Zmień wyszukiwanie albo uzupełnij zasoby.</span></div>`
    return workers.map((worker) => {
      const selected = state.draft.workerIds.includes(worker.id)
      return `
        <label class="order-create-v2__worker${selected ? ' is-selected' : ''}">
          <input type="checkbox" value="${escapeHtml(worker.id)}" data-order-create-worker${selected ? ' checked' : ''}>
          <span class="order-create-v2__avatar" aria-hidden="true">${escapeHtml(initials(worker.label))}</span>
          <span><strong>${escapeHtml(worker.label)}</strong><small>${escapeHtml(worker.role || 'Pracownik')}</small></span>
          <b>${selected ? 'Wybrano' : 'Dodaj'}</b>
        </label>`
    }).join('')
  }

  function workerOptions(selectedId = '') {
    return [
      '<option value="">Nie wskazano</option>',
      ...state.workers.map((worker) => `<option value="${escapeHtml(worker.id)}"${worker.id === selectedId ? ' selected' : ''}>${escapeHtml(worker.label)}</option>`),
    ].join('')
  }

  function staffingStepHtml() {
    const fixed = state.draft.staffingMode === 'FIXED'
    return `
      <div class="order-create-v2__step-header">
        <span class="order-create-v2__eyebrow">Krok 4 z 5 · Obsada</span>
        <h2>Zdecyduj, jak zespół będzie obsadzany</h2>
        <p>Stałe zlecenie może mieć stały zespół albo trafiać co tydzień do bufora koordynatora. Brak osoby nie usuwa planu.</p>
      </div>
      ${stepRequirementsHtml()}
      <fieldset class="order-create-v2__fieldset">
        <legend>Model obsady</legend>
        <div class="order-create-v2__choice-grid order-create-v2__choice-grid--three">
          ${radioCard('staffingMode', 'FIXED', state.draft.staffingMode, 'Stała obsada', 'Te same osoby są przypisane do planu.', 'Najprościej')}
          ${radioCard('staffingMode', 'VARIABLE_WEEKLY', state.draft.staffingMode, 'Obsada tygodniowa', 'Koordynator wskazuje osoby na kolejny tydzień.', 'Elastycznie')}
          ${radioCard('staffingMode', 'BUFFER', state.draft.staffingMode, 'Bufor zadań', 'Plan istnieje, ale czeka na przeciągnięcie do osoby.', 'Do obsady')}
        </div>
      </fieldset>
      <div class="order-create-v2__form-grid order-create-v2__form-grid--three">
        <label class="order-create-v2__field">
          <span>Wymagana liczba osób</span>
          <input type="number" min="1" max="99" value="${escapeHtml(state.draft.requiredPeople)}" data-order-create-field="requiredPeople">
        </label>
        <label class="order-create-v2__field">
          <span>Lider <small>(ostrzeżenie, nie blokada)</small></span>
          <select data-order-create-field="leaderId">${workerOptions(state.draft.leaderId)}</select>
        </label>
        <label class="order-create-v2__field">
          <span>Kierowca <small>(ostrzeżenie, nie blokada)</small></span>
          <select data-order-create-field="driverId">${workerOptions(state.draft.driverId)}</select>
        </label>
      </div>
      <fieldset class="order-create-v2__fieldset${issueClass('DISPATCH_DECISION_REQUIRED')}">
        <legend>Organizacja dojazdu ${requiredBadge()}</legend>
        <div class="order-create-v2__choice-grid">
          ${radioCard('dispatchRequired', 'YES', state.draft.dispatchRequired === true ? 'YES' : state.draft.dispatchRequired === false ? 'NO' : '', 'Dojazd wymaga organizacji', 'Koordynator uwzględni transport lub kierowcę.')}
          ${radioCard('dispatchRequired', 'NO', state.draft.dispatchRequired === true ? 'YES' : state.draft.dispatchRequired === false ? 'NO' : '', 'Dojazd we własnym zakresie', 'Nie trzeba organizować transportu dla zespołu.')}
        </div>
      </fieldset>
      ${fixed ? `
        <div class="order-create-v2__section-heading">
          <div><span>Pracownicy</span><small>Wybrano ${state.draft.workerIds.length} z ${state.draft.requiredPeople} wymaganych.</small></div>
          <label class="order-create-v2__search order-create-v2__search--compact">
            <span aria-hidden="true">⌕</span>
            <input id="orderCreateWorkerSearch" type="search" value="${escapeHtml(state.workerQuery)}" placeholder="Szukaj pracownika" autocomplete="off">
          </label>
        </div>
        <div class="order-create-v2__worker-grid${issueClass('ASSIGNEE_REQUIRED')}" id="orderCreateWorkerList">${workerListHtml()}</div>` : `
        <div class="order-create-v2__buffer-preview">
          <span class="order-create-v2__buffer-icon" aria-hidden="true">↔</span>
          <div>
            <strong>${state.draft.staffingMode === 'VARIABLE_WEEKLY' ? 'Zlecenie będzie wracać do obsady tygodnia' : 'Zlecenie trafi do bufora zadań do obsady'}</strong>
            <p>Koordynator zobaczy brak ${state.draft.requiredPeople} ${state.draft.requiredPeople === 1 ? 'osoby' : 'osób'} w kalendarzu i przeciągnie plan do właściwych pracowników.</p>
          </div>
        </div>`}
      <div class="order-create-v2__inline-info">
        <strong>Plan i wykonanie pozostają osobnymi źródłami danych</strong>
        <span>Po QR START system porówna faktyczną obecność z tą obsadą i pokaże nieprawidłowości w kalendarzu.</span>
      </div>`
  }

  function publicationStepHtml(validation) {
    const selected = selectedObject()
    return `
      <div class="order-create-v2__step-header">
        <span class="order-create-v2__eyebrow">Krok 5 z 5 · Zatwierdzenie</span>
        <h2>Sprawdź zlecenie przed wysłaniem do realizacji</h2>
        <p>Zapis roboczego zlecenia i wysłanie go do realizacji to dwie różne decyzje. Zatwierdzona Karta ma własną, niezmienną rewizję.</p>
      </div>
      ${stepRequirementsHtml(validation)}
      <fieldset class="order-create-v2__fieldset order-create-v2__billing">
        <legend>Rozliczenie zlecenia</legend>
        <div class="order-create-v2__form-grid order-create-v2__form-grid--two">
          <label class="order-create-v2__field${issueClass('PAYMENT_METHOD_REQUIRED', validation)}">
            <span>Sposób płatności ${requiredBadge()}</span>
            <select data-order-create-field="paymentMethod"${invalidAttribute('PAYMENT_METHOD_REQUIRED', validation)}>
              <option value="">Wybierz</option>
              <option value="PREPAID"${state.draft.paymentMethod === 'PREPAID' ? ' selected' : ''}>Przedpłata</option>
              <option value="CASH"${state.draft.paymentMethod === 'CASH' ? ' selected' : ''}>Gotówka</option>
              <option value="CARD"${state.draft.paymentMethod === 'CARD' ? ' selected' : ''}>Karta</option>
              <option value="DEFERRED"${state.draft.paymentMethod === 'DEFERRED' ? ' selected' : ''}>Termin odroczony</option>
            </select>
          </label>
          <label class="order-create-v2__field${issueClass('PRICING_MODE_REQUIRED', validation)}">
            <span>Model ceny ${requiredBadge()}</span>
            <select data-order-create-field="pricingMode"${invalidAttribute('PRICING_MODE_REQUIRED', validation)}>
              <option value="">Wybierz</option>
              <option value="PER_JOB"${state.draft.pricingMode === 'PER_JOB' ? ' selected' : ''}>Za całe zlecenie</option>
              <option value="HOURLY"${state.draft.pricingMode === 'HOURLY' ? ' selected' : ''}>Godzinowo</option>
              <option value="PER_OCCURRENCE"${state.draft.pricingMode === 'PER_OCCURRENCE' ? ' selected' : ''}>Za wystąpienie</option>
              <option value="MONTHLY_CONTRACT"${state.draft.pricingMode === 'MONTHLY_CONTRACT' ? ' selected' : ''}>Kontrakt miesięczny</option>
            </select>
          </label>
          <label class="order-create-v2__field${issueClass('PRICING_SOURCE_REQUIRED', validation)}">
            <span>Kwota <small>(PLN)</small> ${requiredBadge('Kwota lub kontrakt')}</span>
            <input type="number" min="0" step="0.01" value="${escapeHtml(state.draft.amount)}" placeholder="0,00" data-order-create-field="amount"${invalidAttribute('PRICING_SOURCE_REQUIRED', validation)}>
            <small>Kwota albo identyfikator kontraktu są wymagane.</small>
          </label>
          <label class="order-create-v2__field${issueClass('PRICING_SOURCE_REQUIRED', validation)}">
            <span>Kontrakt rozliczeniowy ${requiredBadge('Kwota lub kontrakt')}</span>
            <input type="text" value="${escapeHtml(state.draft.contractId)}" placeholder="Wybierz lub wpisz ID kontraktu" data-order-create-field="contractId"${invalidAttribute('PRICING_SOURCE_REQUIRED', validation)}>
          </label>
          ${state.draft.paymentMethod === 'DEFERRED' ? `
            <label class="order-create-v2__field${issueClass('DEFERRED_DUE_DATE_REQUIRED', validation)}">
              <span>Termin płatności ${requiredBadge()}</span>
              <input type="date" value="${escapeHtml(state.draft.deferredDueDate)}" data-order-create-field="deferredDueDate"${invalidAttribute('DEFERRED_DUE_DATE_REQUIRED', validation)}>
            </label>` : ''}
        </div>
        <div class="order-create-v2__inline-info">
          <strong>Potwierdzenie wykonania</strong>
          <span>Po zakończeniu klient potwierdzi „OK” podpisem na ekranie telefonu. Reklamacje obsługuje osobna ścieżka — wysłanie zlecenia do realizacji nie tworzy automatycznego zwrotu.</span>
        </div>
      </fieldset>
      <div class="order-create-v2__readiness${validation.ready ? ' is-ready' : ''}">
        <span class="order-create-v2__readiness-icon" aria-hidden="true">${validation.ready ? '✓' : '!'}</span>
        <div>
          <strong>${validation.ready ? 'Zlecenie jest gotowe do wysłania do realizacji' : `${validation.errors.length} ${validation.errors.length === 1 ? 'element wymaga' : 'elementy wymagają'} uzupełnienia`}</strong>
          <span>${validation.ready ? 'Zatwierdzenie utworzy nową, niezmienną rewizję Karty Zlecenia.' : 'Możesz zapisać robocze zlecenie teraz i wrócić do brakujących informacji później.'}</span>
        </div>
      </div>
      <div class="order-create-v2__review-grid">
        <article>
          <span>Obiekt</span>
          <strong>${escapeHtml(selected?.label || 'Nie wybrano')}</strong>
          <small>${escapeHtml(selected?.address || 'Brak adresu')}</small>
          <button type="button" data-order-create-step="0">Edytuj</button>
        </article>
        <article>
          <span>Termin</span>
          <strong>${escapeHtml(scheduleSummary())}</strong>
          <small>${escapeHtml(`${state.draft.startTime}–${state.draft.endTime}`)}</small>
          <button type="button" data-order-create-step="1">Edytuj</button>
        </article>
        <article>
          <span>Zakres</span>
          <strong>${escapeHtml(state.draft.serviceName || 'Nie nazwano usługi')}</strong>
          <small>${state.draft.zoneIds.length} stref · ${state.draft.tasks.length} zadań</small>
          <button type="button" data-order-create-step="2">Edytuj</button>
        </article>
        <article>
          <span>Obsada</span>
          <strong>${escapeHtml(staffingSummary())}</strong>
          <small>${state.draft.staffingMode === 'FIXED' ? `${state.draft.workerIds.length} przypisanych` : `${state.draft.requiredPeople} miejsc do obsady`}</small>
          <button type="button" data-order-create-step="3">Edytuj</button>
        </article>
      </div>
      ${validation.errors.length ? `
        <section class="order-create-v2__issues order-create-v2__issues--errors">
          <h3>Do uzupełnienia</h3>
          ${validation.errors.map((item) => `<button type="button" data-order-create-step="${item.step}"><span>!</span>${escapeHtml(item.message)}<b>Przejdź</b></button>`).join('')}
        </section>` : ''}
      ${validation.warnings.length ? `
        <section class="order-create-v2__issues order-create-v2__issues--warnings">
          <h3>Wyraźne ostrzeżenia</h3>
          ${validation.warnings.map((item) => `
            <label>
              <input type="checkbox" value="${escapeHtml(item.code)}" data-order-create-acknowledgement${state.acknowledgements.includes(item.code) ? ' checked' : ''}>
              <span>!</span>
              <span>${escapeHtml(item.message)}<small>Potwierdź zapoznanie się; samo ostrzeżenie nie blokuje decyzji.</small></span>
            </label>`).join('')}
        </section>` : ''}
      <div class="order-create-v2__publication-flow">
        <div><span>1</span><strong>Zapisz robocze zlecenie</strong><small>Można dalej edytować.</small></div>
        <i aria-hidden="true">→</i>
        <div><span>2</span><strong>Zatwierdź i wyślij</strong><small>Powstaje rewizja.</small></div>
        <i aria-hidden="true">→</i>
        <div><span>3</span><strong>Obsadź wystąpienia</strong><small>Osobna decyzja tygodniowa.</small></div>
      </div>`
  }

  function stepContentHtml(validation) {
    return [objectStepHtml, rulesStepHtml, scopeStepHtml, staffingStepHtml][state.currentStep]?.() ?? publicationStepHtml(validation)
  }

  function scheduleSummary() {
    if (state.draft.scheduleMode === 'ONE_OFF') return `Jednorazowo · ${state.draft.dateStart || 'bez daty'}`
    const days = ORDER_CREATE_WEEKDAYS.filter((day) => state.draft.weekdays.includes(day.value)).map((day) => day.short).join(', ')
    return `Cyklicznie ${days || 'bez dni'} · do ${state.draft.recurrenceUntil || 'bez końca'}`
  }

  function staffingSummary() {
    if (state.draft.staffingMode === 'FIXED') return `Stała obsada · ${state.draft.workerIds.length}/${state.draft.requiredPeople}`
    if (state.draft.staffingMode === 'VARIABLE_WEEKLY') return `Obsada tygodniowa · ${state.draft.requiredPeople} os.`
    return `Bufor do obsady · ${state.draft.requiredPeople} os.`
  }

  function summaryHtml(validation) {
    const object = selectedObject()
    const currentErrors = validation.errors.filter((item) => item.step === state.currentStep)
    const laterErrors = validation.errors.filter((item) => item.step > state.currentStep)
    return `
      <div class="order-create-v2__summary-heading">
        <div><span>Podsumowanie</span><small>Aktualizuje się na bieżąco</small></div>
        <b>${state.currentStep + 1} z 5</b>
      </div>
      <dl class="order-create-v2__summary-list">
        <div><dt>Klient</dt><dd id="orderCreateSummaryClient">${escapeHtml(object?.clientLabel || '—')}</dd></div>
        <div><dt>Obiekt</dt><dd id="orderCreateSummaryObject">${escapeHtml(object?.label || '—')}</dd></div>
        <div><dt>Adres</dt><dd id="orderCreateSummaryAddress">${escapeHtml(object?.address || '—')}</dd></div>
        <div><dt>Termin</dt><dd id="orderCreateSummarySchedule">${escapeHtml(scheduleSummary())}</dd></div>
        <div><dt>Zakres</dt><dd id="orderCreateSummaryScope">${escapeHtml(state.draft.serviceName || 'Do uzupełnienia')}</dd></div>
        <div><dt>Obsada</dt><dd id="orderCreateSummaryStaffing">${escapeHtml(staffingSummary())}</dd></div>
      </dl>
      <div class="order-create-v2__progress" aria-label="Postęp kreatora: ${state.currentStep + 1} z 5 kroków">
        <span><i style="width:${(state.currentStep + 1) * 20}%"></i></span>
        <small>${state.currentStep + 1} z 5 kroków</small>
      </div>
      <div class="order-create-v2__summary-readiness${validation.ready ? ' is-ready' : ''}" id="orderCreateSummaryReadiness">
        <span aria-hidden="true">${validation.ready ? '✓' : '!'}</span>
        <div><strong>${validation.ready ? 'Gotowe do wysłania do realizacji' : currentErrors.length ? `${currentErrors.length} do uzupełnienia teraz` : 'Ten krok jest kompletny'}</strong><small>${laterErrors.length ? `${laterErrors.length} w kolejnych krokach` : `${validation.warnings.length} ostrzeżeń, które nie blokują`}</small></div>
      </div>
      ${currentErrors.length ? `
        <div class="order-create-v2__summary-missing" aria-label="Brakujące dane w bieżącym kroku">
          <strong>Wymagane teraz</strong>
          ${currentErrors.map((item) => `<button type="button" data-order-create-error-target="${escapeHtml(item.code)}" data-order-create-error-step="${item.step}"><span aria-hidden="true">!</span>${escapeHtml(item.message)}</button>`).join('')}
        </div>` : ''}
      <div class="order-create-v2__summary-note">
        <strong>Karta Zlecenia powstaje automatycznie</strong>
        <span>Nie tworzysz drugiego dokumentu. Ten formularz jest jednym źródłem planu.</span>
      </div>`
  }

  function footerHtml(validation) {
    const last = state.currentStep === ORDER_CREATE_STEPS.length - 1
    const currentErrors = validation.errors.filter((item) => item.step === state.currentStep)
    const allWarningsAcknowledged = validation.warnings.every((item) => state.acknowledgements.includes(item.code))
    return `
      <div class="order-create-v2__footer-copy${state.actionError ? ' has-error' : ''}" role="status" aria-live="polite">
        <strong id="orderCreateStatus">${escapeHtml(statusLabel())}</strong>
        <span>${state.actionError ? escapeHtml(state.actionError) : last ? (validation.ready ? 'Wszystkie pola wymagane są kompletne.' : 'Robocze zlecenie można zapisać mimo braków.') : 'Zmiany pozostają lokalne do zapisu roboczego zlecenia.'}</span>
      </div>
      <div class="order-create-v2__footer-actions">
        <button class="order-create-v2__button order-create-v2__button--quiet" type="button" data-order-create-cancel>Anuluj</button>
        ${state.currentStep > 0 ? '<button class="order-create-v2__button order-create-v2__button--secondary" type="button" data-order-create-back>Wstecz</button>' : ''}
        <button class="order-create-v2__button order-create-v2__button--secondary" type="button" data-order-create-save${state.busy ? ' disabled' : ''}>${state.busy === 'save' ? 'Zapisywanie...' : 'Zapisz robocze zlecenie'}</button>
        ${last
          ? `<button class="order-create-v2__button order-create-v2__button--primary" type="button" data-order-create-publish${!validation.ready || !allWarningsAcknowledged || state.busy ? ' disabled' : ''}>${state.busy === 'publish' ? 'Wysyłanie...' : 'Zatwierdź i wyślij do realizacji'}</button>`
          : `<button class="order-create-v2__button order-create-v2__button--primary" type="button" data-order-create-next>Dalej: ${escapeHtml(ORDER_CREATE_STEPS[state.currentStep + 1].label.toLocaleLowerCase('pl'))}${currentErrors.length ? `<span class="order-create-v2__button-count">${escapeHtml(missingCountLabel(currentErrors.length))}</span>` : ''}</button>`}
      </div>`
  }

  function render(root = null) {
    const mount = mountElement(root)
    if (!mount) return false
    const validation = currentValidation()
    mount.innerHTML = `
      <div class="order-create-v2__workspace">
        <header class="order-create-v2__header">
          <div>
            <span class="order-create-v2__eyebrow">Plan zespołu i Karta Zlecenia</span>
            <h1 id="orderCreateTitle">${state.savedOrderId ? 'Edytuj robocze zlecenie' : 'Nowe zlecenie'}</h1>
            <p>Zaplanuj obiekt, zasady, zakres i obsadę w jednym procesie.</p>
          </div>
          <span class="order-create-v2__draft-status${state.dirty ? ' is-dirty' : ''}"><i aria-hidden="true"></i>${escapeHtml(statusLabel())}</span>
        </header>
        <div class="order-create-v2__body">
          <aside class="order-create-v2__rail" aria-label="Kroki kreatora">
            <nav>${stepRailHtml(validation)}</nav>
            <div class="order-create-v2__rail-help"><span aria-hidden="true">?</span><div><strong>Bez zgadywania</strong><small>Najpierw zapisz robocze zlecenie, potem wyślij je do realizacji.</small></div></div>
          </aside>
          <main class="order-create-v2__content">${stepContentHtml(validation)}</main>
          <aside class="order-create-v2__summary" aria-label="Podsumowanie zlecenia">${summaryHtml(validation)}</aside>
        </div>
        <footer class="order-create-v2__footer">${footerHtml(validation)}</footer>
      </div>`
    return true
  }

  function updateSummaryDom() {
    const object = selectedObject()
    const values = {
      orderCreateSummaryClient: object?.clientLabel || '—',
      orderCreateSummaryObject: object?.label || '—',
      orderCreateSummaryAddress: object?.address || '—',
      orderCreateSummarySchedule: scheduleSummary(),
      orderCreateSummaryScope: state.draft.serviceName || 'Do uzupełnienia',
      orderCreateSummaryStaffing: staffingSummary(),
      orderCreateStatus: statusLabel(),
    }
    Object.entries(values).forEach(([id, value]) => {
      const node = document.getElementById(id)
      if (node) node.textContent = value
    })
  }

  function renderObjectRows() {
    const list = document.getElementById('orderCreateObjectList')
    if (list) list.innerHTML = objectRowsHtml()
  }

  function renderWorkerRows() {
    const list = document.getElementById('orderCreateWorkerList')
    if (list) list.innerHTML = workerListHtml()
  }

  function selectObject(id = '') {
    const object = state.objects.find((item) => item.id === String(id))
    if (!object) return
    state.draft.objectId = object.id
    state.draft.clientId = object.clientId
    state.draft.clientLabel = object.clientLabel
    state.draft.objectLabel = object.label
    state.draft.address = object.address
    const validZoneIds = new Set(zonesForSelectedObject().map((zone) => zone.id))
    state.draft.zoneIds = state.draft.zoneIds.filter((zoneId) => validZoneIds.has(zoneId))
    state.draft.tasks = state.draft.tasks.map((task) => validZoneIds.has(task.zoneId) ? task : { ...task, zoneId: '' })
    markDirty()
    render()
  }

  function setCurrentStep(nextStep, options = {}) {
    const step = Math.max(0, Math.min(ORDER_CREATE_STEPS.length - 1, Number(nextStep) || 0))
    if (!options.force && step > state.currentStep) {
      const blocking = currentValidation().errors.find((item) => item.step >= state.currentStep && item.step < step)
      if (blocking) {
        state.currentStep = blocking.step
        revealStepErrors(blocking.step, stepErrors(blocking.step))
        return false
      }
    }
    state.currentStep = step
    state.actionError = ''
    render()
    rootElement()?.scrollIntoView?.({ block: 'start', behavior: options.instant ? 'auto' : 'smooth' })
    return true
  }

  async function addNewObject() {
    const callback = ctx.onOrderCreateNewObject ?? ctx.openClientModal
    if (typeof callback !== 'function') {
      notify('Dodawanie nowego obiektu wymaga podłączenia formularza obiektu.', 'info')
      return
    }
    try {
      const result = await callback({
        mode: 'add',
        source: 'ORDER_CREATE_V2',
        returnRoute: CREATE_ROUTE,
        draft: serializeOrderCreateDraft(state.draft),
      })
      if (!result) return
      const object = normalizeObject(result, result.client ?? null, state.objects.length)
      state.objects = uniqueById([...state.objects, object])
      selectObject(object.id)
    } catch (error) {
      state.actionError = String(error?.message ?? 'Nie udało się dodać obiektu.')
      notify(state.actionError, 'error')
      render()
    }
  }

  async function saveDraft() {
    const callback = ctx.ordersSaveCreateWorkspaceDraft ?? ctx.onOrderCreateSaveDraft ?? ctx.saveOrderCreateDraft
    if (typeof callback !== 'function') {
      state.actionError = 'Zapis roboczego zlecenia nie jest jeszcze dostępny.'
      render()
      return false
    }
    state.busy = 'save'
    state.actionError = ''
    render()
    try {
      const payload = serializeOrderCreateDraft(state.draft)
      const result = await callback(payload, {
        expectedDraftHash: state.savedDraftHash,
        validation: currentValidation(),
        route: CREATE_ROUTE,
      })
      if (result === false) throw new Error('Robocze zlecenie nie zostało zapisane.')
      const savedOrder = result?.order ?? result?.draft ?? result ?? {}
      const persistedDraft = result?.persistedDraft ?? result?.draft ?? {}
      const savedDraftHash = stringValue(persistedDraft?.draftHash, result?.draftHash)
      if (callback === ctx.ordersSaveCreateWorkspaceDraft && !savedDraftHash) {
        throw new Error('Backend nie potwierdził wersji zapisanego roboczego zlecenia.')
      }
      state.savedOrderId = stringValue(savedOrder?.id, savedOrder?.orderId, state.draft.id)
      state.savedDraftHash = savedDraftHash || state.savedDraftHash
      state.draft = createOrderCreateDraft({
        ...state.draft,
        id: state.savedOrderId,
        revision: savedOrder?.revision ?? state.draft.revision,
      })
      state.backendValidation = result?.validation ?? savedOrder?.jobCardValidation ?? null
      state.savedAt = new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
      state.dirty = false
      ctx.onOrderCreateDirtyChange?.(false, serializeOrderCreateDraft(state.draft))
      notify('Robocze zlecenie zostało zapisane.', 'success')
      return true
    } catch (error) {
      state.actionError = String(error?.message ?? 'Nie udało się zapisać roboczego zlecenia.')
      notify(state.actionError, 'error')
      return false
    } finally {
      state.busy = ''
      render()
    }
  }

  async function publish() {
    const validation = currentValidation()
    if (!validation.ready) {
      const first = validation.errors[0]
      state.actionError = first?.message || 'Uzupełnij pola wymagane.'
      setCurrentStep(first?.step ?? 0, { force: true })
      return false
    }
    const callback = ctx.ordersPublishCreateWorkspaceJobCard ?? ctx.onOrderCreatePublish ?? ctx.publishOrderCreateDraft
    if (typeof callback !== 'function') {
      state.actionError = 'Adapter publikacji Karty Zlecenia nie został jeszcze podłączony.'
      render()
      return false
    }
    state.busy = 'publish'
    state.actionError = ''
    render()
    try {
      if (!state.savedOrderId || state.dirty) {
        const saved = await saveDraft()
        if (!saved || !state.savedOrderId) throw new Error('Najpierw zapisz robocze zlecenie.')
        state.busy = 'publish'
      }
      const confirmedValidation = currentValidation()
      if (!confirmedValidation.ready) throw new Error('Zapisana Karta Zlecenia ma braki blokujące wysłanie do realizacji.')
      const unacknowledged = confirmedValidation.warnings.find((item) => !state.acknowledgements.includes(item.code))
      if (unacknowledged) throw new Error('Potwierdź osobno każde ostrzeżenie przed wysłaniem do realizacji.')
      if (!state.savedDraftHash) throw new Error('Brak zaakceptowanej wersji roboczego zlecenia. Zapisz je ponownie.')
      const payload = serializeOrderCreateDraft(state.draft)
      const result = callback === ctx.ordersPublishCreateWorkspaceJobCard
        ? await callback(state.savedOrderId, [...state.acknowledgements], state.savedDraftHash)
        : await callback(payload, {
            validation,
            route: CREATE_ROUTE,
            acknowledgements: [...state.acknowledgements],
            expectedDraftHash: state.savedDraftHash,
          })
      if (result === false) throw new Error('Karta Zlecenia nie została wysłana do realizacji.')
      state.dirty = false
      notify('Karta Zlecenia została zatwierdzona i wysłana do realizacji.', 'success')
      const synchronizationWarning = stringValue(result?.synchronizationWarning)
      if (synchronizationWarning) notify(synchronizationWarning, 'warning')
      ctx.onOrderCreatePublished?.(result, serializeOrderCreateDraft(state.draft))
      return true
    } catch (error) {
      state.actionError = String(error?.message ?? 'Nie udało się wysłać Karty Zlecenia do realizacji.')
      notify(state.actionError, 'error')
      return false
    } finally {
      state.busy = ''
      render()
    }
  }

  async function cancel() {
    if (state.dirty) {
      const confirmed = typeof ctx.confirmOrderCreateCancel === 'function'
        ? await ctx.confirmOrderCreateCancel(serializeOrderCreateDraft(state.draft))
        : nativeConfirm('Masz niezapisane zmiany. Czy na pewno chcesz opuścić kreator?')
      if (!confirmed) return
    }
    state.opened = false
    if (typeof ctx.onOrderCreateCancel === 'function') {
      await ctx.onOrderCreateCancel({ sourceRoute: state.sourceRoute })
    } else if (typeof state.navigation?.go === 'function') {
      await state.navigation.go(state.returnRoute || state.sourceRoute || 'orders')
    } else if (typeof ctx.navigateTo === 'function') {
      await ctx.navigateTo(state.returnRoute || state.sourceRoute || 'orders')
    }
  }

  function onClick(event) {
    const target = event.target?.closest?.('[data-order-create-error-target], [data-order-create-step], [data-order-create-object], [data-order-create-new-object], [data-order-create-add-task], [data-order-create-remove-task], [data-order-create-back], [data-order-create-next], [data-order-create-save], [data-order-create-publish], [data-order-create-cancel]')
    if (!target) return
    event.preventDefault()
    if (target.hasAttribute('data-order-create-error-target')) {
      const step = Number(target.getAttribute('data-order-create-error-step'))
      const code = target.getAttribute('data-order-create-error-target')
      if (Number.isInteger(step) && step !== state.currentStep) {
        state.currentStep = step
        state.validationRevealedSteps.add(step)
        state.actionError = currentValidation().errors.find((item) => item.code === code)?.message ?? ''
        render()
        globalThis.requestAnimationFrame?.(() => focusValidationIssue(code))
      } else {
        state.validationRevealedSteps.add(state.currentStep)
        render()
        globalThis.requestAnimationFrame?.(() => focusValidationIssue(code))
      }
    } else if (target.hasAttribute('data-order-create-step')) {
      setCurrentStep(Number(target.getAttribute('data-order-create-step')), { force: Number(target.getAttribute('data-order-create-step')) <= state.currentStep })
    } else if (target.hasAttribute('data-order-create-object')) {
      selectObject(target.getAttribute('data-order-create-object'))
    } else if (target.hasAttribute('data-order-create-new-object')) {
      void addNewObject()
    } else if (target.hasAttribute('data-order-create-add-task')) {
      state.draft.tasks.push({ id: `task-${Date.now()}-${state.draft.tasks.length + 1}`, zoneId: state.draft.zoneIds[0] || '', title: '', instruction: '', expectedResult: '' })
      markDirty()
      render()
    } else if (target.hasAttribute('data-order-create-remove-task')) {
      const id = target.getAttribute('data-order-create-remove-task')
      state.draft.tasks = state.draft.tasks.filter((task) => task.id !== id)
      markDirty()
      render()
    } else if (target.hasAttribute('data-order-create-back')) {
      setCurrentStep(state.currentStep - 1, { force: true })
    } else if (target.hasAttribute('data-order-create-next')) {
      const errors = stepErrors()
      if (errors.length) {
        revealStepErrors(state.currentStep, errors)
      } else {
        setCurrentStep(state.currentStep + 1, { force: true })
      }
    } else if (target.hasAttribute('data-order-create-save')) {
      void saveDraft()
    } else if (target.hasAttribute('data-order-create-publish')) {
      void publish()
    } else if (target.hasAttribute('data-order-create-cancel')) {
      void cancel()
    }
  }

  function onInput(event) {
    const target = event.target
    if (!target) return
    if (target.id === 'orderCreateObjectSearch') {
      state.objectQuery = String(target.value ?? '')
      renderObjectRows()
      return
    }
    if (target.id === 'orderCreateWorkerSearch') {
      state.workerQuery = String(target.value ?? '')
      renderWorkerRows()
      return
    }
    const field = target.getAttribute?.('data-order-create-field')
    if (field) {
      state.draft[field] = field === 'requiredPeople' ? Math.max(1, Number.parseInt(target.value, 10) || 1) : String(target.value ?? '')
      if (field === 'accessNotes' && String(target.value ?? '').trim()) state.draft.accessConfirmedNone = false
      if (field === 'dateStart' && state.draft.scheduleMode === 'RECURRING' && !state.draft.recurrenceUntilConfirmed) {
        state.draft.recurrenceUntil = endOfLocalYearYmd(state.draft.dateStart)
      }
      markDirty()
      updateSummaryDom()
      return
    }
    const taskField = target.getAttribute?.('data-order-create-task-field')
    const row = target.closest?.('[data-order-create-task-row]')
    if (taskField && row) {
      const task = state.draft.tasks.find((item) => item.id === row.getAttribute('data-order-create-task-row'))
      if (task) {
        task[taskField] = String(target.value ?? '')
        markDirty()
        updateSummaryDom()
      }
    }
  }

  function toggleValue(list, value, checked) {
    const values = new Set(Array.isArray(list) ? list : [])
    if (checked) values.add(value)
    else values.delete(value)
    return [...values]
  }

  function onChange(event) {
    const target = event.target
    if (!target) return
    const choice = target.getAttribute?.('data-order-create-choice')
    if (choice) {
      state.draft[choice] = choice === 'dispatchRequired' ? target.value === 'YES' : String(target.value ?? '')
      if (choice === 'scheduleMode' && target.value === 'RECURRING' && !state.draft.recurrenceUntil) {
        state.draft.recurrenceUntil = endOfLocalYearYmd(state.draft.dateStart)
      }
      if (choice === 'staffingMode' && target.value !== 'FIXED') state.draft.workerIds = []
      markDirty()
      render()
      return
    }
    if (target.hasAttribute?.('data-order-create-weekday')) {
      state.draft.weekdays = toggleValue(state.draft.weekdays, Number(target.value), target.checked)
      markDirty()
      render()
      return
    }
    if (target.hasAttribute?.('data-order-create-confirm-until')) {
      state.draft.recurrenceUntilConfirmed = Boolean(target.checked)
      markDirty()
      render()
      return
    }
    const confirmation = target.getAttribute?.('data-order-create-confirm')
    if (confirmation) {
      state.draft[confirmation] = Boolean(target.checked)
      if (confirmation === 'accessConfirmedNone' && target.checked) state.draft.accessNotes = ''
      markDirty()
      render()
      return
    }
    if (target.hasAttribute?.('data-order-create-zone')) {
      state.draft.zoneIds = toggleValue(state.draft.zoneIds, String(target.value), target.checked)
      markDirty()
      render()
      return
    }
    if (target.hasAttribute?.('data-order-create-worker')) {
      state.draft.workerIds = toggleValue(state.draft.workerIds, String(target.value), target.checked)
      markDirty()
      render()
      return
    }
    if (target.hasAttribute?.('data-order-create-acknowledgement')) {
      state.acknowledgements = toggleValue(state.acknowledgements, String(target.value), target.checked)
      render()
      return
    }
    const field = target.getAttribute?.('data-order-create-field')
    onInput(event)
    if (field) render()
  }

  function bind(navigationOrRoot = null) {
    const isRoot = navigationOrRoot?.id === 'view-orderCreate' || navigationOrRoot?.querySelector?.('#orderCreateMount')
    const view = rootElement(isRoot ? navigationOrRoot : null)
    if (!view) return () => {}
    if (!isRoot && navigationOrRoot?.go) state.navigation = navigationOrRoot
    controller?.abort()
    controller = new AbortController()
    const options = { signal: controller.signal }
    view.addEventListener('click', onClick, options)
    view.addEventListener('input', onInput, options)
    view.addEventListener('change', onChange, options)
    return () => controller?.abort()
  }

  async function open(options = {}) {
    const seed = {
      ...options,
      draft: {
        ...(options?.draft ?? {}),
        ...(options?.initialDate && !options?.draft?.dateStart ? { dateStart: options.initialDate } : {}),
      },
      navigation: state.navigation,
    }
    state = createState(seed)
    state.opened = true
    render()
    try {
      await loadSources(options)
      if (state.draft.objectId && !state.objects.some((item) => item.id === state.draft.objectId)) {
        state.draft.objectId = ''
      }
    } catch (error) {
      state.loadError = String(error?.message ?? 'Nie udało się wczytać danych kreatora.')
      state.actionError = state.loadError
      notify(state.loadError, 'error')
    }
    render()
    ctx.onOrderCreateOpen?.(serializeOrderCreateDraft(state.draft))
    return serializeOrderCreateDraft(state.draft)
  }

  function selectCreatedObject(payload = {}) {
    if (!payload) return false
    const object = normalizeObject(payload, payload?.client ?? null, state.objects.length)
    state.objects = uniqueById([...state.objects.filter((item) => item.id !== object.id), object])
      .sort((left, right) => left.label.localeCompare(right.label, 'pl', { sensitivity: 'base' }))
    selectObject(object.id)
    return true
  }

  async function reloadSourcesAndSelect(payload = null) {
    try {
      await loadSources({})
      if (payload) selectCreatedObject(payload)
      else render()
      return true
    } catch (error) {
      state.actionError = String(error?.message ?? 'Nie udało się odświeżyć listy obiektów.')
      notify(state.actionError, 'error')
      render()
      return false
    }
  }

  function cleanup() {
    controller?.abort()
    controller = null
    state.opened = false
  }

  return {
    bind,
    render,
    open,
    cleanup,
    saveDraft,
    publish,
    getDraft: () => serializeOrderCreateDraft(state.draft),
    selectCreatedObject,
    reloadSourcesAndSelect,
    getState: () => ({
      currentStep: state.currentStep,
      dirty: state.dirty,
      busy: state.busy,
      opened: state.opened,
      validation: currentValidation(),
    }),
  }
}
