const DEFAULT_TIME_ZONE = 'Europe/Warsaw'

const CATEGORY_VALUES = new Set(['workers', 'orders', 'vehicles', 'system'])

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('pl-PL')
    .replace(/\s+/g, ' ')
}

function firstText(values = []) {
  return values
    .map((value) => String(value ?? '').trim())
    .find(Boolean) ?? ''
}

function timestamp(value) {
  if (value instanceof Date) {
    const result = value.getTime()
    return Number.isFinite(result) ? result : 0
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : 0
  }
  const result = new Date(String(value ?? '')).getTime()
  return Number.isFinite(result) && result > 0 ? result : 0
}

function ymdInTimeZone(value, timeZone = DEFAULT_TIME_ZONE) {
  const valueTs = timestamp(value)
  if (!valueTs) {
    return ''
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(valueTs))
  const part = (type) => parts.find((entry) => entry.type === type)?.value ?? ''
  const year = part('year')
  const month = part('month')
  const day = part('day')
  return year && month && day ? `${year}-${month}-${day}` : ''
}

function rowExplicitDay(row = {}) {
  const candidate = firstText([
    row.businessDateYmd,
    row.dayKey,
    row.workDateYmd,
    row.workDate,
    row.dateYmd,
    row.date,
  ])
  const match = candidate.match(/^(\d{4}-\d{2}-\d{2})/)
  return match?.[1] ?? ''
}

function rowStartTimestamp(row = {}) {
  return timestamp(
    row.startAt ??
      row.dayStartAt ??
      row.qrStartAt ??
      row.qrStartIso ??
      row.firstStartAt ??
      row.createdAt,
  )
}

function rowStopTimestamp(row = {}) {
  return timestamp(
    row.endAt ??
      row.dayEndAt ??
      row.qrStopAt ??
      row.qrStopIso ??
      row.closeMarkedAt ??
      row.completedAt,
  )
}

function rowCandidateIds(row = {}) {
  return [
    row.eventId,
    row.id,
    row.workdayId,
    row.linkedWorkdayId,
    row.startEventId,
    row.endEventId,
    row.tripId,
    row.taskId,
    row.orderId,
  ]
    .map((value) => normalizeText(value))
    .filter((value, index, values) => value && values.indexOf(value) === index)
}

function rowActorLabel(row = {}) {
  return firstText([
    row.activityActorLabel,
    row.workerName,
    row.employeeName,
    row.name,
    row.workerLogin,
    row.login,
    row.vehicleName,
    row.registrationNumber,
    row.plateNumber,
    row.eventType,
  ]) || 'System'
}

function rowRelationLabel(row = {}) {
  return firstText([
    row.activityRelationLabel,
    row.clientName,
    row.klient,
    row.activeClient,
    row.objectName,
    row.facilityName,
    row.zoneName,
    row.strefa,
    row.registrationNumber,
    row.plateNumber,
    row.vehicleName,
    row.orderNumber,
    row.orderId,
  ]) || 'Bez powiązania'
}

function rowRequiresReview(row = {}) {
  const status = String(row.status ?? row.state ?? '').trim().toUpperCase()
  return Boolean(
    row.requiresReview === true ||
      row.needsReview === true ||
      row.hasError === true ||
      row.isInvalid === true ||
      ['ERROR', 'INVALID', 'REVIEW', 'ALERT'].some((token) => status.includes(token)),
  )
}

function activityCategory(row = {}, typeLabel = '') {
  const explicit = String(row.activityCategory ?? '').trim().toLowerCase()
  if (CATEGORY_VALUES.has(explicit)) {
    return explicit
  }
  if (rowRequiresReview(row)) {
    return 'system'
  }
  const vehicleContext = [
    row.vehicleId,
    row.tripId,
    row.vehicleName,
    row.registrationNumber,
    row.plateNumber,
    row.odometer,
  ].some((value) => String(value ?? '').trim())
  if (vehicleContext || normalizeText(typeLabel).includes('pojazd')) {
    return 'vehicles'
  }
  const normalizedType = normalizeText(typeLabel)
  if (
    row.clientIndId ||
    ['clean', 'zlecenie jed.', 'zlecenie indywidualne'].includes(normalizedType) ||
    normalizedType.includes('zlecen')
  ) {
    return 'orders'
  }
  return 'workers'
}

function activityCopy({ category, phase, typeLabel, requiresReview }) {
  if (requiresReview) {
    return 'Zdarzenie wymaga weryfikacji'
  }
  if (category === 'vehicles') {
    return phase === 'stop' ? 'Zakończono przejazd' : 'Rozpoczęto przejazd'
  }
  if (category === 'orders') {
    return phase === 'stop' ? 'Zakończono zlecenie' : 'Rozpoczęto zlecenie'
  }
  const normalizedType = normalizeText(typeLabel)
  if (phase === 'stop' || normalizedType === 'qr stop') {
    return 'Zarejestrowano QR STOP'
  }
  if (normalizedType.includes('qr start')) {
    return 'Zarejestrowano QR START'
  }
  return phase === 'stop' ? 'Zakończono pracę' : 'Rozpoczęto pracę'
}

