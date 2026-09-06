import { getSession } from '../auth/authService'
import { ensureFirebase, isFirebaseConfigured } from '../firebase/firebaseClient'
import {
  isPlatformSession,
  platformContextHeaders,
} from './platformDataConnectService'
import {
  WORKFORCE_SCHEDULE_EFFECTS,
  createWorkforceScheduleTransport,
} from './workforceScheduleTransport.js'

function text(value) {
  return String(value ?? '').trim()
}

function getPortalApiBase() {
  return import.meta.env.VITE_ADMIN_API_BASE || '/api'
}

function activeSession() {
  const session = getSession()
  const orgId = text(session?.activeOrgId ?? session?.orgId)
  if (!session || !orgId) {
    const error = new Error('Brak aktywnego kontekstu organizacji dla Grafiku.')
    error.code = 'WORKFORCE_SCHEDULE_ORG_CONTEXT_REQUIRED'
    throw error
  }
  return { orgId, session }
}

export function getActiveWorkforceScheduleOrganizationId() {
  return activeSession().orgId
}

async function workforceScheduleAuthHeaders({ orgId }) {
  const current = activeSession()
  if (text(orgId) !== current.orgId) {
    const error = new Error('Żądanie Grafiku dotyczy nieaktywnej organizacji.')
    error.code = 'WORKFORCE_SCHEDULE_ORG_CONTEXT_MISMATCH'
    throw error
  }

  if (isPlatformSession(current.session)) {
    const error = new Error('Grafik wymaga bezpośredniej sesji organizacji.')
    error.code = 'WORKFORCE_SCHEDULE_PLATFORM_CONTEXT_FORBIDDEN'
    throw error
  }
  if (!isFirebaseConfigured()) {
    const error = new Error('Brak konfiguracji Firebase.')
    error.code = 'WORKFORCE_SCHEDULE_AUTH_REQUIRED'
    throw error
  }

  const user = ensureFirebase()?.auth?.currentUser
  if (!user || text(current.session.uid) !== text(user.uid)) {
    const error = new Error('Sesja wygasła. Zaloguj się ponownie.')
    error.code = 'WORKFORCE_SCHEDULE_AUTH_REQUIRED'
    throw error
  }

  return {
    Authorization: `Bearer ${await user.getIdToken()}`,
    ...platformContextHeaders(current.session),
  }
}

const transport = createWorkforceScheduleTransport({
  fetchImpl: (...args) => fetch(...args),
  getActiveOrganizationId: getActiveWorkforceScheduleOrganizationId,
  getAuthHeaders: workforceScheduleAuthHeaders,
  getApiBase: getPortalApiBase,
})

export { WORKFORCE_SCHEDULE_EFFECTS }

export const archiveWorkforceScheduleShift = transport.archiveShift
export const fetchWorkforceScheduleBootstrap = transport.fetchBootstrap
export const publishWorkforceSchedule = transport.publish
export const setWorkforceScheduleConfiguration = transport.setConfiguration
export const syncWorkforceScheduleCatalogs = transport.syncCatalogs
export const upsertWorkforceScheduleShift = transport.upsertShift
