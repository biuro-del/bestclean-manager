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

export function todayYmd() {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

export function daysAgoYmd(days) {
  const offset = Number(days)
  const normalized = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - normalized)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
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
