import {
  deleteIndividualJobForOrg,
  individualJobsForOrg,
  insertIndividualJobForOrg,
  updateIndividualJobForOrg,
} from '@dataconnect/generated'
import { ensureFirebase, isFirebaseConfigured } from '../firebase/firebaseClient'

const DEFAULT_PAGE_SIZE = 200
const MAX_PAGE_SIZE = 200

function toIso(value) {
  const raw = String(value ?? '').trim()
  if (!raw) {
    return ''
  }

  const date = new Date(raw)
  if (!Number.isFinite(date.getTime())) {
    return ''
  }

  return date.toISOString()
}

function normalizeDateYmd(value) {
  const raw = String(value ?? '').trim()
  if (!raw) {
    return ''
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw
  }

  const iso = toIso(raw)
  return iso ? iso.slice(0, 10) : ''
}

function ymdToTimestamp(value) {
  const ymd = normalizeDateYmd(value)
  if (!ymd) {
    return null
  }

  return `${ymd}T12:00:00.000Z`
}

function formatDateLabel(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd ?? ''))) {
    return '-'
  }

  return `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}.${ymd.slice(0, 4)}`
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeForSearch(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
}

function paginate(items, pageValue, pageSizeValue) {
  const size = Math.min(Math.max(Number(pageSizeValue) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / size))
  const page = Math.min(Math.max(Number(pageValue) || 1, 1), totalPages)
  const offset = (page - 1) * size

  return {
    page,
    pageSize: size,
    total,
    totalPages,
    items: items.slice(offset, offset + size),
  }
}

function mapIndividualOrder(orgId, row) {
  const dateIso = toIso(row?.date)
  const dateYmd = dateIso ? dateIso.slice(0, 10) : ''

  return {
    id: normalizeText(row?.clientIndId),
    clientIndId: normalizeText(row?.clientIndId),
    orgId,
    date: dateIso,
    dateYmd,
    dateLabel: formatDateLabel(dateYmd),
    name: normalizeText(row?.name),
    nip: normalizeText(row?.nip),
    city: normalizeText(row?.city),
    address: normalizeText(row?.address),
    contact: normalizeText(row?.contact),
    clientInfo: normalizeText(row?.clientInfo),
    qrCode: normalizeText(row?.qrCode),
    // kompatybilność z nazwami ze starego skryptu
    klientIndId: normalizeText(row?.clientIndId),
    data: dateYmd,
    dataFmt: formatDateLabel(dateYmd),
    nazwa: normalizeText(row?.name),
    miasto: normalizeText(row?.city),
    informacje: normalizeText(row?.clientInfo),
  }
}

function sortIndividualOrders(items) {
  return [...items].sort((left, right) => {
    const leftDate = String(left.dateYmd ?? '')
    const rightDate = String(right.dateYmd ?? '')
    if (leftDate !== rightDate) {
      return leftDate < rightDate ? 1 : -1
    }

    return String(left.clientIndId ?? '').localeCompare(String(right.clientIndId ?? ''), 'pl', { sensitivity: 'base' })
  })
}

function filterIndividualOrders(items, qValue) {
  const q = normalizeForSearch(qValue)
  if (!q) {
    return items
  }

  return items.filter((item) => {
    const haystack = normalizeForSearch(
      [
        item.clientIndId,
        item.dateYmd,
        item.name,
        item.nip,
        item.city,
        item.address,
        item.contact,
        item.clientInfo,
        item.qrCode,
      ].join(' '),
    )
    return haystack.includes(q)
  })
}

async function fetchAllIndividualOrders(orgId) {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  ensureFirebase()
  const response = await individualJobsForOrg({ orgId })
  const rows = response?.data?.individualClientJobs ?? []
  return rows.map((row) => mapIndividualOrder(orgId, row))
}

function nextCode(existingValues, prefix, padding = 4) {
  const pattern = new RegExp(`^${prefix}(\\d+)$`, 'i')
  let maxValue = 0

  existingValues.forEach((value) => {
    const match = String(value ?? '').trim().match(pattern)
    if (!match) {
      return
    }

    const numeric = Number(match[1])
    if (Number.isFinite(numeric) && numeric > maxValue) {
      maxValue = numeric
    }
  })

  return `${prefix}${String(maxValue + 1).padStart(padding, '0')}`
}

