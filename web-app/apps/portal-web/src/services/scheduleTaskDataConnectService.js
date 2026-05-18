import { deleteTaskForOrg, tasksForOrg, upsertTaskForOrg } from '@dataconnect/generated'
import { ensureFirebase, isFirebaseConfigured } from '../firebase/firebaseClient'

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

function jsonString(value, fallback = []) {
  return JSON.stringify(parseJsonValue(value, fallback))
}

function firstJsonValue(fallback, ...values) {
  for (const value of values) {
    if (Array.isArray(value) || (value && typeof value === 'object')) return value
    const text = normalizeText(value)
    if (!text) continue
    const parsed = parseJsonValue(text, null)
    if (parsed != null) return parsed
  }
  return fallback
}

function dateOrdinal(ymd) {
  const value = normalizeDateYmd(ymd)
  if (!value) return null
  return Math.floor(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10))) / 86400000)
}

function timeMinutes(value) {
  const time = normalizeTime(value)
  if (!time) return null
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
}

function durationMinutes(order = {}) {
  const explicit = finiteInteger(order.requiredWorkMinutes ?? order.durationMinutes, null)
  if (Number.isFinite(explicit) && explicit > 0) return explicit

  const startDay = normalizeDateYmd(order.dateYmd)
  const endDay = normalizeDateYmd(order.endDateYmd, startDay)
  const startMinute = timeMinutes(order.startTime)
  const endMinute = timeMinutes(order.endTime)
  const startOrdinal = dateOrdinal(startDay)
  const endOrdinal = dateOrdinal(endDay)
  if (startOrdinal == null || endOrdinal == null || startMinute == null || endMinute == null || endOrdinal < startOrdinal) {
    const hours = finiteNumber(order.durationHours, null)
    return Number.isFinite(hours) && hours > 0 ? Math.round(hours * 60) : null
  }

  const total = (endOrdinal - startOrdinal) * 1440 + endMinute - startMinute
  return total > 0 ? total : null
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
  const workerId = normalizeWorkerId(item.workerId ?? item.worker_id ?? item.id ?? rawKey)
  const name = nullableText(item.name ?? item.workerName ?? item.label ?? item.workerLabel, 240)
  const loweredKey = normalizeText(rawKey || workerId || name).toLowerCase()
  const isBuffer = loweredKey === 'buffer' || loweredKey === 'bufor' || normalizeText(name).toLowerCase() === 'bufor'

  return {
    row: Number.isInteger(row) && row >= 0 ? row : index,
    workerId: isBuffer ? '' : workerId,
    key: isBuffer ? 'buffer' : workerKey(rawKey || workerId),
    name: name || (isBuffer ? 'BUFOR' : workerId),
    workerLogin: nullableText(item.workerLogin ?? item.login, 80) || '',
    allocationMinutes: finiteInteger(item.allocationMinutes ?? item.minutes, null),
  }
}

function allocationsFromOrder(order = {}) {
  const source = firstJsonValue([], order.workAllocations, order.workerAssignments, order.assignedWorkers, order.workers)
  const allocations = (Array.isArray(source) ? source : [])
    .map((item, index) => allocationFromItem(item, index))
    .filter(Boolean)

  if (!allocations.length && Array.isArray(order.assignedRows) && order.assignedRows.length) {
    order.assignedRows.forEach((row, index) => {
      const numericRow = finiteInteger(row, index)
      allocations.push({
        row: Number.isInteger(numericRow) && numericRow >= 0 ? numericRow : index,
        workerId: '',
        key: 'buffer',
        name: normalizeText(order.workerLabel) || 'BUFOR',
        workerLogin: '',
        allocationMinutes: null,
      })
    })
  }

  if (!allocations.length) {
    const workerId = normalizeWorkerId(order.workerId)
    const workerLabel = nullableText(order.workerLabel ?? order.workerName, 240)
    if (workerId || workerLabel) {
      allocations.push({
        row: finiteInteger(order.row, 0) ?? 0,
        workerId,
        key: workerId ? workerKey(workerId) : 'buffer',
        name: workerLabel || workerId || 'BUFOR',
        workerLogin: nullableText(order.workerLogin, 80) || '',
        allocationMinutes: finiteInteger(order.requiredWorkMinutes, null),
      })
    }
  }

  if (!allocations.length) {
    allocations.push({
      row: finiteInteger(order.row, 0) ?? 0,
      workerId: '',
      key: 'buffer',
      name: 'BUFOR',
      workerLogin: '',
      allocationMinutes: null,
    })
  }

  return allocations
}

