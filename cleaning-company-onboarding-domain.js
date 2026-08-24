'use strict'

// Pure, versioned validation for the mandatory first-company profile.
// This module deliberately has no Firebase, database, environment, or HTTP dependency.

const COMPANY_ONBOARDING_SCHEMA_VERSION = 2
const EMPLOYEE_COUNT_MIN = 0
const EMPLOYEE_COUNT_MAX = 100000
const NIP_WEIGHTS = Object.freeze([6, 5, 7, 2, 3, 4, 5, 6, 7])
const COMMAND_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Legal documents are an allowlist, rather than caller-provided configuration.
// A caller cannot make a consent valid by substituting another URL or version.
const LEGAL_DOCUMENT_ALLOWLIST = Object.freeze({
  terms: Object.freeze({
    documentId: 'terms',
    version: '2026-07-16',
    url: 'https://cleanzi.pl/regulamin',
  }),
  privacy: Object.freeze({
    documentId: 'privacy',
    version: '2026-07-30',
    url: 'https://cleanzi.pl/polityka-prywatnosci',
  }),
})

class CompanyOnboardingValidationError extends Error {
  constructor(errors) {
    super('INVALID_COMPANY_ONBOARDING')
    this.name = 'CompanyOnboardingValidationError'
    this.code = 'INVALID_COMPANY_ONBOARDING'
    this.errors = errors
  }
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function matchesAllowedDocument(candidate, allowed) {
  return candidate &&
    text(candidate.documentId) === allowed.documentId &&
    text(candidate.version) === allowed.version &&
    text(candidate.url) === allowed.url
}

function canonicalDocument(key, acknowledgementField) {
  return Object.freeze({
    ...LEGAL_DOCUMENT_ALLOWLIST[key],
    [acknowledgementField]: true,
  })
}

function frozenMarketing(marketing) {
  return Object.freeze({
    email: marketing?.email === true,
    sms: marketing?.sms === true,
    phone: marketing?.phone === true,
  })
}

function frozenErrors(errors) {
  return Object.freeze({ ...errors })
}

function validLegalName(value) {
  return value.length >= 2 && value.length <= 160
}

function validEmployeeCount(value) {
  return value !== null &&
    value >= EMPLOYEE_COUNT_MIN &&
    value <= EMPLOYEE_COUNT_MAX
}

function allowedTerms(candidate) {
  return matchesAllowedDocument(candidate, LEGAL_DOCUMENT_ALLOWLIST.terms)
}

function allowedPrivacy(candidate) {
  return matchesAllowedDocument(candidate, LEGAL_DOCUMENT_ALLOWLIST.privacy)
}

function normalizedValue(input) {
  return Object.freeze({
    schemaVersion: COMPANY_ONBOARDING_SCHEMA_VERSION,
    commandId: normalizeCommandId(input?.commandId),
    nip: normalizeNip(input?.nip),
    legalName: normalizeLegalName(input?.legalName),
    declaredEmployeeCount: normalizeDeclaredEmployeeCount(
      input?.declaredEmployeeCount,
    ),
    legalDocuments: Object.freeze({
      terms: canonicalDocument('terms', 'accepted'),
      privacy: canonicalDocument('privacy', 'acknowledged'),
    }),
    marketing: frozenMarketing(input?.marketing),
  })
}

/**
 * Normalizes the presentation formats commonly used for a Polish NIP, while
 * refusing any non-digit content other than ordinary spaces and hyphens.
 */
function normalizeNip(value) {
  const raw = typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : ''
  const compact = raw.replace(/[ -]/g, '')
  return /^\d{0,10}$/.test(compact) ? compact : ''
}

function isValidNip(value) {
  const nip = normalizeNip(value)
  if (!/^\d{10}$/.test(nip)) return false
  // The checksum alone accepts 0000000000, which is not a usable Polish tax ID.
  if (/^0{10}$/.test(nip)) return false

  const checksum = NIP_WEIGHTS.reduce(
    (sum, weight, index) => sum + Number(nip[index]) * weight,
    0,
  ) % 11
  return checksum !== 10 && checksum === Number(nip[9])
}

/**
 * Preserves valid Polish/Unicode company names, but rejects control characters
 * and normalizes harmless horizontal whitespace for deterministic storage.
 */
function normalizeLegalName(value) {
  if (typeof value !== 'string') return ''
  const normalized = value.normalize('NFC').trim()
  if (/[\u0000-\u001f\u007f]/.test(normalized)) return ''
  return normalized.replace(/[ \t]+/g, ' ')
}

function normalizeDeclaredEmployeeCount(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? value : null
  }

  const candidate = text(value)
  if (!/^\d+$/.test(candidate)) return null
  const count = Number(candidate)
  return Number.isSafeInteger(count) ? count : null
}

function normalizeCommandId(value) {
  const commandId = text(value).toLowerCase()
  return COMMAND_ID_PATTERN.test(commandId) ? commandId : null
}

/**
 * Validates the version 2 onboarding command without performing any side effect.
 *
 * Expected legal-document input:
 * {
 *   terms: { documentId, version, url, accepted: true },
 *   privacy: { documentId, version, url, acknowledged: true }
 * }
 */
function validateCompanyOnboarding(input = {}) {
  const errors = {}
  const terms = input?.legalDocuments?.terms
  const privacy = input?.legalDocuments?.privacy
  const value = normalizedValue(input)

  if (!value.commandId) errors.commandId = 'INVALID_COMMAND_ID'
  if (!isValidNip(value.nip)) errors.nip = 'INVALID_NIP'
  if (!validLegalName(value.legalName)) errors.legalName = 'INVALID_LEGAL_NAME'
  if (!validEmployeeCount(value.declaredEmployeeCount)) {
    errors.declaredEmployeeCount = 'INVALID_DECLARED_EMPLOYEE_COUNT'
  }
  if (!allowedTerms(terms)) errors.termsDocument = 'TERMS_DOCUMENT_NOT_ALLOWED'
  if (terms?.accepted !== true) errors.termsAccepted = 'TERMS_ACCEPTANCE_REQUIRED'
  if (!allowedPrivacy(privacy)) errors.privacyDocument = 'PRIVACY_DOCUMENT_NOT_ALLOWED'
  if (privacy?.acknowledged !== true) {
    errors.privacyAcknowledged = 'PRIVACY_ACKNOWLEDGEMENT_REQUIRED'
  }

  return Object.freeze({
    ok: Object.keys(errors).length === 0,
    errors: frozenErrors(errors),
    value,
  })
}

function assertCompanyOnboarding(input = {}) {
  const validation = validateCompanyOnboarding(input)
  if (!validation.ok) {
    throw new CompanyOnboardingValidationError(validation.errors)
  }
  return validation.value
}

module.exports = Object.freeze({
  COMPANY_ONBOARDING_SCHEMA_VERSION,
  EMPLOYEE_COUNT_MIN,
  EMPLOYEE_COUNT_MAX,
  LEGAL_DOCUMENT_ALLOWLIST,
  CompanyOnboardingValidationError,
  normalizeNip,
  isValidNip,
  normalizeLegalName,
  normalizeDeclaredEmployeeCount,
  normalizeCommandId,
  validateCompanyOnboarding,
  assertCompanyOnboarding,
})
