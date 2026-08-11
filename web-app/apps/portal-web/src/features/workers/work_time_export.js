import { workIntervalsFromRow, workIntervalsTotalSeconds } from './workIntervals.js'

export const WORK_TIME_EXPORT_DEFAULT_COLUMN_IDS = ['date', 'worker', 'start', 'stop', 'work', 'break']

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

function normalizeText(deps, value) {
  return deps.normalizeSearchText(String(value ?? '').trim())
}

function workerIdentityValues(worker = {}) {
  return [
    worker.login,
    worker.workerLogin,
    worker.workerId,
    worker.id,
  ]
}

function workerNameValue(worker = {}) {
  return String(worker.name ?? worker.workerName ?? worker.fullName ?? '').trim()
}

function workerDisplayName(deps, value) {
  return deps.dashboardWorkerSurnameDisplayName(String(value ?? '').trim() || '-')
}

function rowDayKey(deps, row = {}) {
  const direct = String(row.dayKey ?? '').trim()
  if (YMD_RE.test(direct)) {
    return direct
  }
  return deps.workerDetailDateKeyFromIso(row.startAt || row.endAt)
}

function overlapGroupKey(deps, row = {}) {
  const loginKey = normalizeText(deps, row.workerLogin)
  const nameKey = normalizeText(deps, row.workerName)
  const workerKey = loginKey && loginKey !== '-' ? loginKey : nameKey || '-'
  const dayKey = String(row.dayKey ?? '').trim() || deps.workerDetailDateKeyFromIso(row.startIso || row.endIso)
  return `${workerKey}|${dayKey || '-'}`
}

function applyOverlapAccounting(deps, rows = []) {
  const activeRowsByGroup = new Map()
  const output = []

  rows.forEach((row) => {
    const next = { ...row }
    if (Array.isArray(row?.workIntervals) && row.workIntervals.length) {
      const workIntervals = workIntervalsFromRow(row)
      const durationSec = workIntervalsTotalSeconds(workIntervals)
      if (durationSec <= 0) return

      next.workIntervals = workIntervals
      next.rawDurationSec = Math.max(0, Math.floor(Number(row.durationSec ?? 0) || 0))
      next.durationSec = durationSec
      next.breakSec = Math.min(Math.max(0, Number(row.breakSec ?? 0) || 0), durationSec)
      next.netSec = Math.max(0, durationSec - next.breakSec)
      output.push(next)
      return
    }
    const interval = deps.workStatusIntervalFromTimes(row.startIso, row.endIso, row.durationSec)
    if (!interval) {
      if (Math.max(0, Number(next.durationSec ?? 0) || 0) > 0) {
        output.push(next)
      }
      return
    }

    const groupKey = overlapGroupKey(deps, row)
    const originalDurationSec = Math.max(0, Math.floor(Number(row.durationSec ?? 0) || 0))
    const originalBreakSec = Math.max(0, Math.floor(Number(row.breakSec ?? 0) || 0))
    next.rawDurationSec = originalDurationSec
    next.durationSec = Math.max(0, Math.floor((interval.endTs - interval.startTs) / 1000))
    next.breakSec = Math.min(originalBreakSec, next.durationSec)
    next.netSec = Math.max(0, next.durationSec - next.breakSec)
    next.startIso = interval.startIso
    next.endIso = interval.endIso

    const active = activeRowsByGroup.get(groupKey)
    if (!active || interval.startTs > active.interval.endTs) {
      const entry = { row: next, interval: { startTs: interval.startTs, endTs: interval.endTs } }
      activeRowsByGroup.set(groupKey, entry)
      output.push(next)
      return
    }

    active.interval.startTs = Math.min(active.interval.startTs, interval.startTs)
    active.interval.endTs = Math.max(active.interval.endTs, interval.endTs)
    active.row.startIso = new Date(active.interval.startTs).toISOString()
    active.row.endIso = new Date(active.interval.endTs).toISOString()
    active.row.rawDurationSec = Math.max(0, Number(active.row.rawDurationSec ?? 0) || 0) + originalDurationSec
    active.row.durationSec = Math.max(0, Math.floor((active.interval.endTs - active.interval.startTs) / 1000))
    active.row.breakSec = Math.min(
      active.row.durationSec,
      Math.max(0, Number(active.row.breakSec ?? 0) || 0) + originalBreakSec,
    )
    active.row.netSec = Math.max(0, active.row.durationSec - active.row.breakSec)
  })

  return output
}

