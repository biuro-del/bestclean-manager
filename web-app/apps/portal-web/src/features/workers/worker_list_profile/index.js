import './style.css'
import template from './template.html?raw'
import { workerBooleanValue, workerBoolLabel } from '../index.js'
import {
  buildWorkTimeEvidencePdf,
  buildWorkTimeEvidenceRowsForWorkers,
  createWorkTimeEvidenceColumns,
  downloadWorkTimeEvidenceCsv,
  downloadWorkTimeEvidencePdf,
  normalizeWorkTimeEvidenceOrientation,
  sanitizeWorkTimeEvidenceFilePart,
  validateWorkTimeEvidenceDateRange,
  workTimeEvidenceErrorMessage,
  workTimeEvidencePreviewPlaceholderHtml,
  workTimeEvidenceSummaryText,
} from '../work_time_evidence_export.js'

export const route = 'workerProfile'
export const viewId = 'view-workerProfile'
export { template }

const WORKER_AVATAR_TONES = [
  'worker-tone-violet',
  'worker-tone-blue',
  'worker-tone-rose',
  'worker-tone-amber',
  'worker-tone-cyan',
  'worker-tone-indigo',
  'worker-tone-green',
  'worker-tone-orange',
]

const WORKER_ROLE_ICONS = {
  admin:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 4.6-2.8 8.2-7 10-4.2-1.8-7-5.4-7-10V6l7-3Z"></path><path d="M9.5 12.5l1.7 1.7 3.6-4.2"></path></svg>',
  coordinator:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="3"></circle><circle cx="6" cy="17" r="2.5"></circle><circle cx="18" cy="17" r="2.5"></circle><path d="M10 9.5 7.5 15"></path><path d="m14 9.5 2.5 5.5"></path></svg>',
  intern:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9l9-4 9 4-9 4-9-4Z"></path><path d="M7 11v5c0 1.4 2.2 3 5 3s5-1.6 5-3v-5"></path><path d="M21 9v5"></path></svg>',
  manager:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7V6a3 3 0 0 1 3-3h2a3 3 0 0 1 3 3v1"></path><path d="M4 8h16v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8Z"></path><path d="M9 13h6"></path></svg>',
  mobile:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17h14"></path><path d="M7 17l2-8h6l2 8"></path><path d="M8 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"></path><path d="M16 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"></path><path d="M10 9V5h4v4"></path></svg>',
  permanent:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"></path><path d="M6 20a6 6 0 0 1 12 0"></path><path d="M18 8l2 2 3-4"></path></svg>',
  worker:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"></path><path d="M6 20a6 6 0 0 1 12 0"></path></svg>',
}

const WORKER_ACTION_ICONS = {
  delete:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"></circle><path d="M3.8 19a5.2 5.2 0 0 1 10.4 0"></path><path d="m17 9 4 4"></path><path d="m21 9-4 4"></path></svg>',
  edit:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="M4 17h16"></path><circle cx="8" cy="7" r="2"></circle><circle cx="16" cy="17" r="2"></circle></svg>',
  eye:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="2.5"></circle></svg>',
  eyeOff:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18"></path><path d="M10.6 10.6A2.5 2.5 0 0 0 13.4 13.4"></path><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6 0 9.5 7 9.5 7a18 18 0 0 1-3.1 4.1"></path><path d="M6.6 6.6A17.6 17.6 0 0 0 2.5 12s3.5 6 9.5 6c1.8 0 3.4-.5 4.8-1.2"></path></svg>',
  more:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>',
  view:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"></rect><circle cx="9" cy="12" r="2.2"></circle><path d="M13.5 10h4"></path><path d="M13.5 14h3"></path><path d="M6.4 16c.7-1.4 4.5-1.4 5.2 0"></path></svg>',
}

const OPTIMISTIC_WORKER_PROFILE_TTL_MS = 15000
const OPTIMISTIC_WORKER_PROFILE_DELETE_TTL_MS = 60000
const DASHBOARD_LOCAL_CACHE_PREFIX = 'portal.dashboard.snapshot.'

