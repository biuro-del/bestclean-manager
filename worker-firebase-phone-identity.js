'use strict'

const { normalizePolishPhoneE164 } = require('./polish-phone-policy')

function text(value) {
  return String(value ?? '').trim()
}

function isTrue(value) {
  return ['1', 'true', 'yes', 'tak'].includes(text(value).toLowerCase())
}

function isWorkerFirebasePhoneIdentityEnabled(environment = process.env) {
  return isTrue(environment?.WORKER_FIREBASE_PHONE_IDENTITY_ENABLED)
}

function publicError(statusCode, publicCode, publicMessage) {
  const error = new Error(publicCode)
  error.statusCode = statusCode
  error.publicCode = publicCode
  error.publicMessage = publicMessage
  return error
}

function canonicalWorkerPhone(value, { required = false } = {}) {
  const rawPhone = text(value)
  const phoneNumber = rawPhone ? normalizePolishPhoneE164(rawPhone) : ''
  if ((required && !phoneNumber) || (rawPhone && !phoneNumber)) {
    throw publicError(
      400,
      'WORKER_PHONE_INVALID',
      required && !rawPhone
        ? 'Podaj numer telefonu pracownika.'
        : 'Podaj poprawny polski numer telefonu, np. +48664322028.',
    )
  }
  return phoneNumber
}

function buildWorkerFirebasePhoneCreateFields(phone, environment = process.env) {
  if (!isWorkerFirebasePhoneIdentityEnabled(environment)) return {}
  return {
    phoneNumber: canonicalWorkerPhone(phone, { required: true }),
  }
}

function buildWorkerFirebasePhoneUpdateFields(phone, environment = process.env) {
  if (!isWorkerFirebasePhoneIdentityEnabled(environment)) return {}
  return {
    phoneNumber: canonicalWorkerPhone(phone) || null,
  }
}

function buildWorkerFirebasePhoneRollbackFields(firebaseUser, environment = process.env) {
  if (!isWorkerFirebasePhoneIdentityEnabled(environment)) return {}
  return {
    phoneNumber: text(firebaseUser?.phoneNumber) || null,
  }
}

function hasWorkerFirebasePhoneIdentityChange(nextPhone, currentPhone, environment = process.env) {
  if (!isWorkerFirebasePhoneIdentityEnabled(environment)) return false
  return canonicalWorkerPhone(nextPhone) !== canonicalWorkerPhone(currentPhone)
}

function hasWorkerFirebasePhoneAuthMismatch(expectedPhone, firebasePhone, environment = process.env) {
  if (!isWorkerFirebasePhoneIdentityEnabled(environment)) return false
  return canonicalWorkerPhone(expectedPhone) !== text(firebasePhone)
}

function firebaseErrorText(error) {
  return [
    error?.code,
    error?.message,
    error?.firebaseRestMessage,
    error?.errorInfo?.code,
    error?.errorInfo?.message,
  ]
    .filter(Boolean)
    .map((value) => text(value).toLowerCase())
    .join(' ')
}

function isFirebasePhoneAlreadyExistsError(error) {
  const value = firebaseErrorText(error)
  return (
    value.includes('phone-number-already-exists') ||
    value.includes('phone number already exists') ||
    value.includes('phone_number_exists')
  )
}

function isFirebaseInvalidPhoneError(error) {
  const value = firebaseErrorText(error)
  return (
    value.includes('invalid-phone-number') ||
    value.includes('invalid phone number') ||
    value.includes('invalid_phone_number')
  )
}

module.exports = {
  buildWorkerFirebasePhoneCreateFields,
  buildWorkerFirebasePhoneRollbackFields,
  buildWorkerFirebasePhoneUpdateFields,
  hasWorkerFirebasePhoneAuthMismatch,
  hasWorkerFirebasePhoneIdentityChange,
  isFirebaseInvalidPhoneError,
  isFirebasePhoneAlreadyExistsError,
  isWorkerFirebasePhoneIdentityEnabled,
}