function currentUserUid() {
  const firebase = ensureFirebase()
  return normalizeText(firebase?.auth?.currentUser?.uid)
}

function requireFirebaseDataConnect() {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase Data Connect.')
  }
  ensureFirebase()
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

let scheduleOrdersEndpointUnavailable = false

function isLocalDevScheduleOrdersRemoteDisabled() {
  return import.meta.env.DEV && normalizeText(import.meta.env.VITE_DISABLE_PORTAL_SCHEDULE_ORDERS_REMOTE) === '1'
}

function shouldSkipScheduleOrdersEndpoint() {
  return isLocalDevScheduleOrdersRemoteDisabled() || scheduleOrdersEndpointUnavailable
}

function isScheduleOrdersRouteUnavailable(message, status) {
  const lowered = normalizeText(message).toLowerCase()
  return (
    Number(status) === 404 &&
    (lowered.includes('schedule-orders') || lowered.includes('/orders')) &&
    (lowered.includes('not implemented') || lowered.includes('not found') || lowered.includes('page not found'))
  )
}

async function parseScheduleOrdersApiError(response, fallbackMessage) {
  let rawText = ''
  try {
    rawText = await response.text()
  } catch {
    rawText = ''
  }

  if (!rawText) {
    return {
      message: fallbackMessage,
      routeUnavailable: isScheduleOrdersRouteUnavailable(fallbackMessage, response?.status),
    }
  }

  if (/^\s*</.test(rawText)) {
    const message = 'Endpoint zlecen zwrocil HTML zamiast JSON. Sprawdz backend/proxy /api/portal/schedule-orders.'
    return {
      message,
      routeUnavailable: isScheduleOrdersRouteUnavailable(rawText, response?.status),
    }
  }

  try {
    const body = JSON.parse(rawText)
    const message = normalizeText(body?.error?.message ?? body?.message ?? fallbackMessage) || fallbackMessage
    return {
      message,
      routeUnavailable: isScheduleOrdersRouteUnavailable(message, response?.status),
    }
  } catch {
    const message = rawText.slice(0, 500) || fallbackMessage
    return {
      message,
      routeUnavailable: isScheduleOrdersRouteUnavailable(message, response?.status),
    }
  }
}

