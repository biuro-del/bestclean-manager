import { platformAuthHeaders } from '../../web-app/apps/portal-web/src/services/platformDataConnectService.js'

function text(value) {
  return String(value ?? '').trim()
}

function apiBase() {
  const raw = text(import.meta.env.VITE_PLATFORM_API_BASE || import.meta.env.VITE_ADMIN_API_BASE || '/api').replace(/\/+$/, '')
  if (!raw) return '/api'
  return raw.endsWith('/api') ? raw : `${raw}/api`
}

async function parseResponse(response) {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(text(body?.error?.message) || 'Operacja platformowa nie powiodła się.')
    error.code = text(body?.error?.code) || 'PLATFORM_API_ERROR'
    error.status = response.status
    error.details = body?.error?.details
    throw error
  }
  return body?.data
}

async function request(path, { method = 'GET', body, context = false, forceRefresh = false } = {}) {
  const headers = await platformAuthHeaders({ requireContext: context, forceRefresh })
  const response = await fetch(`${apiBase()}${path}`, {
    method,
    headers: {
      ...headers,
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return parseResponse(response)
}

function queryString(values = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (text(value)) query.set(key, text(value))
  }
  const serialized = query.toString()
  return serialized ? `?${serialized}` : ''
}

export const cleanziAdminApi = {
  dashboard: () => request('/platform/dashboard'),
  plans: () => request('/platform/plans'),
  organizations: (filters) => request(`/platform/organizations${queryString(filters)}`),
  openContext: (orgId, reason) => request('/platform/access-context', {
    method: 'POST', body: { orgId, reason },
  }),
  closeContext: () => request('/platform/access-context/close', {
    method: 'POST', body: {}, context: true,
  }),
  details: (orgId) => request(`/platform/organizations/${encodeURIComponent(orgId)}`, { context: true }),
  history: (orgId, filters = {}) => request(
    `/platform/organizations/${encodeURIComponent(orgId)}/subscription-history${queryString(filters)}`,
    { context: true },
  ),
  transactions: (orgId, filters = {}) => request(
    `/platform/organizations/${encodeURIComponent(orgId)}/transactions${queryString(filters)}`,
    { context: true },
  ),
  documents: (orgId, filters = {}) => request(
    `/platform/organizations/${encodeURIComponent(orgId)}/documents${queryString(filters)}`,
    { context: true },
  ),
  audit: (orgId, limit = 100) => request(`/platform/audit${queryString({ orgId, limit })}`),
  preview: (orgId, operation, reason, payload) => request(
    `/platform/organizations/${encodeURIComponent(orgId)}/operations/preview`,
    { method: 'POST', body: { operation, reason, payload }, context: true },
  ),
  execute: (orgId, operation, reason, payload, expectedVersion) => request(
    `/platform/organizations/${encodeURIComponent(orgId)}/operations`,
    {
      method: 'POST',
      body: { operation, reason, payload, expectedVersion },
      context: true,
      forceRefresh: true,
    },
  ),
}