function statusForItem({ phase, requiresReview }) {
  if (requiresReview) {
    return { label: 'ALERT', tone: 'alert' }
  }
  if (phase === 'stop') {
    return { label: 'OK', tone: 'ok' }
  }
  return { label: 'W TOKU', tone: 'info' }
}

function phaseEntries(row = {}, typeLabel = '') {
  const startTs = rowStartTimestamp(row)
  const stopTs = rowStopTimestamp(row)
  const normalizedType = normalizeText(typeLabel)
  const stopOnly = normalizedType === 'qr stop'
  if (stopOnly) {
    const occurredAt = stopTs || startTs
    return occurredAt ? [{ phase: 'stop', occurredAt }] : []
  }

  const phases = []
  if (startTs) {
    phases.push({ phase: 'start', occurredAt: startTs })
  }
  if (stopTs && (stopTs !== startTs || normalizedType.includes('start + stop'))) {
    phases.push({ phase: 'stop', occurredAt: stopTs })
  }
  if (!phases.length) {
    const fallbackTs = timestamp(row.updatedAt ?? row.createdAt)
    if (fallbackTs) {
      phases.push({ phase: 'event', occurredAt: fallbackTs })
    }
  }
  return phases
}

function stableKey(row, phase, occurredAt, actorLabel, relationLabel, typeLabel) {
  const baseId = rowCandidateIds(row)[0]
  const fallback = [actorLabel, relationLabel, typeLabel]
    .map(normalizeText)
    .filter(Boolean)
    .join('|') || 'activity'
  return `${baseId || fallback}:${phase}:${occurredAt}`
}

export function buildDashboardActivityFeedItems(rows = [], options = {}) {
  const dayKey = String(options.dayKey ?? '').trim()
  const timeZone = String(options.timeZone ?? DEFAULT_TIME_ZONE).trim() || DEFAULT_TIME_ZONE
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    return []
  }

  const candidates = []
  ;(Array.isArray(rows) ? rows : []).forEach((row) => {
    if (!row || typeof row !== 'object') {
      return
    }
    const typeLabel = firstText([row.activityTypeLabel, row.typeLabel, row.eventTypeLabel]) || 'Aktywność'
    const actorLabel = rowActorLabel(row)
    const relationLabel = rowRelationLabel(row)
    const category = activityCategory(row, typeLabel)
    const requiresReview = rowRequiresReview(row)
    const candidateIds = rowCandidateIds(row)
    const explicitDay = rowExplicitDay(row)

    phaseEntries(row, typeLabel).forEach(({ phase, occurredAt }) => {
      const phaseDay = ymdInTimeZone(occurredAt, timeZone) || explicitDay
      if (phaseDay !== dayKey) {
        return
      }
      const status = statusForItem({ phase, requiresReview })
      candidates.push({
        key: stableKey(row, phase, occurredAt, actorLabel, relationLabel, typeLabel),
        candidateIds,
        fingerprint: [
          phase,
          Math.floor(occurredAt / 1000),
          normalizeText(actorLabel),
          normalizeText(relationLabel),
          normalizeText(typeLabel),
        ].join('|'),
        occurredAt,
        phase,
        category,
        actorLabel,
        relationLabel,
        typeLabel,
        actionLabel: activityCopy({ category, phase, typeLabel, requiresReview }),
        statusLabel: status.label,
        statusTone: status.tone,
      })
    })
  })

  const seenIds = new Set()
  const seenFingerprints = new Set()
  return candidates
    .sort((left, right) => right.occurredAt - left.occurredAt || left.key.localeCompare(right.key, 'pl'))
    .filter((item) => {
      const identityTokens = item.candidateIds.map((id) => `${item.phase}:${item.occurredAt}:${id}`)
      if (identityTokens.some((token) => seenIds.has(token)) || seenFingerprints.has(item.fingerprint)) {
        return false
      }
      identityTokens.forEach((token) => seenIds.add(token))
      seenFingerprints.add(item.fingerprint)
      return true
    })
    .map((item) => {
      const publicItem = { ...item }
      delete publicItem.candidateIds
      delete publicItem.fingerprint
      return publicItem
    })
}

export function filterDashboardActivityFeedItems(items = [], filter = 'all') {
  const normalizedFilter = String(filter ?? 'all').trim().toLowerCase()
  if (normalizedFilter === 'all') {
    return Array.isArray(items) ? items : []
  }
  if (!CATEGORY_VALUES.has(normalizedFilter)) {
    return []
  }
  return (Array.isArray(items) ? items : []).filter((item) => item?.category === normalizedFilter)
}

export function dashboardActivityFeedDayForTimestamp(value, timeZone = DEFAULT_TIME_ZONE) {
  return ymdInTimeZone(value, timeZone)
}
