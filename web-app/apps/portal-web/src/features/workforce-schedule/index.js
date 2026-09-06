import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import './schedule.css'
import { ScheduleContent } from './ScheduleContent.jsx'
import {
  createWorkforceScheduleAdapter,
  normalizeWorkforceScheduleSnapshot,
  notifyScheduleAdapter,
  WORKFORCE_SCHEDULE_ADAPTER_METHODS,
  WORKFORCE_SCHEDULE_BOUNDARY,
} from './scheduleContract.js'
import {
  buildWorkforceScheduleShiftPayload,
  formatWorkforceScheduleWarning,
  isConfirmedWorkforceScheduleShift,
  normalizeWorkforceScheduleBootstrap,
  normalizeWorkforceScheduleShift,
  workforceSchedulePublicationCandidates,
} from './workforceScheduleClientModel.js'
import * as defaultWorkforceScheduleService from '../../services/workforceScheduleService.js'
import { createWorkforceScheduleOperationRegistry } from '../../services/workforceScheduleTransport.js'

export const route = 'workforceSchedule'
export const viewId = 'view-workforceSchedule'
export const template = '<div class="workforce-schedule-host" id="workforceScheduleMount"></div>'

export {
  ScheduleContent,
  ScheduleContent as WorkforceScheduleContent,
  createWorkforceScheduleAdapter,
  normalizeWorkforceScheduleSnapshot,
  notifyScheduleAdapter,
  WORKFORCE_SCHEDULE_ADAPTER_METHODS,
  WORKFORCE_SCHEDULE_BOUNDARY,
}

function text(value) {
  return String(value ?? '').trim()
}

