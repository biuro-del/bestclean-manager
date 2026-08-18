import { platformContextHeaders } from './platformDataConnectService'
import { getSession } from '../auth/authService'
import { ensureFirebase, isFirebaseConfigured } from '../firebase/firebaseClient'
import {
  filterActiveScheduleOrders,
  normalizeScheduleOrderLifecycleStatus,
} from './scheduleOrderLifecycle'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function nullableText(value, maxLength = 0) {
  const text = normalizeText(value)
  if (!text) return null
  return maxLength > 0 ? text.slice(0, maxLength) : text
}

function pickValue(source, ...keys) {
  if (!source || typeof source !== 'object') return undefined
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] != null) {
      if (typeof source[key] === 'string' && !source[key].trim()) continue
      return source[key]
    }
  }
  return undefined
}

function normalizeDateYmd(value, fallback = '') {
  const text = normalizeText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback
}

function normalizeTime(value, fallback = '') {
  const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(normalizeText(value))
  return match ? `${match[1]}:${match[2]}` : fallback
}

function finiteNumber(value, fallback = null) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  const text = normalizeText(value).replace(',', '.')
  if (!text) return fallback
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : fallback
}

function finiteInteger(value, fallback = null) {
  const parsed = finiteNumber(value, fallback)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback
}

function toIsoTimestamp(value, fallbackIso = new Date().toISOString()) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString()
  const text = normalizeText(value)
  if (!text) return fallbackIso
  const timestamp = Date.parse(text)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : fallbackIso
}

function parseJsonValue(value, fallback = []) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') return value
  const text = normalizeText(value)
  if (!text) return fallback
  try {
    const parsed = JSON.parse(text)
    return parsed == null ? fallback : parsed
  } catch {
    return fallback
  }
}

const SERVICE_BLOCKS_PAYLOAD_MARKER = 'cleanz_service_blocks_v2'

function serviceBlocksPayloadFromRules(value) {
  const rules = parseJsonValue(value, [])
  const source = Array.isArray(rules) ? rules : []
  return source.find((item) => item && typeof item === 'object' && item.marker === SERVICE_BLOCKS_PAYLOAD_MARKER) || null
}

function weeklyRulesWithoutServicePayload(value) {
  const rules = parseJsonValue(value, [])
  if (!Array.isArray(rules)) return []
  return rules.filter((item) => !(item && typeof item === 'object' && item.marker === SERVICE_BLOCKS_PAYLOAD_MARKER))
}

function normalizeWorkerId(value) {
  const raw = normalizeText(value)
  const lowered = raw.toLowerCase()
  if (!raw || lowered === 'buffer' || lowered === 'bufor') return ''
  const upper = raw.toUpperCase()
  return /^W\d+$/.test(upper) ? upper : raw.slice(0, 64)
}

function workerKey(value) {
  return normalizeText(value).toLowerCase()
}

function isVolatileAllocationKey(value) {
  return /^(row|weekly|slot|buffer|bufor)(:|$)/i.test(normalizeText(value))
}

function uniqueTextValues(values = []) {
  const seen = new Set()
  const result = []
  values.forEach((value) => {
    const text = normalizeText(value)
    const key = text.toLowerCase()
    if (!text || seen.has(key)) return
    seen.add(key)
    result.push(text)
  })
  return result
}

