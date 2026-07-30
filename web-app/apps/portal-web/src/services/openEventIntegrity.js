function text(value) {
  return String(value ?? '').trim()
}

function normalized(value) {
  return text(value).toLowerCase()
}

export function openEventRecordKey(row = {}) {
  return text(row.eventId ?? row.event_id ?? row.id ?? row.cycleId ?? row.cycle_id)
}

export function openEventWorkerKey(row = {}) {
  const workerLogin = text(
    row.workerLogin ??
      row.worker_login ??
      row.login ??
      row.worker?.login,
  )
  if (workerLogin) {
    return `login:${normalized(workerLogin)}`
  }

  const workerId = text(
    row.workerId ??
      row.worker_id ??
      row.worker?.workerId ??
      row.worker?.worker_id ??
      row.worker?.id,
  )
  return workerId ? `id:${normalized(workerId)}` : ''
}

export function isOpenCleanEvent(row = {}) {
  if (!row || typeof row !== 'object') {
    return false
  }

  if (row.hasExplicitEventId === false || normalized(row.historySourceKind) === 'workday') {
    return false
  }

  const recordKey = openEventRecordKey(row)
  const workerKey = openEventWorkerKey(row)
  if (!recordKey || !workerKey) {
    return false
  }

  const status = text(row.status).toUpperCase()
  if (status === 'CLOSED') {
    return false
  }

  const eventType = text(row.eventType ?? row.event_type).toUpperCase()
  if (eventType !== 'CLEAN') {
    return false
  }

  return !text(
    row.endAt ??
      row.end_at ??
      row.stopAt ??
      row.stop_at,
  )
}

export function isLegacyOpenEventCandidate(row = {}) {
  if (!row || typeof row !== 'object') {
    return false
  }

  if (row.hasExplicitEventId === false || normalized(row.historySourceKind) === 'workday') {
    return false
  }

  if (!openEventRecordKey(row) || !openEventWorkerKey(row)) {
    return false
  }

  if (text(row.status).toUpperCase() === 'CLOSED') {
    return false
  }

  if (text(row.eventType ?? row.event_type)) {
    return false
  }

  return !text(
    row.endAt ??
      row.end_at ??
      row.stopAt ??
      row.stop_at,
  )
}

export function isUnresolvedLegacyOpenEvent(row = {}) {
  if (!isLegacyOpenEventCandidate(row)) {
    return false
  }

  const linkedWorkdayFound = row.linkedWorkdayFound ?? row.linked_workday_found
  const linkedWorkdayMatchesWorker =
    row.linkedWorkdayMatchesWorker ??
    row.linked_workday_matches_worker
  const linkedWorkdayStatus = text(
    row.linkedWorkdayStatus ??
      row.linked_workday_status,
  ).toUpperCase()
  const linkedWorkdayEndAt = text(
    row.linkedWorkdayEndAt ??
      row.linked_workday_end_at,
  )

  return !(
    linkedWorkdayFound === true &&
    linkedWorkdayMatchesWorker === true &&
    (linkedWorkdayStatus === 'CLOSED' || linkedWorkdayEndAt)
  )
}

export function isClosedWorkdayLegacyOrphan(row = {}) {
  return isLegacyOpenEventCandidate(row) && !isUnresolvedLegacyOpenEvent(row)
}

export function isOrphanOpenCleanEvent(row = {}) {
  if (!isOpenCleanEvent(row)) {
    return false
  }

  const linkedWorkdayFound = row.linkedWorkdayFound ?? row.linked_workday_found
  const linkedWorkdayMatchesWorker =
    row.linkedWorkdayMatchesWorker ??
    row.linked_workday_matches_worker
  const linkedWorkdayStatus = text(
    row.linkedWorkdayStatus ??
      row.linked_workday_status,
  ).toUpperCase()
  const linkedWorkdayEndAt = text(
    row.linkedWorkdayEndAt ??
      row.linked_workday_end_at,
  )

  return !(
    linkedWorkdayFound === true &&
    linkedWorkdayMatchesWorker === true &&
    linkedWorkdayStatus !== 'CLOSED' &&
    !linkedWorkdayEndAt
  )
}

export function groupOpenCleanEventConflicts(rows = []) {
  const groupsByWorker = new Map()

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!isOpenCleanEvent(row)) {
      continue
    }

    const workerKey = openEventWorkerKey(row)
    const recordKey = openEventRecordKey(row)
    let group = groupsByWorker.get(workerKey)
    if (!group) {
      group = {
        workerKey,
        workerLabel: text(row.workerName ?? row.worker_name ?? row.workerLogin ?? row.worker_login) || workerKey,
        rows: [],
        recordIds: new Set(),
      }
      groupsByWorker.set(workerKey, group)
    }

    if (group.recordIds.has(recordKey)) {
      continue
    }
    group.recordIds.add(recordKey)
    group.rows.push(row)
  }

  return [...groupsByWorker.values()]
    .filter((group) => group.rows.length > 1)
    .map((group) => ({
      workerKey: group.workerKey,
      workerLabel: group.workerLabel,
      count: group.rows.length,
      recordIds: [...group.recordIds],
      rows: group.rows.slice(),
    }))
    .sort((left, right) => left.workerLabel.localeCompare(right.workerLabel, 'pl', { sensitivity: 'base' }))
}

