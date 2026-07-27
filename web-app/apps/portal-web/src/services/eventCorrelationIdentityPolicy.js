function normalizedId(value) {
  return String(value ?? '').trim()
}

function normalizedLogin(value) {
  return normalizedId(value).toLowerCase()
}

function normalizedTimestamp(value) {
  const raw = normalizedId(value)
  if (!raw) {
    return null
  }

  const date = new Date(raw)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

export function eventCorrelationIdentityChanged(baseline = {}, next = {}) {
  const baselineWorkdayId = normalizedId(
    baseline.workdayId ?? baseline.linkedWorkdayId ?? baseline.eventId,
  )
  const nextWorkdayId = normalizedId(
    next.workdayId ?? next.linkedWorkdayId ?? next.eventId,
  )
  const baselineZoneId = normalizedId(
    baseline.zoneId ?? baseline.utilityRoomId ?? baseline.roomId,
  )
  const nextZoneId = normalizedId(next.zoneId ?? next.utilityRoomId ?? next.roomId)
  const baselineWorkerLogin = normalizedLogin(baseline.workerLogin)
  const nextWorkerLogin = normalizedLogin(next.workerLogin)
  const baselineStartAt = normalizedTimestamp(baseline.startAt)
  const nextStartAt = normalizedTimestamp(next.startAt)

  return (
    baselineWorkdayId !== nextWorkdayId ||
    baselineZoneId !== nextZoneId ||
    baselineWorkerLogin !== nextWorkerLogin ||
    baselineStartAt !== nextStartAt
  )
}
