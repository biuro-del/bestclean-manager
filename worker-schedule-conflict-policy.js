'use strict'

const WORKER_SCHEDULE_CONFLICT_CODE = 'WORKER_SCHEDULE_LOCATION_CONFLICT'
const DEFAULT_VALIDATION_HORIZON_DAYS = 400
const MAX_VALIDATION_HORIZON_DAYS = 3660
const ACTIVE_LIFECYCLE_STATUS = 'ACTIVE'
const INACTIVE_LIFECYCLE_STATUSES = new Set(['CANCELLED', 'ARCHIVED'])

function text(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return text(value).toLocaleLowerCase('pl')
}

function normalizeScheduleOrderLifecycleStatus(value, fallback = ACTIVE_LIFECYCLE_STATUS) {
  const normalized = text(value).toUpperCase()
  const canonical =
    normalized === 'CANCELED' || normalized === 'ANULOWANE' || normalized === 'ANULOWANY'
      ? 'CANCELLED'
      : normalized === 'ARCHIWALNE' || normalized === 'ARCHIWALNY'
        ? 'ARCHIVED'
        : normalized
  return canonical === ACTIVE_LIFECYCLE_STATUS || INACTIVE_LIFECYCLE_STATUSES.has(canonical)
    ? canonical
    : fallback
}

function scheduleOrderLifecycleStatus(order = {}) {
  if (
    order.cancelledAt ||
    order.cancelled_at ||
    order.canceledAt ||
    order.canceled_at ||
    order.isCancelled === true ||
    order.isCanceled === true
  ) {
    return 'CANCELLED'
  }
  if (order.archivedAt || order.archived_at || order.isArchived === true) {
    return 'ARCHIVED'
  }
  return normalizeScheduleOrderLifecycleStatus(
    order.lifecycleStatus ??
    order.lifecycle_status ??
    order.planningStatus ??
    order.planning_status,
  )
}

function isScheduleOrderActive(order = {}) {
  return scheduleOrderLifecycleStatus(order) === ACTIVE_LIFECYCLE_STATUS
}

function normalizeDate(value) {
  const candidate = text(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : ''
}

function dateOrdinal(value) {
  const day = normalizeDate(value)
  if (!day) return null
  const timestamp = Date.UTC(
    Number(day.slice(0, 4)),
    Number(day.slice(5, 7)) - 1,
    Number(day.slice(8, 10)),
  )
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 86400000) : null
}

function dateFromOrdinal(value) {
  const ordinal = Number(value)
  if (!Number.isFinite(ordinal)) return ''
  return new Date(Math.floor(ordinal) * 86400000).toISOString().slice(0, 10)
}

function addDays(value, amount) {
  const ordinal = dateOrdinal(value)
  return ordinal == null ? '' : dateFromOrdinal(ordinal + Math.trunc(Number(amount) || 0))
}

function weekday(value) {
  const ordinal = dateOrdinal(value)
  return ordinal == null ? -1 : new Date(ordinal * 86400000).getUTCDay()
}

function startOfWeekOrdinal(value) {
  const ordinal = dateOrdinal(value)
  const day = weekday(value)
  if (ordinal == null || day < 0) return null
  return ordinal - ((day + 6) % 7)
}

function timeMinutes(value, fallback = null) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(text(value))
  return match ? Number(match[1]) * 60 + Number(match[2]) : fallback
}

function integer(value, fallback = null) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback
}

function uniqueWeekdays(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => integer(value, -1))
      .filter((value) => value >= 0 && value <= 6),
  )]
}

function parseJson(value, fallback = []) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return value
  const source = text(value)
  if (!source) return fallback
  try {
    return JSON.parse(source)
  } catch {
    return fallback
  }
}

function servicePayload(order = {}) {
  const rules = parseJson(order.weeklyScheduleRules ?? order.weekly_schedule_rules, [])
  return (Array.isArray(rules) ? rules : []).find(
    (item) => item && typeof item === 'object' && item.marker === 'cleanz_service_blocks_v2',
  ) || null
}

function serviceBlocks(order = {}) {
  const direct = parseJson(order.serviceBlocks ?? order.service_blocks, [])
  if (Array.isArray(direct) && direct.length) return direct
  const payload = servicePayload(order)
  return Array.isArray(payload?.serviceBlocks) ? payload.serviceBlocks : []
}

function orderId(order = {}) {
  return text(order.id ?? order.idTask ?? order.id_task)
}