export function groupOrphanOpenCleanEvents(rows = []) {
  const explicitRowsByWorker = new Map()

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!isOpenCleanEvent(row)) {
      continue
    }

    const workerKey = openEventWorkerKey(row)
    const recordKey = openEventRecordKey(row)
    let group = explicitRowsByWorker.get(workerKey)
    if (!group) {
      group = {
        workerKey,
        workerLabel: text(row.workerName ?? row.worker_name ?? row.workerLogin ?? row.worker_login) || workerKey,
        rowsById: new Map(),
      }
      explicitRowsByWorker.set(workerKey, group)
    }
    if (!group.rowsById.has(recordKey)) {
      group.rowsById.set(recordKey, row)
    }
  }

  return [...explicitRowsByWorker.values()]
    .filter((group) => group.rowsById.size === 1)
    .map((group) => {
      const rows = [...group.rowsById.values()].filter(isOrphanOpenCleanEvent)
      return {
        workerKey: group.workerKey,
        workerLabel: group.workerLabel,
        count: rows.length,
        recordIds: rows.map(openEventRecordKey),
        rows,
      }
    })
    .filter((group) => group.count > 0)
    .sort((left, right) => left.workerLabel.localeCompare(right.workerLabel, 'pl', { sensitivity: 'base' }))
}

export function groupLegacyOpenEventCandidates(rows = []) {
  const groupsByWorker = new Map()

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!isClosedWorkdayLegacyOrphan(row)) {
      continue
    }

    const workerKey = openEventWorkerKey(row)
    const recordKey = openEventRecordKey(row)
    let group = groupsByWorker.get(workerKey)
    if (!group) {
      group = {
        workerKey,
        workerLabel: text(row.workerName ?? row.worker_name ?? row.workerLogin ?? row.worker_login) || workerKey,
        rows: [],
        recordIds: new Set(),
      }
      groupsByWorker.set(workerKey, group)
    }

    if (group.recordIds.has(recordKey)) {
      continue
    }
    group.recordIds.add(recordKey)
    group.rows.push(row)
  }

  return [...groupsByWorker.values()]
    .map((group) => ({
      workerKey: group.workerKey,
      workerLabel: group.workerLabel,
      count: group.rows.length,
      recordIds: [...group.recordIds],
      rows: group.rows.slice(),
    }))
    .sort((left, right) => left.workerLabel.localeCompare(right.workerLabel, 'pl', { sensitivity: 'base' }))
}

export function groupUnresolvedLegacyOpenEvents(rows = []) {
  const groupsByWorker = new Map()

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!isUnresolvedLegacyOpenEvent(row)) {
      continue
    }

    const workerKey = openEventWorkerKey(row)
    const recordKey = openEventRecordKey(row)
    let group = groupsByWorker.get(workerKey)
    if (!group) {
      group = {
        workerKey,
        workerLabel: text(row.workerName ?? row.worker_name ?? row.workerLogin ?? row.worker_login) || workerKey,
        rows: [],
        recordIds: new Set(),
      }
      groupsByWorker.set(workerKey, group)
    }

    if (group.recordIds.has(recordKey)) {
      continue
    }
    group.recordIds.add(recordKey)
    group.rows.push(row)
  }

  return [...groupsByWorker.values()]
    .map((group) => ({
      workerKey: group.workerKey,
      workerLabel: group.workerLabel,
      count: group.rows.length,
      recordIds: [...group.recordIds],
      rows: group.rows.slice(),
    }))
    .sort((left, right) => left.workerLabel.localeCompare(right.workerLabel, 'pl', { sensitivity: 'base' }))
}

export function filterVisibleUnresolvedLegacyGroups(groups = [], options = {}) {
  const currentDayKey = text(options.currentDayKey)
  const dayKeyFromValue =
    typeof options.dayKeyFromValue === 'function'
      ? options.dayKeyFromValue
      : () => ''

  return (Array.isArray(groups) ? groups : []).filter((group) => {
    const rows = Array.isArray(group?.rows) ? group.rows : []
    const count = Number(group?.count ?? rows.length)

    if (count !== 1 || rows.length !== 1 || !currentDayKey) {
      return true
    }

    const row = rows[0]
    const startAt =
      row?.startAt ??
      row?.start_at ??
      row?.date ??
      row?.eventDate
    const eventDayKey = text(dayKeyFromValue(startAt))

    return !eventDayKey || eventDayKey !== currentDayKey
  })
}

export function findOpenCleanEventForWorker(rows = [], worker = {}, options = {}) {
  const workerKey = openEventWorkerKey(worker)
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
        isOpenCleanEvent(row) &&
        openEventWorkerKey(row) === workerKey &&
        !excludedRecordIds.has(openEventRecordKey(row)),
    ) ?? null
  )
}

export function findBlockingOpenEventForWorker(rows = [], worker = {}, options = {}) {
  const workerKey = openEventWorkerKey(worker)
  if (!workerKey) {
    return null
  }
  const blockUnresolvedLegacy = options.blockUnresolvedLegacy !== false

  const excludedRecordIds = new Set(
    (Array.isArray(options.excludeRecordIds) ? options.excludeRecordIds : [])
      .map(text)
      .filter(Boolean),
  )

  return (
    (Array.isArray(rows) ? rows : []).find(
      (row) =>
        (isOpenCleanEvent(row) || (blockUnresolvedLegacy && isUnresolvedLegacyOpenEvent(row))) &&
        openEventWorkerKey(row) === workerKey &&
        !excludedRecordIds.has(openEventRecordKey(row)),
    ) ?? null
  )
}
