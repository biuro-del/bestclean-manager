import {
  aggregateWorkTimeDay,
  formatWorkDurationHms,
  markMultipleWorkdaysForBusinessDate,
  workSessionAccountingFromRow,
  workdayPresenceFromRows,
} from './workIntervals.js'

export const WORK_TIME_EVIDENCE_DEFAULT_COLUMN_IDS = ['date', 'worker', 'start', 'stop', 'work', 'net', 'break']

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/
const WORK_TIME_EVIDENCE_EXPORT_MAX_ROWS = 20000

function normalizeText(deps = {}, value) {
  const text = String(value ?? '').trim()
  return typeof deps.normalizeSearchText === 'function'
    ? deps.normalizeSearchText(text).toLowerCase()
    : text.toLowerCase()
}

function surnameFirstLabel(value) {
  const raw = String(value ?? '').trim().replace(/\s+/g, ' ')
  if (!raw) return '-'
  if (raw.includes(',')) {
    return raw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .join(' ')
  }
  const parts = raw.split(' ').filter(Boolean)
  if (parts.length < 2) return raw
  const surname = parts[parts.length - 1]
  return [surname, ...parts.slice(0, -1)].join(' ')
}

function workerIdentityValues(worker = {}) {
  return [
    worker.login,
    worker.workerLogin,
    worker.workerId,
    worker.id,
    worker.email,
    worker.loginEmail,
  ]
}

function workerNameValue(worker = {}) {
  return String(worker.name ?? worker.workerName ?? worker.fullName ?? worker.displayName ?? '').trim()
}

function toIsoValue(deps = {}, value) {
  if (typeof deps.toIso === 'function') {
    return deps.toIso(value)
  }
  const text = String(value ?? '').trim()
  if (!text) return ''
  const date = new Date(text)
  return Number.isFinite(date.getTime()) ? date.toISOString() : ''
}

