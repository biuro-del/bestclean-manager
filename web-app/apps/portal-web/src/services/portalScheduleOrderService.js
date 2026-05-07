import { ensureFirebase, isFirebaseConfigured } from '../firebase/firebaseClient'

function normalizeApiBase(value) {
  const raw = String(value ?? '').trim()
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

async function parsePortalScheduleOrderApiError(response, fallbackMessage) {
  let rawText = ''
  try {
    rawText = await response.text()
  } catch {
    rawText = ''
  }

  if (!rawText) {
    return fallbackMessage
  }

  if (/^\s*</.test(rawText)) {
    return 'Endpoint zleceń grafiku zwrócił HTML zamiast JSON. Sprawdź lokalny backend/proxy /api/portal/schedule-orders.'
  }

  try {
    const body = JSON.parse(rawText)
    return String(body?.error?.message ?? body?.message ?? fallbackMessage).trim() || fallbackMessage
  } catch {
    return rawText.slice(0, 500) || fallbackMessage
  }
}

async function portalScheduleOrderAuthHeaders() {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase.')
  }

  const firebase = ensureFirebase()
  const currentUser = firebase?.auth?.currentUser
  if (!currentUser) {
    throw new Error('Sesja wygasła. Zaloguj się ponownie.')
  }

  const idToken = await currentUser.getIdToken()
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${idToken}`,
  }
}

export async function fetchPortalScheduleOrders(orgId) {
  const normalizedOrgId = String(orgId ?? '').trim()
  if (!normalizedOrgId) {
    return []
  }

  const headers = await portalScheduleOrderAuthHeaders()
  const response = await fetch(`${getPortalApiBase()}/portal/schedule-orders?orgId=${encodeURIComponent(normalizedOrgId)}`, {
    method: 'GET',
    headers,
  })

  if (!response.ok) {
    const message = await parsePortalScheduleOrderApiError(response, 'Nie udało się pobrać zleceń grafiku.')
    throw new Error(message)
  }

  const body = await response.json().catch(() => ({}))
  return Array.isArray(body?.data?.orders) ? body.data.orders : []
}

export async function upsertPortalScheduleOrders(orgId, orders = []) {
  const normalizedOrgId = String(orgId ?? '').trim()
  if (!normalizedOrgId) {
    return []
  }

  const sourceOrders = Array.isArray(orders) ? orders : []
  const headers = await portalScheduleOrderAuthHeaders()
  const response = await fetch(`${getPortalApiBase()}/portal/schedule-orders`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      orgId: normalizedOrgId,
      orders: sourceOrders,
    }),
  })

  if (!response.ok) {
    const message = await parsePortalScheduleOrderApiError(response, 'Nie udało się zapisać zleceń grafiku.')
    throw new Error(message)
  }

  const body = await response.json().catch(() => ({}))
  return Array.isArray(body?.data?.orders) ? body.data.orders : []
}

export async function deletePortalScheduleOrders(orgId, orderIds = []) {
  const normalizedOrgId = String(orgId ?? '').trim()
  const ids = (Array.isArray(orderIds) ? orderIds : [])
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
  if (!normalizedOrgId || !ids.length) {
    return []
  }

  const headers = await portalScheduleOrderAuthHeaders()
  const response = await fetch(`${getPortalApiBase()}/portal/schedule-orders`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({
      orgId: normalizedOrgId,
      orderIds: ids,
    }),
  })

  if (!response.ok) {
    const message = await parsePortalScheduleOrderApiError(response, 'Nie udało się usunąć zlecenia grafiku.')
    throw new Error(message)
  }

  const body = await response.json().catch(() => ({}))
  return Array.isArray(body?.data?.deletedOrderIds) ? body.data.deletedOrderIds : ids
}
