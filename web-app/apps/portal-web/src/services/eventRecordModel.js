export const EVENT_RECORD_KINDS = Object.freeze({
  ACTIVITY: 'ACTIVITY',
  WORKDAY: 'WORKDAY',
})

const WORKDAY_END_REASONS = new Set(['MANUAL_WORKDAY', 'STOP_END_DAY', 'WORKDAY_STOP'])
const WORKDAY_EVENT_TYPES = new Set(['START', 'STOP', 'WORKDAY', 'WORKDAY_START', 'WORKDAY_STOP'])

function normalizedText(value) {
  return String(value ?? '').trim().toUpperCase()
}

function timestamp(value) {
  const parsed = new Date(value ?? '').getTime()
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

/**
 * Separates attendance Workday rows from operational client/zone activities.
 * Only attendance rows receive the dedicated visual treatment in Events.
 */
export function eventRecordKind(row = {}) {
  const explicitKind = normalizedText(row?.recordKind ?? row?.recordType)
  if (explicitKind === EVENT_RECORD_KINDS.WORKDAY || explicitKind === 'ATTENDANCE') {
    return EVENT_RECORD_KINDS.WORKDAY
  }
  if (explicitKind === EVENT_RECORD_KINDS.ACTIVITY || explicitKind === 'CLEAN') {
    return EVENT_RECORD_KINDS.ACTIVITY
  }

  const sourceKind = normalizedText(row?.historySourceKind)
  const eventType = normalizedText(row?.eventType ?? row?.event_type)
  const endReason = normalizedText(row?.endReason ?? row?.end_reason)
  if (
    sourceKind === 'WORKDAY' ||
    row?.hasExplicitEventId === false ||
    WORKDAY_EVENT_TYPES.has(eventType) ||
    WORKDAY_END_REASONS.has(endReason)
  ) {
    return EVENT_RECORD_KINDS.WORKDAY
  }

  return EVENT_RECORD_KINDS.ACTIVITY
}

/**
 * Links a manually entered operational activity only when one unambiguous
 * Workday fully contains it. An ambiguous or missing match remains unassigned
 * instead of creating or modifying attendance time.
 */
export function resolveContainingWorkdayId(workdays = [], activity = {}) {
  const workerKey = String(activity?.workerLogin ?? activity?.workerId ?? '').trim().toLowerCase()
  const activityStartTs = timestamp(activity?.startAt ?? activity?.endAt)
  const activityEndTs = timestamp(activity?.endAt ?? activity?.startAt)
  if (!workerKey || !activityStartTs || !activityEndTs || activityEndTs < activityStartTs) return ''

  const requestedWorkdayId = String(activity?.workdayId ?? activity?.linkedWorkdayId ?? '').trim()
  const matches = (Array.isArray(workdays) ? workdays : []).filter((workday) => {
    const workdayId = String(workday?.workdayId ?? workday?.id ?? '').trim()
    if (!workdayId || (requestedWorkdayId && requestedWorkdayId !== workdayId)) return false
    const workdayWorkerKey = String(workday?.workerLogin ?? workday?.workerId ?? '').trim().toLowerCase()
    if (!workdayWorkerKey || workdayWorkerKey !== workerKey) return false

    const workdayStartTs = timestamp(workday?.startAt ?? workday?.dayStartAt)
    const workdayEndTs = timestamp(workday?.endAt ?? workday?.dayEndAt)
    if (!workdayStartTs || activityStartTs < workdayStartTs) return false
    if (workdayEndTs && activityEndTs > workdayEndTs) return false
    // An open Workday can contain an activity for at most the following 24h.
    if (!workdayEndTs && activityEndTs - workdayStartTs > 24 * 60 * 60 * 1000) return false
    return true
  })

  if (matches.length !== 1) return ''
  return String(matches[0]?.workdayId ?? matches[0]?.id ?? '').trim()
}
