'use strict'

const PORTAL_ZONE_MAX_BODY_BYTES = 16 * 1024

function text(value) {
  return String(value ?? '').trim()
}

function limitedText(value, maxLength) {
  return text(value).slice(0, maxLength)
}

function httpStatus(value, fallback = 500) {
  const status = Number(value)
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : fallback
}

function functionAllowsRequiredVisit(value) {
  const normalized = text(value).toUpperCase()
  return Boolean(normalized) && !normalized.startsWith('START') && !normalized.startsWith('STOP')
}

function requireDependencies(dependencies) {
  const required = [
    'authorize',
    'connectDbClient',
    'mapDatabaseConnectionError',
    'mapFirebaseAdminError',
    'parseBearerToken',
    'readJsonBody',
    'sendApiError',
    'sendJson',
    'verifyFirebaseIdToken',
  ]
  const missing = required.filter((name) => typeof dependencies?.[name] !== 'function')
  if (missing.length) {
    throw new TypeError(`Portal zone API dependencies are incomplete: ${missing.join(', ')}.`)
  }
}

function publicError(statusCode, publicCode, publicMessage) {
  const error = new Error(publicCode)
  error.statusCode = statusCode
  error.publicCode = publicCode
  error.publicMessage = publicMessage
  return error
}

function parseUid(decodedToken) {
  return text(decodedToken?.uid || decodedToken?.sub)
}

function normalizeWritePayload(payload) {
  const orgId = limitedText(payload?.orgId, 64)
  const zoneId = limitedText(payload?.zoneId ?? payload?.id, 64)
  const clientId = limitedText(payload?.clientId, 64)
  const functionName = limitedText(payload?.function, 120)
  const zone = limitedText(payload?.zone ?? payload?.name, 500) || null
  const location = limitedText(payload?.location, 500) || null

  if (!orgId) throw publicError(400, 'INVALID_ORG_ID', 'Brak poprawnego orgId.')
  if (!zoneId) throw publicError(400, 'INVALID_ZONE_ID', 'Brak poprawnego identyfikatora kodu QR.')
  if (!clientId) throw publicError(400, 'INVALID_CLIENT_ID', 'Wybierz klienta przypisanego do strefy.')
  if (!functionName) throw publicError(400, 'INVALID_ZONE_FUNCTION', 'Wybierz funkcję kodu QR.')
  if (typeof payload?.requiredVisit !== 'boolean') {
    throw publicError(400, 'INVALID_REQUIRED_VISIT', 'Pole wymaganej wizyty musi mieć wartość tak albo nie.')
  }

  return {
    orgId,
    zoneId,
    clientId,
    zone,
    functionName,
    requiredVisit: functionAllowsRequiredVisit(functionName) && payload.requiredVisit === true,
    location,
  }
}

function mapZoneRow(row) {
  return {
    id: text(row?.id),
    zoneId: text(row?.id),
    clientId: text(row?.client_id).toUpperCase() === 'UNASSIGNED' ? '' : text(row?.client_id),
    zone: text(row?.zone),
    name: text(row?.zone),
    function: text(row?.function),
    requiredVisit: row?.required_visit === true,
    editedBy: text(row?.edited_by),
    date: row?.date instanceof Date ? row.date.toISOString() : text(row?.date),
    location: text(row?.location),
  }
}

async function assertClientBelongsToOrganization(client, orgId, clientId) {
  if (clientId.toUpperCase() === 'UNASSIGNED') return
  const result = await client.query(
    `select 1
       from public.client
      where org_id = $1::text
        and client_id = $2::text
      limit 1`,
    [orgId, clientId],
  )
  if (!result.rows[0]) {
    throw publicError(400, 'INVALID_CLIENT_ID', 'Wybrany klient nie należy do aktywnej organizacji.')
  }
}

async function readRequiredVisitFlags(client, orgId) {
  const result = await client.query(
    `select id, required_visit
       from public.zone
      where org_id = $1::text
      order by id asc`,
    [orgId],
  )
  return result.rows.map((row) => ({
    zoneId: text(row?.id),
    requiredVisit: row?.required_visit === true,
  }))
}

