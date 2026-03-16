import { insertWorkerForOrg, workersForOrg } from '@dataconnect/generated'
import { executeMutation, mutationRef } from 'firebase/data-connect'
import { ensureFirebase, isFirebaseConfigured } from '../firebase/firebaseClient'

function resolveNextWorkerId(rows = []) {
  let maxNumber = 0
  let padWidth = 3

  rows.forEach((row) => {
    const raw = String(row?.workerId ?? '').trim().toUpperCase()
    const match = /^W(\d+)$/.exec(raw)
    if (!match) {
      return
    }

    const numeric = Number.parseInt(match[1], 10)
    if (Number.isFinite(numeric) && numeric > maxNumber) {
      maxNumber = numeric
    }
    padWidth = Math.max(padWidth, match[1].length)
  })

  return `W${String(maxNumber + 1).padStart(padWidth, '0')}`
}

const DEPLOY_HINT =
  'Brak wdrozonej operacji Data Connect. Wykonaj: firebase login --reauth, potem firebase deploy --only dataconnect --project iclean-room.'

function extractNestedErrorMessage(rawMessage) {
  const text = String(rawMessage ?? '')
  if (!text) {
    return ''
  }

  try {
    const parsed = JSON.parse(text)
    const topMessage = String(parsed?.error?.message ?? '').trim()
    if (topMessage) {
      return topMessage
    }
  } catch {
    // ignore
  }

  return ''
}

function isOperationNotFoundMessage(rawMessage, operationName) {
  const message = String(rawMessage ?? '')
  const nested = extractNestedErrorMessage(message)
  const fullMessage = `${message} ${nested}`.toLowerCase()
  const operation = String(operationName ?? '').trim().toLowerCase()
  if (!operation) {
    return false
  }

  return (
    fullMessage.includes(`operation "${operation}" not found`) ||
    fullMessage.includes(`operation \\"${operation}\\" not found`) ||
    fullMessage.includes(`operation '${operation}' not found`) ||
    (fullMessage.includes('operation') && fullMessage.includes('not found') && fullMessage.includes(operation)) ||
    ((fullMessage.includes('"status":"not_found"') ||
      fullMessage.includes('"code":404') ||
      fullMessage.includes('"code":"404"')) &&
      fullMessage.includes(operation))
  )
}

function withOperationNotFoundHint(error, operationName) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (isOperationNotFoundMessage(message, operationName)) {
    return new Error(`${DEPLOY_HINT} Brak operacji: ${operationName}.`)
  }

  return error instanceof Error ? error : new Error(message || DEPLOY_HINT)
}

function asNullableText(value) {
  const raw = String(value ?? '').trim()
  return raw ? raw : null
}

function getDataConnectOrThrow() {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  const firebase = ensureFirebase()
  if (!firebase?.dataConnect) {
    throw new Error('Nie udało się zainicjalizować Data Connect.')
  }

  return firebase.dataConnect
}

function mapWorker(orgId, row) {
  const login = String(row.login ?? row.workerLogin ?? row.workerId ?? '').trim()
  const workerId = String(row.workerId ?? login).trim() || login
  const workerName = String(
    row.workerName ?? row.workername ?? row.worker_name ?? row.name ?? row.displayName ?? row.fullName ?? login,
  ).trim()
  const workerType = String(row.workerType ?? row.role ?? 'Pracownik').trim()
  const loginEmail = String(row.loginEmail ?? row.email ?? '').trim()

  return {
    id: workerId,
    workerId,
    orgId,
    login,
    workerLogin: login,
    workerName,
    fullName: workerName,
    name: workerName,
    role: workerType,
    type: workerType,
    active: Boolean(row.active ?? true),
    email: loginEmail,
    phone: String(row.phone ?? '').trim(),
    editedBy: String(row.updatedBy ?? row.edit ?? '').trim(),
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
  const login = String(payload?.login ?? payload?.email ?? `worker-${Date.now()}`).trim()
  if (!login) {
    throw new Error('Pole login jest wymagane.')
  }

  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  const workerName = String(payload?.workerName ?? payload?.name ?? payload?.fullName ?? '').trim() || null
  const workerType = String(payload?.role ?? payload?.workerType ?? '').trim() || null
  const loginEmail = String(payload?.loginEmail ?? payload?.email ?? '').trim() || null
  const phone = String(payload?.phone ?? '').trim() || null
  ensureFirebase()
  const existingResponse = await workersForOrg({ orgId })
  const existingRows = existingResponse?.data?.workers ?? []
  const workerId = resolveNextWorkerId(existingRows)

  await insertWorkerForOrg({
    orgId,
    login,
    workerName,
    loginEmail,
    role: workerType,
    active: payload?.active ?? true,
    email: loginEmail,
    phone,
    workerType,
    workerId,
  })

  return {
    id: workerId,
    workerId,
    orgId,
    login,
    name: workerName ?? login,
    role: workerType ?? 'Pracownik',
    type: workerType ?? 'Pracownik',
    active: payload?.active ?? true,
    email: loginEmail ?? '',
    phone: phone ?? '',
    ...payload,
  }
}

export async function updateWorker(orgId, workerId, payload) {
  const login = String(workerId ?? payload?.login ?? '').trim()
  if (!login) {
    throw new Error('Brak loginu pracownika do aktualizacji.')
  }

  const dataConnect = getDataConnectOrThrow()

  try {
    await executeMutation(
      mutationRef(dataConnect, 'UpdateWorkerForOrg', {
        orgId,
        login,
        workerName: asNullableText(payload?.workerName ?? payload?.name ?? payload?.fullName),
        loginEmail: asNullableText(payload?.loginEmail ?? payload?.email),
        role: asNullableText(payload?.role ?? payload?.workerType) ?? 'Worker',
        active: payload?.active ?? true,
        email: asNullableText(payload?.email ?? payload?.loginEmail),
        phone: asNullableText(payload?.phone),
        workerType: asNullableText(payload?.workerType ?? payload?.role),
        workerId: asNullableText(payload?.workerId ?? payload?.id) ?? login,
        edit: asNullableText(payload?.edit ?? payload?.editedBy),
      }),
    )
  } catch (error) {
    throw withOperationNotFoundHint(error, 'UpdateWorkerForOrg')
  }

  return {
    id: String(payload?.workerId ?? payload?.id ?? login).trim() || login,
    workerId: String(payload?.workerId ?? payload?.id ?? login).trim() || login,
    orgId,
    login,
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
