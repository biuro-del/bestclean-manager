import { summarizeWorkTimeRows } from '../workers/workIntervals.js'

export const SERVICE_OPERATION_STATE = Object.freeze({
  ACTIVE: 'active',
  COMPLETED: 'completed',
})

const CLOSED_OPERATION_STATUSES = new Set([
  'CLOSED',
  'COMPLETED',
  'DONE',
  'FINISHED',
  'STOPPED',
])

function text(value) {
  return String(value ?? '').trim()
}

function upper(value) {
  return text(value).toUpperCase().replace(/[\s-]+/g, '_')
}

function timestamp(value) {
  if (value instanceof Date) {
    const parsed = value.getTime()
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }
  const normalized = text(value)
  if (!normalized) return 0
  const parsed = Date.parse(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function localDateYmd(value) {
  const parsed = timestamp(value)
  if (!(parsed > 0)) return ''
  const date = new Date(parsed)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function cleanEventType(value) {
  const token = upper(value)
  return token === 'CLEAN' || token.startsWith('CLEAN_')
}

function observedEventId(row = {}) {
  return text(row?.eventId ?? row?.event_id ?? row?.id)
}

function observedEventRevisionTimestamp(row = {}) {
  return timestamp(
    row?.updatedAt ??
      row?.updated_at ??
      row?.modifiedAt ??
      row?.modified_at ??
      row?.createdAt ??
      row?.created_at,
  )
}

function observedEventDayYmd(row = {}, startTs = 0) {
  return text(row?.occurrenceDateYmd ?? row?.occurrence_date_ymd) || localDateYmd(startTs)
}

function observedEventState(row = {}, startTs = 0, stopTs = 0) {
  if (!(startTs > 0)) return ''
  const status = upper(row?.status ?? row?.state)
  if (stopTs >= startTs) {
    return SERVICE_OPERATION_STATE.COMPLETED
  }
  if (CLOSED_OPERATION_STATUSES.has(status)) return ''
  return SERVICE_OPERATION_STATE.ACTIVE
}

function observedEventScore(item = {}) {
  return (
    Number(item.operationState === SERVICE_OPERATION_STATE.COMPLETED) * 8 +
    Number(item.stopTs > 0) * 4 +
    Number(item.revisionTs > 0) * 2 +
    Number(item.startTs > 0)
  )
}

function shouldReplaceObservedEvent(current = {}, candidate = {}) {
  if (candidate.revisionTs !== current.revisionTs) {
    return candidate.revisionTs > current.revisionTs
  }
  return observedEventScore(candidate) > observedEventScore(current)
}

function operationTimestamp(item = {}, state = SERVICE_OPERATION_STATE.ACTIVE) {
  const candidates = state === SERVICE_OPERATION_STATE.COMPLETED
    ? [item?.stopTs, item?.startTs]
    : [item?.startTs]

  for (const value of candidates) {
    const timestamp = Number(value)
    if (Number.isFinite(timestamp) && timestamp > 0) {
      return timestamp
    }
  }
  return 0
}

function normalizedIdentity(value) {
  return text(value).toLowerCase()
}

function workdayDurationIdentity(row = {}) {
  const workerId = text(row?.workerId ?? row?.worker_id)
  if (workerId) return `id:${workerId}`

  const workerLogin = normalizedIdentity(row?.workerLogin ?? row?.worker_login)
  if (workerLogin) return `login:${workerLogin}`

  const workerName = normalizedIdentity(
    row?.workerDisplayName ?? row?.workerName ?? row?.worker_name,
  )
  return workerName ? `name:${workerName}` : ''
}

/**
 * Builds factual work time totals for the current day. A distinct overlapping
 * record is held for review and is not presented as confirmed worker time.
 * A duplicated display name that points at different persisted identities is
 * marked ambiguous and must not be presented as one person's total.
 */
export function buildWorkerDayDurationIndex({
  workdays = [],
  nowTs = Date.now(),
} = {}) {
  const safeNowTs = timestamp(nowTs)
  const workersByName = new Map()

  ;(Array.isArray(workdays) ? workdays : []).forEach((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return
    const workerName = text(
      row?.workerDisplayName ?? row?.workerName ?? row?.worker_name,
    )
    const normalizedName = normalizedIdentity(workerName)
    const identity = workdayDurationIdentity(row)
    if (!normalizedName || !identity) return

    const startTs = timestamp(row?.clippedStart ?? row?.startTs ?? row?.sourceStartAt)
    const persistedStopTs = timestamp(
      row?.clippedStop ?? row?.stopTs ?? row?.sourceStopAt,
    )
    const stopTs = row?.isRunning === true
      ? Math.max(startTs, safeNowTs)
      : persistedStopTs
    if (!(startTs > 0) || stopTs < startTs) return

    if (!workersByName.has(normalizedName)) {
      workersByName.set(normalizedName, {
        workerName,
        identities: new Map(),
      })
    }
    const entry = workersByName.get(normalizedName)
    if (!entry.identities.has(identity)) {
      entry.identities.set(identity, [])
    }
    entry.identities.get(identity).push({
      startTs,
      endTs: stopTs,
      workdayId: String(row?.workdayId ?? row?.id ?? '').trim(),
      eventId: String(row?.eventId ?? '').trim(),
      updatedAt: row?.updatedAt,
    })
  })

  const index = {}
  workersByName.forEach((entry, normalizedName) => {
    const identityDurations = [...entry.identities.entries()].map(
      ([identity, intervals]) => {
        const summary = summarizeWorkTimeRows(intervals)
        return {
          identity,
          seconds: summary.reviewRequired ? null : summary.grossSec,
          reviewRequired: summary.reviewRequired,
        }
      },
    )
    index[normalizedName] = identityDurations.length === 1
      ? {
          workerName: entry.workerName,
          seconds: identityDurations[0].seconds,
          ambiguous: false,
          reviewRequired: identityDurations[0].reviewRequired,
        }
      : {
          workerName: entry.workerName,
          seconds: null,
          ambiguous: true,
          reviewRequired: false,
        }
  })
  return index
}

function observedWorkdayId(row = {}, startTs = 0) {
  const persistedId = text(row?.workdayId ?? row?.workday_id ?? row?.eventId ?? row?.event_id ?? row?.id)
  if (persistedId) return persistedId
  const workerIdentity = text(row?.workerId ?? row?.worker_id ?? row?.workerLogin ?? row?.worker_login ?? row?.workerName)
  return workerIdentity && startTs > 0 ? `${workerIdentity}:${startTs}` : ''
}

function observedWorkdayObjectLabel(row = {}) {
  const label = text(
    row?.clientLabel ??
      row?.companyLabel ??
      row?.locationLabel ??
      row?.scanObjectLabel,
  )
  return label === '-' ? '' : label
}

function observedWorkdayWorkerIdentity(row = {}) {
  return {
    workerId: text(row?.workerId ?? row?.worker_id),
    workerLogin: normalizedIdentity(row?.workerLogin ?? row?.worker_login),
    workerName: text(row?.workerDisplayName ?? row?.workerName ?? row?.worker_name),
  }
}

function observedWorkdayScore(item = {}) {
  return (
    Number(item.operationState === SERVICE_OPERATION_STATE.COMPLETED) * 4 +
    Number(item.stopTs > 0) * 2 +
    Number(item.startTs > 0)
  )
}

/**
 * Returns factual START/STOP presence on a recognized object. A workday is not
 * treated as proof that a planned cleaning task was fulfilled.
 */
export function buildObservedWorkdayOperationCandidates({
  workdays = [],
  dayYmd = '',
} = {}) {
  const normalizedDay = text(dayYmd)
  const candidatesById = new Map()

  ;(Array.isArray(workdays) ? workdays : []).forEach((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return
    if (text(row?.kind).toLowerCase() !== 'workday') return

    const startTs = timestamp(row?.startTs ?? row?.sourceStartAt)
    const rawStopTs = timestamp(row?.stopTs ?? row?.sourceStopAt)
    const isRunning = row?.isRunning === true
    const operationState = isRunning
      ? SERVICE_OPERATION_STATE.ACTIVE
      : rawStopTs >= startTs && startTs > 0
        ? SERVICE_OPERATION_STATE.COMPLETED
        : ''
    if (!operationState) return
    if (normalizedDay && localDateYmd(startTs) !== normalizedDay) return

    const clientLabel = observedWorkdayObjectLabel(row)
    const worker = observedWorkdayWorkerIdentity(row)
    if (!worker.workerId && !worker.workerLogin && !worker.workerName) return

    const workdayId = observedWorkdayId(row, startTs)
    if (!workdayId) return

    const candidate = {
      key: `workday:${workdayId}`,
      workdayId,
      operationState,
      startTs,
      stopTs: operationState === SERVICE_OPERATION_STATE.COMPLETED ? rawStopTs : 0,
      clientId: text(row?.clientId ?? row?.client_id),
      clientLabel,
      ...worker,
      sourceWorkday: row,
    }
    const current = candidatesById.get(workdayId)
    if (!current || observedWorkdayScore(candidate) > observedWorkdayScore(current)) {
      candidatesById.set(workdayId, candidate)
    }
  })

  const active = []
  const completed = []
  candidatesById.forEach((item) => {
    if (item.operationState === SERVICE_OPERATION_STATE.COMPLETED) {
      completed.push(item)
    } else {
      active.push(item)
    }
  })

  active.sort((left, right) => right.startTs - left.startTs)
  completed.sort((left, right) => right.stopTs - left.stopTs)
  return { active, completed }
}

function plannedWorkdayIdentity(item = {}) {
  return [
    text(item?.taskId),
    text(item?.serviceBlockId),
    text(item?.allocationId),
    text(item?.executionWorkSlotKey ?? item?.workSlotKey),
  ].join('\u001f')
}

/**
 * Correlates workday presence with a plan only through exact persisted
 * identifiers. If more than one plan remains possible, no match is returned.
 */
export function matchObservedWorkdayToPlan(workday = {}, plannedItems = []) {
  const source = workday?.sourceWorkday ?? workday
  const sourceRow = source?.sourceRow ?? {}
  const clientId = text(workday?.clientId ?? source?.clientId ?? sourceRow?.clientId ?? sourceRow?.client_id)
  const workerId = text(workday?.workerId ?? source?.workerId ?? sourceRow?.workerId ?? sourceRow?.worker_id)
  const workerLogin = normalizedIdentity(
    workday?.workerLogin ?? source?.workerLogin ?? sourceRow?.workerLogin ?? sourceRow?.worker_login,
  )
  if (!clientId || (!workerId && !workerLogin)) return null

  const exactReferences = {
    taskId: text(source?.taskId ?? sourceRow?.taskId ?? sourceRow?.task_id),
    serviceBlockId: text(
      source?.serviceBlockId ?? sourceRow?.serviceBlockId ?? sourceRow?.service_block_id,
    ),
    allocationId: text(source?.allocationId ?? sourceRow?.allocationId ?? sourceRow?.allocation_id),
    executionWorkSlotKey: text(
      source?.executionWorkSlotKey ??
        source?.workSlotKey ??
        sourceRow?.executionWorkSlotKey ??
        sourceRow?.workSlotKey ??
        sourceRow?.work_slot_key,
    ),
  }
  if (!Object.values(exactReferences).some(Boolean)) return null

  const matches = (Array.isArray(plannedItems) ? plannedItems : []).filter((item) => {
    if (text(item?.clientId) !== clientId) return false
    const planWorkerId = text(item?.workerId)
    const planWorkerLogin = normalizedIdentity(item?.workerLogin)
    const sameWorker = workerId
      ? Boolean(planWorkerId && planWorkerId === workerId)
      : Boolean(workerLogin && planWorkerLogin === workerLogin)
    if (!sameWorker) return false

    return Object.entries(exactReferences).every(([field, value]) => (
      !value || text(item?.[field] ?? (field === 'executionWorkSlotKey' ? item?.workSlotKey : '')) === value
    ))
  })

  const uniqueMatches = new Map()
  matches.forEach((item) => {
    const startTs = timestamp(item?.startTs)
    const stopTs = timestamp(item?.stopTs)
    if (!(startTs > 0) || stopTs <= startTs) return
    uniqueMatches.set(plannedWorkdayIdentity(item), item)
  })

  return uniqueMatches.size === 1 ? [...uniqueMatches.values()][0] : null
}

/**
 * Returns explicit CLEAN activity that can be shown without claiming that it
 * fulfils a planned task. Exact event IDs already accepted by the strict plan
 * model are excluded so one scan is never rendered twice.
 */
export function buildObservedServiceOperationCandidates({
  events = [],
  consumedEventIds = [],
  dayYmd = '',
} = {}) {
  const normalizedDay = text(dayYmd)
  const consumedIds = new Set(
    (Array.isArray(consumedEventIds) ? consumedEventIds : [])
      .map((value) => text(value))
      .filter(Boolean),
  )
  const candidatesById = new Map()

  ;(Array.isArray(events) ? events : []).forEach((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return
    if (row?.hasExplicitEventId === false || text(row?.historySourceKind).toLowerCase() === 'workday') {
      return
    }
    if (!cleanEventType(row?.eventType ?? row?.event_type)) return

    const eventId = observedEventId(row)
    if (!eventId || consumedIds.has(eventId)) return

    const startTs = timestamp(row?.startAt)
    const stopTs = timestamp(row?.endAt)
    const operationState = observedEventState(row, startTs, stopTs)
    if (!operationState) return

    const eventDayYmd = observedEventDayYmd(row, startTs)
    if (normalizedDay && eventDayYmd !== normalizedDay) return

    const candidate = {
      key: `observed:${eventId}`,
      eventId,
      eventIds: [eventId],
      operationState,
      startTs,
      stopTs: operationState === SERVICE_OPERATION_STATE.COMPLETED ? stopTs : 0,
      revisionTs: observedEventRevisionTimestamp(row),
      sourceEvent: row,
    }
    const current = candidatesById.get(eventId)
    if (!current || shouldReplaceObservedEvent(current, candidate)) {
      candidatesById.set(eventId, candidate)
    }
  })

  const active = []
  const completed = []
  candidatesById.forEach((item) => {
    const visibleItem = { ...item }
    delete visibleItem.revisionTs
    if (visibleItem.operationState === SERVICE_OPERATION_STATE.COMPLETED) {
      completed.push(visibleItem)
    } else {
      active.push(visibleItem)
    }
  })

  active.sort((left, right) => right.startTs - left.startTs)
  completed.sort((left, right) => right.stopTs - left.stopTs)
  return { active, completed }
}

export function buildServiceOperationStream({
  active = [],
  completed = [],
} = {}) {
  const activeItems = (Array.isArray(active) ? active : []).map((item) => ({
    ...item,
    operationState: SERVICE_OPERATION_STATE.ACTIVE,
    occurredAtTs: operationTimestamp(item, SERVICE_OPERATION_STATE.ACTIVE),
  }))
  const completedItems = (Array.isArray(completed) ? completed : []).map((item) => ({
    ...item,
    operationState: SERVICE_OPERATION_STATE.COMPLETED,
    occurredAtTs: operationTimestamp(item, SERVICE_OPERATION_STATE.COMPLETED),
  }))

  const newestFirst = (left, right) =>
    Number(right.occurredAtTs) - Number(left.occurredAtTs) ||
    String(left.title ?? '').localeCompare(String(right.title ?? ''), 'pl', {
      sensitivity: 'base',
    })

  return [
    ...activeItems.sort(newestFirst),
    ...completedItems.sort(newestFirst),
  ]
}

export function serviceOperationPreview(items = [], limit = 5) {
  const safeLimit = Math.max(0, Math.floor(Number(limit) || 0))
  return (Array.isArray(items) ? items : []).slice(0, safeLimit)
}
