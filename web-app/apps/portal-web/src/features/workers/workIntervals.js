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

function positiveSeconds(...values) {
  for (const value of values) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed)
  }
  return 0
}

function sourceRecordKey(row = {}, interval = {}, rowIndex = 0, intervalIndex = 0, explicitCount = 0) {
  const source = interval && typeof interval === 'object' ? interval : {}
  const eventId = String(source.eventId ?? row?.eventId ?? '').trim()
  if (eventId) return `event:${eventId}`

  const sourceId = String(source.sourceId ?? source.recordId ?? row?.sourceId ?? row?.recordId ?? '').trim()
  if (sourceId) return `source:${sourceId}`

  const workdayId = String(
    source.workdayId ?? source.linkedWorkdayId ?? row?.linkedWorkdayId ?? row?.workdayId ?? '',
  ).trim()
  if (workdayId) return explicitCount > 1 ? `workday:${workdayId}:interval:${intervalIndex}` : `workday:${workdayId}`

  const id = String(source.id ?? row?.id ?? '').trim()
  if (id) return explicitCount > 1 ? `id:${id}:interval:${intervalIndex}` : `id:${id}`
  return `row:${rowIndex}:interval:${intervalIndex}`
}

function intervalValue(interval = {}, row = {}, names = []) {
  for (const name of names) {
    if (interval?.[name] !== undefined && interval?.[name] !== null && String(interval[name]).trim()) {
      return interval[name]
    }
    if (row?.[name] !== undefined && row?.[name] !== null && String(row[name]).trim()) {
      return row[name]
    }
  }
  return ''
}

function workTimeIssue(code, sourceKey, extra = {}) {
  return { code, sourceKey, ...extra }
}

function normalizeSummaryInterval(interval = {}, row = {}, options = {}) {
  const source = interval && typeof interval === 'object' ? interval : {}
  const startValue = intervalValue(source, row, ['startTs', 'startAt', 'startIso', 'dayStartAt'])
  const endValue = intervalValue(source, row, ['endTs', 'endAt', 'endIso', 'stopAt', 'dayEndAt'])
  let startTs = Number(startValue)
  let endTs = Number(endValue)
  if (!Number.isFinite(startTs) || startTs <= 0) startTs = intervalTimestamp(startValue)
  if (!Number.isFinite(endTs) || endTs <= 0) endTs = intervalTimestamp(endValue)

  const durationSec = positiveSeconds(
    source.durationSec,
    source.closedSec,
    source.workSec,
    row?.durationSec,
    row?.closedSec,
    row?.workSec,
  )
  if (!endTs && startTs && durationSec) endTs = startTs + durationSec * 1000
  if (!startTs && endTs && durationSec) startTs = endTs - durationSec * 1000

  const status = String(source.status ?? row?.status ?? '').trim().toUpperCase()
  let isOpen = Boolean(source.isOpen === true || row?.isOpen === true)
  if (!endTs && startTs && options.allowOpen === true && (status === 'RUNNING' || status === 'OPEN' || isOpen)) {
    const nowMs = Number(options.nowMs ?? Date.now())
    if (Number.isFinite(nowMs) && nowMs > startTs) {
      endTs = nowMs
      isOpen = true
    }
  }

  const hasRecordedValue = Boolean(startValue || endValue || durationSec)
  if (!startTs || !endTs) {
    return {
      interval: null,
      issue: hasRecordedValue ? 'INCOMPLETE_WORK_INTERVAL' : '',
    }
  }
  if (endTs <= startTs) {
    return { interval: null, issue: 'INVALID_WORK_INTERVAL' }
  }

  return {
    interval: {
      ...row,
      ...source,
      startTs,
      endTs,
      startAt: new Date(startTs).toISOString(),
      endAt: new Date(endTs).toISOString(),
      durationSec: Math.floor((endTs - startTs) / 1000),
      isOpen,
    },
    issue: '',
  }
}

function addUniqueIssue(issues, seen, issue) {
  const key = [
    issue.code,
    issue.sourceKey,
    issue.startAt ?? '',
    issue.endAt ?? '',
    issue.otherSourceKey ?? '',
  ].join('|')
  if (seen.has(key)) return
  seen.add(key)
  issues.push(issue)
}

