'use strict'

const MOBILE_COORDINATOR_ZONE_CONTRACT_VERSION = 'mobile-coordinator-zone-v1'
const MOBILE_COORDINATOR_ZONE_MAX_BODY_BYTES = 16 * 1024

const ALLOWED_FUNCTIONS = new Set([
  'clean',
  'strefa_specjalna',
  'START',
  'STOP0',
  'STOP5',
  'STOP10',
  'STOP15',
  'podajnik_mydlo',
  'podajnik_papier_toaletowy',
  'podajnik_reczniki_papierowe',
  'podajnik_inne',
  'Indeks',
  'magazyn_lokalizacja',
])

const COORDINATOR_ROLES = new Set([
  'ADMIN',
  'OWNER',
  'PLATFORM_OWNER',
  'MANAGER',
  'COORDINATOR',
  'KOORDYNATOR',
  'KIEROWNIK',
])

function text(value) {
  return String(value ?? '').trim()
}

function limitedText(value, maxLength) {
  return text(value).slice(0, maxLength)
}

function canonicalRole(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
}

function publicError(statusCode, publicCode, publicMessage) {
  const error = new Error(publicCode)
  error.statusCode = statusCode
  error.publicCode = publicCode
  error.publicMessage = publicMessage
  return error
}

function assertCoordinatorAccess(session) {
  const roles = [
    session?.membership?.role,
    session?.worker?.role,
    session?.worker?.type,
  ].map(canonicalRole).filter(Boolean)

  if (!roles.some((role) => COORDINATOR_ROLES.has(role))) {
    throw publicError(
      403,
      'MOBILE_COORDINATOR_ACCESS_DENIED',
      'To konto nie ma uprawnien koordynatora do edycji kodow QR.',
    )
  }
}

function normalizePatchPayload(payload) {
  if (
    Object.prototype.hasOwnProperty.call(payload || {}, 'orgId') ||
    Object.prototype.hasOwnProperty.call(payload || {}, 'workerId') ||
    Object.prototype.hasOwnProperty.call(payload || {}, 'personId')
  ) {
    throw publicError(
      400,
      'MOBILE_COORDINATOR_SCOPE_FORBIDDEN',
      'Organizacja i pracownik sa ustalane z sesji.',
    )
  }

  const zoneId = limitedText(payload?.zoneId, 64)
  const clientId = limitedText(payload?.clientId, 64)
  const functionName = limitedText(payload?.function, 120)
  const zone = limitedText(payload?.zone, 500) || null
  const location = limitedText(payload?.location, 500) || null

  if (!zoneId) throw publicError(400, 'INVALID_ZONE_ID', 'Brak identyfikatora kodu QR.')
  if (!clientId) throw publicError(400, 'INVALID_CLIENT_ID', 'Wybierz klienta.')
  if (!ALLOWED_FUNCTIONS.has(functionName)) {
    throw publicError(400, 'INVALID_ZONE_FUNCTION', 'Wybierz obslugiwana funkcje kodu QR.')
  }

  return { zoneId, clientId, functionName, zone, location }
}

function mapClient(row) {
  return {
    clientId: text(row?.client_id),
    name: text(row?.name),
  }
}

function mapZone(row) {
  return {
    zoneId: text(row?.id),
    clientId: text(row?.client_id).toUpperCase() === 'UNASSIGNED' ? '' : text(row?.client_id),
    zone: text(row?.zone),
    function: text(row?.function),
    editedBy: text(row?.edited_by),
    date: row?.date instanceof Date ? row.date.toISOString() : text(row?.date),
    location: text(row?.location),
  }
}

async function readCoordinatorZoneContext(client, orgId) {
  const clientsResult = await client.query(
    `select client_id, name
       from public.client
      where org_id = $1::text
        and upper(client_id) <> 'UNASSIGNED'
      order by lower(name), client_id`,
    [orgId],
  )
  const zonesResult = await client.query(
    `select id, client_id, zone, function, edited_by, date, location
       from public.zone
      where org_id = $1::text
      order by id`,
    [orgId],
  )
  return {
    clients: (clientsResult.rows || []).map(mapClient).filter((row) => row.clientId && row.name),
    zones: (zonesResult.rows || []).map(mapZone).filter((row) => row.zoneId),
  }
}

async function updateCoordinatorZone(client, orgId, workerLogin, payload) {
  const normalized = normalizePatchPayload(payload)
  const zoneResult = await client.query(
    `select id
       from public.zone
      where org_id = $1::text
        and id = $2::text
      for update`,
    [orgId, normalized.zoneId],
  )
  if (!zoneResult.rows[0]) {
    throw publicError(404, 'ZONE_NOT_FOUND', 'Nie znaleziono tego kodu QR w organizacji.')
  }

  const clientResult = await client.query(
    `select 1
       from public.client
      where org_id = $1::text
        and client_id = $2::text
        and upper(client_id) <> 'UNASSIGNED'
      limit 1`,
    [orgId, normalized.clientId],
  )
  if (!clientResult.rows[0]) {
    throw publicError(400, 'INVALID_CLIENT_ID', 'Wybrany klient nie nalezy do aktywnej organizacji.')
  }

  const result = await client.query(
    `update public.zone
        set client_id = $3::text,
            zone = $4::text,
            function = $5::text,
            required_visit = case
              when upper($5::text) like 'START%' or upper($5::text) like 'STOP%' then false
              else required_visit
            end,
            edited_by = $6::text,
            date = now(),
            location = $7::text
      where org_id = $1::text
        and id = $2::text
    returning id, client_id, zone, function, edited_by, date, location`,
    [
      orgId,
      normalized.zoneId,
      normalized.clientId,
      normalized.zone,
      normalized.functionName,
      limitedText(workerLogin, 120),
      normalized.location,
    ],
  )
  return mapZone(result.rows[0])
}

