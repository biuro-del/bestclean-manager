const SCHEDULE_SPREADSHEET_ID = '1fT9pG2HpW9xT8b28d4jbhg2m3izhM08-U0QybwXvkas'
const SCHEDULE_GID = 2096376868
const SCHEDULE_FETCH_TIMEOUT_MS = 15000
const SCHEDULE_CACHE_TTL_MS = 60 * 1000

let scheduleCache = null
let scheduleCacheAt = 0
let scheduleInFlight = null

const DAY_NAME_TO_CANONICAL = new Map(
  [
    ['PONIEDZIALEK', 'PONIEDZIAŁEK'],
    ['WTOREK', 'WTOREK'],
    ['SRODA', 'ŚRODA'],
    ['CZWARTEK', 'CZWARTEK'],
    ['PIATEK', 'PIĄTEK'],
    ['SOBOTA', 'SOBOTA'],
    ['NIEDZIELA', 'NIEDZIELA'],
  ].map(([plain, canonical]) => [plain, canonical]),
)

const CANONICAL_DAY_ORDER = ['PONIEDZIAŁEK', 'WTOREK', 'ŚRODA', 'CZWARTEK', 'PIĄTEK', 'SOBOTA', 'NIEDZIELA']

function pad2(value) {
  return String(value).padStart(2, '0')
}

function normalizeDayName(value) {
  const polishMap = {
    Ą: 'A',
    Ć: 'C',
    Ę: 'E',
    Ł: 'L',
    Ń: 'N',
    Ó: 'O',
    Ś: 'S',
    Ź: 'Z',
    Ż: 'Z',
  }

  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[ĄĆĘŁŃÓŚŹŻ]/g, (char) => polishMap[char] || char)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
}

function textFromCell(cell) {
  if (!cell) {
    return ''
  }

  if (typeof cell.f === 'string' && cell.f.trim()) {
    return cell.f.trim()
  }

  const value = cell.v
  if (value == null) {
    return ''
  }

  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return `${pad2(value.getDate())}.${pad2(value.getMonth() + 1)}.${value.getFullYear()}`
  }

  return String(value).trim()
}

function parseDateLikeToYmd(value) {
  if (value == null) {
    return ''
  }

  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`
  }

  const raw = String(value).trim()
  if (!raw) {
    return ''
  }

  const dateCtorMatch = raw.match(/^Date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})\)$/i)
  if (dateCtorMatch) {
    const year = Number(dateCtorMatch[1])
    const month = Number(dateCtorMatch[2]) + 1
    const day = Number(dateCtorMatch[3])
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      return `${year}-${pad2(month)}-${pad2(day)}`
    }
  }

  const plMatch = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (plMatch) {
    return `${plMatch[3]}-${pad2(plMatch[2])}-${pad2(plMatch[1])}`
  }

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    return raw
  }

  const parsed = new Date(raw)
  if (Number.isFinite(parsed.getTime())) {
    return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`
  }

  return ''
}

function toDateLabel(ymd) {
  const match = String(ymd ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    return '-'
  }
  return `${match[3]}.${match[2]}.${match[1]}`
}

function rowCell(rows, rowIndex, colIndex) {
  const row = rows?.[rowIndex]
  const cell = row?.c?.[colIndex]
  return textFromCell(cell)
}

function loadScheduleTableJsonp(spreadsheetId = SCHEDULE_SPREADSHEET_ID, gid = SCHEDULE_GID) {
  return new Promise((resolve, reject) => {
    const root = window.google || (window.google = {})
    const visualization = root.visualization || (root.visualization = {})
    const query = visualization.Query || (visualization.Query = {})
    const previousHandler = query.setResponse
    const script = document.createElement('script')
    let done = false

    const cleanup = () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script)
      }
      if (previousHandler) {
        query.setResponse = previousHandler
      } else {
        delete query.setResponse
      }
    }

    const finishError = (message) => {
      if (done) {
        return
      }
      done = true
      window.clearTimeout(timer)
      cleanup()
      reject(new Error(message))
    }

    const finishOk = (payload) => {
      if (done) {
        return
      }
      done = true
      window.clearTimeout(timer)
      cleanup()
      resolve(payload?.table ?? null)
    }

    const timer = window.setTimeout(() => {
      finishError('Przekroczono czas pobierania grafiku z Google Sheets.')
    }, SCHEDULE_FETCH_TIMEOUT_MS)

    query.setResponse = (payload) => {
      finishOk(payload)
    }

    script.async = true
    script.onerror = () => finishError('Nie udało się pobrać grafiku z Google Sheets.')
    script.src =
      `https://docs.google.com/spreadsheets/d/${encodeURIComponent(String(spreadsheetId))}/gviz/tq` +
      `?gid=${encodeURIComponent(String(gid))}&tqx=out:json&ts=${Date.now()}`

    document.head.appendChild(script)
  })
}

