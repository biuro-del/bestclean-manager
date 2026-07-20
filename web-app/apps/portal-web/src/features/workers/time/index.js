import template from './template.html?raw'
import { workerBooleanValue, workerBoolLabel } from '../index.js'
import {
  WORK_TIME_EXPORT_DEFAULT_COLUMN_IDS,
  createWorkTimeExportColumns,
  downloadWorkTimeEwidencjaPdf as downloadSharedWorkTimeEwidencjaPdf,
  validateWorkTimeExportDateRange,
} from '../work_time_export.js'

export const route = 'workerTime'
export const viewId = 'view-workerTime'
export { template }

export function createWorkerTimeFeature(ctx) {
  const {
    appState,
    createBindingHelpers,
    dashboardWorkerSurnameDisplayName,
    dashboardWorkerSurnameSortKey,
    durationSecondsToHm,
    ensureJsPdfLoaded,
    ensurePdfUnicodeFont,
    escapeHtml,
    getWorkers,
    getWorkdays,
    normalizeSearchText,
    pad2,
    paginate,
    setPdfUnicodeFont,
    setSubwelcomeMetric,
    setupResizableGridTable,
    showTransientNotice,
    toIso,
    workerDetailDateKeyFromIso,
    workerDetailComputeRangeSeconds,
    workerDetailDateKeyToLabel,
    workerDetailIsoToHm,
    ymdToIsoRangeEnd,
    workStatusIntervalFromTimes,
    ymdToIsoRangeStart,
  } = ctx

  function workerTimeExportDeps() {
    return {
      dashboardWorkerSurnameDisplayName,
      dashboardWorkerSurnameSortKey,
      durationSecondsToHm,
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

  function workerTimeExportColumns() {
    return createWorkTimeExportColumns(workerTimeExportDeps())
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

  function workerTimeDisplayName(worker = {}) {
    return dashboardWorkerSurnameDisplayName(worker?.name || worker?.login || worker?.id || '-')
  }

  function workerTimeSearchHaystack(worker = {}) {
    return [
      worker?.workerId,
      worker?.id,
      worker?.name,
      workerTimeDisplayName(worker),
      worker?.login,
      worker?.type,
      worker?.role,
      worker?.phone,
      worker?.email,
    ]
      .map((value) => normalizeSearchText(value))
      .join(' ')
  }

  function workerTimeCompareByDisplayName(left = {}, right = {}) {
    const leftLabel = workerTimeDisplayName(left)
    const rightLabel = workerTimeDisplayName(right)
    const byName = leftLabel.localeCompare(rightLabel, 'pl', { numeric: true, sensitivity: 'base' })
    if (byName) {
      return byName
    }

    return String(left?.workerId ?? left?.id ?? left?.login ?? '').localeCompare(
      String(right?.workerId ?? right?.id ?? right?.login ?? ''),
      'pl',
      { numeric: true, sensitivity: 'base' },
    )
  }

  function workerTimeSetSearchSuggestionsOpen(isOpen) {
    const root = document.getElementById('wtQSuggestions')
    if (!root) {
      return
    }

    root.hidden = !isOpen
  }

  function workerTimeRenderSearchSuggestions({ expandOnEmpty = false } = {}) {
    const input = document.getElementById('wtQ')
    const root = document.getElementById('wtQSuggestions')
    if (!(input instanceof HTMLInputElement) || !root) {
      return
    }

    const query = normalizeSearchText(input.value)
    if (!query && !expandOnEmpty) {
      root.innerHTML = ''
      workerTimeSetSearchSuggestionsOpen(false)
      return
    }

    const rows = [...(Array.isArray(appState.workerTimeRows) ? appState.workerTimeRows : [])]
      .filter((worker) => !query || workerTimeSearchHaystack(worker).includes(query))
      .sort(workerTimeCompareByDisplayName)
      .slice(0, 30)

    if (!rows.length) {
      root.innerHTML = '<div class="wt-worker-suggestion-empty">Brak dopasowanych osób.</div>'
      workerTimeSetSearchSuggestionsOpen(true)
      return
    }

    root.innerHTML = rows
      .map((worker) => {
        const label = workerTimeDisplayName(worker)
        const original = String(worker?.name ?? '').trim()
        const meta = [worker?.workerId || worker?.id, worker?.type || worker?.role]
          .map((value) => String(value ?? '').trim())
          .filter(Boolean)
          .join(' · ')
        return `
          <button
            class="wt-worker-suggestion"
            type="button"
            data-wt-worker-label="${escapeHtml(label)}"
            data-wt-worker-name="${escapeHtml(original)}"
          >
            <span>${escapeHtml(label)}</span>
            ${meta ? `<small>${escapeHtml(meta)}</small>` : ''}
          </button>
        `
      })
      .join('')
    workerTimeSetSearchSuggestionsOpen(true)
  }

  function workerTimePickSearchSuggestion(button) {
    if (!(button instanceof HTMLElement)) {
      return
    }

    const input = document.getElementById('wtQ')
    if (!(input instanceof HTMLInputElement)) {
      return
    }

    const label = String(button.getAttribute('data-wt-worker-label') ?? '').trim()
    if (label) {
      input.value = label
    }
    workerTimeSetSearchSuggestionsOpen(false)
    filterWorkerTimeTable({ resetPage: true })
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

      return workerTimeSearchHaystack(worker).includes(q)
    }).sort(workerTimeCompareByDisplayName)
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
        (worker) => {
          const displayName = workerTimeDisplayName(worker)
          return `
        <div class="events-row${workerTimeIsSelected(workerTimeSelectionKey(worker)) ? ' is-selected' : ''}">
          <div class="events-select-col"><input type="checkbox" data-wt-select="${escapeHtml(workerTimeSelectionKey(worker))}" ${workerTimeIsSelected(workerTimeSelectionKey(worker)) ? 'checked' : ''} aria-label="Zaznacz pracownika ${escapeHtml(worker.name || worker.login || worker.id || '')}" /></div>
          <div class="mono">${escapeHtml(worker.workerId || worker.id || '-')}</div>
          <div>${escapeHtml(displayName)}</div>
          <div>${escapeHtml(worker.type || '-')}</div>
          <div><span class="pill ${worker.active ? 'pill-true' : 'pill-false'}">${escapeHtml(workerBoolLabel(worker.active))}</span></div>
          <div><button class="btn2" type="button" data-worker-login="${escapeHtml(worker.login || worker.id || '')}" data-worker-name="${escapeHtml(worker.name || '')}">Pokaż</button></div>
        </div>
      `
        },
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

  function workerTimeExportWorkerName(value) {
    return dashboardWorkerSurnameDisplayName(value)
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
      getValue: (row) => workerTimeExportWorkerName(row.workerName || '-'),
    },
    {
      id: 'workerId',
      label: 'ID pracownika',
      weight: 1.1,
      getValue: (row) => row.workerId || '-',
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

  const WORKER_TIME_EXPORT_DEFAULT_COLUMNS = new Set(['date', 'worker', 'start', 'stop', 'work', 'break'])

  function previousMonthRangeYmd(reference = new Date()) {
    const source = reference instanceof Date ? reference : new Date(reference)
    const safeDate = Number.isFinite(source.getTime()) ? source : new Date()
    const year = safeDate.getFullYear()
    const month = safeDate.getMonth()
    const first = new Date(year, month - 1, 1)
    const last = new Date(year, month, 0)
    return {
      fromYmd: `${first.getFullYear()}-${pad2(first.getMonth() + 1)}-${pad2(first.getDate())}`,
      toYmd: `${last.getFullYear()}-${pad2(last.getMonth() + 1)}-${pad2(last.getDate())}`,
    }
  }

  function workerTimeResetExportOptions() {
    document.querySelectorAll('[data-wt-export-col]').forEach((checkbox) => {
      checkbox.checked = WORK_TIME_EXPORT_DEFAULT_COLUMN_IDS.includes(String(checkbox.value ?? '').trim())
    })

    const portrait = document.querySelector('input[name="wtExportOrientation"][value="p"]')
    if (portrait) {
      portrait.checked = true
    }

    const { fromYmd, toYmd } = previousMonthRangeYmd()
    const fromInput = document.getElementById('wtExportFrom')
    const toInput = document.getElementById('wtExportTo')
    if (fromInput) {
      fromInput.value = fromYmd
    }
    if (toInput) {
      toInput.value = toYmd
    }
  }

  function workerTimeReadExportOptions() {
    const selectedIds = new Set(
      [...document.querySelectorAll('[data-wt-export-col]')]
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => String(checkbox.value ?? '').trim()),
    )

    const columns = workerTimeExportColumns().filter((column) => selectedIds.has(column.id))
    const orientationRaw = String(
      document.querySelector('input[name="wtExportOrientation"]:checked')?.value ?? 'p',
    ).trim()
    const orientation = orientationRaw === 'l' ? 'l' : 'p'
    const fromYmd = String(document.getElementById('wtExportFrom')?.value ?? '').trim()
    const toYmd = String(document.getElementById('wtExportTo')?.value ?? '').trim()
    const range = validateWorkTimeExportDateRange({ fromYmd, toYmd }, alert)
    if (!range) {
      return null
    }

    return { columns, orientation, fromYmd: range.fromYmd, toYmd: range.toYmd }
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

      const result = await downloadSharedWorkTimeEwidencjaPdf({
        deps: workerTimeExportDeps(),
        orgId: appState.session.orgId,
        workers,
        workerRows: appState.workerTimeRows,
        options: exportOptions,
      })
      if (result) {
        showTransientNotice(`Pobrano PDF ewidencji. Osoby: ${result.workerCount}, wpisy: ${result.rowCount}.`)
      }
      return

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

  async function fetchWorkersForCurrentSession(force = false) {
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
      const workers = await getWorkers(appState.session.orgId, { forceRefresh: force })
      const sortedWorkers = [...workers].sort(workerTimeCompareByDisplayName)
      appState.workers = workers
      appState.workersLoaded = true
      appState.workerTimeRows = sortedWorkers
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
      if (activeInput) activeInput.value = '1'
      workerTimeSetSearchSuggestionsOpen(false)
      void fetchWorkersForCurrentSession()
    })

    binding.add(document.getElementById('wtQ'), 'focus', () => {
      workerTimeRenderSearchSuggestions({ expandOnEmpty: true })
    })
    binding.add(document.getElementById('wtQ'), 'input', () => {
      workerTimeRenderSearchSuggestions({ expandOnEmpty: true })
      filterWorkerTimeTable({ resetPage: true })
    })
    binding.add(document.getElementById('wtQ'), 'keydown', (event) => {
      if (event.key === 'ArrowDown') {
        const firstSuggestion = document.querySelector('#wtQSuggestions .wt-worker-suggestion')
        if (firstSuggestion instanceof HTMLElement) {
          event.preventDefault()
          firstSuggestion.focus()
        }
        return
      }

      if (event.key === 'Escape') {
        workerTimeSetSearchSuggestionsOpen(false)
        return
      }

      if (event.key === 'Enter') {
        const firstSuggestion = document.querySelector('#wtQSuggestions:not([hidden]) .wt-worker-suggestion')
        if (firstSuggestion instanceof HTMLElement) {
          event.preventDefault()
          workerTimePickSearchSuggestion(firstSuggestion)
        } else {
          filterWorkerTimeTable({ resetPage: true })
        }
      }
    })
    binding.add(document.getElementById('wtQ'), 'blur', () => {
      window.setTimeout(() => workerTimeSetSearchSuggestionsOpen(false), 140)
    })
    binding.add(document.getElementById('wtQSuggestions'), 'mousedown', (event) => {
      event.preventDefault()
    })
    binding.add(document.getElementById('wtQSuggestions'), 'click', (event) => {
      const button = event.target?.closest?.('.wt-worker-suggestion')
      if (button) {
        workerTimePickSearchSuggestion(button)
      }
    })
    binding.add(document.getElementById('wtQSuggestions'), 'keydown', (event) => {
      const currentButton = event.target?.closest?.('.wt-worker-suggestion')
      if (!(currentButton instanceof HTMLElement)) {
        return
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        workerTimePickSearchSuggestion(currentButton)
        return
      }

      if (event.key === 'Escape') {
        workerTimeSetSearchSuggestionsOpen(false)
        document.getElementById('wtQ')?.focus()
        return
      }

      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
        return
      }

      event.preventDefault()
      const buttons = [...document.querySelectorAll('#wtQSuggestions .wt-worker-suggestion')]
      const index = buttons.indexOf(currentButton)
      const nextIndex =
        event.key === 'ArrowDown'
          ? Math.min(buttons.length - 1, index + 1)
          : Math.max(0, index - 1)
      const nextButton = buttons[nextIndex]
      if (nextButton instanceof HTMLElement) {
        nextButton.focus()
      }
    })

    ;['wtType', 'wtWorkerId'].forEach((id) => {
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

  return {
    fetch: fetchWorkersForCurrentSession,
    bind: bindWorkerTimeViewFunctions,
    syncSelectionUi: workerTimeSyncSelectionUi,
  }
}