export function createWorkTimeExportColumns(deps) {
  return [
    {
      id: 'date',
      label: 'Data',
      weight: 1.0,
      getValue: (row) => deps.workerDetailDateKeyToLabel(row.dayKey),
    },
    {
      id: 'worker',
      label: 'Pracownik',
      weight: 1.8,
      getValue: (row) => workerDisplayName(deps, row.workerName || '-'),
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
      getValue: (row) => deps.workerDetailIsoToHm(row.startIso),
    },
    {
      id: 'stop',
      label: 'Koniec pracy',
      weight: 1.0,
      getValue: (row) => deps.workerDetailIsoToHm(row.endIso),
    },
    {
      id: 'work',
      label: 'Czas pracy',
      weight: 1.1,
      getValue: (row) => deps.durationSecondsToHm(row.durationSec),
    },
    {
      id: 'net',
      label: 'Realny czas pracy',
      weight: 1.2,
      getValue: (row) => deps.durationSecondsToHm(row.netSec),
    },
    {
      id: 'break',
      label: 'Przerwa',
      weight: 1.0,
      getValue: (row) => deps.durationSecondsToHm(row.breakSec),
    },
    {
      id: 'status',
      label: 'Status',
      weight: 1.0,
      getValue: (row) => row.status || '-',
    },
  ]
}

export function createDefaultWorkTimeExportColumns(deps) {
  const selectedIds = new Set(WORK_TIME_EXPORT_DEFAULT_COLUMN_IDS)
  return createWorkTimeExportColumns(deps).filter((column) => selectedIds.has(column.id))
}

export function validateWorkTimeExportDateRange({ fromYmd, toYmd }, alertFn = window.alert) {
  const from = String(fromYmd ?? '').trim()
  const to = String(toYmd ?? '').trim()

  if (!YMD_RE.test(from) || !YMD_RE.test(to)) {
    alertFn('Wybierz poprawny zakres dat (OD i DO).')
    return null
  }

  if (from > to) {
    alertFn('Data "Od" nie moze byc pozniejsza niz "Do".')
    return null
  }

  return { fromYmd: from, toYmd: to }
}

function buildWorkerLookups(deps, workerRows = []) {
  const workerLookupByLogin = new Map()
  const workerLookupByName = new Map()

  workerRows.forEach((worker) => {
    const login = String(worker.login ?? worker.workerLogin ?? worker.workerId ?? worker.id ?? '').trim()
    const name = workerNameValue(worker)
    const workerId = String(worker.workerId ?? worker.id ?? '').trim() || '-'
    const workerType = String(worker.type ?? worker.role ?? worker.workerType ?? '').trim() || '-'
    const displayName = name || workerId
    const entry = { workerId, workerName: displayName, workerLogin: login || '-', workerType }

    workerIdentityValues(worker).forEach((value) => {
      const key = normalizeText(deps, value)
      if (key) {
        workerLookupByLogin.set(key, entry)
      }
    })

    if (name) {
      workerLookupByName.set(normalizeText(deps, name), entry)
    }
  })

  return { workerLookupByLogin, workerLookupByName }
}

