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

let scheduleOrdersEndpointUnavailable = false

function isLocalDevRemoteDisabled() {
  return import.meta.env.DEV && String(import.meta.env.VITE_DISABLE_PORTAL_SCHEDULE_REMOTE ?? '').trim() === '1'
}

function isPortalScheduleOrdersRouteUnavailable(message, status) {
  const lowered = String(message ?? '').toLowerCase()
  return (
    Number(status) === 404 &&
    (lowered.includes('portal/schedule-orders') || lowered.includes('schedule-orders')) &&
    (lowered.includes('not implemented') || lowered.includes('not found') || lowered.includes('page not found'))
  )
}

function shouldSkipPortalScheduleOrdersRemote() {
  return isLocalDevRemoteDisabled() || scheduleOrdersEndpointUnavailable
}

function warnPortalScheduleOrdersUnavailable(action, message) {
  console.warn(`[portal/schedule-orders] ${action} skipped; endpoint unavailable`, message)
}

function disablePortalScheduleOrdersEndpoint(action, message) {
  scheduleOrdersEndpointUnavailable = true
  warnPortalScheduleOrdersUnavailable(action, message)
}

async function parsePortalScheduleOrderApiError(response, fallbackMessage) {
  let rawText = ''
  try {
    rawText = await response.text()
  } catch {
    rawText = ''
  }

  if (!rawText) {
    return {
      message: fallbackMessage,
      routeUnavailable: isPortalScheduleOrdersRouteUnavailable(fallbackMessage, response?.status),
    }
  }

  if (/^\s*</.test(rawText)) {
    const message = 'Endpoint zlecen grafiku zwrocil HTML zamiast JSON. Sprawdz lokalny backend/proxy /api/portal/schedule-orders.'
    return {
      message,
      routeUnavailable: isPortalScheduleOrdersRouteUnavailable(rawText, response?.status),
    }
  }

  try {
    const body = JSON.parse(rawText)
    const message = String(body?.error?.message ?? body?.message ?? fallbackMessage).trim() || fallbackMessage
    return {
      message,
      routeUnavailable: isPortalScheduleOrdersRouteUnavailable(message, response?.status),
    }
  } catch {
    const message = rawText.slice(0, 500) || fallbackMessage
    return {
      message,
      routeUnavailable: isPortalScheduleOrdersRouteUnavailable(message, response?.status),
    }
  }
}

async function portalScheduleOrderAuthHeaders() {
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

export async function fetchPortalScheduleOrders(orgId) {
  const normalizedOrgId = String(orgId ?? '').trim()
  if (!normalizedOrgId || shouldSkipPortalScheduleOrdersRemote()) {
    return []
  }

  const headers = await portalScheduleOrderAuthHeaders()
  const response = await fetch(`${getPortalApiBase()}/portal/schedule-orders?orgId=${encodeURIComponent(normalizedOrgId)}`, {
    method: 'GET',
    headers,
  })

  if (!response.ok) {
    const error = await parsePortalScheduleOrderApiError(response, 'Nie udalo sie pobrac zlecen grafiku.')
    if (error.routeUnavailable) {
      disablePortalScheduleOrdersEndpoint('load', error.message)
      return []
    }
    throw new Error(error.message)
  }

  const body = await response.json().catch(() => ({}))
  return Array.isArray(body?.data?.orders) ? body.data.orders : []
}

export async function upsertPortalScheduleOrders(orgId, orders = []) {
  const normalizedOrgId = String(orgId ?? '').trim()
  const sourceOrders = Array.isArray(orders) ? orders : []
  if (!normalizedOrgId || shouldSkipPortalScheduleOrdersRemote()) {
    return sourceOrders
  }

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
    const error = await parsePortalScheduleOrderApiError(response, 'Nie udalo sie zapisac zlecen grafiku.')
    if (error.routeUnavailable) {
      disablePortalScheduleOrdersEndpoint('save', error.message)
      return sourceOrders
    }
    throw new Error(error.message)
  }

  const body = await response.json().catch(() => ({}))
  return Array.isArray(body?.data?.orders) ? body.data.orders : []
}

export async function deletePortalScheduleOrders(orgId, orderIds = []) {
  const normalizedOrgId = String(orgId ?? '').trim()
  const ids = (Array.isArray(orderIds) ? orderIds : [])
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
  if (!normalizedOrgId || !ids.length || shouldSkipPortalScheduleOrdersRemote()) {
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
    const error = await parsePortalScheduleOrderApiError(response, 'Nie udalo sie usunac zlecenia grafiku.')
    if (error.routeUnavailable) {
      disablePortalScheduleOrdersEndpoint('delete', error.message)
      return ids
    }
    throw new Error(error.message)
  }

  const body = await response.json().catch(() => ({}))
  return Array.isArray(body?.data?.deletedOrderIds) ? body.data.deletedOrderIds : ids
}
