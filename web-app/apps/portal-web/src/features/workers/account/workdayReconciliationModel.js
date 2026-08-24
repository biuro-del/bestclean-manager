import { collapseExactWorkSessions, formatWorkDurationHms } from '../workIntervals.js'

export const WORKDAY_RECONCILIATION_STATES = Object.freeze({
  COMPLETE: 'COMPLETE',
  OPEN_SESSION: 'OPEN_SESSION',
  INCONSISTENT: 'INCONSISTENT',
  INVALID: 'INVALID',
})

export const WORKDAY_RECONCILIATION_STATE_COPY = Object.freeze({
  COMPLETE: Object.freeze({ label: 'Dzień kompletny', tone: 'success' }),
  OPEN_SESSION: Object.freeze({ label: 'Niezamknięta sesja', tone: 'warning' }),
  INCONSISTENT: Object.freeze({ label: 'Dzień wymaga korekty', tone: 'danger' }),
  INVALID: Object.freeze({ label: 'Nieprawidłowe dane', tone: 'danger' }),
})

export const WORKDAY_BUSINESS_TIME_ZONE = 'Europe/Warsaw'

function timeZoneParts(value, timeZone = WORKDAY_BUSINESS_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  }
}

function timeZoneOffsetMs(date, timeZone = WORKDAY_BUSINESS_TIME_ZONE) {
  const parts = timeZoneParts(date, timeZone)
  if (!parts) return 0
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  return representedAsUtc - date.getTime()
}