export function createWorkerProfileFeature(ctx) {
  const {
    appState,
    canAdministerWorkers,
    canDeleteWorkers,
    canManageWorkers,
    canResetWorkerPasswords,
    createBindingHelpers,
    createWorkerUser,
    dashboardWorkerSurnameDisplayName,
    dashboardWorkerSurnameSortKey,
    deleteWorker,
    durationSecondsToHm,
    ensureJsPdfLoaded,
    ensurePdfUnicodeFont,
    escapeHtml,
    firstDayOfCurrentMonthYmd,
    getTodayActiveWorkers,
    getNextWorkerIdPreview,
    getWorkdays,
    getWorkers,
    normalizeSearchText,
    paginate,
    setPdfUnicodeFont,
    setSubwelcomeMetric,
    setWorkerPassword,
    showTransientNotice,
    todayYmd,
    toIso,
    updateWorker,
    workerDetailComputeRangeSeconds,
    workerDetailDateKeyFromIso,
    workerDetailDateKeyToLabel,
    workerDetailIsoToHm,
    workStatusIntervalFromTimes,
    ymdToIsoRangeEnd,
    ymdToIsoRangeStart,
  } = ctx

  const selectedWorkerProfileKeys = new Set()
  const allowedPageSizes = [50, 100, 200]
  const optimisticWorkerProfilePatches = new Map()
  const optimisticWorkerProfileDeletes = new Map()
  let workerProfileDeleteConfirmResolve = null

  function workerProfileKey(worker) {
    return String(worker?.login ?? worker?.workerLogin ?? worker?.workerId ?? worker?.id ?? '').trim()
  }

  function normalizeWorkerProfileIdentity(value) {
    return String(value ?? '').trim().toLowerCase()
  }

  function addWorkerProfileIdentityKey(keys, value) {
    const key = normalizeWorkerProfileIdentity(value)
    if (!key) {
      return
    }
    keys.add(key)
    if (key.includes('@')) {
      keys.add(key.split('@')[0])
    }
  }

  function workerProfileIdentityKeys(worker) {
    const rawKeys = [
      worker?.login,
      worker?.workerLogin,
      worker?.workerId,
      worker?.id,
      ...(Array.isArray(worker?._workerProfileOptimisticKeys) ? worker._workerProfileOptimisticKeys : []),
    ]
    const keys = new Set()
    rawKeys.forEach((value) => {
      addWorkerProfileIdentityKey(keys, value)
    })
    return keys
  }

  function pruneOptimisticWorkerProfilePatches(now = Date.now()) {
    optimisticWorkerProfilePatches.forEach((record, key) => {
      if (!record || record.expiresAt <= now) {
        optimisticWorkerProfilePatches.delete(key)
      }
    })
  }

  function findOptimisticWorkerProfilePatch(worker) {
    pruneOptimisticWorkerProfilePatches()
    for (const key of workerProfileIdentityKeys(worker)) {
      const record = optimisticWorkerProfilePatches.get(key)
      if (record) {
        return record
      }
    }
    return null
  }

  function clearOptimisticWorkerProfilePatch(record) {
    optimisticWorkerProfilePatches.forEach((value, key) => {
      if (value === record) {
        optimisticWorkerProfilePatches.delete(key)
      }
    })
  }

  function clearOptimisticWorkerProfilePatchesForKeys(keys) {
    const recordsToClear = new Set()
    optimisticWorkerProfilePatches.forEach((record) => {
      if (!record?.keys) {
        return
      }
      for (const key of keys) {
        if (record.keys.has(key)) {
          recordsToClear.add(record)
          return
        }
      }
    })
    recordsToClear.forEach(clearOptimisticWorkerProfilePatch)
  }

  function pruneOptimisticWorkerProfileDeletes(now = Date.now()) {
    optimisticWorkerProfileDeletes.forEach((record, key) => {
      if (!record || record.expiresAt <= now) {
        optimisticWorkerProfileDeletes.delete(key)
      }
    })
  }

  function findOptimisticWorkerProfileDelete(worker) {
    pruneOptimisticWorkerProfileDeletes()
    for (const key of workerProfileIdentityKeys(worker)) {
      const record = optimisticWorkerProfileDeletes.get(key)
      if (record) {
        return record
      }
    }
    return null
  }

  function clearOptimisticWorkerProfileDelete(record) {
    optimisticWorkerProfileDeletes.forEach((value, key) => {
      if (value === record) {
        optimisticWorkerProfileDeletes.delete(key)
      }
    })
  }

  function registerOptimisticWorkerProfileDelete(worker, extraKeys = []) {
    const keys = workerProfileIdentityKeys(worker)
    extraKeys.forEach((value) => addWorkerProfileIdentityKey(keys, value))
    if (!keys.size) {
      return null
    }

    clearOptimisticWorkerProfilePatchesForKeys(keys)
    const record = {
      keys,
      expiresAt: Date.now() + OPTIMISTIC_WORKER_PROFILE_DELETE_TTL_MS,
    }
    keys.forEach((key) => optimisticWorkerProfileDeletes.set(key, record))
    return record
  }

  function applyOptimisticWorkerProfileDeletes(workers) {
    pruneOptimisticWorkerProfileDeletes()
    const rows = []
    const seenDeleteRecords = new Set()

    ;(Array.isArray(workers) ? workers : []).forEach((worker) => {
      const record = findOptimisticWorkerProfileDelete(worker)
      if (record) {
        seenDeleteRecords.add(record)
        return
      }
      rows.push(worker)
    })

    const uniqueRecords = new Set(optimisticWorkerProfileDeletes.values())
    uniqueRecords.forEach((record) => {
      if (record && !seenDeleteRecords.has(record)) {
        clearOptimisticWorkerProfileDelete(record)
      }
    })

    return rows
  }

  function workerProfilePatchText(value) {
    return String(value ?? '').trim().toLowerCase()
  }

  function workerProfilePatchName(worker) {
    return workerProfilePatchText(worker?.workerName ?? worker?.fullName ?? worker?.name)
  }

  function workerProfilePatchRole(worker) {
    return workerProfilePatchText(worker?.role ?? worker?.systemRole)
  }

  function workerProfilePatchWorkerType(worker) {
    return workerProfilePatchText(worker?.workerType ?? worker?.type)
  }

  function workerProfilePatchEmail(worker) {
    return workerProfilePatchText(worker?.email ?? worker?.loginEmail)
  }

  function workerProfilePatchConfirmed(serverWorker, optimisticWorker) {
    const server = normalizeWorkerProfileRow(serverWorker)
    const optimistic = normalizeWorkerProfileRow(optimisticWorker)
    return (
      workerProfilePatchText(server.login ?? server.workerLogin) === workerProfilePatchText(optimistic.login ?? optimistic.workerLogin) &&
      workerProfilePatchName(server) === workerProfilePatchName(optimistic) &&
      workerProfilePatchRole(server) === workerProfilePatchRole(optimistic) &&
      workerProfilePatchWorkerType(server) === workerProfilePatchWorkerType(optimistic) &&
      workerProfilePatchEmail(server) === workerProfilePatchEmail(optimistic) &&
      workerProfilePatchText(server.phone) === workerProfilePatchText(optimistic.phone) &&
      workerProfileBoolean(server, 'active') === workerProfileBoolean(optimistic, 'active')
    )
  }

  function applyOptimisticWorkerProfilePatches(workers) {
    pruneOptimisticWorkerProfilePatches()
    const rowsByKey = new Map()
    const seenRecords = new Set()

    ;(Array.isArray(workers) ? workers : []).forEach((worker, index) => {
      let row = normalizeWorkerProfileRow(worker)
      const record = findOptimisticWorkerProfilePatch(row)
      if (record) {
        if (workerProfilePatchConfirmed(row, record.worker)) {
          clearOptimisticWorkerProfilePatch(record)
        } else {
          row = normalizeWorkerProfileRow({
            ...row,
            ...record.worker,
            _workerProfileOptimisticKeys: [...record.keys],
          })
          seenRecords.add(record)
        }
      }

      const key = workerProfileKey(row) || `row-${index}`
      rowsByKey.set(key, row)
    })

    const uniqueRecords = new Set(optimisticWorkerProfilePatches.values())
    uniqueRecords.forEach((record) => {
      if (!record || record.expiresAt <= Date.now() || seenRecords.has(record)) {
        return
      }

      const hasServerRow = [...rowsByKey.values()].some((row) => {
        for (const key of workerProfileIdentityKeys(row)) {
          if (record.keys.has(key)) {
            return true
          }
        }
        return false
      })
      if (!hasServerRow) {
        const row = normalizeWorkerProfileRow({
          ...record.worker,
          _workerProfileOptimisticKeys: [...record.keys],
        })
        rowsByKey.set(workerProfileKey(row) || `optimistic-${rowsByKey.size}`, row)
      }
    })

    return [...rowsByKey.values()]
  }

  function clearDashboardWorkerSnapshotCache() {
    if (typeof window === 'undefined' || !window.localStorage) return
    try {
      for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const key = window.localStorage.key(index)
        if (String(key ?? '').startsWith(DASHBOARD_LOCAL_CACHE_PREFIX)) {
          window.localStorage.removeItem(key)
        }
      }
    } catch {
      // Local storage can be unavailable in hardened browser profiles.
    }
  }

  function clearWorkerDirectoryStateBeforeFreshRead() {
    clearDashboardWorkerSnapshotCache()
    appState.workersLoaded = false
  }

  function findWorkerProfileRowAfterSave(previousKey, worker) {
    const expectedLogin = normalizeWorkerProfileIdentity(worker?.login ?? worker?.workerLogin)
    const previousLogin = normalizeWorkerProfileIdentity(previousKey)
    const loginChanged = Boolean(expectedLogin && previousLogin && expectedLogin !== previousLogin)
    const lookupKeys = workerProfileIdentityKeys(worker)
    if (!loginChanged) {
      addWorkerProfileIdentityKey(lookupKeys, previousKey)
    }
    return (Array.isArray(appState.workerProfileRows) ? appState.workerProfileRows : []).find((row) => {
      if (loginChanged) {
        return normalizeWorkerProfileIdentity(row?.login ?? row?.workerLogin) === expectedLogin
      }
      const rowKeys = workerProfileIdentityKeys(row)
      return [...lookupKeys].some((key) => rowKeys.has(key))
    }) ?? null
  }

  function isTodayActiveWorkerRunning(worker) {
    const status = String(worker?.status ?? '').trim().toUpperCase()
    if (worker?.isRunning === true || status === 'RUNNING') {
      return true
    }
    if (status === 'CLOSED') {
      return false
    }
    const startAt = String(worker?.startAt ?? worker?.dayStartAt ?? '').trim()
    const endAt = String(worker?.endAt ?? worker?.dayEndAt ?? '').trim()
    return Boolean(startAt && !endAt)
  }

  function buildOnlineWorkerProfileKeys(activeWorkersResult) {
    const items = Array.isArray(activeWorkersResult?.items)
      ? activeWorkersResult.items
      : Array.isArray(activeWorkersResult)
        ? activeWorkersResult
        : []
    const keys = new Set()
    items.filter(isTodayActiveWorkerRunning).forEach((worker) => {
      workerProfileIdentityKeys(worker).forEach((key) => keys.add(key))
    })
    return keys
  }

  function applyWorkerProfileOnlineStatus(workers, activeWorkersResult) {
    const onlineKeys = buildOnlineWorkerProfileKeys(activeWorkersResult)
    return (Array.isArray(workers) ? workers : []).map((worker) => {
      const isOnline = [...workerProfileIdentityKeys(worker)].some((key) => onlineKeys.has(key))
      return normalizeWorkerProfileRow({
        ...worker,
        online: isOnline,
      })
    })
  }

  function workerProfileHash(value) {
    return Array.from(String(value ?? '')).reduce((hash, char) => {
      return (hash * 31 + char.charCodeAt(0)) >>> 0
    }, 7)
  }

  function workerProfileInitials(worker) {
    const source = String(worker?.name ?? worker?.login ?? worker?.workerLogin ?? '').trim()
    if (!source) {
      return 'U'
    }

    const parts = source.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
    }

    return source.slice(0, 2).toUpperCase()
  }

  function workerAvatarTone(worker) {
    const key = workerProfileKey(worker) || worker?.name || ''
    return WORKER_AVATAR_TONES[workerProfileHash(key) % WORKER_AVATAR_TONES.length]
  }

  function workerRoleVisualMeta(roleValue) {
    const normalized = normalizeSearchText(roleValue).toLowerCase()

    if (normalized.includes('admin') || normalized.includes('owner') || normalized.includes('superadmin')) {
      return { className: 'role-tone-admin', iconHtml: WORKER_ROLE_ICONS.admin }
    }

    if (normalized.includes('kierownik') || normalized.includes('manager') || normalized.includes('menager')) {
      return { className: 'role-tone-manager', iconHtml: WORKER_ROLE_ICONS.manager }
    }

    if (normalized.includes('koordynator') || normalized.includes('coordinator')) {
      return { className: 'role-tone-coordinator', iconHtml: WORKER_ROLE_ICONS.coordinator }
    }

    if (normalized.includes('stazysta') || normalized.includes('intern')) {
      return { className: 'role-tone-intern', iconHtml: WORKER_ROLE_ICONS.intern }
    }

    if (normalized.includes('mobil') || normalized.includes('teren')) {
      return { className: 'role-tone-mobile', iconHtml: WORKER_ROLE_ICONS.mobile }
    }

    if (normalized.includes('staly') || normalized.includes('personel')) {
      return { className: 'role-tone-permanent', iconHtml: WORKER_ROLE_ICONS.permanent }
    }

    if (normalized.includes('pracownik') || normalized.includes('worker')) {
      return { className: 'role-tone-worker', iconHtml: WORKER_ROLE_ICONS.worker }
    }

    return { className: 'role-tone-generic', iconHtml: WORKER_ROLE_ICONS.worker }
  }

  function workerProfileRoleLabel(worker) {
    const role = workerProfileAllowedRoleValue(worker?.role ?? worker?.systemRole, {
      isOwner: workerProfileIsOwner(worker),
    })
    return {
      OWNER: 'Owner',
      ADMIN: 'ADMIN',
      MANAGER: 'Manager',
      COORDINATOR: 'Koordynator',
      WORKER: 'Worker',
    }[role] ?? 'Worker'
  }

  function workerProfileBoolean(worker, field) {
    const parsed = workerBooleanValue(worker?.[field])
    return parsed === null ? Boolean(worker?.[field]) : parsed
  }

  function normalizeWorkerProfileRow(worker) {
    const workerType = workerProfileAllowedTypeValue(worker?.workerType ?? worker?.type ?? worker?.role)
    const role = String(worker?.role ?? '').trim() || workerType
    return {
      ...worker,
      role,
      type: workerType,
      workerType,
      active: workerProfileBoolean(worker, 'active'),
      online: workerProfileBoolean(worker, 'online'),
      phone: String(worker?.phone ?? ''),
      email: String(worker?.email ?? worker?.loginEmail ?? ''),
    }
  }

  function applyWorkerProfileRows(workers, { clearSelection = true, resetPage = true } = {}) {
    const rows = Array.isArray(workers) ? workers : []
    appState.workerProfileRows = rows.map(normalizeWorkerProfileRow)
    appState.workers = appState.workerProfileRows.map((item) => ({ ...item }))
    appState.workersLoaded = true
    if (clearSelection) {
      clearWorkerProfileSelection()
    }
    updateWorkerProfileKpis()
    filterWorkerProfileTable({ resetPage })
    setSubwelcomeMetric('#view-workerProfile .subwelcome', appState.workerProfileRows.length)
  }

  function upsertWorkerProfileRow(previousKey, worker) {
    const row = normalizeWorkerProfileRow(worker)
    const nextKey = workerProfileKey(row)
    const previous = String(previousKey ?? '').trim()
    const rows = Array.isArray(appState.workerProfileRows) ? appState.workerProfileRows : []
    const index = rows.findIndex((item) => {
      const key = workerProfileKey(item)
      return (previous && key === previous) || (nextKey && key === nextKey)
    })

    if (index >= 0) {
      appState.workerProfileRows.splice(index, 1, row)
    } else {
      appState.workerProfileRows.push(row)
    }

    appState.workers = appState.workerProfileRows.map((item) => ({ ...item }))
    appState.workersLoaded = true
    if (previous && previous !== nextKey) {
      selectedWorkerProfileKeys.delete(previous)
    }
    if (nextKey) {
      selectedWorkerProfileKeys.delete(nextKey)
    }
    updateWorkerProfileKpis()
    filterWorkerProfileTable({ resetPage: false })
    setSubwelcomeMetric('#view-workerProfile .subwelcome', appState.workerProfileRows.length)
  }

  function removeWorkerProfileRow(workerOrLogin, extraKeys = []) {
    const deleteKeys =
      typeof workerOrLogin === 'object' && workerOrLogin !== null
        ? workerProfileIdentityKeys(workerOrLogin)
        : workerProfileIdentityKeys({ login: workerOrLogin })
    extraKeys.forEach((value) => addWorkerProfileIdentityKey(deleteKeys, value))
    if (!deleteKeys.size) {
      return
    }

    const rows = Array.isArray(appState.workerProfileRows) ? appState.workerProfileRows : []
    appState.workerProfileRows = rows.filter((worker) => {
      for (const key of workerProfileIdentityKeys(worker)) {
        if (deleteKeys.has(key)) {
          return false
        }
      }
      return true
    })
    appState.workers = appState.workerProfileRows.map((item) => ({ ...item }))
    appState.workersLoaded = true
    ;[...selectedWorkerProfileKeys].forEach((key) => {
      if (deleteKeys.has(normalizeWorkerProfileIdentity(key))) {
        selectedWorkerProfileKeys.delete(key)
      }
    })
    updateWorkerProfileKpis()
    filterWorkerProfileTable({ resetPage: false })
    setSubwelcomeMetric('#view-workerProfile .subwelcome', appState.workerProfileRows.length)
  }

  function setTextContent(id, value) {
    const element = document.getElementById(id)
    if (element) {
      element.textContent = String(value)
    }
  }

  function updateWorkerProfileKpis() {
    const rows = Array.isArray(appState.workerProfileRows) ? appState.workerProfileRows : []
    const active = rows.filter((worker) => workerProfileBoolean(worker, 'active')).length
    const online = rows.filter((worker) => workerProfileBoolean(worker, 'online')).length

    setTextContent('wkKpiAll', rows.length)
    setTextContent('wkKpiActive', active)
    setTextContent('wkKpiOnline', online)
    setTextContent('wkKpiInactive', Math.max(0, rows.length - active))
  }

  function syncWorkerProfilePageSizeSelect() {
    const pageSize = allowedPageSizes.includes(Number(appState.workerProfilePageSize))
      ? Number(appState.workerProfilePageSize)
      : 50
    appState.workerProfilePageSize = pageSize

    const select = document.getElementById('wkPageSize')
    if (select) {
      select.value = String(pageSize)
    }
  }

  function visibleWorkerProfileKeys() {
    return (appState.workerProfileViewRows || []).map(workerProfileKey).filter(Boolean)
  }

  function syncWorkerProfileSelectionUi() {
    const visibleKeys = visibleWorkerProfileKeys()
    const selectedVisibleCount = visibleKeys.filter((key) => selectedWorkerProfileKeys.has(key)).length
    const selectAll = document.getElementById('wkSelectAll')

    if (selectAll instanceof HTMLInputElement) {
      selectAll.checked = visibleKeys.length > 0 && selectedVisibleCount === visibleKeys.length
      selectAll.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleKeys.length
      selectAll.disabled = visibleKeys.length === 0
    }
    syncWorkerProfileExportUi()
  }

  function clearWorkerProfileSelection() {
    selectedWorkerProfileKeys.clear()
    syncWorkerProfileSelectionUi()
  }

  function workerProfileExportSkipInactiveSelected() {
    const checkbox = document.getElementById('wkExportSkipInactive')
    return checkbox instanceof HTMLInputElement && checkbox.checked
  }

  function selectedWorkerProfileExportWorkers({ skipInactive = false } = {}) {
    return (appState.workerProfileRows || []).filter((worker) => {
      const key = workerProfileKey(worker)
      return key && selectedWorkerProfileKeys.has(key) && (!skipInactive || workerProfileBoolean(worker, 'active'))
    })
  }

  function workerProfileExportDisplayName(worker = {}) {
    return String(worker.name ?? worker.workerName ?? worker.fullName ?? worker.login ?? worker.workerLogin ?? '').trim()
  }

  function revokeWorkerProfileEvidencePreviewUrl() {
    const url = String(appState.workerProfileEvidencePreviewUrl ?? '').trim()
    if (url) URL.revokeObjectURL(url)
    appState.workerProfileEvidencePreviewUrl = ''
  }

  function syncWorkerProfileExportUi() {
    const skipInactive = workerProfileExportSkipInactiveSelected()
    const workers = selectedWorkerProfileExportWorkers({ skipInactive })
    const count = workers.length
    const names = workers.map(workerProfileExportDisplayName).filter(Boolean)
    setTextContent('wkExportSelectedCount', count)
    setTextContent(
      'wkExportSelectedNames',
      names.length
        ? names.join(', ')
        : skipInactive && selectedWorkerProfileExportWorkers().length
          ? 'Filtr pomija wszystkich zaznaczonych nieaktywnych pracownikow.'
          : 'Zaznacz pracownika z listy.',
    )
    const button = document.getElementById('wkOpenExportBtn')
    if (button instanceof HTMLButtonElement) {
      button.title = count
        ? `Pobierz ewidencje pracy dla: ${names.join(', ')}.`
        : 'Zaznacz co najmniej jednego pracownika.'
    }
  }

  function workerProfileExportDeps() {
    return {
      dashboardWorkerSurnameDisplayName,
      dashboardWorkerSurnameSortKey,
      durationSecondsToHm,
      escapeHtml,
      ensureJsPdfLoaded,
      ensurePdfUnicodeFont,
      getWorkdays,
      normalizeSearchText,
      setPdfUnicodeFont,
      toIso,
      workerDetailComputeRangeSeconds,
      workerDetailDateKeyFromIso,
      workerDetailDateKeyToLabel,
      workerDetailIsoToHm,
      workStatusIntervalFromTimes,
      ymdToIsoRangeEnd,
      ymdToIsoRangeStart,
    }
  }

  function resetWorkerProfileExportRange() {
    const fromInput = document.getElementById('wkExportFrom')
    const toInput = document.getElementById('wkExportTo')
    if (fromInput instanceof HTMLInputElement && !fromInput.value) {
      fromInput.value = firstDayOfCurrentMonthYmd()
    }
    if (toInput instanceof HTMLInputElement && !toInput.value) {
      toInput.value = todayYmd()
    }
  }

  function resetWorkerProfileEvidenceExportOptions() {
    document.querySelectorAll('[data-wk-export-col]').forEach((checkbox) => {
      if (checkbox instanceof HTMLInputElement) {
        checkbox.checked = checkbox.defaultChecked
      }
    })
    const landscape = document.querySelector('input[name="wkExportOrientation"][value="l"]')
    if (landscape instanceof HTMLInputElement) {
      landscape.checked = true
    }
    const skipInactive = document.getElementById('wkExportSkipInactive')
    if (skipInactive instanceof HTMLInputElement) {
      skipInactive.checked = skipInactive.defaultChecked
    }
  }

  function readWorkerProfileExportOptions({ validate = true } = {}) {
    const rawRange = {
      fromYmd: document.getElementById('wkExportFrom')?.value,
      toYmd: document.getElementById('wkExportTo')?.value,
    }
    const range = validate
      ? validateWorkTimeEvidenceDateRange(rawRange, alert)
      : {
          fromYmd: String(rawRange.fromYmd ?? '').trim(),
          toYmd: String(rawRange.toYmd ?? '').trim(),
        }
    if (!range) {
      return null
    }

    const selectedIds = new Set(
      [...document.querySelectorAll('[data-wk-export-col]')]
        .filter((checkbox) => checkbox instanceof HTMLInputElement && checkbox.checked)
        .map((checkbox) => String(checkbox.value ?? '').trim()),
    )
    const deps = workerProfileExportDeps()
    const columns = createWorkTimeEvidenceColumns(deps).filter((column) => selectedIds.has(column.id))
    const orientation = normalizeWorkTimeEvidenceOrientation(
      document.querySelector('input[name="wkExportOrientation"]:checked')?.value,
    )
    const skipInactive = workerProfileExportSkipInactiveSelected()

    return {
      ...range,
      orientation,
      columns,
      skipInactive,
    }
  }

  function workerProfileEvidenceFilenameBase(options) {
    const from = String(options?.fromYmd ?? 'od').trim() || 'od'
    const to = String(options?.toYmd ?? 'do').trim() || 'do'
    return sanitizeWorkTimeEvidenceFilePart(`ewidencja-pracy-pracownicy-${from}-${to}`)
  }

  function setWorkerProfileEvidencePreviewPlaceholder(message = 'Kliknij „Wygeneruj podgląd”, aby zobaczyć plik PDF') {
    revokeWorkerProfileEvidencePreviewUrl()
    const preview = document.getElementById('wkExportPreview')
    const meta = document.getElementById('wkExportPreviewMeta')
    const options = readWorkerProfileExportOptions({ validate: false })
    const workers = selectedWorkerProfileExportWorkers({ skipInactive: options?.skipInactive === true })
    const rows = Array.isArray(appState.workerProfileEvidencePreviewRows) ? appState.workerProfileEvidencePreviewRows : []
    if (meta && options) {
      meta.textContent = workTimeEvidenceSummaryText({
        deps: workerProfileExportDeps(),
        rows,
        columns: options.columns,
        orientation: options.orientation,
        workerCount: workers.length,
      })
    } else if (meta) {
      meta.textContent = `${workers.length} pracownikow - 0 rekordow`
    }
    if (preview) {
      preview.innerHTML = workTimeEvidencePreviewPlaceholderHtml(workerProfileExportDeps(), message)
    }
  }

  async function buildWorkerProfileEvidenceRows(options) {
    const workers = selectedWorkerProfileExportWorkers({ skipInactive: options?.skipInactive === true })
    if (!workers.length) {
      showTransientNotice(
        options?.skipInactive === true && selectedWorkerProfileExportWorkers().length
          ? 'Filtr pomija wszystkich zaznaczonych nieaktywnych pracownikow.'
          : 'Zaznacz co najmniej jednego pracownika.',
        'error',
      )
      return null
    }
    if (!options?.columns?.length) {
      alert('Wybierz co najmniej jedna kolumne do eksportu.')
      return null
    }

    const rows = await buildWorkTimeEvidenceRowsForWorkers({
      deps: workerProfileExportDeps(),
      orgId: appState.session?.orgId,
      workers,
      workerRows: appState.workerProfileRows,
      fromYmd: options.fromYmd,
      toYmd: options.toYmd,
    })
    appState.workerProfileEvidencePreviewRows = rows
    return rows
  }

  function openWorkerProfileEvidenceExportModal() {
    const workers = selectedWorkerProfileExportWorkers()
    if (!workers.length) {
      showTransientNotice('Zaznacz co najmniej jednego pracownika.', 'error')
      return
    }
    resetWorkerProfileExportRange()
    resetWorkerProfileEvidenceExportOptions()
    appState.workerProfileEvidencePreviewRows = []
    syncWorkerProfileExportUi()
    setWorkerProfileEvidencePreviewPlaceholder()
    const overlay = document.getElementById('wkExportOverlay')
    if (overlay) {
      overlay.hidden = false
      overlay.style.display = 'flex'
    }
    document.getElementById('wkOpenExportBtn')?.setAttribute('aria-expanded', 'true')
    window.requestAnimationFrame(() => document.getElementById('wkExportCloseBtn')?.focus?.())
  }

  function closeWorkerProfileEvidenceExportModal(restoreFocus = true) {
    revokeWorkerProfileEvidencePreviewUrl()
    const overlay = document.getElementById('wkExportOverlay')
    const wasOpen = Boolean(overlay && !overlay.hidden)
    if (overlay) {
      overlay.hidden = true
      overlay.style.display = 'none'
    }
    const openButton = document.getElementById('wkOpenExportBtn')
    openButton?.setAttribute('aria-expanded', 'false')
    if (wasOpen && restoreFocus !== false) {
      window.requestAnimationFrame(() => openButton?.focus?.())
    }
  }

  async function renderWorkerProfileEvidencePreview() {
    const options = readWorkerProfileExportOptions()
    const preview = document.getElementById('wkExportPreview')
    const meta = document.getElementById('wkExportPreviewMeta')
    const button = document.getElementById('wkExportPreviewBtn')
    if (!options || !preview) {
      return
    }

    if (button instanceof HTMLButtonElement) {
      button.disabled = true
      button.textContent = 'Generowanie...'
    }
    preview.innerHTML = workTimeEvidencePreviewPlaceholderHtml(workerProfileExportDeps(), 'Generowanie podgladu PDF...')

    try {
      const rows = await buildWorkerProfileEvidenceRows(options)
      if (!rows) {
        setWorkerProfileEvidencePreviewPlaceholder()
        return
      }
      if (!rows.length) {
        showTransientNotice('Brak danych ewidencji do pobrania', 'error')
        setWorkerProfileEvidencePreviewPlaceholder('Brak danych ewidencji do pobrania')
        return
      }

      const pdf = await buildWorkTimeEvidencePdf({
        deps: workerProfileExportDeps(),
        rows,
        columns: options.columns,
        orientation: options.orientation,
        fromYmd: options.fromYmd,
        toYmd: options.toYmd,
        groupByWorker: true,
      })
      revokeWorkerProfileEvidencePreviewUrl()
      const blob = pdf.output('blob')
      const url = URL.createObjectURL(blob)
      appState.workerProfileEvidencePreviewUrl = url
      if (meta) {
        meta.textContent = workTimeEvidenceSummaryText({
          deps: workerProfileExportDeps(),
          rows,
          columns: options.columns,
          orientation: options.orientation,
          workerCount: selectedWorkerProfileExportWorkers({ skipInactive: options.skipInactive }).length,
        })
      }
      preview.innerHTML = `
        <iframe class="wa-export-preview-frame" src="${escapeHtml(url)}" title="Podglad PDF ewidencji pracy"></iframe>
        <div class="wa-export-preview-fallback">
          <a href="${escapeHtml(url)}" target="_blank" rel="noopener">Otworz PDF w nowym oknie</a>
        </div>
      `
    } catch (error) {
      const message = workTimeEvidenceErrorMessage(error)
      preview.innerHTML = workTimeEvidencePreviewPlaceholderHtml(workerProfileExportDeps(), message)
      showTransientNotice(message, 'error')
    } finally {
      if (button instanceof HTMLButtonElement) {
        button.disabled = false
        button.textContent = 'Wygeneruj podgląd'
      }
    }
  }

  async function downloadWorkerProfileEwidencja(format = 'pdf') {
    const options = readWorkerProfileExportOptions()
    if (!options) {
      return
    }
    if (!options.columns.length) {
      alert('Wybierz co najmniej jedna kolumne do eksportu.')
      setWorkerProfileEvidencePreviewPlaceholder('Wybierz co najmniej jedna kolumne do eksportu.')
      return
    }

    const button = document.getElementById(format === 'csv' ? 'wkExportCsvBtn' : 'wkExportPdfBtn')
    const previousText = button instanceof HTMLButtonElement ? button.textContent : ''
    if (button instanceof HTMLButtonElement) {
      button.disabled = true
      button.textContent = format === 'csv' ? 'Generowanie CSV...' : 'Generowanie PDF...'
    }

    try {
      const rows = await buildWorkerProfileEvidenceRows(options)
      if (!rows) {
        return
      }
      if (!rows.length) {
        showTransientNotice('Brak danych ewidencji do pobrania', 'error')
        setWorkerProfileEvidencePreviewPlaceholder('Brak danych ewidencji do pobrania')
        return
      }

      closeWorkerProfileEvidenceExportModal()
      const filenameBase = workerProfileEvidenceFilenameBase(options)
      if (format === 'csv') {
        downloadWorkTimeEvidenceCsv({
          deps: workerProfileExportDeps(),
          rows,
          columns: options.columns,
          filenameBase,
        })
        showTransientNotice(`Pobrano CSV ewidencji. Osoby: ${selectedWorkerProfileExportWorkers({ skipInactive: options.skipInactive }).length}, wpisy: ${rows.length}.`, 'success')
        return
      }

      await downloadWorkTimeEvidencePdf({
        deps: workerProfileExportDeps(),
        rows,
        columns: options.columns,
        orientation: options.orientation,
        fromYmd: options.fromYmd,
        toYmd: options.toYmd,
        groupByWorker: true,
        filenameBase,
      })
      showTransientNotice(`Pobrano PDF ewidencji. Osoby: ${selectedWorkerProfileExportWorkers({ skipInactive: options.skipInactive }).length}, wpisy: ${rows.length}.`, 'success')
    } catch (error) {
      alert(workTimeEvidenceErrorMessage(error))
    } finally {
      if (button instanceof HTMLButtonElement) {
        button.disabled = false
        button.textContent = previousText || (format === 'csv' ? 'Pobierz CSV' : 'Pobierz PDF')
      }
    }
  }

  function workerProfileLocaleCompare(leftValue = '', rightValue = '') {
    return String(leftValue ?? '').trim().localeCompare(String(rightValue ?? '').trim(), 'pl', {
      sensitivity: 'base',
      numeric: true,
    })
  }

  function workerProfileNameSortValue(worker = {}) {
    return String(worker?.name ?? worker?.workerName ?? worker?.login ?? worker?.workerId ?? worker?.id ?? '').trim()
  }

  const WORKER_PROFILE_NAME_SORT_KEYS = new Set(['nameAsc', 'nameDesc', 'surnameAsc', 'surnameDesc'])

  function normalizeWorkerProfileSortKey(sortKey) {
    const normalizedSort = String(sortKey || 'nameAsc').trim()
    return WORKER_PROFILE_NAME_SORT_KEYS.has(normalizedSort) ? normalizedSort : 'nameAsc'
  }

  function workerProfileSurnameSortValue(worker = {}) {
    const fullName = String(worker?.name ?? worker?.workerName ?? '').trim().replace(/\s+/g, ' ')
    if (!fullName) {
      return workerProfileNameSortValue(worker)
    }

    const parts = fullName.split(' ').filter(Boolean)
    if (parts.length <= 1) {
      return fullName
    }

    const surname = parts[parts.length - 1]
    const givenNames = parts.slice(0, -1).join(' ')
    return `${surname} ${givenNames}`.trim()
  }

  function workerProfileIdSortValue(worker = {}) {
    return String(worker?.workerId ?? worker?.id ?? '').trim()
  }

  function workerProfileTieBreak(left = {}, right = {}) {
    return (
      workerProfileLocaleCompare(workerProfileNameSortValue(left), workerProfileNameSortValue(right)) ||
      workerProfileLocaleCompare(workerProfileIdSortValue(left), workerProfileIdSortValue(right)) ||
      workerProfileLocaleCompare(left?.login, right?.login)
    )
  }

  function workerProfileCompareBySort(left = {}, right = {}, sortKey = 'nameAsc') {
    const normalizedSort = normalizeWorkerProfileSortKey(sortKey)
    const byText = (getter, direction = 1) => {
      const compared = workerProfileLocaleCompare(getter(left), getter(right))
      return compared ? compared * direction : workerProfileTieBreak(left, right)
    }
    const byBool = (getter) => {
      const compared = Number(Boolean(getter(right))) - Number(Boolean(getter(left)))
      return compared || workerProfileTieBreak(left, right)
    }

    switch (normalizedSort) {
      case 'nameDesc':
        return byText(workerProfileNameSortValue, -1)
      case 'surnameAsc':
        return byText(workerProfileSurnameSortValue)
      case 'surnameDesc':
        return byText(workerProfileSurnameSortValue, -1)
      case 'idAsc':
        return byText(workerProfileIdSortValue)
      case 'idDesc':
        return byText(workerProfileIdSortValue, -1)
      case 'loginAsc':
        return byText((worker) => worker?.login ?? '')
      case 'loginDesc':
        return byText((worker) => worker?.login ?? '', -1)
      case 'typeAsc':
        return byText((worker) => worker?.workerType ?? worker?.type ?? worker?.role ?? '')
      case 'activeDesc':
        return byBool((worker) => workerProfileBoolean(worker, 'active'))
      case 'onlineDesc':
        return byBool((worker) => workerProfileBoolean(worker, 'online'))
      case 'nameAsc':
      default:
        return byText(workerProfileNameSortValue)
    }
  }

  function setVisibleWorkerProfileSelection(checked) {
    visibleWorkerProfileKeys().forEach((key) => {
      if (checked) {
        selectedWorkerProfileKeys.add(key)
      } else {
        selectedWorkerProfileKeys.delete(key)
      }
    })
    renderWorkerProfileRows(appState.workerProfileViewRows || [])
  }

  function updateWorkerProfilePager(paged) {
    syncWorkerProfilePageSizeSelect()

    const pageLabel = document.getElementById('wkPageLabel')
    const label = document.getElementById('wkShownLabel')
    const prevBtn = document.getElementById('wkPrevBtn')
    const nextBtn = document.getElementById('wkNextBtn')

    if (pageLabel) {
      pageLabel.textContent = `Strona ${paged.page} / ${paged.totalPages}`
    }

    if (label) {
      label.textContent = `Wyświetlono: ${paged.items.length} / ${paged.total} · Na stronie: ${paged.pageSize}`
    }

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
    const sortKey = normalizeWorkerProfileSortKey(document.getElementById('wkSort')?.value || appState.workerProfileSort)
    appState.workerProfileSort = sortKey

    return appState.workerProfileRows.filter((worker) => {
      const workerType = normalizeSearchText(worker.workerType ?? worker.type ?? worker.role)
      if (typeFilter && !workerType.includes(typeFilter)) {
        return false
      }

      if (activeFilter !== null && workerProfileBoolean(worker, 'active') !== activeFilter) {
        return false
      }

      const online = workerProfileBoolean(worker, 'online')
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
        worker.workerType,
        worker.type,
        worker.workerType,
        worker.role,
        worker.phone,
        worker.email,
      ]
        .map((value) => normalizeSearchText(value))
        .join(' ')

      return haystack.includes(q)
    }).sort((left, right) => workerProfileCompareBySort(left, right, sortKey))
  }

  function renderWorkerProfileRows(rows) {
    const root = document.getElementById('wkRows')
    if (!root) {
      return
    }

    appState.workerProfileViewRows = rows

    if (!rows.length) {
      root.innerHTML = `
        <div class="workers-row worker-profile-empty-row">
          <div></div><div>Brak wyników</div><div></div><div></div><div></div><div></div><div></div><div class="worker-profile-actions-spacer" aria-hidden="true"></div><div></div>
        </div>
      `
      syncWorkerProfileSelectionUi()
      return
    }

    const actionLabel = canManageWorkers() ? 'Edytuj' : 'Podgląd'
    root.innerHTML = rows
      .map(
        (worker, index) => {
          const key = workerProfileKey(worker)
          const selected = key && selectedWorkerProfileKeys.has(key)
          const name = worker.name || '-'
          const workerType = worker.workerType || worker.type || '-'
          const workerTypeVisual = workerRoleVisualMeta(workerType)
          const role = workerProfileRoleLabel(worker)
          const roleVisual = workerRoleVisualMeta(role)
          const phone = worker.phone || '-'
          const active = workerProfileBoolean(worker, 'active')
          const online = workerProfileBoolean(worker, 'online')
          const deleteAction = canDeleteWorkers() && !workerProfileIsOwner(worker)
            ? `<button class="worker-profile-action-icon worker-profile-action-delete" type="button" data-worker-profile-delete-index="${index}" title="Usuń" aria-label="Usuń pracownika">${WORKER_ACTION_ICONS.delete}</button>`
            : ''

          return `
        <div class="workers-row ${selected ? 'is-selected' : ''}">
          <div class="worker-profile-select-cell">
            <input type="checkbox" data-worker-profile-select="${index}" ${selected ? 'checked' : ''} aria-label="Zaznacz ${escapeHtml(name)}" />
          </div>
          <div>
            <div class="worker-profile-user-cell">
              <span class="worker-profile-avatar ${workerAvatarTone(worker)}">${escapeHtml(workerProfileInitials(worker))}</span>
              <span class="worker-profile-user-copy">
                <strong>${escapeHtml(name)}</strong>
              </span>
            </div>
          </div>
          <div>
            <div class="worker-profile-role-cell">
              <span class="worker-profile-role-icon ${workerTypeVisual.className}">${workerTypeVisual.iconHtml}</span>
              <strong>${escapeHtml(workerType)}</strong>
            </div>
          </div>
          <div>
            <div class="worker-profile-role-cell">
              <span class="worker-profile-role-icon ${roleVisual.className}">${roleVisual.iconHtml}</span>
              <strong>${escapeHtml(role)}</strong>
            </div>
          </div>
          <div><span class="worker-profile-contact-cell">${escapeHtml(phone)}</span></div>
          <div><span class="worker-profile-status ${active ? 'is-active' : 'is-inactive'}">${active ? 'Active' : 'Inactive'}</span></div>
          <div><span class="worker-profile-online ${online ? 'is-online' : 'is-offline'}">${online ? 'Online' : 'Offline'}</span></div>
          <div class="worker-profile-actions-spacer" aria-hidden="true"></div>
          <div class="workers-actions">
            <button class="worker-profile-action-icon worker-profile-action-view" type="button" data-worker-account-index="${index}" title="Widok konta" aria-label="Widok konta pracownika">${WORKER_ACTION_ICONS.view}</button>
            <button class="worker-profile-action-icon worker-profile-action-edit" type="button" data-worker-profile-index="${index}" title="${actionLabel}" aria-label="${actionLabel} pracownika">${WORKER_ACTION_ICONS.edit}</button>
            ${deleteAction}
          </div>
        </div>
      `
        },
      )
      .join('')
    syncWorkerProfileSelectionUi()
  }

  function setWorkerProfileModalReadOnly(readOnly) {
    const hint = document.getElementById('wkReadOnlyHint')
    if (hint) {
      hint.style.display = readOnly ? 'block' : 'none'
    }

    ;['wkEditName', 'wkEditEmail', 'wkEditRole', 'wkEditType', 'wkEditActive', 'wkEditPhone', 'wkNewPass', 'wkNewPass2'].forEach(
      (id) => {
        const input = document.getElementById(id)
        if (input) {
          input.disabled = readOnly
        }
      },
    )

    const idInput = document.getElementById('wkEditId')
    if (idInput instanceof HTMLInputElement) {
      const addMode = appState.workerProfileModalMode === 'add'
      idInput.disabled = true
      idInput.readOnly = true
      idInput.title = addMode
        ? 'Finalne ID potwierdza backend podczas tworzenia pracownika.'
        : 'ID istniejacego pracownika jest zablokowane.'
    }

    const numberInput = document.getElementById('wkEditNumber')
    if (numberInput instanceof HTMLInputElement) {
      const canOverrideNumber =
        appState.workerProfileModalMode === 'add' &&
        canDeleteWorkers() &&
        !readOnly
      numberInput.disabled = !canOverrideNumber
      numberInput.readOnly = !canOverrideNumber
      numberInput.title = canOverrideNumber
        ? 'ADMIN lub OWNER moze zmienic tylko koncowy numer ID.'
        : 'Koncowy numer ID jest nadawany automatycznie przez backend.'
    }

    const emailInput = document.getElementById('wkEditEmail')
    if (emailInput) {
      emailInput.disabled = readOnly
      emailInput.readOnly = readOnly
      emailInput.title = readOnly ? '' : 'Na ten adres pracownik będzie się logował.'
    }

    const roleInput = document.getElementById('wkEditRole')
    if (roleInput instanceof HTMLSelectElement) {
      const isOwner = workerProfileIsOwner(appState.workerProfileCurrent)
      roleInput.disabled = readOnly || isOwner || !canAdministerWorkers()
      if (isOwner) roleInput.value = 'OWNER'
      syncWorkerProfileRoleHelp()
    }

    const saveButton = document.getElementById('wkSaveBtn')
    if (saveButton) {
      saveButton.style.display = readOnly ? 'none' : ''
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

  function workerProfileIdPrefix() {
    return `worker_${String(appState.session?.orgId ?? '').trim()}_`
  }

  function getNextWorkerProfileNumberPreview() {
    const prefix = workerProfileIdPrefix()
    let maxNumber = 0

    appState.workerProfileRows.forEach((worker) => {
      const raw = String(worker?.workerId ?? worker?.id ?? '').trim()
      if (!raw.startsWith(prefix)) {
        return
      }
      const suffix = raw.slice(prefix.length)
      if (!/^[1-9]\d*$/.test(suffix)) {
        return
      }
      const numeric = Number.parseInt(suffix, 10)
      if (Number.isFinite(numeric) && numeric > maxNumber) {
        maxNumber = numeric
      }
    })

    return maxNumber + 1
  }

  function syncWorkerProfileIdComposer() {
    const prefix = workerProfileIdPrefix()
    const numberInput = document.getElementById('wkEditNumber')
    const idInput = document.getElementById('wkEditId')
    const idLabel = document.getElementById('wkIdLabel')
    const prefixLabel = document.getElementById('wkEditIdPrefix')
    const rawNumber = String(numberInput?.value ?? '').trim()
    const workerId = /^[1-9]\d*$/.test(rawNumber) ? `${prefix}${rawNumber}` : ''

    if (prefixLabel) prefixLabel.textContent = prefix
    if (idInput instanceof HTMLInputElement) idInput.value = workerId
    if (idLabel) idLabel.textContent = workerId || '-'
    return workerId
  }

  async function refreshWorkerProfileIdPreview() {
    const numberInput = document.getElementById('wkEditNumber')
    if (!(numberInput instanceof HTMLInputElement) || appState.workerProfileModalMode !== 'add') {
      return
    }
    try {
      const preview = await getNextWorkerIdPreview(appState.session?.orgId)
      if (appState.workerProfileModalMode !== 'add' || numberInput.dataset.manual === '1') {
        return
      }
      numberInput.value = String(preview.workerNumber)
      syncWorkerProfileIdComposer()
    } catch (error) {
      console.warn('[worker-profile] worker ID preview unavailable', error)
    }
  }

  const WORKER_PROFILE_DEFAULT_ROLE = 'WORKER'
  const WORKER_PROFILE_DEFAULT_TYPE = 'Stały personel na obiekcie'
  const WORKER_PROFILE_ROLE_DESCRIPTIONS = {
    OWNER: 'Pełny dostęp. Rola wyłącznie dla założyciela organizacji i nie można jej zmienić.',
    ADMIN: 'Pełny dostęp: podgląd, dodawanie, edycja i usuwanie.',
    MANAGER: 'Może przeglądać, dodawać i edytować, ale nie może usuwać.',
    COORDINATOR: 'Może logować się do portalu wyłącznie w trybie podglądu.',
    WORKER: 'Dostęp wyłącznie do aplikacji mobilnej; bez dostępu do portalu.',
  }
  const workerProfileAllowedTypeOptionsHtml = `
        <option value="Administrator">Administrator</option>
        <option value="Pracownik Biurowy">Pracownik Biurowy</option>
        <option value="Stały personel na obiekcie">Stały personel na obiekcie</option>
        <option value="Zespół Mobilny">Zespół Mobilny</option>
      `

  function workerProfileIsOwner(worker = null) {
    const role = String(worker?.role ?? worker?.systemRole ?? '').trim().toUpperCase()
    return Boolean(worker?.isOwner || role === 'OWNER')
  }

  function workerProfileAllowedRoleValue(value, { isOwner = false } = {}) {
    if (isOwner) return 'OWNER'
    const normalized = normalizeSearchText(value).toLowerCase()
    if (normalized.includes('owner') || normalized.includes('wlasciciel')) return 'OWNER'
    if (normalized.includes('admin') || normalized.includes('superadmin')) return 'ADMIN'
    if (normalized.includes('manager') || normalized.includes('menager') || normalized.includes('menedzer') || normalized.includes('kierownik')) return 'MANAGER'
    if (normalized.includes('koordynator') || normalized.includes('coordynator') || normalized.includes('coordinator')) return 'COORDINATOR'
    return 'WORKER'
  }

  function syncWorkerProfileRoleHelp() {
    const roleInput = document.getElementById('wkEditRole')
    const help = document.getElementById('wkEditRoleHelp')
    const role = workerProfileAllowedRoleValue(roleInput?.value, {
      isOwner: workerProfileIsOwner(appState.workerProfileCurrent),
    })
    const description = WORKER_PROFILE_ROLE_DESCRIPTIONS[role] ?? ''
    if (help) help.textContent = description
    if (roleInput instanceof HTMLSelectElement) roleInput.title = description
  }

  function workerProfileAllowedTypeValue(value, fallback = WORKER_PROFILE_DEFAULT_TYPE) {
    const normalized = normalizeSearchText(value).toLowerCase()
    if (!normalized) {
      return fallback
    }
    if (normalized.includes('admin') || normalized.includes('owner') || normalized.includes('superadmin')) return 'Administrator'
    if (
      normalized.includes('biurow') ||
      normalized.includes('koordynator') ||
      normalized.includes('coordynator') ||
      normalized.includes('coordinator') ||
      normalized.includes('manager') ||
      normalized.includes('menager') ||
      normalized.includes('menedzer') ||
      normalized.includes('kierownik')
    ) {
      return 'Pracownik Biurowy'
    }
    if (normalized.includes('mobil') || normalized.includes('zespol')) {
      return 'Zespół Mobilny'
    }
    if (normalized.includes('staly') || normalized.includes('personel') || normalized.includes('obiekt')) {
      return 'Stały personel na obiekcie'
    }
    return fallback
  }

  let workerProfileDefaultTypeOptionsHtml = ''

  function configureWorkerProfileRoleOptions(roleInput, typeInput, mode, worker = null) {
    if (!(roleInput instanceof HTMLSelectElement) || !(typeInput instanceof HTMLSelectElement)) {
      return
    }

    if (!workerProfileDefaultTypeOptionsHtml) {
      workerProfileDefaultTypeOptionsHtml = typeInput.innerHTML
    }

    if (typeInput.innerHTML !== workerProfileAllowedTypeOptionsHtml) {
      typeInput.innerHTML = workerProfileAllowedTypeOptionsHtml
    }

    if (mode === 'add') {
      roleInput.value = WORKER_PROFILE_DEFAULT_ROLE
      typeInput.value = WORKER_PROFILE_DEFAULT_TYPE
      syncWorkerProfileRoleHelp()
      return
    }

    roleInput.value = workerProfileAllowedRoleValue(worker?.role ?? worker?.systemRole, {
      isOwner: workerProfileIsOwner(worker),
    })
    typeInput.value = workerProfileAllowedTypeValue(typeInput.value)
    syncWorkerProfileRoleHelp()
  }

  function normalizeWorkerEmailInput(value) {
    return String(value ?? '').trim().toLowerCase()
  }

  function isValidWorkerEmail(value) {
    const email = normalizeWorkerEmailInput(value)
    return Boolean(email && email.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  }

  function getWorkerProfileCurrentLogin() {
    return String(appState.workerProfileCurrent?.login ?? appState.workerProfileCurrent?.workerLogin ?? '').trim()
  }

  function readWorkerProfileActiveValue(worker = null) {
    const parsed = workerBooleanValue(document.getElementById('wkEditActive')?.value)
    if (parsed !== null) {
      return parsed
    }

    if (typeof worker?.active === 'boolean') {
      return worker.active
    }

    const currentParsed = workerBooleanValue(worker?.active)
    if (currentParsed !== null) {
      return currentParsed
    }

    return Boolean(worker?.active ?? true)
  }

  function clearWorkerProfilePasswordError() {
    const error = document.getElementById('wkPasswordError')
    if (error) {
      error.textContent = ''
      error.hidden = true
    }
    ;['wkNewPass', 'wkNewPass2'].forEach((id) => {
      document.getElementById(id)?.removeAttribute('aria-invalid')
    })
  }

  function clearWorkerProfileBasicError() {
    const error = document.getElementById('wkBasicError')
    if (error) {
      error.textContent = ''
      error.hidden = true
    }
    ;['wkEditId', 'wkEditNumber', 'wkEditName', 'wkEditEmail', 'wkEditRole', 'wkEditType'].forEach((id) => {
      document.getElementById(id)?.removeAttribute('aria-invalid')
    })
  }

  function setWorkerProfileBasicError(message, focusId = 'wkEditName') {
    const text = String(message ?? '').trim()
    const error = document.getElementById('wkBasicError')
    if (error) {
      error.textContent = text
      error.hidden = !text
    }
    if (!text) {
      return
    }

    const target = document.getElementById(focusId)
    if (target instanceof HTMLElement) {
      target.setAttribute('aria-invalid', 'true')
      target.focus()
    }
  }

  function setWorkerProfilePasswordError(message, focusId = 'wkNewPass') {
    const text = String(message ?? '').trim()
    const error = document.getElementById('wkPasswordError')
    if (error) {
      error.textContent = text
      error.hidden = !text
    }
    if (!text) {
      return
    }

    const target = document.getElementById(focusId)
    if (target instanceof HTMLElement) {
      target.setAttribute('aria-invalid', 'true')
      target.focus()
    }
  }

  function updateWorkerProfilePasswordToggle(inputId) {
    const input = document.getElementById(inputId)
    const button = document.querySelector(`[data-worker-password-toggle="${inputId}"]`)
    if (!(input instanceof HTMLInputElement) || !(button instanceof HTMLButtonElement)) {
      return
    }

    const visible = input.type === 'text'
    const label = visible ? 'Ukryj hasło' : 'Pokaż hasło'
    button.innerHTML = visible ? WORKER_ACTION_ICONS.eye : WORKER_ACTION_ICONS.eyeOff
    button.setAttribute('aria-label', label)
    button.setAttribute('title', label)
    button.classList.toggle('is-visible', visible)
  }

  function setWorkerProfilePasswordVisibility(inputId, visible = false) {
    const input = document.getElementById(inputId)
    if (!(input instanceof HTMLInputElement)) {
      return
    }
    input.type = visible ? 'text' : 'password'
    updateWorkerProfilePasswordToggle(inputId)
  }

  function resetWorkerProfilePasswordVisibility() {
    ;['wkNewPass', 'wkNewPass2'].forEach((inputId) => setWorkerProfilePasswordVisibility(inputId, false))
  }

  function toggleWorkerProfilePasswordVisibility(inputId) {
    const input = document.getElementById(inputId)
    if (!(input instanceof HTMLInputElement)) {
      return
    }
    setWorkerProfilePasswordVisibility(inputId, input.type === 'password')
    input.focus()
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
    const idComposer = document.getElementById('wkEditIdComposer')
    const idNumberInput = document.getElementById('wkEditNumber')
    const idHint = document.getElementById('wkEditIdHint')
    const nameInput = document.getElementById('wkEditName')
    const roleInput = document.getElementById('wkEditRole')
    const typeInput = document.getElementById('wkEditType')
    const activeInput = document.getElementById('wkEditActive')
    const onlineInput = document.getElementById('wkOnlineNow')
    const emailInput = document.getElementById('wkEditEmail')
    const phoneInput = document.getElementById('wkEditPhone')
    const newPassInput = document.getElementById('wkNewPass')
    const newPass2Input = document.getElementById('wkNewPass2')
    const newPassWrap = document.getElementById('wkNewPassWrap')
    const newPass2Wrap = document.getElementById('wkNewPass2Wrap')
    const passwordSectionTitle = document.getElementById('wkPasswordSectionTitle')
    const newPassLabel = document.querySelector('label[for="wkNewPass"]')
    const newPass2Label = document.querySelector('label[for="wkNewPass2"]')
    const deleteButton = document.getElementById('wkDeleteBtn')
    const saveButton = document.getElementById('wkSaveBtn')

    const headerLogo = document.querySelector('.header .logo-block img')
    const modalLogo = document.getElementById('wkLogo')
    if (modalLogo && headerLogo?.getAttribute('src')) {
      modalLogo.setAttribute('src', headerLogo.getAttribute('src'))
    }

    configureWorkerProfileRoleOptions(roleInput, typeInput, mode, worker)

    if (mode === 'add') {
      const nextWorkerNumber = getNextWorkerProfileNumberPreview()
      const nextWorkerId = `${workerProfileIdPrefix()}${nextWorkerNumber}`
      if (modalTitle) modalTitle.textContent = 'Dodaj użytkownika'
      if (saveButton) saveButton.textContent = 'Dodaj użytkownika'
      if (idLabel) idLabel.textContent = nextWorkerId
      if (addedAtLabel) addedAtLabel.textContent = '-'
      if (editedAtLabel) editedAtLabel.textContent = '-'
      if (editedByLabel) editedByLabel.textContent = appState.session?.name ?? '-'
      if (idInput) {
        idInput.value = nextWorkerId
        idInput.hidden = true
      }
      if (idComposer) idComposer.hidden = false
      if (idNumberInput instanceof HTMLInputElement) {
        idNumberInput.value = String(nextWorkerNumber)
        idNumberInput.dataset.manual = '0'
      }
      if (idHint) {
        idHint.textContent = canDeleteWorkers()
          ? 'Prefiks jest zablokowany. Możesz zmienić wyłącznie dodatni numer końcowy.'
          : 'Numer jest nadawany automatycznie. Finalne ID potwierdzi backend.'
      }
      syncWorkerProfileIdComposer()
      void refreshWorkerProfileIdPreview()
      if (nameInput) nameInput.value = ''
      if (roleInput) roleInput.value = WORKER_PROFILE_DEFAULT_ROLE
      if (typeInput) typeInput.value = WORKER_PROFILE_DEFAULT_TYPE
      if (activeInput) activeInput.value = '1'
      if (onlineInput) onlineInput.value = 'NIE'
      if (emailInput) {
        emailInput.value = ''
        emailInput.placeholder = 'np. jan.kowalski@gmail.com'
      }
      if (phoneInput) phoneInput.value = ''
    } else {
      if (modalTitle) modalTitle.textContent = canManageWorkers() ? 'Edytuj pracownika' : 'Podgląd pracownika'
      if (saveButton) saveButton.textContent = 'Zapisz'
      if (idLabel) idLabel.textContent = worker?.workerId || worker?.id || '-'
      if (addedAtLabel) addedAtLabel.textContent = worker?.addedAt || '-'
      if (editedAtLabel) editedAtLabel.textContent = worker?.editedAt || '-'
      if (editedByLabel) editedByLabel.textContent = worker?.editedBy || '-'
      if (idInput) {
        idInput.value = worker?.workerId || worker?.id || '-'
        idInput.hidden = false
      }
      if (idComposer) idComposer.hidden = true
      if (idNumberInput instanceof HTMLInputElement) {
        idNumberInput.value = ''
        idNumberInput.dataset.manual = '0'
      }
      if (idHint) idHint.textContent = 'ID istniejącego pracownika jest niemodyfikowalne.'
      if (nameInput) nameInput.value = worker?.name || ''
      if (roleInput) {
        roleInput.value = workerProfileAllowedRoleValue(worker?.role ?? worker?.systemRole, {
          isOwner: workerProfileIsOwner(worker),
        })
      }
      if (typeInput) typeInput.value = workerProfileAllowedTypeValue(worker?.workerType || worker?.type || worker?.role)
      if (activeInput) activeInput.value = worker?.active ? '1' : '0'
      if (onlineInput) onlineInput.value = workerBoolLabel(Boolean(worker?.online))
      if (emailInput) {
        emailInput.value = worker?.email || ''
        emailInput.placeholder = ''
      }
      if (phoneInput) phoneInput.value = worker?.phone || ''
    }

    if (saveButton) saveButton.disabled = false

    clearWorkerProfileBasicError()
    clearWorkerProfilePasswordError()
    resetWorkerProfilePasswordVisibility()
    if (newPassInput) newPassInput.value = ''
    if (newPass2Input) newPass2Input.value = ''
    if (passwordSectionTitle) {
      passwordSectionTitle.textContent = 'Hasło'
    }
    if (newPassLabel) {
      newPassLabel.textContent = mode === 'edit' ? 'Ustaw nowe hasło' : 'Wpisz hasło'
    }
    if (newPass2Label) {
      newPass2Label.textContent = 'Powtórz hasło'
    }
    if (newPassInput) {
      newPassInput.placeholder = mode === 'edit' ? 'Wpisz nowe hasło Firebase Auth' : ''
    }
    if (newPass2Input) {
      newPass2Input.placeholder = mode === 'edit' ? 'Powtórz nowe hasło' : ''
    }

    if (deleteButton) {
      deleteButton.style.display = mode === 'edit' && canDeleteWorkers() && !workerProfileIsOwner(worker) ? '' : 'none'
    }

    setWorkerProfileModalReadOnly(mode === 'view' || !canManageWorkers())
    syncWorkerProfileRoleHelp()
    const showPasswordInputs = mode === 'add' || (mode === 'edit' && canResetWorkerPasswords())
    ;[newPassWrap, newPass2Wrap].forEach((wrap) => {
      if (wrap) wrap.style.display = showPasswordInputs ? '' : 'none'
    })
    if (mode === 'edit' && !canResetWorkerPasswords()) {
      if (newPassInput) newPassInput.disabled = true
      if (newPass2Input) newPass2Input.disabled = true
    }
    overlay.style.display = 'flex'
  }

  function closeWorkerProfileModal() {
    const overlay = document.getElementById('wkEditorOverlay')
    if (overlay) {
      overlay.style.display = 'none'
    }

    clearWorkerProfileBasicError()
    clearWorkerProfilePasswordError()
    appState.workerProfileCurrent = null
    appState.workerProfileModalMode = 'view'
  }

  function workerProfileDisplayName(worker) {
    return String(worker?.name ?? worker?.workerName ?? worker?.fullName ?? workerProfileKey(worker) ?? '').trim()
  }

  function closeWorkerProfileDeleteConfirm(confirmed = false) {
    const overlay = document.getElementById('wkDeleteConfirmOverlay')
    if (overlay) {
      overlay.style.display = 'none'
    }

    const resolve = workerProfileDeleteConfirmResolve
    workerProfileDeleteConfirmResolve = null
    if (resolve) {
      resolve(Boolean(confirmed))
    }
  }

  function confirmWorkerProfileDelete(worker) {
    const overlay = document.getElementById('wkDeleteConfirmOverlay')
    const text = document.getElementById('wkDeleteConfirmText')
    const confirmButton = document.getElementById('wkDeleteConfirmConfirm')
    if (!overlay) {
      return Promise.resolve(
        window.confirm('Usunąć pracownika? Operacja usunie profil, dostęp do aplikacji oraz konto Firebase Auth.'),
      )
    }

    if (workerProfileDeleteConfirmResolve) {
      closeWorkerProfileDeleteConfirm(false)
    }

    const name = workerProfileDisplayName(worker) || 'tego pracownika'
    const workerId = String(worker?.workerId ?? worker?.id ?? '').trim()
    if (text) {
      text.textContent = workerId
        ? `Usuniesz profil "${name}" (${workerId}), jego dostęp do aplikacji oraz konto Firebase Auth.`
        : `Usuniesz profil "${name}", jego dostęp do aplikacji oraz konto Firebase Auth.`
    }

    overlay.style.display = 'flex'
    setTimeout(() => confirmButton?.focus?.(), 0)
    return new Promise((resolve) => {
      workerProfileDeleteConfirmResolve = resolve
    })
  }

  function resetWorkerProfileFilters() {
    const qInput = document.getElementById('wkQ')
    const typeInput = document.getElementById('wkType')
    const activeInput = document.getElementById('wkActive')
    const onlineInput = document.getElementById('wkOnline')
    const sortInput = document.getElementById('wkSort')
    if (qInput) qInput.value = ''
    if (typeInput) typeInput.value = ''
    if (activeInput) activeInput.value = ''
    if (onlineInput) onlineInput.value = ''
    if (sortInput) sortInput.value = 'nameAsc'
    appState.workerProfileSort = 'nameAsc'
    clearWorkerProfileSelection()
  }

  function filterWorkerProfileTable({ resetPage = true } = {}) {
    syncWorkerProfilePageSizeSelect()
    updateWorkerProfileKpis()

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

  async function fetchWorkerProfilesForCurrentSession(force = false, options = {}) {
    const silent = Boolean(options?.silent)
    const clearSelection = options?.clearSelection !== false
    const resetPage = options?.resetPage !== false

    syncWorkerProfileAddButtonState()
    syncWorkerProfilePageSizeSelect()
    updateWorkerProfileKpis()

    const root = document.getElementById('wkRows')

    if (!appState.session?.orgId) {
      appState.workerProfileRows = []
      appState.workerProfileViewRows = []
      updateWorkerProfileKpis()
      clearWorkerProfileSelection()
      if (root) {
        root.innerHTML = `
          <div class="workers-row worker-profile-empty-row">
            <div></div><div style="color:#ef4444;">Brak aktywnej sesji.</div><div></div><div></div><div></div><div></div><div class="worker-profile-actions-spacer" aria-hidden="true"></div><div></div>
          </div>
        `
      }
      return
    }

    if (!force && appState.workerProfileRows.length) {
      filterWorkerProfileTable({ resetPage: false })
      return
    }

    if (root && !(silent && appState.workerProfileRows.length)) {
      root.innerHTML = `
        <div class="workers-row worker-profile-empty-row">
          <div></div><div>Ładowanie danych...</div><div></div><div></div><div></div><div></div><div class="worker-profile-actions-spacer" aria-hidden="true"></div><div></div>
        </div>
      `
    }

    try {
      const workerOptions = force ? { force: true, fetchPolicy: 'SERVER_ONLY' } : {}
      const [workers, activeWorkers] = await Promise.all([
        getWorkers(appState.session.orgId, workerOptions),
        typeof getTodayActiveWorkers === 'function'
          ? getTodayActiveWorkers(appState.session.orgId).catch((error) => {
              console.warn('[worker-profile] active workers refresh failed', error)
              return { items: [] }
            })
          : Promise.resolve({ items: [] }),
      ])

      const visibleWorkers = applyOptimisticWorkerProfileDeletes(workers)
      const patchedWorkers = options?.skipOptimisticPatches ? visibleWorkers : applyOptimisticWorkerProfilePatches(visibleWorkers)
      const rows = applyWorkerProfileOnlineStatus(patchedWorkers, activeWorkers)
      applyWorkerProfileRows(rows, { clearSelection, resetPage })
    } catch (error) {
      if (silent && appState.workerProfileRows.length) {
        throw error
      }
      const message = error instanceof Error ? error.message : 'Błąd pobierania pracowników.'
      appState.workerProfileRows = []
      appState.workerProfileViewRows = []
      updateWorkerProfileKpis()
      clearWorkerProfileSelection()
      if (root && !(silent && appState.workerProfileRows.length)) {
        root.innerHTML = `
          <div class="workers-row worker-profile-empty-row">
            <div></div><div style="color:#ef4444;">${escapeHtml(message)}</div><div></div><div></div><div></div><div></div><div class="worker-profile-actions-spacer" aria-hidden="true"></div><div></div>
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

    const saveButton = document.getElementById('wkSaveBtn')
    if (saveButton?.disabled) {
      return
    }

    const isAddingUser = appState.workerProfileModalMode === 'add'
    const currentWorker = appState.workerProfileCurrent
    const currentLogin = isAddingUser ? '' : getWorkerProfileCurrentLogin()
    const email = normalizeWorkerEmailInput(document.getElementById('wkEditEmail')?.value)
    const emailInput = document.getElementById('wkEditEmail')
    if (emailInput instanceof HTMLInputElement) emailInput.value = email

    const payload = {
      workerId: String(document.getElementById('wkEditId')?.value ?? '').trim(),
      name: String(document.getElementById('wkEditName')?.value ?? '').trim(),
      role: workerProfileAllowedRoleValue(document.getElementById('wkEditRole')?.value, {
        isOwner: !isAddingUser && workerProfileIsOwner(currentWorker),
      }),
      workerType: workerProfileAllowedTypeValue(document.getElementById('wkEditType')?.value),
      active: readWorkerProfileActiveValue(currentWorker),
      email,
      phone: String(document.getElementById('wkEditPhone')?.value ?? '').trim(),
    }
    clearWorkerProfileBasicError()
    clearWorkerProfilePasswordError()

    if (!isAddingUser && !currentLogin) {
      alert('Brak danych pracownika do edycji.')
      return
    }

    if (!payload.name) {
      setWorkerProfileBasicError('Uzupełnij imię i nazwisko.', 'wkEditName')
      return
    }

    if (!isValidWorkerEmail(payload.email)) {
      setWorkerProfileBasicError('Podaj poprawny email, którym pracownik będzie się logował.', 'wkEditEmail')
      return
    }

    const newPass = String(document.getElementById('wkNewPass')?.value ?? '').trim()
    const repeatPass = String(document.getElementById('wkNewPass2')?.value ?? '').trim()
    const createRole = payload.role
    const canUpdatePassword = canResetWorkerPasswords()

    if (createRole !== 'WORKER' && !canAdministerWorkers()) {
      setWorkerProfileBasicError('Tylko ADMIN albo OWNER może nadawać role portalowe.', 'wkEditRole')
      return
    }

    let workerNumberOverride
    if (isAddingUser) {
      const numberInput = document.getElementById('wkEditNumber')
      const rawWorkerNumber = String(numberInput?.value ?? '').trim()
      if (!/^[1-9]\d*$/.test(rawWorkerNumber)) {
        setWorkerProfileBasicError(
          'Numer ID pracownika musi być dodatnią liczbą całkowitą bez zer wiodących.',
          'wkEditNumber',
        )
        return
      }
      payload.workerId = syncWorkerProfileIdComposer()
      if (canDeleteWorkers() && numberInput?.dataset.manual === '1') {
        workerNumberOverride = Number(rawWorkerNumber)
      }

      if (!createRole) {
        setWorkerProfileBasicError('Wybierz poprawną rolę pracownika.', 'wkEditRole')
        return
      }

      if (!newPass || newPass.length < 6) {
        setWorkerProfilePasswordError('Hasło tymczasowe musi mieć co najmniej 6 znaków.', 'wkNewPass')
        return
      }
    }

    if (newPass || repeatPass) {
      if (newPass !== repeatPass) {
        setWorkerProfilePasswordError('Hasła nie są takie same.', 'wkNewPass2')
        return
      }
      if (!isAddingUser && !canUpdatePassword) {
        alert('Tylko Admin może resetować hasło pracownika.')
        return
      }
      if (!isAddingUser && newPass.length < 6) {
        setWorkerProfilePasswordError('Hasło musi mieć co najmniej 6 znaków.', 'wkNewPass')
        return
      }
    }

    let successNotice = ''
    let optimisticWorker = null
    let optimisticPreviousKey = ''

    if (saveButton) saveButton.disabled = true

    try {
      if (isAddingUser) {
        const createdUser = await createWorkerUser(appState.session.orgId, {
          ...payload,
          displayName: payload.name,
          password: newPass,
          role: createRole,
          workerType: payload.workerType,
          ...(workerNumberOverride ? { workerNumberOverride } : {}),
        })
        const addedName = String(createdUser?.name ?? createdUser?.workerName ?? payload.name).trim()
        const createdLogin = String(createdUser?.login ?? createdUser?.workerLogin ?? '').trim()
        successNotice = `Dodano użytkownika: ${addedName || payload.name || payload.email}.`
        optimisticWorker = {
          ...payload,
          ...createdUser,
          orgId: appState.session.orgId,
          id: createdUser?.workerId ?? createdUser?.id ?? createdLogin,
          workerId: createdUser?.workerId ?? createdUser?.id ?? createdLogin,
          login: createdLogin,
          workerLogin: createdLogin,
          workerName: createdUser?.workerName ?? createdUser?.name ?? payload.name,
          name: createdUser?.name ?? createdUser?.workerName ?? payload.name,
          fullName: createdUser?.fullName ?? createdUser?.workerName ?? createdUser?.name ?? payload.name,
          role: createdUser?.role ?? payload.role,
          type: createdUser?.workerType ?? createdUser?.type ?? payload.workerType,
          workerType: createdUser?.workerType ?? createdUser?.type ?? payload.workerType,
          active: payload.active,
          email: createdUser?.email ?? payload.email,
          loginEmail: createdUser?.loginEmail ?? createdUser?.email ?? payload.email,
          phone: createdUser?.phone ?? payload.phone,
          authUid: createdUser?.authUid ?? '',
        }
      } else {
        const editedBy = String(appState.session?.name ?? '').trim()
        const workerId = String(document.getElementById('wkEditId')?.value ?? currentWorker?.workerId ?? currentWorker?.id ?? '').trim()

        const updatedWorker = await updateWorker(appState.session.orgId, currentLogin, {
          workerId,
          name: payload.name,
          workerName: payload.name,
          login: currentLogin,
          role: payload.role,
          workerType: payload.workerType,
          active: payload.active,
          email: payload.email,
          loginEmail: payload.email,
          phone: payload.phone,
          editedBy,
          edit: editedBy,
          authUid: currentWorker?.authUid ?? '',
        })
        successNotice = 'Zmiany zapisano.'
        const updatedLogin = String(updatedWorker?.login ?? currentLogin).trim() || currentLogin
        optimisticPreviousKey = currentLogin
        optimisticWorker = {
          ...(currentWorker ?? {}),
          ...updatedWorker,
          id: String(updatedWorker?.workerId ?? workerId ?? updatedWorker?.id ?? currentWorker?.id ?? updatedLogin).trim() || updatedLogin,
          workerId: String(updatedWorker?.workerId ?? workerId ?? currentWorker?.workerId ?? currentWorker?.id ?? updatedLogin).trim() || updatedLogin,
          login: updatedLogin,
          workerLogin: updatedLogin,
          workerName: payload.name,
          fullName: payload.name,
          name: payload.name,
          role: updatedWorker?.role ?? payload.role,
          type: updatedWorker?.workerType ?? updatedWorker?.type ?? payload.workerType,
          workerType: updatedWorker?.workerType ?? updatedWorker?.type ?? payload.workerType,
          active: payload.active,
          email: updatedWorker?.email ?? payload.email,
          loginEmail: updatedWorker?.loginEmail ?? updatedWorker?.email ?? payload.email,
          phone: updatedWorker?.phone ?? payload.phone,
          editedBy,
        }
        if (newPass) {
          await setWorkerPassword(appState.session.orgId, updatedLogin, newPass)
          successNotice = 'Hasło ustawiono w Firebase Auth.'
        }
      }

      if (optimisticWorker) {
        const savedKeys = workerProfileIdentityKeys(optimisticWorker)
        addWorkerProfileIdentityKey(savedKeys, optimisticPreviousKey)
        clearOptimisticWorkerProfilePatchesForKeys(savedKeys)
        upsertWorkerProfileRow(optimisticPreviousKey, optimisticWorker)
      }
      closeWorkerProfileModal()
      showTransientNotice(successNotice, 'success', { size: 'large' })
      void (async () => {
        let refreshedWorker = null
        try {
          clearWorkerDirectoryStateBeforeFreshRead()
          await fetchWorkerProfilesForCurrentSession(true, {
            silent: true,
            clearSelection: false,
            resetPage: false,
            skipOptimisticPatches: true,
          })
          refreshedWorker = optimisticWorker
            ? findWorkerProfileRowAfterSave(optimisticPreviousKey, optimisticWorker)
            : null
        } catch (refreshError) {
          console.warn(
            '[worker-profile] zapis zakonczony powodzeniem, ale odswiezenie WorkersForOrg nie powiodlo sie',
            refreshError,
          )
        }
        if (
          optimisticWorker &&
          (!refreshedWorker || !workerProfilePatchConfirmed(refreshedWorker, optimisticWorker))
        ) {
          console.warn('[worker-profile] server-only refresh did not include backend-confirmed worker', {
            previousLogin: optimisticPreviousKey,
            login: optimisticWorker?.login ?? optimisticWorker?.workerLogin,
          })
          upsertWorkerProfileRow(optimisticPreviousKey, optimisticWorker)
        }
      })()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Błąd zapisu pracownika.'
      if (isAddingUser && /(?:WORKER_NUMBER|WORKER_ID|ID pracownika|numer ID)/i.test(message)) {
        setWorkerProfileBasicError(message, 'wkEditNumber')
      } else if (!isAddingUser) {
        console.error('[worker-profile] save failed', error)
        showTransientNotice('Nie udało się zapisać zmian.', 'error', { size: 'large' })
      } else {
        alert(message)
      }
    } finally {
      if (saveButton) saveButton.disabled = false
    }
  }

  async function deleteWorkerProfileData(worker = appState.workerProfileCurrent) {
    if (!canDeleteWorkers()) {
      alert('Brak uprawnień do usuwania pracownika.')
      return
    }

    const targetWorker = worker ?? appState.workerProfileCurrent
    if (workerProfileIsOwner(targetWorker)) {
      alert('Nie można usunąć konta założyciela organizacji.')
      return
    }
    const login = workerProfileKey(targetWorker)
    if (!appState.session?.orgId || !login) {
      alert('Brak organizacji albo danych pracownika do usunięcia.')
      return
    }

    const confirmed = await confirmWorkerProfileDelete(targetWorker)
    if (!confirmed) {
      return
    }

    const deleteButton = document.getElementById('wkDeleteBtn')
    if (deleteButton) deleteButton.disabled = true

    try {
      const result = await deleteWorker(appState.session.orgId, login, {
        login,
        workerId: targetWorker?.workerId ?? targetWorker?.id ?? '',
        authUid: targetWorker?.authUid ?? '',
      })
      const deletedLogin = String(result?.deletedLogin ?? login).trim()
      const deletedKeys = [
        login,
        deletedLogin,
        targetWorker?.workerId,
        targetWorker?.id,
        targetWorker?.workerLogin,
      ]
      registerOptimisticWorkerProfileDelete(targetWorker, deletedKeys)
      closeWorkerProfileModal()
      removeWorkerProfileRow(targetWorker, deletedKeys)
      void fetchWorkerProfilesForCurrentSession(true, {
        silent: true,
        clearSelection: false,
        resetPage: false,
      }).catch((error) => {
        console.warn('[worker-profile] refresh after delete failed', error)
      })

      const authWarning = String(result?.authWarning ?? '').trim()
      const deletedLabel = workerProfileDisplayName(targetWorker) || String(targetWorker?.workerId ?? targetWorker?.id ?? '').trim() || 'pracownika'
      showTransientNotice(
        authWarning ? `Usunięto ${deletedLabel}. ${authWarning}` : `Usunięto ${deletedLabel}.`,
        'success',
        { size: 'large' },
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Błąd usuwania pracownika.'
      alert(message)
    } finally {
      if (deleteButton) deleteButton.disabled = false
    }
  }

  function bindWorkerProfileViewFunctions(router) {
    const binding = createBindingHelpers()

    syncWorkerProfileAddButtonState()
    syncWorkerProfilePageSizeSelect()
    updateWorkerProfileKpis()
    const sortInput = document.getElementById('wkSort')
    if (sortInput instanceof HTMLSelectElement) {
      sortInput.value = normalizeWorkerProfileSortKey(appState.workerProfileSort)
      appState.workerProfileSort = sortInput.value
    }
    resetWorkerProfileExportRange()
    syncWorkerProfileExportUi()

    binding.add(document.getElementById('wkSearchBtn'), 'click', () => {
      clearWorkerProfileSelection()
      void fetchWorkerProfilesForCurrentSession(true)
    })

    binding.add(document.getElementById('wkOpenExportBtn'), 'click', openWorkerProfileEvidenceExportModal)
    binding.add(document.getElementById('wkExportCloseBtn'), 'click', closeWorkerProfileEvidenceExportModal)
    binding.add(document.getElementById('wkExportCancelBtn'), 'click', closeWorkerProfileEvidenceExportModal)
    binding.add(document.getElementById('wkExportPreviewBtn'), 'click', () => {
      void renderWorkerProfileEvidencePreview()
    })
    binding.add(document.getElementById('wkExportCsvBtn'), 'click', () => {
      void downloadWorkerProfileEwidencja('csv')
    })
    binding.add(document.getElementById('wkExportPdfBtn'), 'click', () => {
      void downloadWorkerProfileEwidencja('pdf')
    })
    binding.add(document.getElementById('wkExportOverlay'), 'click', (event) => {
      if (event.target === event.currentTarget) closeWorkerProfileEvidenceExportModal()
    })
    binding.add(document.getElementById('wkExportOverlay'), 'change', (event) => {
      const target = event.target instanceof Element ? event.target : null
      if (!target?.matches?.('[data-wk-export-col], input[name="wkExportOrientation"], #wkExportFrom, #wkExportTo, #wkExportSkipInactive')) return
      appState.workerProfileEvidencePreviewRows = []
      syncWorkerProfileExportUi()
      setWorkerProfileEvidencePreviewPlaceholder('Zmieniono ustawienia. Kliknij „Wygeneruj podgląd”, aby odświeżyć plik PDF.')
    })

    binding.add(document, 'keydown', (event) => {
      if (event.key !== 'Escape') return
      const overlay = document.getElementById('wkExportOverlay')
      if (overlay && !overlay.hidden) closeWorkerProfileEvidenceExportModal()
    })

    binding.add(document.getElementById('wkResetBtn'), 'click', () => {
      resetWorkerProfileFilters()
      void fetchWorkerProfilesForCurrentSession(true)
    })

    ;['wkQ', 'wkType', 'wkActive', 'wkOnline', 'wkSort'].forEach((id) => {
      binding.add(document.getElementById(id), 'keydown', (event) => {
        if (event.key !== 'Enter') return
        clearWorkerProfileSelection()
        void fetchWorkerProfilesForCurrentSession(true)
      })
    })

    ;['wkType', 'wkActive', 'wkOnline', 'wkSort'].forEach((id) => {
      binding.add(document.getElementById(id), 'change', () => {
        clearWorkerProfileSelection()
        filterWorkerProfileTable({ resetPage: true })
      })
    })

    binding.add(document.getElementById('wkPageSize'), 'change', (event) => {
      const nextSize = Number.parseInt(event.target?.value, 10)
      appState.workerProfilePageSize = allowedPageSizes.includes(nextSize) ? nextSize : 50
      clearWorkerProfileSelection()
      filterWorkerProfileTable({ resetPage: true })
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
      const target = event.target instanceof Element ? event.target : null
      const deleteButton = target?.closest('[data-worker-profile-delete-index]')
      if (deleteButton) {
        const index = Number(deleteButton.getAttribute('data-worker-profile-delete-index'))
        const worker = Number.isInteger(index) ? appState.workerProfileViewRows[index] : null
        void deleteWorkerProfileData(worker)
        return
      }

      const accountButton = target?.closest('[data-worker-account-index]')
      if (accountButton) {
        const index = Number(accountButton.getAttribute('data-worker-account-index'))
        const worker = Number.isInteger(index) ? appState.workerProfileViewRows[index] : null
        if (!worker) {
          return
        }

        const workerAccountLogin = String(worker.login || worker.workerLogin || '').trim()
        const workerAccountName = String(worker.name || worker.workerName || worker.fullName || '').trim()
        const workerAccountId = String(worker.workerId || worker.id || workerAccountLogin).trim()
        const workerAccountTargetKey = [workerAccountLogin, workerAccountId, workerAccountName]
          .map((value) => normalizeSearchText(value).toLowerCase())
          .find(Boolean) || ''

        appState.workerAccountCurrent = worker
        appState.workerAccountActiveTab = 'account'
        appState.workerAccountTargetKey = workerAccountTargetKey
        appState.selectedWorkerLogin = workerAccountLogin
        appState.selectedWorkerName = workerAccountName
        router?.go?.('workerAccount')
        window.dispatchEvent(new CustomEvent('worker-account-select', {
          detail: {
            worker,
            tab: 'account',
          },
        }))
        return
      }

      const button = target?.closest('[data-worker-profile-index]')
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

    binding.add(document.getElementById('wkRows'), 'change', (event) => {
      const target = event.target instanceof Element ? event.target : null
      const checkbox = target?.closest('[data-worker-profile-select]')
      if (!(checkbox instanceof HTMLInputElement)) {
        return
      }

      const index = Number(checkbox.getAttribute('data-worker-profile-select'))
      const worker = Number.isInteger(index) ? appState.workerProfileViewRows[index] : null
      const key = workerProfileKey(worker)
      if (!key) {
        return
      }

      if (checkbox.checked) {
        selectedWorkerProfileKeys.add(key)
      } else {
        selectedWorkerProfileKeys.delete(key)
      }

      checkbox.closest('.workers-row')?.classList.toggle('is-selected', checkbox.checked)
      syncWorkerProfileSelectionUi()
    })

    binding.add(document.getElementById('wkSelectAll'), 'change', (event) => {
      setVisibleWorkerProfileSelection(Boolean(event.target?.checked))
    })

    binding.add(document.getElementById('wkDeleteConfirmOverlay'), 'click', (event) => {
      if (event.target?.id === 'wkDeleteConfirmOverlay') {
        closeWorkerProfileDeleteConfirm(false)
      }
    })
    binding.add(document.getElementById('wkDeleteConfirmCancel'), 'click', () => closeWorkerProfileDeleteConfirm(false))
    binding.add(document.getElementById('wkDeleteConfirmConfirm'), 'click', () => closeWorkerProfileDeleteConfirm(true))

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
      void deleteWorkerProfileData(appState.workerProfileCurrent)
    })
    ;['wkNewPass', 'wkNewPass2'].forEach((id) => {
      const input = document.getElementById(id)
      ;['input', 'change'].forEach((eventName) => {
        binding.add(input, eventName, clearWorkerProfilePasswordError)
      })
    })
    document.querySelectorAll('[data-worker-password-toggle]').forEach((button) => {
      binding.add(button, 'click', () => {
        toggleWorkerProfilePasswordVisibility(button.getAttribute('data-worker-password-toggle'))
      })
    })
    resetWorkerProfilePasswordVisibility()
    binding.add(document.getElementById('wkEditNumber'), 'input', (event) => {
      const input = event.currentTarget
      if (!(input instanceof HTMLInputElement)) {
        return
      }
      input.value = input.value.replace(/\D+/g, '').slice(0, 10)
      input.dataset.manual = '1'
      clearWorkerProfileBasicError()
      syncWorkerProfileIdComposer()
    })
    ;['wkEditId', 'wkEditNumber', 'wkEditName', 'wkEditEmail', 'wkEditRole', 'wkEditType'].forEach((id) => {
      const input = document.getElementById(id)
      ;['input', 'change'].forEach((eventName) => {
        binding.add(input, eventName, () => {
          clearWorkerProfileBasicError()
          if (id === 'wkEditRole') syncWorkerProfileRoleHelp()
          if (id === 'wkEditId' || id === 'wkEditNumber') {
            if (id === 'wkEditNumber') syncWorkerProfileIdComposer()
            const idLabel = document.getElementById('wkIdLabel')
            if (idLabel && id === 'wkEditId') idLabel.textContent = String(input?.value ?? '').trim() || '-'
          }
        })
      })
    })
    binding.add(document.getElementById('wkEditRole'), 'mouseenter', syncWorkerProfileRoleHelp)

    return () => {
      closeWorkerProfileDeleteConfirm(false)
      closeWorkerProfileEvidenceExportModal(false)
      binding.done()
    }
  }

  return {
    fetch: fetchWorkerProfilesForCurrentSession,
    bind: bindWorkerProfileViewFunctions,
  }
}
