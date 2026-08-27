'use strict'

const FACILITY_MANAGER_OBJECT_MAX_BODY_BYTES = 16 * 1024

function text(value) {
  return String(value ?? '').trim()
}

function httpStatus(value, fallback = 500) {
  const status = Number(value)
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : fallback
}

function requireDependencies(dependencies) {
  const required = [
    'connectDbClient',
    'getFacilityManagerObjectService',
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
    throw new TypeError(`Facility-manager object API dependencies are incomplete: ${missing.join(', ')}.`)
  }
}

function parseUid(decodedToken) {
  return text(decodedToken?.uid || decodedToken?.sub)
}

function sendPublicError(res, error, sendApiError) {
  sendApiError(
    res,
    httpStatus(error?.statusCode, 500),
    text(error?.publicCode) || 'FACILITY_MANAGER_OBJECT_ERROR',
    text(error?.publicMessage) || 'Nie udało się zapisać obiektu. Spróbuj ponownie później.',
  )
}

function createFacilityManagerObjectApi(dependencies = {}) {
  requireDependencies(dependencies)
  const {
    connectDbClient,
    getFacilityManagerObjectService,
    mapDatabaseConnectionError,
    mapFirebaseAdminError,
    parseBearerToken,
    readJsonBody,
    sendApiError,
    sendJson,
    verifyFirebaseIdToken,
  } = dependencies

  async function handleRequest(req, res, requestUrl) {
    if (req?.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const method = text(req?.method || 'GET').toUpperCase()
    if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) {
      sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Dozwolone metody to GET, POST, PATCH i DELETE.')
      return
    }

    let payload = null
    if (method !== 'GET') {
      try {
        payload = await readJsonBody(req, FACILITY_MANAGER_OBJECT_MAX_BODY_BYTES)
      } catch (error) {
        if (error?.message === 'REQUEST_BODY_TOO_LARGE') {
          sendApiError(res, 413, 'REQUEST_TOO_LARGE', 'Dane obiektu są zbyt duże.')
          return
        }
        sendApiError(res, 400, 'INVALID_JSON', 'Niepoprawne dane obiektu.')
        return
      }
    } else {
      payload = { orgId: requestUrl?.searchParams?.get('orgId') || '' }
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

    let client = null
    try {
      const service = await getFacilityManagerObjectService()
      client = await connectDbClient()
      let result
      if (method === 'GET') {
        result = await service.list({ client, uid, orgId: payload.orgId })
      } else if (method === 'POST') {
        result = await service.create({ client, uid, payload })
      } else if (method === 'PATCH') {
        result = await service.update({ client, uid, payload })
      } else {
        result = await service.archive({ client, uid, payload })
      }
      sendJson(res, method === 'POST' && result?.createdNow === true ? 201 : 200, { ok: true, data: result })
    } catch (error) {
      const mappedDb = mapDatabaseConnectionError(error)
      if (mappedDb) {
        sendApiError(
          res,
          httpStatus(mappedDb.status, 503),
          text(mappedDb.code) || 'DATABASE_UNAVAILABLE',
          text(mappedDb.message) || 'Nie udało się połączyć z bazą danych.',
        )
        return
      }
      sendPublicError(res, error, sendApiError)
    } finally {
      client?.release?.()
    }
  }

  return Object.freeze({ handleRequest })
}

module.exports = {
  FACILITY_MANAGER_OBJECT_MAX_BODY_BYTES,
  createFacilityManagerObjectApi,
}