function workIntervalEntries(rows = [], options = {}) {
  const entriesBySource = new Map()
  const issues = []
  const seenIssues = new Set()

  ;(Array.isArray(rows) ? rows : []).forEach((row, rowIndex) => {
    const explicitIntervals = Array.isArray(row?.workIntervals) ? row.workIntervals : []
    const candidates = explicitIntervals.length ? explicitIntervals : [row]
    candidates.forEach((candidate, intervalIndex) => {
      const sourceKey = sourceRecordKey(row, candidate, rowIndex, intervalIndex, explicitIntervals.length)
      const normalized = normalizeSummaryInterval(candidate, row, options)
      if (!normalized.interval) {
        if (normalized.issue) addUniqueIssue(issues, seenIssues, workTimeIssue(normalized.issue, sourceKey))
        return
      }

      const updatedAt = intervalTimestamp(candidate?.updatedAt ?? row?.updatedAt ?? row?.createdAt)
      const current = {
        ...normalized.interval,
        sourceKey,
        updatedAt,
      }
      const existing = entriesBySource.get(sourceKey)
      if (!existing || updatedAt >= existing.updatedAt) entriesBySource.set(sourceKey, current)
    })
  })

  return { entries: [...entriesBySource.values()], issues, seenIssues }
}

function pauseIntervalValues(row = {}) {
  return ['pauseIntervals', 'workdayPauses', 'pauses', 'breakIntervals']
    .flatMap((field) => (Array.isArray(row?.[field]) ? row[field] : []))
}

function normalizePauseInterval(pause = {}, row = {}) {
  const source = pause && typeof pause === 'object' ? pause : {}
  const startValue = intervalValue(source, row, ['startTs', 'startAt', 'startIso', 'pauseStartAt', 'breakStartAt'])
  const endValue = intervalValue(source, row, ['endTs', 'endAt', 'endIso', 'stopAt', 'pauseEndAt', 'breakEndAt'])
  let startTs = Number(startValue)
  let endTs = Number(endValue)
  if (!Number.isFinite(startTs) || startTs <= 0) startTs = intervalTimestamp(startValue)
  if (!Number.isFinite(endTs) || endTs <= 0) endTs = intervalTimestamp(endValue)
  const durationSec = positiveSeconds(source.durationSec, source.pauseSec, source.breakSec)
  if (!endTs && startTs && durationSec) endTs = startTs + durationSec * 1000
  if (!startTs && endTs && durationSec) startTs = endTs - durationSec * 1000

  if (!startTs || !endTs) return { interval: null, issue: 'INCOMPLETE_PAUSE_INTERVAL' }
  if (endTs <= startTs) return { interval: null, issue: 'INVALID_PAUSE_INTERVAL' }
  return {
    interval: {
      ...row,
      ...source,
      startTs,
      endTs,
      startAt: new Date(startTs).toISOString(),
      endAt: new Date(endTs).toISOString(),
      durationSec: Math.floor((endTs - startTs) / 1000),
    },
    issue: '',
  }
}

function pauseEntries(rows = [], seenIssues, issues) {
  const intervals = []
  let hasExplicitIntervals = false

  ;(Array.isArray(rows) ? rows : []).forEach((row, rowIndex) => {
    const pauses = pauseIntervalValues(row)
    if (!pauses.length) return
    hasExplicitIntervals = true
    pauses.forEach((pause, pauseIndex) => {
      const sourceKey = sourceRecordKey(row, pause, rowIndex, pauseIndex, pauses.length)
      const normalized = normalizePauseInterval(pause, row)
      if (!normalized.interval) {
        addUniqueIssue(issues, seenIssues, workTimeIssue(normalized.issue, sourceKey))
        return
      }
      intervals.push(normalized.interval)
    })
  })

  return { intervals, hasExplicitIntervals }
}

function pauseScalarSeconds(rows = []) {
  const totalsByWorkday = new Map()
  ;(Array.isArray(rows) ? rows : []).forEach((row, rowIndex) => {
    const workdayKey = String(row?.linkedWorkdayId ?? row?.workdayId ?? row?.id ?? `row:${rowIndex}`).trim()
    const seconds = positiveSeconds(row?.breakSec, row?.pauseTotalSec, row?.pauseSec)
    if (!seconds) return
    totalsByWorkday.set(workdayKey, Math.max(totalsByWorkday.get(workdayKey) ?? 0, seconds))
  })
  return [...totalsByWorkday.values()].reduce((sum, seconds) => sum + seconds, 0)
}

