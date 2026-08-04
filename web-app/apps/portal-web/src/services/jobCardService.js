import { ensureFirebase, isFirebaseConfigured } from '../firebase/firebaseClient'
import { platformContextHeaders } from './platformDataConnectService'

function text(value) {
  return String(value ?? '').trim()
}

function normalizeApiBase(value) {
  const raw = text(value)
  if (!raw) return '/api'
  const normalized = raw.replace(/\/+$/, '')
  if (normalized.startsWith('/')) return normalized.endsWith('/api') ? normalized : `${normalized}/api`
  return normalized.endsWith('/api') ? normalized : `${normalized}/api`
}

function getPortalApiBase() {
  return normalizeApiBase(import.meta.env.VITE_ADMIN_API_BASE || '/api')
}

async function authHeaders(method = 'GET') {
  if (!isFirebaseConfigured()) throw new Error('Brak konfiguracji Firebase.')
  const firebase = ensureFirebase()
  const currentUser = firebase?.auth?.currentUser
  if (!currentUser) throw new Error('Sesja wygasła. Zaloguj się ponownie.')
  return {
    Accept: 'application/json',
    ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
    Authorization: `Bearer ${await currentUser.getIdToken()}`,
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
    error.code = text(body?.error?.code || body?.code) || 'JOB_CARD_REQUEST_FAILED'
    error.details = body?.error?.details || body?.details || null
    error.status = response.status
    throw error
  }
  return body?.data && typeof body.data === 'object' ? body.data : body
}

export async function fetchJobCardState(orgId, orderId) {
  const normalizedOrgId = text(orgId)
  const normalizedOrderId = text(orderId)
  if (!normalizedOrgId || !normalizedOrderId) {
    throw new Error('Brak organizacji lub zlecenia dla Karty Zlecenia.')
  }
  const query = new URLSearchParams({ orgId: normalizedOrgId, orderId: normalizedOrderId })
  const response = await fetch(`${getPortalApiBase()}/portal/job-cards?${query.toString()}`, {
    method: 'GET',
    headers: await authHeaders('GET'),
  })
  return parseResponse(response, 'Nie udało się pobrać stanu Karty Zlecenia.')
}

export async function listJobCardDrafts(orgId, { cursor = '', limit = 30 } = {}) {
  const normalizedOrgId = text(orgId)
  const normalizedCursor = text(cursor)
  const normalizedLimit = Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 30))
  if (!normalizedOrgId) {
    throw new Error('Brak organizacji dla listy roboczych zleceń.')
  }
  const query = new URLSearchParams({ orgId: normalizedOrgId, limit: String(normalizedLimit) })
  if (normalizedCursor) query.set('cursor', normalizedCursor)
  const response = await fetch(`${getPortalApiBase()}/portal/job-card-drafts?${query.toString()}`, {
    method: 'GET',
    headers: await authHeaders('GET'),
  })
  return parseResponse(response, 'Nie udało się pobrać roboczych zleceń.')
}

export async function fetchJobCardDraft(orgId, orderId) {
  const normalizedOrgId = text(orgId)
  const normalizedOrderId = text(orderId)
  if (!normalizedOrgId || !normalizedOrderId) {
    throw new Error('Brak organizacji lub identyfikatora roboczego zlecenia.')
  }
  const query = new URLSearchParams({ orgId: normalizedOrgId, orderId: normalizedOrderId })
  const response = await fetch(`${getPortalApiBase()}/portal/job-card-drafts?${query.toString()}`, {
    method: 'GET',
    headers: await authHeaders('GET'),
  })
  return parseResponse(response, 'Nie udało się pobrać roboczego zlecenia.')
}

export async function saveJobCardDraft(orgId, {
  editorDraft,
  expectedDraftHash = '',
  jobCardDraft,
  order,
  orderId = '',
} = {}) {
  const normalizedOrgId = text(orgId)
  const normalizedOrderId = text(orderId)
  const normalizedExpectedDraftHash = text(expectedDraftHash)
  if (!normalizedOrgId || !editorDraft || typeof editorDraft !== 'object' || !jobCardDraft || typeof jobCardDraft !== 'object') {
    throw new Error('Brak organizacji lub danych szkicu Karty Zlecenia.')
  }
  if (!order || typeof order !== 'object') {
    throw new Error('Brak danych planu potrzebnych do zapisania szkicu Karty Zlecenia.')
  }
  const response = await fetch(`${getPortalApiBase()}/portal/job-card-drafts`, {
    method: 'POST',
    headers: await authHeaders('POST'),
    body: JSON.stringify({
      editorDraft,
      jobCardDraft,
      order,
      ...(normalizedOrderId ? { orderId: normalizedOrderId } : {}),
      ...(normalizedExpectedDraftHash ? { expectedDraftHash: normalizedExpectedDraftHash } : {}),
      orgId: normalizedOrgId,
    }),
  })
  return parseResponse(response, 'Nie udało się zapisać szkicu Karty Zlecenia.')
}

export async function publishJobCard(orgId, orderId, { acknowledgements = [], expectedDraftHash } = {}) {
  const normalizedOrgId = text(orgId)
  const normalizedOrderId = text(orderId)
  if (!normalizedOrgId || !normalizedOrderId || !text(expectedDraftHash)) {
    throw new Error('Brak organizacji, zlecenia lub wersji szkicu do publikacji.')
  }
  const response = await fetch(`${getPortalApiBase()}/portal/job-cards`, {
    method: 'POST',
    headers: await authHeaders('POST'),
    body: JSON.stringify({
      acknowledgements,
      action: 'PUBLISH',
      expectedDraftHash: text(expectedDraftHash),
      orderId: normalizedOrderId,
      orgId: normalizedOrgId,
    }),
  })
  return parseResponse(response, 'Nie udało się opublikować Karty Zlecenia.')
}
