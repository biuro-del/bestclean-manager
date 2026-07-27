const ACTIVE_STATUS = 'ACTIVE'
const SUPPORTED_STATUSES = new Set([ACTIVE_STATUS, 'CANCELLED', 'ARCHIVED'])
const INACTIVE_ALIASES = new Map([
  ['CANCELED', 'CANCELLED'],
  ['ANULOWANE', 'CANCELLED'],
  ['ANULOWANY', 'CANCELLED'],
  ['ARCHIWALNE', 'ARCHIVED'],
  ['ARCHIWALNY', 'ARCHIVED'],
])

function text(value) {
  return String(value ?? '').trim()
}

export function normalizeScheduleOrderLifecycleStatus(value, fallback = ACTIVE_STATUS) {
  const normalized = text(value).toUpperCase()
  const canonical = INACTIVE_ALIASES.get(normalized) || normalized
  return SUPPORTED_STATUSES.has(canonical) ? canonical : fallback
}

export function scheduleOrderLifecycleStatus(order = {}) {
  if (
    order?.cancelledAt ||
    order?.cancelled_at ||
    order?.canceledAt ||
    order?.canceled_at ||
    order?.isCancelled === true ||
    order?.isCanceled === true
  ) {
    return 'CANCELLED'
  }
  if (order?.archivedAt || order?.archived_at || order?.isArchived === true) {
    return 'ARCHIVED'
  }
  return normalizeScheduleOrderLifecycleStatus(
    order?.lifecycleStatus ??
    order?.lifecycle_status ??
    order?.planningStatus ??
    order?.planning_status,
  )
}

export function isScheduleOrderActive(order = {}) {
  return scheduleOrderLifecycleStatus(order) === ACTIVE_STATUS
}

export function filterActiveScheduleOrders(orders = []) {
  return (Array.isArray(orders) ? orders : []).filter((order) => isScheduleOrderActive(order))
}

export const SCHEDULE_ORDER_LIFECYCLE_STATUSES = Object.freeze([
  ACTIVE_STATUS,
  'CANCELLED',
  'ARCHIVED',
])
