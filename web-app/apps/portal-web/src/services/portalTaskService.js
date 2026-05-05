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

async function parsePortalTaskApiError(response, fallbackMessage) {
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
    return 'Endpoint zadań portalu zwrócił HTML zamiast JSON. Sprawdź lokalny backend/proxy /api/portal/tasks.'
  }

  try {
    const body = JSON.parse(rawText)
    return String(body?.error?.message ?? body?.message ?? fallbackMessage).trim() || fallbackMessage
  } catch {
    return rawText.slice(0, 500) || fallbackMessage
  }
}

async function portalTaskAuthHeaders() {
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

export async function fetchPortalTasks(orgId) {
  const normalizedOrgId = String(orgId ?? '').trim()
  if (!normalizedOrgId) {
    return []
  }

  const headers = await portalTaskAuthHeaders()
  const response = await fetch(`${getPortalApiBase()}/portal/tasks?orgId=${encodeURIComponent(normalizedOrgId)}`, {
    method: 'GET',
    headers,
  })

  if (!response.ok) {
    const message = await parsePortalTaskApiError(response, 'Nie udało się pobrać zadań portalu.')
    throw new Error(message)
  }

  const body = await response.json().catch(() => ({}))
  return Array.isArray(body?.data?.tasks) ? body.data.tasks : []
}

export async function upsertPortalTasks(orgId, tasks = []) {
  const normalizedOrgId = String(orgId ?? '').trim()
  if (!normalizedOrgId) {
    return []
  }

  const sourceTasks = Array.isArray(tasks) ? tasks : []
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
    const message = await parsePortalTaskApiError(response, 'Nie udało się zapisać zadań portalu.')
    throw new Error(message)
  }

  const body = await response.json().catch(() => ({}))
  return Array.isArray(body?.data?.tasks) ? body.data.tasks : []
}

export async function deletePortalTasks(orgId, taskIds = []) {
  const normalizedOrgId = String(orgId ?? '').trim()
  const ids = (Array.isArray(taskIds) ? taskIds : [])
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
  if (!normalizedOrgId || !ids.length) {
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
    const message = await parsePortalTaskApiError(response, 'Nie udało się usunąć zadania portalu.')
    throw new Error(message)
  }

  const body = await response.json().catch(() => ({}))
  return Array.isArray(body?.data?.deletedTaskIds) ? body.data.deletedTaskIds : ids
}
