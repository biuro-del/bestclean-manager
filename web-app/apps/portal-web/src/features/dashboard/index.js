import { buildServiceExecutionModel } from './serviceExecutionModel.js'
import { isHistoricalOpenWorkday } from './historicalOpenWorkdayModel.js'
import { isScheduleOrderActive } from '../../services/scheduleOrderLifecycle'
import { isScheduleStartOverdue } from '../../services/scheduleStartStatusPolicy'
import { assertCompletePagedResponse } from '../../services/workdayReadCostPolicy'
import {
  buildOperationalMapObjectLiveSummary,
  groupOperationalMapLocations,
  resolveOperationalMapAvatarKind,
  resolveOperationalMapStatus,
} from './operationalMapModel.js'
import {
  buildObservedServiceOperationCandidates,
  buildObservedWorkdayOperationCandidates,
  buildServiceOperationStream,
  buildWorkerDayDurationIndex,
  matchObservedWorkdayToPlan,
  serviceOperationPreview,
  SERVICE_OPERATION_STATE,
} from './serviceOperationStreamModel.js'
import { buildCommandCenterPlanModel } from './commandCenterPlanModel.js'
import { buildDashboardStopProposalAttentionAlert } from './dashboardStopProposalAttentionModel.js'
import { fetchWorkdayStopProposals } from '../../services/workdayStopProposalService'

export const route = 'dashboard'
export const viewId = 'view-dashboard'

export function createDashboardFeature(ctx) {
  let dashboardChangePollTimer = null
  let dashboardActivitySimulationTimer = 0
  let dashboardBackgroundRefreshPromise = null
  let dashboardReferencePreloadPromise = null
  let dashboardWidgetsRefreshPromise = null
  let dashboardTimelineFingerprintToken = ''
  let dashboardTimelineFingerprintPromise = null
  let dashboardLoadingOverlayTimer = 0
  let dashboardMetricPopoverHideTimer = null
  let dashboardActiveWorkersMapInstance = null
  let dashboardActiveWorkersMapInfoWindow = null
  let dashboardActiveWorkersMapMarkers = []
  let dashboardActiveWorkersMapMarkersByKey = new Map()
  let dashboardActiveWorkersMapSelectedMarker = null
  let dashboardActiveWorkersMapRenderSeq = 0
  let dashboardActiveWorkersMapSignature = ''
  let dashboardActiveWorkersMapProvider = ''
  let dashboardOpenStreetMapLoaderPromise = null
  let dashboardActiveWorkersMapRestoreFocus = null
  let dashboardActiveWorkersMapExpandedGroupKey = ''
  let dashboardActiveWorkersMapLiveGroupKey = ''
  let dashboardServiceOperationStream = []
  let dashboardOperationsDialogRestoreFocus = null
  let dashboardStopProposalAttention = {
    orgId: '',
    pendingCount: 0,
    loadedAt: 0,
    request: null,
  }

  const DASHBOARD_ACTIVITY_SIMULATION_INTERVAL_MS = 60 * 1000
  const DASHBOARD_CHANGE_POLL_INTERVAL_MS = 60 * 1000
  const DASHBOARD_TIMELINE_SNAP_MINUTES = 5
  const DASHBOARD_ACTIVITY_VIEW_STORAGE_KEY = 'portal.dashboard.activityView.v2'
  const DASHBOARD_ACTIVITY_START_DELTA_THRESHOLD_MINUTES = 10
  const DASHBOARD_LONG_CLEAN_SECONDS = 90 * 60
  const DASHBOARD_NEW_COMMENTS_LIMIT = 5
  const DASHBOARD_DUE_TASKS_PREVIEW_LIMIT = 10
  const DASHBOARD_OVERVIEW_PLANNED_PREVIEW_LIMIT = 1
  const DASHBOARD_SERVICE_OPERATIONS_PREVIEW_LIMIT = 3
  const DASHBOARD_OPEN_WORKDAYS_PAGE_SIZE = 2000
  const DASHBOARD_RANGE_READ_MAX_ROWS = 4000
  const DASHBOARD_DAY_READ_MAX_ROWS = 2000
  const DASHBOARD_HISTORY_FROM_YMD = '2000-01-01'
  const DASHBOARD_LOADING_STAGES = ['overview', 'active']
  const DASHBOARD_POST_LOAD_DELAY_MS = 900
  const DASHBOARD_SERVICE_EXECUTION_MODEL_VERSION = 'persisted-plan-v1'
  const DASHBOARD_LOCAL_CACHE_VERSION = 4
  const DASHBOARD_LOCAL_CACHE_TTL_MS = 8 * 60 * 60 * 1000
  const DASHBOARD_LOCAL_CACHE_PREFIX = 'portal.dashboard.snapshot'
  const DASHBOARD_COMMENT_READ_STORAGE_PREFIX = 'portal.dashboardComments.read'
  const DASHBOARD_COMMENT_SYNC_STORAGE_PREFIX = 'portal.dashboardComments.sync'
  const DASHBOARD_INSIGHT_PANEL_COLLAPSE_STORAGE_PREFIX =
    'portal.dashboard.insightPanelCollapsed.v1'
  const DASHBOARD_COMMENT_SYNC_LOOKBACK_DAYS = 3
  const DATA_SYNC_OVERLAY_DELAY_MS = 420
  const DASHBOARD_STOP_PROPOSAL_ATTENTION_CACHE_TTL_MS = 5 * 60 * 1000

  function dashboardAssertCompleteReadResponses(entries = []) {
    entries.forEach((entry) => {
      assertCompletePagedResponse(entry?.response, String(entry?.label ?? '').trim() || 'danych pulpitu')
    })
  }
  const DASHBOARD_INSIGHT_PANEL_CONFIG = Object.freeze({
    objects: Object.freeze({
      cardId: 'dashActiveWorkersPanel',
      buttonId: 'dashActiveWorkersPanelToggle',
      bodyId: 'dashActiveWorkersPanelBody',
      compactId: 'dashActiveWorkersPanelCompact',
      label: 'obiektów',
    }),
    progress: Object.freeze({
      cardId: 'dashServiceProgressPanel',
      buttonId: 'dashServiceProgressPanelToggle',
      bodyId: 'dashServiceProgressPanelBody',
      compactId: 'dashServiceProgressPanelCompact',
      label: 'postępu usług',
    }),
    completed: Object.freeze({
      cardId: 'dashConfirmedTasksPanel',
      buttonId: 'dashConfirmedTasksPanelToggle',
      bodyId: 'dashConfirmedTasksPanelBody',
      compactId: 'dashConfirmedTasksPanelCompact',
      label: 'ukończonych zadań',
    }),
  })

  const {
    appState,
    calendarAccessMatch,
    calendarActivityEntry,
    calendarAddDays,
    calendarAppendTaskActivity,
    calendarCanSeeAllOrganizationTasks,
    calendarClientAccessValues,
    calendarCoordinatorAccessScope,
    calendarDateFromYmd,
    calendarDateToYmd,
    calendarIsCoordinatorRole,
    calendarLoadTasks,
    calendarMatchHasValues,
    calendarNormalizeTask,
    calendarNormalizeTimeValue,
    calendarNormalizeZoneSelection,
    calendarSaveTasks,
    calendarSelectionLabels,
    calendarSelectionText,
    calendarSortTasks,
    calendarSplitAccessValues,
    calendarSyncRemoteTasks,
    calendarTaskShouldShowOnDashboardForCurrentUser,
    calendarTaskToneValue,
    calendarTimelineEventTimestamp,
    calendarTimelineEventsRowStartTimestamp,
    calendarTimelineEventsRowStopTimestamp,
    calendarTimelineContextFromBar,
    calendarTimelineEditOrderFromContext,
    calendarTimelineExpandRecurringOrdersForDays,
    calendarTimelineIsTechnicalEventCode,
    calendarTimelineOrderPlannedBounds,
    calendarTimelineVisualOrderSlots,
    calendarTimelineOrderTitle,
    calendarTimelineRealEventRowDay,
    calendarTimelineRecurringOverrideInfo,
    calendarTimelineResources,
    calendarTimelineShortTimeLabel,
    calendarValuesMatchAccess,
    calendarWorkerAccessValues,
    calendarWorkerId,
    calendarWorkerLabel,
    calendarZoneAccessValues,
    calendarZoneDisplayLabel,
    createBindingHelpers,
    daysAgoYmd,
    durationSecondsToHm,
    escapeHtml,
    eventTypeInfo,
    fillClientProfileCoordinatorOptions,
    fillClientsCoordinatorSelect,
    firstDayOfCurrentMonthYmd,
    formatDatePl,
    formatTime,
    getClients,
    getEventsFingerprintForOrg,
    getTodayActiveWorkers,
    getWorkdays,
    getWorkers,
    getZones,
    workerIsAssignable,
    kanbanColumnsForStatus,
    kanbanCurrentUserOption,
    kanbanNewTaskStatus,
    kanbanNormalizeColumnScope,
    kanbanNormalizeStatus,
    kanbanOpenCalendarTask,
    kanbanSetDataLoading,
    kanbanTaskIsCompleted,
    mapZoneForView,
    normalizeEventStatus,
    normalizeSearchText,
    normalizeVisibleEventComment,
    openDashboardEntityHistory,
    openDashboardWorkerHistory,
    openEventHistoryFromRow,
    ordersListSourceOrders,
    ordersLoadGoogleMaps,
    ordersSyncRemoteTimelineOrders,
    ordersNormalizeOrderRows,
    ordersTimelineAddressLabel,
    ordersTimelineClientLabel,
    pad2,
    renderCalendarView,
    reportHistoryExtractQrFromComment,
    reportHistoryNormalizeQrCode,
    reportHistoryParseGeoPair,
    reportHistoryResolveClientByZoneCode,
    roleLevel,
    setSubwelcomeMetric,
    showTransientNotice,
    toIso,
    todayYmd,
    workerDetailIsoToTime,
  } = ctx

  function dashboardWorkerIsAssignable(worker = {}) {
    return typeof workerIsAssignable === 'function' ? workerIsAssignable(worker) : worker?.active !== false
  }

  function dashboardSystemIssueRangeFrom() {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(1)
    date.setMonth(date.getMonth() - 1)
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-01`
  }

  function dashboardClockLabelToHm(value, fallback = '--:--') {
    const raw = String(value ?? '').trim()
    if (!raw || raw === '-' || raw === '--:--:--' || raw === '-:-:-' || raw === '--:--') {
      return fallback
    }

    const direct = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
    if (direct) {
      const hour = pad2(Number(direct[1]))
      const minute = direct[2]
      return `${hour}:${minute}`
    }

    const iso = toIso(raw)
    if (iso) {
      const date = new Date(iso)
      return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
    }

    const parts = raw.split(':')
    if (parts.length >= 2) {
      const hour = Number(parts[0])
      const minute = Number(parts[1])
      if (Number.isFinite(hour) && Number.isFinite(minute)) {
        return `${pad2(hour)}:${pad2(minute)}`
      }
    }

    return fallback
  }

  function dashboardDurationLabelToHm(value, fallback = '00:00') {
    const raw = String(value ?? '').trim()
    if (!raw || raw === '-') {
      return fallback
    }

    const seconds = dashboardParseDurationLabelToSeconds(raw)
    if (seconds <= 0) {
      return raw === '00:00' || raw === '00:00:00' ? '00:00' : fallback
    }

    return durationSecondsToHm(seconds)
  }

  const DASHBOARD_POLISH_FIRST_NAMES = new Set([
    'agnieszka',
    'adam',
    'aleksandra',
    'alina',
    'aneta',
    'andrzej',
    'barbara',
    'beata',
    'bernadeta',
    'czeslawa',
    'dagmara',
    'dariusz',
    'edyta',
    'ewa',
    'gosia',
    'grzegorz',
    'inna',
    'iwona',
    'izabela',
    'jan',
    'joanna',
    'jolanta',
    'justyna',
    'karol',
    'katarzyna',
    'krzysztof',
    'malgorzata',
    'mariola',
    'marta',
    'marcin',
    'marek',
    'mariusz',
    'michal',
    'monika',
    'natalia',
    'nina',
    'patrycja',
    'pawel',
    'piotr',
    'paulina',
    'rafal',
    'renata',
    'romana',
    'sabina',
    'slawomir',
    'symon',
    'szymon',
    'teresa',
    'tomasz',
    'weronika',
    'wieslawa',
    'wojciech',
  ])

  function dashboardWorkerNameTokenKey(value) {
    return normalizeSearchText(value)
      .replace(/ł/g, 'l')
      .replace(/Ł/g, 'l')
      .replace(/[^a-z0-9]/g, '')
  }

  function dashboardWorkerSurnameDisplayName(value) {
    const raw = String(value ?? '').trim().replace(/\s+/g, ' ')
    if (!raw || raw === '-') {
      return raw || '-'
    }

    const parts = raw.split(' ').filter(Boolean)
    if (parts.length < 2) {
      return raw
    }

    const firstToken = dashboardWorkerNameTokenKey(parts[0])
    const lastToken = dashboardWorkerNameTokenKey(parts[parts.length - 1])
    const looksGivenNameFirst = DASHBOARD_POLISH_FIRST_NAMES.has(firstToken)
    const looksSurnameFirst = !looksGivenNameFirst && DASHBOARD_POLISH_FIRST_NAMES.has(lastToken)

    if (looksSurnameFirst) {
      return raw
    }

    return `${parts[parts.length - 1]} ${parts.slice(0, -1).join(' ')}`
  }

  function dashboardWorkerSurnameSortKey(value) {
    return normalizeSearchText(dashboardWorkerSurnameDisplayName(value))
  }

  function dashboardNormalizeActivityView(value) {
    return String(value ?? '').trim() === 'active-list' ? 'active-list' : 'today-calendar'
  }

  function dashboardReadActivityViewPreference() {
    if (typeof window === 'undefined' || !window.localStorage) {
      return 'today-calendar'
    }

    try {
      return dashboardNormalizeActivityView(window.localStorage.getItem(DASHBOARD_ACTIVITY_VIEW_STORAGE_KEY))
    } catch {
      return 'today-calendar'
    }
  }

  function dashboardWriteActivityViewPreference(value) {
    if (typeof window === 'undefined' || !window.localStorage) {
      return
    }

    try {
      window.localStorage.setItem(DASHBOARD_ACTIVITY_VIEW_STORAGE_KEY, dashboardNormalizeActivityView(value))
    } catch {
      // localStorage can be unavailable in hardened browser profiles.
    }
  }

  function dashboardInsightPanelCollapseStorageKey(panelKey = '') {
    const normalizedPanelKey = String(panelKey ?? '').trim()
    if (!DASHBOARD_INSIGHT_PANEL_CONFIG[normalizedPanelKey]) {
      return ''
    }
    const orgPart = dashboardLocalCachePart(appState.session?.orgId, 'org')
    const userPart = dashboardLocalCachePart(
      appState.session?.uid ??
        appState.session?.userId ??
        appState.session?.email ??
        appState.session?.login ??
        appState.session?.name,
      'user',
    )
    return `${DASHBOARD_INSIGHT_PANEL_COLLAPSE_STORAGE_PREFIX}.${orgPart}.${userPart}.${normalizedPanelKey}`
  }

  function dashboardReadInsightPanelCollapsed(panelKey = '') {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false
    }

    try {
      const storageKey = dashboardInsightPanelCollapseStorageKey(panelKey)
      return storageKey ? window.localStorage.getItem(storageKey) === '1' : false
    } catch {
      return false
    }
  }

  function dashboardWriteInsightPanelCollapsed(panelKey = '', collapsed = false) {
    if (typeof window === 'undefined' || !window.localStorage) {
      return
    }

    try {
      const storageKey = dashboardInsightPanelCollapseStorageKey(panelKey)
      if (storageKey) {
        window.localStorage.setItem(storageKey, collapsed ? '1' : '0')
      }
    } catch {
      // The panels still work when localStorage is unavailable.
    }
  }

  function dashboardSetInsightPanelCompactCopy(panelKey = '', headline = '', meta = '') {
    const config = DASHBOARD_INSIGHT_PANEL_CONFIG[String(panelKey ?? '').trim()]
    const compact = config ? document.getElementById(config.compactId) : null
    if (!(compact instanceof HTMLElement)) {
      return
    }
    const headlineNode = compact.querySelector('strong')
    const metaNode = compact.querySelector('span')
    if (headlineNode) {
      headlineNode.textContent = String(headline ?? '').trim()
    }
    if (metaNode) {
      metaNode.textContent = String(meta ?? '').trim()
    }
  }

  function dashboardSetInsightPanelCollapsed(panelKey = '', collapsed = false, { persist = true } = {}) {
    const normalizedPanelKey = String(panelKey ?? '').trim()
    const config = DASHBOARD_INSIGHT_PANEL_CONFIG[normalizedPanelKey]
    if (!config) {
      return
    }

    const card = document.getElementById(config.cardId)
    const button = document.getElementById(config.buttonId)
    const body = document.getElementById(config.bodyId)
    const compact = document.getElementById(config.compactId)
    const nextCollapsed = Boolean(collapsed)

    if (card instanceof HTMLElement) {
      card.classList.toggle('is-collapsed', nextCollapsed)
      card.dataset.collapsed = nextCollapsed ? '1' : '0'
    }
    if (body instanceof HTMLElement) {
      body.hidden = nextCollapsed
    }
    if (compact instanceof HTMLElement) {
      compact.hidden = !nextCollapsed
    }
    if (button instanceof HTMLButtonElement) {
      const action = nextCollapsed ? 'Rozwiń' : 'Zwiń'
      const label = `${action} panel ${config.label}`
      button.textContent = action
      button.setAttribute('aria-expanded', nextCollapsed ? 'false' : 'true')
      button.setAttribute('aria-label', label)
      button.setAttribute('title', label)
    }

    if (persist) {
      dashboardWriteInsightPanelCollapsed(normalizedPanelKey, nextCollapsed)
    }

    if (normalizedPanelKey === 'objects' && !nextCollapsed) {
      dashboardResizeActiveWorkerMap()
    }
  }

  function dashboardSetActivitySettingsOpen(isOpen) {
    const popover = document.getElementById('dashActivityViewPopover')
    const button = document.getElementById('dashActivitySettingsBtn')
    if (popover) {
      popover.hidden = !isOpen
    }
    if (button) {
      button.setAttribute('aria-expanded', isOpen ? 'true' : 'false')
    }
  }

  function dashboardApplyActivityView() {
    const view = dashboardNormalizeActivityView(appState.dashboardActivityView)
    const title = document.getElementById('dashActivityTitle')
    const panels = document.querySelectorAll('[data-dash-activity-view-panel]')
    const options = document.querySelectorAll('[data-dash-activity-view]')
    const dayControls = document.querySelectorAll('[data-dash-activity-day-control]')
    const dayKey = dashboardActivityDayKey()

    if (title) {
      title.textContent = view === 'active-list' ? 'Aktywni w dniu dzisiejszym' : dashboardActivityTitle(dayKey)
    }

    panels.forEach((panel) => {
      const isVisible = panel.getAttribute('data-dash-activity-view-panel') === view
      panel.hidden = !isVisible
    })

    options.forEach((option) => {
      const isSelected = option.getAttribute('data-dash-activity-view') === view
      option.classList.toggle('is-selected', isSelected)
      option.setAttribute('aria-pressed', isSelected ? 'true' : 'false')
    })

    dayControls.forEach((control) => {
      control.hidden = view !== 'today-calendar'
      if (control instanceof HTMLInputElement) {
        control.value = dayKey
      } else {
        control.setAttribute('data-dash-activity-day', dayKey)
      }
    })
  }

  function dashboardActivityDayKey(value = appState.dashboardActivityDay) {
    const raw = String(value || todayYmd()).trim()
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayYmd()
  }

  function dashboardActivityDayLabel(dayKey = dashboardActivityDayKey()) {
    const normalizedDay = dashboardActivityDayKey(dayKey)
    const date = calendarDateFromYmd(normalizedDay)
    const weekday = date.toLocaleDateString('pl-PL', { weekday: 'long' })
    return `${weekday}, ${formatDatePl(`${normalizedDay}T12:00:00`)}`
  }

  function dashboardActivityTitle(dayKey = dashboardActivityDayKey()) {
    const normalizedDay = dashboardActivityDayKey(dayKey)
    if (normalizedDay === todayYmd()) {
      return `Oś dnia dzisiejszego: ${dashboardActivityDayLabel(normalizedDay)}`
    }
    return `Oś dnia: ${dashboardActivityDayLabel(normalizedDay)}`
  }

  function dashboardActivityRowsForDay(fallbackRows = [], dayKey = dashboardActivityDayKey()) {
    const normalizedDay = dashboardActivityDayKey(dayKey)
    if (normalizedDay === todayYmd()) {
      return Array.isArray(appState.dashboardActivityWorkdayRows) && appState.dashboardActivityWorkdayRows.length
        ? appState.dashboardActivityWorkdayRows
        : fallbackRows
    }
    return Array.isArray(appState.dashboardActivityDayRows) ? appState.dashboardActivityDayRows : []
  }

  function dashboardActivitySourceRowsForDay(dayKey = dashboardActivityDayKey()) {
    const normalizedDay = dashboardActivityDayKey(dayKey)
    if (normalizedDay === todayYmd()) {
      return Array.isArray(appState.dashboardScheduleSourceRows) ? appState.dashboardScheduleSourceRows : []
    }
    return Array.isArray(appState.dashboardActivityDaySourceRows) ? appState.dashboardActivityDaySourceRows : []
  }

  function dashboardActivityRowsHaveItemsForDay(rows = [], dayKey = dashboardActivityDayKey(), sourceRows = []) {
    const normalizedDay = dashboardActivityDayKey(dayKey)
    const rangeStart = new Date(`${normalizedDay}T04:00:00`).getTime()
    const rangeEnd = new Date(`${normalizedDay}T23:00:00`).getTime()
    return dashboardBuildWorkdayActivityItems(rows, normalizedDay, rangeStart, rangeEnd, rangeEnd, sourceRows).length > 0
  }

  function dashboardSetActivityView(value, { persist = true } = {}) {
    const normalized = dashboardNormalizeActivityView(value)
    appState.dashboardActivityView = normalized
    if (persist) {
      dashboardWriteActivityViewPreference(normalized)
    }
    if (normalized === 'today-calendar') {
      renderDashboardActivityCalendar(appState.dashboardTodayRows)
    }
    dashboardApplyActivityView()
  }

  async function dashboardLoadActivityDay(dayKey, options = {}) {
    const normalizedDay = dashboardActivityDayKey(dayKey)
    const orgId = String(appState.session?.orgId ?? '').trim()
    if (!orgId || normalizedDay === todayYmd()) {
      return
    }
    const forceRefresh = options.forceRefresh === true

    const requestKey = `${normalizedDay}:${Date.now()}`
    appState.dashboardActivityDayRequestKey = requestKey
    appState.dashboardActivityDayLoading = true
    appState.dashboardActivityDayRows = []
    appState.dashboardActivityDaySourceRows = []
    renderDashboardActivityCalendar(appState.dashboardTodayRows)
    dashboardApplyActivityView()

    try {
      const rangeEndDay = calendarAddDays(normalizedDay, 2)
      const [eventsResponse, workdaysResponse] = await Promise.all([
        getWorkdays(orgId, {
          source: 'events',
          fromIso: normalizedDay,
          toIso: rangeEndDay,
          page: 1,
          pageSize: DASHBOARD_DAY_READ_MAX_ROWS,
          forceRefresh,
        }),
        getWorkdays(orgId, {
          source: 'workdays',
          fromIso: normalizedDay,
          toIso: rangeEndDay,
          page: 1,
          pageSize: DASHBOARD_DAY_READ_MAX_ROWS,
          forceRefresh,
        }),
        dashboardSyncCalendarTimelineInputs({ forceRefresh }),
      ])

      dashboardAssertCompleteReadResponses([
        { label: 'zdarzenia wybranego dnia', response: eventsResponse },
        { label: 'dni pracy wybranego dnia', response: workdaysResponse },
      ])

      if (appState.dashboardActivityDayRequestKey !== requestKey || appState.dashboardActivityDay !== normalizedDay) {
        return
      }

      const eventRows = Array.isArray(eventsResponse?.items) ? eventsResponse.items : []
      const workdayRows = Array.isArray(workdaysResponse?.items) ? workdaysResponse.items : []
      const sourceRows = [...eventRows, ...workdayRows]
      const workdaysHaveActivityForDay = dashboardActivityRowsHaveItemsForDay(workdayRows, normalizedDay, sourceRows)
      appState.dashboardActivityDayRows = workdaysHaveActivityForDay || !eventRows.length ? workdayRows : eventRows
      appState.dashboardActivityDaySourceRows = sourceRows
    } finally {
      if (appState.dashboardActivityDayRequestKey === requestKey) {
        appState.dashboardActivityDayLoading = false
        renderDashboardActivityCalendar(appState.dashboardTodayRows)
        dashboardApplyActivityView()
      }
    }
  }

  function dashboardSetActivityDay(dayKey, options = {}) {
    const normalizedDay = dashboardActivityDayKey(dayKey)
    appState.dashboardActivityDay = normalizedDay
    dashboardApplyActivityView()
    if (normalizedDay === todayYmd()) {
      appState.dashboardActivityDayLoading = false
      appState.dashboardActivityDayRows = []
      appState.dashboardActivityDaySourceRows = []
      appState.dashboardActivityDayRequestKey = ''
      renderDashboardActivityCalendar(appState.dashboardTodayRows)
      return
    }

    void dashboardLoadActivityDay(normalizedDay, options).catch((error) => {
      appState.dashboardActivityDayLoading = false
      const message = error instanceof Error ? error.message : 'Nie udało się pobrać osi dnia.'
      showTransientNotice(message, 'error')
      renderDashboardActivityCalendar(appState.dashboardTodayRows)
      dashboardApplyActivityView()
    })
  }

  function dashboardMoveActivityDay(offset) {
    const current = dashboardActivityDayKey()
    dashboardSetActivityDay(calendarAddDays(current, Number(offset || 0)))
  }

  function dashboardTodayDateFromTime(value, dayKey = todayYmd()) {
    const iso = toIso(value)
    if (iso) {
      return new Date(iso)
    }

    const time = dashboardClockLabelToHm(value, '')
    const match = time.match(/^(\d{2}):(\d{2})$/)
    if (!match) {
      return null
    }

    const date = new Date(`${dayKey}T${match[1]}:${match[2]}:00`)
    return Number.isFinite(date.getTime()) ? date : null
  }

  function dashboardTimelinePercent(ts, rangeStart, rangeEnd) {
    const span = Math.max(1, rangeEnd - rangeStart)
    return ((ts - rangeStart) / span) * 100
  }

  function dashboardFindWorkerByAliasKeys(keys = new Set()) {
    const sourceKeys = keys instanceof Set ? keys : new Set()
    if (!sourceKeys.size) {
      return null
    }

    const workers = Array.isArray(appState.workers) ? appState.workers : []
    return (
      workers.find((worker) => {
        const workerKeys = dashboardWorkerIdIdentityKeys(worker?.workerId ?? worker?.id)
        return [...workerKeys].some((key) => sourceKeys.has(key))
      }) ?? null
    )
  }

  function dashboardActivityWorkerIdentity(row = {}, linkedWorker = null) {
    const worker = linkedWorker || null
    const workerName = String(worker?.workerName ?? worker?.name ?? row?.workerName ?? row?.name ?? '').trim()
    const workerLogin = String(worker?.workerLogin ?? worker?.login ?? row?.workerLogin ?? row?.login ?? row?.id ?? '').trim()
    const workerId = dashboardCanonicalWorkerId(worker?.workerId ?? worker?.id ?? row?.workerId ?? row?.id)
    const displaySource = workerName || workerLogin || workerId || '-'
    const workerDisplayName = dashboardWorkerSurnameDisplayName(displaySource)
    const workerSortKey = dashboardWorkerSurnameSortKey(displaySource)
    const idKey = normalizeSearchText(workerId)
    const fallbackKey = normalizeSearchText(workerLogin || displaySource)
    const workerKey = idKey ? `id:${idKey}` : `unresolved:${fallbackKey || 'worker'}`

    return {
      workerKey,
      workerId,
      workerName: displaySource,
      workerDisplayName,
      workerSortKey,
      workerLogin,
    }
  }

  function dashboardActivityCleanCompanyLabel(value = '') {
    const label = String(value ?? '').trim()
    const normalized = normalizeSearchText(label)
    const generic = new Set([
      '',
      '-',
      'unassigned',
      'brak klienta',
      'brak firmy',
      'nieprzypisany',
      'unknown',
      'none',
      'qr start',
      'qr stop',
      'qr start stop',
      'start',
      'stop',
      'start stop',
      'aktywny status',
      'status',
      'klient spec',
      'strefa',
    ])
    if (!label || generic.has(normalized)) {
      return ''
    }
    if (/^\d{1,2}:\d{2}(\s*[-–]\s*\d{1,2}:\d{2})?$/.test(label)) {
      return ''
    }
    if (/^qr\s+[a-z0-9-]+$/i.test(label) || /^w\d+$/i.test(label) || dashboardIsQrCodeLike(label)) {
      return ''
    }
    return label
  }

  function dashboardActivityResolveClientByQr(value = '') {
    const code = reportHistoryNormalizeQrCode(value)
    if (!code || calendarTimelineIsTechnicalEventCode(code)) {
      return ''
    }

    const zone = resolveZoneByQrCandidate(code)
    const zoneClientLabel = dashboardActivityCleanCompanyLabel(
      zone?.clientName ?? zone?.clientLabel ?? zone?.client ?? zone?.companyName,
    )
    if (zoneClientLabel) {
      return zoneClientLabel
    }

    const clientId = String(zone?.clientId ?? zone?.clientID ?? '').trim()
    if (clientId) {
      const normalizedClientId = normalizeSearchText(clientId)
      const client = (Array.isArray(appState.clients) ? appState.clients : []).find((item) => {
        const candidates = [item?.id, item?.clientId, item?.name, item?.clientName]
        return candidates.some((candidate) => normalizeSearchText(candidate) === normalizedClientId)
      })
      const clientLabel = dashboardActivityCleanCompanyLabel(client?.name ?? client?.clientName ?? client?.clientLabel)
      if (clientLabel) {
        return clientLabel
      }
    }

    return dashboardActivityCleanCompanyLabel(reportHistoryResolveClientByZoneCode(code, ''))
  }

  function dashboardActivityResolveObjectLabelByQr(value = '') {
    const code = reportHistoryNormalizeQrCode(value)
    if (!code || calendarTimelineIsTechnicalEventCode(code)) {
      return ''
    }

    const clientLabel = dashboardActivityResolveClientByQr(code)
    if (clientLabel) {
      return clientLabel
    }

    const zone = resolveZoneByQrCandidate(code)
    const zoneLabel = dashboardActivityCleanCompanyLabel(
      zone?.location ?? zone?.name ?? zone?.zone ?? zone?.zoneName ?? zone?.strefa,
    )
    return zoneLabel || ''
  }

  function dashboardActivityScannedObjectLabel(row = {}) {
    const scanObjectCandidates = [
      row?.scanObjectLabel,
      row?.objectLabelAtScan,
      row?.activeObjectLabel,
      row?.activeClientLabel,
      row?.activeClient,
      row?.activeLocation,
      row?.locationLabel,
      row?.lokalizacja,
      row?.location,
      row?.zone?.location,
      row?.activeZone,
      row?.zoneName,
      row?.strefa,
      row?.zone?.zone,
      row?.zone?.name,
      row?.qrStartSourceItem?.scanObjectLabel,
      row?.qrStartSourceItem?.objectLabelAtScan,
      row?.qrStartSourceItem?.activeObjectLabel,
      row?.qrStartSourceItem?.activeClient,
      row?.qrStartSourceItem?.activeLocation,
      row?.qrStartSourceItem?.zoneName,
      row?.qrStartSourceItem?.strefa,
      row?.qrStopSourceItem?.scanObjectLabel,
      row?.qrStopSourceItem?.objectLabelAtScan,
      row?.qrStopSourceItem?.activeObjectLabel,
      row?.qrStopSourceItem?.activeClient,
      row?.qrStopSourceItem?.activeLocation,
      row?.qrStopSourceItem?.zoneName,
      row?.qrStopSourceItem?.strefa,
    ]

    for (const candidate of scanObjectCandidates) {
      const label = dashboardActivityCleanCompanyLabel(candidate)
      if (label) {
        return label
      }
    }

    return ''
  }

  function dashboardActivityQrCodesFromRow(row = {}) {
    const candidates = [
      row?.activeZoneId,
      row?.zoneId,
      row?.roomId,
      row?.utilityRoomId,
      row?.workdayUtilityRoomId,
      row?.qr,
      row?.qrCode,
      row?.activeZone,
      row?.zoneName,
      row?.strefa,
      row?.dayStartObject,
      row?.startObject,
      row?.dayStopObject,
      row?.stopObject,
      row?.qrStartSourceItem?.dayStartObject,
      row?.qrStartSourceItem?.startObject,
      row?.qrStopSourceItem?.dayStopObject,
      row?.qrStopSourceItem?.stopObject,
      reportHistoryExtractQrFromComment(row?.comment, 'start'),
      reportHistoryExtractQrFromComment(row?.comment, 'stop'),
      reportHistoryExtractQrFromComment(row?.dayComment, 'start'),
      reportHistoryExtractQrFromComment(row?.dayComment, 'stop'),
      row?.comment,
      row?.dayComment,
    ]
    const codes = []
    candidates.forEach((candidate) => {
      const code = reportHistoryNormalizeQrCode(candidate)
      if (code && !calendarTimelineIsTechnicalEventCode(code) && !codes.includes(code)) {
        codes.push(code)
      }
    })
    return codes
  }

  function dashboardActivityCompanyLabel(row = {}) {
    const scannedLabel = dashboardActivityScannedObjectLabel(row)
    if (scannedLabel) {
      return scannedLabel
    }

    const directCandidates = [
      row?.clientName,
      row?.clientLabel,
      row?.klient,
      row?.activeClient,
      row?.companyName,
      row?.customerName,
      row?.accountName,
      row?.client?.name,
      row?.client?.clientName,
      row?.client?.clientLabel,
    ]

    for (const candidate of directCandidates) {
      const label = dashboardActivityCleanCompanyLabel(candidate)
      if (label) {
        return label
      }
    }

    const resolvedClient = dashboardActivityCleanCompanyLabel(dashboardResolveClientLabel(row))
    if (resolvedClient) {
      return resolvedClient
    }

    for (const candidate of dashboardActivityQrCodesFromRow(row)) {
      const resolvedByQr = dashboardActivityResolveObjectLabelByQr(candidate)
      if (resolvedByQr) {
        return resolvedByQr
      }
    }

    return '-'
  }

  function dashboardActivityCompanyLabelForGroup(bars = [], fallbackLabels = []) {
    const cleanFallback = (Array.isArray(fallbackLabels) ? fallbackLabels : [])
      .map((label) => dashboardActivityCleanCompanyLabel(label))
      .find(Boolean)

    const cleanBars = (Array.isArray(bars) ? bars : [])
      .map((bar) => ({
        bar,
        label: dashboardActivityCleanCompanyLabel(dashboardActivityCompanyLabel(bar)),
        startTs: Number(bar?.startTs ?? 0),
        stopTs: Number(bar?.stopTs ?? 0),
        isRunning: Boolean(bar?.isRunning),
      }))
      .filter((item) => item.label)

    const running = cleanBars
      .filter((item) => item.isRunning)
      .sort((left, right) => right.startTs - left.startTs)[0]
    if (running?.label) {
      return running.label
    }

    const latestWorkday = cleanBars
      .filter((item) => item.bar?.kind === 'workday')
      .sort((left, right) => right.stopTs - left.stopTs || right.startTs - left.startTs)[0]
    if (latestWorkday?.label) {
      return latestWorkday.label
    }

    const planned = cleanBars.find((item) => item.bar?.kind === 'planned')
    return planned?.label || cleanFallback || '-'
  }

  function dashboardActivityTimestampFromRow(row = {}) {
    const timestamps = [
      calendarTimelineEventsRowStartTimestamp(row),
      calendarTimelineEventsRowStopTimestamp(row),
      calendarTimelineEventTimestamp(row?.activeSortTs),
      calendarTimelineEventTimestamp(row?.startAt ?? row?.dayStartAt),
      calendarTimelineEventTimestamp(row?.endAt ?? row?.dayEndAt),
      calendarTimelineEventTimestamp(row?.qrStartSourceItem?.startAt ?? row?.qrStartSourceItem?.dayStartAt),
      calendarTimelineEventTimestamp(row?.qrStopSourceItem?.endAt ?? row?.qrStopSourceItem?.dayEndAt),
    ].filter((value) => Number.isFinite(value) && value > 0)
    return timestamps.length ? Math.max(...timestamps) : 0
  }

  function dashboardActivityWorkerMatchKeys(row = {}) {
    const keys = new Set()
    dashboardWorkerIdIdentityKeys(dashboardResolveWorkerIdValue(row)).forEach((key) => keys.add(key))

    const addNameKeys = (value = '') => {
      const normalized = normalizeSearchText(value).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
      if (!normalized) {
        return
      }
      keys.add(`n:${normalized}`)

      const parts = normalized.split(' ').filter(Boolean)
      if (parts.length > 1) {
        keys.add(`n:${parts.slice().reverse().join(' ')}`)
        const first = parts[0]
        const last = parts[parts.length - 1]
        if (first && last) {
          keys.add(`sig:${first.charAt(0)}|${last}`)
          keys.add(`sig:${last.charAt(0)}|${first}`)
        }
      }
    }

    const addLoginKeys = (value = '') => {
      const normalized = normalizeSearchText(value)
      if (!normalized) {
        return
      }
      keys.add(`l:${normalized}`)
      const localPart = normalized.split('@')[0]?.trim()
      if (localPart) {
        keys.add(`l:${localPart}`)
      }
    }

    const login = normalizeSearchText(
      row?.workerLogin ??
        row?.login ??
        row?.worker?.workerLogin ??
        row?.worker?.login ??
        '',
    )
    const name = normalizeSearchText(
      row?.workerName ??
        row?.name ??
        row?.worker?.workerName ??
        row?.worker?.name ??
        '',
    )

    addLoginKeys(login)
    addNameKeys(name)

    return keys
  }

  function dashboardActivityRowsShareWorker(row = {}, sourceRow = {}) {
    const rowKeys = dashboardActivityWorkerMatchKeys(row)
    const sourceKeys = dashboardActivityWorkerMatchKeys(sourceRow)
    if (!rowKeys.size || !sourceKeys.size) {
      return false
    }
    return [...rowKeys].some((key) => sourceKeys.has(key))
  }

  function dashboardActivityLatestQrCompanyLabelForRow(row = {}, dayKey = '', sourceRows = []) {
    const rowKeys = dashboardActivityWorkerMatchKeys(row)
    if (!rowKeys.size) {
      return ''
    }

    const normalizedDay =
      String(dayKey ?? '').trim() ||
      dashboardResolveDayKey(row) ||
      calendarTimelineRealEventRowDay(row) ||
      todayYmd()

    const matches = (Array.isArray(sourceRows) ? sourceRows : [])
      .map((sourceRow) => {
        if (!dashboardActivityRowsShareWorker(row, sourceRow)) {
          return null
        }

        const sourceDay = dashboardResolveDayKey(sourceRow) || calendarTimelineRealEventRowDay(sourceRow)
        if (normalizedDay && sourceDay && sourceDay !== normalizedDay) {
          return null
        }

        const qrCodes = dashboardActivityQrCodesFromRow(sourceRow)
        const scannedLabel = dashboardActivityScannedObjectLabel(sourceRow)
        if (!qrCodes.length && !scannedLabel) {
          return null
        }
        const rawQrLabel = qrCodes.find(Boolean) || ''
        const label =
          scannedLabel ||
          qrCodes.map((code) => dashboardActivityResolveObjectLabelByQr(code)).find(Boolean) ||
          rawQrLabel ||
          ''
        if (!label) {
          return null
        }

        return {
          label,
          timestamp: dashboardActivityTimestampFromRow(sourceRow),
        }
      })
      .filter(Boolean)
      .sort((left, right) => right.timestamp - left.timestamp)

    return matches[0]?.label || ''
  }

  function dashboardActivityRowMatchesDay(row = {}, dayKey = todayYmd()) {
    const normalizedDay = dashboardActivityDayKey(dayKey)
    const rowDay = dashboardResolveDayKey(row) || calendarTimelineRealEventRowDay(row)
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(rowDay ?? '').trim())) {
      return rowDay === normalizedDay
    }

    return normalizedDay === todayYmd()
  }

  function dashboardEventIdentityCandidateIds(row = {}) {
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

  function dashboardEventRowFingerprintKey(row = {}) {
    const normalize = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
    const startAt = toIso(row?.startAt ?? row?.dayStartAt)
    const endAt = toIso(row?.endAt ?? row?.dayEndAt)
    const durationRaw = Number(row?.durationSec)
    const durationSec = Number.isFinite(durationRaw) && durationRaw > 0 ? Math.floor(durationRaw) : 0
    const status = normalizeEventStatus(row?.status, Boolean(row?.endAt ?? row?.dayEndAt))
    const workerKey = normalize(row?.workerLogin || row?.workerName)
    const zoneKey = normalize(row?.zoneId ?? row?.roomId ?? row?.utilityRoomId ?? row?.strefa ?? row?.zoneName)
    const clientKey = normalize(row?.clientId ?? row?.klient ?? row?.clientName)
    const endReason = normalize(row?.endReason)
    return [workerKey, startAt, endAt, zoneKey, clientKey, durationSec, status, endReason].join('|')
  }

  function dashboardActivityEditRowsForDay(dayKey = dashboardActivityDayKey()) {
    const rows = [
      ...dashboardActivityRowsForDay(appState.dashboardTodayRows, dayKey),
      ...dashboardActivitySourceRowsForDay(dayKey),
      ...(Array.isArray(appState.dashboardTodayRows) ? appState.dashboardTodayRows : []),
    ]
    const seen = new Set()
    return rows.filter((row, index) => {
      if (!row || typeof row !== 'object' || !dashboardActivityRowMatchesDay(row, dayKey)) {
        return false
      }
      const key = dashboardEventIdentityCandidateIds(row).join('|') || `${index}|${toIso(row?.startAt ?? row?.dayStartAt)}`
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
  }

  function dashboardActivityRowEditStartIso(row = {}) {
    return toIso(row?.startAt ?? row?.dayStartAt ?? row?.qrStartAt ?? row?.qrStartIso ?? row?.qrStartSourceItem?.startAt ?? row?.qrStartSourceItem?.dayStartAt)
  }

  function dashboardActivityRowEditStopIso(row = {}) {
    return toIso(row?.endAt ?? row?.dayEndAt ?? row?.qrStopAt ?? row?.qrStopIso ?? row?.qrStopSourceItem?.endAt ?? row?.qrStopSourceItem?.dayEndAt)
  }

  function dashboardActivityEditRowScore(row = {}, target = {}) {
    let score = 0
    const rowIds = new Set(dashboardEventIdentityCandidateIds(row))
    target.ids.forEach((id) => {
      if (id && rowIds.has(id)) {
        score += 80
      }
    })

    const eventId = String(row?.eventId ?? row?.id ?? '').trim()
    const workdayId = String(row?.workdayId ?? row?.linkedWorkdayId ?? row?.workday?.workdayId ?? '').trim()
    if (target.eventId && eventId === target.eventId) score += 40
    if (target.workdayId && workdayId === target.workdayId) score += 35

    const startIso = dashboardActivityRowEditStartIso(row)
    const startDelta = startIso && target.sourceStartAt
      ? Math.abs(new Date(startIso).getTime() - new Date(target.sourceStartAt).getTime())
      : Number.POSITIVE_INFINITY
    if (Number.isFinite(startDelta) && startDelta <= 2 * 60 * 1000) {
      score += 25
    }

    const workerLogin = normalizeSearchText(row?.workerLogin ?? row?.login)
    const workerName = normalizeSearchText(row?.workerName ?? row?.name)
    if (target.workerLogin && workerLogin && workerLogin === target.workerLogin) score += 10
    if (target.workerName && workerName && workerName === target.workerName) score += 6
    return score
  }

  function dashboardActivityEventRowFromBar(bar) {
    if (!(bar instanceof HTMLElement)) {
      return null
    }
    const dayKey = dashboardActivityDayKey(bar.getAttribute('data-dash-activity-event-day') || appState.dashboardActivityDay)
    const eventId = String(bar.getAttribute('data-dash-activity-event-id') || '').trim()
    const workdayId = String(bar.getAttribute('data-dash-activity-workday-id') || '').trim()
    const sourceStartAt = toIso(bar.getAttribute('data-dash-activity-source-start') || '')
    const sourceStopAt = toIso(bar.getAttribute('data-dash-activity-source-stop') || '')
    const target = {
      eventId,
      workdayId,
      sourceStartAt,
      workerLogin: normalizeSearchText(bar.getAttribute('data-dash-activity-worker-login') || ''),
      workerName: normalizeSearchText(bar.getAttribute('data-dash-activity-worker-name') || ''),
      ids: new Set([eventId, workdayId].filter(Boolean)),
    }

    const matches = dashboardActivityEditRowsForDay(dayKey)
      .map((row) => ({ row, score: dashboardActivityEditRowScore(row, target) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)

    const match = matches[0]?.row ?? null
    if (!match) {
      return null
    }

    const startAt = dashboardActivityRowEditStartIso(match) || sourceStartAt
    const endAt = dashboardActivityRowEditStopIso(match) || sourceStopAt
    const normalizedEventId = String(match?.eventId ?? match?.id ?? eventId ?? '').trim()
    const normalizedWorkdayId = String(match?.workdayId ?? match?.linkedWorkdayId ?? match?.workday?.workdayId ?? workdayId ?? '').trim()
    return {
      ...match,
      eventId: normalizedEventId || normalizedWorkdayId,
      workdayId: normalizedWorkdayId || normalizedEventId,
      startAt,
      endAt,
    }
  }

  function dashboardActivityWorkdayDetailFromBar(bar) {
    if (!(bar instanceof HTMLElement)) {
      return null
    }

    const dayKey = dashboardActivityDayKey(bar.getAttribute('data-dash-activity-event-day') || appState.dashboardActivityDay)
    if (!dayKey) {
      return null
    }

    const matchedRow = dashboardActivityEventRowFromBar(bar) ?? {}
    const workdayId = String(
      bar.getAttribute('data-dash-activity-workday-id') ||
        matchedRow?.workdayId ||
        matchedRow?.linkedWorkdayId ||
        matchedRow?.id ||
        '',
    ).trim()
    const startAt = toIso(bar.getAttribute('data-dash-activity-source-start') || matchedRow?.startAt || matchedRow?.dayStartAt || '')
    const endAt = toIso(bar.getAttribute('data-dash-activity-source-stop') || matchedRow?.endAt || matchedRow?.dayEndAt || '')
    const workerLogin = String(
      bar.getAttribute('data-dash-activity-worker-login') ||
        matchedRow?.workerLogin ||
        matchedRow?.login ||
        '',
    ).trim()
    const workerName = String(
      bar.getAttribute('data-dash-activity-worker-name') ||
        matchedRow?.workerName ||
        matchedRow?.name ||
        '',
    ).trim()

    return {
      dayKey,
      workdayId,
      workerLogin,
      workerName,
      source: 'dashboard-activity-bar',
      row: {
        ...matchedRow,
        dayKey,
        workdayId,
        id: workdayId || String(matchedRow?.id ?? '').trim(),
        startAt,
        endAt,
        workerLogin,
        workerName,
      },
    }
  }

  function dashboardActivityWorkdayClickKeyFromBar(bar) {
    if (!(bar instanceof HTMLElement)) {
      return ''
    }
    return [
      dashboardActivityDayKey(bar.getAttribute('data-dash-activity-event-day') || appState.dashboardActivityDay),
      String(bar.getAttribute('data-dash-activity-workday-id') || '').trim(),
      String(bar.getAttribute('data-dash-activity-worker-login') || '').trim(),
      String(bar.getAttribute('data-dash-activity-worker-name') || '').trim(),
      String(bar.getAttribute('data-dash-activity-source-start') || '').trim(),
    ].filter(Boolean).join('|')
  }

  async function openDashboardActivityWorkdayDayEditor(bar) {
    const detail = dashboardActivityWorkdayDetailFromBar(bar)
    if (!detail) {
      showTransientNotice('Nie znaleziono dnia pracy do edycji.', 'error')
      return
    }
    const intentKey = [detail.dayKey, detail.workdayId, detail.workerLogin, detail.workerName].filter(Boolean).join('|')
    const nowTs = Date.now()
    const lastIntent = appState.dashboardActivityLastWorkdayEditIntent ?? {}
    if (
      intentKey &&
      lastIntent.key === intentKey &&
      nowTs - Number(lastIntent.at ?? 0) < 800
    ) {
      return
    }
    appState.dashboardActivityLastWorkdayEditIntent = { key: intentKey, at: nowTs }
    await openDashboardWorkdayDayEditor(detail)
  }

  function dashboardActivityRowStartTimestamp(row = {}, dayKey = todayYmd()) {
    const direct = calendarTimelineEventTimestamp(
      row?.startAt ??
        row?.dayStartAt ??
        row?.qrStartAt ??
        row?.qrStartIso ??
        row?.dayStartIso ??
        row?.firstStartIso ??
        row?.qrStartSourceItem?.startAt ??
        row?.qrStartSourceItem?.dayStartAt,
    )
    if (direct > 0) {
      return direct
    }

    const normalizedDay = dashboardActivityDayKey(dayKey)
    const minutes = dashboardScheduleTimeToMinutes(row?.qrStart ?? row?.start)
    if (minutes >= 0) {
      return dashboardScheduleStartTimestamp(normalizedDay, minutes)
    }
    return 0
  }

  function dashboardActivityRowStopTimestamp(row = {}, dayKey = todayYmd()) {
    const direct = calendarTimelineEventTimestamp(
      row?.endAt ??
        row?.dayEndAt ??
        row?.qrStopAt ??
        row?.qrStopIso ??
        row?.dayEndIso ??
        row?.stopIso ??
        row?.qrStopSourceItem?.endAt ??
        row?.qrStopSourceItem?.dayEndAt,
    )
    if (direct > 0) {
      return direct
    }

    const normalizedDay = dashboardActivityDayKey(dayKey)
    const minutes = dashboardScheduleTimeToMinutes(row?.qrStop ?? row?.stop)
    if (minutes >= 0) {
      return dashboardScheduleStartTimestamp(normalizedDay, minutes)
    }
    return 0
  }

  function dashboardBuildWorkdayActivityItems(
    rows = [],
    dayKey = todayYmd(),
    rangeStart = 0,
    rangeEnd = 0,
    nowTs = Date.now(),
    sourceRows = appState.dashboardScheduleSourceRows,
  ) {
    return (Array.isArray(rows) ? rows : [])
      .map((row) => {
        if (!dashboardActivityRowMatchesDay(row, dayKey)) {
          return null
        }

        const startTimestamp = dashboardActivityRowStartTimestamp(row, dayKey)
        const startDate = startTimestamp > 0
          ? new Date(startTimestamp)
          : dashboardTodayDateFromTime(row?.qrStart ?? row?.start, dayKey)
        if (!startDate) {
          return null
        }

        const stopTimestamp = dashboardActivityRowStopTimestamp(row, dayKey)
        const endSource = row?.qrStop ?? row?.stop
        const hasStop = Boolean(stopTimestamp > 0 || toIso(endSource) || dashboardClockLabelToHm(endSource, ''))
        const status = String(row?.status ?? row?.state ?? '').trim().toUpperCase()
        const isRunning = dayKey === todayYmd() && (Boolean(row?.isRunning) || (!hasStop && (status === 'RUNNING' || status === 'OPEN')))
        const stopDate = isRunning
          ? null
          : stopTimestamp > 0
            ? new Date(stopTimestamp)
            : dashboardTodayDateFromTime(endSource, dayKey)
        const durationSeconds = dashboardParseDurationLabelToSeconds(row?.duration)
        let startTs = startDate.getTime()
        let stopTs = stopDate ? stopDate.getTime() : isRunning ? nowTs : startTs

        if (!stopDate && durationSeconds > 0 && !isRunning) {
          stopTs = startTs + durationSeconds * 1000
        }
        if (stopTs < startTs) {
          stopTs = isRunning ? nowTs : startTs
        }

        const clippedStart = Math.max(startTs, rangeStart)
        const clippedStop = Math.min(stopTs, rangeEnd)
        if (clippedStop < rangeStart || clippedStart > rangeEnd) {
          return null
        }

        const rowKeys = dashboardResolveTodayRowAliasKeys(row)
        const linkedWorker = dashboardFindWorkerByAliasKeys(rowKeys)
        const identity = dashboardActivityWorkerIdentity(row, linkedWorker)
        const latestQrCompanyLabel =
          dashboardActivityLatestQrCompanyLabelForRow(linkedWorker || row, dayKey, sourceRows) ||
          dashboardActivityLatestQrCompanyLabelForRow(row, dayKey, sourceRows)
        const rowCompanyLabel = dashboardActivityCleanCompanyLabel(dashboardActivityCompanyLabel(row))
        const companyLabel = isRunning
          ? latestQrCompanyLabel || rowCompanyLabel || '-'
          : rowCompanyLabel || latestQrCompanyLabel || '-'
        const rowClientId = String(row?.clientId ?? row?.client?.id ?? '').trim()
        const clientIdMatchesVisibleLabel = normalizeSearchText(companyLabel) === normalizeSearchText(rowCompanyLabel)
        const clientId = clientIdMatchesVisibleLabel ? rowClientId : ''
        const elapsedSeconds = Math.max(0, Math.floor((stopTs - startTs) / 1000))
        const durationLabel = isRunning ? durationSecondsToHm(elapsedSeconds) : dashboardDurationLabelToHm(row?.duration, durationSecondsToHm(elapsedSeconds))
        const eventId = String(row?.eventId ?? row?.id ?? '').trim()
        const workdayId = String(row?.workdayId ?? row?.linkedWorkdayId ?? row?.workday?.workdayId ?? '').trim()
        const sourceStartAt = toIso(row?.startAt ?? row?.dayStartAt ?? row?.qrStartSourceItem?.startAt ?? row?.qrStartSourceItem?.dayStartAt) || new Date(startTs).toISOString()
        const sourceStopAt = toIso(row?.endAt ?? row?.dayEndAt ?? row?.qrStopSourceItem?.endAt ?? row?.qrStopSourceItem?.dayEndAt) || (!isRunning ? new Date(stopTs).toISOString() : '')

        return {
          ...identity,
          kind: 'workday',
          eventId,
          workdayId,
          sourceStartAt,
          sourceStopAt,
          startTs,
          stopTs,
          clippedStart,
          clippedStop,
          label: durationLabel,
          locationLabel: companyLabel,
          companyLabel,
          scanObjectLabel: companyLabel,
          clientId,
          isRunning,
          sourceKind: String(row?.historySourceKind ?? '').trim().toLowerCase(),
          sourceRow: row,
        }
      })
      .filter(Boolean)
  }

  function dashboardActivityStartDeltaLabel(deltaMinutes) {
    const minutes = Math.round(Number(deltaMinutes) || 0)
    const abs = Math.abs(minutes)
    const hours = Math.floor(abs / 60)
    const restMinutes = abs % 60
    const sign = '+'
    const value = hours > 0
      ? `${sign}${hours}h${restMinutes > 0 ? `${pad2(restMinutes)} min` : ''}`
      : `${sign}${abs} min`
    return minutes > 0 ? `${value} spóźn. START` : `${value} za szybko START`
  }

  function dashboardActivityEndEarlyDeltaLabel(deltaMinutes) {
    const minutes = Math.max(0, Math.round(Number(deltaMinutes) || 0))
    const hours = Math.floor(minutes / 60)
    const restMinutes = minutes % 60
    const value = hours > 0
      ? `${hours}h${restMinutes > 0 ? `${pad2(restMinutes)} min` : ''}`
      : `${minutes} min`
    return `${value} za szybko STOP`
  }

  function dashboardActivityEndLateDeltaLabel(deltaMinutes) {
    const minutes = Math.max(0, Math.round(Number(deltaMinutes) || 0))
    const hours = Math.floor(minutes / 60)
    const restMinutes = minutes % 60
    const value = hours > 0
      ? `+${hours}h${restMinutes > 0 ? `${pad2(restMinutes)} min` : ''}`
      : `+${minutes} min`
    return `${value} dłużej STOP`
  }

  function dashboardActivityBarCompanyKey(bar = {}) {
    return normalizeSearchText(dashboardActivityCleanCompanyLabel(bar.companyLabel || bar.locationLabel))
  }

  function dashboardActivityMatchedPlannedBar(workdayBar = {}, bars = []) {
    if (workdayBar?.kind !== 'workday') {
      return null
    }

    const plannedBars = (Array.isArray(bars) ? bars : []).filter((bar) => bar?.kind === 'planned')
    if (!plannedBars.length) {
      return null
    }

    const workdayCompanyKey = dashboardActivityBarCompanyKey(workdayBar)
    const maxLooseDistanceMs = 12 * 60 * 60 * 1000
    const candidates = plannedBars
      .map((planned) => {
        const startDistance = Math.abs(Number(workdayBar.startTs ?? 0) - Number(planned.startTs ?? 0))
        const overlaps = Number(planned.startTs ?? 0) <= Number(workdayBar.stopTs ?? 0) && Number(planned.stopTs ?? 0) >= Number(workdayBar.startTs ?? 0)
        const companyKey = dashboardActivityBarCompanyKey(planned)
        const sameCompany = Boolean(workdayCompanyKey && companyKey && workdayCompanyKey === companyKey)
        return { planned, startDistance, overlaps, sameCompany }
      })
      .filter((item) => item.overlaps || item.startDistance <= maxLooseDistanceMs)
      .sort((left, right) =>
        Number(right.sameCompany) - Number(left.sameCompany) ||
        Number(right.overlaps) - Number(left.overlaps) ||
        left.startDistance - right.startDistance,
      )

    return candidates[0]?.planned || null
  }

  function dashboardActivityWorkdayMatchesPlannedBar(workdayBar = {}, plannedBar = {}) {
    if (workdayBar?.kind !== 'workday' || plannedBar?.kind !== 'planned') {
      return false
    }

    const workdayStart = Number(workdayBar?.startTs ?? 0)
    const workdayStop = Number(workdayBar?.stopTs ?? 0)
    const plannedStart = Number(plannedBar?.startTs ?? 0)
    const plannedStop = Number(plannedBar?.stopTs ?? 0)
    if (![workdayStart, workdayStop, plannedStart, plannedStop].every(Number.isFinite)) {
      return false
    }

    const workdayCompanyKey = dashboardActivityBarCompanyKey(workdayBar)
    const plannedCompanyKey = dashboardActivityBarCompanyKey(plannedBar)
    if (workdayCompanyKey && plannedCompanyKey && workdayCompanyKey !== plannedCompanyKey) {
      return false
    }

    return workdayStart <= plannedStop && workdayStop >= plannedStart
  }

  function dashboardActivityPlannedStartMissing(plannedBar = {}, bars = [], nowTs = Date.now(), isToday = false) {
    if (!isToday || plannedBar?.kind !== 'planned') {
      return false
    }

    const plannedStartTs = Number(plannedBar?.startTs ?? 0)
    if (
      !isScheduleStartOverdue({
        plannedStartTs,
        nowTs,
      })
    ) {
      return false
    }

    return !(Array.isArray(bars) ? bars : []).some((bar) => (
      dashboardActivityWorkdayMatchesPlannedBar(bar, plannedBar)
    ))
  }

  function dashboardActivitySortTimestamp(bar = {}) {
    const startTs = Number(bar?.startTs ?? 0)
    const stopTs = Number(bar?.stopTs ?? 0)
    const safeStart = Number.isFinite(startTs) && startTs > 0 ? startTs : 0
    const safeStop = Number.isFinite(stopTs) && stopTs > 0 ? stopTs : 0
    if (bar?.kind === 'workday' && bar?.isRunning) {
      return safeStart || safeStop
    }
    if (bar?.kind === 'workday') {
      return Math.max(safeStart, safeStop)
    }
    return safeStart || safeStop
  }

  function dashboardActivityStartDeltaInfo(workdayBar = {}, bars = []) {
    const match = dashboardActivityMatchedPlannedBar(workdayBar, bars)
    if (!match) {
      return null
    }

    const deltaMinutes = Math.round((Number(workdayBar.startTs ?? 0) - Number(match.startTs ?? 0)) / 60000)
    if (Math.abs(deltaMinutes) <= DASHBOARD_ACTIVITY_START_DELTA_THRESHOLD_MINUTES) {
      return null
    }

    return {
      phase: 'start',
      kind: deltaMinutes > 0 ? 'late' : 'early',
      label: dashboardActivityStartDeltaLabel(deltaMinutes),
      deltaMinutes,
      plannedStartTs: Number(match.startTs ?? 0),
      actualStartTs: Number(workdayBar.startTs ?? 0),
    }
  }

  function dashboardActivityEndDeltaInfo(workdayBar = {}, bars = []) {
    if (workdayBar?.kind !== 'workday' || workdayBar?.isRunning) {
      return null
    }

    const match = dashboardActivityMatchedPlannedBar(workdayBar, bars)
    if (!match) {
      return null
    }

    const deltaMinutes = Math.round((Number(workdayBar.stopTs ?? 0) - Number(match.stopTs ?? 0)) / 60000)
    if (Math.abs(deltaMinutes) <= DASHBOARD_ACTIVITY_START_DELTA_THRESHOLD_MINUTES) {
      return null
    }

    const isLateStop = deltaMinutes > 0
    return {
      phase: 'end',
      kind: isLateStop ? 'end-late' : 'end-early',
      label: isLateStop
        ? dashboardActivityEndLateDeltaLabel(deltaMinutes)
        : dashboardActivityEndEarlyDeltaLabel(Math.abs(deltaMinutes)),
      deltaMinutes,
      plannedStopTs: Number(match.stopTs ?? 0),
      actualStopTs: Number(workdayBar.stopTs ?? 0),
    }
  }

  function dashboardActivityFitBarLabels(root = null) {
    const scope = root || document.getElementById('dashActivityCalendar')
    if (!scope) {
      return
    }

    scope.querySelectorAll('.dash-activity-timeline-bar').forEach((bar) => {
      const label = bar.querySelector('.dash-activity-timeline-bar-label')
      if (!(label instanceof HTMLElement)) {
        return
      }
      bar.classList.remove('is-label-hidden')
      const fits = Math.ceil(label.scrollWidth) <= Math.floor(label.clientWidth) + 1
      bar.classList.toggle('is-label-hidden', !fits)
    })
  }

  function dashboardDeduplicateActivityItems(items = []) {
    const result = []
    const workdayIndexes = new Map()
    ;(Array.isArray(items) ? items : []).forEach((item) => {
      if (item?.kind !== 'workday') {
        result.push(item)
        return
      }

      const workerKey = item.workerKey || normalizeSearchText(item.workerDisplayName || item.workerName)
      const startMinute = Math.round(Number(item.startTs ?? 0) / 60000)
      const stopMinute = Math.round(Number(item.stopTs ?? 0) / 60000)
      const companyKey = dashboardActivityBarCompanyKey(item)
      const key = [workerKey, startMinute, stopMinute, companyKey].join('|')
      const existingIndex = workdayIndexes.get(key)
      if (existingIndex == null) {
        workdayIndexes.set(key, result.length)
        result.push(item)
        return
      }

      const existing = result[existingIndex]
      const existingSource = String(existing?.sourceKind ?? '').trim().toLowerCase()
      const nextSource = String(item?.sourceKind ?? '').trim().toLowerCase()
      const shouldReplace =
        (existingSource !== 'workday' && nextSource === 'workday') ||
        (existing?.isRunning && !item?.isRunning)
      if (shouldReplace) {
        result[existingIndex] = item
      }
    })
    return result
  }

  function dashboardServicePlanAllocationId(allocation = {}, allowIdFallback = false) {
    return String(
      allocation?.allocationId ??
        allocation?.allocation_id ??
        allocation?.slotId ??
        allocation?.slot_id ??
        allocation?.workSlotId ??
        allocation?.work_slot_id ??
        (allowIdFallback ? allocation?.id : '') ??
        '',
    ).trim()
  }

  function dashboardServicePlanBlockId(block = {}) {
    return String(
      block?.serviceBlockId ??
        block?.service_block_id ??
        block?.id ??
        block?.teamId ??
        block?.team_id ??
        '',
    ).trim()
  }

  function dashboardServiceSourceAllocation(order = {}, serviceBlockId = '', allocationId = '') {
    const normalizedBlockId = String(serviceBlockId ?? '').trim()
    const normalizedAllocationId = String(allocationId ?? '').trim()
    if (!normalizedBlockId || !normalizedAllocationId) {
      return null
    }

    const serviceBlocks = Array.isArray(order?.serviceBlocks) ? order.serviceBlocks : []
    const block = serviceBlocks.find(
      (candidate) => dashboardServicePlanBlockId(candidate) === normalizedBlockId,
    ) ?? null
    const localAllocations = [
      ...(Array.isArray(block?.workAllocations) ? block.workAllocations : []),
      ...(Array.isArray(block?.workerAllocations) ? block.workerAllocations : []),
    ].map((allocation) => ({ allocation, allowIdFallback: false }))
    const localSlots = (Array.isArray(block?.slots) ? block.slots : [])
      .map((allocation) => ({ allocation, allowIdFallback: true }))
    const globalAllocations = [
      ...(Array.isArray(order?.workAllocations) ? order.workAllocations : []),
      ...(Array.isArray(order?.workerAllocations) ? order.workerAllocations : []),
    ]
      .filter((allocation) => {
        const allocationBlockId = String(
          allocation?.serviceBlockId ??
            allocation?.service_block_id ??
            allocation?.teamId ??
            allocation?.team_id ??
            '',
        ).trim()
        return allocationBlockId === normalizedBlockId
      })
      .map((allocation) => ({ allocation, allowIdFallback: false }))

    const match = [...localAllocations, ...localSlots, ...globalAllocations].find(
      (candidate) =>
        dashboardServicePlanAllocationId(candidate.allocation, candidate.allowIdFallback) ===
        normalizedAllocationId,
    )
    return match?.allocation ?? null
  }

  function dashboardServiceCanonicalWorkSlotKey(
    allocation = null,
    serviceBlockId = '',
    allocationId = '',
  ) {
    if (!allocation || typeof allocation !== 'object') {
      return ''
    }
    const direct = String(
      allocation?.workSlotKey ??
        allocation?.work_slot_key ??
        allocation?.key ??
        allocation?.slotId ??
        allocation?.slot_id ??
        allocation?.allocationId ??
        allocation?.allocation_id ??
        '',
    ).trim()
    if (direct) {
      return direct
    }
    const blockId = String(serviceBlockId ?? '').trim()
    const slotId = String(allocationId ?? '').trim()
    return blockId && slotId ? `block:${blockId}:slot:${slotId}` : slotId
  }

  function dashboardBuildPlannedOrderActivityItems(
    dayKey = todayYmd(),
    rangeStart = 0,
    rangeEnd = 0,
    options = {},
  ) {
    const resources = calendarTimelineResources()
    const plannedOrders = calendarTimelineExpandRecurringOrdersForDays(
      ordersListSourceOrders().filter((order) => isScheduleOrderActive(order)),
      [dayKey],
    )
    return plannedOrders
      .filter((order) => options.includeCompleted === true || !order?.completed)
      .flatMap((order) => {
        const slots = typeof calendarTimelineVisualOrderSlots === 'function'
          ? calendarTimelineVisualOrderSlots(order, resources)
          : ordersNormalizeOrderRows(order, resources).map((row) => ({ ...order, row }))
        return (Array.isArray(slots) ? slots : [])
          .filter((slot) =>
            options.includeAllAllocations === true ||
            resources[Number(slot?.row)]?.type === 'worker',
          )
          .flatMap((slot) => {
            const planned = calendarTimelineOrderPlannedBounds(slot)
            if (!planned) {
              return []
            }
            const clippedStart = Math.max(planned.startTs, rangeStart)
            const clippedStop = Math.min(planned.endTs, rangeEnd)
            if (clippedStop < rangeStart || clippedStart > rangeEnd) {
              return []
            }
            const row = Number(slot.row)
          const resource = resources[row] ?? {}
          const worker = resource.worker ?? null
          const identity = dashboardActivityWorkerIdentity(
            {
              workerName: resource.name,
              workerLogin: worker?.workerLogin ?? worker?.login,
              workerId: worker?.workerId ?? worker?.id,
            },
            worker,
          )
          const title = calendarTimelineOrderTitle(order)
          const clientLabel = ordersTimelineClientLabel(order)
          const addressLabel = ordersTimelineAddressLabel(order)
          const companyLabel = dashboardActivityCleanCompanyLabel(clientLabel) || dashboardActivityCleanCompanyLabel(addressLabel)
          const plannedCoordinates =
            dashboardActiveWorkerMapCoordinates(slot) ||
            dashboardActiveWorkerMapCoordinates(order)
            const orderId = String(slot?.id ?? order?.id ?? '').trim()
            const sourceOrderId = String(slot?.sourceOrderId ?? order?.sourceOrderId ?? order?.orderId ?? order?.id ?? '').trim()
            const taskId = String(
              slot?.taskId ??
                slot?.idTask ??
                order?.taskId ??
                order?.idTask ??
                order?.orderId ??
                order?.sourceOrderId ??
                order?.id ??
                '',
            ).trim()
            const allocationId = String(
              slot?.allocationId ??
                slot?.workSlotId ??
                slot?.slotId ??
                '',
            ).trim()
            const serviceBlockId = String(slot?.serviceBlockId ?? '').trim()
            const sourceAllocation = dashboardServiceSourceAllocation(order, serviceBlockId, allocationId)
            const workSlotKey = dashboardServiceCanonicalWorkSlotKey(
              sourceAllocation,
              serviceBlockId,
              allocationId,
            )
            const sourceRequiredMinutes = Math.max(
              0,
              Number(order?.requiredWorkMinutes ?? order?.serviceWorkMinutes ?? order?.standardWorkMinutes) || 0,
            )
            const allocationMinutes = Math.max(
              0,
              Number(slot?.slotWorkMinutes ?? slot?.minutes ?? slot?.workMinutes ?? slot?.durationMinutes) || 0,
            )
            const sourceStartTime = String(order?.startTime ?? order?.planStartTime ?? '').trim()
            const sourceEndTime = String(order?.endTime ?? order?.planEndTime ?? '').trim()
            const hasExplicitTimeRange = Boolean(
              calendarNormalizeTimeValue(sourceStartTime) && calendarNormalizeTimeValue(sourceEndTime),
            )
            const sourceAllocations = [
              ...(Array.isArray(order?.workAllocations) ? order.workAllocations : []),
              ...(Array.isArray(order?.workerAllocations) ? order.workerAllocations : []),
            ]
            const sourceServiceBlocks = Array.isArray(order?.serviceBlocks) ? order.serviceBlocks : []
            const hasExplicitAllocationTimeRange = [...sourceAllocations, ...sourceServiceBlocks].some(
              (allocation) => Boolean(
                calendarNormalizeTimeValue(allocation?.startTime ?? allocation?.planStartTime) &&
                calendarNormalizeTimeValue(allocation?.endTime ?? allocation?.planEndTime),
              ),
            )
            const hasReliablePlan = Boolean(
              sourceRequiredMinutes > 0 ||
                (sourceServiceBlocks.length > 0 && allocationMinutes > 0) ||
                hasExplicitTimeRange ||
                hasExplicitAllocationTimeRange,
            )
            const boundsDurationMinutes = Math.max(0, Math.round((planned.endTs - planned.startTs) / 60000))
            const plannedDurationMinutes = hasReliablePlan
              ? Math.max(1, Math.round(allocationMinutes || sourceRequiredMinutes || boundsDurationMinutes))
              : 0
            const occurrenceDateYmd = String(
            slot?.recurrenceOriginalDateYmd ||
              slot?.recurrenceOverrideDateYmd ||
              slot?.dateYmd ||
              order?.recurrenceOriginalDateYmd ||
              order?.recurrenceOverrideDateYmd ||
              order?.dateYmd ||
              dayKey,
          ).trim()

          return {
            ...identity,
            kind: 'planned',
            orgId: String(appState.session?.orgId ?? '').trim(),
            taskId,
            taskUpdatedAt: String(
              order?.updatedAt ??
                order?.updated_at ??
                slot?.updatedAt ??
                slot?.updated_at ??
                '',
            ).trim(),
            orderId,
            editorOrderId: String(order?.id ?? orderId).trim(),
            sourceOrderId,
            occurrenceDateYmd,
            dateYmd: String(slot?.dateYmd || order?.dateYmd || dayKey).trim(),
            isRecurringSeries: Boolean(order?.isRecurringSeries),
            isRecurringInstance: Boolean(order?.isRecurringInstance),
            recurrenceOverride: Boolean(order?.recurrenceOverride || calendarTimelineRecurringOverrideInfo(order)),
            workSlotKey: String(slot?.workSlotKey ?? '').trim(),
            executionWorkSlotKey: workSlotKey,
            allocationId,
            serviceBlockId,
            serviceBlockKind: String(slot?.serviceBlockKind ?? '').trim(),
            serviceBlockLabel: String(slot?.serviceBlockLabel ?? '').trim(),
            startTs: planned.startTs,
            stopTs: planned.endTs,
            clippedStart,
            clippedStop,
            label: title,
            locationLabel: companyLabel,
            companyLabel,
            addressLabel,
            clientId: String(slot?.clientId ?? order?.clientId ?? '').trim(),
            zoneId: String(slot?.zoneId ?? slot?.roomId ?? order?.zoneId ?? order?.roomId ?? '').trim(),
            hasReliablePlan,
            plannedDurationMinutes,
            plannedLat: plannedCoordinates?.lat ?? null,
            plannedLng: plannedCoordinates?.lng ?? null,
            isRunning: false,
          }
        })
      })
  }

  function dashboardLaneActivityBars(bars = []) {
    const sortedBars = bars
      .slice()
      .sort((left, right) => left.clippedStart - right.clippedStart || left.clippedStop - right.clippedStop)
    const laneByBar = new Map()
    const plannedLaneEnds = []
    const workdayLaneEnds = []

    sortedBars
      .filter((bar) => bar?.kind === 'planned')
      .forEach((bar) => {
        const lane = plannedLaneEnds.findIndex((laneEnd) => Number(bar.clippedStart) >= laneEnd)
        const resolvedLane = lane >= 0 ? lane : plannedLaneEnds.length
        plannedLaneEnds[resolvedLane] = Number(bar.clippedStop)
        laneByBar.set(bar, resolvedLane)
      })

    const workdayLaneOffset = Math.max(1, plannedLaneEnds.length)
    sortedBars
      .filter((bar) => bar?.kind !== 'planned')
      .forEach((bar) => {
        const lane = workdayLaneEnds.findIndex((laneEnd) => Number(bar.clippedStart) >= laneEnd)
        const resolvedLane = lane >= 0 ? lane : workdayLaneEnds.length
        workdayLaneEnds[resolvedLane] = Number(bar.clippedStop)
        laneByBar.set(bar, workdayLaneOffset + resolvedLane)
      })

    return sortedBars.map((bar) => ({
      ...bar,
      lane: laneByBar.get(bar) ?? 0,
    }))
  }

  function dashboardActivityPlannedConflictLabels(bar = {}, bars = []) {
    if (bar?.kind !== 'planned') {
      return []
    }
    const companyKey = dashboardActivityBarCompanyKey(bar)
    return (Array.isArray(bars) ? bars : [])
      .filter((candidate) => {
        if (!candidate || candidate === bar || candidate.kind !== 'planned') {
          return false
        }
        const candidateCompanyKey = dashboardActivityBarCompanyKey(candidate)
        const differentLocation = companyKey && candidateCompanyKey
          ? companyKey !== candidateCompanyKey
          : dashboardActivityCleanCompanyLabel(bar.companyLabel) !== dashboardActivityCleanCompanyLabel(candidate.companyLabel)
        return (
          differentLocation &&
          Number(bar.startTs) < Number(candidate.stopTs) &&
          Number(candidate.startTs) < Number(bar.stopTs)
        )
      })
      .map((candidate) => dashboardActivityCleanCompanyLabel(candidate.companyLabel))
      .filter((label, index, labels) => label && labels.indexOf(label) === index)
  }

  function renderDashboardActivityCalendar(rows = []) {
    const root = document.getElementById('dashActivityCalendar')
    if (!root) {
      return
    }

    const safeRows = Array.isArray(rows) ? rows : []
    const now = new Date()
    const dayKey = dashboardActivityDayKey()
    const isToday = dayKey === todayYmd()
    const rangeStartDate = new Date(`${dayKey}T04:00:00`)
    const rangeEndDate = new Date(`${dayKey}T23:00:00`)
    const rangeStart = rangeStartDate.getTime()
    const rangeEnd = rangeEndDate.getTime()
    const nowTs = isToday ? now.getTime() : rangeEnd
    const snappedNow = new Date(now)
    snappedNow.setMinutes(Math.floor(snappedNow.getMinutes() / DASHBOARD_TIMELINE_SNAP_MINUTES) * DASHBOARD_TIMELINE_SNAP_MINUTES, 0, 0)
    const nowLeft = Math.max(0, Math.min(100, dashboardTimelinePercent(snappedNow.getTime(), rangeStart, rangeEnd)))
    const hourLabel = (timestamp) => {
      const date = new Date(timestamp)
      return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
    }
    const tickLabels = Array.from({ length: 20 }, (_, index) => {
      const hour = 4 + index
      const timestamp = new Date(`${dayKey}T${pad2(hour)}:00:00`).getTime()
      const left = Math.max(0, Math.min(100, dashboardTimelinePercent(timestamp, rangeStart, rangeEnd)))
      return `<span class="is-hour" style="--dash-left:${left.toFixed(3)}%">${escapeHtml(pad2(hour))}</span>`
    })

    const workdayRows = dashboardActivityRowsForDay(safeRows, dayKey)
    const sourceRows = dashboardActivitySourceRowsForDay(dayKey)
    const activityItems = dashboardDeduplicateActivityItems([
      ...dashboardBuildWorkdayActivityItems(workdayRows, dayKey, rangeStart, rangeEnd, nowTs, sourceRows),
      ...dashboardBuildPlannedOrderActivityItems(dayKey, rangeStart, rangeEnd),
    ])
    const grouped = new Map()
    activityItems.forEach((item) => {
      const key = item.workerKey || `n:${normalizeSearchText(item.workerDisplayName)}`
      if (!grouped.has(key)) {
        grouped.set(key, {
          workerKey: key,
          workerSortKey: item.workerSortKey,
          workerDisplayName: item.workerDisplayName,
          workerName: item.workerName,
          workerLogin: item.workerLogin,
          bars: [],
          companyLabels: [],
        })
      }
      const group = grouped.get(key)
      group.bars.push(item)
      if (item.companyLabel && !group.companyLabels.includes(item.companyLabel)) {
        group.companyLabels.push(item.companyLabel)
      }
    })

    const items = [...grouped.values()]
      .map((group) => {
        const laneBars = dashboardLaneActivityBars(group.bars)
        const bars = laneBars.map((bar) => ({
          ...bar,
          startDelta: dashboardActivityStartDeltaInfo(bar, laneBars),
          endDelta: dashboardActivityEndDeltaInfo(bar, laneBars),
          planConflictLabels: dashboardActivityPlannedConflictLabels(bar, laneBars),
        }))
        const planConflictLabels = bars
          .flatMap((bar) => (
            bar.planConflictLabels?.length
              ? [dashboardActivityCleanCompanyLabel(bar.companyLabel), ...bar.planConflictLabels]
              : []
          ))
          .filter((label, index, labels) => label && labels.indexOf(label) === index)
        const hasPlanConflict = planConflictLabels.length > 1
        const missingStartBars = bars.filter((bar) => dashboardActivityPlannedStartMissing(bar, bars, nowTs, isToday))
        const workdayBars = bars.filter((bar) => bar?.kind === 'workday')
        const runningWorkdayBars = workdayBars.filter((bar) => bar?.isRunning)
        const latestRunningActivityTs = Math.max(0, ...runningWorkdayBars.map((bar) => dashboardActivitySortTimestamp(bar)))
        const latestWorkdayActivityTs = Math.max(0, ...workdayBars.map((bar) => dashboardActivitySortTimestamp(bar)))
        const latestActivityTs = latestWorkdayActivityTs || Math.max(0, ...bars.map((bar) => dashboardActivitySortTimestamp(bar)))
        const missingStartTs = Math.min(
          ...missingStartBars
            .map((bar) => Number(bar?.startTs ?? 0))
            .filter((value) => Number.isFinite(value) && value > 0),
        )
        const laneCount = bars.length ? Math.max(2, ...bars.map((bar) => Number(bar.lane) + 1)) : 1
        const workerButton = group.workerName === '-'
          ? `<span>${escapeHtml(group.workerDisplayName)}</span>`
          : `<button class="dash-worker-link" type="button" data-dash-worker-login="${escapeHtml(group.workerLogin)}" data-dash-worker-name="${escapeHtml(group.workerName)}">${escapeHtml(group.workerDisplayName)}</button>`
        const deltaMarkersHtml = bars
          .flatMap((bar) => [
            bar.startDelta ? { bar, delta: bar.startDelta, timestamp: bar.startDelta.actualStartTs } : null,
            bar.endDelta ? { bar, delta: bar.endDelta, timestamp: bar.endDelta.actualStopTs } : null,
          ])
          .filter(Boolean)
          .map((item) => {
            const { bar, delta, timestamp } = item
            const left = Math.max(0, Math.min(100, dashboardTimelinePercent(timestamp, rangeStart, rangeEnd)))
            const groupStartMarker = Math.max(0, Math.min(100, dashboardTimelinePercent(bar.startTs, rangeStart, rangeEnd)))
            const groupEndMarker = Math.max(0, Math.min(100, dashboardTimelinePercent(bar.stopTs, rangeStart, rangeEnd)))
            let groupStart = Math.min(groupStartMarker, groupEndMarker)
            let groupEnd = Math.max(groupStartMarker, groupEndMarker)
            groupStart = Math.max(0, Math.min(98, groupStart))
            groupEnd = Math.max(groupStart + 2, Math.min(100, groupEnd))
            const groupCenter = (groupStart + groupEnd) / 2
            const markerLeft = delta.phase === 'end' ? 50 : 0
            const markerRight = delta.phase === 'end' ? 0 : 50
            const lane = Number(bar.lane) || 0
            const phaseLabel = delta.phase === 'end' ? 'STOP' : 'START'
            const plannedLabel = hourLabel(delta.phase === 'end' ? delta.plannedStopTs : delta.plannedStartTs)
            const actualLabel = hourLabel(delta.phase === 'end' ? delta.actualStopTs : delta.actualStartTs)
            const title = `Plan ${phaseLabel}: ${plannedLabel} · Realny ${phaseLabel}: ${actualLabel} · Różnica: ${delta.label}`
            return `
              <span
                class="dash-activity-delta-marker dash-activity-delta-marker--${escapeHtml(delta.kind)} dash-activity-delta-marker--phase-${escapeHtml(delta.phase === 'end' ? 'end' : 'start')}"
                style="--dash-marker-anchor:${left.toFixed(3)}%;--dash-marker-group-start:${groupStart.toFixed(3)}%;--dash-marker-group-end:${groupEnd.toFixed(3)}%;--dash-marker-group-center:${groupCenter.toFixed(3)}%;--dash-marker-left:${markerLeft}%;--dash-marker-right:${markerRight}%;--dash-lane:${lane};"
                title="${escapeHtml(title)}"
              >${escapeHtml(delta.label)}</span>
            `
          })
          .join('')
        const hasDeltaMarkers = Boolean(deltaMarkersHtml)
        const barsHtml = bars
          .map((bar) => {
            const left = Math.max(0, Math.min(100, dashboardTimelinePercent(bar.clippedStart, rangeStart, rangeEnd)))
            const right = Math.max(0, Math.min(100, dashboardTimelinePercent(bar.clippedStop, rangeStart, rangeEnd)))
            const width = Math.max(1.8, right - left)
            const classes = ['dash-activity-timeline-bar']
            if (bar.isRunning) classes.push('is-running')
            if (bar.kind === 'planned') classes.push('is-planned')
            if (bar.planConflictLabels?.length) classes.push('is-plan-conflict')
            const isMissingStart = dashboardActivityPlannedStartMissing(bar, bars, nowTs, isToday)
            if (isMissingStart) classes.push('is-missing-start')
            const timeRange = bar.isRunning ? `${hourLabel(bar.startTs)}-` : `${hourLabel(bar.startTs)}-${hourLabel(bar.stopTs)}`
            const companyLabel = dashboardActivityCleanCompanyLabel(bar.companyLabel || bar.locationLabel) || ''
            const showCompanyOnBar = bar.kind === 'planned'
            const displayCompanyLabel = showCompanyOnBar ? companyLabel : ''
            const workDurationLabel = bar.kind === 'workday' ? String(bar.label ?? '').trim() : ''
            const barStatus = bar.kind === 'planned' ? 'Plan' : 'Dzień pracy'
            const startDeltaTitle = bar.startDelta ? ` · ${bar.startDelta.label}` : ''
            const endDeltaTitle = bar.endDelta ? ` · ${bar.endDelta.label}` : ''
            const durationTitle = workDurationLabel ? ` · czas ${workDurationLabel}` : ''
            const missingStartTitle = isMissingStart ? ' · BRAK START: pracownik powinien być już na obiekcie' : ''
            const workdayStartTitle = bar.kind === 'workday' && companyLabel
              ? ` · START dnia zeskanowany w: ${companyLabel}`
              : ''
            const planConflictTitle = bar.planConflictLabels?.length
              ? ` · KOLIZJA PLANU z: ${bar.planConflictLabels.join(', ')}`
              : ''
            const clickTitle = bar.kind === 'planned'
              ? ' · Kliknij dwukrotnie: edytuj zlecenie'
              : bar.kind === 'workday'
                ? ' · Kliknij dwukrotnie: edytuj dzień pracy'
                : ''
            const title = `${group.workerDisplayName}: ${barStatus} ${timeRange}${durationTitle}${displayCompanyLabel ? ` · ${displayCompanyLabel}` : ''}${workdayStartTitle}${missingStartTitle}${planConflictTitle}${startDeltaTitle}${endDeltaTitle}${clickTitle}`
            const isCompletedWorkdayBar = bar.kind === 'workday' && !bar.isRunning
            const barLabel = bar.kind === 'planned'
              ? timeRange
              : isCompletedWorkdayBar
                ? (workDurationLabel || durationSecondsToHm(Math.max(0, Math.floor((Number(bar.stopTs ?? 0) - Number(bar.startTs ?? 0)) / 1000))))
                : [timeRange, workDurationLabel ? `czas ${workDurationLabel}` : '', displayCompanyLabel].filter(Boolean).join(' · ')
            const plannedAttrs = bar.kind === 'planned' && bar.orderId
              ? [
                  'role="button"',
                  'tabindex="0"',
                  'data-dash-activity-order-edit="1"',
                  `aria-label="${escapeHtml(`Edytuj zlecenie ${barLabel || timeRange}`)}"`,
                  `data-calendar-timeline-order-id="${escapeHtml(bar.orderId)}"`,
                  `data-calendar-timeline-source-order-id="${escapeHtml(bar.sourceOrderId || bar.orderId)}"`,
                  `data-calendar-timeline-date="${escapeHtml(bar.dateYmd || dayKey)}"`,
                  bar.occurrenceDateYmd ? `data-calendar-timeline-occurrence-date="${escapeHtml(bar.occurrenceDateYmd)}"` : '',
                  bar.workSlotKey ? `data-calendar-timeline-work-slot-key="${escapeHtml(bar.workSlotKey)}"` : '',
                  bar.serviceBlockId ? `data-calendar-timeline-service-block-id="${escapeHtml(bar.serviceBlockId)}"` : '',
                  bar.serviceBlockKind ? `data-calendar-timeline-service-block-kind="${escapeHtml(bar.serviceBlockKind)}"` : '',
                  bar.serviceBlockLabel ? `data-calendar-timeline-service-block-label="${escapeHtml(bar.serviceBlockLabel)}"` : '',
                  bar.isRecurringSeries ? 'data-calendar-timeline-recurring-series="1"' : '',
                  bar.isRecurringInstance ? 'data-calendar-timeline-recurring-instance="1"' : '',
                  bar.recurrenceOverride ? 'data-calendar-timeline-recurrence-override="1"' : '',
                ].filter(Boolean).join(' ')
              : ''
            const workdayAttrs = bar.kind === 'workday'
              ? [
                  'role="button"',
                  'tabindex="0"',
                  'data-dash-activity-workday-edit="1"',
                  `aria-label="${escapeHtml(`Edytuj dzień pracy ${barLabel || timeRange}`)}"`,
                  `data-dash-activity-event-day="${escapeHtml(dayKey)}"`,
                  bar.eventId ? `data-dash-activity-event-id="${escapeHtml(bar.eventId)}"` : '',
                  bar.workdayId ? `data-dash-activity-workday-id="${escapeHtml(bar.workdayId)}"` : '',
                  bar.sourceStartAt ? `data-dash-activity-source-start="${escapeHtml(bar.sourceStartAt)}"` : '',
                  bar.sourceStopAt ? `data-dash-activity-source-stop="${escapeHtml(bar.sourceStopAt)}"` : '',
                  bar.workerLogin ? `data-dash-activity-worker-login="${escapeHtml(bar.workerLogin)}"` : '',
                  bar.workerName ? `data-dash-activity-worker-name="${escapeHtml(bar.workerName)}"` : '',
                ].filter(Boolean).join(' ')
              : ''
            return `
              <span
                class="${classes.join(' ')}"
                style="--dash-left:${left.toFixed(3)}%;--dash-width:${width.toFixed(3)}%;--dash-lane:${Number(bar.lane) || 0};"
                title="${escapeHtml(title)}"
                ${plannedAttrs || workdayAttrs}
              >
                <span class="dash-activity-timeline-bar-label">${escapeHtml(barLabel || timeRange)}</span>
              </span>
            `
          })
          .join('')
        const companyLabel = hasPlanConflict
          ? `Kolizja planu: ${planConflictLabels.length} obiekty`
          : dashboardActivityCompanyLabelForGroup(bars, group.companyLabels)
        const companyMetaTitle = hasPlanConflict
          ? `Kolidujące obiekty: ${planConflictLabels.join(' · ')}`
          : companyLabel
        return {
          startTs: bars.length ? Math.min(...bars.map((bar) => bar.startTs)) : Number.MAX_SAFE_INTEGER,
          hasMissingStart: missingStartBars.length > 0,
          missingStartTs: Number.isFinite(missingStartTs) ? missingStartTs : Number.MAX_SAFE_INTEGER,
          hasRunningActivity: runningWorkdayBars.length > 0,
          latestRunningActivityTs,
          hasWorkdayActivity: workdayBars.length > 0,
          latestActivityTs,
          companyLabel,
          workerSortKey: group.workerSortKey,
          html: `
            <div class="dash-activity-timeline-row${hasPlanConflict ? ' has-plan-conflict' : ''}" style="--dash-lane-count:${laneCount};--dash-row-height:${laneCount * 22 + (hasDeltaMarkers ? 36 : 14)}px;--dash-track-height:${laneCount * 22 + (hasDeltaMarkers ? 28 : 6)}px;">
              <div class="dash-activity-timeline-person">${workerButton}</div>
              <div class="dash-activity-timeline-track">
                ${deltaMarkersHtml}
                ${barsHtml}
              </div>
              <div class="dash-activity-timeline-meta" title="${escapeHtml(companyMetaTitle || '')}">${escapeHtml(companyLabel || '')}</div>
            </div>
          `,
        }
      })
      .sort((a, b) => {
        if (a.hasMissingStart !== b.hasMissingStart) {
          return Number(b.hasMissingStart) - Number(a.hasMissingStart)
        }
        const byWorker = String(a.workerSortKey ?? '').localeCompare(String(b.workerSortKey ?? ''), 'pl', {
          sensitivity: 'base',
        })
        if (a.hasMissingStart && b.hasMissingStart) {
          return a.missingStartTs - b.missingStartTs || byWorker || a.startTs - b.startTs
        }
        if (a.hasRunningActivity !== b.hasRunningActivity) {
          return Number(b.hasRunningActivity) - Number(a.hasRunningActivity)
        }
        if (a.hasRunningActivity && b.hasRunningActivity) {
          return b.latestRunningActivityTs - a.latestRunningActivityTs || byWorker || a.startTs - b.startTs
        }
        if (a.hasWorkdayActivity !== b.hasWorkdayActivity) {
          return Number(b.hasWorkdayActivity) - Number(a.hasWorkdayActivity)
        }
        return b.latestActivityTs - a.latestActivityTs || byWorker || a.startTs - b.startTs
      })

    if (!items.length) {
      root.innerHTML = `
        <div class="dash-activity-calendar-empty">${
          appState.dashboardActivityDayLoading
            ? 'Pobieranie aktywności dla wybranego dnia...'
            : 'Brak aktywności do pokazania na osi dnia.'
        }</div>
      `
      return
    }

    root.innerHTML = `
      <div class="dash-activity-timeline-axis" aria-hidden="true">
        <div class="dash-activity-timeline-axis-spacer"></div>
        <div class="dash-activity-timeline-ticks">${tickLabels.join('')}</div>
        <div></div>
      </div>
      <div class="dash-activity-timeline" style="--dash-now-left:${nowLeft.toFixed(3)}%;" aria-label="Oś aktywności dnia">
        ${items.map((item) => item.html).join('')}
      </div>
    `
    window.requestAnimationFrame(() => dashboardActivityFitBarLabels(root))
  }

  function renderDashboardEvents(rows) {
    const eventsList = document.getElementById('dashEventsList')
    const eventsPill = document.getElementById('dashEventsPill')
    appState.dashboardTodayRows = Array.isArray(rows) ? [...rows] : []
    renderDashboardActivityCalendar(rows)
    dashboardApplyActivityView()
    if (appState.currentRoute === 'calendar' && document.getElementById('calendarTimelinePrototype')) {
      window.requestAnimationFrame(() => renderCalendarView())
    }

    if (!eventsList) {
      return
    }

    if (eventsPill) {
      eventsPill.textContent = String(rows.length)
    }

    if (!rows.length) {
      eventsList.innerHTML = `
        <div class="list-row dash-events-row">
          <div class="muted">Brak danych</div>
          <div class="muted">-</div>
          <div class="muted">-</div>
          <div class="muted">-</div>
          <div class="muted ta-right">-</div>
        </div>
      `
      eventsList.scrollTop = 0
      window.requestAnimationFrame(() => {
        eventsList.scrollTop = 0
      })
      return
    }

    const sortedRows = rows
      .map((row, sourceIndex) => ({
        row,
        sourceIndex,
        workerSortKey: dashboardWorkerSurnameSortKey(row?.workerName),
      }))
      .sort((left, right) =>
        String(left.workerSortKey ?? '').localeCompare(String(right.workerSortKey ?? ''), 'pl', { sensitivity: 'base' }),
      )

    eventsList.innerHTML = sortedRows
      .map(
        ({ row, sourceIndex }) => {
          const startValue = dashboardClockLabelToHm(row.qrStart, '--:--')
          const stopValue = row?.isRunning ? '--:--' : dashboardClockLabelToHm(row.qrStop, '--:--')
          const workValue = dashboardDurationLabelToHm(row.duration, '00:00')
          const workerName = String(row.workerName ?? '').trim() || '-'
          const workerDisplayName = dashboardWorkerSurnameDisplayName(workerName)
          const workerLogin = String(row.workerLogin ?? row.id ?? '').trim()
          const clientLabel = dashboardResolveClientLabel(row)
          const zoneLabel = String(row.activeZone ?? '').trim() || '-'
          const workerCell = workerName === '-'
            ? `<span>${escapeHtml(workerDisplayName)}</span>`
            : `<button class="dash-worker-link" type="button" data-dash-worker-login="${escapeHtml(workerLogin)}" data-dash-worker-name="${escapeHtml(workerName)}">${escapeHtml(workerDisplayName)}</button>`
          const clientCell = clientLabel === '-'
            ? '<span class="muted">-</span>'
            : `<button class="dash-entity-link" type="button" data-dash-history-kind="objects" data-dash-row-index="${sourceIndex}">${escapeHtml(clientLabel)}</button>`
          const zoneCell = zoneLabel === '-'
            ? '<span class="muted">-</span>'
            : `<button class="dash-entity-link" type="button" data-dash-history-kind="zones" data-dash-row-index="${sourceIndex}">${zoneNameWithQrHtml(zoneLabel, row)}</button>`
          return `
        <div class="list-row dash-events-row">
          <div>${workerCell}</div>
          <div>${escapeHtml(String(row.entriesCount ?? 0))}</div>
          <div>${clientCell}</div>
          <div>${zoneCell}</div>
          <div class="ta-right">
            <div class="dash-time-stack">
              <div class="dash-time-line dash-time-line--start">
                <span class="dash-time-label">Godzina START</span>
                <span class="dash-time-colon">:</span>
                <span class="dash-time-value">${escapeHtml(startValue)}</span>
              </div>
              <div class="dash-time-line dash-time-line--stop">
                <span class="dash-time-label">Godzina STOP</span>
                <span class="dash-time-colon">:</span>
                <span class="dash-time-value">${escapeHtml(stopValue)}</span>
              </div>
              <div class="dash-time-line dash-time-line--work">
                <span class="dash-time-label">Czas pracy</span>
                <span class="dash-time-colon">:</span>
                <span class="dash-time-value time-duration">${escapeHtml(workValue)}</span>
              </div>
            </div>
          </div>
        </div>
      `
        },
      )
      .join('')
    eventsList.scrollTop = 0
    window.requestAnimationFrame(() => {
      eventsList.scrollTop = 0
    })
  }

  function dashboardScheduleTimeToMinutes(value) {
    const raw = String(value ?? '').trim()
    if (!raw || raw === '-') {
      return -1
    }

    const match = raw.match(/(\d{1,2})[.:](\d{2})/)
    if (!match) {
      return -1
    }

    const hour = Number(match[1])
    const minute = Number(match[2])
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return -1
    }

    return hour * 60 + minute
  }

  function dashboardScheduleStartTimestamp(dayKey, startMinutes) {
    const normalizedDayKey = String(dayKey ?? '').trim()
    const minutes = Number(startMinutes)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDayKey) || !Number.isFinite(minutes) || minutes < 0) {
      return 0
    }

    const dayStart = new Date(`${normalizedDayKey}T00:00:00`)
    const dayStartMs = dayStart.getTime()
    if (!Number.isFinite(dayStartMs)) {
      return 0
    }

    return dayStartMs + Math.floor(minutes) * 60 * 1000
  }

  function dashboardCanonicalWorkerId(value) {
    const raw = String(value ?? '').trim().toUpperCase()
    return /^W\d+$/.test(raw) ? raw : ''
  }

  function dashboardWorkerIdIdentityKeys(workerId) {
    const canonicalId = dashboardCanonicalWorkerId(workerId)
    const keys = new Set()
    if (!canonicalId) {
      return keys
    }

    const normalizedId = normalizeSearchText(canonicalId)
    if (normalizedId) {
      keys.add(`id:${normalizedId}`)
    }

    return keys
  }

  function dashboardResolveWorkerIdValue(row, workersPool = []) {
    void workersPool
    const candidates = [
      row?.workerId,
      row?.worker?.workerId,
      row?.employeeId,
      row?.employee?.workerId,
      row?.id,
    ]

    for (const candidate of candidates) {
      const workerId = dashboardCanonicalWorkerId(candidate)
      if (workerId) {
        return workerId
      }
    }

    return ''
  }

  function dashboardParseDurationLabelToSeconds(value) {
    const raw = String(value ?? '').trim()
    if (!raw || raw === '-' || raw === '--:--:--' || raw === '-:-:-') {
      return 0
    }

    const parts = raw.split(':').map((part) => Number(part))
    if (parts.length === 2 && parts.every((part) => Number.isFinite(part) && part >= 0)) {
      return Math.floor(parts[0] * 3600 + parts[1] * 60)
    }
    if (parts.length === 3 && parts.every((part) => Number.isFinite(part) && part >= 0)) {
      return Math.floor(parts[0] * 3600 + parts[1] * 60 + parts[2])
    }
    return 0
  }

  function dashboardResolveDayKey(row, fallback = '') {
    const direct = String(row?.dayKey ?? '').trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) {
      return direct
    }

    const candidates = [row?.startAt, row?.endAt, row?.dayStartAt, row?.dayEndAt]
    for (const candidate of candidates) {
      const iso = toIso(candidate)
      if (iso) {
        return iso.slice(0, 10)
      }
    }

    const normalizedFallback = String(fallback ?? '').trim()
    return /^\d{4}-\d{2}-\d{2}$/.test(normalizedFallback) ? normalizedFallback : ''
  }

  function dashboardResolveWorkerIdentityKeys(row) {
    const keys = []
    const login = normalizeSearchText(row?.workerLogin ?? row?.login ?? row?.workerId ?? row?.id)
    const name = normalizeSearchText(row?.workerName ?? row?.name)
    if (login) {
      keys.push(`l:${login}`)
    }
    if (name) {
      keys.push(`n:${name}`)
    }
    return [...new Set(keys)]
  }

  function dashboardPickEarliestIso(currentIso, candidateIso) {
    const current = toIso(currentIso)
    const candidate = toIso(candidateIso)
    if (!candidate) {
      return current || ''
    }
    if (!current) {
      return candidate
    }
    return new Date(candidate).getTime() < new Date(current).getTime() ? candidate : current
  }

  function dashboardResolveEarliestStartForKeys(keys = [], markerMap = new Map(), anyMap = new Map()) {
    let firstMarker = ''
    let firstAny = ''
    keys.forEach((key) => {
      firstMarker = dashboardPickEarliestIso(firstMarker, markerMap.get(key))
      firstAny = dashboardPickEarliestIso(firstAny, anyMap.get(key))
    })
    return firstMarker || firstAny || ''
  }

  function dashboardResolveTodayRowAliasKeys(row) {
    return dashboardWorkerIdIdentityKeys(dashboardResolveWorkerIdValue(row))
  }

  function dashboardApplyFirstQrStartToday(todayRows = [], eventRows = []) {
    const rows = Array.isArray(todayRows) ? todayRows : []
    const sourceEvents = Array.isArray(eventRows) ? eventRows : []
    if (!rows.length) {
      return rows
    }

    const todayKey = todayYmd()
    const firstMarkerByWorker = new Map()
    const firstAnyStartByWorker = new Map()

    sourceEvents.forEach((row) => {
      if (dashboardResolveDayKey(row) !== todayKey) {
        return
      }

      const startIso = toIso(row?.startAt ?? row?.dayStartAt)
      if (!startIso) {
        return
      }

      const workerKeys = dashboardResolveWorkerIdentityKeys(row)
      if (!workerKeys.length) {
        return
      }

      const typeLabel = eventTypeInfo(row).label
      const isQrStartMarker = typeLabel === 'QR START' || typeLabel === 'QR START + STOP'

      workerKeys.forEach((key) => {
        const anyIso = firstAnyStartByWorker.get(key)
        firstAnyStartByWorker.set(key, dashboardPickEarliestIso(anyIso, startIso))
        if (isQrStartMarker) {
          const markerIso = firstMarkerByWorker.get(key)
          firstMarkerByWorker.set(key, dashboardPickEarliestIso(markerIso, startIso))
        }
      })
    })

    return rows.map((row) => {
      const workerKeys = dashboardResolveWorkerIdentityKeys(row)
      if (!workerKeys.length) {
        return row
      }

      const firstStartIso = dashboardResolveEarliestStartForKeys(
        workerKeys,
        firstMarkerByWorker,
        firstAnyStartByWorker,
      )
      let qrStart = String(row?.qrStart ?? '').trim()
      if (firstStartIso) {
        const firstStartLabel = workerDetailIsoToTime(firstStartIso)
        if (firstStartLabel && firstStartLabel !== '-') {
          qrStart = firstStartLabel
        }
      }

      return qrStart
        ? {
            ...row,
            qrStart,
          }
        : row
    })
  }

  function dashboardEventDurationSec(row) {
    const direct = Number(row?.durationSec ?? 0)
    if (Number.isFinite(direct) && direct > 0) {
      return Math.floor(direct)
    }

    const startIso = toIso(row?.startAt)
    const endIso = toIso(row?.endAt)
    if (!startIso || !endIso) {
      return 0
    }

    const diff = Math.floor((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000)
    return Number.isFinite(diff) && diff > 0 ? diff : 0
  }

  function dashboardIsQrCodeLike(value) {
    const normalized = String(value ?? '').trim().toUpperCase()
    if (!normalized || normalized === '-') {
      return false
    }
    return /^(?=[A-Z0-9-]*\d)[A-Z0-9-]{3,}$/.test(normalized)
  }

  function dashboardRowIsIndividual(row) {
    const clientIndId = String(row?.clientIndId ?? '').trim()
    if (clientIndId) {
      return true
    }
    const haystack = [row?.clientStatus, row?.comment, row?.dayComment, row?.endReason]
      .map((value) => String(value ?? '').toLowerCase())
      .join(' ')
    return haystack.includes('indywid') || haystack.includes('individual')
  }

  function dashboardRowIsSpecial(row) {
    const haystack = [row?.strefa, row?.zoneName, row?.roomId, row?.zoneId, row?.clientStatus, row?.comment, row?.dayComment]
      .map((value) => String(value ?? '').toLowerCase())
      .join(' ')
    return haystack.includes('specjal') || haystack.includes('special')
  }

  function dashboardRowLooksLikeMarker(row) {
    const type = eventTypeInfo(row).label
    if (type === 'QR START' || type === 'QR STOP') {
      return true
    }

    const candidates = [row?.zoneId, row?.roomId, row?.utilityRoomId, row?.strefa, row?.zoneName, row?.dayStartObject, row?.dayStopObject]
    return candidates.some((value) => dashboardIsQrCodeLike(value))
  }

  function dashboardResolveWorkerLabel(row) {
    return String(row?.workerName ?? row?.workerLogin ?? '').trim() || 'Nieznany pracownik'
  }

  function resolveClientLabelWithQrFallback(clientLabel, qrCandidate) {
    const rawLabel = String(clientLabel ?? '').trim()
    const normalizedLabel = normalizeSearchText(rawLabel)
    const qrCode = reportHistoryNormalizeQrCode(qrCandidate)
    const unnamedLabels = new Set(['unassigned', 'brak klienta', 'nieprzypisany', 'unknown', 'none'])
    const isUnnamedClient = !rawLabel || rawLabel === '-' || unnamedLabels.has(normalizedLabel)
    if (!isUnnamedClient) {
      return rawLabel
    }
    return qrCode || '-'
  }

  function dashboardResolveClientLabel(row) {
    const rawClientLabel = String(row?.clientName ?? row?.klient ?? row?.activeClient ?? '').trim()
    const qrCandidate = String(
      row?.zoneId ??
        row?.roomId ??
        row?.utilityRoomId ??
        row?.dayStartObject ??
        row?.dayStopObject ??
        row?.strefa ??
        row?.zoneName ??
        '',
    ).trim()
    return resolveClientLabelWithQrFallback(rawClientLabel, qrCandidate)
  }

  function resolveZoneByQrCandidate(value) {
    const code = reportHistoryNormalizeQrCode(value)
    if (!code) {
      return null
    }
    const normalizedCode = normalizeSearchText(code)
    return (Array.isArray(appState.zones) ? appState.zones : []).find((zone) => {
      const candidates = [
        zone?.id,
        zone?.zoneId,
        zone?.qr,
        zone?.qrCode,
        zone?.roomId,
        zone?.utilityRoomId,
      ]
      return candidates.some((candidate) => normalizeSearchText(reportHistoryNormalizeQrCode(candidate) || candidate) === normalizedCode)
    }) ?? null
  }

  function resolveZoneNameByQrCandidate(value) {
    const zone = resolveZoneByQrCandidate(value)
    const label = String(zone?.name ?? zone?.zone ?? zone?.zoneName ?? zone?.strefa ?? '').trim()
    return label && label !== '-' && !dashboardIsQrCodeLike(label) ? label : ''
  }

  function dashboardResolveZoneLabel(row) {
    const codeCandidates = [
      row?.activeZoneId,
      row?.zoneId,
      row?.roomId,
      row?.utilityRoomId,
      row?.qr,
      row?.qrCode,
    ]
    for (const candidate of codeCandidates) {
      const label = resolveZoneNameByQrCandidate(candidate)
      if (label) {
        return label
      }
    }

    const rawLabel = String(row?.zoneName ?? row?.strefa ?? row?.activeZone ?? '').trim()
    const rawLabelResolved = resolveZoneNameByQrCandidate(rawLabel)
    if (rawLabelResolved) {
      return rawLabelResolved
    }
    if (rawLabel && !reportHistoryNormalizeQrCode(rawLabel)) {
      return rawLabel
    }

    return '-'
  }

  function zoneQrCodeFromRow(row = {}) {
    const candidates = [
      row?.activeZoneId,
      row?.zoneId,
      row?.roomId,
      row?.utilityRoomId,
      row?.workdayUtilityRoomId,
      row?.qr,
      row?.qrCode,
      row?.id,
      row?.dayStartObject,
      row?.dayStopObject,
      row?.startObject,
      row?.stopObject,
    ]

    for (const candidate of candidates) {
      const code = reportHistoryNormalizeQrCode(candidate)
      if (code && code !== '-') {
        return code
      }
    }

    return ''
  }

  function zoneNameWithQrHtml(zoneName, source = {}) {
    const name = String(zoneName ?? '').trim() || '-'
    const qr = typeof source === 'string' ? reportHistoryNormalizeQrCode(source) : zoneQrCodeFromRow(source)
    const normalizedName = normalizeSearchText(name)
    const normalizedQr = normalizeSearchText(qr)
    const showQr = Boolean(qr && qr !== '-' && normalizedQr && normalizedQr !== normalizedName)

    return `
      <span class="zone-with-qr">
        <span class="zone-name-line">${escapeHtml(name)}</span>
        ${showQr ? `<span class="zone-qr-line">QR: ${escapeHtml(qr)}</span>` : ''}
      </span>
    `
  }

  function eventEditorNormalizeScannedQr(value = '') {
    const code = reportHistoryNormalizeQrCode(value)
    const technicalCode = String(code ?? '').trim().toUpperCase().replace(/^QR\s+/, '')
    if (!code || /^EV-\d+(?:-\d+)?$/.test(technicalCode)) {
      return ''
    }
    return code
  }

  function eventEditorFirstScannedQr(candidates = []) {
    for (const candidate of Array.isArray(candidates) ? candidates : []) {
      const code = eventEditorNormalizeScannedQr(candidate)
      if (code) {
        return code
      }
    }
    return ''
  }

  function eventEditorScannedQrLabel(item = {}) {
    const startQr = eventEditorFirstScannedQr([
      item?.startObject,
      item?.dayStartObject,
      reportHistoryExtractQrFromComment(item?.comment, 'start'),
      reportHistoryExtractQrFromComment(item?.dayComment, 'start'),
    ])
    const stopQr = eventEditorFirstScannedQr([
      item?.stopObject,
      item?.dayStopObject,
      reportHistoryExtractQrFromComment(item?.comment, 'stop'),
      reportHistoryExtractQrFromComment(item?.dayComment, 'stop'),
    ])

    if (startQr && stopQr && startQr !== stopQr) {
      return `START: ${startQr} / STOP: ${stopQr}`
    }
    if (startQr || stopQr) {
      return startQr || stopQr
    }

    return eventEditorFirstScannedQr([
      item?.qr,
      item?.qrCode,
      item?.activeZoneId,
      item?.workdayUtilityRoomId,
      item?.utilityRoomId,
      item?.roomId,
      item?.zoneId,
    ]) || '-'
  }

  function dashboardBuildHistoryRow(row, dayFallback) {
    const dayKey = dashboardResolveDayKey(row, dayFallback)
    const zoneId = String(row?.activeZoneId ?? row?.zoneId ?? row?.roomId ?? row?.utilityRoomId ?? '').trim()
    const zoneLabel = dashboardResolveZoneLabel(row)
    return {
      workerLogin: String(row?.workerLogin ?? '').trim(),
      workerName: dashboardResolveWorkerLabel(row),
      clientId: String(row?.clientId ?? '').trim(),
      clientName: dashboardResolveClientLabel(row),
      klient: dashboardResolveClientLabel(row),
      zoneId,
      roomId: zoneId,
      utilityRoomId: zoneId,
      zoneName: zoneLabel,
      strefa: zoneLabel,
      dayKey,
      startAt: toIso(row?.startAt),
      endAt: toIso(row?.endAt),
    }
  }

  function dashboardCommentUserStorageKey() {
    const orgId = String(appState.session?.orgId ?? '').trim() || 'org'
    const userId =
      String(appState.session?.uid ?? '').trim() ||
      String(appState.session?.userId ?? '').trim() ||
      String(appState.session?.id ?? '').trim() ||
      String(appState.session?.login ?? '').trim() ||
      String(appState.session?.email ?? '').trim() ||
      String(appState.session?.name ?? '').trim() ||
      'user'
    return `${DASHBOARD_COMMENT_READ_STORAGE_PREFIX}:${orgId}:${userId}`
  }

  function dashboardCommentSyncStorageKey(orgId = appState.session?.orgId) {
    const orgPart = dashboardLocalCachePart(orgId, 'org')
    const userPart = dashboardLocalCachePart(
      appState.session?.uid ??
        appState.session?.userId ??
        appState.session?.email ??
        appState.session?.login ??
        appState.session?.name,
      'user',
    )
    return `${DASHBOARD_COMMENT_SYNC_STORAGE_PREFIX}.${orgPart}.${userPart}`
  }

  function dashboardReadCommentSyncState(orgId = appState.session?.orgId) {
    if (typeof window === 'undefined' || !window.localStorage) {
      return {}
    }

    try {
      const raw = window.localStorage.getItem(dashboardCommentSyncStorageKey(orgId))
      const parsed = raw ? JSON.parse(raw) : {}
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  function dashboardWriteCommentSyncState(orgId = appState.session?.orgId, patch = {}) {
    if (typeof window === 'undefined' || !window.localStorage || !orgId) {
      return
    }

    try {
      const existing = dashboardReadCommentSyncState(orgId)
      window.localStorage.setItem(
        dashboardCommentSyncStorageKey(orgId),
        JSON.stringify({
          ...existing,
          ...patch,
          updatedAt: new Date().toISOString(),
        }),
      )
    } catch {
      // Synchronization metadata is only a performance hint.
    }
  }

  function dashboardCommentSyncRangeFrom(orgId = appState.session?.orgId, options = {}) {
    if (options.forceFull === true) {
      return firstDayOfCurrentMonthYmd()
    }

    const fallbackFrom = daysAgoYmd(DASHBOARD_COMMENT_SYNC_LOOKBACK_DAYS)
    const state = dashboardReadCommentSyncState(orgId)
    const lastSyncedDay = String(state.lastSyncedDay ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lastSyncedDay)) {
      return fallbackFrom
    }

    const overlapFrom = calendarAddDays(lastSyncedDay, -1)
    return overlapFrom > fallbackFrom ? overlapFrom : fallbackFrom
  }

  function dashboardReadCommentKeys() {
    try {
      const raw = window.localStorage.getItem(dashboardCommentUserStorageKey())
      const parsed = raw ? JSON.parse(raw) : []
      return new Set(Array.isArray(parsed) ? parsed.map((item) => String(item ?? '').trim()).filter(Boolean) : [])
    } catch {
      return new Set()
    }
  }

  function dashboardWriteCommentKeys(keys) {
    try {
      const list = [...keys].map((item) => String(item ?? '').trim()).filter(Boolean).slice(-800)
      window.localStorage.setItem(dashboardCommentUserStorageKey(), JSON.stringify(list))
    } catch {
      // Read status is a UI convenience. If storage is unavailable, keep the dashboard working.
    }
  }

  function dashboardCommentTimestamp(row, kind = 'event') {
    return (
      toIso(row?.updatedAt) ||
      toIso(row?.closeMarkedAt) ||
      (kind === 'day' ? toIso(row?.dayEndAt) : toIso(row?.endAt)) ||
      toIso(row?.endAt) ||
      toIso(row?.dayEndAt) ||
      toIso(row?.startAt) ||
      toIso(row?.dayStartAt) ||
      ''
    )
  }

  function dashboardCommentKey(row, kind, comment) {
    const id = String(row?.eventId ?? row?.workdayId ?? row?.id ?? '').trim()
    const worker = String(row?.workerLogin ?? row?.workerName ?? '').trim()
    const timestamp = dashboardCommentTimestamp(row, kind)
    const textKey = normalizeSearchText(comment).slice(0, 120)
    return [kind, id || worker || 'row', timestamp || dashboardResolveDayKey(row), textKey].join('::')
  }

  function dashboardRowHasClosedCommentContext(row, kind) {
    const status = String(row?.status ?? '').trim().toUpperCase()
    if (status === 'CLOSED' || status === 'WORKDAY_CLOSED') {
      return true
    }
    if (toIso(row?.closeMarkedAt)) {
      return true
    }
    return kind === 'day' ? Boolean(toIso(row?.dayEndAt)) : Boolean(toIso(row?.endAt))
  }

  function dashboardBuildNewComments(eventRows = [], workdayRows = []) {
    const comments = []
    const seenKeys = new Set()

    const pushComment = (row, kind, rawComment) => {
      const comment = normalizeVisibleEventComment(rawComment)
      if (!comment || !dashboardRowHasClosedCommentContext(row, kind)) {
        return
      }

      const key = dashboardCommentKey(row, kind, comment)
      if (!key || seenKeys.has(key)) {
        return
      }

      seenKeys.add(key)
      comments.push({
        key,
        kind,
        sourceLabel: kind === 'day' ? 'Dzień' : 'Strefa',
        comment,
        workerName: dashboardResolveWorkerLabel(row),
        workerLogin: String(row?.workerLogin ?? '').trim(),
        clientName: dashboardResolveClientLabel(row),
        clientId: String(row?.clientId ?? '').trim(),
        zoneName: dashboardResolveZoneLabel(row),
        zoneId: String(row?.zoneId ?? row?.roomId ?? row?.utilityRoomId ?? '').trim(),
        zoneLocation: String(row?.lokalizacja ?? row?.location ?? '').trim(),
        dayKey: dashboardResolveDayKey(row),
        timestamp: dashboardCommentTimestamp(row, kind),
        sourceEventId: String(row?.eventId ?? row?.workdayId ?? row?.id ?? '').trim(),
      })
    }

    ;(Array.isArray(eventRows) ? eventRows : []).forEach((row) => {
      pushComment(row, 'event', row?.comment)
    })
    ;(Array.isArray(workdayRows) ? workdayRows : []).forEach((row) => {
      pushComment(row, 'day', row?.dayComment || row?.comment)
    })

    return comments.sort((left, right) => {
      const leftTime = Date.parse(left.timestamp || `${left.dayKey || '1970-01-01'}T00:00:00.000Z`)
      const rightTime = Date.parse(right.timestamp || `${right.dayKey || '1970-01-01'}T00:00:00.000Z`)
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0)
    })
  }

  function dashboardCommentTaskHash(value = '') {
    const text = String(value ?? '')
    let hash = 0
    for (let index = 0; index < text.length; index += 1) {
      hash = (hash * 31 + text.charCodeAt(index)) >>> 0
    }
    return hash.toString(36)
  }

  function dashboardCommentTaskId(comment = {}) {
    const key = String(comment?.key ?? '').trim()
    return `comment-task-${dashboardCommentTaskHash(key)}`
  }

  function dashboardCommentTaskDate(comment = {}) {
    const timestamp = toIso(comment?.timestamp)
    if (timestamp) {
      return new Date(timestamp)
    }
    const dayKey = String(comment?.dayKey ?? '').trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
      const date = calendarDateFromYmd(dayKey)
      date.setHours(8, 0, 0, 0)
      return date
    }
    return new Date()
  }

  function dashboardDateToHm(dateValue) {
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue)
    if (!Number.isFinite(date.getTime())) {
      return ''
    }
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  }

  function dashboardCurrentUserTaskSelection() {
    const option = kanbanCurrentUserOption()
    const label =
      String(option?.label ?? '').trim() ||
      String(appState.session?.name ?? '').trim() ||
      String(appState.session?.login ?? '').trim() ||
      String(appState.session?.email ?? '').trim() ||
      'Użytkownik'
    const id =
      String(option?.id ?? '').trim() ||
      String(appState.session?.uid ?? '').trim() ||
      String(appState.session?.login ?? '').trim() ||
      label
    return [{ id, label }]
  }

  function dashboardWorkerRoleText(worker = {}) {
    return normalizeSearchText([worker.role, worker.type, worker.workerType].filter(Boolean).join(' '))
  }

  function dashboardWorkerIsAdminOrManager(worker = {}) {
    return roleLevel(worker.role ?? worker.type ?? worker.workerType) >= 2
  }

  function dashboardWorkerIsCoordinator(worker = {}) {
    const role = dashboardWorkerRoleText(worker)
    return (
      role.includes('koordynator') ||
      role.includes('koord') ||
      role.includes('coordynator') ||
      role.includes('coordinator') ||
      role === 'member'
    )
  }

  function dashboardWorkerTaskSelection(worker = {}) {
    const label = calendarWorkerLabel(worker)
    const id = calendarWorkerId(worker) || String(worker.login ?? worker.workerLogin ?? worker.authUid ?? worker.email ?? label).trim()
    return label ? { id, label } : null
  }

  function dashboardAddTaskAssignee(target = [], selection = null) {
    const label = String(selection?.label ?? '').trim()
    if (!label) {
      return target
    }
    const id = String(selection?.id ?? '').trim()
    const key = normalizeSearchText(id || label)
    if (!key) {
      return target
    }
    if (!target.some((item) => normalizeSearchText(item.id || item.label) === key || normalizeSearchText(item.label) === normalizeSearchText(label))) {
      target.push({ id, label })
    }
    return target
  }

  function dashboardCommentObjectAccessValues(comment = {}) {
    return [
      comment.clientId,
      comment.clientName,
      comment.zoneId,
      comment.zoneName,
      comment.zoneLocation,
      comment.clientId ? `client:${comment.clientId}` : '',
      comment.clientName ? `client:${comment.clientName}` : '',
      comment.zoneId ? `zone:${comment.zoneId}` : '',
      comment.zoneName ? `zone:${comment.zoneName}` : '',
    ]
  }

  function dashboardCommentRelevantZones(comment = {}) {
    const commentMatch = calendarAccessMatch(dashboardCommentObjectAccessValues(comment))
    return (Array.isArray(appState.zones) ? appState.zones : []).filter((zone) =>
      calendarValuesMatchAccess(calendarZoneAccessValues(zone), commentMatch),
    )
  }

  function dashboardCommentRelevantClients(comment = {}) {
    const commentMatch = calendarAccessMatch(dashboardCommentObjectAccessValues(comment))
    const directClients = (Array.isArray(appState.clients) ? appState.clients : []).filter((client) =>
      calendarValuesMatchAccess(calendarClientAccessValues(client), commentMatch),
    )
    const zoneClientMatch = calendarAccessMatch(
      dashboardCommentRelevantZones(comment).flatMap((zone) => {
        const view = mapZoneForView(zone)
        return [view.clientId, view.clientName, view.clientId ? `client:${view.clientId}` : '', view.clientName ? `client:${view.clientName}` : '']
      }),
    )
    const zoneClients = calendarMatchHasValues(zoneClientMatch)
      ? (Array.isArray(appState.clients) ? appState.clients : []).filter((client) =>
          calendarValuesMatchAccess(calendarClientAccessValues(client), zoneClientMatch),
        )
      : []
    const seen = new Set()
    return [...directClients, ...zoneClients].filter((client) => {
      const key = normalizeSearchText(client.id ?? client.clientId ?? client.name ?? client.clientName)
      if (!key || seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
  }

  function dashboardWorkerResponsibleForComment(worker = {}, comment = {}) {
    const workerMatch = calendarAccessMatch(calendarWorkerAccessValues(worker))
    const clientResponsible = dashboardCommentRelevantClients(comment).some((client) =>
      calendarValuesMatchAccess(
        calendarSplitAccessValues([
          client.coordinator,
          client.coordinatorName,
          client.coordinatorLogin,
          client.manager,
          client.managerName,
          client.owner,
          client.responsible,
          client.assignees,
          client.workers,
          client.osoby,
          client.osobyWykonujace,
        ]),
        workerMatch,
      ),
    )
    if (clientResponsible) {
      return true
    }

    return dashboardCommentRelevantZones(comment).some((zone) => {
      const view = mapZoneForView(zone)
      return calendarValuesMatchAccess([zone.workerLogin, zone.workerName, view.workerLogin, view.workerName], workerMatch)
    })
  }

  function dashboardResponsibleUsersForComment(comment = {}) {
    const assignees = []
    const workers = Array.isArray(appState.workers) ? appState.workers : []

    workers.forEach((worker) => {
      if (!dashboardWorkerIsAssignable(worker)) {
        return
      }
      const selection = dashboardWorkerTaskSelection(worker)
      if (!selection) {
        return
      }
      if (dashboardWorkerIsAdminOrManager(worker)) {
        dashboardAddTaskAssignee(assignees, selection)
        return
      }
      if (dashboardWorkerIsCoordinator(worker) && dashboardWorkerResponsibleForComment(worker, comment)) {
        dashboardAddTaskAssignee(assignees, selection)
      }
    })

    if (calendarCanSeeAllOrganizationTasks() || (calendarIsCoordinatorRole() && dashboardCommentTaskIsAllowedForCurrentUser(comment))) {
      dashboardCurrentUserTaskSelection().forEach((selection) => dashboardAddTaskAssignee(assignees, selection))
    }

    if (!assignees.length && dashboardCommentTaskIsAllowedForCurrentUser(comment)) {
      dashboardCurrentUserTaskSelection().forEach((selection) => dashboardAddTaskAssignee(assignees, selection))
    }

    return assignees
  }

  function dashboardCommentTaskIsAllowedForCurrentUser(comment = {}) {
    if (calendarCanSeeAllOrganizationTasks()) {
      return true
    }
    if (!calendarIsCoordinatorRole()) {
      return false
    }
    const scope = calendarCoordinatorAccessScope()
    return calendarValuesMatchAccess(dashboardCommentObjectAccessValues(comment), scope.objectMatch)
  }

  function dashboardBuildTaskFromComment(comment = {}) {
    const createdDate = dashboardCommentTaskDate(comment)
    const deadlineDate = new Date(createdDate.getTime() + 24 * 60 * 60 * 1000)
    const dateYmd = calendarDateToYmd(createdDate)
    const dueDateYmd = calendarDateToYmd(deadlineDate)
    const startTime = dashboardDateToHm(createdDate)
    const dueTime = dashboardDateToHm(deadlineDate)
    const clientLabel = String(comment.clientName ?? '').trim()
    const zoneLabel = String(comment.zoneName ?? '').trim()
    const zoneLocation = String(comment.zoneLocation ?? '').trim()
    const placeLabel = clientLabel && clientLabel !== '-' ? clientLabel : ''
    const zone = calendarNormalizeZoneSelection(
      null,
      comment.zoneId,
      zoneLabel && zoneLabel !== '-' ? zoneLabel : '',
      zoneLocation && zoneLocation !== '-' ? zoneLocation : '',
    )
    const sourceComment = String(comment.comment ?? '').trim()
    const workerLabel = String(comment.workerName ?? comment.workerLogin ?? '').trim() || 'pracownik'
    const deadlineLabel = `${formatDatePl(deadlineDate.toISOString())} ${dashboardDateToHm(deadlineDate)}`
    const assignedWorkers = dashboardResponsibleUsersForComment(comment)
    const notes = [
      `Komentarz pracownika: ${sourceComment}`,
      `Pracownik: ${workerLabel}`,
      placeLabel ? `Klient: ${placeLabel}` : '',
      zoneLabel && zoneLabel !== '-' ? `Strefa: ${calendarZoneDisplayLabel({ label: zoneLabel, location: zoneLocation })}` : '',
      `Termin realizacji: ${deadlineLabel}`,
    ]
      .filter(Boolean)
      .join('\n')

    return calendarNormalizeTask({
      id: dashboardCommentTaskId(comment),
      title: `Komentarz: ${workerLabel}`,
      dateYmd,
      time: startTime,
      startTime,
      endTime: '',
      tone: 'message',
      place: placeLabel,
      workers: assignedWorkers,
      objects: placeLabel ? [{ id: comment.clientId ? `client:${comment.clientId}` : '', label: placeLabel }] : [],
      zone,
      zoneId: zone?.id || '',
      zoneName: zone?.label || '',
      zoneLocation: zone?.location || '',
      kanbanStatus: kanbanNewTaskStatus(),
      notes,
      generatedFromComment: true,
      sourceCommentKey: String(comment.key ?? '').trim(),
      sourceComment,
      sourceEventId: String(comment.sourceEventId ?? '').trim(),
      sourceKind: String(comment.kind ?? '').trim(),
      sourceWorkerName: workerLabel,
      sourceWorkerLogin: String(comment.workerLogin ?? '').trim(),
      dueDateYmd,
      dueTime,
      deadlineAt: deadlineDate.toISOString(),
      activityLog: [
        calendarActivityEntry(
          'Dodano komentarz pracownika',
          [
            sourceComment ? `Komentarz: ${sourceComment}` : '',
            `Pracownik: ${workerLabel}`,
            placeLabel ? `Klient: ${placeLabel}` : '',
            zoneLabel && zoneLabel !== '-' ? `Strefa: ${calendarZoneDisplayLabel({ label: zoneLabel, location: zoneLocation })}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
          { actor: workerLabel, at: createdDate.toISOString() },
        ),
        calendarActivityEntry(
          'Utworzono zadanie z komentarza',
          [
            `Termin realizacji: ${deadlineLabel}`,
            `Dopisane osoby: ${calendarSelectionText(assignedWorkers)}`,
          ].join('\n'),
          { actor: 'System', at: createdDate.toISOString() },
        ),
      ],
      createdAt: createdDate.toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }

  function dashboardSyncCommentTasks(comments = []) {
    if (!appState.session?.orgId) {
      return 0
    }
    const sourceComments = Array.isArray(comments) ? comments : []
    if (!sourceComments.length) {
      return 0
    }

    const commentsByKey = new Map()
    sourceComments.forEach((comment) => {
      const key = String(comment?.key ?? '').trim()
      const taskId = dashboardCommentTaskId(comment)
      if (key) commentsByKey.set(key, comment)
      if (taskId) commentsByKey.set(taskId, comment)
    })

    let migratedExistingTasks = false
    const existingTasks = calendarLoadTasks().map((task) => {
      let nextTask = task
      if (task?.generatedFromComment && task.tone !== 'message') {
        migratedExistingTasks = true
        nextTask = calendarNormalizeTask({
          ...task,
          tone: 'message',
          updatedAt: new Date().toISOString(),
        })
      }

      const sourceKey = String(nextTask?.sourceCommentKey ?? '').trim()
      const comment = commentsByKey.get(sourceKey) ?? commentsByKey.get(String(nextTask?.id ?? '').trim())
      if (!nextTask?.generatedFromComment || !comment || !dashboardCommentTaskIsAllowedForCurrentUser(comment)) {
        return nextTask
      }

      const desiredTask = dashboardBuildTaskFromComment(comment)
      const beforeAssignees = calendarSelectionText(nextTask.workers)
      const afterAssignees = calendarSelectionText(desiredTask.workers)
      const shouldUpdateAssignees = beforeAssignees !== afterAssignees
      const shouldUpdateSource =
        String(nextTask.sourceComment ?? '').trim() !== String(desiredTask.sourceComment ?? '').trim() ||
        String(nextTask.dueDateYmd ?? '').trim() !== String(desiredTask.dueDateYmd ?? '').trim() ||
        String(nextTask.dueTime ?? '').trim() !== String(desiredTask.dueTime ?? '').trim()

      if (!shouldUpdateAssignees && !shouldUpdateSource) {
        return nextTask
      }

      migratedExistingTasks = true
      const updatedAt = new Date().toISOString()
      let mergedTask = calendarNormalizeTask({
        ...nextTask,
        title: desiredTask.title,
        tone: 'message',
        place: desiredTask.place,
        workers: desiredTask.workers,
        objects: desiredTask.objects,
        zone: desiredTask.zone,
        zoneId: desiredTask.zoneId,
        zoneName: desiredTask.zoneName,
        zoneLocation: desiredTask.zoneLocation,
        notes: desiredTask.notes,
        generatedFromComment: true,
        sourceCommentKey: desiredTask.sourceCommentKey,
        sourceComment: desiredTask.sourceComment,
        sourceEventId: desiredTask.sourceEventId,
        sourceKind: desiredTask.sourceKind,
        sourceWorkerName: desiredTask.sourceWorkerName,
        sourceWorkerLogin: desiredTask.sourceWorkerLogin,
        dueDateYmd: desiredTask.dueDateYmd,
        dueTime: desiredTask.dueTime,
        deadlineAt: desiredTask.deadlineAt,
        updatedAt,
      })
      if (shouldUpdateAssignees) {
        mergedTask = calendarNormalizeTask(
          calendarAppendTaskActivity(
            mergedTask,
            'Zaktualizowano osoby odpowiedzialne',
            `Dopisane osoby: ${afterAssignees || '-'}`,
            { actor: 'System', at: updatedAt },
          ),
        )
      }
      return mergedTask
    })
    const existingKeys = new Set(
      existingTasks
        .flatMap((task) => [task?.sourceCommentKey, task?.id])
        .map((value) => String(value ?? '').trim())
        .filter(Boolean),
    )
    const newTasks = []

    sourceComments.forEach((comment) => {
      const key = String(comment?.key ?? '').trim()
      if (!key || existingKeys.has(key) || existingKeys.has(dashboardCommentTaskId(comment))) {
        return
      }
      if (!dashboardCommentTaskIsAllowedForCurrentUser(comment)) {
        return
      }
      const task = dashboardBuildTaskFromComment(comment)
      if (!task?.id) {
        return
      }
      existingKeys.add(key)
      existingKeys.add(task.id)
      newTasks.push(task)
    })

    if (!newTasks.length) {
      if (migratedExistingTasks) {
        calendarSaveTasks(existingTasks)
      }
      return 0
    }

    calendarSaveTasks([...existingTasks, ...newTasks])
    return newTasks.length
  }

  function renderDashboardNewComments(comments = []) {
    const panel = document.getElementById('dashCommentsPanel')
    const listNode = document.getElementById('dashCommentsList')
    const countNode = document.getElementById('dashCommentsCount')
    const ackAllButton = document.getElementById('dashCommentsAckAll')
    if (!panel || !listNode) {
      return
    }

    const sourceComments = Array.isArray(comments) ? comments : []
    appState.dashboardNewComments = sourceComments
    const readKeys = dashboardReadCommentKeys()
    const unreadComments = sourceComments.filter((item) => item?.key && !readKeys.has(item.key))
    panel.classList.toggle('is-unread', unreadComments.length > 0)
    if (countNode) {
      countNode.textContent = String(unreadComments.length)
    }
    if (ackAllButton instanceof HTMLButtonElement) {
      ackAllButton.disabled = unreadComments.length === 0
    }

    if (!unreadComments.length) {
      listNode.innerHTML = '<div class="dash-comments-empty">Brak nowych komentarzy.</div>'
      return
    }

    const visibleComments = unreadComments.slice(0, DASHBOARD_NEW_COMMENTS_LIMIT)
    const hiddenCount = Math.max(0, unreadComments.length - visibleComments.length)
    listNode.innerHTML =
      visibleComments
        .map((item) => {
          const when = item.timestamp
            ? `${formatDatePl(item.timestamp)} ${formatTime(item.timestamp)}`
            : item.dayKey || '-'
          const place = [item.clientName, item.zoneName].filter((value) => value && value !== '-').join(' / ')
          return `
            <button class="dash-comment-item is-unread" type="button" data-dash-comment-key="${escapeHtml(item.key)}" title="${escapeHtml(item.comment)}">
              <span class="dash-comment-top">
                <span class="dash-comment-worker">${escapeHtml(item.workerName || '-')}</span>
                <span class="dash-comment-source">${escapeHtml(item.sourceLabel)}</span>
              </span>
              <span class="dash-comment-text">${escapeHtml(item.comment)}</span>
              <span class="dash-comment-meta">${escapeHtml(when)}${place ? ` / ${escapeHtml(place)}` : ''}</span>
            </button>
          `
        })
        .join('') +
      (hiddenCount ? `<div class="dash-comments-more">+${hiddenCount} kolejnych komentarzy</div>` : '')
  }

  function dashboardMarkCommentRead(key) {
    const normalizedKey = String(key ?? '').trim()
    if (!normalizedKey) {
      return
    }

    const readKeys = dashboardReadCommentKeys()
    readKeys.add(normalizedKey)
    dashboardWriteCommentKeys(readKeys)
    renderDashboardNewComments(appState.dashboardNewComments)
  }

  function dashboardMarkAllCommentsRead() {
    const readKeys = dashboardReadCommentKeys()
    ;(Array.isArray(appState.dashboardNewComments) ? appState.dashboardNewComments : []).forEach((item) => {
      if (item?.key) {
        readKeys.add(String(item.key))
      }
    })
    dashboardWriteCommentKeys(readKeys)
    renderDashboardNewComments(appState.dashboardNewComments)
  }

  function dashboardMetricDetailsOrEmpty(metricKey) {
    const details = appState.dashboardMetricDetails?.[metricKey]
    return Array.isArray(details) ? details : []
  }

  function dashboardSumDurationSeconds(rows = [], { excludeDay = '' } = {}) {
    const omittedDay = String(excludeDay ?? '').trim()
    return (Array.isArray(rows) ? rows : []).reduce((sum, row) => {
      if (omittedDay && dashboardResolveDayKey(row) === omittedDay) {
        return sum
      }
      return sum + dashboardEventDurationSec(row)
    }, 0)
  }

  function dashboardBuildPeriodHourValues(
    todayRows = [],
    currentWeekRows = [],
    previousWeekRows = [],
    currentMonthRows = [],
    previousMonthRows = [],
  ) {
    const today = todayYmd()
    const totalTodaySec = (Array.isArray(todayRows) ? todayRows : []).reduce(
      (sum, row) => sum + dashboardParseDurationLabelToSeconds(row?.duration),
      0,
    )
    const currentWeekSec = totalTodaySec + dashboardSumDurationSeconds(currentWeekRows, { excludeDay: today })
    const previousWeekSec = dashboardSumDurationSeconds(previousWeekRows)
    const currentMonthSec = totalTodaySec + dashboardSumDurationSeconds(currentMonthRows, { excludeDay: today })
    const previousMonthSec = dashboardSumDurationSeconds(previousMonthRows)

    return {
      totalHoursCurrentWeek: durationSecondsToHm(currentWeekSec),
      totalHoursPreviousWeek: durationSecondsToHm(previousWeekSec),
      totalHoursCurrentMonth: durationSecondsToHm(currentMonthSec),
      totalHoursPreviousMonth: durationSecondsToHm(previousMonthSec),
    }
  }

  function dashboardOverviewWorkerKey(row = {}) {
    const workerId = dashboardResolveWorkerIdValue(row)
    if (workerId) {
      return `id:${normalizeSearchText(workerId)}`
    }

    const workerLogin = normalizeSearchText(row?.workerLogin ?? row?.login)
    if (workerLogin) {
      return `login:${workerLogin}`
    }

    const workerName = normalizeSearchText(row?.workerName ?? row?.name)
    return workerName ? `name:${workerName}` : ''
  }

  function dashboardOverviewActiveWorkerDetails(rows = [], dayKey = todayYmd()) {
    const workerRows = new Map()
    ;(Array.isArray(rows) ? rows : []).forEach((row) => {
      if (!row?.isRunning) {
        return
      }
      const key = dashboardOverviewWorkerKey(row)
      if (!key || workerRows.has(key)) {
        return
      }
      workerRows.set(key, row)
    })

    return [...workerRows.values()].map((row) => {
      const rowDay = dashboardResolveDayKey(row, dayKey)
      const datePrefix = rowDay && rowDay !== dayKey ? `Data: ${formatDatePl(`${rowDay}T00:00:00.000Z`)} · ` : ''
      const workerLogin = String(row?.workerLogin ?? row?.login ?? '').trim()
      const workerName = dashboardResolveWorkerLabel(row)
      return {
        action: 'worker-history',
        workerLogin,
        workerName,
        title: workerName,
        subtitle: `${datePrefix}START: ${dashboardClockLabelToHm(row?.qrStart, '--:--')} · Klient: ${dashboardResolveClientLabel(row)} · Strefa: ${dashboardResolveZoneLabel(row)}`,
        tab: 'workers',
        row: dashboardBuildHistoryRow(row, rowDay || dayKey),
      }
    })
  }

  function dashboardActiveWorkerMapIdentity(row = {}) {
    const explicitWorkerId =
      dashboardResolveWorkerIdValue(row) ||
      row?.workerId ||
      row?.worker?.workerId ||
      row?.employeeId ||
      row?.employee?.workerId
    return {
      workerId: normalizeSearchText(explicitWorkerId),
      login: normalizeSearchText(
        row?.workerLogin ?? row?.login ?? row?.worker?.login ?? row?.email ?? row?.worker?.email,
      ),
      name: normalizeSearchText(row?.workerName ?? row?.name ?? row?.worker?.name),
    }
  }

  function dashboardActiveWorkerMapKey(row = {}) {
    const identity = dashboardActiveWorkerMapIdentity(row)
    if (identity.workerId) {
      return `id:${identity.workerId}`
    }
    if (identity.login) {
      return `login:${identity.login}`
    }
    return identity.name ? `name:${identity.name}` : ''
  }

  function dashboardActiveWorkerMapRowsMatch(left = {}, right = {}, activeNameCounts = new Map()) {
    const leftIdentity = dashboardActiveWorkerMapIdentity(left)
    const rightIdentity = dashboardActiveWorkerMapIdentity(right)

    if (leftIdentity.workerId && rightIdentity.workerId) {
      return leftIdentity.workerId === rightIdentity.workerId
    }
    if (leftIdentity.login && rightIdentity.login) {
      return leftIdentity.login === rightIdentity.login
    }

    const normalizedName = leftIdentity.name
    return Boolean(
      normalizedName &&
      normalizedName === rightIdentity.name &&
      Number(activeNameCounts.get(normalizedName) ?? 0) === 1,
    )
  }

  function dashboardActiveWorkerMapParseGpsAttributes(value = '') {
    const attributes = {}
    const source = String(value ?? '')
    const attributeRegex = /([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s\]]+)/g
    let match = attributeRegex.exec(source)
    while (match) {
      const key = String(match[1] ?? '').trim().toLowerCase()
      attributes[key] = String(match[2] ?? '').trim().replace(/^["']|["']$/g, '')
      match = attributeRegex.exec(source)
    }
    return attributes
  }

  function dashboardActiveWorkerMapGpsTimestamp(value) {
    const raw = String(value ?? '').trim()
    if (!raw) {
      return 0
    }

    if (/^\d+(?:\.\d+)?$/.test(raw)) {
      const numeric = Number(raw)
      if (Number.isFinite(numeric) && numeric > 0) {
        return numeric < 100000000000 ? Math.round(numeric * 1000) : Math.round(numeric)
      }
    }

    const iso = toIso(raw)
    const timestamp = iso ? new Date(iso).getTime() : new Date(raw).getTime()
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0
  }

  function dashboardActiveWorkerMapGpsEntries(row = {}, dayKey = todayYmd()) {
    if (typeof reportHistoryParseGeoPair !== 'function') {
      return []
    }

    const entries = []
    const seen = new Set()
    const pushEntry = (label, attributeSource, sourceIndex, origin = '') => {
      const attributes = dashboardActiveWorkerMapParseGpsAttributes(attributeSource)
      const coords = reportHistoryParseGeoPair(`${attributes.lat ?? ''}, ${attributes.lon ?? attributes.lng ?? ''}`)
      if (!coords) {
        return
      }

      const lat = Number(coords.lat)
      const lng = Number(coords.lon)
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
        return
      }

      const phaseLabel = `${String(label ?? '').toUpperCase()} ${String(
        attributes.src ?? attributes.source ?? attributes.phase ?? '',
      ).toUpperCase()}`
      const phase = phaseLabel.includes('STOP') ? 'stop' : 'start'
      const gpsAction = phaseLabel.includes('CLEAN_START')
        ? 'CLEAN_START_GPS'
        : phaseLabel.includes('CLEAN_STOP')
          ? 'CLEAN_STOP_GPS'
          : phaseLabel.includes('START')
            ? 'START_GPS'
            : phaseLabel.includes('STOP')
              ? 'STOP_GPS'
              : 'GPS'
      const explicitTimestamp = dashboardActiveWorkerMapGpsTimestamp(
        attributes.at ?? attributes.timestamp ?? attributes.recorded_at ?? attributes.recordedat,
      )
      const fallbackTimestamp = phase === 'stop'
        ? dashboardActivityRowStopTimestamp(row, dayKey)
        : dashboardActivityRowStartTimestamp(row, dayKey)
      const timestamp = explicitTimestamp || fallbackTimestamp || 0
      const dedupeKey = `${lat.toFixed(6)}:${lng.toFixed(6)}:${timestamp}:${phase}:${gpsAction}`
      if (seen.has(dedupeKey)) {
        return
      }
      seen.add(dedupeKey)
      entries.push({
        lat,
        lng,
        timestamp,
        explicitTimestamp: Boolean(explicitTimestamp),
        sourceIndex,
        origin,
        phase,
        gpsAction,
      })
    }

    ;[
      { origin: 'dayGps', value: row?.dayGps },
      { origin: 'gps', value: row?.gps },
      { origin: 'dayComment', value: row?.dayComment },
      { origin: 'comment', value: row?.comment },
    ].forEach((sourceItem, sourceIndex) => {
      const rawSource = sourceItem.value
      const source = String(rawSource ?? '').trim()
      if (!source) {
        return
      }

      let foundStructuredEntry = false
      const bracketRegex = /\[\[\s*GPS\b([\s\S]*?)\]\]/gi
      let bracketMatch = bracketRegex.exec(source)
      while (bracketMatch) {
        foundStructuredEntry = true
        pushEntry('GPS', bracketMatch[1], sourceIndex, sourceItem.origin)
        bracketMatch = bracketRegex.exec(source)
      }

      const labeledRegex = /\b(CLEAN_START_GPS|CLEAN_STOP_GPS|START_GPS|STOP_GPS)\b([^\r\n|]*)/gi
      let labeledMatch = labeledRegex.exec(source)
      while (labeledMatch) {
        foundStructuredEntry = true
        pushEntry(labeledMatch[1], labeledMatch[2], sourceIndex, sourceItem.origin)
        labeledMatch = labeledRegex.exec(source)
      }

      if (!foundStructuredEntry) {
        pushEntry('GPS', source, sourceIndex, sourceItem.origin)
      }
    })

    return entries
  }

  function dashboardActiveWorkerMapGpsEntrySourcePriority(row = {}, entry = {}) {
    const explicitEvent = row?.historySourceKind === 'event' || row?.hasExplicitEventId === true
    const origin = String(entry?.origin ?? '').trim()
    if (explicitEvent && origin === 'comment') {
      return 50
    }
    if (!explicitEvent && origin === 'gps') {
      return 40
    }
    if (!explicitEvent && origin === 'comment') {
      return 30
    }
    if (!explicitEvent && (origin === 'dayGps' || origin === 'dayComment')) {
      return 20
    }
    return 10
  }

  function dashboardActiveWorkerMapGpsActionPriority(entry = {}) {
    const action = String(entry?.gpsAction ?? '').trim().toUpperCase()
    if (action === 'CLEAN_START_GPS') {
      return 50
    }
    if (action === 'START_GPS') {
      return 40
    }
    if (action === 'STOP_GPS') {
      return 30
    }
    if (action === 'CLEAN_STOP_GPS') {
      return 20
    }
    return 10
  }

  function dashboardActiveWorkerMapObjectLabelForGpsEntry(row = {}, entry = {}) {
    const explicitEvent = row?.historySourceKind === 'event' || row?.hasExplicitEventId === true
    const origin = String(entry?.origin ?? '').trim()
    const phase = String(entry?.phase ?? '').trim().toLowerCase()
    const eventGpsIsDirect = explicitEvent && origin === 'comment'
    const phaseQrCandidates = eventGpsIsDirect
      ? [row?.zoneId, row?.roomId, row?.utilityRoomId, row?.qrCode]
      : phase === 'stop'
        ? [row?.dayStopObject, row?.stopObject]
        : phase === 'start'
          ? [row?.dayStartObject, row?.startObject, row?.workdayUtilityRoomId]
          : []

    const resolvedFromQr = phaseQrCandidates
      .map((candidate) => dashboardActivityResolveObjectLabelByQr(candidate))
      .find(Boolean)
    if (resolvedFromQr) {
      return resolvedFromQr
    }

    const directCandidates = [
      row?.scanObjectLabel,
      row?.objectLabelAtScan,
      row?.activeObjectLabel,
      row?.activeClientLabel,
      row?.activeClient,
      row?.clientName,
      row?.clientLabel,
      row?.klient,
      row?.companyName,
      row?.client?.name,
    ]

    if (!eventGpsIsDirect) {
      const exactReadableLabel = phaseQrCandidates
        .map((candidate) => dashboardActivityCleanCompanyLabel(candidate))
        .find((candidate) => candidate && !dashboardIsQrCodeLike(candidate))
      if (exactReadableLabel) {
        return exactReadableLabel
      }
      if (explicitEvent) {
        return ''
      }
    }

    for (const candidate of directCandidates) {
      const label = dashboardActivityCleanCompanyLabel(candidate)
      if (label && !dashboardIsQrCodeLike(label)) {
        return label
      }
    }

    return ''
  }

  function dashboardActiveWorkerMapCoordinates(source = {}) {
    const parseCoordinate = (value) => {
      const raw = String(value ?? '').replace(',', '.').trim()
      if (!raw) {
        return null
      }
      const number = Number(raw)
      return Number.isFinite(number) ? number : null
    }
    const lat = parseCoordinate(
      source?.plannedLat ?? source?.lat ?? source?.latitude ?? source?.location?.lat ?? source?.location?.latitude,
    )
    const lng = parseCoordinate(
      source?.plannedLng ??
        source?.lng ??
        source?.lon ??
        source?.longitude ??
        source?.location?.lng ??
        source?.location?.lon ??
        source?.location?.longitude,
    )
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return null
    }
    if (lat === 0 && lng === 0) {
      return null
    }
    return { lat, lng }
  }

  function dashboardActiveWorkerMapRecordsMatch(left = {}, right = {}) {
    const leftStoredKey = String(left?.workerKey ?? '').trim()
    const rightStoredKey = String(right?.workerKey ?? '').trim()
    const leftMapKey = dashboardActiveWorkerMapKey(left)
    const rightMapKey = dashboardActiveWorkerMapKey(right)
    if (
      (leftStoredKey && (leftStoredKey === rightStoredKey || leftStoredKey === rightMapKey)) ||
      (rightStoredKey && rightStoredKey === leftMapKey) ||
      (leftMapKey && leftMapKey === rightMapKey)
    ) {
      return true
    }
    const leftIdentity = dashboardActiveWorkerMapIdentity(left)
    const rightIdentity = dashboardActiveWorkerMapIdentity(right)
    if (leftIdentity.workerId && rightIdentity.workerId) {
      return leftIdentity.workerId === rightIdentity.workerId
    }
    if (leftIdentity.login && rightIdentity.login) {
      return leftIdentity.login === rightIdentity.login
    }
    const leftNameKey = dashboardWorkerSurnameSortKey(
      left?.workerDisplayName ?? left?.workerName ?? left?.name ?? leftIdentity.name,
    )
    const rightNameKey = dashboardWorkerSurnameSortKey(
      right?.workerDisplayName ?? right?.workerName ?? right?.name ?? rightIdentity.name,
    )
    if (!leftNameKey || leftNameKey !== rightNameKey) {
      return false
    }
    const matchingWorkers = (Array.isArray(appState.workers) ? appState.workers : []).filter(
      (worker) => dashboardWorkerSurnameSortKey(worker?.workerName ?? worker?.name ?? '') === leftNameKey,
    )
    return matchingWorkers.length <= 1
  }

  function dashboardActiveWorkerMapPlannedItemPriority(item = {}, nowTimestamp = Date.now()) {
    const startTimestamp = Number(item?.startTs ?? 0)
    const stopTimestamp = Number(item?.stopTs ?? 0)
    if (startTimestamp > 0 && startTimestamp <= nowTimestamp && stopTimestamp >= nowTimestamp) {
      return { bucket: 0, timestamp: startTimestamp }
    }
    if (startTimestamp > nowTimestamp) {
      return { bucket: 1, timestamp: startTimestamp }
    }
    if (startTimestamp > 0) {
      return { bucket: 2, timestamp: -startTimestamp }
    }
    return { bucket: 3, timestamp: Number.MAX_SAFE_INTEGER }
  }

  function dashboardActiveWorkerMapPlannedCandidates(items = [], nowTimestamp = Date.now()) {
    const groups = new Map()
    ;(Array.isArray(items) ? items : []).forEach((item) => {
      const workerKey = dashboardActiveWorkerMapKey(item)
      if (!workerKey) {
        return
      }
      if (!groups.has(workerKey)) {
        groups.set(workerKey, [])
      }
      groups.get(workerKey).push(item)
    })

    return [...groups.values()].map((workerItems) => {
      const locatedItems = workerItems.filter((item) => dashboardActiveWorkerMapCoordinates(item))
      const candidates = locatedItems.length ? locatedItems : workerItems
      return candidates.slice().sort((left, right) => {
        const leftPriority = dashboardActiveWorkerMapPlannedItemPriority(left, nowTimestamp)
        const rightPriority = dashboardActiveWorkerMapPlannedItemPriority(right, nowTimestamp)
        return leftPriority.bucket - rightPriority.bucket || leftPriority.timestamp - rightPriority.timestamp
      })[0]
    })
  }

  function dashboardActiveWorkerMapStatus(value = '') {
    const normalized = String(value ?? '').trim().toLowerCase()
    return ['finished', 'planned', 'late'].includes(normalized) ? normalized : 'active'
  }

  function dashboardActiveWorkerMapStatusLabel(status = '') {
    return {
      active: 'W pracy',
      planned: 'Zaplanowany',
      finished: 'Zakończony',
      late: 'Nie rozpoczął w czasie',
    }[dashboardActiveWorkerMapStatus(status)] || 'W pracy'
  }

  function dashboardActiveWorkerMapStrictClientId(row = {}) {
    return String(row?.clientId ?? row?.client?.id ?? '').trim()
  }

  function dashboardActiveWorkerMapExactPlanExecution(activeRow = {}, plannedRow = {}, dayKey = todayYmd()) {
    const plannedClientId = dashboardActiveWorkerMapStrictClientId(plannedRow)
    const activeClientId = dashboardActiveWorkerMapStrictClientId(activeRow)
    const sameWorker = dashboardActiveWorkerMapRecordsMatch(activeRow, plannedRow)
    const exactClient = Boolean(plannedClientId && activeClientId && plannedClientId === activeClientId)
    if (!sameWorker || !exactClient) {
      return {
        hasExactExecutionMatch: false,
        actualStartTs: 0,
        actualStopTs: 0,
      }
    }

    const actualStartTs = dashboardActivityRowStartTimestamp(activeRow, dayKey)
    const actualStopTs = activeRow?.isRunning
      ? 0
      : dashboardActivityRowStopTimestamp(activeRow, dayKey)
    return {
      hasExactExecutionMatch: actualStartTs > 0,
      actualStartTs,
      actualStopTs,
    }
  }

  function dashboardActiveWorkerMapWorkerRecord(row = {}) {
    return (Array.isArray(appState.workers) ? appState.workers : []).find((worker) =>
      dashboardActiveWorkerMapRecordsMatch(worker, row),
    ) ?? null
  }

  function dashboardActiveWorkerMapPhotoUrl(row = {}) {
    const worker = dashboardActiveWorkerMapWorkerRecord(row)
    const raw = String(
      worker?.photoUrl ??
        worker?.profilePhotoUrl ??
        worker?.avatarUrl ??
        worker?.imageUrl ??
        row?.photoUrl ??
        row?.profilePhotoUrl ??
        row?.avatarUrl ??
        '',
    ).trim()
    return /^(https?:\/\/|data:image\/(?:png|jpe?g|webp);base64,)/i.test(raw) ? raw : ''
  }

  function dashboardActiveWorkerMapAvatarKind(row = {}) {
    const worker = dashboardActiveWorkerMapWorkerRecord(row)
    return resolveOperationalMapAvatarKind({
      ...row,
      ...worker,
      workerName: String(
        worker?.name ??
          worker?.workerName ??
          worker?.fullName ??
          row?.workerDisplayName ??
          row?.workerName ??
          row?.name ??
          '',
      ).trim(),
    })
  }

  function dashboardActiveWorkerMapPlanContext(plannedRow = {}) {
    if (!plannedRow) {
      return {}
    }
    return {
      taskId: String(plannedRow?.taskId ?? '').trim(),
      orderId: String(plannedRow?.orderId ?? '').trim(),
      editorOrderId: String(plannedRow?.editorOrderId ?? plannedRow?.orderId ?? '').trim(),
      sourceOrderId: String(plannedRow?.sourceOrderId ?? plannedRow?.orderId ?? '').trim(),
      occurrenceDateYmd: String(plannedRow?.occurrenceDateYmd ?? plannedRow?.dateYmd ?? '').trim(),
      dateYmd: String(plannedRow?.dateYmd ?? plannedRow?.occurrenceDateYmd ?? '').trim(),
      workSlotKey: String(plannedRow?.workSlotKey ?? '').trim(),
      serviceBlockId: String(plannedRow?.serviceBlockId ?? '').trim(),
      serviceBlockKind: String(plannedRow?.serviceBlockKind ?? '').trim(),
      serviceBlockLabel: String(plannedRow?.serviceBlockLabel ?? '').trim(),
      isRecurringSeries: Boolean(plannedRow?.isRecurringSeries),
      isRecurringInstance: Boolean(plannedRow?.isRecurringInstance),
      recurrenceOverride: Boolean(plannedRow?.recurrenceOverride),
    }
  }

  function dashboardActiveWorkerMapExecutionSourceForPlan(
    plannedRow = {},
    sourceRows = [],
    dayKey = todayYmd(),
    activeNameCounts = new Map(),
  ) {
    const plannedClientId = dashboardActiveWorkerMapStrictClientId(plannedRow)
    if (!plannedClientId) {
      return null
    }
    return (Array.isArray(sourceRows) ? sourceRows : []).find((sourceRow) =>
      dashboardResolveDayKey(sourceRow, dayKey) === dayKey &&
      dashboardActiveWorkerMapStrictClientId(sourceRow) === plannedClientId &&
      dashboardActiveWorkerMapRowsMatch(plannedRow, sourceRow, activeNameCounts),
    ) ?? null
  }

  function dashboardActiveWorkerMapCandidateRows(rows = [], dayKey = todayYmd()) {
    const normalizedDay = dashboardActivityDayKey(dayKey)
    const rowsByWorker = new Map()
    ;(Array.isArray(rows) ? rows : []).forEach((row) => {
      const isRunning = Boolean(row?.isRunning)
      const stopTimestamp = dashboardActivityRowStopTimestamp(row, normalizedDay)
      if (!isRunning && stopTimestamp <= 0) {
        return
      }

      const workerKey = dashboardActiveWorkerMapKey(row)
      if (!workerKey) {
        return
      }

      const activityTimestamp = isRunning
        ? dashboardActivityRowStartTimestamp(row, normalizedDay)
        : stopTimestamp
      const current = rowsByWorker.get(workerKey)
      const shouldReplace =
        !current ||
        (isRunning && !current.isRunning) ||
        (isRunning === current.isRunning && activityTimestamp > current.activityTimestamp)
      if (shouldReplace) {
        rowsByWorker.set(workerKey, { row, isRunning, activityTimestamp })
      }
    })

    return [...rowsByWorker.values()].map((entry) => entry.row)
  }

  function dashboardActiveWorkerMapLocations(activeRows = [], dayKey = todayYmd(), plannedRows = []) {
    if (typeof reportHistoryParseGeoPair !== 'function') {
      return []
    }

    const normalizedDay = dashboardActivityDayKey(dayKey)
    const nowTimestamp = Date.now()
    const activeByWorker = new Map()
    const activeNameCounts = new Map()
    dashboardActiveWorkerMapCandidateRows(activeRows, normalizedDay).forEach((row) => {
      const key = dashboardActiveWorkerMapKey(row)
      if (key && !activeByWorker.has(key)) {
        activeByWorker.set(key, row)
      }
    })
    activeByWorker.forEach((row) => {
      const workerNameKey = dashboardActiveWorkerMapIdentity(row).name
      if (workerNameKey) {
        activeNameCounts.set(workerNameKey, Number(activeNameCounts.get(workerNameKey) ?? 0) + 1)
      }
    })

    const sourceRows = [
      ...(Array.isArray(appState.dashboardScheduleSourceRows) ? appState.dashboardScheduleSourceRows : []),
      ...(Array.isArray(appState.dashboardActivityWorkdayRows) ? appState.dashboardActivityWorkdayRows : []),
    ]
    const plannedCandidates = Array.isArray(plannedRows) ? plannedRows : []
    const usedPlannedIndexes = new Set()

    const workdayLocations = [...activeByWorker.entries()]
      .map(([workerKey, activeRow]) => {
        let latestLocation = null
        sourceRows.forEach((sourceRow) => {
          if (dashboardResolveDayKey(sourceRow, normalizedDay) !== normalizedDay) {
            return
          }
          if (!dashboardActiveWorkerMapRowsMatch(activeRow, sourceRow, activeNameCounts)) {
            return
          }

          dashboardActiveWorkerMapGpsEntries(sourceRow, normalizedDay).forEach((entry) => {
            const normalizedTimestamp = entry.timestamp > 0
              ? entry.timestamp
              : dashboardActivityRowStartTimestamp(activeRow, normalizedDay)
            const actionPriority = dashboardActiveWorkerMapGpsActionPriority(entry)
            const sourcePriority = dashboardActiveWorkerMapGpsEntrySourcePriority(sourceRow, entry)
            if (
              !latestLocation ||
              normalizedTimestamp > latestLocation.timestamp ||
              (normalizedTimestamp === latestLocation.timestamp && entry.explicitTimestamp && !latestLocation.explicitTimestamp) ||
              (normalizedTimestamp === latestLocation.timestamp && entry.explicitTimestamp === latestLocation.explicitTimestamp && actionPriority > latestLocation.actionPriority) ||
              (normalizedTimestamp === latestLocation.timestamp &&
                entry.explicitTimestamp === latestLocation.explicitTimestamp &&
                actionPriority === latestLocation.actionPriority &&
                sourcePriority > latestLocation.sourcePriority) ||
              (normalizedTimestamp === latestLocation.timestamp &&
                entry.explicitTimestamp === latestLocation.explicitTimestamp &&
                actionPriority === latestLocation.actionPriority &&
                sourcePriority === latestLocation.sourcePriority &&
                entry.sourceIndex > latestLocation.sourceIndex)
            ) {
              latestLocation = {
                lat: entry.lat,
                lng: entry.lng,
                timestamp: normalizedTimestamp,
                explicitTimestamp: entry.explicitTimestamp,
                sourceIndex: entry.sourceIndex,
                actionPriority,
                sourcePriority,
                sourceRow,
                origin: entry.origin,
                phase: entry.phase,
                gpsAction: entry.gpsAction,
              }
            }
          })
        })

        if (!latestLocation) {
          return null
        }

        const isActive = Boolean(activeRow?.isRunning)
        const currentObject =
          dashboardActiveWorkerMapObjectLabelForGpsEntry(latestLocation.sourceRow, latestLocation) ||
          (!isActive ? dashboardActivityCleanCompanyLabel(dashboardResolveClientLabel(activeRow)) : '') ||
          'Brak obiektu przy ostatnim odbiciu'
        const stopLabel = isActive ? '' : dashboardClockLabelToHm(activeRow?.qrStop, '--:--')
        const gpsTimeLabel = latestLocation.timestamp > 0 ? dashboardOverviewTimeLabel(latestLocation.timestamp) : '--:--'
        const actualClientId =
          dashboardActiveWorkerMapStrictClientId(latestLocation.sourceRow) ||
          dashboardActiveWorkerMapStrictClientId(activeRow)
        const exactPlannedIndex = plannedCandidates.findIndex((plannedRow) =>
          dashboardActiveWorkerMapRecordsMatch(plannedRow, activeRow) &&
          actualClientId &&
          dashboardActiveWorkerMapStrictClientId(plannedRow) === actualClientId,
        )
        const plannedIndex = exactPlannedIndex >= 0
          ? exactPlannedIndex
          : plannedCandidates.findIndex((plannedRow) =>
              dashboardActiveWorkerMapRecordsMatch(plannedRow, activeRow),
            )
        const plannedRow = plannedIndex >= 0 ? plannedCandidates[plannedIndex] : null
        if (plannedIndex >= 0) {
          usedPlannedIndexes.add(plannedIndex)
        }
        const plannedStartLabel = plannedRow ? dashboardOverviewTimeLabel(plannedRow?.startTs) : ''
        const plannedStopLabel = plannedRow ? dashboardOverviewTimeLabel(plannedRow?.stopTs) : ''
        const plannedTimeLabel = plannedRow
          ? plannedStopLabel && plannedStopLabel !== '--:--'
            ? `${plannedStartLabel}–${plannedStopLabel}`
            : plannedStartLabel
          : ''
        const plannedObjectLabel = plannedRow
          ? dashboardActivityCleanCompanyLabel(plannedRow?.companyLabel ?? plannedRow?.locationLabel) ||
            String(plannedRow?.addressLabel ?? '').trim() ||
            'Zaplanowany obiekt'
          : ''
        const actualWorkStatus = isActive ? 'active' : 'finished'
        const actualWorkStatusLabel = isActive ? 'W pracy' : 'Dzień zakończony'
        const executionSourceRow = plannedRow
          ? dashboardActiveWorkerMapExecutionSourceForPlan(
              plannedRow,
              sourceRows,
              normalizedDay,
              activeNameCounts,
            )
          : null
        const exactExecution = plannedRow
          ? dashboardActiveWorkerMapExactPlanExecution(
              {
                ...activeRow,
                clientId:
                  dashboardActiveWorkerMapStrictClientId(executionSourceRow) ||
                  dashboardActiveWorkerMapStrictClientId(activeRow),
              },
              plannedRow,
              normalizedDay,
            )
          : {
              hasExactExecutionMatch: false,
              actualStartTs: 0,
              actualStopTs: 0,
            }
        const plannedMapState = plannedRow
          ? resolveOperationalMapStatus({
              plannedStartTs: Number(plannedRow?.startTs ?? 0),
              actualStartTs: exactExecution.actualStartTs,
              actualStopTs: exactExecution.actualStopTs,
              nowTs: nowTimestamp,
              hasExactExecutionMatch: exactExecution.hasExactExecutionMatch,
            })
          : null
        const workStatus = plannedMapState?.status ?? actualWorkStatus
        const workStatusLabel = dashboardActiveWorkerMapStatusLabel(workStatus)
        const clientId = String(
          exactExecution.hasExactExecutionMatch
            ? plannedRow?.clientId
            : actualClientId || activeRow?.clientId,
        ).trim()
        const plannedCoordinates = plannedRow
          ? dashboardActiveWorkerMapCoordinates(plannedRow)
          : null
        return {
          workerKey,
          workerName: dashboardResolveWorkerLabel(activeRow),
          photoUrl: dashboardActiveWorkerMapPhotoUrl(activeRow),
          avatarKind: dashboardActiveWorkerMapAvatarKind(activeRow),
          objectLabel: currentObject,
          plannedObjectLabel,
          taskLabel: plannedRow ? String(plannedRow?.label ?? '').trim() || 'Zaplanowane zadanie' : '',
          plannedTimeLabel,
          workStatus,
          workStatusLabel,
          actualWorkStatus,
          actualWorkStatusLabel,
          clientId,
          zoneId: String(plannedRow?.zoneId ?? activeRow?.zoneId ?? '').trim(),
          delayMinutes: Number(plannedMapState?.delayMinutes ?? 0),
          plannedStartTs: Number(plannedRow?.startTs ?? 0),
          plannedStopTs: Number(plannedRow?.stopTs ?? 0),
          plannedLat: plannedCoordinates?.lat ?? null,
          plannedLng: plannedCoordinates?.lng ?? null,
          startLabel: dashboardClockLabelToHm(activeRow?.qrStart, '--:--'),
          stopLabel,
          positionKind: 'gps',
          positionLabel: `GPS ${gpsTimeLabel}`,
          positionDetailLabel: `Ostatnie odbicie GPS: ${gpsTimeLabel}`,
          positionTimestamp: latestLocation.timestamp,
          gpsTimeLabel,
          gpsTimestamp: latestLocation.timestamp,
          lat: latestLocation.lat,
          lng: latestLocation.lng,
          ...dashboardActiveWorkerMapPlanContext(plannedRow),
        }
      })
      .filter(Boolean)

    const plannedLocations = plannedCandidates
      .map((plannedRow, plannedIndex) => {
        if (usedPlannedIndexes.has(plannedIndex)) {
          return null
        }
        const coordinates = dashboardActiveWorkerMapCoordinates(plannedRow)
        const workerKey = dashboardActiveWorkerMapKey(plannedRow)
        if (!coordinates || !workerKey) {
          return null
        }
        const startTimestamp = Number(plannedRow?.startTs ?? 0)
        const stopTimestamp = Number(plannedRow?.stopTs ?? 0)
        const startLabel = dashboardOverviewTimeLabel(startTimestamp)
        const stopLabel = dashboardOverviewTimeLabel(stopTimestamp)
        const plannedTimeLabel = stopLabel !== '--:--' ? `${startLabel}–${stopLabel}` : startLabel
        const objectLabel =
          dashboardActivityCleanCompanyLabel(plannedRow?.companyLabel ?? plannedRow?.locationLabel) ||
          String(plannedRow?.addressLabel ?? '').trim() ||
          'Zaplanowany obiekt'
        const matchedWorkdayRow = [...activeByWorker.values()].find((activeRow) =>
          dashboardActiveWorkerMapRecordsMatch(plannedRow, activeRow),
        )
        const executionSourceRow = dashboardActiveWorkerMapExecutionSourceForPlan(
          plannedRow,
          sourceRows,
          normalizedDay,
          activeNameCounts,
        )
        const actualWorkStatus = matchedWorkdayRow
          ? matchedWorkdayRow?.isRunning
            ? 'active'
            : 'finished'
          : ''
        const actualWorkStatusLabel = actualWorkStatus === 'active'
          ? 'W pracy'
          : actualWorkStatus === 'finished'
            ? 'Dzień zakończony'
            : 'Jeszcze bez statusu dnia pracy'
        const currentObjectLabel = matchedWorkdayRow
          ? dashboardActivityCleanCompanyLabel(dashboardResolveClientLabel(matchedWorkdayRow)) ||
            'Brak obiektu przy ostatnim odbiciu'
          : objectLabel
        const exactExecution = matchedWorkdayRow
          ? dashboardActiveWorkerMapExactPlanExecution(
              {
                ...matchedWorkdayRow,
                clientId:
                  dashboardActiveWorkerMapStrictClientId(executionSourceRow) ||
                  dashboardActiveWorkerMapStrictClientId(matchedWorkdayRow),
              },
              plannedRow,
              normalizedDay,
            )
          : {
              hasExactExecutionMatch: false,
              actualStartTs: 0,
              actualStopTs: 0,
            }
        const plannedMapState = resolveOperationalMapStatus({
          plannedStartTs: startTimestamp,
          actualStartTs: exactExecution.actualStartTs,
          actualStopTs: exactExecution.actualStopTs,
          nowTs: nowTimestamp,
          hasExactExecutionMatch: exactExecution.hasExactExecutionMatch,
        })
        return {
          workerKey,
          workerName: String(plannedRow?.workerDisplayName ?? plannedRow?.workerName ?? '').trim() || 'Nieznany pracownik',
          photoUrl: dashboardActiveWorkerMapPhotoUrl(plannedRow),
          avatarKind: dashboardActiveWorkerMapAvatarKind(plannedRow),
          objectLabel: currentObjectLabel,
          taskLabel: String(plannedRow?.label ?? '').trim() || 'Zaplanowane zadanie',
          plannedObjectLabel: objectLabel,
          plannedTimeLabel,
          workStatus: plannedMapState.status,
          workStatusLabel: dashboardActiveWorkerMapStatusLabel(plannedMapState.status),
          actualWorkStatus,
          actualWorkStatusLabel,
          clientId: String(plannedRow?.clientId ?? '').trim(),
          zoneId: String(plannedRow?.zoneId ?? '').trim(),
          delayMinutes: Number(plannedMapState.delayMinutes ?? 0),
          plannedStartTs: startTimestamp,
          plannedStopTs: stopTimestamp,
          plannedLat: coordinates.lat,
          plannedLng: coordinates.lng,
          startLabel,
          stopLabel,
          positionKind: 'plan',
          positionLabel: `Plan ${startLabel}`,
          positionDetailLabel: 'Lokalizacja zaplanowanego zadania',
          positionTimestamp: startTimestamp,
          gpsTimeLabel: '',
          gpsTimestamp: 0,
          lat: coordinates.lat,
          lng: coordinates.lng,
          ...dashboardActiveWorkerMapPlanContext(plannedRow),
        }
      })
      .filter(Boolean)

    const statusPriority = { late: 0, active: 1, planned: 2, finished: 3 }
    return [...workdayLocations, ...plannedLocations]
      .sort((left, right) => {
        if (left.workStatus !== right.workStatus) {
          return Number(statusPriority[left.workStatus] ?? 9) - Number(statusPriority[right.workStatus] ?? 9)
        }
        return dashboardWorkerSurnameSortKey(left.workerName).localeCompare(
          dashboardWorkerSurnameSortKey(right.workerName),
          'pl',
        )
      })
  }

  function dashboardClearActiveWorkerMapMarkers() {
    dashboardActiveWorkersMapMarkers.forEach((marker) => {
      if (dashboardActiveWorkersMapProvider === 'openstreetmap' && typeof marker?.remove === 'function') {
        marker.remove()
      } else if (marker && typeof marker.setMap === 'function') {
        marker.setMap(null)
      }
    })
    dashboardActiveWorkersMapMarkers = []
    dashboardActiveWorkersMapMarkersByKey = new Map()
    dashboardActiveWorkersMapSelectedMarker = null
  }

  function dashboardDestroyActiveWorkerMap() {
    dashboardCloseActiveWorkerMapDialog({ restoreFocus: false })
    dashboardActiveWorkersMapRenderSeq += 1
    dashboardClearActiveWorkerMapMarkers()
    dashboardActiveWorkersMapExpandedGroupKey = ''
    dashboardActiveWorkersMapLiveGroupKey = ''
    if (dashboardActiveWorkersMapProvider === 'openstreetmap') {
      dashboardActiveWorkersMapInstance?.off?.()
      dashboardActiveWorkersMapInstance?.remove?.()
    } else {
      dashboardActiveWorkersMapInfoWindow?.close?.()
    }
    if (
      dashboardActiveWorkersMapProvider === 'google' &&
      dashboardActiveWorkersMapInstance &&
      window.google?.maps?.event?.clearInstanceListeners
    ) {
      window.google.maps.event.clearInstanceListeners(dashboardActiveWorkersMapInstance)
    }
    dashboardActiveWorkersMapInfoWindow = null
    dashboardActiveWorkersMapInstance = null
    dashboardActiveWorkersMapSignature = ''
    dashboardActiveWorkersMapProvider = ''
  }

  function dashboardActiveWorkerMapCanvas() {
    if (dashboardActiveWorkersMapProvider === 'openstreetmap') {
      return dashboardActiveWorkersMapInstance?.getContainer?.() ?? null
    }
    return dashboardActiveWorkersMapInstance?.getDiv?.() ?? null
  }

  function dashboardActiveWorkerMapDialogIsOpen() {
    const overlay = document.getElementById('dashActiveWorkersMapOverlay')
    return Boolean(overlay && !overlay.hidden)
  }

  function dashboardResizeActiveWorkerMap() {
    window.requestAnimationFrame(() => {
      if (dashboardActiveWorkersMapProvider === 'openstreetmap') {
        dashboardActiveWorkersMapInstance?.invalidateSize?.({ pan: false })
        if (dashboardActiveWorkerMapDialogIsOpen() && dashboardActiveWorkersMapSelectedMarker) {
          window.requestAnimationFrame(() => {
            if (!dashboardActiveWorkerMapDialogIsOpen() || !dashboardActiveWorkersMapSelectedMarker) {
              return
            }
            const position = dashboardActiveWorkersMapSelectedMarker.getLatLng?.()
            if (position) {
              dashboardActiveWorkersMapInstance?.panTo?.(position, { animate: false })
            }
            dashboardActiveWorkersMapSelectedMarker.openPopup?.()
          })
        }
        return
      }
      if (dashboardActiveWorkersMapProvider === 'google' && dashboardActiveWorkersMapInstance) {
        window.google?.maps?.event?.trigger?.(dashboardActiveWorkersMapInstance, 'resize')
        if (dashboardActiveWorkerMapDialogIsOpen() && dashboardActiveWorkersMapSelectedMarker) {
          dashboardOpenActiveWorkerMapMarker(dashboardActiveWorkersMapSelectedMarker)
        }
      }
    })
  }

  function dashboardSetActiveWorkerMapExpandAvailability(isAvailable) {
    const button = document.getElementById('dashActiveWorkersMapExpand')
    if (!(button instanceof HTMLButtonElement)) {
      return
    }
    button.disabled = !isAvailable
    button.setAttribute('aria-disabled', isAvailable ? 'false' : 'true')
  }

  function dashboardOpenActiveWorkerMapDialog(trigger = null) {
    if (!dashboardActiveWorkersMapInstance || dashboardActiveWorkerMapDialogIsOpen()) {
      return
    }

    const overlay = document.getElementById('dashActiveWorkersMapOverlay')
    const modalHost = document.getElementById('dashActiveWorkersMapModalHost')
    const canvas = document.getElementById('dashActiveWorkersMap')
    const closeButton = document.getElementById('dashActiveWorkersMapClose')
    if (!(overlay instanceof HTMLElement) || !(modalHost instanceof HTMLElement) || !(canvas instanceof HTMLElement)) {
      return
    }

    dashboardActiveWorkersMapRestoreFocus = trigger instanceof HTMLElement
      ? trigger
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    modalHost.appendChild(canvas)
    canvas.classList.add('is-expanded')
    overlay.hidden = false
    overlay.setAttribute('aria-hidden', 'false')
    document.documentElement.classList.add('is-dashboard-map-modal-open')
    document.body.classList.add('is-dashboard-map-modal-open')
    document.getElementById('dashActiveWorkersMapExpand')?.setAttribute('aria-expanded', 'true')
    dashboardResizeActiveWorkerMap()
    window.requestAnimationFrame(() => closeButton?.focus?.())
  }

  function dashboardCloseActiveWorkerMapDialog(options = {}) {
    const overlay = document.getElementById('dashActiveWorkersMapOverlay')
    if (!(overlay instanceof HTMLElement) || overlay.hidden) {
      return
    }

    const miniHost = document.getElementById('dashActiveWorkersMapHome')
    const canvas = document.getElementById('dashActiveWorkersMap')
    if (miniHost instanceof HTMLElement && canvas instanceof HTMLElement) {
      canvas.classList.remove('is-expanded')
      miniHost.insertBefore(canvas, miniHost.firstChild)
    }

    overlay.hidden = true
    overlay.setAttribute('aria-hidden', 'true')
    document.documentElement.classList.remove('is-dashboard-map-modal-open')
    document.body.classList.remove('is-dashboard-map-modal-open')
    document.getElementById('dashActiveWorkersMapExpand')?.setAttribute('aria-expanded', 'false')
    dashboardResizeActiveWorkerMap()

    const restoreTarget = dashboardActiveWorkersMapRestoreFocus
    dashboardActiveWorkersMapRestoreFocus = null
    if (options.restoreFocus !== false && restoreTarget?.isConnected) {
      window.requestAnimationFrame(() => restoreTarget.focus?.())
    }
  }

  function dashboardTrapActiveWorkerMapDialogFocus(event) {
    if (event.key !== 'Tab') {
      return
    }
    const overlay = document.getElementById('dashActiveWorkersMapOverlay')
    if (!(overlay instanceof HTMLElement) || overlay.hidden) {
      return
    }
    const focusable = [...overlay.querySelectorAll(
      'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    )].filter((node) => node instanceof HTMLElement && !node.hidden)
    if (!focusable.length) {
      event.preventDefault()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function dashboardOperationsDialogIsOpen() {
    const overlay = document.getElementById('dashCommandOperationsOverlay')
    return Boolean(overlay && !overlay.hidden)
  }

  function dashboardOpenOperationsDialog(trigger = null) {
    const overlay = document.getElementById('dashCommandOperationsOverlay')
    const closeButton = document.getElementById('dashCommandOperationsClose')
    const list = document.getElementById('dashCommandAllOperationsList')
    if (
      !(overlay instanceof HTMLElement) ||
      dashboardOperationsDialogIsOpen() ||
      !dashboardServiceOperationStream.length
    ) {
      return
    }

    if (dashboardActiveWorkerMapDialogIsOpen()) {
      dashboardCloseActiveWorkerMapDialog({ restoreFocus: false })
    }
    dashboardOperationsDialogRestoreFocus = trigger instanceof HTMLElement
      ? trigger
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    overlay.hidden = false
    overlay.setAttribute('aria-hidden', 'false')
    document.documentElement.classList.add('is-dashboard-operations-modal-open')
    document.body.classList.add('is-dashboard-operations-modal-open')
    window.requestAnimationFrame(() => {
      closeButton?.focus?.()
      if (list instanceof HTMLElement) {
        list.scrollTop = 0
      }
    })
  }

  function dashboardCloseOperationsDialog(options = {}) {
    const overlay = document.getElementById('dashCommandOperationsOverlay')
    if (!(overlay instanceof HTMLElement) || overlay.hidden) {
      return
    }

    overlay.hidden = true
    overlay.setAttribute('aria-hidden', 'true')
    document.documentElement.classList.remove('is-dashboard-operations-modal-open')
    document.body.classList.remove('is-dashboard-operations-modal-open')

    const restoreTarget = dashboardOperationsDialogRestoreFocus
    dashboardOperationsDialogRestoreFocus = null
    if (options.restoreFocus !== false && restoreTarget?.isConnected) {
      window.requestAnimationFrame(() => restoreTarget.focus?.())
    }
  }

  function dashboardTrapOperationsDialogFocus(event) {
    if (event.key !== 'Tab') {
      return
    }
    const overlay = document.getElementById('dashCommandOperationsOverlay')
    if (!(overlay instanceof HTMLElement) || overlay.hidden) {
      return
    }
    const focusable = [...overlay.querySelectorAll(
      'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    )].filter((node) => node instanceof HTMLElement && !node.hidden)
    if (!focusable.length) {
      event.preventDefault()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function dashboardLoadOpenStreetMap() {
    if (window.L?.map && window.L?.tileLayer && window.L?.marker) {
      return Promise.resolve(window.L)
    }
    if (dashboardOpenStreetMapLoaderPromise) {
      return dashboardOpenStreetMapLoaderPromise
    }

    dashboardOpenStreetMapLoaderPromise = new Promise((resolve, reject) => {
      const stylesheetId = 'cleanzi-leaflet-css'
      if (!document.getElementById(stylesheetId)) {
        const stylesheet = document.createElement('link')
        stylesheet.id = stylesheetId
        stylesheet.rel = 'stylesheet'
        stylesheet.href = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css'
        stylesheet.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='
        stylesheet.crossOrigin = 'anonymous'
        document.head.appendChild(stylesheet)
      }

      const scriptId = 'cleanzi-leaflet-js'
      const existingScript = document.getElementById(scriptId)
      const handleLoaded = () => {
        if (window.L?.map && window.L?.tileLayer && window.L?.marker) {
          resolve(window.L)
          return
        }
        reject(new Error('OpenStreetMap loader did not expose Leaflet.'))
      }
      const handleError = () => reject(new Error('Nie udało się pobrać lokalnego fallbacku OpenStreetMap.'))

      if (existingScript) {
        existingScript.addEventListener('load', handleLoaded, { once: true })
        existingScript.addEventListener('error', handleError, { once: true })
        return
      }

      const script = document.createElement('script')
      script.id = scriptId
      script.src = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js'
      script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='
      script.crossOrigin = 'anonymous'
      script.addEventListener('load', handleLoaded, { once: true })
      script.addEventListener('error', handleError, { once: true })
      document.head.appendChild(script)
    }).catch((error) => {
      dashboardOpenStreetMapLoaderPromise = null
      throw error
    })

    return dashboardOpenStreetMapLoaderPromise
  }

  function dashboardActiveWorkerMapInfoHtml(location = {}) {
    const workStatus = dashboardActiveWorkerMapStatus(location?.workStatus)
    const statusDetails = workStatus === 'planned'
      ? [location?.workStatusLabel ?? 'Zaplanowany', location?.actualWorkStatusLabel].filter(Boolean).join(' · ')
      : workStatus === 'late'
        ? `${location?.workStatusLabel ?? 'Nie rozpoczął w czasie'} · ${Number(location?.delayMinutes ?? 0)} min po czasie`
      : workStatus === 'finished' && location?.stopLabel && location.stopLabel !== '--:--'
        ? `${location.workStatusLabel} · STOP ${location.stopLabel}`
        : location?.workStatusLabel ?? 'W pracy'
    const taskHtml = workStatus === 'planned' && location?.taskLabel
      ? `<span>${escapeHtml(location.taskLabel)}</span>`
      : ''
    const plannedDetailsHtml = workStatus === 'planned' && location?.plannedTimeLabel
      ? `<span>Plan: ${escapeHtml(location.plannedTimeLabel)} · ${escapeHtml(location?.plannedObjectLabel ?? location?.objectLabel ?? 'Zaplanowany obiekt')}</span>`
      : ''
    const currentObjectHtml = workStatus === 'planned' && location?.positionKind === 'plan' && !location?.actualWorkStatus
      ? ''
      : `<span>${escapeHtml(`${workStatus === 'planned' ? 'Aktualnie: ' : ''}${location?.objectLabel ?? 'Brak rozpoznanego obiektu'}`)}</span>`
    return `
      <div class="dash-active-workers-map-info">
        <strong>${escapeHtml(location?.workerName ?? 'Pracownik')}</strong>
        <span class="dash-active-workers-map-info-status is-${workStatus}">${escapeHtml(statusDetails)}</span>
        ${taskHtml}
        ${plannedDetailsHtml}
        ${currentObjectHtml}
        <small>${escapeHtml(location?.positionDetailLabel ?? `Ostatni GPS: ${location?.gpsTimeLabel ?? '--:--'}`)}</small>
      </div>
    `
  }

  function dashboardActiveWorkerMapAvatarHtml(location = {}) {
    const photoUrl = String(location?.photoUrl ?? '').trim()
    if (photoUrl) {
      return `<img src="${escapeHtml(photoUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
    }
    const avatarKind = location?.avatarKind === 'female' ? 'female' : 'male'
    return `<img src="/assets/avatars/default-${avatarKind}.webp" alt="" loading="lazy" />`
  }

  function dashboardActiveWorkerMapTaskAvailable(location = {}) {
    return Boolean(
      String(location?.editorOrderId ?? location?.sourceOrderId ?? location?.orderId ?? '').trim(),
    )
  }

  function dashboardActiveWorkerMapPersonHtml(location = {}, options = {}) {
    const workStatus = dashboardActiveWorkerMapStatus(location?.workStatus)
    const delayMinutes = Math.max(0, Number(location?.delayMinutes ?? 0) || 0)
    const plannedStartTs = Number(location?.plannedStartTs ?? 0)
    const plannedStopTs = Number(location?.plannedStopTs ?? 0)
    const nowTs = Date.now()
    const remainingPercent = workStatus === 'finished'
      ? 0
      : workStatus === 'active' && plannedStopTs > plannedStartTs
        ? Math.max(0, Math.min(100, ((plannedStopTs - nowTs) / (plannedStopTs - plannedStartTs)) * 100))
        : 100
    const plannedStartLabel = Number(location?.plannedStartTs) > 0
      ? dashboardOverviewTimeLabel(Number(location.plannedStartTs))
      : location?.startLabel ?? '--:--'
    const isLate = workStatus === 'late'
    const positionStyle = Number.isFinite(options?.x) && Number.isFinite(options?.y)
      ? `--dash-map-x:${Number(options.x)}px;--dash-map-y:${Number(options.y)}px;`
      : ''
    const style = ` style="${positionStyle}--dash-map-remaining:${Math.round(remainingPercent)}"`
    const selectedClass = options?.selected ? ' is-selected' : ''
    const lateLabel = isLate
      ? `<span class="dash-command-map-person__alarm">${escapeHtml(`${delayMinutes} min po czasie`)}</span>`
      : ''
    const taskButton = dashboardActiveWorkerMapTaskAvailable(location)
      ? `
          <button
            class="dash-command-map-person__task"
            type="button"
            data-dashboard-map-open-task="${escapeHtml(location.workerKey)}"
          >
            <i class="ph ph-note-pencil" aria-hidden="true"></i>
            Otwórz zadanie
          </button>
        `
      : ''

    return `
      <div class="dash-command-map-person is-${workStatus}${selectedClass}"${style} data-dashboard-map-person="${escapeHtml(location.workerKey)}">
        <button
          class="dash-command-map-person__bubble"
          type="button"
          data-dashboard-map-select-worker="${escapeHtml(location.workerKey)}"
          aria-label="${escapeHtml(`${location.workerName}. ${location.workStatusLabel}. ${location.plannedObjectLabel || location.objectLabel}`)}"
        >
          ${dashboardActiveWorkerMapAvatarHtml(location)}
          ${isLate ? '<i class="ph ph-warning-circle dash-command-map-person__warning" aria-hidden="true"></i>' : ''}
        </button>
        <span class="dash-command-map-person__name">${escapeHtml(location.workerName)}</span>
        ${lateLabel}
        <div class="dash-command-map-person__details" role="group" aria-label="${escapeHtml(`Szczegóły: ${location.workerName}`)}">
          <strong>${escapeHtml(location.workerName)}</strong>
          <span>${escapeHtml(`Plan ${plannedStartLabel}`)}</span>
          ${taskButton}
        </div>
      </div>
    `
  }

  function dashboardActiveWorkerMapGroupCenter(group = {}) {
    const coordinates = (Array.isArray(group?.locations) ? group.locations : [])
      .map((location) => ({
        lat: Number(location?.plannedLat ?? location?.lat),
        lng: Number(location?.plannedLng ?? location?.lng),
      }))
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
    if (!coordinates.length) {
      return null
    }
    return {
      lat: coordinates.reduce((sum, point) => sum + point.lat, 0) / coordinates.length,
      lng: coordinates.reduce((sum, point) => sum + point.lng, 0) / coordinates.length,
    }
  }

  function dashboardActiveWorkerMapGroupHtml(group = {}, options = {}) {
    const locations = Array.isArray(group?.locations) ? group.locations : []
    const orderedLocations = locations
      .slice()
      .sort((left, right) =>
        Number(dashboardActiveWorkerMapStatus(right?.workStatus) === 'late') -
          Number(dashboardActiveWorkerMapStatus(left?.workStatus) === 'late') ||
        Number(right?.delayMinutes ?? 0) - Number(left?.delayMinutes ?? 0),
      )
    const slots = [
      { x: -64, y: -52 },
      { x: 64, y: -52 },
      { x: -72, y: 4 },
      { x: 72, y: 4 },
      { x: -58, y: 58 },
      { x: 58, y: 58 },
      { x: 0, y: 76 },
    ]
    const visibleLocations = orderedLocations.slice(0, slots.length)
    const lateLocations = orderedLocations.filter(
      (location) => dashboardActiveWorkerMapStatus(location?.workStatus) === 'late',
    )
    const selectedWorkerKey = String(options?.selectedWorkerKey ?? lateLocations[0]?.workerKey ?? '').trim()
    const expandedClass = options?.expanded ? ' is-expanded' : ''
    const lateClass = lateLocations.length ? ' has-late' : ''
    const peopleHtml = visibleLocations
      .map((location, index) =>
        dashboardActiveWorkerMapPersonHtml(location, {
          ...slots[index],
          selected: String(location?.workerKey ?? '') === selectedWorkerKey,
        }),
      )
      .join('')
    const overflowCount = Math.max(0, orderedLocations.length - visibleLocations.length)
    const overflowHtml = overflowCount
      ? `<span class="dash-command-map-object__overflow">+${overflowCount}</span>`
      : ''
    const alertCountHtml = lateLocations.length
      ? `<span class="dash-command-map-object__alert" aria-label="${lateLocations.length} alarmów">${lateLocations.length}</span>`
      : ''
    const {
      objectProgress,
      statusCounts,
      zoneSummary,
    } = buildOperationalMapObjectLiveSummary(orderedLocations)
    const liveStatusHtml = [
      statusCounts.active
        ? `<span class="is-active">${statusCounts.active} w pracy</span>`
        : '',
      statusCounts.planned
        ? `<span class="is-planned">${statusCounts.planned} zaplanowanych</span>`
        : '',
      statusCounts.finished
        ? `<span class="is-finished">${statusCounts.finished} zakończonych</span>`
        : '',
      statusCounts.late
        ? `<span class="is-late">${statusCounts.late} alarm</span>`
        : '',
    ].filter(Boolean).join('')
    const livePeopleHtml = orderedLocations.map((location) => {
      const status = dashboardActiveWorkerMapStatus(location?.workStatus)
      const statusLabel = location?.workStatusLabel ?? {
        active: 'W pracy',
        planned: 'Zaplanowany',
        finished: 'Zakończony',
        late: 'Nie rozpoczął w czasie',
      }[status]
      const timeLabel = status === 'finished'
        ? location?.stopLabel && location.stopLabel !== '--:--'
          ? `STOP ${location.stopLabel}`
          : ''
        : status === 'active'
          ? location?.startLabel && location.startLabel !== '--:--'
            ? `od ${location.startLabel}`
            : ''
          : location?.plannedTimeLabel ?? ''
      return `
        <li>
          <i class="is-${status}" aria-hidden="true"></i>
          <strong>${escapeHtml(location?.workerName ?? 'Pracownik')}</strong>
          <span>${escapeHtml([statusLabel, timeLabel].filter(Boolean).join(' · '))}</span>
        </li>
      `
    }).join('')
    const liveOpenClass = options?.liveOpen ? ' is-live-open' : ''

    return `
      <div
        class="dash-command-map-object${expandedClass}${lateClass}${liveOpenClass}"
        data-dashboard-map-group="${escapeHtml(group.key)}"
        style="--dash-object-progress:${objectProgress}"
      >
        <button
          class="dash-command-map-object__button"
          type="button"
          data-dashboard-map-object-toggle="${escapeHtml(group.key)}"
          aria-expanded="${options?.expanded ? 'true' : 'false'}"
          aria-label="${escapeHtml(`${group.objectLabel}. ${locations.length} osób. Pokaż pracowników`)}"
        >
          <span class="dash-command-map-object__ring">
            <i class="ph ph-buildings" aria-hidden="true"></i>
          </span>
          ${alertCountHtml}
          ${overflowHtml}
          <span class="dash-command-map-object__label">${escapeHtml(`${group.objectLabel} · ${locations.length} osób`)}</span>
          <span class="dash-command-map-object__zones">${escapeHtml(zoneSummary)}</span>
        </button>
        <div class="dash-command-map-object__people" aria-label="${escapeHtml(`Pracownicy: ${group.objectLabel}`)}">
          ${peopleHtml}
        </div>
        <div
          class="dash-command-map-object__live"
          role="group"
          aria-label="${escapeHtml(`Dane na żywo: ${group.objectLabel}`)}"
        >
          <div class="dash-command-map-object__live-head">
            <span>Na żywo</span>
            <strong>${escapeHtml(group.objectLabel)}</strong>
          </div>
          <div class="dash-command-map-object__live-statuses">${liveStatusHtml}</div>
          <div class="dash-command-map-object__live-zones">
            <span>Postęp stref</span>
            <strong>${escapeHtml(zoneSummary)}</strong>
          </div>
          <ul>${livePeopleHtml}</ul>
        </div>
      </div>
    `
  }

  function dashboardActiveWorkerMapStandaloneHtml(location = {}) {
    return `
      <div class="dash-command-map-standalone">
        ${dashboardActiveWorkerMapPersonHtml(location, {
          selected: dashboardActiveWorkerMapStatus(location?.workStatus) === 'late',
        })}
      </div>
    `
  }

  async function dashboardOpenActiveWorkerMapTask(location = {}) {
    if (!dashboardActiveWorkerMapTaskAvailable(location)) {
      showTransientNotice('To zadanie nie ma kompletnego identyfikatora edycji.', 'error')
      return
    }

    await dashboardSyncCalendarOrdersForTimeline({ forceRefresh: false })
    const orderBar = document.createElement('span')
    const attributes = {
      'data-calendar-timeline-order-id': location?.editorOrderId || location?.sourceOrderId || location?.orderId,
      'data-calendar-timeline-source-order-id': location?.sourceOrderId || location?.editorOrderId || location?.orderId,
      'data-calendar-timeline-date': location?.dateYmd || location?.occurrenceDateYmd,
      'data-calendar-timeline-occurrence-date': location?.occurrenceDateYmd,
      'data-calendar-timeline-work-slot-key': location?.workSlotKey,
      'data-calendar-timeline-service-block-id': location?.serviceBlockId,
      'data-calendar-timeline-service-block-kind': location?.serviceBlockKind,
      'data-calendar-timeline-service-block-label': location?.serviceBlockLabel,
    }
    Object.entries(attributes).forEach(([name, value]) => {
      const normalized = String(value ?? '').trim()
      if (normalized) {
        orderBar.setAttribute(name, normalized)
      }
    })
    if (location?.isRecurringSeries) orderBar.setAttribute('data-calendar-timeline-recurring-series', '1')
    if (location?.isRecurringInstance) orderBar.setAttribute('data-calendar-timeline-recurring-instance', '1')
    if (location?.recurrenceOverride) orderBar.setAttribute('data-calendar-timeline-recurrence-override', '1')

    const context = calendarTimelineContextFromBar(orderBar)
    if (!context) {
      showTransientNotice('Nie udało się odnaleźć zlecenia do edycji.', 'error')
      return
    }
    calendarTimelineEditOrderFromContext(context)
  }

  function dashboardActiveWorkerMapLocationForMarker(marker, workerKey = '') {
    const normalizedKey = String(workerKey ?? '').trim()
    const locations = Array.isArray(marker?.__cleanziWorkerLocations)
      ? marker.__cleanziWorkerLocations
      : marker?.__cleanziWorkerLocation
        ? [marker.__cleanziWorkerLocation]
        : []
    return locations.find((location) => String(location?.workerKey ?? '').trim() === normalizedKey) ?? locations[0] ?? null
  }

  function dashboardBindActiveWorkerMapMarkerElement(marker) {
    const element = marker?.getElement?.()
    if (!(element instanceof HTMLElement) || element.dataset.cleanziMapBound === '1') {
      return
    }
    element.dataset.cleanziMapBound = '1'
    element.addEventListener('click', (event) => {
      const taskButton = event.target?.closest?.('[data-dashboard-map-open-task]')
      if (taskButton instanceof HTMLButtonElement) {
        event.preventDefault()
        event.stopPropagation()
        const location = dashboardActiveWorkerMapLocationForMarker(
          marker,
          taskButton.getAttribute('data-dashboard-map-open-task'),
        )
        if (location) {
          void dashboardOpenActiveWorkerMapTask(location)
        }
        return
      }

      const personButton = event.target?.closest?.('[data-dashboard-map-select-worker]')
      if (personButton instanceof HTMLButtonElement) {
        event.preventDefault()
        event.stopPropagation()
        const workerKey = String(personButton.getAttribute('data-dashboard-map-select-worker') ?? '').trim()
        const cluster = element.querySelector('.dash-command-map-object')
        if (cluster instanceof HTMLElement) {
          document.querySelectorAll('.dash-command-map-object').forEach((node) => {
            if (node !== cluster) {
              node.classList.remove('is-expanded', 'is-live-open')
              node.querySelector('[data-dashboard-map-object-toggle]')?.setAttribute('aria-expanded', 'false')
            }
          })
          cluster.classList.remove('is-live-open')
          cluster.classList.add('is-expanded')
          cluster.querySelector('[data-dashboard-map-object-toggle]')?.setAttribute('aria-expanded', 'true')
          dashboardActiveWorkersMapExpandedGroupKey = String(cluster.dataset.dashboardMapGroup ?? '').trim()
          dashboardActiveWorkersMapLiveGroupKey = ''
        }
        element.querySelectorAll('.dash-command-map-person').forEach((node) => {
          node.classList.toggle(
            'is-selected',
            String(node.getAttribute('data-dashboard-map-person') ?? '') === workerKey,
          )
        })
        dashboardActiveWorkersMapSelectedMarker = marker
        return
      }

      const objectButton = event.target?.closest?.('[data-dashboard-map-object-toggle]')
      if (objectButton instanceof HTMLButtonElement) {
        event.preventDefault()
        event.stopPropagation()
        const cluster = objectButton.closest('.dash-command-map-object')
        if (!(cluster instanceof HTMLElement)) {
          return
        }
        const nextLiveOpen = !cluster.classList.contains('is-live-open')
        document.querySelectorAll('.dash-command-map-object').forEach((node) => {
          if (node !== cluster) {
            node.classList.remove('is-expanded', 'is-live-open')
            node.querySelector('[data-dashboard-map-object-toggle]')?.setAttribute('aria-expanded', 'false')
          }
        })
        document.querySelectorAll('.dash-command-map-person.is-selected').forEach((node) => {
          node.classList.remove('is-selected')
        })
        cluster.classList.toggle('is-expanded', nextLiveOpen)
        cluster.classList.toggle('is-live-open', nextLiveOpen)
        objectButton.setAttribute('aria-expanded', nextLiveOpen ? 'true' : 'false')
        dashboardActiveWorkersMapExpandedGroupKey = nextLiveOpen
          ? String(cluster.dataset.dashboardMapGroup ?? '').trim()
          : ''
        dashboardActiveWorkersMapLiveGroupKey = dashboardActiveWorkersMapExpandedGroupKey
        dashboardActiveWorkersMapSelectedMarker = marker
        if (nextLiveOpen && dashboardActiveWorkersMapProvider === 'openstreetmap') {
          const position = marker.getLatLng?.()
          if (position) {
            dashboardActiveWorkersMapInstance?.panTo?.(position)
            window.requestAnimationFrame(() => {
              dashboardActiveWorkersMapInstance?.panBy?.([0, 70], { animate: true })
            })
          }
        }
      }
    })
  }

  function dashboardOpenActiveWorkerMapMarker(marker, workerKey = '') {
    if (!marker || !dashboardActiveWorkersMapInstance) {
      return
    }
    dashboardActiveWorkersMapSelectedMarker = marker
    if (dashboardActiveWorkersMapProvider === 'openstreetmap') {
      const element = marker.getElement?.()
      const cluster = element?.querySelector?.('.dash-command-map-object')
      if (cluster instanceof HTMLElement) {
        document.querySelectorAll('.dash-command-map-object').forEach((node) => {
          if (node !== cluster) {
            node.classList.remove('is-expanded', 'is-live-open')
            node.querySelector('[data-dashboard-map-object-toggle]')?.setAttribute('aria-expanded', 'false')
          }
        })
        cluster.classList.remove('is-live-open')
        cluster.classList.add('is-expanded')
        cluster.querySelector('[data-dashboard-map-object-toggle]')?.setAttribute('aria-expanded', 'true')
        dashboardActiveWorkersMapExpandedGroupKey = String(cluster.dataset.dashboardMapGroup ?? '').trim()
        dashboardActiveWorkersMapLiveGroupKey = ''
      }
      if (workerKey && element instanceof HTMLElement) {
        element.querySelectorAll('.dash-command-map-person').forEach((node) => {
          node.classList.toggle(
            'is-selected',
            String(node.getAttribute('data-dashboard-map-person') ?? '') === String(workerKey),
          )
        })
      }
      marker.openPopup?.()
      return
    }
    if (!dashboardActiveWorkersMapInfoWindow) {
      return
    }
    const location = dashboardActiveWorkerMapLocationForMarker(marker, workerKey) ?? {}
    dashboardActiveWorkersMapInfoWindow.setContent(dashboardActiveWorkerMapInfoHtml(location))
    dashboardActiveWorkersMapInfoWindow.open({
      anchor: marker,
      map: dashboardActiveWorkersMapInstance,
    })
  }

  function dashboardFocusActiveWorkerMapMarker(workerKey = '') {
    const marker = dashboardActiveWorkersMapMarkersByKey.get(String(workerKey ?? '').trim())
    if (!marker || !dashboardActiveWorkersMapInstance) {
      return
    }
    const position = dashboardActiveWorkersMapProvider === 'openstreetmap'
      ? marker.getLatLng?.()
      : marker.getPosition?.()
    if (position) {
      dashboardActiveWorkersMapInstance.panTo(position)
    }
    if (Number(dashboardActiveWorkersMapInstance.getZoom?.() ?? 0) < 14) {
      dashboardActiveWorkersMapInstance.setZoom(14)
    }
    dashboardOpenActiveWorkerMapMarker(marker, workerKey)
  }

  function dashboardRenderActiveWorkerLocationList(locations = [], totalWorkers = 0) {
    const countNode = document.getElementById('dashActiveWorkersMapCount')
    const dialogCountNode = document.getElementById('dashActiveWorkersMapDialogCount')
    const commandCountNode = document.getElementById('dashCommandMapCount')
    const listNode = document.getElementById('dashActiveWorkersLocationList')
    const validLocations = Array.isArray(locations) ? locations : []
    const normalizedTotal = Math.max(Number(totalWorkers) || 0, validLocations.length)
    const countLabel = `${validLocations.length} / ${normalizedTotal} na mapie`
    const statusCounts = validLocations.reduce(
      (counts, location) => {
        const status = dashboardActiveWorkerMapStatus(location?.workStatus)
        counts[status] += 1
        return counts
      },
      { active: 0, planned: 0, finished: 0, late: 0 },
    )
    if (countNode) countNode.textContent = countLabel
    if (dialogCountNode) dialogCountNode.textContent = countLabel
    if (commandCountNode) commandCountNode.textContent = countLabel
    dashboardSetInsightPanelCompactCopy(
      'objects',
      normalizedTotal > 0
        ? `${validLocations.length} z ${normalizedTotal} osób na mapie`
        : 'Brak dzisiejszych pracowników',
      `W pracy ${statusCounts.active} · Zaplanowani ${statusCounts.planned} · Zakończeni ${statusCounts.finished} · Alarm ${statusCounts.late}`,
    )
    const notificationCount = document.getElementById('dashCommandNotificationCount')
    if (notificationCount) {
      notificationCount.textContent = String(statusCounts.late)
      notificationCount.hidden = statusCounts.late <= 0
    }
    if (!listNode) {
      return
    }
    if (!validLocations.length) {
      listNode.innerHTML = `<li class="dash-active-workers-location-empty">${escapeHtml(
        normalizedTotal > 0
          ? 'Brak pozycji GPS i lokalizacji zaplanowanych zadań.'
          : 'Brak dzisiejszych pracowników do pokazania.',
      )}</li>`
      return
    }

    listNode.innerHTML = validLocations.map((location) => {
      const workStatus = dashboardActiveWorkerMapStatus(location?.workStatus)
      const taskTitle = ['planned', 'late'].includes(workStatus) && location?.taskLabel ? ` ${location.taskLabel}.` : ''
      const statusSummary = workStatus === 'planned'
        ? [location.workStatusLabel, location.actualWorkStatusLabel].filter(Boolean).join(' · ')
        : workStatus === 'late'
          ? `${location.workStatusLabel} · ${Number(location.delayMinutes ?? 0)} min po czasie`
        : location.workStatusLabel
      const listObjectLabel = ['planned', 'late'].includes(workStatus)
        ? location.plannedObjectLabel || location.objectLabel
        : location.objectLabel
      const timeLabel = workStatus === 'late'
        ? `+${Number(location.delayMinutes ?? 0)} min`
        : location.positionLabel ?? `GPS ${location.gpsTimeLabel ?? '--:--'}`
      return `
        <li>
          <button
            class="dash-active-workers-location is-${workStatus}"
            type="button"
            data-dash-active-worker-map-key="${escapeHtml(location.workerKey)}"
            title="${escapeHtml(`${location.workStatusLabel}.${taskTitle} Pokaż pracownika na mapie`)}"
          >
            <span class="dash-active-workers-location-indicator" aria-hidden="true"></span>
            <span class="dash-active-workers-location-copy">
              <strong>${escapeHtml(location.workerName)}</strong>
              <small>${escapeHtml(`${listObjectLabel} · ${statusSummary}`)}</small>
            </span>
            <span class="dash-active-workers-location-time">${escapeHtml(timeLabel)}</span>
          </button>
        </li>
      `
    }).join('')
    dashboardApplyCommandCenterMapFilters()
  }

  function dashboardActiveWorkerMapStatusCopy(locations = [], totalWorkers = 0) {
    const validLocations = Array.isArray(locations) ? locations : []
    const normalizedTotal = Math.max(Number(totalWorkers) || 0, validLocations.length)
    const missing = Math.max(0, normalizedTotal - validLocations.length)
    if (missing > 0) {
      return `${validLocations.length} z ${normalizedTotal} dzisiejszych pracowników ma pozycję GPS lub lokalizację zadania. Kliknij mapę, aby ją powiększyć.`
    }
    return 'Szary oznacza plan, niebieski pracę w toku, zielony zakończenie, a czerwony brak rozpoczęcia ponad 10 minut po planie. Kliknij obiekt, aby zobaczyć jego pracowników.'
  }

  function dashboardActiveWorkerMapPreviewLocations(locations = []) {
    const previewEnabled =
      import.meta.env.DEV &&
      ['localhost', '127.0.0.1'].includes(String(window.location?.hostname ?? '').toLowerCase()) &&
      new URLSearchParams(window.location.search).get('mapAlarmPreview') === '1'
    const source = Array.isArray(locations) ? locations : []
    if (!previewEnabled) {
      return source
    }

    const groupedByClient = new Map()
    source.forEach((location) => {
      const clientId = String(location?.clientId ?? '').trim()
      if (!clientId) return
      if (!groupedByClient.has(clientId)) groupedByClient.set(clientId, [])
      groupedByClient.get(clientId).push(location)
    })
    const previewGroup = [...groupedByClient.values()]
      .filter((group) => group.length >= 2)
      .sort((left, right) => right.length - left.length)[0]
    const previewWorkerKey = String(previewGroup?.[0]?.workerKey ?? '').trim()
    if (!previewWorkerKey) {
      return source
    }
    return source.map((location) =>
      String(location?.workerKey ?? '').trim() === previewWorkerKey
        ? {
            ...location,
            workStatus: 'late',
            workStatusLabel: 'Nie rozpoczął w czasie',
            delayMinutes: 18,
            positionDetailLabel: 'Podgląd wizualny alarmu na localhost',
          }
        : location,
    )
  }

  async function dashboardRenderActiveWorkersMap(locations = [], totalWorkers = 0) {
    const canvas = document.getElementById('dashActiveWorkersMap')
    const statusNode = document.getElementById('dashActiveWorkersMapStatus')
    const validLocations = dashboardActiveWorkerMapPreviewLocations(locations)
    dashboardRenderActiveWorkerLocationList(validLocations, totalWorkers)
    if (!canvas) {
      return
    }

    if (
      dashboardActiveWorkersMapInstance &&
      dashboardActiveWorkerMapCanvas() !== canvas
    ) {
      dashboardDestroyActiveWorkerMap()
    }

    if (!validLocations.length) {
      dashboardDestroyActiveWorkerMap()
      dashboardSetActiveWorkerMapExpandAvailability(false)
      canvas.classList.remove('is-loading')
      canvas.classList.add('is-empty')
      canvas.setAttribute('aria-busy', 'false')
      canvas.innerHTML = '<div class="dash-active-workers-map-empty">Brak pozycji GPS i lokalizacji zaplanowanych zadań.</div>'
      if (statusNode) {
        statusNode.textContent = Number(totalWorkers) > 0
          ? 'Dzisiejsi pracownicy nie mają pozycji GPS ani zapisanej lokalizacji zadania.'
          : 'Brak dzisiejszych pracowników do pokazania na mapie.'
      }
      return
    }

    const targetProvider = 'openstreetmap'
    if (dashboardActiveWorkersMapInstance && dashboardActiveWorkersMapProvider !== targetProvider) {
      dashboardDestroyActiveWorkerMap()
    }

    const signature = [targetProvider, ...validLocations
      .map((location) => JSON.stringify([
        location.workerKey,
        location.workerName,
        location.objectLabel,
        location.plannedObjectLabel,
        location.taskLabel,
        location.plannedTimeLabel,
        location.clientId,
        location.workStatus,
        location.delayMinutes,
        location.actualWorkStatus,
        location.photoUrl,
        location.avatarKind,
        location.editorOrderId,
        location.sourceOrderId,
        location.positionTimestamp ?? location.gpsTimestamp,
        location.positionDetailLabel,
        location.lat.toFixed(6),
        location.lng.toFixed(6),
      ]))
      .sort()]
      .join('|')
    if (dashboardActiveWorkersMapInstance && signature === dashboardActiveWorkersMapSignature) {
      canvas.classList.remove('is-loading', 'is-empty')
      canvas.setAttribute('aria-busy', 'false')
      dashboardSetActiveWorkerMapExpandAvailability(true)
      window.requestAnimationFrame(() => {
        if (dashboardActiveWorkersMapProvider === 'openstreetmap') {
          dashboardActiveWorkersMapInstance?.invalidateSize?.({ pan: false })
        } else if (dashboardActiveWorkersMapInstance?.getDiv?.() === canvas) {
          window.google?.maps?.event?.trigger?.(dashboardActiveWorkersMapInstance, 'resize')
        }
      })
      if (statusNode) {
        statusNode.textContent = dashboardActiveWorkerMapStatusCopy(validLocations, totalWorkers)
      }
      dashboardApplyCommandCenterMapFilters()
      return
    }

    const renderSeq = ++dashboardActiveWorkersMapRenderSeq
    canvas.classList.add('is-loading')
    canvas.classList.remove('is-empty')
    canvas.setAttribute('aria-busy', 'true')
    dashboardSetActiveWorkerMapExpandAvailability(false)
    if (statusNode) {
      statusNode.textContent = 'Ładowanie pozycji i zaplanowanych zadań dzisiejszych pracowników...'
    }

    try {
      if (targetProvider === 'openstreetmap') {
        const leaflet = await dashboardLoadOpenStreetMap()
        if (renderSeq !== dashboardActiveWorkersMapRenderSeq || appState.currentRoute !== 'dashboard' || !canvas.isConnected) {
          return
        }

        canvas.innerHTML = ''
        if (!dashboardActiveWorkersMapInstance) {
          const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches === true
          dashboardActiveWorkersMapInstance = leaflet.map(canvas, {
            center: [51.9, 19.15],
            zoom: 6,
            dragging: true,
            keyboard: true,
            scrollWheelZoom: !coarsePointer,
            tap: true,
            zoomControl: true,
          })
          dashboardActiveWorkersMapProvider = 'openstreetmap'
          leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19,
          }).addTo(dashboardActiveWorkersMapInstance)
          dashboardActiveWorkersMapInstance.on('click', () => {
            dashboardOpenActiveWorkerMapDialog(canvas)
          })
        }

        dashboardClearActiveWorkerMapMarkers()
        const bounds = leaflet.latLngBounds()
        const groupedLocations = groupOperationalMapLocations(validLocations)
        const groups = groupedLocations.groups
          .map((group) => ({
            ...group,
            center: dashboardActiveWorkerMapGroupCenter(group),
          }))
          .filter((group) => group.center)
        const groupKeys = new Set(groups.map((group) => group.key))
        if (!groupKeys.has(dashboardActiveWorkersMapExpandedGroupKey)) {
          dashboardActiveWorkersMapExpandedGroupKey = ''
        }
        if (!groupKeys.has(dashboardActiveWorkersMapLiveGroupKey)) {
          dashboardActiveWorkersMapLiveGroupKey = ''
        }

        groups.forEach((group) => {
          const liveOpen = dashboardActiveWorkersMapLiveGroupKey === group.key
          const expanded = liveOpen || dashboardActiveWorkersMapExpandedGroupKey === group.key
          const marker = leaflet.marker([group.center.lat, group.center.lng], {
            alt: `${group.objectLabel}. ${group.locations.length} osób`,
            icon: leaflet.divIcon({
              className: 'dash-command-map-marker-wrap',
              html: dashboardActiveWorkerMapGroupHtml(group, { expanded, liveOpen }),
              iconAnchor: [0, 0],
              iconSize: [1, 1],
            }),
            keyboard: false,
          }).addTo(dashboardActiveWorkersMapInstance)
          marker.__cleanziWorkerLocations = group.locations
          marker.__cleanziGroupKey = group.key
          marker.on('add', () => window.requestAnimationFrame(() => dashboardBindActiveWorkerMapMarkerElement(marker)))
          window.requestAnimationFrame(() => dashboardBindActiveWorkerMapMarkerElement(marker))
          dashboardActiveWorkersMapMarkers.push(marker)
          group.locations.forEach((location) => {
            dashboardActiveWorkersMapMarkersByKey.set(location.workerKey, marker)
          })
          bounds.extend([group.center.lat, group.center.lng])
        })

        groupedLocations.standalone.forEach((location) => {
          const marker = leaflet.marker([location.lat, location.lng], {
            alt: `${location.workerName} · ${location.workStatusLabel} · ${location.objectLabel}`,
            icon: leaflet.divIcon({
              className: 'dash-command-map-marker-wrap',
              html: dashboardActiveWorkerMapStandaloneHtml(location),
              iconAnchor: [0, 0],
              iconSize: [1, 1],
            }),
            keyboard: false,
          }).addTo(dashboardActiveWorkersMapInstance)
          marker.__cleanziWorkerLocation = location
          marker.on('add', () => window.requestAnimationFrame(() => dashboardBindActiveWorkerMapMarkerElement(marker)))
          window.requestAnimationFrame(() => dashboardBindActiveWorkerMapMarkerElement(marker))
          dashboardActiveWorkersMapMarkers.push(marker)
          dashboardActiveWorkersMapMarkersByKey.set(location.workerKey, marker)
          bounds.extend([location.lat, location.lng])
        })

        const renderedMarkerCount = groups.length + groupedLocations.standalone.length
        const firstMarkerPosition = dashboardActiveWorkersMapMarkers[0]?.getLatLng?.()
        if (renderedMarkerCount === 1 && firstMarkerPosition) {
          dashboardActiveWorkersMapInstance.setView(firstMarkerPosition, 14)
        } else {
          dashboardActiveWorkersMapInstance.fitBounds(bounds, { maxZoom: 15, padding: [96, 96] })
        }
        dashboardActiveWorkersMapSignature = signature
        dashboardApplyCommandCenterMapFilters()
        window.requestAnimationFrame(() => dashboardActiveWorkersMapInstance?.invalidateSize?.({ pan: false }))
        canvas.classList.remove('is-loading', 'is-empty')
        canvas.setAttribute('aria-busy', 'false')
        dashboardSetActiveWorkerMapExpandAvailability(true)
        if (statusNode) {
          statusNode.textContent = dashboardActiveWorkerMapStatusCopy(validLocations, totalWorkers)
        }
        return
      }

      if (typeof ordersLoadGoogleMaps !== 'function') {
        throw new Error('Google Maps loader is unavailable.')
      }
      const maps = await ordersLoadGoogleMaps()
      if (renderSeq !== dashboardActiveWorkersMapRenderSeq || appState.currentRoute !== 'dashboard' || !canvas.isConnected) {
        return
      }

      canvas.innerHTML = ''
      if (!dashboardActiveWorkersMapInstance) {
        const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches === true
        dashboardActiveWorkersMapInstance = new maps.Map(canvas, {
          center: { lat: 51.9, lng: 19.15 },
          zoom: 6,
          gestureHandling: coarsePointer ? 'cooperative' : 'greedy',
          scrollwheel: !coarsePointer,
          draggable: true,
          keyboardShortcuts: true,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          styles: [
            { featureType: 'poi', stylers: [{ visibility: 'off' }] },
            { featureType: 'transit', stylers: [{ visibility: 'off' }] },
            { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f3f6f2' }] },
            { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#dceaf4' }] },
            { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
            { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#7b8794' }] },
          ],
        })
        dashboardActiveWorkersMapProvider = 'google'
        dashboardActiveWorkersMapInfoWindow = new maps.InfoWindow()
        dashboardActiveWorkersMapInstance.addListener('click', () => {
          dashboardOpenActiveWorkerMapDialog(canvas)
        })
      }

      dashboardClearActiveWorkerMapMarkers()
      const bounds = new maps.LatLngBounds()
      validLocations.forEach((location) => {
        const marker = new maps.Marker({
          map: dashboardActiveWorkersMapInstance,
          position: { lat: location.lat, lng: location.lng },
          icon: {
            url: {
              active: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png',
              planned: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
              finished: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
            }[dashboardActiveWorkerMapStatus(location.workStatus)],
            scaledSize: new maps.Size(34, 34),
          },
        })
        marker.__cleanziWorkerLocation = location
        marker.addListener('click', () => {
          dashboardOpenActiveWorkerMapDialog(canvas)
          window.requestAnimationFrame(() => dashboardOpenActiveWorkerMapMarker(marker))
        })
        dashboardActiveWorkersMapMarkers.push(marker)
        dashboardActiveWorkersMapMarkersByKey.set(location.workerKey, marker)
        bounds.extend({ lat: location.lat, lng: location.lng })
      })

      if (validLocations.length === 1) {
        dashboardActiveWorkersMapInstance.setCenter({ lat: validLocations[0].lat, lng: validLocations[0].lng })
        dashboardActiveWorkersMapInstance.setZoom(14)
      } else {
        dashboardActiveWorkersMapInstance.fitBounds(bounds, 42)
      }
      dashboardActiveWorkersMapSignature = signature
      dashboardApplyCommandCenterMapFilters()
      canvas.classList.remove('is-loading', 'is-empty')
      canvas.setAttribute('aria-busy', 'false')
      dashboardSetActiveWorkerMapExpandAvailability(true)
      if (statusNode) {
        statusNode.textContent = dashboardActiveWorkerMapStatusCopy(validLocations, totalWorkers)
      }
    } catch (error) {
      if (renderSeq !== dashboardActiveWorkersMapRenderSeq) {
        return
      }
      console.warn('[portal/dashboard] active workers map failed', error)
      dashboardDestroyActiveWorkerMap()
      dashboardSetActiveWorkerMapExpandAvailability(false)
      canvas.classList.remove('is-loading')
      canvas.classList.add('is-empty')
      canvas.setAttribute('aria-busy', 'false')
      canvas.innerHTML = '<div class="dash-active-workers-map-empty">Mapa jest chwilowo niedostępna.</div>'
      if (statusNode) {
        statusNode.textContent = 'Nie udało się uruchomić mapy. Lista pozycji pozostaje dostępna poniżej.'
      }
    }
  }

  function dashboardServiceIsExplicitEvent(row = {}) {
    const eventId = String(row?.eventId ?? row?.id ?? '').trim()
    const workdayId = String(row?.workdayId ?? row?.linkedWorkdayId ?? '').trim()
    const sourceKind = String(row?.historySourceKind ?? '').trim().toLowerCase()
    return Boolean(
      eventId &&
        (
          row?.hasExplicitEventId === true ||
          (sourceKind === 'event' && (!workdayId || eventId !== workdayId))
        ),
    )
  }



  function dashboardServiceExecutionIdentityKey(source = {}) {
    return [
      String(source?.orgId ?? '').trim(),
      String(source?.taskId ?? '').trim(),
      String(source?.occurrenceDateYmd ?? '').trim(),
      String(source?.serviceBlockId ?? '').trim(),
    ].join('\u001f')
  }

  function dashboardBuildServiceExecutionPlannedBlocks(plannedItems = []) {
    const blocks = new Map()
    const invalid = []

    ;(Array.isArray(plannedItems) ? plannedItems : []).forEach((item) => {
      const orgId = String(item?.orgId ?? appState.session?.orgId ?? '').trim()
      const taskId = String(item?.taskId ?? '').trim()
      const occurrenceDateYmd = String(item?.occurrenceDateYmd ?? '').trim()
      const serviceBlockId = String(item?.serviceBlockId ?? '').trim()
      const allocationId = String(item?.allocationId ?? '').trim()
      const workSlotKey = String(item?.executionWorkSlotKey ?? '').trim()
      const taskUpdatedAt = String(item?.taskUpdatedAt ?? '').trim()
      const allocation = {
        allocationId,
        workSlotKey,
        workerName: String(item?.workerDisplayName ?? item?.workerName ?? '').trim(),
        workerId: String(item?.workerId ?? '').trim(),
        workerLogin: String(item?.workerLogin ?? '').trim(),
        plannedStartAt: Number(item?.startTs) > 0 ? new Date(Number(item.startTs)).toISOString() : null,
        plannedEndAt: Number(item?.stopTs) > 0 ? new Date(Number(item.stopTs)).toISOString() : null,
      }
      const plan = {
        orgId,
        taskId,
        taskUpdatedAt,
        occurrenceDateYmd,
        serviceBlockId,
        taskLabel: String(item?.label ?? '').trim(),
        serviceBlockLabel: String(item?.serviceBlockLabel ?? '').trim(),
        clientId: String(item?.clientId ?? '').trim(),
        clientLabel: String(item?.companyLabel ?? item?.locationLabel ?? '').trim(),
        allocations: [allocation],
      }

      const hasExecutionIdentity = Boolean(serviceBlockId || allocationId || workSlotKey)
      if (!hasExecutionIdentity) {
        return
      }

      if (!orgId || !taskId || !occurrenceDateYmd || !serviceBlockId || !allocationId || !workSlotKey) {
        invalid.push(plan)
        return
      }

      const key = dashboardServiceExecutionIdentityKey(plan)
      if (!blocks.has(key)) {
        blocks.set(key, plan)
        return
      }

      const current = blocks.get(key)
      if (current.taskUpdatedAt !== taskUpdatedAt) {
        current.taskUpdatedAt = ''
      }
      const alreadyIncluded = current.allocations.some((candidate) =>
        candidate.allocationId === allocationId && candidate.workSlotKey === workSlotKey,
      )
      if (!alreadyIncluded) {
        current.allocations.push(allocation)
      }
    })

    return [...blocks.values(), ...invalid]
  }

  function dashboardPersistedServiceEventRows(
    rows = appState.dashboardScheduleSourceRows,
    orgId = appState.session?.orgId,
  ) {
    const normalizedOrgId = String(orgId ?? '').trim()
    return (Array.isArray(rows) ? rows : []).filter((row) => {
      const rowOrgId = String(row?.orgId ?? row?.org_id ?? '').trim()
      const persistedEventType = String(row?.eventType ?? row?.event_type ?? '')
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, '_')
      return (
        normalizedOrgId &&
        rowOrgId === normalizedOrgId &&
        dashboardServiceIsExplicitEvent(row) &&
        (persistedEventType === 'CLEAN' || persistedEventType.startsWith('CLEAN_'))
      )
    })
  }

  function dashboardServiceExecutionPlanForBlock(plannedBlocks = [], block = {}) {
    const key = dashboardServiceExecutionIdentityKey(block)
    return (Array.isArray(plannedBlocks) ? plannedBlocks : []).find(
      (plan) => dashboardServiceExecutionIdentityKey(plan) === key,
    ) ?? null
  }

  function dashboardServiceExecutionWorkerNames(block = {}, plan = null) {
    const visibleAllocationIds = new Set(
      block.status === 'ACTIVE'
        ? block.activeAllocationIds
        : block.requiredAllocationIds,
    )
    return [...new Set(
      (Array.isArray(plan?.allocations) ? plan.allocations : [])
        .filter((allocation) => visibleAllocationIds.has(String(allocation?.allocationId ?? '').trim()))
        .map((allocation) => String(allocation?.workerName ?? '').trim())
        .filter(Boolean),
    )]
  }

  function dashboardServiceExecutionTitle(block = {}) {
    const taskLabel = String(block?.taskLabel ?? '').trim() || `Zadanie ${String(block?.taskId ?? '').trim()}`
    const blockLabel = String(block?.serviceBlockLabel ?? '').trim() || `Blok ${String(block?.serviceBlockId ?? '').trim()}`
    return normalizeSearchText(taskLabel) === normalizeSearchText(blockLabel)
      ? taskLabel
      : `${taskLabel} · ${blockLabel}`
  }

  function dashboardBuildStrictServiceProgressItems(model = {}, plannedBlocks = []) {
    return (Array.isArray(model?.active) ? model.active : [])
      .map((block) => {
        const plan = dashboardServiceExecutionPlanForBlock(plannedBlocks, block)
        const openEvents = (Array.isArray(block?.events) ? block.events : []).filter(
          (event) => event?.state === 'OPEN',
        )
        const startTsValues = openEvents
          .map((event) => new Date(String(event?.startAt ?? '')).getTime())
          .filter((value) => Number.isFinite(value) && value > 0)
        const startTs = startTsValues.length ? Math.min(...startTsValues) : 0
        const measured = Number.isFinite(block?.progressPercent)
        const isPlanUsed = measured && Number(block.progressPercent) >= 100
        const clientLabel = String(block?.clientLabel ?? '').trim()
        const plannedDurationMinutes = measured
          ? Math.max(0, Number(block?.plannedDurationMinutes) || 0)
          : null
        const activeAllocationIds = new Set(
          (Array.isArray(block?.activeAllocationIds) ? block.activeAllocationIds : [])
            .map((value) => String(value ?? '').trim())
            .filter(Boolean),
        )
        const plannedStopTsValues = (Array.isArray(plan?.allocations) ? plan.allocations : [])
          .filter((allocation) => activeAllocationIds.has(String(allocation?.allocationId ?? '').trim()))
          .map((allocation) => new Date(String(allocation?.plannedEndAt ?? '')).getTime())
          .filter((value) => Number.isFinite(value) && value > 0)
        const expectedStopTs = plannedStopTsValues.length
          ? Math.max(...plannedStopTsValues)
          : startTs > 0 && plannedDurationMinutes > 0
            ? startTs + plannedDurationMinutes * 60 * 1000
            : 0
        const planSummary = measured
          ? `${Math.round(Number(block.actualDurationMinutes) || 0)} z ${Math.round(Number(block.plannedDurationMinutes) || 0)} min planu`
          : 'Postęp czasowy nieokreślony · niepełny plan czasu'

        return {
          key: block.key,
          taskId: String(block?.taskId ?? '').trim(),
          clientId: String(block?.clientId ?? '').trim(),
          serviceBlockId: String(block?.serviceBlockId ?? '').trim(),
          title: dashboardServiceExecutionTitle(block),
          clientLabel,
          progress: measured ? Number(block.progressPercent) : null,
          measured,
          isPlanUsed,
          note: measured && isPlanUsed
            ? `${planSummary} · CLEAN nadal otwarty`
            : planSummary,
          workerNames: dashboardServiceExecutionWorkerNames(block, plan),
          startTs,
          startIso: startTs > 0 ? new Date(startTs).toISOString() : '',
          plannedDurationMinutes,
          actualDurationMinutes: Math.max(0, Number(block?.actualDurationMinutes) || 0),
          expectedStopTs,
          expectedStopIso: expectedStopTs > 0 ? new Date(expectedStopTs).toISOString() : '',
          eventIds: openEvents
            .map((event) => String(event?.eventId ?? '').trim())
            .filter(Boolean),
          planned: true,
          completionConfirmed: false,
        }
      })
      .sort((left, right) => left.startTs - right.startTs || left.title.localeCompare(right.title, 'pl', { sensitivity: 'base' }))
  }

  function dashboardBuildStrictCompletedServiceItems(model = {}, plannedBlocks = []) {
    return (Array.isArray(model?.completed) ? model.completed : [])
      .map((block) => {
        const plan = dashboardServiceExecutionPlanForBlock(plannedBlocks, block)
        const events = Array.isArray(block?.events) ? block.events : []
        const startTsValues = events
          .map((event) => new Date(String(event?.startAt ?? '')).getTime())
          .filter((value) => Number.isFinite(value) && value > 0)
        const stopTsValues = events
          .map((event) => new Date(String(event?.endAt ?? '')).getTime())
          .filter((value) => Number.isFinite(value) && value > 0)
        const startTs = startTsValues.length ? Math.min(...startTsValues) : 0
        const stopTs = stopTsValues.length ? Math.max(...stopTsValues) : 0
        return {
          key: block.key,
          taskId: String(block?.taskId ?? '').trim(),
          clientId: String(block?.clientId ?? '').trim(),
          serviceBlockId: String(block?.serviceBlockId ?? '').trim(),
          title: dashboardServiceExecutionTitle(block),
          clientLabel: String(block?.clientLabel ?? '').trim(),
          startTs,
          stopTs,
          stopIso: stopTs > 0 ? new Date(stopTs).toISOString() : '',
          workerNames: dashboardServiceExecutionWorkerNames(block, plan),
          actualDurationMinutes: startTs > 0 && stopTs >= startTs
            ? Math.max(0, Math.round(((stopTs - startTs) / 60000) * 10) / 10)
            : 0,
          eventCount: events.length,
          eventIds: events
            .map((event) => String(event?.eventId ?? '').trim())
            .filter(Boolean),
          planned: true,
          completionConfirmed: true,
        }
      })
      .filter((item) => item.startTs > 0 && item.stopTs >= item.startTs)
      .sort((left, right) => right.stopTs - left.stopTs || left.title.localeCompare(right.title, 'pl', { sensitivity: 'base' }))
  }

  function dashboardBuildObservedServiceOperationItems(
    events = [],
    strictActive = [],
    strictCompleted = [],
    dayKey = todayYmd(),
    nowTs = Date.now(),
  ) {
    const consumedEventIds = [...strictActive, ...strictCompleted]
      .flatMap((item) => Array.isArray(item?.eventIds) ? item.eventIds : [])
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)
    const candidates = buildObservedServiceOperationCandidates({
      events,
      consumedEventIds,
      dayYmd: dayKey,
    })

    const toVisibleItem = (candidate = {}) => {
      const row = candidate?.sourceEvent ?? {}
      const workerName = dashboardResolveWorkerLabel(row)
      const clientLabel =
        dashboardActivityCleanCompanyLabel(dashboardActivityCompanyLabel(row)) ||
        'Obiekt nierozpoznany'
      const hasPlanReference = Boolean(
        String(row?.taskId ?? row?.task_id ?? '').trim() ||
        String(row?.serviceBlockId ?? row?.service_block_id ?? '').trim() ||
        String(row?.allocationId ?? row?.allocation_id ?? '').trim() ||
        String(row?.workSlotKey ?? row?.work_slot_key ?? '').trim(),
      )
      const startTs = Math.max(0, Number(candidate?.startTs) || 0)
      const stopTs = Math.max(0, Number(candidate?.stopTs) || 0)
      const isCompleted = candidate?.operationState === SERVICE_OPERATION_STATE.COMPLETED
      const durationMinutes = startTs > 0
        ? Math.max(0, Math.round((((isCompleted ? stopTs : nowTs) - startTs) / 60000) * 10) / 10)
        : 0

      return {
        key: candidate.key,
        eventIds: candidate.eventIds,
        taskId: '',
        clientId: String(row?.clientId ?? row?.client_id ?? '').trim(),
        serviceBlockId: '',
        title: hasPlanReference
          ? 'Plan wymaga weryfikacji'
          : 'Praca bez zaplanowanego zadania',
        clientLabel,
        progress: null,
        measured: false,
        isPlanUsed: false,
        note: isCompleted
          ? hasPlanReference
            ? 'Zakończono · powiązanie z planem wymaga weryfikacji'
            : 'Zakończono bez zaplanowanego zadania'
          : hasPlanReference
            ? 'Brak potwierdzonej godziny końca'
            : 'Brak planowanej godziny końca',
        workerNames: [workerName].filter(Boolean),
        startTs,
        startIso: startTs > 0 ? new Date(startTs).toISOString() : '',
        stopTs,
        stopIso: stopTs > 0 ? new Date(stopTs).toISOString() : '',
        actualDurationMinutes: durationMinutes,
        expectedStopTs: 0,
        expectedStopIso: '',
        planned: false,
        planningState: hasPlanReference ? 'unverified' : 'unplanned',
        completionConfirmed: false,
      }
    }

    return {
      active: candidates.active.map(toVisibleItem),
      completed: candidates.completed.map(toVisibleItem),
    }
  }

  function dashboardObservedWorkdayIsShadowed(candidate = {}, specificItems = []) {
    const workerName = normalizeSearchText(candidate?.workerName)
    if (!workerName) {
      return false
    }

    return (Array.isArray(specificItems) ? specificItems : []).some((item) => {
      const sameWorker = (Array.isArray(item?.workerNames) ? item.workerNames : [])
        .some((name) => normalizeSearchText(name) === workerName)
      if (!sameWorker) {
        return false
      }

      const candidateStart = Number(candidate?.startTs ?? 0)
      const candidateStop = candidate?.operationState === SERVICE_OPERATION_STATE.ACTIVE
        ? Number.POSITIVE_INFINITY
        : Number(candidate?.stopTs ?? 0)
      const itemStart = Number(item?.startTs ?? 0)
      const itemStop = Number(item?.stopTs ?? 0) > 0
        ? Number(item.stopTs)
        : Number.POSITIVE_INFINITY
      return candidateStart <= itemStop && itemStart <= candidateStop
    })
  }

  function dashboardBuildObservedWorkdayOperationItems(
    workdayItems = [],
    plannedItems = [],
    specificActive = [],
    specificCompleted = [],
    dayKey = todayYmd(),
    nowTs = Date.now(),
  ) {
    const candidates = buildObservedWorkdayOperationCandidates({
      workdays: workdayItems,
      dayYmd: dayKey,
    })

    const toVisibleItem = (candidate = {}) => {
      const isCompleted = candidate?.operationState === SERVICE_OPERATION_STATE.COMPLETED
      const plan = matchObservedWorkdayToPlan(candidate, plannedItems)
      const startTs = Math.max(0, Number(candidate?.startTs) || 0)
      const stopTs = Math.max(0, Number(candidate?.stopTs) || 0)
      const actualStopTs = isCompleted ? stopTs : nowTs
      const actualDurationMinutes = startTs > 0
        ? Math.max(0, Math.round((((actualStopTs - startTs) / 60000) * 10)) / 10)
        : 0
      const plannedStartTs = Math.max(0, Number(plan?.startTs) || 0)
      const plannedStopTs = Math.max(0, Number(plan?.stopTs) || 0)
      const plannedDurationMinutes = plannedStopTs > plannedStartTs
        ? Math.max(0, Math.round(((plannedStopTs - plannedStartTs) / 60000) * 10) / 10)
        : 0
      const measured = !isCompleted && Boolean(plan && plannedDurationMinutes > 0)
      const progress = measured
        ? Math.max(0, Math.min(100, Math.round((actualDurationMinutes / plannedDurationMinutes) * 100)))
        : null
      const planTitle = String(
        plan?.serviceBlockLabel ??
          plan?.label ??
          plan?.taskLabel ??
          '',
      ).trim()
      const clientLabel = String(candidate?.clientLabel ?? '').trim()
      const hasRecognizedObject = Boolean(clientLabel)

      return {
        key: candidate.key,
        workdayId: String(candidate?.workdayId ?? '').trim(),
        eventIds: [],
        taskId: String(plan?.taskId ?? '').trim(),
        clientId: String(candidate?.clientId ?? '').trim(),
        serviceBlockId: String(plan?.serviceBlockId ?? '').trim(),
        title: plan
          ? planTitle || 'Praca według zaplanowanego zadania'
          : !hasRecognizedObject
            ? 'Nie rozpoznano obiektu rozpoczęcia'
          : isCompleted
            ? 'Zakończona praca bez zaplanowanego zadania'
            : 'Praca bez zaplanowanego zadania',
        clientLabel: clientLabel || 'Obiekt nierozpoznany',
        progress,
        measured,
        isPlanUsed: measured && progress >= 100,
        note: isCompleted
          ? plan
            ? 'Zakończono obecność · ukończenie zadania wymaga potwierdzenia CLEAN'
            : !hasRecognizedObject
              ? 'Zakończono dzień · obiekt START wymaga uzupełnienia'
            : 'Zakończono pracę bez zaplanowanego zadania'
          : plan
            ? `${Math.round(actualDurationMinutes)} z ${Math.round(plannedDurationMinutes)} min planu`
            : !hasRecognizedObject
              ? 'Praca trwa · nie udało się rozpoznać obiektu ze START'
            : 'Praca na obiekcie bez zaplanowanej godziny końca',
        workerNames: [String(candidate?.workerName ?? '').trim()].filter(Boolean),
        startTs,
        startIso: startTs > 0 ? new Date(startTs).toISOString() : '',
        stopTs,
        stopIso: stopTs > 0 ? new Date(stopTs).toISOString() : '',
        plannedDurationMinutes: plan ? plannedDurationMinutes : null,
        actualDurationMinutes,
        expectedStopTs: measured ? plannedStopTs : 0,
        expectedStopIso: measured ? new Date(plannedStopTs).toISOString() : '',
        planned: Boolean(plan),
        planningState: plan ? 'matched' : 'unplanned',
        completionConfirmed: false,
        operationKind: 'workday',
      }
    }

    return {
      active: candidates.active
        .filter((candidate) => !dashboardObservedWorkdayIsShadowed(candidate, specificActive))
        .map(toVisibleItem),
      completed: candidates.completed
        .filter((candidate) => !dashboardObservedWorkdayIsShadowed(candidate, specificCompleted))
        .map(toVisibleItem),
    }
  }

  function dashboardBuildOperationalServicePanels(dayKey = todayYmd(), nowTs = Date.now()) {
    const orgId = String(appState.session?.orgId ?? '').trim()
    if (!orgId) {
      return {
        active: [],
        completed: [],
        confirmedCompleted: [],
        correlation: {
          modelVersion: DASHBOARD_SERVICE_EXECUTION_MODEL_VERSION,
          exceptionCount: 0,
          unavailable: true,
          message: 'Brak kontekstu organizacji. Korelacja wykonania jest niedostępna.',
        },
      }
    }
    if (appState.dashboardOverviewPlannedOrdersError === true) {
      return {
        active: [],
        completed: [],
        confirmedCompleted: [],
        correlation: {
          modelVersion: DASHBOARD_SERVICE_EXECUTION_MODEL_VERSION,
          exceptionCount: 0,
          unavailable: true,
          message: 'Nie udało się odczytać planu. Korelacja wykonania została wstrzymana.',
        },
      }
    }

    try {
      const rangeStart = new Date(`${dayKey}T00:00:00`).getTime()
      const rangeEnd = new Date(`${calendarAddDays(dayKey, 1)}T00:00:00`).getTime() - 1
      const plannedItems = dashboardBuildPlannedOrderActivityItems(
        dayKey,
        rangeStart,
        rangeEnd,
        { includeCompleted: true, includeAllAllocations: true },
      )
      const plannedBlocks = dashboardBuildServiceExecutionPlannedBlocks(plannedItems)
      const eventRows = dashboardPersistedServiceEventRows(appState.dashboardScheduleSourceRows, orgId)
      const model = buildServiceExecutionModel({
        orgId,
        dayYmd: dayKey,
        plannedBlocks,
        events: eventRows,
        now: nowTs,
        requireWorkSlotKey: true,
      })
      const eventExceptionCount = model.exceptions.filter((item) => item?.source === 'event').length
      const planExceptionCount = model.exceptions.filter((item) => item?.source === 'plan').length
      const strictActive = dashboardBuildStrictServiceProgressItems(model, plannedBlocks)
      const strictCompleted = dashboardBuildStrictCompletedServiceItems(model, plannedBlocks)
      const observed = dashboardBuildObservedServiceOperationItems(
        eventRows,
        strictActive,
        strictCompleted,
        dayKey,
        nowTs,
      )
      const workdayRows = dashboardActivityRowsForDay(
        appState.dashboardActivityWorkdayRows,
        dayKey,
      )
      const workdayItems = dashboardBuildWorkdayActivityItems(
        workdayRows,
        dayKey,
        rangeStart,
        rangeEnd,
        nowTs,
        appState.dashboardScheduleSourceRows,
      )
      const observedWorkdays = dashboardBuildObservedWorkdayOperationItems(
        workdayItems,
        plannedItems,
        [...strictActive, ...observed.active],
        [...strictCompleted, ...observed.completed],
        dayKey,
        nowTs,
      )
      const workerDayDurationIndex = buildWorkerDayDurationIndex({
        workdays: workdayItems,
        nowTs,
      })
      const withWorkerDayDuration = (items = []) => (
        (Array.isArray(items) ? items : []).map((item) => {
          const workerNames = (Array.isArray(item?.workerNames) ? item.workerNames : [])
            .map((workerName) => String(workerName ?? '').trim())
            .filter(Boolean)
          const uniqueWorkerNames = [...new Set(workerNames.map((workerName) => workerName.toLowerCase()))]
          if (uniqueWorkerNames.length !== 1) {
            return {
              ...item,
              todayDurationSeconds: null,
            }
          }
          const dayDuration = workerDayDurationIndex[uniqueWorkerNames[0]]
          return {
            ...item,
            todayDurationSeconds:
              dayDuration && dayDuration.ambiguous !== true && Number.isFinite(dayDuration.seconds)
                ? Math.max(0, Number(dayDuration.seconds))
                : null,
          }
        })
      )

      return {
        active: withWorkerDayDuration([
          ...strictActive,
          ...observed.active,
          ...observedWorkdays.active,
        ]),
        completed: withWorkerDayDuration([
          ...strictCompleted,
          ...observed.completed,
          ...observedWorkdays.completed,
        ]),
        confirmedCompleted: withWorkerDayDuration(strictCompleted),
        correlation: {
          modelVersion: DASHBOARD_SERVICE_EXECUTION_MODEL_VERSION,
          exceptionCount: model.exceptions.length,
          eventExceptionCount,
          planExceptionCount,
          unavailable: false,
          message: '',
        },
      }
    } catch (error) {
      console.warn('[portal/dashboard] strict service execution model failed', error)
      return {
        active: [],
        completed: [],
        confirmedCompleted: [],
        correlation: {
          modelVersion: DASHBOARD_SERVICE_EXECUTION_MODEL_VERSION,
          exceptionCount: 0,
          unavailable: true,
          message: 'Nie udało się zbudować bezpiecznej korelacji planu z wykonaniem.',
        },
      }
    }
  }

  function dashboardSetOperationalListContent(list, signature, html) {
    if (!list || list.dataset.renderSignature === signature) {
      return
    }
    const scrollTop = list.scrollTop
    list.innerHTML = html
    list.dataset.renderSignature = signature
    list.scrollTop = scrollTop
  }

  function dashboardMountCommandCenterPanels() {
    const commandCenter = document.getElementById('dashCommandCenter')
    if (!(commandCenter instanceof HTMLElement)) {
      return
    }

    ;[
      ['dashActiveWorkersPanelBody', 'dashCommandMapHost'],
      ['dashServiceProgressPanelBody', 'dashCommandOperationsHost'],
      ['dashConfirmedTasksPanelBody', 'dashCommandCompletedHost'],
    ].forEach(([bodyId, hostId]) => {
      const body = document.getElementById(bodyId)
      const host = document.getElementById(hostId)
      if (body instanceof HTMLElement && host instanceof HTMLElement && body.parentElement !== host) {
        body.hidden = false
        host.appendChild(body)
      }
    })

    const dateNode = document.getElementById('dashCommandCenterDate')
    if (dateNode) {
      const now = new Date()
      dateNode.textContent = `Dane aktualne · ${pad2(now.getHours())}:${pad2(now.getMinutes())}`
    }

    Object.keys(DASHBOARD_INSIGHT_PANEL_CONFIG).forEach((panelKey) => {
      dashboardSetInsightPanelCollapsed(panelKey, false, { persist: false })
    })
  }

  function dashboardCommandMapFilterIsEnabled(status = '') {
    const normalizedStatus = dashboardActiveWorkerMapStatus(status)
    const checkbox = document.querySelector(`[data-command-map-filter="${normalizedStatus}"]`)
    return !(checkbox instanceof HTMLInputElement) || checkbox.checked
  }

  function dashboardApplyCommandCenterMapFilters() {
    document.querySelectorAll('#dashActiveWorkersLocationList .dash-active-workers-location').forEach((button) => {
      const status = ['active', 'planned', 'finished', 'late'].find((value) => button.classList.contains(`is-${value}`)) || 'active'
      const listItem = button.closest('li')
      if (listItem instanceof HTMLElement) {
        listItem.hidden = !dashboardCommandMapFilterIsEnabled(status)
      }
    })

    dashboardActiveWorkersMapMarkers.forEach((marker) => {
      const markerLocations = Array.isArray(marker?.__cleanziWorkerLocations)
        ? marker.__cleanziWorkerLocations
        : marker?.__cleanziWorkerLocation
          ? [marker.__cleanziWorkerLocation]
          : []
      const visible = markerLocations.some((location) =>
        dashboardCommandMapFilterIsEnabled(location?.workStatus),
      )
      if (dashboardActiveWorkersMapProvider === 'openstreetmap') {
        const element = marker?.getElement?.()
        if (element instanceof HTMLElement) {
          element.querySelectorAll('[data-dashboard-map-person]').forEach((person) => {
            const workerKey = String(person.getAttribute('data-dashboard-map-person') ?? '').trim()
            const location = markerLocations.find(
              (candidate) => String(candidate?.workerKey ?? '').trim() === workerKey,
            )
            const personVisible = location
              ? dashboardCommandMapFilterIsEnabled(location?.workStatus)
              : true
            person.hidden = !personVisible
            person.setAttribute('aria-hidden', personVisible ? 'false' : 'true')
          })
          const lateAlert = element.querySelector('.dash-command-map-object__alert')
          if (lateAlert instanceof HTMLElement) {
            lateAlert.hidden = !dashboardCommandMapFilterIsEnabled('late')
          }
          element.hidden = !visible
          element.setAttribute('aria-hidden', visible ? 'false' : 'true')
        }
        marker.setOpacity?.(visible ? 1 : 0)
        return
      }
      marker?.setVisible?.(visible)
    })
  }

  function dashboardCenterCommandMap() {
    const visibleMarkers = dashboardActiveWorkersMapMarkers.filter((marker) =>
      (Array.isArray(marker?.__cleanziWorkerLocations)
        ? marker.__cleanziWorkerLocations
        : marker?.__cleanziWorkerLocation
          ? [marker.__cleanziWorkerLocation]
          : []
      ).some((location) => dashboardCommandMapFilterIsEnabled(location?.workStatus)),
    )
    if (!dashboardActiveWorkersMapInstance || !visibleMarkers.length) {
      return
    }

    if (dashboardActiveWorkersMapProvider === 'openstreetmap') {
      const positions = visibleMarkers.map((marker) => marker?.getLatLng?.()).filter(Boolean)
      if (positions.length === 1) {
        dashboardActiveWorkersMapInstance.setView?.(positions[0], 14)
      } else if (positions.length > 1) {
        dashboardActiveWorkersMapInstance.fitBounds?.(positions, { maxZoom: 16, padding: [42, 42] })
      }
      dashboardActiveWorkersMapInstance.invalidateSize?.({ pan: false })
      return
    }

    const maps = window.google?.maps
    if (!maps?.LatLngBounds) {
      return
    }
    const bounds = new maps.LatLngBounds()
    visibleMarkers.forEach((marker) => {
      const position = marker?.getPosition?.()
      if (position) {
        bounds.extend(position)
      }
    })
    if (visibleMarkers.length === 1) {
      dashboardActiveWorkersMapInstance.setCenter?.(visibleMarkers[0].getPosition?.())
      dashboardActiveWorkersMapInstance.setZoom?.(14)
    } else {
      dashboardActiveWorkersMapInstance.fitBounds?.(bounds, 42)
    }
  }

  function dashboardSetCommandCenterListView(listView = false) {
    const commandCenter = document.getElementById('dashCommandCenter')
    const button = document.getElementById('dashCommandViewBtn')
    const nextListView = Boolean(listView)
    commandCenter?.classList.toggle('is-list-view', nextListView)
    if (button instanceof HTMLButtonElement) {
      button.setAttribute('aria-pressed', nextListView ? 'true' : 'false')
      button.setAttribute('aria-label', nextListView ? 'Pokaż widok mapy' : 'Pokaż widok listy')
      const label = button.querySelector('span')
      const icon = button.querySelector('i')
      if (label) {
        label.textContent = nextListView ? 'Mapa' : 'Widok'
      }
      if (icon) {
        icon.className = nextListView ? 'ph ph-map-trifold' : 'ph ph-squares-four'
      }
    }
    if (!nextListView) {
      dashboardResizeActiveWorkerMap()
    }
  }

  function dashboardSyncCommandCenterPlannedOrders() {
    const source = document.getElementById('dashOverviewPlannedOrdersStrip')
    const target = document.getElementById('dashCommandPlannedOrdersStrip')
    if (!(source instanceof HTMLElement) || !(target instanceof HTMLElement)) {
      return
    }
    target.innerHTML = source.innerHTML
    target.classList.toggle('is-empty', source.classList.contains('is-empty'))
    const sourceLabel = source.getAttribute('aria-label')
    if (sourceLabel) {
      target.setAttribute('aria-label', sourceLabel)
    }
  }

  function dashboardRenderCommandCenterPlan(
    plannedOrders = [],
    operationalServices = {},
    options = {},
  ) {
    const activeItems = Array.isArray(operationalServices?.active)
      ? operationalServices.active
      : []
    const completedItems = Array.isArray(operationalServices?.confirmedCompleted)
      ? operationalServices.confirmedCompleted
      : (Array.isArray(operationalServices?.completed) ? operationalServices.completed : [])
          .filter((item) => item?.completionConfirmed === true)
    const loadError = options?.loadError === true
    const model = buildCommandCenterPlanModel({
      plannedOrders: loadError ? [] : plannedOrders,
      activeOperations: activeItems,
      completedOperations: completedItems,
      nowTs: Date.now(),
      horizonMinutes: 60,
    })
    const setValue = (id, value) => {
      const node = document.getElementById(id)
      if (node) {
        node.textContent = String(value)
      }
    }
    const percentLabel = loadError || model.progressPercent === null
      ? '—%'
      : `${model.progressPercent}%`
    const percentValue = loadError || model.progressPercent === null
      ? 0
      : model.progressPercent

    setValue('dashCommandPlanPercent', percentLabel)
    setValue('dashCommandPlanCompleted', loadError ? '—' : model.completedCount)
    setValue('dashCommandPlanTotal', loadError ? '—' : model.totalCount)
    setValue('dashCommandPlanActive', loadError ? '—' : model.activeCount)
    setValue('dashCommandPlanWaiting', loadError ? '—' : model.waitingCount)
    setValue('dashCommandPlanCancelled', loadError ? '—' : model.cancelledCount)

    const ring = document.getElementById('dashCommandPlanRing')
    if (ring instanceof HTMLElement) {
      ring.style.setProperty('--dash-plan-progress', `${percentValue}%`)
      ring.setAttribute('aria-valuenow', String(percentValue))
      ring.setAttribute(
        'aria-valuetext',
        loadError
          ? 'Nie udało się wczytać planu dnia'
          : model.progressPercent === null
            ? 'Brak zaplanowanych zleceń'
            : `${model.progressPercent}% planu ukończone`,
      )
    }
    const progress = document.getElementById('dashCommandPlanProgress')
    if (progress instanceof HTMLElement) {
      progress.style.width = `${percentValue}%`
    }

    const upcomingList = document.getElementById('dashCommandUpcomingList')
    if (!(upcomingList instanceof HTMLElement)) {
      return model
    }
    if (loadError) {
      upcomingList.innerHTML = `<p>${escapeHtml(
        String(options?.unavailableMessage ?? '').trim() ||
          'Nie udało się wczytać planu na dziś.',
      )}</p>`
      return model
    }
    const upcomingPreview = model.upcoming.slice(0, 2)
    if (!upcomingPreview.length) {
      upcomingList.innerHTML = '<p>Brak zaplanowanych rozpoczęć w ciągu godziny.</p>'
      return model
    }
    upcomingList.innerHTML = upcomingPreview.map((item) => {
      const title =
        String(item?.title ?? '').trim() ||
        String(item?.companyLabel ?? '').trim() ||
        'Zaplanowane zlecenie'
      const workerNames = Array.isArray(item?.workerNames)
        ? item.workerNames.filter(Boolean).join(', ')
        : ''
      const companyLabel = String(item?.companyLabel ?? '').trim()
      const meta = workerNames || companyLabel || 'Przypisane zadanie'
      return `
        <button class="dash-command-upcoming__item" type="button" data-route="calendar">
          <time datetime="${escapeHtml(new Date(Number(item?.startTs) || 0).toISOString())}">
            ${escapeHtml(dashboardOverviewTimeLabel(item?.startTs))}
          </time>
          <span class="dash-command-upcoming__dot" aria-hidden="true"></span>
          <span class="dash-command-upcoming__copy">
            <strong>${escapeHtml(title)}</strong>
            <small>${escapeHtml(meta)}</small>
          </span>
          <span class="dash-command-upcoming__go">
            Przejdź
            <i class="ph ph-caret-right" aria-hidden="true"></i>
          </span>
        </button>
      `
    }).join('')
    return model
  }

  async function dashboardRefreshStopProposalAttention(orgId, options = {}) {
    const activeOrgId = String(orgId ?? appState.session?.orgId ?? '').trim()
    if (!activeOrgId) {
      dashboardStopProposalAttention = {
        orgId: '',
        pendingCount: 0,
        loadedAt: 0,
        request: null,
      }
      return 0
    }

    if (dashboardStopProposalAttention.orgId !== activeOrgId) {
      dashboardStopProposalAttention = {
        orgId: activeOrgId,
        pendingCount: 0,
        loadedAt: 0,
        request: null,
      }
    }

    const isFresh = dashboardStopProposalAttention.loadedAt > 0 && (
      Date.now() - dashboardStopProposalAttention.loadedAt < DASHBOARD_STOP_PROPOSAL_ATTENTION_CACHE_TTL_MS
    )
    if (options.forceRefresh !== true && isFresh) {
      return dashboardStopProposalAttention.pendingCount
    }
    if (dashboardStopProposalAttention.request) {
      return dashboardStopProposalAttention.request
    }

    dashboardStopProposalAttention.request = fetchWorkdayStopProposals(activeOrgId, {
      status: 'PENDING',
      limit: 1,
    })
      .then((payload) => {
        if (dashboardStopProposalAttention.orgId !== activeOrgId) {
          return dashboardStopProposalAttention.pendingCount
        }
        const total = Math.max(0, Math.trunc(Number(payload?.total) || 0))
        dashboardStopProposalAttention.pendingCount = total || (Array.isArray(payload?.proposals) ? payload.proposals.length : 0)
        dashboardStopProposalAttention.loadedAt = Date.now()
        return dashboardStopProposalAttention.pendingCount
      })
      .catch((error) => {
        console.warn('[portal/dashboard] stop proposal attention read failed', error)
        return dashboardStopProposalAttention.pendingCount
      })
      .finally(() => {
        if (dashboardStopProposalAttention.orgId === activeOrgId) {
          dashboardStopProposalAttention.request = null
        }
      })

    return dashboardStopProposalAttention.request
  }

  function dashboardRenderCommandCenterAlerts({
    values = {},
    operationalServices = {},
    locations = [],
    activeRows = [],
    pendingStopProposalCount = 0,
  } = {}) {
    const alerts = []
    const stopProposalAttentionAlert = buildDashboardStopProposalAttentionAlert(pendingStopProposalCount)
    if (stopProposalAttentionAlert) {
      alerts.push(stopProposalAttentionAlert)
    }
    const normalizedLocations = Array.isArray(locations) ? locations : []
    const lateLocations = normalizedLocations.filter((item) => item?.workStatus === 'late')
    if (lateLocations.length > 0) {
      const first = lateLocations[0] ?? {}
      const delayMinutes = Math.max(
        0,
        ...lateLocations.map((item) => Number(item?.delayMinutes) || 0),
      )
      alerts.push({
        tone: 'danger',
        icon: 'ph-timer',
        title: `Spóźniony START${delayMinutes > 0 ? ` ${delayMinutes} min` : ''}`,
        meta: [
          String(first?.plannedObjectLabel ?? first?.objectLabel ?? '').trim(),
          String(first?.workerName ?? '').trim(),
        ].filter(Boolean).join(' · ') || `${lateLocations.length} osób po czasie`,
        route: 'events',
      })
    }

    const activeOperations = Array.isArray(operationalServices?.active)
      ? operationalServices.active
      : []
    const unrecognizedOperations = activeOperations.filter((item) => {
      const label = normalizeSearchText(item?.clientLabel ?? item?.title)
      return !label || label.includes('obiekt nierozpoznany')
    })
    if (unrecognizedOperations.length > 0) {
      const first = unrecognizedOperations[0] ?? {}
      alerts.push({
        tone: 'warning',
        icon: 'ph-question',
        title: 'Obiekt nierozpoznany',
        meta: (
          Array.isArray(first?.workerNames) ? first.workerNames.join(', ') : ''
        ) || `${unrecognizedOperations.length} aktywna operacja`,
        route: 'events',
      })
    }

    const activeWorkerRows = (Array.isArray(activeRows) ? activeRows : [])
      .filter((row) => Boolean(row?.isRunning))
    const gpsWorkerKeys = new Set(
      normalizedLocations
        .filter((location) => location?.positionKind === 'gps' && location?.actualWorkStatus === 'active')
        .map((location) => String(location?.workerKey ?? '').trim())
        .filter(Boolean),
    )
    const missingGpsRows = activeWorkerRows.filter((row) => {
      const workerKey = dashboardActiveWorkerMapKey(row)
      return workerKey && !gpsWorkerKeys.has(workerKey)
    })
    if (missingGpsRows.length > 0) {
      alerts.push({
        tone: 'warning',
        icon: 'ph-map-pin-slash',
        title: `Brak GPS ${missingGpsRows.length} ${missingGpsRows.length === 1 ? 'osoba' : 'osoby'}`,
        meta: missingGpsRows.length === 1
          ? dashboardResolveWorkerLabel(missingGpsRows[0])
          : 'Aktywni pracownicy bez bieżącej lokalizacji',
        route: 'events',
      })
    }

    const correlation = operationalServices?.correlation ?? {}
    const exceptionCount = Math.max(0, Number(correlation?.exceptionCount) || 0)
    if (correlation?.unavailable === true || exceptionCount > 0) {
      alerts.push({
        tone: correlation?.unavailable === true ? 'danger' : 'warning',
        icon: 'ph-link-break',
        title: correlation?.unavailable === true
          ? 'Korelacja danych niedostępna'
          : `Do weryfikacji korelacji: ${exceptionCount}`,
        meta: String(correlation?.message ?? '').trim() || 'Plan i wykonanie wymagają sprawdzenia.',
        route: 'events',
      })
    }

    const openQrStopCount = Math.max(
      0,
      Number(values?.openQrStopDays ?? values?.openStartStopYesterday) || 0,
    )
    if (openQrStopCount > 0) {
      alerts.push({
        tone: 'warning',
        icon: 'ph-warning-circle',
        title: `Brak QR STOP: ${openQrStopCount}`,
        meta: 'Niezamknięte dni pracy sprzed dzisiaj',
        action: 'open-missing-qr-stop-list',
      })
    }

    const count = document.getElementById('dashCommandAlertsCount')
    if (count) {
      count.textContent = String(alerts.length)
      count.hidden = alerts.length === 0
    }
    const host = document.getElementById('dashCommandAlertsList')
    if (!(host instanceof HTMLElement)) {
      return alerts
    }
    if (!alerts.length) {
      host.innerHTML = '<p>Brak bieżących alertów operacyjnych.</p>'
      return alerts
    }
    host.innerHTML = alerts.slice(0, 3).map((alert) => {
      const route = String(alert?.route ?? '').trim()
      const metric = String(alert?.metric ?? '').trim()
      const action = String(alert?.action ?? '').trim()
      const routeAttribute = route ? ` data-route="${escapeHtml(route)}"` : ''
      const metricAttributes = metric
        ? ` data-dash-alert-metric="${escapeHtml(metric)}" aria-expanded="false" aria-haspopup="dialog"`
        : ''
      const actionAttribute = action ? ` data-dash-alert-action="${escapeHtml(action)}"` : ''
      return `
      <button class="dash-command-alert is-${escapeHtml(alert.tone)}" type="button"${routeAttribute}${metricAttributes}${actionAttribute}>
        <span class="dash-command-alert__icon"><i class="ph ${escapeHtml(alert.icon)}" aria-hidden="true"></i></span>
        <span class="dash-command-alert__copy">
          <strong>${escapeHtml(alert.title)}</strong>
          <small>${escapeHtml(alert.meta)}</small>
        </span>
        <span class="dash-command-alert__go">
          Przejdź
          <i class="ph ph-caret-right" aria-hidden="true"></i>
        </span>
      </button>
    `
    }).join('')
    return alerts
  }

  function dashboardSyncCommandCenterSummary(values = {}, operationalServices = {}) {
    const activeItems = Array.isArray(operationalServices?.active) ? operationalServices.active : []
    const completedItems = Array.isArray(operationalServices?.completed) ? operationalServices.completed : []
    const confirmedCompletedItems = Array.isArray(operationalServices?.confirmedCompleted)
      ? operationalServices.confirmedCompleted
      : completedItems.filter((item) => item?.completionConfirmed === true)
    const correlation = operationalServices?.correlation ?? {}
    const plannedOrders = Math.max(0, Number(values?.plannedOrders) || 0)
    const exceptionCount = Math.max(0, Number(correlation?.exceptionCount) || 0)
    const unavailable = correlation?.unavailable === true

    const setValue = (id, value) => {
      const node = document.getElementById(id)
      if (node) {
        node.textContent = String(value)
      }
    }
    setValue('dashCommandActiveWorkersCount', Math.max(0, Number(values?.activeNow) || 0))
    setValue('dashCommandOpenQrStopCount', Math.max(0, Number(values?.openQrStopDays ?? values?.openStartStopYesterday) || 0))
    setValue('dashCommandActiveObjectsCount', Math.max(0, Number(values?.activeObjects) || 0))
    setValue('dashCommandPlannedOrdersCount', plannedOrders)
    setValue('dashCommandLiveCount', `${activeItems.length} w toku`)
    setValue('dashCommandCompletedCount', `${completedItems.length} dzisiaj`)

    const qualityValue = document.getElementById('dashCommandQualityValue')
    const qualityMeta = document.getElementById('dashCommandQualityMeta')
    if (qualityValue && qualityMeta) {
      if (!unavailable && plannedOrders > 0) {
        const confirmedPercent = Math.min(100, Math.round((confirmedCompletedItems.length / plannedOrders) * 100))
        qualityValue.textContent = `${confirmedPercent}%`
        qualityMeta.textContent = `${confirmedCompletedItems.length} z ${plannedOrders} ukończonych`
      } else {
        qualityValue.textContent = '—%'
        qualityMeta.textContent = unavailable ? 'korelacja niedostępna' : 'brak bezpiecznego mianownika'
      }
    }

    const insight = document.querySelector('.dash-command-insight')
    const headline = document.getElementById('dashCommandInsightHeadline')
    const meta = document.getElementById('dashCommandInsightMeta')
    let tone = 'success'
    let headlineText = 'Dzień przebiega zgodnie z planem'
    let metaText = activeItems.length > 0
      ? `${activeItems.length} ${activeItems.length === 1 ? 'operacja jest' : 'operacje są'} teraz w realizacji.`
      : 'Brak krytycznych odchyleń w bezpiecznie skorelowanych danych.'

    if (unavailable) {
      tone = 'danger'
      headlineText = 'Nie można potwierdzić postępu'
      metaText = String(correlation?.message ?? '').trim() || 'Korelacja planu z wykonaniem jest chwilowo niedostępna.'
    } else if (exceptionCount > 0) {
      tone = 'warning'
      headlineText = 'Część danych wymaga weryfikacji'
      metaText = `${exceptionCount} ${exceptionCount === 1 ? 'wyjątek nie potwierdza' : 'wyjątki nie potwierdzają'} samodzielnie postępu.`
    } else if (!activeItems.length && completedItems.length > 0) {
      headlineText = 'Potwierdzone zadania zostały zakończone'
      metaText = `${completedItems.length} ${completedItems.length === 1 ? 'blok został zamknięty' : 'bloki zostały zamknięte'} dzisiaj.`
    }

    insight?.setAttribute('data-tone', tone)
    if (headline) headline.textContent = headlineText
    if (meta) meta.textContent = metaText
    dashboardSyncCommandCenterPlannedOrders()
  }

  function dashboardRenderServiceCorrelationStatus(correlation = {}) {
    const status = document.getElementById('dashServiceCorrelationStatus')
    if (!status) {
      return
    }

    const exceptionCount = Math.max(0, Number(correlation?.exceptionCount) || 0)
    const unavailable = correlation?.unavailable === true
    if (!unavailable && exceptionCount === 0) {
      status.hidden = true
      status.textContent = ''
      status.removeAttribute('data-tone')
      return
    }

    status.hidden = false
    status.setAttribute('data-tone', unavailable ? 'error' : 'warning')
    if (unavailable) {
      status.textContent = String(correlation?.message ?? '').trim() || 'Korelacja wykonania jest niedostępna.'
      return
    }

    const eventCount = Math.max(0, Number(correlation?.eventExceptionCount) || 0)
    const planCount = Math.max(0, Number(correlation?.planExceptionCount) || 0)
    const details = [
      eventCount > 0 ? `${eventCount} zdarzeń` : '',
      planCount > 0 ? `${planCount} pozycji planu` : '',
    ].filter(Boolean).join(' · ')
    status.textContent =
      `Do weryfikacji korelacji: ${exceptionCount}${details ? ` (${details})` : ''}. ` +
      'Wyjątki nie potwierdzają samodzielnie postępu ani ukończenia.'
  }

  function dashboardServiceOperationAvatarHtml(workerName = '') {
    const avatarKind = resolveOperationalMapAvatarKind({ workerName })
    return `
      <img
        src="/assets/avatars/default-${avatarKind}.webp"
        alt=""
        loading="lazy"
      />
    `
  }

  function dashboardServiceOperationWorkersHtml(workerNames = []) {
    const workers = Array.isArray(workerNames) ? workerNames.filter(Boolean) : []
    const visibleWorkers = workers.slice(0, 3)
    const overflowCount = Math.max(0, workers.length - visibleWorkers.length)
    return `
      <span class="dash-command-operation__avatars" aria-hidden="true">
        ${visibleWorkers.map((workerName) => `
          <span>${dashboardServiceOperationAvatarHtml(workerName)}</span>
        `).join('')}
        ${overflowCount > 0 ? `<span class="is-overflow">+${overflowCount}</span>` : ''}
      </span>
    `
  }

  function dashboardServiceOperationMarkup(item = {}, options = {}) {
    const isCompleted = item.operationState === SERVICE_OPERATION_STATE.COMPLETED
    const isPlanned = item.planned !== false
    const completionConfirmed = item.completionConfirmed === true
    const workers = Array.isArray(item.workerNames) && item.workerNames.length
      ? item.workerNames
      : ['Brak rozpoznanego pracownika']
    const workerLabel = workers.join(', ')
    const primaryLabel = String(item.clientLabel ?? '').trim() || String(item.title ?? '').trim() || 'Operacja'
    const startLabel = dashboardOverviewTimeLabel(item.startTs)
    const stopLabel = dashboardOverviewTimeLabel(item.stopTs)
    const expectedStopLabel = dashboardOverviewTimeLabel(item.expectedStopTs)
    const statusLabel = isCompleted ? 'Zakończone' : 'W toku'
    const startTs = Math.max(0, Number(item.startTs) || 0)
    const stopTs = Math.max(0, Number(item.stopTs) || 0)
    const actualStopTs = isCompleted ? stopTs : Date.now()
    const timestampDurationSeconds = startTs > 0 && actualStopTs >= startTs
      ? Math.max(0, Math.floor((actualStopTs - startTs) / 1000))
      : 0
    const declaredDurationSeconds = Math.max(
      0,
      Math.round((Number(item.actualDurationMinutes) || 0) * 60),
    )
    const operationDurationSeconds = timestampDurationSeconds || declaredDurationSeconds
    const operationDurationLabel = durationSecondsToHm(operationDurationSeconds)
    const hasTodayDuration = Number.isFinite(item.todayDurationSeconds)
    const todayDurationSeconds = hasTodayDuration
      ? Math.max(0, Math.floor(Number(item.todayDurationSeconds)))
      : 0
    const todayDurationLabel = hasTodayDuration
      ? durationSecondsToHm(todayDurationSeconds)
      : ''
    const progress = isCompleted
      ? completionConfirmed
        ? 100
        : null
      : item.measured
        ? Math.max(0, Math.min(100, Math.round(Number(item.progress) || 0)))
        : null
    const timeLabel = isCompleted
      ? hasTodayDuration
        ? `Dzisiaj ${todayDurationLabel}`
        : `Czas ${operationDurationLabel}`
      : `Pracuje ${operationDurationLabel}`
    const timelineParts = []
    if (startTs > 0) {
      timelineParts.push(`START ${startLabel}`)
    }
    if (isCompleted && stopTs >= startTs && stopTs > 0) {
      timelineParts.push(`STOP ${stopLabel}`)
      timelineParts.push(`czas ${operationDurationLabel}`)
      if (hasTodayDuration && todayDurationSeconds !== operationDurationSeconds) {
        timelineParts.push(`łącznie dziś ${todayDurationLabel}`)
      }
    } else {
      if (item.expectedStopTs > 0) {
        timelineParts.push(`plan do ${expectedStopLabel}`)
      }
      if (hasTodayDuration) {
        timelineParts.push(`łącznie dziś ${todayDurationLabel}`)
      }
    }
    const stateDetail = timelineParts.join(' · ') || String(item.note ?? '').trim()
    const progressMarkup = isCompleted && progress == null
      ? `
        <div
          class="dash-command-operation__progress is-complete"
          aria-label="${escapeHtml(
            isPlanned
              ? `Operacja ${primaryLabel} została zakończona, ale zakończenie obecności nie potwierdza ukończenia zadania.`
              : `Operacja ${primaryLabel} została zakończona. Nie wyliczono procentu bez planu.`,
          )}"
        >
          <span></span>
        </div>
      `
      : progress == null
      ? `
        <div
          class="dash-command-operation__progress is-indeterminate"
          aria-label="${escapeHtml(`Operacja ${primaryLabel} trwa. Brak pełnego planu czasu.`)}"
        >
          <span></span>
        </div>
      `
      : `
        <div
          class="dash-command-operation__progress"
          role="progressbar"
          aria-label="${escapeHtml(`Postęp operacji ${primaryLabel}`)}"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow="${progress}"
        >
          <span style="width:${progress}%"></span>
        </div>
      `
    const taskId = String(item.taskId ?? '').trim()
    const interactiveAttributes = taskId
      ? `data-dashboard-operation-task-id="${escapeHtml(taskId)}" aria-label="${escapeHtml(`Otwórz zadanie: ${primaryLabel}`)}"`
      : 'aria-label="Szczegóły operacji niedostępne"'
    const compactClass = options?.full ? ' is-full' : ''

    return `
      <li class="dash-command-operation is-${isCompleted ? 'completed' : 'active'}${compactClass}">
        <button class="dash-command-operation__button" type="button" ${interactiveAttributes}${taskId ? '' : ' disabled'}>
          <span class="dash-command-operation__main">
            ${dashboardServiceOperationWorkersHtml(workers)}
            <span class="dash-command-operation__copy">
              <strong>${escapeHtml(workerLabel)}</strong>
              <small>${escapeHtml(primaryLabel)}</small>
            </span>
          </span>
          <span class="dash-command-operation__result">
            <strong>${escapeHtml(progress == null ? statusLabel : `${progress}%`)}</strong>
            <time datetime="${escapeHtml(isCompleted ? item.stopIso : item.startIso)}">${escapeHtml(timeLabel)}</time>
          </span>
          <span class="dash-command-operation__timeline">
            <span class="dash-command-operation__timing">${escapeHtml(stateDetail)}</span>
          </span>
          ${progressMarkup}
        </button>
      </li>
    `
  }

  function dashboardRenderServiceOperationStream(activeItems = [], completedItems = []) {
    const stream = buildServiceOperationStream({
      active: activeItems,
      completed: completedItems,
    })
    const previewItems = serviceOperationPreview(stream, DASHBOARD_SERVICE_OPERATIONS_PREVIEW_LIMIT)
    const list = document.getElementById('dashServiceProgressList')
    const allList = document.getElementById('dashCommandAllOperationsList')
    const allButton = document.getElementById('dashCommandAllOperations')
    const allCount = document.getElementById('dashCommandOperationsDialogCount')
    dashboardServiceOperationStream = stream

    if (allButton instanceof HTMLButtonElement) {
      allButton.hidden = stream.length <= previewItems.length
      allButton.textContent = ''
      allButton.insertAdjacentHTML(
        'beforeend',
        `Zobacz wszystkie operacje (${stream.length}) <i class="ph ph-arrow-right" aria-hidden="true"></i>`,
      )
    }
    if (allCount) {
      allCount.textContent = `${stream.length} ${stream.length === 1 ? 'operacja' : 'operacji'}`
    }

    const activeClockMinute = stream.some(
      (item) => item.operationState === SERVICE_OPERATION_STATE.ACTIVE,
    )
      ? Math.floor(Date.now() / 60000)
      : 0
    const signature = JSON.stringify({
      activeClockMinute,
      items: stream.map((item) => [
        item.key,
        item.operationState,
        item.occurredAtTs,
        item.startTs,
        item.stopTs,
        item.progress,
        item.workerNames,
        item.todayDurationSeconds,
      ]),
    })
    const emptyMarkup = '<li class="dash-operational-empty">Brak rozpoczętych i zakończonych operacji dzisiaj.</li>'
    dashboardSetOperationalListContent(
      list,
      `preview:${signature}`,
      previewItems.length
        ? previewItems.map((item) => dashboardServiceOperationMarkup(item)).join('')
        : emptyMarkup,
    )
    dashboardSetOperationalListContent(
      allList,
      `all:${signature}`,
      stream.length
        ? stream.map((item) => dashboardServiceOperationMarkup(item, { full: true })).join('')
        : emptyMarkup,
    )
  }

  function dashboardRenderServiceProgress(items = [], correlation = {}, completedItems = []) {
    const activeItems = Array.isArray(items) ? items : []
    const finishedItems = Array.isArray(completedItems) ? completedItems : []
    const count = document.getElementById('dashServiceProgressCount')
    const commandCount = document.getElementById('dashCommandLiveCount')
    const highlightedItem = activeItems
      .slice()
      .sort((left, right) =>
        Number(right?.measured === true) - Number(left?.measured === true) ||
        Number(right?.progress ?? 0) - Number(left?.progress ?? 0),
      )[0]
    const correlationCount = Math.max(0, Number(correlation?.exceptionCount) || 0)
    const correlationMeta = correlation?.unavailable === true
      ? ' · korelacja niedostępna'
      : correlationCount
        ? ` · do weryfikacji: ${correlationCount}`
        : ''
    if (count) {
      count.textContent = `${activeItems.length} w toku`
    }
    if (commandCount) {
      commandCount.textContent = finishedItems.length
        ? `${activeItems.length} w toku · ${finishedItems.length} zakończone`
        : `${activeItems.length} w toku`
    }
    dashboardSetInsightPanelCompactCopy(
      'progress',
      highlightedItem
        ? `${String(highlightedItem.title ?? 'Usługa').trim() || 'Usługa'} · ${
            highlightedItem.measured ? `${Number(highlightedItem.progress)}%` : 'stan nieokreślony'
          }`
        : 'Brak usług realizowanych teraz',
      highlightedItem
        ? `W toku: ${activeItems.length} · ${highlightedItem.measured ? 'postęp według planu' : 'niepełny plan czasu'}${
            correlationMeta
          }`
        : `W toku: 0${correlationMeta}`,
    )
    dashboardRenderServiceOperationStream(activeItems, finishedItems)
  }

  function dashboardRenderCompletedServices(items = [], correlation = {}) {
    const completedItems = Array.isArray(items) ? items : []
    const count = document.getElementById('dashConfirmedTasksCount')
    const commandCount = document.getElementById('dashCommandCompletedCount')
    const list = document.getElementById('dashConfirmedTasksList')
    const latestItem = completedItems[0] ?? null
    const correlationCount = Math.max(0, Number(correlation?.exceptionCount) || 0)
    const correlationMeta = correlation?.unavailable === true
      ? ' · korelacja niedostępna'
      : correlationCount
        ? ` · do weryfikacji: ${correlationCount}`
        : ''
    if (count) {
      count.textContent = `${completedItems.length} dzisiaj`
    }
    if (commandCount) {
      commandCount.textContent = `${completedItems.length} dzisiaj`
    }
    dashboardSetInsightPanelCompactCopy(
      'completed',
      latestItem
        ? String(latestItem.title ?? 'Obiekt').trim() || 'Obiekt'
        : 'Brak ukończonych zadań dzisiaj',
      latestItem
        ? `Potwierdzone bloki: ${completedItems.length} · ostatnie zakończenie ${dashboardOverviewTimeLabel(latestItem.stopTs)}`
        : `Potwierdzone bloki: 0${correlationMeta}`,
    )
    if (!list) {
      return
    }
    const signature = JSON.stringify(completedItems.map((item) => [
      item.key,
      item.startTs,
      item.stopTs,
      item.workerNames,
      item.eventCount,
    ]))
    if (!completedItems.length) {
      dashboardSetOperationalListContent(
        list,
        signature,
        correlation?.unavailable === true || Number(correlation?.exceptionCount) > 0
          ? '<li class="dash-operational-empty">Brak bloków potwierdzonych bezpieczną korelacją jako ukończone dzisiaj.</li>'
          : '<li class="dash-operational-empty">Brak zakończonych sprzątań dzisiaj.</li>',
      )
      return
    }

    const html = completedItems.map((item) => {
      const startLabel = dashboardOverviewTimeLabel(item.startTs)
      const stopLabel = dashboardOverviewTimeLabel(item.stopTs)
      const workers = item.workerNames.length ? item.workerNames.join(', ') : 'Brak rozpoznanego pracownika'
      const workerAndClient = [item.clientLabel, workers].filter(Boolean).join(' · ')
      return `
        <li class="dash-completed-task-item">
          <div class="dash-completed-task-head">
            <strong>${escapeHtml(item.title)}</strong>
            <time class="dash-completed-task-time" datetime="${escapeHtml(item.stopIso)}">${escapeHtml(stopLabel)}</time>
          </div>
          <span class="dash-completed-task-status">Potwierdzono wszystkie przydziały bloku</span>
          <p class="dash-completed-task-meta">${escapeHtml(`${startLabel}–${stopLabel} · ${workerAndClient || workers}`)}</p>
        </li>
      `
    }).join('')
    dashboardSetOperationalListContent(list, signature, html)
  }

  function dashboardRenderOperationalServicePanels(panels = null) {
    const source = panels?.correlation?.modelVersion === DASHBOARD_SERVICE_EXECUTION_MODEL_VERSION
      ? panels
      : dashboardBuildOperationalServicePanels(todayYmd())
    dashboardRenderServiceCorrelationStatus(source?.correlation ?? {})
    dashboardRenderServiceProgress(
      source?.active ?? [],
      source?.correlation ?? {},
      source?.completed ?? [],
    )
    dashboardRenderCompletedServices(
      source?.confirmedCompleted ?? (source?.completed ?? []).filter((item) => item?.completionConfirmed === true),
      source?.correlation ?? {},
    )
  }

  function dashboardOverviewActiveObjectGroups(rows = appState.dashboardActivityWorkdayRows) {
    const today = todayYmd()
    const rangeStart = new Date(`${today}T00:00:00`).getTime()
    const rangeEnd = new Date(`${calendarAddDays(today, 1)}T00:00:00`).getTime() - 1
    const workdayItems = dashboardBuildWorkdayActivityItems(
      rows,
      today,
      rangeStart,
      rangeEnd,
      Date.now(),
      appState.dashboardScheduleSourceRows,
    )
    const groups = new Map()
    const preferredRepresentative = (current, candidate) => {
      if (!current) return candidate
      if (!candidate) return current
      if (candidate?.isRunning && !current?.isRunning) return candidate
      if (!candidate?.isRunning && !current?.isRunning && Number(candidate?.stopTs ?? 0) > Number(current?.stopTs ?? 0)) {
        return candidate
      }
      return current
    }

    workdayItems.forEach((item) => {
      const clientId = String(item?.clientId ?? '').trim()
      const clientLabel = dashboardActivityCleanCompanyLabel(item?.companyLabel ?? item?.locationLabel)
      const normalizedLabel = normalizeSearchText(clientLabel)
      const key = clientId ? `id:${normalizeSearchText(clientId)}` : normalizedLabel ? `label:${normalizedLabel}` : ''
      if (!key) {
        return
      }

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          clientId,
          clientLabel: clientLabel || 'Obiekt',
          normalizedLabel,
          items: [],
          workerNames: new Set(),
          representative: null,
        })
      }

      const group = groups.get(key)
      if (clientId) {
        group.clientId = group.clientId || clientId
      }
      if (clientLabel && group.clientLabel === 'Obiekt') {
        group.clientLabel = clientLabel
      }
      group.items.push(item)
      const workerName = String(item?.workerDisplayName ?? item?.workerName ?? '').trim()
      if (workerName && workerName !== '-') {
        group.workerNames.add(workerName)
      }

      group.representative = preferredRepresentative(group.representative, item)
    })

    const labelToIdKeys = new Map()
    groups.forEach((group, key) => {
      if (!String(key).startsWith('id:') || !group?.normalizedLabel) {
        return
      }
      if (!labelToIdKeys.has(group.normalizedLabel)) {
        labelToIdKeys.set(group.normalizedLabel, new Set())
      }
      labelToIdKeys.get(group.normalizedLabel).add(key)
    })
    ;[...groups.entries()].forEach(([key, group]) => {
      if (!String(key).startsWith('label:') || !group?.normalizedLabel) {
        return
      }
      const candidateKeys = labelToIdKeys.get(group.normalizedLabel)
      if (!(candidateKeys instanceof Set) || candidateKeys.size !== 1) {
        return
      }
      const [targetKey] = candidateKeys
      const target = groups.get(targetKey)
      if (!target) {
        return
      }
      target.items.push(...group.items)
      group.workerNames.forEach((workerName) => target.workerNames.add(workerName))
      target.representative = preferredRepresentative(target.representative, group.representative)
      if (target.clientLabel === 'Obiekt' && group.clientLabel) {
        target.clientLabel = group.clientLabel
      }
      groups.delete(key)
    })

    return [...groups.values()].map((group) => ({
      ...group,
      workerNames: [...group.workerNames],
    }))
  }

  function dashboardOverviewActiveObjectDetails(groups = [], dayKey = todayYmd()) {
    return (Array.isArray(groups) ? groups : []).map((group) => {
      const items = Array.isArray(group?.items) ? group.items : []
      const representative = group?.representative ?? items[0] ?? {}
      const runningItems = items.filter((item) => Boolean(item?.isRunning))
      const isRunning = runningItems.length > 0
      const timeItems = isRunning ? runningItems : representative ? [representative] : items
      const startTsValues = timeItems.map((item) => Number(item?.startTs) || 0).filter((value) => value > 0)
      const stopTsValues = timeItems.map((item) => Number(item?.stopTs) || 0).filter((value) => value > 0)
      const startLabel = startTsValues.length ? dashboardOverviewTimeLabel(Math.min(...startTsValues)) : '--:--'
      const stopLabel = stopTsValues.length ? dashboardOverviewTimeLabel(Math.max(...stopTsValues)) : '--:--'
      const workerItems = isRunning ? runningItems : items
      const workers = [...new Set(workerItems.map((item) => String(item?.workerDisplayName ?? item?.workerName ?? '').trim()).filter((value) => value && value !== '-'))]
      const workerLabel = workers.length ? `Pracownicy: ${workers.join(', ')}` : 'Brak rozpoznanego pracownika'
      const statusLabel = isRunning ? 'Sprzątany teraz' : 'Wysprzątany dziś'
      const timeLabel = isRunning ? `od ${startLabel}` : `${startLabel}–${stopLabel}`
      const sourceRow = representative?.sourceRow ?? {}
      const row = dashboardBuildHistoryRow(
        {
          ...sourceRow,
          clientId: String(group?.clientId ?? sourceRow?.clientId ?? '').trim(),
          clientName: String(group?.clientLabel ?? sourceRow?.clientName ?? '').trim(),
          klient: String(group?.clientLabel ?? sourceRow?.klient ?? '').trim(),
        },
        dayKey,
      )
      return {
        action: 'object-history',
        title: String(group?.clientLabel ?? '').trim() || 'Obiekt',
        subtitle: `${statusLabel} · ${timeLabel} · ${workerLabel}`,
        tab: 'objects',
        row,
      }
    })
  }

  function dashboardOverviewPlannedOrderGroups(dayKey = todayYmd()) {
    const normalizedDay = dashboardActivityDayKey(dayKey)
    const rangeStart = new Date(`${normalizedDay}T00:00:00`).getTime()
    const rangeEnd = new Date(`${calendarAddDays(normalizedDay, 1)}T00:00:00`).getTime() - 1
    let plannedItems = []

    try {
      plannedItems = dashboardBuildPlannedOrderActivityItems(normalizedDay, rangeStart, rangeEnd)
      appState.dashboardOverviewPlannedOrdersError = appState.dashboardOverviewPlannedOrdersSyncError === true
    } catch (error) {
      appState.dashboardOverviewPlannedOrdersError = true
      console.warn('[portal/dashboard] planned order overview build failed', error)
      plannedItems = []
    }

    const groups = new Map()
    ;(Array.isArray(plannedItems) ? plannedItems : []).forEach((item) => {
      const sourceOrderId = String(
        item?.sourceOrderId ||
          item?.orderId ||
          item?.taskId ||
          '',
      ).trim()
      if (!sourceOrderId) {
        return
      }
      const occurrenceDateYmd = String(item?.occurrenceDateYmd ?? item?.dateYmd ?? normalizedDay).trim() || normalizedDay
      const key = `${sourceOrderId}::${occurrenceDateYmd}`
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          editorOrderId: String(item?.editorOrderId ?? item?.orderId ?? '').trim(),
          sourceOrderId,
          taskId: String(item?.taskId ?? sourceOrderId).trim(),
          occurrenceDateYmd,
          dateYmd: String(item?.dateYmd ?? occurrenceDateYmd).trim() || occurrenceDateYmd,
          isRecurringSeries: Boolean(item?.isRecurringSeries),
          isRecurringInstance: Boolean(item?.isRecurringInstance),
          recurrenceOverride: Boolean(item?.recurrenceOverride),
          workSlotKey: String(item?.workSlotKey ?? '').trim(),
          serviceBlockId: String(item?.serviceBlockId ?? '').trim(),
          serviceBlockKind: String(item?.serviceBlockKind ?? '').trim(),
          serviceBlockLabel: String(item?.serviceBlockLabel ?? '').trim(),
          title: String(item?.label ?? '').trim() || 'Zlecenie',
          companyLabel: dashboardActivityCleanCompanyLabel(item?.companyLabel ?? item?.locationLabel),
          startTs: Number(item?.startTs) || 0,
          stopTs: Number(item?.stopTs) || 0,
          workerNames: new Set(),
        })
      }

      const group = groups.get(key)
      if (!group.taskId && String(item?.taskId ?? '').trim()) {
        group.taskId = String(item.taskId).trim()
      }
      const startTs = Number(item?.startTs) || 0
      const stopTs = Number(item?.stopTs) || 0
      if (startTs > 0 && (!group.startTs || startTs < group.startTs)) {
        group.startTs = startTs
      }
      if (stopTs > group.stopTs) {
        group.stopTs = stopTs
      }
      const workerName = String(item?.workerDisplayName ?? item?.workerName ?? '').trim()
      if (workerName && workerName !== '-') {
        group.workerNames.add(workerName)
      }
    })

    return [...groups.values()]
      .map((group) => ({ ...group, workerNames: [...group.workerNames] }))
      .sort((left, right) => left.startTs - right.startTs || left.title.localeCompare(right.title, 'pl', { sensitivity: 'base' }))
  }

  function dashboardOverviewTimeLabel(timestamp) {
    const date = new Date(Number(timestamp) || 0)
    if (!Number.isFinite(date.getTime()) || date.getTime() <= 0) {
      return '--:--'
    }
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  }

  function renderDashboardOverviewPlannedOrders(groups = [], options = {}) {
    const plannedOrders = Array.isArray(groups) ? groups : []
    const strip = document.getElementById('dashOverviewPlannedOrdersStrip')
    if (!strip) {
      return
    }

    const loadError = options.loadError === true
    strip.classList.toggle('is-empty', plannedOrders.length === 0 || loadError)
    if (loadError) {
      strip.setAttribute('aria-label', 'Nie udało się wczytać zaplanowanych zleceń na dziś')
      strip.innerHTML = '<span class="dash-overview-plan-empty">Nie udało się wczytać zleceń.</span>'
      return
    }
    if (!plannedOrders.length) {
      strip.setAttribute('aria-label', 'Brak zaplanowanych zleceń przypisanych pracownikom na dziś')
      strip.innerHTML = '<span class="dash-overview-plan-empty">Brak przypisanych zleceń.</span>'
      return
    }

    const preview = plannedOrders.slice(0, DASHBOARD_OVERVIEW_PLANNED_PREVIEW_LIMIT)
    const remaining = Math.max(0, plannedOrders.length - preview.length)
    strip.setAttribute('aria-label', `${plannedOrders.length} zaplanowanych zleceń przypisanych pracownikom na dziś`)
    strip.innerHTML = [
      ...preview.map((item) => {
        const timeLabel = dashboardOverviewTimeLabel(item.startTs)
        const title = String(item.title ?? '').trim() || String(item.companyLabel ?? '').trim() || 'Zlecenie'
        const workers = Array.isArray(item.workerNames) ? item.workerNames.join(', ') : ''
        const secondary = workers || String(item.companyLabel ?? '').trim() || 'Przypisany pracownik'
        return `
          <span class="dash-overview-plan-item">
            <span class="dash-overview-plan-time">${escapeHtml(timeLabel)}</span>
            <span class="dash-overview-plan-copy">
              <span class="dash-overview-plan-title">${escapeHtml(title)}</span>
              <span class="dash-overview-plan-worker">${escapeHtml(secondary)}</span>
            </span>
          </span>
        `
      }),
      remaining > 0 ? `<span class="dash-overview-plan-more">+${remaining}</span>` : '',
    ].join('')
  }

  function dashboardBuildSummary(todayRows = [], eventRows = [], periodHourValues = {}, openHistoricalWorkdays = []) {
    const today = todayYmd()
    const systemIssueRangeFrom = dashboardSystemIssueRangeFrom()
    const normalizedTodayRows = Array.isArray(todayRows) ? todayRows : []
    const normalizedEventRows = Array.isArray(eventRows) ? eventRows : []
    const normalizedOpenHistoricalRows = Array.isArray(openHistoricalWorkdays) ? openHistoricalWorkdays : []

    const activeNowRows = normalizedTodayRows.filter((row) => Boolean(row?.isRunning))
    const activeWorkerDetails = dashboardOverviewActiveWorkerDetails(activeNowRows, today)
    const activeWorkersCount = activeWorkerDetails.length
    const activeObjectGroups = dashboardOverviewActiveObjectGroups()
    const activeObjectDetails = dashboardOverviewActiveObjectDetails(activeObjectGroups, today)
    const activeObjectsCount = activeObjectDetails.length
    const plannedOrderGroups = dashboardOverviewPlannedOrderGroups(today)
    const plannedOrdersLoadError = appState.dashboardOverviewPlannedOrdersError === true
    const operationalServices = dashboardBuildOperationalServicePanels(today)
    const plannedOrderDetails = plannedOrderGroups.map((group) => {
      const startLabel = dashboardOverviewTimeLabel(group?.startTs)
      const stopLabel = dashboardOverviewTimeLabel(group?.stopTs)
      const timeLabel = stopLabel !== '--:--' ? `${startLabel}–${stopLabel}` : startLabel
      const workers = Array.isArray(group?.workerNames) ? group.workerNames.join(', ') : ''
      const contextLabel = [timeLabel, group?.companyLabel, workers ? `Pracownicy: ${workers}` : ''].filter(Boolean).join(' · ')
      return {
        ...group,
        action: 'planned-order-editor',
        title: String(group?.title ?? '').trim() || String(group?.companyLabel ?? '').trim() || 'Zlecenie',
        subtitle: contextLabel || 'Zaplanowane na dziś',
      }
    })
    const finishedRows = normalizedTodayRows.filter((row) => {
      const stopValue = String(row?.qrStop ?? '').trim()
      const hasStop = Boolean(stopValue) && stopValue !== '--:--:--' && stopValue !== '-:-:-' && stopValue !== '-'
      return !row?.isRunning && hasStop
    })
    const totalTodaySec = normalizedTodayRows.reduce((sum, row) => sum + dashboardParseDurationLabelToSeconds(row?.duration), 0)

    const table1Details = {
      activeNow: activeWorkerDetails,
      finishedToday: finishedRows.map((row) => ({
        title: dashboardResolveWorkerLabel(row),
        subtitle: `START: ${dashboardClockLabelToHm(row?.qrStart, '--:--')} · STOP: ${dashboardClockLabelToHm(row?.qrStop, '--:--')} · Czas: ${dashboardDurationLabelToHm(row?.duration, '00:00')}`,
        tab: 'workers',
        row: dashboardBuildHistoryRow(row, today),
      })),
      totalHoursToday: normalizedTodayRows
        .map((row) => {
          const seconds = dashboardParseDurationLabelToSeconds(row?.duration)
          return { row, seconds }
        })
        .filter((item) => item.seconds > 0)
        .sort((left, right) => right.seconds - left.seconds)
        .map((item) => ({
          title: dashboardResolveWorkerLabel(item.row),
          subtitle: `Czas: ${durationSecondsToHm(item.seconds)} · Klient: ${dashboardResolveClientLabel(item.row)} · Strefa: ${dashboardResolveZoneLabel(item.row)}`,
          tab: 'workers',
          row: dashboardBuildHistoryRow(item.row, today),
        })),
    }

    const historicalOpenWorkdayRows = normalizedOpenHistoricalRows.filter((row) => {
      const dayKey = dashboardResolveDayKey(row)
      return isHistoricalOpenWorkday(row, today, dayKey)
    })
    const openStartStopWorkerDayGroups = new Map()
    historicalOpenWorkdayRows.forEach((row) => {
      const dayKey = dashboardResolveDayKey(row)
      if (!dayKey) {
        return
      }
      const recordKey = normalizeSearchText(row?.workdayId ?? row?.id)
      const workerKey = dashboardOverviewWorkerKey(row) || (recordKey ? `record:${recordKey}` : 'unknown')
      const groupKey = `${dayKey}::${workerKey}`
      if (!openStartStopWorkerDayGroups.has(groupKey)) {
        openStartStopWorkerDayGroups.set(groupKey, {
          dayKey,
          workerLogin: String(row?.workerLogin ?? '').trim(),
          workerName: dashboardResolveWorkerLabel(row),
          rows: [],
        })
      }
      const bucket = openStartStopWorkerDayGroups.get(groupKey)
      if (String(row?.workerLogin ?? '').trim() && !bucket.workerLogin) {
        bucket.workerLogin = String(row.workerLogin).trim()
      }
      const candidateName = dashboardResolveWorkerLabel(row)
      if (candidateName.split(/\s+/).length > String(bucket.workerName ?? '').split(/\s+/).length) {
        bucket.workerName = candidateName
      }
      bucket.rows.push(row)
    })
    const openStartStopYesterdayIssues = [...openStartStopWorkerDayGroups.values()]
      .sort((left, right) => {
        if (left.dayKey !== right.dayKey) {
          return left.dayKey < right.dayKey ? 1 : -1
        }
        return String(left.workerName ?? '').localeCompare(String(right.workerName ?? ''), 'pl', {
          sensitivity: 'base',
        })
      })
      .map((bucket) => {
        const rows = Array.isArray(bucket.rows) ? bucket.rows : []
        const probe = rows[0] ?? {}
        return {
          action: 'workday-day-editor',
          dayKey: bucket.dayKey,
          workerLogin: bucket.workerLogin || probe?.workerLogin,
          workerName: bucket.workerName || probe?.workerName,
          workdayId: String(probe?.workdayId ?? probe?.id ?? '').trim(),
          title: bucket.workerName || dashboardResolveWorkerLabel(probe),
          subtitle: `Data: ${formatDatePl(`${bucket.dayKey}T00:00:00.000Z`)} \u00b7 Klient: ${dashboardResolveClientLabel(probe)} \u00b7 Strefa: ${dashboardResolveZoneLabel(probe)}`,
          tab: 'workers',
          row: dashboardBuildHistoryRow(
            {
              ...probe,
              workerLogin: bucket.workerLogin || probe?.workerLogin,
              workerName: bucket.workerName || probe?.workerName,
            },
            bucket.dayKey,
          ),
        }
      })

    const historicalRows = normalizedEventRows.filter((row) => {
      const dayKey = dashboardResolveDayKey(row)
      return Boolean(dayKey) && dayKey >= systemIssueRangeFrom && dayKey < today
    })
    const historicalWorkerDayGroups = new Map()
    historicalRows.forEach((row) => {
      const dayKey = dashboardResolveDayKey(row)
      if (!dayKey) {
        return
      }
      const keySource = String(row?.workerLogin ?? row?.workerName ?? '').trim()
      const workerKey = normalizeSearchText(keySource) || 'unknown'
      const groupKey = `${dayKey}::${workerKey}`
      if (!historicalWorkerDayGroups.has(groupKey)) {
        historicalWorkerDayGroups.set(groupKey, {
          dayKey,
          workerLogin: String(row?.workerLogin ?? '').trim(),
          workerName: dashboardResolveWorkerLabel(row),
          rows: [],
        })
      }
      const bucket = historicalWorkerDayGroups.get(groupKey)
      if (String(row?.workerLogin ?? '').trim() && !bucket.workerLogin) {
        bucket.workerLogin = String(row.workerLogin).trim()
      }
      const candidateName = dashboardResolveWorkerLabel(row)
      if (candidateName.split(/\s+/).length > String(bucket.workerName ?? '').split(/\s+/).length) {
        bucket.workerName = candidateName
      }
      bucket.rows.push(row)
    })
    const historicalBuckets = [...historicalWorkerDayGroups.values()].sort((left, right) => {
      if (left.dayKey !== right.dayKey) {
        return left.dayKey < right.dayKey ? 1 : -1
      }
      return String(left.workerName ?? '').localeCompare(String(right.workerName ?? ''), 'pl', {
        sensitivity: 'base',
      })
    })

    const openCleanYesterdayIssues = []
    historicalBuckets.forEach((bucket) => {
      const rows = Array.isArray(bucket.rows) ? bucket.rows : []
      const hasQrStop = rows.some((row) => {
        const endReason = String(row?.endReason ?? '').trim().toUpperCase()
        const status = String(row?.status ?? '').trim().toUpperCase()
        return eventTypeInfo(row).label === 'QR STOP' || endReason === 'WORKDAY_STOP' || endReason === 'STOP_END_DAY' || status === 'WORKDAY_CLOSED'
      })
      const runningRows = rows.filter(
        (row) =>
          normalizeEventStatus(row?.status, Boolean(toIso(row?.endAt) || toIso(row?.dayEndAt))) === 'RUNNING' &&
          !toIso(row?.endAt) &&
          !toIso(row?.dayEndAt),
      )
      if (!runningRows.length) {
        return
      }

      if (!hasQrStop) {
        return
      }

      const openCleanRow = runningRows.find((row) => {
        if (dashboardRowIsIndividual(row) || dashboardRowIsSpecial(row)) {
          return false
        }
        return !dashboardRowLooksLikeMarker(row)
      })
      if (openCleanRow) {
        openCleanYesterdayIssues.push({
          title: bucket.workerName || dashboardResolveWorkerLabel(openCleanRow),
          subtitle: `Data: ${formatDatePl(`${bucket.dayKey}T00:00:00.000Z`)} · Klient: ${dashboardResolveClientLabel(openCleanRow)} · Strefa: ${dashboardResolveZoneLabel(openCleanRow)}`,
          tab: 'workers',
          row: dashboardBuildHistoryRow(
            {
              ...openCleanRow,
              workerLogin: bucket.workerLogin || openCleanRow?.workerLogin,
              workerName: bucket.workerName || openCleanRow?.workerName,
            },
            bucket.dayKey,
          ),
        })
      }
    })

    const cleanTooLongRows = normalizedEventRows
      .filter((row) => {
        const dayKey = dashboardResolveDayKey(row)
        return Boolean(dayKey) && dayKey >= systemIssueRangeFrom && dayKey <= today
      })
      .filter((row) => !dashboardRowIsIndividual(row))
      .filter((row) => !dashboardRowIsSpecial(row))
      .filter((row) => normalizeEventStatus(row?.status, Boolean(toIso(row?.endAt) || toIso(row?.dayEndAt))) === 'CLOSED')
      .filter((row) => !dashboardRowLooksLikeMarker(row))
      .map((row) => ({ row, seconds: dashboardEventDurationSec(row) }))
      .filter((entry) => entry.seconds > DASHBOARD_LONG_CLEAN_SECONDS)
      .sort((left, right) => right.seconds - left.seconds)

    const cleanTooLongDetails = cleanTooLongRows.map((entry) => {
      const row = entry.row
      const dayKey = dashboardResolveDayKey(row)
      return {
        title: dashboardResolveWorkerLabel(row),
        subtitle: `Data: ${formatDatePl(`${dayKey}T00:00:00.000Z`)} · ${dashboardResolveClientLabel(row)} / ${dashboardResolveZoneLabel(row)} · Czas: ${durationSecondsToHm(entry.seconds)}`,
        tab: 'workers',
        row: dashboardBuildHistoryRow(row, dayKey),
      }
    })

    return {
      values: {
        activeNow: activeWorkersCount,
        activeObjects: activeObjectsCount,
        plannedOrders: plannedOrdersLoadError ? '—' : plannedOrderGroups.length,
        finishedToday: finishedRows.length,
        totalHoursToday: durationSecondsToHm(totalTodaySec),
        totalHoursCurrentWeek: periodHourValues.totalHoursCurrentWeek ?? '00:00',
        totalHoursPreviousWeek: periodHourValues.totalHoursPreviousWeek ?? '00:00',
        totalHoursCurrentMonth: periodHourValues.totalHoursCurrentMonth ?? '00:00',
        totalHoursPreviousMonth: periodHourValues.totalHoursPreviousMonth ?? '00:00',
        openStartStopYesterday: openStartStopYesterdayIssues.length,
        openQrStopDays: openStartStopYesterdayIssues.length,
        openCleanYesterday: openCleanYesterdayIssues.length,
        cleanTooLong: cleanTooLongDetails.length,
      },
      details: {
        activeNow: table1Details.activeNow,
        activeObjects: activeObjectDetails,
        plannedOrders: plannedOrderDetails,
        finishedToday: table1Details.finishedToday,
        totalHoursToday: table1Details.totalHoursToday,
        openStartStopYesterday: openStartStopYesterdayIssues,
        openCleanYesterday: openCleanYesterdayIssues,
        cleanTooLong: cleanTooLongDetails,
      },
      overview: {
        plannedOrders: plannedOrderGroups,
        plannedOrdersLoadError,
      },
      operationalServices,
    }
  }

  function renderDashboardSummary(summary, todayRows = appState.dashboardTodayRows) {
    dashboardMountCommandCenterPanels()
    const values = summary?.values ?? {}
    const operationalServices =
      summary?.operationalServices?.correlation?.modelVersion === DASHBOARD_SERVICE_EXECUTION_MODEL_VERSION
        ? summary.operationalServices
        : dashboardBuildOperationalServicePanels(todayYmd())
    appState.dashboardOverviewPlannedOrdersError = summary?.overview?.plannedOrdersLoadError === true
    appState.dashboardOverviewPlannedOrdersSyncError = appState.dashboardOverviewPlannedOrdersError
    appState.dashboardMetricDetails = summary?.details ?? {}
    appState.dashboardMetricValues = values

    const setValue = (id, value) => {
      const node = document.getElementById(id)
      if (node) {
        node.textContent = String(value ?? '0')
      }
    }

    setValue('sumActiveNowCount', values.activeNow ?? 0)
    setValue('dashOverviewOpenQrStopCount', values.openQrStopDays ?? values.openStartStopYesterday ?? 0)
    setValue('dashOverviewActiveObjectsCount', values.activeObjects ?? 0)
    setValue('dashOverviewPlannedOrdersCount', values.plannedOrders ?? 0)
    setValue('sumFinishedTodayCount', values.finishedToday ?? 0)
    setValue('sumTotalHoursToday', values.totalHoursToday ?? '00:00')
    setValue('sumOpenStartStopYesterdayCount', values.openStartStopYesterday ?? 0)
    setValue('sumOpenCleanYesterdayCount', values.openCleanYesterday ?? 0)
    setValue('sumCleanTooLongCount', values.cleanTooLong ?? 0)
    renderDashboardOverviewPlannedOrders(summary?.overview?.plannedOrders ?? [], {
      loadError: appState.dashboardOverviewPlannedOrdersError,
    })
    dashboardRenderOperationalServicePanels(operationalServices)
    dashboardRenderCommandCenterPlan(
      summary?.overview?.plannedOrders ?? [],
      operationalServices,
      { loadError: appState.dashboardOverviewPlannedOrdersError },
    )
    dashboardSyncCommandCenterSummary(values, operationalServices)

    const mapDayKey = todayYmd()
    const mapRows = dashboardActiveWorkerMapCandidateRows(todayRows, mapDayKey)
    let plannedMapItems = []
    if (appState.dashboardOverviewPlannedOrdersError !== true) {
      try {
        const mapRangeStart = new Date(`${mapDayKey}T00:00:00`).getTime()
        const mapRangeEnd = new Date(`${calendarAddDays(mapDayKey, 1)}T00:00:00`).getTime() - 1
        plannedMapItems = dashboardBuildPlannedOrderActivityItems(mapDayKey, mapRangeStart, mapRangeEnd)
      } catch (error) {
        console.warn('[portal/dashboard] planned worker map build failed', error)
      }
    }
    const plannedMapRows = dashboardActiveWorkerMapPlannedCandidates(plannedMapItems)
    const plannedOnlyMapRows = plannedMapRows.filter(
      (plannedRow) => !mapRows.some((workdayRow) => dashboardActiveWorkerMapRecordsMatch(plannedRow, workdayRow)),
    )
    const locations = dashboardActiveWorkerMapLocations(mapRows, mapDayKey, plannedMapRows)
    if (
      !Array.isArray(summary?.overview?.plannedOrders) ||
      (
        summary.overview.plannedOrders.length === 0 &&
        plannedMapItems.length > 0
      )
    ) {
      dashboardRenderCommandCenterPlan([], operationalServices, {
        loadError: true,
        unavailableMessage: 'Plan źródłowy chwilowo niedostępny.',
      })
    }
    dashboardRenderCommandCenterAlerts({
      values,
      operationalServices,
      locations,
      activeRows: mapRows,
      pendingStopProposalCount: dashboardStopProposalAttention.pendingCount,
    })
    void dashboardRenderActiveWorkersMap(locations, mapRows.length + plannedOnlyMapRows.length)
  }

  function dashboardAddUserMatchKey(target, rawValue = '') {
    const normalized = normalizeSearchText(rawValue)
    if (!normalized) {
      return
    }
    target.keys.add(normalized)
    const compact = normalized.replace(/[^a-z0-9]/g, '')
    if (compact.length >= 3) {
      target.compactKeys.add(compact)
    }
  }

  function dashboardCurrentUserMatchKeys() {
    const match = { keys: new Set(), compactKeys: new Set() }
    const session = appState.session ?? {}
    ;[
      session.uid,
      session.userId,
      session.id,
      session.login,
      session.email,
      session.name,
      session.displayName,
      session.workerName,
    ].forEach((value) => dashboardAddUserMatchKey(match, value))

    const emailLocal = String(session.email ?? '').split('@')[0]
    dashboardAddUserMatchKey(match, emailLocal)

    const workerCandidates = (Array.isArray(appState.workers) ? appState.workers : []).filter((worker) => {
      const workerMatch = { keys: new Set(), compactKeys: new Set() }
      ;[
        calendarWorkerId(worker),
        calendarWorkerLabel(worker),
        worker.login,
        worker.workerLogin,
        worker.email,
        worker.loginEmail,
        worker.authUid,
        worker.auth_uid,
        worker.uid,
      ].forEach((value) => dashboardAddUserMatchKey(workerMatch, value))
      return (
        [...workerMatch.keys].some((key) => match.keys.has(key)) ||
        [...workerMatch.compactKeys].some((key) => match.compactKeys.has(key))
      )
    })

    workerCandidates.forEach((worker) => {
      ;[
        calendarWorkerId(worker),
        calendarWorkerLabel(worker),
        worker.login,
        worker.workerLogin,
        worker.email,
        worker.loginEmail,
        worker.authUid,
        worker.auth_uid,
        worker.uid,
      ].forEach((value) => dashboardAddUserMatchKey(match, value))
    })

    return match
  }

  function dashboardTaskColumnBelongsToCurrentUser(task = {}, match = dashboardCurrentUserMatchKeys()) {
    const status = String(task.kanbanStatus ?? '').trim()
    if (!status || (!match.keys.size && !match.compactKeys.size)) {
      return false
    }
    const column = kanbanColumnsForStatus().find((item) => item.id === status)
    const scope = kanbanNormalizeColumnScope(column?.scope)
    if (!column || (scope !== 'user' && scope !== 'person')) {
      return false
    }

    const candidate = { keys: new Set(), compactKeys: new Set() }
    ;[column.ownerId, column.ownerLabel, column.ownerName].forEach((value) => dashboardAddUserMatchKey(candidate, value))
    return (
      [...candidate.keys].some((key) => match.keys.has(key)) ||
      [...candidate.compactKeys].some((key) => match.compactKeys.has(key))
    )
  }

  function dashboardDueKanbanTasks(options = {}) {
    const includeWorkerMessages = options.includeWorkerMessages !== false
    const today = todayYmd()
    const currentUserMatch = dashboardCurrentUserMatchKeys()
    return calendarSortTasks(calendarLoadTasks()).filter((task) => {
      const taskDay = String(task.dateYmd ?? '').trim()
      if (!includeWorkerMessages && (task.generatedFromComment || calendarTaskToneValue(task) === 'message')) {
        return false
      }
      return (
        /^\d{4}-\d{2}-\d{2}$/.test(taskDay) &&
        taskDay <= today &&
        task.active !== false &&
        !kanbanTaskIsCompleted(task) &&
        calendarTaskShouldShowOnDashboardForCurrentUser(task, currentUserMatch)
      )
    })
  }

  function updateSidebarTaskDueBadges(counts) {
    const calendarValue = Math.max(0, Number(typeof counts === 'object' ? counts.calendar : counts) || 0)
    const kanbanValue = Math.max(0, Number(typeof counts === 'object' ? counts.kanban : counts) || 0)
    ;[
      ['menuCalendarTaskDueCount', calendarValue],
      ['menuKanbanTaskDueCount', kanbanValue],
    ].forEach(([id, value]) => {
      const badge = document.getElementById(id)
      if (!badge) {
        return
      }

      badge.textContent = value > 99 ? '99+' : String(value)
      badge.hidden = value <= 0
      badge.setAttribute('aria-label', value ? `${value} dzisiejszych i zaległych zadań` : 'Brak dzisiejszych i zaległych zadań')
    })
  }

  function dashboardKanbanTaskMeta(task = {}) {
    const taskDay = String(task.dateYmd ?? '').trim()
    const dateLabel = taskDay && taskDay !== todayYmd() ? formatDatePl(`${taskDay}T12:00:00.000Z`) : ''
    const startTime = calendarNormalizeTimeValue(task.startTime ?? task.time)
    const endTime = calendarNormalizeTimeValue(task.endTime)
    const timeRange = startTime && endTime ? `${startTime}-${endTime}` : startTime || 'bez godziny'
    const objects = calendarSelectionLabels(task.objects)
    const place = objects.length ? objects.join(', ') : String(task.place ?? '').trim()
    const zoneLabel = String(task.zone?.label ?? task.zoneName ?? '').trim()
    const zoneLocation = String(task.zone?.location ?? task.zoneLocation ?? '').trim()
    const zoneDisplay = zoneLabel ? calendarZoneDisplayLabel({ label: zoneLabel, location: zoneLocation }) : ''
    const status = kanbanNormalizeStatus(task.kanbanStatus)
    const columnLabel = kanbanColumnsForStatus().find((column) => column.id === status)?.label || 'Centrum zadań'
    const dueDate = String(task.dueDateYmd ?? '').trim()
    const dueTime = calendarNormalizeTimeValue(task.dueTime)
    const dueLabel = dueDate ? `Termin: ${formatDatePl(`${dueDate}T12:00:00.000Z`)}${dueTime ? ` ${dueTime}` : ''}` : ''
    return [dateLabel, timeRange, dueLabel, place, zoneDisplay, columnLabel].filter(Boolean).join(' · ')
  }

  function renderDashboardKanbanTasks() {
    const list = document.getElementById('dashKanbanTasksList')
    const count = document.getElementById('dashKanbanTasksCount')
    const allTasks = dashboardDueKanbanTasks()
    const calendarBadgeTasks = dashboardDueKanbanTasks({ includeWorkerMessages: false })
    const tasks = allTasks.slice(0, DASHBOARD_DUE_TASKS_PREVIEW_LIMIT)
    updateSidebarTaskDueBadges({ calendar: calendarBadgeTasks.length, kanban: allTasks.length })

    if (count) {
      count.textContent = String(allTasks.length)
    }
    if (!list) {
      return
    }

    if (!tasks.length) {
      list.innerHTML = '<div class="dash-kanban-empty">Brak dzisiejszych i zaległych zadań.</div>'
      return
    }

    list.innerHTML = tasks
      .map((task) => {
        const tone = calendarTaskToneValue(task)
        const title = String(task.title ?? '').trim() || 'Zadanie'
        return `
          <button class="dash-kanban-task dash-kanban-task--${escapeHtml(tone)}" type="button" data-dash-kanban-task-id="${escapeHtml(task.id)}">
            <span class="dash-kanban-task-title">${escapeHtml(title)}</span>
            <span class="dash-kanban-task-meta">${escapeHtml(dashboardKanbanTaskMeta(task))}</span>
          </button>
        `
      })
      .join('')
  }

  function dashboardLocalCachePart(value, fallback = 'none') {
    const normalized = normalizeSearchText(value).replace(/[^a-z0-9_-]/g, '')
    return normalized ? normalized.slice(0, 96) : fallback
  }

  function dashboardLocalCacheKey(orgId = appState.session?.orgId) {
    const orgPart = dashboardLocalCachePart(orgId, 'org')
    const userPart = dashboardLocalCachePart(
      appState.session?.uid ??
        appState.session?.userId ??
        appState.session?.email ??
        appState.session?.login ??
        appState.session?.name,
      'user',
    )
    return `${DASHBOARD_LOCAL_CACHE_PREFIX}.${orgPart}.${userPart}`
  }

  function dashboardReadLocalSnapshot(orgId = appState.session?.orgId) {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null
    }

    try {
      const raw = window.localStorage.getItem(dashboardLocalCacheKey(orgId))
      if (!raw) {
        return null
      }

      const parsed = JSON.parse(raw)
      if (!parsed || Number(parsed.version) !== DASHBOARD_LOCAL_CACHE_VERSION) {
        return null
      }

      const cachedAt = Number(parsed.cachedAt) || 0
      const dayKey = String(parsed.dayKey ?? '').trim()
      if (dayKey !== todayYmd() || !cachedAt || Date.now() - cachedAt > DASHBOARD_LOCAL_CACHE_TTL_MS) {
        return null
      }

      return parsed
    } catch {
      return null
    }
  }

  function dashboardWriteLocalSnapshot(orgId = appState.session?.orgId, patch = {}) {
    if (typeof window === 'undefined' || !window.localStorage || !orgId) {
      return
    }

    const existing = dashboardReadLocalSnapshot(orgId) ?? {}
    const snapshot = {
      version: DASHBOARD_LOCAL_CACHE_VERSION,
      dayKey: todayYmd(),
      cachedAt: Date.now(),
      summary: patch.summary ?? existing.summary ?? null,
      todayRows: Array.isArray(patch.todayRows) ? patch.todayRows : Array.isArray(existing.todayRows) ? existing.todayRows : [],
      activityWorkdayRows: Array.isArray(patch.activityWorkdayRows)
        ? patch.activityWorkdayRows
        : Array.isArray(existing.activityWorkdayRows)
          ? existing.activityWorkdayRows
          : [],
      scheduleSourceRows: Array.isArray(patch.scheduleSourceRows)
        ? patch.scheduleSourceRows
        : Array.isArray(existing.scheduleSourceRows)
          ? existing.scheduleSourceRows
          : [],
      comments: Array.isArray(patch.comments)
        ? patch.comments.slice(0, DASHBOARD_NEW_COMMENTS_LIMIT)
        : Array.isArray(existing.comments)
          ? existing.comments
          : [],
      workers: Array.isArray(patch.workers) ? patch.workers : Array.isArray(existing.workers) ? existing.workers : [],
    }

    try {
      window.localStorage.setItem(dashboardLocalCacheKey(orgId), JSON.stringify(snapshot))
    } catch {
      // Local storage can be disabled or full. The live dashboard still works.
    }
  }

  function dashboardApplyLocalSnapshot(orgId = appState.session?.orgId) {
    const snapshot = dashboardReadLocalSnapshot(orgId)
    if (!snapshot) {
      return false
    }

    if (Array.isArray(snapshot.scheduleSourceRows)) {
      appState.dashboardScheduleSourceRows = snapshot.scheduleSourceRows
    }
    if (Array.isArray(snapshot.activityWorkdayRows)) {
      appState.dashboardActivityWorkdayRows = snapshot.activityWorkdayRows
    }
    if (Array.isArray(snapshot.workers) && snapshot.workers.length) {
      appState.workers = snapshot.workers
      appState.workerTimeRows = snapshot.workers
    }
    if (Array.isArray(snapshot.todayRows)) {
      appState.dashboardTodayRows = snapshot.todayRows
      renderDashboardEvents(snapshot.todayRows)
    }
    if (snapshot.summary) {
      renderDashboardSummary(snapshot.summary, snapshot.todayRows)
    }
    if (Array.isArray(snapshot.comments)) {
      renderDashboardNewComments(snapshot.comments)
    }

    renderDashboardKanbanTasks()
    setDashboardLastRefresh(new Date(Number(snapshot.cachedAt) || Date.now()))
    return true
  }

  function dashboardViewIsVisible() {
    const view = document.getElementById('view-dashboard')
    if (!view) {
      return false
    }

    return appState.currentRoute === 'dashboard' || view.style.display !== 'none'
  }

  function dashboardSetLoadingStage(stage) {
    const view = document.getElementById('view-dashboard')
    if (!view) {
      return
    }

    const normalizedStage = DASHBOARD_LOADING_STAGES.includes(stage) ? stage : 'start'
    view.setAttribute('data-dashboard-stage', normalizedStage)
  }

  function dashboardMarkLoadingStage(stage) {
    if (appState.dashboardLoadingCount <= 0 || !dashboardViewIsVisible()) {
      return
    }
    dashboardSetLoadingStage(stage)
  }

  function dashboardNextPaint() {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      return Promise.resolve()
    }

    return new Promise((resolve) => {
      window.requestAnimationFrame(() => resolve())
    })
  }

  async function dashboardRevealLoadingStage(stage) {
    dashboardMarkLoadingStage(stage)
    await dashboardNextPaint()
  }

  function dashboardSyncLoadingOverlay() {
    const overlay = document.getElementById('dashboardLoadingOverlay')
    const view = document.getElementById('view-dashboard')
    if (!overlay) {
      return
    }

    const active = appState.dashboardLoadingCount > 0 && dashboardViewIsVisible()
    if (active) {
      if (view && !view.getAttribute('data-dashboard-stage')) {
        dashboardSetLoadingStage('start')
      }
      if (overlay.style.display === 'grid') {
        overlay.setAttribute('aria-busy', 'true')
        overlay.setAttribute('aria-hidden', 'false')
        view?.classList.add('is-loading')
        view?.setAttribute('data-dashboard-loading', 'true')
        return
      }
      if (!dashboardLoadingOverlayTimer && typeof window !== 'undefined') {
        dashboardLoadingOverlayTimer = window.setTimeout(() => {
          dashboardLoadingOverlayTimer = 0
          if (appState.dashboardLoadingCount > 0 && dashboardViewIsVisible()) {
            overlay.style.display = 'grid'
            overlay.setAttribute('aria-busy', 'true')
            overlay.setAttribute('aria-hidden', 'false')
            view?.classList.add('is-loading')
            view?.setAttribute('data-dashboard-loading', 'true')
          }
        }, DATA_SYNC_OVERLAY_DELAY_MS)
      }
    } else {
      if (dashboardLoadingOverlayTimer && typeof window !== 'undefined') {
        window.clearTimeout(dashboardLoadingOverlayTimer)
        dashboardLoadingOverlayTimer = 0
      }
      overlay.style.display = 'none'
      overlay.setAttribute('aria-busy', 'false')
      overlay.setAttribute('aria-hidden', 'true')
      view?.classList.remove('is-loading')
      view?.removeAttribute('data-dashboard-loading')
      view?.removeAttribute('data-dashboard-stage')
    }
  }

  function dashboardBeginLoading() {
    const wasIdle = Math.max(0, Number(appState.dashboardLoadingCount) || 0) === 0
    appState.dashboardLoadingCount = Math.max(0, Number(appState.dashboardLoadingCount) || 0) + 1
    if (wasIdle) {
      dashboardSetLoadingStage('start')
    }
    dashboardSyncLoadingOverlay()
  }

  function dashboardEndLoading() {
    appState.dashboardLoadingCount = Math.max(0, (Number(appState.dashboardLoadingCount) || 0) - 1)
    dashboardSyncLoadingOverlay()
  }

  function dashboardHideMetricPopover(options = {}) {
    if (dashboardMetricPopoverHideTimer) {
      window.clearTimeout(dashboardMetricPopoverHideTimer)
      dashboardMetricPopoverHideTimer = null
    }

    const popover = document.getElementById('dashMetricPopover')
    if (!popover) {
      return
    }

    const anchorId = String(popover.getAttribute('data-anchor-id') ?? '').trim()
    document.querySelectorAll('[data-dash-metric][aria-expanded], [data-dash-alert-metric][aria-expanded]').forEach((button) => {
      button.setAttribute('aria-expanded', 'false')
    })
    popover.style.display = 'none'
    popover.removeAttribute('data-metric')
    popover.removeAttribute('data-pinned')
    popover.removeAttribute('data-anchor-id')
    if (options.restoreFocus === true && anchorId) {
      document.getElementById(anchorId)?.focus?.()
    }
  }

  function dashboardScheduleMetricPopoverHide() {
    if (dashboardMetricPopoverHideTimer) {
      window.clearTimeout(dashboardMetricPopoverHideTimer)
    }
    dashboardMetricPopoverHideTimer = window.setTimeout(() => {
      dashboardHideMetricPopover()
    }, 260)
  }

  function dashboardCancelMetricPopoverHide() {
    if (dashboardMetricPopoverHideTimer) {
      window.clearTimeout(dashboardMetricPopoverHideTimer)
      dashboardMetricPopoverHideTimer = null
    }
  }

  function dashboardMetricTitle(metricKey) {
    const button = document.querySelector(`[data-dash-metric="${metricKey}"]`)
    const label = String(
      button?.querySelector('.dash-summary-row-label, .dash-overview-kpi-label')?.textContent ?? '',
    ).trim()
    if (metricKey === 'openStartStopYesterday') {
      return `${label || 'Brak QR STOP'} — wybierz dzień do uzupełnienia`
    }
    if (metricKey === 'activeNow') {
      return `${label || 'Pracownicy'} — wybierz aktywną osobę`
    }
    if (metricKey === 'activeObjects') {
      return `${label || 'Obiekty'} — wybierz obiekt`
    }
    if (metricKey === 'plannedOrders') {
      return `${label || 'Zaplanowane zlecenia'} — wybierz zlecenie`
    }
    return label || 'Szczegóły'
  }

  function dashboardMetricListCopy(metricKey) {
    const metricCopy = {
      openStartStopYesterday: {
        itemAriaPrefix: 'Otwórz dzień pracy do uzupełnienia',
        itemTitle: 'Otwórz dzień pracy do uzupełnienia',
        actionLabel: 'Uzupełnij STOP i zamknij dzień',
        emptyLabel: 'Brak niezamkniętych dni bez QR STOP.',
      },
      activeNow: {
        itemAriaPrefix: 'Otwórz dzisiejszą historię pracownika',
        itemTitle: 'Otwórz dzisiejszą historię pracownika',
        actionLabel: 'Otwórz historię pracownika',
        emptyLabel: 'Brak aktywnych pracowników.',
      },
      activeObjects: {
        itemAriaPrefix: 'Otwórz historię obiektu',
        itemTitle: 'Otwórz historię obiektu',
        actionLabel: 'Otwórz historię obiektu',
        emptyLabel: 'Brak sprzątanych lub wysprzątanych dziś obiektów.',
      },
      plannedOrders: {
        itemAriaPrefix: 'Otwórz zlecenie',
        itemTitle: 'Otwórz zlecenie',
        actionLabel: 'Otwórz zlecenie',
        emptyLabel: 'Brak zaplanowanych zleceń na dziś.',
      },
    }
    return metricCopy[metricKey] ?? {
      itemAriaPrefix: 'Otwórz szczegóły',
      itemTitle: 'Otwórz szczegóły',
      actionLabel: '',
      emptyLabel: 'Brak szczegółów.',
    }
  }

  function dashboardShowMetricPopover(metricKey, anchorButton, options = {}) {
    const popover = document.getElementById('dashMetricPopover')
    const titleNode = document.getElementById('dashMetricPopoverTitle')
    const listNode = document.getElementById('dashMetricPopoverList')
    if (!popover || !titleNode || !listNode || !(anchorButton instanceof HTMLElement)) {
      return
    }

    dashboardCancelMetricPopoverHide()
    const plannedOrdersLoadError = metricKey === 'plannedOrders' && appState.dashboardOverviewPlannedOrdersError === true
    const details = plannedOrdersLoadError ? [] : dashboardMetricDetailsOrEmpty(metricKey)
    const copy = dashboardMetricListCopy(metricKey)
    const fullListMetrics = new Set(['openStartStopYesterday', 'activeNow', 'activeObjects', 'plannedOrders'])
    const maxRows = fullListMetrics.has(metricKey) ? details.length : 24
    const visibleRows = details.slice(0, maxRows)
    const hiddenCount = Math.max(0, details.length - visibleRows.length)

    titleNode.textContent = dashboardMetricTitle(metricKey)
    listNode.innerHTML = visibleRows.length
      ? `
        ${visibleRows
          .map(
            (detail, index) => `
              <button
                class="dash-metric-popover-item"
                type="button"
                data-dash-metric-detail="${index}"
                data-dash-metric-key="${escapeHtml(String(metricKey ?? ''))}"
                aria-label="${escapeHtml(copy.itemAriaPrefix)}: ${escapeHtml(detail?.title ?? '-')}. ${escapeHtml(detail?.subtitle ?? '-')}"
                title="${escapeHtml(copy.itemTitle)}"
              >
                <span class="dash-metric-popover-item-title">${escapeHtml(detail?.title ?? '-')}</span>
                <span class="dash-metric-popover-item-subtitle">${escapeHtml(detail?.subtitle ?? '-')}</span>
                ${copy.actionLabel ? `<span class="dash-metric-popover-item-action">${escapeHtml(copy.actionLabel)}</span>` : ''}
              </button>
            `,
          )
          .join('')}
        ${
          hiddenCount > 0
            ? `<div class="dash-metric-popover-more">+${hiddenCount} kolejnych rekordów...</div>`
            : ''
        }
      `
      : `<div class="dash-metric-popover-empty">${escapeHtml(
          plannedOrdersLoadError ? 'Nie udało się wczytać zaplanowanych zleceń.' : copy.emptyLabel,
        )}</div>`

    popover.style.display = 'block'
    popover.style.visibility = 'hidden'
    popover.setAttribute('data-metric', String(metricKey ?? ''))
    popover.setAttribute('data-pinned', options.pinned === true ? 'true' : 'false')
    if (anchorButton.id) {
      popover.setAttribute('data-anchor-id', anchorButton.id)
    } else {
      popover.removeAttribute('data-anchor-id')
    }
    document.querySelectorAll('[data-dash-metric][aria-expanded], [data-dash-alert-metric][aria-expanded]').forEach((button) => {
      button.setAttribute('aria-expanded', button === anchorButton ? 'true' : 'false')
    })

    const anchorRect = anchorButton.getBoundingClientRect()
    const popoverRect = popover.getBoundingClientRect()
    let left = anchorRect.left + (anchorRect.width - popoverRect.width) / 2
    left = Math.max(10, Math.min(left, window.innerWidth - popoverRect.width - 10))

    let top = anchorRect.bottom + 2
    if (top + popoverRect.height > window.innerHeight - 10) {
      top = Math.max(10, anchorRect.top - popoverRect.height - 2)
    }

    popover.style.left = `${Math.round(left)}px`
    popover.style.top = `${Math.round(top)}px`
    popover.style.visibility = 'visible'
    return popover
  }

  function dashboardTogglePinnedMetricPopover(metricKey, anchorButton) {
    const popover = document.getElementById('dashMetricPopover')
    const isOpen =
      popover?.style.display !== 'none' &&
      popover?.getAttribute('data-metric') === metricKey &&
      popover?.getAttribute('data-pinned') === 'true'
    if (isOpen) {
      dashboardHideMetricPopover()
      return
    }

    const openedPopover = dashboardShowMetricPopover(metricKey, anchorButton, { pinned: true })
    window.setTimeout(() => {
      const firstItem = openedPopover?.querySelector?.('[data-dash-metric-detail]')
      if (firstItem instanceof HTMLElement) {
        firstItem.focus()
        return
      }
      const closeButton = openedPopover?.querySelector?.('#dashMetricPopoverClose')
      if (closeButton instanceof HTMLElement) {
        closeButton.focus()
        return
      }
      if (openedPopover instanceof HTMLElement) {
        openedPopover.tabIndex = -1
        openedPopover.focus()
      }
    }, 0)
  }

  function dashboardMetricWorkerSearchKeys(detail = {}) {
    const row = detail?.row ?? {}
    const keys = new Set()
    ;[
      detail?.workerLogin,
      detail?.workerName,
      detail?.workerId,
      row?.workerLogin,
      row?.login,
      row?.workerName,
      row?.name,
      row?.workerId,
      row?.id,
    ].forEach((value) => {
      const normalized = normalizeSearchText(value)
      if (!normalized) return
      keys.add(normalized)
      const spaced = normalized.replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim()
      if (spaced) {
        keys.add(spaced)
        const parts = spaced.split(' ').filter(Boolean)
        if (parts.length > 1) keys.add(parts.slice().reverse().join(' '))
      }
      const compact = normalized.replace(/[\s._-]+/g, '')
      if (compact) keys.add(compact)
    })
    return keys
  }

  function dashboardWorkerMatchesSearchKeys(worker = {}, keys = new Set()) {
    if (!keys.size) return false
    return [
      worker?.login,
      worker?.workerLogin,
      worker?.id,
      worker?.workerId,
      worker?.email,
      worker?.loginEmail,
      worker?.name,
      worker?.workerName,
      worker?.workername,
      worker?.worker_name,
      worker?.fullName,
      worker?.displayName,
    ].some((value) => {
      const normalized = normalizeSearchText(value)
      if (!normalized) return false
      const spaced = normalized.replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim()
      const compact = normalized.replace(/[\s._-]+/g, '')
      return keys.has(normalized) || (spaced && keys.has(spaced)) || (compact && keys.has(compact))
    })
  }

  async function dashboardResolveMetricWorker(detail = {}) {
    const keys = dashboardMetricWorkerSearchKeys(detail)
    const localWorkers = Array.isArray(appState.workers) ? appState.workers : []
    const localMatch = localWorkers.find((worker) => dashboardWorkerMatchesSearchKeys(worker, keys))
    if (localMatch) return localMatch

    const orgId = String(appState.session?.orgId ?? '').trim()
    if (!orgId || typeof getWorkers !== 'function') return null

    const remoteWorkers = await getWorkers(orgId, { forceRefresh: false }).catch(() => [])
    if (Array.isArray(remoteWorkers) && remoteWorkers.length) {
      appState.workers = remoteWorkers
      return remoteWorkers.find((worker) => dashboardWorkerMatchesSearchKeys(worker, keys)) ?? null
    }
    return null
  }

  function dashboardMetricDetailDayKey(detail = {}) {
    const row = detail?.row ?? {}
    const direct = String(detail?.dayKey ?? row?.dayKey ?? '').trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct
    return dashboardResolveDayKey(row)
  }

  async function openDashboardWorkdayDayEditor(detail = {}) {
    const dayKey = dashboardMetricDetailDayKey(detail)
    const worker = await dashboardResolveMetricWorker(detail)
    if (!worker || !dayKey) {
      showTransientNotice('Nie udało się znaleźć pracownika lub dnia pracy do edycji.', 'error')
      return false
    }

    const row = detail?.row ?? {}
    appState.workerAccountCurrent = worker
    appState.workerAccountActiveTab = 'time'
    appState.workerAccountTargetKey = String(worker.login ?? worker.workerLogin ?? worker.id ?? worker.workerId ?? '').trim()
    appState.selectedWorkerLogin = String(worker.login ?? worker.workerLogin ?? row.workerLogin ?? '').trim()
    appState.selectedWorkerName = String(worker.name ?? worker.workerName ?? row.workerName ?? '').trim()
    appState.workerAccountPendingTimeEditor = {
      dayKey,
      workdayId: String(detail?.workdayId ?? row?.workdayId ?? row?.id ?? '').trim(),
      source: 'dashboard-open-start-stop',
    }

    if (typeof window !== 'undefined' && typeof window.go === 'function') {
      window.go('workerAccount')
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('worker-account-select', {
          detail: {
            worker,
            tab: 'time',
            timeEditorIntent: appState.workerAccountPendingTimeEditor,
          },
        }),
      )
    }
    return true
  }

  async function openDashboardMetricDetail(metricKey, detailIndex) {
    const details = dashboardMetricDetailsOrEmpty(metricKey)
    const detail = details[Number(detailIndex)]
    if (!detail) {
      return
    }

    dashboardHideMetricPopover()
    if (metricKey === 'openStartStopYesterday' || detail?.action === 'workday-day-editor') {
      const opened = await openDashboardWorkdayDayEditor(detail)
      if (opened) return
    }

    const row = detail?.row ?? {}
    if (metricKey === 'activeNow' || detail?.action === 'worker-history') {
      const workerLogin = String(detail?.workerLogin ?? row?.workerLogin ?? '').trim()
      const workerName = String(detail?.workerName ?? row?.workerName ?? '').trim()
      await openDashboardWorkerHistory(workerLogin, workerName)
      return
    }

    if (metricKey === 'activeObjects' || detail?.action === 'object-history') {
      await openEventHistoryFromRow(row, 'objects')
      return
    }

    if (metricKey === 'plannedOrders' || detail?.action === 'planned-order-editor') {
      await dashboardSyncCalendarOrdersForTimeline({ forceRefresh: false })
      const orderBar = document.createElement('span')
      const attributes = {
        'data-calendar-timeline-order-id': detail?.editorOrderId || detail?.sourceOrderId,
        'data-calendar-timeline-source-order-id': detail?.sourceOrderId || detail?.editorOrderId,
        'data-calendar-timeline-date': detail?.dateYmd || detail?.occurrenceDateYmd,
        'data-calendar-timeline-occurrence-date': detail?.occurrenceDateYmd,
        'data-calendar-timeline-work-slot-key': detail?.workSlotKey,
        'data-calendar-timeline-service-block-id': detail?.serviceBlockId,
        'data-calendar-timeline-service-block-kind': detail?.serviceBlockKind,
        'data-calendar-timeline-service-block-label': detail?.serviceBlockLabel,
      }
      Object.entries(attributes).forEach(([name, value]) => {
        const normalized = String(value ?? '').trim()
        if (normalized) {
          orderBar.setAttribute(name, normalized)
        }
      })
      if (detail?.isRecurringSeries) {
        orderBar.setAttribute('data-calendar-timeline-recurring-series', '1')
      }
      if (detail?.isRecurringInstance) {
        orderBar.setAttribute('data-calendar-timeline-recurring-instance', '1')
      }
      if (detail?.recurrenceOverride) {
        orderBar.setAttribute('data-calendar-timeline-recurrence-override', '1')
      }
      const context = calendarTimelineContextFromBar(orderBar)
      if (!context) {
        showTransientNotice('Nie udało się odnaleźć zlecenia do edycji.', 'error')
        return
      }
      calendarTimelineEditOrderFromContext(context)
      return
    }

    const tab = String(detail?.tab ?? '').trim() || 'workers'
    await openEventHistoryFromRow(row, tab)
  }

  async function openDashboardMissingQrStopList() {
    const orgId = String(appState.session?.orgId ?? '').trim()
    const items = dashboardMetricDetailsOrEmpty('openStartStopYesterday')
      .map((detail) => ({
        action: 'workday-day-editor',
        dayKey: String(detail?.dayKey ?? '').trim(),
        workerLogin: String(detail?.workerLogin ?? '').trim(),
        workerName: String(detail?.workerName ?? detail?.title ?? '').trim(),
        workdayId: String(detail?.workdayId ?? detail?.row?.workdayId ?? detail?.row?.id ?? '').trim(),
        title: String(detail?.title ?? '').trim(),
        subtitle: String(detail?.subtitle ?? '').trim(),
        row: { ...(detail?.row ?? {}) },
      }))
      .filter((detail) => detail.dayKey && (detail.workdayId || detail.workerLogin))

    if (!orgId || !items.length) {
      showTransientNotice('Brak aktualnych dni z brakującym QR STOP.', 'error')
      return false
    }

    appState.eventsDashboardMissingQrStopFocus = {
      kind: 'historical-missing-qr-stop',
      orgId,
      items,
    }

    if (typeof window !== 'undefined' && typeof window.go === 'function') {
      await Promise.resolve(window.go('events'))
      return true
    }

    showTransientNotice('Nie udało się otworzyć listy brakujących QR STOP.', 'error')
    return false
  }

  function dashboardLateMinutesToHm(value) {
    const minutes = Number(value ?? 0)
    const normalizedMinutes = Number.isFinite(minutes) && minutes > 0 ? Math.floor(minutes) : 0
    return durationSecondsToHm(normalizedMinutes * 60)
  }

  async function dashboardLoadHistoricalOpenWorkdays(orgId, options = {}) {
    const activeOrgId = String(orgId ?? '').trim()
    if (!activeOrgId) {
      return { items: [] }
    }

    return getWorkdays(activeOrgId, {
      source: 'workdays',
      status: 'RUNNING',
      fromIso: DASHBOARD_HISTORY_FROM_YMD,
      toIso: daysAgoYmd(1),
      page: 1,
      pageSize: DASHBOARD_OPEN_WORKDAYS_PAGE_SIZE,
      forceRefresh: options.forceRefresh === true,
    })
  }

  async function dashboardLoadFastRows(orgId, options = {}) {
    const rangeTo = todayYmd()
    const eventsRangeTo = calendarAddDays(rangeTo, 1)
    const systemIssueEventsFrom = dashboardSystemIssueRangeFrom()
    const fastEventsFrom = daysAgoYmd(DASHBOARD_COMMENT_SYNC_LOOKBACK_DAYS)
    const forceRefresh = options.forceRefresh === true
    const [todayActive, systemIssueEvents, recentEvents, todayEvents, todayWorkdays, openHistoricalWorkdays] = await Promise.all([
      getTodayActiveWorkers(orgId, { forceRefresh }),
      getWorkdays(orgId, {
        source: 'events',
        fromIso: systemIssueEventsFrom,
        toIso: eventsRangeTo,
        page: 1,
        pageSize: DASHBOARD_RANGE_READ_MAX_ROWS,
        forceRefresh,
      }),
      getWorkdays(orgId, {
        source: 'events',
        fromIso: fastEventsFrom,
        toIso: eventsRangeTo,
        page: 1,
        pageSize: DASHBOARD_DAY_READ_MAX_ROWS,
        forceRefresh,
      }),
      getWorkdays(orgId, {
        source: 'events',
        fromIso: rangeTo,
        toIso: eventsRangeTo,
        page: 1,
        pageSize: DASHBOARD_DAY_READ_MAX_ROWS,
        forceRefresh,
      }),
      getWorkdays(orgId, {
        source: 'workdays',
        fromIso: rangeTo,
        toIso: rangeTo,
        page: 1,
        pageSize: DASHBOARD_DAY_READ_MAX_ROWS,
        forceRefresh,
      }),
      dashboardLoadHistoricalOpenWorkdays(orgId, { forceRefresh }),
    ])

    dashboardAssertCompleteReadResponses([
      { label: 'zdarzenia wymagajace reakcji', response: systemIssueEvents },
      { label: 'ostatnie zdarzenia', response: recentEvents },
      { label: 'dzisiejsze zdarzenia', response: todayEvents },
      { label: 'dzisiejsze dni pracy', response: todayWorkdays },
      { label: 'historyczne otwarte dni pracy', response: openHistoricalWorkdays },
    ])

    const todayEventIds = new Set(
      (todayEvents.items ?? [])
        .map((row) => normalizeSearchText(row?.eventId ?? row?.id))
        .filter(Boolean),
    )
    const historicalOpenServiceRows = (systemIssueEvents.items ?? []).filter((row) => {
      const eventId = normalizeSearchText(row?.eventId ?? row?.id)
      const persistedEventType = String(row?.eventType ?? row?.event_type ?? '')
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, '_')
      return (
        dashboardServiceIsExplicitEvent(row) &&
        (!eventId || !todayEventIds.has(eventId)) &&
        Boolean(toIso(row?.startAt)) &&
        !toIso(row?.endAt) &&
        normalizeEventStatus(row?.status, false) === 'RUNNING' &&
        (persistedEventType === 'CLEAN' || persistedEventType.startsWith('CLEAN_'))
      )
    })
    const todayStartSourceRows = [
      ...(todayEvents.items ?? []),
      ...(todayWorkdays.items ?? []),
      ...historicalOpenServiceRows,
    ]
    appState.dashboardScheduleSourceRows = todayStartSourceRows
    appState.dashboardActivityWorkdayRows = Array.isArray(todayWorkdays.items) ? todayWorkdays.items : []
    const todayRows = dashboardApplyFirstQrStartToday(todayActive.items ?? [], todayWorkdays.items ?? [])

    return { todayRows, recentEvents, systemIssueEvents, todayWorkdays, openHistoricalWorkdays }
  }

  async function dashboardSyncCalendarOrdersForTimeline(options = {}) {
    if (typeof ordersSyncRemoteTimelineOrders !== 'function') {
      appState.dashboardOverviewPlannedOrdersSyncError = false
      return ordersListSourceOrders()
    }

    try {
      const orders = await ordersSyncRemoteTimelineOrders({
        render: false,
        forceRefresh: options.forceRefresh === true,
      })
      appState.dashboardOverviewPlannedOrdersSyncError = false
      return orders
    } catch (error) {
      appState.dashboardOverviewPlannedOrdersSyncError = true
      appState.dashboardOverviewPlannedOrdersError = true
      console.warn('[portal/dashboard] schedule orders refresh failed', error)
      return ordersListSourceOrders()
    }
  }

  async function dashboardSyncCalendarTimelineInputs(options = {}) {
    const orgId = String(appState.session?.orgId ?? '').trim()
    const forceRefresh = options.forceRefresh === true
    const loaders = [
      dashboardSyncCalendarOrdersForTimeline({ forceRefresh }),
    ]

    const shouldRefreshWorkers =
      Boolean(orgId) &&
      typeof getWorkers === 'function' &&
      (forceRefresh || !appState.workersLoaded || !Array.isArray(appState.workers) || !appState.workers.length)

    if (shouldRefreshWorkers) {
      loaders.push(
        getWorkers(orgId, {
          forceRefresh,
          fetchPolicy: forceRefresh ? 'SERVER_ONLY' : undefined,
        })
          .then((workers) => {
            if (String(appState.session?.orgId ?? '').trim() !== orgId) {
              return []
            }
            const rows = Array.isArray(workers) ? workers : []
            appState.workers = rows
            appState.workerTimeRows = rows
            appState.workersLoaded = true
            setSubwelcomeMetric('#view-workerTime .subwelcome', rows.length)
            setSubwelcomeMetric('#view-workerProfile .subwelcome', rows.length)
            return rows
          })
          .catch((error) => {
            console.warn('[portal/dashboard] worker timeline preload failed', error)
            return []
          }),
      )
    }

    await Promise.allSettled(loaders)
    return ordersListSourceOrders()
  }

  async function dashboardRefreshBackgroundData(orgId, options = {}) {
    const activeOrgId = String(appState.session?.orgId ?? '').trim()
    if (!orgId || orgId !== activeOrgId) {
      return
    }

    const rangeFrom = dashboardCommentSyncRangeFrom(orgId, { forceFull: options.forceFull === true })
    const systemIssueRangeFrom = dashboardSystemIssueRangeFrom()
    const rangeTo = todayYmd()
    const eventsRangeTo = calendarAddDays(rangeTo, 1)
    let fetchFailed = false
    const [recentEvents, systemIssueEvents, openHistoricalWorkdays] = await Promise.all([
      getWorkdays(orgId, {
        source: 'events',
        fromIso: rangeFrom,
        toIso: eventsRangeTo,
        page: 1,
        pageSize: DASHBOARD_RANGE_READ_MAX_ROWS,
      }).catch((error) => {
        fetchFailed = true
        console.warn('[portal/dashboard] comment sync fetch failed', error)
        return { items: [] }
      }),
      getWorkdays(orgId, {
        source: 'events',
        fromIso: systemIssueRangeFrom,
        toIso: eventsRangeTo,
        page: 1,
        pageSize: DASHBOARD_RANGE_READ_MAX_ROWS,
        forceRefresh: options.forceRefresh === true,
      }).catch((error) => {
        fetchFailed = true
        console.warn('[portal/dashboard] system issue fetch failed', error)
        return { items: [] }
      }),
      dashboardLoadHistoricalOpenWorkdays(orgId, { forceRefresh: options.forceRefresh === true }),
    ])

    try {
      dashboardAssertCompleteReadResponses([
        { label: 'komentarze', response: recentEvents },
        { label: 'zdarzenia wymagajace reakcji', response: systemIssueEvents },
        { label: 'historyczne otwarte dni pracy', response: openHistoricalWorkdays },
      ])
    } catch (error) {
      fetchFailed = true
      console.warn('[portal/dashboard] incomplete background data ignored', error)
    }

    if (String(appState.session?.orgId ?? '').trim() !== orgId) {
      return
    }
    if (fetchFailed) {
      appState.dashboardBackgroundDataLoaded = false
      return
    }

    const summary = dashboardBuildSummary(
      appState.dashboardTodayRows,
      systemIssueEvents.items ?? [],
      dashboardBuildPeriodHourValues(appState.dashboardTodayRows),
      openHistoricalWorkdays.items ?? [],
    )
    const dashboardComments = dashboardBuildNewComments(recentEvents.items ?? [], [])
    renderDashboardSummary(summary)
    dashboardSyncCommentTasks(dashboardComments)
    renderDashboardKanbanTasks()
    renderDashboardNewComments(dashboardComments)
    dashboardWriteLocalSnapshot(orgId, {
      summary,
      todayRows: appState.dashboardTodayRows,
      activityWorkdayRows: appState.dashboardActivityWorkdayRows,
      scheduleSourceRows: appState.dashboardScheduleSourceRows,
      comments: dashboardComments,
    })
    dashboardWriteCommentSyncState(orgId, {
      lastSyncedAt: new Date().toISOString(),
      lastSyncedDay: rangeTo,
      lastRangeFrom: rangeFrom,
      lastCount: Array.isArray(recentEvents.items) ? recentEvents.items.length : 0,
    })
    appState.dashboardBackgroundDataLoaded = true
  }

  function dashboardStartBackgroundDataRefresh(orgId, options = {}) {
    const activeOrgId = String(orgId ?? appState.session?.orgId ?? '').trim()
    if (!activeOrgId) {
      return null
    }

    if (appState.dashboardBackgroundDataLoaded && !options.force) {
      return null
    }

    if (dashboardBackgroundRefreshPromise) {
      return dashboardBackgroundRefreshPromise
    }

    dashboardBackgroundRefreshPromise = dashboardRefreshBackgroundData(activeOrgId, options)
      .catch((error) => {
        console.warn('[portal/dashboard] background data refresh failed', error)
      })
      .finally(() => {
        dashboardBackgroundRefreshPromise = null
      })
    return dashboardBackgroundRefreshPromise
  }

  function dashboardStartReferencePreload(orgId) {
    const activeOrgId = String(orgId ?? appState.session?.orgId ?? '').trim()
    if (!activeOrgId) {
      return null
    }

    if (dashboardReferencePreloadPromise) {
      return dashboardReferencePreloadPromise
    }

    const loaders = []
    if (!appState.clientsLoaded) {
      loaders.push(
        getClients(activeOrgId).then((clients) => {
          if (String(appState.session?.orgId ?? '').trim() !== activeOrgId) return
          appState.clients = clients
          appState.clientsLoaded = true
          setSubwelcomeMetric('#view-clientProfile .subwelcome', clients.length)
          fillClientsCoordinatorSelect()
          fillClientProfileCoordinatorOptions()
        }),
      )
    }
    if (!appState.workersLoaded) {
      loaders.push(
        getWorkers(activeOrgId).then((workers) => {
          if (String(appState.session?.orgId ?? '').trim() !== activeOrgId) return
          appState.workers = workers
          appState.workersLoaded = true
          appState.workerTimeRows = workers
          setSubwelcomeMetric('#view-workerTime .subwelcome', workers.length)
          setSubwelcomeMetric('#view-workerProfile .subwelcome', workers.length)
          dashboardWriteLocalSnapshot(activeOrgId, { workers })
          if (appState.currentRoute === 'dashboard') {
            renderDashboardActivityCalendar(appState.dashboardTodayRows)
          }
        }),
      )
    }
    if (!appState.zonesLoaded) {
      loaders.push(
        getZones(activeOrgId).then((zones) => {
          if (String(appState.session?.orgId ?? '').trim() !== activeOrgId) return
          appState.zones = zones
          appState.zonesLoaded = true
          setSubwelcomeMetric('#view-zones .subwelcome', zones.length)
        }),
      )
    }

    if (!loaders.length) {
      return null
    }

    dashboardReferencePreloadPromise = Promise.allSettled(loaders)
      .catch(() => {})
      .finally(() => {
        dashboardReferencePreloadPromise = null
      })
    return dashboardReferencePreloadPromise
  }

  function runDashboardPostLoadWork(callback, delayMs = DASHBOARD_POST_LOAD_DELAY_MS) {
    if (typeof window === 'undefined') {
      callback()
      return
    }

    window.setTimeout(() => {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(callback, { timeout: 5000 })
        return
      }

      window.setTimeout(callback, 0)
    }, Math.max(0, Number(delayMs) || 0))
  }

  function dashboardStartPostLoadRefresh(orgId, options = {}) {
    const activeOrgId = String(orgId ?? appState.session?.orgId ?? '').trim()
    if (!activeOrgId) {
      return
    }

    const shouldRefreshBackground = options.backgroundData === true
    const shouldPreloadReferences = options.preloadReferences !== false
    const shouldSyncTasks = options.syncTasks === true
    runDashboardPostLoadWork(() => {
      if (String(appState.session?.orgId ?? '').trim() !== activeOrgId) {
        return
      }

      if (shouldRefreshBackground) {
        dashboardStartBackgroundDataRefresh(activeOrgId)
      }
      if (shouldPreloadReferences) {
        dashboardStartReferencePreload(activeOrgId)
      }
      if (shouldSyncTasks) {
        void calendarSyncRemoteTasks({ render: true }).catch((error) => {
          console.warn('[portal/tasks] background sync failed', error)
        })
      }
    })
  }

  function dashboardEnsureTaskDataForRoute(routeName, renderAfterLoad, options = {}) {
    const activeOrgId = String(appState.session?.orgId ?? '').trim()
    if (!activeOrgId) {
      return Promise.resolve()
    }
    const isKanbanRoute = routeName === 'kanban'

    const renderIfStillCurrent = () => {
      if (appState.currentRoute === routeName && typeof renderAfterLoad === 'function') {
        renderAfterLoad()
      }
    }

    if (options.renderInitial !== false) {
      renderIfStillCurrent()
    }
    if (isKanbanRoute) {
      kanbanSetDataLoading(true, appState.calendarRemoteTasksLoaded ? 'Dociągam komentarze pracowników...' : 'Synchronizuję zadania...')
    }

    const remoteTaskPromise = appState.calendarRemoteTasksLoaded
      ? Promise.resolve(appState.calendarTasks)
      : calendarSyncRemoteTasks({ render: options.renderRemote !== false })
  
    const routeTaskPromise = Promise.resolve(remoteTaskPromise)
      .catch((error) => {
        console.warn('[portal/tasks] remote task refresh failed', error)
      })
      .finally(() => {
        if (options.renderAfterLoad !== false) {
          renderIfStillCurrent()
        }
        if (isKanbanRoute && !dashboardBackgroundRefreshPromise) {
          kanbanSetDataLoading(false)
        }
      })

    runDashboardPostLoadWork(() => {
      if (String(appState.session?.orgId ?? '').trim() !== activeOrgId) {
        return
      }
      if (isKanbanRoute) {
        kanbanSetDataLoading(true, 'Dociągam komentarze pracowników...')
      }
      const backgroundPromise = dashboardStartBackgroundDataRefresh(activeOrgId)
      if (!backgroundPromise) {
        if (isKanbanRoute) {
          kanbanSetDataLoading(false)
        }
        return
      }
      Promise.resolve(backgroundPromise)
        .catch((error) => {
          console.warn('[portal/tasks] route background task refresh failed', error)
        })
        .finally(() => {
          renderIfStillCurrent()
          if (isKanbanRoute) {
            kanbanSetDataLoading(false)
          }
        })
    }, 450)

    return routeTaskPromise
  }

  function deferRouteTaskDataRefresh(routeName, renderAfterLoad, options = {}) {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      return dashboardEnsureTaskDataForRoute(routeName, renderAfterLoad, options)
    }

    return new Promise((resolve) => {
      window.requestAnimationFrame(() => {
        resolve(dashboardEnsureTaskDataForRoute(routeName, renderAfterLoad, options))
      })
    })
  }

  async function refreshDashboardWidgets(options = {}) {
    if (!appState.session?.orgId) {
      return
    }

    if (dashboardWidgetsRefreshPromise) {
      return dashboardWidgetsRefreshPromise
    }

    dashboardWidgetsRefreshPromise = (async () => {
      const orgId = String(appState.session.orgId)
      const showLoadingOverlay = options.showLoadingOverlay !== false
      let fastRows = null
      let initialDashboardRenderFinished = false
      const scheduleSyncPromise = dashboardSyncCalendarTimelineInputs({
        forceRefresh: options.forceRefresh === true,
      })
        .catch((error) => {
          console.warn('[portal/dashboard] non-blocking schedule sync failed', error)
        })
        .finally(() => {
          if (
            !initialDashboardRenderFinished ||
            !fastRows ||
            String(appState.session?.orgId ?? '').trim() !== orgId ||
            appState.currentRoute !== 'dashboard'
          ) {
            return
          }

          const refreshedSummary = dashboardBuildSummary(
            fastRows.todayRows,
            fastRows.systemIssueEvents.items ?? [],
            dashboardBuildPeriodHourValues(fastRows.todayRows),
            fastRows.openHistoricalWorkdays.items ?? [],
          )
          renderDashboardSummary(refreshedSummary, fastRows.todayRows)
          dashboardWriteLocalSnapshot(orgId, {
            summary: refreshedSummary,
            todayRows: fastRows.todayRows,
            activityWorkdayRows: appState.dashboardActivityWorkdayRows,
            scheduleSourceRows: appState.dashboardScheduleSourceRows,
          })
        })
      if (showLoadingOverlay) {
        dashboardBeginLoading()
      }
      try {
        const [loadedFastRows] = await Promise.all([
          dashboardLoadFastRows(orgId, {
            forceRefresh: options.forceRefresh === true,
          }),
          dashboardRefreshStopProposalAttention(orgId, {
            forceRefresh: options.forceRefresh === true,
          }),
        ])
        fastRows = loadedFastRows
        const { todayRows, recentEvents, systemIssueEvents, openHistoricalWorkdays } = fastRows
        const summary = dashboardBuildSummary(
          todayRows,
          systemIssueEvents.items ?? [],
          dashboardBuildPeriodHourValues(todayRows),
          openHistoricalWorkdays.items ?? [],
        )
        const comments = dashboardBuildNewComments(recentEvents.items ?? [], [])
        renderDashboardSummary(summary, todayRows)
        await dashboardRevealLoadingStage('overview')
        renderDashboardKanbanTasks()
        renderDashboardNewComments(comments)
        renderDashboardEvents(todayRows)
        await dashboardRevealLoadingStage('active')
        setDashboardLastRefresh(new Date())
        void rememberDashboardTimelineFingerprint(orgId)
        dashboardWriteLocalSnapshot(orgId, {
          summary,
          todayRows,
          activityWorkdayRows: appState.dashboardActivityWorkdayRows,
          scheduleSourceRows: appState.dashboardScheduleSourceRows,
          comments,
        })
        initialDashboardRenderFinished = true
      } finally {
        if (showLoadingOverlay) {
          dashboardEndLoading()
        }
      }

      void scheduleSyncPromise
      dashboardStartPostLoadRefresh(orgId, {
        preloadReferences: options.preloadReferences !== false,
        backgroundData: options.backgroundData === true,
        syncTasks: options.syncTasks === true,
      })
    })().finally(() => {
      dashboardWidgetsRefreshPromise = null
    })

    return dashboardWidgetsRefreshPromise
  }

  function setDashboardLastRefresh(dateValue) {
    const refreshIso = toIso(dateValue)
    const refreshNode = document.getElementById('dashLastRefresh')
    if (!refreshNode) {
      return
    }
    refreshNode.textContent = refreshIso
      ? `Ostatnie odświeżenie: ${formatDatePl(refreshIso)} ${formatTime(refreshIso)}`
      : 'Ostatnie odświeżenie: -'
  }

  function canAutoRefreshDashboard() {
    if (!appState.session?.orgId) {
      return false
    }

    if (document.visibilityState !== 'visible') {
      return false
    }

    return appState.currentRoute === 'dashboard'
  }

  function triggerDashboardRefreshIfAllowed() {
    if (!canAutoRefreshDashboard()) {
      return
    }

    void refreshDashboardWidgets().catch(() => {})
  }

  function dashboardTimelineFingerprintRange(dayKey = todayYmd()) {
    const normalizedDay = dashboardActivityDayKey(dayKey || todayYmd())
    const rangeStart = new Date(`${normalizedDay}T00:00:00`)
    const rangeEnd = new Date(`${normalizedDay}T23:59:59.999`)
    if (!Number.isFinite(rangeStart.getTime()) || !Number.isFinite(rangeEnd.getTime())) {
      return null
    }

    return {
      source: 'events',
      fromIso: rangeStart.toISOString(),
      toIso: rangeEnd.toISOString(),
      page: 1,
      pageSize: 1,
    }
  }

  async function readDashboardTimelineFingerprintToken(orgId = appState.session?.orgId) {
    const activeOrgId = String(orgId ?? '').trim()
    if (!activeOrgId || typeof getEventsFingerprintForOrg !== 'function') {
      return ''
    }

    const filters = dashboardTimelineFingerprintRange(todayYmd())
    if (!filters) {
      return ''
    }

    if (dashboardTimelineFingerprintPromise) {
      return dashboardTimelineFingerprintPromise
    }

    dashboardTimelineFingerprintPromise = getEventsFingerprintForOrg(activeOrgId, filters)
      .then((fingerprint) => String(fingerprint?.token ?? '').trim())
      .finally(() => {
        dashboardTimelineFingerprintPromise = null
      })
    return dashboardTimelineFingerprintPromise
  }

  async function rememberDashboardTimelineFingerprint(orgId = appState.session?.orgId) {
    try {
      const token = await readDashboardTimelineFingerprintToken(orgId)
      if (token) {
        dashboardTimelineFingerprintToken = token
      }
    } catch (error) {
      console.warn('[portal/dashboard] timeline fingerprint snapshot failed', error)
    }
  }

  async function refreshDashboardTimelineIfChanged() {
    if (!canAutoRefreshDashboard()) {
      return
    }

    let token = ''
    try {
      token = await readDashboardTimelineFingerprintToken()
    } catch (error) {
      console.warn('[portal/dashboard] timeline fingerprint polling failed', error)
      return
    }

    if (!token) {
      return
    }

    if (!dashboardTimelineFingerprintToken) {
      dashboardTimelineFingerprintToken = token
      return
    }

    if (dashboardTimelineFingerprintToken !== token) {
      dashboardTimelineFingerprintToken = token
      await refreshDashboardWidgets({ forceRefresh: true, syncWorktimeToken: true, showLoadingOverlay: false })
    }
  }

  function dashboardRerenderSimulatedTimeline() {
    if (!canAutoRefreshDashboard()) {
      return
    }

    if (dashboardActivityDayKey(appState.dashboardActivityDay || todayYmd()) !== todayYmd()) {
      return
    }

    renderDashboardActivityCalendar(appState.dashboardTodayRows)
    dashboardApplyActivityView()
    dashboardRenderOperationalServicePanels()
  }

  function dashboardTimelineMillisecondsToNextTick() {
    const now = new Date()
    const next = new Date(now)
    next.setMinutes(
      Math.floor(now.getMinutes() / DASHBOARD_TIMELINE_SNAP_MINUTES) * DASHBOARD_TIMELINE_SNAP_MINUTES + DASHBOARD_TIMELINE_SNAP_MINUTES,
      0,
      0,
    )
    return Math.max(1000, Math.min(DASHBOARD_ACTIVITY_SIMULATION_INTERVAL_MS, next.getTime() - now.getTime()))
  }

  function dashboardEventSavePatchMatcher(updatedItem = null, previousItem = null) {
    const targetIds = new Set(
      [...dashboardEventIdentityCandidateIds(updatedItem || {}), ...dashboardEventIdentityCandidateIds(previousItem || {})]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean),
    )
    const previousFingerprint = dashboardEventRowFingerprintKey(previousItem || {})
    const previousStart = toIso(previousItem?.startAt ?? previousItem?.dayStartAt)
    const previousEnd = toIso(previousItem?.endAt ?? previousItem?.dayEndAt)
    const previousWorker = normalizeSearchText(previousItem?.workerLogin || previousItem?.workerName)

    return (row = {}) => {
      const rowIds = dashboardEventIdentityCandidateIds(row)
      if (rowIds.some((id) => targetIds.has(id))) {
        return true
      }

      if (previousFingerprint && dashboardEventRowFingerprintKey(row) === previousFingerprint) {
        return true
      }

      if (!previousWorker || !previousStart) {
        return false
      }

      const rowWorker = normalizeSearchText(row?.workerLogin || row?.workerName)
      if (rowWorker !== previousWorker) {
        return false
      }

      const rowStart = toIso(row?.startAt ?? row?.dayStartAt)
      const rowEnd = toIso(row?.endAt ?? row?.dayEndAt)
      return rowStart === previousStart && (!previousEnd || rowEnd === previousEnd)
    }
  }

  function dashboardBuildEventSavePatch(updatedItem = {}, previousItem = {}) {
    const startAt = toIso(updatedItem?.startAt ?? updatedItem?.dayStartAt ?? previousItem?.startAt ?? previousItem?.dayStartAt)
    const endAt = toIso(updatedItem?.endAt ?? updatedItem?.dayEndAt ?? '')
    const rawDurationSec = Number(updatedItem?.durationSec)
    const inferredDurationSec = startAt && endAt
      ? Math.max(0, Math.floor((new Date(endAt).getTime() - new Date(startAt).getTime()) / 1000))
      : 0
    const durationSec = Number.isFinite(rawDurationSec) && rawDurationSec > 0
      ? Math.floor(rawDurationSec)
      : inferredDurationSec
    const status = normalizeEventStatus(updatedItem?.status ?? previousItem?.status, Boolean(endAt))
    const dayKey = dashboardResolveDayKey({ startAt, endAt }, dashboardResolveDayKey(previousItem, appState.dashboardActivityDay || todayYmd()))
    const patch = {
      ...updatedItem,
      startAt,
      dayStartAt: startAt,
      endAt: endAt || null,
      dayEndAt: endAt || null,
      closeMarkedAt: endAt || null,
      durationSec,
      duration: durationSecondsToHm(durationSec),
      status,
      state: status,
      dayKey,
    }

    if (startAt) {
      const startLabel = calendarTimelineShortTimeLabel(startAt)
      patch.qrStart = startLabel
      patch.start = startLabel
    }

    if (endAt) {
      const stopLabel = calendarTimelineShortTimeLabel(endAt)
      patch.qrStop = stopLabel
      patch.stop = stopLabel
    } else {
      patch.qrStop = ''
      patch.stop = ''
    }

    return patch
  }

  function dashboardPatchEventRows(rows = [], matcher, patch, previousItem = {}) {
    let changed = false
    const nextRows = (Array.isArray(rows) ? rows : []).map((row) => {
      if (!matcher(row)) {
        return row
      }
      changed = true
      return {
        ...row,
        ...patch,
        id: row?.id ?? previousItem?.id ?? patch?.id,
        eventId: row?.eventId ?? previousItem?.eventId ?? patch?.eventId,
        workdayId: row?.workdayId ?? previousItem?.workdayId ?? patch?.workdayId,
        linkedWorkdayId: row?.linkedWorkdayId ?? previousItem?.linkedWorkdayId ?? patch?.linkedWorkdayId,
        startEventId: row?.startEventId ?? previousItem?.startEventId ?? patch?.startEventId,
        endEventId: row?.endEventId ?? previousItem?.endEventId ?? patch?.endEventId,
      }
    })
    return { rows: nextRows, changed }
  }

  function dashboardApplyEventSavePatch(updatedItem = null, previousItem = null) {
    if (!updatedItem && !previousItem) {
      return false
    }

    const matcher = dashboardEventSavePatchMatcher(updatedItem, previousItem)
    const patch = dashboardBuildEventSavePatch(updatedItem || {}, previousItem || {})
    let changed = false
    const apply = (key) => {
      const result = dashboardPatchEventRows(appState[key], matcher, patch, previousItem || {})
      if (result.changed) {
        appState[key] = result.rows
        changed = true
      }
    }

    apply('dashboardTodayRows')
    apply('dashboardActivityWorkdayRows')
    apply('dashboardScheduleSourceRows')
    apply('dashboardActivityDayRows')
    apply('dashboardActivityDaySourceRows')

    if (changed && appState.currentRoute === 'dashboard') {
      renderDashboardEvents(appState.dashboardTodayRows)
      dashboardApplyActivityView()
      dashboardRenderOperationalServicePanels()
      setDashboardLastRefresh(new Date())
    }

    return changed
  }

  function scheduleDashboardRefreshAfterEventSave(dayKey = '', updatedItem = null, previousItem = null, options = {}) {
    const normalizedDay = dashboardActivityDayKey(dayKey || appState.dashboardActivityDay || todayYmd())
    const keepSpinner = options.keepSpinner === true
    const finishSpinner = () => {
      if (keepSpinner) {
        dashboardEndLoading()
      }
    }
    window.setTimeout(() => {
      if (!appState.session?.orgId || appState.currentRoute !== 'dashboard') {
        finishSpinner()
        return
      }
      if (normalizedDay === todayYmd()) {
        void refreshDashboardWidgets({ forceRefresh: true })
          .then(() => {
            dashboardApplyEventSavePatch(updatedItem, previousItem)
          })
          .catch((error) => {
            console.warn('[portal/dashboard] delayed event-save refresh failed', error)
          })
          .finally(finishSpinner)
        return
      }
      if (dashboardActivityDayKey(appState.dashboardActivityDay) === normalizedDay) {
        void dashboardLoadActivityDay(normalizedDay, { forceRefresh: true })
          .then(() => {
            dashboardApplyEventSavePatch(updatedItem, previousItem)
          })
          .catch((error) => {
            console.warn('[portal/dashboard] delayed activity-day refresh failed', error)
          })
          .finally(finishSpinner)
        return
      }
      finishSpinner()
    }, 2000)
  }

  async function refreshDashboardAfterEventSave(updatedItem = null, previousItem = null, options = {}) {
    const dayKey = dashboardResolveDayKey(updatedItem, dashboardResolveDayKey(previousItem, appState.dashboardActivityDay || todayYmd()))
    dashboardApplyEventSavePatch(updatedItem, previousItem)
    if (dayKey === todayYmd()) {
      scheduleDashboardRefreshAfterEventSave(dayKey, updatedItem, previousItem, options)
      return
    }

    if (appState.currentRoute === 'dashboard' && dashboardActivityDayKey(appState.dashboardActivityDay) === dayKey) {
      renderDashboardActivityCalendar(appState.dashboardTodayRows)
      dashboardApplyActivityView()
      setDashboardLastRefresh(new Date())
    }
    scheduleDashboardRefreshAfterEventSave(dayKey, updatedItem, previousItem, options)
  }

  function stopDashboardAutoRefresh() {
    if (dashboardChangePollTimer) {
      window.clearInterval(dashboardChangePollTimer)
      dashboardChangePollTimer = null
    }
    if (dashboardActivitySimulationTimer) {
      window.clearTimeout(dashboardActivitySimulationTimer)
      dashboardActivitySimulationTimer = 0
    }
  }

  function scheduleDashboardActivitySimulationTick() {
    if (dashboardActivitySimulationTimer) {
      window.clearTimeout(dashboardActivitySimulationTimer)
      dashboardActivitySimulationTimer = 0
    }

    dashboardActivitySimulationTimer = window.setTimeout(() => {
      dashboardActivitySimulationTimer = 0
      dashboardRerenderSimulatedTimeline()
      scheduleDashboardActivitySimulationTick()
    }, dashboardTimelineMillisecondsToNextTick())
  }

  function startDashboardAutoRefresh() {
    stopDashboardAutoRefresh()
    scheduleDashboardActivitySimulationTick()
    dashboardChangePollTimer = window.setInterval(() => {
      void refreshDashboardTimelineIfChanged().catch(() => {})
    }, DASHBOARD_CHANGE_POLL_INTERVAL_MS)
  }

  function bindDashboardViewFunctions() {
    const binding = createBindingHelpers()
    const cleanupDashboardTableResize = () => {}
    dashboardMountCommandCenterPanels()

    // Dashboard active list uses fixed responsive layout, not column drag-resize.
    const dashboardEventsRoot = document.querySelector('#view-dashboard .dash-events')
    const dashboardEventsHead = document.querySelector('#view-dashboard .dash-events-head')
    if (dashboardEventsRoot instanceof HTMLElement) {
      dashboardEventsRoot.classList.remove('resizable-grid-table')
      dashboardEventsRoot.style.removeProperty('--dash-events-grid')
    }
    if (dashboardEventsHead instanceof HTMLElement) {
      dashboardEventsHead.classList.remove('grid-resizable-head')
      dashboardEventsHead.querySelectorAll('.grid-resize-handle').forEach((node) => node.remove())
    }

    appState.dashboardActivityDay = dashboardActivityDayKey(todayYmd())
    appState.dashboardActivityView = dashboardReadActivityViewPreference()
    dashboardSetActivityView(appState.dashboardActivityView, { persist: false })
    const commandCenterMounted = document.getElementById('dashCommandCenter') instanceof HTMLElement
    Object.entries(DASHBOARD_INSIGHT_PANEL_CONFIG).forEach(([panelKey, config]) => {
      dashboardSetInsightPanelCollapsed(
        panelKey,
        commandCenterMounted ? false : dashboardReadInsightPanelCollapsed(panelKey),
        {
        persist: false,
        },
      )
      binding.add(document.getElementById(config.buttonId), 'click', () => {
        const card = document.getElementById(config.cardId)
        dashboardSetInsightPanelCollapsed(panelKey, !card?.classList.contains('is-collapsed'))
      })
    })
    binding.add(document.getElementById('dashActiveWorkersLocationList'), 'click', (event) => {
      const button = event.target?.closest?.('[data-dash-active-worker-map-key]')
      if (!button) {
        return
      }
      dashboardFocusActiveWorkerMapMarker(button.getAttribute('data-dash-active-worker-map-key'))
    })

    binding.add(document.getElementById('dashActiveWorkersMapExpand'), 'click', (event) => {
      dashboardOpenActiveWorkerMapDialog(event.currentTarget)
    })

    binding.add(document.getElementById('dashCommandFiltersBtn'), 'click', (event) => {
      event.stopPropagation()
      const panel = document.getElementById('dashCommandFiltersPanel')
      const button = event.currentTarget
      if (!(panel instanceof HTMLElement) || !(button instanceof HTMLButtonElement)) {
        return
      }
      const nextOpen = panel.hidden
      panel.hidden = !nextOpen
      button.setAttribute('aria-expanded', nextOpen ? 'true' : 'false')
    })

    document.querySelectorAll('[data-command-map-filter]').forEach((checkbox) => {
      binding.add(checkbox, 'change', () => {
        dashboardApplyCommandCenterMapFilters()
        dashboardCenterCommandMap()
      })
    })

    binding.add(document.getElementById('dashCommandViewBtn'), 'click', () => {
      const commandCenter = document.getElementById('dashCommandCenter')
      dashboardSetCommandCenterListView(!commandCenter?.classList.contains('is-list-view'))
    })

    binding.add(document.getElementById('dashCommandLegendBtn'), 'click', (event) => {
      const legend = document.getElementById('dashCommandLegend')
      const button = event.currentTarget
      if (!(legend instanceof HTMLElement) || !(button instanceof HTMLButtonElement)) {
        return
      }
      const nextOpen = legend.hidden
      legend.hidden = !nextOpen
      button.setAttribute('aria-expanded', nextOpen ? 'true' : 'false')
    })

    binding.add(document.getElementById('dashCommandLocateBtn'), 'click', () => {
      dashboardCenterCommandMap()
    })

    binding.add(document.getElementById('dashCommandDetailsBtn'), 'click', (event) => {
      const panel = document.getElementById('dashCommandDetailsPanel')
      const button = event.currentTarget
      if (!(panel instanceof HTMLElement) || !(button instanceof HTMLButtonElement)) {
        return
      }
      const nextOpen = panel.hidden
      panel.hidden = !nextOpen
      button.setAttribute('aria-expanded', nextOpen ? 'true' : 'false')
      const label = button.firstChild
      if (label?.nodeType === Node.TEXT_NODE) {
        label.textContent = nextOpen ? ' Ukryj ' : ' Szczegóły '
      }
      if (nextOpen) {
        window.requestAnimationFrame(() => panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
      }
    })

    binding.add(document, 'click', (event) => {
      const target = event.target
      const filters = document.getElementById('dashCommandFiltersPanel')
      const filtersButton = document.getElementById('dashCommandFiltersBtn')
      if (
        target instanceof Node &&
        filters instanceof HTMLElement &&
        !filters.hidden &&
        !filters.contains(target) &&
        !filtersButton?.contains(target)
      ) {
        filters.hidden = true
        filtersButton?.setAttribute('aria-expanded', 'false')
      }
    })

    binding.add(document.getElementById('dashActiveWorkersMap'), 'keydown', (event) => {
      if ((event.key !== 'Enter' && event.key !== ' ') || dashboardActiveWorkerMapDialogIsOpen()) {
        return
      }
      if (event.target !== event.currentTarget) {
        return
      }
      event.preventDefault()
      dashboardOpenActiveWorkerMapDialog(event.currentTarget)
    })

    binding.add(document.getElementById('dashActiveWorkersMapClose'), 'click', () => {
      dashboardCloseActiveWorkerMapDialog()
    })

    binding.add(document.getElementById('dashActiveWorkersMapOverlay'), 'click', (event) => {
      if (event.target === event.currentTarget) {
        dashboardCloseActiveWorkerMapDialog()
      }
    })

    binding.add(document.getElementById('dashActiveWorkersMapOverlay'), 'keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        dashboardCloseActiveWorkerMapDialog()
        return
      }
      dashboardTrapActiveWorkerMapDialogFocus(event)
    })

    binding.add(document.getElementById('dashCommandAllOperations'), 'click', (event) => {
      dashboardOpenOperationsDialog(event.currentTarget)
    })

    binding.add(document.getElementById('dashCommandOperationsClose'), 'click', () => {
      dashboardCloseOperationsDialog()
    })

    binding.add(document.getElementById('dashCommandOperationsOverlay'), 'click', (event) => {
      if (event.target === event.currentTarget) {
        dashboardCloseOperationsDialog()
      }
    })

    binding.add(document.getElementById('dashCommandOperationsOverlay'), 'keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        dashboardCloseOperationsDialog()
        return
      }
      dashboardTrapOperationsDialogFocus(event)
    })

    ;['dashServiceProgressList', 'dashCommandAllOperationsList'].forEach((listId) => {
      binding.add(document.getElementById(listId), 'click', (event) => {
        const button = event.target?.closest?.('[data-dashboard-operation-task-id]')
        const taskId = String(button?.getAttribute?.('data-dashboard-operation-task-id') ?? '').trim()
        if (!taskId) {
          return
        }
        dashboardCloseOperationsDialog({ restoreFocus: false })
        kanbanOpenCalendarTask(taskId)
      })
    })

    binding.add(document.getElementById('dashRefreshBtn'), 'click', (event) => {
      void (async () => {
        if (!appState.session?.orgId) {
          return
        }

        const button =
          event.currentTarget instanceof HTMLButtonElement ? event.currentTarget : document.getElementById('dashRefreshBtn')
        if (!button || button.disabled) {
          return
        }

        button.disabled = true
        button.classList.add('is-loading')
        button.setAttribute('aria-busy', 'true')

        try {
          await refreshDashboardWidgets({ forceRefresh: true, syncWorktimeToken: true })
          showTransientNotice('Dane pulpitu zostały pobrane u źródła.')
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Nie udało się odświeżyć pulpitu.'
          showTransientNotice(message, 'error')
        } finally {
          button.disabled = false
          button.classList.remove('is-loading')
          button.setAttribute('aria-busy', 'false')
        }
      })()
    })

    binding.add(document.getElementById('dashActivitySettingsBtn'), 'click', (event) => {
      event.stopPropagation()
      const popover = document.getElementById('dashActivityViewPopover')
      dashboardSetActivitySettingsOpen(Boolean(popover?.hidden))
    })

    binding.add(document.getElementById('dashActivityPrevDayBtn'), 'click', () => {
      dashboardMoveActivityDay(-1)
    })

    binding.add(document.getElementById('dashActivityNextDayBtn'), 'click', () => {
      dashboardMoveActivityDay(1)
    })

    binding.add(document.getElementById('dashActivityTodayBtn'), 'click', () => {
      dashboardSetActivityDay(todayYmd())
    })

    document.querySelectorAll('[data-dash-activity-day-move]').forEach((button) => {
      binding.add(button, 'click', () => {
        dashboardMoveActivityDay(Number(button.getAttribute('data-dash-activity-day-move') || 0))
      })
    })

    document.querySelectorAll('[data-dash-activity-day-control]').forEach((control) => {
      binding.add(control, 'change', () => {
        const value = control instanceof HTMLInputElement ? control.value : control.getAttribute('data-dash-activity-day')
        dashboardSetActivityDay(value || todayYmd())
      })
    })

    binding.add(document.getElementById('dashActivityViewPopover'), 'click', (event) => {
      event.stopPropagation()
      const button = event.target?.closest?.('[data-dash-activity-view]')
      if (!button) {
        return
      }
      dashboardSetActivityView(button.getAttribute('data-dash-activity-view'))
      dashboardSetActivitySettingsOpen(false)
    })

    binding.add(document, 'click', (event) => {
      const target = event.target
      const popover = document.getElementById('dashActivityViewPopover')
      const button = document.getElementById('dashActivitySettingsBtn')
      if (!(target instanceof Node) || !popover || popover.hidden) {
        return
      }
      if (popover.contains(target) || button?.contains(target)) {
        return
      }
      dashboardSetActivitySettingsOpen(false)
    })

    binding.add(document.getElementById('dashCommentsAckAll'), 'click', () => {
      dashboardMarkAllCommentsRead()
    })

    binding.add(document.getElementById('dashCommentsList'), 'click', (event) => {
      const button = event.target?.closest?.('[data-dash-comment-key]')
      if (!button) {
        return
      }
      dashboardMarkCommentRead(button.getAttribute('data-dash-comment-key'))
    })

    binding.add(document.getElementById('dashKanbanTasksList'), 'click', (event) => {
      const button = event.target?.closest?.('[data-dash-kanban-task-id]')
      if (!button) {
        return
      }
      kanbanOpenCalendarTask(button.getAttribute('data-dash-kanban-task-id'))
    })

    binding.add(document.getElementById('dashCommandAlertsList'), 'click', (event) => {
      const button = event.target?.closest?.('[data-dash-alert-action], [data-dash-alert-metric]')
      if (!(button instanceof HTMLElement)) {
        return
      }
      event.preventDefault()
      const action = String(button.getAttribute('data-dash-alert-action') ?? '').trim()
      if (action === 'open-missing-qr-stop-list') {
        void openDashboardMissingQrStopList()
        return
      }
      const metricKey = String(button.getAttribute('data-dash-alert-metric') ?? '').trim()
      if (!metricKey) {
        return
      }
      dashboardTogglePinnedMetricPopover(metricKey, button)
    })


    const metricButtons = [...document.querySelectorAll('[data-dash-metric]')]
    metricButtons.forEach((button) => {
      const metricKey = String(button.getAttribute('data-dash-metric') ?? '').trim()
      const opensList = button.getAttribute('data-dash-metric-view') === 'list'
      if (!metricKey) {
        return
      }

      if (!opensList) {
        binding.add(button, 'mouseenter', () => {
          dashboardShowMetricPopover(metricKey, button)
        })

        binding.add(button, 'focus', () => {
          dashboardShowMetricPopover(metricKey, button)
        })

        binding.add(button, 'mouseleave', (event) => {
          const related = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null
          const popover = document.getElementById('dashMetricPopover')
          if (related && (button.contains(related) || popover?.contains(related))) {
            return
          }
          dashboardScheduleMetricPopoverHide()
        })

        binding.add(button, 'blur', (event) => {
          const related = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null
          const popover = document.getElementById('dashMetricPopover')
          if (related && popover?.contains(related)) {
            return
          }
          dashboardScheduleMetricPopoverHide()
        })
      }

      binding.add(button, 'click', (event) => {
        if (opensList) {
          event.preventDefault()
          dashboardTogglePinnedMetricPopover(metricKey, button)
          return
        }

        const details = dashboardMetricDetailsOrEmpty(metricKey)
        if (!details.length) {
          return
        }
        void openDashboardMetricDetail(metricKey, 0).catch((error) => {
          showTransientNotice(error instanceof Error ? error.message : 'Nie udało się otworzyć rekordu.', 'error')
        })
      })
    })

    binding.add(document.getElementById('dashMetricPopover'), 'mouseenter', () => {
      dashboardCancelMetricPopoverHide()
    })

    binding.add(document.getElementById('dashMetricPopover'), 'mouseleave', (event) => {
      const popover = document.getElementById('dashMetricPopover')
      if (popover?.getAttribute('data-pinned') === 'true') {
        return
      }
      const related = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null
      if (related?.closest?.('[data-dash-metric]')) {
        return
      }
      dashboardScheduleMetricPopoverHide()
    })

    binding.add(document.getElementById('dashMetricPopover'), 'focusin', () => {
      dashboardCancelMetricPopoverHide()
    })

    binding.add(document.getElementById('dashMetricPopover'), 'focusout', (event) => {
      const popover = document.getElementById('dashMetricPopover')
      const related = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null
      if (related && (popover?.contains(related) || related.closest?.('[data-dash-metric]'))) {
        return
      }
      dashboardHideMetricPopover()
    })

    binding.add(document.getElementById('dashMetricPopoverClose'), 'click', () => {
      dashboardHideMetricPopover({ restoreFocus: true })
    })

    binding.add(document.getElementById('dashMetricPopover'), 'keydown', (event) => {
      if (event.key !== 'Tab') {
        return
      }
      const popover = document.getElementById('dashMetricPopover')
      const focusable = [...(popover?.querySelectorAll?.('button:not(:disabled)') ?? [])].filter(
        (node) => node instanceof HTMLElement && node.offsetParent !== null,
      )
      if (!focusable.length) {
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
        return
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    })

    binding.add(document.getElementById('dashMetricPopover'), 'click', (event) => {
      const button = event.target?.closest?.('[data-dash-metric-detail][data-dash-metric-key]')
      if (!button) {
        return
      }

      const metricKey = String(button.getAttribute('data-dash-metric-key') ?? '').trim()
      const detailIndex = Number(button.getAttribute('data-dash-metric-detail'))
      if (!metricKey || !Number.isInteger(detailIndex)) {
        return
      }

      void openDashboardMetricDetail(metricKey, detailIndex).catch((error) => {
        showTransientNotice(error instanceof Error ? error.message : 'Nie udało się otworzyć rekordu.', 'error')
      })
    })

    binding.add(document, 'click', (event) => {
      const target = event.target instanceof Element ? event.target : null
      const popover = document.getElementById('dashMetricPopover')
      if (!target || !popover || popover.style.display === 'none') {
        return
      }
      if (popover.contains(target) || target.closest('[data-dash-metric]')) {
        return
      }
      dashboardHideMetricPopover()
    })

    binding.add(document, 'keydown', (event) => {
      if (event.key !== 'Escape') {
        return
      }
      const popover = document.getElementById('dashMetricPopover')
      if (!popover || popover.style.display === 'none') {
        return
      }
      dashboardHideMetricPopover({ restoreFocus: true })
    })

    binding.add(window, 'resize', () => {
      const popover = document.getElementById('dashMetricPopover')
      dashboardHideMetricPopover({ restoreFocus: Boolean(popover?.contains(document.activeElement)) })
    })
    binding.add(window, 'scroll', () => {
      const popover = document.getElementById('dashMetricPopover')
      dashboardHideMetricPopover({ restoreFocus: Boolean(popover?.contains(document.activeElement)) })
    })

    binding.add(document.getElementById('dashEventsList'), 'click', (event) => {
      const historyButton = event.target.closest('[data-dash-history-kind][data-dash-row-index]')
      if (historyButton) {
        const historyKind = String(historyButton.getAttribute('data-dash-history-kind') ?? '').trim()
        const rowIndex = Number(historyButton.getAttribute('data-dash-row-index'))
        const row = Number.isInteger(rowIndex) ? appState.dashboardTodayRows[rowIndex] : null
        if (row && (historyKind === 'objects' || historyKind === 'zones')) {
          void openDashboardEntityHistory(row, historyKind)
        }
        return
      }

      const button = event.target.closest('[data-dash-worker-login], [data-dash-worker-name]')
      if (!button) {
        return
      }

      const workerLogin = String(button.getAttribute('data-dash-worker-login') ?? '').trim()
      const workerName = String(button.getAttribute('data-dash-worker-name') ?? '').trim()
      if (!workerLogin && !workerName) {
        return
      }

      void openDashboardWorkerHistory(workerLogin, workerName)
    })

    binding.add(document.getElementById('dashActivityCalendar'), 'click', (event) => {
      const workdayBar = event.target.closest('[data-dash-activity-workday-edit]')
      if (workdayBar instanceof HTMLElement) {
        event.preventDefault()
        event.stopPropagation()
        const clickKey = dashboardActivityWorkdayClickKeyFromBar(workdayBar)
        const nowTs = Date.now()
        const lastClick = appState.dashboardActivityLastWorkdayBarClick ?? {}
        appState.dashboardActivityLastWorkdayBarClick = { key: clickKey, at: nowTs }
        if (
          Number(event.detail ?? 0) >= 2 ||
          (clickKey && lastClick.key === clickKey && nowTs - Number(lastClick.at ?? 0) <= 650)
        ) {
          void openDashboardActivityWorkdayDayEditor(workdayBar)
        }
        return
      }

      const button = event.target.closest('[data-dash-worker-login], [data-dash-worker-name]')
      if (!button) {
        return
      }

      const workerLogin = String(button.getAttribute('data-dash-worker-login') ?? '').trim()
      const workerName = String(button.getAttribute('data-dash-worker-name') ?? '').trim()
      if (!workerLogin && !workerName) {
        return
      }

      void openDashboardWorkerHistory(workerLogin, workerName)
    })

    binding.add(document.getElementById('dashActivityCalendar'), 'dblclick', (event) => {
      const orderBar = event.target.closest('[data-dash-activity-order-edit][data-calendar-timeline-order-id]')
      if (orderBar instanceof HTMLElement) {
        event.preventDefault()
        event.stopPropagation()
        const context = calendarTimelineContextFromBar(orderBar)
        if (context) {
          calendarTimelineEditOrderFromContext(context)
        }
        return
      }

      const workdayBar = event.target.closest('[data-dash-activity-workday-edit]')
      if (workdayBar instanceof HTMLElement) {
        event.preventDefault()
        event.stopPropagation()
        void openDashboardActivityWorkdayDayEditor(workdayBar)
      }
    })

    binding.add(document.getElementById('dashActivityCalendar'), 'keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return
      }
      const workdayBar = event.target.closest('[data-dash-activity-workday-edit]')
      if (workdayBar instanceof HTMLElement) {
        event.preventDefault()
        event.stopPropagation()
        void openDashboardActivityWorkdayDayEditor(workdayBar)
        return
      }

      const orderBar = event.target.closest('[data-dash-activity-order-edit][data-calendar-timeline-order-id]')
      if (!(orderBar instanceof HTMLElement)) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const context = calendarTimelineContextFromBar(orderBar)
      if (context) {
        calendarTimelineEditOrderFromContext(context)
      }
    })

    return () => {
      dashboardHideMetricPopover()
      cleanupDashboardTableResize()
      binding.done()
    }
  }

  async function hydrateSections(orgId) {
    dashboardApplyLocalSnapshot(orgId)
  }

  function cleanup() {
    stopDashboardAutoRefresh()
    dashboardHideMetricPopover()
    dashboardCloseOperationsDialog({ restoreFocus: false })
    dashboardServiceOperationStream = []
    dashboardDestroyActiveWorkerMap()
    if (dashboardLoadingOverlayTimer) {
      window.clearTimeout(dashboardLoadingOverlayTimer)
      dashboardLoadingOverlayTimer = 0
    }
    dashboardBackgroundRefreshPromise = null
    dashboardReferencePreloadPromise = null
    dashboardWidgetsRefreshPromise = null
  }

  const helpers = {
    dashboardActivityCleanCompanyLabel,
    dashboardActivityCompanyLabel,
    dashboardActivityEndDeltaInfo,
    dashboardActivityLatestQrCompanyLabelForRow,
    dashboardActivityStartDeltaInfo,
    dashboardAddUserMatchKey,
    dashboardCurrentUserMatchKeys,
    dashboardReadCommentKeys,
    dashboardResolveClientLabel,
    dashboardResolveDayKey,
    dashboardResolveTodayRowAliasKeys,
    dashboardResolveWorkerIdValue,
    dashboardRowIsIndividual,
    dashboardRowIsSpecial,
    dashboardScheduleTimeToMinutes,
    dashboardTaskColumnBelongsToCurrentUser,
    dashboardWorkerIdIdentityKeys,
    dashboardCanonicalWorkerId,
    dashboardIsQrCodeLike,
    dashboardResolveZoneLabel,
    dashboardBuildHistoryRow,
    dashboardClockLabelToHm,
    dashboardDurationLabelToHm,
    dashboardLateMinutesToHm,
    dashboardWorkerSurnameDisplayName,
    dashboardWorkerSurnameSortKey,
    eventEditorFirstScannedQr,
    eventEditorScannedQrLabel,
    resolveClientLabelWithQrFallback,
    resolveZoneByQrCandidate,
    zoneNameWithQrHtml,
    zoneQrCodeFromRow,
  }

  return {
    bind: bindDashboardViewFunctions,
    refresh: refreshDashboardWidgets,
    refreshAfterEventSave: refreshDashboardAfterEventSave,
    triggerRefreshIfAllowed: triggerDashboardRefreshIfAllowed,
    startAutoRefresh: startDashboardAutoRefresh,
    stopAutoRefresh: stopDashboardAutoRefresh,
    syncLoadingOverlay: dashboardSyncLoadingOverlay,
    renderActivityCalendar: renderDashboardActivityCalendar,
    renderKanbanTasks: renderDashboardKanbanTasks,
    hideMetricPopover: dashboardHideMetricPopover,
    deferRouteTaskDataRefresh,
    hydrate: hydrateSections,
    loadFastRows: dashboardLoadFastRows,
    helpers,
    cleanup,
  }
}
