export const SERVICE_EXECUTION_STATUS = Object.freeze({
  NOT_STARTED: 'NOT_STARTED',
  PARTIAL: 'PARTIAL',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
})

export const SERVICE_EXECUTION_EXCEPTION = Object.freeze({
  INVALID_PLAN_BLOCK: 'INVALID_PLAN_BLOCK',
  CONFLICTING_PLAN_BLOCK: 'CONFLICTING_PLAN_BLOCK',
  INVALID_EVENT: 'INVALID_EVENT',
  UNCLASSIFIED_EVENT: 'UNCLASSIFIED_EVENT',
  UNMATCHED_EVENT: 'UNMATCHED_EVENT',
  UNLINKED_EVENT: 'UNLINKED_EVENT',
  INVALID_EVENT_STATE: 'INVALID_EVENT_STATE',
  DUPLICATE_EVENT_ID: 'DUPLICATE_EVENT_ID',
  CONFLICTING_DUPLICATE_EVENT: 'CONFLICTING_DUPLICATE_EVENT',
  UNKNOWN_PLAN_BLOCK: 'UNKNOWN_PLAN_BLOCK',
  UNKNOWN_ALLOCATION: 'UNKNOWN_ALLOCATION',
  UNKNOWN_WORK_SLOT: 'UNKNOWN_WORK_SLOT',
  INVALID_PLAN_SNAPSHOT: 'INVALID_PLAN_SNAPSHOT',
  STALE_PLAN_REVISION: 'STALE_PLAN_REVISION',
  INCONSISTENT_PLAN_DURATION_SNAPSHOT: 'INCONSISTENT_PLAN_DURATION_SNAPSHOT',
})

const CLOSED_EVENT_STATUSES = new Set(['CLOSED', 'COMPLETED', 'DONE', 'FINISHED', 'STOPPED'])
const OPEN_EVENT_STATUSES = new Set(['', 'ACTIVE', 'IN_PROGRESS', 'OPEN', 'RUNNING', 'STARTED'])
const SUPPORTED_PLAN_SNAPSHOT_VERSION = 1
const PLAN_REVISION_STORAGE_PRECISION_MS = 1000

function text(value) {
  return String(value ?? '').trim()
}

function upper(value) {
  return text(value).toUpperCase().replace(/[\s-]+/g, '_')
}

function firstValue(source, keys) {
  if (!source || typeof source !== 'object') return undefined
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue
    const value = source[key]
    if (value == null || (typeof value === 'string' && !value.trim())) continue
    return value
  }
  return undefined
}