function allocationFromItem(item, index = 0) {
  if (typeof item === 'string') {
    const workerId = normalizeWorkerId(item)
    return workerId
      ? {
          row: index,
          workerId,
          key: workerKey(workerId),
          name: workerId,
          workerLogin: '',
        }
      : null
  }

  if (!item || typeof item !== 'object' || Array.isArray(item)) return null

  const row = finiteInteger(item.row ?? item.rowIndex, index)
  const rawKey = nullableText(item.key ?? item.workerKey ?? item.id, 128)
  const rawWorkerKey = nullableText(item.workerKey, 128) || ''
  const rawId = nullableText(item.id, 128)
  const stableItemId = rawId && !isVolatileAllocationKey(rawId) ? rawId : ''
  const fallbackWorkerId =
    rawKey && !isVolatileAllocationKey(rawKey)
      ? rawKey
      : rawWorkerKey && !isVolatileAllocationKey(rawWorkerKey)
        ? rawWorkerKey
        : ''
  const explicitWorkerId = normalizeWorkerId(item.workerId ?? item.worker_id ?? item.employeeId)
  const workerId = explicitWorkerId || normalizeWorkerId(stableItemId || fallbackWorkerId)
  const name = nullableText(item.name ?? item.workerName ?? item.label ?? item.workerLabel, 240)
  const workerLogin = nullableText(item.workerLogin ?? item.login, 80) || ''
  const loweredKey = normalizeText(rawKey || workerId || name).toLowerCase()
  const allocationType = normalizeText(item.type ?? item.workerType ?? item.kind).toLowerCase()
  const hasWorkerIdentity = Boolean(allocationType === 'worker' || workerId || workerLogin || rawWorkerKey)
  const isBuffer =
    !hasWorkerIdentity &&
    (
      allocationType === 'buffer' ||
      allocationType === 'bufor' ||
      allocationType === 'unassigned' ||
      allocationType === 'empty' ||
      /^slot(:|$)/.test(loweredKey) ||
      loweredKey === 'buffer' ||
      loweredKey === 'bufor' ||
      normalizeText(name).toLowerCase() === 'bufor'
    )
  const allocationMinutes = finiteInteger(item.allocationMinutes ?? item.minutes, null)

  return {
    row: Number.isInteger(row) && row >= 0 ? row : index,
    workerId: isBuffer ? '' : workerId,
    key: isBuffer ? rawKey || 'buffer' : workerKey(workerId || rawKey || name),
    type: isBuffer ? 'unassigned' : (allocationType === 'worker' ? 'worker' : allocationType || 'worker'),
    slotId: nullableText(item.slotId ?? item.slot_id, 128),
    teamId: nullableText(item.teamId ?? item.team_id, 128),
    serviceBlockId: nullableText(item.serviceBlockId ?? item.service_block_id, 128),
    serviceBlockKind: nullableText(item.serviceBlockKind ?? item.service_block_kind, 64),
    serviceBlockLabel: nullableText(item.serviceBlockLabel ?? item.service_block_label, 240),
    name: name || (isBuffer ? 'BUFOR' : workerId),
    workerLogin: isBuffer ? '' : workerLogin,
    workerKey: isBuffer ? '' : rawWorkerKey,
    allocationMinutes,
    minutes: allocationMinutes,
    startTime: nullableText(normalizeTime(item.startTime ?? item.planStartTime), 5),
    endTime: nullableText(normalizeTime(item.endTime ?? item.planEndTime), 5),
    planStartTime: nullableText(normalizeTime(item.planStartTime ?? item.startTime), 5),
    planEndTime: nullableText(normalizeTime(item.planEndTime ?? item.endTime), 5),
  }
}

function normalizeApiBase(value) {
  const raw = normalizeText(value)
  if (!raw) return '/api'
  if (raw.startsWith('/')) {
    const withoutTrailing = raw.replace(/\/+$/, '')
    return withoutTrailing.endsWith('/api') ? withoutTrailing : `${withoutTrailing}/api`
  }
  const withoutTrailing = raw.replace(/\/+$/, '')
  return withoutTrailing.endsWith('/api') ? withoutTrailing : `${withoutTrailing}/api`
}

function getPortalApiBase() {
  return normalizeApiBase(import.meta.env.VITE_ADMIN_API_BASE || '/api')
}

const SCHEDULE_ORDERS_LOAD_TIMEOUT_MS = 12_000

const SCHEDULE_ORDERS_UNAVAILABLE_CODES = new Set([
  'DB_CONFIG_MISSING',
  'PORTAL_SCHEDULE_ORDERS_ERROR',
  'PORTAL_SCHEDULE_ORDERS_PROXY_ERROR',
  'UPSTREAM_UNAVAILABLE',
])

async function fetchScheduleOrdersWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(
    () => controller.abort(),
    SCHEDULE_ORDERS_LOAD_TIMEOUT_MS,
  )
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    })
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}

function currentScheduleSession(orgId = '') {
  const firebase = ensureFirebase()
  const uid = normalizeText(firebase?.auth?.currentUser?.uid)
  const session = getSession()
  const activeOrgId = normalizeText(session?.activeOrgId ?? session?.orgId)
  const requestedOrgId = normalizeText(orgId)

  return {
    activeOrgId,
    key: uid && requestedOrgId ? `${uid}:${requestedOrgId}` : '',
    matches: Boolean(uid && requestedOrgId && activeOrgId === requestedOrgId && normalizeText(session?.uid) === uid),
    requestedOrgId,
    uid,
  }
}

function staleOrganizationError(orgId) {
  const error = new Error('Żądanie dotyczy nieaktywnej organizacji i zostało pominięte.')
  error.code = 'STALE_ORG_CONTEXT'
  error.orgId = normalizeText(orgId)
  return error
}

function requireCurrentScheduleOrganization(orgId) {
  const state = currentScheduleSession(orgId)
  if (!state.matches) {
    throw staleOrganizationError(orgId)
  }
  return state
}

