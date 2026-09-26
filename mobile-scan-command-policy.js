'use strict'

const crypto = require('node:crypto')

function canonicalValue(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (!value || typeof value !== 'object') throw new TypeError('MOBILE_SCAN_REQUEST_INVALID')
  const result = {}
  for (const key of Object.keys(value).sort()) {
    const item = value[key]
    if (item === undefined) continue
    result[key] = canonicalValue(item)
  }
  return result
}

function fingerprintMobileScanRequest(body) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalValue(body || {})), 'utf8')
    .digest('hex')
}

function assertMobileScanReplayFingerprint(storedFingerprint, requestFingerprint) {
  if (
    !/^[a-f0-9]{64}$/.test(String(storedFingerprint || '')) ||
    storedFingerprint !== requestFingerprint
  ) {
    const error = new Error('MOBILE_SCAN_IDEMPOTENCY_CONFLICT')
    error.statusCode = 409
    error.publicCode = 'MOBILE_SCAN_IDEMPOTENCY_CONFLICT'
    error.publicMessage = 'Ten identyfikator skanu zostal juz uzyty z innymi danymi.'
    throw error
  }
}

module.exports = {
  assertMobileScanReplayFingerprint,
  fingerprintMobileScanRequest,
}
