import { clientsForOrg, updateZoneForOrg, zonesForOrg } from '@dataconnect/generated'
import { executeMutation, mutationRef } from 'firebase/data-connect'
import { ensureFirebase, isFirebaseConfigured, waitForFirebaseAuthReady } from '../firebase/firebaseClient'

function toText(value) {
  return String(value ?? '').trim()
}

function toLower(value) {
  return toText(value).toLowerCase()
}

function removeDiacritics(value) {
  const raw = toText(value)
  if (!raw) return ''
  try {
    return raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  } catch {
    return raw
  }
}

function compactKey(value) {
  return removeDiacritics(value).toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function assertConfigured() {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase/Data Connect dla mobile-web.')
  }
}

function operationMissing(error, operationName) {
  return toText(error?.message).includes(`operation "${operationName}" not found`)
}

function getDataConnectInstance() {
  const firebase = ensureFirebase()
  const dataConnect = firebase?.dataConnect
  if (!dataConnect) {
    throw new Error('Nie udało się zainicjalizować Data Connect.')
  }
  return dataConnect
}

async function runMutationOperation(operationName, variables) {
  return executeMutation(mutationRef(getDataConnectInstance(), operationName, variables))
}

async function assertSignedInUser() {
  const user = await waitForFirebaseAuthReady()
  if (!user) {
    const error = new Error('Sesja wygasła. Zaloguj się ponownie.')
    error.code = 'UNAUTHENTICATED'
    throw error
  }
}

function ensureOrgId(session) {
  const orgId = toText(session?.orgId)
  if (!orgId) {
    throw new Error('Brak orgId w sesji mobile.')
  }
  return orgId
}

function mapFunctionToCanonical(value) {
  const raw = toText(value)
  if (!raw) return ''

  const upper = raw.toUpperCase()
  const lower = raw.toLowerCase()
  if (upper === 'START') return 'START'
  if (upper === 'STOP0') return 'STOP0'
  if (upper === 'STOP5') return 'STOP5'
  if (upper === 'STOP10') return 'STOP10'
  if (upper === 'STOP15') return 'STOP15'
  if (lower === 'clean') return 'clean'
  if (lower === 'sprzatanie_indywidualne') return 'clean'
  if (lower === 'zlecenie_indywidualne') return 'clean'
  if (lower === 'podajnik_mydlo') return 'podajnik_mydlo'
  if (lower === 'podajnik_papier_toaletowy') return 'podajnik_papier_toaletowy'
  if (lower === 'podajnik_reczniki_papierowe') return 'podajnik_reczniki_papierowe'
  if (lower === 'podajnik_inne') return 'podajnik_inne'
  if (lower === 'magazyn_lokalizacja') return 'magazyn_lokalizacja'
  if (raw === 'Indeks' || lower === 'indeks') return 'Indeks'

  const key = compactKey(raw)
  const map = {
    sprzatanie: 'clean',
    zlecenieindywidualne: 'clean',
    sprzatanieindywidualne: 'clean',
    startczaspracy: 'START',
    stop0czaspracy0min: 'STOP0',
    stop5czaspracy5min: 'STOP5',
    stop10czaspracy10min: 'STOP10',
    stop15czaspracy15min: 'STOP15',
    podajnikmydlo: 'podajnik_mydlo',
    podajnikpapiertoaletowy: 'podajnik_papier_toaletowy',
    podajnikrecznikipapierowe: 'podajnik_reczniki_papierowe',
    podajnikinne: 'podajnik_inne',
    indeksprodukt: 'Indeks',
    magazynlokalizacjamagazynowa: 'magazyn_lokalizacja',
  }
  return map[key] || raw
}

function mapFunctionToUiLabel(value) {
  const canonical = mapFunctionToCanonical(value)
  const labels = {
    clean: 'Sprzątanie',
    START: 'START (czas pracy)',
    STOP0: 'STOP0 (czas pracy + 0 min)',
    STOP5: 'STOP5 (czas pracy + 5 min)',
    STOP10: 'STOP10 (czas pracy + 10 min)',
    STOP15: 'STOP15 (czas pracy + 15 min)',
    podajnik_mydlo: 'Podajnik: mydło',
    podajnik_papier_toaletowy: 'Podajnik: papier toaletowy',
    podajnik_reczniki_papierowe: 'Podajnik: ręczniki papierowe',
    podajnik_inne: 'Podajnik: inne',
    Indeks: 'Indeks - Produkt',
    magazyn_lokalizacja: 'Magazyn - lokalizacja magazynowa',
  }
  return labels[canonical] || toText(value)
}

function makeId(prefix) {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`
    }
  } catch {
    // Ignore fallback.
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`
}

function normalizeZones(zoneRows, clientsMap) {
  return (zoneRows || []).map((row) => ({
    zoneId: toText(row.ZoneId || row.zoneId || row.zoneID || row.id),
    id: toText(row.ZoneId || row.zoneId || row.zoneID || row.id),
    clientId: toText(row.clientId),
    clientName: clientsMap.get(toText(row.clientId)) || '',
    placeName: toText(row.zone),
    functionRaw: toText(row.function),
    functionLabel: mapFunctionToUiLabel(row.function),
    functionCanonical: mapFunctionToCanonical(row.function),
    location: toText(row.location),
    workerLogin: toText(row.workerLogin),
    editedBy: toText(row.editedBy),
    date: toText(row.date),
  }))
}