export async function buildWorkTimeExportRowsForWorkers({
  deps,
  orgId,
  workers = [],
  workerRows = [],
  fromYmd,
  toYmd,
}) {
  const selectedLogins = new Set(
    workers
      .flatMap(workerIdentityValues)
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)
      .map((value) => normalizeText(deps, value)),
  )
  const selectedNames = new Set(
    workers
      .map(workerNameValue)
      .filter(Boolean)
      .map((value) => normalizeText(deps, value)),
  )
  const { workerLookupByLogin, workerLookupByName } = buildWorkerLookups(deps, workerRows)

  const response = await deps.getWorkdays(orgId, {
    source: 'worktime',
    fromIso: deps.ymdToIsoRangeStart(fromYmd),
    toIso: deps.ymdToIsoRangeEnd(toYmd),
    page: 1,
    pageSize: 100000,
  })

  const rows = (response?.items ?? [])
    .filter((item) => {
      if (!selectedLogins.size && !selectedNames.size) {
        return true
      }
      const loginKey = normalizeText(deps, item?.workerLogin)
      const nameKey = normalizeText(deps, item?.workerName)
      return selectedLogins.has(loginKey) || selectedNames.has(nameKey)
    })
    .map((item) => {
      const loginKey = normalizeText(deps, item?.workerLogin)
      const nameKey = normalizeText(deps, item?.workerName)
      const resolvedWorker = workerLookupByLogin.get(loginKey) || workerLookupByName.get(nameKey) || null
      const sourceWorkerName =
        String(resolvedWorker?.workerName ?? item?.workerName ?? resolvedWorker?.workerId ?? item?.workerId ?? '').trim() || '-'
      const dayKey = rowDayKey(deps, item)
      const startIso = deps.toIso(item?.startAt)
      const endIso = deps.toIso(item?.endAt)
      const durationRaw = Number(item?.durationSec)
      const rangeSec = deps.workerDetailComputeRangeSeconds(startIso, endIso)
      const computedSec =
        Number.isFinite(durationRaw) && durationRaw > 0
          ? Math.floor(durationRaw)
          : rangeSec
      const breakSec = Math.max(0, Number(item?.breakSec ?? item?.pauseTotalSec ?? 0) || 0)
      return {
        workerId:
          String(resolvedWorker?.workerId ?? item?.workerId ?? item?.id ?? '').trim() ||
          '-',
        workerName: workerDisplayName(deps, sourceWorkerName),
        workerSourceName: sourceWorkerName,
        workerLogin:
          String(resolvedWorker?.workerLogin ?? item?.workerLogin ?? item?.workerId ?? '').trim() || '-',
        workerType: String(resolvedWorker?.workerType ?? item?.workerType ?? item?.role ?? '').trim() || '-',
        dayKey,
        startIso,
        endIso,
        durationSec: Math.max(0, computedSec),
        workIntervals: Array.isArray(item?.workIntervals) ? item.workIntervals : [],
        breakSec,
        netSec: Math.max(0, computedSec - breakSec),
        status: String(item?.status ?? '').trim() || '-',
      }
    })
    .sort((left, right) => {
      const byName = deps.dashboardWorkerSurnameSortKey(left.workerName).localeCompare(
        deps.dashboardWorkerSurnameSortKey(right.workerName),
        'pl',
        { sensitivity: 'base' },
      )
      if (byName !== 0) {
        return byName
      }
      if (left.dayKey !== right.dayKey) {
        return left.dayKey < right.dayKey ? -1 : 1
      }
      const leftStart = new Date(deps.toIso(left.startIso) || 0).getTime()
      const rightStart = new Date(deps.toIso(right.startIso) || 0).getTime()
      return leftStart - rightStart
    })

  return applyOverlapAccounting(deps, rows).filter((row) => Math.max(0, Number(row?.durationSec ?? 0) || 0) > 0)
}

