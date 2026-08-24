import {
  aggregateWorkTimeDay,
  markMultipleWorkdaysForBusinessDate,
  formatWorkDurationHms,
  workSessionAccountingFromRow,
  workdayPresenceFromRows,
} from './workIntervals.js'

export const WORK_TIME_EXPORT_DEFAULT_COLUMN_IDS = ['date', 'worker', 'start', 'stop', 'work', 'break']

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/
const WORK_TIME_EXPORT_MAX_ROWS = 20000

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

function applySessionAccounting(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const next = { ...row }
    const accounting = workSessionAccountingFromRow({
      ...row,
      workIntervals: Array.isArray(row?.workIntervals) ? row.workIntervals : [],
    })
    const durationSec = accounting.closedSessionsSec
    const presence = workdayPresenceFromRows([row])
    const realWorkSec = durationSec
    Object.assign(next, accounting)
    next.startIso = presence.startAt || row.startIso
    next.endIso = presence.endAt || row.endIso
    next.rawDurationSec = Math.max(0, Math.floor(Number(row.durationSec ?? 0) || 0))
    next.durationSec = durationSec
    next.realWorkSec = realWorkSec
    next.breakSec = Math.max(0, Number(row.breakSec ?? 0) || 0)
    next.netSec = realWorkSec
    return next
  })
}

