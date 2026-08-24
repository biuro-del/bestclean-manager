import * as generated from '@dataconnect/generated'
import * as readGuardGenerated from '@dataconnect/read-guard-generated'
import { getSession, platformEmailMfaHeaders } from '../auth/authService'
import { ensureFirebase } from '../firebase/firebaseClient'
import {
  ensurePlatformFirebase,
  isPlatformFirebaseConfigured,
  waitForPlatformFirebaseAuthReady,
} from '../../../../../Cleanzi-admin/frontend/platformFirebaseClient'

const PLATFORM_CONTEXT_HEADER = 'X-Platform-Context-Id'

function text(value) {
  return String(value ?? '').trim()
}

function apiBase() {
  const raw = text(import.meta.env.VITE_ADMIN_API_BASE || '/api').replace(/\/+$/, '')
  if (!raw) return '/api'
  return raw.endsWith('/api') ? raw : `${raw}/api`
}

export function isPlatformSession(session = getSession()) {
  return text(session?.roleCode).toUpperCase() === 'PLATFORM_OWNER' && text(session?.actorType).toUpperCase() === 'PLATFORM'
}

export function platformContextHeaders(session = getSession()) {
  return isPlatformSession(session) && text(session?.platformContextId)
    ? { [PLATFORM_CONTEXT_HEADER]: text(session.platformContextId) }
    : {}
}

async function firebaseUser() {
  if (!isPlatformFirebaseConfigured()) throw new Error('Brak konfiguracji Firebase dla Panelu admina.')
  const firebase = ensurePlatformFirebase()
  const user = firebase?.auth?.currentUser || (await waitForPlatformFirebaseAuthReady())
  if (!user) throw new Error('Sesja Firebase wygasła. Zaloguj się ponownie.')
  return user
}

export async function platformAuthHeaders({ requireContext = true, forceRefresh = false } = {}) {
  const user = await firebaseUser()
  const idToken = await user.getIdToken(Boolean(forceRefresh))
  const contextHeaders = platformContextHeaders()
  if (requireContext && !text(contextHeaders[PLATFORM_CONTEXT_HEADER])) {
    throw new Error('Brak aktywnego kontekstu organizacji platformy.')
  }
  return {
    Authorization: `Bearer ${idToken}`,
    ...contextHeaders,
    ...platformEmailMfaHeaders(),
  }
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

export async function executePlatformDataConnect(kind, operationName, variables = {}) {
  const headers = await platformAuthHeaders()
  const response = await fetch(`${apiBase()}/platform/data-connect`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ kind, operationName, variables }),
  })
  return parseResponse(response)
}

function variablesFromArgs(args) {
  const first = args[0]
  if (first && typeof first === 'object' && typeof first._useGeneratedSdk === 'function') return args[1] || {}
  return first && typeof first === 'object' ? first : {}
}

function wrap(kind, operationName, directOperation) {
  return (...args) => {
    if (isPlatformSession()) return executePlatformDataConnect(kind, operationName, variablesFromArgs(args))
    const dataConnect = ensureFirebase()?.dataConnect
    if (!dataConnect) throw new Error('Brak konfiguracji Data Connect. Uzupełnij zmienne VITE_DATACONNECT_*.')
    return directOperation(dataConnect, ...args)
  }
}

export async function listPlatformOrganizations(filters = {}) {
  const headers = await platformAuthHeaders({ requireContext: false })
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (text(value)) search.set(key, text(value))
  }
  const response = await fetch(`${apiBase()}/platform/organizations?${search.toString()}`, {
    headers: { ...headers, Accept: 'application/json' },
  })
  return parseResponse(response)
}

export async function openPlatformOrganization(orgId, reason) {
  const headers = await platformAuthHeaders({ requireContext: false })
  const response = await fetch(`${apiBase()}/platform/access-context`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ orgId, reason }),
  })
  return parseResponse(response)
}

export async function closePlatformOrganization() {
  const headers = await platformAuthHeaders()
  const response = await fetch(`${apiBase()}/platform/access-context/close`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: '{}',
  })
  return parseResponse(response)
}