function orderDate(order = {}) {
  return normalizeDate(
    order.dateYmd ??
    order.date_ymd ??
    order.startDateYmd ??
    order.start_date_ymd ??
    order.startDate,
  )
}

function recurringOverrideInfo(order = {}) {
  const idMatch = /^(.+)__override__(\d{4}-\d{2}-\d{2})$/.exec(orderId(order))
  const sourceOrderId = text(
    order.sourceOrderId ??
    order.recurrenceSourceOrderId ??
    order.parentOrderId ??
    idMatch?.[1],
  )
  const dateYmd = normalizeDate(
    order.recurrenceOriginalDateYmd ??
    order.recurrenceOverrideDateYmd ??
    order.occurrenceDateYmd ??
    idMatch?.[2] ??
    orderDate(order),
  )
  const isOverride =
    Boolean(order.recurrenceOverride) ||
    text(order.recurrenceOverrideKind) === 'single-day' ||
    Boolean(idMatch)
  return isOverride && sourceOrderId && dateYmd ? { sourceOrderId, dateYmd } : null
}

function scheduleMode(order = {}) {
  if (recurringOverrideInfo(order)) return 'once'
  const explicit = normalizeKey(order.scheduleMode ?? order.schedule_mode)
  if (explicit) return explicit
  return normalizeKey(order.type) === 'cyclic' || normalizeKey(order.repeatPreset ?? order.repeat_preset) !== 'none'
    ? 'repeat'
    : 'once'
}

function recurrenceInterval(order = {}) {
  return Math.max(1, integer(order.repeatEvery ?? order.repeat_every, 1) || 1)
}

function recurrenceUnit(order = {}) {
  const unit = normalizeKey(order.repeatUnit ?? order.repeat_unit)
  if (['day', 'week', 'month', 'year'].includes(unit)) return unit
  const preset = normalizeKey(order.repeatPreset ?? order.repeat_preset)
  return ['day', 'week', 'month', 'year'].includes(preset) ? preset : 'day'
}

function repeatWeekdays(order = {}) {
  const fromBlocks = uniqueWeekdays(
    serviceBlocks(order).flatMap((block) => (
      Array.isArray(block?.weekdays) ? block.weekdays : []
    )),
  )
  if (fromBlocks.length) return fromBlocks
  const direct = uniqueWeekdays(parseJson(order.repeatWeekdays ?? order.repeat_weekdays, []))
  if (direct.length) return direct
  const baseWeekday = weekday(orderDate(order))
  return baseWeekday >= 0 ? [baseWeekday] : []
}

function recurrenceEnd(order = {}) {
  const payload = servicePayload(order)
  return [
    order.repeatUntil,
    order.repeatEndDate,
    order.recurrenceEndDate,
    order.seriesEndDate,
    order.repeatUntilYmd,
    payload?.recurrenceEndDate,
  ].map(normalizeDate).find(Boolean) || ''
}

function skippedDates(order = {}) {
  const payload = servicePayload(order)
  return new Set([
    ...(Array.isArray(order.recurrenceSkippedDates) ? order.recurrenceSkippedDates : []),
    ...(Array.isArray(order.recurrenceExceptionDates) ? order.recurrenceExceptionDates : []),
    ...(Array.isArray(order.skipDates) ? order.skipDates : []),
    ...(Array.isArray(payload?.recurrenceSkippedDates) ? payload.recurrenceSkippedDates : []),
  ].map(normalizeDate).filter(Boolean))
}

function addMonthsClamped(value, offset) {
  const day = normalizeDate(value)
  if (!day) return ''
  const year = Number(day.slice(0, 4))
  const month = Number(day.slice(5, 7)) - 1
  const date = Number(day.slice(8, 10))
  const targetIndex = month + Math.trunc(Number(offset) || 0)
  const targetYear = year + Math.floor(targetIndex / 12)
  const targetMonth = ((targetIndex % 12) + 12) % 12
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(date, lastDay)))
    .toISOString()
    .slice(0, 10)
}