function toMutationPayload(payload = {}) {
  return {
    date: ymdToTimestamp(payload.dateYmd ?? payload.date),
    name: normalizeText(payload.name ?? payload.nazwa) || null,
    nip: normalizeText(payload.nip) || null,
    city: normalizeText(payload.city ?? payload.miasto) || null,
    address: normalizeText(payload.address ?? payload.adres) || null,
    contact: normalizeText(payload.contact ?? payload.kontakt) || null,
    clientInfo: normalizeText(payload.clientInfo ?? payload.informacje) || null,
    qrCode: normalizeText(payload.qrCode) || null,
  }
}

export async function getIndividualOrders(orgId, filters = {}) {
  const mapped = await fetchAllIndividualOrders(orgId)
  const sorted = sortIndividualOrders(mapped)
  const filtered = filterIndividualOrders(sorted, filters.q)
  const paged = paginate(filtered, filters.page, filters.pageSize)

  return {
    orgId,
    filters,
    ...paged,
  }
}

export async function createIndividualOrder(orgId, payload = {}) {
  const allOrders = await fetchAllIndividualOrders(orgId)
  const desiredId = normalizeText(payload.clientIndId ?? payload.id)
  const clientIndId = desiredId || nextCode(allOrders.map((item) => item.clientIndId), 'LIK', 4)
  const existingById = allOrders.some((item) => item.clientIndId === clientIndId)
  if (existingById) {
    throw new Error(`KlientIndID już istnieje: ${clientIndId}.`)
  }

  const desiredQrCode = normalizeText(payload.qrCode)
  const qrCode = desiredQrCode || nextCode(allOrders.map((item) => item.qrCode), 'BCI', 4)
  const mutationPayload = toMutationPayload({ ...payload, qrCode })

  ensureFirebase()
  await insertIndividualJobForOrg({
    orgId,
    clientIndId,
    ...mutationPayload,
  })

  return mapIndividualOrder(orgId, {
    clientIndId,
    date: mutationPayload.date,
    name: mutationPayload.name,
    nip: mutationPayload.nip,
    city: mutationPayload.city,
    address: mutationPayload.address,
    contact: mutationPayload.contact,
    clientInfo: mutationPayload.clientInfo,
    qrCode: mutationPayload.qrCode,
  })
}

export async function updateIndividualOrder(orgId, originalClientIndId, payload = {}) {
  const allOrders = await fetchAllIndividualOrders(orgId)
  const sourceId = normalizeText(originalClientIndId ?? payload.originalClientIndId ?? payload.clientIndId)
  if (!sourceId) {
    throw new Error('Brak identyfikatora zlecenia do edycji.')
  }

  const source = allOrders.find((item) => item.clientIndId === sourceId)
  if (!source) {
    throw new Error(`Nie znaleziono zlecenia o ID: ${sourceId}.`)
  }

  const desiredId = normalizeText(payload.clientIndId ?? payload.id) || sourceId
  const desiredQrCode = normalizeText(payload.qrCode)
  const qrCode =
    desiredQrCode || source.qrCode || nextCode(allOrders.filter((item) => item.clientIndId !== sourceId).map((item) => item.qrCode), 'BCI', 4)
  const mutationPayload = toMutationPayload({ ...source, ...payload, qrCode })

  ensureFirebase()

  if (desiredId !== sourceId) {
    const idExists = allOrders.some((item) => item.clientIndId === desiredId)
    if (idExists) {
      throw new Error(`KlientIndID już istnieje: ${desiredId}.`)
    }

    await insertIndividualJobForOrg({
      orgId,
      clientIndId: desiredId,
      ...mutationPayload,
    })
    await deleteIndividualJobForOrg({
      orgId,
      clientIndId: sourceId,
    })
  } else {
    await updateIndividualJobForOrg({
      orgId,
      clientIndId: sourceId,
      ...mutationPayload,
    })
  }

  return mapIndividualOrder(orgId, {
    clientIndId: desiredId,
    date: mutationPayload.date,
    name: mutationPayload.name,
    nip: mutationPayload.nip,
    city: mutationPayload.city,
    address: mutationPayload.address,
    contact: mutationPayload.contact,
    clientInfo: mutationPayload.clientInfo,
    qrCode: mutationPayload.qrCode,
  })
}

export async function deleteIndividualOrder(orgId, clientIndId) {
  const normalizedId = normalizeText(clientIndId)
  if (!normalizedId) {
    throw new Error('Brak identyfikatora zlecenia do usunięcia.')
  }

  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  ensureFirebase()
  await deleteIndividualJobForOrg({
    orgId,
    clientIndId: normalizedId,
  })

  return {
    success: true,
    orgId,
    clientIndId: normalizedId,
  }
}