function dayKeyFromIso(iso) {
  const text = String(iso ?? '').trim()
  if (YMD_RE.test(text)) return text
  const date = new Date(text)
  if (!Number.isFinite(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function rowDayKey(deps = {}, row = {}) {
  const direct = String(row.dayKey ?? '').trim()
  if (YMD_RE.test(direct)) return direct
  if (typeof deps.workerDetailDateKeyFromIso === 'function') {
    return deps.workerDetailDateKeyFromIso(row.startAt || row.endAt || row.startIso || row.endIso)
  }
  return dayKeyFromIso(row.startAt || row.endAt || row.startIso || row.endIso)
}

function dateKeyLabel(deps = {}, value) {
  const dayKey = String(value ?? '').trim()
  if (typeof deps.dateKeyToLabel === 'function') return deps.dateKeyToLabel(dayKey)
  if (typeof deps.workerDetailDateKeyToLabel === 'function') return deps.workerDetailDateKeyToLabel(dayKey)
  return YMD_RE.test(dayKey) ? `${dayKey.slice(8, 10)}.${dayKey.slice(5, 7)}.${dayKey.slice(0, 4)}` : '-'
}

function isoToHm(deps = {}, value) {
  if (typeof deps.isoToHm === 'function') return deps.isoToHm(value)
  if (typeof deps.workerDetailIsoToHm === 'function') return deps.workerDetailIsoToHm(value)
  const iso = toIsoValue(deps, value)
  if (!iso) return '-'
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return '-'
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function formatSeconds(deps = {}, seconds) {
  void deps // Kept in the signature for existing column-factory callers.
  return formatWorkDurationHms(seconds)
}

function positiveNumber(...values) {
  for (const value of values) {
    const number = Number(value)
    if (Number.isFinite(number) && number > 0) {
      return Math.floor(number)
    }
  }
  return 0
}

function exportSourceRows(row = {}) {
  return Array.isArray(row.sourceRows) ? row.sourceRows : []
}

function alertValue(row = {}) {
  const levels = [
    Number(row.alertLevel ?? row.alert ?? 0) || 0,
    ...exportSourceRows(row).map((source) => Number(source.alertLevel ?? source.alert ?? 0) || 0),
  ]
  return Math.max(0, ...levels)
}

function ackValue(row = {}) {
  const ack = Boolean(row.alertAck ?? row.ack ?? exportSourceRows(row).some((source) => source.alertAck || source.ack))
  return ack ? 'TAK' : 'NIE'
}

function escapeCsvCell(value) {
  const text = String(value ?? '').replace(/\r?\n/g, ' ')
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function escapeHtmlValue(deps = {}, value) {
  if (typeof deps.escapeHtml === 'function') return deps.escapeHtml(value)
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function sanitizeWorkTimeEvidenceFilePart(value) {
  return String(value ?? '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'ewidencja-pracy'
}

export function workTimeEvidenceWorkerLabel(row = {}, worker = {}, deps = {}) {
  if (typeof deps.workerLabel === 'function') return deps.workerLabel(row, worker)
  const value = row.workerName || workerNameValue(worker) || worker.workerId || worker.id || '-'
  return surnameFirstLabel(value)
}

export function createWorkTimeEvidenceColumns(deps = {}, worker = {}) {
  return [
    {
      id: 'date',
      label: 'Data',
      weight: 1.05,
      getValue: (row) => dateKeyLabel(deps, row.dayKey),
    },
    {
      id: 'worker',
      label: 'Pracownik',
      weight: 1.65,
      getValue: (row) => workTimeEvidenceWorkerLabel(row, worker, deps),
    },
    {
      id: 'type',
      label: 'Typ',
      weight: 1.0,
      getValue: (row) => row.workerType || (typeof deps.roleLabel === 'function' ? deps.roleLabel(row.workerRole || worker.role || worker.type) : '') || '-',
    },
    {
      id: 'start',
      label: 'Start dnia',
      weight: 1.0,
      getValue: (row) => isoToHm(deps, row.startAt),
    },
    {
      id: 'stop',
      label: 'Koniec dnia',
      weight: 1.0,
      getValue: (row) => isoToHm(deps, row.endAt),
    },
    {
      id: 'work',
      label: 'Czas sesji',
      weight: 1.05,
      getValue: (row) => formatSeconds(deps, row.workSec),
    },
    {
      id: 'net',
      label: 'Realny czas pracy',
      weight: 1.25,
      getValue: (row) => formatSeconds(deps, row.netSec),
    },
    {
      id: 'break',
      label: 'Przerwa',
      weight: 0.95,
      getValue: (row) => formatSeconds(deps, row.breakSec),
    },
    {
      id: 'editedBy',
      label: 'Edytowal',
      weight: 1.25,
      getValue: (row) => row.updatedBy || row.editedBy || '-',
    },
    {
      id: 'comment',
      label: 'Komentarz',
      weight: 2.0,
      getValue: (row) => row.comment || row.comments || row.note || '',
    },
    {
      id: 'alert',
      label: 'Alert',
      weight: 0.8,
      getValue: (row) => alertValue(row),
    },
    {
      id: 'ack',
      label: 'ACK',
      weight: 0.7,
      getValue: (row) => ackValue(row),
    },
  ]
}

export function createDefaultWorkTimeEvidenceColumns(deps = {}, worker = {}) {
  const selectedIds = new Set(WORK_TIME_EVIDENCE_DEFAULT_COLUMN_IDS)
  return createWorkTimeEvidenceColumns(deps, worker).filter((column) => selectedIds.has(column.id))
}

export function validateWorkTimeEvidenceDateRange({ fromYmd, toYmd }, alertFn) {
  const from = String(fromYmd ?? '').trim()
  const to = String(toYmd ?? '').trim()
  const notify = typeof alertFn === 'function' ? alertFn : (message) => window.alert(message)

  if (!YMD_RE.test(from) || !YMD_RE.test(to)) {
    notify('Wybierz poprawny zakres dat (OD i DO).')
    return null
  }

  if (from > to) {
    notify('Data "Od" nie moze byc pozniejsza niz "Do".')
    return null
  }

  return { fromYmd: from, toYmd: to }
}

export function normalizeWorkTimeEvidenceOrientation(value) {
  return String(value ?? '').trim() === 'p' ? 'p' : 'l'
}

export function workTimeEvidenceWorkTotal(rows = []) {
  return (Array.isArray(rows) ? rows : []).reduce((sum, row) => sum + Math.max(0, Number(row.workSec ?? 0) || 0), 0)
}

export function workTimeEvidenceCsvContent({ rows = [], columns = [], deps = {} }) {
  const totalWork = formatSeconds(deps, workTimeEvidenceWorkTotal(rows))
  const summaryRow = columns.map(() => '')
  const workIndex = columns.findIndex((column) => column.id === 'work')
  if (workIndex >= 0) {
    summaryRow[workIndex] = totalWork
    if (workIndex > 0) summaryRow[0] = 'Suma czasu pracy'
    else summaryRow[0] = `Suma czasu pracy: ${totalWork}`
  } else if (summaryRow.length > 1) {
    summaryRow[0] = 'Suma czasu pracy'
    summaryRow[1] = totalWork
  } else if (summaryRow.length === 1) {
    summaryRow[0] = `Suma czasu pracy: ${totalWork}`
  }
  const lines = [
    columns.map((column) => escapeCsvCell(column.label)).join(';'),
    ...rows.map((row) => columns.map((column) => escapeCsvCell(column.getValue(row))).join(';')),
    '',
    summaryRow.map(escapeCsvCell).join(';'),
  ]
  return lines.join('\r\n')
}

export function workTimeEvidenceSummaryText({
  deps = {},
  rows = [],
  columns = [],
  orientation = 'l',
  workerCount = 1,
} = {}) {
  const orientationLabel = normalizeWorkTimeEvidenceOrientation(orientation) === 'l' ? 'PDF poziom' : 'PDF pion'
  const people = Number(workerCount) || 0
  const prefix = people > 1 ? `${people} pracownikow - ` : ''
  return `${prefix}${rows.length} rekordow - ${columns.length} kolumn - ${orientationLabel} - suma: ${formatSeconds(deps, workTimeEvidenceWorkTotal(rows))}`
}

function groupKeyForRow(deps = {}, row = {}) {
  const loginKey = normalizeText(deps, row.workerLogin)
  const nameKey = normalizeText(deps, row.workerName)
  return `${loginKey || nameKey || '-'}::${nameKey || loginKey || '-'}`
}

function sortedRows(deps = {}, rows = []) {
  return [...(Array.isArray(rows) ? rows : [])].sort((left, right) => {
    const leftWorker = normalizeText(deps, workTimeEvidenceWorkerLabel(left, {}, deps))
    const rightWorker = normalizeText(deps, workTimeEvidenceWorkerLabel(right, {}, deps))
    const workerCompare = leftWorker.localeCompare(rightWorker, 'pl', { sensitivity: 'base' })
    if (workerCompare) return workerCompare
    if (String(left.dayKey) !== String(right.dayKey)) {
      return String(left.dayKey).localeCompare(String(right.dayKey))
    }
    return new Date(toIsoValue(deps, left.startAt) || 0).getTime() - new Date(toIsoValue(deps, right.startAt) || 0).getTime()
  })
}

function rowsToGroups(deps = {}, rows = [], worker = {}, groupByWorker = false) {
  if (!groupByWorker) {
    return [{
      workerName: workTimeEvidenceWorkerLabel({}, worker, deps),
      workerLogin: String(worker.login ?? worker.workerLogin ?? '').trim() || '-',
      workerId: String(worker.workerId ?? worker.id ?? '').trim() || '-',
      workerType: String(worker.workerType ?? worker.type ?? worker.role ?? '').trim() || '-',
      rows: sortedRows(deps, rows),
    }]
  }

  const groups = new Map()
  sortedRows(deps, rows).forEach((row) => {
    const key = groupKeyForRow(deps, row)
    if (!groups.has(key)) {
      groups.set(key, {
        workerName: workTimeEvidenceWorkerLabel(row, {}, deps),
        workerLogin: String(row.workerLogin ?? '').trim() || '-',
        workerId: String(row.workerId ?? '').trim() || '-',
        workerType: String(row.workerType ?? '').trim() || '-',
        rows: [],
      })
    }
    groups.get(key).rows.push(row)
  })
  return [...groups.values()]
}

export async function buildWorkTimeEvidencePdf({
  deps = {},
  rows = [],
  columns = [],
  orientation = 'l',
  fromYmd = '',
  toYmd = '',
  worker = {},
  groupByWorker = false,
} = {}) {
  if (typeof deps.ensureJsPdfLoaded !== 'function' || typeof deps.ensurePdfUnicodeFont !== 'function' || typeof deps.setPdfUnicodeFont !== 'function') {
    throw new Error('Eksport PDF nie jest dostepny w tym widoku.')
  }

  const JsPdf = await deps.ensureJsPdfLoaded()
  const pdf = new JsPdf({ orientation: normalizeWorkTimeEvidenceOrientation(orientation), unit: 'mm', format: 'a4' })
  await deps.ensurePdfUnicodeFont(pdf)
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const left = 10
  const right = pageWidth - 10
  const availableWidth = right - left
  const totalWeight = columns.reduce((sum, column) => sum + (Number(column.weight) || 1), 0) || 1
  const headerColumns = columns.map((column) => ({
    ...column,
    width: Math.max(10, (availableWidth * (Number(column.weight) || 1)) / totalWeight),
  }))

  const fitCell = (value, width) => {
    const text = String(value ?? '')
    const maxWidth = Math.max(6, width - 1)
    if (pdf.getTextWidth(text) <= maxWidth) return text
    let reduced = text
    while (reduced.length > 1 && pdf.getTextWidth(`${reduced}...`) > maxWidth) {
      reduced = reduced.slice(0, -1)
    }
    return `${reduced}...`
  }

  const fromLabel = dateKeyLabel(deps, fromYmd)
  const toLabel = dateKeyLabel(deps, toYmd)
  const groups = rowsToGroups(deps, rows, worker, groupByWorker)

  const drawTableHead = (topY) => {
    deps.setPdfUnicodeFont(pdf, 'bold')
    pdf.setFontSize(8.2)
    let x = left
    headerColumns.forEach((column) => {
      pdf.text(fitCell(column.label, column.width), x, topY)
      x += column.width
    })
    pdf.line(left, topY + 1.2, right, topY + 1.2)
  }

  const drawSummaryRow = (y, groupRows) => {
    deps.setPdfUnicodeFont(pdf, 'bold')
    pdf.setFontSize(8.2)
    pdf.setFillColor(237, 244, 251)
    pdf.rect(left, y - 3.6, availableWidth, 5.4, 'F')
    const totalWorkLabel = formatSeconds(deps, workTimeEvidenceWorkTotal(groupRows))
    const hasWorkColumn = headerColumns.some((column) => column.id === 'work')
    let x = left
    headerColumns.forEach((column, index) => {
      let value = ''
      if (hasWorkColumn) {
        if (column.id === 'work') value = index === 0 ? `Suma czasu pracy: ${totalWorkLabel}` : totalWorkLabel
        else if (index === 0) value = 'Suma czasu pracy'
      } else if (index === 0 && headerColumns.length === 1) {
        value = `Suma czasu pracy: ${totalWorkLabel}`
      } else if (index === 0) {
        value = 'Suma czasu pracy'
      } else if (index === 1) {
        value = totalWorkLabel
      }
      pdf.text(fitCell(value, column.width), x, y)
      x += column.width
    })
  }

  groups.forEach((group, groupIndex) => {
    if (groupIndex > 0) pdf.addPage()
    const groupRows = group.rows
    const totalWorkLabel = formatSeconds(deps, workTimeEvidenceWorkTotal(groupRows))
    const title = groupByWorker ? 'Ewidencja pracy pracownika' : 'Ewidencja pracy'
    const subtitle = groupByWorker
      ? `${group.workerName} | ID: ${group.workerId} | Zakres: ${fromLabel} - ${toLabel} | Rekordy: ${groupRows.length}`
      : `${group.workerName} | Zakres: ${fromLabel} - ${toLabel} | Rekordy: ${groupRows.length}`

    const drawHeader = (continued = false) => {
      deps.setPdfUnicodeFont(pdf, 'bold')
      pdf.setFontSize(12)
      pdf.text(continued ? `${title} (kontynuacja)` : title, left, 12)
      deps.setPdfUnicodeFont(pdf, 'normal')
      pdf.setFontSize(9)
      pdf.text(fitCell(subtitle, availableWidth), left, 18)
      deps.setPdfUnicodeFont(pdf, 'bold')
      pdf.text(`Suma czasu pracy: ${totalWorkLabel}`, left, 23)
    }

    drawHeader()
    let y = 32
    drawTableHead(y)
    y += 6
    deps.setPdfUnicodeFont(pdf, 'normal')
    pdf.setFontSize(8)

    groupRows.forEach((row, index) => {
      if (y > pageHeight - 10) {
        pdf.addPage()
        drawHeader(true)
        y = 32
        drawTableHead(y)
        y += 6
        deps.setPdfUnicodeFont(pdf, 'normal')
        pdf.setFontSize(8)
      }
      let x = left
      headerColumns.forEach((column) => {
        pdf.text(fitCell(column.getValue(row), column.width), x, y)
        x += column.width
      })
      if (index < groupRows.length - 1) {
        pdf.setDrawColor(226, 232, 240)
        pdf.line(left, y + 1.4, right, y + 1.4)
        pdf.setDrawColor(0, 0, 0)
      }
      y += 5
    })

    if (y > pageHeight - 10) {
      pdf.addPage()
      drawHeader(true)
      y = 32
      drawTableHead(y)
      y += 6
    }
    drawSummaryRow(y, groupRows)
  })

  return pdf
}

function buildWorkerLookups(deps = {}, workerRows = []) {
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
      if (key) workerLookupByLogin.set(key, entry)
    })
    if (name) workerLookupByName.set(normalizeText(deps, name), entry)
  })

  return { workerLookupByLogin, workerLookupByName }
}

function applySessionAccounting(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const next = { ...row }
    const accounting = workSessionAccountingFromRow({
      ...row,
      workIntervals: Array.isArray(row?.workIntervals) ? row.workIntervals : [],
    })
    const workSec = accounting.closedSessionsSec
    const presence = workdayPresenceFromRows([row])
    const realWorkSec = workSec
    Object.assign(next, accounting)
    next.startAt = presence.startAt || row.startAt
    next.endAt = presence.endAt || row.endAt
    next.rawWorkSec = Math.max(0, Math.floor(Number(row.workSec ?? 0) || 0))
    next.workSec = workSec
    next.realWorkSec = realWorkSec
    next.breakSec = Math.max(0, Number(row.breakSec ?? 0) || 0)
    next.netSec = realWorkSec
    return next
  })
}

function groupSessionAccountingByWorkerDay(rows = []) {
  const groups = new Map()
  ;(Array.isArray(rows) ? rows : []).forEach((row) => {
    const workerKey = String(row?.workerLogin ?? row?.workerId ?? row?.workerName ?? '').trim().toLowerCase()
    const dayKey = String(row?.dayKey ?? row?.businessDateYmd ?? '').trim()
    if (!workerKey || !dayKey) return
    const key = `${workerKey}|${dayKey}`
    const bucket = groups.get(key) ?? []
    bucket.push(row)
    groups.set(key, bucket)
  })

  return [...groups.values()].flatMap((sourceRows) => {
    const first = sourceRows[0] ?? {}
    const day = aggregateWorkTimeDay(sourceRows)
    const dayKey = String(first?.dayKey ?? first?.businessDateYmd ?? '').trim()
    const sessions = Array.isArray(day.sessions) ? day.sessions : []
    if (!sessions.length) {
      return [{
        ...first,
        activities: day.activities,
        breakSec: 0,
        closedSessionsSec: 0,
        confirmedSec: 0,
        dayKey,
        endAt: '',
        integrityIssues: day.integrityIssues,
        integrityState: day.integrityState,
        netSec: 0,
        openSessionCount: day.openSessionCount,
        openSessions: day.openSessions,
        provisionalSec: 0,
        realWorkSec: 0,
        sessions: [],
        sourceRows,
        startAt: '',
        workIntervals: [],
        workSec: 0,
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
        dayKey,
        endAt: session?.endAt ?? '',
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
        startAt: session?.startAt ?? '',
        workIntervals: [session],
        workSec: sessionSec,
        workdayId: String(session?.workdayId ?? sessionSource?.workdayId ?? '').trim(),
      }
    })
  })
}

export async function buildWorkTimeEvidenceRowsForWorkers({
  deps = {},
  orgId,
  workers = [],
  workerRows = [],
  fromYmd,
  toYmd,
} = {}) {
  if (!orgId) return []

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
    pageSize: WORK_TIME_EVIDENCE_EXPORT_MAX_ROWS,
  })

  if (response?.hasNext === true) {
    throw new Error(
      `Eksport przekracza bezpieczny limit ${WORK_TIME_EVIDENCE_EXPORT_MAX_ROWS} rekordów. Zawęź daty lub wybór pracowników.`,
    )
  }

  const rows = (response?.items ?? [])
    .filter((item) => {
      if (!selectedLogins.size && !selectedNames.size) return true
      const loginKey = normalizeText(deps, item?.workerLogin)
      const nameKey = normalizeText(deps, item?.workerName)
      return selectedLogins.has(loginKey) || selectedNames.has(nameKey)
    })
    .map((item) => {
      const loginKey = normalizeText(deps, item?.workerLogin)
      const nameKey = normalizeText(deps, item?.workerName)
      const resolvedWorker = workerLookupByLogin.get(loginKey) || workerLookupByName.get(nameKey) || null
      const sourceWorkerName = String(
        resolvedWorker?.workerName ?? item?.workerName ?? resolvedWorker?.workerId ?? item?.workerId ?? '',
      ).trim() || '-'
      const startAt = toIsoValue(deps, item?.startAt)
      const endAt = toIsoValue(deps, item?.endAt)
      const workSec = positiveNumber(item?.closedSessionsSec, item?.workSec, item?.durationSec, item?.durationSeconds, item?.netSec)
      const breakSec = Math.max(0, Number(item?.breakSec ?? item?.pauseTotalSec ?? item?.pauseSec ?? 0) || 0)
      const netSec = positiveNumber(item?.netSec, item?.realSec) || Math.max(0, workSec - breakSec)
      return {
        ...item,
        workerId: String(resolvedWorker?.workerId ?? item?.workerId ?? item?.id ?? '').trim() || '-',
        workerName: sourceWorkerName,
        workerLogin: String(resolvedWorker?.workerLogin ?? item?.workerLogin ?? item?.workerId ?? '').trim() || '-',
        workerType: String(resolvedWorker?.workerType ?? item?.workerType ?? item?.role ?? '').trim() || '-',
        dayKey: rowDayKey(deps, item),
        startAt,
        endAt,
        workSec: Math.max(0, workSec),
        breakSec,
        netSec,
        updatedBy: item?.updatedBy ?? item?.editedBy ?? item?.edit ?? '',
        comment: item?.comment ?? item?.comments ?? item?.note ?? '',
      }
    })

  const accountedRows = groupSessionAccountingByWorkerDay(applySessionAccounting(rows)).filter((row) =>
    Math.max(0, Number(row?.workSec ?? 0) || 0) > 0 ||
    (row?.integrityState && row.integrityState !== 'COMPLETE'),
  )
  return markMultipleWorkdaysForBusinessDate(accountedRows)
}

