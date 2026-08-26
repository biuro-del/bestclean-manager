const MAX_SCHEDULE_ORDER_SAVE_RETRIES = 3
const RETRY_DELAYS_MS = [2_000, 6_000, 18_000]

const NON_RETRYABLE_CODES = new Set([
  'INVALID_ORG_ID',
  'INVALID_JSON',
  'INVALID_TASK_LIFECYCLE_STATUS',
  'JOB_CARD_SCHEMA_MISSING',
  'ORG_ACCESS_MISSING',
  'PORTAL_SCHEDULE_ORDERS_SCHEMA_UNAVAILABLE',
  'PORTAL_SCHEDULE_ORDERS_FAILED',
  'SCHEDULE_ORDER_SQL_PARAMETER_MISMATCH',
  'TASK_LIFECYCLE_SCHEMA_MISSING',
  'TASK_NOT_FOUND',
  'UNAUTHENTICATED',
  'WORKER_SCHEDULE_LOCATION_CONFLICT',
])

export function scheduleOrderSaveRetryDelay(error = {}, retryCount = 0) {
  const status = Number(error?.status)
  const code = String(error?.code ?? '').trim().toUpperCase()
  if (retryCount >= MAX_SCHEDULE_ORDER_SAVE_RETRIES || NON_RETRYABLE_CODES.has(code)) {
    return 0
  }

  if (!Number.isFinite(status) || status === 0) {
    return RETRY_DELAYS_MS[retryCount] || 0
  }

  if (![408, 429, 502, 503, 504].includes(status)) {
    return 0
  }

  return RETRY_DELAYS_MS[retryCount] || 0
}

export { MAX_SCHEDULE_ORDER_SAVE_RETRIES }
