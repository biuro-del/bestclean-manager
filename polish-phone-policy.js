'use strict'

const POLISH_PHONE_PREFIX = '+48'
const POLISH_PHONE_E164_PATTERN = /^\+48\d{9}$/
const POLISH_PHONE_ALLOWED_INPUT_PATTERN = /^[+\d\s().-]+$/u

function normalizePolishPhoneE164(value) {
  const raw = String(value ?? '').trim()
  if (!raw || raw.length > 40 || !POLISH_PHONE_ALLOWED_INPUT_PATTERN.test(raw)) {
    return ''
  }

  const compact = raw.replace(/[\s().-]/g, '')
  let nationalNumber = ''

  if (/^\d{9}$/.test(compact)) {
    nationalNumber = compact
  } else if (/^0\d{9}$/.test(compact)) {
    nationalNumber = compact.slice(1)
  } else if (/^48\d{9}$/.test(compact)) {
    nationalNumber = compact.slice(2)
  } else if (/^\+48\d{9}$/.test(compact)) {
    nationalNumber = compact.slice(3)
  } else if (/^0048\d{9}$/.test(compact)) {
    nationalNumber = compact.slice(4)
  }

  const normalized = nationalNumber ? `${POLISH_PHONE_PREFIX}${nationalNumber}` : ''
  return POLISH_PHONE_E164_PATTERN.test(normalized) ? normalized : ''
}

function isPolishPhoneE164(value) {
  return POLISH_PHONE_E164_PATTERN.test(String(value ?? ''))
}

module.exports = {
  POLISH_PHONE_E164_PATTERN,
  POLISH_PHONE_PREFIX,
  isPolishPhoneE164,
  normalizePolishPhoneE164,
}
