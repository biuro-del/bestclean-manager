'use strict'

const crypto = require('node:crypto')

const WARSAW_TIME_ZONE = 'Europe/Warsaw'
const MAX_SESSION_SECONDS = 24 * 60 * 60
const MILLISECONDS_PER_MINUTE = 60 * 1000
const BUSINESS_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const WORK_TIME_DAY_STATE = Object.freeze({
  COMPLETE: 'COMPLETE',
  OPEN_SESSION: 'OPEN_SESSION',
  INCONSISTENT: 'INCONSISTENT',
  INVALID: 'INVALID',
})

const ISSUE_MESSAGE = Object.freeze({
  ACTIVITY_END_BEFORE_START: 'Koniec zdarzenia musi być późniejszy niż jego początek.',
  ACTIVITY_FUTURE_TIMESTAMP: 'Zdarzenie ma godzinę w przyszłości.',
  ACTIVITY_OUTSIDE_SESSION: 'Zdarzenie klienta lub strefy znajduje się poza przypisaną sesją pracy.',
  ACTIVITY_START_MISSING: 'Zdarzenie nie ma godziny rozpoczęcia.',
  ACTIVITY_WORKER_MISMATCH: 'Zdarzenie jest przypisane do innego pracownika niż sesja pracy.',
  CLOSED_SESSION_WITH_OPEN_ACTIVITY: 'Zamknięta sesja zawiera zdarzenie bez zakończenia.',
  DUPLICATE_EVENT_ID: 'Wykryto powtórzony identyfikator zdarzenia.',
  DUPLICATE_WORKDAY_ID: 'Wykryto powtórzony identyfikator sesji pracy.',
  OPEN_ACTIVITY: 'Zdarzenie nie ma zakończenia.',
  OPEN_SESSION: 'Brak STOP dla sesji pracy.',
  OVERLAPPING_WORK_SESSIONS: 'Sesje pracy nakładają się na siebie.',
  SESSION_BUSINESS_DATE_MISMATCH: 'Sesja jest przypisana do nieprawidłowej daty biznesowej.',
  SESSION_END_BEFORE_START: 'STOP sesji musi być późniejszy niż START.',
  SESSION_FUTURE_TIMESTAMP: 'Sesja ma godzinę w przyszłości.',
  SESSION_OVER_24_HOURS: 'Sesja nie może trwać dłużej niż 24 godziny.',
  SESSION_START_MISSING: 'Sesja nie ma godziny START.',
  UNASSIGNED_ACTIVITY: 'Zdarzenie nie jest przypisane do istniejącej sesji pracy.',
})

class WorkTimeDayError extends Error {
  constructor(statusCode, code, message, details) {
    super(message)
    this.name = 'WorkTimeDayError'
    this.statusCode = Number(statusCode) || 500
    this.code = String(code || 'WORK_TIME_DAY_ERROR')
    this.details = details
  }
}

function text(value, maxLength = 4000) {
  return String(value ?? '').trim().slice(0, maxLength)
}