function orderOccursOnDay(order = {}, dayValue = '') {
  const day = normalizeDate(dayValue)
  const baseDay = recurringOverrideInfo(order)?.dateYmd || orderDate(order)
  if (!day || !baseDay) return false
  if (scheduleMode(order) !== 'repeat') return day === baseDay

  const dayOrdinal = dateOrdinal(day)
  const baseOrdinal = dateOrdinal(baseDay)
  if (dayOrdinal == null || baseOrdinal == null || dayOrdinal < baseOrdinal) return false
  const endDay = recurrenceEnd(order)
  if (endDay && dayOrdinal > dateOrdinal(endDay)) return false
  if (skippedDates(order).has(day)) return false

  const every = recurrenceInterval(order)
  const unit = recurrenceUnit(order)
  if (unit === 'day') {
    return (dayOrdinal - baseOrdinal) % every === 0
  }
  if (unit === 'week') {
    const baseWeek = startOfWeekOrdinal(baseDay)
    const targetWeek = startOfWeekOrdinal(day)
    if (baseWeek == null || targetWeek == null) return false
    const weekDiff = Math.floor((targetWeek - baseWeek) / 7)
    return weekDiff >= 0 && weekDiff % every === 0 && repeatWeekdays(order).includes(weekday(day))
  }

  const stepMonths = every * (unit === 'year' ? 12 : 1)
  const monthDiff =
    (Number(day.slice(0, 4)) - Number(baseDay.slice(0, 4))) * 12 +
    Number(day.slice(5, 7)) -
    Number(baseDay.slice(5, 7))
  return monthDiff >= 0 && monthDiff % stepMonths === 0 && addMonthsClamped(baseDay, monthDiff) === day
}

function allocationWorkerId(allocation = {}) {
  const candidate = text(allocation.workerId ?? allocation.worker_id)
  return /^W\d+$/i.test(candidate) ? candidate.toUpperCase() : ''
}

function allocationWorkerName(allocation = {}) {
  return text(
    allocation.name ??
    allocation.workerName ??
    allocation.worker_name ??
    allocation.label ??
    allocationWorkerId(allocation),
  )
}

function allocationIdentity(allocation = {}, index = 0) {
  return text(
    allocation.workSlotKey ??
    allocation.work_slot_key ??
    allocation.allocationId ??
    allocation.allocation_id ??
    allocation.slotId ??
    allocation.slot_id ??
    allocation.id ??
    index,
  )
}

function allocationList(value) {
  const parsed = parseJson(value, [])
  return Array.isArray(parsed) ? parsed : []
}

function rootAllocations(order = {}) {
  return allocationList(
    order.workAllocations ??
    order.work_allocations ??
    order.workerAssignments ??
    order.assignedWorkers ??
    order.workers,
  )
}

function blockAllocations(block = {}, root = []) {
  for (const value of [block.workAllocations, block.workerAllocations, block.slots]) {
    const rows = allocationList(value)
    if (rows.length) return rows
  }
  const blockId = text(block.id ?? block.serviceBlockId ?? block.service_block_id)
  return root.filter((allocation) => (
    text(allocation.serviceBlockId ?? allocation.service_block_id ?? allocation.teamId ?? allocation.team_id) === blockId
  ))
}

function blockActiveOnOccurrence(block = {}, order = {}, day = '') {
  const mode = normalizeKey(block.scheduleMode ?? block.mode)
  if (mode === 'once') {
    const blockDay = normalizeDate(
      block.dateYmd ??
      block.planDateYmd ??
      block.startDateYmd ??
      orderDate(order),
    )
    return !blockDay || blockDay === day
  }
  const weekdays = uniqueWeekdays(block.weekdays)
  return !weekdays.length || weekdays.includes(weekday(day))
}

function locationInfo(order = {}) {
  const clientId = text(order.clientId ?? order.client_id)
  const label = text(
    order.clientName ??
    order.client_name ??
    order.clientLabel ??
    order.client_label ??
    order.title ??
    clientId ??
    'Nieznany obiekt',
  ) || 'Nieznany obiekt'
  if (clientId) return { key: `client:${normalizeKey(clientId)}`, label }

  const address = text(
    order.executionAddressLabel ??
    order.execution_address_label ??
    order.addressLabel ??
    order.address_label,
  )
  if (address) return { key: `address:${normalizeKey(address)}`, label }

  const lat = Number(order.lat ?? order.latitude)
  const lng = Number(order.lng ?? order.longitude)
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { key: `gps:${lat.toFixed(5)},${lng.toFixed(5)}`, label }
  }
  return { key: '', label }
}

