'use strict'

const crypto = require('node:crypto')

const WARSAW_TIME_ZONE = 'Europe/Warsaw'
const MAX_SESSION_SECONDS = 24 * 60 * 60

const WORKDAY_INTEGRITY_STATE = Object.freeze({
  COMPLETE: 'COMPLETE',
  OPEN_SESSION: 'OPEN_SESSION',
  INCONSISTENT: 'INCONSISTENT',
  INVALID: 'INVALID',
})

const ISSUE_MESSAGE = Object.freeze({
  CLOSED_WORKDAY_WITH_OPEN_SESSION: 'Dzien jest oznaczony jako zamkniety, ale co najmniej jedna sesja nie ma STOP.',
  DUPLICATE_EVENT_ID: 'Wykryto zduplikowany identyfikator sesji.',
  EMPTY_SESSION_SET: 'Dzien nie ma zadnej poprawnej sesji START/STOP.',
  EVENT_ID_MISSING: 'Sesja nie ma identyfikatora.',
  OPEN_SESSION: 'Sesja nie ma zdarzenia STOP.',
  SESSION_BUSINESS_DATE_MISMATCH: 'START sesji przypada na inny dzien biznesowy.',
  SESSION_DURATION_EXCEEDED: 'Sesja przekracza maksymalnie 24 godziny.',
  SESSION_END_BEFORE_START: 'STOP sesji musi byc pozniejszy niz START.',
  SESSION_FUTURE_TIMESTAMP: 'Sesja zawiera czas z przyszlosci.',
  SESSION_OVERLAP: 'Sesja naklada sie na inna sesje tego dnia.',
  SESSION_START_MISSING: 'Sesja nie ma poprawnego czasu START.',
  SESSION_WORKER_MISMATCH: 'Sesja jest przypisana do innego pracownika niz Workday.',
  WORKDAY_DURATION_MISMATCH: 'Zapisana suma dnia nie zgadza sie z suma zamknietych sesji.',
  WORKDAY_END_BEFORE_START: 'Koniec dnia musi byc pozniejszy niz poczatek dnia.',
  WORKDAY_ENVELOPE_EXCEEDED: 'Przedzial dnia przekracza maksymalnie 24 godziny.',
  WORKDAY_FUTURE_TIMESTAMP: 'Dzien zawiera czas z przyszlosci.',
  WORKDAY_NOT_CLOSED: 'Wszystkie sesje sa zamkniete, ale dzien nadal wymaga finalizacji.',
  WORKDAY_START_MISSING: 'Dzien pracy nie ma poprawnego czasu rozpoczecia.',
})

class WorkdayReconciliationError extends Error {
  constructor(statusCode, code, message, details) {
    super(message)
    this.name = 'WorkdayReconciliationError'
    this.statusCode = statusCode
    this.code = code
    this.publicCode = code
    this.publicMessage = message
    this.details = details
  }
}

function text(value, maxLength = 4000) {
  return String(value ?? '').trim().slice(0, maxLength)
}

function identifier(value, field, maxLength = 128) {
  const normalized = text(value, maxLength + 1)
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new WorkdayReconciliationError(
      400,
      'WORKDAY_RECONCILIATION_VALIDATION_ERROR',
      `Niepoprawne pole: ${field}.`,
      { field },
    )
  }
  return normalized
}

function normalizeBusinessDateYmd(value, { required = false } = {}) {
  const normalized = text(value)
  if (!normalized && !required) return ''
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    throw new WorkdayReconciliationError(
      400,
      'WORKDAY_BUSINESS_DATE_INVALID',
      'Dzien biznesowy musi miec format RRRR-MM-DD.',
    )
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[3])
  ) {
    throw new WorkdayReconciliationError(
      400,
      'WORKDAY_BUSINESS_DATE_INVALID',
      'Dzien biznesowy nie jest poprawna data kalendarzowa.',
    )
  }
  return normalized
}

function dateValue(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

function requireApiTimestamp(value, field) {
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value.trim())) {
    throw new WorkdayReconciliationError(
      400,
      'WORKDAY_TIMESTAMP_INVALID',
      `Pole ${field} musi byc czasem ISO 8601 ze strefa czasowa.`,
      { field },
    )
  }
  const parsed = dateValue(value)
  if (!parsed) {
    throw new WorkdayReconciliationError(
      400,
      'WORKDAY_TIMESTAMP_INVALID',
      `Pole ${field} zawiera niepoprawny czas.`,
      { field },
    )
  }
  return parsed.toISOString()
}

