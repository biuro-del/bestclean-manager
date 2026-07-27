const MINUTE_MS = 60 * 1000

export const SCHEDULE_START_GRACE_MINUTES = 10

function finiteTimestamp(value) {
  const timestamp = Number(value)
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0
}

export function scheduleStartDeadlineTs(
  plannedStartTs,
  graceMinutes = SCHEDULE_START_GRACE_MINUTES,
) {
  const planned = finiteTimestamp(plannedStartTs)
  const grace = Number(graceMinutes)
  if (!planned || !Number.isFinite(grace) || grace < 0) {
    return 0
  }
  return planned + grace * MINUTE_MS
}

export function isScheduleStartOverdue({
  plannedStartTs,
  actualStartTs = 0,
  completed = false,
  nowTs = Date.now(),
  graceMinutes = SCHEDULE_START_GRACE_MINUTES,
} = {}) {
  if (completed || finiteTimestamp(actualStartTs)) {
    return false
  }

  const deadlineTs = scheduleStartDeadlineTs(plannedStartTs, graceMinutes)
  const currentTs = finiteTimestamp(nowTs)
  return Boolean(deadlineTs && currentTs && currentTs > deadlineTs)
}

export function scheduleStartDelayMinutes(actualStartTs, plannedStartTs) {
  const actual = finiteTimestamp(actualStartTs)
  const planned = finiteTimestamp(plannedStartTs)
  if (!actual || !planned || actual <= planned) {
    return 0
  }
  return Math.max(1, Math.ceil((actual - planned) / MINUTE_MS))
}