export async function loadCoordinatorContext(session) {
  assertConfigured()
  await assertSignedInUser()
  const orgId = ensureOrgId(session)

  const [clientsResponse, zonesResponse] = await Promise.all([
    clientsForOrg({ orgId }),
    zonesForOrg({ orgId }),
  ])

  const clientsRows = clientsResponse?.data?.clients ?? []
  const clients = clientsRows
    .map((row) => ({
      clientId: toText(row.clientId),
      name: toText(row.name),
    }))
    .filter((row) => row.clientId && row.name)
    .sort((a, b) => a.name.localeCompare(b.name, 'pl'))

  const clientsMap = new Map(clients.map((row) => [row.clientId, row.name]))
  const zonesRows = zonesResponse?.data?.zones ?? []
  const zones = normalizeZones(zonesRows, clientsMap)

  return {
    clients,
    zones,
  }
}

export function findZoneByQrId(zones, qrId) {
  const key = toLower(qrId)
  const compactKey = key.replace(/[^a-z0-9]+/g, '')
  if (!key) return null
  return (
    (zones || []).find((row) => {
      const zoneId = toLower(row.zoneId || row.id)
      if (!zoneId) return false
      const compactZoneId = zoneId.replace(/[^a-z0-9]+/g, '')
      return zoneId === key || compactZoneId === compactKey
    }) ?? null
  )
}

export async function saveZoneAssignment(session, context, payload) {
  assertConfigured()
  await assertSignedInUser()
  const orgId = ensureOrgId(session)

  const qrId = toText(payload?.qrId)
  if (!qrId) {
    throw new Error('Uzupełnij ID z kodu QR.')
  }

  const zone = findZoneByQrId(context?.zones || [], qrId)
  if (!zone) {
    throw new Error('Brak kodu QR w bazie stref.')
  }

  const selectedClientName = toText(payload?.clientName)
  const selectedClient = (context?.clients || []).find((row) => toText(row.name) === selectedClientName)
  const clientId = toText(selectedClient?.clientId || zone.clientId)
  if (!clientId) {
    throw new Error('Wybierz klienta.')
  }

  const functionCanonical = mapFunctionToCanonical(payload?.functionName)
  const placeName = toText(payload?.placeName || zone.placeName)
  const location = toText(payload?.location)
  const editedBy = toText(session?.workerLogin || session?.login)
  const date = new Date().toISOString()

  await updateZoneForOrg({
    orgId,
    zoneId: zone.zoneId,
    clientId,
    zone: placeName || null,
    function: functionCanonical || null,
    editedBy: editedBy || null,
    date,
    location: location || null,
  })

  return {
    zoneId: zone.zoneId,
    clientId,
    functionCanonical,
    placeName,
    location,
  }
}

function resolveCleanLabel(value) {
  return Number(value) === 1 ? 'TAK' : 'NIE'
}

export async function logAuditZone(session, snapshot, params) {
  assertConfigured()
  await assertSignedInUser()
  const orgId = ensureOrgId(session)
  const zoneId = toText(params?.zoneId)
  if (!zoneId) {
    throw new Error('Brak kodu strefy do audytu.')
  }

  const zone = (snapshot?.zones || []).find((row) => toLower(row.id) === toLower(zoneId))
  if (!zone) {
    throw new Error('Nie znaleziono strefy dla podanego kodu QR.')
  }

  const cleanValue = Number(params?.cleanValue)
  if (cleanValue !== 0 && cleanValue !== 1) {
    throw new Error('Wybierz odpowiedź TAK lub NIE.')
  }

  const comment = toText(params?.comment).slice(0, 300)
  const nowIso = new Date().toISOString()
  const meta = {
    schema: 'BC.AUDIT.ZONE.v2',
    zone: { qr: zoneId },
    answer: { clean: cleanValue },
    comment,
    deviceAt: nowIso,
  }

  const workerLogin = toText(snapshot?.worker?.login)

  try {
    await runMutationOperation('InsertEventForOrg', {
      orgId,
      eventId: makeId('AUD'),
      zoneId,
      workerLogin: workerLogin || null,
      startAt: nowIso,
      endAt: nowIso,
      durationSec: 0,
      status: 'CLOSED',
      closeMarkedAt: nowIso,
      endReason: cleanValue === 1 ? 'AUDIT_CLEAN' : 'AUDIT_DIRTY',
      comment: `AUDYT STREFY: ${resolveCleanLabel(cleanValue)} | ${comment}${comment ? ' | ' : ''}${JSON.stringify(meta)}`,
      deviceId: null,
      startEventId: null,
      endEventId: null,
    })
  } catch (error) {
    if (!operationMissing(error, 'InsertEventForOrg')) {
      throw error
    }

    throw new Error('Brak operacji InsertEventForOrg w Data Connect. Wdroz dataconnect (firebase deploy --only dataconnect).')
  }

  return {
    cleanValue,
    comment,
    zoneId,
  }
}

export function isStartZoneFunction(functionValue) {
  return mapFunctionToCanonical(functionValue) === 'START'
}

export function defaultQrFunctionLabel() {
  return 'Sprzatanie'
}

