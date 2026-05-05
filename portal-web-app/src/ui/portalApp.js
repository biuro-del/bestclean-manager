import { ensureSessionContext, login, logout, getSession, requireAuth } from '../auth/authService'
import { getDataSourceLabel } from '../firebase/firebaseClient'
import { createClient, getClients, updateClient } from '../services/clientService'
import {
  createIndividualOrder,
  deleteIndividualOrder,
  getIndividualOrders,
  updateIndividualOrder,
} from '../services/individualOrderService'
import { createWorker, getWorkers, updateWorker } from '../services/workerService'
import { createZone, deleteZone, getZones, updateZone } from '../services/zoneService'
import {
  createEvent,
  createWorkday,
  deleteEvent,
  deleteWorkday,
  getTodayActiveWorkers,
  getTodayWorktimeFingerprint,
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
  eventsSelectedKeys: new Set(),
  eventRows: [],
  calendarTasks: [],
  calendarViewMode: 'week',
  calendarCursorDay: '',
  calendarEditorTaskId: '',
  calendarDragTaskId: '',
  calendarToneFilters: ['blue', 'green', 'amber', 'red'],
  kanbanColumns: [],
  kanbanColumnEditorMode: 'add',
  kanbanColumnEditorId: '',
  kanbanColumnDeleteConfirm: false,
  kanbanSearch: '',
  kanbanDragColumnId: '',
  kanbanDragTaskId: '',
  kanbanPendingStatus: '',
  auditsPage: 1,
  auditsPageSize: 50,
  auditsTotal: 0,
  auditsTotalPages: 1,
  auditsFilters: null,
  auditRows: [],
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
  dashboardScheduleSourceRows: [],
  dashboardScheduleAlertSnoozeUntil: 0,
  dashboardScheduleAlertMuted: false,
  dashboardScheduleAlertLastKey: '',
  dashboardScheduleLateShownKeys: new Set(),
  dashboardScheduleLatePendingKeys: [],
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
let dashboardLastWorktimeToken = ''
let dashboardMetricPopoverHideTimer = null
let dashboardScheduleLimitRaf = 0
let dashboardScheduleLimitTimerA = 0
let dashboardScheduleLimitTimerB = 0
let reportsViewInitPromise = null
let reportGeoPreviewHideTimer = null
let reportHistoryScopedFilter = null
const reportGeoModalState = {
  lat: '',
  lon: '',
  zoom: 18,
}
const DASHBOARD_REFRESH_INTERVAL_MS = 15 * 60 * 1000
const DASHBOARD_SCHEDULE_SOON_WINDOW_MINUTES = 60
const DASHBOARD_SCHEDULE_VISIBLE_WORKERS = 10
const DASHBOARD_LONG_CLEAN_SECONDS = 90 * 60
const DASHBOARD_NEW_COMMENTS_LIMIT = 5
const DASHBOARD_COMMENT_READ_STORAGE_PREFIX = 'portal.dashboardComments.read'
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
const CALENDAR_HOUR_HEIGHT_PX = 72
const CALENDAR_TIMED_TASK_GAP_PX = 6
const CALENDAR_MIN_TIMED_TASK_HEIGHT_PX = 38
const CALENDAR_TIMED_TASK_OVERLAP_OFFSET_PX = 18
const CALENDAR_TONE_OPTIONS = [
  { value: 'blue', label: 'Standard', css: 'blue' },
  { value: 'green', label: 'Gotowe / kontrola', css: 'green' },
  { value: 'amber', label: 'Pilne', css: 'amber' },
  { value: 'red', label: 'Problem', css: 'red' },
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

function kanbanZoneLabel(zone = {}) {
  const view = mapZoneForView(zone)
  return [view.clientName, view.zoneName].filter((value) => value && value !== '-').join(' / ') || String(view.qr ?? '').trim()
}

function kanbanZoneOptions() {
  const seen = new Set()
  return (Array.isArray(appState.zones) ? appState.zones : [])
    .map((zone) => {
      const label = kanbanZoneLabel(zone)
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

function calendarHasAssignedWorkers(workers = []) {
  return calendarSelectionLabels(workers).length > 0
}

function kanbanDefaultStatusForTask(workers = [], preferredStatus = '') {
  const status = String(preferredStatus ?? '').trim()
  if (status) {
    return kanbanNormalizeStatus(status)
  }
  return calendarHasAssignedWorkers(workers) ? kanbanNewPersonTaskStatus() : kanbanDefaultStatus()
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

function kanbanNormalizeStatus(status = '') {
  const value = String(status ?? '').trim()
  return kanbanColumnsForStatus().some((column) => column.id === value) ? value : kanbanDefaultStatus()
}

function calendarNormalizeTask(rawTask = {}) {
  const id = String(rawTask.id ?? '').trim() || `cal-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const dateYmd = /^\d{4}-\d{2}-\d{2}$/.test(String(rawTask.dateYmd ?? '').trim())
    ? String(rawTask.dateYmd).trim()
    : todayYmd()
  const tone = ['blue', 'green', 'amber', 'red'].includes(String(rawTask.tone ?? '').trim())
    ? String(rawTask.tone).trim()
    : 'blue'
  const startTime = calendarNormalizeTimeValue(rawTask.startTime || rawTask.time)
  const endTime = calendarNormalizeTimeValue(rawTask.endTime || rawTask.stopTime || rawTask.timeEnd)
  const workers = calendarNormalizeSelectionList(rawTask.workers ?? rawTask.assignees ?? rawTask.people)
  const objects = calendarNormalizeSelectionList(rawTask.objects ?? rawTask.clients ?? rawTask.sites, rawTask.place)
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
    kanbanStatus: kanbanDefaultStatusForTask(workers, rawTask.kanbanStatus ?? rawTask.status),
    notes: String(rawTask.notes ?? '').trim(),
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

function calendarSaveTasks(tasks = appState.calendarTasks) {
  const normalized = (Array.isArray(tasks) ? tasks : []).map((task) => calendarNormalizeTask(task))
  appState.calendarTasks = calendarSortTasks(normalized)
  try {
    window.localStorage.setItem(calendarStorageKey(), JSON.stringify(appState.calendarTasks))
  } catch {
    showTransientNotice('Nie udało się zapisać kalendarza w przeglądarce.', 'error')
  }
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
    normalized.includes('menedzer') ||
    normalized.includes('menedżer')
  ) {
    return 2
  }

  if (
    normalized.includes('pracownik') ||
    normalized.includes('worker') ||
    normalized.includes('koordynator') ||
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

function canDeleteClients() {
  return roleLevel(appState.session?.role) >= 3
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
          : `<button class="dash-entity-link" type="button" data-dash-history-kind="zones" data-dash-row-index="${rowIndex}">${escapeHtml(zoneLabel)}</button>`
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

function dashboardCollectStartedWorkerStartsForDay(dayKey) {
  const normalizedDayKey = String(dayKey ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDayKey)) {
    return new Map()
  }

  const sourceRows = Array.isArray(appState.dashboardScheduleSourceRows) ? appState.dashboardScheduleSourceRows : []
  if (!sourceRows.length) {
    return new Map()
  }

  const startedMap = new Map()
  sourceRows.forEach((row) => {
    if (dashboardResolveDayKey(row) !== normalizedDayKey) {
      return
    }

    const startIso = toIso(row?.startAt ?? row?.dayStartAt)
    if (!startIso) {
      return
    }
    const startTs = new Date(startIso).getTime()
    if (!Number.isFinite(startTs) || startTs <= 0) {
      return
    }

    const keys = dashboardWorkerAliasKeys(
      row?.workerName ?? row?.name,
      row?.workerLogin ?? row?.login ?? row?.workerId ?? row?.id,
      row?.workerId ?? row?.id,
    )
    keys.forEach((key) => {
      const prevTs = Number(startedMap.get(key) ?? 0)
      if (!prevTs || startTs < prevTs) {
        startedMap.set(key, startTs)
      }
    })
  })

  return startedMap
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
        <button type="button" class="btn2 secondary" data-alert-action="snooze">Za 15 min</button>
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
        appState.dashboardScheduleAlertSnoozeUntil = Date.now() + DASHBOARD_REFRESH_INTERVAL_MS
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
    cardsRoot.innerHTML = '<div class="dash-schedule-empty">Brak danych grafiku dla wybranego dnia.</div>'
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
    if (dayNameNode) dayNameNode.textContent = 'Brak danych'
    if (dayDateNode) dayDateNode.textContent = '-'
    if (syncNode) syncNode.textContent = 'Ostatnia synchronizacja: -'
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
      ? `Ostatnia synchronizacja: ${formatDatePl(fetchedAtIso)} ${formatTime(fetchedAtIso)}`
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

function dashboardResolveZoneLabel(row) {
  return String(row?.zoneName ?? row?.strefa ?? row?.activeZone ?? '').trim() || '-'
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
      clientName: dashboardResolveClientLabel(row),
      zoneName: dashboardResolveZoneLabel(row),
      dayKey: dashboardResolveDayKey(row),
      timestamp: dashboardCommentTimestamp(row, kind),
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

function dashboardBuildSummary(todayRows = [], eventRows = []) {
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

async function deleteClientData(clientId) {
  void clientId
  showTransientNotice('Usuwanie klientów jest wyłączone.', 'error')
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
    pdf.text('Wygenerowano w iClean Portal', pageWidth / 2, pageHeight - 15, { align: 'center' })
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
          : `<button class="events-cell-link" type="button" data-event-history-zone="${index}" title="Pokaz historie strefy">${escapeHtml(zoneLabel)}</button>`
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

async function refreshDashboardWidgets(options = {}) {
  if (!appState.session?.orgId) {
    return
  }

  const rangeFrom = firstDayOfCurrentMonthYmd()
  const rangeTo = todayYmd()
  const [todayActive, recentEvents, todayWorkdays, recentWorkdays, scheduleBoard] = await Promise.all([
    getTodayActiveWorkers(appState.session.orgId),
    getWorkdays(appState.session.orgId, {
      source: 'events',
      fromIso: rangeFrom,
      toIso: rangeTo,
      page: 1,
      pageSize: 100000,
    }).catch(() => ({ items: [] })),
    getWorkdays(appState.session.orgId, {
      source: 'workdays',
      fromIso: rangeTo,
      toIso: rangeTo,
      page: 1,
      pageSize: 100000,
    }).catch(() => ({ items: [] })),
    getWorkdays(appState.session.orgId, {
      source: 'workdays',
      fromIso: rangeFrom,
      toIso: rangeTo,
      page: 1,
      pageSize: 100000,
    }).catch(() => ({ items: [] })),
    getScheduleBoard().catch(() => null),
  ])
  const todayStartSourceRows = [...(recentEvents.items ?? []), ...(todayWorkdays.items ?? [])]
  appState.dashboardScheduleSourceRows = todayStartSourceRows
  const todayRows = dashboardApplyFirstQrStartToday(
    todayActive.items ?? [],
    todayStartSourceRows,
    scheduleBoard?.days ?? appState.dashboardScheduleDays,
  )
  const summary = dashboardBuildSummary(todayRows, recentEvents.items ?? [])
  renderDashboardEvents(todayRows)
  renderDashboardSummary(summary)
  renderDashboardNewComments(dashboardBuildNewComments(recentEvents.items ?? [], recentWorkdays.items ?? []))
  if (scheduleBoard && Array.isArray(scheduleBoard.days)) {
    appState.dashboardScheduleDays = scheduleBoard.days
    appState.dashboardScheduleFetchedAt = String(scheduleBoard.fetchedAtIso ?? '')
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
    appState.dashboardScheduleFetchedAt = ''
  }
  renderDashboardSchedulePanel()

  const explicitToken = String(options.worktimeToken ?? '').trim()
  if (explicitToken) {
    dashboardLastWorktimeToken = explicitToken
  }

  if (options.syncWorktimeToken) {
    try {
      const fingerprint = await getTodayWorktimeFingerprint(appState.session.orgId)
      const token = String(fingerprint?.token ?? '').trim()
      if (token) {
        dashboardLastWorktimeToken = token
      }
    } catch {
      // Keep previous token when probe fails; next interval will try again.
    }
  }

  setDashboardLastRefresh(new Date())
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
  if (saveButton) {
    saveButton.disabled = true
    saveButton.textContent = 'Zapisywanie...'
  }

  try {
    let savedItem = null
    const derivedEndAt = payload.eventKind === 'start' ? null : payload.endAt
    const derivedStartAt = payload.eventKind === 'stop' ? derivedEndAt : payload.startAt
    const derivedDurationSec = payload.eventKind === 'start_stop' ? Number(payload.durationSec ?? 0) : 0
    const derivedStatus = payload.eventKind === 'start' ? 'RUNNING' : 'CLOSED'
    const derivedCloseMarkedAt = payload.eventKind === 'start' ? null : derivedEndAt || null
    const derivedEndReason = eventEndReasonFromKind(payload.eventKind)

    if (appState.eventEditorMode === 'add') {
      savedItem = await createEvent(appState.session.orgId, {
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

      savedItem = await updateEvent(appState.session.orgId, eventId, {
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
    await fetchEventsForCurrentSession({ resetPage: false })
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

  return {
    from: String(from?.value ?? '').trim(),
    to: String(to?.value ?? '').trim(),
    worker: String(worker?.value ?? '').trim(),
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
    worker: raw.worker,
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

function ensureAuditsDefaultDates() {
  const from = document.getElementById('auFrom')
  const to = document.getElementById('auTo')
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

function readAuditsFilterInputs() {
  const from = document.getElementById('auFrom')
  const to = document.getElementById('auTo')
  const worker = document.getElementById('auWorker')
  const zone = document.getElementById('auZone')
  const client = document.getElementById('auClient')
  const status = document.getElementById('auStatus')
  const q = document.getElementById('auQ')

  return {
    from: String(from?.value ?? '').trim(),
    to: String(to?.value ?? '').trim(),
    worker: String(worker?.value ?? '').trim(),
    strefa: String(zone?.value ?? '').trim(),
    pomieszczenie: String(client?.value ?? '').trim(),
    status: String(status?.value ?? '').trim(),
    q: String(q?.value ?? '').trim(),
  }
}

function applyAuditsFilterInputs(filters = {}) {
  const from = document.getElementById('auFrom')
  const to = document.getElementById('auTo')
  const worker = document.getElementById('auWorker')
  const zone = document.getElementById('auZone')
  const client = document.getElementById('auClient')
  const status = document.getElementById('auStatus')
  const q = document.getElementById('auQ')

  if (from) from.value = String(filters.from ?? '')
  if (to) to.value = String(filters.to ?? '')
  if (worker) worker.value = String(filters.worker ?? '')
  if (zone) zone.value = String(filters.strefa ?? '')
  if (client) client.value = String(filters.pomieszczenie ?? '')
  if (status) status.value = String(filters.status ?? '')
  if (q) q.value = String(filters.q ?? '')
}

function fillAuditsClientFilterDatalist() {
  const list = document.getElementById('auClientList')
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

function readAuditsFilters() {
  const raw = readAuditsFilterInputs()

  return {
    source: 'events',
    fromIso: ymdToIsoRangeStart(raw.from),
    toIso: ymdToIsoRangeEnd(raw.to),
    worker: raw.worker,
    strefa: raw.strefa,
    pomieszczenie: raw.pomieszczenie,
    status: raw.status,
    q: raw.q,
    page: appState.auditsPage,
    pageSize: appState.auditsPageSize,
  }
}

function updateAuditsPager(shown) {
  const pageLabel = document.getElementById('auPageLabel')
  const shownLabel = document.getElementById('auShownLabel')
  const prevBtn = document.getElementById('auPrevBtn')
  const nextBtn = document.getElementById('auNextBtn')

  if (pageLabel) {
    pageLabel.textContent = `Strona ${appState.auditsPage} / ${appState.auditsTotalPages}`
  }

  if (shownLabel) {
    shownLabel.textContent = `Wyświetlono: ${shown} · Wszystkie: ${appState.auditsTotal} · Na stronę: ${appState.auditsPageSize}`
  }

  if (prevBtn) {
    prevBtn.disabled = appState.auditsPage <= 1
  }

  if (nextBtn) {
    nextBtn.disabled = appState.auditsPage >= appState.auditsTotalPages
  }
}

function renderAuditsRows(rows) {
  const root = document.getElementById('auRows')
  if (!root) {
    return
  }

  const safeRows = (rows || []).filter(Boolean)
  appState.auditRows = safeRows

  if (!safeRows.length) {
    root.innerHTML = `
      <div class="events-row">
        <div>Brak wyników</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
      </div>
    `
    return
  }

  root.innerHTML = safeRows
    .map((row, index) => {
      const workerLogin = String(row.workerLogin ?? '').trim()
      const workerName = String(row.workerName ?? '').trim()
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
          : `<button class="events-cell-link" type="button" data-audit-history-worker="${index}" title="Pokaz historie osoby">${workerCard}</button>`

      const clientQrCandidate =
        row?.zoneId ??
        row?.roomId ??
        row?.utilityRoomId ??
        row?.dayStartObject ??
        row?.dayStopObject ??
        row?.strefa
      const clientLabel = resolveClientLabelWithQrFallback(
        String(row?.clientName ?? row?.klient ?? '-').trim() || '-',
        clientQrCandidate,
      )
      const clientCell =
        clientLabel === '-'
          ? '-'
          : `<button class="events-cell-link" type="button" data-audit-history-client="${index}" title="Pokaz historie klienta">${escapeHtml(clientLabel)}</button>`

      const zoneLabel = String(row.strefa || row.zoneName || '-').trim() || '-'
      const zoneCell =
        zoneLabel === '-'
          ? '-'
          : `<button class="events-cell-link" type="button" data-audit-history-zone="${index}" title="Pokaz historie strefy">${escapeHtml(zoneLabel)}</button>`

      const startLabel = dashboardClockLabelToHm(row.start, '-')
      const stopLabel = dashboardClockLabelToHm(row.stop, '-')
      const durationLabel = dashboardDurationLabelToHm(row.duration, '00:00')
      const statusLabel = normalizeEventStatus(row.status, Boolean(toIso(row?.endAt)))
      const editCell = canManageEvents()
        ? `
            <button class="event-edit-icon-btn" type="button" data-audit-edit="${index}" aria-label="Edytuj zdarzenie" title="Edytuj zdarzenie">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 20h4l10-10-4-4L4 16v4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                <path d="M13 7l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </button>
          `
        : '-'

      return `
        <div class="events-row">
          <div>${workerCell}</div>
          <div>${clientCell}</div>
          <div>${zoneCell}</div>
          <div>${escapeHtml(row.lokalizacja || '-')}</div>
          <div class="mono">${escapeHtml(row.date || '-')}</div>
          <div class="mono time-start">${escapeHtml(startLabel)}</div>
          <div class="mono time-stop">${escapeHtml(stopLabel)}</div>
          <div class="mono time-duration">${escapeHtml(durationLabel)}</div>
          <div>${escapeHtml(statusLabel)}</div>
          <div>${escapeHtml(row.editedBy || '-')}</div>
          <div>${editCell}</div>
        </div>
      `
    })
    .join('')
}

async function fetchAuditsForCurrentSession({ resetPage = false, applyStoredFilters = false } = {}) {
  const root = document.getElementById('auRows')

  if (!appState.session?.orgId) {
    appState.auditRows = []
    if (root) {
      root.innerHTML = `
        <div class="events-row">
          <div>Brak aktywnej sesji.</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
        </div>
      `
    }
    return
  }

  if (resetPage) {
    appState.auditsPage = 1
  }

  if (applyStoredFilters && appState.auditsFilters) {
    applyAuditsFilterInputs(appState.auditsFilters)
  }

  if (!appState.auditsFilters) {
    ensureAuditsDefaultDates()
  }

  appState.auditsFilters = readAuditsFilterInputs()
  appState.auditRows = []
  appState.auditsTotal = 0
  appState.auditsTotalPages = 1
  appState.auditsPage = 1

  renderAuditsRows([])
  updateAuditsPager(0)
  setSubwelcomeMetric('#view-audits .subwelcome', 0)
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

function getFilteredZones() {
  const qrFilter = String(document.getElementById('znQr')?.value ?? '').trim().toLowerCase()
  const clientFilter = String(document.getElementById('znClient')?.value ?? '').trim().toLowerCase()
  const zoneFilter = String(document.getElementById('znStrefa')?.value ?? '').trim().toLowerCase()
  const locationFilter = String(document.getElementById('znLoc')?.value ?? '').trim().toLowerCase()
  const functionFilter = String(document.getElementById('znFunkcja')?.value ?? '').trim().toLowerCase()
  const editedByFilter = String(document.getElementById('znEditedBy')?.value ?? '').trim().toLowerCase()
  const q = String(document.getElementById('znQ')?.value ?? '').trim().toLowerCase()

  return appState.zones
    .map((zone) => mapZoneForView(zone))
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
    })
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
        <div>${escapeHtml(zone.zoneName)}</div>
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
    setSubwelcomeMetric('#view-zones .subwelcome', zones.length)
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
  addButton.title = allowed ? 'Dodaj nowego pracownika' : 'Brak uprawnień do dodawania pracowników.'
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

  if (mode === 'add') {
    const nextWorkerId = getNextWorkerProfileIdPreview()
    if (modalTitle) modalTitle.textContent = 'Dodaj pracownika'
    if (saveButton) saveButton.textContent = 'Dodaj pracownika'
    if (idLabel) idLabel.textContent = nextWorkerId
    if (addedAtLabel) addedAtLabel.textContent = '-'
    if (editedAtLabel) editedAtLabel.textContent = '-'
    if (editedByLabel) editedByLabel.textContent = appState.session?.name ?? '-'
    if (idInput) idInput.value = nextWorkerId
    if (nameInput) nameInput.value = ''
    if (loginInput) loginInput.value = ''
    if (typeInput) typeInput.value = 'Pracownik'
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
    if (loginInput) loginInput.value = worker?.login || ''
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
  if (newPass || repeatPass) {
    if (newPass !== repeatPass) {
      alert('Hasła nie są takie same.')
      return
    }
  }

  try {
    if (appState.workerProfileModalMode === 'add') {
      await createWorker(appState.session.orgId, payload)
      showTransientNotice('Pracownik został dodany.')
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

  const portrait = document.querySelector('input[name="wtExportOrientation"][value="p"]')
  if (portrait) {
    portrait.checked = true
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
      pdf.setFont('helvetica', 'bold')
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

      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(12)
      pdf.text('Ewidencja pracy pracownika', left, 12)
      pdf.setFontSize(11)
      pdf.text(workerTitle, left, 18)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(9)
      pdf.text(subtitle, left, 23)
      pdf.text(summaryLine, left, 28)

      let y = 35
      drawTableHeader(y)
      y += 6
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8.2)

      group.rows.forEach((row, rowIndex) => {
        if (y > pageHeight - 10) {
          pdf.addPage()
          pdf.setFont('helvetica', 'bold')
          pdf.setFontSize(10)
          pdf.text(`Ewidencja pracy - ${workerTitle} (cd.)`, left, 12)
          pdf.setFont('helvetica', 'normal')
          pdf.setFontSize(8.5)
          pdf.text(`${fromLabel} - ${toLabel}`, left, 17)
          y = 24
          drawTableHeader(y)
          y += 6
          pdf.setFont('helvetica', 'normal')
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
    appState.workerTimeRows = workers
    workerTimeResetSelection()
    filterWorkerTimeTable({ resetPage: true })
  } catch (error) {
    workerTimeResetSelection()
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
    checkbox.checked = true
  })

  const portrait = document.querySelector('input[name="wtdExportOrientation"][value="p"]')
  if (portrait) {
    portrait.checked = true
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
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(12)
    pdf.text(title, left, 12)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.text(subtitle, left, 18)
  }

  const drawTableHead = (topY) => {
    pdf.setFont('helvetica', 'bold')
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
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8.2)

  rows.forEach((row, index) => {
    if (y > pageHeight - 10) {
      pdf.addPage()
      drawHeader('Ewidencja pracy', `${workerLabel} | miesiac: ${month} | strona kontynuacja`)
      y = 26
      drawTableHead(y)
      y += 6
      pdf.setFont('helvetica', 'normal')
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
  reportHistorySetStatus('Wybierz filtr i kliknij "Pokaz historie".')
  reportSetKpiValues()
  reportResetCharts()
  reportSetStatus('Wybierz klienta w panelu A i B, a następnie uruchom porównanie.')
}

function reportHistoryNormalizeTab(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'workers' || normalized === 'zones') {
    return normalized
  }

  return 'objects'
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
      <div><b>Wpisy:</b> ${events} · <b>RUNNING:</b> ${running}</div>
      <div><b>Czas pracy razem:</b> ${durationSecondsToHms(closedSec)}</div>
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
            <td>${escapeHtml(detail.zoneLabel || '-')}</td>
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
            <tr><th>Klient</th><th>Strefa</th><th>Lokalizacja strefy</th><th>Osoba</th><th class="time-start">Godzina start</th><th class="time-stop">Godzina stop</th><th class="ta-right">Czas</th><th class="ta-right">Status</th><th class="ta-right">Edytuj</th></tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `
  }

  if (tab === 'workers') {
    const hasRunning = Number(row?.runningCount ?? 0) > 0
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
            <td>${escapeHtml(detail.zoneLabel || '-')}</td>
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
    const qrStartRow = `
      <tr class="rep-history-marker-row">
        <td>${escapeHtml(qrStartClient)}</td>
        <td>${escapeHtml(qrStartZoneLabel)}</td>
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
        <td>${escapeHtml(qrStopZoneLabel)}</td>
        <td>${reportHistoryGeoCellHtml(qrStopLocationLabel)}</td>
        <td class="time-start">-</td>
        <td class="time-stop">${escapeHtml(row.qrStopLabel || '-')}</td>
        <td class="ta-right">-</td>
        <td class="ta-right">QR STOP</td>
        <td class="ta-right rep-history-edit-cell">${reportHistoryEditButtonHtml(qrStopEditKey)}</td>
      </tr>
    `
    const body = `${hasRunning ? '' : qrStopRow}${detailsBody}${qrStartRow}`

    return `
      <div class="rep-history-detail">
        <table class="rep-history-detail-table">
          <thead>
            <tr><th>Klient</th><th>Strefa</th><th>Lokalizacja strefy</th><th class="time-start">Godzina start</th><th class="time-stop">Godzina stop</th><th class="ta-right">Czas</th><th class="ta-right">Status</th><th class="ta-right">Edytuj</th></tr>
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
          <td>${escapeHtml(detail.zoneLabel || '-')}</td>
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
          <tr><th>Strefa</th><th>Lokalizacja strefy</th><th>Osoba</th><th class="time-start">Godzina start</th><th class="time-stop">Godzina stop</th><th class="ta-right">Czas</th><th class="ta-right">Status</th><th class="ta-right">Edytuj</th></tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `
}

function reportHistoryDayInfoHtml(row) {
  const startValue = String(row?.qrStartLabel ?? '').trim() || '--:--:--'
  const hasRunning = Number(row?.runningCount ?? 0) > 0
  const stopValue = hasRunning ? '--:--:--' : String(row?.qrStopLabel ?? '').trim() || '--:--:--'
  const workValue = durationSecondsToHms(Number(row?.closedSec ?? 0))
  const dayKey = String(row?.dayKey ?? '').trim()
  const canStopDay = hasRunning && Boolean(dayKey) && canManageEvents()
  const stopDayBusy = canStopDay && appState.reportHistoryClosingDayKey === dayKey
  const stopDayButton = canStopDay
    ? `
      <button
        class="btn2 rep-history-stopday-btn"
        type="button"
        data-rep-history-stop-day="${escapeHtml(dayKey)}"
        ${stopDayBusy ? 'disabled' : ''}
      >
        ${stopDayBusy ? 'Zamykanie...' : 'Zakończ dzień (QR STOP)'}
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

function reportHistoryPromptStopDateTime({ dayLabel = '-', workerName = '-', defaultIso = '' } = {}) {
  const fallbackIso = defaultIso || new Date().toISOString()
  const defaultValue = isoToLocalDateTimeInput(fallbackIso)

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
              <label for="repHistoryStopDayInput">Data i godzina zakończenia</label>
              <input
                id="repHistoryStopDayInput"
                type="datetime-local"
                step="60"
                value="${escapeHtml(defaultValue)}"
              />
              <div class="field-hint">Wybierz moment, który ma zostać zapisany jako QR STOP.</div>
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

    const input = overlay.querySelector('#repHistoryStopDayInput')
    const cancelButton = overlay.querySelector('[data-rep-history-stop-cancel]')
    const closeButton = overlay.querySelector('[data-rep-history-stop-close]')
    const confirmButton = overlay.querySelector('[data-rep-history-stop-confirm]')

    const submit = () => {
      const iso = localDateTimeInputToIso(input?.value)
      if (!iso) {
        alert('Podaj poprawną datę i godzinę zakończenia.')
        input?.focus()
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
  if (!runningDetails.length) {
    alert('Brak aktywnych wpisów RUNNING do zamknięcia.')
    return
  }

  const workerSelect = document.getElementById('repHistoryWorker')
  const workerSearch = document.getElementById('repHistoryWorkerSearch')
  const workerLogin = String(workerSelect?.value ?? '').trim()
  const workerName = String(workerSelect?.selectedOptions?.[0]?.textContent ?? workerSearch?.value ?? '').trim() || 'pracownika'
  const dayLabel = formatDatePl(`${normalizedDayKey}T00:00:00.000Z`)
  const selectedEndIso = await reportHistoryPromptStopDateTime({
    dayLabel,
    workerName,
    defaultIso: new Date().toISOString(),
  })
  if (!selectedEndIso) {
    return
  }

  const selectedEndTs = new Date(selectedEndIso).getTime()
  const latestStartTs = runningDetails.reduce((maxTs, detail) => {
    const startIso = toIso(detail?.sourceItem?.startAt ?? detail?.sourceItem?.dayStartAt)
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

    for (const detail of runningDetails) {
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
      const sourceStartAt = toIso(source?.startAt ?? source?.dayStartAt) || nowIso
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
    showTransientNotice(`Dzień zakończony. Zamknięto ${updatedCount} aktywne wpisy.`)
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
  const closedLabel = 'Czas pracy razem'
  const headHtml = `
    <thead>
      <tr>
        <th></th>
        <th>Data</th>
        <th class="ta-right">Wpisy</th>
        <th class="ta-right">${closedLabel}</th>
        <th class="ta-right">RUNNING</th>
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

  if (Boolean(item?.historyMarkerOnly)) {
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
    const isMarkerOnly = Boolean(item?.historyMarkerOnly)
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
      const dayEndForWorkers = hasRunning && isTodayBucket ? Date.now() : bucket.dayEndTs
      const dayRangeSec =
        bucket.dayStartTs && dayEndForWorkers && dayEndForWorkers > bucket.dayStartTs
          ? Math.floor((dayEndForWorkers - bucket.dayStartTs) / 1000)
          : 0
      return {
        ...bucket,
        closedSec: normalizedTab === 'workers' ? dayRangeSec : bucket.closedSec,
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
      const filteredEvents = items.filter((item) =>
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
  }
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
  openReportBuilder('history')
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
  openReportBuilder('history')
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
  reportSetVisible('repHome', false)
  reportSetVisible('repBuilder', true)
  reportResetResults()

  if (kind === 'events') {
    if (title) title.textContent = 'Zestawienie zdarzeń'
    if (subtitle) subtitle.textContent = 'Porównanie panelu A i B dla zamkniętych zdarzeń (strefa i pracownik opcjonalne).'
    reportSetVisible('repEvents', true)
    reportSetVisible('repHistory', false)
    reportSetVisible('repSoon', false)
    reportSetStatus('Wybierz klienta w panelu A i B, strefa i pracownik sa opcjonalne.')
    return
  }

  if (kind === 'history') {
    if (title) title.textContent = 'Historia'
    if (subtitle) subtitle.textContent = 'Historia dnia dla obiektu, osoby lub strefy.'
    reportSetVisible('repEvents', false)
    reportSetVisible('repHistory', true)
    reportSetVisible('repSoon', false)
    reportHistoryApplyAllSelectFilters()
    reportHistorySetTab(appState.reportHistoryTab)
    reportHistoryApplyRangeMode(reportHistoryReadRangeMode(), { force: false })
    reportHistoryResetResults({ clearStatus: false })
    reportHistorySetStatus('Wybierz filtr i kliknij "Pokaz historie".')
    return
  }

  if (title) title.textContent = 'Wkrótce'
  if (subtitle) subtitle.textContent = 'Ten typ zestawienia dodamy w kolejnym etapie.'
  reportSetVisible('repEvents', false)
  reportSetVisible('repHistory', false)
  reportSetVisible('repSoon', true)
}

function closeReportBuilder() {
  reportSetVisible('repBuilder', false)
  reportSetVisible('repHome', true)
  reportSetVisible('repEvents', false)
  reportSetVisible('repHistory', false)
  reportSetVisible('repSoon', false)
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
            return `<td${style}>${escapeHtml(value)}</td>`
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

async function runEventsReportComparison() {
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
    const button = event.target.closest('[data-route]')
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

function calendarTaskMatchesFilter(task = {}) {
  return calendarSelectedToneSet().has(calendarTaskToneValue(task))
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

function calendarTasksForDay(dayKey) {
  return calendarSortTasks(appState.calendarTasks.filter((task) => task.dateYmd === dayKey && calendarTaskMatchesFilter(task)))
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

function calendarTasksForDayAndHour(dayKey, hourValue) {
  const hour = String(hourValue ?? '').trim()
  return calendarTasksForDay(dayKey).filter((task) => calendarTaskHourValue(task) === hour)
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

function calendarTimedTasksForDay(dayKey) {
  return calendarTasksForDay(dayKey)
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

function calendarLayoutTimedTasks(dayKey) {
  const items = calendarTimedTasksForDay(dayKey)
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

function calendarTimedTasksLayerHtml(dayKey) {
  return calendarLayoutTimedTasks(dayKey)
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
  const metaParts = [
    timeRange,
    objects.length ? objects.join(', ') : place,
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
          const tasks = calendarTasksForDayAndHour(dayKey, '')
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
                ${calendarTimedTasksLayerHtml(dayKey)}
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
        placeholder: 'Wpisz nazwę obiektu...',
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
          const taskCount = calendarTasksForDay(dayKey).length
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
  const visibleCount = appState.calendarTasks.filter((task) => calendarTaskMatchesFilter(task)).length
  const totalCount = appState.calendarTasks.length
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

function calendarDayColumnHtml(dayKey, { monthMode = false, wide = false } = {}) {
  const tasks = calendarTasksForDay(dayKey)
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

function renderCalendarView() {
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
    board.className = 'calendar-board calendar-board--month'
    board.innerHTML = `
      <div class="calendar-weekdays">
        ${['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'].map((day) => `<span>${day}</span>`).join('')}
      </div>
      <div class="calendar-month-grid">
        ${days.map((dayKey) => calendarDayColumnHtml(dayKey, { monthMode: true })).join('')}
      </div>
    `
    return
  }

  const start = calendarStartOfWeek(appState.calendarCursorDay)
  const days = Array.from({ length: 7 }, (_, index) => calendarAddDays(start, index))
  board.className = 'calendar-board calendar-board--week'
  board.innerHTML = calendarTimeGridHtml(days)
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
  const titleInput = document.getElementById('calendarTaskTitle')
  const dateInput = document.getElementById('calendarTaskDate')
  const startInput = document.getElementById('calendarTaskTime')
  const endInput = document.getElementById('calendarTaskEndTime')
  const toneInput = document.getElementById('calendarTaskTone')
  const notesInput = document.getElementById('calendarTaskNotes')

  calendarRenderDatalist('workers')
  calendarRenderDatalist('objects')

  if (titleNode) titleNode.textContent = task ? 'Edytuj zadanie' : 'Dodaj zadanie'
  if (deleteButton instanceof HTMLButtonElement) deleteButton.style.display = task ? '' : 'none'
  if (duplicateButton instanceof HTMLButtonElement) duplicateButton.style.display = task ? '' : 'none'
  if (saveButton instanceof HTMLButtonElement) saveButton.textContent = 'Zapisz'
  if (titleInput) titleInput.value = task?.title ?? ''
  if (dateInput) dateInput.value = date
  const startValue = calendarNormalizeTimeValue(task?.startTime ?? task?.time ?? (timeValue == null ? '' : timeValue ? `${pad2(Number(timeValue))}:00` : ''))
  if (startInput) startInput.value = startValue
  const defaultEndValue =
    !task && startValue
      ? calendarMinutesToTime(Math.min((calendarTimeToMinutes(startValue) ?? 0) + 60, 1439))
      : ''
  if (endInput) endInput.value = calendarNormalizeTimeValue(task?.endTime) || defaultEndValue
  if (toneInput) toneInput.value = task?.tone ?? 'blue'
  if (notesInput) notesInput.value = task?.notes ?? ''
  if (document.getElementById('calendarWorkerPickerRows')) {
    calendarSetPickerRows('workers', task?.workers ?? [])
  }
  if (document.getElementById('calendarObjectPickerRows')) {
    calendarSetPickerRows('objects', task?.objects?.length ? task.objects : calendarNormalizeSelectionList([], task?.place ?? ''))
  }

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
  const preferredKanbanStatus = String(existing?.kanbanStatus ?? '').trim() || String(appState.kanbanPendingStatus ?? '').trim()
  const nextTask = calendarNormalizeTask({
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
    kanbanStatus: kanbanDefaultStatusForTask(workers, preferredKanbanStatus),
    notes: String(document.getElementById('calendarTaskNotes')?.value ?? '').trim(),
    updatedAt: new Date().toISOString(),
  })

  const withoutCurrent = appState.calendarTasks.filter((task) => task.id !== nextTask.id)
  calendarSaveTasks([...withoutCurrent, nextTask])
  appState.calendarCursorDay = nextTask.dateYmd
  appState.kanbanPendingStatus = ''
  calendarCloseEditor()
  renderCalendarView()
}

function calendarDeleteEditorTask() {
  const id = String(appState.calendarEditorTaskId ?? '').trim()
  if (!id) {
    return
  }
  calendarSaveTasks(appState.calendarTasks.filter((task) => task.id !== id))
  calendarCloseEditor()
  renderCalendarView()
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
    return { ...task, dateYmd, time: nextTime, startTime: nextTime, endTime: nextEnd, updatedAt: new Date().toISOString() }
  })
  calendarSaveTasks(nextTasks)
  renderCalendarView()
}

function calendarMoveCursor(direction) {
  const dir = direction < 0 ? -1 : 1
  const mode = appState.calendarViewMode
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
  return normalizeSearchText([task.title, task.notes, task.place, people, objects].filter(Boolean).join(' '))
}

function kanbanVisibleTasks() {
  kanbanEnsureState()
  const query = normalizeSearchText(appState.kanbanSearch)
  const tasks = query ? appState.calendarTasks.filter((task) => kanbanTaskSearchText(task).includes(query)) : appState.calendarTasks
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
  const objectLabel = objects.length ? objects.join(', ') : String(task.place ?? '').trim()
  const metaItems = [dateLabel, timeRange, objectLabel].filter(Boolean)
  return `
    <article
      class="kanban-card kanban-card--${escapeHtml(toneMeta.css)}"
      draggable="true"
      tabindex="0"
      role="button"
      data-kanban-task-id="${escapeHtml(task.id)}"
      title="${escapeHtml(title)}"
    >
      <div class="kanban-card-tag">${escapeHtml(toneMeta.label)}</div>
      <h3>${escapeHtml(title)}</h3>
      ${metaItems.length ? `<p class="kanban-card-meta">${escapeHtml(metaItems.join(' · '))}</p>` : ''}
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

function renderKanbanView() {
  const board = document.getElementById('kanbanBoard')
  if (!board) {
    return
  }
  kanbanEnsureState()
  const searchInput = document.getElementById('kanbanSearch')
  if (searchInput && searchInput.value !== appState.kanbanSearch) {
    searchInput.value = appState.kanbanSearch
  }
  const tasks = kanbanVisibleTasks()
  const columns = appState.kanbanColumns
  board.style.setProperty('--kanban-column-count', String(columns.length))
  board.style.minWidth = `${Math.max(560, columns.length * 290 + 210)}px`
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

function kanbanMoveTask(taskId, status) {
  const id = String(taskId ?? '').trim()
  const nextStatus = kanbanNormalizeStatus(status)
  if (!id) {
    return
  }
  const tasks = calendarLoadTasks().map((task) =>
    task.id === id ? { ...task, kanbanStatus: nextStatus, updatedAt: new Date().toISOString() } : task,
  )
  calendarSaveTasks(tasks)
  renderKanbanView()
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
  appState.calendarCursorDay = appState.calendarCursorDay || todayYmd()
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
  binding.add(document.getElementById('kanbanColumnSaveBtn'), 'click', kanbanSaveColumnEditor)
  binding.add(document.getElementById('kanbanColumnCancelBtn'), 'click', kanbanCloseColumnEditor)
  binding.add(document.getElementById('kanbanColumnCloseBtn'), 'click', kanbanCloseColumnEditor)
  binding.add(document.getElementById('kanbanColumnDeleteBtn'), 'click', kanbanDeleteColumnEditor)
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
  binding.add(root, 'click', (event) => {
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
    const card = event.target?.closest?.('[data-kanban-task-id]')
    if (card) {
      kanbanOpenCalendarTask(card.getAttribute('data-kanban-task-id'))
    }
  })
  binding.add(root, 'dragstart', (event) => {
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
    renderCalendarView()
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
    const addPickerButton = event.target?.closest?.('[data-calendar-add-picker]')
    if (addPickerButton) {
      calendarAddPickerRow(addPickerButton.getAttribute('data-calendar-add-picker'))
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
      return
    }
    if (event.target?.id === 'calendarEditorOverlay') {
      calendarCloseEditor()
    }
  })
  binding.add(document.getElementById('calendarEditorCloseBtn'), 'click', calendarCloseEditor)
  binding.add(document.getElementById('calendarTaskCancelBtn'), 'click', calendarCloseEditor)
  binding.add(document.getElementById('calendarTaskSaveBtn'), 'click', calendarSaveEditorTask)
  binding.add(document.getElementById('calendarTaskDeleteBtn'), 'click', calendarDeleteEditorTask)
  binding.add(document.getElementById('calendarTaskDuplicateBtn'), 'click', calendarDuplicateEditorTask)

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
    storageKey: 'portal.grid.events.v2',
    defaultWidths: [36, 108, 97, 97, 103, 96, 82, 82, 92, 92, 108, 52],
    minWidths: [32, 72, 68, 68, 72, 68, 56, 56, 62, 68, 70, 38],
    nonResizableIndexes: [11],
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

function bindAuditsViewFunctions() {
  const binding = createBindingHelpers()
  const cleanupAuditsTableResize = setupResizableGridTable({
    tableSelector: '#view-audits .events-table',
    headSelector: '#view-audits .events-head',
    cssVarName: '--events-grid',
    storageKey: 'portal.grid.audits',
    defaultWidths: [172, 150, 146, 154, 96, 82, 82, 92, 96, 108, 52],
    minWidths: [120, 110, 108, 118, 84, 72, 72, 80, 84, 92, 46],
    nonResizableIndexes: [10],
    autoFitToViewport: true,
    enforceFullWidth: true,
    maxWidth: 680,
  })

  binding.add(document.getElementById('auSearchBtn'), 'click', () => {
    appState.auditsPage = 1
    void fetchAuditsForCurrentSession({ resetPage: false })
  })

  binding.add(document.getElementById('auRefreshBtn'), 'click', () => {
    void fetchAuditsForCurrentSession({ resetPage: false })
  })

  binding.add(document.getElementById('auPrevBtn'), 'click', () => {
    if (appState.auditsPage <= 1) return
    appState.auditsPage -= 1
    void fetchAuditsForCurrentSession()
  })

  binding.add(document.getElementById('auNextBtn'), 'click', () => {
    if (appState.auditsPage >= appState.auditsTotalPages) return
    appState.auditsPage += 1
    void fetchAuditsForCurrentSession()
  })

  binding.add(document.getElementById('auStatus'), 'change', () => {
    appState.auditsPage = 1
    void fetchAuditsForCurrentSession({ resetPage: false })
  })

  ;['auFrom', 'auTo', 'auWorker', 'auZone', 'auClient', 'auQ'].forEach((id) => {
    binding.add(document.getElementById(id), 'keydown', (event) => {
      if (event.key !== 'Enter') return
      appState.auditsPage = 1
      void fetchAuditsForCurrentSession({ resetPage: false })
    })
  })

  binding.add(document.getElementById('auRows'), 'click', (event) => {
    const workerHistoryButton = event.target.closest('[data-audit-history-worker]')
    if (workerHistoryButton) {
      const index = Number(workerHistoryButton.getAttribute('data-audit-history-worker'))
      const row = Number.isInteger(index) ? appState.auditRows[index] : null
      if (row) {
        void openEventHistoryFromRow(row, 'workers')
      }
      return
    }

    const clientHistoryButton = event.target.closest('[data-audit-history-client]')
    if (clientHistoryButton) {
      const index = Number(clientHistoryButton.getAttribute('data-audit-history-client'))
      const row = Number.isInteger(index) ? appState.auditRows[index] : null
      if (row) {
        void openEventHistoryFromRow(row, 'objects')
      }
      return
    }

    const zoneHistoryButton = event.target.closest('[data-audit-history-zone]')
    if (zoneHistoryButton) {
      const index = Number(zoneHistoryButton.getAttribute('data-audit-history-zone'))
      const row = Number.isInteger(index) ? appState.auditRows[index] : null
      if (row) {
        void openEventHistoryFromRow(row, 'zones')
      }
      return
    }

    const editButton = event.target.closest('[data-audit-edit]')
    if (!editButton) {
      return
    }

    if (!canManageEvents()) {
      alert('Brak uprawnień do edycji zdarzeń.')
      return
    }

    const index = Number(editButton.getAttribute('data-audit-edit'))
    const row = Number.isInteger(index) ? appState.auditRows[index] : null
    if (!row) {
      return
    }

    void openEventEditor(row)
  })

  return () => {
    cleanupAuditsTableResize()
    binding.done()
  }
}

function bindZonesViewFunctions() {
  const binding = createBindingHelpers()
  const cleanupZonesTableResize = setupResizableGridTable({
    tableSelector: '#view-zones .zones-table',
    headSelector: '#view-zones .zones-head',
    cssVarName: '--zones-grid',
    storageKey: 'portal.grid.zones',
    defaultWidths: [110, 150, 220, 180, 130, 132, 140, 120],
    minWidths: [64, 76, 100, 90, 72, 78, 78, 68],
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

  return binding.done
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
        reportHistorySetStatus('Wybierz filtr i kliknij "Pokaz historie".')
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
    void runEventsReportComparison()
  })
  binding.add(document.getElementById('repDownloadCsv'), 'click', reportDownloadCsv)
  binding.add(document.getElementById('repA_client'), 'change', () => reportRefreshZoneOptions('A'))
  binding.add(document.getElementById('repB_client'), 'change', () => reportRefreshZoneOptions('B'))
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
  const rangeFrom = firstDayOfCurrentMonthYmd()
  const rangeTo = todayYmd()
  const [clients, workers, zones, todayActive, recentEvents, todayWorkdays, worktimeFingerprint] =
    await Promise.all([
    getClients(orgId),
    getWorkers(orgId),
    getZones(orgId),
    getTodayActiveWorkers(orgId),
    getWorkdays(orgId, {
      source: 'events',
      fromIso: rangeFrom,
      toIso: rangeTo,
      page: 1,
      pageSize: 100000,
    }).catch(() => ({ items: [] })),
    getWorkdays(orgId, {
      source: 'workdays',
      fromIso: rangeTo,
      toIso: rangeTo,
      page: 1,
      pageSize: 100000,
    }).catch(() => ({ items: [] })),
    getTodayWorktimeFingerprint(orgId).catch(() => null),
  ])
  const todayStartSourceRows = [...(recentEvents.items ?? []), ...(todayWorkdays.items ?? [])]
  const todayRows = dashboardApplyFirstQrStartToday(
    todayActive.items ?? [],
    todayStartSourceRows,
    appState.dashboardScheduleDays,
  )
  const summary = dashboardBuildSummary(todayRows, recentEvents.items ?? [])

  appState.clients = clients
  appState.clientsLoaded = true
  appState.workers = workers
  appState.workersLoaded = true
  appState.workerTimeRows = workers
  appState.zones = zones
  appState.zonesLoaded = true

  renderDashboardEvents(todayRows)
  renderDashboardSummary(summary)
  dashboardLastWorktimeToken = String(worktimeFingerprint?.token ?? '').trim()
  filterClientsTable()
  filterZonesTable()
  fillClientProfileCoordinatorOptions()

  setSubwelcomeMetric('#view-clientsList .subwelcome', clients.length)
  setSubwelcomeMetric('#view-clientProfile .subwelcome', clients.length)
  setSubwelcomeMetric('#view-workerTime .subwelcome', workers.length)
  setSubwelcomeMetric('#view-workerProfile .subwelcome', workers.length)
  setSubwelcomeMetric('#view-zones .subwelcome', zones.length)
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
      appState.auditsFilters = null
      appState.auditRows = []
      appState.auditsPage = 1
      appState.auditsTotal = 0
      appState.auditsTotalPages = 1
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
      appState.dashboardScheduleAlertSnoozeUntil = 0
      appState.dashboardScheduleAlertMuted = false
      appState.dashboardScheduleAlertLastKey = ''
      appState.dashboardScheduleLateShownKeys = new Set()
      appState.dashboardScheduleLatePendingKeys = []
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
      await hydrateSections(normalizedSession.orgId)
      startDashboardAutoRefresh()
      router.go('dashboard')
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
    dashboardLastWorktimeToken = ''
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
    appState.auditsFilters = null
    appState.auditRows = []
    appState.auditsPage = 1
    appState.auditsTotal = 0
    appState.auditsTotalPages = 1
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
    appState.dashboardScheduleAlertSnoozeUntil = 0
    appState.dashboardScheduleAlertMuted = false
    appState.dashboardScheduleAlertLastKey = ''
    appState.dashboardScheduleLateShownKeys = new Set()
    appState.dashboardScheduleLatePendingKeys = []
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

    if (appState.currentRoute === 'dashboard') {
      triggerDashboardRefreshIfAllowed()
    }

    if (appState.currentRoute === 'calendar') {
      renderCalendarView()
      return
    }

    if (appState.currentRoute === 'kanban') {
      renderKanbanView()
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

    if (route === 'audits') {
      void fetchAuditsForCurrentSession({ applyStoredFilters: true })
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
    bindClientsViewFunctions(),
    bindClientProfileViewFunctions(),
    bindIndividualOrdersViewFunctions(),
    bindEventsViewFunctions(),
    bindAuditsViewFunctions(),
    bindZonesViewFunctions(),
    bindWorkerTimeViewFunctions(router),
    bindWorkerTimeDetailViewFunctions(),
    bindWorkerProfileViewFunctions(),
    bindReportsViewFunctions(),
    bindSettingsViewFunctions(),
    () => document.removeEventListener('visibilitychange', handleVisibilityChange),
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
        dashboardLastWorktimeToken = ''
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
        appState.auditsFilters = null
        appState.auditRows = []
        appState.auditsPage = 1
        appState.auditsTotal = 0
        appState.auditsTotalPages = 1
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
        appState.dashboardScheduleAlertSnoozeUntil = 0
        appState.dashboardScheduleAlertMuted = false
        appState.dashboardScheduleAlertLastKey = ''
        appState.dashboardScheduleLateShownKeys = new Set()
        appState.dashboardScheduleLatePendingKeys = []
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
    dashboardLastWorktimeToken = ''
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
    dashboardLastWorktimeToken = ''
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

