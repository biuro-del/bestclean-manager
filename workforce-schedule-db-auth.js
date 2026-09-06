'use strict'

const WORKFORCE_SCHEDULE_DB_AUTH_TYPES = Object.freeze({
  PASSWORD: 'PASSWORD',
})

function authTypeError(code, message) {
  const error = new Error(code)
  error.statusCode = 503
  error.publicCode = code
  error.publicMessage = message
  return error
}

function resolveWorkforceScheduleDbAuthType(value) {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (!normalized) {
    throw authTypeError(
      'WORKFORCE_SCHEDULE_DB_AUTH_TYPE_MISSING',
      'Brakuje jawnego trybu uwierzytelniania bazy Grafiku.',
    )
  }
  if (!Object.hasOwn(WORKFORCE_SCHEDULE_DB_AUTH_TYPES, normalized)) {
    throw authTypeError(
      'WORKFORCE_SCHEDULE_DB_AUTH_TYPE_INVALID',
      'Tryb uwierzytelniania bazy Grafiku jest nieprawidlowy.',
    )
  }
  return WORKFORCE_SCHEDULE_DB_AUTH_TYPES[normalized]
}

module.exports = {
  WORKFORCE_SCHEDULE_DB_AUTH_TYPES,
  resolveWorkforceScheduleDbAuthType,
}
