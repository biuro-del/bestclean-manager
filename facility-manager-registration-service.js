'use strict'

const FACILITY_MANAGER_GOOGLE_PROVIDER_ID = 'google.com'

function text(value) {
  return String(value ?? '').trim()
}

function publicError(code, publicMessage, statusCode = 400) {
  const error = new Error(code)
  error.code = code
  error.publicCode = code
  error.publicMessage = publicMessage
  error.statusCode = statusCode
  return error
}

function requireFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(`Facility-manager registration requires ${name}.`)
  return value
}

function requireHmacKey(value) {
  const key = text(value)
  if (!key || Buffer.byteLength(key, 'utf8') < 32) {
    throw publicError(
      'FACILITY_MANAGER_REGISTRATION_UNAVAILABLE',
      'Rejestracja zarządcy jest chwilowo niedostępna. Spróbuj ponownie później.',
      503,
    )
  }
  return key
}

function normalizeVerifiedGoogleIdentity(decodedToken) {
  const uid = text(decodedToken?.uid || decodedToken?.sub)
  const email = text(decodedToken?.email).toLowerCase()
  const firebaseClaims = decodedToken?.firebase && typeof decodedToken.firebase === 'object' ? decodedToken.firebase : {}
  const providerId = text(firebaseClaims.sign_in_provider)
  const googleSubjects = Array.isArray(firebaseClaims.identities?.[FACILITY_MANAGER_GOOGLE_PROVIDER_ID])
    ? firebaseClaims.identities[FACILITY_MANAGER_GOOGLE_PROVIDER_ID]
    : []
  const subject = text(googleSubjects[0])

  if (!uid || !email || decodedToken?.email_verified !== true) {
    throw publicError('EMAIL_VERIFICATION_REQUIRED', 'Konto Google musi mieć potwierdzony adres e-mail.', 403)
  }
  if (providerId !== FACILITY_MANAGER_GOOGLE_PROVIDER_ID || !subject) {
    throw publicError(
      'FACILITY_MANAGER_GOOGLE_IDENTITY_REQUIRED',
      'Rejestracja zarządcy jest dostępna wyłącznie po zalogowaniu przez Google.',
      403,
    )
  }
  return Object.freeze({
    uid,
    providerId: FACILITY_MANAGER_GOOGLE_PROVIDER_ID,
    subject,
    email,
    emailVerified: true,
  })
}

function bridgeClientAsPool(client) {
  if (typeof client?.query !== 'function') throw new Error('POSTGRES_CLIENT_REQUIRED')
  const borrowedClient = Object.freeze({
    query: client.query.bind(client),
    release() {},
  })
  return Object.freeze({
    async connect() {
      return borrowedClient
    },
  })
}

function mapRegistrationError(error) {
  if (error?.publicCode && error?.publicMessage) return error
  const code = text(error?.code || error?.message).toUpperCase()
  if ([
    'INVALID_FACILITY_MANAGER_REGISTRATION_PAYLOAD',
    'INVALID_IDEMPOTENCY_KEY',
    'ORGANIZATION_NAME_REQUIRED',
    'INVALID_ORGANIZATION_NAME',
  ].includes(code)) {
    return publicError(
      code,
      code === 'ORGANIZATION_NAME_REQUIRED' || code === 'INVALID_ORGANIZATION_NAME'
        ? 'Podaj nazwę panelu zarządcy (maksymalnie 120 znaków).'
        : 'Dane rejestracji zarządcy są niepoprawne.',
      400,
    )
  }
  if ([
    'FACILITY_MANAGER_PROVISIONING_MISMATCH',
    'FACILITY_MANAGER_GOOGLE_UID_BINDING_MISMATCH',
  ].includes(code)) {
    return publicError(code, 'Ta rejestracja wymaga wyjaśnienia. Nie utworzyliśmy nowego panelu.', 409)
  }
  if ([
    'DATABASE_TRANSACTION_ROLLED_BACK',
    'DATABASE_UNAVAILABLE_BEFORE_TRANSACTION',
    'DATABASE_COMMIT_RESULT_UNKNOWN',
    'HMAC_KEY_REQUIRED',
    'HMAC_KEY_TOO_SHORT',
  ].includes(code)) {
    return publicError(
      'FACILITY_MANAGER_REGISTRATION_UNAVAILABLE',
      'Rejestracja zarządcy jest chwilowo niedostępna. Spróbuj ponownie później.',
      503,
    )
  }
  return publicError('FACILITY_MANAGER_REGISTRATION_ERROR', 'Nie udało się utworzyć panelu zarządcy.', 500)
}

function createFacilityManagerRegistrationService({ hmacKey, createCommand, createProvisioner } = {}) {
  requireFunction(createCommand, 'createCommand')
  requireFunction(createProvisioner, 'createProvisioner')
  const configuredHmacKey = requireHmacKey(hmacKey)

  return Object.freeze({
    async register({ client, decodedToken, payload }) {
      try {
        const googleIdentity = normalizeVerifiedGoogleIdentity(decodedToken)
        const command = createCommand({ input: payload, googleIdentity, hmacKey: configuredHmacKey })
        const provisioner = createProvisioner({ pool: bridgeClientAsPool(client) })
        return await provisioner.provisionFacilityManager(command)
      } catch (error) {
        throw mapRegistrationError(error)
      }
    },
  })
}

module.exports = {
  FACILITY_MANAGER_GOOGLE_PROVIDER_ID,
  bridgeClientAsPool,
  createFacilityManagerRegistrationService,
  normalizeVerifiedGoogleIdentity,
}