function groupSessionAccountingByWorkerDay(rows = []) {
  const groups = new Map()
  ;(Array.isArray(rows) ? rows : []).forEach((row) => {
    const key = `${String(row?.workerLogin ?? row?.workerId ?? row?.workerName ?? '').trim().toLowerCase()}|${String(row?.dayKey ?? '').trim()}`
    const bucket = groups.get(key) ?? []
    bucket.push(row)
    groups.set(key, bucket)
  })
  return [...groups.values()].flatMap((sourceRows) => {
    const first = sourceRows[0] ?? {}
    const day = aggregateWorkTimeDay(sourceRows)
    const sessions = Array.isArray(day.sessions) ? day.sessions : []
    if (!sessions.length) {
      return [{
        ...first,
        activities: day.activities,
        breakSec: 0,
        closedSessionsSec: 0,
        confirmedSec: 0,
        durationSec: 0,
        endIso: '',
        integrityIssues: day.integrityIssues,
        integrityState: day.integrityState,
        netSec: 0,
        openSessionCount: day.openSessionCount,
        openSessions: day.openSessions,
        provisionalSec: 0,
        realWorkSec: 0,
        sessions: [],
        sourceRows,
        startIso: '',
        workIntervals: [],
      }]
    }

    return sessions.map((session, sessionIndex) => {
      const sourceIds = new Set([
        ...(Array.isArray(session?.sourceWorkdayIds) ? session.sourceWorkdayIds : []),
        session?.workdayId,
      ].map((value) => String(value ?? '').trim()).filter(Boolean))
      const sessionSourceRows = sourceRows.filter((row) => sourceIds.has(String(row?.workdayId ?? row?.id ?? '').trim()))
      const sessionSource = sessionSourceRows[0] ?? first
      const sessionSec = session?.isValid && !session?.isOpen
        ? Math.max(0, Math.floor(Number(session?.durationSec ?? 0) || 0))
        : 0
      const breakSec = Math.max(0, Math.floor(Number(
        session?.breakSec ?? session?.pauseTotalSec ?? session?.pauseSec ?? sessionSource?.breakSec ?? 0,
      ) || 0))
      return {
        ...first,
        ...sessionSource,
        activities: Array.isArray(session?.activities) ? session.activities : [],
        breakSec,
        closedSessionsSec: sessionSec,
        confirmedSec: sessionSec,
        durationSec: sessionSec,
        endIso: session?.endAt ?? '',
        integrityIssues: day.integrityIssues,
        integrityState: day.integrityState,
        netSec: sessionSec,
        openSessionCount: session?.isOpen ? 1 : 0,
        openSessions: session?.isOpen ? [session] : [],
        provisionalSec: 0,
        realWorkSec: sessionSec,
        sessionNumber: Math.max(1, Number(session?.sessionNumber ?? sessionIndex + 1) || sessionIndex + 1),
        sessions: [session],
        sourceRows: sessionSourceRows.length ? sessionSourceRows : [sessionSource],
        startIso: session?.startAt ?? '',
        workIntervals: [session],
        workdayId: String(session?.workdayId ?? sessionSource?.workdayId ?? '').trim(),
      }
    })
  })
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
      label: 'Start dnia',
      weight: 1.0,
      getValue: (row) => deps.workerDetailIsoToHm(row.startIso),
    },
    {
      id: 'stop',
      label: 'Koniec dnia',
      weight: 1.0,
      getValue: (row) => deps.workerDetailIsoToHm(row.endIso),
    },
    {
      id: 'work',
      label: 'Czas sesji',
      weight: 1.1,
      getValue: (row) => formatWorkDurationHms(row.durationSec),
    },
    {
      id: 'net',
      label: 'Realny czas pracy',
      weight: 1.2,
      getValue: (row) => formatWorkDurationHms(row.netSec),
    },
    {
      id: 'break',
      label: 'Przerwa',
      weight: 1.0,
      getValue: (row) => formatWorkDurationHms(row.breakSec),
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
    pageSize: WORK_TIME_EXPORT_MAX_ROWS,
  })

  if (response?.hasNext === true) {
    throw new Error(
      `Eksport przekracza bezpieczny limit ${WORK_TIME_EXPORT_MAX_ROWS} rekordów. Zawęź daty lub wybór pracowników.`,
    )
  }

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
      const computedSec =
        Number.isFinite(durationRaw) && durationRaw > 0
          ? Math.floor(durationRaw)
          : 0
      const breakSec = Math.max(0, Number(item?.breakSec ?? item?.pauseTotalSec ?? 0) || 0)
      return {
        workdayId: String(item?.workdayId ?? item?.id ?? '').trim(),
        workerId:
          String(resolvedWorker?.workerId ?? item?.workerId ?? item?.id ?? '').trim() ||
          '-',
        workerName: workerDisplayName(deps, sourceWorkerName),
        workerSourceName: sourceWorkerName,
        workerLogin:
          String(resolvedWorker?.workerLogin ?? item?.workerLogin ?? item?.workerId ?? '').trim() || '-',
        workerType: String(resolvedWorker?.workerType ?? item?.workerType ?? item?.role ?? '').trim() || '-',
        dayKey,
        businessDateYmd: String(item?.businessDateYmd ?? dayKey).trim(),
        startIso,
        endIso,
        durationSec: Math.max(0, computedSec),
        recordedDurationSec: Math.max(0, Number(item?.recordedDurationSec ?? 0) || 0),
        durationSource: String(item?.durationSource ?? '').trim(),
        activities: Array.isArray(item?.activities) ? item.activities : [],
        workIntervals: Array.isArray(item?.workIntervals) ? item.workIntervals : [],
        closedSessionsSec: Math.max(0, Number(item?.closedSessionsSec ?? 0) || 0),
        openSessions: Array.isArray(item?.openSessions) ? item.openSessions : [],
        confirmedSec: Math.max(0, Number(item?.confirmedSec ?? 0) || 0),
        provisionalSec: Math.max(0, Number(item?.provisionalSec ?? 0) || 0),
        integrityState: String(item?.integrityState ?? '').trim(),
        integrityIssues: Array.isArray(item?.integrityIssues) ? item.integrityIssues : [],
        sessionSourceAvailable: item?.sessionSourceAvailable === true,
        breakSec,
        netSec: Math.max(0, computedSec),
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

  const accountedRows = groupSessionAccountingByWorkerDay(applySessionAccounting(rows)).filter((row) =>
    Math.max(0, Number(row?.durationSec ?? 0) || 0) > 0 ||
    (row?.integrityState && row.integrityState !== 'COMPLETE'),
  )
  return markMultipleWorkdaysForBusinessDate(accountedRows)
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
    const summaryLine = `Wpisy: ${group.rows.length} | Czas pracy: ${formatWorkDurationHms(group.totalWorkSec)} | Przerwy: ${formatWorkDurationHms(group.totalBreakSec)} | Realny: ${formatWorkDurationHms(group.totalNetSec)}`

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