export async function updatePlatformOrganization(orgId, action = '', payload = {}) {
  const suffix = text(action) ? `/${encodeURIComponent(text(action))}` : ''
  const response = await fetch(`${apiBase()}/platform/organizations/${encodeURIComponent(orgId)}${suffix}`, {
    method: text(action) ? 'POST' : 'PATCH',
    headers: {
      ...(await platformAuthHeaders()),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  })
  return parseResponse(response)
}

export const insertClientForOrg = wrap('mutation', 'InsertClientForOrg', generated.insertClientForOrg)
export const updateClientForOrg = wrap('mutation', 'UpdateClientForOrg', generated.updateClientForOrg)
export const deleteClientForOrg = wrap('mutation', 'DeleteClientForOrg', generated.deleteClientForOrg)
export const insertIndividualJobForOrg = wrap('mutation', 'InsertIndividualJobForOrg', generated.insertIndividualJobForOrg)
export const updateIndividualJobForOrg = wrap('mutation', 'UpdateIndividualJobForOrg', generated.updateIndividualJobForOrg)
export const deleteIndividualJobForOrg = wrap('mutation', 'DeleteIndividualJobForOrg', generated.deleteIndividualJobForOrg)
export const upsertTaskForOrg = wrap('mutation', 'UpsertTaskForOrg', generated.upsertTaskForOrg)
export const deleteTaskForOrg = wrap('mutation', 'DeleteTaskForOrg', generated.deleteTaskForOrg)
export const insertZoneForOrg = wrap('mutation', 'InsertZoneForOrg', generated.insertZoneForOrg)
export const updateZoneForOrg = wrap('mutation', 'UpdateZoneForOrg', generated.updateZoneForOrg)
export const deleteZoneForOrg = wrap('mutation', 'DeleteZoneForOrg', generated.deleteZoneForOrg)
export const insertWorkdayForOrg = wrap('mutation', 'InsertWorkdayForOrg', generated.insertWorkdayForOrg)
export const updateWorkdayForOrg = wrap('mutation', 'UpdateWorkdayForOrg', generated.updateWorkdayForOrg)
export const deleteWorkdayForOrg = wrap('mutation', 'DeleteWorkdayForOrg', generated.deleteWorkdayForOrg)
export const insertEventForOrg = wrap('mutation', 'InsertEventForOrg', generated.insertEventForOrg)
export const updateEventForOrg = wrap('mutation', 'UpdateEventForOrg', generated.updateEventForOrg)
export const reidentifyEventForOrg = wrap('mutation', 'ReidentifyEventForOrg', generated.reidentifyEventForOrg)
export const deleteEventForOrg = wrap('mutation', 'DeleteEventForOrg', generated.deleteEventForOrg)
export const insertBackupCycleForOrg = wrap('mutation', 'InsertBackupCycleForOrg', generated.insertBackupCycleForOrg)
export const updateBackupCycleForOrg = wrap('mutation', 'UpdateBackupCycleForOrg', generated.updateBackupCycleForOrg)
export const insertStorageForOrg = wrap('mutation', 'InsertStorageForOrg', generated.insertStorageForOrg)
export const updateStorageForOrg = wrap('mutation', 'UpdateStorageForOrg', generated.updateStorageForOrg)
export const deleteStorageForOrg = wrap('mutation', 'DeleteStorageForOrg', generated.deleteStorageForOrg)
export const insertClientStorageForOrg = wrap('mutation', 'InsertClientStorageForOrg', generated.insertClientStorageForOrg)
export const updateClientStorageForOrg = wrap('mutation', 'UpdateClientStorageForOrg', generated.updateClientStorageForOrg)
export const deleteClientStorageForOrg = wrap('mutation', 'DeleteClientStorageForOrg', generated.deleteClientStorageForOrg)
export const startWorkdayPause = wrap('mutation', 'StartWorkdayPause', generated.startWorkdayPause)
export const stopWorkdayPause = wrap('mutation', 'StopWorkdayPause', generated.stopWorkdayPause)

export const workersForOrg = wrap('query', 'WorkersForOrg', generated.workersForOrg)
export const workersPageForOrg = wrap('query', 'WorkersPageForOrg', readGuardGenerated.workersPageForOrg)
export const workerForOrgByLogin = wrap('query', 'WorkerForOrgByLogin', readGuardGenerated.workerForOrgByLogin)
export const clientsForOrg = wrap('query', 'ClientsForOrg', generated.clientsForOrg)
export const clientsPageForOrg = wrap('query', 'ClientsPageForOrg', readGuardGenerated.clientsPageForOrg)
export const individualJobsForOrg = wrap('query', 'IndividualJobsForOrg', generated.individualJobsForOrg)
export const tasksForOrg = wrap('query', 'TasksForOrg', generated.tasksForOrg)
export const zonesForOrg = wrap('query', 'ZonesForOrg', generated.zonesForOrg)
export const zonesPageForOrg = wrap('query', 'ZonesPageForOrg', readGuardGenerated.zonesPageForOrg)
export const workdaysForOrg = wrap('query', 'WorkdaysForOrg', generated.workdaysForOrg)
export const workerWorkdaysForOrg = wrap('query', 'WorkerWorkdaysForOrg', generated.workerWorkdaysForOrg)
export const backupCyclesForOrg = wrap('query', 'BackupCyclesForOrg', generated.backupCyclesForOrg)
export const backupCyclesPageForOrg = wrap('query', 'BackupCyclesPageForOrg', readGuardGenerated.backupCyclesPageForOrg)
export const eventsForOrg = wrap('query', 'EventsForOrg', generated.eventsForOrg)
export const storageForOrg = wrap('query', 'StorageForOrg', generated.storageForOrg)
export const clientStorageForOrg = wrap('query', 'ClientStorageForOrg', generated.clientStorageForOrg)
export const workdayPausesForOrg = wrap('query', 'WorkdayPausesForOrg', generated.workdayPausesForOrg)
export const workdayPausesPageForOrg = wrap('query', 'WorkdayPausesPageForOrg', readGuardGenerated.workdayPausesPageForOrg)
