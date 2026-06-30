export const route = 'dashboard'
export const viewId = 'view-dashboard'

export function createDashboardFeature(ctx) {
  let dashboardChangePollTimer = null
  let dashboardActivitySimulationTimer = 0
  let dashboardBackgroundRefreshPromise = null
  let dashboardReferencePreloadPromise = null
  let dashboardScheduleRefreshPromise = null
  let dashboardWidgetsRefreshPromise = null
  let dashboardTimelineFingerprintToken = ''
  let dashboardTimelineFingerprintPromise = null
  let dashboardLoadingOverlayTimer = 0
  let dashboardMetricPopoverHideTimer = null
  let dashboardScheduleLimitRaf = 0
  let dashboardScheduleLimitTimerA = 0
  let dashboardScheduleLimitTimerB = 0

  const DASHBOARD_ACTIVITY_SIMULATION_INTERVAL_MS = 5 * 60 * 1000
  const DASHBOARD_CHANGE_POLL_INTERVAL_MS = 60 * 1000
  const DASHBOARD_TIMELINE_SNAP_MINUTES = 5
  const DASHBOARD_ACTIVITY_VIEW_STORAGE_KEY = 'portal.dashboard.activityView.v2'
  const DASHBOARD_SCHEDULE_SOON_WINDOW_MINUTES = 60
  const DASHBOARD_SCHEDULE_LATE_ALERT_MINUTES = 10
  const DASHBOARD_ACTIVITY_START_DELTA_THRESHOLD_MINUTES = 10
  const DASHBOARD_LONG_CLEAN_SECONDS = 90 * 60
  const DASHBOARD_NEW_COMMENTS_LIMIT = 5
  const DASHBOARD_DUE_TASKS_PREVIEW_LIMIT = 10
  const DASHBOARD_OPEN_WORKDAYS_PAGE_SIZE = 12000
  const DASHBOARD_LOADING_STAGES = ['overview', 'tasks', 'active', 'schedule']
  const DASHBOARD_POST_LOAD_DELAY_MS = 900
  const DASHBOARD_LOCAL_CACHE_VERSION = 2
  const DASHBOARD_LOCAL_CACHE_TTL_MS = 8 * 60 * 60 * 1000
  const DASHBOARD_LOCAL_CACHE_PREFIX = 'portal.dashboard.snapshot'
  const DASHBOARD_COMMENT_READ_STORAGE_PREFIX = 'portal.dashboardComments.read'
  const DASHBOARD_COMMENT_SYNC_STORAGE_PREFIX = 'portal.dashboardComments.sync'
  const DASHBOARD_COMMENT_SYNC_LOOKBACK_DAYS = 3
  const DATA_SYNC_OVERLAY_DELAY_MS = 420

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
    getScheduleBoard,
    getTodayActiveWorkers,
    getWorkdays,
    getWorkers,
    getZones,
    isBlockingModalOpen,
    isPortalInteractionBusy,
    workerIsAssignable,
    queuePortalDeferredNotification,
    clearPortalDeferredNotification,
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
    openEventEditor,
    openEventHistoryFromRow,
    ordersListSourceOrders,
    ordersNormalizeOrderRows,
    ordersTimelineAddressLabel,
    ordersTimelineClientLabel,
    pad2,
    renderCalendarView,
    reportHistoryExtractQrFromComment,
    reportHistoryNormalizeQrCode,
    reportHistoryResolveClientByZoneCode,
    roleLevel,
    setSubwelcomeMetric,
    showTransientNotice,
    toIso,
    todayYmd,
    workerDetailIsoToTime,
    ymdToDayTimestamp,
  } = ctx

  function dashboardWorkerIsAssignable(worker = {}) {
    return typeof workerIsAssignable === 'function' ? workerIsAssignable(worker) : worker?.active !== false
  }

  function dashboardPickNearestScheduleDayKey(days = [], targetDayKey = todayYmd()) {
    const source = Array.isArray(days) ? days : []
    if (!source.length) {
      return ''
    }

    const targetTs = ymdToDayTimestamp(targetDayKey)
    if (!targetTs) {
      return String(source[0]?.key ?? '')
    }

    const candidates = source
      .map((day, index) => {
        const key = String(day?.key ?? '').trim()
        const ts = ymdToDayTimestamp(key)
        if (!key || !ts) {
          return null
        }
        return { key, ts, index }
      })
      .filter(Boolean)

    if (!candidates.length) {
      return String(source[0]?.key ?? '')
    }

    const byFutureThenDateAsc = (left, right) => {
      if (left.ts !== right.ts) {
        return left.ts - right.ts
      }
      return left.index - right.index
    }

    const byPastThenDateDesc = (left, right) => {
      if (left.ts !== right.ts) {
        return right.ts - left.ts
      }
      return left.index - right.index
    }

    const future = candidates
      .filter((candidate) => candidate.ts >= targetTs)
      .sort(byFutureThenDateAsc)
    if (future.length) {
      return String(future[0]?.key ?? source[0]?.key ?? '')
    }

    const past = candidates
      .filter((candidate) => candidate.ts < targetTs)
      .sort(byPastThenDateDesc)

    return String(past[0]?.key ?? source[0]?.key ?? '')
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
          pageSize: 8000,
          forceRefresh,
        }).catch(() => ({ items: [] })),
        getWorkdays(orgId, {
          source: 'workdays',
          fromIso: normalizedDay,
          toIso: rangeEndDay,
          page: 1,
          pageSize: 8000,
          forceRefresh,
        }).catch(() => ({ items: [] })),
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
        renderDashboardSchedulePanel()
        dashboardApplyActivityView()
      }
    }
  }

  function dashboardSetActivityDay(dayKey, options = {}) {
    const normalizedDay = dashboardActivityDayKey(dayKey)
    appState.dashboardActivityDay = normalizedDay
    appState.dashboardScheduleSelectedDay = normalizedDay
    dashboardApplyActivityView()
    renderDashboardSchedulePanel()
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
      const resolvedByQr = dashboardActivityResolveClientByQr(candidate)
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
        label: dashboardActivityCleanCompanyLabel(bar?.companyLabel ?? bar?.locationLabel),
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

  function dashboardActivityLatestQrCompanyLabelForRow(row = {}, dayKey = '', sourceRows = []) {
    const workerId = dashboardResolveWorkerIdValue(row)
    if (!workerId) {
      return ''
    }

    const normalizedDay =
      String(dayKey ?? '').trim() ||
      dashboardResolveDayKey(row) ||
      calendarTimelineRealEventRowDay(row) ||
      todayYmd()

    const matches = (Array.isArray(sourceRows) ? sourceRows : [])
      .map((sourceRow) => {
        const sourceWorkerId = dashboardResolveWorkerIdValue(sourceRow)
        if (!sourceWorkerId || sourceWorkerId !== workerId) {
          return null
        }

        const sourceDay = dashboardResolveDayKey(sourceRow) || calendarTimelineRealEventRowDay(sourceRow)
        if (normalizedDay && sourceDay && sourceDay !== normalizedDay) {
          return null
        }

        const qrCodes = dashboardActivityQrCodesFromRow(sourceRow)
        if (!qrCodes.length) {
          return null
        }

        const label =
          dashboardActivityCleanCompanyLabel(dashboardActivityCompanyLabel(sourceRow)) ||
          qrCodes.map((code) => dashboardActivityResolveClientByQr(code)).find(Boolean) ||
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

  function dashboardRowHasWorkdayStop(row = {}) {
    const stopIso = dashboardActivityRowEditStopIso(row) || toIso(row?.closeMarkedAt)
    if (stopIso) {
      return true
    }

    const stopLabel = dashboardClockLabelToHm(
      row?.qrStop ?? row?.stop ?? row?.stopTime ?? row?.endTime ?? row?.dayStopTime,
      '',
    )
    if (stopLabel) {
      return true
    }

    const endReason = String(row?.endReason ?? '').trim().toUpperCase()
    const status = normalizeEventStatus(row?.status, false)
    return (
      status === 'CLOSED' ||
      endReason === 'WORKDAY_STOP' ||
      endReason === 'STOP_END_DAY' ||
      endReason === 'MANUAL_CLOSE'
    )
  }

  function dashboardOpenStartStopMatchKeys(row = {}) {
    const keys = new Set()
    dashboardEventIdentityCandidateIds(row).forEach((id) => {
      if (id) {
        keys.add(`id:${id}`)
      }
    })

    const dayKey = dashboardResolveDayKey(row)
    const workerKey = normalizeSearchText(row?.workerLogin ?? row?.login ?? row?.workerName ?? row?.name)
    const startIso = dashboardActivityRowEditStartIso(row)
    const startLabel = dashboardClockLabelToHm(row?.qrStart ?? row?.start ?? row?.startTime, '')
    const startKey = startIso || startLabel
    if (dayKey && workerKey && startKey) {
      keys.add(`worker-start:${dayKey}:${workerKey}:${startKey}`)
    }

    return keys
  }

  function dashboardClosedStartStopKeys(rows = []) {
    const keys = new Set()
    ;(Array.isArray(rows) ? rows : []).forEach((row) => {
      if (!dashboardRowHasWorkdayStop(row)) {
        return
      }
      dashboardOpenStartStopMatchKeys(row).forEach((key) => keys.add(key))
    })
    return keys
  }

  function dashboardRowMatchesClosedStartStop(row = {}, closedKeys = new Set()) {
    if (!(closedKeys instanceof Set) || !closedKeys.size) {
      return false
    }
    return [...dashboardOpenStartStopMatchKeys(row)].some((key) => closedKeys.has(key))
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

  async function openDashboardActivityEventEditor(bar) {
    const row = dashboardActivityEventRowFromBar(bar)
    if (!row) {
      showTransientNotice('Nie znaleziono zdarzenia do edycji.', 'error')
      return
    }
    await openEventEditor(row)
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
        const companyLabel =
          dashboardActivityCleanCompanyLabel(dashboardActivityCompanyLabel(row)) ||
          dashboardActivityLatestQrCompanyLabelForRow(row, dayKey, sourceRows) ||
          '-'
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
          isRunning,
          sourceKind: String(row?.historySourceKind ?? '').trim().toLowerCase(),
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
    if (!Number.isFinite(plannedStartTs) || plannedStartTs <= 0 || Number(nowTs) < plannedStartTs) {
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

  function dashboardBuildPlannedOrderActivityItems(dayKey = todayYmd(), rangeStart = 0, rangeEnd = 0) {
    const resources = calendarTimelineResources()
    const plannedOrders = calendarTimelineExpandRecurringOrdersForDays(ordersListSourceOrders(), [dayKey])
    return plannedOrders
      .filter((order) => !order?.completed)
      .flatMap((order) => {
        const slots = typeof calendarTimelineVisualOrderSlots === 'function'
          ? calendarTimelineVisualOrderSlots(order, resources)
          : ordersNormalizeOrderRows(order, resources).map((row) => ({ ...order, row }))
        return (Array.isArray(slots) ? slots : [])
          .filter((slot) => resources[Number(slot?.row)]?.type === 'worker')
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
          const companyLabel = dashboardActivityCleanCompanyLabel(clientLabel) || dashboardActivityCleanCompanyLabel(ordersTimelineAddressLabel(order))
          const orderId = String(slot?.id ?? order?.id ?? '').trim()
          const sourceOrderId = String(slot?.sourceOrderId ?? order?.sourceOrderId ?? order?.orderId ?? order?.id ?? '').trim()
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
            orderId,
            sourceOrderId,
            occurrenceDateYmd,
            dateYmd: String(slot?.dateYmd || order?.dateYmd || dayKey).trim(),
            isRecurringSeries: Boolean(order?.isRecurringSeries),
            isRecurringInstance: Boolean(order?.isRecurringInstance),
            recurrenceOverride: Boolean(order?.recurrenceOverride || calendarTimelineRecurringOverrideInfo(order)),
            workSlotKey: String(slot?.workSlotKey ?? '').trim(),
            serviceBlockId: String(slot?.serviceBlockId ?? '').trim(),
            serviceBlockKind: String(slot?.serviceBlockKind ?? '').trim(),
            serviceBlockLabel: String(slot?.serviceBlockLabel ?? '').trim(),
            startTs: planned.startTs,
            stopTs: planned.endTs,
            clippedStart,
            clippedStop,
            label: title,
            locationLabel: companyLabel,
            companyLabel,
            isRunning: false,
          }
        })
      })
  }

  function dashboardLaneActivityBars(bars = []) {
    const sortedBars = bars
      .slice()
      .sort((left, right) => left.clippedStart - right.clippedStart || left.clippedStop - right.clippedStop)

    return sortedBars.map((bar) => ({
      ...bar,
      lane: bar?.kind === 'workday' ? 1 : 0,
    }))
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
        }))
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
            const isMissingStart = dashboardActivityPlannedStartMissing(bar, bars, nowTs, isToday)
            if (isMissingStart) classes.push('is-missing-start')
            const timeRange = bar.isRunning ? `${hourLabel(bar.startTs)}-` : `${hourLabel(bar.startTs)}-${hourLabel(bar.stopTs)}`
            const companyLabel = dashboardActivityCleanCompanyLabel(bar.companyLabel || bar.locationLabel) || ''
            const showCompanyOnBar = !(bar.kind === 'workday' && bar.isRunning)
            const displayCompanyLabel = showCompanyOnBar ? companyLabel : ''
            const workDurationLabel = bar.kind === 'workday' ? String(bar.label ?? '').trim() : ''
            const barStatus = bar.kind === 'planned' ? 'Plan' : 'Realizacja'
            const startDeltaTitle = bar.startDelta ? ` · ${bar.startDelta.label}` : ''
            const endDeltaTitle = bar.endDelta ? ` · ${bar.endDelta.label}` : ''
            const durationTitle = workDurationLabel ? ` · czas ${workDurationLabel}` : ''
            const missingStartTitle = isMissingStart ? ' · BRAK START: pracownik powinien być już na obiekcie' : ''
            const clickTitle = bar.kind === 'planned'
              ? ' · Kliknij dwukrotnie: edytuj zlecenie'
              : bar.kind === 'workday'
                ? ' · Kliknij dwukrotnie: edytuj zdarzenie'
                : ''
            const title = `${group.workerDisplayName}: ${barStatus} ${timeRange}${durationTitle}${displayCompanyLabel ? ` · ${displayCompanyLabel}` : ''}${missingStartTitle}${startDeltaTitle}${endDeltaTitle}${clickTitle}`
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
                  bar.isRecurringSeries ? 'data-calendar-timeline-recurring-series="1"' : '',
                  bar.isRecurringInstance ? 'data-calendar-timeline-recurring-instance="1"' : '',
                  bar.recurrenceOverride ? 'data-calendar-timeline-recurrence-override="1"' : '',
                ].filter(Boolean).join(' ')
              : ''
            const workdayAttrs = bar.kind === 'workday'
              ? [
                  'role="button"',
                  'tabindex="0"',
                  'data-dash-activity-event-edit="1"',
                  `aria-label="${escapeHtml(`Edytuj zdarzenie ${barLabel || timeRange}`)}"`,
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
        const companyLabel = dashboardActivityCompanyLabelForGroup(bars, group.companyLabels)
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
            <div class="dash-activity-timeline-row" style="--dash-lane-count:${laneCount};--dash-row-height:${laneCount * 22 + (hasDeltaMarkers ? 36 : 14)}px;--dash-track-height:${laneCount * 22 + (hasDeltaMarkers ? 28 : 6)}px;">
              <div class="dash-activity-timeline-person">${workerButton}</div>
              <div class="dash-activity-timeline-track">
                ${deltaMarkersHtml}
                ${barsHtml}
              </div>
              <div class="dash-activity-timeline-meta" title="${escapeHtml(companyLabel || '')}">${escapeHtml(companyLabel || '')}</div>
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
          const lateMinutes = Number(row?.lateMinutes ?? 0)
          const lateValue = dashboardLateMinutesToHm(lateMinutes)
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
          const rowClass = lateMinutes > 0 ? 'list-row dash-events-row dash-events-row--has-late' : 'list-row dash-events-row'
          return `
        <div class="${rowClass}">
          <div>${workerCell}</div>
          <div>${escapeHtml(String(row.entriesCount ?? 0))}</div>
          <div>${clientCell}</div>
          <div>${zoneCell}</div>
          <div class="ta-right">
            <div class="dash-time-stack${lateMinutes > 0 ? ' dash-time-stack--has-late' : ''}">
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
              ${
                lateMinutes > 0
                  ? `
              <div class="dash-time-line dash-time-line--late">
                <span class="dash-time-label">Spóźnienie</span>
                <span class="dash-time-colon">:</span>
                <span class="dash-time-value">${escapeHtml(lateValue)}</span>
              </div>
              `
                  : ''
              }
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

  function dashboardScheduleDayDisplayName(dayName) {
    const normalized = String(dayName ?? '')
      .trim()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
    const map = {
      PONIEDZIALEK: 'Poniedziałek',
      WTOREK: 'Wtorek',
      SRODA: 'Środa',
      CZWARTEK: 'Czwartek',
      PIATEK: 'Piątek',
      SOBOTA: 'Sobota',
      NIEDZIELA: 'Niedziela',
    }
    return map[normalized] || String(dayName ?? '').trim() || '-'
  }

  function dashboardScheduleTextStartsWithTime(value) {
    const firstLine = String(value ?? '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean)
    const match = String(firstLine ?? '').match(/^(\d{1,2})[.:](\d{2})(?=\D|$)/)
    if (!match) {
      return false
    }

    const hour = Number(match[1])
    const minute = Number(match[2])
    return Number.isFinite(hour) && Number.isFinite(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
  }

  function dashboardScheduleShiftText(startRaw, taskRaw) {
    const start = String(startRaw ?? '').trim()
    const task = String(taskRaw ?? '').trim()
    if (start && task) {
      return dashboardScheduleTextStartsWithTime(task) ? task : `${start} ${task}`
    }
    if (start) {
      return start
    }
    if (task) {
      return task
    }
    return 'Brak zmiany'
  }

  function dashboardScheduleStartTime(entry) {
    const morningStart = String(entry?.morningStart ?? '').trim()
    if (morningStart) {
      return morningStart
    }

    const afternoonStart = String(entry?.afternoonStart ?? '').trim()
    if (afternoonStart) {
      return afternoonStart
    }

    return '-'
  }

  function dashboardScheduleWorkerDisplayName(value) {
    const raw = String(value ?? '').trim()
    if (!raw) {
      return '-'
    }

    const normalized = raw.replace(/\s+/g, ' ')
    const letterMatches = normalized.match(/\p{L}/gu) || []
    const upperMatches = normalized.match(/\p{Lu}/gu) || []
    const isMostlyUpper = letterMatches.length > 2 && upperMatches.length / letterMatches.length > 0.75
    if (!isMostlyUpper) {
      return normalized
    }

    return normalized
      .toLocaleLowerCase('pl')
      .replace(/(^|[\s-])\p{L}/gu, (fragment) => fragment.toLocaleUpperCase('pl'))
  }

  function dashboardResolveWorkerById(workerId, workers = []) {
    const pool = Array.isArray(workers) ? workers : []
    if (!pool.length) {
      return null
    }

    const normalizedId = normalizeSearchText(workerId)
    if (!normalizedId) {
      return null
    }

    const directMatch = pool.find((worker) => {
      const workerIdKey = normalizeSearchText(worker?.workerId ?? worker?.id)
      return Boolean(workerIdKey) && workerIdKey === normalizedId
    })
    if (directMatch) {
      return directMatch
    }

    const scheduleIdDigits = normalizedId.replace(/[^0-9]/g, '').replace(/^0+/, '')
    if (!scheduleIdDigits) {
      return null
    }

    return (
      pool.find((worker) => {
        const workerIdKey = normalizeSearchText(worker?.workerId ?? worker?.id)
        if (!workerIdKey) {
          return false
        }
        const workerDigits = workerIdKey.replace(/[^0-9]/g, '').replace(/^0+/, '')
        return Boolean(workerDigits) && workerDigits === scheduleIdDigits
      }) ?? null
    )
  }

  function dashboardResolveScheduleDayKey(dayBucket) {
    const direct = String(dayBucket?.key ?? '').trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) {
      return direct
    }

    const dateLabel = String(dayBucket?.dateLabel ?? '').trim()
    const match = dateLabel.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
    if (match) {
      return `${match[3]}-${match[2]}-${match[1]}`
    }

    return ''
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

  function dashboardScheduleDayNameFromYmd(dayKey = todayYmd()) {
    const normalizedDay = dashboardActivityDayKey(dayKey)
    const weekday = calendarDateFromYmd(normalizedDay).toLocaleDateString('pl-PL', { weekday: 'long' })
    return weekday ? weekday.charAt(0).toLocaleUpperCase('pl') + weekday.slice(1) : '-'
  }

  function dashboardScheduleDateLabelFromYmd(dayKey = todayYmd()) {
    const normalizedDay = dashboardActivityDayKey(dayKey)
    return formatDatePl(`${normalizedDay}T12:00:00`)
  }

  function dashboardScheduleDayNameKey(dayName = '') {
    return String(dayName ?? '')
      .trim()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
  }

  function dashboardScheduleSyntheticBucket(dayKey = todayYmd()) {
    const normalizedDay = dashboardActivityDayKey(dayKey)
    const dayStart = new Date(`${normalizedDay}T00:00:00`).getTime()
    const dayEnd = new Date(`${normalizedDay}T23:59:59`).getTime()
    const hourLabel = (timestamp) => {
      const date = new Date(timestamp)
      return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
    }
    const plannedEntries = dashboardBuildPlannedOrderActivityItems(normalizedDay, dayStart, dayEnd)
      .map((bar) => {
        const startTime = hourLabel(bar.startTs)
        const stopTime = hourLabel(bar.stopTs)
        const companyLabel = dashboardActivityCleanCompanyLabel(bar.companyLabel || bar.locationLabel || bar.label) || ''
        const taskLabel = [stopTime ? `${startTime}-${stopTime}` : startTime, companyLabel].filter(Boolean).join(' · ')
        const isMorning = new Date(bar.startTs).getHours() < 12
        return {
          workerId: String(bar.workerKey ?? ''),
          workerLogin: String(bar.workerLogin ?? ''),
          workerName: String(bar.workerDisplayName || bar.workerName || '-'),
          status: 'Praca',
          morningStart: isMorning ? startTime : '',
          morningTask: isMorning ? taskLabel : '',
          afternoonStart: isMorning ? '' : startTime,
          afternoonTask: isMorning ? '' : taskLabel,
        }
      })

    return {
      key: normalizedDay,
      dayName: dashboardScheduleDayNameFromYmd(normalizedDay),
      dateLabel: dashboardScheduleDateLabelFromYmd(normalizedDay),
      entries: plannedEntries,
      generated: true,
    }
  }

  function dashboardScheduleBucketForDay(dayKey = todayYmd()) {
    const normalizedDay = dashboardActivityDayKey(dayKey)
    const days = Array.isArray(appState.dashboardScheduleDays) ? appState.dashboardScheduleDays : []
    const nativeBucket = days.find((day) => String(day?.key ?? '').trim() === normalizedDay)
    if (nativeBucket) {
      return nativeBucket
    }

    const expectedDayName = dashboardScheduleDayNameFromYmd(normalizedDay)
    const expectedDayNameKey = dashboardScheduleDayNameKey(expectedDayName)
    const weekdayBucket = days.find((day) => dashboardScheduleDayNameKey(day?.dayName) === expectedDayNameKey)
    if (weekdayBucket) {
      return {
        ...weekdayBucket,
        key: normalizedDay,
        dayName: expectedDayName,
        dateLabel: dashboardScheduleDateLabelFromYmd(normalizedDay),
        weekdayFallback: true,
      }
    }

    return dashboardScheduleSyntheticBucket(normalizedDay)
  }

  function dashboardScheduleMeaningfulLineText(value = '') {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim()
    return text && normalizeSearchText(text) !== 'brak zmiany' ? text : ''
  }

  function dashboardMergeScheduleLineText(current = '', next = '') {
    const left = dashboardScheduleMeaningfulLineText(current)
    const right = dashboardScheduleMeaningfulLineText(next)
    if (!left) {
      return right || 'Brak zmiany'
    }
    if (!right) {
      return left
    }

    const leftKey = normalizeSearchText(left)
    const rightKey = normalizeSearchText(right)
    if (leftKey === rightKey) {
      return left
    }
    if (leftKey.includes(rightKey)) {
      return left
    }
    if (rightKey.includes(leftKey)) {
      return right
    }
    return `${left} / ${right}`
  }

  function dashboardScheduleEntryDedupeKey(entry = {}) {
    const direct = String(entry?.workerKey ?? '').trim()
    if (direct) {
      return direct
    }
    const login = normalizeSearchText(entry?.workerLogin)
    if (login) {
      return `l:${login}`
    }
    const historyName = normalizeSearchText(entry?.workerHistoryName)
    if (historyName) {
      return `n:${historyName}`
    }
    const workerName = normalizeSearchText(entry?.workerName)
    return workerName ? `n:${workerName}` : ''
  }

  function dashboardPreferredScheduleEntry(left = {}, right = {}) {
    const leftHasStart = dashboardScheduleTimeToMinutes(left?.startTime) >= 0
    const rightHasStart = dashboardScheduleTimeToMinutes(right?.startTime) >= 0
    if (leftHasStart !== rightHasStart) {
      return leftHasStart ? left : right
    }

    const leftIsWork = String(left?.status ?? '').trim() === 'Praca'
    const rightIsWork = String(right?.status ?? '').trim() === 'Praca'
    if (leftIsWork !== rightIsWork) {
      return leftIsWork ? left : right
    }

    const leftPriority = Number(left?.priority ?? Number.POSITIVE_INFINITY)
    const rightPriority = Number(right?.priority ?? Number.POSITIVE_INFINITY)
    if (leftPriority !== rightPriority) {
      return leftPriority < rightPriority ? left : right
    }

    const leftStart = Number(left?.startMinutes ?? Number.POSITIVE_INFINITY)
    const rightStart = Number(right?.startMinutes ?? Number.POSITIVE_INFINITY)
    if (leftStart !== rightStart) {
      return leftStart < rightStart ? left : right
    }

    return left
  }

  function dashboardMergeScheduleEntries(entries = []) {
    const rows = Array.isArray(entries) ? entries : []
    const byWorker = new Map()
    rows.forEach((entry) => {
      const key = dashboardScheduleEntryDedupeKey(entry)
      if (!key) {
        byWorker.set(`row:${byWorker.size}`, entry)
        return
      }

      const existing = byWorker.get(key)
      if (!existing) {
        byWorker.set(key, entry)
        return
      }

      const preferred = dashboardPreferredScheduleEntry(existing, entry)
      const other = preferred === existing ? entry : existing
      const hasQrStartAny = Boolean(existing.hasQrStartAny || entry.hasQrStartAny)
      const hasQrStartActive = Boolean(existing.hasQrStartActive || entry.hasQrStartActive)
      const isMissingStart = !hasQrStartAny && Boolean(existing.isMissingStart || entry.isMissingStart)
      const priority = hasQrStartActive ? 2 : isMissingStart ? 0 : Math.min(Number(existing.priority ?? 4), Number(entry.priority ?? 4))
      const toneClass = isMissingStart
        ? 'is-missing-start'
        : hasQrStartActive
          ? 'is-started'
          : preferred.toneClass || other.toneClass || ''

      byWorker.set(key, {
        ...preferred,
        workerLogin: preferred.workerLogin || other.workerLogin || '',
        workerHistoryName: preferred.workerHistoryName || other.workerHistoryName || preferred.workerName,
        workerDisplayName: preferred.workerDisplayName || dashboardWorkerSurnameDisplayName(preferred.workerName),
        status: String(existing.status ?? '').trim() === 'Praca' || String(entry.status ?? '').trim() === 'Praca' ? 'Praca' : preferred.status,
        statusClass: String(existing.status ?? '').trim() === 'Praca' || String(entry.status ?? '').trim() === 'Praca' ? 'is-work' : preferred.statusClass,
        morningText: dashboardMergeScheduleLineText(existing.morningText, entry.morningText),
        afternoonText: dashboardMergeScheduleLineText(existing.afternoonText, entry.afternoonText),
        hasQrStartAny,
        hasQrStartActive,
        lateMinutes: Math.max(Number(existing.lateMinutes ?? 0), Number(entry.lateMinutes ?? 0)),
        hasScheduleStart: Boolean(existing.hasScheduleStart || entry.hasScheduleStart),
        isMissingStart,
        priority,
        toneClass,
      })
    })

    return [...byWorker.values()]
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

  function dashboardBuildTodayWorkerStateById(dayKey) {
    const normalizedDayKey = String(dayKey ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDayKey)) {
      return new Map()
    }

    if (normalizedDayKey !== todayYmd()) {
      return new Map()
    }

    const rows = Array.isArray(appState.dashboardTodayRows) ? appState.dashboardTodayRows : []
    const sourceRows = Array.isArray(appState.dashboardScheduleSourceRows) ? appState.dashboardScheduleSourceRows : []
    const workersPool = Array.isArray(appState.workers) ? appState.workers : []
    const stateMap = new Map()
    const isoToMinutes = (isoValue) => {
      const iso = toIso(isoValue)
      if (!iso) {
        return -1
      }

      const date = new Date(iso)
      if (!Number.isFinite(date.getTime())) {
        return -1
      }

      return date.getHours() * 60 + date.getMinutes()
    }

    const upsertState = (key, row) => {
      if (!key) {
        return
      }

      const existing = stateMap.get(key) || {
        hasStart: false,
        isRunning: false,
        startMinutes: -1,
      }

      const rowStartMinutes = dashboardScheduleTimeToMinutes(row?.qrStart)
      const hasStart = Number.isFinite(rowStartMinutes) && rowStartMinutes >= 0
      const merged = {
        hasStart: existing.hasStart || hasStart,
        isRunning: existing.isRunning || Boolean(row?.isRunning),
        startMinutes:
          existing.startMinutes >= 0 && rowStartMinutes >= 0
            ? Math.min(existing.startMinutes, rowStartMinutes)
            : existing.startMinutes >= 0
              ? existing.startMinutes
              : rowStartMinutes >= 0
                ? rowStartMinutes
                : -1,
      }
      stateMap.set(key, merged)
    }

    rows.forEach((row) => {
      const resolvedWorkerId = dashboardResolveWorkerIdValue(row, workersPool)
      const workerIdKey = normalizeSearchText(resolvedWorkerId)
      if (workerIdKey) {
        upsertState(`id:${workerIdKey}`, row)
      }
    })

    // Fallback for schedule colors: include all today's source rows (events/workdays),
    // so workers who already started and then closed are still recognized as "started today".
    sourceRows.forEach((row) => {
      if ((dashboardResolveDayKey(row) || calendarTimelineRealEventRowDay(row)) !== normalizedDayKey) {
        return
      }

      const resolvedWorkerId = dashboardResolveWorkerIdValue(row, workersPool)
      if (!resolvedWorkerId) {
        return
      }

      const rowStartMinutes = isoToMinutes(row?.startAt ?? row?.dayStartAt)
      const status = String(row?.status ?? '').trim().toUpperCase()
      const hasEnd = Boolean(toIso(row?.endAt ?? row?.dayEndAt))
      const rowLike = {
        qrStart:
          rowStartMinutes >= 0
            ? `${pad2(Math.floor(rowStartMinutes / 60))}:${pad2(rowStartMinutes % 60)}:00`
            : '',
        isRunning: !hasEnd && (status === 'RUNNING' || status === 'OPEN'),
      }

      const workerIdKey = normalizeSearchText(resolvedWorkerId)
      if (workerIdKey) {
        upsertState(`id:${workerIdKey}`, rowLike)
      }
    })

    return stateMap
  }

  function dashboardResolveScheduleWorkerAliasKeys(entry) {
    return dashboardWorkerIdIdentityKeys(dashboardResolveWorkerIdValue(entry))
  }

  function dashboardHideScheduleMissingStartAlert() {
    const node = document.getElementById('dashScheduleMissingAlert')
    if (node) {
      node.remove()
    }
  }

  function dashboardHideScheduleLateStartAlert() {
    const node = document.getElementById('dashScheduleLateAlert')
    if (node) {
      node.remove()
    }
  }

  function dashboardShouldDeferScheduleAlert() {
    const busy =
      typeof isPortalInteractionBusy === 'function'
        ? isPortalInteractionBusy()
        : typeof isBlockingModalOpen === 'function' && isBlockingModalOpen()
    return appState.currentRoute !== 'dashboard' || document.visibilityState !== 'visible' || Boolean(busy)
  }

  function dashboardQueueScheduleAlert(key, callback) {
    if (typeof queuePortalDeferredNotification === 'function') {
      queuePortalDeferredNotification(key, callback, { requiredRoute: 'dashboard' })
    }
  }

  function dashboardClearQueuedScheduleAlert(key) {
    if (typeof clearPortalDeferredNotification === 'function') {
      clearPortalDeferredNotification(key)
    }
  }

  function dashboardLateStartEntryKey(dayKey, entry) {
    const day = String(dayKey ?? '').trim()
    const worker = normalizeSearchText(entry?.workerName)
    const start = String(entry?.startTime ?? '').trim()
    const late = Number(entry?.lateMinutes ?? 0)
    return `${day}|${worker}|${start}|${late}`
  }

  function dashboardShowScheduleLateStartAlert(dayKey, lateEntries = []) {
    const normalizedDayKey = String(dayKey ?? '').trim()
    const entries = Array.isArray(lateEntries) ? lateEntries : []
    const queueKey = 'dashboard:schedule-late'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDayKey) || !entries.length) {
      dashboardClearQueuedScheduleAlert(queueKey)
      appState.dashboardScheduleLatePendingKeys = []
      dashboardHideScheduleLateStartAlert()
      return
    }

    if (dashboardShouldDeferScheduleAlert()) {
      dashboardHideScheduleLateStartAlert()
      dashboardQueueScheduleAlert(queueKey, () => dashboardShowScheduleLateStartAlert(normalizedDayKey, entries))
      return
    }

    if (!(appState.dashboardScheduleLateShownKeys instanceof Set)) {
      appState.dashboardScheduleLateShownKeys = new Set()
    }

    const seen = appState.dashboardScheduleLateShownKeys
    const dedupMap = new Map()
    entries.forEach((entry) => {
      const alertKey = dashboardLateStartEntryKey(normalizedDayKey, entry)
      if (!alertKey || seen.has(alertKey) || dedupMap.has(alertKey)) {
        return
      }
      dedupMap.set(alertKey, {
        ...entry,
        alertKey,
      })
    })

    const unseenEntries = [...dedupMap.values()]
    if (!unseenEntries.length) {
      dashboardClearQueuedScheduleAlert(queueKey)
      appState.dashboardScheduleLatePendingKeys = []
      dashboardHideScheduleLateStartAlert()
      return
    }

    // Priorytet: najpierw popup o braku START, dopiero potem popup informacyjny o spóźnieniu.
    if (document.getElementById('dashScheduleMissingAlert')) {
      dashboardHideScheduleLateStartAlert()
      dashboardQueueScheduleAlert(queueKey, () => dashboardShowScheduleLateStartAlert(normalizedDayKey, entries))
      return
    }

    appState.dashboardScheduleLatePendingKeys = unseenEntries.map((entry) => entry.alertKey)

    let node = document.getElementById('dashScheduleLateAlert')
    if (!node) {
      node = document.createElement('div')
      node.id = 'dashScheduleLateAlert'
      node.className = 'dash-schedule-alert dash-schedule-alert--late'
      node.setAttribute('role', 'alertdialog')
      node.setAttribute('aria-modal', 'true')
      node.setAttribute('aria-labelledby', 'dashScheduleLateAlertTitle')
      node.innerHTML = `
        <div class="dash-schedule-alert-header">
          <span class="dash-schedule-alert-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 7v5l3 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" stroke="currentColor" stroke-width="2"/>
            </svg>
          </span>
          <div class="dash-schedule-alert-heading">
            <div class="dash-schedule-alert-signal" aria-hidden="true">INFO</div>
            <div class="dash-schedule-alert-title" id="dashScheduleLateAlertTitle">Pracownicy pojawili się po czasie</div>
            <div class="dash-schedule-alert-text" id="dashScheduleLateAlertText"></div>
          </div>
        </div>
        <div class="dash-schedule-alert-list-wrap">
          <div class="dash-schedule-alert-list-title">Lista osób:</div>
          <ul class="dash-schedule-alert-list" id="dashScheduleLateAlertList"></ul>
        </div>
        <div class="dash-schedule-alert-actions">
          <button type="button" class="btn2 primary" data-alert-action="ok">OK</button>
        </div>
      `
      document.body.appendChild(node)
      node.addEventListener('click', (event) => {
        const button = event.target.closest('[data-alert-action]')
        if (!button) {
          return
        }

        const action = String(button.getAttribute('data-alert-action') ?? '').trim()
        if (action === 'ok') {
          if (!(appState.dashboardScheduleLateShownKeys instanceof Set)) {
            appState.dashboardScheduleLateShownKeys = new Set()
          }
          appState.dashboardScheduleLatePendingKeys.forEach((key) => {
            if (key) {
              appState.dashboardScheduleLateShownKeys.add(String(key))
            }
          })
          appState.dashboardScheduleLatePendingKeys = []
          dashboardClearQueuedScheduleAlert(queueKey)
          dashboardHideScheduleLateStartAlert()
        }
      })
    }

    const textNode = node.querySelector('#dashScheduleLateAlertText')
    if (textNode) {
      textNode.textContent =
        unseenEntries.length === 1
          ? '1 osoba rozpoczęła pracę z opóźnieniem.'
          : `${unseenEntries.length} osób rozpoczęło pracę z opóźnieniem.`
    }

    const listNode = node.querySelector('#dashScheduleLateAlertList')
    if (listNode) {
      const normalized = [...unseenEntries].sort((left, right) => {
        const leftLate = Number(left?.lateMinutes ?? 0)
        const rightLate = Number(right?.lateMinutes ?? 0)
        if (leftLate !== rightLate) {
          return rightLate - leftLate
        }
        return String(left?.workerName ?? '').localeCompare(String(right?.workerName ?? ''), 'pl', {
          sensitivity: 'base',
        })
      })

      listNode.innerHTML = normalized
        .map((entry) => {
          const name = escapeHtml(String(entry.workerName ?? '-'))
          const lateLabel = dashboardLateMinutesToHm(entry?.lateMinutes)
          const start = String(entry?.startTime ?? '').trim()
          const startLabel = start && start !== '-' ? escapeHtml(start) : '-'
          return `
            <li>
              <span class="dash-schedule-alert-person">${name}</span>
              <span class="dash-schedule-alert-meta">START: ${startLabel}</span>
              <span class="dash-schedule-alert-status">Spóźnienie: ${lateLabel}</span>
            </li>
          `
        })
        .join('')
    }
  }

  function dashboardShowScheduleMissingStartAlert(dayKey, missingEntries = []) {
    const normalizedDayKey = String(dayKey ?? '').trim()
    const entries = Array.isArray(missingEntries) ? missingEntries : []
    const queueKey = 'dashboard:schedule-missing'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDayKey) || !entries.length) {
      dashboardClearQueuedScheduleAlert(queueKey)
      dashboardHideScheduleMissingStartAlert()
      if (!entries.length) {
        appState.dashboardScheduleAlertLastKey = ''
      }
      return
    }

    if (dashboardShouldDeferScheduleAlert()) {
      dashboardHideScheduleMissingStartAlert()
      dashboardQueueScheduleAlert(queueKey, () => dashboardShowScheduleMissingStartAlert(normalizedDayKey, entries))
      return
    }

    if (appState.dashboardScheduleAlertMuted) {
      dashboardClearQueuedScheduleAlert(queueKey)
      return
    }

    const now = Date.now()
    if (Number(appState.dashboardScheduleAlertSnoozeUntil ?? 0) > now) {
      dashboardClearQueuedScheduleAlert(queueKey)
      return
    }

    const signature = entries
      .map((entry) => normalizeSearchText(entry?.workerName))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, 'pl', { sensitivity: 'base' }))
      .join('|')
    if (!signature) {
      dashboardClearQueuedScheduleAlert(queueKey)
      dashboardHideScheduleMissingStartAlert()
      return
    }

    appState.dashboardScheduleAlertLastKey = signature

    let node = document.getElementById('dashScheduleMissingAlert')
    if (!node) {
      node = document.createElement('div')
      node.id = 'dashScheduleMissingAlert'
      node.className = 'dash-schedule-alert'
      node.setAttribute('role', 'alertdialog')
      node.setAttribute('aria-modal', 'true')
      node.setAttribute('aria-labelledby', 'dashScheduleMissingAlertTitle')
      node.innerHTML = `
        <div class="dash-schedule-alert-header">
          <span class="dash-schedule-alert-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 8v5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
              <path d="M12 17h.01" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
              <path d="M10.3 4.3 2.7 18a2 2 0 0 0 1.75 3h15.1a2 2 0 0 0 1.75-3L13.7 4.3a2 2 0 0 0-3.4 0Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
            </svg>
          </span>
          <div class="dash-schedule-alert-heading">
            <div class="dash-schedule-alert-signal" aria-hidden="true">UWAGA</div>
            <div class="dash-schedule-alert-title" id="dashScheduleMissingAlertTitle">Brak QR START</div>
            <div class="dash-schedule-alert-text" id="dashScheduleMissingAlertText"></div>
          </div>
        </div>
        <div class="dash-schedule-alert-list-wrap">
          <div class="dash-schedule-alert-list-title">Lista osób:</div>
          <ul class="dash-schedule-alert-list" id="dashScheduleMissingAlertList"></ul>
        </div>
        <div class="dash-schedule-alert-actions">
          <div class="dash-schedule-alert-snooze">
            <label for="dashScheduleMissingSnooze">Przypomnij za</label>
            <select id="dashScheduleMissingSnooze" data-alert-snooze-minutes>
              <option value="15">15 min</option>
              <option value="30">30 min</option>
              <option value="60">1 h</option>
            </select>
            <button type="button" class="btn2 secondary" data-alert-action="snooze">Odłóż</button>
          </div>
          <button type="button" class="btn2 danger" data-alert-action="mute">Nie pokazuj</button>
        </div>
      `
      document.body.appendChild(node)
      node.addEventListener('click', (event) => {
        const button = event.target.closest('[data-alert-action]')
        if (!button) {
          return
        }

        const action = String(button.getAttribute('data-alert-action') ?? '').trim()
        if (action === 'snooze') {
          const snoozeSelect = node.querySelector('[data-alert-snooze-minutes]')
          const selectedMinutes = Number(snoozeSelect?.value ?? 15)
          const allowedMinutes = [15, 30, 60]
          const snoozeMinutes = allowedMinutes.includes(selectedMinutes) ? selectedMinutes : 15
          appState.dashboardScheduleAlertSnoozeUntil = Date.now() + snoozeMinutes * 60 * 1000
          dashboardClearQueuedScheduleAlert(queueKey)
          dashboardHideScheduleMissingStartAlert()
          return
        }

        if (action === 'mute') {
          appState.dashboardScheduleAlertMuted = true
          dashboardClearQueuedScheduleAlert(queueKey)
          dashboardHideScheduleMissingStartAlert()
        }
      })
    }

    const textNode = node.querySelector('#dashScheduleMissingAlertText')
    if (textNode) {
      textNode.textContent =
        entries.length === 1
          ? '1 osoba nie rozpoczęła pracy (brak QR START).'
          : `${entries.length} osób nie rozpoczęło pracy (brak QR START).`
    }

    const listNode = node.querySelector('#dashScheduleMissingAlertList')
    if (listNode) {
      const normalized = [...entries]
        .filter((entry) => String(entry?.workerName ?? '').trim())
        .sort((left, right) => {
          const leftStart = Number.isFinite(left?.startMinutes) ? Number(left.startMinutes) : Number.POSITIVE_INFINITY
          const rightStart = Number.isFinite(right?.startMinutes) ? Number(right.startMinutes) : Number.POSITIVE_INFINITY
          if (leftStart !== rightStart) {
            return leftStart - rightStart
          }
          return String(left?.workerName ?? '').localeCompare(String(right?.workerName ?? ''), 'pl', {
            sensitivity: 'base',
          })
        })

      const seen = new Set()
      listNode.innerHTML = normalized
        .filter((entry) => {
          const key = `${normalizeSearchText(entry?.workerName)}|${String(entry?.startTime ?? '').trim()}`
          if (!key || seen.has(key)) {
            return false
          }
          seen.add(key)
          return true
        })
        .map((entry) => {
          const name = escapeHtml(String(entry.workerName ?? '-'))
          const start = String(entry.startTime ?? '').trim()
          const startLabel = start && start !== '-' ? escapeHtml(start) : '-'
          return `
            <li>
              <span class="dash-schedule-alert-person">${name}</span>
              <span class="dash-schedule-alert-meta">Planowany START: ${startLabel}</span>
            </li>
          `
        })
        .join('')
    }
  }

  function dashboardApplyScheduleVisibleLimit() {
    const cardsRoot = document.getElementById('dashScheduleCards')
    if (!(cardsRoot instanceof HTMLElement)) {
      return
    }

    cardsRoot.style.removeProperty('height')
    cardsRoot.style.removeProperty('max-height')
    cardsRoot.style.removeProperty('min-height')
  }

  function dashboardQueueScheduleVisibleLimit() {
    if (dashboardScheduleLimitRaf) {
      window.cancelAnimationFrame(dashboardScheduleLimitRaf)
      dashboardScheduleLimitRaf = 0
    }
    if (dashboardScheduleLimitTimerA) {
      window.clearTimeout(dashboardScheduleLimitTimerA)
      dashboardScheduleLimitTimerA = 0
    }
    if (dashboardScheduleLimitTimerB) {
      window.clearTimeout(dashboardScheduleLimitTimerB)
      dashboardScheduleLimitTimerB = 0
    }

    dashboardScheduleLimitRaf = window.requestAnimationFrame(() => {
      dashboardScheduleLimitRaf = 0
      dashboardApplyScheduleVisibleLimit()
    })
    dashboardScheduleLimitTimerA = window.setTimeout(() => {
      dashboardScheduleLimitTimerA = 0
      dashboardApplyScheduleVisibleLimit()
    }, 90)
    dashboardScheduleLimitTimerB = window.setTimeout(() => {
      dashboardScheduleLimitTimerB = 0
      dashboardApplyScheduleVisibleLimit()
    }, 260)
  }

  function dashboardRenderScheduleCards(dayBucket) {
    const cardsRoot = document.getElementById('dashScheduleCards')
    if (!cardsRoot) {
      return
    }

    const dayKey = dashboardResolveScheduleDayKey(dayBucket)
    const entries = Array.isArray(dayBucket?.entries) ? dayBucket.entries : []
    if (!entries.length) {
      const message = appState.dashboardScheduleLoading
        ? 'Wczytywanie grafiku...'
        : appState.dashboardScheduleError
          ? 'Nie udało się pobrać grafiku.'
          : 'Brak danych grafiku dla wybranego dnia.'
      cardsRoot.innerHTML = `<div class="dash-schedule-empty">${escapeHtml(message)}</div>`
      cardsRoot.style.removeProperty('max-height')
      cardsRoot.scrollTop = 0
      window.requestAnimationFrame(() => {
        cardsRoot.scrollTop = 0
      })
      dashboardShowScheduleMissingStartAlert(dayKey, [])
      return
    }

    const nowTs = Date.now()
    const todayWorkerStateMap = dashboardBuildTodayWorkerStateById(dayKey)
    const workersPool = Array.isArray(appState.workers) ? appState.workers : []

    const enrichedRows = entries
      .map((entry) => {
        const linkedWorkerById = dashboardResolveWorkerById(entry?.workerId, workersPool)
        const linkedWorkerForLabel = linkedWorkerById
        const isWorkerAssignable = linkedWorkerForLabel
          ? dashboardWorkerIsAssignable(linkedWorkerForLabel)
          : dashboardWorkerIsAssignable(entry)
        const workerName = dashboardScheduleWorkerDisplayName(
          linkedWorkerForLabel?.workerName ?? linkedWorkerForLabel?.name ?? entry?.workerName ?? entry?.workerId,
        )
        const workerDisplayName = dashboardWorkerSurnameDisplayName(workerName)
        const workerLogin = String(entry?.workerLogin ?? linkedWorkerForLabel?.workerLogin ?? linkedWorkerForLabel?.login ?? '').trim()
        const workerHistoryName =
          String(linkedWorkerForLabel?.workerName ?? linkedWorkerForLabel?.name ?? workerName).trim() || workerName
        const status = String(entry?.status ?? '').trim() || 'Brak zmiany'
        const morningText = dashboardScheduleShiftText(entry?.morningStart, entry?.morningTask)
        const afternoonText = dashboardScheduleShiftText(entry?.afternoonStart, entry?.afternoonTask)
        const startTime = dashboardScheduleStartTime(entry)
        const statusClass = status === 'Praca' ? 'is-work' : 'is-off'
        const startMinutes = dashboardScheduleTimeToMinutes(startTime)
        const startTs = dashboardScheduleStartTimestamp(dayKey, startMinutes)
        const hasScheduleStart = startTs > 0
        const activeIdSource =
          dashboardResolveWorkerIdValue(
            {
              workerId: entry?.workerId,
              workerLogin:
                workerLogin || linkedWorkerForLabel?.workerLogin || linkedWorkerForLabel?.login || entry?.workerLogin,
              workerName: workerName || entry?.workerName,
            },
            workersPool,
          ) ||
          dashboardResolveWorkerIdValue(linkedWorkerForLabel, workersPool) ||
          ''
        const activeIdKey = normalizeSearchText(activeIdSource)
        const workerKey =
          activeIdKey
            ? `id:${activeIdKey}`
            : `unresolved:${normalizeSearchText(workerLogin || workerHistoryName || workerName) || 'worker'}`
        const todayState = activeIdKey ? todayWorkerStateMap.get(`id:${activeIdKey}`) : null

        const actualStartMinutes = Number(todayState?.startMinutes ?? -1)
        const hasQrStartAny = Boolean(todayState?.hasStart) && actualStartMinutes >= 0
        const hasQrStartActive = isWorkerAssignable && hasQrStartAny
        const lateMinutes =
          isWorkerAssignable && hasQrStartAny && hasScheduleStart && actualStartMinutes > startMinutes
            ? Math.max(1, actualStartMinutes - startMinutes)
            : 0
        const minutesToStart = hasScheduleStart ? Math.floor((startTs - nowTs) / (60 * 1000)) : null
        const isUpcomingSoon =
          isWorkerAssignable &&
          !hasQrStartAny &&
          status === 'Praca' &&
          hasScheduleStart &&
          Number.isFinite(minutesToStart) &&
          minutesToStart >= 0 &&
          minutesToStart <= DASHBOARD_SCHEDULE_SOON_WINDOW_MINUTES
        const isMissingStart =
          isWorkerAssignable &&
          !hasQrStartAny &&
          status === 'Praca' &&
          hasScheduleStart &&
          Number.isFinite(minutesToStart) &&
          minutesToStart < 0
        const isLaterToday =
          isWorkerAssignable &&
          !hasQrStartAny &&
          status === 'Praca' &&
          hasScheduleStart &&
          Number.isFinite(minutesToStart) &&
          minutesToStart > DASHBOARD_SCHEDULE_SOON_WINDOW_MINUTES

        // Priorytet kart:
        // 0) czerwony: brak START (po czasie)
        // 1) pomarańczowy: start do 1h
        // 2) zielony: już rozpoczął (QR START)
        // 3) domyślny: start dziś, ale za >1h
        // 4) pozostałe
        const priority = isMissingStart ? 0 : isUpcomingSoon ? 1 : hasQrStartActive ? 2 : isLaterToday ? 3 : 4
        let toneClass = ''
        if (isMissingStart) {
          toneClass = 'is-missing-start'
        } else if (isUpcomingSoon) {
          toneClass = 'is-upcoming'
        } else if (hasQrStartActive) {
          toneClass = 'is-started'
        }

        return {
          workerKey,
          workerName,
          workerDisplayName,
          workerLogin,
          workerHistoryName,
          status,
          morningText,
          afternoonText,
          startTime,
          statusClass,
          hasQrStartAny,
          hasQrStartActive,
          lateMinutes,
          startMinutes,
          hasScheduleStart,
          isWorkerAssignable,
          isMissingStart,
          priority,
          toneClass,
        }
      })
    const enrichedEntries = dashboardMergeScheduleEntries(enrichedRows)
      .sort((left, right) => {
        if (left.priority !== right.priority) {
          return left.priority - right.priority
        }

        const leftStart = left.hasScheduleStart ? left.startMinutes : Number.POSITIVE_INFINITY
        const rightStart = right.hasScheduleStart ? right.startMinutes : Number.POSITIVE_INFINITY
        if (leftStart !== rightStart) {
          return leftStart - rightStart
        }

        return left.workerName.localeCompare(right.workerName, 'pl', { sensitivity: 'base' })
      })

    cardsRoot.innerHTML = enrichedEntries
      .map((entry) => {
        const cardClass = entry.toneClass ? `dash-schedule-card ${entry.toneClass}` : 'dash-schedule-card'
        const workerButton = `
          <button
            type="button"
            class="dash-schedule-worker-name dash-schedule-worker-link"
            title="Pokaż historię czasu: ${escapeHtml(entry.workerHistoryName)}"
            data-dash-worker-login="${escapeHtml(entry.workerLogin)}"
            data-dash-worker-name="${escapeHtml(entry.workerHistoryName)}"
          >${escapeHtml(entry.workerDisplayName || dashboardWorkerSurnameDisplayName(entry.workerName))}</button>
        `
        return `
          <article class="${cardClass}">
            <div class="dash-schedule-top">
              <span class="dash-schedule-worker-meta">
                ${workerButton}
                ${entry.hasQrStartActive ? '<span class="dash-schedule-start-icon" title="Pracownik rozpoczął dzień (QR START)" aria-label="Pracownik rozpoczął dzień (QR START)">✓</span>' : ''}
              </span>
              <span class="dash-schedule-status-badge ${entry.statusClass}">${escapeHtml(entry.status)}</span>
            </div>
            <div class="dash-schedule-startline">
              <div class="dash-schedule-line-label">Godz. START</div>
              <div class="dash-schedule-start-value" title="${escapeHtml(entry.startTime)}">${escapeHtml(entry.startTime)}</div>
            </div>
            ${entry.lateMinutes > 0 ? `<div class="dash-schedule-late">Spóźnienie - ${escapeHtml(dashboardLateMinutesToHm(entry.lateMinutes))}</div>` : ''}
            <div class="dash-schedule-shifts">
              <div class="dash-schedule-line">
                <div class="dash-schedule-line-label">Rano</div>
                <div class="dash-schedule-line-text" title="${escapeHtml(entry.morningText)}">${escapeHtml(entry.morningText)}</div>
              </div>
              <div class="dash-schedule-line">
                <div class="dash-schedule-line-label">Popołudnie</div>
                <div class="dash-schedule-line-text" title="${escapeHtml(entry.afternoonText)}">${escapeHtml(entry.afternoonText)}</div>
              </div>
            </div>
          </article>
        `
      })
      .join('')
    cardsRoot.scrollTop = 0
    window.requestAnimationFrame(() => {
      cardsRoot.scrollTop = 0
    })

    dashboardQueueScheduleVisibleLimit()
    const missingStartEntries = enrichedEntries.filter((entry) => entry.isWorkerAssignable && entry.isMissingStart)
    dashboardShowScheduleMissingStartAlert(dayKey, missingStartEntries)
    const lateStartedEntries = enrichedEntries.filter(
      (entry) =>
        entry.isWorkerAssignable &&
        entry.hasQrStartAny &&
        Number(entry.lateMinutes) >= DASHBOARD_SCHEDULE_LATE_ALERT_MINUTES,
    )
    dashboardShowScheduleLateStartAlert(dayKey, lateStartedEntries)
  }

  function renderDashboardSchedulePanel() {
    const dayNameNode = document.getElementById('dashScheduleDayName')
    const dayDateNode = document.getElementById('dashScheduleDayDate')
    const syncNode = document.getElementById('dashScheduleSync')
    const prevButton = document.getElementById('dashSchedulePrevBtn')
    const nextButton = document.getElementById('dashScheduleNextBtn')

    const days = Array.isArray(appState.dashboardScheduleDays) ? appState.dashboardScheduleDays : []
    if (!days.length) {
      const selectedDay = dashboardActivityDayKey(appState.dashboardScheduleSelectedDay || appState.dashboardActivityDay || todayYmd())
      const generatedBucket = dashboardScheduleSyntheticBucket(selectedDay)
      const isLoading = Boolean(appState.dashboardScheduleLoading)
      const errorMessage = String(appState.dashboardScheduleError ?? '').trim()
      if (dayNameNode) dayNameNode.textContent = isLoading ? 'Ładowanie' : generatedBucket.dayName
      if (dayDateNode) dayDateNode.textContent = generatedBucket.dateLabel
      if (syncNode) {
        syncNode.textContent = isLoading
          ? 'Pobieranie grafiku...'
          : errorMessage
            ? `Nie udało się pobrać grafiku: ${errorMessage}`
            : 'Ostatnia synchronizacja: -'
      }
      if (prevButton) prevButton.disabled = false
      if (nextButton) nextButton.disabled = false
      dashboardRenderScheduleCards(generatedBucket)
      return
    }

    const todayKey = todayYmd()
    const selectedDayKey = String(appState.dashboardScheduleSelectedDay || appState.dashboardActivityDay || todayKey).trim()
    const selectedIsDate = /^\d{4}-\d{2}-\d{2}$/.test(selectedDayKey)
    const selectedExists = days.some((day) => day.key === selectedDayKey)
    if (!selectedExists && !selectedIsDate) {
      const todayBucket = days.find((day) => day.key === todayKey)
      appState.dashboardScheduleSelectedDay = String(todayBucket?.key ?? dashboardPickNearestScheduleDayKey(days, todayKey))
    } else if (selectedIsDate) {
      appState.dashboardScheduleSelectedDay = selectedDayKey
    }

    const currentIndex = days.findIndex((day) => day.key === appState.dashboardScheduleSelectedDay)
    const bucket = currentIndex >= 0
      ? days[currentIndex]
      : dashboardScheduleBucketForDay(appState.dashboardScheduleSelectedDay || todayKey)
    appState.dashboardScheduleSelectedDay = String(bucket?.key ?? '')

    if (dayNameNode) {
      dayNameNode.textContent = dashboardScheduleDayDisplayName(bucket?.dayName || '')
    }
    if (dayDateNode) {
      dayDateNode.textContent = String(bucket?.dateLabel ?? '-')
    }

    const fetchedAtIso = toIso(appState.dashboardScheduleFetchedAt)
    if (syncNode) {
      syncNode.textContent = fetchedAtIso
        ? `Ostatnia synchronizacja: ${formatDatePl(fetchedAtIso)} ${formatTime(fetchedAtIso)}${
            appState.dashboardScheduleStale ? ' (ostatnie zapisane dane)' : ''
          }`
        : 'Ostatnia synchronizacja: -'
    }

    if (prevButton) prevButton.disabled = false
    if (nextButton) nextButton.disabled = false

    dashboardRenderScheduleCards(bucket)
  }

  function dashboardMoveScheduleDay(offset = 0) {
    const current = dashboardActivityDayKey(appState.dashboardScheduleSelectedDay || appState.dashboardActivityDay || todayYmd())
    dashboardSetActivityDay(calendarAddDays(current, Number(offset || 0)))
  }

  function syncDashboardSidePanelHeight() {
    const panel = document.querySelector('#view-dashboard .dash-side-panel')
    if (!(panel instanceof HTMLElement)) {
      return
    }

    panel.style.removeProperty('--dash-side-target-height')
    dashboardQueueScheduleVisibleLimit()
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

  function dashboardBuildScheduleStartMinutesMapForDay(scheduleDays = [], dayKey = '') {
    const normalizedDayKey = String(dayKey ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDayKey)) {
      return new Map()
    }

    const buckets = Array.isArray(scheduleDays) ? scheduleDays : []
    const dayBucket = buckets.find((bucket) => String(bucket?.key ?? '').trim() === normalizedDayKey)
    const entries = Array.isArray(dayBucket?.entries) ? dayBucket.entries : []
    if (!entries.length) {
      return new Map()
    }

    const startByWorker = new Map()
    entries.forEach((entry) => {
      const status = String(entry?.status ?? '').trim()
      if (status && status !== 'Praca') {
        return
      }

      const startTime = dashboardScheduleStartTime(entry)
      const startMinutes = dashboardScheduleTimeToMinutes(startTime)
      if (!Number.isFinite(startMinutes) || startMinutes < 0) {
        return
      }

      const keys = dashboardResolveScheduleWorkerAliasKeys(entry)
      keys.forEach((key) => {
        const previous = Number(startByWorker.get(key) ?? Number.POSITIVE_INFINITY)
        if (!Number.isFinite(previous) || startMinutes < previous) {
          startByWorker.set(key, startMinutes)
        }
      })
    })

    return startByWorker
  }

  function dashboardResolveTodayRowAliasKeys(row) {
    return dashboardWorkerIdIdentityKeys(dashboardResolveWorkerIdValue(row))
  }

  function dashboardResolveLateMinutesForTodayRow(row, scheduleStartMap) {
    if (!(scheduleStartMap instanceof Map) || !scheduleStartMap.size) {
      return 0
    }

    const rowKeys = dashboardResolveTodayRowAliasKeys(row)
    if (!(rowKeys instanceof Set) || !rowKeys.size) {
      return 0
    }

    let plannedStartMinutes = Number.POSITIVE_INFINITY
    rowKeys.forEach((key) => {
      const candidate = Number(scheduleStartMap.get(key) ?? Number.POSITIVE_INFINITY)
      if (Number.isFinite(candidate) && candidate >= 0 && candidate < plannedStartMinutes) {
        plannedStartMinutes = candidate
      }
    })
    if (!Number.isFinite(plannedStartMinutes) || plannedStartMinutes === Number.POSITIVE_INFINITY) {
      return 0
    }

    const actualStartMinutes = dashboardScheduleTimeToMinutes(row?.qrStart)
    if (!Number.isFinite(actualStartMinutes) || actualStartMinutes < 0) {
      return 0
    }

    if (actualStartMinutes <= plannedStartMinutes) {
      return 0
    }

    return Math.max(1, actualStartMinutes - plannedStartMinutes)
  }

  function dashboardApplyFirstQrStartToday(todayRows = [], eventRows = [], scheduleDays = appState.dashboardScheduleDays) {
    const rows = Array.isArray(todayRows) ? todayRows : []
    const sourceEvents = Array.isArray(eventRows) ? eventRows : []
    if (!rows.length) {
      return rows
    }

    const todayKey = todayYmd()
    const scheduleStartMap = dashboardBuildScheduleStartMinutesMapForDay(scheduleDays, todayKey)
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

      const rowWithStart = qrStart
        ? {
            ...row,
            qrStart,
          }
        : row

      const lateMinutes = dashboardResolveLateMinutesForTodayRow(rowWithStart, scheduleStartMap)

      return {
        ...rowWithStart,
        lateMinutes,
      }
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
    if (!code || calendarTimelineIsTechnicalEventCode(code)) {
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

  function dashboardBuildSummary(todayRows = [], eventRows = [], periodHourValues = {}, openHistoricalWorkdays = []) {
    const today = todayYmd()
    const systemIssueRangeFrom = dashboardSystemIssueRangeFrom()
    const normalizedTodayRows = Array.isArray(todayRows) ? todayRows : []
    const normalizedEventRows = Array.isArray(eventRows) ? eventRows : []
    const normalizedOpenHistoricalRows = Array.isArray(openHistoricalWorkdays) ? openHistoricalWorkdays : []

    const activeNowRows = normalizedTodayRows.filter((row) => Boolean(row?.isRunning))
    const activeNowKeys = new Set(
      activeNowRows
        .map((row) => dashboardEventIdentityCandidateIds(row).join('|') || dashboardEventRowFingerprintKey(row))
        .filter(Boolean),
    )
    const historicalOpenRows = normalizedOpenHistoricalRows.filter((row) => {
      const dayKey = dashboardResolveDayKey(row)
      if (dayKey === today) {
        return false
      }
      const key = dashboardEventIdentityCandidateIds(row).join('|') || dashboardEventRowFingerprintKey(row)
      if (key && activeNowKeys.has(key)) {
        return false
      }
      if (key) {
        activeNowKeys.add(key)
      }
      return true
    })
    const allActiveNowRows = [...activeNowRows, ...historicalOpenRows]
    const finishedRows = normalizedTodayRows.filter((row) => {
      const stopValue = String(row?.qrStop ?? '').trim()
      const hasStop = Boolean(stopValue) && stopValue !== '--:--:--' && stopValue !== '-:-:-' && stopValue !== '-'
      return !row?.isRunning && hasStop
    })
    const totalTodaySec = normalizedTodayRows.reduce((sum, row) => sum + dashboardParseDurationLabelToSeconds(row?.duration), 0)

    const table1Details = {
      activeNow: allActiveNowRows.map((row) => {
        const rowDay = dashboardResolveDayKey(row, today)
        const datePrefix = rowDay && rowDay !== today ? `Data: ${formatDatePl(`${rowDay}T00:00:00.000Z`)} · ` : ''
        return {
        title: dashboardResolveWorkerLabel(row),
        subtitle: `${datePrefix}START: ${dashboardClockLabelToHm(row?.qrStart, '--:--')} · Klient: ${dashboardResolveClientLabel(row)} · Strefa: ${dashboardResolveZoneLabel(row)}`,
        tab: 'workers',
        row: dashboardBuildHistoryRow(row, rowDay || today),
        }
      }),
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

    const closedStartStopKeys = dashboardClosedStartStopKeys([
      ...normalizedEventRows,
      ...normalizedTodayRows,
      ...normalizedOpenHistoricalRows,
    ])
    const historicalOpenWorkdayRows = normalizedOpenHistoricalRows.filter((row) => {
      const dayKey = dashboardResolveDayKey(row)
      if (!dayKey || dayKey < systemIssueRangeFrom || dayKey >= today) {
        return false
      }
      if (dashboardRowHasWorkdayStop(row) || dashboardRowMatchesClosedStartStop(row, closedStartStopKeys)) {
        return false
      }
      return (
        normalizeEventStatus(row?.status, Boolean(toIso(row?.endAt) || toIso(row?.dayEndAt))) === 'RUNNING' &&
        !toIso(row?.endAt) &&
        !toIso(row?.dayEndAt)
      )
    })
    const openStartStopWorkerDayGroups = new Map()
    historicalOpenWorkdayRows.forEach((row) => {
      const dayKey = dashboardResolveDayKey(row)
      if (!dayKey) {
        return
      }
      const keySource = String(row?.workerLogin ?? row?.workerName ?? '').trim()
      const workerKey = normalizeSearchText(keySource) || String(row?.workdayId ?? row?.id ?? '').trim() || 'unknown'
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
          subtitle: `Data: ${formatDatePl(`${bucket.dayKey}T00:00:00.000Z`)} Â· Klient: ${dashboardResolveClientLabel(probe)} Â· Strefa: ${dashboardResolveZoneLabel(probe)}`,
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
        activeNow: allActiveNowRows.length,
        finishedToday: finishedRows.length,
        totalHoursToday: durationSecondsToHm(totalTodaySec),
        totalHoursCurrentWeek: periodHourValues.totalHoursCurrentWeek ?? '00:00',
        totalHoursPreviousWeek: periodHourValues.totalHoursPreviousWeek ?? '00:00',
        totalHoursCurrentMonth: periodHourValues.totalHoursCurrentMonth ?? '00:00',
        totalHoursPreviousMonth: periodHourValues.totalHoursPreviousMonth ?? '00:00',
        openStartStopYesterday: openStartStopYesterdayIssues.length,
        openCleanYesterday: openCleanYesterdayIssues.length,
        cleanTooLong: cleanTooLongDetails.length,
      },
      details: {
        activeNow: table1Details.activeNow,
        finishedToday: table1Details.finishedToday,
        totalHoursToday: table1Details.totalHoursToday,
        openStartStopYesterday: openStartStopYesterdayIssues,
        openCleanYesterday: openCleanYesterdayIssues,
        cleanTooLong: cleanTooLongDetails,
      },
    }
  }

  function renderDashboardSummary(summary) {
    const values = summary?.values ?? {}
    appState.dashboardMetricDetails = summary?.details ?? {}
    appState.dashboardMetricValues = values

    const setValue = (id, value) => {
      const node = document.getElementById(id)
      if (node) {
        node.textContent = String(value ?? '0')
      }
    }

    setValue('sumActiveNowCount', values.activeNow ?? 0)
    setValue('sumFinishedTodayCount', values.finishedToday ?? 0)
    setValue('sumTotalHoursToday', values.totalHoursToday ?? '00:00')
    setValue('sumOpenStartStopYesterdayCount', values.openStartStopYesterday ?? 0)
    setValue('sumOpenCleanYesterdayCount', values.openCleanYesterday ?? 0)
    setValue('sumCleanTooLongCount', values.cleanTooLong ?? 0)
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
    const columnLabel = kanbanColumnsForStatus().find((column) => column.id === status)?.label || 'Kanban'
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
    if (snapshot.summary) {
      renderDashboardSummary(snapshot.summary)
    }
    if (Array.isArray(snapshot.todayRows)) {
      appState.dashboardTodayRows = snapshot.todayRows
      renderDashboardEvents(snapshot.todayRows)
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

  function dashboardHideMetricPopover() {
    if (dashboardMetricPopoverHideTimer) {
      window.clearTimeout(dashboardMetricPopoverHideTimer)
      dashboardMetricPopoverHideTimer = null
    }

    const popover = document.getElementById('dashMetricPopover')
    if (!popover) {
      return
    }

    popover.style.display = 'none'
    popover.removeAttribute('data-metric')
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
    const label = String(button?.querySelector('.dash-summary-row-label')?.textContent ?? '').trim()
    return label || 'Szczegóły'
  }

  function dashboardShowMetricPopover(metricKey, anchorButton) {
    const popover = document.getElementById('dashMetricPopover')
    const titleNode = document.getElementById('dashMetricPopoverTitle')
    const listNode = document.getElementById('dashMetricPopoverList')
    if (!popover || !titleNode || !listNode || !(anchorButton instanceof HTMLElement)) {
      return
    }

    dashboardCancelMetricPopoverHide()
    const details = dashboardMetricDetailsOrEmpty(metricKey)
    const maxRows = 24
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
                title="Przejdz do rekordu"
              >
                <span class="dash-metric-popover-item-title">${escapeHtml(detail?.title ?? '-')}</span>
                <span class="dash-metric-popover-item-subtitle">${escapeHtml(detail?.subtitle ?? '-')}</span>
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
      : '<div class="dash-metric-popover-empty">Brak szczegółów.</div>'

    popover.style.display = 'block'
    popover.style.visibility = 'hidden'
    popover.setAttribute('data-metric', String(metricKey ?? ''))

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
    const tab = String(detail?.tab ?? '').trim() || 'workers'
    await openEventHistoryFromRow(row, tab)
  }

  function dashboardLateMinutesToHm(value) {
    const minutes = Number(value ?? 0)
    const normalizedMinutes = Number.isFinite(minutes) && minutes > 0 ? Math.floor(minutes) : 0
    return durationSecondsToHm(normalizedMinutes * 60)
  }

  function dashboardApplyScheduleBoard(scheduleBoard) {
    if (scheduleBoard && Array.isArray(scheduleBoard.days)) {
      appState.dashboardScheduleDays = scheduleBoard.days
      if (scheduleBoard.fetchedAtIso !== undefined) {
        appState.dashboardScheduleFetchedAt = String(scheduleBoard.fetchedAtIso ?? '')
      }
      appState.dashboardScheduleStale = Boolean(scheduleBoard.stale)
      appState.dashboardScheduleError = scheduleBoard.stale ? String(scheduleBoard.staleReason ?? '').trim() : ''
      const preferredToday = String(scheduleBoard.todayKey ?? '').trim()
      const selectedExists = scheduleBoard.days.some((day) => day.key === appState.dashboardScheduleSelectedDay)
      const todayMatch = scheduleBoard.days.find((day) => day.key === preferredToday)
      if (todayMatch?.key) {
        if (!appState.dashboardScheduleSelectedDay || !selectedExists) {
          appState.dashboardScheduleSelectedDay = String(todayMatch.key)
        }
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(preferredToday) && (!appState.dashboardScheduleSelectedDay || !selectedExists)) {
        appState.dashboardScheduleSelectedDay = preferredToday
      } else {
        appState.dashboardScheduleSelectedDay = String(
          dashboardPickNearestScheduleDayKey(scheduleBoard.days, preferredToday),
        )
      }
    } else if (!appState.dashboardScheduleDays.length) {
      appState.dashboardScheduleDays = []
      appState.dashboardScheduleStale = false
      if (!appState.dashboardScheduleFetchedAt) {
        appState.dashboardScheduleFetchedAt = ''
      }
    }

    renderDashboardSchedulePanel()
  }

  async function dashboardLoadHistoricalOpenWorkdays(orgId, options = {}) {
    const activeOrgId = String(orgId ?? '').trim()
    if (!activeOrgId) {
      return { items: [] }
    }

    return getWorkdays(activeOrgId, {
      source: 'workdays',
      status: 'RUNNING',
      fromIso: dashboardSystemIssueRangeFrom(),
      toIso: daysAgoYmd(1),
      page: 1,
      pageSize: DASHBOARD_OPEN_WORKDAYS_PAGE_SIZE,
      forceRefresh: options.forceRefresh === true,
    }).catch((error) => {
      console.warn('[portal/dashboard] historical open workdays fetch failed', error)
      return { items: [] }
    })
  }

  async function dashboardLoadFastRows(orgId, options = {}) {
    const rangeTo = todayYmd()
    const systemIssueEventsFrom = dashboardSystemIssueRangeFrom()
    const fastEventsFrom = daysAgoYmd(DASHBOARD_COMMENT_SYNC_LOOKBACK_DAYS)
    const forceRefresh = options.forceRefresh === true
    const [todayActive, systemIssueEvents, recentEvents, todayWorkdays, openHistoricalWorkdays] = await Promise.all([
      getTodayActiveWorkers(orgId, { forceRefresh }),
      getWorkdays(orgId, {
        source: 'events',
        fromIso: systemIssueEventsFrom,
        toIso: rangeTo,
        page: 1,
        pageSize: 12000,
        forceRefresh,
      }).catch(() => ({ items: [] })),
      getWorkdays(orgId, {
        source: 'events',
        fromIso: fastEventsFrom,
        toIso: rangeTo,
        page: 1,
        pageSize: 5000,
        forceRefresh,
      }).catch(() => ({ items: [] })),
      getWorkdays(orgId, {
        source: 'workdays',
        fromIso: rangeTo,
        toIso: rangeTo,
        page: 1,
        pageSize: 5000,
        forceRefresh,
      }).catch(() => ({ items: [] })),
      dashboardLoadHistoricalOpenWorkdays(orgId, { forceRefresh }),
    ])

    const todayStartSourceRows = [...(recentEvents.items ?? []), ...(todayWorkdays.items ?? [])]
    appState.dashboardScheduleSourceRows = todayStartSourceRows
    appState.dashboardActivityWorkdayRows = Array.isArray(todayWorkdays.items) ? todayWorkdays.items : []
    const todayRows = dashboardApplyFirstQrStartToday(
      todayActive.items ?? [],
      todayWorkdays.items ?? [],
      appState.dashboardScheduleDays,
    )

    return { todayRows, recentEvents, systemIssueEvents, todayWorkdays, openHistoricalWorkdays }
  }

  async function dashboardRefreshBackgroundData(orgId, options = {}) {
    const activeOrgId = String(appState.session?.orgId ?? '').trim()
    if (!orgId || orgId !== activeOrgId) {
      return
    }

    const rangeFrom = dashboardCommentSyncRangeFrom(orgId, { forceFull: options.forceFull === true })
    const systemIssueRangeFrom = dashboardSystemIssueRangeFrom()
    const rangeTo = todayYmd()
    let fetchFailed = false
    const [recentEvents, systemIssueEvents, openHistoricalWorkdays] = await Promise.all([
      getWorkdays(orgId, {
        source: 'events',
        fromIso: rangeFrom,
        toIso: rangeTo,
        page: 1,
        pageSize: 12000,
      }).catch((error) => {
        fetchFailed = true
        console.warn('[portal/dashboard] comment sync fetch failed', error)
        return { items: [] }
      }),
      getWorkdays(orgId, {
        source: 'events',
        fromIso: systemIssueRangeFrom,
        toIso: rangeTo,
        page: 1,
        pageSize: 12000,
        forceRefresh: options.forceRefresh === true,
      }).catch((error) => {
        fetchFailed = true
        console.warn('[portal/dashboard] system issue fetch failed', error)
        return { items: [] }
      }),
      dashboardLoadHistoricalOpenWorkdays(orgId, { forceRefresh: options.forceRefresh === true }),
    ])

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

  function dashboardStartScheduleRefresh(orgId, options = {}) {
    const activeOrgId = String(orgId ?? appState.session?.orgId ?? '').trim()
    if (!activeOrgId) {
      return null
    }

    if (dashboardScheduleRefreshPromise) {
      return dashboardScheduleRefreshPromise
    }

    appState.dashboardScheduleLoading = true
    appState.dashboardScheduleError = ''
    appState.dashboardScheduleStale = false
    renderDashboardSchedulePanel()

    dashboardScheduleRefreshPromise = getScheduleBoard({ forceRefresh: options.forceRefresh === true })
      .then((scheduleBoard) => {
        if (String(appState.session?.orgId ?? '').trim() === activeOrgId) {
          appState.dashboardScheduleLoading = false
          dashboardApplyScheduleBoard(scheduleBoard)
        }
      })
      .catch((error) => {
        console.warn('[portal/dashboard] schedule refresh failed', error)
        if (String(appState.session?.orgId ?? '').trim() === activeOrgId) {
          appState.dashboardScheduleLoading = false
          appState.dashboardScheduleError = error instanceof Error ? error.message : 'Błąd pobierania danych.'
          dashboardApplyScheduleBoard(null)
        }
      })
      .finally(() => {
        dashboardScheduleRefreshPromise = null
        if (String(appState.session?.orgId ?? '').trim() === activeOrgId) {
          appState.dashboardScheduleLoading = false
          renderDashboardSchedulePanel()
        }
      })
    return dashboardScheduleRefreshPromise
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
          if (appState.dashboardScheduleDays.length) {
            renderDashboardSchedulePanel()
          }
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
      dashboardStartScheduleRefresh(orgId, { forceRefresh: options.forceRefresh === true })
      if (showLoadingOverlay) {
        dashboardBeginLoading()
      }
      try {
        const { todayRows, recentEvents, systemIssueEvents, openHistoricalWorkdays } = await dashboardLoadFastRows(orgId, {
          forceRefresh: options.forceRefresh === true,
        })
        const summary = dashboardBuildSummary(
          todayRows,
          systemIssueEvents.items ?? [],
          dashboardBuildPeriodHourValues(todayRows),
          openHistoricalWorkdays.items ?? [],
        )
        const comments = dashboardBuildNewComments(recentEvents.items ?? [], [])
        renderDashboardSummary(summary)
        await dashboardRevealLoadingStage('overview')
        renderDashboardKanbanTasks()
        renderDashboardNewComments(comments)
        await dashboardRevealLoadingStage('tasks')
        renderDashboardEvents(todayRows)
        await dashboardRevealLoadingStage('active')
        renderDashboardSchedulePanel()
        await dashboardRevealLoadingStage('schedule')
        setDashboardLastRefresh(new Date())
        void rememberDashboardTimelineFingerprint(orgId)
        dashboardWriteLocalSnapshot(orgId, {
          summary,
          todayRows,
          activityWorkdayRows: appState.dashboardActivityWorkdayRows,
          scheduleSourceRows: appState.dashboardScheduleSourceRows,
          comments,
        })
      } finally {
        if (showLoadingOverlay) {
          dashboardEndLoading()
        }
      }

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
    renderDashboardSchedulePanel()
    dashboardApplyActivityView()
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
      renderDashboardSchedulePanel()
      dashboardApplyActivityView()
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
      renderDashboardSchedulePanel()
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

    syncDashboardSidePanelHeight()
    requestAnimationFrame(() => syncDashboardSidePanelHeight())
    appState.dashboardActivityDay = dashboardActivityDayKey(todayYmd())
    appState.dashboardScheduleSelectedDay = appState.dashboardActivityDay
    appState.dashboardActivityView = dashboardReadActivityViewPreference()
    dashboardSetActivityView(appState.dashboardActivityView, { persist: false })

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
          showTransientNotice('Pulpit został odświeżony.')
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

    binding.add(document.getElementById('dashSchedulePrevBtn'), 'click', () => {
      dashboardMoveScheduleDay(-1)
    })

    binding.add(document.getElementById('dashScheduleNextBtn'), 'click', () => {
      dashboardMoveScheduleDay(1)
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

    binding.add(document.getElementById('dashScheduleRefreshBtn'), 'click', (event) => {
      void (async () => {
        if (!appState.session?.orgId) {
          return
        }

        const button =
          event.currentTarget instanceof HTMLButtonElement
            ? event.currentTarget
            : document.getElementById('dashScheduleRefreshBtn')
        if (!button || button.disabled) {
          return
        }

        button.disabled = true
        button.classList.add('is-loading')
        button.setAttribute('aria-busy', 'true')

        try {
          await refreshDashboardWidgets({ forceRefresh: true, syncWorktimeToken: true })
          showTransientNotice('Grafik dnia został odświeżony.')
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Nie udało się odświeżyć grafiku dnia.'
          showTransientNotice(message, 'error')
        } finally {
          button.disabled = false
          button.classList.remove('is-loading')
          button.setAttribute('aria-busy', 'false')
        }
      })()
    })

    const metricButtons = [...document.querySelectorAll('[data-dash-metric]')]
    metricButtons.forEach((button) => {
      const metricKey = String(button.getAttribute('data-dash-metric') ?? '').trim()
      if (!metricKey) {
        return
      }

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

      binding.add(button, 'blur', () => {
        dashboardScheduleMetricPopoverHide()
      })

      binding.add(button, 'click', () => {
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
      const related = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null
      if (related?.closest?.('[data-dash-metric]')) {
        return
      }
      dashboardScheduleMetricPopoverHide()
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

    binding.add(window, 'resize', () => {
      dashboardHideMetricPopover()
      syncDashboardSidePanelHeight()
    })
    binding.add(window, 'scroll', () => {
      dashboardHideMetricPopover()
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

      const eventBar = event.target.closest('[data-dash-activity-event-edit]')
      if (eventBar instanceof HTMLElement) {
        event.preventDefault()
        event.stopPropagation()
        void openDashboardActivityEventEditor(eventBar)
      }
    })

    binding.add(document.getElementById('dashActivityCalendar'), 'keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return
      }
      const eventBar = event.target.closest('[data-dash-activity-event-edit]')
      if (eventBar instanceof HTMLElement) {
        event.preventDefault()
        event.stopPropagation()
        void openDashboardActivityEventEditor(eventBar)
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

    binding.add(document.getElementById('dashScheduleCards'), 'click', (event) => {
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
    dashboardHideScheduleMissingStartAlert()
    dashboardHideScheduleLateStartAlert()
    if (dashboardScheduleLimitRaf) {
      window.cancelAnimationFrame(dashboardScheduleLimitRaf)
      dashboardScheduleLimitRaf = 0
    }
    if (dashboardScheduleLimitTimerA) {
      window.clearTimeout(dashboardScheduleLimitTimerA)
      dashboardScheduleLimitTimerA = 0
    }
    if (dashboardScheduleLimitTimerB) {
      window.clearTimeout(dashboardScheduleLimitTimerB)
      dashboardScheduleLimitTimerB = 0
    }
    if (dashboardLoadingOverlayTimer) {
      window.clearTimeout(dashboardLoadingOverlayTimer)
      dashboardLoadingOverlayTimer = 0
    }
    dashboardBackgroundRefreshPromise = null
    dashboardReferencePreloadPromise = null
    dashboardScheduleRefreshPromise = null
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
    startScheduleRefresh: dashboardStartScheduleRefresh,
    stopAutoRefresh: stopDashboardAutoRefresh,
    syncLoadingOverlay: dashboardSyncLoadingOverlay,
    renderActivityCalendar: renderDashboardActivityCalendar,
    renderKanbanTasks: renderDashboardKanbanTasks,
    hideMetricPopover: dashboardHideMetricPopover,
    hideScheduleMissingStartAlert: dashboardHideScheduleMissingStartAlert,
    hideScheduleLateStartAlert: dashboardHideScheduleLateStartAlert,
    deferRouteTaskDataRefresh,
    hydrate: hydrateSections,
    loadFastRows: dashboardLoadFastRows,
    helpers,
    cleanup,
  }
}
