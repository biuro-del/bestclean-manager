'use strict'

const SERVICE_BLOCKS_PAYLOAD_MARKER = 'cleanz_service_blocks_v2'

const CORRELATION_STATUS = Object.freeze({
  MATCHED: 'MATCHED',
  UNMATCHED: 'UNMATCHED',
  AMBIGUOUS: 'AMBIGUOUS',
})

const CORRELATION_REASON = Object.freeze({
  EXACT_IDS_UNIQUE: 'EXACT_IDS_UNIQUE',
  EXACT_IDS_AND_TIME_WINDOW: 'EXACT_IDS_AND_TIME_WINDOW',
  INCOMPLETE_PLAN_IDENTITY: 'INCOMPLETE_PLAN_IDENTITY',
  MISSING_REQUIRED_EXECUTION_FIELDS: 'MISSING_REQUIRED_EXECUTION_FIELDS',
  NO_EXACT_CANDIDATE: 'NO_EXACT_CANDIDATE',
  MULTIPLE_EXACT_CANDIDATES: 'MULTIPLE_EXACT_CANDIDATES',
})

const MATCH_METHOD = Object.freeze({
  EXACT_IDS_UNIQUE: 'EXACT_IDS_UNIQUE',
  EXACT_IDS_AND_TIME_WINDOW: 'EXACT_IDS_AND_TIME_WINDOW',
})

const DATE_YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/
const DEFAULT_TIME_ZONE = 'Europe/Warsaw'

function text(value) {
  return String(value ?? '').trim()
}

function comparisonKey(value) {
  return text(value).toLocaleLowerCase('en-US')
}

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function arrayValue(value) {
  const parsed = parseJson(value, [])
  return Array.isArray(parsed) ? parsed : []
}

function collectArrays(...values) {
  return values.flatMap((value) => arrayValue(value))
}

