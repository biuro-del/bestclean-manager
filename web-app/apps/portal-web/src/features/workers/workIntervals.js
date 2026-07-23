function intervalTimestamp(value) {
  const timestamp = new Date(String(value ?? '').trim()).getTime()
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0
}

function normalizedGpsPair(latValue, lonValue) {
  const lat = Number(latValue)
  const lon = Number(lonValue)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return {
    lat: String(Math.round(lat * 1000000) / 1000000),
    lon: String(Math.round(lon * 1000000) / 1000000),
  }
}

function gpsPairFromValue(value) {
  if (value && typeof value === 'object') {
    const direct = normalizedGpsPair(
      value.lat ?? value.latitude,
      value.lon ?? value.lng ?? value.longitude,
    )
    if (direct) return direct
  }

  const raw = String(value ?? '').trim()
  if (!raw) return null
  const attributeMatch = raw.match(
    /\blat(?:itude)?\s*[=:]\s*["']?(-?\d+(?:\.\d+)?)["']?[\s\S]*?\b(?:lon|lng|longitude)\s*[=:]\s*["']?(-?\d+(?:\.\d+)?)/i,
  )
  if (attributeMatch) return normalizedGpsPair(attributeMatch[1], attributeMatch[2])

  const pairMatch = raw.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/)
  return pairMatch ? normalizedGpsPair(pairMatch[1], pairMatch[2]) : null
}

