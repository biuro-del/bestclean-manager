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
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M8 7l1-3h6l1 3"></path><path d="M7 7l1 13h8l1-13"></path></svg>',
  edit:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"></path></svg>',
  eye:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="2.5"></circle></svg>',
  eyeOff:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18"></path><path d="M10.6 10.6A2.5 2.5 0 0 0 13.4 13.4"></path><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6 0 9.5 7 9.5 7a18 18 0 0 1-3.1 4.1"></path><path d="M6.6 6.6A17.6 17.6 0 0 0 2.5 12s3.5 6 9.5 6c1.8 0 3.4-.5 4.8-1.2"></path></svg>',
  more:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>',
  view:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="2.5"></circle></svg>',
}

const OPTIMISTIC_WORKER_PROFILE_TTL_MS = 15000
const OPTIMISTIC_WORKER_PROFILE_DELETE_TTL_MS = 60000

export function createWorkerProfileFeature(ctx) {
  const {
    appState,
    canDeleteWorkers,
    canManageWorkers,
    canRevealWorkerPasswords,
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
    getWorkdays,
    getWorkers,
    normalizeSearchText,
    paginate,
    setPdfUnicodeFont,
    revealWorkerPassword,
    setSubwelcomeMetric,
    setWorkerPassword,
    setupResizableGridTable,
    showTransientNotice,
    todayYmd,
    toIso,
    updateWorker,
    workerDetailComputeRangeSeconds,
    workerDetailDateKeyFromIso,
    workerDetailDateKeyToLabel,
    workerDetailIsoToHm,
    workerPasswordVaultMissingMessage,
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
    return workerProfilePatchText(worker?.role ?? worker?.type ?? worker?.workerType)
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
      workerProfilePatchEmail(server) === workerProfilePatchEmail(optimistic) &&
      workerProfilePatchText(server.phone) === workerProfilePatchText(optimistic.phone) &&
      workerProfileBoolean(server, 'active') === workerProfileBoolean(optimistic, 'active')
    )
  }

  function registerOptimisticWorkerProfilePatch(previousKey, worker) {
    const row = normalizeWorkerProfileRow(worker)
    const keys = workerProfileIdentityKeys(row)
    const previous = normalizeWorkerProfileIdentity(previousKey)
    if (previous) {
      keys.add(previous)
    }
    if (!keys.size) {
      return
    }

    const record = {
      worker: row,
      keys,
      expiresAt: Date.now() + OPTIMISTIC_WORKER_PROFILE_TTL_MS,
    }
    keys.forEach((key) => optimisticWorkerProfilePatches.set(key, record))
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

  function workerProfileBoolean(worker, field) {
    const parsed = workerBooleanValue(worker?.[field])
    return parsed === null ? Boolean(worker?.[field]) : parsed
  }

  function normalizeWorkerProfileRow(worker) {
    return {
      ...worker,
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

  function selectedWorkerProfileExportWorkers() {
    return (appState.workerProfileRows || []).filter((worker) => {
      const key = workerProfileKey(worker)
      return key && selectedWorkerProfileKeys.has(key)
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
    const workers = selectedWorkerProfileExportWorkers()
    const count = workers.length
    const names = workers.map(workerProfileExportDisplayName).filter(Boolean)
    setTextContent('wkExportSelectedCount', count)
    setTextContent('wkExportSelectedNames', names.length ? names.join(', ') : 'Zaznacz pracownika z listy.')
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

    return {
      ...range,
      orientation,
      columns,
    }
  }

  function workerProfileEvidenceFilenameBase(options) {
    const from = String(options?.fromYmd ?? 'od').trim() || 'od'
    const to = String(options?.toYmd ?? 'do').trim() || 'do'
    return sanitizeWorkTimeEvidenceFilePart(`ewidencja-pracy-pracownicy-${from}-${to}`)
  }

  function setWorkerProfileEvidencePreviewPlaceholder(message = 'Kliknij "Podglad pliku", aby zobaczyc podglad PDF') {
    revokeWorkerProfileEvidencePreviewUrl()
    const preview = document.getElementById('wkExportPreview')
    const meta = document.getElementById('wkExportPreviewMeta')
    const options = readWorkerProfileExportOptions({ validate: false })
    const workers = selectedWorkerProfileExportWorkers()
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
    const workers = selectedWorkerProfileExportWorkers()
    if (!workers.length) {
      alert('Zaznacz co najmniej jednego pracownika.')
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
      alert('Zaznacz co najmniej jednego pracownika.')
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
  }

  function closeWorkerProfileEvidenceExportModal() {
    revokeWorkerProfileEvidencePreviewUrl()
    const overlay = document.getElementById('wkExportOverlay')
    if (overlay) {
      overlay.hidden = true
      overlay.style.display = 'none'
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
          workerCount: selectedWorkerProfileExportWorkers().length,
        })
      }
      preview.innerHTML = `<iframe class="wa-export-preview-frame" src="${escapeHtml(url)}" title="Podglad PDF ewidencji pracy"></iframe>`
    } catch (error) {
      const message = workTimeEvidenceErrorMessage(error)
      preview.innerHTML = workTimeEvidencePreviewPlaceholderHtml(workerProfileExportDeps(), message)
      showTransientNotice(message, 'error')
    } finally {
      if (button instanceof HTMLButtonElement) {
        button.disabled = false
        button.textContent = 'Podglad pliku'
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
        showTransientNotice(`Pobrano CSV ewidencji. Osoby: ${selectedWorkerProfileExportWorkers().length}, wpisy: ${rows.length}.`, 'success')
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
      showTransientNotice(`Pobrano PDF ewidencji. Osoby: ${selectedWorkerProfileExportWorkers().length}, wpisy: ${rows.length}.`, 'success')
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
        return byText((worker) => worker?.type ?? worker?.role ?? '')
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
      const workerType = normalizeSearchText(worker.type ?? worker.role)
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
        worker.type,
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
          <div></div><div>Brak wyników</div><div></div><div></div><div></div><div></div><div></div><div></div>
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
          const emailOrLogin = worker.email || worker.login || worker.workerLogin || '-'
          const login = worker.login || worker.workerLogin || '-'
          const role = worker.role || worker.type || '-'
          const roleVisual = workerRoleVisualMeta(role)
          const phone = worker.phone || '-'
          const active = workerProfileBoolean(worker, 'active')
          const online = workerProfileBoolean(worker, 'online')
          const deleteAction = canDeleteWorkers()
            ? `<button class="worker-profile-action-icon worker-profile-action-danger" type="button" data-worker-profile-delete-index="${index}" title="Usuń" aria-label="Usuń pracownika">${WORKER_ACTION_ICONS.delete}</button>`
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
                <small>${escapeHtml(emailOrLogin)}</small>
              </span>
            </div>
          </div>
          <div>
            <div class="worker-profile-role-cell">
              <span class="worker-profile-role-icon ${roleVisual.className}">${roleVisual.iconHtml}</span>
              <strong>${escapeHtml(role)}</strong>
            </div>
          </div>
          <div class="mono">${escapeHtml(login)}</div>
          <div>${escapeHtml(phone)}</div>
          <div><span class="worker-profile-status ${active ? 'is-active' : 'is-inactive'}">${active ? 'Active' : 'Inactive'}</span></div>
          <div><span class="worker-profile-online ${online ? 'is-online' : 'is-offline'}">${online ? 'Online' : 'Offline'}</span></div>
          <div class="workers-actions">
            <button class="worker-profile-action-icon worker-profile-action-primary" type="button" data-worker-account-index="${index}" title="Widok konta" aria-label="Widok konta pracownika">${WORKER_ACTION_ICONS.view}</button>
            <button class="worker-profile-action-icon worker-profile-action-primary" type="button" data-worker-profile-index="${index}" title="${actionLabel}" aria-label="${actionLabel} pracownika">${WORKER_ACTION_ICONS.edit}</button>
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

    ;['wkEditName', 'wkEditLogin', 'wkEditType', 'wkEditActive', 'wkEditPhone', 'wkNewPass', 'wkNewPass2'].forEach(
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
      const adminCanChangeId = addMode && canDeleteWorkers()
      idInput.disabled = readOnly || !adminCanChangeId
      idInput.readOnly = readOnly || !adminCanChangeId
      idInput.title = adminCanChangeId
        ? 'Admin moze zmienic domyslne ID przed dodaniem pracownika.'
        : addMode
          ? 'ID pracownika moze zmienic tylko Admin.'
          : 'ID istniejacego pracownika jest zablokowane.'
    }

    const loginInput = document.getElementById('wkEditLogin')
    if (loginInput instanceof HTMLInputElement) {
      const addMode = appState.workerProfileModalMode === 'add'
      const adminCanChangeLogin = appState.workerProfileModalMode === 'edit' && canDeleteWorkers()
      loginInput.disabled = readOnly || (!addMode && !adminCanChangeLogin)
      loginInput.readOnly = readOnly || (!addMode && !adminCanChangeLogin)
      loginInput.title = adminCanChangeLogin
        ? 'Admin moze zmienic login. Email zostanie dopasowany do nowego loginu.'
        : addMode
          ? ''
          : 'Login moze zmienic tylko Admin.'
    }

    const emailInput = document.getElementById('wkEditEmail')
    if (emailInput) {
      const addMode = appState.workerProfileModalMode === 'add'
      emailInput.disabled = readOnly || addMode
      emailInput.title = addMode
        ? 'Email jest wyliczany z loginu i domeny konta dodającego.'
        : ''
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
        <option value="Pracownik">Pracownik / WORKER</option>
        <option value="Kierownik">Kierownik / MANAGER</option>
        <option value="Koordynator">Koordynator / COORDINATOR</option>
        <option value="Stażysta">Stażysta</option>
        <option value="Stały personel na obiekcie">Stały personel na obiekcie</option>
        <option value="Zespół mobilny">Zespół mobilny</option>
      `
      typeInput.value = 'Pracownik'
      return
    }

    if (typeInput.innerHTML !== workerProfileDefaultTypeOptionsHtml) {
      typeInput.innerHTML = workerProfileDefaultTypeOptionsHtml
    }
  }

  function workerProfileRoleForCreate(value) {
    const raw = String(value ?? '').trim()
    const normalized = normalizeSearchText(raw).toLowerCase()
    if (!normalized) {
      return ''
    }
    if (normalized.includes('admin') || normalized.includes('owner') || normalized.includes('superadmin')) {
      return ''
    }
    if (normalized.includes('manager') || normalized.includes('menager') || normalized.includes('menedzer') || normalized.includes('kierownik')) {
      return 'MANAGER'
    }
    if (normalized.includes('koordynator') || normalized.includes('coordynator') || normalized.includes('coordinator')) {
      return 'COORDINATOR'
    }
    return 'WORKER'
  }

  const WORKER_LOGIN_LOCAL_PART_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,78}[a-z0-9])?$/

  function sanitizeWorkerLoginLocalPart(value) {
    return String(value ?? '').trim().toLowerCase()
  }

  function isValidWorkerLoginLocalPart(value) {
    const localPart = sanitizeWorkerLoginLocalPart(value)
    if (!localPart || localPart.includes('@')) {
      return false
    }

    return WORKER_LOGIN_LOCAL_PART_PATTERN.test(localPart)
  }

  function getWorkerCreatorEmailDomain() {
    const candidates = [appState.session?.email, appState.session?.login]
    for (const candidate of candidates) {
      const source = String(candidate ?? '')
        .trim()
        .toLowerCase()
      const atIndex = source.indexOf('@')
      if (atIndex < 0) {
        continue
      }

      const domain = source.slice(atIndex + 1).trim()
      if (domain && !domain.includes('@')) {
        return domain
      }
    }
    return ''
  }

  function getWorkerProfileEmailDomain() {
    const currentWorker = appState.workerProfileCurrent
    const emailInput = document.getElementById('wkEditEmail')
    const candidates = [currentWorker?.email, emailInput?.value, appState.session?.email, appState.session?.login]
    for (const candidate of candidates) {
      const source = String(candidate ?? '')
        .trim()
        .toLowerCase()
      const atIndex = source.indexOf('@')
      if (atIndex < 0) {
        continue
      }

      const domain = source.slice(atIndex + 1).trim()
      if (domain && !domain.includes('@')) {
        return domain
      }
    }
    return ''
  }

  function buildWorkerLoginEmailPreview(loginValue, domain = getWorkerCreatorEmailDomain()) {
    const localPart = sanitizeWorkerLoginLocalPart(loginValue)
    if (!isValidWorkerLoginLocalPart(localPart)) {
      return ''
    }

    if (!domain) {
      return ''
    }

    return `${localPart}@${domain}`
  }

  function syncWorkerProfileEmailPreview() {
    const canSyncEditLoginEmail = appState.workerProfileModalMode === 'edit' && canDeleteWorkers()
    if (appState.workerProfileModalMode !== 'add' && !canSyncEditLoginEmail) {
      return
    }

    const emailInput = document.getElementById('wkEditEmail')
    if (!(emailInput instanceof HTMLInputElement)) {
      return
    }

    const loginInput = document.getElementById('wkEditLogin')
    const domain = appState.workerProfileModalMode === 'add' ? getWorkerCreatorEmailDomain() : getWorkerProfileEmailDomain()
    emailInput.value = buildWorkerLoginEmailPreview(loginInput?.value ?? '', domain)
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
    ;['wkEditId', 'wkEditName', 'wkEditLogin', 'wkEditType'].forEach((id) => {
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
    const nameInput = document.getElementById('wkEditName')
    const loginInput = document.getElementById('wkEditLogin')
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
    const passWrap = document.getElementById('wkCurrentPassWrap')
    const currentPass = document.getElementById('wkCurrentPass')
    const showPassButton = document.getElementById('wkShowPassBtn')
    const copyPassButton = document.getElementById('wkCopyPassBtn')
    const passHint = document.getElementById('wkCurrentPassHint')
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
        loginInput.dataset.autoFromEmail = '0'
        loginInput.readOnly = false
        loginInput.title = ''
      }
      if (typeInput) typeInput.value = 'Pracownik'
      if (activeInput) activeInput.value = '1'
      if (onlineInput) onlineInput.value = 'NIE'
      if (emailInput) {
        emailInput.value = ''
        emailInput.placeholder = getWorkerCreatorEmailDomain()
          ? `login@${getWorkerCreatorEmailDomain()}`
          : 'Email zostanie wyliczony z loginu'
      }
      if (phoneInput) phoneInput.value = ''
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
        loginInput.value = worker?.login || worker?.workerLogin || ''
        loginInput.dataset.autoFromEmail = '0'
        loginInput.readOnly = !canDeleteWorkers()
        loginInput.title = canDeleteWorkers()
          ? 'Admin moze zmienic login. Email zostanie dopasowany do nowego loginu.'
          : 'Login moze zmienic tylko Admin.'
      }
      if (typeInput) typeInput.value = worker?.role || worker?.type || 'Pracownik'
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
      passwordSectionTitle.textContent = mode === 'edit' && canRevealWorkerPasswords() ? 'Hasło i sejf' : 'Hasło'
    }
    if (newPassLabel) {
      newPassLabel.textContent = mode === 'edit' ? 'Ustaw / zapisz hasło w sejfie' : 'Wpisz hasło'
    }
    if (newPass2Label) {
      newPass2Label.textContent = mode === 'edit' ? 'Powtórz hasło do sejfu' : 'Powtórz hasło'
    }
    if (newPassInput) {
      newPassInput.placeholder = mode === 'edit' ? 'Wpisz nowe albo znane obecne hasło' : ''
    }
    if (newPass2Input) {
      newPass2Input.placeholder = mode === 'edit' ? 'Powtórz hasło do zapisania' : ''
    }

    if (passWrap) {
      const showPasswordVault = mode === 'edit' && canRevealWorkerPasswords()
      passWrap.style.display = showPasswordVault ? '' : 'none'
      passWrap.dataset.loaded = '0'
      passWrap.dataset.login = showPasswordVault ? String(worker?.login ?? worker?.workerLogin ?? '').trim() : ''
    }
    if (currentPass) {
      currentPass.value = ''
      currentPass.type = 'password'
      currentPass.dataset.loaded = '0'
      currentPass.placeholder = mode === 'edit' && canRevealWorkerPasswords() ? 'Kliknij Pokaż, aby pobrać hasło' : ''
    }
    if (showPassButton) {
      showPassButton.textContent = 'Pokaż'
      showPassButton.disabled = false
    }
    if (copyPassButton) {
      copyPassButton.disabled = true
    }
    if (passHint) {
      passHint.textContent = 'Hasło jest pobierane z szyfrowanego sejfu tylko dla Admina.'
    }

    if (deleteButton) {
      deleteButton.style.display = mode === 'edit' && canDeleteWorkers() ? '' : 'none'
    }

    setWorkerProfileModalReadOnly(mode === 'view' || !canManageWorkers())
    const showPasswordInputs = mode === 'add' || (mode === 'edit' && canRevealWorkerPasswords())
    ;[newPassWrap, newPass2Wrap].forEach((wrap) => {
      if (wrap) wrap.style.display = showPasswordInputs ? '' : 'none'
    })
    if (mode === 'edit' && !canRevealWorkerPasswords()) {
      if (newPassInput) newPassInput.disabled = true
      if (newPass2Input) newPass2Input.disabled = true
    }
    syncWorkerProfileEmailPreview()
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
    const login = workerProfileKey(worker)
    if (text) {
      text.textContent = login
        ? `Usuniesz profil "${name}" (${login}), jego dostęp do aplikacji oraz konto Firebase Auth.`
        : `Usuniesz profil "${name}", jego dostęp do aplikacji oraz konto Firebase Auth.`
    }

    overlay.style.display = 'flex'
    setTimeout(() => confirmButton?.focus?.(), 0)
    return new Promise((resolve) => {
      workerProfileDeleteConfirmResolve = resolve
    })
  }

  async function loadWorkerProfilePassword() {
    if (!canRevealWorkerPasswords()) {
      alert('Brak uprawnień do podglądu hasła pracownika.')
      return ''
    }

    const orgId = String(appState.session?.orgId ?? '').trim()
    const login = getWorkerProfileCurrentLogin() || String(document.getElementById('wkEditLogin')?.value ?? '').trim()
    const passInput = document.getElementById('wkCurrentPass')
    const showButton = document.getElementById('wkShowPassBtn')
    const copyButton = document.getElementById('wkCopyPassBtn')
    const hint = document.getElementById('wkCurrentPassHint')

    if (!orgId || !login) {
      alert('Brak organizacji albo loginu pracownika.')
      return ''
    }

    if (passInput?.dataset.loaded === '1' && passInput.value) {
      return passInput.value
    }

    if (showButton) showButton.disabled = true
    if (copyButton) copyButton.disabled = true
    if (hint) hint.textContent = 'Pobieranie hasła z szyfrowanego sejfu...'

    try {
      const result = await revealWorkerPassword(orgId, login)
      if (!result?.hasPassword || !result?.password) {
        if (passInput) {
          passInput.value = ''
          passInput.dataset.loaded = '0'
        }
        const message = String(result?.message ?? '').trim() || workerPasswordVaultMissingMessage()
        if (hint) hint.textContent = message
        setTimeout(() => document.getElementById('wkNewPass')?.focus?.(), 0)
        return ''
      }

      if (passInput) {
        passInput.value = String(result.password)
        passInput.dataset.loaded = '1'
      }
      if (copyButton) copyButton.disabled = false
      if (hint) {
        const updatedAt = String(result.updatedAt ?? '').trim()
        hint.textContent = updatedAt
          ? `Hasło zapisane w sejfie. Ostatnia aktualizacja: ${updatedAt}.`
          : 'Hasło zapisane w sejfie.'
      }
      return String(result.password)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udało się pobrać hasła pracownika.'
      if (hint) hint.textContent = message
      alert(message)
      return ''
    } finally {
      if (showButton) showButton.disabled = false
    }
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
            <div></div><div style="color:#ef4444;">Brak aktywnej sesji.</div><div></div><div></div><div></div><div></div><div></div><div></div>
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
          <div></div><div>Ładowanie danych...</div><div></div><div></div><div></div><div></div><div></div><div></div>
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
      const patchedWorkers = applyOptimisticWorkerProfilePatches(visibleWorkers)
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
            <div></div><div style="color:#ef4444;">${escapeHtml(message)}</div><div></div><div></div><div></div><div></div><div></div><div></div>
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
    const rawLogin = String(document.getElementById('wkEditLogin')?.value ?? '').trim()
    const requestedLogin = sanitizeWorkerLoginLocalPart(rawLogin)
    const login = isAddingUser ? requestedLogin : currentLogin
    const nextLogin = !isAddingUser && canDeleteWorkers() ? requestedLogin : currentLogin
    if (isAddingUser || (!isAddingUser && canDeleteWorkers())) {
      const loginInput = document.getElementById('wkEditLogin')
      if (loginInput instanceof HTMLInputElement) {
        loginInput.value = isAddingUser ? login : nextLogin
      }
      syncWorkerProfileEmailPreview()
    }

    const payload = {
      workerId: String(document.getElementById('wkEditId')?.value ?? '').trim(),
      name: String(document.getElementById('wkEditName')?.value ?? '').trim(),
      login,
      role: String(document.getElementById('wkEditType')?.value ?? 'Pracownik').trim(),
      active: readWorkerProfileActiveValue(currentWorker),
      email: isAddingUser
        ? buildWorkerLoginEmailPreview(login)
        : String(document.getElementById('wkEditEmail')?.value ?? '').trim(),
      phone: String(document.getElementById('wkEditPhone')?.value ?? '').trim(),
    }
    clearWorkerProfileBasicError()
    clearWorkerProfilePasswordError()

    if (!isAddingUser && !payload.login) {
      alert('Brak loginu pracownika do edycji.')
      return
    }

    if (!isAddingUser && canDeleteWorkers() && !isValidWorkerLoginLocalPart(nextLogin)) {
      alert('Login musi byc lokalna czescia emaila (bez @) i moze zawierac tylko litery, cyfry, ".", "-" oraz "_".')
      return
    }

    if (!payload.name || !payload.login) {
      if (isAddingUser) {
        setWorkerProfileBasicError('Uzupełnij imię i login.', payload.name ? 'wkEditLogin' : 'wkEditName')
      } else {
        alert('Uzupełnij imię i login.')
      }
      return
    }

    const newPass = String(document.getElementById('wkNewPass')?.value ?? '').trim()
    const repeatPass = String(document.getElementById('wkNewPass2')?.value ?? '').trim()
    const createRole = workerProfileRoleForCreate(payload.role)
    const canUpdatePassword = canRevealWorkerPasswords()

    if (isAddingUser) {
      if (!payload.workerId) {
        setWorkerProfileBasicError('Uzupełnij ID pracownika.', 'wkEditId')
        return
      }

      if (!isValidWorkerLoginLocalPart(payload.login)) {
        setWorkerProfileBasicError('Login musi być lokalną częścią emaila (bez @) i może zawierać tylko litery, cyfry, ".", "-" oraz "_".', 'wkEditLogin')
        return
      }

      if (!payload.email) {
        setWorkerProfileBasicError('Nie można zbudować finalnego emaila. Sprawdź login i domenę konta dodającego.', 'wkEditLogin')
        return
      }

      if (!createRole) {
        setWorkerProfileBasicError('Nowy użytkownik nie może być tworzony z rolą Admin.', 'wkEditType')
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
          storePassword: canUpdatePassword,
        })
        const addedName = String(createdUser?.name ?? createdUser?.workerName ?? payload.name).trim()
        successNotice = `Dodano użytkownika: ${addedName || payload.name || payload.login}.`
        optimisticWorker = {
          ...payload,
          ...createdUser,
          orgId: appState.session.orgId,
          id: createdUser?.workerId ?? createdUser?.id ?? payload.login,
          workerId: createdUser?.workerId ?? createdUser?.id ?? payload.login,
          login: createdUser?.login ?? createdUser?.workerLogin ?? payload.login,
          workerLogin: createdUser?.login ?? createdUser?.workerLogin ?? payload.login,
          workerName: createdUser?.workerName ?? createdUser?.name ?? payload.name,
          name: createdUser?.name ?? createdUser?.workerName ?? payload.name,
          fullName: createdUser?.fullName ?? createdUser?.workerName ?? createdUser?.name ?? payload.name,
          role: createdUser?.role ?? payload.role,
          type: createdUser?.type ?? createdUser?.role ?? payload.role,
          workerType: createdUser?.workerType ?? createdUser?.role ?? payload.role,
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
          newLogin: nextLogin,
          role: payload.role,
          workerType: payload.role,
          active: payload.active,
          email: payload.email,
          loginEmail: payload.email,
          phone: payload.phone,
          editedBy,
          edit: editedBy,
          authUid: currentWorker?.authUid ?? '',
        })
        successNotice = updatedWorker?.authUpdated ? 'Zmiany zapisane w bazie i Firebase Auth.' : 'Zmiany zapisane w bazie.'
        const updatedLogin = String(updatedWorker?.login ?? nextLogin ?? currentLogin).trim() || currentLogin
        if (updatedLogin && updatedLogin !== currentLogin) {
          selectedWorkerProfileKeys.delete(currentLogin)
          successNotice = updatedWorker?.authUpdated
            ? `Zmiany zapisane w bazie i Firebase Auth. Login zmieniono na ${updatedLogin}.`
            : `Zmiany zapisane w bazie. Login zmieniono na ${updatedLogin}.`
        }
        const authWarning = String(updatedWorker?.authWarning ?? '').trim()
        if (authWarning) {
          successNotice += ` Uwaga: ${authWarning}`
        }
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
          type: updatedWorker?.type ?? updatedWorker?.role ?? payload.role,
          workerType: updatedWorker?.workerType ?? updatedWorker?.role ?? payload.role,
          active: payload.active,
          email: updatedWorker?.email ?? payload.email,
          loginEmail: updatedWorker?.loginEmail ?? updatedWorker?.email ?? payload.email,
          phone: updatedWorker?.phone ?? payload.phone,
          editedBy,
        }
        if (newPass) {
          await setWorkerPassword(appState.session.orgId, updatedLogin, newPass)
          successNotice = 'Hasło ustawiono w Firebase Auth i zapisano w sejfie.'
        }
      }

      closeWorkerProfileModal()
      if (optimisticWorker) {
        registerOptimisticWorkerProfilePatch(optimisticPreviousKey, optimisticWorker)
        upsertWorkerProfileRow(optimisticPreviousKey, optimisticWorker)
      }
      showTransientNotice(successNotice, 'success', { size: 'large' })
      void fetchWorkerProfilesForCurrentSession(true, {
        silent: true,
        clearSelection: false,
        resetPage: false,
      }).catch((error) => {
        console.warn('[worker-profile] refresh after save failed', error)
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Błąd zapisu pracownika.'
      if (isAddingUser && /(?:^|\b)(?:WORKER_ID_ALREADY_EXISTS|ID pracownika)(?:\b|$)/i.test(message)) {
        setWorkerProfileBasicError(message, 'wkEditId')
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
    const login = workerProfileKey(targetWorker)
    if (!appState.session?.orgId || !login) {
      alert('Brak organizacji albo loginu pracownika do usunięcia.')
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
      showTransientNotice(
        authWarning ? `Usunięto pracownika ${login}. ${authWarning}` : `Usunięto pracownika ${login}.`,
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
    const cleanupWorkerProfileTableResize = setupResizableGridTable({
      tableSelector: '#view-workerProfile .workers-table',
      headSelector: '#view-workerProfile .workers-head',
      cssVarName: '--workers-grid',
      storageKey: 'portal.grid.workerProfile.v4',
      defaultWidths: [54, 250, 220, 170, 160, 130, 130, 146],
      minWidths: [44, 190, 160, 110, 90, 90, 90, 132],
      nonResizableIndexes: [0, 7],
      autoFitToViewport: true,
      enforceFullWidth: true,
      maxWidth: 1510,
    })

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
      if (!target?.matches?.('[data-wk-export-col], input[name="wkExportOrientation"], #wkExportFrom, #wkExportTo')) return
      appState.workerProfileEvidencePreviewRows = []
      setWorkerProfileEvidencePreviewPlaceholder('Zmieniono ustawienia. Kliknij "Podglad pliku", aby odswiezyc podglad PDF.')
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
    ;['input', 'change', 'blur'].forEach((eventName) => {
      binding.add(document.getElementById('wkEditLogin'), eventName, () => {
        const loginInput = document.getElementById('wkEditLogin')
        if (!(loginInput instanceof HTMLInputElement)) {
          return
        }

        loginInput.dataset.autoFromEmail = '0'
        if (appState.workerProfileModalMode !== 'add' && !canDeleteWorkers()) {
          return
        }

        loginInput.value = sanitizeWorkerLoginLocalPart(loginInput.value)
        syncWorkerProfileEmailPreview()
      })
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
    binding.add(document.getElementById('wkShowPassBtn'), 'click', async () => {
      const passInput = document.getElementById('wkCurrentPass')
      const showButton = document.getElementById('wkShowPassBtn')
      if (!passInput || !showButton) {
        return
      }

      const show = passInput.type === 'password'
      if (show && !passInput.value) {
        const loadedPassword = await loadWorkerProfilePassword()
        if (!loadedPassword) {
          return
        }
      }
      passInput.type = show ? 'text' : 'password'
      showButton.textContent = show ? 'Ukryj' : 'Pokaż'
    })
    ;['wkEditId', 'wkEditName', 'wkEditLogin', 'wkEditType'].forEach((id) => {
      const input = document.getElementById(id)
      ;['input', 'change'].forEach((eventName) => {
        binding.add(input, eventName, () => {
          clearWorkerProfileBasicError()
          if (id === 'wkEditId') {
            const idLabel = document.getElementById('wkIdLabel')
            if (idLabel) idLabel.textContent = String(input?.value ?? '').trim() || '-'
          }
        })
      })
    })
    binding.add(document.getElementById('wkCopyPassBtn'), 'click', async () => {
      const passInput = document.getElementById('wkCurrentPass')
      if (!passInput) {
        return
      }
      if (!passInput?.value) {
        const loadedPassword = await loadWorkerProfilePassword()
        if (!loadedPassword) {
          return
        }
      }

      try {
        await navigator.clipboard.writeText(passInput.value)
        alert('Skopiowano hasło do schowka.')
      } catch {
        alert('Nie udało się skopiować hasła.')
      }
    })

    return () => {
      closeWorkerProfileDeleteConfirm(false)
      closeWorkerProfileEvidenceExportModal()
      cleanupWorkerProfileTableResize()
      binding.done()
    }
  }

  return {
    fetch: fetchWorkerProfilesForCurrentSession,
    bind: bindWorkerProfileViewFunctions,
  }
}