function dateValue(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value
  const parsed = new Date(value ?? '')
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

function iso(value) {
  return dateValue(value)?.toISOString() || null
}

function timestamp(value) {
  return dateValue(value)?.getTime() || 0
}

function minuteTimestamp(value) {
  const valueMs = timestamp(value)
  return valueMs ? Math.floor(valueMs / MILLISECONDS_PER_MINUTE) * MILLISECONDS_PER_MINUTE : 0
}

function secondsBetween(startValue, endValue) {
  const startMs = timestamp(startValue)
  const endMs = timestamp(endValue)
  if (!startMs || !endMs || endMs <= startMs) return 0
  return Math.floor((endMs - startMs) / 1000)
}

function warsawBusinessDateYmd(value) {
  const date = dateValue(value)
  if (!date) return ''
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    timeZone: WARSAW_TIME_ZONE,
    year: 'numeric',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function issue(code, details = {}) {
  return { code, message: ISSUE_MESSAGE[code] || 'Dane czasu pracy wymagają sprawdzenia.', ...details }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function workTimeDayVersion(workdays = [], events = []) {
  const snapshot = {
    events: events.map((row) => ({
      comment: text(row.comment),
      endAt: iso(row.end_at ?? row.endAt),
      eventId: text(row.event_id ?? row.eventId, 64),
      startAt: iso(row.start_at ?? row.startAt),
      status: text(row.status, 40),
      updatedAt: iso(row.updated_at ?? row.updatedAt),
      workdayId: text(row.workday_id ?? row.workdayId, 64),
      zoneId: text(row.zone_id ?? row.zoneId, 64),
    })).sort((left, right) => left.eventId.localeCompare(right.eventId)),
    workdays: workdays.map((row) => ({
      endAt: iso(row.end_at ?? row.endAt),
      startAt: iso(row.start_at ?? row.startAt),
      status: text(row.status, 40),
      updatedAt: iso(row.updated_at ?? row.updatedAt),
      utilityRoomId: text(row.utility_room_id ?? row.utilityRoomId, 64),
      workdayId: text(row.workday_id ?? row.workdayId, 64),
    })).sort((left, right) => left.workdayId.localeCompare(right.workdayId)),
  }
  return crypto.createHash('sha256').update(canonicalJson(snapshot)).digest('hex')
}

function activityFromRow(row = {}) {
  return {
    clientId: text(row.client_id ?? row.clientId, 64),
    clientName: text(row.client_name ?? row.clientName, 300),
    comment: text(row.comment, 2000),
    durationSec: secondsBetween(row.start_at ?? row.startAt, row.end_at ?? row.endAt),
    endAt: iso(row.end_at ?? row.endAt),
    endReason: text(row.end_reason ?? row.endReason, 500),
    eventId: text(row.event_id ?? row.eventId, 64),
    eventType: text(row.event_type ?? row.eventType, 32).toUpperCase() || 'CLEAN',
    gps: text(row.gps ?? row.comment, 4000),
    isOpen: Boolean(iso(row.start_at ?? row.startAt) && !iso(row.end_at ?? row.endAt)),
    location: text(row.location, 500),
    startAt: iso(row.start_at ?? row.startAt),
    status: text(row.status, 40).toUpperCase(),
    workdayId: text(row.workday_id ?? row.workdayId, 64),
    workerLogin: text(row.worker_login ?? row.workerLogin, 80),
    workerName: text(row.worker_name ?? row.workerName, 300),
    zoneId: text(row.zone_id ?? row.zoneId, 64),
    zoneName: text(row.zone_name ?? row.zoneName, 300),
  }
}

function sessionFromRow(row = {}) {
  const startAt = iso(row.start_at ?? row.startAt)
  const endAt = iso(row.end_at ?? row.endAt)
  const zoneId = text(row.zone_id ?? row.zoneId ?? row.utility_room_id ?? row.utilityRoomId, 64)
  return {
    activities: [],
    clientId: text(row.client_id ?? row.clientId, 64),
    clientName: text(row.client_name ?? row.clientName, 300),
    comment: text(row.comment, 2000),
    durationSec: secondsBetween(startAt, endAt),
    endAt,
    gps: text(row.gps, 1000),
    isOpen: Boolean(startAt && !endAt),
    pauseSec: Math.max(0, Math.floor(Number(row.pause_total_sec ?? row.pauseTotalSec ?? 0) || 0)),
    startAt,
    startObject: text(row.start_object ?? row.startObject, 300),
    status: text(row.status, 40).toUpperCase(),
    stopObject: text(row.stop_object ?? row.stopObject, 300),
    location: text(row.zone_location ?? row.location, 500),
    utilityRoomId: zoneId,
    updatedAt: iso(row.updated_at ?? row.updatedAt),
    updatedBy: text(row.updated_by ?? row.updatedBy, 128),
    workdayId: text(row.workday_id ?? row.workdayId, 64),
    workerLogin: text(row.worker_login ?? row.workerLogin, 80),
    workerName: text(row.worker_name ?? row.workerName, 300),
    zoneId,
    zoneName: text(row.zone_name ?? row.zoneName, 300),
  }
}

function exactSessionKey(session = {}) {
  const startMs = timestamp(session.startAt)
  const endMs = timestamp(session.endAt)
  if (!startMs || (endMs && endMs <= startMs)) return ''
  return `${text(session.workerLogin, 80).toLowerCase()}|${startMs}|${endMs || 'OPEN'}`
}

function sessionStartKey(session = {}) {
  const startMs = timestamp(session.startAt)
  if (!startMs) return ''
  return `${text(session.workerLogin, 80).toLowerCase()}|${Math.floor(startMs / MILLISECONDS_PER_MINUTE)}`
}

function collapseExactDuplicateSessions(sourceSessions = []) {
  const groups = new Map()
  const sessions = []
  ;(Array.isArray(sourceSessions) ? sourceSessions : [])
    .slice()
    .sort((left, right) => (
      timestamp(left.startAt) - timestamp(right.startAt) ||
      timestamp(left.endAt) - timestamp(right.endAt) ||
      left.workdayId.localeCompare(right.workdayId)
    ))
    .forEach((source) => {
      const key = exactSessionKey(source)
      const sourceWorkdayIds = [
        ...(Array.isArray(source.sourceWorkdayIds) ? source.sourceWorkdayIds : []),
        source.workdayId,
      ].map((value) => text(value, 64)).filter(Boolean)
      const existing = key ? groups.get(key) : null
      if (!existing) {
        const session = {
          ...source,
          sourceWorkdayIds: [...new Set(sourceWorkdayIds)].sort(),
        }
        session.collapsedDuplicateCount = session.sourceWorkdayIds.length
        sessions.push(session)
        if (key) groups.set(key, session)
        return
      }

      existing.sourceWorkdayIds = [...new Set([...existing.sourceWorkdayIds, ...sourceWorkdayIds])].sort()
      existing.collapsedDuplicateCount = existing.sourceWorkdayIds.length
      existing.pauseSec = Math.max(existing.pauseSec, source.pauseSec)
    })
  const closedByStart = new Map()
  sessions.forEach((session) => {
    if (session.isOpen || session.isValid === false) return
    const key = sessionStartKey(session)
    if (!key) return
    const matches = closedByStart.get(key) ?? []
    matches.push(session)
    closedByStart.set(key, matches)
  })

  const supersededOpenSessions = new Set()
  sessions.forEach((session) => {
    if (!session.isOpen || session.isValid === false) return
    const matches = closedByStart.get(sessionStartKey(session)) ?? []
    if (matches.length !== 1) return
    const target = matches[0]
    const sourceIds = Array.isArray(session.sourceWorkdayIds) ? session.sourceWorkdayIds : []
    target.sourceWorkdayIds = [...new Set([...target.sourceWorkdayIds, ...sourceIds])].sort()
    target.supersededOpenWorkdayIds = [...new Set([
      ...(Array.isArray(target.supersededOpenWorkdayIds) ? target.supersededOpenWorkdayIds : []),
      ...sourceIds,
    ])].sort()
    target.collapsedDuplicateCount = target.sourceWorkdayIds.length
    target.pauseSec = Math.max(target.pauseSec, session.pauseSec)
    supersededOpenSessions.add(session)
  })

  return sessions.filter((session) => !supersededOpenSessions.has(session))
}

function mergedDurationSeconds(sessions = []) {
  const ranges = sessions
    .map((session) => ({ startMs: timestamp(session.startAt), endMs: timestamp(session.endAt) }))
    .filter((range) => range.startMs && range.endMs > range.startMs)
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs)
  let totalMs = 0
  let current = null
  ranges.forEach((range) => {
    if (!current) {
      current = { ...range }
      return
    }
    if (range.startMs < current.endMs) {
      current.endMs = Math.max(current.endMs, range.endMs)
      return
    }
    totalMs += current.endMs - current.startMs
    current = { ...range }
  })
  if (current) totalMs += current.endMs - current.startMs
  return Math.floor(totalMs / 1000)
}

function buildWorkTimeDay({ workdays = [], events = [], businessDateYmd, now = new Date(), orgId = '', workerLogin = '' } = {}) {
  const dayKey = text(businessDateYmd, 10)
  if (!BUSINESS_DATE_RE.test(dayKey)) {
    throw new WorkTimeDayError(400, 'BUSINESS_DATE_INVALID', 'Data biznesowa musi mieć format YYYY-MM-DD.')
  }
  const nowMs = timestamp(now) || Date.now()
  const issues = []
  const seenWorkdays = new Set()
  const seenEvents = new Set()
  const sourceSessions = []

  ;(Array.isArray(workdays) ? workdays : []).forEach((row) => {
    const session = sessionFromRow(row)
    if (!session.workdayId || seenWorkdays.has(session.workdayId)) {
      issues.push(issue('DUPLICATE_WORKDAY_ID', { workdayId: session.workdayId }))
      return
    }
    seenWorkdays.add(session.workdayId)
    const sessionIssues = []
    const startMs = timestamp(session.startAt)
    const endMs = timestamp(session.endAt)
    if (!startMs) sessionIssues.push(issue('SESSION_START_MISSING', { workdayId: session.workdayId }))
    if (startMs > nowMs || endMs > nowMs) sessionIssues.push(issue('SESSION_FUTURE_TIMESTAMP', { workdayId: session.workdayId }))
    if (startMs && warsawBusinessDateYmd(session.startAt) !== dayKey) {
      sessionIssues.push(issue('SESSION_BUSINESS_DATE_MISMATCH', { workdayId: session.workdayId }))
    }
    if (startMs && endMs && endMs <= startMs) sessionIssues.push(issue('SESSION_END_BEFORE_START', { workdayId: session.workdayId }))
    if (startMs && endMs && secondsBetween(session.startAt, session.endAt) > MAX_SESSION_SECONDS) {
      sessionIssues.push(issue('SESSION_OVER_24_HOURS', { workdayId: session.workdayId }))
    }
    if (session.isOpen) sessionIssues.push(issue('OPEN_SESSION', { workdayId: session.workdayId }))
    session.issues = sessionIssues
    session.isValid = !sessionIssues.some((entry) => entry.code !== 'OPEN_SESSION')
    sourceSessions.push(session)
  })

  const sessions = collapseExactDuplicateSessions(sourceSessions)
  issues.push(...sessions.flatMap((session) => session.issues))
  sessions.forEach((session, index) => { session.sessionNumber = index + 1 })
  const sessionById = new Map(sessions.flatMap((session) => (
    session.sourceWorkdayIds.map((workdayId) => [workdayId, session])
  )))
  const unassignedActivities = []

  ;(Array.isArray(events) ? events : []).forEach((row) => {
    const activity = activityFromRow(row)
    if (!activity.eventId || seenEvents.has(activity.eventId)) {
      issues.push(issue('DUPLICATE_EVENT_ID', { eventId: activity.eventId }))
      return
    }
    seenEvents.add(activity.eventId)
    const parent = sessionById.get(activity.workdayId)
    if (!parent) {
      activity.issues = [issue('UNASSIGNED_ACTIVITY', { eventId: activity.eventId })]
      unassignedActivities.push(activity)
      issues.push(...activity.issues)
      return
    }
    const activityIssues = []
    const activityStart = timestamp(activity.startAt)
    const activityEnd = timestamp(activity.endAt)
    const sessionStart = timestamp(parent.startAt)
    const sessionEnd = timestamp(parent.endAt)
    const activityStartMinute = minuteTimestamp(activity.startAt)
    const activityEndMinute = minuteTimestamp(activity.endAt)
    const sessionStartMinute = minuteTimestamp(parent.startAt)
    const sessionEndMinute = minuteTimestamp(parent.endAt)
    if (activity.workerLogin && parent.workerLogin && activity.workerLogin.toLowerCase() !== parent.workerLogin.toLowerCase()) {
      activityIssues.push(issue('ACTIVITY_WORKER_MISMATCH', { eventId: activity.eventId, workdayId: parent.workdayId }))
    }
    if (!activityStart) activityIssues.push(issue('ACTIVITY_START_MISSING', { eventId: activity.eventId }))
    if (activityStart > nowMs || activityEnd > nowMs) activityIssues.push(issue('ACTIVITY_FUTURE_TIMESTAMP', { eventId: activity.eventId }))
    if (activityStart && activityEnd && activityEnd <= activityStart) activityIssues.push(issue('ACTIVITY_END_BEFORE_START', { eventId: activity.eventId }))
    if (
      activityStartMinute && sessionStartMinute &&
      (
        activityStartMinute < sessionStartMinute ||
        (sessionEndMinute && (activityStartMinute > sessionEndMinute || activityEndMinute > sessionEndMinute))
      )
    ) {
      activityIssues.push(issue('ACTIVITY_OUTSIDE_SESSION', { eventId: activity.eventId, workdayId: parent.workdayId }))
    }
    if (activity.isOpen) {
      activityIssues.push(issue('OPEN_ACTIVITY', { eventId: activity.eventId }))
      if (!parent.isOpen) activityIssues.push(issue('CLOSED_SESSION_WITH_OPEN_ACTIVITY', { eventId: activity.eventId }))
    }
    activity.issues = activityIssues
    activity.isValid = !activityIssues.some((entry) => !['OPEN_ACTIVITY'].includes(entry.code))
    parent.activities.push(activity)
    issues.push(...activityIssues)
  })

  sessions.forEach((session) => session.activities.sort(
    (left, right) => timestamp(left.startAt) - timestamp(right.startAt) || left.eventId.localeCompare(right.eventId),
  ))

  const closedValidSessions = sessions.filter((session) => session.isValid && !session.isOpen && session.endAt)
  let furthest = null
  closedValidSessions.forEach((session) => {
    const range = { startMs: timestamp(session.startAt), endMs: timestamp(session.endAt), workdayId: session.workdayId }
    if (furthest && range.startMs < furthest.endMs) {
      issues.push(issue('OVERLAPPING_WORK_SESSIONS', { workdayIds: [furthest.workdayId, range.workdayId] }))
    }
    if (!furthest || range.endMs > furthest.endMs) furthest = range
  })

  const openSessions = sessions.filter((session) => session.isOpen)
  const starts = sessions.map((session) => timestamp(session.startAt)).filter(Boolean)
  const stops = sessions.map((session) => timestamp(session.endAt)).filter(Boolean)
  const workedSec = mergedDurationSeconds(closedValidSessions)
  const invalidIssueCodes = new Set([
    'ACTIVITY_END_BEFORE_START', 'ACTIVITY_FUTURE_TIMESTAMP', 'ACTIVITY_OUTSIDE_SESSION',
    'ACTIVITY_START_MISSING', 'ACTIVITY_WORKER_MISMATCH', 'DUPLICATE_EVENT_ID', 'DUPLICATE_WORKDAY_ID',
    'OVERLAPPING_WORK_SESSIONS', 'SESSION_BUSINESS_DATE_MISMATCH', 'SESSION_END_BEFORE_START',
    'SESSION_FUTURE_TIMESTAMP', 'SESSION_OVER_24_HOURS', 'SESSION_START_MISSING', 'UNASSIGNED_ACTIVITY',
  ])
  const hasInvalid = issues.some((entry) => invalidIssueCodes.has(entry.code))
  const hasInconsistent = issues.some((entry) => entry.code === 'CLOSED_SESSION_WITH_OPEN_ACTIVITY')
  const integrityState = hasInvalid
    ? WORK_TIME_DAY_STATE.INVALID
    : hasInconsistent
      ? WORK_TIME_DAY_STATE.INCONSISTENT
      : openSessions.length
        ? WORK_TIME_DAY_STATE.OPEN_SESSION
        : WORK_TIME_DAY_STATE.COMPLETE

  return {
    activities: sessions.flatMap((session) => session.activities),
    businessDateYmd: dayKey,
    canFinalize: sessions.length > 0 && integrityState === WORK_TIME_DAY_STATE.COMPLETE,
    collapsedDuplicateSessionCount: sessions.reduce(
      (sum, session) => sum + Math.max(0, session.sourceWorkdayIds.length - 1),
      0,
    ),
    closedSessionsSec: workedSec,
    confirmedSec: workedSec,
    firstStartAt: starts.length ? new Date(Math.min(...starts)).toISOString() : null,
    integrityState,
    issues,
    lastClosedStopAt: stops.length ? new Date(Math.max(...stops)).toISOString() : null,
    lastStopAt: openSessions.length || !stops.length ? null : new Date(Math.max(...stops)).toISOString(),
    openSessionCount: openSessions.length,
    openSessions,
    orgId: text(orgId, 64),
    pauseSec: sessions.reduce((sum, session) => sum + session.pauseSec, 0),
    provisionalSec: 0,
    realWorkSec: workedSec,
    sessions,
    unassignedActivities,
    version: workTimeDayVersion(workdays, events),
    workedSec,
    workerLogin: text(workerLogin || sessions[0]?.workerLogin, 80),
    workerName: text(sessions[0]?.workerName, 300),
  }
}

module.exports = {
  BUSINESS_DATE_RE,
  ISSUE_MESSAGE,
  MAX_SESSION_SECONDS,
  WARSAW_TIME_ZONE,
  WORK_TIME_DAY_STATE,
  WorkTimeDayError,
  buildWorkTimeDay,
  canonicalJson,
  secondsBetween,
  text,
  warsawBusinessDateYmd,
  workTimeDayVersion,
}
