function text(value) {
  return String(value ?? '').trim()
}

function normalized(value) {
  return text(value).toLowerCase()
}

export function openWorkdayRecordKey(row = {}) {
  return text(row.workdayId ?? row.workday_id ?? row.id)
}

export function openWorkdayWorkerKey(row = {}) {
  const workerLogin = text(
    row.workerLogin ??
      row.worker_login ??
      row.login ??
      row.worker?.login,
  )
  return workerLogin ? `login:${normalized(workerLogin)}` : ''
}

export function isOpenWorkday(row = {}) {
  if (!row || typeof row !== 'object') {
    return false
  }

  if (!openWorkdayRecordKey(row) || !openWorkdayWorkerKey(row)) {
    return false
  }

  if (text(row.endAt ?? row.end_at)) {
    return false
  }

  return text(row.status).toUpperCase() !== 'CLOSED'
}

export function findOpenWorkdayForWorker(rows = [], worker = {}, options = {}) {
  const workerKey = openWorkdayWorkerKey(worker)
  if (!workerKey) {
    return null
  }

  const excludedRecordIds = new Set(
    (Array.isArray(options.excludeRecordIds) ? options.excludeRecordIds : [])
      .map(text)
      .filter(Boolean),
  )

  return (
    (Array.isArray(rows) ? rows : []).find(
      (row) =>
        isOpenWorkday(row) &&
        openWorkdayWorkerKey(row) === workerKey &&
        !excludedRecordIds.has(openWorkdayRecordKey(row)),
    ) ?? null
  )
}
