function intervalTimestamp(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : 0
  }
  const timestamp = new Date(String(value ?? '').trim()).getTime()
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0
}

function intervalMinuteTimestamp(value) {
  const valueMs = intervalTimestamp(value)
  return valueMs ? Math.floor(valueMs / 60000) * 60000 : 0
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

/**
 * Removes technical GPS payloads from user-facing comments. Coordinates stay
 * available through the dedicated GPS indicator and are not removed from the
 * underlying record.
 */
export function workIntervalVisibleComment(value) {
  return String(value ?? '')
    .replace(/\[\[\s*GPS\b[\s\S]*?(?:\]\]|$)/gi, ' ')
    .split(/\s*\|\s*|\r?\n+/)
    .map((part) => String(part ?? '')
      .replace(/\s+/g, ' ')
      .trim())
    .filter((part) => part &&
      !/^(?:CLEAN_)?(?:START_GPS|STOP_GPS)\b/i.test(part) &&
      !/^(?:START|STOP)\s+[A-Z]{1,12}\d{2,}$/i.test(part))
    .join(' | ')
}

export const WORKDAY_INTEGRITY_STATES = Object.freeze({
  COMPLETE: 'COMPLETE',
  OPEN_SESSION: 'OPEN_SESSION',
  INCONSISTENT: 'INCONSISTENT',
  INVALID: 'INVALID',
})

export function formatWorkDurationHms(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

function explicitDurationSeconds(source, key) {
  if (!source || typeof source !== 'object' || !Object.prototype.hasOwnProperty.call(source, key)) {
    return null
  }
  const value = Number(source[key])
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

/**
 * Reads the canonical accounting buckets already calculated for a day. An
 * explicit zero is significant: it must not fall back to a legacy Workday
 * duration or to an active-session counter.
 */
export function workSessionSummarySeconds(row = {}) {
  const source = row && typeof row === 'object' ? row : {}
  const closedSessionsSec = explicitDurationSeconds(source, 'closedSessionsSec')
    ?? explicitDurationSeconds(source, 'workSec')
    ?? explicitDurationSeconds(source, 'durationSec')
    ?? 0
  const confirmedSec = explicitDurationSeconds(source, 'confirmedSec')
    ?? closedSessionsSec
  const provisionalSec = explicitDurationSeconds(source, 'provisionalSec')
    ?? 0
  const activeElapsedSec = explicitDurationSeconds(source, 'activeElapsedSec') ?? 0

  return {
    activeElapsedSec,
    closedSessionsSec,
    confirmedSec,
    provisionalSec,
  }
}

export function workSessionConfirmedTotalSeconds(rows = []) {
  return (Array.isArray(rows) ? rows : []).reduce(
    (sum, row) => sum + workSessionSummarySeconds(row).confirmedSec,
    0,
  )
}

export function workSessionProvisionalTotalSeconds(rows = []) {
  return (Array.isArray(rows) ? rows : []).reduce(
    (sum, row) => sum + workSessionSummarySeconds(row).provisionalSec,
    0,
  )
}

const MAX_SESSION_SECONDS = 24 * 60 * 60
const BUSINESS_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function warsawBusinessDateKey(value) {
  const timestamp = intervalTimestamp(value)
  if (!timestamp) return ''
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
  }).formatToParts(new Date(timestamp))
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${byType.year}-${byType.month}-${byType.day}`
}

function intervalId(interval = {}) {
  return String(interval?.eventId ?? interval?.id ?? '').trim()
}

function intervalUpdatedTimestamp(interval = {}) {
  return intervalTimestamp(interval?.updatedAt ?? interval?.editedAt ?? interval?.createdAt)
}

function normalizeInterval(interval = {}, options = {}) {
  const source = interval && typeof interval === 'object' ? interval : {}
  let startTs = Number(source.startTs ?? 0)
  let endTs = Number(source.endTs ?? 0)

  if (!Number.isFinite(startTs) || startTs <= 0) {
    startTs = intervalTimestamp(source.startAt ?? source.startIso)
  }
  if (!Number.isFinite(endTs) || endTs <= 0) {
    endTs = intervalTimestamp(source.endAt ?? source.endIso ?? source.stopAt)
  }
  if (source.isOpen === true) {
    endTs = 0
  }

  const isOpen = Boolean(startTs && !endTs)
  const normalized = {
    ...source,
    startTs,
    endTs,
    startAt: startTs ? new Date(startTs).toISOString() : '',
    endAt: endTs ? new Date(endTs).toISOString() : '',
    durationSec: startTs && endTs && endTs > startTs
      ? Math.floor((endTs - startTs) / 1000)
      : 0,
    isOpen,
    isValid: true,
    invalidReason: '',
  }

  if (!startTs) {
    normalized.isValid = false
    normalized.invalidReason = 'INVALID_START'
  } else if (endTs && endTs <= startTs) {
    normalized.isValid = false
    normalized.invalidReason = 'STOP_NOT_AFTER_START'
  } else if (endTs && (endTs - startTs) / 1000 > Number(options.maxSessionSeconds ?? MAX_SESSION_SECONDS)) {
    normalized.isValid = false
    normalized.invalidReason = 'SESSION_OVER_24_HOURS'
  }

  return normalized
}

function intervalPreferenceScore(interval = {}) {
  let score = intervalUpdatedTimestamp(interval) * 10
  if (!interval.isOpen) score += 4
  if (interval.isValid) score += 2
  if (interval.endTs) score += 1
  return score
}

function dedupeWorkIntervals(intervals = [], options = {}) {
  const output = []
  const positionsByEventId = new Map()
  const duplicateEventIds = new Set()

  ;(Array.isArray(intervals) ? intervals : []).forEach((interval) => {
    const normalized = normalizeInterval(interval, options)
    const eventId = intervalId(normalized)
    if (!eventId) {
      output.push(normalized)
      return
    }

    const existingIndex = positionsByEventId.get(eventId)
    if (existingIndex === undefined) {
      positionsByEventId.set(eventId, output.length)
      output.push(normalized)
      return
    }

    duplicateEventIds.add(eventId)
    if (intervalPreferenceScore(normalized) >= intervalPreferenceScore(output[existingIndex])) {
      output[existingIndex] = normalized
    }
  })

  output.sort((left, right) => {
    const leftStart = Number(left.startTs ?? 0) || Number.POSITIVE_INFINITY
    const rightStart = Number(right.startTs ?? 0) || Number.POSITIVE_INFINITY
    return leftStart - rightStart || Number(left.endTs ?? 0) - Number(right.endTs ?? 0)
  })

  return { intervals: output, duplicateEventIds: [...duplicateEventIds] }
}

export function mergeWorkIntervals(intervals = []) {
  const sorted = (Array.isArray(intervals) ? intervals : [])
    .map((interval) => normalizeInterval(interval))
    .filter((interval) => interval.isValid && !interval.isOpen && interval.endTs > interval.startTs)
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

function exactWorkSessionKey(session = {}) {
  const startTs = Number(session?.startTs) || intervalTimestamp(session?.startAt)
  const endTs = Number(session?.endTs) || intervalTimestamp(session?.endAt)
  if (!startTs || (endTs && endTs <= startTs)) return ''
  const workerKey = String(session?.workerLogin ?? session?.workerId ?? '').trim().toLowerCase()
  return `${workerKey}|${startTs}|${endTs || 'OPEN'}`
}

function workSessionStartKey(session = {}) {
  const startTs = Number(session?.startTs) || intervalTimestamp(session?.startAt)
  if (!startTs) return ''
  const workerKey = String(session?.workerLogin ?? session?.workerId ?? '').trim().toLowerCase()
  return `${workerKey}|${Math.floor(startTs / 60000)}`
}

function mergedSessionActivities(...collections) {
  const activities = []
  const seen = new Set()
  collections.flat().forEach((activity, index) => {
    if (!activity || typeof activity !== 'object') return
    const key = String(activity?.eventId ?? activity?.id ?? '').trim() || [
      activity?.startAt,
      activity?.endAt,
      activity?.clientId,
      activity?.zoneId,
      index,
    ].join('|')
    if (seen.has(key)) return
    seen.add(key)
    activities.push(activity)
  })
  return activities.sort((left, right) => intervalTimestamp(left?.startAt) - intervalTimestamp(right?.startAt))
}

/**
 * Collapses exact duplicate attendance records and a stale open copy when one
 * unique closed record has the same worker and START minute. Every source
 * Workday ID is retained so a later correction can update the whole group.
 * Conflicting closed records and partial overlaps remain integrity errors.
 */
export function collapseExactWorkSessions(sourceSessions = []) {
  const groups = new Map()
  const sessions = []
  ;(Array.isArray(sourceSessions) ? sourceSessions : [])
    .slice()
    .sort((left, right) => (
      intervalTimestamp(left?.startAt) - intervalTimestamp(right?.startAt) ||
      intervalTimestamp(left?.endAt) - intervalTimestamp(right?.endAt) ||
      String(left?.workdayId ?? left?.eventId ?? '').localeCompare(String(right?.workdayId ?? right?.eventId ?? ''))
    ))
    .forEach((source) => {
      const key = exactWorkSessionKey(source)
      const sourceWorkdayIds = [
        ...(Array.isArray(source?.sourceWorkdayIds) ? source.sourceWorkdayIds : []),
        source?.workdayId,
      ].map((value) => String(value ?? '').trim()).filter(Boolean)
      const existing = key ? groups.get(key) : null
      if (!existing) {
        const session = {
          ...source,
          activities: mergedSessionActivities(source?.activities ?? []),
          sourceWorkdayIds: [...new Set(sourceWorkdayIds)].sort(),
        }
        session.collapsedDuplicateCount = session.sourceWorkdayIds.length
        sessions.push(session)
        if (key) groups.set(key, session)
        return
      }

      existing.sourceWorkdayIds = [...new Set([...existing.sourceWorkdayIds, ...sourceWorkdayIds])].sort()
      existing.collapsedDuplicateCount = existing.sourceWorkdayIds.length
      existing.activities = mergedSessionActivities(existing.activities, source?.activities ?? [])
      existing.pauseTotalSec = Math.max(
        Number(existing.pauseTotalSec ?? existing.pauseSec ?? 0) || 0,
        Number(source?.pauseTotalSec ?? source?.pauseSec ?? 0) || 0,
      )
    })
  const closedByStart = new Map()
  sessions.forEach((session) => {
    if (session.isOpen || session.isValid === false) return
    const key = workSessionStartKey(session)
    if (!key) return
    const matches = closedByStart.get(key) ?? []
    matches.push(session)
    closedByStart.set(key, matches)
  })

  const supersededOpenSessions = new Set()
  sessions.forEach((session) => {
    if (!session.isOpen || session.isValid === false) return
    const matches = closedByStart.get(workSessionStartKey(session)) ?? []
    if (matches.length !== 1) return
    const target = matches[0]
    const sourceIds = Array.isArray(session.sourceWorkdayIds) ? session.sourceWorkdayIds : []
    target.sourceWorkdayIds = [...new Set([...target.sourceWorkdayIds, ...sourceIds])].sort()
    target.supersededOpenWorkdayIds = [...new Set([
      ...(Array.isArray(target.supersededOpenWorkdayIds) ? target.supersededOpenWorkdayIds : []),
      ...sourceIds,
    ])].sort()
    target.collapsedDuplicateCount = target.sourceWorkdayIds.length
    target.activities = mergedSessionActivities(target.activities, session.activities)
    target.pauseTotalSec = Math.max(
      Number(target.pauseTotalSec ?? target.pauseSec ?? 0) || 0,
      Number(session.pauseTotalSec ?? session.pauseSec ?? 0) || 0,
    )
    supersededOpenSessions.add(session)
  })

  return sessions.filter((session) => !supersededOpenSessions.has(session))
}

export function workIntervalsTotalSeconds(intervals = []) {
  return mergeWorkIntervals(intervals).reduce(
    (sum, interval) => sum + Math.max(0, Number(interval.durationSec ?? 0) || 0),
    0,
  )
}

export function workIntervalsFromRow(row = {}, options = {}) {
  if (Array.isArray(row?.workIntervals)) {
    return dedupeWorkIntervals(row.workIntervals, options).intervals
  }

  const startTs = intervalTimestamp(row?.startAt ?? row?.dayStartAt ?? row?.startIso)
  const endTs = intervalTimestamp(row?.endAt ?? row?.dayEndAt ?? row?.endIso ?? row?.stopAt)
  if (!startTs && !endTs) return []

  const interval = normalizeInterval(
    { ...row, startTs, endTs },
    options,
  )
  return [interval]
}

export function workIntervalCodes(intervals = []) {
  return dedupeWorkIntervals(intervals).intervals.flatMap((interval, index) => {
    if (!interval.startAt) return []
    const session = index + 1
    const codes = [{ type: 'START', at: interval.startAt, session, interval }]
    if (interval.endAt) codes.push({ type: 'STOP', at: interval.endAt, session, interval })
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

function issue(code, details = {}) {
  return { code, ...details }
}

function normalizeActivity(row = {}, options = {}) {
  const activity = normalizeInterval(row, options)
  return {
    ...activity,
    eventId: intervalId(row),
    workdayId: eventWorkdayKey(row),
    activityType: String(row?.eventType ?? row?.event_type ?? 'CLEAN').trim().toUpperCase() || 'CLEAN',
  }
}

function dedupeActivities(rows = [], options = {}) {
  const byId = new Map()
  const withoutId = []
  const duplicateEventIds = new Set()
  ;(Array.isArray(rows) ? rows : []).forEach((row) => {
    const activity = normalizeActivity(row, options)
    if (!activity.eventId) {
      withoutId.push(activity)
      return
    }
    if (byId.has(activity.eventId)) duplicateEventIds.add(activity.eventId)
    const previous = byId.get(activity.eventId)
    if (!previous || intervalPreferenceScore(activity) >= intervalPreferenceScore(previous)) {
      byId.set(activity.eventId, activity)
    }
  })
  return {
    activities: [...byId.values(), ...withoutId].sort(
      (left, right) => left.startTs - right.startTs || left.endTs - right.endTs,
    ),
    duplicateEventIds: [...duplicateEventIds],
  }
}

/**
 * Builds the canonical accounting view for one attendance Workday. The
 * Workday itself is the START-STOP session. Linked Event rows are operational
 * activities displayed inside that session and never contribute to worked
 * time.
 */
export function aggregateWorkSessions(workday = {}, events = [], options = {}) {
  const sourceRows = Array.isArray(events) ? events : []
  const { activities, duplicateEventIds } = dedupeActivities(sourceRows, options)
  const integrityIssues = []
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now()
  const directBusinessDate = String(workday?.businessDateYmd ?? workday?.dayKey ?? '').trim()
  const workdayStartTs = intervalTimestamp(workday?.dayStartAt ?? workday?.startAt ?? workday?.startIso)
  const workdayEndTs = intervalTimestamp(workday?.dayEndAt ?? workday?.endAt ?? workday?.endIso)
  const businessDateYmd = BUSINESS_DATE_RE.test(directBusinessDate)
    ? directBusinessDate
    : warsawBusinessDateKey(workdayStartTs)
  const workdayWorkerLogin = String(workday?.workerLogin ?? workday?.workerId ?? '').trim()

  const attendanceSession = normalizeInterval({
    ...workday,
    eventId: '',
    workdayId: String(workday?.workdayId ?? workday?.id ?? '').trim(),
    startAt: workday?.dayStartAt ?? workday?.startAt ?? workday?.startIso,
    endAt: workday?.dayEndAt ?? workday?.endAt ?? workday?.endIso ?? workday?.stopAt,
  }, options)
  attendanceSession.sessionNumber = 1
  attendanceSession.workdayId = String(workday?.workdayId ?? workday?.id ?? '').trim()
  attendanceSession.workerLogin = workdayWorkerLogin
  attendanceSession.workerName = String(workday?.workerName ?? '').trim()
  attendanceSession.startObject = workday?.startObject ?? workday?.workdayStartObject ?? ''
  attendanceSession.stopObject = workday?.stopObject ?? workday?.workdayStopObject ?? ''
  attendanceSession.dayGps = workday?.dayGps ?? workday?.gps ?? ''
  attendanceSession.dayComment = workday?.dayComment ?? workday?.comment ?? ''

  duplicateEventIds.forEach((eventId) => integrityIssues.push(issue('DUPLICATE_EVENT_ID', { eventId })))
  const workdayStatus = String(workday?.status ?? '').trim().toUpperCase()
  const workdayClosed = workdayStatus === 'CLOSED' || Boolean(workdayEndTs)
  const workdayEnvelopeSec = workdayStartTs && workdayEndTs && workdayEndTs > workdayStartTs
    ? Math.floor((workdayEndTs - workdayStartTs) / 1000)
    : 0
  if (!attendanceSession.startTs) {
    attendanceSession.isValid = false
    integrityIssues.push(issue('WORKDAY_START_MISSING'))
  }
  if (workdayStartTs > nowMs || workdayEndTs > nowMs) {
    attendanceSession.isValid = false
    integrityIssues.push(issue('WORKDAY_FUTURE_TIMESTAMP'))
  }
  if (workdayStartTs && workdayEndTs && workdayEndTs <= workdayStartTs) {
    attendanceSession.isValid = false
    integrityIssues.push(issue('WORKDAY_END_BEFORE_START'))
  }
  if (workdayEnvelopeSec > MAX_SESSION_SECONDS) {
    attendanceSession.isValid = false
    integrityIssues.push(issue('WORKDAY_ENVELOPE_EXCEEDED', { durationSec: workdayEnvelopeSec }))
  }
  const openSessions = attendanceSession.startTs && !attendanceSession.endTs ? [attendanceSession] : []
  if (workdayClosed && openSessions.length) integrityIssues.push(issue('CLOSED_WORKDAY_WITH_OPEN_SESSION'))
  if (!workdayClosed && attendanceSession.startTs) integrityIssues.push(issue('OPEN_SESSION'))

  activities.forEach((activity) => {
    const activityWorker = String(activity?.workerLogin ?? activity?.workerId ?? '').trim()
    if (workdayWorkerLogin && activityWorker && activityWorker !== workdayWorkerLogin) {
      activity.isValid = false
      integrityIssues.push(issue('ACTIVITY_WORKER_MISMATCH', { eventId: activity.eventId }))
    }
    if (!activity.startTs || !activity.isValid) {
      activity.isValid = false
      integrityIssues.push(issue(activity.invalidReason || 'ACTIVITY_INVALID', { eventId: activity.eventId }))
    }
    if (activity.startTs > nowMs || activity.endTs > nowMs) {
      activity.isValid = false
      integrityIssues.push(issue('ACTIVITY_FUTURE_TIMESTAMP', { eventId: activity.eventId }))
    }
    const activityStartMinute = intervalMinuteTimestamp(activity.startTs)
    const activityEndMinute = intervalMinuteTimestamp(activity.endTs)
    const sessionStartMinute = intervalMinuteTimestamp(attendanceSession.startTs)
    const sessionEndMinute = intervalMinuteTimestamp(attendanceSession.endTs)
    const activityOutsideSession = Boolean(
      sessionStartMinute &&
      (
        activityStartMinute < sessionStartMinute ||
        (sessionEndMinute && (activityStartMinute > sessionEndMinute || activityEndMinute > sessionEndMinute))
      )
    )
    if (activityOutsideSession) {
      activity.isValid = false
      integrityIssues.push(issue('ACTIVITY_OUTSIDE_SESSION', { eventId: activity.eventId }))
    }
    if (activity.isOpen && workdayClosed) {
      integrityIssues.push(issue('CLOSED_WORKDAY_WITH_OPEN_ACTIVITY', { eventId: activity.eventId }))
    }
  })

  const closedIntervals = attendanceSession.isValid && !attendanceSession.isOpen && attendanceSession.endTs > attendanceSession.startTs
    ? [attendanceSession]
    : []
  const closedSessionsSec = workIntervalsTotalSeconds(closedIntervals)
  const discrepancySec = Math.max(0, Math.floor(Number(workday?.durationSec ?? 0) || 0)) - closedSessionsSec
  const invalidIssues = integrityIssues.filter((entry) => ![
    'OPEN_SESSION',
    'CLOSED_WORKDAY_WITH_OPEN_SESSION',
    'CLOSED_WORKDAY_WITH_OPEN_ACTIVITY',
  ].includes(entry.code))

  let integrityState = WORKDAY_INTEGRITY_STATES.COMPLETE
  if (invalidIssues.length) {
    integrityState = WORKDAY_INTEGRITY_STATES.INVALID
  } else if (workdayClosed && openSessions.length) {
    integrityState = WORKDAY_INTEGRITY_STATES.INCONSISTENT
  } else if (openSessions.length) {
    integrityState = WORKDAY_INTEGRITY_STATES.OPEN_SESSION
  } else if (integrityIssues.some((entry) => entry.code === 'CLOSED_WORKDAY_WITH_OPEN_ACTIVITY')) {
    integrityState = WORKDAY_INTEGRITY_STATES.INCONSISTENT
  }

  return {
    businessDateYmd,
    canFinalize: !invalidIssues.length && !openSessions.length && !activities.some((activity) => activity.isOpen) && closedIntervals.length > 0,
    closedSessionsSec,
    openSessions,
    confirmedSec: closedSessionsSec,
    provisionalSec: 0,
    discrepancySec,
    integrityState,
    integrityIssues,
    issues: integrityIssues,
    problems: integrityIssues,
    workdayEnvelopeSec,
    activities,
    workIntervals: [attendanceSession],
    mergedWorkIntervals: mergeWorkIntervals(closedIntervals),
  }
}

export function workSessionAccountingFromRow(row = {}, options = {}) {
  const activities = Array.isArray(row?.activities) ? row.activities : []
  return aggregateWorkSessions(row, activities, {
    ...options,
  })
}

/**
 * Reads the overall Workday presence separately from its linked Event
 * sessions. A stored duration is trusted only when it matches the exact
 * START/STOP envelope; corrupt legacy values (for example 208 hours for one
 * day) are rejected so callers can fall back to closed session time.
 */
export function workdayPresenceFromRows(rows = []) {
  const uniqueRows = new Map()
  ;(Array.isArray(rows) ? rows : []).forEach((row, index) => {
    const key = String(row?.workdayId ?? row?.id ?? `row-${index}`).trim()
    if (!uniqueRows.has(key)) uniqueRows.set(key, row)
  })

  const candidates = [...uniqueRows.values()].map((row) => {
    const startTs = intervalTimestamp(row?.startAt ?? row?.dayStartAt ?? row?.startIso)
    const endTs = intervalTimestamp(row?.endAt ?? row?.dayEndAt ?? row?.endIso ?? row?.stopAt)
    const envelopeSec = startTs && endTs && endTs > startTs
      ? Math.floor((endTs - startTs) / 1000)
      : 0
    const recordedRaw = row?.recordedDurationSec ?? (
      row?.durationSource === 'event-intervals' ? undefined : row?.durationSec
    )
    const recordedDurationSec = Math.max(0, Math.floor(Number(recordedRaw) || 0))
    const isReliable = Boolean(
      startTs &&
      endTs > startTs &&
      envelopeSec <= MAX_SESSION_SECONDS &&
      recordedDurationSec > 0 &&
      Math.abs(recordedDurationSec - envelopeSec) <= 1
    )
    return { startTs, endTs, recordedDurationSec, isReliable }
  })

  const validStarts = candidates.map((entry) => entry.startTs).filter((value) => value > 0)
  const validEnds = candidates.map((entry) => entry.endTs).filter((value) => value > 0)
  const isReliable = candidates.length === 1 && candidates[0].isReliable

  return {
    startAt: validStarts.length ? new Date(Math.min(...validStarts)).toISOString() : '',
    endAt: validEnds.length ? new Date(Math.max(...validEnds)).toISOString() : '',
    durationSec: isReliable ? candidates[0].recordedDurationSec : 0,
    isReliable,
  }
}

/**
 * Aggregates every attendance Workday for one employee and Warsaw business
 * date. Gaps between sessions are never counted. Closed overlapping sessions
 * are merged for the displayed total and reported as an integrity error.
 */
export function aggregateWorkTimeDay(rows = [], options = {}) {
  const sourceRows = Array.isArray(rows) ? rows : []
  const seenWorkdayIds = new Set()
  const sourceSessions = []
  const issues = []
  const sourceSessionIssues = []

  sourceRows.forEach((row, rowIndex) => {
    const workdayId = String(row?.workdayId ?? row?.id ?? '').trim()
    if (workdayId && seenWorkdayIds.has(workdayId)) {
      issues.push(issue('DUPLICATE_WORKDAY_ID', { workdayId }))
      return
    }
    if (workdayId) seenWorkdayIds.add(workdayId)
    const accounting = row?.durationSource === 'workday-session'
      ? workSessionAccountingFromRow(row, options)
      : aggregateWorkSessions(row, row?.activities ?? [], options)
    const attendance = accounting.workIntervals?.[0]
    if (attendance) {
      sourceSessions.push({
        ...attendance,
        sessionNumber: sourceSessions.length + 1,
        workdayId: workdayId || attendance.workdayId || `workday-${rowIndex + 1}`,
        activities: accounting.activities ?? [],
        integrityState: accounting.integrityState,
        integrityIssues: accounting.integrityIssues ?? [],
      })
    }
    ;(accounting.integrityIssues ?? []).forEach((entry) => {
      sourceSessionIssues.push({ entry, workdayId })
    })
  })

  const sessions = collapseExactWorkSessions(sourceSessions)
  const supersededOpenWorkdayIds = new Set(
    sessions.flatMap((session) => Array.isArray(session.supersededOpenWorkdayIds) ? session.supersededOpenWorkdayIds : []),
  )
  sourceSessionIssues.forEach(({ entry, workdayId }) => {
    const code = String(entry?.code ?? '').trim().toUpperCase()
    if (supersededOpenWorkdayIds.has(workdayId) && [
      'OPEN_SESSION',
      'CLOSED_WORKDAY_WITH_OPEN_SESSION',
    ].includes(code)) return
    issues.push(entry)
  })
  sessions.forEach((session, index) => { session.sessionNumber = index + 1 })
  const activities = mergedSessionActivities(sessions.flatMap((session) => session.activities ?? []))
  const pauseSec = sessions.reduce((sum, session) => (
    sum + Math.max(0, Math.floor(Number(session?.pauseTotalSec ?? session?.pauseSec ?? session?.breakSec ?? 0) || 0))
  ), 0)
  const closedSessions = sessions.filter(
    (session) => session.isValid && !session.isOpen && session.endTs > session.startTs,
  )
  let activeClosedSession = null
  closedSessions.forEach((session) => {
    if (activeClosedSession && session.startTs < activeClosedSession.endTs) {
      issues.push(issue('OVERLAPPING_WORK_SESSIONS', {
        workdayIds: [activeClosedSession.workdayId, session.workdayId].filter(Boolean),
      }))
    }
    if (!activeClosedSession || session.endTs > activeClosedSession.endTs) activeClosedSession = session
  })

  const openSessions = sessions.filter((session) => session.isOpen)
  const workedSec = workIntervalsTotalSeconds(closedSessions)
  const starts = sessions.map((session) => session.startTs).filter((value) => value > 0)
  const stops = sessions.map((session) => session.endTs).filter((value) => value > 0)
  const hasInvalid = issues.some((entry) => ![
    'OPEN_SESSION',
    'CLOSED_WORKDAY_WITH_OPEN_SESSION',
    'CLOSED_WORKDAY_WITH_OPEN_ACTIVITY',
  ].includes(entry.code))
  const hasInconsistent = issues.some((entry) => [
    'CLOSED_WORKDAY_WITH_OPEN_SESSION',
    'CLOSED_WORKDAY_WITH_OPEN_ACTIVITY',
  ].includes(entry.code))
  const integrityState = hasInvalid
    ? WORKDAY_INTEGRITY_STATES.INVALID
    : hasInconsistent
      ? WORKDAY_INTEGRITY_STATES.INCONSISTENT
      : openSessions.length
        ? WORKDAY_INTEGRITY_STATES.OPEN_SESSION
        : WORKDAY_INTEGRITY_STATES.COMPLETE

  return {
    activities,
    canFinalize: sessions.length > 0 && integrityState === WORKDAY_INTEGRITY_STATES.COMPLETE,
    collapsedDuplicateSessionCount: sessions.reduce(
      (sum, session) => sum + Math.max(0, Number(session?.sourceWorkdayIds?.length ?? 1) - 1),
      0,
    ),
    closedSessionsSec: workedSec,
    confirmedSec: workedSec,
    firstStartAt: starts.length ? new Date(Math.min(...starts)).toISOString() : '',
    integrityIssues: issues,
    integrityState,
    issues,
    lastClosedStopAt: stops.length ? new Date(Math.max(...stops)).toISOString() : '',
    lastStopAt: openSessions.length || !stops.length ? '' : new Date(Math.max(...stops)).toISOString(),
    openSessionCount: openSessions.length,
    openSessions,
    pauseSec,
    provisionalSec: 0,
    realWorkSec: workedSec,
    sessions,
    workIntervals: sessions,
    workedSec,
  }
}

/**
 * Projects day-level accounting rows into table rows representing exact
 * attendance START/STOP cycles. The original day sources stay attached so
 * the history dialog and exports can continue to operate on the complete day.
 */
export function workTimeCycleRowsFromDays(rows = []) {
  return (Array.isArray(rows) ? rows : []).flatMap((day) => {
    const sessions = (Array.isArray(day?.sessions) ? day.sessions : [])
      .filter((session) => session && typeof session === 'object')
      .sort((left, right) => {
        const startDiff = intervalTimestamp(right?.startAt) - intervalTimestamp(left?.startAt)
        if (startDiff) return startDiff
        return String(right?.workdayId ?? '').localeCompare(String(left?.workdayId ?? ''))
      })
    if (!sessions.length) return [day]

    return sessions.map((session, index) => {
      const startTs = intervalTimestamp(session?.startAt)
      const endTs = intervalTimestamp(session?.endAt)
      const isOpen = session?.isOpen === true || Boolean(startTs && !endTs)
      const isValid = session?.isValid !== false && Boolean(startTs) && (isOpen || endTs > startTs)
      const workSec = isValid && !isOpen && endTs > startTs
        ? Math.floor((endTs - startTs) / 1000)
        : 0
      const sessionIntegrityState = String(session?.integrityState ?? '').trim().toUpperCase()
      const integrityState = !isValid
        ? WORKDAY_INTEGRITY_STATES.INVALID
        : isOpen
          ? WORKDAY_INTEGRITY_STATES.OPEN_SESSION
          : sessionIntegrityState || WORKDAY_INTEGRITY_STATES.COMPLETE
      const integrityIssues = Array.isArray(session?.integrityIssues)
        ? session.integrityIssues
        : Array.isArray(session?.issues)
          ? session.issues
          : []
      const breakSec = Math.max(0, Math.floor(Number(
        session?.pauseTotalSec ?? session?.pauseSec ?? session?.breakSec ?? 0,
      ) || 0))
      const dayKey = String(day?.dayKey ?? day?.businessDateYmd ?? '').trim()

      return {
        ...day,
        dayKey,
        businessDateYmd: String(day?.businessDateYmd ?? dayKey).trim(),
        startAt: startTs ? new Date(startTs).toISOString() : '',
        endAt: !isOpen && endTs ? new Date(endTs).toISOString() : '',
        lastClosedStopAt: !isOpen && endTs ? new Date(endTs).toISOString() : '',
        workSec,
        realWorkSec: workSec,
        closedSessionsSec: workSec,
        confirmedSec: integrityState === WORKDAY_INTEGRITY_STATES.COMPLETE ? workSec : 0,
        provisionalSec: 0,
        breakSec,
        netSec: workSec,
        integrityState,
        integrityIssues,
        issues: integrityIssues,
        openSessionCount: isOpen ? 1 : 0,
        openSessions: isOpen ? [session] : [],
        sessions: [session],
        activities: Array.isArray(session?.activities) ? session.activities : [],
        workdayId: String(session?.workdayId ?? day?.workdayId ?? '').trim(),
        version: String(session?.version ?? day?.version ?? '').trim(),
        updatedBy: String(session?.editedBy ?? session?.updatedBy ?? day?.updatedBy ?? '').trim() || '-',
        comment: String(session?.comment ?? day?.comment ?? '').trim(),
        cycleIndex: index,
        cycleNumber: index + 1,
        cycleCount: sessions.length,
        isCycleRow: true,
        sourceRows: Array.isArray(day?.sourceRows) ? day.sourceRows : [],
      }
    })
  })
}

/**
 * Kept as a compatibility adapter for existing callers. Multiple Workday
 * records on one Warsaw business date are valid because a worker may start
 * and stop work any number of times during that day.
 */
export function markMultipleWorkdaysForBusinessDate(rows = []) {
  return Array.isArray(rows) ? [...rows] : []
}

export function incompleteWorkTimeRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const state = String(row?.integrityState ?? '').trim().toUpperCase()
    return state !== WORKDAY_INTEGRITY_STATES.COMPLETE
  })
}

export function assertWorkTimeRowsExportable(rows = []) {
  const blockers = incompleteWorkTimeRows(rows)
  if (!blockers.length) return true

  const labels = blockers.slice(0, 5).map((row) => {
    const day = String(row?.dayKey ?? row?.businessDateYmd ?? row?.date ?? '').trim() || 'bez daty'
    const worker = String(row?.workerName ?? row?.workerLogin ?? '').trim()
    const state = String(row?.integrityState ?? '').trim()
    const rowIssues = Array.isArray(row?.integrityIssues)
      ? row.integrityIssues
      : Array.isArray(row?.issues)
        ? row.issues
        : Array.isArray(row?.problems)
          ? row.problems
          : []
    const issueLabels = rowIssues
      .map((entry) => {
        if (typeof entry === 'string') return entry.trim()
        return String(entry?.message ?? entry?.label ?? entry?.code ?? '').trim()
      })
      .filter(Boolean)
    if (!issueLabels.length && Array.isArray(row?.openSessions) && row.openSessions.length) {
      issueLabels.push(`brak STOP (${row.openSessions.length})`)
    }
    const problems = [...new Set(issueLabels)].slice(0, 2).join(', ') || state
    return `${[day, worker].filter(Boolean).join(' - ')}: ${problems || 'dzień wymaga naprawy'}`
  })
  const remaining = blockers.length - labels.length
  const error = new Error(
    `Nie można wyeksportować ewidencji: ${blockers.length} ${blockers.length === 1 ? 'dzień wymaga' : 'dni wymaga'} naprawy. ` +
      `${labels.join('; ')}${remaining > 0 ? `; oraz ${remaining} więcej` : ''}.`,
  )
  error.code = 'INCOMPLETE_WORKDAYS'
  error.blockers = blockers
  throw error
}

export function enrichWorkdaysWithEventIntervals(workdays = [], events = [], options = {}) {
  const eventsByWorkday = new Map()

  ;(Array.isArray(events) ? events : []).forEach((event) => {
    if (!isExplicitEvent(event)) return
    const workdayKey = eventWorkdayKey(event)
    if (!workdayKey) return

    const current = eventsByWorkday.get(workdayKey) ?? []
    current.push(event)
    eventsByWorkday.set(workdayKey, current)
  })

  const enriched = (Array.isArray(workdays) ? workdays : []).map((workday) => {
    const workdayKey = String(workday?.workdayId ?? workday?.id ?? '').trim()
    const linkedEvents = eventsByWorkday.get(workdayKey) ?? []
    const accounting = aggregateWorkSessions(workday, linkedEvents, {
      ...options,
    })
    return {
      ...workday,
      recordedDurationSec: Math.max(0, Number(workday?.durationSec ?? 0) || 0),
      durationSec: accounting.closedSessionsSec,
      ...accounting,
      durationSource: 'workday-session',
      sessionSourceAvailable: true,
    }
  })
  return markMultipleWorkdaysForBusinessDate(enriched)
}
