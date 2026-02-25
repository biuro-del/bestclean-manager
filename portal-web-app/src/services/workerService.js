import { insertWorkerForOrg, workersForOrg } from '@dataconnect/generated'
import { ensureFirebase, isFirebaseConfigured } from '../firebase/firebaseClient'

function mapWorker(orgId, row) {
  const login = String(row.login ?? row.workerId ?? '').trim()
  const workerId = String(row.workerId ?? login).trim() || login
  const fullName = String(row.fullName ?? login).trim()
  const workerType = String(row.workerType ?? 'Pracownik').trim()
  const loginEmail = String(row.loginEmail ?? row.email ?? '').trim()

  return {
    id: workerId,
    workerId,
    orgId,
    login,
    name: fullName,
    role: workerType,
    type: workerType,
    active: Boolean(row.active ?? true),
    email: loginEmail,
    phone: String(row.phone ?? '').trim(),
    editedBy: String(row.edit ?? '').trim(),
    addedAt: String(row.createdAt ?? '').trim(),
    editedAt: String(row.updatedAt ?? '').trim(),
  }
}

export async function getWorkers(orgId, filters = {}) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  ensureFirebase()
  const response = await workersForOrg({ orgId })
  const rows = response?.data?.workers ?? []

  let workers = rows.map((row) => mapWorker(orgId, row))

  const q = String(filters.q ?? '').trim().toLowerCase()
  if (q) {
    workers = workers.filter((worker) => {
      const haystack = [worker.id, worker.workerId, worker.login, worker.name, worker.role, worker.phone, worker.email]
        .map((value) => String(value ?? '').toLowerCase())
        .join(' ')
      return haystack.includes(q)
    })
  }

  const type = String(filters.type ?? '').trim().toLowerCase()
  if (type) {
    workers = workers.filter((worker) => String(worker.type ?? '').toLowerCase().includes(type))
  }

  return workers
}

export async function getWorkerById(orgId, workerId) {
  const workers = await getWorkers(orgId)
  return workers.find((worker) => worker.id === workerId) ?? null
}

export async function createWorker(orgId, payload) {
  const login = String(payload?.login ?? payload?.email ?? `worker-${Date.now()}`)

  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  ensureFirebase()
  await insertWorkerForOrg({
    orgId,
    login,
    fullName: payload?.name ?? payload?.fullName ?? null,
    active: payload?.active ?? true,
    email: payload?.email ?? null,
    phone: payload?.phone ?? null,
    workerType: payload?.role ?? payload?.workerType ?? null,
  })

  return {
    id: login,
    orgId,
    ...payload,
  }
}

export async function updateWorker(orgId, workerId, payload) {
  return {
    id: workerId,
    orgId,
    ...payload,
  }
}

export async function deleteWorker(orgId, workerId) {
  return {
    success: true,
    orgId,
    workerId,
  }
}
