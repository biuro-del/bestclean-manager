import { workIntervalsTotalSeconds } from '../workers/workIntervals.js'

/** Returns only a valid, real START-STOP pair duration. */
export function reportClosedSessionDurationSec(item = {}) {
  const sourceKind = String(item?.historySourceKind ?? '').trim().toLowerCase()
  if (item?.hasExplicitEventId === false || item?.historyMarkerOnly === true || sourceKind === 'workday') {
    return 0
  }
  return workIntervalsTotalSeconds([{
    startAt: item?.startAt ?? item?.startIso,
    endAt: item?.endAt ?? item?.endIso ?? item?.stopAt,
  }])
}

export function reportHasClosedSession(item = {}) {
  return reportClosedSessionDurationSec(item) > 0
}

/** Returns attendance time only for a real Workday START-STOP session. */
export function reportAttendanceSessionDurationSec(item = {}) {
  const sourceKind = String(item?.historySourceKind ?? '').trim().toLowerCase()
  const isWorkday = sourceKind === 'workday' || item?.hasExplicitEventId === false || item?.historyMarkerOnly === true
  if (!isWorkday) return 0
  return workIntervalsTotalSeconds([{
    startAt: item?.startAt ?? item?.startIso,
    endAt: item?.endAt ?? item?.endIso ?? item?.stopAt,
  }])
}