function addDays(iso, amount) {
  const date = new Date(`${iso}T12:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

function todayIso() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function currentWeekRange() {
  const today = todayIso()
  const date = new Date(`${today}T12:00:00.000Z`)
  const offset = date.getUTCDay() === 0 ? -6 : 1 - date.getUTCDay()
  const from = addDays(today, offset)
  return { from, to: addDays(from, 6), viewMode: 'week' }
}

function validRange(value) {
  return Boolean(
    /^\d{4}-\d{2}-\d{2}$/.test(text(value?.from))
    && /^\d{4}-\d{2}-\d{2}$/.test(text(value?.to))
    && text(value.from) <= text(value.to),
  )
}

function setupPanel({ busy, canActivate, error, onActivate, onRetry, onTimeZoneChange, timeZone }) {
  return createElement('section', { className: 'workforce-schedule-state', role: 'region', 'aria-labelledby': 'workforceScheduleSetupTitle' },
    createElement('div', { className: 'workforce-schedule-state__icon', 'aria-hidden': 'true' }, 'G'),
    createElement('p', { className: 'workforce-schedule-state__eyebrow' }, 'PIERWSZE URUCHOMIENIE'),
    createElement('h1', { id: 'workforceScheduleSetupTitle' }, 'Skonfiguruj Grafik'),
    createElement('p', null, canActivate
      ? 'Grafik ma własne dane. Jednorazowo wybierz strefę czasu, a następnie pobierzemy wyłącznie aktywnych pracowników i obiekty.'
      : 'Grafik nie został jeszcze skonfigurowany. Pierwsze uruchomienie musi wykonać administrator organizacji.'),
    canActivate ? createElement('label', { className: 'workforce-schedule-state__field' },
      createElement('span', null, 'Strefa czasu'),
      createElement('select', {
        disabled: busy,
        onChange: (event) => onTimeZoneChange(event.target.value),
        value: timeZone,
      },
      createElement('option', { value: 'Europe/Warsaw' }, 'Europe/Warsaw'),
      createElement('option', { value: 'Europe/Berlin' }, 'Europe/Berlin'),
      createElement('option', { value: 'Europe/Prague' }, 'Europe/Prague')),
    ) : null,
    error ? createElement('p', { className: 'workforce-schedule-state__error', role: 'alert' }, error) : null,
    createElement('div', { className: 'workforce-schedule-state__actions' },
      canActivate ? createElement('button', { disabled: busy, onClick: onActivate, type: 'button' }, busy ? 'Konfiguruję…' : 'Uruchom Grafik') : null,
      error ? createElement('button', { className: 'is-secondary', disabled: busy, onClick: onRetry, type: 'button' }, 'Odśwież') : null,
    ),
    createElement('small', null, 'Bez wysyłki do aplikacji pracownika, bez powiadomień i bez połączenia ze Zleceniami ani Kalendarzem.'),
  )
}

function statusPanel({ error, loading, onRetry }) {
  return createElement('section', { className: 'workforce-schedule-state', role: error ? 'alert' : 'status' },
    createElement('div', { className: `workforce-schedule-state__spinner${loading ? ' is-loading' : ''}`, 'aria-hidden': 'true' }),
    createElement('h1', null, error ? 'Nie udało się wczytać Grafiku' : 'Wczytuję Grafik'),
    createElement('p', null, error || 'Pobieram niezależny plan, katalog pracowników i katalog obiektów.'),
    error ? createElement('button', { onClick: onRetry, type: 'button' }, 'Spróbuj ponownie') : null,
  )
}

export function createWorkforceScheduleFeature(ctx = {}) {
  const service = ctx.workforceScheduleService || defaultWorkforceScheduleService
  const operationRegistry = createWorkforceScheduleOperationRegistry()
  const state = {
    range: currentWeekRange(),
    snapshot: null,
    snapshotVersion: 0,
    status: 'idle',
    error: '',
    setupRequired: false,
    setupTimeZone: 'Europe/Warsaw',
    settings: null,
    catalogSyncAttempted: false,
    busy: false,
  }
  let reactRoot = null
  let activeController = null
  let requestSequence = 0
  let sessionSequence = 0

  const currentOrgId = () => text(ctx.appState?.session?.activeOrgId || ctx.appState?.session?.orgId)
  const canConfigure = () => ['ADMIN', 'OWNER'].includes(text(ctx.appState?.session?.roleCode || ctx.appState?.session?.role).toUpperCase())
  const canEdit = () => ['ADMIN', 'OWNER', 'MANAGER'].includes(text(ctx.appState?.session?.roleCode || ctx.appState?.session?.role).toUpperCase())
  const hasCapability = () => ctx.appState?.session?.capabilities?.workforceScheduling === true
  const notify = (message, tone = 'success') => ctx.showTransientNotice?.(text(message), tone)

  async function runIdempotent(action, payload, request) {
    const operation = operationRegistry.begin(action, payload)
    try {
      const result = await request(operation.key)
      operationRegistry.complete(operation.signature)
      return result
    } catch (error) {
      operationRegistry.fail(operation.signature, error)
      throw error
    }
  }

  function render() {
    if (!reactRoot) return
    if (state.setupRequired) {
      reactRoot.render(setupPanel({
        busy: state.busy,
        canActivate: canConfigure(),
        error: state.error,
        onActivate: () => { void configure() },
        onRetry: () => { void refresh({ forceRefresh: true }) },
        onTimeZoneChange: (value) => {
          state.setupTimeZone = text(value) || 'Europe/Warsaw'
          render()
        },
        timeZone: state.setupTimeZone,
      }))
      return
    }
    if (!state.snapshot) {
      reactRoot.render(statusPanel({
        error: state.error,
        loading: state.status === 'loading',
        onRetry: () => { void refresh({ forceRefresh: true }) },
      }))
      return
    }

    const adapter = createWorkforceScheduleAdapter({
      onRangeChange: ({ from, to, viewMode }) => {
        const range = { from, to, viewMode }
        if (!validRange(range) || (state.range.from === from && state.range.to === to)) return
        state.range = range
        void refresh({ forceRefresh: true, range, syncCatalogs: false })
      },
      onSchedulePublish: (payload) => runWrite(() => publish(payload)),
      onShiftCreate: (payload) => runWrite(() => saveShift(payload)),
      onShiftDelete: (payload) => runWrite(() => archiveShift(payload)),
      onShiftMove: (payload) => runWrite(() => saveShift(payload)),
      onShiftUpdate: (payload) => runWrite(() => saveShift(payload)),
    })

    reactRoot.render(createElement(ScheduleContent, {
      adapter,
      deliveryDisabled: true,
      editingEnabled: canEdit(),
      mode: 'internal',
      onNotify: notify,
      requestsEnabled: false,
      settingsEnabled: false,
      snapshot: state.snapshot,
      snapshotVersion: state.snapshotVersion,
      weeklyLimitMinutes: Number(state.settings?.weeklyLimitMinutes) || 40 * 60,
    }))
  }

  async function fetchSchedule(range, signal) {
    return service.fetchWorkforceScheduleBootstrap(currentOrgId(), range, { signal })
  }

  async function refresh(options = {}) {
    if (!reactRoot || !hasCapability()) return false
    const orgId = currentOrgId()
    const range = validRange(options.range) ? { ...options.range } : { ...state.range }
    if (!orgId || !validRange(range)) return false
    state.range = { ...state.range, ...range }
    const sequence = ++requestSequence
    const sessionAtStart = sessionSequence
    activeController?.abort()
    activeController = typeof AbortController === 'function' ? new AbortController() : null
    const controller = activeController
    state.status = 'loading'
    state.error = ''
    render()

    try {
      let schedule = await fetchSchedule(range, controller?.signal)
      if (sequence !== requestSequence || sessionAtStart !== sessionSequence || orgId !== currentOrgId()) return false

      state.setupRequired = schedule.setupRequired === true
      state.settings = schedule.settings || null
      if (state.setupRequired) {
        state.snapshot = null
        state.status = 'ready'
        render()
        return true
      }

      const shouldSyncCatalogs = options.syncCatalogs !== false
        && !state.catalogSyncAttempted
        && canConfigure()
      if (shouldSyncCatalogs) {
        state.catalogSyncAttempted = true
        try {
          await runIdempotent('sync-catalogs', { orgId }, (idempotencyKey) => (
            service.syncWorkforceScheduleCatalogs(orgId, {}, { idempotencyKey })
          ))
          schedule = await fetchSchedule(range, controller?.signal)
        } catch (error) {
          notify(error?.message || 'Nie udało się odświeżyć katalogu pracowników i obiektów.', 'error')
        }
      }
      if (sequence !== requestSequence || sessionAtStart !== sessionSequence || orgId !== currentOrgId()) return false

      const normalized = normalizeWorkforceScheduleBootstrap(schedule)
      state.settings = normalized.settings
      state.snapshot = {
        ...normalized,
        todayIso: todayIso(),
        weekStart: state.range.viewMode === 'week' ? state.range.from : currentWeekRange().from,
      }
      state.snapshotVersion += 1
      state.status = 'ready'
      state.error = ''
      render()
      return true
    } catch (error) {
      if (error?.code === 'WORKFORCE_SCHEDULE_REQUEST_ABORTED') return false
      if (sequence !== requestSequence || sessionAtStart !== sessionSequence) return false
      state.status = 'error'
      state.error = text(error?.message) || 'Nie udało się pobrać danych Grafiku.'
      render()
      return false
    } finally {
      if (activeController === controller) activeController = null
    }
  }

  async function configure() {
    if (state.busy) return false
    state.busy = true
    state.error = ''
    render()
    try {
      const orgId = currentOrgId()
      const configuration = {
        expectedVersion: Number(state.settings?.version || 0),
        timeZone: state.setupTimeZone,
        weeklyLimitMinutes: 40 * 60,
      }
      await runIdempotent('set-configuration', { orgId, configuration }, (idempotencyKey) => (
        service.setWorkforceScheduleConfiguration(orgId, configuration, { idempotencyKey })
      ))
      await runIdempotent('sync-catalogs', { orgId }, (idempotencyKey) => (
        service.syncWorkforceScheduleCatalogs(orgId, {}, { idempotencyKey })
      ))
      state.catalogSyncAttempted = true
      state.setupRequired = false
      notify('Grafik został uruchomiony. Pobrano aktywnych pracowników i obiekty.')
      return refresh({ forceRefresh: true, syncCatalogs: false })
    } catch (error) {
      state.error = text(error?.message) || 'Nie udało się skonfigurować Grafiku.'
      render()
      return false
    } finally {
      state.busy = false
      render()
    }
  }

  async function runWrite(task) {
    if (state.busy) {
      const error = new Error('Poprzedni zapis Grafiku jeszcze trwa.')
      error.code = 'WORKFORCE_SCHEDULE_WRITE_IN_PROGRESS'
      throw error
    }
    state.busy = true
    try {
      const result = await task()
      if (result === null || result === undefined || result === false) {
        const error = new Error('Serwer nie potwierdził zapisu Grafiku. Odśwież widok przed kolejną operacją.')
        error.code = 'WORKFORCE_SCHEDULE_WRITE_NOT_CONFIRMED'
        throw error
      }
      window.setTimeout(() => {
        void refresh({ forceRefresh: true, syncCatalogs: false })
      }, 0)
      return result
    } catch (error) {
      window.setTimeout(() => {
        void refresh({ forceRefresh: true, syncCatalogs: false })
      }, 0)
      throw error
    } finally {
      state.busy = false
    }
  }

  async function saveShift({ shift }) {
    const orgId = currentOrgId()
    const payload = buildWorkforceScheduleShiftPayload(shift)
    const response = await runIdempotent('upsert-shift', { orgId, payload }, (idempotencyKey) => (
      service.upsertWorkforceScheduleShift(orgId, payload, { idempotencyKey })
    ))
    const savedShift = normalizeWorkforceScheduleShift(response?.shift)
    if (!isConfirmedWorkforceScheduleShift(savedShift)) {
      const error = new Error('Serwer nie zwrócił identyfikatora ani wersji zapisanej zmiany. Odśwież Grafik i spróbuj ponownie.')
      error.code = 'WORKFORCE_SCHEDULE_INVALID_SHIFT_RESPONSE'
      throw error
    }
    return savedShift
  }

  async function archiveShift({ previousShift, shiftId }) {
    const persistedId = text(previousShift?.shiftId || previousShift?.id || shiftId)
    const expectedVersion = Number(previousShift?.version || 0)
    if (!persistedId || expectedVersion < 1) return null
    const orgId = currentOrgId()
    const payload = {
      shiftId: persistedId,
      expectedVersion,
    }
    const response = await runIdempotent('archive-shift', { orgId, payload }, (idempotencyKey) => (
      service.archiveWorkforceScheduleShift(orgId, payload, { idempotencyKey })
    ))
    const archivedShift = normalizeWorkforceScheduleShift(response?.shift)
    if (!isConfirmedWorkforceScheduleShift(archivedShift) || archivedShift.pendingDeletion !== true) {
      const error = new Error('Serwer nie potwierdził archiwizacji zmiany. Odśwież Grafik i spróbuj ponownie.')
      error.code = 'WORKFORCE_SCHEDULE_INVALID_ARCHIVE_RESPONSE'
      throw error
    }
    return archivedShift
  }

  async function publish({ changes = [] }) {
    const candidates = workforceSchedulePublicationCandidates(changes, state.range)
    const expectedVersions = candidates.map((shift) => ({
      shiftId: text(shift.shiftId || shift.id),
      version: Number(shift.version),
    })).filter((item) => item.shiftId && item.version > 0)
    const publication = {
      from: state.range.from,
      to: state.range.to,
      expectedVersions,
    }
    const orgId = currentOrgId()
    const sendPublication = async (payload) => {
      const response = await runIdempotent(
        'publish',
        { orgId, publication: payload },
        (idempotencyKey) => service.publishWorkforceSchedule(orgId, payload, { idempotencyKey }),
      )
      const published = Array.isArray(response?.publication?.published) ? response.publication.published : []
      const confirmedIds = new Set(published.map((item) => text(item?.shiftId)).filter(Boolean))
      if (
        !text(response?.publication?.publicationId)
        || published.length !== expectedVersions.length
        || expectedVersions.some((item) => !confirmedIds.has(item.shiftId))
      ) {
        const invalid = new Error('Serwer nie zwrócił pełnego potwierdzenia zatwierdzenia Grafiku. Odśwież widok przed kolejną operacją.')
        invalid.code = 'WORKFORCE_SCHEDULE_INVALID_PUBLICATION_RESPONSE'
        throw invalid
      }
      return response.publication
    }
    try {
      return await sendPublication(publication)
    } catch (error) {
      if (error?.code !== 'WORKFORCE_SCHEDULE_WARNINGS_CONFIRMATION_REQUIRED' || !text(error?.details?.warningFingerprint)) {
        throw error
      }
      const warnings = Array.isArray(error?.details?.warnings) ? error.details.warnings : []
      const warningText = warnings.map(formatWorkforceScheduleWarning).filter(Boolean).join('\n• ')
      const confirmed = window.confirm([
        'Grafik zawiera ostrzeżenia:',
        warningText ? `• ${warningText}` : '• Wymagane jest świadome potwierdzenie ostrzeżeń.',
        '',
        'Czy zatwierdzić ten grafik wyłącznie wewnętrznie?',
      ].join('\n'))
      if (!confirmed) {
        const cancelled = new Error('Zatwierdzenie Grafiku zostało anulowane.')
        cancelled.code = 'WORKFORCE_SCHEDULE_PUBLICATION_CANCELLED'
        throw cancelled
      }
      return sendPublication({
        ...publication,
        warningFingerprint: text(error.details.warningFingerprint),
      })
    }
  }

  function bind() {
    const mount = document.getElementById('workforceScheduleMount')
    if (!(mount instanceof HTMLElement)) return () => {}
    reactRoot = createRoot(mount)
    render()
    return () => {
      requestSequence += 1
      activeController?.abort()
      activeController = null
      reactRoot?.unmount()
      reactRoot = null
    }
  }

  function resetSession() {
    sessionSequence += 1
    requestSequence += 1
    activeController?.abort()
    activeController = null
    operationRegistry.clear()
    Object.assign(state, {
      range: currentWeekRange(),
      snapshot: null,
      snapshotVersion: state.snapshotVersion + 1,
      status: 'idle',
      error: '',
      setupRequired: false,
      setupTimeZone: 'Europe/Warsaw',
      settings: null,
      catalogSyncAttempted: false,
      busy: false,
    })
    render()
  }

  function deactivate() {
    requestSequence += 1
    activeController?.abort()
    activeController = null
  }

  function cleanup() {
    sessionSequence += 1
    deactivate()
    operationRegistry.clear()
    reactRoot?.unmount()
    reactRoot = null
  }

  const hasUsableData = () => Boolean(state.snapshot && state.status === 'ready')

  return { bind, cleanup, deactivate, hasUsableData, refresh, resetSession }
}

export default ScheduleContent
