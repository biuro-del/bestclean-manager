import { ensureFirebase, isFirebaseConfigured } from '../firebase/firebaseClient'
import { platformContextHeaders } from './platformDataConnectService'

function normalizeApiBase(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return '/api'
  if (raw.startsWith('/')) {
    const normalized = raw.replace(/\/+$/, '')
    return normalized.endsWith('/api') ? normalized : `${normalized}/api`
  }
  const normalized = raw.replace(/\/+$/, '')
  return normalized.endsWith('/api') ? normalized : `${normalized}/api`
}

function getPortalApiBase() {
  return normalizeApiBase(import.meta.env.VITE_ADMIN_API_BASE || '/api')
}

function text(value) {
  return String(value ?? '').trim()
}

async function authHeaders(method = 'GET') {
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
    Accept: 'application/json',
    ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
    Authorization: `Bearer ${idToken}`,
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
    const message = text(body?.error?.message || body?.message) || fallbackMessage
    const error = new Error(message)
    error.code = text(body?.error?.code || body?.code) || 'PROFITABILITY_REQUEST_FAILED'
    error.status = response.status
    error.details = body?.error?.details || body?.details || null
    throw error
  }
  return body?.data && typeof body.data === 'object' ? body.data : body
}

async function requestProfitability(method, { orgId, clientId, period = '', objectId = '', view = '', body = null } = {}) {
  const normalizedOrgId = text(orgId)
  const normalizedClientId = text(clientId)
  if (!normalizedOrgId || !normalizedClientId) {
    throw new Error('Brak organizacji lub klienta dla modułu rentowności.')
  }

  const query = new URLSearchParams({ orgId: normalizedOrgId, clientId: normalizedClientId })
  if (period) query.set('period', text(period))
  if (objectId) query.set('objectId', text(objectId))
  if (view) query.set('view', text(view))

  const response = await fetch(`${getPortalApiBase()}/portal/profitability?${query.toString()}`, {
    method,
    headers: await authHeaders(method),
    ...(method === 'GET'
      ? {}
      : {
          body: JSON.stringify({
            orgId: normalizedOrgId,
            clientId: normalizedClientId,
            period: text(period),
            objectId: text(objectId),
            ...(body && typeof body === 'object' ? body : {}),
          }),
        }),
  })

  return parseResponse(response, 'Nie udało się wykonać operacji w module rentowności.')
}

export function fetchProfitabilitySummary(orgId, clientId, options = {}) {
  return requestProfitability('GET', {
    orgId,
    clientId,
    period: options.period,
    objectId: options.objectId,
  })
}

export function fetchProfitabilityHistory(orgId, clientId, options = {}) {
  return requestProfitability('GET', {
    orgId,
    clientId,
    period: options.period,
    objectId: options.objectId,
    view: 'history',
  })
}

export function saveProfitabilityContract(orgId, clientId, objectId, period, contract) {
  return requestProfitability('POST', {
    orgId,
    clientId,
    objectId,
    period,
    body: { action: 'upsert-contract', contract },
  })
}

export function createProfitabilityCost(orgId, clientId, objectId, period, cost) {
  return requestProfitability('POST', {
    orgId,
    clientId,
    objectId,
    period,
    body: { action: 'create-cost', cost },
  })
}

export function createProfitabilityRevenue(orgId, clientId, objectId, period, revenue) {
  return requestProfitability('POST', {
    orgId,
    clientId,
    objectId,
    period,
    body: { action: 'create-revenue', revenue },
  })
}

export function saveProfitabilityWorkerRate(orgId, clientId, objectId, period, rate) {
  return requestProfitability('POST', {
    orgId,
    clientId,
    objectId,
    period,
    body: { action: 'upsert-worker-rate', rate },
  })
}

export function saveProfitabilityAsset(orgId, clientId, objectId, period, asset) {
  return requestProfitability('POST', {
    orgId,
    clientId,
    objectId,
    period,
    body: { action: 'upsert-asset', asset },
  })
}

export function closeProfitabilityPeriod(orgId, clientId, objectId, period, reason = '') {
  return requestProfitability('POST', {
    orgId,
    clientId,
    objectId,
    period,
    body: { action: 'close-period', reason: text(reason) },
  })
}
