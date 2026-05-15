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

let portalTasksEndpointUnavailable = false

function isLocalDevRemoteDisabled() {
  return import.meta.env.DEV && String(import.meta.env.VITE_DISABLE_PORTAL_TASKS_REMOTE ?? '').trim() === '1'
}

function isPortalTasksRouteUnavailable(message, status) {
  const lowered = String(message ?? '').toLowerCase()
  return (
    Number(status) === 404 &&
    (lowered.includes('portal/tasks') || lowered.includes('/tasks')) &&
    (lowered.includes('not implemented') || lowered.includes('not found') || lowered.includes('page not found'))
  )
}

function shouldSkipPortalTasksRemote() {
  return isLocalDevRemoteDisabled() || portalTasksEndpointUnavailable
}

function warnPortalTasksUnavailable(action, message) {
  console.warn(`[portal/tasks] ${action} skipped; endpoint unavailable`, message)
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
    return {
      message: fallbackMessage,
      routeUnavailable: isPortalTasksRouteUnavailable(fallbackMessage, response?.status),
    }
  }

  if (/^\s*</.test(rawText)) {
    const message = 'Endpoint zadan portalu zwrocil HTML zamiast JSON. Sprawdz lokalny backend/proxy /api/portal/tasks.'
    return {
      message,
      routeUnavailable: isPortalTasksRouteUnavailable(rawText, response?.status),
    }
  }

  try {
    const body = JSON.parse(rawText)
    const message = String(body?.error?.message ?? body?.message ?? fallbackMessage).trim() || fallbackMessage
    return {
      message,
      routeUnavailable: isPortalTasksRouteUnavailable(message, response?.status),
    }
  } catch {
    const message = rawText.slice(0, 500) || fallbackMessage
    return {
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
  }
}

export async function fetchPortalTasks(orgId) {
  const normalizedOrgId = String(orgId ?? '').trim()
  if (!normalizedOrgId || shouldSkipPortalTasksRemote()) {
    return []
  }

  const headers = await portalTaskAuthHeaders()
  const response = await fetch(`${getPortalApiBase()}/portal/tasks?orgId=${encodeURIComponent(normalizedOrgId)}`, {
    method: 'GET',
    headers,
  })

  if (!response.ok) {
    const error = await parsePortalTaskApiError(response, 'Nie udalo sie pobrac zadan portalu.')
    if (error.routeUnavailable) {
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
  const response = await fetch(`${getPortalApiBase()}/portal/tasks`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      orgId: normalizedOrgId,
      tasks: sourceTasks,
    }),
  })

  if (!response.ok) {
    const error = await parsePortalTaskApiError(response, 'Nie udalo sie zapisac zadan portalu.')
    if (error.routeUnavailable) {
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
  const response = await fetch(`${getPortalApiBase()}/portal/tasks`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({
      orgId: normalizedOrgId,
      taskIds: ids,
    }),
  })

  if (!response.ok) {
    const error = await parsePortalTaskApiError(response, 'Nie udalo sie usunac zadania portalu.')
    if (error.routeUnavailable) {
      disablePortalTasksEndpoint('delete', error.message)
      return ids
    }
    throw new Error(error.message)
  }

  const body = await response.json().catch(() => ({}))
  return Array.isArray(body?.data?.deletedTaskIds) ? body.data.deletedTaskIds : ids
}
