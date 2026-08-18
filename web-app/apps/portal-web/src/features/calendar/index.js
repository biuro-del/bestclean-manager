import template from './template.html?raw'
import { isScheduleOrderActive } from '../../services/scheduleOrderLifecycle'
import { scheduleConflictPreflightCandidates } from '../../services/scheduleConflictPreflight'
import { scheduleOrderSaveRetryDelay } from '../../services/scheduleOrderSaveRetry'
import {
  SCHEDULE_START_GRACE_MINUTES,
  isScheduleStartOverdue,
} from '../../services/scheduleStartStatusPolicy'
import { assertCompletePagedResponse } from '../../services/workdayReadCostPolicy'

export const route = 'calendar'
export const viewId = 'view-calendar'
export { template }

export function createCalendarFeature(ctx) {
  const {
    CALENDAR_HOUR_HEIGHT_PX,
    CALENDAR_MIN_TIMED_TASK_HEIGHT_PX,
    CALENDAR_TIMED_TASK_GAP_PX,
    CALENDAR_TIMED_TASK_OVERLAP_OFFSET_PX,
    CALENDAR_TIMELINE_SLOTS_PER_HOUR,
    CALENDAR_TIMELINE_SLOT_MINUTES,
    CALENDAR_TIMELINE_STATUS_REFRESH_MS,
    CALENDAR_TONE_OPTIONS,
    appState,
    applyEventsFilterInputs,
    calendarActivityEntry,
    calendarActivityTimestamp,
    calendarAddDays,
    calendarAppendTaskActivity,
    calendarCompletionActivityDetails,
    calendarCompletionNoteForTask,
    calendarDateFromYmd,
    calendarDateLabelFromYmd,
    calendarDateToYmd,
    calendarDayNumberLabel,
    calendarDayShortLabel,
    calendarDayToneClass,
    calendarDeleteRemoteTasksById,
    calendarDirectoryOptions,
    calendarLoadTasks,
    calendarMinutesToTime,
    calendarMonthGridStart,
    calendarMonthLabel,
    calendarMonthStart,
    calendarNormalizeActivityLog,
    calendarNormalizeSelectionList,
    calendarNormalizeTask,
    calendarNormalizeTimeValue,
    calendarNormalizeZoneSelection,
    calendarReadZoneSelection,
    calendarSaveTasks,
    calendarSelectionLabels,
    calendarSelectionText,
    calendarSortTasks,
    calendarStartOfWeek,
    calendarSyncZoneOptions,
    calendarTaskChangeDetails,
    calendarTaskReadByCurrentUser,
    calendarTaskZoneText,
    calendarTimeToMinutes,
    calendarTimelineRowAllowsOverlap,
    calendarWorkerId,
    calendarWorkerLabel,
    calendarZoneDisplayLabel,
    createBindingHelpers,
    dashboardActivityCleanCompanyLabel,
    dashboardActivityCompanyLabel,
    dashboardActivityEndDeltaInfo,
    dashboardActivityLatestQrCompanyLabelForRow,
    dashboardActivityStartDeltaInfo,
    dashboardAddUserMatchKey,
    dashboardCanonicalWorkerId,
    dashboardCurrentUserMatchKeys,
    dashboardIsQrCodeLike,
    dashboardLateMinutesToHm,
    dashboardLoadFastRows,
    dashboardReadCommentKeys,
    dashboardResolveClientLabel,
    dashboardResolveDayKey,
    dashboardResolveTodayRowAliasKeys,
    dashboardResolveWorkerIdValue,
    dashboardResolveZoneLabel,
    dashboardRowIsIndividual,
    dashboardRowIsSpecial,
    dashboardScheduleTimeToMinutes,
    dashboardTaskColumnBelongsToCurrentUser,
    dashboardWorkerIdIdentityKeys,
    deleteScheduleTasks,
    durationSecondsToHm,
    escapeHtml,
    eventEditorFirstScannedQr,
    eventTypeInfo,
    fetchClientsForCurrentSession,
    fetchEventsForCurrentSession,
    fetchScheduleTasks,
    fetchWorkersForCurrentSession,
    fetchZonesForCurrentSession,
    firstDayOfCurrentMonthYmd,
    formatDatePl,
    formatTime,
    getWorkdays,
    isBlockingModalOpen,
    isPortalInteractionBusy,
    workerIsAssignable,
    filterAssignableWorkers,
    queuePortalDeferredNotification,
    clearPortalDeferredNotification,
    flushPortalDeferredNotifications,
    kanbanColumnsForStatus,
    kanbanDefaultStatusForTask,
    kanbanInitials,
    kanbanNormalizeColumnScope,
    kanbanTaskIsCompleted,
    mapZoneForView,
    normalizeEventStatus,
    normalizeSearchText,
    openEventEditor,
    ordersApplyWeeklyPatternRuleToOccurrence,
    ordersAssignExtendedWorkFlags,
    ordersConfirmTimelineOrderDelete,
    ordersDefaultEndTime,
    ordersExtendedWorkAllowed,
    ordersFindTimelineOrder,
    ordersFormatWorkMinutes,
    ordersNextOrderId,
    ordersNormalizeDateField,
    ordersNormalizeOrderRows,
    ordersOrderHasInactiveOnlyWorkerAssignments,
    ordersNormalizeTimeField,
    ordersOpenAddEditor,
    ordersOpenEditorFromCalendar,
    ordersOpenRecurringOccurrenceEditorFromCalendar,
    ordersScheduleModeForOrder,
    ordersWeeklyPatternSources,
    ordersNormalizeWeeklyPatternRule,
    ordersStoreWeeklyPatternRules,
    ordersTimelineAddressLabel,
    ordersTimelineClientLabel,
    ordersTimelineOrderCanBeDeleted,
    ordersTimelineToneForType,
    ordersWorkAllocationsForSubjects,
    ordersWorkerAssignmentsFromRows,
    pad2,
    renderDashboardActivityCalendar,
    renderDashboardKanbanTasks,
    renderKanbanView,
    renderOrdersMapView,
    renderOrdersView,
    reportGeoHidePreviewSoon,
    reportGeoOpenModal,
    reportGeoReadCoordsFromNode,
    reportGeoShowPreview,
    reportHistoryExtractGpsCoords,
    reportHistoryExtractQrFromComment,
    reportHistoryIsSystemEntrySource,
    reportHistoryNormalizeQrCode,
    reportHistoryParseGeoPair,
    reportHistoryResolveClientByZoneCode,
    reportHistoryResolveDayGpsCoords,
    reportHistoryResolveDayQrCandidate,
    reportHistoryResolveDayQrCode,
    resolveZoneByQrCandidate,
    roleLevel,
    setScheduleTaskLifecycleStatus,
    showPortalErrorNotice,
    showTransientNotice,
    toIso,
    todayYmd,
    upsertScheduleTasks,
    zoneQrCodeFromRow,
  } = ctx

  let ordersRemoteSaveTimer = 0
  let ordersRemoteRetryTimer = 0
  let calendarTimelineWorkerStateRefreshTimer = null
  let calendarTimelineBarClickTimer = 0
  let calendarTimelineEventsPopupSequence = 0
  let calendarTimelineEventsPopupZIndex = 12000
  let calendarTimelineEventsPopupDragState = null
  let calendarRenderRaf = 0
  let calendarTimelineWorkerStateLoadPromise = null
  let calendarTimelineOrdersRemotePromise = null
  let calendarTimelineOrdersRemotePromiseKey = ''
  let calendarTimelineOrdersRemoteGeneration = 0
  let calendarTimelineOrdersRemoteSavePromise = null
  let calendarTimelineOrdersRemoteSavePromiseKey = ''
  let calendarTimelineOrdersRemoteSaveSignature = ''
  let calendarTimelineOrdersQueuedSave = null
  let calendarTimelineOrdersRemoteRetryCount = 0
  const calendarTimelineEventsPopupRegistry = new Map()
  const calendarTimelineWorkerStateMapCache = { key: '', value: new Map() }
  const calendarTimelineResourcesCache = { key: '', value: [] }
  const calendarTimelineModelCache = { key: '', value: null }
  const ORDERS_LOCAL_RETENTION_MS = 5 * 60 * 1000

  function calendarPerformanceEnabled() {
    return typeof performance !== 'undefined' && Boolean(import.meta.env?.DEV)
  }

  function calendarMarkPerformance(name = '') {
    const label = String(name ?? '').trim()
    if (!label || !calendarPerformanceEnabled()) {
      return
    }
    try {
      performance.mark(label)
    } catch {
      // Performance marks are best-effort diagnostics only.
    }
  }

  function calendarMeasurePerformance(name = '', start = '', end = '') {
    const label = String(name ?? '').trim()
    const startMark = String(start ?? '').trim()
    const endMark = String(end ?? '').trim()
    if (!label || !startMark || !endMark || !calendarPerformanceEnabled()) {
      return
    }
    try {
      performance.measure(label, startMark, endMark)
    } catch {
      // Missing marks should never affect the calendar.
    }
  }

  function calendarMarkRouteEnter() {
    calendarMarkPerformance('calendar-route-enter')
  }

  function calendarMarkDataReady() {
    calendarMarkPerformance('calendar-data-ready')
    calendarMeasurePerformance('calendar-route-to-data', 'calendar-route-enter', 'calendar-data-ready')
  }

  function calendarInvalidateTimelineRenderCaches(options = {}) {
    calendarTimelineResourcesCache.key = ''
    calendarTimelineResourcesCache.value = []
    calendarTimelineModelCache.key = ''
    calendarTimelineModelCache.value = null
    if (options.workerState !== false) {
      calendarTimelineWorkerStateMapCache.key = ''
      calendarTimelineWorkerStateMapCache.value = new Map()
    }
  }

  function calendarScheduleRender(reasonOrOptions = {}, maybeOptions = {}) {
    const options =
      reasonOrOptions && typeof reasonOrOptions === 'object'
        ? reasonOrOptions
        : maybeOptions
    if (appState.currentRoute !== 'calendar') {
      return false
    }
    if (options.markDataReady === true) {
      calendarMarkDataReady()
    }
    if (options.immediate === true || typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      if (calendarRenderRaf && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(calendarRenderRaf)
      }
      calendarRenderRaf = 0
      renderCalendarView()
      return true
    }
    if (calendarRenderRaf) {
      return true
    }
    calendarRenderRaf = window.requestAnimationFrame(() => {
      calendarRenderRaf = 0
      if (appState.currentRoute === 'calendar') {
        renderCalendarView()
      }
    })
    return true
  }

  function calendarWorkerIsAssignable(worker = {}) {
    return typeof workerIsAssignable === 'function' ? workerIsAssignable(worker) : worker?.active !== false
  }

  function calendarSafeInitials(name = '') {
    try {
      if (typeof kanbanInitials === 'function') {
        const initials = String(kanbanInitials(name) ?? '').trim()
        if (initials) {
          return initials
        }
      }
    } catch {
      // Calendar can render before the Kanban feature is initialized.
    }
    const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean)
    if (!parts.length) {
      return '?'
    }
    return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase() || parts[0].slice(0, 2).toUpperCase()
  }

  function calendarSafeKanbanTaskIsCompleted(task = {}) {
    try {
      if (typeof kanbanTaskIsCompleted === 'function') {
        return Boolean(kanbanTaskIsCompleted(task))
      }
    } catch {
      // Calendar fallback for lazy-loaded Kanban.
    }
    return Boolean(task?.completed ?? task?.kanbanCompleted ?? false)
  }

  function calendarSafeKanbanColumnsForStatus() {
    try {
      return typeof kanbanColumnsForStatus === 'function' ? kanbanColumnsForStatus() : []
    } catch {
      return []
    }
  }

  function calendarSafeKanbanNormalizeColumnScope(scope = '') {
    try {
      return typeof kanbanNormalizeColumnScope === 'function' ? kanbanNormalizeColumnScope(scope) : 'global'
    } catch {
      return 'global'
    }
  }

  function calendarSafeKanbanDefaultStatusForTask(workers = [], preferredStatus = '') {
    const preferred = String(preferredStatus ?? '').trim()
    try {
      if (typeof kanbanDefaultStatusForTask === 'function') {
        return kanbanDefaultStatusForTask(workers, preferred)
      }
    } catch {
      // Keep saving calendar tasks usable even before Kanban is opened.
    }
    return preferred || 'newTask'
  }

  function calendarAssignableWorkers() {
    return typeof filterAssignableWorkers === 'function'
      ? filterAssignableWorkers(appState.workers)
      : (Array.isArray(appState.workers) ? appState.workers : []).filter((worker) => calendarWorkerIsAssignable(worker))
  }

  function calendarAllToneValues() {
    return CALENDAR_TONE_OPTIONS.map((option) => option.value)
  }
  
  function calendarNormalizeToneFilters(filters) {
    const allowed = new Set(calendarAllToneValues())
    if (!Array.isArray(filters)) {
      return calendarAllToneValues()
    }
    const seen = new Set()
    const normalized = filters
      .map((value) => String(value ?? '').trim())
      .filter((value) => {
        if (!allowed.has(value) || seen.has(value)) {
          return false
        }
        seen.add(value)
        return true
      })
    return normalized.length ? normalized : calendarAllToneValues()
  }
  
  function calendarSelectedToneSet() {
    return new Set(calendarNormalizeToneFilters(appState.calendarToneFilters))
  }
  
  function calendarTaskToneValue(task = {}) {
    const tone = String(task.tone ?? '').trim()
    return calendarAllToneValues().includes(tone) ? tone : 'blue'
  }
  
  function calendarTaskMatchesToneFilter(task = {}) {
    return calendarSelectedToneSet().has(calendarTaskToneValue(task))
  }
  
  function calendarTaskIsRead(task = {}, readCommentKeys = null) {
    if (calendarTaskReadByCurrentUser(task)) {
      return true
    }
    if (task.read || task.isRead || task.seen || task.readAt || task.seenAt || task.acknowledgedAt) {
      return true
    }
    const sourceKey = String(task.sourceCommentKey ?? task.sourceKey ?? '').trim()
    if (!sourceKey) {
      return false
    }
    const keys = readCommentKeys instanceof Set ? readCommentKeys : dashboardReadCommentKeys()
    return keys.has(sourceKey)
  }
  
  function calendarTaskMatchesStatusFilters(task = {}, readCommentKeys = null) {
    if (!appState.calendarShowCompletedTasks && calendarSafeKanbanTaskIsCompleted(task)) {
      return false
    }
    if (!appState.calendarShowReadTasks && calendarTaskIsRead(task, readCommentKeys)) {
      return false
    }
    return true
  }
  
  function calendarRoleText() {
    return normalizeSearchText(appState.session?.role)
  }
  
  function calendarCanSeeAllOrganizationTasks() {
    const role = calendarRoleText()
    return (
      roleLevel(appState.session?.role) >= 2 ||
      role === 'admin' ||
      role === 'administrator' ||
      role === 'owner' ||
      role === 'superadmin' ||
      role.includes('manager') ||
      role.includes('menager') ||
      role.includes('menedzer') ||
      role.includes('kierownik')
    )
  }
  
  function calendarIsCoordinatorRole() {
    const role = calendarRoleText()
    return (
      role.includes('koordynator') ||
      role.includes('koord') ||
      role.includes('coordinator') ||
      role.includes('coordynator') ||
      role === 'member'
    )
  }
  
  function calendarEmptyAccessMatch() {
    return { keys: new Set(), compactKeys: new Set() }
  }
  
  function calendarAddAccessKey(target, value) {
    dashboardAddUserMatchKey(target, value)
    const raw = String(value ?? '').trim()
    if (!raw) {
      return
    }
    const withoutKnownPrefix = raw.replace(/^(client|zone|user|person|object):/i, '').trim()
    if (withoutKnownPrefix && withoutKnownPrefix !== raw) {
      dashboardAddUserMatchKey(target, withoutKnownPrefix)
    }
  }
  
  function calendarAccessMatch(values = []) {
    const match = calendarEmptyAccessMatch()
    values.flat().forEach((value) => calendarAddAccessKey(match, value))
    return match
  }
  
  function calendarMatchHasValues(match) {
    return Boolean(match?.keys?.size || match?.compactKeys?.size)
  }
  
  function calendarValuesMatchAccess(values = [], accessMatch = calendarEmptyAccessMatch()) {
    if (!calendarMatchHasValues(accessMatch)) {
      return false
    }
    const candidate = calendarAccessMatch(values)
    return (
      [...candidate.keys].some((key) => accessMatch.keys.has(key)) ||
      [...candidate.compactKeys].some((key) => accessMatch.compactKeys.has(key))
    )
  }
  
  function calendarSelectionAccessValues(selection = {}) {
    if (selection && typeof selection === 'object') {
      return [
        selection.id,
        selection.label,
        selection.name,
        selection.title,
        selection.value,
        selection.login,
        selection.workerLogin,
        selection.email,
        selection.clientId,
        selection.zoneId,
        selection.zoneName,
      ]
    }
    return [selection]
  }
  
  function calendarSelectionMatchesAccess(selections = [], accessMatch = calendarEmptyAccessMatch()) {
    return calendarNormalizeSelectionList(selections).some((selection) =>
      calendarValuesMatchAccess(calendarSelectionAccessValues(selection), accessMatch),
    )
  }
  
  function calendarSplitAccessValues(value = '') {
    if (Array.isArray(value)) {
      return value.flatMap((item) => calendarSplitAccessValues(item))
    }
    if (value && typeof value === 'object') {
      return calendarSelectionAccessValues(value).filter((item) => String(item ?? '').trim())
    }
    return String(value ?? '')
      .split(/[;,\n|]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  
  function calendarWorkerAccessValues(worker = {}) {
    return [
      calendarWorkerId(worker),
      calendarWorkerLabel(worker),
      worker.id,
      worker.workerId,
      worker.login,
      worker.workerLogin,
      worker.workerName,
      worker.name,
      worker.fullName,
      worker.displayName,
      worker.email,
      worker.loginEmail,
      worker.authUid,
      worker.auth_uid,
      worker.uid,
    ]
  }
  
  function calendarAddWorkerAccessKeys(match, worker = {}) {
    calendarWorkerAccessValues(worker).forEach((value) => calendarAddAccessKey(match, value))
  }
  
  function calendarFindWorkerByHint(hint = '') {
    const hintMatch = calendarAccessMatch([hint])
    return (Array.isArray(appState.workers) ? appState.workers : []).find((worker) =>
      calendarValuesMatchAccess(calendarWorkerAccessValues(worker), hintMatch),
    )
  }
  
  function calendarAddWorkerHintAccess(match, hint = '') {
    calendarAddAccessKey(match, hint)
    const worker = calendarFindWorkerByHint(hint)
    if (worker) {
      calendarAddWorkerAccessKeys(match, worker)
    }
  }
  
  function calendarClientAccessValues(client = {}) {
    const id = String(client.id ?? client.clientId ?? '').trim()
    const name = String(client.name ?? client.clientName ?? '').trim()
    return [id, name, client.nip, client.city, id ? `client:${id}` : '', name ? `client:${name}` : '']
  }
  
  function calendarAddClientAccessKeys(match, client = {}) {
    calendarClientAccessValues(client).forEach((value) => calendarAddAccessKey(match, value))
  }
  
  function calendarZoneAccessValues(zone = {}) {
    const view = mapZoneForView(zone)
    const zoneId = String(view.id ?? view.zoneId ?? view.qr ?? zone.id ?? zone.zoneId ?? zone.qr ?? '').trim()
    const zoneName = String(view.zoneName ?? zone.name ?? zone.zone ?? '').trim()
    const clientId = String(view.clientId ?? zone.clientId ?? '').trim()
    const clientName = String(view.clientName ?? '').trim()
    return [
      zoneId,
      zoneName,
      view.location,
      view.function,
      clientId,
      clientName,
      zoneId ? `zone:${zoneId}` : '',
      zoneName ? `zone:${zoneName}` : '',
      clientId ? `client:${clientId}` : '',
      clientName ? `client:${clientName}` : '',
    ]
  }
  
  function calendarAddZoneAccessKeys(match, zone = {}) {
    calendarZoneAccessValues(zone).forEach((value) => calendarAddAccessKey(match, value))
  }
  
  function calendarCoordinatorAccessScope() {
    const userMatch = dashboardCurrentUserMatchKeys()
    const teamMatch = calendarEmptyAccessMatch()
    const objectMatch = calendarEmptyAccessMatch()
    const responsibleClientIds = new Set()
    const responsibleClientNames = new Set()
  
    ;(Array.isArray(appState.workers) ? appState.workers : []).forEach((worker) => {
      if (calendarValuesMatchAccess(calendarWorkerAccessValues(worker), userMatch)) {
        calendarAddWorkerAccessKeys(userMatch, worker)
      }
    })
  
    ;(Array.isArray(appState.clients) ? appState.clients : []).forEach((client) => {
      const coordinatorMatches = calendarValuesMatchAccess(
        calendarSplitAccessValues([
          client.coordinator,
          client.coordinatorName,
          client.coordinatorLogin,
          client.manager,
          client.managerName,
          client.owner,
          client.responsible,
        ]),
        userMatch,
      )
      const assignedOnClient = calendarValuesMatchAccess(
        calendarSplitAccessValues([client.assignees, client.workers, client.osoby, client.osobyWykonujace]),
        userMatch,
      )
  
      if (!coordinatorMatches && !assignedOnClient) {
        return
      }
  
      calendarAddClientAccessKeys(objectMatch, client)
      const clientId = normalizeSearchText(client.id ?? client.clientId)
      const clientName = normalizeSearchText(client.name ?? client.clientName)
      if (clientId) responsibleClientIds.add(clientId)
      if (clientName) responsibleClientNames.add(clientName)
  
      calendarSplitAccessValues([client.assignees, client.workers, client.osoby, client.osobyWykonujace]).forEach((hint) =>
        calendarAddWorkerHintAccess(teamMatch, hint),
      )
    })
  
    ;(Array.isArray(appState.zones) ? appState.zones : []).forEach((zone) => {
      const view = mapZoneForView(zone)
      const zoneWorkerMatches = calendarValuesMatchAccess([zone.workerLogin, zone.workerName, view.workerLogin, view.workerName], userMatch)
      const clientId = normalizeSearchText(view.clientId ?? zone.clientId)
      const clientName = normalizeSearchText(view.clientName)
      const clientMatches =
        (clientId && responsibleClientIds.has(clientId)) ||
        (clientName && responsibleClientNames.has(clientName))
  
      if (!zoneWorkerMatches && !clientMatches) {
        return
      }
  
      calendarAddZoneAccessKeys(objectMatch, zone)
      ;[zone.workerLogin, zone.workerName, view.workerLogin, view.workerName].forEach((hint) => calendarAddWorkerHintAccess(teamMatch, hint))
    })
  
    return { userMatch, teamMatch, objectMatch }
  }
  
  function calendarTaskAssignedToAccess(task = {}, accessMatch = calendarEmptyAccessMatch()) {
    return calendarSelectionMatchesAccess(task.workers ?? task.assignees ?? task.people, accessMatch)
  }
  
  function calendarTaskObjectsMatchAccess(task = {}, objectMatch = calendarEmptyAccessMatch()) {
    const objectValues = calendarNormalizeSelectionList(task.objects ?? task.clients ?? task.sites, task.place).flatMap((selection) =>
      calendarSelectionAccessValues(selection),
    )
    const zone = task.zone ?? {}
    return calendarValuesMatchAccess(
      [
        objectValues,
        task.place,
        task.clientId,
        task.clientName,
        task.objectId,
        task.objectName,
        task.zoneId,
        task.zoneName,
        task.zoneLocation,
        zone.id,
        zone.label,
        zone.clientLabel,
        zone.location,
      ],
      objectMatch,
    )
  }
  
  function calendarTaskColumnMatchesAccess(task = {}, scope = calendarCoordinatorAccessScope()) {
    const status = String(task.kanbanStatus ?? '').trim()
    if (!status) {
      return false
    }
    const column = calendarSafeKanbanColumnsForStatus().find((item) => item.id === status)
    const columnScope = calendarSafeKanbanNormalizeColumnScope(column?.scope)
    const ownerValues = [column?.ownerId, column?.ownerLabel, column?.ownerName]
    if (columnScope === 'user' || columnScope === 'person') {
      return calendarValuesMatchAccess(ownerValues, scope.userMatch) || calendarValuesMatchAccess(ownerValues, scope.teamMatch)
    }
    if (columnScope === 'object') {
      return calendarValuesMatchAccess(ownerValues, scope.objectMatch)
    }
    return false
  }
  
  function calendarTaskIsVisibleForCurrentUser(task = {}) {
    if (calendarCanSeeAllOrganizationTasks()) {
      return true
    }
    if (!calendarIsCoordinatorRole()) {
      return false
    }
    const scope = calendarCoordinatorAccessScope()
    return (
      calendarTaskAssignedToAccess(task, scope.userMatch) ||
      dashboardTaskColumnBelongsToCurrentUser(task, scope.userMatch) ||
      calendarTaskAssignedToAccess(task, scope.teamMatch) ||
      calendarTaskObjectsMatchAccess(task, scope.objectMatch) ||
      calendarTaskColumnMatchesAccess(task, scope)
    )
  }
  
  function calendarAccessibleTasks() {
    return appState.calendarTasks.filter((task) => calendarTaskIsVisibleForCurrentUser(task))
  }
  
  function calendarTaskMatchesFilter(task = {}, readCommentKeys = null) {
    return (
      calendarTaskIsVisibleForCurrentUser(task) &&
      calendarTaskMatchesToneFilter(task) &&
      calendarTaskMatchesStatusFilters(task, readCommentKeys)
    )
  }
  
  function calendarEnsureState() {
    if (!appState.calendarCursorDay) {
      appState.calendarCursorDay = todayYmd()
    }
    appState.calendarViewMode = calendarNormalizeViewMode(appState.calendarViewMode)
    appState.calendarToneFilters = calendarNormalizeToneFilters(appState.calendarToneFilters)
    appState.calendarTasks = calendarLoadTasks()
  }

  function calendarNormalizeViewMode(mode = '') {
    const normalized = String(mode ?? '').trim()
    return ['day', 'three', 'week', 'month'].includes(normalized) ? normalized : 'three'
  }

  function calendarTimelineRangeForView(mode = appState.calendarViewMode, cursorDay = appState.calendarCursorDay) {
    const normalizedMode = calendarNormalizeViewMode(mode)
    const cursor = /^\d{4}-\d{2}-\d{2}$/.test(String(cursorDay ?? '').trim())
      ? String(cursorDay).trim()
      : todayYmd()

    if (normalizedMode === 'day') {
      return { mode: normalizedMode, start: cursor, end: cursor, days: [cursor] }
    }

    if (normalizedMode === 'week') {
      const start = calendarStartOfWeek(cursor)
      const days = Array.from({ length: 7 }, (_, index) => calendarAddDays(start, index))
      return { mode: normalizedMode, start, end: days[days.length - 1], days }
    }

    if (normalizedMode === 'month') {
      const start = calendarMonthGridStart(cursor)
      const days = Array.from({ length: 42 }, (_, index) => calendarAddDays(start, index))
      return { mode: normalizedMode, start, end: days[days.length - 1], days }
    }

    const days = Array.from({ length: 3 }, (_, index) => calendarAddDays(cursor, index))
    return { mode: 'three', start: cursor, end: days[days.length - 1], days }
  }

  function calendarTasksForDay(dayKey, readCommentKeys = null) {
    const keys = readCommentKeys instanceof Set ? readCommentKeys : dashboardReadCommentKeys()
    return calendarSortTasks(appState.calendarTasks.filter((task) => task.dateYmd === dayKey && calendarTaskMatchesFilter(task, keys)))
  }
  
  function calendarTaskHourValue(task) {
    const raw = String(task?.startTime ?? task?.time ?? '').trim()
    const match = raw.match(/^(\d{1,2})(?::\d{2})?$/)
    if (!match) {
      return ''
    }
    const hour = Number(match[1])
    return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? pad2(hour) : ''
  }
  
  function calendarTasksForDayAndHour(dayKey, hourValue, readCommentKeys = null) {
    const hour = String(hourValue ?? '').trim()
    return calendarTasksForDay(dayKey, readCommentKeys).filter((task) => calendarTaskHourValue(task) === hour)
  }
  
  function calendarTimedTaskRange(task = {}) {
    const startMinutes = calendarTimeToMinutes(task.startTime ?? task.time)
    if (startMinutes === null) {
      return null
    }
    const rawEndMinutes = calendarTimeToMinutes(task.endTime)
    const endMinutes = rawEndMinutes !== null && rawEndMinutes > startMinutes ? rawEndMinutes : Math.min(startMinutes + 60, 1440)
    return {
      start: Math.max(0, Math.min(startMinutes, 1439)),
      end: Math.max(startMinutes + 1, Math.min(endMinutes, 1440)),
    }
  }
  
  function calendarTimedTasksForDay(dayKey, readCommentKeys = null) {
    return calendarTasksForDay(dayKey, readCommentKeys)
      .map((task) => ({ task, range: calendarTimedTaskRange(task) }))
      .filter((item) => item.range)
      .sort((left, right) => {
        if (left.range.start !== right.range.start) {
          return left.range.start - right.range.start
        }
        if (left.range.end !== right.range.end) {
          return right.range.end - left.range.end
        }
        return String(left.task.title ?? '').localeCompare(String(right.task.title ?? ''), 'pl', { sensitivity: 'base' })
      })
  }
  
  function calendarLayoutTimedTasks(dayKey, readCommentKeys = null) {
    const items = calendarTimedTasksForDay(dayKey, readCommentKeys)
    const clusters = []
    let currentCluster = []
    let currentEnd = -1
  
    items.forEach((item) => {
      if (!currentCluster.length || item.range.start < currentEnd) {
        currentCluster.push(item)
        currentEnd = Math.max(currentEnd, item.range.end)
        return
      }
      clusters.push(currentCluster)
      currentCluster = [item]
      currentEnd = item.range.end
    })
    if (currentCluster.length) {
      clusters.push(currentCluster)
    }
  
    return clusters.flatMap((cluster) => {
      const laneEnds = []
      const placed = cluster.map((item) => {
        const laneIndex = laneEnds.findIndex((end) => end <= item.range.start)
        const lane = laneIndex >= 0 ? laneIndex : laneEnds.length
        laneEnds[lane] = item.range.end
        return { ...item, lane }
      })
      const laneCount = Math.max(1, laneEnds.length)
      return placed.map((item) => ({ ...item, laneCount }))
    })
  }
  
  function calendarTimedTasksLayerHtml(dayKey, readCommentKeys = null) {
    return calendarLayoutTimedTasks(dayKey, readCommentKeys)
      .map((item) => {
        const top = (item.range.start / 60) * CALENDAR_HOUR_HEIGHT_PX + CALENDAR_TIMED_TASK_GAP_PX
        const rawHeight = ((item.range.end - item.range.start) / 60) * CALENDAR_HOUR_HEIGHT_PX - CALENDAR_TIMED_TASK_GAP_PX * 2
        const height = Math.max(CALENDAR_MIN_TIMED_TASK_HEIGHT_PX, rawHeight)
        const left = item.lane * CALENDAR_TIMED_TASK_OVERLAP_OFFSET_PX
        const right = Math.max(4, (item.laneCount - item.lane - 1) * 6 + 4)
        const style = `--calendar-task-top:${top.toFixed(2)}px;--calendar-task-height:${height.toFixed(2)}px;--calendar-task-left:${left}px;--calendar-task-right:${right}px;--calendar-task-z:${item.lane + 2};`
        return calendarTaskHtml(item.task, { timed: true, style })
      })
      .join('')
  }
  
  function calendarTaskHtml(task, { compact = false, timed = false, style = '' } = {}) {
    const title = escapeHtml(task.title)
    const startTime = calendarNormalizeTimeValue(task.startTime ?? task.time)
    const endTime = calendarNormalizeTimeValue(task.endTime)
    const timeRange = startTime && endTime ? `${startTime}-${endTime}` : startTime
    const place = String(task.place ?? '').trim()
    const workers = calendarSelectionLabels(task.workers)
    const objects = calendarSelectionLabels(task.objects)
    const zoneLabel = String(task.zone?.label ?? task.zoneName ?? '').trim()
    const zoneLocation = String(task.zone?.location ?? task.zoneLocation ?? '').trim()
    const zoneDisplay = zoneLabel ? calendarZoneDisplayLabel({ label: zoneLabel, location: zoneLocation }) : ''
    const placeLabel = [objects.length ? objects.join(', ') : place, zoneDisplay].filter(Boolean).join(' / ')
    const metaParts = [
      timeRange,
      placeLabel,
      workers.length ? workers.join(', ') : '',
    ].filter(Boolean)
    return `
      <div
        class="calendar-task calendar-task--${escapeHtml(task.tone || 'blue')}${compact ? ' calendar-task--compact' : ''}${timed ? ' calendar-task--timed' : ''}"
        role="button"
        tabindex="0"
        draggable="true"
        data-calendar-task-id="${escapeHtml(task.id)}"
        title="${title}"
        ${style ? `style="${escapeHtml(style)}"` : ''}
      >
        <span class="calendar-task-title">${title}</span>
        ${metaParts.length ? `<span class="calendar-task-meta">${escapeHtml(metaParts.join(' · '))}</span>` : ''}
      </div>
    `
  }
  
  function calendarTimeGridHtml(days = []) {
    const dayKeys = Array.isArray(days) ? days : []
    const hours = Array.from({ length: 24 }, (_, index) => pad2(index))
    const readCommentKeys = dashboardReadCommentKeys()
    return `
      <div class="calendar-time-grid" style="--calendar-day-count:${Math.max(1, dayKeys.length)}">
        <div class="calendar-time-corner"></div>
        ${dayKeys
          .map(
            (dayKey, dayIndex) => `
              <div class="calendar-time-day-head calendar-time-col--${calendarDayToneClass(dayKey, dayIndex)}${dayKey === todayYmd() ? ' is-today' : ''}" data-calendar-day="${escapeHtml(dayKey)}">
                <span>${escapeHtml(calendarDayShortLabel(dayKey))}</span>
                <strong>${escapeHtml(calendarDayNumberLabel(dayKey))}</strong>
              </div>
            `,
          )
          .join('')}
        <div class="calendar-time-label calendar-time-label--all-day">Bez godziny</div>
        ${dayKeys
          .map((dayKey, dayIndex) => {
            const tasks = calendarTasksForDayAndHour(dayKey, '', readCommentKeys)
            return `
              <div class="calendar-time-slot calendar-time-slot--all-day calendar-time-col--${calendarDayToneClass(dayKey, dayIndex)}" data-calendar-day="${escapeHtml(dayKey)}" data-calendar-hour="">
                ${tasks.length ? tasks.map((task) => calendarTaskHtml(task, { compact: true })).join('') : ''}
              </div>
            `
          })
          .join('')}
        <div class="calendar-time-hours-column" aria-hidden="true">
          ${hours.map((hour) => `<div class="calendar-time-label">${hour}:00</div>`).join('')}
        </div>
        ${dayKeys
          .map(
            (dayKey, dayIndex) => `
              <div class="calendar-time-day-column calendar-time-col--${calendarDayToneClass(dayKey, dayIndex)}" data-calendar-day="${escapeHtml(dayKey)}">
                <div class="calendar-time-slots">
                  ${hours
                    .map(
                      (hour) => `
                        <div class="calendar-time-slot calendar-time-col--${calendarDayToneClass(dayKey, dayIndex)}" data-calendar-day="${escapeHtml(dayKey)}" data-calendar-hour="${hour}"></div>
                      `,
                    )
                    .join('')}
                </div>
                <div class="calendar-time-task-layer">
                  ${calendarTimedTasksLayerHtml(dayKey, readCommentKeys)}
                </div>
              </div>
            `,
          )
          .join('')}
      </div>
    `
  }
  
  function calendarPickerConfig(kind = 'workers') {
    return kind === 'objects'
      ? {
          datalistId: 'calendarObjectOptions',
          rowsId: 'calendarObjectPickerRows',
          inputName: 'calendarTaskObject',
          placeholder: 'Wpisz nazwę klienta...',
        }
      : {
          datalistId: 'calendarWorkerOptions',
          rowsId: 'calendarWorkerPickerRows',
          inputName: 'calendarTaskWorker',
          placeholder: 'Wpisz imię, nazwisko lub login...',
        }
  }
  
  function calendarRenderDatalist(kind = 'workers') {
    const config = calendarPickerConfig(kind)
    const datalist = document.getElementById(config.datalistId)
    if (!datalist) {
      return
    }
    datalist.innerHTML = calendarDirectoryOptions(kind)
      .map((option) => `<option value="${escapeHtml(option.label)}"></option>`)
      .join('')
  }
  
  function calendarPickerRowHtml(kind = 'workers', selection = {}) {
    const config = calendarPickerConfig(kind)
    return `
      <div class="calendar-picker-row" data-calendar-picker-row="${escapeHtml(kind)}">
        <input
          type="text"
          name="${escapeHtml(config.inputName)}"
          list="${escapeHtml(config.datalistId)}"
          data-calendar-picker-input="${escapeHtml(kind)}"
          value="${escapeHtml(selection.label ?? '')}"
          placeholder="${escapeHtml(config.placeholder)}"
          autocomplete="off"
        />
        <button class="calendar-picker-remove" type="button" data-calendar-remove-picker="${escapeHtml(kind)}" aria-label="Usuń pozycję">×</button>
      </div>
    `
  }
  
  function calendarSetPickerRows(kind = 'workers', selections = []) {
    const config = calendarPickerConfig(kind)
    const rows = document.getElementById(config.rowsId)
    if (!rows) {
      return
    }
    const normalized = calendarNormalizeSelectionList(selections)
    rows.innerHTML = (normalized.length ? normalized : [{}]).map((selection) => calendarPickerRowHtml(kind, selection)).join('')
  }
  
  function calendarAddPickerRow(kind = 'workers') {
    const config = calendarPickerConfig(kind)
    const rows = document.getElementById(config.rowsId)
    if (!rows) {
      return
    }
    rows.insertAdjacentHTML('beforeend', calendarPickerRowHtml(kind))
    const inputs = rows.querySelectorAll(`[data-calendar-picker-input="${kind}"]`)
    inputs[inputs.length - 1]?.focus?.()
  }
  
  function calendarResolvePickerValue(kind = 'workers', value = '') {
    const label = String(value ?? '').trim()
    if (!label) {
      return null
    }
    const normalized = normalizeSearchText(label)
    const matched = calendarDirectoryOptions(kind).find((option) => {
      return normalizeSearchText(option.label) === normalized || normalizeSearchText(option.id) === normalized
    })
    return matched ?? { id: '', label }
  }
  
  function calendarReadPickerRows(kind = 'workers') {
    const config = calendarPickerConfig(kind)
    const rows = document.getElementById(config.rowsId)
    const seen = new Set()
    return Array.from(rows?.querySelectorAll(`[data-calendar-picker-input="${kind}"]`) ?? [])
      .map((input) => calendarResolvePickerValue(kind, input.value))
      .filter(Boolean)
      .filter((selection) => {
        const key = normalizeSearchText(selection.id || selection.label)
        if (seen.has(key)) {
          return false
        }
        seen.add(key)
        return true
      })
  }
  
  function calendarMiniMonthHtml() {
    const cursor = appState.calendarCursorDay || todayYmd()
    const monthStart = calendarMonthStart(cursor)
    const gridStart = calendarMonthGridStart(cursor)
    const currentMonth = monthStart.slice(0, 7)
    const today = todayYmd()
    const label = calendarMonthLabel(cursor).replace(/^./, (char) => char.toLocaleUpperCase('pl'))
    const days = Array.from({ length: 42 }, (_, index) => calendarAddDays(gridStart, index))
    const readCommentKeys = dashboardReadCommentKeys()
    return `
      <div class="calendar-mini-head">
        <button class="calendar-mini-nav" type="button" data-calendar-mini-nav="-1" aria-label="Poprzedni miesiąc">&lt;</button>
        <strong>${escapeHtml(label)}</strong>
        <button class="calendar-mini-nav" type="button" data-calendar-mini-nav="1" aria-label="Następny miesiąc">&gt;</button>
      </div>
      <div class="calendar-mini-weekdays">
        ${['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'].map((day) => `<span>${day}</span>`).join('')}
      </div>
      <div class="calendar-mini-grid">
        ${days
          .map((dayKey) => {
            const outsideMonth = !dayKey.startsWith(currentMonth)
            const taskCount = calendarTasksForDay(dayKey, readCommentKeys).length
            return `
              <button
                class="calendar-mini-day${outsideMonth ? ' is-muted' : ''}${dayKey === today ? ' is-today' : ''}${dayKey === cursor ? ' is-selected' : ''}${taskCount ? ' has-tasks' : ''}"
                type="button"
                data-calendar-mini-day="${escapeHtml(dayKey)}"
                aria-label="${escapeHtml(formatDatePl(`${dayKey}T12:00:00.000Z`))}"
              >
                <span>${escapeHtml(calendarDayNumberLabel(dayKey))}</span>
              </button>
            `
          })
          .join('')}
      </div>
    `
  }
  
  function calendarTaskFiltersHtml() {
    const selected = calendarSelectedToneSet()
    const allSelected = selected.size === CALENDAR_TONE_OPTIONS.length
    const accessibleTasks = calendarAccessibleTasks()
    const readCommentKeys = dashboardReadCommentKeys()
    const visibleCount = accessibleTasks.filter((task) => calendarTaskMatchesFilter(task, readCommentKeys)).length
    const totalCount = accessibleTasks.length
    return `
      <div class="calendar-filter-head">
        <h3>Filtr zadań</h3>
        <span>${visibleCount} / ${totalCount}</span>
      </div>
      <div class="calendar-filter-list">
        <label class="calendar-filter-item calendar-filter-item--all">
          <input type="checkbox" data-calendar-filter-all ${allSelected ? 'checked' : ''} />
          <span class="calendar-filter-mark"></span>
          <span>Wszystkie</span>
        </label>
        ${CALENDAR_TONE_OPTIONS.map(
          (option) => `
            <label class="calendar-filter-item calendar-filter-item--${escapeHtml(option.css)}">
              <input type="checkbox" data-calendar-filter-tone="${escapeHtml(option.value)}" ${!allSelected && selected.has(option.value) ? 'checked' : ''} />
              <span class="calendar-filter-mark"></span>
              <span>${escapeHtml(option.label)}</span>
            </label>
          `,
        ).join('')}
        <label class="calendar-filter-item calendar-filter-item--utility">
          <input type="checkbox" data-calendar-filter-show-completed ${appState.calendarShowCompletedTasks ? 'checked' : ''} />
          <span class="calendar-filter-mark"></span>
          <span>Pokazuj zakończone</span>
        </label>
        <label class="calendar-filter-item calendar-filter-item--utility">
          <input type="checkbox" data-calendar-filter-show-read ${appState.calendarShowReadTasks ? 'checked' : ''} />
          <span class="calendar-filter-mark"></span>
          <span>Pokazuj przeczytane</span>
        </label>
      </div>
    `
  }
  
  function calendarRenderContextPanel() {
    const miniMonth = document.getElementById('calendarMiniMonth')
    const filters = document.getElementById('calendarTaskFilters')
    if (miniMonth) {
      miniMonth.innerHTML = calendarMiniMonthHtml()
    }
    if (filters) {
      filters.innerHTML = calendarTaskFiltersHtml()
    }
  }
  
  function calendarMoveMiniMonth(direction) {
    const dir = direction < 0 ? -1 : 1
    const cursor = calendarDateFromYmd(appState.calendarCursorDay || todayYmd())
    const targetYear = cursor.getFullYear()
    const targetMonth = cursor.getMonth() + dir
    const targetLastDay = new Date(targetYear, targetMonth + 1, 0).getDate()
    const targetDay = Math.min(cursor.getDate(), targetLastDay)
    appState.calendarCursorDay = calendarDateToYmd(new Date(targetYear, targetMonth, targetDay))
    renderCalendarView()
  }
  
  function calendarDayColumnHtml(dayKey, { monthMode = false, wide = false, readCommentKeys = null } = {}) {
    const tasks = calendarTasksForDay(dayKey, readCommentKeys)
    const isToday = dayKey === todayYmd()
    const currentMonth = appState.calendarCursorDay.slice(0, 7)
    const outsideMonth = monthMode && !dayKey.startsWith(currentMonth)
    return `
      <div class="calendar-day-cell${isToday ? ' is-today' : ''}${outsideMonth ? ' is-muted' : ''}${wide ? ' is-wide' : ''}" data-calendar-day="${escapeHtml(dayKey)}">
        <div class="calendar-day-head">
          <div>
            <span class="calendar-day-name">${escapeHtml(calendarDayShortLabel(dayKey))}</span>
            <span class="calendar-day-number">${escapeHtml(calendarDayNumberLabel(dayKey))}</span>
          </div>
          <button class="calendar-day-add" type="button" data-calendar-add-day="${escapeHtml(dayKey)}" aria-label="Dodaj zadanie">+</button>
        </div>
        <div class="calendar-day-tasks">
          ${tasks.length ? tasks.map((task) => calendarTaskHtml(task, { compact: monthMode })).join('') : '<div class="calendar-empty-day">Brak zadań</div>'}
        </div>
      </div>
    `
  }
  
  function calendarUpdateRangeLabel() {
    const label = document.getElementById('calendarRangeLabel')
    if (!label) {
      return
    }
    if (document.getElementById('calendarTimelinePrototype')) {
      const range = calendarTimelineRangeForView()
      if (range.mode === 'month') {
        label.textContent = calendarMonthLabel(appState.calendarCursorDay || todayYmd())
        return
      }
      if (range.start === range.end) {
        label.textContent = formatDatePl(`${range.start}T12:00:00.000Z`)
        return
      }
      label.textContent = `${formatDatePl(`${range.start}T12:00:00.000Z`)} - ${formatDatePl(`${range.end}T12:00:00.000Z`)}`
      return
    }
    const mode = calendarNormalizeViewMode(appState.calendarViewMode)
    appState.calendarViewMode = mode
    const cursor = appState.calendarCursorDay || todayYmd()
    if (mode === 'day') {
      label.textContent = formatDatePl(`${cursor}T12:00:00.000Z`)
      return
    }
    if (mode === 'month') {
      label.textContent = calendarMonthLabel(cursor)
      return
    }
    const range = calendarTimelineRangeForView(mode, cursor)
    label.textContent = `${formatDatePl(`${range.start}T12:00:00.000Z`)} - ${formatDatePl(`${range.end}T12:00:00.000Z`)}`
  }
  
  function calendarTimelineDayMonthLabel(dayKey) {
    const date = calendarDateFromYmd(dayKey)
    return date.toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'long' })
  }

  function calendarTimelineCountLabel(count = 0) {
    const value = Math.max(0, Math.floor(Number(count) || 0))
    if (value === 1) {
      return '1 zlecenie'
    }
    if (value >= 2 && value <= 4) {
      return `${value} zlecenia`
    }
    return `${value} zleceń`
  }

  function calendarTimelineMonthOrdersByDay(days = []) {
    const selectedTypes = calendarTimelineSelectedTypes()
    const daySet = new Set(Array.isArray(days) ? days : [])
    const byDay = new Map()
    calendarTimelineExpandRecurringOrdersForDays(ordersListSourceOrders(), [...daySet])
      .filter((order) => selectedTypes.has(order.type || 'other'))
      .filter((order) => appState.calendarTimelineShowCompleted !== false || !order.completed)
      .forEach((order) => {
        const dayKey = ordersNormalizeDateField(order?.dateYmd, '')
        if (!dayKey || !daySet.has(dayKey)) {
          return
        }
        if (!byDay.has(dayKey)) {
          byDay.set(dayKey, [])
        }
        byDay.get(dayKey).push(order)
      })
    return byDay
  }

  function calendarTimelineMonthHtml() {
    const cursor = appState.calendarCursorDay || todayYmd()
    const range = calendarTimelineRangeForView('month', cursor)
    const currentMonth = calendarMonthStart(cursor).slice(0, 7)
    const today = todayYmd()
    const ordersByDay = calendarTimelineMonthOrdersByDay(range.days)
    appState.calendarTimelineStatusAlerts = []
    appState.calendarTimelineVisibleConflictItems = []
    appState.calendarTimelineStageHeight = 0

    return `
      <div class="fw-month-view" aria-label="Kalendarz miesięczny">
        <div class="fw-month-weekdays">
          ${['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'].map((day) => `<span>${day}</span>`).join('')}
        </div>
        <div class="fw-month-grid">
          ${range.days
            .map((dayKey) => {
              const dayOrders = ordersByDay.get(dayKey) || []
              const isMuted = !dayKey.startsWith(currentMonth)
              const isToday = dayKey === today
              const isSelected = dayKey === cursor
              return `
                <div class="fw-month-day${isMuted ? ' is-muted' : ''}${isToday ? ' is-today' : ''}${isSelected ? ' is-selected' : ''}" data-calendar-month-cell="${escapeHtml(dayKey)}">
                  <button class="fw-month-day-main" type="button" data-calendar-month-day="${escapeHtml(dayKey)}" aria-label="Pokaż dzień ${escapeHtml(formatDatePl(`${dayKey}T12:00:00.000Z`))}">
                    <span class="fw-month-day-number">${escapeHtml(calendarDayNumberLabel(dayKey))}</span>
                    ${dayOrders.length ? `<span class="fw-month-day-count">${escapeHtml(calendarTimelineCountLabel(dayOrders.length))}</span>` : '<span class="fw-month-day-empty">Brak zleceń</span>'}
                  </button>
                  <button class="fw-month-add" type="button" data-calendar-month-add="${escapeHtml(dayKey)}">Dodaj zlecenie</button>
                </div>
              `
            })
            .join('')}
        </div>
      </div>
    `
  }
  
  function calendarTimelineTypeOptions() {
    return [
      { value: 'individual', label: 'Zlecenia jednorazowe' },
      { value: 'cyclic', label: 'Zlecenie cykliczne' },
      { value: 'renovation', label: 'Zlecenie poremontowe' },
      { value: 'windows', label: 'Mycie okien' },
      { value: 'other', label: 'Inne zlecenie' },
    ]
  }
  
  function calendarTimelineAllTypeValues() {
    return calendarTimelineTypeOptions().map((option) => option.value)
  }
  
  function calendarTimelineSelectedTypes() {
    const allowed = new Set(calendarTimelineAllTypeValues())
    const selected = Array.isArray(appState.calendarTimelineTypeFilters)
      ? appState.calendarTimelineTypeFilters.filter((value) => allowed.has(value))
      : []
    if (!selected.length) {
      return new Set()
    }
    return new Set(selected)
  }
  
  function calendarTimelineDateInputLabel(dayKey = '') {
    const day = String(dayKey || todayYmd()).trim()
    return formatDatePl(`${/^\d{4}-\d{2}-\d{2}$/.test(day) ? day : todayYmd()}T12:00:00.000Z`)
  }
  
  function calendarTimelineSyncControls() {
    const completedButton = document.getElementById('calendarTimelineCompletedToggle')
    if (completedButton instanceof HTMLButtonElement) {
      const enabled = appState.calendarTimelineShowCompleted !== false
      completedButton.classList.toggle('is-active', enabled)
      completedButton.setAttribute('aria-pressed', enabled ? 'true' : 'false')
      completedButton.textContent = enabled ? 'Zakończone: pokaż' : 'Zakończone: nie pokazuj'
    }
  
    const selected = calendarTimelineSelectedTypes()
    document.querySelectorAll('#calendarTimelineTypePanel [data-calendar-timeline-type]').forEach((input) => {
      if (input instanceof HTMLInputElement) {
        input.checked = selected.has(input.getAttribute('data-calendar-timeline-type') || '')
      }
    })
  
    const cursor = String(appState.calendarCursorDay || todayYmd()).trim()
    const safeCursor = /^\d{4}-\d{2}-\d{2}$/.test(cursor) ? cursor : todayYmd()
    const dateInput = document.getElementById('calendarTimelineDateInput')
    if (dateInput instanceof HTMLInputElement) {
      dateInput.value = safeCursor
    }
    const dateLabel = document.getElementById('calendarTimelineDateLabel')
    if (dateLabel) {
      dateLabel.textContent = calendarTimelineDateInputLabel(safeCursor)
    }
  }
  
  function calendarTimelineStatusDayKey() {
    return calendarTimelineRangeForView().start
  }
  
  function calendarTimelineCurrentStatusRowsForDay(dayKey = '') {
    const normalizedDayKey = String(dayKey ?? '').trim()
    if (normalizedDayKey !== todayYmd()) {
      return []
    }
  
    if (Array.isArray(appState.calendarTimelineCurrentWorkerStatusRows) && appState.calendarTimelineCurrentWorkerStatusRows.length) {
      return appState.calendarTimelineCurrentWorkerStatusRows
    }
  
    return Array.isArray(appState.dashboardTodayRows) ? appState.dashboardTodayRows : []
  }
  
  function calendarTimelineHasCurrentStatusSnapshot(dayKey = '') {
    const normalizedDayKey = String(dayKey ?? '').trim()
    return normalizedDayKey === todayYmd() && appState.calendarTimelineCurrentWorkerStatusDayKey === todayYmd()
  }

  function calendarTimelineRowsCacheSignature(rows = []) {
    const source = Array.isArray(rows) ? rows : []
    if (!source.length) {
      return '0'
    }
    const compactRow = (row = {}, index = 0) => [
      row?.eventId ?? row?.workdayId ?? row?.id ?? index,
      row?.workerId ?? row?.workerLogin ?? row?.workerName ?? row?.login ?? '',
      row?.startAt ?? row?.dayStartAt ?? row?.qrStart ?? '',
      row?.endAt ?? row?.dayEndAt ?? row?.qrStop ?? '',
      row?.status ?? row?.state ?? row?.workerStatus ?? '',
      row?.updatedAt ?? row?.updated_at ?? '',
    ].map((value) => String(value ?? '').trim()).join(',')
    if (source.length > 350) {
      return [
        source.length,
        compactRow(source[0], 0),
        compactRow(source[Math.floor(source.length / 2)], Math.floor(source.length / 2)),
        compactRow(source[source.length - 1], source.length - 1),
      ].join('|')
    }
    return `${source.length}:${source.map((row, index) => compactRow(row, index)).join('|')}`
  }

  function calendarTimelineWorkerStateMapCacheKey(dayKey = '') {
    const normalizedDayKey = String(dayKey ?? '').trim()
    const sourceRows =
      appState.calendarTimelineWorkerStateDayKey === normalizedDayKey && Array.isArray(appState.calendarTimelineWorkerStateSourceRows)
        ? appState.calendarTimelineWorkerStateSourceRows
        : []
    const todayKey = todayYmd()
    const rows =
      normalizedDayKey === todayKey
        ? Array.isArray(appState.calendarTimelineCurrentWorkerStatusRows) && appState.calendarTimelineCurrentWorkerStatusRows.length
          ? appState.calendarTimelineCurrentWorkerStatusRows
          : Array.isArray(appState.dashboardTodayRows)
            ? appState.dashboardTodayRows
            : []
        : appState.calendarTimelineWorkerStateDayKey === normalizedDayKey && Array.isArray(appState.calendarTimelineWorkerStateRows)
          ? appState.calendarTimelineWorkerStateRows
          : []
    return [
      normalizedDayKey,
      appState.calendarTimelineWorkerStateFetchedAt || 0,
      appState.calendarTimelineCurrentWorkerStatusDayKey || '',
      calendarTimelineRowsCacheSignature(sourceRows),
      calendarTimelineRowsCacheSignature(rows),
    ].join('::')
  }
  
  function calendarTimelineSetWorkerStateLoading(isLoading) {
    const loading = Boolean(isLoading)
    appState.calendarTimelineWorkerStateLoading = loading
  
    const stage = document.getElementById('calendarPrototypeTimeline')
    if (stage instanceof HTMLElement) {
      stage.setAttribute('aria-busy', loading ? 'true' : 'false')
      const overlay = stage.querySelector('.fw-timeline-loading')
      if (overlay instanceof HTMLElement) {
        overlay.hidden = !loading
        overlay.classList.toggle('is-hidden', !loading)
      }
    }
  
    const refreshButton = document.getElementById('calendarTimelineRefreshBtn')
    if (refreshButton instanceof HTMLButtonElement) {
      refreshButton.classList.toggle('is-loading', loading)
      refreshButton.setAttribute('aria-busy', loading ? 'true' : 'false')
    }
  }
  
  async function calendarEnsureTimelineWorkerState(options = {}) {
    if (!appState.session?.orgId) {
      return false
    }
    const forceRequested = options?.force === true
    const workerStatePageSize = 2000
    const shouldRender = options?.render !== false
    if (appState.calendarTimelineWorkerStateLoading) {
      if (forceRequested) {
        appState.calendarTimelineWorkerStateRefreshQueued = true
        appState.calendarTimelineWorkerStateFetchedAt = 0
      }
      return calendarTimelineWorkerStateLoadPromise || false
    }
    const requestedDay = String(options?.dayKey || appState.calendarCursorDay || todayYmd()).trim()
    const range = calendarTimelineRangeForView(appState.calendarViewMode, requestedDay)
    if (range.mode === 'month') {
      return false
    }
    const dayKey = range.start
    const rangeEndDay = range.end
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey) || !/^\d{4}-\d{2}-\d{2}$/.test(rangeEndDay)) {
      return false
    }
    const force = forceRequested || appState.calendarTimelineWorkerStateRefreshQueued === true
    appState.calendarTimelineWorkerStateRefreshQueued = false
    const fetchedAt = Number(appState.calendarTimelineWorkerStateFetchedAt || 0)
    const isFresh = fetchedAt > 0 && Date.now() - fetchedAt < CALENDAR_TIMELINE_STATUS_REFRESH_MS
    if (
      !force &&
      appState.calendarTimelineWorkerStateDayKey === dayKey &&
      appState.calendarTimelineWorkerStateRangeStart === dayKey &&
      appState.calendarTimelineWorkerStateRangeEnd === rangeEndDay &&
      isFresh
    ) {
      return false
    }
  
    calendarTimelineSetWorkerStateLoading(true)
    let didUpdate = false
    let resolveWorkerStateLoad = null
    calendarTimelineWorkerStateLoadPromise = new Promise((resolve) => {
      resolveWorkerStateLoad = resolve
    })
    try {
      let statusRows = []
      let sourceRows = []
      let currentStatusRows = []
      if (dayKey === todayYmd()) {
        const [{ todayRows, todayWorkdays }, eventsResponse] = await Promise.all([
          dashboardLoadFastRows(String(appState.session.orgId)),
          getWorkdays(appState.session.orgId, {
            source: 'events',
            fromIso: dayKey,
            toIso: rangeEndDay,
            page: 1,
            pageSize: workerStatePageSize,
          }),
        ])
        assertCompletePagedResponse(eventsResponse, 'zdarzen osi kalendarza')
        statusRows = Array.isArray(todayRows) ? todayRows : []
        currentStatusRows = statusRows
        sourceRows = [
          ...(Array.isArray(eventsResponse?.items) ? eventsResponse.items : []),
          ...(Array.isArray(todayWorkdays?.items) ? todayWorkdays.items : []),
        ]
        appState.dashboardTodayRows = statusRows
      } else {
        const [eventsResponse, workdaysResponse, currentStatusResponse] = await Promise.all([
          getWorkdays(appState.session.orgId, {
            source: 'events',
            fromIso: dayKey,
            toIso: rangeEndDay,
            page: 1,
            pageSize: workerStatePageSize,
          }),
          getWorkdays(appState.session.orgId, {
            source: 'workdays',
            fromIso: dayKey,
            toIso: rangeEndDay,
            page: 1,
            pageSize: workerStatePageSize,
          }),
          dashboardLoadFastRows(String(appState.session.orgId)).catch(() => ({ todayRows: appState.dashboardTodayRows || [] })),
        ])
        assertCompletePagedResponse(eventsResponse, 'zdarzen osi kalendarza')
        assertCompletePagedResponse(workdaysResponse, 'dni pracy osi kalendarza')
        sourceRows = [
          ...(Array.isArray(eventsResponse.items) ? eventsResponse.items : []),
          ...(Array.isArray(workdaysResponse.items) ? workdaysResponse.items : []),
        ]
        currentStatusRows = Array.isArray(currentStatusResponse?.todayRows) ? currentStatusResponse.todayRows : []
        if (currentStatusRows.length) {
          appState.dashboardTodayRows = currentStatusRows
        }
      }
  
      appState.calendarTimelineWorkerStateDayKey = dayKey
      appState.calendarTimelineWorkerStateRangeStart = dayKey
      appState.calendarTimelineWorkerStateRangeEnd = rangeEndDay
      appState.calendarTimelineWorkerStateRows = statusRows
      appState.calendarTimelineWorkerStateSourceRows = sourceRows
      appState.calendarTimelineCurrentWorkerStatusDayKey = todayYmd()
      appState.calendarTimelineCurrentWorkerStatusRows = currentStatusRows
      appState.calendarTimelineWorkerStateFetchedAt = Date.now()
      didUpdate = true
      calendarInvalidateTimelineRenderCaches({ workerState: true })
      if (shouldRender && appState.currentRoute === 'calendar' && calendarTimelineStatusDayKey() === dayKey) {
        calendarScheduleRender()
      }
    } catch {
      // Status kropek pozostaje czerwony, jeśli nie uda się pobrać aktywnych startów.
    } finally {
      calendarTimelineSetWorkerStateLoading(false)
      resolveWorkerStateLoad?.(didUpdate)
      calendarTimelineWorkerStateLoadPromise = null
      if (appState.calendarTimelineWorkerStateRefreshQueued === true) {
        const queuedDayKey = calendarTimelineStatusDayKey()
        appState.calendarTimelineWorkerStateRefreshQueued = false
        void calendarEnsureTimelineWorkerState({ dayKey: queuedDayKey, force: true, render: shouldRender }).catch(() => {})
      }
    }
    return didUpdate
  }
  
  async function calendarTimelineRefreshBars(options = {}) {
    appState.calendarTimelineWorkerStateFetchedAt = 0
    const dayKey = calendarTimelineStatusDayKey()
    await calendarEnsureTimelineWorkerState({ dayKey, force: true, render: false })
    if (appState.currentRoute === 'calendar' && calendarTimelineStatusDayKey() === dayKey) {
      calendarScheduleRender()
    }
    if (options?.notice === true) {
      showTransientNotice('Paski w kalendarzu odświeżone.')
    }
  }
  
  function calendarStartTimelineWorkerStatusRefresh() {
    if (calendarTimelineWorkerStateRefreshTimer) {
      return
    }
  
    calendarTimelineWorkerStateRefreshTimer = window.setInterval(() => {
      if (appState.currentRoute !== 'calendar' || !document.getElementById('calendarTimelinePrototype')) {
        return
      }
      void calendarEnsureTimelineWorkerState({ force: true }).catch(() => {})
    }, CALENDAR_TIMELINE_STATUS_REFRESH_MS)
  }
  
  function calendarStopTimelineWorkerStatusRefresh() {
    if (!calendarTimelineWorkerStateRefreshTimer) {
      return
    }
    window.clearInterval(calendarTimelineWorkerStateRefreshTimer)
    calendarTimelineWorkerStateRefreshTimer = null
  }
  
  function calendarTimelineWorkerName(rawName = '') {
    const name = String(rawName ?? '').trim().replace(/\s+/g, ' ')
    if (!name) {
      return ''
    }
    const parts = name.split(' ')
    if (parts.length < 2) {
      return name
    }
    return `${parts.slice(1).join(' ')} ${parts[0]}`
  }
  
  function calendarTimelineWorkerAliasKeys(worker = {}) {
    return dashboardWorkerIdIdentityKeys(worker?.workerId ?? worker?.id)
  }
  
  function calendarTimelineNormalizeWorkerIdentity(value = '') {
    return normalizeSearchText(value)
      .replace(/[^a-z0-9@._\-\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
  
  function calendarTimelineWorkerNameSignatures(value = '') {
    const normalized = calendarTimelineNormalizeWorkerIdentity(value).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
    if (!normalized) {
      return new Set()
    }
  
    const signatures = new Set([`name:${normalized}`])
    const parts = normalized.split(' ').filter(Boolean)
    if (parts.length > 1) {
      signatures.add(`name:${parts.slice().reverse().join(' ')}`)
      const first = parts[0]
      const last = parts[parts.length - 1]
      if (first && last) {
        signatures.add(`sig:${first.charAt(0)}|${last}`)
        signatures.add(`sig:${last.charAt(0)}|${first}`)
      }
    }
    return signatures
  }
  
  function calendarTimelineWorkerIdentity(values = []) {
    const identity = {
      ids: new Set(),
      logins: new Set(),
      names: new Set(),
    }
  
    ;(Array.isArray(values) ? values : [values]).forEach((value) => {
      const raw = String(value ?? '').trim()
      const normalized = calendarTimelineNormalizeWorkerIdentity(raw)
      if (!normalized) {
        return
      }
  
      if (/^w\d+$/i.test(normalized) || /^\d{2,}$/.test(normalized)) {
        identity.ids.add(normalized)
      }
  
      if (raw.includes('@') || normalized.includes('@') || /^[a-z0-9._-]+$/.test(normalized)) {
        identity.logins.add(normalized)
        const localPart = normalized.split('@')[0]?.trim()
        if (localPart) {
          identity.logins.add(localPart)
        }
      }
  
      calendarTimelineWorkerNameSignatures(raw).forEach((key) => identity.names.add(key))
    })
  
    return identity
  }
  
  function calendarTimelineSetsIntersect(left = new Set(), right = new Set()) {
    if (!(left instanceof Set) || !(right instanceof Set) || !left.size || !right.size) {
      return false
    }
    return [...left].some((key) => right.has(key))
  }
  
  function calendarTimelineExactWorkerNameKeys(values = []) {
    const keys = new Set()
    ;(Array.isArray(values) ? values : [values]).forEach((value) => {
      const normalized = calendarTimelineNormalizeWorkerIdentity(value).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
      if (!normalized) {
        return
      }
      keys.add(normalized)
      const tokens = normalized.split(' ').filter(Boolean)
      if (tokens.length > 1) {
        keys.add(tokens.slice().reverse().join(' '))
      }
    })
    return keys
  }
  
  function calendarTimelineResourceWorkerIdentity(resource = {}) {
    const worker = resource?.worker ?? {}
    return calendarTimelineWorkerIdentity([
      resource?.name,
      worker?.workerName,
      worker?.fullName,
      worker?.displayName,
      worker?.name,
      worker?.workerLogin,
      worker?.login,
      worker?.loginEmail,
      worker?.email,
      worker?.workerId,
      worker?.id,
    ])
  }
  
  function calendarTimelineSourceRowWorkerIdentity(row = {}) {
    const useRowIdAsWorkerId = !String(row?.eventId ?? row?.workdayId ?? row?.linkedWorkdayId ?? '').trim()
    return calendarTimelineWorkerIdentity([
      row?.workerName,
      row?.fullName,
      row?.displayName,
      row?.name,
      row?.workerLogin,
      row?.login,
      row?.loginEmail,
      row?.email,
      row?.workerId,
      useRowIdAsWorkerId ? row?.id : '',
    ])
  }
  
  function calendarTimelineResourceExactWorkerNames(resource = {}) {
    const worker = resource?.worker ?? {}
    return calendarTimelineExactWorkerNameKeys([
      resource?.name,
      worker?.workerName,
      worker?.fullName,
      worker?.displayName,
      worker?.name,
    ])
  }
  
  function calendarTimelineSourceRowExactWorkerNames(row = {}) {
    return calendarTimelineExactWorkerNameKeys([
      row?.workerName,
      row?.fullName,
      row?.displayName,
      row?.name,
    ])
  }
  
  function calendarTimelineEventTimestamp(value) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value > 100000000000 ? Math.floor(value) : Math.floor(value * 1000)
    }
  
    const raw = String(value ?? '').trim()
    if (/^\d{10,13}$/.test(raw)) {
      const numeric = Number(raw)
      if (Number.isFinite(numeric) && numeric > 0) {
        return numeric > 100000000000 ? Math.floor(numeric) : Math.floor(numeric * 1000)
      }
    }
  
    const iso = toIso(value)
    if (!iso) {
      return 0
    }
    const timestamp = new Date(iso).getTime()
    return Number.isFinite(timestamp) ? timestamp : 0
  }
  
  function calendarTimelineSourceRowHasExplicitDayStop(row = {}) {
    if (!row || typeof row !== 'object') {
      return false
    }
  
    const endReason = String(row?.endReason ?? '').trim().toUpperCase()
    const status = String(row?.status ?? '').trim().toUpperCase()
    if (endReason === 'WORKDAY_STOP' || endReason === 'STOP_END_DAY' || status === 'WORKDAY_CLOSED') {
      return true
    }
  
    if (calendarTimelineEventMarkerType(row) === 'QR STOP') {
      return true
    }
  
    const sourceKind = String(row?.historySourceKind ?? '').trim().toLowerCase()
    const hasDayStopQr = Boolean(reportHistoryNormalizeQrCode(row?.dayStopObject))
    const hasDayStopComment = Boolean(reportHistoryExtractQrFromComment(row?.dayComment ?? row?.comment, 'stop'))
    return Boolean((sourceKind === 'workday' && (hasDayStopQr || hasDayStopComment)) || hasDayStopComment)
  }
  
  function calendarTimelineSourceRowIsSystemOnly(row = {}) {
    if (!row || typeof row !== 'object') {
      return false
    }
  
    if (calendarTimelineIsSystemAddedEntry(row)) {
      return true
    }
  
    const clientStatus = String(row?.clientStatus ?? '').trim().toUpperCase()
    if (clientStatus !== 'SYSTEM') {
      return false
    }
  
    const scannedObject = eventEditorFirstScannedQr([
      row?.dayStartObject,
      row?.dayStopObject,
      row?.startObject,
      row?.stopObject,
      row?.dayComment,
      row?.comment,
    ])
    return !scannedObject
  }
  
  function calendarTimelineSourceRowDayStopTimestamp(row = {}) {
    if (!calendarTimelineSourceRowHasExplicitDayStop(row)) {
      return 0
    }
    return calendarTimelineEventTimestamp(row?.dayEndAt ?? row?.endAt ?? row?.closeMarkedAt ?? row?.startAt)
  }
  
  function calendarTimelineSourceRowWorkdayStartTimestamp(row = {}) {
    if (calendarTimelineSourceRowIsSystemOnly(row)) {
      return 0
    }
  
    const markerType = calendarTimelineEventMarkerType(row)
    const dayStartTs = calendarTimelineEventTimestamp(row?.dayStartAt)
    if (markerType === 'QR START' || markerType === 'QR START + STOP') {
      return dayStartTs || calendarTimelineEventsRowStartTimestamp(row) || calendarTimelineEventTimestamp(row?.startAt)
    }
  
    const sourceKind = String(row?.historySourceKind ?? '').trim().toLowerCase()
    const hasDayStartHint = [
      row?.dayStartAt,
      row?.dayStartObject,
      row?.workdayUtilityRoomId,
      reportHistoryExtractQrFromComment(row?.dayComment ?? row?.comment, 'start'),
    ].some((value) => String(value ?? '').trim())
    if (dayStartTs > 0 && (sourceKind === 'workday' || hasDayStartHint)) {
      return dayStartTs
    }
  
    const status = String(row?.status ?? '').trim().toUpperCase()
    const startTs = calendarTimelineEventsRowStartTimestamp(row) || calendarTimelineEventTimestamp(row?.startAt)
    if (startTs > 0 && !toIso(row?.endAt) && (status === 'RUNNING' || status === 'OPEN' || row?.isRunning)) {
      return startTs
    }
  
    return 0
  }
  
  function calendarTimelineSourceRowHasWorkdayStart(row = {}) {
    return calendarTimelineSourceRowWorkdayStartTimestamp(row) > 0
  }
  
  function calendarTimelineSourceRowWorkerDotStartTimestamp(row = {}) {
    if (calendarTimelineSourceRowIsSystemOnly(row)) {
      return 0
    }
  
    const markerType = calendarTimelineEventMarkerType(row)
    const dayStartTs = calendarTimelineEventTimestamp(row?.dayStartAt)
    if (markerType === 'QR START' || markerType === 'QR START + STOP') {
      return dayStartTs || calendarTimelineEventsRowStartTimestamp(row) || calendarTimelineEventTimestamp(row?.startAt)
    }
  
    const qrStartTs = calendarTimelineEventTimestamp(
      row?.qrStartAt ??
        row?.qrStartIso ??
        row?.dayStartIso ??
        row?.firstStartIso ??
        row?.qrStartSourceItem?.startAt ??
        row?.qrStartSourceItem?.dayStartAt,
    )
    if (qrStartTs > 0) {
      return qrStartTs
    }
  
    const sourceKind = String(row?.historySourceKind ?? '').trim().toLowerCase()
    const hasDayStartHint = [
      row?.dayStartObject,
      row?.workdayUtilityRoomId,
      reportHistoryExtractQrFromComment(row?.dayComment ?? row?.comment, 'start'),
    ].some((value) => String(value ?? '').trim())
    if (dayStartTs > 0 && (sourceKind === 'workday' || hasDayStartHint)) {
      return dayStartTs
    }
  
    return 0
  }
  
  function calendarTimelineRowsDayKey(rows = []) {
    return (Array.isArray(rows) ? rows : [])
      .map((row) => dashboardResolveDayKey(row) || calendarTimelineRealEventRowDay(row))
      .find((dayKey) => /^\d{4}-\d{2}-\d{2}$/.test(String(dayKey ?? '').trim())) || ''
  }
  
  function calendarTimelineRowsShouldExtendToNow(rows = []) {
    const dayKey = calendarTimelineRowsDayKey(rows)
    if (dayKey !== todayYmd()) {
      return false
    }
  
    const sourceRows = Array.isArray(rows) ? rows : []
    const hasStart = sourceRows.some((row) => calendarTimelineSourceRowHasWorkdayStart(row))
    const hasExplicitStop = sourceRows.some((row) => calendarTimelineSourceRowHasExplicitDayStop(row))
    return Boolean(hasStart && !hasExplicitStop)
  }
  
  function calendarTimelineWorkerResourceIsRunningOnDay(resource = {}, dayKey = '') {
    if (resource?.type !== 'worker') {
      return false
    }
    const stateMap = calendarTimelineBuildWorkerStateMap(dayKey)
    const workerKeys = calendarTimelineWorkerAliasKeys(resource.worker)
    return [...workerKeys].some((key) => Boolean(stateMap.get(key)?.isRunning))
  }
  
  function calendarTimelineSourceRowStartMinutes(row) {
    const fromEventsStart = dashboardScheduleTimeToMinutes(row?.start)
    if (Number.isFinite(fromEventsStart) && fromEventsStart >= 0) {
      return fromEventsStart
    }
  
    const iso = toIso(
      row?.activeSortTs ??
        row?.qrStartAt ??
        row?.qrStartIso ??
        row?.dayStartIso ??
        row?.firstStartIso ??
        row?.startIso ??
        row?.startAt ??
        row?.dayStartAt ??
        row?.qrStartSourceItem?.startAt ??
        row?.qrStartSourceItem?.dayStartAt,
    )
    if (!iso) {
      return -1
    }
    const date = new Date(iso)
    if (!Number.isFinite(date.getTime())) {
      return -1
    }
    return date.getHours() * 60 + date.getMinutes()
  }
  
  function calendarTimelineEventsRowStartTimestamp(row = {}) {
    const direct = calendarTimelineEventTimestamp(
      row?.activeSortTs ??
        row?.qrStartAt ??
        row?.qrStartIso ??
        row?.dayStartIso ??
        row?.firstStartIso ??
        row?.startIso ??
        row?.startAt ??
        row?.dayStartAt ??
        row?.qrStartSourceItem?.startAt ??
        row?.qrStartSourceItem?.dayStartAt,
    )
    if (direct > 0) {
      return direct
    }
  
    const dayKey = dashboardResolveDayKey(row) || calendarTimelineRealEventRowDay(row)
    const minutes = dashboardScheduleTimeToMinutes(row?.start)
    if (/^\d{4}-\d{2}-\d{2}$/.test(dayKey) && minutes >= 0) {
      return calendarTimelineTimestampFromDayMinutes(dayKey, minutes)
    }
    return 0
  }
  
  function calendarTimelineEventsRowStopTimestamp(row = {}) {
    const direct = calendarTimelineEventTimestamp(
      row?.qrStopAt ??
        row?.qrStopIso ??
        row?.dayEndIso ??
        row?.stopIso ??
        row?.endAt ??
        row?.dayEndAt ??
        row?.qrStopSourceItem?.endAt ??
        row?.qrStopSourceItem?.dayEndAt,
    )
    if (direct > 0) {
      return direct
    }
  
    const dayKey = dashboardResolveDayKey(row) || calendarTimelineRealEventRowDay(row)
    const minutes = dashboardScheduleTimeToMinutes(row?.stop)
    if (/^\d{4}-\d{2}-\d{2}$/.test(dayKey) && minutes >= 0) {
      return calendarTimelineTimestampFromDayMinutes(dayKey, minutes)
    }
    return 0
  }
  
  function calendarTimelineEventsRowIsRunning(row = {}) {
    const startTs = calendarTimelineEventsRowStartTimestamp(row)
    if (startTs <= 0) {
      return false
    }
    const normalizedStatus = normalizeEventStatus(row?.status, Boolean(row?.endAt))
    if (normalizedStatus === 'RUNNING') {
      return true
    }
    const stopLabel = String(row?.stop ?? '').trim()
    const hasStop = calendarTimelineEventsRowStopTimestamp(row) > 0 || (stopLabel && stopLabel !== '-')
    return !hasStop
  }
  
  function calendarTimelineTimestampToMinutes(value) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      const timestamp = value > 100000000000 ? value : value * 1000
      const date = new Date(timestamp)
      return Number.isFinite(date.getTime()) ? date.getHours() * 60 + date.getMinutes() : -1
    }
  
    const raw = String(value ?? '').trim()
    if (/^\d{10,13}$/.test(raw)) {
      const numeric = Number(raw)
      if (Number.isFinite(numeric) && numeric > 0) {
        const timestamp = numeric > 100000000000 ? numeric : numeric * 1000
        const date = new Date(timestamp)
        return Number.isFinite(date.getTime()) ? date.getHours() * 60 + date.getMinutes() : -1
      }
    }
  
    const iso = toIso(value)
    if (!iso) {
      return -1
    }
    const date = new Date(iso)
    if (!Number.isFinite(date.getTime())) {
      return -1
    }
    return date.getHours() * 60 + date.getMinutes()
  }
  
  function calendarTimelineRowStartMinutes(row = {}) {
    if (row?.isRunning) {
      const activeSortMinutes = calendarTimelineTimestampToMinutes(row?.activeSortTs)
      if (activeSortMinutes >= 0) {
        return activeSortMinutes
      }
    }
  
    const timeCandidates = [
      row?.qrStart,
      row?.qrStartLabel,
      row?.start,
      row?.startLabel,
      row?.startTime,
      row?.actualStartTime,
      row?.realStartTime,
    ]
    for (const candidate of timeCandidates) {
      const minutes = dashboardScheduleTimeToMinutes(candidate)
      if (Number.isFinite(minutes) && minutes >= 0) {
        return minutes
      }
    }
  
    const isoCandidates = [
      row?.activeSortTs,
      row?.qrStartAt,
      row?.qrStartIso,
      row?.dayStartIso,
      row?.firstStartIso,
      row?.startIso,
      row?.actualStartAt,
      row?.realStartAt,
      row?.startedAt,
      row?.startAt,
      row?.dayStartAt,
      row?.qrStartSourceItem?.startAt,
      row?.qrStartSourceItem?.dayStartAt,
    ]
    for (const candidate of isoCandidates) {
      const minutes = calendarTimelineTimestampToMinutes(candidate)
      if (minutes >= 0) {
        return minutes
      }
    }
  
    return -1
  }
  
  function calendarTimelineRowStopMinutes(row = {}) {
    const timeCandidates = [
      row?.qrStop,
      row?.qrStopLabel,
      row?.stop,
      row?.stopLabel,
      row?.endTime,
      row?.actualStopTime,
      row?.realEndTime,
    ]
    for (const candidate of timeCandidates) {
      const minutes = dashboardScheduleTimeToMinutes(candidate)
      if (Number.isFinite(minutes) && minutes >= 0) {
        return minutes
      }
    }
  
    const isoCandidates = [
      row?.qrStopAt,
      row?.qrStopIso,
      row?.dayEndIso,
      row?.stopIso,
      row?.actualEndAt,
      row?.actualStopAt,
      row?.realEndAt,
      row?.finishedAt,
      row?.endAt,
      row?.dayEndAt,
      row?.qrStopSourceItem?.endAt,
      row?.qrStopSourceItem?.dayEndAt,
    ]
    for (const candidate of isoCandidates) {
      const minutes = calendarTimelineTimestampToMinutes(candidate)
      if (minutes >= 0) {
        return minutes
      }
    }
  
    return -1
  }
  
  function calendarTimelineBuildWorkerStateMap(dayKey) {
    const normalizedDayKey = String(dayKey ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDayKey)) {
      return new Map()
    }
    const cacheKey = calendarTimelineWorkerStateMapCacheKey(normalizedDayKey)
    if (calendarTimelineWorkerStateMapCache.key === cacheKey) {
      return calendarTimelineWorkerStateMapCache.value
    }
  
    const stateMap = new Map()
    const upsertState = (key, state = {}, options = {}) => {
      if (!key) {
        return
      }
      const preferSource = Boolean(options.preferSource)
      const existing = stateMap.get(key) || {
        hasStart: false,
        isRunning: false,
        startMinutes: -1,
        sourceOfTruth: '',
      }
      const nextStartMinutes = Number(state.startMinutes ?? -1)
      stateMap.set(key, {
        hasStart: preferSource ? Boolean(state.hasStart) : existing.hasStart || Boolean(state.hasStart),
        isRunning: preferSource ? Boolean(state.isRunning) : existing.isRunning || Boolean(state.isRunning),
        startMinutes:
          preferSource
            ? nextStartMinutes >= 0
              ? nextStartMinutes
              : -1
            : existing.startMinutes >= 0 && nextStartMinutes >= 0
            ? Math.min(existing.startMinutes, nextStartMinutes)
            : existing.startMinutes >= 0
              ? existing.startMinutes
              : nextStartMinutes >= 0
                ? nextStartMinutes
                : -1,
        sourceOfTruth: preferSource
          ? String(state.sourceOfTruth ?? '').trim() || 'events'
          : existing.sourceOfTruth || String(state.sourceOfTruth ?? '').trim(),
      })
    }
  
    const sourceRows =
      appState.calendarTimelineWorkerStateDayKey === normalizedDayKey
        ? Array.isArray(appState.calendarTimelineWorkerStateSourceRows)
          ? appState.calendarTimelineWorkerStateSourceRows
          : []
        : []
    const todayKey = todayYmd()
    const rows =
      normalizedDayKey === todayKey
        ? Array.isArray(appState.calendarTimelineCurrentWorkerStatusRows) && appState.calendarTimelineCurrentWorkerStatusRows.length
          ? appState.calendarTimelineCurrentWorkerStatusRows
          : Array.isArray(appState.dashboardTodayRows)
            ? appState.dashboardTodayRows
            : []
        : appState.calendarTimelineWorkerStateDayKey === normalizedDayKey
          ? Array.isArray(appState.calendarTimelineWorkerStateRows)
            ? appState.calendarTimelineWorkerStateRows
            : []
          : []
    const hasCurrentStatusSnapshot =
      normalizedDayKey === todayKey && (calendarTimelineHasCurrentStatusSnapshot(normalizedDayKey) || rows.length > 0)
    const currentStatusByKey = new Map()
    if (hasCurrentStatusSnapshot) {
      rows.forEach((row) => {
        const startMinutes = calendarTimelineRowStartMinutes(row)
        const hasStart = Number.isFinite(startMinutes) && startMinutes >= 0
        const isRunning = calendarTimelineStatusRowIsRunning(row)
        const keys = dashboardResolveTodayRowAliasKeys(row)
        keys.forEach((key) => {
          if (!key) {
            return
          }
          const existing = currentStatusByKey.get(key) || {
            hasStart: false,
            isRunning: false,
            startMinutes: -1,
          }
          currentStatusByKey.set(key, {
            hasStart: existing.hasStart || hasStart,
            isRunning: existing.isRunning || isRunning,
            startMinutes:
              existing.startMinutes >= 0 && startMinutes >= 0
                ? Math.min(existing.startMinutes, startMinutes)
                : existing.startMinutes >= 0
                  ? existing.startMinutes
                  : startMinutes >= 0
                    ? startMinutes
                    : -1,
          })
        })
      })
    }
    const sourceBuckets = new Map()
    const ensureSourceBucket = (key) => {
      if (!sourceBuckets.has(key)) {
        sourceBuckets.set(key, {
          hasStart: false,
          earliestStartMinutes: -1,
          latestStartTs: 0,
          latestStartMinutes: -1,
          latestStopTs: 0,
        })
      }
      return sourceBuckets.get(key)
    }
  
    sourceRows.forEach((row) => {
      if ((dashboardResolveDayKey(row) || calendarTimelineRealEventRowDay(row)) !== normalizedDayKey) {
        return
      }
      const keys = dashboardResolveTodayRowAliasKeys(row)
      if (!(keys instanceof Set) || !keys.size) {
        return
      }
  
      const cycleStartTs = calendarTimelineSourceRowWorkerDotStartTimestamp(row)
      const stopTs = calendarTimelineSourceRowDayStopTimestamp(row)
      const cycleStartMinutes = cycleStartTs > 0 ? calendarTimelineTimestampToMinutes(new Date(cycleStartTs).toISOString()) : -1
  
      keys.forEach((key) => {
        const bucket = ensureSourceBucket(key)
        if (cycleStartTs > 0) {
          bucket.hasStart = true
          if (cycleStartMinutes >= 0) {
            bucket.earliestStartMinutes =
              bucket.earliestStartMinutes >= 0
                ? Math.min(bucket.earliestStartMinutes, cycleStartMinutes)
                : cycleStartMinutes
          }
          if (cycleStartTs >= bucket.latestStartTs) {
            bucket.latestStartTs = cycleStartTs
            bucket.latestStartMinutes = cycleStartMinutes
          }
        }
        if (stopTs > 0) {
          bucket.latestStopTs = Math.max(bucket.latestStopTs, stopTs)
        }
      })
    })
  
    sourceBuckets.forEach((bucket, key) => {
      const currentStatus = currentStatusByKey.get(key)
      const sourceRunning = hasCurrentStatusSnapshot
        ? Boolean(currentStatus?.isRunning)
        : bucket.latestStartTs > 0 && bucket.latestStartTs > bucket.latestStopTs
      upsertState(
        key,
        {
          hasStart: bucket.hasStart,
          isRunning: sourceRunning,
          startMinutes: sourceRunning
            ? currentStatus?.startMinutes >= 0
              ? currentStatus.startMinutes
              : bucket.latestStartMinutes
            : currentStatus?.startMinutes >= 0
              ? currentStatus.startMinutes
              : bucket.earliestStartMinutes,
          sourceOfTruth: hasCurrentStatusSnapshot ? 'status' : 'events',
        },
        { preferSource: true },
      )
    })
  
    rows.forEach((row) => {
      if (hasCurrentStatusSnapshot) {
        return
      }
      const startMinutes = calendarTimelineRowStartMinutes(row)
      const hasStart = Number.isFinite(startMinutes) && startMinutes >= 0
      const keys = dashboardResolveTodayRowAliasKeys(row)
      keys.forEach((key) => {
        if (sourceBuckets.has(key)) {
          return
        }
        upsertState(key, {
          hasStart,
          isRunning: calendarTimelineStatusRowIsRunning(row),
          startMinutes,
        })
      })
    })
  
    currentStatusByKey.forEach((state, key) => {
      const sourceBucket = sourceBuckets.get(key)
      const hasEventStart = Boolean(sourceBucket?.hasStart)
      const sourceStartMinutes = Number(sourceBucket?.latestStartMinutes ?? sourceBucket?.earliestStartMinutes ?? -1)
      const stateStartMinutes = Number(state.startMinutes ?? -1)
      const useCurrentStatusAsTruth = hasCurrentStatusSnapshot
      upsertState(
        key,
        {
          hasStart: useCurrentStatusAsTruth ? Boolean(state.hasStart) : hasEventStart,
          isRunning: useCurrentStatusAsTruth ? Boolean(state.isRunning) : hasEventStart && Boolean(state.isRunning),
          startMinutes: useCurrentStatusAsTruth
            ? stateStartMinutes
            : hasEventStart
              ? stateStartMinutes >= 0
                ? stateStartMinutes
                : sourceStartMinutes
              : -1,
          sourceOfTruth: useCurrentStatusAsTruth ? 'workday' : hasEventStart ? 'events+status' : 'status',
        },
        { preferSource: true },
      )
    })
  
    calendarTimelineWorkerStateMapCache.key = cacheKey
    calendarTimelineWorkerStateMapCache.value = stateMap
    return stateMap
  }
  
  function calendarTimelineWorkerHasStart(worker = {}) {
    const dayKey = todayYmd()
    const stateMap = calendarTimelineBuildWorkerStateMap(dayKey)
    const workerKeys = calendarTimelineWorkerAliasKeys(worker)
    return [...workerKeys].some((key) => {
      const state = stateMap.get(key)
      return Boolean(state?.isRunning)
    })
  }
  
  function calendarTimelineWorkerIsActive(worker = {}) {
    if (!worker || !calendarWorkerIsAssignable(worker)) {
      return false
    }
    const status = normalizeSearchText(worker?.status ?? worker?.workerStatus ?? worker?.state)
    if (!status) {
      return true
    }
    return ['aktywny', 'active', '1', 'true', 'yes', 'tak'].includes(status)
  }

  function calendarTimelineWorkersCacheSignature(workers = []) {
    const source = Array.isArray(workers) ? workers : []
    if (!source.length) {
      return '0'
    }
    return `${source.length}:${source.map((worker, index) => [
      worker?.workerId ?? worker?.id ?? index,
      worker?.workerName ?? worker?.fullName ?? worker?.name ?? '',
      worker?.workerLogin ?? worker?.login ?? '',
      worker?.workerType ?? worker?.type ?? worker?.role ?? '',
      worker?.status ?? worker?.workerStatus ?? worker?.state ?? '',
      worker?.active ?? worker?.isActive ?? '',
    ].map((value) => String(value ?? '').trim()).join(',')).join('|')}`
  }

  function calendarTimelineWorkerSortPriority(worker = {}) {
    const kind = calendarTimelineWorkerTypeKind(worker)
    if (kind === 'mobile') {
      return 0
    }
    if (kind === 'coordinator') {
      return 1
    }
    if (kind === 'site') {
      return 2
    }
    if (kind === 'admin') {
      return 3
    }
    return 4
  }

  function calendarTimelineWorkerTypeKind(worker = {}) {
    const typeText = normalizeSearchText([
      worker?.workerType,
      worker?.type,
      worker?.role,
      worker?.profileRole,
      worker?.permissions,
      worker?.permission,
    ].filter((value) => String(value ?? '').trim()).join(' '))
    if (typeText.includes('mobil') || typeText.includes('zespol')) {
      return 'mobile'
    }
    if (typeText.includes('koord') || typeText.includes('coordinator')) {
      return 'coordinator'
    }
    if (typeText.includes('personel') && (typeText.includes('obiek') || typeText.includes('sta'))) {
      return 'site'
    }
    if (typeText.includes('admin') || typeText.includes('administrator')) {
      return 'admin'
    }
    return 'standard'
  }

  function calendarTimelineWorkerTypeBadge(worker = {}) {
    const kind = calendarTimelineWorkerTypeKind(worker)
    if (kind === 'mobile') {
      return { className: 'mobile', label: 'MOB', title: 'Zespol mobilny' }
    }
    if (kind === 'coordinator') {
      return { className: 'coordinator', label: 'KOO', title: 'Koordynator' }
    }
    if (kind === 'site') {
      return { className: 'site', label: 'STA', title: 'Staly personel na obiekcie' }
    }
    if (kind === 'admin') {
      return { className: 'admin', label: 'ADM', title: 'Admin' }
    }
    return null
  }
  
  function calendarTimelineResources() {
    const source = Array.isArray(appState.workers) && appState.workers.length ? calendarAssignableWorkers() : appState.workerTimeRows
    const cacheKey = [
      appState.workersLoaded ? 'workers-loaded' : 'workers-pending',
      calendarTimelineWorkersCacheSignature(source),
      calendarTimelineWorkerStateMapCacheKey(todayYmd()),
    ].join('::')
    if (calendarTimelineResourcesCache.key === cacheKey) {
      return calendarTimelineResourcesCache.value
    }
    const seen = new Set()
    const workers = (Array.isArray(source) ? source : [])
      .filter((worker) => calendarTimelineWorkerIsActive(worker))
      .map((worker) => {
        const rawName = String(worker.workerName ?? worker.fullName ?? worker.name ?? worker.login ?? worker.workerId ?? '').trim()
        const name = calendarTimelineWorkerName(rawName)
        const workerId = dashboardCanonicalWorkerId(worker.workerId ?? worker.id)
        const key = normalizeSearchText(workerId)
        return name && key ? { name, key, type: 'worker', worker, started: calendarTimelineWorkerHasStart(worker) } : null
      })
      .filter(Boolean)
      .filter((resource) => {
        if (seen.has(resource.key)) {
          return false
        }
        seen.add(resource.key)
        return true
      })
      .sort((first, second) => {
        const priorityDiff = calendarTimelineWorkerSortPriority(first.worker) - calendarTimelineWorkerSortPriority(second.worker)
        if (priorityDiff) {
          return priorityDiff
        }
        return first.name.localeCompare(second.name, 'pl', { sensitivity: 'base' })
      })
  
    if (workers.length) {
      const resources = [{ name: 'BUFOR', key: 'buffer', type: 'buffer' }, ...workers]
      calendarTimelineResourcesCache.key = cacheKey
      calendarTimelineResourcesCache.value = resources
      return resources
    }
  
    const placeholderResources = [
      { name: 'BUFOR', key: 'buffer', type: 'buffer' },
      {
        name: appState.workersLoaded ? 'Brak pracowników' : 'Ładowanie pracowników...',
        key: 'workers-placeholder',
        type: 'placeholder',
      },
    ]
    calendarTimelineResourcesCache.key = cacheKey
    calendarTimelineResourcesCache.value = placeholderResources
    return placeholderResources
  }
  
  function calendarTimelineGridRowForResource(resource = {}, index = 0) {
    return resource?.type === 'buffer' ? 1 : Number(index) + 3
  }
  
  function calendarTimelineResourceAvatarTone(index = 0) {
    return `tone-${(Math.max(0, Number(index) || 0) % 8) + 1}`
  }
  
  function calendarTimelineResourceRowHeight(rowIndex, resource = {}) {
    if (resource?.type === 'buffer') {
      return 48
    }
    const laneCount = Number(appState.calendarTimelineLaneCounts?.get?.(rowIndex) || 0)
    const deltaCount = Number(appState.calendarTimelineDeltaCounts?.get?.(rowIndex) || 0)
    const stackedHeight = 10 + Math.max(1, laneCount) * 22 + (deltaCount ? 24 : 0)
    const labelHeight = deltaCount ? 28 + deltaCount * 18 : 0
    return Math.max(40, stackedHeight, labelHeight)
  }
  
  function calendarTimelineCurrentHourHtml(days = [], hours = [], resources = []) {
    const now = new Date()
    const today = calendarDateToYmd(now)
    const dayIndex = days.indexOf(today)
    const slotsPerDay = hours.length * CALENDAR_TIMELINE_SLOTS_PER_HOUR
    const dayStartMinutes = Number(hours[0] ?? 0) * 60
    const dayEndMinutes = (Number(hours[hours.length - 1] ?? 23) + 1) * 60
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    if (dayIndex < 0 || !slotsPerDay || nowMinutes < dayStartMinutes || nowMinutes >= dayEndMinutes) {
      return ''
    }
  
    const slotInDay = Math.max(0, Math.min(slotsPerDay - 1, Math.round((nowMinutes - dayStartMinutes) / CALENDAR_TIMELINE_SLOT_MINUTES)))
    const slot = dayIndex * slotsPerDay + slotInDay + 1
    const firstWorkerIndex = resources.findIndex((resource) => resource?.type !== 'buffer')
    const workerRows = resources.filter((resource) => resource?.type !== 'buffer').length
    if (firstWorkerIndex < 0 || !workerRows) {
      return ''
    }
    const firstWorkerGridRow = calendarTimelineGridRowForResource(resources[firstWorkerIndex], firstWorkerIndex)
    return `
      <div
        class="fw-current-hour"
        style="grid-column:${slot + 1}; grid-row:${firstWorkerGridRow} / span ${workerRows};"
        aria-label="Aktualna godzina ${pad2(now.getHours())}:${pad2(now.getMinutes())}"
      ></div>
    `
  }

  function calendarClearTimelineHourRefresh() {
    if (appState.calendarTimelineHourTimer) {
      window.clearTimeout(appState.calendarTimelineHourTimer)
      appState.calendarTimelineHourTimer = null
    }
  }

  function calendarScheduleTimelineHourRefresh() {
    calendarClearTimelineHourRefresh()
  
    const now = new Date()
    const nextSlot = new Date(now)
    nextSlot.setHours(now.getHours(), Math.floor(now.getMinutes() / CALENDAR_TIMELINE_SLOT_MINUTES) * CALENDAR_TIMELINE_SLOT_MINUTES + CALENDAR_TIMELINE_SLOT_MINUTES, 1, 0)
    const delayMs = Math.max(nextSlot.getTime() - now.getTime(), 1000)
    appState.calendarTimelineHourTimer = window.setTimeout(() => {
      appState.calendarTimelineHourTimer = null
      if (appState.currentRoute === 'calendar' && document.getElementById('calendarTimelinePrototype')) {
        renderCalendarView()
      }
    }, delayMs)
  }
  
  function calendarTimelineTimeMinutes(value, fallback = 0) {
    const minutes = calendarTimeToMinutes(value)
    return Number.isFinite(minutes) ? minutes : fallback
  }
  
  function calendarTimelineSnapMinutes(value, fallback = 0) {
    const minutes = Number(value)
    const normalized = Number.isFinite(minutes) ? minutes : Number(fallback)
    const safe = Number.isFinite(normalized) ? normalized : 0
    return Math.round(safe / CALENDAR_TIMELINE_SLOT_MINUTES) * CALENDAR_TIMELINE_SLOT_MINUTES
  }
  
  function calendarTimelineSnapDurationMinutes(value) {
    return Math.max(CALENDAR_TIMELINE_SLOT_MINUTES, calendarTimelineSnapMinutes(value, CALENDAR_TIMELINE_SLOT_MINUTES))
  }
  
  function calendarTimelineCompareYmd(left, right) {
    return String(left ?? '').localeCompare(String(right ?? ''))
  }
  
  function calendarTimelineSlotIndex(dayKey, timeValue, days = [], hours = []) {
    const normalizedDay = String(dayKey ?? '').trim()
    const firstDay = String(days[0] ?? '').trim()
    const lastDay = String(days[days.length - 1] ?? '').trim()
    const slotsPerDay = hours.length * CALENDAR_TIMELINE_SLOTS_PER_HOUR
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDay) || !firstDay || !lastDay || !slotsPerDay) {
      return null
    }
  
    if (calendarTimelineCompareYmd(normalizedDay, firstDay) < 0) {
      return 0
    }
    if (calendarTimelineCompareYmd(normalizedDay, lastDay) > 0) {
      return days.length * slotsPerDay
    }
  
    const dayIndex = days.indexOf(normalizedDay)
    if (dayIndex < 0) {
      return null
    }
  
    const dayStartMinutes = Number(hours[0] ?? 0) * 60
    const dayEndMinutes = (Number(hours[hours.length - 1] ?? 23) + 1) * 60
    const minutes = calendarTimelineTimeMinutes(timeValue, dayStartMinutes)
    if (minutes <= dayStartMinutes) {
      return dayIndex * slotsPerDay
    }
    if (minutes >= dayEndMinutes) {
      return (dayIndex + 1) * slotsPerDay
    }
  
    return dayIndex * slotsPerDay + (minutes - dayStartMinutes) / CALENDAR_TIMELINE_SLOT_MINUTES
  }
  
  function calendarTimelineOrderPosition(order, days = [], hours = []) {
    const startDay = String(order?.dateYmd ?? '').trim()
    const startTime = String(order?.startTime ?? '').trim()
    let endDay = String(order?.endDateYmd || order?.dateYmd || '').trim()
    const endTime = String(order?.endTime ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDay) || !/^\d{4}-\d{2}-\d{2}$/.test(endDay)) {
      return null
    }
  
    const startMinutes = calendarTimelineTimeMinutes(startTime, 0)
    const endMinutes = calendarTimelineTimeMinutes(endTime, startMinutes + 60)
    if (endDay === startDay && endMinutes <= startMinutes) {
      endDay = calendarAddDays(startDay, 1)
    }
  
    const startIndex = calendarTimelineSlotIndex(startDay, startTime, days, hours)
    const endIndex = calendarTimelineSlotIndex(endDay, endTime, days, hours)
    if (!Number.isFinite(startIndex) || !Number.isFinite(endIndex)) {
      return null
    }
  
    const rangeSlots = days.length * hours.length * CALENDAR_TIMELINE_SLOTS_PER_HOUR
    const visibleStart = Math.max(0, Math.min(rangeSlots, startIndex))
    const visibleEnd = Math.max(0, Math.min(rangeSlots, endIndex))
    if (visibleEnd <= visibleStart) {
      return null
    }
  
    const startSlot = Math.max(0, Math.min(rangeSlots - 1, Math.round(visibleStart)))
    const endSlot = Math.max(startSlot + 1, Math.min(rangeSlots, Math.round(visibleEnd)))
    return {
      startColumn: startSlot + 2,
      span: Math.max(1, endSlot - startSlot),
      visibleStart: startSlot,
      visibleEnd: endSlot,
    }
  }
  
  function calendarTimelineLayoutEventBars(bars = [], days = [], hours = [], resources = [], selectedTypes = calendarTimelineSelectedTypes()) {
    const items = bars
      .filter((bar) => bar.row < resources.length)
      .filter((bar) => bar?.isRealEvent && bar?.realTrack === 'workday' ? true : selectedTypes.has(bar.type || 'other'))
      .filter((bar) => appState.calendarTimelineShowCompleted !== false || !bar.completed)
      .map((bar) => {
        const position = calendarTimelineOrderPosition(bar, days, hours)
        return position ? { bar, position, lane: 0, laneCount: 1 } : null
      })
      .filter(Boolean)
  
    const rowLaneCounts = new Map()
    const byRow = new Map()
    items.forEach((item) => {
      const row = Number(item.bar.row)
      if (!byRow.has(row)) {
        byRow.set(row, [])
      }
      byRow.get(row).push(item)
    })
  
    byRow.forEach((rowItems, row) => {
      const laneGapSlots = 2
      if (!calendarTimelineRowAllowsOverlap(row, resources)) {
        rowItems
          .sort((left, right) => {
            const byKind = Number(Boolean(left?.bar?.isRealEvent)) - Number(Boolean(right?.bar?.isRealEvent))
            if (byKind) return byKind
            const byStart = left.position.visibleStart - right.position.visibleStart
            if (byStart) return byStart
            return left.position.visibleEnd - right.position.visibleEnd
          })
          .forEach((item) => {
            item.lane = item?.bar?.isRealEvent ? 1 : 0
          })
        const laneCount = rowItems.length ? 2 : 1
        rowItems.forEach((item) => {
          item.laneCount = laneCount
        })
        rowLaneCounts.set(row, laneCount)
        return
      }
  
      const laneEnds = []
      rowItems
        .sort((left, right) => {
          const byStart = left.position.visibleStart - right.position.visibleStart
          if (byStart) return byStart
          const byKind = Number(Boolean(left?.bar?.isRealEvent)) - Number(Boolean(right?.bar?.isRealEvent))
          if (byKind) return byKind
          return left.position.visibleEnd - right.position.visibleEnd
        })
        .forEach((item) => {
          const lane = laneEnds.findIndex((end) => end + laneGapSlots <= item.position.visibleStart)
          const nextLane = lane >= 0 ? lane : laneEnds.length
          item.lane = nextLane
          laneEnds[nextLane] = item.position.visibleEnd
        })
      const laneCount = Math.max(1, laneEnds.length)
      rowLaneCounts.set(row, laneCount)
      rowItems.forEach((item) => {
        item.laneCount = laneCount
      })
    })
  
    return { items, rowLaneCounts }
  }

  function calendarTimelineComparableActivityBar(item = {}, resources = []) {
    const bar = item?.bar ?? item
    if (!bar || typeof bar !== 'object') {
      return null
    }
    const row = Number(bar.row)
    if (!Number.isInteger(row) || row < 0 || resources[row]?.type === 'buffer') {
      return null
    }
    const isRealWorkday = Boolean(bar?.isRealEvent && bar?.realTrack === 'workday')
    const isPlanned = !bar?.isRealEvent
    if (!isRealWorkday && !isPlanned) {
      return null
    }
    const bounds = calendarTimelineOrderPlannedBounds(bar)
    if (!bounds) {
      return null
    }
    const status = String(bar?.status ?? '').trim().toUpperCase()
    const isRunning = isRealWorkday && !bar?.completed && !bar?.actualEndAt && status !== 'CLOSED'
    const clientLabel = calendarTimelineOrderClientBarLabel(bar)
    return {
      item,
      original: bar,
      row,
      lane: Math.max(0, Math.floor(Number(item?.lane) || 0)),
      laneCount: Math.max(1, Math.floor(Number(item?.laneCount) || 1)),
      kind: isRealWorkday ? 'workday' : 'planned',
      startTs: bounds.startTs,
      stopTs: bounds.endTs,
      clippedStart: bounds.startTs,
      clippedStop: bounds.endTs,
      isRunning,
      companyLabel: clientLabel || bar?.clientLabel || bar?.title || '',
      locationLabel: bar?.addressLabel || bar?.locationLabel || clientLabel || '',
    }
  }

  function calendarTimelineDeltaMarkerColumn(timestamp = 0, days = [], hours = []) {
    const value = Number(timestamp)
    if (!Number.isFinite(value) || value <= 0) {
      return null
    }
    const date = new Date(value)
    if (!Number.isFinite(date.getTime())) {
      return null
    }
    const day = calendarDateToYmd(date)
    const time = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
    const slot = calendarTimelineSlotIndex(day, time, days, hours)
    if (!Number.isFinite(slot)) {
      return null
    }
    const totalSlots = days.length * hours.length * CALENDAR_TIMELINE_SLOTS_PER_HOUR
    return Math.max(2, Math.min(totalSlots + 1, Math.round(slot) + 2))
  }

  function calendarTimelineDeltaTitle(delta = {}) {
    const phaseLabel = delta.phase === 'end' ? 'STOP' : 'START'
    const plannedTs = delta.phase === 'end' ? delta.plannedStopTs : delta.plannedStartTs
    const actualTs = delta.phase === 'end' ? delta.actualStopTs : delta.actualStartTs
    return `Plan ${phaseLabel}: ${calendarTimelineHmFromTimestamp(plannedTs)} | Realny ${phaseLabel}: ${calendarTimelineHmFromTimestamp(actualTs)} | Roznica: ${delta.label}`
  }

  function calendarTimelineDeltaData(layoutItems = [], days = [], hours = [], resources = []) {
    const byRow = new Map()
    const totalSlots = days.length * hours.length * CALENDAR_TIMELINE_SLOTS_PER_HOUR
    const minMarkerGroupSlots = 28
    const markerGroupRange = (columns = []) => {
      const safeColumns = columns
        .map((column) => Number(column))
        .filter((column) => Number.isFinite(column))
      if (!safeColumns.length || !totalSlots) {
        return { start: 2, split: 16, end: 30 }
      }
      const minColumn = Math.max(2, Math.min(...safeColumns))
      const maxColumn = Math.min(totalSlots + 1, Math.max(...safeColumns))
      let start = Math.floor(minColumn)
      let end = Math.ceil(maxColumn) + 1
      if (end - start < minMarkerGroupSlots) {
        const center = Math.round((minColumn + maxColumn) / 2)
        start = center - Math.floor(minMarkerGroupSlots / 2)
        end = start + minMarkerGroupSlots
      }
      if (start < 2) {
        end += 2 - start
        start = 2
      }
      if (end > totalSlots + 2) {
        start -= end - (totalSlots + 2)
        end = totalSlots + 2
      }
      start = Math.max(2, start)
      end = Math.max(start + 2, Math.min(totalSlots + 2, end))
      const split = Math.max(start + 1, Math.min(end - 1, Math.round((start + end) / 2)))
      return { start, split, end }
    }
  
    ;(Array.isArray(layoutItems) ? layoutItems : [])
      .map((item) => calendarTimelineComparableActivityBar(item, resources))
      .filter(Boolean)
      .forEach((bar) => {
        if (!byRow.has(bar.row)) {
          byRow.set(bar.row, [])
        }
        byRow.get(bar.row).push(bar)
      })
  
    const markerItems = []
    const rowDeltas = new Map()
    const seenMarkers = new Set()
    byRow.forEach((bars, row) => {
      const rowLaneCount = bars.reduce(
        (max, bar) => Math.max(max, Number(bar.laneCount) || Number(bar.lane) + 1 || 1),
        1,
      )
      const realBars = bars.filter((bar) => bar.kind === 'workday')
      realBars.forEach((bar) => {
        const startColumn = calendarTimelineDeltaMarkerColumn(bar.startTs, days, hours)
        const stopColumn = calendarTimelineDeltaMarkerColumn(bar.stopTs, days, hours)
        const markerRange = markerGroupRange([startColumn, stopColumn])
        const deltas = [
          dashboardActivityStartDeltaInfo(bar, bars),
          dashboardActivityEndDeltaInfo(bar, bars),
        ].filter(Boolean)
        deltas.forEach((delta) => {
          const timestamp = delta.phase === 'end' ? delta.actualStopTs : delta.actualStartTs
          const column = calendarTimelineDeltaMarkerColumn(timestamp, days, hours)
          if (!column) {
            return
          }
          const key = `${row}|${delta.kind}|${Math.round(Number(timestamp) / 60000)}|${delta.label}`
          if (seenMarkers.has(key)) {
            return
          }
          seenMarkers.add(key)
          const deltaIndex = rowDeltas.get(row)?.length || 0
          const safeDelta = {
            ...delta,
            row,
            lane: bar.lane,
            laneCount: rowLaneCount,
            deltaIndex,
            column,
            groupEnd: markerRange.end,
            groupSplit: markerRange.split,
            groupStart: markerRange.start,
            title: calendarTimelineDeltaTitle(delta),
          }
          markerItems.push(safeDelta)
          if (!rowDeltas.has(row)) {
            rowDeltas.set(row, [])
          }
          rowDeltas.get(row).push(safeDelta)
        })
      })
    })
  
    const rowDeltaCounts = new Map()
    rowDeltas.forEach((deltas, row) => {
      rowDeltaCounts.set(row, deltas.length)
    })
    const markerHtml = markerItems
      .map((delta) => {
        const gridRow = calendarTimelineGridRowForResource(resources[delta.row] || {}, delta.row)
        return `
          <span
            class="fw-delta-marker fw-delta-marker--${escapeHtml(delta.kind)} fw-delta-marker--phase-${escapeHtml(delta.phase === 'end' ? 'end' : 'start')}"
            style="grid-column:${delta.phase === 'end' ? `${delta.groupSplit} / ${delta.groupEnd}` : `${delta.groupStart} / ${delta.groupSplit}`}; grid-row:${gridRow};"
            title="${escapeHtml(delta.title)}"
          >${escapeHtml(delta.label)}</span>
        `
      })
      .join('')
  
    return { markerHtml, rowDeltas, rowDeltaCounts }
  }
  
  function calendarTimelineDefaultDemoOrders() {
    return []
  }
  
  function ordersIsDatabaseScheduleOrder(order = {}) {
    return String(order?.recordKind ?? '').trim() === 'portal-schedule-order' || Boolean(String(order?.idTask ?? '').trim())
  }
  
  function ordersIsSeedDemoOrder(order = {}) {
    if (ordersIsDatabaseScheduleOrder(order)) {
      return false
    }
    return /^fw-order-(?:[1-9]|1\d|2[0-3])$/.test(String(order?.id ?? '').trim())
  }
  
  function ordersNormalizeTimelineOrder(order = {}) {
    if (!order || typeof order !== 'object' || Array.isArray(order)) {
      return null
    }
  
    const id = String(order.id ?? '').trim()
    if (!id || order.isDraft || ordersIsSeedDemoOrder(order)) {
      return null
    }
  
    const recurringOverrideInfo = calendarTimelineRecurringOverrideInfo({ ...order, id })
    const nowIso = new Date().toISOString()
    const dateYmd = ordersNormalizeDateField(order.dateYmd ?? order.dateFrom ?? order.startDate, recurringOverrideInfo?.dateYmd || todayYmd())
    const startTime = ordersNormalizeTimeField(order.startTime ?? order.time, '08:00')
    const endDateYmd = ordersNormalizeDateField(order.endDateYmd ?? order.validUntil ?? order.dateTo ?? order.endDate, dateYmd)
    const endTime = ordersNormalizeTimeField(order.endTime ?? order.stopTime, ordersDefaultEndTime(startTime))
    const assignedRows = ordersNormalizeOrderRows({ ...order, dateYmd, startTime, endDateYmd, endTime }, [])
    const row = assignedRows[0] ?? 0
    const rawType = ['individual', 'cyclic', 'renovation', 'windows', 'other'].includes(String(order.type ?? '').trim())
      ? String(order.type).trim()
      : 'other'
    const type = recurringOverrideInfo ? calendarTimelineSingleOccurrenceType({ ...order, type: rawType }) : rawType
    const createdAt = String(order.createdAt ?? '').trim() || nowIso
    const updatedAt = String(order.updatedAt ?? '').trim() || createdAt
    const allowExtendedWork = ordersExtendedWorkAllowed(order)
  
    return ordersAssignExtendedWorkFlags({
      ...order,
      id,
      ...(recurringOverrideInfo
        ? {
            orderId: String(order.orderId ?? '').trim() || id,
            sourceOrderId: recurringOverrideInfo.sourceOrderId,
            recurrenceSourceOrderId: recurringOverrideInfo.sourceOrderId,
            parentOrderId: recurringOverrideInfo.sourceOrderId,
            recurrenceOverride: true,
            recurrenceOverrideKind: 'single-day',
            recurrenceOriginalDateYmd: recurringOverrideInfo.dateYmd,
            recurrenceOverrideDateYmd: recurringOverrideInfo.dateYmd,
            scheduleMode: 'once',
            repeatPreset: 'none',
            repeatEvery: 1,
            repeatUnit: 'day',
            repeatWeekdays: [],
            weeklyScheduleRules: [],
            weeklyPattern: [],
            repeatDayRules: [],
            dayScheduleRules: [],
          }
        : {}),
      row,
      assignedRows,
      workerAssignments: Array.isArray(order.workerAssignments) && order.workerAssignments.length ? order.workerAssignments : [],
      dateYmd,
      startTime,
      endDateYmd,
      endTime,
      validUntil: ordersNormalizeDateField(order.validUntil ?? endDateYmd, endDateYmd),
      nextDate: ordersNormalizeDateField(order.nextDate ?? dateYmd, dateYmd),
      title: String(order.title ?? order.name ?? '').trim() || 'Zlecenie',
      type,
      tone: order.tone || ordersTimelineToneForType(type),
      createdAt,
      updatedAt,
      isDraft: false,
    }, allowExtendedWork)
  }
  
  function ordersOrderUpdatedAtValue(order = {}) {
    const candidates = [order.updatedAt, order.createdAt]
    for (const candidate of candidates) {
      const time = Date.parse(String(candidate ?? ''))
      if (Number.isFinite(time)) {
        return time
      }
    }
    return 0
  }
  
  function ordersSortTimelineOrders(orders = []) {
    return [...orders].sort((left, right) => {
      const byDate = String(left?.dateYmd ?? '').localeCompare(String(right?.dateYmd ?? ''))
      if (byDate) return byDate
      const byStart = String(left?.startTime ?? '').localeCompare(String(right?.startTime ?? ''))
      if (byStart) return byStart
      return String(left?.id ?? '').localeCompare(String(right?.id ?? ''))
    })
  }
  
  function ordersMergeTimelineOrderLists(...orderLists) {
    const byId = new Map()
    orderLists
      .flat()
      .filter(Boolean)
      .map((order) => ordersNormalizeTimelineOrder(order))
      .filter(Boolean)
      .forEach((order) => {
        const existing = byId.get(order.id)
        if (!existing || ordersOrderUpdatedAtValue(order) >= ordersOrderUpdatedAtValue(existing)) {
          byId.set(order.id, order)
        }
      })
    return ordersSortTimelineOrders([...byId.values()])
  }

  function ordersPendingLocalOrderEntries() {
    const now = Date.now()
    const entries = Array.isArray(appState.calendarTimelinePendingLocalOrders)
      ? appState.calendarTimelinePendingLocalOrders
      : []
    const activeEntries = []
    entries.forEach((entry) => {
      const order = ordersNormalizeTimelineOrder(entry?.order)
      const retainedAt = Number(entry?.retainedAt ?? 0)
      if (!order || !Number.isFinite(retainedAt) || retainedAt <= 0 || now - retainedAt > ORDERS_LOCAL_RETENTION_MS) {
        return
      }
      activeEntries.push({ order, retainedAt })
    })
    appState.calendarTimelinePendingLocalOrders = activeEntries
    return activeEntries
  }

  function ordersRememberPendingLocalOrders(orders = []) {
    const list = Array.isArray(orders) ? orders : [orders]
    const retainedAt = Date.now()
    const byId = new Map(ordersPendingLocalOrderEntries().map((entry) => [String(entry.order?.id ?? '').trim(), entry]))
    list.forEach((order) => {
      const normalized = ordersNormalizeTimelineOrder(order)
      if (normalized?.id) {
        byId.set(normalized.id, { order: normalized, retainedAt })
      }
    })
    appState.calendarTimelinePendingLocalOrders = [...byId.values()]
  }

  function ordersForgetPendingLocalOrders(orderIds = []) {
    const ids = new Set((Array.isArray(orderIds) ? orderIds : [orderIds]).map((value) => String(value ?? '').trim()).filter(Boolean))
    if (!ids.size) {
      return
    }
    appState.calendarTimelinePendingLocalOrders = ordersPendingLocalOrderEntries().filter((entry) => !ids.has(entry.order.id))
  }

  function ordersMergeWithPendingLocalOrders(orders = [], options = {}) {
    const remoteOrders = ordersMergeTimelineOrderLists(orders)
    const remoteById = new Map(remoteOrders.map((order) => [order.id, order]))
    const confirmPending = options.confirmPending !== false
    const pendingOrders = []
    const stillPending = []
    ordersPendingLocalOrderEntries().forEach((entry) => {
      const order = ordersNormalizeTimelineOrder(entry.order)
      if (!order?.id) {
        return
      }
      const remoteOrder = remoteById.get(order.id)
      if (confirmPending && remoteOrder && ordersOrderUpdatedAtValue(remoteOrder) >= ordersOrderUpdatedAtValue(order)) {
        return
      }
      pendingOrders.push(order)
      stillPending.push({ order, retainedAt: entry.retainedAt })
    })
    appState.calendarTimelinePendingLocalOrders = stillPending
    return ordersMergeTimelineOrderLists(remoteOrders, pendingOrders)
  }
  
  function ordersTimelineOrderSyncSignature(orders = []) {
    return ordersMergeTimelineOrderLists(orders)
      .map((order) => `${String(order.id ?? '').trim()}:${String(order.updatedAt ?? '').trim()}`)
      .join('|')
  }
  
  function ordersTimelineOrderListsDiffer(left = [], right = []) {
    return ordersTimelineOrderSyncSignature(left) !== ordersTimelineOrderSyncSignature(right)
  }
  
  function ordersLoadLocalTimelineOrders() {
    return []
  }
  
  function ordersPersistLocalTimelineOrders(orders = []) {
    void orders
  }

  function ordersActiveOrganizationId() {
    return String(appState.session?.activeOrgId ?? appState.session?.orgId ?? '').trim()
  }

  function ordersRemoteSessionKey() {
    const uid = String(appState.session?.uid ?? '').trim()
    const orgId = ordersActiveOrganizationId()
    return uid && orgId ? `${uid}:${orgId}` : ''
  }

  function ordersRemoteRequestIsCurrent(sessionKey, generation) {
    return (
      Boolean(sessionKey) &&
      sessionKey === ordersRemoteSessionKey() &&
      generation === calendarTimelineOrdersRemoteGeneration
    )
  }

  function ordersInvalidateRemoteTimelineRequests() {
    calendarTimelineOrdersRemoteGeneration += 1
    calendarTimelineOrdersRemotePromise = null
    calendarTimelineOrdersRemotePromiseKey = ''
    calendarTimelineOrdersQueuedSave = null
    calendarTimelineOrdersRemoteRetryCount = 0
    ordersClearRemoteTimelineOrderSaveTimer()
    ordersClearRemoteTimelineOrderRetryTimer()
    appState.calendarTimelineOrdersRemoteLoading = false
  }
  
  function ordersScheduleRemoteTimelineOrderRetry(orders, error) {
    const delayMs = scheduleOrderSaveRetryDelay(error, calendarTimelineOrdersRemoteRetryCount)
    if (!delayMs || ordersRemoteRetryTimer || typeof window === 'undefined') {
      return
    }
    const sessionKey = ordersRemoteSessionKey()
    if (!sessionKey) {
      return
    }
  
    const snapshot = ordersMergeTimelineOrderLists(orders)
    calendarTimelineOrdersRemoteRetryCount += 1
    ordersRemoteRetryTimer = window.setTimeout(() => {
      ordersRemoteRetryTimer = 0
      if (sessionKey !== ordersRemoteSessionKey()) {
        return
      }
      ordersQueueRemoteTimelineOrderSave(snapshot, { retry: true })
    }, delayMs)
  }
  
  function ordersCancelRemoteTimelineOrderSave() {
    if (ordersRemoteSaveTimer) {
      window.clearTimeout(ordersRemoteSaveTimer)
      ordersRemoteSaveTimer = 0
    }
  }
  
  function ordersQueueRemoteTimelineOrderSave(orders = ordersListSourceOrders(), options = {}) {
    const orgId = ordersActiveOrganizationId()
    if (!orgId) {
      return
    }

    if (!options.retry) {
      ordersClearRemoteTimelineOrderRetryTimer()
      calendarTimelineOrdersRemoteRetryCount = 0
    }
  
    ordersClearRemoteTimelineOrderSaveTimer()
  
    const snapshot = ordersMergeTimelineOrderLists(orders)
    ordersRemoteSaveTimer = window.setTimeout(() => {
      ordersRemoteSaveTimer = 0
      void ordersSaveRemoteTimelineOrdersNow(snapshot, { retry: options.retry === true })
    }, 350)
  }
  
  function ordersClearRemoteTimelineOrderSaveTimer() {
    if (ordersRemoteSaveTimer) {
      window.clearTimeout(ordersRemoteSaveTimer)
      ordersRemoteSaveTimer = 0
    }
  }
  
  function ordersClearRemoteTimelineOrderRetryTimer() {
    if (ordersRemoteRetryTimer) {
      window.clearTimeout(ordersRemoteRetryTimer)
      ordersRemoteRetryTimer = 0
    }
  }
  
  function ordersRenderScheduleOrderViews() {
    if (appState.currentRoute === 'dashboard') renderDashboardActivityCalendar(appState.dashboardTodayRows)
    if (appState.currentRoute === 'calendar') renderCalendarView()
    if (appState.currentRoute === 'orders') renderOrdersView()
    if (appState.currentRoute === 'ordersMap') renderOrdersMapView()
  }

  function ordersRemoteSaveSignature(orders = []) {
    return JSON.stringify(ordersMergeTimelineOrderLists(orders))
  }
  
  async function ordersSaveRemoteTimelineOrdersNow(orders = ordersListSourceOrders(), options = {}) {
    const orgId = ordersActiveOrganizationId()
    const sessionKey = ordersRemoteSessionKey()
    const generation = calendarTimelineOrdersRemoteGeneration
    if (!orgId || !sessionKey) {
      return false
    }
  
    ordersClearRemoteTimelineOrderSaveTimer()

    const snapshot = ordersMergeTimelineOrderLists(orders)
    const snapshotSignature = ordersRemoteSaveSignature(snapshot)
    if (calendarTimelineOrdersRemoteSavePromise && calendarTimelineOrdersRemoteSavePromiseKey === sessionKey) {
      if (calendarTimelineOrdersRemoteSaveSignature !== snapshotSignature) {
        calendarTimelineOrdersQueuedSave = {
          options: { ...options, retry: false },
          orders: snapshot,
        }
      }
      return calendarTimelineOrdersRemoteSavePromise
    }

    const save = async () => {
      const conflictCandidates = scheduleConflictPreflightCandidates(options)
      const scheduleConflicts = conflictCandidates.flatMap((candidate) => (
        calendarTimelineFindOrderConflicts(candidate, snapshot, calendarTimelineResources())
      ))
      if (scheduleConflicts.length) {
        calendarTimelineShowConflictDialog(scheduleConflicts)
        return false
      }
      if (options.retainLocalOrders) {
        ordersRememberPendingLocalOrders(options.retainLocalOrders)
      }
      try {
        const savedOrders = await upsertScheduleTasks(orgId, snapshot)
        if (!ordersRemoteRequestIsCurrent(sessionKey, generation)) {
          return false
        }
        appState.calendarTimelineOrdersRemoteLoaded = true
        ordersClearRemoteTimelineOrderRetryTimer()
        calendarTimelineOrdersRemoteRetryCount = 0
        if (Array.isArray(savedOrders)) {
          ordersSaveTimelineOrders(ordersMergeWithPendingLocalOrders(savedOrders, { confirmPending: false }), {
            syncRemote: false,
            preserveDrafts: false,
          })
        } else {
          ordersSaveTimelineOrders(ordersMergeWithPendingLocalOrders(snapshot, { confirmPending: false }), {
            syncRemote: false,
            preserveDrafts: false,
          })
        }
        if (options.render) {
          ordersRenderScheduleOrderViews()
        }
        return true
      } catch (error) {
        if (!ordersRemoteRequestIsCurrent(sessionKey, generation) || error?.code === 'STALE_ORG_CONTEXT') {
          return false
        }
        console.warn('[portal/schedule-orders] remote save failed', error)
        if (options.retry !== false && !calendarTimelineOrdersQueuedSave) {
          ordersScheduleRemoteTimelineOrderRetry(snapshot, error)
        }
        if (options.showError !== false) {
          showPortalErrorNotice('Nie udało się zapisać zlecenia w Firebase Data Connect. Zlecenie nie zostało zapisane.', error)
        }
        return false
      }
    }

    const request = save()
    calendarTimelineOrdersRemoteSavePromise = request
    calendarTimelineOrdersRemoteSavePromiseKey = sessionKey
    calendarTimelineOrdersRemoteSaveSignature = snapshotSignature
    try {
      return await request
    } finally {
      if (calendarTimelineOrdersRemoteSavePromise === request) {
        calendarTimelineOrdersRemoteSavePromise = null
        calendarTimelineOrdersRemoteSavePromiseKey = ''
        calendarTimelineOrdersRemoteSaveSignature = ''
        const queuedSave = calendarTimelineOrdersQueuedSave
        calendarTimelineOrdersQueuedSave = null
        if (queuedSave && ordersRemoteRequestIsCurrent(sessionKey, generation)) {
          ordersQueueRemoteTimelineOrderSave(queuedSave.orders, queuedSave.options)
        }
      }
    }
  }
  
  function ordersSaveTimelineOrders(orders = appState.calendarTimelineDemoOrders, options = {}) {
    const sourceOrders = Array.isArray(orders) ? orders : []
    const normalized = ordersMergeTimelineOrderLists(sourceOrders)
    const normalizedIds = new Set(normalized.map((order) => String(order.id ?? '').trim()).filter(Boolean))
    const draftById = new Map()
    if (options.preserveDrafts !== false) {
      ;[...sourceOrders, ...(Array.isArray(appState.calendarTimelineDemoOrders) ? appState.calendarTimelineDemoOrders : [])].forEach((order) => {
        const id = String(order?.id ?? '').trim()
        if (!id || !order?.isDraft || normalizedIds.has(id) || draftById.has(id)) {
          return
        }
        draftById.set(id, order)
      })
    }
    appState.calendarTimelineDemoOrders = [...draftById.values(), ...normalized]
    calendarInvalidateTimelineRenderCaches({ workerState: false })
    ordersPersistLocalTimelineOrders(normalized)
    if (options.syncRemote !== false) {
      ordersQueueRemoteTimelineOrderSave(normalized)
    }
    return normalized
  }
  
  async function ordersSyncRemoteTimelineOrders({ render = false } = {}) {
    const orgId = ordersActiveOrganizationId()
    const sessionKey = ordersRemoteSessionKey()
    if (!orgId || !sessionKey) {
      return ordersListSourceOrders()
    }

    if (calendarTimelineOrdersRemotePromise && calendarTimelineOrdersRemotePromiseKey === sessionKey) {
      const syncedOrders = await calendarTimelineOrdersRemotePromise
      if (render) {
        ordersRenderScheduleOrderViews()
      }
      return syncedOrders
    }

    const generation = calendarTimelineOrdersRemoteGeneration
    appState.calendarTimelineOrdersRemoteLoading = true
    const request = (async () => {
      try {
        const remoteOrders = await fetchScheduleTasks(orgId)
        if (!ordersRemoteRequestIsCurrent(sessionKey, generation)) {
          return ordersListSourceOrders()
        }
        const canonicalOrders = ordersMergeWithPendingLocalOrders(remoteOrders)
        ordersSaveTimelineOrders(canonicalOrders, { syncRemote: false })
        appState.calendarTimelineOrdersRemoteLoaded = true
        return appState.calendarTimelineDemoOrders
      } catch (error) {
        if (!ordersRemoteRequestIsCurrent(sessionKey, generation) || error?.code === 'STALE_ORG_CONTEXT') {
          return ordersListSourceOrders()
        }
        appState.calendarTimelineOrdersRemoteLoaded = false
        console.warn('[portal/schedule-orders] remote load failed', error)
        showPortalErrorNotice('Nie udało się pobrać zleceń z Firebase', error)
        return ordersListSourceOrders()
      } finally {
        if (calendarTimelineOrdersRemotePromise === request) {
          appState.calendarTimelineOrdersRemoteLoading = false
          calendarTimelineOrdersRemotePromise = null
          calendarTimelineOrdersRemotePromiseKey = ''
        }
      }
    })()
    calendarTimelineOrdersRemotePromise = request
    calendarTimelineOrdersRemotePromiseKey = sessionKey
    const syncedOrders = await calendarTimelineOrdersRemotePromise
    if (render) {
      ordersRenderScheduleOrderViews()
    }
    return syncedOrders
  }
  
  async function ordersDeleteTimelineOrdersById(orderIds = [], options = {}) {
    const orgId = ordersActiveOrganizationId()
    const sessionKey = ordersRemoteSessionKey()
    const generation = calendarTimelineOrdersRemoteGeneration
    const ids = (Array.isArray(orderIds) ? orderIds : [orderIds])
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)
    const deletedIds = new Set(ids)
    ordersForgetPendingLocalOrders(ids)
    const nextOrders = Array.isArray(options.nextOrders)
      ? ordersMergeTimelineOrderLists(options.nextOrders)
      : ordersMergeTimelineOrderLists(ordersListSourceOrders().filter((order) => !deletedIds.has(String(order?.id ?? '').trim())))
  
    ordersClearRemoteTimelineOrderSaveTimer()
    ordersSaveTimelineOrders(nextOrders, { syncRemote: false, preserveDrafts: false })
    if (options.render !== false) {
      ordersRenderScheduleOrderViews()
    }
  
    if (!orgId) {
      if (options.notice) {
        showTransientNotice(options.notice, 'success')
      }
      return true
    }
  
    try {
      const result = ids.length ? await deleteScheduleTasks(orgId, ids) : []
      if (!ordersRemoteRequestIsCurrent(sessionKey, generation)) {
        return false
      }
      const confirmedDeletedIds = new Set((Array.isArray(result) ? result : []).map((value) => String(value ?? '').trim()).filter(Boolean))
      const missingIds = ids.filter((value) => !confirmedDeletedIds.has(value))
      if (missingIds.length) {
        throw new Error('Backend nie potwierdził usunięcia zlecenia z bazy.')
      }
      const savedOrders = await fetchScheduleTasks(orgId)
      appState.calendarTimelineOrdersRemoteLoaded = true
      ordersClearRemoteTimelineOrderRetryTimer()
      if (Array.isArray(savedOrders)) {
        ordersForgetPendingLocalOrders(ids)
        const freshOrders = ordersMergeTimelineOrderLists(savedOrders).filter((order) => !deletedIds.has(String(order?.id ?? '').trim()))
        ordersSaveTimelineOrders(ordersMergeWithPendingLocalOrders(freshOrders), { syncRemote: false, preserveDrafts: false })
      }
      if (options.render !== false) {
        ordersRenderScheduleOrderViews()
      }
      if (options.notice) {
        showTransientNotice(options.notice, 'success')
      }
      return true
    } catch (error) {
      if (!ordersRemoteRequestIsCurrent(sessionKey, generation) || error?.code === 'STALE_ORG_CONTEXT') {
        return false
      }
      console.warn('[portal/schedule-orders] remote delete failed', error)
      showPortalErrorNotice('Nie udało się usunąć zlecenia z Firebase', error)
      return false
    }
  }

  async function ordersSetTimelineOrderLifecycleStatus(orderIds = [], lifecycleStatus = 'CANCELLED', options = {}) {
    const orgId = ordersActiveOrganizationId()
    const sessionKey = ordersRemoteSessionKey()
    const generation = calendarTimelineOrdersRemoteGeneration
    const ids = [...new Set(
      (Array.isArray(orderIds) ? orderIds : [orderIds])
        .map((value) => String(value ?? '').trim())
        .filter(Boolean),
    )]
    if (!orgId || !ids.length) {
      showTransientNotice('Brak organizacji lub zlecenia do zmiany statusu.', 'error')
      return false
    }

    ordersClearRemoteTimelineOrderSaveTimer()
    try {
      const result = await setScheduleTaskLifecycleStatus(orgId, ids, lifecycleStatus)
      if (!ordersRemoteRequestIsCurrent(sessionKey, generation)) {
        return false
      }
      const confirmedIds = new Set(
        (Array.isArray(result?.updatedOrderIds) ? result.updatedOrderIds : [])
          .map((value) => String(value ?? '').trim())
          .filter(Boolean),
      )
      const missingIds = ids.filter((id) => !confirmedIds.has(id))
      if (missingIds.length || !Array.isArray(result?.orders)) {
        throw new Error('Backend nie potwierdził zmiany statusu zlecenia.')
      }

      ordersForgetPendingLocalOrders(ids)
      ordersSaveTimelineOrders(
        ordersMergeWithPendingLocalOrders(result.orders),
        { syncRemote: false, preserveDrafts: false },
      )
      appState.calendarTimelineOrdersRemoteLoaded = true
      ordersClearRemoteTimelineOrderRetryTimer()
      if (options.render !== false) {
        ordersRenderScheduleOrderViews()
      }
      showTransientNotice(
        options.notice || (lifecycleStatus === 'ARCHIVED' ? 'Zlecenie zarchiwizowane.' : 'Zlecenie anulowane.'),
        'success',
      )
      return true
    } catch (error) {
      if (!ordersRemoteRequestIsCurrent(sessionKey, generation) || error?.code === 'STALE_ORG_CONTEXT') {
        return false
      }
      console.warn('[portal/schedule-orders] lifecycle update failed', error)
      showPortalErrorNotice('Nie udało się zmienić statusu zlecenia.', error)
      return false
    }
  }
  
  async function ordersDeleteTimelineOrderFromList(orderId = '') {
    const id = String(orderId ?? '').trim()
    const order = ordersFindTimelineOrder(id)
    if (!order) {
      showTransientNotice('Nie znaleziono zlecenia do usunięcia.', 'error')
      return false
    }
  
    if (!ordersTimelineOrderCanBeDeleted(order)) {
      showTransientNotice(
        'Nie można usunąć tego zlecenia. Usuwać można tylko zlecenia zaplanowane, które jeszcze się nie rozpoczęły.',
        'error',
      )
      return false
    }
  
    if (!ordersConfirmTimelineOrderDelete(order)) {
      return false
    }
  
    return ordersDeleteTimelineOrdersById([id], { notice: 'Zlecenie usunięte z bazy i grafiku.' })
  }
  
  function ordersEnsureTimelineOrdersForRoute(routeName, renderAfterLoad, options = {}) {
    const activeOrgId = ordersActiveOrganizationId()
    if (!activeOrgId) {
      return Promise.resolve(ordersListSourceOrders())
    }
  
    const renderIfStillCurrent = () => {
      if (appState.currentRoute === routeName && typeof renderAfterLoad === 'function') {
        renderAfterLoad()
      }
    }
  
    const force = options.force === true
    const remotePromise = !force && appState.calendarTimelineOrdersRemoteLoaded
      ? Promise.resolve(appState.calendarTimelineDemoOrders)
      : ordersSyncRemoteTimelineOrders({ render: options.renderRemote !== false })
  
    return Promise.resolve(remotePromise)
      .catch((error) => {
        console.warn('[portal/schedule-orders] route refresh failed', error)
        showPortalErrorNotice('Nie udało się odświeżyć zleceń z Firebase', error)
      })
      .finally(renderIfStillCurrent)
  }
  
  function deferRouteOrderDataRefresh(routeName, renderAfterLoad, options = {}) {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      return ordersEnsureTimelineOrdersForRoute(routeName, renderAfterLoad, options)
    }
  
    return new Promise((resolve) => {
      window.requestAnimationFrame(() => {
        resolve(ordersEnsureTimelineOrdersForRoute(routeName, renderAfterLoad, options))
      })
    })
  }
  
  function ordersListSourceOrders() {
    if (!Array.isArray(appState.calendarTimelineDemoOrders)) {
      appState.calendarTimelineDemoOrders = calendarTimelineDefaultDemoOrders()
    }
    appState.calendarTimelineDemoOrders = appState.calendarTimelineDemoOrders.filter((order) => !ordersIsSeedDemoOrder(order))
    return appState.calendarTimelineDemoOrders
  }
  
  function calendarTimelineDayDiff(startYmd, endYmd) {
    const start = calendarDateFromYmd(startYmd)
    const end = calendarDateFromYmd(endYmd)
    return Math.round((end.getTime() - start.getTime()) / 86400000)
  }
  
  function calendarTimelineDayOrdinal(ymd) {
    const value = String(ymd ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return null
    }
    return Math.floor(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10))) / 86400000)
  }
  
  function calendarTimelineOrderDurationMinutes(order = {}) {
    const startDay = String(order.dateYmd ?? todayYmd()).trim()
    const endDay = String(order.endDateYmd || order.dateYmd || startDay).trim()
    const startMinutes = calendarTimelineTimeMinutes(order.startTime, 4 * 60)
    const endMinutes = calendarTimelineTimeMinutes(order.endTime, startMinutes + 60)
    let daySpan = Math.max(0, calendarTimelineDayDiff(startDay, endDay))
    if (daySpan === 0 && endMinutes <= startMinutes) {
      daySpan = 1
    }
    const duration = daySpan * 1440 + endMinutes - startMinutes
    return Number.isFinite(duration) && duration > 0 ? duration : 60
  }
  
  function calendarTimelineOrderInterval(order = {}) {
    const startDay = String(order.dateYmd ?? '').trim()
    const endDay = String(order.endDateYmd || order.dateYmd || '').trim()
    const startOrdinal = calendarTimelineDayOrdinal(startDay)
    const endOrdinal = calendarTimelineDayOrdinal(endDay)
    if (!Number.isFinite(startOrdinal) || !Number.isFinite(endOrdinal)) {
      return null
    }
    const startMinutes = calendarTimelineTimeMinutes(order.startTime, 4 * 60)
    const endMinutes = calendarTimelineTimeMinutes(order.endTime, startMinutes + 60)
    let start = startOrdinal * 1440 + startMinutes
    let end = endOrdinal * 1440 + endMinutes
    if (end <= start) {
      end += 1440
    }
    return { start, end }
  }
  
  function calendarTimelineOrderTitle(order = {}) {
    return (
      String(order?.title ?? order?.name ?? order?.clientLabel ?? order?.client ?? order?.addressLabel ?? '').trim() ||
      'Zlecenie'
    )
  }

  function calendarTimelineOrderLocationKey(order = {}) {
    const clientId = String(order?.clientId ?? order?.client_id ?? '').trim().toLocaleLowerCase('pl')
    if (clientId) {
      return `client:${clientId}`
    }
    const address = String(
      order?.executionAddressLabel ??
      order?.execution_address_label ??
      order?.addressLabel ??
      order?.address_label ??
      '',
    ).trim().toLocaleLowerCase('pl')
    if (address) {
      return `address:${address}`
    }
    const lat = Number(order?.lat ?? order?.latitude)
    const lng = Number(order?.lng ?? order?.longitude)
    return Number.isFinite(lat) && Number.isFinite(lng) ? `gps:${lat.toFixed(5)},${lng.toFixed(5)}` : ''
  }
  
  function calendarTimelineTimeLabel(value, fallback = '--:--') {
    const raw = String(value ?? '').trim()
    const match = raw.match(/^(\d{1,2}):(\d{2})/)
    if (!match) {
      return fallback
    }
    return `${pad2(Number(match[1]))}:${match[2]}`
  }
  
  function calendarTimelineDateLabel(ymd) {
    const raw = String(ymd ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return raw || '-'
    }
    return `${raw.slice(8, 10)}.${raw.slice(5, 7)}.${raw.slice(0, 4)}`
  }
  
  function calendarTimelineOrderRangeLabel(order = {}) {
    const startDay = String(order?.dateYmd ?? '').trim()
    const endDay = String(order?.endDateYmd || order?.dateYmd || '').trim()
    const startTime = calendarTimelineTimeLabel(order?.startTime)
    const endTime = calendarTimelineTimeLabel(order?.endTime)
    const startLabel = `${calendarTimelineDateLabel(startDay)} ${startTime}`
    const endLabel = endDay && endDay !== startDay ? `${calendarTimelineDateLabel(endDay)} ${endTime}` : endTime
    return `${startLabel} - ${endLabel}`
  }

  function calendarTimelineOrderTimeRangeLabel(order = {}) {
    const startDay = String(order?.dateYmd ?? '').trim()
    const endDay = String(order?.endDateYmd || order?.dateYmd || '').trim()
    const startTime = calendarTimelineTimeLabel(order?.startTime)
    const endTime = calendarTimelineTimeLabel(order?.endTime)
    const status = String(order?.status ?? '').trim().toUpperCase()
    const isRunning = Boolean(order?.isRealEvent && !order?.completed && !order?.actualEndAt && status !== 'CLOSED')
    if (isRunning) {
      return `${startTime}-`
    }
    if (endDay && endDay !== startDay) {
      return `${calendarTimelineDateLabel(startDay)} ${startTime} - ${calendarTimelineDateLabel(endDay)} ${endTime}`
    }
    return `${startTime}-${endTime}`
  }

  function calendarTimelineOrderClientBarLabel(order = {}) {
    const orderClient = ordersTimelineClientLabel(order)
    if (orderClient && orderClient !== '-') {
      return orderClient
    }
    const eventClient = dashboardResolveClientLabel(order)
    if (eventClient && eventClient !== '-') {
      return eventClient
    }
    return calendarTimelineOrderTitle(order)
  }
  
  function calendarTimelineDaysForOrder(order = {}) {
    const startDay = String(order?.dateYmd ?? '').trim()
    const endDay = String(order?.endDateYmd || order?.dateYmd || startDay).trim()
    const ranges = [{ startDay, endDay }]
    calendarTimelineOrderWorkAllocations(order).forEach((allocation) => {
      const allocationStartDay = String(allocation?.dateYmd ?? allocation?.planDateYmd ?? allocation?.startDateYmd ?? '').trim()
      const allocationEndDay = String(allocation?.endDateYmd ?? allocation?.planEndDateYmd ?? allocationStartDay).trim()
      if (allocationStartDay) {
        ranges.push({ startDay: allocationStartDay, endDay: allocationEndDay || allocationStartDay })
      }
    })
    const days = []
    ranges.forEach((range) => {
      const startOrdinal = calendarTimelineDayOrdinal(range.startDay)
      const endOrdinal = calendarTimelineDayOrdinal(range.endDay)
      if (!Number.isFinite(startOrdinal) || !Number.isFinite(endOrdinal)) {
        return
      }
      const firstDay = endOrdinal < startOrdinal ? range.endDay : range.startDay
      const dayCount = Math.min(14, Math.max(1, Math.abs(endOrdinal - startOrdinal) + 1))
      Array.from({ length: dayCount }, (_, index) => calendarAddDays(firstDay, index)).forEach((day) => {
        if (!days.includes(day)) {
          days.push(day)
        }
      })
    })
    return days
  }
  
  function calendarTimelineOrderIsRecurring(order = {}) {
    return ordersScheduleModeForOrder(order) === 'repeat'
  }

  function calendarTimelineOrderCanBeMovedFreely(order = {}) {
    return Boolean(String(order?.id ?? '').trim()) &&
      !calendarTimelineOrderIsRecurring(order) &&
      !calendarTimelineIsMaterializedOverrideOrder(order)
  }
  
  function calendarTimelineRecurringInterval(order = {}) {
    return Math.max(1, Math.floor(Number(order?.repeatEvery) || 1))
  }
  
  function calendarTimelineRecurringUnit(order = {}) {
    const unit = String(order?.repeatUnit ?? '').trim()
    if (['day', 'week', 'month', 'year'].includes(unit)) {
      return unit
    }
    const preset = String(order?.repeatPreset ?? '').trim()
    if (['day', 'week', 'month', 'year'].includes(preset)) {
      return preset
    }
    return 'day'
  }
  
  function calendarTimelineDateWeekday(dayKey = '') {
    const day = String(dayKey ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return -1
    }
    const date = calendarDateFromYmd(day)
    const weekday = date.getDay()
    return Number.isInteger(weekday) ? weekday : -1
  }
  
  function calendarTimelineServiceBlockRepeatWeekdays(order = {}) {
    return (Array.isArray(order?.serviceBlocks) ? order.serviceBlocks : [])
      .flatMap((block) => (Array.isArray(block?.weekdays) ? block.weekdays : []))
      .map((value) => Number(value))
      .filter((value, index, list) => Number.isInteger(value) && value >= 0 && value <= 6 && list.indexOf(value) === index)
  }

  function calendarTimelineRepeatWeekdays(order = {}) {
    const serviceBlockWeekdays = calendarTimelineServiceBlockRepeatWeekdays(order)
    if (serviceBlockWeekdays.length) {
      return serviceBlockWeekdays
    }
    const values = Array.isArray(order?.repeatWeekdays) ? order.repeatWeekdays : []
    const weekdays = values
      .map((value) => Number(value))
      .filter((value, index, list) => Number.isInteger(value) && value >= 0 && value <= 6 && list.indexOf(value) === index)
    return weekdays.length ? weekdays : [calendarTimelineDateWeekday(order?.dateYmd)].filter((value) => value >= 0)
  }
  
  function calendarTimelineRecurringSeriesEnd(order = {}) {
    const candidates = [
      order?.repeatUntil,
      order?.repeatEndDate,
      order?.recurrenceEndDate,
      order?.seriesEndDate,
      order?.repeatUntilYmd,
    ]
    return candidates.map((value) => String(value ?? '').trim()).find((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)) || ''
  }
  
  function calendarTimelineAddMonthsClamped(dayKey = '', offset = 0) {
    const day = String(dayKey ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return ''
    }
    const year = Number(day.slice(0, 4))
    const month = Number(day.slice(5, 7)) - 1
    const date = Number(day.slice(8, 10))
    const targetMonthIndex = month + Math.floor(Number(offset) || 0)
    const lastDay = new Date(year, targetMonthIndex + 1, 0).getDate()
    return calendarDateToYmd(new Date(year, targetMonthIndex, Math.min(date, lastDay)))
  }
  
  function calendarTimelineRecurringOccurrenceEnd(order = {}, occurrenceDay = '') {
    const duration = calendarTimelineOrderDurationMinutes(order)
    const startMinutes = calendarTimelineTimeMinutes(order?.startTime, 4 * 60)
    const totalEndMinutes = startMinutes + duration
    const dayOffset = Math.floor(totalEndMinutes / 1440)
    const endMinutes = totalEndMinutes % 1440
    return {
      endDateYmd: calendarAddDays(occurrenceDay, dayOffset),
      endTime: calendarMinutesToTime(endMinutes) || calendarTimelineTimeLabel(order?.endTime, '23:59'),
    }
  }

  function calendarTimelineOccurrenceAllocationDateShift(allocation = {}, occurrenceDay = '', fallbackDay = '') {
    const targetDay = ordersNormalizeDateField(occurrenceDay, '')
    if (!targetDay) {
      return allocation
    }
    const sourceDay = ordersNormalizeDateField(
      allocation?.dateYmd ?? allocation?.planDateYmd ?? allocation?.startDateYmd,
      fallbackDay || targetDay,
    )
    const sourceEndDay = ordersNormalizeDateField(
      allocation?.endDateYmd ?? allocation?.planEndDateYmd,
      sourceDay,
    )
    const daySpan = Math.max(0, calendarTimelineDayDiff(sourceDay, sourceEndDay))
    const targetEndDay = calendarAddDays(targetDay, daySpan)
    return {
      ...allocation,
      dateYmd: targetDay,
      planDateYmd: targetDay,
      startDateYmd: targetDay,
      endDateYmd: targetEndDay,
      planEndDateYmd: targetEndDay,
    }
  }

  function calendarTimelineRecurringOccurrenceAllocations(order = {}, occurrenceDay = '') {
    const allocations = calendarTimelineOrderWorkAllocations(order)
    if (!allocations.length) {
      return []
    }
    const fallbackDay = ordersNormalizeDateField(order?.dateYmd, occurrenceDay || todayYmd())
    return allocations.map((allocation) => calendarTimelineOccurrenceAllocationDateShift(allocation, occurrenceDay, fallbackDay))
  }

  function calendarTimelineOccurrenceServiceBlocks(order = {}, occurrenceDay = '') {
    const serviceBlocks = Array.isArray(order?.serviceBlocks) ? order.serviceBlocks : []
    const targetDay = ordersNormalizeDateField(occurrenceDay, '')
    if (!serviceBlocks.length || !targetDay) {
      return serviceBlocks
    }
    const targetWeekday = calendarTimelineDateWeekday(targetDay)
    const fallbackDay = ordersNormalizeDateField(order?.dateYmd, targetDay)

    return serviceBlocks
      .filter((block) => {
        const mode = String(block?.scheduleMode ?? block?.mode ?? '').trim()
        if (mode === 'once') {
          const blockDay = ordersNormalizeDateField(block?.dateYmd ?? block?.planDateYmd ?? block?.startDateYmd, fallbackDay)
          return !blockDay || blockDay === targetDay
        }
        const weekdays = (Array.isArray(block?.weekdays) ? block.weekdays : [])
          .map((value) => Number(value))
          .filter((value, index, list) => Number.isInteger(value) && value >= 0 && value <= 6 && list.indexOf(value) === index)
        return !weekdays.length || targetWeekday < 0 || weekdays.includes(targetWeekday)
      })
      .map((block) => {
        const blockSourceDay = ordersNormalizeDateField(
          block?.dateYmd ?? block?.planDateYmd ?? block?.startDateYmd,
          fallbackDay,
        )
        const blockSourceEndDay = ordersNormalizeDateField(
          block?.endDateYmd ?? block?.planEndDateYmd,
          blockSourceDay,
        )
        const blockDaySpan = Math.max(0, calendarTimelineDayDiff(blockSourceDay, blockSourceEndDay))
        const blockEndDay = calendarAddDays(targetDay, blockDaySpan)
        const shiftItems = (items) =>
          Array.isArray(items)
            ? items.map((item) => calendarTimelineOccurrenceAllocationDateShift(item, targetDay, blockSourceDay))
            : items

        return {
          ...block,
          dateYmd: targetDay,
          planDateYmd: targetDay,
          startDateYmd: targetDay,
          endDateYmd: blockEndDay,
          planEndDateYmd: blockEndDay,
          slots: shiftItems(block?.slots),
          workAllocations: shiftItems(block?.workAllocations),
          workerAllocations: shiftItems(block?.workerAllocations),
        }
      })
  }
  
  function calendarTimelineRecurringInstance(order = {}, occurrenceDay = '', index = 0) {
    const baseDay = String(order?.dateYmd ?? '').trim()
    const scheduledOrder = ordersApplyWeeklyPatternRuleToOccurrence(order, occurrenceDay)
    const occurrenceServiceBlocks = calendarTimelineOccurrenceServiceBlocks(scheduledOrder, occurrenceDay)
    const serviceBlockFields = occurrenceServiceBlocks.length
      ? {
          serviceBlocks: occurrenceServiceBlocks,
        }
      : {}
    const occurrenceAllocations = calendarTimelineRecurringOccurrenceAllocations({ ...scheduledOrder, ...serviceBlockFields }, occurrenceDay)
    const allocationFields = occurrenceAllocations.length
      ? {
          workAllocations: occurrenceAllocations,
          workerAllocations: occurrenceAllocations,
        }
      : {}
    if (occurrenceDay === baseDay) {
      return {
        ...scheduledOrder,
        ...serviceBlockFields,
        ...allocationFields,
        isRecurringSeries: true,
        sourceOrderId: String(order?.sourceOrderId ?? order?.id ?? '').trim(),
        recurrenceOriginalDateYmd: baseDay,
      }
    }
    const occurrenceEnd = calendarTimelineRecurringOccurrenceEnd(scheduledOrder, occurrenceDay)
    const sourceOrderId = String(order?.sourceOrderId ?? order?.id ?? '').trim()
    return {
      ...scheduledOrder,
      ...serviceBlockFields,
      ...allocationFields,
      id: `${sourceOrderId || 'order'}__repeat__${occurrenceDay}`,
      sourceOrderId,
      orderId: sourceOrderId,
      recurrenceSourceDateYmd: baseDay,
      recurrenceOriginalDateYmd: occurrenceDay,
      recurrenceIndex: index,
      isRecurringSeries: true,
      isRecurringInstance: true,
      dateYmd: occurrenceDay,
      endDateYmd: occurrenceEnd.endDateYmd,
      endTime: occurrenceEnd.endTime,
      validUntil: occurrenceEnd.endDateYmd,
      nextDate: occurrenceDay,
      actualStartAt: '',
      actualStartedAt: '',
      actualStartIso: '',
      actualEndAt: '',
      actualFinishedAt: '',
      actualStopAt: '',
      actualEndIso: '',
      actualStopIso: '',
      qrStartAt: '',
      qrStartIso: '',
      qrStopAt: '',
      qrStopIso: '',
      sourceEventId: '',
      eventId: '',
      workdayId: '',
      completed: false,
      status: '',
    }
  }
  
  function calendarTimelineRecurringSkippedDates(order = {}) {
    const values = [
      ...(Array.isArray(order?.recurrenceSkippedDates) ? order.recurrenceSkippedDates : []),
      ...(Array.isArray(order?.recurrenceExceptionDates) ? order.recurrenceExceptionDates : []),
      ...(Array.isArray(order?.skipDates) ? order.skipDates : []),
    ]
    return new Set(
      values
        .map((value) => String(value ?? '').trim())
        .filter((value, index, list) => /^\d{4}-\d{2}-\d{2}$/.test(value) && list.indexOf(value) === index),
    )
  }
  
  function calendarTimelineRecurringOverrideDate(order = {}) {
    return calendarTimelineRecurringOverrideInfo(order)?.dateYmd || String(order?.recurrenceOriginalDateYmd ?? order?.recurrenceOverrideDateYmd ?? order?.occurrenceDateYmd ?? order?.dateYmd ?? '').trim()
  }
  
  function calendarTimelineRecurringOverrideId(sourceOrderId = '', occurrenceDay = '') {
    const sourceId = String(sourceOrderId ?? '').trim()
    const day = String(occurrenceDay ?? '').trim()
    return sourceId && /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${sourceId}__override__${day}` : ''
  }

  function calendarTimelineParseRecurringOverrideId(id = '') {
    const match = /^(.+)__override__(\d{4}-\d{2}-\d{2})$/.exec(String(id ?? '').trim())
    return match ? { sourceOrderId: match[1], dateYmd: match[2] } : null
  }

  function calendarTimelineRecurringOverrideInfo(order = {}) {
    const parsed = calendarTimelineParseRecurringOverrideId(order?.id)
    const explicitSource = String(
      order?.sourceOrderId ??
        order?.recurrenceSourceOrderId ??
        order?.parentOrderId ??
        '',
    ).trim()
    const sourceOrderId = explicitSource || parsed?.sourceOrderId || ''
    const dateYmd = String(
      order?.recurrenceOriginalDateYmd ??
        order?.recurrenceOverrideDateYmd ??
        order?.occurrenceDateYmd ??
        parsed?.dateYmd ??
        order?.dateYmd ??
        '',
    ).trim()
    const hasOverrideFlag =
      Boolean(order?.recurrenceOverride) ||
      String(order?.recurrenceOverrideKind ?? '').trim() === 'single-day' ||
      Boolean(parsed)

    if (!hasOverrideFlag || !sourceOrderId || !/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
      return null
    }
    return { sourceOrderId, dateYmd }
  }

  function calendarTimelineIsMaterializedOverrideOrder(order = {}) {
    return Boolean(order && typeof order === 'object' && calendarTimelineRecurringOverrideInfo(order))
  }

  function calendarTimelineRecurringOverrideSourceId(order = {}) {
    return calendarTimelineRecurringOverrideInfo(order)?.sourceOrderId || ''
  }
  
  function calendarTimelineSourceOrderById(sourceOrderId = '') {
    const sourceId = String(sourceOrderId ?? '').trim()
    if (!sourceId) {
      return null
    }
    return ordersListSourceOrders().find((order) => String(order?.id ?? '').trim() === sourceId) ?? null
  }
  
  function calendarTimelineOrderWithSkippedOccurrence(order = {}, occurrenceDay = '') {
    const day = String(occurrenceDay ?? '').trim()
    if (!order || typeof order !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return order
    }
    const skippedDates = calendarTimelineRecurringSkippedDates(order)
    skippedDates.add(day)
    return {
      ...order,
      recurrenceSkippedDates: [...skippedDates].sort(),
      updatedAt: new Date().toISOString(),
    }
  }
  
  function calendarTimelineCleanRecurringGeneratedFields(order = {}) {
    const next = { ...order }
    delete next.isRecurringSeries
    delete next.isRecurringInstance
    delete next.recurrenceIndex
    delete next.recurrenceSourceDateYmd
    return next
  }
  
  function calendarTimelineSingleOccurrenceType(sourceOrder = {}) {
    const sourceType = String(sourceOrder?.type ?? '').trim()
    if (!sourceType || sourceType === 'cyclic') {
      return 'individual'
    }
    return ['individual', 'renovation', 'windows', 'other'].includes(sourceType) ? sourceType : 'other'
  }
  
  function calendarTimelineBuildSingleOccurrenceOverride(sourceOrder = {}, occurrenceDay = '', patch = {}) {
    const sourceOrderId = String(sourceOrder?.id ?? sourceOrder?.sourceOrderId ?? '').trim()
    const day = String(occurrenceDay ?? '').trim()
    const overrideId = calendarTimelineRecurringOverrideId(sourceOrderId, day)
    if (!sourceOrderId || !overrideId) {
      return null
    }
  
    const occurrence = calendarTimelineRecurringInstance(sourceOrder, day, 0)
    const patchOrder = calendarTimelineCleanRecurringGeneratedFields(patch)
    const nowIso = new Date().toISOString()
    const type = calendarTimelineSingleOccurrenceType(sourceOrder)
    return {
      ...calendarTimelineCleanRecurringGeneratedFields(occurrence),
      ...patchOrder,
      id: overrideId,
      sourceOrderId,
      recurrenceSourceOrderId: sourceOrderId,
      parentOrderId: sourceOrderId,
      orderId: overrideId,
      recurrenceOverride: true,
      recurrenceOverrideKind: 'single-day',
      recurrenceOriginalDateYmd: day,
      recurrenceOverrideDateYmd: day,
      scheduleMode: 'once',
      repeatPreset: 'none',
      repeatEvery: 1,
      repeatUnit: 'day',
      repeatWeekdays: [],
      weeklyScheduleRules: [],
      weeklyPattern: [],
      repeatDayRules: [],
      dayScheduleRules: [],
      type,
      tone: ordersTimelineToneForType(type),
      createdAt: String(patch?.createdAt ?? occurrence?.createdAt ?? sourceOrder?.createdAt ?? '').trim() || nowIso,
      updatedAt: nowIso,
      isDraft: Boolean(patch?.isDraft),
    }
  }
  
  function calendarTimelineOrdersWithSingleOccurrenceOverride(orders = [], overrideOrder = {}) {
    const sourceOrderId = calendarTimelineRecurringOverrideSourceId(overrideOrder)
    const occurrenceDay = calendarTimelineRecurringOverrideDate(overrideOrder)
    if (!sourceOrderId || !/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDay)) {
      return Array.isArray(orders) ? orders : []
    }
  
    let hasOverride = false
    let hasSource = false
    const nextOrders = (Array.isArray(orders) ? orders : []).map((order) => {
      const orderId = String(order?.id ?? '').trim()
      if (orderId === sourceOrderId) {
        hasSource = true
        return calendarTimelineOrderWithSkippedOccurrence(order, occurrenceDay)
      }
      if (orderId === overrideOrder.id) {
        hasOverride = true
        return overrideOrder
      }
      return order
    })
  
    if (!hasSource) {
      const source = calendarTimelineSourceOrderById(sourceOrderId)
      if (source) {
        nextOrders.push(calendarTimelineOrderWithSkippedOccurrence(source, occurrenceDay))
      }
    }
    if (!hasOverride) {
      nextOrders.push(overrideOrder)
    }
    return nextOrders
  }

  function calendarTimelineRecurringOverrideDatesBySource(orders = []) {
    const bySource = new Map()
    ;(Array.isArray(orders) ? orders : []).forEach((order) => {
      const info = calendarTimelineRecurringOverrideInfo(order)
      if (!info) {
        return
      }
      if (!bySource.has(info.sourceOrderId)) {
        bySource.set(info.sourceOrderId, new Set())
      }
      bySource.get(info.sourceOrderId).add(info.dateYmd)
    })
    return bySource
  }
  
  function calendarTimelineRecurringDaysForRange(order = {}, days = []) {
    if (!calendarTimelineOrderIsRecurring(order)) {
      return []
    }
    const visibleDays = Array.isArray(days) ? days.filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(String(day ?? ''))) : []
    if (!visibleDays.length) {
      return []
    }
    const baseDay = String(order?.dateYmd ?? '').trim()
    const baseOrdinal = calendarTimelineDayOrdinal(baseDay)
    if (!Number.isFinite(baseOrdinal)) {
      return []
    }
    const firstVisible = visibleDays[0]
    const lastVisible = visibleDays[visibleDays.length - 1]
    const durationDays = Math.max(0, Math.floor(calendarTimelineOrderDurationMinutes(order) / 1440))
    const rangeStart = calendarAddDays(firstVisible, -durationDays)
    const rangeEnd = lastVisible
    const rangeStartOrdinal = calendarTimelineDayOrdinal(rangeStart)
    const rangeEndOrdinal = calendarTimelineDayOrdinal(rangeEnd)
    if (!Number.isFinite(rangeStartOrdinal) || !Number.isFinite(rangeEndOrdinal)) {
      return []
    }
    const seriesEnd = calendarTimelineRecurringSeriesEnd(order)
    const seriesEndOrdinal = seriesEnd ? calendarTimelineDayOrdinal(seriesEnd) : Number.POSITIVE_INFINITY
    const every = calendarTimelineRecurringInterval(order)
    const unit = calendarTimelineRecurringUnit(order)
    const occurrenceDays = []
  
    if (unit === 'month' || unit === 'year') {
      const stepMonths = every * (unit === 'year' ? 12 : 1)
      for (let index = 0; index < 240; index += 1) {
        const day = calendarTimelineAddMonthsClamped(baseDay, index * stepMonths)
        const ordinal = calendarTimelineDayOrdinal(day)
        if (!Number.isFinite(ordinal)) {
          break
        }
        if (ordinal > Math.min(rangeEndOrdinal, seriesEndOrdinal)) {
          break
        }
        if (ordinal >= rangeStartOrdinal) {
          occurrenceDays.push(day)
        }
      }
      return occurrenceDays
    }
  
    const weekStart = calendarStartOfWeek(baseDay)
    const weekdays = unit === 'week' ? calendarTimelineRepeatWeekdays(order) : []
    for (let ordinal = Math.max(baseOrdinal, rangeStartOrdinal); ordinal <= rangeEndOrdinal && ordinal <= seriesEndOrdinal; ordinal += 1) {
      const day = calendarAddDays(baseDay, ordinal - baseOrdinal)
      const diff = ordinal - baseOrdinal
      if (unit === 'week') {
        const weekDiff = Math.floor(calendarTimelineDayDiff(weekStart, calendarStartOfWeek(day)) / 7)
        if (weekDiff >= 0 && weekDiff % every === 0 && weekdays.includes(calendarTimelineDateWeekday(day))) {
          occurrenceDays.push(day)
        }
      } else if (diff >= 0 && diff % every === 0) {
        occurrenceDays.push(day)
      }
    }
  
    return occurrenceDays
  }
  
  function calendarTimelineExpandRecurringOrdersForDays(orders = [], days = []) {
    const overrideDatesBySource = calendarTimelineRecurringOverrideDatesBySource(orders)
    return (Array.isArray(orders) ? orders : []).flatMap((order) => {
      if (!calendarTimelineOrderIsRecurring(order)) {
        return [order]
      }
      const occurrenceDays = calendarTimelineRecurringDaysForRange(order, days)
      if (!occurrenceDays.length) {
        return []
      }
      const skippedDates = calendarTimelineRecurringSkippedDates(order)
      const sourceOrderId = String(order?.sourceOrderId ?? order?.id ?? '').trim()
      const overrideDates = overrideDatesBySource.get(sourceOrderId) || new Set()
      return occurrenceDays
        .filter((day) => !skippedDates.has(day) && !overrideDates.has(day))
        .map((day, index) => calendarTimelineRecurringInstance(order, day, index))
    })
  }
  
  function calendarTimelineSameConflictOrder(left = {}, right = {}) {
    const leftId = String(left?.id ?? '').trim()
    const rightId = String(right?.id ?? '').trim()
    if (leftId && rightId && leftId === rightId) {
      return true
    }
    const leftKeys = calendarTimelineOrderSourceKeys(left)
    const rightKeys = calendarTimelineOrderSourceKeys(right)
    return Boolean(leftKeys.length && rightKeys.some((key) => leftKeys.includes(key)))
  }
  
  function calendarTimelineTimestampFromDayMinutes(dayKey, minutes) {
    const day = String(dayKey ?? '').trim()
    const value = Number(minutes)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(value)) {
      return 0
    }
    const date = calendarDateFromYmd(day)
    date.setMinutes(date.getMinutes() + Math.floor(value))
    const timestamp = date.getTime()
    return Number.isFinite(timestamp) ? timestamp : 0
  }
  
  function calendarTimelineHmFromTimestamp(timestamp, fallback = '--:--') {
    const value = Number(timestamp)
    if (!Number.isFinite(value) || value <= 0) {
      return fallback
    }
    const date = new Date(value)
    if (!Number.isFinite(date.getTime())) {
      return fallback
    }
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  }
  
  function calendarTimelineOrderPlannedBounds(order = {}) {
    const startDay = String(order?.dateYmd ?? '').trim()
    const endDay = String(order?.endDateYmd || order?.dateYmd || startDay).trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDay) || !/^\d{4}-\d{2}-\d{2}$/.test(endDay)) {
      return null
    }
  
    const startMinutes = calendarTimelineTimeMinutes(order?.startTime, 8 * 60)
    const endMinutes = calendarTimelineTimeMinutes(order?.endTime, startMinutes + 60)
    let startTs = calendarTimelineTimestampFromDayMinutes(startDay, startMinutes)
    let endTs = calendarTimelineTimestampFromDayMinutes(endDay, endMinutes)
    if (!startTs || !endTs) {
      return null
    }
    if (endTs <= startTs) {
      endTs += 24 * 60 * 60 * 1000
    }
  
    return {
      startDay,
      endDay,
      startMinutes,
      endMinutes,
      startTs,
      endTs,
      startLabel: calendarTimelineTimeLabel(order?.startTime),
      endLabel: calendarTimelineTimeLabel(order?.endTime),
    }
  }
  
  function calendarTimelineOrderActualIsoFromKeys(order = {}, keys = []) {
    for (const key of keys) {
      const iso = toIso(order?.[key])
      if (iso) {
        return iso
      }
    }
  
    return ''
  }
  
  function calendarTimelineOrderActualTimeFromKeys(order = {}, keys = [], dayKey = '') {
    const day = String(dayKey ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return ''
    }
  
    for (const key of keys) {
      const minutes = dashboardScheduleTimeToMinutes(order?.[key])
      if (Number.isFinite(minutes) && minutes >= 0) {
        return new Date(calendarTimelineTimestampFromDayMinutes(day, minutes)).toISOString()
      }
    }
  
    return ''
  }
  
  function calendarTimelineActualStateFromOrderFields(order = {}, planned = null) {
    const startIso =
      calendarTimelineOrderActualIsoFromKeys(order, [
        'actualStartAt',
        'actualStartedAt',
        'actualStartIso',
        'realStartAt',
        'serviceStartAt',
        'startedAt',
        'qrStartAt',
        'qrStartIso',
        'startRealAt',
      ]) ||
      calendarTimelineOrderActualTimeFromKeys(order, [
        'actualStartTime',
        'realStartTime',
        'serviceStartTime',
        'qrStart',
        'qrStartTime',
      ], planned?.startDay)
    const endIso =
      calendarTimelineOrderActualIsoFromKeys(order, [
        'actualEndAt',
        'actualFinishedAt',
        'actualStopAt',
        'actualEndIso',
        'realEndAt',
        'serviceEndAt',
        'finishedAt',
        'completedAt',
        'qrStopAt',
        'qrEndAt',
        'qrStopIso',
      ]) ||
      calendarTimelineOrderActualTimeFromKeys(order, [
        'actualEndTime',
        'actualStopTime',
        'realEndTime',
        'serviceEndTime',
        'finishTime',
        'finishedTime',
        'qrStop',
        'qrStopTime',
      ], planned?.endDay || planned?.startDay)
  
    const startTs = startIso ? new Date(startIso).getTime() : 0
    const endTs = endIso ? new Date(endIso).getTime() : 0
    return {
      startTs: Number.isFinite(startTs) ? startTs : 0,
      endTs: Number.isFinite(endTs) ? endTs : 0,
      isRunning: Boolean(startIso) && !endIso,
      source: startIso || endIso ? 'order' : '',
    }
  }
  
  function calendarTimelineTextTokens(...values) {
    return values
      .map((value) => normalizeSearchText(value))
      .filter(Boolean)
      .filter((value, index, list) => list.indexOf(value) === index)
  }
  
  function calendarTimelineUsefulTextTokens(...values) {
    const generic = new Set(['-', 'nowe', 'nowe zlecenie', 'nowy klient', 'zlecenie', 'klient', 'bufor'])
    return calendarTimelineTextTokens(...values).filter((value) => value.length >= 4 && !generic.has(value))
  }
  
  function calendarTimelineSourceRowTextTokens(row = {}) {
    return calendarTimelineUsefulTextTokens(
      row?.client,
      row?.clientName,
      row?.clientLabel,
      row?.customer,
      row?.customerName,
      row?.activeClient,
      row?.zone,
      row?.zoneCode,
      row?.zoneName,
      row?.activeZone,
      row?.address,
      row?.addressLabel,
      row?.location,
      row?.title,
      row?.taskName,
    )
  }
  
  function calendarTimelineOrderTextTokens(order = {}) {
    return calendarTimelineUsefulTextTokens(
      order?.client,
      order?.clientName,
      order?.clientLabel,
      ordersTimelineClientLabel(order),
      order?.address,
      order?.addressLabel,
      order?.location,
      ordersTimelineAddressLabel(order),
      order?.title,
      order?.taskName,
    )
  }
  
  function calendarTimelineOrderSourceKeys(order = {}) {
    return calendarTimelineTextTokens(
      order?.sourceEventId,
      order?.eventId,
      order?.workdayId,
      order?.orderId,
      order?.sourceOrderId,
      order?.recurrenceSourceOrderId,
      order?.externalId,
      order?.remoteId,
      order?.jobId,
      order?.taskId,
      order?.id,
    )
  }
  
  function calendarTimelineSourceRowKeys(row = {}) {
    return calendarTimelineTextTokens(
      row?.orderId,
      row?.calendarOrderId,
      row?.sourceOrderId,
      row?.recurrenceSourceOrderId,
      row?.jobId,
      row?.taskId,
      row?.eventId,
      row?.workdayId,
      row?.id,
    )
  }
  
  function calendarTimelineTokensMatch(leftTokens = [], rightTokens = []) {
    return leftTokens.some((left) =>
      rightTokens.some((right) => {
        if (!left || !right) {
          return false
        }
        return left === right || (left.length >= 4 && right.includes(left)) || (right.length >= 4 && left.includes(right))
      }),
    )
  }
  
  function calendarTimelineResourceMatchesSourceRow(resource = {}, row = {}) {
    if (resource?.type !== 'worker') {
      return false
    }
    const resourceWorkerId = dashboardCanonicalWorkerId(resource?.worker?.workerId ?? resource?.worker?.id)
    const rowWorkerId = dashboardResolveWorkerIdValue(row)
    return Boolean(resourceWorkerId && rowWorkerId && resourceWorkerId === rowWorkerId)
  }
  
  function calendarTimelineSourceRowMatchesOrder(row = {}, order = {}, planned = null) {
    if (!planned) {
      return false
    }
    const dayKey = dashboardResolveDayKey(row)
    if (dayKey && dayKey !== planned.startDay && dayKey !== planned.endDay) {
      return false
    }
  
    const startTs = calendarTimelineEventTimestamp(row?.startAt ?? row?.dayStartAt)
    const endTs = calendarTimelineEventTimestamp(row?.endAt ?? row?.dayEndAt)
    const orderKeys = calendarTimelineOrderSourceKeys(order)
    const rowKeys = calendarTimelineSourceRowKeys(row)
    const hasExplicitLink = orderKeys.length > 0 && rowKeys.some((key) => orderKeys.includes(key))
    if (hasExplicitLink) {
      return true
    }
  
    const hasTextMatch = calendarTimelineTokensMatch(calendarTimelineOrderTextTokens(order), calendarTimelineSourceRowTextTokens(row))
    if (!hasTextMatch) {
      return false
    }
  
    const hasReasonableTimeWindow =
      (startTs > 0 && startTs < planned.endTs + 12 * 60 * 60 * 1000 && startTs > planned.startTs - 2 * 60 * 60 * 1000) ||
      (endTs > 0 && endTs < planned.endTs + 12 * 60 * 60 * 1000 && endTs > planned.startTs - 2 * 60 * 60 * 1000)
    return hasReasonableTimeWindow
  }
  
  function calendarTimelineActualStateFromWorkerRows(order = {}, resource = {}, planned = null) {
    if (!planned || resource?.type !== 'worker') {
      return { startTs: 0, endTs: 0, isRunning: false, source: '' }
    }
    const sourceRows =
      appState.calendarTimelineWorkerStateDayKey === planned.startDay && Array.isArray(appState.calendarTimelineWorkerStateSourceRows)
        ? appState.calendarTimelineWorkerStateSourceRows
        : []
    const matches = sourceRows
      .filter((row) => calendarTimelineResourceMatchesSourceRow(resource, row))
      .filter((row) => calendarTimelineSourceRowMatchesOrder(row, order, planned))
      .map((row) => {
        const startTs = calendarTimelineEventTimestamp(row?.startAt ?? row?.dayStartAt)
        const endTs = calendarTimelineEventTimestamp(row?.endAt ?? row?.dayEndAt)
        const status = String(row?.status ?? '').trim().toUpperCase()
        const sourceKind = String(row?.historySourceKind ?? '').trim().toLowerCase()
        const proximity = startTs > 0 ? Math.abs(startTs - planned.startTs) : Number.POSITIVE_INFINITY
        return {
          row,
          startTs,
          endTs,
          isRunning: startTs > 0 && !endTs && (status === 'RUNNING' || status === 'OPEN' || Boolean(row?.isRunning)),
          hasEnd: endTs > 0,
          isWorkdaySource: sourceKind === 'workday' || row?.hasExplicitEventId === false,
          proximity,
        }
      })
      .filter((item) => item.startTs > 0 || item.endTs > 0)
      .sort((left, right) =>
        Number(right.hasEnd) - Number(left.hasEnd) ||
        Number(right.isWorkdaySource) - Number(left.isWorkdaySource) ||
        left.proximity - right.proximity ||
        left.startTs - right.startTs,
      )
  
    if (!matches.length) {
      return { startTs: 0, endTs: 0, isRunning: false, source: '' }
    }
  
    const best = matches[0]
    return {
      startTs: best.startTs,
      endTs: best.endTs,
      isRunning: best.isRunning,
      source: 'workday',
    }
  }
  
  function calendarTimelineOrderActualState(order = {}, resource = {}, planned = null) {
    const fromOrder = calendarTimelineActualStateFromOrderFields(order, planned)
    if (fromOrder.startTs || fromOrder.endTs) {
      return fromOrder
    }
    const fromRows = calendarTimelineActualStateFromWorkerRows(order, resource, planned)
    if (fromRows.startTs || fromRows.endTs) {
      return fromRows
    }
    return { startTs: 0, endTs: 0, isRunning: false, source: '' }
  }
  
  function calendarTimelineOrderCompletedFromStatus(order = {}) {
    const status = normalizeSearchText(order?.status ?? order?.orderStatus ?? order?.state)
    return ['closed', 'done', 'completed', 'finished', 'complete', 'zakończone', 'zakonczone'].includes(status)
  }
  
  function calendarTimelineDelayMinutes(actualTs, plannedTs) {
    const actual = Number(actualTs)
    const planned = Number(plannedTs)
    if (!Number.isFinite(actual) || !Number.isFinite(planned) || actual <= planned + 60000) {
      return 0
    }
    return Math.max(1, Math.ceil((actual - planned) / 60000))
  }
  
  function calendarTimelineStatusAlertFor(kind, order = {}, resource = {}, planned = null, actual = {}, details = {}) {
    const id = String(order?.id ?? '').trim()
    if (!id || !planned) {
      return null
    }
    const title = calendarTimelineOrderTitle(order)
    const worker = String(resource?.name ?? '').trim()
    const startDelay = Number(details?.startDelay ?? 0)
    const endDelay = Number(details?.endDelay ?? 0)
    const actualStartLabel = calendarTimelineHmFromTimestamp(actual?.startTs)
    const actualEndLabel = calendarTimelineHmFromTimestamp(actual?.endTs)
  
    if (kind === 'missing-start') {
      const alarmAtLabel = calendarTimelineHmFromTimestamp(
        Number(planned.startTs) + SCHEDULE_START_GRACE_MINUTES * 60 * 1000,
      )
      return {
        key: `${kind}|${id}|${planned.startTs}`,
        kind,
        signal: 'ALARM',
        title: 'Zlecenie nie wystartowało',
        text: `Minęło ${SCHEDULE_START_GRACE_MINUTES} minut od planowanej godziny rozpoczęcia, a system nie potwierdził START.`,
        rows: [
          {
            person: title,
            meta: worker ? `Pracownik: ${worker}` : 'Pracownik: -',
            status: `Plan START: ${planned.startLabel} · alarm: ${alarmAtLabel}`,
          },
        ],
      }
    }
  
    if (kind === 'started-late') {
      return {
        key: `${kind}|${id}|${actual?.startTs || 0}|${startDelay}`,
        kind,
        signal: 'INFO',
        title: 'Zlecenie rozpoczęte z opóźnieniem',
        text: `Start opóźniony o ${dashboardLateMinutesToHm(startDelay)} względem planu.`,
        rows: [
          {
            person: title,
            meta: `Plan START: ${planned.startLabel}`,
            status: `Realny START: ${actualStartLabel}`,
          },
        ],
      }
    }
  
    if (kind === 'completed-late') {
      return {
        key: `${kind}|${id}|${actual?.endTs || 0}|${endDelay}`,
        kind,
        signal: 'INFO',
        title: 'Zlecenie zakończone z opóźnieniem',
        text: `STOP opóźniony o ${dashboardLateMinutesToHm(endDelay)} względem planu.`,
        rows: [
          {
            person: title,
            meta: `Plan STOP: ${planned.endLabel}`,
            status: `Realny STOP: ${actualEndLabel}`,
          },
        ],
      }
    }
  
    if (kind === 'started-late-ended') {
      const endText = endDelay > 0 ? ` STOP opóźniony o ${dashboardLateMinutesToHm(endDelay)}.` : ' STOP zgodny z planem.'
      return {
        key: `${kind}|${id}|${actual?.startTs || 0}|${actual?.endTs || 0}|${startDelay}|${endDelay}`,
        kind,
        signal: 'UWAGA',
        title: 'Opóźniony start zlecenia',
        text: `START opóźniony o ${dashboardLateMinutesToHm(startDelay)}.${endText}`,
        rows: [
          {
            person: title,
            meta: `START: ${planned.startLabel} -> ${actualStartLabel}`,
            status: `STOP: ${planned.endLabel} -> ${actualEndLabel}`,
          },
        ],
      }
    }
  
    return null
  }
  
  function calendarTimelineWorkerEventsFilter(resource = {}) {
    const worker = resource?.worker ?? {}
    const workerName = String(worker?.workerName ?? worker?.fullName ?? worker?.name ?? resource?.name ?? '').trim()
    const displayName = String(resource?.name ?? workerName).trim()
    const workerLogin = String(
      worker?.workerLogin ?? worker?.login ?? worker?.loginEmail ?? worker?.email ?? worker?.workerId ?? worker?.id ?? workerName,
    ).trim()
    return {
      worker: displayName || workerName || workerLogin,
      workerLogin: workerLogin || workerName || displayName,
    }
  }
  
  function calendarTimelineOpenWorkerEvents(rowIndex) {
    const row = Number(rowIndex)
    const resources = calendarTimelineResources()
    const resource = Number.isInteger(row) ? resources[row] ?? null : null
    if (!resource || resource.type !== 'worker') {
      return
    }
  
    const filters = calendarTimelineWorkerEventsFilter(resource)
    if (!filters.worker && !filters.workerLogin) {
      return
    }
  
    appState.eventsPage = 1
    appState.eventsFilters = {
      from: firstDayOfCurrentMonthYmd(),
      to: todayYmd(),
      worker: filters.worker,
      workerLogin: filters.workerLogin,
      strefa: '',
      pomieszczenie: '',
      roomId: '',
      status: '',
      q: '',
    }
    appState.eventsWorkerLoginFilter = filters.workerLogin
    appState.eventsWorkerLoginFilterText = filters.worker
    const routeButton = document.querySelector('[data-route="events"]')
    if (routeButton instanceof HTMLElement) {
      routeButton.click()
    } else {
      applyEventsFilterInputs(appState.eventsFilters)
      void fetchEventsForCurrentSession({ resetPage: true })
    }
  }
  
  function calendarTimelineClearEventsPopupTimer() {
    if (calendarTimelineBarClickTimer) {
      window.clearTimeout(calendarTimelineBarClickTimer)
      calendarTimelineBarClickTimer = 0
    }
  }
  
  function calendarTimelineNextEventsPopupId() {
    calendarTimelineEventsPopupSequence += 1
    return `calendar-events-popup-${Date.now()}-${calendarTimelineEventsPopupSequence}`
  }
  
  function calendarTimelineEventsPopupId(node) {
    return node instanceof HTMLElement
      ? String(node.getAttribute('data-calendar-events-popup-id') || '').trim()
      : String(node || '').trim()
  }
  
  function calendarTimelineEventsPopupState(nodeOrId) {
    const popupId = calendarTimelineEventsPopupId(nodeOrId)
    return popupId ? calendarTimelineEventsPopupRegistry.get(popupId) ?? null : null
  }
  
  function calendarTimelineEventsPopupRows(nodeOrId) {
    const state = calendarTimelineEventsPopupState(nodeOrId)
    return Array.isArray(state?.rows) ? state.rows : []
  }
  
  function calendarTimelineBringEventsPopupToFront(node) {
    if (!(node instanceof HTMLElement)) {
      return
    }
    calendarTimelineEventsPopupZIndex += 1
    node.style.zIndex = String(calendarTimelineEventsPopupZIndex)
  
    const detail = document.getElementById('calendarTimelinePieDetailPopup')
    if (detail instanceof HTMLElement && detail.calendarPieDetailParent === node) {
      detail.style.zIndex = String(calendarTimelineEventsPopupZIndex + 1)
    }
  }
  
  function calendarTimelineSetEventsPopupPosition(node, left, top) {
    if (!(node instanceof HTMLElement)) {
      return
    }
  
    const margin = 12
    const rect = node.getBoundingClientRect()
    const width = rect.width || node.offsetWidth || 280
    const height = rect.height || node.offsetHeight || node.scrollHeight || 180
    const maxLeft = Math.max(margin, window.innerWidth - width - margin)
    const maxTop = Math.max(margin, window.innerHeight - height - margin)
    const nextLeft = Math.max(margin, Math.min(maxLeft, Number(left) || margin))
    const nextTop = Math.max(margin, Math.min(maxTop, Number(top) || margin))
    node.style.left = `${Math.round(nextLeft)}px`
    node.style.top = `${Math.round(nextTop)}px`
  }
  
  function calendarTimelineClampEventsPopupToViewport(node) {
    if (!(node instanceof HTMLElement)) {
      return
    }
    const rect = node.getBoundingClientRect()
    calendarTimelineSetEventsPopupPosition(node, rect.left, rect.top)
  }
  
  function calendarTimelineClampAllEventsPopupsToViewport() {
    calendarTimelineEventsPopupRegistry.forEach((state) => {
      calendarTimelineClampEventsPopupToViewport(state?.node)
    })
    calendarTimelinePositionPieDetailPopup()
  }
  
  function calendarTimelineStopEventsPopupDrag() {
    const dragState = calendarTimelineEventsPopupDragState
    if (!dragState) {
      return
    }
  
    const node = dragState.node
    if (node instanceof HTMLElement) {
      node.classList.remove('is-dragging')
      try {
        node.releasePointerCapture?.(dragState.pointerId)
      } catch {
        // Ignore pointer capture failures.
      }
    }
  
    document.body?.classList?.remove('calendar-events-popup-dragging')
    window.removeEventListener('pointermove', calendarTimelineHandleEventsPopupDragMove)
    window.removeEventListener('pointerup', calendarTimelineHandleEventsPopupDragEnd)
    window.removeEventListener('pointercancel', calendarTimelineHandleEventsPopupDragEnd)
    calendarTimelineEventsPopupDragState = null
  }
  
  function calendarTimelineHandleEventsPopupDragMove(event) {
    const dragState = calendarTimelineEventsPopupDragState
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return
    }
  
    event.preventDefault()
    const nextLeft = dragState.left + (event.clientX - dragState.clientX)
    const nextTop = dragState.top + (event.clientY - dragState.clientY)
    calendarTimelineSetEventsPopupPosition(dragState.node, nextLeft, nextTop)
    const popupState = calendarTimelineEventsPopupState(dragState.node)
    if (popupState) {
      popupState.dragged = true
    }
    calendarTimelinePositionPieDetailPopup()
  }
  
  function calendarTimelineHandleEventsPopupDragEnd(event) {
    if (calendarTimelineEventsPopupDragState && event.pointerId !== calendarTimelineEventsPopupDragState.pointerId) {
      return
    }
    calendarTimelineStopEventsPopupDrag()
  }
  
  function calendarTimelineStartEventsPopupDrag(node, event) {
    if (!(node instanceof HTMLElement) || event.button !== 0) {
      return
    }
  
    const target = event.target
    if (!(target instanceof HTMLElement)) {
      return
    }
    const handle = target.closest('.calendar-events-popup-head')
    if (!(handle instanceof HTMLElement) || !node.contains(handle)) {
      return
    }
    if (target.closest('button, a, input, textarea, select, [data-calendar-events-no-drag]')) {
      return
    }
  
    event.preventDefault()
    calendarTimelineStopEventsPopupDrag()
    calendarTimelineBringEventsPopupToFront(node)
    const rect = node.getBoundingClientRect()
    calendarTimelineEventsPopupDragState = {
      node,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      left: rect.left,
      top: rect.top,
    }
    node.classList.add('is-dragging')
    document.body?.classList?.add('calendar-events-popup-dragging')
    try {
      node.setPointerCapture?.(event.pointerId)
    } catch {
        // Ignore pointer capture failures.
      }
    window.addEventListener('pointermove', calendarTimelineHandleEventsPopupDragMove)
    window.addEventListener('pointerup', calendarTimelineHandleEventsPopupDragEnd)
    window.addEventListener('pointercancel', calendarTimelineHandleEventsPopupDragEnd)
  }
  
  function calendarTimelineCloseEventsPopup(nodeOrId) {
    const state = calendarTimelineEventsPopupState(nodeOrId)
    const node = state?.node instanceof HTMLElement
      ? state.node
      : nodeOrId instanceof HTMLElement
        ? nodeOrId
        : null
    const popupId = calendarTimelineEventsPopupId(node || nodeOrId)
    if (!node) {
      if (popupId) {
        calendarTimelineEventsPopupRegistry.delete(popupId)
      }
      return
    }
  
    if (calendarTimelineEventsPopupDragState?.node === node) {
      calendarTimelineStopEventsPopupDrag()
    }
    calendarTimelineHidePieDetailPopup(popupId)
    node.remove()
    if (popupId) {
      calendarTimelineEventsPopupRegistry.delete(popupId)
    }
  }
  
  function calendarTimelineHideEventsPopup() {
    calendarTimelineClearEventsPopupTimer()
    calendarTimelineStopEventsPopupDrag()
    calendarTimelineHidePieDetailPopup()
    calendarTimelineEventsPopupRegistry.forEach((state) => {
      if (state?.node instanceof HTMLElement) {
        state.node.remove()
      }
    })
    calendarTimelineEventsPopupRegistry.clear()
    document.querySelectorAll('.calendar-events-popup[data-calendar-events-popup-id]').forEach((node) => {
      node.remove()
    })
    calendarTimelineEventsPopupZIndex = 12000
  }
  
  function calendarTimelineBindEventsPopupNode(node) {
    if (!(node instanceof HTMLElement)) {
      return
    }
  
    node.addEventListener('pointerdown', (event) => {
      calendarTimelineBringEventsPopupToFront(node)
      calendarTimelineStartEventsPopupDrag(node, event)
    })
    node.addEventListener('click', (event) => {
      calendarTimelineBringEventsPopupToFront(node)
      const closeButton = event.target?.closest?.('[data-calendar-events-popup-close]')
      if (closeButton) {
        event.preventDefault()
        event.stopPropagation()
        calendarTimelineCloseEventsPopup(node)
        return
      }
      const pieLegendRow = event.target?.closest?.('[data-calendar-pie-key]')
      if (pieLegendRow instanceof HTMLElement) {
        event.preventDefault()
        event.stopPropagation()
        calendarTimelineSetPieHighlight(pieLegendRow, true)
        calendarTimelineShowPieDetailPopup(pieLegendRow.getAttribute('data-calendar-pie-key'), pieLegendRow, node)
        return
      }
      const pieChart = event.target?.closest?.('[data-calendar-pie-chart]')
      if (pieChart instanceof HTMLElement) {
        event.preventDefault()
        event.stopPropagation()
        const key = calendarTimelinePieKeyFromChartClick(pieChart, event)
        if (key) {
          const row = [...node.querySelectorAll('[data-calendar-pie-key]')]
            .find((item) => item instanceof HTMLElement && item.getAttribute('data-calendar-pie-key') === key)
          if (row instanceof HTMLElement) {
            calendarTimelineSetPieHighlight(row, true)
          }
          calendarTimelineShowPieDetailPopup(key, pieChart, node)
        }
        return
      }
      const geoButton = event.target?.closest?.('[data-calendar-event-geo][data-rep-geo-lat][data-rep-geo-lon]')
      if (geoButton) {
        event.preventDefault()
        event.stopPropagation()
        const coords = reportGeoReadCoordsFromNode(geoButton)
        if (coords) {
          reportGeoOpenModal(coords.lat, coords.lon)
        }
        return
      }
      const editButton = event.target?.closest?.('[data-calendar-event-popup-edit]')
      if (editButton) {
        const index = Number(editButton.getAttribute('data-calendar-event-popup-edit'))
        const row = calendarTimelineEventsPopupRows(node)[index] ?? null
        if (row) {
          void openEventEditor(row?.calendarTimelineMarkerSourceRow || row)
        }
      }
    })
    node.addEventListener('mouseover', (event) => {
      const geoButton = event.target?.closest?.('[data-calendar-event-geo][data-rep-geo-lat][data-rep-geo-lon]')
      if (geoButton instanceof HTMLElement) {
        const coords = reportGeoReadCoordsFromNode(geoButton)
        if (coords) {
          reportGeoShowPreview(geoButton, coords.lat, coords.lon)
        }
      }
      const row = event.target?.closest?.('[data-calendar-pie-highlight]')
      if (row instanceof HTMLElement) {
        calendarTimelineSetPieHighlight(row, true)
      }
    })
    node.addEventListener('mouseout', (event) => {
      const geoButton = event.target?.closest?.('[data-calendar-event-geo][data-rep-geo-lat][data-rep-geo-lon]')
      if (geoButton instanceof HTMLElement && !geoButton.contains(event.relatedTarget)) {
        reportGeoHidePreviewSoon()
      }
      const row = event.target?.closest?.('[data-calendar-pie-highlight]')
      if (row instanceof HTMLElement && !row.contains(event.relatedTarget)) {
        calendarTimelineSetPieHighlight(row, false)
      }
    })
    node.addEventListener('focusin', (event) => {
      const row = event.target?.closest?.('[data-calendar-pie-highlight]')
      if (row instanceof HTMLElement) {
        calendarTimelineSetPieHighlight(row, true)
      }
    })
    node.addEventListener('focusout', (event) => {
      const row = event.target?.closest?.('[data-calendar-pie-highlight]')
      if (row instanceof HTMLElement && !row.contains(event.relatedTarget)) {
        calendarTimelineSetPieHighlight(row, false)
      }
    })
    node.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return
      }
      const pieLegendRow = event.target?.closest?.('[data-calendar-pie-key]')
      if (pieLegendRow instanceof HTMLElement) {
        event.preventDefault()
        calendarTimelineShowPieDetailPopup(pieLegendRow.getAttribute('data-calendar-pie-key'), pieLegendRow, node)
      }
    })
  }
  
  function calendarTimelineBarContextFromElement(bar) {
    if (!(bar instanceof HTMLElement)) {
      return null
    }
    const row = Number(bar.getAttribute('data-calendar-timeline-row'))
    const resources = calendarTimelineResources()
    const resource = Number.isInteger(row) ? resources[row] ?? null : null
    const dateYmd = String(bar.getAttribute('data-calendar-timeline-date') || calendarTimelineStatusDayKey()).trim()
    if (!resource || resource.type !== 'worker' || !/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
      return null
    }
    return {
      bar,
      row,
      resource,
      dateYmd,
      orderId: String(bar.getAttribute('data-calendar-timeline-order-id') || '').trim(),
      sourceOrderId: String(bar.getAttribute('data-calendar-timeline-source-order-id') || '').trim(),
      isRealEvent: bar.getAttribute('data-calendar-timeline-real-event') === '1',
      sourceEventId: String(bar.getAttribute('data-calendar-timeline-source-event-id') || '').trim(),
      workdayId: String(bar.getAttribute('data-calendar-timeline-workday-id') || '').trim(),
      sourceStartAt: toIso(bar.getAttribute('data-calendar-timeline-source-start') || ''),
    }
  }
  
  function calendarTimelinePopupEventSortTime(row = {}) {
    const markerType = calendarTimelineEventMarkerType(row)
    const value =
      markerType === 'QR START'
        ? row?.dayStartAt ?? row?.startAt
        : markerType === 'QR STOP'
          ? row?.dayEndAt ?? row?.endAt ?? row?.closeMarkedAt ?? row?.startAt
          : row?.startAt ?? row?.dayStartAt ?? row?.endAt ?? row?.dayEndAt
    return calendarTimelineEventTimestamp(value)
  }
  
  function calendarTimelinePopupEventSortPriority(row = {}) {
    const markerType = calendarTimelineEventMarkerType(row)
    if (markerType === 'QR START') {
      return 0
    }
    if (calendarTimelineEventIsDayShellItem({ row, startTs: 0, endTs: 0 }, [], 0, 0)) {
      return 1
    }
    if (markerType === 'QR STOP') {
      return 9
    }
    return 5
  }
  
  function calendarTimelineDayStartMarkerFromRows(rows = [], dayKey = '') {
    const day = String(dayKey ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return null
    }
  
    let best = null
    ;(Array.isArray(rows) ? rows : []).forEach((row) => {
      if (calendarTimelineEventMarkerType(row) === 'QR START') {
        best = best || { row: null, marker: null, score: Number.POSITIVE_INFINITY, hasExisting: true }
        return
      }
  
      const startIso = toIso(row?.dayStartAt ?? row?.startAt)
      if (!startIso || calendarDateToYmd(startIso) !== day) {
        return
      }
  
      const qrCandidate = reportHistoryResolveDayQrCandidate(row, 'start')
      const sourceKind = String(row?.historySourceKind ?? '').trim().toLowerCase()
      const hasDayStartHint = [row?.dayStartAt, row?.dayStartObject, row?.dayComment, row?.workdayUtilityRoomId]
        .some((value) => String(value ?? '').trim())
      const score =
        Number(qrCandidate?.score ?? 0) * 10 +
        (sourceKind === 'workday' ? 5 : 0) +
        (hasDayStartHint ? 2 : 0)
      if (best && best.hasExisting) {
        return
      }
      if (best && score <= best.score) {
        return
      }
  
      const qrCode = qrCandidate?.code && qrCandidate.code !== '-' ? qrCandidate.code : ''
      best = {
        row,
        score,
        hasExisting: false,
        marker: {
          ...row,
          calendarTimelineMarkerType: 'QR START',
          calendarTimelinePopupSyntheticMarker: true,
          calendarTimelineMarkerSourceRow: row,
          historyMarkerOnly: true,
          startAt: startIso,
          endAt: '',
          dayStartAt: startIso,
          dayEndAt: '',
          durationSec: 0,
          dayStartObject: qrCode || row?.dayStartObject || row?.startObject || row?.workdayUtilityRoomId || '',
        },
      }
    })
  
    return best?.hasExisting ? null : best?.marker ?? null
  }
  
  function calendarTimelineRowsWithDayStartMarker(rows = [], dayKey = '') {
    const sourceRows = Array.isArray(rows) ? rows : []
    const startMarker = calendarTimelineDayStartMarkerFromRows(sourceRows, dayKey)
    const result = calendarTimelineDeduplicatePopupMarkerRows(startMarker ? [startMarker, ...sourceRows] : [...sourceRows])
  
    return result.sort((left, right) => {
      const timeDiff = calendarTimelinePopupEventSortTime(left) - calendarTimelinePopupEventSortTime(right)
      if (timeDiff) {
        return timeDiff
      }
      const priorityDiff = calendarTimelinePopupEventSortPriority(left) - calendarTimelinePopupEventSortPriority(right)
      if (priorityDiff) {
        return priorityDiff
      }
      return calendarTimelineEventIdentityValues(left).join('|').localeCompare(calendarTimelineEventIdentityValues(right).join('|'))
    })
  }
  
  function calendarTimelineStatusPopupStartIso(row = {}, dayKey = '', context = {}) {
    const directIso = toIso(
      row?.dayStartAt ??
        row?.startAt ??
        row?.qrStartAt ??
        row?.qrStartIso ??
        row?.dayStartIso ??
        row?.firstStartIso ??
        context?.sourceStartAt,
    )
    if (directIso) {
      return directIso
    }
  
    const minutes = calendarTimelineRowStartMinutes(row)
    if (Number.isFinite(minutes) && minutes >= 0) {
      const timestamp = calendarTimelineTimestampFromDayMinutes(dayKey, minutes)
      if (timestamp > 0) {
        return new Date(timestamp).toISOString()
      }
    }
  
    const contextStartTs = calendarTimelineEventTimestamp(context?.sourceStartAt)
    return contextStartTs > 0 ? new Date(contextStartTs).toISOString() : ''
  }
  
  function calendarTimelineStatusPopupRows(resource = {}, dayKey = '', context = {}) {
    const day = String(dayKey ?? '').trim()
    if (resource?.type !== 'worker' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return []
    }
  
    const statusRow = calendarTimelineCurrentStatusRowForResource(resource, day)
    const contextStartTs = calendarTimelineEventTimestamp(context?.sourceStartAt)
    if (!statusRow && contextStartTs <= 0) {
      return []
    }
  
    const startMinutesFromContext = contextStartTs > 0
      ? calendarTimelineTimestampToMinutes(new Date(contextStartTs).toISOString())
      : -1
    const startMinutesFromRow = statusRow ? calendarTimelineRowStartMinutes(statusRow) : -1
    const startMinutes = startMinutesFromRow >= 0 ? startMinutesFromRow : startMinutesFromContext
    if (!Number.isFinite(startMinutes) || startMinutes < 0) {
      return []
    }
  
    const baseRow = calendarTimelineStatusFallbackRow(resource, startMinutes, statusRow)
    const startIso = calendarTimelineStatusPopupStartIso(baseRow, day, context)
    if (!startIso) {
      return []
    }
  
    const qrCode = reportHistoryResolveDayQrCode(baseRow, 'start') || zoneQrCodeFromRow(baseRow)
    const marker = {
      ...baseRow,
      calendarTimelineMarkerType: 'QR START',
      calendarTimelinePopupSyntheticMarker: true,
      calendarTimelineMarkerSourceRow: statusRow || baseRow,
      historyMarkerOnly: true,
      startAt: startIso,
      endAt: '',
      dayStartAt: startIso,
      dayEndAt: '',
      durationSec: 0,
      status: 'RUNNING',
      dayStartObject: qrCode || baseRow?.dayStartObject || baseRow?.startObject || baseRow?.workdayUtilityRoomId || '',
    }
    const span = {
      ...baseRow,
      calendarTimelineStatusFallbackSpan: true,
      calendarTimelinePopupSyntheticMarker: true,
      calendarTimelineMarkerSourceRow: statusRow || baseRow,
      startAt: startIso,
      endAt: '',
      dayStartAt: startIso,
      dayEndAt: '',
      durationSec: Math.max(0, Math.floor((Date.now() - new Date(startIso).getTime()) / 1000)),
      status: 'RUNNING',
      dayStartObject: qrCode || baseRow?.dayStartObject || baseRow?.startObject || baseRow?.workdayUtilityRoomId || '',
    }
  
    return calendarTimelineRowsWithDayStartMarker([marker, span], day)
  }
  
  function calendarTimelinePopupMarkerDedupeKey(row = {}) {
    const markerType = calendarTimelineEventMarkerType(row)
    if (markerType !== 'QR START' && markerType !== 'QR STOP' && markerType !== 'QR START + STOP') {
      return ''
    }
  
    const isStop = markerType === 'QR STOP'
    const phase = isStop ? 'stop' : 'start'
    const timestamp = calendarTimelineEventTimestamp(
      isStop
        ? row?.dayEndAt ?? row?.endAt ?? row?.closeMarkedAt ?? row?.startAt
        : row?.dayStartAt ?? row?.startAt ?? row?.endAt,
    )
    const minuteKey = timestamp > 0 ? Math.round(timestamp / 60000) : 0
    if (minuteKey > 0) {
      return [markerType, minuteKey].join('|')
    }
    const qr = reportHistoryResolveDayQrCode(row, phase) || zoneQrCodeFromRow(row)
    const client = calendarTimelineReadableClientLabel(dashboardResolveClientLabel(row))
    return [
      markerType,
      minuteKey,
      normalizeSearchText(qr) || '-',
      normalizeSearchText(client) || '-',
    ].join('|')
  }
  
  function calendarTimelinePopupMarkerRowScore(row = {}) {
    let score = 0
    if (calendarTimelineEventLocationLabel(row)) score += 10
    if (calendarTimelineEventGpsCoords(row, calendarTimelineEventMarkerType(row))) score += 6
    if (reportHistoryResolveDayQrCode(row, calendarTimelineEventMarkerType(row) === 'QR STOP' ? 'stop' : 'start')) score += 3
    if (!row?.calendarTimelinePopupSyntheticMarker) score += 1
    return score
  }
  
  function calendarTimelineDeduplicatePopupMarkerRows(rows = []) {
    const result = []
    const markerIndexByKey = new Map()
    ;(Array.isArray(rows) ? rows : []).forEach((row) => {
      const key = calendarTimelinePopupMarkerDedupeKey(row)
      if (!key) {
        result.push(row)
        return
      }
  
      const existingIndex = markerIndexByKey.get(key)
      if (!Number.isInteger(existingIndex)) {
        markerIndexByKey.set(key, result.length)
        result.push(row)
        return
      }
  
      const existing = result[existingIndex]
      if (calendarTimelinePopupMarkerRowScore(row) > calendarTimelinePopupMarkerRowScore(existing)) {
        result[existingIndex] = row
      }
    })
    return result
  }
  
  async function calendarTimelineFetchWorkerDayEvents(resource = {}, dayKey = '', context = {}) {
    const day = String(dayKey ?? '').trim()
    if (!appState.session?.orgId || resource?.type !== 'worker' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return []
    }
    const filters = calendarTimelineWorkerEventsFilter(resource)
    const baseQuery = {
      source: 'events',
      fromIso: day,
      toIso: day,
      page: 1,
      pageSize: 1000,
    }
    const queryAttempts = [
      filters.workerLogin ? { ...baseQuery, workerLogin: filters.workerLogin } : null,
      filters.worker ? { ...baseQuery, worker: filters.worker } : null,
      baseQuery,
    ].filter(Boolean)
  
    for (const query of queryAttempts) {
      const response = await getWorkdays(appState.session.orgId, query)
      assertCompletePagedResponse(response, 'zdarzen pracownika w kalendarzu')
      const rows = (Array.isArray(response?.items) ? response.items : [])
        .filter((row) => calendarTimelineRealEventRowDay(row) === day)
        .sort((left, right) =>
          calendarTimelineEventTimestamp(left?.startAt ?? left?.dayStartAt ?? left?.endAt ?? left?.dayEndAt) -
          calendarTimelineEventTimestamp(right?.startAt ?? right?.dayStartAt ?? right?.endAt ?? right?.dayEndAt),
        )
      const matchedRows = rows.filter((row) => calendarTimelineResourceMatchesSourceRow(resource, row))
      if (matchedRows.length) {
        return calendarTimelineRowsWithDayStartMarker(calendarTimelineFilterRowsForBarContext(matchedRows, context), day)
      }
      if (query.workerLogin || query.worker) {
        continue
      }
    }
  
    return calendarTimelineStatusPopupRows(resource, day, context)
  }
  
  function calendarTimelineEventIdentityValues(row = {}) {
    return [
      row?.eventId,
      row?.workdayId,
      row?.linkedWorkdayId,
      row?.id,
      row?.startEventId,
      row?.endEventId,
    ]
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)
  }
  
  function calendarTimelineRowMatchesBarCycle(row = {}, context = {}) {
    const contextWorkdayId = String(context?.workdayId ?? '').trim()
    const contextSourceEventId = String(context?.sourceEventId ?? '').trim()
    const sourceStartTs = calendarTimelineEventTimestamp(context?.sourceStartAt)
    const rowStartTs =
      calendarTimelineSourceRowWorkdayStartTimestamp(row) ||
      calendarTimelineEventTimestamp(row?.dayStartAt)
  
    if (contextWorkdayId) {
      const rowWorkdayId = calendarTimelineRealWorkdayIdentity(row)
      if (rowWorkdayId && rowWorkdayId === contextWorkdayId) {
        if (sourceStartTs <= 0) {
          return true
        }
        return rowStartTs > 0 && Math.abs(rowStartTs - sourceStartTs) <= 60 * 1000
      }
  
      const rowIds = calendarTimelineEventIdentityValues(row)
      if (rowIds.includes(contextWorkdayId)) {
        return true
      }
    }
  
    if (contextSourceEventId && calendarTimelineEventIdentityValues(row).includes(contextSourceEventId)) {
      return true
    }
  
    if (sourceStartTs > 0) {
      if (rowStartTs > 0 && Math.abs(rowStartTs - sourceStartTs) <= 60 * 1000) {
        return true
      }
    }
  
    return !contextWorkdayId && !contextSourceEventId && sourceStartTs <= 0
  }
  
  function calendarTimelineFilterRowsForBarContext(rows = [], context = {}) {
    const sourceRows = Array.isArray(rows) ? rows : []
    const hasCycleHint = Boolean(
      String(context?.workdayId ?? '').trim() ||
        String(context?.sourceEventId ?? '').trim() ||
        calendarTimelineEventTimestamp(context?.sourceStartAt) > 0,
    )
    if (!hasCycleHint) {
      return sourceRows
    }
  
    const scopedRows = sourceRows.filter((row) => calendarTimelineRowMatchesBarCycle(row, context))
    return scopedRows.length ? scopedRows : sourceRows
  }
  
  function calendarTimelineFindEventRowForBar(rows = [], context = {}) {
    const sourceRows = (Array.isArray(rows) ? rows : []).filter((row) => !row?.calendarTimelinePopupSyntheticMarker)
    const ids = new Set([context?.sourceEventId, context?.workdayId, context?.orderId?.replace(/^real-/, '')]
      .map((value) => String(value ?? '').trim())
      .filter(Boolean))
    if (ids.size) {
      const exact = sourceRows.find((row) =>
        calendarTimelineEventIdentityValues(row).some((value) => ids.has(value)),
      )
      if (exact) {
        return exact
      }
    }
  
    const sourceStartTs = calendarTimelineEventTimestamp(context?.sourceStartAt)
    if (sourceStartTs > 0) {
      return [...sourceRows]
        .map((row) => ({
          row,
          distance: Math.abs(calendarTimelineEventTimestamp(row?.startAt ?? row?.dayStartAt) - sourceStartTs),
        }))
        .filter((item) => Number.isFinite(item.distance))
        .sort((left, right) => left.distance - right.distance)[0]?.row ?? null
    }
  
    return sourceRows.length ? sourceRows[0] : Array.isArray(rows) && rows.length ? rows[0] : null
  }
  
  function calendarTimelineEventDurationFromRow(row = {}) {
    if (calendarTimelineEventMarkerType(row)) {
      return 0
    }
  
    const direct = Number(row?.durationSec ?? 0)
    if (Number.isFinite(direct) && direct > 0) {
      return direct
    }
    const startTs = calendarTimelineEventTimestamp(row?.startAt ?? row?.dayStartAt)
    const endTs = calendarTimelineEventTimestamp(row?.endAt ?? row?.dayEndAt)
    if (startTs > 0 && endTs > startTs) {
      return Math.floor((endTs - startTs) / 1000)
    }
    if (startTs > 0 && normalizeEventStatus(row?.status, Boolean(row?.endAt ?? row?.dayEndAt)) === 'RUNNING') {
      return Math.max(0, Math.floor((Date.now() - startTs) / 1000))
    }
    return 0
  }
  
  function calendarTimelineShortTimeLabel(value = '') {
    const iso = toIso(value)
    if (!iso) {
      return '--:--'
    }
    const date = new Date(iso)
    if (!Number.isFinite(date.getTime())) {
      return '--:--'
    }
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  }
  
  function calendarTimelineEventTimeRangeLabel(row = {}) {
    const markerType = calendarTimelineEventMarkerType(row)
    if (markerType === 'QR STOP') {
      return calendarTimelineShortTimeLabel(row?.dayEndAt ?? row?.endAt ?? row?.closeMarkedAt ?? row?.startAt)
    }
    if (markerType === 'QR START' || markerType === 'QR START + STOP') {
      return calendarTimelineShortTimeLabel(row?.dayStartAt ?? row?.startAt ?? row?.endAt)
    }
  
    const startValue = row?.startAt ?? row?.dayStartAt
    const endIso = toIso(row?.endAt ?? row?.dayEndAt)
    const startLabel = calendarTimelineShortTimeLabel(startValue)
    const endLabel = endIso ? calendarTimelineShortTimeLabel(endIso) : 'trwa'
    return `${startLabel} - ${endLabel}`
  }
  
  function calendarTimelineIsTechnicalEventCode(value = '') {
    const normalized = String(value ?? '').trim().toUpperCase().replace(/^QR\s+/, '')
    return /^EV-\d+(?:-\d+)?$/.test(normalized)
  }
  
  function calendarTimelineIsSystemAddedEntry(row = {}) {
    const eventId = String(row?.eventId ?? row?.id ?? '').trim()
    const workdayId = String(row?.workdayId ?? row?.linkedWorkdayId ?? '').trim()
    const hasPortalEventId = calendarTimelineIsTechnicalEventCode(eventId)
    const sameEventAndWorkday = !workdayId || workdayId === eventId
    const hasMobileScanLink = [row?.startEventId, row?.endEventId, row?.deviceId]
      .some((value) => String(value ?? '').trim())
    const scannedObject = eventEditorFirstScannedQr([
      row?.dayStartObject,
      row?.dayStopObject,
      row?.startObject,
      row?.stopObject,
      row?.dayComment,
      row?.comment,
    ])
    return Boolean(hasPortalEventId && sameEventAndWorkday && !hasMobileScanLink && !scannedObject)
  }
  
  function calendarTimelineSystemAddedMarkerLabel(row = {}) {
    if (!calendarTimelineIsSystemAddedEntry(row)) {
      return ''
    }
    const markerType = eventTypeInfo(row).label
    return markerType === 'QR START' || markerType === 'QR START + STOP' ? 'Dodano w systemie' : ''
  }
  
  function calendarTimelineEventMarkerType(row = {}) {
    if (row?.calendarTimelineStatusFallbackSpan) {
      return ''
    }
  
    const explicitMarker = String(row?.calendarTimelineMarkerType ?? '').trim().toUpperCase()
    if (explicitMarker === 'QR START' || explicitMarker === 'QR STOP' || explicitMarker === 'QR START + STOP') {
      return explicitMarker
    }
  
    const label = eventTypeInfo(row).label
    return label === 'QR START' || label === 'QR STOP' || label === 'QR START + STOP' ? label : ''
  }
  
  function calendarTimelineEventIsDayMarker(row = {}) {
    return Boolean(calendarTimelineEventMarkerType(row))
  }
  
  function calendarTimelineEventIsSystemStatus(row = {}) {
    if (calendarTimelineEventIsDayMarker(row)) {
      return false
    }
  
    if (reportHistoryIsSystemEntrySource(row)) {
      return true
    }
  
    const candidates = [
      zoneQrCodeFromRow(row),
      row?.zoneId,
      row?.roomId,
      row?.utilityRoomId,
      row?.strefa,
      row?.zoneName,
      row?.dayStartObject,
      row?.dayStopObject,
      dashboardResolveClientLabel(row),
      dashboardResolveZoneLabel(row),
    ]
    return candidates.some((value) => calendarTimelineIsTechnicalEventCode(value))
  }
  
  function calendarTimelineMarkerMetaLabel(row = {}, markerType = '') {
    const normalizedMarker = String(markerType ?? '').trim().toUpperCase()
    if (!normalizedMarker) {
      return ''
    }
  
    if (calendarTimelineSystemAddedMarkerLabel(row)) {
      return normalizedMarker
    }
  
    const phase = normalizedMarker === 'QR STOP' ? 'stop' : 'start'
    const qr = reportHistoryResolveDayQrCode(row, phase)
    const client =
      calendarTimelineReadableClientLabel(dashboardResolveClientLabel(row)) ||
      calendarTimelineReadableClientLabel(reportHistoryResolveClientByZoneCode(qr, ''))
    const parts = [client, qr && qr !== '-' ? `QR ${qr}` : '']
      .map((value) => String(value ?? '').trim())
      .filter((value, index, list) => value && value !== '-' && list.indexOf(value) === index)
  
    return parts.join(' / ')
  }
  
  function calendarTimelineEventLocationLabel(row = {}) {
    const markerType = calendarTimelineEventMarkerType(row)
    const markerCandidates =
      markerType === 'QR STOP'
        ? [
            row?.dayStopObject,
            row?.stopObject,
            reportHistoryExtractQrFromComment(row?.dayComment ?? row?.comment, 'stop'),
          ]
        : markerType
          ? [
              row?.dayStartObject,
              row?.startObject,
              reportHistoryExtractQrFromComment(row?.dayComment ?? row?.comment, 'start'),
            ]
          : []
    for (const candidate of markerCandidates) {
      const zone = resolveZoneByQrCandidate(candidate)
      const location = String(zone?.location ?? zone?.lokalizacja ?? '').trim()
      if (location && location !== '-') {
        return location
      }
    }
  
    const direct = [
      row?.lokalizacja,
      row?.location,
      row?.zone?.location,
    ]
      .map((value) => String(value ?? '').trim())
      .find((value) => value && value !== '-')
    if (direct) {
      return direct
    }
  
    const candidates = [
      row?.activeZoneId,
      row?.zoneId,
      row?.roomId,
      row?.utilityRoomId,
      row?.workdayUtilityRoomId,
      row?.qr,
      row?.qrCode,
      row?.dayStartObject,
      row?.dayStopObject,
      row?.startObject,
      row?.stopObject,
    ]
    for (const candidate of candidates) {
      const zone = resolveZoneByQrCandidate(candidate)
      const location = String(zone?.location ?? zone?.lokalizacja ?? '').trim()
      if (location && location !== '-') {
        return location
      }
    }
  
    return ''
  }
  
  function calendarTimelineEventGpsCoords(row = {}, markerType = '') {
    const normalizedMarker = String(markerType ?? calendarTimelineEventMarkerType(row) ?? '').trim().toUpperCase()
    const typeLabel = eventTypeInfo(row).label
    let phase = ''
    if (normalizedMarker === 'QR START' || normalizedMarker === 'QR START + STOP') {
      phase = 'start'
    } else if (normalizedMarker === 'QR STOP') {
      phase = 'stop'
    } else if (typeLabel === 'Strefa spec.') {
      phase = 'start'
    } else {
      return null
    }
  
    const dayCoords = normalizedMarker
      ? reportHistoryResolveDayGpsCoords(row, phase)
      : ''
    const sources = [
      dayCoords,
      row?.gps,
      row?.comment,
      row?.dayGps,
      row?.dayComment,
    ]
    for (const source of sources) {
      const extracted = reportHistoryExtractGpsCoords(source, phase) || source
      const parsed = reportHistoryParseGeoPair(extracted)
      if (parsed) {
        return parsed
      }
    }
  
    return null
  }
  
  function calendarTimelineEventStatusLabel(status = '') {
    const normalized = String(status ?? '').trim().toUpperCase()
    if (normalized === 'CLOSED') {
      return 'Zakończone'
    }
    if (normalized === 'RUNNING' || normalized === 'OPEN') {
      return 'W trakcie'
    }
    return normalized || '-'
  }
  
  const CALENDAR_TIMELINE_GRAPH_ZONE_COLORS = [
    { bg: '#2f6bf2', hover: '#1d4ed8', shadow: 'rgba(47,107,242,.24)' },
    { bg: '#16a34a', hover: '#15803d', shadow: 'rgba(22,163,74,.24)' },
    { bg: '#f59e0b', hover: '#d97706', shadow: 'rgba(245,158,11,.26)' },
    { bg: '#0ea5e9', hover: '#0284c7', shadow: 'rgba(14,165,233,.24)' },
    { bg: '#7c3aed', hover: '#6d28d9', shadow: 'rgba(124,58,237,.24)' },
    { bg: '#dc2626', hover: '#b91c1c', shadow: 'rgba(220,38,38,.24)' },
    { bg: '#0891b2', hover: '#0e7490', shadow: 'rgba(8,145,178,.24)' },
    { bg: '#be185d', hover: '#9d174d', shadow: 'rgba(190,24,93,.24)' },
  ]
  
  function calendarTimelineGraphZoneLabel(row = {}) {
    const markerType = calendarTimelineEventMarkerType(row)
    if (markerType) {
      return markerType
    }
  
    if (calendarTimelineEventIsSystemStatus(row)) {
      return 'System'
    }
  
    const zone = String(dashboardResolveZoneLabel(row) || '').trim()
    if (zone && zone !== '-') {
      return zone
    }
  
    return ''
  }
  
  function calendarTimelineGraphZoneStyle(row = {}, label = '') {
    if (calendarTimelineEventIsSystemStatus(row)) {
      return '--zone-color:#64748b;--zone-color-hover:#475569;--zone-shadow:rgba(100,116,139,.24);'
    }
  
    const color = calendarTimelineGraphColorForKey(label || calendarTimelineGraphZoneLabel(row))
    return `--zone-color:${color.bg};--zone-color-hover:${color.hover};--zone-shadow:${color.shadow};`
  }
  
  function calendarTimelineGraphColorForKey(value = '') {
    const key = String(value ?? '').trim()
    let hash = 0
    for (let index = 0; index < key.length; index += 1) {
      hash = (hash * 31 + key.charCodeAt(index)) >>> 0
    }
    const color = CALENDAR_TIMELINE_GRAPH_ZONE_COLORS[hash % CALENDAR_TIMELINE_GRAPH_ZONE_COLORS.length]
    return color || CALENDAR_TIMELINE_GRAPH_ZONE_COLORS[0]
  }
  
  function calendarTimelineGraphClientLabel(row = {}) {
    const markerType = calendarTimelineEventMarkerType(row)
    if (markerType) {
      return markerType
    }
  
    if (calendarTimelineEventIsSystemStatus(row)) {
      return 'System'
    }
    const client = calendarTimelineReadableClientLabel(dashboardResolveClientLabel(row))
    if (!client || client === '-' || dashboardIsQrCodeLike(client)) {
      return ''
    }
    return client
  }
  
  function calendarTimelineAssignGraphLanes(items = []) {
    const laneEnds = []
    items.forEach((item) => {
      let lane = laneEnds.findIndex((endTs) => endTs <= item.startTs)
      if (lane < 0) {
        lane = laneEnds.length
      }
      laneEnds[lane] = item.endTs
      item.lane = lane
    })
    return Math.max(1, laneEnds.length)
  }
  
  function calendarTimelineMergeGraphItemsByLabel(items = [], labelResolver = () => '') {
    const groups = []
    const lastByLabel = new Map()
    items.forEach((item) => {
      const label = String(labelResolver(item.row) || '').trim() || '-'
      const key = normalizeSearchText(label) || label.toLowerCase()
      const last = lastByLabel.get(key)
      if (last && item.startTs <= last.endTs + 60 * 1000) {
        last.endTs = Math.max(last.endTs, item.endTs)
        last.rows.push(item)
        return
      }
  
      const group = {
        ...item,
        label,
        rows: [item],
      }
      groups.push(group)
      lastByLabel.set(key, group)
    })
    return groups
  }
  
  function calendarTimelineInactiveGraphItems(activeItems = [], rangeStart = 0, rangeEnd = 0) {
    const start = Number(rangeStart)
    const end = Number(rangeEnd)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return []
    }
  
    const intervals = (Array.isArray(activeItems) ? activeItems : [])
      .map((item) => ({
        startTs: Math.max(start, Number(item?.startTs || 0)),
        endTs: Math.min(end, Number(item?.endTs || 0)),
      }))
      .filter((item) => Number.isFinite(item.startTs) && Number.isFinite(item.endTs) && item.endTs > item.startTs)
      .sort((left, right) => left.startTs - right.startTs || left.endTs - right.endTs)
  
    const merged = []
    intervals.forEach((item) => {
      const last = merged[merged.length - 1]
      if (last && item.startTs <= last.endTs + 1000) {
        last.endTs = Math.max(last.endTs, item.endTs)
        return
      }
      merged.push({ ...item })
    })
  
    const gaps = []
    let cursor = start
    merged.forEach((item) => {
      if (item.startTs - cursor >= 60 * 1000) {
        gaps.push({ startTs: cursor, endTs: item.startTs })
      }
      cursor = Math.max(cursor, item.endTs)
    })
    if (end - cursor >= 60 * 1000) {
      gaps.push({ startTs: cursor, endTs: end })
    }
  
    return gaps
  }
  
  function calendarTimelineEventDisplayParts(row = {}) {
    const type = eventTypeInfo(row).label
    const client = calendarTimelineReadableClientLabel(dashboardResolveClientLabel(row))
    const zone = String(dashboardResolveZoneLabel(row) || '').trim()
    const qr = String(zoneQrCodeFromRow(row) || '').trim()
    const markerType = calendarTimelineEventMarkerType(row)
    if (row?.calendarTimelineStatusFallbackSpan) {
      const place = ([client, zone]
        .map((value) => String(value ?? '').trim())
        .filter((value, placeIndex, list) => value && value !== '-' && list.indexOf(value) === placeIndex)
        .join(' / ') || (qr && qr !== '-' ? `QR ${qr}` : 'Aktywny status'))
      const duration = `${durationSecondsToHm(calendarTimelineEventDurationFromRow(row))}h`
      const location = calendarTimelineEventLocationLabel(row)
      const gps = calendarTimelineEventGpsCoords(row, markerType)
      return {
        type: 'Status',
        place,
        duration,
        status: 'W trakcie',
        meta: `Status aktywny · ${duration} · W trakcie`,
        isSystemStatus: false,
        markerType: '',
        location,
        gps,
      }
    }
    const systemAddedLabel = calendarTimelineSystemAddedMarkerLabel(row)
    const isSystemStatus = calendarTimelineEventIsSystemStatus(row)
    const markerMeta = markerType ? calendarTimelineMarkerMetaLabel(row, markerType) : ''
    const place = systemAddedLabel
      ? systemAddedLabel
      : markerType
      ? markerType
      : isSystemStatus
        ? 'Status dodany przez system'
        : ([client, zone]
            .map((value) => String(value ?? '').trim())
            .filter((value, placeIndex, list) => value && value !== '-' && list.indexOf(value) === placeIndex)
            .join(' / ') || (qr && qr !== '-' ? `QR ${qr}` : '-'))
    const duration = `${durationSecondsToHm(calendarTimelineEventDurationFromRow(row))}h`
    const status = calendarTimelineEventStatusLabel(normalizeEventStatus(row?.status, Boolean(row?.endAt ?? row?.dayEndAt)))
    const meta = markerType ? markerMeta || status : `${type} · ${duration} · ${status}`
    const location = calendarTimelineEventLocationLabel(row)
    const gps = calendarTimelineEventGpsCoords(row, markerType)
    return { type, place, duration, status, meta, isSystemStatus, markerType, location, gps }
  }
  
  function calendarTimelineEventRowHtml(row = {}, index = 0) {
    const parts = calendarTimelineEventDisplayParts(row)
    const locationHtml = parts.location
      ? `<span class="calendar-events-popup-location">Lokalizacja: ${escapeHtml(parts.location)}</span>`
      : ''
    const gpsHtml = parts.gps
      ? `
        <button class="calendar-events-popup-geo" type="button" data-calendar-event-geo data-rep-geo-lat="${escapeHtml(parts.gps.lat)}" data-rep-geo-lon="${escapeHtml(parts.gps.lon)}" title="Pokaż mapę GPS">
          Mapa GPS
        </button>
      `
      : ''
    return `
      <li class="calendar-events-popup-row">
        <button class="calendar-events-popup-edit" type="button" data-calendar-event-popup-edit="${index}" title="Edytuj zdarzenie">
          <span class="calendar-events-popup-time">${escapeHtml(calendarTimelineEventTimeRangeLabel(row))}</span>
          <span class="calendar-events-popup-main">${escapeHtml(parts.place)}</span>
          <span class="calendar-events-popup-meta">${escapeHtml(parts.meta)}</span>
          ${locationHtml}
        </button>
        ${gpsHtml}
      </li>
    `
  }
  
  function calendarTimelineEventBounds(row = {}) {
    let startTs = calendarTimelineEventTimestamp(row?.startAt ?? row?.dayStartAt)
    let endTs = calendarTimelineEventTimestamp(row?.endAt ?? row?.dayEndAt)
    const durationSec = calendarTimelineEventDurationFromRow(row)
    if (startTs > 0 && endTs <= 0 && durationSec > 0) {
      endTs = startTs + durationSec * 1000
    }
    if (startTs <= 0 && endTs > 0 && durationSec > 0) {
      startTs = endTs - durationSec * 1000
    }
    if (startTs > 0 && endTs <= startTs) {
      endTs = startTs + Math.max(5 * 60 * 1000, Math.min(durationSec * 1000, 15 * 60 * 1000) || 5 * 60 * 1000)
    }
    if (startTs <= 0 || endTs <= startTs) {
      return null
    }
    return { startTs, endTs }
  }
  
  function calendarTimelineEventIsDayShellItem(item = {}, items = [], rangeStart = 0, rangeEnd = 0) {
    const row = item?.row ?? {}
    const coversFullRange =
      Math.abs(Number(item?.startTs || 0) - Number(rangeStart || 0)) <= 1000 &&
      Math.abs(Number(item?.endTs || 0) - Number(rangeEnd || 0)) <= 1000
    if (!coversFullRange) {
      return false
    }
  
    const hasNestedDetails = (Array.isArray(items) ? items : []).some((candidate) => {
      if (!candidate || candidate === item || candidate.parts?.markerType || candidate.parts?.isSystemStatus) {
        return false
      }
      return candidate.startTs > item.startTs + 1000 || candidate.endTs < item.endTs - 1000
    })
    if (!hasNestedDetails) {
      return false
    }
  
    const sourceKind = String(row?.historySourceKind ?? '').trim().toLowerCase()
    const hasExplicitEvent = row?.hasExplicitEventId === true
    const hasScanEventLink = [row?.startEventId, row?.endEventId, row?.deviceId]
      .some((value) => String(value ?? '').trim())
    const hasDayShellHints = [row?.dayStartObject, row?.dayStopObject, row?.dayComment, row?.workdayUtilityRoomId]
      .some((value) => String(value ?? '').trim())
  
    return sourceKind === 'workday' || (!hasExplicitEvent && hasDayShellHints) || (hasDayShellHints && !hasScanEventLink)
  }
  
  function calendarTimelineEventsGraphData(rows = []) {
    const items = (Array.isArray(rows) ? rows : [])
      .map((row, index) => {
        const bounds = calendarTimelineEventBounds(row)
        if (!bounds) {
          return null
        }
        return {
          row,
          index,
          ...bounds,
          parts: calendarTimelineEventDisplayParts(row),
        }
      })
      .filter(Boolean)
      .sort((left, right) => left.startTs - right.startTs || left.endTs - right.endTs)
  
    if (!items.length) {
      return null
    }
  
    const rangeStart = Math.min(...items.map((item) => item.startTs))
    let rangeEnd = Math.max(...items.map((item) => item.endTs))
    if (calendarTimelineRowsShouldExtendToNow(rows)) {
      rangeEnd = Math.max(rangeEnd, Date.now())
    }
    const rangeMs = Math.max(60 * 1000, rangeEnd - rangeStart)
    const detailItems = items.filter((item) => {
      if (item.parts.markerType) {
        return false
      }
      if (item.parts.isSystemStatus) {
        return false
      }
      const coversFullRange = Math.abs(item.startTs - rangeStart) <= 1000 && Math.abs(item.endTs - rangeEnd) <= 1000
      if (calendarTimelineEventIsDayShellItem(item, items, rangeStart, rangeEnd)) {
        return false
      }
      return !(items.length > 1 && coversFullRange && item.parts.type === 'QR START')
    })
    const graphItems = detailItems
    const clientItems = calendarTimelineMergeGraphItemsByLabel(graphItems, calendarTimelineGraphClientLabel)
      .filter((item) => {
        const label = String(item.label ?? '').trim()
        const technicalLabel = label.replace(/^QR\s+/i, '')
        return Boolean(label && label !== '-' && !dashboardIsQrCodeLike(technicalLabel))
      })
    const zoneItems = graphItems.filter((item) => {
      const label = calendarTimelineGraphZoneLabel(item.row)
      const technicalLabel = String(label).replace(/^QR\s+/i, '')
      return Boolean(label && label !== '-' && !dashboardIsQrCodeLike(technicalLabel))
    })
    const inactiveItems = calendarTimelineInactiveGraphItems(zoneItems, rangeStart, rangeEnd)
    const totalSeconds = Math.max(1, Math.floor((rangeEnd - rangeStart) / 1000))
    const totalDuration = `${durationSecondsToHm(totalSeconds)}h`
  
    return {
      items,
      rangeStart,
      rangeEnd,
      rangeMs,
      clientItems,
      zoneItems,
      inactiveItems,
      totalDuration,
      totalSeconds,
    }
  }
  
  function calendarTimelineEventsGraphHtml(rows = []) {
    const graphData = calendarTimelineEventsGraphData(rows)
    if (!graphData) {
      return ''
    }
  
    const {
      rangeStart,
      rangeEnd,
      rangeMs,
      clientItems,
      zoneItems,
      inactiveItems,
      totalDuration,
    } = graphData
    const clientLaneCount = calendarTimelineAssignGraphLanes(clientItems)
    const zoneLaneCount = calendarTimelineAssignGraphLanes(zoneItems)
    const clientBarsHtml = clientItems.map((item) => {
      const left = Math.max(0, ((item.startTs - rangeStart) / rangeMs) * 100)
      const width = Math.max(2.4, ((item.endTs - item.startTs) / rangeMs) * 100)
      const label = item.label || calendarTimelineGraphClientLabel(item.row)
      const duration = `${durationSecondsToHm(Math.floor((item.endTs - item.startTs) / 1000))}h`
      const title = `${label} · ${duration}`
      const zoneStyle = calendarTimelineGraphZoneStyle(item.row, label)
      return `
        <button class="calendar-events-graph-bar calendar-events-graph-clientbar" type="button" data-calendar-event-popup-edit="${item.index}" style="--left:${left.toFixed(3)}%;--width:${Math.min(width, 100 - left).toFixed(3)}%;--lane:${item.lane};${zoneStyle}" title="${escapeHtml(title)}">
          <span>${escapeHtml(label)}</span>
        </button>
      `
    }).join('')
    const clientTrackHtml = clientBarsHtml
      ? `
        <div class="calendar-events-graph-track calendar-events-graph-client-track" style="--lane-count:${clientLaneCount};">
          ${clientBarsHtml}
        </div>
      `
      : ''
    const inactiveBarsHtml = inactiveItems.map((item) => {
      const left = Math.max(0, ((item.startTs - rangeStart) / rangeMs) * 100)
      const width = Math.max(1.2, ((item.endTs - item.startTs) / rangeMs) * 100)
      const duration = `${durationSecondsToHm(Math.floor((item.endTs - item.startTs) / 1000))}h`
      const title = `Brak aktywności · ${duration}`
      return `
        <div class="calendar-events-graph-bar calendar-events-graph-bar--inactive" style="--left:${left.toFixed(3)}%;--width:${Math.min(width, 100 - left).toFixed(3)}%;--lane:0;" title="${escapeHtml(title)}">
          <span>${escapeHtml('Brak aktywności')}</span>
        </div>
      `
    }).join('')
    const zoneBarsHtml = zoneItems.map((item) => {
      const left = Math.max(0, ((item.startTs - rangeStart) / rangeMs) * 100)
      const width = Math.max(2.4, ((item.endTs - item.startTs) / rangeMs) * 100)
      const label = calendarTimelineGraphZoneLabel(item.row)
      const title = `${calendarTimelineEventTimeRangeLabel(item.row)} · ${label} · ${item.parts.meta}`
      const toneClass = item.parts.isSystemStatus ? ' is-system' : ''
      const zoneStyle = calendarTimelineGraphZoneStyle(item.row, label)
      return `
        <button class="calendar-events-graph-bar${toneClass}" type="button" data-calendar-event-popup-edit="${item.index}" style="--left:${left.toFixed(3)}%;--width:${Math.min(width, 100 - left).toFixed(3)}%;--lane:${item.lane};${zoneStyle}" title="${escapeHtml(title)}">
          <span>${escapeHtml(label)}</span>
        </button>
      `
    }).join('')
  
    return `
      <div class="calendar-events-graph" aria-label="Graficzny przebieg zdarzeń">
        <div class="calendar-events-graph-axis">
          <span>${escapeHtml(calendarTimelineShortTimeLabel(new Date(rangeStart).toISOString()))}</span>
          <strong>${escapeHtml(totalDuration)}</strong>
          <span>${escapeHtml(calendarTimelineShortTimeLabel(new Date(rangeEnd).toISOString()))}</span>
        </div>
        <div class="calendar-events-graph-mainbar" title="Łączny zakres: ${escapeHtml(totalDuration)}">Łączny zakres · ${escapeHtml(totalDuration)}</div>
        ${clientTrackHtml}
        <div class="calendar-events-graph-track calendar-events-graph-zone-track" style="--lane-count:${zoneLaneCount};">
          ${inactiveBarsHtml}
          ${zoneBarsHtml}
        </div>
      </div>
    `
  }
  
  function calendarTimelinePiePercentLabel(value = 0) {
    const percent = Number(value)
    if (!Number.isFinite(percent) || percent <= 0) {
      return '0%'
    }
    if (percent >= 9.95) {
      return `${Math.round(percent)}%`
    }
    return `${percent.toFixed(1).replace('.', ',')}%`
  }
  
  function calendarTimelineConcreteZoneLabel(row = {}) {
    const zone = String(calendarTimelineGraphZoneLabel(row) || '').trim()
    const location = String(calendarTimelineEventLocationLabel(row) || '').trim()
    const qr = String(zoneQrCodeFromRow(row) || '').trim()
    const parts = [zone]
    if (location && location !== '-' && normalizeSearchText(location) !== normalizeSearchText(zone)) {
      parts.push(location)
    } else if (qr && qr !== '-') {
      parts.push(`QR ${qr}`)
    }
    return parts.filter(Boolean).join(' / ') || zone || '-'
  }
  
  function calendarTimelinePieData(rows = []) {
    const graphData = calendarTimelineEventsGraphData(rows)
    if (!graphData) {
      return null
    }
  
    const { zoneItems, inactiveItems, totalSeconds } = graphData
    const segmentsByKey = new Map()
    const addSegment = (key, label, seconds, color, item = null) => {
      const normalizedKey = String(key ?? '').trim()
      const normalizedLabel = String(label ?? '').trim()
      const duration = Number(seconds)
      if (!normalizedKey || !normalizedLabel || !Number.isFinite(duration) || duration <= 0) {
        return
      }
      const current = segmentsByKey.get(normalizedKey) || {
        key: normalizedKey,
        label: normalizedLabel,
        seconds: 0,
        color,
        items: [],
      }
      current.seconds += duration
      current.color = current.color || color
      if (item) {
        current.items.push(item)
      }
      segmentsByKey.set(normalizedKey, current)
    }
  
    zoneItems.forEach((item) => {
      const label = calendarTimelineGraphZoneLabel(item.row)
      const duration = Math.max(0, Math.floor((item.endTs - item.startTs) / 1000))
      addSegment(`zone:${normalizeSearchText(label) || label.toLowerCase()}`, label, duration, calendarTimelineGraphColorForKey(label).bg, item)
    })
  
    inactiveItems.forEach((item) => {
      const duration = Math.max(0, Math.floor((item.endTs - item.startTs) / 1000))
      addSegment('inactive', 'Brak aktywności', duration, '#cbd5e1', item)
    })
  
    const segments = Array.from(segmentsByKey.values())
      .filter((segment) => segment.seconds > 0)
      .sort((left, right) => {
        if (left.label === 'Brak aktywności') return 1
        if (right.label === 'Brak aktywności') return -1
        return right.seconds - left.seconds
      })
  
    if (!segments.length) {
      return null
    }
  
    let cursor = 0
    const gradientParts = segments.map((segment) => {
      const percent = Math.max(0, (segment.seconds / totalSeconds) * 100)
      const start = Math.min(100, cursor)
      const end = Math.min(100, cursor + percent)
      segment.startPercent = start
      segment.endPercent = Math.max(start, end)
      cursor += percent
      return `${segment.color} ${segment.startPercent.toFixed(3)}% ${segment.endPercent.toFixed(3)}%`
    })
    if (cursor < 100) {
      gradientParts.push(`#eef2f7 ${cursor.toFixed(3)}% 100%`)
    }
  
    return {
      graphData,
      segments,
      gradientParts,
      totalSeconds,
    }
  }
  
  function calendarTimelineEventsPieHtml(rows = []) {
    const pieData = calendarTimelinePieData(rows)
    if (!pieData) {
      return ''
    }
  
    const { segments, gradientParts, totalSeconds } = pieData
  
    const highlightGradientFor = (segment) => {
      const parts = []
      if (segment.startPercent > 0) {
        parts.push(`#d8e0ec 0% ${segment.startPercent.toFixed(3)}%`)
      }
      parts.push(`${segment.color} ${segment.startPercent.toFixed(3)}% ${segment.endPercent.toFixed(3)}%`)
      if (segment.endPercent < 100) {
        parts.push(`#d8e0ec ${segment.endPercent.toFixed(3)}% 100%`)
      }
      return parts.join(', ')
    }
  
    const legendHtml = segments.map((segment) => {
      const percent = (segment.seconds / totalSeconds) * 100
      const duration = `${durationSecondsToHm(segment.seconds)}h`
      const highlightGradient = highlightGradientFor(segment)
      return `
        <li tabindex="0" data-calendar-pie-highlight="${escapeHtml(highlightGradient)}" data-calendar-pie-key="${escapeHtml(segment.key)}">
          <span class="calendar-events-pie-dot" style="--pie-dot:${escapeHtml(segment.color)};"></span>
          <span class="calendar-events-pie-name">${escapeHtml(segment.label)}</span>
          <strong>${escapeHtml(calendarTimelinePiePercentLabel(percent))}</strong>
          <em>${escapeHtml(duration)}</em>
        </li>
      `
    }).join('')
    const chartSegments = segments.map((segment) => ({
      key: segment.key,
      label: segment.label,
      start: segment.startPercent,
      end: segment.endPercent,
    }))
  
    return `
      <aside class="calendar-events-popup-summary" aria-label="Udział stref i braku aktywności">
        <div class="calendar-events-pie-wrap">
          <div class="calendar-events-pie" data-calendar-pie-chart data-calendar-pie-segments="${escapeHtml(JSON.stringify(chartSegments))}" style="--pie:${escapeHtml(gradientParts.join(', '))};">
            <span><strong>100%</strong><em>Dzień</em></span>
          </div>
        </div>
        <ul class="calendar-events-pie-legend">${legendHtml}</ul>
      </aside>
    `
  }
  
  function calendarTimelinePieSegmentDetails(rows = [], segmentKey = '') {
    const key = String(segmentKey ?? '').trim()
    if (!key) {
      return null
    }
    const pieData = calendarTimelinePieData(rows)
    const segment = pieData?.segments?.find((item) => item.key === key)
    if (!pieData || !segment) {
      return null
    }
  
    const groups = new Map()
    ;(Array.isArray(segment.items) ? segment.items : []).forEach((item, index) => {
      const startTs = Number(item?.startTs || 0)
      const endTs = Number(item?.endTs || 0)
      const seconds = Math.max(0, Math.floor((endTs - startTs) / 1000))
      if (!seconds) {
        return
      }
      const label = key === 'inactive'
        ? `Brak aktywności ${calendarTimelineShortTimeLabel(new Date(startTs).toISOString())} - ${calendarTimelineShortTimeLabel(new Date(endTs).toISOString())}`
        : calendarTimelineConcreteZoneLabel(item.row)
      const groupKey = key === 'inactive' ? `inactive:${index}` : normalizeSearchText(label) || label.toLowerCase()
      const current = groups.get(groupKey) || {
        key: groupKey,
        label,
        seconds: 0,
        color: calendarTimelineGraphColorForKey(label).bg,
        ranges: [],
      }
      current.seconds += seconds
      current.ranges.push({
        startTs,
        endTs,
        label: `${calendarTimelineShortTimeLabel(new Date(startTs).toISOString())} - ${calendarTimelineShortTimeLabel(new Date(endTs).toISOString())}`,
      })
      groups.set(groupKey, current)
    })
  
    const detailSegments = Array.from(groups.values()).sort((left, right) => right.seconds - left.seconds)
    return {
      segment,
      detailSegments,
      totalSeconds: Math.max(1, segment.seconds),
      dayTotalSeconds: pieData.totalSeconds,
    }
  }
  
  function calendarTimelinePieDetailGradient(segments = [], totalSeconds = 1) {
    let cursor = 0
    const parts = (Array.isArray(segments) ? segments : []).map((segment) => {
      const percent = Math.max(0, (Number(segment?.seconds) / Math.max(1, Number(totalSeconds) || 1)) * 100)
      const start = Math.min(100, cursor)
      const end = Math.min(100, cursor + percent)
      cursor += percent
      return `${segment.color || '#cbd5e1'} ${start.toFixed(3)}% ${Math.max(start, end).toFixed(3)}%`
    })
    if (cursor < 100) {
      parts.push(`#eef2f7 ${cursor.toFixed(3)}% 100%`)
    }
    return parts.join(', ')
  }
  
  function calendarTimelinePieDetailHtml(details = {}) {
    const segment = details?.segment ?? {}
    const detailSegments = Array.isArray(details?.detailSegments) ? details.detailSegments : []
    const totalSeconds = Math.max(1, Number(details?.totalSeconds) || 1)
    const dayTotalSeconds = Math.max(1, Number(details?.dayTotalSeconds) || totalSeconds)
    const selectedDayPercent = calendarTimelinePiePercentLabel((totalSeconds / dayTotalSeconds) * 100)
    const gradient = calendarTimelinePieDetailGradient(detailSegments, totalSeconds)
    const listHtml = detailSegments.length
      ? detailSegments.map((item) => {
          const percent = calendarTimelinePiePercentLabel((item.seconds / totalSeconds) * 100)
          const duration = `${durationSecondsToHm(item.seconds)}h`
          const ranges = item.ranges?.map((range) => range.label).join(', ') || ''
          return `
            <li>
              <span class="calendar-events-pie-dot" style="--pie-dot:${escapeHtml(item.color)};"></span>
              <span class="calendar-events-pie-name" title="${escapeHtml(ranges)}">${escapeHtml(item.label)}</span>
              <strong>${escapeHtml(percent)}</strong>
              <em>${escapeHtml(duration)}</em>
            </li>
          `
        }).join('')
      : '<li class="calendar-events-pie-detail-empty">Brak szczegółów dla tej części wykresu.</li>'
  
    return `
      <div class="calendar-events-pie-detail-head">
        <div>
          <strong>${escapeHtml(segment.label || 'Szczegóły')}</strong>
          <span>Udział dnia: ${escapeHtml(selectedDayPercent)} · ${escapeHtml(durationSecondsToHm(totalSeconds))}h</span>
        </div>
        <button type="button" data-calendar-pie-detail-close aria-label="Zamknij">×</button>
      </div>
      <div class="calendar-events-pie-detail-body">
        <div class="calendar-events-pie calendar-events-pie--small" style="--pie:${escapeHtml(gradient)};">
          <span><strong>100%</strong><em>wybór</em></span>
        </div>
        <ul class="calendar-events-pie-legend calendar-events-pie-detail-list">${listHtml}</ul>
      </div>
    `
  }
  
  function calendarTimelineHidePieDetailPopup(popupId = '') {
    const node = document.getElementById('calendarTimelinePieDetailPopup')
    const expectedPopupId = String(popupId || '').trim()
    if (node && expectedPopupId && node.calendarPieDetailPopupId !== expectedPopupId) {
      return
    }
    if (node) {
      node.remove()
    }
  }
  
  function calendarTimelinePositionPieDetailPopup(anchor = null) {
    const node = document.getElementById('calendarTimelinePieDetailPopup')
    if (!(node instanceof HTMLElement)) {
      return
    }
    const anchorNode = anchor instanceof HTMLElement ? anchor : node.calendarPieDetailAnchor
    const parent = node.calendarPieDetailParent instanceof HTMLElement
      ? node.calendarPieDetailParent
      : anchorNode?.closest?.('.calendar-events-popup')
    if (parent instanceof HTMLElement && !document.body.contains(parent)) {
      calendarTimelineHidePieDetailPopup(node.calendarPieDetailPopupId)
      return
    }
    const rect = (anchorNode instanceof HTMLElement ? anchorNode : parent)?.getBoundingClientRect?.()
    const parentRect = parent?.getBoundingClientRect?.()
    if (!rect) {
      return
    }
  
    const width = Math.min(430, Math.max(300, window.innerWidth - 24))
    node.style.width = `${width}px`
    const preferredLeft = rect.right - width
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, preferredLeft))
    const height = node.getBoundingClientRect().height || node.scrollHeight || 180
    const preferredTop = (parentRect?.top ?? rect.top) - height - 8
    const fallbackTop = rect.bottom + 8
    const top = preferredTop >= 12
      ? preferredTop
      : Math.max(12, Math.min(window.innerHeight - height - 12, fallbackTop))
    node.style.left = `${left}px`
    node.style.top = `${top}px`
    const parentZIndex = Number.parseInt(parent?.style?.zIndex || '', 10)
    if (Number.isFinite(parentZIndex)) {
      node.style.zIndex = String(parentZIndex + 1)
    }
  }
  
  function calendarTimelineShowPieDetailPopup(segmentKey = '', anchor = null, sourcePopup = null) {
    const parent = sourcePopup instanceof HTMLElement
      ? sourcePopup
      : anchor?.closest?.('.calendar-events-popup')
    const rows = calendarTimelineEventsPopupRows(parent)
    const details = calendarTimelinePieSegmentDetails(rows, segmentKey)
    if (!details) {
      return
    }
  
    if (parent instanceof HTMLElement) {
      calendarTimelineBringEventsPopupToFront(parent)
    }
    let node = document.getElementById('calendarTimelinePieDetailPopup')
    if (!node) {
      node = document.createElement('div')
      node.id = 'calendarTimelinePieDetailPopup'
      node.className = 'calendar-events-pie-detail-popup'
      node.setAttribute('role', 'dialog')
      node.setAttribute('aria-label', 'Szczegóły wybranej części wykresu')
      document.body.appendChild(node)
    }
    node.calendarPieDetailAnchor = anchor instanceof HTMLElement ? anchor : null
    node.calendarPieDetailParent = parent instanceof HTMLElement ? parent : null
    node.calendarPieDetailPopupId = calendarTimelineEventsPopupId(parent)
    node.innerHTML = calendarTimelinePieDetailHtml(details)
    node.onclick = (event) => {
      const closeButton = event.target?.closest?.('[data-calendar-pie-detail-close]')
      if (closeButton) {
        event.preventDefault()
        calendarTimelineHidePieDetailPopup()
      }
    }
    calendarTimelinePositionPieDetailPopup(anchor)
  }
  
  function calendarTimelinePieKeyFromChartClick(chart, event) {
    if (!(chart instanceof HTMLElement)) {
      return ''
    }
    const raw = String(chart.getAttribute('data-calendar-pie-segments') ?? '').trim()
    if (!raw) {
      return ''
    }
    let segments = []
    try {
      segments = JSON.parse(raw)
    } catch {
      return ''
    }
    if (!Array.isArray(segments) || !segments.length) {
      return ''
    }
  
    const rect = chart.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const dx = Number(event.clientX) - centerX
    const dy = Number(event.clientY) - centerY
    const distance = Math.sqrt(dx * dx + dy * dy)
    if (distance < rect.width * 0.22 || distance > rect.width * 0.56) {
      return ''
    }
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI
    const percent = ((angle + 90 + 360) % 360) / 360 * 100
    const segment = segments.find((item) => percent >= Number(item.start) && percent <= Number(item.end)) || segments[segments.length - 1]
    return String(segment?.key ?? '').trim()
  }
  
  function calendarTimelinePositionEventsPopup(node, anchor) {
    if (!(node instanceof HTMLElement) || !(anchor instanceof HTMLElement)) {
      return
    }
    const rect = anchor.getBoundingClientRect()
    const width = Math.min(760, Math.max(280, window.innerWidth - 24))
    node.style.width = `${width}px`
    const measuredHeight = node.getBoundingClientRect().height || node.scrollHeight || 180
    const popupHeight = Math.min(Math.max(180, measuredHeight), Math.max(180, window.innerHeight - 24))
    const top = Math.min(window.innerHeight - popupHeight - 12, rect.bottom + 8)
    calendarTimelineSetEventsPopupPosition(node, rect.left, top)
  }
  
  function calendarTimelineSizeEventsPopup(node, rowCount = 0, options = {}) {
    if (!(node instanceof HTMLElement)) {
      return
    }
  
    const loading = options?.loading === true
    const error = String(options?.error ?? '').trim()
    const rows = Number(rowCount)
    const visibleRows = loading || error
      ? 1
      : Math.max(1, Math.min(15, Number.isFinite(rows) && rows > 0 ? Math.ceil(rows) : 1))
  
    node.style.setProperty('--calendar-events-visible-rows', String(visibleRows))
  
    const headHeight = node.querySelector('.calendar-events-popup-head')?.getBoundingClientRect?.().height || 0
    const graphHeight = node.querySelector('.calendar-events-graph')?.getBoundingClientRect?.().height || 0
    const summary = node.querySelector('.calendar-events-popup-summary')
    const summaryHeight = summary?.scrollHeight || summary?.getBoundingClientRect?.().height || 0
    const popupChrome = Math.ceil(headHeight + graphHeight + 2)
    const viewportBudget = Math.max(180, window.innerHeight - 24 - popupChrome)
    const listHeight = visibleRows * 64 + 12
    const desiredBodyHeight = Math.max(listHeight, summaryHeight)
    node.style.setProperty('--calendar-events-body-max-height', `${Math.floor(Math.min(desiredBodyHeight, viewportBudget))}px`)
  }
  
  function calendarTimelineRenderEventsPopup(node, context = {}, rows = [], options = {}) {
    const loading = options?.loading === true
    const error = String(options?.error ?? '').trim()
    const workerName = String(context?.resource?.name ?? 'Pracownik').trim()
    const graphHtml = !loading && !error && rows.length ? calendarTimelineEventsGraphHtml(rows) : ''
    const pieHtml = !loading && !error && rows.length ? calendarTimelineEventsPieHtml(rows) : ''
    const rowsHtml = loading
      ? '<li class="calendar-events-popup-empty">Pobieram zdarzenia...</li>'
      : error
        ? `<li class="calendar-events-popup-empty is-error">${escapeHtml(error)}</li>`
        : rows.length
          ? rows.map((row, index) => calendarTimelineEventRowHtml(row, index)).join('')
          : '<li class="calendar-events-popup-empty">Brak zdarzeń dla tego pracownika w tym dniu.</li>'
    node.innerHTML = `
      <div class="calendar-events-popup-head">
        <div>
          <strong>${escapeHtml(workerName)}</strong>
          <span>${escapeHtml(calendarTimelineDateLabel(context?.dateYmd))}</span>
        </div>
        <button type="button" data-calendar-events-popup-close aria-label="Zamknij">×</button>
      </div>
      ${graphHtml}
      <div class="calendar-events-popup-body${pieHtml ? ' has-summary' : ''}">
        <ul class="calendar-events-popup-list">${rowsHtml}</ul>
        ${pieHtml}
      </div>
    `
    calendarTimelineSizeEventsPopup(node, rows.length, options)
  }
  
  function calendarTimelineSetPieHighlight(rowNode = null, highlighted = false) {
    const summary = rowNode?.closest?.('.calendar-events-popup-summary')
    const pie = summary?.querySelector?.('[data-calendar-pie-chart]')
    if (!(pie instanceof HTMLElement)) {
      return
    }
  
    const gradient = String(rowNode?.getAttribute?.('data-calendar-pie-highlight') ?? '').trim()
    if (highlighted && gradient) {
      pie.style.setProperty('--pie-active', gradient)
      pie.classList.add('is-highlighted')
      rowNode.classList.add('is-highlighted')
      return
    }
  
    pie.classList.remove('is-highlighted')
    pie.style.removeProperty('--pie-active')
    summary?.querySelectorAll?.('.calendar-events-pie-legend li.is-highlighted').forEach((node) => {
      node.classList.remove('is-highlighted')
    })
  }
  
  async function calendarTimelineShowWorkerDayEventsPopup(bar) {
    const context = calendarTimelineBarContextFromElement(bar)
    if (!context) {
      showTransientNotice('Ten pasek nie ma przypisanego pracownika.', 'error')
      return
    }
  
    calendarTimelineClearEventsPopupTimer()
    const popupId = calendarTimelineNextEventsPopupId()
    const node = document.createElement('div')
    node.className = 'calendar-events-popup'
    node.setAttribute('data-calendar-events-popup-id', popupId)
    node.setAttribute('role', 'dialog')
    node.setAttribute('aria-label', 'Zdarzenia pracownika w dniu')
    calendarTimelineEventsPopupRegistry.set(popupId, {
      node,
      context,
      rows: [],
      dragged: false,
    })
    document.body.appendChild(node)
    calendarTimelineBindEventsPopupNode(node)
    calendarTimelineRenderEventsPopup(node, context, [], { loading: true })
    calendarTimelineBringEventsPopupToFront(node)
    calendarTimelinePositionEventsPopup(node, context.bar)
  
    try {
      const rows = await calendarTimelineFetchWorkerDayEvents(context.resource, context.dateYmd, context)
      const popupState = calendarTimelineEventsPopupRegistry.get(popupId)
      if (!popupState || !document.body.contains(node)) {
        return
      }
      popupState.rows = rows
      calendarTimelineRenderEventsPopup(node, context, rows)
      if (!popupState.dragged && context.bar instanceof HTMLElement && document.body.contains(context.bar)) {
        calendarTimelinePositionEventsPopup(node, context.bar)
      } else {
        calendarTimelineClampEventsPopupToViewport(node)
      }
    } catch (error) {
      const popupState = calendarTimelineEventsPopupRegistry.get(popupId)
      if (!popupState || !document.body.contains(node)) {
        return
      }
      popupState.rows = []
      const message = error instanceof Error ? error.message : 'Nie udało się pobrać zdarzeń.'
      calendarTimelineRenderEventsPopup(node, context, [], { error: message })
      if (!popupState.dragged && context.bar instanceof HTMLElement && document.body.contains(context.bar)) {
        calendarTimelinePositionEventsPopup(node, context.bar)
      } else {
        calendarTimelineClampEventsPopupToViewport(node)
      }
    }
  }
  
  async function calendarTimelineOpenRealEventEditorFromBar(bar) {
    const context = calendarTimelineBarContextFromElement(bar)
    if (!context) {
      showTransientNotice('Nie znaleziono pracownika dla tego zdarzenia.', 'error')
      return
    }
    try {
      const rows = await calendarTimelineFetchWorkerDayEvents(context.resource, context.dateYmd, context)
      const row = calendarTimelineFindEventRowForBar(rows, context)
      if (!row) {
        showTransientNotice('Nie znaleziono zdarzenia do edycji.', 'error')
        return
      }
      await openEventEditor(row)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udało się otworzyć edycji zdarzenia.'
      showTransientNotice(message, 'error')
    }
  }
  
  function calendarTimelineOrderStatus(order = {}, resources = []) {
    if (
      typeof ordersOrderHasInactiveOnlyWorkerAssignments === 'function' &&
      ordersOrderHasInactiveOnlyWorkerAssignments(order, resources)
    ) {
      return { kind: 'planned', label: 'Zaplanowane', alert: null }
    }
    const row = Number(order?.row)
    const resource = Number.isInteger(row) ? resources[row] ?? null : null
    const planned = calendarTimelineOrderPlannedBounds(order)
    if (!planned) {
      return { kind: 'planned', label: 'Zaplanowane', alert: null }
    }
  
    const actual = calendarTimelineOrderActualState(order, resource, planned)
    if (order?.systemClosed && actual.startTs > 0 && actual.endTs > 0) {
      return { kind: 'system-ended', label: 'Zakończone przez system', alert: null }
    }
    const completed = Boolean(order?.completed) || calendarTimelineOrderCompletedFromStatus(order) || actual.endTs > 0
    const startDelay = calendarTimelineDelayMinutes(actual.startTs, planned.startTs)
    const endDelay = calendarTimelineDelayMinutes(actual.endTs, planned.endTs)
  
    if (actual.startTs > 0) {
      if (completed) {
        if (startDelay > 0) {
          return {
            kind: 'started-late-ended',
            label: 'Start opóźniony',
            alert: calendarTimelineStatusAlertFor('started-late-ended', order, resource, planned, actual, { startDelay, endDelay }),
          }
        }
        if (endDelay > 0) {
          return {
            kind: 'completed-late',
            label: 'Zakończone z opóźnieniem',
            alert: calendarTimelineStatusAlertFor('completed-late', order, resource, planned, actual, { endDelay }),
          }
        }
        return { kind: 'completed', label: 'Zakończone', alert: null }
      }
  
      if (startDelay > 0) {
        return {
          kind: 'started-late',
          label: 'Rozpoczęte z opóźnieniem',
          alert: calendarTimelineStatusAlertFor('started-late', order, resource, planned, actual, { startDelay }),
        }
      }
      return { kind: 'running', label: 'Realizowane', alert: null }
    }
  
    const now = Date.now()
    if (
      isScheduleStartOverdue({
        plannedStartTs: planned.startTs,
        actualStartTs: actual.startTs,
        completed,
        nowTs: now,
      })
    ) {
      return {
        kind: 'missing-start',
        label: 'Brak startu',
        alert: calendarTimelineStatusAlertFor('missing-start', order, resource, planned, actual),
      }
    }
  
    if (!completed && planned.startTs >= now && planned.startTs - now <= 60 * 60 * 1000) {
      return { kind: 'upcoming', label: 'Start do 1h', alert: null }
    }
  
    return completed ? { kind: 'completed', label: 'Zakończone', alert: null } : { kind: 'planned', label: 'Zaplanowane', alert: null }
  }
  
  function calendarTimelineUniqueStatusAlerts(alerts = []) {
    const seen = new Set()
    return (Array.isArray(alerts) ? alerts : [])
      .filter((alert) => alert?.key)
      .filter((alert) => {
        const key = String(alert.key)
        if (seen.has(key)) {
          return false
        }
        seen.add(key)
        return true
      })
  }
  
  function calendarTimelineHideStatusAlert() {
    const node = document.getElementById('calendarTimelineStatusAlert')
    if (node) {
      node.remove()
    }
  }
  
  function calendarTimelineShowPendingStatusAlert() {
    const queueKey = 'calendar:timeline-status-alert'
    if (!(appState.calendarTimelineStatusAlertShownKeys instanceof Set)) {
      appState.calendarTimelineStatusAlertShownKeys = new Set()
    }
  
    const priority = {
      'missing-start': 1,
      'started-late-ended': 2,
      'completed-late': 3,
      'started-late': 4,
    }
    const alert = calendarTimelineUniqueStatusAlerts(appState.calendarTimelineStatusAlerts)
      .filter((item) => !appState.calendarTimelineStatusAlertShownKeys.has(String(item.key)))
      .sort((left, right) => (priority[left.kind] || 99) - (priority[right.kind] || 99))[0]
  
    if (!alert) {
      if (typeof clearPortalDeferredNotification === 'function') {
        clearPortalDeferredNotification(queueKey)
      }
      calendarTimelineHideStatusAlert()
      return
    }

    const busy =
      typeof isPortalInteractionBusy === 'function'
        ? isPortalInteractionBusy()
        : typeof isBlockingModalOpen === 'function' && isBlockingModalOpen()
    if (appState.currentRoute !== 'calendar' || document.visibilityState !== 'visible' || busy) {
      calendarTimelineHideStatusAlert()
      if (typeof queuePortalDeferredNotification === 'function') {
        queuePortalDeferredNotification(queueKey, calendarTimelineShowPendingStatusAlert, { requiredRoute: 'calendar' })
      }
      return
    }
  
    calendarTimelineHideStatusAlert()
    const node = document.createElement('div')
    node.id = 'calendarTimelineStatusAlert'
    node.className = `dash-schedule-alert calendar-timeline-status-alert calendar-timeline-status-alert--${escapeHtml(alert.kind)}`
    node.setAttribute('role', 'alertdialog')
    node.setAttribute('aria-modal', 'true')
    node.setAttribute('aria-labelledby', 'calendarTimelineStatusAlertTitle')
    const rows = Array.isArray(alert.rows) && alert.rows.length ? alert.rows : []
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
          <div class="dash-schedule-alert-signal" aria-hidden="true">${escapeHtml(alert.signal || 'INFO')}</div>
          <div class="dash-schedule-alert-title" id="calendarTimelineStatusAlertTitle">${escapeHtml(alert.title || 'Status zlecenia')}</div>
          <div class="dash-schedule-alert-text">${escapeHtml(alert.text || '')}</div>
        </div>
      </div>
      <div class="dash-schedule-alert-list-wrap">
        <div class="dash-schedule-alert-list-title">Szczegóły:</div>
        <ul class="dash-schedule-alert-list">
          ${rows
            .map(
              (row) => `
                <li>
                  <span class="dash-schedule-alert-person">${escapeHtml(row?.person || 'Zlecenie')}</span>
                  <span class="dash-schedule-alert-meta">${escapeHtml(row?.meta || '-')}</span>
                  <span class="dash-schedule-alert-status">${escapeHtml(row?.status || '')}</span>
                </li>
              `,
            )
            .join('')}
        </ul>
      </div>
      <div class="dash-schedule-alert-actions">
        <button type="button" class="btn2 primary" data-alert-action="ok">OK</button>
      </div>
    `
    node.addEventListener('click', (event) => {
      const button = event.target?.closest?.('[data-alert-action]')
      if (!button) {
        return
      }
      appState.calendarTimelineStatusAlertShownKeys.add(String(alert.key))
      if (typeof clearPortalDeferredNotification === 'function') {
        clearPortalDeferredNotification(queueKey)
      }
      calendarTimelineHideStatusAlert()
    })
    document.body.appendChild(node)
  }
  
  function calendarTimelineOrderRowsAfterMove(order = {}, rowIndex, sourceRowIndex = null, resources = calendarTimelineResources()) {
    const nextRow = Number(rowIndex)
    if (!Number.isInteger(nextRow) || nextRow < 0) {
      return []
    }
    const currentRows = ordersNormalizeOrderRows(order, resources)
    const sourceRow = Number(sourceRowIndex)
    let rows = [nextRow]
    if (currentRows.length > 1) {
      rows =
        Number.isInteger(sourceRow) && currentRows.includes(sourceRow)
          ? currentRows.map((row) => (row === sourceRow ? nextRow : row))
          : currentRows.includes(nextRow)
            ? currentRows
            : [...currentRows, nextRow]
    }
  
    return rows.filter((row, index, list) => Number.isInteger(row) && row >= 0 && list.indexOf(row) === index)
  }
  
  function calendarTimelineDropTargetFromEvent(event) {
    const x = Number(event?.clientX)
    const y = Number(event?.clientY)
    const stage = document.getElementById('calendarPrototypeTimeline')
    const scopedTarget = (node) => {
      const target = node?.closest?.('[data-calendar-timeline-row]')
      return target instanceof HTMLElement && (!stage || stage.contains(target)) ? target : null
    }
    const directSlotTarget = event?.target?.closest?.('[data-calendar-timeline-row][data-calendar-timeline-slot]')
    if (directSlotTarget instanceof HTMLElement && (!stage || stage.contains(directSlotTarget))) {
      return directSlotTarget
    }
  
    if (Number.isFinite(x) && Number.isFinite(y) && typeof document.elementsFromPoint === 'function') {
      const elements = document.elementsFromPoint(x, y)
      const slotTarget = elements
        .map((node) => node?.closest?.('[data-calendar-timeline-row][data-calendar-timeline-slot]'))
        .find((node) => node instanceof HTMLElement && (!stage || stage.contains(node)))
      if (slotTarget) {
        return slotTarget
      }
  
      const rowTarget = elements.map(scopedTarget).find(Boolean)
      if (rowTarget) {
        return rowTarget
      }
    }
  
    return scopedTarget(event?.target)
  }

  function calendarTimelineDropSlotFromClientX(clientX) {
    const x = Number(clientX)
    const grid = document.querySelector('#calendarPrototypeTimeline .fw-timeline-grid')
    if (!(grid instanceof HTMLElement) || !Number.isFinite(x)) {
      return null
    }

    const totalSlots = Number(grid.getAttribute('data-calendar-timeline-total-slots'))
    if (!Number.isInteger(totalSlots) || totalSlots <= 0) {
      return null
    }

    const resourceWidth = Number(grid.getAttribute('data-calendar-timeline-resource-width')) || 260
    const styles = window.getComputedStyle(grid)
    const slotWidthFromCss = Number.parseFloat(styles.getPropertyValue('--slot-width'))
    const slotWidth = Number.isFinite(slotWidthFromCss) && slotWidthFromCss > 0
      ? slotWidthFromCss
      : (grid.scrollWidth - resourceWidth) / totalSlots
    if (!Number.isFinite(slotWidth) || slotWidth <= 0) {
      return null
    }

    const rect = grid.getBoundingClientRect()
    const offset = x - rect.left - resourceWidth
    if (offset < 0) {
      return null
    }

    return Math.max(0, Math.min(totalSlots - 1, Math.floor(offset / slotWidth)))
  }

  function calendarTimelineDropInfoFromEvent(event) {
    const target = calendarTimelineDropTargetFromEvent(event)
    const info = calendarTimelineDropInfoFromTarget(target)
    if (!info) {
      return { target: null, info: null }
    }
    const slotIndex = calendarTimelineDropSlotFromClientX(event?.clientX)
    return {
      target,
      info: {
        ...info,
        slotIndex: Number.isInteger(slotIndex) ? slotIndex : info.slotIndex,
      },
    }
  }

  function calendarTimelineDropInfoFromTarget(target) {
    if (!(target instanceof HTMLElement)) {
      return null
    }
    const rowIndex = Number(target.getAttribute('data-calendar-timeline-row'))
    if (!Number.isInteger(rowIndex)) {
      return null
    }
    const slotValue = target.getAttribute('data-calendar-timeline-slot')
    const slotIndex = slotValue == null ? null : Number(slotValue)
    return {
      rowIndex,
      slotIndex: Number.isInteger(slotIndex) ? slotIndex : null,
    }
  }
  
  function calendarTimelineDropInfoFromState() {
    const rowIndex = Number(appState.calendarTimelineDragTargetRow)
    if (!Number.isInteger(rowIndex)) {
      return null
    }
    const slotIndex = Number(appState.calendarTimelineDragTargetSlot)
    return {
      rowIndex,
      slotIndex: Number.isInteger(slotIndex) ? slotIndex : null,
    }
  }
  
  function calendarTimelineHighlightedDropInfo() {
    return calendarTimelineDropInfoFromTarget(
      document.querySelector('#view-calendar .is-timeline-drop-target, #view-calendar .is-timeline-drop-invalid'),
    )
  }
  
  function calendarTimelineResolveDropInfo(event = null) {
    const eventInfo = event ? calendarTimelineDropInfoFromEvent(event).info : null
    return (
      eventInfo ||
      calendarTimelineDropInfoFromState() ||
      calendarTimelineHighlightedDropInfo()
    )
  }
  
  function calendarTimelineRememberDropInfo(info = null) {
    if (!info) {
      appState.calendarTimelineDragTargetRow = null
      appState.calendarTimelineDragTargetSlot = null
      return
    }
    appState.calendarTimelineDragTargetRow = info.rowIndex
    appState.calendarTimelineDragTargetSlot = info.slotIndex
  }
  
  function calendarTimelineResetDragState() {
    appState.calendarTimelineDragOrderId = ''
    appState.calendarTimelineDragKind = ''
    appState.calendarTimelineDragSourceRow = null
    appState.calendarTimelineDragSourceOrderId = ''
    appState.calendarTimelineDragOccurrenceDate = ''
    appState.calendarTimelineDragWorkSlotKey = ''
    appState.calendarTimelineDragWorkSlotId = ''
    appState.calendarTimelineDragServiceBlockId = ''
    appState.calendarTimelineDragAllocationIdentity = ''
    appState.calendarTimelineDragRecurringSeries = false
    appState.calendarTimelineDragTargetRow = null
    appState.calendarTimelineDragTargetSlot = null
    appState.calendarTimelineDropHandled = false
    appState.calendarTimelineDragResources = []
    appState.calendarTimelineDragConflictKey = ''
    appState.calendarTimelineDragConflictValue = false
    appState.calendarTimelineDragHoverKey = ''
    appState.calendarTimelineDragHoverInvalid = false
    appState.calendarTimelineDragHoverNode = null
    appState.calendarTimelineDragBufferContextKey = ''
    appState.calendarTimelineDragBufferContext = null
    appState.calendarTimelineDragOccupiedIntervals = new Map()
  }
  
  function calendarTimelineHandleMoveResult(moveResult) {
    if (moveResult?.pending) {
      return
    }
    if (moveResult?.moved) {
      showTransientNotice('Zlecenie przypięte do nowego miejsca.', 'success')
      return
    }
    if (moveResult?.conflicts?.length) {
      calendarTimelineShowConflictDialog(moveResult.conflicts, moveResult.candidate)
      return
    }
    if (moveResult?.errorMessage) {
      showTransientNotice(moveResult.errorMessage, 'error')
      return
    }
    showTransientNotice('Nie można przenieść zlecenia.', 'error')
  }
  
  function calendarTimelineWorkAllocationMovedToRow(item = {}, nextRow = 0, resources = calendarTimelineResources(), timing = {}) {
    const assignment = ordersWorkerAssignmentsFromRows([nextRow], resources)[0] ?? {}
    const targetIsBuffer = calendarTimelineRowAllowsOverlap(nextRow, resources)
    const fallbackLabel = String(resources[nextRow]?.name ?? item?.label ?? item?.name ?? '').trim()
    const label = assignment.name || fallbackLabel
    const startTime = ordersNormalizeTimeField(timing?.startTime ?? item?.startTime ?? item?.planStartTime, '')
    const endTime = ordersNormalizeTimeField(timing?.endTime ?? item?.endTime ?? item?.planEndTime, '')
    const dateYmd = ordersNormalizeDateField(timing?.dateYmd ?? item?.dateYmd ?? item?.planDateYmd ?? item?.startDateYmd, '')
    const endDateYmd = ordersNormalizeDateField(timing?.endDateYmd ?? item?.endDateYmd ?? item?.planEndDateYmd, dateYmd)
    const minutes = Math.max(0, Math.round(Number(timing?.minutes ?? item?.minutes ?? item?.workMinutes ?? item?.durationMinutes) || 0))
    return {
      ...item,
      key: targetIsBuffer
        ? String(item?.key ?? `buffer:${nextRow + 1}`).trim()
        : String(assignment.key ?? assignment.workerId ?? assignment.workerLogin ?? '').trim(),
      row: nextRow,
      type: targetIsBuffer ? 'buffer' : 'worker',
      label,
      name: label,
      workerId: targetIsBuffer ? '' : String(assignment.workerId ?? '').trim(),
      workerLogin: targetIsBuffer ? '' : String(assignment.workerLogin ?? '').trim(),
      workerKey: targetIsBuffer ? '' : String(assignment.key ?? '').trim(),
      ...(minutes > 0 ? { minutes } : {}),
      ...(dateYmd ? { dateYmd, planDateYmd: dateYmd, startDateYmd: dateYmd } : {}),
      ...(endDateYmd ? { endDateYmd, planEndDateYmd: endDateYmd } : {}),
      ...(startTime ? { startTime, planStartTime: startTime } : {}),
      ...(endTime ? { endTime, planEndTime: endTime } : {}),
    }
  }

  function calendarTimelineOrderWorkAllocations(order = {}) {
    const serviceBlockAllocations = calendarTimelineServiceBlockAllocations(order)
    const orderAllocations = Array.isArray(order.workAllocations) && order.workAllocations.length
      ? order.workAllocations
      : Array.isArray(order.workerAllocations) && order.workerAllocations.length
        ? order.workerAllocations
        : []
    return orderAllocations.length
      ? orderAllocations
      : serviceBlockAllocations.length
        ? serviceBlockAllocations
        : []
  }

  function calendarTimelineAllocationIdentity(allocation = {}, fallbackIndex = null) {
    const blockId = String(
      allocation?.serviceBlockId ??
        allocation?.service_block_id ??
        allocation?.teamId ??
        allocation?.team_id ??
        '',
    ).trim()
    const allocationId = String(
      allocation?.allocationId ??
        allocation?.allocation_id ??
        allocation?.slotId ??
        allocation?.slot_id ??
        allocation?.workSlotId ??
        allocation?.work_slot_id ??
        allocation?.id ??
        '',
    ).trim()
    const workSlotKey = String(allocation?.workSlotKey ?? allocation?.work_slot_key ?? '').trim()
    const key = String(allocation?.key ?? '').trim()
    if (blockId && allocationId) return `block:${blockId}:allocation:${allocationId}`
    if (blockId && workSlotKey) return `block:${blockId}:workslot:${workSlotKey}`
    if (allocationId) return `allocation:${allocationId}`
    if (workSlotKey) return `workslot:${workSlotKey}`
    if (blockId && key) return `block:${blockId}:key:${key}`
    if (key) return `key:${key}`
    return Number.isInteger(fallbackIndex) ? `index:${fallbackIndex}` : ''
  }

  function calendarTimelineAllocationIndex(allocations = [], sourceRowIndex = null, options = {}) {
    if (!Array.isArray(allocations) || !allocations.length) return -1
    const uniqueIndex = (predicate) => {
      const matches = allocations
        .map((item, index) => (predicate(item, index) ? index : -1))
        .filter((index) => index >= 0)
      return matches.length === 1 ? matches[0] : -1
    }
    const identity = String(options?.allocationIdentity ?? options?.workSlotIdentity ?? '').trim()
    if (identity) {
      const identityIndex = uniqueIndex((item, index) => calendarTimelineAllocationIdentity(item, index) === identity)
      if (identityIndex >= 0) return identityIndex
    }
    const blockId = String(options?.serviceBlockId ?? '').trim()
    const slotId = String(options?.workSlotId ?? options?.slotId ?? '').trim()
    if (blockId && slotId) {
      const blockSlotIndex = uniqueIndex((item) => (
        String(item?.serviceBlockId ?? item?.teamId ?? '').trim() === blockId &&
        String(item?.slotId ?? item?.id ?? '').trim() === slotId
      ))
      if (blockSlotIndex >= 0) return blockSlotIndex
    }
    const workSlotKey = String(options?.workSlotKey ?? '').trim()
    if (workSlotKey) {
      const keyIndex = uniqueIndex((item) => String(item?.key ?? '').trim() === workSlotKey)
      if (keyIndex >= 0) return keyIndex
    }
    const sourceRow = Number(sourceRowIndex)
    if (Number.isInteger(sourceRow)) {
      const rowIndex = uniqueIndex((item) => Number(item?.row) === sourceRow)
      if (rowIndex >= 0) return rowIndex
    }
    return allocations.length === 1 ? 0 : -1
  }

  function calendarTimelineServiceBlocksWithAllocations(serviceBlocks = [], allocations = []) {
    if (!Array.isArray(serviceBlocks) || !serviceBlocks.length || !Array.isArray(allocations) || !allocations.length) {
      return serviceBlocks
    }
    const byKey = new Map()
    const byBlockSlot = new Map()
    allocations.forEach((allocation) => {
      const key = String(allocation?.key ?? '').trim()
      const blockId = String(allocation?.serviceBlockId ?? allocation?.teamId ?? '').trim()
      const slotId = String(allocation?.slotId ?? '').trim()
      if (key) byKey.set(key, allocation)
      if (blockId && slotId) byBlockSlot.set(`${blockId}::${slotId}`, allocation)
    })
    return serviceBlocks.map((block, blockIndex) => {
      const blockId = String(block?.id ?? `service-${blockIndex + 1}`).trim()
      const slots = Array.isArray(block?.slots) ? block.slots : []
      const nextSlots = slots.map((slot, slotIndex) => {
        const slotId = String(slot?.slotId ?? slot?.id ?? `slot-${slotIndex + 1}`).trim()
        const slotKey = String(slot?.key ?? `slot:${blockId}:${slotId}`).trim()
        const allocation = byBlockSlot.get(`${blockId}::${slotId}`) || byKey.get(slotKey) || null
        if (!allocation) {
          return slot
        }
        return {
          ...slot,
          id: slot.id || slotId,
          slotId,
          key: allocation.key || slotKey,
          row: allocation.row,
          type: allocation.type === 'worker' ? 'worker' : 'unassigned',
          label: allocation.label || slot.label,
          name: allocation.name || slot.name || allocation.label || slot.label,
          workerId: allocation.workerId || '',
          workerLogin: allocation.workerLogin || '',
          workerKey: allocation.workerKey || '',
          minutes: allocation.minutes ?? slot.minutes,
          dateYmd: allocation.dateYmd || slot.dateYmd,
          planDateYmd: allocation.planDateYmd || allocation.dateYmd || slot.planDateYmd,
          startDateYmd: allocation.startDateYmd || allocation.dateYmd || slot.startDateYmd,
          endDateYmd: allocation.endDateYmd || slot.endDateYmd,
          planEndDateYmd: allocation.planEndDateYmd || allocation.endDateYmd || slot.planEndDateYmd,
          startTime: allocation.startTime || slot.startTime,
          endTime: allocation.endTime || slot.endTime,
          planStartTime: allocation.planStartTime || allocation.startTime || slot.planStartTime,
          planEndTime: allocation.planEndTime || allocation.endTime || slot.planEndTime,
        }
      })
      const blockAllocations = allocations.filter((allocation) => {
        const allocationBlockId = String(allocation?.serviceBlockId ?? allocation?.teamId ?? '').trim()
        return allocationBlockId && allocationBlockId === blockId
      })
      return {
        ...block,
        slots: nextSlots,
        workAllocations: blockAllocations.length ? blockAllocations : block.workAllocations,
        workerAllocations: blockAllocations.length ? blockAllocations : block.workerAllocations,
      }
    })
  }

  function calendarTimelineRealAssignedRowsForOrder(order = {}, resources = calendarTimelineResources()) {
    const rows = []
    calendarTimelineOrderWorkAllocations(order).forEach((item) => {
      const row = Number(item?.row)
      if (Number.isInteger(row) && row >= 0 && !calendarTimelineRowAllowsOverlap(row, resources)) {
        rows.push(row)
      }
    })
    if (!rows.length) {
      ordersNormalizeOrderRows(order, resources).forEach((row) => {
        if (Number.isInteger(row) && row >= 0 && !calendarTimelineRowAllowsOverlap(row, resources)) {
          rows.push(row)
        }
      })
    }
    return rows.filter((row, index, list) => list.indexOf(row) === index)
  }

  function calendarTimelineOrderAssignedPersonCount(order = {}, resources = calendarTimelineResources()) {
    return calendarTimelineRealAssignedRowsForOrder(order, resources).length
  }

  function calendarTimelineMoveBaseOrderForScope(orderId = '', options = {}) {
    const id = String(orderId ?? '').trim()
    const sourceOrderId = String(options?.sourceOrderId ?? '').trim()
    const occurrenceDateYmd = String(options?.occurrenceDateYmd ?? '').trim()
    const orders = ordersListSourceOrders()
    const directOrder = orders.find((order) => String(order?.id ?? '') === id) || null
    if (calendarTimelineIsMaterializedOverrideOrder(directOrder)) {
      return directOrder
    }
    const sourceOrder = sourceOrderId
      ? orders.find((order) => String(order?.id ?? '') === sourceOrderId) || calendarTimelineSourceOrderById(sourceOrderId)
      : null
    if (
      sourceOrder &&
      calendarTimelineOrderIsRecurring(sourceOrder) &&
      /^\d{4}-\d{2}-\d{2}$/.test(occurrenceDateYmd)
    ) {
      return calendarTimelineRecurringInstance(sourceOrder, occurrenceDateYmd, 0)
    }
    return directOrder || sourceOrder || null
  }

  function calendarTimelineMoveAssignmentScopeContext(orderId, rowIndex, slotIndex = null, sourceRowIndex = null, resources = calendarTimelineResources(), options = {}) {
    if (slotIndex == null || options?.assignmentEditScope === 'single' || options?.assignmentEditScope === 'all') {
      return null
    }
    const baseOrder = calendarTimelineMoveBaseOrderForScope(orderId, options)
    if (!baseOrder || calendarTimelineOrderAssignedPersonCount(baseOrder, resources) <= 1) {
      return null
    }
    const nextRow = Number(rowIndex)
    const sourceRow = Number(sourceRowIndex)
    const targetWorker = Number.isInteger(nextRow) ? String(resources[nextRow]?.name ?? '').trim() : ''
    const sourceWorker = Number.isInteger(sourceRow) ? String(resources[sourceRow]?.name ?? '').trim() : ''
    return {
      order: baseOrder,
      title: calendarTimelineOrderTitle(baseOrder),
      time: calendarTimelineOrderRangeLabel(baseOrder),
      workerLabel: targetWorker || sourceWorker || 'wybranej osoby',
      count: calendarTimelineOrderAssignedPersonCount(baseOrder, resources),
    }
  }

  function calendarTimelineOrderWithAssignmentRows(order = {}, rows = [], resources = calendarTimelineResources()) {
    const max = Array.isArray(resources) && resources.length ? resources.length : Number.POSITIVE_INFINITY
    const assignedRows = (Array.isArray(rows) ? rows : [rows])
      .map((row) => Number(row))
      .filter((row, index, list) => Number.isInteger(row) && row >= 0 && row < max && list.indexOf(row) === index)
    const safeRows = assignedRows.length ? assignedRows : [0]
    const workerAssignments = ordersWorkerAssignmentsFromRows(safeRows, resources)
    const workerIds = workerAssignments.map((item) => String(item.workerId ?? '').trim()).filter(Boolean)
    const workerLogins = workerAssignments.map((item) => String(item.workerLogin ?? '').trim()).filter(Boolean)
    const workerLabel = workerAssignments.map((item) => item.name).filter(Boolean).join(', ')
    return {
      ...order,
      row: safeRows[0],
      assignedRows: safeRows,
      workerAssignments,
      assignedWorkers: workerAssignments,
      workers: workerAssignments,
      workerIds,
      workerId: workerIds.length === 1 ? workerIds[0] : '',
      workerLogin: workerLogins.length === 1 ? workerLogins[0] : '',
      workerName: workerLabel,
      workerLabel,
    }
  }

  function calendarTimelineMovedWorkAllocation(order = {}, sourceRowIndex = null, options = {}) {
    const allocations = calendarTimelineOrderWorkAllocations(order)
    const index = calendarTimelineAllocationIndex(allocations, sourceRowIndex, options)
    return index >= 0 ? allocations[index] : null
  }

  function calendarTimelineSyncMovedWorkAllocations(order = {}, nextOrder = {}, nextRow = 0, sourceRowIndex = null, resources = calendarTimelineResources(), options = {}) {
    const allocations = calendarTimelineOrderWorkAllocations(order)
    if (!allocations.length) {
      return nextOrder
    }

    const assignmentScope = options?.assignmentEditScope === 'all' ? 'all' : 'single'
    const sourceRow = Number(sourceRowIndex)
    let changed = false
    const matchIndex = calendarTimelineAllocationIndex(allocations, sourceRow, options)

    let nextAllocations = allocations
    if (assignmentScope === 'all') {
      changed = true
      nextAllocations = allocations.map((item) => {
        const row = Number(item?.row)
        const stableRow = Number.isInteger(row) && row >= 0 ? row : nextRow
        return calendarTimelineWorkAllocationMovedToRow(item, stableRow, resources, {
          dateYmd: options?.slotDateYmd,
          endDateYmd: options?.slotEndDateYmd,
          startTime: options?.slotStartTime,
          endTime: options?.slotEndTime,
          minutes: options?.slotMinutes,
        })
      })
    } else {
      nextAllocations = allocations.map((item, index) => {
        const matchesSelectedIndex = index === matchIndex
        if (!matchesSelectedIndex) {
          return item
        }
        changed = true
        return calendarTimelineWorkAllocationMovedToRow(item, nextRow, resources, {
          dateYmd: options?.slotDateYmd,
          endDateYmd: options?.slotEndDateYmd,
          startTime: options?.slotStartTime,
          endTime: options?.slotEndTime,
          minutes: options?.slotMinutes,
        })
      })
    }

    if (!changed) {
      return nextOrder
    }

    const finalAllocations = nextAllocations
    const allocationRows = finalAllocations
      .map((item) => Number(item?.row))
      .filter((row, index, list) => Number.isInteger(row) && row >= 0 && list.indexOf(row) === index)
    const assignedRows = allocationRows.length ? allocationRows : nextOrder.assignedRows
    const nextServiceBlocks = calendarTimelineServiceBlocksWithAllocations(nextOrder.serviceBlocks, finalAllocations)
    return calendarTimelineOrderWithAssignmentRows({
      ...nextOrder,
      serviceBlocks: nextServiceBlocks,
      workAllocations: finalAllocations,
      workerAllocations: finalAllocations,
    }, assignedRows, resources)
  }

  function calendarTimelineSelectedAllocationIndex(order = {}, sourceRowIndex = null, options = {}) {
    const allocations = calendarTimelineOrderWorkAllocations(order)
    return calendarTimelineAllocationIndex(allocations, sourceRowIndex, options)
  }

  function calendarTimelineAllocationRows(allocations = []) {
    return (Array.isArray(allocations) ? allocations : [])
      .map((item) => Number(item?.row))
      .filter((row, index, list) => Number.isInteger(row) && row >= 0 && list.indexOf(row) === index)
  }

  function calendarTimelineOrderWithAllocations(order = {}, allocations = [], resources = calendarTimelineResources()) {
    const safeAllocations = Array.isArray(allocations) ? allocations.filter(Boolean) : []
    const rows = calendarTimelineAllocationRows(safeAllocations)
    const peopleCount = Math.max(1, safeAllocations.length || rows.length || 1)
    return calendarTimelineOrderWithAssignmentRows({
      ...order,
      workAllocations: safeAllocations,
      workerAllocations: safeAllocations,
      requiredPeople: peopleCount,
      requiredWorkers: peopleCount,
      workerSlots: peopleCount,
      updatedAt: new Date().toISOString(),
    }, rows.length ? rows : order.assignedRows, resources)
  }

  function calendarTimelineAllocationSchedule(allocation = {}, fallbackOrder = {}) {
    const startDay = ordersNormalizeDateField(
      allocation?.dateYmd ?? allocation?.planDateYmd ?? allocation?.startDateYmd ?? fallbackOrder?.dateYmd,
      fallbackOrder?.dateYmd || todayYmd(),
    )
    const startTime = ordersNormalizeTimeField(
      allocation?.startTime ?? allocation?.planStartTime ?? fallbackOrder?.startTime,
      fallbackOrder?.startTime || '08:00',
    )
    const end = calendarTimelineWorkSlotEndForAllocation(startDay, startTime, allocation)
    return {
      dateYmd: startDay,
      startTime,
      endDateYmd: end.endDateYmd || startDay,
      endTime: end.endTime || ordersDefaultEndTime(startTime),
    }
  }

  function calendarTimelineApplyScheduleToOrder(order = {}, schedule = {}) {
    const dateYmd = ordersNormalizeDateField(schedule?.dateYmd, order.dateYmd || todayYmd())
    const startTime = ordersNormalizeTimeField(schedule?.startTime, order.startTime || '08:00')
    const endDateYmd = ordersNormalizeDateField(schedule?.endDateYmd, dateYmd)
    const endTime = ordersNormalizeTimeField(schedule?.endTime, order.endTime || ordersDefaultEndTime(startTime))
    return {
      ...order,
      dateYmd,
      startTime,
      endDateYmd,
      endTime,
      validUntil: endDateYmd,
      nextDate: dateYmd,
      accessStartTime: startTime,
      accessEndTime: endTime,
    }
  }

  function calendarTimelineUpdateRecurringRuleAfterSeriesMove(order = {}, options = {}, schedule = {}) {
    if (!calendarTimelineOrderIsRecurring(order) || options?.recurringEditScope !== 'series') {
      return order
    }
    const targetDay = ordersNormalizeDateField(schedule?.dateYmd ?? options?.slotDateYmd, order.dateYmd || todayYmd())
    const next = {
      ...order,
      dateYmd: targetDay,
      nextDate: targetDay,
    }
    const unit = calendarTimelineRecurringUnit(next)
    if (unit === 'week') {
      const oldWeekday = calendarTimelineDateWeekday(options?.occurrenceDateYmd || order.dateYmd)
      const newWeekday = calendarTimelineDateWeekday(targetDay)
      if (newWeekday >= 0) {
        const currentWeekdays = calendarTimelineRepeatWeekdays(order)
        let nextWeekdays = currentWeekdays.length
          ? currentWeekdays.map((weekday) => (weekday === oldWeekday ? newWeekday : weekday))
          : [newWeekday]
        if (!currentWeekdays.includes(oldWeekday)) {
          nextWeekdays = currentWeekdays.length <= 1
            ? [newWeekday]
            : currentWeekdays.includes(newWeekday)
              ? currentWeekdays
              : [...currentWeekdays, newWeekday]
        }
        next.repeatWeekdays = nextWeekdays.filter((weekday, index, list) => list.indexOf(weekday) === index)
        if (
          typeof ordersWeeklyPatternSources === 'function' &&
          typeof ordersNormalizeWeeklyPatternRule === 'function' &&
          typeof ordersStoreWeeklyPatternRules === 'function'
        ) {
          const rules = ordersWeeklyPatternSources(order)
            .map((rule) => ordersNormalizeWeeklyPatternRule(rule, order))
            .filter(Boolean)
            .map((rule) =>
              rule.weekday === oldWeekday
                ? ordersNormalizeWeeklyPatternRule({
                    ...rule,
                    weekday: newWeekday,
                    day: newWeekday,
                    accessStartTime: schedule.startTime || next.startTime,
                    startTime: schedule.startTime || next.startTime,
                    accessEndTime: schedule.endTime || next.endTime,
                    endTime: schedule.endTime || next.endTime,
                  }, next, newWeekday)
                : rule,
            )
            .filter(Boolean)
          if (rules.length) {
            ordersStoreWeeklyPatternRules(next, rules)
          }
        }
      }
    }
    return next
  }

  function calendarTimelineBuildSplitAssignmentOrders(order = {}, nextOrder = {}, sourceRowIndex = null, resources = calendarTimelineResources(), options = {}) {
    if (options?.assignmentEditScope !== 'single' || calendarTimelineOrderAssignedPersonCount(order, resources) <= 1) {
      return null
    }
    const sourceAllocations = calendarTimelineOrderWorkAllocations(order)
    const movedAllocations = calendarTimelineOrderWorkAllocations(nextOrder)
    if (sourceAllocations.length <= 1 || movedAllocations.length <= 1) {
      return null
    }
    const selectedIndex = calendarTimelineSelectedAllocationIndex(order, sourceRowIndex, options)
    if (selectedIndex < 0 || selectedIndex >= sourceAllocations.length) {
      return null
    }
    const selectedSource = sourceAllocations[selectedIndex]
    const selectedKey = String(selectedSource?.key ?? '').trim()
    const selectedMovedIndex = selectedKey
      ? movedAllocations.findIndex((item) => String(item?.key ?? '').trim() === selectedKey)
      : selectedIndex
    const selectedMoved = movedAllocations[selectedMovedIndex >= 0 ? selectedMovedIndex : selectedIndex]
    if (!selectedMoved) {
      return null
    }
    const remainingAllocations = sourceAllocations.filter((_, index) => index !== selectedIndex)
    if (!remainingAllocations.length) {
      return null
    }

    const schedule = calendarTimelineAllocationSchedule(selectedMoved, nextOrder)
    const remainingOrder = calendarTimelineOrderWithAllocations(order, remainingAllocations, resources)
    const splitBase = calendarTimelineApplyScheduleToOrder(
      calendarTimelineCleanRecurringGeneratedFields({
        ...order,
        ...nextOrder,
        id: ordersNextOrderId(),
        orderId: '',
        sourceOrderId: '',
        recurrenceSourceOrderId: '',
        parentOrderId: '',
        recurrenceOverride: false,
        recurrenceOverrideKind: '',
        recurrenceOriginalDateYmd: '',
        recurrenceOverrideDateYmd: '',
        recurrenceSkippedDates: [],
        recurrenceExceptionDates: [],
        skipDates: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      schedule,
    )
    const selectedOrder = calendarTimelineOrderWithAllocations(
      calendarTimelineUpdateRecurringRuleAfterSeriesMove(splitBase, options, schedule),
      [selectedMoved],
      resources,
    )
    return { remainingOrder, selectedOrder }
  }

  function calendarTimelineSingleOccurrenceOverrideVariant(sourceOrder = {}, occurrenceDay = '', patch = {}, variant = '') {
    const sourceOrderId = String(sourceOrder?.id ?? sourceOrder?.sourceOrderId ?? '').trim()
    const day = String(occurrenceDay ?? '').trim()
    const suffix = normalizeSearchText(variant || ordersNextOrderId()).replace(/[^a-z0-9_-]+/g, '-')
    const id = sourceOrderId && /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${sourceOrderId}__override__${day}__${suffix || 'split'}` : ''
    if (!id) {
      return null
    }
    const override = calendarTimelineBuildSingleOccurrenceOverride(sourceOrder, day, {
      ...patch,
      id,
    })
    return override ? { ...override, id, orderId: id } : null
  }

  function calendarTimelineOrderMatchesRecurringOverrideDay(order = {}, sourceOrderId = '', occurrenceDay = '') {
    const info = calendarTimelineRecurringOverrideInfo(order)
    return Boolean(
      info &&
        String(info.sourceOrderId ?? '').trim() === String(sourceOrderId ?? '').trim() &&
        String(info.dateYmd ?? '').trim() === String(occurrenceDay ?? '').trim(),
    )
  }

  function calendarTimelineBuildMovedOrder(order = {}, rowIndex, slotIndex = null, sourceRowIndex = null, resources = calendarTimelineResources(), options = {}) {
    const nextRow = Number(rowIndex)
    if (!Number.isInteger(nextRow) || nextRow < 0) {
      return null
    }
    const assignmentScope = options?.assignmentEditScope === 'all' ? 'all' : 'single'
    const hasMultipleAssignments = calendarTimelineOrderAssignedPersonCount(order, resources) > 1
    const applyScheduleToAll = !hasMultipleAssignments || assignmentScope === 'all'
    const currentAssignedRows = calendarTimelineRealAssignedRowsForOrder(order, resources)
    const assignedRows = applyScheduleToAll && hasMultipleAssignments && currentAssignedRows.length
      ? currentAssignedRows
      : calendarTimelineOrderRowsAfterMove(order, nextRow, sourceRowIndex, resources)
    if (!assignedRows.length) {
      return null
    }
    const cursor = appState.calendarCursorDay || todayYmd()
    const days = Array.from({ length: 3 }, (_, index) => calendarAddDays(cursor, index))
    const hours = Array.from({ length: 20 }, (_, index) => index + 4)
    const slotTarget = slotIndex == null ? null : calendarTimelineSlotToDayTime(slotIndex, days, hours)
    const movedAllocation = calendarTimelineMovedWorkAllocation(order, sourceRowIndex, options)
    let movedSchedule = null
    let nextOrder = calendarTimelineOrderWithAssignmentRows({
      ...order,
      updatedAt: new Date().toISOString(),
    }, assignedRows, resources)
  
    if (slotTarget) {
      const allocationStart = movedAllocation
        ? ordersNormalizeTimeField(movedAllocation.startTime ?? movedAllocation.planStartTime, order.startTime || '08:00')
        : ''
      const duration = calendarTimelineSnapDurationMinutes(
        movedAllocation
          ? calendarTimelineAllocationDurationMinutes(order, movedAllocation, allocationStart || order.startTime || '08:00')
          : calendarTimelineOrderDurationMinutes(order),
      )
      const startMinutes = calendarTimelineTimeMinutes(slotTarget.time, 4 * 60)
      const totalEndMinutes = startMinutes + duration
      const endDayOffset = Math.floor(totalEndMinutes / 1440)
      const endMinutes = totalEndMinutes % 1440
      const endDateYmd = calendarAddDays(slotTarget.dayKey, endDayOffset)
      const slotStartTime = calendarMinutesToTime(startMinutes) || slotTarget.time
      const slotEndTime = calendarMinutesToTime(endMinutes) || '23:59'
      movedSchedule = {
        dateYmd: slotTarget.dayKey,
        startTime: slotStartTime,
        endDateYmd,
        endTime: slotEndTime,
      }
      if (applyScheduleToAll) {
        nextOrder = {
          ...nextOrder,
          ...movedSchedule,
          validUntil: endDateYmd,
          nextDate: slotTarget.dayKey,
        }
      }
      options = {
        ...options,
        slotDateYmd: slotTarget.dayKey,
        slotEndDateYmd: endDateYmd,
        slotStartTime,
        slotEndTime,
        slotMinutes: duration,
      }
    }

    nextOrder = calendarTimelineSyncMovedWorkAllocations(order, nextOrder, nextRow, sourceRowIndex, resources, options)
    if (movedSchedule && applyScheduleToAll) {
      nextOrder = calendarTimelineUpdateRecurringRuleAfterSeriesMove(nextOrder, options, movedSchedule)
    }
  
    return nextOrder
  }
  
  function calendarTimelineFindOrderConflicts(candidate = {}, orders = [], resources = calendarTimelineResources()) {
    if (!isScheduleOrderActive(candidate)) {
      return []
    }
    const candidateSlots = calendarTimelineVisualOrderSlots(candidate, resources)
      .map((slot) => ({
        order: slot,
        interval: calendarTimelineOrderInterval(slot),
        locationKey: calendarTimelineOrderLocationKey(slot),
        rows: new Set(
          ordersNormalizeOrderRows(slot, resources).filter((row) => !calendarTimelineRowAllowsOverlap(row, resources)),
        ),
      }))
      .filter((slot) => slot.interval && slot.rows.size)
    if (!candidateSlots.length) return []
  
    const conflicts = []
    const sourceOrders = (Array.isArray(orders) ? orders : []).filter((order) => isScheduleOrderActive(order))
    const conflictDays = calendarTimelineDaysForOrder(candidate)
    const plannedOrders = conflictDays.length
      ? calendarTimelineExpandRecurringOrdersForDays(sourceOrders, conflictDays)
      : sourceOrders
    const checkedOrders = plannedOrders
  
    checkedOrders.forEach((order) => {
      if (!order) {
        return
      }
      const orderSlots = calendarTimelineVisualOrderSlots(order, resources)
      orderSlots.forEach((orderSlot) => {
        if (!orderSlot || candidateSlots.some((candidateSlot) => calendarTimelineSameConflictOrder(candidateSlot.order, orderSlot))) {
          return
        }
        const interval = calendarTimelineOrderInterval(orderSlot)
        if (!interval) {
          return
        }
        const locationKey = calendarTimelineOrderLocationKey(orderSlot)
        const rows = ordersNormalizeOrderRows(orderSlot, resources)
        candidateSlots.forEach((candidateSlot) => {
          if (!(candidateSlot.interval.start < interval.end && interval.start < candidateSlot.interval.end)) {
            return
          }
          if (candidateSlot.locationKey && locationKey && candidateSlot.locationKey === locationKey) {
            return
          }
          rows.forEach((row) => {
            if (!candidateSlot.rows.has(row) || calendarTimelineRowAllowsOverlap(row, resources)) {
              return
            }
            const key = `${String(orderSlot.id ?? order.id ?? '')}::${row}`
            if (conflicts.some((item) => item.key === key)) {
              return
            }
            conflicts.push({
              key,
              row,
              workerName: String(resources[row]?.name ?? `Wiersz ${row + 1}`).trim(),
              order: orderSlot,
              title: calendarTimelineOrderTitle(orderSlot),
              time: calendarTimelineOrderRangeLabel(orderSlot),
            })
          })
        })
      })
    })
  
    return conflicts
  }
  
  function calendarTimelineFindOrderConflict(candidate = {}, orders = [], resources = calendarTimelineResources()) {
    return calendarTimelineFindOrderConflicts(candidate, orders, resources)[0]?.order ?? null
  }

  function calendarTimelineConflictItemsFromLayout(layoutItems = [], resources = calendarTimelineResources()) {
    return (Array.isArray(layoutItems) ? layoutItems : [])
      .map((item) => {
        const order = item?.bar ?? item
        const row = Number(order?.row)
        if (!Number.isInteger(row) || row < 0 || calendarTimelineRowAllowsOverlap(row, resources)) {
          return null
        }
        const interval = calendarTimelineOrderInterval(order)
        if (!interval) {
          return null
        }
        return {
          row,
          interval,
          order,
          sourceKeys: calendarTimelineOrderSourceKeys(order),
          title: calendarTimelineOrderTitle(order),
          time: calendarTimelineOrderRangeLabel(order),
        }
      })
      .filter(Boolean)
  }

  function calendarTimelineMoveCandidateFromOrders(
    orderId,
    rowIndex,
    slotIndex = null,
    sourceRowIndex = null,
    resources = calendarTimelineResources(),
    orders = ordersListSourceOrders(),
    options = {},
  ) {
    const id = String(orderId ?? '').trim()
    const sourceOrderId = String(options?.sourceOrderId ?? '').trim()
    const occurrenceDateYmd = String(options?.occurrenceDateYmd ?? '').trim()
    const directOrder = orders.find((order) => String(order?.id ?? '') === id)
    const sourceBackedOrder = sourceOrderId
      ? orders.find((order) => String(order?.id ?? '') === sourceOrderId)
      : null
    const baseOrder = directOrder || sourceBackedOrder
    const currentOrder =
      baseOrder && calendarTimelineOrderIsRecurring(baseOrder) && /^\d{4}-\d{2}-\d{2}$/.test(occurrenceDateYmd)
        ? calendarTimelineRecurringInstance(baseOrder, occurrenceDateYmd, 0)
        : baseOrder
    return currentOrder ? calendarTimelineBuildMovedOrder(currentOrder, rowIndex, slotIndex, sourceRowIndex, resources, options) : null
  }

  function calendarTimelineFindVisibleOrderConflicts(candidate = {}, resources = calendarTimelineResources()) {
    const visibleItems = Array.isArray(appState.calendarTimelineVisibleConflictItems)
      ? appState.calendarTimelineVisibleConflictItems
      : []
    if (!visibleItems.length) {
      return []
    }
    const candidateItems = calendarTimelineConflictItemsFromLayout(calendarTimelineVisualOrderSlots(candidate, resources), resources)
    if (!candidateItems.length) {
      return []
    }
    const conflicts = []
    candidateItems.forEach((candidateItem) => {
      visibleItems.forEach((item) => {
        if (!item || candidateItem.row !== item.row) {
          return
        }
        if (calendarTimelineSameConflictOrder(candidateItem.order, item.order)) {
          return
        }
        if (!(candidateItem.interval.start < item.interval.end && item.interval.start < candidateItem.interval.end)) {
          return
        }
        const key = `${String(item.order?.id ?? item.sourceKeys?.[0] ?? item.title ?? '')}::${item.row}`
        if (conflicts.some((conflict) => conflict.key === key)) {
          return
        }
        conflicts.push({
          key,
          row: item.row,
          workerName: String(resources[item.row]?.name ?? `Wiersz ${item.row + 1}`).trim(),
          order: item.order,
          title: item.title,
          time: item.time,
        })
      })
    })
    return conflicts
  }
  
  function calendarTimelineMoveWouldConflictOnVisible(
    orderId,
    rowIndex,
    slotIndex = null,
    sourceRowIndex = null,
    resources = calendarTimelineResources(),
    orders = ordersListSourceOrders(),
    options = {},
  ) {
    const candidate = calendarTimelineMoveCandidateFromOrders(orderId, rowIndex, slotIndex, sourceRowIndex, resources, orders, options)
    return Boolean(candidate && calendarTimelineFindVisibleOrderConflicts(candidate, resources).length)
  }
  
  function calendarTimelineDragConflict(orderId, rowIndex, slotIndex = null, sourceRowIndex = null, options = {}) {
    const resources = Array.isArray(appState.calendarTimelineDragResources) && appState.calendarTimelineDragResources.length
      ? appState.calendarTimelineDragResources
      : calendarTimelineResources()
    const key = [
      String(orderId ?? '').trim(),
      Number(rowIndex),
      slotIndex == null ? '' : Number(slotIndex),
      sourceRowIndex == null ? '' : Number(sourceRowIndex),
      String(options?.sourceOrderId ?? '').trim(),
      String(options?.occurrenceDateYmd ?? '').trim(),
      String(options?.workSlotKey ?? '').trim(),
    ].join('|')
    if (key && key === appState.calendarTimelineDragConflictKey) {
      return Boolean(appState.calendarTimelineDragConflictValue)
    }
  
    const hasConflict = calendarTimelineMoveWouldConflictOnVisible(orderId, rowIndex, slotIndex, sourceRowIndex, resources, ordersListSourceOrders(), options)
    appState.calendarTimelineDragConflictKey = key
    appState.calendarTimelineDragConflictValue = hasConflict
    return hasConflict
  }
  
  function calendarTimelineSlotToDayTime(slotIndex, days = [], hours = []) {
    const slot = Number(slotIndex)
    const slotsPerDay = hours.length * CALENDAR_TIMELINE_SLOTS_PER_HOUR
    if (!Number.isInteger(slot) || slot < 0 || !slotsPerDay) {
      return null
    }
    const dayIndex = Math.floor(slot / slotsPerDay)
    const slotInDay = slot % slotsPerDay
    const hourIndex = Math.floor(slotInDay / CALENDAR_TIMELINE_SLOTS_PER_HOUR)
    const minute = (slotInDay % CALENDAR_TIMELINE_SLOTS_PER_HOUR) * CALENDAR_TIMELINE_SLOT_MINUTES
    const dayKey = days[dayIndex]
    const hour = hours[hourIndex]
    if (!dayKey || !Number.isFinite(Number(hour))) {
      return null
    }
    return { dayKey, time: `${pad2(Number(hour))}:${pad2(minute)}` }
  }

  function calendarTimelineWorkSlotKeyFromOrderId(orderId = '') {
    const raw = String(orderId ?? '').trim()
    const marker = '__workslot__'
    const index = raw.lastIndexOf(marker)
    return index >= 0 ? raw.slice(index + marker.length).trim() : ''
  }
  
  function calendarTimelineRecurringContextFromBar(bar) {
    if (!(bar instanceof HTMLElement)) {
      return null
    }
    const orderId = String(bar.getAttribute('data-calendar-timeline-order-id') || '').trim()
    const sourceOrderId = String(bar.getAttribute('data-calendar-timeline-source-order-id') || orderId).trim()
    const workSlotKey = String(
      bar.getAttribute('data-calendar-timeline-work-slot-key') ||
        calendarTimelineWorkSlotKeyFromOrderId(orderId) ||
        '',
    ).trim()
    const serviceBlockId = String(bar.getAttribute('data-calendar-timeline-service-block-id') || '').trim()
    const serviceBlockKind = String(bar.getAttribute('data-calendar-timeline-service-block-kind') || '').trim()
    const serviceBlockLabel = String(bar.getAttribute('data-calendar-timeline-service-block-label') || '').trim()
    const occurrenceDateYmd = String(
      bar.getAttribute('data-calendar-timeline-occurrence-date') ||
        bar.getAttribute('data-calendar-timeline-date') ||
        '',
    ).trim()
    const isRecurringSeries = bar.getAttribute('data-calendar-timeline-recurring-series') === '1'
    const isRecurrenceOverride = bar.getAttribute('data-calendar-timeline-recurrence-override') === '1'
    const sourceOrder = calendarTimelineSourceOrderById(sourceOrderId)
    return {
      orderId,
      sourceOrderId,
      occurrenceDateYmd,
      workSlotKey,
      serviceBlockId,
      serviceBlockKind,
      serviceBlockLabel,
      isRecurringSeries,
      isRecurrenceOverride,
      sourceOrder,
      shouldAskScope: Boolean(
        isRecurringSeries &&
          !isRecurrenceOverride &&
          sourceOrder &&
          calendarTimelineOrderIsRecurring(sourceOrder) &&
          /^\d{4}-\d{2}-\d{2}$/.test(occurrenceDateYmd),
      ),
    }
  }
  
  function calendarTimelineShowRecurringScopeDialog({ occurrenceDateYmd = '', title = '', time = '', onSingle = null, onSeries = null } = {}) {
    document.getElementById('calendarTimelineRecurringScopeDialog')?.remove()
    const overlay = document.createElement('div')
    overlay.id = 'calendarTimelineRecurringScopeDialog'
    overlay.className = 'calendar-conflict-overlay calendar-recurring-scope-overlay'
    overlay.innerHTML = `
      <section class="calendar-conflict-dialog calendar-recurring-scope-dialog" role="dialog" aria-modal="true" aria-labelledby="calendarRecurringScopeTitle">
        <button class="calendar-conflict-close" type="button" data-calendar-recurring-scope="cancel" aria-label="Zamknij">×</button>
        <div class="calendar-conflict-icon calendar-recurring-scope-icon">↻</div>
        <div class="calendar-conflict-copy">
          <p class="calendar-conflict-kicker">Zlecenie cykliczne</p>
          <h2 id="calendarRecurringScopeTitle">Co chcesz zmienić?</h2>
          <p>
            Zlecenie <strong>${escapeHtml(title || 'Zlecenie')}</strong>${time ? ` (${escapeHtml(time)})` : ''}
            należy do serii cyklicznej. Wybierz, czy zmieniasz całą serię, czy tylko dzień ${escapeHtml(calendarTimelineDateLabel(occurrenceDateYmd))}.
          </p>
        </div>
        <div class="calendar-recurring-scope-actions">
          <button class="btn secondary" type="button" data-calendar-recurring-scope="single">Tylko ten jeden dzień</button>
          <button class="btn primary" type="button" data-calendar-recurring-scope="series">Reguły cykliczności</button>
        </div>
      </section>
    `
    overlay.addEventListener('click', (event) => {
      const target = event.target
      const button = target?.closest?.('[data-calendar-recurring-scope]')
      if (target !== overlay && !button) {
        return
      }
      const action = String(button?.getAttribute?.('data-calendar-recurring-scope') || 'cancel')
      overlay.remove()
      if (action === 'single' && typeof onSingle === 'function') {
        onSingle()
      } else if (action === 'series' && typeof onSeries === 'function') {
        onSeries()
      }
    })
    document.body.appendChild(overlay)
  }

  function calendarTimelineShowAssignmentScopeDialog({ title = '', time = '', workerLabel = '', count = 0, onSingle = null, onAll = null } = {}) {
    document.getElementById('calendarTimelineAssignmentScopeDialog')?.remove()
    const overlay = document.createElement('div')
    overlay.id = 'calendarTimelineAssignmentScopeDialog'
    overlay.className = 'calendar-conflict-overlay calendar-assignment-scope-overlay'
    overlay.innerHTML = `
      <section class="calendar-conflict-dialog calendar-assignment-scope-dialog" role="dialog" aria-modal="true" aria-labelledby="calendarAssignmentScopeTitle">
        <button class="calendar-conflict-close" type="button" data-calendar-assignment-scope="cancel" aria-label="Zamknij">x</button>
        <div class="calendar-conflict-icon calendar-assignment-scope-icon">?</div>
        <div class="calendar-conflict-copy">
          <p class="calendar-conflict-kicker">Zakres zmiany</p>
          <h2 id="calendarAssignmentScopeTitle">Kogo dotyczy zmiana terminu?</h2>
          <p>
            Zlecenie <strong>${escapeHtml(title || 'Zlecenie')}</strong>${time ? ` (${escapeHtml(time)})` : ''}
            ma przypisanych ${Math.max(2, Number(count) || 2)} pracowników. Wybierz, czy zmieniasz termin tylko dla
            <strong>${escapeHtml(workerLabel || 'tej osoby')}</strong>, czy dla wszystkich przypisanych osób.
          </p>
        </div>
        <div class="calendar-assignment-scope-actions">
          <button class="btn secondary" type="button" data-calendar-assignment-scope="single">Tylko ta osoba</button>
          <button class="btn primary" type="button" data-calendar-assignment-scope="all">Wszystkie osoby</button>
        </div>
      </section>
    `
    overlay.addEventListener('click', (event) => {
      const target = event.target
      const button = target?.closest?.('[data-calendar-assignment-scope]')
      if (target !== overlay && !button) {
        return
      }
      const action = String(button?.getAttribute?.('data-calendar-assignment-scope') || 'cancel')
      overlay.remove()
      if (action === 'single' && typeof onSingle === 'function') {
        onSingle()
      } else if (action === 'all' && typeof onAll === 'function') {
        onAll()
      }
    })
    document.body.appendChild(overlay)
  }
  
  function calendarHideTaskContextMenu() {
    document.getElementById('calendarTaskContextMenu')?.remove()
  }
  
  function calendarHideTaskDeleteConfirm() {
    document.getElementById('calendarTaskDeleteConfirmDialog')?.remove()
  }
  
  function calendarTaskContextPosition(node, x, y) {
    if (!(node instanceof HTMLElement)) {
      return
    }
    const margin = 10
    const rect = node.getBoundingClientRect()
    const width = rect.width || node.offsetWidth || 180
    const height = rect.height || node.offsetHeight || node.scrollHeight || 150
    const left = Math.max(margin, Math.min(window.innerWidth - width - margin, Number(x) || margin))
    const top = Math.max(margin, Math.min(window.innerHeight - height - margin, Number(y) || margin))
    node.style.left = `${Math.round(left)}px`
    node.style.top = `${Math.round(top)}px`
  }
  
  function calendarTimelineContextFromBar(bar) {
    if (!(bar instanceof HTMLElement)) {
      return null
    }
    const recurringContext = calendarTimelineRecurringContextFromBar(bar)
    const orderId = String(bar.getAttribute('data-calendar-timeline-order-id') || '').trim()
    return {
      kind: 'timeline-order',
      bar,
      orderId,
      sourceOrderId: recurringContext?.sourceOrderId || orderId,
      occurrenceDateYmd: recurringContext?.occurrenceDateYmd || '',
      workSlotKey: recurringContext?.workSlotKey || calendarTimelineWorkSlotKeyFromOrderId(orderId),
      serviceBlockId: recurringContext?.serviceBlockId || '',
      serviceBlockKind: recurringContext?.serviceBlockKind || '',
      serviceBlockLabel: recurringContext?.serviceBlockLabel || '',
      isRealEvent: bar.getAttribute('data-calendar-timeline-real-event') === '1',
      isRecurringSeries: Boolean(recurringContext?.isRecurringSeries),
      isRecurrenceOverride: Boolean(recurringContext?.isRecurrenceOverride),
      shouldAskScope: Boolean(recurringContext?.shouldAskScope),
      sourceOrder: recurringContext?.sourceOrder || null,
    }
  }
  
  function calendarTimelineOrderFromContext(context = {}) {
    if (!context || context.isRealEvent) {
      return null
    }
    const orderId = String(context.orderId ?? '').trim()
    const sourceOrderId = String(context.sourceOrderId ?? '').trim()
    const occurrenceDateYmd = String(context.occurrenceDateYmd ?? '').trim()
    const directOrder = ordersFindTimelineOrder(orderId)
    if (directOrder) {
      return directOrder
    }
    const sourceOrder = context.sourceOrder || calendarTimelineSourceOrderById(sourceOrderId)
    if (sourceOrder && context.isRecurringSeries && /^\d{4}-\d{2}-\d{2}$/.test(occurrenceDateYmd)) {
      return calendarTimelineRecurringInstance(sourceOrder, occurrenceDateYmd, 0)
    }
    return sourceOrder || null
  }
  
  function calendarTimelineEditOrderFromContext(context = {}) {
    if (!context) {
      return
    }
    if (context.isRealEvent && context.bar instanceof HTMLElement) {
      void calendarTimelineOpenRealEventEditorFromBar(context.bar)
      return
    }
    if (
      context.shouldAskScope &&
      context.sourceOrder &&
      typeof ordersOpenRecurringOccurrenceEditorFromCalendar === 'function' &&
      /^\d{4}-\d{2}-\d{2}$/.test(String(context.occurrenceDateYmd ?? '').trim())
    ) {
      ordersOpenRecurringOccurrenceEditorFromCalendar(context.sourceOrderId, context.occurrenceDateYmd, {
        orderId: context.orderId,
        workSlotKey: context.workSlotKey,
        serviceBlockId: context.serviceBlockId,
        serviceBlockKind: context.serviceBlockKind,
        serviceBlockLabel: context.serviceBlockLabel,
      })
      return
    }
    ordersOpenEditorFromCalendar(
      context.isRecurrenceOverride
        ? context.orderId
        : context.sourceOrderId || context.orderId,
      {
        orderId: context.orderId,
        workSlotKey: context.workSlotKey,
        serviceBlockId: context.serviceBlockId,
        serviceBlockKind: context.serviceBlockKind,
        serviceBlockLabel: context.serviceBlockLabel,
        occurrenceDateYmd: context.occurrenceDateYmd,
      },
    )
  }
  
  function calendarTimelineDuplicateOrderFromContext(context = {}) {
    const sourceOrder = calendarTimelineOrderFromContext(context)
    if (!sourceOrder) {
      showTransientNotice('Nie znaleziono zlecenia do duplikowania.', 'error')
      return
    }
  
    const nowIso = new Date().toISOString()
    const baseOrder = calendarTimelineCleanRecurringGeneratedFields(sourceOrder)
    const sourceType = String(baseOrder.type ?? '').trim()
    const type = sourceType === 'cyclic' ? 'individual' : sourceType || 'individual'
    const copy = {
      ...baseOrder,
      id: ordersNextOrderId(),
      orderId: '',
      sourceOrderId: '',
      recurrenceOverride: false,
      recurrenceOverrideKind: '',
      recurrenceOriginalDateYmd: '',
      recurrenceOverrideDateYmd: '',
      recurrenceSkippedDates: [],
      recurrenceExceptionDates: [],
      skipDates: [],
      scheduleMode: 'once',
      type,
      tone: ordersTimelineToneForType(type),
      validUntil: String(baseOrder.endDateYmd || baseOrder.dateYmd || todayYmd()).trim(),
      nextDate: String(baseOrder.dateYmd || todayYmd()).trim(),
      repeatPreset: 'none',
      repeatEvery: 1,
      repeatUnit: 'day',
      repeatAfterDays: 0,
      repeatWeekdays: [],
      weeklyScheduleRules: [],
      title: `${calendarTimelineOrderTitle(baseOrder) || 'Zlecenie'} (kopia)`,
      completed: false,
      status: '',
      isDraft: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    }
    ordersSaveTimelineOrders([copy, ...ordersListSourceOrders()])
    renderCalendarView()
    if (appState.currentRoute === 'orders') {
      renderOrdersView()
    }
    showTransientNotice('Zlecenie zduplikowane.', 'success')
  }
  
  function calendarTimelineDeleteOrderFromContext(context = {}) {
    if (!context || context.isRealEvent) {
      showTransientNotice('Tego zdarzenia nie można usunąć z menu zlecenia.', 'error')
      return
    }
    const orderId = String(context.orderId ?? '').trim()
    const sourceOrderId = String(context.sourceOrderId ?? '').trim()
    const occurrenceDateYmd = String(context.occurrenceDateYmd ?? '').trim()
    const sourceOrders = ordersListSourceOrders()
    let deleteRemoteIds = []
    let nextOrders = sourceOrders
    let notice = 'Zadanie usunięte z kalendarza.'
  
    if (context.shouldAskScope && context.sourceOrder && /^\d{4}-\d{2}-\d{2}$/.test(occurrenceDateYmd)) {
      nextOrders = sourceOrders.map((order) =>
        String(order?.id ?? '').trim() === sourceOrderId
          ? calendarTimelineOrderWithSkippedOccurrence(order, occurrenceDateYmd)
          : order,
      )
      notice = 'Wystąpienie cykliczne usunięte z tego dnia.'
    } else {
      const targetId = context.isRecurrenceOverride ? orderId : sourceOrderId || orderId
      if (!targetId) {
        showTransientNotice('Nie znaleziono zlecenia do usunięcia.', 'error')
        return
      }
      nextOrders = sourceOrders.filter((order) => String(order?.id ?? '').trim() !== targetId)
      deleteRemoteIds = [targetId]
    }
  
    return ordersDeleteTimelineOrdersById(deleteRemoteIds, { nextOrders, notice })
  }
  
  function calendarDeleteTaskById(taskId = '') {
    const id = String(taskId ?? '').trim()
    if (!id) {
      return
    }
    calendarSaveTasks(appState.calendarTasks.filter((task) => task.id !== id))
    calendarDeleteRemoteTasksById([id])
    if (appState.calendarEditorTaskId === id) {
      calendarCloseEditor()
    }
    renderCalendarView()
    renderDashboardKanbanTasks()
    if (appState.currentRoute === 'kanban') {
      renderKanbanView()
    }
    showTransientNotice('Zadanie usunięte z kalendarza.', 'success')
  }
  
  function calendarShowTaskDeleteConfirm({ title = 'Zadanie', message = 'Czy na pewno chcesz usunąć to zadanie?', onConfirm = null } = {}) {
    calendarHideTaskDeleteConfirm()
    const overlay = document.createElement('div')
    overlay.id = 'calendarTaskDeleteConfirmDialog'
    overlay.className = 'calendar-conflict-overlay calendar-task-delete-confirm-overlay'
    overlay.innerHTML = `
      <section class="calendar-conflict-dialog calendar-task-delete-confirm" role="dialog" aria-modal="true" aria-labelledby="calendarTaskDeleteConfirmTitle">
        <button class="calendar-conflict-close" type="button" data-calendar-task-delete-confirm="cancel" aria-label="Zamknij">×</button>
        <div class="calendar-conflict-icon calendar-task-delete-confirm-icon">!</div>
        <div class="calendar-conflict-copy">
          <p class="calendar-conflict-kicker">Potwierdzenie usunięcia</p>
          <h2 id="calendarTaskDeleteConfirmTitle">Czy na pewno chcesz usunąć to zadanie?</h2>
          <p><strong>${escapeHtml(title || 'Zadanie')}</strong></p>
          <p>${escapeHtml(message)}</p>
        </div>
        <div class="calendar-task-delete-confirm-actions">
          <button class="btn secondary" type="button" data-calendar-task-delete-confirm="cancel">Anuluj</button>
          <button class="btn danger" type="button" data-calendar-task-delete-confirm="delete">Usuń</button>
        </div>
      </section>
    `
    overlay.addEventListener('click', async (event) => {
      const target = event.target
      const button = target?.closest?.('[data-calendar-task-delete-confirm]')
      if (target !== overlay && !button) {
        return
      }
      const action = String(button?.getAttribute?.('data-calendar-task-delete-confirm') || 'cancel')
      if (action !== 'delete') {
        overlay.remove()
        return
      }
      const deleteButton = button instanceof HTMLButtonElement ? button : null
      if (deleteButton) {
        deleteButton.disabled = true
        deleteButton.textContent = 'Usuwanie...'
      }
      await Promise.resolve(typeof onConfirm === 'function' ? onConfirm() : null)
      overlay.remove()
    })
    document.body.appendChild(overlay)
  }
  
  function calendarShowTaskLifecycleConfirm({ title = 'Zlecenie', onConfirm = null } = {}) {
    document.getElementById('calendarTaskLifecycleConfirmDialog')?.remove()
    const overlay = document.createElement('div')
    overlay.id = 'calendarTaskLifecycleConfirmDialog'
    overlay.className = 'calendar-conflict-overlay calendar-task-delete-confirm-overlay'
    overlay.innerHTML = `
      <section class="calendar-conflict-dialog calendar-task-delete-confirm" role="dialog" aria-modal="true" aria-labelledby="calendarTaskLifecycleConfirmTitle">
        <button class="calendar-conflict-close" type="button" data-calendar-task-lifecycle-confirm="cancel" aria-label="Zamknij">×</button>
        <div class="calendar-conflict-icon calendar-task-delete-confirm-icon">!</div>
        <div class="calendar-conflict-copy">
          <p class="calendar-conflict-kicker">Anulowanie zlecenia</p>
          <h2 id="calendarTaskLifecycleConfirmTitle">Anulować to zlecenie?</h2>
          <p><strong>${escapeHtml(title || 'Zlecenie')}</strong></p>
          <p>Zlecenie zniknie z aktywnego grafiku, ale pozostanie w bazie jako zapis audytowy. Operację można odwrócić przez ponowną aktywację, o ile nie spowoduje kolizji.</p>
        </div>
        <div class="calendar-task-delete-confirm-actions">
          <button class="btn secondary" type="button" data-calendar-task-lifecycle-confirm="cancel">Wróć</button>
          <button class="btn danger" type="button" data-calendar-task-lifecycle-confirm="confirm">Anuluj zlecenie</button>
        </div>
      </section>
    `
    overlay.addEventListener('click', async (event) => {
      const target = event.target
      const button = target?.closest?.('[data-calendar-task-lifecycle-confirm]')
      if (target !== overlay && !button) {
        return
      }
      const action = String(button?.getAttribute?.('data-calendar-task-lifecycle-confirm') || 'cancel')
      if (action !== 'confirm') {
        overlay.remove()
        return
      }
      const confirmButton = button instanceof HTMLButtonElement ? button : null
      if (confirmButton) {
        confirmButton.disabled = true
        confirmButton.textContent = 'Anulowanie...'
      }
      const succeeded = await Promise.resolve(typeof onConfirm === 'function' ? onConfirm() : false)
      if (succeeded !== false) {
        overlay.remove()
      } else if (confirmButton) {
        confirmButton.disabled = false
        confirmButton.textContent = 'Anuluj zlecenie'
      }
    })
    document.body.appendChild(overlay)
  }

  function calendarShowTaskContextMenu(context = {}, x = 0, y = 0) {
    calendarHideTaskContextMenu()
    if (!context || !context.kind) {
      return
    }
    const isRealEvent = Boolean(context.isRealEvent)
    const canCancelOrder = context.kind === 'timeline-order' && !isRealEvent && !context.shouldAskScope
    const menu = document.createElement('div')
    menu.id = 'calendarTaskContextMenu'
    menu.className = 'calendar-task-context-menu'
    menu.setAttribute('role', 'menu')
    menu.innerHTML = `
      <button type="button" role="menuitem" data-calendar-task-context-action="edit">Edytuj</button>
      <button type="button" role="menuitem" data-calendar-task-context-action="duplicate"${isRealEvent ? ' disabled' : ''}>Duplikuj</button>
      ${canCancelOrder ? '<button type="button" role="menuitem" data-calendar-task-context-action="cancel-order">Anuluj zlecenie</button>' : ''}
      <button type="button" role="menuitem" class="is-danger" data-calendar-task-context-action="delete"${isRealEvent ? ' disabled' : ''}>Usuń</button>
    `
    menu.addEventListener('click', (event) => {
      const button = event.target?.closest?.('[data-calendar-task-context-action]')
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return
      }
      const action = String(button.getAttribute('data-calendar-task-context-action') || '').trim()
      calendarHideTaskContextMenu()
      if (context.kind === 'calendar-task') {
        const task = appState.calendarTasks.find((item) => String(item.id ?? '') === String(context.taskId ?? ''))
        if (!task) {
          showTransientNotice('Nie znaleziono zadania.', 'error')
          return
        }
        if (action === 'edit') {
          calendarOpenEditor(context.taskId)
          return
        }
        if (action === 'duplicate') {
          calendarOpenEditor(context.taskId)
          calendarDuplicateEditorTask()
          return
        }
        if (action === 'delete') {
          calendarShowTaskDeleteConfirm({
            title: task.title || 'Zadanie',
            onConfirm: () => calendarDeleteTaskById(context.taskId),
          })
        }
        return
      }
  
      if (context.kind === 'timeline-order') {
        const order = calendarTimelineOrderFromContext(context)
        const title = order ? calendarTimelineOrderTitle(order) : 'Zlecenie'
        if (action === 'edit') {
          calendarTimelineEditOrderFromContext(context)
          return
        }
        if (action === 'duplicate') {
          calendarTimelineDuplicateOrderFromContext(context)
          return
        }
        if (action === 'cancel-order') {
          const targetId = context.isRecurrenceOverride
            ? String(context.orderId ?? '').trim()
            : String(context.sourceOrderId || context.orderId || '').trim()
          if (!targetId) {
            showTransientNotice('Nie znaleziono zlecenia do anulowania.', 'error')
            return
          }
          calendarShowTaskLifecycleConfirm({
            title,
            onConfirm: () => ordersSetTimelineOrderLifecycleStatus(
              [targetId],
              'CANCELLED',
              { notice: 'Zlecenie anulowane i pozostawione w historii.' },
            ),
          })
          return
        }
        if (action === 'delete') {
          calendarShowTaskDeleteConfirm({
            title,
            message: context.shouldAskScope
              ? 'Usunięte zostanie tylko to wystąpienie zlecenia cyklicznego.'
              : 'Tej operacji nie można cofnąć.',
            onConfirm: () => calendarTimelineDeleteOrderFromContext(context),
          })
        }
      }
    })
    document.body.appendChild(menu)
    calendarTaskContextPosition(menu, x, y)
  }
  
  function calendarTimelineAskRecurringMoveScope(orderId, rowIndex, slotIndex = null, sourceRowIndex = null, resources = calendarTimelineResources(), options = {}) {
    const sourceOrderId = String(options.sourceOrderId ?? '').trim()
    const occurrenceDateYmd = String(options.occurrenceDateYmd ?? '').trim()
    const sourceOrder = calendarTimelineSourceOrderById(sourceOrderId)
    if (!sourceOrder) {
      return { moved: false, conflicts: [], candidate: null }
    }
    const occurrenceOrder = calendarTimelineRecurringInstance(sourceOrder, occurrenceDateYmd, 0)
    calendarTimelineShowRecurringScopeDialog({
      sourceOrderId,
      occurrenceDateYmd,
      title: calendarTimelineOrderTitle(sourceOrder),
      time: calendarTimelineOrderRangeLabel(occurrenceOrder),
      onSingle: () => {
        const moveOptions = {
          ...options,
          recurringEditScope: 'single',
        }
        if (options.freshBeforeSave) {
          void calendarTimelineMoveOrderWithFreshCheck(orderId, rowIndex, slotIndex, sourceRowIndex, resources, moveOptions)
            .then((result) => calendarTimelineHandleMoveResult(result))
          return
        }
        const result = calendarTimelineMoveOrder(orderId, rowIndex, slotIndex, sourceRowIndex, resources, moveOptions)
        calendarTimelineHandleMoveResult(result)
      },
      onSeries: () => {
        const moveOptions = {
          ...options,
          recurringEditScope: 'series',
        }
        if (options.freshBeforeSave) {
          void calendarTimelineMoveOrderWithFreshCheck(orderId, rowIndex, slotIndex, sourceRowIndex, resources, moveOptions)
            .then((result) => calendarTimelineHandleMoveResult(result))
          return
        }
        const result = calendarTimelineMoveOrder(orderId, rowIndex, slotIndex, sourceRowIndex, resources, moveOptions)
        calendarTimelineHandleMoveResult(result)
      },
    })
    return { moved: false, pending: true, conflicts: [], candidate: null }
  }

  function calendarTimelineAskAssignmentMoveScope(orderId, rowIndex, slotIndex = null, sourceRowIndex = null, resources = calendarTimelineResources(), options = {}) {
    const context = calendarTimelineMoveAssignmentScopeContext(orderId, rowIndex, slotIndex, sourceRowIndex, resources, options)
    if (!context) {
      return null
    }
    const moveWithScope = (assignmentEditScope) => {
      const moveOptions = {
        ...options,
        assignmentEditScope,
        freshBeforeSave: true,
      }
      void calendarTimelineMoveOrderWithFreshCheck(orderId, rowIndex, slotIndex, sourceRowIndex, resources, moveOptions)
        .then((result) => calendarTimelineHandleMoveResult(result))
    }
    calendarTimelineShowAssignmentScopeDialog({
      title: context.title,
      time: context.time,
      workerLabel: context.workerLabel,
      count: context.count,
      onSingle: () => moveWithScope('single'),
      onAll: () => moveWithScope('all'),
    })
    return { moved: false, pending: true, conflicts: [], candidate: null }
  }
  
  async function calendarTimelineRefreshOrdersForVerifiedMove() {
    const orgId = ordersActiveOrganizationId()
    if (!orgId) {
      return ordersListSourceOrders()
    }
  
    const localOrdersBeforeRefresh = ordersListSourceOrders()
    const hadPendingLocalSave = Boolean(ordersRemoteSaveTimer)
    ordersClearRemoteTimelineOrderSaveTimer()
    const remoteOrders = await fetchScheduleTasks(orgId)
    const canonicalOrders = hadPendingLocalSave
      ? ordersMergeTimelineOrderLists(remoteOrders, localOrdersBeforeRefresh)
      : ordersMergeTimelineOrderLists(remoteOrders)
    ordersSaveTimelineOrders(canonicalOrders, { syncRemote: false, preserveDrafts: false })
    appState.calendarTimelineOrdersRemoteLoaded = true
    return ordersListSourceOrders()
  }

  async function calendarTimelineMoveOrderWithFreshCheck(orderId, rowIndex, slotIndex = null, sourceRowIndex = null, resources = calendarTimelineResources(), options = {}) {
    const sourceOrderId = String(options.sourceOrderId ?? '').trim()
    const occurrenceDateYmd = String(options.occurrenceDateYmd ?? '').trim()
    const requiresScope =
      options.recurringEditScope !== 'single' &&
      options.recurringEditScope !== 'series' &&
      Boolean(options.isRecurringSeries) &&
      Boolean(sourceOrderId) &&
      /^\d{4}-\d{2}-\d{2}$/.test(occurrenceDateYmd) &&
      calendarTimelineOrderIsRecurring(calendarTimelineSourceOrderById(sourceOrderId) || {})
  
    if (requiresScope) {
      return calendarTimelineAskRecurringMoveScope(orderId, rowIndex, slotIndex, sourceRowIndex, resources, {
        ...options,
        freshBeforeSave: true,
      })
    }
  
    const assignmentScopeResult = calendarTimelineAskAssignmentMoveScope(orderId, rowIndex, slotIndex, sourceRowIndex, resources, options)
    if (assignmentScopeResult) {
      return assignmentScopeResult
    }
  
    try {
      await calendarTimelineRefreshOrdersForVerifiedMove()
    } catch (error) {
      console.warn('[portal/calendar] fresh move validation failed', error)
      renderCalendarView()
      showPortalErrorNotice('Nie zapisano przesuniecia. Nie udalo sie potwierdzic aktualnego stanu zlecen z bazy.', error)
      return { moved: false, conflicts: [], candidate: null, errorMessage: 'Nie zapisano przesuniecia. Odswiez dane i sprobuj ponownie.' }
    }

    if (options.oneOffOnly) {
      const freshSourceOrder = calendarTimelineSourceOrderById(sourceOrderId || orderId)
      if (!calendarTimelineOrderCanBeMovedFreely(freshSourceOrder || {})) {
        renderCalendarView()
        return {
          moved: false,
          conflicts: [],
          candidate: null,
          errorMessage: 'W kalendarzu mozna teraz przenosic tylko zlecenia jednorazowe.',
        }
      }
    }
  
    const result = calendarTimelineMoveOrder(orderId, rowIndex, slotIndex, sourceRowIndex, resources, options)
    if (!result?.moved && result?.conflicts?.length) {
      renderCalendarView()
    }
    return result
  }
  
  function calendarTimelineMoveOrder(orderId, rowIndex, slotIndex = null, sourceRowIndex = null, resources = calendarTimelineResources(), options = {}) {
    const id = String(orderId ?? '').trim()
    const nextRow = Number(rowIndex)
    if (!id || !Number.isInteger(nextRow) || nextRow < 0) {
      return { moved: false, conflicts: [], candidate: null }
    }
    const orders = ordersListSourceOrders()
    const sourceOrderId = String(options.sourceOrderId ?? '').trim()
    const occurrenceDateYmd = String(options.occurrenceDateYmd ?? '').trim()
    const directOrder = orders.find((order) => String(order?.id ?? '') === id)
    const directIsMaterializedOverride = calendarTimelineIsMaterializedOverrideOrder(directOrder)
    const recurringSourceOrder = !directIsMaterializedOverride && sourceOrderId ? calendarTimelineSourceOrderById(sourceOrderId) : null
    const isSingleRecurringOccurrenceMove = Boolean(
      options.recurringEditScope !== 'series' &&
        recurringSourceOrder &&
        calendarTimelineOrderIsRecurring(recurringSourceOrder) &&
        /^\d{4}-\d{2}-\d{2}$/.test(occurrenceDateYmd),
    )
    const sourceOrder = isSingleRecurringOccurrenceMove ? recurringSourceOrder : null
    const overrideId = sourceOrder ? calendarTimelineRecurringOverrideId(sourceOrderId, occurrenceDateYmd) : ''
    const sourceBackedOrder = sourceOrderId
      ? orders.find((order) => String(order?.id ?? '') === sourceOrderId)
      : null
    const currentOrder =
      sourceOrder && overrideId
        ? orders.find((order) => String(order?.id ?? '') === overrideId) || calendarTimelineRecurringInstance(sourceOrder, occurrenceDateYmd, 0)
        : directOrder || sourceBackedOrder
    const currentOrderId = String(currentOrder?.id ?? id).trim()
    let nextOrder = currentOrder ? calendarTimelineBuildMovedOrder(currentOrder, nextRow, slotIndex, sourceRowIndex, resources, options) : null
    const splitOrders = currentOrder && nextOrder ? calendarTimelineBuildSplitAssignmentOrders(currentOrder, nextOrder, sourceRowIndex, resources, options) : null
    if (splitOrders) {
      if (sourceOrder && overrideId) {
        const remainingOverride = calendarTimelineSingleOccurrenceOverrideVariant(sourceOrder, occurrenceDateYmd, splitOrders.remainingOrder, 'pozostali')
        const selectedOverride = calendarTimelineSingleOccurrenceOverrideVariant(sourceOrder, occurrenceDateYmd, splitOrders.selectedOrder, 'osoba')
        if (!remainingOverride || !selectedOverride) {
          return { moved: false, conflicts: [], candidate: null }
        }
        const skippedSource = calendarTimelineOrderWithSkippedOccurrence(sourceOrder, occurrenceDateYmd)
        const nextOrdersBase = orders
          .filter((order) => !calendarTimelineOrderMatchesRecurringOverrideDay(order, sourceOrderId, occurrenceDateYmd))
          .map((order) => (String(order?.id ?? '').trim() === sourceOrderId ? skippedSource : order))
        const conflicts = calendarTimelineFindOrderConflicts(selectedOverride, [...nextOrdersBase, remainingOverride], resources)
        if (conflicts.length) {
          return { moved: false, conflicts, candidate: selectedOverride }
        }
        ordersSaveTimelineOrders([...nextOrdersBase, remainingOverride, selectedOverride])
        renderCalendarView()
        return { moved: true, conflicts: [], candidate: selectedOverride }
      }
  
      const nextOrdersBase = orders.map((order) =>
        String(order?.id ?? '') === currentOrderId ? splitOrders.remainingOrder : order,
      )
      const conflicts = calendarTimelineFindOrderConflicts(splitOrders.selectedOrder, nextOrdersBase, resources)
      if (conflicts.length) {
        return { moved: false, conflicts, candidate: splitOrders.selectedOrder }
      }
      ordersSaveTimelineOrders([splitOrders.selectedOrder, ...nextOrdersBase])
      renderCalendarView()
      return { moved: true, conflicts: [], candidate: splitOrders.selectedOrder }
    }
    if (nextOrder && sourceOrder && overrideId) {
      nextOrder = calendarTimelineBuildSingleOccurrenceOverride(sourceOrder, occurrenceDateYmd, nextOrder)
    }
    if (!nextOrder) {
      return { moved: false, conflicts: [], candidate: null }
    }
    const conflicts = calendarTimelineFindOrderConflicts(nextOrder, orders, resources)
    if (conflicts.length) {
      return { moved: false, conflicts, candidate: nextOrder }
    }
    const nextOrders = nextOrder.recurrenceOverride && !directIsMaterializedOverride
      ? calendarTimelineOrdersWithSingleOccurrenceOverride(orders, nextOrder)
      : orders.map((order) => (String(order?.id ?? '') === currentOrderId ? nextOrder : order))
    ordersSaveTimelineOrders(nextOrders)
    renderCalendarView()
    return { moved: true, conflicts: [], candidate: nextOrder }
  }
  
  function calendarTimelineShowConflictDialog(conflicts = [], candidate = null) {
    const existing = document.getElementById('calendarTimelineConflictDialog')
    if (existing) {
      existing.remove()
    }
  
    const title = candidate ? calendarTimelineOrderTitle(candidate) : 'Zlecenie'
    const time = candidate ? calendarTimelineOrderRangeLabel(candidate) : ''
    const rows = conflicts.slice(0, 8)
    const extraCount = Math.max(0, conflicts.length - rows.length)
    const detailsHtml = rows.length
      ? rows
          .map(
            (conflict) => `
              <li class="calendar-conflict-item">
                <div>
                  <strong>${escapeHtml(conflict.workerName || 'Pracownik')}</strong>
                  <span>${escapeHtml(conflict.title || 'Zlecenie')}</span>
                </div>
                <small>${escapeHtml(conflict.time || '-')}</small>
              </li>
            `,
          )
          .join('')
      : '<li class="calendar-conflict-item"><div><strong>Brak szczegółów kolizji.</strong></div></li>'
  
    const overlay = document.createElement('div')
    overlay.id = 'calendarTimelineConflictDialog'
    overlay.className = 'calendar-conflict-overlay'
    overlay.innerHTML = `
      <section class="calendar-conflict-dialog" role="dialog" aria-modal="true" aria-labelledby="calendarConflictTitle">
        <button class="calendar-conflict-close" type="button" data-calendar-conflict-close aria-label="Zamknij">×</button>
        <div class="calendar-conflict-icon">!</div>
        <div class="calendar-conflict-copy">
          <p class="calendar-conflict-kicker">Kolizja terminu</p>
          <h2 id="calendarConflictTitle">Nie można zapisać kolidującego planu</h2>
          <p>${
            candidate
              ? `Zlecenie <strong>${escapeHtml(title)}</strong>${time ? ` na ${escapeHtml(time)}` : ''} nakłada się na inne zlecenie u jednej lub kilku przypisanych osób.`
              : 'Co najmniej dwa zlecenia nakładają się u tej samej osoby. Zmień pracownika albo godziny realizacji.'
          }</p>
        </div>
        <ul class="calendar-conflict-list">${detailsHtml}</ul>
        ${extraCount ? `<p class="calendar-conflict-more">I jeszcze ${extraCount} konfliktów.</p>` : ''}
        <div class="calendar-conflict-actions">
          <button class="btn primary" type="button" data-calendar-conflict-close>Rozumiem</button>
        </div>
      </section>
    `
    overlay.addEventListener('click', (event) => {
      const target = event.target
      if (target === overlay || target?.closest?.('[data-calendar-conflict-close]')) {
        overlay.remove()
      }
    })
    document.body.appendChild(overlay)
  }
  
  function calendarTimelineDropInfoKey(info = null) {
    if (!info) {
      return ''
    }
    return [Number(info.rowIndex), info.slotIndex == null ? '' : Number(info.slotIndex)].join('|')
  }

  function calendarTimelineBufferDragOptions(options = {}) {
    return {
      ...options,
      recurringEditScope: 'single',
      assignmentEditScope: 'single',
    }
  }

  function calendarTimelineBufferMoveOptionsFromTransfer(transfer = null) {
    const read = (type, fallback = '') => String(transfer?.getData?.(type) || fallback || '').trim()
    return calendarTimelineBufferDragOptions({
      sourceOrderId: read('application/x-calendar-source-order-id', appState.calendarTimelineDragSourceOrderId),
      occurrenceDateYmd: read('application/x-calendar-occurrence-date', appState.calendarTimelineDragOccurrenceDate),
      workSlotKey: read('application/x-calendar-work-slot-key', appState.calendarTimelineDragWorkSlotKey),
      allocationIdentity: read('application/x-calendar-work-slot-identity', appState.calendarTimelineDragAllocationIdentity),
      workSlotId: read('application/x-calendar-work-slot-id', appState.calendarTimelineDragWorkSlotId),
      serviceBlockId: read('application/x-calendar-service-block-id', appState.calendarTimelineDragServiceBlockId),
      isRecurringSeries:
        read('application/x-calendar-recurring-series', appState.calendarTimelineDragRecurringSeries ? '1' : '') === '1',
    })
  }

  function calendarTimelineAllocationIsBuffer(allocation = {}, resources = calendarTimelineResources()) {
    const type = String(allocation?.type ?? '').trim().toLowerCase()
    if (type === 'buffer' || type === 'unassigned') {
      return true
    }
    return calendarTimelineRowAllowsOverlap(Number(allocation?.row), resources)
  }

  function calendarTimelineBufferAssignmentContext(
    orders = [],
    orderId = '',
    sourceRowIndex = null,
    resources = calendarTimelineResources(),
    options = {},
  ) {
    const persistedOrders = Array.isArray(orders) ? orders : []
    const directOrder = persistedOrders.find((order) => String(order?.id ?? '').trim() === String(orderId ?? '').trim()) || null
    const sourceOrderId = String(options?.sourceOrderId ?? directOrder?.sourceOrderId ?? directOrder?.id ?? '').trim()
    const sourceOrder =
      persistedOrders.find((order) => String(order?.id ?? '').trim() === sourceOrderId) || directOrder || null
    const occurrenceDateYmd = String(
      options?.occurrenceDateYmd ??
        directOrder?.occurrenceDateYmd ??
        directOrder?.dateYmd ??
        sourceOrder?.dateYmd ??
        '',
    ).trim()
    if (!sourceOrder || !/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDateYmd)) {
      return null
    }

    const overrideOrder = persistedOrders.find((order) => {
      const info = calendarTimelineRecurringOverrideInfo(order)
      return Boolean(info && info.sourceOrderId === sourceOrderId && info.dateYmd === occurrenceDateYmd)
    }) || null
    const recurringSource = calendarTimelineOrderIsRecurring(sourceOrder)
    const occurrenceOrder =
      overrideOrder ||
      (recurringSource ? calendarTimelineRecurringInstance(sourceOrder, occurrenceDateYmd, 0) : directOrder || sourceOrder)
    const allocations = calendarTimelineOrderWorkAllocations(occurrenceOrder)
    const allocationIndex = calendarTimelineAllocationIndex(allocations, sourceRowIndex, options)
    const allocation = allocationIndex >= 0 ? allocations[allocationIndex] : null
    if (!allocation || !calendarTimelineAllocationIsBuffer(allocation, resources)) {
      return null
    }

    const blockId = String(
      options?.serviceBlockId ?? allocation?.serviceBlockId ?? allocation?.teamId ?? '',
    ).trim()
    const relatedAllocationIndexes = allocations
      .map((item, index) => {
        const itemBlockId = String(item?.serviceBlockId ?? item?.teamId ?? '').trim()
        return blockId ? (itemBlockId === blockId ? index : -1) : index === allocationIndex ? index : -1
      })
      .filter((index) => index >= 0)
    const blockCanMove = relatedAllocationIndexes.every((index) =>
      calendarTimelineAllocationIsBuffer(allocations[index], resources),
    )
    const timing =
      calendarTimelineServiceBlockTimingForAllocation(occurrenceOrder, allocation) ||
      calendarTimelineAllocationSchedule(allocation, occurrenceOrder)
    const startTime = ordersNormalizeTimeField(timing?.startTime ?? allocation?.startTime ?? occurrenceOrder?.startTime, '')
    const durationMinutes = calendarTimelineAllocationDurationMinutes(occurrenceOrder, allocation, startTime || '08:00')
    if (!startTime || durationMinutes <= 0) {
      return null
    }

    return {
      sourceOrder,
      sourceOrderId,
      directOrder,
      overrideOrder,
      occurrenceOrder,
      occurrenceDateYmd,
      recurringSource,
      allocations,
      allocation,
      allocationIndex,
      blockId,
      relatedAllocationIndexes,
      blockCanMove,
      startTime,
      durationMinutes,
    }
  }

  function calendarTimelineMinutesToTime(totalMinutes = 0) {
    const safeMinutes = Math.max(0, Math.min(23 * 60 + 59, Math.round(Number(totalMinutes) || 0)))
    return `${pad2(Math.floor(safeMinutes / 60))}:${pad2(safeMinutes % 60)}`
  }

  function calendarTimelineScheduleForDayMinutes(dateYmd = '', startMinutes = 0, durationMinutes = 0) {
    const start = Math.round(Number(startMinutes) || 0)
    const duration = Math.max(1, Math.round(Number(durationMinutes) || 0))
    const end = start + duration
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateYmd ?? '')) || start < 0 || end > 23 * 60 + 59) {
      return null
    }
    const startTime = calendarTimelineMinutesToTime(start)
    const endTime = calendarTimelineMinutesToTime(end)
    return {
      dateYmd,
      planDateYmd: dateYmd,
      startDateYmd: dateYmd,
      endDateYmd: dateYmd,
      planEndDateYmd: dateYmd,
      startTime,
      planStartTime: startTime,
      endTime,
      planEndTime: endTime,
      minutes: duration,
    }
  }

  function calendarTimelineWorkerOccupiedIntervals(
    orders = [],
    dateYmd = '',
    rowIndex = null,
    resources = calendarTimelineResources(),
  ) {
    const targetRow = Number(rowIndex)
    if (!Number.isInteger(targetRow) || calendarTimelineRowAllowsOverlap(targetRow, resources)) {
      return []
    }
    const dayStart = calendarTimelineTimestampFromDayMinutes(dateYmd, 0)
    const expandedOrders = calendarTimelineExpandRecurringOrdersForDays(orders, [dateYmd])
    const intervals = expandedOrders
      .flatMap((order) => calendarTimelineVisualOrderSlots(order, resources))
      .filter((slot) => Number(slot?.row) === targetRow)
      .map((slot) => {
        const schedule = calendarTimelineAllocationSchedule(slot, slot)
        const startDate = String(schedule?.dateYmd ?? slot?.dateYmd ?? '').trim()
        const endDate = String(schedule?.endDateYmd ?? startDate).trim()
        const startTime = ordersNormalizeTimeField(schedule?.startTime ?? slot?.startTime, '')
        const endTime = ordersNormalizeTimeField(schedule?.endTime ?? slot?.endTime, '')
        if (!startDate || !startTime || !endTime) return null
        const startTimestamp = calendarTimelineTimestampFromDayMinutes(startDate, calendarTimelineTimeMinutes(startTime, 0))
        let endTimestamp = calendarTimelineTimestampFromDayMinutes(endDate || startDate, calendarTimelineTimeMinutes(endTime, 0))
        if (endTimestamp <= startTimestamp) endTimestamp += 24 * 60 * 60 * 1000
        return {
          start: Math.max(0, Math.round((startTimestamp - dayStart) / 60000)),
          end: Math.min(24 * 60, Math.round((endTimestamp - dayStart) / 60000)),
        }
      })
      .filter((interval) => interval && interval.end > 0 && interval.start < 24 * 60)
      .sort((left, right) => left.start - right.start || left.end - right.end)

    return intervals.reduce((merged, interval) => {
      const previous = merged[merged.length - 1]
      if (!previous || interval.start > previous.end) {
        merged.push({ ...interval })
      } else {
        previous.end = Math.max(previous.end, interval.end)
      }
      return merged
    }, [])
  }

  function calendarTimelineNearestFreeBufferWindow(
    orders = [],
    context = null,
    targetRowIndex = null,
    preferredSlotIndex = null,
    resources = calendarTimelineResources(),
    knownOccupiedIntervals = null,
  ) {
    if (!context) return null
    const days = Array.from({ length: 3 }, (_, index) => calendarAddDays(appState.calendarCursorDay || todayYmd(), index))
    const hours = Array.from({ length: 20 }, (_, index) => index + 4)
    const pointer = calendarTimelineSlotToDayTime(preferredSlotIndex, days, hours)
    if (!pointer || pointer.dayKey !== context.occurrenceDateYmd) {
      return null
    }
    const preferredStart = calendarTimelineTimeMinutes(pointer.time, calendarTimelineTimeMinutes(context.startTime, 8 * 60))
    const occupied = Array.isArray(knownOccupiedIntervals)
      ? knownOccupiedIntervals
      : calendarTimelineWorkerOccupiedIntervals(
          orders,
          context.occurrenceDateYmd,
          targetRowIndex,
          resources,
        )
    const fits = (start) => {
      const end = start + context.durationMinutes
      return end <= 23 * 60 + 59 && occupied.every((interval) => end <= interval.start || start >= interval.end)
    }
    let selectedStart = null
    if (!context.blockCanMove) {
      const fixedStart = calendarTimelineTimeMinutes(context.startTime, preferredStart)
      selectedStart = fits(fixedStart) ? fixedStart : null
    } else {
      const candidates = []
      for (let start = 4 * 60; start + context.durationMinutes <= 23 * 60 + 59; start += CALENDAR_TIMELINE_SLOT_MINUTES) {
        if (fits(start)) candidates.push(start)
      }
      candidates.sort((left, right) => Math.abs(left - preferredStart) - Math.abs(right - preferredStart) || left - right)
      selectedStart = candidates[0] ?? null
    }
    if (selectedStart == null) return null

    const schedule = calendarTimelineScheduleForDayMinutes(
      context.occurrenceDateYmd,
      selectedStart,
      context.durationMinutes,
    )
    if (!schedule) return null
    const slotIndex = calendarTimelineSlotIndex(schedule.dateYmd, schedule.startTime, days, hours)
    return {
      schedule,
      slotIndex,
      candidate: {
        id: `buffer-preview:${context.sourceOrderId}:${context.allocationIndex}`,
        row: Number(targetRowIndex),
        dateYmd: schedule.dateYmd,
        endDateYmd: schedule.endDateYmd,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        slotWorkMinutes: context.durationMinutes,
        title: calendarTimelineOrderTitle(context.occurrenceOrder),
      },
    }
  }

  function calendarTimelineAssignedAllocationSnapshot(allocations = [], resources = calendarTimelineResources()) {
    return allocations.reduce((snapshot, allocation, index) => {
      if (calendarTimelineAllocationIsBuffer(allocation, resources)) return snapshot
      const identity = calendarTimelineAllocationIdentity(allocation, index)
      snapshot.set(identity, JSON.stringify({
        row: Number(allocation?.row),
        type: String(allocation?.type ?? ''),
        workerId: String(allocation?.workerId ?? ''),
        workerLogin: String(allocation?.workerLogin ?? ''),
        workerKey: String(allocation?.workerKey ?? ''),
        dateYmd: String(allocation?.dateYmd ?? allocation?.planDateYmd ?? ''),
        startTime: String(allocation?.startTime ?? allocation?.planStartTime ?? ''),
        endTime: String(allocation?.endTime ?? allocation?.planEndTime ?? ''),
        minutes: Math.round(Number(allocation?.minutes ?? allocation?.workMinutes) || 0),
      }))
      return snapshot
    }, new Map())
  }

  function calendarTimelineAssignedAllocationsPreserved(before = new Map(), afterAllocations = [], resources = calendarTimelineResources()) {
    const after = calendarTimelineAssignedAllocationSnapshot(afterAllocations, resources)
    return Array.from(before.entries()).every(([identity, signature]) => after.get(identity) === signature)
  }

  function calendarTimelineServiceBlocksForBufferAssignment(order = {}, allocations = [], context = null, schedule = null) {
    const synchronized = calendarTimelineServiceBlocksWithAllocations(order?.serviceBlocks, allocations)
    if (!context?.blockCanMove || !context?.blockId || !schedule) return synchronized
    return synchronized.map((block, blockIndex) => {
      const blockId = String(block?.id ?? block?.kind ?? `block-${blockIndex + 1}`).trim()
      if (blockId !== context.blockId) return block
      return {
        ...block,
        dateYmd: schedule.dateYmd,
        planDateYmd: schedule.dateYmd,
        startDateYmd: schedule.dateYmd,
        endDateYmd: schedule.endDateYmd,
        planEndDateYmd: schedule.endDateYmd,
        startTime: schedule.startTime,
        planStartTime: schedule.startTime,
        endTime: schedule.endTime,
        planEndTime: schedule.endTime,
      }
    })
  }

  function calendarTimelineBuildBufferAssignmentOrder(context = null, targetRowIndex = null, schedule = null, resources = calendarTimelineResources()) {
    if (!context || !schedule) return null
    const protectedAssignments = calendarTimelineAssignedAllocationSnapshot(context.allocations, resources)
    const nextAllocations = context.allocations.map((allocation, index) => {
      const shouldMoveBlock = context.blockCanMove && context.relatedAllocationIndexes.includes(index)
      const nextTiming = shouldMoveBlock ? schedule : calendarTimelineAllocationSchedule(allocation, context.occurrenceOrder)
      if (index === context.allocationIndex) {
        return calendarTimelineWorkAllocationMovedToRow(allocation, targetRowIndex, resources, {
          ...schedule,
          minutes: context.durationMinutes,
        })
      }
      return shouldMoveBlock
        ? calendarTimelineWorkAllocationMovedToRow(allocation, Number(allocation?.row), resources, nextTiming)
        : allocation
    })
    if (!calendarTimelineAssignedAllocationsPreserved(protectedAssignments, nextAllocations, resources)) {
      return null
    }

    const serviceBlocks = calendarTimelineServiceBlocksForBufferAssignment(
      context.occurrenceOrder,
      nextAllocations,
      context,
      schedule,
    )
    const occurrencePatch = calendarTimelineOrderWithAllocations(
      { ...context.occurrenceOrder, serviceBlocks },
      nextAllocations,
      resources,
    )
    if (context.overrideOrder) {
      return {
        ...context.overrideOrder,
        ...calendarTimelineCleanRecurringGeneratedFields(occurrencePatch),
        id: context.overrideOrder.id,
        sourceOrderId: context.sourceOrderId,
        recurrenceSourceOrderId: context.sourceOrderId,
        recurrenceOverride: true,
        recurrenceOverrideKind: 'single-day',
        recurrenceOriginalDateYmd: context.occurrenceDateYmd,
        recurrenceOverrideDateYmd: context.occurrenceDateYmd,
      }
    }
    if (context.recurringSource) {
      return calendarTimelineBuildSingleOccurrenceOverride(
        context.sourceOrder,
        context.occurrenceDateYmd,
        occurrencePatch,
      )
    }
    const persistedOrder = context.directOrder || context.sourceOrder
    return {
      ...persistedOrder,
      ...calendarTimelineCleanRecurringGeneratedFields(occurrencePatch),
      id: persistedOrder.id,
    }
  }

  async function calendarTimelineAssignBufferWithFreshCheck(
    orderId,
    targetRowIndex,
    preferredSlotIndex,
    sourceRowIndex,
    resources = calendarTimelineResources(),
    options = {},
  ) {
    let freshOrders = []
    try {
      freshOrders = await calendarTimelineRefreshOrdersForVerifiedMove()
    } catch (error) {
      console.warn('[portal/calendar] buffer assignment refresh failed', error)
      renderCalendarView()
      return { moved: false, errorMessage: 'Nie zapisano zlecenia. Nie udało się potwierdzić aktualnych danych z bazy.' }
    }
    const context = calendarTimelineBufferAssignmentContext(
      freshOrders,
      orderId,
      sourceRowIndex,
      resources,
      options,
    )
    if (!context) {
      renderCalendarView()
      return { moved: false, errorMessage: 'Nie znaleziono wskazanego slotu w BUFORZE. Odśwież kalendarz.' }
    }
    const freeWindow = calendarTimelineNearestFreeBufferWindow(
      freshOrders,
      context,
      targetRowIndex,
      preferredSlotIndex,
      resources,
    )
    if (!freeWindow) {
      renderCalendarView()
      return {
        moved: false,
        errorMessage: context.blockCanMove
          ? 'Pracownik nie ma w tym dniu pełnego wolnego okna dla tego zlecenia.'
          : 'Nie można zmienić godzin tej zmiany, ponieważ ma już przypisane osoby. W jej czasie pracownik jest zajęty.',
      }
    }
    const changedOrder = calendarTimelineBuildBufferAssignmentOrder(
      context,
      targetRowIndex,
      freeWindow.schedule,
      resources,
    )
    if (!changedOrder) {
      renderCalendarView()
      return { moved: false, errorMessage: 'Zapis zablokowano, ponieważ naruszyłby wcześniejsze przydziały.' }
    }
    const saved = await ordersSaveRemoteTimelineOrdersNow([changedOrder], {
      render: true,
      retainLocalOrders: [changedOrder],
    })
    return saved
      ? { moved: true, candidate: freeWindow.candidate, schedule: freeWindow.schedule }
      : { moved: false, errorMessage: 'Nie udało się zapisać przypisania w bazie.' }
  }

  function calendarTimelineClearDropPreview() {
    document
      .querySelectorAll('#calendarPrototypeTimeline .calendar-timeline-drop-preview')
      .forEach((node) => node.remove())
  }

  function calendarTimelinePreviewSlot(candidate = {}, rowIndex = null, resources = calendarTimelineResources(), options = {}) {
    const workSlotKey = String(options?.workSlotKey ?? '').trim()
    const slots = calendarTimelineVisualOrderSlots(candidate, resources)
    return (
      slots.find(
        (slot) =>
          Number(slot?.row) === Number(rowIndex) &&
          (!workSlotKey || String(slot?.workSlotKey ?? '').trim() === workSlotKey),
      ) ||
      slots.find((slot) => Number(slot?.row) === Number(rowIndex)) ||
      candidate
    )
  }

  function calendarTimelineShowDropPreview(candidate, dropInfo, resources, invalid = false, options = {}) {
    calendarTimelineClearDropPreview()
    const grid = document.querySelector('#calendarPrototypeTimeline .fw-timeline-grid')
    const rowIndex = Number(dropInfo?.rowIndex)
    const slotIndex = Number(dropInfo?.slotIndex)
    const resource = resources[rowIndex]
    if (
      !(grid instanceof HTMLElement) ||
      !Number.isInteger(rowIndex) ||
      !Number.isInteger(slotIndex) ||
      resource?.type !== 'worker' ||
      !candidate
    ) {
      return
    }
    const totalSlots = Number(grid.getAttribute('data-calendar-timeline-total-slots'))
    if (!Number.isFinite(totalSlots) || totalSlots <= 0 || slotIndex < 0 || slotIndex >= totalSlots) {
      return
    }
    const previewSlot = calendarTimelinePreviewSlot(candidate, rowIndex, resources, options)
    const durationMinutes = Math.max(
      CALENDAR_TIMELINE_SLOT_MINUTES,
      Math.round(
        Number(previewSlot?.slotWorkMinutes || calendarTimelineOrderDurationMinutes(previewSlot || candidate)) ||
          CALENDAR_TIMELINE_SLOT_MINUTES,
      ),
    )
    const span = Math.max(
      1,
      Math.min(totalSlots - slotIndex, Math.ceil(durationMinutes / CALENDAR_TIMELINE_SLOT_MINUTES)),
    )
    const preview = document.createElement('div')
    preview.className = `calendar-timeline-drop-preview${invalid ? ' is-invalid' : ''}`
    preview.style.gridColumnStart = String(slotIndex + 2)
    preview.style.gridColumnEnd = `span ${span}`
    preview.style.gridRow = String(calendarTimelineGridRowForResource(resource, rowIndex))
    const label = document.createElement('span')
    label.textContent = calendarTimelineOrderTimeRangeLabel(previewSlot || candidate)
    preview.appendChild(label)
    grid.appendChild(preview)
  }
  
  function calendarTimelineClearDropTargets() {
    calendarTimelineClearDropPreview()
    const hoverNode = appState.calendarTimelineDragHoverNode
    if (hoverNode instanceof HTMLElement) {
      hoverNode.classList.remove('is-timeline-drop-target', 'is-timeline-drop-invalid')
    }
    document
      .querySelectorAll('#view-calendar .is-timeline-drop-target, #view-calendar .is-timeline-drop-invalid')
      .forEach((node) => node.classList.remove('is-timeline-drop-target', 'is-timeline-drop-invalid'))
    appState.calendarTimelineDragHoverKey = ''
    appState.calendarTimelineDragHoverInvalid = false
    appState.calendarTimelineDragHoverNode = null
  }
  
  function calendarTimelineMarkDropTarget(target, info = null, invalid = false) {
    if (!(target instanceof HTMLElement) || !info) {
      calendarTimelineClearDropTargets()
      return
    }
    const key = calendarTimelineDropInfoKey(info)
    if (
      key &&
      key === appState.calendarTimelineDragHoverKey &&
      Boolean(invalid) === Boolean(appState.calendarTimelineDragHoverInvalid) &&
      appState.calendarTimelineDragHoverNode === target
    ) {
      return
    }
    const previous = appState.calendarTimelineDragHoverNode
    if (previous instanceof HTMLElement && previous !== target) {
      previous.classList.remove('is-timeline-drop-target', 'is-timeline-drop-invalid')
    }
    target.classList.toggle('is-timeline-drop-target', !invalid)
    target.classList.toggle('is-timeline-drop-invalid', Boolean(invalid))
    appState.calendarTimelineDragHoverKey = key
    appState.calendarTimelineDragHoverInvalid = Boolean(invalid)
    appState.calendarTimelineDragHoverNode = target
  }
  
  function calendarTimelineVisualOrders(orders = [], resources = calendarTimelineResources()) {
    return orders.flatMap((order) => calendarTimelineVisualOrderSlots(order, resources))
  }
  
  function calendarTimelineWorkSlotEnd(startDay = '', startTime = '08:00', minutes = 60) {
    const startMinutes = calendarTimelineTimeMinutes(startTime, 8 * 60)
    const totalEndMinutes = startMinutes + Math.max(15, Math.round(Number(minutes) || 60))
    return {
      endDateYmd: calendarAddDays(startDay, Math.floor(totalEndMinutes / 1440)),
      endTime: calendarMinutesToTime(totalEndMinutes % 1440) || '23:59',
    }
  }

  function calendarTimelineWorkSlotEndForAllocation(startDay = '', startTime = '08:00', allocation = {}) {
    const explicitEnd = ordersNormalizeTimeField(allocation?.endTime ?? allocation?.planEndTime, '')
    const explicitEndDate = ordersNormalizeDateField(allocation?.endDateYmd ?? allocation?.planEndDateYmd, '')
    if (explicitEnd) {
      const startMinutes = calendarTimelineTimeMinutes(startTime, 8 * 60)
      const endMinutes = calendarTimelineTimeMinutes(explicitEnd, startMinutes + 60)
      return {
        endDateYmd: explicitEndDate || (endMinutes <= startMinutes ? calendarAddDays(startDay, 1) : startDay),
        endTime: explicitEnd,
      }
    }
    return calendarTimelineWorkSlotEnd(startDay, startTime, allocation?.minutes)
  }

  function calendarTimelineAllocationDurationMinutes(order = {}, allocation = {}, startTime = '08:00') {
    const rawMinutes = [
      allocation?.minutes,
      allocation?.workMinutes,
      allocation?.durationMinutes,
    ]
      .map((value) => Math.round(Number(value) || 0))
      .find((value) => value > 0)
    if (rawMinutes) {
      return rawMinutes
    }

    const explicitEnd = ordersNormalizeTimeField(allocation?.endTime ?? allocation?.planEndTime, '')
    if (explicitEnd) {
      const startDay = ordersNormalizeDateField(allocation?.dateYmd ?? allocation?.planDateYmd ?? allocation?.startDateYmd ?? order?.dateYmd, '')
      const endDay = ordersNormalizeDateField(allocation?.endDateYmd ?? allocation?.planEndDateYmd ?? order?.endDateYmd ?? startDay, startDay)
      const startMinutes = calendarTimelineTimeMinutes(startTime, 8 * 60)
      const endMinutes = calendarTimelineTimeMinutes(explicitEnd, startMinutes + 60)
      let daySpan = Math.max(0, calendarTimelineDayDiff(startDay, endDay))
      if (daySpan === 0 && endMinutes <= startMinutes) {
        daySpan = 1
      }
      const duration = daySpan * 1440 + endMinutes - startMinutes
      if (Number.isFinite(duration) && duration > 0) {
        return duration
      }
    }

    return Math.max(15, calendarTimelineOrderDurationMinutes(order))
  }
  
  function calendarTimelineServiceBlockAllocations(order = {}) {
    return (Array.isArray(order?.serviceBlocks) ? order.serviceBlocks : [])
      .flatMap((block, blockIndex) => {
        const direct = Array.isArray(block?.workAllocations) && block.workAllocations.length
          ? block.workAllocations
          : Array.isArray(block?.workerAllocations) && block.workerAllocations.length
            ? block.workerAllocations
            : []
        if (direct.length) {
          const blockStart = ordersNormalizeTimeField(block?.startTime ?? block?.planStartTime ?? block?.accessStartTime, '')
          const blockEnd = ordersNormalizeTimeField(block?.endTime ?? block?.planEndTime ?? block?.accessEndTime, '')
          const blockDate = ordersNormalizeDateField(
            block?.dateYmd ?? block?.planDateYmd ?? order?.dateYmd ?? order?.startDateYmd,
            '',
          )
          const blockEndDate = ordersNormalizeDateField(
            block?.endDateYmd ?? block?.planEndDateYmd ?? order?.endDateYmd ?? blockDate,
            blockDate,
          )
          return direct.map((allocation, index) => {
            const allocationStart = ordersNormalizeTimeField(allocation?.startTime ?? allocation?.planStartTime, '')
            const allocationEnd = ordersNormalizeTimeField(allocation?.endTime ?? allocation?.planEndTime, '')
            const allocationDate = ordersNormalizeDateField(
              allocation?.dateYmd ?? allocation?.planDateYmd ?? allocation?.startDateYmd ?? blockDate,
              blockDate,
            )
            const allocationEndDate = ordersNormalizeDateField(
              allocation?.endDateYmd ?? allocation?.planEndDateYmd ?? blockEndDate ?? allocationDate,
              allocationDate,
            )
            const startTime = blockStart || allocationStart
            const endTime = blockEnd || allocationEnd
            return {
              ...allocation,
              serviceBlockId: block.id || `service-${blockIndex + 1}`,
              serviceBlockKind: block.kind || `team-${blockIndex + 1}`,
              serviceBlockLabel: block.label || allocation.serviceBlockLabel || `Zmiana ${blockIndex + 1}`,
              slotId: allocation.slotId || allocation.id || `slot-${index + 1}`,
              ...(allocationDate ? { dateYmd: allocationDate, planDateYmd: allocationDate } : {}),
              ...(allocationEndDate ? { endDateYmd: allocationEndDate, planEndDateYmd: allocationEndDate } : {}),
              ...(startTime ? { startTime, planStartTime: startTime } : {}),
              ...(endTime ? { endTime, planEndTime: endTime } : {}),
            }
          })
        }
        const slots = Array.isArray(block?.slots) ? block.slots : []
        return slots.map((slot, index) => ({
          ...slot,
          key: slot.key || `slot:${block.id || block.kind || blockIndex + 1}:${slot.slotId || slot.id || index + 1}`,
          row: Number.isInteger(Number(slot.row)) ? Number(slot.row) : 0,
          type: String(slot.type ?? '').trim() || (slot.workerId || slot.workerLogin || slot.workerKey ? 'worker' : 'unassigned'),
          label: slot.label || slot.name || `Osoba ${index + 1}`,
          name: slot.name || slot.label || '',
          minutes: Number(slot.minutes ?? block.requiredWorkMinutes ?? 0) || calendarTimelineOrderDurationMinutes(order),
          dateYmd: slot.dateYmd || slot.planDateYmd || block.dateYmd || order.dateYmd,
          endDateYmd: slot.endDateYmd || slot.planEndDateYmd || block.endDateYmd || order.endDateYmd,
          startTime: slot.startTime || slot.planStartTime || block.startTime || order.startTime,
          endTime: slot.endTime || slot.planEndTime || block.endTime || order.endTime,
          serviceBlockId: block.id || `service-${blockIndex + 1}`,
          serviceBlockKind: block.kind || `team-${blockIndex + 1}`,
          serviceBlockLabel: block.label || `Zmiana ${blockIndex + 1}`,
          slotId: slot.slotId || slot.id || `slot-${index + 1}`,
        }))
      })
      .filter(Boolean)
  }

  function calendarTimelineServiceBlockTimingForAllocation(order = {}, allocation = {}) {
    const serviceBlocks = Array.isArray(order?.serviceBlocks) ? order.serviceBlocks : []
    if (!serviceBlocks.length || !allocation) {
      return null
    }
    const allocationBlockId = String(allocation?.serviceBlockId ?? allocation?.teamId ?? '').trim()
    const allocationBlockKind = String(allocation?.serviceBlockKind ?? '').trim()
    const allocationSlotId = String(allocation?.slotId ?? allocation?.id ?? '').trim()
    const allocationKey = String(allocation?.key ?? '').trim()

    for (let blockIndex = 0; blockIndex < serviceBlocks.length; blockIndex += 1) {
      const block = serviceBlocks[blockIndex]
      const blockId = String(block?.id ?? `service-${blockIndex + 1}`).trim()
      const blockKind = String(block?.kind ?? `team-${blockIndex + 1}`).trim()
      const blockAliases = new Set(
        [blockId, blockKind, block?.teamId, `service-${blockIndex + 1}`, `team-${blockIndex + 1}`]
          .map((value) => String(value ?? '').trim())
          .filter(Boolean),
      )
      const blockMatches =
        (!allocationBlockId && !allocationBlockKind) ||
        (allocationBlockId && blockAliases.has(allocationBlockId)) ||
        (allocationBlockKind && blockAliases.has(allocationBlockKind))
      if (!blockMatches) {
        continue
      }

      const slotCandidates = [
        ...(Array.isArray(block?.slots) ? block.slots : []),
        ...(Array.isArray(block?.workAllocations) ? block.workAllocations : []),
        ...(Array.isArray(block?.workerAllocations) ? block.workerAllocations : []),
      ]
      const matchingSlot = slotCandidates.find((slot, slotIndex) => {
        const slotId = String(slot?.slotId ?? slot?.id ?? `slot-${slotIndex + 1}`).trim()
        const slotKey = String(slot?.key ?? '').trim()
        const generatedKey = `slot:${block?.id || block?.kind || blockIndex + 1}:${slot?.slotId || slot?.id || slotIndex + 1}`
        return (
          (allocationSlotId && slotId && allocationSlotId === slotId) ||
          (allocationKey && (allocationKey === slotKey || allocationKey === generatedKey))
        )
      }) || null
      if (!allocationBlockId && !allocationBlockKind && !matchingSlot) {
        continue
      }

      const blockStart = ordersNormalizeTimeField(block?.startTime ?? block?.planStartTime ?? block?.accessStartTime, '')
      const blockEnd = ordersNormalizeTimeField(block?.endTime ?? block?.planEndTime ?? block?.accessEndTime, '')
      const slotStart = ordersNormalizeTimeField(matchingSlot?.startTime ?? matchingSlot?.planStartTime, '')
      const slotEnd = ordersNormalizeTimeField(matchingSlot?.endTime ?? matchingSlot?.planEndTime, '')
      const dateYmd = ordersNormalizeDateField(
        matchingSlot?.dateYmd ?? matchingSlot?.planDateYmd ?? block?.dateYmd ?? block?.planDateYmd,
        '',
      )
      const endDateYmd = ordersNormalizeDateField(
        matchingSlot?.endDateYmd ?? matchingSlot?.planEndDateYmd ?? block?.endDateYmd ?? block?.planEndDateYmd,
        dateYmd,
      )
      const minutes = Math.max(
        0,
        Math.round(Number(matchingSlot?.minutes ?? matchingSlot?.workMinutes ?? allocation?.minutes ?? allocation?.workMinutes) || 0),
      )
      const startTime = blockStart || slotStart
      const endTime = blockEnd || slotEnd
      return {
        serviceBlockId: blockId,
        serviceBlockKind: blockKind,
        serviceBlockLabel: String(block?.label ?? `Zmiana ${blockIndex + 1}`).trim(),
        ...(matchingSlot ? { slotId: String(matchingSlot?.slotId ?? matchingSlot?.id ?? '').trim() } : {}),
        ...(dateYmd ? { dateYmd, planDateYmd: dateYmd, startDateYmd: dateYmd } : {}),
        ...(endDateYmd ? { endDateYmd, planEndDateYmd: endDateYmd } : {}),
        ...(startTime ? { startTime, planStartTime: startTime } : {}),
        ...(endTime ? { endTime, planEndTime: endTime } : {}),
        ...(minutes > 0 ? { minutes } : {}),
      }
    }

    return null
  }

  function calendarTimelineAllocationStoredRow(allocation = {}) {
    const row = Number(allocation?.row)
    return Number.isInteger(row) && row >= 0 ? row : 0
  }

  function calendarTimelineAllocationKeyLooksLikeSlot(value = '') {
    const key = normalizeSearchText(value)
    return (
      !key ||
      key === 'buffer' ||
      key === 'bufor' ||
      key === 'unassigned' ||
      key.startsWith('slot') ||
      key.startsWith('workslot') ||
      key.startsWith('service-slot') ||
      key.startsWith('buffer:')
    )
  }

  function calendarTimelineAllocationWorkerKey(allocation = {}) {
    const workerKey = String(allocation?.workerKey ?? '').trim()
    if (workerKey) {
      return workerKey
    }
    const rawKey = String(allocation?.key ?? '').trim()
    return calendarTimelineAllocationKeyLooksLikeSlot(rawKey) ? '' : rawKey
  }

  function calendarTimelineAllocationWorkerAssignment(allocation = {}, row = 0) {
    const name = String(allocation?.name ?? allocation?.workerName ?? allocation?.label ?? '').trim()
    return {
      row,
      name,
      label: name,
      key: calendarTimelineAllocationWorkerKey(allocation),
      workerId: String(allocation?.workerId ?? '').trim(),
      workerLogin: String(allocation?.workerLogin ?? allocation?.login ?? '').trim(),
    }
  }

  function calendarTimelineResolveAllocationRow(allocation = {}, resources = calendarTimelineResources()) {
    const fallbackRow = calendarTimelineAllocationStoredRow(allocation)
    const assignment = calendarTimelineAllocationWorkerAssignment(allocation, fallbackRow)
    const resolvedRows = ordersNormalizeOrderRows(
      {
        row: fallbackRow,
        assignedRows: [fallbackRow],
        workerAssignments: [assignment],
      },
      resources,
    )
    const workerRow = resolvedRows.find((row) => resources[Number(row)]?.type === 'worker')
    if (Number.isInteger(Number(workerRow))) {
      return Number(workerRow)
    }
    return resources[fallbackRow] ? fallbackRow : 0
  }

  function calendarTimelineVisualAllocationDedupeKey(allocation = {}) {
    const serviceBlockId = String(
      allocation?.serviceBlockId ?? allocation?.service_block_id ?? '',
    ).trim()
    const workSlotIdentity = String(
      allocation?.workSlotIdentity || allocation?.allocationIdentity || '',
    ).trim()
    const identityIsWeak =
      workSlotIdentity.startsWith('index:') ||
      workSlotIdentity.startsWith('key:') ||
      workSlotIdentity.includes(':key:')

    if (!serviceBlockId || !workSlotIdentity || identityIsWeak) {
      return ''
    }

    return JSON.stringify([serviceBlockId, workSlotIdentity])
  }

  function calendarTimelineVisualAllocationScore(allocation = {}) {
    return [
      allocation?.workerId,
      allocation?.workerLogin,
      allocation?.workerKey,
      allocation?.serviceBlockId,
      allocation?.serviceBlockKind,
      allocation?.serviceBlockLabel,
      allocation?.slotId,
      allocation?.teamId,
      allocation?.key,
      allocation?.label,
      allocation?.name,
    ].reduce((score, value) => score + (String(value ?? '').trim() ? 1 : 0), 0)
  }

  function calendarTimelineDedupeVisualAllocations(allocations = []) {
    const result = []
    const indexByKey = new Map()
    ;(Array.isArray(allocations) ? allocations : []).forEach((allocation) => {
      const key = calendarTimelineVisualAllocationDedupeKey(allocation)
      if (!key) {
        result.push(allocation)
        return
      }
      const existingIndex = indexByKey.get(key)
      if (typeof existingIndex !== 'number') {
        indexByKey.set(key, result.length)
        result.push(allocation)
        return
      }
      const existing = result[existingIndex]
      if (calendarTimelineVisualAllocationScore(allocation) > calendarTimelineVisualAllocationScore(existing)) {
        result[existingIndex] = allocation
      }
    })
    return result
  }

  function calendarTimelineOrderUsesServiceBlockTruth(order = {}, serviceBlockAllocations = []) {
    return Boolean(
      serviceBlockAllocations.length &&
      (
        Number(order?.serviceModelVersion ?? order?.service_model_version) >= 2 ||
        (Array.isArray(order?.serviceBlocks) && order.serviceBlocks.length > 0)
      ),
    )
  }

  function calendarTimelineVisualOrderSlots(order = {}, resources = calendarTimelineResources()) {
    const serviceBlockAllocations = calendarTimelineServiceBlockAllocations(order)
    const hasServiceBlocksV2 =
      Number(order?.serviceModelVersion ?? order?.service_model_version) >= 2 ||
      (Array.isArray(order?.serviceBlocks) && order.serviceBlocks.length > 0) ||
      serviceBlockAllocations.length > 0
    if (
      order?.isRealEvent ||
      (
        ordersScheduleModeForOrder(order) !== 'repeat' &&
        !hasServiceBlocksV2 &&
        !(Array.isArray(order.workAllocations) && order.workAllocations.length)
      )
    ) {
      return ordersNormalizeOrderRows(order, resources).map((row) => ({
        ...order,
        row,
      }))
    }
  
    const orderAllocations = Array.isArray(order.workAllocations) && order.workAllocations.length
      ? order.workAllocations
      : Array.isArray(order.workerAllocations) && order.workerAllocations.length
        ? order.workerAllocations
        : []
    // The saved top-level allocation is canonical for the assigned worker.
    // Service blocks still supply the shift structure and timing below.
    const allocations = orderAllocations.length
      ? orderAllocations
      : calendarTimelineOrderUsesServiceBlockTruth(order, serviceBlockAllocations)
        ? serviceBlockAllocations
        : serviceBlockAllocations.length
          ? serviceBlockAllocations
          : ordersWorkAllocationsForSubjects(order, [], Number(order.requiredWorkMinutes) || calendarTimelineOrderDurationMinutes(order), false)
    const startDay = String(order.dateYmd ?? todayYmd()).trim()
    const accessStart = ordersNormalizeTimeField(order.accessStartTime || order.startTime, '08:00')
    const safeAllocations = allocations
      .map((item, index) => {
        const serviceBlockTiming = calendarTimelineServiceBlockTimingForAllocation(order, item)
        const startTime = ordersNormalizeTimeField(serviceBlockTiming?.startTime ?? item?.planStartTime ?? item?.startTime, accessStart)
        const endTime = ordersNormalizeTimeField(serviceBlockTiming?.endTime ?? item?.planEndTime ?? item?.endTime, '')
        const dateYmd = ordersNormalizeDateField(serviceBlockTiming?.dateYmd ?? item?.planDateYmd ?? item?.dateYmd ?? item?.startDateYmd, startDay)
        const endDateYmd = ordersNormalizeDateField(serviceBlockTiming?.endDateYmd ?? item?.planEndDateYmd ?? item?.endDateYmd, dateYmd)
        const timedAllocation = { ...item, ...(serviceBlockTiming || {}), dateYmd, endDateYmd, startTime, endTime }
        const minutes = calendarTimelineAllocationDurationMinutes(order, timedAllocation, startTime)
        const row = calendarTimelineResolveAllocationRow(item, resources)
        const assignment = calendarTimelineAllocationWorkerAssignment(item, row)
        return {
          key: String(item?.key ?? `slot:${index + 1}`).trim(),
          allocationIdentity: calendarTimelineAllocationIdentity(timedAllocation, index),
          row,
          label: String(item?.label ?? '').trim(),
          name: assignment.name,
          workerId: assignment.workerId,
          workerLogin: assignment.workerLogin,
          workerKey: assignment.key,
          slotId: String(
            timedAllocation?.allocationId ||
              timedAllocation?.allocation_id ||
              timedAllocation?.slotId ||
              timedAllocation?.slot_id ||
              timedAllocation?.workSlotId ||
              timedAllocation?.work_slot_id ||
              '',
          ).trim(),
          teamId: String(timedAllocation?.teamId || timedAllocation?.team_id || '').trim(),
          serviceBlockId: String(
            timedAllocation?.serviceBlockId ||
              timedAllocation?.service_block_id ||
              timedAllocation?.teamId ||
              timedAllocation?.team_id ||
              '',
          ).trim(),
          serviceBlockKind: String(
            timedAllocation?.serviceBlockKind ||
              timedAllocation?.service_block_kind ||
              '',
          ).trim(),
          serviceBlockLabel: String(
            timedAllocation?.serviceBlockLabel ||
              timedAllocation?.service_block_label ||
              '',
          ).trim(),
          minutes,
          dateYmd,
          endDateYmd,
          startTime,
          endTime,
        }
      })
      .filter((item) => item.minutes > 0)
  
    const visualAllocations = calendarTimelineDedupeVisualAllocations(safeAllocations)

    if (!visualAllocations.length) {
      return ordersNormalizeOrderRows(order, resources).map((row) => ({ ...order, row }))
    }
  
    return visualAllocations.map((allocation, index) => {
      const allocationStart = ordersNormalizeTimeField(allocation.startTime, accessStart)
      const allocationDay = ordersNormalizeDateField(allocation.dateYmd, startDay)
      const end = calendarTimelineWorkSlotEndForAllocation(allocationDay, allocationStart, allocation)
      const slotKey = normalizeSearchText(allocation.allocationIdentity || allocation.key || `slot-${index + 1}`).replace(/[^a-z0-9_-]+/g, '-')
      return {
        ...order,
        id: `${String(order.id ?? 'order')}__workslot__${slotKey || index + 1}`,
        row: allocation.row,
        assignedRows: [allocation.row],
        workerAssignments: allocation.workerId || allocation.workerLogin || allocation.name
          ? [{
              row: allocation.row,
              name: allocation.name || allocation.label,
              key: allocation.workerKey,
              workerId: allocation.workerId,
              workerLogin: allocation.workerLogin,
            }]
          : ordersWorkerAssignmentsFromRows([allocation.row], resources),
        dateYmd: allocationDay,
        startTime: allocationStart,
        endDateYmd: end.endDateYmd,
        endTime: end.endTime,
        validUntil: end.endDateYmd,
        workSlotKey: allocation.key,
        workSlotIdentity: allocation.allocationIdentity,
        allocationId: allocation.slotId,
        workSlotId: allocation.slotId,
        serviceBlockId: allocation.serviceBlockId,
        serviceBlockKind: allocation.serviceBlockKind,
        serviceBlockLabel: allocation.serviceBlockLabel,
        workSlotLabel: allocation.label,
        slotWorkMinutes: allocation.minutes,
        sourceOrderId: String(order.sourceOrderId || order.id || '').trim(),
        title: `${calendarTimelineOrderTitle(order)} · ${ordersFormatWorkMinutes(allocation.minutes)}`,
      }
    })
  }
  
  function calendarTimelineSourceRowsCoverDays(days = []) {
    const start = String(appState.calendarTimelineWorkerStateRangeStart || appState.calendarTimelineWorkerStateDayKey || '').trim()
    const end = String(appState.calendarTimelineWorkerStateRangeEnd || appState.calendarTimelineWorkerStateDayKey || '').trim()
    const source = Array.isArray(days) ? days : []
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || !source.length) {
      return false
    }
    return source.every((day) => String(day ?? '') >= start && String(day ?? '') <= end)
  }
  
  function calendarTimelineRealEventHasPlace(row = {}) {
    const client = normalizeSearchText(dashboardResolveClientLabel(row))
    const zone = normalizeSearchText(dashboardResolveZoneLabel(row))
    const qr = normalizeSearchText(zoneQrCodeFromRow(row))
    const generic = new Set(['', '-', 'brak klienta', 'nieprzypisany', 'unknown', 'none'])
    return [client, zone, qr].some((value) => value && !generic.has(value))
  }
  
  function calendarTimelineRealEventIsOrder(row = {}) {
    const startIso = toIso(row?.startAt ?? row?.dayStartAt)
    const endIso = toIso(row?.endAt ?? row?.dayEndAt)
    if (!startIso && !endIso) {
      return false
    }
  
    const typeLabel = eventTypeInfo(row).label
    if (typeLabel === 'QR START' || typeLabel === 'QR STOP' || typeLabel === 'QR START + STOP') {
      return false
    }
  
    const endReason = String(row?.endReason ?? '').trim().toUpperCase()
    const status = String(row?.status ?? '').trim().toUpperCase()
    if (endReason === 'WORKDAY_STOP' || endReason === 'STOP_END_DAY' || status === 'WORKDAY_CLOSED') {
      return false
    }
  
    return calendarTimelineRealEventHasPlace(row)
  }
  
  function calendarTimelineRealEventTrack(row = {}) {
    if (!calendarTimelineRealEventIsOrder(row)) {
      return ''
    }
    const typeLabel = eventTypeInfo(row).label
    if (dashboardRowIsIndividual(row) || dashboardRowIsSpecial(row) || typeLabel === 'Zlecenie ind.' || typeLabel === 'Strefa spec.') {
      return 'client'
    }
    return ''
  }
  
  function calendarTimelineRowForRealEvent(row = {}, resources = []) {
    const index = (Array.isArray(resources) ? resources : []).findIndex((resource) =>
      calendarTimelineResourceMatchesSourceRow(resource, row),
    )
    return index >= 0 ? index : -1
  }
  
  function calendarTimelineRealEventId(row = {}, index = 0) {
    const direct = String(row?.eventId ?? row?.workdayId ?? row?.id ?? '').trim()
    if (direct) {
      return `real-${direct}`
    }
    const start = toIso(row?.startAt ?? row?.dayStartAt)
    const end = toIso(row?.endAt ?? row?.dayEndAt)
    const worker = String(row?.workerLogin ?? row?.workerName ?? '').trim()
    const zone = String(row?.zoneId ?? row?.roomId ?? row?.utilityRoomId ?? row?.strefa ?? row?.zoneName ?? '').trim()
    return `real-${normalizeSearchText([worker, zone, start, end, index].join('|')).replace(/\s+/g, '-')}`
  }
  
  function calendarTimelineIsoToDayTime(isoValue = '') {
    const iso = toIso(isoValue)
    if (!iso) {
      return null
    }
    const date = new Date(iso)
    if (!Number.isFinite(date.getTime())) {
      return null
    }
    return {
      day: calendarDateToYmd(date),
      time: `${pad2(date.getHours())}:${pad2(date.getMinutes())}`,
      timestamp: date.getTime(),
    }
  }
  
  function calendarTimelineRealEventEndIso(row = {}, startIso = '') {
    const explicitEnd = toIso(row?.endAt ?? row?.dayEndAt)
    if (explicitEnd) {
      return explicitEnd
    }
    const start = toIso(startIso)
    if (!start) {
      return ''
    }
    const startTs = new Date(start).getTime()
    if (!Number.isFinite(startTs)) {
      return ''
    }
    const durationSec = Number(row?.durationSec ?? 0)
    const durationMs = Number.isFinite(durationSec) && durationSec > 0 ? durationSec * 1000 : 60 * 60 * 1000
    const now = Date.now()
    const endTs = Math.max(startTs + 15 * 60 * 1000, Math.min(now > startTs ? now : startTs + durationMs, startTs + durationMs))
    return new Date(endTs).toISOString()
  }
  
  function calendarTimelineRealEventTitle(row = {}, track = '') {
    const companyLabel = dashboardActivityCompanyLabel(row)
    const company = dashboardActivityCleanCompanyLabel(companyLabel)
    const client = String(dashboardResolveClientLabel(row) || '').trim()
    const zone = String(dashboardResolveZoneLabel(row) || '').trim()
    const qr = String(zoneQrCodeFromRow(row) || '').trim()
    const prefix = track === 'client' ? 'Klient/spec.' : track === 'zone' ? 'Strefa' : 'START-STOP'
    if (company) {
      return `${prefix}: ${company}`
    }
    const parts = [client, zone]
      .map((value) => String(value ?? '').trim())
      .map((value) => dashboardActivityCleanCompanyLabel(value))
      .filter((value, index, list) => value && list.indexOf(value) === index)
    if (parts.length) {
      return `${prefix}: ${parts.join(' / ')}`
    }
    const qrClient = dashboardActivityCleanCompanyLabel(reportHistoryResolveClientByZoneCode(qr, ''))
    return qrClient ? `${prefix}: ${qrClient}` : prefix
  }
  
  function calendarTimelineRealDurationLabel(startTs = 0, endTs = 0) {
    const start = Number(startTs)
    const end = Number(endTs)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return '00:00h'
    }
    return `${durationSecondsToHm(Math.floor((end - start) / 1000))}h`
  }
  
  function calendarTimelineStatusDurationSeconds(row = {}) {
    const raw = String(row?.duration ?? row?.czas ?? row?.time ?? '').trim()
    if (!raw || raw === '-') {
      return 0
    }
  
    const parts = raw.match(/\d+/g)
    if (!parts?.length) {
      return 0
    }
  
    const numbers = parts.map((part) => Number(part)).filter((value) => Number.isFinite(value) && value >= 0)
    if (!numbers.length) {
      return 0
    }
  
    if (numbers.length >= 3) {
      return numbers[0] * 3600 + numbers[1] * 60 + numbers[2]
    }
    if (numbers.length === 2) {
      return numbers[0] * 3600 + numbers[1] * 60
    }
    return numbers[0] * 60
  }
  
  function calendarTimelineReadableClientLabel(value = '') {
    const label = String(value ?? '').trim()
    const normalized = normalizeSearchText(label)
    const generic = new Set(['', '-', 'brak klienta', 'nieprzypisany', 'unknown', 'none'])
    return label && !generic.has(normalized) ? label : ''
  }
  
  function calendarTimelineRealStartObjectLabel(row = {}) {
    const systemAddedLabel = calendarTimelineSystemAddedMarkerLabel(row)
    if (systemAddedLabel) {
      return systemAddedLabel
    }
  
    const companyLabel = dashboardActivityCleanCompanyLabel(dashboardActivityCompanyLabel(row))
    if (companyLabel) {
      return companyLabel
    }
  
    const client = calendarTimelineReadableClientLabel(dashboardResolveClientLabel(row))
    const qr = String(row?.dayStartObject ?? row?.startObject ?? zoneQrCodeFromRow(row) ?? '').trim()
    const qrClient = calendarTimelineReadableClientLabel(reportHistoryResolveClientByZoneCode(qr, ''))
    if (dashboardActivityCleanCompanyLabel(client)) {
      return client
    }
    if (dashboardActivityCleanCompanyLabel(qrClient)) {
      return qrClient
    }
    return ''
  }
  
  function calendarTimelineRealWorkdayIdentity(row = {}) {
    const sourceKind = String(row?.historySourceKind ?? '').trim().toLowerCase()
    const linkedWorkdayId = String(row?.linkedWorkdayId ?? row?.workday?.workdayId ?? '').trim()
    const workdayId = String(row?.workdayId ?? '').trim()
    const id = String(row?.id ?? '').trim()
  
    if (linkedWorkdayId) {
      return linkedWorkdayId
    }
    if (sourceKind === 'workday' && (workdayId || id)) {
      return workdayId || id
    }
    if (workdayId && workdayId !== String(row?.eventId ?? '').trim()) {
      return workdayId
    }
  
    return ''
  }
  
  function calendarTimelineRealWorkdayCycleKey(row = {}, rowIndex = -1, dayKey = '', startTs = 0) {
    const workdayIdentity = calendarTimelineRealWorkdayIdentity(row)
    const dayStartTs =
      calendarTimelineSourceRowWorkdayStartTimestamp(row) ||
      calendarTimelineEventTimestamp(row?.dayStartAt) ||
      Number(startTs || 0)
    const minuteKey = dayStartTs > 0 ? Math.round(dayStartTs / 60000) : 0
    const qr = String(row?.dayStartObject ?? row?.startObject ?? row?.workdayUtilityRoomId ?? '').trim()
    const qrKey = normalizeSearchText(qr) || '-'
    if (workdayIdentity) {
      return `${rowIndex}|${dayKey}|wd:${workdayIdentity}|start:${minuteKey}|${qrKey}`
    }
    return `${rowIndex}|${dayKey}|start:${minuteKey}|${qrKey}`
  }
  
  function calendarTimelineRealEventRowDay(row = {}) {
    const iso = toIso(row?.startAt ?? row?.dayStartAt ?? row?.endAt ?? row?.dayEndAt)
    if (iso) {
      return calendarDateToYmd(iso)
    }
    return dashboardResolveDayKey(row)
  }
  
  function calendarTimelineCurrentStatusRowForResource(resource = {}, dayKey = '') {
    const normalizedDay = String(dayKey ?? '').trim()
    if (resource?.type !== 'worker' || normalizedDay !== todayYmd()) {
      return null
    }
  
    const statusRows = calendarTimelineCurrentStatusRowsForDay(normalizedDay)
    const statusMatches = statusRows.filter((row) => calendarTimelineResourceMatchesSourceRow(resource, row))
    const runningStatusRow = statusMatches.find((row) => calendarTimelineStatusRowIsRunning(row))
    if (runningStatusRow) {
      return runningStatusRow
    }
    if (calendarTimelineHasCurrentStatusSnapshot(normalizedDay) || statusMatches.length) {
      return null
    }
  
    const sourceRows =
      appState.calendarTimelineWorkerStateDayKey === normalizedDay
        ? Array.isArray(appState.calendarTimelineWorkerStateSourceRows)
          ? appState.calendarTimelineWorkerStateSourceRows
          : []
        : []
    let bestSourceRow = null
    let bestSourceStartTs = 0
    sourceRows
      .filter((row) => (dashboardResolveDayKey(row) || calendarTimelineRealEventRowDay(row)) === normalizedDay)
      .filter((row) => calendarTimelineResourceMatchesSourceRow(resource, row))
      .forEach((row) => {
        const startTs =
          calendarTimelineSourceRowWorkdayStartTimestamp(row) ||
          calendarTimelineEventTimestamp(row?.dayStartAt)
        const stopTs = calendarTimelineSourceRowDayStopTimestamp(row)
        if (startTs > 0 && startTs > stopTs && startTs >= bestSourceStartTs) {
          bestSourceStartTs = startTs
          bestSourceRow = row
        }
      })
    if (bestSourceRow) {
      return bestSourceRow
    }
  
    return null
  }
  
  function calendarTimelineActiveWorkerStartMinutes(resource = {}, dayKey = '') {
    const normalizedDay = String(dayKey ?? '').trim()
    if (resource?.type !== 'worker' || normalizedDay !== todayYmd()) {
      return -1
    }
  
    const statusRows = calendarTimelineCurrentStatusRowsForDay(normalizedDay)
    const statusMatches = statusRows.filter((row) => calendarTimelineResourceMatchesSourceRow(resource, row))
    const statusMinutes = statusMatches
      .filter((row) => calendarTimelineStatusRowIsRunning(row))
      .map((row) => calendarTimelineRowStartMinutes(row))
      .filter((minutes) => Number.isFinite(minutes) && minutes >= 0)
    if (statusMinutes.length) {
      return Math.max(...statusMinutes)
    }
    if (calendarTimelineHasCurrentStatusSnapshot(normalizedDay) || statusMatches.length) {
      return -1
    }
  
    const sourceRows =
      appState.calendarTimelineWorkerStateDayKey === normalizedDay
        ? Array.isArray(appState.calendarTimelineWorkerStateSourceRows)
          ? appState.calendarTimelineWorkerStateSourceRows
          : []
        : []
    let latestCycleStartTs = 0
    let latestStopTs = 0
    sourceRows
      .filter((row) => (dashboardResolveDayKey(row) || calendarTimelineRealEventRowDay(row)) === normalizedDay)
      .filter((row) => calendarTimelineResourceMatchesSourceRow(resource, row))
      .forEach((row) => {
        const startTs =
          calendarTimelineSourceRowWorkdayStartTimestamp(row) ||
          calendarTimelineEventTimestamp(row?.dayStartAt)
        if (startTs > 0) {
          latestCycleStartTs = Math.max(latestCycleStartTs, startTs)
        }
        const stopTs = calendarTimelineSourceRowDayStopTimestamp(row)
        if (stopTs > 0) {
          latestStopTs = Math.max(latestStopTs, stopTs)
        }
      })
    if (latestCycleStartTs > 0 && latestCycleStartTs > latestStopTs) {
      return calendarTimelineTimestampToMinutes(new Date(latestCycleStartTs).toISOString())
    }
  
    const stateMap = calendarTimelineBuildWorkerStateMap(normalizedDay)
    const eventStateMinutes = [...calendarTimelineWorkerAliasKeys(resource.worker)].reduce((best, key) => {
      const state = stateMap.get(key)
      if (state?.sourceOfTruth === 'events' && state?.isRunning) {
        const minutes = Number(state?.startMinutes ?? -1)
        if (Number.isFinite(minutes) && minutes >= 0) {
          return Math.max(best, minutes)
        }
      }
      return best
    }, -1)
    if (eventStateMinutes >= 0) {
      return eventStateMinutes
    }
    return -1
  }

  function calendarTimelineDeduplicateContainedRealWorkdayOrders(orders = []) {
    const source = Array.isArray(orders) ? orders : []
    const intervals = source.map((order, index) => {
      const bounds = calendarTimelineOrderPlannedBounds(order)
      return {
        order,
        index,
        bounds,
        row: Number(order?.row),
        day: String(bounds?.startDay ?? order?.dateYmd ?? '').trim(),
        duration: bounds ? bounds.endTs - bounds.startTs : 0,
      }
    })
    const containedIndexes = new Set()
    intervals.forEach((item) => {
      if (!item.bounds || item.order?.realTrack !== 'workday' || containedIndexes.has(item.index)) {
        return
      }
      intervals.forEach((other) => {
        if (
          other.index === item.index ||
          !other.bounds ||
          other.order?.realTrack !== 'workday' ||
          other.row !== item.row ||
          other.day !== item.day
        ) {
          return
        }
        const isCovered =
          other.duration > item.duration + 5 * 60 * 1000 &&
          other.bounds.startTs <= item.bounds.startTs + 60 * 1000 &&
          other.bounds.endTs >= item.bounds.endTs - 60 * 1000
        if (isCovered) {
          containedIndexes.add(item.index)
        }
      })
    })
    return source.filter((_, index) => !containedIndexes.has(index))
  }
  
  function calendarTimelineRealWorkdayOrders(resources = [], days = [], sourceRows = []) {
    const visibleDays = new Set((Array.isArray(days) ? days : []).map((day) => String(day ?? '').trim()).filter(Boolean))
    const buckets = new Map()
  
    ;(Array.isArray(sourceRows) ? sourceRows : []).forEach((row) => {
      const rowIndex = calendarTimelineRowForRealEvent(row, resources)
      const dayKey = calendarTimelineRealEventRowDay(row)
      if (rowIndex < 0 || !visibleDays.has(dayKey)) {
        return
      }
  
      const startTs = calendarTimelineEventsRowStartTimestamp(row) || calendarTimelineEventTimestamp(row?.startAt ?? row?.dayStartAt)
      const workdayStartTs =
        calendarTimelineSourceRowWorkdayStartTimestamp(row) ||
        calendarTimelineEventTimestamp(row?.dayStartAt)
      const endTs = calendarTimelineEventsRowStopTimestamp(row) || calendarTimelineEventTimestamp(row?.endAt ?? row?.dayEndAt)
      if (!startTs && !endTs) {
        return
      }
  
      const key = calendarTimelineRealWorkdayCycleKey(row, rowIndex, dayKey, startTs || workdayStartTs)
      if (!buckets.has(key)) {
        buckets.set(key, {
          dayKey,
          rowIndex,
          cycleKey: key,
          firstStartTs: 0,
          latestActivityEndTs: 0,
          latestDayStopTs: 0,
          latestCycleStartTs: 0,
          startObjectLabel: '',
          companyLabel: '',
          clientLabel: '',
          addressLabel: '',
          sourceEventId: '',
          workdayId: '',
          sourceStartAt: '',
        })
      }
      const bucket = buckets.get(key)
      if (workdayStartTs > 0) {
        if (!bucket.firstStartTs || workdayStartTs < bucket.firstStartTs) {
          bucket.firstStartTs = workdayStartTs
          bucket.startObjectLabel = calendarTimelineRealStartObjectLabel(row)
          bucket.companyLabel = dashboardActivityCompanyLabel(row)
          bucket.clientLabel = dashboardResolveClientLabel(row)
          bucket.addressLabel = String(row?.lokalizacja ?? row?.location ?? row?.address ?? '').trim()
          bucket.sourceEventId = String(row?.eventId ?? '').trim()
          bucket.workdayId = calendarTimelineRealWorkdayIdentity(row) || String(row?.workdayId ?? row?.id ?? '').trim()
          bucket.sourceStartAt = new Date(workdayStartTs).toISOString()
        }
      }
      if (workdayStartTs > 0) {
        bucket.latestCycleStartTs = Math.max(bucket.latestCycleStartTs, workdayStartTs)
        if (!bucket.clientLabel) {
          bucket.clientLabel = dashboardResolveClientLabel(row)
        }
        if (!dashboardActivityCleanCompanyLabel(bucket.companyLabel)) {
          bucket.companyLabel = dashboardActivityCompanyLabel(row)
        }
        if (!bucket.addressLabel) {
          bucket.addressLabel = String(row?.lokalizacja ?? row?.location ?? row?.address ?? '').trim()
        }
      }
      if (endTs > 0) {
        bucket.latestActivityEndTs = Math.max(bucket.latestActivityEndTs, endTs)
      }
      const dayStopTs = calendarTimelineSourceRowDayStopTimestamp(row)
      if (dayStopTs > 0) {
        bucket.latestDayStopTs = Math.max(bucket.latestDayStopTs, dayStopTs)
      }
    })
  
    const orders = [...buckets.values()]
      .map((bucket) => {
        const now = Date.now()
        const hasExplicitDayStop = bucket.latestDayStopTs > 0
        const resource = resources[bucket.rowIndex] ?? null
        const statusRow = calendarTimelineCurrentStatusRowForResource(resource, bucket.dayKey)
        const activeStartMinutes = calendarTimelineActiveWorkerStartMinutes(resource, bucket.dayKey)
        const fallbackStartTs =
          Number.isFinite(activeStartMinutes) && activeStartMinutes >= 0
            ? calendarTimelineTimestampFromDayMinutes(bucket.dayKey, activeStartMinutes)
            : 0
        const hasActiveStatus = Number.isFinite(activeStartMinutes) && activeStartMinutes >= 0
        const hasCurrentStatusSnapshot = calendarTimelineHasCurrentStatusSnapshot(bucket.dayKey)
        const startTs =
          bucket.firstStartTs ||
          (!hasExplicitDayStop && fallbackStartTs > 0 ? fallbackStartTs : 0) ||
          bucket.latestCycleStartTs ||
          bucket.latestDayStopTs ||
          bucket.latestActivityEndTs
        if (!startTs) {
          return null
        }
        const shouldRunToNow =
          !hasExplicitDayStop &&
          bucket.dayKey === todayYmd() &&
          bucket.latestCycleStartTs > bucket.latestDayStopTs &&
          (!hasCurrentStatusSnapshot || hasActiveStatus)
        const endTs =
          bucket.latestDayStopTs ||
          (shouldRunToNow
            ? Math.max(now, startTs + 15 * 60 * 1000)
            : bucket.latestActivityEndTs || startTs + 60 * 60 * 1000)
        const systemClosed = !hasExplicitDayStop && !shouldRunToNow
        const startIso = new Date(startTs).toISOString()
        const endIso = new Date(Math.max(endTs, startTs + 15 * 60 * 1000)).toISOString()
        const start = calendarTimelineIsoToDayTime(startIso)
        const end = calendarTimelineIsoToDayTime(endIso)
        if (!start || !end) {
          return null
        }
        const durationLabel = calendarTimelineRealDurationLabel(start.timestamp, end.timestamp)
        const latestQrCompanyLabel = dashboardActivityLatestQrCompanyLabelForRow(
          resource?.worker ?? statusRow ?? {},
          bucket.dayKey,
          sourceRows,
        )
        const bucketCompanyLabel = dashboardActivityCleanCompanyLabel(bucket.companyLabel) || latestQrCompanyLabel
        const fallbackTitle = statusRow
          ? dashboardActivityCleanCompanyLabel(dashboardActivityCompanyLabel(statusRow)) ||
            latestQrCompanyLabel ||
            calendarTimelineRealStartObjectLabel(statusRow)
          : ''
        const titleParts = [bucketCompanyLabel || bucket.startObjectLabel || fallbackTitle || 'Klient nieustalony', durationLabel]
        const title = titleParts.join(' · ')
        return {
          id: `real-workday-${bucket.rowIndex}-${bucket.dayKey}-${bucket.cycleKey}`,
          sourceEventId: bucket.sourceEventId,
          workdayId: bucket.workdayId,
          row: bucket.rowIndex,
          assignedRows: [bucket.rowIndex],
          workerAssignments: ordersWorkerAssignmentsFromRows([bucket.rowIndex], resources),
          dateYmd: start.day,
          startTime: start.time,
          endDateYmd: end.day,
          endTime: end.time,
          validUntil: end.day,
          nextDate: start.day,
          title,
          clientLabel: bucketCompanyLabel || bucket.clientLabel,
          addressLabel: bucket.addressLabel,
          type: 'other',
          tone: 'steel',
          actualStartAt: startIso,
          sourceStartAt: bucket.sourceStartAt || startIso,
          actualEndAt: hasExplicitDayStop || systemClosed ? endIso : '',
          status: hasExplicitDayStop || systemClosed ? 'CLOSED' : 'RUNNING',
          completed: hasExplicitDayStop || systemClosed,
          systemClosed,
          isRealEvent: true,
          realTrack: 'workday',
          realTrackIndex: 0,
        }
      })
      .filter(Boolean)
    return calendarTimelineDeduplicateContainedRealWorkdayOrders(orders)
  }
  
  function calendarTimelineStatusRowsForRealOrders(days = []) {
    const visibleDays = new Set((Array.isArray(days) ? days : []).map((day) => String(day ?? '').trim()).filter(Boolean))
    const today = todayYmd()
    if (!visibleDays.has(today)) {
      return []
    }
  
    const rows = Array.isArray(appState.calendarTimelineCurrentWorkerStatusRows) && appState.calendarTimelineCurrentWorkerStatusRows.length
      ? appState.calendarTimelineCurrentWorkerStatusRows
      : Array.isArray(appState.dashboardTodayRows)
        ? appState.dashboardTodayRows
        : []
  
    return rows.map((row) => ({ row, dayKey: today }))
  }
  
  function calendarTimelineStatusRowClosedHint(row = {}) {
    const values = [
      row?.status,
      row?.statusLabel,
      row?.state,
      row?.workerStatus,
      row?.workStatus,
      row?.activeStatus,
      row?.qrStatus,
    ]
      .map((value) => normalizeSearchText(value))
      .filter(Boolean)
    if (!values.length) {
      return false
    }
    const closedValues = new Set([
      'ok',
      'closed',
      'complete',
      'completed',
      'done',
      'finished',
      'stopped',
      'stop',
      'inactive',
      'offline',
      'nieaktywny',
      'nieaktywna',
      'zakonczone',
      'zakonczony',
      'zakonczona',
      'zamkniete',
      'zamkniety',
      'zamknieta',
      'po pracy',
      'brak startu',
      'brak aktywnosci',
    ])
    return values.some((value) => closedValues.has(value))
  }
  
  function calendarTimelineStatusRowIsRunning(row = {}) {
    const stopLabel = String(row?.qrStop ?? '').trim()
    const hasStop =
      calendarTimelineRowStopMinutes(row) >= 0 ||
      Boolean(stopLabel && stopLabel !== '-' && stopLabel !== '--:--' && stopLabel !== '--:--:--')
    const hasStart = calendarTimelineRowStartMinutes(row) >= 0
    if (calendarTimelineStatusRowClosedHint(row)) {
      return false
    }
    if (Object.prototype.hasOwnProperty.call(row, 'isRunning')) {
      return Boolean(row?.isRunning) && hasStart && !hasStop
    }
    if (!hasStart || hasStop) {
      return false
    }
    const runningValues = new Set(['running', 'open', 'w trakcie', 'rozpoczety', 'rozpoczeta'])
    return [row?.status, row?.statusLabel, row?.state, row?.workStatus, row?.qrStatus]
      .map((value) => normalizeSearchText(value))
      .some((value) => runningValues.has(value))
  }
  
  function calendarTimelineStatusFallbackRow(resource = {}, startMinutes = -1, sourceRow = null) {
    const minutes = Number(startMinutes)
    return {
      ...(sourceRow && typeof sourceRow === 'object' ? sourceRow : {}),
      workerName: resource?.name || resource?.worker?.workerName || resource?.worker?.name || '',
      workerLogin: resource?.worker?.workerLogin || resource?.worker?.login || resource?.worker?.id || '',
      workerId: resource?.worker?.workerId || resource?.worker?.id || '',
      qrStart: Number.isFinite(minutes) && minutes >= 0 ? `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}` : '',
      qrStop: '-',
      isRunning: true,
    }
  }
  
  function calendarTimelineBuildRealStatusOrder(row = {}, dayKey = '', rowIndex = -1, index = 0, resources = []) {
    const startMinutes = calendarTimelineRowStartMinutes(row)
    if (!Number.isFinite(startMinutes) || startMinutes < 0 || rowIndex < 0) {
      return null
    }
  
    const startTs = calendarTimelineTimestampFromDayMinutes(dayKey, startMinutes)
    if (!startTs) {
      return null
    }
  
    const isRunning = calendarTimelineStatusRowIsRunning(row)
    const stopMinutes = calendarTimelineRowStopMinutes(row)
    const durationSec = calendarTimelineStatusDurationSeconds(row)
    const now = Date.now()
    let endTs = 0
    if (!isRunning && Number.isFinite(stopMinutes) && stopMinutes >= 0) {
      endTs = calendarTimelineTimestampFromDayMinutes(dayKey, stopMinutes)
      if (endTs <= startTs) {
        endTs = calendarTimelineTimestampFromDayMinutes(calendarAddDays(dayKey, 1), stopMinutes)
      }
    } else if (isRunning) {
      endTs = Math.max(now, startTs + 15 * 60 * 1000)
    } else if (durationSec > 0) {
      endTs = startTs + durationSec * 1000
    }
  
    if (!endTs || endTs <= startTs) {
      return null
    }
  
    const startIso = new Date(startTs).toISOString()
    const endIso = new Date(endTs).toISOString()
    const start = calendarTimelineIsoToDayTime(startIso)
    const end = calendarTimelineIsoToDayTime(endIso)
    if (!start || !end) {
      return null
    }
  
    const durationLabel = calendarTimelineRealDurationLabel(start.timestamp, end.timestamp)
    const resource = resources[rowIndex] ?? null
    const sourceRows =
      appState.calendarTimelineWorkerStateDayKey === dayKey && Array.isArray(appState.calendarTimelineWorkerStateSourceRows)
        ? appState.calendarTimelineWorkerStateSourceRows
        : []
    const latestQrCompanyLabel = dashboardActivityLatestQrCompanyLabelForRow(resource?.worker ?? row, dayKey, sourceRows)
    const companyLabel = dashboardActivityCleanCompanyLabel(dashboardActivityCompanyLabel(row)) || latestQrCompanyLabel
    const titleLabel =
      companyLabel ||
      calendarTimelineRealStartObjectLabel(row) ||
      'Klient nieustalony'
  
    return {
      id: `real-status-${rowIndex}-${dayKey}-${index}`,
      row: rowIndex,
      assignedRows: [rowIndex],
      workerAssignments: ordersWorkerAssignmentsFromRows([rowIndex], resources),
      dateYmd: start.day,
      startTime: start.time,
      endDateYmd: end.day,
      endTime: end.time,
      validUntil: end.day,
      nextDate: start.day,
      title: `${titleLabel} · ${durationLabel}`,
      clientLabel: companyLabel || dashboardResolveClientLabel(row),
      addressLabel: String(row?.activeLocation ?? row?.lokalizacja ?? row?.location ?? '').trim(),
      type: 'other',
      tone: 'steel',
      actualStartAt: startIso,
      sourceStartAt: startIso,
      actualEndAt: isRunning ? '' : endIso,
      status: isRunning ? 'RUNNING' : 'CLOSED',
      completed: !isRunning,
      isRealEvent: true,
      realTrack: 'workday',
      realTrackIndex: 0,
    }
  }
  
  function calendarTimelineRealStatusOrders(resources = [], days = [], existingOrders = []) {
    const existingKeys = new Set(
      (Array.isArray(existingOrders) ? existingOrders : [])
        .filter((order) => order?.realTrack === 'workday')
        .map((order) => `${Number(order?.row)}|${String(order?.dateYmd ?? '').trim()}`),
    )
  
    const orders = []
    const usedKeys = new Set(existingKeys)
    const addOrder = (row, dayKey, rowIndex, index) => {
      const key = `${rowIndex}|${dayKey}`
      if (usedKeys.has(key)) {
        return
      }
      const order = calendarTimelineBuildRealStatusOrder(row, dayKey, rowIndex, index, resources)
      if (!order) {
        return
      }
      usedKeys.add(key)
      orders.push(order)
    }
  
    calendarTimelineStatusRowsForRealOrders(days).forEach(({ row, dayKey }, index) => {
      const rowIndex = calendarTimelineRowForRealEvent(row, resources)
      if (rowIndex >= 0) {
        addOrder(row, dayKey, rowIndex, index)
      }
    })
  
    const today = todayYmd()
    const visibleDays = new Set((Array.isArray(days) ? days : []).map((day) => String(day ?? '').trim()).filter(Boolean))
    if (visibleDays.has(today)) {
      ;(Array.isArray(resources) ? resources : []).forEach((resource, rowIndex) => {
        if (resource?.type !== 'worker') {
          return
        }
        const activeStartMinutes = calendarTimelineActiveWorkerStartMinutes(resource, today)
        if (!Number.isFinite(activeStartMinutes) || activeStartMinutes < 0) {
          return
        }
        const statusRow = calendarTimelineCurrentStatusRowForResource(resource, today)
        addOrder(calendarTimelineStatusFallbackRow(resource, activeStartMinutes, statusRow), today, rowIndex, `state-${rowIndex}`)
      })
    }
  
    return orders
  }
  
  function calendarTimelineEnsureActiveWorkerStatusOrders(orders = [], resources = [], days = []) {
    const result = Array.isArray(orders) ? [...orders] : []
    const today = todayYmd()
    const visibleDays = new Set((Array.isArray(days) ? days : []).map((day) => String(day ?? '').trim()).filter(Boolean))
    if (!visibleDays.has(today)) {
      return result
    }
  
    const stateMap = calendarTimelineBuildWorkerStateMap(today)
    ;(Array.isArray(resources) ? resources : []).forEach((resource, rowIndex) => {
      if (resource?.type !== 'worker') {
        return
      }
  
      const isRunning = [...calendarTimelineWorkerAliasKeys(resource.worker)].some((key) => Boolean(stateMap.get(key)?.isRunning))
      if (!isRunning) {
        return
      }
      const activeStartMinutes = calendarTimelineActiveWorkerStartMinutes(resource, today)
      if (!Number.isFinite(activeStartMinutes) || activeStartMinutes < 0) {
        return
      }
  
      const statusRow = calendarTimelineCurrentStatusRowForResource(resource, today)
      const fallbackOrder = calendarTimelineBuildRealStatusOrder(
        calendarTimelineStatusFallbackRow(resource, activeStartMinutes, statusRow),
        today,
        rowIndex,
        `active-${rowIndex}`,
        resources,
      )
      if (!fallbackOrder) {
        return
      }
      const fallbackBounds = calendarTimelineOrderPlannedBounds(fallbackOrder)
  
      for (let index = result.length - 1; index >= 0; index -= 1) {
        const order = result[index]
        if (
          order?.isRealEvent &&
          order?.realTrack === 'workday' &&
          Number(order?.row) === rowIndex &&
          String(order?.dateYmd ?? '').trim() === today
        ) {
          const orderBounds = calendarTimelineOrderPlannedBounds(order)
          const orderClosed = Boolean(order?.completed || toIso(order?.actualEndAt) || String(order?.status ?? '').trim().toUpperCase() === 'CLOSED')
          const closedBeforeFallback =
            orderClosed &&
            orderBounds?.endTs &&
            fallbackBounds?.startTs &&
            orderBounds.endTs <= fallbackBounds.startTs + 60 * 1000
          if (closedBeforeFallback) {
            continue
          }
          result.splice(index, 1)
        }
      }
      result.push(fallbackOrder)
    })
  
    return result
  }
  
  function calendarTimelineRealEventOrders(resources = [], days = [], plannedOrders = []) {
    const visibleDays = new Set((Array.isArray(days) ? days : []).map((day) => String(day ?? '').trim()).filter(Boolean))
    const sourceRows = calendarTimelineSourceRowsCoverDays(days) && Array.isArray(appState.calendarTimelineWorkerStateSourceRows)
      ? appState.calendarTimelineWorkerStateSourceRows
      : []
    const plannedEventKeys = new Set(
      (Array.isArray(plannedOrders) ? plannedOrders : [])
        .flatMap((order) => calendarTimelineOrderSourceKeys(order))
        .filter(Boolean),
    )
    const seen = new Set()
  
    const workdayOrders = calendarTimelineRealWorkdayOrders(resources, days, sourceRows)
    const statusFallbackOrders = calendarTimelineRealStatusOrders(resources, days, workdayOrders)
    const eventOrders = sourceRows
      .map((row, index) => ({ row, index }))
      .map(({ row, index }) => ({ row, index, track: calendarTimelineRealEventTrack(row) }))
      .filter(({ track }) => track)
      .map(({ row, index, track }) => {
        const startIso = toIso(row?.startAt ?? row?.dayStartAt) || toIso(row?.endAt ?? row?.dayEndAt)
        const endIso = calendarTimelineRealEventEndIso(row, startIso)
        const start = calendarTimelineIsoToDayTime(startIso)
        const end = calendarTimelineIsoToDayTime(endIso)
        if (!start || !end || !visibleDays.has(start.day)) {
          return null
        }
        const rowIndex = calendarTimelineRowForRealEvent(row, resources)
        if (rowIndex < 0) {
          return null
        }
        const id = calendarTimelineRealEventId(row, index)
        const rowKeys = calendarTimelineSourceRowKeys(row)
        if (rowKeys.some((key) => plannedEventKeys.has(key))) {
          return null
        }
        if (seen.has(id)) {
          return null
        }
        seen.add(id)
  
        const completed = Boolean(toIso(row?.endAt ?? row?.dayEndAt)) || normalizeEventStatus(row?.status, Boolean(row?.endAt)) === 'CLOSED'
        const durationLabel = calendarTimelineRealDurationLabel(start.timestamp, end.timestamp)
        return {
          id,
          sourceEventId: String(row?.eventId ?? '').trim(),
          workdayId: String(row?.workdayId ?? '').trim(),
          row: rowIndex,
          assignedRows: [rowIndex],
          workerAssignments: ordersWorkerAssignmentsFromRows([rowIndex], resources),
          dateYmd: start.day,
          startTime: start.time,
          endDateYmd: end.day,
          endTime: end.time,
          validUntil: end.day,
          nextDate: start.day,
          title: `${start.time}-${end.time} ${calendarTimelineRealEventTitle(row, track)}${durationLabel ? ` · ${durationLabel}` : ''}`,
          clientLabel: dashboardResolveClientLabel(row),
          addressLabel: String(row?.lokalizacja ?? row?.location ?? row?.address ?? '').trim(),
          type: 'other',
          tone: ordersTimelineToneForType('other'),
          actualStartAt: startIso,
          actualEndAt: toIso(row?.endAt ?? row?.dayEndAt),
          status: completed ? 'CLOSED' : 'RUNNING',
          completed,
          isRealEvent: true,
          realTrack: track,
          realTrackIndex: track === 'client' ? 1 : 2,
        }
      })
      .filter(Boolean)
    return calendarTimelineEnsureActiveWorkerStatusOrders(
      [...workdayOrders, ...statusFallbackOrders, ...eventOrders],
      resources,
      days,
    )
  }

  function calendarTimelineOrderCacheSignature(orders = []) {
    const source = Array.isArray(orders) ? orders : []
    if (!source.length) {
      return '0'
    }
    const compactAllocation = (allocation = {}, index = 0) => [
      allocation?.key ?? index,
      allocation?.row ?? '',
      allocation?.workerId ?? '',
      allocation?.workerLogin ?? '',
      allocation?.dateYmd ?? allocation?.planDateYmd ?? allocation?.startDateYmd ?? '',
      allocation?.endDateYmd ?? allocation?.planEndDateYmd ?? '',
      allocation?.startTime ?? allocation?.planStartTime ?? '',
      allocation?.endTime ?? allocation?.planEndTime ?? '',
      allocation?.minutes ?? allocation?.workMinutes ?? allocation?.durationMinutes ?? '',
    ].map((value) => String(value ?? '').trim()).join('~')
    const compactOrder = (order = {}, index = 0) => [
      order?.id ?? index,
      order?.sourceOrderId ?? '',
      order?.dateYmd ?? '',
      order?.endDateYmd ?? '',
      order?.startTime ?? '',
      order?.endTime ?? '',
      order?.status ?? '',
      order?.type ?? '',
      order?.scheduleMode ?? order?.mode ?? '',
      Array.isArray(order?.workAllocations) ? order.workAllocations.map(compactAllocation).join(';') : '',
      order?.updatedAt ?? order?.updated_at ?? '',
    ].map((value) => String(value ?? '').trim()).join(',')
    if (source.length > 500) {
      return [
        source.length,
        compactOrder(source[0], 0),
        compactOrder(source[Math.floor(source.length / 2)], Math.floor(source.length / 2)),
        compactOrder(source[source.length - 1], source.length - 1),
      ].join('|')
    }
    return `${source.length}:${source.map((order, index) => compactOrder(order, index)).join('|')}`
  }

  function calendarTimelineResourcesCacheSignature(resources = []) {
    const source = Array.isArray(resources) ? resources : []
    return `${source.length}:${source.map((resource, index) => [
      resource?.key ?? index,
      resource?.name ?? '',
      resource?.type ?? '',
      resource?.started ? '1' : '0',
    ].map((value) => String(value ?? '').trim()).join(',')).join('|')}`
  }

  function calendarTimelineBuildModel(days = [], hours = []) {
    const resources = calendarTimelineResources()
    const sourceOrders = ordersListSourceOrders()
    const selectedTypes = calendarTimelineSelectedTypes()
    const sourceRows = calendarTimelineSourceRowsCoverDays(days) && Array.isArray(appState.calendarTimelineWorkerStateSourceRows)
      ? appState.calendarTimelineWorkerStateSourceRows
      : []
    const cacheKey = [
      days.join(','),
      hours.join(','),
      appState.calendarTimelineShowCompleted !== false ? 'completed:on' : 'completed:off',
      [...selectedTypes].sort().join(','),
      calendarTimelineResourcesCacheSignature(resources),
      calendarTimelineOrderCacheSignature(sourceOrders),
      calendarTimelineRowsCacheSignature(sourceRows),
      appState.calendarTimelineWorkerStateFetchedAt || 0,
    ].join('::')
    if (calendarTimelineModelCache.key === cacheKey && calendarTimelineModelCache.value) {
      return calendarTimelineModelCache.value
    }

    const plannedOrders = calendarTimelineExpandRecurringOrdersForDays(sourceOrders, days)
    const realWorkdayOrders = calendarTimelineRealWorkdayOrders(resources, days, sourceRows)
    const realStatusOrders = calendarTimelineRealStatusOrders(resources, days, realWorkdayOrders)
    const realOrders = calendarTimelineEnsureActiveWorkerStatusOrders(
      [...realWorkdayOrders, ...realStatusOrders],
      resources,
      days,
    )
    const bars = calendarTimelineVisualOrders([...plannedOrders, ...realOrders], resources)
    const layout = calendarTimelineLayoutEventBars(bars, days, hours, resources, selectedTypes)
    const deltaData = calendarTimelineDeltaData(layout.items, days, hours, resources)
    const realTrackCounts = new Map()
    realOrders.forEach((order) => {
      const row = Number(order?.row)
      const trackIndex = Number(order?.realTrackIndex ?? 0)
      if (!Number.isInteger(row) || row < 0 || !Number.isFinite(trackIndex)) {
        return
      }
      realTrackCounts.set(row, Math.max(Number(realTrackCounts.get(row) ?? 0), Math.floor(trackIndex) + 1))
    })
    const plannedLaneCounts = new Map()
    const timelineLaneCounts = new Map()
    layout.items.forEach((item) => {
      const row = Number(item?.bar?.row)
      if (!Number.isInteger(row) || row < 0) {
        return
      }
      const laneCount = Number(item?.laneCount || 1)
      timelineLaneCounts.set(row, Math.max(Number(timelineLaneCounts.get(row) || 0), laneCount))
      if (!item?.bar?.isRealEvent) {
        plannedLaneCounts.set(row, Math.max(Number(plannedLaneCounts.get(row) || 0), laneCount))
      }
    })

    const model = {
      cacheKey,
      resources,
      layout,
      deltaData,
      realTrackCounts,
      plannedLaneCounts,
      timelineLaneCounts,
    }
    calendarTimelineModelCache.key = cacheKey
    calendarTimelineModelCache.value = model
    return model
  }
  
  function calendarTimelinePrototypeHtml() {
    const range = calendarTimelineRangeForView()
    if (range.mode === 'month') {
      return calendarTimelineMonthHtml()
    }
    const days = range.days
    const hours = Array.from({ length: 20 }, (_, index) => index + 4)
    const slotsPerHour = CALENDAR_TIMELINE_SLOTS_PER_HOUR
    const slotsPerDay = hours.length * slotsPerHour
    const totalSlots = days.length * slotsPerDay
    const model = calendarTimelineBuildModel(days, hours)
    const {
      resources,
      layout,
      deltaData,
      realTrackCounts,
      plannedLaneCounts,
      timelineLaneCounts,
    } = model
    appState.calendarTimelineVisibleConflictItems = calendarTimelineConflictItemsFromLayout(layout.items, resources)
    appState.calendarTimelinePlannedLaneCounts = plannedLaneCounts
    appState.calendarTimelineRealTrackCounts = realTrackCounts
    appState.calendarTimelineLaneCounts = timelineLaneCounts
    appState.calendarTimelineDeltaCounts = deltaData.rowDeltaCounts
    const bufferIndex = resources.findIndex((resource) => resource?.type === 'buffer')
    const rowHeights = resources.map((resource, rowIndex) => ({
      resource,
      height: calendarTimelineResourceRowHeight(rowIndex, resource),
    }))
    const bufferHeight = bufferIndex >= 0 ? rowHeights[bufferIndex]?.height || 0 : 0
    const workerRowsHeight = rowHeights
      .filter(({ resource }) => resource?.type !== 'buffer')
      .reduce((sum, { height }) => sum + height, 0)
    const workerRowHeights = rowHeights
      .map(({ resource, height }) => (resource?.type === 'buffer' ? '' : `${height}px`))
      .filter(Boolean)
      .join(' ')
    appState.calendarTimelineStageHeight = bufferHeight + 30 + 28 + workerRowsHeight + 24
    const gridRows = `${bufferHeight}px 30px 28px${workerRowHeights ? ` ${workerRowHeights}` : ''}`
    const bufferPlane =
      bufferIndex >= 0
        ? `<div class="fw-buffer-sticky-plane" style="grid-column:2 / span ${totalSlots}; grid-row:1;" aria-hidden="true"></div>`
        : ''
    const dayHeaders = days
      .map((day, index) => {
        const label = calendarTimelineDayMonthLabel(day)
        return `<div class="fw-date-head${index % 2 ? ' fw-date-head--alt' : ''}" style="grid-column:${index * slotsPerDay + 2} / span ${slotsPerDay}; grid-row:2;">${escapeHtml(label)}</div>`
      })
      .join('')
    const hourHeaders = days
      .flatMap((day, dayIndex) =>
        hours.map((hour, hourIndex) => {
          const slot = dayIndex * slotsPerDay + hourIndex * slotsPerHour + 1
          const classes = ['fw-hour-head']
          if (hourIndex === 0) classes.push('fw-hour-head--day-start')
          if (dayIndex % 2) classes.push('fw-hour-head--alt')
          return `<div class="${classes.join(' ')}" style="grid-column:${slot + 1} / span ${slotsPerHour}; grid-row:3;">${pad2(hour)}:00</div>`
        }),
      )
      .join('')
    const daySeparators = days
      .slice(1)
      .map((_, index) => {
        const dayIndex = index + 1
        return `<div class="fw-day-separator" style="grid-column:${dayIndex * slotsPerDay + 2}; grid-row:1 / -1;" aria-hidden="true"></div>`
      })
      .join('')
    const workerHead = '<div class="fw-resource-worker-head" style="grid-row:2 / span 2;">Pracownik</div>'
    const rowLabels = resources
      .map((resource, index) => {
        const muted = resource.type === 'buffer' ? ' is-buffer' : resource.type === 'placeholder' ? ' is-placeholder' : ''
        const workerClass = resource.type === 'worker' ? ' is-worker' : ''
        const started = resource.type === 'worker' && resource.started ? ' is-started' : ''
        const rowAltClass = resource.type === 'worker' && index % 2 === 0 ? ' is-row-alt' : ''
        const rowDeltas = resource.type === 'worker' ? deltaData.rowDeltas.get(index) || [] : []
        const deltaBadges = rowDeltas
          .map((delta) => `<span class="fw-resource-delta fw-resource-delta--${escapeHtml(delta.kind)}" title="${escapeHtml(delta.title)}">${escapeHtml(delta.label)}</span>`)
          .join('')
        const deltaClass = deltaBadges ? ' has-deltas' : ''
        const gridRow = calendarTimelineGridRowForResource(resource, index)
        const typeBadge = resource.type === 'worker' ? calendarTimelineWorkerTypeBadge(resource.worker) : null
        const typeClass = typeBadge ? ` is-worker-type-${escapeHtml(typeBadge.className)}` : ''
        const typeBadgeHtml = typeBadge
          ? `<span class="fw-resource-type-badge fw-resource-type-badge--${escapeHtml(typeBadge.className)} ${resource.started ? 'is-worker-status-started' : 'is-worker-status-idle'}" title="${escapeHtml(typeBadge.title)}">${escapeHtml(typeBadge.label)}</span>`
          : ''
        const avatar =
          resource.type === 'worker'
            ? `<b class="fw-resource-avatar ${calendarTimelineResourceAvatarTone(index)}" aria-hidden="true">${escapeHtml(calendarSafeInitials(resource.name))}</b>`
            : ''
        return `
          <div class="fw-resource-name${muted}${workerClass}${started}${rowAltClass}${deltaClass}${typeClass}" style="grid-row:${gridRow};" data-calendar-timeline-row="${index}">
            ${avatar}
            <span class="fw-resource-label">
              <span class="fw-resource-label-main">
                <span class="fw-resource-label-name">${escapeHtml(resource.name)}</span>
                ${typeBadgeHtml}
              </span>
              ${deltaBadges ? `<span class="fw-resource-deltas">${deltaBadges}</span>` : ''}
            </span>
            ${resource.type === 'worker' && !typeBadge ? '<i aria-hidden="true"></i>' : ''}
          </div>
        `
      })
      .join('')
    const rowTracks = resources
      .map((resource = {}, rowIndex) => {
        const classes = ['fw-grid-row']
        if (resource.type === 'buffer') classes.push('fw-grid-row--buffer')
        if (resource.type === 'worker' && rowIndex % 2 === 0) classes.push('fw-grid-row--alt')
        if (resource.type === 'worker') {
          const kind = calendarTimelineWorkerTypeKind(resource.worker)
          if (kind === 'mobile') classes.push('fw-grid-row--worker-mobile')
          if (kind === 'coordinator') classes.push('fw-grid-row--worker-coordinator')
          if (kind === 'site') classes.push('fw-grid-row--worker-site')
          if (kind === 'admin') classes.push('fw-grid-row--worker-admin')
        }
        return `<div class="${classes.join(' ')}" style="grid-column:2 / span ${totalSlots}; grid-row:${calendarTimelineGridRowForResource(resource, rowIndex)};" data-calendar-timeline-row="${rowIndex}"></div>`
      })
      .join('')
    const statusAlerts = []
    const eventBars = layout.items
        .map((item) => {
          const { bar, position, lane, laneCount } = item
          const timeLabel = calendarTimelineOrderRangeLabel(bar)
          const barTimeLabel = calendarTimelineOrderTimeRangeLabel(bar)
          const barClientLabel = calendarTimelineOrderClientBarLabel(bar)
          const status = calendarTimelineOrderStatus(bar, resources)
        if (status.alert) {
          statusAlerts.push(status.alert)
        }
        const isBufferEvent = resources[bar.row]?.type === 'buffer'
        const bufferLane = Math.max(0, Math.floor(Number(lane) || 0))
        const semanticTimelineLane = bar.isRealEvent ? 1 : 0
        const rowHasDeltas = Boolean(deltaData.rowDeltaCounts.get(Number(bar.row)))
        const centeredTimelineOffset = semanticTimelineLane === 0
          ? (rowHasDeltas ? -23 : -11)
          : (rowHasDeltas ? -1 : 11)
        const stackStyle = isBufferEvent
          ? `--fw-bar-height:22px;--fw-bar-offset:${Math.min(44, 8 + bufferLane * 11)}px;--fw-bar-z:${120 + bufferLane};`
          : `--fw-bar-height:18px;--fw-bar-y:${centeredTimelineOffset}px;--fw-bar-z:${12 + semanticTimelineLane};`
        const sourceOrderId = String(bar.sourceOrderId || bar.id || '').trim()
        const sourceOrder = calendarTimelineSourceOrderById(sourceOrderId)
        const canMoveOneOff = !bar.isRealEvent &&
          !isBufferEvent &&
          calendarTimelineOrderCanBeMovedFreely(sourceOrder)
        const dragKind = isBufferEvent && !bar.isRealEvent
          ? 'buffer'
          : canMoveOneOff
            ? 'one-off'
            : ''
        const draggableAttr = dragKind ? 'true' : 'false'
        const dragKindAttr = dragKind ? ` data-calendar-timeline-drag-kind="${dragKind}"` : ''
        const titleLabel = [
          barClientLabel,
          timeLabel,
          status?.label || '',
          isBufferEvent && !bar.isRealEvent
            ? 'Przeciągnij z bufora do pracownika'
            : canMoveOneOff
              ? 'Przeciągnij: zmień osobę, dzień lub godzinę'
            : !bar.isRealEvent
              ? 'Dwuklik: edytuj zlecenie'
              : 'Dwuklik: edytuj zdarzenie',
        ].filter(Boolean).join(' · ')
        const realEventAttr = bar.isRealEvent ? ' data-calendar-timeline-real-event="1"' : ''
        const recurringAttr = [
          bar.isRecurringSeries ? ' data-calendar-timeline-recurring-series="1"' : '',
          bar.isRecurringInstance ? ' data-calendar-timeline-recurring-instance="1"' : '',
          bar.recurrenceOverride ? ' data-calendar-timeline-recurrence-override="1"' : '',
        ].join('')
        const occurrenceDate = String(bar.recurrenceOriginalDateYmd || bar.recurrenceOverrideDateYmd || bar.dateYmd || '').trim()
        const occurrenceDateAttr = occurrenceDate ? ` data-calendar-timeline-occurrence-date="${escapeHtml(occurrenceDate)}"` : ''
        const sourceOrderAttr = sourceOrderId ? ` data-calendar-timeline-source-order-id="${escapeHtml(sourceOrderId)}"` : ''
          const realTrackClass = bar.isRealEvent ? ` fw-event-real--${escapeHtml(bar.realTrack || 'event')}` : ''
          const sourceEventId = String(bar.sourceEventId ?? '').trim()
          const workdayId = String(bar.workdayId ?? '').trim()
          const sourceStartAt = toIso(bar.sourceStartAt ?? bar.actualStartAt ?? '')
          const workSlotKey = String(bar.workSlotKey ?? '').trim()
          const workSlotIdentity = String(bar.workSlotIdentity ?? '').trim()
          const workSlotId = String(bar.workSlotId ?? '').trim()
          const serviceBlockId = String(bar.serviceBlockId ?? '').trim()
          const serviceBlockKind = String(bar.serviceBlockKind ?? '').trim()
          const serviceBlockLabel = String(bar.serviceBlockLabel ?? '').trim()
          const barMetaAttrs = [
            `data-calendar-timeline-date="${escapeHtml(bar.dateYmd || '')}"`,
            `data-calendar-timeline-start="${escapeHtml(bar.startTime || '')}"`,
            sourceEventId ? `data-calendar-timeline-source-event-id="${escapeHtml(sourceEventId)}"` : '',
            workdayId ? `data-calendar-timeline-workday-id="${escapeHtml(workdayId)}"` : '',
            sourceStartAt ? `data-calendar-timeline-source-start="${escapeHtml(sourceStartAt)}"` : '',
            workSlotKey ? `data-calendar-timeline-work-slot-key="${escapeHtml(workSlotKey)}"` : '',
            workSlotIdentity ? `data-calendar-timeline-work-slot-identity="${escapeHtml(workSlotIdentity)}"` : '',
            workSlotId ? `data-calendar-timeline-work-slot-id="${escapeHtml(workSlotId)}"` : '',
            serviceBlockId ? `data-calendar-timeline-service-block-id="${escapeHtml(serviceBlockId)}"` : '',
            serviceBlockKind ? `data-calendar-timeline-service-block-kind="${escapeHtml(serviceBlockKind)}"` : '',
            serviceBlockLabel ? `data-calendar-timeline-service-block-label="${escapeHtml(serviceBlockLabel)}"` : '',
          ].filter(Boolean).join(' ')
        const gridRow = calendarTimelineGridRowForResource(resources[bar.row] || {}, bar.row)
        return `
          <button class="fw-event-bar fw-event-bar--${escapeHtml(bar.tone)} fw-event-status--${escapeHtml(status.kind)}${bar.completed ? ' is-completed' : ''}${laneCount > 1 ? ' is-stacked' : ''}${bar.isRealEvent ? ' is-real-event' : ''}${bar.isRecurringSeries ? ' is-recurring-series' : ''}${bar.isRecurringInstance ? ' is-recurring-instance' : ''}${bar.recurrenceOverride ? ' is-recurrence-override' : ''}${isBufferEvent ? ' is-buffer-event' : ''}${realTrackClass}" style="grid-column:${position.startColumn} / span ${position.span}; grid-row:${gridRow};${stackStyle}" type="button" title="${escapeHtml(titleLabel)}" draggable="${draggableAttr}" data-calendar-timeline-order-id="${escapeHtml(bar.id)}" data-calendar-timeline-row="${bar.row}"${dragKindAttr} ${barMetaAttrs}${realEventAttr}${recurringAttr}${sourceOrderAttr}${occurrenceDateAttr}>
            <span class="fw-event-label">
              <span class="fw-event-mark" aria-hidden="true">&#9670;</span>
              <span class="fw-event-time">${escapeHtml(barTimeLabel)}</span>
              <span class="fw-event-title">${escapeHtml(barClientLabel)}</span>
            </span>
          </button>
        `
      })
      .join('')
    const currentHour = calendarTimelineCurrentHourHtml(days, hours, resources)
    appState.calendarTimelineStatusAlerts = calendarTimelineUniqueStatusAlerts(statusAlerts)
    const loadingHidden = appState.calendarTimelineWorkerStateLoading ? '' : ' hidden'
  
    return `
      <div class="fw-timeline-scroll">
        <div class="fw-timeline-grid" style="--slot-count:${totalSlots}; --row-count:${resources.length}; --fw-buffer-height:${bufferHeight}px; grid-template-rows:${gridRows};" data-calendar-timeline-total-slots="${totalSlots}" data-calendar-timeline-resource-width="260">
          ${bufferPlane}
          ${workerHead}
          ${dayHeaders}
          ${hourHeaders}
          ${rowLabels}
          ${rowTracks}
          ${daySeparators}
          ${currentHour}
          ${deltaData.markerHtml}
          ${eventBars}
        </div>
      </div>
      <div class="fw-timeline-loading${appState.calendarTimelineWorkerStateLoading ? '' : ' is-hidden'}" role="status" aria-live="polite"${loadingHidden}>
        <div class="fw-timeline-loading-card">
          <span class="fw-timeline-spinner" aria-hidden="true"></span>
          <strong>Ładowanie kalendarza...</strong>
          <small>Pobieram zlecenia i zdarzenia pracowników</small>
        </div>
      </div>
    `
  }

  function calendarTimelineRenderErrorHtml(error) {
    const message = error instanceof Error ? error.message : String(error ?? '')
    appState.calendarTimelineStatusAlerts = []
    appState.calendarTimelineVisibleConflictItems = []
    appState.calendarTimelineStageHeight = 220
    return `
      <div class="fw-timeline-render-error" role="status">
        <strong>Nie udało się wyświetlić kalendarza.</strong>
        <span>Odśwież widok lub spróbuj ponownie za chwilę.</span>
        ${message ? `<small>${escapeHtml(message)}</small>` : ''}
      </div>
    `
  }

  function renderCalendarTimelinePrototype() {
    const stage = document.getElementById('calendarPrototypeTimeline')
    if (!stage) {
      return
    }
    calendarMarkPerformance('calendar-render-start')
    const mode = calendarNormalizeViewMode(appState.calendarViewMode)
    if (mode === 'month') {
      calendarStopTimelineWorkerStatusRefresh()
      calendarClearTimelineHourRefresh()
    } else {
      calendarStartTimelineWorkerStatusRefresh()
      void Promise.resolve(calendarEnsureTimelineWorkerState({ render: false }))
        .then((updated) => {
          if (updated) {
            calendarScheduleRender()
          }
        })
        .catch(() => {})
    }
    calendarUpdateRangeLabel()
    const todayButton = document.getElementById('calendarTodayBtn')
    if (todayButton instanceof HTMLButtonElement) {
      todayButton.classList.toggle('is-active', mode === 'day')
    }
    document.querySelectorAll('#view-calendar [data-calendar-view]').forEach((button) => {
      button.classList.toggle('is-active', button.getAttribute('data-calendar-view') === mode)
    })
    const slideDirection = Number(appState.calendarTimelineSlideDirection || 0)
    stage.classList.remove('is-slide-next', 'is-slide-prev')
    try {
      stage.innerHTML = calendarTimelinePrototypeHtml()
    } catch (error) {
      console.error('[portal/calendar] timeline render failed', error)
      calendarInvalidateTimelineRenderCaches()
      stage.innerHTML = calendarTimelineRenderErrorHtml(error)
    }
    window.requestAnimationFrame(() => {
      stage.querySelectorAll('.fw-event-bar').forEach((bar) => {
        const label = bar.querySelector('.fw-event-label')
        if (!(label instanceof HTMLElement)) {
          return
        }
        bar.classList.remove('is-label-hidden')
        const fits = Math.ceil(label.scrollWidth) <= Math.floor(bar.clientWidth) + 1
        bar.classList.toggle('is-label-hidden', !fits)
      })
    })
    const stageHeight = Number(appState.calendarTimelineStageHeight || 0)
    if (Number.isFinite(stageHeight) && stageHeight > 0) {
      stage.style.setProperty('--fw-timeline-stage-height', `${stageHeight}px`)
    } else {
      stage.style.removeProperty('--fw-timeline-stage-height')
    }
    calendarTimelineSyncControls()
    calendarTimelineShowPendingStatusAlert()
    if (slideDirection) {
      void stage.offsetWidth
      stage.classList.add(slideDirection > 0 ? 'is-slide-next' : 'is-slide-prev')
      appState.calendarTimelineSlideDirection = 0
    }
    if (appState.calendarTimelineResetScroll) {
      appState.calendarTimelineResetScroll = false
      window.requestAnimationFrame(() => {
        const scroller = stage.querySelector('.fw-timeline-scroll')
        if (scroller instanceof HTMLElement) {
          scroller.scrollLeft = 0
        }
      })
    }
    if (mode !== 'month') {
      calendarScheduleTimelineHourRefresh()
    }
    calendarMarkPerformance('calendar-render-end')
    calendarMeasurePerformance('calendar-render', 'calendar-render-start', 'calendar-render-end')
  }
  
  function renderCalendarView() {
    if (document.getElementById('calendarTimelinePrototype')) {
      calendarEnsureState()
      renderCalendarTimelinePrototype()
      return
    }
    const board = document.getElementById('calendarBoard')
    if (!board) {
      return
    }
    calendarEnsureState()
    const mode = appState.calendarViewMode
  
    document.querySelectorAll('[data-calendar-view]').forEach((button) => {
      button.classList.toggle('is-active', button.getAttribute('data-calendar-view') === mode)
    })
    calendarUpdateRangeLabel()
    calendarRenderContextPanel()
  
    if (mode === 'day') {
      board.className = 'calendar-board calendar-board--day'
      board.innerHTML = calendarTimeGridHtml([appState.calendarCursorDay])
      return
    }
  
    if (mode === 'month') {
      const start = calendarMonthGridStart(appState.calendarCursorDay)
      const days = Array.from({ length: 42 }, (_, index) => calendarAddDays(start, index))
      const readCommentKeys = dashboardReadCommentKeys()
      board.className = 'calendar-board calendar-board--month'
      board.innerHTML = `
        <div class="calendar-weekdays">
          ${['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'].map((day) => `<span>${day}</span>`).join('')}
        </div>
        <div class="calendar-month-grid">
          ${days.map((dayKey) => calendarDayColumnHtml(dayKey, { monthMode: true, readCommentKeys })).join('')}
        </div>
      `
      return
    }
  
    const range = calendarTimelineRangeForView(mode, appState.calendarCursorDay)
    const days = range.days
    board.className = `calendar-board calendar-board--${mode === 'three' ? 'week' : mode}`
    board.innerHTML = calendarTimeGridHtml(days)
  }
  
  function calendarActivityDateTimeLabel(value = '') {
    const iso = toIso(value)
    return iso ? `${formatDatePl(iso)} ${formatTime(iso)}` : '-'
  }
  
  function calendarEditorCurrentTask() {
    const id = String(appState.calendarEditorTaskId ?? '').trim()
    return id ? appState.calendarTasks.find((task) => task.id === id) ?? null : null
  }
  
  function calendarTaskActivityEntries(task = null) {
    if (!task) {
      return []
    }
    const entries = calendarNormalizeActivityLog(task.activityLog)
    if (entries.length) {
      return entries
    }
    const createdAt = calendarActivityTimestamp(task.createdAt)
    const sourceWorker = String(task.sourceWorkerName ?? '').trim()
    const fallback = []
    if (task.generatedFromComment && (sourceWorker || task.sourceComment)) {
      fallback.push(
        calendarActivityEntry(
          'Dodano komentarz pracownika',
          [
            task.sourceComment ? `Komentarz: ${task.sourceComment}` : '',
            sourceWorker ? `Pracownik: ${sourceWorker}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
          { actor: sourceWorker || 'Pracownik', at: createdAt },
        ),
      )
    }
    fallback.push(calendarActivityEntry('Utworzono zadanie', `Dopisane osoby: ${calendarSelectionText(task.workers)}`, { actor: 'System', at: createdAt }))
    return calendarNormalizeActivityLog(fallback)
  }
  
  function calendarTaskAssignedSummaryHtml(task = null) {
    if (!task) {
      return '<div class="calendar-task-assigned-empty">Historia pojawi się po zapisaniu zadania.</div>'
    }
    const sourceWorker = String(task.sourceWorkerName ?? '').trim()
    const rows = [
      task.generatedFromComment && sourceWorker ? ['Komentarz dodał', sourceWorker] : null,
      ['Dopisane osoby', calendarSelectionText(task.workers)],
      ['Klienci', calendarSelectionText(task.objects)],
      ['Strefa', calendarTaskZoneText(task)],
    ].filter(Boolean)
    return rows
      .map(
        ([label, value]) => `
          <div>
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value || '-')}</strong>
          </div>
        `,
      )
      .join('')
  }
  
  function calendarRenderEditorActivity(task = calendarEditorCurrentTask()) {
    const summary = document.getElementById('calendarTaskAssignedSummary')
    const list = document.getElementById('calendarTaskActivityList')
    if (summary) {
      summary.innerHTML = calendarTaskAssignedSummaryHtml(task)
    }
    if (!list) {
      return
    }
    const entries = calendarTaskActivityEntries(task)
    if (!entries.length) {
      list.innerHTML = '<div class="calendar-task-activity-empty">Brak historii aktywności.</div>'
      return
    }
    list.innerHTML = entries
      .map(
        (entry) => `
          <article class="calendar-task-activity-item">
            <div class="calendar-task-activity-dot" aria-hidden="true"></div>
            <div>
              <div class="calendar-task-activity-main">
                <strong>${escapeHtml(entry.action)}</strong>
                <span>${escapeHtml(calendarActivityDateTimeLabel(entry.at))}</span>
              </div>
              <div class="calendar-task-activity-actor">${escapeHtml(entry.actor)}</div>
              ${entry.details ? `<pre>${escapeHtml(entry.details)}</pre>` : ''}
            </div>
          </article>
        `,
      )
      .join('')
  }
  
  function calendarSetEditorTab(tab = 'comments') {
    const nextTab = tab === 'activity' ? 'activity' : 'comments'
    appState.calendarEditorTab = nextTab
    document.querySelectorAll('#calendarEditorOverlay [data-calendar-task-tab]').forEach((button) => {
      button.classList.toggle('is-active', button.getAttribute('data-calendar-task-tab') === nextTab)
    })
    const commentsPanel = document.getElementById('calendarTaskCommentsPanel')
    const activityPanel = document.getElementById('calendarTaskActivityPanel')
    if (commentsPanel) commentsPanel.hidden = nextTab !== 'comments'
    if (activityPanel) activityPanel.hidden = nextTab !== 'activity'
    if (nextTab === 'activity') {
      calendarRenderEditorActivity()
    }
  }
  
  function calendarOpenEditor(taskId = '', dayKey = '', timeValue = null) {
    const task = appState.calendarTasks.find((item) => item.id === taskId) ?? null
    const date = task?.dateYmd || dayKey || appState.calendarCursorDay || todayYmd()
    appState.calendarEditorTaskId = task?.id || ''
  
    const overlay = document.getElementById('calendarEditorOverlay')
    const titleNode = document.getElementById('calendarEditorTitle')
    const deleteButton = document.getElementById('calendarTaskDeleteBtn')
    const duplicateButton = document.getElementById('calendarTaskDuplicateBtn')
    const saveButton = document.getElementById('calendarTaskSaveBtn')
    const completeButton = document.getElementById('calendarTaskCompleteBtn')
    const ownerAvatar = document.getElementById('calendarTaskOwnerAvatar')
    const commentAvatar = document.getElementById('calendarTaskCommentAvatar')
    const ownerName = document.getElementById('calendarTaskOwnerName')
    const titleInput = document.getElementById('calendarTaskTitle')
    const dateInput = document.getElementById('calendarTaskDate')
    const startInput = document.getElementById('calendarTaskTime')
    const endInput = document.getElementById('calendarTaskEndTime')
    const toneInput = document.getElementById('calendarTaskTone')
    const notesInput = document.getElementById('calendarTaskNotes')
  
    calendarRenderDatalist('workers')
    calendarRenderDatalist('objects')
    if (!appState.workersLoaded) {
      void fetchWorkersForCurrentSession()
        .then(() => calendarRenderDatalist('workers'))
        .catch(() => {})
    }
    if (!appState.clientsLoaded) {
      void fetchClientsForCurrentSession(false)
        .then(() => {
          calendarRenderDatalist('objects')
          calendarSyncZoneOptions(task?.zone ?? calendarNormalizeZoneSelection(null, task?.zoneId, task?.zoneName, task?.zoneLocation), { preserveUnknown: true })
        })
        .catch(() => {})
    }
    if (!appState.zonesLoaded) {
      void fetchZonesForCurrentSession(false)
        .then(() => {
          calendarSyncZoneOptions(task?.zone ?? calendarNormalizeZoneSelection(null, task?.zoneId, task?.zoneName, task?.zoneLocation), { preserveUnknown: true })
        })
        .catch(() => {})
    }
  
    if (titleNode) titleNode.textContent = task ? 'Edytuj zadanie' : 'Dodaj zadanie'
    if (deleteButton instanceof HTMLButtonElement) deleteButton.style.display = task ? '' : 'none'
    if (duplicateButton instanceof HTMLButtonElement) duplicateButton.style.display = task ? '' : 'none'
    if (saveButton instanceof HTMLButtonElement) saveButton.textContent = 'Zapisz'
    if (completeButton instanceof HTMLButtonElement) {
      const completed = task ? calendarSafeKanbanTaskIsCompleted(task) : false
      completeButton.disabled = !task
      completeButton.classList.toggle('is-completed', completed)
      completeButton.innerHTML = `<span aria-hidden="true">&#10003;</span>${completed ? 'Cofnij uko&#324;czenie' : 'Oznacz jako uko&#324;czone'}`
    }
    const sessionName = String(appState.session?.name || appState.session?.login || appState.session?.email || 'Użytkownik').trim()
    const initials = calendarSafeInitials(sessionName)
    if (ownerAvatar) ownerAvatar.textContent = initials
    if (commentAvatar) commentAvatar.textContent = initials
    if (ownerName) ownerName.textContent = sessionName
    if (titleInput) titleInput.value = task?.title ?? ''
    if (dateInput) dateInput.value = date
    const startValue = calendarNormalizeTimeValue(task?.startTime ?? task?.time ?? (timeValue == null ? '' : timeValue ? `${pad2(Number(timeValue))}:00` : ''))
    if (startInput) startInput.value = startValue
    const defaultEndValue =
      !task && startValue
        ? calendarMinutesToTime(Math.min((calendarTimeToMinutes(startValue) ?? 0) + 60, 1439))
        : ''
    if (endInput) endInput.value = calendarNormalizeTimeValue(task?.endTime) || defaultEndValue
    if (toneInput) toneInput.value = task ? calendarTaskToneValue(task) : 'blue'
    if (notesInput) notesInput.value = task?.notes ?? ''
    if (document.getElementById('calendarWorkerPickerRows')) {
      calendarSetPickerRows('workers', task?.workers ?? [])
    }
    if (document.getElementById('calendarObjectPickerRows')) {
      calendarSetPickerRows('objects', task?.objects?.length ? task.objects : calendarNormalizeSelectionList([], task?.place ?? ''))
    }
    calendarSyncZoneOptions(task?.zone ?? calendarNormalizeZoneSelection(null, task?.zoneId, task?.zoneName, task?.zoneLocation), { preserveUnknown: true })
    calendarRenderEditorActivity(task)
    calendarSetEditorTab('comments')
  
    if (overlay) {
      overlay.style.display = 'flex'
    }
    titleInput?.focus?.()
  }
  
  function calendarCloseEditor() {
    const overlay = document.getElementById('calendarEditorOverlay')
    if (overlay) {
      overlay.style.display = 'none'
    }
    appState.calendarEditorTaskId = ''
    appState.kanbanPendingStatus = ''
    if (appState.currentRoute === 'calendar') {
      window.setTimeout(() => {
        calendarTimelineShowPendingStatusAlert()
        if (typeof flushPortalDeferredNotifications === 'function') {
          flushPortalDeferredNotifications()
        }
      }, 0)
    }
  }
  
  function calendarDuplicateEditorTask() {
    const id = String(appState.calendarEditorTaskId ?? '').trim()
    const task = appState.calendarTasks.find((item) => item.id === id)
    if (!task) {
      return
    }
    appState.calendarEditorTaskId = ''
    const titleNode = document.getElementById('calendarEditorTitle')
    const deleteButton = document.getElementById('calendarTaskDeleteBtn')
    const duplicateButton = document.getElementById('calendarTaskDuplicateBtn')
    const saveButton = document.getElementById('calendarTaskSaveBtn')
    if (titleNode) titleNode.textContent = 'Duplikuj zadanie'
    if (deleteButton instanceof HTMLButtonElement) deleteButton.style.display = 'none'
    if (duplicateButton instanceof HTMLButtonElement) duplicateButton.style.display = 'none'
    if (saveButton instanceof HTMLButtonElement) saveButton.textContent = 'Zapisz kopię'
    document.getElementById('calendarTaskDate')?.focus?.()
    showTransientNotice('To jest kopia zadania. Zmień datę, osobę albo obiekt i zapisz.', 'info')
  }
  
  function calendarSaveEditorTask() {
    const title = String(document.getElementById('calendarTaskTitle')?.value ?? '').trim()
    const dateYmd = String(document.getElementById('calendarTaskDate')?.value ?? '').trim()
    const startRaw = String(document.getElementById('calendarTaskTime')?.value ?? '').trim()
    const endRaw = String(document.getElementById('calendarTaskEndTime')?.value ?? '').trim()
    const startTime = calendarNormalizeTimeValue(startRaw)
    const endTime = calendarNormalizeTimeValue(endRaw)
    if (!title) {
      showTransientNotice('Wpisz tytuł zadania.', 'error')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
      showTransientNotice('Wybierz datę zadania.', 'error')
      return
    }
    if (startRaw && !endRaw) {
      showTransientNotice('Podaj godzinę STOP dla zadania.', 'error')
      return
    }
    if (!startRaw && endRaw) {
      showTransientNotice('Podaj godzinę START dla zadania.', 'error')
      return
    }
    if (startRaw && !startTime) {
      showTransientNotice('Podaj poprawną godzinę START.', 'error')
      return
    }
    if (endRaw && !endTime) {
      showTransientNotice('Podaj poprawną godzinę STOP.', 'error')
      return
    }
    const startMinutes = calendarTimeToMinutes(startTime)
    const endMinutes = calendarTimeToMinutes(endTime)
    if (startMinutes != null && endMinutes != null && endMinutes <= startMinutes) {
      showTransientNotice('Godzina STOP musi być później niż START. Zadanie jest jednodniowe.', 'error')
      return
    }
  
    const existingId = String(appState.calendarEditorTaskId ?? '').trim()
    const existing = appState.calendarTasks.find((task) => task.id === existingId)
    const hasWorkerPicker = Boolean(document.getElementById('calendarWorkerPickerRows'))
    const hasObjectPicker = Boolean(document.getElementById('calendarObjectPickerRows'))
    const workers = hasWorkerPicker ? calendarReadPickerRows('workers') : (existing?.workers ?? [])
    const objects = hasObjectPicker ? calendarReadPickerRows('objects') : (existing?.objects ?? [])
    const zone = calendarReadZoneSelection()
    const preferredKanbanStatus = String(existing?.kanbanStatus ?? '').trim() || String(appState.kanbanPendingStatus ?? '').trim()
    let nextTask = calendarNormalizeTask({
      ...(existing ?? {}),
      id: existing?.id || `cal-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title,
      dateYmd,
      time: startTime,
      startTime,
      endTime,
      tone: String(document.getElementById('calendarTaskTone')?.value ?? 'blue').trim(),
      place: hasObjectPicker ? calendarSelectionLabels(objects).join(', ') : (existing?.place ?? ''),
      workers,
      objects,
      zone,
      zoneId: zone?.id || '',
      zoneName: zone?.label || '',
      zoneLocation: zone?.location || '',
      kanbanStatus: calendarSafeKanbanDefaultStatusForTask(workers, preferredKanbanStatus),
      notes: String(document.getElementById('calendarTaskNotes')?.value ?? '').trim(),
      updatedAt: new Date().toISOString(),
    })
    nextTask = calendarNormalizeTask(
      calendarAppendTaskActivity(
        nextTask,
        existing ? 'Zmieniono zadanie' : 'Dodano zadanie',
        existing
          ? calendarTaskChangeDetails(existing, nextTask)
          : [
              `Data: ${calendarDateLabelFromYmd(nextTask.dateYmd)}`,
              `Osoby: ${calendarSelectionText(nextTask.workers)}`,
              `Klienci: ${calendarSelectionText(nextTask.objects)}`,
              `Strefa: ${calendarTaskZoneText(nextTask)}`,
            ].join('\n'),
      ),
    )
  
    const withoutCurrent = appState.calendarTasks.filter((task) => task.id !== nextTask.id)
    calendarSaveTasks([...withoutCurrent, nextTask])
    appState.calendarCursorDay = nextTask.dateYmd
    appState.kanbanPendingStatus = ''
    calendarCloseEditor()
    renderCalendarView()
    renderDashboardKanbanTasks()
    if (appState.currentRoute === 'kanban') {
      renderKanbanView()
    }
  }
  
  function calendarDeleteEditorTask() {
    const id = String(appState.calendarEditorTaskId ?? '').trim()
    if (!id) {
      return
    }
    calendarDeleteTaskById(id)
  }
  
  function calendarToggleEditorTaskCompleted() {
    const id = String(appState.calendarEditorTaskId ?? '').trim()
    const task = appState.calendarTasks.find((item) => item.id === id)
    if (!task) {
      showTransientNotice('Najpierw zapisz zadanie, potem możesz oznaczyć je jako ukończone.', 'info')
      return
    }
    const completed = !calendarSafeKanbanTaskIsCompleted(task)
    const completedBy = String(appState.session?.name || appState.session?.email || appState.session?.uid || '').trim()
    const changedAt = new Date().toISOString()
    const nextTasks = appState.calendarTasks.map((item) =>
      item.id === id
        ? calendarNormalizeTask(
            calendarAppendTaskActivity(
              {
                ...item,
                active: true,
                completed,
                kanbanCompleted: completed,
                completionStatus: completed ? 'ZAKONCZONE' : 'AKTYWNE',
                completedAt: completed ? changedAt : '',
                completedBy: completed ? completedBy : '',
                completedNote: completed ? String(item.completedNote ?? '').trim() || calendarCompletionNoteForTask(item, completedBy) : '',
                updatedAt: changedAt,
              },
              completed ? 'Oznaczono jako ukończone' : 'Cofnięto ukończenie',
              completed ? calendarCompletionActivityDetails(item, String(item.completedNote ?? '').trim(), completedBy) : '',
              { actor: completedBy, at: changedAt },
            ),
          )
        : item,
    )
    calendarSaveTasks(nextTasks)
    renderCalendarView()
    renderDashboardKanbanTasks()
    calendarOpenEditor(id)
    showTransientNotice(completed ? 'Zadanie oznaczone jako ukończone.' : 'Cofnięto ukończenie zadania.')
  }
  
  function calendarMoveTask(taskId, dayKey, timeValue = null) {
    const id = String(taskId ?? '').trim()
    const dateYmd = String(dayKey ?? '').trim()
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
      return
    }
    const nextTasks = appState.calendarTasks.map((task) => {
      if (task.id !== id) {
        return task
      }
      const nextTime =
        timeValue == null
          ? task.time
          : String(timeValue ?? '').trim()
            ? `${pad2(Number(timeValue))}:00`
            : ''
      const shouldUpdateTime = timeValue != null
      const currentStart = calendarTimeToMinutes(task.startTime ?? task.time)
      const currentEnd = calendarTimeToMinutes(task.endTime)
      const nextStart = calendarTimeToMinutes(nextTime)
      const duration = currentStart != null && currentEnd != null && currentEnd > currentStart ? currentEnd - currentStart : null
      const nextEnd =
        !nextTime
          ? ''
          : !shouldUpdateTime
            ? task.endTime
            : duration != null && nextStart != null && nextStart + duration <= 1439
              ? calendarMinutesToTime(nextStart + duration)
              : ''
      const changedAt = new Date().toISOString()
      return calendarNormalizeTask(
        calendarAppendTaskActivity(
          { ...task, dateYmd, time: nextTime, startTime: nextTime, endTime: nextEnd, updatedAt: changedAt },
          'Przesunięto w kalendarzu',
          [
            `Data: ${calendarDateLabelFromYmd(task.dateYmd)} -> ${calendarDateLabelFromYmd(dateYmd)}`,
            shouldUpdateTime ? `START: ${calendarNormalizeTimeValue(task.startTime ?? task.time) || '-'} -> ${nextTime || '-'}` : '',
            shouldUpdateTime ? `STOP: ${calendarNormalizeTimeValue(task.endTime) || '-'} -> ${nextEnd || '-'}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
          { at: changedAt },
        ),
      )
    })
    calendarSaveTasks(nextTasks)
    renderCalendarView()
    renderDashboardKanbanTasks()
    if (appState.currentRoute === 'kanban') {
      renderKanbanView()
    }
  }

  function calendarSwitchTimelineMode(mode = 'three', cursorDay = todayYmd()) {
    appState.calendarViewMode = calendarNormalizeViewMode(mode)
    appState.calendarCursorDay = /^\d{4}-\d{2}-\d{2}$/.test(String(cursorDay ?? '').trim())
      ? String(cursorDay).trim()
      : todayYmd()
    appState.calendarTimelineSlideDirection = 0
    appState.calendarTimelineResetScroll = appState.calendarViewMode !== 'month'
    renderCalendarView()
    if (appState.calendarViewMode !== 'month') {
      void calendarEnsureTimelineWorkerState({ force: true }).catch(() => {})
    }
  }
  
  function calendarMoveCursor(direction) {
    const dir = direction < 0 ? -1 : 1
    const mode = appState.calendarViewMode
    if (document.getElementById('calendarTimelinePrototype')) {
      appState.calendarTimelineSlideDirection = dir
      const timelineMode = calendarNormalizeViewMode(mode)
      if (timelineMode === 'month') {
        const date = calendarDateFromYmd(appState.calendarCursorDay || todayYmd())
        date.setMonth(date.getMonth() + dir)
        appState.calendarCursorDay = calendarDateToYmd(date)
        appState.calendarTimelineSlideDirection = 0
      } else {
        const step = timelineMode === 'week' ? 7 : timelineMode === 'three' ? 3 : 1
        appState.calendarCursorDay = calendarAddDays(appState.calendarCursorDay || todayYmd(), dir * step)
      }
      renderCalendarView()
      if (timelineMode !== 'month') {
        void calendarEnsureTimelineWorkerState({ force: true }).catch(() => {})
      }
      return
    }
    if (mode === 'month') {
      const date = calendarDateFromYmd(appState.calendarCursorDay || todayYmd())
      date.setMonth(date.getMonth() + dir)
      appState.calendarCursorDay = calendarDateToYmd(date)
    } else {
      appState.calendarCursorDay = calendarAddDays(appState.calendarCursorDay || todayYmd(), mode === 'day' ? dir : dir * 7)
    }
    renderCalendarView()
  }
  
  function bindCalendarViewFunctions() {
    const binding = createBindingHelpers()
  
    binding.add(document.getElementById('calendarAddBtn'), 'click', () => {
      calendarOpenEditor('', appState.calendarCursorDay || todayYmd())
    })
    binding.add(document.getElementById('calendarPrevBtn'), 'click', () => calendarMoveCursor(-1))
    binding.add(document.getElementById('calendarNextBtn'), 'click', () => calendarMoveCursor(1))
    binding.add(document.getElementById('calendarTodayBtn'), 'click', () => {
      calendarSwitchTimelineMode('day', todayYmd())
      void calendarTimelineRefreshBars().catch(() => {})
    })
    binding.add(document.getElementById('calendarTimelineDateBtn'), 'click', () => {
      const input = document.getElementById('calendarTimelineDateInput')
      if (input instanceof HTMLInputElement) {
        input.showPicker?.()
        input.focus()
      }
    })
    binding.add(document.getElementById('calendarTimelineDateInput'), 'change', (event) => {
      const value = String(event.target?.value ?? '').trim()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return
      }
      appState.calendarCursorDay = value
      appState.calendarTimelineSlideDirection = 0
      appState.calendarTimelineResetScroll = true
      renderCalendarView()
      if (calendarNormalizeViewMode(appState.calendarViewMode) !== 'month') {
        void calendarEnsureTimelineWorkerState({ force: true, dayKey: value }).catch(() => {})
      }
    })
    binding.add(document.getElementById('calendarTimelineCompletedToggle'), 'click', () => {
      appState.calendarTimelineShowCompleted = appState.calendarTimelineShowCompleted === false
      renderCalendarView()
    })
    binding.add(document.getElementById('calendarTimelineRefreshBtn'), 'click', () => {
      void calendarTimelineRefreshBars({ notice: true }).catch(() => {
        showTransientNotice('Nie udało się odświeżyć pasków kalendarza.', 'error')
      })
    })
    binding.add(document.getElementById('calendarTimelineTypeBtn'), 'click', (event) => {
      const button = event.currentTarget
      const panel = document.getElementById('calendarTimelineTypePanel')
      if (!(button instanceof HTMLButtonElement) || !(panel instanceof HTMLElement)) {
        return
      }
      const shouldOpen = panel.hasAttribute('hidden')
      panel.toggleAttribute('hidden', !shouldOpen)
      button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false')
    })
    binding.add(document.getElementById('calendarTimelineTypePanel'), 'change', (event) => {
      const input = event.target
      if (!(input instanceof HTMLInputElement) || !input.hasAttribute('data-calendar-timeline-type')) {
        return
      }
      const type = String(input.getAttribute('data-calendar-timeline-type') || '').trim()
      const allowed = new Set(calendarTimelineAllTypeValues())
      if (!allowed.has(type)) {
        return
      }
      const selected = new Set(appState.calendarTimelineTypeFilters || [])
      if (input.checked) {
        selected.add(type)
      } else {
        selected.delete(type)
      }
      appState.calendarTimelineTypeFilters = [...selected].filter((value) => allowed.has(value))
      renderCalendarView()
    })
    const timelineStage = document.getElementById('calendarPrototypeTimeline')
    binding.add(timelineStage, 'contextmenu', (event) => {
      const bar = event.target?.closest?.('[data-calendar-timeline-order-id]')
      if (!(bar instanceof HTMLElement)) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      calendarTimelineClearEventsPopupTimer()
      const context = calendarTimelineContextFromBar(bar)
      if (context) {
        calendarShowTaskContextMenu(context, event.clientX, event.clientY)
      }
    })
    binding.add(timelineStage, 'dblclick', (event) => {
      const bar = event.target?.closest?.('[data-calendar-timeline-order-id]')
      if (!(bar instanceof HTMLElement)) {
        return
      }
      if (calendarTimelineBarClickTimer) {
        window.clearTimeout(calendarTimelineBarClickTimer)
        calendarTimelineBarClickTimer = 0
      }
      if (bar.getAttribute('data-calendar-timeline-real-event') === '1') {
        event.preventDefault()
        event.stopPropagation()
        void calendarTimelineOpenRealEventEditorFromBar(bar)
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const recurringContext = calendarTimelineRecurringContextFromBar(bar)
      if (
        recurringContext?.shouldAskScope &&
        typeof ordersOpenRecurringOccurrenceEditorFromCalendar === 'function' &&
        /^\d{4}-\d{2}-\d{2}$/.test(String(recurringContext.occurrenceDateYmd ?? '').trim())
      ) {
        ordersOpenRecurringOccurrenceEditorFromCalendar(recurringContext.sourceOrderId, recurringContext.occurrenceDateYmd, {
          orderId: recurringContext.orderId,
          workSlotKey: recurringContext.workSlotKey,
          serviceBlockId: recurringContext.serviceBlockId,
          serviceBlockKind: recurringContext.serviceBlockKind,
          serviceBlockLabel: recurringContext.serviceBlockLabel,
        })
        return
      }
      ordersOpenEditorFromCalendar(
        recurringContext?.isRecurrenceOverride
          ? recurringContext.orderId
          : recurringContext?.sourceOrderId || bar.getAttribute('data-calendar-timeline-order-id'),
        {
          orderId: recurringContext?.orderId || bar.getAttribute('data-calendar-timeline-order-id'),
          workSlotKey: recurringContext?.workSlotKey || bar.getAttribute('data-calendar-timeline-work-slot-key'),
          serviceBlockId: recurringContext?.serviceBlockId || bar.getAttribute('data-calendar-timeline-service-block-id'),
          serviceBlockKind: recurringContext?.serviceBlockKind || bar.getAttribute('data-calendar-timeline-service-block-kind'),
          serviceBlockLabel: recurringContext?.serviceBlockLabel || bar.getAttribute('data-calendar-timeline-service-block-label'),
          occurrenceDateYmd: recurringContext?.occurrenceDateYmd || bar.getAttribute('data-calendar-timeline-date'),
        },
      )
    })
    binding.add(timelineStage, 'click', (event) => {
      const monthAdd = event.target?.closest?.('[data-calendar-month-add]')
      if (monthAdd instanceof HTMLElement) {
        event.preventDefault()
        event.stopPropagation()
        const dayKey = String(monthAdd.getAttribute('data-calendar-month-add') || todayYmd()).trim()
        ordersOpenAddEditor(dayKey, { navigateToOrders: true })
        return
      }
      const monthDay = event.target?.closest?.('[data-calendar-month-day]')
      if (monthDay instanceof HTMLElement) {
        event.preventDefault()
        event.stopPropagation()
        const dayKey = String(monthDay.getAttribute('data-calendar-month-day') || todayYmd()).trim()
        calendarSwitchTimelineMode('day', dayKey)
        return
      }
      const bar = event.target?.closest?.('[data-calendar-timeline-order-id]')
      if (bar instanceof HTMLElement) {
        event.preventDefault()
        event.stopPropagation()
        if (calendarTimelineBarClickTimer) {
          window.clearTimeout(calendarTimelineBarClickTimer)
        }
        calendarTimelineBarClickTimer = window.setTimeout(() => {
          calendarTimelineBarClickTimer = 0
          void calendarTimelineShowWorkerDayEventsPopup(bar)
        }, 220)
        return
      }
      const resourceNode = event.target?.closest?.('.fw-resource-name[data-calendar-timeline-row]')
      if (!(resourceNode instanceof HTMLElement)) {
        return
      }
      event.preventDefault()
      calendarTimelineOpenWorkerEvents(resourceNode.getAttribute('data-calendar-timeline-row'))
    })
    binding.add(window, 'resize', calendarTimelineClampAllEventsPopupsToViewport)
    binding.add(document, 'click', (event) => {
      const menu = document.getElementById('calendarTaskContextMenu')
      if (!menu) {
        return
      }
      const target = event.target
      if (target instanceof Node && menu.contains(target)) {
        return
      }
      calendarHideTaskContextMenu()
    })
    binding.add(document, 'keydown', (event) => {
      if (event.key === 'Escape') {
        calendarHideTaskContextMenu()
      }
    })
    binding.add(timelineStage, 'dragstart', (event) => {
      const bar = event.target?.closest?.('[data-calendar-timeline-order-id]')
      if (!(bar instanceof HTMLElement)) {
        return
      }
      const sourceRow = Number(bar.getAttribute('data-calendar-timeline-row'))
      const dragResources = calendarTimelineResources()
      const isBufferSource = Number.isInteger(sourceRow) && dragResources[sourceRow]?.type === 'buffer'
      const isWorkerSource = Number.isInteger(sourceRow) && dragResources[sourceRow]?.type === 'worker'
      const orderId = String(bar.getAttribute('data-calendar-timeline-order-id') ?? '').trim()
      if (!orderId) {
        event.preventDefault()
        return
      }
      const recurringContext = calendarTimelineRecurringContextFromBar(bar)
      const dragKind = String(bar.getAttribute('data-calendar-timeline-drag-kind') || '').trim()
      const barSourceOrderId = String(bar.getAttribute('data-calendar-timeline-source-order-id') || '').trim()
      const sourceOrderId = recurringContext?.sourceOrderId || barSourceOrderId || orderId
      const sourceOrder = calendarTimelineSourceOrderById(sourceOrderId)
      const validBufferDrag = dragKind === 'buffer' && isBufferSource
      const validOneOffDrag =
        dragKind === 'one-off' &&
        isWorkerSource &&
        calendarTimelineOrderCanBeMovedFreely(sourceOrder || {})
      if (
        bar.getAttribute('data-calendar-timeline-real-event') === '1' ||
        (!validBufferDrag && !validOneOffDrag)
      ) {
        event.preventDefault()
        return
      }
      const workSlotKey = String(bar.getAttribute('data-calendar-timeline-work-slot-key') || '').trim()
      const workSlotIdentity = String(bar.getAttribute('data-calendar-timeline-work-slot-identity') || '').trim()
      const workSlotId = String(bar.getAttribute('data-calendar-timeline-work-slot-id') || '').trim()
      const serviceBlockId = String(bar.getAttribute('data-calendar-timeline-service-block-id') || '').trim()
      appState.calendarTimelineDragOrderId = orderId
      appState.calendarTimelineDragKind = dragKind
      appState.calendarTimelineDragSourceRow = Number.isInteger(sourceRow) ? sourceRow : null
      appState.calendarTimelineDragSourceOrderId = sourceOrderId
      appState.calendarTimelineDragOccurrenceDate = recurringContext?.occurrenceDateYmd || ''
      appState.calendarTimelineDragWorkSlotKey = workSlotKey
      appState.calendarTimelineDragAllocationIdentity = workSlotIdentity
      appState.calendarTimelineDragWorkSlotId = workSlotId
      appState.calendarTimelineDragServiceBlockId = serviceBlockId
      appState.calendarTimelineDragRecurringSeries = Boolean(recurringContext?.shouldAskScope)
      appState.calendarTimelineDragTargetRow = null
      appState.calendarTimelineDragTargetSlot = null
      appState.calendarTimelineDropHandled = false
      appState.calendarTimelineDragResources = dragResources
      appState.calendarTimelineDragConflictKey = ''
      appState.calendarTimelineDragConflictValue = false
      appState.calendarTimelineDragHoverKey = ''
      appState.calendarTimelineDragHoverInvalid = false
      appState.calendarTimelineDragHoverNode = null
      appState.calendarTimelineDragBufferContextKey = ''
      appState.calendarTimelineDragBufferContext = null
      appState.calendarTimelineDragOccupiedIntervals = new Map()
      bar.classList.add('is-dragging')
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', orderId)
        event.dataTransfer.setData('application/x-calendar-drag-kind', dragKind)
        if (sourceOrderId) {
          event.dataTransfer.setData('application/x-calendar-source-order-id', sourceOrderId)
        }
        if (recurringContext?.occurrenceDateYmd) {
          event.dataTransfer.setData('application/x-calendar-occurrence-date', recurringContext.occurrenceDateYmd)
        }
        if (workSlotKey) {
          event.dataTransfer.setData('application/x-calendar-work-slot-key', workSlotKey)
        }
        if (workSlotIdentity) {
          event.dataTransfer.setData('application/x-calendar-work-slot-identity', workSlotIdentity)
        }
        if (workSlotId) {
          event.dataTransfer.setData('application/x-calendar-work-slot-id', workSlotId)
        }
        if (serviceBlockId) {
          event.dataTransfer.setData('application/x-calendar-service-block-id', serviceBlockId)
        }
        if (recurringContext?.shouldAskScope) {
          event.dataTransfer.setData('application/x-calendar-recurring-series', '1')
        }
        if (Number.isInteger(sourceRow)) {
          event.dataTransfer.setData('application/x-calendar-source-row', String(sourceRow))
        }
      }
    })
    binding.add(timelineStage, 'dragover', (event) => {
      if (!appState.calendarTimelineDragOrderId) {
        return
      }
      const { target, info: dropInfo } = calendarTimelineDropInfoFromEvent(event)
      if (!(target instanceof HTMLElement)) {
        return
      }
      if (!dropInfo) {
        return
      }
      event.preventDefault()
      const orderId = String(event.dataTransfer?.getData('text/plain') || appState.calendarTimelineDragOrderId || '').trim()
      const sourceRowValue = event.dataTransfer?.getData('application/x-calendar-source-row')
      const sourceRow = sourceRowValue ? Number(sourceRowValue) : appState.calendarTimelineDragSourceRow
      const bufferMoveOptions = calendarTimelineBufferMoveOptionsFromTransfer(event.dataTransfer)
      const dragResources = Array.isArray(appState.calendarTimelineDragResources) && appState.calendarTimelineDragResources.length
        ? appState.calendarTimelineDragResources
        : calendarTimelineResources()
      const targetResource = dragResources[dropInfo.rowIndex]
      const invalidTarget = targetResource?.type !== 'worker'
      const sourceOrders = ordersListSourceOrders()
      const dragKind = String(
        event.dataTransfer?.getData('application/x-calendar-drag-kind') ||
        appState.calendarTimelineDragKind ||
        '',
      ).trim()
      if (dragKind === 'one-off') {
        const sourceOrderId = String(
          event.dataTransfer?.getData('application/x-calendar-source-order-id') ||
          appState.calendarTimelineDragSourceOrderId ||
          orderId,
        ).trim()
        const sourceOrder = calendarTimelineSourceOrderById(sourceOrderId)
        const moveOptions = {
          sourceOrderId,
          assignmentEditScope: 'single',
          isRecurringSeries: false,
          oneOffOnly: true,
        }
        const candidate = invalidTarget || !calendarTimelineOrderCanBeMovedFreely(sourceOrder || {})
          ? null
          : calendarTimelineMoveCandidateFromOrders(
              orderId,
              dropInfo.rowIndex,
              dropInfo.slotIndex,
              Number.isInteger(sourceRow) ? sourceRow : null,
              dragResources,
              sourceOrders,
              moveOptions,
            )
        const hasConflict = candidate
          ? calendarTimelineDragConflict(
              orderId,
              dropInfo.rowIndex,
              dropInfo.slotIndex,
              Number.isInteger(sourceRow) ? sourceRow : null,
              moveOptions,
            )
          : true
        const invalid = invalidTarget || !candidate || hasConflict
        const previewKey = calendarTimelineDropInfoKey(dropInfo)
        const shouldRefreshPreview =
          previewKey !== appState.calendarTimelineDragHoverKey ||
          invalid !== Boolean(appState.calendarTimelineDragHoverInvalid) ||
          !document.querySelector('#calendarPrototypeTimeline .calendar-timeline-drop-preview')
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = invalid ? 'none' : 'move'
        }
        calendarTimelineRememberDropInfo(dropInfo)
        calendarTimelineMarkDropTarget(target, dropInfo, invalid)
        if (shouldRefreshPreview && !invalidTarget) {
          calendarTimelineShowDropPreview(
            candidate,
            dropInfo,
            dragResources,
            invalid,
            moveOptions,
          )
        }
        return
      }
      const contextKey = JSON.stringify([
        orderId,
        Number.isInteger(sourceRow) ? sourceRow : null,
        bufferMoveOptions.sourceOrderId,
        bufferMoveOptions.occurrenceDateYmd,
        bufferMoveOptions.allocationIdentity,
        bufferMoveOptions.workSlotId,
        bufferMoveOptions.serviceBlockId,
      ])
      if (appState.calendarTimelineDragBufferContextKey !== contextKey) {
        appState.calendarTimelineDragBufferContextKey = contextKey
        appState.calendarTimelineDragBufferContext = calendarTimelineBufferAssignmentContext(
          sourceOrders,
          orderId,
          Number.isInteger(sourceRow) ? sourceRow : null,
          dragResources,
          bufferMoveOptions,
        )
        appState.calendarTimelineDragOccupiedIntervals = new Map()
      }
      const bufferContext = appState.calendarTimelineDragBufferContext
      const occupiedKey = `${bufferContext?.occurrenceDateYmd || ''}:${dropInfo.rowIndex}`
      let occupiedIntervals = appState.calendarTimelineDragOccupiedIntervals?.get(occupiedKey)
      if (!invalidTarget && bufferContext && !occupiedIntervals) {
        occupiedIntervals = calendarTimelineWorkerOccupiedIntervals(
          sourceOrders,
          bufferContext.occurrenceDateYmd,
          dropInfo.rowIndex,
          dragResources,
        )
        appState.calendarTimelineDragOccupiedIntervals.set(occupiedKey, occupiedIntervals)
      }
      const freeWindow = invalidTarget || !bufferContext
        ? null
        : calendarTimelineNearestFreeBufferWindow(
            sourceOrders,
            bufferContext,
            dropInfo.rowIndex,
            dropInfo.slotIndex,
            dragResources,
            occupiedIntervals,
          )
      const invalid = invalidTarget || !freeWindow
      const previewKey = calendarTimelineDropInfoKey(dropInfo)
      const shouldRefreshPreview =
        previewKey !== appState.calendarTimelineDragHoverKey ||
        invalid !== Boolean(appState.calendarTimelineDragHoverInvalid) ||
        !document.querySelector('#calendarPrototypeTimeline .calendar-timeline-drop-preview')
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = invalid ? 'none' : 'move'
      }
      calendarTimelineRememberDropInfo(dropInfo)
      calendarTimelineMarkDropTarget(target, dropInfo, invalid)
      if (shouldRefreshPreview && !invalidTarget) {
        calendarTimelineShowDropPreview(
          freeWindow?.candidate,
          { ...dropInfo, slotIndex: freeWindow?.slotIndex ?? dropInfo.slotIndex },
          dragResources,
          invalid,
          bufferMoveOptions,
        )
      }
    })
    binding.add(timelineStage, 'dragleave', (event) => {
      const target = calendarTimelineDropTargetFromEvent(event)
      if (target instanceof HTMLElement && (!(event.relatedTarget instanceof Node) || !target.contains(event.relatedTarget))) {
        if (appState.calendarTimelineDragHoverNode === target) {
          calendarTimelineClearDropTargets()
        } else {
          target.classList.remove('is-timeline-drop-target', 'is-timeline-drop-invalid')
        }
      }
    })
    binding.add(timelineStage, 'drop', (event) => {
      const dropInfo = calendarTimelineResolveDropInfo(event)
      if (!dropInfo) {
        return
      }
      event.preventDefault()
      appState.calendarTimelineDropHandled = true
      const orderId = String(event.dataTransfer?.getData('text/plain') || appState.calendarTimelineDragOrderId || '').trim()
      const sourceRowValue = event.dataTransfer?.getData('application/x-calendar-source-row')
      const sourceRow = sourceRowValue ? Number(sourceRowValue) : appState.calendarTimelineDragSourceRow
      const bufferMoveOptions = calendarTimelineBufferMoveOptionsFromTransfer(event.dataTransfer)
      const dragKind = String(
        event.dataTransfer?.getData('application/x-calendar-drag-kind') ||
        appState.calendarTimelineDragKind ||
        '',
      ).trim()
      const dragResources = Array.isArray(appState.calendarTimelineDragResources) && appState.calendarTimelineDragResources.length
        ? appState.calendarTimelineDragResources
        : calendarTimelineResources()
      const targetResource = dragResources[dropInfo.rowIndex]
      if (targetResource?.type !== 'worker') {
        calendarTimelineClearDropTargets()
        calendarTimelineResetDragState()
        showTransientNotice('Upuść zlecenie w wierszu pracownika.', 'error')
        return
      }
      calendarTimelineClearDropTargets()
      if (dragKind === 'one-off') {
        const sourceOrderId = String(
          event.dataTransfer?.getData('application/x-calendar-source-order-id') ||
          appState.calendarTimelineDragSourceOrderId ||
          orderId,
        ).trim()
        const sourceOrder = calendarTimelineSourceOrderById(sourceOrderId)
        if (!calendarTimelineOrderCanBeMovedFreely(sourceOrder || {})) {
          calendarTimelineResetDragState()
          showTransientNotice('W kalendarzu mozna teraz przenosic tylko zlecenia jednorazowe.', 'error')
          return
        }
        const moveOptions = {
          sourceOrderId,
          assignmentEditScope: 'single',
          isRecurringSeries: false,
          oneOffOnly: true,
        }
        const movePromise = calendarTimelineMoveOrderWithFreshCheck(
          orderId,
          dropInfo.rowIndex,
          dropInfo.slotIndex,
          Number.isInteger(sourceRow) ? sourceRow : null,
          dragResources,
          moveOptions,
        )
        calendarTimelineResetDragState()
        void movePromise.then((moveResult) => {
          calendarTimelineHandleMoveResult(moveResult)
        })
        return
      }
      void calendarTimelineAssignBufferWithFreshCheck(
        orderId,
        dropInfo.rowIndex,
        dropInfo.slotIndex,
        Number.isInteger(sourceRow) ? sourceRow : null,
        dragResources,
        bufferMoveOptions,
      ).then((moveResult) => {
        calendarTimelineHandleMoveResult(moveResult)
      })
      calendarTimelineResetDragState()
    })
    binding.add(timelineStage, 'dragend', () => {
      calendarTimelineResetDragState()
      calendarTimelineClearDropTargets()
      document.querySelectorAll('#view-calendar .fw-event-bar.is-dragging').forEach((node) => {
        node.classList.remove('is-dragging')
      })
    })
    binding.add(document, 'click', (event) => {
      const filter = document.getElementById('calendarTimelineTypeFilter')
      const panel = document.getElementById('calendarTimelineTypePanel')
      const button = document.getElementById('calendarTimelineTypeBtn')
      if (!(filter instanceof HTMLElement) || !(panel instanceof HTMLElement) || !(button instanceof HTMLButtonElement)) {
        return
      }
      const target = event.target
      if (target instanceof Node && filter.contains(target)) {
        return
      }
      panel.setAttribute('hidden', '')
      button.setAttribute('aria-expanded', 'false')
    })
  
    document.querySelectorAll('[data-calendar-view]').forEach((button) => {
      binding.add(button, 'click', () => {
        calendarSwitchTimelineMode(String(button.getAttribute('data-calendar-view') ?? 'three'), todayYmd())
      })
    })
  
    const contextPanel = document.querySelector('#view-calendar .calendar-context-panel')
    binding.add(contextPanel, 'click', (event) => {
      const navButton = event.target?.closest?.('[data-calendar-mini-nav]')
      if (navButton) {
        calendarMoveMiniMonth(Number(navButton.getAttribute('data-calendar-mini-nav') ?? 1))
        return
      }
      const dayButton = event.target?.closest?.('[data-calendar-mini-day]')
      if (dayButton) {
        const dayKey = String(dayButton.getAttribute('data-calendar-mini-day') ?? '').trim()
        if (/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
          appState.calendarCursorDay = dayKey
          renderCalendarView()
        }
      }
    })
    binding.add(contextPanel, 'change', (event) => {
      const input = event.target
      if (!(input instanceof HTMLInputElement)) {
        return
      }
      if (input.hasAttribute('data-calendar-filter-all')) {
        appState.calendarToneFilters = calendarAllToneValues()
        renderCalendarView()
        return
      }
      if (input.hasAttribute('data-calendar-filter-show-completed')) {
        appState.calendarShowCompletedTasks = input.checked
        renderCalendarView()
        return
      }
      if (input.hasAttribute('data-calendar-filter-show-read')) {
        appState.calendarShowReadTasks = input.checked
        renderCalendarView()
        return
      }
      const tone = String(input.getAttribute('data-calendar-filter-tone') ?? '').trim()
      if (!tone) {
        return
      }
      const current = calendarNormalizeToneFilters(appState.calendarToneFilters)
      const selected = current.length === CALENDAR_TONE_OPTIONS.length ? new Set() : new Set(current)
      if (input.checked) {
        selected.add(tone)
      } else {
        selected.delete(tone)
      }
      appState.calendarToneFilters = selected.size ? calendarNormalizeToneFilters([...selected]) : calendarAllToneValues()
      renderCalendarView()
    })
  
    const board = document.getElementById('calendarBoard')
    binding.add(board, 'contextmenu', (event) => {
      const taskNode = event.target?.closest?.('[data-calendar-task-id]')
      if (!taskNode) {
        return
      }
      const taskId = String(taskNode.getAttribute('data-calendar-task-id') ?? '').trim()
      if (!taskId) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      calendarShowTaskContextMenu({ kind: 'calendar-task', taskId }, event.clientX, event.clientY)
    })
    binding.add(board, 'click', (event) => {
      const addButton = event.target?.closest?.('[data-calendar-add-day]')
      if (addButton) {
        calendarOpenEditor('', addButton.getAttribute('data-calendar-add-day'))
        return
      }
      const taskNode = event.target?.closest?.('[data-calendar-task-id]')
      if (taskNode) {
        calendarOpenEditor(taskNode.getAttribute('data-calendar-task-id'))
        return
      }
      const timeSlot = event.target?.closest?.('[data-calendar-day][data-calendar-hour]')
      if (timeSlot) {
        calendarOpenEditor('', timeSlot.getAttribute('data-calendar-day'), timeSlot.getAttribute('data-calendar-hour'))
      }
    })
    binding.add(board, 'keydown', (event) => {
      if (event.key !== 'Enter') {
        return
      }
      const taskNode = event.target?.closest?.('[data-calendar-task-id]')
      if (taskNode) {
        calendarOpenEditor(taskNode.getAttribute('data-calendar-task-id'))
      }
    })
    binding.add(board, 'dragstart', (event) => {
      const taskNode = event.target?.closest?.('[data-calendar-task-id]')
      if (!taskNode) {
        return
      }
      appState.calendarDragTaskId = String(taskNode.getAttribute('data-calendar-task-id') ?? '')
      event.dataTransfer?.setData('text/plain', appState.calendarDragTaskId)
      event.dataTransfer.effectAllowed = 'move'
    })
    binding.add(board, 'dragover', (event) => {
      const dayCell = event.target?.closest?.('[data-calendar-day]')
      if (!dayCell) {
        return
      }
      event.preventDefault()
      dayCell.classList.add('is-drop-target')
    })
    binding.add(board, 'dragleave', (event) => {
      const dayCell = event.target?.closest?.('[data-calendar-day]')
      dayCell?.classList.remove('is-drop-target')
    })
    binding.add(board, 'drop', (event) => {
      const dayCell = event.target?.closest?.('[data-calendar-day]')
      if (!dayCell) {
        return
      }
      event.preventDefault()
      dayCell.classList.remove('is-drop-target')
      const taskId = event.dataTransfer?.getData('text/plain') || appState.calendarDragTaskId
      const hourValue = dayCell.hasAttribute('data-calendar-hour') ? dayCell.getAttribute('data-calendar-hour') : null
      calendarMoveTask(taskId, dayCell.getAttribute('data-calendar-day'), hourValue)
      appState.calendarDragTaskId = ''
    })
    binding.add(board, 'dragend', () => {
      appState.calendarDragTaskId = ''
      document
        .querySelectorAll('.calendar-day-cell.is-drop-target, .calendar-time-slot.is-drop-target')
        .forEach((node) => node.classList.remove('is-drop-target'))
    })
  
    binding.add(document.getElementById('calendarEditorOverlay'), 'click', (event) => {
      const tabButton = event.target?.closest?.('[data-calendar-task-tab]')
      if (tabButton) {
        calendarSetEditorTab(tabButton.getAttribute('data-calendar-task-tab'))
        return
      }
      const addPickerButton = event.target?.closest?.('[data-calendar-add-picker]')
      if (addPickerButton) {
        const kind = addPickerButton.getAttribute('data-calendar-add-picker')
        calendarAddPickerRow(kind)
        if (kind === 'objects') {
          calendarSyncZoneOptions(calendarReadZoneSelection())
        }
        return
      }
      const removePickerButton = event.target?.closest?.('[data-calendar-remove-picker]')
      if (removePickerButton) {
        const kind = removePickerButton.getAttribute('data-calendar-remove-picker') || 'workers'
        const row = removePickerButton.closest('[data-calendar-picker-row]')
        const rows = document.getElementById(calendarPickerConfig(kind).rowsId)
        row?.remove()
        if (rows && !rows.querySelector('[data-calendar-picker-row]')) {
          calendarAddPickerRow(kind)
        }
        if (kind === 'objects') {
          calendarSyncZoneOptions(calendarReadZoneSelection())
        }
        return
      }
      if (event.target?.id === 'calendarEditorOverlay') {
        calendarCloseEditor()
      }
    })
    binding.add(document.getElementById('calendarEditorOverlay'), 'input', (event) => {
      if (event.target?.closest?.('[data-calendar-picker-input="objects"]')) {
        calendarSyncZoneOptions(calendarReadZoneSelection())
      }
    })
    binding.add(document.getElementById('calendarEditorOverlay'), 'change', (event) => {
      if (event.target?.closest?.('[data-calendar-picker-input="objects"]')) {
        calendarSyncZoneOptions(calendarReadZoneSelection())
      }
    })
    binding.add(document.getElementById('calendarEditorCloseBtn'), 'click', calendarCloseEditor)
    binding.add(document.getElementById('calendarTaskCancelBtn'), 'click', calendarCloseEditor)
    binding.add(document.getElementById('calendarTaskSaveBtn'), 'click', calendarSaveEditorTask)
    binding.add(document.getElementById('calendarTaskDeleteBtn'), 'click', calendarDeleteEditorTask)
    binding.add(document.getElementById('calendarTaskDuplicateBtn'), 'click', calendarDuplicateEditorTask)
    binding.add(document.getElementById('calendarTaskCompleteBtn'), 'click', calendarToggleEditorTaskCompleted)
  
    return () => {
      calendarTimelineHideEventsPopup()
      calendarHideTaskContextMenu()
      calendarHideTaskDeleteConfirm()
      binding.done()
    }
  }
  
  return {
    bind: bindCalendarViewFunctions,
    render: renderCalendarView,
    scheduleRender: calendarScheduleRender,
    markRouteEnter: calendarMarkRouteEnter,
    markDataReady: calendarMarkDataReady,
    openEditor: calendarOpenEditor,
    closeEditor: calendarCloseEditor,
    moveTask: calendarMoveTask,
    ensureState: calendarEnsureState,
    taskToneValue: calendarTaskToneValue,
    taskIsRead: calendarTaskIsRead,
    taskMatchesStatusFilters: calendarTaskMatchesStatusFilters,
    startTimelineWorkerStatusRefresh: calendarStartTimelineWorkerStatusRefresh,
    stopTimelineWorkerStatusRefresh: calendarStopTimelineWorkerStatusRefresh,
    hideTimelineStatusAlert: calendarTimelineHideStatusAlert,
    syncRemoteTimelineOrders: ordersSyncRemoteTimelineOrders,
    ensureTimelineOrdersForRoute: ordersEnsureTimelineOrdersForRoute,
    deferRouteOrderDataRefresh: deferRouteOrderDataRefresh,
    listSourceOrders: ordersListSourceOrders,
    saveTimelineOrders: ordersSaveTimelineOrders,
    deleteTimelineOrderFromList: ordersDeleteTimelineOrderFromList,
    calendarCanSeeAllOrganizationTasks,
    calendarIsCoordinatorRole,
    calendarAccessMatch,
    calendarMatchHasValues,
    calendarValuesMatchAccess,
    calendarSplitAccessValues,
    calendarWorkerAccessValues,
    calendarClientAccessValues,
    calendarZoneAccessValues,
    calendarCoordinatorAccessScope,
    calendarTaskAssignedToAccess,
    calendarTaskIsVisibleForCurrentUser,
    calendarReadPickerRows,
    calendarEnsureTimelineWorkerState,
    calendarTimelineEventTimestamp,
    calendarTimelineEventsRowStartTimestamp,
    calendarTimelineEventsRowStopTimestamp,
    calendarTimelineResources,
    calendarTimelineTimeMinutes,
    ordersSaveRemoteTimelineOrdersNow,
    calendarTimelineOrderDurationMinutes,
    calendarTimelineOrderTitle,
    calendarTimelineShortTimeLabel,
    calendarTimelineTimeLabel,
    calendarTimelineDateLabel,
    calendarTimelineDaysForOrder,
    calendarTimelineOrderIsRecurring,
    calendarTimelineRecurringUnit,
    calendarTimelineDateWeekday,
    calendarTimelineRecurringSkippedDates,
    calendarTimelineRecurringOverrideInfo,
    calendarTimelineRecurringOverrideId,
    calendarTimelineSourceOrderById,
    calendarTimelineBuildSingleOccurrenceOverride,
    calendarTimelineOrdersWithSingleOccurrenceOverride,
    calendarTimelineRecurringDaysForRange,
    calendarTimelineExpandRecurringOrdersForDays,
    calendarTimelineOrderPlannedBounds,
    calendarTimelineVisualOrderSlots,
    calendarTimelineIsTechnicalEventCode,
    calendarTimelineFindOrderConflict,
    calendarTimelineRealEventRowDay,
    calendarTimelineRealEventIsOrder,
    calendarTimelineRealEventOrders,
    calendarTimelineStatusRowsForRealOrders,
    calendarTimelineSetsIntersect,
    calendarTimelineResourceWorkerIdentity,
    calendarTimelineSourceRowWorkerIdentity,
    calendarTimelineResourceExactWorkerNames,
    calendarTimelineSourceRowExactWorkerNames,
    calendarTimelineWorkerResourceIsRunningOnDay,
    calendarTimelineSourceRowStartMinutes,
    calendarTimelineEventsRowIsRunning,
    ordersTimelineOrderListsDiffer,
    ordersLoadLocalTimelineOrders,
    ordersCancelRemoteTimelineOrderSave,
    calendarTimelineDragConflict,
    calendarTimelineContextFromBar,
    calendarTimelineEditOrderFromContext,
    clearRemoteTimelineOrderTimers: () => {
      ordersClearRemoteTimelineOrderSaveTimer()
      ordersClearRemoteTimelineOrderRetryTimer()
      ordersInvalidateRemoteTimelineRequests()
    },
    cleanup: () => {
      if (calendarRenderRaf && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(calendarRenderRaf)
      }
      calendarRenderRaf = 0
      calendarStopTimelineWorkerStatusRefresh()
      calendarTimelineHideStatusAlert()
      calendarTimelineHideEventsPopup()
      calendarHideTaskContextMenu()
      calendarHideTaskDeleteConfirm()
      ordersClearRemoteTimelineOrderSaveTimer()
      ordersClearRemoteTimelineOrderRetryTimer()
      ordersInvalidateRemoteTimelineRequests()
    },
  }
}