export function isoToWarsawDateTimeInput(value) {
  const parts = timeZoneParts(value)
  if (!parts) return ''
  const pad = (part) => String(part).padStart(2, '0')
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`
}

export function warsawDateTimeInputToIso(value) {
  const match = String(value ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) return ''
  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw, secondRaw = '0'] = match
  const expected = {
    year: Number(yearRaw),
    month: Number(monthRaw),
    day: Number(dayRaw),
    hour: Number(hourRaw),
    minute: Number(minuteRaw),
    second: Number(secondRaw),
  }
  if (
    expected.month < 1 || expected.month > 12 ||
    expected.day < 1 || expected.day > 31 ||
    expected.hour > 23 || expected.minute > 59 || expected.second > 59
  ) return ''

  const wallClockUtc = Date.UTC(
    expected.year,
    expected.month - 1,
    expected.day,
    expected.hour,
    expected.minute,
    expected.second,
  )
  let instantMs = wallClockUtc - timeZoneOffsetMs(new Date(wallClockUtc))
  instantMs = wallClockUtc - timeZoneOffsetMs(new Date(instantMs))
  const actual = timeZoneParts(new Date(instantMs))
  if (!actual || Object.keys(expected).some((key) => actual[key] !== expected[key])) return ''
  return new Date(instantMs).toISOString()
}

function normalizedSeconds(value) {
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
}

function hasOwnValue(source, key) {
  return Boolean(source && typeof source === 'object' && Object.prototype.hasOwnProperty.call(source, key))
}

function timestamp(value) {
  const result = new Date(String(value ?? '').trim()).getTime()
  return Number.isFinite(result) && result > 0 ? result : 0
}

export function formatReconciliationDuration(value) {
  return formatWorkDurationHms(value)
}

function normalizedIssue(issue, index = 0) {
  if (typeof issue === 'string') {
    const message = issue.trim()
    const code = /^[A-Z][A-Z0-9_]*$/.test(message) ? message : `ISSUE_${index + 1}`
    return { code, message }
  }
  const source = issue && typeof issue === 'object' ? issue : {}
  const message = String(source.message ?? source.label ?? source.code ?? 'Dzień wymaga sprawdzenia.').trim()
  const messageCode = /^[A-Z][A-Z0-9_]*$/.test(message) ? message : ''
  const explicitCode = String(source.code ?? '').trim()
  const code = messageCode && (!explicitCode || /^ISSUE_\d+$/.test(explicitCode))
    ? messageCode
    : explicitCode || `ISSUE_${index + 1}`
  return {
    ...source,
    code,
    message,
  }
}

function normalizedSession(session, index = 0) {
  const source = session && typeof session === 'object' ? session : {}
  const startAt = String(source.startAt ?? source.startIso ?? '').trim()
  const endAt = String(source.endAt ?? source.endIso ?? '').trim()
  const startTs = timestamp(startAt)
  const endTs = timestamp(endAt)
  const isOpen = source.isOpen === true || Boolean(startTs && !endTs)
  const calculatedSec = startTs && endTs > startTs ? Math.floor((endTs - startTs) / 1000) : 0
  const issues = (Array.isArray(source.issues) ? source.issues : []).map(normalizedIssue)
  const blockingIssues = issues.filter((issue) => String(issue?.code ?? '').trim().toUpperCase() !== 'OPEN_SESSION')
  const isValid = source.isValid !== false && !blockingIssues.length && Boolean(startTs) && (isOpen || endTs > startTs)
  const workdayId = String(source.workdayId ?? source.linkedWorkdayId ?? '').trim()
  return {
    ...source,
    eventId: String(source.eventId ?? source.workdayId ?? source.id ?? '').trim(),
    workdayId,
    sourceWorkdayIds: [...new Set([
      ...(Array.isArray(source.sourceWorkdayIds) ? source.sourceWorkdayIds : []),
      workdayId,
    ].map((value) => String(value ?? '').trim()).filter(Boolean))].sort(),
    sessionNumber: Math.max(1, Number(source.sessionNumber ?? source.session ?? index + 1) || index + 1),
    startAt,
    endAt: isOpen ? '' : endAt,
    durationSec: isOpen ? 0 : (normalizedSeconds(source.durationSec) || calculatedSec),
    isOpen,
    isValid,
    issues,
    activities: (Array.isArray(source.activities) ? source.activities : []).map((activity) => ({
      ...activity,
      eventId: String(activity?.eventId ?? activity?.id ?? '').trim(),
      workdayId: String(activity?.workdayId ?? source.workdayId ?? '').trim(),
      startAt: String(activity?.startAt ?? '').trim(),
      endAt: String(activity?.endAt ?? '').trim(),
      isOpen: activity?.isOpen === true || Boolean(timestamp(activity?.startAt) && !timestamp(activity?.endAt)),
      issues: (Array.isArray(activity?.issues) ? activity.issues : []).map(normalizedIssue),
    })),
  }
}

function uniqueSessions(sessions = []) {
  const seen = new Set()
  const uniqueSourceSessions = (Array.isArray(sessions) ? sessions : [])
    .map(normalizedSession)
    .filter((session) => {
      const key = session.eventId || [session.startAt, session.endAt, session.workdayId].join('|')
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
  return collapseExactWorkSessions(uniqueSourceSessions)
    .sort((left, right) => timestamp(left.startAt) - timestamp(right.startAt))
    .map((session, index) => ({ ...session, sessionNumber: index + 1 }))
}

function sessionsOverlap(sessions = []) {
  const ranges = (Array.isArray(sessions) ? sessions : [])
    .filter((session) => session?.isValid && !session?.isOpen)
    .map((session) => ({ start: timestamp(session.startAt), end: timestamp(session.endAt) }))
    .filter((range) => range.start && range.end > range.start)
    .sort((left, right) => left.start - right.start || left.end - right.end)
  let furthestEnd = 0
  return ranges.some((range) => {
    const overlaps = furthestEnd > 0 && range.start < furthestEnd
    furthestEnd = Math.max(furthestEnd, range.end)
    return overlaps
  })
}

function sourceIntervals(row = {}) {
  const direct = Array.isArray(row?.workIntervals) ? row.workIntervals : []
  const nested = (Array.isArray(row?.sourceRows) ? row.sourceRows : [])
    .flatMap((source) => Array.isArray(source?.workIntervals) ? source.workIntervals : [])
  return [...direct, ...nested]
}

function fallbackWorkday(row = {}, workdayId = '') {
  const sourceRows = Array.isArray(row?.sourceRows) ? row.sourceRows : []
  const source = sourceRows.find((entry) => {
    const id = String(entry?.workdayId ?? entry?.id ?? '').trim()
    return !workdayId || id === workdayId
  }) ?? sourceRows[0] ?? row
  return {
    ...source,
    workdayId: String(source?.workdayId ?? source?.id ?? workdayId).trim(),
    startAt: String(source?.startAt ?? source?.dayStartAt ?? row?.startAt ?? '').trim(),
    endAt: String(source?.endAt ?? source?.dayEndAt ?? row?.endAt ?? '').trim(),
    status: String(source?.status ?? row?.status ?? '').trim().toUpperCase(),
    comment: String(source?.comment ?? row?.comment ?? '').trim(),
    updatedBy: String(source?.updatedBy ?? source?.editedBy ?? row?.updatedBy ?? '').trim(),
    updatedAt: String(source?.updatedAt ?? row?.latestUpdatedAt ?? '').trim(),
    businessDateYmd: String(source?.businessDateYmd ?? source?.dayKey ?? row?.dayKey ?? '').trim(),
  }
}

function inferredState(preferred, workday, sessions, issues) {
  const normalized = String(preferred ?? '').trim().toUpperCase()
  if (Object.hasOwn(WORKDAY_RECONCILIATION_STATES, normalized)) return normalized
  if (sessions.some((session) => !session.isValid) || issues.some((issue) => issue.code === 'INVALID')) {
    return WORKDAY_RECONCILIATION_STATES.INVALID
  }
  if (sessions.some((session) => session.isOpen)) {
    return workday.status === 'CLOSED'
      ? WORKDAY_RECONCILIATION_STATES.INCONSISTENT
      : WORKDAY_RECONCILIATION_STATES.OPEN_SESSION
  }
  return WORKDAY_RECONCILIATION_STATES.COMPLETE
}

export function normalizeWorkdayReconciliation(reconciliation = {}, fallbackRow = {}, requestedWorkdayId = '') {
  const source = reconciliation && typeof reconciliation === 'object' ? reconciliation : {}
  const workday = {
    ...fallbackWorkday(fallbackRow, requestedWorkdayId),
    ...(source.workday && typeof source.workday === 'object' ? source.workday : {}),
  }
  const fallbackOpen = Array.isArray(fallbackRow?.openSessions) ? fallbackRow.openSessions : []
  const fallbackSessions = [...sourceIntervals(fallbackRow), ...fallbackOpen]
  const sourceSessions = Array.isArray(source.sessions) ? source.sessions : []
  const enrichedSourceSessions = sourceSessions.map((session) => {
    const eventId = String(session?.eventId ?? session?.id ?? '').trim()
    const fallback = eventId
      ? fallbackSessions.find((candidate) => String(candidate?.eventId ?? candidate?.id ?? '').trim() === eventId)
      : null
    return fallback ? { ...fallback, ...session } : session
  })
  const sessions = uniqueSessions([
    ...enrichedSourceSessions,
    ...sourceIntervals(fallbackRow),
    ...(Array.isArray(source.openSessions) ? source.openSessions : fallbackOpen),
  ])
  const rawIssues = (Array.isArray(source.issues)
    ? source.issues
    : Array.isArray(source.problems)
      ? source.problems
      : Array.isArray(fallbackRow?.integrityIssues)
        ? fallbackRow.integrityIssues
        : []).map(normalizedIssue)
  const hasSessionOverlap = sessionsOverlap(sessions)
  const ignoredLegacyOnly = rawIssues.length > 0 && rawIssues.every((issue) => {
    const code = String(issue?.code ?? '').trim().toUpperCase()
    return code === 'MULTIPLE_WORKDAYS_FOR_BUSINESS_DATE' ||
      (code === 'EMPTY_SESSION_SET' && sessions.length > 0) ||
      (['OVERLAPPING_WORK_SESSIONS', 'OVERLAPPING_SESSIONS', 'SESSION_OVERLAP'].includes(code) && !hasSessionOverlap)
  })
  const issues = rawIssues
    .filter((issue) => !(
      String(issue?.code ?? '').trim().toUpperCase() === 'MULTIPLE_WORKDAYS_FOR_BUSINESS_DATE' ||
      (
        String(issue?.code ?? '').trim().toUpperCase() === 'EMPTY_SESSION_SET' &&
        sessions.length > 0
      ) ||
      (
        ['OVERLAPPING_WORK_SESSIONS', 'OVERLAPPING_SESSIONS', 'SESSION_OVERLAP'].includes(String(issue?.code ?? '').trim().toUpperCase()) &&
        !hasSessionOverlap
      )
    ))
  const integrityState = inferredState(
    ignoredLegacyOnly ? '' : source.integrityState ?? fallbackRow?.integrityState,
    workday,
    sessions,
    issues,
  )
  const openSessions = sessions.filter((session) => session.isOpen)
  const invalidSessions = sessions.filter((session) => !session.isValid)
  const calculatedClosedSec = sessions.reduce(
    (sum, session) => sum + (!session.isOpen && session.isValid ? session.durationSec : 0),
    0,
  )
  const closedSessionsSec = normalizedSeconds(
    source.closedSessionsSec ?? fallbackRow?.closedSessionsSec,
  ) || calculatedClosedSec
  const confirmedSec = hasOwnValue(source, 'confirmedSec')
    ? normalizedSeconds(source.confirmedSec)
    : hasOwnValue(fallbackRow, 'confirmedSec')
      ? normalizedSeconds(fallbackRow.confirmedSec)
      : closedSessionsSec
  const provisionalSec = hasOwnValue(source, 'provisionalSec')
    ? normalizedSeconds(source.provisionalSec)
    : hasOwnValue(fallbackRow, 'provisionalSec')
      ? normalizedSeconds(fallbackRow.provisionalSec)
      : 0
  const canFinalize = source.canFinalize === true || (
    source.canFinalize !== false &&
    integrityState === WORKDAY_RECONCILIATION_STATES.COMPLETE &&
    !openSessions.length &&
    !invalidSessions.length
  )

  return {
    ...source,
    workdayId: String(source.workdayId ?? source.sessions?.[0]?.workdayId ?? workday.workdayId ?? requestedWorkdayId).trim(),
    businessDateYmd: String(source.businessDateYmd ?? workday.businessDateYmd ?? fallbackRow?.dayKey ?? '').trim(),
    version: String(source.version ?? workday.updatedAt ?? '').trim(),
    sessionVersion: String(source.sessionVersion ?? source.version ?? '').trim().toLowerCase(),
    integrityState,
    stateCopy: WORKDAY_RECONCILIATION_STATE_COPY[integrityState],
    canFinalize,
    closedSessionsSec,
    confirmedSec,
    provisionalSec,
    activeElapsedSec: normalizedSeconds(source.activeElapsedSec),
    workdayEnvelopeSec: normalizedSeconds(source.workdayEnvelopeSec),
    discrepancySec: Math.trunc(Number(source.discrepancySec) || 0),
    sessions,
    collapsedDuplicateSessionCount: sessions.reduce(
      (sum, session) => sum + Math.max(0, Number(session?.sourceWorkdayIds?.length ?? 1) - 1),
      0,
    ),
    openSessions,
    issues,
    problems: issues,
    workday: source.sessions?.[0] && typeof source.sessions[0] === 'object'
      ? { ...workday, ...source.sessions[0] }
      : workday,
    latestCorrection: source.latestCorrection && typeof source.latestCorrection === 'object'
      ? source.latestCorrection
      : null,
    isFallback: !Object.keys(source).length,
  }
}

export function reconciliationHasBlockingProblems(model = {}, corrections = [], activityCorrections = []) {
  const correctionMap = new Map(
    (Array.isArray(corrections) ? corrections : [])
      .map((correction) => [String(correction?.eventId ?? '').trim(), correction])
      .filter(([eventId]) => Boolean(eventId)),
  )
  const activityCorrectionMap = new Map(
    (Array.isArray(activityCorrections) ? activityCorrections : [])
      .map((correction) => [String(correction?.eventId ?? '').trim(), correction])
      .filter(([eventId]) => Boolean(eventId)),
  )
  const sessions = (Array.isArray(model?.sessions) ? model.sessions : []).map((session) => {
    const eventId = String(session?.eventId ?? '').trim()
    const correction = correctionMap.get(eventId)
    const startAt = String(correction?.startAt ?? session?.startAt ?? '').trim()
    const endAt = String(correction?.endAt ?? session?.endAt ?? '').trim()
    const startTs = timestamp(startAt)
    const endTs = timestamp(endAt)
    const isOpen = Boolean(startTs && !endTs)
    const durationMs = startTs && endTs ? endTs - startTs : 0
    const correctedRangeIsValid = Boolean(durationMs > 0 && durationMs <= 24 * 60 * 60 * 1000)
    const activitiesValid = (Array.isArray(session?.activities) ? session.activities : []).every((activity) => {
      const activityId = String(activity?.eventId ?? '').trim()
      const activityCorrection = activityCorrectionMap.get(activityId)
      const activityStart = timestamp(activityCorrection?.startAt ?? activity?.startAt)
      const activityEnd = timestamp(activityCorrection?.endAt ?? activity?.endAt)
      if (!activityStart || !activityEnd || activityEnd <= activityStart) return false
      return activityStart >= startTs && activityEnd <= endTs
    })
    return {
      eventId,
      startTs,
      endTs,
      isOpen,
      isValid: correction
        ? correctedRangeIsValid
        : session?.isValid !== false && (isOpen || correctedRangeIsValid),
      activitiesValid,
    }
  })
  if (!sessions.length || sessions.some((session) => session.isOpen || !session.isValid || !session.activitiesValid)) return true

  const intervals = sessions
    .map((session) => ({ start: session.startTs, end: session.endTs }))
    .sort((left, right) => left.start - right.start || left.end - right.end)
  const overlaps = intervals.some((range, index) => index > 0 && range.start < intervals[index - 1].end)
  if (overlaps) return true

  const resolvedByFinalization = new Set([
    'OPEN_SESSION',
    'CLOSED_WORKDAY_WITH_OPEN_SESSION',
    'WORKDAY_DURATION_MISMATCH',
    'WORKDAY_NOT_CLOSED',
  ])
  const repairableSessionIssues = new Set([
    'INVALID_START',
    'INVALID_SESSION',
    'SESSION_BUSINESS_DATE_MISMATCH',
    'SESSION_DURATION_EXCEEDED',
    'SESSION_END_BEFORE_START',
    'SESSION_FUTURE_TIMESTAMP',
    'SESSION_OUTSIDE_WORKDAY_ENVELOPE',
    'SESSION_OVER_24_HOURS',
    'SESSION_START_MISSING',
    'STOP_NOT_AFTER_START',
  ])
  return (Array.isArray(model?.issues) ? model.issues : []).some((issue) => {
    const code = String(issue?.code ?? '').trim().toUpperCase()
    if (!code || resolvedByFinalization.has(code)) return false
    if (code === 'SESSION_OVERLAP' || code === 'OVERLAPPING_SESSIONS' || code === 'OVERLAPPING_WORK_SESSIONS') return overlaps
    const eventId = String(issue?.eventId ?? '').trim()
    const repairableActivityIssues = new Set([
      'ACTIVITY_END_BEFORE_START',
      'ACTIVITY_FUTURE_TIMESTAMP',
      'ACTIVITY_OUTSIDE_SESSION',
      'ACTIVITY_START_MISSING',
      'CLOSED_SESSION_WITH_OPEN_ACTIVITY',
      'CLOSED_WORKDAY_WITH_OPEN_ACTIVITY',
      'OPEN_ACTIVITY',
    ])
    if (eventId && activityCorrectionMap.has(eventId) && repairableActivityIssues.has(code)) return false
    return !(eventId && correctionMap.has(eventId) && repairableSessionIssues.has(code))
  })
}
