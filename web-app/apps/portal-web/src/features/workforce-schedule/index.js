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
  assertWorkforceScheduleSelectableReferences,
  buildWorkforceScheduleShiftPayload,
  formatWorkforceScheduleWarning,
  isConfirmedWorkforceScheduleSettings,
  isConfirmedWorkforceScheduleShift,
  normalizeWorkforceScheduleBootstrap,
  normalizeWorkforceScheduleSettings,
  normalizeWorkforceScheduleShift,
  workforceScheduleCatalogConflictsFromError,
  workforceSchedulePublicationCandidates,
} from './workforceScheduleClientModel.js'
import { createWorkforceScheduleAsyncGuard } from './workforceScheduleAsyncGuard.js'
import {
  createWorkforceScheduleCatalogSyncGate,
  summarizeWorkforceScheduleCatalogSync,
} from './workforceScheduleCatalogSync.js'
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
  const confirmAction = typeof ctx.confirm === 'function'
    ? ctx.confirm
    : (message) => window.confirm(message)
  const operationRegistry = createWorkforceScheduleOperationRegistry()
  const catalogSyncGate = createWorkforceScheduleCatalogSyncGate()
  const state = {
    range: currentWeekRange(),
    snapshot: null,
    snapshotVersion: 0,
    status: 'idle',
    error: '',
    setupRequired: false,
    setupTimeZone: 'Europe/Warsaw',
    settings: null,
    busy: false,
    catalogSync: {
      busy: false,
      conflicts: [],
      error: '',
      hasMoreConflicts: false,
      stale: false,
      summary: null,
    },
  }
  let reactRoot = null
  let activeController = null
  let requestSequence = 0
  let catalogSyncAttempt = 0

  const currentOrgId = () => text(ctx.appState?.session?.activeOrgId || ctx.appState?.session?.orgId)
  const asyncGuard = createWorkforceScheduleAsyncGuard(currentOrgId)
  const canConfigure = () => ['ADMIN', 'OWNER'].includes(text(ctx.appState?.session?.roleCode || ctx.appState?.session?.role).toUpperCase())
  const canEdit = () => ['ADMIN', 'OWNER', 'MANAGER'].includes(text(ctx.appState?.session?.roleCode || ctx.appState?.session?.role).toUpperCase())
  const hasCapability = () => ctx.appState?.session?.capabilities?.workforceScheduling === true
  const notify = (message, tone = 'success') => ctx.showTransientNotice?.(text(message), tone)

  function recordCatalogSync(orgId, result) {
    const summary = summarizeWorkforceScheduleCatalogSync(orgId, result, {
      completedAt: new Date().toISOString(),
    })
    if (!summary) return false
    state.catalogSync = {
      busy: state.catalogSync.busy,
      conflicts: [],
      error: '',
      hasMoreConflicts: false,
      stale: false,
      summary: preferCatalogSyncSummary(state.catalogSync.summary, summary),
    }
    return true
  }

  function preferCatalogSyncSummary(current, incoming) {
    if (!incoming) return current
    if (!current) return incoming
    const currentTime = Date.parse(text(current.lastSyncedAt))
    const incomingTime = Date.parse(text(incoming.lastSyncedAt))
    if (Number.isFinite(currentTime) && Number.isFinite(incomingTime)) {
      if (currentTime > incomingTime) return current
      if (currentTime === incomingTime && current.source === 'receipt') return current
    }
    return incoming
  }

  async function runIdempotent(action, payload, request) {
    const operation = operationRegistry.begin(action, payload)
    try {
      const result = await request(operation.key)
      operationRegistry.complete(operation)
      return result
    } catch (error) {
      operationRegistry.fail(operation, error)
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
      ...(canConfigure() ? {
        onSettingsSave: (payload) => updateSettings(payload),
      } : {}),
    })

    reactRoot.render(createElement(ScheduleContent, {
      adapter,
      catalogRefreshBusy: state.catalogSync.busy,
      catalogSyncConflicts: state.catalogSync.conflicts,
      catalogRefreshEnabled: canConfigure(),
      catalogSyncError: state.catalogSync.error,
      catalogSyncHasMoreConflicts: state.catalogSync.hasMoreConflicts,
      catalogSyncStale: state.catalogSync.stale,
      catalogSyncSummary: state.catalogSync.summary,
      deliveryDisabled: true,
      editingEnabled: canEdit(),
      mode: 'internal',
      onCatalogRefresh: () => refreshCatalogsManually(),
      onNotify: notify,
      requestsEnabled: false,
      scheduleSettings: state.settings,
      settingsEnabled: canConfigure() && Boolean(state.settings),
      snapshot: state.snapshot,
      snapshotVersion: state.snapshotVersion,
      weeklyLimitMinutes: Number(state.settings?.weeklyLimitMinutes) || 40 * 60,
    }))
  }

  async function fetchSchedule(range, signal, orgId = currentOrgId()) {
    return service.fetchWorkforceScheduleBootstrap(orgId, range, { signal })
  }

  async function refresh(options = {}) {
    if (!reactRoot || !hasCapability()) return false
    const orgId = currentOrgId()
    const range = validRange(options.range) ? { ...options.range } : { ...state.range }
    if (!orgId || !validRange(range)) return false
    state.range = { ...state.range, ...range }
    const sequence = ++requestSequence
    const sessionAtStart = asyncGuard.capture()
    activeController?.abort()
    activeController = typeof AbortController === 'function' ? new AbortController() : null
    const controller = activeController
    state.status = 'loading'
    state.error = ''
    render()

    try {
      let schedule = await fetchSchedule(range, controller?.signal, orgId)
      let catalogBootstrapStale = false
      if (sequence !== requestSequence || !asyncGuard.isCurrent(sessionAtStart)) return false

      state.setupRequired = schedule.setupRequired === true
      state.settings = normalizeWorkforceScheduleSettings(schedule.settings)
      if (state.setupRequired) {
        state.snapshot = null
        state.status = 'ready'
        render()
        return true
      }

      // A regular view refresh must stay read-only. Catalog synchronization is
      // an explicit administrator action because it can change the module's
      // reference snapshots.
      const shouldSyncCatalogs = options.syncCatalogs === true
        && !catalogSyncGate.isComplete(orgId)
        && canConfigure()
      if (shouldSyncCatalogs) {
        let syncResult = null
        try {
          syncResult = await catalogSyncGate.run(orgId, () => (
            runIdempotent('sync-catalogs', { orgId }, (idempotencyKey) => (
              service.syncWorkforceScheduleCatalogs(orgId, {}, { idempotencyKey })
            ))
          ))
          if (sequence !== requestSequence || !asyncGuard.isCurrent(sessionAtStart)) return false
          schedule = await fetchSchedule(range, controller?.signal, orgId)
          if (sequence !== requestSequence || !asyncGuard.isCurrent(sessionAtStart)) return false
          recordCatalogSync(orgId, syncResult)
        } catch (error) {
          if (sequence !== requestSequence || !asyncGuard.isCurrent(sessionAtStart)) return false
          catalogBootstrapStale = Boolean(syncResult)
          const message = catalogBootstrapStale
            ? 'Synchronizacja zakończyła się, ale nie udało się pobrać zaktualizowanego katalogu. Wyświetlane dane mogą być nieaktualne.'
            : text(error?.message) || 'Nie udało się odświeżyć katalogu pracowników i obiektów.'
          const catalogConflicts = workforceScheduleCatalogConflictsFromError(error)
          state.catalogSync = {
            ...state.catalogSync,
            conflicts: catalogConflicts.conflicts,
            error: message,
            hasMoreConflicts: catalogConflicts.hasMore,
            stale: catalogBootstrapStale,
          }
          notify(message, 'error')
        }
      }
      if (sequence !== requestSequence || !asyncGuard.isCurrent(sessionAtStart)) return false

      const normalized = normalizeWorkforceScheduleBootstrap(schedule)
      state.settings = normalized.settings
      if (normalized.catalogSync) {
        state.catalogSync = {
          busy: state.catalogSync.busy,
          conflicts: state.catalogSync.conflicts,
          error: state.catalogSync.error,
          hasMoreConflicts: state.catalogSync.hasMoreConflicts,
          stale: catalogBootstrapStale,
          summary: preferCatalogSyncSummary(state.catalogSync.summary, normalized.catalogSync),
        }
      } else {
        state.catalogSync = {
          ...state.catalogSync,
          stale: catalogBootstrapStale,
        }
      }
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
      if (sequence !== requestSequence || !asyncGuard.isCurrent(sessionAtStart)) return false
      state.status = 'error'
      state.error = text(error?.message) || 'Nie udało się pobrać danych Grafiku.'
      render()
      return false
    } finally {
      if (activeController === controller) activeController = null
    }
  }

  async function refreshCatalogsManually() {
    if (!reactRoot || !hasCapability() || !canConfigure() || state.busy || state.catalogSync.busy) return false
    const operationContext = asyncGuard.beginBusy()
    if (!operationContext) return false
    state.busy = true
    state.catalogSync = {
      ...state.catalogSync,
      busy: true,
      conflicts: [],
      error: '',
      hasMoreConflicts: false,
    }
    render()
    try {
      const orgId = operationContext.orgId
      const attempt = ++catalogSyncAttempt
      const result = await catalogSyncGate.run(orgId, () => (
        runIdempotent('sync-catalogs-manual', { attempt, orgId }, (idempotencyKey) => (
          service.syncWorkforceScheduleCatalogs(orgId, {}, { idempotencyKey })
        ))
      ), { force: true })
      if (!asyncGuard.isCurrent(operationContext)) return false
      const refreshed = await refresh({ forceRefresh: true, syncCatalogs: false })
      if (!asyncGuard.isCurrent(operationContext)) return false
      if (!refreshed) {
        const message = 'Synchronizacja zakończyła się, ale nie udało się pobrać zaktualizowanego katalogu. Wyświetlane dane mogą być nieaktualne.'
        state.catalogSync = {
          ...state.catalogSync,
          error: message,
          stale: true,
        }
        notify(message, 'error')
        render()
        return false
      }
      if (!recordCatalogSync(orgId, result)) return false
      render()
      notify('Odświeżono pracowników i obiekty Grafiku.')
      return true
    } catch (error) {
      if (!asyncGuard.isCurrent(operationContext)) return false
      const message = text(error?.message) || 'Nie udało się odświeżyć pracowników i obiektów Grafiku.'
      const catalogConflicts = workforceScheduleCatalogConflictsFromError(error)
      state.catalogSync = {
        ...state.catalogSync,
        conflicts: catalogConflicts.conflicts,
        error: message,
        hasMoreConflicts: catalogConflicts.hasMore,
      }
      notify(message, 'error')
      render()
      return false
    } finally {
      if (asyncGuard.releaseBusy(operationContext)) {
        state.busy = false
        state.catalogSync = {
          ...state.catalogSync,
          busy: false,
        }
        render()
      }
    }
  }

  async function configure() {
    if (state.busy) return false
    const operationContext = asyncGuard.beginBusy()
    if (!operationContext) return false
    state.busy = true
    state.error = ''
    render()
    try {
      const orgId = operationContext.orgId
      const configuration = {
        expectedVersion: Number(state.settings?.version || 0),
        timeZone: state.setupTimeZone,
        weeklyLimitMinutes: 40 * 60,
      }
      const response = await runIdempotent('set-configuration', { orgId, configuration }, (idempotencyKey) => (
        service.setWorkforceScheduleConfiguration(orgId, configuration, { idempotencyKey })
      ))
      if (!asyncGuard.isCurrent(operationContext)) return false
      if (!isConfirmedWorkforceScheduleSettings(response?.settings, { orgId, ...configuration })) {
        const error = new Error('Serwer nie zwrócił pełnego potwierdzenia uruchomienia Grafiku. Odśwież widok i spróbuj ponownie.')
        error.code = 'WORKFORCE_SCHEDULE_INVALID_SETTINGS_RESPONSE'
        throw error
      }
      state.setupRequired = false
      state.settings = normalizeWorkforceScheduleSettings(response.settings)
      notify('Grafik został uruchomiony.')
      const refreshed = await refresh({ forceRefresh: true, syncCatalogs: true })
      if (!asyncGuard.isCurrent(operationContext)) return false
      return refreshed
    } catch (error) {
      if (!asyncGuard.isCurrent(operationContext)) return false
      state.error = text(error?.message) || 'Nie udało się skonfigurować Grafiku.'
      render()
      return false
    } finally {
      if (asyncGuard.releaseBusy(operationContext)) {
        state.busy = false
        render()
      }
    }
  }

  async function runWrite(task) {
    if (state.busy) {
      const error = new Error('Poprzedni zapis Grafiku jeszcze trwa.')
      error.code = 'WORKFORCE_SCHEDULE_WRITE_IN_PROGRESS'
      throw error
    }
    const operationContext = asyncGuard.beginBusy()
    if (!operationContext) {
      const error = new Error('Poprzedni zapis Grafiku jeszcze trwa.')
      error.code = 'WORKFORCE_SCHEDULE_WRITE_IN_PROGRESS'
      throw error
    }
    state.busy = true
    let shouldRefresh = false
    try {
      const result = await task()
      if (!asyncGuard.isCurrent(operationContext)) return false
      shouldRefresh = true
      if (result === null || result === undefined || result === false) {
        const error = new Error('Serwer nie potwierdził zapisu Grafiku. Odśwież widok przed kolejną operacją.')
        error.code = 'WORKFORCE_SCHEDULE_WRITE_NOT_CONFIRMED'
        throw error
      }
      return result
    } catch (error) {
      if (!asyncGuard.isCurrent(operationContext)) return false
      shouldRefresh = ![
        'WORKFORCE_SCHEDULE_INACTIVE_CATALOG_SELECTION',
        'WORKFORCE_SCHEDULE_INVALID_SETTINGS_REQUEST',
        'WORKFORCE_SCHEDULE_PUBLICATION_BLOCKED',
      ].includes(text(error?.code).toUpperCase())
      throw error
    } finally {
      if (shouldRefresh && asyncGuard.isCurrent(operationContext)) {
        window.setTimeout(() => {
          if (!asyncGuard.isCurrent(operationContext)) return
          void refresh({ forceRefresh: true, syncCatalogs: false })
        }, 0)
      }
      if (asyncGuard.releaseBusy(operationContext)) state.busy = false
    }
  }

  async function updateSettings(payload) {
    const confirmed = await runWrite(() => saveSettings(payload))
    if (!confirmed) return confirmed
    state.settings = confirmed
    if (state.snapshot) state.snapshot = { ...state.snapshot, settings: confirmed }
    render()
    return confirmed
  }

  async function saveSettings({ settings } = {}) {
    const current = normalizeWorkforceScheduleSettings(state.settings)
    const orgId = currentOrgId()
    const expectedVersion = Number(settings?.expectedVersion)
    const timeZone = text(settings?.timeZone)
    const weeklyLimitMinutes = Number(settings?.weeklyLimitMinutes)
    if (
      !current
      || current.version < 1
      || !orgId
      || current.orgId !== orgId
      || !Number.isSafeInteger(expectedVersion)
      || expectedVersion < 1
      || !timeZone
      || !Number.isSafeInteger(weeklyLimitMinutes)
      || weeklyLimitMinutes < 1
      || weeklyLimitMinutes > 10080
    ) {
      const error = new Error('Ustawienia Grafiku są nieprawidłowe. Sprawdź strefę czasu i tygodniowy limit pracy.')
      error.code = 'WORKFORCE_SCHEDULE_INVALID_SETTINGS_REQUEST'
      throw error
    }

    try {
      new Intl.DateTimeFormat('en', { timeZone }).format(new Date())
    } catch {
      const error = new Error('Wybierz prawidłową strefę czasu Grafiku.')
      error.code = 'WORKFORCE_SCHEDULE_INVALID_SETTINGS_REQUEST'
      throw error
    }

    const configuration = {
      expectedVersion,
      timeZone,
      weeklyLimitMinutes,
    }
    const response = await runIdempotent('set-configuration-update', { orgId, configuration }, (idempotencyKey) => (
      service.setWorkforceScheduleConfiguration(orgId, configuration, { idempotencyKey })
    ))
    if (!isConfirmedWorkforceScheduleSettings(response?.settings, { orgId, ...configuration })) {
      const error = new Error('Serwer nie zwrócił pełnego potwierdzenia zapisanych ustawień. Odśwież Grafik przed kolejną zmianą.')
      error.code = 'WORKFORCE_SCHEDULE_INVALID_SETTINGS_RESPONSE'
      throw error
    }
    return normalizeWorkforceScheduleSettings(response.settings)
  }

  async function saveShift({ shift }) {
    const orgId = currentOrgId()
    assertWorkforceScheduleSelectableReferences(shift, state.snapshot)
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
      const confirmed = confirmAction([
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
    asyncGuard.resetSession()
    requestSequence += 1
    activeController?.abort()
    activeController = null
    operationRegistry.clear()
    catalogSyncGate.reset()
    catalogSyncAttempt = 0
    Object.assign(state, {
      range: currentWeekRange(),
      snapshot: null,
      snapshotVersion: state.snapshotVersion + 1,
      status: 'idle',
      error: '',
      setupRequired: false,
      setupTimeZone: 'Europe/Warsaw',
      settings: null,
      busy: false,
      catalogSync: {
        busy: false,
        conflicts: [],
        error: '',
        hasMoreConflicts: false,
        stale: false,
        summary: null,
      },
    })
    render()
  }

  function deactivate() {
    requestSequence += 1
    activeController?.abort()
    activeController = null
  }

  function cleanup() {
    asyncGuard.resetSession()
    deactivate()
    operationRegistry.clear()
    catalogSyncGate.reset()
    reactRoot?.unmount()
    reactRoot = null
  }

  const hasUsableData = () => Boolean(state.snapshot && state.status === 'ready')

  return { bind, cleanup, deactivate, hasUsableData, refresh, resetSession }
}

export default ScheduleContent
