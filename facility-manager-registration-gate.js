'use strict'

const FACILITY_MANAGER_REGISTRATION_CHANNEL = 'FACILITY_MANAGER_GOOGLE'
const FACILITY_MANAGER_REGISTRATION_UNAVAILABLE = 'FACILITY_MANAGER_REGISTRATION_UNAVAILABLE'
const FACILITY_MANAGER_REGISTRATION_RATE_LIMITED = 'FACILITY_MANAGER_REGISTRATION_RATE_LIMITED'
const FACILITY_MANAGER_APP_CHECK_REQUIRED = 'APP_CHECK_REQUIRED'
const FACILITY_MANAGER_APP_CHECK_INVALID = 'APP_CHECK_INVALID'
const FACILITY_MANAGER_APP_CHECK_APP_NOT_ALLOWED = 'APP_CHECK_APP_NOT_ALLOWED'
const UNAVAILABLE_MESSAGE = 'Rejestracja panelu zarządcy jest chwilowo niedostępna. Spróbuj ponownie później.'
const RATE_LIMITED_MESSAGE = 'Zbyt wiele prób rejestracji. Spróbuj ponownie później.'
const APP_CHECK_REQUIRED_MESSAGE = 'Wymagane jest potwierdzenie bezpieczeństwa aplikacji.'
const APP_CHECK_INVALID_MESSAGE = 'Potwierdzenie bezpieczeństwa aplikacji jest niepoprawne.'
const APP_CHECK_APP_NOT_ALLOWED_MESSAGE = 'Ta aplikacja nie ma dostępu do rejestracji panelu.'
const knownGates = new WeakSet()

function publicError(statusCode, publicCode, publicMessage) {
  const error = new Error(publicCode)
  error.statusCode = statusCode
  error.publicCode = publicCode
  error.publicMessage = publicMessage
  return error
}

function explicitlyEnabled(value) {
  return value === true || value === 'true'
}

function normalizeSubject(value) {
  const subject = String(value ?? '').trim()
  if (!subject || subject.length > 128 || /[\u0000-\u001f\u007f]/.test(subject)) {
    throw publicError(401, 'UNAUTHENTICATED', 'Token Firebase jest niepoprawny albo wygasł.')
  }
  return subject
}

function toRateGate(rateGate) {
  if (typeof rateGate === 'function') return rateGate
  if (typeof rateGate?.assertAllowed === 'function') return rateGate.assertAllowed.bind(rateGate)
  return null
}

function toAppCheckGate(appCheckGate) {
  if (typeof appCheckGate === 'function') return appCheckGate
  if (typeof appCheckGate?.assertAllowed === 'function') return appCheckGate.assertAllowed.bind(appCheckGate)
  return null
}

function normalizeAppCheckToken(value) {
  const token = String(value ?? '').trim()
  if (!token) throw publicError(401, FACILITY_MANAGER_APP_CHECK_REQUIRED, APP_CHECK_REQUIRED_MESSAGE)
  if (token.length > 16 * 1024 || /[\u0000-\u001f\u007f]/.test(token)) {
    throw publicError(401, FACILITY_MANAGER_APP_CHECK_INVALID, APP_CHECK_INVALID_MESSAGE)
  }
  return token
}

function isRateLimited(error) {
  return error?.statusCode === 429 || [
    FACILITY_MANAGER_REGISTRATION_RATE_LIMITED,
    'REGISTRATION_RATE_LIMITED',
  ].includes(String(error?.publicCode || error?.code || ''))
}

function appCheckError(error) {
  const code = String(error?.publicCode || error?.code || '')
  if (code === FACILITY_MANAGER_APP_CHECK_REQUIRED) {
    return publicError(401, FACILITY_MANAGER_APP_CHECK_REQUIRED, APP_CHECK_REQUIRED_MESSAGE)
  }
  if (code === FACILITY_MANAGER_APP_CHECK_INVALID) {
    return publicError(401, FACILITY_MANAGER_APP_CHECK_INVALID, APP_CHECK_INVALID_MESSAGE)
  }
  if (code === FACILITY_MANAGER_APP_CHECK_APP_NOT_ALLOWED) {
    return publicError(403, FACILITY_MANAGER_APP_CHECK_APP_NOT_ALLOWED, APP_CHECK_APP_NOT_ALLOWED_MESSAGE)
  }
  return null
}

function unavailableError() {
  return publicError(503, FACILITY_MANAGER_REGISTRATION_UNAVAILABLE, UNAVAILABLE_MESSAGE)
}

function rateLimitedError() {
  return publicError(429, FACILITY_MANAGER_REGISTRATION_RATE_LIMITED, RATE_LIMITED_MESSAGE)
}

function createFacilityManagerRegistrationGate({ enabled, rateGate, appCheckGate } = {}) {
  const assertRateAllowed = toRateGate(rateGate)
  const assertAppCheckAllowed = toAppCheckGate(appCheckGate)

  async function assertEnabled() {
    if (!explicitlyEnabled(enabled) || !assertRateAllowed || !assertAppCheckAllowed) {
      throw unavailableError()
    }
  }

  async function assertAppCheck({ appCheckToken } = {}) {
    await assertEnabled()
    const token = normalizeAppCheckToken(appCheckToken)
    try {
      const decision = await assertAppCheckAllowed({ token })
      if (decision === false || decision?.allowed === false) {
        throw publicError(401, FACILITY_MANAGER_APP_CHECK_INVALID, APP_CHECK_INVALID_MESSAGE)
      }
    } catch (error) {
      const mapped = appCheckError(error)
      if (mapped) throw mapped
      throw unavailableError()
    }
  }

  async function assertAllowed({ uid } = {}) {
    await assertEnabled()
    const subject = normalizeSubject(uid)
    try {
      const decision = await assertRateAllowed({
        channel: FACILITY_MANAGER_REGISTRATION_CHANNEL,
        subject,
      })
      if (decision === false || decision?.allowed === false) throw rateLimitedError()
    } catch (error) {
      if (isRateLimited(error)) throw rateLimitedError()
      throw unavailableError()
    }
  }

  const gate = Object.freeze({ assertAllowed, assertAppCheck, assertEnabled })
  knownGates.add(gate)
  return gate
}

function createDisabledFacilityManagerRegistrationGate() {
  return createFacilityManagerRegistrationGate()
}

function isFacilityManagerRegistrationGate(gate) {
  return Boolean(gate && typeof gate === 'object' && knownGates.has(gate))
}

module.exports = {
  FACILITY_MANAGER_REGISTRATION_CHANNEL,
  FACILITY_MANAGER_REGISTRATION_RATE_LIMITED,
  FACILITY_MANAGER_REGISTRATION_UNAVAILABLE,
  FACILITY_MANAGER_APP_CHECK_APP_NOT_ALLOWED,
  FACILITY_MANAGER_APP_CHECK_INVALID,
  FACILITY_MANAGER_APP_CHECK_REQUIRED,
  createDisabledFacilityManagerRegistrationGate,
  createFacilityManagerRegistrationGate,
  isFacilityManagerRegistrationGate,
  __test: Object.freeze({ appCheckError, explicitlyEnabled, isRateLimited, normalizeAppCheckToken, normalizeSubject }),
}
