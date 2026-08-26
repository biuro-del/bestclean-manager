import { ensureFirebase, isFirebaseConfigured } from '../firebase/firebaseClient'
import { platformContextHeaders } from './platformDataConnectService'
import { unwrapWorkdayReconciliationResponse } from './workdayReconciliationTransport.js'

export { unwrapWorkdayReconciliationResponse } from './workdayReconciliationTransport.js'

function normalizePortalApiBase(value) {
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
  return normalizePortalApiBase(import.meta.env.VITE_ADMIN_API_BASE || '/api')
}

async function reconciliationAuthHeaders() {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase.')
  }

  const currentUser = ensureFirebase()?.auth?.currentUser
  if (!currentUser) {
    throw new Error('Sesja wygasla. Zaloguj sie ponownie.')
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${await currentUser.getIdToken()}`,
    ...platformContextHeaders(),
  }
}

async function parseReconciliationResponse(response, fallbackMessage) {
  const rawText = await response.text().catch(() => '')
  let body = {}
  if (rawText && !/^\s*</.test(rawText)) {
    try {
      body = JSON.parse(rawText)
    } catch {
      body = {}
    }
  }

  if (!response.ok) {
    const message = String(
      body?.error?.message ?? body?.message ?? fallbackMessage,
    ).trim() || fallbackMessage
    const error = new Error(message)
    error.status = response.status
    error.code = String(body?.error?.code ?? body?.code ?? '').trim()
    error.details = body?.error?.details ?? body?.details ?? null
    throw error
  }

  return unwrapWorkdayReconciliationResponse(body)
}

function reconciliationUrl(workdayId, orgId) {
  const normalizedWorkdayId = String(workdayId ?? '').trim()
  const normalizedOrgId = String(orgId ?? '').trim()
  if (!normalizedWorkdayId) throw new Error('Brak identyfikatora dnia pracy.')
  if (!normalizedOrgId) throw new Error('Brak identyfikatora organizacji.')
  const query = new URLSearchParams({ orgId: normalizedOrgId })
  return `${getPortalApiBase()}/portal/workdays/${encodeURIComponent(normalizedWorkdayId)}/reconciliation?${query.toString()}`
}

export async function getWorkdayReconciliation(orgId, workdayId) {
  const response = await fetch(reconciliationUrl(workdayId, orgId), {
    method: 'GET',
    headers: await reconciliationAuthHeaders(),
  })
  return parseReconciliationResponse(response, 'Nie udalo sie pobrac rozliczenia dnia pracy.')
}

export async function saveWorkdayReconciliation(orgId, workdayId, payload = {}) {
  const expectedSessionVersion = String(payload?.expectedSessionVersion ?? '').trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(expectedSessionVersion)) {
    throw new Error('Brak aktualnej wersji sesji. Odswiez dzien i sprobuj ponownie.')
  }
  const response = await fetch(reconciliationUrl(workdayId, orgId), {
    method: 'POST',
    headers: await reconciliationAuthHeaders(),
    body: JSON.stringify({
      ...payload,
      orgId: String(orgId ?? '').trim(),
      expectedSessionVersion,
    }),
  })
  return parseReconciliationResponse(response, 'Nie udalo sie zapisac rozliczenia dnia pracy.')
}