function requireDependencies(dependencies) {
  const required = [
    'connectDbClient',
    'isEnabled',
    'isOrganizationAllowed',
    'mapDatabaseConnectionError',
    'mapFirebaseAdminError',
    'parseBearerToken',
    'readJsonBody',
    'resolveSession',
    'sendMobileApiError',
    'sendMobileJson',
    'verifyFirebaseIdToken',
  ]
  const missing = required.filter((name) => typeof dependencies?.[name] !== 'function')
  if (missing.length) {
    throw new TypeError(`Mobile coordinator zone API dependencies are incomplete: ${missing.join(', ')}.`)
  }
}

function createMobileCoordinatorZoneApi(dependencies = {}) {
  requireDependencies(dependencies)

  async function handle(req, res) {
    if (req?.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
      })
      res.end()
      return
    }

    if (!dependencies.isEnabled()) {
      dependencies.sendMobileApiError(
        res,
        404,
        'MOBILE_COORDINATOR_QR_DISABLED',
        'Edycja kodow QR nie jest aktywna.',
      )
      return
    }

    const method = text(req?.method || 'GET').toUpperCase()
    if (!['GET', 'PATCH'].includes(method)) {
      dependencies.sendMobileApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Dozwolone metody to GET i PATCH.')
      return
    }

    const token = dependencies.parseBearerToken(req)
    if (!token) {
      dependencies.sendMobileApiError(res, 401, 'UNAUTHENTICATED', 'Brak tokenu Firebase.')
      return
    }

    let decodedToken
    try {
      decodedToken = await dependencies.verifyFirebaseIdToken(token)
    } catch (error) {
      const mapped = dependencies.mapFirebaseAdminError(error) || {}
      dependencies.sendMobileApiError(
        res,
        Number(mapped.status) === 500 ? 500 : 401,
        text(mapped.code) || 'UNAUTHENTICATED',
        Number(mapped.status) === 500
          ? text(mapped.message) || 'Nie udalo sie zweryfikowac sesji.'
          : 'Token Firebase jest niepoprawny albo wygasl.',
      )
      return
    }

    let payload = {}
    if (method === 'PATCH') {
      try {
        payload = await dependencies.readJsonBody(req, MOBILE_COORDINATOR_ZONE_MAX_BODY_BYTES)
      } catch (error) {
        const tooLarge = error?.message === 'REQUEST_BODY_TOO_LARGE'
        dependencies.sendMobileApiError(
          res,
          tooLarge ? 413 : 400,
          tooLarge ? 'REQUEST_TOO_LARGE' : 'INVALID_JSON',
          tooLarge ? 'Dane strefy sa zbyt duze.' : 'Niepoprawne dane strefy.',
        )
        return
      }
    }

    let client = null
    let transactionStarted = false
    try {
      client = await dependencies.connectDbClient()
      const session = await dependencies.resolveSession(client, decodedToken)
      if (!dependencies.isOrganizationAllowed(session?.orgId)) {
        throw publicError(404, 'MOBILE_COORDINATOR_QR_DISABLED', 'Edycja kodow QR nie jest aktywna.')
      }
      assertCoordinatorAccess(session)

      if (method === 'GET') {
        const context = await readCoordinatorZoneContext(client, session.orgId)
        dependencies.sendMobileJson(res, 200, {
          ok: true,
          contractVersion: MOBILE_COORDINATOR_ZONE_CONTRACT_VERSION,
          ...context,
          serverAt: new Date().toISOString(),
        })
        return
      }

      await client.query('begin')
      transactionStarted = true
      const zone = await updateCoordinatorZone(
        client,
        session.orgId,
        session?.worker?.login,
        payload,
      )
      await client.query('commit')
      transactionStarted = false
      dependencies.sendMobileJson(res, 200, {
        ok: true,
        contractVersion: MOBILE_COORDINATOR_ZONE_CONTRACT_VERSION,
        zone,
      })
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query('rollback')
        } catch {
          // The original error remains authoritative.
        }
      }
      const mappedDb = dependencies.mapDatabaseConnectionError(error)
      dependencies.sendMobileApiError(
        res,
        Number(error?.statusCode || mappedDb?.status || 500),
        text(error?.publicCode) || text(mappedDb?.code) || 'MOBILE_COORDINATOR_QR_ERROR',
        text(error?.publicMessage) || text(mappedDb?.message) || 'Nie udalo sie obsluzyc edycji kodu QR.',
      )
    } finally {
      client?.release?.()
    }
  }

  return Object.freeze({ handle })
}

module.exports = {
  MOBILE_COORDINATOR_ZONE_CONTRACT_VERSION,
  MOBILE_COORDINATOR_ZONE_MAX_BODY_BYTES,
  assertCoordinatorAccess,
  createMobileCoordinatorZoneApi,
  normalizePatchPayload,
  readCoordinatorZoneContext,
  updateCoordinatorZone,
}
