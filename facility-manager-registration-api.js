'use strict'

const {
  FACILITY_MANAGER_APP_CHECK_APP_NOT_ALLOWED,
  FACILITY_MANAGER_APP_CHECK_INVALID,
  FACILITY_MANAGER_APP_CHECK_REQUIRED,
  FACILITY_MANAGER_REGISTRATION_RATE_LIMITED,
  FACILITY_MANAGER_REGISTRATION_UNAVAILABLE,
  createDisabledFacilityManagerRegistrationGate,
  isFacilityManagerRegistrationGate,
} = require('./facility-manager-registration-gate')

const FACILITY_MANAGER_REGISTRATION_MAX_BODY_BYTES = 8 * 1024

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
    'getFacilityManagerRegistrationService',
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
    throw new TypeError(`Facility-manager registration API dependencies are incomplete: ${missing.join(', ')}.`)
  }
}

function requireRegistrationGate(gate) {
  if (
    !isFacilityManagerRegistrationGate(gate) ||
    typeof gate.assertEnabled !== 'function' ||
    typeof gate.assertAppCheck !== 'function' ||
    typeof gate.assertAllowed !== 'function'
  ) {
    throw new TypeError('Facility-manager registration gate must be created by createFacilityManagerRegistrationGate.')
  }
}

function readAppCheckToken(req) {
  const headers = req?.headers && typeof req.headers === 'object' ? req.headers : {}
  const value = headers['x-firebase-appcheck'] ?? headers['X-Firebase-AppCheck']
  return Array.isArray(value) ? '' : String(value ?? '').trim()
}

function sendRegistrationGateError(res, error, sendApiError) {
  if (error?.publicCode === FACILITY_MANAGER_REGISTRATION_RATE_LIMITED) {
    sendApiError(res, 429, FACILITY_MANAGER_REGISTRATION_RATE_LIMITED, 'Zbyt wiele prób rejestracji. Spróbuj ponownie później.')
    return
  }
  if (error?.publicCode === FACILITY_MANAGER_APP_CHECK_REQUIRED) {
    sendApiError(res, 401, FACILITY_MANAGER_APP_CHECK_REQUIRED, 'Wymagane jest potwierdzenie bezpieczeństwa aplikacji.')
    return
  }
  if (error?.publicCode === FACILITY_MANAGER_APP_CHECK_INVALID) {
    sendApiError(res, 401, FACILITY_MANAGER_APP_CHECK_INVALID, 'Potwierdzenie bezpieczeństwa aplikacji jest niepoprawne.')
    return
  }
  if (error?.publicCode === FACILITY_MANAGER_APP_CHECK_APP_NOT_ALLOWED) {
    sendApiError(res, 403, FACILITY_MANAGER_APP_CHECK_APP_NOT_ALLOWED, 'Ta aplikacja nie ma dostępu do rejestracji panelu.')
    return
  }
  if (error?.publicCode === 'UNAUTHENTICATED') {
    sendApiError(res, 401, 'UNAUTHENTICATED', 'Token Firebase jest niepoprawny albo wygasł.')
    return
  }
  sendApiError(
    res,
    503,
    FACILITY_MANAGER_REGISTRATION_UNAVAILABLE,
    'Rejestracja panelu zarządcy jest chwilowo niedostępna. Spróbuj ponownie później.',
  )
}

function createFacilityManagerRegistrationApi(dependencies = {}) {
  requireDependencies(dependencies)
  const {
    connectDbClient,
    getFacilityManagerRegistrationService,
    mapDatabaseConnectionError,
    mapFirebaseAdminError,
    parseBearerToken,
    readJsonBody,
    sendApiError,
    sendJson,
    verifyFirebaseIdToken,
    facilityManagerRegistrationGate = createDisabledFacilityManagerRegistrationGate(),
    normalizeText = text,
  } = dependencies

  if (typeof normalizeText !== 'function') {
    throw new TypeError('Facility-manager registration API normalizeText must be a function.')
  }
  requireRegistrationGate(facilityManagerRegistrationGate)

  async function handleRegisterRequest(req, res) {
    if (req?.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    if (String(req?.method || '').toUpperCase() !== 'POST') {
      sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Dozwolona metoda to POST.')
      return
    }

    try {
      await facilityManagerRegistrationGate.assertEnabled()
    } catch (error) {
      sendRegistrationGateError(res, error, sendApiError)
      return
    }

    try {
      await facilityManagerRegistrationGate.assertAppCheck({ appCheckToken: readAppCheckToken(req) })
    } catch (error) {
      sendRegistrationGateError(res, error, sendApiError)
      return
    }

    let payload
    try {
      payload = await readJsonBody(req, FACILITY_MANAGER_REGISTRATION_MAX_BODY_BYTES)
    } catch (error) {
      if (error?.message === 'REQUEST_BODY_TOO_LARGE') {
        sendApiError(res, 413, 'REQUEST_TOO_LARGE', 'Dane rejestracji zarządcy są zbyt duże.')
        return
      }
      sendApiError(res, 400, 'INVALID_JSON', 'Niepoprawne dane rejestracji zarządcy.')
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
        normalizeText(mapped.code) || 'UNAUTHENTICATED',
        normalizeText(mapped.message) || 'Token Firebase jest niepoprawny albo wygasł.',
      )
      return
    }

    try {
      await facilityManagerRegistrationGate.assertAllowed({ uid: decodedToken?.uid || decodedToken?.sub })
    } catch (error) {
      sendRegistrationGateError(res, error, sendApiError)
      return
    }

    let client = null
    try {
      const service = await getFacilityManagerRegistrationService()
      client = await connectDbClient()
      const result = await service.register({ client, decodedToken, payload })
      sendJson(res, result?.createdNow === true ? 201 : 200, { ok: true, data: result })
    } catch (error) {
      const mappedDb = mapDatabaseConnectionError(error)
      if (mappedDb) {
        sendApiError(
          res,
          httpStatus(mappedDb.status),
          normalizeText(mappedDb.code) || 'DATABASE_UNAVAILABLE',
          normalizeText(mappedDb.message) || 'Nie udało się połączyć z bazą danych.',
        )
        return
      }
      sendApiError(
        res,
        httpStatus(error?.statusCode),
        normalizeText(error?.publicCode) || 'FACILITY_MANAGER_REGISTRATION_ERROR',
        normalizeText(error?.publicMessage) || 'Nie udało się utworzyć panelu zarządcy.',
      )
    } finally {
      client?.release?.()
    }
  }

  return Object.freeze({ handleRegisterRequest })
}

module.exports = {
  FACILITY_MANAGER_REGISTRATION_MAX_BODY_BYTES,
  createFacilityManagerRegistrationApi,
  __test: Object.freeze({ readAppCheckToken, sendRegistrationGateError }),
}