function isScheduleOrdersRouteUnavailable(message, status) {
  const lowered = normalizeText(message).toLowerCase()
  return (
    Number(status) === 404 &&
    (lowered.includes('schedule-orders') || lowered.includes('/orders')) &&
    (lowered.includes('not implemented') || lowered.includes('not found') || lowered.includes('page not found'))
  )
}

function isScheduleOrdersBackendUnavailable({ code = '', isHtml = false, message = '', status = 0 } = {}) {
  const numericStatus = Number(status)
  if ([400, 401, 403].includes(numericStatus)) {
    return false
  }
  if (isScheduleOrdersRouteUnavailable(message, numericStatus)) {
    return true
  }
  if (numericStatus >= 500) {
    return true
  }
  if (isHtml) {
    return true
  }
  return SCHEDULE_ORDERS_UNAVAILABLE_CODES.has(normalizeText(code).toUpperCase())
}

function isScheduleOrdersLocalFileResponse(body) {
  const storage = normalizeText(body?.data?.storage ?? body?.storage).toLowerCase()
  return storage === 'local-file'
}

function scheduleOrdersUnavailableError(message = '') {
  const error = new Error('Grafik zleceń jest chwilowo niedostępny. Spróbuj ponownie później.')
  error.code = 'SCHEDULE_ORDERS_UNAVAILABLE'
  error.details = normalizeText(message).slice(0, 500)
  return error
}

async function parseScheduleOrdersApiError(response, fallbackMessage) {
  let rawText = ''
  try {
    rawText = await response.text()
  } catch {
    rawText = ''
  }

  if (!rawText) {
    const message = fallbackMessage
    return {
      backendUnavailable: isScheduleOrdersBackendUnavailable({ message, status: response?.status }),
      message,
      routeUnavailable: isScheduleOrdersRouteUnavailable(message, response?.status),
      status: response?.status,
    }
  }

  if (/^\s*</.test(rawText)) {
    const message = 'Endpoint zlecen zwrocil HTML zamiast JSON. Sprawdz backend/proxy /api/portal/schedule-orders.'
    return {
      backendUnavailable: isScheduleOrdersBackendUnavailable({ isHtml: true, message: rawText, status: response?.status }),
      message,
      routeUnavailable: isScheduleOrdersRouteUnavailable(rawText, response?.status),
      status: response?.status,
    }
  }

  try {
    const body = JSON.parse(rawText)
    const code = normalizeText(body?.error?.code ?? body?.code)
    const message = normalizeText(body?.error?.message ?? body?.message ?? fallbackMessage) || fallbackMessage
    return {
      backendUnavailable: isScheduleOrdersBackendUnavailable({ code, message, status: response?.status }),
      code,
      details: body?.error?.details ?? body?.details ?? null,
      message,
      routeUnavailable: isScheduleOrdersRouteUnavailable(message, response?.status),
      status: response?.status,
    }
  } catch {
    const message = rawText.slice(0, 500) || fallbackMessage
    return {
      backendUnavailable: isScheduleOrdersBackendUnavailable({ message, status: response?.status }),
      message,
      routeUnavailable: isScheduleOrdersRouteUnavailable(message, response?.status),
      status: response?.status,
    }
  }
}