async function writeZone(client, method, payload, editedBy) {
  const normalized = normalizeWritePayload(payload)
  await assertClientBelongsToOrganization(client, normalized.orgId, normalized.clientId)

  let result
  if (method === 'POST') {
    result = await client.query(
      `insert into public.zone (
         org_id, id, client_id, zone, function, required_visit, edited_by, date, location
       )
       values ($1::text, $2::text, $3::text, $4::text, $5::text, $6::boolean, $7::text, now(), $8::text)
       returning id, client_id, zone, function, required_visit, edited_by, date, location`,
      [
        normalized.orgId,
        normalized.zoneId,
        normalized.clientId,
        normalized.zone,
        normalized.functionName,
        normalized.requiredVisit,
        editedBy,
        normalized.location,
      ],
    )
  } else {
    result = await client.query(
      `update public.zone
          set client_id = $3::text,
              zone = $4::text,
              function = $5::text,
              required_visit = $6::boolean,
              edited_by = $7::text,
              date = now(),
              location = $8::text
        where org_id = $1::text
          and id = $2::text
      returning id, client_id, zone, function, required_visit, edited_by, date, location`,
      [
        normalized.orgId,
        normalized.zoneId,
        normalized.clientId,
        normalized.zone,
        normalized.functionName,
        normalized.requiredVisit,
        editedBy,
        normalized.location,
      ],
    )
    if (!result.rows[0]) {
      throw publicError(404, 'ZONE_NOT_FOUND', 'Nie znaleziono tego kodu QR w organizacji.')
    }
  }

  return mapZoneRow(result.rows[0])
}

function createPortalZoneApi(dependencies = {}) {
  requireDependencies(dependencies)
  const {
    authorize,
    connectDbClient,
    mapDatabaseConnectionError,
    mapFirebaseAdminError,
    parseBearerToken,
    readJsonBody,
    sendApiError,
    sendJson,
    verifyFirebaseIdToken,
  } = dependencies

  async function handle(req, res, requestUrl) {
    if (req?.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const method = text(req?.method || 'GET').toUpperCase()
    if (!['GET', 'POST', 'PATCH'].includes(method)) {
      sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Dozwolone metody to GET, POST i PATCH.')
      return
    }

    const token = parseBearerToken(req)
    if (!token) {
      sendApiError(res, 401, 'UNAUTHENTICATED', 'Brak tokenu Firebase.')
      return
    }

    let decodedToken
    try {
      decodedToken = await verifyFirebaseIdToken(token)
    } catch (error) {
      const mapped = mapFirebaseAdminError(error) || {}
      sendApiError(
        res,
        httpStatus(mapped.status, 401),
        text(mapped.code) || 'UNAUTHENTICATED',
        text(mapped.message) || 'Token Firebase jest niepoprawny albo wygasł.',
      )
      return
    }

    const uid = parseUid(decodedToken)
    if (!uid) {
      sendApiError(res, 401, 'UNAUTHENTICATED', 'Token Firebase nie zawiera tożsamości użytkownika.')
      return
    }

    let payload
    try {
      payload = method === 'GET'
        ? { orgId: requestUrl?.searchParams?.get('orgId') || '' }
        : await readJsonBody(req, PORTAL_ZONE_MAX_BODY_BYTES)
    } catch (error) {
      const tooLarge = error?.message === 'REQUEST_BODY_TOO_LARGE'
      sendApiError(
        res,
        tooLarge ? 413 : 400,
        tooLarge ? 'REQUEST_TOO_LARGE' : 'INVALID_JSON',
        tooLarge ? 'Dane strefy są zbyt duże.' : 'Niepoprawne dane strefy.',
      )
      return
    }

    const orgId = limitedText(payload?.orgId, 64)
    if (!orgId) {
      sendApiError(res, 400, 'INVALID_ORG_ID', 'Brak poprawnego orgId.')
      return
    }

    let client = null
    let transactionStarted = false
    try {
      client = await connectDbClient()
      if (method === 'GET') {
        await authorize(client, { orgId, uid, write: false })
        const zones = await readRequiredVisitFlags(client, orgId)
        sendJson(res, 200, { ok: true, data: { zones } })
        return
      }

      await client.query('begin')
      transactionStarted = true
      await authorize(client, { orgId, uid, write: true })
      const editedBy = limitedText(decodedToken?.email || uid, 120)
      const zone = await writeZone(client, method, payload, editedBy)
      await client.query('commit')
      transactionStarted = false
      sendJson(res, method === 'POST' ? 201 : 200, { ok: true, data: { zone } })
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query('rollback')
        } catch {
          // The original error remains authoritative.
        }
      }
      const mappedDb = mapDatabaseConnectionError(error)
      if (mappedDb) {
        sendApiError(res, mappedDb.status, mappedDb.code, mappedDb.message)
        return
      }
      const conflict = error?.code === '23505'
      sendApiError(
        res,
        conflict ? 409 : httpStatus(error?.statusCode, 500),
        conflict ? 'ZONE_ALREADY_EXISTS' : text(error?.publicCode) || 'PORTAL_ZONE_ERROR',
        conflict
          ? 'Kod QR o tym identyfikatorze już istnieje.'
          : text(error?.publicMessage) || 'Nie udało się zapisać strefy.',
      )
    } finally {
      client?.release?.()
    }
  }

  return Object.freeze({ handle })
}

module.exports = {
  PORTAL_ZONE_MAX_BODY_BYTES,
  createPortalZoneApi,
  functionAllowsRequiredVisit,
  normalizeWritePayload,
  readRequiredVisitFlags,
  writeZone,
}