async function scheduleOrderAuthHeaders() {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase.')
  }
  const firebase = ensureFirebase()
  const currentUser = firebase?.auth?.currentUser
  if (!currentUser) {
    throw new Error('Sesja wygasla. Zaloguj sie ponownie.')
  }
  const idToken = await currentUser.getIdToken()
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${idToken}`,
  }
}

async function fetchScheduleTasksViaBackend(orgId) {
  const headers = await scheduleOrderAuthHeaders()
  const response = await fetch(`${getPortalApiBase()}/portal/schedule-orders?orgId=${encodeURIComponent(orgId)}`, {
    method: 'GET',
    headers,
  })
  if (!response.ok) {
    const error = await parseScheduleOrdersApiError(response, 'Nie udalo sie pobrac zlecen.')
    if (error.routeUnavailable) {
      scheduleOrdersEndpointUnavailable = true
      return null
    }
    throw new Error(error.message)
  }
  const body = await response.json().catch(() => ({}))
  return Array.isArray(body?.data?.orders) ? sortScheduleOrders(body.data.orders) : []
}

async function upsertScheduleTasksViaBackend(orgId, orders = []) {
  const headers = await scheduleOrderAuthHeaders()
  const sourceOrders = Array.isArray(orders) ? orders : []
  const response = await fetch(`${getPortalApiBase()}/portal/schedule-orders`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      orgId,
      orders: sourceOrders,
    }),
  })
  if (!response.ok) {
    const error = await parseScheduleOrdersApiError(response, 'Nie udalo sie zapisac zlecen.')
    if (error.routeUnavailable) {
      scheduleOrdersEndpointUnavailable = true
      return null
    }
    throw new Error(error.message)
  }
  const body = await response.json().catch(() => ({}))
  return Array.isArray(body?.data?.orders) ? sortScheduleOrders(body.data.orders) : sourceOrders
}

async function deleteScheduleTasksViaBackend(orgId, orderIds = []) {
  const ids = (Array.isArray(orderIds) ? orderIds : [])
    .map((value) => nullableText(value, 180))
    .filter(Boolean)
  if (!ids.length) return []
  const headers = await scheduleOrderAuthHeaders()
  const response = await fetch(`${getPortalApiBase()}/portal/schedule-orders`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({
      orgId,
      orderIds: ids,
    }),
  })
  if (!response.ok) {
    const error = await parseScheduleOrdersApiError(response, 'Nie udalo sie usunac zlecenia.')
    if (error.routeUnavailable) {
      scheduleOrdersEndpointUnavailable = true
      return null
    }
    throw new Error(error.message)
  }
  const body = await response.json().catch(() => ({}))
  return Array.isArray(body?.data?.deletedOrderIds) ? body.data.deletedOrderIds : ids
}

function normalizeTaskRow(row = {}) {
  const value = (...keys) => pickValue(row, ...keys)
  return {
    orgId: value('orgId', 'org_id'),
    idTask: value('idTask', 'id_task', 'id'),
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

function mapScheduleOrderToTaskVariables(orgId, rawOrder = {}) {
  if (!rawOrder || typeof rawOrder !== 'object' || Array.isArray(rawOrder)) return null

  const idTask = nullableText(rawOrder.idTask ?? rawOrder.id, 180)
  if (!idTask || rawOrder.isDraft) return null

  const nowIso = new Date().toISOString()
  const dateYmd = normalizeDateYmd(rawOrder.dateYmd ?? rawOrder.dateFrom ?? rawOrder.startDate)
  const startTime = normalizeTime(rawOrder.startTime ?? rawOrder.time)
  const endDateYmd = normalizeDateYmd(rawOrder.endDateYmd ?? rawOrder.validUntil ?? rawOrder.dateTo ?? rawOrder.endDate, dateYmd)
  const endTime = normalizeTime(rawOrder.endTime ?? rawOrder.stopTime)
  const allocations = allocationsFromOrder(rawOrder)
  const realAllocations = allocations.filter((item) => normalizeWorkerId(item.workerId))
  const workerIds = uniqueTextValues(realAllocations.map((item) => normalizeWorkerId(item.workerId)))
  const primaryAllocation = realAllocations[0] || null
  const workerLabel = realAllocations.length
    ? realAllocations.map((item) => item.name || item.workerId).filter(Boolean).join(', ')
    : nullableText(rawOrder.workerLabel ?? rawOrder.workerName, 240) || 'BUFOR'
  const objectPlanTasks = firstJsonValue([], rawOrder.objectPlanTasks, rawOrder.tasks, rawOrder.subtasks, rawOrder.activities)
  const supplies = firstJsonValue([], rawOrder.supplies, rawOrder.itemsToTake, rawOrder.suppliesForWorkers)
  const uid = currentUserUid()

  return {
    orgId,
    idTask,
    dateYmd: nullableText(dateYmd, 10),
    startTime: nullableText(startTime, 5),
    endDateYmd: nullableText(endDateYmd, 10),
    endTime: nullableText(endTime, 5),
    scheduleMode:
      nullableText(rawOrder.scheduleMode, 32) || (normalizeText(rawOrder.type) === 'cyclic' || normalizeText(rawOrder.repeatPreset) !== 'none' ? 'repeat' : 'once'),
    accessStartTime: nullableText(normalizeTime(rawOrder.accessStartTime, startTime), 5),
    accessEndTime: nullableText(normalizeTime(rawOrder.accessEndTime, endTime), 5),
    accessWindows: jsonString(rawOrder.accessWindows, []),
    requiredWorkMinutes: durationMinutes({ ...rawOrder, dateYmd, startTime, endDateYmd, endTime }),
    requiredPeople: finiteInteger(rawOrder.requiredPeople, workerIds.length),
    workAllocations: JSON.stringify(allocations),
    workerId: primaryAllocation?.workerId || null,
    workerIds: JSON.stringify(workerIds),
    workerLabel,
    workerName: primaryAllocation?.name || nullableText(rawOrder.workerName, 240),
    workerLogin: primaryAllocation?.workerLogin || nullableText(rawOrder.workerLogin, 80),
    clientId: nullableText(rawOrder.clientId, 64),
    clientLabel: nullableText(rawOrder.clientLabel ?? rawOrder.clientName, 500),
    clientName: nullableText(rawOrder.clientName ?? rawOrder.clientLabel, 500),
    nip: nullableText(rawOrder.nip ?? rawOrder.clientNip, 80),
    street: nullableText(rawOrder.street ?? rawOrder.clientStreet, 500),
    city: nullableText(rawOrder.city ?? rawOrder.clientCity, 160),
    postCode: nullableText(rawOrder.postCode ?? rawOrder.postalCode ?? rawOrder.clientPostCode, 32),
    addressLabel: nullableText(rawOrder.addressLabel, 800),
    executionAddressLabel: nullableText(rawOrder.executionAddressLabel ?? rawOrder.customAddressLabel, 800),
    lat: finiteNumber(rawOrder.lat ?? rawOrder.latitude, null),
    lng: finiteNumber(rawOrder.lng ?? rawOrder.longitude, null),
    zoneId: nullableText(rawOrder.zoneId, 64),
    zoneLabel: nullableText(rawOrder.zoneLabel ?? rawOrder.zoneName, 240),
    repeatPreset: nullableText(rawOrder.repeatPreset, 32),
    repeatEvery: finiteInteger(rawOrder.repeatEvery, null),
    repeatUnit: nullableText(rawOrder.repeatUnit, 16),
    repeatWeekdays: jsonString(rawOrder.repeatWeekdays, []),
    weeklyScheduleRules: jsonString(rawOrder.weeklyScheduleRules, []),
    title: nullableText(rawOrder.title ?? rawOrder.name, 500) || 'Zlecenie',
    type: nullableText(rawOrder.type, 40) || 'other',
    price: finiteNumber(rawOrder.price, 0),
    description: nullableText(rawOrder.description, 4000),
    workerComment: nullableText(rawOrder.workerComment ?? rawOrder.workerOnlyComment, 4000),
    supplies: JSON.stringify(Array.isArray(supplies) ? supplies : []),
    objectPlanTasks: JSON.stringify(Array.isArray(objectPlanTasks) ? objectPlanTasks : []),
    allowExtendedWork: Boolean(rawOrder.allowExtendedWork),
    createdByUid: nullableText(rawOrder.createdByUid ?? rawOrder.createdBy ?? uid, 128),
    updatedByUid: nullableText(uid || rawOrder.updatedByUid || rawOrder.updatedBy, 128),
    createdAt: toIsoTimestamp(rawOrder.createdAt, nowIso),
    updatedAt: nowIso,
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
  const weeklyScheduleRules = parseJsonValue(task.weeklyScheduleRules, [])
  const accessWindows = parseJsonValue(task.accessWindows, [])
  const supplies = parseJsonValue(task.supplies, [])
  const objectPlanTasks = parseJsonValue(task.objectPlanTasks, [])
  const dateYmd = normalizeDateYmd(task.dateYmd)
  const endDateYmd = normalizeDateYmd(task.endDateYmd, dateYmd)
  const createdAt = toIsoTimestamp(task.createdAt)
  const updatedAt = toIsoTimestamp(task.updatedAt, createdAt)

  return {
    id,
    idTask: id,
    isDraft: false,
    recordKind: 'portal-schedule-order',
    row: assignedRows[0] ?? 0,
    assignedRows: assignedRows.length ? assignedRows : [0],
    workerAssignments: allocations,
    dateYmd,
    startTime: normalizeTime(task.startTime, '08:00'),
    endDateYmd,
    endTime: normalizeTime(task.endTime, '09:00'),
    validUntil: endDateYmd,
    nextDate: dateYmd,
    scheduleMode: nullableText(task.scheduleMode, 32) || 'once',
    accessStartTime: normalizeTime(task.accessStartTime),
    accessEndTime: normalizeTime(task.accessEndTime),
    accessWindows: Array.isArray(accessWindows) ? accessWindows : [],
    requiredWorkMinutes: finiteInteger(task.requiredWorkMinutes, null),
    requiredPeople: finiteInteger(task.requiredPeople, 0),
    workAllocations: allocations,
    workerId: nullableText(task.workerId, 64),
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
  return sortScheduleOrders(mapped)
}

async function fetchScheduleTasksViaDataConnect(orgId) {
  const normalizedOrgId = normalizeText(orgId)
  if (!normalizedOrgId) return []

  requireFirebaseDataConnect()
  const response = await tasksForOrg({ orgId: normalizedOrgId }, { fetchPolicy: 'SERVER_ONLY' })
  const rows = Array.isArray(response?.data?.tasks) ? response.data.tasks : []
  if (!Array.isArray(response?.data?.tasks)) {
    console.warn('[portal/schedule-tasks] Data Connect TasksForOrg returned no tasks array', {
      keys: Object.keys(response?.data || {}),
    })
  }
  return mapTaskRowsToScheduleOrders(rows, 'fetch')
}

async function upsertScheduleTasksViaDataConnect(orgId, orders = []) {
  const normalizedOrgId = normalizeText(orgId)
  const sourceOrders = Array.isArray(orders) ? orders : []
  if (!normalizedOrgId) return sourceOrders

  requireFirebaseDataConnect()
  const taskRows = sourceOrders.map((order) => mapScheduleOrderToTaskVariables(normalizedOrgId, order)).filter(Boolean)
  const nextIds = new Set(taskRows.map((row) => nullableText(row?.idTask ?? row?.id_task, 180)).filter(Boolean))
  const remoteOrders = await fetchScheduleTasksViaDataConnect(normalizedOrgId)
  const staleRemoteIds = [
    ...new Set(
      remoteOrders
        .map((order) => nullableText(order?.id ?? order?.idTask, 180))
        .filter((id) => id && !nextIds.has(id)),
    ),
  ]
  for (const idTask of staleRemoteIds) {
    await deleteTaskForOrg({ orgId: normalizedOrgId, idTask })
  }

  const savedRows = []
  for (const taskRow of taskRows) {
    const response = await upsertTaskForOrg(taskRow)
    const returnedRow = response?.data?.task_upsert
    const returnedHasScheduleFields = normalizeText(returnedRow?.dateYmd ?? returnedRow?.date_ymd) || normalizeText(returnedRow?.startTime ?? returnedRow?.start_time)
    savedRows.push(returnedHasScheduleFields ? returnedRow : taskRow)
  }

  const fetchedOrders = await fetchScheduleTasksViaDataConnect(normalizedOrgId)
  if (Array.isArray(fetchedOrders)) return fetchedOrders
  return mapTaskRowsToScheduleOrders(savedRows, 'upsert')
}

async function deleteScheduleTasksViaDataConnect(orgId, orderIds = []) {
  const normalizedOrgId = normalizeText(orgId)
  const ids = (Array.isArray(orderIds) ? orderIds : [])
    .map((value) => nullableText(value, 180))
    .filter(Boolean)
  if (!normalizedOrgId || !ids.length) return []

  requireFirebaseDataConnect()
  for (const idTask of ids) {
    await deleteTaskForOrg({ orgId: normalizedOrgId, idTask })
  }

  return ids
}

export async function fetchScheduleTasks(orgId) {
  const normalizedOrgId = normalizeText(orgId)
  if (!normalizedOrgId) return []

  if (!shouldSkipScheduleOrdersEndpoint()) {
    const backendOrders = await fetchScheduleTasksViaBackend(normalizedOrgId)
    if (backendOrders) return backendOrders
  }

  return fetchScheduleTasksViaDataConnect(normalizedOrgId)
}

export async function upsertScheduleTasks(orgId, orders = []) {
  const normalizedOrgId = normalizeText(orgId)
  const sourceOrders = Array.isArray(orders) ? orders : []
  if (!normalizedOrgId) return sourceOrders

  if (!shouldSkipScheduleOrdersEndpoint()) {
    const backendOrders = await upsertScheduleTasksViaBackend(normalizedOrgId, sourceOrders)
    if (backendOrders) return backendOrders
  }

  return upsertScheduleTasksViaDataConnect(normalizedOrgId, sourceOrders)
}

export async function deleteScheduleTasks(orgId, orderIds = []) {
  const normalizedOrgId = normalizeText(orgId)
  const ids = (Array.isArray(orderIds) ? orderIds : [])
    .map((value) => nullableText(value, 180))
    .filter(Boolean)
  if (!normalizedOrgId || !ids.length) return []

  if (!shouldSkipScheduleOrdersEndpoint()) {
    const deletedIds = await deleteScheduleTasksViaBackend(normalizedOrgId, ids)
    if (deletedIds) return deletedIds
  }

  return deleteScheduleTasksViaDataConnect(normalizedOrgId, ids)
}
