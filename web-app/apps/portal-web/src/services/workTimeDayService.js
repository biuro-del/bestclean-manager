import { ensureFirebase, isFirebaseConfigured } from '../firebase/firebaseClient'
import { platformContextHeaders } from './platformDataConnectService'

function apiBase() {
  const raw = String(import.meta.env.VITE_ADMIN_API_BASE || '/api').trim().replace(/\/+$/, '')
  if (!raw) return '/api'
  return raw.endsWith('/api') ? raw : `${raw}/api`
}

async function authHeaders() {
  if (!isFirebaseConfigured()) throw new Error('Brak konfiguracji Firebase.')
  const user = ensureFirebase()?.auth?.currentUser
  if (!user) throw new Error('Sesja wygasła. Zaloguj się ponownie.')
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${await user.getIdToken()}`,
    ...platformContextHeaders(),
  }
}

async function parseResponse(response, fallbackMessage) {
  const raw = await response.text().catch(() => '')
  let body = {}
  if (raw && !/^\s*</.test(raw)) {
    try { body = JSON.parse(raw) } catch { body = {} }
  }
  if (!response.ok) {
    const error = new Error(String(body?.error?.message ?? body?.message ?? fallbackMessage).trim() || fallbackMessage)
    error.status = response.status
    error.code = String(body?.error?.code ?? body?.code ?? '').trim()
    error.details = body?.error?.details ?? body?.details ?? null
    throw error
  }
  return body?.day ?? body?.data?.day ?? body
}

function dayUrl(orgId, workerLogin, businessDateYmd) {
  const query = new URLSearchParams({
    orgId: String(orgId ?? '').trim(),
    workerLogin: String(workerLogin ?? '').trim(),
  })
  return `${apiBase()}/portal/work-time/days/${encodeURIComponent(String(businessDateYmd ?? '').trim())}?${query}`
}

export async function getWorkTimeDay(orgId, workerLogin, businessDateYmd) {
  const response = await fetch(dayUrl(orgId, workerLogin, businessDateYmd), {
    method: 'GET',
    headers: await authHeaders(),
  })
  return parseResponse(response, 'Nie udało się pobrać czasu pracy dla tego dnia.')
}

export async function saveWorkTimeDay(orgId, workerLogin, businessDateYmd, payload = {}) {
  const response = await fetch(dayUrl(orgId, workerLogin, businessDateYmd), {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ ...payload, orgId, workerLogin }),
  })
  return parseResponse(response, 'Nie udało się zapisać korekty czasu pracy.')
}

export async function getWorkTimeDays(orgId, filters = {}) {
  const query = new URLSearchParams({
    orgId: String(orgId ?? '').trim(),
    fromYmd: String(filters.fromYmd ?? '').trim(),
    toYmd: String(filters.toYmd ?? '').trim(),
    page: String(filters.page ?? 1),
    pageSize: String(filters.pageSize ?? 50),
  })
  if (filters.workerLogin) query.set('workerLogin', String(filters.workerLogin).trim())
  const response = await fetch(`${apiBase()}/portal/work-time/days?${query}`, {
    method: 'GET',
    headers: await authHeaders(),
  })
  return parseResponse(response, 'Nie udało się pobrać ewidencji czasu pracy.')
}
