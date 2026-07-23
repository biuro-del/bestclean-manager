import template from './template.html?raw'
import {
  OWN_WORKDAY_EDIT_DENIED_MESSAGE,
  isOwnWorkdayEditBlocked,
} from '../workdayEditAccess.js'
import { workIntervalsFromRow } from '../workIntervals.js'

export const route = 'workerTimeDetail'
export const viewId = 'view-workerTimeDetail'
export { template }

export function createWorkerTimeDetailFeature(ctx) {
  const {
    appState,
    canManageWorkers,
    createBindingHelpers,
    createWorkday,
    durationSecondsToHm,
    ensureJsPdfLoaded,
    ensurePdfUnicodeFont,
    escapeHtml,
    firstDayOfCurrentMonthYmd,
    getWorkerTime,
    pad2,
    paginate,
    refreshWorkerAccountTimeAfterWorkdaySave,
    setPdfUnicodeFont,
    todayYmd,
    toIso,
    updateWorkday,
    ymdToIsoRangeEnd,
    ymdToIsoRangeStart,
  } = ctx

  const WORKER_DETAIL_COLUMN_WIDTHS_STORAGE_KEY = 'portal.workerDetailColumnWidths'
  const WORKER_DETAIL_COLUMN_DEFAULT_WIDTHS = [42, 88, 168, 138, 108, 108, 112, 138, 102, 126, 90]
  const WORKER_DETAIL_COLUMN_MIN_WIDTHS = [34, 76, 120, 108, 92, 92, 96, 116, 88, 104, 72]
  const WORKER_DETAIL_COLUMN_MAX_WIDTH = 520
  const WORKER_DETAIL_RESIZABLE_COLUMN_INDEXES = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  const WORKER_DETAIL_COLUMN_RESIZE_CLASS = 'wtd-col-resize-active'

  let workerDetailColumnDragState = null

  function workerDetailDefaultColumnWidths() {
    return [...WORKER_DETAIL_COLUMN_DEFAULT_WIDTHS]
  }

  function workerDetailColumnMinWidth(colIndex) {
    const value = Number(WORKER_DETAIL_COLUMN_MIN_WIDTHS[colIndex])
    return Number.isFinite(value) ? value : 72
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

  function workStatusTimestamp(value) {
    const iso = toIso(value)
    if (!iso) {
      return 0
    }

    const timestamp = new Date(iso).getTime()
    return Number.isFinite(timestamp) ? timestamp : 0
  }

  function workStatusYmdFromTimestamp(timestamp) {
    const normalized = Number(timestamp ?? 0)
    if (!Number.isFinite(normalized) || normalized <= 0) {
      return ''
    }

    const date = new Date(normalized)
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
  }

  function workStatusIntervalFromTimes(startAt, endAt, durationSec = 0) {
    let startTs = workStatusTimestamp(startAt)
    let endTs = workStatusTimestamp(endAt)
    const duration = Number(durationSec ?? 0)
    const durationMs = Number.isFinite(duration) && duration > 0 ? Math.floor(duration) * 1000 : 0

    if (startTs > 0 && endTs <= 0 && durationMs > 0) {
      endTs = startTs + durationMs
    }
    if (startTs <= 0 && endTs > 0 && durationMs > 0) {
      startTs = endTs - durationMs
    }
    if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || startTs <= 0 || endTs <= startTs) {
      return null
    }

    return {
      startTs,
      endTs,
      startIso: new Date(startTs).toISOString(),
      endIso: new Date(endTs).toISOString(),
    }
  }

  function workStatusIntervalFromRow(row) {
    return workStatusIntervalFromTimes(
      row?.startIso ?? row?.startAt ?? row?.dayStartAt,
      row?.endIso ?? row?.endAt ?? row?.dayEndAt,
      row?.durationSec ?? row?.closedSec,
    )
  }

  function workStatusIntervalsOverlap(left, right) {
    return Boolean(left && right && left.startTs < right.endTs && right.startTs < left.endTs)
  }

  function workStatusIntervalsMerge(intervals = []) {
    const sorted = intervals
      .filter(Boolean)
      .map((interval) => ({
        startTs: Number(interval.startTs ?? 0),
        endTs: Number(interval.endTs ?? 0),
      }))
      .filter((interval) => Number.isFinite(interval.startTs) && Number.isFinite(interval.endTs) && interval.endTs > interval.startTs)
      .sort((left, right) => left.startTs - right.startTs || left.endTs - right.endTs)

    const merged = []
    sorted.forEach((interval) => {
      const last = merged[merged.length - 1]
      if (!last || interval.startTs > last.endTs) {
        merged.push({ ...interval })
        return
      }

      last.endTs = Math.max(last.endTs, interval.endTs)
    })

    return merged
  }

  function workStatusIntervalsTotalSeconds(intervals = []) {
    const totalMs = workStatusIntervalsMerge(intervals).reduce(
      (sum, interval) => sum + Math.max(0, interval.endTs - interval.startTs),
      0,
    )
    return Math.floor(totalMs / 1000)
  }

  function workStatusRowsTotalSeconds(rows = []) {
    const intervals = rows.flatMap((row) => {
      if (Array.isArray(row?.workIntervals) && row.workIntervals.length) {
        return workIntervalsFromRow(row)
      }
      const interval = workStatusIntervalFromRow(row)
      return interval ? [interval] : []
    })
    return workStatusIntervalsTotalSeconds(intervals)
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

  function guardWorkerDetailOwnTimeEdit() {
    const blocked = isOwnWorkdayEditBlocked({
      session: appState.session,
      workers: appState.workers,
      targetWorker: workerDetailFindSelectedWorker(),
    })
    if (!blocked) return true

    alert(OWN_WORKDAY_EDIT_DENIED_MESSAGE)
    return false
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
        const mergedWorkSec = workStatusRowsTotalSeconds(bucket.sourceRows)
        const workSec = mergedWorkSec || workerDetailComputeRangeSeconds(bucket.startAt, bucket.endAt)
        const breakSec = Math.min(workSec, Math.max(0, Math.floor(Number(bucket.breakSec ?? 0))))
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
      alert('Brak uprawnień do edycji (ADMIN/Manager).')
      return
    }
    if (!guardWorkerDetailOwnTimeEdit()) return

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
      alert('Brak uprawnień do edycji (ADMIN/Manager).')
      return
    }
    if (!guardWorkerDetailOwnTimeEdit()) return

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
    if (!guardWorkerDetailOwnTimeEdit()) return

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
      await fetchWorkerDetailForCurrentSession({ forceRefresh: true })
      if (typeof refreshWorkerAccountTimeAfterWorkdaySave === 'function') {
        await refreshWorkerAccountTimeAfterWorkdaySave(appState.selectedWorkerLogin)
      }
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

  async function fetchWorkerDetailForCurrentSession({ resetPage = false, forceRefresh = false } = {}) {
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
        forceRefresh,
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

  return {
    fetch: fetchWorkerDetailForCurrentSession,
    bind: bindWorkerTimeDetailViewFunctions,
    workerDetailDateKeyFromIso,
    workerDetailDateKeyToLabel,
    workerDetailIsoToTime,
    workerDetailIsoToHm,
    workerDetailComputeRangeSeconds,
    workerDetailSanitizeFilename,
    workStatusYmdFromTimestamp,
    workStatusIntervalFromTimes,
    workStatusIntervalFromRow,
    workStatusIntervalsOverlap,
    workStatusIntervalsTotalSeconds,
  }
}
