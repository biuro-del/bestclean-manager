import './style.css'
import template from './template.html?raw'
import { DEFAULT_ZONE_TYPE_OPTIONS } from '../objects/zones/index.js'
import {
  filterVisibleUnresolvedLegacyGroups,
  groupLegacyOpenEventCandidates,
  groupOpenCleanEventConflicts,
  groupOrphanOpenCleanEvents,
  groupUnresolvedLegacyOpenEvents,
  openEventRecordKey,
  openEventWorkerKey,
} from '../../services/openEventIntegrity'
import { preserveUnchangedEventTimestamp } from './eventTimePolicy'
import {
  isOwnWorkdayEditBlocked,
  OWN_WORKDAY_EDIT_DENIED_MESSAGE,
} from '../workers/workdayEditAccess.js'

export const route = 'events'
export const viewId = 'view-events'
export { template }

export function createEventsFeature(ctx) {
  const {
    appState,
    canDeleteEvents,
    canManageEvents,
    createBindingHelpers,
    createEvent,
    dashboardClockLabelToHm,
    dashboardDurationLabelToHm,
    deleteEvent,
    forceDeletePortalEvents,
    ensurePdfMakeLoaded,
    ensureSelectValue,
    escapeHtml,
    eventEditorScannedQrLabel,
    firstDayOfCurrentMonthYmd,
    formatDatePl,
    formatTime,
    getClients,
    getEventsFingerprintForOrg,
    getWorkdays,
    getWorkers,
    getZones,
    isUnassignedCleanZone,
    isoToLocalDateTimeInput,
    localDateTimeInputToIso,
    mapZoneForView,
    normalizeSearchText,
    openEventHistoryFromRow,
    refreshDashboardAfterEventSave,
    refreshDashboardWidgets,
    refreshWorkerAccountTimeAfterWorkdaySave,
    reportGeoHidePreviewSoon,
    reportGeoOpenModal,
    reportGeoReadCoordsFromNode,
    reportGeoShowPreview,
    reportHistoryExtractGpsCoords,
    reportHistoryRefreshAfterEventSave,
    reportHistoryResolveDayGpsCoords,
    reportHistoryParseGeoPair,
    resolveClientLabelWithQrFallback,
    setSelectOptions,
    setSubwelcomeMetric,
    setupResizableGridTable,
    showTransientNotice,
    todayYmd,
    toIso,
    updateEvent,
    workerDetailIsoToHm,
    workerDetailSanitizeFilename,
    workStatusIntervalFromRow,
    workStatusIntervalFromTimes,
    workStatusIntervalsOverlap,
    workStatusYmdFromTimestamp,
    ymdToIsoRangeEnd,
    ymdToIsoRangeStart,
    zoneQrCodeFromRow,
  } = ctx
  const EVENTS_REFRESH_POLL_MS = 10000
  const EVENTS_DEFAULT_PAGE_SIZE = 25
  const EVENTS_PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
  const EVENT_EDITOR_PICKER_MAX_OPTIONS = 36
  const EVENT_EDITOR_PICKER_EMPTY_MAX_OPTIONS = 18
  const EVENT_FILTER_COMBO_MAX_OPTIONS = 60
  const EVENT_DELETION_TOMBSTONE_TTL_MS = 5 * 60 * 1000
  const EVENT_INTEGRITY_CATEGORY_META = Object.freeze({
    conflict: {
      title: 'Równoległe otwarte CLEAN',
      description:
        'Wykryto więcej niż jeden otwarty status CLEAN u tej samej osoby. Konflikty trzeba zamknąć przed rozpoczęciem kolejnego CLEAN.',
      countLabel: 'otwarte CLEAN',
      icon: 'ph-warning-octagon',
      tone: 'danger',
    },
    orphan: {
      title: 'CLEAN bez aktywnego dnia pracy',
      description:
        'Jawny otwarty CLEAN nie ma aktywnego, jednoznacznie powiązanego dnia pracy. Wpis blokuje kolejny CLEAN i wymaga sprawdzenia.',
      countLabel: 'CLEAN bez aktywnego dnia',
      icon: 'ph-link-break',
      tone: 'danger',
    },
    unresolved: {
      title: 'Nierozstrzygnięte wpisy',
      description:
        'Nierozstrzygnięte otwarte wpisy bez typu zdarzenia blokują nowy CLEAN do czasu ręcznej weryfikacji powiązanego dnia pracy.',
      countLabel: 'nierozstrzygnięte',
      icon: 'ph-question',
      tone: 'danger',
    },
    legacy: {
      title: 'Historyczne do klasyfikacji',
      description:
        'Historyczne wpisy bez typu zdarzenia wymagają klasyfikacji. Nie są automatycznie uznawane za bieżący CLEAN.',
      countLabel: 'historyczne',
      icon: 'ph-clock-counter-clockwise',
      tone: 'review',
    },
  })
  let eventsRefreshInFlight = null
  let eventsRefreshQueuedOptions = null
  let eventsPollingTimer = 0
  let eventsLastFingerprintToken = ''
  let eventReferenceLoadPromise = null
  let eventEditorOptionsCache = null
  let eventEditorOptionsCacheKey = ''
  let eventEditorPickerFilterFrame = 0
  let eventPendingSavedRows = []
  let eventDeletedRowTombstones = []
  let eventDeleteConfirmResolver = null
  let eventsSummaryRequestId = 0
  const eventFilterComboStates = new Map()
  let eventsOpenIntegrityGroups = []
  let eventsOpenCleanOrphanGroups = []
  let eventsUnresolvedLegacyGroups = []
  let eventsLegacyOpenGroups = []
  let eventsOpenIntegrityRefreshPromise = null
  let eventsOpenIntegrityRefreshOrgId = ''
  let eventsOpenIntegrityRefreshGeneration = 0
  let eventsOpenIntegrityFocus = null
  let eventsIntegrityModalKind = ''
  let eventsIntegrityModalTrigger = null

  function mergeEventsRefreshOptions(base = {}, incoming = {}) {
    const merged = {
      ...base,
      ...incoming,
      resetPage: base.resetPage === true || incoming.resetPage === true,
      applyStoredFilters: base.applyStoredFilters === true || incoming.applyStoredFilters === true,
      forceRefresh: base.forceRefresh === true || incoming.forceRefresh === true,
    }
    const baseIsSilent = Object.prototype.hasOwnProperty.call(base, 'silent') ? base.silent === true : true
    merged.silent = baseIsSilent && incoming.silent === true
    return merged
  }

  function queueEventsRefresh(options = {}) {
    eventsRefreshQueuedOptions = mergeEventsRefreshOptions(eventsRefreshQueuedOptions ?? {}, options)
  }

  function eventSelectionKey(row, index) {
    const key = String(row?.eventId ?? row?.workdayId ?? row?.id ?? '').trim()
    return key || `row-${index}`
  }

  function eventNormalizeQrCode(value) {
    const text = String(value ?? '').trim().toUpperCase()
    if (!text || text === '-') {
      return ''
    }
    const direct = text.match(/^[A-Z]{1,8}\d{2,}[A-Z0-9-]*$/)
    if (direct) {
      return text
    }
    const match = text.match(/\b([A-Z]{1,8}\d{2,}[A-Z0-9-]*)\b/)
    return String(match?.[1] ?? '').trim().toUpperCase()
  }

  function eventActualQrCodeFromRow(row = {}) {
    const candidates = [
      row?.qrCode,
      row?.dayStartObject,
      row?.startObject,
      row?.dayStopObject,
      row?.stopObject,
      row?.workdayUtilityRoomId,
      row?.qrStartSourceItem?.dayStartObject,
      row?.qrStartSourceItem?.startObject,
      row?.qrStopSourceItem?.dayStopObject,
      row?.qrStopSourceItem?.stopObject,
      row?.dayComment,
      row?.comment,
    ]

    for (const candidate of candidates) {
      const code = eventNormalizeQrCode(candidate)
      if (code) {
        return code
      }
    }

    return ''
  }

  function eventOpenIntegrityGroupByRecordId() {
    const result = new Map()
    const addGroups = (groups, integrityKind) => {
      groups.forEach((group) => {
        ;(Array.isArray(group?.recordIds) ? group.recordIds : []).forEach((recordId) => {
          if (recordId) {
            result.set(recordId, { ...group, integrityKind })
          }
        })
      })
    }
    addGroups(eventsOpenIntegrityGroups, 'conflict')
    addGroups(eventsOpenCleanOrphanGroups, 'orphan')
    addGroups(eventsUnresolvedLegacyGroups, 'unresolved')
    addGroups(eventsLegacyOpenGroups, 'legacy')
    return result
  }

  function eventOpenIntegrityAllGroups() {
    return [
      ...eventsOpenIntegrityGroups.map((group) => ({ ...group, integrityKind: 'conflict' })),
      ...eventsOpenCleanOrphanGroups.map((group) => ({ ...group, integrityKind: 'orphan' })),
      ...eventsUnresolvedLegacyGroups.map((group) => ({ ...group, integrityKind: 'unresolved' })),
      ...eventsLegacyOpenGroups.map((group) => ({ ...group, integrityKind: 'legacy' })),
    ]
  }

  function eventOpenIntegrityGroupsForKind(integrityKind) {
    switch (String(integrityKind ?? '').trim()) {
      case 'conflict':
        return eventsOpenIntegrityGroups
      case 'orphan':
        return eventsOpenCleanOrphanGroups
      case 'unresolved':
        return eventsUnresolvedLegacyGroups
      case 'legacy':
        return eventsLegacyOpenGroups
      default:
        return []
    }
  }

  function eventOpenIntegrityCategory(integrityKind) {
    const kind = String(integrityKind ?? '').trim()
    const meta = EVENT_INTEGRITY_CATEGORY_META[kind]
    if (!meta) {
      return null
    }

    const groups = eventOpenIntegrityGroupsForKind(kind)
    return {
      ...meta,
      kind,
      groups,
      workerCount: groups.length,
      recordCount: groups.reduce((sum, group) => sum + Number(group?.count ?? 0), 0),
    }
  }

  function eventOpenIntegrityCategories() {
    return ['conflict', 'orphan', 'unresolved', 'legacy']
      .map((kind) => eventOpenIntegrityCategory(kind))
      .filter((category) => category?.groups?.length)
  }

  function eventOpenIntegrityFocusedGroup() {
    const workerKey = String(eventsOpenIntegrityFocus?.workerKey ?? '').trim()
    if (!workerKey) {
      return null
    }

    const integrityKind = String(eventsOpenIntegrityFocus?.integrityKind ?? '').trim()
    return (
      eventOpenIntegrityAllGroups().find((group) => {
        const groupWorkerKey = String(
          group?.workerKey ?? openEventWorkerKey(Array.isArray(group?.rows) ? group.rows[0] : {}),
        ).trim()
        return groupWorkerKey === workerKey && (!integrityKind || group?.integrityKind === integrityKind)
      }) ?? null
    )
  }

  function clearOpenEventIntegrityFocus({ renderAlert = true } = {}) {
    const previousPage = Number(eventsOpenIntegrityFocus?.previousPage)
    eventsOpenIntegrityFocus = null
    if (Number.isFinite(previousPage) && previousPage > 0) {
      appState.eventsPage = Math.floor(previousPage)
    }
    if (renderAlert) {
      renderOpenEventIntegrity()
    }
  }

  function renderOpenIntegrityFocusPage() {
    const group = eventOpenIntegrityFocusedGroup()
    if (!group) {
      clearOpenEventIntegrityFocus()
      void fetchEventsForCurrentSession({ forceRefresh: true })
      return
    }

    const rows = Array.isArray(group.rows) ? group.rows : []
    const pageSize = normalizeEventsPageSize(appState.eventsPageSize)
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
    appState.eventsPage = Math.min(Math.max(1, Number(appState.eventsPage) || 1), totalPages)
    appState.eventsPageSize = pageSize
    appState.eventsHasNext = appState.eventsPage < totalPages
    appState.eventsEstimatedTotal = false
    appState.eventsTotal = rows.length
    appState.eventsTotalPages = totalPages

    const startIndex = (appState.eventsPage - 1) * pageSize
    const pageRows = rows.slice(startIndex, startIndex + pageSize)
    renderEventsRows(pageRows)
    updateEventsPager(pageRows.length)
    syncEventsPageSizeControl()
    setSubwelcomeMetric('#view-events .subwelcome', rows.length)
  }

  function eventOpenIntegrityPlaceLabels(group = {}) {
    return [
      ...new Set(
        (Array.isArray(group.rows) ? group.rows : [])
          .map((row) => {
            const qrCode = eventNormalizeQrCode(
              row?.qrCode ??
                row?.zoneId ??
                row?.roomId ??
                row?.utilityRoomId ??
                zoneQrCodeFromRow(row),
            )
            const place = String(
              row?.clientName ??
                row?.klient ??
                row?.zoneName ??
                row?.strefa ??
                '',
            ).trim()
            return [place, qrCode].filter(Boolean).join(' / ')
          })
          .filter(Boolean),
      ),
    ]
  }

  function eventOpenIntegrityPlaceSummary(group = {}) {
    const places = eventOpenIntegrityPlaceLabels(group)
    if (!places.length) {
      return 'Brak przypisanego kodu QR'
    }

    const visiblePlaces = places.slice(0, 2)
    const remainingCount = places.length - visiblePlaces.length
    return `${visiblePlaces.join(' · ')}${remainingCount > 0 ? ` · +${remainingCount} kolejnych` : ''}`
  }

  function eventIntegrityModalIsOpen() {
    return document.getElementById('evIntegrityModalOverlay')?.style.display === 'flex'
  }

  function eventIntegrityModalFocusableElements() {
    const overlay = document.getElementById('evIntegrityModalOverlay')
    if (!overlay) {
      return []
    }

    return [...overlay.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((node) => node instanceof HTMLElement && node.getClientRects().length > 0)
  }

  function closeEventIntegrityModal({ restoreFocus = true } = {}) {
    const overlay = document.getElementById('evIntegrityModalOverlay')
    const closingKind = eventsIntegrityModalKind
    const storedTrigger = eventsIntegrityModalTrigger

    if (overlay) {
      overlay.style.display = 'none'
      overlay.setAttribute('aria-hidden', 'true')
      delete overlay.dataset.tone
    }

    eventsIntegrityModalKind = ''
    eventsIntegrityModalTrigger = null

    if (!restoreFocus) {
      return
    }

    const fallbackTrigger = closingKind
      ? document.querySelector(`[data-event-integrity-kind="${closingKind}"]`)
      : null
    const focusTarget = storedTrigger?.isConnected ? storedTrigger : fallbackTrigger
    window.requestAnimationFrame(() => focusTarget?.focus?.())
  }

  function renderEventIntegrityModal(integrityKind = eventsIntegrityModalKind) {
    const category = eventOpenIntegrityCategory(integrityKind)
    const overlay = document.getElementById('evIntegrityModalOverlay')
    const title = document.getElementById('evIntegrityModalTitle')
    const description = document.getElementById('evIntegrityModalDescription')
    const icon = document.querySelector('#evIntegrityModalIcon i')
    const workerCount = document.getElementById('evIntegrityModalWorkerCount')
    const recordCount = document.getElementById('evIntegrityModalRecordCount')
    const list = document.getElementById('evIntegrityModalList')

    if (!category?.groups?.length || !overlay || !title || !description || !list) {
      if (eventIntegrityModalIsOpen()) {
        closeEventIntegrityModal()
      }
      return
    }

    overlay.dataset.tone = category.tone
    title.textContent = category.title
    description.textContent = category.description
    if (icon) {
      icon.className = `ph ${category.icon}`
    }
    if (workerCount) {
      workerCount.textContent = String(category.workerCount)
    }
    if (recordCount) {
      recordCount.textContent = String(category.recordCount)
    }

    list.innerHTML = category.groups
      .map((group) => {
        const placeSummary = eventOpenIntegrityPlaceSummary(group)
        return `
          <li class="ev-integrity-modal-item">
            <span class="ev-integrity-modal-worker-icon" aria-hidden="true">
              <i class="ph ph-user"></i>
            </span>
            <span class="ev-integrity-modal-worker">
              <strong>${escapeHtml(group.workerLabel)}</strong>
              <small>${escapeHtml(placeSummary)}</small>
            </span>
            <span class="ev-integrity-modal-count">${escapeHtml(group.count)} ${escapeHtml(category.countLabel)}</span>
            <button
              class="btn2 ev-integrity-modal-show"
              type="button"
              data-event-open-worker-key="${escapeHtml(group.workerKey)}"
              data-event-open-kind="${escapeHtml(category.kind)}"
              aria-label="${escapeHtml(`Pokaż zdarzenia: ${group.workerLabel} — ${category.countLabel}`)}"
            >
              <span>Pokaż zdarzenia</span>
              <i class="ph ph-arrow-right" aria-hidden="true"></i>
            </button>
          </li>
        `
      })
      .join('')
  }

  function openEventIntegrityModal(integrityKind, trigger = null) {
    const category = eventOpenIntegrityCategory(integrityKind)
    if (!category?.groups?.length) {
      return
    }

    ensureEventOverlaysMountedToBody()
    eventsIntegrityModalKind = category.kind
    eventsIntegrityModalTrigger = trigger instanceof HTMLElement ? trigger : null
    renderEventIntegrityModal(category.kind)

    const overlay = document.getElementById('evIntegrityModalOverlay')
    const title = document.getElementById('evIntegrityModalTitle')
    if (!overlay) {
      return
    }

    overlay.style.display = 'flex'
    overlay.setAttribute('aria-hidden', 'false')
    window.requestAnimationFrame(() => title?.focus?.())
  }

  function focusEventIntegrityGroup(group) {
    if (!group) {
      return
    }

    const previousPage = Number(eventsOpenIntegrityFocus?.previousPage ?? appState.eventsPage)
    eventsOpenIntegrityFocus = {
      workerKey: group.workerKey,
      integrityKind: group.integrityKind,
      previousPage: Number.isFinite(previousPage) && previousPage > 0 ? Math.floor(previousPage) : 1,
    }
    appState.eventsPage = 1
    closeEventIntegrityModal({ restoreFocus: false })
    renderOpenEventIntegrity()
    renderOpenIntegrityFocusPage()
    window.requestAnimationFrame(() => {
      document.querySelector('#evOpenStatusIntegrity [data-event-open-back]')?.focus()
    })
  }

  function renderOpenEventIntegrity(error = null) {
    const root = document.getElementById('evOpenStatusIntegrity')
    if (!root) {
      return
    }

    if (error) {
      const focusBackAction = eventsOpenIntegrityFocus
        ? '<button class="btn2" type="button" data-event-open-back>Wróć do wszystkich zdarzeń</button>'
        : ''
      closeEventIntegrityModal({ restoreFocus: false })
      root.hidden = false
      root.className = 'events-integrity-alert events-integrity-alert--unavailable'
      root.innerHTML = `
        <div class="events-integrity-unavailable">
          <span class="events-integrity-unavailable-icon" aria-hidden="true"><i class="ph ph-info"></i></span>
          <span>
            <strong>Kontrola problemów jest chwilowo niedostępna.</strong>
            <small>${escapeHtml(error instanceof Error ? error.message : 'Nie udało się pobrać danych kontrolnych.')}</small>
          </span>
          ${focusBackAction}
        </div>
      `
      return
    }

    const categories = eventOpenIntegrityCategories()
    if (!categories.length) {
      closeEventIntegrityModal({ restoreFocus: false })
      root.hidden = true
      root.className = 'events-integrity-alert'
      root.innerHTML = ''
      return
    }

    const focusedGroup = eventOpenIntegrityFocusedGroup()
    const focusedCategory = focusedGroup
      ? eventOpenIntegrityCategory(focusedGroup.integrityKind)
      : null
    const categoryCards = categories
      .map((category) => {
        const isActive = focusedGroup?.integrityKind === category.kind
        return `
          <button
            class="events-integrity-card events-integrity-card--${escapeHtml(category.tone)}${isActive ? ' is-active' : ''}"
            type="button"
            data-event-integrity-kind="${escapeHtml(category.kind)}"
            aria-haspopup="dialog"
            aria-controls="evIntegrityModalOverlay"
            aria-label="${escapeHtml(`Otwórz problem: ${category.title}. ${category.workerCount} pracowników, ${category.recordCount} rekordów.`)}"
          >
            <span class="events-integrity-card-icon" aria-hidden="true"><i class="ph ${escapeHtml(category.icon)}"></i></span>
            <span class="events-integrity-card-copy">
              <strong>${escapeHtml(category.title)}</strong>
              <small>${escapeHtml(category.workerCount)} pracowników</small>
            </span>
            <span class="events-integrity-card-count">
              <strong>${escapeHtml(category.recordCount)}</strong>
              <small>rekordów</small>
            </span>
            <i class="ph ph-caret-right events-integrity-card-arrow" aria-hidden="true"></i>
          </button>
        `
      })
      .join('')
    const focusedBar = focusedGroup && focusedCategory
      ? `
        <div class="events-integrity-focus" role="status">
          <span class="events-integrity-focus-icon" aria-hidden="true"><i class="ph ph-funnel"></i></span>
          <span>
            <small>Widok problemu</small>
            <strong>${escapeHtml(focusedCategory.title)} · ${escapeHtml(focusedGroup.workerLabel)} · ${escapeHtml(focusedGroup.count)} rekordów</strong>
          </span>
          <button class="btn2" type="button" data-event-open-back>
            <i class="ph ph-arrow-left" aria-hidden="true"></i>
            <span>Wróć do wszystkich zdarzeń</span>
          </button>
        </div>
      `
      : ''

    root.hidden = false
    root.className = 'events-integrity-alert events-integrity-alert--compact'
    root.innerHTML = `
      <div class="events-integrity-panel-head">
        <span class="events-integrity-panel-icon" aria-hidden="true"><i class="ph ph-warning-circle"></i></span>
        <span>
          <strong>Problemy do sprawdzenia</strong>
          <small>Kliknij kategorię, aby zobaczyć osoby i powiązane wpisy.</small>
        </span>
      </div>
      <div class="events-integrity-card-grid">${categoryCards}</div>
      ${focusedBar}
    `

    if (eventsIntegrityModalKind) {
      renderEventIntegrityModal(eventsIntegrityModalKind)
    }
  }

  async function readAllOpenCleanEvents(orgId, { forceRefresh = false } = {}) {
    const normalizedOrgId = String(orgId ?? '').trim()
    if (!normalizedOrgId) {
      return []
    }

    const rows = []
    const maxPages = 20
    for (let page = 1; page <= maxPages; page += 1) {
      const response = await getWorkdays(normalizedOrgId, {
        source: 'events-integrity',
        page,
        pageSize: 250,
        forceRefresh: forceRefresh && page === 1,
      })
      rows.push(...(Array.isArray(response?.items) ? response.items : []))
      if (response?.hasNext !== true) {
        break
      }
      if (page === maxPages) {
        throw new Error('Kontrola otwartych CLEAN przekroczyla bezpieczny limit 5000 rekordow.')
      }
    }
    return rows
  }

  async function refreshOpenEventIntegrity({ forceRefresh = false, rerenderRows = true } = {}) {
    const requestOrgId = String(appState.session?.orgId ?? '').trim()
    if (!requestOrgId) {
      eventsOpenIntegrityRefreshGeneration += 1
      eventsOpenIntegrityRefreshPromise = null
      eventsOpenIntegrityRefreshOrgId = ''
      eventsOpenIntegrityGroups = []
      eventsOpenCleanOrphanGroups = []
      eventsUnresolvedLegacyGroups = []
      eventsLegacyOpenGroups = []
      renderOpenEventIntegrity()
      return []
    }

    if (eventsOpenIntegrityRefreshPromise && eventsOpenIntegrityRefreshOrgId === requestOrgId) {
      return eventsOpenIntegrityRefreshPromise
    }

    const generation = ++eventsOpenIntegrityRefreshGeneration
    const refreshPromise = (async () => {
      try {
        const rows = await readAllOpenCleanEvents(requestOrgId, { forceRefresh })
        if (
          generation !== eventsOpenIntegrityRefreshGeneration ||
          String(appState.session?.orgId ?? '').trim() !== requestOrgId
        ) {
          return rows
        }
        eventsOpenIntegrityGroups = groupOpenCleanEventConflicts(rows)
        eventsOpenCleanOrphanGroups = groupOrphanOpenCleanEvents(rows)
        eventsUnresolvedLegacyGroups = filterVisibleUnresolvedLegacyGroups(
          groupUnresolvedLegacyOpenEvents(rows),
          {
            currentDayKey: todayYmd(),
            dayKeyFromValue: eventLocalDayKeyFromIso,
          },
        )
        eventsLegacyOpenGroups = groupLegacyOpenEventCandidates(rows)
        renderOpenEventIntegrity()
        if (rerenderRows && document.getElementById('evRows')) {
          if (eventsOpenIntegrityFocus) {
            renderOpenIntegrityFocusPage()
          } else {
            renderEventsRows(appState.eventRows)
          }
        }
        return rows
      } catch (error) {
        if (
          generation !== eventsOpenIntegrityRefreshGeneration ||
          String(appState.session?.orgId ?? '').trim() !== requestOrgId
        ) {
          throw error
        }
        eventsOpenIntegrityGroups = []
        eventsOpenCleanOrphanGroups = []
        eventsUnresolvedLegacyGroups = []
        eventsLegacyOpenGroups = []
        if (rerenderRows && document.getElementById('evRows')) {
          renderEventsRows(appState.eventRows)
        }
        renderOpenEventIntegrity(error)
        throw error
      } finally {
        if (eventsOpenIntegrityRefreshPromise === refreshPromise) {
          eventsOpenIntegrityRefreshPromise = null
          eventsOpenIntegrityRefreshOrgId = ''
        }
      }
    })()

    eventsOpenIntegrityRefreshPromise = refreshPromise
    eventsOpenIntegrityRefreshOrgId = requestOrgId
    return refreshPromise
  }

  function eventResolveZoneNameByQrCode(qrCode = '') {
    const normalizedQr = normalizeSearchText(eventNormalizeQrCode(qrCode) || qrCode)
    if (!normalizedQr) {
      return ''
    }

    const zone = (Array.isArray(appState.zones) ? appState.zones : []).find((item) => {
      const mappedZone = typeof mapZoneForView === 'function' ? mapZoneForView(item) : item
      const candidates = [
        mappedZone?.id,
        mappedZone?.zoneId,
        mappedZone?.qr,
        mappedZone?.qrCode,
        mappedZone?.roomId,
        mappedZone?.utilityRoomId,
      ]
      return candidates.some((candidate) => normalizeSearchText(eventNormalizeQrCode(candidate) || candidate) === normalizedQr)
    })

    if (!zone) {
      return ''
    }

    const mappedZone = typeof mapZoneForView === 'function' ? mapZoneForView(zone) : zone
    return String(mappedZone?.name ?? mappedZone?.zone ?? mappedZone?.zoneName ?? '').trim()
  }

  function eventResolveZoneLabel(row = {}) {
    const actualQrCode = eventActualQrCodeFromRow(row)
    if (actualQrCode) {
      return eventResolveZoneNameByQrCode(actualQrCode) || actualQrCode
    }

    const rawLabel = String(row?.zoneName ?? row?.strefa ?? row?.activeZone ?? '').trim()
    if (rawLabel && !eventNormalizeQrCode(rawLabel)) {
      return rawLabel
    }

    return '-'
  }

  function splitEventCommentParts(value) {
    return String(value ?? '')
      .split(/\s*\|\s*|\r?\n+/)
      .map((part) => String(part ?? '').trim())
      .filter(Boolean)
  }

  const EVENT_GPS_TECH_TOKEN_REGEX = /\[\[\s*GPS\b[\s\S]*?\]\]/gi

  function stripEventGpsTechTokens(value) {
    return String(value ?? '')
      .replace(EVENT_GPS_TECH_TOKEN_REGEX, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function isEventGpsTechToken(value) {
    return /^\[\[\s*GPS\b[\s\S]*?\]\]$/i.test(String(value ?? '').trim())
  }

  function isSystemGeneratedEventCommentToken(value) {
    const token = String(value ?? '').trim()
    if (!token) {
      return true
    }

    const normalized = token.toUpperCase()
    const qrCodePattern = '(?=[A-Z0-9_-]*\\d)[A-Z0-9_-]+'

    if (isEventGpsTechToken(token)) {
      return true
    }
    if (/^\[EDITEDBY:[^\]]+\]$/.test(normalized)) {
      return true
    }
    if (new RegExp(`^(?:QR[_\\s]+)?(?:START|STOP)\\s+${qrCodePattern}$`).test(normalized)) {
      return true
    }
    if (/^(?:CLEAN_)?(?:START_GPS|STOP_GPS)\b/.test(normalized)) {
      return true
    }

    return false
  }

  function isSystemGeneratedEventComment(value) {
    const parts = splitEventCommentParts(value)
    if (!parts.length) {
      return false
    }
    return parts.every((part) => {
      const visiblePart = stripEventGpsTechTokens(part)
      return !visiblePart || isSystemGeneratedEventCommentToken(visiblePart)
    })
  }

  function normalizeVisibleEventComment(value) {
    const comment = String(value ?? '').trim()
    if (!comment) {
      return ''
    }

    if (isSystemGeneratedEventComment(comment)) {
      return ''
    }

    const parts = splitEventCommentParts(comment)
    const visibleParts = parts
      .map((part) => stripEventGpsTechTokens(part))
      .filter((part) => part && !isSystemGeneratedEventCommentToken(part))
    if (!visibleParts.length) {
      return ''
    }

    return visibleParts.join(' | ')
  }

  function eventIdentityCandidateIds(row) {
    const candidates = [
      row?.eventId,
      row?.workdayId,
      row?.id,
      row?.linkedWorkdayId,
      row?.startEventId,
      row?.endEventId,
    ]
    return [...new Set(candidates.map((value) => String(value ?? '').trim()).filter(Boolean))]
  }

  function eventMirrorWorkdayId(row) {
    const eventId = String(row?.eventId ?? row?.id ?? '').trim()
    const workdayId = String(row?.workdayId ?? '').trim()
    const linkedWorkdayId = String(row?.linkedWorkdayId ?? '').trim()
    const id = eventId || workdayId || linkedWorkdayId
    if (!id || !id.toUpperCase().startsWith('EV-')) {
      return ''
    }
    if (workdayId && workdayId !== id) {
      return ''
    }
    if (linkedWorkdayId && linkedWorkdayId !== id) {
      return ''
    }
    return id
  }

  function eventLinkedWorkdayDeletionId(row) {
    const sourceKind = String(row?.historySourceKind ?? '').trim().toLowerCase()
    const eventId = String(row?.eventId ?? row?.id ?? '').trim()
    const rowId = String(row?.id ?? '').trim()
    const explicitWorkdayId = String(row?.workdayId ?? row?.linkedWorkdayId ?? '').trim()
    const wdFallbackId = [eventId, rowId].find((id) => id.toUpperCase().startsWith('WD-')) || ''
    const workdayId =
      explicitWorkdayId ||
      (sourceKind === 'workday' || row?.hasExplicitEventId === false ? eventId || rowId : '') ||
      wdFallbackId
    if (!workdayId) {
      return ''
    }
    if (sourceKind === 'workday' || row?.hasExplicitEventId === false || !eventId || eventId === workdayId) {
      return workdayId
    }
    return ''
  }

  function eventShouldDeleteLinkedWorkday(row, eventId) {
    const targetId = String(eventId ?? '').trim()
    const mirrorWorkdayId = eventMirrorWorkdayId(row)
    const linkedWorkdayId = eventLinkedWorkdayDeletionId(row)
    return Boolean(targetId && (mirrorWorkdayId === targetId || linkedWorkdayId === targetId))
  }

  function eventDeletionCandidateIds(row) {
    const sourceKind = String(row?.historySourceKind ?? '').trim().toLowerCase()
    const eventId = String(row?.eventId ?? '').trim()
    const rowId = String(row?.id ?? '').trim()
    const workdayIds = new Set(
      [row?.workdayId, row?.linkedWorkdayId]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean),
    )
    const hasExplicitEventId =
      row?.hasExplicitEventId === true ||
      sourceKind === 'event' ||
      Boolean(eventId && !workdayIds.has(eventId))
    const candidates = []

    if (hasExplicitEventId) {
      candidates.push(eventId, rowId)
    }

    ;[row?.startEventId, row?.endEventId].forEach((value) => {
      const id = String(value ?? '').trim()
      if (id && !workdayIds.has(id)) {
        candidates.push(id)
      }
    })

    const mirrorWorkdayId = eventMirrorWorkdayId(row)
    if (mirrorWorkdayId) {
      candidates.push(mirrorWorkdayId)
    }
    const linkedWorkdayId = eventLinkedWorkdayDeletionId(row)
    if (linkedWorkdayId) {
      candidates.push(linkedWorkdayId)
    }

    return [...new Set(candidates.map((value) => String(value ?? '').trim()).filter(Boolean))]
  }

  function eventCanDelete(row) {
    return eventDeletionCandidateIds(row).length > 0
  }

  function eventRowFingerprintKey(row) {
    const normalize = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
    const startAt = toIso(row?.startAt)
    const endAt = toIso(row?.endAt)
    const durationRaw = Number(row?.durationSec)
    const durationSec = Number.isFinite(durationRaw) && durationRaw > 0 ? Math.floor(durationRaw) : 0
    const status = normalizeEventStatus(row?.status, Boolean(row?.endAt))
    const workerKey = normalize(row?.workerLogin || row?.workerName)
    const zoneKey = normalize(row?.zoneId ?? row?.roomId ?? row?.utilityRoomId ?? row?.strefa ?? row?.zoneName)
    const clientKey = normalize(row?.clientId ?? row?.klient ?? row?.clientName)
    const endReason = normalize(row?.endReason)
    return [workerKey, startAt, endAt, zoneKey, clientKey, durationSec, status, endReason].join('|')
  }

  function eventLocalDayKeyFromIso(value) {
    const iso = toIso(value)
    if (!iso) {
      return ''
    }

    const date = new Date(iso)
    if (!Number.isFinite(date.getTime())) {
      return ''
    }

    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  function eventDurationToHms(secondsValue) {
    const seconds = Number(secondsValue ?? 0)
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return '-'
    }

    const rounded = Math.floor(seconds)
    const hours = String(Math.floor(rounded / 3600)).padStart(2, '0')
    const minutes = String(Math.floor((rounded % 3600) / 60)).padStart(2, '0')
    const secondsRemainder = String(rounded % 60).padStart(2, '0')
    return `${hours}:${minutes}:${secondsRemainder}`
  }

  function eventFindClientById(clientId) {
    const key = normalizeSearchText(clientId)
    if (!key) {
      return null
    }

    return (
      (Array.isArray(appState.clients) ? appState.clients : []).find((client) => {
        const candidates = [client?.id, client?.clientId, client?.name, client?.clientName]
        return candidates.some((value) => normalizeSearchText(value) === key)
      }) ?? null
    )
  }

  function eventFindZoneById(zoneId) {
    const key = normalizeSearchText(zoneId)
    if (!key) {
      return null
    }

    return (
      (Array.isArray(appState.zones) ? appState.zones : []).find((zone) => {
        const mappedZone = typeof mapZoneForView === 'function' ? mapZoneForView(zone) : zone
        const candidates = [
          zone?.id,
          zone?.zoneId,
          zone?.qr,
          zone?.name,
          zone?.zone,
          mappedZone?.id,
          mappedZone?.zoneId,
          mappedZone?.qr,
          mappedZone?.zoneName,
        ]
        return candidates.some((value) => normalizeSearchText(value) === key)
      }) ?? null
    )
  }

  function eventBuildSavedViewRow(savedEvent = {}, payload = {}) {
    const eventId = String(
      savedEvent?.eventId ??
        payload?.eventId ??
        savedEvent?.workdayId ??
        savedEvent?.linkedWorkdayId ??
        savedEvent?.id ??
        '',
    ).trim()
    const rowId = String(savedEvent?.id ?? eventId ?? '').trim()
    const startAt = toIso(savedEvent?.startAt ?? payload?.startAt)
    const endAt = toIso(savedEvent?.endAt ?? payload?.endAt)
    const sourceAt = startAt || endAt

    if (!eventId && !rowId && !sourceAt) {
      return null
    }

    const durationRaw = Number(savedEvent?.durationSec ?? payload?.durationSec ?? 0)
    const durationSec = Number.isFinite(durationRaw) && durationRaw > 0 ? Math.floor(durationRaw) : 0
    const zoneId = String(
      savedEvent?.zoneId ??
        savedEvent?.utilityRoomId ??
        savedEvent?.roomId ??
        payload?.zoneId ??
        payload?.utilityRoomId ??
        payload?.roomId ??
        '',
    ).trim()
    const zone = eventFindZoneById(zoneId)
    const zoneView = zone && typeof mapZoneForView === 'function' ? mapZoneForView(zone) : zone
    const clientId = String(savedEvent?.clientId ?? payload?.clientId ?? zoneView?.clientId ?? '').trim()
    const client = eventFindClientById(clientId)
    const clientName = String(
      savedEvent?.clientName ??
        savedEvent?.klient ??
        payload?.clientName ??
        client?.name ??
        client?.clientName ??
        zoneView?.clientName ??
        clientId ??
        '',
    ).trim()
    const zoneName = String(
      savedEvent?.zoneName ??
        savedEvent?.strefa ??
        payload?.zoneName ??
        zoneView?.zoneName ??
        zone?.name ??
        zone?.zone ??
        zoneId ??
        '',
    ).trim()
    const location = String(
      savedEvent?.lokalizacja ??
        savedEvent?.location ??
        payload?.lokalizacja ??
        payload?.location ??
        zoneView?.location ??
        '',
    ).trim()
    const zoneFunction = String(
      savedEvent?.zoneFunction ?? savedEvent?.functionName ?? payload?.zoneFunction ?? zoneView?.function ?? zone?.function ?? '',
    ).trim()
    const status = normalizeEventStatus(savedEvent?.status ?? payload?.status, Boolean(endAt))
    const workdayId = String(savedEvent?.workdayId ?? savedEvent?.linkedWorkdayId ?? rowId ?? eventId ?? '').trim()
    const editedBy = String(
      savedEvent?.editedBy ?? savedEvent?.updatedBy ?? payload?.editedBy ?? payload?.updatedBy ?? appState.session?.name ?? '',
    ).trim()
    const comment = String(savedEvent?.comment ?? payload?.comment ?? '').trim()

    return {
      id: rowId || eventId || `saved-${Date.now()}`,
      eventId: eventId || rowId,
      workdayId: workdayId || eventId || rowId,
      linkedWorkdayId: workdayId || eventId || rowId,
      historySourceKind: 'event',
      hasExplicitEventId: true,
      orgId: String(savedEvent?.orgId ?? payload?.orgId ?? appState.session?.orgId ?? '').trim(),
      workerLogin: String(savedEvent?.workerLogin ?? payload?.workerLogin ?? '').trim(),
      workerName: String(savedEvent?.workerName ?? payload?.workerName ?? '').trim(),
      roomId: zoneId,
      utilityRoomId: zoneId,
      zoneId,
      strefa: zoneName || '-',
      zoneName: zoneName || '-',
      zoneFunction,
      functionName: zoneFunction,
      isSpecialZone: Boolean(savedEvent?.isSpecialZone ?? payload?.isSpecialZone),
      clientId,
      klient: clientName || clientId || '-',
      clientName: clientName || clientId || '-',
      lokalizacja: location || '-',
      startAt,
      endAt,
      dayStartAt: startAt,
      dayEndAt: endAt,
      dayEndScanAt: endAt,
      workdayUtilityRoomId: zoneId,
      qrCode: String(savedEvent?.qrCode ?? payload?.qrCode ?? zoneView?.qr ?? zone?.qr ?? '').trim(),
      date: formatDatePl(sourceAt),
      start: formatTime(startAt),
      stop: formatTime(endAt),
      durationSec,
      duration: eventDurationToHms(durationSec),
      status,
      closeMarkedAt: toIso(savedEvent?.closeMarkedAt ?? payload?.closeMarkedAt) || (status === 'CLOSED' ? endAt : null),
      endReason: String(savedEvent?.endReason ?? payload?.endReason ?? '').trim(),
      comment,
      dayComment: comment,
      clientStatus: String(savedEvent?.clientStatus ?? payload?.clientStatus ?? (clientId ? 'CLIENT' : '')).trim(),
      editedBy: editedBy || '-',
      updatedAt: toIso(savedEvent?.updatedAt ?? payload?.updatedAt) || toIso(new Date().toISOString()),
      startEventId: eventId || rowId,
      endEventId: eventId || rowId,
      dayKey: eventLocalDayKeyFromIso(sourceAt),
    }
  }

  function eventRowsRepresentSameSavedEvent(left = {}, right = {}) {
    const leftIds = [left?.eventId, left?.workdayId, left?.linkedWorkdayId, left?.id]
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)
    const rightIds = new Set(
      [right?.eventId, right?.workdayId, right?.linkedWorkdayId, right?.id]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean),
    )

    if (leftIds.some((id) => rightIds.has(id))) {
      return true
    }

    return eventRowFingerprintKey(left) === eventRowFingerprintKey(right)
  }

  function eventDeletionIdentity(row = {}) {
    const ids = [
      ...eventDeletionCandidateIds(row),
      row?.id,
      row?.eventId,
      row?.workdayId,
      row?.linkedWorkdayId,
      row?.startEventId,
      row?.endEventId,
    ]
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)

    return {
      ids: [...new Set(ids)],
      fingerprint: eventRowFingerprintKey(row),
    }
  }

  function eventPruneDeletionTombstones() {
    const now = Date.now()
    eventDeletedRowTombstones = eventDeletedRowTombstones.filter(
      (entry) => Number(entry?.expiresAt ?? 0) > now,
    )
  }

  function eventDeletionTombstoneMatchesRow(entry, row = {}) {
    const rowIdentity = eventDeletionIdentity(row)
    const tombstoneIds = new Set(Array.isArray(entry?.ids) ? entry.ids : [])
    if (rowIdentity.ids.some((id) => tombstoneIds.has(id))) {
      return true
    }
    if (tombstoneIds.size && rowIdentity.ids.length) {
      return false
    }

    const fingerprint = String(entry?.fingerprint ?? '')
    return Boolean(fingerprint && fingerprint === rowIdentity.fingerprint)
  }

  function eventSuppressDeletedRows(rows = []) {
    eventPruneDeletionTombstones()
    const sourceRows = Array.isArray(rows) ? rows : []
    if (!eventDeletedRowTombstones.length) {
      return sourceRows
    }

    return sourceRows.filter(
      (row) => !eventDeletedRowTombstones.some((entry) => eventDeletionTombstoneMatchesRow(entry, row)),
    )
  }

  function eventRegisterDeletedRows(rows = []) {
    const deletedRows = (Array.isArray(rows) ? rows : [rows]).filter(Boolean)
    if (!deletedRows.length) {
      return 0
    }

    const expiresAt = Date.now() + EVENT_DELETION_TOMBSTONE_TTL_MS
    const entries = deletedRows.map((row) => ({
      ...eventDeletionIdentity(row),
      expiresAt,
    }))
    eventPruneDeletionTombstones()
    eventDeletedRowTombstones = [
      ...entries,
      ...eventDeletedRowTombstones.filter(
        (existing) => !deletedRows.some((row) => eventDeletionTombstoneMatchesRow(existing, row)),
      ),
    ].slice(0, 100)

    eventPendingSavedRows = eventSuppressDeletedRows(eventPendingSavedRows)
    const currentRows = Array.isArray(appState.eventRows) ? appState.eventRows : []
    const visibleRows = eventSuppressDeletedRows(currentRows)
    const removedCount = Math.max(0, currentRows.length - visibleRows.length)
    if (!removedCount) {
      return 0
    }

    if (!visibleRows.length && Number(appState.eventsPage) > 1) {
      appState.eventsPage = Math.max(1, Number(appState.eventsPage) - 1)
    }
    appState.eventsTotal = Math.max(0, Number(appState.eventsTotal ?? currentRows.length) - removedCount)
    appState.eventsTotalPages = Math.max(
      1,
      Math.ceil(appState.eventsTotal / normalizeEventsPageSize(appState.eventsPageSize)),
    )
    renderEventsRows(visibleRows)
    updateEventsPager(visibleRows.length)
    setSubwelcomeMetric('#view-events .subwelcome', appState.eventsTotal)
    return removedCount
  }

  function eventPrunePendingRowsAgainst(rows = []) {
    const sourceRows = (Array.isArray(rows) ? rows : []).filter((row) => row?.__pendingSavedEvent !== true)
    if (!eventPendingSavedRows.length || !sourceRows.length) {
      return
    }

    eventPendingSavedRows = eventPendingSavedRows.filter(
      (pendingRow) => !sourceRows.some((row) => eventRowsRepresentSameSavedEvent(pendingRow, row)),
    )
  }

  function eventRegisterPendingSavedRow(savedEvent, payload) {
    const savedRow = eventBuildSavedViewRow(savedEvent, payload)
    if (!savedRow) {
      return { row: null, visibility: 'none' }
    }
    const pendingRow = { ...savedRow, __pendingSavedEvent: true }

    eventPendingSavedRows = [
      pendingRow,
      ...eventPendingSavedRows.filter((row) => !eventRowsRepresentSameSavedEvent(pendingRow, row)),
    ].slice(0, 20)

    return {
      row: pendingRow,
      visibility: eventSavedRowMatchesCurrentFilters(pendingRow) ? 'inserted' : 'hidden',
    }
  }

  function eventMergePendingRowsForCurrentView(rows = []) {
    const sourceRows = eventSuppressDeletedRows(Array.isArray(rows) ? rows : [])
    eventPendingSavedRows = eventSuppressDeletedRows(eventPendingSavedRows)
    eventPrunePendingRowsAgainst(sourceRows)

    if (!eventPendingSavedRows.length) {
      return { rows: sourceRows, pendingCount: 0 }
    }

    const visiblePendingRows = eventPendingSavedRows.filter(
      (pendingRow) =>
        eventSavedRowMatchesCurrentFilters(pendingRow) &&
        !sourceRows.some((row) => eventRowsRepresentSameSavedEvent(pendingRow, row)),
    )

    if (!visiblePendingRows.length) {
      return { rows: sourceRows, pendingCount: 0 }
    }

    const pageSizeRaw = Number(appState.eventsPageSize)
    const pageSize = normalizeEventsPageSize(pageSizeRaw)
    return {
      rows: [...visiblePendingRows, ...sourceRows].slice(0, pageSize),
      pendingCount: visiblePendingRows.length,
    }
  }

  function normalizeEventsPageSize(value) {
    const parsed = Number(value)
    const normalized = Number.isFinite(parsed) ? Math.floor(parsed) : EVENTS_DEFAULT_PAGE_SIZE
    return EVENTS_PAGE_SIZE_OPTIONS.includes(normalized) ? normalized : EVENTS_DEFAULT_PAGE_SIZE
  }

  function syncEventsPageSizeControl() {
    const select = document.getElementById('evPageSize')
    if (!(select instanceof HTMLSelectElement)) {
      return
    }

    const pageSize = normalizeEventsPageSize(appState.eventsPageSize)
    appState.eventsPageSize = pageSize
    select.value = String(pageSize)
  }

  function eventSummaryDateLabel(dayKey) {
    const match = String(dayKey ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
    return match ? `${match[3]}.${match[2]}.${match[1]}` : String(dayKey ?? '').trim()
  }

  function setEventsSummaryValue(id, value) {
    const element = document.getElementById(id)
    if (element) {
      element.textContent = String(value ?? '0')
    }
  }

  function setEventsSummaryLoading() {
    ;['evSummaryTotal', 'evSummaryClosed', 'evSummaryOpen', 'evSummaryToday'].forEach((id) => {
      setEventsSummaryValue(id, '…')
    })
    const todayMeta = document.getElementById('evSummaryTodayMeta')
    if (todayMeta) {
      todayMeta.textContent = `Dzisiaj, ${eventSummaryDateLabel(todayYmd())}`
    }
  }

  function renderEventsSummary(rangeRows = [], todayRows = []) {
    const normalizedRangeRows = eventSuppressDeletedRows(Array.isArray(rangeRows) ? rangeRows : [])
    const normalizedTodayRows = eventSuppressDeletedRows(Array.isArray(todayRows) ? todayRows : [])
    let closedCount = 0
    let openCount = 0

    normalizedRangeRows.forEach((row) => {
      const status = normalizeEventStatus(row?.status, Boolean(row?.endAt))
      if (status === 'CLOSED') {
        closedCount += 1
      } else if (status === 'RUNNING' || status === 'OPEN') {
        openCount += 1
      }
    })

    setEventsSummaryValue('evSummaryTotal', normalizedRangeRows.length)
    setEventsSummaryValue('evSummaryClosed', closedCount)
    setEventsSummaryValue('evSummaryOpen', openCount)
    setEventsSummaryValue('evSummaryToday', normalizedTodayRows.length)
    const todayMeta = document.getElementById('evSummaryTodayMeta')
    if (todayMeta) {
      todayMeta.textContent = `Dzisiaj, ${eventSummaryDateLabel(todayYmd())}`
    }
  }

  async function refreshEventsSummaryCards(filters = {}) {
    if (!appState.session?.orgId) {
      renderEventsSummary([], [])
      return
    }

    const requestId = ++eventsSummaryRequestId
    const todayKey = todayYmd()
    const baseFilters = {
      ...filters,
      status: '',
      page: 1,
      pageSize: 100000,
      forceRefresh: filters.forceRefresh === true,
    }
    const todayFilters = {
      ...baseFilters,
      fromIso: ymdToIsoRangeStart(todayKey),
      toIso: ymdToIsoRangeEnd(todayKey),
    }

    setEventsSummaryLoading()
    try {
      const [rangeResponse, todayResponse] = await Promise.all([
        getWorkdays(appState.session.orgId, baseFilters),
        getWorkdays(appState.session.orgId, todayFilters),
      ])
      if (requestId !== eventsSummaryRequestId) {
        return
      }
      renderEventsSummary(rangeResponse?.items, todayResponse?.items)
    } catch (error) {
      if (requestId !== eventsSummaryRequestId) {
        return
      }
      console.warn('[events] summary refresh failed', error)
      const currentRows = Array.isArray(appState.eventRows) ? appState.eventRows : []
      const todayRows = currentRows.filter(
        (row) => String(row?.dayKey ?? eventLocalDayKeyFromIso(row?.startAt || row?.endAt)).trim() === todayKey,
      )
      renderEventsSummary(currentRows, todayRows)
    }
  }

  function eventRowTextIncludes(row, query, fields) {
    const needle = normalizeSearchText(query)
    if (!needle) {
      return true
    }

    return fields.some((field) => normalizeSearchText(row?.[field]).includes(needle))
  }

  function eventSavedRowMatchesCurrentFilters(row) {
    const filters = readEventsFilterInputs()
    const rowDayKey = row?.dayKey || eventLocalDayKeyFromIso(row?.startAt || row?.endAt)

    if (filters.from && rowDayKey && rowDayKey < filters.from) {
      return false
    }
    if (filters.to && rowDayKey && rowDayKey > filters.to) {
      return false
    }
    if (filters.workerLogin) {
      const expectedWorker = normalizeSearchText(filters.workerLogin)
      const workerKeys = [row?.workerLogin, row?.workerName].map((value) => normalizeSearchText(value))
      if (!workerKeys.includes(expectedWorker)) {
        return false
      }
    } else if (!eventRowTextIncludes(row, filters.worker, ['workerLogin', 'workerName'])) {
      return false
    }
    if (!eventRowTextIncludes(row, filters.strefa, ['strefa', 'zoneName', 'zoneId', 'roomId', 'utilityRoomId', 'qrCode'])) {
      return false
    }
    if (!eventRowTextIncludes(row, filters.pomieszczenie, ['klient', 'clientName', 'clientId', 'lokalizacja'])) {
      return false
    }
    if (!eventRowTextIncludes(row, filters.roomId, ['roomId', 'zoneId', 'utilityRoomId', 'workdayUtilityRoomId', 'qrCode'])) {
      return false
    }
    if (filters.status) {
      const expectedStatus = normalizeEventStatus(filters.status)
      const rowStatus = normalizeEventStatus(row?.status, Boolean(row?.endAt))
      if (rowStatus !== expectedStatus) {
        return false
      }
    }

    return eventRowTextIncludes(row, filters.q, [
      'workerLogin',
      'workerName',
      'klient',
      'clientName',
      'strefa',
      'zoneName',
      'lokalizacja',
      'comment',
      'editedBy',
      'date',
      'start',
      'stop',
      'duration',
      'eventId',
      'workdayId',
      'roomId',
      'zoneId',
    ])
  }

  function eventEnsureSavedRowVisible(savedEvent, payload) {
    const { visibility } = eventRegisterPendingSavedRow(savedEvent, payload)
    if (visibility === 'none' || visibility === 'hidden') {
      return visibility
    }

    const currentRows = Array.isArray(appState.eventRows) ? appState.eventRows : []
    const merged = eventMergePendingRowsForCurrentView(currentRows)
    const pageSizeRaw = Number(appState.eventsPageSize)
    const pageSize = normalizeEventsPageSize(pageSizeRaw)
    const totalRaw = Number(appState.eventsTotal)
    appState.eventsPage = 1
    appState.eventsPageSize = pageSize
    appState.eventsTotal = (Number.isFinite(totalRaw) && totalRaw >= 0 ? totalRaw : currentRows.length) + merged.pendingCount
    appState.eventsTotalPages = Math.max(1, Math.ceil(appState.eventsTotal / pageSize))
    renderEventsRows(merged.rows)
    updateEventsPager(merged.rows.length)
    setSubwelcomeMetric('#view-events .subwelcome', appState.eventsTotal)
    return merged.pendingCount > 0 ? 'inserted' : 'visible'
  }

  function eventApplyUpdatedRow(savedEvent, payload, originalRow) {
    const savedRow = eventBuildSavedViewRow(
      { ...(originalRow || {}), ...(savedEvent || {}) },
      { ...(originalRow || {}), ...(payload || {}) },
    )
    if (!savedRow) {
      return 'none'
    }

    const currentRows = Array.isArray(appState.eventRows) ? appState.eventRows : []
    const matchesFilters = eventSavedRowMatchesCurrentFilters(savedRow)
    let replaced = false
    const nextRows = []

    currentRows.forEach((row) => {
      const isEditedRow =
        eventRowsRepresentSameSavedEvent(row, originalRow || {}) ||
        eventRowsRepresentSameSavedEvent(row, savedRow)
      if (!isEditedRow) {
        nextRows.push(row)
        return
      }

      if (!replaced && matchesFilters) {
        nextRows.push({
          ...row,
          ...savedRow,
          __pendingSavedEvent: true,
        })
      }
      replaced = true
    })

    if (!replaced && matchesFilters) {
      nextRows.unshift({ ...savedRow, __pendingSavedEvent: true })
    }

    if (replaced && !matchesFilters) {
      appState.eventsTotal = Math.max(0, Number(appState.eventsTotal || currentRows.length) - 1)
      appState.eventsTotalPages = Math.max(
        1,
        Math.ceil(appState.eventsTotal / normalizeEventsPageSize(appState.eventsPageSize)),
      )
    }

    renderEventsRows(nextRows)
    updateEventsPager(nextRows.length)
    setSubwelcomeMetric('#view-events .subwelcome', appState.eventsTotal)
    return matchesFilters ? 'visible' : 'hidden'
  }

  function eventQrFunctionToken(value) {
    const raw = String(value ?? '').trim()
    if (!raw) return ''
    let normalized = raw
    try {
      normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    } catch {
      normalized = raw
    }
    return normalized.toUpperCase().replace(/[^A-Z0-9]/g, '')
  }

  function eventRowIsSpecialZone(row) {
    if (row?.isSpecialZone === true) {
      return true
    }

    const functionToken = eventQrFunctionToken(
      row?.zoneFunction ?? row?.functionName ?? row?.function ?? row?.zone?.functionName ?? row?.zone?.function,
    )
    if (functionToken.includes('STREFASPECJALNA') || functionToken.includes('KODSPECJALNY')) {
      return true
    }

    const labelHaystack = [row?.strefa, row?.zoneName, row?.roomId, row?.clientStatus]
      .map((value) => String(value ?? '').toLowerCase())
      .join(' ')
    return labelHaystack.includes('specjal') || labelHaystack.includes('special')
  }

  async function deleteEventByCandidateIds(orgId, row) {
    const candidateIds = eventDeletionCandidateIds(row)
    if (!candidateIds.length) {
      throw new Error('Brak identyfikatora zdarzenia do usuniecia.')
    }

    const errors = []
    try {
      const result = await forceDeletePortalEvents(orgId, [row], candidateIds)
      if (result?.deletedAny) {
        return candidateIds
      }
    } catch (error) {
      const status = Number(error?.status)
      if (status === 401 || status === 403) {
        throw error
      }
      errors.push(error)
    }

    let deletedAny = false
    for (const id of candidateIds) {
      try {
        await deleteEvent(orgId, id, { deleteLinkedWorkday: eventShouldDeleteLinkedWorkday(row, id) })
        deletedAny = true
      } catch (error) {
        errors.push(error)
      }
    }

    if (!deletedAny) {
      const firstError = errors[0]
      throw firstError instanceof Error ? firstError : new Error('Blad usuwania zdarzenia.')
    }

    return candidateIds
  }

  function eventTypeInfo(row) {
    const endReason = String(row?.endReason ?? '').trim().toUpperCase()
    const clientIndId = String(row?.clientIndId ?? '').trim()
    const status = normalizeEventStatus(row?.status, Boolean(row?.endAt))
    const startIso = toIso(row?.startAt)
    const endIso = toIso(row?.endAt)
    const durationSec = Number(row?.durationSec ?? 0)
    const sourceKind = String(row?.historySourceKind ?? '').trim().toLowerCase()
    const eventId = String(row?.eventId ?? row?.id ?? '').trim()
    const workdayId = String(row?.workdayId ?? row?.linkedWorkdayId ?? '').trim()
    const hasExplicitEventId =
      row?.hasExplicitEventId === true ||
      (sourceKind === 'event' && eventId && (!workdayId || eventId !== workdayId))
    const hasClientOrZoneContext = [
      row?.zoneId,
      row?.roomId,
      row?.utilityRoomId,
      row?.clientId,
      row?.klient,
      row?.clientName,
      row?.zoneName,
      row?.strefa,
    ]
      .map((value) => String(value ?? '').trim())
      .some((value) => value && value !== '-')
    const stopOnlyByTiming =
      Boolean(startIso && endIso) &&
      Number.isFinite(new Date(endIso).getTime() - new Date(startIso).getTime()) &&
      Math.abs(new Date(endIso).getTime() - new Date(startIso).getTime()) <= 1000 &&
      (!Number.isFinite(durationSec) || durationSec <= 0)
    const isSpecial = eventRowIsSpecialZone(row)

    if (clientIndId || endReason === 'INDIVIDUAL_DONE') {
      return { label: 'Zlecenie jed.', className: 'event-type-badge--individual' }
    }
    if (endReason === 'WORKDAY_STOP' || endReason === 'STOP_END_DAY' || stopOnlyByTiming) {
      return { label: 'QR STOP', className: 'event-type-badge--stop' }
    }
    if (endReason === 'QR_START_STOP') {
      return { label: 'QR START + STOP', className: 'event-type-badge--clean' }
    }
    if (isSpecial) {
      return { label: 'Strefa spec.', className: 'event-type-badge--special' }
    }
    if (status === 'RUNNING' && !row?.endAt) {
      if (hasExplicitEventId && hasClientOrZoneContext) {
        return { label: 'CLEAN', className: 'event-type-badge--clean' }
      }
      return { label: 'QR START', className: 'event-type-badge--start' }
    }
    if (endReason === 'QR_NEW' || endReason === 'QR_SAME' || row?.endAt) {
      return { label: 'CLEAN', className: 'event-type-badge--clean' }
    }
    return { label: 'Inne QR', className: 'event-type-badge--other' }
  }

  function eventRowGpsCoords(row = {}) {
    const type = eventTypeInfo(row).label
    if (type !== 'QR START' && type !== 'QR STOP' && type !== 'QR START + STOP' && type !== 'Strefa spec.') {
      return null
    }
    const primaryPhase = type === 'QR STOP' ? 'stop' : 'start'
    const secondaryPhase = primaryPhase === 'start' ? 'stop' : 'start'
    const sources = [
      reportHistoryResolveDayGpsCoords(row, primaryPhase),
      row?.gps,
      row?.dayGps,
      row?.startGps,
      row?.stopGps,
      row?.startGPS,
      row?.stopGPS,
      row?.gpsStart,
      row?.gpsStop,
      row?.startLocationGps,
      row?.stopLocationGps,
      row?.dayComment,
      row?.comment,
      row?.lat && row?.lon ? `${row.lat}, ${row.lon}` : '',
      row?.latitude && row?.longitude ? `${row.latitude}, ${row.longitude}` : '',
    ]
    const phases = [primaryPhase, secondaryPhase]

    for (const phase of phases) {
      for (const source of sources) {
        const extracted = reportHistoryExtractGpsCoords(source, phase)
        const parsed = reportHistoryParseGeoPair(extracted)
        if (parsed) {
          return parsed
        }
      }
    }

    for (const source of sources) {
      const parsed = reportHistoryParseGeoPair(source)
      if (parsed) {
        return parsed
      }
    }

    return null
  }

  function syncEventsSelectionUi() {
    const selectAll = document.getElementById('evSelectAll')
    const deleteButton = document.getElementById('evDeleteSelectedBtn')
    const selectionEnabled = canDeleteEvents()
    const rowKeys = appState.eventRows
      .map((row, index) => (eventCanDelete(row) ? eventSelectionKey(row, index) : ''))
      .filter(Boolean)
    const validRowKeys = new Set(rowKeys)
    appState.eventsSelectedKeys = new Set([...appState.eventsSelectedKeys].filter((key) => validRowKeys.has(key)))
    const selectedCount = rowKeys.filter((key) => appState.eventsSelectedKeys.has(key)).length

    if (selectAll instanceof HTMLInputElement) {
      selectAll.disabled = !selectionEnabled || rowKeys.length === 0
      selectAll.indeterminate = selectionEnabled && selectedCount > 0 && selectedCount < rowKeys.length
      selectAll.checked = selectionEnabled && rowKeys.length > 0 && selectedCount === rowKeys.length
    }

    if (deleteButton instanceof HTMLButtonElement) {
      deleteButton.style.display = selectionEnabled ? '' : 'none'
      deleteButton.disabled = !selectionEnabled || selectedCount <= 0
    }
  }

  function eventWorkerInitials(value = '') {
    const parts = String(value ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
    if (!parts.length) return '?'
    return (parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0]}${parts[parts.length - 1][0]}`).toUpperCase()
  }

  function eventDateWeekdayLabel(row = {}) {
    const dayKey = String(row?.dayKey ?? '').trim()
    const source = dayKey ? `${dayKey}T12:00:00` : row?.startAt || row?.endAt || ''
    const date = new Date(source)
    if (!Number.isFinite(date.getTime())) return ''
    const label = date.toLocaleDateString('pl-PL', { weekday: 'long' })
    return label ? `${label.charAt(0).toUpperCase()}${label.slice(1)}` : ''
  }

  function eventEditedAtLabel(value = '') {
    const date = new Date(value)
    if (!Number.isFinite(date.getTime())) return ''
    const dateLabel = date.toLocaleDateString('pl-PL')
    const timeLabel = date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
    return `${dateLabel}, ${timeLabel}`
  }

  function eventRowVisualState(row = {}, normalizedStatus = 'RUNNING', editedBy = '') {
    const startTs = new Date(row?.startAt ?? '').getTime()
    const endTs = new Date(row?.endAt ?? '').getTime()
    const rawStatus = String(row?.status ?? '').trim().toUpperCase()
    const requiresReview =
      row?.requiresReview === true ||
      row?.needsReview === true ||
      row?.hasError === true ||
      row?.isInvalid === true ||
      ['ERROR', 'INVALID', 'REVIEW', 'ALERT'].some((token) => rawStatus.includes(token)) ||
      (Number.isFinite(startTs) && Number.isFinite(endTs) && endTs < startTs)

    if (requiresReview) {
      return { className: 'events-row--review', label: 'Wymaga sprawdzenia' }
    }
    if (normalizedStatus === 'CLOSED') {
      return { className: 'events-row--completed', label: 'Zdarzenie zakończone' }
    }
    if (normalizedStatus === 'RUNNING' || normalizedStatus === 'OPEN') {
      return { className: 'events-row--running', label: 'Zdarzenie aktywne' }
    }
    if (String(editedBy ?? '').trim() && String(editedBy ?? '').trim() !== '-') {
      return { className: 'events-row--corrected', label: 'Ręczna korekta' }
    }
    return { className: 'events-row--running', label: 'Zdarzenie aktywne' }
  }

  function renderEventsRows(rows) {
    const root = document.getElementById('evRows')
    if (!root) {
      return
    }

    const normalizeLookup = (value) => String(value ?? '').trim().toLowerCase()
    const normalizePersonValue = (value) => {
      const raw = String(value ?? '').trim()
      if (!raw) {
        return ''
      }
      try {
        return raw
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim()
      } catch {
        return raw.toLowerCase().replace(/\s+/g, ' ').trim()
      }
    }
    const toLoginLocalPart = (value) => {
      const text = String(value ?? '').trim()
      const atIndex = text.indexOf('@')
      return atIndex > 0 ? text.slice(0, atIndex).trim() : ''
    }
    const workerDisplayName = (worker) =>
      String(
        worker?.workerName ??
          worker?.workername ??
          worker?.worker_name ??
          worker?.name ??
          worker?.displayName ??
          worker?.fullName ??
          '',
      ).trim()
    const workerLookupMap = new Map()
    const workerNameMap = new Map()
    const workerSurnameMap = new Map()
    const ambiguousWorkerNames = new Set()
    const ambiguousWorkerSurnames = new Set()
    ;(Array.isArray(appState.workers) ? appState.workers : []).forEach((worker) => {
      const workerKeys = [
        worker?.login,
        worker?.workerLogin,
        worker?.id,
        worker?.workerId,
        worker?.email,
        worker?.loginEmail,
      ]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
      workerKeys.forEach((key) => {
        const normalizedKey = normalizeLookup(key)
        const localKey = normalizeLookup(toLoginLocalPart(key))
        if (normalizedKey && !workerLookupMap.has(normalizedKey)) {
          workerLookupMap.set(normalizedKey, worker)
        }
        if (localKey && !workerLookupMap.has(localKey)) {
          workerLookupMap.set(localKey, worker)
        }
      })

      const normalizedName = normalizePersonValue(workerDisplayName(worker))
      if (!normalizedName) {
        return
      }
      if (workerNameMap.has(normalizedName)) {
        ambiguousWorkerNames.add(normalizedName)
      } else {
        workerNameMap.set(normalizedName, worker)
      }

      const surname = normalizedName.split(' ').filter(Boolean).pop()
      if (!surname) {
        return
      }
      if (workerSurnameMap.has(surname)) {
        ambiguousWorkerSurnames.add(surname)
      } else {
        workerSurnameMap.set(surname, worker)
      }
    })
    const findWorkerByLogin = (loginText) => {
      const variants = [normalizeLookup(loginText), normalizeLookup(toLoginLocalPart(loginText))].filter(Boolean)
      if (!variants.length) {
        return null
      }

      return variants.map((variant) => workerLookupMap.get(variant)).find(Boolean) ?? null
    }
    const findWorkerByName = (nameText) => {
      const normalized = normalizePersonValue(nameText)
      if (!normalized) {
        return null
      }

      const parts = normalized.split(' ').filter(Boolean)
      if (!parts.length) {
        return null
      }

      const exactMatch = ambiguousWorkerNames.has(normalized) ? null : workerNameMap.get(normalized) ?? null
      if (exactMatch) {
        return exactMatch
      }

      const surname = parts[parts.length - 1]
      return ambiguousWorkerSurnames.has(surname) ? null : workerSurnameMap.get(surname) ?? null
    }
    const resolveWorkerNameFromWorkers = (workerLoginCandidate, workerNameCandidate) => {
      const loginText = String(workerLoginCandidate ?? '').trim()
      const directName = String(workerNameCandidate ?? '').trim()

      const workerByLogin = loginText ? findWorkerByLogin(loginText) : null
      if (workerByLogin) {
        const resolved = workerDisplayName(workerByLogin)
        if (resolved) {
          return resolved
        }
      }

      const workerByName = directName ? findWorkerByName(directName) : null
      if (workerByName) {
        const resolved = workerDisplayName(workerByName)
        if (resolved) {
          return resolved
        }
      }
      return directName || loginText || ''
    }

    const isErrorLikeCell = (value) => {
      const text = String(value ?? '').trim().toLowerCase()
      if (!text) {
        return false
      }

      return (
        (text.includes('"error"') && text.includes('"code"')) ||
        (text.includes('operation "') && text.includes('not found')) ||
        text.includes('"status":"not_found"') ||
        text.includes('"code":404')
      )
    }

    const safeRows = (rows || []).filter((row) => {
      const candidates = [
        row?.workerLogin,
        row?.workerName,
        row?.klient,
        row?.clientName,
        row?.strefa,
        row?.zoneName,
        row?.lokalizacja,
        row?.roomId,
        row?.zoneId,
      ]
      return !candidates.some((value) => isErrorLikeCell(value))
    })

    appState.eventRows = safeRows

    const visibleKeys = new Set(safeRows.map((row, index) => eventSelectionKey(row, index)).filter(Boolean))
    appState.eventsSelectedKeys = new Set([...appState.eventsSelectedKeys].filter((key) => visibleKeys.has(key)))

    if (!safeRows.length) {
      root.innerHTML = `
        <div class="events-row events-row--empty">
          <div class="events-empty-state">
            <span aria-hidden="true"><i class="ph ph-magnifying-glass"></i></span>
            <strong>Brak zdarzeń dla tych filtrów</strong>
            <small>Zmień kryteria wyszukiwania lub wyczyść filtry.</small>
          </div>
        </div>
      `
      syncEventsSelectionUi()
      return
    }

    const openIntegrityByRecordId = eventOpenIntegrityGroupByRecordId()
    root.innerHTML = safeRows
      .map((row, index) => {
        const rowKey = eventSelectionKey(row, index)
        const openIntegrityGroup = openIntegrityByRecordId.get(openEventRecordKey(row)) ?? null
        const isSelected = appState.eventsSelectedKeys.has(rowKey)
        const canSelect = canDeleteEvents() && eventCanDelete(row)
        const selectTitle = eventCanDelete(row) ? 'Zaznacz zdarzenie' : 'Rekord dnia pracy bez osobnego zdarzenia'
        const comment = normalizeVisibleEventComment(row.comment)
        const commentCell = comment
          ? `<button class="event-comment-btn" type="button" data-event-comment="${index}" title="${escapeHtml(comment)}" aria-label="Pokaż komentarz">
              <i class="ph ph-chat-circle-text" aria-hidden="true"></i>
              <span>${escapeHtml(comment)}</span>
            </button>`
          : '<span class="event-empty">—</span>'
        const workerLogin = String(row.workerLogin ?? '').trim()
        const workerName = resolveWorkerNameFromWorkers(workerLogin, row.workerName)
        const workerPrimary = workerName || workerLogin || '-'
        const workerIdentifier = String(row?.workerId ?? workerLogin).trim()
        const integrityKind = String(openIntegrityGroup?.integrityKind ?? '').trim()
        const integrityBadgeLabel =
          integrityKind === 'legacy'
            ? `${Number(openIntegrityGroup?.count ?? 0)} historyczne`
            : integrityKind === 'orphan'
              ? `${Number(openIntegrityGroup?.count ?? 0)} CLEAN bez dnia`
              : integrityKind === 'unresolved'
                ? `${Number(openIntegrityGroup?.count ?? 0)} nierozstrzygnięte`
                : `${Number(openIntegrityGroup?.count ?? 0)} otwarte CLEAN`
        const workerCard = `
          <div class="events-worker-cell">
            <span class="events-worker-avatar" aria-hidden="true">${escapeHtml(eventWorkerInitials(workerPrimary))}</span>
            <span class="events-worker-copy">
              <strong class="events-worker-name">${escapeHtml(workerPrimary)}</strong>
              ${workerIdentifier ? `<small>ID: ${escapeHtml(workerIdentifier)}</small>` : ''}
              ${openIntegrityGroup ? `<span class="events-open-conflict-badge events-open-conflict-badge--${escapeHtml(integrityKind)}">${escapeHtml(integrityBadgeLabel)}</span>` : ''}
            </span>
          </div>
        `
        const workerCell =
          workerPrimary === '-'
            ? workerCard
            : `<button class="events-cell-link event-worker-link" type="button" data-event-history-worker="${index}" title="Pokaż historię osoby">${workerCard}</button>`

        const clientQrCandidate = eventActualQrCodeFromRow(row) || zoneQrCodeFromRow(row)
        const clientLabel = resolveClientLabelWithQrFallback(String(row?.clientName ?? row?.klient ?? '-').trim() || '-', clientQrCandidate)
        const clientIdLabel = String(row?.clientId ?? '').trim()
        const zoneLabel = eventResolveZoneLabel(row)
        const qrLabel = String(clientQrCandidate ?? '').trim()
        const clientCell =
          clientLabel === '-'
            ? '<span class="event-entity-empty">—</span>'
            : `<button class="event-entity-cell event-client-cell" type="button" data-event-history-client="${index}" title="Pokaż historię klienta">
                <span class="event-entity-icon" aria-hidden="true"><i class="ph ph-buildings"></i></span>
                <span class="event-entity-copy">
                  <strong>${escapeHtml(clientLabel)}</strong>
                  ${clientIdLabel ? `<small>ID: ${escapeHtml(clientIdLabel)}</small>` : ''}
                </span>
              </button>`
        const zoneCell =
          zoneLabel === '-'
            ? '<span class="event-entity-empty">—</span>'
            : `<button class="event-entity-cell event-zone-cell" type="button" data-event-history-zone="${index}" title="Pokaż historię strefy">
                <span class="event-entity-icon" aria-hidden="true"><i class="ph ph-stack"></i></span>
                <span class="event-entity-copy">
                  <strong>${escapeHtml(zoneLabel)}</strong>
                  <small>QR: ${escapeHtml(qrLabel || '-')}</small>
                </span>
              </button>`
        const startLabel = dashboardClockLabelToHm(row.start, '-')
        const stopLabel = dashboardClockLabelToHm(row.stop, '-')
        const durationLabel = dashboardDurationLabelToHm(row.duration, '00:00')
        const locationLabel = String(row.lokalizacja || '-').trim() || '-'
        const editedByLabel = String(row.editedBy || '-').trim() || '-'
        const editedAtLabel = eventEditedAtLabel(row?.updatedAt)
        const weekdayLabel = eventDateWeekdayLabel(row)
        const timePill = (label, type) =>
          `<span class="event-time-pill event-time-pill--${type}${label === '-' ? ' is-empty' : ''}">
            <i class="ph ${type === 'start' ? 'ph-play-circle' : type === 'stop' ? 'ph-stop-circle' : 'ph-clock'}" aria-hidden="true"></i>
            <span>${escapeHtml(label === '-' ? '—' : label)}</span>
          </span>`
        const gpsCoords = eventRowGpsCoords(row)
        const gpsCell = gpsCoords
          ? `<button class="event-gps-icon-btn" type="button" data-event-gps="${index}" data-rep-geo-lat="${escapeHtml(gpsCoords.lat)}" data-rep-geo-lon="${escapeHtml(gpsCoords.lon)}" title="Pokaz GPS" aria-label="Pokaz GPS">
              <i class="ph ph-map-pin" aria-hidden="true"></i>
            </button>`
          : '<span class="event-empty">—</span>'
        const eventStatus = normalizeEventStatus(row.status, Boolean(row.endAt))
        const rowVisualState = eventRowVisualState(row, eventStatus, editedByLabel)

        return `
          <div class="events-row ${rowVisualState.className}${integrityKind === 'conflict' || integrityKind === 'orphan' || integrityKind === 'unresolved' ? ' events-row--open-conflict' : ''}${integrityKind === 'legacy' ? ' events-row--legacy-open' : ''}${isSelected ? ' is-selected' : ''}">
            <div class="events-select-col">
              <input type="checkbox" data-event-select-index="${index}" aria-label="${escapeHtml(selectTitle)}" title="${escapeHtml(selectTitle)}" ${isSelected ? 'checked' : ''} ${canSelect ? '' : 'disabled'} />
              <span class="events-visually-hidden">${escapeHtml(rowVisualState.label)}</span>
            </div>
            <div>${workerCell}</div>
            <div>${clientCell}</div>
            <div>${zoneCell}</div>
            <div>
              <span class="event-location-cell${locationLabel === '-' ? ' is-empty' : ''}">
                <i class="ph ph-map-pin" aria-hidden="true"></i>
                <span>${escapeHtml(locationLabel === '-' ? '—' : locationLabel)}</span>
              </span>
            </div>
            <div>
              <span class="event-date-cell">
                <i class="ph ph-calendar-blank" aria-hidden="true"></i>
                <span>
                  <strong>${escapeHtml(row.date || '—')}</strong>
                  ${weekdayLabel ? `<small>${escapeHtml(weekdayLabel)}</small>` : ''}
                </span>
              </span>
            </div>
            <div class="mono time-start">${timePill(startLabel, 'start')}</div>
            <div class="mono time-stop">${timePill(stopLabel, 'stop')}</div>
            <div class="mono time-duration">${timePill(durationLabel, 'duration')}</div>
            <div class="event-gps-cell">${gpsCell}</div>
            <div class="event-comment-cell">${commentCell}</div>
            <div>
              <span class="event-edited-cell${editedByLabel === '-' ? ' is-empty' : ''}">
                <strong>${escapeHtml(editedByLabel === '-' ? '—' : editedByLabel)}</strong>
                ${editedAtLabel && editedByLabel !== '-' ? `<small>${escapeHtml(editedAtLabel)}</small>` : ''}
              </span>
            </div>
            <div>
              <button class="event-edit-icon-btn" type="button" data-event-edit="${index}" aria-label="Otwórz akcje zdarzenia" title="Otwórz akcje zdarzenia">
                <i class="ph ph-dots-three-vertical" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        `
      })
      .join('')

    syncEventsSelectionUi()
  }


  function normalizeEventStatus(value, hasEndAt = false) {
    const normalized = String(value ?? '').trim().toUpperCase()
    if (normalized === 'CLOSED') {
      return 'CLOSED'
    }

    if (normalized === 'OPEN' || normalized === 'RUNNING') {
      return 'RUNNING'
    }

    return hasEndAt ? 'CLOSED' : 'RUNNING'
  }

  function syncEventModalLogo() {
    const modalLogo = document.getElementById('evLogo')
    if (!modalLogo) {
      return
    }

    const cleanziLogo = document.querySelector('.sidebar-brand-logo img, .sidebar .logo-block--cleanzi img')
    const src = cleanziLogo?.getAttribute('src') || '/cleanzi-logo.svg'
    modalLogo.setAttribute('src', src)
  }

  function setEventEditorButtonLabel(button, label) {
    if (!(button instanceof HTMLButtonElement)) return
    const labelNode = button.querySelector('[data-event-button-label]')
    if (labelNode) {
      labelNode.textContent = label
      return
    }
    button.textContent = label
  }

  function eventEditorClockLabel(value = '') {
    return String(value ?? '').match(/T(\d{2}:\d{2})/)?.[1] ?? '--:--'
  }

  function eventEditorDurationLabel(startAt, endAt) {
    const startTs = new Date(startAt ?? '').getTime()
    const endTs = new Date(endAt ?? '').getTime()
    if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || endTs < startTs) return '--:--'
    const totalMinutes = Math.floor((endTs - startTs) / 60000)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }

  function eventEditorSyncTimeSummary() {
    const startInput = document.getElementById('evEditStart')
    const stopInput = document.getElementById('evEditStop')
    const summary = document.getElementById('evEditorTimeSummary')
    const label = document.getElementById('evEditorTimeSummaryLabel')
    const text = document.getElementById('evEditorTimeSummaryText')
    const duration = document.getElementById('evEditorDuration')
    const icon = summary?.querySelector('.ev-editor-summary-icon i')
    if (!(startInput instanceof HTMLInputElement) || !(stopInput instanceof HTMLInputElement) || !summary) return

    const startValue = String(startInput.value ?? '').trim()
    const stopValue = eventEditorReadStopValue(stopInput)
    const startAt = localDateTimeInputToIso(startValue)
    const endAt = localDateTimeInputToIso(stopValue)
    const eventKind = resolveEventKindFromTimes(startAt, endAt)
    let state = eventKind === 'start_stop' ? 'complete' : eventKind
    let labelText = 'Status zdarzenia'
    let description = 'Uzupełnij START, STOP lub oba pola.'
    let durationText = '--:--'
    let iconClass = 'ph ph-clock'

    if (eventKind === 'start') {
      labelText = 'Zdarzenie START'
      description = 'Praca pozostanie otwarta do czasu dodania STOP.'
      durationText = eventEditorClockLabel(startValue)
      iconClass = 'ph ph-play'
    } else if (eventKind === 'stop') {
      labelText = 'Zdarzenie STOP'
      description = 'Zapis zostanie dodany jako sam koniec pracy.'
      durationText = eventEditorClockLabel(stopValue)
      iconClass = 'ph ph-stop'
    } else if (eventKind === 'start_stop') {
      const startTs = new Date(startAt).getTime()
      const endTs = new Date(endAt).getTime()
      if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || endTs < startTs) {
        state = 'invalid'
        labelText = 'Sprawdź godziny'
        description = 'STOP musi być późniejszy niż START.'
        durationText = 'Błąd'
        iconClass = 'ph ph-warning-circle'
      } else {
        labelText = 'Łączny czas pracy'
        description = `${eventEditorClockLabel(startValue)} → ${eventEditorClockLabel(stopValue)}`
        durationText = eventEditorDurationLabel(startAt, endAt)
        iconClass = 'ph ph-timer'
      }
    }

    summary.dataset.state = state === 'none' ? 'empty' : state
    if (label) label.textContent = labelText
    if (text) text.textContent = description
    if (duration) duration.textContent = durationText
    if (icon) icon.className = iconClass
  }

  function eventEditorGetPickerConfig(kind) {
    const normalizedKind = String(kind ?? '').trim().toLowerCase()
    if (normalizedKind === 'worker' || normalizedKind === 'workers') {
      return {
        inputId: 'evEditWorkerSearch',
        selectId: 'evEditWorker',
        placeholderLabel: '(wybierz pracownika)',
        options: appState.eventEditorWorkerOptions,
      }
    }

    if (normalizedKind === 'zone' || normalizedKind === 'zones') {
      return {
        inputId: 'evEditStrefaSearch',
        selectId: 'evEditStrefa',
        placeholderLabel: '(wybierz strefe)',
        options: appState.eventEditorZoneOptions,
      }
    }

    if (normalizedKind === 'location' || normalizedKind === 'locations') {
      return {
        inputId: 'evEditLocationSearch',
        selectId: 'evEditLocation',
        placeholderLabel: '(wybierz lokalizacje)',
        options: appState.eventEditorLocationOptions,
      }
    }

    return {
      inputId: 'evEditPomSearch',
      selectId: 'evEditPom',
      placeholderLabel: '(wybierz klienta)',
      options: appState.eventEditorClientOptions,
    }
  }

  function eventEditorSetPickerExpanded(config, expanded, optionCount = 0) {
    const select = document.getElementById(config.selectId)
    const input = document.getElementById(config.inputId)
    if (!select) {
      return
    }

    const picker = select.closest('.ev-editor-picker')
    picker?.classList.toggle('is-expanded', Boolean(expanded))
    input?.setAttribute('aria-expanded', expanded ? 'true' : 'false')
    select.setAttribute('aria-expanded', expanded ? 'true' : 'false')

    if (!expanded) {
      select.size = 1
      select.classList.remove('is-expanded')
      return
    }

    const rows = Math.min(Math.max(Number(optionCount || 0) + 1, 2), 8)
    select.size = rows
    select.classList.add('is-expanded')
  }

  function eventEditorCollapsePicker(kind) {
    eventEditorSetPickerExpanded(eventEditorGetPickerConfig(kind), false, 0)
  }

  function eventEditorCancelScheduledPickerFilter() {
    if (!eventEditorPickerFilterFrame || typeof window === 'undefined') {
      return
    }

    window.cancelAnimationFrame?.(eventEditorPickerFilterFrame)
    eventEditorPickerFilterFrame = 0
  }

  function eventEditorCollapseOtherPickers(activeKind = '') {
    const normalizedActiveKind = String(activeKind ?? '').trim().toLowerCase()
    eventEditorCancelScheduledPickerFilter()
    ;['worker', 'client', 'location', 'zone'].forEach((kind) => {
      if (kind !== normalizedActiveKind) {
        eventEditorCollapsePicker(kind)
      }
    })
  }

  function eventEditorMaybeCollapsePicker(kind) {
    const config = eventEditorGetPickerConfig(kind)
    const activeId = String(document.activeElement?.id ?? '').trim()
    if (activeId === config.inputId || activeId === config.selectId) {
      return
    }

    eventEditorSetPickerExpanded(config, false, 0)
  }

  function eventEditorSyncSearchInput(kind) {
    const config = eventEditorGetPickerConfig(kind)
    const select = document.getElementById(config.selectId)
    const input = document.getElementById(config.inputId)
    if (!select || !input) {
      return
    }

    const selectedOption = select.selectedOptions?.[0]
    input.value = select.value ? String(selectedOption?.textContent ?? '').trim() : ''
  }

  function eventEditorOptionSearchText(option) {
    const cached = String(option?.searchText ?? '').trim()
    if (cached) {
      return cached
    }

    return normalizeSearchText(`${option?.label ?? ''} ${option?.value ?? ''}`)
  }

  function eventEditorPickerFilteredOptions(options, query, currentValue, { expandOnEmpty = false } = {}) {
    const sourceOptions = Array.isArray(options) ? options : []
    const queryKey = normalizeSearchText(query)
    const normalizedCurrent = String(currentValue ?? '').trim()
    const maxOptions = queryKey ? EVENT_EDITOR_PICKER_MAX_OPTIONS : EVENT_EDITOR_PICKER_EMPTY_MAX_OPTIONS
    const selectedOption = normalizedCurrent
      ? sourceOptions.find((option) => String(option?.value ?? '').trim() === normalizedCurrent) ?? null
      : null

    if (!queryKey) {
      const baseOptions = expandOnEmpty ? sourceOptions.slice(0, maxOptions) : []
      if (selectedOption && !baseOptions.some((option) => String(option?.value ?? '').trim() === normalizedCurrent)) {
        return [selectedOption, ...baseOptions].slice(0, maxOptions)
      }
      return baseOptions
    }

    const matches = []
    for (const option of sourceOptions) {
      if (matches.length >= maxOptions) {
        break
      }
      if (eventEditorOptionSearchText(option).includes(queryKey)) {
        matches.push(option)
      }
    }

    return matches
  }

  function eventEditorApplyPickerFilter(kind, { expandOnEmpty = false, open = false } = {}) {
    const config = eventEditorGetPickerConfig(kind)
    const select = document.getElementById(config.selectId)
    if (!select) {
      return
    }

    const currentValue = String(select.value ?? '').trim()
    const query = String(document.getElementById(config.inputId)?.value ?? '').trim()
    const filteredOptions = eventEditorPickerFilteredOptions(config.options, query, currentValue, { expandOnEmpty })
    const placeholderLabel = query && !filteredOptions.length ? '(brak dopasowan)' : config.placeholderLabel
    const nextOptionsKey = `${query}|${currentValue}|${filteredOptions.map((option) => option.value).join('|')}`

    if (select.dataset.eventPickerOptionsKey !== nextOptionsKey) {
      setSelectOptions(select, filteredOptions, placeholderLabel)
      select.dataset.eventPickerOptionsKey = nextOptionsKey
    }
    const placeholderOption = select.options[0]
    if (placeholderOption) {
      const hasMatches = filteredOptions.length > 0
      placeholderOption.hidden = hasMatches
      placeholderOption.disabled = hasMatches
    }

    eventEditorSetPickerExpanded(config, Boolean(open) && (Boolean(query) || expandOnEmpty), filteredOptions.length)
    if (currentValue && filteredOptions.some((option) => option.value === currentValue)) {
      select.value = currentValue
    }
  }

  function eventEditorSchedulePickerFilter(kind, options = {}) {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      eventEditorApplyPickerFilter(kind, options)
      return
    }

    eventEditorCancelScheduledPickerFilter()
    eventEditorPickerFilterFrame = window.requestAnimationFrame(() => {
      eventEditorPickerFilterFrame = 0
      eventEditorApplyPickerFilter(kind, options)
    })
  }

  function eventEditorApplyAllPickerFilters() {
    eventEditorApplyPickerFilter('worker')
    eventEditorApplyPickerFilter('client')
    eventEditorApplyPickerFilter('location')
    eventEditorApplyPickerFilter('zone')
  }

  function eventEditorSetPickersLoading(isLoading) {
    ;[
      { inputId: 'evEditWorkerSearch', selectId: 'evEditWorker', label: 'Ladowanie pracownikow...' },
      { inputId: 'evEditPomSearch', selectId: 'evEditPom', label: 'Ladowanie klientow...' },
      { inputId: 'evEditLocationSearch', selectId: 'evEditLocation', label: 'Ladowanie lokalizacji...' },
      { inputId: 'evEditStrefaSearch', selectId: 'evEditStrefa', label: 'Ladowanie stref...' },
    ].forEach(({ inputId, selectId, label }) => {
      const input = document.getElementById(inputId)
      const select = document.getElementById(selectId)
      if (input instanceof HTMLInputElement) {
        input.disabled = Boolean(isLoading)
      }
      if (select instanceof HTMLSelectElement) {
        select.disabled = Boolean(isLoading)
        if (isLoading) {
          setSelectOptions(select, [], label)
          select.dataset.eventPickerOptionsKey = ''
          eventEditorSetPickerExpanded({ inputId, selectId }, false, 0)
        }
      }
    })
  }

  function eventEditorEnsureOption(options, value, fallbackLabel) {
    const normalizedValue = String(value ?? '').trim()
    if (!normalizedValue) {
      return [...options]
    }

    if (options.some((option) => String(option.value ?? '').trim() === normalizedValue)) {
      return [...options]
    }

    const label = fallbackLabel ? `${fallbackLabel} (spoza listy)` : `${normalizedValue} (spoza listy)`
    return [...options, { value: normalizedValue, label }]
  }

  function eventEditorResetSearchInputs() {
    ;['evEditWorkerSearch', 'evEditPomSearch', 'evEditLocationSearch', 'evEditStrefaSearch'].forEach((id) => {
      const input = document.getElementById(id)
      if (input) {
        input.value = ''
      }
    })
  }

  function eventEditorReadableZoneLocation(zone = {}) {
    const location = String(zone?.location ?? zone?.lokalizacja ?? '').trim()
    const locationKey = normalizeSearchText(location)
    return locationKey && locationKey !== '-' && locationKey !== 'nieprzypisany'
      ? location
      : ''
  }

  function eventEditorBuildOptionsCache() {
    const workerKey = (Array.isArray(appState.workers) ? appState.workers : [])
      .map((worker) => `${worker?.login ?? worker?.id ?? ''}:${worker?.name ?? worker?.workerName ?? ''}`)
      .join('|')
    const clientKey = (Array.isArray(appState.clients) ? appState.clients : [])
      .map((client) => `${client?.id ?? ''}:${client?.name ?? ''}`)
      .join('|')
    const zoneKey = (Array.isArray(appState.zones) ? appState.zones : [])
      .map(
        (zone) =>
          `${zone?.id ?? ''}:${zone?.clientId ?? ''}:${zone?.name ?? zone?.zone ?? ''}:${zone?.location ?? zone?.lokalizacja ?? ''}`,
      )
      .join('|')
    const cacheKey = `${workerKey}::${clientKey}::${zoneKey}`

    if (eventEditorOptionsCache && eventEditorOptionsCacheKey === cacheKey) {
      return eventEditorOptionsCache
    }

    const workerLabelByLogin = new Map()
    const workerOptions = (Array.isArray(appState.workers) ? appState.workers : [])
      .map((worker) => {
        const login = String(worker.login ?? worker.id ?? '').trim()
        if (!login) {
          return null
        }

        const label = worker.name || login
        workerLabelByLogin.set(login, label)
        return {
          value: login,
          label,
          searchText: normalizeSearchText(`${label} ${login}`),
        }
      })
      .filter(Boolean)

    const clientLabelById = new Map()
    const clientOptions = (Array.isArray(appState.clients) ? appState.clients : []).map((client) => {
      const value = String(client.id)
      const label = client.name || client.id
      clientLabelById.set(value, label)
      return { value, label, searchText: normalizeSearchText(`${label} ${value}`) }
    })
    clientOptions.sort((left, right) => left.label.localeCompare(right.label, 'pl', { sensitivity: 'base' }))

    const zoneLabelById = new Map()
    const zoneOptions = []
    const zoneOptionsByClient = new Map()
    const locationOptionsByKey = new Map()
    const locationOptionsByClientKey = new Map()
    ;(Array.isArray(appState.zones) ? appState.zones : [])
      .map((zone) => mapZoneForView(zone))
      .filter((zone) => !isUnassignedCleanZone(zone))
      .forEach((zone) => {
        const zoneId = String(zone.id ?? '').trim()
        if (!zoneId) {
          return
        }

        const location = eventEditorReadableZoneLocation(zone)
        const option = {
          value: zoneId,
          label: zone.name || zone.zone || zoneId,
          location,
          searchText: normalizeSearchText(`${zone.name || zone.zone || zoneId} ${zoneId} ${location}`),
        }
        const clientId = String(zone.clientId ?? '').trim()
        zoneLabelById.set(zoneId, option.label)
        zoneOptions.push(option)
        if (!zoneOptionsByClient.has(clientId)) {
          zoneOptionsByClient.set(clientId, [])
        }
        zoneOptionsByClient.get(clientId).push(option)

        const locationKey = normalizeSearchText(location)
        if (locationKey && !locationOptionsByKey.has(locationKey)) {
          locationOptionsByKey.set(locationKey, {
            value: location,
            label: location,
            searchText: locationKey,
          })
        }
        if (clientId && locationKey) {
          if (!locationOptionsByClientKey.has(clientId)) {
            locationOptionsByClientKey.set(clientId, new Map())
          }
          const clientLocations = locationOptionsByClientKey.get(clientId)
          if (!clientLocations.has(locationKey)) {
            clientLocations.set(locationKey, {
              value: location,
              label: location,
              searchText: locationKey,
            })
          }
        }
      })

    const sortOptions = (options) =>
      options.sort((left, right) =>
        left.label.localeCompare(right.label, 'pl', { numeric: true, sensitivity: 'base' }),
      )
    sortOptions(zoneOptions)
    zoneOptionsByClient.forEach(sortOptions)
    const locationOptions = sortOptions([...locationOptionsByKey.values()])
    const locationOptionsByClient = new Map(
      [...locationOptionsByClientKey.entries()].map(([clientId, optionsByKey]) => [
        clientId,
        sortOptions([...optionsByKey.values()]),
      ]),
    )

    eventEditorOptionsCacheKey = cacheKey
    eventEditorOptionsCache = {
      workerOptions,
      clientOptions,
      locationOptions,
      locationOptionsByClient,
      zoneOptions,
      zoneOptionsByClient,
      workerLabelByLogin,
      clientLabelById,
      zoneLabelById,
    }
    return eventEditorOptionsCache
  }

  function populateEventEditorOptions(
    selectedWorkerLogin,
    selectedClientId,
    selectedZoneId,
    selectedLocation = '',
  ) {
    const workerSelect = document.getElementById('evEditWorker')
    const clientSelect = document.getElementById('evEditPom')
    const locationSelect = document.getElementById('evEditLocation')
    const zoneSelect = document.getElementById('evEditStrefa')

    if (!workerSelect || !clientSelect || !locationSelect || !zoneSelect) {
      return
    }

    const optionsCache = eventEditorBuildOptionsCache()
    const normalizedClientId = String(selectedClientId ?? '').trim()
    const normalizedZoneId = String(selectedZoneId ?? '').trim()
    const zoneLocation = eventEditorReadableZoneLocation(eventEditorSelectedZone(normalizedZoneId) || {})
    const normalizedLocation = String(selectedLocation || zoneLocation || '').trim()
    const locationKey = normalizeSearchText(normalizedLocation)
    const baseZoneOptions = normalizedClientId
      ? optionsCache.zoneOptionsByClient.get(normalizedClientId) ?? []
      : optionsCache.zoneOptions
    const zoneOptions = locationKey
      ? baseZoneOptions.filter((option) => normalizeSearchText(option?.location) === locationKey)
      : baseZoneOptions
    const locationOptions = normalizedClientId
      ? optionsCache.locationOptionsByClient.get(normalizedClientId) ?? []
      : optionsCache.locationOptions
    const normalizedWorkerLogin = String(selectedWorkerLogin ?? '').trim()
    const fallbackWorkerLabel = optionsCache.workerLabelByLogin.get(normalizedWorkerLogin) ?? normalizedWorkerLogin
    const fallbackClientLabel = optionsCache.clientLabelById.get(normalizedClientId) ?? normalizedClientId
    const fallbackZoneLabel = optionsCache.zoneLabelById.get(normalizedZoneId) ?? normalizedZoneId

    appState.eventEditorWorkerOptions = eventEditorEnsureOption(optionsCache.workerOptions, normalizedWorkerLogin, fallbackWorkerLabel)
    appState.eventEditorClientOptions = eventEditorEnsureOption(optionsCache.clientOptions, normalizedClientId, fallbackClientLabel)
    appState.eventEditorLocationOptions = eventEditorEnsureOption(
      locationOptions,
      normalizedLocation,
      normalizedLocation,
    )
    appState.eventEditorZoneOptions = eventEditorEnsureOption(zoneOptions, normalizedZoneId, fallbackZoneLabel)

    eventEditorApplyAllPickerFilters()
    ensureSelectValue(workerSelect, normalizedWorkerLogin, fallbackWorkerLabel)
    ensureSelectValue(clientSelect, normalizedClientId, fallbackClientLabel)
    ensureSelectValue(locationSelect, normalizedLocation, normalizedLocation)
    ensureSelectValue(zoneSelect, normalizedZoneId, fallbackZoneLabel)
    eventEditorSyncSearchInput('worker')
    eventEditorSyncSearchInput('client')
    eventEditorSyncSearchInput('location')
    eventEditorSyncSearchInput('zone')
  }

  function setEventsFilterSelectValue(select, filterValue = '', workerLogin = '') {
    if (!(select instanceof HTMLSelectElement)) return false
    const normalizedValue = String(filterValue ?? '').trim()
    const normalizedLogin = String(workerLogin ?? '').trim()
    const options = [...select.options]
    const match =
      (normalizedLogin
        ? options.find((option) => String(option.dataset.workerLogin ?? '').trim() === normalizedLogin)
        : null) ??
      options.find((option) => String(option.value ?? '').trim() === normalizedValue) ??
      null

    if (match) {
      select.value = match.value
      delete select.dataset.pendingFilterValue
      delete select.dataset.pendingWorkerLogin
      return true
    }

    const fallbackValue = normalizedValue || normalizedLogin
    if (fallbackValue) {
      const fallbackOption = document.createElement('option')
      fallbackOption.value = fallbackValue
      fallbackOption.textContent = fallbackValue
      if (normalizedLogin) {
        fallbackOption.dataset.workerLogin = normalizedLogin
      }
      select.appendChild(fallbackOption)
      select.value = fallbackValue
      delete select.dataset.pendingFilterValue
      delete select.dataset.pendingWorkerLogin
      return true
    }

    select.value = ''
    delete select.dataset.pendingFilterValue
    delete select.dataset.pendingWorkerLogin
    return false
  }

  function eventsFilterComboConfig(kind) {
    const configs = {
      worker: { hiddenId: 'evWorker', textId: 'evWorkerText', listId: 'evWorkerList' },
      zone: { hiddenId: 'evStrefa', textId: 'evStrefaText', listId: 'evStrefaList' },
      client: { hiddenId: 'evPom', textId: 'evPomText', listId: 'evPomList' },
    }
    return configs[String(kind ?? '').trim().toLowerCase()] ?? null
  }

  function eventsFilterComboElements(kind) {
    const config = eventsFilterComboConfig(kind)
    if (!config) return null
    const hidden = document.getElementById(config.hiddenId)
    const text = document.getElementById(config.textId)
    const list = document.getElementById(config.listId)
    const root = text?.closest?.('[data-events-filter-combo]')
    if (!root || !(hidden instanceof HTMLInputElement) || !(text instanceof HTMLInputElement) || !list) {
      return null
    }
    return {
      config,
      root,
      hidden,
      text,
      list,
      toggle: root.querySelector('.events-filter-combo-toggle'),
    }
  }

  function eventsFilterComboState(kind) {
    const normalizedKind = String(kind ?? '').trim().toLowerCase()
    if (!eventFilterComboStates.has(normalizedKind)) {
      eventFilterComboStates.set(normalizedKind, {
        options: [],
        filteredOptions: [],
        selectedValue: '',
        selectedWorkerLogin: '',
        query: '',
        open: false,
        activeIndex: -1,
      })
    }
    return eventFilterComboStates.get(normalizedKind)
  }

  function eventsFilterComboFilteredOptions(kind) {
    const state = eventsFilterComboState(kind)
    const query = normalizeSearchText(state.query)
    const matches = query
      ? state.options.filter((option) => normalizeSearchText(option.searchText).includes(query))
      : state.options
    return matches.slice(0, EVENT_FILTER_COMBO_MAX_OPTIONS)
  }

  function eventsFilterComboRender(kind) {
    const elements = eventsFilterComboElements(kind)
    if (!elements) return
    const state = eventsFilterComboState(kind)
    const options = eventsFilterComboFilteredOptions(kind)
    state.filteredOptions = options

    if (!options.length) {
      state.activeIndex = -1
      elements.list.innerHTML = `
        <div class="events-filter-combo-empty">
          <i class="ph ph-magnifying-glass" aria-hidden="true"></i>
          <span>Brak pasujących wyników</span>
        </div>
      `
      elements.text.removeAttribute('aria-activedescendant')
      return
    }

    if (state.activeIndex < 0 || state.activeIndex >= options.length) {
      const selectedIndex = options.findIndex((option) => option.value === state.selectedValue)
      state.activeIndex = selectedIndex >= 0 ? selectedIndex : 0
    }

    elements.list.innerHTML = options
      .map((option, index) => {
        const optionId = `${elements.config.listId}-option-${index}`
        const classes = ['events-filter-combo-option']
        if (index === state.activeIndex) classes.push('is-active')
        if (option.value === state.selectedValue) classes.push('is-selected')
        return `
          <button
            class="${classes.join(' ')}"
            id="${optionId}"
            type="button"
            role="option"
            aria-selected="${option.value === state.selectedValue ? 'true' : 'false'}"
            data-events-filter-option="${index}"
            data-events-filter-kind="${escapeHtml(kind)}"
          >
            <span class="events-filter-combo-option-icon" aria-hidden="true"><i class="ph ${option.icon || 'ph-magnifying-glass'}"></i></span>
            <span class="events-filter-combo-option-copy">
              <strong>${escapeHtml(option.label)}</strong>
              ${option.meta ? `<small>${escapeHtml(option.meta)}</small>` : ''}
            </span>
            ${option.value === state.selectedValue ? '<i class="ph ph-check" aria-hidden="true"></i>' : ''}
          </button>
        `
      })
      .join('')

    const activeOption = elements.list.querySelector(`[data-events-filter-option="${state.activeIndex}"]`)
    if (activeOption?.id) {
      elements.text.setAttribute('aria-activedescendant', activeOption.id)
    }
  }

  function eventsFilterComboOpen(kind) {
    const elements = eventsFilterComboElements(kind)
    if (!elements) return
    eventFilterComboStates.forEach((state, otherKind) => {
      if (otherKind !== kind && state.open) {
        eventsFilterComboClose(otherKind)
      }
    })
    const state = eventsFilterComboState(kind)
    state.open = true
    state.activeIndex = -1
    elements.root.classList.add('is-open')
    elements.text.setAttribute('aria-expanded', 'true')
    eventsFilterComboRender(kind)
  }

  function eventsFilterComboClose(kind, { restoreSelection = false } = {}) {
    const elements = eventsFilterComboElements(kind)
    if (!elements) return
    const state = eventsFilterComboState(kind)
    state.open = false
    state.activeIndex = -1
    elements.root.classList.remove('is-open')
    elements.text.setAttribute('aria-expanded', 'false')
    elements.text.removeAttribute('aria-activedescendant')
    if (!restoreSelection) return
    const selected = state.options.find((option) => option.value === state.selectedValue)
    elements.text.value = selected?.label ?? ''
    state.query = ''
  }

  function eventsFilterComboSelect(kind, option) {
    const elements = eventsFilterComboElements(kind)
    if (!elements || !option) return
    const state = eventsFilterComboState(kind)
    state.selectedValue = String(option.value ?? '').trim()
    state.selectedWorkerLogin = String(option.workerLogin ?? '').trim()
    state.query = ''
    elements.hidden.value = state.selectedValue
    elements.text.value = String(option.label ?? option.value ?? '').trim()
    if (state.selectedWorkerLogin) {
      elements.hidden.dataset.pendingWorkerLogin = state.selectedWorkerLogin
    } else {
      delete elements.hidden.dataset.pendingWorkerLogin
    }
    delete elements.hidden.dataset.pendingFilterValue
    eventsFilterComboClose(kind)
    elements.hidden.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function eventsFilterComboSetValue(kind, value = '', workerLogin = '') {
    const elements = eventsFilterComboElements(kind)
    if (!elements) return
    const state = eventsFilterComboState(kind)
    const normalizedValue = String(value ?? '').trim()
    const normalizedWorkerLogin = String(workerLogin ?? '').trim()
    const selected =
      (normalizedWorkerLogin
        ? state.options.find((option) => String(option.workerLogin ?? '').trim() === normalizedWorkerLogin)
        : null) ??
      state.options.find((option) => String(option.value ?? '').trim() === normalizedValue) ??
      null

    state.selectedValue = selected?.value ?? normalizedValue
    state.selectedWorkerLogin = selected?.workerLogin ?? normalizedWorkerLogin
    state.query = ''
    elements.hidden.value = state.selectedValue
    elements.text.value = selected?.label ?? normalizedValue
    if (state.selectedWorkerLogin) {
      elements.hidden.dataset.pendingWorkerLogin = state.selectedWorkerLogin
    } else {
      delete elements.hidden.dataset.pendingWorkerLogin
    }
    eventsFilterComboClose(kind)
  }

  function eventsFilterComboFill(kind, entries = []) {
    const elements = eventsFilterComboElements(kind)
    if (!elements) return
    const state = eventsFilterComboState(kind)
    const currentValue = String(elements.hidden.value ?? state.selectedValue ?? '').trim()
    const currentWorkerLogin = String(
      elements.hidden.dataset.pendingWorkerLogin ?? state.selectedWorkerLogin ?? '',
    ).trim()
    const unique = new Map()
    entries.forEach((entry) => {
      const label = String(entry?.label ?? entry?.value ?? '').trim()
      const value = String(entry?.value ?? label).trim()
      if (!label || !value) return
      const key = `${normalizeSearchText(entry?.key ?? value)}|${normalizeSearchText(entry?.workerLogin)}`
      if (!unique.has(key)) {
        unique.set(key, {
          value,
          label,
          meta: String(entry?.meta ?? '').trim(),
          icon: String(entry?.icon ?? '').trim(),
          workerLogin: String(entry?.workerLogin ?? '').trim(),
          searchText: String(entry?.searchText ?? `${label} ${value} ${entry?.meta ?? ''}`).trim(),
        })
      }
    })
    state.options = [...unique.values()]
    if (kind !== 'zone') {
      state.options.sort((left, right) =>
        left.label.localeCompare(right.label, 'pl', { numeric: true, sensitivity: 'base' }),
      )
    }
    eventsFilterComboSetValue(kind, currentValue, currentWorkerLogin)
    eventsFilterComboRender(kind)
  }

  function fillEventsClientFilterDatalist() {
    const clients = Array.isArray(appState.clients) ? appState.clients : []

    eventsFilterComboFill(
      'worker',
      (Array.isArray(appState.workers) ? appState.workers : []).map((worker) => {
        const login = String(worker?.login ?? worker?.workerLogin ?? worker?.id ?? '').trim()
        const label = String(worker?.name ?? worker?.workerName ?? login).trim()
        return {
          key: login || label,
          value: label,
          label,
          workerLogin: login,
          meta: login && login !== label ? login : '',
          icon: 'ph-user',
          searchText: `${label} ${login}`,
        }
      }),
    )

    eventsFilterComboFill(
      'client',
      clients.map((client) => {
        const id = String(client?.id ?? client?.clientId ?? '').trim()
        const label = String(client?.name ?? client?.clientName ?? id).trim()
        return {
          key: id || label,
          value: label,
          label,
          meta: id && id !== label ? `ID: ${id}` : '',
          icon: 'ph-buildings',
          searchText: `${label} ${id}`,
        }
      }),
    )

    eventsFilterComboFill(
      'zone',
      DEFAULT_ZONE_TYPE_OPTIONS.map((label) => ({
        key: label,
        value: label,
        label,
        meta: '',
        icon: 'ph-stack',
        searchText: label,
      })),
    )
  }

  function bindEventsFilterCombo(binding, kind) {
    const elements = eventsFilterComboElements(kind)
    if (!elements) return
    const state = eventsFilterComboState(kind)

    binding.add(elements.text, 'focus', () => {
      state.query = ''
      eventsFilterComboOpen(kind)
    })

    binding.add(elements.text, 'input', () => {
      state.query = String(elements.text.value ?? '')
      state.selectedValue = ''
      state.selectedWorkerLogin = ''
      elements.hidden.value = ''
      delete elements.hidden.dataset.pendingWorkerLogin
      delete elements.hidden.dataset.pendingFilterValue
      if (!state.open) {
        eventsFilterComboOpen(kind)
      } else {
        state.activeIndex = -1
        eventsFilterComboRender(kind)
      }
    })

    binding.add(elements.text, 'keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        eventsFilterComboClose(kind, { restoreSelection: true })
        return
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        if (!state.open) {
          eventsFilterComboOpen(kind)
        }
        const options = state.filteredOptions
        if (!options.length) return
        const direction = event.key === 'ArrowDown' ? 1 : -1
        state.activeIndex =
          state.activeIndex < 0
            ? direction > 0
              ? 0
              : options.length - 1
            : (state.activeIndex + direction + options.length) % options.length
        eventsFilterComboRender(kind)
        return
      }

      if (event.key !== 'Enter') return
      if (state.open && state.filteredOptions.length) {
        event.preventDefault()
        const option = state.filteredOptions[Math.max(0, state.activeIndex)] ?? state.filteredOptions[0]
        eventsFilterComboSelect(kind, option)
        appState.eventsPage = 1
        void fetchEventsForCurrentSession({ resetPage: false })
      }
    })

    binding.add(elements.toggle, 'pointerdown', (event) => {
      event.preventDefault()
    })
    binding.add(elements.toggle, 'click', () => {
      if (state.open) {
        eventsFilterComboClose(kind, { restoreSelection: true })
      } else {
        elements.text.focus()
        eventsFilterComboOpen(kind)
      }
    })

    binding.add(elements.list, 'pointerdown', (event) => {
      if (event.target.closest('[data-events-filter-option]')) {
        event.preventDefault()
      }
    })
    binding.add(elements.list, 'click', (event) => {
      const optionButton = event.target.closest('[data-events-filter-option]')
      if (!optionButton) return
      const index = Number(optionButton.getAttribute('data-events-filter-option'))
      const option = Number.isInteger(index) ? state.filteredOptions[index] : null
      if (!option) return
      eventsFilterComboSelect(kind, option)
    })

    binding.add(elements.text, 'blur', () => {
      window.setTimeout(() => {
        const active = document.activeElement
        if (!active || !elements.root.contains(active)) {
          eventsFilterComboClose(kind, { restoreSelection: true })
        }
      }, 120)
    })
  }

  function setEventStopNow() {
    const endInput = document.getElementById('evEditStop')
    if (!endInput) {
      return
    }

    eventEditorClearStopHint(endInput)
    endInput.value = isoToLocalDateTimeInput(new Date().toISOString())
    eventEditorSyncTimeSummary()
  }

  function eventEditorClearStopHint(input = document.getElementById('evEditStop')) {
    if (!(input instanceof HTMLInputElement)) {
      return
    }

    delete input.dataset.eventStopHint
    delete input.dataset.eventStopHintValue
  }

  function eventEditorSetStopValue(input, value = '', { isHint = false } = {}) {
    if (!(input instanceof HTMLInputElement)) {
      return
    }

    input.value = value
    if (isHint && value) {
      input.dataset.eventStopHint = '1'
      input.dataset.eventStopHintValue = value
    } else {
      eventEditorClearStopHint(input)
    }
  }

  function eventEditorSyncStopHintFromStart() {
    const startInput = document.getElementById('evEditStart')
    const stopInput = document.getElementById('evEditStop')
    if (!(startInput instanceof HTMLInputElement) || !(stopInput instanceof HTMLInputElement)) {
      return
    }

    if (stopInput.dataset.eventStopHint !== '1') {
      return
    }

    const nextValue = String(startInput.value ?? '').trim()
    eventEditorSetStopValue(stopInput, nextValue, { isHint: Boolean(nextValue) })
  }

  function eventEditorReadStopValue(input) {
    if (!(input instanceof HTMLInputElement)) {
      return ''
    }

    const value = String(input.value ?? '').trim()
    if (input.dataset.eventStopHint === '1' && value === String(input.dataset.eventStopHintValue ?? '').trim()) {
      return ''
    }

    return value
  }

  function syncEventRoomAndClientFromZone() {
    const zoneSelect = document.getElementById('evEditStrefa')
    if (!zoneSelect) {
      return
    }

    const zone = eventEditorSelectedZone(zoneSelect.value)
    if (!zone) {
      return
    }

    const selectedWorker = String(document.getElementById('evEditWorker')?.value ?? '').trim()
    const clientId = String(zone.clientId ?? '').trim()
    const location = eventEditorReadableZoneLocation(zone)
    populateEventEditorOptions(selectedWorker, clientId, zoneSelect.value, location)
  }

  function refreshEventZoneOptionsForClient() {
    const clientId = String(document.getElementById('evEditPom')?.value ?? '').trim()
    const selectedWorker = String(document.getElementById('evEditWorker')?.value ?? '').trim()
    populateEventEditorOptions(selectedWorker, clientId, '', '')
  }

  function refreshEventZoneOptionsForLocation() {
    const clientId = String(document.getElementById('evEditPom')?.value ?? '').trim()
    const selectedWorker = String(document.getElementById('evEditWorker')?.value ?? '').trim()
    const location = String(document.getElementById('evEditLocation')?.value ?? '').trim()
    populateEventEditorOptions(selectedWorker, clientId, '', location)
  }

  function ensureSingleOverlayInBody(id) {
    const nodes = [...document.querySelectorAll(`#${id}`)]
    if (!nodes.length) {
      return null
    }

    const preferred = nodes[nodes.length - 1]
    nodes.forEach((node) => {
      if (node !== preferred) {
        node.remove()
      }
    })

    if (preferred.parentElement !== document.body) {
      document.body.appendChild(preferred)
    }

    return preferred
  }

  function ensureEventOverlaysMountedToBody() {
    ensureSingleOverlayInBody('evIntegrityModalOverlay')
    ensureSingleOverlayInBody('evEditorOverlay')
    ensureSingleOverlayInBody('evCommentOverlay')
    ensureSingleOverlayInBody('evDeleteConfirmOverlay')
  }

  function eventEditorReferencesReady() {
    return Boolean(appState.workersLoaded && appState.clientsLoaded && appState.zonesLoaded)
  }

  function eventEditorSafeScannedQrLabel(item = {}) {
    try {
      return eventEditorScannedQrLabel(item)
    } catch (error) {
      console.warn('[events] scanned QR label fallback', error)
      return '-'
    }
  }

  async function openEventEditor(item) {
    ensureEventOverlaysMountedToBody()
    const overlay = document.getElementById('evEditorOverlay')
    if (!overlay) {
      return
    }

    syncEventModalLogo()

    appState.eventEditorMode = 'edit'
    appState.eventEditorItem = item

    const title = document.getElementById('evEditorTitle')
    const modeIcon = document.getElementById('evEditorModeIcon')
    const subtitle = document.getElementById('evEditorSubtitle')
    const cycleMeta = document.getElementById('evCycleMeta')
    const cycleId = document.getElementById('evCycleId')
    const rowNumber = document.getElementById('evRowNumber')
    const editedBy = document.getElementById('evEditedBy')
    const startInput = document.getElementById('evEditStart')
    const stopInput = document.getElementById('evEditStop')
    const stopNowButton = document.getElementById('evStopNowBtn')
    const commentInput = document.getElementById('evEditComment')
    const scannedQrInput = document.getElementById('evScannedQr')
    const deleteButton = document.getElementById('evDeleteBtn')
    const saveButton = document.getElementById('evSaveBtn')

    eventEditorResetSearchInputs()
    if (eventEditorReferencesReady()) {
      const zone = eventEditorSelectedZone(item.roomId || item.utilityRoomId)
      const selectedClientId = zone?.clientId ?? item.clientId
      const selectedZoneId = zone?.id ?? item.roomId ?? item.utilityRoomId
      const selectedLocation =
        eventEditorReadableZoneLocation(zone || {}) ||
        String(item.lokalizacja ?? item.location ?? '').trim()
      eventEditorSetPickersLoading(false)
      populateEventEditorOptions(
        item.workerLogin,
        selectedClientId,
        selectedZoneId,
        selectedLocation,
      )
    } else {
      eventEditorSetPickersLoading(true)
    }

    overlay.dataset.mode = 'edit'
    if (modeIcon) modeIcon.className = 'ph ph-pencil-simple-line'
    if (title) title.textContent = 'Edytuj zdarzenie'
    if (subtitle) subtitle.textContent = 'Zmień przypisanie lub godziny zdarzenia pracownika.'
    if (cycleMeta) cycleMeta.hidden = false
    if (cycleId) cycleId.textContent = String(item.eventId ?? item.workdayId ?? '-')
    if (rowNumber) rowNumber.textContent = '-'
    if (editedBy) editedBy.textContent = item.editedBy || appState.session?.name || '-'
    const eventType = eventTypeInfo(item).label
    let startValue = isoToLocalDateTimeInput(item.startAt)
    let stopValue = isoToLocalDateTimeInput(item.endAt)
    if (eventType === 'QR START') {
      stopValue = ''
    } else if (eventType === 'QR STOP') {
      stopValue = isoToLocalDateTimeInput(item.endAt || item.startAt)
      startValue = ''
    }
    if (startInput) startInput.value = startValue
    eventEditorSetStopValue(stopInput, stopValue)
    if (stopNowButton instanceof HTMLButtonElement) stopNowButton.disabled = false
    if (startInput) startInput.disabled = false
    if (stopInput) stopInput.disabled = false
    if (commentInput) {
      commentInput.readOnly = true
      commentInput.value = normalizeVisibleEventComment(item.comment)
    }
    if (scannedQrInput) {
      scannedQrInput.value = eventEditorSafeScannedQrLabel(item)
    }
    if (saveButton) {
      saveButton.disabled = !eventEditorReferencesReady()
      setEventEditorButtonLabel(saveButton, 'Zapisz zmiany')
    }
    if (deleteButton) {
      deleteButton.style.display = canDeleteEvents() ? '' : 'none'
      deleteButton.disabled = !eventCanDelete(item)
      setEventEditorButtonLabel(deleteButton, 'Usuń zdarzenie')
    }

    eventEditorSyncTimeSummary()
    overlay.style.display = 'flex'
    window.requestAnimationFrame(() => title?.focus?.())

    if (!eventEditorReferencesReady()) {
      try {
        await ensureEventReferenceDataLoaded()
        if (appState.eventEditorMode !== 'edit' || appState.eventEditorItem !== item) {
          return
        }
        const zone = eventEditorSelectedZone(item.roomId || item.utilityRoomId)
        const selectedClientId = zone?.clientId ?? item.clientId
        const selectedZoneId = zone?.id ?? item.roomId ?? item.utilityRoomId
        const selectedLocation =
          eventEditorReadableZoneLocation(zone || {}) ||
          String(item.lokalizacja ?? item.location ?? '').trim()
        eventEditorSetPickersLoading(false)
        populateEventEditorOptions(
          item.workerLogin,
          selectedClientId,
          selectedZoneId,
          selectedLocation,
        )
        if (saveButton) {
          saveButton.disabled = false
        }
      } catch (error) {
        console.warn('[events] editor references failed', error)
        if (saveButton) {
          saveButton.disabled = true
        }
      }
    }
  }

  async function openCreateEventEditor() {
    ensureEventOverlaysMountedToBody()
    const overlay = document.getElementById('evEditorOverlay')
    if (!overlay) {
      return
    }

    if (!canManageEvents()) {
      alert('Brak uprawnień do dodawania zdarzeń.')
      return
    }

    syncEventModalLogo()

    appState.eventEditorMode = 'add'
    appState.eventEditorItem = null

    const title = document.getElementById('evEditorTitle')
    const modeIcon = document.getElementById('evEditorModeIcon')
    const subtitle = document.getElementById('evEditorSubtitle')
    const cycleMeta = document.getElementById('evCycleMeta')
    const cycleId = document.getElementById('evCycleId')
    const rowNumber = document.getElementById('evRowNumber')
    const editedBy = document.getElementById('evEditedBy')
    const startInput = document.getElementById('evEditStart')
    const stopInput = document.getElementById('evEditStop')
    const commentInput = document.getElementById('evEditComment')
    const scannedQrInput = document.getElementById('evScannedQr')
    const deleteButton = document.getElementById('evDeleteBtn')
    const saveButton = document.getElementById('evSaveBtn')

    eventEditorResetSearchInputs()
    if (eventEditorReferencesReady()) {
      eventEditorSetPickersLoading(false)
      populateEventEditorOptions('', '', '')
    } else {
      eventEditorSetPickersLoading(true)
    }

    overlay.dataset.mode = 'add'
    if (modeIcon) modeIcon.className = 'ph ph-plus-circle'
    if (title) title.textContent = 'Dodaj zdarzenie'
    if (subtitle) subtitle.textContent = 'Dodaj START, STOP albo pełne zdarzenie pracownika.'
    if (cycleMeta) cycleMeta.hidden = true
    if (cycleId) cycleId.textContent = '-'
    if (rowNumber) rowNumber.textContent = '-'
    if (editedBy) editedBy.textContent = appState.session?.name || '-'
    if (startInput) startInput.value = ''
    eventEditorSetStopValue(stopInput, '')
    if (commentInput) {
      commentInput.readOnly = true
      commentInput.value = ''
    }
    if (scannedQrInput) {
      scannedQrInput.value = '-'
    }
    if (saveButton) {
      saveButton.disabled = !eventEditorReferencesReady()
      setEventEditorButtonLabel(saveButton, 'Dodaj zdarzenie')
    }
    if (deleteButton) {
      deleteButton.style.display = 'none'
      deleteButton.disabled = false
      setEventEditorButtonLabel(deleteButton, 'Usuń zdarzenie')
    }

    eventEditorSyncTimeSummary()
    overlay.style.display = 'flex'
    window.requestAnimationFrame(() => title?.focus?.())

    if (!eventEditorReferencesReady()) {
      try {
        await ensureEventReferenceDataLoaded()
        if (appState.eventEditorMode !== 'add' || appState.eventEditorItem !== null) {
          return
        }
        eventEditorSetPickersLoading(false)
        populateEventEditorOptions('', '', '')
        if (saveButton) {
          saveButton.disabled = false
        }
      } catch (error) {
        console.warn('[events] editor references failed', error)
        if (saveButton) {
          saveButton.disabled = true
        }
      }
    }
  }

  function closeEventEditor() {
    const overlay = document.getElementById('evEditorOverlay')
    if (overlay) {
      overlay.style.display = 'none'
    }

    eventEditorCollapsePicker('worker')
    eventEditorCollapsePicker('client')
    eventEditorCollapsePicker('location')
    eventEditorCollapsePicker('zone')
    if (overlay) delete overlay.dataset.mode
    appState.eventEditorMode = 'add'
    appState.eventEditorItem = null
  }

  function resolveEventKindFromTimes(startAt, endAt) {
    if (startAt && endAt) {
      return 'start_stop'
    }
    if (startAt) {
      return 'start'
    }
    if (endAt) {
      return 'stop'
    }
    return 'none'
  }

  function readEventEditorPayload() {
    const workerSelect = document.getElementById('evEditWorker')
    const clientSelect = document.getElementById('evEditPom')
    const locationSelect = document.getElementById('evEditLocation')
    const zoneSelect = document.getElementById('evEditStrefa')
    const startInput = document.getElementById('evEditStart')
    const stopInput = document.getElementById('evEditStop')
    const commentInput = document.getElementById('evEditComment')

    const workerLogin = String(workerSelect?.value ?? '').trim()
    const workerName = workerSelect?.selectedOptions?.[0]?.textContent?.trim() || workerLogin
    const clientId = String(clientSelect?.value ?? '').trim()
    const zoneId = String(zoneSelect?.value ?? '').trim()
    const utilityRoomId = zoneId
    const selectedZone = eventEditorSelectedZone(zoneId)
    const location = String(
      locationSelect?.value ||
        eventEditorReadableZoneLocation(selectedZone || {}) ||
        '',
    ).trim()
    const startInputValue = String(startInput?.value ?? '').trim()
    const stopInputValue = eventEditorReadStopValue(stopInput)
    const originalEvent = appState.eventEditorMode === 'edit' ? appState.eventEditorItem : null
    const parsedStartAt = localDateTimeInputToIso(startInputValue)
    const parsedEndAt = localDateTimeInputToIso(stopInputValue)
    const startAt = originalEvent
      ? preserveUnchangedEventTimestamp({
          inputValue: startInputValue,
          parsedInputTimestamp: parsedStartAt,
          originalTimestamp: toIso(originalEvent.startAt),
          formattedOriginalValue: isoToLocalDateTimeInput(originalEvent.startAt),
        })
      : parsedStartAt
    const endAt = originalEvent
      ? preserveUnchangedEventTimestamp({
          inputValue: stopInputValue,
          parsedInputTimestamp: parsedEndAt,
          originalTimestamp: toIso(originalEvent.endAt),
          formattedOriginalValue: isoToLocalDateTimeInput(originalEvent.endAt),
        })
      : parsedEndAt
    const comment = String(commentInput?.value ?? '').trim()
    const eventKind = resolveEventKindFromTimes(startAt, endAt)

    let durationSec = 0
    if (startAt && endAt) {
      durationSec = Math.max(0, Math.floor((new Date(endAt).getTime() - new Date(startAt).getTime()) / 1000))
    }
    const status = eventKind === 'start' ? 'RUNNING' : 'CLOSED'

    return {
      eventKind,
      workerLogin,
      workerName,
      clientId: clientId || null,
      zoneId: utilityRoomId || null,
      utilityRoomId: utilityRoomId || null,
      roomId: utilityRoomId || null,
      location: location || null,
      lokalizacja: location || null,
      startAt: startAt || null,
      endAt: endAt || null,
      durationSec,
      status,
      closeMarkedAt: eventKind === 'start' ? null : endAt || null,
      clientStatus: clientId ? 'CLIENT' : null,
      comment,
      updatedBy: appState.session?.name ?? null,
    }
  }


  function eventEndReasonFromKind(eventKind) {
    if (eventKind === 'stop') {
      return 'WORKDAY_STOP'
    }
    if (eventKind === 'start_stop') {
      return 'QR_START_STOP'
    }
    return null
  }

  function eventEditorRowMatchesWorker(row, payload) {
    const payloadLogin = normalizeSearchText(payload?.workerLogin)
    const payloadName = normalizeSearchText(payload?.workerName)
    const rowLoginRaw = normalizeSearchText(row?.workerLogin ?? row?.login ?? row?.workerId)
    const rowLogin = rowLoginRaw && rowLoginRaw !== '-' ? rowLoginRaw : ''
    const rowName = normalizeSearchText(row?.workerName ?? row?.name)

    if (payloadLogin && rowLogin) {
      return payloadLogin === rowLogin
    }

    if (payloadName && rowName) {
      return payloadName === rowName
    }

    return Boolean(payloadLogin && rowName && payloadLogin === rowName)
  }

  function eventEditorIsSameEditedRow(row) {
    if (appState.eventEditorMode !== 'edit' || !appState.eventEditorItem) {
      return false
    }

    const editedIds = new Set(eventIdentityCandidateIds(appState.eventEditorItem))
    const rowIds = eventIdentityCandidateIds(row)
    if (rowIds.some((id) => editedIds.has(id))) {
      return true
    }

    const editedFingerprint = eventRowFingerprintKey(appState.eventEditorItem)
    return Boolean(editedFingerprint && eventRowFingerprintKey(row) === editedFingerprint)
  }

  async function eventEditorFindOverlappingStatus(payload, startAt, endAt) {
    const candidateInterval = workStatusIntervalFromTimes(startAt, endAt, payload?.durationSec)
    if (!candidateInterval) {
      return null
    }

    const fromYmd = workStatusYmdFromTimestamp(candidateInterval.startTs)
    const toYmd = workStatusYmdFromTimestamp(candidateInterval.endTs - 1)
    if (!fromYmd || !toYmd) {
      return null
    }

    const response = await getWorkdays(appState.session.orgId, {
      source: 'events',
      fromIso: ymdToIsoRangeStart(fromYmd),
      toIso: ymdToIsoRangeEnd(toYmd),
      page: 1,
      pageSize: 10000,
    })

    const rows = Array.isArray(response?.items) ? response.items : []
    for (const row of rows) {
      if (eventEditorIsSameEditedRow(row) || !eventEditorRowMatchesWorker(row, payload)) {
        continue
      }

      const rowInterval = workStatusIntervalFromRow(row)
      if (workStatusIntervalsOverlap(candidateInterval, rowInterval)) {
        return { row, interval: rowInterval }
      }
    }

    return null
  }

  function eventEditorSelectedWorker(workerLogin) {
    const normalizedLogin = normalizeSearchText(workerLogin)
    if (!normalizedLogin) {
      return null
    }

    const matches = (Array.isArray(appState.workers) ? appState.workers : []).filter((worker) => {
      const login = normalizeSearchText(worker?.login ?? worker?.workerLogin ?? worker?.id)
      return Boolean(login && login === normalizedLogin)
    })
    return matches.length === 1 ? matches[0] : null
  }

  function eventEditorSelectedZone(zoneId) {
    const normalizedZoneId = String(zoneId ?? '').trim()
    if (!normalizedZoneId) {
      return null
    }

    return (
      (Array.isArray(appState.zones) ? appState.zones : [])
        .map((zone) => mapZoneForView(zone))
        .find((zone) => String(zone?.id ?? '').trim() === normalizedZoneId) || null
    )
  }

  function eventEditorManualObjectValidationMessage(payload = {}) {
    if (!payload.clientId) {
      return 'Wybierz obiekt. Ręczne zdarzenie nie może zostać zapisane bez obiektu.'
    }
    if (!payload.zoneId) {
      return 'Wybierz strefę należącą do obiektu. To ona zapisuje powiązanie zdarzenia z obiektem.'
    }

    const selectedZone = eventEditorSelectedZone(payload.zoneId)
    if (!selectedZone) {
      return 'Wybrana strefa nie istnieje lub nie została załadowana. Odśwież dane i wybierz ją ponownie.'
    }

    const zoneClientId = String(selectedZone?.clientId ?? '').trim()
    if (!zoneClientId || zoneClientId !== String(payload.clientId).trim()) {
      return 'Wybrana strefa nie należy do wskazanego obiektu. Wybierz właściwą strefę.'
    }

    const selectedLocation = normalizeSearchText(payload.location ?? payload.lokalizacja)
    const zoneLocation = normalizeSearchText(eventEditorReadableZoneLocation(selectedZone))
    if (selectedLocation && selectedLocation !== zoneLocation) {
      return 'Wybrana lokalizacja nie należy do wskazanej strefy. Wybierz lokalizację i strefę ponownie.'
    }

    return ''
  }

  function eventEditorOverlapMessage(payload, overlap) {
    const workerLabel = String(payload?.workerName || payload?.workerLogin || 'Pracownik').trim()
    const startLabel = workerDetailIsoToHm(overlap?.interval?.startIso)
    const endLabel = workerDetailIsoToHm(overlap?.interval?.endIso)
    return `Nie mozna zapisac statusu: ${workerLabel} ma juz status w tym czasie (${startLabel} - ${endLabel}).`
  }

  function eventEditorFutureTimeMessage(payload = {}) {
    const nowTs = Date.now()
    const futureFields = [
      ['Start', payload.startAt],
      ['Stop', payload.endAt],
    ].filter(([, value]) => {
      const ts = new Date(value ?? '').getTime()
      return Number.isFinite(ts) && ts > nowTs
    })

    if (!futureFields.length) {
      return ''
    }

    const fieldLabel = futureFields.map(([label]) => label).join(' i ')
    return `Nie mozna zapisac zdarzenia z czasem przyszlym. Popraw pole: ${fieldLabel}.`
  }

  async function saveEventEditor() {
    if (!appState.session?.orgId) {
      return
    }

    const isCreateMode = appState.eventEditorMode === 'add'
    if (isCreateMode && !canManageEvents()) {
      alert('Brak uprawnień do dodawania zdarzeń.')
      return
    }

    const payload = readEventEditorPayload()
    const eventPayload = { ...payload }
    delete eventPayload.eventKind
    if (!payload.workerLogin) {
      alert('Wybierz pracownika.')
      return
    }
    const targetWorker = eventEditorSelectedWorker(payload.workerLogin)
    if (targetWorker) {
      eventPayload.workerLogin = String(
        targetWorker.login ?? targetWorker.workerLogin ?? targetWorker.id ?? payload.workerLogin,
      ).trim()
      eventPayload.workerName = String(
        targetWorker.name ?? targetWorker.workerName ?? payload.workerName ?? eventPayload.workerLogin,
      ).trim()
    }
    if (
      targetWorker &&
      isOwnWorkdayEditBlocked({
        session: appState.session,
        workers: appState.workers,
        targetWorker,
      })
    ) {
      alert(OWN_WORKDAY_EDIT_DENIED_MESSAGE)
      return
    }
    if (isCreateMode) {
      const objectValidationMessage = eventEditorManualObjectValidationMessage(payload)
      if (objectValidationMessage) {
        alert(objectValidationMessage)
        return
      }
    }
    if (payload.eventKind === 'none') {
      alert('Podaj Start, Stop albo oba pola jednoczesnie.')
      return
    }
    if (payload.startAt && payload.endAt) {
      const diffMs = new Date(payload.endAt).getTime() - new Date(payload.startAt).getTime()
      if (!Number.isFinite(diffMs) || diffMs < 0) {
        alert('Godzina STOP musi byc pozniejsza niz START.')
        return
      }
    }
    const futureTimeMessage = eventEditorFutureTimeMessage(payload)
    if (futureTimeMessage) {
      alert(futureTimeMessage)
      return
    }

    const saveButton = document.getElementById('evSaveBtn')
    const editedHistorySource = appState.eventEditorMode === 'edit' ? { ...(appState.eventEditorItem || {}) } : null
    if (saveButton) {
      saveButton.disabled = true
      setEventEditorButtonLabel(saveButton, 'Zapisywanie...')
    }

    try {
      let savedEvent = null
      let savedEventPayload = null
      let savedEventVisibility = ''
      const derivedEndAt = payload.eventKind === 'start' ? null : payload.endAt
      const derivedStartAt = payload.eventKind === 'stop' ? derivedEndAt : payload.startAt
      const derivedDurationSec = payload.eventKind === 'start_stop' ? Number(payload.durationSec ?? 0) : 0
      const derivedStatus = payload.eventKind === 'start' ? 'RUNNING' : 'CLOSED'
      const derivedCloseMarkedAt = payload.eventKind === 'start' ? null : derivedEndAt || null
      const derivedEndReason = eventEndReasonFromKind(payload.eventKind)

      if (payload.eventKind === 'start_stop') {
        const overlap = await eventEditorFindOverlappingStatus(payload, derivedStartAt, derivedEndAt)
        if (overlap) {
          throw new Error(eventEditorOverlapMessage(payload, overlap))
        }
      }

      if (isCreateMode) {
        const newEventId = `EV-${Date.now()}-${Math.floor(Math.random() * 1000)}`
        savedEventPayload = {
          eventId: newEventId,
          ...eventPayload,
          startAt: derivedStartAt,
          endAt: derivedEndAt,
          durationSec: derivedDurationSec,
          status: derivedStatus,
          closeMarkedAt: derivedCloseMarkedAt,
          endReason: derivedEndReason,
        }
        savedEvent = await createEvent(appState.session.orgId, savedEventPayload)
      } else {
        const eventId = String(appState.eventEditorItem?.eventId ?? appState.eventEditorItem?.workdayId ?? '').trim()
        if (!eventId) {
          throw new Error('Brak eventId dla edycji zdarzenia.')
        }

        savedEventPayload = {
          ...appState.eventEditorItem,
          ...eventPayload,
          correlationIdentityBaseline: appState.eventEditorItem,
          startAt: derivedStartAt,
          endAt: derivedEndAt,
          durationSec: derivedDurationSec,
          status: derivedStatus,
          closeMarkedAt: derivedCloseMarkedAt,
          endReason: derivedEndReason,
        }
        savedEvent = await updateEvent(appState.session.orgId, eventId, savedEventPayload)
      }

      closeEventEditor()
      const postSaveRefreshes = []
      if (document.getElementById('evRows')) {
        if (isCreateMode) {
          appState.eventsPage = 1
          savedEventVisibility = eventEnsureSavedRowVisible(savedEvent, savedEventPayload)
        } else {
          savedEventVisibility = eventApplyUpdatedRow(
            savedEvent,
            savedEventPayload,
            editedHistorySource,
          )
        }
        postSaveRefreshes.push({
          label: 'events refresh',
          promise: Promise.resolve().then(() =>
            fetchEventsForCurrentSession({
              resetPage: isCreateMode,
              forceRefresh: true,
              silent: true,
            })),
        })
      }
      const savedHistoryItem = {
        ...(editedHistorySource || {}),
        ...eventPayload,
        startAt: derivedStartAt,
        endAt: derivedEndAt,
      }
      postSaveRefreshes.push({
        label: 'history refresh',
        promise: Promise.resolve().then(() => reportHistoryRefreshAfterEventSave(savedHistoryItem)),
      })
      if (typeof refreshWorkerAccountTimeAfterWorkdaySave === 'function') {
        const workerLoginsToRefresh = new Set(
          [savedHistoryItem.workerLogin, payload.workerLogin, editedHistorySource?.workerLogin]
            .map((value) => String(value ?? '').trim())
            .filter(Boolean),
        )
        for (const workerLogin of workerLoginsToRefresh) {
          postSaveRefreshes.push({
            label: `worker time refresh (${workerLogin})`,
            promise: Promise.resolve().then(() => refreshWorkerAccountTimeAfterWorkdaySave(workerLogin)),
          })
        }
      }
      postSaveRefreshes.push({
        label: 'dashboard refresh',
        promise: Promise.resolve().then(() =>
          typeof refreshDashboardAfterEventSave === 'function'
            ? refreshDashboardAfterEventSave(savedHistoryItem, editedHistorySource || null)
            : refreshDashboardWidgets({ forceRefresh: true, syncWorktimeToken: true })),
      })

      if (savedEventVisibility === 'hidden') {
        showTransientNotice(
          isCreateMode
            ? 'Zapisano, ale aktualne filtry ukrywaja nowy rekord.'
            : 'Zapisano, ale aktualne filtry ukrywaja edytowany rekord.',
        )
      } else {
        showTransientNotice('Zmiany zostały zapisane.')
      }
      void Promise.allSettled(postSaveRefreshes.map((entry) => entry.promise)).then((results) => {
        let refreshFailed = false
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            refreshFailed = true
            console.warn(
              `[portal/events] ${postSaveRefreshes[index]?.label || 'post-save refresh'} failed after event save`,
              result.reason,
            )
          }
        })
        if (refreshFailed) {
          showTransientNotice('Zapisano zdarzenie. Odswiez widoki, jesli nie widzisz zmian.')
        }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Błąd zapisu zdarzenia.'
      alert(message)
    } finally {
      if (saveButton) {
        saveButton.disabled = false
        setEventEditorButtonLabel(
          saveButton,
          appState.eventEditorMode === 'edit' ? 'Zapisz zmiany' : 'Dodaj zdarzenie',
        )
      }
    }
  }

  function closeEventDeleteConfirmation(confirmed = false) {
    const overlay = document.getElementById('evDeleteConfirmOverlay')
    if (overlay) {
      overlay.style.display = 'none'
    }

    const resolver = eventDeleteConfirmResolver
    eventDeleteConfirmResolver = null
    resolver?.(Boolean(confirmed))
  }

  function openEventDeleteConfirmation({
    count = 1,
    displayId = '',
    skippedCount = 0,
  } = {}) {
    ensureEventOverlaysMountedToBody()
    const overlay = document.getElementById('evDeleteConfirmOverlay')
    const title = document.getElementById('evDeleteConfirmTitle')
    const description = document.getElementById('evDeleteConfirmDescription')
    const detailLabel = document.getElementById('evDeleteConfirmDetailLabel')
    const detailValue = document.getElementById('evDeleteConfirmDetailValue')
    const warning = document.querySelector('#evDeleteConfirmWarning span')
    const acceptButton = document.getElementById('evDeleteConfirmAcceptBtn')

    if (!overlay || !title || !description || !detailLabel || !detailValue || !acceptButton) {
      return Promise.resolve(false)
    }

    if (eventDeleteConfirmResolver) {
      closeEventDeleteConfirmation(false)
    }

    const normalizedCount = Math.max(1, Number(count) || 1)
    const isBulk = normalizedCount > 1
    title.textContent = isBulk ? 'Usunąć wybrane zdarzenia?' : 'Usunąć zdarzenie?'
    description.textContent = isBulk
      ? `${normalizedCount} zaznaczonych zdarzeń zostanie trwale usuniętych z ewidencji pracy.`
      : 'Zdarzenie zostanie trwale usunięte z ewidencji pracy.'
    detailLabel.textContent = isBulk ? 'Liczba wybranych rekordów' : 'Identyfikator zdarzenia'
    detailValue.textContent = isBulk ? String(normalizedCount) : String(displayId || '-')
    if (warning) {
      warning.textContent =
        Number(skippedCount) > 0
          ? `Tej operacji nie można cofnąć. Pominięte rekordy bez identyfikatora: ${skippedCount}.`
          : 'Tej operacji nie można cofnąć.'
    }
    setEventEditorButtonLabel(acceptButton, isBulk ? `Usuń ${normalizedCount} zdarzenia` : 'Usuń zdarzenie')
    overlay.style.display = 'flex'

    return new Promise((resolve) => {
      eventDeleteConfirmResolver = resolve
      window.requestAnimationFrame(() => title.focus())
    })
  }

  async function deleteEventEditorItem() {
    if (!appState.session?.orgId || appState.eventEditorMode !== 'edit') {
      return
    }

    if (!canDeleteEvents()) {
      alert('Brak uprawnień do usuwania zdarzeń.')
      return
    }

    const editedRow = appState.eventEditorItem ?? null
    if (!editedRow) {
      return
    }
    if (!eventCanDelete(editedRow)) {
      alert('Ten wiersz pochodzi z rekordu dnia pracy i nie ma osobnego zdarzenia do usuniecia.')
      return
    }
    const eventId = String(editedRow?.eventId ?? editedRow?.workdayId ?? '').trim()
    const targetFingerprint = eventRowFingerprintKey(editedRow)
    const targetDisplayId = eventId || eventDeletionCandidateIds(editedRow)[0] || '-'

    const confirmed = await openEventDeleteConfirmation({ displayId: targetDisplayId })
    if (!confirmed) {
      return
    }

    const deleteButton = document.getElementById('evDeleteBtn')
    if (deleteButton) {
      deleteButton.disabled = true
      setEventEditorButtonLabel(deleteButton, 'Usuwanie...')
    }

    try {
      await deleteEventByCandidateIds(appState.session.orgId, editedRow)
      eventRegisterDeletedRows([editedRow])
      closeEventEditor()
      await fetchEventsForCurrentSession({ resetPage: false, forceRefresh: true })
      await refreshDashboardWidgets({ forceRefresh: true, syncWorktimeToken: true })
      const stillVisible = appState.eventRows.some((row) => eventRowFingerprintKey(row) === targetFingerprint)
      if (stillVisible) {
        showTransientNotice('Usunieto tylko czesc danych. Wpis nadal widoczny na liscie.', 'error')
      } else {
        showTransientNotice('Zdarzenie zostalo usuniete.')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Błąd usuwania zdarzenia.'
      alert(message)
    } finally {
      if (deleteButton) {
        deleteButton.disabled = false
        setEventEditorButtonLabel(deleteButton, 'Usuń zdarzenie')
      }
    }
  }

  async function deleteSelectedEvents() {
    if (!appState.session?.orgId) {
      return
    }

    if (!canDeleteEvents()) {
      alert('Brak uprawnien do usuwania zdarzen.')
      return
    }

    const allSelectedRows = appState.eventRows.filter((row, index) => appState.eventsSelectedKeys.has(eventSelectionKey(row, index)))
    const selectedRows = allSelectedRows.filter((row) => eventCanDelete(row))
    const skippedCount = allSelectedRows.length - selectedRows.length
    if (!allSelectedRows.length) {
      return
    }
    if (!selectedRows.length) {
      showTransientNotice(
        'Zaznaczone wiersze nie maja identyfikatora zdarzenia ani dnia pracy do usuniecia.',
        'error',
      )
      return
    }
    const selectedFingerprintKeys = new Set(selectedRows.map((row) => eventRowFingerprintKey(row)).filter(Boolean))
    const selectedIds = new Set(selectedRows.flatMap((row) => eventDeletionCandidateIds(row)))

    const confirmed = await openEventDeleteConfirmation({
      count: selectedRows.length,
      skippedCount,
    })
    if (!confirmed) {
      return
    }

    const deleteButton = document.getElementById('evDeleteSelectedBtn')
    const defaultLabel = 'Usuń'
    if (deleteButton instanceof HTMLButtonElement) {
      deleteButton.disabled = true
      setEventEditorButtonLabel(deleteButton, 'Usuwanie...')
    }

    try {
      for (const row of selectedRows) {
        await deleteEventByCandidateIds(appState.session.orgId, row)
      }

      eventRegisterDeletedRows(selectedRows)
      appState.eventsSelectedKeys = new Set()
      await fetchEventsForCurrentSession({ resetPage: false, forceRefresh: true })
      await refreshDashboardWidgets({ forceRefresh: true, syncWorktimeToken: true })
      const stillVisibleRows = appState.eventRows.filter((row) => {
        const fingerprint = eventRowFingerprintKey(row)
        if (fingerprint && selectedFingerprintKeys.has(fingerprint)) {
          return true
        }
        const rowIds = eventDeletionCandidateIds(row)
        return rowIds.some((id) => selectedIds.has(id))
      })

      if (stillVisibleRows.length) {
        showTransientNotice(`Nie wszystko usuniete. Nadal widoczne: ${stillVisibleRows.length}.`, 'error')
      } else {
        showTransientNotice('Wybrane zdarzenia zostaly usuniete.')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Blad usuwania zaznaczonych zdarzen.'
      alert(message)
    } finally {
      if (deleteButton instanceof HTMLButtonElement) {
        deleteButton.disabled = false
        setEventEditorButtonLabel(deleteButton, defaultLabel)
      }
      syncEventsSelectionUi()
    }
  }

  function openEventCommentModal(message) {
    ensureEventOverlaysMountedToBody()
    const overlay = document.getElementById('evCommentOverlay')
    const text = document.getElementById('evCommentText')

    if (!overlay || !text) {
      return
    }

    text.textContent = normalizeVisibleEventComment(message) || '-'
    overlay.style.display = 'flex'
  }

  function closeEventCommentModal() {
    const overlay = document.getElementById('evCommentOverlay')
    const text = document.getElementById('evCommentText')

    if (overlay) {
      overlay.style.display = 'none'
    }

    if (text) {
      text.textContent = '-'
    }
  }

  function syncEventsActionPermissions() {
    const addButton = document.getElementById('evAddBtn')
    if (addButton) {
      addButton.style.display = canManageEvents() ? '' : 'none'
    }
    syncEventsSelectionUi()
  }

  function syncEventsMonthControl() {
    const month = document.getElementById('evMonth')
    const fromValue = String(document.getElementById('evFrom')?.value ?? '').trim()
    const toValue = String(document.getElementById('evTo')?.value ?? '').trim()
    if (!(month instanceof HTMLInputElement)) {
      return
    }

    const fromMonth = fromValue.match(/^(\d{4}-\d{2})-\d{2}$/)?.[1] ?? ''
    const toMonth = toValue.match(/^(\d{4}-\d{2})-\d{2}$/)?.[1] ?? ''
    month.value = fromMonth && fromMonth === toMonth ? fromMonth : ''
  }

  function applyEventsMonthControl() {
    const monthValue = String(document.getElementById('evMonth')?.value ?? '').trim()
    const match = monthValue.match(/^(\d{4})-(\d{2})$/)
    if (!match) {
      return false
    }

    const year = Number(match[1])
    const month = Number(match[2])
    const lastDay = new Date(year, month, 0).getDate()
    const from = document.getElementById('evFrom')
    const to = document.getElementById('evTo')
    if (from) from.value = `${match[1]}-${match[2]}-01`
    if (to) to.value = `${match[1]}-${match[2]}-${String(lastDay).padStart(2, '0')}`
    return true
  }

  function ensureEventsDefaultDates() {
    const from = document.getElementById('evFrom')
    const to = document.getElementById('evTo')
    if (!from || !to) {
      return
    }

    if (!String(from.value ?? '').trim()) {
      from.value = firstDayOfCurrentMonthYmd()
    }

    if (!String(to.value ?? '').trim()) {
      to.value = todayYmd()
    }
    syncEventsMonthControl()
  }

  function readEventsFilterInputs() {
    const from = document.getElementById('evFrom')
    const to = document.getElementById('evTo')
    const worker = document.getElementById('evWorker')
    const zone = document.getElementById('evStrefa')
    const client = document.getElementById('evPom')
    const room = document.getElementById('evRoomId')
    const status = document.getElementById('evStatus')
    const q = document.getElementById('evQ')
    const selectedWorkerOption = worker instanceof HTMLSelectElement ? worker.selectedOptions[0] : null
    const workerValue = String(
      selectedWorkerOption?.value || worker?.dataset?.pendingFilterValue || worker?.value || '',
    ).trim()
    const workerLogin =
      String(selectedWorkerOption?.dataset?.workerLogin ?? worker?.dataset?.pendingWorkerLogin ?? '').trim() ||
      (workerValue && workerValue === String(appState.eventsWorkerLoginFilterText ?? '').trim()
        ? String(appState.eventsWorkerLoginFilter ?? '').trim()
        : '')

    return {
      from: String(from?.value ?? '').trim(),
      to: String(to?.value ?? '').trim(),
      worker: workerValue,
      workerLogin,
      strefa: String(zone?.value || zone?.dataset?.pendingFilterValue || '').trim(),
      pomieszczenie: String(client?.value || client?.dataset?.pendingFilterValue || '').trim(),
      roomId: String(room?.value ?? '').trim(),
      status: String(status?.value ?? '').trim(),
      q: String(q?.value ?? '').trim(),
    }
  }

  function applyEventsFilterInputs(filters = {}) {
    const from = document.getElementById('evFrom')
    const to = document.getElementById('evTo')
    const worker = document.getElementById('evWorker')
    const zone = document.getElementById('evStrefa')
    const client = document.getElementById('evPom')
    const room = document.getElementById('evRoomId')
    const status = document.getElementById('evStatus')
    const q = document.getElementById('evQ')

    if (from) from.value = String(filters.from ?? '')
    if (to) to.value = String(filters.to ?? '')
    if (worker instanceof HTMLSelectElement) {
      setEventsFilterSelectValue(worker, filters.worker, filters.workerLogin)
    } else if (worker) {
      eventsFilterComboSetValue('worker', filters.worker, filters.workerLogin)
    }
    appState.eventsWorkerLoginFilter = String(filters.workerLogin ?? '').trim()
    appState.eventsWorkerLoginFilterText = String(filters.worker ?? '').trim()
    if (zone instanceof HTMLSelectElement) {
      setEventsFilterSelectValue(zone, filters.strefa)
    } else if (zone) {
      eventsFilterComboSetValue('zone', filters.strefa)
    }
    if (client instanceof HTMLSelectElement) {
      setEventsFilterSelectValue(client, filters.pomieszczenie)
    } else if (client) {
      eventsFilterComboSetValue('client', filters.pomieszczenie)
    }
    if (room) room.value = String(filters.roomId ?? '')
    if (status) status.value = String(filters.status ?? '')
    if (q) q.value = String(filters.q ?? '')
    syncEventsMonthControl()
  }

  function resetEventsFilters() {
    ;['worker', 'zone', 'client'].forEach((kind) => {
      eventsFilterComboClose(kind)
    })
    clearOpenEventIntegrityFocus()
    applyEventsFilterInputs({
      from: firstDayOfCurrentMonthYmd(),
      to: todayYmd(),
      worker: '',
      workerLogin: '',
      strefa: '',
      pomieszczenie: '',
      roomId: '',
      status: '',
      q: '',
    })
    appState.eventsPage = 1
    appState.eventsSelectedKeys = new Set()
    syncEventsSelectionUi()
    void fetchEventsForCurrentSession({ resetPage: false })
  }

  function readEventsFilters() {
    const raw = readEventsFilterInputs()

    return {
      source: 'events',
      fromIso: ymdToIsoRangeStart(raw.from),
      toIso: ymdToIsoRangeEnd(raw.to),
      worker: raw.workerLogin ? '' : raw.worker,
      workerLogin: raw.workerLogin,
      strefa: raw.strefa,
      pomieszczenie: raw.pomieszczenie,
      roomId: raw.roomId,
      status: raw.status,
      q: raw.q,
      page: appState.eventsPage,
      pageSize: normalizeEventsPageSize(appState.eventsPageSize),
    }
  }

  function updateEventsPager(shown) {
    const pageLabel = document.getElementById('evPageLabel')
    const shownLabel = document.getElementById('evShownLabel')
    const tableCount = document.getElementById('evTableCount')
    const prevBtn = document.getElementById('evPrevBtn')
    const nextBtn = document.getElementById('evNextBtn')
    const hasNext = appState.eventsHasNext === true
    const estimatedTotal = appState.eventsEstimatedTotal === true
    const pageTotalLabel = estimatedTotal && hasNext ? `${appState.eventsTotalPages}+` : appState.eventsTotalPages
    const totalLabel = estimatedTotal ? `${Math.max(0, Number(appState.eventsTotal ?? 0) - 1)}+` : appState.eventsTotal

    if (pageLabel) {
      pageLabel.textContent = `Strona ${appState.eventsPage} / ${pageTotalLabel}`
    }

    if (shownLabel) {
      shownLabel.textContent = `Wyświetlono: ${shown} · Wszystkie: ${totalLabel} · Na stronie: ${appState.eventsPageSize}`
    }

    if (tableCount) {
      const count = estimatedTotal ? totalLabel : Number(appState.eventsTotal ?? shown)
      const numericCount = Number(count)
      const pluralLabel =
        numericCount === 1
          ? 'zdarzenie'
          : Number.isFinite(numericCount) &&
              numericCount % 10 >= 2 &&
              numericCount % 10 <= 4 &&
              (numericCount % 100 < 12 || numericCount % 100 > 14)
            ? 'zdarzenia'
            : 'zdarzeń'
      tableCount.textContent = `${count} ${pluralLabel}`
    }

    if (prevBtn) {
      prevBtn.disabled = appState.eventsPage <= 1
    }

    if (nextBtn) {
      nextBtn.disabled = !hasNext && appState.eventsPage >= appState.eventsTotalPages
    }
  }

  const EVENTS_EXPORT_COLUMNS = [
    {
      label: 'Pracownik',
      width: '*',
      getValue: (row) => String(row?.workerName ?? row?.workerLogin ?? '-').trim() || '-',
    },
    {
      label: 'Klient',
      width: '*',
      getValue: (row) => {
        const qrCandidate = eventActualQrCodeFromRow(row) || zoneQrCodeFromRow(row)
        return resolveClientLabelWithQrFallback(String(row?.clientName ?? row?.klient ?? '-').trim() || '-', qrCandidate)
      },
    },
    {
      label: 'Strefa',
      width: '*',
      getValue: (row) => eventResolveZoneLabel(row),
    },
    {
      label: 'QR',
      width: 38,
      getValue: (row) => zoneQrCodeFromRow(row) || '-',
    },
    {
      label: 'Lokalizacja',
      width: '*',
      getValue: (row) => String(row?.lokalizacja ?? row?.location ?? '-').trim() || '-',
    },
    {
      label: 'Data',
      width: 48,
      getValue: (row) => String(row?.date ?? '-').trim() || '-',
    },
    {
      label: 'Start',
      width: 35,
      getValue: (row) => dashboardClockLabelToHm(row?.start, '-'),
    },
    {
      label: 'Stop',
      width: 35,
      getValue: (row) => dashboardClockLabelToHm(row?.stop, '-'),
    },
    {
      label: 'Czas',
      width: 38,
      getValue: (row) => dashboardDurationLabelToHm(row?.duration, '00:00'),
    },
    {
      label: 'Typ',
      width: 46,
      getValue: (row) => eventTypeInfo(row).label,
    },
    {
      label: 'Komentarz',
      width: '*',
      getValue: (row) => normalizeVisibleEventComment(row?.comment) || '-',
    },
    {
      label: 'Edytował',
      width: 46,
      getValue: (row) => String(row?.editedBy ?? '-').trim() || '-',
    },
  ]

  function eventExportCellLooksLikeError(value) {
    const text = String(value ?? '').trim().toLowerCase()
    if (!text) {
      return false
    }

    return (
      (text.includes('"error"') && text.includes('"code"')) ||
      (text.includes('operation "') && text.includes('not found')) ||
      text.includes('"status":"not_found"') ||
      text.includes('"code":404')
    )
  }

  function normalizeEventsExportRows(rows = []) {
    return (Array.isArray(rows) ? rows : []).filter((row) => {
      const candidates = [
        row?.workerLogin,
        row?.workerName,
        row?.klient,
        row?.clientName,
        row?.strefa,
        row?.zoneName,
        row?.lokalizacja,
        row?.roomId,
        row?.zoneId,
      ]
      return !candidates.some((value) => eventExportCellLooksLikeError(value))
    })
  }

  function eventsExportRowsToMatrix(rows = []) {
    return normalizeEventsExportRows(rows).map((row) =>
      EVENTS_EXPORT_COLUMNS.map((column) => String(column.getValue(row) ?? '').trim() || '-'),
    )
  }

  function eventsExportFilenameBase() {
    const focusedGroup = eventOpenIntegrityFocusedGroup()
    if (focusedGroup) {
      const worker = workerDetailSanitizeFilename(focusedGroup.workerLabel || focusedGroup.workerKey) || 'pracownik'
      const kind = workerDetailSanitizeFilename(focusedGroup.integrityKind) || 'diagnostyka'
      return `zdarzenia-${kind}-${worker}`
    }

    const filters = readEventsFilterInputs()
    const from = workerDetailSanitizeFilename(filters.from || firstDayOfCurrentMonthYmd()) || 'od'
    const to = workerDetailSanitizeFilename(filters.to || todayYmd()) || 'do'
    return `zdarzenia-${from}_${to}`
  }

  function eventsExportFiltersSummary() {
    const focusedGroup = eventOpenIntegrityFocusedGroup()
    if (focusedGroup) {
      const typeLabel =
        focusedGroup.integrityKind === 'conflict'
          ? 'otwarte CLEAN'
          : focusedGroup.integrityKind === 'orphan'
            ? 'otwarty CLEAN bez aktywnego dnia pracy'
          : focusedGroup.integrityKind === 'unresolved'
            ? 'nierozstrzygnięte wpisy bez typu'
            : 'historyczne wpisy do klasyfikacji'
      return `Widok diagnostyczny: ${typeLabel} | Pracownik: ${focusedGroup.workerLabel} | Rekordy: ${focusedGroup.count}`
    }

    const filters = readEventsFilterInputs()
    const entries = [
      ['Od', filters.from || '-'],
      ['Do', filters.to || '-'],
      ['Pracownik', filters.worker || '-'],
      ['Klient', filters.pomieszczenie || '-'],
      ['Strefa', filters.strefa || '-'],
      ['Kod QR', filters.roomId || '-'],
      ['Status', filters.status || 'wszystkie'],
      ['Szukaj', filters.q || '-'],
    ]
    return entries.map(([label, value]) => `${label}: ${value}`).join(' | ')
  }

  async function fetchEventsExportRows() {
    const focusedGroup = eventOpenIntegrityFocusedGroup()
    if (focusedGroup) {
      return normalizeEventsExportRows(focusedGroup.rows)
    }

    if (!appState.session?.orgId) {
      throw new Error('Brak aktywnej sesji.')
    }

    ensureEventsDefaultDates()
    appState.eventsFilters = readEventsFilterInputs()
    await ensureEventReferenceDataLoaded()

    const pageSize = Math.max(Number(appState.eventsTotal ?? 0) || 0, 100000)
    const response = await getWorkdays(appState.session.orgId, {
      ...readEventsFilters(),
      page: 1,
      pageSize,
    })

    return normalizeEventsExportRows(response?.items ?? [])
  }

  function downloadEventsExcel(rows = []) {
    const matrix = eventsExportRowsToMatrix(rows)
    const headers = EVENTS_EXPORT_COLUMNS.map((column) => column.label)
    const cellHtml = (value, tag = 'td') =>
      `<${tag} class="text">${escapeHtml(value).replaceAll('\n', '<br />')}</${tag}>`
    const tableRows = [
      `<tr>${headers.map((header) => cellHtml(header, 'th')).join('')}</tr>`,
      ...matrix.map((row) => `<tr>${row.map((value) => cellHtml(value)).join('')}</tr>`),
    ].join('')
    const html = `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: Arial, sans-serif; }
      table { border-collapse: collapse; width: 100%; }
      th { background: #eef4ff; font-weight: 700; }
      th, td { border: 1px solid #cfd8e8; padding: 6px; vertical-align: top; }
      .text { mso-number-format: "\\@"; }
    </style>
  </head>
  <body>
    <h2>Zdarzenia</h2>
    <p>${escapeHtml(eventsExportFiltersSummary())}</p>
    <p>Wygenerowano: ${escapeHtml(formatDatePl(new Date().toISOString()))} ${escapeHtml(formatTime(new Date().toISOString()))}</p>
    <table>${tableRows}</table>
  </body>
  </html>`
    const blob = new Blob([`\ufeff${html}`], { type: 'application/vnd.ms-excel;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${eventsExportFilenameBase()}.xls`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  async function downloadEventsPdf(rows = []) {
    const matrix = eventsExportRowsToMatrix(rows)
    const pdfMake = await ensurePdfMakeLoaded()
    const body = [
      EVENTS_EXPORT_COLUMNS.map((column) => ({ text: column.label, style: 'tableHeader' })),
      ...matrix.map((row) => row.map((value) => ({ text: value, style: 'tableCell' }))),
    ]

    const docDefinition = {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [18, 20, 18, 20],
      defaultStyle: {
        font: 'Roboto',
        fontSize: 7,
      },
      content: [
        { text: 'Zdarzenia', style: 'title' },
        { text: eventsExportFiltersSummary(), style: 'subtitle' },
        { text: `Liczba rekordów: ${matrix.length}`, style: 'subtitle', margin: [0, 0, 0, 8] },
        {
          table: {
            headerRows: 1,
            widths: EVENTS_EXPORT_COLUMNS.map((column) => column.width),
            body,
          },
          layout: {
            fillColor: (rowIndex) => (rowIndex === 0 ? '#eef4ff' : rowIndex % 2 === 0 ? '#f8fbff' : null),
            hLineColor: () => '#dbe4f0',
            vLineColor: () => '#dbe4f0',
            paddingLeft: () => 4,
            paddingRight: () => 4,
            paddingTop: () => 3,
            paddingBottom: () => 3,
          },
        },
      ],
      styles: {
        title: { fontSize: 15, bold: true, margin: [0, 0, 0, 4] },
        subtitle: { fontSize: 8, color: '#475569', margin: [0, 0, 0, 3] },
        tableHeader: { bold: true, color: '#334155', fontSize: 7 },
        tableCell: { fontSize: 6.5, color: '#0f172a' },
      },
    }

    pdfMake.createPdf(docDefinition).download(`${eventsExportFilenameBase()}.pdf`)
  }

  async function downloadEventsExport(format = 'excel') {
    const normalized = String(format ?? '').trim().toLowerCase() === 'pdf' ? 'pdf' : 'excel'
    const buttons = [
      document.getElementById('evExportPdfBtn'),
      document.getElementById('evExportExcelBtn'),
    ].filter((button) => button instanceof HTMLButtonElement)
    const trigger = document.getElementById(normalized === 'pdf' ? 'evExportPdfBtn' : 'evExportExcelBtn')
    const previousText = trigger?.textContent ?? ''

    buttons.forEach((button) => {
      button.disabled = true
      button.setAttribute('aria-busy', 'true')
    })
    if (trigger) {
      trigger.textContent = 'Eksport...'
    }

    try {
      const rows = await fetchEventsExportRows()
      if (!rows.length) {
        showTransientNotice('Brak zdarzeń do eksportu dla wybranych filtrów.', 'error')
        return
      }

      if (normalized === 'pdf') {
        await downloadEventsPdf(rows)
      } else {
        downloadEventsExcel(rows)
      }

      showTransientNotice(`Eksport zdarzeń gotowy (${rows.length}).`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udało się wyeksportować zdarzeń.'
      showTransientNotice(message, 'error')
    } finally {
      buttons.forEach((button) => {
        button.disabled = false
        button.setAttribute('aria-busy', 'false')
      })
      if (trigger) {
        trigger.textContent = previousText || (normalized === 'pdf' ? 'PDF' : 'Excel')
      }
    }
  }

  async function fetchEventsForCurrentSession(options = {}) {
    if (eventsRefreshInFlight) {
      queueEventsRefresh(options)
      return eventsRefreshInFlight
    }

    const runOptions = { ...options }
    eventsRefreshInFlight = (async () => {
      try {
        return await fetchEventsForCurrentSessionNow(runOptions)
      } finally {
        eventsRefreshInFlight = null
        const queuedOptions = eventsRefreshQueuedOptions
        eventsRefreshQueuedOptions = null
        if (queuedOptions) {
          void fetchEventsForCurrentSession(queuedOptions)
        }
      }
    })()

    return eventsRefreshInFlight
  }

  async function fetchEventsForCurrentSessionNow({ resetPage = false, applyStoredFilters = false, forceRefresh = false, silent = false } = {}) {
    const root = document.getElementById('evRows')

    if (eventsOpenIntegrityFocus) {
      clearOpenEventIntegrityFocus()
    }

    if (!appState.session?.orgId) {
      appState.eventsSelectedKeys = new Set()
      renderEventsSummary([], [])
      eventsOpenIntegrityRefreshGeneration += 1
      eventsOpenIntegrityRefreshPromise = null
      eventsOpenIntegrityRefreshOrgId = ''
      eventsOpenIntegrityGroups = []
      eventsOpenCleanOrphanGroups = []
      eventsUnresolvedLegacyGroups = []
      eventsLegacyOpenGroups = []
      renderOpenEventIntegrity()
      if (root && !silent) {
        root.innerHTML = `
          <div class="events-row events-row--empty">
            <div class="events-empty-state is-error">
              <span aria-hidden="true"><i class="ph ph-warning-circle"></i></span>
              <strong>Brak aktywnej sesji</strong>
              <small>Zaloguj się ponownie, aby pobrać zdarzenia.</small>
            </div>
          </div>
        `
      }
      syncEventsSelectionUi()
      return
    }

    if (applyStoredFilters && appState.eventsFilters) {
      applyEventsFilterInputs(appState.eventsFilters)
    }

    if (!appState.eventsFilters) {
      ensureEventsDefaultDates()
    }

    appState.eventsFilters = readEventsFilterInputs()
    syncEventsActionPermissions()

    if (resetPage) {
      appState.eventsPage = 1
    }

    if (root && !silent) {
      root.innerHTML = `
        <div class="events-row events-row--empty">
          <div class="events-empty-state is-loading">
            <span aria-hidden="true"><i class="ph ph-spinner-gap"></i></span>
            <strong>Ładowanie zdarzeń</strong>
            <small>Aktualizujemy wyniki dla wybranych filtrów.</small>
          </div>
        </div>
      `
    }

    try {
      void ensureEventReferenceDataLoaded().catch((error) => {
        console.warn('[events] reference preload failed', error)
      })
      const filters = readEventsFilters()
      const response = await getWorkdays(appState.session.orgId, {
        ...filters,
        forceRefresh,
      })
      appState.eventsPage = response.page
      const responsePageSize = Number(response.pageSize)
      appState.eventsPageSize = normalizeEventsPageSize(responsePageSize)
      const merged = eventMergePendingRowsForCurrentView(response.items)
      appState.eventsHasNext = response.hasNext === true
      appState.eventsEstimatedTotal = response.estimatedTotal === true
      appState.eventsTotal = Number(response.total ?? 0) + merged.pendingCount
      const responseTotalPages = Number(response.totalPages)
      appState.eventsTotalPages =
        Number.isFinite(responseTotalPages) && responseTotalPages > 0
          ? Math.floor(responseTotalPages)
          : Math.max(1, Math.ceil(appState.eventsTotal / appState.eventsPageSize))

      renderEventsRows(merged.rows)
      updateEventsPager(merged.rows.length)
      syncEventsPageSizeControl()
      setSubwelcomeMetric('#view-events .subwelcome', appState.eventsTotal)
      if (!silent || forceRefresh) {
        void refreshEventsSummaryCards({ ...filters, forceRefresh })
      }
      void rememberEventsFingerprintForCurrentFilters()
      void refreshOpenEventIntegrity({ forceRefresh }).catch((error) => {
        console.warn('[events] open status integrity refresh failed', error)
      })
    } catch (error) {
      if (silent) {
        console.warn('[events] silent refresh failed', error)
        return
      }
      const message = error instanceof Error ? error.message : 'Błąd pobierania zdarzeń.'
      appState.eventRows = []
      appState.eventsSelectedKeys = new Set()
      if (root) {
        root.innerHTML = `
          <div class="events-row events-row--empty">
            <div class="events-empty-state is-error">
              <span aria-hidden="true"><i class="ph ph-warning-circle"></i></span>
              <strong>Nie udało się pobrać zdarzeń</strong>
              <small>${escapeHtml(message)}</small>
            </div>
          </div>
        `
      }
      syncEventsSelectionUi()
    }
  }

  async function readEventsFingerprintTokenForCurrentFilters() {
    if (typeof getEventsFingerprintForOrg !== 'function' || !appState.session?.orgId) {
      return ''
    }

    const fingerprint = await getEventsFingerprintForOrg(appState.session.orgId, readEventsFilters())
    if (fingerprint?.unavailable) {
      return null
    }

    return String(fingerprint?.token ?? '').trim()
  }

  async function rememberEventsFingerprintForCurrentFilters() {
    try {
      const token = await readEventsFingerprintTokenForCurrentFilters()
      if (token) {
        eventsLastFingerprintToken = token
      }
    } catch (error) {
      console.warn('[events] fingerprint snapshot failed', error)
    }
  }

  async function refreshEventsIfFingerprintChanged() {
    if (!document.getElementById('evRows')) {
      return
    }

    if (eventsOpenIntegrityFocus) {
      try {
        await refreshOpenEventIntegrity({ forceRefresh: true, rerenderRows: true })
      } catch (error) {
        console.warn('[events] focused open status refresh failed', error)
      }
      return
    }

    let token = ''
    try {
      token = await readEventsFingerprintTokenForCurrentFilters()
    } catch (error) {
      console.warn('[events] fingerprint polling failed', error)
    }

    if (token === null) {
      return
    }

    if (!token) {
      await fetchEventsForCurrentSession({ forceRefresh: true, silent: true })
      return
    }

    if (!eventsLastFingerprintToken) {
      eventsLastFingerprintToken = token
      return
    }

    if (eventsLastFingerprintToken !== token) {
      eventsLastFingerprintToken = token
      await fetchEventsForCurrentSession({ forceRefresh: true, silent: true })
    }
  }

  function startEventsPolling() {
    if (typeof window === 'undefined' || eventsPollingTimer) {
      return
    }
    eventsPollingTimer = window.setInterval(() => {
      if (!document.getElementById('evRows')) {
        return
      }
      void refreshEventsIfFingerprintChanged()
    }, EVENTS_REFRESH_POLL_MS)
  }

  function stopEventsPolling() {
    if (!eventsPollingTimer || typeof window === 'undefined') {
      eventsPollingTimer = 0
      return
    }
    window.clearInterval(eventsPollingTimer)
    eventsPollingTimer = 0
  }

  async function ensureEventReferenceDataLoaded() {
    if (!appState.session?.orgId) {
      return
    }

    if (appState.workersLoaded && appState.clientsLoaded && appState.zonesLoaded) {
      fillEventsClientFilterDatalist()
      return
    }

    if (!eventReferenceLoadPromise) {
      const loaders = []

      if (!appState.workersLoaded) {
        loaders.push(
          getWorkers(appState.session.orgId).then((workers) => {
            appState.workers = workers
            appState.workersLoaded = true
          }),
        )
      }

      if (!appState.clientsLoaded) {
        loaders.push(
          getClients(appState.session.orgId).then((clients) => {
            appState.clients = clients
            appState.clientsLoaded = true
          }),
        )
      }

      if (!appState.zonesLoaded) {
        loaders.push(
          getZones(appState.session.orgId).then((zones) => {
            appState.zones = zones
            appState.zonesLoaded = true
          }),
        )
      }

      eventReferenceLoadPromise = Promise.all(loaders)
        .then(() => {
          eventEditorOptionsCache = null
          eventEditorOptionsCacheKey = ''
          fillEventsClientFilterDatalist()
        })
        .finally(() => {
          eventReferenceLoadPromise = null
        })
    }

    await eventReferenceLoadPromise
  }


  function bindEventsViewFunctions() {
    const binding = createBindingHelpers()
    ensureEventOverlaysMountedToBody()
    const cleanupEventsTableResize = setupResizableGridTable({
      tableSelector: '#view-events .events-table',
      headSelector: '#view-events .events-head',
      cssVarName: '--events-grid',
      storageKey: 'portal.grid.events.v11',
      defaultWidths: [34, 150, 130, 145, 115, 110, 80, 80, 84, 64, 92, 116, 56],
      minWidths: [30, 128, 116, 130, 100, 100, 74, 74, 76, 58, 78, 102, 56],
      nonResizableIndexes: [0, 12],
      autoFitToViewport: true,
      enforceFullWidth: true,
      maxWidth: 680,
    })
    syncEventsActionPermissions()
    syncEventsPageSizeControl()
    ;['worker', 'zone', 'client'].forEach((kind) => bindEventsFilterCombo(binding, kind))

    binding.add(document.getElementById('evSearchBtn'), 'click', () => {
      ;['worker', 'zone', 'client'].forEach((kind) => eventsFilterComboClose(kind, { restoreSelection: true }))
      clearOpenEventIntegrityFocus()
      appState.eventsPage = 1
      void fetchEventsForCurrentSession({ resetPage: false })
    })

    binding.add(document.getElementById('evPageSize'), 'change', (event) => {
      appState.eventsPageSize = normalizeEventsPageSize(event.target?.value)
      appState.eventsPage = 1
      syncEventsPageSizeControl()
      if (eventsOpenIntegrityFocus) {
        renderOpenIntegrityFocusPage()
        return
      }
      void fetchEventsForCurrentSession({ resetPage: false })
    })

    binding.add(document.getElementById('evResetBtn'), 'click', () => {
      clearOpenEventIntegrityFocus()
      void fetchEventsForCurrentSession({ resetPage: true, forceRefresh: true })
    })
    binding.add(document.getElementById('evClearFiltersBtn'), 'click', resetEventsFilters)
    binding.add(document.getElementById('evExportPdfBtn'), 'click', () => {
      void downloadEventsExport('pdf')
    })
    binding.add(document.getElementById('evExportExcelBtn'), 'click', () => {
      void downloadEventsExport('excel')
    })

    binding.add(document.getElementById('evPrevBtn'), 'click', () => {
      if (appState.eventsPage <= 1) return
      appState.eventsPage -= 1
      if (eventsOpenIntegrityFocus) {
        renderOpenIntegrityFocusPage()
        return
      }
      void fetchEventsForCurrentSession()
    })

    binding.add(document.getElementById('evNextBtn'), 'click', () => {
      if (appState.eventsHasNext !== true && appState.eventsPage >= appState.eventsTotalPages) return
      appState.eventsPage += 1
      if (eventsOpenIntegrityFocus) {
        renderOpenIntegrityFocusPage()
        return
      }
      void fetchEventsForCurrentSession()
    })

    binding.add(document.getElementById('evStatus'), 'change', () => {
      clearOpenEventIntegrityFocus()
      appState.eventsPage = 1
      void fetchEventsForCurrentSession({ resetPage: false })
    })
    binding.add(document.getElementById('evMonth'), 'change', () => {
      if (!applyEventsMonthControl()) return
      appState.eventsPage = 1
      void fetchEventsForCurrentSession({ resetPage: false })
    })
    ;['evFrom', 'evTo'].forEach((id) => {
      binding.add(document.getElementById(id), 'change', syncEventsMonthControl)
    })
    binding.add(document.getElementById('evWorker'), 'change', (event) => {
      const control = event.currentTarget
      const option = control instanceof HTMLSelectElement ? control.selectedOptions[0] : null
      appState.eventsWorkerLoginFilter = String(
        option?.dataset?.workerLogin ?? control?.dataset?.pendingWorkerLogin ?? '',
      ).trim()
      appState.eventsWorkerLoginFilterText = String(option?.value ?? control?.value ?? '').trim()
    })

    binding.add(document.getElementById('evAddBtn'), 'click', () => {
      void openCreateEventEditor()
    })
    binding.add(document.getElementById('evOpenStatusIntegrity'), 'click', (event) => {
      const backButton = event.target?.closest?.('[data-event-open-back]')
      if (backButton) {
        clearOpenEventIntegrityFocus()
        void fetchEventsForCurrentSession({ resetPage: false, forceRefresh: true })
        return
      }

      const categoryButton = event.target?.closest?.('[data-event-integrity-kind]')
      if (!categoryButton) {
        return
      }

      const integrityKind = String(categoryButton.getAttribute('data-event-integrity-kind') ?? '').trim()
      openEventIntegrityModal(integrityKind, categoryButton)
    })
    binding.add(document.getElementById('evIntegrityModalOverlay'), 'click', (event) => {
      if (event.target?.id === 'evIntegrityModalOverlay') {
        closeEventIntegrityModal()
        return
      }

      const button = event.target?.closest?.('[data-event-open-worker-key]')
      if (!button) {
        return
      }

      const workerKey = String(button.getAttribute('data-event-open-worker-key') ?? '').trim()
      const integrityKind = String(button.getAttribute('data-event-open-kind') ?? '').trim()
      const group =
        eventOpenIntegrityAllGroups().find(
          (item) =>
            item?.workerKey === workerKey &&
            (!integrityKind || item?.integrityKind === integrityKind),
        ) ?? null
      if (!group) {
        return
      }

      focusEventIntegrityGroup(group)
    })
    binding.add(document.getElementById('evIntegrityModalCloseBtn'), 'click', () => {
      closeEventIntegrityModal()
    })
    binding.add(document.getElementById('evIntegrityModalCancelBtn'), 'click', () => {
      closeEventIntegrityModal()
    })
    binding.add(document.getElementById('evDeleteSelectedBtn'), 'click', () => {
      void deleteSelectedEvents()
    })
    binding.add(document.getElementById('evSelectAll'), 'change', (event) => {
      const input = event.target
      if (!(input instanceof HTMLInputElement)) {
        return
      }
      if (!canDeleteEvents()) {
        input.checked = false
        input.indeterminate = false
        return
      }

      if (input.checked) {
        appState.eventRows.forEach((row, index) => {
          if (eventCanDelete(row)) {
            appState.eventsSelectedKeys.add(eventSelectionKey(row, index))
          }
        })
      } else {
        appState.eventRows.forEach((row, index) => {
          appState.eventsSelectedKeys.delete(eventSelectionKey(row, index))
        })
      }
      renderEventsRows(appState.eventRows)
    })

    ;['evFrom', 'evTo', 'evRoomId', 'evQ'].forEach((id) => {
      binding.add(document.getElementById(id), 'keydown', (event) => {
        if (event.key !== 'Enter') return
        clearOpenEventIntegrityFocus()
        appState.eventsPage = 1
        void fetchEventsForCurrentSession({ resetPage: false })
      })
    })

    binding.add(document, 'pointerdown', (event) => {
      const insideCombo = event.target?.closest?.('[data-events-filter-combo]')
      if (insideCombo) return
      ;['worker', 'zone', 'client'].forEach((kind) => eventsFilterComboClose(kind, { restoreSelection: true }))
    })

    binding.add(document.getElementById('evRows'), 'change', (event) => {
      const input = event.target?.closest?.('[data-event-select-index]')
      if (!(input instanceof HTMLInputElement)) {
        return
      }
      if (!canDeleteEvents()) {
        input.checked = false
        return
      }

      const index = Number(input.getAttribute('data-event-select-index'))
      const row = Number.isInteger(index) ? appState.eventRows[index] : null
      if (!row) {
        return
      }
      const rowKey = eventSelectionKey(row, index)
      if (input.checked) {
        appState.eventsSelectedKeys.add(rowKey)
      } else {
        appState.eventsSelectedKeys.delete(rowKey)
      }
      renderEventsRows(appState.eventRows)
    })

    binding.add(document.getElementById('evRows'), 'click', (event) => {
      const gpsButton = event.target.closest('[data-event-gps][data-rep-geo-lat][data-rep-geo-lon]')
      if (gpsButton) {
        event.preventDefault()
        event.stopPropagation()
        const coords = reportGeoReadCoordsFromNode(gpsButton)
        if (coords) {
          reportGeoOpenModal(coords.lat, coords.lon)
        }
        return
      }

      const workerHistoryButton = event.target.closest('[data-event-history-worker]')
      if (workerHistoryButton) {
        const index = Number(workerHistoryButton.getAttribute('data-event-history-worker'))
        const row = Number.isInteger(index) ? appState.eventRows[index] : null
        if (row) {
          void openEventHistoryFromRow(row, 'workers')
        }
        return
      }

      const clientHistoryButton = event.target.closest('[data-event-history-client]')
      if (clientHistoryButton) {
        const index = Number(clientHistoryButton.getAttribute('data-event-history-client'))
        const row = Number.isInteger(index) ? appState.eventRows[index] : null
        if (row) {
          void openEventHistoryFromRow(row, 'objects')
        }
        return
      }

      const zoneHistoryButton = event.target.closest('[data-event-history-zone]')
      if (zoneHistoryButton) {
        const index = Number(zoneHistoryButton.getAttribute('data-event-history-zone'))
        const row = Number.isInteger(index) ? appState.eventRows[index] : null
        if (row) {
          void openEventHistoryFromRow(row, 'zones')
        }
        return
      }

      const commentButton = event.target.closest('[data-event-comment]')
      if (commentButton) {
        const index = Number(commentButton.getAttribute('data-event-comment'))
        const row = Number.isInteger(index) ? appState.eventRows[index] : null
        if (row) {
          const visibleComment = normalizeVisibleEventComment(row.comment)
          if (visibleComment) {
            openEventCommentModal(visibleComment)
          }
        }
        return
      }

      const editButton = event.target.closest('[data-event-edit]')
      if (!editButton) {
        return
      }

      const index = Number(editButton.getAttribute('data-event-edit'))
      const row = Number.isInteger(index) ? appState.eventRows[index] : null
      if (!row) {
        return
      }

      void openEventEditor(row)
    })
    binding.add(document.getElementById('evRows'), 'mouseover', (event) => {
      const gpsButton = event.target.closest('[data-event-gps][data-rep-geo-lat][data-rep-geo-lon]')
      if (!gpsButton) {
        return
      }

      const coords = reportGeoReadCoordsFromNode(gpsButton)
      if (coords) {
        reportGeoShowPreview(gpsButton, coords.lat, coords.lon)
      }
    })
    binding.add(document.getElementById('evRows'), 'mouseout', (event) => {
      const gpsButton = event.target.closest('[data-event-gps][data-rep-geo-lat][data-rep-geo-lon]')
      if (!gpsButton) {
        return
      }

      const related = event.relatedTarget
      if (related && gpsButton.contains(related)) {
        return
      }

      reportGeoHidePreviewSoon()
    })

    binding.add(document.getElementById('evCommentCloseBtn'), 'click', closeEventCommentModal)
    binding.add(document.getElementById('evCommentOverlay'), 'click', (event) => {
      if (event.target?.id === 'evCommentOverlay') closeEventCommentModal()
    })
    binding.add(document, 'keydown', (event) => {
      if (!eventIntegrityModalIsOpen()) {
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        closeEventIntegrityModal()
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const focusableElements = eventIntegrityModalFocusableElements()
      if (!focusableElements.length) {
        event.preventDefault()
        document.getElementById('evIntegrityModalTitle')?.focus()
        return
      }

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]
      if (event.shiftKey && (document.activeElement === firstElement || document.activeElement === document.getElementById('evIntegrityModalTitle'))) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    })
    binding.add(document.getElementById('evDeleteConfirmCloseBtn'), 'click', () => {
      closeEventDeleteConfirmation(false)
    })
    binding.add(document.getElementById('evDeleteConfirmCancelBtn'), 'click', () => {
      closeEventDeleteConfirmation(false)
    })
    binding.add(document.getElementById('evDeleteConfirmAcceptBtn'), 'click', () => {
      closeEventDeleteConfirmation(true)
    })
    binding.add(document.getElementById('evDeleteConfirmOverlay'), 'click', (event) => {
      if (event.target?.id === 'evDeleteConfirmOverlay') {
        closeEventDeleteConfirmation(false)
      }
    })
    binding.add(document, 'keydown', (event) => {
      if (event.key !== 'Escape') {
        return
      }
      const overlay = document.getElementById('evDeleteConfirmOverlay')
      if (overlay?.style.display === 'flex') {
        event.preventDefault()
        closeEventDeleteConfirmation(false)
      }
    })
    binding.add(document.getElementById('evEditorOverlay'), 'click', (event) => {
      if (event.target?.id === 'evEditorOverlay') closeEventEditor()
    })
    binding.add(document.getElementById('evEditorCloseBtn'), 'click', closeEventEditor)
    binding.add(document.getElementById('evCancelBtn'), 'click', closeEventEditor)
    binding.add(document.getElementById('evSaveBtn'), 'click', () => {
      void saveEventEditor()
    })
    binding.add(document.getElementById('evDeleteBtn'), 'click', () => {
      void deleteEventEditorItem()
    })
    binding.add(document.getElementById('evStopNowBtn'), 'click', setEventStopNow)
    binding.add(document.getElementById('evEditStart'), 'input', () => {
      eventEditorSyncStopHintFromStart()
      eventEditorSyncTimeSummary()
    })
    binding.add(document.getElementById('evEditStart'), 'change', () => {
      eventEditorSyncStopHintFromStart()
      eventEditorSyncTimeSummary()
    })
    binding.add(document.getElementById('evEditStop'), 'input', (event) => {
      eventEditorClearStopHint(event.target)
      eventEditorSyncTimeSummary()
    })
    binding.add(document.getElementById('evEditStop'), 'change', (event) => {
      eventEditorClearStopHint(event.target)
      eventEditorSyncTimeSummary()
    })
    binding.add(document.getElementById('evEditPom'), 'change', refreshEventZoneOptionsForClient)
    binding.add(document.getElementById('evEditLocation'), 'change', refreshEventZoneOptionsForLocation)
    binding.add(document.getElementById('evEditStrefa'), 'change', syncEventRoomAndClientFromZone)
    ;[
      { inputId: 'evEditWorkerSearch', selectId: 'evEditWorker', kind: 'worker' },
      { inputId: 'evEditPomSearch', selectId: 'evEditPom', kind: 'client' },
      { inputId: 'evEditLocationSearch', selectId: 'evEditLocation', kind: 'location' },
      { inputId: 'evEditStrefaSearch', selectId: 'evEditStrefa', kind: 'zone' },
    ].forEach(({ inputId, selectId, kind }) => {
      binding.add(document.getElementById(inputId), 'input', () => {
        eventEditorCollapseOtherPickers(kind)
        eventEditorSchedulePickerFilter(kind, { expandOnEmpty: true, open: true })
      })
      binding.add(document.getElementById(inputId), 'pointerdown', () => {
        eventEditorCollapseOtherPickers(kind)
      })
      binding.add(document.getElementById(inputId), 'focus', () => {
        eventEditorCollapseOtherPickers(kind)
        eventEditorApplyPickerFilter(kind, { expandOnEmpty: true, open: true })
      })
      binding.add(document.getElementById(inputId), 'blur', () => {
        window.setTimeout(() => {
          eventEditorMaybeCollapsePicker(kind)
        }, 120)
      })
      binding.add(document.getElementById(inputId), 'keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          eventEditorCollapsePicker(kind)
          return
        }

        if (event.key === 'ArrowDown') {
          event.preventDefault()
          const select = document.getElementById(selectId)
          if (select) {
            select.focus()
          }
          return
        }

        if (event.key !== 'Enter') {
          return
        }

        const select = document.getElementById(selectId)
        if (select && select.options.length > 1) {
          const firstMatch = select.options[1]
          select.value = String(firstMatch?.value ?? '')
          select.dispatchEvent(new Event('change', { bubbles: true }))
        }
        eventEditorSyncSearchInput(kind)
        eventEditorCollapsePicker(kind)
      })
      binding.add(document.getElementById(selectId), 'focus', () => {
        eventEditorCollapseOtherPickers(kind)
        eventEditorApplyPickerFilter(kind, { expandOnEmpty: true, open: true })
      })
      binding.add(document.getElementById(selectId), 'change', () => {
        eventEditorSyncSearchInput(kind)
        eventEditorCollapsePicker(kind)
      })
      binding.add(document.getElementById(selectId), 'keydown', (event) => {
        if (event.key !== 'Escape') {
          return
        }

        event.preventDefault()
        eventEditorCollapsePicker(kind)
        document.getElementById(inputId)?.focus()
      })
      binding.add(document.getElementById(selectId), 'blur', () => {
        window.setTimeout(() => {
          eventEditorMaybeCollapsePicker(kind)
        }, 120)
      })
    })

    return () => {
      cleanupEventsTableResize()
      closeEventIntegrityModal({ restoreFocus: false })
      closeEventDeleteConfirmation(false)
      eventFilterComboStates.clear()
      binding.done()
    }
  }

  return {
    fetch: fetchEventsForCurrentSession,
    bind: bindEventsViewFunctions,
    openEditor: openEventEditor,
    applyFilterInputs: applyEventsFilterInputs,
    startPolling: startEventsPolling,
    stopPolling: stopEventsPolling,
    eventTypeInfo,
    normalizeEventStatus,
    normalizeVisibleEventComment,
  }
}
