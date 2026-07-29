const WORKDAY_CLOSING_REASONS = new Set([
  'WORKDAY_STOP',
  'STOP_END_DAY',
  'MANUAL_CLOSE',
])

function hasValue(value) {
  const text = String(value ?? '').trim()
  return Boolean(text) && text !== '-' && text !== '--:--:--' && text !== '-:-:-'
}

function isExplicitServiceEvent(row = {}) {
  if (row?.hasExplicitEventId === true) {
    return true
  }

  if (String(row?.historySourceKind ?? '').trim().toLowerCase() === 'event') {
    return true
  }

  const eventId = String(row?.eventId ?? '').trim()
  const workdayId = String(row?.workdayId ?? row?.linkedWorkdayId ?? '').trim()
  return Boolean(eventId && workdayId && eventId !== workdayId)
}

export function rowHasWorkdayStop(row = {}) {
  const endReason = String(row?.endReason ?? '').trim().toUpperCase()
  const rawStatus = String(row?.status ?? row?.state ?? '').trim().toUpperCase()

  if (
    hasValue(row?.dayEndAt) ||
    hasValue(row?.dayStopAt) ||
    hasValue(row?.dayStopTime) ||
    WORKDAY_CLOSING_REASONS.has(endReason) ||
    rawStatus === 'WORKDAY_CLOSED'
  ) {
    return true
  }

  // STOP zwykłego zdarzenia zamyka usługę na obiekcie, nie cały dzień pracy.
  // Do zamknięcia dnia zdarzenie musi nieść jeden z jednoznacznych sygnałów powyżej.
  if (isExplicitServiceEvent(row)) {
    return false
  }

  return (
    hasValue(row?.endAt) ||
    hasValue(row?.closeMarkedAt) ||
    hasValue(row?.qrStop) ||
    hasValue(row?.stop) ||
    rawStatus === 'CLOSED'
  )
}

export function isHistoricalOpenWorkday(row = {}, today = '', dayKey = '') {
  const normalizedDayKey = String(dayKey ?? '').trim()
  const normalizedToday = String(today ?? '').trim()
  if (!normalizedDayKey || !normalizedToday || normalizedDayKey >= normalizedToday) {
    return false
  }

  if (rowHasWorkdayStop(row)) {
    return false
  }

  const rawStatus = String(row?.status ?? row?.state ?? '').trim().toUpperCase()
  return rawStatus === 'RUNNING' || rawStatus === 'OPEN'
}
