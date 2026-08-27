'use strict'

const crypto = require('node:crypto')

const RATE_KEY_MIN_BYTES = 32

function text(value) {
  return String(value ?? '').trim()
}

function requireFunction(value, name) {
  if (typeof value !== 'function') {
    throw new TypeError(`Facility-manager Firestore rate gate requires ${name}.`)
  }
  return value
}

function requirePositiveInteger(value, fallback, name, minimum, maximum) {
  const raw = text(value)
  const candidate = raw ? Number(raw) : fallback
  if (!Number.isSafeInteger(candidate) || candidate < minimum || candidate > maximum) {
    throw new TypeError(`Facility-manager Firestore rate gate has an invalid ${name}.`)
  }
  return candidate
}

function requireCollectionName(value) {
  const collectionName = text(value || 'cleanziFacilityManagerRegistrationAbuseCounters')
  if (!/^[A-Za-z][A-Za-z0-9_-]{2,120}$/.test(collectionName)) {
    throw new TypeError('Facility-manager Firestore rate gate has an invalid collection name.')
  }
  return collectionName
}

function requireHmacKey(value) {
  const key = text(value)
  if (!key || Buffer.byteLength(key, 'utf8') < RATE_KEY_MIN_BYTES) {
    throw new TypeError('Facility-manager Firestore rate gate requires an HMAC key of at least 32 bytes.')
  }
  return key
}

function deriveSubjectRateKey(hmacKey, subject) {
  const normalizedSubject = text(subject)
  if (!normalizedSubject || normalizedSubject.length > 128 || /[\u0000-\u001f\u007f]/.test(normalizedSubject)) {
    throw new TypeError('Facility-manager Firestore rate gate received an invalid verified subject.')
  }
  return crypto
    .createHmac('sha256', requireHmacKey(hmacKey))
    .update(`cleanzi-facility-manager-rate-v1\u0000${normalizedSubject}`, 'utf8')
    .digest('base64url')
}

function createFacilityManagerFirestoreRateGate({
  createAbuseGuard,
  getFirestore,
  hmacKey,
  collectionName,
  windowMs,
  maxAttemptsPerSubject,
  now,
} = {}) {
  const buildAbuseGuard = requireFunction(createAbuseGuard, 'createAbuseGuard')
  const getDb = requireFunction(getFirestore, 'getFirestore')
  const configuredHmacKey = requireHmacKey(hmacKey)
  const configuredCollectionName = requireCollectionName(collectionName)
  const configuredWindowMs = requirePositiveInteger(windowMs, 15 * 60_000, 'windowMs', 60_000, 24 * 60 * 60_000)
  const configuredMaxAttempts = requirePositiveInteger(maxAttemptsPerSubject, 5, 'maxAttemptsPerSubject', 1, 50)
  let guardPromise = null

  async function getGuard() {
    if (!guardPromise) {
      guardPromise = Promise.resolve(getDb()).then((db) => buildAbuseGuard({
        db,
        collectionName: configuredCollectionName,
        windowMs: configuredWindowMs,
        maxAttemptsPerRegistration: configuredMaxAttempts,
        maxAttemptsPerEmail: configuredMaxAttempts,
        ...(typeof now === 'function' ? { now } : {}),
      }))
    }
    return guardPromise
  }

  return Object.freeze({
    async assertAllowed({ channel, subject } = {}) {
      const subjectRateKey = deriveSubjectRateKey(configuredHmacKey, subject)
      const guard = await getGuard()
      await guard.assertAllowed({
        channel: text(channel),
        registrationId: subjectRateKey,
        emailHmac: subjectRateKey,
      })
      return true
    },
  })
}

module.exports = {
  RATE_KEY_MIN_BYTES,
  createFacilityManagerFirestoreRateGate,
  deriveSubjectRateKey,
}
