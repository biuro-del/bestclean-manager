import { isHistoricalOpenWorkday } from '../../dashboard/historicalOpenWorkdayModel.js'
import { workerIdentityKeys } from '../worker-management/index.js'
import { workTimeDayHasHistoryAlert } from '../workIntervals.js'

function workdayBusinessDate(row = {}, resolveDateKey) {
  const direct = String(row?.businessDateYmd ?? row?.dayKey ?? '').trim()
  if (direct) return direct

  const sourceDate = row?.dayStartAt ?? row?.startAt ?? row?.startIso
  return typeof resolveDateKey === 'function'
    ? String(resolveDateKey(sourceDate) ?? '').trim()
    : ''
}

export function currentMonthMissingStopWorkerKeys(rows = [], options = {}) {
  const today = String(options?.today ?? '').trim()
  const monthStart = String(options?.monthStart ?? '').trim()
  const keys = new Set()
  if (!today || !monthStart) return keys

  ;(Array.isArray(rows) ? rows : []).forEach((row) => {
    const dayKey = workdayBusinessDate(row, options?.resolveDateKey)
    if (dayKey < monthStart || !isHistoricalOpenWorkday(row, today, dayKey)) return
    workerIdentityKeys(row).forEach((key) => keys.add(key))
  })

  return keys
}

export function currentMonthWorkTimeAlertWorkerKeys(rows = [], options = {}) {
  const today = String(options?.today ?? '').trim()
  const monthStart = String(options?.monthStart ?? '').trim()
  const keys = new Set()
  if (!today || !monthStart) return keys

  ;(Array.isArray(rows) ? rows : []).forEach((row) => {
    const dayKey = workdayBusinessDate(row, options?.resolveDateKey)
    if (dayKey < monthStart || dayKey > today || !workTimeDayHasHistoryAlert(row, { today })) return
    workerIdentityKeys(row).forEach((key) => keys.add(key))
  })

  return keys
}

export function applyCurrentMonthMissingStopStatus(workers = [], rows = [], options = {}) {
  const missingStopWorkerKeys = currentMonthMissingStopWorkerKeys(rows, options)
  const workTimeAlertWorkerKeys = currentMonthWorkTimeAlertWorkerKeys(options?.alertRows, options)
  return (Array.isArray(workers) ? workers : []).map((worker) => ({
    ...worker,
    hasCurrentMonthMissingStop: [...workerIdentityKeys(worker)]
      .some((key) => missingStopWorkerKeys.has(key)),
    hasCurrentMonthWorkTimeAlert: [...workerIdentityKeys(worker)]
      .some((key) => workTimeAlertWorkerKeys.has(key)),
  }))
}