function parseScheduleTable(table) {
  const rows = Array.isArray(table?.rows) ? table.rows : []
  if (rows.length < 2) {
    return []
  }

  const headerRowIndex = 1
  const dateRowIndex = 0
  const headerCells = Array.isArray(rows[headerRowIndex]?.c) ? rows[headerRowIndex].c : []

  const dayColumns = []
  headerCells.forEach((cell, colIndex) => {
    const canonical = DAY_NAME_TO_CANONICAL.get(normalizeDayName(textFromCell(cell)))
    if (!canonical) {
      return
    }
    const startCol = Math.max(0, colIndex - 1)
    const dateCell = rows[dateRowIndex]?.c?.[startCol]
    const dayYmd = parseDateLikeToYmd(dateCell?.v ?? textFromCell(dateCell))
    dayColumns.push({
      canonicalDayName: canonical,
      shiftCol: colIndex,
      startCol,
      dayKey: dayYmd,
      dayLabel: dayYmd ? toDateLabel(dayYmd) : '-',
    })
  })

  if (!dayColumns.length) {
    return []
  }

  const dayOrder = new Map(CANONICAL_DAY_ORDER.map((name, index) => [name, index]))
  dayColumns.sort((left, right) => {
    const leftOrder = dayOrder.has(left.canonicalDayName) ? dayOrder.get(left.canonicalDayName) : 99
    const rightOrder = dayOrder.has(right.canonicalDayName) ? dayOrder.get(right.canonicalDayName) : 99
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder
    }
    return left.shiftCol - right.shiftCol
  })

  const dayMap = new Map(
    dayColumns.map((day) => [
      day.dayKey || `${day.canonicalDayName}-${day.shiftCol}`,
      {
        key: day.dayKey || `${day.canonicalDayName}-${day.shiftCol}`,
        dayName: day.canonicalDayName,
        dateLabel: day.dayLabel,
        entries: [],
      },
    ]),
  )

  for (let rowIndex = 2; rowIndex < rows.length; rowIndex += 1) {
    const workerId = rowCell(rows, rowIndex, 0)
    const workerName = rowCell(rows, rowIndex, 1)
    if (!workerId && !workerName) {
      continue
    }

    const morningRowIndex = rowIndex
    const nextRowWorkerId = rowCell(rows, rowIndex + 1, 0)
    const nextRowWorkerName = rowCell(rows, rowIndex + 1, 1)
    const hasDedicatedAfternoonRow = rowIndex + 1 < rows.length && !nextRowWorkerId && !nextRowWorkerName
    const afternoonRowIndex = hasDedicatedAfternoonRow ? rowIndex + 1 : -1

    dayColumns.forEach((day) => {
      const key = day.dayKey || `${day.canonicalDayName}-${day.shiftCol}`
      const bucket = dayMap.get(key)
      if (!bucket) {
        return
      }

      const morningStart = rowCell(rows, morningRowIndex, day.startCol)
      const morningTask = rowCell(rows, morningRowIndex, day.shiftCol)
      const afternoonStart = afternoonRowIndex > 0 ? rowCell(rows, afternoonRowIndex, day.startCol) : ''
      const afternoonTask = afternoonRowIndex > 0 ? rowCell(rows, afternoonRowIndex, day.shiftCol) : ''
      const hasAnyData = [morningStart, morningTask, afternoonStart, afternoonTask].some((value) => String(value).trim())

      bucket.entries.push({
        workerId: workerId || '-',
        workerName: workerName || workerId || '-',
        status: hasAnyData ? 'Praca' : 'Brak zmiany',
        morningStart,
        morningTask,
        afternoonStart,
        afternoonTask,
      })
    })
  }

  return [...dayMap.values()].map((day) => ({
    ...day,
    entries: day.entries.sort((left, right) => String(left.workerName).localeCompare(String(right.workerName), 'pl', { sensitivity: 'base' })),
  }))
}

function todayYmd() {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

export async function getScheduleBoard() {
  const now = Date.now()
  if (scheduleCache && now - scheduleCacheAt < SCHEDULE_CACHE_TTL_MS) {
    return scheduleCache
  }

  if (scheduleInFlight) {
    return scheduleInFlight
  }

  scheduleInFlight = (async () => {
    const table = await loadScheduleTableJsonp()
    const days = parseScheduleTable(table)
    const payload = {
      days,
      fetchedAtIso: new Date().toISOString(),
      todayKey: todayYmd(),
    }
    scheduleCache = payload
    scheduleCacheAt = Date.now()
    return payload
  })()

  try {
    return await scheduleInFlight
  } finally {
    scheduleInFlight = null
  }
}


