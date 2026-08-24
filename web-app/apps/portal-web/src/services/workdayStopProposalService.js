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

async function parse(response, fallback) {
  const raw = await response.text().catch(() => '')
  let payload = {}
  try { payload = raw ? JSON.parse(raw) : {} } catch {
    // A non-JSON error response is handled through the fallback below.
  }
  if (!response.ok) {
    const error = new Error(text(payload?.error?.message || payload?.message) || fallback)
    error.code = text(payload?.error?.code || payload?.code) || 'WORKDAY_STOP_PROPOSAL_REQUEST_FAILED'
    error.status = response.status
    throw error
  }
  return payload?.data && typeof payload.data === 'object' ? payload.data : payload
}

export async function fetchWorkdayStopProposals(orgId, filters = {}) {
  const query = new URLSearchParams({ orgId: text(orgId) })
  ;['workerId', 'from', 'to', 'status'].forEach((field) => {
    if (text(filters[field])) query.set(field, text(filters[field]))
  })
  query.set('limit', String(Math.min(Math.max(Number(filters.limit) || 100, 1), 100)))
  const response = await fetch(`${getPortalApiBase()}/portal/workday-stop-proposals?${query}`, {
    headers: await authHeaders('GET'),
  })
  return parse(response, 'Nie udało się pobrać zgłoszeń godzin pracy.')
}

export async function fetchWorkdayStopProposalDetail(orgId, proposalId) {
  const query = new URLSearchParams({ orgId: text(orgId), proposalId: text(proposalId) })
  const response = await fetch(`${getPortalApiBase()}/portal/workday-stop-proposals?${query}`, {
    headers: await authHeaders('GET'),
  })
  return parse(response, 'Nie udało się pobrać szczegółów zgłoszenia.')
}

export async function decideWorkdayStopProposal(orgId, decision) {
  const response = await fetch(`${getPortalApiBase()}/portal/workday-stop-proposals`, {
    method: 'POST',
    headers: await authHeaders('POST'),
    body: JSON.stringify({ orgId: text(orgId), ...decision }),
  })
  return parse(response, 'Nie udało się zapisać decyzji biura.')
}