function taggedGpsPair(value, phase) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const normalizedPhase = String(phase ?? '').trim().toUpperCase() === 'STOP' ? 'STOP' : 'START'
  const entries = []

  const bracketRegex = /\[\[\s*GPS\b([\s\S]*?)\]\]/gi
  let bracketMatch = bracketRegex.exec(raw)
  while (bracketMatch) {
    const body = String(bracketMatch[1] ?? '')
    const sourceMatch = body.match(/\b(?:src|source|phase)\s*=\s*["']?(START|STOP)/i)
    entries.push({ phase: String(sourceMatch?.[1] ?? '').toUpperCase(), pair: gpsPairFromValue(body) })
    bracketMatch = bracketRegex.exec(raw)
  }

  const labeledRegex = /\b(?:CLEAN_)?(START|STOP)_GPS\b([^\r\n|]*)/gi
  let labeledMatch = labeledRegex.exec(raw)
  while (labeledMatch) {
    entries.push({
      phase: String(labeledMatch[1] ?? '').toUpperCase(),
      pair: gpsPairFromValue(labeledMatch[2]),
    })
    labeledMatch = labeledRegex.exec(raw)
  }

  const matching = entries.find((entry) => entry.phase === normalizedPhase && entry.pair)
  if (matching) return matching.pair
  const generic = entries.find((entry) => !entry.phase && entry.pair)
  if (generic) return generic.pair
  return entries.length ? null : gpsPairFromValue(raw)
}

export function workIntervalGpsCoordinates(interval = {}, codeType = 'START') {
  const phase = String(codeType ?? '').trim().toUpperCase() === 'STOP' ? 'STOP' : 'START'
  const phaseSources = phase === 'START'
    ? [interval?.startGps, interval?.startGPS, interval?.gpsStart, interval?.startLocationGps]
    : [interval?.stopGps, interval?.stopGPS, interval?.gpsStop, interval?.stopLocationGps]

  for (const source of phaseSources) {
    const parsed = gpsPairFromValue(source)
    if (parsed) return parsed
  }

  const sharedSources = [interval?.dayGps, interval?.gps, interval?.dayComment, interval?.comment]
  for (const source of sharedSources) {
    const parsed = taggedGpsPair(source, phase)
    if (parsed) return parsed
  }

  return normalizedGpsPair(
    interval?.lat ?? interval?.latitude,
    interval?.lon ?? interval?.lng ?? interval?.longitude,
  )
}

function normalizedInterval(interval = {}) {
  const source = interval && typeof interval === 'object' ? interval : {}
  let startTs = Number(interval.startTs ?? 0)
  let endTs = Number(interval.endTs ?? 0)

  if (!Number.isFinite(startTs) || startTs <= 0) {
    startTs = intervalTimestamp(interval.startAt ?? interval.startIso)
  }
  if (!Number.isFinite(endTs) || endTs <= 0) {
    endTs = intervalTimestamp(interval.endAt ?? interval.endIso)
  }
  if (!startTs || !endTs || endTs <= startTs) return null

  return {
    ...source,
    startTs,
    endTs,
    startAt: new Date(startTs).toISOString(),
    endAt: new Date(endTs).toISOString(),
    durationSec: Math.floor((endTs - startTs) / 1000),
    isOpen: interval?.isOpen === true,
  }
}

export function mergeWorkIntervals(intervals = []) {
  const sorted = (Array.isArray(intervals) ? intervals : [])
    .map((interval) => normalizedInterval(interval))
    .filter(Boolean)
    .sort((left, right) => left.startTs - right.startTs || left.endTs - right.endTs)

  const merged = []
  sorted.forEach((interval) => {
    const last = merged[merged.length - 1]
    if (!last || interval.startTs >= last.endTs) {
      merged.push({ ...interval })
      return
    }

    last.endTs = Math.max(last.endTs, interval.endTs)
    last.endAt = new Date(last.endTs).toISOString()
    last.durationSec = Math.floor((last.endTs - last.startTs) / 1000)
    last.isOpen = last.isOpen || interval.isOpen
  })

  return merged
}

export function workIntervalsTotalSeconds(intervals = []) {
  return mergeWorkIntervals(intervals).reduce(
    (sum, interval) => sum + Math.max(0, Number(interval.durationSec ?? 0) || 0),
    0,
  )
}

export function workIntervalsFromRow(row = {}, options = {}) {
  const explicitIntervals = Array.isArray(row?.workIntervals) ? row.workIntervals : []
  if (explicitIntervals.length) return mergeWorkIntervals(explicitIntervals)

  const startTs = intervalTimestamp(row?.startAt ?? row?.dayStartAt ?? row?.startIso)
  let endTs = intervalTimestamp(row?.endAt ?? row?.dayEndAt ?? row?.endIso ?? row?.stopAt)
  let isOpen = false
  const durationSec = Number(row?.durationSec ?? row?.closedSec ?? row?.workSec ?? 0)

  if (!endTs && startTs && Number.isFinite(durationSec) && durationSec > 0) {
    endTs = startTs + Math.floor(durationSec) * 1000
  }

  const status = String(row?.status ?? '').trim().toUpperCase()
  if (
    !endTs &&
    startTs &&
    options.allowOpen === true &&
    (status === 'RUNNING' || status === 'OPEN')
  ) {
    const nowMs = Number(options.nowMs ?? Date.now())
    if (Number.isFinite(nowMs) && nowMs > startTs) {
      endTs = nowMs
      isOpen = true
    }
  }

  return mergeWorkIntervals([{ ...row, startTs, endTs, isOpen }])
}

export function workIntervalCodes(intervals = []) {
  return mergeWorkIntervals(intervals).flatMap((interval, index) => {
    const session = index + 1
    const codes = [{ type: 'START', at: interval.startAt, session, interval }]
    if (!interval.isOpen) codes.push({ type: 'STOP', at: interval.endAt, session, interval })
    return codes
  })
}

function isExplicitEvent(row = {}) {
  const sourceKind = String(row?.historySourceKind ?? '').trim().toLowerCase()
  if (row?.hasExplicitEventId === true || sourceKind === 'event') return true

  const eventId = String(row?.eventId ?? '').trim()
  const workdayId = String(row?.workdayId ?? '').trim()
  return Boolean(eventId && workdayId && eventId !== workdayId)
}

function eventWorkdayKey(row = {}) {
  return String(row?.linkedWorkdayId ?? row?.workdayId ?? '').trim()
}

export function enrichWorkdaysWithEventIntervals(workdays = [], events = [], options = {}) {
  const nowMs = Number(options.nowMs ?? Date.now())
  const intervalsByWorkday = new Map()

  ;(Array.isArray(events) ? events : []).forEach((event) => {
    if (!isExplicitEvent(event)) return
    const workdayKey = eventWorkdayKey(event)
    if (!workdayKey) return

    const intervals = workIntervalsFromRow(event, { allowOpen: true, nowMs })
    if (!intervals.length) return

    const current = intervalsByWorkday.get(workdayKey) ?? []
    current.push(...intervals)
    intervalsByWorkday.set(workdayKey, current)
  })

  return (Array.isArray(workdays) ? workdays : []).map((workday) => {
    const workdayKey = String(workday?.workdayId ?? workday?.id ?? '').trim()
    const workIntervals = mergeWorkIntervals(intervalsByWorkday.get(workdayKey) ?? [])
    if (!workIntervals.length) return workday

    const durationSec = workIntervalsTotalSeconds(workIntervals)
    return {
      ...workday,
      recordedDurationSec: Math.max(0, Number(workday?.durationSec ?? 0) || 0),
      durationSec,
      workIntervals,
      durationSource: 'event-intervals',
    }
  })
}