function intervalFromAllocation(order, block, allocation, day, allocationIndex) {
  const workerId = allocationWorkerId(allocation)
  if (!workerId) return null
  const startMinute = timeMinutes(
    allocation.startTime ??
    allocation.start_time ??
    allocation.planStartTime ??
    allocation.plan_start_time ??
    block?.startTime ??
    block?.start_time ??
    order.startTime ??
    order.start_time,
  )
  let endMinute = timeMinutes(
    allocation.endTime ??
    allocation.end_time ??
    allocation.planEndTime ??
    allocation.plan_end_time ??
    block?.endTime ??
    block?.end_time ??
    order.endTime ??
    order.end_time,
  )
  if (startMinute == null || endMinute == null) return null

  const sourceStartDay = normalizeDate(
    allocation.dateYmd ??
    allocation.planDateYmd ??
    allocation.startDateYmd ??
    block?.dateYmd ??
    block?.planDateYmd ??
    block?.startDateYmd ??
    orderDate(order),
  ) || day
  const sourceEndDay = normalizeDate(
    allocation.endDateYmd ??
    allocation.planEndDateYmd ??
    block?.endDateYmd ??
    block?.planEndDateYmd ??
    order.endDateYmd ??
    order.end_date_ymd,
  ) || sourceStartDay
  const explicitDaySpan = Math.max(0, (dateOrdinal(sourceEndDay) ?? 0) - (dateOrdinal(sourceStartDay) ?? 0))
  if (explicitDaySpan > 0) {
    endMinute += explicitDaySpan * 1440
  } else if (endMinute <= startMinute) {
    endMinute += 1440
  }

  const location = locationInfo(order)
  const baseOrdinal = dateOrdinal(day)
  if (baseOrdinal == null) return null
  const blockId = text(block?.id ?? block?.serviceBlockId ?? block?.service_block_id)
  return {
    key: [
      orderId(order),
      blockId,
      allocationIdentity(allocation, allocationIndex),
      day,
    ].join('::'),
    orderId: orderId(order),
    serviceBlockId: blockId,
    workerId,
    workerName: allocationWorkerName(allocation),
    clientId: text(order.clientId ?? order.client_id),
    locationKey: location.key,
    locationLabel: location.label,
    dateYmd: day,
    startMinute,
    endMinute,
    start: baseOrdinal * 1440 + startMinute,
    end: baseOrdinal * 1440 + endMinute,
    startTime: `${String(Math.floor(startMinute / 60) % 24).padStart(2, '0')}:${String(startMinute % 60).padStart(2, '0')}`,
    endTime: `${String(Math.floor(endMinute / 60) % 24).padStart(2, '0')}:${String(endMinute % 60).padStart(2, '0')}`,
    title: text(order.title ?? order.name ?? location.label ?? orderId(order)) || 'Zlecenie',
  }
}

function allocationIntervalsForDay(order = {}, day = '') {
  if (!orderOccursOnDay(order, day)) return []
  const root = rootAllocations(order)
  const blocks = serviceBlocks(order)
  const intervals = []

  if (blocks.length) {
    blocks
      .filter((block) => block && typeof block === 'object' && blockActiveOnOccurrence(block, order, day))
      .forEach((block) => {
        blockAllocations(block, root).forEach((allocation, index) => {
          const interval = intervalFromAllocation(order, block, allocation, day, index)
          if (interval) intervals.push(interval)
        })
      })
  } else {
    root.forEach((allocation, index) => {
      const interval = intervalFromAllocation(order, null, allocation, day, index)
      if (interval) intervals.push(interval)
    })
  }

  return intervals
}

function validationDays(orders = [], options = {}) {
  const nowYmd = normalizeDate(options.nowYmd) || new Date().toISOString().slice(0, 10)
  const horizonDays = Math.max(
    1,
    Math.min(
      MAX_VALIDATION_HORIZON_DAYS,
      integer(options.horizonDays, DEFAULT_VALIDATION_HORIZON_DAYS) || DEFAULT_VALIDATION_HORIZON_DAYS,
    ),
  )
  const days = new Set()
  for (let offset = 0; offset <= horizonDays; offset += 1) {
    days.add(addDays(nowYmd, offset))
  }

  for (const order of Array.isArray(orders) ? orders : []) {
    const directDay = recurringOverrideInfo(order)?.dateYmd || orderDate(order)
    if (directDay && scheduleMode(order) !== 'repeat' && directDay >= nowYmd) {
      days.add(directDay)
    }
  }
  return [...days].filter(Boolean).sort()
}

function sameKnownLocation(left = {}, right = {}) {
  return Boolean(left.locationKey && right.locationKey && left.locationKey === right.locationKey)
}

function conflictKey(left = {}, right = {}) {
  return [
    left.workerId,
    left.dateYmd,
    [left.key, right.key].sort().join('||'),
  ].join('::')
}

