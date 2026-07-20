import { ensureFirebase, isFirebaseConfigured } from '../firebase/firebaseClient'
import { platformContextHeaders } from './platformDataConnectService'

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

let portalTasksEndpointUnavailable = false

const PORTAL_TASKS_FALLBACK_CODES = new Set([
  'DB_CONFIG_MISSING',
  'PORTAL_TASKS_ERROR',
  'PORTAL_TASKS_PROXY_ERROR',
  'UPSTREAM_UNAVAILABLE',
])

function isLocalDevRemoteDisabled() {
  return import.meta.env.DEV && String(import.meta.env.VITE_DISABLE_PORTAL_TASKS_REMOTE ?? '').trim() === '1'
}

function normalizeSearchText(value) {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function isFirebaseHostingOnlyEndpointMessage(value) {
  const lowered = normalizeSearchText(value)
  return (
    lowered.includes('available only via firebase hosting') ||
    lowered.includes('available only through firebase hosting') ||
    (lowered.includes('endpoint') && lowered.includes('only') && lowered.includes('firebase hosting'))
  )
}

function isPortalTasksRouteUnavailable(message, status) {
  const lowered = normalizeSearchText(message)
  if (isFirebaseHostingOnlyEndpointMessage(lowered)) return true
  if (Number(status) === 403 && !lowered) return true
  return (
    Number(status) === 404 &&
    (lowered.includes('portal/tasks') || lowered.includes('/tasks')) &&
    (lowered.includes('not implemented') || lowered.includes('not found') || lowered.includes('page not found'))
  )
}

function isPortalTasksBackendUnavailable({ code = '', isHtml = false, message = '', status = 0 } = {}) {
  const numericStatus = Number(status)
  if ([400, 401, 403].includes(numericStatus)) {
    return false
  }
  if (isPortalTasksRouteUnavailable(message, numericStatus)) {
    return true
  }
  if (numericStatus >= 500) {
    return true
  }
  if (isHtml) {
    return true
  }
  return PORTAL_TASKS_FALLBACK_CODES.has(String(code ?? '').trim().toUpperCase())
}

function shouldSkipPortalTasksRemote() {
  return isLocalDevRemoteDisabled() || portalTasksEndpointUnavailable
}

function warnPortalTasksUnavailable(action, message) {
  console.warn(`[portal/tasks] ${action} uses local fallback; backend unavailable`, message)
}

function disablePortalTasksEndpoint(action, message) {
  portalTasksEndpointUnavailable = true
  warnPortalTasksUnavailable(action, message)
}

async function parsePortalTaskApiError(response, fallbackMessage) {
  let rawText = ''
  try {
    rawText = await response.text()
  } catch {
    rawText = ''
  }

  if (!rawText) {
    const message = fallbackMessage
    return {
      backendUnavailable: isPortalTasksBackendUnavailable({ message, status: response?.status }),
      message,
      routeUnavailable: isPortalTasksRouteUnavailable(rawText, response?.status),
    }
  }

  if (/^\s*</.test(rawText)) {
    const message = 'Endpoint zadan portalu zwrocil HTML zamiast JSON. Sprawdz lokalny backend/proxy /api/portal/tasks.'
    return {
      backendUnavailable: isPortalTasksBackendUnavailable({ isHtml: true, message: rawText, status: response?.status }),
      message,
      routeUnavailable: isPortalTasksRouteUnavailable(rawText, response?.status),
    }
  }

  try {
    const body = JSON.parse(rawText)
    const code = String(body?.error?.code ?? body?.code ?? '').trim()
    const message = String(body?.error?.message ?? body?.message ?? fallbackMessage).trim() || fallbackMessage
    return {
      backendUnavailable: isPortalTasksBackendUnavailable({ code, message, status: response?.status }),
      code,
      message,
      routeUnavailable: isPortalTasksRouteUnavailable(message, response?.status),
    }
  } catch {
    const message = rawText.slice(0, 500) || fallbackMessage
    return {
      backendUnavailable: isPortalTasksBackendUnavailable({ message, status: response?.status }),
      message,
      routeUnavailable: isPortalTasksRouteUnavailable(message, response?.status),
    }
  }
}

async function portalTaskAuthHeaders() {
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
    ...platformContextHeaders(),
  }
}

export async function fetchPortalTasks(orgId) {
  const normalizedOrgId = String(orgId ?? '').trim()
  if (!normalizedOrgId || shouldSkipPortalTasksRemote()) {
    return []
  }

  const headers = await portalTaskAuthHeaders()
  let response
  try {
    response = await fetch(`${getPortalApiBase()}/portal/tasks?orgId=${encodeURIComponent(normalizedOrgId)}`, {
      method: 'GET',
      headers,
    })
  } catch (error) {
    disablePortalTasksEndpoint('load', error?.message || error)
    return []
  }

  if (!response.ok) {
    const error = await parsePortalTaskApiError(response, 'Nie udalo sie pobrac zadan portalu.')
    if (error.backendUnavailable) {
      disablePortalTasksEndpoint('load', error.message)
      return []
    }
    throw new Error(error.message)
  }

  const body = await response.json().catch(() => ({}))
  return Array.isArray(body?.data?.tasks) ? body.data.tasks : []
}

export async function upsertPortalTasks(orgId, tasks = []) {
  const normalizedOrgId = String(orgId ?? '').trim()
  const sourceTasks = Array.isArray(tasks) ? tasks : []
  if (!normalizedOrgId || shouldSkipPortalTasksRemote()) {
    return sourceTasks
  }

  const headers = await portalTaskAuthHeaders()
  let response
  try {
    response = await fetch(`${getPortalApiBase()}/portal/tasks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        orgId: normalizedOrgId,
        tasks: sourceTasks,
      }),
    })
  } catch (error) {
    disablePortalTasksEndpoint('save', error?.message || error)
    return sourceTasks
  }

  if (!response.ok) {
    const error = await parsePortalTaskApiError(response, 'Nie udalo sie zapisac zadan portalu.')
    if (error.backendUnavailable) {
      disablePortalTasksEndpoint('save', error.message)
      return sourceTasks
    }
    throw new Error(error.message)
  }

  const body = await response.json().catch(() => ({}))
  return Array.isArray(body?.data?.tasks) ? body.data.tasks : []
}

export async function deletePortalTasks(orgId, taskIds = []) {
  const normalizedOrgId = String(orgId ?? '').trim()
  const ids = (Array.isArray(taskIds) ? taskIds : [])
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
  if (!normalizedOrgId || !ids.length || shouldSkipPortalTasksRemote()) {
    return []
  }

  const headers = await portalTaskAuthHeaders()
  let response
  try {
    response = await fetch(`${getPortalApiBase()}/portal/tasks`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({
        orgId: normalizedOrgId,
        taskIds: ids,
      }),
    })
  } catch (error) {
    disablePortalTasksEndpoint('delete', error?.message || error)
    return ids
  }

  if (!response.ok) {
    const error = await parsePortalTaskApiError(response, 'Nie udalo sie usunac zadania portalu.')
    if (error.backendUnavailable) {
      disablePortalTasksEndpoint('delete', error.message)
      return ids
    }
    throw new Error(error.message)
  }

  const body = await response.json().catch(() => ({}))
  return Array.isArray(body?.data?.deletedTaskIds) ? body.data.deletedTaskIds : ids
}
