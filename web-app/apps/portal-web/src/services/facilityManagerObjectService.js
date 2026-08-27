import { ensureFirebase, isFirebaseConfigured } from '../firebase/firebaseClient'
import { platformContextHeaders } from './platformDataConnectService'

function text(value) {
  return String(value ?? '').trim()
}

function getPortalApiBase() {
  const raw = text(import.meta.env.VITE_ADMIN_API_BASE || '/api').replace(/\/+$/, '')
  if (!raw || raw === '/') return '/api'
  return raw.endsWith('/api') ? raw : `${raw}/api`
}

async function authHeaders(method = 'GET') {
  if (!isFirebaseConfigured()) throw new Error('Brak konfiguracji Firebase.')
  const user = ensureFirebase()?.auth?.currentUser
  if (!user) throw new Error('Sesja wygasła. Zaloguj się ponownie.')
  return {
    Accept: 'application/json',
    ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
    Authorization: `Bearer ${await user.getIdToken()}`,
    ...platformContextHeaders(),
  }
}

async function parseResponse(response, fallbackMessage) {
  const raw = await response.text().catch(() => '')
  let body = {}
  try {
    body = raw ? JSON.parse(raw) : {}
  } catch {
    body = {}
  }
  if (!response.ok) {
    const error = new Error(text(body?.error?.message || body?.message) || fallbackMessage)
    error.code = text(body?.error?.code || body?.code) || 'FACILITY_MANAGER_OBJECT_REQUEST_FAILED'
    error.status = response.status
    throw error
  }
  return body?.data && typeof body.data === 'object' ? body.data : body
}

export async function listFacilityManagerObjects(orgId) {
  const normalizedOrgId = text(orgId)
  if (!normalizedOrgId) throw new Error('Brak aktywnego panelu zarządcy.')
  const query = new URLSearchParams({ orgId: normalizedOrgId })
  const response = await fetch(`${getPortalApiBase()}/facility-manager/objects?${query.toString()}`, {
    method: 'GET',
    headers: await authHeaders('GET'),
  })
  return parseResponse(response, 'Nie udało się pobrać obiektów.')
}

export async function createFacilityManagerObject(payload = {}) {
  const response = await fetch(`${getPortalApiBase()}/facility-manager/objects`, {
    method: 'POST',
    headers: await authHeaders('POST'),
    body: JSON.stringify(payload),
  })
  return parseResponse(response, 'Nie udało się dodać obiektu.')
}

export async function updateFacilityManagerObject(payload = {}) {
  const response = await fetch(`${getPortalApiBase()}/facility-manager/objects`, {
    method: 'PATCH',
    headers: await authHeaders('PATCH'),
    body: JSON.stringify(payload),
  })
  return parseResponse(response, 'Nie udało się zapisać zmian obiektu.')
}

export async function archiveFacilityManagerObject(payload = {}) {
  const response = await fetch(`${getPortalApiBase()}/facility-manager/objects`, {
    method: 'DELETE',
    headers: await authHeaders('DELETE'),
    body: JSON.stringify(payload),
  })
  return parseResponse(response, 'Nie udało się zarchiwizować obiektu.')
}
