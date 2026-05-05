import { ensureSessionContext, login, logout, getSession, requireAuth } from '../auth/authService'
import { getDataSourceLabel } from '../firebase/firebaseClient'
import { createClient, getClients, updateClient } from '../services/clientService'
import {
  createIndividualOrder,
  deleteIndividualOrder,
  getIndividualOrders,
  updateIndividualOrder,
} from '../services/individualOrderService'
import { createWorkerUser, getWorkers, updateWorker } from '../services/workerService'
import { createZone, deleteZone, getZones, updateZone } from '../services/zoneService'
import {
  createEvent,
  createWorkday,
  deleteEvent,
  getTodayActiveWorkers,
  getWorkdays,
  getWorkerTime,
  updateEvent,
  updateWorkday,
} from '../services/workdayService'
import { getScheduleBoard } from '../services/scheduleService'
import {
  createBackup,
  deleteBackup,
  ensureBackupAutomation,
  getBackupDownload,
  inspectBackupFile,
  listBackups,
  restoreBackupById,
  restoreBackupFromFile,
  restoreLatestPreRestore,
} from '../services/backupService'
import {
  STYLE_FALLBACK_ID,
  clearUserStyle,
  getEffectiveStyle,
  listAvailableStyles,
  setOrgDefaultStyle,
  setUserStyle,
} from '../services/styleService'
import { deletePortalTasks, fetchPortalTasks, upsertPortalTasks } from '../services/portalTaskService'
import { portalLayoutTemplate } from './layoutTemplate'
import { createRouter } from './router'
import { viewTemplates } from './viewTemplates'

const appState = {
  session: null,
  clients: [],
  clientsLoaded: false,
  clientsPage: 1,
  clientsPageSize: 50,
  clientsTotal: 0,
  clientsTotalPages: 1,
  clientModalMode: 'add',
  clientModalClientId: '',
  zones: [],
  zonesLoaded: false,
  zonesPage: 1,
  zonesPageSize: 50,
  zonesTotal: 0,
  zonesTotalPages: 1,
  workers: [],
  workersLoaded: false,
  workerTimeRows: [],
  workerTimeViewRows: [],
  workerTimeSelectedKeys: new Set(),
  workerTimeCurrentPageKeys: [],
  workersPage: 1,
  workersPageSize: 50,
  workersTotal: 0,
  workersTotalPages: 1,
  eventsPage: 1,
  eventsPageSize: 50,
  eventsTotal: 0,
  eventsTotalPages: 1,
  eventsFilters: null,
  eventsWorkerLoginFilter: '',
  eventsWorkerLoginFilterText: '',
  eventsSelectedKeys: new Set(),
  eventRows: [],
  ordersSearch: '',
  ordersShowCyclic: false,
  ordersEditingId: '',
  ordersEditorMode: 'edit',
  ordersEditorTab: 'basic',
  ordersMapDateFrom: '',
  ordersMapDateTo: '',
  ordersMapStatus: 'new',
  ordersMapType: '',
  ordersMapWorker: '',
  ordersMapWorkerOnly: true,
  ordersMapSearch: '',
  calendarTasks: [],
  calendarRemoteTasksLoaded: false,
  calendarRemoteTasksLoading: false,
  calendarViewMode: 'week',
  calendarCursorDay: '',
  calendarEditorTaskId: '',
  calendarEditorTab: 'comments',
  calendarDragTaskId: '',
  calendarToneFilters: ['blue', 'green', 'amber', 'red', 'message'],
  calendarShowCompletedTasks: false,
  calendarShowReadTasks: false,
  calendarTimelineHourTimer: null,
  calendarTimelineSlideDirection: 0,
  calendarTimelineResetScroll: false,
  calendarTimelineShowCompleted: true,
  calendarTimelineTypeFilters: ['individual', 'cyclic', 'renovation', 'windows', 'other'],
  calendarTimelineDemoOrders: [],
  calendarTimelineDragOrderId: '',
  calendarTimelineDragSourceRow: null,
  calendarTimelineDragTargetRow: null,
  calendarTimelineDragTargetSlot: null,
  calendarTimelineDropHandled: false,
  calendarTimelineDragResources: [],
  calendarTimelineDragConflictKey: '',
  calendarTimelineDragConflictValue: false,
  calendarTimelineWorkerStateLoading: false,
  calendarTimelineWorkerStateFetchedAt: 0,
  calendarTimelineWorkerStateDayKey: '',
  calendarTimelineWorkerStateRangeStart: '',
  calendarTimelineWorkerStateRangeEnd: '',
  calendarTimelineWorkerStateRows: [],
  calendarTimelineWorkerStateSourceRows: [],
  calendarTimelineCurrentWorkerStatusDayKey: '',
  calendarTimelineCurrentWorkerStatusRows: [],
  calendarTimelinePopupEventRows: [],
  calendarTimelineStatusAlerts: [],
  calendarTimelineStatusAlertShownKeys: new Set(),
  kanbanColumns: [],
  kanbanColumnEditorMode: 'add',
  kanbanColumnEditorId: '',
  kanbanColumnDeleteConfirm: false,
  kanbanSearch: '',
  kanbanSection: 'home',
  kanbanHomeTaskTab: 'upcoming',
  kanbanInboxTab: 'activity',
  kanbanProjectLimit: 9,
  kanbanDragColumnId: '',
  kanbanDragTaskId: '',
  kanbanPendingStatus: '',
  kanbanDoneTaskId: '',
  kanbanDataLoading: false,
  kanbanDataLoadingText: '',
  workerDetailPage: 1,
  workerDetailPageSize: 50,
  workerDetailRows: [],
  workerDetailSourceRows: [],
  workerDetailViewRows: [],
  workerDetailSelectedKeys: new Set(),
  workerDetailCurrentPageKeys: [],
  workerDetailDayEditorItem: null,
  workerDetailAckMap: {},
  workerDetailColumnWidthsLoaded: false,
  workerDetailColumnWidths: [],
  workerProfilePage: 1,
  workerProfilePageSize: 50,
  workerProfileTotal: 0,
  workerProfileTotalPages: 1,
  selectedWorkerLogin: '',
  selectedWorkerName: '',
  zoneModalMode: 'add',
  zoneModalZoneId: '',
  eventEditorMode: 'add',
  eventEditorItem: null,
  eventEditorWorkerOptions: [],
  eventEditorClientOptions: [],
  eventEditorZoneOptions: [],
  workerProfileRows: [],
  workerProfileViewRows: [],
  workerProfileModalMode: 'view',
  workerProfileCurrent: null,
  individualOrdersRows: [],
  individualOrdersPage: 1,
  individualOrdersPageSize: 200,
  individualOrdersTotal: 0,
  individualOrdersTotalPages: 1,
  individualOrderModalMode: 'add',
  individualOrderCurrentId: '',
  individualOrderQrCurrent: '',
  clientProfileRows: [],
  clientProfileCurrent: null,
  clientProfileEditMode: false,
  reportLastCsv: '',
  reportHistoryTab: 'objects',
  reportHistoryRows: [],
  reportHistoryExpanded: {},
  reportHistoryEditableMap: {},
  reportHistoryClosingDayKey: '',
  reportHistoryClientOptions: [],
  reportHistoryWorkerOptions: [],
  reportHistoryZoneOptions: [],
  dashboardMetricDetails: {},
  dashboardMetricValues: {},
  dashboardTodayRows: [],
  dashboardNewComments: [],
  dashboardScheduleDays: [],
  dashboardScheduleSelectedDay: '',
  dashboardScheduleFetchedAt: '',
  dashboardScheduleLoading: false,
  dashboardScheduleError: '',
  dashboardScheduleStale: false,
  dashboardScheduleSourceRows: [],
  dashboardBackgroundDataLoaded: false,
  dashboardScheduleAlertSnoozeUntil: 0,
  dashboardScheduleAlertMuted: false,
  dashboardScheduleAlertLastKey: '',
  dashboardScheduleLateShownKeys: new Set(),
  dashboardScheduleLatePendingKeys: [],
  dashboardLoadingCount: 0,
  settingsActiveTab: 'styles',
  settingsEffectiveStyleId: STYLE_FALLBACK_ID,
  settingsEffectiveStyleSource: 'fallback',
  settingsOrgStyleId: '',
  settingsUserStyleId: '',
  settingsBackups: [],
  settingsImportInspection: null,
  settingsAutomationDayKey: '',
  currentRoute: '',
}
let portalNoticeTimer = null
let dashboardRefreshTimer = null
let dashboardBackgroundRefreshPromise = null
let dashboardReferencePreloadPromise = null
let dashboardScheduleRefreshPromise = null
let dashboardMetricPopoverHideTimer = null
let dashboardScheduleLimitRaf = 0
let dashboardScheduleLimitTimerA = 0
let dashboardScheduleLimitTimerB = 0
let calendarRemoteSaveTimer = 0
let calendarTimelineWorkerStateRefreshTimer = null
let calendarTimelineBarClickTimer = 0
let calendarTimelineEventsPopupAnchor = null
let calendarTimelineEventsPopupScrollParent = null
let calendarTimelineEventsPopupRaf = 0
let reportsViewInitPromise = null
let reportGeoPreviewHideTimer = null
let reportHistoryScopedFilter = null
const reportGeoModalState = {
  lat: '',
  lon: '',
  zoom: 18,
}
const DASHBOARD_REFRESH_INTERVAL_MS = 15 * 60 * 1000
const CALENDAR_TIMELINE_STATUS_REFRESH_MS = DASHBOARD_REFRESH_INTERVAL_MS
const DASHBOARD_SCHEDULE_SOON_WINDOW_MINUTES = 60
const DASHBOARD_SCHEDULE_VISIBLE_WORKERS = 10
const DASHBOARD_LONG_CLEAN_SECONDS = 90 * 60
const DASHBOARD_NEW_COMMENTS_LIMIT = 5
const DASHBOARD_DUE_TASKS_PREVIEW_LIMIT = 10
const DASHBOARD_LOADING_STAGES = ['overview', 'tasks', 'active', 'schedule']
const DASHBOARD_POST_LOAD_DELAY_MS = 900
const DASHBOARD_LOCAL_CACHE_VERSION = 1
const DASHBOARD_LOCAL_CACHE_TTL_MS = 8 * 60 * 60 * 1000
const DASHBOARD_LOCAL_CACHE_PREFIX = 'portal.dashboard.snapshot'
const DASHBOARD_COMMENT_READ_STORAGE_PREFIX = 'portal.dashboardComments.read'
const DASHBOARD_COMMENT_SYNC_STORAGE_PREFIX = 'portal.dashboardComments.sync'
const DASHBOARD_COMMENT_SYNC_LOOKBACK_DAYS = 3
const REPORT_HISTORY_SYSTEM_CLIENT_LABEL = 'Best Clean biuro'
const REPORT_HISTORY_SYSTEM_ZONE_LABEL = 'SYSTEM'
const BACKUP_TYPE_LABELS = {
  full: 'Pelna kopia',
  workers: 'Pracownicy',
  objects: 'Obiekty',
}
const BACKUP_SOURCE_LABELS = {
  manual: 'Reczny',
  'auto-daily': 'Auto dzienny',
  'auto-monthly': 'Auto miesieczny',
  'pre-restore': 'Pre-restore',
  'imported-file': 'Import ZIP',
}
const BACKUP_INTEGRITY_LABELS = {
  ok: 'OK',
  warning: 'Ostrzezenie',
  error: 'Blad',
  unknown: 'Nieznana',
}
const SETTINGS_TAB_STYLES = 'styles'
const SETTINGS_TAB_BACKUP = 'backup'
const SETTINGS_TAB_STORAGE_KEY = 'portal.settings.activeTab'
const STYLE_SOURCE_LABELS = {
  user: 'nadpisanie uzytkownika',
  org: 'domyslny styl organizacji',
  fallback: 'domyslny fallback',
}
const SIDEBAR_COLLAPSE_STORAGE_KEY = 'portal.sidebarCollapsed'
const WORKER_DETAIL_COLUMN_WIDTHS_STORAGE_KEY = 'portal.workerDetailColumnWidths'
const WORKER_DETAIL_COLUMN_DEFAULT_WIDTHS = [42, 88, 168, 138, 108, 108, 112, 138, 102, 126, 90]
const WORKER_DETAIL_COLUMN_MIN_WIDTHS = [34, 76, 120, 108, 92, 92, 96, 116, 88, 104, 72]
const WORKER_DETAIL_COLUMN_MAX_WIDTH = 520
const WORKER_DETAIL_RESIZABLE_COLUMN_INDEXES = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
const GRID_COLUMN_RESIZE_CLASS = 'grid-col-resize-active'
const GRID_COLUMN_RESIZE_ATTR = 'data-grid-col-resizer'
const GRID_COLUMN_MAX_WIDTH = 780
const CALENDAR_STORAGE_PREFIX = 'portal.calendar.tasks'
const KANBAN_COLUMNS_STORAGE_PREFIX = 'portal.kanban.columns'
const CALENDAR_HOUR_HEIGHT_PX = 56
const CALENDAR_TIMED_TASK_GAP_PX = 4
const CALENDAR_MIN_TIMED_TASK_HEIGHT_PX = 28
const CALENDAR_TIMED_TASK_OVERLAP_OFFSET_PX = 14
const CALENDAR_TIMELINE_SLOT_MINUTES = 15
const CALENDAR_TIMELINE_SLOTS_PER_HOUR = 60 / CALENDAR_TIMELINE_SLOT_MINUTES
const CALENDAR_TONE_OPTIONS = [
  { value: 'blue', label: 'Standard', css: 'blue' },
  { value: 'green', label: 'Gotowe / kontrola', css: 'green' },
  { value: 'amber', label: 'Pilne', css: 'amber' },
  { value: 'red', label: 'Problem', css: 'red' },
  { value: 'message', label: 'Wiadomość pracownika', css: 'message' },
]
const KANBAN_STANDARD_NEW_TASK_COLUMN = { id: 'newTask', label: 'Nowe zadanie', color: 'red' }
const KANBAN_COLUMNS = [
  KANBAN_STANDARD_NEW_TASK_COLUMN,
  { id: 'inProgress', label: 'W trakcie', color: 'blue' },
  { id: 'inReview', label: 'Do sprawdzenia', color: 'amber' },
  { id: 'done', label: 'Gotowe', color: 'green' },
]
const KANBAN_NEW_PERSON_TASK_COLUMN_LABELS = ['nowe zadania', 'nowe zadanie']
const KANBAN_COLUMN_COLORS = [
  { value: 'blue', label: 'Niebieski', accent: '#2563eb', soft: '#eef5ff', border: '#c7dcff' },
  { value: 'amber', label: 'Pomarańczowy', accent: '#f59e0b', soft: '#fff7e6', border: '#fde5ad' },
  { value: 'green', label: 'Zielony', accent: '#16a34a', soft: '#edfdf4', border: '#bbf7d0' },
  { value: 'red', label: 'Czerwony', accent: '#e11d48', soft: '#fff0f3', border: '#fecdd3' },
  { value: 'violet', label: 'Fioletowy', accent: '#7c3aed', soft: '#f3efff', border: '#ddd6fe' },
  { value: 'cyan', label: 'Turkusowy', accent: '#0891b2', soft: '#ecfeff', border: '#a5f3fc' },
  { value: 'slate', label: 'Grafitowy', accent: '#475569', soft: '#f1f5f9', border: '#cbd5e1' },
]
const KANBAN_COLUMN_SCOPES = [
  { value: 'global', label: 'Ogólna', targetLabel: '', optionKind: '' },
  { value: 'user', label: 'Użytkownik', targetLabel: 'Użytkownik', optionKind: 'workers' },
  { value: 'person', label: 'Inny projekt', targetLabel: 'Osoba', optionKind: 'workers' },
  { value: 'object', label: 'Obiekt', targetLabel: 'Obiekt', optionKind: 'zones' },
]
const FLOATING_TABLE_SCROLL_SELECTOR =
  '#portalRoot :is(.events-table, .workers-table, .zones-table, .io-table, .rep-tablewrap, .chk-tablewrap, .backup-table-wrap)'
const FLOATING_TABLE_SCROLL_CLOSEST_SELECTOR =
  '.events-table, .workers-table, .zones-table, .io-table, .rep-tablewrap, .chk-tablewrap, .backup-table-wrap'

let workerDetailColumnDragState = null
const WORKER_DETAIL_COLUMN_RESIZE_CLASS = 'wtd-col-resize-active'

function parseGridPixelWidths(rawValue) {
  const raw = String(rawValue ?? '')
  const matches = raw.match(/-?\d+(?:\.\d+)?px/g)
  if (!matches?.length) {
    return []
  }

  return matches
    .map((item) => Math.round(Number.parseFloat(item)))
    .filter((value) => Number.isFinite(value) && value > 0)
}

function clampGridWidth(value, min, max, fallback) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return fallback
  }
  if (numeric < min) {
    return min
  }
  if (numeric > max) {
    return max
  }
  return Math.round(numeric)
}

function readStoredGridColumnWidths(storageKey) {
  const key = String(storageKey ?? '').trim()
  if (!key) {
    return []
  }

  try {
    const raw = window.sessionStorage.getItem(key)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizeGridColumnWidths(rawWidths, defaults, options = {}) {
  const source = Array.isArray(rawWidths) ? rawWidths : []
  const fallback = Array.isArray(defaults) ? defaults : []
  const count = Number(options.columnCount ?? fallback.length ?? source.length) || 0
  const minColumnWidth = Number(options.minColumnWidth ?? 64)
  const minWidths = Array.isArray(options.minWidths) ? options.minWidths : []
  const maxWidth = Number(options.maxWidth ?? GRID_COLUMN_MAX_WIDTH)

  return Array.from({ length: count }, (_, colIndex) => {
    const fallbackWidth = clampGridWidth(fallback[colIndex], 40, maxWidth, 120)
    const minWidthValue = Number(minWidths[colIndex])
    const minWidth =
      Number.isFinite(minWidthValue) && minWidthValue > 20 ? minWidthValue : Number.isFinite(minColumnWidth) ? minColumnWidth : 64
    return clampGridWidth(source[colIndex], minWidth, maxWidth, fallbackWidth)
  })
}

function buildGridTemplateFromWidths(widths = []) {
  return widths
    .map((width) => `${Math.max(24, Math.round(Number(width) || 0))}px`)
    .join(' ')
}

function inferGridDefaultWidths(tableNode, headNode, cssVarName, expectedColumns, explicitDefaults) {
  const expected = Number(expectedColumns) || 0
  if (expected <= 0) {
    return []
  }

  const defaults = Array.isArray(explicitDefaults) ? explicitDefaults.filter((value) => Number.isFinite(Number(value))) : []
  if (defaults.length === expected) {
    return defaults.map((value) => Math.round(Number(value)))
  }

  const cssVar = String(cssVarName ?? '').trim()
  if (cssVar) {
    const inlineVarWidths = parseGridPixelWidths(tableNode?.style?.getPropertyValue(cssVar))
    if (inlineVarWidths.length === expected) {
      return inlineVarWidths
    }

    const computedVarWidths = parseGridPixelWidths(window.getComputedStyle(tableNode).getPropertyValue(cssVar))
    if (computedVarWidths.length === expected) {
      return computedVarWidths
    }
  }

  const computedHeadWidths = parseGridPixelWidths(window.getComputedStyle(headNode).gridTemplateColumns)
  if (computedHeadWidths.length === expected) {
    return computedHeadWidths
  }

  return Array.from({ length: expected }, (_, index) => {
    const fromDefaults = Number(defaults[index])
    return Number.isFinite(fromDefaults) && fromDefaults > 0 ? Math.round(fromDefaults) : 120
  })
}

function setupResizableGridTable(options = {}) {
  const tableSelector = String(options.tableSelector ?? '').trim()
  const headSelector = String(options.headSelector ?? '').trim()
  const cssVarName = String(options.cssVarName ?? '').trim()
  const storageKey = String(options.storageKey ?? '').trim()

  if (!tableSelector || !headSelector || !cssVarName) {
    return () => {}
  }

  const tableNode = document.querySelector(tableSelector)
  const headNode = document.querySelector(headSelector)
  if (!(tableNode instanceof HTMLElement) || !(headNode instanceof HTMLElement)) {
    return () => {}
  }

  const headCells = [...headNode.children].filter((node) => node instanceof HTMLElement)
  const columnCount = headCells.length
  if (!columnCount) {
    return () => {}
  }

  const nonResizable = new Set(
    (Array.isArray(options.nonResizableIndexes) ? options.nonResizableIndexes : [])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0),
  )
  const maxWidth = Number(options.maxWidth ?? GRID_COLUMN_MAX_WIDTH)
  const autoFitToViewport = Boolean(options.autoFitToViewport)
  const enforceFullWidth = Boolean(options.enforceFullWidth)
  const defaultWidths = inferGridDefaultWidths(
    tableNode,
    headNode,
    cssVarName,
    columnCount,
    Array.isArray(options.defaultWidths) ? options.defaultWidths : [],
  )
  const storedWidths = readStoredGridColumnWidths(storageKey)
  let userCustomizedWidths = storedWidths.length > 0
  const widths = normalizeGridColumnWidths(storedWidths.length ? storedWidths : defaultWidths, defaultWidths, {
    columnCount,
    minColumnWidth: options.minColumnWidth,
    minWidths: options.minWidths,
    maxWidth,
  })
  const minWidths = normalizeGridColumnWidths([], defaultWidths, {
    columnCount,
    minColumnWidth: options.minColumnWidth,
    minWidths: options.minWidths,
    maxWidth,
  })

  const persistWidths = () => {
    if (!storageKey) {
      return
    }
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(widths))
    } catch {
      // Ignore storage write errors.
    }
  }

  const applyWidths = () => {
    tableNode.style.setProperty(cssVarName, buildGridTemplateFromWidths(widths))
    tableNode.classList.add('resizable-grid-table')
    headNode.classList.add('grid-resizable-head')
  }

  const fitWidthsToViewport = ({ persist = false } = {}) => {
    if (!autoFitToViewport) {
      return false
    }

    const tableWidth = Math.floor(tableNode.getBoundingClientRect().width || tableNode.clientWidth || 0)
    if (tableWidth <= 0) {
      return false
    }

    const computedHead = window.getComputedStyle(headNode)
    const headWidth = Math.floor(headNode.getBoundingClientRect().width || headNode.clientWidth || tableWidth)
    const paddingLeftPx = Math.max(0, Number.parseFloat(computedHead.paddingLeft || '0') || 0)
    const paddingRightPx = Math.max(0, Number.parseFloat(computedHead.paddingRight || '0') || 0)
    const contentWidth = Math.max(0, Math.min(tableWidth, headWidth) - paddingLeftPx - paddingRightPx)
    const columnGapPx = Math.max(0, Number.parseFloat(computedHead.columnGap || '0') || 0)
    const budget = Math.max(0, Math.floor(contentWidth - columnGapPx * Math.max(0, columnCount - 1)))
    if (budget <= 0) {
      return false
    }

    const indexes = Array.from({ length: columnCount }, (_, colIndex) => colIndex).filter(
      (colIndex) => !nonResizable.has(colIndex),
    )
    if (!indexes.length) {
      return false
    }

    const fixedSum = widths
      .map((value, colIndex) => (nonResizable.has(colIndex) ? Math.max(0, Number(value) || 0) : 0))
      .reduce((sum, value) => sum + value, 0)
    const targetAdjustableBudget = Math.max(0, budget - fixedSum)
    const currentAdjustable = indexes
      .map((colIndex) => Math.max(0, Number(widths[colIndex]) || 0))
      .reduce((sum, value) => sum + value, 0)
    if (currentAdjustable <= 0) {
      return false
    }

    const scaled = [...widths]
    const scale = targetAdjustableBudget / currentAdjustable
    indexes.forEach((colIndex) => {
      const rawWidth = Number(widths[colIndex]) || 0
      const minWidth = Math.max(24, Math.round(Number(minWidths[colIndex]) || 24))
      scaled[colIndex] = clampGridWidth(Math.round(rawWidth * scale), minWidth, maxWidth, rawWidth)
    })

    const sumScaledAdjustable = indexes.reduce((sum, colIndex) => sum + Math.max(0, Number(scaled[colIndex]) || 0), 0)
    let diff = targetAdjustableBudget - sumScaledAdjustable
    let guard = 0
    while (diff !== 0 && guard < 20000) {
      let changedInPass = false
      for (const colIndex of indexes) {
        if (diff === 0) {
          break
        }

        const minWidth = Math.max(24, Math.round(Number(minWidths[colIndex]) || 24))
        const currentWidth = Math.round(Number(scaled[colIndex]) || 0)
        if (diff > 0) {
          if (currentWidth >= maxWidth) {
            continue
          }
          scaled[colIndex] = currentWidth + 1
          diff -= 1
          changedInPass = true
          continue
        }

        if (currentWidth <= minWidth) {
          continue
        }
        scaled[colIndex] = currentWidth - 1
        diff += 1
        changedInPass = true
      }
      if (!changedInPass) {
        break
      }
      guard += 1
    }

    const changed = indexes.some((colIndex) => Math.round(Number(widths[colIndex]) || 0) !== Math.round(Number(scaled[colIndex]) || 0))
    if (!changed) {
      return false
    }

    indexes.forEach((colIndex) => {
      widths[colIndex] = Math.round(Number(scaled[colIndex]) || 0)
    })

    if (changed) {
      applyWidths()
      if (persist) {
        persistWidths()
      }
    }

    return changed
  }

  applyWidths()
  if (enforceFullWidth || !userCustomizedWidths) {
    fitWidthsToViewport({ persist: false })
  }

  headCells.forEach((cell, colIndex) => {
    cell.classList.add('grid-resizable-head-cell')
    if (colIndex >= columnCount - 1 || nonResizable.has(colIndex)) {
      return
    }
    if (cell.querySelector(`[${GRID_COLUMN_RESIZE_ATTR}]`)) {
      return
    }

    const handle = document.createElement('span')
    handle.className = 'grid-col-resizer'
    handle.setAttribute(GRID_COLUMN_RESIZE_ATTR, String(colIndex))
    handle.setAttribute('role', 'separator')
    handle.setAttribute('aria-orientation', 'vertical')
    handle.setAttribute('aria-label', 'Zmień szerokość kolumny')
    cell.appendChild(handle)
  })

  let dragState = null
  const stopDrag = ({ persist = true } = {}) => {
    if (!dragState) {
      return
    }

    window.removeEventListener('mousemove', dragState.onMove)
    window.removeEventListener('mouseup', dragState.onUp)
    document.body.classList.remove(GRID_COLUMN_RESIZE_CLASS)
    dragState = null
    if (persist) {
      persistWidths()
    }
  }

  const startDrag = (colIndex, startClientX) => {
    stopDrag({ persist: false })

    const index = Number(colIndex)
    if (!Number.isInteger(index) || index < 0 || index >= widths.length || nonResizable.has(index)) {
      return
    }

    const startWidth = Number(widths[index]) || defaultWidths[index] || 120
    const minWidth = normalizeGridColumnWidths([], defaultWidths, {
      columnCount,
      minColumnWidth: options.minColumnWidth,
      minWidths: options.minWidths,
      maxWidth,
    })[index]

    const onMove = (event) => {
      const delta = Number(event.clientX) - Number(startClientX)
      const nextWidth = clampGridWidth(startWidth + delta, minWidth, maxWidth, startWidth)
      if (widths[index] === nextWidth) {
        return
      }
      widths[index] = nextWidth
      applyWidths()
    }

    const onUp = () => {
      userCustomizedWidths = true
      if (enforceFullWidth) {
        fitWidthsToViewport({ persist: false })
      }
      stopDrag({ persist: true })
    }

    dragState = { onMove, onUp }
    document.body.classList.add(GRID_COLUMN_RESIZE_CLASS)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const onMouseDown = (event) => {
    const handle = event.target?.closest?.(`[${GRID_COLUMN_RESIZE_ATTR}]`)
    if (!(handle instanceof HTMLElement)) {
      return
    }

    const colIndex = Number(handle.getAttribute(GRID_COLUMN_RESIZE_ATTR))
    if (!Number.isInteger(colIndex)) {
      return
    }

    event.preventDefault()
    startDrag(colIndex, event.clientX)
  }

  tableNode.addEventListener('mousedown', onMouseDown)
  const onWindowResize = () => {
    if (enforceFullWidth || !userCustomizedWidths) {
      fitWidthsToViewport({ persist: false })
    }
  }
  window.addEventListener('resize', onWindowResize)

  return () => {
    tableNode.removeEventListener('mousedown', onMouseDown)
    window.removeEventListener('resize', onWindowResize)
    stopDrag({ persist: true })
  }
}

function setupFloatingTableScrollbar() {
  const scroller = document.createElement('div')
  scroller.id = 'portalFloatingXScroll'
  scroller.className = 'portal-floating-x-scroll'
  scroller.setAttribute('aria-hidden', 'true')

  const spacer = document.createElement('div')
  spacer.className = 'portal-floating-x-scroll-spacer'
  scroller.appendChild(spacer)
  document.body.appendChild(scroller)

  let activeTable = null
  let updateRaf = 0
  let syncingFromBar = false
  let syncingFromTable = false

  const tableIsUsable = (node) => {
    if (!(node instanceof HTMLElement)) {
      return false
    }
    const root = document.getElementById('portalRoot')
    if (!root?.contains(node)) {
      return false
    }
    const rect = node.getBoundingClientRect()
    return (
      node.offsetParent !== null &&
      node.scrollWidth > node.clientWidth + 2 &&
      rect.width > 80 &&
      rect.bottom > 0 &&
      rect.top < window.innerHeight
    )
  }

  const visibleScore = (node) => {
    const rect = node.getBoundingClientRect()
    const visibleTop = Math.max(0, rect.top)
    const visibleBottom = Math.min(window.innerHeight, rect.bottom)
    const visibleHeight = Math.max(0, visibleBottom - visibleTop)
    return visibleHeight * Math.max(0, Math.min(window.innerWidth, rect.right) - Math.max(0, rect.left))
  }

  const findBestTable = () => {
    if (tableIsUsable(activeTable)) {
      return activeTable
    }

    return [...document.querySelectorAll(FLOATING_TABLE_SCROLL_SELECTOR)]
      .filter((node) => tableIsUsable(node))
      .sort((left, right) => visibleScore(right) - visibleScore(left))[0] ?? null
  }

  const hide = () => {
    scroller.classList.remove('is-visible')
    activeTable = null
  }

  const update = () => {
    updateRaf = 0
    const table = findBestTable()
    if (!(table instanceof HTMLElement)) {
      hide()
      return
    }

    activeTable = table
    const rect = table.getBoundingClientRect()
    const margin = 10
    const left = Math.max(margin, Math.floor(rect.left))
    const right = Math.min(window.innerWidth - margin, Math.ceil(rect.right))
    const width = Math.max(0, right - left)
    if (width < 96) {
      hide()
      return
    }

    spacer.style.width = `${Math.max(table.scrollWidth, table.clientWidth)}px`
    scroller.style.left = `${left}px`
    scroller.style.width = `${width}px`
    scroller.classList.add('is-visible')

    if (!syncingFromBar) {
      syncingFromTable = true
      scroller.scrollLeft = table.scrollLeft
      syncingFromTable = false
    }
  }

  const scheduleUpdate = () => {
    if (updateRaf) {
      return
    }
    updateRaf = window.requestAnimationFrame(update)
  }

  const setActiveFromEvent = (event) => {
    const table = event.target?.closest?.(FLOATING_TABLE_SCROLL_CLOSEST_SELECTOR)
    if (tableIsUsable(table)) {
      activeTable = table
      scheduleUpdate()
    }
  }

  const handleDocumentScroll = (event) => {
    const table = event.target?.closest?.(FLOATING_TABLE_SCROLL_CLOSEST_SELECTOR)
    if (tableIsUsable(table)) {
      activeTable = table
      if (!syncingFromBar) {
        syncingFromTable = true
        scroller.scrollLeft = table.scrollLeft
        syncingFromTable = false
      }
    }
    scheduleUpdate()
  }

  const handleBarScroll = () => {
    if (!(activeTable instanceof HTMLElement) || syncingFromTable) {
      return
    }
    syncingFromBar = true
    activeTable.scrollLeft = scroller.scrollLeft
    syncingFromBar = false
  }

  const handleResize = () => {
    scheduleUpdate()
  }

  const observer = new MutationObserver(() => {
    scheduleUpdate()
  })
  const root = document.getElementById('portalRoot')
  if (root) {
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] })
  }

  document.addEventListener('pointerover', setActiveFromEvent, true)
  document.addEventListener('focusin', setActiveFromEvent, true)
  document.addEventListener('mousedown', setActiveFromEvent, true)
  document.addEventListener('touchstart', setActiveFromEvent, true)
  document.addEventListener('scroll', handleDocumentScroll, true)
  window.addEventListener('resize', handleResize)
  scroller.addEventListener('scroll', handleBarScroll)

  scheduleUpdate()

  return () => {
    if (updateRaf) {
      window.cancelAnimationFrame(updateRaf)
    }
    observer.disconnect()
    document.removeEventListener('pointerover', setActiveFromEvent, true)
    document.removeEventListener('focusin', setActiveFromEvent, true)
    document.removeEventListener('mousedown', setActiveFromEvent, true)
    document.removeEventListener('touchstart', setActiveFromEvent, true)
    document.removeEventListener('scroll', handleDocumentScroll, true)
    window.removeEventListener('resize', handleResize)
    scroller.removeEventListener('scroll', handleBarScroll)
    scroller.remove()
  }
}

function workerDetailDefaultColumnWidths() {
  return [...WORKER_DETAIL_COLUMN_DEFAULT_WIDTHS]
}

function workerDetailColumnMinWidth(colIndex) {
  const value = Number(WORKER_DETAIL_COLUMN_MIN_WIDTHS[colIndex])
  return Number.isFinite(value) ? value : 72
}

function readStoredSidebarCollapsed() {
  try {
    const raw = window.sessionStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY)
    if (raw === '1') {
      return true
    }
    if (raw === '0') {
      return false
    }
  } catch {
    // Ignore storage read errors in locked/private contexts.
  }
  return null
}

function sidebarIsTabletViewport() {
  const width = Number(window.innerWidth || document.documentElement?.clientWidth || 0)
  return width >= 761 && width <= 1180
}

function applySidebarRouteTitles() {
  document.querySelectorAll('#portalSidebar [data-route], #portalSidebar [data-toggle]').forEach((button) => {
    const label = String(button.querySelector('.mi-label')?.textContent ?? '').trim()
    if (!label) {
      return
    }
    button.setAttribute('title', label)
  })
}

function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  const root = document.getElementById('portalRoot')
  if (!root) {
    return
  }

  const nextCollapsed = Boolean(collapsed)
  root.classList.toggle('sidebar-collapsed', nextCollapsed)
  root.dataset.sidebarCollapsed = nextCollapsed ? '1' : '0'

  const toggleButton = document.getElementById('sidebarToggleBtn')
  if (toggleButton instanceof HTMLButtonElement) {
    const label = nextCollapsed ? 'Rozwin menu' : 'Zwin menu'
    toggleButton.setAttribute('aria-label', label)
    toggleButton.setAttribute('title', label)
    toggleButton.setAttribute('aria-pressed', nextCollapsed ? 'true' : 'false')
  }

  if (nextCollapsed) {
    document.querySelectorAll('#portalSidebar .submenu.open').forEach((submenu) => {
      submenu.classList.remove('open')
    })
  }

  if (!persist) {
    return
  }

  try {
    window.sessionStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, nextCollapsed ? '1' : '0')
  } catch {
    // Ignore storage write errors.
  }
}

function bindSidebarCollapseToggle() {
  const toggleButton = document.getElementById('sidebarToggleBtn')
  applySidebarRouteTitles()

  const stored = readStoredSidebarCollapsed()
  const defaultCollapsed = stored == null ? sidebarIsTabletViewport() : stored
  setSidebarCollapsed(defaultCollapsed, { persist: false })

  if (!(toggleButton instanceof HTMLButtonElement)) {
    return () => {}
  }

  const handleClick = () => {
    const root = document.getElementById('portalRoot')
    const isCollapsed = Boolean(root?.classList.contains('sidebar-collapsed'))
    setSidebarCollapsed(!isCollapsed)
  }

  const handleResize = () => {
    if (readStoredSidebarCollapsed() != null) {
      return
    }

    setSidebarCollapsed(sidebarIsTabletViewport(), { persist: false })
  }

  toggleButton.addEventListener('click', handleClick)
  window.addEventListener('resize', handleResize)

  return () => {
    toggleButton.removeEventListener('click', handleClick)
    window.removeEventListener('resize', handleResize)
  }
}

function showTransientNotice(message, type = 'success') {
  const text = String(message ?? '').trim()
  if (!text) {
    return
  }

  let notice = document.getElementById('portalNotice')
  if (!notice) {
    notice = document.createElement('div')
    notice.id = 'portalNotice'
    notice.className = 'portal-notice'
    document.body.appendChild(notice)
  }

  notice.textContent = text
  notice.className = `portal-notice show ${type === 'error' ? 'error' : 'success'}`

  if (portalNoticeTimer) {
    window.clearTimeout(portalNoticeTimer)
  }

  portalNoticeTimer = window.setTimeout(() => {
    notice?.classList.remove('show')
  }, 3000)
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function toIso(value) {
  const raw = String(value ?? '').trim()
  if (!raw) {
    return ''
  }

  const date = new Date(raw)
  if (!Number.isFinite(date.getTime())) {
    return ''
  }

  return date.toISOString()
}

function isoToLocalDateTimeInput(value) {
  const iso = toIso(value)
  if (!iso) {
    return ''
  }

  const date = new Date(iso)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function localDateTimeInputToIso(value) {
  const raw = String(value ?? '').trim()
  if (!raw) {
    return ''
  }

  const date = new Date(raw)
  if (!Number.isFinite(date.getTime())) {
    return ''
  }

  return date.toISOString()
}

function localDateAndTimeInputToIso(dateYmd, timeValue) {
  const day = String(dateYmd ?? '').trim()
  const time = String(timeValue ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) {
    return ''
  }

  return localDateTimeInputToIso(`${day}T${time}`)
}

function formatDatePl(isoValue) {
  const iso = toIso(isoValue)
  if (!iso) {
    return '-'
  }

  const date = new Date(iso)
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()}`
}

function formatTime(value) {
  const iso = toIso(value)
  if (!iso) {
    return '-'
  }

  const date = new Date(iso)
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

function todayYmd() {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

function ymdToDayTimestamp(value) {
  const raw = String(value ?? '').trim()
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    return 0
  }

  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const ts = new Date(year, month, day).getTime()
  return Number.isFinite(ts) ? ts : 0
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

function firstDayOfCurrentMonthYmd() {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`
}

function daysAgoYmd(days) {
  const offset = Number(days)
  const normalized = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - normalized)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function ymdToIsoRangeStart(ymd) {
  const value = String(ymd ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return ''
  }

  return `${value}T00:00:00.000Z`
}

function ymdToIsoRangeEnd(ymd) {
  const value = String(ymd ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return ''
  }

  return `${value}T23:59:59.999Z`
}

function calendarDateFromYmd(ymd) {
  const value = String(ymd ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date()
  }
  return new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)))
}

function calendarDateToYmd(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue)
  if (!Number.isFinite(date.getTime())) {
    return todayYmd()
  }
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function calendarAddDays(ymd, days) {
  const date = calendarDateFromYmd(ymd)
  date.setDate(date.getDate() + Number(days || 0))
  return calendarDateToYmd(date)
}

function calendarStartOfWeek(ymd) {
  const date = calendarDateFromYmd(ymd)
  const mondayOffset = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - mondayOffset)
  return calendarDateToYmd(date)
}

function calendarMonthStart(ymd) {
  const date = calendarDateFromYmd(ymd)
  date.setDate(1)
  return calendarDateToYmd(date)
}

function calendarMonthGridStart(ymd) {
  return calendarStartOfWeek(calendarMonthStart(ymd))
}

function calendarMonthLabel(ymd) {
  const date = calendarDateFromYmd(ymd)
  return date.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })
}

function calendarDayShortLabel(ymd) {
  const date = calendarDateFromYmd(ymd)
  return date.toLocaleDateString('pl-PL', { weekday: 'short' })
}

function calendarDayNumberLabel(ymd) {
  const date = calendarDateFromYmd(ymd)
  return String(date.getDate())
}

function calendarDayToneClass(dayKey, dayIndex = 0) {
  const weekDay = calendarDateFromYmd(dayKey).getDay()
  if (weekDay === 0 || weekDay === 6) {
    return 'weekend'
  }
  return dayIndex % 2 === 0 ? 'light' : 'dark'
}

function calendarStorageKey() {
  const orgId = String(appState.session?.orgId ?? '').trim() || 'local'
  return `${CALENDAR_STORAGE_PREFIX}:${orgId}`
}

function kanbanColumnsStorageKey() {
  const orgId = String(appState.session?.orgId ?? '').trim() || 'local'
  return `${KANBAN_COLUMNS_STORAGE_PREFIX}:${orgId}`
}

function kanbanDefaultColumns() {
  return KANBAN_COLUMNS.map((column) => ({ ...column }))
}

function kanbanIsNewTaskColumn(column = {}) {
  const label = normalizeSearchText(column.label)
  return column.id === KANBAN_STANDARD_NEW_TASK_COLUMN.id || KANBAN_NEW_PERSON_TASK_COLUMN_LABELS.includes(label)
}

function kanbanColumnColorMeta(color = '') {
  const value = String(color ?? '').trim()
  return KANBAN_COLUMN_COLORS.find((item) => item.value === value) ?? KANBAN_COLUMN_COLORS[0]
}

function kanbanColumnStyle(column = {}) {
  const color = kanbanColumnColorMeta(column.color)
  return `--column-accent:${color.accent};--column-soft:${color.soft};--column-border:${color.border};`
}

function kanbanNormalizeColumnScope(scope = '') {
  const value = String(scope ?? '').trim()
  const normalized = value === 'client' ? 'object' : value
  return KANBAN_COLUMN_SCOPES.some((item) => item.value === normalized) ? normalized : 'global'
}

function kanbanColumnScopeMeta(scope = '') {
  const value = kanbanNormalizeColumnScope(scope)
  return KANBAN_COLUMN_SCOPES.find((item) => item.value === value) ?? KANBAN_COLUMN_SCOPES[0]
}

function kanbanVisibleColumnScope(scope = '') {
  const value = kanbanNormalizeColumnScope(scope)
  return value === 'person' ? 'project' : value
}

function kanbanCurrentUserOption() {
  const label =
    String(appState.session?.name ?? '').trim() ||
    String(appState.session?.login ?? '').trim() ||
    String(appState.session?.email ?? '').trim()
  const id =
    String(appState.session?.uid ?? '').trim() ||
    String(appState.session?.userId ?? '').trim() ||
    String(appState.session?.login ?? '').trim() ||
    String(appState.session?.email ?? '').trim() ||
    label
  return label ? { id: `user:${id}`, label } : null
}

function kanbanColumnScopeOptionsHtml(selectedScope = '') {
  const selected = kanbanNormalizeColumnScope(selectedScope)
  return KANBAN_COLUMN_SCOPES.map(
    (scope) => `<option value="${escapeHtml(scope.value)}"${scope.value === selected ? ' selected' : ''}>${escapeHtml(scope.label)}</option>`,
  ).join('')
}

function kanbanZoneOptions() {
  const seen = new Set()
  return (Array.isArray(appState.zones) ? appState.zones : [])
    .map((zone) => mapZoneForView(zone))
    .filter((zone) => !isUnassignedCleanZone(zone))
    .map((zone) => {
      const label = [zone.clientName, zone.zoneName].filter((value) => value && value !== '-').join(' / ') || String(zone.qr ?? '').trim()
      const id = String(zone.id ?? zone.qr ?? zone.zoneId ?? label).trim()
      return { id: `zone:${id || label}`, label }
    })
    .filter((option) => {
      if (!option.label) {
        return false
      }
      const key = normalizeSearchText(option.id || option.label)
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
    .sort((left, right) => left.label.localeCompare(right.label, 'pl', { sensitivity: 'base' }))
}

function kanbanColumnOwnerOptions(scope = '') {
  const meta = kanbanColumnScopeMeta(scope)
  if (!meta.optionKind) {
    return []
  }
  const options = meta.optionKind === 'zones' ? kanbanZoneOptions() : calendarDirectoryOptions(meta.optionKind)
  const currentUser = meta.value === 'user' ? kanbanCurrentUserOption() : null
  const seen = new Set()
  return [currentUser, ...options]
    .filter(Boolean)
    .filter((option) => {
      const key = normalizeSearchText(option.id || option.label)
      if (!key || seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
}

function kanbanColumnOwnerOptionsHtml(scope = '') {
  return kanbanColumnOwnerOptions(scope)
    .map((option) => `<option value="${escapeHtml(option.label)}"></option>`)
    .join('')
}

function kanbanResolveColumnOwner(scope = '', rawOwner = '') {
  const normalizedScope = kanbanNormalizeColumnScope(scope)
  if (normalizedScope === 'global') {
    return { ownerId: '', ownerLabel: '' }
  }
  const value = String(rawOwner ?? '').trim()
  if (!value) {
    return { ownerId: '', ownerLabel: '' }
  }
  const valueKey = normalizeSearchText(value)
  const match = kanbanColumnOwnerOptions(normalizedScope).find(
    (option) => normalizeSearchText(option.label) === valueKey || normalizeSearchText(option.id) === valueKey,
  )
  return {
    ownerId: match?.id || `${normalizedScope}:${value}`,
    ownerLabel: match?.label || value,
  }
}

function kanbanNormalizeColumn(rawColumn = {}, index = 0) {
  const rawId = String(rawColumn.id ?? '').trim().replace(/[^A-Za-z0-9_-]/g, '')
  const id = rawId || `custom-${Date.now().toString(36)}-${index}`
  const label = String(rawColumn.label ?? rawColumn.name ?? '').trim() || `Kolumna ${index + 1}`
  const color = kanbanColumnColorMeta(rawColumn.color).value
  const scope = kanbanNormalizeColumnScope(rawColumn.scope)
  const ownerLabel = scope === 'global' ? '' : String(rawColumn.ownerLabel ?? rawColumn.ownerName ?? '').trim()
  const ownerId = scope === 'global' ? '' : String(rawColumn.ownerId ?? '').trim() || (ownerLabel ? `${scope}:${ownerLabel}` : '')
  return { id, label, color, scope, ownerId, ownerLabel }
}

function kanbanNormalizeColumns(rawColumns = []) {
  const source = Array.isArray(rawColumns) && rawColumns.length ? rawColumns : kanbanDefaultColumns()
  const seen = new Set()
  const columns = source
    .map((column, index) => kanbanNormalizeColumn(column, index))
    .filter((column) => {
      if (!column.id || seen.has(column.id)) {
        return false
      }
      seen.add(column.id)
      return true
    })
  const normalizedColumns = kanbanIsNewTaskColumn(columns[0] ?? {})
    ? columns
    : columns.some((column) => kanbanIsNewTaskColumn(column))
      ? columns
      : [kanbanNormalizeColumn(KANBAN_STANDARD_NEW_TASK_COLUMN, -1), ...columns]
  return normalizedColumns.length ? normalizedColumns : kanbanDefaultColumns()
}

function kanbanLoadColumns() {
  try {
    const raw = window.localStorage.getItem(kanbanColumnsStorageKey())
    const parsed = raw ? JSON.parse(raw) : null
    return kanbanNormalizeColumns(Array.isArray(parsed) ? parsed : kanbanDefaultColumns())
  } catch {
    return kanbanDefaultColumns()
  }
}

function kanbanSaveColumns(columns = appState.kanbanColumns) {
  const normalized = kanbanNormalizeColumns(columns)
  appState.kanbanColumns = normalized
  try {
    window.localStorage.setItem(kanbanColumnsStorageKey(), JSON.stringify(normalized))
  } catch {
    showTransientNotice('Nie udało się zapisać kolumn Kanban w przeglądarce.', 'error')
  }
  return normalized
}

function kanbanColumnsForStatus() {
  if (Array.isArray(appState.kanbanColumns) && appState.kanbanColumns.length) {
    return appState.kanbanColumns
  }
  return kanbanLoadColumns()
}

function kanbanDefaultStatus() {
  return kanbanColumnsForStatus()[0]?.id || KANBAN_COLUMNS[0]?.id || 'inProgress'
}

function kanbanNewPersonTaskStatus() {
  const targetLabels = new Set(KANBAN_NEW_PERSON_TASK_COLUMN_LABELS.map((label) => normalizeSearchText(label)))
  const column = kanbanColumnsForStatus().find((item) => targetLabels.has(normalizeSearchText(item.label)))
  return column?.id || kanbanDefaultStatus()
}

function kanbanNewTaskStatus() {
  const columns = kanbanColumnsForStatus()
  const standardColumn = columns.find((column) => kanbanIsNewTaskColumn(column))
  return standardColumn?.id || kanbanDefaultStatus()
}

function calendarHasAssignedWorkers(workers = []) {
  return calendarSelectionLabels(workers).length > 0
}

function kanbanDefaultStatusForTask(workers = [], preferredStatus = '') {
  const status = String(preferredStatus ?? '').trim()
  if (status) {
    return kanbanNormalizeStatus(status)
  }
  return calendarHasAssignedWorkers(workers) ? kanbanNewPersonTaskStatus() : kanbanNewTaskStatus()
}

function calendarWorkerLabel(worker = {}) {
  return String(
    worker.workerName ??
      worker.workername ??
      worker.worker_name ??
      worker.name ??
      worker.displayName ??
      worker.fullName ??
      worker.login ??
      worker.email ??
      worker.id ??
      '',
  ).trim()
}

function calendarWorkerId(worker = {}) {
  return String(worker.workerId ?? worker.id ?? worker.login ?? worker.workerLogin ?? worker.email ?? '').trim()
}

function calendarObjectLabel(object = {}) {
  return String(
    object.name ??
      object.clientName ??
      object.objectName ??
      object.nazwa ??
      object.companyName ??
      object.shortName ??
      object.id ??
      '',
  ).trim()
}

function calendarObjectId(object = {}) {
  return String(object.id ?? object.clientId ?? object.objectId ?? object.code ?? '').trim()
}

function calendarDirectoryOptions(kind = 'workers') {
  const source = kind === 'objects' ? appState.clients : appState.workers
  const seen = new Set()
  return (Array.isArray(source) ? source : [])
    .map((item) => {
      const label = kind === 'objects' ? calendarObjectLabel(item) : calendarWorkerLabel(item)
      const rawId = kind === 'objects' ? calendarObjectId(item) : calendarWorkerId(item)
      const id = kind === 'objects' ? `client:${rawId || label}` : rawId
      return { id, label }
    })
    .filter((option) => {
      if (!option.label) {
        return false
      }
      const key = normalizeSearchText(option.id || option.label)
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
    .sort((left, right) => left.label.localeCompare(right.label, 'pl', { sensitivity: 'base' }))
}

function calendarNormalizeSelectionList(rawValue = [], fallbackText = '') {
  const rawItems = Array.isArray(rawValue)
    ? rawValue
    : String(rawValue ?? '')
        .split(/[;\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
  const fallbackItems = !rawItems.length
    ? String(fallbackText ?? '')
        .split(/[;\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
    : []
  const seen = new Set()
  return [...rawItems, ...fallbackItems]
    .map((item) => {
      if (typeof item === 'object' && item !== null) {
        const label = String(item.label ?? item.name ?? item.title ?? item.value ?? '').trim()
        const id = String(item.id ?? item.value ?? '').trim()
        return { id, label }
      }
      return { id: '', label: String(item ?? '').trim() }
    })
    .filter((item) => {
      if (!item.label) {
        return false
      }
      const key = normalizeSearchText(item.id || item.label)
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
}

function calendarNormalizeZoneSelection(rawZone = null, fallbackId = '', fallbackLabel = '', fallbackLocation = '') {
  if (typeof rawZone === 'object' && rawZone !== null) {
    const id = String(rawZone.id ?? rawZone.zoneId ?? rawZone.value ?? '').trim()
    const label = String(rawZone.label ?? rawZone.zoneName ?? rawZone.name ?? rawZone.value ?? '').trim()
    const clientLabel = String(rawZone.clientLabel ?? rawZone.clientName ?? '').trim()
    const location = String(rawZone.location ?? rawZone.zoneLocation ?? rawZone.lokalizacja ?? '').trim()
    return label || id ? { id, label: label || id, clientLabel, location } : null
  }
  const id = String(rawZone || fallbackId || '').trim()
  const label = String(fallbackLabel || rawZone || fallbackId || '').trim()
  const location = String(fallbackLocation ?? '').trim()
  return label || id ? { id, label: label || id, clientLabel: '', location } : null
}

function calendarClientSelectionKeys(objects = []) {
  const selections = calendarNormalizeSelectionList(objects)
  const ids = new Set()
  const labels = new Set()
  selections.forEach((selection) => {
    const id = String(selection.id ?? '').replace(/^client:/, '').trim()
    const label = String(selection.label ?? '').trim()
    if (id) {
      ids.add(normalizeSearchText(id))
    }
    if (label) {
      labels.add(normalizeSearchText(label))
    }
  })
  return { ids, labels, hasSelection: selections.length > 0 }
}

function calendarZoneOptionsForClients(objects = []) {
  const { ids, labels, hasSelection } = calendarClientSelectionKeys(objects)
  if (!hasSelection) {
    return []
  }
  const seen = new Set()
  return (Array.isArray(appState.zones) ? appState.zones : [])
    .map((zone) => mapZoneForView(zone))
    .filter((zone) => !isUnassignedCleanZone(zone))
    .filter((zone) => {
      const clientId = normalizeSearchText(zone.clientId)
      const clientName = normalizeSearchText(zone.clientName)
      return ids.has(clientId) || labels.has(clientName) || ids.has(clientName) || labels.has(clientId)
    })
    .map((zone) => {
      const id = String(zone.id ?? zone.qr ?? zone.zoneId ?? zone.zoneName ?? '').trim()
      const label = String(zone.zoneName ?? zone.name ?? zone.zone ?? id).trim()
      const clientLabel = String(zone.clientName ?? '').trim()
      const location = String(zone.location ?? zone.lokalizacja ?? '').trim()
      return { id, label, clientLabel, location: location === '-' ? '' : location }
    })
    .filter((zone) => {
      if (!zone.label) {
        return false
      }
      const key = normalizeSearchText(zone.id || zone.label)
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
    .sort((left, right) => left.label.localeCompare(right.label, 'pl', { sensitivity: 'base' }))
}

function calendarZoneDisplayLabel(zone = {}) {
  const label = String(zone.label ?? zone.zoneName ?? '').trim()
  const location = String(zone.location ?? zone.zoneLocation ?? '').trim()
  const visibleLocation = location && location !== '-' ? location : 'brak lokalizacji'
  return [label || 'Strefa', visibleLocation].filter(Boolean).join(' - ')
}

function calendarReadZoneSelection() {
  const select = document.getElementById('calendarTaskZone')
  if (!(select instanceof HTMLSelectElement)) {
    return null
  }
  const id = String(select.value ?? '').trim()
  if (!id) {
    return null
  }
  const option = select.selectedOptions?.[0]
  const label = String(option?.getAttribute('data-zone-label') ?? option?.textContent ?? id).trim()
  const clientLabel = String(option?.getAttribute('data-client-label') ?? '').trim()
  const location = String(option?.getAttribute('data-zone-location') ?? '').trim()
  return { id, label, clientLabel, location }
}

function calendarSyncZoneOptions(selectedZone = null, options = {}) {
  const select = document.getElementById('calendarTaskZone')
  if (!(select instanceof HTMLSelectElement)) {
    return
  }
  const preserveUnknown = Boolean(options.preserveUnknown)
  const objects = calendarReadPickerRows('objects')
  const hasClient = calendarClientSelectionKeys(objects).hasSelection
  const zones = calendarZoneOptionsForClients(objects)
  const normalizedSelected = calendarNormalizeZoneSelection(selectedZone)
  const selectedId = String(normalizedSelected?.id ?? '').trim()
  const selectedLabel = String(normalizedSelected?.label ?? '').trim()
  const selectedLocation = String(normalizedSelected?.location ?? '').trim()
  const hasSelectedInList = selectedId ? zones.some((zone) => String(zone.id) === selectedId) : false

  if (!hasClient) {
    select.disabled = true
    select.innerHTML = '<option value="">Najpierw wybierz klienta</option>'
    return
  }

  if (!zones.length && !selectedLabel) {
    select.disabled = true
    select.innerHTML = '<option value="">Brak stref dla wybranego klienta</option>'
    return
  }

  const fallbackOption =
    preserveUnknown && selectedLabel && !hasSelectedInList
      ? `<option value="${escapeHtml(selectedId || selectedLabel)}" data-zone-label="${escapeHtml(selectedLabel)}" data-zone-location="${escapeHtml(selectedLocation)}" selected>${escapeHtml(calendarZoneDisplayLabel({ label: selectedLabel, location: selectedLocation }))}</option>`
      : ''
  select.disabled = false
  select.innerHTML = `
    <option value="">Bez przypisanej strefy</option>
    ${fallbackOption}
    ${zones
      .map((zone) => {
        const selected = selectedId && String(zone.id) === selectedId ? ' selected' : ''
        return `<option value="${escapeHtml(zone.id)}" data-zone-label="${escapeHtml(zone.label)}" data-zone-location="${escapeHtml(zone.location)}" data-client-label="${escapeHtml(zone.clientLabel)}"${selected}>${escapeHtml(calendarZoneDisplayLabel(zone))}</option>`
      })
      .join('')}
  `
}

function calendarSelectionLabels(selections = []) {
  return (Array.isArray(selections) ? selections : [])
    .map((item) => String(item?.label ?? item?.name ?? item ?? '').trim())
    .filter(Boolean)
}

function calendarNormalizeTimeValue(value = '') {
  const raw = String(value ?? '').trim()
  const match = raw.match(/^(\d{1,2})(?::(\d{1,2}))?$/)
  if (!match) {
    return ''
  }
  const hour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return ''
  }
  return `${pad2(hour)}:${pad2(minute)}`
}

function calendarTimeToMinutes(value = '') {
  const normalized = calendarNormalizeTimeValue(value)
  if (!normalized) {
    return null
  }
  const [hour, minute] = normalized.split(':').map((part) => Number(part))
  return hour * 60 + minute
}

function calendarMinutesToTime(minutes) {
  const value = Number(minutes)
  if (!Number.isFinite(value) || value < 0 || value > 1439) {
    return ''
  }
  const hour = Math.floor(value / 60)
  const minute = value % 60
  return `${pad2(hour)}:${pad2(minute)}`
}

function calendarCurrentActorLabel() {
  return (
    String(appState.session?.name ?? '').trim() ||
    String(appState.session?.login ?? '').trim() ||
    String(appState.session?.email ?? '').trim() ||
    'Użytkownik'
  )
}

function calendarToneLabel(tone = '') {
  const value = String(tone ?? '').trim()
  return CALENDAR_TONE_OPTIONS.find((option) => option.value === value)?.label ?? 'Standard'
}

function kanbanColumnLabel(status = '') {
  const value = kanbanNormalizeStatus(status)
  return kanbanColumnsForStatus().find((column) => column.id === value)?.label ?? value
}

function calendarDateLabelFromYmd(dateYmd = '') {
  const value = String(dateYmd ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDatePl(`${value}T12:00:00.000Z`) : '-'
}

function calendarSelectionText(selections = []) {
  const labels = calendarSelectionLabels(selections)
  return labels.length ? labels.join(', ') : '-'
}

function calendarTaskZoneText(task = {}) {
  const zoneLabel = String(task.zone?.label ?? task.zoneName ?? '').trim()
  const zoneLocation = String(task.zone?.location ?? task.zoneLocation ?? '').trim()
  return zoneLabel ? calendarZoneDisplayLabel({ label: zoneLabel, location: zoneLocation }) : '-'
}

function calendarActivityTimestamp(value = '') {
  return toIso(value) || new Date().toISOString()
}

function calendarNormalizeActivityLog(rawValue = []) {
  const rawItems = Array.isArray(rawValue) ? rawValue : []
  const seen = new Set()
  return rawItems
    .map((item) => {
      if (typeof item !== 'object' || item === null) {
        return null
      }
      const at = calendarActivityTimestamp(item.at ?? item.createdAt ?? item.timestamp)
      const action = String(item.action ?? item.title ?? '').trim()
      const actor = String(item.actor ?? item.by ?? '').trim() || 'System'
      const details = String(item.details ?? item.description ?? '').trim()
      const id = String(item.id ?? `${at}-${action}-${actor}-${details}`).trim()
      return action ? { id, at, actor, action, details } : null
    })
    .filter(Boolean)
    .filter((item) => {
      const key = item.id || `${item.at}-${item.action}-${item.actor}`
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
    .sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime())
}

function calendarActivityEntry(action = '', details = '', options = {}) {
  const at = calendarActivityTimestamp(options.at)
  const actor = String(options.actor ?? '').trim() || calendarCurrentActorLabel()
  const title = String(action ?? '').trim() || 'Zmieniono zadanie'
  const description = String(details ?? '').trim()
  return {
    id: `activity-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    at,
    actor,
    action: title,
    details: description,
  }
}

function calendarAppendTaskActivity(task = {}, action = '', details = '', options = {}) {
  const activityLog = calendarNormalizeActivityLog(task.activityLog)
  return {
    ...task,
    activityLog: [...activityLog, calendarActivityEntry(action, details, options)],
  }
}

function calendarTaskChangeDetails(beforeTask = {}, afterTask = {}) {
  const fields = [
    ['Tytuł', beforeTask.title, afterTask.title],
    ['Data', calendarDateLabelFromYmd(beforeTask.dateYmd), calendarDateLabelFromYmd(afterTask.dateYmd)],
    ['START', calendarNormalizeTimeValue(beforeTask.startTime ?? beforeTask.time) || '-', calendarNormalizeTimeValue(afterTask.startTime ?? afterTask.time) || '-'],
    ['STOP', calendarNormalizeTimeValue(beforeTask.endTime) || '-', calendarNormalizeTimeValue(afterTask.endTime) || '-'],
    ['Typ', calendarToneLabel(calendarTaskToneValue(beforeTask)), calendarToneLabel(calendarTaskToneValue(afterTask))],
    ['Kolumna', kanbanColumnLabel(beforeTask.kanbanStatus), kanbanColumnLabel(afterTask.kanbanStatus)],
    ['Osoby', calendarSelectionText(beforeTask.workers), calendarSelectionText(afterTask.workers)],
    ['Klienci', calendarSelectionText(beforeTask.objects), calendarSelectionText(afterTask.objects)],
    ['Strefa', calendarTaskZoneText(beforeTask), calendarTaskZoneText(afterTask)],
  ]
  if (String(beforeTask.notes ?? '').trim() !== String(afterTask.notes ?? '').trim()) {
    fields.push(['Opis', beforeTask.notes ? 'uzupełniony' : 'pusty', afterTask.notes ? 'uzupełniony' : 'pusty'])
  }
  const changes = fields
    .map(([label, beforeValue, afterValue]) => {
      const beforeText = String(beforeValue ?? '').trim() || '-'
      const afterText = String(afterValue ?? '').trim() || '-'
      return beforeText === afterText ? '' : `${label}: ${beforeText} -> ${afterText}`
    })
    .filter(Boolean)
  return changes.length ? changes.join('\n') : 'Zapisano bez zmian w polach zadania.'
}

function kanbanNormalizeStatus(status = '') {
  const value = String(status ?? '').trim()
  return kanbanColumnsForStatus().some((column) => column.id === value) ? value : kanbanDefaultStatus()
}

function calendarNormalizeTask(rawTask = {}) {
  const id = String(rawTask.id ?? '').trim() || `cal-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const dateYmd = /^\d{4}-\d{2}-\d{2}$/.test(String(rawTask.dateYmd ?? '').trim())
    ? String(rawTask.dateYmd).trim()
    : todayYmd()
  const rawTone = String(rawTask.tone ?? '').trim()
  const tone = rawTask.generatedFromComment && (rawTone === 'red' || rawTone === 'workerMessage')
    ? 'message'
    : CALENDAR_TONE_OPTIONS.some((option) => option.value === rawTone)
      ? rawTone
      : 'blue'
  const startTime = calendarNormalizeTimeValue(rawTask.startTime || rawTask.time)
  const endTime = calendarNormalizeTimeValue(rawTask.endTime || rawTask.stopTime || rawTask.timeEnd)
  const workers = calendarNormalizeSelectionList(rawTask.workers ?? rawTask.assignees ?? rawTask.people)
  const objects = calendarNormalizeSelectionList(rawTask.objects ?? rawTask.clients ?? rawTask.sites, rawTask.place)
  const zone = calendarNormalizeZoneSelection(
    rawTask.zone ?? rawTask.selectedZone,
    rawTask.zoneId ?? rawTask.roomId ?? rawTask.utilityRoomId,
    rawTask.zoneName ?? rawTask.strefa,
    rawTask.zoneLocation ?? rawTask.location,
  )
  const completionStatus = String(rawTask.completionStatus ?? rawTask.taskStatus ?? '').trim().toUpperCase()
  const completedRaw = rawTask.completed ?? rawTask.kanbanCompleted ?? rawTask.done
  const completed = completedRaw === undefined || completedRaw === null ? completionStatus === 'ZAKONCZONE' : Boolean(completedRaw)
  return {
    id,
    title: String(rawTask.title ?? '').trim() || 'Nowe zadanie',
    dateYmd,
    time: startTime,
    startTime,
    endTime,
    place: String(rawTask.place ?? '').trim(),
    workers,
    objects,
    zone,
    zoneId: zone?.id || '',
    zoneName: zone?.label || '',
    zoneLocation: zone?.location || '',
    kanbanStatus: kanbanDefaultStatusForTask(workers, rawTask.kanbanStatus ?? rawTask.status),
    active: rawTask.active === undefined ? true : Boolean(rawTask.active),
    completed,
    kanbanCompleted: completed,
    completionStatus: completed ? 'ZAKONCZONE' : 'AKTYWNE',
    completedAt: completed ? String(rawTask.completedAt ?? rawTask.kanbanCompletedAt ?? '').trim() : '',
    completedBy: completed ? String(rawTask.completedBy ?? rawTask.kanbanCompletedBy ?? '').trim() : '',
    completedNote: completed ? String(rawTask.completedNote ?? rawTask.kanbanDoneNote ?? rawTask.doneNote ?? '').trim() : '',
    read: Boolean(rawTask.read ?? rawTask.isRead ?? rawTask.seen ?? false),
    readAt: String(rawTask.readAt ?? rawTask.seenAt ?? rawTask.acknowledgedAt ?? '').trim(),
    readBy: String(rawTask.readBy ?? rawTask.seenBy ?? rawTask.acknowledgedBy ?? '').trim(),
    notes: String(rawTask.notes ?? '').trim(),
    generatedFromComment: Boolean(rawTask.generatedFromComment),
    sourceCommentKey: String(rawTask.sourceCommentKey ?? rawTask.sourceKey ?? '').trim(),
    sourceComment: String(rawTask.sourceComment ?? '').trim(),
    sourceEventId: String(rawTask.sourceEventId ?? '').trim(),
    sourceKind: String(rawTask.sourceKind ?? '').trim(),
    sourceWorkerName: String(rawTask.sourceWorkerName ?? rawTask.workerName ?? '').trim(),
    sourceWorkerLogin: String(rawTask.sourceWorkerLogin ?? rawTask.workerLogin ?? '').trim(),
    dueDateYmd: /^\d{4}-\d{2}-\d{2}$/.test(String(rawTask.dueDateYmd ?? '').trim())
      ? String(rawTask.dueDateYmd).trim()
      : '',
    dueTime: calendarNormalizeTimeValue(rawTask.dueTime ?? rawTask.deadlineTime),
    deadlineAt: toIso(rawTask.deadlineAt),
    activityLog: calendarNormalizeActivityLog(rawTask.activityLog ?? rawTask.activities),
    tone,
    createdAt: String(rawTask.createdAt ?? '').trim() || new Date().toISOString(),
    updatedAt: String(rawTask.updatedAt ?? '').trim() || new Date().toISOString(),
  }
}

function calendarLoadTasks() {
  try {
    const raw = window.localStorage.getItem(calendarStorageKey())
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.map((task) => calendarNormalizeTask(task)) : []
  } catch {
    return []
  }
}

function calendarTaskUpdatedAtValue(task = {}) {
  const candidates = [task.updatedAt, task.completedAt, task.createdAt]
  for (const candidate of candidates) {
    const time = Date.parse(String(candidate ?? ''))
    if (Number.isFinite(time)) {
      return time
    }
  }
  return 0
}

function calendarTaskMergeKeys(task = {}) {
  const keys = []
  const id = String(task.id ?? '').trim()
  const sourceCommentKey = String(task.sourceCommentKey ?? '').trim()
  if (id) keys.push(`id:${id}`)
  if (sourceCommentKey) keys.push(`comment:${sourceCommentKey}`)
  return keys
}

function calendarMergeTaskLists(...taskLists) {
  const byKey = new Map()
  const canonicalTasks = []

  taskLists
    .flat()
    .filter(Boolean)
    .map((task) => calendarNormalizeTask(task))
    .forEach((task) => {
      const keys = calendarTaskMergeKeys(task)
      if (!keys.length) {
        canonicalTasks.push(task)
        return
      }

      const existing = keys.map((key) => byKey.get(key)).find(Boolean)
      if (!existing) {
        keys.forEach((key) => byKey.set(key, task))
        canonicalTasks.push(task)
        return
      }

      const winner = calendarTaskUpdatedAtValue(task) >= calendarTaskUpdatedAtValue(existing) ? task : existing
      const loser = winner === task ? existing : task
      const merged = calendarNormalizeTask({
        ...loser,
        ...winner,
        workers: winner.workers?.length ? winner.workers : loser.workers,
        objects: winner.objects?.length ? winner.objects : loser.objects,
        activityLog: calendarNormalizeActivityLog([...(loser.activityLog ?? []), ...(winner.activityLog ?? [])]),
      })
      const existingIndex = canonicalTasks.findIndex((item) => item === existing || item.id === existing.id)
      if (existingIndex >= 0) {
        canonicalTasks[existingIndex] = merged
      }
      calendarTaskMergeKeys(merged).forEach((key) => byKey.set(key, merged))
    })

  const seen = new Set()
  return calendarSortTasks(
    canonicalTasks.filter((task) => {
      const key = String(task.id ?? '').trim()
      if (!key || seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    }),
  )
}

function calendarQueueRemoteTaskSave(tasks = appState.calendarTasks) {
  const orgId = String(appState.session?.orgId ?? '').trim()
  if (!orgId) {
    return
  }

  if (calendarRemoteSaveTimer) {
    window.clearTimeout(calendarRemoteSaveTimer)
  }

  const snapshot = (Array.isArray(tasks) ? tasks : []).map((task) => calendarNormalizeTask(task))
  calendarRemoteSaveTimer = window.setTimeout(() => {
    calendarRemoteSaveTimer = 0
    void upsertPortalTasks(orgId, snapshot).catch((error) => {
      console.warn('[portal/tasks] remote save failed', error)
    })
  }, 350)
}

function calendarSaveTasks(tasks = appState.calendarTasks, options = {}) {
  const normalized = (Array.isArray(tasks) ? tasks : []).map((task) => calendarNormalizeTask(task))
  appState.calendarTasks = calendarSortTasks(normalized)
  try {
    window.localStorage.setItem(calendarStorageKey(), JSON.stringify(appState.calendarTasks))
  } catch {
    showTransientNotice('Nie udało się zapisać kalendarza w przeglądarce.', 'error')
  }
  if (options.syncRemote !== false) {
    calendarQueueRemoteTaskSave(appState.calendarTasks)
  }
}

async function calendarSyncRemoteTasks({ render = false } = {}) {
  const orgId = String(appState.session?.orgId ?? '').trim()
  if (!orgId || appState.calendarRemoteTasksLoading) {
    return appState.calendarTasks
  }

  appState.calendarRemoteTasksLoading = true
  renderKanbanSyncStatus()
  try {
    const localTasks = calendarLoadTasks()
    const remoteTasks = await fetchPortalTasks(orgId)
    const mergedTasks = calendarMergeTaskLists(localTasks, remoteTasks)
    const remoteCount = Array.isArray(remoteTasks) ? remoteTasks.length : 0
    calendarSaveTasks(mergedTasks, { syncRemote: false })
    appState.calendarRemoteTasksLoaded = true
    if (mergedTasks.length > remoteCount) {
      calendarQueueRemoteTaskSave(mergedTasks)
    }
    if (render) {
      renderDashboardKanbanTasks()
      if (appState.currentRoute === 'calendar') renderCalendarView()
      if (appState.currentRoute === 'kanban') renderKanbanView()
    }
    return appState.calendarTasks
  } catch (error) {
    appState.calendarRemoteTasksLoaded = false
    console.warn('[portal/tasks] remote load failed', error)
    return appState.calendarTasks
  } finally {
    appState.calendarRemoteTasksLoading = false
    renderKanbanSyncStatus()
  }
}

function calendarDeleteRemoteTasksById(taskIds = []) {
  const orgId = String(appState.session?.orgId ?? '').trim()
  const ids = (Array.isArray(taskIds) ? taskIds : [taskIds])
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
  if (!orgId || !ids.length) {
    return
  }

  void deletePortalTasks(orgId, ids).catch((error) => {
    console.warn('[portal/tasks] remote delete failed', error)
  })
}

function calendarSortTasks(tasks = []) {
  return [...tasks].sort((left, right) => {
    const leftDate = String(left.dateYmd ?? '')
    const rightDate = String(right.dateYmd ?? '')
    if (leftDate !== rightDate) {
      return leftDate.localeCompare(rightDate)
    }
    const leftTime = String(left.time ?? '')
    const rightTime = String(right.time ?? '')
    if (leftTime !== rightTime) {
      return leftTime.localeCompare(rightTime)
    }
    const leftEndTime = String(left.endTime ?? '')
    const rightEndTime = String(right.endTime ?? '')
    if (leftEndTime !== rightEndTime) {
      return leftEndTime.localeCompare(rightEndTime)
    }
    return String(left.title ?? '').localeCompare(String(right.title ?? ''), 'pl', { sensitivity: 'base' })
  })
}

function normalizeClientStatus(status) {
  const value = String(status ?? '').trim().toLowerCase()

  if (value === 'active' || value === 'aktywny') {
    return 'Aktywny'
  }

  if (value === 'inactive' || value === 'nieaktywny') {
    return 'Nieaktywny'
  }

  return 'Aktywny'
}

function statusBadgeClass(statusLabel) {
  return statusLabel === 'Aktywny' ? 'badge badge-active' : 'badge badge-inactive'
}

function roleLevel(role) {
  const normalized = String(role ?? '')
    .trim()
    .toLowerCase()

  if (!normalized) {
    return 0
  }

  if (normalized === 'admin' || normalized === 'administrator' || normalized === 'owner' || normalized === 'superadmin') {
    return 3
  }

  if (
    normalized.includes('kierownik') ||
    normalized.includes('manager') ||
    normalized.includes('menager') ||
    normalized.includes('menedzer') ||
    normalized.includes('menedżer')
  ) {
    return 2
  }

  if (
    normalized.includes('pracownik') ||
    normalized.includes('worker') ||
    normalized.includes('koordynator') ||
    normalized.includes('coordynator') ||
    normalized.includes('coordinator') ||
    normalized.includes('stażysta') ||
    normalized.includes('stazysta') ||
    normalized.includes('intern') ||
    normalized.includes('member')
  ) {
    return 1
  }

  return 1
}

function canManageWorkers() {
  return roleLevel(appState.session?.role) >= 2
}

function canDeleteWorkers() {
  return roleLevel(appState.session?.role) >= 3
}

function canManageClients() {
  return roleLevel(appState.session?.role) >= 2
}

function canManageEvents() {
  return roleLevel(appState.session?.role) >= 2
}

function canManageIndividualOrders() {
  return roleLevel(appState.session?.role) >= 2
}

function canManageBackupSettings() {
  return roleLevel(appState.session?.role) >= 3
}

function normalizeSettingsTab(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === SETTINGS_TAB_BACKUP) {
    return SETTINGS_TAB_BACKUP
  }
  return SETTINGS_TAB_STYLES
}

function readStoredSettingsTab() {
  try {
    return normalizeSettingsTab(window.sessionStorage.getItem(SETTINGS_TAB_STORAGE_KEY))
  } catch {
    return SETTINGS_TAB_STYLES
  }
}

function persistSettingsTab(tab) {
  try {
    window.sessionStorage.setItem(SETTINGS_TAB_STORAGE_KEY, normalizeSettingsTab(tab))
  } catch {
    // Ignore storage failures in private mode.
  }
}

function resolveStyleMeta(styleId) {
  const normalized = String(styleId ?? '').trim()
  const styles = listAvailableStyles()
  return styles.find((item) => String(item?.id ?? '').trim() === normalized) ?? null
}

function applyPortalTheme(styleId) {
  const root = document.getElementById('portalRoot')
  if (!(root instanceof HTMLElement)) {
    return
  }

  const normalized = resolveStyleMeta(styleId)?.id ?? STYLE_FALLBACK_ID
  root.setAttribute('data-theme', normalized)
}

function settingsStyleSourceLabel(source) {
  const key = String(source ?? '').trim().toLowerCase()
  return STYLE_SOURCE_LABELS[key] ?? STYLE_SOURCE_LABELS.fallback
}

function settingsRenderStyleStatus() {
  const statusNode = document.getElementById('settingsStyleStatus')
  if (!(statusNode instanceof HTMLElement)) {
    return
  }

  const effectiveId = String(appState.settingsEffectiveStyleId ?? '').trim() || STYLE_FALLBACK_ID
  const effectiveMeta = resolveStyleMeta(effectiveId)
  const effectiveName = String(effectiveMeta?.name ?? 'Classic Blue')
  const sourceLabel = settingsStyleSourceLabel(appState.settingsEffectiveStyleSource)
  const orgMeta = resolveStyleMeta(appState.settingsOrgStyleId)
  const userMeta = resolveStyleMeta(appState.settingsUserStyleId)

  statusNode.innerHTML = `
    <div class="settings-style-status-top">
      <div class="settings-style-status-label">Aktywny styl efektywny</div>
      <div class="settings-style-status-badge">${escapeHtml(effectiveName)}</div>
    </div>
    <div class="settings-style-status-meta">Zrodlo: <strong>${escapeHtml(sourceLabel)}</strong></div>
    <div class="settings-style-status-hint">
      Domyslny org: <strong>${escapeHtml(orgMeta?.name ?? '-')}</strong>
      <span class="settings-style-status-dot">•</span>
      Moj wybor: <strong>${escapeHtml(userMeta?.name ?? '-')}</strong>
    </div>
  `
}

function settingsRenderStyleCards() {
  const root = document.getElementById('settingsStyleCards')
  if (!(root instanceof HTMLElement)) {
    return
  }

  const styles = listAvailableStyles()
  const canSetOrg = canManageBackupSettings()
  const effectiveId = String(appState.settingsEffectiveStyleId ?? '').trim() || STYLE_FALLBACK_ID
  const userStyleId = String(appState.settingsUserStyleId ?? '').trim()
  const orgStyleId = String(appState.settingsOrgStyleId ?? '').trim()
  const hasUserOverride = Boolean(userStyleId)

  root.innerHTML = styles
    .map((style) => {
      const styleId = String(style?.id ?? '').trim()
      const isEffective = styleId === effectiveId
      const isUser = styleId === userStyleId
      const isOrg = styleId === orgStyleId

      return `
        <article class="fido-card settings-style-card${isEffective ? ' is-effective' : ''}" data-style-id="${escapeHtml(styleId)}">
          <div class="settings-style-card-header">
            <h3>${escapeHtml(String(style?.name ?? styleId))}</h3>
            <div class="settings-style-badges">
              ${isEffective ? '<span class="settings-style-pill is-effective">Aktywny</span>' : ''}
              ${isUser ? '<span class="settings-style-pill is-user">Moj styl</span>' : ''}
              ${isOrg ? '<span class="settings-style-pill is-org">Domyslny org</span>' : ''}
            </div>
          </div>
          <p>${escapeHtml(String(style?.description ?? ''))}</p>
          <div class="settings-style-preview settings-style-preview--${escapeHtml(styleId)}">
            <span></span><span></span><span></span>
          </div>
          <div class="settings-style-actions">
            <button class="btn2 primary" type="button" data-style-action="set-user" data-style-id="${escapeHtml(styleId)}">
              Ustaw jako moj styl
            </button>
            <button class="btn2" type="button" data-style-action="clear-user" data-style-id="${escapeHtml(styleId)}"${
              hasUserOverride ? '' : ' disabled'
            }>
              Uzyj domyslnego
            </button>
            ${
              canSetOrg
                ? `<button class="btn2" type="button" data-style-action="set-org" data-style-id="${escapeHtml(styleId)}">Ustaw jako domyslny organizacji</button>`
                : ''
            }
          </div>
        </article>
      `
    })
    .join('')
}

function settingsSetActiveTab(tab, { persist = true } = {}) {
  const requested = normalizeSettingsTab(tab)
  const canBackup = canManageBackupSettings()
  const effectiveTab = requested === SETTINGS_TAB_BACKUP && !canBackup ? SETTINGS_TAB_STYLES : requested
  appState.settingsActiveTab = effectiveTab

  const tabButtons = document.querySelectorAll('#settingsTabs [data-settings-tab]')
  tabButtons.forEach((button) => {
    if (!(button instanceof HTMLElement)) {
      return
    }
    const tabId = normalizeSettingsTab(button.getAttribute('data-settings-tab'))
    const active = tabId === effectiveTab
    button.classList.toggle('active', active)
    button.setAttribute('aria-selected', active ? 'true' : 'false')
  })

  const panels = document.querySelectorAll('#view-settings [data-settings-panel]')
  panels.forEach((panel) => {
    if (!(panel instanceof HTMLElement)) {
      return
    }
    const panelId = normalizeSettingsTab(panel.getAttribute('data-settings-panel'))
    panel.style.display = panelId === effectiveTab ? '' : 'none'
  })

  if (persist) {
    persistSettingsTab(effectiveTab)
  }
}

async function settingsRefreshStyleState({ silent = false } = {}) {
  const orgId = settingsCurrentOrgId()
  const uid = String(appState.session?.uid ?? '').trim() || String(appState.session?.login ?? '').trim()
  if (!orgId) {
    appState.settingsEffectiveStyleId = STYLE_FALLBACK_ID
    appState.settingsEffectiveStyleSource = 'fallback'
    appState.settingsOrgStyleId = ''
    appState.settingsUserStyleId = ''
    applyPortalTheme(STYLE_FALLBACK_ID)
    settingsRenderStyleStatus()
    settingsRenderStyleCards()
    return
  }

  try {
    const effective = await getEffectiveStyle(orgId, uid)
    const effectiveId = resolveStyleMeta(effective?.styleId)?.id ?? STYLE_FALLBACK_ID
    appState.settingsEffectiveStyleId = effectiveId
    appState.settingsEffectiveStyleSource = String(effective?.source ?? 'fallback')
    appState.settingsOrgStyleId = resolveStyleMeta(effective?.orgStyleId)?.id ?? ''
    appState.settingsUserStyleId = resolveStyleMeta(effective?.userStyleId)?.id ?? ''
    applyPortalTheme(effectiveId)
  } catch (error) {
    appState.settingsEffectiveStyleId = STYLE_FALLBACK_ID
    appState.settingsEffectiveStyleSource = 'fallback'
    appState.settingsOrgStyleId = ''
    appState.settingsUserStyleId = ''
    applyPortalTheme(STYLE_FALLBACK_ID)
    if (!silent) {
      const message = error instanceof Error ? error.message : 'Nie udalo sie odczytac stylu.'
      showTransientNotice(message, 'error')
    }
  }

  settingsRenderStyleStatus()
  settingsRenderStyleCards()
}

async function settingsApplyUserStyle(styleId) {
  const orgId = settingsCurrentOrgId()
  const uid = String(appState.session?.uid ?? '').trim() || String(appState.session?.login ?? '').trim()
  if (!orgId || !uid) {
    showTransientNotice('Brak aktywnej sesji do zapisu stylu.', 'error')
    return
  }

  const previous = {
    effectiveId: appState.settingsEffectiveStyleId,
    effectiveSource: appState.settingsEffectiveStyleSource,
    orgId: appState.settingsOrgStyleId,
    userId: appState.settingsUserStyleId,
  }

  const meta = resolveStyleMeta(styleId)
  if (!meta) {
    showTransientNotice('Wybrano nieznany styl.', 'error')
    return
  }

  appState.settingsEffectiveStyleId = meta.id
  appState.settingsEffectiveStyleSource = 'user'
  appState.settingsUserStyleId = meta.id
  applyPortalTheme(meta.id)
  settingsRenderStyleStatus()
  settingsRenderStyleCards()

  try {
    await setUserStyle(orgId, uid, meta.id, settingsCurrentActor())
    showTransientNotice(`Ustawiono styl: ${meta.name}.`)
    await settingsRefreshStyleState({ silent: true })
  } catch (error) {
    appState.settingsEffectiveStyleId = previous.effectiveId
    appState.settingsEffectiveStyleSource = previous.effectiveSource
    appState.settingsOrgStyleId = previous.orgId
    appState.settingsUserStyleId = previous.userId
    applyPortalTheme(previous.effectiveId || STYLE_FALLBACK_ID)
    settingsRenderStyleStatus()
    settingsRenderStyleCards()
    const message = error instanceof Error ? error.message : 'Nie udalo sie zapisac stylu.'
    showTransientNotice(message, 'error')
  }
}

async function settingsClearUserStyle() {
  const orgId = settingsCurrentOrgId()
  const uid = String(appState.session?.uid ?? '').trim() || String(appState.session?.login ?? '').trim()
  if (!orgId || !uid) {
    showTransientNotice('Brak aktywnej sesji do zapisu stylu.', 'error')
    return
  }

  try {
    await clearUserStyle(orgId, uid)
    await settingsRefreshStyleState({ silent: true })
    showTransientNotice('Wyczyszczono nadpisanie stylu uzytkownika.')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Nie udalo sie wyczyscic stylu.'
    showTransientNotice(message, 'error')
  }
}

async function settingsApplyOrgDefaultStyle(styleId) {
  if (!canManageBackupSettings()) {
    showTransientNotice('Brak uprawnien do zmiany domyslnego stylu organizacji.', 'error')
    return
  }

  const orgId = settingsCurrentOrgId()
  if (!orgId) {
    showTransientNotice('Brak orgId w sesji.', 'error')
    return
  }

  const meta = resolveStyleMeta(styleId)
  if (!meta) {
    showTransientNotice('Wybrano nieznany styl.', 'error')
    return
  }

  try {
    await setOrgDefaultStyle(orgId, meta.id, settingsCurrentActor())
    await settingsRefreshStyleState({ silent: true })
    showTransientNotice(`Ustawiono domyslny styl organizacji: ${meta.name}.`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Nie udalo sie ustawic stylu domyslnego organizacji.'
    showTransientNotice(message, 'error')
  }
}

function backupTypeLabel(type) {
  const normalized = String(type ?? '').trim().toLowerCase()
  return BACKUP_TYPE_LABELS[normalized] ?? BACKUP_TYPE_LABELS.full
}

function backupSourceLabel(source) {
  const normalized = String(source ?? '').trim().toLowerCase()
  return BACKUP_SOURCE_LABELS[normalized] ?? 'Reczny'
}

function backupIntegrityLabel(status) {
  const normalized = String(status ?? '').trim().toLowerCase()
  return BACKUP_INTEGRITY_LABELS[normalized] ?? BACKUP_INTEGRITY_LABELS.unknown
}

function backupIntegrityClass(status) {
  const normalized = String(status ?? '').trim().toLowerCase()
  if (normalized === 'ok') {
    return 'is-ok'
  }
  if (normalized === 'warning') {
    return 'is-warning'
  }
  if (normalized === 'error') {
    return 'is-error'
  }
  return 'is-unknown'
}

function formatBytes(bytes) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) {
    return '-'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let number = value
  let unitIndex = 0
  while (number >= 1024 && unitIndex < units.length - 1) {
    number /= 1024
    unitIndex += 1
  }

  const precision = number >= 100 || unitIndex === 0 ? 0 : 1
  return `${number.toFixed(precision)} ${units[unitIndex]}`
}

function settingsCurrentOrgId() {
  return String(appState.session?.orgId ?? '').trim()
}

function settingsCurrentActor() {
  return (
    String(appState.session?.name ?? '').trim() ||
    String(appState.session?.login ?? '').trim() ||
    String(appState.session?.email ?? '').trim() ||
    '-'
  )
}

function settingsSetCreateNote(message = '', type = 'info') {
  const note = document.getElementById('bkCreateNote')
  if (!note) {
    return
  }

  const text = String(message ?? '').trim()
  note.className = 'backup-create-note'
  note.textContent = text

  if (!text) {
    return
  }

  if (type === 'success') {
    note.classList.add('is-success')
    return
  }
  if (type === 'error') {
    note.classList.add('is-error')
    return
  }
  note.classList.add('is-info')
}

function settingsSetAccessState() {
  const canManage = canManageBackupSettings()
  const backupTabButton = document.getElementById('settingsTabBackup')
  const backupSection = document.getElementById('settingsBackupSection')
  const backupMenuItem = document.querySelector('[data-route="settingsBackup"]')
  const styleMenuItem = document.querySelector('[data-route="settingsStyles"]')
  const denied = document.getElementById('backupAccessDenied')
  const panel = document.getElementById('backupAdminPanel')

  if (backupTabButton instanceof HTMLElement) {
    backupTabButton.style.display = canManage ? '' : 'none'
  }
  if (backupMenuItem instanceof HTMLElement) {
    backupMenuItem.style.display = canManage ? '' : 'none'
  }
  if (styleMenuItem instanceof HTMLElement) {
    styleMenuItem.style.display = ''
  }

  if (backupSection instanceof HTMLElement && appState.settingsActiveTab === SETTINGS_TAB_BACKUP && !canManage) {
    settingsSetActiveTab(SETTINGS_TAB_STYLES, { persist: false })
  }

  if (denied) {
    denied.style.display = canManage ? 'none' : ''
  }
  if (panel) {
    panel.style.display = canManage ? '' : 'none'
  }
}

function syncSettingsPermissions() {
  const settingsToggle = document.querySelector('[data-toggle="settings"]')
  const settingsSubmenu = document.getElementById('submenu-settings')
  const stylesItem = document.querySelector('[data-route="settingsStyles"]')
  const backupItem = document.querySelector('[data-route="settingsBackup"]')

  if (settingsToggle instanceof HTMLElement) {
    settingsToggle.style.display = ''
  }
  if (settingsSubmenu instanceof HTMLElement) {
    settingsSubmenu.style.display = ''
  }
  if (stylesItem instanceof HTMLElement) {
    stylesItem.style.display = ''
  }
  if (backupItem instanceof HTMLElement) {
    backupItem.style.display = ''
  }

  settingsSetAccessState()
}

function settingsResetImportState({ clearFile = true } = {}) {
  appState.settingsImportInspection = null
  if (clearFile) {
    const fileInput = document.getElementById('bkImportFile')
    if (fileInput instanceof HTMLInputElement) {
      fileInput.value = ''
    }
  }
}

function settingsRenderImportSummary() {
  const summaryNode = document.getElementById('bkImportSummary')
  const restoreButton = document.getElementById('bkImportRestoreBtn')
  if (!summaryNode) {
    return
  }

  const inspection = appState.settingsImportInspection
  const summary = inspection?.summary
  if (!summary) {
    summaryNode.textContent = 'Wybierz plik ZIP, aby zobaczyc podsumowanie i zakres nadpisania.'
    if (restoreButton instanceof HTMLButtonElement) {
      restoreButton.disabled = true
    }
    return
  }

  const modules = Array.isArray(summary.modules) ? summary.modules : []
  const modulesHtml = modules.length
    ? modules
        .map((moduleInfo) => {
          const moduleLabel = String(moduleInfo?.label ?? moduleInfo?.id ?? '-').trim() || '-'
          const records = Number(moduleInfo?.records ?? 0) || 0
          return `<li><strong>${escapeHtml(moduleLabel)}</strong> <span>${records}</span></li>`
        })
        .join('')
    : '<li><strong>Brak modulow</strong> <span>0</span></li>'

  const authUsers = Number(summary.authUsers ?? 0) || 0
  const schemaVersion = String(summary.schemaVersion ?? '').trim() || '-'

  summaryNode.innerHTML = `
    <div class="backup-import-card">
      <div class="backup-import-grid">
        <div><span>Tytul</span><strong>${escapeHtml(String(summary.title ?? '-'))}</strong></div>
        <div><span>Typ</span><strong>${escapeHtml(String(summary.typeLabel ?? backupTypeLabel(summary.type)))}</strong></div>
        <div><span>Data</span><strong>${escapeHtml(String(summary.createdAtLabel ?? '-'))}</strong></div>
        <div><span>Autor</span><strong>${escapeHtml(String(summary.createdBy ?? '-'))}</strong></div>
        <div><span>OrgId</span><strong>${escapeHtml(String(summary.orgId ?? '-'))}</strong></div>
        <div><span>Schema</span><strong>${escapeHtml(schemaVersion)}</strong></div>
      </div>
      <div class="backup-import-modules">
        <div class="backup-import-modules-title">Zakres nadpisania</div>
        <ul>${modulesHtml}</ul>
      </div>
      <div class="backup-import-auth">Auth snapshot (pelna kopia): <strong>${authUsers}</strong></div>
    </div>
  `

  if (restoreButton instanceof HTMLButtonElement) {
    restoreButton.disabled = false
  }
}

function settingsRenderBackupRows(rows = appState.settingsBackups) {
  const tbody = document.getElementById('bkRows')
  if (!tbody) {
    return
  }

  const list = Array.isArray(rows) ? rows : []
  if (!list.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="muted">Brak kopii zapasowych dla tej organizacji.</td>
      </tr>
    `
    return
  }

  tbody.innerHTML = list
    .map((item) => {
      const id = String(item?.id ?? '').trim()
      const integrityStatus = String(item?.integrityStatus ?? 'unknown')
      const integrityClass = backupIntegrityClass(integrityStatus)
      const integrityLabel = backupIntegrityLabel(integrityStatus)
      const integrityMessage = String(item?.integrityMessage ?? '').trim()
      const title = String(item?.title ?? '').trim() || backupTypeLabel(item?.type)

      return `
        <tr>
          <td>${escapeHtml(String(item?.createdAtLabel ?? '-'))}</td>
          <td>${escapeHtml(backupTypeLabel(item?.type))}</td>
          <td>${escapeHtml(title)}</td>
          <td>${escapeHtml(formatBytes(item?.sizeBytes))}</td>
          <td>${escapeHtml(String(item?.createdBy ?? '-'))}</td>
          <td>
            <span class="backup-integrity ${integrityClass}" title="${escapeHtml(integrityMessage || integrityLabel)}">
              ${escapeHtml(integrityLabel)}
            </span>
          </td>
          <td>${escapeHtml(backupSourceLabel(item?.source))}</td>
          <td>
            <div class="backup-row-actions">
              <button class="btn2" type="button" data-bk-action="download" data-bk-id="${escapeHtml(id)}">Pobierz</button>
              <button class="btn2" type="button" data-bk-action="restore" data-bk-id="${escapeHtml(id)}">Przywroc</button>
              <button class="btn2 danger" type="button" data-bk-action="delete" data-bk-id="${escapeHtml(id)}">Usun</button>
            </div>
          </td>
        </tr>
      `
    })
    .join('')
}

async function settingsEnsureAutomation() {
  if (!canManageBackupSettings()) {
    return
  }

  const orgId = settingsCurrentOrgId()
  if (!orgId) {
    return
  }

  const dayKey = `${orgId}:${todayYmd()}`
  if (appState.settingsAutomationDayKey === dayKey) {
    return
  }

  await ensureBackupAutomation({
    orgId,
    createdBy: settingsCurrentActor() || 'system',
  })
  appState.settingsAutomationDayKey = dayKey
}

async function settingsLoadBackups({ runAutomation = true } = {}) {
  const tbody = document.getElementById('bkRows')
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="muted">Ladowanie listy backupow...</td>
      </tr>
    `
  }

  settingsSetAccessState()
  if (!canManageBackupSettings()) {
    appState.settingsBackups = []
    settingsRenderBackupRows([])
    return
  }

  const orgId = settingsCurrentOrgId()
  if (!orgId) {
    appState.settingsBackups = []
    settingsRenderBackupRows([])
    return
  }

  if (runAutomation) {
    await settingsEnsureAutomation()
  }

  const rows = await listBackups(orgId)
  appState.settingsBackups = rows
  settingsRenderBackupRows(rows)
}

async function settingsCreateBackup() {
  if (!canManageBackupSettings()) {
    showTransientNotice('Brak uprawnien do tworzenia backupu.', 'error')
    return
  }

  const orgId = settingsCurrentOrgId()
  if (!orgId) {
    showTransientNotice('Brak orgId w sesji.', 'error')
    return
  }

  const titleInput = document.getElementById('bkTitle')
  const typeInput = document.getElementById('bkType')
  const createButton = document.getElementById('bkCreateBtn')
  const title = String(titleInput?.value ?? '').trim()
  const type = String(typeInput?.value ?? 'full').trim().toLowerCase()

  if (!title) {
    showTransientNotice('Wpisz tytul kopii.', 'error')
    titleInput?.focus?.()
    return
  }

  if (createButton instanceof HTMLButtonElement) {
    createButton.disabled = true
    createButton.textContent = 'Tworzenie...'
  }
  settingsSetCreateNote('Tworzenie backupu w toku...', 'info')

  try {
    const created = await createBackup({
      orgId,
      type,
      title,
      createdBy: settingsCurrentActor(),
      source: 'manual',
    })
    settingsSetCreateNote(`Utworzono: ${created.fileName} (${formatBytes(created.sizeBytes)}).`, 'success')
    showTransientNotice('Backup ZIP zostal utworzony.')
    await settingsLoadBackups({ runAutomation: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Nie udalo sie utworzyc backupu.'
    settingsSetCreateNote(message, 'error')
    showTransientNotice(message, 'error')
  } finally {
    if (createButton instanceof HTMLButtonElement) {
      createButton.disabled = false
      createButton.textContent = 'Utworz backup ZIP'
    }
  }
}

async function settingsInspectImportFile() {
  if (!canManageBackupSettings()) {
    showTransientNotice('Brak uprawnien do importu backupu.', 'error')
    return
  }

  const input = document.getElementById('bkImportFile')
  const inspectButton = document.getElementById('bkInspectBtn')
  const file = input instanceof HTMLInputElement ? input.files?.[0] : null
  if (!file) {
    showTransientNotice('Wybierz plik ZIP do sprawdzenia.', 'error')
    return
  }

  if (inspectButton instanceof HTMLButtonElement) {
    inspectButton.disabled = true
    inspectButton.textContent = 'Sprawdzanie...'
  }

  try {
    const inspection = await inspectBackupFile(file)
    appState.settingsImportInspection = inspection
    settingsRenderImportSummary()
    showTransientNotice('Plik backupu jest poprawny.')
  } catch (error) {
    appState.settingsImportInspection = null
    settingsRenderImportSummary()
    const message = error instanceof Error ? error.message : 'Niepoprawny plik backupu.'
    showTransientNotice(message, 'error')
  } finally {
    if (inspectButton instanceof HTMLButtonElement) {
      inspectButton.disabled = false
      inspectButton.textContent = 'Sprawdz plik'
    }
  }
}

async function settingsRestoreFromFile() {
  if (!canManageBackupSettings()) {
    showTransientNotice('Brak uprawnien do przywracania backupu.', 'error')
    return
  }

  const orgId = settingsCurrentOrgId()
  if (!orgId) {
    showTransientNotice('Brak orgId w sesji.', 'error')
    return
  }

  const input = document.getElementById('bkImportFile')
  const restoreButton = document.getElementById('bkImportRestoreBtn')
  const file = input instanceof HTMLInputElement ? input.files?.[0] : null
  if (!file) {
    showTransientNotice('Wybierz plik ZIP do przywrocenia.', 'error')
    return
  }

  if (!appState.settingsImportInspection) {
    await settingsInspectImportFile()
  }

  const summary = appState.settingsImportInspection?.summary
  if (!summary) {
    showTransientNotice('Najpierw sprawdz plik ZIP.', 'error')
    return
  }

  const confirmRestore = window.confirm(
    `Przywrocic backup "${summary.title}" (${summary.typeLabel})?\n` +
      'Zakres zostanie nadpisany.\n' +
      'System utworzy automatyczny punkt pre-restore przed operacja.',
  )
  if (!confirmRestore) {
    return
  }

  if (restoreButton instanceof HTMLButtonElement) {
    restoreButton.disabled = true
    restoreButton.textContent = 'Przywracanie...'
  }

  try {
    const restored = await restoreBackupFromFile({
      orgId,
      file,
      restoredBy: settingsCurrentActor(),
    })
    settingsResetImportState()
    settingsRenderImportSummary()
    await settingsLoadBackups({ runAutomation: false })

    const modulesCount = Array.isArray(restored?.moduleResults) ? restored.moduleResults.length : 0
    showTransientNotice(`Przywracanie zakonczone. Moduly: ${modulesCount}.`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Nie udalo sie przywrocic backupu.'
    showTransientNotice(message, 'error')
  } finally {
    if (restoreButton instanceof HTMLButtonElement) {
      restoreButton.disabled = false
      restoreButton.textContent = 'Przywroc z pliku'
    }
  }
}

async function settingsDownloadBackup(backupId) {
  const orgId = settingsCurrentOrgId()
  if (!orgId) {
    return
  }

  const payload = await getBackupDownload({ orgId, backupId })
  const objectUrl = URL.createObjectURL(payload.blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = String(payload.fileName ?? 'backup.zip')
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl)
  }, 1500)
}

async function settingsRestoreBackup(backupId) {
  if (!canManageBackupSettings()) {
    showTransientNotice('Brak uprawnien do przywracania backupu.', 'error')
    return
  }

  const orgId = settingsCurrentOrgId()
  if (!orgId) {
    showTransientNotice('Brak orgId w sesji.', 'error')
    return
  }

  const item = appState.settingsBackups.find((row) => String(row?.id ?? '') === String(backupId ?? ''))
  const label = String(item?.title ?? '').trim() || backupId
  const confirmed = window.confirm(
    `Przywrocic backup "${label}"?\n` + 'Zakres danych zostanie nadpisany.\nSystem utworzy pre-restore przed operacja.',
  )
  if (!confirmed) {
    return
  }

  await restoreBackupById({
    orgId,
    backupId,
    restoredBy: settingsCurrentActor(),
  })
  await settingsLoadBackups({ runAutomation: false })
  showTransientNotice('Backup zostal przywrocony.')
}

async function settingsDeleteBackup(backupId) {
  if (!canManageBackupSettings()) {
    showTransientNotice('Brak uprawnien do usuwania backupow.', 'error')
    return
  }

  const orgId = settingsCurrentOrgId()
  if (!orgId) {
    showTransientNotice('Brak orgId w sesji.', 'error')
    return
  }

  const item = appState.settingsBackups.find((row) => String(row?.id ?? '') === String(backupId ?? ''))
  const label = String(item?.title ?? '').trim() || backupId
  const confirmed = window.confirm(`Usunac backup "${label}"? Operacja jest nieodwracalna.`)
  if (!confirmed) {
    return
  }

  await deleteBackup({ orgId, backupId })
  appState.settingsBackups = appState.settingsBackups.filter((row) => String(row?.id ?? '') !== String(backupId ?? ''))
  settingsRenderBackupRows(appState.settingsBackups)
  showTransientNotice('Backup zostal usuniety.')
}

async function settingsRollbackToPreRestore() {
  if (!canManageBackupSettings()) {
    showTransientNotice('Brak uprawnien do rollbacku.', 'error')
    return
  }

  const orgId = settingsCurrentOrgId()
  if (!orgId) {
    showTransientNotice('Brak orgId w sesji.', 'error')
    return
  }

  const confirmed = window.confirm('Przywrocic ostatni punkt pre-restore?')
  if (!confirmed) {
    return
  }

  await restoreLatestPreRestore({
    orgId,
    restoredBy: settingsCurrentActor(),
  })
  await settingsLoadBackups({ runAutomation: false })
  showTransientNotice('Przywrocono poprzednia wersje (pre-restore).')
}

function mountViewsFromTemplates() {
  Object.entries(viewTemplates).forEach(([route, html]) => {
    const viewId = route === 'clientsList' ? 'view-clientsList' : `view-${route}`
    const section = document.getElementById(viewId)

    if (section) {
      section.innerHTML = html
    }
  })
}

function setUserChip(session) {
  const userName = document.getElementById('userName')
  const userDot = document.getElementById('userDot')

  if (userName) {
    userName.textContent = session?.name ?? '-'
  }

  if (userDot) {
    userDot.style.opacity = session ? '1' : '0.25'
  }
}

function showLoginScreen() {
  const loginScreen = document.getElementById('loginScreen')
  const portalRoot = document.getElementById('portalRoot')

  if (portalRoot) {
    portalRoot.style.display = 'none'
  }

  if (loginScreen) {
    loginScreen.style.display = 'flex'
  }
}

function showPortal() {
  const loginScreen = document.getElementById('loginScreen')
  const portalRoot = document.getElementById('portalRoot')

  if (loginScreen) {
    loginScreen.style.display = 'none'
  }

  if (portalRoot) {
    portalRoot.style.display = ''
    portalRoot.style.removeProperty('display')
  }
}

function setLoginError(message = '') {
  const errorNode = document.getElementById('loginErr')
  if (!errorNode) {
    return
  }

  errorNode.textContent = message
  errorNode.style.display = message ? 'block' : 'none'
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

function renderDashboardEvents(rows) {
  const eventsList = document.getElementById('dashEventsList')
  const eventsPill = document.getElementById('dashEventsPill')
  appState.dashboardTodayRows = Array.isArray(rows) ? [...rows] : []
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

  eventsList.innerHTML = rows
    .map(
      (row, rowIndex) => {
        const startValue = dashboardClockLabelToHm(row.qrStart, '--:--')
        const stopValue = row?.isRunning ? '--:--' : dashboardClockLabelToHm(row.qrStop, '--:--')
        const workValue = dashboardDurationLabelToHm(row.duration, '00:00')
        const lateMinutes = Number(row?.lateMinutes ?? 0)
        const lateValue = dashboardLateMinutesToHm(lateMinutes)
        const workerName = String(row.workerName ?? '').trim() || '-'
        const workerLogin = String(row.workerLogin ?? row.id ?? '').trim()
        const clientLabel = dashboardResolveClientLabel(row)
        const zoneLabel = String(row.activeZone ?? '').trim() || '-'
        const workerCell = workerName === '-'
          ? `<span>${escapeHtml(workerName)}</span>`
          : `<button class="dash-worker-link" type="button" data-dash-worker-login="${escapeHtml(workerLogin)}" data-dash-worker-name="${escapeHtml(workerName)}">${escapeHtml(workerName)}</button>`
        const clientCell = clientLabel === '-'
          ? '<span class="muted">-</span>'
          : `<button class="dash-entity-link" type="button" data-dash-history-kind="objects" data-dash-row-index="${rowIndex}">${escapeHtml(clientLabel)}</button>`
        const zoneCell = zoneLabel === '-'
          ? '<span class="muted">-</span>'
          : `<button class="dash-entity-link" type="button" data-dash-history-kind="zones" data-dash-row-index="${rowIndex}">${zoneNameWithQrHtml(zoneLabel, row)}</button>`
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

function dashboardScheduleShiftText(startRaw, taskRaw) {
  const start = String(startRaw ?? '').trim()
  const task = String(taskRaw ?? '').trim()
  if (start && task) {
    return `${start} ${task}`
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

function dashboardWorkerAliasKeys(workerName, workerLogin = '', workerId = '', options = {}) {
  const keys = new Set()
  const includeLooseNameKeys = options?.includeLooseNameKeys !== false
  const addNameKeys = (value) => {
    const normalizedName = normalizeSearchText(value).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
    if (!normalizedName) {
      return
    }

    keys.add(`n:${normalizedName}`)
    const tokens = normalizedName.split(' ').filter(Boolean)
    if (!tokens.length) {
      return
    }
    if (tokens.length > 1) {
      keys.add(`n:${tokens.slice().reverse().join(' ')}`)
    }

    if (includeLooseNameKeys || tokens.length === 1) {
      keys.add(`f:${tokens[0]}`)
    }
    if (tokens.length > 1 && tokens[1]) {
      const first = tokens[0]
      const second = tokens[1]
      const firstInitial = first.charAt(0)
      const secondInitial = second.charAt(0)
      keys.add(`fi:${first}|${secondInitial}`)
      // Pair of initials helps matching sheet aliases like "Iza P." <-> "Izabela Pluta".
      if (firstInitial && secondInitial) {
        keys.add(`ii:${firstInitial}|${secondInitial}`)
      }
      if (second.length >= 2) {
        keys.add(`fp2:${first}|${second.slice(0, 2)}`)
      }
      if (second.length >= 3) {
        keys.add(`fp3:${first}|${second.slice(0, 3)}`)
      }
      const firstStem = first.slice(0, 4)
      if (firstStem.length >= 4) {
        keys.add(`fsi:${firstStem}|${secondInitial}`)
      }
    }
  }

  addNameKeys(workerName)

  const rawLogin = String(workerLogin ?? '').trim()
  const normalizedLogin = normalizeSearchText(rawLogin)
  if (normalizedLogin) {
    keys.add(`l:${normalizedLogin}`)
  }

  const loginLocalPart = String(rawLogin.split('@')[0] ?? '').trim()
  const normalizedLocalPart = normalizeSearchText(loginLocalPart)
  if (normalizedLocalPart) {
    keys.add(`l:${normalizedLocalPart}`)
    addNameKeys(loginLocalPart)
  }

  const normalizedId = normalizeSearchText(workerId)
  if (normalizedId) {
    keys.add(`id:${normalizedId}`)
  }

  return keys
}

function dashboardResolveWorkerByScheduleAlias(entry, workers = []) {
  const pool = Array.isArray(workers) ? workers : []
  if (!pool.length) {
    return null
  }

  const entryName = normalizeSearchText(entry?.workerName).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!entryName) {
    return null
  }

  const entryTokens = entryName.split(' ').filter(Boolean)
  if (!entryTokens.length) {
    return null
  }

  const exact = pool.find((worker) => {
    const workerName = normalizeSearchText(worker?.workerName ?? worker?.name)
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return workerName && workerName === entryName
  })
  if (exact) {
    return exact
  }

  const firstEntry = entryTokens[0]
  const secondEntry = entryTokens[1] ?? ''
  const firstInitial = firstEntry.charAt(0)
  const secondInitial = secondEntry.charAt(0)

  const initialsCandidates = pool.filter((worker) => {
    const workerName = normalizeSearchText(worker?.workerName ?? worker?.name)
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const workerTokens = workerName.split(' ').filter(Boolean)
    if (!workerTokens.length) {
      return false
    }
    const workerFirst = workerTokens[0]
    const workerSecond = workerTokens[1] ?? ''
    if (!workerFirst || !workerSecond) {
      return false
    }
    return workerFirst.charAt(0) === firstInitial && workerSecond.charAt(0) === secondInitial
  })

  if (initialsCandidates.length === 1) {
    return initialsCandidates[0]
  }

  if (initialsCandidates.length > 1) {
    const narrowed = initialsCandidates.filter((worker) => {
      const workerName = normalizeSearchText(worker?.workerName ?? worker?.name)
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      const workerTokens = workerName.split(' ').filter(Boolean)
      const workerFirst = workerTokens[0] ?? ''
      if (!workerFirst) {
        return false
      }

      if (workerFirst.startsWith(firstEntry)) {
        return true
      }

      const entryStem = firstEntry.slice(0, 3)
      const workerStem = workerFirst.slice(0, 3)
      return entryStem.length >= 3 && workerStem.length >= 3 && entryStem === workerStem
    })

    if (narrowed.length === 1) {
      return narrowed[0]
    }
  }

  return null
}

function dashboardNormalizeWorkerIdDigits(value) {
  const normalized = normalizeSearchText(value)
  if (!normalized) {
    return ''
  }
  return normalized.replace(/[^0-9]/g, '').replace(/^0+/, '')
}

function dashboardCanonicalWorkerId(value) {
  const raw = String(value ?? '').trim().toUpperCase()
  return /^W\d+$/.test(raw) ? raw : ''
}

function dashboardResolveWorkerIdValue(row, workersPool = []) {
  const direct = dashboardCanonicalWorkerId(row?.workerId ?? row?.id)
  if (direct) {
    return direct
  }

  const workers = Array.isArray(workersPool) ? workersPool : []
  if (!workers.length) {
    return ''
  }

  const rowLoginKey = normalizeSearchText(row?.workerLogin ?? row?.login)
  if (rowLoginKey) {
    const matchByLogin = workers.find((worker) => {
      const workerLoginKey = normalizeSearchText(worker?.workerLogin ?? worker?.login ?? worker?.id)
      return Boolean(workerLoginKey) && workerLoginKey === rowLoginKey
    })
    const byLoginId = dashboardCanonicalWorkerId(matchByLogin?.workerId ?? matchByLogin?.id)
    if (byLoginId) {
      return byLoginId
    }
  }

  const rowNameKey = normalizeSearchText(row?.workerName ?? row?.name)
  if (rowNameKey) {
    const matchesByName = workers.filter((worker) => {
      const workerNameKey = normalizeSearchText(worker?.workerName ?? worker?.name)
      return Boolean(workerNameKey) && workerNameKey === rowNameKey
    })
    if (matchesByName.length === 1) {
      const byNameId = dashboardCanonicalWorkerId(matchesByName[0]?.workerId ?? matchesByName[0]?.id)
      if (byNameId) {
        return byNameId
      }
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
    const idDigits = dashboardNormalizeWorkerIdDigits(resolvedWorkerId)
    if (idDigits) {
      upsertState(`idn:${idDigits}`, row)
    }
  })

  // Fallback for schedule colors: include all today's source rows (events/workdays),
  // so workers who already started and then closed are still recognized as "started today".
  sourceRows.forEach((row) => {
    if (dashboardResolveDayKey(row) !== normalizedDayKey) {
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
    const idDigits = dashboardNormalizeWorkerIdDigits(resolvedWorkerId)
    if (idDigits) {
      upsertState(`idn:${idDigits}`, rowLike)
    }
  })

  return stateMap
}

function dashboardResolveScheduleWorkerAliasKeys(entry) {
  const keySet = new Set()
  const addKeys = (keys) => {
    if (!(keys instanceof Set)) {
      return
    }
    keys.forEach((key) => {
      if (key) {
        keySet.add(String(key))
      }
    })
  }

  addKeys(
    dashboardWorkerAliasKeys(
      entry?.workerName,
      entry?.workerLogin ?? entry?.workerId ?? '',
      entry?.workerId ?? '',
      { includeLooseNameKeys: false },
    ),
  )

  const workers = Array.isArray(appState.workers) ? appState.workers : []
  if (!workers.length) {
    return keySet
  }

  const linkedWorker =
    dashboardResolveWorkerById(entry?.workerId, workers) ?? dashboardResolveWorkerByScheduleAlias(entry, workers)
  if (!linkedWorker) {
    return keySet
  }

  addKeys(
    dashboardWorkerAliasKeys(
      linkedWorker?.workerName ?? linkedWorker?.name,
      linkedWorker?.workerLogin ?? linkedWorker?.login ?? linkedWorker?.id,
      linkedWorker?.workerId ?? linkedWorker?.id,
      { includeLooseNameKeys: false },
    ),
  )

  return keySet
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
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(normalizedDayKey) ||
    !entries.length ||
    appState.currentRoute !== 'dashboard' ||
    document.visibilityState !== 'visible'
  ) {
    appState.dashboardScheduleLatePendingKeys = []
    dashboardHideScheduleLateStartAlert()
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
    appState.dashboardScheduleLatePendingKeys = []
    dashboardHideScheduleLateStartAlert()
    return
  }

  // Priorytet: najpierw popup o braku START, dopiero potem popup informacyjny o spóźnieniu.
  if (document.getElementById('dashScheduleMissingAlert')) {
    dashboardHideScheduleLateStartAlert()
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
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(normalizedDayKey) ||
    !entries.length ||
    appState.currentRoute !== 'dashboard' ||
    document.visibilityState !== 'visible'
  ) {
    dashboardHideScheduleMissingStartAlert()
    if (!entries.length) {
      appState.dashboardScheduleAlertLastKey = ''
    }
    return
  }

  if (appState.dashboardScheduleAlertMuted) {
    return
  }

  const now = Date.now()
  if (Number(appState.dashboardScheduleAlertSnoozeUntil ?? 0) > now) {
    return
  }

  const signature = entries
    .map((entry) => normalizeSearchText(entry?.workerName))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, 'pl', { sensitivity: 'base' }))
    .join('|')
  if (!signature) {
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
        dashboardHideScheduleMissingStartAlert()
        return
      }

      if (action === 'mute') {
        appState.dashboardScheduleAlertMuted = true
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

  const cards = [...cardsRoot.querySelectorAll('.dash-schedule-card')].filter((node) => node instanceof HTMLElement)
  if (!cards.length) {
    cardsRoot.style.removeProperty('max-height')
    return
  }

  const visibleCount = Math.min(DASHBOARD_SCHEDULE_VISIBLE_WORKERS, cards.length)
  const styles = window.getComputedStyle(cardsRoot)
  const rowGap = Math.max(0, Number.parseFloat(styles.rowGap || styles.gap || '0') || 0)

  let height = 0
  for (let index = 0; index < visibleCount; index += 1) {
    const card = cards[index]
    const cardHeight = Math.max(0, Math.ceil(card.getBoundingClientRect().height || card.offsetHeight || 0))
    height += cardHeight
    if (index > 0) {
      height += rowGap
    }
  }

  cardsRoot.style.maxHeight = `${Math.max(120, Math.ceil(height) + 2)}px`
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

  const enrichedEntries = entries
    .map((entry) => {
      const linkedWorkerById = dashboardResolveWorkerById(entry?.workerId, workersPool)
      const linkedWorkerForLabel = linkedWorkerById ?? dashboardResolveWorkerByScheduleAlias(entry, workersPool)
      const workerName = dashboardScheduleWorkerDisplayName(
        linkedWorkerForLabel?.workerName ?? linkedWorkerForLabel?.name ?? entry?.workerName ?? entry?.workerId,
      )
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
      const activeIdDigits = dashboardNormalizeWorkerIdDigits(activeIdSource)
      const todayState =
        (activeIdKey ? todayWorkerStateMap.get(`id:${activeIdKey}`) : null) ||
        (activeIdDigits ? todayWorkerStateMap.get(`idn:${activeIdDigits}`) : null) ||
        null

      const actualStartMinutes = Number(todayState?.startMinutes ?? -1)
      const hasQrStartAny = Boolean(todayState?.hasStart) && actualStartMinutes >= 0
      const hasQrStartActive = hasQrStartAny
      const lateMinutes =
        hasQrStartAny && hasScheduleStart && actualStartMinutes > startMinutes
          ? Math.max(1, actualStartMinutes - startMinutes)
          : 0
      const minutesToStart = hasScheduleStart ? Math.floor((startTs - nowTs) / (60 * 1000)) : null
      const isUpcomingSoon =
        !hasQrStartAny &&
        status === 'Praca' &&
        hasScheduleStart &&
        Number.isFinite(minutesToStart) &&
        minutesToStart >= 0 &&
        minutesToStart <= DASHBOARD_SCHEDULE_SOON_WINDOW_MINUTES
      const isMissingStart =
        !hasQrStartAny &&
        status === 'Praca' &&
        hasScheduleStart &&
        Number.isFinite(minutesToStart) &&
        minutesToStart < 0
      const isLaterToday =
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
        workerName,
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
        isMissingStart,
        priority,
        toneClass,
      }
    })
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
        >${escapeHtml(entry.workerName)}</button>
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
  const missingStartEntries = enrichedEntries.filter((entry) => entry.isMissingStart)
  dashboardShowScheduleMissingStartAlert(dayKey, missingStartEntries)
  const lateStartedEntries = enrichedEntries.filter((entry) => entry.hasQrStartAny && Number(entry.lateMinutes) > 0)
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
    const isLoading = Boolean(appState.dashboardScheduleLoading)
    const errorMessage = String(appState.dashboardScheduleError ?? '').trim()
    if (dayNameNode) dayNameNode.textContent = isLoading ? 'Ładowanie' : 'Brak danych'
    if (dayDateNode) dayDateNode.textContent = '-'
    if (syncNode) {
      syncNode.textContent = isLoading
        ? 'Pobieranie grafiku...'
        : errorMessage
          ? `Nie udało się pobrać grafiku: ${errorMessage}`
          : 'Ostatnia synchronizacja: -'
    }
    if (prevButton) prevButton.disabled = true
    if (nextButton) nextButton.disabled = true
    dashboardRenderScheduleCards(null)
    return
  }

  const todayKey = todayYmd()
  const selectedExists = days.some((day) => day.key === appState.dashboardScheduleSelectedDay)
  if (!selectedExists) {
    const todayBucket = days.find((day) => day.key === todayKey)
    appState.dashboardScheduleSelectedDay = String(todayBucket?.key ?? dashboardPickNearestScheduleDayKey(days, todayKey))
  }

  const currentIndex = Math.max(
    0,
    days.findIndex((day) => day.key === appState.dashboardScheduleSelectedDay),
  )
  const bucket = days[currentIndex] ?? days[0]
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

  if (prevButton) prevButton.disabled = currentIndex <= 0
  if (nextButton) nextButton.disabled = currentIndex >= days.length - 1

  dashboardRenderScheduleCards(bucket)
}

function dashboardMoveScheduleDay(offset = 0) {
  const days = Array.isArray(appState.dashboardScheduleDays) ? appState.dashboardScheduleDays : []
  if (!days.length) {
    return
  }

  const currentIndex = Math.max(
    0,
    days.findIndex((day) => day.key === appState.dashboardScheduleSelectedDay),
  )
  const nextIndex = Math.min(days.length - 1, Math.max(0, currentIndex + Number(offset || 0)))
  appState.dashboardScheduleSelectedDay = String(days[nextIndex]?.key ?? appState.dashboardScheduleSelectedDay)
  renderDashboardSchedulePanel()
}

function syncDashboardSidePanelHeight() {
  const panel = document.querySelector('#view-dashboard .dash-side-panel')
  if (!(panel instanceof HTMLElement)) {
    return
  }

  if (window.matchMedia('(max-width: 1240px)').matches) {
    panel.style.removeProperty('--dash-side-target-height')
    return
  }

  const rectTop = panel.getBoundingClientRect().top
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0
  if (!(viewportHeight > 0)) {
    return
  }

  const bottomGap = 14
  const viewportTarget = Math.max(640, Math.floor(viewportHeight - rectTop - bottomGap))
  let targetHeight = viewportTarget
  const activityPanel = document.querySelector('#view-dashboard .dash-activity-panel')
  if (activityPanel instanceof HTMLElement) {
    const activityBottom = activityPanel.getBoundingClientRect().bottom
    const columnTarget = Math.floor(activityBottom - rectTop)
    if (Number.isFinite(columnTarget) && columnTarget > 520) {
      targetHeight = Math.max(640, Math.min(1400, columnTarget))
    }
  }
  panel.style.setProperty('--dash-side-target-height', `${targetHeight}px`)
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
  const keys = dashboardWorkerAliasKeys(
    row?.workerName ?? row?.name,
    row?.workerLogin ?? row?.login ?? row?.workerId ?? row?.id,
    row?.workerId ?? row?.id,
    { includeLooseNameKeys: false },
  )

  const workers = Array.isArray(appState.workers) ? appState.workers : []
  if (!workers.length) {
    return keys
  }

  const rowLoginKey = normalizeSearchText(row?.workerLogin ?? row?.login ?? row?.id)
  const rowIdKey = normalizeSearchText(row?.workerId ?? row?.id)
  const rowNameKey = normalizeSearchText(row?.workerName ?? row?.name)
  const linkedWorker = workers.find((worker) => {
    const workerLoginKey = normalizeSearchText(worker?.workerLogin ?? worker?.login ?? worker?.id)
    const workerIdKey = normalizeSearchText(worker?.workerId ?? worker?.id)
    const workerNameKey = normalizeSearchText(worker?.workerName ?? worker?.name)
    return (
      (rowLoginKey && workerLoginKey && rowLoginKey === workerLoginKey) ||
      (rowIdKey && workerIdKey && rowIdKey === workerIdKey) ||
      (rowNameKey && workerNameKey && rowNameKey === workerNameKey)
    )
  })

  if (linkedWorker) {
    dashboardWorkerAliasKeys(
      linkedWorker?.workerName ?? linkedWorker?.name,
      linkedWorker?.workerLogin ?? linkedWorker?.login ?? linkedWorker?.id,
      linkedWorker?.workerId ?? linkedWorker?.id,
      { includeLooseNameKeys: false },
    ).forEach((key) => {
      if (key) {
        keys.add(String(key))
      }
    })
  }

  return keys
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
    if (worker?.active === false) {
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

function dashboardBuildSummary(todayRows = [], eventRows = [], periodHourValues = {}) {
  const today = todayYmd()
  const yesterday = daysAgoYmd(1)
  const normalizedTodayRows = Array.isArray(todayRows) ? todayRows : []
  const normalizedEventRows = Array.isArray(eventRows) ? eventRows : []

  const activeNowRows = normalizedTodayRows.filter((row) => Boolean(row?.isRunning))
  const finishedRows = normalizedTodayRows.filter((row) => {
    const stopValue = String(row?.qrStop ?? '').trim()
    const hasStop = Boolean(stopValue) && stopValue !== '--:--:--' && stopValue !== '-:-:-' && stopValue !== '-'
    return !row?.isRunning && hasStop
  })
  const totalTodaySec = normalizedTodayRows.reduce((sum, row) => sum + dashboardParseDurationLabelToSeconds(row?.duration), 0)

  const table1Details = {
    activeNow: activeNowRows.map((row) => ({
      title: dashboardResolveWorkerLabel(row),
      subtitle: `START: ${dashboardClockLabelToHm(row?.qrStart, '--:--')} · Klient: ${dashboardResolveClientLabel(row)} · Strefa: ${dashboardResolveZoneLabel(row)}`,
      tab: 'workers',
      row: dashboardBuildHistoryRow(row, today),
    })),
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

  const historicalRows = normalizedEventRows.filter((row) => {
    const dayKey = dashboardResolveDayKey(row)
    return Boolean(dayKey) && dayKey < today
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

  const openStartStopYesterdayIssues = []
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
      const probe = runningRows[0]
      openStartStopYesterdayIssues.push({
        title: bucket.workerName || dashboardResolveWorkerLabel(probe),
        subtitle: `Data: ${formatDatePl(`${bucket.dayKey}T00:00:00.000Z`)} · Klient: ${dashboardResolveClientLabel(probe)} · Strefa: ${dashboardResolveZoneLabel(probe)}`,
        tab: 'workers',
        row: dashboardBuildHistoryRow(
          {
            ...probe,
            workerLogin: bucket.workerLogin || probe?.workerLogin,
            workerName: bucket.workerName || probe?.workerName,
          },
          bucket.dayKey,
        ),
      })
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

  const trackedDays = new Set([today, yesterday])
  const cleanTooLongRows = normalizedEventRows
    .filter((row) => trackedDays.has(dashboardResolveDayKey(row)))
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
      activeNow: activeNowRows.length,
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
      calendarTaskIsVisibleForCurrentUser(task)
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
  overlay.style.display = active ? 'grid' : 'none'
  overlay.setAttribute('aria-busy', active ? 'true' : 'false')
  overlay.setAttribute('aria-hidden', active ? 'false' : 'true')
  view?.classList.toggle('is-loading', active)
  if (active) {
    view?.setAttribute('data-dashboard-loading', 'true')
    if (view && !view.getAttribute('data-dashboard-stage')) {
      dashboardSetLoadingStage('start')
    }
  } else {
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
  }, 120)
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

  let top = anchorRect.bottom + 8
  if (top + popoverRect.height > window.innerHeight - 10) {
    top = Math.max(10, anchorRect.top - popoverRect.height - 8)
  }

  popover.style.left = `${Math.round(left)}px`
  popover.style.top = `${Math.round(top)}px`
  popover.style.visibility = 'visible'
}

async function openDashboardMetricDetail(metricKey, detailIndex) {
  const details = dashboardMetricDetailsOrEmpty(metricKey)
  const detail = details[Number(detailIndex)]
  if (!detail) {
    return
  }

  dashboardHideMetricPopover()
  const row = detail?.row ?? {}
  const tab = String(detail?.tab ?? '').trim() || 'workers'
  await openEventHistoryFromRow(row, tab)
}

function setSubwelcomeMetric(selector, count) {
  const node = document.querySelector(selector)
  if (!node) {
    return
  }

  if (!node.dataset.baseText) {
    node.dataset.baseText = node.textContent
  }

  node.textContent = `${node.dataset.baseText} ${getDataSourceLabel()} rekordy: ${count}.`
}

function renderClientsTable(rows) {
  const tbody = document.getElementById('clientsBody')
  if (!tbody) {
    return
  }

  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:40px; color:#64748b;">Brak klientów do wyświetlenia.</td>
      </tr>
    `
    return
  }

  tbody.innerHTML = rows
    .map((client) => {
      const status = normalizeClientStatus(client.status)
      const badgeClass = statusBadgeClass(status)
      const nip = client.nip ?? '-'
      const city = client.city ?? '-'
      const coordinator = client.coordinator ?? '-'
      const canManage = canManageClients()

      const actions = canManage
        ? `
            <button class="btn2" type="button" data-client-action="edit" data-client-id="${escapeHtml(client.id)}">Edytuj</button>
          `
        : `<button class="btn2" type="button" data-client-action="view" data-client-id="${escapeHtml(client.id)}">Podgląd</button>`

      return `
        <tr>
          <td>${escapeHtml(client.id)}</td>
          <td>${escapeHtml(client.name)}</td>
          <td>${escapeHtml(nip)}</td>
          <td>${escapeHtml(city)}</td>
          <td><span class="${badgeClass}">${escapeHtml(status)}</span></td>
          <td>${escapeHtml(coordinator)}</td>
          <td style="text-align:right; white-space:nowrap;">${actions}</td>
        </tr>
      `
    })
    .join('')
}

function getFilteredClients() {
  const searchInput = document.getElementById('clSearchInput')
  const statusSelect = document.getElementById('clSearchStatus')

  const search = String(searchInput?.value ?? '').trim().toLowerCase()
  const statusFilter = String(statusSelect?.value ?? '').trim()

  return appState.clients.filter((client) => {
    const statusLabel = normalizeClientStatus(client.status)

    if (statusFilter && statusLabel !== statusFilter) {
      return false
    }

    if (!search) {
      return true
    }

    const haystack = [client.id, client.name, client.nip, client.city, client.coordinator]
      .map((value) => String(value ?? '').toLowerCase())
      .join(' ')

    return haystack.includes(search)
  })
}

function updateClientsPager(paged) {
  const pageLabel = document.getElementById('clPageLabel')
  const shownLabel = document.getElementById('clShownLabel')
  const prevBtn = document.getElementById('clPrevBtn')
  const nextBtn = document.getElementById('clNextBtn')

  if (pageLabel) {
    pageLabel.textContent = `Strona ${paged.page} / ${paged.totalPages}`
  }

  if (shownLabel) {
    shownLabel.textContent = `Wyświetlono: ${paged.items.length} · Wszystkie: ${paged.total} · Na stronę: ${paged.pageSize}`
  }

  if (prevBtn) {
    prevBtn.disabled = paged.page <= 1
  }

  if (nextBtn) {
    nextBtn.disabled = paged.page >= paged.totalPages
  }

  workerTimeSyncSelectionUi()
}

function filterClientsTable({ resetPage = true } = {}) {
  const filtered = getFilteredClients()
  if (resetPage) {
    appState.clientsPage = 1
  }

  const paged = paginate(filtered, appState.clientsPage, appState.clientsPageSize)
  appState.clientsPage = paged.page
  appState.clientsTotal = paged.total
  appState.clientsTotalPages = paged.totalPages

  renderClientsTable(paged.items)
  updateClientsPager(paged)
}

function getClientByIdFromState(clientId) {
  const normalizedId = String(clientId ?? '').trim()
  if (!normalizedId) {
    return null
  }

  return appState.clients.find((client) => String(client.id) === normalizedId) ?? null
}

function fillClientsCoordinatorSelect(selected = '') {
  const select = document.getElementById('clKoordynator')
  if (!select) {
    return
  }

  const selectedValue = String(selected ?? '').trim()
  const uniqueNames = [...new Set(appState.workers.map((worker) => String(worker.name ?? '').trim()).filter(Boolean))]
  uniqueNames.sort((left, right) => left.localeCompare(right, 'pl', { sensitivity: 'base' }))

  select.innerHTML = '<option value="">-- wybierz --</option>'
  if (selectedValue && !uniqueNames.includes(selectedValue)) {
    uniqueNames.unshift(selectedValue)
  }
  uniqueNames.forEach((name) => {
    const option = document.createElement('option')
    option.value = name
    option.textContent = name
    select.appendChild(option)
  })

  select.value = selectedValue
}

function setClientModalReadonly(readonly) {
  const isReadonly = Boolean(readonly)
  ;['clNazwa', 'clNip', 'clMiasto', 'clAdres', 'clStatus', 'clKoordynator'].forEach((id) => {
    const input = document.getElementById(id)
    if (!input) return
    input.disabled = isReadonly
  })

  const saveButton = document.querySelector('#clModal .modal-footer .btn-primary')
  if (saveButton) {
    saveButton.style.display = isReadonly ? 'none' : ''
  }
}

function syncClientsPermissions() {
  const addButton = document.querySelector('#view-clientsList .fido-filters .btn-primary')
  if (addButton) {
    addButton.style.display = canManageClients() ? '' : 'none'
  }
}

function openClientModal(mode = 'add', clientId = '') {
  const modal = document.getElementById('clModal')
  if (!modal) {
    return
  }

  const normalizedMode = String(mode ?? 'add').trim().toLowerCase()
  if (normalizedMode !== 'view' && !canManageClients()) {
    alert('Brak uprawnień do zarządzania klientami.')
    return
  }

  const isEdit = normalizedMode === 'edit'
  const isView = normalizedMode === 'view'
  const currentClient = isEdit || isView ? getClientByIdFromState(clientId) : null
  if ((isEdit || isView) && !currentClient) {
    alert('Nie znaleziono klienta.')
    return
  }

  const modalTitle = document.getElementById('clModalTitle')
  const rowNumberInput = document.getElementById('clRowNumber')
  const idInput = document.getElementById('clId')
  const nameInput = document.getElementById('clNazwa')
  const nipInput = document.getElementById('clNip')
  const cityInput = document.getElementById('clMiasto')
  const addressInput = document.getElementById('clAdres')
  const statusInput = document.getElementById('clStatus')
  const generatedId = `CL-${Date.now()}`

  appState.clientModalMode = isView ? 'view' : isEdit ? 'edit' : 'add'
  appState.clientModalClientId = currentClient ? String(currentClient.id ?? '') : generatedId

  if (modalTitle) {
    modalTitle.textContent = isView ? 'Podgląd Klienta' : isEdit ? 'Edycja Klienta' : 'Nowy Klient'
  }

  if (rowNumberInput) rowNumberInput.value = appState.clientModalClientId
  if (idInput) idInput.value = appState.clientModalClientId
  if (nameInput) nameInput.value = currentClient ? String(currentClient.name ?? '') : ''
  if (nipInput) nipInput.value = currentClient ? String(currentClient.nip ?? '') : ''
  if (cityInput) cityInput.value = currentClient ? String(currentClient.city ?? '') : ''
  if (addressInput) addressInput.value = currentClient ? String(currentClient.address ?? '') : ''
  if (statusInput) statusInput.value = normalizeClientStatus(currentClient?.status)
  fillClientsCoordinatorSelect(currentClient ? String(currentClient.coordinator ?? '') : '')
  setClientModalReadonly(isView)

  modal.style.display = 'flex'
}

function closeClientModal() {
  const modal = document.getElementById('clModal')
  if (modal) {
    modal.style.display = 'none'
  }

  appState.clientModalMode = 'add'
  appState.clientModalClientId = ''
  setClientModalReadonly(false)
}

async function fetchClientsForCurrentSession(force = false) {
  const tbody = document.getElementById('clientsBody')
  syncClientsPermissions()

  if (!appState.session?.orgId) {
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding:40px; color:#ef4444;">Brak aktywnej sesji organizacji.</td>
        </tr>
      `
    }
    return
  }

  if (!force && appState.clientsLoaded) {
    fillClientsCoordinatorSelect()
    filterClientsTable({ resetPage: false })
    return
  }

  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:40px; color:#64748b;">Ładowanie danych...</td>
      </tr>
    `
  }

  try {
    const clients = await getClients(appState.session.orgId)
    appState.clients = clients
    appState.clientsLoaded = true
    fillClientsCoordinatorSelect()
    filterClientsTable({ resetPage: true })
    setSubwelcomeMetric('#view-clientsList .subwelcome', clients.length)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd pobierania klientów.'
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding:40px; color:#ef4444;">${escapeHtml(message)}</td>
        </tr>
      `
    }
  }
}

async function saveClientData() {
  if (!appState.session?.orgId) {
    return
  }

  if (!canManageClients()) {
    alert('Brak uprawnień do zapisu klienta.')
    return
  }

  const mode = String(appState.clientModalMode ?? 'add')
  const id = String(document.getElementById('clId')?.value ?? '').trim()
  const name = String(document.getElementById('clNazwa')?.value ?? '').trim()

  if (!id || !name) {
    alert('Uzupełnij ID i Nazwę klienta.')
    return
  }

  const payload = {
    id,
    clientId: id,
    name,
    nip: String(document.getElementById('clNip')?.value ?? '').trim(),
    city: String(document.getElementById('clMiasto')?.value ?? '').trim(),
    address: String(document.getElementById('clAdres')?.value ?? '').trim(),
    status: String(document.getElementById('clStatus')?.value ?? 'Aktywny').trim(),
    coordinator: String(document.getElementById('clKoordynator')?.value ?? '').trim(),
  }

  try {
    if (mode === 'edit') {
      await updateClient(appState.session.orgId, id, payload)
      const index = appState.clients.findIndex((client) => String(client.id) === id)
      if (index >= 0) {
        appState.clients[index] = {
          ...appState.clients[index],
          ...payload,
          status: normalizeClientStatus(payload.status),
        }
      }
    } else {
      await createClient(appState.session.orgId, payload)
    }

    closeClientModal()
    await fetchClientsForCurrentSession(true)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd zapisu klienta.'
    alert(message)
  }
}

function profileFieldValue(value, fallback = '-') {
  const raw = String(value ?? '').trim()
  return raw || fallback
}

function mapClientForProfileView(client) {
  return {
    ...client,
    id: String(client.id ?? ''),
    name: String(client.name ?? ''),
    status: normalizeClientStatus(client.status),
    nip: String(client.nip ?? ''),
    coordinator: String(client.coordinator ?? ''),
    contact: String(client.contact ?? client.phone ?? client.email ?? ''),
    city: String(client.city ?? ''),
    address: String(client.address ?? ''),
    frequency: String(client.frequency ?? client.czestotliwosc ?? ''),
    workers: String(client.workers ?? client.osobyWykonujace ?? client.osoby ?? ''),
    chemicals: String(client.chemia ?? ''),
    equipment: String(client.sprzet ?? ''),
    information: String(client.info ?? client.informacje ?? ''),
  }
}

function getFilteredClientProfiles() {
  const nameFilter = String(document.getElementById('cpSearchName')?.value ?? '')
    .trim()
    .toLowerCase()
  const nipFilter = String(document.getElementById('cpSearchNip')?.value ?? '')
    .trim()
    .toLowerCase()

  return appState.clients
    .map((client) => mapClientForProfileView(client))
    .filter((client) => {
      if (nameFilter && !client.name.toLowerCase().includes(nameFilter)) {
        return false
      }

      if (nipFilter && !client.nip.toLowerCase().includes(nipFilter)) {
        return false
      }

      return true
    })
}

function renderClientProfileTable(rows) {
  const tbody = document.getElementById('clientProfileBody')
  if (!tbody) {
    return
  }

  if (!rows.length) {
    tbody.innerHTML = `
      <tr><td colspan="4" style="text-align:center; padding:40px; color:#64748b;">Brak klientów do wyświetlenia.</td></tr>
    `
    return
  }

  tbody.innerHTML = rows
    .map(
      (client) => `
      <tr>
        <td class="mono">${escapeHtml(profileFieldValue(client.id))}</td>
        <td><b>${escapeHtml(profileFieldValue(client.name))}</b></td>
        <td>${escapeHtml(profileFieldValue(client.nip))}</td>
        <td style="text-align:right;">
          <button class="btn2" type="button" data-client-profile-id="${escapeHtml(client.id)}">Podgląd</button>
        </td>
      </tr>
    `,
    )
    .join('')
}

function filterClientProfileTable() {
  const filtered = getFilteredClientProfiles()
  appState.clientProfileRows = filtered
  renderClientProfileTable(filtered)
}

function fillClientProfileCoordinatorOptions() {
  const list = document.getElementById('cpKoordList')
  if (!list) {
    return
  }

  const uniqueNames = [...new Set(appState.workers.map((worker) => String(worker.name ?? '').trim()).filter(Boolean))]
  uniqueNames.sort((left, right) => left.localeCompare(right, 'pl', { sensitivity: 'base' }))

  list.innerHTML = ''
  uniqueNames.forEach((name) => {
    const option = document.createElement('option')
    option.value = name
    list.appendChild(option)
  })
}

function setClientProfileFieldValues(client) {
  const mapped = mapClientForProfileView(client)
  const title = document.getElementById('cpModalTitle')
  if (title) {
    title.textContent = `Szczegóły Klienta: ${profileFieldValue(mapped.name)}`
  }

  const viewMap = {
    'view-id': mapped.id,
    'view-status': mapped.status,
    'view-nazwa': mapped.name,
    'view-nip': mapped.nip,
    'view-koordynator': mapped.coordinator,
    'view-kontakt': mapped.contact,
    'view-miasto': mapped.city,
    'view-adres': mapped.address,
    'view-czestotliwosc': mapped.frequency,
    'view-osoby': mapped.workers,
    'view-chemia': mapped.chemicals,
    'view-sprzet': mapped.equipment,
    'view-informacje': mapped.information,
  }

  Object.entries(viewMap).forEach(([id, value]) => {
    const node = document.getElementById(id)
    if (node) {
      node.textContent = profileFieldValue(value)
    }
  })

  const editMap = {
    'edit-status': mapped.status,
    'edit-nazwa': mapped.name,
    'edit-nip': mapped.nip,
    'edit-koordynator': mapped.coordinator,
    'edit-kontakt': mapped.contact,
    'edit-miasto': mapped.city,
    'edit-adres': mapped.address,
    'edit-czestotliwosc': mapped.frequency,
    'edit-osoby': mapped.workers,
    'edit-chemia': mapped.chemicals,
    'edit-sprzet': mapped.equipment,
    'edit-informacje': mapped.information,
  }

  Object.entries(editMap).forEach(([id, value]) => {
    const input = document.getElementById(id)
    if (input) {
      input.value = String(value ?? '')
    }
  })
}

function setClientProfileEditMode(editMode) {
  appState.clientProfileEditMode = Boolean(editMode)

  const pairs = [
    ['view-status', 'edit-status'],
    ['view-nazwa', 'edit-nazwa'],
    ['view-nip', 'edit-nip'],
    ['view-koordynator', 'edit-koordynator'],
    ['view-kontakt', 'edit-kontakt'],
    ['view-miasto', 'edit-miasto'],
    ['view-adres', 'edit-adres'],
    ['view-czestotliwosc', 'edit-czestotliwosc'],
    ['view-osoby', 'edit-osoby'],
    ['view-chemia', 'edit-chemia'],
    ['view-sprzet', 'edit-sprzet'],
    ['view-informacje', 'edit-informacje'],
  ]

  pairs.forEach(([viewId, editId]) => {
    const viewNode = document.getElementById(viewId)
    const editNode = document.getElementById(editId)
    if (viewNode) viewNode.style.display = appState.clientProfileEditMode ? 'none' : ''
    if (editNode) editNode.style.display = appState.clientProfileEditMode ? '' : 'none'
  })

  const editButton = document.getElementById('cpBtnEdit')
  const saveButton = document.getElementById('cpBtnSave')
  const cancelButton = document.getElementById('cpBtnCancel')
  const closeButton = document.getElementById('cpBtnClose')

  if (editButton) editButton.style.display = appState.clientProfileEditMode ? 'none' : ''
  if (saveButton) saveButton.style.display = appState.clientProfileEditMode ? '' : 'none'
  if (cancelButton) cancelButton.style.display = appState.clientProfileEditMode ? '' : 'none'
  if (closeButton) closeButton.style.display = appState.clientProfileEditMode ? 'none' : ''
}

function openClientProfileModal(clientId) {
  const modal = document.getElementById('cpModal')
  if (!modal) {
    return
  }

  const normalizedId = String(clientId ?? '').trim()
  const client = appState.clients.find((item) => String(item.id) === normalizedId)
  if (!client) {
    return
  }

  appState.clientProfileCurrent = mapClientForProfileView(client)
  setClientProfileFieldValues(appState.clientProfileCurrent)
  setClientProfileEditMode(false)
  modal.style.display = 'flex'
}

function closeClientProfileModal() {
  const modal = document.getElementById('cpModal')
  if (modal) {
    modal.style.display = 'none'
  }

  appState.clientProfileCurrent = null
  setClientProfileEditMode(false)
}

function enterClientProfileEdit() {
  if (!appState.clientProfileCurrent) {
    return
  }

  setClientProfileEditMode(true)
}

function cancelClientProfileEdit() {
  if (!appState.clientProfileCurrent) {
    return
  }

  setClientProfileFieldValues(appState.clientProfileCurrent)
  setClientProfileEditMode(false)
}

async function saveClientProfileEdit() {
  if (!appState.session?.orgId || !appState.clientProfileCurrent) {
    return
  }

  const payload = {
    name: String(document.getElementById('edit-nazwa')?.value ?? '').trim(),
    status: String(document.getElementById('edit-status')?.value ?? 'Aktywny').trim(),
    nip: String(document.getElementById('edit-nip')?.value ?? '').trim(),
    coordinator: String(document.getElementById('edit-koordynator')?.value ?? '').trim(),
    contact: String(document.getElementById('edit-kontakt')?.value ?? '').trim(),
    city: String(document.getElementById('edit-miasto')?.value ?? '').trim(),
    address: String(document.getElementById('edit-adres')?.value ?? '').trim(),
    frequency: String(document.getElementById('edit-czestotliwosc')?.value ?? '').trim(),
    workers: String(document.getElementById('edit-osoby')?.value ?? '').trim(),
    chemia: String(document.getElementById('edit-chemia')?.value ?? '').trim(),
    sprzet: String(document.getElementById('edit-sprzet')?.value ?? '').trim(),
    informacje: String(document.getElementById('edit-informacje')?.value ?? '').trim(),
  }

  if (!payload.name) {
    alert('Nazwa klienta nie może być pusta.')
    return
  }

  try {
    await updateClient(appState.session.orgId, appState.clientProfileCurrent.id, payload)

    const updatedClient = {
      ...appState.clientProfileCurrent,
      ...payload,
      status: normalizeClientStatus(payload.status),
    }
    appState.clientProfileCurrent = updatedClient

    const index = appState.clients.findIndex((client) => String(client.id) === String(updatedClient.id))
    if (index >= 0) {
      appState.clients[index] = {
        ...appState.clients[index],
        ...updatedClient,
      }
    }

    filterClientProfileTable()
    setClientProfileFieldValues(updatedClient)
    setClientProfileEditMode(false)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd zapisu profilu klienta.'
    alert(message)
  }
}

async function fetchClientProfileForCurrentSession(force = false) {
  const tbody = document.getElementById('clientProfileBody')

  if (!appState.session?.orgId) {
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:40px; color:#ef4444;">Brak aktywnej sesji organizacji.</td></tr>'
    }
    return
  }

  if (!force && appState.clientsLoaded) {
    fillClientProfileCoordinatorOptions()
    filterClientProfileTable()
    return
  }

  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:40px; color:#64748b;">Ładowanie danych...</td></tr>'
  }

  try {
    const clients = await getClients(appState.session.orgId)
    appState.clients = clients
    appState.clientsLoaded = true
    fillClientProfileCoordinatorOptions()
    filterClientProfileTable()
    setSubwelcomeMetric('#view-clientProfile .subwelcome', clients.length)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd pobierania profilu klientów.'
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:40px; color:#ef4444;">${escapeHtml(message)}</td></tr>`
    }
  }
}

function eventTargetClosest(event, selector) {
  const target = event?.target
  if (target && typeof target.closest === 'function') {
    return target.closest(selector)
  }
  const parent = target?.parentElement
  if (parent && typeof parent.closest === 'function') {
    return parent.closest(selector)
  }
  return null
}

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

function ordersWorkerOptionsHtml(selectedRow) {
  const selected = Number(selectedRow)
  return [
    `<option value=""${Number.isFinite(selected) ? '' : ' selected'}>Wybierz</option>`,
    ...calendarTimelineResources()
      .map((resource, index) => ({ resource, index }))
      .filter(({ resource }) => resource?.type !== 'placeholder')
      .map(({ resource, index }) => {
        const selectedAttr = Number.isFinite(selected) && index === selected ? ' selected' : ''
        return `<option value="${index}"${selectedAttr}>${escapeHtml(resource.name || `Wiersz ${index + 1}`)}</option>`
      }),
  ].join('')
}

function ordersNormalizeOrderRows(order = {}, resources = calendarTimelineResources()) {
  const max = Array.isArray(resources) && resources.length ? resources.length : Number.POSITIVE_INFINITY
  const source = Array.isArray(order?.assignedRows) && order.assignedRows.length ? order.assignedRows : [order?.row]
  const rows = []
  source.forEach((value) => {
    const row = Number(value)
    if (!Number.isInteger(row) || row < 0 || row >= max || rows.includes(row)) {
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
  const rows = Number.isInteger(primaryRow) && primaryRow >= 0 ? [primaryRow] : []
  if (!checklist) {
    return rows
  }
  ;[...checklist.querySelectorAll('[data-orders-worker-row]:checked')]
    .map((input) => Number(input.getAttribute('data-orders-worker-row')))
    .forEach((row) => {
      if (Number.isInteger(row) && row >= 0 && !rows.includes(row)) {
        rows.push(row)
      }
    })
  return rows
}

function ordersWorkerAssignmentsFromRows(rows = [], resources = calendarTimelineResources()) {
  return rows
    .map((row) => ({
      row,
      name: String(resources[row]?.name ?? `Wiersz ${row + 1}`).trim(),
      key: String(resources[row]?.key ?? '').trim(),
    }))
    .filter((item) => item.name)
}

function ordersWorkerLabelForOrder(order = {}, resources = calendarTimelineResources()) {
  const rows = ordersNormalizeOrderRows(order, resources)
  return ordersWorkerAssignmentsFromRows(rows, resources)
    .map((item) => item.name)
    .join(', ')
}

function ordersWorkerChecklistHtml(order = {}) {
  const resources = calendarTimelineResources()
  const selectedRows = new Set(ordersNormalizeOrderRows(order, resources))
  return resources
    .map((resource, index) => ({ resource, index }))
    .filter(({ resource }) => resource?.type !== 'placeholder')
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

function ordersRenderWorkerChecklist(order = {}) {
  const checklist = document.getElementById('ordersEditWorkerChecklist')
  if (checklist) {
    checklist.innerHTML = ordersWorkerChecklistHtml(order)
  }
  const selected = ordersNormalizeOrderRows(order)
  ordersSetInputValue('ordersEditWorker', selected[0] ?? 0)
}

function ordersClientDisplayName(client = {}) {
  return String(client?.name ?? client?.clientName ?? client?.clientLabel ?? client?.id ?? client?.clientId ?? '').trim()
}

function ordersClientOptionsHtml(selectedLabel = '') {
  const selected = String(selectedLabel ?? '').trim()
  const clients = (Array.isArray(appState.clients) ? appState.clients : [])
    .map((client) => ordersClientDisplayName(client))
    .filter(Boolean)
    .filter((value, index, source) => source.findIndex((item) => normalizeSearchText(item) === normalizeSearchText(value)) === index)
    .sort((left, right) => left.localeCompare(right, 'pl', { sensitivity: 'base' }))

  const hasSelected = selected && clients.some((client) => normalizeSearchText(client) === normalizeSearchText(selected))
  const selectedOption =
    selected && !hasSelected ? `<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)}</option>` : ''

  return [
    `<option value=""${selected ? '' : ' selected'}>-- Nowy klient --</option>`,
    selectedOption,
    ...clients.map((client) => {
      const selectedAttr = selected && normalizeSearchText(client) === normalizeSearchText(selected) ? ' selected' : ''
      return `<option value="${escapeHtml(client)}"${selectedAttr}>${escapeHtml(client)}</option>`
    }),
  ].join('')
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

function ordersCreateDraftOrder() {
  const startTime = ordersDefaultStartTime()
  const row = 0
  return {
    id: ordersNextOrderId(),
    row,
    assignedRows: [row],
    workerAssignments: ordersWorkerAssignmentsFromRows([row]),
    dateYmd: todayYmd(),
    startTime,
    endDateYmd: todayYmd(),
    endTime: ordersDefaultEndTime(startTime),
    validUntil: todayYmd(),
    nextDate: todayYmd(),
    title: 'Nowe zlecenie',
    clientLabel: '',
    addressLabel: '',
    type: 'cyclic',
    tone: ordersTimelineToneForType('cyclic'),
    priority: 'Normalny',
    repeatEvery: 7,
    repeatUnit: 'day',
    advanceDays: 4,
    price: 0,
    description: '',
    coworkers: [],
    tasks: [],
    isDraft: true,
  }
}

function ordersDiscardDraftIfNeeded() {
  if (appState.ordersEditorMode !== 'add' || !appState.ordersEditingId) {
    return
  }
  const draftId = String(appState.ordersEditingId)
  appState.calendarTimelineDemoOrders = ordersListSourceOrders().filter((order) => !(order?.isDraft && order?.id === draftId))
}

function ordersOpenAddEditor() {
  void ordersWarmLocationSources().then(() => {
    if (appState.currentRoute === 'orders' && appState.ordersEditorMode === 'add') {
      renderOrdersView()
    }
  })
  const draft = ordersCreateDraftOrder()
  appState.calendarTimelineDemoOrders = [draft, ...ordersListSourceOrders().filter((order) => !order?.isDraft)]
  appState.ordersEditingId = draft.id
  appState.ordersEditorMode = 'add'
  appState.ordersEditorTab = 'basic'
  renderOrdersView()
}

function ordersCoworkerOptionsHtml(order = {}) {
  const current = new Set((Array.isArray(order?.coworkers) ? order.coworkers : []).map((item) => normalizeSearchText(item?.name ?? item)))
  return [
    '<option value="">-= Wybierz =-</option>',
    ...calendarTimelineResources()
      .filter((resource) => resource.type !== 'buffer' && resource.type !== 'placeholder')
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

function ordersLocalLocationSuggestions() {
  const suggestions = new Map()

  ;(Array.isArray(appState.clients) ? appState.clients : []).forEach((client) => {
    const city = String(client?.city ?? '').trim()
    const address = String(client?.address ?? '').trim()
    const name = String(client?.name ?? client?.clientName ?? '').trim()
    ordersAddLocationSuggestion(suggestions, [city, address].filter(Boolean).join(' '), name ? `Klient: ${name}` : 'Klient')
    ordersAddLocationSuggestion(suggestions, address, name ? `Klient: ${name}` : 'Klient')
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

  return [...suggestions.values()].sort((left, right) => left.label.localeCompare(right.label, 'pl', { sensitivity: 'base' }))
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
  if (query.length < 3) {
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
  }, 260)
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

function ordersWarmLocationSources() {
  if (ordersLocationSourcesPromise) {
    return ordersLocationSourcesPromise
  }

  const loaders = []
  if (!appState.clientsLoaded) {
    loaders.push(fetchClientsForCurrentSession(false))
  }
  if (!appState.zonesLoaded) {
    loaders.push(fetchZonesForCurrentSession(false))
  }

  if (!loaders.length) {
    return Promise.resolve()
  }

  ordersLocationSourcesPromise = Promise.allSettled(loaders).finally(() => {
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

function ordersRenderSchedulePreview(order = {}) {
  const preview = document.getElementById('ordersSchedulePreview')
  if (!preview) {
    return
  }

  const client = ordersTimelineClientLabel(order)
  const start = ordersNormalizeDateField(order.dateYmd, todayYmd())
  const end = ordersNormalizeDateField(order.validUntil || order.endDateYmd || start, start)
  preview.innerHTML = `
    <div class="orders-schedule-preview-row">
      <strong>${escapeHtml(client || '-')}</strong>
      <span>${escapeHtml(start)}</span>
      <span>${escapeHtml(end)}</span>
    </div>
    <div class="orders-schedule-preview-note">
      ${String(order.repeatUnit || 'day') === 'day' ? `Co ${escapeHtml(order.repeatEvery || 1)} dni` : `Powtarzanie: ${escapeHtml(order.repeatUnit || 'day')}`}
    </div>
  `
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
    title.textContent = appState.ordersEditorMode === 'add' ? 'Dodaj zlecenie' : 'Edytuj zlecenie'
  }

  const clientSelect = document.getElementById('ordersEditClient')
  if (clientSelect instanceof HTMLSelectElement) {
    clientSelect.innerHTML = ordersClientOptionsHtml(ordersTimelineClientLabel(order))
  }

  const workerSelect = document.getElementById('ordersEditWorker')
  if (workerSelect instanceof HTMLSelectElement) {
    workerSelect.innerHTML = ordersWorkerOptionsHtml(Number(order.row ?? 0))
  }

  const startDay = ordersNormalizeDateField(order.dateYmd, todayYmd())
  const validUntil = ordersNormalizeDateField(order.validUntil || order.dateTo || order.endValidDate || order.endDateYmd || startDay, startDay)
  const nextDate = ordersNormalizeDateField(order.nextDate || startDay, startDay)
  const type = String(order.type ?? 'other').trim() || 'other'
  const duration = ordersDurationHours(order)

  ordersSetInputValue('ordersEditName', order.title || '')
  ordersSetInputValue('ordersEditClient', ordersTimelineClientLabel(order))
  ordersSetInputValue('ordersEditStart', startDay)
  ordersSetInputValue('ordersEditNext', nextDate)
  ordersSetInputValue('ordersEditTime', ordersNormalizeTimeField(order.startTime, '08:00'))
  ordersSetInputValue('ordersEditEnd', validUntil)
  ordersSetInputValue('ordersEditEndTime', ordersNormalizeTimeField(order.endTime, ordersDefaultEndTime(order.startTime)))
  ordersSetInputValue('ordersEditDurationHours', duration)
  ordersSetInputValue('ordersEditLocation', ordersTimelineAddressLabel(order))
  ordersSetLocationGeoFields({
    placeId: order.placeId || order.googlePlaceId || '',
    lat: order.lat || order.latitude || '',
    lng: order.lng || order.longitude || '',
    mapUrl: order.mapUrl || order.googleMapsUrl || ordersGoogleMapsSearchUrl(ordersTimelineAddressLabel(order)),
  })
  ordersSetInputValue('ordersEditRepeatEvery', order.repeatEvery || 7)
  ordersSetInputValue('ordersEditRepeatUnit', order.repeatUnit || 'day')
  ordersSetInputValue('ordersEditPriority', order.priority || 'Normalny')
  ordersSetInputValue('ordersEditAdvance', order.advanceDays || 4)
  ordersSetInputValue('ordersEditType', ['individual', 'cyclic', 'renovation', 'windows', 'other'].includes(type) ? type : 'other')
  ordersSetInputValue('ordersEditPrice', order.price || 0)
  ordersSetInputValue('ordersEditTaskName', order.taskName || '')
  ordersSetInputValue('ordersEditSms', order.smsText || '')
  ordersSetInputValue('ordersEditSmsTime', order.smsTime || '')
  ordersSetInputValue('ordersEditPhone', order.phone || '')
  ordersSetInputValue('ordersEditDescription', order.description || order.title || '')
  ordersSetInputValue('ordersEditClientName', order.clientName || order.clientLabel || '')
  ordersRenderWorkerChecklist(order)
  ordersRenderSchedulePreview(order)
  ordersRenderCoworkerRows(order)
  ordersRenderEditorTabs()
  ordersHideLocationSuggestions()
}

function ordersOpenEditor(orderId) {
  const order = ordersFindTimelineOrder(orderId)
  if (!order) {
    showTransientNotice('Nie znaleziono zlecenia do edycji.', 'error')
    return
  }
  void ordersWarmLocationSources()
  appState.ordersEditingId = String(orderId ?? '').trim()
  appState.ordersEditorMode = 'edit'
  appState.ordersEditorTab = 'basic'
  renderOrdersView()
}

function ordersOpenEditorFromCalendar(orderId) {
  const id = String(orderId ?? '').trim()
  if (!ordersFindTimelineOrder(id)) {
    showTransientNotice('Nie znaleziono zlecenia do edycji.', 'error')
    return
  }

  appState.ordersEditingId = id
  appState.ordersEditorMode = 'edit'
  appState.ordersEditorTab = 'basic'
  document.querySelector('[data-route="orders"]')?.click()
  window.setTimeout(() => {
    renderOrdersView()
    void ordersWarmLocationSources()
  }, 0)
}

function ordersShowList() {
  ordersDiscardDraftIfNeeded()
  appState.ordersEditingId = ''
  appState.ordersEditorMode = 'edit'
  appState.ordersEditorTab = 'basic'
  renderOrdersView()
}

function ordersSaveEditor() {
  const order = ordersFindTimelineOrder(appState.ordersEditingId)
  if (!order) {
    showTransientNotice('Nie znaleziono zlecenia do zapisu.', 'error')
    ordersShowList()
    return
  }
  const isAddMode = appState.ordersEditorMode === 'add'

  const dateYmd = ordersNormalizeDateField(ordersReadInputValue('ordersEditStart'), ordersNormalizeDateField(order.dateYmd, todayYmd()))
  const startTime = ordersNormalizeTimeField(ordersReadInputValue('ordersEditTime'), ordersNormalizeTimeField(order.startTime, '08:00'))
  const startMinutes = calendarTimelineTimeMinutes(startTime, 8 * 60)
  const explicitEndDate = ordersNormalizeDateField(ordersReadInputValue('ordersEditEnd'), dateYmd)
  const explicitEndTime = calendarNormalizeTimeValue(ordersReadInputValue('ordersEditEndTime'))
  const durationHours = Math.max(1, Math.floor(Number(ordersReadInputValue('ordersEditDurationHours')) || ordersDurationHours(order)))
  const totalEndMinutes = startMinutes + durationHours * 60
  let endDateYmd = explicitEndTime ? explicitEndDate : calendarAddDays(dateYmd, Math.floor(totalEndMinutes / 1440))
  let endTime = explicitEndTime || calendarMinutesToTime(totalEndMinutes % 1440) || '23:59'
  if (endDateYmd === dateYmd && calendarTimelineTimeMinutes(endTime, startMinutes + 60) <= startMinutes) {
    showTransientNotice('Godzina STOP musi być późniejsza niż godzina START.', 'error')
    return
  }
  const selectedRows = ordersReadSelectedWorkerRows()
  const row = Number(ordersReadInputValue('ordersEditWorker'))
  const safeRow = selectedRows[0] ?? (Number.isInteger(row) && row >= 0 ? row : Number(order.row ?? 0))
  const type = String(ordersReadInputValue('ordersEditType') || order.type || 'other').trim()
  const clientLabel = ordersReadInputValue('ordersEditClient') || ordersReadInputValue('ordersEditClientName')

  const nextOrder = {
    ...order,
    isDraft: false,
    row: safeRow,
    assignedRows: selectedRows.length ? selectedRows : [safeRow],
    workerAssignments: ordersWorkerAssignmentsFromRows(selectedRows.length ? selectedRows : [safeRow]),
    dateYmd,
    startTime,
    endDateYmd,
    endTime,
    validUntil: explicitEndDate,
    nextDate: ordersNormalizeDateField(ordersReadInputValue('ordersEditNext'), dateYmd),
    title: ordersReadInputValue('ordersEditName') || order.title || 'Zlecenie',
    clientLabel,
    clientName: ordersReadInputValue('ordersEditClientName'),
    addressLabel: ordersReadInputValue('ordersEditLocation'),
    googlePlaceId: ordersReadInputValue('ordersEditLocationPlaceId'),
    placeId: ordersReadInputValue('ordersEditLocationPlaceId'),
    lat: ordersReadInputValue('ordersEditLocationLat'),
    lng: ordersReadInputValue('ordersEditLocationLng'),
    mapUrl: ordersReadInputValue('ordersEditLocationMapUrl') || ordersGoogleMapsSearchUrl(ordersReadInputValue('ordersEditLocation')),
    googleMapsUrl: ordersReadInputValue('ordersEditLocationMapUrl') || ordersGoogleMapsSearchUrl(ordersReadInputValue('ordersEditLocation')),
    repeatEvery: Math.max(1, Math.floor(Number(ordersReadInputValue('ordersEditRepeatEvery')) || 1)),
    repeatUnit: ordersReadInputValue('ordersEditRepeatUnit') || 'day',
    priority: ordersReadInputValue('ordersEditPriority') || 'Normalny',
    advanceDays: Math.max(0, Math.floor(Number(ordersReadInputValue('ordersEditAdvance')) || 0)),
    type: ['individual', 'cyclic', 'renovation', 'windows', 'other'].includes(type) ? type : 'other',
    tone: ordersTimelineToneForType(type),
    price: Math.max(0, Number(ordersReadInputValue('ordersEditPrice')) || 0),
    taskName: ordersReadInputValue('ordersEditTaskName'),
    smsText: ordersReadInputValue('ordersEditSms'),
    smsTime: ordersReadInputValue('ordersEditSmsTime'),
    phone: ordersReadInputValue('ordersEditPhone'),
    description: ordersReadInputValue('ordersEditDescription'),
  }

  const conflict = calendarTimelineFindOrderConflict(nextOrder, ordersListSourceOrders())
  if (conflict) {
    showTransientNotice('Nie zapisano: pracownik ma już zlecenie w tym czasie.', 'error')
    return
  }

  appState.calendarTimelineDemoOrders = ordersListSourceOrders().map((item) => (item.id === nextOrder.id ? nextOrder : item))
  appState.ordersEditorMode = 'edit'
  appState.ordersEditingId = ''
  renderOrdersView()
  showTransientNotice(isAddMode ? 'Zlecenie dodane do bieżącego widoku.' : 'Zlecenie zapisane w bieżącym widoku.')
}

function ordersRowsFromCalendarTimeline() {
  const resources = calendarTimelineResources()
  return ordersListSourceOrders().map((order) => {
    const resource = resources[Number(order.row)] ?? null
    const endDay = String(order.endDateYmd || order.dateYmd || '').trim()
    const visibleEndDay = String(order.validUntil || endDay).trim()
    return {
      id: String(order.id ?? '').trim(),
      dateFrom: ordersDateTimeFromTimeline(order.dateYmd, order.startTime),
      dateTo: ordersDateTimeFromTimeline(visibleEndDay, order.endTime),
      nextDate: String(order.nextDate || order.dateYmd || '').trim() || '-',
      name: String(order.title ?? '').trim() || '-',
      client: ordersTimelineClientLabel(order),
      worker: ordersWorkerLabelForOrder(order, resources) || String(resource?.name ?? order.workerLabel ?? `Wiersz ${Number(order.row) + 1}`).trim(),
      address: ordersTimelineAddressLabel(order),
      cyclic: String(order.type ?? '').trim() === 'cyclic',
      completed: Boolean(order.completed),
      type: String(order.type ?? '').trim() || 'other',
    }
  })
}

function ordersListVisibleRows() {
  const query = normalizeSearchText(appState.ordersSearch)
  return ordersRowsFromCalendarTimeline().filter((row) => {
    if (appState.ordersShowCyclic && !row.cyclic) {
      return false
    }
    if (!query) {
      return true
    }
    return normalizeSearchText([row.dateFrom, row.dateTo, row.nextDate, row.name, row.client, row.worker, row.address].join(' ')).includes(query)
  }).sort((left, right) => String(left.nextDate ?? '').localeCompare(String(right.nextDate ?? '')))
}

function ordersListActionButtonHtml(kind, label, iconPath) {
  return `
    <button class="orders-action orders-action--${escapeHtml(kind)}" type="button" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" data-orders-list-action="${escapeHtml(kind)}">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">${iconPath}</svg>
    </button>
  `
}

function ordersListRowHtml(row = {}) {
  const editIcon =
    '<path d="m5 16.5-.5 3 3-.5L18 8.5 15.5 6 5 16.5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m14.5 7 2.5 2.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
  const pinIcon =
    '<path d="M12 21s7-5.2 7-11a7 7 0 0 0-14 0c0 5.8 7 11 7 11Z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.4" stroke="currentColor" stroke-width="2"/>'
  const deleteIcon =
    '<path d="M5 7h14M9 7V5h6v2M8 10v8M12 10v8M16 10v8M7 7l1 13h8l1-13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'

  return `
    <div class="orders-row" data-order-id="${escapeHtml(row.id)}">
      <div>${escapeHtml(row.dateFrom || '-')}</div>
      <div>${escapeHtml(row.dateTo || '-')}</div>
      <div>${escapeHtml(row.nextDate || '-')}</div>
      <div class="orders-strong">${escapeHtml(row.name || '-')}</div>
      <div>${escapeHtml(row.client || '-')}</div>
      <div>${escapeHtml(row.worker || '-')}</div>
      <div>${escapeHtml(row.address || '-')}</div>
      <div class="orders-actions">
        ${ordersListActionButtonHtml('edit', 'Edytuj', editIcon)}
        ${ordersListActionButtonHtml('pin', 'Pokaż adres', pinIcon)}
        ${ordersListActionButtonHtml('delete', 'Usuń', deleteIcon)}
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
  const searchInput = document.getElementById('ordersSearchInput')
  const cycleToggle = document.getElementById('ordersCycleToggle')

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

  if (searchInput instanceof HTMLInputElement && searchInput.value !== appState.ordersSearch) {
    searchInput.value = appState.ordersSearch
  }

  if (cycleToggle instanceof HTMLButtonElement) {
    cycleToggle.classList.toggle('is-active', appState.ordersShowCyclic)
    cycleToggle.setAttribute('aria-pressed', appState.ordersShowCyclic ? 'true' : 'false')
    cycleToggle.textContent = appState.ordersShowCyclic ? 'Cykliczne' : 'Wszystkie'
  }

  const rows = ordersListVisibleRows()
  rowsNode.innerHTML = rows.length
    ? rows.map((row) => ordersListRowHtml(row)).join('')
    : `
      <div class="orders-row orders-row-empty">
        <div>-</div><div>-</div><div>-</div><div>Brak zleceń dla wybranych filtrów.</div><div>-</div><div>-</div><div>-</div><div>-</div>
      </div>
    `

  if (countNode) {
    countNode.textContent = `${rows.length} zleceń`
  }
  if (statusNode) {
    statusNode.textContent = appState.ordersShowCyclic ? 'Widok: zlecenia cykliczne.' : 'Widok: wszystkie zlecenia.'
  }
}

let ordersMapInstance = null
let ordersMapInfoWindow = null
let ordersMapMarkers = []
let ordersMapRenderSeq = 0

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
  } catch {
    const firstAddress = orders.map((order) => ordersTimelineAddressLabel(order)).find((address) => address && address !== '-')
    ordersMapFallbackIframe(firstAddress || 'Polska')
    ordersMapSetNotice('Nie udało się uruchomić interaktywnej mapy. Pokazuję podgląd Google Maps.', true)
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

  binding.add(root, 'input', (event) => {
    if (event.target?.id === 'ordersEditLocation') {
      ordersClearLocationGeoFields()
      ordersRenderLocationSuggestions(String(event.target.value ?? ''))
      ordersQueueGoogleLocationSuggestions(String(event.target.value ?? ''))
      ordersQueueGoogleLocationResolve(String(event.target.value ?? ''))
      void ordersWarmLocationSources().then(() => {
        const input = document.getElementById('ordersEditLocation')
        if (input instanceof HTMLInputElement && document.activeElement === input) {
          ordersRenderLocationSuggestions(input.value)
        }
      })
      return
    }

    if (event.target?.id === 'ordersSearchInput') {
      appState.ordersSearch = String(event.target.value ?? '')
      renderOrdersView()
    }
  })

  binding.add(root, 'change', (event) => {
    if (event.target?.id === 'ordersEditClient') {
      const order = ordersFindTimelineOrder(appState.ordersEditingId)
      if (order) {
        order.clientLabel = ordersReadInputValue('ordersEditClient')
        ordersRenderSchedulePreview(order)
      }
      return
    }
    if (event.target?.id === 'ordersEditWorker') {
      const order = ordersFindTimelineOrder(appState.ordersEditingId)
      const row = Number(ordersReadInputValue('ordersEditWorker'))
      if (order && Number.isInteger(row) && row >= 0) {
        order.row = row
        order.assignedRows = ordersReadSelectedWorkerRows()
        ordersRenderWorkerChecklist(order)
      }
      return
    }
    if (event.target?.hasAttribute?.('data-orders-worker-row')) {
      const order = ordersFindTimelineOrder(appState.ordersEditingId)
      if (order) {
        order.assignedRows = ordersReadSelectedWorkerRows()
      }
      return
    }
    if (['ordersEditStart', 'ordersEditEnd', 'ordersEditRepeatEvery', 'ordersEditRepeatUnit'].includes(String(event.target?.id ?? ''))) {
      const order = ordersFindTimelineOrder(appState.ordersEditingId)
      if (order) {
        order.dateYmd = ordersNormalizeDateField(ordersReadInputValue('ordersEditStart'), order.dateYmd || todayYmd())
        order.validUntil = ordersNormalizeDateField(ordersReadInputValue('ordersEditEnd'), order.validUntil || order.dateYmd || todayYmd())
        order.repeatEvery = Math.max(1, Math.floor(Number(ordersReadInputValue('ordersEditRepeatEvery')) || 1))
        order.repeatUnit = ordersReadInputValue('ordersEditRepeatUnit') || 'day'
        ordersRenderSchedulePreview(order)
      }
    }
  })

  binding.add(root, 'click', (event) => {
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

    const addOrder = eventTargetClosest(event, '#ordersAddBtn')
    if (addOrder) {
      event.preventDefault()
      ordersOpenAddEditor()
      return
    }

    const toggle = eventTargetClosest(event, '#ordersCycleToggle')
    if (toggle) {
      event.preventDefault()
      appState.ordersShowCyclic = !appState.ordersShowCyclic
      renderOrdersView()
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

    const save = eventTargetClosest(event, '#ordersEditSave, [data-orders-save]')
    if (save) {
      event.preventDefault()
      ordersSaveEditor()
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
      const orderId = row?.getAttribute('data-order-id') || ''
      const actionName = action.getAttribute('data-orders-list-action')
      if (actionName === 'edit') {
        ordersOpenEditor(orderId)
        return
      }
      if (actionName === 'pin') {
        ordersOpenMapModal(orderId)
        return
      }
      if (actionName === 'delete') {
        showTransientNotice('Usuwanie zleceń podepniemy po podłączeniu bazy.', 'error')
        return
      }
    }

    const search = eventTargetClosest(event, '#ordersSearchBtn')
    if (search) {
      event.preventDefault()
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
  })

  binding.add(root, 'keydown', (event) => {
    if (event.target?.id === 'ordersEditLocation' && event.key === 'Escape') {
      ordersHideLocationSuggestions()
    }
    if (event.key === 'Escape') {
      ordersCloseMapModal()
    }
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

let individualOrdersSearchDebounceHandle = null

function individualOrderQrUrl(qrCode, size = 260) {
  const code = String(qrCode ?? '').trim()
  if (!code) {
    return ''
  }

  const normalizedSize = Number.isFinite(Number(size)) ? Math.max(Math.floor(Number(size)), 120) : 260
  return `https://quickchart.io/qr?text=${encodeURIComponent(code)}&size=${normalizedSize}&margin=10&format=png`
}

function individualOrdersSetStatus(message = 'gotowe', isError = false) {
  const node = document.getElementById('ioStatus')
  if (!node) {
    return
  }

  node.textContent = `Status: ${message}`
  node.style.color = isError ? '#b42318' : ''
}

function individualOrdersSetFooter(shown = 0, total = 0) {
  const node = document.getElementById('ioFooter')
  if (!node) {
    return
  }

  node.textContent = `Wyświetlono: ${shown} (max ${appState.individualOrdersPageSize}) · Wszystkie: ${total}`
}

function individualOrdersSyncPermissions() {
  const addButton = document.getElementById('ioAdd')
  if (addButton) {
    addButton.style.display = canManageIndividualOrders() ? '' : 'none'
  }
}

function individualOrdersCloseModal() {
  const overlay = document.getElementById('ioModal')
  if (overlay) {
    overlay.style.display = 'none'
  }

  appState.individualOrderModalMode = 'add'
  appState.individualOrderCurrentId = ''
}

function individualOrdersOpenModal(mode = 'add', item = null) {
  const overlay = document.getElementById('ioModal')
  if (!overlay) {
    return
  }

  const isEdit = mode === 'edit'
  appState.individualOrderModalMode = isEdit ? 'edit' : 'add'
  appState.individualOrderCurrentId = isEdit ? String(item?.clientIndId ?? '').trim() : ''

  const title = document.getElementById('ioModalTitle')
  const idInput = document.getElementById('ioFormId')
  const dateInput = document.getElementById('ioFormDate')
  const nameInput = document.getElementById('ioFormName')
  const nipInput = document.getElementById('ioFormNip')
  const cityInput = document.getElementById('ioFormCity')
  const addressInput = document.getElementById('ioFormAddr')
  const contactInput = document.getElementById('ioFormContact')
  const infoInput = document.getElementById('ioFormInfo')
  const qrCodeInput = document.getElementById('ioFormQrCode')
  const hiddenRow = document.getElementById('ioFormRow')
  const saveButton = document.getElementById('ioModalSave')

  if (title) {
    title.textContent = isEdit ? 'Edytuj zlecenie' : 'Dodaj zlecenie'
  }

  if (hiddenRow) {
    hiddenRow.value = ''
  }

  if (idInput) {
    idInput.value = isEdit ? String(item?.clientIndId ?? '') : ''
    idInput.disabled = isEdit && !canManageIndividualOrders()
  }
  if (dateInput) {
    dateInput.value = isEdit ? String(item?.dateYmd ?? '') : todayYmd()
  }
  if (nameInput) nameInput.value = isEdit ? String(item?.name ?? '') : ''
  if (nipInput) nipInput.value = isEdit ? String(item?.nip ?? '') : ''
  if (cityInput) cityInput.value = isEdit ? String(item?.city ?? '') : ''
  if (addressInput) addressInput.value = isEdit ? String(item?.address ?? '') : ''
  if (contactInput) contactInput.value = isEdit ? String(item?.contact ?? '') : ''
  if (infoInput) infoInput.value = isEdit ? String(item?.clientInfo ?? '') : ''
  if (qrCodeInput) qrCodeInput.value = isEdit ? String(item?.qrCode ?? '') : ''
  if (saveButton) {
    saveButton.disabled = false
    saveButton.textContent = 'Zapisz'
  }

  overlay.style.display = 'flex'
}

function individualOrdersReadFormPayload() {
  return {
    clientIndId: String(document.getElementById('ioFormId')?.value ?? '').trim(),
    dateYmd: String(document.getElementById('ioFormDate')?.value ?? '').trim(),
    name: String(document.getElementById('ioFormName')?.value ?? '').trim(),
    nip: String(document.getElementById('ioFormNip')?.value ?? '').trim(),
    city: String(document.getElementById('ioFormCity')?.value ?? '').trim(),
    address: String(document.getElementById('ioFormAddr')?.value ?? '').trim(),
    contact: String(document.getElementById('ioFormContact')?.value ?? '').trim(),
    clientInfo: String(document.getElementById('ioFormInfo')?.value ?? '').trim(),
    qrCode: String(document.getElementById('ioFormQrCode')?.value ?? '').trim(),
  }
}

function renderIndividualOrdersRows(rows) {
  const root = document.getElementById('ioRows')
  if (!root) {
    return
  }

  appState.individualOrdersRows = rows
  const canManage = canManageIndividualOrders()

  if (!rows.length) {
    root.innerHTML = `
      <div class="io-row io-empty">
        <div>—</div><div>—</div><div>Brak wyników</div><div>—</div><div>—</div><div>—</div><div>—</div><div>—</div><div>—</div><div class="io-actions"></div>
      </div>
    `
    return
  }

  root.innerHTML = rows
    .map((item, index) => {
      const actionButtons = canManage
        ? `
            <button class="mini-btn qr" data-io-act="qr" data-io-index="${index}" type="button" title="Pobierz QR">QR</button>
            <button class="mini-btn edit" data-io-act="edit" data-io-index="${index}" type="button">Edytuj</button>
            <button class="mini-btn danger" data-io-act="del" data-io-index="${index}" type="button">Usuń</button>
          `
        : `
            <button class="mini-btn qr" data-io-act="qr" data-io-index="${index}" type="button" title="Pobierz QR">QR</button>
          `

      return `
        <div class="io-row">
          <div>${escapeHtml(item.clientIndId || '—')}</div>
          <div>${escapeHtml(item.dateLabel || '—')}</div>
          <div title="${escapeHtml(item.name || '')}">${escapeHtml(item.name || '—')}</div>
          <div>${escapeHtml(item.nip || '')}</div>
          <div>${escapeHtml(item.city || '')}</div>
          <div>${escapeHtml(item.address || '')}</div>
          <div>${escapeHtml(item.contact || '')}</div>
          <div title="${escapeHtml(item.clientInfo || '')}">${escapeHtml(item.clientInfo || '')}</div>
          <div class="mono">${escapeHtml(item.qrCode || '')}</div>
          <div class="io-actions">${actionButtons}</div>
        </div>
      `
    })
    .join('')
}

async function fetchIndividualOrdersForCurrentSession({ resetPage = false } = {}) {
  individualOrdersSyncPermissions()

  if (!appState.session?.orgId) {
    renderIndividualOrdersRows([])
    individualOrdersSetFooter(0, 0)
    individualOrdersSetStatus('brak aktywnej sesji', true)
    return
  }

  if (resetPage) {
    appState.individualOrdersPage = 1
  }

  individualOrdersSetStatus('pobieram dane...')

  try {
    const q = String(document.getElementById('ioQ')?.value ?? '').trim()
    const response = await getIndividualOrders(appState.session.orgId, {
      q,
      page: appState.individualOrdersPage,
      pageSize: appState.individualOrdersPageSize,
    })

    appState.individualOrdersPage = response.page
    appState.individualOrdersPageSize = response.pageSize
    appState.individualOrdersTotal = response.total
    appState.individualOrdersTotalPages = response.totalPages

    renderIndividualOrdersRows(response.items)
    individualOrdersSetFooter(response.items.length, response.total)
    individualOrdersSetStatus(`OK · rekordów: ${response.items.length}`)
    setSubwelcomeMetric('#view-individualOrders .subwelcome', response.total)
  } catch (error) {
    renderIndividualOrdersRows([])
    individualOrdersSetFooter(0, 0)
    const message = error instanceof Error ? error.message : 'Błąd pobierania zleceń.'
    individualOrdersSetStatus(message, true)
  }
}

async function saveIndividualOrderFromModal() {
  if (!appState.session?.orgId) {
    return
  }

  if (!canManageIndividualOrders()) {
    alert('Brak uprawnień do zapisu zleceń indywidualnych.')
    return
  }

  const payload = individualOrdersReadFormPayload()
  if (!payload.name) {
    alert('Pole Nazwa jest wymagane.')
    return
  }

  const saveButton = document.getElementById('ioModalSave')
  if (saveButton) {
    saveButton.disabled = true
    saveButton.textContent = 'Zapisywanie...'
  }

  try {
    if (appState.individualOrderModalMode === 'add') {
      await createIndividualOrder(appState.session.orgId, payload)
    } else {
      await updateIndividualOrder(appState.session.orgId, appState.individualOrderCurrentId, payload)
    }

    individualOrdersCloseModal()
    await fetchIndividualOrdersForCurrentSession()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd zapisu zlecenia.'
    alert(message)
  } finally {
    if (saveButton) {
      saveButton.disabled = false
      saveButton.textContent = 'Zapisz'
    }
  }
}

async function deleteIndividualOrderFromRow(item) {
  if (!appState.session?.orgId || !item?.clientIndId) {
    return
  }

  if (!canManageIndividualOrders()) {
    alert('Brak uprawnień do usuwania zleceń indywidualnych.')
    return
  }

  const confirmed = window.confirm(`Usunąć rekord ${item.clientIndId}?`)
  if (!confirmed) {
    return
  }

  try {
    await deleteIndividualOrder(appState.session.orgId, item.clientIndId)
    await fetchIndividualOrdersForCurrentSession()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd usuwania zlecenia.'
    alert(message)
  }
}

function openIndividualOrderQrModal(qrCode) {
  const normalizedCode = String(qrCode ?? '').trim()
  if (!normalizedCode) {
    individualOrdersSetStatus('Brak kodu QR w tym rekordzie.', true)
    return
  }

  appState.individualOrderQrCurrent = normalizedCode

  const overlay = document.getElementById('ioQrModal')
  const image = document.getElementById('ioQrModalImg')
  const code = document.getElementById('ioQrModalCode')
  if (image) {
    image.src = individualOrderQrUrl(normalizedCode, 260)
    image.alt = `QR ${normalizedCode}`
  }
  if (code) {
    code.textContent = normalizedCode
  }
  if (overlay) {
    overlay.style.display = 'flex'
  }
}

function closeIndividualOrderQrModal() {
  const overlay = document.getElementById('ioQrModal')
  const image = document.getElementById('ioQrModalImg')
  if (overlay) {
    overlay.style.display = 'none'
  }
  if (image) {
    image.src = ''
  }
  appState.individualOrderQrCurrent = ''
}

const PDF_EXPORT_FONT_FAMILY = 'RobotoPdf'
const PDF_EXPORT_FONT_REGULAR_FILE = 'Roboto-Regular.ttf'
const PDF_EXPORT_FONT_BOLD_FILE = 'Roboto-Medium.ttf'
let pdfExportFontVfsPromise = null
let pdfMakeExportPromise = null

async function loadPdfExportFontVfs() {
  if (!pdfExportFontVfsPromise) {
    pdfExportFontVfsPromise = import('pdfmake/build/vfs_fonts.js').then((module) => {
      const vfs = module?.default ?? module?.pdfMake?.vfs ?? module?.vfs ?? module
      if (!vfs || typeof vfs !== 'object') {
        throw new Error('Nie udało się przygotować fontów PDF.')
      }
      return vfs
    })
  }

  return pdfExportFontVfsPromise
}

async function ensurePdfMakeLoaded() {
  if (!pdfMakeExportPromise) {
    pdfMakeExportPromise = Promise.all([import('pdfmake/build/pdfmake.js'), loadPdfExportFontVfs()]).then(
      ([module, vfs]) => {
        const pdfMake = module?.default ?? module?.pdfMake ?? module
        if (!pdfMake || typeof pdfMake.createPdf !== 'function') {
          throw new Error('Biblioteka PDF nie jest dostępna.')
        }
        if (typeof pdfMake.addVirtualFileSystem === 'function') {
          pdfMake.addVirtualFileSystem(vfs)
        } else {
          pdfMake.vfs = vfs
        }
        return pdfMake
      },
    )
  }

  return pdfMakeExportPromise
}

async function ensureJsPdfLoaded() {
  if (window.jspdf?.jsPDF) {
    return window.jspdf.jsPDF
  }

  await new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-io-jspdf="1"]')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Nie udało się załadować jsPDF.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.dataset.ioJspdf = '1'
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
    script.async = true
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => reject(new Error('Nie udało się załadować jsPDF.')), { once: true })
    document.head.appendChild(script)
  })

  if (!window.jspdf?.jsPDF) {
    throw new Error('Biblioteka jsPDF nie jest dostępna.')
  }

  return window.jspdf.jsPDF
}

async function ensurePdfUnicodeFont(pdf) {
  if (!pdf || typeof pdf.addFileToVFS !== 'function' || typeof pdf.addFont !== 'function') {
    throw new Error('Ta wersja jsPDF nie obsługuje osadzania fontów Unicode.')
  }

  const vfs = await loadPdfExportFontVfs()
  const regularFont = String(vfs[PDF_EXPORT_FONT_REGULAR_FILE] ?? '').trim()
  const boldFont = String(vfs[PDF_EXPORT_FONT_BOLD_FILE] ?? vfs['Roboto-Bold.ttf'] ?? '').trim()
  if (!regularFont || !boldFont) {
    throw new Error('Brak plików fontów PDF z polskimi znakami.')
  }

  pdf.addFileToVFS(PDF_EXPORT_FONT_REGULAR_FILE, regularFont)
  pdf.addFont(PDF_EXPORT_FONT_REGULAR_FILE, PDF_EXPORT_FONT_FAMILY, 'normal')
  pdf.addFileToVFS(PDF_EXPORT_FONT_BOLD_FILE, boldFont)
  pdf.addFont(PDF_EXPORT_FONT_BOLD_FILE, PDF_EXPORT_FONT_FAMILY, 'bold')
  pdf.setFont(PDF_EXPORT_FONT_FAMILY, 'normal')
}

function setPdfUnicodeFont(pdf, style = 'normal') {
  pdf.setFont(PDF_EXPORT_FONT_FAMILY, style)
}

async function downloadCurrentIndividualOrderQrPng() {
  const code = String(appState.individualOrderQrCurrent ?? '').trim()
  if (!code) {
    return
  }

  closeIndividualOrderQrModal()
  individualOrdersSetStatus('generuję PNG...')

  try {
    const response = await fetch(individualOrderQrUrl(code, 800), { method: 'GET', mode: 'cors' })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const blob = await response.blob()
    const link = document.createElement('a')
    const objectUrl = URL.createObjectURL(blob)
    link.href = objectUrl
    link.download = `${code}.png`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1500)
    individualOrdersSetStatus(`OK · pobrano ${code}.png`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd pobierania QR PNG.'
    individualOrdersSetStatus(message, true)
    alert(message)
  }
}

async function downloadCurrentIndividualOrderQrPdf() {
  const code = String(appState.individualOrderQrCurrent ?? '').trim()
  if (!code) {
    return
  }

  closeIndividualOrderQrModal()
  individualOrdersSetStatus('generuję PDF...')

  try {
    const response = await fetch(individualOrderQrUrl(code, 800), { method: 'GET', mode: 'cors' })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const blob = await response.blob()
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(new Error('Błąd odczytu obrazu QR.'))
      reader.readAsDataURL(blob)
    })

    const JsPdf = await ensureJsPdfLoaded()
    const pdf = new JsPdf({ orientation: 'p', unit: 'mm', format: 'a4' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const qrSize = Math.min(160, pageWidth - 40)
    const startX = (pageWidth - qrSize) / 2

    pdf.setFontSize(14)
    pdf.text(`Kod QR: ${code}`, pageWidth / 2, 20, { align: 'center' })
    pdf.addImage(dataUrl, 'PNG', startX, 40, qrSize, qrSize)
    pdf.setFontSize(10)
    pdf.text('Wygenerowano w Cleanzi Portal', pageWidth / 2, pageHeight - 15, { align: 'center' })
    pdf.save(`${code}.pdf`)
    individualOrdersSetStatus(`OK · pobrano ${code}.pdf`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd pobierania QR PDF.'
    individualOrdersSetStatus(message, true)
    alert(message)
  }
}

function eventSelectionKey(row, index) {
  const key = String(row?.eventId ?? row?.workdayId ?? row?.id ?? '').trim()
  return key || `row-${index}`
}

function splitEventCommentParts(value) {
  return String(value ?? '')
    .split(/\s*\|\s*|\r?\n+/)
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
}

function isSystemGeneratedEventCommentToken(value) {
  const token = String(value ?? '').trim()
  if (!token) {
    return true
  }

  const normalized = token.toUpperCase()
  const qrCodePattern = '(?=[A-Z0-9_-]*\\d)[A-Z0-9_-]+'

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
  return parts.every((part) => isSystemGeneratedEventCommentToken(part))
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
  const visibleParts = parts.filter((part) => !isSystemGeneratedEventCommentToken(part))
  if (!visibleParts.length) {
    return ''
  }

  return visibleParts.join(' | ')
}

function eventDeletionCandidateIds(row) {
  const candidates = [
    row?.eventId,
    row?.workdayId,
    row?.id,
    row?.linkedWorkdayId,
  ]
  return [...new Set(candidates.map((value) => String(value ?? '').trim()).filter(Boolean))]
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

async function deleteEventByCandidateIds(orgId, row) {
  const candidateIds = eventDeletionCandidateIds(row)
  if (!candidateIds.length) {
    throw new Error('Brak identyfikatora zdarzenia do usuniecia.')
  }

  const errors = []
  let deletedAny = false
  for (const id of candidateIds) {
    try {
      await deleteEvent(orgId, id)
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
  const stopOnlyByTiming =
    Boolean(startIso && endIso) &&
    Number.isFinite(new Date(endIso).getTime() - new Date(startIso).getTime()) &&
    Math.abs(new Date(endIso).getTime() - new Date(startIso).getTime()) <= 1000 &&
    (!Number.isFinite(durationSec) || durationSec <= 0)
  const specialHaystack = [row?.strefa, row?.zoneName, row?.roomId, row?.clientStatus]
    .map((value) => String(value ?? '').toLowerCase())
    .join(' ')
  const isSpecial = specialHaystack.includes('specjal') || specialHaystack.includes('special')

  if (clientIndId || endReason === 'INDIVIDUAL_DONE') {
    return { label: 'Zlecenie ind.', className: 'event-type-badge--individual' }
  }
  if (status === 'RUNNING' && !row?.endAt) {
    return { label: 'QR START', className: 'event-type-badge--start' }
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
  if (endReason === 'QR_NEW' || endReason === 'QR_SAME' || row?.endAt) {
    return { label: 'CLEAN', className: 'event-type-badge--clean' }
  }
  return { label: 'Inne QR', className: 'event-type-badge--other' }
}

function syncEventsSelectionUi() {
  const selectAll = document.getElementById('evSelectAll')
  const deleteButton = document.getElementById('evDeleteSelectedBtn')
  const selectionEnabled = canManageEvents()
  const rowKeys = appState.eventRows.map((row, index) => eventSelectionKey(row, index))
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
  const findWorkerByLogin = (loginText) => {
    const variants = [normalizeLookup(loginText), normalizeLookup(toLoginLocalPart(loginText))].filter(Boolean)
    if (!variants.length) {
      return null
    }

    return (
      appState.workers.find((worker) => {
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
        const normalizedKeys = new Set([
          ...workerKeys.map((value) => normalizeLookup(value)),
          ...workerKeys.map((value) => normalizeLookup(toLoginLocalPart(value))),
        ])
        return variants.some((variant) => normalizedKeys.has(variant))
      }) ?? null
    )
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

    const exactMatch =
      appState.workers.find((worker) => normalizePersonValue(workerDisplayName(worker)) === normalized) ?? null
    if (exactMatch) {
      return exactMatch
    }

    const surname = parts[parts.length - 1]
    const surnameMatches = appState.workers.filter((worker) => {
      const workerParts = normalizePersonValue(workerDisplayName(worker)).split(' ').filter(Boolean)
      if (!workerParts.length) {
        return false
      }
      return workerParts[workerParts.length - 1] === surname
    })
    return surnameMatches.length === 1 ? surnameMatches[0] : null
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

  const visibleKeys = new Set(safeRows.map((row, index) => eventSelectionKey(row, index)))
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
      const canSelect = canManageEvents()
      const comment = normalizeVisibleEventComment(row.comment)
      const commentCell = comment
        ? `<button class="btn2" type="button" data-event-comment="${index}" title="Pokaz komentarz">💬</button>`
        : ''
      const workerLogin = String(row.workerLogin ?? '').trim()
      const workerName = resolveWorkerNameFromWorkers(workerLogin, row.workerName)
      const workerPrimary = workerName || workerLogin || '-'
      const workerSecondary = workerLogin && workerName && workerLogin !== workerName ? workerLogin : ''
      const workerCard = `
        <div class="events-worker-cell">
          <div class="events-worker-name">${escapeHtml(workerPrimary)}</div>
          <div class="events-worker-login mono">${escapeHtml(workerSecondary || '')}</div>
        </div>
      `
      const workerCell =
        workerPrimary === '-'
          ? workerCard
          : `<button class="events-cell-link" type="button" data-event-history-worker="${index}" title="Pokaz historie osoby">${workerCard}</button>`

      const clientQrCandidate =
        row?.zoneId ??
        row?.roomId ??
        row?.utilityRoomId ??
        row?.dayStartObject ??
        row?.dayStopObject ??
        row?.strefa
      const clientLabel = resolveClientLabelWithQrFallback(String(row?.clientName ?? row?.klient ?? '-').trim() || '-', clientQrCandidate)
      const clientCell =
        clientLabel === '-'
          ? '-'
          : `<button class="events-cell-link" type="button" data-event-history-client="${index}" title="Pokaz historie klienta">${escapeHtml(clientLabel)}</button>`

      const zoneLabel = String(row.strefa || '-').trim() || '-'
      const zoneCell =
        zoneLabel === '-'
          ? '-'
          : `<button class="events-cell-link" type="button" data-event-history-zone="${index}" title="Pokaz historie strefy">${zoneNameWithQrHtml(zoneLabel, row)}</button>`
      const startLabel = dashboardClockLabelToHm(row.start, '-')
      const stopLabel = dashboardClockLabelToHm(row.stop, '-')
      const durationLabel = dashboardDurationLabelToHm(row.duration, '00:00')

      return `
        <div class="events-row${isSelected ? ' is-selected' : ''}">
          <div class="events-select-col">
            <input type="checkbox" data-event-select-index="${index}" aria-label="Zaznacz zdarzenie" ${isSelected ? 'checked' : ''} ${canSelect ? '' : 'disabled'} />
          </div>
          <div>${workerCell}</div>
          <div>${clientCell}</div>
          <div>${zoneCell}</div>
          <div>${escapeHtml(row.lokalizacja || '-')}</div>
          <div class="mono">${escapeHtml(row.date || '-')}</div>
          <div class="mono time-start">${escapeHtml(startLabel)}</div>
          <div class="mono time-stop">${escapeHtml(stopLabel)}</div>
          <div class="mono time-duration">${escapeHtml(durationLabel)}</div>
          <div>${commentCell}</div>
          <div>${escapeHtml(row.editedBy || '-')}</div>
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

function durationSecondsToHms(value) {
  const seconds = Number(value ?? 0)
  const normalized = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  const hours = Math.floor(normalized / 3600)
  const minutes = Math.floor((normalized % 3600) / 60)
  const secondsRemainder = normalized % 60
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(secondsRemainder)}`
}

function durationSecondsToHm(value) {
  const seconds = Number(value ?? 0)
  const normalized = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  const hours = Math.floor(normalized / 3600)
  const minutes = Math.floor((normalized % 3600) / 60)
  return `${pad2(hours)}:${pad2(minutes)}`
}

function dashboardLateMinutesToHm(value) {
  const minutes = Number(value ?? 0)
  const normalizedMinutes = Number.isFinite(minutes) && minutes > 0 ? Math.floor(minutes) : 0
  return durationSecondsToHm(normalizedMinutes * 60)
}

function setSelectOptions(selectNode, options, placeholderLabel = '(wybierz)') {
  if (!selectNode) {
    return
  }

  selectNode.innerHTML = ''

  const placeholder = document.createElement('option')
  placeholder.value = ''
  placeholder.textContent = placeholderLabel
  selectNode.appendChild(placeholder)

  options.forEach((optionData) => {
    const option = document.createElement('option')
    option.value = String(optionData.value ?? '').trim()
    option.textContent = String(optionData.label ?? option.value)
    selectNode.appendChild(option)
  })
}

function ensureSelectValue(selectNode, value, fallbackLabel) {
  if (!selectNode) {
    return
  }

  const normalized = String(value ?? '').trim()
  if (!normalized) {
    selectNode.value = ''
    return
  }

  const exists = Array.from(selectNode.options).some((option) => String(option.value) === normalized)
  if (!exists) {
    const option = document.createElement('option')
    option.value = normalized
    option.textContent = fallbackLabel ? `${fallbackLabel} (spoza listy)` : `${normalized} (spoza listy)`
    selectNode.appendChild(option)
  }

  selectNode.value = normalized
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

  const headerLogo = document.querySelector('.header .logo-block img')
  const src = headerLogo?.getAttribute('src') || '/vite.svg'
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
  if (!select) {
    return
  }

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

function eventEditorApplyPickerFilter(kind, { expandOnEmpty = false } = {}) {
  const config = eventEditorGetPickerConfig(kind)
  const select = document.getElementById(config.selectId)
  if (!select) {
    return
  }

  const currentValue = String(select.value ?? '').trim()
  const query = String(document.getElementById(config.inputId)?.value ?? '').trim()
  const filteredOptions = reportHistoryFilterOptions(config.options, query)
  const placeholderLabel = query && !filteredOptions.length ? '(brak dopasowan)' : config.placeholderLabel

  setSelectOptions(select, filteredOptions, placeholderLabel)
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

function eventEditorApplyAllPickerFilters() {
  eventEditorApplyPickerFilter('worker')
  eventEditorApplyPickerFilter('client')
  eventEditorApplyPickerFilter('zone')
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

function populateEventEditorOptions(selectedWorkerLogin, selectedClientId, selectedZoneId) {
  const workerSelect = document.getElementById('evEditWorker')
  const clientSelect = document.getElementById('evEditPom')
  const zoneSelect = document.getElementById('evEditStrefa')

  if (!workerSelect || !clientSelect || !zoneSelect) {
    return
  }

  const workerOptions = appState.workers
    .map((worker) => {
      const login = String(worker.login ?? worker.id ?? '').trim()
      if (!login) {
        return null
      }

      return {
        value: login,
        label: worker.name || login,
      }
    })
    .filter(Boolean)

  const clientOptions = appState.clients.map((client) => ({
    value: String(client.id),
    label: client.name || client.id,
  }))
  clientOptions.sort((left, right) => left.label.localeCompare(right.label, 'pl', { sensitivity: 'base' }))

  const normalizedClientId = String(selectedClientId ?? '').trim()

  const availableZones = normalizedClientId
    ? appState.zones.filter((zone) => String(zone.clientId ?? '').trim() === normalizedClientId)
    : appState.zones

  const zoneOptions = availableZones
    .map((zone) => mapZoneForView(zone))
    .filter((zone) => !isUnassignedCleanZone(zone))
    .map((zone) => {
      const zoneId = String(zone.id ?? '').trim()
      if (!zoneId) {
        return null
      }

      return {
        value: zoneId,
        label: zone.name || zone.zone || zoneId,
      }
    })
    .filter(Boolean)

  const normalizedWorkerLogin = String(selectedWorkerLogin ?? '').trim()
  const normalizedZoneId = String(selectedZoneId ?? '').trim()
  const fallbackWorkerLabel =
    appState.workers.find((worker) => String(worker.login ?? worker.id ?? '').trim() === normalizedWorkerLogin)?.name ??
    normalizedWorkerLogin
  const fallbackClientLabel =
    appState.clients.find((client) => String(client.id).trim() === normalizedClientId)?.name ?? normalizedClientId
  const fallbackZoneLabel =
    appState.zones.find((zone) => String(zone.id ?? '').trim() === normalizedZoneId)?.name ?? normalizedZoneId

  appState.eventEditorWorkerOptions = eventEditorEnsureOption(workerOptions, normalizedWorkerLogin, fallbackWorkerLabel)
  appState.eventEditorClientOptions = eventEditorEnsureOption(clientOptions, normalizedClientId, fallbackClientLabel)
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

  endInput.value = isoToLocalDateTimeInput(new Date().toISOString())
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

async function openEventEditor(item) {
  ensureEventOverlaysMountedToBody()
  const overlay = document.getElementById('evEditorOverlay')
  if (!overlay) {
    return
  }

  await ensureEventReferenceDataLoaded()
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

  const zone = getZoneById(item.roomId || item.utilityRoomId)
  const selectedClientId = zone?.clientId ?? item.clientId
  const selectedZoneId = zone?.id ?? item.roomId ?? item.utilityRoomId

  eventEditorResetSearchInputs()
  populateEventEditorOptions(item.workerLogin, selectedClientId, selectedZoneId)

  if (title) title.textContent = 'Edytuj zdarzenie'
  if (cycleId) cycleId.textContent = String(item.eventId ?? item.workdayId ?? '-')
  if (rowNumber) rowNumber.textContent = '-'
  if (editedBy) editedBy.textContent = item.editedBy || appState.session?.name || '-'
  if (startInput) startInput.value = isoToLocalDateTimeInput(item.startAt)
  if (stopInput) stopInput.value = isoToLocalDateTimeInput(item.endAt)
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
    saveButton.disabled = false
    saveButton.textContent = 'Zapisz'
  }
  if (deleteButton) {
    deleteButton.style.display = canManageEvents() ? '' : 'none'
    deleteButton.disabled = false
    deleteButton.textContent = 'Usuń'
  }

  overlay.style.display = 'flex'
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

  await ensureEventReferenceDataLoaded()
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
  populateEventEditorOptions('', '', '')

  if (title) title.textContent = 'Dodaj zdarzenie'
  if (cycleId) cycleId.textContent = '-'
  if (rowNumber) rowNumber.textContent = '-'
  if (editedBy) editedBy.textContent = appState.session?.name || '-'
  if (startInput) startInput.value = ''
  if (stopInput) stopInput.value = ''
  if (commentInput) {
    commentInput.readOnly = true
    commentInput.value = ''
  }
  if (scannedQrInput) {
    scannedQrInput.value = '-'
  }
  if (saveButton) {
    saveButton.disabled = false
    saveButton.textContent = 'Zapisz'
  }
  if (deleteButton) {
    deleteButton.style.display = 'none'
    deleteButton.disabled = false
    deleteButton.textContent = 'Usuń'
  }

  overlay.style.display = 'flex'
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
  const endAt = localDateTimeInputToIso(stopInput?.value)
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

async function dashboardLoadFastRows(orgId) {
  const rangeTo = todayYmd()
  const fastEventsFrom = daysAgoYmd(1)
  const [todayActive, recentEvents, todayWorkdays] = await Promise.all([
    getTodayActiveWorkers(orgId),
    getWorkdays(orgId, {
      source: 'events',
      fromIso: fastEventsFrom,
      toIso: rangeTo,
      page: 1,
      pageSize: 5000,
    }).catch(() => ({ items: [] })),
    getWorkdays(orgId, {
      source: 'workdays',
      fromIso: rangeTo,
      toIso: rangeTo,
      page: 1,
      pageSize: 5000,
    }).catch(() => ({ items: [] })),
  ])

  const todayStartSourceRows = [...(recentEvents.items ?? []), ...(todayWorkdays.items ?? [])]
  appState.dashboardScheduleSourceRows = todayStartSourceRows
  const todayRows = dashboardApplyFirstQrStartToday(
    todayActive.items ?? [],
    todayStartSourceRows,
    appState.dashboardScheduleDays,
  )

  return { todayRows, recentEvents, todayWorkdays }
}

async function dashboardRefreshBackgroundData(orgId, options = {}) {
  const activeOrgId = String(appState.session?.orgId ?? '').trim()
  if (!orgId || orgId !== activeOrgId) {
    return
  }

  const rangeFrom = dashboardCommentSyncRangeFrom(orgId, { forceFull: options.forceFull === true })
  const rangeTo = todayYmd()
  let fetchFailed = false
  const recentEvents = await getWorkdays(orgId, {
    source: 'events',
    fromIso: rangeFrom,
    toIso: rangeTo,
    page: 1,
    pageSize: 12000,
  }).catch((error) => {
    fetchFailed = true
    console.warn('[portal/dashboard] comment sync fetch failed', error)
    return { items: [] }
  })

  if (String(appState.session?.orgId ?? '').trim() !== orgId) {
    return
  }
  if (fetchFailed) {
    appState.dashboardBackgroundDataLoaded = false
    return
  }

  const summary = dashboardBuildSummary(
    appState.dashboardTodayRows,
    recentEvents.items ?? [],
    dashboardBuildPeriodHourValues(appState.dashboardTodayRows),
  )
  const dashboardComments = dashboardBuildNewComments(recentEvents.items ?? [], [])
  renderDashboardSummary(summary)
  dashboardSyncCommentTasks(dashboardComments)
  renderDashboardKanbanTasks()
  renderDashboardNewComments(dashboardComments)
  dashboardWriteLocalSnapshot(orgId, {
    summary,
    todayRows: appState.dashboardTodayRows,
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

function dashboardStartScheduleRefresh(orgId) {
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

  dashboardScheduleRefreshPromise = getScheduleBoard()
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
        setSubwelcomeMetric('#view-clientsList .subwelcome', clients.length)
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

function dashboardEnsureTaskDataForRoute(routeName, renderAfterLoad) {
  const activeOrgId = String(appState.session?.orgId ?? '').trim()
  if (!activeOrgId) {
    return
  }
  const isKanbanRoute = routeName === 'kanban'

  const renderIfStillCurrent = () => {
    if (appState.currentRoute === routeName && typeof renderAfterLoad === 'function') {
      renderAfterLoad()
    }
  }

  renderIfStillCurrent()
  if (isKanbanRoute) {
    kanbanSetDataLoading(true, appState.calendarRemoteTasksLoaded ? 'Dociągam komentarze pracowników...' : 'Synchronizuję zadania...')
  }

  const remoteTaskPromise = appState.calendarRemoteTasksLoaded
    ? Promise.resolve(appState.calendarTasks)
    : calendarSyncRemoteTasks({ render: true })

  Promise.resolve(remoteTaskPromise)
    .catch((error) => {
      console.warn('[portal/tasks] remote task refresh failed', error)
    })
    .finally(() => {
      renderIfStillCurrent()
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
}

function deferRouteTaskDataRefresh(routeName, renderAfterLoad) {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    dashboardEnsureTaskDataForRoute(routeName, renderAfterLoad)
    return
  }

  window.requestAnimationFrame(() => {
    dashboardEnsureTaskDataForRoute(routeName, renderAfterLoad)
  })
}

async function refreshDashboardWidgets() {
  if (!appState.session?.orgId) {
    return
  }

  const orgId = String(appState.session.orgId)
  dashboardStartScheduleRefresh(orgId)
  dashboardBeginLoading()
  try {
    const { todayRows, recentEvents } = await dashboardLoadFastRows(orgId)
    const summary = dashboardBuildSummary(todayRows, recentEvents.items ?? [], dashboardBuildPeriodHourValues(todayRows))
    renderDashboardSummary(summary)
    await dashboardRevealLoadingStage('overview')
    renderDashboardKanbanTasks()
    renderDashboardNewComments(dashboardBuildNewComments(recentEvents.items ?? [], []))
    await dashboardRevealLoadingStage('tasks')
    renderDashboardEvents(todayRows)
    await dashboardRevealLoadingStage('active')
    renderDashboardSchedulePanel()
    await dashboardRevealLoadingStage('schedule')
    setDashboardLastRefresh(new Date())
    dashboardWriteLocalSnapshot(orgId, {
      summary,
      todayRows,
      scheduleSourceRows: appState.dashboardScheduleSourceRows,
      comments: dashboardBuildNewComments(recentEvents.items ?? [], []),
    })
  } finally {
    dashboardEndLoading()
  }

  dashboardStartPostLoadRefresh(orgId, { preloadReferences: true })
}

function setDashboardLastRefresh(dateValue) {
  const node = document.getElementById('dashLastRefresh')
  if (!node) {
    return
  }
  const autoRefreshLabel = ' (autoodświeżenie co 15 min)'

  const iso = toIso(dateValue)
  if (!iso) {
    node.textContent = `Ostatnie odświeżenie: -${autoRefreshLabel}`
    return
  }

  node.textContent = `Ostatnie odświeżenie: ${formatDatePl(iso)} ${formatTime(iso)}${autoRefreshLabel}`
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

async function autoRefreshDashboardIfNewRecords() {
  if (!canAutoRefreshDashboard()) {
    return
  }

  await refreshDashboardWidgets({ syncWorktimeToken: true })
}

function stopDashboardAutoRefresh() {
  if (dashboardRefreshTimer) {
    window.clearInterval(dashboardRefreshTimer)
    dashboardRefreshTimer = null
  }
}

function startDashboardAutoRefresh() {
  stopDashboardAutoRefresh()
  dashboardRefreshTimer = window.setInterval(() => {
    void autoRefreshDashboardIfNewRecords().catch(() => {})
  }, DASHBOARD_REFRESH_INTERVAL_MS)
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

async function saveEventEditor() {
  if (!appState.session?.orgId) {
    return
  }

  if (appState.eventEditorMode === 'add' && !canManageEvents()) {
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

  const saveButton = document.getElementById('evSaveBtn')
  const editedHistorySource = appState.eventEditorMode === 'edit' ? { ...(appState.eventEditorItem || {}) } : null
  if (saveButton) {
    saveButton.disabled = true
    saveButton.textContent = 'Zapisywanie...'
  }

  try {
    const derivedEndAt = payload.eventKind === 'start' ? null : payload.endAt
    const derivedStartAt = payload.eventKind === 'stop' ? derivedEndAt : payload.startAt
    const derivedDurationSec = payload.eventKind === 'start_stop' ? Number(payload.durationSec ?? 0) : 0
    const derivedStatus = payload.eventKind === 'start' ? 'RUNNING' : 'CLOSED'
    const derivedCloseMarkedAt = payload.eventKind === 'start' ? null : derivedEndAt || null
    const derivedEndReason = eventEndReasonFromKind(payload.eventKind)

    if (appState.eventEditorMode === 'add') {
      await createEvent(appState.session.orgId, {
        eventId: `EV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        ...eventPayload,
        startAt: derivedStartAt,
        endAt: derivedEndAt,
        durationSec: derivedDurationSec,
        status: derivedStatus,
        closeMarkedAt: derivedCloseMarkedAt,
        endReason: derivedEndReason,
      })
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
      await fetchEventsForCurrentSession({ resetPage: false })
    }
    await reportHistoryRefreshAfterEventSave({
      ...(editedHistorySource || {}),
      ...eventPayload,
      startAt: derivedStartAt,
      endAt: derivedEndAt,
    })
    await refreshDashboardWidgets({ syncWorktimeToken: true })
    showTransientNotice('Zmiany zostały zapisane.')
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
    await fetchEventsForCurrentSession({ resetPage: false })
    await refreshDashboardWidgets({ syncWorktimeToken: true })
    let stillVisible = appState.eventRows.some((row) => eventRowFingerprintKey(row) === targetFingerprint)
    if (stillVisible) {
      const duplicates = appState.eventRows.filter((row) => eventRowFingerprintKey(row) === targetFingerprint)
      for (const duplicate of duplicates) {
        await deleteEventByCandidateIds(appState.session.orgId, duplicate)
      }
      await fetchEventsForCurrentSession({ resetPage: false })
      await refreshDashboardWidgets({ syncWorktimeToken: true })
      stillVisible = appState.eventRows.some((row) => eventRowFingerprintKey(row) === targetFingerprint)
    }
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

  const selectedRows = appState.eventRows.filter((row, index) => appState.eventsSelectedKeys.has(eventSelectionKey(row, index)))
  if (!selectedRows.length) {
    return
  }
  const selectedFingerprintKeys = new Set(selectedRows.map((row) => eventRowFingerprintKey(row)).filter(Boolean))
  const selectedIds = new Set(selectedRows.flatMap((row) => eventDeletionCandidateIds(row)))

  const confirmed = window.confirm(
    `Czy na pewno chcesz usunac ${selectedRows.length} rekord(y)? Ta zmiana jest nieodwracalna.`,
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
    await fetchEventsForCurrentSession({ resetPage: false })
    await refreshDashboardWidgets({ syncWorktimeToken: true })
    let stillVisibleRows = appState.eventRows.filter((row) => {
      const fingerprint = eventRowFingerprintKey(row)
      if (fingerprint && selectedFingerprintKeys.has(fingerprint)) {
        return true
      }
      const rowIds = eventDeletionCandidateIds(row)
      return rowIds.some((id) => selectedIds.has(id))
    })

    if (stillVisibleRows.length) {
      for (const row of stillVisibleRows) {
        await deleteEventByCandidateIds(appState.session.orgId, row)
      }
      await fetchEventsForCurrentSession({ resetPage: false })
      await refreshDashboardWidgets({ syncWorktimeToken: true })
      stillVisibleRows = appState.eventRows.filter((row) => {
        const fingerprint = eventRowFingerprintKey(row)
        if (fingerprint && selectedFingerprintKeys.has(fingerprint)) {
          return true
        }
        const rowIds = eventDeletionCandidateIds(row)
        return rowIds.some((id) => selectedIds.has(id))
      })
    }

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
    pageSize: appState.eventsPageSize,
  }
}

function updateEventsPager(shown) {
  const pageLabel = document.getElementById('evPageLabel')
  const shownLabel = document.getElementById('evShownLabel')
  const prevBtn = document.getElementById('evPrevBtn')
  const nextBtn = document.getElementById('evNextBtn')

  if (pageLabel) {
    pageLabel.textContent = `Strona ${appState.eventsPage} / ${appState.eventsTotalPages}`
  }

  if (shownLabel) {
    shownLabel.textContent = `Wyświetlono: ${shown} · Wszystkie: ${appState.eventsTotal} · Na stronę: ${appState.eventsPageSize}`
  }

  if (prevBtn) {
    prevBtn.disabled = appState.eventsPage <= 1
  }

  if (nextBtn) {
    nextBtn.disabled = appState.eventsPage >= appState.eventsTotalPages
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
      const qrCandidate =
        row?.zoneId ?? row?.roomId ?? row?.utilityRoomId ?? row?.dayStartObject ?? row?.dayStopObject ?? row?.strefa
      return resolveClientLabelWithQrFallback(String(row?.clientName ?? row?.klient ?? '-').trim() || '-', qrCandidate)
    },
  },
  {
    label: 'Strefa',
    width: '*',
    getValue: (row) => String(row?.strefa ?? row?.zoneName ?? '-').trim() || '-',
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

async function fetchEventsForCurrentSession({ resetPage = false, applyStoredFilters = false } = {}) {
  const root = document.getElementById('evRows')

  if (!appState.session?.orgId) {
    appState.eventsSelectedKeys = new Set()
    if (root) {
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

  if (root) {
    root.innerHTML = `
      <div class="events-row">
        <div></div><div>Ładowanie danych...</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
      </div>
    `
  }

  try {
    await ensureEventReferenceDataLoaded()
    const filters = readEventsFilters()
    const response = await getWorkdays(appState.session.orgId, filters)

    appState.eventsPage = response.page
    appState.eventsPageSize = response.pageSize
    appState.eventsTotal = response.total
    appState.eventsTotalPages = response.totalPages

    renderEventsRows(response.items)
    updateEventsPager(response.items.length)
    setSubwelcomeMetric('#view-events .subwelcome', response.total)
  } catch (error) {
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

async function ensureEventReferenceDataLoaded() {
  if (!appState.session?.orgId) {
    return
  }

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

  if (!loaders.length) {
    fillEventsClientFilterDatalist()
    return
  }

  await Promise.all(loaders)
  fillEventsClientFilterDatalist()
}

function clientNameMap() {
  return new Map(appState.clients.map((client) => [String(client.id), client.name]))
}

function normalizeZoneDate(value) {
  const iso = toIso(value)
  if (iso) {
    return formatDatePl(iso)
  }

  const raw = String(value ?? '').trim()
  return raw || '-'
}

function mapZoneForView(zone) {
  const map = clientNameMap()
  const clientId = String(zone.clientId ?? '')
  return {
    ...zone,
    qr: zone.qr || zone.id || '-',
    clientName: map.get(clientId) || clientId || '-',
    zoneName: zone.name || zone.zone || '-',
    location: zone.location || '-',
    function: zone.function || '-',
    editedBy: zone.editedBy || '-',
    dateLabel: normalizeZoneDate(zone.date),
  }
}

function zoneValueIsEmptyDash(value) {
  const normalized = normalizeSearchText(value)
  return !normalized || normalized === '-'
}

function isUnassignedCleanZone(zone) {
  const clientKey = normalizeSearchText(zone.clientName || zone.clientId)
  const functionKey = normalizeSearchText(zone.function)
  return (
    clientKey === 'unassigned' &&
    functionKey === 'clean' &&
    zoneValueIsEmptyDash(zone.zoneName) &&
    zoneValueIsEmptyDash(zone.location)
  )
}

function visiblePortalZones() {
  return (Array.isArray(appState.zones) ? appState.zones : [])
    .map((zone) => mapZoneForView(zone))
    .filter((zone) => !isUnassignedCleanZone(zone))
}

function compareZoneText(left, right) {
  return String(left ?? '').localeCompare(String(right ?? ''), 'pl', { numeric: true, sensitivity: 'base' })
}

function sortZonesForView(zones) {
  const mode = String(document.getElementById('znSort')?.value ?? 'functionAsc').trim()
  const sorted = [...zones]
  sorted.sort((left, right) => {
    if (mode === 'functionDesc') {
      return (
        compareZoneText(right.function, left.function) ||
        compareZoneText(left.clientName, right.clientName) ||
        compareZoneText(left.zoneName, right.zoneName) ||
        compareZoneText(left.qr, right.qr)
      )
    }

    if (mode === 'clientZone') {
      return (
        compareZoneText(left.clientName, right.clientName) ||
        compareZoneText(left.zoneName, right.zoneName) ||
        compareZoneText(left.location, right.location) ||
        compareZoneText(left.function, right.function) ||
        compareZoneText(left.qr, right.qr)
      )
    }

    if (mode === 'dateDesc') {
      return (
        compareZoneText(right.dateLabel, left.dateLabel) ||
        compareZoneText(left.clientName, right.clientName) ||
        compareZoneText(left.zoneName, right.zoneName) ||
        compareZoneText(left.qr, right.qr)
      )
    }

    return (
      compareZoneText(left.function, right.function) ||
      compareZoneText(left.clientName, right.clientName) ||
      compareZoneText(left.zoneName, right.zoneName) ||
      compareZoneText(left.qr, right.qr)
    )
  })
  return sorted
}

function getFilteredZones() {
  const qrFilter = String(document.getElementById('znQr')?.value ?? '').trim().toLowerCase()
  const clientFilter = String(document.getElementById('znClient')?.value ?? '').trim().toLowerCase()
  const zoneFilter = String(document.getElementById('znStrefa')?.value ?? '').trim().toLowerCase()
  const locationFilter = String(document.getElementById('znLoc')?.value ?? '').trim().toLowerCase()
  const functionFilter = String(document.getElementById('znFunkcja')?.value ?? '').trim().toLowerCase()
  const editedByFilter = String(document.getElementById('znEditedBy')?.value ?? '').trim().toLowerCase()
  const q = String(document.getElementById('znQ')?.value ?? '').trim().toLowerCase()

  return sortZonesForView(
    visiblePortalZones()
    .filter((zone) => {
      if (qrFilter && !String(zone.qr).toLowerCase().includes(qrFilter)) return false
      if (clientFilter && !String(zone.clientName).toLowerCase().includes(clientFilter)) return false
      if (zoneFilter && !String(zone.zoneName).toLowerCase().includes(zoneFilter)) return false
      if (locationFilter && !String(zone.location).toLowerCase().includes(locationFilter)) return false
      if (functionFilter && !String(zone.function).toLowerCase().includes(functionFilter)) return false
      if (editedByFilter && !String(zone.editedBy).toLowerCase().includes(editedByFilter)) return false

      if (!q) {
        return true
      }

      const haystack = [zone.qr, zone.clientName, zone.zoneName, zone.location, zone.function, zone.editedBy, zone.dateLabel]
        .map((value) => String(value ?? '').toLowerCase())
        .join(' ')

      return haystack.includes(q)
    }),
  )
}

function renderZonesRows(rows) {
  const root = document.getElementById('znRows')
  if (!root) {
    return
  }

  if (!rows.length) {
    root.innerHTML = `
      <div class="zones-row">
        <div>Brak wyników</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
      </div>
    `
    return
  }

  root.innerHTML = rows
    .map(
      (zone) => `
      <div class="zones-row">
        <div class="mono">${escapeHtml(zone.qr)}</div>
        <div>${escapeHtml(zone.clientName)}</div>
        <div>${zoneNameWithQrHtml(zone.zoneName, zone.qr)}</div>
        <div>${escapeHtml(zone.location)}</div>
        <div>${escapeHtml(zone.function)}</div>
        <div class="mono">${escapeHtml(zone.dateLabel)}</div>
        <div>${escapeHtml(zone.editedBy)}</div>
        <div class="zones-actions"><button class="btn2" type="button" data-zone-id="${escapeHtml(zone.id)}">Podgląd</button></div>
      </div>
    `,
    )
    .join('')
}

function updateZonesPager(paged) {
  const pageLabel = document.getElementById('znPageLabel')
  const label = document.getElementById('znShownLabel')
  const prevBtn = document.getElementById('znPrevBtn')
  const nextBtn = document.getElementById('znNextBtn')

  if (pageLabel) {
    pageLabel.textContent = `Strona ${paged.page} / ${paged.totalPages}`
  }

  if (!label) {
    return
  }

  label.textContent = `Wyświetlono: ${paged.items.length} · Wszystkie: ${paged.total} · Na stronę: ${paged.pageSize}`

  if (prevBtn) {
    prevBtn.disabled = paged.page <= 1
  }

  if (nextBtn) {
    nextBtn.disabled = paged.page >= paged.totalPages
  }
}

function filterZonesTable({ resetPage = true } = {}) {
  const filtered = getFilteredZones()
  if (resetPage) {
    appState.zonesPage = 1
  }

  const paged = paginate(filtered, appState.zonesPage, appState.zonesPageSize)
  appState.zonesPage = paged.page
  appState.zonesTotal = paged.total
  appState.zonesTotalPages = paged.totalPages

  renderZonesRows(paged.items)
  updateZonesPager(paged)
}

async function fetchZonesForCurrentSession(force = false) {
  const root = document.getElementById('znRows')

  if (!appState.session?.orgId) {
    if (root) {
      root.innerHTML = `
        <div class="zones-row">
          <div style="color:#ef4444;">Brak aktywnej sesji.</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
        </div>
      `
    }
    return
  }

  if (!force && appState.zonesLoaded) {
    filterZonesTable({ resetPage: false })
    return
  }

  if (root) {
    root.innerHTML = `
      <div class="zones-row">
        <div>Ładowanie danych...</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
      </div>
    `
  }

  try {
    const zones = await getZones(appState.session.orgId)
    appState.zones = zones
    appState.zonesLoaded = true
    filterZonesTable({ resetPage: true })
    setSubwelcomeMetric('#view-zones .subwelcome', visiblePortalZones().length)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd pobierania stref.'
    if (root) {
      root.innerHTML = `
        <div class="zones-row">
          <div style="color:#ef4444;">${escapeHtml(message)}</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
        </div>
      `
    }
  }
}

function resetZoneFilters() {
  ;['znQr', 'znClient', 'znStrefa', 'znLoc', 'znFunkcja', 'znEditedBy', 'znQ'].forEach((id) => {
    const input = document.getElementById(id)
    if (input) {
      input.value = ''
    }
  })
  const sort = document.getElementById('znSort')
  if (sort) {
    sort.value = 'functionAsc'
  }
}

function closeZoneModal() {
  const overlay = document.getElementById('znEditorOverlay')
  if (overlay) {
    overlay.style.display = 'none'
  }

  appState.zoneModalMode = 'add'
  appState.zoneModalZoneId = ''
}

function nextZoneQrCode() {
  const numbers = appState.zones
    .map((zone) => String(zone.id ?? '').trim().toUpperCase())
    .map((value) => {
      const match = value.match(/^BC(\d{1,6})$/)
      return match ? Number(match[1]) : Number.NaN
    })
    .filter((value) => Number.isFinite(value))

  const next = (numbers.length ? Math.max(...numbers) : 0) + 1
  return `BC${String(next).padStart(4, '0')}`
}

function openZoneAddModal() {
  const overlay = document.getElementById('znEditorOverlay')
  if (!overlay) {
    return
  }

  appState.zoneModalMode = 'add'
  appState.zoneModalZoneId = ''

  const qr = nextZoneQrCode()
  const qrLabel = document.getElementById('znQrLabel')
  const rowLabel = document.getElementById('znRowNumberLabel')
  const qrInput = document.getElementById('znEditQr')
  const clientInput = document.getElementById('znEditClient')
  const zoneInput = document.getElementById('znEditStrefa')
  const locationInput = document.getElementById('znEditLoc')
  const functionInput = document.getElementById('znEditFunkcja')
  const dateInput = document.getElementById('znEditData')
  const editedByInput = document.getElementById('znEditEdytowal')
  const saveBtn = document.getElementById('znSaveBtn')
  const deleteBtn = document.getElementById('znDeleteBtn')

  if (qrLabel) qrLabel.textContent = qr
  if (rowLabel) rowLabel.textContent = 'AUTO'
  if (qrInput) qrInput.value = qr
  if (clientInput) clientInput.value = ''
  if (zoneInput) zoneInput.value = ''
  if (locationInput) locationInput.value = ''
  if (functionInput) functionInput.value = ''
  if (dateInput) dateInput.value = formatDatePl(new Date().toISOString())
  if (editedByInput) editedByInput.value = appState.session?.name ?? '-'
  if (saveBtn) saveBtn.style.display = ''
  if (deleteBtn) deleteBtn.style.display = 'none'

  overlay.style.display = 'flex'
}

function openZonePreviewModal(zoneId) {
  const overlay = document.getElementById('znEditorOverlay')
  if (!overlay) {
    return
  }

  const zone = appState.zones.find((item) => item.id === zoneId)
  if (!zone) {
    return
  }

  appState.zoneModalMode = 'edit'
  appState.zoneModalZoneId = String(zoneId)
  const view = mapZoneForView(zone)

  const qrLabel = document.getElementById('znQrLabel')
  const rowLabel = document.getElementById('znRowNumberLabel')
  const qrInput = document.getElementById('znEditQr')
  const clientInput = document.getElementById('znEditClient')
  const zoneInput = document.getElementById('znEditStrefa')
  const locationInput = document.getElementById('znEditLoc')
  const functionInput = document.getElementById('znEditFunkcja')
  const dateInput = document.getElementById('znEditData')
  const editedByInput = document.getElementById('znEditEdytowal')
  const saveBtn = document.getElementById('znSaveBtn')
  const deleteBtn = document.getElementById('znDeleteBtn')

  if (qrLabel) qrLabel.textContent = view.qr
  if (rowLabel) rowLabel.textContent = '-'
  if (qrInput) qrInput.value = view.qr
  if (clientInput) clientInput.value = view.clientName
  if (zoneInput) zoneInput.value = view.zoneName
  if (locationInput) locationInput.value = view.location
  if (functionInput) functionInput.value = view.function
  if (dateInput) dateInput.value = view.dateLabel
  if (editedByInput) editedByInput.value = view.editedBy
  if (saveBtn) saveBtn.style.display = ''
  if (deleteBtn) deleteBtn.style.display = ''

  overlay.style.display = 'flex'
}

function resolveClientIdForZone(value) {
  const normalized = String(value ?? '').trim()
  if (!normalized) {
    return ''
  }

  const byId = appState.clients.find((client) => String(client.id).trim() === normalized)
  if (byId) {
    return String(byId.id)
  }

  const byName = appState.clients.find((client) => String(client.name).trim().toLowerCase() === normalized.toLowerCase())
  if (byName) {
    return String(byName.id)
  }

  return ''
}

async function saveZoneData() {
  if (!appState.session?.orgId) {
    return
  }

  const qr = String(document.getElementById('znEditQr')?.value ?? '').trim()
  const clientRaw = String(document.getElementById('znEditClient')?.value ?? '').trim()
  const zoneName = String(document.getElementById('znEditStrefa')?.value ?? '').trim()
  const location = String(document.getElementById('znEditLoc')?.value ?? '').trim()
  const functionName = String(document.getElementById('znEditFunkcja')?.value ?? '').trim()

  if (!qr || !clientRaw || !zoneName) {
    alert('Uzupełnij Numer QR, Klienta i Strefę.')
    return
  }

  const clientId = resolveClientIdForZone(clientRaw)
  if (!clientId) {
    alert('Nie znaleziono klienta. Wpisz ID klienta lub dokładną nazwę.')
    return
  }

  try {
    if (appState.zoneModalMode === 'add') {
      await createZone(appState.session.orgId, {
        id: qr,
        zoneId: qr,
        clientId,
        name: zoneName,
        function: functionName,
        location,
        editedBy: appState.session?.name ?? null,
        date: new Date().toISOString(),
      })
    } else if (appState.zoneModalMode === 'edit') {
      await updateZone(appState.session.orgId, appState.zoneModalZoneId || qr, {
        clientId,
        name: zoneName,
        function: functionName,
        location,
        editedBy: appState.session?.name ?? null,
        date: new Date().toISOString(),
      })
    }

    closeZoneModal()
    await fetchZonesForCurrentSession(true)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd zapisu strefy.'
    alert(message)
  }
}

async function deleteZoneData() {
  if (!appState.session?.orgId || appState.zoneModalMode !== 'edit' || !appState.zoneModalZoneId) {
    return
  }

  const confirmed = window.confirm(`Usunąć strefę ${appState.zoneModalZoneId}?`)
  if (!confirmed) {
    return
  }

  try {
    await deleteZone(appState.session.orgId, appState.zoneModalZoneId)
    closeZoneModal()
    await fetchZonesForCurrentSession(true)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd usuwania strefy.'
    alert(message)
  }
}

function workerBooleanValue(rawValue) {
  const value = String(rawValue ?? '')
    .trim()
    .toLowerCase()

  if (!value) {
    return null
  }

  if (value === '1' || value === 'true' || value === 'tak' || value === 'yes') {
    return true
  }

  if (value === '0' || value === 'false' || value === 'nie' || value === 'no') {
    return false
  }

  return null
}

function workerBoolLabel(value) {
  return value ? 'TAK' : 'NIE'
}

function updateWorkerProfilePager(paged) {
  const pageLabel = document.getElementById('wkPageLabel')
  const label = document.getElementById('wkShownLabel')
  const prevBtn = document.getElementById('wkPrevBtn')
  const nextBtn = document.getElementById('wkNextBtn')

  if (pageLabel) {
    pageLabel.textContent = `Strona ${paged.page} / ${paged.totalPages}`
  }

  if (!label) {
    return
  }

  label.textContent = `Wyświetlono: ${paged.items.length} · Wszystkie: ${paged.total} · Na stronę: ${paged.pageSize}`

  if (prevBtn) {
    prevBtn.disabled = paged.page <= 1
  }

  if (nextBtn) {
    nextBtn.disabled = paged.page >= paged.totalPages
  }
}

function getFilteredWorkerProfiles() {
  const q = normalizeSearchText(document.getElementById('wkQ')?.value)
  const typeFilter = normalizeSearchText(document.getElementById('wkType')?.value)
  const activeFilter = workerBooleanValue(document.getElementById('wkActive')?.value)
  const onlineFilter = workerBooleanValue(document.getElementById('wkOnline')?.value)

  return appState.workerProfileRows.filter((worker) => {
    const workerType = normalizeSearchText(worker.type ?? worker.role)
    if (typeFilter && !workerType.includes(typeFilter)) {
      return false
    }

    if (activeFilter !== null && Boolean(worker.active) !== activeFilter) {
      return false
    }

    const online = Boolean(worker.online)
    if (onlineFilter !== null && online !== onlineFilter) {
      return false
    }

    if (!q) {
      return true
    }

    const haystack = [
      worker.workerId,
      worker.id,
      worker.name,
      worker.login,
      worker.type,
      worker.role,
      worker.phone,
      worker.email,
      worker.qrText,
    ]
      .map((value) => normalizeSearchText(value))
      .join(' ')

    return haystack.includes(q)
  })
}

function renderWorkerProfileRows(rows) {
  const root = document.getElementById('wkRows')
  if (!root) {
    return
  }

  appState.workerProfileViewRows = rows

  if (!rows.length) {
    root.innerHTML = `
      <div class="workers-row">
        <div>Brak wyników</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
      </div>
    `
    return
  }

  const actionLabel = canManageWorkers() ? 'Edytuj' : 'Podgląd'
  root.innerHTML = rows
    .map(
      (worker, index) => `
      <div class="workers-row">
        <div class="mono">${escapeHtml(worker.workerId || worker.id || '-')}</div>
        <div>${escapeHtml(worker.name || '-')}</div>
        <div class="mono">${escapeHtml(worker.login || '-')}</div>
        <div>${escapeHtml(worker.type || worker.role || '-')}</div>
        <div><span class="pill ${worker.active ? 'pill-true' : 'pill-false'}">${escapeHtml(worker.active ? 'TRUE' : 'FALSE')}</span></div>
        <div><span class="pill ${worker.online ? 'pill-yes' : 'pill-no'}">${escapeHtml(workerBoolLabel(Boolean(worker.online)))}</span></div>
        <div>${escapeHtml(worker.phone || '-')}</div>
        <div>${escapeHtml(worker.email || '-')}</div>
        <div class="workers-actions">
          <button class="btn2" type="button" data-worker-profile-index="${index}">${actionLabel}</button>
        </div>
      </div>
    `,
    )
    .join('')
}

function setWorkerProfileModalReadOnly(readOnly) {
  const hint = document.getElementById('wkReadOnlyHint')
  if (hint) {
    hint.style.display = readOnly ? 'block' : 'none'
  }

  ;['wkEditName', 'wkEditLogin', 'wkEditType', 'wkEditActive', 'wkEditEmail', 'wkEditPhone', 'wkEditQr', 'wkNewPass', 'wkNewPass2'].forEach(
    (id) => {
      const input = document.getElementById(id)
      if (input) {
        input.disabled = readOnly
      }
    },
  )

  const saveButton = document.getElementById('wkSaveBtn')
  if (saveButton) {
    saveButton.style.display = readOnly ? 'none' : ''
  }

  const fillQrButton = document.getElementById('wkFillQrBtn')
  if (fillQrButton) {
    fillQrButton.style.display = readOnly ? 'none' : ''
  }
}

function syncWorkerProfileAddButtonState() {
  const addButton = document.getElementById('wkAddBtn')
  if (!(addButton instanceof HTMLButtonElement)) {
    return
  }

  const allowed = canManageWorkers()
  addButton.style.display = ''
  addButton.disabled = !allowed
  addButton.title = allowed ? 'Dodaj nowego użytkownika' : 'Brak uprawnień do dodawania użytkowników.'
}

function getNextWorkerProfileIdPreview() {
  let maxNumber = 0
  let padWidth = 3

  appState.workerProfileRows.forEach((worker) => {
    const raw = String(worker?.workerId ?? worker?.id ?? '')
      .trim()
      .toUpperCase()
    const match = /^W(\d+)$/.exec(raw)
    if (!match) {
      return
    }

    const numeric = Number.parseInt(match[1], 10)
    if (Number.isFinite(numeric) && numeric > maxNumber) {
      maxNumber = numeric
    }
    padWidth = Math.max(padWidth, match[1].length)
  })

  return `W${String(maxNumber + 1).padStart(padWidth, '0')}`
}

let workerProfileDefaultTypeOptionsHtml = ''

function configureWorkerProfileRoleOptions(typeInput, mode) {
  if (!(typeInput instanceof HTMLSelectElement)) {
    return
  }

  if (!workerProfileDefaultTypeOptionsHtml) {
    workerProfileDefaultTypeOptionsHtml = typeInput.innerHTML
  }

  if (mode === 'add') {
    typeInput.innerHTML = `
      <option value="WORKER">WORKER</option>
      <option value="MANAGER">MANAGER</option>
    `
    typeInput.value = 'WORKER'
    return
  }

  if (typeInput.innerHTML !== workerProfileDefaultTypeOptionsHtml) {
    typeInput.innerHTML = workerProfileDefaultTypeOptionsHtml
  }
}

function workerProfileRoleForCreate(value) {
  const role = String(value ?? '').trim().toUpperCase()
  if (role === 'MANAGER' || role === 'KIEROWNIK') return 'MANAGER'
  if (role === 'WORKER' || role === 'PRACOWNIK') return 'WORKER'
  return ''
}

function workerProfileLoginFromEmail(value) {
  const email = String(value ?? '').trim().toLowerCase()
  if (!email.includes('@')) {
    return ''
  }
  return email.split('@')[0] || ''
}

function openWorkerProfileModal(worker = null, mode = 'view') {
  const overlay = document.getElementById('wkEditorOverlay')
  if (!overlay) {
    return
  }

  appState.workerProfileCurrent = worker
  appState.workerProfileModalMode = mode

  const modalTitle = document.getElementById('wkModalTitle')
  const idLabel = document.getElementById('wkIdLabel')
  const addedAtLabel = document.getElementById('wkAddedAt')
  const editedAtLabel = document.getElementById('wkEditedAt')
  const editedByLabel = document.getElementById('wkEditedBy')
  const idInput = document.getElementById('wkEditId')
  const nameInput = document.getElementById('wkEditName')
  const loginInput = document.getElementById('wkEditLogin')
  const typeInput = document.getElementById('wkEditType')
  const activeInput = document.getElementById('wkEditActive')
  const onlineInput = document.getElementById('wkOnlineNow')
  const emailInput = document.getElementById('wkEditEmail')
  const phoneInput = document.getElementById('wkEditPhone')
  const qrInput = document.getElementById('wkEditQr')
  const newPassInput = document.getElementById('wkNewPass')
  const newPass2Input = document.getElementById('wkNewPass2')
  const deleteButton = document.getElementById('wkDeleteBtn')
  const passWrap = document.getElementById('wkCurrentPassWrap')
  const currentPass = document.getElementById('wkCurrentPass')
  const showPassButton = document.getElementById('wkShowPassBtn')
  const saveButton = document.getElementById('wkSaveBtn')

  const headerLogo = document.querySelector('.header .logo-block img')
  const modalLogo = document.getElementById('wkLogo')
  if (modalLogo && headerLogo?.getAttribute('src')) {
    modalLogo.setAttribute('src', headerLogo.getAttribute('src'))
  }

  configureWorkerProfileRoleOptions(typeInput, mode)

  if (mode === 'add') {
    const nextWorkerId = getNextWorkerProfileIdPreview()
    if (modalTitle) modalTitle.textContent = 'Dodaj użytkownika'
    if (saveButton) saveButton.textContent = 'Dodaj użytkownika'
    if (idLabel) idLabel.textContent = nextWorkerId
    if (addedAtLabel) addedAtLabel.textContent = '-'
    if (editedAtLabel) editedAtLabel.textContent = '-'
    if (editedByLabel) editedByLabel.textContent = appState.session?.name ?? '-'
    if (idInput) idInput.value = nextWorkerId
    if (nameInput) nameInput.value = ''
    if (loginInput) {
      loginInput.value = ''
      loginInput.dataset.autoFromEmail = '1'
    }
    if (typeInput) typeInput.value = 'WORKER'
    if (activeInput) activeInput.value = '1'
    if (onlineInput) onlineInput.value = 'NIE'
    if (emailInput) emailInput.value = ''
    if (phoneInput) phoneInput.value = ''
    if (qrInput) qrInput.value = ''
  } else {
    if (modalTitle) modalTitle.textContent = canManageWorkers() ? 'Edytuj pracownika' : 'Podgląd pracownika'
    if (saveButton) saveButton.textContent = 'Zapisz'
    if (idLabel) idLabel.textContent = worker?.workerId || worker?.id || '-'
    if (addedAtLabel) addedAtLabel.textContent = worker?.addedAt || '-'
    if (editedAtLabel) editedAtLabel.textContent = worker?.editedAt || '-'
    if (editedByLabel) editedByLabel.textContent = worker?.editedBy || '-'
    if (idInput) idInput.value = worker?.workerId || worker?.id || '-'
    if (nameInput) nameInput.value = worker?.name || ''
    if (loginInput) {
      loginInput.value = worker?.login || ''
      loginInput.dataset.autoFromEmail = '0'
    }
    if (typeInput) typeInput.value = worker?.type || worker?.role || 'Pracownik'
    if (activeInput) activeInput.value = worker?.active ? '1' : '0'
    if (onlineInput) onlineInput.value = workerBoolLabel(Boolean(worker?.online))
    if (emailInput) emailInput.value = worker?.email || ''
    if (phoneInput) phoneInput.value = worker?.phone || ''
    if (qrInput) qrInput.value = worker?.qrText || ''
  }

  if (newPassInput) newPassInput.value = ''
  if (newPass2Input) newPass2Input.value = ''

  if (passWrap) {
    passWrap.style.display = 'none'
  }
  if (currentPass) {
    currentPass.value = ''
    currentPass.type = 'password'
  }
  if (showPassButton) {
    showPassButton.textContent = 'Pokaż'
  }

  if (deleteButton) {
    deleteButton.style.display = mode === 'edit' && canDeleteWorkers() ? '' : 'none'
  }

  setWorkerProfileModalReadOnly(mode === 'view' || !canManageWorkers())
  overlay.style.display = 'flex'
}

function closeWorkerProfileModal() {
  const overlay = document.getElementById('wkEditorOverlay')
  if (overlay) {
    overlay.style.display = 'none'
  }

  appState.workerProfileCurrent = null
  appState.workerProfileModalMode = 'view'
}

function fillWorkerQrFromCredentials() {
  const login = String(document.getElementById('wkEditLogin')?.value ?? '').trim()
  const password = String(document.getElementById('wkNewPass')?.value ?? '').trim()
  if (!login || !password) {
    alert('Wpisz Login i Nowe hasło, aby uzupełnić QR.')
    return
  }

  const qrInput = document.getElementById('wkEditQr')
  if (qrInput) {
    qrInput.value = `login=${login};haslo=${password}`
  }
}

function resetWorkerProfileFilters() {
  const qInput = document.getElementById('wkQ')
  const typeInput = document.getElementById('wkType')
  const activeInput = document.getElementById('wkActive')
  const onlineInput = document.getElementById('wkOnline')
  if (qInput) qInput.value = ''
  if (typeInput) typeInput.value = ''
  if (activeInput) activeInput.value = ''
  if (onlineInput) onlineInput.value = ''
}

function filterWorkerProfileTable({ resetPage = true } = {}) {
  const filtered = getFilteredWorkerProfiles()
  if (resetPage) {
    appState.workerProfilePage = 1
  }

  const paged = paginate(filtered, appState.workerProfilePage, appState.workerProfilePageSize)
  appState.workerProfilePage = paged.page
  appState.workerProfileTotal = paged.total
  appState.workerProfileTotalPages = paged.totalPages

  renderWorkerProfileRows(paged.items)
  updateWorkerProfilePager(paged)
}

async function fetchWorkerProfilesForCurrentSession(force = false) {
  syncWorkerProfileAddButtonState()

  const root = document.getElementById('wkRows')

  if (!appState.session?.orgId) {
    if (root) {
      root.innerHTML = `
        <div class="workers-row">
          <div style="color:#ef4444;">Brak aktywnej sesji.</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
        </div>
      `
    }
    return
  }

  if (!force && appState.workerProfileRows.length) {
    filterWorkerProfileTable({ resetPage: false })
    return
  }

  if (root) {
    root.innerHTML = `
      <div class="workers-row">
        <div>Ładowanie danych...</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
      </div>
    `
  }

  try {
    const workers = await getWorkers(appState.session.orgId)

    appState.workerProfileRows = workers.map((worker) => ({
      ...worker,
      online: Boolean(worker.online ?? false),
      phone: String(worker.phone ?? ''),
      email: String(worker.email ?? ''),
      qrText: String(worker.qrText ?? ''),
    }))

    appState.workers = workers
    appState.workersLoaded = true
    filterWorkerProfileTable({ resetPage: true })
    setSubwelcomeMetric('#view-workerProfile .subwelcome', appState.workerProfileRows.length)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd pobierania pracowników.'
    if (root) {
      root.innerHTML = `
        <div class="workers-row">
          <div style="color:#ef4444;">${escapeHtml(message)}</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
        </div>
      `
    }
  }
}

async function saveWorkerProfileData() {
  if (!appState.session?.orgId) {
    return
  }

  if (!canManageWorkers()) {
    alert('Brak uprawnień do zapisu pracownika.')
    return
  }

  const payload = {
    name: String(document.getElementById('wkEditName')?.value ?? '').trim(),
    login: String(document.getElementById('wkEditLogin')?.value ?? '').trim(),
    role: String(document.getElementById('wkEditType')?.value ?? 'Pracownik').trim(),
    active: String(document.getElementById('wkEditActive')?.value ?? '1').trim() === '1',
    email: String(document.getElementById('wkEditEmail')?.value ?? '').trim(),
    phone: String(document.getElementById('wkEditPhone')?.value ?? '').trim(),
    qrText: String(document.getElementById('wkEditQr')?.value ?? '').trim(),
  }

  if (!payload.name || !payload.login) {
    alert('Uzupełnij imię i login.')
    return
  }

  const newPass = String(document.getElementById('wkNewPass')?.value ?? '').trim()
  const repeatPass = String(document.getElementById('wkNewPass2')?.value ?? '').trim()
  const isAddingUser = appState.workerProfileModalMode === 'add'
  const createRole = workerProfileRoleForCreate(payload.role)

  if (isAddingUser) {
    if (!payload.email) {
      alert('Podaj email użytkownika.')
      return
    }

    if (!createRole) {
      alert('Nowy użytkownik może mieć rolę MANAGER albo WORKER.')
      return
    }

    const expectedLogin = workerProfileLoginFromEmail(payload.email)
    if (expectedLogin && payload.login.toLowerCase() !== expectedLogin) {
      alert('Login musi być taki sam jak część emaila przed @, aby mobile działał bez aliasów.')
      return
    }

    if (!newPass || newPass.length < 6) {
      alert('Hasło tymczasowe musi mieć co najmniej 6 znaków.')
      return
    }
  }

  if (newPass || repeatPass) {
    if (newPass !== repeatPass) {
      alert('Hasła nie są takie same.')
      return
    }
  }

  try {
    if (isAddingUser) {
      await createWorkerUser(appState.session.orgId, {
        ...payload,
        displayName: payload.name,
        password: newPass,
        role: createRole,
      })
      showTransientNotice('Użytkownik został dodany i może się zalogować.')
    } else {
      const currentLogin = String(appState.workerProfileCurrent?.login ?? '').trim()
      if (!currentLogin) {
        throw new Error('Brak loginu pracownika do edycji.')
      }

      await updateWorker(appState.session.orgId, currentLogin, {
        workerId: String(document.getElementById('wkEditId')?.value ?? appState.workerProfileCurrent?.workerId ?? appState.workerProfileCurrent?.id ?? '').trim(),
        name: payload.name,
        login: payload.login,
        role: payload.role,
        workerType: payload.role,
        active: payload.active,
        email: payload.email,
        loginEmail: payload.email,
        phone: payload.phone,
        editedBy: String(appState.session?.name ?? '').trim(),
      })
      showTransientNotice('Zmiany pracownika zostały zapisane.')
    }

    closeWorkerProfileModal()
    await fetchWorkerProfilesForCurrentSession(true)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd zapisu pracownika.'
    alert(message)
  }
}

async function deleteWorkerProfileData() {
  if (!canDeleteWorkers()) {
    alert('Brak uprawnień do usuwania pracownika.')
    return
  }

  alert('Usuwanie pracownika będzie podpięte po dodaniu operacji DeleteWorkerForOrg w Data Connect.')
}

function workerTimeSelectionKey(worker) {
  return String(worker?.login ?? worker?.workerId ?? worker?.id ?? '').trim()
}

function workerTimeIsSelected(key) {
  const normalized = String(key ?? '').trim()
  if (!normalized) {
    return false
  }
  return appState.workerTimeSelectedKeys.has(normalized)
}

function workerTimeSetSelected(key, selected) {
  const normalized = String(key ?? '').trim()
  if (!normalized) {
    return
  }

  if (selected) {
    appState.workerTimeSelectedKeys.add(normalized)
  } else {
    appState.workerTimeSelectedKeys.delete(normalized)
  }
}

function workerTimeResetSelection() {
  appState.workerTimeSelectedKeys = new Set()
  appState.workerTimeCurrentPageKeys = []
}

function workerTimeSyncSelectionUi() {
  const selectAll = document.getElementById('wtSelectAll')
  if (!(selectAll instanceof HTMLInputElement)) {
    return
  }

  const pageKeys = appState.workerTimeCurrentPageKeys
  if (!pageKeys.length) {
    selectAll.checked = false
    selectAll.indeterminate = false
    return
  }

  const selectedOnPage = pageKeys.filter((key) => workerTimeIsSelected(key)).length
  selectAll.checked = selectedOnPage > 0 && selectedOnPage === pageKeys.length
  selectAll.indeterminate = selectedOnPage > 0 && selectedOnPage < pageKeys.length
}

function workerTimeToggleSelectAllOnPage(checked) {
  appState.workerTimeCurrentPageKeys.forEach((key) => workerTimeSetSelected(key, checked))
  workerTimeSyncSelectionUi()
}

function getFilteredWorkerTimeRows(rows = appState.workerTimeRows) {
  const q = normalizeSearchText(document.getElementById('wtQ')?.value)
  const typeFilter = normalizeSearchText(document.getElementById('wtType')?.value)
  const idFilter = normalizeSearchText(document.getElementById('wtWorkerId')?.value)
  const activeFilter = workerBooleanValue(document.getElementById('wtActive')?.value)

  return rows.filter((worker) => {
    if (typeFilter) {
      const workerType = normalizeSearchText(worker.type ?? worker.role)
      if (!workerType.includes(typeFilter)) {
        return false
      }
    }

    if (idFilter) {
      const workerIds = [worker.workerId, worker.id, worker.login]
        .map((value) => normalizeSearchText(value))
        .join(' ')
      if (!workerIds.includes(idFilter)) {
        return false
      }
    }

    if (activeFilter !== null && Boolean(worker.active) !== activeFilter) {
      return false
    }

    if (!q) {
      return true
    }

    const haystack = [worker.workerId, worker.id, worker.name, worker.login, worker.type, worker.role, worker.phone, worker.email]
      .map((value) => normalizeSearchText(value))
      .join(' ')
    return haystack.includes(q)
  })
}

function renderWorkerRows(rows) {
  const root = document.getElementById('wtRows')
  if (!root) {
    return
  }

  appState.workerTimeViewRows = rows

  if (!rows.length) {
    appState.workerTimeCurrentPageKeys = []
    root.innerHTML = `
      <div class="events-row">
        <div class="events-select-col"></div><div>Brak wyników</div><div></div><div></div><div></div><div></div>
      </div>
    `
    workerTimeSyncSelectionUi()
    return
  }

  appState.workerTimeCurrentPageKeys = rows.map((worker) => workerTimeSelectionKey(worker)).filter(Boolean)

  root.innerHTML = rows
    .map(
      (worker) => `
      <div class="events-row${workerTimeIsSelected(workerTimeSelectionKey(worker)) ? ' is-selected' : ''}">
        <div class="events-select-col"><input type="checkbox" data-wt-select="${escapeHtml(workerTimeSelectionKey(worker))}" ${workerTimeIsSelected(workerTimeSelectionKey(worker)) ? 'checked' : ''} aria-label="Zaznacz pracownika ${escapeHtml(worker.name || worker.login || worker.id || '')}" /></div>
        <div class="mono">${escapeHtml(worker.workerId || worker.id || '-')}</div>
        <div>${escapeHtml(worker.name || '-')}</div>
        <div>${escapeHtml(worker.type || '-')}</div>
        <div><span class="pill ${worker.active ? 'pill-true' : 'pill-false'}">${escapeHtml(worker.active ? 'TRUE' : 'FALSE')}</span></div>
        <div><button class="btn2" type="button" data-worker-login="${escapeHtml(worker.login || worker.id || '')}" data-worker-name="${escapeHtml(worker.name || '')}">Pokaż</button></div>
      </div>
    `,
    )
    .join('')

  workerTimeSyncSelectionUi()
}

function updateWorkersPager(paged) {
  const pageLabel = document.getElementById('wtPageLabel')
  const shownLabel = document.getElementById('wtShownLabel')
  const prevBtn = document.getElementById('wtPrevBtn')
  const nextBtn = document.getElementById('wtNextBtn')

  if (pageLabel) {
    pageLabel.textContent = `Strona ${paged.page} / ${paged.totalPages}`
  }

  if (shownLabel) {
    shownLabel.textContent = `Wyświetlono: ${paged.items.length} · Wszystkie: ${paged.total} · Na stronę: ${paged.pageSize}`
  }

  if (prevBtn) {
    prevBtn.disabled = paged.page <= 1
  }

  if (nextBtn) {
    nextBtn.disabled = paged.page >= paged.totalPages
  }
}

function renderWorkersPaged(rows, { resetPage = true } = {}) {
  if (resetPage) {
    appState.workersPage = 1
  }

  const paged = paginate(rows, appState.workersPage, appState.workersPageSize)
  appState.workersPage = paged.page
  appState.workersTotal = paged.total
  appState.workersTotalPages = paged.totalPages

  renderWorkerRows(paged.items)
  updateWorkersPager(paged)
}

function filterWorkerTimeTable({ resetPage = true } = {}) {
  const filteredRows = getFilteredWorkerTimeRows(appState.workerTimeRows)
  renderWorkersPaged(filteredRows, { resetPage })
  setSubwelcomeMetric('#view-workerTime .subwelcome', filteredRows.length)
}

function workerTimeResolveExportWorkers() {
  const selectedWorkers = appState.workerTimeRows.filter((worker) =>
    workerTimeIsSelected(workerTimeSelectionKey(worker)),
  )
  if (selectedWorkers.length) {
    return selectedWorkers
  }

  if (Array.isArray(appState.workerTimeViewRows) && appState.workerTimeViewRows.length) {
    return [...appState.workerTimeViewRows]
  }

  return getFilteredWorkerTimeRows(appState.workerTimeRows)
}

function workerTimeResolveRowDayKey(row) {
  const direct = String(row?.dayKey ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) {
    return direct
  }
  return workerDetailDateKeyFromIso(row?.startAt || row?.endAt)
}

const WORKER_TIME_EXPORT_COLUMNS = [
  {
    id: 'date',
    label: 'Data',
    weight: 1.0,
    getValue: (row) => workerDetailDateKeyToLabel(row.dayKey),
  },
  {
    id: 'worker',
    label: 'Pracownik',
    weight: 1.8,
    getValue: (row) => row.workerName || '-',
  },
  {
    id: 'workerId',
    label: 'ID pracownika',
    weight: 1.1,
    getValue: (row) => row.workerId || '-',
  },
  {
    id: 'login',
    label: 'Login',
    weight: 1.3,
    getValue: (row) => row.workerLogin || '-',
  },
  {
    id: 'type',
    label: 'Typ',
    weight: 1.6,
    getValue: (row) => row.workerType || '-',
  },
  {
    id: 'start',
    label: 'Start pracy',
    weight: 1.0,
    getValue: (row) => workerDetailIsoToHm(row.startIso),
  },
  {
    id: 'stop',
    label: 'Koniec pracy',
    weight: 1.0,
    getValue: (row) => workerDetailIsoToHm(row.endIso),
  },
  {
    id: 'work',
    label: 'Czas pracy',
    weight: 1.1,
    getValue: (row) => durationSecondsToHm(row.durationSec),
  },
  {
    id: 'net',
    label: 'Realny czas pracy',
    weight: 1.2,
    getValue: (row) => durationSecondsToHm(row.netSec),
  },
  {
    id: 'break',
    label: 'Przerwa',
    weight: 1.0,
    getValue: (row) => durationSecondsToHm(row.breakSec),
  },
  {
    id: 'status',
    label: 'Status',
    weight: 1.0,
    getValue: (row) => row.status || '-',
  },
]

function workerTimeResetExportOptions() {
  document.querySelectorAll('[data-wt-export-col]').forEach((checkbox) => {
    checkbox.checked = checkbox.defaultChecked
  })

  const landscape = document.querySelector('input[name="wtExportOrientation"][value="l"]')
  if (landscape) {
    landscape.checked = true
  }

  const fromInput = document.getElementById('wtExportFrom')
  const toInput = document.getElementById('wtExportTo')
  if (fromInput) {
    fromInput.value = firstDayOfCurrentMonthYmd()
  }
  if (toInput) {
    toInput.value = todayYmd()
  }
}

function workerTimeReadExportOptions() {
  const selectedIds = new Set(
    [...document.querySelectorAll('[data-wt-export-col]')]
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => String(checkbox.value ?? '').trim()),
  )

  const columns = WORKER_TIME_EXPORT_COLUMNS.filter((column) => selectedIds.has(column.id))
  const orientationRaw = String(
    document.querySelector('input[name="wtExportOrientation"]:checked')?.value ?? 'p',
  ).trim()
  const orientation = orientationRaw === 'l' ? 'l' : 'p'
  const fromYmd = String(document.getElementById('wtExportFrom')?.value ?? '').trim()
  const toYmd = String(document.getElementById('wtExportTo')?.value ?? '').trim()
  const ymdRegex = /^\d{4}-\d{2}-\d{2}$/

  if (!ymdRegex.test(fromYmd) || !ymdRegex.test(toYmd)) {
    alert('Wybierz poprawny zakres dat (OD i DO).')
    return null
  }

  if (fromYmd > toYmd) {
    alert('Data "Od" nie moze byc pozniejsza niz "Do".')
    return null
  }

  return { columns, orientation, fromYmd, toYmd }
}

function openWorkerTimeExportModal() {
  if (!workerTimeResolveExportWorkers().length) {
    alert('Brak pracownikow do eksportu.')
    return
  }

  workerTimeResetExportOptions()
  const overlay = document.getElementById('wtExportOverlay')
  if (overlay) {
    overlay.style.display = 'flex'
  }
}

function closeWorkerTimeExportModal() {
  const overlay = document.getElementById('wtExportOverlay')
  if (overlay) {
    overlay.style.display = 'none'
  }
}

async function workerTimeBuildExportRowsForWorkers(
  workers = [],
  { fromYmd = firstDayOfCurrentMonthYmd(), toYmd = todayYmd() } = {},
) {
  const selectedLogins = new Set(
    workers
      .map((worker) => String(worker?.login ?? worker?.workerId ?? worker?.id ?? '').trim())
      .filter(Boolean)
      .map((value) => normalizeSearchText(value)),
  )
  const selectedNames = new Set(
    workers
      .map((worker) => String(worker?.name ?? '').trim())
      .filter(Boolean)
      .map((value) => normalizeSearchText(value)),
  )

  const workerLookupByLogin = new Map()
  const workerLookupByName = new Map()
  appState.workerTimeRows.forEach((worker) => {
    const login = String(worker?.login ?? worker?.workerId ?? worker?.id ?? '').trim()
    const name = String(worker?.name ?? '').trim()
    const workerId = String(worker?.workerId ?? worker?.id ?? login).trim() || login || '-'
    const workerType = String(worker?.type ?? worker?.role ?? '').trim() || '-'
    const workerName = name || login || '-'
    const entry = { workerId, workerName, workerLogin: login || '-', workerType }
    if (login) {
      workerLookupByLogin.set(normalizeSearchText(login), entry)
    }
    if (name) {
      workerLookupByName.set(normalizeSearchText(name), entry)
    }
  })

  const response = await getWorkdays(appState.session.orgId, {
    source: 'workdays',
    fromIso: ymdToIsoRangeStart(fromYmd),
    toIso: ymdToIsoRangeEnd(toYmd),
    page: 1,
    pageSize: 100000,
  })

  return (response?.items ?? [])
    .filter((item) => {
      if (!selectedLogins.size && !selectedNames.size) {
        return true
      }
      const loginKey = normalizeSearchText(item?.workerLogin)
      const nameKey = normalizeSearchText(item?.workerName)
      return selectedLogins.has(loginKey) || selectedNames.has(nameKey)
    })
    .map((item) => {
      const loginKey = normalizeSearchText(item?.workerLogin)
      const nameKey = normalizeSearchText(item?.workerName)
      const resolvedWorker = workerLookupByLogin.get(loginKey) || workerLookupByName.get(nameKey) || null
      const dayKey = workerTimeResolveRowDayKey(item)
      const startIso = toIso(item?.startAt)
      const endIso = toIso(item?.endAt)
      const durationRaw = Number(item?.durationSec)
      const computedSec =
        Number.isFinite(durationRaw) && durationRaw >= 0
          ? Math.floor(durationRaw)
          : workerDetailComputeRangeSeconds(startIso, endIso)
      const breakSec = Math.max(0, Number(item?.breakSec ?? item?.pauseTotalSec ?? 0) || 0)
      return {
        workerId:
          String(resolvedWorker?.workerId ?? item?.workerId ?? item?.id ?? item?.workerLogin ?? '').trim() ||
          '-',
        workerName:
          String(resolvedWorker?.workerName ?? item?.workerName ?? item?.workerLogin ?? '').trim() || '-',
        workerLogin:
          String(resolvedWorker?.workerLogin ?? item?.workerLogin ?? item?.workerId ?? '').trim() || '-',
        workerType: String(resolvedWorker?.workerType ?? item?.workerType ?? item?.role ?? '').trim() || '-',
        dayKey,
        startIso,
        endIso,
        durationSec: Math.max(0, computedSec),
        breakSec,
        netSec: Math.max(0, computedSec - breakSec),
        status: String(item?.status ?? '').trim() || '-',
      }
    })
    .sort((left, right) => {
      const byName = normalizeSearchText(left.workerName).localeCompare(
        normalizeSearchText(right.workerName),
        'pl',
        { sensitivity: 'base' },
      )
      if (byName !== 0) {
        return byName
      }
      if (left.dayKey !== right.dayKey) {
        return left.dayKey < right.dayKey ? -1 : 1
      }
      const leftStart = new Date(toIso(left.startIso) || 0).getTime()
      const rightStart = new Date(toIso(right.startIso) || 0).getTime()
      return leftStart - rightStart
    })
}

async function downloadWorkerTimeEwidencjaPdf(options) {
  if (!appState.session?.orgId) {
    return
  }

  const exportButton = document.getElementById('wtExportPdfBtn')
  const openButton = document.getElementById('wtDownloadEwidencjaBtn')
  if (exportButton instanceof HTMLButtonElement) {
    exportButton.disabled = true
    exportButton.textContent = 'Generowanie PDF...'
  }
  if (openButton instanceof HTMLButtonElement) {
    openButton.disabled = true
  }

  try {
    const exportOptions = options ?? workerTimeReadExportOptions()
    if (!exportOptions) {
      return
    }
    if (!exportOptions.columns.length) {
      alert('Wybierz co najmniej jedna kolumne do eksportu.')
      return
    }

    const workers = workerTimeResolveExportWorkers()
    if (!workers.length) {
      alert('Brak pracownikow do eksportu.')
      return
    }

    const exportRows = await workerTimeBuildExportRowsForWorkers(workers, {
      fromYmd: exportOptions.fromYmd,
      toYmd: exportOptions.toYmd,
    })
    if (!exportRows.length) {
      alert('Brak danych ewidencji pracy dla wybranego zakresu.')
      return
    }

    const groups = new Map()
    exportRows.forEach((row) => {
      const groupKey = `${normalizeSearchText(row.workerLogin)}::${normalizeSearchText(row.workerName)}`
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          workerId: row.workerId || '-',
          workerName: row.workerName || '-',
          workerLogin: row.workerLogin || '-',
          workerType: row.workerType || '-',
          rows: [],
          totalWorkSec: 0,
          totalBreakSec: 0,
          totalNetSec: 0,
        })
      }

      const bucket = groups.get(groupKey)
      bucket.rows.push(row)
      bucket.totalWorkSec += Math.max(0, Number(row.durationSec ?? 0) || 0)
      bucket.totalBreakSec += Math.max(0, Number(row.breakSec ?? 0) || 0)
      bucket.totalNetSec += Math.max(0, Number(row.netSec ?? 0) || 0)
    })

    const groupedRows = [...groups.values()].sort((left, right) =>
      normalizeSearchText(left.workerName).localeCompare(normalizeSearchText(right.workerName), 'pl', {
        sensitivity: 'base',
      }),
    )

    const fromYmd = exportOptions.fromYmd
    const toYmd = exportOptions.toYmd
    const fromLabel = workerDetailDateKeyToLabel(fromYmd)
    const toLabel = workerDetailDateKeyToLabel(toYmd)

    const JsPdf = await ensureJsPdfLoaded()
    const pdf = new JsPdf({ orientation: exportOptions.orientation, unit: 'mm', format: 'a4' })
    await ensurePdfUnicodeFont(pdf)
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const left = 10
    const right = pageWidth - 10
    const availableWidth = right - left
    const totalWeight =
      exportOptions.columns.reduce((sum, column) => sum + (Number(column.weight) || 1), 0) || 1
    const columns = exportOptions.columns.map((column) => ({
      ...column,
      width: Math.max(10, (availableWidth * (Number(column.weight) || 1)) / totalWeight),
    }))

    const fitCell = (value, width) => {
      const text = String(value ?? '')
      const maxWidth = Math.max(6, width - 1.5)
      if (pdf.getTextWidth(text) <= maxWidth) {
        return text
      }
      let reduced = text
      while (reduced.length > 1 && pdf.getTextWidth(`${reduced}…`) > maxWidth) {
        reduced = reduced.slice(0, -1)
      }
      return `${reduced}…`
    }

    const drawTableHeader = (topY) => {
      setPdfUnicodeFont(pdf, 'bold')
      pdf.setFontSize(8.5)
      let x = left
      columns.forEach((column) => {
        pdf.text(column.label, x, topY)
        x += column.width
      })
      pdf.line(left, topY + 1.2, right, topY + 1.2)
    }

    groupedRows.forEach((group, groupIndex) => {
      if (groupIndex > 0) {
        pdf.addPage()
      }

      const workerTitle = `${group.workerName} (${group.workerId})`
      const subtitle = `Login: ${group.workerLogin} | Typ: ${group.workerType} | Zakres: ${fromLabel} - ${toLabel}`
      const summaryLine = `Wpisy: ${group.rows.length} | Czas pracy: ${durationSecondsToHm(group.totalWorkSec)} | Przerwy: ${durationSecondsToHm(group.totalBreakSec)} | Realny: ${durationSecondsToHm(group.totalNetSec)}`

      setPdfUnicodeFont(pdf, 'bold')
      pdf.setFontSize(12)
      pdf.text('Ewidencja pracy pracownika', left, 12)
      pdf.setFontSize(11)
      pdf.text(workerTitle, left, 18)
      setPdfUnicodeFont(pdf, 'normal')
      pdf.setFontSize(9)
      pdf.text(subtitle, left, 23)
      pdf.text(summaryLine, left, 28)

      let y = 35
      drawTableHeader(y)
      y += 6
      setPdfUnicodeFont(pdf, 'normal')
      pdf.setFontSize(8.2)

      group.rows.forEach((row, rowIndex) => {
        if (y > pageHeight - 10) {
          pdf.addPage()
          setPdfUnicodeFont(pdf, 'bold')
          pdf.setFontSize(10)
          pdf.text(`Ewidencja pracy - ${workerTitle} (cd.)`, left, 12)
          setPdfUnicodeFont(pdf, 'normal')
          pdf.setFontSize(8.5)
          pdf.text(`${fromLabel} - ${toLabel}`, left, 17)
          y = 24
          drawTableHeader(y)
          y += 6
          setPdfUnicodeFont(pdf, 'normal')
          pdf.setFontSize(8.2)
        }

        let x = left
        columns.forEach((column) => {
          pdf.text(fitCell(column.getValue(row), column.width), x, y)
          x += column.width
        })

        if (rowIndex < group.rows.length - 1) {
          pdf.setDrawColor(226, 232, 240)
          pdf.line(left, y + 1.4, right, y + 1.4)
          pdf.setDrawColor(0, 0, 0)
        }
        y += 5
      })
    })

    const filename = `ewidencja-pracy-pracownicy-${fromYmd}_${toYmd}.pdf`
    pdf.save(filename)
    showTransientNotice(`Pobrano PDF ewidencji. Osoby: ${groupedRows.length}, wpisy: ${exportRows.length}.`)
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : 'Nie udalo sie pobrac ewidencji pracy.'
    const upper = rawMessage.toUpperCase()
    const message =
      upper.includes('TOO MANY CONNECTIONS') || upper.includes('RESOURCE_EXHAUSTED')
        ? 'Baza danych jest chwilowo przeciazona. Sprobuj ponownie za chwile.'
        : rawMessage
    alert(message)
  } finally {
    if (exportButton instanceof HTMLButtonElement) {
      exportButton.disabled = false
      exportButton.textContent = 'Pobierz PDF'
    }
    if (openButton instanceof HTMLButtonElement) {
      openButton.disabled = false
    }
  }
}

async function downloadWorkerTimeEwidencja() {
  const exportOptions = workerTimeReadExportOptions()
  if (!exportOptions) {
    return
  }
  if (!exportOptions.columns.length) {
    alert('Wybierz co najmniej jedna kolumne do eksportu.')
    return
  }

  closeWorkerTimeExportModal()
  await downloadWorkerTimeEwidencjaPdf(exportOptions)
}

async function fetchWorkersForCurrentSession() {
  const root = document.getElementById('wtRows')

  if (!appState.session?.orgId) {
    workerTimeResetSelection()
    if (root) {
      root.innerHTML = `
        <div class="events-row">
          <div class="events-select-col"></div><div style="color:#ef4444;">Brak aktywnej sesji.</div><div></div><div></div><div></div><div></div>
        </div>
      `
    }
    return
  }

  if (root) {
    root.innerHTML = `
      <div class="events-row">
        <div class="events-select-col"></div><div>Ładowanie danych...</div><div></div><div></div><div></div><div></div>
      </div>
    `
  }

  try {
    const workers = await getWorkers(appState.session.orgId)
    appState.workers = workers
    appState.workersLoaded = true
    appState.workerTimeRows = workers
    workerTimeResetSelection()
    filterWorkerTimeTable({ resetPage: true })
  } catch (error) {
    workerTimeResetSelection()
    appState.workers = []
    appState.workersLoaded = false
    appState.workerTimeRows = []
    appState.workerTimeViewRows = []
    const message = error instanceof Error ? error.message : 'Błąd pobierania pracowników.'
    if (root) {
      root.innerHTML = `
        <div class="events-row">
          <div class="events-select-col"></div><div style="color:#ef4444;">${escapeHtml(message)}</div><div></div><div></div><div></div><div></div>
        </div>
      `
    }
  }
}

const WORKER_DETAIL_MONTH_NAMES_PL = [
  'styczeń',
  'luty',
  'marzec',
  'kwiecień',
  'maj',
  'czerwiec',
  'lipiec',
  'sierpień',
  'wrzesień',
  'październik',
  'listopad',
  'grudzień',
]

function workerDetailCanEdit() {
  return canManageWorkers()
}

function workerDetailDateKeyFromIso(value) {
  const iso = toIso(value)
  return iso ? iso.slice(0, 10) : ''
}

function workerDetailDateKeyToLabel(dayKey) {
  const value = String(dayKey ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return '-'
  }

  return `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)}`
}

function workerDetailIsoToTime(isoValue) {
  const iso = toIso(isoValue)
  if (!iso) {
    return '-'
  }

  const date = new Date(iso)
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

function workerDetailIsoToHm(isoValue) {
  const iso = toIso(isoValue)
  if (!iso) {
    return '-'
  }

  const date = new Date(iso)
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function workerDetailIsoToDateInput(isoValue) {
  const iso = toIso(isoValue)
  if (!iso) {
    return ''
  }

  return iso.slice(0, 10)
}

function workerDetailIsoToTimeInput(isoValue) {
  const iso = toIso(isoValue)
  if (!iso) {
    return ''
  }

  const date = new Date(iso)
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function workerDetailLocalDateAndTimeToIso(dateValue, timeValue) {
  const dateRaw = String(dateValue ?? '').trim()
  let timeRaw = String(timeValue ?? '').trim()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
    return ''
  }

  if (/^\d{2}:\d{2}$/.test(timeRaw)) {
    timeRaw = `${timeRaw}:00`
  }

  if (!/^\d{2}:\d{2}:\d{2}$/.test(timeRaw)) {
    return ''
  }

  const date = new Date(`${dateRaw}T${timeRaw}`)
  if (!Number.isFinite(date.getTime())) {
    return ''
  }

  return date.toISOString()
}

function workerDetailComputeRangeSeconds(startAt, endAt) {
  const startIso = toIso(startAt)
  const endIso = toIso(endAt)
  if (!startIso || !endIso) {
    return 0
  }

  const startMs = new Date(startIso).getTime()
  const endMs = new Date(endIso).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return 0
  }

  return Math.floor((endMs - startMs) / 1000)
}

function workerDetailAlertLevelFromWorkSec(workSec) {
  const seconds = Number(workSec ?? 0)
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 0
  }

  if (seconds > 10 * 3600) {
    return 2
  }

  if (seconds > 9 * 3600) {
    return 1
  }

  return 0
}

function workerDetailAckKey(dayKey) {
  return `${appState.selectedWorkerLogin}::${String(dayKey ?? '').trim()}`
}

function workerDetailIsAcked(dayKey) {
  const key = workerDetailAckKey(dayKey)
  return Boolean(appState.workerDetailAckMap[key])
}

function workerDetailSetAck(dayKey, ack = true) {
  const key = workerDetailAckKey(dayKey)
  appState.workerDetailAckMap[key] = Boolean(ack)
}

function workerDetailCurrentUserName() {
  return String(appState.session?.name ?? appState.session?.login ?? '').trim()
}

function workerDetailFindSelectedWorker() {
  const login = String(appState.selectedWorkerLogin ?? '').trim()
  if (!login) {
    return null
  }

  return (
    appState.workers.find((worker) => String(worker.login ?? worker.id ?? '').trim() === login) ??
    appState.workers.find((worker) => String(worker.workerId ?? '').trim() === login) ??
    null
  )
}

function setWorkerDetailHeadings() {
  const title = document.getElementById('wtdTitle')
  const sub = document.getElementById('wtdSub')

  if (!title || !sub) {
    return
  }

  if (!appState.selectedWorkerLogin) {
    title.textContent = 'Czas pracy - pracownik'
    sub.textContent = 'Wybierz pracownika z listy Czas pracy pracownika.'
    return
  }

  const worker = workerDetailFindSelectedWorker()
  const workerName = appState.selectedWorkerName || worker?.name || appState.selectedWorkerLogin
  const workerType = String(worker?.type ?? '').trim() || '—'
  const role = String(appState.session?.role ?? '').trim() || '—'
  const canEditLabel = workerDetailCanEdit() ? 'TAK' : 'NIE'

  title.textContent = `Czas pracy - ${workerName}`
  sub.textContent = `Typ pracownika: ${workerType} · Uprawnienia: ${role} · Edycja: ${canEditLabel}.`
}

function setWorkerDetailMonthCard(items) {
  const monthLabel = document.getElementById('wtdMonthLabel')
  const monthRange = document.getElementById('wtdMonthRange')
  const monthWork = document.getElementById('wtdMonthWork')
  const monthBreak = document.getElementById('wtdMonthBreak')
  const monthNet = document.getElementById('wtdMonthNet')
  const monthPick = document.getElementById('wtdMonthPick')
  const from = String(document.getElementById('wtdFrom')?.value ?? '').trim()
  const to = String(document.getElementById('wtdTo')?.value ?? '').trim()

  const totalWorkSec = items.reduce((sum, row) => sum + Math.max(0, Number(row.workSec ?? 0) || 0), 0)
  const totalBreakSec = items.reduce((sum, row) => sum + Math.max(0, Number(row.breakSec ?? 0) || 0), 0)
  const totalNetSec = Math.max(0, totalWorkSec - totalBreakSec)

  const pickedOption = monthPick?.selectedOptions?.[0]?.textContent?.trim()
  const fallbackMonth = from ? from.slice(0, 7) : '—'

  if (monthLabel) monthLabel.textContent = pickedOption || fallbackMonth
  if (monthRange) monthRange.textContent = from && to ? `${workerDetailDateKeyToLabel(from)} - ${workerDetailDateKeyToLabel(to)}` : '—'
  if (monthWork) monthWork.textContent = durationSecondsToHm(totalWorkSec)
  if (monthBreak) monthBreak.textContent = durationSecondsToHm(totalBreakSec)
  if (monthNet) monthNet.textContent = durationSecondsToHm(totalNetSec)
}

function workerDetailAggregateRows(rows) {
  const groups = new Map()
  const selectedWorker = workerDetailFindSelectedWorker()

  rows.forEach((row) => {
    const dayKey = String(row.dayKey ?? '').trim() || workerDetailDateKeyFromIso(row.startAt || row.endAt)
    if (!dayKey) {
      return
    }

    const startIso = toIso(row.startAt)
    const endIso = toIso(row.endAt)
    const updatedAtIso = toIso(row.updatedAt)
    const breakSec = Math.max(0, Number(row.breakSec ?? row.pauseTotalSec ?? 0) || 0)

    if (!groups.has(dayKey)) {
      groups.set(dayKey, {
        dayKey,
        workerName: String(row.workerName ?? appState.selectedWorkerName ?? selectedWorker?.name ?? appState.selectedWorkerLogin ?? '').trim(),
        workerType: String(row.workerType ?? selectedWorker?.type ?? '').trim(),
        workdayId: String(row.workdayId ?? row.id ?? '').trim(),
        startAt: startIso || '',
        endAt: endIso || '',
        breakSec,
        updatedBy: String(row.editedBy ?? '').trim(),
        comment: String(row.comment ?? '').trim(),
        latestUpdatedAt: updatedAtIso || '',
        sourceRows: [],
      })
    }

    const bucket = groups.get(dayKey)
    bucket.sourceRows.push(row)
    if (bucket.sourceRows.length > 1) {
      bucket.breakSec += breakSec
    }

    if (startIso) {
      if (!bucket.startAt || new Date(startIso).getTime() < new Date(bucket.startAt).getTime()) {
        bucket.startAt = startIso
        bucket.workdayId = String(row.workdayId ?? row.id ?? '').trim() || bucket.workdayId
      }
    }

    if (endIso) {
      if (!bucket.endAt || new Date(endIso).getTime() > new Date(bucket.endAt).getTime()) {
        bucket.endAt = endIso
      }
    }

    if (updatedAtIso) {
      if (!bucket.latestUpdatedAt || new Date(updatedAtIso).getTime() >= new Date(bucket.latestUpdatedAt).getTime()) {
        bucket.latestUpdatedAt = updatedAtIso
        bucket.updatedBy = String(row.editedBy ?? '').trim() || bucket.updatedBy
        bucket.comment = String(row.comment ?? '').trim() || bucket.comment
      }
    } else {
      bucket.updatedBy = bucket.updatedBy || String(row.editedBy ?? '').trim()
      bucket.comment = bucket.comment || String(row.comment ?? '').trim()
    }
  })

  return [...groups.values()]
    .map((bucket) => {
      const workSec = workerDetailComputeRangeSeconds(bucket.startAt, bucket.endAt)
      const breakSec = Math.max(0, Math.floor(Number(bucket.breakSec ?? 0)))
      const netSec = Math.max(0, workSec - breakSec)
      const alertLevel = workerDetailAlertLevelFromWorkSec(workSec)
      const alertAck = workerDetailIsAcked(bucket.dayKey)

      return {
        dayKey: bucket.dayKey,
        workdayId: bucket.workdayId,
        workerName: bucket.workerName || appState.selectedWorkerName || appState.selectedWorkerLogin || '-',
        workerType: bucket.workerType || String(selectedWorker?.type ?? '').trim(),
        startAt: bucket.startAt,
        endAt: bucket.endAt,
        workSec,
        breakSec,
        netSec,
        updatedBy: bucket.updatedBy || '-',
        comment: bucket.comment || '',
        alertLevel,
        alertAck,
        sourceRows: bucket.sourceRows,
      }
    })
    .sort((left, right) => {
      if (left.dayKey !== right.dayKey) {
        return left.dayKey < right.dayKey ? 1 : -1
      }

      const leftStart = new Date(toIso(left.startAt) || 0).getTime()
      const rightStart = new Date(toIso(right.startAt) || 0).getTime()
      return rightStart - leftStart
    })
}

function workerDetailSelectionKey(row) {
  return String(row?.dayKey ?? row?.workdayId ?? '').trim()
}

function workerDetailIsSelectedKey(key) {
  const normalized = String(key ?? '').trim()
  if (!normalized) {
    return false
  }

  return appState.workerDetailSelectedKeys.has(normalized)
}

function workerDetailSetSelectedKey(key, selected) {
  const normalized = String(key ?? '').trim()
  if (!normalized) {
    return
  }

  if (selected) {
    appState.workerDetailSelectedKeys.add(normalized)
  } else {
    appState.workerDetailSelectedKeys.delete(normalized)
  }
}

function workerDetailResetSelection() {
  appState.workerDetailSelectedKeys = new Set()
  appState.workerDetailCurrentPageKeys = []
}

function workerDetailToggleSelectAllOnPage(checked) {
  appState.workerDetailCurrentPageKeys.forEach((key) => {
    workerDetailSetSelectedKey(key, checked)
  })
  syncWorkerDetailSelectionUi()
}

function syncWorkerDetailSelectionUi() {
  const selectAll = document.getElementById('wtdSelectAll')
  if (!(selectAll instanceof HTMLInputElement)) {
    return
  }

  const pageKeys = appState.workerDetailCurrentPageKeys
  if (!pageKeys.length) {
    selectAll.checked = false
    selectAll.indeterminate = false
    return
  }

  const selectedOnPage = pageKeys.filter((key) => workerDetailIsSelectedKey(key)).length
  selectAll.checked = selectedOnPage > 0 && selectedOnPage === pageKeys.length
  selectAll.indeterminate = selectedOnPage > 0 && selectedOnPage < pageKeys.length
}

function workerDetailClampNumber(value, min, max, fallback) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return fallback
  }
  if (numeric < min) {
    return min
  }
  if (numeric > max) {
    return max
  }
  return Math.round(numeric)
}

function workerDetailNormalizeColumnWidths(rawValue) {
  const rawList = Array.isArray(rawValue) ? rawValue : []
  return workerDetailDefaultColumnWidths().map((defaultWidth, colIndex) =>
    workerDetailClampNumber(
      rawList[colIndex],
      workerDetailColumnMinWidth(colIndex),
      WORKER_DETAIL_COLUMN_MAX_WIDTH,
      defaultWidth,
    ),
  )
}

function workerDetailReadStoredColumnWidths() {
  try {
    const raw = window.sessionStorage.getItem(WORKER_DETAIL_COLUMN_WIDTHS_STORAGE_KEY)
    if (!raw) {
      return workerDetailNormalizeColumnWidths()
    }
    return workerDetailNormalizeColumnWidths(JSON.parse(raw))
  } catch {
    return workerDetailNormalizeColumnWidths()
  }
}

function workerDetailEnsureColumnWidthsLoaded() {
  if (appState.workerDetailColumnWidthsLoaded) {
    return
  }
  appState.workerDetailColumnWidths = workerDetailReadStoredColumnWidths()
  appState.workerDetailColumnWidthsLoaded = true
}

function workerDetailPersistColumnWidths() {
  const payload = workerDetailNormalizeColumnWidths(appState.workerDetailColumnWidths)
  appState.workerDetailColumnWidths = payload
  try {
    window.sessionStorage.setItem(WORKER_DETAIL_COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Ignore storage errors in private/locked contexts.
  }
}

function workerDetailBuildGridTemplateFromWidths(widths = []) {
  return workerDetailNormalizeColumnWidths(widths)
    .map((width) => `${width}px`)
    .join(' ')
}

function applyWorkerDetailColumnWidths() {
  workerDetailEnsureColumnWidthsLoaded()
  const table = document.getElementById('wtdEventsTable')
  if (table) {
    table.style.setProperty('--wtd-grid', workerDetailBuildGridTemplateFromWidths(appState.workerDetailColumnWidths))
  }
}

function workerDetailStopColumnDrag({ persist = true } = {}) {
  if (!workerDetailColumnDragState) {
    return
  }

  const { onMove, onUp } = workerDetailColumnDragState
  window.removeEventListener('mousemove', onMove)
  window.removeEventListener('mouseup', onUp)
  document.body.classList.remove(WORKER_DETAIL_COLUMN_RESIZE_CLASS)
  workerDetailColumnDragState = null

  if (persist) {
    workerDetailPersistColumnWidths()
  }
}

function workerDetailStartColumnDrag(colIndex, startClientX) {
  workerDetailEnsureColumnWidthsLoaded()
  workerDetailStopColumnDrag({ persist: false })

  const normalizedIndex = Number(colIndex)
  if (!Number.isInteger(normalizedIndex) || normalizedIndex < 0) {
    return
  }
  if (!WORKER_DETAIL_RESIZABLE_COLUMN_INDEXES.has(normalizedIndex)) {
    return
  }

  const currentWidth = Number(appState.workerDetailColumnWidths[normalizedIndex])
  const startWidth = Number.isFinite(currentWidth)
    ? currentWidth
    : workerDetailDefaultColumnWidths()[normalizedIndex] ?? 90
  const minWidth = workerDetailColumnMinWidth(normalizedIndex)

  const onMove = (event) => {
    const delta = Number(event.clientX) - Number(startClientX)
    const nextWidth = workerDetailClampNumber(startWidth + delta, minWidth, WORKER_DETAIL_COLUMN_MAX_WIDTH, startWidth)
    if (appState.workerDetailColumnWidths[normalizedIndex] === nextWidth) {
      return
    }
    appState.workerDetailColumnWidths[normalizedIndex] = nextWidth
    applyWorkerDetailColumnWidths()
  }

  const onUp = () => {
    workerDetailStopColumnDrag({ persist: true })
  }

  workerDetailColumnDragState = { onMove, onUp }
  document.body.classList.add(WORKER_DETAIL_COLUMN_RESIZE_CLASS)
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function workerDetailAttachColumnResizers() {
  const head = document.querySelector('#wtdEventsTable .events-head')
  if (!head) {
    return
  }

  const cells = [...head.children]
  cells.forEach((cell, colIndex) => {
    if (!(cell instanceof HTMLElement)) {
      return
    }
    cell.classList.add('wtd-head-cell')

    if (colIndex >= cells.length - 1 || !WORKER_DETAIL_RESIZABLE_COLUMN_INDEXES.has(colIndex)) {
      return
    }
    if (cell.querySelector('[data-wtd-col-resizer]')) {
      return
    }

    const handle = document.createElement('span')
    handle.className = 'wtd-col-resizer'
    handle.setAttribute('data-wtd-col-resizer', String(colIndex))
    handle.setAttribute('role', 'separator')
    handle.setAttribute('aria-orientation', 'vertical')
    handle.setAttribute('aria-label', 'Zmień szerokość kolumny')
    cell.appendChild(handle)
  })
}

function renderWorkerDetailRows(rows) {
  const root = document.getElementById('wtdSumRows')
  if (!root) {
    return
  }

  if (!rows.length) {
    appState.workerDetailCurrentPageKeys = []
    root.innerHTML = `
      <div class="events-row">
        <div class="events-select-col"></div><div>Brak wyników</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
      </div>
    `
    syncWorkerDetailSelectionUi()
    return
  }

  const canEdit = workerDetailCanEdit()
  appState.workerDetailCurrentPageKeys = rows.map((row) => workerDetailSelectionKey(row)).filter(Boolean)

  root.innerHTML = rows
    .map((row) => {
      const rowKey = workerDetailSelectionKey(row)
      const isSelected = workerDetailIsSelectedKey(rowKey)
      const alertClass = !row.alertAck && row.alertLevel === 2 ? ' wt-alert-level-2' : !row.alertAck && row.alertLevel === 1 ? ' wt-alert-level-1' : ''
      const actionCell = canEdit
        ? `<button class="btn2 wtd-edit-btn" type="button" data-worker-detail-edit="${escapeHtml(row.dayKey)}">Edytuj</button>`
        : '<span class="muted">—</span>'

      return `
        <div class="events-row${alertClass}${isSelected ? ' is-selected' : ''}">
          <div class="events-select-col"><input type="checkbox" data-worker-detail-select="${escapeHtml(rowKey)}" ${isSelected ? 'checked' : ''} aria-label="Zaznacz rekord dnia ${escapeHtml(workerDetailDateKeyToLabel(row.dayKey))}" /></div>
          <div class="mono">${escapeHtml(workerDetailDateKeyToLabel(row.dayKey))}</div>
          <div>${escapeHtml(row.workerName || appState.selectedWorkerName || appState.selectedWorkerLogin || '-')}</div>
          <div>${escapeHtml(row.workerType || '-')}</div>
          <div class="mono time-start">${escapeHtml(workerDetailIsoToHm(row.startAt))}</div>
          <div class="mono time-stop">${escapeHtml(workerDetailIsoToHm(row.endAt))}</div>
          <div class="mono work-brutto time-duration">${escapeHtml(durationSecondsToHm(row.workSec))}</div>
          <div class="mono work-bold time-duration">${escapeHtml(durationSecondsToHm(row.netSec))}</div>
          <div class="mono time-break">${escapeHtml(durationSecondsToHm(row.breakSec))}</div>
          <div>${escapeHtml(row.updatedBy || '-')}</div>
          <div>${actionCell}</div>
        </div>
      `
    })
    .join('')

  syncWorkerDetailSelectionUi()
}

function renderWorkerDetailCurrentPage() {
  const paged = paginate(appState.workerDetailRows, appState.workerDetailPage, appState.workerDetailPageSize)
  appState.workerDetailPage = paged.page
  renderWorkerDetailRows(paged.items)
  updateWorkerDetailPager(paged)
}

function paginate(items, page, pageSize) {
  const size = Math.max(Number(pageSize) || 50, 1)
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / size))
  const normalizedPage = Math.min(Math.max(Number(page) || 1, 1), totalPages)
  const start = (normalizedPage - 1) * size

  return {
    page: normalizedPage,
    pageSize: size,
    total,
    totalPages,
    items: items.slice(start, start + size),
  }
}

function updateWorkerDetailPager(paged) {
  const pageLabel = document.getElementById('wtdSumPageLabel')
  const shownLabel = document.getElementById('wtdSumShownLabel')
  const prevBtn = document.getElementById('wtdSumPrevBtn')
  const nextBtn = document.getElementById('wtdSumNextBtn')

  if (pageLabel) pageLabel.textContent = `Strona ${paged.page} / ${paged.totalPages}`
  if (shownLabel) shownLabel.textContent = `Wyświetlono: ${paged.items.length} · Wszystkie: ${paged.total} · Na stronę: ${paged.pageSize}`
  if (prevBtn) prevBtn.disabled = paged.page <= 1
  if (nextBtn) nextBtn.disabled = paged.page >= paged.totalPages
  syncWorkerDetailSelectionUi()
}

function fillWorkerDetailMonthPickForYear(year, selectedValue) {
  const monthPick = document.getElementById('wtdMonthPick')
  if (!monthPick || !Number.isFinite(year) || year < 2000 || year > 2100) {
    return
  }

  monthPick.innerHTML = ''
  for (let month = 1; month <= 12; month += 1) {
    const option = document.createElement('option')
    option.value = `${year}-${pad2(month)}`
    option.textContent = `${WORKER_DETAIL_MONTH_NAMES_PL[month - 1]} ${year}`
    monthPick.appendChild(option)
  }

  const fallback = `${year}-${pad2(new Date().getMonth() + 1)}`
  monthPick.value = selectedValue && monthPick.querySelector(`option[value="${selectedValue}"]`) ? selectedValue : fallback
}

function ensureWorkerDetailDefaults() {
  const from = document.getElementById('wtdFrom')
  const to = document.getElementById('wtdTo')

  if (from && !String(from.value ?? '').trim()) from.value = firstDayOfCurrentMonthYmd()
  if (to && !String(to.value ?? '').trim()) to.value = todayYmd()

  const toValue = String(to?.value ?? '').trim()
  const year = /^\d{4}-\d{2}-\d{2}$/.test(toValue) ? Number(toValue.slice(0, 4)) : new Date().getFullYear()
  const selectedMonth = /^\d{4}-\d{2}-\d{2}$/.test(toValue)
    ? toValue.slice(0, 7)
    : `${new Date().getFullYear()}-${pad2(new Date().getMonth() + 1)}`
  fillWorkerDetailMonthPickForYear(year, selectedMonth)
}

function applyMonthPickToWorkerDetail(monthValue) {
  const from = document.getElementById('wtdFrom')
  const to = document.getElementById('wtdTo')
  const value = String(monthValue ?? '').trim()

  if (!from || !to || !/^\d{4}-\d{2}$/.test(value)) {
    return
  }

  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const now = new Date()
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month
  const lastDay = isCurrentMonth ? now.getDate() : new Date(year, month, 0).getDate()

  from.value = `${value}-01`
  to.value = `${value}-${pad2(lastDay)}`
}

function ensureWorkerDetailModalLogo() {
  const logo = document.getElementById('wtdLogo')
  if (!logo) {
    return
  }

  if (String(logo.getAttribute('src') ?? '').trim()) {
    return
  }

  const source = document.querySelector('.header .logo-block img')
  const src = String(source?.getAttribute('src') ?? '').trim()
  if (src) {
    logo.setAttribute('src', src)
    return
  }

  logo.style.display = 'none'
}

function openWorkerDetailDayEditor(item) {
  if (!workerDetailCanEdit()) {
    alert('Brak uprawnień do edycji (ADMIN/Kierownik).')
    return
  }

  ensureWorkerDetailModalLogo()

  const dayItem = item ? { ...item, mode: 'edit' } : null
  if (!dayItem) {
    return
  }

  appState.workerDetailDayEditorItem = dayItem

  const dateInput = document.getElementById('wtdDayDateInput')
  const startInput = document.getElementById('wtdDayStartTime')
  const endInput = document.getElementById('wtdDayEndTime')
  const commentInput = document.getElementById('wtdDayComment')
  const title = document.getElementById('wtdDayTitle')
  const ackButton = document.getElementById('wtdDayAckBtn')
  const overlay = document.getElementById('wtdDayEditorOverlay')

  if (title) title.textContent = 'Edycja dnia pracy'
  if (dateInput) dateInput.value = dayItem.dayKey || workerDetailIsoToDateInput(dayItem.startAt || dayItem.endAt)
  if (startInput) startInput.value = workerDetailIsoToTimeInput(dayItem.startAt)
  if (endInput) endInput.value = workerDetailIsoToTimeInput(dayItem.endAt)
  if (commentInput) commentInput.value = String(dayItem.comment ?? '')

  if (ackButton) {
    const showAck = Number(dayItem.alertLevel ?? 0) > 0 && !dayItem.alertAck
    ackButton.style.display = showAck ? '' : 'none'
    ackButton.disabled = false
    ackButton.textContent = 'Zatwierdź przekroczenie normy'
  }

  updateWorkerDetailDayPreview()
  if (overlay) overlay.style.display = 'flex'
}

function openWorkerDetailDayEditorNew() {
  if (!workerDetailCanEdit()) {
    alert('Brak uprawnień do edycji (ADMIN/Kierownik).')
    return
  }

  ensureWorkerDetailModalLogo()

  const dateInput = document.getElementById('wtdDayDateInput')
  const startInput = document.getElementById('wtdDayStartTime')
  const endInput = document.getElementById('wtdDayEndTime')
  const commentInput = document.getElementById('wtdDayComment')
  const title = document.getElementById('wtdDayTitle')
  const ackButton = document.getElementById('wtdDayAckBtn')
  const overlay = document.getElementById('wtdDayEditorOverlay')

  appState.workerDetailDayEditorItem = { mode: 'add' }

  if (title) title.textContent = 'Dodaj dzień pracy'
  if (dateInput) dateInput.value = String(document.getElementById('wtdTo')?.value ?? '').trim() || todayYmd()
  if (startInput) startInput.value = ''
  if (endInput) endInput.value = ''
  if (commentInput) commentInput.value = ''
  if (ackButton) ackButton.style.display = 'none'

  updateWorkerDetailDayPreview()
  if (overlay) overlay.style.display = 'flex'
}

function closeWorkerDetailDayEditor() {
  const overlay = document.getElementById('wtdDayEditorOverlay')
  if (overlay) {
    overlay.style.display = 'none'
  }

  appState.workerDetailDayEditorItem = null
}

function updateWorkerDetailDayPreview() {
  const workInput = document.getElementById('wtdDayWork')
  if (!workInput) {
    return
  }

  const dateValue = String(document.getElementById('wtdDayDateInput')?.value ?? '').trim()
  const startValue = String(document.getElementById('wtdDayStartTime')?.value ?? '').trim()
  const endValue = String(document.getElementById('wtdDayEndTime')?.value ?? '').trim()

  const startAt = workerDetailLocalDateAndTimeToIso(dateValue, startValue)
  const endAt = workerDetailLocalDateAndTimeToIso(dateValue, endValue)
  const seconds = workerDetailComputeRangeSeconds(startAt, endAt)

  workInput.value = durationSecondsToHm(seconds)
}

async function saveWorkerDetailDayEditor() {
  if (!appState.session?.orgId || !appState.selectedWorkerLogin) {
    return
  }

  const mode = String(appState.workerDetailDayEditorItem?.mode ?? 'edit').trim()
  const dateValue = String(document.getElementById('wtdDayDateInput')?.value ?? '').trim()
  const startValue = String(document.getElementById('wtdDayStartTime')?.value ?? '').trim()
  const endValue = String(document.getElementById('wtdDayEndTime')?.value ?? '').trim()
  const comment = String(document.getElementById('wtdDayComment')?.value ?? '').trim()

  if (!dateValue || !startValue || !endValue) {
    alert('Uzupełnij datę, start i koniec.')
    return
  }

  const startAt = workerDetailLocalDateAndTimeToIso(dateValue, startValue)
  const endAt = workerDetailLocalDateAndTimeToIso(dateValue, endValue)
  if (!startAt || !endAt) {
    alert('Niepoprawny format daty lub czasu.')
    return
  }

  const durationSec = workerDetailComputeRangeSeconds(startAt, endAt)
  if (durationSec <= 0) {
    alert('Koniec pracy musi być późniejszy niż start.')
    return
  }

  if (durationSec > 24 * 3600) {
    alert('Czas pracy > 24h - sprawdź dane.')
    return
  }

  const saveButton = document.getElementById('wtdDaySaveBtn')
  if (saveButton) {
    saveButton.disabled = true
    saveButton.textContent = 'Zapisywanie...'
  }

  try {
    const editorName = workerDetailCurrentUserName()

    if (mode === 'add') {
      const dayAlreadyExists = appState.workerDetailRows.some((row) => row.dayKey === dateValue)
      if (dayAlreadyExists) {
        throw new Error(`Dzień ${dateValue} już istnieje. Użyj edycji.`)
      }

      await createWorkday(appState.session.orgId, {
        workerLogin: appState.selectedWorkerLogin,
        workerName: appState.selectedWorkerName || appState.selectedWorkerLogin,
        startAt,
        endAt,
        durationSec,
        status: 'CLOSED',
        comment,
        updatedBy: editorName,
      })
    } else {
      const dayKey = String(appState.workerDetailDayEditorItem?.dayKey ?? '').trim()
      const sourceRows =
        appState.workerDetailDayEditorItem?.sourceRows?.length > 0
          ? appState.workerDetailDayEditorItem.sourceRows
          : appState.workerDetailSourceRows.filter((row) => {
              const rowDayKey = String(row.dayKey ?? '').trim() || workerDetailDateKeyFromIso(row.startAt || row.endAt)
              return rowDayKey === dayKey
            })

      if (!sourceRows.length) {
        throw new Error('Nie znaleziono rekordów do aktualizacji dnia.')
      }

      let updatedCount = 0
      for (const source of sourceRows) {
        const workdayId = String(source.workdayId ?? source.id ?? '').trim()
        if (!workdayId) {
          continue
        }

        await updateWorkday(appState.session.orgId, workdayId, {
          workerLogin: appState.selectedWorkerLogin,
          workerName: appState.selectedWorkerName || appState.selectedWorkerLogin,
          utilityRoomId: source.utilityRoomId || source.roomId || null,
          startAt,
          endAt,
          durationSec,
          status: 'CLOSED',
          comment,
          updatedBy: editorName,
        })
        updatedCount += 1
      }

      if (!updatedCount) {
        throw new Error('Nie znaleziono poprawnego WorkdayID do aktualizacji.')
      }
    }

    closeWorkerDetailDayEditor()
    await fetchWorkerDetailForCurrentSession()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd zapisu dnia pracy.'
    alert(message)
  } finally {
    if (saveButton) {
      saveButton.disabled = false
      saveButton.textContent = 'Zapisz'
    }
  }
}

function ackWorkerDetailDay() {
  const item = appState.workerDetailDayEditorItem
  if (!item?.dayKey) {
    return
  }

  workerDetailSetAck(item.dayKey, true)
  appState.workerDetailRows = appState.workerDetailRows.map((row) =>
    row.dayKey === item.dayKey ? { ...row, alertAck: true } : row,
  )

  const ackButton = document.getElementById('wtdDayAckBtn')
  if (ackButton) {
    ackButton.style.display = 'none'
    ackButton.disabled = false
    ackButton.textContent = 'Zatwierdź przekroczenie normy'
  }

  renderWorkerDetailCurrentPage()
}

function workerDetailToCsvLine(values) {
  return values
    .map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`)
    .join(',')
}

const WORKER_DETAIL_EXPORT_COLUMNS = [
  {
    id: 'date',
    label: 'Data',
    weight: 1.1,
    getValue: (row) => workerDetailDateKeyToLabel(row.dayKey),
  },
  {
    id: 'worker',
    label: 'Pracownik',
    weight: 1.8,
    getValue: (row) => row.workerName || '-',
  },
  {
    id: 'type',
    label: 'Typ',
    weight: 1.0,
    getValue: (row) => row.workerType || '-',
  },
  {
    id: 'start',
    label: 'Start pracy',
    weight: 1.0,
    getValue: (row) => workerDetailIsoToHm(row.startAt),
  },
  {
    id: 'stop',
    label: 'Koniec pracy',
    weight: 1.0,
    getValue: (row) => workerDetailIsoToHm(row.endAt),
  },
  {
    id: 'work',
    label: 'Czas pracy',
    weight: 1.1,
    getValue: (row) => durationSecondsToHm(row.workSec),
  },
  {
    id: 'net',
    label: 'Realny czas pracy',
    weight: 1.2,
    getValue: (row) => durationSecondsToHm(row.netSec),
  },
  {
    id: 'break',
    label: 'Przerwa',
    weight: 1.0,
    getValue: (row) => durationSecondsToHm(row.breakSec),
  },
  {
    id: 'editedBy',
    label: 'Edytował',
    weight: 1.3,
    getValue: (row) => row.updatedBy || '-',
  },
  {
    id: 'comment',
    label: 'Komentarz',
    weight: 2.2,
    getValue: (row) => row.comment || '',
  },
  {
    id: 'alert',
    label: 'Alert',
    weight: 0.8,
    getValue: (row) => row.alertLevel || 0,
  },
  {
    id: 'ack',
    label: 'ACK',
    weight: 0.7,
    getValue: (row) => (row.alertAck ? 'TAK' : 'NIE'),
  },
]

function workerDetailSanitizeFilename(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
}

function workerDetailExportRows() {
  const selectedRows = appState.workerDetailRows.filter((row) => workerDetailIsSelectedKey(workerDetailSelectionKey(row)))
  const rows = selectedRows.length ? selectedRows : appState.workerDetailRows
  return [...rows].sort((left, right) => (left.dayKey > right.dayKey ? 1 : -1))
}

function workerDetailExportFilenameBase() {
  const month = String(document.getElementById('wtdMonthPick')?.value ?? todayYmd().slice(0, 7)).trim()
  const workerLabel = workerDetailSanitizeFilename(appState.selectedWorkerName || appState.selectedWorkerLogin || 'pracownik')
  return `ewidencja-pracy-${month}-${workerLabel || 'pracownik'}`
}

function workerDetailResetExportOptions() {
  document.querySelectorAll('[data-wtd-export-col]').forEach((checkbox) => {
    checkbox.checked = checkbox.defaultChecked
  })

  const landscape = document.querySelector('input[name="wtdExportOrientation"][value="l"]')
  if (landscape) {
    landscape.checked = true
  }
}

function workerDetailReadExportOptions() {
  const selectedIds = new Set(
    [...document.querySelectorAll('[data-wtd-export-col]')]
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => String(checkbox.value ?? '').trim()),
  )

  const columns = WORKER_DETAIL_EXPORT_COLUMNS.filter((column) => selectedIds.has(column.id))
  const orientationRaw = String(
    document.querySelector('input[name="wtdExportOrientation"]:checked')?.value ?? 'p',
  ).trim()
  const orientation = orientationRaw === 'l' ? 'l' : 'p'

  return { columns, orientation }
}

function workerDetailExportCsvContent(rows, columns) {
  const lines = []
  lines.push(workerDetailToCsvLine(columns.map((column) => column.label)))

  rows.forEach((row) => {
    lines.push(workerDetailToCsvLine(columns.map((column) => column.getValue(row))))
  })

  return lines.join('\n')
}

function downloadWorkerDetailEwidencjaCsv(options) {
  if (!appState.workerDetailRows.length) {
    alert('Brak danych do eksportu.')
    return
  }

  const exportOptions = options ?? workerDetailReadExportOptions()
  if (!exportOptions.columns.length) {
    alert('Wybierz co najmniej jedna kolumne do eksportu.')
    return
  }

  const rows = workerDetailExportRows()
  const csv = workerDetailExportCsvContent(rows, exportOptions.columns)
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const filenameBase = workerDetailExportFilenameBase()

  link.href = url
  link.download = `${filenameBase}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

async function downloadWorkerDetailEwidencjaPdf(options) {
  if (!appState.workerDetailRows.length) {
    alert('Brak danych do eksportu.')
    return
  }

  const exportOptions = options ?? workerDetailReadExportOptions()
  if (!exportOptions.columns.length) {
    alert('Wybierz co najmniej jedna kolumne do eksportu.')
    return
  }

  const rows = workerDetailExportRows()
  const JsPdf = await ensureJsPdfLoaded()
  const pdf = new JsPdf({ orientation: exportOptions.orientation, unit: 'mm', format: 'a4' })
  await ensurePdfUnicodeFont(pdf)
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const left = 10
  const right = pageWidth - 10
  const availableWidth = right - left
  const totalWeight = exportOptions.columns.reduce((sum, column) => sum + (Number(column.weight) || 1), 0) || 1
  const headerColumns = exportOptions.columns.map((column) => ({
    ...column,
    width: Math.max(10, (availableWidth * (Number(column.weight) || 1)) / totalWeight),
  }))

  const fitCell = (value, width) => {
    const text = String(value ?? '')
    const maxWidth = Math.max(6, width - 1)
    if (pdf.getTextWidth(text) <= maxWidth) {
      return text
    }

    let reduced = text
    while (reduced.length > 1 && pdf.getTextWidth(`${reduced}…`) > maxWidth) {
      reduced = reduced.slice(0, -1)
    }
    return `${reduced}…`
  }

  const drawHeader = (title, subtitle) => {
    setPdfUnicodeFont(pdf, 'bold')
    pdf.setFontSize(12)
    pdf.text(title, left, 12)
    setPdfUnicodeFont(pdf, 'normal')
    pdf.setFontSize(9)
    pdf.text(subtitle, left, 18)
  }

  const drawTableHead = (topY) => {
    setPdfUnicodeFont(pdf, 'bold')
    pdf.setFontSize(8.5)
    let x = left
    headerColumns.forEach((col) => {
      pdf.text(col.label, x, topY)
      x += col.width
    })
    pdf.line(left, topY + 1, right, topY + 1)
  }

  const month = String(document.getElementById('wtdMonthPick')?.value ?? todayYmd().slice(0, 7)).trim()
  const workerLabel = String(appState.selectedWorkerName || appState.selectedWorkerLogin || 'pracownik').trim()
  drawHeader('Ewidencja pracy', `${workerLabel} | miesiac: ${month} | rekordy: ${rows.length}`)

  let y = 26
  drawTableHead(y)
  y += 6
  setPdfUnicodeFont(pdf, 'normal')
  pdf.setFontSize(8.2)

  rows.forEach((row, index) => {
    if (y > pageHeight - 10) {
      pdf.addPage()
      drawHeader('Ewidencja pracy', `${workerLabel} | miesiac: ${month} | strona kontynuacja`)
      y = 26
      drawTableHead(y)
      y += 6
      setPdfUnicodeFont(pdf, 'normal')
      pdf.setFontSize(8.2)
    }
    let x = left
    headerColumns.forEach((col) => {
      pdf.text(fitCell(col.getValue(row), col.width), x, y)
      x += col.width
    })

    if (index < rows.length - 1) {
      pdf.setDrawColor(226, 232, 240)
      pdf.line(left, y + 1.4, right, y + 1.4)
      pdf.setDrawColor(0, 0, 0)
    }
    y += 5
  })

  const filenameBase = workerDetailExportFilenameBase()
  pdf.save(`${filenameBase}.pdf`)
}

function openWorkerDetailExportModal() {
  if (!appState.workerDetailRows.length) {
    alert('Brak danych do eksportu.')
    return
  }

  workerDetailResetExportOptions()
  const overlay = document.getElementById('wtdExportOverlay')
  if (overlay) {
    overlay.style.display = 'flex'
  }
}

function closeWorkerDetailExportModal() {
  const overlay = document.getElementById('wtdExportOverlay')
  if (overlay) {
    overlay.style.display = 'none'
  }
}

async function downloadWorkerDetailEwidencja(format = 'csv') {
  const exportOptions = workerDetailReadExportOptions()
  if (!exportOptions.columns.length) {
    alert('Wybierz co najmniej jedna kolumne do eksportu.')
    return
  }

  closeWorkerDetailExportModal()
  try {
    if (format === 'pdf') {
      await downloadWorkerDetailEwidencjaPdf(exportOptions)
      return
    }

    downloadWorkerDetailEwidencjaCsv(exportOptions)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Nie udalo sie pobrac ewidencji pracy.'
    alert(message)
  }
}

async function fetchWorkerDetailForCurrentSession({ resetPage = false } = {}) {
  const root = document.getElementById('wtdSumRows')
  setWorkerDetailHeadings()

  if (!appState.session?.orgId || !appState.selectedWorkerLogin) {
    workerDetailResetSelection()
    if (root) {
      root.innerHTML = `
        <div class="events-row">
          <div class="events-select-col"></div><div>Wybierz pracownika na widoku Czas pracy pracownika.</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
        </div>
      `
    }
    return
  }

  ensureWorkerDetailDefaults()
  if (resetPage) appState.workerDetailPage = 1

  if (root) {
    root.innerHTML = `
      <div class="events-row">
        <div class="events-select-col"></div><div>Ładowanie danych...</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
      </div>
    `
  }

  try {
    const response = await getWorkerTime(appState.session.orgId, appState.selectedWorkerLogin, {
      fromIso: ymdToIsoRangeStart(document.getElementById('wtdFrom')?.value),
      toIso: ymdToIsoRangeEnd(document.getElementById('wtdTo')?.value),
      page: 1,
      pageSize: 5000,
    })

    appState.workerDetailSourceRows = response.items ?? []
    appState.workerDetailViewRows = workerDetailAggregateRows(appState.workerDetailSourceRows)
    appState.workerDetailRows = appState.workerDetailViewRows
    workerDetailResetSelection()

    renderWorkerDetailCurrentPage()
    setWorkerDetailMonthCard(appState.workerDetailRows)
  } catch (error) {
    appState.workerDetailSourceRows = []
    appState.workerDetailViewRows = []
    appState.workerDetailRows = []
    workerDetailResetSelection()
    const message = error instanceof Error ? error.message : 'Błąd pobierania czasu pracy.'
    if (root) {
      root.innerHTML = `
        <div class="events-row">
          <div class="events-select-col"></div><div style="color:#ef4444;">${escapeHtml(message)}</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
        </div>
      `
    }
    updateWorkerDetailPager(paginate([], 1, appState.workerDetailPageSize))
    setWorkerDetailMonthCard([])
  }
}

function reportSetVisible(id, visible) {
  const element = document.getElementById(id)
  if (!element) {
    return
  }

  element.style.display = visible ? '' : 'none'
}

function reportSetStatus(message = '', isError = false) {
  const node = document.getElementById('repStatus')
  if (!node) {
    return
  }

  node.textContent = message
  node.style.color = isError ? '#b91c1c' : ''
}

function reportSetKpiValues(statsA = { count: 0, totalSec: 0 }, statsB = { count: 0, totalSec: 0 }) {
  const setValue = (id, value) => {
    const node = document.getElementById(id)
    if (node) {
      node.textContent = value
    }
  }

  setValue('repKpiCountA', String(statsA.count ?? 0))
  setValue('repKpiTimeA', durationSecondsToHms(statsA.totalSec ?? 0))
  setValue('repKpiCountB', String(statsB.count ?? 0))
  setValue('repKpiTimeB', durationSecondsToHms(statsB.totalSec ?? 0))
}

function reportResetCharts() {
  ;['repChartA', 'repChartB'].forEach((id) => {
    const root = document.getElementById(id)
    if (!root) {
      return
    }

    root.innerHTML = '<div class="rep-chart-empty">Brak danych do wykresu.</div>'
  })

  const titleA = document.getElementById('repChartPanelAName')
  if (titleA) {
    titleA.textContent = 'Panel A'
  }
  const titleB = document.getElementById('repChartPanelBName')
  if (titleB) {
    titleB.textContent = 'Panel B'
  }
}

function reportResetResults() {
  const summary = document.getElementById('repSummary')
  if (summary) {
    summary.innerHTML = ''
  }
  reportSetVisible('repSummary', false)
  reportSetVisible('repTableAWrap', false)
  reportSetVisible('repTableBWrap', false)
  reportSetVisible('repDiffWrap', false)
  reportSetKpiValues()
  reportResetCharts()
  reportSetStatus('')
  appState.reportLastCsv = ''

  const downloadButton = document.getElementById('repDownloadCsv')
  if (downloadButton) {
    downloadButton.disabled = true
  }
}

async function ensureReportsReferenceDataLoaded() {
  if (!appState.session?.orgId) {
    return
  }

  const tasks = []

  if (!appState.clientsLoaded) {
    tasks.push(
      getClients(appState.session.orgId).then((clients) => {
        appState.clients = clients
        appState.clientsLoaded = true
      }),
    )
  }

  if (!appState.workersLoaded) {
    tasks.push(
      getWorkers(appState.session.orgId).then((workers) => {
        appState.workers = workers
        appState.workersLoaded = true
      }),
    )
  }

  if (!appState.zonesLoaded) {
    tasks.push(
      getZones(appState.session.orgId).then((zones) => {
        appState.zones = zones
        appState.zonesLoaded = true
      }),
    )
  }

  if (tasks.length) {
    await Promise.all(tasks)
  }
}

function reportSetSelectOptions(selectId, options, placeholderLabel) {
  const select = document.getElementById(selectId)
  if (!select) {
    return
  }

  setSelectOptions(select, options, placeholderLabel)
}

function normalizeSearchText(value) {
  const lowered = String(value ?? '')
    .trim()
    .toLocaleLowerCase('pl')
  const normalized = typeof lowered.normalize === 'function' ? lowered.normalize('NFD') : lowered
  return normalized.replace(/[\u0300-\u036f]/g, '')
}

function reportHistoryFilterOptions(options, query) {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) {
    return [...options]
  }

  return options.filter((option) => {
    const label = normalizeSearchText(option.label)
    const value = normalizeSearchText(option.value)
    return label.includes(normalizedQuery) || value.includes(normalizedQuery)
  })
}

function reportHistoryGetSelectConfig(kind) {
  const normalizedKind = String(kind ?? '').trim().toLowerCase()
  if (normalizedKind === 'worker' || normalizedKind === 'workers') {
    return {
      inputId: 'repHistoryWorkerSearch',
      selectId: 'repHistoryWorker',
      placeholderLabel: '(wybierz osobe)',
      options: appState.reportHistoryWorkerOptions,
    }
  }

  if (normalizedKind === 'zone' || normalizedKind === 'zones') {
    return {
      inputId: 'repHistoryZoneSearch',
      selectId: 'repHistoryZone',
      placeholderLabel: '(wybierz strefe)',
      options: appState.reportHistoryZoneOptions,
    }
  }

  return {
    inputId: 'repHistoryClientSearch',
    selectId: 'repHistoryClient',
    placeholderLabel: '(wybierz obiekt)',
    options: appState.reportHistoryClientOptions,
  }
}

function reportHistorySetSelectExpanded(config, expanded, optionCount = 0) {
  const select = document.getElementById(config.selectId)
  if (!select) {
    return
  }

  if (!expanded) {
    select.size = 1
    select.classList.remove('is-expanded')
    return
  }

  const rows = Math.min(Math.max(Number(optionCount || 0) + 1, 2), 8)
  select.size = rows
  select.classList.add('is-expanded')
}

function reportHistoryCollapseSelect(kind) {
  reportHistorySetSelectExpanded(reportHistoryGetSelectConfig(kind), false, 0)
}

function reportHistoryCollapseAllSelects() {
  reportHistoryCollapseSelect('client')
  reportHistoryCollapseSelect('worker')
  reportHistoryCollapseSelect('zone')
}

function reportHistoryMaybeCollapseSelect(kind) {
  const config = reportHistoryGetSelectConfig(kind)
  const activeId = String(document.activeElement?.id ?? '').trim()
  if (activeId === config.inputId || activeId === config.selectId) {
    return
  }

  reportHistorySetSelectExpanded(config, false, 0)
}

function reportHistoryApplySelectFilter(kind, { expandOnEmpty = false } = {}) {
  const config = reportHistoryGetSelectConfig(kind)

  const select = document.getElementById(config.selectId)
  if (!select) {
    return
  }

  const currentValue = String(select.value ?? '').trim()
  const query = String(document.getElementById(config.inputId)?.value ?? '').trim()
  const filteredOptions = reportHistoryFilterOptions(config.options, query)
  const placeholderLabel = query && !filteredOptions.length ? '(brak dopasowan)' : config.placeholderLabel

  reportSetSelectOptions(config.selectId, filteredOptions, placeholderLabel)
  const placeholderOption = select.options[0]
  if (placeholderOption) {
    const hasMatches = filteredOptions.length > 0
    placeholderOption.hidden = hasMatches
    placeholderOption.disabled = hasMatches
  }
  reportHistorySetSelectExpanded(config, Boolean(query) || expandOnEmpty, filteredOptions.length)

  if (currentValue && filteredOptions.some((option) => option.value === currentValue)) {
    select.value = currentValue
  }
}

function reportHistoryApplyAllSelectFilters() {
  reportHistoryApplySelectFilter('client')
  reportHistoryApplySelectFilter('worker')
  reportHistoryApplySelectFilter('zone')
}

function reportDefaultDates() {
  ;['repA_from', 'repB_from'].forEach((id) => {
    const input = document.getElementById(id)
    if (input && !String(input.value ?? '').trim()) {
      input.value = firstDayOfCurrentMonthYmd()
    }
  })

  ;['repA_to', 'repB_to'].forEach((id) => {
    const input = document.getElementById(id)
    if (input && !String(input.value ?? '').trim()) {
      input.value = todayYmd()
    }
  })
}

function reportRefreshZoneOptions(panel) {
  const clientSelect = document.getElementById(`rep${panel}_client`)
  const zoneSelect = document.getElementById(`rep${panel}_zone`)
  const zoneSelectId = `rep${panel}_zone`
  if (!clientSelect || !zoneSelect) {
    return
  }

  const clientId = String(clientSelect.value ?? '').trim()
  const currentZoneId = String(zoneSelect.value ?? '').trim()

  if (!clientId) {
    reportSetSelectOptions(zoneSelectId, [], '(najpierw wybierz klienta)')
    zoneSelect.disabled = true
    return
  }

  const zones = appState.zones.filter((zone) => String(zone.clientId ?? '').trim() === clientId)
  const options = zones
    .map((zone) => ({
      value: String(zone.id ?? ''),
      label: zone.name || zone.zone || zone.id,
    }))
    .filter((option) => option.value)
    .sort((left, right) => left.label.localeCompare(right.label, 'pl', { sensitivity: 'base' }))

  reportSetSelectOptions(zoneSelectId, options, '(wszystkie strefy klienta)')
  zoneSelect.disabled = false

  if (currentZoneId) {
    const exists = options.some((option) => option.value === currentZoneId)
    if (exists) {
      zoneSelect.value = currentZoneId
    }
  }
}

function reportPanelLabel(panel) {
  const clientId = String(panel.clientId ?? '').trim()
  const zoneId = String(panel.zoneId ?? '').trim()
  const client = appState.clients.find((item) => String(item.id ?? '').trim() === clientId)
  const zone = appState.zones.find((item) => String(item.id ?? '').trim() === zoneId)

  const clientLabel = client?.name || clientId || 'Brak klienta'
  const zoneLabel = zone?.name || zone?.zone || zoneId || 'Wszystkie strefy'
  return `${clientLabel} / ${zoneLabel}`
}

function reportGroupByLocation(items) {
  const grouped = new Map()

  items.forEach((item) => {
    const rawLocation = String(item.lokalizacja ?? item.location ?? item.zoneName ?? item.strefa ?? '').trim()
    const key = rawLocation || 'Brak lokalizacji'
    const duration = Number(item.durationSec ?? 0)
    const durationSec = Number.isFinite(duration) && duration >= 0 ? Math.floor(duration) : 0

    if (!grouped.has(key)) {
      grouped.set(key, { location: key, totalSec: 0, count: 0 })
    }

    const bucket = grouped.get(key)
    bucket.totalSec += durationSec
    bucket.count += 1
  })

  return [...grouped.values()]
    .sort((left, right) => {
      if (right.totalSec !== left.totalSec) {
        return right.totalSec - left.totalSec
      }
      return left.location.localeCompare(right.location, 'pl', { sensitivity: 'base' })
    })
    .slice(0, 8)
}

function reportRenderLocationChart(containerId, buckets) {
  const root = document.getElementById(containerId)
  if (!root) {
    return
  }

  if (!buckets.length) {
    root.innerHTML = '<div class="rep-chart-empty">Brak danych do wykresu.</div>'
    return
  }

  const maxSec = Math.max(...buckets.map((bucket) => bucket.totalSec), 1)
  const barsHtml = buckets
    .map((bucket) => {
      const percent = Math.max(8, Math.round((bucket.totalSec / maxSec) * 100))
      const locationShort = bucket.location.length > 16 ? `${bucket.location.slice(0, 14)}...` : bucket.location
      return `
        <div class="rep-bar-item" title="${escapeHtml(bucket.location)}: ${escapeHtml(durationSecondsToHms(bucket.totalSec))}">
          <div class="rep-bar-meta">
            <span>${escapeHtml(durationSecondsToHms(bucket.totalSec))}</span>
            <span>${escapeHtml(String(bucket.count))} zd.</span>
          </div>
          <div class="rep-bar-track">
            <div class="rep-bar-fill" style="height:${percent}%"></div>
          </div>
          <div class="rep-bar-label">${escapeHtml(locationShort)}</div>
        </div>
      `
    })
    .join('')

  root.innerHTML = `<div class="rep-bars-inner">${barsHtml}</div>`
}

function reportRenderCharts(itemsA, itemsB, panelA, panelB) {
  const panelATitle = document.getElementById('repChartPanelAName')
  if (panelATitle) {
    panelATitle.textContent = `Panel A: ${reportPanelLabel(panelA)}`
  }

  const panelBTitle = document.getElementById('repChartPanelBName')
  if (panelBTitle) {
    panelBTitle.textContent = `Panel B: ${reportPanelLabel(panelB)}`
  }

  reportRenderLocationChart('repChartA', reportGroupByLocation(itemsA))
  reportRenderLocationChart('repChartB', reportGroupByLocation(itemsB))
}

async function prepareReportsView() {
  if (!appState.session?.orgId) {
    return
  }

  await ensureReportsReferenceDataLoaded()
  const workerDirectory = await getWorkers(appState.session.orgId)
  appState.workers = workerDirectory
  appState.workersLoaded = true

  const clientOptions = appState.clients.map((client) => ({
    value: String(client.id ?? ''),
    label: client.name ? `${client.name} (${client.id})` : String(client.id ?? ''),
  }))
  clientOptions.sort((left, right) => left.label.localeCompare(right.label, 'pl', { sensitivity: 'base' }))
  const workerOptions = workerDirectory.map((worker) => ({
    value: String(worker.login ?? worker.id ?? ''),
    label: worker.name || worker.login || worker.id,
  }))
  workerOptions.sort((left, right) => left.label.localeCompare(right.label, 'pl', { sensitivity: 'base' }))
  const zoneOptions = appState.zones
    .map((zone) => ({
      value: String(zone.id ?? ''),
      label: zone.name || zone.zone || zone.id,
    }))
    .filter((zone) => zone.value)
    .sort((left, right) => left.label.localeCompare(right.label, 'pl', { sensitivity: 'base' }))

  reportSetSelectOptions('repA_client', clientOptions, '(wybierz klienta)')
  reportSetSelectOptions('repB_client', clientOptions, '(wybierz klienta)')
  reportSetSelectOptions('repA_worker', workerOptions, '(wszyscy pracownicy)')
  reportSetSelectOptions('repB_worker', workerOptions, '(wszyscy pracownicy)')
  reportSetSelectOptions('repEventsClient', clientOptions, '(wszyscy klienci)')
  reportSetSelectOptions('repEventsWorker', workerOptions, '(wszyscy pracownicy)')
  reportSetSelectOptions('repEventsType', reportEventsTypeOptions(), 'Wszystkie typy')
  reportEventsDefaultDates()
  reportRefreshEventsZoneOptions()
  appState.reportHistoryClientOptions = [...clientOptions]
  appState.reportHistoryWorkerOptions = [...workerOptions]
  appState.reportHistoryZoneOptions = [...zoneOptions]
  reportHistoryApplyAllSelectFilters()
  reportRefreshZoneOptions('A')
  reportRefreshZoneOptions('B')
  reportDefaultDates()
  reportHistorySetTab(appState.reportHistoryTab)
  reportHistoryApplyRangeMode(reportHistoryReadRangeMode(), { force: false })
  reportHistoryResetResults({ clearStatus: true })
  reportHistorySetStatus('Wybierz filtr i kliknij "Pokaż historię".')
  reportSetKpiValues()
  reportResetCharts()
  reportSetStatus('Ustaw filtry i wygeneruj zestawienie zdarzeń.')
}

function reportHistoryNormalizeTab(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'workers' || normalized === 'zones') {
    return normalized
  }

  return 'objects'
}

function reportHistoryKindForTab(tab) {
  const normalized = reportHistoryNormalizeTab(tab)
  if (normalized === 'workers') {
    return 'workerTime'
  }
  if (normalized === 'zones') {
    return 'events'
  }

  return 'clients'
}

function reportHistoryBuilderConfig(kind) {
  const normalized = String(kind ?? '').trim()
  if (normalized === 'events') {
    return {
      tab: 'zones',
      title: 'Zdarzenia',
      subtitle: 'Historia zdarzeń według stref.',
      status: 'Wybierz strefę i kliknij "Pokaż historię".',
      showTabs: false,
    }
  }
  if (normalized === 'workerTime') {
    return {
      tab: 'workers',
      title: 'Czasy pracowników',
      subtitle: 'Historia pracy według osób.',
      status: 'Wybierz osobę i kliknij "Pokaż historię".',
      showTabs: false,
    }
  }
  if (normalized === 'clients') {
    return {
      tab: 'objects',
      title: 'Klienci',
      subtitle: 'Historia pracy według klientów.',
      status: 'Wybierz klienta i kliknij "Pokaż historię".',
      showTabs: false,
    }
  }
  if (normalized === 'history') {
    return {
      tab: appState.reportHistoryTab,
      title: 'Historia',
      subtitle: 'Historia dnia dla klienta, osoby lub strefy.',
      status: 'Wybierz filtr i kliknij "Pokaż historię".',
      showTabs: true,
    }
  }

  return null
}

function reportHistorySetTabsVisible(visible) {
  const tabs = document.getElementById('repHistoryTabs')
  if (!tabs) {
    return
  }

  tabs.style.display = visible ? '' : 'none'
}

function reportHistoryReadRangeMode() {
  return document.getElementById('repHistoryRangeWeek')?.checked ? 'week' : 'month'
}

function reportHistoryApplyRangeMode(mode, { force = false } = {}) {
  const normalized = String(mode ?? '').trim().toLowerCase() === 'week' ? 'week' : 'month'
  const monthRadio = document.getElementById('repHistoryRangeMonth')
  const weekRadio = document.getElementById('repHistoryRangeWeek')
  const fromInput = document.getElementById('repHistoryFrom')
  const toInput = document.getElementById('repHistoryTo')

  if (monthRadio) {
    monthRadio.checked = normalized === 'month'
  }
  if (weekRadio) {
    weekRadio.checked = normalized === 'week'
  }

  if (!fromInput || !toInput) {
    return
  }

  if (!force && String(fromInput.value ?? '').trim() && String(toInput.value ?? '').trim()) {
    return
  }

  if (normalized === 'week') {
    fromInput.value = daysAgoYmd(6)
    toInput.value = todayYmd()
    return
  }

  fromInput.value = firstDayOfCurrentMonthYmd()
  toInput.value = todayYmd()
}

function reportHistorySetStatus(message = '', isError = false) {
  const node = document.getElementById('repHistoryStatus')
  if (!node) {
    return
  }

  node.textContent = message
  node.style.color = isError ? '#b91c1c' : ''
}

function reportHistorySetLoading(isLoading, message = 'Ładowanie historii...') {
  const loading = document.getElementById('repHistoryLoading')
  const loadingText = loading?.querySelector('[data-rep-history-loading-text]')
  const button = document.getElementById('repHistoryRun')

  if (loading) {
    loading.style.display = isLoading ? 'grid' : 'none'
    loading.setAttribute('aria-busy', isLoading ? 'true' : 'false')
  }
  if (loadingText) {
    loadingText.textContent = message
  }
  if (button) {
    button.disabled = Boolean(isLoading)
    button.textContent = isLoading ? 'Ładowanie...' : 'Pokaż historię'
  }
}

function reportHistorySetTab(tab) {
  const normalized = reportHistoryNormalizeTab(tab)
  const previous = reportHistoryNormalizeTab(appState.reportHistoryTab)

  appState.reportHistoryTab = normalized
  reportGeoHidePreview()
  reportGeoCloseModal()
  reportHistoryCollapseAllSelects()
  document.querySelectorAll('[data-rep-history-tab]').forEach((button) => {
    button.classList.toggle('active', button.getAttribute('data-rep-history-tab') === normalized)
  })

  reportSetVisible('repHistoryClientWrap', normalized === 'objects')
  reportSetVisible('repHistoryWorkerWrap', normalized === 'workers')
  reportSetVisible('repHistoryZoneWrap', normalized === 'zones')

  if (previous !== normalized) {
    reportHistoryResetResults({ clearStatus: false })
  }
}

function reportHistorySetSummaryRows(rows = []) {
  const summary = document.getElementById('repHistorySummary')
  if (!summary) {
    return
  }

  if (!rows.length) {
    summary.innerHTML = ''
    reportSetVisible('repHistorySummary', false)
    return
  }

  const days = rows.length
  const events = rows.reduce((sum, row) => sum + Number(row.countAll ?? 0), 0)
  const running = rows.reduce((sum, row) => sum + Number(row.runningCount ?? 0), 0)
  const closedSec = rows.reduce((sum, row) => sum + Number(row.closedSec ?? 0), 0)
  const isWorkersTab = reportHistoryNormalizeTab(appState.reportHistoryTab) === 'workers'
  const selectedWorkerLabel = String(
    document.getElementById('repHistoryWorker')?.selectedOptions?.[0]?.textContent ??
      document.getElementById('repHistoryWorkerSearch')?.value ??
      '',
  ).trim()
  const workerLine = isWorkersTab ? `<div><b>Osoba:</b> ${escapeHtml(selectedWorkerLabel || '-')}</div>` : ''

  summary.innerHTML = `
    <div class="rep-summary-card">
      ${workerLine}
      <div><b>Dni:</b> ${days}</div>
      <div><b>Wpisy:</b> ${events} · <b>Otwarte:</b> ${running}</div>
      <div><b>Czas pracy:</b> ${durationSecondsToHms(closedSec)}</div>
    </div>
  `
  reportSetVisible('repHistorySummary', true)
}

function reportHistoryResolveEditableEvent(detail) {
  const source = detail?.sourceItem
  if (!source || typeof source !== 'object') {
    return null
  }

  const eventId = String(source.eventId ?? source.workdayId ?? source.id ?? '').trim()
  if (!eventId) {
    return null
  }

  const editable = { ...source }
  editable.eventId = eventId
  editable.workdayId = String(source.workdayId ?? source.eventId ?? source.id ?? '').trim() || eventId
  editable.workerLogin = String(source.workerLogin ?? source.workerId ?? source.login ?? '').trim()
  editable.workerName =
    String(source.workerName ?? source.name ?? detail?.workerLabel ?? editable.workerLogin ?? '').trim() || '-'
  editable.startAt = toIso(source.startAt ?? source.dayStartAt) || null
  editable.endAt = toIso(source.endAt ?? source.dayEndAt) || null
  editable.comment = String(source.comment ?? source.dayComment ?? '').trim()
  editable.editedBy = String(source.editedBy ?? source.updatedBy ?? appState.session?.name ?? '').trim() || '-'

  const zoneId = String(source.roomId ?? source.utilityRoomId ?? source.zoneId ?? source.workdayUtilityRoomId ?? '').trim()
  if (zoneId) {
    editable.zoneId = zoneId
    editable.roomId = zoneId
    editable.utilityRoomId = zoneId
  }

  const clientId = String(source.clientId ?? '').trim()
  editable.clientId = clientId || null
  return editable
}

function reportHistoryStoreEditableDetail(dayKey, detailIndex, detail) {
  const editable = reportHistoryResolveEditableEvent(detail)
  if (!editable) {
    return ''
  }

  const key = `${String(dayKey ?? '').trim()}::${Number(detailIndex)}`
  appState.reportHistoryEditableMap = {
    ...(appState.reportHistoryEditableMap || {}),
    [key]: editable,
  }
  return key
}

function reportHistoryStoreEditableSource(dayKey, suffix, sourceItem) {
  const editable = reportHistoryResolveEditableEvent({ sourceItem })
  if (!editable) {
    return ''
  }

  const key = `${String(dayKey ?? '').trim()}::${String(suffix ?? '').trim() || 'marker'}`
  appState.reportHistoryEditableMap = {
    ...(appState.reportHistoryEditableMap || {}),
    [key]: editable,
  }
  return key
}

function reportHistoryEditButtonHtml(editKey) {
  if (!canManageEvents() || !editKey) {
    return '-'
  }

  return `
    <button
      class="event-edit-icon-btn rep-history-edit-btn"
      type="button"
      data-rep-history-edit="${escapeHtml(editKey)}"
      aria-label="Edytuj zdarzenie"
      title="Edytuj zdarzenie"
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 20h4l10-10-4-4L4 16v4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="M13 7l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    </button>
  `
}

function reportHistoryIsDayStopSource(item) {
  if (!item || typeof item !== 'object') {
    return false
  }

  const stopIso = toIso(item?.dayEndAt ?? item?.endAt ?? item?.closeMarkedAt)
  if (!stopIso) {
    return false
  }

  const endReason = String(item?.endReason ?? '').trim().toUpperCase()
  const status = String(item?.status ?? '').trim().toUpperCase()
  return (
    item?.historyMarkerOnly ||
    endReason === 'WORKDAY_STOP' ||
    endReason === 'STOP_END_DAY' ||
    status === 'WORKDAY_CLOSED'
  )
}

function reportHistoryHasDayStart(row) {
  return Boolean(toIso(row?.dayStartIso ?? row?.qrStartSourceItem?.dayStartAt ?? row?.qrStartSourceItem?.startAt))
}

function reportHistoryHasDayStop(row) {
  return reportHistoryIsDayStopSource(row?.qrStopSourceItem)
}

function reportHistoryHasOpenWorkerDay(row) {
  return reportHistoryHasDayStart(row) && !reportHistoryHasDayStop(row)
}

function reportHistoryDayStartCloseSource(row) {
  const source = row?.qrStartSourceItem
  if (!source || typeof source !== 'object') {
    return null
  }

  const sourceId = String(source?.eventId ?? source?.workdayId ?? source?.id ?? '').trim()
  if (!sourceId) {
    return null
  }

  const startIso = toIso(source?.startAt ?? source?.dayStartAt ?? row?.dayStartIso)
  return startIso ? source : null
}

function reportHistoryRenderDetails(row, tab, dayKey = '') {
  const details = Array.isArray(row.details) ? row.details : []
  if (!details.length && tab !== 'workers') {
    return '<div class="rep-history-empty">Brak szczegółów.</div>'
  }

  if (tab === 'zones') {
    const body = details
      .map(
        (detail, detailIndex) => {
          const resolvedClient = resolveClientLabelWithQrFallback(detail.clientLabel || '-', detail.zoneLabel || '-')
          const editKey = reportHistoryStoreEditableDetail(dayKey, detailIndex, detail)
          return `
          <tr>
            <td>${escapeHtml(resolvedClient)}</td>
            <td>${zoneNameWithQrHtml(detail.zoneLabel || '-', detail.sourceItem)}</td>
            <td>${escapeHtml(detail.locationLabel || '-')}</td>
            <td>${escapeHtml(detail.workerLabel || '-')}</td>
            <td class="time-start">${escapeHtml(detail.startLabel || '-')}</td>
            <td class="time-stop">${escapeHtml(detail.stopLabel || '-')}</td>
            <td class="ta-right">${escapeHtml(detail.durationLabel || '-')}</td>
            <td class="ta-right">${escapeHtml(detail.statusLabel || '-')}</td>
            <td class="ta-right rep-history-edit-cell">${reportHistoryEditButtonHtml(editKey)}</td>
          </tr>
        `
        },
      )
      .join('')

    return `
      <div class="rep-history-detail">
        <table class="rep-history-detail-table">
          <thead>
            <tr><th>Klient</th><th>Strefa</th><th>Lok.</th><th>Osoba</th><th class="time-start">Start</th><th class="time-stop">Stop</th><th class="ta-right">Czas</th><th class="ta-right">Status</th><th class="ta-right">Edytuj</th></tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `
  }

  if (tab === 'workers') {
    const hasDayStop = reportHistoryHasDayStop(row)
    const qrStartEditKey = reportHistoryStoreEditableSource(dayKey, 'marker-start', row?.qrStartSourceItem)
    const qrStopEditKey = reportHistoryStoreEditableSource(dayKey, 'marker-stop', row?.qrStopSourceItem)
    const qrStartIsSystem = reportHistoryIsSystemEntrySource(row?.qrStartSourceItem)
    const qrStopIsSystem = reportHistoryIsSystemEntrySource(row?.qrStopSourceItem)
    const detailsBody = details
      .map(
        (detail, detailIndex) => {
          const resolvedClient = resolveClientLabelWithQrFallback(detail.clientLabel || '-', detail.zoneLabel || '-')
          const editKey = reportHistoryStoreEditableDetail(dayKey, detailIndex, detail)
          return `
          <tr>
            <td>${escapeHtml(resolvedClient)}</td>
            <td>${zoneNameWithQrHtml(detail.zoneLabel || '-', detail.sourceItem)}</td>
            <td>${escapeHtml(detail.locationLabel || '-')}</td>
            <td class="time-start">${escapeHtml(detail.startLabel || '-')}</td>
            <td class="time-stop">${escapeHtml(detail.stopLabel || '-')}</td>
            <td class="ta-right">${escapeHtml(detail.durationLabel || '-')}</td>
            <td class="ta-right">${escapeHtml(detail.statusLabel || '-')}</td>
            <td class="ta-right rep-history-edit-cell">${reportHistoryEditButtonHtml(editKey)}</td>
          </tr>
        `
        },
      )
      .join('')
    const qrStartClient = qrStartIsSystem
      ? REPORT_HISTORY_SYSTEM_CLIENT_LABEL
      : resolveClientLabelWithQrFallback(row.qrStartClientLabel || '-', row.qrStartZoneCode || '-')
    const qrStopClient = qrStopIsSystem
      ? REPORT_HISTORY_SYSTEM_CLIENT_LABEL
      : resolveClientLabelWithQrFallback(row.qrStopClientLabel || '-', row.qrStopZoneCode || '-')
    const qrStartZoneLabel = qrStartIsSystem ? REPORT_HISTORY_SYSTEM_ZONE_LABEL : String(row.qrStartZoneCode || '-')
    const qrStopZoneLabel = qrStopIsSystem ? REPORT_HISTORY_SYSTEM_ZONE_LABEL : String(row.qrStopZoneCode || '-')
    const qrStartLocationLabel = qrStartIsSystem ? REPORT_HISTORY_SYSTEM_ZONE_LABEL : String(row.qrStartGeoLabel || '-')
    const qrStopLocationLabel = qrStopIsSystem ? REPORT_HISTORY_SYSTEM_ZONE_LABEL : String(row.qrStopGeoLabel || '-')
    const qrStartZoneSource = row.qrStartZoneCode && row.qrStartZoneCode !== '-'
      ? row.qrStartZoneCode
      : (row?.qrStartSourceItem ?? qrStartZoneLabel)
    const qrStopZoneSource = row.qrStopZoneCode && row.qrStopZoneCode !== '-'
      ? row.qrStopZoneCode
      : (row?.qrStopSourceItem ?? qrStopZoneLabel)
    const qrStartRow = `
      <tr class="rep-history-marker-row">
        <td>${escapeHtml(qrStartClient)}</td>
        <td>${zoneNameWithQrHtml(qrStartZoneLabel, qrStartZoneSource)}</td>
        <td>${reportHistoryGeoCellHtml(qrStartLocationLabel)}</td>
        <td class="time-start">${escapeHtml(row.qrStartLabel || '-')}</td>
        <td class="time-stop">-</td>
        <td class="ta-right">-</td>
        <td class="ta-right">QR START</td>
        <td class="ta-right rep-history-edit-cell">${reportHistoryEditButtonHtml(qrStartEditKey)}</td>
      </tr>
    `
    const qrStopRow = `
      <tr class="rep-history-marker-row">
        <td>${escapeHtml(qrStopClient)}</td>
        <td>${zoneNameWithQrHtml(qrStopZoneLabel, qrStopZoneSource)}</td>
        <td>${reportHistoryGeoCellHtml(qrStopLocationLabel)}</td>
        <td class="time-start">-</td>
        <td class="time-stop">${escapeHtml(row.qrStopLabel || '-')}</td>
        <td class="ta-right">-</td>
        <td class="ta-right">QR STOP</td>
        <td class="ta-right rep-history-edit-cell">${reportHistoryEditButtonHtml(qrStopEditKey)}</td>
      </tr>
    `
    const body = `${hasDayStop ? qrStopRow : ''}${detailsBody}${qrStartRow}`

    return `
      <div class="rep-history-detail">
        <table class="rep-history-detail-table">
          <thead>
            <tr><th>Klient</th><th>Strefa</th><th>Lok.</th><th class="time-start">Start</th><th class="time-stop">Stop</th><th class="ta-right">Czas</th><th class="ta-right">Status</th><th class="ta-right">Edytuj</th></tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `
  }

  const body = details
    .map(
      (detail, detailIndex) => {
        const editKey = reportHistoryStoreEditableDetail(dayKey, detailIndex, detail)
        return `
        <tr>
          <td>${zoneNameWithQrHtml(detail.zoneLabel || '-', detail.sourceItem)}</td>
          <td>${escapeHtml(detail.locationLabel || '-')}</td>
          <td>${escapeHtml(detail.workerLabel || '-')}</td>
          <td class="time-start">${escapeHtml(detail.startLabel || '-')}</td>
          <td class="time-stop">${escapeHtml(detail.stopLabel || '-')}</td>
          <td class="ta-right">${escapeHtml(detail.durationLabel || '-')}</td>
          <td class="ta-right">${escapeHtml(detail.statusLabel || '-')}</td>
          <td class="ta-right rep-history-edit-cell">${reportHistoryEditButtonHtml(editKey)}</td>
        </tr>
      `
      },
    )
    .join('')

  return `
    <div class="rep-history-detail">
      <table class="rep-history-detail-table">
        <thead>
          <tr><th>Strefa</th><th>Lok.</th><th>Osoba</th><th class="time-start">Start</th><th class="time-stop">Stop</th><th class="ta-right">Czas</th><th class="ta-right">Status</th><th class="ta-right">Edytuj</th></tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `
}

function reportHistoryDayInfoHtml(row) {
  const startValue = String(row?.qrStartLabel ?? '').trim() || '--:--:--'
  const hasOpenDay = reportHistoryHasOpenWorkerDay(row)
  const stopValue = hasOpenDay ? '--:--:--' : String(row?.qrStopLabel ?? '').trim() || '--:--:--'
  const workValue = durationSecondsToHms(Number(row?.closedSec ?? 0))
  const dayKey = String(row?.dayKey ?? '').trim()
  const canStopDay = hasOpenDay && Boolean(dayKey) && canManageEvents()
  const stopDayBusy = canStopDay && appState.reportHistoryClosingDayKey === dayKey
  const stopDayButton = canStopDay
    ? `
      <button
        class="btn2 rep-history-stopday-btn"
        type="button"
        data-rep-history-stop-day="${escapeHtml(dayKey)}"
        ${stopDayBusy ? 'disabled' : ''}
      >
        ${stopDayBusy ? 'Zamykanie...' : 'Zamknij dzień pracy'}
      </button>
    `
    : ''

  return `
    <div class="rep-history-day-info">
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
      ${stopDayButton}
    </div>
  `
}

function reportHistoryPromptStopDateTime({ dayKey = '', dayLabel = '-', workerName = '-' } = {}) {
  const normalizedDayKey = String(dayKey ?? '').trim()
  const initialDate = /^\d{4}-\d{2}-\d{2}$/.test(normalizedDayKey) ? normalizedDayKey : todayYmd()
  return new Promise((resolve) => {
    const existingOverlay = document.getElementById('repHistoryStopDayOverlay')
    if (existingOverlay) {
      existingOverlay.remove()
    }

    const overlay = document.createElement('div')
    overlay.id = 'repHistoryStopDayOverlay'
    overlay.className = 'overlay rep-history-stopday-overlay'
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.innerHTML = `
      <div class="modal modal-sm rep-history-stopday-modal" role="document">
        <div class="modal-header">
          <div>
            <div class="modal-title">Zakończ dzień</div>
            <div class="modal-subtitle">${escapeHtml(workerName)} · ${escapeHtml(dayLabel)}</div>
          </div>
          <button class="icon-btn" type="button" data-rep-history-stop-close aria-label="Zamknij">x</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="form-field span-2">
              <label for="repHistoryStopDayDateInput">Data zakończenia</label>
              <input
                class="rep-history-stopday-date"
                id="repHistoryStopDayDateInput"
                type="date"
                value="${escapeHtml(initialDate)}"
              />
            </div>
            <div class="form-field span-2">
              <label for="repHistoryStopDayInput">Godzina zakończenia</label>
              <input
                id="repHistoryStopDayInput"
                type="time"
                step="60"
              />
              <div class="field-hint">Domyślnie ustawiona jak dzień rozpoczęcia pracy. Możesz ją zmienić.</div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn2" type="button" data-rep-history-stop-cancel>Anuluj</button>
          <button class="btn" type="button" data-rep-history-stop-confirm>Zakończ dzień</button>
        </div>
      </div>
    `

    const cleanup = () => {
      overlay.remove()
      document.removeEventListener('keydown', onKeyDown)
    }

    const closeWith = (isoValue) => {
      cleanup()
      resolve(String(isoValue ?? '').trim())
    }

    const dateInput = overlay.querySelector('#repHistoryStopDayDateInput')
    const input = overlay.querySelector('#repHistoryStopDayInput')
    const cancelButton = overlay.querySelector('[data-rep-history-stop-cancel]')
    const closeButton = overlay.querySelector('[data-rep-history-stop-close]')
    const confirmButton = overlay.querySelector('[data-rep-history-stop-confirm]')

    const submit = () => {
      const iso = localDateAndTimeInputToIso(dateInput?.value, input?.value)
      if (!iso) {
        alert('Podaj poprawną datę i godzinę zakończenia.')
        if (!String(dateInput?.value ?? '').trim()) {
          dateInput?.focus()
        } else {
          input?.focus()
        }
        return
      }

      closeWith(iso)
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeWith('')
        return
      }

      if (event.key === 'Enter') {
        const target = event.target
        if (target instanceof HTMLInputElement) {
          event.preventDefault()
          submit()
        }
      }
    }

    cancelButton?.addEventListener('click', () => closeWith(''))
    closeButton?.addEventListener('click', () => closeWith(''))
    confirmButton?.addEventListener('click', submit)
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        closeWith('')
      }
    })
    document.addEventListener('keydown', onKeyDown)

    document.body.appendChild(overlay)
    overlay.style.display = 'flex'
    window.setTimeout(() => {
      input?.focus()
      input?.select?.()
    }, 0)
  })
}

function reportEventsDefaultDates() {
  const fromInput = document.getElementById('repEventsFrom')
  const toInput = document.getElementById('repEventsTo')
  if (fromInput && !String(fromInput.value ?? '').trim()) {
    fromInput.value = firstDayOfCurrentMonthYmd()
  }
  if (toInput && !String(toInput.value ?? '').trim()) {
    toInput.value = todayYmd()
  }
}

function reportEventsTypeOptions() {
  return [
    { value: 'QR START', label: 'QR START' },
    { value: 'QR STOP', label: 'QR STOP' },
    { value: 'QR START + STOP', label: 'QR START + STOP' },
    { value: 'CLEAN', label: 'CLEAN' },
    { value: 'Strefa spec.', label: 'Strefa specjalna' },
    { value: 'Zlecenie ind.', label: 'Zlecenie indywidualne' },
    { value: 'Inne QR', label: 'Inne QR' },
  ]
}

function reportRefreshEventsZoneOptions() {
  const clientSelect = document.getElementById('repEventsClient')
  const zoneSelect = document.getElementById('repEventsZone')
  if (!zoneSelect) {
    return
  }

  const clientId = String(clientSelect?.value ?? '').trim()
  const currentZoneId = String(zoneSelect.value ?? '').trim()
  const zones = visiblePortalZones()
    .filter((zone) => !clientId || String(zone.clientId ?? '').trim() === clientId)
    .map((zone) => ({
      value: String(zone.id ?? zone.qr ?? '').trim(),
      label: [zone.clientName, zone.zoneName, zone.location].filter((value) => String(value ?? '').trim() && value !== '-').join(' / '),
    }))
    .filter((option) => option.value)
    .sort((left, right) => left.label.localeCompare(right.label, 'pl', { numeric: true, sensitivity: 'base' }))

  reportSetSelectOptions('repEventsZone', zones, clientId ? '(wszystkie strefy klienta)' : '(wszystkie strefy)')
  zoneSelect.disabled = false
  if (currentZoneId && zones.some((option) => option.value === currentZoneId)) {
    zoneSelect.value = currentZoneId
  }
}

async function reportHistoryCloseWorkerDay(dayKey) {
  if (!appState.session?.orgId) {
    return
  }

  if (!canManageEvents()) {
    alert('Brak uprawnień do zakończenia dnia.')
    return
  }

  const normalizedDayKey = String(dayKey ?? '').trim()
  if (!normalizedDayKey) {
    return
  }

  const currentTab = reportHistoryNormalizeTab(appState.reportHistoryTab)
  if (currentTab !== 'workers') {
    alert('Zakończenie dnia jest dostępne tylko w zakładce Osoby.')
    return
  }

  const row = (Array.isArray(appState.reportHistoryRows) ? appState.reportHistoryRows : []).find(
    (item) => String(item?.dayKey ?? '').trim() === normalizedDayKey,
  )
  if (!row) {
    alert('Nie znaleziono dnia do zamknięcia. Odśwież historię.')
    return
  }

  const runningDetails = (Array.isArray(row.details) ? row.details : []).filter((detail) => {
    const status = String(detail?.statusLabel ?? '').trim().toUpperCase()
    return status === 'RUNNING' && detail?.sourceItem
  })
  const dayStartSource = reportHistoryDayStartCloseSource(row)
  const closeTargets = runningDetails.length
    ? runningDetails
    : dayStartSource
      ? [
          {
            sourceItem: dayStartSource,
            statusLabel: 'RUNNING',
            isDayMarkerClose: true,
          },
        ]
      : []

  if (!closeTargets.length) {
    alert('Brak otwartego dnia pracy do zamknięcia. Odśwież historię.')
    return
  }

  const workerSelect = document.getElementById('repHistoryWorker')
  const workerSearch = document.getElementById('repHistoryWorkerSearch')
  const workerLogin = String(workerSelect?.value ?? '').trim()
  const workerName = String(workerSelect?.selectedOptions?.[0]?.textContent ?? workerSearch?.value ?? '').trim() || 'pracownika'
  const dayLabel = formatDatePl(`${normalizedDayKey}T00:00:00.000Z`)
  const selectedEndIso = await reportHistoryPromptStopDateTime({
    dayKey: normalizedDayKey,
    dayLabel,
    workerName,
  })
  if (!selectedEndIso) {
    return
  }

  const selectedEndTs = new Date(selectedEndIso).getTime()
  const latestStartTs = closeTargets.reduce((maxTs, detail) => {
    const startIso = toIso(detail?.sourceItem?.startAt ?? detail?.sourceItem?.dayStartAt ?? row?.dayStartIso)
    const startTs = startIso ? new Date(startIso).getTime() : 0
    return Number.isFinite(startTs) && startTs > maxTs ? startTs : maxTs
  }, 0)
  if (Number.isFinite(selectedEndTs) && Number.isFinite(latestStartTs) && latestStartTs > 0 && selectedEndTs < latestStartTs) {
    alert('Podana godzina STOP jest wcześniejsza niż start aktywnego wpisu. Wybierz późniejszą godzinę.')
    return
  }

  appState.reportHistoryClosingDayKey = normalizedDayKey
  reportHistoryRenderTable()
  reportHistorySetStatus('Zamykanie dnia...')

  try {
    const nowIso = selectedEndIso
    let updatedCount = 0

    for (const detail of closeTargets) {
      const source = detail.sourceItem ?? {}
      const eventId = String(source?.eventId ?? source?.workdayId ?? source?.id ?? '').trim()
      if (!eventId) {
        continue
      }

      const sourceWorkerLogin = String(source?.workerLogin ?? source?.workerId ?? workerLogin).trim()
      if (!sourceWorkerLogin) {
        continue
      }

      const sourceWorkerName = String(source?.workerName ?? source?.name ?? workerName).trim() || workerName
      const sourceStartAt = toIso(source?.startAt ?? source?.dayStartAt ?? row?.dayStartIso) || nowIso
      const startMs = new Date(sourceStartAt).getTime()
      const nowMs = new Date(nowIso).getTime()
      const safeEndAt = Number.isFinite(startMs) && Number.isFinite(nowMs) && nowMs < startMs ? sourceStartAt : nowIso
      const endMs = new Date(safeEndAt).getTime()
      const durationSec =
        Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs ? Math.floor((endMs - startMs) / 1000) : 0

      const zoneId = String(source?.roomId ?? source?.utilityRoomId ?? source?.zoneId ?? '').trim()
      const clientId = String(source?.clientId ?? '').trim()

      await updateEvent(appState.session.orgId, eventId, {
        ...source,
        eventId,
        workdayId: String(source?.workdayId ?? eventId).trim() || eventId,
        workerLogin: sourceWorkerLogin,
        workerName: sourceWorkerName,
        zoneId: zoneId || null,
        roomId: zoneId || null,
        utilityRoomId: zoneId || null,
        clientId: clientId || null,
        startAt: sourceStartAt,
        endAt: safeEndAt,
        durationSec,
        status: 'CLOSED',
        closeMarkedAt: safeEndAt,
        endReason: 'WORKDAY_STOP',
        comment: String(source?.comment ?? '').trim(),
        updatedBy: appState.session?.name ?? null,
      })
      updatedCount += 1
    }

    if (!updatedCount) {
      throw new Error('Nie udało się zamknąć żadnego aktywnego wpisu.')
    }

    await runReportHistory()
    await fetchEventsForCurrentSession({ resetPage: false })
    await refreshDashboardWidgets({ syncWorktimeToken: true })
    showTransientNotice(
      runningDetails.length
        ? `Dzień zakończony. Zamknięto ${updatedCount} aktywne wpisy.`
        : 'Dzień pracy został zamknięty.',
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Nie udało się zakończyć dnia.'
    alert(message)
  } finally {
    appState.reportHistoryClosingDayKey = ''
    reportHistoryRenderTable()
  }
}

function reportHistoryRenderTable() {
  const table = document.getElementById('repHistoryTable')
  if (!table) {
    return
  }

  appState.reportHistoryEditableMap = {}

  const tab = reportHistoryNormalizeTab(appState.reportHistoryTab)
  const rows = Array.isArray(appState.reportHistoryRows) ? appState.reportHistoryRows : []
  const isWorkersTab = tab === 'workers'
  const detailLabel = isWorkersTab ? 'Info dnia' : 'Szczegoly'
  const closedLabel = 'Czas pracy'
  const headHtml = `
    <thead>
      <tr>
        <th></th>
        <th>Data</th>
        <th class="ta-right">Wpisy</th>
        <th class="ta-right">${closedLabel}</th>
        <th class="ta-right">Otwarte</th>
        <th class="ta-right">${detailLabel}</th>
      </tr>
    </thead>
  `

  if (!rows.length) {
    table.innerHTML = `${headHtml}<tbody><tr><td colspan="6" style="text-align:center; padding:18px;">Brak danych</td></tr></tbody>`
    return
  }

  const bodyHtml = rows
    .map((row) => {
      const dayKey = String(row.dayKey ?? '').trim()
      const expanded = Boolean(appState.reportHistoryExpanded?.[dayKey])
      const actionLabel = expanded ? 'Zwin' : 'Rozwin'
      const dayLabel = formatDatePl(`${dayKey}T00:00:00.000Z`)
      const detailHtml = reportHistoryRenderDetails(row, tab, dayKey)
      const detailValue = isWorkersTab
        ? reportHistoryDayInfoHtml(row)
        : escapeHtml(String((row.details || []).length))

      return `
        <tr class="rep-history-main-row">
          <td><button class="btn2 rep-history-toggle" type="button" data-rep-history-toggle="${escapeHtml(dayKey)}">${actionLabel}</button></td>
          <td>${escapeHtml(dayLabel)}</td>
          <td class="ta-right">${escapeHtml(String(row.countAll ?? 0))}</td>
          <td class="ta-right">${escapeHtml(durationSecondsToHms(row.closedSec || 0))}</td>
          <td class="ta-right">${escapeHtml(String(row.runningCount ?? 0))}</td>
          <td class="${isWorkersTab ? 'rep-history-day-info-cell' : 'ta-right'}">${detailValue}</td>
        </tr>
        <tr class="rep-history-detail-row"${expanded ? '' : ' style="display:none;"'}>
          <td colspan="6">${detailHtml}</td>
        </tr>
      `
    })
    .join('')

  table.innerHTML = `${headHtml}<tbody>${bodyHtml}</tbody>`
}

function reportHistoryResetResults({ clearStatus = true } = {}) {
  appState.reportHistoryRows = []
  appState.reportHistoryExpanded = {}
  appState.reportHistoryEditableMap = {}
  appState.reportHistoryClosingDayKey = ''
  reportHistorySetSummaryRows([])
  reportHistoryRenderTable()

  if (clearStatus) {
    reportHistorySetStatus('')
  }
}

function reportHistoryResolveStatus(item) {
  const normalized = String(item?.status ?? '')
    .trim()
    .toUpperCase()

  if (normalized === 'CLOSED' || item?.endAt) {
    return 'CLOSED'
  }

  if (normalized === 'OPEN' || normalized === 'RUNNING') {
    return 'RUNNING'
  }

  return normalized || 'RUNNING'
}

function reportHistoryClosedDurationSec(item) {
  if (reportHistoryResolveStatus(item) !== 'CLOSED') {
    return 0
  }

  const direct = Number(item?.durationSec ?? 0)
  if (Number.isFinite(direct) && direct > 0) {
    return Math.floor(direct)
  }

  const startAt = toIso(item?.startAt)
  const endAt = toIso(item?.endAt)
  if (!startAt || !endAt) {
    return 0
  }

  const diff = Math.floor((new Date(endAt).getTime() - new Date(startAt).getTime()) / 1000)
  return Number.isFinite(diff) && diff > 0 ? diff : 0
}

function reportHistoryDurationLabel(item) {
  const status = reportHistoryResolveStatus(item)
  if (status !== 'CLOSED') {
    return 'W toku'
  }

  return durationSecondsToHms(reportHistoryClosedDurationSec(item))
}

function reportHistoryLocalDayKey(value) {
  const iso = toIso(value)
  if (!iso) {
    return ''
  }

  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) {
    return ''
  }

  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function reportHistoryDayKey(item) {
  const fromStart = reportHistoryLocalDayKey(item?.startAt)
  if (fromStart) {
    return fromStart
  }

  const fromEnd = reportHistoryLocalDayKey(item?.endAt)
  if (fromEnd) {
    return fromEnd
  }

  const fromDayStart = reportHistoryLocalDayKey(item?.dayStartAt)
  if (fromDayStart) {
    return fromDayStart
  }

  const fromDayEnd = reportHistoryLocalDayKey(item?.dayEndAt)
  if (fromDayEnd) {
    return fromDayEnd
  }

  const dayKey = String(item?.dayKey ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    return dayKey
  }

  return ''
}

function reportHistoryToTimestamp(value) {
  const iso = toIso(value)
  if (!iso) {
    return 0
  }

  const timestamp = new Date(iso).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function reportHistoryNormalizeQrCode(value) {
  const raw = String(value ?? '').trim()
  if (!raw || raw === '-') {
    return ''
  }

  if (/^[A-Za-z0-9-]{3,}$/.test(raw) && !raw.includes(':')) {
    return raw.toUpperCase()
  }

  const codeMatch = raw.match(/\b([A-Z]{1,6}\d{2,}[A-Z0-9-]*)\b/i)
  if (codeMatch?.[1]) {
    return codeMatch[1].toUpperCase()
  }

  return ''
}

function reportHistoryExtractQrFromComment(comment, phase) {
  const raw = String(comment ?? '').trim()
  if (!raw) {
    return ''
  }

  const normalizedPhase = String(phase ?? '').trim().toLowerCase() === 'start' ? 'start' : 'stop'
  const phaseRegex =
    normalizedPhase === 'start'
      ? /(START|QR\s*START|START_QR)\s*[:=-]?\s*([A-Z0-9-]{3,})/i
      : /(STOP|QR\s*STOP|STOP_QR)\s*[:=-]?\s*([A-Z0-9-]{3,})/i
  const phaseMatch = raw.match(phaseRegex)
  if (phaseMatch?.[2]) {
    return reportHistoryNormalizeQrCode(phaseMatch[2])
  }

  return ''
}

function reportHistoryExtractGpsCoords(source, phase) {
  const raw = String(source ?? '').trim()
  if (!raw) {
    return ''
  }

  const entries = []
  const regex = /(CLEAN_START_GPS|CLEAN_STOP_GPS|START_GPS|STOP_GPS)[^|]*?lat\s*=\s*(-?\d+(?:\.\d+)?)\s*lon\s*=\s*(-?\d+(?:\.\d+)?)/gi
  let match = regex.exec(raw)
  while (match) {
    entries.push({
      label: String(match[1] ?? '').toUpperCase(),
      lat: String(match[2] ?? '').trim(),
      lon: String(match[3] ?? '').trim(),
    })
    match = regex.exec(raw)
  }

  const normalizedPhase = String(phase ?? '').trim().toLowerCase() === 'start' ? 'start' : 'stop'
  const preferredLabels =
    normalizedPhase === 'start'
      ? ['START_GPS', 'CLEAN_START_GPS']
      : ['STOP_GPS', 'CLEAN_STOP_GPS']

  for (const label of preferredLabels) {
    const entry = entries.find((item) => item.label === label)
    if (entry?.lat && entry?.lon) {
      return `${entry.lat}, ${entry.lon}`
    }
  }

  if (entries.length) {
    return ''
  }

  const fallback = raw.match(/lat\s*=\s*(-?\d+(?:\.\d+)?)\s*lon\s*=\s*(-?\d+(?:\.\d+)?)/i)
  if (fallback?.[1] && fallback?.[2]) {
    return `${fallback[1]}, ${fallback[2]}`
  }

  return ''
}

function reportHistoryResolveDayQrCode(item, phase) {
  const normalizedPhase = String(phase ?? '').trim().toLowerCase() === 'start' ? 'start' : 'stop'
  const directCode =
    normalizedPhase === 'start'
      ? reportHistoryNormalizeQrCode(item?.dayStartObject ?? item?.startObject)
      : reportHistoryNormalizeQrCode(item?.dayStopObject ?? item?.stopObject)
  if (directCode) {
    return directCode
  }

  const fromComment = reportHistoryExtractQrFromComment(item?.dayComment ?? item?.comment, normalizedPhase)
  if (fromComment) {
    return fromComment
  }

  const roomCode = reportHistoryNormalizeQrCode(item?.workdayUtilityRoomId)
  if (normalizedPhase === 'start' && roomCode) {
    return roomCode
  }

  const zoneCode = reportHistoryNormalizeQrCode(item?.zoneId ?? item?.utilityRoomId ?? item?.roomId)
  if (zoneCode) {
    return zoneCode
  }

  return '-'
}

function reportHistoryResolveDayQrCandidate(item, phase) {
  const normalizedPhase = String(phase ?? '').trim().toLowerCase() === 'start' ? 'start' : 'stop'
  const directCode =
    normalizedPhase === 'start'
      ? reportHistoryNormalizeQrCode(item?.dayStartObject ?? item?.startObject)
      : reportHistoryNormalizeQrCode(item?.dayStopObject ?? item?.stopObject)
  if (directCode) {
    return { code: directCode, score: 4 }
  }

  const fromComment = reportHistoryExtractQrFromComment(item?.dayComment ?? item?.comment, normalizedPhase)
  if (fromComment) {
    return { code: fromComment, score: 3 }
  }

  const roomCode = reportHistoryNormalizeQrCode(item?.workdayUtilityRoomId)
  if (normalizedPhase === 'start' && roomCode) {
    return { code: roomCode, score: 2 }
  }

  const zoneCode = reportHistoryNormalizeQrCode(item?.zoneId ?? item?.utilityRoomId ?? item?.roomId)
  if (zoneCode) {
    return { code: zoneCode, score: 1 }
  }

  return { code: '-', score: 0 }
}

function reportHistoryResolveClientByZoneCode(zoneCode, fallback = '-') {
  const code = String(zoneCode ?? '').trim().toUpperCase()
  const fallbackLabel = resolveClientLabelWithQrFallback(fallback, code)
  if (!code || code === '-') {
    return fallbackLabel
  }

  const zone = appState.zones.find((item) => String(item.id ?? item.zoneId ?? '').trim().toUpperCase() === code)
  if (!zone) {
    return fallbackLabel
  }

  const clientId = String(zone.clientId ?? '').trim()
  if (!clientId) {
    return fallbackLabel
  }

  const client = appState.clients.find((item) => String(item.id ?? item.clientId ?? '').trim() === clientId)
  const clientLabel = String(client?.name ?? clientId).trim()
  return resolveClientLabelWithQrFallback(clientLabel || fallbackLabel, code)
}

function reportHistoryIsSystemEntrySource(item) {
  if (!item || typeof item !== 'object') {
    return false
  }

  if (item?.historyMarkerOnly) {
    return true
  }

  const endReason = String(item?.endReason ?? '').trim().toUpperCase()
  if (endReason === 'WORKDAY_STOP' || endReason === 'STOP_END_DAY') {
    return true
  }

  const clientStatus = String(item?.clientStatus ?? '').trim().toUpperCase()
  if (clientStatus === 'SYSTEM') {
    return true
  }

  return false
}

function reportHistoryResolveDayGpsCoords(item, phase) {
  const normalizedPhase = String(phase ?? '').trim().toLowerCase() === 'start' ? 'start' : 'stop'
  const sources = [item?.dayGps, item?.gps, item?.dayComment, item?.comment]
  for (const source of sources) {
    const resolved = reportHistoryExtractGpsCoords(source, normalizedPhase)
    if (resolved) {
      return resolved
    }
  }

  return '-'
}

function reportHistoryParseGeoPair(value) {
  const raw = String(value ?? '').trim()
  if (!raw || raw === '-') {
    return null
  }

  const match = raw.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/)
  if (!match?.[1] || !match?.[2]) {
    return null
  }

  const lat = Number(match[1])
  const lon = Number(match[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null
  }
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return null
  }

  return {
    lat: String(Math.round(lat * 1000000) / 1000000),
    lon: String(Math.round(lon * 1000000) / 1000000),
  }
}

function reportHistoryGeoCellHtml(value) {
  const parsed = reportHistoryParseGeoPair(value)
  if (!parsed) {
    return escapeHtml(String(value ?? '').trim() || '-')
  }

  const label = `${parsed.lat}, ${parsed.lon}`
  return `<button class="rep-geo-link" type="button" data-rep-geo-lat="${escapeHtml(parsed.lat)}" data-rep-geo-lon="${escapeHtml(parsed.lon)}" title="Podglad satelitarny">${escapeHtml(label)}</button>`
}

function reportGeoMapEmbedUrl(lat, lon, zoom = 18) {
  const normalizedZoom = Math.min(Math.max(Number(zoom) || 18, 3), 21)
  const query = `${lat},${lon}`
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&t=k&z=${normalizedZoom}&hl=pl&output=embed`
}

function ensureReportGeoUi() {
  let preview = document.getElementById('repGeoPreview')
  if (!preview) {
    preview = document.createElement('div')
    preview.id = 'repGeoPreview'
    preview.className = 'rep-geo-preview'
    preview.style.display = 'none'
    preview.innerHTML = '<iframe id="repGeoPreviewFrame" title="Podglad satelitarny" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>'
    document.body.appendChild(preview)
  }

  let overlay = document.getElementById('repGeoOverlay')
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.id = 'repGeoOverlay'
    overlay.className = 'rep-geo-overlay'
    overlay.style.display = 'none'
    overlay.innerHTML = `
      <div class="rep-geo-modal">
        <div class="rep-geo-head">
          <div class="rep-geo-title">Widok satelitarny</div>
          <div class="rep-geo-tools">
            <button id="repGeoZoomOut" class="btn2" type="button">-</button>
            <button id="repGeoZoomIn" class="btn2" type="button">+</button>
            <button id="repGeoClose" class="btn2" type="button">Zamknij</button>
          </div>
        </div>
        <div id="repGeoCoords" class="rep-geo-coords">-</div>
        <iframe id="repGeoFrame" title="Mapa satelitarna" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
      </div>
    `
    document.body.appendChild(overlay)
  }
}

function reportGeoReadCoordsFromNode(node) {
  const lat = String(node?.getAttribute('data-rep-geo-lat') ?? '').trim()
  const lon = String(node?.getAttribute('data-rep-geo-lon') ?? '').trim()
  const parsed = reportHistoryParseGeoPair(`${lat},${lon}`)
  return parsed
}

function reportGeoHidePreview() {
  if (reportGeoPreviewHideTimer) {
    window.clearTimeout(reportGeoPreviewHideTimer)
    reportGeoPreviewHideTimer = null
  }

  const preview = document.getElementById('repGeoPreview')
  if (!preview) {
    return
  }

  preview.style.display = 'none'
}

function reportGeoHidePreviewSoon() {
  if (reportGeoPreviewHideTimer) {
    window.clearTimeout(reportGeoPreviewHideTimer)
  }

  reportGeoPreviewHideTimer = window.setTimeout(() => {
    reportGeoHidePreview()
  }, 120)
}

function reportGeoShowPreview(anchorNode, lat, lon) {
  ensureReportGeoUi()
  if (reportGeoPreviewHideTimer) {
    window.clearTimeout(reportGeoPreviewHideTimer)
    reportGeoPreviewHideTimer = null
  }

  const preview = document.getElementById('repGeoPreview')
  const frame = document.getElementById('repGeoPreviewFrame')
  if (!preview || !frame || !anchorNode) {
    return
  }

  const src = reportGeoMapEmbedUrl(lat, lon, 18)
  if (frame.getAttribute('src') !== src) {
    frame.setAttribute('src', src)
  }

  const rect = anchorNode.getBoundingClientRect()
  const margin = 10
  const width = 320
  const height = 220
  let left = window.scrollX + rect.left
  let top = window.scrollY + rect.bottom + 8
  if (window.innerHeight - rect.bottom < height + 20) {
    top = window.scrollY + rect.top - height - 8
  }
  left = Math.max(window.scrollX + margin, Math.min(left, window.scrollX + window.innerWidth - width - margin))
  top = Math.max(window.scrollY + margin, top)

  preview.style.left = `${left}px`
  preview.style.top = `${top}px`
  preview.style.display = 'block'
}

function reportGeoRenderModal() {
  const overlay = document.getElementById('repGeoOverlay')
  const coords = document.getElementById('repGeoCoords')
  const frame = document.getElementById('repGeoFrame')
  if (!overlay || !coords || !frame) {
    return
  }

  const lat = String(reportGeoModalState.lat ?? '').trim()
  const lon = String(reportGeoModalState.lon ?? '').trim()
  if (!lat || !lon) {
    return
  }

  coords.textContent = `${lat}, ${lon} · zoom ${reportGeoModalState.zoom}`
  const src = reportGeoMapEmbedUrl(lat, lon, reportGeoModalState.zoom)
  if (frame.getAttribute('src') !== src) {
    frame.setAttribute('src', src)
  }
}

function reportGeoOpenModal(lat, lon) {
  ensureReportGeoUi()
  reportGeoHidePreview()

  reportGeoModalState.lat = String(lat ?? '').trim()
  reportGeoModalState.lon = String(lon ?? '').trim()
  reportGeoModalState.zoom = 18
  reportGeoRenderModal()

  const overlay = document.getElementById('repGeoOverlay')
  if (overlay) {
    overlay.style.display = 'flex'
  }
}

function reportGeoChangeZoom(step) {
  const delta = Number(step) || 0
  if (!delta) {
    return
  }

  reportGeoModalState.zoom = Math.min(Math.max((Number(reportGeoModalState.zoom) || 18) + delta, 3), 21)
  reportGeoRenderModal()
}

function reportGeoCloseModal() {
  const overlay = document.getElementById('repGeoOverlay')
  if (overlay) {
    overlay.style.display = 'none'
  }
}

function reportHistoryDetailSortKey(detail) {
  return [
    detail?.clientLabel || '',
    detail?.zoneLabel || '',
    detail?.locationLabel || '',
    detail?.workerLabel || '',
    detail?.statusLabel || '',
  ].join('|')
}

function reportHistoryCompareDetailsByEndToStart(left, right) {
  const leftEnd = Number(left?.sortEndTs ?? 0)
  const rightEnd = Number(right?.sortEndTs ?? 0)
  if (rightEnd !== leftEnd) {
    return rightEnd - leftEnd
  }

  const leftStart = Number(left?.sortStartTs ?? 0)
  const rightStart = Number(right?.sortStartTs ?? 0)
  if (rightStart !== leftStart) {
    return rightStart - leftStart
  }

  return reportHistoryDetailSortKey(left).localeCompare(reportHistoryDetailSortKey(right), 'pl', {
    sensitivity: 'base',
  })
}

function reportHistoryBuildRows(items, tab) {
  const normalizedTab = reportHistoryNormalizeTab(tab)
  const groups = new Map()

  items.forEach((item) => {
    const dayKey = reportHistoryDayKey(item)
    if (!dayKey) {
      return
    }

    if (!groups.has(dayKey)) {
      groups.set(dayKey, {
        dayKey,
        countAll: 0,
        runningCount: 0,
        closedSec: 0,
        dayStartIso: '',
        dayEndIso: '',
        dayStartTs: 0,
        dayEndTs: 0,
        latestRunningStartTs: 0,
        dayStartClientLabel: '-',
        dayEndClientLabel: '-',
        dayStartZoneCode: '-',
        dayEndZoneCode: '-',
        dayStartGeoLabel: '-',
        dayEndGeoLabel: '-',
        dayStartQrScore: 0,
        dayEndQrScore: 0,
        dayStartEventTs: 0,
        dayEndEventTs: 0,
        dayStartSourceItem: null,
        dayEndSourceItem: null,
        details: [],
      })
    }

    const bucket = groups.get(dayKey)
    const status = reportHistoryResolveStatus(item)
    const closedSec = reportHistoryClosedDurationSec(item)
    const isMarkerOnly = item?.historyMarkerOnly
    const startIso = toIso(item?.startAt)
    const endIso = toIso(item?.endAt)
    const sortStartTs = reportHistoryToTimestamp(startIso)
    const sortEndTs = reportHistoryToTimestamp(endIso) || sortStartTs
    const dayStartIso = toIso(item?.dayStartAt) || startIso || endIso
    const dayEndIso = toIso(item?.dayEndAt) || endIso
    const dayStartTs = reportHistoryToTimestamp(dayStartIso)
    const dayEndTs = reportHistoryToTimestamp(dayEndIso)
    const clientQrCandidate =
      item?.zoneId ??
      item?.utilityRoomId ??
      item?.roomId ??
      reportHistoryResolveDayQrCode(item, 'start') ??
      reportHistoryResolveDayQrCode(item, 'stop')
    const clientLabel = resolveClientLabelWithQrFallback(String(item.clientName ?? item.klient ?? '-').trim() || '-', clientQrCandidate)
    const qrStartCandidate = reportHistoryResolveDayQrCandidate(item, 'start')
    const qrStopCandidate = reportHistoryResolveDayQrCandidate(item, 'stop')
    const qrStartZoneCode = qrStartCandidate.code
    const qrStopZoneCode = qrStopCandidate.code
    const qrStartClientLabel = reportHistoryResolveClientByZoneCode(qrStartZoneCode, clientLabel)
    const qrStopClientLabel = reportHistoryResolveClientByZoneCode(qrStopZoneCode, clientLabel)
    const qrStartGeoLabel = reportHistoryResolveDayGpsCoords(item, 'start')
    const qrStopGeoLabel = reportHistoryResolveDayGpsCoords(item, 'stop')

    if (!isMarkerOnly) {
      bucket.countAll += 1
      bucket.closedSec += closedSec
      if (status === 'RUNNING') {
        bucket.runningCount += 1
        if (sortStartTs > bucket.latestRunningStartTs) {
          bucket.latestRunningStartTs = sortStartTs
        }
      }
    }
    if (dayStartTs && (!bucket.dayStartTs || dayStartTs < bucket.dayStartTs)) {
      bucket.dayStartTs = dayStartTs
      bucket.dayStartIso = dayStartIso
      bucket.dayStartClientLabel = qrStartClientLabel
      bucket.dayStartZoneCode = qrStartZoneCode
      bucket.dayStartGeoLabel = qrStartGeoLabel
      bucket.dayStartQrScore = qrStartCandidate.score
      bucket.dayStartEventTs = sortStartTs
      bucket.dayStartSourceItem = item
    } else if (dayStartTs && dayStartTs === bucket.dayStartTs) {
      const replaceByScore = qrStartCandidate.score > Number(bucket.dayStartQrScore ?? 0)
      const replaceByEventTs =
        qrStartCandidate.score === Number(bucket.dayStartQrScore ?? 0) &&
        sortStartTs > 0 &&
        (Number(bucket.dayStartEventTs ?? 0) <= 0 || sortStartTs < Number(bucket.dayStartEventTs ?? 0))
      const replaceByMissing = (bucket.dayStartZoneCode === '-' || !bucket.dayStartZoneCode) && qrStartZoneCode !== '-'
      if (replaceByScore || replaceByEventTs || replaceByMissing) {
        bucket.dayStartZoneCode = qrStartZoneCode
        bucket.dayStartClientLabel = qrStartClientLabel
        bucket.dayStartQrScore = qrStartCandidate.score
        bucket.dayStartEventTs = sortStartTs
        bucket.dayStartSourceItem = item
      }
      if ((bucket.dayStartGeoLabel === '-' || !bucket.dayStartGeoLabel) && qrStartGeoLabel !== '-') {
        bucket.dayStartGeoLabel = qrStartGeoLabel
      }
    }
    if (dayEndTs && dayEndTs > bucket.dayEndTs) {
      bucket.dayEndTs = dayEndTs
      bucket.dayEndIso = dayEndIso
      bucket.dayEndClientLabel = qrStopClientLabel
      bucket.dayEndZoneCode = qrStopZoneCode
      bucket.dayEndGeoLabel = qrStopGeoLabel
      bucket.dayEndQrScore = qrStopCandidate.score
      bucket.dayEndEventTs = sortEndTs
      bucket.dayEndSourceItem = item
    } else if (dayEndTs && dayEndTs === bucket.dayEndTs) {
      const replaceByScore = qrStopCandidate.score > Number(bucket.dayEndQrScore ?? 0)
      const replaceByEventTs =
        qrStopCandidate.score === Number(bucket.dayEndQrScore ?? 0) &&
        sortEndTs > 0 &&
        (Number(bucket.dayEndEventTs ?? 0) <= 0 || sortEndTs > Number(bucket.dayEndEventTs ?? 0))
      const replaceByMissing = (bucket.dayEndZoneCode === '-' || !bucket.dayEndZoneCode) && qrStopZoneCode !== '-'
      if (replaceByScore || replaceByEventTs || replaceByMissing) {
        bucket.dayEndZoneCode = qrStopZoneCode
        bucket.dayEndClientLabel = qrStopClientLabel
        bucket.dayEndQrScore = qrStopCandidate.score
        bucket.dayEndEventTs = sortEndTs
        bucket.dayEndSourceItem = item
      }
      if ((bucket.dayEndGeoLabel === '-' || !bucket.dayEndGeoLabel) && qrStopGeoLabel !== '-') {
        bucket.dayEndGeoLabel = qrStopGeoLabel
      }
    }

    if (isMarkerOnly) {
      return
    }

    if (normalizedTab === 'workers') {
      bucket.details.push({
        clientLabel,
        zoneLabel: String(item.zoneName ?? item.strefa ?? '-').trim() || '-',
        locationLabel: String(item.lokalizacja ?? item.location ?? '-').trim() || '-',
        startLabel: formatTime(startIso),
        stopLabel: status === 'RUNNING' ? '-' : formatTime(endIso),
        durationLabel: reportHistoryDurationLabel(item),
        statusLabel: status,
        sortStartTs,
        sortEndTs,
        sourceItem: item,
      })
      return
    }

    bucket.details.push({
      clientLabel,
      zoneLabel: String(item.zoneName ?? item.strefa ?? '-').trim() || '-',
      locationLabel: String(item.lokalizacja ?? item.location ?? '-').trim() || '-',
      workerLabel: String(item.workerName ?? item.workerLogin ?? '-').trim() || '-',
      startLabel: formatTime(startIso),
      stopLabel: status === 'RUNNING' ? '-' : formatTime(endIso),
      durationLabel: reportHistoryDurationLabel(item),
      statusLabel: status,
      sortStartTs,
      sortEndTs,
      sourceItem: item,
    })
  })

  return [...groups.values()]
    .map((bucket) => {
      const hasRunning = Number(bucket.runningCount ?? 0) > 0
      const todayKey = todayYmd()
      const isTodayBucket = String(bucket.dayKey ?? '').trim() === todayKey
      const activeRunningSec =
        hasRunning &&
        isTodayBucket &&
        Number(bucket.latestRunningStartTs ?? 0) > 0 &&
        Number(bucket.latestRunningStartTs ?? 0) > Number(bucket.dayEndTs ?? 0)
          ? Math.max(0, Math.floor((Date.now() - Number(bucket.latestRunningStartTs ?? 0)) / 1000))
          : 0
      const totalWorkSec = Math.max(0, Number(bucket.closedSec ?? 0)) + activeRunningSec
      return {
        ...bucket,
        closedSec: normalizedTab === 'workers' ? totalWorkSec : bucket.closedSec,
        qrStartLabel: formatTime(bucket.dayStartIso),
        qrStopLabel: formatTime(bucket.dayEndIso),
        qrStartClientLabel: bucket.dayStartClientLabel || '-',
        qrStopClientLabel: bucket.dayEndClientLabel || '-',
        qrStartZoneCode: bucket.dayStartZoneCode || '-',
        qrStopZoneCode: bucket.dayEndZoneCode || '-',
        qrStartGeoLabel: bucket.dayStartGeoLabel || '-',
        qrStopGeoLabel: bucket.dayEndGeoLabel || '-',
        qrStartSourceItem: bucket.dayStartSourceItem || null,
        qrStopSourceItem: bucket.dayEndSourceItem || null,
        details: [...bucket.details].sort(reportHistoryCompareDetailsByEndToStart),
      }
    })
    .sort((left, right) => (left.dayKey < right.dayKey ? 1 : -1))
}

function reportHistoryReadFilters() {
  return {
    tab: reportHistoryNormalizeTab(appState.reportHistoryTab),
    clientId: String(document.getElementById('repHistoryClient')?.value ?? '').trim(),
    workerLogin: String(document.getElementById('repHistoryWorker')?.value ?? '').trim(),
    zoneId: String(document.getElementById('repHistoryZone')?.value ?? '').trim(),
    from: String(document.getElementById('repHistoryFrom')?.value ?? '').trim(),
    to: String(document.getElementById('repHistoryTo')?.value ?? '').trim(),
  }
}

async function runReportHistory() {
  if (!appState.session?.orgId) {
    return
  }

  const scopedFilter = reportHistoryScopedFilter
  reportHistoryScopedFilter = null

  const filters = reportHistoryReadFilters()
  if (!filters.from || !filters.to) {
    reportHistorySetStatus('Ustaw zakres dat od-do.', true)
    return
  }

  if (filters.from > filters.to) {
    reportHistorySetStatus('Data "od" nie moze byc wieksza niz "do".', true)
    return
  }

  if (filters.tab === 'objects' && !filters.clientId) {
    reportHistorySetStatus('Wybierz obiekt (klienta).', true)
    return
  }

  if (filters.tab === 'workers' && !filters.workerLogin) {
    reportHistorySetStatus('Wybierz osobe.', true)
    return
  }

  if (filters.tab === 'zones' && !filters.zoneId) {
    reportHistorySetStatus('Wybierz strefe.', true)
    return
  }

  reportHistoryResetResults({ clearStatus: false })
  reportHistorySetStatus('Ładowanie historii...')
  reportHistorySetLoading(true)

  try {
    const fetchFilters = {
      source: 'events',
      fromIso: ymdToIsoRangeStart(filters.from),
      toIso: ymdToIsoRangeEnd(filters.to),
    }
    if (filters.tab === 'workers' && filters.workerLogin) {
      fetchFilters.workerLogin = filters.workerLogin
    }

    const items = await reportFetchEventsPaged(appState.session.orgId, {
      ...fetchFilters,
    })

    let filtered = items
    if (filters.tab === 'objects') {
      filtered = items.filter((item) =>
        reportMatchesPanelSelection(item, { clientId: filters.clientId, zoneId: '', workerLogin: '' }),
      )
    } else if (filters.tab === 'workers') {
      const filteredEvents = items.filter(
        (item) =>
          reportIsWorkerHistoryDetailItem(item) &&
          reportMatchesPanelSelection(item, { clientId: '', zoneId: '', workerLogin: filters.workerLogin }),
      )

      let markerRows = []
      try {
        const workerDayItems = await reportFetchEventsPaged(appState.session.orgId, {
          source: 'workdays',
          workerLogin: filters.workerLogin,
          fromIso: ymdToIsoRangeStart(filters.from),
          toIso: ymdToIsoRangeEnd(filters.to),
        })

        markerRows = workerDayItems
          .filter((item) =>
            reportMatchesPanelSelection(item, { clientId: '', zoneId: '', workerLogin: filters.workerLogin }),
          )
          .map((item) => ({
            ...item,
            historyMarkerOnly: true,
            dayStartAt: toIso(item?.dayStartAt ?? item?.startAt),
            dayEndAt: toIso(item?.dayEndAt ?? item?.endAt),
          }))
      } catch {
        markerRows = []
      }

      filtered = markerRows.length ? [...filteredEvents, ...markerRows] : filteredEvents
    } else if (filters.tab === 'zones') {
      filtered = items.filter((item) =>
        reportMatchesPanelSelection(item, { clientId: '', zoneId: filters.zoneId, workerLogin: '' }),
      )
    }

    if (scopedFilter && (scopedFilter.zoneId || scopedFilter.workerLogin)) {
      const scopedZoneCode = reportHistoryNormalizeQrCode(scopedFilter.zoneId)
      const scopedWorkerLogin = String(scopedFilter.workerLogin ?? '').trim()
      filtered = filtered.filter((item) => {
        if (scopedZoneCode) {
          const itemZoneCode = reportHistoryNormalizeQrCode(item?.zoneId ?? item?.utilityRoomId ?? item?.roomId)
          if (!itemZoneCode || itemZoneCode !== scopedZoneCode) {
            return false
          }
        }
        if (scopedWorkerLogin && !reportMatchesWorkerSelection(item, scopedWorkerLogin)) {
          return false
        }
        return true
      })
    }

    appState.reportHistoryRows = reportHistoryBuildRows(filtered, filters.tab)
    appState.reportHistoryExpanded = {}
    appState.reportHistoryEditableMap = {}
    reportHistorySetSummaryRows(appState.reportHistoryRows)
    reportHistoryRenderTable()

    if (!appState.reportHistoryRows.length) {
      reportHistorySetStatus('Brak danych dla wybranych filtrow.')
      return
    }

    const rowsCount = appState.reportHistoryRows.length
    const eventsCount = appState.reportHistoryRows.reduce((sum, row) => sum + Number(row.countAll ?? 0), 0)
    reportHistorySetStatus(`Historia gotowa. Dni: ${rowsCount} · wpisy: ${eventsCount}.`)
  } catch (error) {
    reportHistorySetStatus(error instanceof Error ? error.message : 'Blad pobierania historii.', true)
  } finally {
    reportHistorySetLoading(false)
  }
}

function reportHistoryPanelIsVisible() {
  const panel = document.getElementById('repHistory')
  return panel instanceof HTMLElement && panel.style.display !== 'none'
}

async function reportHistoryRefreshAfterEventSave(updatedItem = null) {
  if (!reportHistoryPanelIsVisible()) {
    return
  }

  const previousExpanded = { ...(appState.reportHistoryExpanded || {}) }
  const updatedDayKey = reportHistoryDayKey(updatedItem || {})
  await runReportHistory()

  const availableDayKeys = new Set((Array.isArray(appState.reportHistoryRows) ? appState.reportHistoryRows : []).map((row) => String(row.dayKey ?? '').trim()))
  const nextExpanded = {}
  Object.entries(previousExpanded).forEach(([dayKey, expanded]) => {
    if (expanded && availableDayKeys.has(dayKey)) {
      nextExpanded[dayKey] = true
    }
  })
  if (updatedDayKey && availableDayKeys.has(updatedDayKey)) {
    nextExpanded[updatedDayKey] = true
  }

  appState.reportHistoryExpanded = nextExpanded
  reportHistoryRenderTable()
}

function reportHistoryFindWorkerOption(workerLogin, workerName) {
  const normalizedLogin = String(workerLogin ?? '').trim()
  const normalizedName = String(workerName ?? '').trim()

  if (!Array.isArray(appState.reportHistoryWorkerOptions) || !appState.reportHistoryWorkerOptions.length) {
    return null
  }

  if (normalizedLogin) {
    const byLogin = appState.reportHistoryWorkerOptions.find((option) => String(option.value ?? '').trim() === normalizedLogin)
    if (byLogin) {
      return byLogin
    }
  }

  const normalizedNameKey = normalizeSearchText(normalizedName)
  if (normalizedNameKey) {
    const exact = appState.reportHistoryWorkerOptions.find((option) => normalizeSearchText(option.label) === normalizedNameKey)
    if (exact) {
      return exact
    }

    const partial = appState.reportHistoryWorkerOptions.find((option) => normalizeSearchText(option.label).includes(normalizedNameKey))
    if (partial) {
      return partial
    }
  }

  const loginLocalPart = normalizedLogin ? normalizeSearchText(normalizedLogin.split('@')[0]) : ''
  if (loginLocalPart) {
    return (
      appState.reportHistoryWorkerOptions.find((option) => normalizeSearchText(option.label).includes(loginLocalPart)) ?? null
    )
  }

  return null
}

function reportHistorySelectWorker(workerLogin, workerName) {
  const selectNode = document.getElementById('repHistoryWorker')
  const searchNode = document.getElementById('repHistoryWorkerSearch')
  if (!(selectNode instanceof HTMLSelectElement) || !(searchNode instanceof HTMLInputElement)) {
    return false
  }

  const option = reportHistoryFindWorkerOption(workerLogin, workerName)
  if (!option) {
    return false
  }

  ensureSelectValue(selectNode, option.value, option.label)
  searchNode.value = String(option.label ?? '').trim()
  reportHistoryApplySelectFilter('worker', { expandOnEmpty: false })
  reportHistoryCollapseSelect('worker')
  return true
}

function reportHistoryFindClientOption(clientId, clientName) {
  const normalizedId = String(clientId ?? '').trim()
  const normalizedName = normalizeSearchText(clientName)
  if (!Array.isArray(appState.reportHistoryClientOptions) || !appState.reportHistoryClientOptions.length) {
    return null
  }

  if (normalizedId) {
    const byId = appState.reportHistoryClientOptions.find((option) => String(option.value ?? '').trim() === normalizedId)
    if (byId) {
      return byId
    }
  }

  if (normalizedName) {
    const exact = appState.reportHistoryClientOptions.find((option) => normalizeSearchText(option.label) === normalizedName)
    if (exact) {
      return exact
    }

    const partial = appState.reportHistoryClientOptions.find((option) => normalizeSearchText(option.label).includes(normalizedName))
    if (partial) {
      return partial
    }
  }

  return null
}

function reportHistorySelectClient(clientId, clientName) {
  const selectNode = document.getElementById('repHistoryClient')
  const searchNode = document.getElementById('repHistoryClientSearch')
  if (!(selectNode instanceof HTMLSelectElement) || !(searchNode instanceof HTMLInputElement)) {
    return false
  }

  const option = reportHistoryFindClientOption(clientId, clientName)
  if (!option) {
    return false
  }

  ensureSelectValue(selectNode, option.value, option.label)
  searchNode.value = String(option.label ?? '').trim()
  reportHistoryApplySelectFilter('client', { expandOnEmpty: false })
  reportHistoryCollapseSelect('client')
  return true
}

function reportHistoryFindZoneOption(zoneId, zoneName, options = {}) {
  const strictId = Boolean(options?.strictId)
  const normalizedId = String(zoneId ?? '').trim()
  const normalizedName = normalizeSearchText(zoneName)
  if (!Array.isArray(appState.reportHistoryZoneOptions) || !appState.reportHistoryZoneOptions.length) {
    return null
  }

  if (normalizedId) {
    const byId = appState.reportHistoryZoneOptions.find((option) => String(option.value ?? '').trim() === normalizedId)
    if (byId) {
      return byId
    }
    if (strictId) {
      return null
    }
  }

  if (normalizedName) {
    const exact = appState.reportHistoryZoneOptions.find((option) => normalizeSearchText(option.label) === normalizedName)
    if (exact) {
      return exact
    }

    const partial = appState.reportHistoryZoneOptions.find((option) => normalizeSearchText(option.label).includes(normalizedName))
    if (partial) {
      return partial
    }
  }

  return null
}

function reportHistorySelectZone(zoneId, zoneName, options = {}) {
  const selectNode = document.getElementById('repHistoryZone')
  const searchNode = document.getElementById('repHistoryZoneSearch')
  if (!(selectNode instanceof HTMLSelectElement) || !(searchNode instanceof HTMLInputElement)) {
    return false
  }

  const normalizedZoneId = String(zoneId ?? '').trim()
  const strictId = Boolean(options?.strictId)
  const option = reportHistoryFindZoneOption(zoneId, zoneName, { strictId })
  if (!option && strictId && normalizedZoneId) {
    ensureSelectValue(selectNode, normalizedZoneId, normalizedZoneId)
    searchNode.value = String(zoneName ?? normalizedZoneId).trim() || normalizedZoneId
    reportHistoryApplySelectFilter('zone', { expandOnEmpty: false })
    reportHistoryCollapseSelect('zone')
    return true
  }
  if (!option) {
    return false
  }

  ensureSelectValue(selectNode, option.value, option.label)
  searchNode.value = String(option.label ?? '').trim()
  reportHistoryApplySelectFilter('zone', { expandOnEmpty: false })
  reportHistoryCollapseSelect('zone')
  return true
}

function eventHistoryDayKey(row) {
  const fromRow = String(row?.dayKey ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(fromRow)) {
    return fromRow
  }

  const fromStart = toIso(row?.startAt)
  if (fromStart) {
    return fromStart.slice(0, 10)
  }

  const fromEnd = toIso(row?.endAt)
  if (fromEnd) {
    return fromEnd.slice(0, 10)
  }

  return todayYmd()
}

function eventHistoryMonthRange(dayKey) {
  const match = String(dayKey ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    const today = todayYmd()
    return { day: today, from: firstDayOfCurrentMonthYmd(), to: today }
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const lastDay = new Date(year, month, 0).getDate()
  return {
    day: `${match[1]}-${match[2]}-${match[3]}`,
    from: `${match[1]}-${match[2]}-01`,
    to: `${match[1]}-${match[2]}-${pad2(lastDay)}`,
  }
}

async function openEventHistoryFromRow(row, tab, options = {}) {
  if (!appState.session?.orgId) {
    return false
  }

  const go = typeof window.go === 'function' ? window.go : null
  if (!go) {
    return false
  }

  const normalizedTab = reportHistoryNormalizeTab(tab)
  const range = eventHistoryMonthRange(eventHistoryDayKey(row))
  const strictZoneId = Boolean(options?.strictZoneId)
  const scopeFilter = options?.scopeFilter && typeof options.scopeFilter === 'object' ? options.scopeFilter : null
  reportHistoryScopedFilter = scopeFilter

  go('reports')
  await ensureReportsViewReady()
  openReportBuilder(reportHistoryKindForTab(normalizedTab))
  reportHistorySetTab(normalizedTab)

  const fromInput = document.getElementById('repHistoryFrom')
  const toInput = document.getElementById('repHistoryTo')
  if (fromInput instanceof HTMLInputElement) {
    fromInput.value = range.from
  }
  if (toInput instanceof HTMLInputElement) {
    toInput.value = range.to
  }

  let selected = false
  if (normalizedTab === 'workers') {
    selected = reportHistorySelectWorker(row?.workerLogin, row?.workerName)
  } else if (normalizedTab === 'zones') {
    const zoneIdCandidate = String(row?.zoneId ?? row?.roomId ?? row?.utilityRoomId ?? '').trim()
    selected = reportHistorySelectZone(zoneIdCandidate, row?.strefa ?? row?.zoneName, {
      strictId: strictZoneId || Boolean(reportHistoryNormalizeQrCode(zoneIdCandidate)),
    })
  } else {
    selected = reportHistorySelectClient(row?.clientId, row?.klient ?? row?.clientName)
  }

  if (!selected) {
    reportHistoryScopedFilter = null
    reportHistorySetStatus('Nie znaleziono rekordu na liscie historii.', true)
    return false
  }

  await runReportHistory()
  const focusedDay = String(range.day ?? '').trim()
  const dayRow = appState.reportHistoryRows.find((item) => String(item.dayKey ?? '').trim() === focusedDay)
  if (dayRow?.dayKey) {
    appState.reportHistoryExpanded = { [dayRow.dayKey]: true }
    reportHistoryRenderTable()
  }
  return true
}

async function openDashboardEntityHistory(row, sourceKind = 'zones') {
  const prepared = dashboardBuildHistoryRow(row, todayYmd())
  const zoneLabel = dashboardResolveZoneLabel(row)
  const zoneId = String(prepared.zoneId ?? prepared.roomId ?? prepared.utilityRoomId ?? '').trim()
  const hasZone = Boolean(zoneId || (zoneLabel && zoneLabel !== '-'))

  if (hasZone) {
    prepared.strefa = zoneLabel && zoneLabel !== '-' ? zoneLabel : zoneId
    prepared.zoneName = zoneLabel && zoneLabel !== '-' ? zoneLabel : zoneId
    const openedZone = await openEventHistoryFromRow(prepared, 'zones', {
      strictZoneId: Boolean(reportHistoryNormalizeQrCode(zoneId)),
      scopeFilter:
        sourceKind === 'zones'
          ? {
              zoneId,
              workerLogin: String(prepared.workerLogin ?? '').trim(),
            }
          : null,
    })
    if (openedZone) {
      return
    }
  }

  if (sourceKind === 'objects') {
    await openEventHistoryFromRow(prepared, 'objects')
    return
  }

  await openEventHistoryFromRow(prepared, 'workers')
}

async function openDashboardWorkerHistory(workerLogin, workerName) {
  if (!appState.session?.orgId) {
    return
  }

  const go = typeof window.go === 'function' ? window.go : null
  if (!go) {
    return
  }

  go('reports')
  await ensureReportsViewReady()
  openReportBuilder('workerTime')
  reportHistorySetTab('workers')

  const today = todayYmd()
  const fromInput = document.getElementById('repHistoryFrom')
  const toInput = document.getElementById('repHistoryTo')
  if (fromInput instanceof HTMLInputElement) {
    fromInput.value = today
  }
  if (toInput instanceof HTMLInputElement) {
    toInput.value = today
  }

  const selected = reportHistorySelectWorker(workerLogin, workerName)
  if (!selected) {
    const label = String(workerName ?? workerLogin ?? '').trim() || 'wybrana osoba'
    reportHistorySetStatus(`Nie znaleziono osoby "${label}" na liscie historii.`, true)
    return
  }

  await runReportHistory()
  const todayRow = appState.reportHistoryRows.find((row) => String(row.dayKey ?? '').trim() === today)
  if (todayRow?.dayKey) {
    appState.reportHistoryExpanded = { [todayRow.dayKey]: true }
    reportHistoryRenderTable()
  }
}

function reportHistoryToggle(dayKey) {
  const key = String(dayKey ?? '').trim()
  if (!key) {
    return
  }

  appState.reportHistoryExpanded = {
    ...appState.reportHistoryExpanded,
    [key]: !appState.reportHistoryExpanded?.[key],
  }
  reportHistoryRenderTable()
}

function openReportBuilder(kind) {
  const title = document.getElementById('repTitle')
  const subtitle = document.getElementById('repSubtitle')
  const historyConfig = reportHistoryBuilderConfig(kind)
  reportSetVisible('repHome', false)
  reportSetVisible('repBuilder', true)
  reportResetResults()

  if (historyConfig) {
    if (title) title.textContent = historyConfig.title
    if (subtitle) subtitle.textContent = historyConfig.subtitle
    reportSetVisible('repEvents', false)
    reportSetVisible('repHistory', true)
    reportSetVisible('repSoon', false)
    reportHistorySetTabsVisible(historyConfig.showTabs)
    reportHistoryApplyAllSelectFilters()
    reportHistorySetTab(historyConfig.tab)
    reportHistoryApplyRangeMode(reportHistoryReadRangeMode(), { force: false })
    reportHistoryResetResults({ clearStatus: false })
    reportHistorySetStatus(historyConfig.status)
    return
  }

  if (kind === 'eventsOperational') {
    if (title) title.textContent = 'Zestawienie zdarzeń'
    if (subtitle) subtitle.textContent = 'Operacyjne podsumowanie zdarzeń według klientów, stref, pracowników i typów.'
    reportSetVisible('repEvents', true)
    reportSetVisible('repHistory', false)
    reportSetVisible('repSoon', false)
    reportEventsDefaultDates()
    reportRefreshEventsZoneOptions()
    reportSetStatus('Ustaw filtry i kliknij "Generuj zestawienie".')
    return
  }

  if (title) title.textContent = 'Wkrótce'
  if (subtitle) subtitle.textContent = 'Ten typ zestawienia dodamy w kolejnym etapie.'
  reportSetVisible('repEvents', false)
  reportSetVisible('repHistory', false)
  reportSetVisible('repSoon', true)
  reportHistorySetTabsVisible(true)
}

function closeReportBuilder() {
  reportSetVisible('repBuilder', false)
  reportSetVisible('repHome', true)
  reportSetVisible('repEvents', false)
  reportSetVisible('repHistory', false)
  reportSetVisible('repSoon', false)
  reportHistorySetTabsVisible(true)
  reportGeoHidePreview()
  reportGeoCloseModal()
  reportResetResults()
}

function reportHasValue(value) {
  if (value == null) {
    return false
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) && value !== 0
  }
  if (typeof value === 'boolean') {
    return true
  }
  const text = String(value).trim()
  return Boolean(text) && text !== '-'
}

function reportHistoryMergeKey(item, index, prefix) {
  const id = String(item?.eventId ?? item?.workdayId ?? item?.id ?? '').trim()
  const startAt = toIso(item?.startAt)
  const endAt = toIso(item?.endAt)
  const status = String(item?.status ?? '').trim().toUpperCase()
  const endReason = String(item?.endReason ?? '').trim().toUpperCase()
  const worker = String(item?.workerLogin ?? item?.workerName ?? '').trim().toLowerCase()
  const zone = String(item?.zoneId ?? item?.utilityRoomId ?? item?.roomId ?? item?.strefa ?? item?.zoneName ?? '')
    .trim()
    .toLowerCase()
  const marker = [startAt, endAt, status, endReason, worker, zone].join('|')
  return id ? `${id}|${marker}` : `${prefix}-${index}|${marker}`
}

function reportHistoryMergeScore(item) {
  const fields = [
    item?.eventId,
    item?.workdayId,
    item?.workerLogin,
    item?.workerName,
    item?.zoneId,
    item?.strefa,
    item?.zoneName,
    item?.clientId,
    item?.clientName,
    item?.klient,
    item?.lokalizacja,
    item?.startAt,
    item?.endAt,
    item?.durationSec,
    item?.status,
    item?.endReason,
    item?.dayStartObject,
    item?.dayStopObject,
    item?.comment,
    item?.updatedAt,
  ]
  return fields.reduce((score, value) => score + (reportHasValue(value) ? 1 : 0), 0)
}

function reportMergeHistorySourceItems(...collections) {
  const merged = new Map()

  collections.forEach((items, collectionIndex) => {
    if (!Array.isArray(items) || !items.length) {
      return
    }

    const prefix = collectionIndex === 0 ? 'primary' : `secondary-${collectionIndex}`
    items.forEach((item, itemIndex) => {
      const key = reportHistoryMergeKey(item, itemIndex, prefix)
      const existing = merged.get(key)
      if (!existing) {
        merged.set(key, item)
        return
      }

      const existingScore = reportHistoryMergeScore(existing)
      const incomingScore = reportHistoryMergeScore(item)
      const preferIncoming = incomingScore > existingScore
      const preferred = preferIncoming ? item : existing
      const fallback = preferIncoming ? existing : item
      merged.set(key, { ...fallback, ...preferred })
    })
  })

  return [...merged.values()]
}

async function reportFetchEventsSourcePaged(orgId, baseFilters, maxPages) {
  const items = []
  let page = 1
  let totalPages = 1

  while (page <= totalPages && page <= maxPages) {
    const response = await getWorkdays(orgId, {
      ...baseFilters,
      page,
    })

    const pageItems = response?.items ?? []
    items.push(...pageItems)
    totalPages = Number(response?.totalPages ?? 1) || 1
    page += 1
  }

  return items
}

async function reportFetchEventsPaged(orgId, filters = {}) {
  const pageSize = Math.max(Number(filters.pageSize ?? 1000) || 1000, 1)
  const maxPages = Math.max(Number(filters.maxPages ?? 200) || 200, 1)
  const baseFilters = {
    ...filters,
    pageSize,
  }
  delete baseFilters.maxPages

  const source = String(baseFilters.source ?? '').trim().toLowerCase()
  const primaryItems = await reportFetchEventsSourcePaged(orgId, baseFilters, maxPages)

  if (source !== 'events' && source !== 'event') {
    return primaryItems
  }

  if (primaryItems.length) {
    return primaryItems
  }

  let backupItems = []
  try {
    backupItems = await reportFetchEventsSourcePaged(orgId, { ...baseFilters, source: 'backupcycle' }, maxPages)
  } catch {
    backupItems = []
  }

  if (!backupItems.length) {
    return primaryItems
  }

  return reportMergeHistorySourceItems(primaryItems, backupItems)
}

function reportReadPanel(panel) {
  return {
    clientId: String(document.getElementById(`rep${panel}_client`)?.value ?? '').trim(),
    zoneId: String(document.getElementById(`rep${panel}_zone`)?.value ?? '').trim(),
    workerLogin: String(document.getElementById(`rep${panel}_worker`)?.value ?? '').trim(),
    from: String(document.getElementById(`rep${panel}_from`)?.value ?? '').trim(),
    to: String(document.getElementById(`rep${panel}_to`)?.value ?? '').trim(),
  }
}

async function reportFetchEventsForPanel(orgId, panel) {
  return reportFetchEventsPaged(orgId, {
    source: 'events',
    status: 'CLOSED',
    fromIso: ymdToIsoRangeStart(panel.from),
    toIso: ymdToIsoRangeEnd(panel.to),
  })
}

function reportReadEventsFilters() {
  return {
    from: String(document.getElementById('repEventsFrom')?.value ?? '').trim(),
    to: String(document.getElementById('repEventsTo')?.value ?? '').trim(),
    clientId: String(document.getElementById('repEventsClient')?.value ?? '').trim(),
    zoneId: String(document.getElementById('repEventsZone')?.value ?? '').trim(),
    workerLogin: String(document.getElementById('repEventsWorker')?.value ?? '').trim(),
    status: String(document.getElementById('repEventsStatus')?.value ?? 'all').trim(),
    type: String(document.getElementById('repEventsType')?.value ?? '').trim(),
    groupBy: String(document.getElementById('repEventsGroupBy')?.value ?? 'client').trim() || 'client',
    search: String(document.getElementById('repEventsSearch')?.value ?? '').trim(),
  }
}

function reportEventClientLabel(item) {
  const qrCandidate =
    item?.zoneId ??
    item?.roomId ??
    item?.utilityRoomId ??
    item?.dayStartObject ??
    item?.dayStopObject ??
    item?.strefa
  return resolveClientLabelWithQrFallback(String(item?.clientName ?? item?.klient ?? item?.clientId ?? '-').trim() || '-', qrCandidate)
}

function reportEventZoneLabel(item) {
  return String(item?.zoneName ?? item?.strefa ?? item?.zoneId ?? item?.roomId ?? '-').trim() || '-'
}

function reportEventLocationLabel(item) {
  return String(item?.lokalizacja ?? item?.location ?? '-').trim() || '-'
}

function reportEventWorkerLabel(item) {
  return String(item?.workerName ?? item?.workerLogin ?? '-').trim() || '-'
}

function reportEventTypeLabel(item) {
  return eventTypeInfo(item).label
}

function reportEventDurationSec(item) {
  const direct = Number(item?.durationSec ?? 0)
  if (Number.isFinite(direct) && direct > 0) {
    return Math.floor(direct)
  }

  const startIso = toIso(item?.startAt)
  const endIso = toIso(item?.endAt)
  if (!startIso || !endIso) {
    return 0
  }

  const startMs = new Date(startIso).getTime()
  const endMs = new Date(endIso).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return 0
  }

  return Math.floor((endMs - startMs) / 1000)
}

function reportEventMatchesStatus(item, status) {
  const normalized = String(status ?? 'all').trim().toLowerCase()
  if (!normalized || normalized === 'all') {
    return true
  }

  const closed = reportClosedEvent(item)
  if (normalized === 'closed') {
    return closed
  }
  if (normalized === 'running') {
    return !closed
  }
  return true
}

function reportEventMatchesSearch(item, search) {
  const query = normalizeSearchText(search)
  if (!query) {
    return true
  }

  const haystack = [
    reportEventClientLabel(item),
    reportEventZoneLabel(item),
    reportEventLocationLabel(item),
    reportEventWorkerLabel(item),
    item?.workerLogin,
    reportEventTypeLabel(item),
    normalizeVisibleEventComment(item?.comment),
    item?.editedBy,
    item?.date,
    item?.start,
    item?.stop,
  ]
    .map((value) => normalizeSearchText(value))
    .join(' ')

  return haystack.includes(query)
}

function reportEventMatchesFilters(item, filters) {
  if (!reportMatchesPanelSelection(item, filters)) {
    return false
  }
  if (!reportEventMatchesStatus(item, filters.status)) {
    return false
  }
  if (filters.type && reportEventTypeLabel(item) !== filters.type) {
    return false
  }
  return reportEventMatchesSearch(item, filters.search)
}

function reportEventGroupLabel(item, groupBy) {
  const mode = String(groupBy ?? 'client').trim()
  if (mode === 'zone') {
    const zone = reportEventZoneLabel(item)
    const location = reportEventLocationLabel(item)
    return [zone, location && location !== '-' ? location : ''].filter(Boolean).join(' / ') || 'Bez strefy'
  }
  if (mode === 'worker') {
    return reportEventWorkerLabel(item) || 'Bez pracownika'
  }
  if (mode === 'type') {
    return reportEventTypeLabel(item)
  }
  if (mode === 'day') {
    const key = String(item?.dayKey ?? item?.startAt ?? item?.endAt ?? '').slice(0, 10)
    return key ? formatDatePl(`${key}T12:00:00.000Z`) : 'Bez daty'
  }
  return reportEventClientLabel(item) || 'Bez klienta'
}

function reportAggregateEvents(items, groupBy) {
  const groups = new Map()

  items.forEach((item) => {
    const group = reportEventGroupLabel(item, groupBy)
    if (!groups.has(group)) {
      groups.set(group, {
        group,
        count: 0,
        totalSec: 0,
        avgSec: 0,
        closed: 0,
        running: 0,
        workers: new Set(),
        clients: new Set(),
        zones: new Set(),
        firstStart: '',
        lastStop: '',
      })
    }

    const bucket = groups.get(group)
    const durationSec = reportEventDurationSec(item)
    const startIso = toIso(item?.startAt)
    const endIso = toIso(item?.endAt)
    bucket.count += 1
    bucket.totalSec += durationSec
    if (reportClosedEvent(item)) {
      bucket.closed += 1
    } else {
      bucket.running += 1
    }
    const worker = reportEventWorkerLabel(item)
    const client = reportEventClientLabel(item)
    const zone = reportEventZoneLabel(item)
    if (worker && worker !== '-') bucket.workers.add(worker)
    if (client && client !== '-') bucket.clients.add(client)
    if (zone && zone !== '-') bucket.zones.add(zone)
    if (startIso && (!bucket.firstStart || startIso < bucket.firstStart)) {
      bucket.firstStart = startIso
    }
    if (endIso && (!bucket.lastStop || endIso > bucket.lastStop)) {
      bucket.lastStop = endIso
    }
  })

  return [...groups.values()]
    .map((bucket) => ({
      ...bucket,
      workerCount: bucket.workers.size,
      clientCount: bucket.clients.size,
      zoneCount: bucket.zones.size,
      avgSec: bucket.count ? Math.floor(bucket.totalSec / bucket.count) : 0,
    }))
    .sort((left, right) => {
      if (right.totalSec !== left.totalSec) return right.totalSec - left.totalSec
      if (right.count !== left.count) return right.count - left.count
      return left.group.localeCompare(right.group, 'pl', { numeric: true, sensitivity: 'base' })
    })
}

function reportRenderEventsSummary(items, groupRows, filters) {
  const summary = document.getElementById('repSummary')
  if (!summary) {
    return
  }

  const closed = items.filter((item) => reportClosedEvent(item)).length
  const running = items.length - closed
  const clients = new Set(items.map((item) => reportEventClientLabel(item)).filter((value) => value && value !== '-')).size
  const zones = new Set(items.map((item) => reportEventZoneLabel(item)).filter((value) => value && value !== '-')).size
  const longest = groupRows[0]
  summary.innerHTML = `
    <div class="rep-summary-card">
      <div><b>Zakres:</b> ${escapeHtml(formatDatePl(`${filters.from}T12:00:00.000Z`))} - ${escapeHtml(formatDatePl(`${filters.to}T12:00:00.000Z`))}</div>
      <div><b>Status:</b> zamknięte ${closed} · otwarte ${running}</div>
      <div><b>Zakres danych:</b> klienci ${clients} · strefy ${zones}</div>
      <div><b>Największa grupa:</b> ${escapeHtml(longest?.group ?? '-')} · ${escapeHtml(durationSecondsToHms(longest?.totalSec ?? 0))}</div>
    </div>
  `
  reportSetVisible('repSummary', true)
}

function reportMapEventsDetailsRows(items) {
  return items
    .slice()
    .sort((left, right) => String(right.startAt ?? right.endAt ?? '').localeCompare(String(left.startAt ?? left.endAt ?? '')))
    .slice(0, 300)
    .map((item) => ({
      date: item.date || formatDatePl(item.startAt || item.endAt),
      start: dashboardClockLabelToHm(item.start, '-'),
      stop: dashboardClockLabelToHm(item.stop, '-'),
      duration: durationSecondsToHms(reportEventDurationSec(item)),
      worker: reportEventWorkerLabel(item),
      client: reportEventClientLabel(item),
      zone: zoneNameWithQrHtml(reportEventZoneLabel(item), item),
      location: reportEventLocationLabel(item),
      type: reportEventTypeLabel(item),
      comment: normalizeVisibleEventComment(item.comment) || '-',
    }))
}

async function runEventsOperationalReport() {
  if (!appState.session?.orgId) {
    return
  }

  const filters = reportReadEventsFilters()
  if (!filters.from || !filters.to) {
    reportSetStatus('Wybierz zakres dat.', true)
    return
  }
  if (filters.from > filters.to) {
    reportSetStatus('Data "od" nie może być większa niż "do".', true)
    return
  }

  reportResetResults()
  reportSetStatus('Ładowanie zdarzeń...')

  try {
    const sourceRows = await reportFetchEventsPaged(appState.session.orgId, {
      source: 'events',
      fromIso: ymdToIsoRangeStart(filters.from),
      toIso: ymdToIsoRangeEnd(filters.to),
      pageSize: 1000,
      maxPages: 200,
    })
    const rows = sourceRows.filter((item) => reportEventMatchesFilters(item, filters))
    const stats = reportStats(rows)
    const workerCount = new Set(rows.map((item) => reportEventWorkerLabel(item)).filter((value) => value && value !== '-')).size
    const groupRows = reportAggregateEvents(rows, filters.groupBy)
    reportSetKpiValues(
      { count: rows.length, totalSec: stats.totalSec },
      { count: workerCount, totalSec: stats.avgSec },
    )
    reportRenderEventsSummary(rows, groupRows, filters)

    const groupHeaders = [
      { key: 'group', label: 'Grupa' },
      { key: 'count', label: 'Zdarzenia', align: 'right' },
      { key: 'total', label: 'Łączny czas', align: 'right' },
      { key: 'avg', label: 'Średni czas', align: 'right' },
      { key: 'workers', label: 'Pracownicy', align: 'right' },
      { key: 'clients', label: 'Klienci', align: 'right' },
      { key: 'zones', label: 'Strefy', align: 'right' },
      { key: 'running', label: 'Otwarte', align: 'right' },
      { key: 'closed', label: 'Zamknięte', align: 'right' },
    ]
    const groupMapped = groupRows.map((row) => ({
      group: row.group,
      count: String(row.count),
      total: durationSecondsToHms(row.totalSec),
      avg: durationSecondsToHms(row.avgSec),
      workers: String(row.workerCount),
      clients: String(row.clientCount),
      zones: String(row.zoneCount),
      running: String(row.running),
      closed: String(row.closed),
    }))
    reportRenderTable('repTableA', groupHeaders, groupMapped)
    reportSetVisible('repTableAWrap', true)

    reportRenderLocationChart(
      'repChartA',
      groupRows.slice(0, 10).map((row) => ({
        location: row.group,
        totalSec: row.totalSec,
        count: row.count,
      })),
    )
    reportSetVisible('repDiffWrap', true)

    const detailHeaders = [
      { key: 'date', label: 'Data' },
      { key: 'start', label: 'START' },
      { key: 'stop', label: 'STOP' },
      { key: 'duration', label: 'Czas', align: 'right' },
      { key: 'worker', label: 'Pracownik' },
      { key: 'client', label: 'Klient' },
      { key: 'zone', label: 'Strefa', html: true },
      { key: 'location', label: 'Lokalizacja' },
      { key: 'type', label: 'Typ' },
      { key: 'comment', label: 'Komentarz' },
    ]
    const detailRows = reportMapEventsDetailsRows(rows)
    reportRenderTable('repTableB', detailHeaders, detailRows)
    reportSetVisible('repTableBWrap', true)

    const csvLines = [
      reportToCsvLine(['Zestawienie zdarzeń']),
      reportToCsvLine(['Zakres', `${filters.from} - ${filters.to}`]),
      reportToCsvLine(['Zdarzenia', rows.length, 'Łączny czas', durationSecondsToHms(stats.totalSec)]),
      '',
      reportToCsvLine(['Podsumowanie']),
      reportToCsvLine(groupHeaders.map((header) => header.label)),
      ...groupMapped.map((row) => reportToCsvLine(groupHeaders.map((header) => row[header.key] ?? ''))),
      '',
      reportToCsvLine(['Szczegóły']),
      reportToCsvLine(detailHeaders.map((header) => header.label)),
      ...detailRows.map((row) => reportToCsvLine(detailHeaders.map((header) => row[header.key] ?? ''))),
    ]
    appState.reportLastCsv = csvLines.join('\n')

    const downloadButton = document.getElementById('repDownloadCsv')
    if (downloadButton) {
      downloadButton.disabled = !appState.reportLastCsv
    }

    reportSetStatus(`Gotowe. Zdarzenia: ${rows.length} · grupy: ${groupRows.length}.`)
  } catch (error) {
    reportSetStatus(error instanceof Error ? error.message : 'Błąd pobierania danych do zestawienia.', true)
  }
}

function reportNormalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

function reportMatchesWorkerSelection(item, workerLogin) {
  const selectedLoginRaw = String(workerLogin ?? '').trim()
  if (!selectedLoginRaw) {
    return true
  }

  const itemLoginRaw = String(item?.workerLogin ?? '').trim()
  if (itemLoginRaw && itemLoginRaw === selectedLoginRaw) {
    return true
  }

  const selectedLoginNormalized = normalizeSearchText(selectedLoginRaw)
  const itemLoginNormalized = normalizeSearchText(itemLoginRaw)
  if (selectedLoginNormalized && itemLoginNormalized && selectedLoginNormalized === itemLoginNormalized) {
    return true
  }

  const selectedLoginLocal = normalizeSearchText(selectedLoginRaw.split('@')[0])
  const itemLoginLocal = normalizeSearchText(itemLoginRaw.split('@')[0])
  if (selectedLoginLocal && itemLoginLocal && selectedLoginLocal === itemLoginLocal) {
    return true
  }

  const selectedWorker = appState.workers.find(
    (worker) => String(worker.login ?? worker.id ?? '').trim() === selectedLoginRaw,
  )
  const selectedWorkerName = normalizeSearchText(selectedWorker?.name)
  const itemWorkerName = normalizeSearchText(item?.workerName)

  if (selectedWorkerName && itemWorkerName) {
    if (itemWorkerName === selectedWorkerName) {
      return true
    }
    if (itemWorkerName.includes(selectedWorkerName) || selectedWorkerName.includes(itemWorkerName)) {
      return true
    }
  }

  if (selectedLoginLocal && itemWorkerName) {
    if (itemWorkerName.includes(selectedLoginLocal) || selectedLoginLocal.includes(itemWorkerName)) {
      return true
    }
  }

  return false
}

function reportIsWorkerHistoryDetailItem(item) {
  return String(item?.historySourceKind ?? '').trim().toLowerCase() !== 'workday'
}

function reportMatchesPanelSelection(item, panel) {
  if (panel.clientId) {
    const itemClientId = String(item.clientId ?? '').trim()
    if (itemClientId === panel.clientId) {
      // pass
    } else {
      const selectedClient = appState.clients.find((client) => String(client.id ?? '').trim() === panel.clientId)
      const selectedClientName = reportNormalizeText(selectedClient?.name)
      const itemClientName = reportNormalizeText(item.clientName ?? item.klient ?? item.clientId)
      const matchesByName =
        Boolean(selectedClientName) &&
        Boolean(itemClientName) &&
        (itemClientName === selectedClientName ||
          itemClientName.includes(selectedClientName) ||
          selectedClientName.includes(itemClientName))
      if (!matchesByName) {
        return false
      }
    }
  }

  if (panel.zoneId) {
    const selectedZoneRaw = String(panel.zoneId ?? '').trim()
    const selectedZoneCode = reportHistoryNormalizeQrCode(selectedZoneRaw)
    const itemZoneRaw = String(item.zoneId ?? item.utilityRoomId ?? item.roomId ?? '').trim()
    const itemZoneCode = reportHistoryNormalizeQrCode(itemZoneRaw)
    if (selectedZoneCode) {
      if (!itemZoneCode || itemZoneCode !== selectedZoneCode) {
        return false
      }
    } else if (itemZoneRaw === selectedZoneRaw) {
      // pass
    } else {
      const selectedZone = appState.zones.find((zone) => String(zone.id ?? '').trim() === selectedZoneRaw)
      const selectedZoneName = reportNormalizeText(selectedZone?.name ?? selectedZone?.zone)
      const itemZoneName = reportNormalizeText(item.zoneName ?? item.strefa)
      if (!selectedZoneName || !itemZoneName || itemZoneName !== selectedZoneName) {
        return false
      }
    }
  }

  if (panel.workerLogin) {
    if (!reportMatchesWorkerSelection(item, panel.workerLogin)) {
      return false
    }
  }

  return true
}

function reportClosedEvent(item) {
  const status = String(item.status ?? '').trim().toUpperCase()
  return status === 'CLOSED' || Boolean(item.endAt)
}

function reportGroupByDay(items) {
  const grouped = new Map()

  items.forEach((item) => {
    const dayKey = String(item.dayKey ?? '').trim() || String(item.startAt ?? '').slice(0, 10)
    if (!dayKey) {
      return
    }

    const duration = Number(item.durationSec ?? 0)
    const durationSec = Number.isFinite(duration) && duration > 0 ? Math.floor(duration) : 0
    if (!grouped.has(dayKey)) {
      grouped.set(dayKey, {
        date: dayKey,
        count: 0,
        totalSec: 0,
        minSec: Number.POSITIVE_INFINITY,
        maxSec: 0,
      })
    }

    const bucket = grouped.get(dayKey)
    bucket.count += 1
    bucket.totalSec += durationSec
    bucket.minSec = Math.min(bucket.minSec, durationSec)
    bucket.maxSec = Math.max(bucket.maxSec, durationSec)
  })

  return [...grouped.values()]
    .map((bucket) => ({
      ...bucket,
      minSec: Number.isFinite(bucket.minSec) ? bucket.minSec : 0,
      avgSec: bucket.count > 0 ? Math.floor(bucket.totalSec / bucket.count) : 0,
    }))
    .sort((left, right) => left.date.localeCompare(right.date))
}

function reportStats(items) {
  const count = items.length
  const durations = items.map((item) => Number(item.durationSec ?? item.totalSec ?? 0)).filter((value) => Number.isFinite(value) && value >= 0)
  const totalSec = durations.reduce((sum, value) => sum + value, 0)
  const minSec = durations.length ? Math.min(...durations) : 0
  const maxSec = durations.length ? Math.max(...durations) : 0
  const avgSec = count > 0 ? Math.floor(totalSec / count) : 0

  return {
    count,
    totalSec,
    avgSec,
    minSec,
    maxSec,
  }
}

function reportRenderTable(tableId, headers, rows) {
  const table = document.getElementById(tableId)
  if (!table) {
    return
  }

  const headHtml = `<thead><tr>${headers.map((header) => `<th>${escapeHtml(header.label)}</th>`).join('')}</tr></thead>`
  if (!rows.length) {
    table.innerHTML = `${headHtml}<tbody><tr><td colspan="${headers.length}" style="text-align:center; padding:18px;">Brak danych</td></tr></tbody>`
    return
  }

  const bodyHtml = rows
    .map(
      (row) =>
        `<tr>${headers
          .map((header) => {
            const value = row[header.key] ?? '-'
            const style = header.align ? ` style="text-align:${header.align};"` : ''
            return `<td${style}>${header.html ? value : escapeHtml(value)}</td>`
          })
          .join('')}</tr>`,
    )
    .join('')

  table.innerHTML = `${headHtml}<tbody>${bodyHtml}</tbody>`
}

function reportToCsvLine(values) {
  return values
    .map((value) => {
      const escaped = String(value ?? '').replaceAll('"', '""')
      return `"${escaped}"`
    })
    .join(',')
}

function reportSignedDuration(secondsValue) {
  const seconds = Number(secondsValue ?? 0)
  if (!Number.isFinite(seconds) || seconds === 0) {
    return '00:00:00'
  }

  const sign = seconds < 0 ? '-' : ''
  const absolute = Math.abs(Math.floor(seconds))
  const hours = Math.floor(absolute / 3600)
  const minutes = Math.floor((absolute % 3600) / 60)
  const secondsRemainder = absolute % 60

  return `${sign}${pad2(hours)}:${pad2(minutes)}:${pad2(secondsRemainder)}`
}

function reportDownloadCsv() {
  if (!appState.reportLastCsv) {
    return
  }

  const blob = new Blob([`\ufeff${appState.reportLastCsv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `zestawienie-zdarzen-${todayYmd()}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

async function _runEventsReportComparison() {
  if (!appState.session?.orgId) {
    return
  }

  const panelA = reportReadPanel('A')
  const panelB = reportReadPanel('B')
  if (!panelA.clientId || !panelB.clientId) {
    reportSetStatus('Najpierw wybierz klienta w panelu A i B.', true)
    return
  }

  if (panelA.from && panelA.to && panelA.from > panelA.to) {
    reportSetStatus('Panel A: data "od" nie może być większa niż "do".', true)
    return
  }
  if (panelB.from && panelB.to && panelB.from > panelB.to) {
    reportSetStatus('Panel B: data "od" nie może być większa niż "do".', true)
    return
  }

  reportResetResults()
  reportSetStatus('Ładowanie danych...')

  const dayMode = Boolean(document.getElementById('repMode_day')?.checked)
  const flags = {
    time: Boolean(document.getElementById('repChk_time')?.checked),
    count: Boolean(document.getElementById('repChk_count')?.checked),
    avg: Boolean(document.getElementById('repChk_avg')?.checked),
      minmax: Boolean(document.getElementById('repChk_minmax')?.checked),
  }
  if (!flags.time && !flags.count && !flags.avg && !flags.minmax) {
    reportSetStatus('Zaznacz co najmniej jedną metrykę do porównania.', true)
    return
  }

  try {
    const [itemsA, itemsB] = await Promise.all([
      reportFetchEventsForPanel(appState.session.orgId, panelA),
      reportFetchEventsForPanel(appState.session.orgId, panelB),
    ])

    const filteredA = itemsA.filter((item) => reportClosedEvent(item) && reportMatchesPanelSelection(item, panelA))
    const filteredB = itemsB.filter((item) => reportClosedEvent(item) && reportMatchesPanelSelection(item, panelB))
    const rowsA = dayMode ? reportGroupByDay(filteredA) : filteredA
    const rowsB = dayMode ? reportGroupByDay(filteredB) : filteredB
    const statsA = reportStats(rowsA)
    const statsB = reportStats(rowsB)
    reportSetKpiValues(statsA, statsB)
    reportRenderCharts(filteredA, filteredB, panelA, panelB)

    const statsDiff = {
      count: statsB.count - statsA.count,
      totalSec: statsB.totalSec - statsA.totalSec,
      avgSec: statsB.avgSec - statsA.avgSec,
      minSec: statsB.minSec - statsA.minSec,
      maxSec: statsB.maxSec - statsA.maxSec,
    }

    const summary = document.getElementById('repSummary')
    if (summary) {
      summary.innerHTML = `
        <div class="rep-summary-card">
          <div><b>Panel A</b> · rekordy: ${statsA.count} · czas: ${durationSecondsToHms(statsA.totalSec)}${flags.avg ? ` · średni: ${durationSecondsToHms(statsA.avgSec)}` : ''}${flags.minmax ? ` · min/max: ${durationSecondsToHms(statsA.minSec)} / ${durationSecondsToHms(statsA.maxSec)}` : ''}</div>
          <div><b>Panel B</b> · rekordy: ${statsB.count} · czas: ${durationSecondsToHms(statsB.totalSec)}${flags.avg ? ` · średni: ${durationSecondsToHms(statsB.avgSec)}` : ''}${flags.minmax ? ` · min/max: ${durationSecondsToHms(statsB.minSec)} / ${durationSecondsToHms(statsB.maxSec)}` : ''}</div>
          <div><b>Różnica (B - A)</b>${flags.count ? ` · rekordy: ${statsDiff.count}` : ''}${flags.time ? ` · czas: ${reportSignedDuration(statsDiff.totalSec)}` : ''}${flags.avg ? ` · średni: ${reportSignedDuration(statsDiff.avgSec)}` : ''}${flags.minmax ? ` · min: ${reportSignedDuration(statsDiff.minSec)} · max: ${reportSignedDuration(statsDiff.maxSec)}` : ''}</div>
        </div>
      `
    }
    reportSetVisible('repSummary', true)

    if (dayMode) {
      const headers = [{ key: 'date', label: 'Data' }]
      if (flags.count) headers.push({ key: 'count', label: 'Liczba zdarzeń', align: 'right' })
      if (flags.time) headers.push({ key: 'total', label: 'Łączny czas', align: 'right' })
      if (flags.avg) headers.push({ key: 'avg', label: 'Średni czas', align: 'right' })
      if (flags.minmax) headers.push({ key: 'min', label: 'Min', align: 'right' }, { key: 'max', label: 'Max', align: 'right' })

      const mappedA = rowsA.map((row) => ({
        date: formatDatePl(row.date),
        count: String(row.count),
        total: durationSecondsToHms(row.totalSec),
        avg: durationSecondsToHms(row.avgSec),
        min: durationSecondsToHms(row.minSec),
        max: durationSecondsToHms(row.maxSec),
      }))
      const mappedB = rowsB.map((row) => ({
        date: formatDatePl(row.date),
        count: String(row.count),
        total: durationSecondsToHms(row.totalSec),
        avg: durationSecondsToHms(row.avgSec),
        min: durationSecondsToHms(row.minSec),
        max: durationSecondsToHms(row.maxSec),
      }))

      const diffByDay = new Map()
      rowsA.forEach((row) => {
        diffByDay.set(row.date, {
          date: formatDatePl(row.date),
          countA: row.count,
          countB: 0,
          totalA: row.totalSec,
          totalB: 0,
        })
      })
      rowsB.forEach((row) => {
        if (!diffByDay.has(row.date)) {
          diffByDay.set(row.date, {
            date: formatDatePl(row.date),
            countA: 0,
            countB: row.count,
            totalA: 0,
            totalB: row.totalSec,
          })
        } else {
          const existing = diffByDay.get(row.date)
          existing.countB = row.count
          existing.totalB = row.totalSec
        }
      })

      const mappedDiff = [...diffByDay.values()].map((row) => ({
        date: row.date,
        countA: String(row.countA),
        countB: String(row.countB),
        countDiff: String(row.countB - row.countA),
        totalA: durationSecondsToHms(row.totalA),
        totalB: durationSecondsToHms(row.totalB),
        totalDiff: reportSignedDuration(row.totalB - row.totalA),
      }))

      const diffHeaders = [{ key: 'date', label: 'Data' }]
      if (flags.count) diffHeaders.push({ key: 'countA', label: 'A · Liczba', align: 'right' }, { key: 'countB', label: 'B · Liczba', align: 'right' }, { key: 'countDiff', label: 'B-A · Liczba', align: 'right' })
      if (flags.time) diffHeaders.push({ key: 'totalA', label: 'A · Czas', align: 'right' }, { key: 'totalB', label: 'B · Czas', align: 'right' }, { key: 'totalDiff', label: 'B-A · Czas', align: 'right' })

      reportRenderTable('repTableA', headers, mappedA)
      reportRenderTable('repTableB', headers, mappedB)
      reportRenderTable('repTableDiff', diffHeaders, mappedDiff)
      reportSetVisible('repTableAWrap', true)
      reportSetVisible('repTableBWrap', true)
      reportSetVisible('repDiffWrap', true)

      const csvLines = []
      csvLines.push(reportToCsvLine(['Sekcja', 'Panel A']))
      csvLines.push(reportToCsvLine(headers.map((header) => header.label)))
      mappedA.forEach((row) => {
        csvLines.push(reportToCsvLine(headers.map((header) => row[header.key] ?? '')))
      })
      csvLines.push('')
      csvLines.push(reportToCsvLine(['Sekcja', 'Panel B']))
      csvLines.push(reportToCsvLine(headers.map((header) => header.label)))
      mappedB.forEach((row) => {
        csvLines.push(reportToCsvLine(headers.map((header) => row[header.key] ?? '')))
      })
      csvLines.push('')
      csvLines.push(reportToCsvLine(['Sekcja', 'Różnice']))
      csvLines.push(reportToCsvLine(diffHeaders.map((header) => header.label)))
      mappedDiff.forEach((row) => {
        csvLines.push(reportToCsvLine(diffHeaders.map((header) => row[header.key] ?? '')))
      })
      appState.reportLastCsv = csvLines.join('\n')
    } else {
      const headers = [
        { key: 'date', label: 'Data' },
        { key: 'worker', label: 'Pracownik' },
        { key: 'client', label: 'Klient' },
        { key: 'zone', label: 'Strefa' },
        { key: 'duration', label: 'Czas', align: 'right' },
      ]

      const mappedA = rowsA.map((row) => ({
        date: row.date || formatDatePl(row.startAt),
        worker: row.workerName || row.workerLogin || '-',
        client: resolveClientLabelWithQrFallback(
          String(row.clientName || row.klient || '-'),
          row.zoneId || row.roomId || row.utilityRoomId || row.strefa || row.zoneName || '-',
        ),
        zone: row.zoneName || row.strefa || '-',
        duration: durationSecondsToHms(Number(row.durationSec ?? 0)),
      }))
      const mappedB = rowsB.map((row) => ({
        date: row.date || formatDatePl(row.startAt),
        worker: row.workerName || row.workerLogin || '-',
        client: resolveClientLabelWithQrFallback(
          String(row.clientName || row.klient || '-'),
          row.zoneId || row.roomId || row.utilityRoomId || row.strefa || row.zoneName || '-',
        ),
        zone: row.zoneName || row.strefa || '-',
        duration: durationSecondsToHms(Number(row.durationSec ?? 0)),
      }))
      const diffRows = [
        {
          metric: 'Różnica B - A',
          count: flags.count ? String(statsDiff.count) : '-',
          total: flags.time ? reportSignedDuration(statsDiff.totalSec) : '-',
          avg: flags.avg ? reportSignedDuration(statsDiff.avgSec) : '-',
          min: flags.minmax ? reportSignedDuration(statsDiff.minSec) : '-',
          max: flags.minmax ? reportSignedDuration(statsDiff.maxSec) : '-',
        },
      ]
      const diffHeaders = [
        { key: 'metric', label: 'Wskaźnik' },
        { key: 'count', label: 'Liczba', align: 'right' },
        { key: 'total', label: 'Czas', align: 'right' },
        { key: 'avg', label: 'Średni', align: 'right' },
        { key: 'min', label: 'Min', align: 'right' },
        { key: 'max', label: 'Max', align: 'right' },
      ]

      reportRenderTable('repTableA', headers, mappedA)
      reportRenderTable('repTableB', headers, mappedB)
      reportRenderTable('repTableDiff', diffHeaders, diffRows)
      reportSetVisible('repTableAWrap', true)
      reportSetVisible('repTableBWrap', true)
      reportSetVisible('repDiffWrap', true)

      const csvLines = []
      csvLines.push(reportToCsvLine(['Sekcja', 'Panel A']))
      csvLines.push(reportToCsvLine(headers.map((header) => header.label)))
      mappedA.forEach((row) => {
        csvLines.push(reportToCsvLine(headers.map((header) => row[header.key] ?? '')))
      })
      csvLines.push('')
      csvLines.push(reportToCsvLine(['Sekcja', 'Panel B']))
      csvLines.push(reportToCsvLine(headers.map((header) => header.label)))
      mappedB.forEach((row) => {
        csvLines.push(reportToCsvLine(headers.map((header) => row[header.key] ?? '')))
      })
      csvLines.push('')
      csvLines.push(reportToCsvLine(diffHeaders.map((header) => header.label)))
      diffRows.forEach((row) => {
        csvLines.push(reportToCsvLine(diffHeaders.map((header) => row[header.key] ?? '')))
      })
      appState.reportLastCsv = csvLines.join('\n')
    }

    const downloadButton = document.getElementById('repDownloadCsv')
    if (downloadButton) {
      downloadButton.disabled = !appState.reportLastCsv
    }

    reportSetStatus(`Porównanie gotowe. A: ${rowsA.length} · B: ${rowsB.length}.`)
  } catch (error) {
    reportSetStatus(error instanceof Error ? error.message : 'Błąd pobierania danych do zestawienia.', true)
  }
}

async function initializeReportsView() {
  await prepareReportsView()
  closeReportBuilder()
}

async function ensureReportsViewReady() {
  if (!reportsViewInitPromise) {
    reportsViewInitPromise = (async () => {
      try {
        await initializeReportsView()
      } finally {
        reportsViewInitPromise = null
      }
    })()
  }

  await reportsViewInitPromise
}

function bindClientsViewFunctions() {
  const binding = createBindingHelpers()
  syncClientsPermissions()

  window.filterClientsTable = () => {
    filterClientsTable({ resetPage: true })
  }
  window.ClientsModule = {
    fetch: () => fetchClientsForCurrentSession(true),
  }
  window.openClientModal = () => openClientModal('add')
  window.openClientEditModal = (clientId) => openClientModal('edit', clientId)
  window.closeClModal = closeClientModal
  window.saveClientData = () => {
    void saveClientData()
  }

  binding.add(document.getElementById('clSearchInput'), 'input', () => {
    filterClientsTable({ resetPage: true })
  })
  binding.add(document.getElementById('clSearchStatus'), 'change', () => {
    filterClientsTable({ resetPage: true })
  })
  ;['clSearchInput', 'clSearchStatus'].forEach((id) => {
    binding.add(document.getElementById(id), 'keydown', (event) => {
      if (event.key !== 'Enter') return
      filterClientsTable({ resetPage: true })
    })
  })

  binding.add(document.getElementById('clPrevBtn'), 'click', () => {
    if (appState.clientsPage <= 1) return
    appState.clientsPage -= 1
    filterClientsTable({ resetPage: false })
  })
  binding.add(document.getElementById('clNextBtn'), 'click', () => {
    if (appState.clientsPage >= appState.clientsTotalPages) return
    appState.clientsPage += 1
    filterClientsTable({ resetPage: false })
  })

  binding.add(document.getElementById('clientsBody'), 'click', (event) => {
    const button = event.target.closest('[data-client-action][data-client-id]')
    if (!button) {
      return
    }

    const action = String(button.getAttribute('data-client-action') ?? '').trim()
    const clientId = String(button.getAttribute('data-client-id') ?? '').trim()
    if (!clientId) {
      return
    }

    if (action === 'delete') {
      showTransientNotice('Usuwanie klientów jest wyłączone.', 'error')
      return
    }

    if (action === 'edit') {
      openClientModal('edit', clientId)
      return
    }

    openClientModal('view', clientId)
  })

  binding.add(document.getElementById('clModal'), 'click', (event) => {
    if (event.target?.id === 'clModal') {
      closeClientModal()
    }
  })

  return () => {
    delete window.filterClientsTable
    delete window.ClientsModule
    delete window.openClientModal
    delete window.openClientEditModal
    delete window.closeClModal
    delete window.saveClientData
    binding.done()
  }
}

function bindClientProfileViewFunctions() {
  const binding = createBindingHelpers()

  window.ClientProfileModule = {
    fetch: () => fetchClientProfileForCurrentSession(true),
  }
  window.closeCpModal = closeClientProfileModal
  window.cpEnterEdit = enterClientProfileEdit
  window.cpCancelEdit = cancelClientProfileEdit
  window.cpSaveEdit = () => {
    void saveClientProfileEdit()
  }

  binding.add(document.getElementById('cpSearchName'), 'input', filterClientProfileTable)
  binding.add(document.getElementById('cpSearchNip'), 'input', filterClientProfileTable)

  ;['cpSearchName', 'cpSearchNip'].forEach((id) => {
    binding.add(document.getElementById(id), 'keydown', (event) => {
      if (event.key !== 'Enter') return
      filterClientProfileTable()
    })
  })

  binding.add(document.getElementById('clientProfileBody'), 'click', (event) => {
    const button = event.target.closest('[data-client-profile-id]')
    if (!button) {
      return
    }

    const clientId = String(button.getAttribute('data-client-profile-id') ?? '').trim()
    if (!clientId) {
      return
    }

    openClientProfileModal(clientId)
  })

  binding.add(document.getElementById('cpModal'), 'click', (event) => {
    if (event.target?.id === 'cpModal') {
      closeClientProfileModal()
    }
  })

  return () => {
    delete window.ClientProfileModule
    delete window.closeCpModal
    delete window.cpEnterEdit
    delete window.cpCancelEdit
    delete window.cpSaveEdit
    binding.done()
  }
}

function bindSubmenuToggles() {
  const cleanups = []

  document.querySelectorAll('[data-toggle]').forEach((button) => {
    const handleClick = () => {
      const root = document.getElementById('portalRoot')
      if (root?.classList.contains('sidebar-collapsed')) {
        setSidebarCollapsed(false)
      }

      const key = button.dataset.toggle
      const submenu = document.getElementById(`submenu-${key}`)
      if (submenu) {
        submenu.classList.toggle('open')
      }
    }

    button.addEventListener('click', handleClick)
    cleanups.push(() => button.removeEventListener('click', handleClick))
  })

  return () => {
    cleanups.forEach((cleanup) => cleanup())
  }
}

function bindRouteButtons(router) {
  const handleRouteClick = (event) => {
    const kanbanMenuButton = eventTargetClosest(event, '[data-kanban-menu-section]')
    if (kanbanMenuButton) {
      appState.kanbanSection = kanbanNormalizeSection(kanbanMenuButton.getAttribute('data-kanban-menu-section'))
      if (appState.kanbanSection !== 'tasks') {
        appState.kanbanSearch = ''
      }
      router.go('kanban')
      return
    }

    const kanbanProjectButton = eventTargetClosest(event, '#portalSidebar [data-kanban-project-filter]')
    if (kanbanProjectButton) {
      appState.kanbanSection = 'tasks'
      appState.kanbanSearch = String(kanbanProjectButton.getAttribute('data-kanban-project-filter') ?? '').trim()
      router.go('kanban')
      return
    }

    const kanbanMenuCreateButton = eventTargetClosest(event, '#kanbanMenuCreateBtn')
    if (kanbanMenuCreateButton) {
      kanbanCreateTask()
      return
    }

    const kanbanMenuShowMore = eventTargetClosest(event, '#kanbanPortalMenuShowMore')
    if (kanbanMenuShowMore) {
      appState.kanbanProjectLimit = Math.min(60, Math.max(9, Number(appState.kanbanProjectLimit) || 9) + 12)
      renderKanbanView()
      return
    }

    const kanbanTeamAddButton = eventTargetClosest(event, '#kanbanPortalTeamAddBtn')
    if (kanbanTeamAddButton) {
      showTransientNotice('Zespoły będą zarządzane z poziomu organizacji.')
      return
    }

    const sidebarOrdersAddButton = eventTargetClosest(event, '#sidebarOrdersAddBtn')
    if (sidebarOrdersAddButton) {
      event.preventDefault()
      router.go('orders')
      ordersOpenAddEditor()
      return
    }

    const button = eventTargetClosest(event, '[data-route]')
    if (!button) {
      return
    }

    const route = button.getAttribute('data-route')
    if (route) {
      router.go(route)
    }
  }

  document.addEventListener('click', handleRouteClick)

  return () => {
    document.removeEventListener('click', handleRouteClick)
  }
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
  if (!appState.calendarShowCompletedTasks && kanbanTaskIsCompleted(task)) {
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
  const column = kanbanColumnsForStatus().find((item) => item.id === status)
  const columnScope = kanbanNormalizeColumnScope(column?.scope)
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
  if (!['day', 'week', 'month'].includes(appState.calendarViewMode)) {
    appState.calendarViewMode = 'week'
  }
  appState.calendarToneFilters = calendarNormalizeToneFilters(appState.calendarToneFilters)
  appState.calendarTasks = calendarLoadTasks()
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
    const start = appState.calendarCursorDay || todayYmd()
    const end = calendarAddDays(start, 2)
    label.textContent = `${formatDatePl(`${start}T12:00:00.000Z`)} - ${formatDatePl(`${end}T12:00:00.000Z`)}`
    return
  }
  const mode = appState.calendarViewMode
  const cursor = appState.calendarCursorDay || todayYmd()
  if (mode === 'day') {
    label.textContent = formatDatePl(`${cursor}T12:00:00.000Z`)
    return
  }
  if (mode === 'month') {
    label.textContent = calendarMonthLabel(cursor)
    return
  }
  const start = calendarStartOfWeek(cursor)
  const end = calendarAddDays(start, 6)
  label.textContent = `${formatDatePl(`${start}T12:00:00.000Z`)} - ${formatDatePl(`${end}T12:00:00.000Z`)}`
}

function calendarTimelineDayMonthLabel(dayKey) {
  const date = calendarDateFromYmd(dayKey)
  return date.toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'long' })
}

function calendarTimelineTypeOptions() {
  return [
    { value: 'individual', label: 'Zlecenia indywidualne' },
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
}

function calendarTimelineStatusDayKey() {
  const dayKey = String(appState.calendarCursorDay || todayYmd()).trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(dayKey) ? dayKey : todayYmd()
}

async function calendarEnsureTimelineWorkerState(options = {}) {
  if (!appState.session?.orgId || appState.calendarTimelineWorkerStateLoading) {
    return
  }
  const dayKey = String(options?.dayKey || calendarTimelineStatusDayKey()).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    return
  }
  const rangeEndDay = calendarAddDays(dayKey, 2)
  const force = options?.force === true
  const fetchedAt = Number(appState.calendarTimelineWorkerStateFetchedAt || 0)
  const isFresh = fetchedAt > 0 && Date.now() - fetchedAt < CALENDAR_TIMELINE_STATUS_REFRESH_MS
  if (
    !force &&
    appState.calendarTimelineWorkerStateDayKey === dayKey &&
    appState.calendarTimelineWorkerStateRangeStart === dayKey &&
    appState.calendarTimelineWorkerStateRangeEnd === rangeEndDay &&
    isFresh
  ) {
    return
  }

  appState.calendarTimelineWorkerStateLoading = true
  try {
    let statusRows = []
    let sourceRows = []
    let currentStatusRows = []
    if (dayKey === todayYmd()) {
      const [{ todayRows }, eventsResponse] = await Promise.all([
        dashboardLoadFastRows(String(appState.session.orgId)),
        getWorkdays(appState.session.orgId, {
          source: 'events',
          fromIso: dayKey,
          toIso: rangeEndDay,
          page: 1,
          pageSize: 8000,
        }).catch(() => ({ items: [] })),
      ])
      statusRows = Array.isArray(todayRows) ? todayRows : []
      currentStatusRows = statusRows
      sourceRows = Array.isArray(eventsResponse?.items) ? eventsResponse.items : []
      appState.dashboardTodayRows = statusRows
    } else {
      const [eventsResponse, currentStatusResponse] = await Promise.all([
        getWorkdays(appState.session.orgId, {
          source: 'events',
          fromIso: dayKey,
          toIso: rangeEndDay,
          page: 1,
          pageSize: 8000,
        }).catch(() => ({ items: [] })),
        dashboardLoadFastRows(String(appState.session.orgId)).catch(() => ({ todayRows: appState.dashboardTodayRows || [] })),
      ])
      sourceRows = Array.isArray(eventsResponse.items) ? eventsResponse.items : []
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
    if (appState.currentRoute === 'calendar' && calendarTimelineStatusDayKey() === dayKey) {
      renderCalendarView()
    }
  } catch {
    // Status kropek pozostaje czerwony, jeśli nie uda się pobrać aktywnych startów.
  } finally {
    appState.calendarTimelineWorkerStateLoading = false
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
  const keys = new Set()
  const addKeys = (nextKeys) => {
    if (!(nextKeys instanceof Set)) {
      return
    }
    nextKeys.forEach((key) => {
      if (key) {
        keys.add(String(key))
      }
    })
  }
  const workerName = worker?.workerName ?? worker?.fullName ?? worker?.name
  const workerLogin = worker?.workerLogin ?? worker?.login ?? worker?.id
  const workerId = worker?.workerId ?? worker?.id
  addKeys(dashboardWorkerAliasKeys(workerName, workerLogin, workerId, { includeLooseNameKeys: false }))
  const loginEmail = String(worker?.loginEmail ?? worker?.email ?? '').trim()
  if (loginEmail) {
    addKeys(dashboardWorkerAliasKeys(workerName, loginEmail, workerId, { includeLooseNameKeys: false }))
  }
  return keys
}

function calendarTimelineEventTimestamp(value) {
  const iso = toIso(value)
  if (!iso) {
    return 0
  }
  const timestamp = new Date(iso).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function calendarTimelineSourceRowStartMinutes(row) {
  const iso = toIso(row?.startAt ?? row?.dayStartAt)
  if (!iso) {
    return -1
  }
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) {
    return -1
  }
  return date.getHours() * 60 + date.getMinutes()
}

function calendarTimelineBuildWorkerStateMap(dayKey) {
  const normalizedDayKey = String(dayKey ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDayKey)) {
    return new Map()
  }

  const stateMap = new Map()
  const upsertState = (key, state = {}) => {
    if (!key) {
      return
    }
    const existing = stateMap.get(key) || {
      hasStart: false,
      isRunning: false,
      startMinutes: -1,
    }
    const nextStartMinutes = Number(state.startMinutes ?? -1)
    stateMap.set(key, {
      hasStart: existing.hasStart || Boolean(state.hasStart),
      isRunning: existing.isRunning || Boolean(state.isRunning),
      startMinutes:
        existing.startMinutes >= 0 && nextStartMinutes >= 0
          ? Math.min(existing.startMinutes, nextStartMinutes)
          : existing.startMinutes >= 0
            ? existing.startMinutes
            : nextStartMinutes >= 0
              ? nextStartMinutes
              : -1,
    })
  }

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
  rows.forEach((row) => {
    const startMinutes = dashboardScheduleTimeToMinutes(row?.qrStart)
    const hasStart = Number.isFinite(startMinutes) && startMinutes >= 0
    const stopLabel = String(row?.qrStop ?? '').trim()
    const hasStop = Boolean(stopLabel && stopLabel !== '-' && stopLabel !== '--:--' && stopLabel !== '--:--:--')
    const keys = dashboardResolveTodayRowAliasKeys(row)
    keys.forEach((key) => {
      upsertState(key, {
        hasStart,
        isRunning: Boolean(row?.isRunning) || (hasStart && !hasStop),
        startMinutes,
      })
    })
  })

  const sourceRows =
    appState.calendarTimelineWorkerStateDayKey === normalizedDayKey
      ? Array.isArray(appState.calendarTimelineWorkerStateSourceRows)
        ? appState.calendarTimelineWorkerStateSourceRows
        : []
      : []
  const sourceBuckets = new Map()
  const ensureBucket = (key) => {
    if (!sourceBuckets.has(key)) {
      sourceBuckets.set(key, {
        hasStart: false,
        startMinutes: -1,
        latestStartTs: 0,
        latestStopTs: 0,
        explicitRunning: false,
      })
    }
    return sourceBuckets.get(key)
  }

  sourceRows.forEach((row) => {
    if (dashboardResolveDayKey(row) !== normalizedDayKey) {
      return
    }
    const keys = dashboardResolveTodayRowAliasKeys(row)
    if (!(keys instanceof Set) || !keys.size) {
      return
    }

    const startTs = calendarTimelineEventTimestamp(row?.startAt ?? row?.dayStartAt)
    const stopTs = calendarTimelineEventTimestamp(row?.endAt ?? row?.dayEndAt)
    const startMinutes = calendarTimelineSourceRowStartMinutes(row)
    const status = String(row?.status ?? '').trim().toUpperCase()

    keys.forEach((key) => {
      const bucket = ensureBucket(key)
      if (startTs > 0) {
        bucket.hasStart = true
        bucket.latestStartTs = Math.max(bucket.latestStartTs, startTs)
        if (startMinutes >= 0) {
          bucket.startMinutes =
            bucket.startMinutes >= 0 ? Math.min(bucket.startMinutes, startMinutes) : startMinutes
        }
      }
      if (stopTs > 0) {
        bucket.latestStopTs = Math.max(bucket.latestStopTs, stopTs)
      }
      if (startTs > 0 && !stopTs && (status === 'RUNNING' || status === 'OPEN' || Boolean(row?.isRunning))) {
        bucket.explicitRunning = true
      }
    })
  })

  sourceBuckets.forEach((bucket, key) => {
    upsertState(key, {
      hasStart: bucket.hasStart,
      isRunning: bucket.explicitRunning || (bucket.latestStartTs > 0 && bucket.latestStartTs > bucket.latestStopTs),
      startMinutes: bucket.startMinutes,
    })
  })

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
  if (!worker || worker.active === false || worker.isActive === false || worker.enabled === false) {
    return false
  }
  const status = normalizeSearchText(worker?.status ?? worker?.workerStatus ?? worker?.state)
  if (!status) {
    return true
  }
  return ['aktywny', 'active', '1', 'true', 'yes', 'tak'].includes(status)
}

function calendarTimelineResources() {
  const source = Array.isArray(appState.workers) && appState.workers.length ? appState.workers : appState.workerTimeRows
  const seen = new Set()
  const workers = (Array.isArray(source) ? source : [])
    .filter((worker) => calendarTimelineWorkerIsActive(worker))
    .map((worker) => {
      const rawName = String(worker.workerName ?? worker.fullName ?? worker.name ?? worker.login ?? worker.workerId ?? '').trim()
      const name = calendarTimelineWorkerName(rawName)
      const key = normalizeSearchText(worker.workerId || worker.login || rawName || name)
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
    .sort((first, second) => first.name.localeCompare(second.name, 'pl', { sensitivity: 'base' }))

  if (workers.length) {
    return [{ name: 'BUFOR', key: 'buffer', type: 'buffer' }, ...workers]
  }

  return [
    { name: 'BUFOR', key: 'buffer', type: 'buffer' },
    {
      name: appState.workersLoaded ? 'Brak pracowników' : 'Ładowanie pracowników...',
      key: 'workers-placeholder',
      type: 'placeholder',
    },
  ]
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
  return `
    <div
      class="fw-current-hour"
      style="grid-column:${slot + 1}; grid-row:2 / span ${resources.length + 1};"
      aria-label="Aktualna godzina ${pad2(now.getHours())}:${pad2(now.getMinutes())}"
    ></div>
  `
}

function calendarScheduleTimelineHourRefresh() {
  if (appState.calendarTimelineHourTimer) {
    window.clearTimeout(appState.calendarTimelineHourTimer)
    appState.calendarTimelineHourTimer = null
  }

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
    .filter((bar) => selectedTypes.has(bar.type || 'other'))
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
    if (!calendarTimelineRowAllowsOverlap(row, resources)) {
      rowItems.forEach((item) => {
        item.lane = 0
        item.laneCount = 1
      })
      rowLaneCounts.set(row, 1)
      return
    }

    const laneEnds = []
    rowItems
      .sort((left, right) => left.position.visibleStart - right.position.visibleStart || left.position.visibleEnd - right.position.visibleEnd)
      .forEach((item) => {
        const lane = laneEnds.findIndex((end) => end <= item.position.visibleStart)
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

function calendarTimelineDefaultDemoOrders() {
  return []
}

function ordersIsSeedDemoOrder(order = {}) {
  return /^fw-order-(?:[1-9]|1\d|2[0-3])$/.test(String(order?.id ?? '').trim())
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
  const resourceKeys = calendarTimelineWorkerAliasKeys(resource.worker)
  const rowKeys = dashboardResolveTodayRowAliasKeys(row)
  if (!(resourceKeys instanceof Set) || !(rowKeys instanceof Set) || !resourceKeys.size || !rowKeys.size) {
    return false
  }
  return [...resourceKeys].some((key) => rowKeys.has(key))
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
      const proximity = startTs > 0 ? Math.abs(startTs - planned.startTs) : Number.POSITIVE_INFINITY
      return {
        row,
        startTs,
        endTs,
        isRunning: startTs > 0 && !endTs && (status === 'RUNNING' || status === 'OPEN' || Boolean(row?.isRunning)),
        proximity,
      }
    })
    .filter((item) => item.startTs > 0 || item.endTs > 0)
    .sort((left, right) => left.proximity - right.proximity || left.startTs - right.startTs)

  if (!matches.length) {
    return { startTs: 0, endTs: 0, isRunning: false, source: '' }
  }

  const best = matches[0]
  return {
    startTs: best.startTs,
    endTs: best.endTs,
    isRunning: best.isRunning || (best.startTs > 0 && !best.endTs),
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
    return {
      key: `${kind}|${id}|${planned.startTs}`,
      kind,
      signal: 'UWAGA',
      title: 'Zlecenie nie wystartowało',
      text: `Zlecenie nie rozpoczęło się o planowanej godzinie ${planned.startLabel}.`,
      rows: [
        {
          person: title,
          meta: worker ? `Pracownik: ${worker}` : 'Pracownik: -',
          status: `Plan START: ${planned.startLabel}`,
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

function calendarTimelineHideEventsPopup() {
  if (calendarTimelineBarClickTimer) {
    window.clearTimeout(calendarTimelineBarClickTimer)
    calendarTimelineBarClickTimer = 0
  }
  calendarTimelineStopEventsPopupTracking()
  const node = document.getElementById('calendarTimelineEventsPopup')
  if (node) {
    node.remove()
  }
  appState.calendarTimelinePopupEventRows = []
}

function calendarTimelineScheduleEventsPopupPosition() {
  const node = document.getElementById('calendarTimelineEventsPopup')
  const anchor = calendarTimelineEventsPopupAnchor
  if (!node || !(anchor instanceof HTMLElement) || !document.body.contains(anchor)) {
    calendarTimelineHideEventsPopup()
    return
  }

  if (calendarTimelineEventsPopupRaf) {
    return
  }
  calendarTimelineEventsPopupRaf = window.requestAnimationFrame(() => {
    calendarTimelineEventsPopupRaf = 0
    const currentNode = document.getElementById('calendarTimelineEventsPopup')
    const currentAnchor = calendarTimelineEventsPopupAnchor
    if (!currentNode || !(currentAnchor instanceof HTMLElement) || !document.body.contains(currentAnchor)) {
      calendarTimelineHideEventsPopup()
      return
    }
    calendarTimelinePositionEventsPopup(currentNode, currentAnchor)
  })
}

function calendarTimelineStopEventsPopupTracking() {
  window.removeEventListener('scroll', calendarTimelineScheduleEventsPopupPosition, true)
  window.removeEventListener('resize', calendarTimelineScheduleEventsPopupPosition)
  if (calendarTimelineEventsPopupScrollParent instanceof HTMLElement) {
    calendarTimelineEventsPopupScrollParent.removeEventListener('scroll', calendarTimelineScheduleEventsPopupPosition)
  }
  if (calendarTimelineEventsPopupRaf) {
    window.cancelAnimationFrame(calendarTimelineEventsPopupRaf)
    calendarTimelineEventsPopupRaf = 0
  }
  calendarTimelineEventsPopupAnchor = null
  calendarTimelineEventsPopupScrollParent = null
}

function calendarTimelineStartEventsPopupTracking(anchor) {
  calendarTimelineStopEventsPopupTracking()
  if (!(anchor instanceof HTMLElement)) {
    return
  }
  calendarTimelineEventsPopupAnchor = anchor
  calendarTimelineEventsPopupScrollParent = anchor.closest('.fw-timeline-scroll')
  window.addEventListener('scroll', calendarTimelineScheduleEventsPopupPosition, true)
  window.addEventListener('resize', calendarTimelineScheduleEventsPopupPosition)
  if (calendarTimelineEventsPopupScrollParent instanceof HTMLElement) {
    calendarTimelineEventsPopupScrollParent.addEventListener('scroll', calendarTimelineScheduleEventsPopupPosition)
  }
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
  const result = startMarker ? [startMarker, ...sourceRows] : [...sourceRows]

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

async function calendarTimelineFetchWorkerDayEvents(resource = {}, dayKey = '') {
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
    const rows = (Array.isArray(response?.items) ? response.items : [])
      .filter((row) => calendarTimelineRealEventRowDay(row) === day)
      .sort((left, right) =>
        calendarTimelineEventTimestamp(left?.startAt ?? left?.dayStartAt ?? left?.endAt ?? left?.dayEndAt) -
        calendarTimelineEventTimestamp(right?.startAt ?? right?.dayStartAt ?? right?.endAt ?? right?.dayEndAt),
      )
    const matchedRows = rows.filter((row) => calendarTimelineResourceMatchesSourceRow(resource, row))
    if (matchedRows.length) {
      return calendarTimelineRowsWithDayStartMarker(matchedRows, day)
    }
    if (query.workerLogin || query.worker) {
      continue
    }
  }

  return []
}

function calendarTimelineEventIdentityValues(row = {}) {
  return [
    row?.eventId,
    row?.workdayId,
    row?.id,
    row?.startEventId,
    row?.endEventId,
  ]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
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
  const rangeEnd = Math.max(...items.map((item) => item.endTs))
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

function calendarTimelineEventsPieHtml(rows = []) {
  const graphData = calendarTimelineEventsGraphData(rows)
  if (!graphData) {
    return ''
  }

  const { zoneItems, inactiveItems, totalSeconds } = graphData
  const segmentsByKey = new Map()
  const addSegment = (key, label, seconds, color) => {
    const normalizedKey = String(key ?? '').trim()
    const normalizedLabel = String(label ?? '').trim()
    const duration = Number(seconds)
    if (!normalizedKey || !normalizedLabel || !Number.isFinite(duration) || duration <= 0) {
      return
    }
    const current = segmentsByKey.get(normalizedKey) || {
      label: normalizedLabel,
      seconds: 0,
      color,
    }
    current.seconds += duration
    current.color = current.color || color
    segmentsByKey.set(normalizedKey, current)
  }

  zoneItems.forEach((item) => {
    const label = calendarTimelineGraphZoneLabel(item.row)
    const duration = Math.max(0, Math.floor((item.endTs - item.startTs) / 1000))
    addSegment(`zone:${normalizeSearchText(label) || label.toLowerCase()}`, label, duration, calendarTimelineGraphColorForKey(label).bg)
  })

  inactiveItems.forEach((item) => {
    const duration = Math.max(0, Math.floor((item.endTs - item.startTs) / 1000))
    addSegment('inactive', 'Brak aktywności', duration, '#cbd5e1')
  })

  const segments = Array.from(segmentsByKey.values())
    .filter((segment) => segment.seconds > 0)
    .sort((left, right) => {
      if (left.label === 'Brak aktywności') return 1
      if (right.label === 'Brak aktywności') return -1
      return right.seconds - left.seconds
    })

  if (!segments.length) {
    return ''
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
      <li tabindex="0" data-calendar-pie-highlight="${escapeHtml(highlightGradient)}">
        <span class="calendar-events-pie-dot" style="--pie-dot:${escapeHtml(segment.color)};"></span>
        <span class="calendar-events-pie-name">${escapeHtml(segment.label)}</span>
        <strong>${escapeHtml(calendarTimelinePiePercentLabel(percent))}</strong>
        <em>${escapeHtml(duration)}</em>
      </li>
    `
  }).join('')

  return `
    <aside class="calendar-events-popup-summary" aria-label="Udział stref i braku aktywności">
      <div class="calendar-events-pie-wrap">
        <div class="calendar-events-pie" data-calendar-pie-chart style="--pie:${escapeHtml(gradientParts.join(', '))};">
          <span><strong>100%</strong><em>Dzień</em></span>
        </div>
      </div>
      <ul class="calendar-events-pie-legend">${legendHtml}</ul>
    </aside>
  `
}

function calendarTimelinePositionEventsPopup(node, anchor) {
  if (!(node instanceof HTMLElement) || !(anchor instanceof HTMLElement)) {
    return
  }
  const rect = anchor.getBoundingClientRect()
  const width = Math.min(760, Math.max(420, window.innerWidth - 24))
  node.style.width = `${width}px`
  const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left))
  const measuredHeight = node.getBoundingClientRect().height || node.scrollHeight || 180
  const popupHeight = Math.min(Math.max(180, measuredHeight), Math.max(180, window.innerHeight - 24))
  const maxTop = Math.max(12, window.innerHeight - popupHeight - 12)
  const top = Math.max(12, Math.min(maxTop, rect.bottom + 8))
  node.style.left = `${left}px`
  node.style.top = `${top}px`
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

  calendarTimelineHideEventsPopup()
  const node = document.createElement('div')
  node.id = 'calendarTimelineEventsPopup'
  node.className = 'calendar-events-popup'
  node.setAttribute('role', 'dialog')
  node.setAttribute('aria-label', 'Zdarzenia pracownika w dniu')
  document.body.appendChild(node)
  calendarTimelineRenderEventsPopup(node, context, [], { loading: true })
  calendarTimelineStartEventsPopupTracking(context.bar)
  calendarTimelinePositionEventsPopup(node, context.bar)

  node.addEventListener('click', (event) => {
    const closeButton = event.target?.closest?.('[data-calendar-events-popup-close]')
    if (closeButton) {
      calendarTimelineHideEventsPopup()
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
      const row = Array.isArray(appState.calendarTimelinePopupEventRows) ? appState.calendarTimelinePopupEventRows[index] : null
      if (row) {
        calendarTimelineHideEventsPopup()
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

  try {
    const rows = await calendarTimelineFetchWorkerDayEvents(context.resource, context.dateYmd)
    if (!document.body.contains(node)) {
      return
    }
    appState.calendarTimelinePopupEventRows = rows
    calendarTimelineRenderEventsPopup(node, context, rows)
    calendarTimelinePositionEventsPopup(node, context.bar)
  } catch (error) {
    if (!document.body.contains(node)) {
      return
    }
    const message = error instanceof Error ? error.message : 'Nie udało się pobrać zdarzeń.'
    calendarTimelineRenderEventsPopup(node, context, [], { error: message })
    calendarTimelinePositionEventsPopup(node, context.bar)
  }
}

async function calendarTimelineOpenRealEventEditorFromBar(bar) {
  const context = calendarTimelineBarContextFromElement(bar)
  if (!context) {
    showTransientNotice('Nie znaleziono pracownika dla tego zdarzenia.', 'error')
    return
  }
  try {
    const rows = await calendarTimelineFetchWorkerDayEvents(context.resource, context.dateYmd)
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
  const row = Number(order?.row)
  const resource = Number.isInteger(row) ? resources[row] ?? null : null
  const planned = calendarTimelineOrderPlannedBounds(order)
  if (!planned) {
    return { kind: 'planned', label: 'Zaplanowane', alert: null }
  }

  const actual = calendarTimelineOrderActualState(order, resource, planned)
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
  if (!completed && now > planned.startTs) {
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
  if (appState.currentRoute !== 'calendar' || document.visibilityState !== 'visible') {
    calendarTimelineHideStatusAlert()
    return
  }
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
    calendarTimelineHideStatusAlert()
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
  return (
    calendarTimelineDropInfoFromTarget(event ? calendarTimelineDropTargetFromEvent(event) : null) ||
    calendarTimelineHighlightedDropInfo() ||
    calendarTimelineDropInfoFromState()
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
  appState.calendarTimelineDragSourceRow = null
  appState.calendarTimelineDragTargetRow = null
  appState.calendarTimelineDragTargetSlot = null
  appState.calendarTimelineDropHandled = false
  appState.calendarTimelineDragResources = []
  appState.calendarTimelineDragConflictKey = ''
  appState.calendarTimelineDragConflictValue = false
}

function calendarTimelineHandleMoveResult(moveResult) {
  if (moveResult?.moved) {
    showTransientNotice('Zlecenie przypięte do nowego miejsca.', 'success')
    return
  }
  if (moveResult?.conflicts?.length) {
    calendarTimelineShowConflictDialog(moveResult.conflicts, moveResult.candidate)
    return
  }
  showTransientNotice('Nie można przenieść zlecenia.', 'error')
}

function calendarTimelineBuildMovedOrder(order = {}, rowIndex, slotIndex = null, sourceRowIndex = null, resources = calendarTimelineResources()) {
  const nextRow = Number(rowIndex)
  if (!Number.isInteger(nextRow) || nextRow < 0) {
    return null
  }
  const assignedRows = calendarTimelineOrderRowsAfterMove(order, nextRow, sourceRowIndex, resources)
  if (!assignedRows.length) {
    return null
  }
  const cursor = appState.calendarCursorDay || todayYmd()
  const days = Array.from({ length: 3 }, (_, index) => calendarAddDays(cursor, index))
  const hours = Array.from({ length: 20 }, (_, index) => index + 4)
  const slotTarget = slotIndex == null ? null : calendarTimelineSlotToDayTime(slotIndex, days, hours)
  let nextOrder = { ...order, row: assignedRows[0], assignedRows, workerAssignments: ordersWorkerAssignmentsFromRows(assignedRows, resources) }

  if (slotTarget) {
    const duration = calendarTimelineSnapDurationMinutes(calendarTimelineOrderDurationMinutes(order))
    const startMinutes = calendarTimelineTimeMinutes(slotTarget.time, 4 * 60)
    const totalEndMinutes = startMinutes + duration
    const endDayOffset = Math.floor(totalEndMinutes / 1440)
    const endMinutes = totalEndMinutes % 1440
    const endDateYmd = calendarAddDays(slotTarget.dayKey, endDayOffset)
    nextOrder = {
      ...nextOrder,
      dateYmd: slotTarget.dayKey,
      startTime: calendarMinutesToTime(startMinutes) || slotTarget.time,
      endDateYmd,
      endTime: calendarMinutesToTime(endMinutes) || '23:59',
    }
  }

  return nextOrder
}

function calendarTimelineFindOrderConflicts(candidate = {}, orders = [], resources = calendarTimelineResources()) {
  const candidateInterval = calendarTimelineOrderInterval(candidate)
  if (!candidateInterval) {
    return []
  }
  const candidateRows = new Set(
    ordersNormalizeOrderRows(candidate, resources).filter((row) => !calendarTimelineRowAllowsOverlap(row, resources)),
  )
  if (!candidateRows.size) {
    return []
  }
  const conflicts = []

  orders.forEach((order) => {
    if (!order || order.id === candidate.id) {
      return
    }
    const interval = calendarTimelineOrderInterval(order)
    if (!interval || !(candidateInterval.start < interval.end && interval.start < candidateInterval.end)) {
      return
    }
    ordersNormalizeOrderRows(order, resources).forEach((row) => {
      if (!candidateRows.has(row) || calendarTimelineRowAllowsOverlap(row, resources)) {
        return
      }
      const key = `${String(order.id ?? '')}::${row}`
      if (conflicts.some((item) => item.key === key)) {
        return
      }
      conflicts.push({
        key,
        row,
        workerName: String(resources[row]?.name ?? `Wiersz ${row + 1}`).trim(),
        order,
        title: calendarTimelineOrderTitle(order),
        time: calendarTimelineOrderRangeLabel(order),
      })
    })
  })

  return conflicts
}

function calendarTimelineFindOrderConflict(candidate = {}, orders = []) {
  return calendarTimelineFindOrderConflicts(candidate, orders)[0]?.order ?? null
}

function calendarTimelineMoveWouldConflict(
  orderId,
  rowIndex,
  slotIndex = null,
  sourceRowIndex = null,
  resources = calendarTimelineResources(),
  orders = ordersListSourceOrders(),
) {
  const id = String(orderId ?? '').trim()
  const currentOrder = orders.find((order) => order.id === id)
  const candidate = currentOrder ? calendarTimelineBuildMovedOrder(currentOrder, rowIndex, slotIndex, sourceRowIndex, resources) : null
  return Boolean(candidate && calendarTimelineFindOrderConflicts(candidate, orders, resources).length)
}

function calendarTimelineDragConflict(orderId, rowIndex, slotIndex = null, sourceRowIndex = null) {
  const resources = Array.isArray(appState.calendarTimelineDragResources) && appState.calendarTimelineDragResources.length
    ? appState.calendarTimelineDragResources
    : calendarTimelineResources()
  const key = [
    String(orderId ?? '').trim(),
    Number(rowIndex),
    slotIndex == null ? '' : Number(slotIndex),
    sourceRowIndex == null ? '' : Number(sourceRowIndex),
  ].join('|')
  if (key && key === appState.calendarTimelineDragConflictKey) {
    return Boolean(appState.calendarTimelineDragConflictValue)
  }

  const hasConflict = calendarTimelineMoveWouldConflict(orderId, rowIndex, slotIndex, sourceRowIndex, resources)
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

function calendarTimelineMoveOrder(orderId, rowIndex, slotIndex = null, sourceRowIndex = null, resources = calendarTimelineResources()) {
  const id = String(orderId ?? '').trim()
  const nextRow = Number(rowIndex)
  if (!id || !Number.isInteger(nextRow) || nextRow < 0) {
    return { moved: false, conflicts: [], candidate: null }
  }
  const orders = ordersListSourceOrders()
  const currentOrder = orders.find((order) => order.id === id)
  const nextOrder = currentOrder ? calendarTimelineBuildMovedOrder(currentOrder, nextRow, slotIndex, sourceRowIndex, resources) : null
  if (!nextOrder) {
    return { moved: false, conflicts: [], candidate: null }
  }
  const conflicts = calendarTimelineFindOrderConflicts(nextOrder, orders, resources)
  if (conflicts.length) {
    return { moved: false, conflicts, candidate: nextOrder }
  }
  appState.calendarTimelineDemoOrders = orders.map((order) => (order.id === id ? nextOrder : order))
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
        <h2 id="calendarConflictTitle">Nie można przenieść zlecenia</h2>
        <p>
          Zlecenie <strong>${escapeHtml(title)}</strong>${time ? ` na ${escapeHtml(time)}` : ''}
          nakłada się na inne zlecenie u jednej lub kilku przypisanych osób.
        </p>
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

function calendarTimelineClearDropTargets() {
  document
    .querySelectorAll('#view-calendar .is-timeline-drop-target, #view-calendar .is-timeline-drop-invalid')
    .forEach((node) => node.classList.remove('is-timeline-drop-target', 'is-timeline-drop-invalid'))
}

function calendarTimelineVisualOrders(orders = [], resources = calendarTimelineResources()) {
  return orders.flatMap((order) =>
    ordersNormalizeOrderRows(order, resources).map((row) => ({
      ...order,
      row,
    })),
  )
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

  const endReason = String(row?.endReason ?? '').trim().toUpperCase()
  const status = String(row?.status ?? '').trim().toUpperCase()
  if (endReason === 'WORKDAY_STOP' || endReason === 'STOP_END_DAY' || status === 'WORKDAY_CLOSED') {
    return false
  }

  const typeLabel = eventTypeInfo(row).label
  if (typeLabel === 'QR STOP') {
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
  const client = String(dashboardResolveClientLabel(row) || '').trim()
  const zone = String(dashboardResolveZoneLabel(row) || '').trim()
  const qr = String(zoneQrCodeFromRow(row) || '').trim()
  const prefix = track === 'client' ? 'Klient/spec.' : track === 'zone' ? 'Strefa' : 'START-STOP'
  const parts = [client, zone]
    .map((value) => String(value ?? '').trim())
    .filter((value, index, list) => value && value !== '-' && list.indexOf(value) === index)
  if (parts.length) {
    return `${prefix}: ${parts.join(' / ')}`
  }
  return qr ? `${prefix}: QR ${qr}` : prefix
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

  const client = calendarTimelineReadableClientLabel(dashboardResolveClientLabel(row))
  const qr = String(row?.dayStartObject ?? row?.startObject ?? zoneQrCodeFromRow(row) ?? '').trim()
  if (client) {
    return client
  }
  return qr && qr !== '-' ? `QR ${qr}` : 'QR START'
}

function calendarTimelineRealEventRowDay(row = {}) {
  const iso = toIso(row?.startAt ?? row?.dayStartAt ?? row?.endAt ?? row?.dayEndAt)
  return iso ? calendarDateToYmd(iso) : ''
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

    const startTs = calendarTimelineEventTimestamp(row?.startAt ?? row?.dayStartAt)
    const endTs = calendarTimelineEventTimestamp(row?.endAt ?? row?.dayEndAt)
    if (!startTs && !endTs) {
      return
    }

    const key = `${rowIndex}|${dayKey}`
    if (!buckets.has(key)) {
      buckets.set(key, {
        dayKey,
        rowIndex,
        firstStartTs: 0,
        latestEndTs: 0,
        hasRunning: false,
        startObjectLabel: '',
        sourceEventId: '',
        workdayId: '',
        sourceStartAt: '',
      })
    }
    const bucket = buckets.get(key)
    if (startTs > 0) {
      if (!bucket.firstStartTs || startTs < bucket.firstStartTs) {
        bucket.firstStartTs = startTs
        bucket.startObjectLabel = calendarTimelineRealStartObjectLabel(row)
        bucket.sourceEventId = String(row?.eventId ?? '').trim()
        bucket.workdayId = String(row?.workdayId ?? row?.id ?? '').trim()
        bucket.sourceStartAt = toIso(row?.startAt ?? row?.dayStartAt)
      }
    }
    if (endTs > 0) {
      bucket.latestEndTs = Math.max(bucket.latestEndTs, endTs)
    }
    const status = normalizeEventStatus(row?.status, Boolean(row?.endAt ?? row?.dayEndAt))
    if (startTs > 0 && !endTs && status === 'RUNNING') {
      bucket.hasRunning = true
    }
  })

  return [...buckets.values()]
    .map((bucket) => {
      const startTs = bucket.firstStartTs || bucket.latestEndTs
      if (!startTs) {
        return null
      }
      const now = Date.now()
      const endTs =
        bucket.latestEndTs ||
        (bucket.hasRunning && bucket.dayKey === todayYmd() ? Math.max(now, startTs + 15 * 60 * 1000) : startTs + 60 * 60 * 1000)
      const startIso = new Date(startTs).toISOString()
      const endIso = new Date(Math.max(endTs, startTs + 15 * 60 * 1000)).toISOString()
      const start = calendarTimelineIsoToDayTime(startIso)
      const end = calendarTimelineIsoToDayTime(endIso)
      if (!start || !end) {
        return null
      }
      const durationLabel = calendarTimelineRealDurationLabel(start.timestamp, end.timestamp)
      const titleParts = [bucket.startObjectLabel || 'QR START', durationLabel]
      const title = titleParts.join(' · ')
      return {
        id: `real-workday-${bucket.rowIndex}-${bucket.dayKey}`,
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
        clientLabel: '',
        addressLabel: '',
        type: 'other',
        tone: 'steel',
        actualStartAt: startIso,
        sourceStartAt: bucket.sourceStartAt || startIso,
        actualEndAt: bucket.latestEndTs ? endIso : '',
        status: bucket.latestEndTs ? 'CLOSED' : 'RUNNING',
        completed: Boolean(bucket.latestEndTs),
        isRealEvent: true,
        realTrack: 'workday',
        realTrackIndex: 0,
      }
    })
    .filter(Boolean)
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

function calendarTimelineRealStatusOrders(resources = [], days = [], existingOrders = []) {
  const existingKeys = new Set(
    (Array.isArray(existingOrders) ? existingOrders : [])
      .filter((order) => order?.realTrack === 'workday')
      .map((order) => `${Number(order?.row)}|${String(order?.dateYmd ?? '').trim()}`),
  )

  return calendarTimelineStatusRowsForRealOrders(days)
    .map(({ row, dayKey }, index) => {
      const startMinutes = dashboardScheduleTimeToMinutes(row?.qrStart)
      if (!Number.isFinite(startMinutes) || startMinutes < 0) {
        return null
      }

      const rowIndex = calendarTimelineRowForRealEvent(row, resources)
      if (rowIndex < 0) {
        return null
      }

      const key = `${rowIndex}|${dayKey}`
      if (existingKeys.has(key)) {
        return null
      }

      const startTs = calendarTimelineTimestampFromDayMinutes(dayKey, startMinutes)
      if (!startTs) {
        return null
      }

      const stopMinutes = dashboardScheduleTimeToMinutes(row?.qrStop)
      const durationSec = calendarTimelineStatusDurationSeconds(row)
      const now = Date.now()
      let endTs = 0
      if (Number.isFinite(stopMinutes) && stopMinutes >= 0) {
        endTs = calendarTimelineTimestampFromDayMinutes(dayKey, stopMinutes)
        if (endTs <= startTs) {
          endTs = calendarTimelineTimestampFromDayMinutes(calendarAddDays(dayKey, 1), stopMinutes)
        }
      } else if (row?.isRunning) {
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
      const titleLabel =
        calendarTimelineReadableClientLabel(dashboardResolveClientLabel(row)) ||
        calendarTimelineRealStartObjectLabel(row) ||
        'QR START'

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
        clientLabel: dashboardResolveClientLabel(row),
        addressLabel: String(row?.activeLocation ?? row?.lokalizacja ?? row?.location ?? '').trim(),
        type: 'other',
        tone: 'steel',
        actualStartAt: startIso,
        sourceStartAt: startIso,
        actualEndAt: row?.isRunning ? '' : endIso,
        status: row?.isRunning ? 'RUNNING' : 'CLOSED',
        completed: !row?.isRunning,
        isRealEvent: true,
        realTrack: 'workday',
        realTrackIndex: 0,
      }
    })
    .filter(Boolean)
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
  return [...workdayOrders, ...statusFallbackOrders, ...eventOrders]
}

function calendarTimelinePrototypeHtml() {
  const cursor = appState.calendarCursorDay || todayYmd()
  const days = Array.from({ length: 3 }, (_, index) => calendarAddDays(cursor, index))
  const hours = Array.from({ length: 20 }, (_, index) => index + 4)
  const slotsPerHour = CALENDAR_TIMELINE_SLOTS_PER_HOUR
  const slotsPerDay = hours.length * slotsPerHour
  const totalSlots = days.length * slotsPerDay
  const resources = calendarTimelineResources()
  const plannedOrders = ordersListSourceOrders()
  const realEventOrders = calendarTimelineRealEventOrders(resources, days, plannedOrders)
  const bars = calendarTimelineVisualOrders([...plannedOrders, ...realEventOrders], resources)
  const selectedTypes = calendarTimelineSelectedTypes()
  const layout = calendarTimelineLayoutEventBars(bars, days, hours, resources, selectedTypes)
  const realTrackCounts = new Map()
  realEventOrders.forEach((order) => {
    const row = Number(order?.row)
    const trackIndex = Number(order?.realTrackIndex ?? 0)
    if (!Number.isInteger(row) || row < 0 || !Number.isFinite(trackIndex)) {
      return
    }
    realTrackCounts.set(row, Math.max(Number(realTrackCounts.get(row) ?? 0), Math.floor(trackIndex) + 1))
  })
  const plannedLaneCounts = new Map()
  layout.items.forEach((item) => {
    if (item?.bar?.isRealEvent) {
      return
    }
    const row = Number(item?.bar?.row)
    if (!Number.isInteger(row) || row < 0) {
      return
    }
    const laneCount = Number(item?.laneCount || 1)
    plannedLaneCounts.set(row, Math.max(Number(plannedLaneCounts.get(row) || 0), laneCount))
  })
  const rowHeights = resources
    .map((_, rowIndex) => {
      const laneCount = Number(plannedLaneCounts.get(rowIndex) || 0)
      const trackCount = Number(realTrackCounts.get(rowIndex) || 0)
      return `${Math.max(38, 8 + Math.max(1, trackCount, laneCount) * 24)}px`
    })
    .join(' ')
  const dayHeaders = days
    .map((day, index) => {
      const label = calendarTimelineDayMonthLabel(day)
      return `<div class="fw-date-head${index % 2 ? ' fw-date-head--alt' : ''}" style="grid-column:${index * slotsPerDay + 2} / span ${slotsPerDay}; grid-row:1;">${escapeHtml(label)}</div>`
    })
    .join('')
  const hourHeaders = days
    .flatMap((day, dayIndex) =>
      hours.map((hour, hourIndex) => {
        const slot = dayIndex * slotsPerDay + hourIndex * slotsPerHour + 1
        const classes = ['fw-hour-head']
        if (hourIndex === 0) classes.push('fw-hour-head--day-start')
        if (dayIndex % 2) classes.push('fw-hour-head--alt')
        return `<div class="${classes.join(' ')}" style="grid-column:${slot + 1} / span ${slotsPerHour}; grid-row:2;">${pad2(hour)}:00</div>`
      }),
    )
    .join('')
  const rowLabels = resources
    .map((resource, index) => {
      const muted = resource.type === 'buffer' ? ' is-buffer' : resource.type === 'placeholder' ? ' is-placeholder' : ''
      const workerClass = resource.type === 'worker' ? ' is-worker' : ''
      const started = resource.type === 'worker' && resource.started ? ' is-started' : ''
      return `
        <div class="fw-resource-name${muted}${workerClass}${started}" style="grid-row:${index + 3};" data-calendar-timeline-row="${index}">
          <span>${escapeHtml(resource.name)}</span>
          ${resource.type === 'worker' ? '<i aria-hidden="true"></i>' : ''}
        </div>
      `
    })
    .join('')
  const cells = resources
    .flatMap((_, rowIndex) =>
      Array.from({ length: totalSlots }, (_, slotIndex) => {
        const dayIndex = Math.floor(slotIndex / slotsPerDay)
        const slotInDay = slotIndex % slotsPerDay
        const quarterIndex = slotInDay % slotsPerHour
        const classes = ['fw-grid-cell']
        if (quarterIndex === 0) classes.push('fw-grid-cell--hour-start')
        if (slotInDay === 0) classes.push('fw-grid-cell--day-start')
        if (dayIndex % 2) classes.push('fw-grid-cell--alt')
        return `<div class="${classes.join(' ')}" style="grid-column:${slotIndex + 2}; grid-row:${rowIndex + 3};" data-calendar-timeline-row="${rowIndex}" data-calendar-timeline-slot="${slotIndex}"></div>`
      }),
    )
    .join('')
  const statusAlerts = []
  const eventBars = layout.items
    .map((item) => {
      const { bar, position, lane, laneCount } = item
      const timeLabel = `${bar.dateYmd} ${bar.startTime} - ${bar.endDateYmd || bar.dateYmd} ${bar.endTime}`
      const status = calendarTimelineOrderStatus(bar, resources)
      if (status.alert) {
        statusAlerts.push(status.alert)
      }
      const realTrackIndex = Number(bar.realTrackIndex ?? 0)
      const realTrackCount = Number(realTrackCounts.get(bar.row) || 0)
      const plannedOffsetBase = 7
      const stackStyle = bar.isRealEvent
        ? `--fw-bar-height:20px;--fw-bar-offset:${4 + Math.max(0, Math.floor(realTrackIndex)) * 24}px;--fw-bar-z:${8 + Math.max(0, Math.floor(realTrackIndex))};`
        : laneCount > 1
          ? `--fw-bar-height:20px;--fw-bar-offset:${plannedOffsetBase + lane * 22}px;--fw-bar-z:${10 + realTrackCount + lane};`
          : `--fw-bar-height:24px;--fw-bar-offset:${plannedOffsetBase}px;--fw-bar-z:${4 + realTrackCount};`
      const titleLabel = status?.label ? `${timeLabel} · ${status.label}` : timeLabel
      const realEventAttr = bar.isRealEvent ? ' data-calendar-timeline-real-event="1"' : ''
      const draggableAttr = bar.isRealEvent ? 'false' : 'true'
      const realTrackClass = bar.isRealEvent ? ` fw-event-real--${escapeHtml(bar.realTrack || 'event')}` : ''
      const sourceEventId = String(bar.sourceEventId ?? '').trim()
      const workdayId = String(bar.workdayId ?? '').trim()
      const sourceStartAt = toIso(bar.sourceStartAt ?? bar.actualStartAt ?? '')
      const barMetaAttrs = [
        `data-calendar-timeline-date="${escapeHtml(bar.dateYmd || '')}"`,
        `data-calendar-timeline-start="${escapeHtml(bar.startTime || '')}"`,
        sourceEventId ? `data-calendar-timeline-source-event-id="${escapeHtml(sourceEventId)}"` : '',
        workdayId ? `data-calendar-timeline-workday-id="${escapeHtml(workdayId)}"` : '',
        sourceStartAt ? `data-calendar-timeline-source-start="${escapeHtml(sourceStartAt)}"` : '',
      ].filter(Boolean).join(' ')
      return `
        <button class="fw-event-bar fw-event-bar--${escapeHtml(bar.tone)} fw-event-status--${escapeHtml(status.kind)}${bar.completed ? ' is-completed' : ''}${laneCount > 1 ? ' is-stacked' : ''}${bar.isRealEvent ? ' is-real-event' : ''}${realTrackClass}" style="grid-column:${position.startColumn} / span ${position.span}; grid-row:${bar.row + 3};${stackStyle}" type="button" title="${escapeHtml(titleLabel)}" draggable="${draggableAttr}" data-calendar-timeline-order-id="${escapeHtml(bar.id)}" data-calendar-timeline-row="${bar.row}" ${barMetaAttrs}${realEventAttr}>
          <span class="fw-event-mark" aria-hidden="true">&#9670;</span>
          <span class="fw-event-title">${escapeHtml(bar.title)}</span>
          ${laneCount > 1 ? `<strong class="fw-event-stack-badge">${lane + 1}/${laneCount}</strong>` : ''}
        </button>
      `
    })
    .join('')
  const currentHour = calendarTimelineCurrentHourHtml(days, hours, resources)
  appState.calendarTimelineStatusAlerts = calendarTimelineUniqueStatusAlerts(statusAlerts)

  return `
    <div class="fw-timeline-scroll">
      <div class="fw-timeline-grid" style="--slot-count:${totalSlots}; --row-count:${resources.length}; grid-template-rows:30px 28px ${rowHeights};">
        <div class="fw-resource-head" aria-hidden="true"></div>
        ${dayHeaders}
        ${hourHeaders}
        ${rowLabels}
        ${cells}
        ${currentHour}
        ${eventBars}
      </div>
    </div>
  `
}

function renderCalendarTimelinePrototype() {
  const stage = document.getElementById('calendarPrototypeTimeline')
  if (!stage) {
    return
  }
  calendarStartTimelineWorkerStatusRefresh()
  void calendarEnsureTimelineWorkerState().catch(() => {})
  calendarUpdateRangeLabel()
  calendarTimelineHideEventsPopup()
  const mode = appState.calendarViewMode || 'week'
  document.querySelectorAll('#view-calendar [data-calendar-view]').forEach((button) => {
    button.classList.toggle('is-active', button.getAttribute('data-calendar-view') === mode)
  })
  const slideDirection = Number(appState.calendarTimelineSlideDirection || 0)
  stage.classList.remove('is-slide-next', 'is-slide-prev')
  stage.innerHTML = calendarTimelinePrototypeHtml()
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
  calendarScheduleTimelineHourRefresh()
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

  const start = calendarStartOfWeek(appState.calendarCursorDay)
  const days = Array.from({ length: 7 }, (_, index) => calendarAddDays(start, index))
  board.className = 'calendar-board calendar-board--week'
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
    const completed = task ? kanbanTaskIsCompleted(task) : false
    completeButton.disabled = !task
    completeButton.classList.toggle('is-completed', completed)
    completeButton.innerHTML = `<span aria-hidden="true">&#10003;</span>${completed ? 'Cofnij uko&#324;czenie' : 'Oznacz jako uko&#324;czone'}`
  }
  const sessionName = String(appState.session?.name || appState.session?.login || appState.session?.email || 'Użytkownik').trim()
  const initials = kanbanInitials(sessionName)
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
    kanbanStatus: kanbanDefaultStatusForTask(workers, preferredKanbanStatus),
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
  calendarSaveTasks(appState.calendarTasks.filter((task) => task.id !== id))
  calendarDeleteRemoteTasksById([id])
  calendarCloseEditor()
  renderCalendarView()
  renderDashboardKanbanTasks()
  if (appState.currentRoute === 'kanban') {
    renderKanbanView()
  }
}

function calendarToggleEditorTaskCompleted() {
  const id = String(appState.calendarEditorTaskId ?? '').trim()
  const task = appState.calendarTasks.find((item) => item.id === id)
  if (!task) {
    showTransientNotice('Najpierw zapisz zadanie, potem możesz oznaczyć je jako ukończone.', 'info')
    return
  }
  const completed = !kanbanTaskIsCompleted(task)
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

function calendarMoveCursor(direction) {
  const dir = direction < 0 ? -1 : 1
  const mode = appState.calendarViewMode
  if (document.getElementById('calendarTimelinePrototype')) {
    appState.calendarTimelineSlideDirection = dir
    appState.calendarCursorDay = calendarAddDays(appState.calendarCursorDay || todayYmd(), dir)
    renderCalendarView()
    void calendarEnsureTimelineWorkerState({ force: true }).catch(() => {})
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

function kanbanEnsureState() {
  appState.kanbanColumns = kanbanLoadColumns()
  appState.calendarTasks = calendarLoadTasks()
  appState.kanbanSearch = String(appState.kanbanSearch ?? '').trim()
}

function kanbanTaskSearchText(task = {}) {
  const people = calendarSelectionLabels(task.workers).join(' ')
  const objects = calendarSelectionLabels(task.objects).join(' ')
  const zone = String(task.zone?.label ?? task.zoneName ?? '').trim()
  const zoneLocation = String(task.zone?.location ?? task.zoneLocation ?? '').trim()
  return normalizeSearchText([task.title, task.notes, task.place, people, objects, zone, zoneLocation].filter(Boolean).join(' '))
}

function kanbanVisibleTasks() {
  kanbanEnsureState()
  const query = normalizeSearchText(appState.kanbanSearch)
  const activeTasks = appState.calendarTasks.filter((task) => !kanbanTaskIsCompleted(task))
  const tasks = query ? activeTasks.filter((task) => kanbanTaskSearchText(task).includes(query)) : activeTasks
  return calendarSortTasks(tasks)
}

function kanbanNewColumnId() {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function kanbanColorOptionsHtml(selectedColor = '') {
  const selected = kanbanColumnColorMeta(selectedColor).value
  return KANBAN_COLUMN_COLORS.map(
    (color) => `<option value="${escapeHtml(color.value)}"${color.value === selected ? ' selected' : ''}>${escapeHtml(color.label)}</option>`,
  ).join('')
}

function kanbanSyncScopeChoiceState() {
  const scopeSelect = document.getElementById('kanbanColumnScope')
  const scope = kanbanVisibleColumnScope(scopeSelect?.value)
  document.querySelectorAll('input[name="kanbanColumnScopeChoice"]').forEach((input) => {
    if (input instanceof HTMLInputElement) {
      input.checked = input.value === scope
    }
  })
}

function kanbanSyncColumnScopeFields({ clearOwner = false } = {}) {
  const scopeSelect = document.getElementById('kanbanColumnScope')
  const ownerWrap = document.getElementById('kanbanColumnOwnerWrap')
  const ownerLabel = document.getElementById('kanbanColumnOwnerLabel')
  const ownerInput = document.getElementById('kanbanColumnOwner')
  const ownerOptions = document.getElementById('kanbanColumnOwnerOptions')
  const scope = kanbanNormalizeColumnScope(scopeSelect?.value)
  const meta = kanbanColumnScopeMeta(scope)

  if (ownerOptions) {
    ownerOptions.innerHTML = kanbanColumnOwnerOptionsHtml(scope)
  }
  if (ownerLabel) {
    ownerLabel.textContent = meta.targetLabel || 'Przypisanie'
  }
  if (ownerInput && clearOwner) {
    ownerInput.value = ''
  }
  if (ownerInput) {
    ownerInput.placeholder =
      scope === 'object'
        ? 'Wpisz lub wybierz obiekt...'
        : scope === 'person'
          ? 'Wpisz lub wybierz osobę...'
          : 'Wpisz lub wybierz użytkownika...'
  }
  if (ownerWrap) {
    ownerWrap.hidden = scope === 'global'
  }
  kanbanSyncScopeChoiceState()
}

function kanbanColumnScopeBadgeHtml(column = {}) {
  const scope = kanbanNormalizeColumnScope(column.scope)
  if (scope === 'global') {
    return ''
  }
  const meta = kanbanColumnScopeMeta(scope)
  const owner = String(column.ownerLabel ?? '').trim()
  const label =
    scope === 'user'
      ? 'Użytkownik'
      : scope === 'person'
        ? 'Inny projekt'
        : scope === 'object'
          ? 'Obiekt'
        : meta.label
  return `<span class="kanban-column-scope">${escapeHtml(label)}${owner ? `: ${escapeHtml(owner)}` : ''}</span>`
}

function kanbanColumnTaskCount(columnId = '') {
  const id = String(columnId ?? '').trim()
  if (!id) {
    return 0
  }
  return calendarLoadTasks().filter((task) => String(task.kanbanStatus ?? '') === id).length
}

function kanbanOpenColumnEditor(columnId = '') {
  kanbanEnsureState()
  const id = String(columnId ?? '').trim()
  const column = id ? appState.kanbanColumns.find((item) => item.id === id) : null
  appState.kanbanColumnEditorMode = column ? 'edit' : 'add'
  appState.kanbanColumnEditorId = column?.id || ''
  appState.kanbanColumnDeleteConfirm = false

  const overlay = document.getElementById('kanbanColumnOverlay')
  const title = document.getElementById('kanbanColumnModalTitle')
  const nameInput = document.getElementById('kanbanColumnName')
  const colorSelect = document.getElementById('kanbanColumnColor')
  const scopeSelect = document.getElementById('kanbanColumnScope')
  const ownerInput = document.getElementById('kanbanColumnOwner')
  const deleteButton = document.getElementById('kanbanColumnDeleteBtn')
  const deleteInfo = document.getElementById('kanbanColumnDeleteInfo')
  const saveButton = document.getElementById('kanbanColumnSaveBtn')
  if (!overlay || !nameInput || !colorSelect || !scopeSelect || !ownerInput) {
    return
  }

  if (title) title.textContent = column ? 'Edytuj kolumnę' : 'Nowa kolumna'
  nameInput.value = column?.label || ''
  colorSelect.innerHTML = kanbanColorOptionsHtml(column?.color || 'blue')
  scopeSelect.innerHTML = kanbanColumnScopeOptionsHtml(column?.scope || 'global')
  const normalizedScope = kanbanNormalizeColumnScope(column?.scope || 'global')
  scopeSelect.value = normalizedScope
  ownerInput.value = column?.ownerLabel || ''
  kanbanSyncColumnScopeFields()
  if (deleteButton) {
    deleteButton.hidden = !column
    deleteButton.disabled = !column
    deleteButton.textContent = 'Usuń kolumnę'
  }
  if (deleteInfo) {
    const count = column ? kanbanColumnTaskCount(column.id) : 0
    deleteInfo.textContent = column && count ? `W tej kolumnie jest ${count} zadań. Przy usunięciu zostaną przeniesione do pierwszej kolumny.` : ''
    deleteInfo.classList.remove('is-warning')
  }
  if (saveButton) saveButton.textContent = column ? 'Zapisz zmiany' : 'Dodaj kolumnę'
  overlay.hidden = false
  overlay.setAttribute('aria-hidden', 'false')
  window.setTimeout(() => nameInput.focus(), 0)
}

function kanbanCloseColumnEditor() {
  const overlay = document.getElementById('kanbanColumnOverlay')
  if (overlay) {
    overlay.hidden = true
    overlay.setAttribute('aria-hidden', 'true')
  }
  appState.kanbanColumnEditorMode = 'add'
  appState.kanbanColumnEditorId = ''
  appState.kanbanColumnDeleteConfirm = false
}

function kanbanModalIsVisible(elementId = '') {
  const element = document.getElementById(elementId)
  return element instanceof HTMLElement && !element.hidden && element.getAttribute('aria-hidden') !== 'true'
}

function kanbanHasOpenWindow() {
  return kanbanModalIsVisible('kanbanColumnOverlay') || kanbanModalIsVisible('kanbanDonePopover')
}

function kanbanTargetIsInsideOpenWindow(target) {
  if (!(target instanceof Element)) {
    return false
  }
  return Boolean(target.closest('#kanbanColumnOverlay .kanban-column-modal') || target.closest('#kanbanDonePopover'))
}

function kanbanConsumeBackgroundClickWhenWindowOpen(event) {
  if (!kanbanHasOpenWindow() || kanbanTargetIsInsideOpenWindow(event.target)) {
    return false
  }
  if (kanbanModalIsVisible('kanbanDonePopover')) {
    kanbanCloseDonePopover()
  }
  event.preventDefault()
  event.stopPropagation()
  return true
}

function kanbanSaveColumnEditor() {
  const nameInput = document.getElementById('kanbanColumnName')
  const colorSelect = document.getElementById('kanbanColumnColor')
  const scopeSelect = document.getElementById('kanbanColumnScope')
  const ownerInput = document.getElementById('kanbanColumnOwner')
  const label = String(nameInput?.value ?? '').trim()
  const color = kanbanColumnColorMeta(colorSelect?.value).value
  const scope = kanbanNormalizeColumnScope(scopeSelect?.value)
  const owner = kanbanResolveColumnOwner(scope, ownerInput?.value)
  if (!label) {
    showTransientNotice('Podaj nazwę kolumny.', 'error')
    nameInput?.focus()
    return
  }
  if (scope !== 'global' && !owner.ownerLabel) {
    showTransientNotice('Wybierz użytkownika, osobę albo obiekt dla tej kolumny.', 'error')
    ownerInput?.focus()
    return
  }

  const columns = kanbanLoadColumns()
  if (appState.kanbanColumnEditorMode === 'edit' && appState.kanbanColumnEditorId) {
    const updated = columns.map((column) =>
      column.id === appState.kanbanColumnEditorId ? { ...column, label, color, scope, ...owner } : column,
    )
    kanbanSaveColumns(updated)
    showTransientNotice('Kolumna została zaktualizowana.')
  } else {
    kanbanSaveColumns([...columns, { id: kanbanNewColumnId(), label, color, scope, ...owner }])
    showTransientNotice('Kolumna została dodana.')
  }
  kanbanCloseColumnEditor()
  renderKanbanView()
}

function kanbanDeleteColumnEditor() {
  const columnId = String(appState.kanbanColumnEditorId ?? '').trim()
  const columns = kanbanLoadColumns()
  const column = columns.find((item) => item.id === columnId)
  const deleteButton = document.getElementById('kanbanColumnDeleteBtn')
  const deleteInfo = document.getElementById('kanbanColumnDeleteInfo')
  if (!column) {
    return
  }
  if (columns.length <= 1) {
    showTransientNotice('Nie można usunąć ostatniej kolumny.', 'error')
    return
  }
  const tasksBeforeDelete = calendarLoadTasks()
  const taskCount = tasksBeforeDelete.filter((task) => String(task.kanbanStatus ?? '') === columnId).length
  if (!appState.kanbanColumnDeleteConfirm) {
    appState.kanbanColumnDeleteConfirm = true
    if (deleteButton) deleteButton.textContent = 'Potwierdź usunięcie'
    if (deleteInfo) {
      const fallbackLabel = columns.find((item) => item.id !== columnId)?.label || 'pierwszej kolumny'
      deleteInfo.textContent = taskCount
        ? `Potwierdź usunięcie. ${taskCount} zadań zostanie przeniesionych do kolumny „${fallbackLabel}”.`
        : 'Potwierdź usunięcie pustej kolumny.'
      deleteInfo.classList.add('is-warning')
    }
    return
  }

  const remainingColumns = columns.filter((item) => item.id !== columnId)
  const fallbackStatus = remainingColumns[0]?.id || KANBAN_COLUMNS[0]?.id || 'inProgress'
  kanbanSaveColumns(remainingColumns)
  const nextTasks = tasksBeforeDelete.map((task) =>
    String(task.kanbanStatus ?? '') === columnId ? { ...task, kanbanStatus: fallbackStatus, updatedAt: new Date().toISOString() } : task,
  )
  calendarSaveTasks(nextTasks)
  kanbanCloseColumnEditor()
  renderKanbanView()
  showTransientNotice('Kolumna została usunięta.')
}

function kanbanInitials(name = '') {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) {
    return '?'
  }
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase() || parts[0].slice(0, 2).toUpperCase()
}

function kanbanTaskIsCompleted(task = {}) {
  return Boolean(task.completed ?? task.kanbanCompleted ?? false)
}

function kanbanTaskDoneSummary(task = {}) {
  const note = String(task.completedNote ?? task.kanbanDoneNote ?? task.doneNote ?? '').trim()
  const by = String(task.completedBy ?? task.kanbanCompletedBy ?? '').trim()
  const at = String(task.completedAt ?? task.kanbanCompletedAt ?? '').trim()
  const date = at ? `${formatDatePl(at)} ${formatTime(at)}` : ''
  const meta = [by, date].filter(Boolean).join(' · ')
  return { note, meta }
}

function renderKanbanSyncStatus() {
  const node = document.getElementById('kanbanSyncStatus')
  if (!node) {
    return
  }

  const active = appState.currentRoute === 'kanban' && (appState.kanbanDataLoading || appState.calendarRemoteTasksLoading)
  const textNode = node.querySelector('[data-kanban-sync-text]')
  if (textNode) {
    textNode.textContent =
      String(appState.kanbanDataLoadingText ?? '').trim() ||
      (appState.calendarRemoteTasksLoading ? 'Synchronizacja zadań...' : 'Odświeżanie tablicy...')
  }
  node.hidden = !active
}

function kanbanSetDataLoading(active, text = '') {
  appState.kanbanDataLoading = Boolean(active)
  appState.kanbanDataLoadingText = active ? String(text ?? '').trim() : ''
  renderKanbanSyncStatus()
}

function calendarCompletionNoteForTask(task = {}, completedBy = '') {
  const actor = String(completedBy ?? '').trim() || 'użytkownika'
  return task.generatedFromComment ? `Załatwione przez ${actor}` : ''
}

function calendarCompletionActivityDetails(task = {}, note = '', completedBy = '') {
  const parts = []
  const cleanNote = String(note ?? '').trim()
  const actor = String(completedBy ?? '').trim()
  if (cleanNote) {
    parts.push(`Komentarz: ${cleanNote}`)
  } else if (task.generatedFromComment && actor) {
    parts.push(`Komentarz: zadanie zostało załatwione przez ${actor}.`)
  }
  if (task.generatedFromComment) {
    const assignees = calendarSelectionText(task.workers)
    if (assignees) {
      parts.push(`Dopisane osoby: ${assignees}`)
    }
  }
  return parts.join('\n')
}

function kanbanCardHtml(task = {}) {
  const title = String(task.title ?? '').trim() || 'Nowe zadanie'
  const tone = calendarTaskToneValue(task)
  const toneMeta = CALENDAR_TONE_OPTIONS.find((option) => option.value === tone) ?? CALENDAR_TONE_OPTIONS[0]
  const objects = calendarSelectionLabels(task.objects)
  const workers = calendarSelectionLabels(task.workers)
  const startTime = calendarNormalizeTimeValue(task.startTime ?? task.time)
  const endTime = calendarNormalizeTimeValue(task.endTime)
  const timeRange = startTime && endTime ? `${startTime}-${endTime}` : startTime
  const dateLabel = task.dateYmd ? formatDatePl(`${task.dateYmd}T12:00:00.000Z`) : '-'
  const zoneLabel = String(task.zone?.label ?? task.zoneName ?? '').trim()
  const zoneLocation = String(task.zone?.location ?? task.zoneLocation ?? '').trim()
  const zoneDisplay = zoneLabel ? calendarZoneDisplayLabel({ label: zoneLabel, location: zoneLocation }) : ''
  const objectLabel = [objects.length ? objects.join(', ') : String(task.place ?? '').trim(), zoneDisplay].filter(Boolean).join(' / ')
  const dueDate = String(task.dueDateYmd ?? '').trim()
  const dueTime = calendarNormalizeTimeValue(task.dueTime)
  const dueLabel = dueDate ? `Termin: ${formatDatePl(`${dueDate}T12:00:00.000Z`)}${dueTime ? ` ${dueTime}` : ''}` : ''
  const metaItems = [dateLabel, timeRange, dueLabel, objectLabel].filter(Boolean)
  const completed = kanbanTaskIsCompleted(task)
  const doneSummary = kanbanTaskDoneSummary(task)
  return `
    <article
      class="kanban-card kanban-card--${escapeHtml(toneMeta.css)}${completed ? ' is-completed' : ''}"
      draggable="true"
      tabindex="0"
      role="button"
      data-kanban-task-id="${escapeHtml(task.id)}"
      data-kanban-completed="${completed ? '1' : '0'}"
      title="${escapeHtml(title)}"
    >
      <div class="kanban-card-top">
        <div class="kanban-card-tag">${escapeHtml(toneMeta.label)}</div>
        <button
          class="kanban-card-done-btn${completed ? ' is-done' : ''}"
          type="button"
          draggable="false"
          data-kanban-complete-task="${escapeHtml(task.id)}"
          aria-label="${completed ? 'Cofnij zakończenie zadania' : 'Oznacz zadanie jako wykonane'}"
          title="${completed ? 'Cofnij zakończenie zadania' : 'Oznacz zadanie jako wykonane'}"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.4" />
          </svg>
        </button>
      </div>
      <h3>${escapeHtml(title)}</h3>
      ${metaItems.length ? `<p class="kanban-card-meta">${escapeHtml(metaItems.join(' · '))}</p>` : ''}
      ${
        completed
          ? `<p class="kanban-card-done-summary"><strong>Zakończone</strong>${doneSummary.note ? `: ${escapeHtml(doneSummary.note)}` : ''}${doneSummary.meta ? `<span>${escapeHtml(doneSummary.meta)}</span>` : ''}</p>`
          : ''
      }
      <div class="kanban-card-footer">
        <div class="kanban-card-stats">
          <span title="Obiekty">Obiekty ${objects.length || (objectLabel ? 1 : 0)}</span>
          <span title="Osoby">Osoby ${workers.length}</span>
        </div>
        <div class="kanban-card-avatars" aria-label="Przypisane osoby">
          ${
            workers.length
              ? workers.slice(0, 4).map((name) => `<span title="${escapeHtml(name)}">${escapeHtml(kanbanInitials(name))}</span>`).join('')
              : '<span title="Brak osoby">?</span>'
          }
        </div>
      </div>
    </article>
  `
}

function kanbanNormalizeSection(section = '') {
  const value = String(section ?? '').trim()
  return ['home', 'tasks', 'inbox'].includes(value) ? value : 'home'
}

function kanbanWorkspaceTasks({ includeCompleted = true } = {}) {
  kanbanEnsureState()
  const tasks = appState.calendarTasks.filter((task) => calendarTaskIsVisibleForCurrentUser(task))
  return calendarSortTasks(includeCompleted ? tasks : tasks.filter((task) => !kanbanTaskIsCompleted(task)))
}

function kanbanMessageTask(task = {}) {
  return (
    Boolean(task.generatedFromComment) ||
    calendarTaskToneValue(task) === 'message' ||
    normalizeSearchText(task.sourceKind).includes('comment')
  )
}

function kanbanWorkspaceTaskDateValue(task = {}) {
  const date = String(task.dueDateYmd || task.dateYmd || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '9999-12-31'
}

function kanbanWorkspaceTaskTimeValue(task = {}) {
  return calendarNormalizeTimeValue(task.dueTime || task.startTime || task.time) || '99:99'
}

function kanbanSortByAge(tasks = [], { newestFirst = false } = {}) {
  return [...tasks].sort((left, right) => {
    const leftDate = kanbanWorkspaceTaskDateValue(left)
    const rightDate = kanbanWorkspaceTaskDateValue(right)
    if (leftDate !== rightDate) {
      return newestFirst ? rightDate.localeCompare(leftDate) : leftDate.localeCompare(rightDate)
    }
    const leftTime = kanbanWorkspaceTaskTimeValue(left)
    const rightTime = kanbanWorkspaceTaskTimeValue(right)
    if (leftTime !== rightTime) {
      return newestFirst ? rightTime.localeCompare(leftTime) : leftTime.localeCompare(rightTime)
    }
    return String(left.title ?? '').localeCompare(String(right.title ?? ''), 'pl', { sensitivity: 'base' })
  })
}

function kanbanTaskProjectLabel(task = {}) {
  const objects = calendarSelectionLabels(task.objects)
  const objectLabel = objects[0] || String(task.place ?? '').trim()
  const zoneLabel = String(task.zone?.label ?? task.zoneName ?? '').trim()
  const zoneLocation = String(task.zone?.location ?? task.zoneLocation ?? '').trim()
  const zoneDisplay = zoneLabel ? calendarZoneDisplayLabel({ label: zoneLabel, location: zoneLocation }) : ''
  return [objectLabel, zoneDisplay].filter(Boolean).join(' / ') || 'Bez projektu'
}

function kanbanTaskShortDateLabel(task = {}) {
  const date = String(task.dueDateYmd || task.dateYmd || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return 'Bez daty'
  }
  const today = todayYmd()
  if (date === today) {
    return 'Dzisiaj'
  }
  return calendarDateLabelFromYmd(date)
}

function kanbanHomeCurrentDateLabel() {
  try {
    return new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  } catch {
    return calendarDateLabelFromYmd(todayYmd())
  }
}

function kanbanHomeGreetingName() {
  const full = String(appState.session?.name || appState.session?.login || appState.session?.email || '').trim()
  if (!full) {
    return 'użytkowniku'
  }
  return full.split(/\s+/)[0] || full
}

function kanbanHomeTaskRowHtml(task = {}) {
  const title = String(task.title ?? '').trim() || 'Zadanie'
  const project = kanbanTaskProjectLabel(task)
  const dateLabel = kanbanTaskShortDateLabel(task)
  const status = kanbanColumnLabel(task.kanbanStatus)
  const completed = kanbanTaskIsCompleted(task)
  return `
    <button class="kanban-home-task-row${completed ? ' is-completed' : ''}" type="button" data-kanban-task-id="${escapeHtml(task.id)}">
      <span class="kanban-home-check" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="m6 12.5 4 4L18 8" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />
        </svg>
      </span>
      <span class="kanban-home-task-main">
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(project)}</small>
      </span>
      <span class="kanban-home-task-status">${escapeHtml(status)}</span>
      <span class="kanban-home-task-date">${escapeHtml(dateLabel)}</span>
    </button>
  `
}

function kanbanHomeTaskGroups(tasks = kanbanWorkspaceTasks()) {
  const today = todayYmd()
  const active = tasks.filter((task) => !kanbanTaskIsCompleted(task))
  const completed = tasks.filter((task) => kanbanTaskIsCompleted(task))
  return {
    upcoming: kanbanSortByAge(active.filter((task) => kanbanWorkspaceTaskDateValue(task) >= today)).slice(0, 7),
    overdue: kanbanSortByAge(active.filter((task) => kanbanWorkspaceTaskDateValue(task) < today)).slice(0, 7),
    completed: kanbanSortByAge(completed, { newestFirst: true }).slice(0, 7),
    overdueTotal: active.filter((task) => kanbanWorkspaceTaskDateValue(task) < today).length,
  }
}

function kanbanProjectSummaries(tasks = kanbanWorkspaceTasks({ includeCompleted: false })) {
  const colors = ['violet', 'blue', 'pink', 'cyan', 'amber', 'green']
  const byLabel = new Map()
  tasks.forEach((task) => {
    const label = kanbanTaskProjectLabel(task)
    const key = normalizeSearchText(label)
    if (!key) {
      return
    }
    const current = byLabel.get(key) ?? {
      label,
      count: 0,
      earliest: kanbanWorkspaceTaskDateValue(task),
      color: colors[byLabel.size % colors.length],
    }
    current.count += 1
    const date = kanbanWorkspaceTaskDateValue(task)
    if (date < current.earliest) {
      current.earliest = date
    }
    byLabel.set(key, current)
  })
  return [...byLabel.values()].sort((left, right) => {
    if (left.earliest !== right.earliest) {
      return left.earliest.localeCompare(right.earliest)
    }
    return left.label.localeCompare(right.label, 'pl', { sensitivity: 'base' })
  })
}

function kanbanProjectIconHtml(color = 'blue') {
  return `
    <span class="kanban-project-icon kanban-project-icon--${escapeHtml(color)}" aria-hidden="true">
      <span></span><span></span><span></span>
    </span>
  `
}

function renderKanbanSidebar(tasks = kanbanWorkspaceTasks()) {
  const activeSection = kanbanNormalizeSection(appState.kanbanSection)
  document.querySelectorAll('[data-kanban-section], [data-kanban-menu-section]').forEach((button) => {
    const section = button.getAttribute('data-kanban-section') || button.getAttribute('data-kanban-menu-section')
    button.classList.toggle('is-active', String(section) === activeSection)
    button.classList.toggle('active', String(section) === activeSection && appState.currentRoute === 'kanban')
  })
  document.querySelectorAll('[data-toggle="kanban"]').forEach((button) => {
    button.classList.toggle('active', appState.currentRoute === 'kanban')
    button.classList.toggle('open', appState.currentRoute === 'kanban')
  })

  const activeTasks = tasks.filter((task) => !kanbanTaskIsCompleted(task))
  const messageTasks = activeTasks.filter((task) => kanbanMessageTask(task))
  document.querySelectorAll('[data-kanban-my-count]').forEach((node) => {
    node.textContent = String(activeTasks.length)
    node.hidden = activeTasks.length === 0
  })
  document.querySelectorAll('[data-kanban-inbox-dot]').forEach((node) => {
    node.hidden = messageTasks.length === 0
  })

  const projectRoot = document.getElementById('kanbanPortalMenuProjects')
  const projectSummaries = kanbanProjectSummaries(activeTasks)
  const projectLimit = Math.max(4, Number(appState.kanbanProjectLimit) || 9)
  if (projectRoot) {
    projectRoot.innerHTML = projectSummaries.slice(0, projectLimit).map((project) => `
      <button class="submenu-item kanban-menu-project" type="button" data-kanban-project-filter="${escapeHtml(project.label)}" title="${escapeHtml(project.label)}">
        ${kanbanProjectIconHtml(project.color)}
        <span class="mi-label">${escapeHtml(project.label)}</span>
        <small>${project.count}</small>
      </button>
    `).join('') || '<p class="kanban-menu-empty">Brak aktywnych projektów.</p>'
  }

  const showMore = document.getElementById('kanbanPortalMenuShowMore')
  if (showMore) {
    showMore.hidden = projectSummaries.length <= projectLimit
  }

}

function renderKanbanHome(tasks = kanbanWorkspaceTasks()) {
  const dateNode = document.getElementById('kanbanHomeDate')
  const greetingNode = document.getElementById('kanbanHomeGreeting')
  const avatarNode = document.getElementById('kanbanHomeAvatar')
  if (dateNode) dateNode.textContent = kanbanHomeCurrentDateLabel()
  if (greetingNode) greetingNode.textContent = `Dzień dobry, ${kanbanHomeGreetingName()}`
  if (avatarNode) avatarNode.textContent = kanbanInitials(appState.session?.name || appState.session?.email || '?')

  const groups = kanbanHomeTaskGroups(tasks)
  const activeTab = ['upcoming', 'overdue', 'completed'].includes(appState.kanbanHomeTaskTab) ? appState.kanbanHomeTaskTab : 'upcoming'
  appState.kanbanHomeTaskTab = activeTab
  document.querySelectorAll('#view-kanban [data-kanban-home-tab]').forEach((button) => {
    button.classList.toggle('is-active', String(button.getAttribute('data-kanban-home-tab')) === activeTab)
  })
  const overdueCount = document.getElementById('kanbanHomeOverdueCount')
  if (overdueCount) overdueCount.textContent = `(${groups.overdueTotal})`

  const taskRoot = document.getElementById('kanbanHomeTasks')
  const visibleTasks = groups[activeTab] ?? []
  if (taskRoot) {
    taskRoot.innerHTML = visibleTasks.length
      ? visibleTasks.map((task) => kanbanHomeTaskRowHtml(task)).join('')
      : '<div class="kanban-home-empty">Brak zadań w tym widoku.</div>'
  }

  const projectRoot = document.getElementById('kanbanHomeProjects')
  const projects = kanbanProjectSummaries(tasks.filter((task) => !kanbanTaskIsCompleted(task))).slice(0, 7)
  if (projectRoot) {
    projectRoot.innerHTML = `
      <button class="kanban-project-card kanban-project-card--create" type="button" data-kanban-home-add-task>
        <span aria-hidden="true">+</span>
        <strong>Utwórz zadanie</strong>
      </button>
      ${projects.map((project) => `
        <button class="kanban-project-card" type="button" data-kanban-project-filter="${escapeHtml(project.label)}" title="${escapeHtml(project.label)}">
          ${kanbanProjectIconHtml(project.color)}
          <span>
            <strong>${escapeHtml(project.label)}</strong>
            <small>${project.count} ${project.count === 1 ? 'zadanie' : 'zadań'} do wykonania</small>
          </span>
        </button>
      `).join('')}
    `
  }
}

function kanbanInboxDateGroupLabel(dateYmd = '') {
  const value = String(dateYmd ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return 'Bez daty'
  }
  const today = todayYmd()
  if (value === today) {
    return 'Dzisiaj'
  }
  const yesterday = calendarAddDays(today, -1)
  if (value === yesterday) {
    return 'Wczoraj'
  }
  return calendarDateLabelFromYmd(value)
}

function kanbanInboxTaskRowHtml(task = {}) {
  const title = String(task.title ?? '').trim() || 'Zadanie'
  const dateLabel = calendarDateLabelFromYmd(task.dueDateYmd || task.dateYmd)
  const comments = calendarNormalizeActivityLog(task.activityLog).length
  return `
    <button class="kanban-inbox-task-row" type="button" data-kanban-task-id="${escapeHtml(task.id)}">
      <span class="kanban-inbox-task-check" aria-hidden="true">✓</span>
      <span class="kanban-inbox-task-title">${escapeHtml(title)}</span>
      ${comments ? `<span class="kanban-inbox-task-comments">${comments}</span>` : ''}
      <span class="kanban-inbox-task-date">${escapeHtml(dateLabel)}</span>
      <span class="kanban-inbox-task-icons" aria-hidden="true">♡ ◌</span>
    </button>
  `
}

function kanbanInboxActivityGroups(tasks = []) {
  const groups = new Map()
  kanbanSortByAge(tasks.filter((task) => !kanbanTaskIsCompleted(task) && kanbanMessageTask(task))).forEach((task) => {
    const label = kanbanTaskProjectLabel(task)
    const key = normalizeSearchText(label)
    const sourceWorker = String(task.sourceWorkerName || task.sourceWorkerLogin || calendarSelectionLabels(task.workers)[0] || 'pracownik').trim()
    if (!groups.has(key)) {
      groups.set(key, {
        label,
        worker: sourceWorker,
        color: calendarTaskToneValue(task) === 'message' ? 'violet' : 'blue',
        tasks: [],
      })
    }
    groups.get(key).tasks.push(task)
  })
  return [...groups.values()]
}

function kanbanInboxBookmarkGroups(tasks = []) {
  const groups = new Map()
  kanbanSortByAge(tasks.filter((task) => !kanbanTaskIsCompleted(task))).forEach((task) => {
    const key = String(task.dueDateYmd || task.dateYmd || '').trim() || 'none'
    if (!groups.has(key)) {
      groups.set(key, {
        label: key === 'none' ? 'Bez daty' : `Twoje zadania na ${kanbanInboxDateGroupLabel(key)}`,
        tasks: [],
      })
    }
    groups.get(key).tasks.push(task)
  })
  return [...groups.values()]
}

function renderKanbanInbox(tasks = kanbanWorkspaceTasks()) {
  const root = document.getElementById('kanbanInboxList')
  if (!root) {
    return
  }
  const activeTab = appState.kanbanInboxTab === 'bookmarks' ? 'bookmarks' : 'activity'
  appState.kanbanInboxTab = activeTab
  document.querySelectorAll('#view-kanban [data-kanban-inbox-tab]').forEach((button) => {
    button.classList.toggle('is-active', String(button.getAttribute('data-kanban-inbox-tab')) === activeTab)
  })

  const avatar = document.getElementById('kanbanInboxAvatar')
  if (avatar) avatar.textContent = kanbanInitials(appState.session?.name || appState.session?.email || '?')

  if (activeTab === 'bookmarks') {
    const groups = kanbanInboxBookmarkGroups(tasks).slice(0, 12)
    root.innerHTML = groups.length
      ? groups.map((group) => `
          <section class="kanban-inbox-group kanban-inbox-group--bookmarks">
            <div class="kanban-inbox-date-label">${escapeHtml(kanbanInboxDateGroupLabel(group.tasks[0]?.dateYmd || group.tasks[0]?.dueDateYmd))}</div>
            <div class="kanban-inbox-group-inner">
              <div class="kanban-inbox-group-head">
                <span class="kanban-inbox-calendar-icon" aria-hidden="true"></span>
                <h2>${escapeHtml(group.label)}</h2>
              </div>
              <div class="kanban-inbox-task-table">
                ${group.tasks.slice(0, 3).map((task) => kanbanInboxTaskRowHtml(task)).join('')}
              </div>
              ${group.tasks.length > 3 ? '<button class="kanban-inbox-more" type="button">Pokaż więcej zadań</button>' : ''}
            </div>
          </section>
        `).join('')
      : '<div class="kanban-inbox-empty">Brak zadań do pokazania.</div>'
    return
  }

  const groups = kanbanInboxActivityGroups(tasks).slice(0, 20)
  root.innerHTML = groups.length
    ? groups.map((group) => `
        <section class="kanban-inbox-group">
          <div class="kanban-inbox-date-label">${escapeHtml(kanbanInboxDateGroupLabel(group.tasks[0]?.dateYmd))}</div>
          <div class="kanban-inbox-group-inner">
            <div class="kanban-inbox-group-head">
              <span class="kanban-inbox-project-dot kanban-inbox-project-dot--${escapeHtml(group.color)}" aria-hidden="true"></span>
              <h2>${escapeHtml(group.label)}</h2>
              <span class="kanban-inbox-unread-dot" aria-hidden="true"></span>
            </div>
            <p class="kanban-inbox-group-subtitle">Nowe zadania dodane przez: ${escapeHtml(group.worker)}</p>
            <div class="kanban-inbox-task-table">
              ${group.tasks.slice(0, 3).map((task) => kanbanInboxTaskRowHtml(task)).join('')}
            </div>
            ${group.tasks.length > 3 ? '<button class="kanban-inbox-more" type="button">Pokaż więcej zadań</button>' : ''}
          </div>
        </section>
      `).join('')
    : '<div class="kanban-inbox-empty">Brak aktywnych wiadomości pracowników.</div>'
}

function renderKanbanBoard(tasks = kanbanVisibleTasks()) {
  const board = document.getElementById('kanbanBoard')
  if (!board) {
    return
  }
  const columns = appState.kanbanColumns
  board.style.setProperty('--kanban-column-count', String(columns.length))
  board.style.removeProperty('min-width')
  board.innerHTML = `
    ${columns.map((column) => {
      const columnTasks = tasks.filter((task) => kanbanNormalizeStatus(task.kanbanStatus) === column.id)
      return `
        <section
          class="kanban-column kanban-column--${escapeHtml(column.id)}"
          data-kanban-column="${escapeHtml(column.id)}"
          style="${escapeHtml(kanbanColumnStyle(column))}"
        >
          <div class="kanban-column-head">
            <div
              class="kanban-column-title"
              draggable="true"
              data-kanban-column-drag-handle="${escapeHtml(column.id)}"
              title="Przeciągnij, aby zmienić kolejność kolumn"
            >
              <span class="kanban-column-dot" aria-hidden="true"></span>
              <h2>${escapeHtml(column.label)}</h2>
              <span class="kanban-column-count">${columnTasks.length}</span>
              ${kanbanColumnScopeBadgeHtml(column)}
            </div>
            <button class="kanban-more-btn" type="button" data-kanban-edit-column="${escapeHtml(column.id)}" aria-label="Edytuj kolumnę ${escapeHtml(column.label)}">⋮</button>
          </div>
          <div class="kanban-column-list">
            ${columnTasks.length ? columnTasks.map((task) => kanbanCardHtml(task)).join('') : '<div class="kanban-empty">Brak zadań</div>'}
          </div>
          <button class="kanban-add-item" type="button" data-kanban-add-task="${escapeHtml(column.id)}">+ Dodaj zadanie</button>
        </section>
      `
    }).join('')}
    <section class="kanban-column kanban-column--new">
      <button class="kanban-add-column" type="button">+ Nowa kolumna</button>
    </section>
  `
}

function renderKanbanView() {
  renderKanbanSyncStatus()
  kanbanEnsureState()
  appState.kanbanSection = kanbanNormalizeSection(appState.kanbanSection)
  const searchInput = document.getElementById('kanbanSearch')
  if (searchInput && searchInput.value !== appState.kanbanSearch) {
    searchInput.value = appState.kanbanSearch
  }
  const workspaceTasks = kanbanWorkspaceTasks()
  renderKanbanSidebar(workspaceTasks)

  const homeView = document.getElementById('kanbanHomeView')
  const taskBoardView = document.getElementById('kanbanTaskBoardView')
  const inboxView = document.getElementById('kanbanInboxView')
  if (homeView) homeView.hidden = appState.kanbanSection !== 'home'
  if (taskBoardView) taskBoardView.hidden = appState.kanbanSection !== 'tasks'
  if (inboxView) inboxView.hidden = appState.kanbanSection !== 'inbox'
  const boardAvatar = kanbanInitials(appState.session?.name || appState.session?.email || '?')
  const boardAvatarNode = document.getElementById('kanbanBoardAvatar')
  const boardTitleAvatarNode = document.getElementById('kanbanBoardTitleAvatar')
  if (boardAvatarNode) boardAvatarNode.textContent = boardAvatar
  if (boardTitleAvatarNode) boardTitleAvatarNode.textContent = boardAvatar

  if (appState.kanbanSection === 'home') {
    renderKanbanHome(workspaceTasks)
    return
  }
  if (appState.kanbanSection === 'inbox') {
    renderKanbanInbox(workspaceTasks)
    return
  }
  renderKanbanBoard(kanbanVisibleTasks())
}

function kanbanMoveTask(taskId, status) {
  const id = String(taskId ?? '').trim()
  const nextStatus = kanbanNormalizeStatus(status)
  if (!id) {
    return
  }
  const changedAt = new Date().toISOString()
  const tasks = calendarLoadTasks().map((task) =>
    task.id === id
      ? calendarNormalizeTask(
          calendarAppendTaskActivity(
            { ...task, kanbanStatus: nextStatus, updatedAt: changedAt },
            'Przeniesiono w Kanbanie',
            `Kolumna: ${kanbanColumnLabel(task.kanbanStatus)} -> ${kanbanColumnLabel(nextStatus)}`,
            { at: changedAt },
          ),
        )
      : task,
  )
  calendarSaveTasks(tasks)
  renderDashboardKanbanTasks()
  renderKanbanView()
}

function kanbanCloseDonePopover() {
  const popover = document.getElementById('kanbanDonePopover')
  if (popover) {
    popover.hidden = true
    popover.setAttribute('aria-hidden', 'true')
  }
  appState.kanbanDoneTaskId = ''
}

function kanbanConfirmTaskDone() {
  const id = String(appState.kanbanDoneTaskId ?? '').trim()
  const noteInput = document.getElementById('kanbanDoneNote')
  const note = String(noteInput?.value ?? '').trim()
  if (!id) {
    kanbanCloseDonePopover()
    return
  }
  if (!note) {
    showTransientNotice('Napisz krótko, co zostało zrobione.', 'error')
    noteInput?.focus?.()
    return
  }

  const completedAt = new Date().toISOString()
  const completedBy = String(appState.session?.name || appState.session?.email || appState.session?.uid || '').trim()
  const tasks = calendarLoadTasks().map((task) =>
    task.id === id
      ? calendarNormalizeTask(
          calendarAppendTaskActivity(
            {
              ...task,
              active: true,
              completed: true,
              kanbanCompleted: true,
              completionStatus: 'ZAKONCZONE',
              completedAt,
              completedBy,
              completedNote: note,
              updatedAt: completedAt,
            },
            'Oznaczono jako ukończone',
            calendarCompletionActivityDetails(task, note, completedBy),
            { actor: completedBy, at: completedAt },
          ),
        )
      : task,
  )
  calendarSaveTasks(tasks)
  kanbanCloseDonePopover()
  renderDashboardKanbanTasks()
  renderKanbanView()
  showTransientNotice('Zadanie oznaczone jako zakończone.')
}

function kanbanCompleteTaskNow(taskId = '') {
  const id = String(taskId ?? '').trim()
  if (!id) {
    return
  }

  const tasksBefore = calendarLoadTasks()
  const task = tasksBefore.find((item) => item.id === id)
  if (!task) {
    return
  }

  if (kanbanTaskIsCompleted(task)) {
    const updatedAt = new Date().toISOString()
    const tasks = tasksBefore.map((item) =>
      item.id === id
        ? calendarNormalizeTask(
            calendarAppendTaskActivity(
              {
                ...item,
                active: true,
                completed: false,
                kanbanCompleted: false,
                completionStatus: 'AKTYWNE',
                completedAt: '',
                completedBy: '',
                completedNote: '',
                updatedAt,
              },
              'Cofnięto ukończenie',
              '',
              { at: updatedAt },
            ),
          )
        : item,
    )
    calendarSaveTasks(tasks)
    kanbanCloseDonePopover()
    renderDashboardKanbanTasks()
    renderKanbanView()
    showTransientNotice('Cofnięto zakończenie zadania.')
    return
  }

  const completedAt = new Date().toISOString()
  const completedBy = String(appState.session?.name || appState.session?.email || appState.session?.uid || '').trim()
  const tasks = tasksBefore.map((item) =>
    item.id === id
      ? calendarNormalizeTask(
          calendarAppendTaskActivity(
            {
              ...item,
              active: true,
              completed: true,
              kanbanCompleted: true,
              completionStatus: 'ZAKONCZONE',
              completedAt,
              completedBy,
              completedNote: calendarCompletionNoteForTask(item, completedBy),
              updatedAt: completedAt,
            },
            'Oznaczono jako ukończone',
            calendarCompletionActivityDetails(item, '', completedBy),
            { actor: completedBy, at: completedAt },
          ),
        )
      : item,
  )
  calendarSaveTasks(tasks)
  kanbanCloseDonePopover()
  renderDashboardKanbanTasks()
  renderKanbanView()
  showTransientNotice('Zadanie oznaczone jako zakończone.')
}

function kanbanColumnDropPosition(event, columnNode) {
  if (!(columnNode instanceof HTMLElement)) {
    return 'before'
  }
  const rect = columnNode.getBoundingClientRect()
  return event.clientX > rect.left + rect.width / 2 ? 'after' : 'before'
}

function kanbanClearColumnDragClasses() {
  document.querySelectorAll('#view-kanban .kanban-column').forEach((node) => {
    node.classList.remove('is-column-dragging', 'is-column-drop-target', 'is-column-drop-before', 'is-column-drop-after')
  })
}

function kanbanMarkColumnDropTarget(columnNode, position = 'before') {
  if (!(columnNode instanceof HTMLElement)) {
    return
  }
  document.querySelectorAll('#view-kanban .kanban-column.is-column-drop-target').forEach((node) => {
    if (node !== columnNode) {
      node.classList.remove('is-column-drop-target', 'is-column-drop-before', 'is-column-drop-after')
    }
  })
  columnNode.classList.add('is-column-drop-target')
  columnNode.classList.toggle('is-column-drop-before', position !== 'after')
  columnNode.classList.toggle('is-column-drop-after', position === 'after')
}

function kanbanMoveColumn(sourceColumnId = '', targetColumnId = '', position = 'before') {
  const sourceId = String(sourceColumnId ?? '').trim()
  const targetId = String(targetColumnId ?? '').trim()
  if (!sourceId || !targetId || sourceId === targetId) {
    return
  }

  const columns = kanbanLoadColumns()
  const sourceIndex = columns.findIndex((column) => column.id === sourceId)
  const rawTargetIndex = columns.findIndex((column) => column.id === targetId)
  if (sourceIndex < 0 || rawTargetIndex < 0) {
    return
  }

  const nextColumns = [...columns]
  const [movedColumn] = nextColumns.splice(sourceIndex, 1)
  let targetIndex = rawTargetIndex
  if (sourceIndex < rawTargetIndex) {
    targetIndex -= 1
  }
  const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex
  nextColumns.splice(Math.max(0, Math.min(insertIndex, nextColumns.length)), 0, movedColumn)
  kanbanSaveColumns(nextColumns)
  renderKanbanView()
}

function kanbanOpenCalendarTask(taskId = '') {
  const id = String(taskId ?? '').trim()
  const task = calendarLoadTasks().find((item) => item.id === id)
  if (task?.dateYmd) {
    appState.calendarCursorDay = task.dateYmd
  }
  appState.calendarViewMode = 'week'
  document.querySelector('[data-route="calendar"]')?.click()
  window.setTimeout(() => {
    renderCalendarView()
    if (id) {
      calendarOpenEditor(id)
    }
  }, 0)
}

function kanbanCreateTask(status = '') {
  const normalizedStatus = String(status ?? '').trim() ? kanbanNormalizeStatus(status) : ''
  appState.kanbanPendingStatus = normalizedStatus
  appState.calendarCursorDay = todayYmd()
  appState.calendarViewMode = 'week'
  document.querySelector('[data-route="calendar"]')?.click()
  window.setTimeout(() => {
    renderCalendarView()
    calendarOpenEditor('', appState.calendarCursorDay)
    const toneInput = document.getElementById('calendarTaskTone')
    if (toneInput && normalizedStatus === 'done') {
      toneInput.value = 'green'
    }
    showTransientNotice('Dodaj zadanie w kalendarzu. Po zapisie pojawi się też w Kanbanie.')
  }, 0)
}

function bindKanbanViewFunctions() {
  const binding = createBindingHelpers()
  const root = document.getElementById('view-kanban')

  binding.add(document.getElementById('kanbanSearch'), 'input', (event) => {
    appState.kanbanSearch = String(event.target?.value ?? '')
    renderKanbanView()
  })
  binding.add(document.getElementById('kanbanAddTaskBtn'), 'click', () => kanbanCreateTask())
  binding.add(document.getElementById('kanbanQuickCreateBtn'), 'click', () => kanbanCreateTask())
  binding.add(document.getElementById('kanbanInboxOpenTasksBtn'), 'click', () => {
    appState.kanbanSection = 'tasks'
    appState.kanbanSearch = 'Wiadomość pracownika'
    renderKanbanView()
  })
  binding.add(document.getElementById('kanbanColumnSaveBtn'), 'click', kanbanSaveColumnEditor)
  binding.add(document.getElementById('kanbanColumnCancelBtn'), 'click', kanbanCloseColumnEditor)
  binding.add(document.getElementById('kanbanColumnCloseBtn'), 'click', kanbanCloseColumnEditor)
  binding.add(document.getElementById('kanbanColumnDeleteBtn'), 'click', kanbanDeleteColumnEditor)
  binding.add(document.getElementById('kanbanDoneSaveBtn'), 'click', kanbanConfirmTaskDone)
  binding.add(document.getElementById('kanbanDoneCancelBtn'), 'click', kanbanCloseDonePopover)
  binding.add(document.getElementById('kanbanDoneCloseBtn'), 'click', kanbanCloseDonePopover)
  binding.add(document.getElementById('kanbanColumnScope'), 'change', () => kanbanSyncColumnScopeFields({ clearOwner: true }))
  document.querySelectorAll('input[name="kanbanColumnScopeChoice"]').forEach((input) => {
    binding.add(input, 'change', () => {
      const scopeSelect = document.getElementById('kanbanColumnScope')
      if (scopeSelect && input instanceof HTMLInputElement && input.checked) {
        scopeSelect.value = input.value === 'project' ? 'person' : input.value
        kanbanSyncColumnScopeFields({ clearOwner: true })
      }
    })
  })
  binding.add(document.getElementById('kanbanColumnOverlay'), 'click', (event) => {
    if (event.target?.id === 'kanbanColumnOverlay') {
      kanbanCloseColumnEditor()
    }
  })
  binding.add(document.getElementById('kanbanColumnOverlay'), 'keydown', (event) => {
    if (event.key === 'Escape') {
      kanbanCloseColumnEditor()
    }
    if (event.key === 'Enter' && ['kanbanColumnName', 'kanbanColumnOwner'].includes(event.target?.id)) {
      kanbanSaveColumnEditor()
    }
  })
  binding.add(document.getElementById('kanbanDonePopover'), 'keydown', (event) => {
    if (event.key === 'Escape') {
      kanbanCloseDonePopover()
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      kanbanConfirmTaskDone()
    }
  })
  binding.add(root, 'click', (event) => {
    if (kanbanConsumeBackgroundClickWhenWindowOpen(event)) {
      return
    }
    const sectionButton = event.target?.closest?.('[data-kanban-section]')
    if (sectionButton) {
      appState.kanbanSection = kanbanNormalizeSection(sectionButton.getAttribute('data-kanban-section'))
      if (appState.kanbanSection !== 'tasks') {
        appState.kanbanSearch = ''
      }
      renderKanbanView()
      return
    }
    const homeTab = event.target?.closest?.('[data-kanban-home-tab]')
    if (homeTab) {
      appState.kanbanHomeTaskTab = String(homeTab.getAttribute('data-kanban-home-tab') ?? 'upcoming')
      renderKanbanView()
      return
    }
    const inboxTab = event.target?.closest?.('[data-kanban-inbox-tab]')
    if (inboxTab) {
      appState.kanbanInboxTab = String(inboxTab.getAttribute('data-kanban-inbox-tab') ?? 'activity')
      renderKanbanView()
      return
    }
    const projectFilter = event.target?.closest?.('[data-kanban-project-filter]')
    if (projectFilter) {
      const label = String(projectFilter.getAttribute('data-kanban-project-filter') ?? '').trim()
      appState.kanbanSection = 'tasks'
      appState.kanbanSearch = label
      renderKanbanView()
      return
    }
    if (event.target?.closest?.('[data-kanban-home-add-task]')) {
      kanbanCreateTask()
      return
    }
    if (event.target?.closest?.('#kanbanSidebarShowMore')) {
      appState.kanbanProjectLimit = Math.min(60, Math.max(9, Number(appState.kanbanProjectLimit) || 9) + 12)
      renderKanbanView()
      return
    }
    const completeTask = event.target?.closest?.('[data-kanban-complete-task]')
    if (completeTask) {
      event.preventDefault()
      event.stopPropagation()
      kanbanCompleteTaskNow(completeTask.getAttribute('data-kanban-complete-task'))
      return
    }
    const editColumn = event.target?.closest?.('[data-kanban-edit-column]')
    if (editColumn) {
      kanbanOpenColumnEditor(editColumn.getAttribute('data-kanban-edit-column'))
      return
    }
    const addTask = event.target?.closest?.('[data-kanban-add-task]')
    if (addTask) {
      kanbanCreateTask(addTask.getAttribute('data-kanban-add-task'))
      return
    }
    if (event.target?.closest?.('.kanban-add-column')) {
      kanbanOpenColumnEditor()
      return
    }
    const card = event.target?.closest?.('[data-kanban-task-id]')
    if (card) {
      kanbanOpenCalendarTask(card.getAttribute('data-kanban-task-id'))
    }
  })
  binding.add(root, 'keydown', (event) => {
    if (event.key !== 'Enter') {
      return
    }
    if (kanbanHasOpenWindow() && !kanbanTargetIsInsideOpenWindow(event.target)) {
      return
    }
    if (event.target?.closest?.('[data-kanban-complete-task]')) {
      return
    }
    const card = event.target?.closest?.('[data-kanban-task-id]')
    if (card) {
      kanbanOpenCalendarTask(card.getAttribute('data-kanban-task-id'))
    }
  })
  binding.add(root, 'dragstart', (event) => {
    if (kanbanHasOpenWindow()) {
      event.preventDefault()
      return
    }
    if (event.target?.closest?.('[data-kanban-complete-task]')) {
      event.preventDefault()
      return
    }
    const columnHandle = event.target?.closest?.('[data-kanban-column-drag-handle]')
    if (columnHandle) {
      const column = columnHandle.closest('[data-kanban-column]')
      const columnId = String(column?.getAttribute('data-kanban-column') ?? '').trim()
      if (!columnId) {
        return
      }
      appState.kanbanDragColumnId = columnId
      appState.kanbanDragTaskId = ''
      column?.classList.add('is-column-dragging')
      event.dataTransfer?.setData('application/x-icanban-column', columnId)
      event.dataTransfer?.setData('text/plain', columnId)
      event.dataTransfer.effectAllowed = 'move'
      return
    }

    const card = event.target?.closest?.('[data-kanban-task-id]')
    if (!card) {
      return
    }
    appState.kanbanDragTaskId = String(card.getAttribute('data-kanban-task-id') ?? '')
    event.dataTransfer?.setData('text/plain', appState.kanbanDragTaskId)
    event.dataTransfer.effectAllowed = 'move'
  })
  binding.add(root, 'dragover', (event) => {
    if (kanbanHasOpenWindow()) {
      event.preventDefault()
      return
    }
    const column = event.target?.closest?.('[data-kanban-column]')
    if (!column) {
      return
    }
    event.preventDefault()
    if (appState.kanbanDragColumnId) {
      const targetColumnId = String(column.getAttribute('data-kanban-column') ?? '').trim()
      if (targetColumnId && targetColumnId !== appState.kanbanDragColumnId) {
        kanbanMarkColumnDropTarget(column, kanbanColumnDropPosition(event, column))
      }
      event.dataTransfer.dropEffect = 'move'
      return
    }
    column.classList.add('is-drop-target')
  })
  binding.add(root, 'dragleave', (event) => {
    const column = event.target?.closest?.('[data-kanban-column]')
    column?.classList.remove('is-drop-target')
    if (appState.kanbanDragColumnId) {
      column?.classList.remove('is-column-drop-target', 'is-column-drop-before', 'is-column-drop-after')
    }
  })
  binding.add(root, 'drop', (event) => {
    if (kanbanHasOpenWindow()) {
      event.preventDefault()
      return
    }
    const column = event.target?.closest?.('[data-kanban-column]')
    if (!column) {
      return
    }
    event.preventDefault()
    column.classList.remove('is-drop-target', 'is-column-drop-target', 'is-column-drop-before', 'is-column-drop-after')
    if (appState.kanbanDragColumnId) {
      kanbanMoveColumn(appState.kanbanDragColumnId, column.getAttribute('data-kanban-column'), kanbanColumnDropPosition(event, column))
      appState.kanbanDragColumnId = ''
      kanbanClearColumnDragClasses()
      return
    }
    const taskId = event.dataTransfer?.getData('text/plain') || appState.kanbanDragTaskId
    kanbanMoveTask(taskId, column.getAttribute('data-kanban-column'))
    appState.kanbanDragTaskId = ''
  })
  binding.add(root, 'dragend', () => {
    appState.kanbanDragColumnId = ''
    appState.kanbanDragTaskId = ''
    document.querySelectorAll('.kanban-column.is-drop-target').forEach((node) => node.classList.remove('is-drop-target'))
    kanbanClearColumnDragClasses()
  })

  return binding.done
}

function bindCalendarViewFunctions() {
  const binding = createBindingHelpers()

  binding.add(document.getElementById('calendarAddBtn'), 'click', () => {
    calendarOpenEditor('', appState.calendarCursorDay || todayYmd())
  })
  binding.add(document.getElementById('calendarPrevBtn'), 'click', () => calendarMoveCursor(-1))
  binding.add(document.getElementById('calendarNextBtn'), 'click', () => calendarMoveCursor(1))
  binding.add(document.getElementById('calendarTodayBtn'), 'click', () => {
    appState.calendarCursorDay = todayYmd()
    appState.calendarTimelineSlideDirection = 0
    appState.calendarTimelineResetScroll = true
    renderCalendarView()
    void calendarEnsureTimelineWorkerState({ force: true }).catch(() => {})
  })
  binding.add(document.getElementById('calendarTimelineCompletedToggle'), 'click', () => {
    appState.calendarTimelineShowCompleted = appState.calendarTimelineShowCompleted === false
    renderCalendarView()
  })
  binding.add(document.getElementById('calendarTimelineRefreshBtn'), 'click', () => {
    renderCalendarView()
    void calendarEnsureTimelineWorkerState({ force: true }).catch(() => {})
    showTransientNotice('Kalendarz odświeżony.')
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
    ordersOpenEditorFromCalendar(bar.getAttribute('data-calendar-timeline-order-id'))
  })
  binding.add(timelineStage, 'click', (event) => {
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
  binding.add(document, 'click', (event) => {
    const popup = document.getElementById('calendarTimelineEventsPopup')
    if (!popup) {
      return
    }
    const target = event.target
    if (target instanceof Node && (popup.contains(target) || target?.closest?.('[data-calendar-timeline-order-id]'))) {
      return
    }
    calendarTimelineHideEventsPopup()
  })
  binding.add(document, 'keydown', (event) => {
    if (event.key === 'Escape') {
      calendarTimelineHideEventsPopup()
    }
  })
  binding.add(timelineStage, 'dragstart', (event) => {
    const bar = event.target?.closest?.('[data-calendar-timeline-order-id]')
    if (!(bar instanceof HTMLElement)) {
      return
    }
    if (bar.getAttribute('data-calendar-timeline-real-event') === '1') {
      event.preventDefault()
      return
    }
    const orderId = String(bar.getAttribute('data-calendar-timeline-order-id') ?? '').trim()
    if (!orderId) {
      return
    }
    const sourceRow = Number(bar.getAttribute('data-calendar-timeline-row'))
    appState.calendarTimelineDragOrderId = orderId
    appState.calendarTimelineDragSourceRow = Number.isInteger(sourceRow) ? sourceRow : null
    appState.calendarTimelineDragTargetRow = null
    appState.calendarTimelineDragTargetSlot = null
    appState.calendarTimelineDropHandled = false
    appState.calendarTimelineDragResources = calendarTimelineResources()
    appState.calendarTimelineDragConflictKey = ''
    appState.calendarTimelineDragConflictValue = false
    bar.classList.add('is-dragging')
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', orderId)
      if (Number.isInteger(sourceRow)) {
        event.dataTransfer.setData('application/x-calendar-source-row', String(sourceRow))
      }
    }
  })
  binding.add(timelineStage, 'dragover', (event) => {
    if (!appState.calendarTimelineDragOrderId) {
      return
    }
    const target = calendarTimelineDropTargetFromEvent(event)
    if (!(target instanceof HTMLElement)) {
      return
    }
    const dropInfo = calendarTimelineDropInfoFromTarget(target)
    if (!dropInfo) {
      return
    }
    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }
    calendarTimelineRememberDropInfo(dropInfo)
    const hasConflict = calendarTimelineDragConflict(
      appState.calendarTimelineDragOrderId,
      dropInfo.rowIndex,
      dropInfo.slotIndex,
      appState.calendarTimelineDragSourceRow,
    )
    calendarTimelineClearDropTargets()
    target.classList.add(hasConflict ? 'is-timeline-drop-invalid' : 'is-timeline-drop-target')
  })
  binding.add(timelineStage, 'dragleave', (event) => {
    const target = calendarTimelineDropTargetFromEvent(event)
    if (target instanceof HTMLElement && (!(event.relatedTarget instanceof Node) || !target.contains(event.relatedTarget))) {
      target.classList.remove('is-timeline-drop-target', 'is-timeline-drop-invalid')
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
    const dragResources = Array.isArray(appState.calendarTimelineDragResources) && appState.calendarTimelineDragResources.length
      ? appState.calendarTimelineDragResources
      : calendarTimelineResources()
    calendarTimelineClearDropTargets()
    const moveResult = calendarTimelineMoveOrder(
      orderId,
      dropInfo.rowIndex,
      dropInfo.slotIndex,
      Number.isInteger(sourceRow) ? sourceRow : null,
      dragResources,
    )
    calendarTimelineResetDragState()
    calendarTimelineHandleMoveResult(moveResult)
  })
  binding.add(timelineStage, 'dragend', () => {
    if (!appState.calendarTimelineDropHandled && appState.calendarTimelineDragOrderId) {
      const dropInfo = calendarTimelineResolveDropInfo()
      if (dropInfo) {
        const dragResources = Array.isArray(appState.calendarTimelineDragResources) && appState.calendarTimelineDragResources.length
          ? appState.calendarTimelineDragResources
          : calendarTimelineResources()
        const moveResult = calendarTimelineMoveOrder(
          appState.calendarTimelineDragOrderId,
          dropInfo.rowIndex,
          dropInfo.slotIndex,
          Number.isInteger(Number(appState.calendarTimelineDragSourceRow)) ? Number(appState.calendarTimelineDragSourceRow) : null,
          dragResources,
        )
        calendarTimelineHandleMoveResult(moveResult)
      }
    }
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
      appState.calendarViewMode = String(button.getAttribute('data-calendar-view') ?? 'week')
      renderCalendarView()
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

  return binding.done
}

function createBindingHelpers() {
  const cleanups = []
  const add = (node, event, handler) => {
    if (!node) return
    node.addEventListener(event, handler)
    cleanups.push(() => node.removeEventListener(event, handler))
  }
  return { add, done: () => cleanups.forEach((cleanup) => cleanup()) }
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
        await refreshDashboardWidgets({ syncWorktimeToken: true })
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
        await refreshDashboardWidgets({ syncWorktimeToken: true })
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

function bindIndividualOrdersViewFunctions() {
  const binding = createBindingHelpers()
  const cleanupIndividualOrdersTableResize = setupResizableGridTable({
    tableSelector: '#view-individualOrders .io-table',
    headSelector: '#view-individualOrders .io-head',
    cssVarName: '--io-grid',
    storageKey: 'portal.grid.individualOrders',
    defaultWidths: [120, 110, 290, 120, 140, 220, 160, 260, 130, 170],
    minWidths: [72, 66, 118, 68, 82, 96, 80, 112, 78, 92],
    nonResizableIndexes: [9],
    autoFitToViewport: true,
    enforceFullWidth: true,
    maxWidth: 780,
  })
  individualOrdersSyncPermissions()

  binding.add(document.getElementById('ioRefresh'), 'click', () => {
    void fetchIndividualOrdersForCurrentSession({ resetPage: true })
  })

  binding.add(document.getElementById('ioAdd'), 'click', () => {
    if (!canManageIndividualOrders()) {
      alert('Brak uprawnień do dodawania zleceń indywidualnych.')
      return
    }

    individualOrdersOpenModal('add')
  })

  binding.add(document.getElementById('ioQ'), 'keydown', (event) => {
    if (event.key !== 'Enter') {
      return
    }

    void fetchIndividualOrdersForCurrentSession({ resetPage: true })
  })

  binding.add(document.getElementById('ioQ'), 'input', () => {
    if (individualOrdersSearchDebounceHandle) {
      clearTimeout(individualOrdersSearchDebounceHandle)
      individualOrdersSearchDebounceHandle = null
    }

    individualOrdersSearchDebounceHandle = setTimeout(() => {
      void fetchIndividualOrdersForCurrentSession({ resetPage: true })
      individualOrdersSearchDebounceHandle = null
    }, 300)
  })

  binding.add(document.getElementById('ioRows'), 'click', (event) => {
    const button = event.target?.closest?.('[data-io-act][data-io-index]')
    if (!button) {
      return
    }

    const index = Number(button.getAttribute('data-io-index'))
    const item = Number.isInteger(index) ? appState.individualOrdersRows[index] : null
    if (!item) {
      return
    }

    const action = String(button.getAttribute('data-io-act') ?? '').trim()
    if (action === 'qr') {
      openIndividualOrderQrModal(item.qrCode)
      return
    }

    if (action === 'edit') {
      if (!canManageIndividualOrders()) {
        alert('Brak uprawnień do edycji zleceń indywidualnych.')
        return
      }

      individualOrdersOpenModal('edit', item)
      return
    }

    if (action === 'del') {
      void deleteIndividualOrderFromRow(item)
    }
  })

  binding.add(document.getElementById('ioModalClose'), 'click', individualOrdersCloseModal)
  binding.add(document.getElementById('ioModalCancel'), 'click', individualOrdersCloseModal)
  binding.add(document.getElementById('ioModal'), 'click', (event) => {
    if (event.target?.id === 'ioModal') {
      individualOrdersCloseModal()
    }
  })

  binding.add(document.getElementById('ioModalSave'), 'click', () => {
    void saveIndividualOrderFromModal()
  })

  binding.add(document.getElementById('ioQrModalClose'), 'click', closeIndividualOrderQrModal)
  binding.add(document.getElementById('ioQrModalCancel'), 'click', closeIndividualOrderQrModal)
  binding.add(document.getElementById('ioQrModal'), 'click', (event) => {
    if (event.target?.id === 'ioQrModal') {
      closeIndividualOrderQrModal()
    }
  })
  binding.add(document.getElementById('ioQrModalPng'), 'click', () => {
    void downloadCurrentIndividualOrderQrPng()
  })
  binding.add(document.getElementById('ioQrModalPdf'), 'click', () => {
    void downloadCurrentIndividualOrderQrPdf()
  })

  return () => {
    if (individualOrdersSearchDebounceHandle) {
      clearTimeout(individualOrdersSearchDebounceHandle)
      individualOrdersSearchDebounceHandle = null
    }

    cleanupIndividualOrdersTableResize()
    binding.done()
  }
}

function bindEventsViewFunctions() {
  const binding = createBindingHelpers()
  ensureEventOverlaysMountedToBody()
  const cleanupEventsTableResize = setupResizableGridTable({
    tableSelector: '#view-events .events-table',
    headSelector: '#view-events .events-head',
    cssVarName: '--events-grid',
    storageKey: 'portal.grid.events.v3',
    defaultWidths: [28, 90, 90, 94, 94, 78, 56, 56, 64, 72, 74, 38],
    minWidths: [26, 62, 62, 64, 64, 66, 44, 44, 48, 56, 58, 34],
    nonResizableIndexes: [0, 11],
    autoFitToViewport: true,
    enforceFullWidth: true,
    maxWidth: 680,
  })
  syncEventsActionPermissions()

  binding.add(document.getElementById('evSearchBtn'), 'click', () => {
    appState.eventsPage = 1
    void fetchEventsForCurrentSession({ resetPage: false })
  })

  binding.add(document.getElementById('evResetBtn'), 'click', () => {
    void fetchEventsForCurrentSession({ resetPage: false })
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
    if (appState.eventsPage >= appState.eventsTotalPages) return
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
        appState.eventsSelectedKeys.add(eventSelectionKey(row, index))
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
        openEventCommentModal(row.comment)
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
  binding.add(document.getElementById('evEditPom'), 'change', refreshEventZoneOptionsForClient)
  binding.add(document.getElementById('evEditStrefa'), 'change', syncEventRoomAndClientFromZone)
  ;[
    { inputId: 'evEditWorkerSearch', selectId: 'evEditWorker', kind: 'worker' },
    { inputId: 'evEditPomSearch', selectId: 'evEditPom', kind: 'client' },
    { inputId: 'evEditStrefaSearch', selectId: 'evEditStrefa', kind: 'zone' },
  ].forEach(({ inputId, selectId, kind }) => {
    binding.add(document.getElementById(inputId), 'input', () => {
      eventEditorApplyPickerFilter(kind, { expandOnEmpty: true })
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

function bindZonesViewFunctions() {
  const binding = createBindingHelpers()
  const cleanupZonesTableResize = setupResizableGridTable({
    tableSelector: '#view-zones .zones-table',
    headSelector: '#view-zones .zones-head',
    cssVarName: '--zones-grid',
    storageKey: 'portal.grid.zones.v2',
    defaultWidths: [64, 116, 126, 120, 82, 82, 84, 64],
    minWidths: [46, 70, 76, 72, 58, 58, 58, 54],
    nonResizableIndexes: [7],
    autoFitToViewport: true,
    enforceFullWidth: true,
    maxWidth: 740,
  })

  binding.add(document.getElementById('znSearchBtn'), 'click', () => {
    filterZonesTable({ resetPage: true })
  })
  binding.add(document.getElementById('znResetBtn'), 'click', () => {
    resetZoneFilters()
    filterZonesTable({ resetPage: true })
  })

  ;['znQr', 'znClient', 'znStrefa', 'znLoc', 'znFunkcja', 'znEditedBy', 'znQ'].forEach((id) => {
    binding.add(document.getElementById(id), 'keydown', (event) => {
      if (event.key === 'Enter') filterZonesTable({ resetPage: true })
    })
  })
  binding.add(document.getElementById('znSort'), 'change', () => {
    filterZonesTable({ resetPage: true })
  })

  binding.add(document.getElementById('znPrevBtn'), 'click', () => {
    if (appState.zonesPage <= 1) return
    appState.zonesPage -= 1
    filterZonesTable({ resetPage: false })
  })
  binding.add(document.getElementById('znNextBtn'), 'click', () => {
    if (appState.zonesPage >= appState.zonesTotalPages) return
    appState.zonesPage += 1
    filterZonesTable({ resetPage: false })
  })

  binding.add(document.getElementById('znAddBtn'), 'click', openZoneAddModal)
  binding.add(document.getElementById('znRows'), 'click', (event) => {
    const button = event.target.closest('[data-zone-id]')
    if (!button) return
    const zoneId = String(button.getAttribute('data-zone-id') ?? '').trim()
    if (!zoneId) return
    openZonePreviewModal(zoneId)
  })

  binding.add(document.getElementById('znEditorOverlay'), 'click', (event) => {
    if (event.target?.id === 'znEditorOverlay') closeZoneModal()
  })
  binding.add(document.getElementById('znCancelBtn'), 'click', closeZoneModal)
  binding.add(document.getElementById('znSaveBtn'), 'click', () => {
    void saveZoneData()
  })
  binding.add(document.getElementById('znDeleteBtn'), 'click', () => {
    void deleteZoneData()
  })

  return () => {
    cleanupZonesTableResize()
    binding.done()
  }
}
function bindWorkerTimeViewFunctions(router) {
  const binding = createBindingHelpers()
  const cleanupWorkerTimeTableResize = setupResizableGridTable({
    tableSelector: '#view-workerTime .events-table',
    headSelector: '#view-workerTime .events-head',
    cssVarName: '--events-grid',
    storageKey: 'portal.grid.workerTime',
    defaultWidths: [42, 120, 220, 180, 100, 140],
    minWidths: [32, 74, 112, 92, 66, 78],
    nonResizableIndexes: [5],
    autoFitToViewport: true,
    enforceFullWidth: true,
    maxWidth: 680,
  })

  const downloadButton = document.getElementById('wtDownloadEwidencjaBtn')
  if (downloadButton) {
    downloadButton.disabled = false
    downloadButton.title = 'Eksport ewidencji pracy (PDF).'
  }

  binding.add(downloadButton, 'click', openWorkerTimeExportModal)
  binding.add(document.getElementById('wtExportOverlay'), 'click', (event) => {
    if (event.target?.id === 'wtExportOverlay') {
      closeWorkerTimeExportModal()
    }
  })
  binding.add(document.getElementById('wtExportCloseBtn'), 'click', closeWorkerTimeExportModal)
  binding.add(document.getElementById('wtExportCancelBtn'), 'click', closeWorkerTimeExportModal)
  binding.add(document.getElementById('wtExportPdfBtn'), 'click', () => {
    void downloadWorkerTimeEwidencja()
  })

  binding.add(document.getElementById('wtSearchBtn'), 'click', () => {
    void fetchWorkersForCurrentSession()
  })

  binding.add(document.getElementById('wtRefreshBtn'), 'click', () => {
    const qInput = document.getElementById('wtQ')
    const typeInput = document.getElementById('wtType')
    const workerIdInput = document.getElementById('wtWorkerId')
    const activeInput = document.getElementById('wtActive')
    if (qInput) qInput.value = ''
    if (typeInput) typeInput.value = ''
    if (workerIdInput) workerIdInput.value = ''
    if (activeInput) activeInput.value = ''
    void fetchWorkersForCurrentSession()
  })

  ;['wtQ', 'wtType', 'wtWorkerId'].forEach((id) => {
    binding.add(document.getElementById(id), 'keydown', (event) => {
      if (event.key === 'Enter') {
        filterWorkerTimeTable({ resetPage: true })
      }
    })
  })
  binding.add(document.getElementById('wtActive'), 'change', () => {
    filterWorkerTimeTable({ resetPage: true })
  })

  binding.add(document.getElementById('wtPrevBtn'), 'click', () => {
    if (appState.workersPage <= 1) return
    appState.workersPage -= 1
    filterWorkerTimeTable({ resetPage: false })
  })

  binding.add(document.getElementById('wtNextBtn'), 'click', () => {
    if (appState.workersPage >= appState.workersTotalPages) return
    appState.workersPage += 1
    filterWorkerTimeTable({ resetPage: false })
  })

  binding.add(document.getElementById('wtSelectAll'), 'change', (event) => {
    const checked = Boolean(event.target?.checked)
    workerTimeToggleSelectAllOnPage(checked)
    renderWorkersPaged(appState.workerTimeViewRows, { resetPage: false })
  })

  binding.add(document.getElementById('wtRows'), 'change', (event) => {
    const checkbox = event.target.closest('[data-wt-select]')
    if (!(checkbox instanceof HTMLInputElement)) {
      return
    }

    const key = String(checkbox.getAttribute('data-wt-select') ?? '').trim()
    if (!key) {
      return
    }

    workerTimeSetSelected(key, checkbox.checked)
    workerTimeSyncSelectionUi()
    renderWorkersPaged(appState.workerTimeViewRows, { resetPage: false })
  })

  binding.add(document.getElementById('wtRows'), 'click', (event) => {
    const button = event.target.closest('[data-worker-login]')
    if (!button) return

    appState.selectedWorkerLogin = String(button.getAttribute('data-worker-login') ?? '').trim()
    appState.selectedWorkerName = String(button.getAttribute('data-worker-name') ?? '').trim()
    appState.workerDetailPage = 1
    router.go('workerTimeDetail')
  })

  return () => {
    cleanupWorkerTimeTableResize()
    binding.done()
  }
}

function bindWorkerTimeDetailViewFunctions() {
  const binding = createBindingHelpers()

  const addDayButton = document.getElementById('wtdAddDayBtn')
  if (addDayButton) {
    addDayButton.style.display = workerDetailCanEdit() ? '' : 'none'
  }

  const downloadButton = document.getElementById('wtdDownloadEwidencjaBtn')
  if (downloadButton) {
    downloadButton.disabled = false
    downloadButton.title = 'Eksport ewidencji pracy (CSV/PDF).'
  }

  applyWorkerDetailColumnWidths()
  workerDetailAttachColumnResizers()

  binding.add(document.getElementById('wtdEventsTable'), 'mousedown', (event) => {
    const handle = event.target.closest('[data-wtd-col-resizer]')
    if (!handle) {
      return
    }

    const colIndex = Number(handle.getAttribute('data-wtd-col-resizer'))
    if (!Number.isInteger(colIndex)) {
      return
    }

    event.preventDefault()
    workerDetailStartColumnDrag(colIndex, event.clientX)
  })

  binding.add(document.getElementById('wtdRefreshBtn'), 'click', () => {
    appState.workerDetailPage = 1
    void fetchWorkerDetailForCurrentSession()
  })

  binding.add(document.getElementById('wtdSearchBtn'), 'click', () => {
    appState.workerDetailPage = 1
    void fetchWorkerDetailForCurrentSession()
  })

  binding.add(document.getElementById('wtdSumPrevBtn'), 'click', () => {
    if (appState.workerDetailPage <= 1) return
    appState.workerDetailPage -= 1
    renderWorkerDetailCurrentPage()
  })

  binding.add(document.getElementById('wtdSumNextBtn'), 'click', () => {
    const paged = paginate(appState.workerDetailRows, appState.workerDetailPage, appState.workerDetailPageSize)
    if (appState.workerDetailPage >= paged.totalPages) return
    appState.workerDetailPage += 1
    renderWorkerDetailCurrentPage()
  })

  binding.add(document.getElementById('wtdMonthPick'), 'change', (event) => {
    applyMonthPickToWorkerDetail(event.target?.value)
    appState.workerDetailPage = 1
    void fetchWorkerDetailForCurrentSession()
  })

  ;['wtdFrom', 'wtdTo'].forEach((id) => {
    binding.add(document.getElementById(id), 'keydown', (event) => {
      if (event.key !== 'Enter') return
      appState.workerDetailPage = 1
      void fetchWorkerDetailForCurrentSession()
    })
  })

  binding.add(document.getElementById('wtdAddDayBtn'), 'click', () => {
    openWorkerDetailDayEditorNew()
  })

  binding.add(document.getElementById('wtdSelectAll'), 'change', (event) => {
    const checked = Boolean(event.target?.checked)
    workerDetailToggleSelectAllOnPage(checked)
    renderWorkerDetailCurrentPage()
  })

  binding.add(document.getElementById('wtdDownloadEwidencjaBtn'), 'click', openWorkerDetailExportModal)
  binding.add(document.getElementById('wtdExportOverlay'), 'click', (event) => {
    if (event.target?.id === 'wtdExportOverlay') {
      closeWorkerDetailExportModal()
    }
  })
  binding.add(document.getElementById('wtdExportCloseBtn'), 'click', closeWorkerDetailExportModal)
  binding.add(document.getElementById('wtdExportCancelBtn'), 'click', closeWorkerDetailExportModal)
  binding.add(document.getElementById('wtdExportCsvBtn'), 'click', () => {
    void downloadWorkerDetailEwidencja('csv')
  })
  binding.add(document.getElementById('wtdExportPdfBtn'), 'click', () => {
    void downloadWorkerDetailEwidencja('pdf')
  })

  binding.add(document.getElementById('wtdSumRows'), 'change', (event) => {
    const checkbox = event.target.closest('[data-worker-detail-select]')
    if (!(checkbox instanceof HTMLInputElement)) {
      return
    }

    const key = String(checkbox.getAttribute('data-worker-detail-select') ?? '').trim()
    if (!key) {
      return
    }

    workerDetailSetSelectedKey(key, checkbox.checked)
    syncWorkerDetailSelectionUi()
    renderWorkerDetailCurrentPage()
  })

  binding.add(document.getElementById('wtdSumRows'), 'click', (event) => {
    const button = event.target.closest('[data-worker-detail-edit]')
    if (!button) {
      return
    }

    const dayKey = String(button.getAttribute('data-worker-detail-edit') ?? '').trim()
    if (!dayKey) {
      return
    }

    const item = appState.workerDetailRows.find((row) => row.dayKey === dayKey)
    if (!item) {
      return
    }

    openWorkerDetailDayEditor(item)
  })

  binding.add(document.getElementById('wtdDayEditorOverlay'), 'click', (event) => {
    if (event.target?.id === 'wtdDayEditorOverlay') {
      closeWorkerDetailDayEditor()
    }
  })
  binding.add(document.getElementById('wtdDayEditorClose'), 'click', closeWorkerDetailDayEditor)
  binding.add(document.getElementById('wtdDayCancelBtn'), 'click', closeWorkerDetailDayEditor)
  binding.add(document.getElementById('wtdDaySaveBtn'), 'click', () => {
    void saveWorkerDetailDayEditor()
  })
  binding.add(document.getElementById('wtdDayAckBtn'), 'click', ackWorkerDetailDay)

  ;['wtdDayDateInput', 'wtdDayStartTime', 'wtdDayEndTime'].forEach((id) => {
    ;['input', 'change', 'keyup'].forEach((eventName) => {
      binding.add(document.getElementById(id), eventName, updateWorkerDetailDayPreview)
    })
  })

  return () => {
    workerDetailStopColumnDrag({ persist: true })
    binding.done()
  }
}

function bindWorkerProfileViewFunctions() {
  const binding = createBindingHelpers()
  const cleanupWorkerProfileTableResize = setupResizableGridTable({
    tableSelector: '#view-workerProfile .workers-table',
    headSelector: '#view-workerProfile .workers-head',
    cssVarName: '--workers-grid',
    storageKey: 'portal.grid.workerProfile',
    defaultWidths: [90, 220, 150, 180, 110, 120, 130, 240, 110],
    minWidths: [54, 104, 80, 90, 64, 66, 72, 100, 68],
    nonResizableIndexes: [8],
    autoFitToViewport: true,
    enforceFullWidth: true,
    maxWidth: 760,
  })

  syncWorkerProfileAddButtonState()

  binding.add(document.getElementById('wkSearchBtn'), 'click', () => {
    void fetchWorkerProfilesForCurrentSession(true)
  })

  binding.add(document.getElementById('wkResetBtn'), 'click', () => {
    resetWorkerProfileFilters()
    void fetchWorkerProfilesForCurrentSession(true)
  })

  ;['wkQ', 'wkType', 'wkActive', 'wkOnline'].forEach((id) => {
    binding.add(document.getElementById(id), 'keydown', (event) => {
      if (event.key !== 'Enter') return
      void fetchWorkerProfilesForCurrentSession(true)
    })
  })

  ;['wkType', 'wkActive', 'wkOnline'].forEach((id) => {
    binding.add(document.getElementById(id), 'change', () => {
      filterWorkerProfileTable({ resetPage: true })
    })
  })

  binding.add(document.getElementById('wkPrevBtn'), 'click', () => {
    if (appState.workerProfilePage <= 1) return
    appState.workerProfilePage -= 1
    filterWorkerProfileTable({ resetPage: false })
  })
  binding.add(document.getElementById('wkNextBtn'), 'click', () => {
    if (appState.workerProfilePage >= appState.workerProfileTotalPages) return
    appState.workerProfilePage += 1
    filterWorkerProfileTable({ resetPage: false })
  })

  binding.add(document.getElementById('wkAddBtn'), 'click', () => {
    if (!canManageWorkers()) {
      alert('Brak uprawnień do dodawania pracownika.')
      return
    }

    openWorkerProfileModal(null, 'add')
  })

  binding.add(document.getElementById('wkRows'), 'click', (event) => {
    const button = event.target.closest('[data-worker-profile-index]')
    if (!button) {
      return
    }

    const index = Number(button.getAttribute('data-worker-profile-index'))
    const worker = Number.isInteger(index) ? appState.workerProfileViewRows[index] : null
    if (!worker) {
      return
    }

    openWorkerProfileModal(worker, canManageWorkers() ? 'edit' : 'view')
  })

  binding.add(document.getElementById('wkEditorOverlay'), 'click', (event) => {
    if (event.target?.id === 'wkEditorOverlay') {
      closeWorkerProfileModal()
    }
  })
  binding.add(document.getElementById('wkCancelBtn'), 'click', closeWorkerProfileModal)
  binding.add(document.getElementById('wkSaveBtn'), 'click', () => {
    void saveWorkerProfileData()
  })
  binding.add(document.getElementById('wkDeleteBtn'), 'click', () => {
    void deleteWorkerProfileData()
  })
  binding.add(document.getElementById('wkFillQrBtn'), 'click', fillWorkerQrFromCredentials)
  binding.add(document.getElementById('wkEditEmail'), 'input', () => {
    if (appState.workerProfileModalMode !== 'add') {
      return
    }

    const emailInput = document.getElementById('wkEditEmail')
    const loginInput = document.getElementById('wkEditLogin')
    if (!(emailInput instanceof HTMLInputElement) || !(loginInput instanceof HTMLInputElement)) {
      return
    }

    const nextLogin = workerProfileLoginFromEmail(emailInput.value)
    if (!nextLogin) {
      return
    }

    if (!loginInput.value.trim() || loginInput.dataset.autoFromEmail === '1') {
      loginInput.value = nextLogin
      loginInput.dataset.autoFromEmail = '1'
    }
  })
  binding.add(document.getElementById('wkEditLogin'), 'input', () => {
    const loginInput = document.getElementById('wkEditLogin')
    if (loginInput instanceof HTMLInputElement) {
      loginInput.dataset.autoFromEmail = '0'
    }
  })
  binding.add(document.getElementById('wkShowPassBtn'), 'click', () => {
    const passInput = document.getElementById('wkCurrentPass')
    const showButton = document.getElementById('wkShowPassBtn')
    if (!passInput || !showButton) {
      return
    }

    const show = passInput.type === 'password'
    passInput.type = show ? 'text' : 'password'
    showButton.textContent = show ? 'Ukryj' : 'Pokaż'
  })
  binding.add(document.getElementById('wkCopyPassBtn'), 'click', async () => {
    const passInput = document.getElementById('wkCurrentPass')
    if (!passInput?.value) {
      alert('Brak hasła do skopiowania.')
      return
    }

    try {
      await navigator.clipboard.writeText(passInput.value)
      alert('Skopiowano hasło do schowka.')
    } catch {
      alert('Nie udało się skopiować hasła.')
    }
  })

  return () => {
    cleanupWorkerProfileTableResize()
    binding.done()
  }
}

function bindReportsViewFunctions() {
  const binding = createBindingHelpers()
  const reportsRoot = document.getElementById('view-reports')

  binding.add(reportsRoot, 'click', (event) => {
    const geoButton = event.target.closest('[data-rep-geo-lat][data-rep-geo-lon]')
    if (geoButton) {
      event.preventDefault()
      const coords = reportGeoReadCoordsFromNode(geoButton)
      if (coords) {
        reportGeoOpenModal(coords.lat, coords.lon)
      }
      return
    }

    const historyEditButton = event.target.closest('[data-rep-history-edit]')
    if (historyEditButton) {
      if (!canManageEvents()) {
        alert('Brak uprawnień do edycji zdarzeń.')
        return
      }

      const editKey = String(historyEditButton.getAttribute('data-rep-history-edit') ?? '').trim()
      const row = appState.reportHistoryEditableMap?.[editKey]
      if (!row) {
        alert('Nie znaleziono rekordu do edycji. Odśwież historię.')
        return
      }

      void openEventEditor(row)
      return
    }

    const historyStopDayButton = event.target.closest('[data-rep-history-stop-day]')
    if (historyStopDayButton) {
      const dayKey = String(historyStopDayButton.getAttribute('data-rep-history-stop-day') ?? '').trim()
      if (dayKey) {
        void reportHistoryCloseWorkerDay(dayKey)
      }
      return
    }

    const historyTabButton = event.target.closest('[data-rep-history-tab]')
    if (historyTabButton) {
      const tab = String(historyTabButton.getAttribute('data-rep-history-tab') ?? '').trim()
      if (tab) {
        reportHistorySetTab(tab)
        reportHistorySetStatus('Wybierz filtr i kliknij "Pokaż historię".')
      }
      return
    }

    const historyToggleButton = event.target.closest('[data-rep-history-toggle]')
    if (historyToggleButton) {
      const dayKey = String(historyToggleButton.getAttribute('data-rep-history-toggle') ?? '').trim()
      if (dayKey) {
        reportHistoryToggle(dayKey)
      }
      return
    }

    const tile = event.target.closest('[data-rep-open]')
    if (!tile) {
      return
    }

    const kind = String(tile.getAttribute('data-rep-open') ?? '').trim()
    if (!kind) {
      return
    }

    openReportBuilder(kind)
  })
  binding.add(reportsRoot, 'mouseover', (event) => {
    const geoButton = event.target.closest('[data-rep-geo-lat][data-rep-geo-lon]')
    if (!geoButton) {
      return
    }

    const coords = reportGeoReadCoordsFromNode(geoButton)
    if (!coords) {
      return
    }

    reportGeoShowPreview(geoButton, coords.lat, coords.lon)
  })
  binding.add(reportsRoot, 'mouseout', (event) => {
    const geoButton = event.target.closest('[data-rep-geo-lat][data-rep-geo-lon]')
    if (!geoButton) {
      return
    }

    const related = event.relatedTarget
    if (related && geoButton.contains(related)) {
      return
    }

    reportGeoHidePreviewSoon()
  })
  binding.add(document, 'click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) {
      return
    }

    if (target.id === 'repGeoOverlay') {
      reportGeoCloseModal()
      return
    }
    if (target.closest('#repGeoClose')) {
      reportGeoCloseModal()
      return
    }
    if (target.closest('#repGeoZoomIn')) {
      reportGeoChangeZoom(1)
      return
    }
    if (target.closest('#repGeoZoomOut')) {
      reportGeoChangeZoom(-1)
    }
  })

  binding.add(document.getElementById('repBack'), 'click', closeReportBuilder)
  binding.add(document.getElementById('repRun'), 'click', () => {
    void runEventsOperationalReport()
  })
  binding.add(document.getElementById('repDownloadCsv'), 'click', reportDownloadCsv)
  binding.add(document.getElementById('repA_client'), 'change', () => reportRefreshZoneOptions('A'))
  binding.add(document.getElementById('repB_client'), 'change', () => reportRefreshZoneOptions('B'))
  binding.add(document.getElementById('repEventsClient'), 'change', reportRefreshEventsZoneOptions)
  ;[
    'repEventsFrom',
    'repEventsTo',
    'repEventsClient',
    'repEventsZone',
    'repEventsWorker',
    'repEventsStatus',
    'repEventsType',
    'repEventsGroupBy',
    'repEventsSearch',
  ].forEach((id) => {
    binding.add(document.getElementById(id), 'keydown', (event) => {
      if (event.key !== 'Enter') {
        return
      }

      void runEventsOperationalReport()
    })
  })
  binding.add(document.getElementById('repHistoryRun'), 'click', () => {
    void runReportHistory()
  })
  ;[
    { inputId: 'repHistoryClientSearch', selectId: 'repHistoryClient', kind: 'client' },
    { inputId: 'repHistoryWorkerSearch', selectId: 'repHistoryWorker', kind: 'worker' },
    { inputId: 'repHistoryZoneSearch', selectId: 'repHistoryZone', kind: 'zone' },
  ].forEach(({ inputId, selectId, kind }) => {
    binding.add(document.getElementById(inputId), 'input', () => {
      reportHistoryApplySelectFilter(kind, { expandOnEmpty: true })
    })
    binding.add(document.getElementById(inputId), 'focus', () => {
      reportHistoryApplySelectFilter(kind, { expandOnEmpty: true })
    })
    binding.add(document.getElementById(inputId), 'blur', () => {
      window.setTimeout(() => {
        reportHistoryMaybeCollapseSelect(kind)
      }, 120)
    })
    binding.add(document.getElementById(inputId), 'keydown', (event) => {
      if (event.key !== 'Enter') {
        return
      }

      void runReportHistory()
    })
    binding.add(document.getElementById(selectId), 'change', () => {
      const select = document.getElementById(selectId)
      const searchInput = document.getElementById(inputId)
      const selectedOption = select?.selectedOptions?.[0]
      if (searchInput && select?.value) {
        searchInput.value = String(selectedOption?.textContent ?? '').trim()
      }
      reportHistoryCollapseSelect(kind)
    })
    binding.add(document.getElementById(selectId), 'blur', () => {
      window.setTimeout(() => {
        reportHistoryMaybeCollapseSelect(kind)
      }, 120)
    })
  })
  binding.add(document.getElementById('repHistoryRangeMonth'), 'change', () => {
    reportHistoryApplyRangeMode('month', { force: true })
  })
  binding.add(document.getElementById('repHistoryRangeWeek'), 'change', () => {
    reportHistoryApplyRangeMode('week', { force: true })
  })
  ;['repHistoryFrom', 'repHistoryTo'].forEach((id) => {
    binding.add(document.getElementById(id), 'keydown', (event) => {
      if (event.key !== 'Enter') {
        return
      }

      void runReportHistory()
    })
  })

  return () => {
    binding.done()
  }
}

function bindSettingsViewFunctions() {
  const binding = createBindingHelpers()

  appState.settingsActiveTab = readStoredSettingsTab()
  settingsRenderStyleStatus()
  settingsRenderStyleCards()
  syncSettingsPermissions()
  settingsSetActiveTab(appState.settingsActiveTab, { persist: false })
  settingsSetCreateNote('')
  settingsRenderImportSummary()
  settingsRenderBackupRows(appState.settingsBackups)
  void settingsRefreshStyleState({ silent: true })

  binding.add(document.getElementById('settingsTabs'), 'click', (event) => {
    const button = event.target.closest('[data-settings-tab]')
    if (!(button instanceof HTMLElement)) {
      return
    }

    const tab = normalizeSettingsTab(button.getAttribute('data-settings-tab'))
    settingsSetActiveTab(tab, { persist: true })

    if (tab === SETTINGS_TAB_BACKUP && canManageBackupSettings()) {
      void settingsLoadBackups({ runAutomation: true }).catch((error) => {
        const message = error instanceof Error ? error.message : 'Nie udalo sie zaladowac kopii zapasowych.'
        showTransientNotice(message, 'error')
      })
    }
  })

  binding.add(document.getElementById('settingsStyleCards'), 'click', (event) => {
    const button = event.target.closest('[data-style-action][data-style-id]')
    if (!(button instanceof HTMLElement)) {
      return
    }

    const action = String(button.getAttribute('data-style-action') ?? '').trim()
    const styleId = String(button.getAttribute('data-style-id') ?? '').trim()
    if (!action) {
      return
    }

    if (action === 'set-user') {
      void settingsApplyUserStyle(styleId)
      return
    }

    if (action === 'clear-user') {
      void settingsClearUserStyle()
      return
    }

    if (action === 'set-org') {
      void settingsApplyOrgDefaultStyle(styleId)
    }
  })

  binding.add(document.getElementById('bkCreateBtn'), 'click', () => {
    void settingsCreateBackup()
  })
  binding.add(document.getElementById('bkInspectBtn'), 'click', () => {
    void settingsInspectImportFile()
  })
  binding.add(document.getElementById('bkImportRestoreBtn'), 'click', () => {
    void settingsRestoreFromFile()
  })
  binding.add(document.getElementById('bkRefreshBtn'), 'click', () => {
    void settingsLoadBackups({ runAutomation: true }).catch((error) => {
      const message = error instanceof Error ? error.message : 'Nie udalo sie odswiezyc listy backupow.'
      showTransientNotice(message, 'error')
    })
  })
  binding.add(document.getElementById('bkRollbackBtn'), 'click', () => {
    void settingsRollbackToPreRestore().catch((error) => {
      const message = error instanceof Error ? error.message : 'Nie udalo sie wykonac rollbacku.'
      showTransientNotice(message, 'error')
    })
  })

  binding.add(document.getElementById('bkImportFile'), 'change', (event) => {
    settingsResetImportState({ clearFile: false })
    settingsRenderImportSummary()

    const input = event.currentTarget
    const file = input instanceof HTMLInputElement ? input.files?.[0] : null
    const summaryNode = document.getElementById('bkImportSummary')
    if (summaryNode && file) {
      summaryNode.textContent = `Wybrano plik: ${file.name}. Kliknij "Sprawdz plik".`
    }
  })

  binding.add(document.getElementById('bkRows'), 'click', (event) => {
    const button = event.target?.closest?.('[data-bk-action][data-bk-id]')
    if (!button) {
      return
    }

    const action = String(button.getAttribute('data-bk-action') ?? '').trim()
    const backupId = String(button.getAttribute('data-bk-id') ?? '').trim()
    if (!action || !backupId) {
      return
    }

    if (action === 'download') {
      void settingsDownloadBackup(backupId).catch((error) => {
        const message = error instanceof Error ? error.message : 'Nie udalo sie pobrac backupu.'
        showTransientNotice(message, 'error')
      })
      return
    }

    if (action === 'restore') {
      void settingsRestoreBackup(backupId).catch((error) => {
        const message = error instanceof Error ? error.message : 'Nie udalo sie przywrocic backupu.'
        showTransientNotice(message, 'error')
      })
      return
    }

    if (action === 'delete') {
      void settingsDeleteBackup(backupId).catch((error) => {
        const message = error instanceof Error ? error.message : 'Nie udalo sie usunac backupu.'
        showTransientNotice(message, 'error')
      })
    }
  })

  return binding.done
}

async function hydrateSections(orgId) {
  const hasLocalSnapshot = dashboardApplyLocalSnapshot(orgId)
  dashboardStartScheduleRefresh(orgId)
  if (!hasLocalSnapshot) {
    dashboardBeginLoading()
  }
  try {
    const { todayRows, recentEvents } = await dashboardLoadFastRows(orgId)
    const summary = dashboardBuildSummary(todayRows, recentEvents.items ?? [], dashboardBuildPeriodHourValues(todayRows))
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
    dashboardWriteLocalSnapshot(orgId, {
      summary,
      todayRows,
      scheduleSourceRows: appState.dashboardScheduleSourceRows,
      comments,
    })
  } finally {
    if (!hasLocalSnapshot) {
      dashboardEndLoading()
    }
  }

  dashboardStartPostLoadRefresh(orgId, { preloadReferences: true })
}

function bindLogin(router) {
  const loginButton = document.getElementById('loginBtn')
  const loginInput = document.getElementById('loginLogin')
  const passwordInput = document.getElementById('loginPass')

  if (!loginButton || !loginInput || !passwordInput) {
    return () => {}
  }

  const handleLogin = async () => {
    stopDashboardAutoRefresh()
    loginButton.disabled = true
    loginButton.textContent = 'Logowanie...'
    setLoginError('')

    try {
      const session = await login({
        login: loginInput.value,
        password: passwordInput.value,
      })
      const normalizedSession = await ensureSessionContext(session)

      if (!normalizedSession?.orgId) {
        throw new Error('Brak orgId w sesji. Sprawdź OrganizationMember w Data Connect.')
      }

      appState.session = normalizedSession
      appState.clientsLoaded = false
      appState.clientModalMode = 'add'
      appState.clientModalClientId = ''
      appState.zonesLoaded = false
      appState.workers = []
      appState.workersLoaded = false
      appState.workerTimeRows = []
      appState.workerTimeViewRows = []
      appState.workerTimeSelectedKeys = new Set()
      appState.workerTimeCurrentPageKeys = []
      appState.workerProfileRows = []
      appState.workerProfileViewRows = []
      appState.workerProfileCurrent = null
      appState.workerProfileModalMode = 'view'
      appState.clientProfileRows = []
      appState.clientProfileCurrent = null
      appState.clientProfileEditMode = false
      appState.eventsFilters = null
      appState.eventsSelectedKeys = new Set()
      appState.eventRows = []
      appState.calendarTasks = []
      appState.calendarRemoteTasksLoaded = false
      appState.calendarRemoteTasksLoading = false
      appState.workerDetailRows = []
      appState.workerDetailSourceRows = []
      appState.workerDetailViewRows = []
      appState.workerDetailSelectedKeys = new Set()
      appState.workerDetailCurrentPageKeys = []
      appState.workerDetailDayEditorItem = null
      appState.workerDetailAckMap = {}
      appState.individualOrdersRows = []
      appState.individualOrdersPage = 1
      appState.individualOrdersTotal = 0
      appState.individualOrdersTotalPages = 1
      appState.individualOrderModalMode = 'add'
      appState.individualOrderCurrentId = ''
      appState.individualOrderQrCurrent = ''
      appState.selectedWorkerLogin = ''
      appState.selectedWorkerName = ''
      appState.reportLastCsv = ''
      appState.reportHistoryTab = 'objects'
      appState.reportHistoryRows = []
      appState.reportHistoryExpanded = {}
      appState.reportHistoryEditableMap = {}
      appState.reportHistoryClientOptions = []
      appState.reportHistoryWorkerOptions = []
      appState.reportHistoryZoneOptions = []
      appState.dashboardMetricDetails = {}
      appState.dashboardMetricValues = {}
      appState.dashboardTodayRows = []
      appState.dashboardScheduleSourceRows = []
      appState.dashboardScheduleLoading = false
      appState.dashboardScheduleError = ''
      appState.dashboardScheduleStale = false
      appState.dashboardBackgroundDataLoaded = false
      appState.dashboardScheduleAlertSnoozeUntil = 0
      appState.dashboardScheduleAlertMuted = false
      appState.dashboardScheduleAlertLastKey = ''
      appState.dashboardScheduleLateShownKeys = new Set()
      appState.dashboardScheduleLatePendingKeys = []
      appState.dashboardLoadingCount = 0
      appState.settingsActiveTab = readStoredSettingsTab()
      appState.settingsEffectiveStyleId = STYLE_FALLBACK_ID
      appState.settingsEffectiveStyleSource = 'fallback'
      appState.settingsOrgStyleId = ''
      appState.settingsUserStyleId = ''
      appState.settingsBackups = []
      appState.settingsImportInspection = null
      appState.settingsAutomationDayKey = ''
      dashboardHideScheduleMissingStartAlert()
      dashboardHideScheduleLateStartAlert()

      showPortal()
      setUserChip(normalizedSession)
      syncSettingsPermissions()
      await settingsRefreshStyleState({ silent: true })
      router.go('dashboard')
      await hydrateSections(normalizedSession.orgId)
      startDashboardAutoRefresh()
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Błąd logowania.')
    } finally {
      loginButton.disabled = false
      loginButton.textContent = 'Zaloguj'
    }
  }

  const handlePasswordKeydown = (event) => {
    if (event.key === 'Enter') {
      handleLogin()
    }
  }

  loginButton.addEventListener('click', handleLogin)
  passwordInput.addEventListener('keydown', handlePasswordKeydown)

  return () => {
    loginButton.removeEventListener('click', handleLogin)
    passwordInput.removeEventListener('keydown', handlePasswordKeydown)
  }
}

function bindLogout() {
  const logoutButton = document.getElementById('logoutBtn')
  if (!logoutButton) {
    return () => {}
  }

  const handleLogout = () => {
    stopDashboardAutoRefresh()
    dashboardHideMetricPopover()
    appState.currentRoute = ''
    appState.session = null
    appState.clients = []
    appState.clientsLoaded = false
    appState.clientModalMode = 'add'
    appState.clientModalClientId = ''
    appState.zones = []
    appState.zonesLoaded = false
    appState.workers = []
    appState.workersLoaded = false
    appState.workerTimeRows = []
    appState.workerTimeViewRows = []
    appState.workerTimeSelectedKeys = new Set()
    appState.workerTimeCurrentPageKeys = []
    appState.workerProfileRows = []
    appState.workerProfileViewRows = []
    appState.workerProfileCurrent = null
    appState.workerProfileModalMode = 'view'
    appState.clientProfileRows = []
    appState.clientProfileCurrent = null
    appState.clientProfileEditMode = false
    appState.eventsFilters = null
    appState.eventsSelectedKeys = new Set()
    appState.eventRows = []
    appState.calendarTasks = []
    appState.calendarRemoteTasksLoaded = false
    appState.calendarRemoteTasksLoading = false
    appState.workerDetailRows = []
    appState.workerDetailSourceRows = []
    appState.workerDetailViewRows = []
    appState.workerDetailSelectedKeys = new Set()
    appState.workerDetailCurrentPageKeys = []
    appState.workerDetailDayEditorItem = null
    appState.workerDetailAckMap = {}
    appState.individualOrdersRows = []
    appState.individualOrdersPage = 1
    appState.individualOrdersTotal = 0
    appState.individualOrdersTotalPages = 1
    appState.individualOrderModalMode = 'add'
    appState.individualOrderCurrentId = ''
    appState.individualOrderQrCurrent = ''
    appState.selectedWorkerLogin = ''
    appState.selectedWorkerName = ''
    appState.reportLastCsv = ''
    appState.reportHistoryTab = 'objects'
    appState.reportHistoryRows = []
    appState.reportHistoryExpanded = {}
    appState.reportHistoryEditableMap = {}
    appState.reportHistoryClientOptions = []
    appState.reportHistoryWorkerOptions = []
    appState.reportHistoryZoneOptions = []
    appState.dashboardMetricDetails = {}
    appState.dashboardMetricValues = {}
    appState.dashboardTodayRows = []
    appState.dashboardScheduleSourceRows = []
    appState.dashboardScheduleLoading = false
    appState.dashboardScheduleError = ''
    appState.dashboardScheduleStale = false
    appState.dashboardBackgroundDataLoaded = false
    appState.dashboardScheduleAlertSnoozeUntil = 0
    appState.dashboardScheduleAlertMuted = false
    appState.dashboardScheduleAlertLastKey = ''
    appState.dashboardScheduleLateShownKeys = new Set()
    appState.dashboardScheduleLatePendingKeys = []
    appState.dashboardLoadingCount = 0
    appState.settingsActiveTab = readStoredSettingsTab()
    appState.settingsEffectiveStyleId = STYLE_FALLBACK_ID
    appState.settingsEffectiveStyleSource = 'fallback'
    appState.settingsOrgStyleId = ''
    appState.settingsUserStyleId = ''
    appState.settingsBackups = []
    appState.settingsImportInspection = null
    appState.settingsAutomationDayKey = ''
    dashboardHideScheduleMissingStartAlert()
    dashboardHideScheduleLateStartAlert()

    logout()
    setUserChip(null)
    syncSettingsPermissions()
    applyPortalTheme(STYLE_FALLBACK_ID)
    showLoginScreen()
  }

  logoutButton.addEventListener('click', handleLogout)

  return () => {
    logoutButton.removeEventListener('click', handleLogout)
  }
}

export function mountPortalApp() {
  const host = document.getElementById('portalAppRoot')
  if (!host) {
    return () => {}
  }

  host.innerHTML = portalLayoutTemplate
  mountViewsFromTemplates()
  applyPortalTheme(STYLE_FALLBACK_ID)
  syncSettingsPermissions()

  const router = createRouter((route) => {
    appState.currentRoute = String(route ?? '').trim()
    if (appState.currentRoute !== 'dashboard') {
      dashboardHideMetricPopover()
      dashboardHideScheduleMissingStartAlert()
      dashboardHideScheduleLateStartAlert()
    }
    if (appState.currentRoute !== 'calendar') {
      calendarTimelineHideStatusAlert()
    }
    dashboardSyncLoadingOverlay()

    if (appState.currentRoute === 'dashboard') {
      renderDashboardKanbanTasks()
      triggerDashboardRefreshIfAllowed()
    }

    if (appState.currentRoute === 'calendar') {
      renderCalendarView()
      void calendarEnsureTimelineWorkerState({ force: true }).catch(() => {})
      deferRouteTaskDataRefresh('calendar', renderCalendarView)
      if (!appState.clientsLoaded) {
        void fetchClientsForCurrentSession(false).then(renderCalendarView).catch(() => {})
      }
      if (!appState.workersLoaded) {
        void fetchWorkersForCurrentSession().then(renderCalendarView).catch(() => {})
      }
      if (!appState.zonesLoaded) {
        void fetchZonesForCurrentSession(false).then(renderCalendarView).catch(() => {})
      }
      return
    }

    if (appState.currentRoute === 'kanban') {
      renderKanbanView()
      deferRouteTaskDataRefresh('kanban', renderKanbanView)
      if (!appState.clientsLoaded) {
        void fetchClientsForCurrentSession(false).then(renderKanbanView).catch(() => {})
      }
      if (!appState.workersLoaded) {
        void fetchWorkersForCurrentSession().then(renderKanbanView).catch(() => {})
      }
      if (!appState.zonesLoaded) {
        void fetchZonesForCurrentSession(false).then(renderKanbanView).catch(() => {})
      }
      return
    }

    if (route === 'clientsList') {
      void fetchClientsForCurrentSession(false)
      return
    }

    if (route === 'events') {
      void fetchEventsForCurrentSession({ applyStoredFilters: true })
      return
    }

    if (route === 'orders') {
      renderOrdersView()
      void ordersWarmLocationSources()
      return
    }

    if (route === 'ordersMap') {
      renderOrdersMapView()
      void ordersWarmLocationSources().then(renderOrdersMapView).catch(() => {})
      if (!appState.workersLoaded) {
        void fetchWorkersForCurrentSession().then(renderOrdersMapView).catch(() => {})
      }
      return
    }

    if (route === 'zones') {
      void fetchZonesForCurrentSession(false)
      return
    }

    if (route === 'workerTime') {
      void fetchWorkersForCurrentSession()
      return
    }

    if (route === 'workerProfile') {
      void fetchWorkerProfilesForCurrentSession(false)
      return
    }

    if (route === 'clientProfile') {
      void fetchClientProfileForCurrentSession(false)
      return
    }

    if (route === 'individualOrders') {
      void fetchIndividualOrdersForCurrentSession({ resetPage: false })
      return
    }

    if (route === 'workerTimeDetail') {
      void fetchWorkerDetailForCurrentSession()
      return
    }

    if (route === 'reports') {
      void ensureReportsViewReady()
      return
    }

    if (route === 'settings' || route === 'settingsStyles' || route === 'settingsBackup') {
      const requestedTab =
        route === 'settingsStyles'
          ? SETTINGS_TAB_STYLES
          : route === 'settingsBackup'
            ? SETTINGS_TAB_BACKUP
            : normalizeSettingsTab(appState.settingsActiveTab || readStoredSettingsTab())
      settingsSetAccessState()
      if (requestedTab === SETTINGS_TAB_BACKUP && !canManageBackupSettings()) {
        settingsSetActiveTab(SETTINGS_TAB_STYLES, { persist: false })
      } else {
        settingsSetActiveTab(requestedTab, { persist: false })
      }
      void settingsRefreshStyleState({ silent: true })
      if (appState.settingsActiveTab === SETTINGS_TAB_BACKUP && canManageBackupSettings()) {
        void settingsLoadBackups({ runAutomation: true }).catch((error) => {
          const message = error instanceof Error ? error.message : 'Nie udalo sie zaladowac kopii zapasowych.'
          showTransientNotice(message, 'error')
        })
      }
    }
  })

  const handleVisibilityChange = () => {
    if (document.visibilityState !== 'visible') {
      dashboardHideScheduleMissingStartAlert()
      dashboardHideScheduleLateStartAlert()
      return
    }
    triggerDashboardRefreshIfAllowed()
    if (appState.currentRoute === 'calendar') {
      void calendarEnsureTimelineWorkerState({ force: true }).catch(() => {})
    }
  }
  document.addEventListener('visibilitychange', handleVisibilityChange)

  const cleanups = [
    bindSidebarCollapseToggle(),
    setupFloatingTableScrollbar(),
    bindSubmenuToggles(),
    bindRouteButtons(router),
    bindCalendarViewFunctions(),
    bindKanbanViewFunctions(),
    bindDashboardViewFunctions(),
    bindLogin(router),
    bindLogout(),
    bindOrdersViewFunctions(),
    bindOrdersMapViewFunctions(),
    bindClientsViewFunctions(),
    bindClientProfileViewFunctions(),
    bindIndividualOrdersViewFunctions(),
    bindEventsViewFunctions(),
    bindZonesViewFunctions(),
    bindWorkerTimeViewFunctions(router),
    bindWorkerTimeDetailViewFunctions(),
    bindWorkerProfileViewFunctions(),
    bindReportsViewFunctions(),
    bindSettingsViewFunctions(),
    () => document.removeEventListener('visibilitychange', handleVisibilityChange),
    calendarStopTimelineWorkerStatusRefresh,
  ]

  const session = requireAuth() ?? getSession()

  if (session) {
    appState.session = session

    showPortal()
    setUserChip(session)
    syncSettingsPermissions()

    void (async () => {
      try {
        const normalizedSession = await ensureSessionContext(session)
        if (!normalizedSession?.orgId) {
          throw new Error('Brak orgId w sesji. Zaloguj się ponownie.')
        }

        appState.session = normalizedSession
        setUserChip(normalizedSession)
        syncSettingsPermissions()
        await settingsRefreshStyleState({ silent: true })
        await hydrateSections(normalizedSession.orgId)
        startDashboardAutoRefresh()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Błąd inicjalizacji sesji.'
        console.error(message)
        stopDashboardAutoRefresh()
        appState.currentRoute = ''
        logout()
        appState.session = null
        appState.clients = []
        appState.clientsLoaded = false
        appState.clientModalMode = 'add'
        appState.clientModalClientId = ''
        appState.zones = []
        appState.zonesLoaded = false
        appState.workers = []
        appState.workersLoaded = false
        appState.workerTimeRows = []
        appState.workerTimeViewRows = []
        appState.workerTimeSelectedKeys = new Set()
        appState.workerTimeCurrentPageKeys = []
        appState.workerProfileRows = []
        appState.workerProfileViewRows = []
        appState.workerProfileCurrent = null
        appState.workerProfileModalMode = 'view'
        appState.clientProfileRows = []
        appState.clientProfileCurrent = null
        appState.clientProfileEditMode = false
        appState.eventsFilters = null
        appState.eventsSelectedKeys = new Set()
        appState.eventRows = []
        appState.workerDetailRows = []
        appState.workerDetailSourceRows = []
        appState.workerDetailViewRows = []
        appState.workerDetailSelectedKeys = new Set()
        appState.workerDetailCurrentPageKeys = []
        appState.workerDetailDayEditorItem = null
        appState.workerDetailAckMap = {}
        appState.individualOrdersRows = []
        appState.individualOrdersPage = 1
        appState.individualOrdersTotal = 0
        appState.individualOrdersTotalPages = 1
        appState.individualOrderModalMode = 'add'
        appState.individualOrderCurrentId = ''
        appState.individualOrderQrCurrent = ''
        appState.reportLastCsv = ''
        appState.reportHistoryTab = 'objects'
        appState.reportHistoryRows = []
        appState.reportHistoryExpanded = {}
        appState.reportHistoryEditableMap = {}
        appState.reportHistoryClientOptions = []
        appState.reportHistoryWorkerOptions = []
        appState.reportHistoryZoneOptions = []
        appState.dashboardMetricDetails = {}
        appState.dashboardMetricValues = {}
        appState.dashboardTodayRows = []
        appState.dashboardScheduleSourceRows = []
        appState.dashboardScheduleLoading = false
        appState.dashboardScheduleError = ''
        appState.dashboardScheduleStale = false
        appState.dashboardBackgroundDataLoaded = false
        appState.dashboardScheduleAlertSnoozeUntil = 0
        appState.dashboardScheduleAlertMuted = false
        appState.dashboardScheduleAlertLastKey = ''
        appState.dashboardScheduleLateShownKeys = new Set()
        appState.dashboardScheduleLatePendingKeys = []
        appState.dashboardLoadingCount = 0
        appState.settingsActiveTab = readStoredSettingsTab()
        appState.settingsEffectiveStyleId = STYLE_FALLBACK_ID
        appState.settingsEffectiveStyleSource = 'fallback'
        appState.settingsOrgStyleId = ''
        appState.settingsUserStyleId = ''
        appState.settingsBackups = []
        appState.settingsImportInspection = null
        appState.settingsAutomationDayKey = ''
        dashboardHideScheduleMissingStartAlert()
        dashboardHideScheduleLateStartAlert()
        showLoginScreen()
        setUserChip(null)
        applyPortalTheme(STYLE_FALLBACK_ID)
        syncSettingsPermissions()
        setLoginError(message)
      }
    })()

    router.go('dashboard')
  } else {
    stopDashboardAutoRefresh()
    appState.currentRoute = ''
    appState.settingsActiveTab = readStoredSettingsTab()
    appState.settingsEffectiveStyleId = STYLE_FALLBACK_ID
    appState.settingsEffectiveStyleSource = 'fallback'
    appState.settingsOrgStyleId = ''
    appState.settingsUserStyleId = ''
    dashboardHideScheduleMissingStartAlert()
    dashboardHideScheduleLateStartAlert()
    showLoginScreen()
    setUserChip(null)
    applyPortalTheme(STYLE_FALLBACK_ID)
    syncSettingsPermissions()
  }

  window.go = router.go

  return () => {
    stopDashboardAutoRefresh()
    dashboardHideScheduleMissingStartAlert()
    dashboardHideScheduleLateStartAlert()
    cleanups.forEach((cleanup) => {
      try {
        cleanup()
      } catch {
        // No-op cleanup safety for dev remounts.
      }
    })

    if (portalNoticeTimer) {
      window.clearTimeout(portalNoticeTimer)
      portalNoticeTimer = null
    }
    document.getElementById('portalNotice')?.remove()

    host.innerHTML = ''
    delete window.go
  }
}