function intersectedIntervalSeconds(left = [], right = []) {
  const first = mergeWorkIntervals(left)
  const second = mergeWorkIntervals(right)
  let firstIndex = 0
  let secondIndex = 0
  let totalMs = 0

  while (firstIndex < first.length && secondIndex < second.length) {
    const start = Math.max(first[firstIndex].startTs, second[secondIndex].startTs)
    const end = Math.min(first[firstIndex].endTs, second[secondIndex].endTs)
    if (end > start) totalMs += end - start
    if (first[firstIndex].endTs <= second[secondIndex].endTs) firstIndex += 1
    else secondIndex += 1
  }

  return Math.floor(totalMs / 1000)
}

/**
 * Canonical, auditable work-time accounting. Exact revisions of one persisted
 * record are reduced to their newest version; distinct records that overlap
 * are never silently treated as confirmed net time.
 */
export function summarizeWorkTimeRows(rows = [], options = {}) {
  const { entries: rawWorkIntervals, issues, seenIssues } = workIntervalEntries(rows, options)
  const orderedWorkIntervals = rawWorkIntervals
    .sort((left, right) => left.startTs - right.startTs || left.endTs - right.endTs || left.sourceKey.localeCompare(right.sourceKey))
  let activeInterval = null
  orderedWorkIntervals.forEach((interval) => {
    if (activeInterval && interval.startTs < activeInterval.endTs) {
      addUniqueIssue(issues, seenIssues, workTimeIssue('OVERLAPPING_WORK_INTERVALS', interval.sourceKey, {
        otherSourceKey: activeInterval.sourceKey,
        startAt: interval.startAt,
        endAt: interval.endAt,
      }))
    }
    if (!activeInterval || interval.endTs > activeInterval.endTs) activeInterval = interval
  })

  const workIntervals = mergeWorkIntervals(orderedWorkIntervals)
  let grossSec = workIntervalsTotalSeconds(workIntervals)
  if (!grossSec) {
    const reportedBySource = new Map()
    ;(Array.isArray(rows) ? rows : []).forEach((row, rowIndex) => {
      const sourceKey = sourceRecordKey(row, row, rowIndex, 0, 0)
      const reportedSec = positiveSeconds(row?.durationSec, row?.closedSec, row?.workSec, row?.durationSeconds)
      if (reportedSec) reportedBySource.set(sourceKey, Math.max(reportedBySource.get(sourceKey) ?? 0, reportedSec))
    })
    grossSec = [...reportedBySource.values()].reduce((sum, seconds) => sum + seconds, 0)
  }

  const pauses = pauseEntries(rows, seenIssues, issues)
  const pauseIntervals = mergeWorkIntervals(pauses.intervals)
  const recordedPauseSec = pauses.hasExplicitIntervals
    ? intersectedIntervalSeconds(workIntervals, pauseIntervals)
    : pauseScalarSeconds(rows)
  const pauseSec = Math.min(Math.max(0, grossSec), Math.max(0, recordedPauseSec))
  const reviewRequired = issues.length > 0

  return {
    workIntervals,
    pauseIntervals,
    grossSec,
    pauseSec,
    netSec: reviewRequired ? null : Math.max(0, grossSec - pauseSec),
    reviewRequired,
    issues,
    startAt: workIntervals[0]?.startAt ?? '',
    endAt: workIntervals.at(-1)?.endAt ?? '',
    hasOpenInterval: workIntervals.some((interval) => interval.isOpen),
    durationSource: workIntervals.length ? 'recorded-intervals' : grossSec ? 'reported-total' : 'none',
    pauseSource: pauses.hasExplicitIntervals ? 'recorded-intervals' : pauseSec ? 'recorded-total' : 'none',
  }
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
  const eventsByWorkday = new Map()

  ;(Array.isArray(events) ? events : []).forEach((event) => {
    if (!isExplicitEvent(event)) return
    const workdayKey = eventWorkdayKey(event)
    if (!workdayKey) return

    const current = eventsByWorkday.get(workdayKey) ?? []
    current.push(event)
    eventsByWorkday.set(workdayKey, current)
  })

  return (Array.isArray(workdays) ? workdays : []).map((workday) => {
    const workdayKey = String(workday?.workdayId ?? workday?.id ?? '').trim()
    const summary = summarizeWorkTimeRows(eventsByWorkday.get(workdayKey) ?? [], { allowOpen: true, nowMs })
    if (!summary.workIntervals.length && !summary.reviewRequired) return workday

    return {
      ...workday,
      recordedDurationSec: Math.max(0, Number(workday?.durationSec ?? 0) || 0),
      durationSec: summary.grossSec,
      netSec: summary.netSec,
      workIntervals: summary.workIntervals,
      timeReviewRequired: summary.reviewRequired,
      timeReviewIssues: summary.issues,
      durationSource: 'event-intervals',
    }
  })
}
