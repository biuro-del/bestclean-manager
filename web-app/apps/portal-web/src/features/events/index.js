import template from './template.html?raw'

export const route = 'events'
export const viewId = 'view-events'
export { template }

export function createEventsFeature(ctx) {
  const {
    appState,
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
    zoneNameWithQrHtml,
    zoneQrCodeFromRow,
  } = ctx
  const EVENTS_REFRESH_POLL_MS = 10000
  const EVENTS_DEFAULT_PAGE_SIZE = 25
  const EVENTS_PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
  const EVENT_EDITOR_PICKER_MAX_OPTIONS = 36
  const EVENT_EDITOR_PICKER_EMPTY_MAX_OPTIONS = 18
  let eventsRefreshInFlight = null
  let eventsRefreshQueuedOptions = null
  let eventsPollingTimer = 0
  let eventsLastFingerprintToken = ''
  let eventReferenceLoadPromise = null
  let eventEditorOptionsCache = null
  let eventEditorOptionsCacheKey = ''
  let eventEditorPickerFilterFrame = 0
  let eventPendingSavedRows = []

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
    const sourceRows = Array.isArray(rows) ? rows : []
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
    const selectionEnabled = canManageEvents()
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
        <div class="events-row">
          <div></div><div>Brak wyników</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
        </div>
      `
      syncEventsSelectionUi()
      return
    }

    root.innerHTML = safeRows
      .map((row, index) => {
        const rowKey = eventSelectionKey(row, index)
        const isSelected = appState.eventsSelectedKeys.has(rowKey)
        const canSelect = canManageEvents() && eventCanDelete(row)
        const selectTitle = eventCanDelete(row) ? 'Zaznacz zdarzenie' : 'Rekord dnia pracy bez osobnego zdarzenia'
        const comment = normalizeVisibleEventComment(row.comment)
        const commentCell = comment
          ? `<button class="event-comment-btn" type="button" data-event-comment="${index}" title="Pokaż komentarz" aria-label="Pokaż komentarz">i</button>`
          : '<span class="event-empty">-</span>'
        const workerLogin = String(row.workerLogin ?? '').trim()
        const workerName = resolveWorkerNameFromWorkers(workerLogin, row.workerName)
        const workerPrimary = workerName || workerLogin || '-'
        const workerCard = `
          <div class="events-worker-cell">
            <div class="events-worker-name">${escapeHtml(workerPrimary)}</div>
          </div>
        `
        const workerCell =
          workerPrimary === '-'
            ? workerCard
            : `<button class="events-cell-link" type="button" data-event-history-worker="${index}" title="Pokaz historie osoby">${workerCard}</button>`

        const clientQrCandidate = eventActualQrCodeFromRow(row) || zoneQrCodeFromRow(row)
        const clientLabel = resolveClientLabelWithQrFallback(String(row?.clientName ?? row?.klient ?? '-').trim() || '-', clientQrCandidate)
        const clientCell =
          clientLabel === '-'
            ? '-'
            : `<button class="events-cell-link" type="button" data-event-history-client="${index}" title="Pokaz historie klienta">${escapeHtml(clientLabel)}</button>`

        const zoneLabel = eventResolveZoneLabel(row)
        const zoneCell =
          zoneLabel === '-'
            ? '-'
            : `<button class="events-cell-link" type="button" data-event-history-zone="${index}" title="Pokaz historie strefy">${zoneNameWithQrHtml(zoneLabel, row)}</button>`
        const startLabel = dashboardClockLabelToHm(row.start, '-')
        const stopLabel = dashboardClockLabelToHm(row.stop, '-')
        const durationLabel = dashboardDurationLabelToHm(row.duration, '00:00')
        const locationLabel = String(row.lokalizacja || '-').trim() || '-'
        const editedByLabel = String(row.editedBy || '-').trim() || '-'
        const timePill = (label, type) =>
          `<span class="event-time-pill event-time-pill--${type}${label === '-' ? ' is-empty' : ''}">${escapeHtml(label)}</span>`
        const gpsCoords = eventRowGpsCoords(row)
        const gpsCell = gpsCoords
          ? `<button class="event-gps-icon-btn" type="button" data-event-gps="${index}" data-rep-geo-lat="${escapeHtml(gpsCoords.lat)}" data-rep-geo-lon="${escapeHtml(gpsCoords.lon)}" title="Pokaz GPS" aria-label="Pokaz GPS">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 21s6-5.1 6-11a6 6 0 0 0-12 0c0 5.9 6 11 6 11z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                <circle cx="12" cy="10" r="2.2" stroke="currentColor" stroke-width="1.8"/>
              </svg>
            </button>`
          : '<span class="event-empty">-</span>'
        const eventStatus = normalizeEventStatus(row.status, Boolean(row.endAt))
        const rowStatusClass = eventStatus === 'CLOSED' ? 'events-row--completed' : 'events-row--running'

        return `
          <div class="events-row ${rowStatusClass}${isSelected ? ' is-selected' : ''}">
            <div class="events-select-col">
              <input type="checkbox" data-event-select-index="${index}" aria-label="${escapeHtml(selectTitle)}" title="${escapeHtml(selectTitle)}" ${isSelected ? 'checked' : ''} ${canSelect ? '' : 'disabled'} />
            </div>
            <div>${workerCell}</div>
            <div>${clientCell}</div>
            <div>${zoneCell}</div>
            <div><span class="${locationLabel === '-' ? 'event-empty' : 'event-location'}">${escapeHtml(locationLabel)}</span></div>
            <div><span class="event-date-pill mono">${escapeHtml(row.date || '-')}</span></div>
            <div class="mono time-start">${timePill(startLabel, 'start')}</div>
            <div class="mono time-stop">${timePill(stopLabel, 'stop')}</div>
            <div class="mono time-duration">${timePill(durationLabel, 'duration')}</div>
            <div class="event-gps-cell">${gpsCell}</div>
            <div class="event-comment-cell">${commentCell}</div>
            <div><span class="${editedByLabel === '-' ? 'event-empty' : 'event-edited-by'}">${escapeHtml(editedByLabel)}</span></div>
            <div>
              <button class="event-edit-icon-btn" type="button" data-event-edit="${index}" aria-label="Edytuj zdarzenie" title="Edytuj zdarzenie">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 20h4l10-10-4-4L4 16v4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                  <path d="M13 7l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
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

  function getZoneById(zoneId) {
    const id = String(zoneId ?? '').trim()
    return appState.zones.find((zone) => String(zone.id) === id) ?? null
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

  function eventEditorApplyPickerFilter(kind, { expandOnEmpty = false } = {}) {
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

    eventEditorSetPickerExpanded(config, Boolean(query) || expandOnEmpty, filteredOptions.length)
    if (currentValue && filteredOptions.some((option) => option.value === currentValue)) {
      select.value = currentValue
    }
  }

  function eventEditorSchedulePickerFilter(kind, options = {}) {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      eventEditorApplyPickerFilter(kind, options)
      return
    }

    if (eventEditorPickerFilterFrame) {
      window.cancelAnimationFrame(eventEditorPickerFilterFrame)
    }
    eventEditorPickerFilterFrame = window.requestAnimationFrame(() => {
      eventEditorPickerFilterFrame = 0
      eventEditorApplyPickerFilter(kind, options)
    })
  }

  function eventEditorApplyAllPickerFilters() {
    eventEditorApplyPickerFilter('worker')
    eventEditorApplyPickerFilter('client')
    eventEditorApplyPickerFilter('zone')
  }

  function eventEditorSetPickersLoading(isLoading) {
    ;[
      { inputId: 'evEditWorkerSearch', selectId: 'evEditWorker', label: 'Ladowanie pracownikow...' },
      { inputId: 'evEditPomSearch', selectId: 'evEditPom', label: 'Ladowanie klientow...' },
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
    ;['evEditWorkerSearch', 'evEditPomSearch', 'evEditStrefaSearch'].forEach((id) => {
      const input = document.getElementById(id)
      if (input) {
        input.value = ''
      }
    })
  }

  function eventEditorBuildOptionsCache() {
    const workerKey = (Array.isArray(appState.workers) ? appState.workers : [])
      .map((worker) => `${worker?.login ?? worker?.id ?? ''}:${worker?.name ?? worker?.workerName ?? ''}`)
      .join('|')
    const clientKey = (Array.isArray(appState.clients) ? appState.clients : [])
      .map((client) => `${client?.id ?? ''}:${client?.name ?? ''}`)
      .join('|')
    const zoneKey = (Array.isArray(appState.zones) ? appState.zones : [])
      .map((zone) => `${zone?.id ?? ''}:${zone?.clientId ?? ''}:${zone?.name ?? zone?.zone ?? ''}`)
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
    ;(Array.isArray(appState.zones) ? appState.zones : [])
      .map((zone) => mapZoneForView(zone))
      .filter((zone) => !isUnassignedCleanZone(zone))
      .forEach((zone) => {
        const zoneId = String(zone.id ?? '').trim()
        if (!zoneId) {
          return
        }

        const option = {
          value: zoneId,
          label: zone.name || zone.zone || zoneId,
          searchText: normalizeSearchText(`${zone.name || zone.zone || zoneId} ${zoneId}`),
        }
        const clientId = String(zone.clientId ?? '').trim()
        zoneLabelById.set(zoneId, option.label)
        zoneOptions.push(option)
        if (!zoneOptionsByClient.has(clientId)) {
          zoneOptionsByClient.set(clientId, [])
        }
        zoneOptionsByClient.get(clientId).push(option)
      })

    eventEditorOptionsCacheKey = cacheKey
    eventEditorOptionsCache = {
      workerOptions,
      clientOptions,
      zoneOptions,
      zoneOptionsByClient,
      workerLabelByLogin,
      clientLabelById,
      zoneLabelById,
    }
    return eventEditorOptionsCache
  }

  function populateEventEditorOptions(selectedWorkerLogin, selectedClientId, selectedZoneId) {
    const workerSelect = document.getElementById('evEditWorker')
    const clientSelect = document.getElementById('evEditPom')
    const zoneSelect = document.getElementById('evEditStrefa')

    if (!workerSelect || !clientSelect || !zoneSelect) {
      return
    }

    const optionsCache = eventEditorBuildOptionsCache()
    const normalizedClientId = String(selectedClientId ?? '').trim()
    const zoneOptions = normalizedClientId
      ? optionsCache.zoneOptionsByClient.get(normalizedClientId) ?? []
      : optionsCache.zoneOptions
    const normalizedWorkerLogin = String(selectedWorkerLogin ?? '').trim()
    const normalizedZoneId = String(selectedZoneId ?? '').trim()
    const fallbackWorkerLabel = optionsCache.workerLabelByLogin.get(normalizedWorkerLogin) ?? normalizedWorkerLogin
    const fallbackClientLabel = optionsCache.clientLabelById.get(normalizedClientId) ?? normalizedClientId
    const fallbackZoneLabel = optionsCache.zoneLabelById.get(normalizedZoneId) ?? normalizedZoneId

    appState.eventEditorWorkerOptions = eventEditorEnsureOption(optionsCache.workerOptions, normalizedWorkerLogin, fallbackWorkerLabel)
    appState.eventEditorClientOptions = eventEditorEnsureOption(optionsCache.clientOptions, normalizedClientId, fallbackClientLabel)
    appState.eventEditorZoneOptions = eventEditorEnsureOption(zoneOptions, normalizedZoneId, fallbackZoneLabel)

    eventEditorApplyAllPickerFilters()
    ensureSelectValue(workerSelect, normalizedWorkerLogin, fallbackWorkerLabel)
    ensureSelectValue(clientSelect, normalizedClientId, fallbackClientLabel)
    ensureSelectValue(zoneSelect, normalizedZoneId, fallbackZoneLabel)
    eventEditorSyncSearchInput('worker')
    eventEditorSyncSearchInput('client')
    eventEditorSyncSearchInput('zone')
  }

  function fillEventsClientFilterDatalist() {
    const list = document.getElementById('evPomList')
    if (!list) {
      return
    }

    const uniqueNames = [
      ...new Set(
        appState.clients
          .map((client) => String(client.name ?? '').trim())
          .filter(Boolean),
      ),
    ].sort((left, right) => left.localeCompare(right, 'pl', { sensitivity: 'base' }))

    list.innerHTML = ''
    uniqueNames.forEach((name) => {
      const option = document.createElement('option')
      option.value = name
      list.appendChild(option)
    })
  }

  function setEventStopNow() {
    const endInput = document.getElementById('evEditStop')
    if (!endInput) {
      return
    }

    eventEditorClearStopHint(endInput)
    endInput.value = isoToLocalDateTimeInput(new Date().toISOString())
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
    const clientSelect = document.getElementById('evEditPom')
    if (!zoneSelect) {
      return
    }

    const zone = getZoneById(zoneSelect.value)
    if (!zone) {
      return
    }

    if (clientSelect) {
      clientSelect.value = String(zone.clientId ?? '')
    }
  }

  function refreshEventZoneOptionsForClient() {
    const clientId = String(document.getElementById('evEditPom')?.value ?? '').trim()
    const selectedWorker = String(document.getElementById('evEditWorker')?.value ?? '').trim()
    populateEventEditorOptions(selectedWorker, clientId, '')
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
    ensureSingleOverlayInBody('evEditorOverlay')
    ensureSingleOverlayInBody('evCommentOverlay')
  }

  function eventEditorReferencesReady() {
    return Boolean(appState.workersLoaded && appState.clientsLoaded && appState.zonesLoaded)
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
      const zone = getZoneById(item.roomId || item.utilityRoomId)
      const selectedClientId = zone?.clientId ?? item.clientId
      const selectedZoneId = zone?.id ?? item.roomId ?? item.utilityRoomId
      eventEditorSetPickersLoading(false)
      populateEventEditorOptions(item.workerLogin, selectedClientId, selectedZoneId)
    } else {
      eventEditorSetPickersLoading(true)
    }

    if (title) title.textContent = 'Edytuj zdarzenie'
    if (cycleId) cycleId.textContent = String(item.eventId ?? item.workdayId ?? '-')
    if (rowNumber) rowNumber.textContent = '-'
    if (editedBy) editedBy.textContent = item.editedBy || appState.session?.name || '-'
    const startValue = isoToLocalDateTimeInput(item.startAt)
    const stopValue = isoToLocalDateTimeInput(item.endAt)
    if (startInput) startInput.value = startValue
    eventEditorSetStopValue(stopInput, stopValue || startValue, { isHint: Boolean(startValue && !stopValue) })
    if (stopNowButton instanceof HTMLButtonElement) stopNowButton.disabled = false
    if (startInput) startInput.disabled = false
    if (stopInput) stopInput.disabled = false
    if (commentInput) {
      commentInput.readOnly = true
      commentInput.value = normalizeVisibleEventComment(item.comment)
    }
    if (scannedQrInput) {
      scannedQrInput.value = eventEditorScannedQrLabel(item)
    }
    if (saveButton) {
      saveButton.disabled = !eventEditorReferencesReady()
      saveButton.textContent = 'Zapisz'
    }
    if (deleteButton) {
      deleteButton.style.display = canManageEvents() ? '' : 'none'
      deleteButton.disabled = !eventCanDelete(item)
      deleteButton.textContent = 'Usuń'
    }

    overlay.style.display = 'flex'

    if (!eventEditorReferencesReady()) {
      try {
        await ensureEventReferenceDataLoaded()
        if (appState.eventEditorMode !== 'edit' || appState.eventEditorItem !== item) {
          return
        }
        const zone = getZoneById(item.roomId || item.utilityRoomId)
        const selectedClientId = zone?.clientId ?? item.clientId
        const selectedZoneId = zone?.id ?? item.roomId ?? item.utilityRoomId
        eventEditorSetPickersLoading(false)
        populateEventEditorOptions(item.workerLogin, selectedClientId, selectedZoneId)
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

    if (title) title.textContent = 'Dodaj zdarzenie'
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
      saveButton.textContent = 'Zapisz'
    }
    if (deleteButton) {
      deleteButton.style.display = 'none'
      deleteButton.disabled = false
      deleteButton.textContent = 'Usuń'
    }

    overlay.style.display = 'flex'

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
    eventEditorCollapsePicker('zone')
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
    const zoneSelect = document.getElementById('evEditStrefa')
    const startInput = document.getElementById('evEditStart')
    const stopInput = document.getElementById('evEditStop')
    const commentInput = document.getElementById('evEditComment')

    const workerLogin = String(workerSelect?.value ?? '').trim()
    const workerName = workerSelect?.selectedOptions?.[0]?.textContent?.trim() || workerLogin
    const clientId = String(clientSelect?.value ?? '').trim()
    const zoneId = String(zoneSelect?.value ?? '').trim()
    const utilityRoomId = zoneId
    const startAt = localDateTimeInputToIso(startInput?.value)
    const endAt = localDateTimeInputToIso(eventEditorReadStopValue(stopInput))
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
      saveButton.textContent = 'Zapisywanie...'
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

        await updateEvent(appState.session.orgId, eventId, {
          ...appState.eventEditorItem,
          ...eventPayload,
          startAt: derivedStartAt,
          endAt: derivedEndAt,
          durationSec: derivedDurationSec,
          status: derivedStatus,
          closeMarkedAt: derivedCloseMarkedAt,
          endReason: derivedEndReason,
        })
      }

      closeEventEditor()
      if (document.getElementById('evRows')) {
        if (isCreateMode) {
          appState.eventsPage = 1
          savedEventVisibility = eventEnsureSavedRowVisible(savedEvent, savedEventPayload)
        }
        await fetchEventsForCurrentSession({ resetPage: isCreateMode, forceRefresh: true, silent: isCreateMode })
      }
      const savedHistoryItem = {
        ...(editedHistorySource || {}),
        ...eventPayload,
        startAt: derivedStartAt,
        endAt: derivedEndAt,
      }
      await reportHistoryRefreshAfterEventSave(savedHistoryItem)
      if (typeof refreshWorkerAccountTimeAfterWorkdaySave === 'function') {
        const workerLoginsToRefresh = new Set(
          [savedHistoryItem.workerLogin, payload.workerLogin, editedHistorySource?.workerLogin]
            .map((value) => String(value ?? '').trim())
            .filter(Boolean),
        )
        for (const workerLogin of workerLoginsToRefresh) {
          await refreshWorkerAccountTimeAfterWorkdaySave(workerLogin)
        }
      }
      if (typeof refreshDashboardAfterEventSave === 'function') {
        await refreshDashboardAfterEventSave(savedHistoryItem, editedHistorySource || null)
      } else {
        await refreshDashboardWidgets({ forceRefresh: true, syncWorktimeToken: true })
      }
      if (savedEventVisibility === 'hidden') {
        showTransientNotice('Zapisano, ale aktualne filtry ukrywaja nowy rekord.')
      } else {
        showTransientNotice('Zmiany zostały zapisane.')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Błąd zapisu zdarzenia.'
      alert(message)
    } finally {
      if (saveButton) {
        saveButton.disabled = false
        saveButton.textContent = 'Zapisz'
      }
    }
  }

  async function deleteEventEditorItem() {
    if (!appState.session?.orgId || appState.eventEditorMode !== 'edit') {
      return
    }

    if (!canManageEvents()) {
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

    const confirmed = window.confirm(`Usunąć zdarzenie ${targetDisplayId}?`)
    if (!confirmed) {
      return
    }

    const deleteButton = document.getElementById('evDeleteBtn')
    if (deleteButton) {
      deleteButton.disabled = true
      deleteButton.textContent = 'Usuwanie...'
    }

    try {
      await deleteEventByCandidateIds(appState.session.orgId, editedRow)
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
        deleteButton.textContent = 'Usuń'
      }
    }
  }

  async function deleteSelectedEvents() {
    if (!appState.session?.orgId) {
      return
    }

    if (!canManageEvents()) {
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

    const skippedNotice = skippedCount > 0 ? `\n\n${skippedCount} wiersz(y) bez identyfikatora zostanie pominiete.` : ''
    const confirmed = window.confirm(
      `Czy na pewno chcesz usunac ${selectedRows.length} rekord(y)? Ta zmiana jest nieodwracalna.${skippedNotice}`,
    )
    if (!confirmed) {
      return
    }

    const deleteButton = document.getElementById('evDeleteSelectedBtn')
    const defaultLabel = 'Usun'
    if (deleteButton instanceof HTMLButtonElement) {
      deleteButton.disabled = true
      deleteButton.textContent = 'Usuwanie...'
    }

    try {
      for (const row of selectedRows) {
        await deleteEventByCandidateIds(appState.session.orgId, row)
      }

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
        deleteButton.textContent = defaultLabel
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
    const workerValue = String(worker?.value ?? '').trim()
    const workerLogin =
      workerValue && workerValue === String(appState.eventsWorkerLoginFilterText ?? '').trim()
        ? String(appState.eventsWorkerLoginFilter ?? '').trim()
        : ''

    return {
      from: String(from?.value ?? '').trim(),
      to: String(to?.value ?? '').trim(),
      worker: workerValue,
      workerLogin,
      strefa: String(zone?.value ?? '').trim(),
      pomieszczenie: String(client?.value ?? '').trim(),
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
    if (worker) worker.value = String(filters.worker ?? '')
    appState.eventsWorkerLoginFilter = String(filters.workerLogin ?? '').trim()
    appState.eventsWorkerLoginFilterText = String(filters.worker ?? '').trim()
    if (zone) zone.value = String(filters.strefa ?? '')
    if (client) client.value = String(filters.pomieszczenie ?? '')
    if (room) room.value = String(filters.roomId ?? '')
    if (status) status.value = String(filters.status ?? '')
    if (q) q.value = String(filters.q ?? '')
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
      shownLabel.textContent = `Wyswietlono: ${shown} - Wszystkie: ${totalLabel} - Na strone: ${appState.eventsPageSize}`
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
    const filters = readEventsFilterInputs()
    const from = workerDetailSanitizeFilename(filters.from || firstDayOfCurrentMonthYmd()) || 'od'
    const to = workerDetailSanitizeFilename(filters.to || todayYmd()) || 'do'
    return `zdarzenia-${from}_${to}`
  }

  function eventsExportFiltersSummary() {
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

    if (!appState.session?.orgId) {
      appState.eventsSelectedKeys = new Set()
      if (root && !silent) {
        root.innerHTML = `
          <div class="events-row">
            <div></div><div>Brak aktywnej sesji.</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
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
        <div class="events-row">
          <div></div><div>Ładowanie danych...</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
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
      void rememberEventsFingerprintForCurrentFilters()
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
          <div class="events-row">
            <div></div><div style="color:#ef4444;">${escapeHtml(message)}</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
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
      storageKey: 'portal.grid.events.v3',
      defaultWidths: [28, 90, 90, 94, 94, 78, 56, 56, 64, 44, 72, 74, 38],
      minWidths: [26, 62, 62, 64, 64, 66, 44, 44, 48, 40, 56, 58, 34],
      nonResizableIndexes: [0, 12],
      autoFitToViewport: true,
      enforceFullWidth: true,
      maxWidth: 680,
    })
    syncEventsActionPermissions()
    syncEventsPageSizeControl()

    binding.add(document.getElementById('evSearchBtn'), 'click', () => {
      appState.eventsPage = 1
      void fetchEventsForCurrentSession({ resetPage: false })
    })

    binding.add(document.getElementById('evPageSize'), 'change', (event) => {
      appState.eventsPageSize = normalizeEventsPageSize(event.target?.value)
      appState.eventsPage = 1
      syncEventsPageSizeControl()
      void fetchEventsForCurrentSession({ resetPage: false })
    })

    binding.add(document.getElementById('evResetBtn'), 'click', () => {
      void fetchEventsForCurrentSession({ resetPage: true, forceRefresh: true })
    })
    binding.add(document.getElementById('evExportPdfBtn'), 'click', () => {
      void downloadEventsExport('pdf')
    })
    binding.add(document.getElementById('evExportExcelBtn'), 'click', () => {
      void downloadEventsExport('excel')
    })

    binding.add(document.getElementById('evPrevBtn'), 'click', () => {
      if (appState.eventsPage <= 1) return
      appState.eventsPage -= 1
      void fetchEventsForCurrentSession()
    })

    binding.add(document.getElementById('evNextBtn'), 'click', () => {
      if (appState.eventsHasNext !== true && appState.eventsPage >= appState.eventsTotalPages) return
      appState.eventsPage += 1
      void fetchEventsForCurrentSession()
    })

    binding.add(document.getElementById('evStatus'), 'change', () => {
      appState.eventsPage = 1
      void fetchEventsForCurrentSession({ resetPage: false })
    })
    binding.add(document.getElementById('evWorker'), 'input', () => {
      appState.eventsWorkerLoginFilter = ''
      appState.eventsWorkerLoginFilterText = ''
    })

    binding.add(document.getElementById('evAddBtn'), 'click', () => {
      void openCreateEventEditor()
    })
    binding.add(document.getElementById('evDeleteSelectedBtn'), 'click', () => {
      void deleteSelectedEvents()
    })
    binding.add(document.getElementById('evSelectAll'), 'change', (event) => {
      const input = event.target
      if (!(input instanceof HTMLInputElement)) {
        return
      }
      if (!canManageEvents()) {
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

    ;['evFrom', 'evTo', 'evWorker', 'evStrefa', 'evPom', 'evRoomId', 'evQ'].forEach((id) => {
      binding.add(document.getElementById(id), 'keydown', (event) => {
        if (event.key !== 'Enter') return
        appState.eventsPage = 1
        void fetchEventsForCurrentSession({ resetPage: false })
      })
    })

    binding.add(document.getElementById('evRows'), 'change', (event) => {
      const input = event.target?.closest?.('[data-event-select-index]')
      if (!(input instanceof HTMLInputElement)) {
        return
      }
      if (!canManageEvents()) {
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
    binding.add(document.getElementById('evEditorOverlay'), 'click', (event) => {
      if (event.target?.id === 'evEditorOverlay') closeEventEditor()
    })
    binding.add(document.getElementById('evCancelBtn'), 'click', closeEventEditor)
    binding.add(document.getElementById('evSaveBtn'), 'click', () => {
      void saveEventEditor()
    })
    binding.add(document.getElementById('evDeleteBtn'), 'click', () => {
      void deleteEventEditorItem()
    })
    binding.add(document.getElementById('evStopNowBtn'), 'click', setEventStopNow)
    binding.add(document.getElementById('evEditStart'), 'input', eventEditorSyncStopHintFromStart)
    binding.add(document.getElementById('evEditStart'), 'change', eventEditorSyncStopHintFromStart)
    binding.add(document.getElementById('evEditStop'), 'input', (event) => eventEditorClearStopHint(event.target))
    binding.add(document.getElementById('evEditStop'), 'change', (event) => eventEditorClearStopHint(event.target))
    binding.add(document.getElementById('evEditPom'), 'change', refreshEventZoneOptionsForClient)
    binding.add(document.getElementById('evEditStrefa'), 'change', syncEventRoomAndClientFromZone)
    ;[
      { inputId: 'evEditWorkerSearch', selectId: 'evEditWorker', kind: 'worker' },
      { inputId: 'evEditPomSearch', selectId: 'evEditPom', kind: 'client' },
      { inputId: 'evEditStrefaSearch', selectId: 'evEditStrefa', kind: 'zone' },
    ].forEach(({ inputId, selectId, kind }) => {
      binding.add(document.getElementById(inputId), 'input', () => {
        eventEditorSchedulePickerFilter(kind, { expandOnEmpty: true })
      })
      binding.add(document.getElementById(inputId), 'focus', () => {
        eventEditorApplyPickerFilter(kind, { expandOnEmpty: true })
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
        }
        eventEditorSyncSearchInput(kind)
        eventEditorCollapsePicker(kind)
      })
      binding.add(document.getElementById(selectId), 'focus', () => {
        eventEditorApplyPickerFilter(kind, { expandOnEmpty: true })
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