function validDay(value) {
  const day = text(value)
  if (!DATE_YMD_PATTERN.test(day)) return ''
  const date = new Date(`${day}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day ? '' : day
}

function dayOrdinal(value) {
  const day = validDay(value)
  return day ? Math.floor(new Date(`${day}T00:00:00.000Z`).getTime() / 86400000) : null
}

function dayWeekday(value) {
  const day = validDay(value)
  return day ? new Date(`${day}T00:00:00.000Z`).getUTCDay() : -1
}

function addDays(dayValue, amount) {
  const ordinal = dayOrdinal(dayValue)
  if (!Number.isFinite(ordinal)) return ''
  return new Date((ordinal + Number(amount || 0)) * 86400000).toISOString().slice(0, 10)
}

function normalizedTime(value) {
  const raw = text(value)
  if (TIME_PATTERN.test(raw)) return raw
  const shortMatch = /^(\d|[01]\d|2[0-3]):([0-5]\d)$/.exec(raw)
  return shortMatch ? `${String(Number(shortMatch[1])).padStart(2, '0')}:${shortMatch[2]}` : ''
}

function timeMinutes(value) {
  const time = normalizedTime(value)
  return time ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) : null
}

function zonedDateTimeToIso(dayValue, timeValue, timeZone = DEFAULT_TIME_ZONE) {
  const day = validDay(dayValue)
  const time = normalizedTime(timeValue)
  if (!day || !time) return ''

  const desiredWallTime = Date.UTC(
    Number(day.slice(0, 4)),
    Number(day.slice(5, 7)) - 1,
    Number(day.slice(8, 10)),
    Number(time.slice(0, 2)),
    Number(time.slice(3, 5)),
  )

  let formatter
  try {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: text(timeZone) || DEFAULT_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
  } catch {
    return ''
  }

  let timestamp = desiredWallTime
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(timestamp))
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    )
    const renderedWallTime = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    )
    timestamp += desiredWallTime - renderedWallTime
  }
  return new Date(timestamp).toISOString()
}

function monthClampedDay(baseDay, monthOffset) {
  const day = validDay(baseDay)
  if (!day) return ''
  const year = Number(day.slice(0, 4))
  const month = Number(day.slice(5, 7)) - 1
  const date = Number(day.slice(8, 10))
  const targetMonthIndex = month + Number(monthOffset)
  const targetYear = year + Math.floor(targetMonthIndex / 12)
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12
  const lastDate = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate()
  return new Date(Date.UTC(targetYear, normalizedMonth, Math.min(date, lastDate))).toISOString().slice(0, 10)
}

function uniqueWeekdays(values) {
  return [...new Set(arrayValue(values).map(Number).filter((value) => Number.isInteger(value) && value >= 0 && value <= 6))]
}

function extractServicePayload(task = {}) {
  const rules = collectArrays(task.weeklyScheduleRules, task.weekly_schedule_rules)
  return rules.find(
    (item) => item && typeof item === 'object' && text(item.marker) === SERVICE_BLOCKS_PAYLOAD_MARKER,
  ) || null
}

function extractServiceBlocks(task = {}) {
  const direct = collectArrays(task.serviceBlocks, task.service_blocks)
  if (direct.length) return direct.filter((item) => item && typeof item === 'object')

  const payload = extractServicePayload(task)
  return arrayValue(payload?.serviceBlocks ?? payload?.service_blocks)
    .filter((item) => item && typeof item === 'object')
}

function extractSkippedDays(task = {}) {
  const servicePayload = extractServicePayload(task)
  return new Set(
    collectArrays(
      task.recurrenceSkippedDates,
      task.recurrenceExceptionDates,
      task.skipDates,
      servicePayload?.recurrenceSkippedDates,
      servicePayload?.recurrence_skipped_dates,
    )
      .map(validDay)
      .filter(Boolean),
  )
}

function recurrenceEndDay(task = {}) {
  const servicePayload = extractServicePayload(task)
  return [
    task.repeatUntil,
    task.repeatEndDate,
    task.recurrenceEndDate,
    task.seriesEndDate,
    task.repeatUntilYmd,
    servicePayload?.recurrenceEndDate,
    servicePayload?.recurrence_end_date,
    servicePayload?.repeatUntil,
    servicePayload?.repeat_until,
    servicePayload?.repeatEndDate,
    servicePayload?.repeat_end_date,
  ].map(validDay).find(Boolean) || ''
}

function taskIsRecurring(task = {}) {
  const mode = comparisonKey(task.scheduleMode ?? task.schedule_mode)
  if (mode) return mode === 'repeat'

  const type = comparisonKey(task.type)
  const preset = comparisonKey(task.repeatPreset ?? task.repeat_preset)
  return type === 'cyclic' || Boolean(preset && preset !== 'none')
}

function recurrenceUnit(task = {}) {
  const explicit = comparisonKey(task.repeatUnit ?? task.repeat_unit)
  if (['day', 'week', 'month', 'year'].includes(explicit)) return explicit
  const preset = comparisonKey(task.repeatPreset ?? task.repeat_preset)
  return ['day', 'week', 'month', 'year'].includes(preset) ? preset : 'day'
}

function recurrenceInterval(task = {}) {
  const parsed = Number(task.repeatEvery ?? task.repeat_every)
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(1, Math.floor(parsed)) : 1
}

function recurrenceWeekdays(task = {}, serviceBlocks = []) {
  const blockWeekdays = [
    ...new Set(
      serviceBlocks
        .flatMap((block) => arrayValue(block?.weekdays))
        .map(Number)
        .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
    ),
  ]
  if (blockWeekdays.length) return blockWeekdays

  const taskWeekdays = uniqueWeekdays(task.repeatWeekdays ?? task.repeat_weekdays)
  if (taskWeekdays.length) return taskWeekdays

  const baseWeekday = dayWeekday(task.dateYmd ?? task.date_ymd)
  return baseWeekday >= 0 ? [baseWeekday] : []
}

function taskOccursOn(task = {}, occurrenceDateYmd, serviceBlocks = extractServiceBlocks(task)) {
  const occurrenceDay = validDay(occurrenceDateYmd)
  const baseDay = validDay(task.dateYmd ?? task.date_ymd)
  if (!occurrenceDay || !baseDay) return false
  if (extractSkippedDays(task).has(occurrenceDay)) return false

  const occurrenceOrdinal = dayOrdinal(occurrenceDay)
  const baseOrdinal = dayOrdinal(baseDay)
  if (occurrenceOrdinal < baseOrdinal) return false

  if (!taskIsRecurring(task)) return occurrenceDay === baseDay

  const seriesEnd = recurrenceEndDay(task)
  if (seriesEnd && occurrenceOrdinal > dayOrdinal(seriesEnd)) return false

  const every = recurrenceInterval(task)
  const unit = recurrenceUnit(task)
  if (unit === 'month' || unit === 'year') {
    const baseMonth = Number(baseDay.slice(0, 4)) * 12 + Number(baseDay.slice(5, 7)) - 1
    const occurrenceMonth =
      Number(occurrenceDay.slice(0, 4)) * 12 + Number(occurrenceDay.slice(5, 7)) - 1
    const monthDifference = occurrenceMonth - baseMonth
    const stepMonths = every * (unit === 'year' ? 12 : 1)
    return monthDifference >= 0 &&
      monthDifference % stepMonths === 0 &&
      monthClampedDay(baseDay, monthDifference) === occurrenceDay
  }

  const dayDifference = occurrenceOrdinal - baseOrdinal
  if (unit === 'day') return dayDifference % every === 0

  const baseWeekStart = baseOrdinal - ((dayWeekday(baseDay) + 6) % 7)
  const occurrenceWeekStart = occurrenceOrdinal - ((dayWeekday(occurrenceDay) + 6) % 7)
  const weekDifference = Math.floor((occurrenceWeekStart - baseWeekStart) / 7)
  return weekDifference >= 0 &&
    weekDifference % every === 0 &&
    recurrenceWeekdays(task, serviceBlocks).includes(dayWeekday(occurrenceDay))
}

function serviceBlockId(block = {}) {
  return text(block.serviceBlockId ?? block.service_block_id ?? block.id ?? block.teamId ?? block.team_id)
}

function allocationId(allocation = {}, allowIdFallback = false) {
  return text(
    allocation.allocationId ??
      allocation.allocation_id ??
      allocation.slotId ??
      allocation.slot_id ??
      allocation.workSlotId ??
      allocation.work_slot_id ??
      (allowIdFallback ? allocation.id : ''),
  )
}

function allocationWorker(allocation = {}) {
  return {
    workerId: text(allocation.workerId ?? allocation.worker_id ?? allocation.employeeId ?? allocation.employee_id),
    workerLogin: text(allocation.workerLogin ?? allocation.worker_login ?? allocation.login),
  }
}

function allocationsReferenceSameWorker(left = {}, right = {}) {
  const leftWorker = allocationWorker(left)
  const rightWorker = allocationWorker(right)
  if (leftWorker.workerId && rightWorker.workerId) {
    return leftWorker.workerId === rightWorker.workerId
  }
  if (leftWorker.workerLogin && rightWorker.workerLogin) {
    return comparisonKey(leftWorker.workerLogin) === comparisonKey(rightWorker.workerLogin)
  }
  const leftRow = Number(left.row ?? left.rowIndex ?? left.row_index)
  const rightRow = Number(right.row ?? right.rowIndex ?? right.row_index)
  return Number.isInteger(leftRow) && leftRow >= 0 && leftRow === rightRow
}

function allocationRows(task = {}) {
  return collectArrays(
    task.workAllocations,
    task.work_allocations,
    task.workerAllocations,
    task.worker_allocations,
    task.workerAssignments,
    task.worker_assignments,
  ).filter((item) => item && typeof item === 'object')
}

function blockAllocationRows(block = {}) {
  const allocations = collectArrays(
    block.workAllocations,
    block.work_allocations,
    block.workerAllocations,
    block.worker_allocations,
  ).filter((item) => item && typeof item === 'object')
  const slots = collectArrays(block.slots, block.serviceSlots, block.service_slots)
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({ ...item, __slotIdFallback: true }))
  const detailedRows = [...allocations, ...slots]
  const fallbackAssignments = collectArrays(block.workerAssignments, block.worker_assignments)
    .filter((item) => item && typeof item === 'object')
    .filter(
      (assignment) =>
        !detailedRows.some((row) => allocationsReferenceSameWorker(row, assignment)),
    )
  return [...detailedRows, ...fallbackAssignments]
}

function mergeAllocationRepresentations(rows = []) {
  const merged = new Map()
  const unkeyed = []

  for (const row of rows) {
    const id = allocationId(row, row.__slotIdFallback === true)
    const key = id || text(row.workSlotKey ?? row.work_slot_key ?? row.key)
    if (!key) {
      unkeyed.push(row)
      continue
    }

    const current = merged.get(key)
    if (!current) {
      merged.set(key, row)
      continue
    }

    const currentWorker = allocationWorker(current)
    const nextWorker = allocationWorker(row)
    const workerConflict =
      (currentWorker.workerId && nextWorker.workerId && currentWorker.workerId !== nextWorker.workerId) ||
      (
        currentWorker.workerLogin &&
        nextWorker.workerLogin &&
        comparisonKey(currentWorker.workerLogin) !== comparisonKey(nextWorker.workerLogin)
      )
    if (workerConflict) {
      unkeyed.push(row)
      continue
    }

    const next = { ...current }
    for (const [field, value] of Object.entries(row)) {
      if (value !== undefined && value !== null && value !== '') next[field] = value
    }
    merged.set(key, next)
  }

  return [...merged.values(), ...unkeyed]
}

function blockAppliesOn(block = {}, occurrenceDateYmd, task = {}) {
  const scheduleMode = comparisonKey(block.scheduleMode ?? block.schedule_mode)
  if (scheduleMode === 'once') {
    const blockDay = validDay(
      block.dateYmd ??
        block.date_ymd ??
        block.planDateYmd ??
        block.plan_date_ymd ??
        block.startDateYmd ??
        block.start_date_ymd ??
        task.dateYmd ??
        task.date_ymd,
    )
    return Boolean(blockDay) && blockDay === validDay(occurrenceDateYmd)
  }
  const weekdays = uniqueWeekdays(block.weekdays)
  return !weekdays.length || weekdays.includes(dayWeekday(occurrenceDateYmd))
}

function taskId(task = {}) {
  return text(task.idTask ?? task.id_task ?? task.id ?? task.orderId ?? task.order_id)
}

function taskWorkerAllocation(task = {}) {
  return {
    workerId: text(task.workerId ?? task.worker_id),
    workerLogin: text(task.workerLogin ?? task.worker_login),
    startTime: text(task.startTime ?? task.start_time),
    endTime: text(task.endTime ?? task.end_time),
    allocationMinutes: task.requiredWorkMinutes ?? task.required_work_minutes,
  }
}

function plannedWindow(task, block, allocation, occurrenceDateYmd, timeZone) {
  const baseDay = validDay(task.dateYmd ?? task.date_ymd)
  const sourceStartDay = validDay(
    allocation.dateYmd ??
      allocation.date_ymd ??
      allocation.planDateYmd ??
      allocation.plan_date_ymd ??
      allocation.startDateYmd ??
      allocation.start_date_ymd ??
      block.dateYmd ??
      block.date_ymd ??
      block.planDateYmd ??
      block.plan_date_ymd ??
      baseDay,
  ) || baseDay
  const sourceEndDay = validDay(
    allocation.endDateYmd ??
      allocation.end_date_ymd ??
      allocation.planEndDateYmd ??
      allocation.plan_end_date_ymd ??
      block.endDateYmd ??
      block.end_date_ymd ??
      block.planEndDateYmd ??
      block.plan_end_date_ymd ??
      sourceStartDay,
  ) || sourceStartDay
  const blockIsOnce = comparisonKey(block.scheduleMode ?? block.schedule_mode) === 'once'
  const startOffset =
    !blockIsOnce && Number.isFinite(dayOrdinal(sourceStartDay)) && Number.isFinite(dayOrdinal(baseDay))
      ? dayOrdinal(sourceStartDay) - dayOrdinal(baseDay)
      : 0
  const endOffset = Number.isFinite(dayOrdinal(sourceEndDay)) && Number.isFinite(dayOrdinal(sourceStartDay))
    ? Math.max(0, dayOrdinal(sourceEndDay) - dayOrdinal(sourceStartDay))
    : 0
  const plannedStartDay = addDays(occurrenceDateYmd, startOffset)
  let plannedEndDay = addDays(plannedStartDay, endOffset)
  const startTime = normalizedTime(
    allocation.planStartTime ??
      allocation.plan_start_time ??
      allocation.startTime ??
      allocation.start_time ??
      block.planStartTime ??
      block.plan_start_time ??
      block.startTime ??
      block.start_time ??
      task.startTime ??
      task.start_time,
  )
  const endTime = normalizedTime(
    allocation.planEndTime ??
      allocation.plan_end_time ??
      allocation.endTime ??
      allocation.end_time ??
      block.planEndTime ??
      block.plan_end_time ??
      block.endTime ??
      block.end_time ??
      task.endTime ??
      task.end_time,
  )

  if (startTime && endTime && plannedStartDay === plannedEndDay && timeMinutes(endTime) <= timeMinutes(startTime)) {
    plannedEndDay = addDays(plannedEndDay, 1)
  }

  const plannedStartAt = zonedDateTimeToIso(plannedStartDay, startTime, timeZone)
  const plannedEndAt = zonedDateTimeToIso(plannedEndDay, endTime, timeZone)
  const startTimestamp = Date.parse(plannedStartAt)
  const endTimestamp = Date.parse(plannedEndAt)
  const durationFromWindow =
    Number.isFinite(startTimestamp) && Number.isFinite(endTimestamp) && endTimestamp > startTimestamp
      ? Math.floor((endTimestamp - startTimestamp) / 60000)
      : null
  const explicitDuration = Number(
    allocation.allocationMinutes ??
      allocation.allocation_minutes ??
      allocation.minutes ??
      block.requiredWorkMinutes ??
      block.required_work_minutes ??
      task.requiredWorkMinutes ??
      task.required_work_minutes,
  )

  return {
    plannedStartAt,
    plannedEndAt,
    plannedDurationMinutes:
      durationFromWindow ??
      (Number.isFinite(explicitDuration) && explicitDuration > 0 ? Math.floor(explicitDuration) : null),
  }
}

function candidateFrom(task, block, allocation, occurrenceDateYmd, options = {}) {
  const blockId = serviceBlockId(block) ||
    text(allocation.serviceBlockId ?? allocation.service_block_id ?? allocation.teamId ?? allocation.team_id)
  const slotId = allocationId(allocation, allocation.__slotIdFallback === true)
  const worker = allocationWorker(allocation)
  const id = taskId(task)
  const sourceOrderId = text(
    task.sourceOrderId ?? task.source_order_id ?? task.recurrenceSourceOrderId ?? task.parentOrderId ?? id,
  )
  const recurring = taskIsRecurring(task)
  const timeZone = text(task.timeZone ?? task.timezone ?? options.timeZone) || DEFAULT_TIME_ZONE
  const window = plannedWindow(task, block, allocation, occurrenceDateYmd, timeZone)
  const workSlotKey = text(
    allocation.workSlotKey ??
      allocation.work_slot_key ??
      allocation.key ??
      allocation.slotId ??
      allocation.slot_id ??
      allocation.allocationId ??
      allocation.allocation_id,
  ) || (blockId && slotId ? `block:${blockId}:slot:${slotId}` : slotId)

  return {
    orgId: text(task.orgId ?? task.org_id),
    taskId: id,
    orderId: id,
    sourceOrderId,
    occurrenceDateYmd,
    occurrenceId: recurring ? `${sourceOrderId || id}__repeat__${occurrenceDateYmd}` : id,
    clientId: text(
      allocation.clientId ?? allocation.client_id ?? block.clientId ?? block.client_id ?? task.clientId ?? task.client_id,
    ),
    zoneId: text(
      allocation.zoneId ?? allocation.zone_id ?? block.zoneId ?? block.zone_id ?? task.zoneId ?? task.zone_id,
    ),
    serviceBlockId: blockId,
    allocationId: slotId,
    slotId,
    workSlotKey,
    workerId: worker.workerId,
    workerLogin: worker.workerLogin,
    plannedStartAt: window.plannedStartAt,
    plannedEndAt: window.plannedEndAt,
    plannedDurationMinutes: window.plannedDurationMinutes,
    taskUpdatedAtSnapshot: text(task.updatedAt ?? task.updated_at),
  }
}

function candidateIdentity(candidate = {}) {
  return [
    candidate.orgId,
    candidate.taskId,
    candidate.occurrenceDateYmd,
    candidate.clientId,
    candidate.zoneId,
    candidate.serviceBlockId,
    candidate.allocationId,
    candidate.workSlotKey,
    candidate.workerId,
    comparisonKey(candidate.workerLogin),
    candidate.plannedStartAt,
    candidate.plannedEndAt,
  ].map(text).join('|')
}

function dedupeCandidates(candidates) {
  const unique = new Map()
  for (const candidate of candidates) {
    const key = candidateIdentity(candidate)
    if (!unique.has(key)) unique.set(key, candidate)
  }
  return [...unique.values()]
}

function parseTaskPlanCandidates(task = {}, occurrenceDateYmd, options = {}) {
  const occurrenceDay = validDay(occurrenceDateYmd)
  const blocks = extractServiceBlocks(task)
  if (!occurrenceDay || !taskId(task) || !taskOccursOn(task, occurrenceDay, blocks)) return []

  const globalAllocations = allocationRows(task)
  const candidates = []
  const declaredBlockIds = new Set(blocks.map((block) => serviceBlockId(block)).filter(Boolean))
  const activeBlockIds = new Set()

  for (const block of blocks) {
    const blockId = serviceBlockId(block)
    if (!blockId || !blockAppliesOn(block, occurrenceDay, task)) continue
    activeBlockIds.add(blockId)

    const localRows = blockAllocationRows(block)
    const matchingGlobalRows = globalAllocations.filter((allocation) => {
      const allocationBlockId = text(
        allocation.serviceBlockId ?? allocation.service_block_id ?? allocation.teamId ?? allocation.team_id,
      )
      return allocationBlockId === blockId
    })

    const rows = mergeAllocationRepresentations([...localRows, ...matchingGlobalRows])
    if (!rows.length) {
      const fallbackWorker = taskWorkerAllocation(task)
      if (fallbackWorker.workerId || fallbackWorker.workerLogin) rows.push(fallbackWorker)
    }

    for (const allocation of rows) {
      candidates.push(candidateFrom(task, block, allocation, occurrenceDay, options))
    }
  }

  for (const allocation of globalAllocations) {
    const allocationBlockId = text(
      allocation.serviceBlockId ?? allocation.service_block_id ?? allocation.teamId ?? allocation.team_id,
    )
    if (allocationBlockId && activeBlockIds.has(allocationBlockId)) continue
    if (allocationBlockId && declaredBlockIds.has(allocationBlockId)) continue
    if (
      !allocationBlockId &&
      candidates.some((candidate) => allocationsReferenceSameWorker(candidate, allocation))
    ) {
      continue
    }
    candidates.push(
      candidateFrom(
        task,
        allocationBlockId ? { serviceBlockId: allocationBlockId } : {},
        allocation,
        occurrenceDay,
        options,
      ),
    )
  }

  if (!candidates.length) {
    const fallbackWorker = taskWorkerAllocation(task)
    if (fallbackWorker.workerId || fallbackWorker.workerLogin) {
      candidates.push(candidateFrom(task, {}, fallbackWorker, occurrenceDay, options))
    }
  }

  return dedupeCandidates(candidates)
}

function normalizeCleanStart(cleanStart = {}) {
  const rawScannedAt = text(
    cleanStart.scannedAt ??
      cleanStart.scanned_at ??
      cleanStart.clientScannedAt ??
      cleanStart.client_scanned_at ??
      cleanStart.startAt,
  )
  const scannedTimestamp = Date.parse(rawScannedAt)
  return {
    orgId: text(cleanStart.orgId ?? cleanStart.org_id),
    workerId: text(cleanStart.workerId ?? cleanStart.worker_id ?? cleanStart.employeeId ?? cleanStart.employee_id),
    workerLogin: text(
      cleanStart.workerLogin ?? cleanStart.worker_login ?? cleanStart.login ?? cleanStart.employeeLogin,
    ),
    occurrenceDateYmd: validDay(
      cleanStart.occurrenceDateYmd ??
        cleanStart.occurrence_date_ymd ??
        cleanStart.dateYmd ??
        cleanStart.date_ymd,
    ),
    clientId: text(cleanStart.clientId ?? cleanStart.client_id),
    zoneId: text(cleanStart.zoneId ?? cleanStart.zone_id),
    scannedAt: Number.isFinite(scannedTimestamp) ? new Date(scannedTimestamp).toISOString() : '',
    timeZone: text(cleanStart.timeZone ?? cleanStart.timezone) || DEFAULT_TIME_ZONE,
  }
}

function missingExecutionFields(execution) {
  const missing = []
  if (!execution.orgId) missing.push('orgId')
  if (!execution.workerId && !execution.workerLogin) missing.push('workerIdOrLogin')
  if (!execution.occurrenceDateYmd) missing.push('occurrenceDateYmd')
  if (!execution.clientId) missing.push('clientId')
  if (!execution.zoneId) missing.push('zoneId')
  return missing
}

function workerMatches(execution, candidate) {
  if (execution.workerId && candidate.workerId) {
    return execution.workerId === candidate.workerId
  }
  if (execution.workerLogin && candidate.workerLogin) {
    return comparisonKey(execution.workerLogin) === comparisonKey(candidate.workerLogin)
  }
  return false
}

function exactCandidateMatches(execution, candidate) {
  const placeMatches = candidate.zoneId
    ? candidate.zoneId === execution.zoneId &&
      (!candidate.clientId || candidate.clientId === execution.clientId)
    : Boolean(candidate.clientId) && candidate.clientId === execution.clientId
  return candidate.orgId === execution.orgId &&
    candidate.occurrenceDateYmd === execution.occurrenceDateYmd &&
    placeMatches &&
    workerMatches(execution, candidate)
}

function candidateContainsScannedAt(candidate, scannedAt) {
  const scannedTimestamp = Date.parse(scannedAt)
  const startTimestamp = Date.parse(candidate?.plannedStartAt)
  const endTimestamp = Date.parse(candidate?.plannedEndAt)
  return Number.isFinite(scannedTimestamp) &&
    Number.isFinite(startTimestamp) &&
    Number.isFinite(endTimestamp) &&
    endTimestamp > startTimestamp &&
    scannedTimestamp >= startTimestamp &&
    scannedTimestamp < endTimestamp
}

function incompletePlanIdentityFields(candidate = {}) {
  return [
    !text(candidate.serviceBlockId) && 'serviceBlockId',
    !text(candidate.allocationId) && 'allocationId',
    !text(candidate.workSlotKey) && 'workSlotKey',
    !text(candidate.taskUpdatedAtSnapshot) && 'taskUpdatedAtSnapshot',
  ].filter(Boolean)
}

function incompletePlanIdentityResult(execution, candidate, counts = {}) {
  const candidates = candidate ? [candidate] : []
  return {
    status: CORRELATION_STATUS.UNMATCHED,
    reason: CORRELATION_REASON.INCOMPLETE_PLAN_IDENTITY,
    execution,
    missingFields: [],
    missingPlanIdentityFields: incompletePlanIdentityFields(candidate),
    candidateCount: candidates.length,
    initialCandidateCount: Number(counts.initialCandidateCount ?? candidates.length),
    timeWindowCandidateCount: Number(counts.timeWindowCandidateCount ?? 0),
    matchMethod: null,
    match: null,
    candidates,
  }
}

function correlateCleanStartToPlan({ cleanStart = {}, tasks = [] } = {}) {
  const execution = normalizeCleanStart(cleanStart)
  const missingFields = missingExecutionFields(execution)
  if (missingFields.length) {
    return {
      status: CORRELATION_STATUS.UNMATCHED,
      reason: CORRELATION_REASON.MISSING_REQUIRED_EXECUTION_FIELDS,
      execution,
      missingFields,
      candidateCount: 0,
      initialCandidateCount: 0,
      timeWindowCandidateCount: 0,
      matchMethod: null,
      match: null,
      candidates: [],
    }
  }

  const candidates = dedupeCandidates(
    (Array.isArray(tasks) ? tasks : [])
      .flatMap((task) =>
        parseTaskPlanCandidates(task, execution.occurrenceDateYmd, { timeZone: execution.timeZone }),
      )
      .filter((candidate) => exactCandidateMatches(execution, candidate)),
  )

  if (!candidates.length) {
    return {
      status: CORRELATION_STATUS.UNMATCHED,
      reason: CORRELATION_REASON.NO_EXACT_CANDIDATE,
      execution,
      missingFields: [],
      candidateCount: 0,
      initialCandidateCount: 0,
      timeWindowCandidateCount: 0,
      matchMethod: null,
      match: null,
      candidates: [],
    }
  }

  if (candidates.length === 1) {
    if (incompletePlanIdentityFields(candidates[0]).length) {
      return incompletePlanIdentityResult(execution, candidates[0], {
        initialCandidateCount: 1,
        timeWindowCandidateCount: 0,
      })
    }
    return {
      status: CORRELATION_STATUS.MATCHED,
      reason: CORRELATION_REASON.EXACT_IDS_UNIQUE,
      execution,
      missingFields: [],
      candidateCount: 1,
      initialCandidateCount: 1,
      timeWindowCandidateCount: 0,
      matchMethod: MATCH_METHOD.EXACT_IDS_UNIQUE,
      match: candidates[0],
      candidates,
    }
  }

  const timeWindowCandidates = execution.scannedAt
    ? candidates.filter((candidate) => candidateContainsScannedAt(candidate, execution.scannedAt))
    : []
  if (timeWindowCandidates.length === 1) {
    if (incompletePlanIdentityFields(timeWindowCandidates[0]).length) {
      return incompletePlanIdentityResult(execution, timeWindowCandidates[0], {
        initialCandidateCount: candidates.length,
        timeWindowCandidateCount: 1,
      })
    }
    return {
      status: CORRELATION_STATUS.MATCHED,
      reason: CORRELATION_REASON.EXACT_IDS_AND_TIME_WINDOW,
      execution,
      missingFields: [],
      candidateCount: 1,
      initialCandidateCount: candidates.length,
      timeWindowCandidateCount: 1,
      matchMethod: MATCH_METHOD.EXACT_IDS_AND_TIME_WINDOW,
      match: timeWindowCandidates[0],
      candidates: timeWindowCandidates,
    }
  }

  return {
    status: CORRELATION_STATUS.AMBIGUOUS,
    reason: CORRELATION_REASON.MULTIPLE_EXACT_CANDIDATES,
    execution,
    missingFields: [],
    candidateCount: candidates.length,
    initialCandidateCount: candidates.length,
    timeWindowCandidateCount: timeWindowCandidates.length,
    matchMethod: null,
    match: null,
    candidates,
  }
}

module.exports = {
  CORRELATION_REASON,
  CORRELATION_STATUS,
  MATCH_METHOD,
  correlateCleanStartToPlan,
  extractServiceBlocks,
  normalizeCleanStart,
  parseTaskPlanCandidates,
  taskOccursOn,
}
