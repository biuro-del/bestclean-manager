'use strict'

const APP_CHECK_REQUIRED = 'APP_CHECK_REQUIRED'
const APP_CHECK_INVALID = 'APP_CHECK_INVALID'
const APP_CHECK_APP_NOT_ALLOWED = 'APP_CHECK_APP_NOT_ALLOWED'

function publicError(statusCode, publicCode, publicMessage) {
  const error = new Error(publicCode)
  error.statusCode = statusCode
  error.publicCode = publicCode
  error.publicMessage = publicMessage
  return error
}

function normalizeAllowedAppIds(value) {
  const values = Array.isArray(value) ? value : String(value ?? '').split(',')
  const appIds = values.map((item) => String(item).trim()).filter(Boolean)
  if (!appIds.length || appIds.some((item) => item.length > 200 || !/^[A-Za-z0-9:._-]+$/.test(item))) {
    throw new TypeError('Facility-manager App Check requires a non-empty allowed app-id list.')
  }
  return new Set(appIds)
}

function createFacilityManagerFirebaseAppCheckGate({ appCheck, allowedAppIds } = {}) {
  if (typeof appCheck?.verifyToken !== 'function') {
    throw new TypeError('Facility-manager registration requires a Firebase App Check verifier.')
  }
  const allowed = normalizeAllowedAppIds(allowedAppIds)

  return Object.freeze({
    async assertAllowed({ token } = {}) {
      const normalizedToken = String(token ?? '').trim()
      if (!normalizedToken) throw publicError(401, APP_CHECK_REQUIRED, 'Brak tokenu Firebase App Check.')
      let claims
      try {
        claims = await appCheck.verifyToken(normalizedToken)
      } catch {
        throw publicError(401, APP_CHECK_INVALID, 'Token Firebase App Check jest niepoprawny.')
      }
      const appId = String(claims?.appId ?? '').trim()
      if (!allowed.has(appId)) {
        throw publicError(403, APP_CHECK_APP_NOT_ALLOWED, 'Aplikacja Firebase App Check nie jest dozwolona.')
      }
      return Object.freeze({ appId })
    },
  })
}

module.exports = {
  APP_CHECK_APP_NOT_ALLOWED,
  APP_CHECK_INVALID,
  APP_CHECK_REQUIRED,
  createFacilityManagerFirebaseAppCheckGate,
  __test: Object.freeze({ normalizeAllowedAppIds }),
}