export function downloadWorkTimeEvidenceCsv({ deps = {}, rows = [], columns = [], filenameBase = 'ewidencja-pracy' } = {}) {
  const blob = new Blob([`\ufeff${workTimeEvidenceCsvContent({ rows, columns, deps })}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${filenameBase}.csv`
  document.body.appendChild(link)
  link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
  window.setTimeout(() => {
    URL.revokeObjectURL(url)
    link.remove()
  }, 1000)
}

export async function downloadWorkTimeEvidencePdf({
  deps = {},
  rows = [],
  columns = [],
  orientation = 'l',
  fromYmd = '',
  toYmd = '',
  worker = {},
  groupByWorker = false,
  filenameBase = 'ewidencja-pracy',
} = {}) {
  const pdf = await buildWorkTimeEvidencePdf({
    deps,
    rows,
    columns,
    orientation,
    fromYmd,
    toYmd,
    worker,
    groupByWorker,
  })
  pdf.save(`${filenameBase}.pdf`)
  return pdf
}

export function workTimeEvidenceErrorMessage(error) {
  const rawMessage = error instanceof Error ? error.message : 'Nie udalo sie pobrac ewidencji pracy.'
  const upper = rawMessage.toUpperCase()
  return upper.includes('TOO MANY CONNECTIONS') || upper.includes('RESOURCE_EXHAUSTED')
    ? 'Baza danych jest chwilowo przeciazona. Sprobuj ponownie za chwile.'
    : rawMessage
}

export function workTimeEvidencePreviewPlaceholderHtml(deps = {}, message) {
  return `<div class="wa-export-empty">${escapeHtmlValue(deps, message)}</div>`
}