async function scheduleOrderAuthHeaders({ forceRefresh = false } = {}) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase.')
  }
  const firebase = ensureFirebase()
  const currentUser = firebase?.auth?.currentUser
  if (!currentUser) {
    throw new Error('Sesja wygasla. Zaloguj sie ponownie.')
  }
  const idToken = await currentUser.getIdToken(Boolean(forceRefresh))
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${idToken}`,
    ...platformContextHeaders(),
  }
}

async function confirmActiveOrganizationContext(orgId) {
  const state = requireCurrentScheduleOrganization(orgId)
  const headers = await scheduleOrderAuthHeaders({ forceRefresh: true })
  const response = await fetch(
    `${getPortalApiBase()}/auth/session-context?orgId=${encodeURIComponent(state.requestedOrgId)}`,
    {
      method: 'GET',
      headers,
    },
  )
  if (!response.ok) {
    return false
  }

  const body = await response.json().catch(() => ({}))
  const payload = body?.data && typeof body.data === 'object' ? body.data : body
  const context = payload?.context ?? {}
  return (
    normalizeText(payload?.status).toUpperCase() === 'READY' &&
    normalizeText(context?.uid) === state.uid &&
    normalizeText(context?.activeOrgId) === state.requestedOrgId
  )
}

function isMissingScheduleMembership(error = {}) {
  return Number(error?.status) === 404 && normalizeText(error?.code).toUpperCase() === 'ORG_ACCESS_MISSING'
}

async function fetchScheduleTasksViaBackend(orgId) {
  requireCurrentScheduleOrganization(orgId)
  let membershipConfirmed = false

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const headers = await scheduleOrderAuthHeaders({ forceRefresh: attempt > 0 })
    let response
    try {
      response = await fetchScheduleOrdersWithTimeout(
        `${getPortalApiBase()}/portal/schedule-orders?orgId=${encodeURIComponent(orgId)}`,
        {
          method: 'GET',
          headers,
        },
      )
    } catch (error) {
      throw scheduleOrdersUnavailableError(error?.message || error)
    }

    if (!response.ok) {
      const error = await parseScheduleOrdersApiError(response, 'Nie udalo sie pobrac zlecen.')
      if (attempt === 0 && isMissingScheduleMembership(error)) {
        membershipConfirmed = await confirmActiveOrganizationContext(orgId)
        if (membershipConfirmed) {
          continue
        }
      }
      if (attempt > 0 && membershipConfirmed && isMissingScheduleMembership(error)) {
        throw scheduleOrdersUnavailableError(error.message)
      }
      if (error.backendUnavailable) {
        throw scheduleOrdersUnavailableError(error.message)
      }
      const requestError = new Error(error.message)
      requestError.code = error.code
      requestError.status = error.status
      throw requestError
    }

    const body = await response.json().catch(() => ({}))
    if (isScheduleOrdersLocalFileResponse(body)) {
      throw scheduleOrdersUnavailableError(
        'Backend zlecen zwrocil lokalny plik zamiast danych z bazy.',
      )
    }
    if (!Array.isArray(body?.data?.orders)) {
      throw scheduleOrdersUnavailableError('Endpoint zlecen nie zwrocil data.orders.')
    }
    return sortScheduleOrders(filterActiveScheduleOrders(body.data.orders))
  }

  return null
}

async function upsertScheduleTasksViaBackend(orgId, orders = []) {
  const headers = await scheduleOrderAuthHeaders()
  const sourceOrders = Array.isArray(orders) ? orders : []
  let response
  try {
    response = await fetch(`${getPortalApiBase()}/portal/schedule-orders`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        orgId,
        orders: sourceOrders,
      }),
    })
  } catch (error) {
    const requestError = new Error(
      'Nie mozna bezpiecznie sprawdzic kolizji pracownikow. Zlecenie nie zostalo zapisane.',
    )
    requestError.code = 'SCHEDULE_CONFLICT_VALIDATION_UNAVAILABLE'
    requestError.cause = error
    throw requestError
  }
  if (!response.ok) {
    const error = await parseScheduleOrdersApiError(response, 'Nie udalo sie zapisac zlecen.')
    if (error.backendUnavailable) {
      const requestError = new Error(
        'Nie mozna bezpiecznie sprawdzic kolizji pracownikow. Zlecenie nie zostalo zapisane.',
      )
      requestError.code = 'SCHEDULE_CONFLICT_VALIDATION_UNAVAILABLE'
      requestError.status = error.status
      throw requestError
    }
    const requestError = new Error(error.message)
    requestError.code = error.code
    requestError.details = error.details
    requestError.status = error.status
    throw requestError
  }
  const body = await response.json().catch(() => ({}))
  if (isScheduleOrdersLocalFileResponse(body)) {
    throw scheduleOrdersUnavailableError('Backend zlecen zapisal lokalny plik zamiast bazy.')
  }
  if (!Array.isArray(body?.data?.orders)) {
    throw scheduleOrdersUnavailableError(
      'Endpoint zlecen nie zwrocil potwierdzenia data.orders.',
    )
  }
  return sortScheduleOrders(filterActiveScheduleOrders(body.data.orders))
}

async function setScheduleTaskLifecycleStatusViaBackend(orgId, orderIds = [], lifecycleStatus = '') {
  const ids = [...new Set(
    (Array.isArray(orderIds) ? orderIds : [])
      .map((value) => nullableText(value, 180))
      .filter(Boolean),
  )]
  if (!ids.length) {
    throw new Error('Brak identyfikatora zlecenia do zmiany statusu.')
  }
  const rawStatus = normalizeText(lifecycleStatus).toUpperCase()
  const normalizedStatus = rawStatus === 'CANCELED' ? 'CANCELLED' : rawStatus
  if (!['ACTIVE', 'CANCELLED', 'ARCHIVED'].includes(normalizedStatus)) {
    throw new Error('Dozwolone statusy zlecenia to ACTIVE, CANCELLED i ARCHIVED.')
  }

  const headers = await scheduleOrderAuthHeaders()
  let response
  try {
    response = await fetch(`${getPortalApiBase()}/portal/schedule-orders`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        orgId,
        orderIds: ids,
        lifecycleStatus: normalizedStatus,
      }),
    })
  } catch (error) {
    const requestError = new Error('Nie udało się bezpiecznie zmienić statusu zlecenia.')
    requestError.code = 'SCHEDULE_LIFECYCLE_UPDATE_UNAVAILABLE'
    requestError.cause = error
    throw requestError
  }
  if (!response.ok) {
    const error = await parseScheduleOrdersApiError(response, 'Nie udało się zmienić statusu zlecenia.')
    const requestError = new Error(error.message)
    requestError.code = error.code
    requestError.details = error.details
    requestError.status = error.status
    throw requestError
  }

  const body = await response.json().catch(() => ({}))
  const updatedOrderIds = Array.isArray(body?.data?.updatedOrderIds)
    ? body.data.updatedOrderIds.map((value) => nullableText(value, 180)).filter(Boolean)
    : []
  const updatedSet = new Set(updatedOrderIds)
  const missingIds = ids.filter((id) => !updatedSet.has(id))
  if (missingIds.length || !Array.isArray(body?.data?.orders)) {
    throw new Error('Backend nie potwierdził dokładnej zmiany statusu wszystkich zleceń.')
  }
  return {
    lifecycleStatus: normalizeScheduleOrderLifecycleStatus(body?.data?.lifecycleStatus, normalizedStatus),
    updatedOrderIds,
    orders: sortScheduleOrders(filterActiveScheduleOrders(body.data.orders)),
  }
}

async function deleteScheduleTasksViaBackend(orgId, orderIds = []) {
  const ids = (Array.isArray(orderIds) ? orderIds : [])
    .map((value) => nullableText(value, 180))
    .filter(Boolean)
  if (!ids.length) return []
  const headers = await scheduleOrderAuthHeaders()
  let response
  try {
    response = await fetch(`${getPortalApiBase()}/portal/schedule-orders`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({
        orgId,
        orderIds: ids,
      }),
    })
  } catch (error) {
    throw scheduleOrdersUnavailableError(error?.message || error)
  }
  if (!response.ok) {
    const error = await parseScheduleOrdersApiError(response, 'Nie udalo sie usunac zlecenia.')
    if (error.backendUnavailable) {
      throw scheduleOrdersUnavailableError(error.message)
    }
    throw new Error(error.message)
  }
  const body = await response.json().catch(() => ({}))
  if (isScheduleOrdersLocalFileResponse(body)) {
    throw scheduleOrdersUnavailableError(
      'Backend zlecen usunal lokalny plik zamiast rekordu z bazy.',
    )
  }
  if (!Array.isArray(body?.data?.deletedOrderIds)) {
    throw scheduleOrdersUnavailableError('Endpoint zlecen nie zwrocil data.deletedOrderIds.')
  }
  return body.data.deletedOrderIds
}

function normalizeTaskRow(row = {}) {
  const value = (...keys) => pickValue(row, ...keys)
  return {
    orgId: value('orgId', 'org_id'),
    idTask: value('idTask', 'id_task', 'id'),
    lifecycleStatus: value('lifecycleStatus', 'lifecycle_status', 'planningStatus', 'planning_status'),
    cancelledAt: value('cancelledAt', 'cancelled_at', 'canceledAt', 'canceled_at'),
    archivedAt: value('archivedAt', 'archived_at'),
    dateYmd: value('dateYmd', 'date_ymd', 'dateFrom', 'startDate'),
    startTime: value('startTime', 'start_time', 'time'),
    endDateYmd: value('endDateYmd', 'end_date_ymd', 'validUntil', 'dateTo', 'endDate'),
    endTime: value('endTime', 'end_time', 'stopTime'),
    scheduleMode: value('scheduleMode', 'schedule_mode'),
    accessStartTime: value('accessStartTime', 'access_start_time'),
    accessEndTime: value('accessEndTime', 'access_end_time'),
    accessWindows: value('accessWindows', 'access_windows'),
    requiredWorkMinutes: value('requiredWorkMinutes', 'required_work_minutes', 'durationMinutes'),
    requiredPeople: value('requiredPeople', 'required_people'),
    workAllocations: value('workAllocations', 'work_allocations', 'workerAssignments', 'assignedWorkers', 'workers'),
    workerId: value('workerId', 'worker_id'),
    workerIds: value('workerIds', 'worker_ids'),
    workerLabel: value('workerLabel', 'worker_label', 'workerName'),
    workerName: value('workerName', 'worker_name'),
    workerLogin: value('workerLogin', 'worker_login'),
    clientId: value('clientId', 'client_id'),
    clientLabel: value('clientLabel', 'client_label', 'clientName'),
    clientName: value('clientName', 'client_name', 'clientLabel'),
    nip: value('nip', 'clientNip'),
    street: value('street', 'clientStreet'),
    city: value('city', 'clientCity'),
    postCode: value('postCode', 'post_code', 'postalCode', 'clientPostCode'),
    addressLabel: value('addressLabel', 'address_label'),
    executionAddressLabel: value('executionAddressLabel', 'execution_address_label', 'customAddressLabel'),
    lat: value('lat', 'latitude'),
    lng: value('lng', 'longitude'),
    zoneId: value('zoneId', 'zone_id'),
    zoneLabel: value('zoneLabel', 'zone_label', 'zoneName'),
    repeatPreset: value('repeatPreset', 'repeat_preset'),
    repeatEvery: value('repeatEvery', 'repeat_every'),
    repeatUnit: value('repeatUnit', 'repeat_unit'),
    repeatWeekdays: value('repeatWeekdays', 'repeat_weekdays'),
    weeklyScheduleRules: value('weeklyScheduleRules', 'weekly_schedule_rules'),
    serviceModelVersion: value('serviceModelVersion', 'service_model_version'),
    serviceBlocks: value('serviceBlocks', 'service_blocks'),
    objectAccessWindows: value('objectAccessWindows', 'object_access_windows'),
    title: value('title', 'name'),
    type: value('type'),
    price: value('price'),
    description: value('description'),
    workerComment: value('workerComment', 'worker_comment', 'workerOnlyComment', 'employeeComment', 'appComment', 'mobileComment', 'privateWorkerComment', 'commentForWorkers'),
    supplies: value('supplies', 'itemsToTake', 'suppliesForWorkers'),
    objectPlanTasks: value('objectPlanTasks', 'object_plan_tasks', 'tasks', 'subtasks', 'activities'),
    allowExtendedWork: value('allowExtendedWork', 'allow_extended_work'),
    createdByUid: value('createdByUid', 'created_by_uid', 'createdBy'),
    updatedByUid: value('updatedByUid', 'updated_by_uid', 'updatedBy'),
    createdAt: value('createdAt', 'created_at'),
    updatedAt: value('updatedAt', 'updated_at'),
  }
}

function mapTaskRowToScheduleOrder(row = {}) {
  const task = normalizeTaskRow(row)
  const id = nullableText(task.idTask, 180)
  if (!id) return null

  const workAllocations = parseJsonValue(task.workAllocations, [])
  const allocations = (Array.isArray(workAllocations) ? workAllocations : [])
    .map((item, index) => allocationFromItem(item, index))
    .filter(Boolean)
  const assignedRows = uniqueTextValues(allocations.map((item) => String(item.row))).map((value) => finiteInteger(value, 0)).filter((rowIndex) => Number.isInteger(rowIndex))
  const workerIds = parseJsonValue(task.workerIds, [])
  const repeatWeekdays = parseJsonValue(task.repeatWeekdays, [])
  const servicePayload = serviceBlocksPayloadFromRules(task.weeklyScheduleRules)
  const weeklyScheduleRules = weeklyRulesWithoutServicePayload(task.weeklyScheduleRules)
  const accessWindows = parseJsonValue(task.accessWindows, [])
  const serviceBlocksFromColumn = parseJsonValue(task.serviceBlocks, [])
  const objectAccessWindowsFromColumn = parseJsonValue(task.objectAccessWindows, [])
  const serviceBlocks = Array.isArray(serviceBlocksFromColumn) && serviceBlocksFromColumn.length
    ? serviceBlocksFromColumn
    : Array.isArray(servicePayload?.serviceBlocks)
      ? servicePayload.serviceBlocks
      : []
  const objectAccessWindows = Array.isArray(objectAccessWindowsFromColumn) && objectAccessWindowsFromColumn.length
    ? objectAccessWindowsFromColumn
    : Array.isArray(servicePayload?.objectAccessWindows)
      ? servicePayload.objectAccessWindows
      : accessWindows
  const supplies = parseJsonValue(task.supplies, [])
  const objectPlanTasks = parseJsonValue(task.objectPlanTasks, [])
  const dateYmd = normalizeDateYmd(task.dateYmd)
  const endDateYmd = normalizeDateYmd(task.endDateYmd, dateYmd)
  const scheduleMode = nullableText(task.scheduleMode, 32) || 'once'
  const recurrenceEndDate = normalizeDateYmd(servicePayload?.recurrenceEndDate)
  const recurrenceSkippedDates = (Array.isArray(servicePayload?.recurrenceSkippedDates)
    ? servicePayload.recurrenceSkippedDates
    : []
  )
    .map((value) => normalizeDateYmd(value))
    .filter((value, index, values) => value && values.indexOf(value) === index)
    .sort()
  const recurrenceSourceOrderId = nullableText(servicePayload?.recurrenceSourceOrderId, 180)
  const recurrenceOriginalDateYmd = normalizeDateYmd(servicePayload?.recurrenceOriginalDateYmd)
  const createdAt = toIsoTimestamp(task.createdAt)
  const updatedAt = toIsoTimestamp(task.updatedAt, createdAt)

  return {
    id,
    idTask: id,
    isDraft: false,
    recordKind: 'portal-schedule-order',
    lifecycleStatus: normalizeScheduleOrderLifecycleStatus(task.lifecycleStatus),
    cancelledAt: toIsoTimestamp(task.cancelledAt),
    canceledAt: toIsoTimestamp(task.cancelledAt),
    archivedAt: toIsoTimestamp(task.archivedAt),
    row: assignedRows[0] ?? 0,
    assignedRows: assignedRows.length ? assignedRows : [0],
    workerAssignments: allocations,
    dateYmd,
    startTime: normalizeTime(task.startTime, '08:00'),
    endDateYmd,
    endTime: normalizeTime(task.endTime, '09:00'),
    validUntil: scheduleMode === 'repeat' ? '' : endDateYmd,
    repeatUntil: recurrenceEndDate,
    repeatEndDate: recurrenceEndDate,
    recurrenceEndDate,
    seriesEndDate: recurrenceEndDate,
    recurrenceSkippedDates,
    recurrenceExceptionDates: recurrenceSkippedDates,
    skipDates: recurrenceSkippedDates,
    sourceOrderId: recurrenceSourceOrderId,
    recurrenceSourceOrderId,
    parentOrderId: recurrenceSourceOrderId,
    recurrenceOverride: Boolean(servicePayload?.recurrenceOverride),
    recurrenceOverrideKind: nullableText(servicePayload?.recurrenceOverrideKind, 40),
    recurrenceOriginalDateYmd,
    recurrenceOverrideDateYmd: recurrenceOriginalDateYmd,
    occurrenceDateYmd: recurrenceOriginalDateYmd,
    nextDate: dateYmd,
    scheduleMode,
    accessStartTime: normalizeTime(task.accessStartTime),
    accessEndTime: normalizeTime(task.accessEndTime),
    accessWindows: Array.isArray(objectAccessWindows) ? objectAccessWindows : [],
    objectAccessWindows: Array.isArray(objectAccessWindows) ? objectAccessWindows : [],
    accessTimeWindows: Array.isArray(objectAccessWindows) ? objectAccessWindows : [],
    buildingAccessWindows: Array.isArray(objectAccessWindows) ? objectAccessWindows : [],
    requiredWorkMinutes: finiteInteger(task.requiredWorkMinutes, null),
    requiredPeople: finiteInteger(task.requiredPeople, 0),
    workAllocations: allocations,
    workerId: nullableText(task.workerId, 128),
    workerIds: Array.isArray(workerIds) ? workerIds : [],
    workerLabel: nullableText(task.workerLabel, 500) || 'BUFOR',
    workerName: nullableText(task.workerName, 240),
    workerLogin: nullableText(task.workerLogin, 80),
    clientId: nullableText(task.clientId, 64),
    clientLabel: nullableText(task.clientLabel ?? task.clientName, 500),
    clientName: nullableText(task.clientName ?? task.clientLabel, 500),
    nip: nullableText(task.nip, 80),
    clientNip: nullableText(task.nip, 80),
    street: nullableText(task.street, 500),
    clientStreet: nullableText(task.street, 500),
    city: nullableText(task.city, 160),
    clientCity: nullableText(task.city, 160),
    postCode: nullableText(task.postCode, 32),
    postalCode: nullableText(task.postCode, 32),
    clientPostCode: nullableText(task.postCode, 32),
    addressLabel: nullableText(task.addressLabel, 800),
    executionAddressLabel: nullableText(task.executionAddressLabel, 800),
    customAddressLabel: nullableText(task.executionAddressLabel, 800),
    lat: task.lat ?? '',
    lng: task.lng ?? '',
    zoneId: nullableText(task.zoneId, 64),
    zoneLabel: nullableText(task.zoneLabel, 240),
    repeatPreset: nullableText(task.repeatPreset, 32),
    repeatEvery: finiteInteger(task.repeatEvery, null),
    repeatUnit: nullableText(task.repeatUnit, 16),
    repeatWeekdays: Array.isArray(repeatWeekdays) ? repeatWeekdays : [],
    weeklyScheduleRules: Array.isArray(weeklyScheduleRules) ? weeklyScheduleRules : [],
    serviceModelVersion: finiteInteger(task.serviceModelVersion ?? servicePayload?.version, serviceBlocks.length ? 2 : null),
    serviceBlocks: Array.isArray(serviceBlocks) ? serviceBlocks : [],
    title: nullableText(task.title, 500) || 'Zlecenie',
    type: nullableText(task.type, 40) || 'other',
    price: finiteNumber(task.price, 0),
    description: nullableText(task.description, 4000),
    workerComment: nullableText(task.workerComment, 4000),
    workerOnlyComment: nullableText(task.workerComment, 4000),
    employeeComment: nullableText(task.workerComment, 4000),
    appComment: nullableText(task.workerComment, 4000),
    mobileComment: nullableText(task.workerComment, 4000),
    privateWorkerComment: nullableText(task.workerComment, 4000),
    commentForWorkers: nullableText(task.workerComment, 4000),
    supplies: Array.isArray(supplies) ? supplies : [],
    itemsToTake: Array.isArray(supplies) ? supplies : [],
    suppliesForWorkers: Array.isArray(supplies) ? supplies : [],
    objectPlanTasks: Array.isArray(objectPlanTasks) ? objectPlanTasks : [],
    tasks: Array.isArray(objectPlanTasks) ? objectPlanTasks : [],
    subtasks: Array.isArray(objectPlanTasks) ? objectPlanTasks : [],
    activities: Array.isArray(objectPlanTasks) ? objectPlanTasks : [],
    allowExtendedWork: Boolean(task.allowExtendedWork),
    createdByUid: nullableText(task.createdByUid, 128),
    updatedByUid: nullableText(task.updatedByUid, 128),
    createdAt,
    updatedAt,
  }
}

function taskRowDebugSample(row = {}) {
  const task = normalizeTaskRow(row)
  return {
    keys: Object.keys(row).slice(0, 40),
    idTask: nullableText(task.idTask, 180),
    orgId: nullableText(task.orgId, 64),
    dateYmd: normalizeText(task.dateYmd),
    startTime: normalizeText(task.startTime),
  }
}

function sortScheduleOrders(orders = []) {
  return [...orders].sort((left, right) => {
    const leftDate = normalizeText(left?.dateYmd || left?.date || left?.startDate)
    const rightDate = normalizeText(right?.dateYmd || right?.date || right?.startDate)
    if (leftDate !== rightDate) return leftDate.localeCompare(rightDate)
    const leftTime = normalizeText(left?.startTime || left?.time)
    const rightTime = normalizeText(right?.startTime || right?.time)
    if (leftTime !== rightTime) return leftTime.localeCompare(rightTime)
    return normalizeText(left?.id).localeCompare(normalizeText(right?.id))
  })
}

function mapTaskRowsToScheduleOrders(rows = [], context = 'fetch') {
  const mapped = rows.map((row) => mapTaskRowToScheduleOrder(row)).filter(Boolean)
  if (rows.length && !mapped.length) {
    console.warn('[portal/schedule-tasks] Data Connect returned task rows but none mapped', {
      context,
      count: rows.length,
      sample: taskRowDebugSample(rows[0]),
    })
  }
  return sortScheduleOrders(filterActiveScheduleOrders(mapped))
}

export async function fetchScheduleTasks(orgId) {
  const normalizedOrgId = normalizeText(orgId)
  if (!normalizedOrgId) return []

  try {
    requireCurrentScheduleOrganization(normalizedOrgId)
  } catch (error) {
    if (error?.code === 'STALE_ORG_CONTEXT') {
      return []
    }
    throw error
  }

  return fetchScheduleTasksViaBackend(normalizedOrgId)
}

export async function upsertScheduleTasks(orgId, orders = []) {
  const normalizedOrgId = normalizeText(orgId)
  const sourceOrders = Array.isArray(orders) ? orders : []
  if (!normalizedOrgId) return sourceOrders

  requireCurrentScheduleOrganization(normalizedOrgId)

  return upsertScheduleTasksViaBackend(normalizedOrgId, sourceOrders)
}

export async function setScheduleTaskLifecycleStatus(orgId, orderIds = [], lifecycleStatus = '') {
  const normalizedOrgId = normalizeText(orgId)
  if (!normalizedOrgId) {
    throw new Error('Brak organizacji do zmiany statusu zlecenia.')
  }
  requireCurrentScheduleOrganization(normalizedOrgId)
  return setScheduleTaskLifecycleStatusViaBackend(normalizedOrgId, orderIds, lifecycleStatus)
}

export async function deleteScheduleTasks(orgId, orderIds = []) {
  const normalizedOrgId = normalizeText(orgId)
  const ids = (Array.isArray(orderIds) ? orderIds : [])
    .map((value) => nullableText(value, 180))
    .filter(Boolean)
  if (!normalizedOrgId || !ids.length) return []

  requireCurrentScheduleOrganization(normalizedOrgId)

  return deleteScheduleTasksViaBackend(normalizedOrgId, ids)
}
