import {
  clientsForOrg,
  deleteClientForOrg,
  insertClientForOrg,
  updateClientForOrg,
} from '@dataconnect/generated'
import { ensureFirebase, isFirebaseConfigured } from '../firebase/firebaseClient'

function normalizeStatus(status) {
  const value = String(status ?? '').trim().toLowerCase()

  if (value === 'active' || value === 'aktywny') {
    return 'Aktywny'
  }

  if (value === 'inactive' || value === 'nieaktywny') {
    return 'Nieaktywny'
  }

  return 'Aktywny'
}

function asNullableText(value) {
  const raw = String(value ?? '').trim()
  return raw ? raw : null
}

function mapClient(orgId, row) {
  return {
    id: row.clientId,
    orgId,
    name: row.name ?? '',
    nip: row.nip ?? '',
    city: row.city ?? '',
    status: normalizeStatus(row.status),
    coordinator: row.coordinator ?? '',
    address: row.address ?? '',
    contact: row.contact ?? '',
    serviceFrequency: row.serviceFrequency ?? '',
    assignees: row.assignees ?? '',
    chemistry: row.chemistry ?? '',
    equipment: row.equipment ?? '',
    clientInfo: row.clientInfo ?? '',
    frequency: row.serviceFrequency ?? '',
    workers: row.assignees ?? '',
    chemia: row.chemistry ?? '',
    sprzet: row.equipment ?? '',
    info: row.clientInfo ?? '',
  }
}

export async function getClients(orgId) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  ensureFirebase()
  const response = await clientsForOrg({ orgId })
  const rows = response?.data?.clients ?? []
  return rows.map((row) => mapClient(orgId, row))
}

export async function getClientById(orgId, clientId) {
  const clients = await getClients(orgId)
  return clients.find((client) => client.id === clientId) ?? null
}

export async function createClient(orgId, payload) {
  const clientId = String(payload?.clientId ?? payload?.id ?? `cl-${Date.now()}`)

  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  ensureFirebase()
  await insertClientForOrg({
    orgId,
    clientId,
    name: asNullableText(payload?.name),
    nip: asNullableText(payload?.nip),
    city: asNullableText(payload?.city),
    address: asNullableText(payload?.address),
    contact: asNullableText(payload?.contact ?? payload?.phone ?? payload?.email),
    status: asNullableText(payload?.status) ?? 'Aktywny',
    coordinator: asNullableText(payload?.coordinator),
    serviceFrequency: asNullableText(payload?.serviceFrequency ?? payload?.frequency ?? payload?.czestotliwosc),
    assignees: asNullableText(payload?.assignees ?? payload?.workers ?? payload?.osobyWykonujace ?? payload?.osoby),
    chemistry: asNullableText(payload?.chemistry ?? payload?.chemia),
    equipment: asNullableText(payload?.equipment ?? payload?.sprzet),
    clientInfo: asNullableText(payload?.clientInfo ?? payload?.info ?? payload?.informacje),
  })

  return {
    id: clientId,
    orgId,
    ...payload,
  }
}

export async function updateClient(orgId, clientId, payload) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  ensureFirebase()
  await updateClientForOrg({
    orgId,
    clientId,
    name: asNullableText(payload?.name),
    nip: asNullableText(payload?.nip),
    city: asNullableText(payload?.city),
    address: asNullableText(payload?.address),
    contact: asNullableText(payload?.contact ?? payload?.phone ?? payload?.email),
    status: asNullableText(payload?.status) ?? 'Aktywny',
    coordinator: asNullableText(payload?.coordinator),
    serviceFrequency: asNullableText(payload?.serviceFrequency ?? payload?.frequency ?? payload?.czestotliwosc),
    assignees: asNullableText(payload?.assignees ?? payload?.workers ?? payload?.osobyWykonujace ?? payload?.osoby),
    chemistry: asNullableText(payload?.chemistry ?? payload?.chemia),
    equipment: asNullableText(payload?.equipment ?? payload?.sprzet),
    clientInfo: asNullableText(payload?.clientInfo ?? payload?.info ?? payload?.informacje),
  })

  return {
    id: clientId,
    orgId,
    ...payload,
  }
}

export async function deleteClient(orgId, clientId) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  ensureFirebase()
  await deleteClientForOrg({
    orgId,
    clientId,
  })

  return {
    success: true,
    orgId,
    clientId,
  }
}