function positiveNumber(value) {
  const parsed = typeof value === 'number' ? value : Number(text(value).replace(',', '.'))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function positiveInteger(value) {
  const parsed = typeof value === 'number' ? value : Number(text(value))
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function timestamp(value) {
  if (value instanceof Date) {
    const parsed = value.getTime()
    return Number.isFinite(parsed) ? parsed : null
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  const normalized = text(value)
  if (!normalized) return null
  const parsed = Date.parse(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function timestampIso(value) {
  const parsed = timestamp(value)
  return parsed == null ? '' : new Date(parsed).toISOString()
}

function sameStoredPlanRevision(leftTimestamp, rightTimestamp) {
  if (!Number.isFinite(leftTimestamp) || !Number.isFinite(rightTimestamp)) {
    return false
  }
  return (
    Math.floor(leftTimestamp / PLAN_REVISION_STORAGE_PRECISION_MS) ===
    Math.floor(rightTimestamp / PLAN_REVISION_STORAGE_PRECISION_MS)
  )
}

function validDateYmd(value) {
  const normalized = text(value)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized)
  if (!match) return ''
  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, monthIndex, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === monthIndex &&
    date.getUTCDate() === day
  )
    ? normalized
    : ''
}

function identityPart(source, camelKey, snakeKey = '') {
  return text(firstValue(source, snakeKey ? [camelKey, snakeKey] : [camelKey]))
}

function blockIdentity(source = {}) {
  return {
    orgId: identityPart(source, 'orgId', 'org_id'),
    taskId: text(firstValue(source, ['taskId', 'task_id', 'idTask'])),
    occurrenceDateYmd: validDateYmd(firstValue(source, ['occurrenceDateYmd', 'occurrence_date_ymd'])),
    serviceBlockId: text(firstValue(source, ['serviceBlockId', 'service_block_id'])),
  }
}

function blockKey(identity) {
  return [
    identity.orgId,
    identity.taskId,
    identity.occurrenceDateYmd,
    identity.serviceBlockId,
  ].join('\u001f')
}

function allocationIdFromValue(value) {
  if (typeof value === 'string' || typeof value === 'number') return text(value)
  return text(firstValue(value, ['allocationId', 'allocation_id', 'key', 'slotId', 'slot_id', 'id']))
}

function allocationWorkSlotKeyFromValue(value) {
  if (!value || typeof value !== 'object') return ''
  return text(firstValue(value, ['workSlotKey', 'work_slot_key', 'key']))
}

function planAllocationInfo(plan = {}) {
  const sources = [
    [{
      allocationId: firstValue(plan, ['allocationId', 'allocation_id']),
      workSlotKey: firstValue(plan, ['workSlotKey', 'work_slot_key']),
    }],
    plan.requiredAllocationIds,
    plan.required_allocation_ids,
    plan.allocationIds,
    plan.allocation_ids,
    plan.allocations,
    plan.workAllocations,
    plan.work_allocations,
    plan.workerAllocations,
    plan.worker_allocations,
    plan.slots,
  ].filter(Array.isArray)
  const ids = []
  const workSlotKeyById = new Map()
  const conflictingWorkSlotIds = new Set()
  const seen = new Set()

  sources.flat().forEach((allocation) => {
    if (allocation && typeof allocation === 'object' && allocation.required === false) return
    const allocationId = allocationIdFromValue(allocation)
    if (!allocationId) return
    const workSlotKey = allocationWorkSlotKeyFromValue(allocation)
    const currentWorkSlotKey = workSlotKeyById.get(allocationId)
    if (workSlotKey && currentWorkSlotKey && currentWorkSlotKey !== workSlotKey) {
      conflictingWorkSlotIds.add(allocationId)
    } else if (workSlotKey) {
      workSlotKeyById.set(allocationId, workSlotKey)
    }
    if (seen.has(allocationId)) return
    seen.add(allocationId)
    ids.push(allocationId)
  })

  return { ids, workSlotKeyById, conflictingWorkSlotIds }
}

function planLabels(plan = {}) {
  return {
    taskLabel: text(firstValue(plan, ['taskLabel', 'taskName', 'title', 'name'])),
    serviceBlockLabel: text(firstValue(plan, ['serviceBlockLabel', 'blockLabel', 'label'])),
    clientId: text(firstValue(plan, ['clientId', 'client_id'])),
    clientLabel: text(firstValue(plan, ['clientLabel', 'clientName', 'client_name'])),
  }
}

function planTaskRevision(plan = {}) {
  const iso = timestampIso(firstValue(plan, [
    'taskUpdatedAt',
    'task_updated_at',
    'updatedAt',
    'updated_at',
  ]))
  return {
    iso,
    timestamp: iso ? Date.parse(iso) : null,
  }
}

function exception(code, source, details = {}) {
  return {
    code,
    source,
    ...details,
  }
}

function eventTypeToken(event = {}) {
  return upper(firstValue(event, [
    'eventType',
    'event_type',
  ]))
}

function isCleanToken(token) {
  return token === 'CLEAN' || token.startsWith('CLEAN_')
}

function eventLink(event = {}) {
  return {
    orgId: identityPart(event, 'orgId', 'org_id'),
    taskId: identityPart(event, 'taskId', 'task_id'),
    occurrenceDateYmd: validDateYmd(firstValue(event, ['occurrenceDateYmd', 'occurrence_date_ymd'])),
    serviceBlockId: identityPart(event, 'serviceBlockId', 'service_block_id'),
    allocationId: identityPart(event, 'allocationId', 'allocation_id'),
    workSlotKey: identityPart(event, 'workSlotKey', 'work_slot_key'),
  }
}

function eventPlanSnapshot(event = {}) {
  const taskUpdatedAtSnapshot = timestampIso(firstValue(event, [
    'taskUpdatedAtSnapshot',
    'task_updated_at_snapshot',
  ]))
  const matchedAt = timestampIso(firstValue(event, ['matchedAt', 'matched_at']))
  const rawVersion = firstValue(event, ['planSnapshotVersion', 'plan_snapshot_version'])
  const planSnapshotVersion = Number(rawVersion)
  return {
    taskUpdatedAtSnapshot,
    taskUpdatedAtTimestamp: taskUpdatedAtSnapshot ? Date.parse(taskUpdatedAtSnapshot) : null,
    matchedAt,
    matchedAtTimestamp: matchedAt ? Date.parse(matchedAt) : null,
    planSnapshotVersion:
      Number.isInteger(planSnapshotVersion) && planSnapshotVersion > 0
        ? planSnapshotVersion
        : null,
    plannedDurationMinutes: positiveInteger(firstValue(event, [
      'plannedDurationMinutes',
      'planned_duration_minutes',
    ])),
  }
}

function normalizedEventState(event = {}) {
  const startAt = timestamp(firstValue(event, ['startAt', 'start_at']))
  const endAt = timestamp(firstValue(event, ['endAt', 'end_at']))
  const status = upper(event.status)
  const statusIsClosed = CLOSED_EVENT_STATUSES.has(status)

  if (endAt != null) {
    if (startAt != null && endAt < startAt) return null
    return { state: 'CLOSED', startAt, endAt, status }
  }
  if (statusIsClosed) return null
  if (startAt != null && OPEN_EVENT_STATUSES.has(status)) {
    return { state: 'OPEN', startAt, endAt: null, status }
  }
  return null
}

function eventRevisionTimestamp(event = {}) {
  return timestamp(firstValue(event, [
    'updatedAt',
    'updated_at',
    'modifiedAt',
    'modified_at',
    'createdAt',
    'created_at',
  ])) ?? 0
}

function eventRevisionScore(normalized) {
  return (
    Number(normalized.state === 'CLOSED') * 8 +
    Number(normalized.endAt != null) * 4 +
    Number(positiveNumber(normalized.durationSec) != null) * 2 +
    Number(normalized.startAt != null)
  )
}

function shouldReplaceEventRevision(current, candidate) {
  if (candidate.revisionTimestamp !== current.revisionTimestamp) {
    return candidate.revisionTimestamp > current.revisionTimestamp
  }
  return eventRevisionScore(candidate) > eventRevisionScore(current)
}

function sameEventLink(left, right) {
  return (
    left.orgId === right.orgId &&
    left.taskId === right.taskId &&
    left.occurrenceDateYmd === right.occurrenceDateYmd &&
    left.serviceBlockId === right.serviceBlockId &&
    left.allocationId === right.allocationId &&
    left.workSlotKey === right.workSlotKey
  )
}

function sameEventSnapshot(left, right) {
  return (
    left.taskUpdatedAtTimestamp === right.taskUpdatedAtTimestamp &&
    left.planSnapshotVersion === right.planSnapshotVersion &&
    left.matchedAtTimestamp === right.matchedAtTimestamp &&
    left.plannedDurationMinutes === right.plannedDurationMinutes
  )
}

function eventDurationSeconds(event, nowTimestamp) {
  if (event.state === 'OPEN') {
    return event.startAt != null && nowTimestamp > event.startAt
      ? Math.floor((nowTimestamp - event.startAt) / 1000)
      : 0
  }

  const explicitSeconds = positiveNumber(event.durationSec)
  if (explicitSeconds != null) return Math.floor(explicitSeconds)
  if (event.startAt != null && event.endAt != null && event.endAt >= event.startAt) {
    return Math.floor((event.endAt - event.startAt) / 1000)
  }
  return 0
}

function summarizeEvent(event, nowTimestamp) {
  const durationSeconds = eventDurationSeconds(event, nowTimestamp)
  return {
    eventId: event.eventId,
    allocationId: event.allocationId,
    workSlotKey: event.workSlotKey,
    state: event.state,
    status: event.status,
    startAt: event.startAt == null ? null : new Date(event.startAt).toISOString(),
    endAt: event.endAt == null ? null : new Date(event.endAt).toISOString(),
    durationSeconds,
    plannedDurationMinutes: event.plannedDurationMinutes,
  }
}

function sortBlocks(left, right) {
  return (
    left.occurrenceDateYmd.localeCompare(right.occurrenceDateYmd) ||
    left.taskId.localeCompare(right.taskId) ||
    left.serviceBlockId.localeCompare(right.serviceBlockId)
  )
}

/**
 * Builds a read-only execution projection for one organization and one day.
 *
 * `plannedBlocks` must identify each occurrence with orgId, taskId,
 * occurrenceDateYmd and serviceBlockId, and list its required allocations.
 * Execution is accepted only from explicit CLEAN events carrying the same
 * persisted identity and matchStatus=MATCHED. Client and zone data are labels,
 * never matching keys.
 */
export function buildServiceExecutionModel(options = {}) {
  const orgId = text(options.orgId)
  const dayYmd = validDateYmd(options.dayYmd)
  if (!orgId) throw new TypeError('buildServiceExecutionModel requires orgId')
  if (!dayYmd) throw new TypeError('buildServiceExecutionModel requires a valid dayYmd')

  const plannedBlocks = Array.isArray(options.plannedBlocks)
    ? options.plannedBlocks
    : Array.isArray(options.plans)
      ? options.plans
      : []
  const inputEvents = Array.isArray(options.events) ? options.events : []
  const nowTimestamp = timestamp(options.now) ?? Date.now()
  const requireWorkSlotKey = options.requireWorkSlotKey === true
  const exceptions = []
  const planMap = new Map()
  let ignoredOutOfScope = 0

  plannedBlocks.forEach((plan, planIndex) => {
    if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
      exceptions.push(exception(
        SERVICE_EXECUTION_EXCEPTION.INVALID_PLAN_BLOCK,
        'plan',
        { planIndex, missingFields: ['plan'] },
      ))
      return
    }

    const identity = blockIdentity(plan)
    const taskRevision = planTaskRevision(plan)
    if (
      (identity.orgId && identity.orgId !== orgId) ||
      (identity.occurrenceDateYmd && identity.occurrenceDateYmd !== dayYmd)
    ) {
      ignoredOutOfScope += 1
      return
    }

    const missingFields = [
      !identity.orgId && 'orgId',
      !identity.taskId && 'taskId',
      !identity.occurrenceDateYmd && 'occurrenceDateYmd',
      !identity.serviceBlockId && 'serviceBlockId',
      taskRevision.timestamp == null && 'taskUpdatedAt',
    ].filter(Boolean)
    const allocationInfo = planAllocationInfo(plan)
    if (!allocationInfo.ids.length) missingFields.push('requiredAllocationIds')
    if (
      requireWorkSlotKey &&
      allocationInfo.ids.some((allocationId) => !allocationInfo.workSlotKeyById.has(allocationId))
    ) {
      missingFields.push('workSlotKey')
    }
    if (missingFields.length) {
      exceptions.push(exception(
        SERVICE_EXECUTION_EXCEPTION.INVALID_PLAN_BLOCK,
        'plan',
        { planIndex, ...identity, missingFields },
      ))
      return
    }
    if (allocationInfo.conflictingWorkSlotIds.size) {
      exceptions.push(exception(
        SERVICE_EXECUTION_EXCEPTION.CONFLICTING_PLAN_BLOCK,
        'plan',
        {
          planIndex,
          ...identity,
          reason: 'WORK_SLOT_KEY_CONFLICT',
          allocationIds: [...allocationInfo.conflictingWorkSlotIds],
        },
      ))
      return
    }

    const key = blockKey(identity)
    const current = planMap.get(key)
    if (!current) {
      planMap.set(key, {
        key,
        ...identity,
        ...planLabels(plan),
        taskUpdatedAt: taskRevision.iso,
        taskUpdatedAtTimestamp: taskRevision.timestamp,
        requiredAllocationIds: [...allocationInfo.ids],
        workSlotKeyByAllocation: new Map(allocationInfo.workSlotKeyById),
        eventsByAllocation: new Map(),
      })
      return
    }

    if (!sameStoredPlanRevision(current.taskUpdatedAtTimestamp, taskRevision.timestamp)) {
      current.taskUpdatedAt = ''
      current.taskUpdatedAtTimestamp = null
      exceptions.push(exception(
        SERVICE_EXECUTION_EXCEPTION.CONFLICTING_PLAN_BLOCK,
        'plan',
        { planIndex, ...identity, reason: 'TASK_REVISION_CONFLICT' },
      ))
    }

    allocationInfo.ids.forEach((allocationId) => {
      if (!current.requiredAllocationIds.includes(allocationId)) {
        current.requiredAllocationIds.push(allocationId)
        const workSlotKey = allocationInfo.workSlotKeyById.get(allocationId)
        if (workSlotKey) current.workSlotKeyByAllocation.set(allocationId, workSlotKey)
        return
      }
      const currentWorkSlotKey = current.workSlotKeyByAllocation.get(allocationId)
      const nextWorkSlotKey = allocationInfo.workSlotKeyById.get(allocationId)
      if (currentWorkSlotKey && nextWorkSlotKey && currentWorkSlotKey !== nextWorkSlotKey) {
        current.workSlotKeyByAllocation.set(allocationId, '__CONFLICT__')
        exceptions.push(exception(
          SERVICE_EXECUTION_EXCEPTION.CONFLICTING_PLAN_BLOCK,
          'plan',
          {
            planIndex,
            ...identity,
            reason: 'WORK_SLOT_KEY_CONFLICT',
            allocationIds: [allocationId],
          },
        ))
      } else if (!currentWorkSlotKey && nextWorkSlotKey) {
        current.workSlotKeyByAllocation.set(allocationId, nextWorkSlotKey)
      }
    })
  })

  const deduplicatedEvents = new Map()
  const conflictedEventIds = new Set()
  let ignoredNonClean = 0
  let duplicateEvents = 0

  inputEvents.forEach((event, eventIndex) => {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      exceptions.push(exception(
        SERVICE_EXECUTION_EXCEPTION.INVALID_EVENT,
        'event',
        { eventIndex },
      ))
      return
    }

    const link = eventLink(event)
    if (
      (link.orgId && link.orgId !== orgId) ||
      (link.occurrenceDateYmd && link.occurrenceDateYmd !== dayYmd)
    ) {
      ignoredOutOfScope += 1
      return
    }

    const typeToken = eventTypeToken(event)
    const eventId = text(firstValue(event, ['eventId', 'event_id']))
    if (!typeToken) {
      exceptions.push(exception(
        SERVICE_EXECUTION_EXCEPTION.UNCLASSIFIED_EVENT,
        'event',
        { eventIndex, eventId },
      ))
      return
    }
    if (!isCleanToken(typeToken)) {
      ignoredNonClean += 1
      return
    }

    const matchStatus = upper(firstValue(event, ['matchStatus', 'match_status']))
    if (matchStatus !== 'MATCHED') {
      exceptions.push(exception(
        SERVICE_EXECUTION_EXCEPTION.UNMATCHED_EVENT,
        'event',
        { eventIndex, eventId, matchStatus: matchStatus || null },
      ))
      return
    }

    const missingFields = [
      !eventId && 'eventId',
      !link.orgId && 'orgId',
      !link.taskId && 'taskId',
      !link.occurrenceDateYmd && 'occurrenceDateYmd',
      !link.serviceBlockId && 'serviceBlockId',
      !link.allocationId && 'allocationId',
      requireWorkSlotKey && !link.workSlotKey && 'workSlotKey',
    ].filter(Boolean)
    if (missingFields.length) {
      exceptions.push(exception(
        SERVICE_EXECUTION_EXCEPTION.UNLINKED_EVENT,
        'event',
        { eventIndex, eventId, ...link, missingFields },
      ))
      return
    }

    const snapshot = eventPlanSnapshot(event)
    const missingSnapshotFields = [
      snapshot.taskUpdatedAtTimestamp == null && 'taskUpdatedAtSnapshot',
      snapshot.planSnapshotVersion == null && 'planSnapshotVersion',
      snapshot.matchedAtTimestamp == null && 'matchedAt',
    ].filter(Boolean)
    if (missingSnapshotFields.length) {
      exceptions.push(exception(
        SERVICE_EXECUTION_EXCEPTION.INVALID_PLAN_SNAPSHOT,
        'event',
        { eventIndex, eventId, ...link, missingFields: missingSnapshotFields },
      ))
      return
    }
    if (snapshot.planSnapshotVersion !== SUPPORTED_PLAN_SNAPSHOT_VERSION) {
      exceptions.push(exception(
        SERVICE_EXECUTION_EXCEPTION.INVALID_PLAN_SNAPSHOT,
        'event',
        {
          eventIndex,
          eventId,
          ...link,
          reason: 'UNSUPPORTED_PLAN_SNAPSHOT_VERSION',
          planSnapshotVersion: snapshot.planSnapshotVersion,
        },
      ))
      return
    }
    if (snapshot.matchedAtTimestamp < snapshot.taskUpdatedAtTimestamp) {
      exceptions.push(exception(
        SERVICE_EXECUTION_EXCEPTION.INVALID_PLAN_SNAPSHOT,
        'event',
        {
          eventIndex,
          eventId,
          ...link,
          reason: 'MATCHED_BEFORE_TASK_REVISION',
          matchedAt: snapshot.matchedAt,
          taskUpdatedAtSnapshot: snapshot.taskUpdatedAtSnapshot,
        },
      ))
      return
    }

    const state = normalizedEventState(event)
    if (!state) {
      exceptions.push(exception(
        SERVICE_EXECUTION_EXCEPTION.INVALID_EVENT_STATE,
        'event',
        { eventIndex, eventId, ...link },
      ))
      return
    }

    const normalized = {
      eventIndex,
      eventId,
      ...link,
      ...state,
      ...snapshot,
      durationSec: firstValue(event, ['durationSec', 'duration_sec']),
      revisionTimestamp: eventRevisionTimestamp(event),
    }
    const dedupeKey = eventId
    if (conflictedEventIds.has(dedupeKey)) {
      duplicateEvents += 1
      return
    }
    const current = deduplicatedEvents.get(dedupeKey)
    if (!current) {
      deduplicatedEvents.set(dedupeKey, normalized)
      return
    }

    duplicateEvents += 1
    if (!sameEventLink(current, normalized) || !sameEventSnapshot(current, normalized)) {
      deduplicatedEvents.delete(dedupeKey)
      conflictedEventIds.add(dedupeKey)
      exceptions.push(exception(
        SERVICE_EXECUTION_EXCEPTION.CONFLICTING_DUPLICATE_EVENT,
        'event',
        { eventId, eventIndexes: [current.eventIndex, eventIndex] },
      ))
      return
    }

    const replacement = shouldReplaceEventRevision(current, normalized) ? normalized : current
    deduplicatedEvents.set(dedupeKey, replacement)
    exceptions.push(exception(
      SERVICE_EXECUTION_EXCEPTION.DUPLICATE_EVENT_ID,
      'event',
      {
        eventId,
        keptEventIndex: replacement.eventIndex,
        discardedEventIndex: replacement === normalized ? current.eventIndex : eventIndex,
      },
    ))
  })

  let acceptedEvents = 0
  deduplicatedEvents.forEach((event) => {
    const key = blockKey(event)
    const block = planMap.get(key)
    if (!block) {
      exceptions.push(exception(
        SERVICE_EXECUTION_EXCEPTION.UNKNOWN_PLAN_BLOCK,
        'event',
        {
          eventIndex: event.eventIndex,
          eventId: event.eventId,
          orgId: event.orgId,
          taskId: event.taskId,
          occurrenceDateYmd: event.occurrenceDateYmd,
          serviceBlockId: event.serviceBlockId,
          allocationId: event.allocationId,
        },
      ))
      return
    }
    if (
      block.taskUpdatedAtTimestamp == null ||
      !sameStoredPlanRevision(event.taskUpdatedAtTimestamp, block.taskUpdatedAtTimestamp)
    ) {
      exceptions.push(exception(
        SERVICE_EXECUTION_EXCEPTION.STALE_PLAN_REVISION,
        'event',
        {
          eventIndex: event.eventIndex,
          eventId: event.eventId,
          orgId: event.orgId,
          taskId: event.taskId,
          occurrenceDateYmd: event.occurrenceDateYmd,
          serviceBlockId: event.serviceBlockId,
          allocationId: event.allocationId,
          currentTaskUpdatedAt: block.taskUpdatedAt || null,
          taskUpdatedAtSnapshot: event.taskUpdatedAtSnapshot,
        },
      ))
      return
    }
    if (!block.requiredAllocationIds.includes(event.allocationId)) {
      exceptions.push(exception(
        SERVICE_EXECUTION_EXCEPTION.UNKNOWN_ALLOCATION,
        'event',
        {
          eventIndex: event.eventIndex,
          eventId: event.eventId,
          orgId: event.orgId,
          taskId: event.taskId,
          occurrenceDateYmd: event.occurrenceDateYmd,
          serviceBlockId: event.serviceBlockId,
          allocationId: event.allocationId,
        },
      ))
      return
    }
    const requiredWorkSlotKey = block.workSlotKeyByAllocation.get(event.allocationId) ?? ''
    if (
      requireWorkSlotKey &&
      (!requiredWorkSlotKey || requiredWorkSlotKey !== event.workSlotKey)
    ) {
      exceptions.push(exception(
        SERVICE_EXECUTION_EXCEPTION.UNKNOWN_WORK_SLOT,
        'event',
        {
          eventIndex: event.eventIndex,
          eventId: event.eventId,
          orgId: event.orgId,
          taskId: event.taskId,
          occurrenceDateYmd: event.occurrenceDateYmd,
          serviceBlockId: event.serviceBlockId,
          allocationId: event.allocationId,
          workSlotKey: event.workSlotKey,
        },
      ))
      return
    }
    if (!block.eventsByAllocation.has(event.allocationId)) {
      block.eventsByAllocation.set(event.allocationId, [])
    }
    block.eventsByAllocation.get(event.allocationId).push(event)
    acceptedEvents += 1
  })

  const blocks = [...planMap.values()].map((block) => {
    const activeAllocationIds = []
    const completedAllocationIds = []
    const missingAllocationIds = []
    const events = []
    const snapshotDurationByAllocation = new Map()
    let durationSnapshotComplete = true

    block.requiredAllocationIds.forEach((allocationId) => {
      const allocationEvents = block.eventsByAllocation.get(allocationId) ?? []
      const hasOpen = allocationEvents.some((event) => event.state === 'OPEN')
      const hasClosed = allocationEvents.some((event) => event.state === 'CLOSED')
      if (hasOpen) {
        activeAllocationIds.push(allocationId)
      } else if (hasClosed) {
        completedAllocationIds.push(allocationId)
      } else {
        missingAllocationIds.push(allocationId)
      }
      const snapshotDurations = allocationEvents
        .map((event) => event.plannedDurationMinutes)
      const uniqueSnapshotDurations = new Set(snapshotDurations.filter((value) => value != null))
      if (
        !allocationEvents.length ||
        snapshotDurations.some((value) => value == null) ||
        uniqueSnapshotDurations.size !== 1
      ) {
        durationSnapshotComplete = false
      }
      if (uniqueSnapshotDurations.size === 1 && snapshotDurations.every((value) => value != null)) {
        snapshotDurationByAllocation.set(allocationId, [...uniqueSnapshotDurations][0])
      } else if (uniqueSnapshotDurations.size > 1) {
        exceptions.push(exception(
          SERVICE_EXECUTION_EXCEPTION.INCONSISTENT_PLAN_DURATION_SNAPSHOT,
          'event',
          {
            ...blockIdentity(block),
            allocationId,
            eventIds: allocationEvents.map((event) => event.eventId),
            plannedDurationMinutes: [...uniqueSnapshotDurations],
          },
        ))
      }
      allocationEvents.forEach((event) => events.push(summarizeEvent(event, nowTimestamp)))
    })

    let status = SERVICE_EXECUTION_STATUS.NOT_STARTED
    if (activeAllocationIds.length) {
      status = SERVICE_EXECUTION_STATUS.ACTIVE
    } else if (completedAllocationIds.length === block.requiredAllocationIds.length) {
      status = SERVICE_EXECUTION_STATUS.COMPLETED
    } else if (events.length) {
      status = SERVICE_EXECUTION_STATUS.PARTIAL
    }

    const actualDurationSeconds = events.reduce((total, event) => total + event.durationSeconds, 0)
    const plannedDurationMinutes =
      durationSnapshotComplete &&
      snapshotDurationByAllocation.size === block.requiredAllocationIds.length
        ? block.requiredAllocationIds.reduce(
            (total, allocationId) => total + snapshotDurationByAllocation.get(allocationId),
            0,
          )
        : null
    const progressBasis = plannedDurationMinutes == null
      ? 'NO_TRUSTED_EVENT_SNAPSHOT'
      : 'EVENT_PLAN_SNAPSHOT_TOTAL'
    const progressPercent = plannedDurationMinutes == null
      ? null
      : status === SERVICE_EXECUTION_STATUS.COMPLETED
        ? 100
        : Math.max(
          0,
            Math.min(100, Math.round((actualDurationSeconds / (plannedDurationMinutes * 60)) * 100)),
          )

    return {
      key: block.key,
      orgId: block.orgId,
      taskId: block.taskId,
      taskUpdatedAt: block.taskUpdatedAt,
      occurrenceDateYmd: block.occurrenceDateYmd,
      serviceBlockId: block.serviceBlockId,
      taskLabel: block.taskLabel,
      serviceBlockLabel: block.serviceBlockLabel,
      clientId: block.clientId,
      clientLabel: block.clientLabel,
      status,
      requiredAllocationIds: [...block.requiredAllocationIds],
      requiredAllocations: block.requiredAllocationIds.map((allocationId) => ({
        allocationId,
        workSlotKey: block.workSlotKeyByAllocation.get(allocationId) || '',
      })),
      activeAllocationIds,
      completedAllocationIds,
      missingAllocationIds,
      plannedDurationMinutes,
      actualDurationMinutes: Math.round((actualDurationSeconds / 60) * 10) / 10,
      progressPercent,
      progressBasis,
      events,
    }
  }).sort(sortBlocks)

  const active = blocks.filter((block) => block.status === SERVICE_EXECUTION_STATUS.ACTIVE)
  const completed = blocks.filter((block) => block.status === SERVICE_EXECUTION_STATUS.COMPLETED)

  return {
    scope: { orgId, dayYmd },
    blocks,
    active,
    completed,
    exceptions,
    stats: {
      inputPlannedBlocks: plannedBlocks.length,
      validPlannedBlocks: blocks.length,
      inputEvents: inputEvents.length,
      acceptedEvents,
      deduplicatedEvents: deduplicatedEvents.size,
      duplicateEvents,
      ignoredNonClean,
      ignoredOutOfScope,
      activeBlocks: active.length,
      completedBlocks: completed.length,
      exceptions: exceptions.length,
    },
  }
}