function findWorkerScheduleLocationConflicts(orders = [], options = {}) {
  const sourceOrders = (Array.isArray(orders) ? orders : []).filter(
    (order) => order && typeof order === 'object' && orderId(order) && isScheduleOrderActive(order),
  )
  const intervals = []
  for (const day of validationDays(sourceOrders, options)) {
    for (const order of sourceOrders) {
      intervals.push(...allocationIntervalsForDay(order, day))
    }
  }

  const byWorker = new Map()
  const uniqueIntervals = new Map()
  for (const interval of intervals) {
    if (!interval?.workerId || uniqueIntervals.has(interval.key)) continue
    uniqueIntervals.set(interval.key, interval)
    if (!byWorker.has(interval.workerId)) byWorker.set(interval.workerId, [])
    byWorker.get(interval.workerId).push(interval)
  }

  const conflicts = []
  const seen = new Set()
  for (const workerIntervals of byWorker.values()) {
    workerIntervals.sort((left, right) => left.start - right.start || left.end - right.end || left.key.localeCompare(right.key))
    for (let leftIndex = 0; leftIndex < workerIntervals.length; leftIndex += 1) {
      const left = workerIntervals[leftIndex]
      for (let rightIndex = leftIndex + 1; rightIndex < workerIntervals.length; rightIndex += 1) {
        const right = workerIntervals[rightIndex]
        if (right.start >= left.end) break
        if (left.orderId === right.orderId || sameKnownLocation(left, right)) continue
        if (!(left.start < right.end && right.start < left.end)) continue
        const key = conflictKey(left, right)
        if (seen.has(key)) continue
        seen.add(key)
        conflicts.push({
          key,
          workerId: left.workerId,
          workerName: left.workerName || right.workerName || left.workerId,
          dateYmd: left.dateYmd,
          left: {
            orderId: left.orderId,
            serviceBlockId: left.serviceBlockId,
            title: left.title,
            locationLabel: left.locationLabel,
            startTime: left.startTime,
            endTime: left.endTime,
          },
          right: {
            orderId: right.orderId,
            serviceBlockId: right.serviceBlockId,
            title: right.title,
            locationLabel: right.locationLabel,
            startTime: right.startTime,
            endTime: right.endTime,
          },
        })
        if (conflicts.length >= 100) return conflicts
      }
    }
  }
  return conflicts
}

function conflictPublicMessage(conflict = {}) {
  const worker = text(conflict.workerName ?? conflict.workerId) || 'Pracownik'
  const left = conflict.left ?? {}
  const right = conflict.right ?? {}
  return (
    `Nie mozna zapisac zlecenia. ${worker} ma w tym samym czasie przydzial w innym obiekcie: ` +
    `${text(left.locationLabel) || 'obiekt 1'} ${text(left.startTime)}-${text(left.endTime)} oraz ` +
    `${text(right.locationLabel) || 'obiekt 2'} ${text(right.startTime)}-${text(right.endTime)} ` +
    `(${text(conflict.dateYmd)}).`
  )
}

function assertNoWorkerScheduleLocationConflicts(orders = [], options = {}) {
  const conflicts = findWorkerScheduleLocationConflicts(orders, options)
  if (!conflicts.length) return []
  const error = new Error(WORKER_SCHEDULE_CONFLICT_CODE)
  error.statusCode = 409
  error.publicCode = WORKER_SCHEDULE_CONFLICT_CODE
  error.publicMessage = conflictPublicMessage(conflicts[0])
  error.publicDetails = {
    conflictCount: conflicts.length,
    conflicts: conflicts.slice(0, 20),
    validationHorizonDays: Math.max(
      1,
      Math.min(
        MAX_VALIDATION_HORIZON_DAYS,
        integer(options.horizonDays, DEFAULT_VALIDATION_HORIZON_DAYS) || DEFAULT_VALIDATION_HORIZON_DAYS,
      ),
    ),
  }
  throw error
}

module.exports = {
  DEFAULT_VALIDATION_HORIZON_DAYS,
  WORKER_SCHEDULE_CONFLICT_CODE,
  allocationIntervalsForDay,
  assertNoWorkerScheduleLocationConflicts,
  findWorkerScheduleLocationConflicts,
  isScheduleOrderActive,
  normalizeScheduleOrderLifecycleStatus,
  orderOccursOnDay,
  scheduleOrderLifecycleStatus,
}