function iso(value) {
  return dateValue(value)?.toISOString() || null
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
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${byType.year}-${byType.month}-${byType.day}`
}

function secondsBetween(startValue, endValue) {
  const start = dateValue(startValue)?.getTime()
  const end = dateValue(endValue)?.getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0
  return Math.floor((end - start) / 1000)
}

function issue(code, details = {}) {
  return {
    code,
    message: ISSUE_MESSAGE[code] || 'Dane dnia pracy wymagaja korekty.',
    ...details,
  }
}

function workdayFromRow(row = {}) {
  return {
    workdayId: text(row.workday_id ?? row.workdayId, 64),
    workerLogin: text(row.worker_login ?? row.workerLogin, 80),
    workerName: text(row.worker_name ?? row.workerName, 300),
    startAt: iso(row.start_at ?? row.startAt),
    endAt: iso(row.end_at ?? row.endAt),
    durationSec: Number.isFinite(Number(row.duration_sec ?? row.durationSec))
      ? Math.max(0, Math.trunc(Number(row.duration_sec ?? row.durationSec)))
      : 0,
    status: text(row.status, 40).toUpperCase(),
    comment: text(row.comment),
    updatedAt: iso(row.updated_at ?? row.updatedAt),
    updatedBy: text(row.updated_by ?? row.updatedBy, 128),
    businessDateYmd: text(row.business_date_ymd ?? row.businessDateYmd, 10),
  }
}

function sessionFromRow(row = {}, index = 0) {
  return {
    eventId: text(row.event_id ?? row.eventId, 64),
    sessionNumber: index + 1,
    workdayId: text(row.workday_id ?? row.workdayId, 64),
    workerLogin: text(row.worker_login ?? row.workerLogin, 80),
    workerName: text(row.worker_name ?? row.workerName, 300),
    zoneId: text(row.zone_id ?? row.zoneId, 64),
    startAt: iso(row.start_at ?? row.startAt),
    endAt: iso(row.end_at ?? row.endAt),
    durationSec: 0,
    status: text(row.status, 40).toUpperCase(),
    comment: text(row.comment),
    endReason: text(row.end_reason ?? row.endReason, 500),
    updatedAt: iso(row.updated_at ?? row.updatedAt),
    isOpen: false,
    isValid: true,
    issues: [],
  }
}

function mergedDurationSeconds(intervals) {
  const sorted = intervals
    .filter((entry) => Number.isFinite(entry.startMs) && Number.isFinite(entry.endMs) && entry.endMs > entry.startMs)
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs)
  let totalMs = 0
  let cursorStart = null
  let cursorEnd = null
  for (const interval of sorted) {
    if (cursorStart === null) {
      cursorStart = interval.startMs
      cursorEnd = interval.endMs
      continue
    }
    if (interval.startMs <= cursorEnd) {
      cursorEnd = Math.max(cursorEnd, interval.endMs)
      continue
    }
    totalMs += cursorEnd - cursorStart
    cursorStart = interval.startMs
    cursorEnd = interval.endMs
  }
  if (cursorStart !== null) totalMs += cursorEnd - cursorStart
  return Math.floor(totalMs / 1000)
}

function latestCorrectionFromRow(row = null) {
  if (!row) return null
  return {
    auditId: text(row.audit_id ?? row.auditId, 64),
    actorUid: text(row.actor_uid ?? row.actorUid, 128),
    reason: text(row.reason, 1000),
    action: text(row.action, 32),
    createdAt: iso(row.created_at ?? row.createdAt),
  }
}

function reconciliationSessionVersion(sessions = []) {
  const snapshot = (Array.isArray(sessions) ? sessions : [])
    .map((session) => ({
      comment: text(session?.comment),
      endAt: iso(session?.endAt ?? session?.end_at),
      endReason: text(session?.endReason ?? session?.end_reason, 500),
      eventId: text(session?.eventId ?? session?.event_id, 64),
      startAt: iso(session?.startAt ?? session?.start_at),
      status: text(session?.status, 40).toUpperCase(),
      updatedAt: iso(session?.updatedAt ?? session?.updated_at),
      workerLogin: text(session?.workerLogin ?? session?.worker_login, 80),
      zoneId: text(session?.zoneId ?? session?.zone_id, 64),
    }))
    .sort((left, right) => left.eventId.localeCompare(right.eventId) || left.startAt.localeCompare(right.startAt))

  return crypto.createHash('sha256').update(canonicalJson(snapshot)).digest('hex')
}

/**
 * Builds the canonical, report-safe view of a workday. Open intervals never
 * contribute to confirmed or provisional totals.
 */
function buildWorkdayReconciliation({
  workday: workdayInput = {},
  sessions: sessionRows = [],
  businessDateWorkdayIds: relatedWorkdayIds = [],
  now = new Date(),
  latestCorrection = null,
  schemaReady = true,
} = {}) {
  const nowDate = dateValue(now) || new Date()
  const nowMs = nowDate.getTime()
  const workday = workdayFromRow(workdayInput)
  const workdayBusinessDateMissing = !workday.businessDateYmd && !workday.startAt
  const businessDateYmd = normalizeBusinessDateYmd(
    workday.businessDateYmd || warsawBusinessDateYmd(workday.startAt) || warsawBusinessDateYmd(nowDate),
    { required: true },
  )
  workday.businessDateYmd = businessDateYmd

  const sortedRows = [...(Array.isArray(sessionRows) ? sessionRows : [])].sort((left, right) => {
    const leftStart = dateValue(left?.start_at ?? left?.startAt)?.getTime() ?? Number.MAX_SAFE_INTEGER
    const rightStart = dateValue(right?.start_at ?? right?.startAt)?.getTime() ?? Number.MAX_SAFE_INTEGER
    if (leftStart !== rightStart) return leftStart - rightStart
    return text(left?.event_id ?? left?.eventId).localeCompare(text(right?.event_id ?? right?.eventId))
  })
  const sessions = sortedRows.map(sessionFromRow)
  const issues = []
  const businessDateWorkdayIds = [...new Set([
    workday.workdayId,
    ...(Array.isArray(relatedWorkdayIds) ? relatedWorkdayIds : []),
  ].map((value) => text(value, 64)).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
  const seenEventIds = new Map()
  const completeIntervals = []

  for (const session of sessions) {
    const sessionIssues = []
    if (!session.eventId) {
      sessionIssues.push(issue('EVENT_ID_MISSING', { sessionNumber: session.sessionNumber }))
    } else if (seenEventIds.has(session.eventId)) {
      const duplicate = issue('DUPLICATE_EVENT_ID', {
        eventId: session.eventId,
        sessionNumber: session.sessionNumber,
        duplicateOfSessionNumber: seenEventIds.get(session.eventId),
      })
      sessionIssues.push(duplicate)
    } else {
      seenEventIds.set(session.eventId, session.sessionNumber)
    }

    if (
      workday.workerLogin &&
      session.workerLogin &&
      workday.workerLogin !== session.workerLogin
    ) {
      sessionIssues.push(issue('SESSION_WORKER_MISMATCH', {
        eventId: session.eventId,
        sessionNumber: session.sessionNumber,
        expectedWorkerLogin: workday.workerLogin,
        actualWorkerLogin: session.workerLogin,
      }))
    }

    const start = dateValue(session.startAt)
    const end = dateValue(session.endAt)
    if (!start) {
      sessionIssues.push(issue('SESSION_START_MISSING', {
        eventId: session.eventId,
        sessionNumber: session.sessionNumber,
      }))
    } else if (start.getTime() > nowMs) {
      sessionIssues.push(issue('SESSION_FUTURE_TIMESTAMP', {
        eventId: session.eventId,
        sessionNumber: session.sessionNumber,
      }))
    }

    if (start && warsawBusinessDateYmd(start) !== businessDateYmd) {
      sessionIssues.push(issue('SESSION_BUSINESS_DATE_MISMATCH', {
        eventId: session.eventId,
        sessionNumber: session.sessionNumber,
        expectedBusinessDateYmd: businessDateYmd,
        actualBusinessDateYmd: warsawBusinessDateYmd(start),
      }))
    }

    session.isOpen = Boolean(start && !end)
    if (session.isOpen) {
      sessionIssues.push(issue('OPEN_SESSION', {
        eventId: session.eventId,
        sessionNumber: session.sessionNumber,
      }))
    }

    if (end) {
      if (end.getTime() > nowMs) {
        sessionIssues.push(issue('SESSION_FUTURE_TIMESTAMP', {
          eventId: session.eventId,
          sessionNumber: session.sessionNumber,
        }))
      }
      if (!start || end.getTime() <= start.getTime()) {
        sessionIssues.push(issue('SESSION_END_BEFORE_START', {
          eventId: session.eventId,
          sessionNumber: session.sessionNumber,
        }))
      } else {
        session.durationSec = secondsBetween(start, end)
        if (session.durationSec > MAX_SESSION_SECONDS) {
          sessionIssues.push(issue('SESSION_DURATION_EXCEEDED', {
            eventId: session.eventId,
            sessionNumber: session.sessionNumber,
            durationSec: session.durationSec,
          }))
        }
      }
    }

    session.issues = sessionIssues
    session.isValid = sessionIssues.every((entry) => entry.code === 'OPEN_SESSION')
    issues.push(...sessionIssues)
    if (start && end && session.isValid) {
      completeIntervals.push({
        eventId: session.eventId,
        sessionNumber: session.sessionNumber,
        startMs: start.getTime(),
        endMs: end.getTime(),
      })
    }
  }

  const intervalsByStart = [...completeIntervals].sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs)
  let furthest = null
  for (const interval of intervalsByStart) {
    if (furthest && interval.startMs < furthest.endMs) {
      const overlapIssue = issue('SESSION_OVERLAP', {
        eventId: interval.eventId,
        sessionNumber: interval.sessionNumber,
        overlapsEventId: furthest.eventId,
        overlapsSessionNumber: furthest.sessionNumber,
      })
      issues.push(overlapIssue)
      const session = sessions.find((entry) => entry.eventId === interval.eventId && entry.sessionNumber === interval.sessionNumber)
      if (session) {
        session.issues.push(overlapIssue)
        session.isValid = false
      }
    }
    if (!furthest || interval.endMs > furthest.endMs) furthest = interval
  }

  const closedSessionsSec = mergedDurationSeconds(completeIntervals)
  const openSessions = sessions.filter((session) => session.isOpen)
  const todayYmd = warsawBusinessDateYmd(nowDate)
  const activeElapsedSec = businessDateYmd === todayYmd
    ? openSessions.reduce((sum, session) => {
        const startMs = dateValue(session.startAt)?.getTime()
        if (!Number.isFinite(startMs) || startMs > nowMs) return sum
        return sum + Math.min(MAX_SESSION_SECONDS, Math.floor((nowMs - startMs) / 1000))
      }, 0)
    : 0

  const workdayStart = dateValue(workday.startAt)
  const workdayEnd = dateValue(workday.endAt)
  const workdayEnvelopeSec = workdayStart && workdayEnd ? secondsBetween(workdayStart, workdayEnd) : 0
  let workdayInvalid = false
  if (workdayBusinessDateMissing || !workdayStart) {
    issues.push(issue('WORKDAY_START_MISSING'))
    workdayInvalid = true
  }
  if (workdayStart && workdayStart.getTime() > nowMs || workdayEnd && workdayEnd.getTime() > nowMs) {
    issues.push(issue('WORKDAY_FUTURE_TIMESTAMP'))
    workdayInvalid = true
  }
  if (workdayStart && workdayEnd && workdayEnd.getTime() <= workdayStart.getTime()) {
    issues.push(issue('WORKDAY_END_BEFORE_START'))
    workdayInvalid = true
  }
  if (workdayEnvelopeSec > MAX_SESSION_SECONDS) {
    issues.push(issue('WORKDAY_ENVELOPE_EXCEEDED', { durationSec: workdayEnvelopeSec }))
    workdayInvalid = true
  }
  const workdayClosed = workday.status === 'CLOSED' || Boolean(workday.endAt)
  const invalidSessionIssue = issues.some((entry) => ![
    'OPEN_SESSION',
    'CLOSED_WORKDAY_WITH_OPEN_SESSION',
    'WORKDAY_DURATION_MISMATCH',
    'WORKDAY_NOT_CLOSED',
  ].includes(entry.code))
  if (workdayClosed && openSessions.length) {
    issues.push(issue('CLOSED_WORKDAY_WITH_OPEN_SESSION', {
      openEventIds: openSessions.map((session) => session.eventId).filter(Boolean),
    }))
  }
  if (!openSessions.length && sessions.length && !workdayClosed) {
    issues.push(issue('WORKDAY_NOT_CLOSED'))
  }
  const discrepancySec = workday.durationSec - closedSessionsSec
  if (workdayClosed && discrepancySec !== 0) {
    issues.push(issue('WORKDAY_DURATION_MISMATCH', {
      storedDurationSec: workday.durationSec,
      confirmedDurationSec: closedSessionsSec,
      discrepancySec,
    }))
  }
  if (!sessions.length) issues.push(issue('EMPTY_SESSION_SET'))
  const hasInvalid = workdayInvalid || invalidSessionIssue || !sessions.length
  let integrityState = WORKDAY_INTEGRITY_STATE.COMPLETE
  if (hasInvalid) {
    integrityState = WORKDAY_INTEGRITY_STATE.INVALID
  } else if (workdayClosed && openSessions.length) {
    integrityState = WORKDAY_INTEGRITY_STATE.INCONSISTENT
  } else if (openSessions.length) {
    integrityState = WORKDAY_INTEGRITY_STATE.OPEN_SESSION
  } else if (issues.some((entry) => ['WORKDAY_DURATION_MISMATCH', 'WORKDAY_NOT_CLOSED'].includes(entry.code))) {
    integrityState = WORKDAY_INTEGRITY_STATE.INCONSISTENT
  }

  const reconciliation = {
    orgId: text(workdayInput.org_id ?? workdayInput.orgId, 64),
    workdayId: workday.workdayId,
    businessDateYmd,
    businessDateWorkdayIds,
    // The version covers the Workday and every session. A legacy Event edit no
    // longer updates the Workday envelope, so checking only Workday.updatedAt
    // would allow a stale reconciliation draft to overwrite that Event.
    version: [workday.updatedAt, ...sessions.map((session) => session.updatedAt)]
      .map((value) => dateValue(value))
      .filter(Boolean)
      .sort((left, right) => right.getTime() - left.getTime())[0]
      ?.toISOString() || workday.updatedAt,
    sessionVersion: reconciliationSessionVersion(sessions),
    integrityState,
    canFinalize: !hasInvalid && openSessions.length === 0 && completeIntervals.length > 0,
    closedSessionsSec,
    confirmedSec: integrityState === WORKDAY_INTEGRITY_STATE.COMPLETE ? closedSessionsSec : 0,
    provisionalSec: integrityState === WORKDAY_INTEGRITY_STATE.COMPLETE ? 0 : closedSessionsSec,
    activeElapsedSec,
    workdayEnvelopeSec,
    discrepancySec,
    openSessions,
    issues,
    problems: issues,
    workday,
    sessions,
    latestCorrection: latestCorrectionFromRow(latestCorrection),
    schemaReady: Boolean(schemaReady),
  }
  return reconciliation
}

function normalizeSessionCorrection(value, index) {
  const source = value && typeof value === 'object' ? value : {}
  const eventId = identifier(source.eventId ?? source.event_id, `sessionCorrections[${index}].eventId`, 64)
  const hasStartAt = Object.prototype.hasOwnProperty.call(source, 'startAt') || Object.prototype.hasOwnProperty.call(source, 'start_at')
  const hasEndAt = Object.prototype.hasOwnProperty.call(source, 'endAt') || Object.prototype.hasOwnProperty.call(source, 'end_at')
  const hasComment = Object.prototype.hasOwnProperty.call(source, 'comment')
  const hasEndReason = Object.prototype.hasOwnProperty.call(source, 'endReason') || Object.prototype.hasOwnProperty.call(source, 'end_reason')
  if (!hasStartAt && !hasEndAt && !hasComment && !hasEndReason) {
    throw new WorkdayReconciliationError(
      400,
      'WORKDAY_SESSION_CORRECTION_EMPTY',
      `Korekta sesji ${eventId} nie zawiera zadnej zmiany.`,
    )
  }
  return {
    eventId,
    ...(hasStartAt ? { startAt: requireApiTimestamp(source.startAt ?? source.start_at, `sessionCorrections[${index}].startAt`) } : {}),
    ...(hasEndAt ? { endAt: requireApiTimestamp(source.endAt ?? source.end_at, `sessionCorrections[${index}].endAt`) } : {}),
    ...(hasComment ? { comment: text(source.comment, 2000) } : {}),
    ...(hasEndReason ? { endReason: text(source.endReason ?? source.end_reason, 500) } : {}),
  }
}

function normalizeReconciliationInput(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const expectedUpdatedAt = requireApiTimestamp(source.expectedUpdatedAt, 'expectedUpdatedAt')
  const expectedSessionVersion = text(source.expectedSessionVersion, 65).toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(expectedSessionVersion)) {
    throw new WorkdayReconciliationError(
      400,
      'WORKDAY_SESSION_VERSION_INVALID',
      'Brak poprawnej wersji zestawu sesji. Odswiez dzien i ponow korekte.',
    )
  }
  const idempotencyKey = identifier(source.idempotencyKey, 'idempotencyKey', 128)
  if (idempotencyKey.length < 8 || !/^[a-z0-9._:-]+$/i.test(idempotencyKey)) {
    throw new WorkdayReconciliationError(
      400,
      'WORKDAY_IDEMPOTENCY_KEY_INVALID',
      'idempotencyKey musi miec od 8 do 128 bezpiecznych znakow.',
    )
  }
  const reason = text(source.reason, 1001)
  if (reason.length < 3 || reason.length > 1000) {
    throw new WorkdayReconciliationError(
      400,
      'WORKDAY_CORRECTION_REASON_REQUIRED',
      'Podaj powod korekty (od 3 do 1000 znakow).',
    )
  }
  const rawCorrections = Array.isArray(source.sessionCorrections) ? source.sessionCorrections : []
  if (rawCorrections.length > 100) {
    throw new WorkdayReconciliationError(
      400,
      'WORKDAY_TOO_MANY_SESSION_CORRECTIONS',
      'Jedno zadanie moze poprawic maksymalnie 100 sesji.',
    )
  }
  const sessionCorrections = rawCorrections.map(normalizeSessionCorrection)
  const duplicateIds = sessionCorrections
    .map((entry) => entry.eventId)
    .filter((eventId, index, all) => all.indexOf(eventId) !== index)
  if (duplicateIds.length) {
    throw new WorkdayReconciliationError(
      400,
      'WORKDAY_DUPLICATE_SESSION_CORRECTION',
      'Ta sama sesja wystepuje w zadaniu korekty wiecej niz raz.',
      { eventIds: [...new Set(duplicateIds)] },
    )
  }
  const hasWorkdayEndAt = Object.prototype.hasOwnProperty.call(source, 'workdayEndAt')
  const hasBusinessDate = Object.prototype.hasOwnProperty.call(source, 'businessDateYmd')
  const finalize = source.finalize === true
  if (hasWorkdayEndAt && !finalize) {
    throw new WorkdayReconciliationError(
      400,
      'WORKDAY_END_REQUIRES_FINALIZE',
      'Koniec Workday mozna zapisac tylko podczas finalizacji dnia.',
    )
  }
  if (!sessionCorrections.length && !hasWorkdayEndAt && !hasBusinessDate && !finalize) {
    throw new WorkdayReconciliationError(
      400,
      'WORKDAY_RECONCILIATION_EMPTY',
      'Zadanie nie zawiera korekty ani polecenia zamkniecia dnia.',
    )
  }
  return {
    expectedUpdatedAt,
    expectedSessionVersion,
    sessionCorrections,
    ...(hasWorkdayEndAt ? { workdayEndAt: requireApiTimestamp(source.workdayEndAt, 'workdayEndAt') } : {}),
    ...(hasBusinessDate ? { businessDateYmd: normalizeBusinessDateYmd(source.businessDateYmd, { required: true }) } : {}),
    reason,
    idempotencyKey,
    finalize,
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function reconciliationRequestHash({ orgId, workdayId, input }) {
  return crypto
    .createHash('sha256')
    .update(canonicalJson({ orgId: text(orgId, 64), workdayId: text(workdayId, 64), input }))
    .digest('hex')
}

module.exports = {
  ISSUE_MESSAGE,
  MAX_SESSION_SECONDS,
  WARSAW_TIME_ZONE,
  WORKDAY_INTEGRITY_STATE,
  WorkdayReconciliationError,
  buildWorkdayReconciliation,
  canonicalJson,
  identifier,
  normalizeBusinessDateYmd,
  normalizeReconciliationInput,
  reconciliationRequestHash,
  reconciliationSessionVersion,
  secondsBetween,
  sessionFromRow,
  warsawBusinessDateYmd,
  workdayFromRow,
}
