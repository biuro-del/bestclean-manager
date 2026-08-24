export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function pad2(value) {
  return String(value).padStart(2, '0')
}

export const BUSINESS_TIME_ZONE = 'Europe/Warsaw'

const BUSINESS_DATE_YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function validYmdParts(value) {
  const match = String(value ?? '').trim().match(BUSINESS_DATE_YMD_RE)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null
  return { day, month, year }
}

function businessDateParts(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
  }).formatToParts(date)
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    day: Number(byType.day),
    month: Number(byType.month),
    year: Number(byType.year),
  }
}

function businessTimeZoneOffsetMs(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return 0
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
  }).formatToParts(date)
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const representedAsUtc = Date.UTC(
    Number(byType.year),
    Number(byType.month) - 1,
    Number(byType.day),
    Number(byType.hour),
    Number(byType.minute),
    Number(byType.second),
  )
  return representedAsUtc - Math.floor(date.getTime() / 1000) * 1000
}

function businessMidnightUtcMs(parts) {
  const wallClockUtc = Date.UTC(parts.year, parts.month - 1, parts.day)
  let utcMs = wallClockUtc
  for (let iteration = 0; iteration < 3; iteration += 1) {
    utcMs = wallClockUtc - businessTimeZoneOffsetMs(new Date(utcMs))
  }
  return utcMs
}

function addCalendarDays(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days))
  return {
    day: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear(),
  }
}

function partsToYmd(parts) {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`
}

export function businessDateYmd(value = new Date()) {
  const parts = businessDateParts(value)
  return parts ? partsToYmd(parts) : ''
}

export function ymdToWarsawIsoRangeStart(value) {
  const parts = validYmdParts(value)
  return parts ? new Date(businessMidnightUtcMs(parts)).toISOString() : ''
}

export function ymdToWarsawIsoRangeEnd(value) {
  const parts = validYmdParts(value)
  if (!parts) return ''
  const nextDay = addCalendarDays(parts, 1)
  return new Date(businessMidnightUtcMs(nextDay) - 1).toISOString()
}

export function toIso(value) {
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

export function formatDatePl(isoValue) {
  const iso = toIso(isoValue)
  if (!iso) {
    return '-'
  }

  const date = new Date(iso)
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()}`
}

export function formatTime(value) {
  const iso = toIso(value)
  if (!iso) {
    return '-'
  }

  const date = new Date(iso)
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

export function todayYmd(now = new Date()) {
  return businessDateYmd(now)
}

export function daysAgoYmd(days, now = new Date()) {
  const offset = Number(days)
  const normalized = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0
  const current = businessDateParts(now)
  return current ? partsToYmd(addCalendarDays(current, -normalized)) : ''
}

export function durationSecondsToHms(value) {
  const seconds = Number(value ?? 0)
  const normalized = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  const hours = Math.floor(normalized / 3600)
  const minutes = Math.floor((normalized % 3600) / 60)
  const secondsRemainder = normalized % 60
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(secondsRemainder)}`
}

export function durationSecondsToHm(value) {
  const seconds = Number(value ?? 0)
  const normalized = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  const hours = Math.floor(normalized / 3600)
  const minutes = Math.floor((normalized % 3600) / 60)
  return `${pad2(hours)}:${pad2(minutes)}`
}

export function setSelectOptions(selectNode, options, placeholderLabel = '(wybierz)') {
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

export function ensureSelectValue(selectNode, value, fallbackLabel) {
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

export function paginate(items, page, pageSize) {
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

export function normalizeSearchText(value) {
  const lowered = String(value ?? '')
    .trim()
    .toLocaleLowerCase('pl')
  const normalized = typeof lowered.normalize === 'function' ? lowered.normalize('NFD') : lowered
  return normalized.replace(/[\u0300-\u036f]/g, '')
}