export async function downloadWorkTimeEwidencjaPdf({
  deps,
  orgId,
  workers = [],
  workerRows = [],
  options,
}) {
  if (!orgId) {
    return null
  }
  if (!options?.columns?.length) {
    throw new Error('Wybierz co najmniej jedna kolumne do eksportu.')
  }
  if (!workers.length) {
    throw new Error('Brak pracownikow do eksportu.')
  }

  const exportRows = await buildWorkTimeExportRowsForWorkers({
    deps,
    orgId,
    workers,
    workerRows,
    fromYmd: options.fromYmd,
    toYmd: options.toYmd,
  })
  if (!exportRows.length) {
    throw new Error('Brak danych ewidencji pracy dla wybranego zakresu.')
  }

  const groups = new Map()
  exportRows.forEach((row) => {
    const groupKey = `${normalizeText(deps, row.workerLogin)}::${normalizeText(deps, row.workerName)}`
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
    deps.dashboardWorkerSurnameSortKey(left.workerName).localeCompare(deps.dashboardWorkerSurnameSortKey(right.workerName), 'pl', {
      sensitivity: 'base',
    }),
  )

  const fromYmd = options.fromYmd
  const toYmd = options.toYmd
  const fromLabel = deps.workerDetailDateKeyToLabel(fromYmd)
  const toLabel = deps.workerDetailDateKeyToLabel(toYmd)

  const JsPdf = await deps.ensureJsPdfLoaded()
  const pdf = new JsPdf({ orientation: options.orientation, unit: 'mm', format: 'a4' })
  await deps.ensurePdfUnicodeFont(pdf)
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const left = 10
  const right = pageWidth - 10
  const availableWidth = right - left
  const totalWeight =
    options.columns.reduce((sum, column) => sum + (Number(column.weight) || 1), 0) || 1
  const columns = options.columns.map((column) => ({
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
    while (reduced.length > 1 && pdf.getTextWidth(`${reduced}...`) > maxWidth) {
      reduced = reduced.slice(0, -1)
    }
    return `${reduced}...`
  }

  const drawTableHeader = (topY) => {
    deps.setPdfUnicodeFont(pdf, 'bold')
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
    const subtitle = `Typ: ${group.workerType} | Zakres: ${fromLabel} - ${toLabel}`
    const summaryLine = `Wpisy: ${group.rows.length} | Czas pracy: ${deps.durationSecondsToHm(group.totalWorkSec)} | Przerwy: ${deps.durationSecondsToHm(group.totalBreakSec)} | Realny: ${deps.durationSecondsToHm(group.totalNetSec)}`

    deps.setPdfUnicodeFont(pdf, 'bold')
    pdf.setFontSize(12)
    pdf.text('Ewidencja pracy pracownika', left, 12)
    pdf.setFontSize(11)
    pdf.text(workerTitle, left, 18)
    deps.setPdfUnicodeFont(pdf, 'normal')
    pdf.setFontSize(9)
    pdf.text(subtitle, left, 23)
    pdf.text(summaryLine, left, 28)

    let y = 35
    drawTableHeader(y)
    y += 6
    deps.setPdfUnicodeFont(pdf, 'normal')
    pdf.setFontSize(8.2)

    group.rows.forEach((row, rowIndex) => {
      if (y > pageHeight - 10) {
        pdf.addPage()
        deps.setPdfUnicodeFont(pdf, 'bold')
        pdf.setFontSize(10)
        pdf.text(`Ewidencja pracy - ${workerTitle} (cd.)`, left, 12)
        deps.setPdfUnicodeFont(pdf, 'normal')
        pdf.setFontSize(8.5)
        pdf.text(`${fromLabel} - ${toLabel}`, left, 17)
        y = 24
        drawTableHeader(y)
        y += 6
        deps.setPdfUnicodeFont(pdf, 'normal')
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
  return { filename, workerCount: groupedRows.length, rowCount: exportRows.length }
}

export function workTimeExportErrorMessage(error) {
  const rawMessage = error instanceof Error ? error.message : 'Nie udalo sie pobrac ewidencji pracy.'
  const upper = rawMessage.toUpperCase()
  return upper.includes('TOO MANY CONNECTIONS') || upper.includes('RESOURCE_EXHAUSTED')
    ? 'Baza danych jest chwilowo przeciazona. Sprobuj ponownie za chwile.'
    : rawMessage
}
