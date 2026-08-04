import {
  compileOrderDraftToJobCardDraft,
  defaultJobCardRecurrenceUntil,
  validateJobCardDraft,
} from './jobCardDraftModel.js'
import {
  fetchJobCardDraft,
  fetchJobCardState,
  listJobCardDrafts,
  publishJobCard,
  saveJobCardDraft,
} from '../../services/jobCardService.js'

export {
  deriveIssaProductivityM2PerHour,
  estimateIssaDuration,
  findVerifiedIssaNorm,
  formatIssaNormCitation,
  ISSA_NORM_CATALOG_V1,
  listVerifiedIssaNorms,
  validateIssaNormCatalog,
} from './issa/index.js'

export const section = 'orders'
export const routes = ['orders', 'ordersMap']

export function createOrdersFeature(ctx) {
  const {
    appState,
    calendarAddDays,
    calendarDateFromYmd,
    calendarDateToYmd,
    calendarDayNumberLabel,
    calendarMinutesToTime,
    calendarMonthGridStart,
    calendarMonthLabel,
    calendarMonthStart,
    calendarNormalizeTimeValue,
    calendarTimelineBuildSingleOccurrenceOverride,
    calendarTimelineDateWeekday,
    calendarTimelineDaysForOrder,
    calendarTimelineFindOrderConflict,
    calendarTimelineOrderDurationMinutes,
    calendarTimelineOrderIsRecurring,
    calendarTimelineOrdersWithSingleOccurrenceOverride,
    calendarTimelineRecurringDaysForRange,
    calendarTimelineRecurringOverrideId,
    calendarTimelineRecurringSkippedDates,
    calendarTimelineRecurringUnit,
    calendarTimelineResources,
    calendarTimelineSourceOrderById,
    calendarTimelineTimeMinutes,
    createBindingHelpers,
    dashboardCanonicalWorkerId,
    dashboardIsQrCodeLike,
    deferRouteOrderDataRefresh,
    escapeHtml,
    eventTargetClosest,
    fetchClientsForCurrentSession,
    fetchWorkersForCurrentSession,
    fetchZonesForCurrentSession,
    formatBytes,
    formatDatePl,
    formatTime,
    normalizeSearchText,
    openClientModal,
    openOrderCreateWorkspace,
    ordersDeleteTimelineOrderFromList,
    ordersListSourceOrders,
    ordersSaveRemoteTimelineOrdersNow,
    ordersSyncRemoteTimelineOrders,
    pad2,
    renderCalendarView,
    renderDashboardActivityCalendar,
    roleLevel,
    showPortalErrorNotice,
    showTransientNotice,
    todayYmd,
    updateClient,
    workerIsAssignable,
  } = ctx

  const ORDERS_RETAIL_CLIENT_VALUE = '__orders_retail_client__'
  const ORDERS_INDIVIDUAL_CLIENT_VALUE = '__orders_individual_client__'
  const ORDERS_INDIVIDUAL_CLIENT_LABEL = 'Klient jednorazowy'
  const ORDERS_NEW_CLIENT_VALUE = '__orders_new_client__'
  const ORDERS_OBJECT_ALL_ZONES_KEY = '__orders_object_all_zones__'
  const ORDERS_CLIENT_ADDRESS_MEMORY_PREFIX = 'portal-orders-client-addresses'
  const ORDERS_CLIENT_OBJECT_PLAN_MARKER = 'PORTAL_OBJECT_PLAN_JSON'
  const ORDERS_CLIENT_OBJECT_EQUIPMENT_MARKER = 'PORTAL_OBJECT_EQUIPMENT_JSON'
  const ORDERS_CLIENT_OBJECT_CHEMISTRY_MARKER = 'PORTAL_OBJECT_CHEMISTRY_JSON'
  const ORDERS_DEFAULT_REPEAT_WEEKDAYS = [1, 2, 3, 4, 5]
  const ORDERS_ALL_REPEAT_WEEKDAYS = [1, 2, 3, 4, 5, 6, 0]
  const ORDERS_SERVICE_MODEL_VERSION = 2
  const ORDERS_DEFAULT_ACCESS_START = '06:00'
  const ORDERS_DEFAULT_ACCESS_END = '21:00'
  const ORDERS_SERVICE_BLOCK_KINDS = ['main', 'dayA', 'dayB', 'dayC', 'dayD']
  const ORDERS_SERVICE_BLOCK_LABELS = {
    main: 'Pierwsza zmiana',
    dayA: 'Druga zmiana',
    dayB: 'Trzecia zmiana',
    dayC: 'Czwarta zmiana',
    dayD: 'Piąta zmiana',
  }
  const ORDERS_SERVICE_TEAM_KIND_PREFIX = 'team'
  const ORDERS_SERVICE_SLOT_PREFIX = 'slot'
  const ORDERS_LIST_MODELS = new Set(['all', 'cyclic', 'oneoff'])
  const ORDERS_LIST_STATUSES = new Set(['', 'draft', 'active', 'upcoming', 'completed', 'expired'])
  const ORDERS_LIST_TYPES = new Set(['', 'individual', 'cyclic', 'renovation', 'windows', 'other'])
  const ORDERS_LIST_ASSIGNMENTS = new Set(['', 'assigned', 'buffer'])
  const ORDERS_LIST_QUICK_FILTERS = new Set(['draft', 'active_future', 'today', 'overdue', 'completed', 'all'])
  const ORDERS_LIST_SORTS = new Set(['nextAsc', 'nextDesc', 'dateAsc', 'dateDesc', 'clientAsc', 'workerAsc', 'nameAsc'])
  const ORDERS_LOCATION_GOOGLE_MIN_QUERY = 5
  const ORDERS_LOCATION_GOOGLE_SUGGESTIONS_DEBOUNCE_MS = 520
  const ORDERS_LOCAL_LOCATION_SUGGESTIONS_CACHE_MS = 30000
  const ORDERS_WEEKDAY_LABELS = {
    0: 'Niedziela',
    1: 'Poniedziałek',
    2: 'Wtorek',
    3: 'Środa',
    4: 'Czwartek',
    5: 'Piątek',
    6: 'Sobota',
  }

  let ordersTimePickerTarget = null
  let ordersTimePickerHour = 0
  let ordersTimePickerMinute = 0
  let ordersServiceBlocksScrollCleanup = null
  let ordersEditorSummaryRefreshTimer = 0
  let ordersEditorWizardRefreshTimer = 0
  let ordersWorkerResourcesLoadPromise = null
  let ordersEditorPreferredServiceBlockContext = null
  let ordersJobCardWarningAcknowledgements = new Set()
  let ordersEditorDirty = false
  let ordersEditorSaving = false
  let ordersEditorInitialSnapshot = null
  const ordersJobCardPublicationState = new Map()

  function ordersDateTimeFromTimeline(dayKey = '', timeValue = '') {
    const day = String(dayKey ?? '').trim()
    const time = String(timeValue ?? '').trim()
    return `${day || '-'} ${time || '--:--'}`
  }
  
  function ordersTimelineClientLabel(order = {}) {
    const direct = String(order?.clientLabel ?? order?.client ?? '').trim()
    if (direct) {
      return direct
    }
  
    const title = String(order?.title ?? '').trim()
    if (!title) {
      return '-'
    }
    const firmaMatch = title.match(/^(Firma\s+\S+)/i)
    if (firmaMatch) {
      return firmaMatch[1]
    }
    const firstChunk = title.split(/\s+\d{1,4}[/\s-]/)[0]?.trim()
    return firstChunk || title.split(/\s+/).slice(0, 2).join(' ')
  }
  
  function ordersTimelineAddressLabel(order = {}) {
    const direct = String(order?.addressLabel ?? order?.address ?? order?.location ?? '').trim()
    if (direct) {
      return direct
    }
  
    const title = String(order?.title ?? '').trim()
    if (!title) {
      return '-'
    }
  
    const patterns = [
      /\d{2}-\d{3}.*/u,
      /(ul\.\s+.*)/iu,
      /([A-ZĄĆĘŁŃÓŚŹŻ][\p{L}-]+(?:\s+\d+[A-Za-z]?)?.*)$/u,
    ]
    for (const pattern of patterns) {
      const match = title.match(pattern)
      if (match?.[0]) {
        return match[0].trim()
      }
    }
  
    return '-'
  }
  
  function ordersExplicitExecutionAddressLabel(order = {}, defaultAddress = '') {
    const explicit = ordersFirstClientText(order?.executionAddressLabel, order?.customAddressLabel, order?.addressOverride)
    if (explicit) {
      return explicit
    }
  
    const direct = ordersFirstClientText(order?.addressLabel, order?.address, order?.location)
    const defaultLabel = ordersFirstClientText(defaultAddress)
    if (!direct || (defaultLabel && normalizeSearchText(direct) === normalizeSearchText(defaultLabel))) {
      return ''
    }
    return direct
  }
  
  function ordersFindTimelineOrder(orderId) {
    const id = String(orderId ?? '').trim()
    if (!id) {
      return null
    }
    return ordersListSourceOrders().find((order) => String(order?.id ?? '') === id) ?? null
  }
  
  function ordersDurationHours(order = {}) {
    const minutes = calendarTimelineOrderDurationMinutes(order)
    return Math.max(1, Math.round(minutes / 60))
  }
  
  function ordersNormalizeDateField(value, fallback = todayYmd()) {
    const raw = String(value ?? '').trim()
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : fallback
  }
  
  function ordersNormalizeTimeField(value, fallback = '08:00') {
    return calendarNormalizeTimeValue(value) || fallback
  }
  
  function ordersCurrentUserCanDeleteHistoricalOrders() {
    const role = appState.session?.role
    if (typeof roleLevel === 'function' && roleLevel(role) >= 3) {
      return true
    }
    const normalized = normalizeSearchText(role)
    return normalized === 'admin' || normalized === 'administrator' || normalized === 'owner' || normalized === 'superadmin'
  }
  
  function ordersTimelineOrderCanBeDeleted(order = {}) {
    if (!order || order.isDraft) {
      return false
    }
    return ordersCurrentUserCanDeleteHistoricalOrders()
  }
  
  function ordersTimelineOrderDeleteLabel(order = {}) {
    return ordersFirstClientText(order?.title, order?.name, order?.clientLabel, order?.client, order?.clientName, 'to zlecenie')
  }
  
  function ordersConfirmTimelineOrderDelete(order = {}) {
    const label = ordersTimelineOrderDeleteLabel(order)
    if (ordersCurrentUserCanDeleteHistoricalOrders()) {
      return window.confirm(
        [
          `Czy na pewno chcesz usun\u0105\u0107 zlecenie: ${label}?`,
          '',
          'Ta operacja jest nieodwracalna.',
          '',
          'Jako administrator mo\u017cesz usun\u0105\u0107 tak\u017ce zlecenie historyczne, rozpocz\u0119te albo aktualnie realizowane.',
        ].join('\n'),
      )
    }
    return window.confirm(
      [
        `Czy na pewno chcesz usunąć zlecenie: ${label}?`,
        '',
        'Ta operacja jest nieodwracalna.',
        '',
        'Usunąć można tylko zlecenia w statusie zaplanowane. Historycznych zleceń, zleceń rozpoczętych oraz aktualnie realizowanych nie da się usunąć.',
      ].join('\n'),
    )
  }
  
  function ordersSetInputValue(id, value = '') {
    const node = document.getElementById(id)
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) {
      node.value = String(value ?? '')
    }
  }
  
  function ordersReadInputValue(id) {
    const node = document.getElementById(id)
    return node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement
      ? String(node.value ?? '').trim()
      : ''
  }
  
  function ordersBooleanValue(value) {
    if (typeof value === 'boolean') {
      return value
    }
    if (typeof value === 'number') {
      return value !== 0
    }
    const normalized = String(value ?? '').trim().toLowerCase()
    return ['1', 'true', 'tak', 'yes', 'y', 't', 'on'].includes(normalized)
  }
  
  function ordersExtendedWorkAllowed(order = {}) {
    const candidates = [
      order.allowExtendedWork,
      order.extendedWorkAllowed,
      order.canExtendWorkTime,
      order.workerCanExtendWorkTime,
      order.allowLongerWork,
      order.longerWorkAllowed,
      order.overtimeAllowed,
      order.allowOvertime,
    ]
    for (const candidate of candidates) {
      if (candidate !== undefined && candidate !== null && String(candidate).trim() !== '') {
        return ordersBooleanValue(candidate)
      }
    }
    return false
  }
  
  function ordersSetCheckboxValue(id, checked = false) {
    const node = document.getElementById(id)
    if (node instanceof HTMLInputElement) {
      node.checked = Boolean(checked)
    }
  }
  
  function ordersReadCheckboxValue(id, fallback = false) {
    const node = document.getElementById(id)
    return node instanceof HTMLInputElement ? Boolean(node.checked) : Boolean(fallback)
  }
  
  function ordersReadExtendedWorkAllowed() {
    return ordersReadCheckboxValue('ordersEditAllowExtendedWork', false)
  }
  
  function ordersAssignExtendedWorkFlags(target = {}, allowed = false) {
    const normalized = Boolean(allowed)
    target.allowExtendedWork = normalized
    target.extendedWorkAllowed = normalized
    target.canExtendWorkTime = normalized
    target.workerCanExtendWorkTime = normalized
    target.overtimeAllowed = normalized
    return target
  }

  function ordersWorkerIsAssignable(worker = {}) {
    return typeof workerIsAssignable === 'function' ? workerIsAssignable(worker) : worker?.active !== false
  }

  function ordersResourceCanBeAssigned(resource = {}) {
    if (resource?.type === 'buffer') {
      return true
    }
    if (resource?.type !== 'worker') {
      return false
    }
    return ordersWorkerIsAssignable(resource.worker ?? resource)
  }

  function ordersAssignmentValueKeys(item = {}) {
    return [
      item?.key,
      item?.workerId,
      item?.workerLogin,
      item?.login,
      item?.email,
      item?.loginEmail,
      item?.name,
      item?.label,
    ]
      .map((value) => normalizeSearchText(value))
      .filter(Boolean)
  }

  function ordersResourceValueKeys(resource = {}) {
    const worker = resource?.worker ?? {}
    return [
      resource?.key,
      resource?.name,
      worker?.workerId,
      worker?.id,
      worker?.workerLogin,
      worker?.login,
      worker?.email,
      worker?.loginEmail,
      worker?.workerName,
      worker?.name,
    ]
      .map((value) => normalizeSearchText(value))
      .filter(Boolean)
  }

  function ordersAssignmentMatchesResource(assignment = {}, resource = {}) {
    if (!ordersResourceCanBeAssigned(resource)) {
      return false
    }
    const assignmentKeys = new Set(ordersAssignmentValueKeys(assignment))
    if (!assignmentKeys.size) {
      return false
    }
    return ordersResourceValueKeys(resource).some((key) => assignmentKeys.has(key))
  }

  function ordersRowsFromWorkerAssignments(order = {}, resources = calendarTimelineResources()) {
    const source = ordersStoredWorkerAssignments(order)
    const pool = Array.isArray(resources) ? resources : []
    const rows = []
    source.forEach((assignment) => {
      const index = pool.findIndex((resource) => ordersAssignmentMatchesResource(assignment, resource))
      if (index >= 0 && !rows.includes(index)) {
        rows.push(index)
      }
    })
    return rows
  }

  function ordersAllocationIsUnassigned(item = {}) {
    const type = normalizeSearchText(item?.type)
    if (['buffer', 'bufor', 'unassigned', 'empty'].includes(type)) {
      return true
    }
    const label = normalizeSearchText(
      item?.label ??
        item?.name ??
        item?.workerName ??
        item?.workerLabel ??
        '',
    )
    return label === 'bufor' || label === 'buffer' || label.startsWith('do obsadzenia')
  }

  function ordersAssignmentHasWorkerDetails(assignment = {}) {
    const keys = ordersAssignmentValueKeys(assignment).filter((key) => key !== 'buffer' && key !== 'bufor')
    return keys.length > 0
  }

  function ordersSavedWorkerAssignmentLabels(order = {}) {
    const seen = new Set()
    return ordersStoredWorkerAssignments(order)
      .map((assignment) =>
        String(
          assignment?.name ??
            assignment?.label ??
            assignment?.workerName ??
            assignment?.workerLogin ??
            assignment?.login ??
            assignment?.workerId ??
            '',
        ).trim(),
      )
      .filter(Boolean)
      .filter((label) => {
        const key = normalizeSearchText(label)
        if (!key || key === 'bufor' || seen.has(key)) {
          return false
        }
        seen.add(key)
        return true
      })
  }

  function ordersOrderHasInactiveOnlyWorkerAssignments(order = {}, resources = calendarTimelineResources()) {
    const pool = Array.isArray(resources) ? resources : []
    const assignments = ordersStoredWorkerAssignments(order)
    if (!assignments.some((assignment) => ordersAssignmentHasWorkerDetails(assignment))) {
      return false
    }
    return !ordersRowsFromWorkerAssignments(order, pool).some((row) => pool[row]?.type === 'worker')
  }

  function ordersShouldPreserveInactiveWorkerAssignments(
    order = {},
    selectedRows = [],
    selectedAssignments = [],
    resources = calendarTimelineResources(),
  ) {
    const pool = Array.isArray(resources) ? resources : []
    if (!ordersOrderHasInactiveOnlyWorkerAssignments(order, pool)) {
      return false
    }
    const rows = (Array.isArray(selectedRows) ? selectedRows : [])
      .map((row) => Number(row))
      .filter((row, index, list) => Number.isInteger(row) && row >= 0 && list.indexOf(row) === index)
    const selectedOnlyBuffer = rows.length === 1 && pool[rows[0]]?.type === 'buffer'
    const selectedHasWorker = (Array.isArray(selectedAssignments) ? selectedAssignments : []).some((assignment) => {
      const row = Number(assignment?.row)
      return Number.isInteger(row) && pool[row]?.type === 'worker'
    })
    return selectedOnlyBuffer && !selectedHasWorker
  }

  function ordersPreservedWorkerAssignmentState(order = {}, fallbackRows = [0]) {
    const row = Number(order?.row)
    const assignedRows = Array.isArray(order?.assignedRows) && order.assignedRows.length ? order.assignedRows : fallbackRows
    return {
      row: Number.isInteger(row) && row >= 0 ? row : Number(assignedRows[0] ?? fallbackRows[0] ?? 0),
      assignedRows,
      workerAssignments: Array.isArray(order?.workerAssignments) ? order.workerAssignments : [],
    }
  }
  
  function ordersWorkerOptionsHtml(selectedRow) {
    const selected = Number(selectedRow)
    return [
      `<option value=""${Number.isFinite(selected) ? '' : ' selected'}>Wybierz</option>`,
      ...calendarTimelineResources()
        .map((resource, index) => ({ resource, index }))
        .filter(({ resource }) => ordersResourceCanBeAssigned(resource))
        .map(({ resource, index }) => {
          const selectedAttr = Number.isFinite(selected) && index === selected ? ' selected' : ''
          return `<option value="${index}"${selectedAttr}>${escapeHtml(resource.name || `Wiersz ${index + 1}`)}</option>`
        }),
    ].join('')
  }
  
  function ordersNormalizeOrderRows(order = {}, resources = calendarTimelineResources()) {
    const max = Array.isArray(resources) && resources.length ? resources.length : Number.POSITIVE_INFINITY
    const stableRows = ordersStoredAssignmentRows(order, resources)
    if (stableRows.length) {
      return stableRows
    }
    if (ordersHasCanonicalWorkAllocations(order)) {
      return [ordersServiceBlockBufferRow(resources)]
    }
    if (Array.isArray(resources) && resources.length && ordersStoredWorkerAssignments(order).some((item) => ordersAssignmentHasStableIdentity(item))) {
      return [0]
    }
    const source = Array.isArray(order?.assignedRows) && order.assignedRows.length ? order.assignedRows : [order?.row]
    const rows = []
    source.forEach((value) => {
      const row = Number(value)
      const resource = Array.isArray(resources) && resources.length ? resources[row] : null
      if (
        !Number.isInteger(row) ||
        row < 0 ||
        row >= max ||
        rows.includes(row) ||
        (resource && !ordersResourceCanBeAssigned(resource))
      ) {
        return
      }
      rows.push(row)
    })
    return rows.length ? rows : [0]
  }
  
  function calendarTimelineRowAllowsOverlap(rowIndex, resources = calendarTimelineResources()) {
    const row = Number(rowIndex)
    return Number.isInteger(row) && resources[row]?.type === 'buffer'
  }
  
  function ordersReadSelectedWorkerRows() {
    const checklist = document.getElementById('ordersEditWorkerChecklist')
    const primaryRow = Number(ordersReadInputValue('ordersEditWorker'))
    if (!checklist) {
      return Number.isInteger(primaryRow) && primaryRow >= 0 ? [primaryRow] : [0]
    }
    const rows = []
    ;[...checklist.querySelectorAll('[data-orders-worker-row]:checked')]
      .map((input) => Number(input.getAttribute('data-orders-worker-row')))
      .forEach((row) => {
        if (Number.isInteger(row) && row >= 0 && !rows.includes(row)) {
          rows.push(row)
        }
      })
    return rows.length ? rows : [0]
  }
  
  function ordersWorkerAssignmentsFromRows(rows = [], resources = calendarTimelineResources()) {
    return rows
      .map((row) => {
        const resource = resources[row] ?? {}
        if (!ordersResourceCanBeAssigned(resource)) {
          return null
        }
        const worker = resource.worker ?? {}
        const workerId = dashboardCanonicalWorkerId(worker.workerId ?? worker.id) || String(worker.workerId ?? worker.id ?? '').trim()
        return {
          row,
          name: String(resource.name ?? `Wiersz ${row + 1}`).trim(),
          key: String(resource.key ?? '').trim(),
          workerId,
          workerLogin: String(worker.workerLogin ?? worker.login ?? '').trim(),
        }
      })
      .filter(Boolean)
      .filter((item) => item.name)
  }

  function ordersParseAssignmentList(value) {
    if (Array.isArray(value)) {
      return value
    }
    if (value && typeof value === 'object') {
      return [value]
    }
    const raw = String(value ?? '').trim()
    if (!raw) {
      return []
    }
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
      return parsed && typeof parsed === 'object' ? [parsed] : []
    } catch {
      return []
    }
  }

  function ordersAssignmentDisplayName(assignment = {}) {
    return String(
      assignment?.name ??
        assignment?.label ??
        assignment?.workerName ??
        assignment?.workerLabel ??
        assignment?.fullName ??
        '',
    ).trim()
  }

  function ordersAssignmentWorkerId(assignment = {}) {
    const explicit = assignment?.workerId ?? assignment?.worker_id ?? assignment?.employeeId
    const explicitText = String(explicit ?? '').trim()
    if (explicitText) {
      return dashboardCanonicalWorkerId(explicitText) || explicitText
    }
    const rawId = String(assignment?.id ?? '').trim()
    if (!rawId || /^(row|weekly|slot|buffer|bufor)(:|$)/i.test(rawId)) {
      return ''
    }
    return dashboardCanonicalWorkerId(rawId) || rawId
  }

  function ordersAssignmentWorkerLogin(assignment = {}) {
    return String(
      assignment?.workerLogin ??
        assignment?.login ??
        assignment?.loginEmail ??
        assignment?.email ??
        '',
    ).trim()
  }

  function ordersAssignmentStableKey(assignment = {}) {
    const rawKey = String(assignment?.key ?? assignment?.workerKey ?? '').trim()
    if (!rawKey || /^(row|weekly|slot|buffer|bufor)(:|$)/i.test(rawKey)) {
      return ''
    }
    return rawKey
  }

  function ordersNormalizeStoredWorkerAssignment(item, index = 0) {
    if (typeof item === 'string') {
      const workerId = ordersAssignmentWorkerId({ workerId: item })
      return workerId
        ? {
            row: index,
            name: workerId,
            key: workerId,
            workerId,
            workerLogin: '',
          }
        : null
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return null
    }
    const row = Number(item.row ?? item.rowIndex)
    const workerId = ordersAssignmentWorkerId(item)
    const workerLogin = ordersAssignmentWorkerLogin(item)
    const key = ordersAssignmentStableKey(item)
    const name = ordersAssignmentDisplayName(item) || workerId || workerLogin
    return {
      ...item,
      row: Number.isInteger(row) && row >= 0 ? row : index,
      name,
      label: String(item.label ?? name).trim(),
      key: key || workerId || workerLogin || `row:${Number.isInteger(row) ? row : index}`,
      workerId,
      workerLogin,
      workerKey: key,
    }
  }

  function ordersDedupeStoredWorkerAssignments(assignments = []) {
    const seen = new Set()
    return (Array.isArray(assignments) ? assignments : []).filter((assignment) => {
      const identityKey = normalizeSearchText(
        assignment.workerId || assignment.workerLogin || ordersAssignmentStableKey(assignment) || assignment.name,
      )
      if (!identityKey || seen.has(identityKey)) {
        return false
      }
      seen.add(identityKey)
      return true
    })
  }

  function ordersAssignmentRepresentsWorker(source = {}, assignment = {}) {
    if (!assignment || ordersAllocationIsUnassigned(source) || ordersAllocationIsUnassigned(assignment)) {
      return false
    }
    const type = normalizeSearchText(source?.type ?? assignment?.type)
    const name = normalizeSearchText(ordersAssignmentDisplayName(assignment))
    return Boolean(
      type === 'worker' ||
        assignment.workerId ||
        assignment.workerLogin ||
        ordersAssignmentStableKey(assignment) ||
        (name && name !== 'bufor' && name !== 'buffer'),
    )
  }

  function ordersCanonicalAllocationItems(order = {}) {
    const sources = [
      order?.workAllocations,
      order?.workerAllocations,
    ]
    return sources.flatMap((source) => ordersParseAssignmentList(source))
  }

  function ordersHasCanonicalWorkAllocations(order = {}) {
    return ordersCanonicalAllocationItems(order).length > 0
  }

  function ordersStoredWorkerAssignments(order = {}) {
    const canonicalItems = ordersCanonicalAllocationItems(order)
    if (canonicalItems.length) {
      const canonicalAssignments = canonicalItems
        .map((item, index) => {
          const assignment = ordersNormalizeStoredWorkerAssignment(item, index)
          return ordersAssignmentRepresentsWorker(item, assignment) ? assignment : null
        })
        .filter(Boolean)
      return ordersDedupeStoredWorkerAssignments(canonicalAssignments)
    }

    const sources = [order?.workerAssignments, order?.assignedWorkers, order?.workers]
    const result = []
    sources.forEach((source) => {
      ordersParseAssignmentList(source).forEach((item, index) => {
        const assignment = ordersNormalizeStoredWorkerAssignment(item, index)
        if (assignment && (assignment.workerId || assignment.workerLogin || assignment.name)) {
          result.push(assignment)
        }
      })
    })

    const workerLabelParts = String(order?.workerLabel ?? order?.workerName ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    ordersParseAssignmentList(order?.workerIds).forEach((item, index) => {
      const assignment = ordersNormalizeStoredWorkerAssignment(
        typeof item === 'string' ? { workerId: item, name: workerLabelParts[index] || item } : item,
        index,
      )
      if (assignment?.workerId || assignment?.workerLogin) {
        result.push(assignment)
      }
    })

    const singleWorker = ordersNormalizeStoredWorkerAssignment(
      {
        row: order?.row,
        workerId: order?.workerId,
        workerLogin: order?.workerLogin,
        name: order?.workerName || order?.workerLabel,
        key: order?.workerId || order?.workerLogin,
      },
      0,
    )
    if (singleWorker && (singleWorker.workerId || singleWorker.workerLogin || singleWorker.name)) {
      result.push(singleWorker)
    }

    return ordersDedupeStoredWorkerAssignments(result)
  }

  function ordersAssignmentHasStableIdentity(assignment = {}) {
    return Boolean(
      ordersAssignmentWorkerId(assignment) ||
        ordersAssignmentWorkerLogin(assignment) ||
        ordersAssignmentStableKey(assignment),
    )
  }

  function ordersResourceStableIdentitySet(resource = {}) {
    const worker = resource?.worker ?? {}
    const values = [
      resource?.key,
      worker?.workerId,
      worker?.id,
      dashboardCanonicalWorkerId(worker?.workerId ?? worker?.id),
      worker?.workerLogin,
      worker?.login,
      worker?.loginEmail,
      worker?.email,
    ]
    return new Set(values.map((value) => normalizeSearchText(value)).filter(Boolean))
  }

  function ordersWorkerRowFromAssignmentLike(assignment = {}, resources = calendarTimelineResources()) {
    const resourceList = Array.isArray(resources) ? resources : []
    if (!resourceList.length || !assignment || typeof assignment !== 'object') {
      return null
    }

    const identityValues = [
      ordersAssignmentWorkerId(assignment),
      ordersAssignmentWorkerLogin(assignment),
      ordersAssignmentStableKey(assignment),
    ].map((value) => normalizeSearchText(value)).filter(Boolean)

    if (identityValues.length) {
      const identityRow = resourceList.findIndex((resource) => {
        if (!ordersResourceCanBeAssigned(resource)) {
          return false
        }
        const resourceValues = ordersResourceStableIdentitySet(resource)
        return identityValues.some((value) => resourceValues.has(value))
      })
      if (identityRow >= 0) {
        return identityRow
      }
    }

    const nameKey = normalizeSearchText(
      ordersAssignmentDisplayName(assignment) ||
        assignment?.label ||
        assignment?.name ||
        assignment?.workerName ||
        assignment?.workerLabel,
    )
    if (nameKey && !['bufor', 'buffer', 'do obsadzenia', 'unassigned', 'empty'].includes(nameKey)) {
      const matches = resourceList
        .map((resource, index) => ({ resource, index }))
        .filter(({ resource }) => ordersResourceCanBeAssigned(resource) && normalizeSearchText(resource?.name) === nameKey)
      if (matches.length === 1) {
        return matches[0].index
      }
    }

    const directRow = Number(assignment?.row ?? assignment?.rowIndex)
    const directResource = resourceList[directRow]
    if (
      Number.isInteger(directRow) &&
      directRow >= 0 &&
      directRow < resourceList.length &&
      ordersResourceCanBeAssigned(directResource)
    ) {
      return directRow
    }

    return null
  }

  function ordersStoredAssignmentRows(order = {}, resources = calendarTimelineResources()) {
    const resourceList = Array.isArray(resources) ? resources : []
    if (!resourceList.length) {
      return []
    }

    const rows = []
    const assignments = ordersStoredWorkerAssignments(order)
    assignments.forEach((assignment) => {
      if (!ordersAssignmentHasStableIdentity(assignment) && !ordersAssignmentDisplayName(assignment)) {
        return
      }

      const identityValues = [
        ordersAssignmentWorkerId(assignment),
        ordersAssignmentWorkerLogin(assignment),
        ordersAssignmentStableKey(assignment),
      ].map((value) => normalizeSearchText(value)).filter(Boolean)

      let rowIndex = -1
      if (identityValues.length) {
        rowIndex = resourceList.findIndex((resource) => {
          const resourceValues = ordersResourceStableIdentitySet(resource)
          return identityValues.some((value) => resourceValues.has(value))
        })
      }

      if (rowIndex < 0) {
        const nameKey = normalizeSearchText(ordersAssignmentDisplayName(assignment))
        if (nameKey) {
          const matches = resourceList
            .map((resource, index) => ({ resource, index }))
            .filter(({ resource }) => normalizeSearchText(resource?.name) === nameKey)
          if (matches.length === 1) {
            rowIndex = matches[0].index
          }
        }
      }

      if (rowIndex < 0) {
        const directRow = Number(assignment?.row ?? assignment?.rowIndex)
        const directResource = resourceList[directRow]
        if (
          Number.isInteger(directRow) &&
          directRow >= 0 &&
          directRow < resourceList.length &&
          ordersResourceCanBeAssigned(directResource)
        ) {
          rowIndex = directRow
        }
      }

      if (Number.isInteger(rowIndex) && rowIndex >= 0 && !rows.includes(rowIndex)) {
        rows.push(rowIndex)
      }
    })

    return rows
  }
  
  function ordersWorkerLabelForOrder(order = {}, resources = calendarTimelineResources()) {
    const seenLabels = new Set()
    const storedLabels = ordersStoredWorkerAssignments(order)
      .map((assignment) => ordersAssignmentDisplayName(assignment))
      .filter((label) => label && normalizeSearchText(label) !== 'bufor')
      .filter((label) => {
        const key = normalizeSearchText(label)
        if (!key || seenLabels.has(key)) return false
        seenLabels.add(key)
        return true
      })
    if (storedLabels.length) {
      return storedLabels.join(', ')
    }
    const rows = ordersNormalizeOrderRows(order, resources)
    const label = ordersWorkerAssignmentsFromRows(rows, resources)
      .map((item) => item.name)
      .join(', ')
    if (ordersOrderHasInactiveOnlyWorkerAssignments(order, resources)) {
      return ordersSavedWorkerAssignmentLabels(order).join(', ') || label
    }
    return label
  }
  
  function ordersPreviewWorkerLabel(order = {}, resources = calendarTimelineResources()) {
    const rows =
      document.getElementById('ordersEditorPanel') && String(order?.id ?? '') === String(appState.ordersEditingId ?? '')
        ? ordersReadSelectedWorkerRows()
        : ordersNormalizeOrderRows(order, resources)
    const label = ordersWorkerAssignmentsFromRows(rows, resources)
      .filter((item) => resources[item.row]?.type === 'worker')
      .map((item) => item.name)
      .join(', ')
    if (!label && ordersOrderHasInactiveOnlyWorkerAssignments(order, resources)) {
      return ordersSavedWorkerAssignmentLabels(order).join(', ')
    }
    return label
  }
  
  function ordersWorkerChecklistHtml(order = {}) {
    const resources = calendarTimelineResources()
    const selectedRows = new Set(ordersNormalizeOrderRows(order, resources))
    return resources
      .map((resource, index) => ({ resource, index }))
      .filter(({ resource }) => ordersResourceCanBeAssigned(resource))
      .map(({ resource, index }) => {
        const checked = selectedRows.has(index) ? ' checked' : ''
        return `
          <label class="orders-worker-choice">
            <input type="checkbox" data-orders-worker-row="${index}"${checked} />
            <span>${escapeHtml(resource.name || `Wiersz ${index + 1}`)}</span>
          </label>
        `
      })
      .join('')
  }
  
  function ordersWorkerRowLabel(rowIndex, resources = calendarTimelineResources()) {
    const row = Number(rowIndex)
    return String(resources[row]?.name ?? `Wiersz ${row + 1}`).trim()
  }
  
  function ordersWorkerSelectionLabel(rows = [], resources = calendarTimelineResources()) {
    const normalizedRows = (Array.isArray(rows) ? rows : [])
      .map((row) => Number(row))
      .filter((row, index, list) => Number.isInteger(row) && row >= 0 && row < resources.length && list.indexOf(row) === index)
    const safeRows = normalizedRows.length ? normalizedRows : [0]
    const names = safeRows.map((row) => ordersWorkerRowLabel(row, resources)).filter(Boolean)
    if (safeRows.length === 1) {
      return names[0] || 'BUFOR'
    }
    return `${safeRows.length} osoby: ${names.join(', ')}`
  }
  
  function ordersSyncWorkerPickerLabel(rows = ordersReadSelectedWorkerRows()) {
    const resources = calendarTimelineResources()
    const selectedRows = (Array.isArray(rows) && rows.length ? rows : [0])
      .map((row) => Number(row))
      .filter((row, index, list) => Number.isInteger(row) && row >= 0 && row < resources.length && list.indexOf(row) === index)
    const safeRows = selectedRows.length ? selectedRows : [0]
    const label = ordersWorkerSelectionLabel(safeRows, resources)
    const summary = document.getElementById('ordersEditWorkerSummary')
    const text = document.getElementById('ordersEditWorkerSummaryText')
    if (text) {
      text.textContent = label
    }
    if (summary) {
      summary.setAttribute('title', label)
    }
    ordersSetInputValue('ordersEditWorker', safeRows[0] ?? 0)
  }
  
  function ordersNormalizeWorkerPickerSelection(changedInput = null) {
    const checklist = document.getElementById('ordersEditWorkerChecklist')
    if (!checklist) {
      return [0]
    }
    const boxes = [...checklist.querySelectorAll('[data-orders-worker-row]')].filter((input) => input instanceof HTMLInputElement)
    const bufferBox = boxes.find((input) => calendarTimelineRowAllowsOverlap(Number(input.getAttribute('data-orders-worker-row'))))
    const changedRow = Number(changedInput?.getAttribute?.('data-orders-worker-row'))
    const changedIsBuffer = changedInput instanceof HTMLInputElement && calendarTimelineRowAllowsOverlap(changedRow)
  
    if (changedInput instanceof HTMLInputElement && changedInput.checked) {
      if (changedIsBuffer) {
        boxes.forEach((input) => {
          if (input !== changedInput) input.checked = false
        })
      } else if (bufferBox) {
        bufferBox.checked = false
      }
    }
  
    if (!boxes.some((input) => input.checked) && bufferBox) {
      bufferBox.checked = true
    }
  
    return ordersReadSelectedWorkerRows()
  }
  
  function ordersRenderWorkerChecklist(order = {}) {
    const checklist = document.getElementById('ordersEditWorkerChecklist')
    if (checklist) {
      checklist.innerHTML = ordersWorkerChecklistHtml(order)
    }
    const selected = ordersNormalizeOrderRows(order)
    ordersSetInputValue('ordersEditWorker', selected[0] ?? 0)
    ordersSyncWorkerPickerLabel(selected)
  }
  
  function ordersFormatWorkMinutes(minutes = 0) {
    const total = Math.max(0, Math.round(Number(minutes) || 0))
    const hours = Math.floor(total / 60)
    const mins = total % 60
    if (!hours) {
      return `${mins} min`
    }
    return mins ? `${hours}h ${pad2(mins)}min` : `${hours}h`
  }
  
  function ordersHoursInputValue(minutes = 0) {
    const hours = Math.max(0, Math.round(Number(minutes) || 0)) / 60
    return Number.isInteger(hours) ? String(hours) : String(Math.round(hours * 100) / 100)
  }
  
  function ordersStoredWorkMinutes(order = {}) {
    const stored = Number(
      order.requiredWorkMinutes ?? order.workMinutes ?? order.serviceWorkMinutes ?? order.standardWorkMinutes ?? 0,
    )
    if (Number.isFinite(stored) && stored > 0) {
      return Math.max(15, Math.round(stored))
    }
    return Math.max(60, calendarTimelineOrderDurationMinutes(order))
  }
  
  function ordersReadWorkMinutes(order = {}) {
    const inputValue = ordersReadInputValue('ordersEditWorkHours')
    const rawHours = inputValue ? Number(inputValue) : NaN
    if (Number.isFinite(rawHours) && rawHours > 0) {
      return Math.max(15, Math.round(rawHours * 60))
    }
    return ordersStoredWorkMinutes(order)
  }

  function ordersNormalizeEditorServiceBlockContext(options = {}) {
    const sourceOrderId = String(options?.orderId ?? options?.sourceOrderId ?? '').trim()
    const workSlotKey = String(options?.workSlotKey ?? '').trim() || ordersWorkSlotKeyFromOrderId(sourceOrderId)
    const context = {
      orderId: sourceOrderId,
      sourceOrderId: String(options?.sourceOrderId ?? '').trim(),
      workSlotKey,
      serviceBlockId: String(options?.serviceBlockId ?? '').trim(),
      serviceBlockKind: String(options?.serviceBlockKind ?? '').trim(),
      serviceBlockLabel: String(options?.serviceBlockLabel ?? '').trim(),
      occurrenceDateYmd: String(options?.occurrenceDateYmd ?? options?.dateYmd ?? '').trim(),
    }
    return Object.values(context).some(Boolean) ? context : null
  }

  function ordersSetEditorServiceBlockContext(options = {}) {
    ordersEditorPreferredServiceBlockContext = ordersNormalizeEditorServiceBlockContext(options)
  }

  function ordersClearEditorServiceBlockContext() {
    ordersEditorPreferredServiceBlockContext = null
  }

  function ordersServiceBlockHasWorkSlotKey(block = {}, workSlotKey = '') {
    const key = String(workSlotKey ?? '').trim()
    if (!key) {
      return false
    }
    const blockAllocations = [
      ...(Array.isArray(block?.workAllocations) ? block.workAllocations : []),
      ...(Array.isArray(block?.workerAllocations) ? block.workerAllocations : []),
    ]
    if (blockAllocations.some((allocation) => ordersAllocationKeyCandidates(allocation).includes(key))) {
      return true
    }
    const slots = Array.isArray(block?.slots) ? block.slots : []
    return slots.some((slot, index) => ordersServiceSlotKeyCandidates(slot, block, index).includes(key))
  }

  function ordersServiceBlockMatchesContext(block = {}, context = null) {
    if (!block || !context) {
      return false
    }
    const blockId = String(block?.id ?? block?.serviceBlockId ?? block?.teamId ?? '').trim()
    const blockKind = String(block?.kind ?? block?.serviceBlockKind ?? '').trim()
    const blockLabel = String(block?.label ?? block?.name ?? '').trim()
    const contextId = String(context.serviceBlockId ?? '').trim()
    const contextKind = String(context.serviceBlockKind ?? '').trim()
    const contextLabel = String(context.serviceBlockLabel ?? '').trim()
    if (contextId && blockId && contextId === blockId) {
      return true
    }
    if (ordersServiceBlockHasWorkSlotKey(block, context.workSlotKey)) {
      return true
    }
    if (contextLabel && blockLabel && normalizeSearchText(contextLabel) === normalizeSearchText(blockLabel)) {
      return true
    }
    return Boolean(contextKind && blockKind && contextKind === blockKind)
  }

  function ordersPreferredServiceBlock(blocks = [], context = ordersEditorPreferredServiceBlockContext) {
    if (!Array.isArray(blocks) || !context) {
      return null
    }
    return blocks.find((block) => ordersServiceBlockMatchesContext(block, context)) || null
  }
  
  function ordersPrimaryServiceBlockTiming(order = {}, blocks = null) {
    const controlBlocks = Array.isArray(blocks) ? [] : ordersReadServiceBlocksFromControls(order)
    const sourceBlocks = Array.isArray(blocks)
      ? blocks
      : controlBlocks.length
        ? controlBlocks
        : ordersServiceBlocksForOrder(order)
    const blockList = Array.isArray(sourceBlocks) ? sourceBlocks : []
    const primaryBlock = blockList.length
      ? ordersPreferredServiceBlock(blockList) || blockList.find((block) => block && (block.startTime || block.accessStartTime || block.endTime || block.accessEndTime)) || blockList[0] || {}
      : {}
    const fallbackStart = ordersNormalizeTimeField(order?.startTime ?? order?.accessStartTime, '08:00')
    const startTime = ordersNormalizeTimeField(primaryBlock.startTime ?? primaryBlock.accessStartTime, fallbackStart)
    const fallbackEnd = ordersNormalizeTimeField(order?.endTime ?? order?.accessEndTime, ordersDefaultEndTime(startTime))
    const endTime = ordersNormalizeTimeField(primaryBlock.endTime ?? primaryBlock.accessEndTime, fallbackEnd)
    return {
      block: primaryBlock,
      blocks: blockList,
      startTime,
      endTime,
    }
  }
  
  function ordersClearAccessWindows(order = {}) {
    order.accessWindows = []
    order.objectAccessWindows = []
    order.accessTimeWindows = []
    order.buildingAccessWindows = []
    return []
  }
  
  function ordersPrimaryTimeWindowRange(order = {}) {
    const primaryTiming = ordersPrimaryServiceBlockTiming(order)
    const startTime = primaryTiming.startTime
    const endTime = primaryTiming.endTime
    const startMinutes = calendarTimelineTimeMinutes(startTime, 8 * 60)
    let endMinutes = calendarTimelineTimeMinutes(endTime, startMinutes + 60)
    if (endMinutes <= startMinutes) {
      endMinutes += 1440
    }
    return {
      startTime,
      endTime,
      startMinutes,
      endMinutes,
      minutes: Math.max(15, endMinutes - startMinutes),
    }
  }
  
  function ordersAllocationEndTimeFromMinutes(startTime = '08:00', minutes = 60) {
    const start = calendarTimelineTimeMinutes(ordersNormalizeTimeField(startTime, '08:00'), 8 * 60)
    const duration = Math.max(15, Math.round(Number(minutes) || 60))
    return calendarMinutesToTime((start + duration) % 1440) || '23:59'
  }
  
  function ordersAllocationDurationFromTimes(startTime = '08:00', endTime = '') {
    const start = calendarTimelineTimeMinutes(ordersNormalizeTimeField(startTime, '08:00'), 8 * 60)
    let end = calendarTimelineTimeMinutes(ordersNormalizeTimeField(endTime, ordersAllocationEndTimeFromMinutes(startTime, 60)), start + 60)
    if (end <= start) {
      end += 1440
    }
    return Math.max(15, end - start)
  }
  
  function ordersSelectedWorkSubjects(order = {}) {
    const resources = calendarTimelineResources()
    const useEditorSelection =
      document.getElementById('ordersEditorPanel') &&
      String(order?.id ?? '') &&
      String(order?.id ?? '') === String(appState.ordersEditingId ?? '')
    const rows = useEditorSelection ? ordersReadSelectedWorkerRows() : ordersNormalizeOrderRows(order, resources)
    const workerRows = rows.filter((row) => !calendarTimelineRowAllowsOverlap(row, resources))
    if (workerRows.length) {
      return workerRows.map((row, index) => {
        const assignment = ordersWorkerAssignmentsFromRows([row], resources)[0] ?? {}
        const label = assignment.name || ordersWorkerRowLabel(row, resources)
        return {
          key: assignment.key || assignment.workerId || assignment.workerLogin || `row:${row}`,
          row,
          index,
          type: 'worker',
          label,
          name: label,
          workerId: assignment.workerId || '',
          workerLogin: assignment.workerLogin || '',
          workerKey: assignment.key || '',
        }
      })
    }
  
    const requiredPeople = Math.max(
      1,
      Math.min(
        20,
        Math.floor(
          Number(useEditorSelection ? ordersReadInputValue('ordersEditRequiredPeople') : 0) ||
            Number(order.requiredPeople) ||
            Number(order.requiredWorkers) ||
            Number(order.workerSlots) ||
            1,
        ),
      ),
    )
    return Array.from({ length: requiredPeople }, (_, index) => ({
      key: `buffer:${index + 1}`,
      row: 0,
      index,
      type: 'buffer',
      label: `BUFOR ${index + 1}`,
    }))
  }

  function ordersServiceBlockKindIsValid(kind = '') {
    const normalized = String(kind ?? '').trim()
    return ORDERS_SERVICE_BLOCK_KINDS.includes(normalized) || normalized.startsWith(`${ORDERS_SERVICE_TEAM_KIND_PREFIX}-`)
  }

  function ordersServiceBlockKindLabel(kind = 'main', index = 0) {
    const normalized = String(kind ?? '').trim()
    if (ORDERS_SERVICE_BLOCK_LABELS[normalized]) {
      return ORDERS_SERVICE_BLOCK_LABELS[normalized]
    }
    if (normalized.startsWith(`${ORDERS_SERVICE_TEAM_KIND_PREFIX}-`)) {
      return ordersServiceBlockDefaultLabel(index)
    }
    return ORDERS_SERVICE_BLOCK_LABELS.main
  }

  function ordersServiceBlockDefaultLabel(index = 0) {
    const labels = ['Pierwsza zmiana', 'Druga zmiana', 'Trzecia zmiana', 'Czwarta zmiana', 'Piąta zmiana', 'Szósta zmiana']
    const normalizedIndex = Math.max(0, Number(index) || 0)
    return labels[normalizedIndex] || `Zmiana ${normalizedIndex + 1}`
  }

  function ordersServiceBlockId(kind = 'main', index = 0) {
    const normalized = ordersServiceBlockKindIsValid(kind) ? String(kind).trim() : `${ORDERS_SERVICE_TEAM_KIND_PREFIX}-${index + 1}`
    return `service-${normalized}`
  }

  function ordersServiceBlockSortIndex(block = {}) {
    const explicit = Number(block?.sortIndex ?? block?.orderIndex ?? block?.position)
    if (Number.isFinite(explicit)) {
      return explicit
    }
    const kind = String(block?.kind ?? '').trim()
    const legacyIndex = ORDERS_SERVICE_BLOCK_KINDS.indexOf(kind)
    if (legacyIndex >= 0) {
      return legacyIndex
    }
    const numeric = Number(String(kind).replace(`${ORDERS_SERVICE_TEAM_KIND_PREFIX}-`, ''))
    return 100 + (Number.isFinite(numeric) ? numeric : 0)
  }

  function ordersDefaultServiceBlockWeekdays(order = {}) {
    const available = [...ORDERS_ALL_REPEAT_WEEKDAYS]
    const selected = ordersRepeatWeekdaysFromOrder(order).filter((weekday) => available.includes(weekday))
    if (selected.length) {
      return selected
    }
    return available.length ? available : [...ORDERS_DEFAULT_REPEAT_WEEKDAYS]
  }

  function ordersServiceBlockDurationMinutes(block = {}) {
    return ordersTimeWindowMinutes(block.startTime || block.accessStartTime || ORDERS_DEFAULT_ACCESS_START, block.endTime || block.accessEndTime || ORDERS_DEFAULT_ACCESS_END)
  }

  function ordersServiceBlockWorkerRows(block = {}, resources = calendarTimelineResources(), fallbackOrder = null) {
    const max = Array.isArray(resources) && resources.length ? resources.length : Number.POSITIVE_INFINITY
    if (Array.isArray(block?.slots) && block.slots.length) {
      return block.slots
        .map((slot) => Number(slot?.row))
        .filter((row, index, list) => Number.isInteger(row) && row >= 0 && row < max && !calendarTimelineRowAllowsOverlap(row, resources) && list.indexOf(row) === index)
    }
    const rows = Array.isArray(block?.assignedRows) ? block.assignedRows : []
    const directRows = rows
      .map((row) => Number(row))
      .filter((row, index, list) => Number.isInteger(row) && row >= 0 && row < max && !calendarTimelineRowAllowsOverlap(row, resources) && list.indexOf(row) === index)
    if (directRows.length) {
      return directRows
    }
    const storedRows = ordersStoredAssignmentRows(block, resources).filter((row) => !calendarTimelineRowAllowsOverlap(row, resources))
    if (storedRows.length) {
      return storedRows
    }
    if (fallbackOrder && fallbackOrder !== block) {
      return ordersNormalizeOrderRows(fallbackOrder, resources).filter((row) => !calendarTimelineRowAllowsOverlap(row, resources))
    }
    return []
  }

  function ordersServiceBlockBufferRow(resources = calendarTimelineResources()) {
    const list = Array.isArray(resources) ? resources : []
    const row = list.findIndex((resource) => resource?.type === 'buffer')
    return row >= 0 ? row : 0
  }

  function ordersServiceSlotId(slot = {}, index = 0) {
    const raw = String(slot?.slotId ?? slot?.id ?? '').trim()
    return raw || `${ORDERS_SERVICE_SLOT_PREFIX}-${index + 1}`
  }

  function ordersNormalizeServiceSlot(slot = {}, block = {}, resources = calendarTimelineResources(), index = 0) {
    const bufferRow = ordersServiceBlockBufferRow(resources)
    const rawRow = Number(slot?.row ?? slot?.rowIndex)
    const rowIsWorker = Number.isInteger(rawRow) && rawRow >= 0 && resources[rawRow]?.type === 'worker'
    const explicitWorkerId = String(slot?.workerId ?? slot?.worker_id ?? '').trim()
    const explicitWorkerLogin = String(slot?.workerLogin ?? slot?.login ?? '').trim()
    const explicitWorkerKey = String(slot?.workerKey ?? '').trim()
    const slotType = String(slot?.type ?? '').trim().toLowerCase()
    const unassignedTypes = ['buffer', 'bufor', 'unassigned', 'empty']
    const resolvedWorkerRow = ordersWorkerRowFromAssignmentLike(
      {
        ...slot,
        workerId: explicitWorkerId,
        workerLogin: explicitWorkerLogin,
        workerKey: explicitWorkerKey,
        key: explicitWorkerKey || slot?.key,
        name: slot?.name ?? slot?.workerName ?? slot?.label,
        label: slot?.label ?? slot?.name ?? slot?.workerName,
      },
      resources,
    )
    const hasWorker = Boolean(
      explicitWorkerId ||
        explicitWorkerLogin ||
        explicitWorkerKey ||
        (rowIsWorker && !unassignedTypes.includes(slotType)) ||
        (!unassignedTypes.includes(slotType) && Number.isInteger(resolvedWorkerRow)),
    )
    const identityRows = hasWorker
      ? ordersStoredAssignmentRows(
          {
            workerAssignments: [
              {
                ...slot,
                workerId: explicitWorkerId,
                workerLogin: explicitWorkerLogin,
                workerKey: explicitWorkerKey,
                key: explicitWorkerKey,
                name: slot?.name ?? slot?.label,
                label: slot?.label ?? slot?.name,
              },
            ],
          },
          resources,
        )
      : []
    const identityRow = identityRows.find((rowIndex) => !calendarTimelineRowAllowsOverlap(rowIndex, resources))
    const row = hasWorker
      ? Number.isInteger(resolvedWorkerRow)
        ? resolvedWorkerRow
        : Number.isInteger(identityRow)
          ? identityRow
          : rowIsWorker
            ? rawRow
            : bufferRow
      : bufferRow
    const assignment = hasWorker ? ordersWorkerAssignmentsFromRows([row], resources)[0] ?? {} : {}
    const slotId = ordersServiceSlotId(slot, index)
    const hasExplicitMinutes =
      Object.prototype.hasOwnProperty.call(slot, 'minutes') ||
      Object.prototype.hasOwnProperty.call(slot, 'workMinutes') ||
      Object.prototype.hasOwnProperty.call(slot, 'allocationMinutes')
    const rawMinutes = Number(slot?.minutes ?? slot?.workMinutes ?? slot?.allocationMinutes)
    const fallbackMinutes = hasExplicitMinutes
      ? Math.max(0, Math.round(Number.isFinite(rawMinutes) ? rawMinutes : 0))
      : Math.max(15, Math.round(ordersServiceBlockDurationMinutes(block)))
    const startTime = ordersNormalizeTimeField(slot?.startTime ?? slot?.planStartTime, block.startTime || ORDERS_DEFAULT_ACCESS_START)
    const endTime = ordersNormalizeTimeField(slot?.endTime ?? slot?.planEndTime, ordersAllocationEndTimeFromMinutes(startTime, fallbackMinutes))
    const dateYmd = ordersNormalizeDateField(slot?.dateYmd ?? slot?.planDateYmd ?? slot?.startDateYmd ?? block.dateYmd, '')
    const fallbackEndDateYmd =
      dateYmd && calendarTimelineTimeMinutes(endTime, 0) <= calendarTimelineTimeMinutes(startTime, 0)
        ? calendarAddDays(dateYmd, 1)
        : dateYmd
    const endDateYmd = ordersNormalizeDateField(slot?.endDateYmd ?? slot?.planEndDateYmd, fallbackEndDateYmd)
    const rawLabel = String(slot?.label ?? slot?.name ?? '').trim()
    const rawLabelKey = normalizeSearchText(rawLabel)
    const label = hasWorker
      ? assignment.name || (!['bufor', 'buffer', 'do obsadzenia'].includes(rawLabelKey) ? rawLabel : '') || ordersWorkerRowLabel(row, resources)
      : rawLabel || `Osoba ${index + 1}`
    return {
      id: slotId,
      slotId,
      label,
      row,
      type: hasWorker ? 'worker' : 'unassigned',
      workerId: hasWorker ? explicitWorkerId || assignment.workerId || '' : '',
      workerLogin: hasWorker ? explicitWorkerLogin || assignment.workerLogin || '' : '',
      workerKey: hasWorker ? explicitWorkerKey || assignment.key || '' : '',
      minutes: fallbackMinutes,
      dateYmd,
      planDateYmd: dateYmd,
      startDateYmd: dateYmd,
      endDateYmd,
      planEndDateYmd: endDateYmd,
      startTime,
      endTime,
      planStartTime: startTime,
      planEndTime: endTime,
    }
  }

  function ordersServiceBlockAllocationSource(block = {}, order = {}) {
    const orderAllocations = Array.isArray(order?.workAllocations) && order.workAllocations.length
      ? order.workAllocations
      : Array.isArray(order?.workerAllocations) && order.workerAllocations.length
        ? order.workerAllocations
        : []
    const blockId = String(block?.id ?? block?.serviceBlockId ?? block?.teamId ?? '').trim()
    const blockKind = String(block?.kind ?? block?.serviceBlockKind ?? '').trim()
    const matchesBlock = (allocation = {}) => {
      const allocationBlockId = String(allocation?.serviceBlockId ?? allocation?.teamId ?? '').trim()
      const allocationBlockKind = String(allocation?.serviceBlockKind ?? '').trim()
      return Boolean(
        (blockId && allocationBlockId && allocationBlockId === blockId) ||
          (blockKind && allocationBlockKind && allocationBlockKind === blockKind),
      )
    }

    const matchedOrderAllocations = orderAllocations.filter(matchesBlock)
    if (matchedOrderAllocations.length) {
      return matchedOrderAllocations
    }

    const orderBlocks = Array.isArray(order?.serviceBlocks) ? order.serviceBlocks : []
    if (orderAllocations.length && orderBlocks.length <= 1) {
      return orderAllocations
    }

    const blockSlots = Array.isArray(block?.slots) ? block.slots : []
    const blockSlotKeys = new Set(
      blockSlots.flatMap((slot, index) => ordersServiceSlotKeyCandidates(slot, block, index)),
    )
    if (blockSlotKeys.size) {
      const matchedBySlot = orderAllocations.filter((allocation) => {
        const allocationKeys = [
          allocation?.key,
          allocation?.slotId,
          allocation?.workSlotId,
          allocation?.id,
        ]
          .map((value) => String(value ?? '').trim())
          .filter(Boolean)
        return allocationKeys.some((key) => blockSlotKeys.has(key))
      })
      if (matchedBySlot.length) {
        return matchedBySlot
      }
    }

    return Array.isArray(block?.workAllocations) && block.workAllocations.length
      ? block.workAllocations
      : Array.isArray(block?.workerAllocations) && block.workerAllocations.length
        ? block.workerAllocations
        : []
  }

  function ordersServiceSlotKeyCandidates(slot = {}, block = {}, index = 0) {
    const slotId = String(slot?.slotId ?? slot?.id ?? `${ORDERS_SERVICE_SLOT_PREFIX}-${index + 1}`).trim()
    const blockId = String(block?.id ?? '').trim()
    const blockKind = String(block?.kind ?? '').trim()
    return [
      slot?.key,
      slotId,
      blockId && slotId ? `${ORDERS_SERVICE_SLOT_PREFIX}:${blockId}:${slotId}` : '',
      blockKind && slotId ? `${ORDERS_SERVICE_SLOT_PREFIX}:${blockKind}:${slotId}` : '',
    ].map((value) => String(value ?? '').trim()).filter(Boolean)
  }

  function ordersServiceSlotMatchesAllocation(slot = {}, allocation = {}, block = {}, slotIndex = 0) {
    const allocationKeys = [
      allocation?.key,
      allocation?.slotId,
      allocation?.workSlotId,
      allocation?.id,
    ].map((value) => String(value ?? '').trim()).filter(Boolean)
    const slotKeys = ordersServiceSlotKeyCandidates(slot, block, slotIndex)
    if (allocationKeys.some((key) => slotKeys.includes(key))) {
      return true
    }

    const allocationIndex = Number(allocation?.index ?? allocation?.slotIndex)
    return Number.isInteger(allocationIndex) && allocationIndex === slotIndex
  }

  function ordersServiceSlotWithAllocation(slot = {}, allocation = {}, resources = calendarTimelineResources(), index = 0) {
    const allocationRow = Number(allocation?.row ?? allocation?.rowIndex)
    const rowIsWorker = Number.isInteger(allocationRow) && resources[allocationRow]?.type === 'worker'
    const allocationType = String(allocation?.type ?? '').trim().toLowerCase()
    const unassignedTypes = ['buffer', 'bufor', 'unassigned', 'empty']
    const resolvedWorkerRow = ordersWorkerRowFromAssignmentLike(
      {
        ...allocation,
        name: allocation?.name ?? allocation?.workerName ?? allocation?.label,
        label: allocation?.label ?? allocation?.name ?? allocation?.workerName,
      },
      resources,
    )
    const hasWorker = allocationType === 'worker' || (
      rowIsWorker &&
      !unassignedTypes.includes(allocationType)
    ) || (!unassignedTypes.includes(allocationType) && Number.isInteger(resolvedWorkerRow))
    const row = hasWorker
      ? Number.isInteger(resolvedWorkerRow)
        ? resolvedWorkerRow
        : Number.isInteger(allocationRow)
          ? allocationRow
          : slot?.row
      : Number.isInteger(allocationRow)
        ? allocationRow
        : slot?.row
    const assignment = hasWorker ? ordersWorkerAssignmentsFromRows([row], resources)[0] ?? {} : {}
    const slotId = String(slot?.slotId ?? slot?.id ?? allocation?.slotId ?? `${ORDERS_SERVICE_SLOT_PREFIX}-${index + 1}`).trim()
    const label = String(
      hasWorker
        ? assignment.name ?? allocation?.label ?? allocation?.name ?? slot?.label ?? slot?.name ?? ''
        : slot?.label ?? slot?.name ?? allocation?.label ?? allocation?.name ?? '',
    ).trim()
    return {
      ...slot,
      id: slot?.id || slotId,
      slotId,
      key: String(allocation?.key ?? slot?.key ?? '').trim(),
      row,
      type: hasWorker ? 'worker' : 'unassigned',
      label,
      name: String(assignment.name ?? allocation?.name ?? label ?? slot?.name ?? '').trim(),
      workerId: hasWorker ? String(allocation?.workerId ?? slot?.workerId ?? assignment.workerId ?? '').trim() : '',
      workerLogin: hasWorker ? String(allocation?.workerLogin ?? slot?.workerLogin ?? assignment.workerLogin ?? '').trim() : '',
      workerKey: hasWorker ? String(allocation?.workerKey ?? slot?.workerKey ?? assignment.key ?? '').trim() : '',
      minutes: allocation?.minutes ?? allocation?.workMinutes ?? slot?.minutes,
      dateYmd: slot?.dateYmd ?? slot?.planDateYmd ?? allocation?.dateYmd ?? allocation?.planDateYmd ?? allocation?.startDateYmd,
      planDateYmd: slot?.planDateYmd ?? slot?.dateYmd ?? allocation?.planDateYmd ?? allocation?.dateYmd,
      startDateYmd: slot?.startDateYmd ?? slot?.dateYmd ?? allocation?.startDateYmd ?? allocation?.dateYmd,
      endDateYmd: slot?.endDateYmd ?? slot?.planEndDateYmd ?? allocation?.endDateYmd ?? allocation?.planEndDateYmd,
      planEndDateYmd: slot?.planEndDateYmd ?? slot?.endDateYmd ?? allocation?.planEndDateYmd ?? allocation?.endDateYmd,
      startTime: slot?.startTime ?? slot?.planStartTime ?? allocation?.startTime ?? allocation?.planStartTime,
      endTime: slot?.endTime ?? slot?.planEndTime ?? allocation?.endTime ?? allocation?.planEndTime,
      planStartTime: slot?.planStartTime ?? slot?.startTime ?? allocation?.planStartTime ?? allocation?.startTime,
      planEndTime: slot?.planEndTime ?? slot?.endTime ?? allocation?.planEndTime ?? allocation?.endTime,
    }
  }

  function ordersServiceSlotsWithAllocations(slots = [], allocations = [], block = {}, resources = calendarTimelineResources()) {
    const sourceSlots = Array.isArray(slots) ? slots : []
    const sourceAllocations = Array.isArray(allocations) ? allocations.filter(Boolean) : []
    if (!sourceSlots.length || !sourceAllocations.length) {
      return sourceSlots
    }
    const used = new Set()
    return sourceSlots.map((slot, index) => {
      let allocationIndex = sourceAllocations.findIndex((allocation, candidateIndex) =>
        !used.has(candidateIndex) && ordersServiceSlotMatchesAllocation(slot, allocation, block, index),
      )
      if (allocationIndex < 0 && sourceAllocations.length === sourceSlots.length && !used.has(index)) {
        allocationIndex = index
      }
      if (allocationIndex < 0 && sourceAllocations.length === 1 && sourceSlots.length === 1) {
        allocationIndex = 0
      }
      if (allocationIndex < 0) {
        return slot
      }
      used.add(allocationIndex)
      return ordersServiceSlotWithAllocation(slot, sourceAllocations[allocationIndex], resources, index)
    })
  }

  function ordersServiceSlotsHaveAssignedWorker(slots = []) {
    return Array.isArray(slots) && slots.some((slot) => String(slot?.type ?? '') === 'worker')
  }

  function ordersFillEmptyServiceSlotsFromOrderAssignments(slots = [], order = {}, resources = calendarTimelineResources()) {
    const normalizedSlots = Array.isArray(slots) ? slots : []
    if (!normalizedSlots.length || ordersServiceSlotsHaveAssignedWorker(normalizedSlots)) {
      return normalizedSlots
    }

    const assignmentRows = ordersStoredAssignmentRows(order, resources)
      .filter((row) => Number.isInteger(row) && ordersResourceCanBeAssigned(resources[row]))
    if (!assignmentRows.length) {
      return normalizedSlots
    }

    let cursor = 0
    return normalizedSlots.map((slot) => {
      const row = assignmentRows[cursor]
      if (!Number.isInteger(row)) {
        return slot
      }
      cursor += 1
      const assignment = ordersWorkerAssignmentsFromRows([row], resources)[0] ?? {}
      const workerLabel = assignment.name || ordersWorkerRowLabel(row, resources) || slot?.label || ''
      return {
        ...slot,
        row,
        type: 'worker',
        label: workerLabel,
        name: workerLabel,
        workerId: assignment.workerId || slot?.workerId || '',
        workerLogin: assignment.workerLogin || slot?.workerLogin || '',
        workerKey: assignment.key || slot?.workerKey || '',
      }
    })
  }

  function ordersServiceBlockSlots(block = {}, resources = calendarTimelineResources(), order = {}) {
    const directSlots = Array.isArray(block?.slots) ? block.slots : []
    const allocationSource = ordersServiceBlockAllocationSource(block, order)
    if (directSlots.length) {
      const slots = ordersServiceSlotsWithAllocations(directSlots, allocationSource, block, resources)
        .map((slot, index) => ordersNormalizeServiceSlot(slot, block, resources, index))
      return ordersFillEmptyServiceSlotsFromOrderAssignments(slots, order, resources)
    }

    if (allocationSource.length) {
      const slots = allocationSource.map((slot, index) => ordersNormalizeServiceSlot(slot, block, resources, index))
      return ordersFillEmptyServiceSlotsFromOrderAssignments(slots, order, resources)
    }

    const rows = ordersServiceBlockWorkerRows(block, resources, null)
    const requiredPeople = Math.max(1, Math.min(20, Math.floor(Number(block?.requiredPeople ?? block?.requiredWorkers ?? block?.workerSlots) || Number(order?.requiredPeople) || 1)))
    const totalMinutes = Math.max(15, Math.round(Number(block?.requiredWorkMinutes ?? block?.serviceWorkMinutes) || ordersServiceBlockDurationMinutes(block) * requiredPeople))
    const split = ordersSplitMinutesEvenly(totalMinutes, requiredPeople)
    const slots = Array.from({ length: requiredPeople }, (_, index) => {
      const row = rows[index]
      return ordersNormalizeServiceSlot(
        {
          id: `${ORDERS_SERVICE_SLOT_PREFIX}-${index + 1}`,
          row: Number.isInteger(row) ? row : ordersServiceBlockBufferRow(resources),
          type: Number.isInteger(row) ? 'worker' : 'unassigned',
          minutes: split[index] || ordersServiceBlockDurationMinutes(block),
          startTime: block.startTime,
          endTime: ordersAllocationEndTimeFromMinutes(block.startTime, split[index] || ordersServiceBlockDurationMinutes(block)),
        },
        block,
        resources,
        index,
      )
    })
    return ordersFillEmptyServiceSlotsFromOrderAssignments(slots, order, resources)
  }

  function ordersServiceBlockAllocations(block = {}, resources = calendarTimelineResources(), fallbackOrder = null) {
    // Overlay the canonical order allocations before rebuilding derived block data.
    // Stored service-block slots can still contain an older BUFOR assignment.
    const slots = ordersServiceBlockSlots(block, resources, fallbackOrder || {})
    return slots.map((slot, index) => {
      const hasWorker = String(slot?.type ?? '') === 'worker' && String(slot?.workerId ?? slot?.workerLogin ?? slot?.workerKey ?? '').trim()
      const row = hasWorker ? Number(slot.row) : ordersServiceBlockBufferRow(resources)
      const label = hasWorker ? slot.label || ordersWorkerRowLabel(row, resources) : slot.label || `Do obsadzenia ${index + 1}`
      const minutes = Math.max(0, Math.round(Number(slot.minutes) || 0))
      const dateYmd = ordersNormalizeDateField(slot.dateYmd ?? slot.planDateYmd ?? slot.startDateYmd ?? block.dateYmd, fallbackOrder?.dateYmd || todayYmd())
      const startTime = ordersNormalizeTimeField(slot.startTime, block.startTime)
      const endTime = ordersNormalizeTimeField(slot.endTime, block.endTime)
      const fallbackEndDateYmd = calendarTimelineTimeMinutes(endTime, 0) <= calendarTimelineTimeMinutes(startTime, 0)
        ? calendarAddDays(dateYmd, 1)
        : dateYmd
      const endDateYmd = ordersNormalizeDateField(slot.endDateYmd ?? slot.planEndDateYmd, fallbackEndDateYmd)
      return {
        key: `${ORDERS_SERVICE_SLOT_PREFIX}:${block.id || ordersServiceBlockId(block.kind, index)}:${slot.slotId || slot.id || index + 1}`,
        row: Number.isInteger(row) && row >= 0 ? row : ordersServiceBlockBufferRow(resources),
        index,
        slotId: String(slot.slotId ?? slot.id ?? `${ORDERS_SERVICE_SLOT_PREFIX}-${index + 1}`).trim(),
        teamId: String(block.id ?? '').trim(),
        serviceBlockId: block.id,
        serviceBlockKind: block.kind,
        serviceBlockLabel: block.label,
        type: hasWorker ? 'worker' : 'unassigned',
        label,
        name: label,
        workerId: hasWorker ? String(slot.workerId ?? '').trim() : '',
        workerLogin: hasWorker ? String(slot.workerLogin ?? '').trim() : '',
        workerKey: hasWorker ? String(slot.workerKey ?? '').trim() : '',
        minutes,
        dateYmd,
        planDateYmd: dateYmd,
        startDateYmd: dateYmd,
        endDateYmd,
        planEndDateYmd: endDateYmd,
        startTime,
        endTime,
        planStartTime: startTime,
        planEndTime: endTime,
      }
    }).filter((allocation) => allocation.minutes > 0)
  }

  function ordersNormalizeServiceBlock(block = {}, order = {}, index = 0) {
    const resources = calendarTimelineResources()
    const rawKind = String(block?.kind ?? '').trim()
    const kind = ordersServiceBlockKindIsValid(rawKind) ? rawKind : (index === 0 ? 'main' : `${ORDERS_SERVICE_TEAM_KIND_PREFIX}-${index + 1}`)
    const id = String(block?.id ?? ordersServiceBlockId(kind, index)).trim() || ordersServiceBlockId(kind, index)
    const scheduleMode = String(block?.scheduleMode ?? block?.mode ?? ordersScheduleModeForOrder(order)).trim() === 'once' ? 'once' : 'repeat'
    const dateYmd = ordersNormalizeDateField(block?.dateYmd ?? block?.planDateYmd ?? block?.startDateYmd ?? block?.date, order.dateYmd || todayYmd())
    const label = String(block?.label ?? '').trim() || ordersServiceBlockKindLabel(kind, index)
    const weekdaysSource = Array.isArray(block?.weekdays) && block.weekdays.length
      ? block.weekdays
      : scheduleMode === 'repeat'
        ? ordersDefaultServiceBlockWeekdays(order)
        : [ordersWeekdayFromDateKey(dateYmd)]
    const weekdays = weekdaysSource
      .map(ordersNormalizeWeekday)
      .filter((weekday, itemIndex, list) => weekday !== null && list.indexOf(weekday) === itemIndex)
    const startTime = ordersNormalizeTimeField(block?.startTime ?? block?.accessStartTime, order.startTime || '08:00')
    const endTime = ordersNormalizeTimeField(block?.endTime ?? block?.accessEndTime, order.endTime || ordersDefaultEndTime(startTime))
    const blockBase = { ...block, id, kind, label, startTime, endTime, scheduleMode, dateYmd }
    const slots = ordersServiceBlockSlots(blockBase, resources, order, index)
    const workerRows = slots
      .filter((slot) => slot.type === 'worker')
      .map((slot) => Number(slot.row))
      .filter((row, rowIndex, list) => Number.isInteger(row) && row >= 0 && !calendarTimelineRowAllowsOverlap(row, resources) && list.indexOf(row) === rowIndex)
    const requiredPeople = Math.max(1, Math.min(20, slots.length || Math.floor(Number(block?.requiredPeople ?? block?.requiredWorkers ?? block?.workerSlots) || Number(order.requiredPeople) || 1)))
    const normalized = {
      id,
      kind,
      sortIndex: ordersServiceBlockSortIndex({ ...block, sortIndex: block?.sortIndex ?? index }),
      label,
      scheduleMode,
      dateYmd,
      planDateYmd: dateYmd,
      startDateYmd: dateYmd,
      description: String(block?.description ?? block?.note ?? block?.comment ?? '').trim(),
      weekdays,
      startTime,
      endTime,
      accessStartTime: startTime,
      accessEndTime: endTime,
      requiredPeople,
      requiredWorkers: requiredPeople,
      workerSlots: requiredPeople,
      assignedRows: workerRows,
      workerAssignments: workerRows.length ? ordersWorkerAssignmentsFromRows(workerRows) : [],
      slots,
    }
    normalized.bufferSlots = Math.max(0, requiredPeople - workerRows.length)
    normalized.requiredWorkMinutes = slots.reduce((sum, slot) => sum + Math.max(0, Number(slot.minutes) || 0), 0)
    normalized.serviceWorkMinutes = normalized.requiredWorkMinutes
    normalized.workAllocations = ordersServiceBlockAllocations(normalized, resources, order)
    normalized.workerAllocations = normalized.workAllocations
    return normalized
  }

  function ordersServiceBlocksForOrder(order = {}) {
    const mode = ordersScheduleModeForOrder(order)
    const legacyWeekdays = ordersRepeatWeekdaysFromOrder(order)
    const legacyRules = ordersWeeklyPatternRulesForWeekdays(order, legacyWeekdays)
    const firstLegacyRule = legacyRules[0] || null
    const source = Array.isArray(order?.serviceBlocks) && order.serviceBlocks.length
      ? order.serviceBlocks
      : [
          {
            id: ordersServiceBlockId('main', 0),
            kind: 'main',
            label: mode === 'repeat' ? ORDERS_SERVICE_BLOCK_LABELS.main : 'Pierwsza zmiana',
            scheduleMode: mode,
            dateYmd: order.dateYmd || todayYmd(),
            description: order.workerComment || order.description || '',
            weekdays: mode === 'repeat' ? (legacyRules.length ? legacyRules.map((rule) => rule.weekday) : legacyWeekdays) : [ordersWeekdayFromDateKey(order.dateYmd)],
            startTime: firstLegacyRule?.startTime || order.startTime || '08:00',
            endTime: firstLegacyRule?.endTime || order.endTime || ordersDefaultEndTime(order.startTime || '08:00'),
            requiredPeople: firstLegacyRule?.requiredPeople || order.requiredPeople || order.requiredWorkers || order.workerSlots || 1,
            requiredWorkMinutes: order.requiredWorkMinutes || order.serviceWorkMinutes || null,
            slots: Array.isArray(order?.slots) ? order.slots : [],
            workAllocations: Array.isArray(order?.workAllocations) ? order.workAllocations : [],
            assignedRows: ordersNormalizeOrderRows(order).filter((row) => !calendarTimelineRowAllowsOverlap(row)),
            workerAssignments: ordersStoredWorkerAssignments(order),
          },
        ]
    return source
      .map((block, index) => ordersNormalizeServiceBlock(block, order, index))
      .filter((block) => ordersServiceBlockKindIsValid(block.kind))
      .sort((left, right) => ordersServiceBlockSortIndex(left) - ordersServiceBlockSortIndex(right))
  }

  function ordersStoreServiceBlocks(order = {}, blocks = []) {
    const normalizationOrder = { ...order, workAllocations: [], workerAllocations: [] }
    const safe = (Array.isArray(blocks) ? blocks : [])
      .map((block, index) => ordersNormalizeServiceBlock({ ...block, sortIndex: index, orderIndex: index }, normalizationOrder, index))
      .filter((block) => ordersServiceBlockKindIsValid(block.kind))
    const hasMain = safe.some((block) => block.kind === 'main')
    const finalBlocks = (hasMain ? safe : [ordersNormalizeServiceBlock({ kind: 'main', label: 'Pierwsza zmiana' }, normalizationOrder, 0), ...safe])
      .sort((left, right) => ordersServiceBlockSortIndex(left) - ordersServiceBlockSortIndex(right))
      .map((block, index) => ({ ...block, sortIndex: index, orderIndex: index }))
    const allAllocations = finalBlocks.flatMap((block) => Array.isArray(block.workAllocations) ? block.workAllocations : [])
    const totalWorkMinutes = finalBlocks.reduce((sum, block) => sum + Math.max(0, Number(block.requiredWorkMinutes) || 0), 0)
    const totalPeople = finalBlocks.reduce((sum, block) => sum + Math.max(0, Number(block.requiredPeople) || 0), 0)
    const assignedRows = finalBlocks
      .flatMap((block) => block.assignedRows || [])
      .filter((row, index, list) => Number.isInteger(Number(row)) && list.indexOf(row) === index)
      .map((row) => Number(row))
    const mode = ordersScheduleModeForOrder(order)
    order.serviceModelVersion = ORDERS_SERVICE_MODEL_VERSION
    order.serviceBlocks = finalBlocks
    if (mode === 'repeat') {
      order.repeatUnit = 'week'
      order.repeatPreset = Math.max(1, Number(order.repeatEvery) || 1) === 1 ? 'week' : 'interval'
    }
    order.repeatWeekdays = finalBlocks
      .flatMap((block) => block.weekdays)
      .filter((weekday, index, list) => Number.isInteger(weekday) && list.indexOf(weekday) === index)
    const firstBlock = finalBlocks.find((block) => block.weekdays.length) || finalBlocks[0]
    if (firstBlock) {
      order.startTime = firstBlock.startTime
      order.endTime = firstBlock.endTime
      order.accessStartTime = firstBlock.startTime
      order.accessEndTime = firstBlock.endTime
      order.requiredPeople = Math.max(1, totalPeople || firstBlock.requiredPeople)
      order.requiredWorkers = order.requiredPeople
      order.workerSlots = order.requiredPeople
      order.requiredWorkMinutes = Math.max(15, totalWorkMinutes || firstBlock.requiredWorkMinutes)
      order.serviceWorkMinutes = order.requiredWorkMinutes
      order.standardWorkMinutes = order.requiredWorkMinutes
      order.assignedRows = assignedRows
      order.workerAssignments = assignedRows.length ? ordersWorkerAssignmentsFromRows(assignedRows) : []
      order.workAllocations = allAllocations
      order.workerAllocations = allAllocations
    }
    return finalBlocks
  }

  function ordersServiceBlocksTotals(blocks = [], fallbackOrder = {}) {
    const safeBlocks = Array.isArray(blocks) ? blocks : []
    const totalWorkMinutes = safeBlocks.reduce((sum, block) => {
      const slots = Array.isArray(block?.slots) ? block.slots : []
      const slotMinutes = slots.reduce((slotSum, slot) => slotSum + Math.max(0, Number(slot?.minutes) || 0), 0)
      return sum + Math.max(0, Number(block?.requiredWorkMinutes) || slotMinutes || 0)
    }, 0)
    const totalPeople = safeBlocks.reduce((sum, block) => {
      const slots = Array.isArray(block?.slots) ? block.slots : []
      return sum + Math.max(
        0,
        slots.length ||
          Math.floor(Number(block?.requiredPeople ?? block?.requiredWorkers ?? block?.workerSlots) || 0),
      )
    }, 0)
    return {
      totalWorkMinutes: Math.max(
        0,
        totalWorkMinutes || Number(fallbackOrder.requiredWorkMinutes ?? fallbackOrder.serviceWorkMinutes ?? 0) || 0,
      ),
      totalPeople: Math.max(
        1,
        totalPeople ||
          Math.floor(Number(fallbackOrder.requiredPeople ?? fallbackOrder.requiredWorkers ?? fallbackOrder.workerSlots) || 1),
      ),
    }
  }

  function ordersServiceBlocksWorkerSummary(blocks = []) {
    const resources = calendarTimelineResources()
    const names = []
    let bufferSlots = 0
    ;(Array.isArray(blocks) ? blocks : []).forEach((block) => {
      ;(Array.isArray(block?.slots) ? block.slots : []).forEach((slot) => {
        const row = Number(slot?.row)
        const isWorker = String(slot?.type ?? '') === 'worker' && Number.isInteger(row) && row >= 0 && !calendarTimelineRowAllowsOverlap(row, resources)
        if (!isWorker) {
          bufferSlots += 1
          return
        }
        const label = ordersWorkerRowLabel(row, resources) || String(slot?.name ?? slot?.label ?? '').trim()
        const key = normalizeSearchText(label)
        if (label && !names.some((item) => normalizeSearchText(item) === key)) {
          names.push(label)
        }
      })
    })
    if (names.length && bufferSlots) {
      return `${names.join(', ')} + BUFOR`
    }
    return names.length ? names.join(', ') : 'BUFOR'
  }

  function ordersRepeatWeekdaysFromServiceBlocks(order = {}) {
    const controlBlocks = ordersReadServiceBlocksFromControls(order)
    const blocks = controlBlocks.length ? controlBlocks : ordersServiceBlocksForOrder(order)
    const weekdays = (Array.isArray(blocks) ? blocks : [])
      .flatMap((block) => Array.isArray(block?.weekdays) ? block.weekdays : [])
      .map(ordersNormalizeWeekday)
      .filter((weekday, index, list) => weekday !== null && list.indexOf(weekday) === index)
    return weekdays.length ? weekdays : ordersRepeatWeekdaysFromOrder(order)
  }

  function ordersEditorControlOrderId(order = {}) {
    return String(order?.id ?? order?.sourceOrderId ?? order?.orderId ?? appState.ordersEditingId ?? '').trim()
  }

  function ordersEditorPanelIsVisible() {
    const panel = document.getElementById('ordersEditorPanel')
    if (!(panel instanceof HTMLElement) || panel.hidden) {
      return false
    }
    const rect = panel.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  function ordersEditorControlsBelongToOrder(order = {}) {
    if (!ordersEditorPanelIsVisible()) {
      return false
    }
    const rows = document.getElementById('ordersWorkAllocationRows')
    if (!(rows instanceof HTMLElement)) {
      return false
    }
    const currentOrderId = ordersEditorControlOrderId(order)
    const controlsOrderId = String(rows.getAttribute('data-orders-editor-order-id') ?? '').trim()
    return Boolean(currentOrderId && controlsOrderId && currentOrderId === controlsOrderId)
  }

  function ordersReadServiceBlocksFromControls(order = {}) {
    const cards = [...document.querySelectorAll('#ordersWorkAllocationRows [data-orders-service-block]')]
    if (!cards.length) {
      return []
    }
    if (!ordersEditorControlsBelongToOrder(order)) {
      return []
    }
    const controlOrder = { ...order, workAllocations: [], workerAllocations: [] }
    return cards
      .map((card, index) => {
        const kind = String(card.getAttribute('data-orders-service-block') ?? '').trim()
        const blockId = String(card.getAttribute('data-orders-service-block-id') ?? '').trim() || ordersServiceBlockId(kind, index)
        const labelInput = card.querySelector('[data-orders-service-label]')
        const modeInput = card.querySelector('[data-orders-service-mode]')
        const dateInput = card.querySelector('[data-orders-service-date]')
        const start = card.querySelector('[data-orders-service-start]')
        const end = card.querySelector('[data-orders-service-end]')
        const description = card.querySelector('[data-orders-service-description]')
        const nextStartTime = start instanceof HTMLInputElement ? start.value : ''
        const nextEndTime = end instanceof HTMLInputElement ? end.value : ''
        const nextBlockDuration = ordersServiceBlockDurationMinutes({ startTime: nextStartTime, endTime: nextEndTime })
        const parentMode = ordersScheduleModeForOrder(order)
        const scheduleMode = parentMode === 'repeat' && modeInput instanceof HTMLSelectElement ? modeInput.value : parentMode
        const dateYmd = ordersNormalizeDateField(dateInput instanceof HTMLInputElement ? dateInput.value : '', order.dateYmd || todayYmd())
        const weekdays = [...card.querySelectorAll('[data-orders-service-weekday]:checked')]
          .map((input) => ordersNormalizeWeekday(input.getAttribute('data-orders-service-weekday')))
          .filter((weekday, itemIndex, list) => weekday !== null && list.indexOf(weekday) === itemIndex)
        const slots = [...card.querySelectorAll('[data-orders-service-slot]')]
          .map((slotNode, slotIndex) => {
            const slotId = String(slotNode.getAttribute('data-orders-service-slot') ?? '').trim() || `${ORDERS_SERVICE_SLOT_PREFIX}-${slotIndex + 1}`
            const slotLabel = slotNode.querySelector('[data-orders-service-slot-label]')
            const slotHours = slotNode.querySelector('[data-orders-service-slot-hours]')
            const slotWorker = slotNode.querySelector('[data-orders-service-slot-worker]')
            const workerRow = slotWorker instanceof HTMLSelectElement && slotWorker.value !== '' ? Number(slotWorker.value) : null
            const labelValue = slotLabel instanceof HTMLSelectElement ? String(slotLabel.value ?? '').trim() : ''
            const labelRow = labelValue.startsWith('row:') ? Number(labelValue.slice(4)) : null
            const row = Number.isInteger(workerRow) ? workerRow : Number.isInteger(labelRow) ? labelRow : null
            const rawMinutes = Math.max(0, Math.round((Number(slotHours instanceof HTMLInputElement ? slotHours.value : 0) || 0) * 60))
            const previousDefaultMinutes = Number(slotHours instanceof HTMLInputElement ? slotHours.getAttribute('data-orders-service-slot-default-minutes') : 0)
            const minutes = Number.isFinite(previousDefaultMinutes) && previousDefaultMinutes > 0 && rawMinutes === previousDefaultMinutes
              ? nextBlockDuration
              : rawMinutes
            const assignment = Number.isInteger(row) ? ordersWorkerAssignmentsFromRows([row])[0] ?? {} : {}
            return {
              id: slotId,
              slotId,
              label: ordersReadServiceSlotLabel(slotLabel, slotIndex),
              row: Number.isInteger(row) ? row : ordersServiceBlockBufferRow(),
              type: Number.isInteger(row) ? 'worker' : 'unassigned',
              workerId: Number.isInteger(row) ? assignment.workerId || '' : '',
              workerLogin: Number.isInteger(row) ? assignment.workerLogin || '' : '',
              workerKey: Number.isInteger(row) ? assignment.key || '' : '',
              minutes,
            }
          })
          .filter(Boolean)
        return ordersNormalizeServiceBlock(
          {
            id: blockId,
            kind,
            sortIndex: index,
            label: labelInput instanceof HTMLInputElement ? labelInput.value : ordersServiceBlockKindLabel(kind, index),
            scheduleMode,
            description: description instanceof HTMLTextAreaElement ? description.value : '',
            weekdays,
            dateYmd,
            startTime: nextStartTime,
            endTime: nextEndTime,
            requiredPeople: slots.length || 1,
            slots,
          },
          controlOrder,
          index,
        )
      })
      .filter(Boolean)
  }

  function ordersSyncServiceBlockDraftFromControls(order = ordersFindTimelineOrder(appState.ordersEditingId) || {}) {
    if (!order || typeof order !== 'object') {
      return []
    }
    const blocks = ordersReadServiceBlocksFromControls(order)
    if (blocks.length) {
      ordersStoreServiceBlocks(order, blocks)
    }
    return blocks
  }

  function ordersClearQueuedEditorSummaryRefresh() {
    if (ordersEditorSummaryRefreshTimer) {
      window.clearTimeout(ordersEditorSummaryRefreshTimer)
      ordersEditorSummaryRefreshTimer = 0
    }
  }

  function ordersRefreshEditorSummaryFromDraft(order = ordersFindTimelineOrder(appState.ordersEditingId) || {}) {
    ordersClearQueuedEditorSummaryRefresh()
    if (!order || typeof order !== 'object') {
      return
    }
    ordersSyncServiceBlockDraftFromControls(order)
    ordersRenderSchedulePreview(order)
    ordersRenderEditorWizard(order)
  }

  function ordersQueueEditorSummaryRefresh(order = ordersFindTimelineOrder(appState.ordersEditingId) || {}) {
    if (!order || typeof order !== 'object') {
      return
    }
    ordersClearQueuedEditorSummaryRefresh()
    ordersEditorSummaryRefreshTimer = window.setTimeout(() => {
      ordersEditorSummaryRefreshTimer = 0
      if (appState.ordersEditingId && document.getElementById('ordersEditorPanel')) {
        ordersRefreshEditorSummaryFromDraft(order)
      }
    }, 220)
  }

  function ordersClearQueuedEditorWizardRefresh() {
    if (ordersEditorWizardRefreshTimer) {
      window.clearTimeout(ordersEditorWizardRefreshTimer)
      ordersEditorWizardRefreshTimer = 0
    }
  }

  function ordersQueueEditorWizardRefresh(order = ordersFindTimelineOrder(appState.ordersEditingId) || {}) {
    if (!order || typeof order !== 'object') {
      return
    }
    ordersClearQueuedEditorWizardRefresh()
    ordersEditorWizardRefreshTimer = window.setTimeout(() => {
      ordersEditorWizardRefreshTimer = 0
      if (appState.ordersEditingId && document.getElementById('ordersEditorPanel')) {
        ordersRenderEditorWizard(order)
      }
    }, 180)
  }

  function ordersServiceBlockWeekdaysHtml(block = {}) {
    const selected = new Set((Array.isArray(block.weekdays) ? block.weekdays : []).map((weekday) => Number(weekday)))
    const shortLabels = { 0: 'Nd', 1: 'Pn', 2: 'Wt', 3: 'Śr', 4: 'Cz', 5: 'Pt', 6: 'So' }
    return ORDERS_ALL_REPEAT_WEEKDAYS.map((weekday) => {
      const checked = selected.has(weekday)
      return `
        <label class="orders-service-weekday" title="${escapeHtml(ordersWeekdayLabel(weekday))}">
          <input type="checkbox" data-orders-service-weekday="${weekday}"${checked ? ' checked' : ''} />
          <span>${escapeHtml(shortLabels[weekday] || ordersWeekdayLabel(weekday).slice(0, 2))}</span>
        </label>
      `
    }).join('')
  }

  function ordersAssignableWorkerResourceOptions(resources = calendarTimelineResources()) {
    const sourceResources = Array.isArray(resources) ? resources : []
    return sourceResources
      .map((resource, row) => ({
        resource,
        row,
        label: String(resource?.name || `Pracownik ${row + 1}`).trim(),
      }))
      .filter(({ resource, row }) => resource?.type === 'worker' && !calendarTimelineRowAllowsOverlap(row, sourceResources))
      .sort((left, right) =>
        left.label.localeCompare(right.label, 'pl', { sensitivity: 'base', numeric: true }) || left.row - right.row,
      )
  }

  function ordersServiceSlotWorkerOptionsHtml(slot = {}, resources = calendarTimelineResources(), unavailableRows = new Set()) {
    const selectedRow = slot?.type === 'worker' ? Number(slot.row) : null
    return [
      `<option value=""${Number.isInteger(selectedRow) ? '' : ' selected'}>Do obsadzenia</option>`,
      ...ordersAssignableWorkerResourceOptions(resources).map(({ row, label }) => {
        const disabled = unavailableRows.has(row) && selectedRow !== row
        const optionLabel = `${label}${disabled ? ' - ju\u017c wybrany' : ''}`
        return `<option value="${row}"${selectedRow === row ? ' selected' : ''}${disabled ? ' disabled' : ''}>${escapeHtml(optionLabel)}</option>`
      }),
    ].join('')
  }

  function ordersServiceSlotPersonOptionsHtml(slot = {}, resources = calendarTimelineResources(), unavailableRows = new Set()) {
    const selectedRow = slot?.type === 'worker' ? Number(slot.row) : null
    const currentLabel = String(slot?.label ?? '').trim()
    const selectedValue = Number.isInteger(selectedRow) ? `row:${selectedRow}` : 'buffer'
    const workerLabels = new Set()
    const workerOptions = ordersAssignableWorkerResourceOptions(resources)
      .map(({ row, label }) => {
        workerLabels.add(normalizeSearchText(label))
        const disabled = unavailableRows.has(row) && selectedRow !== row
        return `<option value="row:${row}"${selectedValue === `row:${row}` ? ' selected' : ''}${disabled ? ' disabled' : ''}>${escapeHtml(label)}${disabled ? ' - ju\u017c wybrany' : ''}</option>`
      })
    const isCustomLabel =
      currentLabel &&
      normalizeSearchText(currentLabel) !== normalizeSearchText('BUFOR') &&
      !workerLabels.has(normalizeSearchText(currentLabel)) &&
      !/^osoba\s+\d+/i.test(currentLabel)
    return [
      `<option value="buffer"${selectedValue === 'buffer' && !isCustomLabel ? ' selected' : ''}>BUFOR</option>`,
      ...workerOptions,
      isCustomLabel ? `<option value="custom"${selectedValue === 'buffer' ? ' selected' : ''}>${escapeHtml(currentLabel)}</option>` : '',
    ].join('')
  }

  function ordersReadServiceSlotLabel(labelControl, slotIndex = 0) {
    if (labelControl instanceof HTMLSelectElement) {
      const value = String(labelControl.value ?? '').trim()
      if (value === 'buffer' || value === '') {
        return 'BUFOR'
      }
      const selectedText = String(labelControl.selectedOptions?.[0]?.textContent ?? '')
        .replace(/\s+-\s+już wybrany\s*$/i, '')
        .trim()
      return selectedText || `Osoba ${slotIndex + 1}`
    }
    if (labelControl instanceof HTMLInputElement) {
      return labelControl.value
    }
    return `Osoba ${slotIndex + 1}`
  }

  function ordersApplyServiceSlotPersonSelection(select) {
    if (!(select instanceof HTMLSelectElement) || !select.hasAttribute('data-orders-service-slot-label')) {
      return false
    }
    const slotNode = select.closest('[data-orders-service-slot]')
    const workerSelect = slotNode?.querySelector('[data-orders-service-slot-worker]')
    if (!(workerSelect instanceof HTMLSelectElement)) {
      return false
    }
    const value = String(select.value ?? '').trim()
    workerSelect.value = value.startsWith('row:') ? value.slice(4) : ''
    return true
  }

  function ordersSyncServiceSlotPersonLabelFromWorker(select) {
    if (!(select instanceof HTMLSelectElement) || !select.hasAttribute('data-orders-service-slot-worker')) {
      return false
    }
    const slotNode = select.closest('[data-orders-service-slot]')
    const labelSelect = slotNode?.querySelector('[data-orders-service-slot-label]')
    if (!(labelSelect instanceof HTMLSelectElement)) {
      return false
    }
    const nextValue = select.value === '' ? 'buffer' : `row:${select.value}`
    if ([...labelSelect.options].some((option) => option.value === nextValue)) {
      labelSelect.value = nextValue
      return true
    }
    return false
  }

  function ordersRejectDuplicateServiceSlotWorker(select) {
    if (!(select instanceof HTMLSelectElement) || select.value === '') {
      return false
    }
    const row = Number(select.value)
    if (!Number.isInteger(row) || row < 0) {
      return false
    }
    const blockNode = select.closest('[data-orders-service-block]')
    if (!blockNode) {
      return false
    }
    const duplicated = [...blockNode.querySelectorAll('[data-orders-service-slot-worker]')]
      .some((workerSelect) => workerSelect !== select && Number(workerSelect.value) === row)
    if (!duplicated) {
      return false
    }
    const resource = calendarTimelineResources()[row]
    select.value = ''
    ordersSyncServiceSlotPersonLabelFromWorker(select)
    showTransientNotice(`${resource?.name || 'Ten pracownik'} jest już przypisany w tej zmianie. Wybierz inną osobę.`, 'error')
    return true
  }

  function ordersServiceBlockTone(index = 0) {
    const tones = ['new', 'active', 'review', 'done', 'neutral']
    return tones[Math.max(0, Number(index) || 0) % tones.length]
  }

  function ordersWorkerInitials(label = '') {
    const parts = String(label ?? '').trim().split(/\s+/).filter(Boolean)
    if (!parts.length) return '?'
    return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('')
  }

  function ordersServiceSlotCountLabel(count = 0) {
    const value = Math.max(0, Number(count) || 0)
    if (value === 1) return '1 osoba'
    if (value >= 2 && value <= 4) return `${value} osoby`
    return `${value} osób`
  }

  function ordersServicePeopleLabel(count = 0) {
    return ordersServiceSlotCountLabel(count)
  }

  function ordersServiceBlockSlotsHtml(block = {}, resources = calendarTimelineResources()) {
    const slots = Array.isArray(block.slots) && block.slots.length ? block.slots : ordersServiceBlockSlots(block, resources)
    const blockDuration = ordersServiceBlockDurationMinutes(block)
    return slots.map((slot, index) => {
      const unavailableRows = new Set(
        slots
          .map((candidate, candidateIndex) => candidateIndex !== index && candidate?.type === 'worker' ? Number(candidate.row) : null)
          .filter((row) => Number.isInteger(row) && row >= 0),
      )
      const occupied = slot.type === 'worker'
      const selectedResource = occupied ? resources.find((resource, row) => row === Number(slot.row) && resource?.type === 'worker') : null
      const workerLabel = selectedResource?.name || slot.name || slot.workerName || ''
      const slotKey = slot.slotId || slot.id || `${ORDERS_SERVICE_SLOT_PREFIX}-${index + 1}`
      const peopleCount = slots.length
      const slotMinutes = Math.max(15, Math.round(Number(slot.minutes ?? blockDuration) || blockDuration))
      const statusLabel = occupied ? 'Obsadzone' : `Osoba ${index + 1} z ${peopleCount}`
      const summaryLabel = occupied ? workerLabel || 'Przypisany pracownik' : 'BUFOR'
      const summaryMeta = occupied ? 'Przypisany pracownik' : 'Oczekuje na przypisanie'
      return `
        <article class="orders-team-slot-card orders-kanban-slot-card${occupied ? ' is-filled' : ' is-empty'}" data-orders-service-slot="${escapeHtml(slotKey)}">
          <div class="orders-kanban-slot-top">
            <div class="orders-kanban-slot-title">
              <span class="orders-kanban-slot-badge">${escapeHtml(statusLabel)}</span>
              <span class="orders-kanban-slot-hours-pill">${escapeHtml(ordersHoursInputValue(slotMinutes))} rbh</span>
            </div>
            <span class="orders-kanban-slot-check${occupied ? ' is-assigned' : ' is-open'}" aria-hidden="true">${occupied ? '&#10003;' : '&#9675;'}</span>
          </div>
          <label class="orders-field orders-kanban-slot-name">
            <span>Osoba / rola</span>
            <select data-orders-service-slot-label>${ordersServiceSlotPersonOptionsHtml(slot, resources, unavailableRows)}</select>
          </label>
          <div class="orders-kanban-slot-controls">
            <label class="orders-field">
              <span>RBH</span>
              <input type="number" min="0.25" step="0.25" value="${escapeHtml(ordersHoursInputValue(slotMinutes))}" data-orders-service-slot-hours data-orders-service-slot-default-minutes="${escapeHtml(String(blockDuration))}" />
            </label>
            <label class="orders-field">
              <span>Pracownik (opcjonalnie)</span>
              <select data-orders-service-slot-worker>${ordersServiceSlotWorkerOptionsHtml(slot, resources, unavailableRows)}</select>
            </label>
          </div>
          <div class="orders-kanban-slot-foot">
            <div class="orders-kanban-slot-status">
              <span class="orders-kanban-slot-avatar" title="${escapeHtml(workerLabel || 'Nieobsadzone')}">${escapeHtml(occupied ? ordersWorkerInitials(workerLabel) : 'BUF')}</span>
              <span class="orders-kanban-slot-summary">
                <strong>${escapeHtml(summaryLabel)}</strong>
                <small>${escapeHtml(summaryMeta)}</small>
              </span>
            </div>
            <button type="button" class="orders-team-slot-remove" data-orders-service-slot-remove="${escapeHtml(slotKey)}" ${slots.length <= 1 ? 'disabled' : ''}>Usuń</button>
          </div>
        </article>
      `
    }).join('')
  }

  function ordersServiceBlockCardHtml(block = {}, resources = calendarTimelineResources(), index = 0, count = 1, orderMode = 'repeat') {
    const shiftDuration = ordersServiceBlockDurationMinutes(block)
    const shiftDurationHours = ordersHoursInputValue(shiftDuration)
    const blockDateYmd = ordersNormalizeDateField(block.dateYmd ?? block.planDateYmd ?? block.startDateYmd, todayYmd())
    const parentIsRepeat = String(orderMode ?? '').trim() === 'repeat'
    const isRepeat = parentIsRepeat && block.scheduleMode !== 'once'
    const slots = Array.isArray(block.slots) && block.slots.length ? block.slots : ordersServiceBlockSlots(block, resources)
    const emptySlots = slots.filter((slot) => slot.type !== 'worker').length
    const tone = ordersServiceBlockTone(index)
    const slotCountLabel = ordersServiceSlotCountLabel(slots.length)
    const assignedSlots = Math.max(0, slots.length - emptySlots)
    const peopleLabel = ordersServicePeopleLabel(slots.length)
    const assignedPeopleLabel = ordersServicePeopleLabel(assignedSlots)
    const bufferPeopleLabel = ordersServicePeopleLabel(emptySlots)
    return `
      <article class="orders-service-block-card orders-team-card orders-kanban-column is-${escapeHtml(tone)}" data-orders-service-block="${escapeHtml(block.kind)}" data-orders-service-block-id="${escapeHtml(block.id)}">
        <div class="orders-kanban-column-head">
          <div class="orders-kanban-column-title">
            <span class="orders-kanban-column-dot" aria-hidden="true"></span>
            <input type="text" value="${escapeHtml(block.label)}" data-orders-service-label aria-label="Nazwa zmiany" placeholder="Nazwa zmiany" />
          </div>
          <span class="orders-kanban-column-count" title="${escapeHtml(slotCountLabel)}">${escapeHtml(String(slots.length))} os.</span>
          <span class="orders-kanban-column-drag" role="button" tabindex="0" draggable="true" data-orders-service-drag-handle="${escapeHtml(block.kind)}" aria-label="Przeciągnij zmianę" title="Przeciągnij, aby zmienić kolejność">&#8596;</span>
          <button type="button" class="orders-kanban-column-menu" data-orders-service-remove="${escapeHtml(block.kind)}" ${count <= 1 || block.kind === 'main' ? 'disabled' : ''} aria-label="Usuń zmianę">&#8942;</button>
        </div>
        <div class="orders-kanban-column-meta orders-shift-form">
          <label class="orders-field orders-shift-mode">
            <span>Tryb</span>
            <select data-orders-service-mode>
              <option value="once"${block.scheduleMode === 'once' ? ' selected' : ''}>Jednorazowo</option>
              <option value="repeat"${block.scheduleMode === 'once' ? '' : ' selected'}>Cyklicznie co tydzień</option>
            </select>
          </label>
          <div class="orders-kanban-time-grid orders-shift-time-grid${isRepeat ? ' is-repeat' : ' is-once'}">
            <label class="orders-field">
              <span>START</span>
              <input type="time" value="${escapeHtml(block.startTime)}" data-orders-service-start />
            </label>
            <label class="orders-field">
              <span>STOP</span>
              <input type="time" value="${escapeHtml(block.endTime)}" data-orders-service-end />
            </label>
            <div class="orders-kanban-duration-badge">
              <span>Czas zmiany</span>
              <strong>${escapeHtml(shiftDurationHours)} rbh</strong>
            </div>
            ${isRepeat ? '' : `
              <label class="orders-field orders-team-once-date">
                <span>Data zmiany</span>
                <input type="date" value="${escapeHtml(blockDateYmd)}" data-orders-service-date />
              </label>
            `}
          </div>
        </div>
        ${isRepeat ? `
          <div class="orders-service-weekdays-wrap">
            <span class="orders-shift-section-label">Dni pracy</span>
            <div class="orders-service-weekdays">${ordersServiceBlockWeekdaysHtml(block)}</div>
          </div>
        ` : ''}
        <div class="orders-kanban-people-summary">
          <strong>Potrzeba ${escapeHtml(peopleLabel)}</strong>
          <span>${escapeHtml(assignedPeopleLabel)} obsadzone · ${escapeHtml(bufferPeopleLabel)} do BUFORU</span>
        </div>
        <label class="orders-field orders-service-description">
          <span>Instrukcja dla pracownika</span>
          <textarea data-orders-service-description placeholder="Np. Wejście od zaplecza, sprzątanie sali i sanitariatów...">${escapeHtml(block.description)}</textarea>
        </label>
        <div class="orders-team-slots-grid orders-kanban-cards">${ordersServiceBlockSlotsHtml({ ...block, slots }, resources)}</div>
        <button type="button" class="orders-kanban-add-card" data-orders-service-slot-add="${escapeHtml(block.kind)}">+ Dodaj osobę</button>
      </article>
    `
  }

  function ordersSyncServiceBlocksStickyScroll(root = document) {
    const scope = root && typeof root.querySelector === 'function' ? root : document
    const list = scope.querySelector?.('[data-orders-service-blocks-list]') || document.querySelector('[data-orders-service-blocks-list]')
    const bar = scope.querySelector?.('[data-orders-service-blocks-scroll]') || document.getElementById('ordersServiceBlocksStickyScroll')
    const spacer = bar?.querySelector?.('[data-orders-service-blocks-scroll-spacer]')
    if (!(list instanceof HTMLElement) || !(bar instanceof HTMLElement) || !(spacer instanceof HTMLElement)) {
      return
    }
    if (typeof ordersServiceBlocksScrollCleanup === 'function') {
      ordersServiceBlocksScrollCleanup()
      ordersServiceBlocksScrollCleanup = null
    }
    const update = () => {
      const width = Math.max(Number(list.scrollWidth || 0), Number(list.clientWidth || 0))
      bar.hidden = width <= Number(list.clientWidth || 0) + 2
      spacer.style.width = `${Math.ceil(width)}px`
      bar.classList.toggle('is-scrollable', !bar.hidden)
    }
    let syncing = false
    const syncBarFromList = () => {
      if (syncing) return
      syncing = true
      bar.scrollLeft = list.scrollLeft
      syncing = false
      update()
    }
    const syncListFromBar = () => {
      if (syncing) return
      syncing = true
      list.scrollLeft = bar.scrollLeft
      syncing = false
    }
    list.addEventListener('scroll', syncBarFromList, { passive: true })
    bar.addEventListener('scroll', syncListFromBar, { passive: true })
    window.addEventListener('resize', update, { passive: true })
    ordersServiceBlocksScrollCleanup = () => {
      list.removeEventListener('scroll', syncBarFromList)
      bar.removeEventListener('scroll', syncListFromBar)
      window.removeEventListener('resize', update)
    }
    update()
    window.requestAnimationFrame(update)
  }

  function ordersRenderServiceBlockControls(order = {}, { preferStored = false } = {}) {
    const rows = document.getElementById('ordersWorkAllocationRows')
    const summary = document.getElementById('ordersWorkAllocationSummary')
    if (!rows) {
      return
    }
    const controlBlocks = preferStored ? [] : ordersReadServiceBlocksFromControls(order)
    const blocks = ordersStoreServiceBlocks(order, controlBlocks.length ? controlBlocks : ordersServiceBlocksForOrder(order))
    if (typeof ordersServiceBlocksScrollCleanup === 'function') {
      ordersServiceBlocksScrollCleanup()
      ordersServiceBlocksScrollCleanup = null
    }
    document.getElementById('ordersServiceBlocksStickyScroll')?.remove()
    const controlOrderId = ordersEditorControlOrderId(order)
    if (controlOrderId) {
      rows.setAttribute('data-orders-editor-order-id', controlOrderId)
    } else {
      rows.removeAttribute('data-orders-editor-order-id')
    }
    rows.innerHTML = `
      <div class="orders-service-blocks-board" data-orders-service-blocks-board>
        <div class="orders-service-blocks-list" data-orders-service-blocks-list>
          ${blocks.map((block, index) => ordersServiceBlockCardHtml(block, calendarTimelineResources(), index, blocks.length, ordersScheduleModeForOrder(order))).join('')}
          <button type="button" class="orders-kanban-add-column" data-orders-service-add>
            <span>+</span>
            <strong>Dodaj zmianę</strong>
          </button>
        </div>
        <div id="ordersServiceBlocksStickyScroll" class="orders-service-blocks-sticky-scroll" data-orders-service-blocks-scroll aria-label="Przewiń zmiany poziomo">
          <div data-orders-service-blocks-scroll-spacer></div>
        </div>
      </div>
    `
    if (summary) {
      const total = blocks.reduce((sum, block) => sum + Math.max(0, Number(block.requiredWorkMinutes) || 0), 0)
      const emptySlots = blocks.reduce((sum, block) => sum + (block.slots || []).filter((slot) => slot.type !== 'worker').length, 0)
      summary.textContent = emptySlots
        ? `Łącznie: ${ordersFormatWorkMinutes(total)} rbh · ${ordersServiceSlotCountLabel(emptySlots)} trafi do BUFORU, jeśli nie przypiszesz pracownika.`
        : `Łącznie: ${ordersFormatWorkMinutes(total)} rbh · wszystkie osoby są obsadzone.`
    }
    ordersEnhanceTimeInputs(rows)
    ordersSyncServiceBlocksStickyScroll(document.getElementById('ordersWorkloadPanel') || rows)
  }
  
  function ordersUpdateWorkHoursLabel() {
    const label = document.getElementById('ordersEditWorkHoursLabel')
    if (!label) {
      return
    }
    label.textContent = 'Wymagany czas pracy (rbh) *'
  }
  
  function ordersSplitMinutesEvenly(totalMinutes = 0, count = 1) {
    const total = Math.max(0, Math.round(Number(totalMinutes) || 0))
    const safeCount = Math.max(1, Math.floor(Number(count) || 1))
    const base = Math.floor(total / safeCount)
    const remainder = total - base * safeCount
    return Array.from({ length: safeCount }, (_, index) => base + (index < remainder ? 1 : 0))
  }

  function ordersWorkTargetTotalMinutes(order = {}) {
    return ordersReadWorkMinutes(order)
  }
  
  function ordersAllocationMap(order = {}) {
    const rows = Array.isArray(order.workAllocations)
      ? order.workAllocations
      : Array.isArray(order.workerAllocations)
        ? order.workerAllocations
        : []
    const access = ordersPrimaryTimeWindowRange(order)
    const map = new Map()
    rows.forEach((item) => {
      const key = String(item?.key ?? '').trim()
      const minutes = Math.max(0, Math.round(Number(item?.minutes ?? item?.workMinutes ?? item?.durationMinutes) || 0))
      if (key && minutes > 0) {
        const startTime = ordersNormalizeTimeField(
          item?.startTime ?? item?.planStartTime ?? item?.workerStartTime ?? item?.fromTime,
          access.startTime,
        )
        const endTime = ordersNormalizeTimeField(
          item?.endTime ?? item?.planEndTime ?? item?.workerEndTime ?? item?.toTime,
          ordersAllocationEndTimeFromMinutes(startTime, minutes),
        )
        map.set(key, { minutes, startTime, endTime })
      }
    })
    return map
  }
  
  function ordersWorkAllocationsForSubjects(order = {}, subjects = [], totalMinutes = 0, forceEven = false) {
    const safeSubjects = Array.isArray(subjects) && subjects.length ? subjects : ordersSelectedWorkSubjects(order)
    const total = Math.max(15, Math.round(Number(totalMinutes) || ordersReadWorkMinutes(order)))
    const existing = ordersAllocationMap(order)
    const canUseExisting =
        !forceEven &&
      safeSubjects.length > 0 &&
      safeSubjects.every((subject) => existing.has(subject.key)) &&
      [...existing.keys()].every((key) => safeSubjects.some((subject) => subject.key === key))
    const values = canUseExisting
      ? safeSubjects.map((subject) => existing.get(subject.key)?.minutes || 0)
      : ordersSplitMinutesEvenly(total, safeSubjects.length)
    const access = ordersPrimaryTimeWindowRange(order)
    return safeSubjects.map((subject, index) => {
      const minutes = Math.max(0, Math.round(Number(values[index]) || 0))
      const startTime = access.startTime
      const endTime = ordersAllocationEndTimeFromMinutes(startTime, minutes)
      return {
        ...subject,
        minutes,
        startTime,
        endTime,
      }
    })
  }
  
  function ordersReadWorkAllocationsFromControls(order = {}) {
    const subjects = ordersSelectedWorkSubjects(order)
    const values = new Map()
    const starts = new Map()
    const ends = new Map()
    document.querySelectorAll('#ordersWorkAllocationRows [data-orders-work-allocation]').forEach((input) => {
      if (!(input instanceof HTMLInputElement)) {
        return
      }
      const key = String(input.getAttribute('data-orders-work-allocation') ?? '').trim()
      const minutes = Math.max(0, Math.round(Number(input.value) || 0))
      if (key) {
        values.set(key, minutes)
      }
    })
    document.querySelectorAll('#ordersWorkAllocationRows [data-orders-work-allocation-start]').forEach((input) => {
      if (!(input instanceof HTMLInputElement)) {
        return
      }
      const key = String(input.getAttribute('data-orders-work-allocation-start') ?? '').trim()
      const value = ordersNormalizeTimeField(input.value, '')
      if (key && value) {
        starts.set(key, value)
      }
    })
    document.querySelectorAll('#ordersWorkAllocationRows [data-orders-work-allocation-end]').forEach((input) => {
      if (!(input instanceof HTMLInputElement)) {
        return
      }
      const key = String(input.getAttribute('data-orders-work-allocation-end') ?? '').trim()
      const value = ordersNormalizeTimeField(input.value, '')
      if (key && value) {
        ends.set(key, value)
      }
    })
    const fallback = ordersWorkAllocationsForSubjects(order, subjects, ordersReadWorkMinutes(order))
    return subjects.map((subject) => ({
      ...subject,
      minutes: values.has(subject.key) ? values.get(subject.key) : fallback.find((item) => item.key === subject.key)?.minutes || 0,
      startTime: starts.get(subject.key) || fallback.find((item) => item.key === subject.key)?.startTime || ordersPrimaryTimeWindowRange(order).startTime,
      endTime:
        ends.get(subject.key) ||
        fallback.find((item) => item.key === subject.key)?.endTime ||
        ordersAllocationEndTimeFromMinutes(
          starts.get(subject.key) || fallback.find((item) => item.key === subject.key)?.startTime || ordersPrimaryTimeWindowRange(order).startTime,
          values.get(subject.key) || fallback.find((item) => item.key === subject.key)?.minutes || 60,
        ),
    }))
  }
  
  function ordersStoreWorkAllocations(order = {}, allocations = []) {
    const access = ordersPrimaryTimeWindowRange(order)
    const safe = (Array.isArray(allocations) ? allocations : [])
      .map((item) => {
        const minutes = Math.max(0, Math.round(Number(item?.minutes) || 0))
        const startTime = ordersNormalizeTimeField(item?.startTime ?? item?.planStartTime, access.startTime)
        const endTime = ordersNormalizeTimeField(item?.endTime ?? item?.planEndTime, ordersAllocationEndTimeFromMinutes(startTime, minutes))
        return {
          key: String(item?.key ?? '').trim(),
          row: Number.isInteger(Number(item?.row)) ? Number(item.row) : 0,
          type: String(item?.type ?? '').trim() || 'buffer',
          label: String(item?.label ?? '').trim(),
          name: String(item?.name ?? item?.label ?? '').trim(),
          workerId: String(item?.workerId ?? '').trim(),
          workerLogin: String(item?.workerLogin ?? '').trim(),
          workerKey: String(item?.workerKey ?? item?.key ?? '').trim(),
          minutes,
          startTime,
          endTime,
          planStartTime: startTime,
          planEndTime: endTime,
        }
      })
      .filter((item) => item.key && item.minutes > 0)
    order.workAllocations = safe
    order.workerAllocations = safe
    return safe
  }
  
  function ordersWorkAllocationInput(key = '', attribute = '') {
    const safeKey = String(key ?? '').trim()
    const safeAttribute = String(attribute ?? '').trim()
    if (!safeKey || !safeAttribute || !window.CSS?.escape) {
      return null
    }
    return document.querySelector(`#ordersWorkAllocationRows [${safeAttribute}="${CSS.escape(safeKey)}"]`)
  }
  
  function ordersSyncAllocationEndInputFromMinutes(key = '') {
    const range = ordersWorkAllocationInput(key, 'data-orders-work-allocation')
    const start = ordersWorkAllocationInput(key, 'data-orders-work-allocation-start')
    const end = ordersWorkAllocationInput(key, 'data-orders-work-allocation-end')
    if (!(range instanceof HTMLInputElement) || !(start instanceof HTMLInputElement) || !(end instanceof HTMLInputElement)) {
      return
    }
    end.value = ordersAllocationEndTimeFromMinutes(start.value, Number(range.value) || 60)
  }
  
  function ordersSyncAllocationDurationFromTimes(key = '') {
    const range = ordersWorkAllocationInput(key, 'data-orders-work-allocation')
    const hours = ordersWorkAllocationInput(key, 'data-orders-work-allocation-hours')
    const start = ordersWorkAllocationInput(key, 'data-orders-work-allocation-start')
    const end = ordersWorkAllocationInput(key, 'data-orders-work-allocation-end')
    if (!(range instanceof HTMLInputElement) || !(start instanceof HTMLInputElement) || !(end instanceof HTMLInputElement)) {
      return
    }
    const minutes = ordersAllocationDurationFromTimes(start.value, end.value)
    range.max = String(Math.max(Number(range.max) || 0, minutes))
    range.value = String(minutes)
    if (hours instanceof HTMLInputElement) {
      hours.value = ordersHoursInputValue(minutes)
    }
  }

  function ordersHasAssignableWorkerResources(resources = calendarTimelineResources()) {
    return Array.isArray(resources) && resources.some((resource, row) => resource?.type === 'worker' && !calendarTimelineRowAllowsOverlap(row, resources))
  }

  async function ordersEnsureWorkerResourcesForEditor(order = ordersFindTimelineOrder(appState.ordersEditingId) || {}) {
    if (ordersHasAssignableWorkerResources() || typeof fetchWorkersForCurrentSession !== 'function') {
      return false
    }
    if (!ordersWorkerResourcesLoadPromise) {
      ordersWorkerResourcesLoadPromise = Promise.resolve(fetchWorkersForCurrentSession(false))
        .catch((error) => {
          console.warn('[orders] Nie udalo sie pobrac listy pracownikow dla obsady zlecenia.', error)
          return []
        })
        .finally(() => {
          ordersWorkerResourcesLoadPromise = null
        })
    }
    await ordersWorkerResourcesLoadPromise
    if (!ordersHasAssignableWorkerResources()) {
      return false
    }
    const editor = document.getElementById('ordersEditorPanel')
    const staffingPanel = editor?.querySelector('[data-orders-step-panel="staffing"]')
    if (editor && (!staffingPanel || staffingPanel.hidden === false)) {
      ordersRenderWorkAllocationControls(order, { forceEven: true, preferStored: false })
      ordersRenderEditorWizard(order)
    }
    return true
  }
  
  function ordersRenderWorkAllocationControls(order = {}, { forceEven = false, preferStored = false } = {}) {
    const panel = document.getElementById('ordersWorkloadPanel')
    const rows = document.getElementById('ordersWorkAllocationRows')
    const summary = document.getElementById('ordersWorkAllocationSummary')
    if (!panel || !rows || !summary) {
      return
    }
    void forceEven
    panel.hidden = false
    panel.classList.toggle('is-service-block-mode', true)
    ordersUpdateWorkHoursLabel()
    ordersRenderServiceBlockControls(order, { preferStored })
  }

  function ordersNextServiceBlockKind(blocks = []) {
    const used = new Set((Array.isArray(blocks) ? blocks : []).map((block) => String(block?.kind ?? '').trim()))
    let index = 2
    while (used.has(`${ORDERS_SERVICE_TEAM_KIND_PREFIX}-${index}`)) {
      index += 1
    }
    return `${ORDERS_SERVICE_TEAM_KIND_PREFIX}-${index}`
  }

  function ordersAddServiceBlockToCurrentOrder(kind = '') {
    const order = ordersFindTimelineOrder(appState.ordersEditingId)
    if (!order) {
      return
    }
    const blocks = ordersReadServiceBlocksFromControls(order)
    const normalizedKind = ordersServiceBlockKindIsValid(kind) ? String(kind).trim() : ordersNextServiceBlockKind(blocks)
    if (blocks.some((block) => block.kind === normalizedKind)) {
      return
    }
    const base = blocks[0] || ordersNormalizeServiceBlock({ kind: 'main' }, order, 0)
    ordersStoreServiceBlocks(order, [
      ...blocks,
      ordersNormalizeServiceBlock(
        {
          kind: normalizedKind,
          label: ordersServiceBlockDefaultLabel(blocks.length),
          scheduleMode: ordersScheduleModeForOrder(order),
          description: '',
          weekdays: base.weekdays,
          startTime: base.startTime,
          endTime: base.endTime,
          requiredPeople: 1,
          slots: [
            {
              id: `${ORDERS_SERVICE_SLOT_PREFIX}-1`,
              label: 'Osoba 1',
              type: 'unassigned',
              minutes: Math.max(15, Math.round(Number(base.slots?.[0]?.minutes) || ordersServiceBlockDurationMinutes(base))),
            },
          ],
        },
        order,
        blocks.length,
      ),
    ])
    ordersRenderWorkAllocationControls(order, { forceEven: true, preferStored: true })
    ordersRenderSchedulePreview(order)
    ordersRenderEditorWizard(order)
  }

  function ordersRemoveServiceBlockFromCurrentOrder(kind = '') {
    const order = ordersFindTimelineOrder(appState.ordersEditingId)
    const normalizedKind = ordersServiceBlockKindIsValid(kind) ? String(kind).trim() : ''
    if (!order || !normalizedKind || normalizedKind === 'main') {
      return
    }
    const blocks = ordersReadServiceBlocksFromControls(order).filter((block) => block.kind !== normalizedKind)
    ordersStoreServiceBlocks(order, blocks)
    ordersRenderWorkAllocationControls(order, { forceEven: true, preferStored: true })
    ordersRenderSchedulePreview(order)
    ordersRenderEditorWizard(order)
  }

  function ordersClearServiceBlockDragState() {
    document
      .querySelectorAll('#ordersWorkAllocationRows .orders-kanban-column.is-column-dragging, #ordersWorkAllocationRows .orders-kanban-column.is-column-drop-target')
      .forEach((node) => node.classList.remove('is-column-dragging', 'is-column-drop-target', 'is-column-drop-before', 'is-column-drop-after'))
    appState.ordersServiceBlockDraggingKind = ''
  }

  function ordersServiceBlockDropPosition(columnNode, event) {
    if (!(columnNode instanceof HTMLElement)) {
      return 'before'
    }
    const rect = columnNode.getBoundingClientRect()
    return event.clientX > rect.left + rect.width / 2 ? 'after' : 'before'
  }

  function ordersMarkServiceBlockDropTarget(columnNode, position = 'before') {
    document.querySelectorAll('#ordersWorkAllocationRows .orders-kanban-column.is-column-drop-target').forEach((node) => {
      if (node !== columnNode) {
        node.classList.remove('is-column-drop-target', 'is-column-drop-before', 'is-column-drop-after')
      }
    })
    if (!(columnNode instanceof HTMLElement)) {
      return
    }
    columnNode.classList.add('is-column-drop-target')
    columnNode.classList.toggle('is-column-drop-before', position !== 'after')
    columnNode.classList.toggle('is-column-drop-after', position === 'after')
  }

  function ordersMoveServiceBlockInCurrentOrder(sourceKind = '', targetKind = '', position = 'before') {
    const order = ordersFindTimelineOrder(appState.ordersEditingId)
    const source = ordersServiceBlockKindIsValid(sourceKind) ? String(sourceKind).trim() : ''
    const target = ordersServiceBlockKindIsValid(targetKind) ? String(targetKind).trim() : ''
    if (!order || !source || !target || source === target) {
      return
    }
    const blocks = ordersReadServiceBlocksFromControls(order)
    const sourceIndex = blocks.findIndex((block) => block.kind === source)
    const targetIndex = blocks.findIndex((block) => block.kind === target)
    if (sourceIndex < 0 || targetIndex < 0) {
      return
    }
    const nextBlocks = [...blocks]
    const [moved] = nextBlocks.splice(sourceIndex, 1)
    let insertIndex = targetIndex
    if (sourceIndex < targetIndex) {
      insertIndex -= 1
    }
    if (position === 'after') {
      insertIndex += 1
    }
    nextBlocks.splice(Math.max(0, Math.min(nextBlocks.length, insertIndex)), 0, moved)
    ordersStoreServiceBlocks(
      order,
      nextBlocks.map((block, index) => ({ ...block, sortIndex: index, orderIndex: index })),
    )
    ordersRenderWorkAllocationControls(order, { forceEven: true, preferStored: true })
    ordersRenderSchedulePreview(order)
    ordersRenderEditorWizard(order)
  }

  function ordersAddServiceSlotToCurrentBlock(kind = '') {
    const order = ordersFindTimelineOrder(appState.ordersEditingId)
    const normalizedKind = ordersServiceBlockKindIsValid(kind) ? String(kind).trim() : ''
    if (!order || !normalizedKind) {
      return
    }
    const blocks = ordersReadServiceBlocksFromControls(order)
    const nextBlocks = blocks.map((block) => {
      if (block.kind !== normalizedKind) {
        return block
      }
      const slots = Array.isArray(block.slots) ? block.slots : []
      let slotIndex = slots.length + 1
      const used = new Set(slots.map((slot) => String(slot?.slotId ?? slot?.id ?? '').trim()).filter(Boolean))
      while (used.has(`${ORDERS_SERVICE_SLOT_PREFIX}-${slotIndex}`)) {
        slotIndex += 1
      }
      const blockDuration = ordersServiceBlockDurationMinutes(block)
      return {
        ...block,
        slots: [
          ...slots,
          {
            id: `${ORDERS_SERVICE_SLOT_PREFIX}-${slotIndex}`,
            slotId: `${ORDERS_SERVICE_SLOT_PREFIX}-${slotIndex}`,
            label: `Osoba ${slotIndex}`,
            type: 'unassigned',
            row: ordersServiceBlockBufferRow(),
            minutes: Math.max(15, Math.round(blockDuration)),
            startTime: block.startTime,
            endTime: block.endTime,
          },
        ],
      }
    })
    ordersStoreServiceBlocks(order, nextBlocks)
    ordersRenderWorkAllocationControls(order, { forceEven: true, preferStored: true })
    ordersRenderSchedulePreview(order)
    ordersRenderEditorWizard(order)
  }

  function ordersRemoveServiceSlotFromCurrentBlock(kind = '', slotId = '') {
    const order = ordersFindTimelineOrder(appState.ordersEditingId)
    const normalizedKind = ordersServiceBlockKindIsValid(kind) ? String(kind).trim() : ''
    const normalizedSlotId = String(slotId ?? '').trim()
    if (!order || !normalizedKind || !normalizedSlotId) {
      return
    }
    const blocks = ordersReadServiceBlocksFromControls(order)
    const nextBlocks = blocks.map((block) => {
      if (block.kind !== normalizedKind) {
        return block
      }
      const slots = Array.isArray(block.slots) ? block.slots : []
      if (slots.length <= 1) {
        return block
      }
      return {
        ...block,
        slots: slots.filter((slot) => String(slot?.slotId ?? slot?.id ?? '').trim() !== normalizedSlotId),
      }
    })
    ordersStoreServiceBlocks(order, nextBlocks)
    ordersRenderWorkAllocationControls(order, { forceEven: true, preferStored: true })
    ordersRenderSchedulePreview(order)
    ordersRenderEditorWizard(order)
  }

  function ordersServiceBlocksOverlap(left = {}, right = {}) {
    const leftIsOnce = String(left?.scheduleMode ?? '').trim() === 'once'
    const rightIsOnce = String(right?.scheduleMode ?? '').trim() === 'once'
    if (leftIsOnce && rightIsOnce) {
      const leftDate = ordersNormalizeDateField(left.dateYmd ?? left.planDateYmd ?? left.startDateYmd, '')
      const rightDate = ordersNormalizeDateField(right.dateYmd ?? right.planDateYmd ?? right.startDateYmd, '')
      if (leftDate && rightDate && leftDate !== rightDate) {
        return false
      }
    }
    const sharedWeekday = (Array.isArray(left.weekdays) ? left.weekdays : []).some((weekday) => (right.weekdays || []).includes(weekday))
    if (!sharedWeekday) {
      return false
    }
    const leftStart = calendarTimelineTimeMinutes(left.startTime, 0)
    const leftEnd = leftStart + ordersServiceBlockDurationMinutes(left)
    const rightStart = calendarTimelineTimeMinutes(right.startTime, 0)
    const rightEnd = rightStart + ordersServiceBlockDurationMinutes(right)
    return leftStart < rightEnd && rightStart < leftEnd
  }

  function ordersServiceBlockWorkerConflict(blocks = []) {
    const resources = calendarTimelineResources()
    for (let leftIndex = 0; leftIndex < blocks.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < blocks.length; rightIndex += 1) {
        const left = blocks[leftIndex]
        const right = blocks[rightIndex]
        if (!ordersServiceBlocksOverlap(left, right)) {
          continue
        }
        const leftRows = new Set(left.assignedRows || [])
        const conflictRow = (right.assignedRows || []).find((row) => Number.isInteger(row) && leftRows.has(row) && !calendarTimelineRowAllowsOverlap(row, resources))
        if (Number.isInteger(conflictRow)) {
          return { left, right, row: conflictRow }
        }
      }
    }
    return null
  }

  function ordersValidateServiceBlocksForOrder(order = {}) {
    const controlBlocks = ordersReadServiceBlocksFromControls(order)
    const blocks = controlBlocks.length ? controlBlocks : ordersServiceBlocksForOrder(order)
    if (!blocks.length) {
      return { valid: false, message: 'Dodaj co najmniej jeden zespół lub zmianę.' }
    }
    for (const block of blocks) {
      const blockLabel = String(block.label ?? '').trim() || 'Zespół'
      if (!blockLabel) {
        return { valid: false, message: 'Każdy zespół musi mieć nazwę.' }
      }
      if (block.scheduleMode !== 'once' && !block.weekdays.length) {
        return { valid: false, message: `${block.label}: wybierz co najmniej jeden dzień realizacji.` }
      }
      if (!ordersNormalizeTimeField(block.startTime, '') || !ordersNormalizeTimeField(block.endTime, '')) {
        return { valid: false, message: `${block.label}: podaj godziny START i STOP.` }
      }
      const blockDuration = ordersServiceBlockDurationMinutes(block)
      if (blockDuration <= 0) {
        return { valid: false, message: `${block.label}: godzina STOP musi być późniejsza niż START.` }
      }
      const slots = Array.isArray(block.slots) ? block.slots : []
      if (!slots.length) {
        return { valid: false, message: `${block.label}: dodaj co najmniej jeden slot osoby.` }
      }
      const invalidSlot = slots.find((slot) => Math.round(Number(slot?.minutes) || 0) <= 0)
      if (invalidSlot) {
        return { valid: false, message: `${block.label}: każdy slot musi mieć rbh większe od zera.` }
      }
      const tooLongSlot = slots.find((slot) => Math.round(Number(slot?.minutes) || 0) > blockDuration)
      if (tooLongSlot) {
        return { valid: false, message: `${block.label}: rbh slotu nie może przekraczać czasu pracy zespołu.` }
      }
      const workerSlotRows = slots
        .filter((slot) => slot.type === 'worker')
        .map((slot) => Number(slot.row))
        .filter((row) => Number.isInteger(row) && row >= 0)
      if (workerSlotRows.some((row, rowIndex) => workerSlotRows.indexOf(row) !== rowIndex)) {
        return { valid: false, message: `${block.label}: ten sam pracownik jest przypisany do więcej niż jednego slotu.` }
      }
    }
    const conflict = ordersServiceBlockWorkerConflict(blocks)
    if (conflict) {
      return { valid: false, message: `Kolizja obsady: ${conflict.left.label} nachodzi na ${conflict.right.label}.` }
    }
    return { valid: true, message: '' }
  }
  
  function ordersUpdateWorkAllocationSummary(order = {}) {
    const summary = document.getElementById('ordersWorkAllocationSummary')
    if (!summary) {
      return
    }
    const allocations = ordersReadWorkAllocationsFromControls(order)
    const total = ordersWorkTargetTotalMinutes(order)
    const assigned = allocations.reduce((sum, item) => sum + Math.max(0, Number(item.minutes) || 0), 0)
    const mismatch = Math.abs(assigned - total) > 0
    summary.classList.toggle('is-error', mismatch)
    summary.textContent = `Przydzielono ${ordersFormatWorkMinutes(assigned)} / ${ordersFormatWorkMinutes(total)}.`
    ordersStoreWorkAllocations(order, allocations)
  }
  
  function ordersCloseWorkerPicker() {
    const picker = document.getElementById('ordersEditWorkerPicker')
    if (picker instanceof HTMLDetailsElement) {
      picker.open = false
      return
    }
    picker?.removeAttribute?.('open')
  }
  
  function ordersClientDisplayName(client = {}) {
    return String(client?.name ?? client?.clientName ?? client?.clientLabel ?? client?.id ?? client?.clientId ?? '').trim()
  }
  
  function ordersFirstClientText(...values) {
    return values
      .map((value) => String(value ?? '').replace(/\s+/g, ' ').trim())
      .find(Boolean) ?? ''
  }
  
  function ordersClientId(client = {}) {
    return ordersFirstClientText(client?.id, client?.clientId)
  }
  
  function ordersFindClientBySelection(value = '') {
    const selected = String(value ?? '').trim()
    if (!selected) {
      return null
    }
    const normalized = normalizeSearchText(selected)
    const clients = Array.isArray(appState.clients) ? appState.clients : []
    return (
      clients.find((client) => normalizeSearchText(ordersClientId(client)) === normalized) ||
      clients.find((client) => normalizeSearchText(ordersClientDisplayName(client)) === normalized) ||
      clients.find((client) => normalizeSearchText(client?.name ?? client?.clientName ?? '') === normalized) ||
      null
    )
  }

  function ordersIsIndividualClientSelection(value = '') {
    const selected = String(value ?? '').trim()
    if (!selected) {
      return false
    }
    return (
      selected === ORDERS_INDIVIDUAL_CLIENT_VALUE ||
      selected === ORDERS_RETAIL_CLIENT_VALUE ||
      normalizeSearchText(selected) === normalizeSearchText(ORDERS_INDIVIDUAL_CLIENT_LABEL)
    )
  }

  function ordersSetIndividualClientFieldsVisible(visible = false) {
    const box = document.getElementById('ordersIndividualClientFields')
    if (box) {
      box.hidden = !visible
    }
  }

  function ordersReadIndividualClientDraft() {
    const name = ordersReadInputValue('ordersIndividualName')
    const phone = ordersReadInputValue('ordersIndividualPhone')
    const email = ordersReadInputValue('ordersIndividualEmail')
    const nip = ordersReadInputValue('ordersIndividualNip')
    return {
      name,
      contactName: name,
      phone,
      email,
      nip,
      contact: email || phone,
    }
  }
  
  function ordersClientPostCodeFromAddress(address = '') {
    const match = String(address ?? '').match(/\b\d{2}-\d{3}\b/)
    return match?.[0] ?? ''
  }
  
  function ordersClientFormData(client = {}) {
    const address = ordersFirstClientText(client?.address, client?.adres, client?.street, client?.ulica)
    const postCode = ordersFirstClientText(
      client?.postCode,
      client?.postalCode,
      client?.zip,
      client?.kodPocztowy,
      ordersClientPostCodeFromAddress(address),
    )
    const contact = ordersFirstClientText(client?.email, client?.contact, client?.phone)
    const email = /\S+@\S+\.\S+/.test(contact) ? contact : ordersFirstClientText(client?.email)
    return {
      clientId: ordersClientId(client),
      clientName: ordersClientDisplayName(client),
      nip: ordersFirstClientText(client?.nip),
      street: address,
      city: ordersFirstClientText(client?.city, client?.miasto),
      postCode,
      region: ordersFirstClientText(client?.region, client?.voivodeship, client?.wojewodztwo, client?.województwo),
      country: ordersFirstClientText(client?.country, client?.kraj) || (address || postCode ? 'Polska' : ''),
      email,
      contact,
    }
  }
  
  function ordersClientAddressLabel(data = {}) {
    const street = ordersFirstClientText(data.street)
    const cityLine = [ordersFirstClientText(data.postCode), ordersFirstClientText(data.city)].filter(Boolean).join(' ')
    return [street, cityLine].filter(Boolean).join(', ')
  }
  
  function ordersWorkerOnlyComment(order = {}) {
    return ordersFirstClientText(
      order?.workerComment,
      order?.workerOnlyComment,
      order?.employeeComment,
      order?.appComment,
      order?.mobileComment,
      order?.internalComment,
      order?.privateWorkerComment,
      order?.commentForWorkers,
    )
  }
  
  function ordersListEntryText(value = '') {
    return String(value ?? '').replace(/\s+/g, ' ').trim()
  }
  
  function ordersSplitListText(value = '') {
    return String(value ?? '')
      .split(/\r?\n|[;,|]/)
      .map((item) => ordersListEntryText(item))
      .filter(Boolean)
  }
  
  function ordersListItemId(prefix = 'item') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }
  
  function ordersNormalizeSubtask(item = {}, index = 0) {
    if (typeof item === 'string') {
      const name = ordersListEntryText(item)
      return name ? { id: ordersListItemId('task'), name, taskName: name, completed: false } : null
    }
    if (!item || typeof item !== 'object') {
      return null
    }
    const name = ordersFirstClientText(item.name, item.taskName, item.title, item.label, item.description)
    if (!name) {
      return null
    }
    return {
      ...item,
      id: String(item.id ?? item.taskId ?? '').trim() || `task-${index + 1}`,
      name,
      taskName: name,
      description: ordersFirstClientText(item.description, item.note),
      completed: Boolean(item.completed),
    }
  }
  
  function ordersOrderSubtasks(order = {}) {
    const source = Array.isArray(order?.tasks)
      ? order.tasks
      : Array.isArray(order?.subtasks)
        ? order.subtasks
        : Array.isArray(order?.activities)
          ? order.activities
          : []
    const rows = source.map((item, index) => ordersNormalizeSubtask(item, index)).filter(Boolean)
    const singleTask = ordersListEntryText(order?.taskName)
    if (singleTask && !rows.some((item) => normalizeSearchText(item.name) === normalizeSearchText(singleTask))) {
      rows.push({
        id: 'task-main',
        name: singleTask,
        taskName: singleTask,
        completed: false,
      })
    }
    return rows
  }
  
  function ordersSupplyKind(value = '') {
    const normalized = normalizeSearchText(value)
    if (['chemia', 'chemical', 'chemicals', 'srodek', 'środek', 'detergent'].includes(normalized)) {
      return 'chemical'
    }
    if (['sprzet', 'sprzęt', 'equipment', 'tool', 'tools'].includes(normalized)) {
      return 'equipment'
    }
    return 'other'
  }
  
  function ordersSupplyKindLabel(kind = '') {
    const normalized = ordersSupplyKind(kind)
    if (normalized === 'chemical') return 'Chemia'
    if (normalized === 'equipment') return 'Sprzęt'
    return 'Inne'
  }
  
  function ordersNormalizeSupplyItem(item = {}, index = 0, fallbackKind = 'other') {
    if (typeof item === 'string') {
      const name = ordersListEntryText(item)
      return name
        ? {
            id: ordersListItemId('supply'),
            kind: ordersSupplyKind(fallbackKind),
            name,
          }
        : null
    }
    if (!item || typeof item !== 'object') {
      return null
    }
    const name = ordersFirstClientText(item.name, item.item, item.label, item.title, item.equipmentName, item.chemicalName, item.description)
    if (!name) {
      return null
    }
    return {
      ...item,
      id: String(item.id ?? item.supplyId ?? '').trim() || `supply-${index + 1}`,
      kind: ordersSupplyKind(item.kind ?? item.type ?? item.category ?? fallbackKind),
      name,
      qrCode: ordersFirstClientText(item.qrCode, item.qr, item.code, item.qrNumber, item.assetQr, item.assetCode),
      quantity: ordersFirstClientText(item.quantity, item.amount, item.qty),
      note: ordersFirstClientText(item.note, item.description),
    }
  }
  
  function ordersPushSupplyItems(target, source, fallbackKind = 'other') {
    const rows = Array.isArray(source)
      ? source
      : typeof source === 'string'
        ? ordersSplitListText(source)
        : []
    rows
      .map((item, index) => ordersNormalizeSupplyItem(item, index, fallbackKind))
      .filter(Boolean)
      .forEach((item) => {
        const key = `${ordersSupplyKind(item.kind)}:${normalizeSearchText(item.name)}:${normalizeSearchText(item.qrCode)}`
        if (!target.some((row) => `${ordersSupplyKind(row.kind)}:${normalizeSearchText(row.name)}:${normalizeSearchText(row.qrCode)}` === key)) {
          target.push(item)
        }
      })
  }
  
  function ordersOrderSupplies(order = {}) {
    const rows = []
    ordersPushSupplyItems(rows, order?.supplies ?? order?.orderSupplies ?? order?.itemsToTake, 'other')
    ordersPushSupplyItems(rows, order?.equipmentToTake ?? order?.equipmentItems ?? order?.equipmentList ?? order?.equipment ?? order?.sprzet, 'equipment')
    ordersPushSupplyItems(rows, order?.chemicalsToTake ?? order?.chemicalItems ?? order?.chemicalList ?? order?.chemicals ?? order?.chemia, 'chemical')
    return rows
  }
  
  function ordersSubtaskRowsHtml(order = {}) {
    const tasks = ordersOrderSubtasks(order)
    if (!tasks.length) {
      return '<div class="orders-simple-list-empty">Brak dodanych zadań.</div>'
    }
    return tasks
      .map(
        (task, index) => `
          <div class="orders-simple-row">
            <em>${index + 1}</em>
            <strong title="${escapeHtml(task.name)}">${escapeHtml(task.name)}</strong>
            <button type="button" data-orders-remove-subtask="${index}">Usuń</button>
          </div>
        `,
      )
      .join('')
  }
  
  function ordersSupplyRowsHtml(order = {}) {
    const supplies = ordersOrderSupplies(order)
    if (!supplies.length) {
      return '<div class="orders-simple-list-empty">Brak dodanego sprzętu lub chemii.</div>'
    }
    return supplies
      .map(
        (item, index) => {
          const qrCode = ordersFirstClientText(item.qrCode, item.qr, item.code, item.qrNumber, item.assetQr, item.assetCode)
          return `
          <div class="orders-simple-row orders-simple-row--supply">
            <em>${escapeHtml(ordersSupplyKindLabel(item.kind))}</em>
            <span title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
            <small>${qrCode ? `QR: ${escapeHtml(qrCode)}` : 'QR: -'}</small>
            <button type="button" data-orders-remove-supply="${index}">Usuń</button>
          </div>
        `
        },
      )
      .join('')
  }
  
  function ordersObjectPlanReadableZoneText(...values) {
    return values
      .map((value) => ordersFirstClientText(value))
      .find((value) => value && value !== '-' && !dashboardIsQrCodeLike(value))
      || ''
  }
  
  function ordersObjectPlanZoneLabel(zone = {}, index = 0) {
    return (
      ordersObjectPlanReadableZoneText(zone?.zoneName, zone?.zone, zone?.name, zone?.label, zone?.title, zone?.function, zone?.type) ||
      `Strefa ${index + 1}`
    )
  }
  
  function ordersObjectPlanZoneLocation(zone = {}) {
    const parts = [
      ordersObjectPlanReadableZoneText(
        zone?.location,
        zone?.zoneLocation,
        zone?.lokalizacja,
        zone?.roomLocation,
        zone?.areaLocation,
        zone?.objectLocation,
        zone?.room,
        zone?.pomieszczenie,
        zone?.floorName,
        zone?.floor,
        zone?.pietro,
        zone?.level,
        zone?.section,
        zone?.place,
      ),
      ordersObjectPlanReadableZoneText(zone?.address, zone?.adres, zone?.building, zone?.budynek, zone?.siteName, zone?.objectName),
    ].filter(Boolean)
    return [...new Set(parts)].join(' - ')
  }
  
  function ordersObjectPlanZoneDisplayLabel(zone = {}, options = {}) {
    const label = ordersFirstClientText(zone?.label, zone?.name, zone?.zoneName, zone?.zone) || 'Strefa'
    if (options.includeLocation === false || String(zone?.key ?? '').trim() === ORDERS_OBJECT_ALL_ZONES_KEY) {
      return label
    }
    const location = ordersFirstClientText(zone?.location, zone?.meta)
    return `${label} - ${location && location !== 'Brak lokalizacji' ? location : 'brak lokalizacji'}`
  }
  
  function ordersObjectPlanZoneQr(zone = {}) {
    return ordersFirstClientText(zone?.qr, zone?.qrCode, zone?.code, zone?.zoneCode)
  }
  
  function ordersObjectPlanZoneKey(zone = {}, index = 0) {
    const raw = ordersFirstClientText(zone?.id, zone?.zoneId, zone?.qr, zone?.qrCode, zone?.code, zone?.name, zone?.zoneName, `zone-${index + 1}`)
    return `zone:${normalizeSearchText(raw || `zone-${index + 1}`)}`
  }
  
  function ordersNormalizeObjectPlanZone(zone = {}, index = 0) {
    const label = ordersObjectPlanZoneLabel(zone, index)
    const location = ordersObjectPlanZoneLocation(zone)
    const qr = ordersObjectPlanZoneQr(zone)
    return {
      key: ordersObjectPlanZoneKey(zone, index),
      label,
      location,
      qr,
      meta: location || 'Brak lokalizacji',
    }
  }
  
  function ordersPushObjectPlanZones(target = [], source = []) {
    if (!Array.isArray(source)) {
      return
    }
    source.forEach((zone) => {
      const normalized = ordersNormalizeObjectPlanZone(zone, target.length)
      if (!normalized.label) {
        return
      }
      if (
        !target.some(
          (item) =>
            item.key === normalized.key ||
            `${normalizeSearchText(item.label)}|${normalizeSearchText(item.location)}` ===
              `${normalizeSearchText(normalized.label)}|${normalizeSearchText(normalized.location)}`,
        )
      ) {
        target.push(normalized)
      }
    })
  }
  
  function ordersObjectPlanZonesForOrder(order = {}) {
    const selectedClient = ordersFindClientBySelection(ordersReadInputValue('ordersEditClient') || order.clientId || order.clientLabel || order.clientName)
    if (!selectedClient) {
      return []
    }
    const rows = []
    ;[selectedClient?.zones, selectedClient?.strefy, selectedClient?.objects, selectedClient?.obiekty, selectedClient?.locations].forEach((source) => {
      ordersPushObjectPlanZones(rows, source)
    })
    ordersPushObjectPlanZones(
      rows,
      (Array.isArray(appState.zones) ? appState.zones : []).filter((zone) => ordersZoneMatchesClient(zone, selectedClient)),
    )
    return rows
  }
  
  function ordersObjectPlanAllZonesOption() {
    return {
      key: ORDERS_OBJECT_ALL_ZONES_KEY,
      label: 'Wszystkie strefy',
      location: 'Cały obiekt',
      qr: '',
      meta: 'Cały obiekt',
    }
  }
  
  function ordersObjectPlanZoneForKey(zones = [], zoneKey = '') {
    const key = String(zoneKey ?? '').trim()
    if (key === ORDERS_OBJECT_ALL_ZONES_KEY) {
      return ordersObjectPlanAllZonesOption()
    }
    return (Array.isArray(zones) ? zones : []).find((zone) => zone.key === key) || null
  }
  
  function ordersObjectPlanTasks(order = {}) {
    const source = Array.isArray(order?.objectPlanTasks)
      ? order.objectPlanTasks
      : Array.isArray(order?.zoneTaskPlan)
        ? order.zoneTaskPlan
        : Array.isArray(order?.objectZoneTasks)
          ? order.objectZoneTasks
          : []
    return source
      .map((task, index) => {
        const name = ordersListEntryText(task?.name ?? task?.taskName ?? task?.title ?? task?.description)
        if (!name) {
          return null
        }
        const mode = String(task?.mode ?? task?.type ?? 'repeat').trim() === 'once' ? 'once' : 'repeat'
        return {
          ...task,
          id: String(task?.id ?? '').trim() || `object-task-${index + 1}`,
          zoneKey: String(task?.zoneKey ?? '').trim(),
          zoneLabel:
            String(task?.zoneKey ?? '').trim() === ORDERS_OBJECT_ALL_ZONES_KEY
              ? 'Wszystkie strefy'
              : String(task?.zoneLabel ?? '').trim(),
          name,
          mode,
          cadence: String(task?.cadence ?? task?.frequency ?? task?.repeatLabel ?? '').trim(),
          dateYmd: ordersNormalizeDateField(task?.dateYmd ?? task?.dueDate ?? task?.date, ''),
        }
      })
      .filter(Boolean)
  }
  
  function ordersSetObjectPlanTasks(order = {}, tasks = []) {
    const rows = Array.isArray(tasks) ? tasks : []
    order.objectPlanTasks = rows
    order.zoneTaskPlan = rows
    order.objectZoneTasks = rows
  }
  
  function ordersObjectPlanTaskDate(task = {}, order = {}) {
    return ordersNormalizeDateField(task?.dateYmd ?? task?.dueDate ?? task?.date, order?.dateYmd || todayYmd())
  }
  
  function ordersObjectPlanCalendarMonth(order = {}) {
    const fallback = calendarMonthStart(order?.dateYmd || todayYmd())
    const current = ordersNormalizeDateField(appState.ordersObjectPlanCalendarMonth, fallback)
    return calendarMonthStart(current)
  }
  
  function ordersObjectPlanTaskRepeatStepDays(task = {}) {
    const cadence = normalizeSearchText(task?.cadence ?? task?.frequency ?? '')
    if (cadence.includes('codzien')) {
      return 1
    }
    if (cadence.includes('2') || cadence.includes('dwa')) {
      return 14
    }
    if (cadence.includes('mies')) {
      return 0
    }
    if (cadence.includes('audyt')) {
      return null
    }
    return 7
  }
  
  function ordersObjectPlanMonthOccurrenceDates(task = {}, order = {}, monthStart = todayYmd()) {
    const start = ordersObjectPlanTaskDate(task, order)
    const gridStart = calendarMonthGridStart(monthStart)
    const gridEnd = calendarAddDays(gridStart, 41)
    if (String(task?.mode ?? '') === 'once') {
      return start >= gridStart && start <= gridEnd ? [start] : []
    }
    const stepDays = ordersObjectPlanTaskRepeatStepDays(task)
    if (stepDays === null) {
      return start >= gridStart && start <= gridEnd ? [start] : []
    }
    if (stepDays === 0) {
      const dates = []
      const startDate = calendarDateFromYmd(start)
      let cursor = calendarDateFromYmd(calendarMonthStart(gridStart))
      cursor.setDate(startDate.getDate())
      if (calendarDateToYmd(cursor) < gridStart) {
        cursor.setMonth(cursor.getMonth() + 1)
      }
      while (calendarDateToYmd(cursor) <= gridEnd) {
        const day = calendarDateToYmd(cursor)
        if (day >= start) {
          dates.push(day)
        }
        cursor.setMonth(cursor.getMonth() + 1)
      }
      return dates
    }
    const dates = []
    let cursor = start
    while (cursor < gridStart) {
      cursor = calendarAddDays(cursor, stepDays)
    }
    while (cursor <= gridEnd) {
      dates.push(cursor)
      cursor = calendarAddDays(cursor, stepDays)
    }
    return dates
  }
  
  function ordersObjectPlanActiveDaysForRange(order = {}, days = []) {
    const visibleDays = (Array.isArray(days) ? days : [])
      .map((day) => String(day ?? '').trim())
      .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day))
    if (!visibleDays.length) {
      return new Set()
    }
  
    if (ordersScheduleModeForOrder(order) === 'repeat') {
      const skippedDates = calendarTimelineRecurringSkippedDates(order)
      return new Set(calendarTimelineRecurringDaysForRange(order, visibleDays).filter((day) => !skippedDates.has(day)))
    }
  
    const visibleSet = new Set(visibleDays)
    return new Set(calendarTimelineDaysForOrder(order).filter((day) => visibleSet.has(day)))
  }
  
  function ordersObjectPlanDayIsActive(order = {}, day = '') {
    const dayKey = ordersNormalizeDateField(day, '')
    return dayKey ? ordersObjectPlanActiveDaysForRange(order, [dayKey]).has(dayKey) : false
  }
  
  function ordersObjectPlanSelectedZoneKeys(zones = []) {
    const available = new Set((Array.isArray(zones) ? zones : []).map((zone) => zone.key))
    return (Array.isArray(appState.ordersObjectPlanSelectedZoneKeys) ? appState.ordersObjectPlanSelectedZoneKeys : [])
      .map((key) => String(key ?? '').trim())
      .filter((key) => available.has(key))
  }
  
  function ordersObjectPlanVisibleZones(zones = []) {
    const rows = Array.isArray(zones) ? zones : []
    const selected = ordersObjectPlanSelectedZoneKeys(rows)
    if (!selected.length) {
      return rows
    }
    const selectedSet = new Set(selected)
    return rows.filter((zone) => selectedSet.has(zone.key))
  }
  
  function ordersObjectPlanZoneFilterHtml(zones = []) {
    const rows = Array.isArray(zones) ? zones : []
    if (!rows.length) {
      return '<div class="orders-object-zone-empty">Brak stref dla wybranego klienta.</div>'
    }
    const selected = ordersObjectPlanSelectedZoneKeys(rows)
    const activeCount = selected.length || rows.length
    return `
      <button class="orders-object-zone-filter" type="button" data-orders-object-zone-window-open="1">
        <span>Strefy na kalendarzu</span>
        <strong>${activeCount === rows.length ? 'Wszystkie strefy' : `${activeCount} z ${rows.length}`}</strong>
      </button>
    `
  }
  
  function ordersObjectPlanZoneWindowHtml(zones = []) {
    const rows = Array.isArray(zones) ? zones : []
    if (!rows.length || !appState.ordersObjectPlanZoneWindowOpen) {
      return ''
    }
    const selected = ordersObjectPlanSelectedZoneKeys(rows)
    const selectedSet = selected.length ? new Set(selected) : new Set(rows.map((zone) => zone.key))
    const activeCount = selected.length || rows.length
    return `
      <div class="orders-object-zone-window-backdrop" data-orders-object-zone-window-close="1">
        <section class="orders-object-zone-window" role="dialog" aria-modal="true" aria-label="Strefy na kalendarzu">
          <div class="orders-object-zone-window-head">
            <div>
              <strong>Strefy na kalendarzu</strong>
              <span>Wybierz strefy, które mają być widoczne w planie czynności.</span>
            </div>
            <button type="button" data-orders-object-zone-window-close="1" aria-label="Zamknij">×</button>
          </div>
          <div class="orders-object-zone-window-summary">
            Widoczne: ${escapeHtml(String(activeCount))} z ${escapeHtml(String(rows.length))}
          </div>
          <div class="orders-object-zone-window-list">
            ${rows
              .map(
                (zone) => `
                  <label class="orders-object-zone-filter-row">
                    <input type="checkbox" data-orders-object-zone-filter="${escapeHtml(zone.key)}"${selectedSet.has(zone.key) ? ' checked' : ''} />
                    <span>
                      <strong>${escapeHtml(zone.label)}</strong>
                      <small>${escapeHtml(zone.location || 'Brak lokalizacji')}</small>
                    </span>
                  </label>
                `,
              )
              .join('')}
          </div>
        </section>
      </div>
    `
  }
  
  function ordersObjectPlanCalendarTasksByDay(order = {}, zones = [], monthStart = todayYmd(), activeDays = null) {
    const zoneLabels = new Map(zones.map((zone) => [zone.key, zone.label]))
    const allowedZoneKeys = new Set(zones.map((zone) => zone.key))
    const allowedDays = activeDays instanceof Set ? activeDays : null
    const byDay = new Map()
    ordersObjectPlanTasks(order).forEach((task) => {
      const taskZone = String(task.zoneKey ?? '').trim()
      const isAllZonesTask = taskZone === ORDERS_OBJECT_ALL_ZONES_KEY
      if (allowedZoneKeys.size && taskZone && !isAllZonesTask && !allowedZoneKeys.has(taskZone)) {
        return
      }
      ordersObjectPlanMonthOccurrenceDates(task, order, monthStart).forEach((day) => {
        if (allowedDays && !allowedDays.has(day)) {
          return
        }
        const rows = byDay.get(day) || []
        rows.push({
          ...task,
          day,
          zoneLabel: isAllZonesTask ? 'Wszystkie strefy' : task.zoneLabel || zoneLabels.get(task.zoneKey) || 'Strefa',
        })
        byDay.set(day, rows)
      })
    })
    return byDay
  }
  
  function ordersObjectPlanCalendarHtml(order = {}, zones = []) {
    const monthStart = ordersObjectPlanCalendarMonth(order)
    const gridStart = calendarMonthGridStart(monthStart)
    const visibleZones = ordersObjectPlanVisibleZones(zones)
    const monthKey = monthStart.slice(0, 7)
    const today = todayYmd()
    const days = Array.from({ length: 42 }, (_, index) => calendarAddDays(gridStart, index))
    const activeDays = ordersObjectPlanActiveDaysForRange(order, days)
    const tasksByDay = ordersObjectPlanCalendarTasksByDay(order, visibleZones, monthStart, activeDays)
  
    return `
      <div class="orders-object-calendar">
        <div class="orders-object-calendar-head">
          <div>
            <strong>Kalendarz czynności</strong>
            <span>Zbiorczy widok zadań dla wybranych stref obiektu</span>
          </div>
          <div class="orders-object-calendar-tools">
            <button class="orders-object-add-task-button" type="button" data-orders-object-task-window-open="1">Dodaj zadanie</button>
            ${ordersObjectPlanZoneFilterHtml(zones)}
          </div>
          <div class="orders-object-calendar-nav">
            <button type="button" data-orders-object-calendar-month="-1" aria-label="Poprzedni miesiąc">‹</button>
            <b>${escapeHtml(calendarMonthLabel(monthStart).replace(/^./, (char) => char.toLocaleUpperCase('pl-PL')))}</b>
            <button type="button" data-orders-object-calendar-month="1" aria-label="Następny miesiąc">›</button>
          </div>
        </div>
        <div class="orders-object-calendar-weekdays">
          ${['P', 'W', 'Ś', 'C', 'P', 'S', 'N'].map((day) => `<span>${day}</span>`).join('')}
        </div>
        <div class="orders-object-calendar-grid">
          ${days
            .map((day) => {
              const dayTasks = tasksByDay.get(day) || []
              const isMuted = !day.startsWith(monthKey)
              const isToday = day === today
              const isActive = activeDays.has(day)
              const dayAttributes = isActive
                ? `role="button" tabindex="0" data-orders-object-calendar-day="${escapeHtml(day)}"`
                : 'aria-disabled="true"'
              return `
                <div class="orders-object-calendar-day${isMuted ? ' is-muted' : ''}${isToday ? ' is-today' : ''}${isActive ? ' is-active-day' : ' is-inactive'}" ${dayAttributes}>
                  <div class="orders-object-calendar-date">${escapeHtml(calendarDayNumberLabel(day))}</div>
                  <div class="orders-object-calendar-items">
                    ${dayTasks
                      .map(
                        (task) => `
                          <button class="orders-object-calendar-chip" type="button" draggable="true" data-orders-object-task-drag="${escapeHtml(task.id)}" title="${escapeHtml(`${task.zoneLabel}: ${task.name}`)}">
                            <span>${escapeHtml(task.zoneLabel)}</span>
                            <strong>${escapeHtml(task.name)}</strong>
                          </button>
                        `,
                      )
                      .join('')}
                  </div>
                </div>
              `
            })
            .join('')}
        </div>
        ${ordersObjectPlanZoneWindowHtml(zones)}
        ${ordersObjectPlanTaskWindowHtml(order, zones)}
      </div>
    `
  }
  
  function ordersObjectPlanCadenceOptionsHtml(selected = '') {
    const value = String(selected || 'Codziennie').trim()
    return ['Codziennie', 'Co tydzień', 'Co 2 tygodnie', 'Co miesiąc']
      .map((option) => `<option value="${escapeHtml(option)}"${option === value ? ' selected' : ''}>${escapeHtml(option)}</option>`)
      .join('')
  }
  
  function ordersObjectPlanZoneOptionsHtml(zones = [], selectedKey = '', options = {}) {
    const rows = Array.isArray(zones) ? zones : []
    const selected = String(selectedKey ?? '').trim()
    if (!rows.length) {
      return '<option value="">Brak stref</option>'
    }
    const allOption = options.includeAll
      ? [`<option value="${escapeHtml(ORDERS_OBJECT_ALL_ZONES_KEY)}"${ORDERS_OBJECT_ALL_ZONES_KEY === selected ? ' selected' : ''}>Wszystkie strefy</option>`]
      : []
    return allOption
      .concat(
        rows.map((zone) => {
          const label = ordersObjectPlanZoneDisplayLabel(zone)
          return `<option value="${escapeHtml(zone.key)}"${zone.key === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`
        }),
      )
      .join('')
  }
  
  function ordersObjectPlanTaskWindowHtml(order = {}, zones = []) {
    const rows = Array.isArray(zones) ? zones : []
    if (!rows.length || !appState.ordersObjectPlanTaskWindowOpen) {
      return ''
    }
    const selectedZone = rows.some((zone) => zone.key === appState.ordersObjectPlanZoneKey)
      ? appState.ordersObjectPlanZoneKey
      : ORDERS_OBJECT_ALL_ZONES_KEY
    const taskDate = ordersNormalizeDateField(order?.dateYmd || appState.ordersObjectPlanCalendarMonth || todayYmd(), todayYmd())
    return `
      <div class="orders-object-task-window-backdrop" data-orders-object-task-window-close="1">
        <section class="orders-object-task-window" role="dialog" aria-modal="true" aria-label="Dodaj zadanie na obiekcie">
          <div class="orders-object-task-window-head">
            <div>
              <strong>Dodaj zadanie</strong>
              <span>Przypisz czynność do konkretnej strefy albo do wszystkich stref obiektu.</span>
            </div>
            <button type="button" data-orders-object-task-window-close="1" aria-label="Zamknij">×</button>
          </div>
          <div class="orders-object-task-window-form">
            <label class="orders-object-task-window-zone">
              <span>Zakres zadania</span>
              <select id="ordersObjectTaskZone">${ordersObjectPlanZoneOptionsHtml(rows, selectedZone, { includeAll: true })}</select>
            </label>
            <label class="orders-object-task-window-name">
              <span>Czynność</span>
              <input id="ordersObjectTaskName" type="text" autocomplete="off" placeholder="Np. mycie podłogi, listwy przypodłogowe..." />
            </label>
            <label class="orders-object-task-window-type">
              <span>Typ</span>
              <select id="ordersObjectTaskMode">
                <option value="repeat" selected>Cykliczne</option>
                <option value="once">Jednorazowe</option>
              </select>
            </label>
            <label class="orders-object-task-window-date">
              <span>Od dnia</span>
              <input id="ordersObjectTaskDate" type="date" value="${escapeHtml(taskDate)}" />
            </label>
            <label class="orders-object-task-window-cadence">
              <span>Częstotliwość</span>
              <select id="ordersObjectTaskCadence">${ordersObjectPlanCadenceOptionsHtml('Codziennie')}</select>
            </label>
            <button id="ordersObjectTaskAdd" type="button">Dodaj zadanie</button>
          </div>
        </section>
      </div>
    `
  }
  
  function ordersObjectPlanTasksForDay(order = {}, zones = [], day = '') {
    const dayKey = ordersNormalizeDateField(day, '')
    if (!dayKey) {
      return []
    }
    if (!ordersObjectPlanDayIsActive(order, dayKey)) {
      return []
    }
    const visibleZones = ordersObjectPlanVisibleZones(zones)
    const allowedZoneKeys = new Set(visibleZones.map((zone) => zone.key))
    return ordersObjectPlanTasks(order).filter((task) => {
      const taskZone = String(task.zoneKey ?? '').trim()
      if (allowedZoneKeys.size && taskZone && taskZone !== ORDERS_OBJECT_ALL_ZONES_KEY && !allowedZoneKeys.has(taskZone)) {
        return false
      }
      return ordersObjectPlanMonthOccurrenceDates(task, order, calendarMonthStart(dayKey)).includes(dayKey)
    })
  }
  
  function ordersObjectPlanDayEditorHtml(order = {}, zones = []) {
    const day = ordersNormalizeDateField(appState.ordersObjectPlanDayEditorDate, '')
    if (!day || !ordersObjectPlanDayIsActive(order, day)) {
      return ''
    }
    const visibleZones = ordersObjectPlanVisibleZones(zones)
    const usableZones = visibleZones.length ? visibleZones : zones
    const dayTasks = ordersObjectPlanTasksForDay(order, zones, day)
    const defaultZone = usableZones[0]?.key || ''
    return `
      <div class="orders-object-day-backdrop" data-orders-object-day-close="1">
        <section class="orders-object-day-modal" role="dialog" aria-modal="true" aria-label="Edycja czynności dnia">
          <div class="orders-object-day-head">
            <div>
              <strong>${escapeHtml(formatDatePl(`${day}T12:00:00.000Z`))}</strong>
              <span>Edytuj czynności jednorazowe i reguły cykliczności tego dnia.</span>
            </div>
            <button type="button" data-orders-object-day-close="1" aria-label="Zamknij">×</button>
          </div>
  
          <div class="orders-object-day-add">
            <select id="ordersObjectDayZone" aria-label="Strefa">${ordersObjectPlanZoneOptionsHtml(usableZones, defaultZone, { includeAll: true })}</select>
            <input id="ordersObjectDayTaskName" type="text" autocomplete="off" placeholder="Czynność do wykonania w tej strefie" />
            <select id="ordersObjectDayTaskMode" aria-label="Typ czynności">
              <option value="once">Jednorazowe</option>
              <option value="repeat">Cykliczne</option>
            </select>
            <select id="ordersObjectDayTaskCadence" aria-label="Częstotliwość" disabled>${ordersObjectPlanCadenceOptionsHtml('Codziennie')}</select>
            <button id="ordersObjectDayTaskAdd" type="button">Dodaj</button>
          </div>
  
          <div class="orders-object-day-list">
            ${
              dayTasks.length
                ? dayTasks
                    .map(
                      (task) => `
                        <div class="orders-object-day-row" data-orders-object-day-task="${escapeHtml(task.id)}">
                          <select data-orders-object-day-task-zone="${escapeHtml(task.id)}" aria-label="Strefa">${ordersObjectPlanZoneOptionsHtml(usableZones, task.zoneKey, { includeAll: true })}</select>
                          <input data-orders-object-day-task-name="${escapeHtml(task.id)}" type="text" value="${escapeHtml(task.name)}" aria-label="Nazwa czynności" />
                          <select data-orders-object-day-task-mode="${escapeHtml(task.id)}" aria-label="Typ czynności">
                            <option value="once"${task.mode === 'once' ? ' selected' : ''}>Jednorazowe</option>
                            <option value="repeat"${task.mode !== 'once' ? ' selected' : ''}>Cykliczne</option>
                          </select>
                          <select data-orders-object-day-task-cadence="${escapeHtml(task.id)}" aria-label="Częstotliwość"${task.mode === 'once' ? ' disabled' : ''}>${ordersObjectPlanCadenceOptionsHtml(task.cadence || 'Codziennie')}</select>
                          <button type="button" data-orders-remove-object-task="${escapeHtml(task.id)}">Usuń</button>
                        </div>
                      `,
                    )
                    .join('')
                : '<div class="orders-object-task-list-empty">Brak czynności w tym dniu. Dodaj pierwszą pozycję powyżej.</div>'
            }
          </div>
        </section>
      </div>
    `
  }
  
  function ordersMoveObjectPlanTaskDate(taskId = '', day = '') {
    const order = ordersFindTimelineOrder(appState.ordersEditingId)
    const id = String(taskId ?? '').trim()
    const targetDay = ordersNormalizeDateField(day, '')
    if (!order || !id || !targetDay) {
      return
    }
    const tasks = ordersObjectPlanTasks(order).map((task) =>
      String(task.id ?? '').trim() === id
        ? {
            ...task,
            dateYmd: targetDay,
            dueDate: targetDay,
            date: targetDay,
          }
        : task,
    )
    ordersSetObjectPlanTasks(order, tasks)
    ordersRenderObjectPlan(order)
    ordersRenderSchedulePreview(order)
  }
  
  function ordersMoveObjectPlanCalendarMonth(offset = 0) {
    const order = ordersFindTimelineOrder(appState.ordersEditingId) || {}
    const current = calendarDateFromYmd(ordersObjectPlanCalendarMonth(order))
    current.setMonth(current.getMonth() + Number(offset || 0))
    appState.ordersObjectPlanCalendarMonth = calendarMonthStart(calendarDateToYmd(current))
    ordersRenderObjectPlan(order)
  }
  
  function ordersRefreshObjectPlanScheduleWindow(order = {}, options = {}) {
    if (!order || typeof order !== 'object') {
      return
    }
    if (options.syncMonth) {
      appState.ordersObjectPlanCalendarMonth = calendarMonthStart(order?.dateYmd || todayYmd())
    }
    const openedDay = ordersNormalizeDateField(appState.ordersObjectPlanDayEditorDate, '')
    if (openedDay && !ordersObjectPlanDayIsActive(order, openedDay)) {
      appState.ordersObjectPlanDayEditorDate = ''
    }
    ordersRenderObjectPlan(order)
  }
  
  function ordersRenderObjectPlan(order = {}) {
    const panel = document.getElementById('ordersObjectPlanPanel')
    if (!panel) {
      return
    }
    const zones = ordersObjectPlanZonesForOrder(order)
    if (!appState.ordersObjectPlanCalendarMonth) {
      appState.ordersObjectPlanCalendarMonth = calendarMonthStart(order?.dateYmd || todayYmd())
    }
    if (!zones.length) {
      appState.ordersObjectPlanZoneKey = ''
      appState.ordersObjectPlanSelectedZoneKeys = []
      appState.ordersObjectPlanDayEditorDate = ''
      appState.ordersObjectPlanZoneWindowOpen = false
      appState.ordersObjectPlanTaskWindowOpen = false
      panel.innerHTML = '<div class="orders-object-zone-empty">Po wyborze klienta zobaczysz tu kalendarz czynności i strefy obiektu.</div>'
      return
    }
    if (!zones.some((zone) => zone.key === appState.ordersObjectPlanZoneKey)) {
      appState.ordersObjectPlanZoneKey = zones[0].key
    }
    panel.innerHTML = `
      ${ordersObjectPlanCalendarHtml(order, zones)}
      ${ordersObjectPlanDayEditorHtml(order, zones)}
    `
  }
  
  function ordersRenderSubtasksAndSupplies(order = {}) {
    const taskRows = document.getElementById('ordersSubtaskRows')
    const supplyRows = document.getElementById('ordersSupplyRows')
    if (taskRows) {
      taskRows.innerHTML = ordersSubtaskRowsHtml(order)
    }
    if (supplyRows) {
      supplyRows.innerHTML = ordersSupplyRowsHtml(order)
    }
  }
  
  function ordersSetOrderSupplies(order = {}, supplies = []) {
    const rows = Array.isArray(supplies) ? supplies : []
    order.supplies = rows
    order.itemsToTake = rows
    order.suppliesForWorkers = rows
    order.equipmentToTake = rows.filter((item) => ordersSupplyKind(item.kind) === 'equipment')
    order.equipmentItems = order.equipmentToTake
    order.chemicalsToTake = rows.filter((item) => ordersSupplyKind(item.kind) === 'chemical')
      order.chemicalItems = order.chemicalsToTake
  }

  function ordersEnsureOrderNameField() {
    const editorRoot = document.getElementById('ordersEditorPanel')
    const hiddenFields = editorRoot?.querySelector?.('.orders-hidden-fields')
    const visibleNameField = editorRoot?.querySelector?.('.orders-order-name')
    let hiddenNameInput = document.getElementById('ordersEditName')

    if (visibleNameField instanceof HTMLElement) {
      visibleNameField.remove()
    }

    if (hiddenNameInput instanceof HTMLInputElement) {
      hiddenNameInput.type = 'hidden'
      return hiddenNameInput
    }

    if (!(hiddenFields instanceof HTMLElement)) {
      return null
    }

    hiddenNameInput = document.createElement('input')
    hiddenNameInput.id = 'ordersEditName'
    hiddenNameInput.type = 'hidden'
    hiddenFields.prepend(hiddenNameInput)
    return hiddenNameInput
  }
  function ordersAddSubtaskToCurrentOrder() {
    const order = ordersFindTimelineOrder(appState.ordersEditingId)
    const input = document.getElementById('ordersSubtaskName')
    const name = ordersListEntryText(input instanceof HTMLInputElement ? input.value : '')
    if (!order || !name) {
      return
    }
    const tasks = ordersOrderSubtasks(order)
    if (!tasks.some((task) => normalizeSearchText(task.name) === normalizeSearchText(name))) {
      tasks.push({
        id: ordersListItemId('task'),
        name,
        taskName: name,
        completed: false,
      })
    }
    order.tasks = tasks
    order.subtasks = tasks
    order.taskName = tasks[0]?.name || ''
    if (input instanceof HTMLInputElement) {
      input.value = ''
      input.focus()
    }
    ordersRenderSubtasksAndSupplies(order)
  }
  
  function ordersRemoveSubtaskFromCurrentOrder(index) {
    const order = ordersFindTimelineOrder(appState.ordersEditingId)
    const removeIndex = Number(index)
    const tasks = ordersOrderSubtasks(order)
    if (!order || !Number.isInteger(removeIndex) || removeIndex < 0 || removeIndex >= tasks.length) {
      return
    }
    order.tasks = tasks.filter((_, itemIndex) => itemIndex !== removeIndex)
    order.subtasks = order.tasks
    order.taskName = order.tasks[0]?.name || ''
    ordersRenderSubtasksAndSupplies(order)
  }
  
  function ordersAddSupplyToCurrentOrder() {
    const order = ordersFindTimelineOrder(appState.ordersEditingId)
    const input = document.getElementById('ordersSupplyName')
    const qrInput = document.getElementById('ordersSupplyQr')
    const kind = ordersReadInputValue('ordersSupplyKind') || 'equipment'
    const name = ordersListEntryText(input instanceof HTMLInputElement ? input.value : '')
    const qrCode = ordersListEntryText(qrInput instanceof HTMLInputElement ? qrInput.value : '')
    if (!order || !name) {
      return
    }
    const supplies = ordersOrderSupplies(order)
    const key = `${ordersSupplyKind(kind)}:${normalizeSearchText(name)}:${normalizeSearchText(qrCode)}`
    if (!supplies.some((item) => `${ordersSupplyKind(item.kind)}:${normalizeSearchText(item.name)}:${normalizeSearchText(item.qrCode)}` === key)) {
      supplies.push({
        id: ordersListItemId('supply'),
        kind: ordersSupplyKind(kind),
        name,
        qrCode,
      })
    }
    ordersSetOrderSupplies(order, supplies)
    if (input instanceof HTMLInputElement) {
      input.value = ''
      input.focus()
    }
    if (qrInput instanceof HTMLInputElement) {
      qrInput.value = ''
    }
    ordersRenderSubtasksAndSupplies(order)
  }
  
  function ordersRemoveSupplyFromCurrentOrder(index) {
    const order = ordersFindTimelineOrder(appState.ordersEditingId)
    const removeIndex = Number(index)
    const supplies = ordersOrderSupplies(order)
    if (!order || !Number.isInteger(removeIndex) || removeIndex < 0 || removeIndex >= supplies.length) {
      return
    }
    ordersSetOrderSupplies(order, supplies.filter((_, itemIndex) => itemIndex !== removeIndex))
    ordersRenderSubtasksAndSupplies(order)
  }
  
  function ordersAddObjectPlanTaskToCurrentOrder() {
    const order = ordersFindTimelineOrder(appState.ordersEditingId)
    const zones = order ? ordersObjectPlanZonesForOrder(order) : []
    const selectedZoneKey = String(ordersReadInputValue('ordersObjectTaskZone') || appState.ordersObjectPlanZoneKey || '').trim()
    const zone = ordersObjectPlanZoneForKey(zones, selectedZoneKey)
    const input = document.getElementById('ordersObjectTaskName')
    const name = ordersListEntryText(input instanceof HTMLInputElement ? input.value : '')
    if (!order || !zone || !name) {
      showTransientNotice('Wybierz strefę i wpisz czynność.', 'error')
      return
    }
    const mode = ordersReadInputValue('ordersObjectTaskMode') === 'once' ? 'once' : 'repeat'
    const tasks = ordersObjectPlanTasks(order)
    tasks.push({
      id: ordersListItemId('object-task'),
      zoneKey: zone.key,
      zoneLabel: zone.label,
      name,
      taskName: name,
      mode,
      cadence: mode === 'repeat' ? ordersReadInputValue('ordersObjectTaskCadence') || 'Codziennie' : '',
      dateYmd: ordersNormalizeDateField(ordersReadInputValue('ordersObjectTaskDate'), order.dateYmd || todayYmd()),
      dueDate: ordersNormalizeDateField(ordersReadInputValue('ordersObjectTaskDate'), order.dateYmd || todayYmd()),
    })
    ordersSetObjectPlanTasks(order, tasks)
    appState.ordersObjectPlanTaskWindowOpen = false
    ordersRenderObjectPlan(order)
  }
  
  function ordersRemoveObjectPlanTaskFromCurrentOrder(taskId = '') {
    const order = ordersFindTimelineOrder(appState.ordersEditingId)
    const id = String(taskId ?? '').trim()
    if (!order || !id) {
      return
    }
    ordersSetObjectPlanTasks(
      order,
      ordersObjectPlanTasks(order).filter((task) => String(task.id ?? '').trim() !== id),
    )
    ordersRenderObjectPlan(order)
  }
  
  function ordersAddObjectPlanDayTaskToCurrentOrder() {
    const order = ordersFindTimelineOrder(appState.ordersEditingId)
    const day = ordersNormalizeDateField(appState.ordersObjectPlanDayEditorDate, '')
    const zones = order ? ordersObjectPlanZonesForOrder(order) : []
    const zoneKey = String(ordersReadInputValue('ordersObjectDayZone') || '').trim()
    const zone = ordersObjectPlanZoneForKey(zones, zoneKey)
    const name = ordersListEntryText(ordersReadInputValue('ordersObjectDayTaskName'))
    if (!order || !day || !zone || !name) {
      showTransientNotice('Wybierz strefę i wpisz czynność.', 'error')
      return
    }
    const mode = ordersReadInputValue('ordersObjectDayTaskMode') === 'repeat' ? 'repeat' : 'once'
    const tasks = ordersObjectPlanTasks(order)
    tasks.push({
      id: ordersListItemId('object-task'),
      zoneKey: zone.key,
      zoneLabel: zone.label,
      name,
      taskName: name,
      mode,
      cadence: mode === 'repeat' ? ordersReadInputValue('ordersObjectDayTaskCadence') || 'Codziennie' : '',
      dateYmd: day,
      dueDate: day,
      date: day,
    })
    ordersSetObjectPlanTasks(order, tasks)
    ordersRenderObjectPlan(order)
  }
  
  function ordersUpdateObjectPlanDayTaskFromControl(target) {
    const order = ordersFindTimelineOrder(appState.ordersEditingId)
    if (!order || !target) {
      return
    }
    const day = ordersNormalizeDateField(appState.ordersObjectPlanDayEditorDate, order.dateYmd || todayYmd())
    const zones = ordersObjectPlanZonesForOrder(order)
    const zoneByKey = new Map(zones.map((zone) => [zone.key, zone]))
    zoneByKey.set(ORDERS_OBJECT_ALL_ZONES_KEY, ordersObjectPlanAllZonesOption())
    const id =
      target.getAttribute?.('data-orders-object-day-task-name') ||
      target.getAttribute?.('data-orders-object-day-task-zone') ||
      target.getAttribute?.('data-orders-object-day-task-mode') ||
      target.getAttribute?.('data-orders-object-day-task-cadence') ||
      ''
    if (!id) {
      return
    }
    const tasks = ordersObjectPlanTasks(order).map((task) => {
      if (String(task.id ?? '').trim() !== id) {
        return task
      }
      const next = { ...task, dateYmd: task.dateYmd || day, dueDate: task.dueDate || day, date: task.date || day }
      if (target.hasAttribute?.('data-orders-object-day-task-name')) {
        const name = ordersListEntryText(target.value)
        if (name) {
          next.name = name
          next.taskName = name
        }
      }
      if (target.hasAttribute?.('data-orders-object-day-task-zone')) {
        const zone = zoneByKey.get(String(target.value ?? '').trim())
        if (zone) {
          next.zoneKey = zone.key
          next.zoneLabel = zone.label
        }
      }
      if (target.hasAttribute?.('data-orders-object-day-task-mode')) {
        next.mode = target.value === 'repeat' ? 'repeat' : 'once'
        if (next.mode === 'once') {
          next.cadence = ''
          next.dateYmd = day
          next.dueDate = day
          next.date = day
        } else {
          next.cadence = next.cadence || 'Codziennie'
          next.dateYmd = next.dateYmd || day
        }
      }
      if (target.hasAttribute?.('data-orders-object-day-task-cadence')) {
        next.mode = 'repeat'
        next.cadence = String(target.value ?? '').trim() || 'Codziennie'
        next.dateYmd = next.dateYmd || day
      }
      return next
    })
    ordersSetObjectPlanTasks(order, tasks)
    ordersRenderObjectPlan(order)
  }
  
  function ordersReadEditorSubtasks(order = {}) {
    const tasks = ordersOrderSubtasks(order)
    const pending = ordersListEntryText(ordersReadInputValue('ordersSubtaskName'))
    if (pending && !tasks.some((task) => normalizeSearchText(task.name) === normalizeSearchText(pending))) {
      tasks.push({
        id: ordersListItemId('task'),
        name: pending,
        taskName: pending,
        completed: false,
      })
    }
    return tasks
  }
  
  function ordersReadEditorSupplies(order = {}) {
    const supplies = ordersOrderSupplies(order)
    const pending = ordersListEntryText(ordersReadInputValue('ordersSupplyName'))
    const pendingQrCode = ordersListEntryText(ordersReadInputValue('ordersSupplyQr'))
    const kind = ordersReadInputValue('ordersSupplyKind') || 'equipment'
    const key = `${ordersSupplyKind(kind)}:${normalizeSearchText(pending)}:${normalizeSearchText(pendingQrCode)}`
    if (pending && !supplies.some((item) => `${ordersSupplyKind(item.kind)}:${normalizeSearchText(item.name)}:${normalizeSearchText(item.qrCode)}` === key)) {
      supplies.push({
        id: ordersListItemId('supply'),
        kind: ordersSupplyKind(kind),
        name: pending,
        qrCode: pendingQrCode,
      })
    }
    return supplies
  }
  
  function ordersEscapeRegExp(value = '') {
    return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  
  function ordersMarkedJsonStart(marker = '') {
    return `<!-- ${String(marker ?? '').trim()}:START -->`
  }
  
  function ordersMarkedJsonEnd(marker = '') {
    return `<!-- ${String(marker ?? '').trim()}:END -->`
  }
  
  function ordersWriteMarkedJsonBlock(currentText = '', marker = '', payload = {}) {
    const raw = String(currentText ?? '').trim()
    const cleanMarker = String(marker ?? '').trim()
    if (!cleanMarker) {
      return raw
    }
    const start = ordersMarkedJsonStart(cleanMarker)
    const end = ordersMarkedJsonEnd(cleanMarker)
    const block = `${start}\n${JSON.stringify(payload)}\n${end}`
    const pattern = new RegExp(`${ordersEscapeRegExp(start)}[\\s\\S]*?${ordersEscapeRegExp(end)}`, 'm')
    if (pattern.test(raw)) {
      return raw.replace(pattern, block).trim()
    }
    return [raw, block].filter(Boolean).join('\n\n').trim()
  }
  
  function ordersClientObjectDataSchedule(order = {}) {
    const mode = String(order.scheduleMode ?? '').trim() || (String(order.type ?? '').trim() === 'cyclic' ? 'repeat' : 'once')
    return {
      mode,
      dateStart: ordersNormalizeDateField(order.dateYmd, ''),
      dateStop:
        mode === 'repeat'
          ? ordersRepeatEndDateForOrder(order)
          : ordersNormalizeDateField(order.endDateYmd ?? order.validUntil, ''),
      accessStartTime: ordersNormalizeTimeField(order.accessStartTime ?? order.startTime, ''),
      accessEndTime: ordersNormalizeTimeField(order.accessEndTime ?? order.endTime, ''),
      accessWindows: [],
      requiredWorkMinutes: Math.max(0, Number(order.requiredWorkMinutes ?? order.serviceWorkMinutes ?? order.standardWorkMinutes) || 0),
      requiredPeople: Math.max(1, Number(order.requiredPeople ?? order.requiredWorkers ?? order.workerSlots) || 1),
      repeatPreset: String(order.repeatPreset ?? '').trim(),
      repeatEvery: Math.max(1, Number(order.repeatEvery) || 1),
      repeatUnit: String(order.repeatUnit ?? '').trim(),
      repeatWeekdays: Array.isArray(order.repeatWeekdays) ? order.repeatWeekdays : [],
      weeklyScheduleRules: ordersWeeklyPatternSources(order),
      workAllocations: Array.isArray(order.workAllocations) ? order.workAllocations : Array.isArray(order.workerAllocations) ? order.workerAllocations : [],
    }
  }
  
  function ordersClientObjectDataPayload(order = {}, client = {}, supplies = [], objectPlanTasks = []) {
    const nowIso = new Date().toISOString()
    const clientId = ordersClientId(client) || ordersFirstClientText(order.clientId)
    const zones = ordersObjectPlanZonesForOrder(order).map((zone) => ({
      key: String(zone.key ?? '').trim(),
      name: String(zone.label ?? '').trim(),
      location: String(zone.location ?? '').trim(),
      qrCode: String(zone.qr ?? '').trim(),
    }))
    const normalizedTasks = objectPlanTasks.map((task) => ({
      id: String(task.id ?? '').trim(),
      zoneKey: String(task.zoneKey ?? '').trim(),
      zoneName: String(task.zoneLabel ?? '').trim(),
      name: String(task.name ?? task.taskName ?? '').trim(),
      type: String(task.mode ?? '').trim() === 'once' ? 'once' : 'repeat',
      frequency: String(task.cadence ?? '').trim(),
      date: ordersNormalizeDateField(task.dateYmd ?? task.dueDate ?? task.date, ''),
    }))
    const normalizedSupplies = supplies.map((item) => ({
      id: String(item.id ?? '').trim(),
      kind: ordersSupplyKind(item.kind),
      type: ordersSupplyKindLabel(item.kind),
      name: String(item.name ?? '').trim(),
      qrCode: ordersFirstClientText(item.qrCode, item.qr, item.code, item.qrNumber),
      quantity: ordersFirstClientText(item.quantity, item.amount, item.qty),
      note: ordersFirstClientText(item.note, item.description),
    }))
    return {
      plan: {
        version: 1,
        source: 'portal-order-editor',
        updatedAt: nowIso,
        clientId,
        clientName: ordersClientDisplayName(client) || ordersFirstClientText(order.clientName, order.clientLabel),
        orderId: String(order.id ?? '').trim(),
        orderTitle: String(order.title ?? '').trim(),
        schedule: ordersClientObjectDataSchedule(order),
        zones,
        tasks: normalizedTasks,
      },
      equipment: {
        version: 1,
        source: 'portal-order-editor',
        updatedAt: nowIso,
        clientId,
        orderId: String(order.id ?? '').trim(),
        items: normalizedSupplies.filter((item) => item.kind !== 'chemical'),
      },
      chemistry: {
        version: 1,
        source: 'portal-order-editor',
        updatedAt: nowIso,
        clientId,
        orderId: String(order.id ?? '').trim(),
        items: normalizedSupplies.filter((item) => item.kind === 'chemical'),
      },
    }
  }
  
  async function ordersSyncObjectDataToClient(order = {}, client = {}, supplies = [], objectPlanTasks = []) {
    const orgId = String(appState.session?.orgId ?? '').trim()
    const clientId = ordersClientId(client) || ordersFirstClientText(order.clientId)
    if (!orgId || !clientId) {
      throw new Error('Brak organizacji albo klienta do zapisu danych obiektu.')
    }
    const currentClient = ordersFindClientBySelection(clientId) || client || {}
    const payloads = ordersClientObjectDataPayload(order, currentClient, supplies, objectPlanTasks)
    const currentClientInfo = String(currentClient.clientInfo ?? currentClient.info ?? currentClient.informacje ?? '')
    const currentEquipment = String(currentClient.equipment ?? currentClient.sprzet ?? '')
    const currentChemistry = String(currentClient.chemistry ?? currentClient.chemia ?? '')
    const updatePayload = {
      clientInfo: ordersWriteMarkedJsonBlock(
        currentClientInfo,
        ORDERS_CLIENT_OBJECT_PLAN_MARKER,
        payloads.plan,
      ),
      equipment: ordersWriteMarkedJsonBlock(
        currentEquipment,
        ORDERS_CLIENT_OBJECT_EQUIPMENT_MARKER,
        payloads.equipment,
      ),
      chemistry: ordersWriteMarkedJsonBlock(
        currentChemistry,
        ORDERS_CLIENT_OBJECT_CHEMISTRY_MARKER,
        payloads.chemistry,
      ),
    }
    const updatedClient = await updateClient(orgId, clientId, updatePayload)
    const index = appState.clients.findIndex((item) => String(item.id ?? item.clientId ?? '').trim() === clientId)
    if (index >= 0) {
      appState.clients[index] = {
        ...appState.clients[index],
        ...updatedClient,
        info: updatedClient.clientInfo ?? updatePayload.clientInfo,
        informacje: updatedClient.clientInfo ?? updatePayload.clientInfo,
        sprzet: updatedClient.equipment ?? updatePayload.equipment,
        chemia: updatedClient.chemistry ?? updatePayload.chemistry,
      }
    }
    return updatedClient
  }
  
  function ordersExecutionAddressFromValue(value = {}) {
    if (typeof value === 'string') {
      return ordersFirstClientText(value)
    }
    if (!value || typeof value !== 'object') {
      return ''
    }
    const direct = ordersFirstClientText(
      value.buildingAddress,
      value.objectAddress,
      value.siteAddress,
      value.serviceAddress,
      value.address,
      value.adres,
      value.fullAddress,
      value.executionAddress,
    )
    const street = ordersFirstClientText(value.street, value.ulica, direct)
    const cityLine = [
      ordersFirstClientText(value.postCode, value.postalCode, value.zip, value.kodPocztowy),
      ordersFirstClientText(value.city, value.miasto),
    ]
      .filter(Boolean)
      .join(' ')
    return [street, cityLine].filter(Boolean).join(', ')
  }
  
  function ordersBuildingAddressFromValue(value = {}) {
    const explicit = ordersExecutionAddressFromValue(value)
    if (explicit) {
      return explicit
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return ''
    }
    return ordersFirstClientText(
      value.building,
      value.budynek,
      value.buildingName,
      value.objectName,
      value.siteName,
      value.objectLocation,
      value.location,
      value.lokalizacja,
    )
  }
  
  function ordersValueLooksLikeZoneLocation(value = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false
    }
    const zoneName = ordersFirstClientText(
      value.zone,
      value.zoneName,
      value.strefa,
      value.nazwaStrefy,
      value.function,
      value.room,
      value.pomieszczenie,
      value.area,
      value.areaName,
    )
    if (zoneName) {
      return true
    }
    const label = ordersFirstClientText(value.name, value.label, value.title)
    const kind = normalizeSearchText(ordersFirstClientText(value.kind, value.type, value.category))
    return Boolean(label && ['zone', 'strefa', 'room', 'pomieszczenie', 'area', 'obszar'].some((part) => kind.includes(part)))
  }
  
  function ordersLooksLikeExecutionAddress(value = '') {
    const raw = String(value ?? '').replace(/\s+/g, ' ').trim()
    if (raw.length < 8) {
      return false
    }
    if (/^(aneks|biuro|ciąg|ciag|drzwi|inne|magazyn|maszyna|pomieszczenie|recepcja|strefa|szatnia|wc)\b/i.test(raw)) {
      return false
    }
    if (/\b\d{2}-\d{3}\b/.test(raw)) {
      return true
    }
    if (/\b(ul\.?|ulica|aleja|al\.?|osiedle|os\.?|plac|pl\.?|rynek)\b/i.test(raw)) {
      return true
    }
    return /\d/.test(raw) && raw.split(/\s+/).length >= 2
  }
  
  function ordersShortAddressLabel(value = '', maxLength = 78) {
    const raw = String(value ?? '').replace(/\s+/g, ' ').trim()
    if (raw.length <= maxLength) {
      return raw
    }
    return `${raw.slice(0, Math.max(8, maxLength - 3)).trim()}...`
  }
  
  function ordersAddClientExecutionAddress(target, value = '', meta = '') {
    const label = ordersExecutionAddressFromValue(value)
    if (!label || label === '-' || !ordersLooksLikeExecutionAddress(label)) {
      return
    }
    const key = ordersLocationSuggestionKey(label)
    if (!key || target.some((item) => ordersLocationSuggestionKey(item.label) === key)) {
      return
    }
    target.push({
      label,
      meta: String(meta ?? '').replace(/\s+/g, ' ').trim(),
    })
  }
  
  function ordersClientAddressMemoryKey() {
    const orgId = String(appState.session?.activeOrgId ?? appState.session?.orgId ?? '').trim()
    return orgId ? `${ORDERS_CLIENT_ADDRESS_MEMORY_PREFIX}:${orgId}` : ''
  }
  
  function ordersClientAddressMemoryIdentity(client = {}) {
    return normalizeSearchText(ordersClientId(client) || ordersClientDisplayName(client))
  }
  
  function ordersReadClientAddressMemory() {
    try {
      const storageKey = ordersClientAddressMemoryKey()
      if (!storageKey) {
        return {}
      }
      const raw = window.localStorage?.getItem(storageKey) || '{}'
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  
  function ordersWriteClientAddressMemory(memory = {}) {
    try {
      const storageKey = ordersClientAddressMemoryKey()
      if (!storageKey) {
        return
      }
      window.localStorage?.setItem(storageKey, JSON.stringify(memory))
    } catch {
      // Local address memory is a convenience only; order save still works without it.
    }
  }
  
  function ordersStoredClientExecutionAddresses(client = {}) {
    const key = ordersClientAddressMemoryIdentity(client)
    if (!key) {
      return []
    }
    const memory = ordersReadClientAddressMemory()
    const rows = Array.isArray(memory[key]) ? memory[key] : []
    return rows
      .map((row) => ({
        label: ordersExecutionAddressFromValue(row?.label ?? row),
        meta: ordersFirstClientText(row?.meta, 'Zapamiętany adres'),
      }))
      .filter((row) => row.label)
  }
  
  function ordersStoreClientExecutionAddress(client = {}, address = '') {
    const key = ordersClientAddressMemoryIdentity(client)
    const label = ordersExecutionAddressFromValue(address)
    if (!key || !label) {
      return false
    }
    const memory = ordersReadClientAddressMemory()
    const rows = Array.isArray(memory[key]) ? memory[key] : []
    const exists = rows.some((row) => ordersLocationSuggestionKey(row?.label ?? row) === ordersLocationSuggestionKey(label))
    if (exists) {
      return false
    }
    memory[key] = [
      ...rows,
      {
        label,
        meta: 'Zapamiętany adres',
        createdAt: new Date().toISOString(),
      },
    ]
    ordersWriteClientAddressMemory(memory)
    return true
  }
  
  function ordersZoneMatchesClient(zone = {}, client = {}) {
    const clientId = normalizeSearchText(ordersClientId(client))
    const clientName = normalizeSearchText(ordersClientDisplayName(client))
    const zoneClientId = normalizeSearchText(zone?.clientId ?? zone?.client ?? zone?.objectId ?? '')
    const zoneClientName = normalizeSearchText(zone?.clientName ?? zone?.clientLabel ?? zone?.objectName ?? '')
    return Boolean(
      (clientId && zoneClientId && zoneClientId === clientId) ||
        (clientName && zoneClientName && zoneClientName === clientName) ||
        (clientName && zoneClientId && zoneClientId === clientName),
    )
  }
  
  function ordersClientExecutionAddresses(client = {}) {
    if (!client) {
      return []
    }
    const rows = []
    const clientData = ordersClientFormData(client)
    ordersAddClientExecutionAddress(rows, ordersClientAddressLabel(clientData), 'Adres klienta')
  
    ;[
      client?.addresses,
      client?.adresy,
      client?.executionAddresses,
      client?.serviceAddresses,
      client?.sites,
      client?.buildings,
      client?.budynki,
      client?.objects,
      client?.obiekty,
    ].forEach((source) => {
      if (!Array.isArray(source)) {
        return
      }
      source.forEach((item) => {
        if (ordersValueLooksLikeZoneLocation(item)) {
          return
        }
        const meta = ordersFirstClientText(item?.buildingName, item?.objectName, item?.siteName, item?.name, item?.label, 'Adres klienta')
        ordersAddClientExecutionAddress(rows, item, meta)
      })
    })
  
    ;[client?.locations, client?.lokalizacje].forEach((source) => {
      if (!Array.isArray(source)) {
        return
      }
      source.forEach((item) => {
        ordersAddClientExecutionAddress(rows, ordersBuildingAddressFromValue(item), '')
      })
    })
  
    ;(Array.isArray(appState.zones) ? appState.zones : [])
      .filter((zone) => ordersZoneMatchesClient(zone, client))
      .forEach((zone) => {
        ordersAddClientExecutionAddress(rows, ordersBuildingAddressFromValue(zone), '')
      })
  
    ordersStoredClientExecutionAddresses(client).forEach((row) => {
      ordersAddClientExecutionAddress(rows, row.label, row.meta)
    })
  
    return rows
  }
  
  function ordersClientAddressOptionsHtml(client = null, selectedLabel = '') {
    const selected = String(selectedLabel ?? '').replace(/\s+/g, ' ').trim()
    const rows = client ? ordersClientExecutionAddresses(client) : []
    const defaultAddress = rows[0]?.label || ''
    const selectedKey = ordersLocationSuggestionKey(selected)
    const selectedIsDefault = selectedKey && ordersLocationSuggestionKey(defaultAddress) === selectedKey
    const hasSelected = selectedKey && rows.slice(1).some((row) => ordersLocationSuggestionKey(row.label) === selectedKey)
    const defaultText = client
      ? defaultAddress
        ? `Adres domyślny: ${ordersShortAddressLabel(defaultAddress, 64)}`
        : 'Brak adresu klienta - wpisz ręcznie'
      : 'Najpierw wybierz klienta'
  
    return [
      `<option value=""${!selected || selectedIsDefault ? ' selected' : ''}>${escapeHtml(defaultText)}</option>`,
      ...rows.slice(1).map((row) => {
        const selectedAttr = selectedKey && ordersLocationSuggestionKey(row.label) === selectedKey ? ' selected' : ''
        const meta = row.meta ? `${row.meta}: ` : ''
        return `<option value="${escapeHtml(row.label)}"${selectedAttr}>${escapeHtml(
          `${meta}${ordersShortAddressLabel(row.label)}`,
        )}</option>`
      }),
      selected && !selectedIsDefault && !hasSelected
        ? `<option value="${escapeHtml(selected)}" selected>Adres wpisany ręcznie: ${escapeHtml(ordersShortAddressLabel(selected))}</option>`
        : '',
    ].join('')
  }
  
  function ordersSyncAddressSelectToLocation(locationValue = '') {
    const select = document.getElementById('ordersEditAddressSelect')
    if (!(select instanceof HTMLSelectElement)) {
      return
    }
    const value = String(locationValue ?? '').replace(/\s+/g, ' ').trim()
    if (!value) {
      select.value = ''
      return
    }
    const valueKey = ordersLocationSuggestionKey(value)
    const matchingOption = [...select.options].find((option) => ordersLocationSuggestionKey(option.value) === valueKey)
    if (matchingOption) {
      select.value = matchingOption.value
      return
    }
    const customOption =
      [...select.options].find((option) => option.getAttribute('data-orders-address-custom') === 'true') ??
      (() => {
        const option = document.createElement('option')
        option.setAttribute('data-orders-address-custom', 'true')
        select.append(option)
        return option
      })()
    customOption.value = value
    customOption.textContent = `Adres wpisany ręcznie: ${ordersShortAddressLabel(value)}`
    select.value = value
  }
  
  function ordersRenderClientAddressSelect(client = null, selectedLabel = '') {
    const select = document.getElementById('ordersEditAddressSelect')
    if (!(select instanceof HTMLSelectElement)) {
      return
    }
    const selected = String(selectedLabel ?? '').replace(/\s+/g, ' ').trim()
    select.innerHTML = ordersClientAddressOptionsHtml(client, selected)
    select.disabled = !client && !selected
    const defaultAddress = client ? ordersClientExecutionAddresses(client)[0]?.label || '' : ''
    const selectedIsDefault = selected && ordersLocationSuggestionKey(defaultAddress) === ordersLocationSuggestionKey(selected)
    ordersSyncAddressSelectToLocation(selectedIsDefault ? '' : selected)
  }

  function ordersEditorDefaultExecutionAddress() {
    const client = ordersFindClientBySelection(ordersReadInputValue('ordersEditClient'))
    return client ? ordersClientExecutionAddresses(client)[0]?.label || '' : ''
  }

  function ordersEditorExecutionAddressLabel() {
    return (
      ordersReadInputValue('ordersEditLocation') ||
      ordersReadInputValue('ordersEditAddressSelect') ||
      ordersEditorDefaultExecutionAddress()
    )
  }
  
  function ordersApplyExecutionAddressSelection(value = '') {
    const address = String(value ?? '').replace(/\s+/g, ' ').trim()
    ordersSetInputValue('ordersEditLocation', address)
    ordersHideLocationSuggestions()
    if (address) {
      ordersSetLocationGeoFields({ mapUrl: ordersGoogleMapsSearchUrl(address) })
      ordersQueueGoogleLocationResolve(address)
      return address
    }
    const client = ordersFindClientBySelection(ordersReadInputValue('ordersEditClient'))
    const data = client ? ordersClientFormData(client) : {}
    ordersSetLocationGeoFields({ mapUrl: ordersGoogleMapsSearchUrl(ordersClientAddressLabel(data)) })
    return ''
  }
  
  function ordersSetClientFieldsFromData(data = {}) {
    ordersSetInputValue('ordersEditClientName', data.clientName || '')
    ordersSetInputValue('ordersEditNip', data.nip || '')
    ordersSetInputValue('ordersEditStreet', data.street || '')
    ordersSetInputValue('ordersEditCity', data.city || '')
    ordersSetInputValue('ordersEditPostCode', data.postCode || '')
    ordersSetInputValue('ordersEditRegion', data.region || '')
    ordersSetInputValue('ordersEditCountry', data.country || '')
    ordersSetInputValue('ordersEditEmail', data.email || '')
    const addressLabel = ordersClientAddressLabel(data)
    if (addressLabel) {
      ordersSetInputValue('ordersEditLocation', '')
      ordersSetLocationGeoFields({
        placeId: '',
        lat: '',
        lng: '',
        mapUrl: ordersGoogleMapsSearchUrl(addressLabel),
      })
    }
  }
  
  function ordersApplySelectedClientToEditor(selectionValue = '') {
    if (ordersIsIndividualClientSelection(selectionValue)) {
      const manualAddress = ordersReadInputValue('ordersEditLocation')
      const data = { clientName: ORDERS_INDIVIDUAL_CLIENT_LABEL, country: 'Polska' }
      ordersSetIndividualClientFieldsVisible(true)
      ordersSetClientFieldsFromData(data)
      ordersRenderClientAddressSelect(null, manualAddress)
      return { client: null, data }
    }
    ordersSetIndividualClientFieldsVisible(false)
    const client = ordersFindClientBySelection(selectionValue)
    if (!client) {
      ordersSetClientFieldsFromData({ clientName: String(selectionValue ?? '').trim() })
      ordersRenderClientAddressSelect(null, ordersReadInputValue('ordersEditLocation'))
      if (!String(selectionValue ?? '').trim()) {
        ordersSetInputValue('ordersEditLocation', '')
        ordersSetLocationGeoFields({ placeId: '', lat: '', lng: '', mapUrl: '' })
        ordersRenderClientAddressSelect(null, '')
      }
      return null
    }
    const data = ordersClientFormData(client)
    ordersSetClientFieldsFromData(data)
    ordersRenderClientAddressSelect(client, ordersReadInputValue('ordersEditLocation'))
    return { client, data }
  }
  
  function ordersClientOptionsHtml(selectedLabel = '') {
    const selected = String(selectedLabel ?? '').trim()
    const selectedIsSpecial = ordersIsIndividualClientSelection(selected) || selected === ORDERS_NEW_CLIENT_VALUE
    const clients = (Array.isArray(appState.clients) ? appState.clients : [])
      .map((client) => ordersClientDisplayName(client))
      .filter(Boolean)
      .filter((value, index, source) => source.findIndex((item) => normalizeSearchText(item) === normalizeSearchText(value)) === index)
      .sort((left, right) => left.localeCompare(right, 'pl', { sensitivity: 'base' }))
  
    const hasSelected = selected && clients.some((client) => normalizeSearchText(client) === normalizeSearchText(selected))
    const selectedOption =
      selected && !hasSelected && !selectedIsSpecial ? `<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)}</option>` : ''
    const individualSelectedAttr = ordersIsIndividualClientSelection(selected) ? ' selected' : ''
    const newSelectedAttr = selected === ORDERS_NEW_CLIENT_VALUE ? ' selected' : ''
  
    return [
      `<option value=""${selected ? '' : ' selected'}>Wybierz klienta</option>`,
      `<option value="${ORDERS_INDIVIDUAL_CLIENT_VALUE}"${individualSelectedAttr}>${escapeHtml(ORDERS_INDIVIDUAL_CLIENT_LABEL)}</option>`,
      `<option value="${ORDERS_NEW_CLIENT_VALUE}"${newSelectedAttr}>+ Dodaj nowego klienta</option>`,
      selectedOption,
      ...clients.map((client) => {
        const selectedAttr = selected && normalizeSearchText(client) === normalizeSearchText(selected) ? ' selected' : ''
        return `<option value="${escapeHtml(client)}"${selectedAttr}>${escapeHtml(client)}</option>`
      }),
    ].join('')
  }
  
  function ordersClientPickerRows() {
    const seen = new Set()
    const clientRows = (Array.isArray(appState.clients) ? appState.clients : [])
      .map((client) => {
        const name = ordersClientDisplayName(client)
        const code = ordersClientId(client)
        const key = normalizeSearchText(name)
        if (!name || seen.has(key)) {
          return null
        }
        seen.add(key)
        return {
          name,
          code: code && normalizeSearchText(code) !== key ? code : '',
          value: name,
        }
      })
      .filter(Boolean)
      .sort((left, right) => left.name.localeCompare(right.name, 'pl', { sensitivity: 'base' }))
    return [
      {
        name: ORDERS_INDIVIDUAL_CLIENT_LABEL,
        code: 'Dane opcjonalne, rekord powstanie przy zapisie',
        value: ORDERS_INDIVIDUAL_CLIENT_VALUE,
      },
      ...clientRows,
    ]
  }
  
  function ordersClientPickerQuery() {
    const input = document.getElementById('ordersClientPickerInput')
    return input instanceof HTMLInputElement ? String(input.value ?? '') : ''
  }
  
  function ordersRenderClientPickerList(queryValue = ordersClientPickerQuery()) {
    const list = document.getElementById('ordersClientPickerList')
    if (!list) {
      return
    }
    const selected = ordersReadInputValue('ordersEditClient')
    const selectedKey = normalizeSearchText(selected)
    const rawQuery = String(queryValue ?? '').trim()
    const rawQueryKey = normalizeSearchText(rawQuery)
    const selectedDisplayKey = ordersIsIndividualClientSelection(selected)
      ? normalizeSearchText(ORDERS_INDIVIDUAL_CLIENT_LABEL)
      : selectedKey
    const query = rawQueryKey === selectedKey || rawQueryKey === selectedDisplayKey ? '' : rawQueryKey
    const rows = ordersClientPickerRows().filter((row) => {
      if (!query) {
        return true
      }
      return normalizeSearchText(row.name).includes(query) || normalizeSearchText(row.code).includes(query)
    })
    const matchedIndex = rows.findIndex((row) => normalizeSearchText(row.value) === selectedKey || normalizeSearchText(row.code) === selectedKey)
    const activeIndex = selected === ORDERS_NEW_CLIENT_VALUE ? -1 : selectedKey ? matchedIndex : 0
    const rowHtml = rows
      .slice(0, 80)
      .map((row, index) => {
        const active = index === activeIndex ? ' is-active' : ''
        return `
          <button class="orders-client-picker-option${active}" type="button" role="option" data-orders-client-pick="${escapeHtml(row.value)}" aria-selected="${active ? 'true' : 'false'}">
            <span>${escapeHtml(row.name)}</span>
            <small>${escapeHtml(row.code || row.name)}</small>
          </button>
        `
      })
      .join('')
    const emptyHtml = rows.length
      ? ''
      : `<div class="orders-client-picker-empty">Brak pasujących klientów.</div>`
    list.innerHTML = `
      ${rowHtml}
      ${emptyHtml}
      <button class="orders-client-picker-option orders-client-picker-option--new" type="button" role="option" data-orders-client-pick="${escapeHtml(ORDERS_NEW_CLIENT_VALUE)}">
        <span>+ Dodaj nowego klienta</span>
        <small>Nowy</small>
      </button>
    `
  }
  
  function ordersSetClientPickerOpen(open = true) {
    const input = document.getElementById('ordersClientPickerInput')
    const list = document.getElementById('ordersClientPickerList')
    if (input) {
      input.setAttribute('aria-expanded', open ? 'true' : 'false')
    }
    if (list) {
      list.hidden = !open
    }
    if (open) {
      ordersRenderClientPickerList()
    }
  }
  
  function ordersHideClientPicker() {
    ordersSetClientPickerOpen(false)
  }
  
  function ordersSyncClientPicker(value = ordersReadInputValue('ordersEditClient')) {
    const input = document.getElementById('ordersClientPickerInput')
    if (!(input instanceof HTMLInputElement)) {
      return
    }
    const raw = String(value ?? '').trim()
    const client = ordersFindClientBySelection(raw)
    const label = client
      ? ordersClientDisplayName(client)
      : ordersIsIndividualClientSelection(raw)
        ? ORDERS_INDIVIDUAL_CLIENT_LABEL
        : raw === ORDERS_NEW_CLIENT_VALUE
          ? ''
          : raw
    input.value = label
    input.title = label
    ordersRenderClientPickerList(label)
  }
  
  function ordersPickClientFromPicker(value = '') {
    const selected = String(value ?? '').trim()
    if (!selected) {
      return
    }
    ordersSetInputValue('ordersEditClient', selected)
    ordersSyncClientPicker(selected)
    ordersHideClientPicker()
    if (ordersIsIndividualClientSelection(selected)) {
      ordersApplySelectedClientToEditor(ORDERS_INDIVIDUAL_CLIENT_VALUE)
      const select = document.getElementById('ordersEditClient')
      if (select instanceof HTMLSelectElement) {
        select.dispatchEvent(new Event('change', { bubbles: true }))
      }
      return
    }
    if (selected === ORDERS_NEW_CLIENT_VALUE) {
      ordersOpenClientCreateFromEditor()
      return
    }
    const select = document.getElementById('ordersEditClient')
    if (select instanceof HTMLSelectElement) {
      select.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }
  
  function ordersRepeatSelectPickerIds() {
    return [...document.querySelectorAll('#ordersEditorPanel [data-orders-repeat-select]')]
      .map((node) => String(node.getAttribute('data-orders-repeat-select') ?? '').trim())
      .filter(Boolean)
  }
  
  function ordersRepeatSelectPickerParts(selectId = '') {
    const id = String(selectId ?? '').trim()
    const select = document.getElementById(id)
    const root = document.querySelector(`#ordersEditorPanel [data-orders-repeat-select="${id}"]`)
    const button = root?.querySelector?.('[data-orders-repeat-select-toggle]')
    const label = root?.querySelector?.('[data-orders-repeat-select-label]')
    const list = root?.querySelector?.('.orders-repeat-select-list')
    return {
      select: select instanceof HTMLSelectElement ? select : null,
      root: root instanceof HTMLElement ? root : null,
      button: button instanceof HTMLButtonElement ? button : null,
      label: label instanceof HTMLElement ? label : null,
      list: list instanceof HTMLElement ? list : null,
    }
  }
  
  function ordersRenderRepeatSelectPicker(selectId = '') {
    const { select, root, button, label, list } = ordersRepeatSelectPickerParts(selectId)
    if (!select || !root || !button || !label || !list) {
      return
    }
    const selectedOption = select.selectedOptions?.[0] || [...select.options].find((option) => option.value === select.value) || select.options[0]
    const selectedLabel = String(selectedOption?.textContent ?? '').trim()
    label.textContent = selectedLabel || '-'
    button.title = selectedLabel || ''
    button.disabled = Boolean(select.disabled)
    root.classList.toggle('is-disabled', Boolean(select.disabled))
    if (select.disabled) {
      button.setAttribute('aria-expanded', 'false')
      list.hidden = true
    }
    list.innerHTML = [...select.options]
      .map((option) => {
        const value = String(option.value ?? '')
        const optionLabel = String(option.textContent ?? '').trim()
        const active = value === select.value ? ' is-active' : ''
        return `
          <button class="orders-repeat-select-option orders-client-picker-option${active}" type="button" role="option" data-orders-repeat-select-id="${escapeHtml(select.id)}" data-orders-repeat-select-pick="${escapeHtml(value)}" aria-selected="${active ? 'true' : 'false'}">
            <span>${escapeHtml(optionLabel)}</span>
          </button>
        `
      })
      .join('')
  }
  
  function ordersSetRepeatSelectPickerOpen(selectId = '', open = true) {
    const targetId = String(selectId ?? '').trim()
    ordersRepeatSelectPickerIds().forEach((id) => {
      const { button, list } = ordersRepeatSelectPickerParts(id)
      const shouldOpen = Boolean(open && id === targetId)
      if (shouldOpen) {
        ordersRenderRepeatSelectPicker(id)
      }
      if (button) {
        button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false')
      }
      if (list) {
        list.hidden = !shouldOpen
      }
    })
  }
  
  function ordersCloseRepeatSelectPickers() {
    ordersSetRepeatSelectPickerOpen('', false)
  }
  
  function ordersSyncRepeatSelectPickers(selectId = '') {
    const id = String(selectId ?? '').trim()
    const ids = id ? [id] : ordersRepeatSelectPickerIds()
    ids.forEach((pickerId) => {
      ordersRenderRepeatSelectPicker(pickerId)
    })
    ordersSyncRepeatIntervalControls()
  }
  
  function ordersRepeatPresetIsFixed(preset = '') {
    return ['day', 'week', 'year'].includes(String(preset ?? '').trim())
  }
  
  function ordersRepeatPresetUsesIntervalControls(preset = '') {
    return ['month', 'interval', 'custom'].includes(String(preset ?? '').trim())
  }
  
  function ordersSyncRepeatIntervalControls() {
    const preset = ordersReadInputValue('ordersEditRepeatPreset')
    const custom = document.querySelector('#ordersEditorPanel .orders-schedule-custom')
    if (!(custom instanceof HTMLElement)) {
      return
    }
    const visible = ordersRepeatPresetUsesIntervalControls(preset)
    const isMonthlyInterval = preset === 'month'
    if (isMonthlyInterval) {
      ordersSetInputValue('ordersEditRepeatUnit', 'month')
    }
    custom.classList.toggle('is-monthly-interval', isMonthlyInterval)
    custom.hidden = !visible
    custom.setAttribute('aria-hidden', visible ? 'false' : 'true')
    const monthSuffix = custom.querySelector('[data-orders-repeat-month-suffix]')
    if (monthSuffix instanceof HTMLElement) {
      monthSuffix.hidden = !isMonthlyInterval
    }
    const unitPicker = custom.querySelector('[data-orders-repeat-select="ordersEditRepeatUnit"]')
    if (unitPicker instanceof HTMLElement) {
      unitPicker.hidden = isMonthlyInterval
      unitPicker.setAttribute('aria-hidden', isMonthlyInterval ? 'true' : 'false')
    }
    custom.querySelectorAll('input, select, button').forEach((node) => {
      if (node instanceof HTMLInputElement || node instanceof HTMLSelectElement || node instanceof HTMLButtonElement) {
        const isUnitControl = node.id === 'ordersEditRepeatUnit' || Boolean(node.closest('[data-orders-repeat-select="ordersEditRepeatUnit"]'))
        node.disabled = !visible || (isMonthlyInterval && isUnitControl)
      }
    })
  }
  
  function ordersRepeatIntervalFromControls(order = {}) {
    const hasRepeatControls = Boolean(document.getElementById('ordersEditRepeatPreset'))
    const mode =
      document.querySelector('#ordersEditorPanel input[name="ordersScheduleMode"]:checked')?.value === 'repeat' ||
      ordersScheduleModeForOrder(order) === 'repeat'
        ? 'repeat'
        : 'once'
    if (!hasRepeatControls && mode === 'repeat') {
      const repeatEvery = Math.max(1, Math.floor(Number(order.repeatEvery) || 1))
      return {
        repeatPreset: repeatEvery === 1 ? 'week' : 'interval',
        repeatEvery,
        repeatUnit: 'week',
      }
    }
    const preset = ordersReadInputValue('ordersEditRepeatPreset') || ordersRepeatPresetFromOrder(order)
    if (preset === 'month') {
      return {
        repeatPreset: 'month',
        repeatEvery: Math.max(1, Math.floor(Number(ordersReadInputValue('ordersEditRepeatEvery')) || Number(order.repeatEvery) || 1)),
        repeatUnit: 'month',
      }
    }
    if (ordersRepeatPresetIsFixed(preset)) {
      return {
        repeatPreset: preset,
        repeatEvery: 1,
        repeatUnit: preset,
      }
    }
    return {
      repeatPreset: preset || 'interval',
      repeatEvery: Math.max(1, Math.floor(Number(ordersReadInputValue('ordersEditRepeatEvery')) || Number(order.repeatEvery) || 1)),
      repeatUnit: ordersReadInputValue('ordersEditRepeatUnit') || order.repeatUnit || 'week',
    }
  }
  
  function ordersRepeatSelectPickerOptions(selectId = '') {
    const id = String(selectId ?? '').trim()
    return [...document.querySelectorAll(`#ordersEditorPanel [data-orders-repeat-select-id="${id}"]`)].filter(
      (node) => node instanceof HTMLElement,
    )
  }
  
  function ordersFocusRepeatSelectPickerOption(selectId = '', fallback = 'selected') {
    const options = ordersRepeatSelectPickerOptions(selectId)
    if (!options.length) {
      return
    }
    const selected = options.find((option) => option.getAttribute('aria-selected') === 'true')
    const target = fallback === 'last' ? options[options.length - 1] : selected || options[0]
    target?.focus()
  }
  
  function ordersPickRepeatSelectOption(selectId = '', value = '') {
    const id = String(selectId ?? '').trim()
    const selectedValue = String(value ?? '')
    const select = document.getElementById(id)
    if (!(select instanceof HTMLSelectElement) || select.disabled) {
      return
    }
    if (![...select.options].some((option) => option.value === selectedValue)) {
      return
    }
    select.value = selectedValue
    ordersSyncRepeatSelectPickers(id)
    ordersSetRepeatSelectPickerOpen(id, false)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  }
  
  function ordersApplyClientDataToOrder(order = {}, data = {}, selection = '') {
    if (!order || typeof order !== 'object') {
      return
    }
    const clientName = data.clientName || String(selection ?? '').trim()
    const defaultAddress = ordersClientAddressLabel(data)
    order.clientId = data.clientId || ''
    order.clientLabel = clientName
    order.clientName = clientName
    order.nip = data.nip || ''
    order.clientNip = data.nip || ''
    order.street = data.street || ''
    order.clientStreet = data.street || ''
    order.city = data.city || ''
    order.clientCity = data.city || ''
    order.postCode = data.postCode || ''
    order.postalCode = data.postCode || ''
    order.clientPostCode = data.postCode || ''
    order.region = data.region || ''
    order.country = data.country || ''
    order.email = data.email || ''
    order.contact = data.contact || ''
    order.addressLabel = ordersReadInputValue('ordersEditLocation') || defaultAddress
    order.executionAddressLabel = ordersReadInputValue('ordersEditLocation')
    order.customAddressLabel = order.executionAddressLabel
    order.mapUrl = ordersReadInputValue('ordersEditLocationMapUrl') || ordersGoogleMapsSearchUrl(order.addressLabel)
    order.googleMapsUrl = order.mapUrl
  }
  
  function ordersOpenClientCreateFromEditor(defaults = {}) {
    appState.ordersClientCreateReturnOrderId = String(appState.ordersEditingId ?? '').trim()
    const select = document.getElementById('ordersEditClient')
    if (select instanceof HTMLSelectElement) {
      select.value = ''
    }
    ordersSyncClientPicker('')
    openClientModal('add', '', defaults)
    window.setTimeout(() => {
      document.getElementById('clNazwa')?.focus()
    }, 0)
  }
  
  function ordersSelectCreatedClientInEditor(payload = {}, orderId = '') {
    const targetOrderId = String(orderId ?? '').trim()
    const client =
      ordersFindClientBySelection(payload?.clientId || payload?.id) ||
      ordersFindClientBySelection(payload?.name) ||
      payload
    const data = ordersClientFormData(client)
    const label = data.clientName || String(payload?.name ?? '').trim()
    const order = ordersFindTimelineOrder(targetOrderId)
    if (order) {
      ordersApplyClientDataToOrder(order, data, label)
    }
    if (appState.currentRoute === 'orders' && appState.ordersEditingId === targetOrderId) {
      renderOrdersView()
      showTransientNotice('Dodano klienta i podpięto go do zlecenia.')
    }
  }
  
  function ordersAddExecutionAddressForCurrentClient() {
    const selectedClient = ordersFindClientBySelection(ordersReadInputValue('ordersEditClient'))
    if (!selectedClient) {
      showTransientNotice('Najpierw wybierz klienta.', 'error')
      return
    }
    const address = ordersReadInputValue('ordersEditLocation')
    if (!address) {
      showTransientNotice('Wpisz adres wykonania zlecenia.', 'error')
      return
    }
    const added = ordersStoreClientExecutionAddress(selectedClient, address)
    ordersRenderClientAddressSelect(selectedClient, address)
    ordersSyncAddressSelectToLocation(address)
    showTransientNotice(added ? 'Adres zapamiętany dla tego klienta.' : 'Ten adres jest już na liście klienta.')
  }
  
  function ordersTimelineToneForType(type = '') {
    const normalized = String(type ?? '').trim()
    if (normalized === 'cyclic') return 'red'
    if (normalized === 'renovation') return 'teal'
    if (normalized === 'windows') return 'yellow'
    if (normalized === 'individual') return 'blue'
    return 'gray'
  }
  
  function ordersNextOrderId() {
    return `fw-order-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }
  
  function ordersDefaultStartTime() {
    const now = new Date()
    const hour = Math.min(Math.max(now.getHours() + 1, 4), 21)
    return `${pad2(hour)}:00`
  }
  
  function ordersDefaultEndTime(startTime = '08:00') {
    const startMinutes = calendarTimelineTimeMinutes(startTime, 8 * 60)
    return calendarMinutesToTime(Math.min(startMinutes + 120, 23 * 60)) || '10:00'
  }
  
  function ordersPrepareTimeInput(input) {
    if (!(input instanceof HTMLInputElement)) {
      return null
    }
    const isTimeInput = input.type === 'time' || input.classList.contains('orders-time-input')
    if (!isTimeInput) {
      return null
    }
    if (input.type === 'time') {
      try {
        input.type = 'text'
      } catch {
        // Keep the field usable if the browser refuses changing the type.
      }
    }
    input.classList.add('orders-time-input')
    input.inputMode = 'numeric'
    input.autocomplete = 'off'
    input.placeholder = 'hh:mm'
    input.readOnly = true
    input.setAttribute('aria-haspopup', 'dialog')
    return input
  }
  
  function ordersEnhanceTimeInputs(root = document) {
    const scope = root && typeof root.querySelectorAll === 'function' ? root : document
    scope.querySelectorAll('input[type="time"], input.orders-time-input').forEach((input) => ordersPrepareTimeInput(input))
  }
  
  function ordersTimeParts(value = '', fallback = '08:00') {
    const normalized = ordersNormalizeTimeField(value, ordersNormalizeTimeField(fallback, '08:00'))
    const [hour = '08', minute = '00'] = normalized.split(':')
    return {
      hour: Math.min(23, Math.max(0, Math.floor(Number(hour) || 0))),
      minute: Math.min(59, Math.max(0, Math.floor(Number(minute) || 0))),
    }
  }
  
  function ordersEnsureTimePicker() {
    let picker = document.getElementById('ordersTimePicker')
    if (picker instanceof HTMLElement) {
      return picker
    }
    picker = document.createElement('div')
    picker.id = 'ordersTimePicker'
    picker.className = 'orders-time-picker'
    picker.hidden = true
    const hours = Array.from({ length: 24 }, (_, value) => value)
    const minutes = Array.from({ length: 60 }, (_, value) => value)
    picker.innerHTML = `
      <div class="orders-time-picker-panel" role="dialog" aria-label="Wybierz godzinę">
        <div class="orders-time-picker-columns">
          <div class="orders-time-picker-column" data-orders-time-hours>
            ${hours.map((value) => `<button type="button" data-orders-time-hour="${value}">${escapeHtml(pad2(value))}</button>`).join('')}
          </div>
          <div class="orders-time-picker-column" data-orders-time-minutes>
            ${minutes.map((value) => `<button type="button" data-orders-time-minute="${value}">${escapeHtml(pad2(value))}</button>`).join('')}
          </div>
        </div>
        <div class="orders-time-picker-actions">
          <button class="orders-time-picker-cancel" type="button" data-orders-time-cancel>Anuluj</button>
          <button class="orders-time-picker-ok" type="button" data-orders-time-ok>OK</button>
        </div>
      </div>
    `
    document.body.append(picker)
    return picker
  }
  
  function ordersSetTimePickerSelection(hour = 0, minute = 0) {
    ordersTimePickerHour = Math.min(23, Math.max(0, Math.floor(Number(hour) || 0)))
    ordersTimePickerMinute = Math.min(59, Math.max(0, Math.floor(Number(minute) || 0)))
    const picker = ordersEnsureTimePicker()
    picker.querySelectorAll('[data-orders-time-hour]').forEach((button) => {
      button.classList.toggle('is-selected', Number(button.getAttribute('data-orders-time-hour')) === ordersTimePickerHour)
    })
    picker.querySelectorAll('[data-orders-time-minute]').forEach((button) => {
      button.classList.toggle('is-selected', Number(button.getAttribute('data-orders-time-minute')) === ordersTimePickerMinute)
    })
    window.requestAnimationFrame(() => {
      picker.querySelector('[data-orders-time-hour].is-selected')?.scrollIntoView?.({ block: 'center' })
      picker.querySelector('[data-orders-time-minute].is-selected')?.scrollIntoView?.({ block: 'center' })
    })
  }
  
  function ordersPositionTimePicker(input) {
    const picker = ordersEnsureTimePicker()
    const rect = input.getBoundingClientRect()
    const margin = 8
    const width = picker.offsetWidth || 172
    const height = picker.offsetHeight || 256
    const left = Math.min(Math.max(margin, rect.left), Math.max(margin, window.innerWidth - width - margin))
    const belowTop = rect.bottom + 4
    const aboveTop = rect.top - height - 4
    const top = belowTop + height + margin <= window.innerHeight ? belowTop : Math.max(margin, aboveTop)
    picker.style.left = `${Math.round(left)}px`
    picker.style.top = `${Math.round(top)}px`
  }
  
  function ordersOpenTimePicker(input) {
    const prepared = ordersPrepareTimeInput(input)
    if (!prepared) {
      return
    }
    ordersCloseRepeatSelectPickers()
    ordersHideLocationSuggestions()
    ordersTimePickerTarget = prepared
    const fallback = prepared.getAttribute('data-orders-time-fallback') || prepared.value || '08:00'
    const parts = ordersTimeParts(prepared.value, fallback)
    const picker = ordersEnsureTimePicker()
    picker.hidden = false
    ordersSetTimePickerSelection(parts.hour, parts.minute)
    ordersPositionTimePicker(prepared)
  }
  
  function ordersCloseTimePicker() {
    const picker = document.getElementById('ordersTimePicker')
    if (picker instanceof HTMLElement) {
      picker.hidden = true
    }
    ordersTimePickerTarget = null
  }
  
  function ordersApplyTimePickerSelection() {
    const input = ordersTimePickerTarget
    if (!(input instanceof HTMLInputElement)) {
      ordersCloseTimePicker()
      return
    }
    input.value = `${pad2(ordersTimePickerHour)}:${pad2(ordersTimePickerMinute)}`
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    ordersCloseTimePicker()
    input.blur()
  }
  
  function ordersCreateDraftOrder(dayKey = todayYmd()) {
    const draftDay = ordersNormalizeDateField(dayKey, todayYmd())
    const startTime = ordersDefaultStartTime()
    const row = ordersServiceBlockBufferRow()
    return {
      id: ordersNextOrderId(),
      row,
      assignedRows: [],
      workerAssignments: [],
      dateYmd: draftDay,
      startTime,
      endDateYmd: draftDay,
      endTime: ordersDefaultEndTime(startTime),
      accessStartTime: startTime,
      accessEndTime: ordersDefaultEndTime(startTime),
      accessWindows: [],
      objectAccessWindows: [],
      accessTimeWindows: [],
      buildingAccessWindows: [],
      requiredWorkMinutes: 120,
      serviceWorkMinutes: 120,
      standardWorkMinutes: 120,
      requiredPeople: 1,
      requiredWorkers: 1,
      workerSlots: 1,
      workAllocations: [],
      validUntil: draftDay,
      nextDate: draftDay,
      title: 'Nowe zlecenie',
      clientId: '',
      clientLabel: '',
      clientName: '',
      clientType: '',
      customerType: '',
      addressLabel: '',
      type: 'individual',
      tone: ordersTimelineToneForType('individual'),
      priority: 'Normalny',
      repeatPreset: 'day',
      repeatEvery: 1,
      repeatUnit: 'day',
      repeatWeekdays: [...ORDERS_DEFAULT_REPEAT_WEEKDAYS],
      advanceDays: 0,
      price: 0,
      description: '',
      coworkers: [],
      tasks: [],
      subtasks: [],
      supplies: [],
      suppliesForWorkers: [],
      equipmentToTake: [],
      equipmentItems: [],
      chemicalsToTake: [],
      chemicalItems: [],
      deviceNotes: [],
      isDraft: true,
      workerComment: '',
      allowExtendedWork: false,
      extendedWorkAllowed: false,
      canExtendWorkTime: false,
      workerCanExtendWorkTime: false,
      overtimeAllowed: false,
    }
  }
  
  function ordersDiscardDraftIfNeeded() {
    if (!['add', 'single-override'].includes(String(appState.ordersEditorMode ?? '')) || !appState.ordersEditingId) {
      return
    }
    const draftId = String(appState.ordersEditingId)
    appState.calendarTimelineDemoOrders = ordersListSourceOrders().filter((order) => !(order?.isDraft && order?.id === draftId))
  }

  function ordersCloneEditorOrder(order = null) {
    if (!order || typeof order !== 'object') {
      return null
    }
    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(order)
      } catch {
        // Dane zlecenia są serializowalne; fallback wspiera starsze przeglądarki.
      }
    }
    try {
      return JSON.parse(JSON.stringify(order))
    } catch {
      return { ...order }
    }
  }

  function ordersRestoreEditorSnapshot() {
    if (!ordersEditorInitialSnapshot || !appState.ordersEditingId) {
      return
    }
    const currentOrder = ordersFindTimelineOrder(appState.ordersEditingId)
    if (!currentOrder || currentOrder.isDraft) {
      return
    }
    Object.keys(currentOrder).forEach((key) => delete currentOrder[key])
    Object.assign(currentOrder, ordersCloneEditorOrder(ordersEditorInitialSnapshot))
  }

  function ordersRenderEditorSaveState(order = ordersFindTimelineOrder(appState.ordersEditingId) || {}) {
    const state = document.getElementById('ordersEditorSaveState')
    if (!state) {
      return
    }
    if (ordersEditorSaving) {
      state.textContent = 'Zapisywanie…'
      state.dataset.tone = 'saving'
      return
    }
    if (ordersEditorDirty) {
      state.textContent = 'Niezapisane zmiany'
      state.dataset.tone = 'warning'
      return
    }
    const isNewDraft = Boolean(order?.isDraft && ['add', 'single-override'].includes(String(appState.ordersEditorMode ?? '')))
    state.textContent = isNewDraft ? 'Nowy szkic' : 'Zapisane'
    state.dataset.tone = isNewDraft ? 'new' : 'saved'
  }

  function ordersSetEditorDirty(dirty = true) {
    ordersEditorDirty = Boolean(dirty)
    ordersRenderEditorSaveState()
  }

  function ordersSetEditorSaving(saving = true) {
    ordersEditorSaving = Boolean(saving)
    const editor = document.getElementById('ordersEditorPanel')
    editor?.querySelectorAll('.orders-wizard-actions button, #ordersEditBack').forEach((button) => {
      if (button instanceof HTMLButtonElement) {
        button.disabled = ordersEditorSaving
        button.setAttribute('aria-busy', ordersEditorSaving ? 'true' : 'false')
      }
    })
    ordersRenderEditorSaveState()
  }

  function ordersEditorHasUnsavedChanges() {
    return Boolean(ordersEditorDirty && appState.ordersEditingId && ordersEditorPanelIsVisible())
  }

  function ordersOpenDiscardConfirm() {
    const dialog = document.getElementById('ordersDiscardConfirm')
    if (!dialog) {
      return
    }
    dialog.hidden = false
    document.getElementById('ordersEditorPanel')?.classList.add('is-confirming-discard')
    window.setTimeout(() => dialog.querySelector('[data-orders-discard-cancel]')?.focus?.(), 0)
  }

  function ordersCloseDiscardConfirm(options = {}) {
    const dialog = document.getElementById('ordersDiscardConfirm')
    if (dialog) {
      dialog.hidden = true
    }
    document.getElementById('ordersEditorPanel')?.classList.remove('is-confirming-discard')
    if (options.focus !== false) {
      document.getElementById('ordersEditBack')?.focus?.()
    }
  }

  function ordersOpenAddEditor(targetDate = todayYmd(), options = {}) {
    const dayKey = ordersNormalizeDateField(targetDate, todayYmd())
    if (typeof openOrderCreateWorkspace !== 'function') {
      showTransientNotice('Kreator zlecenia jest chwilowo niedostÄ™pny.', 'error')
      return Promise.resolve(false)
    }
    const sourceRoute = String(options?.sourceRoute ?? appState.currentRoute ?? 'orders').trim() || 'orders'
    const returnRoute = String(options?.returnRoute ?? sourceRoute).trim() || 'orders'
    return openOrderCreateWorkspace({
      ...options,
      sourceRoute,
      returnRoute,
      initialDate: dayKey,
    })
  }
  
  function ordersCoworkerOptionsHtml(order = {}) {
    const current = new Set((Array.isArray(order?.coworkers) ? order.coworkers : []).map((item) => normalizeSearchText(item?.name ?? item)))
    return [
      '<option value="">-= Wybierz =-</option>',
      ...calendarTimelineResources()
        .filter((resource) => resource.type !== 'buffer' && ordersResourceCanBeAssigned(resource))
        .map((resource, index) => ({ label: resource.name, value: `${index}:${resource.name}` }))
        .filter((resource) => !current.has(normalizeSearchText(resource.label)))
        .map((resource) => `<option value="${escapeHtml(resource.value)}">${escapeHtml(resource.label)}</option>`),
    ].join('')
  }
  
  function ordersRenderCoworkerRows(order = {}) {
    const rows = document.getElementById('ordersCoworkerRows')
    const select = document.getElementById('ordersCoworkerSelect')
    if (select instanceof HTMLSelectElement) {
      select.innerHTML = ordersCoworkerOptionsHtml(order)
    }
    if (!rows) {
      return
    }
    const coworkers = Array.isArray(order?.coworkers) ? order.coworkers : []
    rows.innerHTML = coworkers.length
      ? coworkers
          .map((coworker, index) => {
            const name = String(coworker?.name ?? coworker ?? '').trim()
            return `
              <div class="orders-coworker-row">
                <div>${escapeHtml(name || '-')}</div>
                <div><button type="button" data-orders-remove-coworker="${index}">Usuń</button></div>
              </div>
            `
          })
          .join('')
      : '<div class="orders-subtable-empty">Brak współpracowników.</div>'
  }
  
  function ordersAddCoworkerToCurrentOrder() {
    const order = ordersFindTimelineOrder(appState.ordersEditingId)
    const select = document.getElementById('ordersCoworkerSelect')
    if (!order || !(select instanceof HTMLSelectElement) || !select.value) {
      return
    }
    const [, nameValue = ''] = String(select.value).split(':')
    const name = nameValue.trim()
    if (!name) {
      return
    }
    const coworkers = Array.isArray(order.coworkers) ? order.coworkers : []
    if (coworkers.some((item) => normalizeSearchText(item?.name ?? item) === normalizeSearchText(name))) {
      return
    }
    order.coworkers = [...coworkers, { name }]
    ordersRenderCoworkerRows(order)
  }
  
  function ordersRemoveCoworkerFromCurrentOrder(index) {
    const order = ordersFindTimelineOrder(appState.ordersEditingId)
    if (!order) {
      return
    }
    const removeIndex = Number(index)
    const coworkers = Array.isArray(order.coworkers) ? order.coworkers : []
    if (!Number.isInteger(removeIndex) || removeIndex < 0 || removeIndex >= coworkers.length) {
      return
    }
    order.coworkers = coworkers.filter((_, itemIndex) => itemIndex !== removeIndex)
    ordersRenderCoworkerRows(order)
  }
  
  function ordersLocationSuggestionKey(value = '') {
    return normalizeSearchText(value).replace(/\s+/g, ' ').trim()
  }
  
  function ordersAddLocationSuggestion(map, value = '', meta = '') {
    const label = String(value ?? '').replace(/\s+/g, ' ').trim()
    if (!label || label === '-') {
      return
    }
    const key = ordersLocationSuggestionKey(label)
    if (!key || map.has(key)) {
      return
    }
    map.set(key, {
      label,
      meta: String(meta ?? '').replace(/\s+/g, ' ').trim(),
    })
  }

  let ordersLocalLocationSuggestionsCache = null
  let ordersLocalLocationSuggestionsCacheAt = 0

  function ordersLocalLocationSuggestions() {
    const now = Date.now()
    if (
      Array.isArray(ordersLocalLocationSuggestionsCache) &&
      now - ordersLocalLocationSuggestionsCacheAt < ORDERS_LOCAL_LOCATION_SUGGESTIONS_CACHE_MS
    ) {
      return ordersLocalLocationSuggestionsCache
    }

    const suggestions = new Map()
  
    ;(Array.isArray(appState.clients) ? appState.clients : []).forEach((client) => {
      const name = String(client?.name ?? client?.clientName ?? '').trim()
      ordersClientExecutionAddresses(client).forEach((row) => {
        ordersAddLocationSuggestion(
          suggestions,
          row.label,
          [name ? `Klient: ${name}` : 'Klient', row.meta].filter(Boolean).join(' / '),
        )
      })
    })
  
    ;(Array.isArray(appState.zones) ? appState.zones : []).forEach((zone) => {
      const location = String(zone?.location ?? zone?.lokalizacja ?? '').trim()
      const client = String(zone?.clientName ?? zone?.clientLabel ?? '').trim()
      const zoneName = String(zone?.zoneName ?? zone?.name ?? '').trim()
      ordersAddLocationSuggestion(suggestions, location, [client, zoneName].filter(Boolean).join(' / ') || 'Strefa')
    })
  
    ordersListSourceOrders().forEach((order) => {
      const address = ordersTimelineAddressLabel(order)
      const client = ordersTimelineClientLabel(order)
      ordersAddLocationSuggestion(suggestions, address, client ? `Zlecenie: ${client}` : 'Zlecenie')
    })
  
    const rows = [...suggestions.values()].sort((left, right) => left.label.localeCompare(right.label, 'pl', { sensitivity: 'base' }))
    ordersLocalLocationSuggestionsCache = rows
    ordersLocalLocationSuggestionsCacheAt = now
    return rows
  }
  
  const ordersGoogleLocationCache = new Map()
  const ordersGoogleLocationStatus = new Map()
  const ordersMapGeocodeCache = new Map()
  let ordersGoogleMapsLoaderPromise = null
  let ordersGooglePlacesSessionToken = null
  let ordersGoogleLocationDebounceHandle = null
  let ordersGoogleLocationRequestSeq = 0
  let ordersGoogleLocationResolveHandle = null
  let ordersGoogleLocationResolveSeq = 0
  let ordersRenderedLocationSuggestions = []
  
  function ordersGoogleMapsApiKey() {
    return String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? import.meta.env.VITE_GOOGLE_API_KEY ?? '').trim()
  }
  
  function ordersMapQuery(address = '') {
    const query = String(address ?? '').replace(/\s+/g, ' ').trim()
    if (!query) {
      return ''
    }
    if (/^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(query)) {
      return query
    }
    return /\b(pol(?:ska|and)|pl)\b/i.test(query) ? query : `${query}, Polska`
  }
  
  function ordersGoogleMapsSearchUrl(address = '') {
    const query = ordersMapQuery(address)
    return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : ''
  }
  
  function ordersGoogleMapsEmbedUrlFromQuery(query = '', zoom = 16) {
    const normalizedQuery = ordersMapQuery(query)
    if (!normalizedQuery) {
      return ''
    }
    const normalizedZoom = Math.min(Math.max(Number(zoom) || 16, 3), 21)
    return `https://maps.google.com/maps?q=${encodeURIComponent(normalizedQuery)}&z=${normalizedZoom}&hl=pl&output=embed`
  }
  
  function ordersLoadGoogleMaps() {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return Promise.reject(new Error('Google Maps działa tylko w przeglądarce.'))
    }
  
    if (ordersMapGoogleAuthFailed) {
      return Promise.reject(new Error('Google Maps odrzuciło klucz API.'))
    }
  
    if (window.google?.maps?.importLibrary) {
      return Promise.resolve(window.google.maps)
    }
  
    const key = ordersGoogleMapsApiKey()
    if (!key) {
      return Promise.reject(new Error('Brak klucza Google Maps.'))
    }
  
    if (ordersGoogleMapsLoaderPromise) {
      return ordersGoogleMapsLoaderPromise
    }
  
    ordersGoogleMapsLoaderPromise = new Promise((resolve, reject) => {
      const callbackName = `__cleanziGoogleMapsReady_${Date.now()}`
      const script = document.createElement('script')
      const cleanup = () => {
        try {
          delete window[callbackName]
        } catch {
          window[callbackName] = undefined
        }
      }
  
      window[callbackName] = () => {
        cleanup()
        resolve(window.google.maps)
      }
  
      window.gm_authFailure = () => {
        cleanup()
        ordersMapGoogleAuthFailed = true
        ordersGoogleMapsLoaderPromise = null
        reject(new Error('Google Maps odrzuciło klucz API.'))
        if (appState.currentRoute === 'ordersMap') {
          const firstAddress = ordersMapVisibleOrders()
            .map((order) => ordersTimelineAddressLabel(order))
            .find((address) => address && address !== '-')
          ordersMapFallbackIframe(firstAddress || 'Polska')
          ordersMapSetNotice('Google Maps odrzuciło klucz API. Sprawdź Maps JavaScript API, billing i ograniczenia domeny klucza.', true)
        }
      }
  
      script.async = true
      script.defer = true
      script.dataset.cleanziGoogleMaps = 'true'
      script.src =
        `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}` +
        `&v=weekly&language=pl&region=PL&loading=async&callback=${encodeURIComponent(callbackName)}`
      script.onerror = () => {
        cleanup()
        ordersGoogleMapsLoaderPromise = null
        reject(new Error('Nie udało się połączyć z Google Maps.'))
      }
  
      document.head.append(script)
    })
  
    return ordersGoogleMapsLoaderPromise
  }
  
  function ordersGoogleSuggestionLabel(prediction = {}) {
    return String(
      prediction?.text?.text ??
        prediction?.text ??
        prediction?.description ??
        prediction?.mainText?.text ??
        prediction?.structured_formatting?.main_text ??
        '',
    ).trim()
  }
  
  function ordersGoogleSuggestionMeta(prediction = {}) {
    return String(
      prediction?.secondaryText?.text ??
        prediction?.structured_formatting?.secondary_text ??
        prediction?.description?.replace(ordersGoogleSuggestionLabel(prediction), '') ??
        'Google Maps',
    )
      .replace(/^,\s*/, '')
      .trim()
  }
  
  async function ordersFetchGoogleLocationSuggestions(queryValue = '') {
    const query = String(queryValue ?? '').trim()
    if (query.length < 3 || !ordersGoogleMapsApiKey()) {
      return []
    }
  
    const maps = await ordersLoadGoogleMaps()
    const places = await maps.importLibrary('places')
  
    if (places?.AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
      if (!ordersGooglePlacesSessionToken && places.AutocompleteSessionToken) {
        ordersGooglePlacesSessionToken = new places.AutocompleteSessionToken()
      }
      const response = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: query,
        includedRegionCodes: ['pl'],
        language: 'pl',
        region: 'pl',
        sessionToken: ordersGooglePlacesSessionToken,
      })
      return (Array.isArray(response?.suggestions) ? response.suggestions : [])
        .map((suggestion) => {
          const prediction = suggestion?.placePrediction
          const label = ordersGoogleSuggestionLabel(prediction)
          if (!label) {
            return null
          }
          return {
            label,
            meta: ordersGoogleSuggestionMeta(prediction) || 'Google Maps',
            placeId: String(prediction?.placeId ?? '').trim(),
            prediction,
            source: 'google',
          }
        })
        .filter(Boolean)
    }
  
    const service = places?.AutocompleteService ? new places.AutocompleteService() : null
    if (!service?.getPlacePredictions) {
      return []
    }
  
    const response = await service.getPlacePredictions({
      componentRestrictions: { country: 'pl' },
      input: query,
      types: ['address'],
    })
    return (Array.isArray(response?.predictions) ? response.predictions : [])
      .map((prediction) => {
        const label = ordersGoogleSuggestionLabel(prediction)
        if (!label) {
          return null
        }
        return {
          label,
          meta: ordersGoogleSuggestionMeta(prediction) || 'Google Maps',
          placeId: String(prediction?.place_id ?? '').trim(),
          prediction,
          source: 'google',
        }
      })
      .filter(Boolean)
  }
  
  function ordersQueueGoogleLocationSuggestions(queryValue = '') {
    const query = ordersLocationSuggestionKey(queryValue)
    if (query.length < ORDERS_LOCATION_GOOGLE_MIN_QUERY) {
      window.clearTimeout(ordersGoogleLocationDebounceHandle)
      return
    }
  
    if (!ordersGoogleMapsApiKey()) {
      ordersGoogleLocationStatus.set(query, 'missing-key')
      ordersRenderLocationSuggestions(queryValue)
      return
    }
  
    if (ordersGoogleLocationCache.has(query)) {
      ordersRenderLocationSuggestions(queryValue)
      return
    }
  
    window.clearTimeout(ordersGoogleLocationDebounceHandle)
    ordersGoogleLocationStatus.set(query, 'loading')
    ordersRenderLocationSuggestions(queryValue)
  
    const requestSeq = ++ordersGoogleLocationRequestSeq
    ordersGoogleLocationDebounceHandle = window.setTimeout(() => {
      ordersFetchGoogleLocationSuggestions(queryValue)
        .then((rows) => {
          if (requestSeq !== ordersGoogleLocationRequestSeq) {
            return
          }
          ordersGoogleLocationCache.set(query, rows)
          ordersGoogleLocationStatus.set(query, rows.length ? 'ready' : 'empty')
          const input = document.getElementById('ordersEditLocation')
          if (input instanceof HTMLInputElement && document.activeElement === input) {
            ordersRenderLocationSuggestions(input.value)
          }
        })
        .catch(() => {
          if (requestSeq !== ordersGoogleLocationRequestSeq) {
            return
          }
          ordersGoogleLocationStatus.set(query, 'error')
          const input = document.getElementById('ordersEditLocation')
          if (input instanceof HTMLInputElement && document.activeElement === input) {
            ordersRenderLocationSuggestions(input.value)
          }
        })
    }, ORDERS_LOCATION_GOOGLE_SUGGESTIONS_DEBOUNCE_MS)
  }
  
  function ordersQueueGoogleLocationResolve(queryValue = '') {
    const raw = String(queryValue ?? '').replace(/\s+/g, ' ').trim()
    const query = ordersLocationSuggestionKey(raw)
    window.clearTimeout(ordersGoogleLocationResolveHandle)
  
    if (query.length < 5) {
      ordersSetLocationGeoFields({ mapUrl: ordersGoogleMapsSearchUrl(raw) })
      return
    }
  
    ordersSetLocationGeoFields({ mapUrl: ordersGoogleMapsSearchUrl(raw) })
    if (!ordersGoogleMapsApiKey()) {
      return
    }
  
    const requestSeq = ++ordersGoogleLocationResolveSeq
    ordersGoogleLocationResolveHandle = window.setTimeout(() => {
      ordersFetchGoogleLocationSuggestions(raw)
        .then((rows) => {
          if (requestSeq !== ordersGoogleLocationResolveSeq) {
            return
          }
          const best = rows.find((item) => item.source === 'google') || rows[0]
          if (!best) {
            return
          }
          return ordersResolveGooglePlaceDetails(best).then((details) => {
            if (requestSeq !== ordersGoogleLocationResolveSeq) {
              return
            }
            const input = document.getElementById('ordersEditLocation')
            if (!(input instanceof HTMLInputElement) || ordersLocationSuggestionKey(input.value) !== query) {
              return
            }
            ordersSetLocationGeoFields({
              placeId: details.placeId || best.placeId || '',
              lat: details.lat || '',
              lng: details.lng || '',
              mapUrl: ordersGoogleMapsSearchUrl(details.address || raw),
            })
          })
        })
        .catch(() => {
          if (requestSeq === ordersGoogleLocationResolveSeq) {
            ordersSetLocationGeoFields({ mapUrl: ordersGoogleMapsSearchUrl(raw) })
          }
        })
    }, 700)
  }
  
  function ordersHideLocationSuggestions() {
    const box = document.getElementById('ordersLocationSuggestions')
    const input = document.getElementById('ordersEditLocation')
    if (box) {
      box.hidden = true
      box.innerHTML = ''
    }
    ordersRenderedLocationSuggestions = []
    if (input instanceof HTMLInputElement) {
      input.setAttribute('aria-expanded', 'false')
    }
  }
  
  function ordersLocationStatusText(status) {
    if (status === 'loading') {
      return 'Szukam w Google Maps...'
    }
    if (status === 'missing-key') {
      return 'Możesz użyć wpisanego adresu. Pełne podpowiedzi Google Maps pojawią się po dodaniu klucza API.'
    }
    if (status === 'error') {
      return 'Nie udało się pobrać podpowiedzi z Google Maps.'
    }
    return 'Brak podpowiedzi dla wpisanego adresu.'
  }
  
  function ordersRenderLocationSuggestions(queryValue = '') {
    const input = document.getElementById('ordersEditLocation')
    const box = document.getElementById('ordersLocationSuggestions')
    if (!(input instanceof HTMLInputElement) || !box) {
      return
    }
  
    const query = ordersLocationSuggestionKey(queryValue)
    if (query.length < 2) {
      ordersHideLocationSuggestions()
      return
    }
  
    const localRows = ordersLocalLocationSuggestions()
      .filter((item) => ordersLocationSuggestionKey([item.label, item.meta].join(' ')).includes(query))
      .map((item) => ({ ...item, source: 'local' }))
      .slice(0, 8)
    const googleRows = (ordersGoogleLocationCache.get(query) ?? [])
      .filter((item) => ordersLocationSuggestionKey([item.label, item.meta].join(' ')).includes(query))
      .slice(0, 8)
    const manualMapRow =
      query.length >= 3
        ? [
            {
              label: String(queryValue ?? '').replace(/\s+/g, ' ').trim(),
              mapUrl: ordersGoogleMapsSearchUrl(queryValue),
              meta: ordersGoogleMapsApiKey()
                ? 'Użyj wpisanego adresu, jeśli Google nie podpowiedziało wyniku'
                : 'Użyj wpisanego adresu. Google Maps wyszuka go po tekście.',
              source: 'manual-map',
            },
          ]
        : []
    const used = new Set()
    const rows = [...googleRows, ...localRows, ...manualMapRow]
      .filter((item) => {
        const key = ordersLocationSuggestionKey(item.label)
        if (!key || used.has(key)) {
          return false
        }
        used.add(key)
        return true
      })
      .slice(0, 8)
    const status = ordersGoogleLocationStatus.get(query)
  
    if (!rows.length) {
      box.innerHTML = `<div class="orders-location-empty">${escapeHtml(ordersLocationStatusText(status))}</div>`
      box.hidden = false
      input.setAttribute('aria-expanded', 'true')
      return
    }
  
    ordersRenderedLocationSuggestions = rows
    box.innerHTML = rows
      .map(
        (item, index) => `
          <button type="button" class="orders-location-suggestion" data-orders-location-index="${index}">
            <strong>${escapeHtml(item.label)}</strong>
            <span>
              ${item.source === 'google' || item.source === 'manual-map' ? '<b>Google Maps</b>' : '<b>Portal</b>'}
              ${item.meta ? ` · ${escapeHtml(item.meta)}` : ''}
            </span>
          </button>
        `,
      )
      .join('')
    box.hidden = false
    input.setAttribute('aria-expanded', 'true')
  }
  
  function ordersSetLocationGeoFields({ placeId = '', lat = '', lng = '', mapUrl = '' } = {}) {
    ordersSetInputValue('ordersEditLocationPlaceId', placeId)
    ordersSetInputValue('ordersEditLocationLat', lat)
    ordersSetInputValue('ordersEditLocationLng', lng)
    ordersSetInputValue('ordersEditLocationMapUrl', mapUrl)
  }
  
  function ordersClearLocationGeoFields() {
    ordersSetLocationGeoFields()
  }
  
  async function ordersResolveGooglePlaceDetails(item = {}) {
    const maps = await ordersLoadGoogleMaps()
    const places = await maps.importLibrary('places')
    let place = item.prediction?.toPlace?.()
  
    if (!place && places?.Place && item.placeId) {
      place = new places.Place({
        id: item.placeId,
        requestedLanguage: 'pl',
        requestedRegion: 'pl',
      })
    }
  
    if (!place?.fetchFields) {
      return {
        address: item.label,
        lat: '',
        lng: '',
        placeId: item.placeId || '',
      }
    }
  
    await place.fetchFields({ fields: ['formattedAddress', 'location'] })
    const location = place.location
    const latValue = typeof location?.lat === 'function' ? location.lat() : location?.lat
    const lngValue = typeof location?.lng === 'function' ? location.lng() : location?.lng
    const lat = Number.isFinite(Number(latValue)) ? String(Number(latValue)) : ''
    const lng = Number.isFinite(Number(lngValue)) ? String(Number(lngValue)) : ''
    return {
      address: String(place.formattedAddress ?? item.label ?? '').trim() || item.label,
      lat,
      lng,
      placeId: String(item.placeId ?? place.id ?? '').trim(),
    }
  }
  
  function ordersPickLocationSuggestion(item = {}) {
    ordersSetInputValue('ordersEditLocation', item.label || '')
    ordersSyncAddressSelectToLocation(item.label || '')
    ordersHideLocationSuggestions()
    if (item.source === 'manual-map') {
      ordersSetLocationGeoFields({ mapUrl: item.mapUrl || ordersGoogleMapsSearchUrl(item.label) })
      return
    }
    if (item.source !== 'google') {
      ordersClearLocationGeoFields()
      return
    }
  
    ordersSetLocationGeoFields({ placeId: item.placeId || '', mapUrl: ordersGoogleMapsSearchUrl(item.label) })
    void ordersResolveGooglePlaceDetails(item)
      .then((details) => {
        ordersSetInputValue('ordersEditLocation', details.address || item.label || '')
        ordersSyncAddressSelectToLocation(details.address || item.label || '')
        ordersSetLocationGeoFields(details)
        ordersGooglePlacesSessionToken = null
      })
      .catch(() => {
        ordersGooglePlacesSessionToken = null
        showTransientNotice('Adres wybrany, ale nie udało się pobrać współrzędnych z Google Maps.', 'error')
      })
  }
  
  function ordersParseMapCoordinate(value) {
    const raw = String(value ?? '').replace(',', '.').trim()
    if (!raw) {
      return null
    }
    const number = Number(raw)
    return Number.isFinite(number) ? number : null
  }
  
  function ordersMapCoordinates(order = {}) {
    const lat = ordersParseMapCoordinate(order?.lat ?? order?.latitude)
    const lng = ordersParseMapCoordinate(order?.lng ?? order?.lon ?? order?.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return null
    }
    if (lat === 0 && lng === 0) {
      return null
    }
    return { lat, lng }
  }
  
  function ordersMapInfo(order = {}) {
    const address = ordersTimelineAddressLabel(order)
    const coords = ordersMapCoordinates(order)
    const query = coords ? `${coords.lat},${coords.lng}` : address
    const embedUrl = ordersGoogleMapsEmbedUrlFromQuery(query, coords ? 18 : 16)
    const externalUrl =
      String(order?.mapUrl ?? order?.googleMapsUrl ?? '').trim() ||
      (coords ? ordersGoogleMapsSearchUrl(query) : ordersGoogleMapsSearchUrl(address))
    return {
      address,
      embedUrl,
      externalUrl,
      query,
    }
  }
  
  function ordersCloseMapModal() {
    const overlay = document.getElementById('ordersMapOverlay')
    const frame = document.getElementById('ordersMapFrame')
    if (overlay) {
      overlay.hidden = true
    }
    if (frame instanceof HTMLIFrameElement) {
      frame.removeAttribute('src')
    }
  }
  
  function ordersOpenMapModal(orderId) {
    const order = ordersFindTimelineOrder(orderId)
    if (!order) {
      showTransientNotice('Nie znaleziono zlecenia do podglądu mapy.', 'error')
      return
    }
  
    const info = ordersMapInfo(order)
    if (!info.embedUrl || !info.address || info.address === '-') {
      showTransientNotice('To zlecenie nie ma adresu lokalizacji.', 'error')
      return
    }
  
    const overlay = document.getElementById('ordersMapOverlay')
    const title = document.getElementById('ordersMapTitle')
    const address = document.getElementById('ordersMapAddress')
    const frame = document.getElementById('ordersMapFrame')
    const external = document.getElementById('ordersMapExternal')
    if (!overlay || !(frame instanceof HTMLIFrameElement)) {
      showTransientNotice(`Adres: ${info.address}`)
      return
    }
  
    if (title) {
      title.textContent = String(order?.title ?? 'Zlecenie').trim() || 'Zlecenie'
    }
    if (address) {
      address.textContent = info.address
    }
    if (frame.getAttribute('src') !== info.embedUrl) {
      frame.setAttribute('src', info.embedUrl)
    }
    if (external instanceof HTMLAnchorElement) {
      external.href = info.externalUrl || ordersGoogleMapsSearchUrl(info.query)
    }
    overlay.hidden = false
  }
  
  let ordersLocationSourcesPromise = null
  
  function ordersWarmLocationSources(force = false) {
    if (!force && ordersLocationSourcesPromise) {
      return ordersLocationSourcesPromise
    }

    const loaders = []
    if (force || !appState.clientsLoaded) {
      loaders.push(fetchClientsForCurrentSession(force))
    }
    if (force || !appState.zonesLoaded) {
      loaders.push(fetchZonesForCurrentSession(force))
    }
  
    if (!loaders.length) {
      return Promise.resolve()
    }
  
    ordersLocationSourcesPromise = Promise.allSettled(loaders)
      .then((result) => {
        ordersLocalLocationSuggestionsCache = null
        ordersLocalLocationSuggestionsCacheAt = 0
        return result
      })
      .finally(() => {
        ordersLocationSourcesPromise = null
      })
    return ordersLocationSourcesPromise
  }
  
  function ordersRenderEditorTabs() {
    const activeTab = String(appState.ordersEditorTab || 'basic')
    document.querySelectorAll('#ordersEditorPanel [data-orders-tab-target]').forEach((tab) => {
      const target = String(tab.getAttribute('data-orders-tab-target') || '')
      tab.classList.toggle('is-active', target === activeTab)
      tab.setAttribute('aria-selected', target === activeTab ? 'true' : 'false')
    })
    document.querySelectorAll('#ordersEditorPanel [data-orders-tab-panel]').forEach((panel) => {
      const target = String(panel.getAttribute('data-orders-tab-panel') || '')
      panel.classList.toggle('is-active', target === activeTab)
      panel.hidden = target !== activeTab
    })
  }

  const ORDERS_EDITOR_STEPS = [
    { id: 'client', label: 'Klient i adres' },
    { id: 'staffing', label: 'Zmiany i osoby' },
    { id: 'details', label: 'Opis i podsumowanie' },
  ]

  function ordersEditorActiveSteps(order = ordersFindTimelineOrder(appState.ordersEditingId) || {}) {
    const isRepeat = ordersScheduleModeForOrder(order) === 'repeat'
    return ORDERS_EDITOR_STEPS.filter((step) => !step.repeatOnly || isRepeat)
  }

  function ordersNormalizeEditorStep(stepId = appState.ordersEditorStep, order = ordersFindTimelineOrder(appState.ordersEditingId) || {}) {
    const steps = ordersEditorActiveSteps(order)
    const normalized = String(stepId ?? '').trim()
    if (steps.some((step) => step.id === normalized)) {
      return normalized
    }
    if (normalized === 'schedule') {
      return steps.some((step) => step.id === 'staffing') ? 'staffing' : steps[0]?.id || 'client'
    }
    if (normalized === 'recurrence' && !steps.some((step) => step.id === 'recurrence')) {
      return steps.some((step) => step.id === 'staffing') ? 'staffing' : steps[0]?.id || 'client'
    }
    return steps[0]?.id || 'client'
  }

  function ordersEditorStepIndex(stepId = appState.ordersEditorStep, order = ordersFindTimelineOrder(appState.ordersEditingId) || {}) {
    const steps = ordersEditorActiveSteps(order)
    const normalized = ordersNormalizeEditorStep(stepId, order)
    return Math.max(0, steps.findIndex((step) => step.id === normalized))
  }

  function ordersFocusFirstEditorStepField(stepId = appState.ordersEditorStep) {
    const panel = document.querySelector(`#ordersEditorPanel [data-orders-step-panel="${CSS.escape(String(stepId))}"]:not([hidden])`)
    const field = panel?.querySelector?.('input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), summary')
    if (field instanceof HTMLElement) {
      window.setTimeout(() => field.focus({ preventScroll: false }), 0)
    }
  }

  function ordersEditorScheduleFieldsValidation(order = {}, mode = ordersScheduleModeForOrder(order)) {
    const startDate = ordersNormalizeDateField(ordersReadInputValue('ordersEditStart'), '')
    const endDate = ordersNormalizeDateField(ordersReadInputValue('ordersEditEnd'), '')
    if (!startDate) {
      return { valid: false, message: 'Podaj datę START.' }
    }
    if (mode !== 'repeat' && !endDate) {
      return { valid: false, message: 'Podaj datę STOP dla zlecenia jednorazowego.' }
    }
    if (mode === 'repeat' && endDate && endDate < startDate) {
      return { valid: false, message: 'Data końca cyklu nie może być wcześniejsza niż data START.' }
    }
    const safeEndDate = mode === 'repeat' ? startDate : endDate
    if (mode !== 'repeat' && safeEndDate < startDate) {
      return { valid: false, message: 'Data STOP nie może być wcześniejsza niż data START.' }
    }
    return { valid: true, message: '' }
  }

  function ordersEditorRecurrenceFieldsValidation(mode = 'once', order = {}) {
    if (mode !== 'repeat') {
      return { valid: true, message: '' }
    }
    if (!ordersRepeatWeekdaysFromServiceBlocks(order).length) {
      return { valid: false, message: 'Wybierz co najmniej jeden dzień wykonania.' }
    }
    return { valid: true, message: '' }
  }

  function ordersEditorStepValidation(stepId = appState.ordersEditorStep, order = ordersFindTimelineOrder(appState.ordersEditingId) || {}) {
    const step = ordersNormalizeEditorStep(stepId, order)
    const mode = document.querySelector('#ordersEditorPanel input[name="ordersScheduleMode"]:checked')?.value === 'repeat' ? 'repeat' : ordersScheduleModeForOrder(order)
    if (step === 'client') {
      const clientLabel = ordersReadInputValue('ordersEditClient')
      if (ordersIsIndividualClientSelection(clientLabel)) {
        const draft = ordersReadIndividualClientDraft()
        if (!draft.name) {
          return { valid: false, message: 'Podaj nazwę albo imię i nazwisko klienta jednorazowego.' }
        }
        if (!draft.phone && !draft.email) {
          return { valid: false, message: 'Podaj telefon albo mail klienta jednorazowego.' }
        }
      } else if (!clientLabel || clientLabel === ORDERS_NEW_CLIENT_VALUE || !ordersFindClientBySelection(clientLabel)) {
        return { valid: false, message: 'Wybierz klienta z listy.' }
      }
      if (!ordersEditorExecutionAddressLabel()) {
        return { valid: false, message: 'Wybierz albo wpisz adres wykonania zlecenia.' }
      }
    }
    if (step === 'schedule') {
      return ordersEditorScheduleFieldsValidation(order, mode)
    }
    if (step === 'staffing') {
      const scheduleResult = ordersEditorScheduleFieldsValidation(order, mode)
      if (!scheduleResult.valid) {
        return scheduleResult
      }
      const recurrenceResult = ordersEditorRecurrenceFieldsValidation(mode, order)
      if (!recurrenceResult.valid) {
        return recurrenceResult
      }
      return ordersValidateServiceBlocksForOrder(order)
    }
    if (step === 'details' && !ordersEnsureEditorDescription(order)) {
      return { valid: false, message: 'Dodaj opis zlecenia widoczny w systemie.' }
    }
    return { valid: true, message: '' }
  }

  function ordersValidateEditorStep(stepId = appState.ordersEditorStep, order = ordersFindTimelineOrder(appState.ordersEditingId) || {}, options = {}) {
    const result = ordersEditorStepValidation(stepId, order)
    if (!result.valid && options.show !== false) {
      appState.ordersEditorStep = ordersNormalizeEditorStep(stepId, order)
      ordersRenderEditorWizard(order)
      showTransientNotice(result.message, 'error')
      ordersFocusFirstEditorStepField(appState.ordersEditorStep)
    }
    return result.valid
  }

  function ordersValidateAllEditorSteps(order = ordersFindTimelineOrder(appState.ordersEditingId) || {}) {
    const steps = ordersEditorActiveSteps(order)
    for (const step of steps) {
      if (!ordersValidateEditorStep(step.id, order)) {
        return false
      }
    }
    return true
  }

  function ordersSetEditorStep(stepId = 'client', options = {}) {
    const order = ordersFindTimelineOrder(appState.ordersEditingId) || {}
    const nextStep = ordersNormalizeEditorStep(stepId, order)
    const currentIndex = ordersEditorStepIndex(appState.ordersEditorStep, order)
    const nextIndex = ordersEditorStepIndex(nextStep, order)
    if (options.validate && nextIndex > currentIndex && !ordersValidateEditorStep(appState.ordersEditorStep, order)) {
      return
    }
    appState.ordersEditorStep = nextStep
    if (nextStep === 'details') {
      ordersEnsureEditorDescription(order)
    }
    ordersRenderEditorWizard(order)
    if (nextStep === 'staffing') {
      void ordersEnsureWorkerResourcesForEditor(order)
    }
    if (options.focus) {
      ordersFocusFirstEditorStepField(nextStep)
    }
  }

  function ordersMoveEditorStep(direction = 1) {
    const order = ordersFindTimelineOrder(appState.ordersEditingId) || {}
    const steps = ordersEditorActiveSteps(order)
    const currentIndex = ordersEditorStepIndex(appState.ordersEditorStep, order)
    const nextIndex = Math.min(steps.length - 1, Math.max(0, currentIndex + Number(direction || 0)))
    if (nextIndex > currentIndex && !ordersValidateEditorStep(steps[currentIndex]?.id, order)) {
      return
    }
    ordersSetEditorStep(steps[nextIndex]?.id || 'client', { focus: true })
  }

  function ordersWizardSummaryText(value = '', fallback = '-') {
    const text = String(value ?? '').trim()
    return text || fallback
  }

  function ordersJobCardPreviewEnabled() {
    const enabledByEnvironment = String(import.meta.env.VITE_ENABLE_JOB_CARD_PREVIEW ?? '').trim() === '1'
    const enabledForLocalQa =
      import.meta.env.DEV &&
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('jobCardPreview') === '1'
    return enabledByEnvironment || enabledForLocalQa
  }

  function ordersReadBooleanChoice(id) {
    const value = ordersReadInputValue(id)
    if (value === 'true') return true
    if (value === 'false') return false
    return undefined
  }

  function ordersJobCardStoredDraft(order = {}) {
    return order?.jobCardDraft && typeof order.jobCardDraft === 'object' ? order.jobCardDraft : {}
  }

  function ordersJobCardWorkerIdentity(assignment = {}) {
    return String(
      assignment.workerId ||
        assignment.workerLogin ||
        assignment.key ||
        (Number.isInteger(Number(assignment.row)) ? `row:${Number(assignment.row)}` : ''),
    ).trim()
  }

  function ordersRenderJobCardRolePickers(order = {}, options = {}) {
    const storedCard = ordersJobCardStoredDraft(order)
    const selectedLeader = options.preserve
      ? ordersReadInputValue('ordersJobCardLeaderWorker')
      : String(order.leaderWorkerId || storedCard?.fulfillment?.leaderWorkerId || '').trim()
    const selectedDriver = options.preserve
      ? ordersReadInputValue('ordersJobCardDriverWorker')
      : String(order.driverWorkerId || storedCard?.fulfillment?.driverWorkerId || '').trim()
    const serviceAssignments = ordersReadServiceBlocksFromControls(order)
      .flatMap((block) => Array.isArray(block?.slots) ? block.slots : [])
      .map((slot) => {
        const row = Number(slot?.row)
        if (Number.isInteger(row) && row >= 0) {
          return ordersWorkerAssignmentsFromRows([row])[0] || slot
        }
        return slot
      })
    const assignmentMap = new Map()
    ;[
      ...ordersWorkerAssignmentsFromRows(ordersReadSelectedWorkerRows()),
      ...serviceAssignments,
    ]
      .filter((assignment) => assignment?.workerId || assignment?.workerLogin)
      .forEach((assignment) => {
        const identity = ordersJobCardWorkerIdentity(assignment)
        if (identity && !assignmentMap.has(identity)) {
          assignmentMap.set(identity, assignment)
        }
      })
    const assignments = [...assignmentMap.values()]
    const optionsHtml = [
      '<option value="">Nie wyznaczono</option>',
      ...assignments.map((assignment) => {
        const identity = ordersJobCardWorkerIdentity(assignment)
        return `<option value="${escapeHtml(identity)}">${escapeHtml(assignment.name || identity)}</option>`
      }),
    ].join('')

    ;[
      ['ordersJobCardLeaderWorker', selectedLeader],
      ['ordersJobCardDriverWorker', selectedDriver],
    ].forEach(([id, selected]) => {
      const control = document.getElementById(id)
      if (!(control instanceof HTMLSelectElement)) return
      control.innerHTML = optionsHtml
      control.value = [...control.options].some((option) => option.value === selected) ? selected : ''
    })
  }

  function ordersReadJobCardOperationalFields(order = {}) {
    const dispatchRequired = ordersReadBooleanChoice('ordersJobCardDispatchRequired')
    const packingRequired = ordersReadBooleanChoice('ordersJobCardPackingRequired')
    const amountValue = ordersReadInputValue('ordersJobCardAmount')
    const fallbackPrice = Number(order.price) || 0
    return {
      siteMode: ordersReadInputValue('ordersJobCardSiteMode'),
      serviceType: ordersReadInputValue('ordersJobCardServiceType'),
      crewSource: ordersReadInputValue('ordersJobCardCrewSource'),
      dispatchRequired,
      leaderWorkerId: ordersReadInputValue('ordersJobCardLeaderWorker'),
      driverWorkerId: ordersReadInputValue('ordersJobCardDriverWorker'),
      vehicleId: ordersReadInputValue('ordersJobCardVehicleId'),
      vehicleLabel: ordersReadInputValue('ordersJobCardVehicleId'),
      vehicleRegistrationNumber: ordersReadInputValue('ordersJobCardVehicleId'),
      packingRequired,
      accessInstruction: ordersReadInputValue('ordersJobCardAccessInstruction'),
      accessInstructionConfirmedNone: ordersReadCheckboxValue('ordersJobCardAccessNone'),
      safetyInstruction: ordersReadInputValue('ordersJobCardSafetyInstruction'),
      safetyInstructionConfirmedNone: ordersReadCheckboxValue('ordersJobCardSafetyNone'),
      escalationInstruction: ordersReadInputValue('ordersJobCardEscalationInstruction'),
      paymentMethod: ordersReadInputValue('ordersJobCardPaymentMethod'),
      pricingMode: ordersReadInputValue('ordersJobCardPricingMode'),
      price: amountValue === '' ? fallbackPrice : Math.max(0, Number(amountValue) || 0),
      contractId: ordersReadInputValue('ordersJobCardContractId'),
      paymentTermDays: Math.max(0, Math.floor(Number(ordersReadInputValue('ordersJobCardPaymentTermDays')) || 0)),
      signatureRequired: ordersReadCheckboxValue('ordersJobCardSignatureRequired', true),
      recurrenceHorizonConfirmed: ordersReadCheckboxValue('ordersJobCardRecurrenceConfirmed'),
    }
  }

  function ordersSyncJobCardOperationalDependencies(order = {}) {
    const accessNone = ordersReadCheckboxValue('ordersJobCardAccessNone')
    const safetyNone = ordersReadCheckboxValue('ordersJobCardSafetyNone')
    const dispatchRequired = ordersReadBooleanChoice('ordersJobCardDispatchRequired')
    const deferredPayment = ordersReadInputValue('ordersJobCardPaymentMethod') === 'DEFERRED'
    const recurrence =
      document.querySelector('#ordersEditorPanel input[name="ordersScheduleMode"]:checked')?.value === 'repeat' ||
      ordersScheduleModeForOrder(order) === 'repeat'

    const access = document.getElementById('ordersJobCardAccessInstruction')
    const safety = document.getElementById('ordersJobCardSafetyInstruction')
    const driver = document.getElementById('ordersJobCardDriverWorker')
    const vehicle = document.getElementById('ordersJobCardVehicleId')
    const paymentTerm = document.getElementById('ordersJobCardPaymentTermDays')
    const recurrenceRow = document.getElementById('ordersJobCardRecurrenceConfirmationRow')
    if (access instanceof HTMLTextAreaElement) access.disabled = accessNone
    if (safety instanceof HTMLTextAreaElement) safety.disabled = safetyNone
    if (driver instanceof HTMLSelectElement) driver.disabled = dispatchRequired !== true
    if (vehicle instanceof HTMLInputElement) vehicle.disabled = dispatchRequired !== true
    if (paymentTerm instanceof HTMLInputElement) paymentTerm.disabled = !deferredPayment
    if (recurrenceRow instanceof HTMLElement) recurrenceRow.hidden = !recurrence
  }

  function ordersRenderJobCardOperationalFields(order = {}) {
    const storedCard = ordersJobCardStoredDraft(order)
    const storedPacking = order.packingRequired ?? storedCard?.resources?.packingRequired
    const storedDispatch = order.dispatchRequired ?? storedCard?.fulfillment?.dispatchRequired
    const storedSignature = order.signatureRequired ?? storedCard?.completion?.signatureRequired
    ordersSetInputValue('ordersJobCardSiteMode', order.siteMode || storedCard?.site?.mode || '')
    ordersSetInputValue('ordersJobCardServiceType', order.serviceType || storedCard?.service?.serviceType || '')
    ordersSetInputValue('ordersJobCardCrewSource', order.crewSource || storedCard?.fulfillment?.crewSource || '')
    ordersSetInputValue(
      'ordersJobCardDispatchRequired',
      typeof storedDispatch === 'boolean' ? String(storedDispatch) : '',
    )
    ordersSetInputValue(
      'ordersJobCardVehicleId',
      order.vehicleId ||
        order.vehicleRegistrationNumber ||
        storedCard?.fulfillment?.vehicle?.vehicleId ||
        storedCard?.fulfillment?.vehicle?.registrationNumber ||
        '',
    )
    ordersSetInputValue(
      'ordersJobCardPackingRequired',
      typeof storedPacking === 'boolean' ? String(storedPacking) : '',
    )
    ordersSetInputValue('ordersJobCardAccessInstruction', order.accessInstruction || storedCard?.site?.accessInstruction || '')
    ordersSetCheckboxValue(
      'ordersJobCardAccessNone',
      order.accessInstructionConfirmedNone === true || storedCard?.site?.accessInstructionConfirmedNone === true,
    )
    ordersSetInputValue('ordersJobCardSafetyInstruction', order.safetyInstruction || storedCard?.service?.safetyInstruction || '')
    ordersSetCheckboxValue(
      'ordersJobCardSafetyNone',
      order.safetyInstructionConfirmedNone === true || storedCard?.service?.safetyInstructionConfirmedNone === true,
    )
    ordersSetInputValue(
      'ordersJobCardEscalationInstruction',
      order.escalationInstruction || storedCard?.service?.escalationInstruction || '',
    )
    ordersSetInputValue('ordersJobCardPaymentMethod', order.paymentMethod || storedCard?.commercial?.paymentMethod || '')
    ordersSetInputValue('ordersJobCardPricingMode', order.pricingMode || storedCard?.commercial?.pricingMode || '')
    ordersSetInputValue('ordersJobCardAmount', order.price ?? storedCard?.commercial?.amount ?? 0)
    ordersSetInputValue('ordersJobCardContractId', order.contractId || storedCard?.commercial?.contractId || '')
    ordersSetInputValue(
      'ordersJobCardPaymentTermDays',
      order.paymentTermDays ?? storedCard?.commercial?.paymentTermDays ?? 0,
    )
    ordersSetCheckboxValue('ordersJobCardSignatureRequired', typeof storedSignature === 'boolean' ? storedSignature : true)
    ordersSetCheckboxValue(
      'ordersJobCardRecurrenceConfirmed',
      order.recurrenceHorizonConfirmed === true || storedCard?.schedule?.recurrenceHorizonConfirmed === true,
    )
    ordersRenderJobCardRolePickers(order)
    ordersSyncJobCardOperationalDependencies(order)
  }

  function ordersJobCardPreviewSource(order = {}) {
    const clientSelection = ordersReadInputValue('ordersEditClient')
    const isIndividualClient = ordersIsIndividualClientSelection(clientSelection)
    const individualClient = isIndividualClient ? ordersReadIndividualClientDraft() : null
    const selectedClient = isIndividualClient ? null : ordersFindClientBySelection(clientSelection)
    const selectedClientData = selectedClient ? ordersClientFormData(selectedClient) : {}
    const serviceBlocksFromControls = ordersReadServiceBlocksFromControls(order)
    const serviceBlocks = serviceBlocksFromControls.length ? serviceBlocksFromControls : ordersServiceBlocksForOrder(order)
    const scheduleMode =
      document.querySelector('#ordersEditorPanel input[name="ordersScheduleMode"]:checked')?.value === 'repeat'
        ? 'repeat'
        : ordersScheduleModeForOrder(order)
    const executionAddress = ordersEditorExecutionAddressLabel()
    const clientName =
      individualClient?.name ||
      ordersReadInputValue('ordersEditClientName') ||
      selectedClientData.clientName ||
      order.clientName ||
      order.clientLabel
    const workerComment = ordersReadInputValue('ordersEditWorkerComment') || ordersWorkerOnlyComment(order)
    const explicitCustomerType = isIndividualClient
      ? 'B2C'
      : order.customerType || selectedClientData.customerType || selectedClientData.clientType || (selectedClient ? 'B2B' : '')
    const operationalFields = ordersReadJobCardOperationalFields(order)

    return {
      ...order,
      ...operationalFields,
      customerType: explicitCustomerType,
      clientId: isIndividualClient ? '' : selectedClientData.clientId || order.clientId,
      clientName,
      clientLabel: clientName,
      clientNip: individualClient?.nip || ordersReadInputValue('ordersEditNip') || selectedClientData.nip || order.clientNip,
      phone: individualClient?.phone || ordersReadInputValue('ordersEditPhone') || selectedClientData.phone || order.phone,
      email: individualClient?.email || ordersReadInputValue('ordersEditEmail') || selectedClientData.email || order.email,
      executionAddressLabel: executionAddress,
      customAddressLabel: executionAddress,
      addressLabel: executionAddress || order.addressLabel,
      googlePlaceId: ordersReadInputValue('ordersEditLocationPlaceId') || order.googlePlaceId,
      lat: ordersReadInputValue('ordersEditLocationLat') || order.lat,
      lng: ordersReadInputValue('ordersEditLocationLng') || order.lng,
      scheduleMode,
      dateYmd: ordersNormalizeDateField(ordersReadInputValue('ordersEditStart'), order.dateYmd || todayYmd()),
      repeatUntil: scheduleMode === 'repeat'
        ? ordersNormalizeDateField(ordersReadInputValue('ordersEditEnd'), ordersRepeatEndDateForOrder(order))
        : '',
      serviceBlocks,
      description: ordersReadInputValue('ordersEditDescription') || order.description,
      workerComment,
      objectPlanTasks: ordersObjectPlanTasks(order),
      supplies: ordersReadEditorSupplies(order),
      price: operationalFields.price,
    }
  }

  function ordersJobCardPreviewScheduleLabel(card = {}) {
    const mode = card?.schedule?.mode === 'RECURRING' ? 'Cykliczne' : card?.schedule?.mode === 'ONE_OFF' ? 'Jednorazowe' : 'Nie wybrano'
    const date = card?.schedule?.startDateYmd ? formatDatePl(`${card.schedule.startDateYmd}T12:00:00`) : '-'
    const firstBlock = card?.schedule?.serviceBlocks?.[0]
    const time = firstBlock?.startTime && firstBlock?.endTime ? `${firstBlock.startTime}-${firstBlock.endTime}` : 'brak godzin'
    const recurrence = card?.schedule?.mode === 'RECURRING'
      ? `, do ${card.schedule.recurrenceUntilYmd ? formatDatePl(`${card.schedule.recurrenceUntilYmd}T12:00:00`) : 'potwierdzenia'}`
      : ''
    return `${mode}: ${date}, ${time}${recurrence}`
  }

  function ordersJobCardPreviewCrewLabel(card = {}) {
    const uniquePeople = new Map()
    ;(Array.isArray(card?.fulfillment?.assignments) ? card.fulfillment.assignments : [])
      .forEach((assignment) => {
        const identity = String(assignment?.workerId || assignment?.name || '').trim()
        if (!identity || uniquePeople.has(identity)) {
          return
        }
        uniquePeople.set(identity, String(assignment?.name || assignment?.workerId || '').trim())
      })
    return uniquePeople.size ? [...uniquePeople.values()].join(', ') : 'Nie przypisano pracowników'
  }

  function ordersRenderJobCardPreview(order = {}) {
    const root = document.getElementById('ordersJobCardPreview')
    if (!(root instanceof HTMLElement)) {
      return
    }
    const enabled = ordersJobCardPreviewEnabled()
    const source = document.getElementById('ordersJobCardSource')
    if (source instanceof HTMLElement) {
      source.hidden = !enabled
    }
    root.hidden = !enabled
    if (!enabled) {
      return
    }

    ordersSyncJobCardOperationalDependencies(order)
    const card = compileOrderDraftToJobCardDraft(ordersJobCardPreviewSource(order))
    const validation = validateJobCardDraft(card)
    const orderId = String(order?.id ?? order?.idTask ?? '').trim()
    const publication = ordersJobCardPublicationState.get(orderId) || order?.jobCardPublication || null
    const setText = (id, value) => {
      const node = document.getElementById(id)
      if (node) {
        node.textContent = String(value ?? '')
      }
    }

    root.classList.toggle('is-ready', validation.valid)
    root.classList.toggle('has-errors', !validation.valid)
    root.classList.toggle('is-published', Boolean(publication?.revision))
    setText('ordersJobCardPreviewStatus', validation.valid ? 'Gotowa do publikacji' : 'Wymaga uzupełnienia')
    setText('ordersJobCardPreviewCustomer', card.customer.name || 'Nie wybrano klienta')
    setText('ordersJobCardPreviewAddress', card.site.address || 'Nie uzupełniono adresu')
    setText('ordersJobCardPreviewSchedule', ordersJobCardPreviewScheduleLabel(card))
    setText('ordersJobCardPreviewCrew', ordersJobCardPreviewCrewLabel(card))
    setText(
      'ordersJobCardPreviewPayment',
      card.commercial.paymentMethod
        ? `${card.commercial.paymentMethod} · ${card.commercial.pricingMode || 'brak sposobu wyceny'}`
        : 'Nie wybrano płatności',
    )
    setText('ordersJobCardPreviewSignature', card.completion.signatureRequired ? 'Wymagany' : 'Niewymagany')
    setText(
      'ordersJobCardPreviewPublication',
      publication?.revision
        ? `Rewizja ${publication.revision} · ${publication.publishedAt ? formatDatePl(publication.publishedAt) : 'opublikowana'}`
        : 'Brak opublikowanej rewizji',
    )
    setText(
      'ordersJobCardPreviewValidation',
      `${validation.errors.length} braków blokujących · ${validation.warnings.length} ostrzeżeń`,
    )

    const issues = document.getElementById('ordersJobCardPreviewIssues')
    if (issues) {
      const visibleIssues = validation.issues.slice(0, 8)
      issues.innerHTML = visibleIssues.length
        ? visibleIssues.map((item) => `
            <li class="${item.severity === 'ERROR' ? 'is-error' : 'is-warning'}">
              ${item.severity === 'WARNING'
                ? `<label class="orders-job-card-warning">
                    <input
                      type="checkbox"
                      data-job-card-warning-code="${escapeHtml(item.code)}"
                      ${ordersJobCardWarningAcknowledgements.has(item.code) ? 'checked' : ''}
                    />
                    <span><strong>Potwierdzam ostrzeżenie</strong>${escapeHtml(item.message)}</span>
                  </label>`
                : `<strong>Uzupełnij</strong><span>${escapeHtml(item.message)}</span>`}
            </li>
          `).join('')
        : '<li class="is-ready"><strong>Gotowe</strong><span>Karta zawiera wszystkie dane wymagane do publikacji.</span></li>'
    }
  }

  function ordersEditorGeneratedDescription(order = {}) {
    const rawTitle = ordersReadInputValue('ordersEditName')
    const manualTitle =
      rawTitle && normalizeSearchText(rawTitle) !== normalizeSearchText('Nowe zlecenie')
        ? rawTitle
        : ''
    const clientLabel = ordersReadInputValue('ordersEditClientName') || ordersReadInputValue('ordersEditClient')
    const addressLabel = ordersEditorExecutionAddressLabel()
    const generatedTitle = [clientLabel, addressLabel].filter(Boolean).join(' - ')
    const orderTitle =
      order?.title && normalizeSearchText(order.title) !== normalizeSearchText('Nowe zlecenie')
        ? String(order.title).trim()
        : ''
    return generatedTitle || manualTitle || orderTitle || ''
  }

  function ordersEnsureEditorDescription(order = {}) {
    const current = ordersReadInputValue('ordersEditDescription')
    if (current) {
      return current
    }
    const generated = ordersEditorGeneratedDescription(order)
    if (generated) {
      ordersSetInputValue('ordersEditDescription', generated)
    }
    return generated
  }

  function ordersRenderEditorWizard(order = ordersFindTimelineOrder(appState.ordersEditingId) || {}) {
    const root = document.getElementById('ordersEditorPanel')
    if (!root) {
      return
    }
    const activeStep = ordersNormalizeEditorStep(appState.ordersEditorStep, order)
    appState.ordersEditorStep = activeStep
    const steps = ordersEditorActiveSteps(order)
    const activeIndex = ordersEditorStepIndex(activeStep, order)
    const activeIds = new Set(steps.map((step) => step.id))
    const scheduleGroupVisible = activeStep === 'staffing'
    const isRepeat = document.querySelector('#ordersEditorPanel input[name="ordersScheduleMode"]:checked')?.value === 'repeat' ||
      ordersScheduleModeForOrder(order) === 'repeat'

    root.querySelectorAll('[data-orders-step-target]').forEach((button) => {
      const stepId = String(button.getAttribute('data-orders-step-target') || '')
      const stepIndex = steps.findIndex((step) => step.id === stepId)
      const available = activeIds.has(stepId)
      button.hidden = !available
      button.classList.toggle('is-active', stepId === activeStep)
      button.classList.toggle('is-complete', available && stepIndex >= 0 && stepIndex < activeIndex)
      button.setAttribute('aria-current', stepId === activeStep ? 'step' : 'false')
      button.disabled = !available
    })

    root.querySelectorAll('[data-orders-step-panel]').forEach((panel) => {
      const panelStep = String(panel.getAttribute('data-orders-step-panel') || '')
      const repeatOnly = panel.getAttribute('data-orders-repeat-only') === 'true'
      panel.hidden = panelStep !== activeStep || (repeatOnly && !isRepeat)
    })

    root.querySelectorAll('[data-orders-step-group="schedule-flow"]').forEach((panel) => {
      panel.hidden = !scheduleGroupVisible
    })
    root.querySelectorAll('.orders-main-card').forEach((panel) => {
      panel.hidden = activeStep === 'details'
    })

    const prevButton = root.querySelector('[data-orders-step-prev]')
    const nextButton = root.querySelector('[data-orders-step-next]')
    const saveButton = root.querySelector('#ordersEditSave')
    const publishButton = root.querySelector('#ordersJobCardPublish')
    if (prevButton instanceof HTMLButtonElement) {
      prevButton.disabled = ordersEditorSaving || activeIndex <= 0
    }
    if (nextButton instanceof HTMLButtonElement) {
      nextButton.hidden = activeIndex >= steps.length - 1
      nextButton.disabled = ordersEditorSaving
    }
    if (saveButton instanceof HTMLButtonElement) {
      saveButton.hidden = activeIndex < steps.length - 1
      saveButton.disabled = ordersEditorSaving
      saveButton.textContent = ordersEditorSaving
        ? 'Zapisywanie…'
        : appState.ordersEditorMode === 'add'
          ? 'Zapisz zlecenie'
          : 'Zapisz zmiany'
    }
    if (publishButton instanceof HTMLButtonElement) {
      publishButton.hidden = activeIndex < steps.length - 1 || !ordersJobCardPreviewEnabled()
      publishButton.disabled = ordersEditorSaving
    }

    const client = ordersWizardSummaryText(ordersReadInputValue('ordersEditClientName') || ordersReadInputValue('ordersEditClient'))
    const address = ordersWizardSummaryText(ordersEditorExecutionAddressLabel())
    const mode = document.querySelector('#ordersEditorPanel input[name="ordersScheduleMode"]:checked')?.value === 'repeat' ? 'repeat' : ordersScheduleModeForOrder(order)
    const startDate = ordersNormalizeDateField(ordersReadInputValue('ordersEditStart'), order.dateYmd || todayYmd())
    const endDate = ordersNormalizeDateField(ordersReadInputValue('ordersEditEnd'), '')
    const summaryServiceBlocks = ordersReadServiceBlocksFromControls(order)
    const effectiveSummaryBlocks = summaryServiceBlocks.length ? summaryServiceBlocks : ordersServiceBlocksForOrder(order)
    const summaryTiming = ordersPrimaryServiceBlockTiming(order, effectiveSummaryBlocks)
    const startTime = summaryTiming.startTime
    const endTime = summaryTiming.endTime
    const scheduleText = mode === 'repeat'
      ? `Cykliczne od ${formatDatePl(`${startDate}T12:00:00`)}${endDate ? ` do ${formatDatePl(`${endDate}T12:00:00`)}` : ''}, plan ${startTime}-${endTime}`
      : `Jednorazowe ${formatDatePl(`${startDate}T12:00:00`)} ${startTime}-${endTime}`
    const workerSummary = ordersWizardSummaryText(ordersServiceBlocksWorkerSummary(effectiveSummaryBlocks), 'BUFOR')
    const { totalWorkMinutes, totalPeople } = ordersServiceBlocksTotals(effectiveSummaryBlocks, order)
    const assignedSlots = effectiveSummaryBlocks
      .flatMap((block) => (Array.isArray(block?.slots) ? block.slots : []))
      .filter((slot) => {
        const row = Number(slot?.row)
        return String(slot?.type ?? '') === 'worker' && Number.isInteger(row) && row >= 0
      }).length
    const missingSlots = Math.max(0, totalPeople - assignedSlots)
    const missingPlacesLabel = missingSlots === 1 ? '1 miejsce' : `${missingSlots} miejsc`
    const workText = `${ordersHoursInputValue(totalWorkMinutes)} rbh, ${totalPeople} os.`

    const summaryClient = document.getElementById('ordersWizardSummaryClient')
    const summaryAddress = document.getElementById('ordersWizardSummaryAddress')
    const summarySchedule = document.getElementById('ordersWizardSummarySchedule')
    const summaryWorkers = document.getElementById('ordersWizardSummaryWorkers')
    const summaryWork = document.getElementById('ordersWizardSummaryWork')
    const summaryStatus = document.getElementById('ordersWizardSummaryStatus')
    const bufferStatus = document.getElementById('ordersWizardBufferStatus')
    if (summaryClient) summaryClient.textContent = client
    if (summaryAddress) summaryAddress.textContent = address
    if (summarySchedule) summarySchedule.textContent = scheduleText
    if (summaryWorkers) summaryWorkers.textContent = workerSummary
    if (summaryWork) summaryWork.textContent = workText
    if (summaryStatus) summaryStatus.textContent = missingSlots ? `${missingPlacesLabel} do obsady` : 'Obsada kompletna'
    if (bufferStatus) bufferStatus.textContent = missingSlots ? `${missingPlacesLabel} w BUFORZE` : 'Obsada kompletna'

    const validation = document.getElementById('ordersWizardValidation')
    if (validation) {
      validation.textContent = activeIndex >= steps.length - 1
        ? 'Sprawdź plan, Kartę Zlecenia i ostrzeżenia przed zapisem.'
        : '* Pola wymagane'
    }
    const actionHint = document.getElementById('ordersWizardActionHint')
    if (actionHint) {
      actionHint.textContent = activeIndex >= steps.length - 1
        ? 'Zapis utworzy plan w kalendarzu i edytowalny szkic Karty. Publikacja udostępni pracownikom niezmienną rewizję.'
        : 'Karta Zlecenia powstaje automatycznie z danych tego formularza.'
    }
    ordersRenderEditorSaveState(order)
    ordersRenderJobCardPreview(order)
  }
  
  function ordersScheduleModeForOrder(order = {}) {
    return String(order?.type ?? '').trim() === 'cyclic' || String(order?.scheduleMode ?? '').trim() === 'repeat' ? 'repeat' : 'once'
  }
  
  function ordersRepeatEndDateForOrder(order = {}) {
    return ordersNormalizeDateField(
      order?.repeatUntil ?? order?.repeatEndDate ?? order?.recurrenceEndDate ?? order?.seriesEndDate ?? order?.repeatUntilYmd,
      '',
    )
  }
  
  function ordersSetScheduleModeValue(mode = 'once') {
    const normalized = mode === 'repeat' ? 'repeat' : 'once'
    document.querySelectorAll('#ordersEditorPanel input[name="ordersScheduleMode"]').forEach((input) => {
      if (input instanceof HTMLInputElement) {
        input.checked = input.value === normalized
      }
    })
  }
  
  function ordersApplyScheduleModeDateDefaults(order = {}, mode = 'once') {
    const normalized = mode === 'repeat' ? 'repeat' : 'once'
    const today = todayYmd()
    const currentStart = ordersNormalizeDateField(ordersReadInputValue('ordersEditStart'), order.dateYmd || today)
    const nextStart = normalized === 'repeat' ? currentStart : today
    const nextEnd = normalized === 'repeat' ? defaultJobCardRecurrenceUntil(nextStart) : today
  
    ordersSetInputValue('ordersEditStart', nextStart)
    ordersSetInputValue('ordersScheduleStartDate', nextStart)
    ordersSetInputValue('ordersEditEnd', nextEnd)
    ordersSetInputValue('ordersScheduleEndDate', nextEnd)
    ordersSetCheckboxValue('ordersJobCardRecurrenceConfirmed', false)
  
    order.dateYmd = nextStart
    order.endDateYmd = normalized === 'repeat' ? nextStart : nextEnd
    order.validUntil = normalized === 'repeat' ? '' : nextEnd
    order.repeatUntil = normalized === 'repeat' ? nextEnd : ''
    order.repeatEndDate = normalized === 'repeat' ? nextEnd : ''
    order.recurrenceEndDate = normalized === 'repeat' ? nextEnd : ''
    order.seriesEndDate = normalized === 'repeat' ? nextEnd : ''
    order.recurrenceHorizonConfirmed = false
  }
  
  function ordersSetScheduleRepeatDisabled(disabled = true) {
    const rules = document.getElementById('ordersScheduleRulesPanel')
    const panel = document.getElementById('ordersScheduleRepeatPanel')
    if (rules) {
      rules.hidden = false
    }
    if (!panel) {
      return
    }
    panel.hidden = Boolean(disabled)
    panel.classList.toggle('is-disabled', Boolean(disabled))
    panel.querySelectorAll('input, select, button').forEach((node) => {
      if (node instanceof HTMLInputElement || node instanceof HTMLSelectElement || node instanceof HTMLButtonElement) {
        node.disabled = Boolean(disabled)
      }
    })
    ordersSyncRepeatSelectPickers()
    if (disabled) {
      ordersCloseRepeatSelectPickers()
    }
  }
  
  function ordersSyncScheduleTimeLabels(mode = 'once') {
    const endDateLabel = document.getElementById('ordersEndDateLabel')
    const startLabel = document.getElementById('ordersStartTimeLabel')
    const endLabel = document.getElementById('ordersEndTimeLabel')
    const isRepeat = String(mode ?? '').trim() === 'repeat'
    if (endDateLabel) {
      endDateLabel.textContent = isRepeat ? 'Data końca cyklu' : 'Data STOP *'
    }
    if (startLabel) {
      startLabel.textContent = 'Godzina START *'
    }
    if (endLabel) {
      endLabel.textContent = 'Godzina STOP *'
    }
  }
  
  function ordersSetScheduleTimeVisible() {
    // Czas realizacji zlecenia wyznaczaja teraz wylacznie karty zmian.
  }
  
  function ordersRepeatUnitLabel(unit = 'day', every = 1) {
    const amount = Math.max(1, Math.floor(Number(every) || 1))
    const normalized = String(unit ?? 'day')
    if (normalized === 'week') return amount === 1 ? 'Co tydzień' : `Co ${amount} tyg.`
    if (normalized === 'month') return amount === 1 ? 'Co miesiąc' : `Co ${amount} mies.`
    if (normalized === 'year') return amount === 1 ? 'Co rok' : `Co ${amount} lata`
    return amount === 1 ? 'Codziennie' : `Co ${amount} dni`
  }
  
  function ordersRepeatPresetFromOrder(order = {}) {
    const preset = String(order?.repeatPreset ?? '').trim()
    if (preset === 'custom') {
      return 'interval'
    }
    if (['day', 'week', 'month', 'year', 'interval'].includes(preset)) {
      return preset
    }
    const every = Math.max(1, Math.floor(Number(order?.repeatEvery) || 1))
    const unit = String(order?.repeatUnit ?? 'day').trim()
    if (every === 1 && ['day', 'week', 'month', 'year'].includes(unit)) {
      return unit
    }
    return 'interval'
  }
  
  function ordersWeekdayFromDateKey(dayKey = todayYmd()) {
    const raw = ordersNormalizeDateField(dayKey, todayYmd())
    const date = new Date(`${raw}T12:00:00`)
    const day = date.getDay()
    return Number.isInteger(day) ? day : 1
  }
  
  function ordersDefaultRepeatWeekdays() {
    return [...ORDERS_DEFAULT_REPEAT_WEEKDAYS]
  }
  
  function ordersAllRepeatWeekdays() {
    return [...ORDERS_ALL_REPEAT_WEEKDAYS]
  }
  
  function ordersRepeatOrderUsesAllWeekdays(order = {}) {
    const preset = ordersRepeatPresetFromOrder(order)
    const unit = String(order?.repeatUnit ?? preset).trim()
    return preset === 'day' || unit === 'day'
  }
  
  function ordersRepeatControlsUseAllWeekdays(order = {}) {
    const preset = ordersReadInputValue('ordersEditRepeatPreset') || ordersRepeatPresetFromOrder(order)
    const unit = String(ordersReadInputValue('ordersEditRepeatUnit') || order?.repeatUnit || preset).trim()
    return preset === 'day' || unit === 'day'
  }
  
  function ordersRepeatWeekdaysFromOrder(order = {}) {
    if (ordersRepeatOrderUsesAllWeekdays(order)) {
      return ordersAllRepeatWeekdays()
    }
    const source = Array.isArray(order?.repeatWeekdays) ? order.repeatWeekdays : []
    const weekdays = source
      .map((value) => Number(value))
      .filter((value, index, list) => Number.isInteger(value) && value >= 0 && value <= 6 && list.indexOf(value) === index)
    if (weekdays.length) {
      return weekdays
    }
    return ordersScheduleModeForOrder(order) === 'repeat' ? ordersDefaultRepeatWeekdays() : [ordersWeekdayFromDateKey(order?.dateYmd)]
  }
  
  function ordersSetRepeatWeekdayChecks(weekdays = []) {
    const selected = new Set((Array.isArray(weekdays) ? weekdays : []).map((value) => Number(value)))
    document.querySelectorAll('#ordersEditorPanel [data-orders-repeat-weekday]').forEach((input) => {
      if (input instanceof HTMLInputElement) {
        input.checked = selected.has(Number(input.getAttribute('data-orders-repeat-weekday')))
      }
    })
  }
  
  function ordersReadRepeatWeekdays() {
    return [...document.querySelectorAll('#ordersEditorPanel [data-orders-repeat-weekday]:checked')]
      .map((input) => Number(input.getAttribute('data-orders-repeat-weekday')))
      .filter((value, index, list) => Number.isInteger(value) && value >= 0 && value <= 6 && list.indexOf(value) === index)
  }
  
  function ordersReadRepeatWeekdaysForMode(mode = 'once') {
    if (String(mode ?? '').trim() === 'repeat' && ordersRepeatControlsUseAllWeekdays()) {
      return ordersAllRepeatWeekdays()
    }
    const weekdays = ordersReadRepeatWeekdays()
    return String(mode ?? '').trim() === 'repeat' && !weekdays.length ? ordersDefaultRepeatWeekdays() : weekdays
  }
  
  function ordersWeekdayLabel(weekday = 1) {
    const value = Number(weekday)
    return ORDERS_WEEKDAY_LABELS[Number.isInteger(value) ? value : 1] || 'Dzień'
  }
  
  function ordersNormalizeWeekday(value) {
    const number = Number(value)
    return Number.isInteger(number) && number >= 0 && number <= 6 ? number : null
  }
  
  function ordersTimeWindowMinutes(startTime = '08:00', endTime = '10:00') {
    const start = calendarTimelineTimeMinutes(ordersNormalizeTimeField(startTime, '08:00'), 8 * 60)
    let end = calendarTimelineTimeMinutes(ordersNormalizeTimeField(endTime, ordersDefaultEndTime(startTime)), start + 60)
    if (end <= start) {
      end += 1440
    }
    return Math.max(15, end - start)
  }
  
  function ordersWeeklyPatternSources(order = {}) {
    return [
      order?.weeklyScheduleRules,
      order?.weeklyPattern,
      order?.repeatDayRules,
      order?.dayScheduleRules,
    ].find((value) => Array.isArray(value)) || []
  }
  
  function ordersNormalizeWeeklyPatternRule(rule = {}, order = {}, weekdayFallback = null) {
    const weekday = ordersNormalizeWeekday(
      rule?.weekday ?? rule?.day ?? rule?.repeatWeekday ?? rule?.weekdayIndex ?? weekdayFallback,
    )
    if (weekday === null) {
      return null
    }
    const accessStartTime = ordersNormalizeTimeField(
      rule?.accessStartTime ?? rule?.startTime ?? rule?.fromTime ?? rule?.accessFrom,
      order.accessStartTime || order.startTime || '08:00',
    )
    const accessEndTime = ordersNormalizeTimeField(
      rule?.accessEndTime ?? rule?.endTime ?? rule?.toTime ?? rule?.accessTo,
      order.accessEndTime || order.endTime || ordersDefaultEndTime(accessStartTime),
    )
    const requiredWorkMinutes = Math.max(
      15,
      Math.round(Number(rule?.requiredWorkMinutes ?? rule?.workMinutes ?? rule?.serviceWorkMinutes ?? rule?.minutes) || ordersStoredWorkMinutes(order)),
    )
    const requiredPeople = Math.max(
      1,
      Math.floor(Number(rule?.requiredPeople ?? rule?.requiredWorkers ?? rule?.workerSlots) || Number(order.requiredPeople) || 1),
    )
    return {
      weekday,
      day: weekday,
      label: ordersWeekdayLabel(weekday),
      accessStartTime,
      startTime: accessStartTime,
      accessEndTime,
      endTime: accessEndTime,
      requiredWorkMinutes,
      workMinutes: requiredWorkMinutes,
      serviceWorkMinutes: requiredWorkMinutes,
      requiredPeople,
      requiredWorkers: requiredPeople,
      workerSlots: requiredPeople,
    }
  }
  
  function ordersFallbackWeeklyPatternRule(order = {}, weekday = 1) {
    return ordersNormalizeWeeklyPatternRule(
      {
        weekday,
        accessStartTime: ordersNormalizeTimeField(order.accessStartTime || order.startTime, '08:00'),
        accessEndTime: ordersNormalizeTimeField(order.accessEndTime || order.endTime, ordersDefaultEndTime(order.startTime)),
        requiredWorkMinutes: ordersStoredWorkMinutes(order),
        requiredPeople: Math.max(1, Math.floor(Number(order.requiredPeople ?? order.requiredWorkers ?? order.workerSlots) || 1)),
      },
      order,
      weekday,
    )
  }
  
  function ordersWeeklyPatternRulesForWeekdays(order = {}, weekdays = []) {
    const selected = (Array.isArray(weekdays) ? weekdays : [])
      .map(ordersNormalizeWeekday)
      .filter((weekday, index, list) => weekday !== null && list.indexOf(weekday) === index)
    const existing = new Map()
    ordersWeeklyPatternSources(order).forEach((rule) => {
      const normalized = ordersNormalizeWeeklyPatternRule(rule, order)
      if (normalized) {
        existing.set(normalized.weekday, normalized)
      }
    })
    return selected
      .map((weekday) => existing.get(weekday) || ordersFallbackWeeklyPatternRule(order, weekday))
      .filter(Boolean)
  }
  
  function ordersStoreWeeklyPatternRules(order = {}, rules = []) {
    const safe = (Array.isArray(rules) ? rules : [])
      .map((rule) => ordersNormalizeWeeklyPatternRule(rule, order))
      .filter(Boolean)
      .sort((left, right) => left.weekday - right.weekday)
    order.weeklyScheduleRules = safe
    order.weeklyPattern = safe
    order.repeatDayRules = safe
    order.dayScheduleRules = safe
    return safe
  }
  
  function ordersApplyFirstWeeklyPatternToAll() {
    const rows = [...document.querySelectorAll('#ordersWeeklyPatternRows [data-orders-weekly-pattern-row]')]
    if (rows.length <= 1) {
      return
    }
    const first = rows[0]
    const source = {
      startTime: first.querySelector('[data-orders-weekly-pattern-start]')?.value || '',
      endTime: first.querySelector('[data-orders-weekly-pattern-end]')?.value || '',
      hours: first.querySelector('[data-orders-weekly-pattern-hours]')?.value || '',
      people: first.querySelector('[data-orders-weekly-pattern-people]')?.value || '',
    }
    rows.slice(1).forEach((row) => {
      const startInput = row.querySelector('[data-orders-weekly-pattern-start]')
      const endInput = row.querySelector('[data-orders-weekly-pattern-end]')
      const hoursInput = row.querySelector('[data-orders-weekly-pattern-hours]')
      const peopleInput = row.querySelector('[data-orders-weekly-pattern-people]')
      if (startInput instanceof HTMLInputElement) startInput.value = source.startTime
      if (endInput instanceof HTMLInputElement) endInput.value = source.endTime
      if (hoursInput instanceof HTMLInputElement) hoursInput.value = source.hours
      if (peopleInput instanceof HTMLInputElement) peopleInput.value = source.people
    })
    const order = ordersFindTimelineOrder(appState.ordersEditingId)
    if (order) {
      ordersUpdateOrderScheduleFromControls(order)
      ordersRefreshObjectPlanScheduleWindow(order, { syncMonth: false })
      ordersRenderSchedulePreview(order)
    }
    showTransientNotice('Zastosowano pierwszy wzorzec do wszystkich dni.')
  }
  
  function ordersWorkAllocationsForWeeklyPatternRule(order = {}, rule = {}) {
    const resources = calendarTimelineResources()
    const selectedRows = ordersNormalizeOrderRows(order, resources).filter((row) => !calendarTimelineRowAllowsOverlap(row, resources))
    const people = Math.max(1, Math.floor(Number(rule.requiredPeople ?? rule.workerSlots) || 1))
    const minutes = ordersSplitMinutesEvenly(rule.requiredWorkMinutes, people)
    const startTime = ordersNormalizeTimeField(rule.accessStartTime || rule.startTime, order.startTime || '08:00')
    return Array.from({ length: people }, (_, index) => {
      const row = selectedRows[index] ?? 0
      const hasWorker = selectedRows[index] !== undefined
      const assignment = hasWorker ? ordersWorkerAssignmentsFromRows([row], resources)[0] : null
      const label = hasWorker ? assignment?.name || ordersWorkerRowLabel(row, resources) : `BUFOR ${index + 1}`
      const itemMinutes = Math.max(15, Math.round(Number(minutes[index]) || 0))
      const endTime = ordersAllocationEndTimeFromMinutes(startTime, itemMinutes)
      return {
        key: `weekly:${rule.weekday}:${index + 1}`,
        row,
        type: hasWorker ? 'worker' : 'buffer',
        label,
        name: label,
        workerId: assignment?.workerId || '',
        workerLogin: assignment?.workerLogin || '',
        workerKey: assignment?.key || '',
        minutes: itemMinutes,
        startTime,
        endTime,
        planStartTime: startTime,
        planEndTime: endTime,
      }
    })
  }
  
  function ordersWeeklyPatternRuleForDate(order = {}, dayKey = '') {
    if (calendarTimelineRecurringUnit(order) !== 'week') {
      return null
    }
    const weekday = calendarTimelineDateWeekday(dayKey)
    if (weekday < 0) {
      return null
    }
    const rules = ordersWeeklyPatternSources(order)
      .map((rule) => ordersNormalizeWeeklyPatternRule(rule, order))
      .filter(Boolean)
    return rules.find((rule) => rule.weekday === weekday) || null
  }
  
  function ordersApplyWeeklyPatternRuleToOccurrence(order = {}, occurrenceDay = '') {
    const rule = ordersWeeklyPatternRuleForDate(order, occurrenceDay)
    if (!rule) {
      return order
    }
    const startTime = ordersNormalizeTimeField(rule.accessStartTime, order.startTime || '08:00')
    const endTime = ordersNormalizeTimeField(rule.accessEndTime, order.endTime || ordersDefaultEndTime(startTime))
    const endDateYmd =
      calendarTimelineTimeMinutes(endTime, 0) <= calendarTimelineTimeMinutes(startTime, 0)
        ? calendarAddDays(occurrenceDay, 1)
        : occurrenceDay
    const workAllocations = ordersWorkAllocationsForWeeklyPatternRule(order, rule)
    return {
      ...order,
      dateYmd: occurrenceDay,
      startTime,
      endDateYmd,
      endTime,
      validUntil: endDateYmd,
      accessStartTime: startTime,
      accessEndTime: endTime,
      requiredWorkMinutes: rule.requiredWorkMinutes,
      serviceWorkMinutes: rule.requiredWorkMinutes,
      standardWorkMinutes: rule.requiredWorkMinutes,
      requiredPeople: rule.requiredPeople,
      requiredWorkers: rule.requiredPeople,
      workerSlots: rule.requiredPeople,
      workAllocations,
      workerAllocations: workAllocations,
      weeklyPatternRule: rule,
    }
  }
  
  function ordersSyncScheduleMirrorFields(order = {}) {
    const mode = ordersScheduleModeForOrder(order)
    const timing = ordersPrimaryServiceBlockTiming(order)
    ordersSetInputValue('ordersScheduleStartDate', ordersNormalizeDateField(order.dateYmd, todayYmd()))
    ordersSetInputValue(
      'ordersScheduleEndDate',
      mode === 'repeat'
        ? ordersRepeatEndDateForOrder(order)
        : ordersNormalizeDateField(order.endDateYmd || order.validUntil || order.dateYmd, order.dateYmd || todayYmd()),
    )
    ordersSetInputValue('ordersScheduleStartTime', timing.startTime)
    ordersSetInputValue('ordersScheduleEndTime', timing.endTime)
  }
  
  function ordersSyncScheduleControls(order = {}) {
    const mode = ordersScheduleModeForOrder(order)
    ordersSetScheduleModeValue(mode)
    ordersSetScheduleRepeatDisabled(mode !== 'repeat')
    ordersSyncScheduleTimeLabels(mode)
    ordersSetScheduleTimeVisible(false)
    ordersSyncScheduleMirrorFields(order)
    ordersSetInputValue('ordersEditWorkHours', ordersHoursInputValue(ordersStoredWorkMinutes(order)))
    ordersSetInputValue('ordersEditRequiredPeople', order.requiredPeople || order.requiredWorkers || order.workerSlots || 1)
    const repeatPreset = ordersRepeatPresetFromOrder(order)
    ordersSetInputValue('ordersEditRepeatPreset', repeatPreset)
    ordersSetInputValue('ordersEditRepeatEvery', ordersRepeatPresetIsFixed(repeatPreset) ? 1 : order.repeatEvery || 1)
    ordersSetInputValue('ordersEditRepeatUnit', repeatPreset === 'month' ? 'month' : ordersRepeatPresetIsFixed(repeatPreset) ? repeatPreset : order.repeatUnit || 'week')
    ordersSetRepeatWeekdayChecks(ordersRepeatWeekdaysFromOrder(order))
    ordersSyncRepeatSelectPickers()
    ordersRenderWorkAllocationControls(order)
  }
  
  function ordersApplyRepeatPresetToControls(preset = '') {
    const normalized = String(preset ?? '').trim()
    if (['day', 'week', 'month', 'year'].includes(normalized)) {
      ordersSetInputValue('ordersEditRepeatEvery', 1)
      ordersSetInputValue('ordersEditRepeatUnit', normalized)
    }
    ordersSyncRepeatSelectPickers()
  }
  
  function ordersSyncMainScheduleFromMirror(targetId = '') {
    const pairs = {
      ordersScheduleStartDate: 'ordersEditStart',
      ordersScheduleEndDate: 'ordersEditEnd',
      ordersEditStart: 'ordersScheduleStartDate',
      ordersEditEnd: 'ordersScheduleEndDate',
    }
    const pairedId = pairs[targetId]
    if (pairedId) {
      ordersSetInputValue(pairedId, ordersReadInputValue(targetId))
    }
  }
  
  function ordersUpdateOrderScheduleFromControls(order = {}) {
    const mode = document.querySelector('#ordersEditorPanel input[name="ordersScheduleMode"]:checked')?.value === 'repeat' ? 'repeat' : 'once'
    const selectedType = ordersReadInputValue('ordersEditType') || order.type || 'individual'
    const startDay = ordersNormalizeDateField(ordersReadInputValue('ordersEditStart'), order.dateYmd || todayYmd())
    const rawEndDate = ordersNormalizeDateField(ordersReadInputValue('ordersEditEnd'), '')
    order.scheduleMode = mode
    order.type = mode === 'repeat' ? 'cyclic' : selectedType === 'cyclic' ? 'individual' : selectedType
    order.dateYmd = startDay
    order.endDateYmd = mode === 'repeat' ? startDay : ordersNormalizeDateField(rawEndDate, order.endDateYmd || startDay)
    order.validUntil = mode === 'repeat' ? '' : order.endDateYmd
    order.repeatUntil = mode === 'repeat' ? rawEndDate : ''
    order.repeatEndDate = mode === 'repeat' ? rawEndDate : ''
    order.recurrenceEndDate = mode === 'repeat' ? rawEndDate : ''
    order.seriesEndDate = mode === 'repeat' ? rawEndDate : ''
    const primaryTiming = ordersPrimaryServiceBlockTiming(order)
    order.startTime = primaryTiming.startTime
    order.endTime = primaryTiming.endTime
    order.accessStartTime = order.startTime
    order.accessEndTime = order.endTime
    ordersClearAccessWindows(order)
    order.requiredWorkMinutes = mode === 'repeat' ? ordersReadWorkMinutes(order) : calendarTimelineOrderDurationMinutes(order)
    order.serviceWorkMinutes = order.requiredWorkMinutes
    order.standardWorkMinutes = order.requiredWorkMinutes
    order.requiredPeople = Math.max(1, Math.floor(Number(ordersReadInputValue('ordersEditRequiredPeople')) || Number(order.requiredPeople) || 1))
    order.workerSlots = order.requiredPeople
    ordersAssignExtendedWorkFlags(order, ordersReadExtendedWorkAllowed())
    const repeatInterval = ordersRepeatIntervalFromControls(order)
    const repeatWeekdays = mode === 'repeat' ? ordersRepeatWeekdaysFromServiceBlocks(order) : ordersReadRepeatWeekdaysForMode(mode)
    const weeklyRules = []
    if (weeklyRules.length) {
      const firstRule = weeklyRules[0]
      order.startTime = firstRule.accessStartTime
      order.endTime = firstRule.accessEndTime
      order.accessStartTime = firstRule.accessStartTime
      order.accessEndTime = firstRule.accessEndTime
      order.requiredWorkMinutes = firstRule.requiredWorkMinutes
      order.serviceWorkMinutes = firstRule.requiredWorkMinutes
      order.standardWorkMinutes = firstRule.requiredWorkMinutes
      order.requiredPeople = firstRule.requiredPeople
      order.workerSlots = firstRule.requiredPeople
      ordersStoreWorkAllocations(order, ordersWorkAllocationsForWeeklyPatternRule(order, firstRule))
      ordersStoreWeeklyPatternRules(order, weeklyRules)
    } else {
      ordersStoreWeeklyPatternRules(order, [])
      if (mode === 'repeat') {
        ordersStoreWorkAllocations(order, ordersReadWorkAllocationsFromControls(order))
      }
    }
    order.repeatPreset = mode === 'repeat' ? repeatInterval.repeatPreset : 'none'
    order.repeatEvery = repeatInterval.repeatEvery
    order.repeatUnit = repeatInterval.repeatUnit
    order.repeatAfterDays = 0
    order.repeatWeekdays = weeklyRules.length ? weeklyRules.map((rule) => rule.weekday) : repeatWeekdays
    ordersSetRepeatWeekdayChecks(order.repeatWeekdays)
    ordersSetInputValue('ordersEditType', order.type)
    ordersSetScheduleRepeatDisabled(mode !== 'repeat')
    ordersSyncScheduleTimeLabels(mode)
    ordersSetScheduleTimeVisible(false)
    ordersSyncRepeatIntervalControls()
  }
  
  function ordersRenderSchedulePreview(order = {}) {
    const preview = document.getElementById('ordersSchedulePreview')
    if (preview) {
      const client = ordersTimelineClientLabel(order)
      const start = ordersNormalizeDateField(order.dateYmd, todayYmd())
      const isRepeat = ordersScheduleModeForOrder(order) === 'repeat'
      const end = isRepeat ? start : ordersNormalizeDateField(order.endDateYmd || order.validUntil || start, start)
      const repeatEnd = ordersRepeatEndDateForOrder(order)
      const startTime = ordersNormalizeTimeField(order.startTime, '08:00')
      const endTime = ordersNormalizeTimeField(order.endTime, ordersDefaultEndTime(startTime))
      const typeLabel = isRepeat ? 'Zlecenie cykliczne' : 'Zlecenie jednorazowe'
      const cadenceLabel = isRepeat ? ordersRepeatUnitLabel(order.repeatUnit, order.repeatEvery) : 'Bez powtarzania'
      const workerLabel = ordersPreviewWorkerLabel(order)
      const workLabel = isRepeat
        ? `Plan ${startTime}-${endTime} · praca ${ordersFormatWorkMinutes(ordersReadWorkMinutes(order))} rbh`
        : ''
      const repeatEndLabel = isRepeat ? (repeatEnd ? `do ${repeatEnd}` : 'bez daty końca') : ''
      preview.innerHTML = `
        <div class="orders-schedule-preview-row orders-schedule-preview-row--summary">
          <span class="orders-schedule-preview-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <rect x="4" y="5" width="16" height="15" rx="3"></rect>
              <path d="M8 3v4M16 3v4M4 10h16"></path>
              <path d="M9 14h.01M12 14h.01M15 14h.01M9 17h.01M12 17h.01"></path>
            </svg>
          </span>
          <div class="orders-schedule-preview-main">
            <strong>${escapeHtml(typeLabel)}</strong>
            <span>${escapeHtml(client || 'Nowe zlecenie')}</span>
            ${workerLabel ? `<span class="orders-schedule-preview-worker">Pracownik: ${escapeHtml(workerLabel)}</span>` : ''}
          </div>
          <div class="orders-schedule-preview-range" aria-label="Zakres wykonania">
            <span><em>Start</em><strong>${escapeHtml(`${start} ${startTime}`)}</strong></span>
            <span><em>Stop</em><strong>${escapeHtml(`${end} ${endTime}`)}</strong></span>
          </div>
          <div class="orders-schedule-preview-note${isRepeat ? '' : ' is-muted'}">
            ${escapeHtml(isRepeat && workLabel ? `${cadenceLabel} · ${repeatEndLabel} · ${workLabel}` : cadenceLabel)}
          </div>
        </div>
      `
    }
  
    ordersRenderRepeatCalendar(order)
  }
  
  function ordersRepeatCalendarNormalizeMonth(value = '', fallback = todayYmd()) {
    const raw = String(value ?? '').trim()
    if (/^\d{4}-\d{2}$/.test(raw)) {
      return `${raw}-01`
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return calendarMonthStart(raw)
    }
    return calendarMonthStart(ordersNormalizeDateField(fallback, todayYmd()))
  }
  
  function ordersSetRepeatCalendarMonthFromDate(value = '') {
    appState.ordersRepeatCalendarMonth = ordersRepeatCalendarNormalizeMonth(value, todayYmd())
  }
  
  function ordersRepeatCalendarVisibleDays(monthStart = todayYmd()) {
    const start = calendarMonthGridStart(monthStart)
    return Array.from({ length: 42 }, (_, index) => calendarAddDays(start, index))
  }
  
  function ordersBuildRepeatCalendarOrder(order = {}) {
    const checkedMode = document.querySelector('#ordersEditorPanel input[name="ordersScheduleMode"]:checked')?.value
    const mode = checkedMode ? (checkedMode === 'repeat' ? 'repeat' : 'once') : ordersScheduleModeForOrder(order)
    const selectedType = ordersReadInputValue('ordersEditType') || order.type || 'individual'
    const start = ordersNormalizeDateField(ordersReadInputValue('ordersEditStart'), order.dateYmd || todayYmd())
    const rawEnd = ordersNormalizeDateField(ordersReadInputValue('ordersEditEnd'), '')
    const end = mode === 'repeat' ? start : ordersNormalizeDateField(rawEnd, order.endDateYmd || order.validUntil || start)
    const repeatEnd = mode === 'repeat' ? rawEnd : ''
    const repeatInterval = ordersRepeatIntervalFromControls(order)
    const repeatWeekdays = mode === 'repeat' ? ordersRepeatWeekdaysFromServiceBlocks(order) : ordersReadRepeatWeekdaysForMode(mode)
    const weeklyRules = []
    const firstWeeklyRule = null
    const accessWindows = []
    const firstAccessWindow = accessWindows[0] || null
    const controlServiceBlocks = ordersReadServiceBlocksFromControls(order)
    const effectiveServiceBlocks = controlServiceBlocks.length ? controlServiceBlocks : ordersServiceBlocksForOrder(order)
    const primaryTiming = ordersPrimaryServiceBlockTiming(order, effectiveServiceBlocks)
    const serviceBlockTotals = ordersServiceBlocksTotals(effectiveServiceBlocks, order)
    const serviceBlockAllocations = effectiveServiceBlocks.flatMap((block) => Array.isArray(block.workAllocations) ? block.workAllocations : [])
    const effectiveStartTime = firstWeeklyRule?.accessStartTime || firstAccessWindow?.accessStartTime || primaryTiming.startTime
    const effectiveEndTime = firstWeeklyRule?.accessEndTime || firstAccessWindow?.accessEndTime || primaryTiming.endTime
    const effectiveWorkMinutes = firstWeeklyRule?.requiredWorkMinutes || serviceBlockTotals.totalWorkMinutes || (mode === 'repeat' ? ordersReadWorkMinutes(order) : calendarTimelineOrderDurationMinutes(order))
    const effectivePeople = firstWeeklyRule?.requiredPeople || serviceBlockTotals.totalPeople
    const effectiveAllocations = firstWeeklyRule
      ? ordersWorkAllocationsForWeeklyPatternRule(order, firstWeeklyRule)
      : serviceBlockAllocations.length
        ? serviceBlockAllocations
        : mode === 'repeat'
          ? ordersReadWorkAllocationsFromControls(order)
          : []
    const allowExtendedWork = ordersReadExtendedWorkAllowed()
  
    return ordersAssignExtendedWorkFlags({
      ...order,
      scheduleMode: mode,
      type: mode === 'repeat' ? 'cyclic' : selectedType === 'cyclic' ? 'individual' : selectedType,
      dateYmd: start,
      endDateYmd: end,
      validUntil: mode === 'repeat' ? '' : end,
      repeatUntil: repeatEnd,
      repeatEndDate: repeatEnd,
      recurrenceEndDate: repeatEnd,
      seriesEndDate: repeatEnd,
      startTime: effectiveStartTime,
      endTime: effectiveEndTime,
      accessStartTime: effectiveStartTime,
      accessEndTime: effectiveEndTime,
      requiredWorkMinutes: effectiveWorkMinutes,
      serviceWorkMinutes: effectiveWorkMinutes,
      requiredPeople: effectivePeople,
      requiredWorkers: effectivePeople,
      workerSlots: effectivePeople,
      serviceBlocks: effectiveServiceBlocks,
      workAllocations: effectiveAllocations,
      workerAllocations: effectiveAllocations,
      repeatPreset: mode === 'repeat' ? repeatInterval.repeatPreset : 'none',
      repeatEvery: repeatInterval.repeatEvery,
      repeatUnit: repeatInterval.repeatUnit,
      repeatAfterDays: 0,
      repeatWeekdays: weeklyRules.length ? weeklyRules.map((rule) => rule.weekday) : repeatWeekdays,
      accessWindows,
      objectAccessWindows: accessWindows,
      accessTimeWindows: accessWindows,
      buildingAccessWindows: accessWindows,
      weeklyScheduleRules: weeklyRules,
      weeklyPattern: weeklyRules,
      repeatDayRules: weeklyRules,
      dayScheduleRules: weeklyRules,
    }, allowExtendedWork)
  }
  
  function ordersMoveRepeatCalendarMonth(direction = 1) {
    const base = ordersRepeatCalendarNormalizeMonth(appState.ordersRepeatCalendarMonth || ordersReadInputValue('ordersEditStart'), todayYmd())
    const date = calendarDateFromYmd(base)
    date.setMonth(date.getMonth() + (Number(direction) < 0 ? -1 : 1), 1)
    appState.ordersRepeatCalendarMonth = calendarMonthStart(calendarDateToYmd(date))
  }
  
  function ordersRenderRepeatCalendar(order = {}) {
    const root = document.getElementById('ordersRepeatCalendar')
    const label = document.getElementById('ordersRepeatCalendarLabel')
    const grid = document.getElementById('ordersRepeatCalendarGrid')
    const summary = document.getElementById('ordersRepeatCalendarSummary')
    if (!root || !label || !grid) {
      return
    }
  
    const previewOrder = ordersBuildRepeatCalendarOrder(order)
    const startDay = ordersNormalizeDateField(previewOrder.dateYmd, todayYmd())
    if (!appState.ordersRepeatCalendarMonth) {
      appState.ordersRepeatCalendarMonth = calendarMonthStart(startDay)
    }
  
    const monthStart = ordersRepeatCalendarNormalizeMonth(appState.ordersRepeatCalendarMonth, startDay)
    const currentMonth = monthStart.slice(0, 7)
    const visibleDays = ordersRepeatCalendarVisibleDays(monthStart)
    const isRepeat = ordersScheduleModeForOrder(previewOrder) === 'repeat'
    const occurrenceDays = new Set()
    if (isRepeat) {
      const skippedDates = calendarTimelineRecurringSkippedDates(previewOrder)
      calendarTimelineRecurringDaysForRange(previewOrder, visibleDays).forEach((day) => {
        if (!skippedDates.has(day)) {
          occurrenceDays.add(day)
        }
      })
    }
  
    const today = todayYmd()
    label.textContent = calendarMonthLabel(monthStart).replace(/^./, (char) => char.toLocaleUpperCase('pl-PL'))
    root.classList.toggle('is-disabled', !isRepeat)
    grid.innerHTML = visibleDays
      .map((day) => {
        const dayNumber = Number(day.slice(8, 10))
        const outsideMonth = !day.startsWith(currentMonth)
        const isOccurrence = occurrenceDays.has(day)
        const className = [
          'orders-repeat-calendar-day',
          outsideMonth ? 'is-muted' : '',
          day === today ? 'is-today' : '',
          day === startDay ? 'is-start' : '',
          isOccurrence ? 'is-occurrence' : '',
        ]
          .filter(Boolean)
          .join(' ')
        return `<span class="${className}" title="${escapeHtml(day)}">${escapeHtml(String(dayNumber))}</span>`
      })
      .join('')
  
    if (summary) {
      const monthOccurrenceCount = visibleDays.filter((day) => day.startsWith(currentMonth) && occurrenceDays.has(day)).length
      summary.textContent = isRepeat ? `${monthOccurrenceCount} terminów w miesiącu` : 'Tryb jednorazowy'
    }
  }
  
  function ordersDeviceNotes(order = {}) {
    const source = Array.isArray(order?.deviceNotes)
      ? order.deviceNotes
      : Array.isArray(order?.deviceMessages)
        ? order.deviceMessages
        : []
    return source
      .map((note, index) => ({
        id: String(note?.id ?? `note-${index}`).trim() || `note-${index}`,
        subject: String(note?.subject ?? note?.title ?? note?.deviceLabel ?? '').trim(),
        description: String(note?.description ?? note?.message ?? note?.text ?? '').trim(),
        createdAt: String(note?.createdAt ?? '').trim(),
        createdBy: String(note?.createdBy ?? '').trim(),
        photo: note?.photo && typeof note.photo === 'object' ? note.photo : null,
      }))
      .filter((note) => note.subject || note.description || note.photo?.dataUrl)
  }
  
  function ordersDeviceNoteAuthorLabel() {
    return (
      String(appState.session?.name ?? '').trim() ||
      String(appState.session?.login ?? '').trim() ||
      String(appState.session?.email ?? '').trim() ||
      'System'
    )
  }
  
  function ordersDeviceNoteTimestampLabel(value = '') {
    const iso = String(value ?? '').trim()
    return iso ? `${formatDatePl(iso)} ${formatTime(iso)}` : ''
  }
  
  function ordersRenderDeviceNotes(order = {}) {
    const box = document.getElementById('ordersDeviceNotesRows')
    if (!box) {
      return
    }
    const notes = ordersDeviceNotes(order)
    box.hidden = !notes.length
    box.innerHTML = notes
      .map((note) => {
        const photoUrl = String(note.photo?.dataUrl ?? '').trim()
        const photoName = String(note.photo?.name ?? 'Zdjęcie').trim()
        const thumb = photoUrl
          ? `<a class="orders-device-note-thumb" href="${escapeHtml(photoUrl)}" target="_blank" rel="noopener noreferrer" title="Otwórz zdjęcie"><img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(photoName)}" /></a>`
          : '<div class="orders-device-note-thumb orders-device-note-thumb--empty">Brak zdjęcia</div>'
        const meta = [ordersDeviceNoteTimestampLabel(note.createdAt), note.createdBy].filter(Boolean).join(' · ')
        return `
          <article class="orders-device-note-row">
            ${thumb}
            <div class="orders-device-note-copy">
              <strong>${escapeHtml(note.subject || 'Opis')}</strong>
              ${note.description ? `<p>${escapeHtml(note.description)}</p>` : ''}
              ${meta ? `<small>${escapeHtml(meta)}</small>` : ''}
            </div>
          </article>
        `
      })
      .join('')
  }
  
  function ordersResetDeviceNoteForm(subject = '') {
    ordersSetInputValue('ordersDeviceNoteSubject', subject)
    ordersSetInputValue('ordersDeviceNoteDescription', '')
    const photo = document.getElementById('ordersDeviceNotePhoto')
    if (photo instanceof HTMLInputElement) {
      photo.value = ''
    }
    ordersRenderDeviceNotePhotoPreview()
  }
  
  function ordersOpenDeviceNoteModal() {
    const order = ordersFindTimelineOrder(appState.ordersEditingId)
    if (!order) {
      showTransientNotice('Najpierw otwórz zlecenie.', 'error')
      return
    }
    const subject = ordersReadInputValue('ordersEditDevice') || 'Opis / uwaga'
    ordersResetDeviceNoteForm(subject)
    const overlay = document.getElementById('ordersDeviceNoteOverlay')
    if (overlay) {
      overlay.hidden = false
    }
    document.getElementById('ordersDeviceNoteDescription')?.focus()
  }
  
  function ordersCloseDeviceNoteModal() {
    const overlay = document.getElementById('ordersDeviceNoteOverlay')
    if (overlay) {
      overlay.hidden = true
    }
  }
  
  function ordersDeviceNotePhotoFile() {
    const input = document.getElementById('ordersDeviceNotePhoto')
    return input instanceof HTMLInputElement ? input.files?.[0] ?? null : null
  }
  
  function ordersRenderDeviceNotePhotoPreview() {
    const preview = document.getElementById('ordersDeviceNotePhotoPreview')
    if (!preview) {
      return
    }
    const file = ordersDeviceNotePhotoFile()
    if (!file) {
      preview.textContent = 'Nie wybrano zdjęcia.'
      return
    }
    if (!String(file.type ?? '').startsWith('image/')) {
      preview.textContent = 'Wybierz plik graficzny.'
      return
    }
    preview.innerHTML = `
      <img src="${escapeHtml(URL.createObjectURL(file))}" alt="${escapeHtml(file.name)}" />
      <span>${escapeHtml(file.name)} · ${escapeHtml(formatBytes(file.size))}</span>
    `
  }
  
  function ordersReadImageFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(reader.error ?? new Error('Nie udało się odczytać zdjęcia.'))
      reader.readAsDataURL(file)
    })
  }
  
  async function ordersSaveDeviceNoteFromModal() {
    const order = ordersFindTimelineOrder(appState.ordersEditingId)
    if (!order) {
      showTransientNotice('Nie znaleziono zlecenia do zapisania opisu.', 'error')
      ordersCloseDeviceNoteModal()
      return
    }
  
    const subject = ordersReadInputValue('ordersDeviceNoteSubject') || 'Opis / uwaga'
    const description = ordersReadInputValue('ordersDeviceNoteDescription')
    const file = ordersDeviceNotePhotoFile()
    if (!description && !file) {
      showTransientNotice('Dodaj krótki opis albo zdjęcie.', 'error')
      return
    }
    if (file && !String(file.type ?? '').startsWith('image/')) {
      showTransientNotice('Zdjęcie musi być plikiem graficznym.', 'error')
      return
    }
    if (file && file.size > 6 * 1024 * 1024) {
      showTransientNotice('Zdjęcie jest za duże. Wybierz plik do 6 MB.', 'error')
      return
    }
  
    const photo = file
      ? {
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl: await ordersReadImageFileAsDataUrl(file),
        }
      : null
    const note = {
      id: `device-note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      subject,
      description,
      photo,
      createdAt: new Date().toISOString(),
      createdBy: ordersDeviceNoteAuthorLabel(),
    }
    order.deviceNotes = [...ordersDeviceNotes(order), note]
    order.deviceMessages = order.deviceNotes
    ordersRenderDeviceNotes(order)
    ordersCloseDeviceNoteModal()
    showTransientNotice('Dodano opis do zlecenia.')
  }
  
  function ordersRenderEditor(order = {}) {
    const listPanel = document.getElementById('ordersListPanel')
    const editorPanel = document.getElementById('ordersEditorPanel')
    if (!editorPanel) {
      return
    }
  
    if (listPanel) {
      listPanel.hidden = false
    }
    editorPanel.hidden = false
  
    const title = document.getElementById('ordersEditTitle')
    if (title) {
      title.textContent = 'Edycja zlecenia'
    }
  
    const orderClientType = String(order.clientType ?? order.customerType ?? '').trim().toLowerCase()
    const isUnselectedDraftClient = Boolean(
      order.isDraft && !order.clientId && !order.clientLabel && !order.clientName && !orderClientType,
    )
    const isOrderIndividualClient = orderClientType === 'individual'
    const renderClientLabel = isUnselectedDraftClient
      ? ''
      : isOrderIndividualClient && order.isDraft
        ? ORDERS_INDIVIDUAL_CLIENT_LABEL
        : ordersTimelineClientLabel(order)
    const selectedClientForRender = isOrderIndividualClient
      ? null
      : ordersFindClientBySelection(order.clientId || order.clientLabel || renderClientLabel)
    const isIndividualOrder = !isUnselectedDraftClient && (isOrderIndividualClient || (
      !selectedClientForRender &&
      ordersIsIndividualClientSelection(renderClientLabel)
    ))
    const clientSelect = document.getElementById('ordersEditClient')
    if (clientSelect instanceof HTMLSelectElement) {
      clientSelect.innerHTML = ordersClientOptionsHtml(isIndividualOrder ? ORDERS_INDIVIDUAL_CLIENT_VALUE : renderClientLabel)
    }
  
    const workerSelect = document.getElementById('ordersEditWorker')
    if (workerSelect instanceof HTMLSelectElement) {
      workerSelect.innerHTML = ordersWorkerOptionsHtml(Number(order.row ?? 0))
    }
  
    const startDay = ordersNormalizeDateField(order.dateYmd, todayYmd())
    const scheduleMode = ordersScheduleModeForOrder(order)
    const validUntil =
      scheduleMode === 'repeat'
        ? ordersRepeatEndDateForOrder(order)
        : ordersNormalizeDateField(order.validUntil || order.dateTo || order.endValidDate || order.endDateYmd || startDay, startDay)
    const nextDate = ordersNormalizeDateField(order.nextDate || startDay, startDay)
    const type = String(order.type ?? 'other').trim() || 'other'
    const duration = ordersDurationHours(order)
    const orderClientLabel = renderClientLabel
    const selectedClient = selectedClientForRender
    const selectedClientData = selectedClient ? ordersClientFormData(selectedClient) : {}
    const defaultClientAddress = ordersClientAddressLabel(selectedClientData)
    const explicitExecutionAddress = ordersExplicitExecutionAddressLabel(order, defaultClientAddress)
    const timelineAddress = ordersTimelineAddressLabel(order)
    const mapAddress = explicitExecutionAddress || defaultClientAddress || (timelineAddress === '-' ? '' : timelineAddress)
  
    const visibleOrderTitle = order.isDraft && normalizeSearchText(order.title) === normalizeSearchText('Nowe zlecenie')
      ? ''
      : order.title || ''
    const descriptionValue =
      order.description ||
      (order.isDraft && normalizeSearchText(order.title) === normalizeSearchText('Nowe zlecenie') ? '' : order.title || '')
    ordersEnsureOrderNameField()
    ordersSetInputValue('ordersEditName', visibleOrderTitle)
    ordersSetInputValue('ordersEditClient', isIndividualOrder ? ORDERS_INDIVIDUAL_CLIENT_VALUE : orderClientLabel)
    ordersSyncClientPicker(isIndividualOrder ? ORDERS_INDIVIDUAL_CLIENT_VALUE : orderClientLabel)
    ordersSetIndividualClientFieldsVisible(isIndividualOrder)
    const individualClientNameValue = isIndividualOrder
      ? order.clientName || (ordersIsIndividualClientSelection(order.clientLabel) ? '' : order.clientLabel || '')
      : ''
    ordersSetInputValue('ordersIndividualName', individualClientNameValue)
    ordersSetInputValue('ordersIndividualNip', isIndividualOrder ? order.clientNip || order.nip || '' : '')
    ordersSetInputValue('ordersIndividualPhone', isIndividualOrder ? order.phone || order.clientPhone || '' : '')
    ordersSetInputValue('ordersIndividualEmail', isIndividualOrder ? order.email || order.clientEmail || '' : '')
    ordersSetInputValue('ordersEditStart', startDay)
    ordersSetInputValue('ordersEditNext', nextDate)
    ordersSetInputValue('ordersEditEnd', validUntil)
    ordersSetInputValue('ordersEditDurationHours', duration)
    ordersSetInputValue('ordersEditLocation', explicitExecutionAddress)
    ordersRenderClientAddressSelect(selectedClient, explicitExecutionAddress)
    ordersSetLocationGeoFields({
      placeId: order.placeId || order.googlePlaceId || '',
      lat: order.lat || order.latitude || '',
      lng: order.lng || order.longitude || '',
      mapUrl: order.mapUrl || order.googleMapsUrl || ordersGoogleMapsSearchUrl(mapAddress),
    })
    ordersSetInputValue('ordersEditRepeatEvery', order.repeatEvery || 1)
    ordersSetInputValue('ordersEditRepeatUnit', order.repeatUnit || 'week')
    ordersSetInputValue('ordersEditPriority', order.priority || 'Normalny')
    ordersSetInputValue('ordersEditAdvance', order.advanceDays || 0)
    ordersSetInputValue('ordersEditType', ['individual', 'cyclic', 'renovation', 'windows', 'other'].includes(type) ? type : 'other')
    ordersSetInputValue('ordersEditPrice', order.price || 0)
    ordersSetInputValue('ordersEditTaskName', order.taskName || '')
    ordersSetInputValue('ordersEditSms', order.smsText || '')
    ordersSetInputValue('ordersEditSmsTime', order.smsTime || '')
    ordersSetInputValue('ordersEditPhone', order.phone || '')
    ordersSetInputValue('ordersEditDescription', descriptionValue)
    ordersSetInputValue('ordersEditWorkerComment', ordersWorkerOnlyComment(order))
    ordersSetCheckboxValue('ordersEditAllowExtendedWork', ordersExtendedWorkAllowed(order))
    ordersSetInputValue('ordersEditClientName', isIndividualOrder ? ORDERS_INDIVIDUAL_CLIENT_LABEL : order.clientName || order.clientLabel || selectedClientData.clientName || '')
    ordersSetInputValue('ordersEditNip', order.nip || order.clientNip || selectedClientData.nip || '')
    ordersSetInputValue('ordersEditStreet', order.street || order.clientStreet || selectedClientData.street || '')
    ordersSetInputValue('ordersEditCity', order.city || order.clientCity || selectedClientData.city || '')
    ordersSetInputValue('ordersEditPostCode', order.postCode || order.postalCode || order.clientPostCode || selectedClientData.postCode || '')
    ordersSetInputValue('ordersEditRegion', order.region || order.clientRegion || selectedClientData.region || '')
    ordersSetInputValue('ordersEditCountry', order.country || order.clientCountry || selectedClientData.country || '')
    ordersSetInputValue('ordersEditEmail', order.email || order.clientEmail || selectedClientData.email || '')
    ordersRenderWorkerChecklist(order)
    ordersRenderDeviceNotes(order)
    ordersRenderObjectPlan(order)
    ordersRenderSubtasksAndSupplies(order)
    ordersSyncScheduleControls(order)
    ordersRenderJobCardOperationalFields(order)
    ordersRenderSchedulePreview(order)
    ordersRenderCoworkerRows(order)
    ordersRenderEditorTabs()
    ordersRenderEditorWizard(order)
    ordersHideLocationSuggestions()
  }
  
  function ordersOpenEditor(orderId) {
    const order = ordersFindTimelineOrder(orderId)
    if (!order) {
      showTransientNotice('Nie znaleziono zlecenia do edycji.', 'error')
      return
    }
    ordersClearEditorServiceBlockContext()
    ordersJobCardWarningAcknowledgements = new Set()
    void ordersWarmLocationSources()
    appState.ordersEditingId = String(orderId ?? '').trim()
    appState.ordersEditorMode = 'edit'
    appState.ordersEditorTab = 'basic'
    appState.ordersEditorStep = 'client'
    ordersSetRepeatCalendarMonthFromDate(order.dateYmd)
    appState.ordersObjectPlanCalendarMonth = calendarMonthStart(order.dateYmd || todayYmd())
    appState.ordersObjectPlanSelectedZoneKeys = []
    appState.ordersObjectPlanDayEditorDate = ''
    appState.ordersObjectPlanZoneWindowOpen = false
    appState.ordersObjectPlanTaskWindowOpen = false
    ordersEditorDirty = false
    ordersEditorSaving = false
    ordersEditorInitialSnapshot = ordersCloneEditorOrder(order)
    renderOrdersView()
  }
  
  function ordersOpenEditorFromCalendar(orderId, options = {}) {
    const id = String(orderId ?? '').trim()
    if (!ordersFindTimelineOrder(id)) {
      showTransientNotice('Nie znaleziono zlecenia do edycji.', 'error')
      return
    }
  
    ordersSetEditorServiceBlockContext({ ...options, sourceOrderId: id })
    ordersJobCardWarningAcknowledgements = new Set()
    appState.ordersEditingId = id
    appState.ordersEditorMode = 'edit'
    appState.ordersEditorTab = 'basic'
    appState.ordersEditorStep = 'client'
    ordersSetRepeatCalendarMonthFromDate(ordersFindTimelineOrder(id)?.dateYmd)
    appState.ordersObjectPlanCalendarMonth = calendarMonthStart(ordersFindTimelineOrder(id)?.dateYmd || todayYmd())
    appState.ordersObjectPlanSelectedZoneKeys = []
    appState.ordersObjectPlanDayEditorDate = ''
    appState.ordersObjectPlanZoneWindowOpen = false
    appState.ordersObjectPlanTaskWindowOpen = false
    ordersEditorDirty = false
    ordersEditorSaving = false
    ordersEditorInitialSnapshot = ordersCloneEditorOrder(ordersFindTimelineOrder(id))
    document.querySelector('[data-route="orders"]')?.click()
    window.setTimeout(() => {
      renderOrdersView()
      void ordersWarmLocationSources()
    }, 0)
  }

  function ordersWorkSlotKeyFromOrderId(orderId = '') {
    const raw = String(orderId ?? '').trim()
    const marker = '__workslot__'
    const index = raw.lastIndexOf(marker)
    return index >= 0 ? raw.slice(index + marker.length).trim() : ''
  }

  function ordersAllocationKeyCandidates(allocation = {}) {
    return [
      allocation?.key,
      allocation?.slotId,
      allocation?.workSlotId,
      allocation?.id,
    ]
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)
  }

  function ordersOrderContainsWorkSlotKey(order = {}, workSlotKey = '') {
    const key = String(workSlotKey ?? '').trim()
    if (!key) {
      return true
    }
    const matchesAllocation = (allocation = {}) => ordersAllocationKeyCandidates(allocation).includes(key)
    const orderAllocations = [
      ...(Array.isArray(order?.workAllocations) ? order.workAllocations : []),
      ...(Array.isArray(order?.workerAllocations) ? order.workerAllocations : []),
    ]
    if (orderAllocations.some(matchesAllocation)) {
      return true
    }
    const serviceBlocks = Array.isArray(order?.serviceBlocks) ? order.serviceBlocks : []
    return serviceBlocks.some((block) => {
      const blockAllocations = [
        ...(Array.isArray(block?.workAllocations) ? block.workAllocations : []),
        ...(Array.isArray(block?.workerAllocations) ? block.workerAllocations : []),
      ]
      return blockAllocations.some(matchesAllocation)
    })
  }
  
  function ordersOpenRecurringOccurrenceEditorFromCalendar(sourceOrderId = '', occurrenceDateYmd = '', options = {}) {
    ordersJobCardWarningAcknowledgements = new Set()
    const sourceId = String(sourceOrderId ?? '').trim()
    const occurrenceDay = String(occurrenceDateYmd ?? '').trim()
    const sourceOrder = calendarTimelineSourceOrderById(sourceId)
    if (!sourceOrder || !calendarTimelineOrderIsRecurring(sourceOrder) || !/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDay)) {
      showTransientNotice('Nie znaleziono wystąpienia cyklicznego do edycji.', 'error')
      return
    }
  
    const overrideId = calendarTimelineRecurringOverrideId(sourceId, occurrenceDay)
    const existingOverride = ordersFindTimelineOrder(overrideId)
    const requestedWorkSlotKey = String(options?.workSlotKey ?? '').trim() || ordersWorkSlotKeyFromOrderId(options?.orderId)
    const builtOverride = calendarTimelineBuildSingleOccurrenceOverride(sourceOrder, occurrenceDay, {
      isDraft: true,
      updatedAt: new Date().toISOString(),
    })
    const existingMatchesRequestedSlot = !requestedWorkSlotKey || ordersOrderContainsWorkSlotKey(existingOverride, requestedWorkSlotKey)
    const shouldReplaceExistingOverride = Boolean(existingOverride && builtOverride && !existingMatchesRequestedSlot)
    const overrideOrder = shouldReplaceExistingOverride
      ? builtOverride
      : existingOverride || builtOverride
    if (!overrideOrder) {
      showTransientNotice('Nie udało się przygotować edycji tego dnia.', 'error')
      return
    }
  
    ordersSetEditorServiceBlockContext({
      ...options,
      sourceOrderId: sourceId,
      orderId: options?.orderId || overrideId,
      occurrenceDateYmd: occurrenceDay,
    })
    if (!existingOverride || shouldReplaceExistingOverride) {
      appState.calendarTimelineDemoOrders = [
        overrideOrder,
        ...ordersListSourceOrders().filter((order) => String(order?.id ?? '') !== overrideId),
      ]
    }
    appState.ordersEditingId = overrideId
    appState.ordersEditorMode = 'single-override'
    appState.ordersEditorTab = 'basic'
    appState.ordersEditorStep = 'client'
    ordersEditorDirty = false
    ordersEditorSaving = false
    ordersEditorInitialSnapshot = existingOverride && !shouldReplaceExistingOverride
      ? ordersCloneEditorOrder(existingOverride)
      : null
    ordersSetRepeatCalendarMonthFromDate(occurrenceDay)
    document.querySelector('[data-route="orders"]')?.click()
    window.setTimeout(() => {
      renderOrdersView()
      void ordersWarmLocationSources()
    }, 0)
  }
  
  function ordersShowList(options = {}) {
    if (options.force !== true && ordersEditorHasUnsavedChanges()) {
      ordersOpenDiscardConfirm()
      return false
    }
    ordersCloseDiscardConfirm({ focus: false })
    ordersCloseDeviceNoteModal()
    if (ordersEditorDirty) {
      ordersRestoreEditorSnapshot()
    }
    ordersDiscardDraftIfNeeded()
    ordersClearEditorServiceBlockContext()
    ordersJobCardWarningAcknowledgements = new Set()
    appState.ordersEditingId = ''
    appState.ordersEditorMode = 'edit'
    appState.ordersEditorTab = 'basic'
    appState.ordersEditorStep = 'client'
    appState.ordersRepeatCalendarMonth = ''
    ordersEditorDirty = false
    ordersEditorSaving = false
    ordersEditorInitialSnapshot = null
    renderOrdersView()
    return true
  }

  function ordersUpsertLocalSavedOrder(order = {}) {
    const id = String(order?.id ?? '').trim()
    if (!id) {
      return
    }
    appState.calendarTimelineDemoOrders = [
      order,
      ...ordersListSourceOrders().filter((item) => String(item?.id ?? '').trim() !== id && !item?.isDraft),
    ]
  }

  function ordersSetRefreshButtonState(isRefreshing = false) {
    const button = document.getElementById('ordersRefreshBtn')
    if (!(button instanceof HTMLButtonElement)) {
      return
    }
    button.disabled = Boolean(isRefreshing)
    button.classList.toggle('is-loading', Boolean(isRefreshing))
    button.setAttribute('aria-busy', isRefreshing ? 'true' : 'false')
  }

  function ordersRenderActiveScheduleView() {
    if (appState.currentRoute === 'orders') {
      renderOrdersView()
      return
    }
    if (appState.currentRoute === 'ordersMap') {
      renderOrdersMapView()
      return
    }
    if (appState.currentRoute === 'calendar' && typeof renderCalendarView === 'function') {
      renderCalendarView()
      return
    }
    if (appState.currentRoute === 'dashboard' && typeof renderDashboardActivityCalendar === 'function') {
      renderDashboardActivityCalendar(appState.dashboardTodayRows)
    }
  }

  async function ordersRefreshListFromRemote() {
    if (appState.ordersRefreshing) {
      return
    }
    appState.ordersRefreshing = true
    ordersSetRefreshButtonState(true)
    try {
      appState.ordersJobCardDraftsLoaded = false
      const draftRefresh = ordersLoadJobCardDrafts({ force: true, silent: true })
      if (typeof deferRouteOrderDataRefresh === 'function') {
        await deferRouteOrderDataRefresh('orders', renderOrdersView, { force: true })
      } else {
        renderOrdersView()
      }
      await draftRefresh
      if (appState.calendarTimelineOrdersRemoteLoaded || typeof deferRouteOrderDataRefresh !== 'function') {
        showTransientNotice('Lista zlece\u0144 od\u015bwie\u017cona.', 'success')
      }
    } catch (error) {
      console.warn('[portal/orders] refresh failed', error)
      showPortalErrorNotice('Nie uda\u0142o si\u0119 od\u015bwie\u017cy\u0107 listy zlece\u0144.', error)
    } finally {
      appState.ordersRefreshing = false
      renderOrdersView()
    }
  }
  
  async function ordersSaveEditor(options = {}) {
    const order = ordersFindTimelineOrder(appState.ordersEditingId)
    if (!order) {
      showTransientNotice('Nie znaleziono zlecenia do zapisu.', 'error')
      ordersShowList({ force: true })
      return
    }
    const isAddMode = appState.ordersEditorMode === 'add'
    if (!ordersValidateAllEditorSteps(order)) {
      return
    }
    if (ordersEditorSaving) {
      return
    }
    ordersSetEditorSaving(true)
    try {
  
    const selectedType = String(ordersReadInputValue('ordersEditType') || order.type || 'individual').trim()
    const scheduleMode =
      document.querySelector('#ordersEditorPanel input[name="ordersScheduleMode"]:checked')?.value === 'repeat' ||
      selectedType === 'cyclic'
        ? 'repeat'
        : 'once'
    const dateYmd = ordersNormalizeDateField(ordersReadInputValue('ordersEditStart'), ordersNormalizeDateField(order.dateYmd, todayYmd()))
    const editorServiceBlocksFromControls = ordersReadServiceBlocksFromControls(order)
    const editorServiceBlocksForTiming = editorServiceBlocksFromControls.length ? editorServiceBlocksFromControls : ordersServiceBlocksForOrder(order)
    const editorPrimaryTiming = ordersPrimaryServiceBlockTiming(order, editorServiceBlocksForTiming)
    const startTime = editorPrimaryTiming.startTime
    const endTime = editorPrimaryTiming.endTime
    const startMinutes = calendarTimelineTimeMinutes(startTime, 8 * 60)
    const endMinutes = calendarTimelineTimeMinutes(endTime, startMinutes + 60)
    const repeatInterval = ordersRepeatIntervalFromControls(order)
    const rawEndDate = ordersNormalizeDateField(ordersReadInputValue('ordersEditEnd'), '')
    const repeatEndDate = scheduleMode === 'repeat' ? rawEndDate : ''
    const explicitEndDate = scheduleMode === 'repeat' ? dateYmd : ordersNormalizeDateField(rawEndDate, dateYmd)
    let endDateYmd = explicitEndDate
    if (scheduleMode !== 'repeat' && endDateYmd === dateYmd && endMinutes <= startMinutes) {
      endDateYmd = calendarAddDays(dateYmd, 1)
    }
    if (scheduleMode === 'repeat' && repeatEndDate && repeatEndDate < dateYmd) {
      showTransientNotice('Data końca cyklu nie może być wcześniejsza niż data START.', 'error')
      return
    }
    if (scheduleMode !== 'repeat' && explicitEndDate < dateYmd) {
      showTransientNotice('Data zakończenia pierwszego zlecenia nie może być wcześniejsza niż data rozpoczęcia.', 'error')
      return
    }
    const assignmentResources = calendarTimelineResources()
    const selectedRows = ordersReadSelectedWorkerRows()
    const row = Number(ordersReadInputValue('ordersEditWorker'))
    const safeRow = selectedRows[0] ?? (Number.isInteger(row) && row >= 0 ? row : Number(order.row ?? 0))
    const assignmentRows = selectedRows.length ? selectedRows : [safeRow]
    const selectedWorkerAssignments = ordersWorkerAssignmentsFromRows(assignmentRows, assignmentResources)
    const preserveInactiveAssignments = ordersShouldPreserveInactiveWorkerAssignments(
      order,
      assignmentRows,
      selectedWorkerAssignments,
      assignmentResources,
    )
    const workerAssignmentState = preserveInactiveAssignments
      ? ordersPreservedWorkerAssignmentState(order, assignmentRows)
      : {
          row: safeRow,
          assignedRows: assignmentRows,
          workerAssignments: selectedWorkerAssignments,
        }
    const type = scheduleMode === 'repeat' ? 'cyclic' : selectedType === 'cyclic' ? 'individual' : selectedType
    const selectedRepeatWeekdays = scheduleMode === 'repeat' ? ordersRepeatWeekdaysFromServiceBlocks(order) : ordersReadRepeatWeekdaysForMode(scheduleMode)
    const weeklyRules = []
    const firstWeeklyRule = null
    const accessWindows = []
    const firstAccessWindow = accessWindows[0] || null
    const allocationBaseOrder = {
      ...order,
      scheduleMode,
      dateYmd,
      startTime,
      endDateYmd,
      endTime,
      accessWindows,
      objectAccessWindows: accessWindows,
      accessTimeWindows: accessWindows,
      buildingAccessWindows: accessWindows,
      assignedRows: workerAssignmentState.assignedRows,
      row: workerAssignmentState.row,
    }
    const controlServiceBlocks = editorServiceBlocksFromControls.length
      ? editorServiceBlocksFromControls
      : ordersReadServiceBlocksFromControls(allocationBaseOrder)
    const serviceBlocks = ordersStoreServiceBlocks(
      allocationBaseOrder,
      controlServiceBlocks.length ? controlServiceBlocks : ordersServiceBlocksForOrder(allocationBaseOrder),
    )
    const hasServiceBlocksV2 = serviceBlocks.length > 0
    const firstServiceBlock = serviceBlocks[0] || null
    const requiredWorkMinutes = Math.max(
      15,
      Number(allocationBaseOrder.requiredWorkMinutes) ||
        (firstWeeklyRule ? firstWeeklyRule.requiredWorkMinutes : 0) ||
        calendarTimelineOrderDurationMinutes(allocationBaseOrder),
    )
    const requiredPeople = Math.max(
      1,
      Math.floor(
        Number(allocationBaseOrder.requiredPeople) ||
          (firstWeeklyRule ? firstWeeklyRule.requiredPeople : 0) ||
          Number(ordersReadInputValue('ordersEditRequiredPeople')) ||
          1,
      ),
    )
    const workAllocations = Array.isArray(allocationBaseOrder.workAllocations) && allocationBaseOrder.workAllocations.length
      ? allocationBaseOrder.workAllocations
      : firstWeeklyRule
        ? ordersWorkAllocationsForWeeklyPatternRule(allocationBaseOrder, firstWeeklyRule)
        : scheduleMode === 'repeat'
          ? ordersReadWorkAllocationsFromControls(order)
          : []
    const effectiveAssignedRows = (Array.isArray(allocationBaseOrder.assignedRows) && allocationBaseOrder.assignedRows.length
      ? allocationBaseOrder.assignedRows
      : workerAssignmentState.assignedRows
    )
      .map((rowIndex) => Number(rowIndex))
      .filter((rowIndex, index, list) => Number.isInteger(rowIndex) && rowIndex >= 0 && list.indexOf(rowIndex) === index)
    const effectiveRow = effectiveAssignedRows[0] ?? workerAssignmentState.row
    const effectiveWorkerAssignments = effectiveAssignedRows.length
      ? ordersWorkerAssignmentsFromRows(effectiveAssignedRows, assignmentResources)
      : workerAssignmentState.workerAssignments
    const assignedWorkMinutes = workAllocations.reduce((sum, item) => sum + Math.max(0, Number(item.minutes) || 0), 0)
    const requiredWorkTotalMinutes = requiredWorkMinutes
    if (scheduleMode === 'repeat' && !hasServiceBlocksV2 && !weeklyRules.length) {
      if (Math.abs(assignedWorkMinutes - requiredWorkTotalMinutes) > 0) {
        showTransientNotice('Nie zapisano: suma godzin osób musi być równa wymaganym roboczogodzinom.', 'error')
        ordersUpdateWorkAllocationSummary(order)
        return
      }
    }
    const clientLabel = ordersReadInputValue('ordersEditClient')
    const isIndividualClient = ordersIsIndividualClientSelection(clientLabel)
    if (!clientLabel || (!isIndividualClient && (clientLabel === ORDERS_RETAIL_CLIENT_VALUE || clientLabel === ORDERS_NEW_CLIENT_VALUE))) {
      showTransientNotice('Nie zapisano: wybierz klienta z listy.', 'error')
      return
    }
    const selectedClient = isIndividualClient ? null : ordersFindClientBySelection(clientLabel)
    if (!isIndividualClient && !selectedClient) {
      showTransientNotice('Nie zapisano: wybierz klienta istniejącego w bazie albo dodaj nowego klienta.', 'error')
      return
    }
    const individualClientDraft = isIndividualClient ? ordersReadIndividualClientDraft() : null
    const selectedClientData = selectedClient ? ordersClientFormData(selectedClient) : {}
    const clientName = individualClientDraft?.name || ordersReadInputValue('ordersEditClientName') || selectedClientData.clientName
    const clientStreet = ordersReadInputValue('ordersEditStreet') || selectedClientData.street
    const clientCity = ordersReadInputValue('ordersEditCity') || selectedClientData.city
    const clientPostCode = ordersReadInputValue('ordersEditPostCode') || selectedClientData.postCode
    const executionAddressLabel = ordersReadInputValue('ordersEditLocation')
    const defaultClientAddressLabel = ordersClientAddressLabel({
      street: clientStreet,
      city: clientCity,
      postCode: clientPostCode,
    })
    const clientAddressLabel = executionAddressLabel || defaultClientAddressLabel
    const rawTitle = ordersReadInputValue('ordersEditName')
    const generatedTitle = [clientName || clientLabel || 'Zlecenie', clientAddressLabel].filter(Boolean).join(' - ')
    const title = normalizeSearchText(rawTitle) === normalizeSearchText('Nowe zlecenie')
      ? generatedTitle
      : rawTitle || generatedTitle
    const description = ordersReadInputValue('ordersEditDescription') || ordersEditorGeneratedDescription(order) || order.description || title
    const workerComment = ordersReadInputValue('ordersEditWorkerComment')
    const subtasks = ordersReadEditorSubtasks(order)
    const supplies = ordersReadEditorSupplies(order)
    const objectPlanTasks = ordersObjectPlanTasks(order)
    const jobCardOperationalFields = ordersReadJobCardOperationalFields(order)
    const equipmentToTake = supplies.filter((item) => ordersSupplyKind(item.kind) === 'equipment')
    const chemicalsToTake = supplies.filter((item) => ordersSupplyKind(item.kind) === 'chemical')
    const allowExtendedWork = ordersReadExtendedWorkAllowed()
    const nowIso = new Date().toISOString()
    const savedStartTime = firstServiceBlock?.startTime || firstWeeklyRule?.accessStartTime || firstAccessWindow?.accessStartTime || startTime
    const savedEndTime = firstServiceBlock?.endTime || firstWeeklyRule?.accessEndTime || firstAccessWindow?.accessEndTime || endTime
    const savedEndDateYmd =
      (firstWeeklyRule || firstServiceBlock) && calendarTimelineTimeMinutes(savedEndTime, 0) <= calendarTimelineTimeMinutes(savedStartTime, 0)
        ? calendarAddDays(dateYmd, 1)
        : endDateYmd
    const savedRepeatWeekdays = serviceBlocks.length
      ? serviceBlocks
          .flatMap((block) => block.weekdays || [])
          .filter((weekday, index, list) => Number.isInteger(weekday) && list.indexOf(weekday) === index)
      : weeklyRules.length
        ? weeklyRules.map((rule) => rule.weekday)
        : selectedRepeatWeekdays
  
    const nextOrder = ordersAssignExtendedWorkFlags({
      ...order,
      isDraft: false,
      createdAt: String(order.createdAt ?? '').trim() || nowIso,
      updatedAt: nowIso,
      row: effectiveRow,
      assignedRows: effectiveAssignedRows,
      workerAssignments: effectiveWorkerAssignments,
      dateYmd,
      startTime: savedStartTime,
      endDateYmd: savedEndDateYmd,
      endTime: savedEndTime,
      validUntil: scheduleMode === 'repeat' ? '' : explicitEndDate,
      repeatUntil: repeatEndDate,
      repeatEndDate,
      recurrenceEndDate: repeatEndDate,
      seriesEndDate: repeatEndDate,
      scheduleMode,
      accessStartTime: savedStartTime,
      accessEndTime: savedEndTime,
      accessWindows,
      objectAccessWindows: accessWindows,
      accessTimeWindows: accessWindows,
      buildingAccessWindows: accessWindows,
      requiredWorkMinutes,
      serviceWorkMinutes: requiredWorkMinutes,
      standardWorkMinutes: requiredWorkMinutes,
      requiredPeople,
      requiredWorkers: requiredPeople,
      workerSlots: requiredPeople,
      serviceModelVersion: ORDERS_SERVICE_MODEL_VERSION,
      serviceBlocks,
      workAllocations,
      workerAllocations: workAllocations,
      nextDate: ordersNormalizeDateField(ordersReadInputValue('ordersEditNext'), dateYmd),
      title: title || order.title || 'Zlecenie',
      clientId: isIndividualClient ? '' : selectedClientData.clientId || order.clientId || '',
      clientLabel: clientName || clientLabel,
      clientName,
      customerType: isIndividualClient ? 'B2C' : 'B2B',
      clientType: isIndividualClient ? 'individual' : order.clientType,
      nip: individualClientDraft?.nip || ordersReadInputValue('ordersEditNip') || selectedClientData.nip,
      clientNip: individualClientDraft?.nip || ordersReadInputValue('ordersEditNip') || selectedClientData.nip,
      street: clientStreet,
      clientStreet,
      city: clientCity,
      clientCity,
      postCode: clientPostCode,
      postalCode: clientPostCode,
      clientPostCode,
      region: ordersReadInputValue('ordersEditRegion') || selectedClientData.region,
      country: ordersReadInputValue('ordersEditCountry') || selectedClientData.country,
      email: individualClientDraft?.email || ordersReadInputValue('ordersEditEmail') || selectedClientData.email,
      contact: individualClientDraft?.email || ordersReadInputValue('ordersEditEmail') || selectedClientData.contact,
      addressLabel: clientAddressLabel,
      executionAddressLabel,
      customAddressLabel: executionAddressLabel,
      googlePlaceId: ordersReadInputValue('ordersEditLocationPlaceId'),
      placeId: ordersReadInputValue('ordersEditLocationPlaceId'),
      lat: ordersReadInputValue('ordersEditLocationLat'),
      lng: ordersReadInputValue('ordersEditLocationLng'),
      mapUrl: ordersReadInputValue('ordersEditLocationMapUrl') || ordersGoogleMapsSearchUrl(clientAddressLabel),
      googleMapsUrl: ordersReadInputValue('ordersEditLocationMapUrl') || ordersGoogleMapsSearchUrl(clientAddressLabel),
      repeatPreset: scheduleMode === 'repeat' ? repeatInterval.repeatPreset : 'none',
      repeatEvery: repeatInterval.repeatEvery,
      repeatUnit: repeatInterval.repeatUnit,
      repeatAfterDays: 0,
      repeatWeekdays: savedRepeatWeekdays,
      weeklyScheduleRules: weeklyRules,
      weeklyPattern: weeklyRules,
      repeatDayRules: weeklyRules,
      dayScheduleRules: weeklyRules,
      priority: ordersReadInputValue('ordersEditPriority') || 'Normalny',
      advanceDays: document.getElementById('ordersEditAdvance')
        ? Math.max(0, Math.floor(Number(ordersReadInputValue('ordersEditAdvance')) || 0))
        : Math.max(0, Math.floor(Number(order.advanceDays) || 0)),
      type: ['individual', 'cyclic', 'renovation', 'windows', 'other'].includes(type) ? type : 'other',
      tone: ordersTimelineToneForType(type),
      price: jobCardOperationalFields.price,
      taskName: subtasks[0]?.name || ordersReadInputValue('ordersEditTaskName'),
      tasks: subtasks,
      subtasks,
      activities: subtasks,
      objectPlanTasks,
      zoneTaskPlan: objectPlanTasks,
      objectZoneTasks: objectPlanTasks,
      supplies,
      itemsToTake: supplies,
      suppliesForWorkers: supplies,
      equipmentToTake,
      equipmentItems: equipmentToTake,
      chemicalsToTake,
      chemicalItems: chemicalsToTake,
      smsText: ordersReadInputValue('ordersEditSms'),
      smsTime: ordersReadInputValue('ordersEditSmsTime'),
      phone: individualClientDraft?.phone || ordersReadInputValue('ordersEditPhone'),
      description,
      workerComment,
      workerOnlyComment: workerComment,
      employeeComment: workerComment,
      appComment: workerComment,
      mobileComment: workerComment,
      privateWorkerComment: workerComment,
      commentForWorkers: workerComment,
      deviceNotes: ordersDeviceNotes(order),
      deviceMessages: ordersDeviceNotes(order),
      ...jobCardOperationalFields,
    }, allowExtendedWork)

    if (ordersJobCardPreviewEnabled()) {
      const compiledJobCard = compileOrderDraftToJobCardDraft(nextOrder)
      const jobCardValidation = validateJobCardDraft(compiledJobCard)
      nextOrder.jobCardDraft = compiledJobCard
      nextOrder.jobCardSchemaVersion = compiledJobCard.schemaVersion
      nextOrder.jobCardDraftStatus = 'DRAFT'
      nextOrder.jobCardDraftUpdatedAt = nowIso
      nextOrder.jobCardValidation = {
        validForPublication: jobCardValidation.valid,
        errors: jobCardValidation.errors,
        warnings: jobCardValidation.warnings,
      }
    }
  
    const conflict = calendarTimelineFindOrderConflict(nextOrder, ordersListSourceOrders(), calendarTimelineResources())
    if (conflict) {
      showTransientNotice('Nie zapisano: pracownik ma już zlecenie w tym czasie. Nakładanie jest dozwolone tylko w BUFORZE.', 'error')
      return
    }
  
    const sourceOrders = ordersListSourceOrders()
    const nextOrders = nextOrder.recurrenceOverride
      ? calendarTimelineOrdersWithSingleOccurrenceOverride(sourceOrders, nextOrder)
      : sourceOrders.map((item) => (item.id === nextOrder.id ? nextOrder : item))
    if (!nextOrder.recurrenceOverride && !isIndividualClient && (objectPlanTasks.length || supplies.length)) {
      try {
        await ordersSyncObjectDataToClient(nextOrder, selectedClient, supplies, objectPlanTasks)
      } catch (error) {
        showPortalErrorNotice('Nie udało się zapisać planu zadań i wyposażenia do danych klienta', error)
        return
      }
    }
  
    const savedRemotely = await ordersSaveRemoteTimelineOrdersNow(nextOrders, {
      render: true,
      showError: true,
      retry: false,
      retainLocalOrders: [nextOrder],
    })
    if (!savedRemotely) {
      return
    }
  
    ordersUpsertLocalSavedOrder(nextOrder)
    if (isAddMode) {
      appState.ordersSearch = ''
      appState.ordersShowCyclic = false
      appState.ordersListModel = 'all'
      appState.ordersListType = ''
      appState.ordersListAssignment = ''
      appState.ordersListQuickFilter = 'all'
    }
    ordersEditorDirty = false
    ordersEditorInitialSnapshot = ordersCloneEditorOrder(nextOrder)
    appState.ordersEditorMode = 'edit'
    appState.ordersEditingId = options.keepEditorOpen === true ? nextOrder.id : ''
    ordersRenderActiveScheduleView()
    if (options.showSuccess !== false) {
      showTransientNotice(isAddMode ? 'Zlecenie dodane i zapisane w bazie.' : 'Zlecenie zapisane w bazie.', 'success')
    }
    return nextOrder
    } finally {
      ordersSetEditorSaving(false)
    }
  }

  async function ordersPublishJobCard() {
    const order = ordersFindTimelineOrder(appState.ordersEditingId)
    if (!order || !ordersJobCardPreviewEnabled()) {
      showTransientNotice('Nie znaleziono Karty Zlecenia do publikacji.', 'error')
      return
    }
    const card = compileOrderDraftToJobCardDraft(ordersJobCardPreviewSource(order))
    const validation = validateJobCardDraft(card)
    ordersRenderJobCardPreview(order)
    if (!validation.valid) {
      showTransientNotice('Uzupełnij braki blokujące przed publikacją Karty Zlecenia.', 'error')
      return
    }
    const missingWarningCodes = validation.warnings
      .map((warning) => warning.code)
      .filter((code) => !ordersJobCardWarningAcknowledgements.has(code))
    if (missingWarningCodes.length) {
      showTransientNotice('Potwierdź osobno każde ostrzeżenie widoczne w podglądzie Karty Zlecenia.', 'error')
      return
    }

    const publishButton = document.getElementById('ordersJobCardPublish')
    if (publishButton instanceof HTMLButtonElement) {
      publishButton.disabled = true
      publishButton.textContent = 'Publikowanie...'
    }
    try {
      const savedOrder = await ordersSaveEditor({ keepEditorOpen: true, showSuccess: false })
      if (!savedOrder) return
      const orgId = String(appState.session?.activeOrgId ?? appState.session?.orgId ?? '').trim()
      const state = await fetchJobCardState(orgId, savedOrder.id)
      const draftHash = String(state?.draft?.draftHash ?? '').trim()
      if (!draftHash) {
        throw new Error('Backend nie zwrócił trwałej wersji zapisanego szkicu.')
      }
      const result = await publishJobCard(orgId, savedOrder.id, {
        acknowledgements: validation.warnings.map((warning) => ({
          accepted: true,
          code: warning.code,
        })),
        expectedDraftHash: draftHash,
      })
      const revision = result?.revision
      if (revision?.revision) {
        ordersJobCardPublicationState.set(savedOrder.id, {
          outputHash: revision.outputHash,
          publishedAt: revision.publishedAt,
          publishedByUid: revision.publishedByUid,
          revision: revision.revision,
          revisionId: revision.revisionId,
        })
      }
      const currentOrder = ordersFindTimelineOrder(savedOrder.id) || savedOrder
      ordersRenderJobCardPreview(currentOrder)
      showTransientNotice(
        result?.idempotent
          ? `Karta Zlecenia jest już opublikowana jako rewizja ${revision?.revision || ''}.`
          : `Opublikowano Kartę Zlecenia — rewizja ${revision?.revision || 1}.`,
        'success',
      )
    } catch (error) {
      showPortalErrorNotice('Nie udało się opublikować Karty Zlecenia.', error)
    } finally {
      const currentButton = document.getElementById('ordersJobCardPublish')
      if (currentButton instanceof HTMLButtonElement) {
        currentButton.disabled = false
        currentButton.textContent = 'Publikuj Kartę'
      }
    }
  }
  
  function ordersCurrentOrganizationId() {
    return String(appState.session?.activeOrgId ?? appState.session?.orgId ?? '').trim()
  }

  function ordersResetJobCardDraftsForOrganization(orgId = ordersCurrentOrganizationId()) {
    const normalizedOrgId = String(orgId ?? '').trim()
    if (String(appState.ordersJobCardDraftsOrgId ?? '') === normalizedOrgId) {
      return
    }
    appState.ordersJobCardDrafts = []
    appState.ordersJobCardDraftsLoading = false
    appState.ordersJobCardDraftsLoaded = false
    appState.ordersJobCardDraftsHasMore = false
    appState.ordersJobCardDraftsNextCursor = ''
    appState.ordersJobCardDraftsError = ''
    appState.ordersJobCardDraftsOrgId = normalizedOrgId
    appState.ordersJobCardDraftsRequestToken = Number(appState.ordersJobCardDraftsRequestToken || 0) + 1
  }

  function ordersIsCurrentJobCardDraftRequest(orgId, requestToken) {
    return (
      String(appState.ordersJobCardDraftsOrgId ?? '') === String(orgId ?? '').trim() &&
      Number(appState.ordersJobCardDraftsRequestToken || 0) === Number(requestToken)
    )
  }

  async function ordersLoadJobCardDrafts({ append = false, force = false, silent = false } = {}) {
    const orgId = ordersCurrentOrganizationId()
    ordersResetJobCardDraftsForOrganization(orgId)
    if (!orgId || appState.ordersJobCardDraftsLoading) {
      return false
    }
    if (!append && appState.ordersJobCardDraftsLoaded && !force) {
      return true
    }
    if (append && (!appState.ordersJobCardDraftsHasMore || !appState.ordersJobCardDraftsNextCursor)) {
      return true
    }

    const requestToken = Number(appState.ordersJobCardDraftsRequestToken || 0) + 1
    appState.ordersJobCardDraftsRequestToken = requestToken
    appState.ordersJobCardDraftsLoading = true
    appState.ordersJobCardDraftsError = ''
    try {
      const result = await listJobCardDrafts(orgId, {
        limit: 30,
        cursor: append ? appState.ordersJobCardDraftsNextCursor : '',
      })
      if (!ordersIsCurrentJobCardDraftRequest(orgId, requestToken)) {
        return false
      }
      const incoming = Array.isArray(result?.drafts) ? result.drafts : []
      const current = append && Array.isArray(appState.ordersJobCardDrafts) ? appState.ordersJobCardDrafts : []
      const byId = new Map()
      ;[...current, ...incoming].forEach((draft) => {
        const id = String(draft?.orderId ?? draft?.sourceOrderId ?? '').trim()
        if (id) byId.set(id, draft)
      })
      appState.ordersJobCardDrafts = [...byId.values()].sort((left, right) =>
        String(right?.updatedAt ?? '').localeCompare(String(left?.updatedAt ?? '')) ||
        String(right?.orderId ?? right?.sourceOrderId ?? '').localeCompare(String(left?.orderId ?? left?.sourceOrderId ?? '')),
      )
      appState.ordersJobCardDraftsHasMore = result?.page?.hasMore === true
      appState.ordersJobCardDraftsNextCursor = String(result?.page?.nextCursor ?? '').trim()
      appState.ordersJobCardDraftsLoaded = true
      return true
    } catch (error) {
      if (!ordersIsCurrentJobCardDraftRequest(orgId, requestToken)) {
        return false
      }
      console.warn('[portal/orders] draft list failed', error)
      appState.ordersJobCardDraftsError = String(error?.message ?? 'Nie udało się pobrać roboczych zleceń.')
      appState.ordersJobCardDraftsLoaded = true
      if (!silent) {
        showPortalErrorNotice('Nie udało się pobrać roboczych zleceń.', error)
      }
      return false
    } finally {
      if (ordersIsCurrentJobCardDraftRequest(orgId, requestToken)) {
        appState.ordersJobCardDraftsLoading = false
        if (appState.currentRoute === 'orders' && document.getElementById('ordersRows')) {
          renderOrdersView()
        }
      }
    }
  }

  async function ordersLoadAllJobCardDrafts() {
    while (appState.ordersJobCardDraftsHasMore && appState.ordersJobCardDraftsNextCursor) {
      const loaded = await ordersLoadJobCardDrafts({ append: true })
      if (!loaded) break
    }
  }

  function ordersRowsFromJobCardDrafts() {
    const drafts = Array.isArray(appState.ordersJobCardDrafts) ? appState.ordersJobCardDrafts : []
    return drafts.map((draft) => {
      const orderId = String(draft?.orderId ?? draft?.sourceOrderId ?? '').trim()
      const schedule = draft?.schedule && typeof draft.schedule === 'object' ? draft.schedule : {}
      const staffing = draft?.staffing && typeof draft.staffing === 'object' ? draft.staffing : {}
      const site = draft?.site && typeof draft.site === 'object' ? draft.site : {}
      const clientData = draft?.client && typeof draft.client === 'object' ? draft.client : {}
      const startDay = ordersNormalizeDateField(schedule.startDateYmd ?? schedule.dateStart ?? draft?.dateStart, '')
      const endDay = ordersNormalizeDateField(schedule.recurrenceUntilYmd ?? schedule.endDateYmd ?? draft?.dateEnd, startDay)
      const scheduleMode = String(schedule.mode ?? draft?.scheduleMode ?? '').trim().toUpperCase()
      const cyclic = ['RECURRING', 'REPEAT', 'CYCLIC'].includes(scheduleMode)
      const model = cyclic ? 'cyclic' : 'oneoff'
      const client = String(clientData.name ?? clientData.label ?? draft?.clientLabel ?? '').trim() || '-'
      const address = String(site.address ?? draft?.address ?? '').trim() || '-'
      const assignmentCount = Math.max(0, Math.floor(Number(staffing.assignmentCount) || 0))
      const requiredPeople = Math.max(1, Math.floor(Number(staffing.requiredPeople) || 1))
      const staffingMode = String(staffing.mode ?? '').trim().toUpperCase()
      const worker = assignmentCount
        ? `${assignmentCount} ${assignmentCount === 1 ? 'osoba przypisana' : 'osoby przypisane'}`
        : staffingMode === 'BUFFER'
          ? `BUFOR · ${requiredPeople} ${requiredPeople === 1 ? 'osoba' : 'osoby'}`
          : 'Nie przypisano'
      const workerOptions = assignmentCount ? [worker] : ['BUFOR']
      const type = cyclic ? 'cyclic' : 'individual'
      const title = String(draft?.title ?? site.name ?? site.label ?? '').trim() || 'Robocze zlecenie'
      const updatedAt = String(draft?.updatedAt ?? '').trim()
      const updatedDate = new Date(updatedAt)
      const updatedLabel = updatedAt && Number.isFinite(updatedDate.getTime())
        ? new Intl.DateTimeFormat('pl-PL', { dateStyle: 'short', timeStyle: 'short' }).format(updatedDate)
        : '-'
      const dateFrom = startDay
        ? ordersDateTimeFromTimeline(startDay, schedule.startTime)
        : 'Termin do uzupełnienia'
      const dateTo = cyclic
        ? (endDay ? `cyklicznie do ${endDay}` : 'cyklicznie')
        : (endDay ? ordersDateTimeFromTimeline(endDay, schedule.endTime) : '-')
      const typeLabel = ordersListTypeLabel(type)
      const statusLabel = ordersListStatusLabel('draft')
      return {
        id: orderId,
        sourceOrderId: orderId,
        rawOrder: null,
        rawDraft: draft,
        isDraft: true,
        startDay,
        endDay: endDay || startDay,
        filterEndDay: endDay || startDay,
        nextDay: startDay || '9999-12-31',
        dateFrom,
        dateTo,
        nextDate: `Zmieniono ${updatedLabel}`,
        name: title,
        client,
        worker,
        workerOptions,
        address,
        model,
        typeLabel,
        status: 'draft',
        statusLabel,
        assignment: assignmentCount ? 'assigned' : 'buffer',
        cyclic,
        completed: false,
        type,
        updatedAt,
        searchText: normalizeSearchText([
          title,
          client,
          site.name,
          site.label,
          address,
          worker,
          typeLabel,
          statusLabel,
          updatedLabel,
        ].join(' ')),
      }
    })
  }

  function ordersAllListRows() {
    return [...ordersRowsFromJobCardDrafts(), ...ordersRowsFromCalendarTimeline()]
  }

  async function ordersContinueJobCardDraft(orderId = '') {
    const id = String(orderId ?? '').trim()
    const orgId = ordersCurrentOrganizationId()
    if (!id || !orgId || typeof openOrderCreateWorkspace !== 'function') {
      showTransientNotice('Nie można teraz otworzyć roboczego zlecenia.', 'error')
      return false
    }
    try {
      const result = await fetchJobCardDraft(orgId, id)
      const storedEditorDraft = result?.editorDraft && typeof result.editorDraft === 'object' ? result.editorDraft : null
      if (!storedEditorDraft) {
        throw new Error('Szkic nie zawiera danych potrzebnych do wznowienia edycji.')
      }
      const draftHash = String(result?.draft?.draftHash ?? '').trim()
      if (!draftHash) {
        throw new Error('Backend nie zwrócił wersji roboczego zlecenia potrzebnej do bezpiecznej edycji.')
      }
      const editorDraft = { ...storedEditorDraft, id, orderId: id }
      await openOrderCreateWorkspace({
        draft: editorDraft,
        draftHash,
        sourceRoute: 'orders',
        returnRoute: 'orders',
      })
      return true
    } catch (error) {
      showPortalErrorNotice('Nie udało się otworzyć roboczego zlecenia.', error)
      return false
    }
  }

  function ordersRowsFromCalendarTimeline() {
    const resources = calendarTimelineResources()
    return ordersListSourceOrders().map((order) => {
      const resource = resources[Number(order.row)] ?? null
      const startDay = ordersNormalizeDateField(order.dateYmd, '')
      const endDay = ordersListEndDayForOrder(order)
      const filterEndDay = ordersListOrderIsCyclic(order) && !endDay ? '9999-12-31' : endDay || startDay
      const model = ordersListModelForOrder(order)
      const status = ordersListStatusForOrder(order)
      const worker =
        ordersWorkerLabelForOrder(order, resources) ||
        String(resource?.name ?? order.workerLabel ?? '').trim() ||
        'BUFOR'
      const client = ordersTimelineClientLabel(order)
      const address = ordersTimelineAddressLabel(order)
      const type = String(order.type ?? '').trim() || 'other'
      const workerOptions = ordersListWorkerFilterLabels(worker)
      const assignment = ordersListAssignmentForWorkerLabels(workerOptions)
      const typeLabel = ordersListTypeLabel(type)
      const statusLabel = ordersListStatusLabel(status)
      const dateTo =
        model === 'cyclic' && !endDay
          ? 'bez daty ko\u0144ca'
          : ordersDateTimeFromTimeline(endDay || startDay, order.endTime)
      return {
        id: String(order.id ?? '').trim(),
        sourceOrderId: String(order.sourceOrderId ?? order.orderId ?? order.id ?? '').trim(),
        rawOrder: order,
        startDay,
        endDay: endDay || startDay,
        filterEndDay,
        nextDay: ordersNormalizeDateField(order.nextDate || order.dateYmd, startDay),
        dateFrom: ordersDateTimeFromTimeline(startDay, order.startTime),
        dateTo,
        nextDate: String(order.nextDate || order.dateYmd || '').trim() || '-',
        name: String(order.title ?? '').trim() || '-',
        client,
        worker,
        workerOptions,
        address,
        model,
        typeLabel,
        status,
        statusLabel,
        assignment,
        cyclic: model === 'cyclic',
        completed: Boolean(order.completed),
        type,
        searchText: normalizeSearchText([
          order?.dateYmd,
          order?.endDateYmd,
          order?.validUntil,
          order?.nextDate,
          order?.startTime,
          order?.endTime,
          order?.title,
          client,
          worker,
          address,
          typeLabel,
          statusLabel,
        ].join(' ')),
      }
    })
  }
  
  function ordersListOrderIsCyclic(order = {}) {
    if (ordersScheduleModeForOrder(order) === 'repeat') {
      return true
    }
    if (String(order?.type ?? '').trim() === 'cyclic') {
      return true
    }
    return typeof calendarTimelineOrderIsRecurring === 'function' ? calendarTimelineOrderIsRecurring(order) : false
  }

  function ordersListModelForOrder(order = {}) {
    return ordersListOrderIsCyclic(order) ? 'cyclic' : 'oneoff'
  }

  function ordersListEndDayForOrder(order = {}) {
    if (ordersListOrderIsCyclic(order)) {
      return ordersRepeatEndDateForOrder(order)
    }
    const startDay = ordersNormalizeDateField(order?.dateYmd, '')
    return ordersNormalizeDateField(order?.validUntil || order?.endDateYmd || order?.dateTo || order?.dateYmd, startDay)
  }

  function ordersListStatusForOrder(order = {}) {
    if (order?.completed) {
      return 'completed'
    }
    const today = todayYmd()
    const startDay = ordersNormalizeDateField(order?.dateYmd, '')
    const endDay = ordersListEndDayForOrder(order)
    if (startDay && startDay > today) {
      return 'upcoming'
    }
    if (ordersListOrderIsCyclic(order) && !endDay && startDay && startDay <= today) {
      return 'active'
    }
    const effectiveEndDay = endDay || startDay
    if (startDay && effectiveEndDay && startDay <= today && effectiveEndDay >= today) {
      return 'active'
    }
    return 'expired'
  }

  function ordersListModelFilter() {
    const current = String(appState.ordersListModel ?? '').trim()
    if (ORDERS_LIST_MODELS.has(current)) {
      return current
    }
    return appState.ordersShowCyclic ? 'cyclic' : 'all'
  }

  function ordersListStatusFilter() {
    const current = String(appState.ordersListStatus ?? '').trim()
    return ORDERS_LIST_STATUSES.has(current) ? current : ''
  }

  function ordersListSortValue() {
    const current = String(appState.ordersListSort ?? '').trim()
    return ORDERS_LIST_SORTS.has(current) ? current : 'nextAsc'
  }

  function ordersListTypeFilter() {
    const current = String(appState.ordersListType ?? '').trim()
    return ORDERS_LIST_TYPES.has(current) ? current : ''
  }

  function ordersListAssignmentFilter() {
    const current = String(appState.ordersListAssignment ?? '').trim()
    return ORDERS_LIST_ASSIGNMENTS.has(current) ? current : ''
  }

  function ordersListQuickFilter() {
    const current = String(appState.ordersListQuickFilter ?? '').trim()
    return ORDERS_LIST_QUICK_FILTERS.has(current) ? current : 'all'
  }

  function ordersListTypeLabel(type = '') {
    const normalized = String(type ?? '').trim()
    if (normalized === 'individual') return 'Jednorazowe'
    if (normalized === 'cyclic') return 'Cykliczne'
    if (normalized === 'renovation') return 'Poremontowe'
    if (normalized === 'windows') return 'Mycie okien'
    return 'Inne'
  }

  function ordersListStatusLabel(status = '') {
    switch (status) {
      case "draft": return "Robocze"
      case 'active':
        return 'Aktywne'
      case 'upcoming':
        return 'Nadchodz\u0105ce'
      case 'completed':
        return 'Zako\u0144czone'
      case 'expired':
        return 'Po terminie'
      default:
        return '-'
    }
  }

  function ordersListQuickFilterLabel(value = 'all') {
    switch (value) {
      case 'draft':
        return 'Robocze'
      case 'today':
        return 'Dzisiaj'
      case 'overdue':
        return 'Zaległe'
      case 'completed':
        return 'Zakończone'
      case 'all':
        return 'Wszystkie'
      case 'active_future':
      default:
        return 'Aktywne i przyszłe'
    }
  }

  function ordersListAssignmentLabel(value = '') {
    if (value === 'assigned') return 'Przypisane'
    if (value === 'buffer') return 'BUFOR'
    return 'Wszystkie'
  }

  function ordersListModelSentence(model = 'all') {
    if (model === 'cyclic') {
      return 'zlecenia cykliczne'
    }
    if (model === 'oneoff') {
      return 'zlecenia niecykliczne'
    }
    return 'wszystkie zlecenia'
  }

  function ordersListSetText(id, value = '') {
    const node = document.getElementById(id)
    if (node) {
      node.textContent = String(value ?? '')
    }
  }

  function ordersListRenderKpis(rows = []) {
    const publishedRows = rows.filter((row) => !row.isDraft)
    const drafts = rows.filter((row) => row.isDraft).length
    const active = publishedRows.filter((row) => row.status === 'active').length
    const cyclic = publishedRows.filter((row) => row.model === 'cyclic').length
    ordersListSetText('ordersKpiAll', rows.length)
    ordersListSetText('ordersKpiDraft', appState.ordersJobCardDraftsHasMore ? `${drafts}+` : drafts)
    ordersListSetText('ordersKpiActive', active)
    ordersListSetText('ordersKpiCyclic', cyclic)
    ordersListSetText('ordersKpiOneoff', Math.max(0, publishedRows.length - cyclic))
  }

  function ordersListStatusFilterValue(value = '') {
    const normalized = String(value ?? '').trim()
    return ORDERS_LIST_STATUSES.has(normalized) ? normalized : ''
  }

  function ordersListTypeFilterValue(value = '') {
    const normalized = String(value ?? '').trim()
    return ORDERS_LIST_TYPES.has(normalized) ? normalized : ''
  }

  function ordersListAssignmentFilterValue(value = '') {
    const normalized = String(value ?? '').trim()
    return ORDERS_LIST_ASSIGNMENTS.has(normalized) ? normalized : ''
  }

  function ordersListReadFilters() {
    appState.ordersSearch = ordersReadInputValue('ordersSearchInput')
    appState.ordersListDateFrom = ordersNormalizeDateField(ordersReadInputValue('ordersListDateFrom'), '')
    appState.ordersListDateTo = ordersNormalizeDateField(ordersReadInputValue('ordersListDateTo'), '')
    appState.ordersListStatus = ordersListStatusFilterValue(ordersReadInputValue('ordersListStatus'))
    appState.ordersListType = ordersListTypeFilterValue(ordersReadInputValue('ordersListType'))
    appState.ordersListAssignment = ordersListAssignmentFilterValue(ordersReadInputValue('ordersListAssignment'))
    appState.ordersListClient = ordersReadInputValue('ordersListClient')
    appState.ordersListWorker = ordersReadInputValue('ordersListWorker')
    appState.ordersListSort = ORDERS_LIST_SORTS.has(ordersReadInputValue('ordersListSort')) ? ordersReadInputValue('ordersListSort') : 'nextAsc'
  }

  function ordersListUniqueOptions(rows = [], field = '') {
    const seen = new Set()
    return rows
      .map((row) => String(row?.[field] ?? '').trim())
      .filter((value) => value && value !== '-')
      .filter((value) => {
        const key = normalizeSearchText(value)
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((left, right) => left.localeCompare(right, 'pl', { sensitivity: 'base' }))
  }

  function ordersListWorkerFilterLabels(worker = '') {
    const labels = String(worker ?? '')
      .split(/\s*[,;]\s*/)
      .map((label) => label.trim())
      .filter(Boolean)
    return labels.length ? labels : ['BUFOR']
  }

  function ordersListWorkerLabelIsBuffer(label = '') {
    const key = normalizeSearchText(label)
    return !key || key === 'bufor' || key === 'buffer' || key.startsWith('bufor ')
  }

  function ordersListAssignmentForWorkerLabels(labels = []) {
    const values = Array.isArray(labels) ? labels : []
    return values.some((label) => !ordersListWorkerLabelIsBuffer(label)) ? 'assigned' : 'buffer'
  }

  function ordersListUniqueWorkerOptions(rows = []) {
    const seen = new Set()
    return rows
      .flatMap((row) => (Array.isArray(row.workerOptions) ? row.workerOptions : ordersListWorkerFilterLabels(row.worker)))
      .filter((value) => value && value !== '-')
      .filter((value) => {
        const key = normalizeSearchText(value)
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((left, right) => left.localeCompare(right, 'pl', { sensitivity: 'base' }))
  }

  function ordersListOptionsHtml(options = [], selected = '', emptyLabel = '(wszystkie)') {
    const selectedValue = String(selected ?? '').trim()
    const hasSelected = !selectedValue || options.some((option) => option === selectedValue)
    const values = hasSelected ? options : [selectedValue, ...options]
    return [
      `<option value=""${selectedValue ? '' : ' selected'}>${escapeHtml(emptyLabel)}</option>`,
      ...values.map((option) => {
        const selectedAttr = option === selectedValue ? ' selected' : ''
        return `<option value="${escapeHtml(option)}"${selectedAttr}>${escapeHtml(option)}</option>`
      }),
    ].join('')
  }

  function ordersListSyncSelect(id = '', html = '', value = '') {
    const select = document.getElementById(id)
    if (!(select instanceof HTMLSelectElement)) {
      return
    }
    if (select.innerHTML !== html) {
      select.innerHTML = html
    }
    select.value = String(value ?? '')
  }

  function ordersListSyncFilterControls(rows = []) {
    ordersSetInputValue('ordersListDateFrom', appState.ordersListDateFrom)
    ordersSetInputValue('ordersListDateTo', appState.ordersListDateTo)
    ordersSetInputValue('ordersListStatus', ordersListStatusFilter())
    ordersSetInputValue('ordersListType', ordersListTypeFilter())
    ordersSetInputValue('ordersListAssignment', ordersListAssignmentFilter())
    ordersSetInputValue('ordersListSort', ordersListSortValue())

    const searchInput = document.getElementById('ordersSearchInput')
    if (searchInput instanceof HTMLInputElement && searchInput.value !== appState.ordersSearch) {
      searchInput.value = appState.ordersSearch
    }

    ordersListSyncSelect(
      'ordersListClient',
      ordersListOptionsHtml(ordersListUniqueOptions(rows, 'client'), appState.ordersListClient, '(wszyscy)'),
      appState.ordersListClient,
    )
    ordersListSyncSelect(
      'ordersListWorker',
      ordersListOptionsHtml(ordersListUniqueWorkerOptions(rows), appState.ordersListWorker, '(wszyscy)'),
      appState.ordersListWorker,
    )

    const quickFilter = ordersListQuickFilter()
    document.querySelectorAll('[data-orders-quick-filter]').forEach((button) => {
      const isActive = button.getAttribute('data-orders-quick-filter') === quickFilter
      button.classList.toggle('is-active', isActive)
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false')
    })
  }

  function ordersListRenderModelFilter() {
    const current = ordersListModelFilter()
    document.querySelectorAll('#ordersListModel [data-orders-list-model]').forEach((button) => {
      const isActive = button.getAttribute('data-orders-list-model') === current
      button.classList.toggle('is-active', isActive)
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false')
    })
  }

  function ordersListSetModelFilter(value = '') {
    const next = ORDERS_LIST_MODELS.has(value) ? value : 'all'
    appState.ordersListModel = next
    appState.ordersShowCyclic = next === 'cyclic'
  }

  function ordersListSetQuickFilter(value = 'all') {
    appState.ordersListQuickFilter = ORDERS_LIST_QUICK_FILTERS.has(value) ? value : 'all'
  }

  function ordersListClearFilters() {
    appState.ordersSearch = ''
    appState.ordersListDateFrom = ''
    appState.ordersListDateTo = ''
    appState.ordersListStatus = ''
    appState.ordersListType = ''
    appState.ordersListClient = ''
    appState.ordersListWorker = ''
    appState.ordersListAssignment = ''
    appState.ordersListQuickFilter = 'all'
    appState.ordersListSort = 'nextAsc'
    appState.ordersListModel = 'all'
    appState.ordersShowCyclic = false
  }

  function ordersListCompareRows(left = {}, right = {}) {
    if (left.isDraft || right.isDraft) {
      if (left.isDraft && right.isDraft) {
        return String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? '')) ||
          String(right.id ?? '').localeCompare(String(left.id ?? ''))
      }
      return left.isDraft ? -1 : 1
    }
    const sort = ordersListSortValue()
    const compareText = (leftValue, rightValue) =>
      String(leftValue ?? '').localeCompare(String(rightValue ?? ''), 'pl', { sensitivity: 'base' })
    const compareDate = (leftValue, rightValue) => String(leftValue ?? '').localeCompare(String(rightValue ?? ''))

    switch (sort) {
      case 'nextDesc':
        return compareDate(right.nextDay, left.nextDay) || compareText(left.name, right.name)
      case 'dateAsc':
        return compareDate(left.startDay, right.startDay) || compareText(left.name, right.name)
      case 'dateDesc':
        return compareDate(right.startDay, left.startDay) || compareText(left.name, right.name)
      case 'clientAsc':
        return compareText(left.client, right.client) || compareDate(left.nextDay, right.nextDay)
      case 'workerAsc':
        return compareText(left.worker, right.worker) || compareDate(left.nextDay, right.nextDay)
      case 'nameAsc':
        return compareText(left.name, right.name) || compareDate(left.nextDay, right.nextDay)
      case 'nextAsc':
      default:
        return compareDate(left.nextDay, right.nextDay) || compareText(left.name, right.name)
    }
  }

  function ordersListVisibleRows(allRows = ordersAllListRows()) {
    const query = normalizeSearchText(appState.ordersSearch)
    const model = ordersListModelFilter()
    const status = ordersListStatusFilter()
    const type = ordersListTypeFilter()
    const assignment = ordersListAssignmentFilter()
    const quickFilter = ordersListQuickFilter()
    const today = todayYmd()
    const dateFrom = ordersNormalizeDateField(appState.ordersListDateFrom, '')
    const dateTo = ordersNormalizeDateField(appState.ordersListDateTo, '')
    const client = normalizeSearchText(appState.ordersListClient)
    const worker = normalizeSearchText(appState.ordersListWorker)

    return allRows.filter((row) => {
      if (quickFilter === 'draft' && row.status !== 'draft') {
        return false
      }
      if (quickFilter === 'active_future' && !['active', 'upcoming'].includes(row.status)) {
        return false
      }
      if (quickFilter === 'today' && (row.isDraft || !(row.startDay && row.filterEndDay && row.startDay <= today && row.filterEndDay >= today))) {
        return false
      }
      if (quickFilter === 'overdue' && row.status !== 'expired') {
        return false
      }
      if (quickFilter === 'completed' && row.status !== 'completed') {
        return false
      }
      if (model !== 'all' && row.model !== model) {
        return false
      }
      if (status && row.status !== status) {
        return false
      }
      if (type && row.type !== type) {
        return false
      }
      if (assignment && row.assignment !== assignment) {
        return false
      }
      if (dateFrom && row.filterEndDay && row.filterEndDay < dateFrom) {
        return false
      }
      if (dateTo && row.startDay && row.startDay > dateTo) {
        return false
      }
      if (client && normalizeSearchText(row.client) !== client) {
        return false
      }
      if (worker && !(row.workerOptions || []).some((label) => normalizeSearchText(label) === worker)) {
        return false
      }
      return query ? row.searchText.includes(query) : true
    }).sort(ordersListCompareRows)
  }

  function ordersListActiveFilterSummary() {
    const parts = [ordersListQuickFilterLabel(ordersListQuickFilter())]
    const model = ordersListModelFilter()
    const status = ordersListStatusFilter()
    const type = ordersListTypeFilter()
    const assignment = ordersListAssignmentFilter()
    const dateFrom = ordersNormalizeDateField(appState.ordersListDateFrom, '')
    const dateTo = ordersNormalizeDateField(appState.ordersListDateTo, '')
    const client = String(appState.ordersListClient ?? '').trim()
    const worker = String(appState.ordersListWorker ?? '').trim()
    const search = String(appState.ordersSearch ?? '').trim()

    if (model !== 'all') parts.push(`Model: ${ordersListModelSentence(model)}`)
    if (status) parts.push(`Status: ${ordersListStatusLabel(status)}`)
    if (type) parts.push(`Typ: ${ordersListTypeLabel(type)}`)
    if (assignment) parts.push(`Przypisanie: ${ordersListAssignmentLabel(assignment)}`)
    if (client) parts.push(`Klient: ${client}`)
    if (worker) parts.push(`Pracownik: ${worker}`)
    if (dateFrom || dateTo) parts.push(`Data: ${dateFrom || '...'} - ${dateTo || '...'}`)
    if (search) parts.push(`Szukaj: ${search}`)
    return parts.join(' / ')
  }
  
  function ordersListActionButtonHtml(kind, label, iconPath, { showLabel = false } = {}) {
    return `
      <button class="orders-action orders-action--${escapeHtml(kind)}" type="button" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" data-orders-list-action="${escapeHtml(kind)}">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">${iconPath}</svg>
        ${showLabel ? `<span>${escapeHtml(label)}</span>` : ''}
      </button>
    `
  }

  function ordersListStatusBadgeTone(row = {}) {
    const status = String(row.statusId ?? row.status?.id ?? row.status ?? '').trim()
    if (status === 'draft') return 'draft'
    if (status === 'expired') return 'overdue'
    if (status === 'upcoming') return 'planned'
    return String(row.status?.tone ?? status ?? 'planned').trim() || 'planned'
  }

  function ordersListStatusBadgeLabel(row = {}) {
    const status = String(row.statusId ?? row.status?.id ?? row.status ?? '').trim()
    if (status === 'expired') return 'Zaleg\u0142e'
    if (status === 'upcoming') return 'Planowane'
    return row.statusLabel || row.status?.label || ordersListStatusLabel(status) || '-'
  }
  
  function ordersListRowHtml(row = {}) {
    const editIcon =
      '<path d="m5 16.5-.5 3 3-.5L18 8.5 15.5 6 5 16.5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m14.5 7 2.5 2.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    const pinIcon =
      '<path d="M12 21s7-5.2 7-11a7 7 0 0 0-14 0c0 5.8 7 11 7 11Z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.4" stroke="currentColor" stroke-width="2"/>'
    const deleteIcon =
      '<path d="M5 7h14M9 7V5h6v2M8 10v8M12 10v8M16 10v8M7 7l1 13h8l1-13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
    const continueIcon =
      '<path d="M5 12h12M13 7l5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
    const statusTone = ordersListStatusBadgeTone(row)
    const statusLabel = ordersListStatusBadgeLabel(row)
    const typeTone = row.typeTone || ordersTimelineToneForType(row.type) || 'gray'
  
    return `
      <div class="orders-row${row.isDraft ? ' is-draft' : ''}" data-order-id="${escapeHtml(row.id)}" data-order-source-id="${escapeHtml(row.sourceOrderId || row.id)}"${row.isDraft ? ' data-order-draft="true"' : ''}>
        <div><span class="orders-badge orders-badge--${escapeHtml(statusTone)}">${escapeHtml(statusLabel)}</span></div>
        <div class="orders-date-cell">
          <strong>${escapeHtml(row.dateFrom || '-')}</strong>
          <span>${escapeHtml(row.dateTo || '-')}</span>
        </div>
        <div>${escapeHtml(row.nextDate || '-')}</div>
        <div class="orders-strong">${escapeHtml(row.name || '-')}</div>
        <div>${escapeHtml(row.client || '-')}</div>
        <div>${escapeHtml(row.worker || '-')}</div>
        <div>${escapeHtml(row.address || '-')}</div>
        <div><span class="orders-badge orders-badge--type orders-badge--${escapeHtml(typeTone)}">${escapeHtml(row.typeLabel || '-')}</span></div>
        <div class="orders-actions">
          ${row.isDraft
            ? ordersListActionButtonHtml('continue', 'Kontynuuj edycję', continueIcon, { showLabel: true })
            : `
              ${ordersListActionButtonHtml('edit', 'Edytuj', editIcon)}
              ${ordersListActionButtonHtml('pin', 'Poka\u017c adres', pinIcon)}
              ${ordersListActionButtonHtml('delete', 'Usu\u0144', deleteIcon)}
            `}
        </div>
      </div>
    `
  }
  
  function renderOrdersView() {
    const listPanel = document.getElementById('ordersListPanel')
    const editorPanel = document.getElementById('ordersEditorPanel')
    const rowsNode = document.getElementById('ordersRows')
    const countNode = document.getElementById('ordersCount')
    const statusNode = document.getElementById('ordersStatus')
    const activeFiltersNode = document.getElementById('ordersActiveFilters')
    const refreshButton = document.getElementById('ordersRefreshBtn')
    const draftsShowAllButton = document.getElementById('ordersDraftsShowAll')

    ordersResetJobCardDraftsForOrganization()
    if (!appState.ordersJobCardDraftsLoaded && !appState.ordersJobCardDraftsLoading) {
      void ordersLoadJobCardDrafts({ silent: true })
    }
  
    if (appState.ordersEditingId) {
      const order = ordersFindTimelineOrder(appState.ordersEditingId)
      if (order) {
        ordersRenderEditor(order)
        return
      }
      appState.ordersEditingId = ''
    }
  
    if (listPanel) {
      listPanel.hidden = false
    }
    if (editorPanel) {
      editorPanel.hidden = true
    }
  
    if (!rowsNode) {
      return
    }
  
    if (refreshButton instanceof HTMLButtonElement) {
      refreshButton.disabled = Boolean(appState.ordersRefreshing)
      refreshButton.classList.toggle('is-loading', Boolean(appState.ordersRefreshing))
      refreshButton.setAttribute('aria-busy', appState.ordersRefreshing ? 'true' : 'false')
    }
  
    const allRows = ordersAllListRows()
    ordersListRenderKpis(allRows)
    ordersListSyncFilterControls(allRows)
    ordersListRenderModelFilter()

    const rows = ordersListVisibleRows(allRows)
    rowsNode.innerHTML = rows.length
      ? rows.map((row) => ordersListRowHtml(row)).join('')
      : `
        <div class="orders-row orders-row-empty">
          <div>-</div><div>-</div><div>-</div><div>Brak zlece\u0144 dla wybranych filtr\u00f3w.</div><div>-</div><div>-</div><div>-</div><div>-</div><div>-</div>
        </div>
      `
  
    if (countNode) {
      countNode.textContent = `${rows.length} / ${allRows.length} zlece\u0144`
    }
    if (draftsShowAllButton instanceof HTMLButtonElement) {
      draftsShowAllButton.hidden = !appState.ordersJobCardDraftsHasMore
      draftsShowAllButton.disabled = Boolean(appState.ordersJobCardDraftsLoading)
      draftsShowAllButton.textContent = appState.ordersJobCardDraftsLoading
        ? 'Wczytywanie...'
        : 'Pokaż wszystkie robocze'
    }
    const summary = ordersListActiveFilterSummary()
    if (statusNode) {
      statusNode.textContent = appState.ordersJobCardDraftsError
        ? `Widok: ${summary}. Robocze chwilowo niedostępne: ${appState.ordersJobCardDraftsError}`
        : `Widok: ${summary}.`
    }
    if (activeFiltersNode) {
      activeFiltersNode.textContent = summary
    }
  }
  
  let ordersMapInstance = null
  let ordersMapInfoWindow = null
  let ordersMapMarkers = []
  let ordersMapRenderSeq = 0
  let ordersMapGoogleAuthFailed = false
  
  function ordersMapMonthEnd(ymd = todayYmd()) {
    const date = calendarDateFromYmd(ymd)
    date.setMonth(date.getMonth() + 1, 0)
    return calendarDateToYmd(date)
  }
  
  function ordersMapEnsureDefaults() {
    const today = todayYmd()
    if (!appState.ordersMapDateFrom) {
      appState.ordersMapDateFrom = calendarMonthStart(today)
    }
    if (!appState.ordersMapDateTo) {
      appState.ordersMapDateTo = ordersMapMonthEnd(today)
    }
    if (typeof appState.ordersMapWorkerOnly !== 'boolean') {
      appState.ordersMapWorkerOnly = true
    }
    if (typeof appState.ordersMapStatus !== 'string') {
      appState.ordersMapStatus = 'new'
    }
  }
  
  function ordersMapSetNotice(message = '', isError = false) {
    const notice = document.getElementById('ordersMapNotice')
    if (!notice) {
      return
    }
    notice.textContent = message
    notice.hidden = !message
    notice.classList.toggle('is-error', Boolean(isError))
  }
  
  function ordersMapWorkerOptionsHtml() {
    const selected = String(appState.ordersMapWorker ?? '')
    const resources = calendarTimelineResources()
    return [
      `<option value=""${selected ? '' : ' selected'}>Wszyscy</option>`,
      ...resources
        .filter((resource) => resource.type !== 'placeholder')
        .map((resource, index) => {
          const value = String(index)
          const selectedAttr = selected === value ? ' selected' : ''
          return `<option value="${escapeHtml(value)}"${selectedAttr}>${escapeHtml(resource.name || `Wiersz ${index + 1}`)}</option>`
        }),
    ].join('')
  }
  
  function ordersMapSyncControls() {
    ordersMapEnsureDefaults()
    ordersSetInputValue('ordersMapDateFrom', appState.ordersMapDateFrom)
    ordersSetInputValue('ordersMapDateTo', appState.ordersMapDateTo)
    ordersSetInputValue('ordersMapStatus', appState.ordersMapStatus)
    ordersSetInputValue('ordersMapType', appState.ordersMapType)
    ordersSetInputValue('ordersMapSearch', appState.ordersMapSearch)
  
    const workerSelect = document.getElementById('ordersMapWorker')
    if (workerSelect instanceof HTMLSelectElement) {
      workerSelect.innerHTML = ordersMapWorkerOptionsHtml()
      workerSelect.value = String(appState.ordersMapWorker ?? '')
      workerSelect.disabled = !appState.ordersMapWorkerOnly
    }
  
    const workerOnly = document.getElementById('ordersMapWorkerOnly')
    if (workerOnly instanceof HTMLInputElement) {
      workerOnly.checked = Boolean(appState.ordersMapWorkerOnly)
    }
  }
  
  function ordersMapReadControls() {
    appState.ordersMapDateFrom = ordersNormalizeDateField(ordersReadInputValue('ordersMapDateFrom'), calendarMonthStart(todayYmd()))
    appState.ordersMapDateTo = ordersNormalizeDateField(ordersReadInputValue('ordersMapDateTo'), ordersMapMonthEnd(todayYmd()))
    appState.ordersMapStatus = ordersReadInputValue('ordersMapStatus')
    appState.ordersMapType = ordersReadInputValue('ordersMapType')
    appState.ordersMapWorker = ordersReadInputValue('ordersMapWorker')
    appState.ordersMapSearch = ordersReadInputValue('ordersMapSearch')
    const workerOnly = document.getElementById('ordersMapWorkerOnly')
    appState.ordersMapWorkerOnly = workerOnly instanceof HTMLInputElement ? workerOnly.checked : true
  }
  
  function ordersMapOrderEndDay(order = {}) {
    return ordersNormalizeDateField(order?.endDateYmd || order?.validUntil || order?.dateYmd, order?.dateYmd || todayYmd())
  }
  
  function ordersMapOrderIsActive(order = {}) {
    const today = todayYmd()
    return !order?.completed && String(order?.dateYmd ?? '') <= today && ordersMapOrderEndDay(order) >= today
  }
  
  function ordersMapVisibleOrders() {
    ordersMapEnsureDefaults()
    const query = normalizeSearchText(appState.ordersMapSearch)
    const from = appState.ordersMapDateFrom
    const to = appState.ordersMapDateTo
    const selectedWorker = String(appState.ordersMapWorker ?? '')
    const selectedWorkerRow = Number(selectedWorker)
    const filterWorker = appState.ordersMapWorkerOnly && selectedWorker && Number.isInteger(selectedWorkerRow)
  
    return ordersListSourceOrders()
      .filter((order) => {
        const start = ordersNormalizeDateField(order?.dateYmd, todayYmd())
        const end = ordersMapOrderEndDay(order)
        if (start > to || end < from) {
          return false
        }
  
        if (appState.ordersMapStatus === 'new' && order?.completed) {
          return false
        }
        if (appState.ordersMapStatus === 'completed' && !order?.completed) {
          return false
        }
        if (appState.ordersMapStatus === 'active' && !ordersMapOrderIsActive(order)) {
          return false
        }
  
        if (appState.ordersMapType && String(order?.type ?? '') !== appState.ordersMapType) {
          return false
        }
  
        if (filterWorker && !ordersNormalizeOrderRows(order).includes(selectedWorkerRow)) {
          return false
        }
  
        if (!query) {
          return true
        }
  
        const haystack = [
          order?.title,
          ordersTimelineClientLabel(order),
          ordersTimelineAddressLabel(order),
          ordersWorkerLabelForOrder(order),
          order?.type,
        ].join(' ')
        return normalizeSearchText(haystack).includes(query)
      })
      .sort((left, right) => {
        const byDate = String(left?.dateYmd ?? '').localeCompare(String(right?.dateYmd ?? ''))
        if (byDate) return byDate
        return String(left?.startTime ?? '').localeCompare(String(right?.startTime ?? ''))
      })
  }
  
  function ordersMapFallbackIframe(query = 'Polska') {
    const canvas = document.getElementById('ordersMapCanvas')
    if (!canvas) {
      return
    }
    const src = ordersGoogleMapsEmbedUrlFromQuery(query || 'Polska', query === 'Polska' ? 6 : 11)
    canvas.innerHTML = src
      ? `<iframe class="orders-map-fallback-frame" src="${escapeHtml(src)}" title="Mapa zleceń" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`
      : ''
  }
  
  function ordersMapClearMarkers() {
    ordersMapMarkers.forEach((marker) => {
      if (marker && typeof marker.setMap === 'function') {
        marker.setMap(null)
      } else if (marker) {
        marker.map = null
      }
    })
    ordersMapMarkers = []
  }
  
  async function ordersMapGeocodeOrder(order = {}, maps) {
    const direct = ordersMapCoordinates(order)
    if (direct) {
      return direct
    }
  
    const address = ordersTimelineAddressLabel(order)
    const query = ordersMapQuery(address)
    if (!query || query === 'Polska') {
      return null
    }
    if (ordersMapGeocodeCache.has(query)) {
      return ordersMapGeocodeCache.get(query)
    }
    if (!maps?.Geocoder) {
      return null
    }
  
    const geocoder = new maps.Geocoder()
    const result = await new Promise((resolve) => {
      geocoder.geocode({ address: query }, (results, status) => {
        if (status !== 'OK' || !Array.isArray(results) || !results[0]?.geometry?.location) {
          resolve(null)
          return
        }
        const location = results[0].geometry.location
        resolve({ lat: location.lat(), lng: location.lng() })
      })
    })
    ordersMapGeocodeCache.set(query, result)
    return result
  }
  
  function ordersMapInfoHtml(order = {}) {
    const title = String(order?.title ?? 'Zlecenie').trim() || 'Zlecenie'
    const client = ordersTimelineClientLabel(order)
    const address = ordersTimelineAddressLabel(order)
    const worker = ordersWorkerLabelForOrder(order)
    const time = `${ordersDateTimeFromTimeline(order?.dateYmd, order?.startTime)} - ${ordersDateTimeFromTimeline(order?.endDateYmd || order?.dateYmd, order?.endTime)}`
    return `
      <div class="orders-map-infowindow">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(client || '-')}</span>
        <span>${escapeHtml(address || '-')}</span>
        <span>${escapeHtml(worker || '-')}</span>
        <small>${escapeHtml(time)}</small>
      </div>
    `
  }
  
  async function ordersMapRenderCanvas(orders = []) {
    const canvas = document.getElementById('ordersMapCanvas')
    if (!canvas) {
      return
    }
  
    const renderSeq = ++ordersMapRenderSeq
    ordersMapSetNotice('Ładowanie mapy...')
  
    try {
      const maps = await ordersLoadGoogleMaps()
      if (renderSeq !== ordersMapRenderSeq || appState.currentRoute !== 'ordersMap') {
        return
      }
  
      canvas.innerHTML = ''
      if (!ordersMapInstance) {
        ordersMapInstance = new maps.Map(canvas, {
          center: { lat: 52.069, lng: 19.48 },
          zoom: 6,
          mapTypeControl: true,
          streetViewControl: true,
          fullscreenControl: true,
        })
        ordersMapInfoWindow = new maps.InfoWindow()
      }
  
      ordersMapClearMarkers()
      const bounds = new maps.LatLngBounds()
      let markerCount = 0
  
      for (const order of orders) {
        const address = ordersTimelineAddressLabel(order)
        if (!address || address === '-') {
          continue
        }
        const position = await ordersMapGeocodeOrder(order, maps)
        if (renderSeq !== ordersMapRenderSeq || appState.currentRoute !== 'ordersMap') {
          return
        }
        if (!position) {
          continue
        }
        const marker = new maps.Marker({
          map: ordersMapInstance,
          position,
          title: String(order?.title ?? 'Zlecenie'),
          label: {
            text: String(markerCount + 1),
            color: '#fff',
            fontSize: '12px',
            fontWeight: '800',
          },
        })
        marker.addListener('click', () => {
          ordersMapInfoWindow?.setContent(ordersMapInfoHtml(order))
          ordersMapInfoWindow?.open({ anchor: marker, map: ordersMapInstance })
        })
        ordersMapMarkers.push(marker)
        bounds.extend(position)
        markerCount += 1
      }
  
      if (markerCount) {
        ordersMapInstance.fitBounds(bounds, 70)
        if (markerCount === 1) {
          ordersMapInstance.setZoom(13)
        }
        ordersMapSetNotice('')
      } else {
        ordersMapInstance.setCenter({ lat: 52.069, lng: 19.48 })
        ordersMapInstance.setZoom(6)
        ordersMapSetNotice('Brak zleceń z adresem dla wybranych filtrów.')
      }
    } catch (error) {
      const firstAddress = orders.map((order) => ordersTimelineAddressLabel(order)).find((address) => address && address !== '-')
      ordersMapFallbackIframe(firstAddress || 'Polska')
      const message = String(error?.message ?? '')
      ordersMapSetNotice(
        message.includes('odrzuciło klucz API')
          ? 'Google Maps odrzuciło klucz API. Sprawdź Maps JavaScript API, billing i ograniczenia domeny klucza.'
          : 'Nie udało się uruchomić interaktywnej mapy. Pokazuję podgląd Google Maps.',
        true,
      )
    }
  }
  
  function renderOrdersMapView() {
    ordersMapSyncControls()
    const orders = ordersMapVisibleOrders()
    const countNode = document.getElementById('ordersMapCount')
    if (countNode) {
      countNode.textContent = String(orders.length)
    }
    void ordersMapRenderCanvas(orders)
  }
  
  function bindOrdersViewFunctions() {
    const binding = createBindingHelpers()
    const root = document.getElementById('view-orders')
    renderOrdersView()
    ordersEnhanceTimeInputs(root)
  
    binding.add(root, 'pointerdown', (event) => {
      const timeInput = eventTargetClosest(event, 'input.orders-time-input, input[type="time"]')
      if (timeInput instanceof HTMLInputElement) {
        event.preventDefault()
        ordersOpenTimePicker(timeInput)
        timeInput.focus({ preventScroll: true })
      }
    })
  
    binding.add(root, 'input', (event) => {
      if (event.target?.closest?.('#ordersEditorPanel')) {
        ordersJobCardWarningAcknowledgements.clear()
        if (event.target?.id !== 'ordersClientPickerInput') {
          ordersSetEditorDirty(true)
        }
      }
      if (event.target?.id === 'ordersClientPickerInput') {
        ordersSetClientPickerOpen(true)
        ordersRenderClientPickerList(String(event.target.value ?? ''))
        return
      }
  
      if (event.target?.id === 'ordersEditLocation') {
        const addressValue = String(event.target.value ?? '')
        ordersSyncAddressSelectToLocation(addressValue)
        ordersClearLocationGeoFields()
        ordersRenderLocationSuggestions(addressValue)
        ordersQueueGoogleLocationSuggestions(addressValue)
        ordersQueueEditorWizardRefresh(ordersFindTimelineOrder(appState.ordersEditingId) || {})
        return
      }

      if (
        event.target?.hasAttribute?.('data-orders-service-label') ||
        event.target?.hasAttribute?.('data-orders-service-description') ||
        event.target?.hasAttribute?.('data-orders-service-slot-label') ||
        event.target?.hasAttribute?.('data-orders-service-slot-hours')
      ) {
        const order = ordersFindTimelineOrder(appState.ordersEditingId)
        if (order) {
          ordersSyncServiceBlockDraftFromControls(order)
          ordersQueueEditorSummaryRefresh(order)
        }
        return
      }
  
      if (
        ['ordersEditWorkHours', 'ordersEditRequiredPeople'].includes(String(event.target?.id ?? '')) ||
        event.target?.hasAttribute?.('data-orders-work-allocation') ||
        event.target?.hasAttribute?.('data-orders-work-allocation-hours') ||
        event.target?.hasAttribute?.('data-orders-work-allocation-start') ||
        event.target?.hasAttribute?.('data-orders-work-allocation-end')
      ) {
        const order = ordersFindTimelineOrder(appState.ordersEditingId)
        if (order) {
          if (event.target?.id === 'ordersEditWorkHours' || event.target?.id === 'ordersEditRequiredPeople') {
            order.requiredWorkMinutes = ordersReadWorkMinutes(order)
            order.serviceWorkMinutes = order.requiredWorkMinutes
            order.requiredPeople = Math.max(1, Math.floor(Number(ordersReadInputValue('ordersEditRequiredPeople')) || 1))
            ordersRenderWorkAllocationControls(order, { forceEven: true })
          } else if (event.target?.hasAttribute?.('data-orders-work-allocation-hours')) {
            const key = String(event.target.getAttribute('data-orders-work-allocation-hours') ?? '').trim()
            const minutes = Math.max(0, Math.round((Number(event.target.value) || 0) * 60))
            const range = document.querySelector(`#ordersWorkAllocationRows [data-orders-work-allocation="${CSS.escape(key)}"]`)
            if (range instanceof HTMLInputElement) {
              range.value = String(minutes)
            }
            ordersSyncAllocationEndInputFromMinutes(key)
            ordersUpdateWorkAllocationSummary(order)
          } else if (event.target?.hasAttribute?.('data-orders-work-allocation-start')) {
            const key = String(event.target.getAttribute('data-orders-work-allocation-start') ?? '').trim()
            ordersSyncAllocationEndInputFromMinutes(key)
            ordersUpdateWorkAllocationSummary(order)
          } else if (event.target?.hasAttribute?.('data-orders-work-allocation-end')) {
            const key = String(event.target.getAttribute('data-orders-work-allocation-end') ?? '').trim()
            ordersSyncAllocationDurationFromTimes(key)
            ordersUpdateWorkAllocationSummary(order)
          } else {
            const key = String(event.target.getAttribute('data-orders-work-allocation') ?? '').trim()
            const hours = document.querySelector(`#ordersWorkAllocationRows [data-orders-work-allocation-hours="${CSS.escape(key)}"]`)
            if (hours instanceof HTMLInputElement) {
              hours.value = ordersHoursInputValue(Number(event.target.value) || 0)
            }
            ordersSyncAllocationEndInputFromMinutes(key)
            ordersUpdateWorkAllocationSummary(order)
          }
          ordersRenderSchedulePreview(order)
          ordersRenderEditorWizard(order)
        }
        return
      }

      if (
        [
          'ordersEditDescription',
          'ordersEditWorkerComment',
          'ordersJobCardAccessInstruction',
          'ordersJobCardSafetyInstruction',
          'ordersJobCardEscalationInstruction',
          'ordersJobCardVehicleId',
          'ordersJobCardAmount',
          'ordersJobCardContractId',
          'ordersJobCardPaymentTermDays',
        ].includes(String(event.target?.id ?? ''))
      ) {
        ordersQueueEditorWizardRefresh(ordersFindTimelineOrder(appState.ordersEditingId) || {})
        return
      }
  
      if (event.target?.id === 'ordersSearchInput') {
        appState.ordersSearch = String(event.target.value ?? '')
        renderOrdersView()
      }
    })
  
    binding.add(root, 'focusin', (event) => {
      const timeInput = eventTargetClosest(event, 'input.orders-time-input, input[type="time"]')
      if (timeInput instanceof HTMLInputElement) {
        ordersOpenTimePicker(timeInput)
        return
      }
      if (event.target?.id === 'ordersClientPickerInput') {
        ordersCloseRepeatSelectPickers()
        ordersSetClientPickerOpen(true)
      }
      if (event.target?.id === 'ordersEditLocation') {
        void ordersWarmLocationSources().then(() => {
          const input = document.getElementById('ordersEditLocation')
          if (input instanceof HTMLInputElement && document.activeElement === input) {
            ordersRenderLocationSuggestions(input.value)
          }
        })
      }
    })
  
    binding.add(document, 'click', (event) => {
      const hourButton = eventTargetClosest(event, '[data-orders-time-hour]')
      if (hourButton) {
        event.preventDefault()
        ordersSetTimePickerSelection(Number(hourButton.getAttribute('data-orders-time-hour')), ordersTimePickerMinute)
        return
      }
      const minuteButton = eventTargetClosest(event, '[data-orders-time-minute]')
      if (minuteButton) {
        event.preventDefault()
        ordersSetTimePickerSelection(ordersTimePickerHour, Number(minuteButton.getAttribute('data-orders-time-minute')))
        return
      }
      if (eventTargetClosest(event, '[data-orders-time-ok]')) {
        event.preventDefault()
        ordersApplyTimePickerSelection()
        return
      }
      if (eventTargetClosest(event, '[data-orders-time-cancel]')) {
        event.preventDefault()
        ordersCloseTimePicker()
        return
      }
      if (!eventTargetClosest(event, '#ordersTimePicker') && !eventTargetClosest(event, 'input.orders-time-input')) {
        ordersCloseTimePicker()
      }
    })
  
    binding.add(document, 'keydown', (event) => {
      if (!ordersTimePickerTarget) {
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        ordersCloseTimePicker()
      } else if (event.key === 'Enter') {
        event.preventDefault()
        ordersApplyTimePickerSelection()
      }
    })
  
    binding.add(window, 'resize', () => {
      if (ordersTimePickerTarget instanceof HTMLInputElement) {
        ordersPositionTimePicker(ordersTimePickerTarget)
      }
    })
  
    binding.add(root, 'change', (event) => {
      const warningCode = String(event.target?.getAttribute?.('data-job-card-warning-code') ?? '').trim()
      if (warningCode) {
        if (event.target?.checked === true) {
          ordersJobCardWarningAcknowledgements.add(warningCode)
        } else {
          ordersJobCardWarningAcknowledgements.delete(warningCode)
        }
        return
      }
      if (event.target?.closest?.('#ordersEditorPanel')) {
        ordersJobCardWarningAcknowledgements.clear()
        ordersSetEditorDirty(true)
      }

      if (
        [
          'ordersJobCardSiteMode',
          'ordersJobCardServiceType',
          'ordersJobCardCrewSource',
          'ordersJobCardDispatchRequired',
          'ordersJobCardLeaderWorker',
          'ordersJobCardDriverWorker',
          'ordersJobCardPackingRequired',
          'ordersJobCardAccessNone',
          'ordersJobCardSafetyNone',
          'ordersJobCardPaymentMethod',
          'ordersJobCardPricingMode',
          'ordersJobCardSignatureRequired',
          'ordersJobCardRecurrenceConfirmed',
        ].includes(String(event.target?.id ?? ''))
      ) {
        const order = ordersFindTimelineOrder(appState.ordersEditingId) || {}
        ordersSyncJobCardOperationalDependencies(order)
        ordersRenderEditorWizard(order)
        return
      }

      if (
        [
          'ordersListDateFrom',
          'ordersListDateTo',
          'ordersListStatus',
          'ordersListType',
          'ordersListClient',
          'ordersListWorker',
          'ordersListAssignment',
          'ordersListSort',
        ].includes(String(event.target?.id ?? ''))
      ) {
        ordersListReadFilters()
        renderOrdersView()
        return
      }

      if (event.target?.id === 'ordersDeviceNotePhoto') {
        ordersRenderDeviceNotePhotoPreview()
        return
      }
  
      if (event.target?.id === 'ordersEditAllowExtendedWork') {
        const order = ordersFindTimelineOrder(appState.ordersEditingId)
        if (order) {
          ordersAssignExtendedWorkFlags(order, ordersReadExtendedWorkAllowed())
          ordersRenderSchedulePreview(order)
        }
        return
      }
  
      if (event.target?.id === 'ordersEditAddressSelect') {
        const address = ordersApplyExecutionAddressSelection(ordersReadInputValue('ordersEditAddressSelect'))
        const order = ordersFindTimelineOrder(appState.ordersEditingId)
        if (order) {
          const selectedClient = ordersFindClientBySelection(ordersReadInputValue('ordersEditClient'))
          const selectedClientData = selectedClient ? ordersClientFormData(selectedClient) : {}
          const defaultAddress = ordersClientAddressLabel(selectedClientData)
          order.addressLabel = address || defaultAddress
          order.executionAddressLabel = address
          order.customAddressLabel = address
          order.mapUrl = ordersReadInputValue('ordersEditLocationMapUrl') || ordersGoogleMapsSearchUrl(order.addressLabel)
          order.googleMapsUrl = order.mapUrl
          ordersRenderSchedulePreview(order)
          ordersRenderEditorWizard(order)
        }
        return
      }

      if (
        event.target?.hasAttribute?.('data-orders-service-mode') ||
        event.target?.hasAttribute?.('data-orders-service-date') ||
        event.target?.hasAttribute?.('data-orders-service-start') ||
        event.target?.hasAttribute?.('data-orders-service-end') ||
        event.target?.hasAttribute?.('data-orders-service-weekday') ||
        event.target?.hasAttribute?.('data-orders-service-slot-label') ||
        event.target?.hasAttribute?.('data-orders-service-slot-worker') ||
        event.target?.hasAttribute?.('data-orders-service-slot-hours')
      ) {
        const order = ordersFindTimelineOrder(appState.ordersEditingId)
        if (order) {
          if (event.target?.hasAttribute?.('data-orders-service-mode')) {
            const nextServiceMode = event.target?.value === 'repeat' ? 'repeat' : 'once'
            const allServiceModesOnce = [...document.querySelectorAll('#ordersWorkAllocationRows [data-orders-service-mode]')]
              .every((node) => node instanceof HTMLSelectElement && node.value === 'once')
            const nextOrderMode = nextServiceMode === 'repeat' || !allServiceModesOnce ? 'repeat' : 'once'
            if (ordersScheduleModeForOrder(order) !== nextOrderMode) {
              ordersApplyScheduleModeDateDefaults(order, nextOrderMode)
              order.scheduleMode = nextOrderMode
              order.type = nextOrderMode === 'repeat' ? 'cyclic' : String(order.type ?? '').trim() === 'cyclic' ? 'individual' : order.type
              ordersSetScheduleModeValue(nextOrderMode)
            }
          }
          if (event.target?.hasAttribute?.('data-orders-service-slot-label')) {
            ordersApplyServiceSlotPersonSelection(event.target)
          }
          if (event.target?.hasAttribute?.('data-orders-service-slot-worker')) {
            ordersRejectDuplicateServiceSlotWorker(event.target)
            ordersSyncServiceSlotPersonLabelFromWorker(event.target)
          }
          ordersSyncServiceBlockDraftFromControls(order)
          ordersRenderJobCardRolePickers(order, { preserve: true })
          ordersRenderWorkAllocationControls(order, { forceEven: true, preferStored: false })
          ordersRenderSchedulePreview(order)
          ordersRenderEditorWizard(order)
        }
        return
      }
  
      if (event.target?.name === 'ordersScheduleMode') {
        const order = ordersFindTimelineOrder(appState.ordersEditingId)
        if (order) {
          const nextMode = event.target?.value === 'repeat' ? 'repeat' : 'once'
          ordersApplyScheduleModeDateDefaults(order, nextMode)
          ordersUpdateOrderScheduleFromControls(order)
          ordersSyncScheduleControls(order)
          ordersRefreshObjectPlanScheduleWindow(order, { syncMonth: true })
          ordersRenderSchedulePreview(order)
          ordersSyncJobCardOperationalDependencies(order)
          ordersRenderEditorWizard(order)
        } else {
          ordersSetScheduleRepeatDisabled(event.target?.value !== 'repeat')
          ordersSyncScheduleTimeLabels(event.target?.value === 'repeat' ? 'repeat' : 'once')
          ordersRenderRepeatCalendar({})
          ordersRenderEditorWizard({})
        }
        return
      }
  
      if (event.target?.id === 'ordersEditType') {
        const order = ordersFindTimelineOrder(appState.ordersEditingId)
        if (order) {
          const selectedType = ordersReadInputValue('ordersEditType') || 'individual'
          order.type = selectedType
          order.scheduleMode = selectedType === 'cyclic' ? 'repeat' : 'once'
          ordersApplyScheduleModeDateDefaults(order, order.scheduleMode)
          ordersSyncScheduleControls(order)
          ordersRefreshObjectPlanScheduleWindow(order, { syncMonth: true })
          ordersRenderSchedulePreview(order)
          ordersSyncJobCardOperationalDependencies(order)
          ordersRenderEditorWizard(order)
        }
        return
      }
  
      if (['ordersEditRepeatPreset', 'ordersEditRepeatUnit'].includes(String(event.target?.id ?? ''))) {
        ordersSyncRepeatSelectPickers(String(event.target?.id ?? ''))
      }
  
      if (event.target?.id === 'ordersEditRepeatPreset') {
        ordersApplyRepeatPresetToControls(ordersReadInputValue('ordersEditRepeatPreset'))
      }
  
      if (
        [
          'ordersScheduleStartDate',
          'ordersScheduleEndDate',
          'ordersScheduleStartTime',
          'ordersScheduleEndTime',
          'ordersEditStart',
          'ordersEditEnd',
          'ordersEditRepeatPreset',
          'ordersEditRepeatEvery',
          'ordersEditRepeatUnit',
          'ordersEditWorkHours',
          'ordersEditRequiredPeople',
        ].includes(String(event.target?.id ?? '')) ||
        event.target?.hasAttribute?.('data-orders-repeat-weekday') ||
        event.target?.hasAttribute?.('data-orders-weekly-pattern-start') ||
        event.target?.hasAttribute?.('data-orders-weekly-pattern-end') ||
        event.target?.hasAttribute?.('data-orders-weekly-pattern-hours') ||
        event.target?.hasAttribute?.('data-orders-weekly-pattern-people') ||
        event.target?.hasAttribute?.('data-orders-work-allocation-start') ||
        event.target?.hasAttribute?.('data-orders-work-allocation-end')
      ) {
        const targetId = String(event.target?.id ?? '')
        if (
          ['ordersScheduleStartDate', 'ordersScheduleEndDate', 'ordersEditStart', 'ordersEditEnd'].includes(targetId) &&
          document.querySelector('#ordersEditorPanel input[name="ordersScheduleMode"]:checked')?.value === 'repeat'
        ) {
          ordersSetCheckboxValue('ordersJobCardRecurrenceConfirmed', false)
        }
        ordersSyncMainScheduleFromMirror(targetId)
        if (targetId === 'ordersEditStart' || targetId === 'ordersScheduleStartDate') {
          ordersSetRepeatCalendarMonthFromDate(ordersReadInputValue(targetId))
        }
        const order = ordersFindTimelineOrder(appState.ordersEditingId)
        if (order) {
          ordersUpdateOrderScheduleFromControls(order)
          if (targetId === 'ordersEditStart' || targetId === 'ordersScheduleStartDate') {
            const checkedWeekdays = ordersReadRepeatWeekdays()
            if (!checkedWeekdays.length) {
              order.repeatWeekdays = [ordersWeekdayFromDateKey(order.dateYmd)]
            }
          }
          ordersRefreshObjectPlanScheduleWindow(order, {
            syncMonth: targetId === 'ordersEditStart' || targetId === 'ordersScheduleStartDate',
          })
          ordersRenderSchedulePreview(order)
          ordersRenderEditorWizard(order)
        } else {
          ordersRenderRepeatCalendar({})
          ordersRenderEditorWizard({})
        }
        return
      }
  
      if (event.target?.id === 'ordersEditClient') {
        const order = ordersFindTimelineOrder(appState.ordersEditingId)
        const selection = ordersReadInputValue('ordersEditClient')
        ordersSyncClientPicker(selection)
        if (selection === ORDERS_RETAIL_CLIENT_VALUE) {
          ordersOpenClientCreateFromEditor({ clientType: 'DETALICZNY' })
          return
        }
        if (selection === ORDERS_NEW_CLIENT_VALUE) {
          ordersOpenClientCreateFromEditor()
          return
        }
        const applied = ordersApplySelectedClientToEditor(selection)
        if (order) {
          appState.ordersObjectPlanZoneKey = ''
          appState.ordersObjectPlanSelectedZoneKeys = []
          appState.ordersObjectPlanDayEditorDate = ''
          appState.ordersObjectPlanZoneWindowOpen = false
          appState.ordersObjectPlanTaskWindowOpen = false
          const data = applied?.data ?? { clientName: selection }
          ordersApplyClientDataToOrder(order, data, selection)
          ordersRenderObjectPlan(order)
          ordersRenderSchedulePreview(order)
          ordersRenderEditorWizard(order)
        }
        return
      }
      if (event.target?.hasAttribute?.('data-orders-object-zone-filter')) {
        const order = ordersFindTimelineOrder(appState.ordersEditingId)
        if (order) {
          const zones = ordersObjectPlanZonesForOrder(order)
          const key = String(event.target.getAttribute('data-orders-object-zone-filter') || '').trim()
          const allKeys = zones.map((zone) => zone.key)
          const base = ordersObjectPlanSelectedZoneKeys(zones)
          const selected = new Set(base.length ? base : allKeys)
          if (event.target.checked) {
            selected.add(key)
          } else {
            selected.delete(key)
          }
          if (!selected.size) {
            event.target.checked = true
            showTransientNotice('Wybierz co najmniej jedną strefę.', 'error')
            return
          }
          appState.ordersObjectPlanSelectedZoneKeys = selected.size === allKeys.length ? [] : [...selected]
          ordersRenderObjectPlan(order)
        }
        return
      }
      if (event.target?.id === 'ordersObjectDayTaskMode' || event.target?.id === 'ordersObjectTaskMode') {
        const cadenceId = event.target.id === 'ordersObjectTaskMode' ? 'ordersObjectTaskCadence' : 'ordersObjectDayTaskCadence'
        const cadence = document.getElementById(cadenceId)
        if (cadence instanceof HTMLSelectElement) {
          cadence.disabled = event.target.value !== 'repeat'
        }
        return
      }
      if (
        event.target?.hasAttribute?.('data-orders-object-day-task-name') ||
        event.target?.hasAttribute?.('data-orders-object-day-task-zone') ||
        event.target?.hasAttribute?.('data-orders-object-day-task-mode') ||
        event.target?.hasAttribute?.('data-orders-object-day-task-cadence')
      ) {
        ordersUpdateObjectPlanDayTaskFromControl(event.target)
        return
      }
      if (event.target?.id === 'ordersEditWorker') {
        const order = ordersFindTimelineOrder(appState.ordersEditingId)
        const row = Number(ordersReadInputValue('ordersEditWorker'))
        if (order && Number.isInteger(row) && row >= 0) {
          order.row = row
          order.assignedRows = ordersReadSelectedWorkerRows()
          ordersRenderWorkerChecklist(order)
          ordersRenderJobCardRolePickers(order, { preserve: true })
          ordersRenderWorkAllocationControls(order, { forceEven: true })
          ordersRenderSchedulePreview(order)
          ordersRenderEditorWizard(order)
        }
        return
      }
      if (event.target?.hasAttribute?.('data-orders-worker-row')) {
        const order = ordersFindTimelineOrder(appState.ordersEditingId)
        const rows = ordersNormalizeWorkerPickerSelection(event.target)
        ordersSyncWorkerPickerLabel(rows)
        if (order) {
          order.row = rows[0] ?? 0
          order.assignedRows = rows
          ordersRenderJobCardRolePickers(order, { preserve: true })
          ordersRenderWorkAllocationControls(order, { forceEven: true })
          ordersRenderSchedulePreview(order)
          ordersRenderEditorWizard(order)
        }
        return
      }
    })
  
    binding.add(root, 'click', (event) => {
      if (!eventTargetClosest(event, '.orders-worker-picker')) {
        ordersCloseWorkerPicker()
      }

      const editorMutation = eventTargetClosest(
        event,
        '[data-orders-client-pick], [data-orders-location-index], #ordersWeeklyPatternApplyAll, [data-orders-service-add], [data-orders-service-remove], [data-orders-service-slot-add], [data-orders-service-slot-remove], #ordersObjectTaskAdd, #ordersObjectDayTaskAdd, [data-orders-remove-object-task], #ordersSubtaskAdd, [data-orders-remove-subtask], #ordersSupplyAdd, [data-orders-remove-supply], #ordersCoworkerAdd, [data-orders-remove-coworker], #ordersDeviceNoteSave',
      )
      if (editorMutation) {
        ordersSetEditorDirty(true)
      }

      const discardCancel = eventTargetClosest(event, '[data-orders-discard-cancel]')
      if (discardCancel) {
        event.preventDefault()
        ordersCloseDiscardConfirm()
        return
      }

      const discardConfirm = eventTargetClosest(event, '[data-orders-discard-confirm]')
      if (discardConfirm) {
        event.preventDefault()
        ordersShowList({ force: true })
        return
      }
  
      const clientPick = eventTargetClosest(event, '[data-orders-client-pick]')
      if (clientPick) {
        event.preventDefault()
        ordersCloseRepeatSelectPickers()
        ordersPickClientFromPicker(clientPick.getAttribute('data-orders-client-pick'))
        return
      }
  
      if (eventTargetClosest(event, '.orders-client-picker')) {
        ordersCloseRepeatSelectPickers()
        ordersSetClientPickerOpen(true)
        return
      }
  
      const repeatSelectPick = eventTargetClosest(event, '[data-orders-repeat-select-pick]')
      if (repeatSelectPick) {
        event.preventDefault()
        ordersHideClientPicker()
        ordersPickRepeatSelectOption(
          repeatSelectPick.getAttribute('data-orders-repeat-select-id'),
          repeatSelectPick.getAttribute('data-orders-repeat-select-pick'),
        )
        return
      }
  
      const repeatSelectToggle = eventTargetClosest(event, '[data-orders-repeat-select-toggle]')
      if (repeatSelectToggle) {
        event.preventDefault()
        ordersHideClientPicker()
        ordersHideLocationSuggestions()
        const picker = repeatSelectToggle.closest('[data-orders-repeat-select]')
        const selectId = picker?.getAttribute('data-orders-repeat-select') || ''
        const isOpen = repeatSelectToggle.getAttribute('aria-expanded') === 'true'
        ordersSetRepeatSelectPickerOpen(selectId, !isOpen)
        return
      }
  
      const locationSuggestion = eventTargetClosest(event, '[data-orders-location-index]')
      if (locationSuggestion) {
        event.preventDefault()
        const index = Number(locationSuggestion.getAttribute('data-orders-location-index'))
        const item = Number.isInteger(index) ? ordersRenderedLocationSuggestions[index] : null
        if (item) {
          ordersPickLocationSuggestion(item)
        }
        return
      }
  
      const repeatCalendarNav = eventTargetClosest(event, '[data-orders-repeat-calendar-nav]')
      if (repeatCalendarNav) {
        event.preventDefault()
        ordersMoveRepeatCalendarMonth(Number(repeatCalendarNav.getAttribute('data-orders-repeat-calendar-nav')) || 1)
        ordersRenderRepeatCalendar(ordersFindTimelineOrder(appState.ordersEditingId) || {})
        return
      }
  
      const weeklyPatternApplyAll = eventTargetClosest(event, '#ordersWeeklyPatternApplyAll')
      if (weeklyPatternApplyAll) {
        event.preventDefault()
        ordersApplyFirstWeeklyPatternToAll()
        return
      }
  
      const addOrder = eventTargetClosest(event, '#ordersAddBtn')
      if (addOrder) {
        event.preventDefault()
        if (typeof openOrderCreateWorkspace === 'function') {
          void openOrderCreateWorkspace({
            sourceRoute: 'orders',
            returnRoute: 'orders',
            initialDate: todayYmd(),
          })
        } else {
          showTransientNotice('Kreator zlecenia jest chwilowo niedostępny.', 'error')
        }
        return
      }

      const quickFilter = eventTargetClosest(event, '[data-orders-quick-filter]')
      if (quickFilter) {
        event.preventDefault()
        ordersListSetQuickFilter(quickFilter.getAttribute('data-orders-quick-filter'))
        renderOrdersView()
        return
      }

      const clearFilters = eventTargetClosest(event, '#ordersFilterClear')
      if (clearFilters) {
        event.preventDefault()
        ordersListClearFilters()
        renderOrdersView()
        return
      }

      const modelFilter = eventTargetClosest(event, '#ordersListModel [data-orders-list-model]')
      if (modelFilter) {
        event.preventDefault()
        ordersListSetModelFilter(modelFilter.getAttribute('data-orders-list-model'))
        renderOrdersView()
        return
      }
  
      const toggle = eventTargetClosest(event, '#ordersCycleToggle')
      if (toggle) {
        event.preventDefault()
        ordersListSetModelFilter(ordersListModelFilter() === 'cyclic' ? 'all' : 'cyclic')
        renderOrdersView()
        return
      }

      const wizardStep = eventTargetClosest(event, '[data-orders-step-target]')
      if (wizardStep) {
        event.preventDefault()
        ordersSetEditorStep(wizardStep.getAttribute('data-orders-step-target'), { validate: true, focus: true })
        return
      }

      const wizardPrev = eventTargetClosest(event, '[data-orders-step-prev]')
      if (wizardPrev) {
        event.preventDefault()
        ordersMoveEditorStep(-1)
        return
      }

      const wizardNext = eventTargetClosest(event, '[data-orders-step-next]')
      if (wizardNext) {
        event.preventDefault()
        ordersMoveEditorStep(1)
        return
      }

      const serviceAdd = eventTargetClosest(event, '[data-orders-service-add]')
      if (serviceAdd) {
        event.preventDefault()
        ordersAddServiceBlockToCurrentOrder()
        return
      }

      const serviceRemove = eventTargetClosest(event, '[data-orders-service-remove]')
      if (serviceRemove) {
        event.preventDefault()
        ordersRemoveServiceBlockFromCurrentOrder(serviceRemove.getAttribute('data-orders-service-remove'))
        return
      }

      const serviceSlotAdd = eventTargetClosest(event, '[data-orders-service-slot-add]')
      if (serviceSlotAdd) {
        event.preventDefault()
        ordersAddServiceSlotToCurrentBlock(serviceSlotAdd.getAttribute('data-orders-service-slot-add'))
        return
      }

      const serviceSlotRemove = eventTargetClosest(event, '[data-orders-service-slot-remove]')
      if (serviceSlotRemove) {
        event.preventDefault()
        const blockNode = serviceSlotRemove.closest('[data-orders-service-block]')
        ordersRemoveServiceSlotFromCurrentBlock(
          blockNode?.getAttribute('data-orders-service-block'),
          serviceSlotRemove.getAttribute('data-orders-service-slot-remove'),
        )
        return
      }
  
      const editorTab = eventTargetClosest(event, '[data-orders-tab-target]')
      if (editorTab) {
        event.preventDefault()
        appState.ordersEditorTab = String(editorTab.getAttribute('data-orders-tab-target') || 'basic')
        ordersRenderEditorTabs()
        return
      }
  
      const back = eventTargetClosest(event, '#ordersEditBack')
      if (back) {
        event.preventDefault()
        ordersShowList()
        return
      }
  
      if (event.target?.id === 'ordersEditorPanel') {
        event.preventDefault()
        ordersShowList()
        return
      }

      const publish = eventTargetClosest(event, '#ordersJobCardPublish')
      if (publish) {
        event.preventDefault()
        void ordersPublishJobCard()
        return
      }
  
      const save = eventTargetClosest(event, '#ordersEditSave, [data-orders-save]')
      if (save) {
        event.preventDefault()
        void ordersSaveEditor()
        return
      }
  
      const objectZone = eventTargetClosest(event, '[data-orders-object-zone]')
      if (objectZone) {
        event.preventDefault()
        appState.ordersObjectPlanZoneKey = String(objectZone.getAttribute('data-orders-object-zone') || '').trim()
        ordersRenderObjectPlan(ordersFindTimelineOrder(appState.ordersEditingId) || {})
        return
      }
  
      const addObjectTask = eventTargetClosest(event, '#ordersObjectTaskAdd')
      if (addObjectTask) {
        event.preventDefault()
        ordersAddObjectPlanTaskToCurrentOrder()
        return
      }
  
      const taskWindowOpen = eventTargetClosest(event, '[data-orders-object-task-window-open]')
      if (taskWindowOpen) {
        event.preventDefault()
        appState.ordersObjectPlanTaskWindowOpen = true
        ordersRenderObjectPlan(ordersFindTimelineOrder(appState.ordersEditingId) || {})
        window.setTimeout(() => document.getElementById('ordersObjectTaskName')?.focus?.(), 0)
        return
      }
  
      const taskWindowClose = eventTargetClosest(event, '[data-orders-object-task-window-close]')
      if (taskWindowClose && (taskWindowClose.tagName === 'BUTTON' || event.target === taskWindowClose)) {
        event.preventDefault()
        appState.ordersObjectPlanTaskWindowOpen = false
        ordersRenderObjectPlan(ordersFindTimelineOrder(appState.ordersEditingId) || {})
        return
      }
  
      const zoneWindowOpen = eventTargetClosest(event, '[data-orders-object-zone-window-open]')
      if (zoneWindowOpen) {
        event.preventDefault()
        appState.ordersObjectPlanZoneWindowOpen = true
        ordersRenderObjectPlan(ordersFindTimelineOrder(appState.ordersEditingId) || {})
        return
      }
  
      const zoneWindowClose = eventTargetClosest(event, '[data-orders-object-zone-window-close]')
      if (zoneWindowClose && (zoneWindowClose.tagName === 'BUTTON' || event.target === zoneWindowClose)) {
        event.preventDefault()
        appState.ordersObjectPlanZoneWindowOpen = false
        ordersRenderObjectPlan(ordersFindTimelineOrder(appState.ordersEditingId) || {})
        return
      }
  
      const calendarMonth = eventTargetClosest(event, '[data-orders-object-calendar-month]')
      if (calendarMonth) {
        event.preventDefault()
        ordersMoveObjectPlanCalendarMonth(Number(calendarMonth.getAttribute('data-orders-object-calendar-month')) || 0)
        return
      }
  
      const dayClose = eventTargetClosest(event, '[data-orders-object-day-close]')
      if (dayClose && (dayClose.tagName === 'BUTTON' || event.target === dayClose)) {
        event.preventDefault()
        appState.ordersObjectPlanDayEditorDate = ''
        ordersRenderObjectPlan(ordersFindTimelineOrder(appState.ordersEditingId) || {})
        return
      }
  
      const addDayTask = eventTargetClosest(event, '#ordersObjectDayTaskAdd')
      if (addDayTask) {
        event.preventDefault()
        ordersAddObjectPlanDayTaskToCurrentOrder()
        return
      }
  
      const calendarDay = eventTargetClosest(event, '[data-orders-object-calendar-day]')
      if (calendarDay) {
        event.preventDefault()
        const order = ordersFindTimelineOrder(appState.ordersEditingId) || {}
        const day = ordersNormalizeDateField(calendarDay.getAttribute('data-orders-object-calendar-day'), todayYmd())
        if (!ordersObjectPlanDayIsActive(order, day)) {
          return
        }
        appState.ordersObjectPlanDayEditorDate = day
        ordersRenderObjectPlan(order)
        return
      }
  
      const removeObjectTask = eventTargetClosest(event, '[data-orders-remove-object-task]')
      if (removeObjectTask) {
        event.preventDefault()
        ordersRemoveObjectPlanTaskFromCurrentOrder(removeObjectTask.getAttribute('data-orders-remove-object-task'))
        return
      }
  
      const addSubtask = eventTargetClosest(event, '#ordersSubtaskAdd')
      if (addSubtask) {
        event.preventDefault()
        ordersAddSubtaskToCurrentOrder()
        return
      }
  
      const removeSubtask = eventTargetClosest(event, '[data-orders-remove-subtask]')
      if (removeSubtask) {
        event.preventDefault()
        ordersRemoveSubtaskFromCurrentOrder(removeSubtask.getAttribute('data-orders-remove-subtask'))
        return
      }
  
      const addSupply = eventTargetClosest(event, '#ordersSupplyAdd')
      if (addSupply) {
        event.preventDefault()
        ordersAddSupplyToCurrentOrder()
        return
      }
  
      const addAddressMemory = eventTargetClosest(event, '#ordersAddressMemoryAdd')
      if (addAddressMemory) {
        event.preventDefault()
        ordersAddExecutionAddressForCurrentClient()
        return
      }
  
      const removeSupply = eventTargetClosest(event, '[data-orders-remove-supply]')
      if (removeSupply) {
        event.preventDefault()
        ordersRemoveSupplyFromCurrentOrder(removeSupply.getAttribute('data-orders-remove-supply'))
        return
      }
  
      const addDeviceNote = eventTargetClosest(event, '#ordersDeviceNoteAdd')
      if (addDeviceNote) {
        event.preventDefault()
        ordersOpenDeviceNoteModal()
        return
      }
  
      const closeDeviceNote = eventTargetClosest(event, '[data-orders-device-note-close]')
      if (closeDeviceNote || event.target?.id === 'ordersDeviceNoteOverlay') {
        event.preventDefault()
        ordersCloseDeviceNoteModal()
        return
      }
  
      const saveDeviceNote = eventTargetClosest(event, '#ordersDeviceNoteSave')
      if (saveDeviceNote) {
        event.preventDefault()
        void ordersSaveDeviceNoteFromModal()
        return
      }
  
      const addCoworker = eventTargetClosest(event, '#ordersCoworkerAdd')
      if (addCoworker) {
        event.preventDefault()
        ordersAddCoworkerToCurrentOrder()
        return
      }
  
      const removeCoworker = eventTargetClosest(event, '[data-orders-remove-coworker]')
      if (removeCoworker) {
        event.preventDefault()
        ordersRemoveCoworkerFromCurrentOrder(removeCoworker.getAttribute('data-orders-remove-coworker'))
        return
      }
  
      const action = eventTargetClosest(event, '[data-orders-list-action]')
      if (action) {
        event.preventDefault()
        const row = eventTargetClosest(event, '[data-order-id]')
        const orderId = row?.getAttribute('data-order-id') || row?.getAttribute('data-order-source-id') || ''
        const actionName = action.getAttribute('data-orders-list-action')
        if (actionName === 'continue') {
          void ordersContinueJobCardDraft(orderId)
          return
        }
        if (actionName === 'edit') {
          ordersOpenEditor(orderId)
          return
        }
        if (actionName === 'pin') {
          ordersOpenMapModal(orderId)
          return
        }
        if (actionName === 'delete') {
          void ordersDeleteTimelineOrderFromList(orderId)
          return
        }
      }

      const refresh = eventTargetClosest(event, '#ordersRefreshBtn')
      if (refresh) {
        event.preventDefault()
        void ordersRefreshListFromRemote()
        return
      }

      const showAllDrafts = eventTargetClosest(event, '#ordersDraftsShowAll')
      if (showAllDrafts) {
        event.preventDefault()
        void ordersLoadAllJobCardDrafts()
        return
      }
  
      const search = eventTargetClosest(event, '#ordersSearchBtn')
      if (search) {
        event.preventDefault()
        ordersListReadFilters()
        renderOrdersView()
        return
      }
  
      const mapClose = eventTargetClosest(event, '[data-orders-map-close]')
      if (mapClose || event.target?.id === 'ordersMapOverlay') {
        event.preventDefault()
        ordersCloseMapModal()
        return
      }
  
      const locationArea = eventTargetClosest(event, '.orders-location-combo')
      if (!locationArea) {
        ordersHideLocationSuggestions()
      }
      const clientPickerArea = eventTargetClosest(event, '.orders-client-picker')
      if (!clientPickerArea) {
        ordersHideClientPicker()
      }
      const repeatPickerArea = eventTargetClosest(event, '.orders-repeat-select-picker')
      if (!repeatPickerArea) {
        ordersCloseRepeatSelectPickers()
      }
    })
  
    binding.add(root, 'keydown', (event) => {
      if (event.key === 'Escape' && !document.getElementById('ordersDiscardConfirm')?.hidden) {
        event.preventDefault()
        ordersCloseDiscardConfirm()
        return
      }

      if (event.target?.id === 'ordersClientPickerInput') {
        if (event.key === 'Escape') {
          ordersHideClientPicker()
          return
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          const firstOption = document.querySelector('#ordersClientPickerList [data-orders-client-pick]')
          if (firstOption instanceof HTMLElement) {
            ordersPickClientFromPicker(firstOption.getAttribute('data-orders-client-pick'))
          }
          return
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          ordersSetClientPickerOpen(true)
          const firstOption = document.querySelector('#ordersClientPickerList [data-orders-client-pick]')
          if (firstOption instanceof HTMLElement) {
            firstOption.focus()
          }
          return
        }
      }
  
      if (event.target?.hasAttribute?.('data-orders-client-pick')) {
        const current = event.target
        if (event.key === 'Escape') {
          ordersHideClientPicker()
          document.getElementById('ordersClientPickerInput')?.focus()
          return
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          ordersPickClientFromPicker(current.getAttribute('data-orders-client-pick'))
          return
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          const options = [...document.querySelectorAll('#ordersClientPickerList [data-orders-client-pick]')]
          const index = options.indexOf(current)
          const nextIndex = event.key === 'ArrowDown' ? Math.min(options.length - 1, index + 1) : Math.max(0, index - 1)
          const next = options[nextIndex]
          if (next instanceof HTMLElement) {
            next.focus()
          }
          return
        }
      }
  
      if (event.target?.hasAttribute?.('data-orders-repeat-select-toggle')) {
        const picker = event.target.closest('[data-orders-repeat-select]')
        const selectId = picker?.getAttribute('data-orders-repeat-select') || ''
        if (event.key === 'Escape') {
          ordersCloseRepeatSelectPickers()
          return
        }
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          ordersSetRepeatSelectPickerOpen(selectId, true)
          ordersFocusRepeatSelectPickerOption(selectId, event.key === 'ArrowUp' ? 'last' : 'selected')
          return
        }
      }
  
      if (event.target?.hasAttribute?.('data-orders-repeat-select-pick')) {
        const current = event.target
        const selectId = current.getAttribute('data-orders-repeat-select-id') || ''
        if (event.key === 'Escape') {
          ordersSetRepeatSelectPickerOpen(selectId, false)
          const { button } = ordersRepeatSelectPickerParts(selectId)
          button?.focus()
          return
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          ordersPickRepeatSelectOption(selectId, current.getAttribute('data-orders-repeat-select-pick'))
          const { button } = ordersRepeatSelectPickerParts(selectId)
          button?.focus()
          return
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          const options = ordersRepeatSelectPickerOptions(selectId)
          const index = options.indexOf(current)
          const nextIndex = event.key === 'ArrowDown' ? Math.min(options.length - 1, index + 1) : Math.max(0, index - 1)
          options[nextIndex]?.focus()
          return
        }
      }
  
      if (event.key === 'Enter' && event.target?.id === 'ordersSubtaskName') {
        event.preventDefault()
        ordersSetEditorDirty(true)
        ordersAddSubtaskToCurrentOrder()
        return
      }
      if (event.key === 'Enter' && event.target?.id === 'ordersObjectTaskName') {
        event.preventDefault()
        ordersSetEditorDirty(true)
        ordersAddObjectPlanTaskToCurrentOrder()
        return
      }
      if (event.key === 'Enter' && event.target?.id === 'ordersObjectDayTaskName') {
        event.preventDefault()
        ordersSetEditorDirty(true)
        ordersAddObjectPlanDayTaskToCurrentOrder()
        return
      }
      if ((event.key === 'Enter' || event.key === ' ') && event.target?.hasAttribute?.('data-orders-object-calendar-day')) {
        event.preventDefault()
        const order = ordersFindTimelineOrder(appState.ordersEditingId) || {}
        const day = ordersNormalizeDateField(event.target.getAttribute('data-orders-object-calendar-day'), todayYmd())
        if (!ordersObjectPlanDayIsActive(order, day)) {
          return
        }
        appState.ordersObjectPlanDayEditorDate = day
        ordersRenderObjectPlan(order)
        return
      }
      if (event.key === 'Enter' && ['ordersSupplyName', 'ordersSupplyQr'].includes(event.target?.id)) {
        event.preventDefault()
        ordersSetEditorDirty(true)
        ordersAddSupplyToCurrentOrder()
        return
      }
      if (event.key === 'Escape' && !document.getElementById('ordersDeviceNoteOverlay')?.hidden) {
        ordersCloseDeviceNoteModal()
        return
      }
      if (event.target?.id === 'ordersEditLocation' && event.key === 'Escape') {
        ordersHideLocationSuggestions()
      }
      if (event.key === 'Escape' && appState.ordersObjectPlanZoneWindowOpen) {
        appState.ordersObjectPlanZoneWindowOpen = false
        ordersRenderObjectPlan(ordersFindTimelineOrder(appState.ordersEditingId) || {})
        return
      }
      if (event.key === 'Escape' && appState.ordersObjectPlanTaskWindowOpen) {
        appState.ordersObjectPlanTaskWindowOpen = false
        ordersRenderObjectPlan(ordersFindTimelineOrder(appState.ordersEditingId) || {})
        return
      }
      if (event.key === 'Escape') {
        if (ordersEditorPanelIsVisible()) {
          event.preventDefault()
          ordersShowList()
        } else {
          ordersCloseMapModal()
        }
      }
    })
  
    binding.add(root, 'dragstart', (event) => {
      const serviceHandle = eventTargetClosest(event, '[data-orders-service-drag-handle]')
      if (serviceHandle) {
        const kind = String(serviceHandle.getAttribute('data-orders-service-drag-handle') || '').trim()
        appState.ordersServiceBlockDraggingKind = kind
        serviceHandle.closest('[data-orders-service-block]')?.classList.add('is-column-dragging')
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData('text/plain', `service-block:${kind}`)
        }
        return
      }
      const chip = eventTargetClosest(event, '[data-orders-object-task-drag]')
      if (!chip) {
        return
      }
      const id = String(chip.getAttribute('data-orders-object-task-drag') || '').trim()
      appState.ordersObjectPlanDraggingTaskId = id
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', id)
      }
      chip.classList.add('is-dragging')
    })
  
    binding.add(root, 'dragend', (event) => {
      if (eventTargetClosest(event, '[data-orders-service-drag-handle]')) {
        ordersClearServiceBlockDragState()
        return
      }
      const chip = eventTargetClosest(event, '[data-orders-object-task-drag]')
      chip?.classList.remove('is-dragging')
      appState.ordersObjectPlanDraggingTaskId = ''
    })
  
    binding.add(root, 'dragover', (event) => {
      const serviceColumn = eventTargetClosest(event, '[data-orders-service-block]')
      if (serviceColumn && appState.ordersServiceBlockDraggingKind) {
        event.preventDefault()
        const position = ordersServiceBlockDropPosition(serviceColumn, event)
        ordersMarkServiceBlockDropTarget(serviceColumn, position)
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = 'move'
        }
        return
      }
      const day = eventTargetClosest(event, '[data-orders-object-calendar-day]')
      if (!day) {
        return
      }
      event.preventDefault()
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move'
      }
    })
  
    binding.add(root, 'drop', (event) => {
      const serviceColumn = eventTargetClosest(event, '[data-orders-service-block]')
      if (serviceColumn && appState.ordersServiceBlockDraggingKind) {
        event.preventDefault()
        ordersSetEditorDirty(true)
        const targetKind = String(serviceColumn.getAttribute('data-orders-service-block') || '').trim()
        const position = ordersServiceBlockDropPosition(serviceColumn, event)
        ordersMoveServiceBlockInCurrentOrder(appState.ordersServiceBlockDraggingKind, targetKind, position)
        ordersClearServiceBlockDragState()
        return
      }
      const day = eventTargetClosest(event, '[data-orders-object-calendar-day]')
      if (!day) {
        return
      }
      event.preventDefault()
      ordersSetEditorDirty(true)
      const order = ordersFindTimelineOrder(appState.ordersEditingId) || {}
      const targetDay = ordersNormalizeDateField(day.getAttribute('data-orders-object-calendar-day'), '')
      if (!ordersObjectPlanDayIsActive(order, targetDay)) {
        appState.ordersObjectPlanDraggingTaskId = ''
        return
      }
      const id = String(event.dataTransfer?.getData('text/plain') || appState.ordersObjectPlanDraggingTaskId || '').trim()
      ordersMoveObjectPlanTaskDate(id, targetDay)
      appState.ordersObjectPlanDraggingTaskId = ''
    })

    binding.add(window, 'beforeunload', (event) => {
      if (!ordersEditorHasUnsavedChanges()) {
        return
      }
      event.preventDefault()
      event.returnValue = ''
    })
  
    return binding.done
  }
  
  function bindOrdersMapViewFunctions() {
    const binding = createBindingHelpers()
    const root = document.getElementById('view-ordersMap')
  
    binding.add(root, 'change', (event) => {
      const targetId = String(event.target?.id ?? '')
      if (
        [
          'ordersMapDateFrom',
          'ordersMapDateTo',
          'ordersMapStatus',
          'ordersMapType',
          'ordersMapWorker',
          'ordersMapWorkerOnly',
        ].includes(targetId)
      ) {
        ordersMapReadControls()
        renderOrdersMapView()
      }
    })
  
    binding.add(root, 'input', (event) => {
      if (event.target?.id === 'ordersMapSearch') {
        appState.ordersMapSearch = String(event.target.value ?? '')
        renderOrdersMapView()
      }
    })
  
    binding.add(root, 'click', (event) => {
      const apply = eventTargetClosest(event, '#ordersMapApplyBtn, #ordersMapRefreshBtn, #ordersMapSearchBtn')
      if (apply) {
        event.preventDefault()
        ordersMapReadControls()
        renderOrdersMapView()
      }
    })
  
    return binding.done
  }

  function ordersCreateWorkspaceCustomerType(client = {}) {
    const source = normalizeSearchText(client?.clientType ?? client?.customerType ?? client?.type ?? '')
    return ['b2c', 'individual', 'retail', 'consumer', 'private', 'osoba prywatna'].includes(source) ? 'B2C' : 'B2B'
  }

  function ordersCreateWorkspaceObjectId(clientId = '', address = '', index = 0) {
    const normalizedClientId = String(clientId ?? '').trim()
    if (index === 0 || !address) {
      return normalizedClientId
    }
    const suffix = normalizeSearchText(address)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48)
    return `${normalizedClientId}::${suffix || index + 1}`
  }

  function ordersCreateWorkspaceOptions() {
    const clients = Array.isArray(appState.clients) ? appState.clients : []
    const zones = Array.isArray(appState.zones) ? appState.zones : []
    const resources = calendarTimelineResources()
    const objects = clients.flatMap((client) => {
      const data = ordersClientFormData(client)
      const clientId = data.clientId
      if (!clientId || !data.clientName) {
        return []
      }
      const clientZones = zones
        .filter((zone) => ordersZoneMatchesClient(zone, client))
        .map((zone, zoneIndex) => ({
          id: ordersFirstClientText(zone?.id, zone?.zoneId, zone?.qrCode, `zone-${zoneIndex + 1}`),
          name: ordersFirstClientText(zone?.name, zone?.zoneName, zone?.label, zone?.qrCode, `Strefa ${zoneIndex + 1}`),
          qrCode: ordersFirstClientText(zone?.qrCode, zone?.qr),
        }))
      const addresses = ordersClientExecutionAddresses(client)
      const uniqueAddresses = addresses.length
        ? addresses
        : [{ label: ordersClientAddressLabel(data), meta: '' }]
      return uniqueAddresses
        .map((row, index) => ({
          id: ordersCreateWorkspaceObjectId(clientId, row.label, index),
          objectId: ordersCreateWorkspaceObjectId(clientId, row.label, index),
          siteId: ordersCreateWorkspaceObjectId(clientId, row.label, index),
          clientId,
          clientName: data.clientName,
          customerType: ordersCreateWorkspaceCustomerType(client),
          name: index === 0 || !row.meta ? data.clientName : row.meta,
          address: String(row.label ?? '').trim(),
          city: data.city,
          nip: data.nip,
          email: data.email,
          contact: data.contact,
          zones: clientZones,
        }))
    })
    const workers = resources
      .map((resource, row) => {
        const id = ordersFirstClientText(
          resource?.workerId,
          resource?.idWorker,
          resource?.employeeId,
          resource?.id,
          resource?.email,
        )
        const name = ordersFirstClientText(resource?.name, resource?.workerName, resource?.label, id)
        if (!id || !name || !workerIsAssignable(resource)) {
          return null
        }
        return {
          id,
          workerId: id,
          name,
          row,
          role: ordersFirstClientText(resource?.role, 'WORKER').toUpperCase(),
        }
      })
      .filter(Boolean)
      .sort((left, right) => left.name.localeCompare(right.name, 'pl', { sensitivity: 'base' }))
    return { objects, workers, zones }
  }

  function ordersCreateWorkspaceSelectedObject(draft = {}) {
    const objectId = String(draft?.objectId ?? draft?.selectedObjectId ?? draft?.siteId ?? '').trim()
    const options = ordersCreateWorkspaceOptions()
    return options.objects.find((item) => String(item.id) === objectId) || null
  }

  function ordersCreateWorkspaceTaskRows(draft = {}, selectedObject = {}) {
    const zoneById = new Map((selectedObject?.zones || []).map((zone) => [String(zone.id), zone]))
    const source = Array.isArray(draft?.tasks) ? draft.tasks : []
    return source
      .map((task, index) => {
        const zoneId = String(task?.zoneId ?? '').trim()
        const zone = zoneById.get(zoneId)
        return {
          id: String(task?.id ?? `scope-${index + 1}`).trim(),
          zoneId,
          zoneName: String(task?.zoneName ?? zone?.name ?? '').trim(),
          title: String(task?.title ?? task?.name ?? '').trim(),
          name: String(task?.title ?? task?.name ?? '').trim(),
          instructions: [
            String(task?.instructions ?? task?.instruction ?? task?.note ?? '').trim(),
            String(task?.expectedResult ?? '').trim() ? `Oczekiwany rezultat: ${String(task.expectedResult).trim()}` : '',
          ].filter(Boolean).join('\n'),
          required: task?.required !== false,
        }
      })
      .filter((task) => task.title || task.zoneId || task.zoneName)
  }

  function ordersCreateWorkspaceAssignmentRows(draft = {}) {
    const selectedIds = new Set(
      (Array.isArray(draft?.assignedWorkerIds)
        ? draft.assignedWorkerIds
        : Array.isArray(draft?.workerIds)
          ? draft.workerIds
          : [])
        .map((value) => String(value ?? '').trim())
        .filter(Boolean),
    )
    if (!selectedIds.size) {
      return []
    }
    return ordersCreateWorkspaceOptions().workers
      .filter((worker) => selectedIds.has(String(worker.id)))
      .map((worker) => Number(worker.row))
      .filter((row, index, rows) => Number.isInteger(row) && row >= 0 && rows.indexOf(row) === index)
  }

  function ordersCreateWorkspaceBuildOrder(draft = {}) {
    const selectedObject = ordersCreateWorkspaceSelectedObject(draft)
    if (!selectedObject) {
      throw new Error('Wybierz obiekt zapisany w organizacji.')
    }
    const scheduleMode = String(draft?.scheduleMode ?? 'ONE_OFF').toUpperCase() === 'RECURRING' ? 'RECURRING' : 'ONE_OFF'
    const staffingMode = ['FIXED', 'VARIABLE_WEEKLY', 'BUFFER'].includes(String(draft?.staffingMode ?? '').toUpperCase())
      ? String(draft.staffingMode).toUpperCase()
      : 'BUFFER'
    const dateYmd = ordersNormalizeDateField(draft?.startDateYmd ?? draft?.dateStart ?? draft?.dateYmd, todayYmd())
    const startTime = ordersNormalizeTimeField(draft?.startTime, '08:00')
    const endTime = ordersNormalizeTimeField(draft?.endTime, ordersDefaultEndTime(startTime))
    const repeatUntil = scheduleMode === 'RECURRING'
      ? ordersNormalizeDateField(
          draft?.recurrenceUntilYmd ?? draft?.recurrenceUntil ?? draft?.repeatUntil,
          defaultJobCardRecurrenceUntil(dateYmd),
        )
      : ''
    const repeatWeekdays = scheduleMode === 'RECURRING'
      ? (Array.isArray(draft?.repeatWeekdays)
          ? draft.repeatWeekdays
          : Array.isArray(draft?.weekdays)
            ? draft.weekdays
            : [])
          .map((value) => Number(value))
          .filter((value, index, values) => Number.isInteger(value) && value >= 0 && value <= 6 && values.indexOf(value) === index)
      : []
    const assignmentRows = staffingMode === 'FIXED' ? ordersCreateWorkspaceAssignmentRows(draft) : []
    const workerAssignments = assignmentRows.length ? ordersWorkerAssignmentsFromRows(assignmentRows, calendarTimelineResources()) : []
    const requiredPeople = Math.max(1, Math.min(50, Math.floor(Number(draft?.requiredPeople) || assignmentRows.length || 1)))
    const startMinutes = calendarTimelineTimeMinutes(startTime, 8 * 60)
    const endMinutes = calendarTimelineTimeMinutes(endTime, startMinutes + 120)
    const durationMinutes = Math.max(15, endMinutes > startMinutes ? endMinutes - startMinutes : 24 * 60 - startMinutes + endMinutes)
    const tasks = ordersCreateWorkspaceTaskRows(draft, selectedObject)
    const nowIso = new Date().toISOString()
    const id = String(draft?.orderId ?? draft?.id ?? ordersNextOrderId()).trim()
    const serviceType = String(draft?.serviceType ?? draft?.serviceName ?? '').trim()
    const title = String(draft?.title ?? '').trim() || `${selectedObject.name} — ${serviceType || 'Sprzątanie'}`
    const order = ordersAssignExtendedWorkFlags({
      ...ordersCreateDraftOrder(dateYmd),
      id,
      createdAt: String(draft?.createdAt ?? '').trim() || nowIso,
      updatedAt: nowIso,
      isDraft: true,
      title,
      description: String(draft?.description ?? draft?.serviceGoal ?? '').trim(),
      workerComment: String(draft?.workerInstructions ?? '').trim(),
      clientId: selectedObject.clientId,
      clientLabel: selectedObject.clientName,
      clientName: selectedObject.clientName,
      customerType: selectedObject.customerType,
      clientType: selectedObject.customerType,
      nip: selectedObject.nip,
      clientNip: selectedObject.nip,
      email: selectedObject.email,
      contact: selectedObject.contact,
      objectId: selectedObject.objectId,
      siteId: selectedObject.siteId,
      siteName: selectedObject.name,
      siteMode: String(draft?.siteMode ?? 'FIXED_CONTRACT_SITE').toUpperCase(),
      addressLabel: selectedObject.address,
      executionAddressLabel: selectedObject.address,
      customAddressLabel: selectedObject.address,
      scheduleMode: scheduleMode === 'RECURRING' ? 'repeat' : 'once',
      type: scheduleMode === 'RECURRING' ? 'cyclic' : 'individual',
      tone: ordersTimelineToneForType(scheduleMode === 'RECURRING' ? 'cyclic' : 'individual'),
      dateYmd,
      nextDate: dateYmd,
      startTime,
      endTime,
      endDateYmd: endMinutes <= startMinutes ? calendarAddDays(dateYmd, 1) : dateYmd,
      validUntil: scheduleMode === 'ONE_OFF' ? dateYmd : '',
      repeatUntil,
      repeatEndDate: repeatUntil,
      recurrenceEndDate: repeatUntil,
      seriesEndDate: repeatUntil,
      recurrenceHorizonConfirmed:
        scheduleMode === 'ONE_OFF' ||
        draft?.recurrenceHorizonConfirmed === true ||
        draft?.recurrenceUntilConfirmed === true,
      repeatPreset: scheduleMode === 'RECURRING' ? 'week' : 'none',
      repeatEvery: Math.max(1, Math.floor(Number(draft?.repeatEvery) || 1)),
      repeatUnit: scheduleMode === 'RECURRING' ? 'week' : 'day',
      repeatWeekdays,
      staffingMode,
      crewSource: String(draft?.crewSource ?? 'DISPATCHED').toUpperCase(),
      dispatchRequired: typeof draft?.dispatchRequired === 'boolean' ? draft.dispatchRequired : false,
      row: assignmentRows[0] ?? ordersServiceBlockBufferRow(),
      assignedRows: assignmentRows,
      workerAssignments,
      requiredPeople,
      requiredWorkers: requiredPeople,
      workerSlots: requiredPeople,
      requiredWorkMinutes: durationMinutes * requiredPeople,
      serviceWorkMinutes: durationMinutes * requiredPeople,
      standardWorkMinutes: durationMinutes * requiredPeople,
      serviceBlocks: [{
        id: 'service-block-1',
        label: String(draft?.serviceBlockLabel ?? 'Realizacja').trim(),
        dateYmd,
        startTime,
        endTime,
        weekdays: repeatWeekdays,
        requiredPeople,
        requiredWorkMinutes: durationMinutes * requiredPeople,
        workerAssignments,
      }],
      serviceType,
      taskName: tasks[0]?.title || '',
      tasks,
      subtasks: tasks,
      activities: tasks,
      objectPlanTasks: tasks,
      zoneTaskPlan: tasks,
      objectZoneTasks: tasks,
      accessInstruction: String(draft?.accessInstruction ?? draft?.accessNotes ?? '').trim(),
      accessInstructionConfirmedNone: draft?.accessInstructionConfirmedNone === true || draft?.accessConfirmedNone === true,
      safetyInstruction: String(draft?.safetyInstruction ?? '').trim(),
      safetyInstructionConfirmedNone: draft?.safetyInstructionConfirmedNone === true || draft?.safetyConfirmed === true,
      packingRequired: typeof draft?.packingRequired === 'boolean'
        ? draft.packingRequired
        : draft?.suppliesConfirmed === true
          ? false
          : null,
      supplies: Array.isArray(draft?.supplies) ? draft.supplies : [],
      paymentMethod: String(draft?.paymentMethod ?? '').toUpperCase(),
      pricingMode: String(draft?.pricingMode ?? '').toUpperCase(),
      price: Math.max(0, Number(String(draft?.amount ?? draft?.price ?? '').replace(',', '.')) || 0),
      contractId: String(draft?.contractId ?? '').trim(),
      paymentDueDateYmd: String(draft?.paymentDueDateYmd ?? draft?.deferredDueDate ?? '').trim(),
      paymentTermDays: Math.max(0, Math.floor(Number(draft?.paymentTermDays) || 0)),
      leaderWorkerId: String(draft?.leaderWorkerId ?? draft?.leaderId ?? '').trim(),
      driverWorkerId: String(draft?.driverWorkerId ?? draft?.driverId ?? '').trim(),
      signatureRequired: typeof draft?.signatureRequired === 'boolean'
        ? draft.signatureRequired
        : selectedObject.customerType === 'B2C',
    }, draft?.allowExtendedWork === true)
    const jobCardDraft = compileOrderDraftToJobCardDraft(order)
    const validation = validateJobCardDraft(jobCardDraft)
    order.jobCardDraft = jobCardDraft
    order.jobCardSchemaVersion = jobCardDraft.schemaVersion
    order.jobCardDraftStatus = 'DRAFT'
    order.jobCardDraftUpdatedAt = nowIso
    order.jobCardValidation = {
      validForPublication: validation.valid,
      errors: validation.errors,
      warnings: validation.warnings,
    }
    return { order, validation }
  }

  async function ordersSaveCreateWorkspaceDraft(draft = {}, options = {}) {
    const result = ordersCreateWorkspaceBuildOrder(draft)
    const orgId = String(appState.session?.activeOrgId ?? appState.session?.orgId ?? '').trim()
    const saved = await saveJobCardDraft(orgId, {
      editorDraft: draft,
      expectedDraftHash: String(options?.expectedDraftHash ?? '').trim(),
      jobCardDraft: result.order.jobCardDraft,
      order: result.order,
      orderId: String(draft?.orderId ?? draft?.id ?? '').trim(),
    })
    const persistedOrderId = String(saved?.orderId ?? saved?.draft?.sourceOrderId ?? '').trim()
    if (!persistedOrderId || !saved?.draft?.draftHash || saved?.materialized !== false) {
      throw new Error('Nie udało się potwierdzić zapisu roboczego zlecenia w bazie.')
    }
    appState.ordersJobCardDraftsLoaded = false
    appState.ordersJobCardDraftsError = ''
    return {
      ...result,
      validation: saved?.draft?.validation ?? result.validation,
      order: {
        ...draft,
        id: persistedOrderId,
        orderId: persistedOrderId,
      },
      materialized: false,
      persistedDraft: saved.draft,
    }
  }

  async function ordersPublishCreateWorkspaceJobCard(orderId = '', acknowledgements = [], expectedDraftHash = '') {
    const id = String(orderId ?? '').trim()
    const orgId = String(appState.session?.activeOrgId ?? appState.session?.orgId ?? '').trim()
    const draftHash = String(expectedDraftHash ?? '').trim()
    if (!draftHash) {
      throw new Error('Brak zaakceptowanej wersji roboczego zlecenia do publikacji.')
    }
    const acceptedAcknowledgements = (Array.isArray(acknowledgements) ? acknowledgements : [])
      .map((item) => typeof item === 'string' ? item : item?.accepted === true ? item?.code : '')
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)
      .map((code) => ({ accepted: true, code }))
    const result = await publishJobCard(orgId, id, {
      acknowledgements: acceptedAcknowledgements,
      expectedDraftHash: draftHash,
    })
    let synchronizationWarning = ''
    if (typeof ordersSyncRemoteTimelineOrders === 'function') {
      try {
        await ordersSyncRemoteTimelineOrders({ render: false })
      } catch (error) {
        console.warn('[portal/orders] publication succeeded, timeline synchronization failed', error)
        synchronizationWarning = 'Karta Zlecenia została opublikowana, ale nie udało się odświeżyć listy. Użyj przycisku Odśwież, aby pobrać aktualne dane.'
      }
    }
    appState.ordersJobCardDrafts = (Array.isArray(appState.ordersJobCardDrafts) ? appState.ordersJobCardDrafts : [])
      .filter((draft) => String(draft?.orderId ?? draft?.sourceOrderId ?? '').trim() !== id)
    appState.ordersJobCardDraftsLoaded = false
    appState.ordersJobCardDraftsError = ''
    return synchronizationWarning
      ? {
          ...(result && typeof result === 'object' ? result : {}),
          synchronizationWarning,
        }
      : result
  }

  return {
    bindList: bindOrdersViewFunctions,
    bindMap: bindOrdersMapViewFunctions,
    renderList: renderOrdersView,
    renderMap: renderOrdersMapView,
    loadGoogleMaps: ordersLoadGoogleMaps,
    openEditor: ordersOpenEditor,
    openEditorFromCalendar: ordersOpenEditorFromCalendar,
    openRecurringOccurrenceEditorFromCalendar: ordersOpenRecurringOccurrenceEditorFromCalendar,
    showList: ordersShowList,
    cleanup: () => {
      ordersCloseTimePicker()
      ordersCloseWorkerPicker()
      ordersMapClearMarkers()
      ordersMapInstance = null
      ordersMapInfoWindow = null
      ordersMapRenderSeq += 1
    },
    ordersDateTimeFromTimeline,
    ordersTimelineClientLabel,
    ordersTimelineAddressLabel,
    ordersFindTimelineOrder,
    ordersNormalizeDateField,
    ordersNormalizeTimeField,
    ordersTimelineOrderCanBeDeleted,
    ordersConfirmTimelineOrderDelete,
    ordersExtendedWorkAllowed,
    ordersAssignExtendedWorkFlags,
    ordersNormalizeOrderRows,
    calendarTimelineRowAllowsOverlap,
    ordersWorkerAssignmentsFromRows,
    ordersOrderHasInactiveOnlyWorkerAssignments,
    ordersWorkerSelectionLabel,
    ordersFormatWorkMinutes,
    ordersWorkAllocationsForSubjects,
    ordersObjectPlanZoneKey,
    ordersObjectPlanCalendarMonth,
    ordersObjectPlanSelectedZoneKeys,
    ordersSelectCreatedClientInEditor,
    ordersTimelineToneForType,
    ordersNextOrderId,
    ordersDefaultEndTime,
    openAddEditor: ordersOpenAddEditor,
    ordersWarmLocationSources,
    ordersScheduleModeForOrder,
    ordersApplyWeeklyPatternRuleToOccurrence,
    ordersWeeklyPatternSources,
    ordersNormalizeWeeklyPatternRule,
    ordersStoreWeeklyPatternRules,
    ordersCreateWorkspaceOptions,
    ordersSaveCreateWorkspaceDraft,
    ordersPublishCreateWorkspaceJobCard,
  }
}
