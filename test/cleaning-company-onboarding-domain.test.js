'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  COMPANY_ONBOARDING_SCHEMA_VERSION,
  LEGAL_DOCUMENT_ALLOWLIST,
  CompanyOnboardingValidationError,
  assertCompanyOnboarding,
  isValidNip,
  normalizeCommandId,
  normalizeDeclaredEmployeeCount,
  validateCompanyOnboarding,
} = require('../cleaning-company-onboarding-domain')

const COMMAND_ID = '3bcd0d64-454d-4e8d-97da-23d90ce9fceb'

function validInput(overrides = {}) {
  return {
    commandId: COMMAND_ID,
    nip: '856-734-62-15',
    legalName: '  Firma Sprzątająca Żółć sp. z o.o.  ',
    declaredEmployeeCount: '0',
    legalDocuments: {
      terms: { ...LEGAL_DOCUMENT_ALLOWLIST.terms, accepted: true },
      privacy: { ...LEGAL_DOCUMENT_ALLOWLIST.privacy, acknowledged: true },
    },
    marketing: { email: false, sms: false, phone: false },
    ...overrides,
  }
}

test('v2 accepts a checksum-valid NIP, a legal name and zero declared employees', () => {
  const result = validateCompanyOnboarding(validInput())

  assert.equal(result.ok, true)
  assert.deepEqual(result.errors, {})
  assert.equal(result.value.schemaVersion, COMPANY_ONBOARDING_SCHEMA_VERSION)
  assert.equal(result.value.commandId, COMMAND_ID)
  assert.equal(result.value.nip, '8567346215')
  assert.equal(result.value.legalName, 'Firma Sprzątająca Żółć sp. z o.o.')
  assert.equal(result.value.declaredEmployeeCount, 0)
})

test('NIP validation rejects an invalid checksum and content outside its presentation syntax', () => {
  assert.equal(isValidNip('856-734-62-15'), true)
  assert.equal(isValidNip('8567346216'), false)
  assert.equal(isValidNip('0000000000'), false)
  assert.equal(isValidNip('856A346215'), false)

  const result = validateCompanyOnboarding(validInput({ nip: '8567346216' }))
  assert.equal(result.ok, false)
  assert.equal(result.errors.nip, 'INVALID_NIP')
})

test('employee count is an integer in the inclusive range from zero to one hundred thousand', () => {
  assert.equal(normalizeDeclaredEmployeeCount(0), 0)
  assert.equal(normalizeDeclaredEmployeeCount('100000'), 100000)
  assert.equal(normalizeDeclaredEmployeeCount('1.5'), null)
  assert.equal(normalizeDeclaredEmployeeCount('-1'), null)

  for (const declaredEmployeeCount of ['100001', '1.5', '-1', '']) {
    const result = validateCompanyOnboarding(validInput({ declaredEmployeeCount }))
    assert.equal(result.ok, false)
    assert.equal(
      result.errors.declaredEmployeeCount,
      'INVALID_DECLARED_EMPLOYEE_COUNT',
    )
  }
})

test('command ID is a canonical UUID and normalizes uppercase input', () => {
  assert.equal(
    normalizeCommandId('3BCD0D64-454D-4E8D-97DA-23D90CE9FCEB'),
    COMMAND_ID,
  )
  assert.equal(normalizeCommandId('not-a-command'), null)

  const result = validateCompanyOnboarding(validInput({ commandId: 'not-a-command' }))
  assert.equal(result.ok, false)
  assert.equal(result.errors.commandId, 'INVALID_COMMAND_ID')
})

test('only the exact Cleanzi legal-document allowlist can establish required consents', () => {
  const invalidTerms = validateCompanyOnboarding(validInput({
    legalDocuments: {
      terms: {
        ...LEGAL_DOCUMENT_ALLOWLIST.terms,
        url: 'https://example.test/regulamin',
        accepted: true,
      },
      privacy: { ...LEGAL_DOCUMENT_ALLOWLIST.privacy, acknowledged: true },
    },
  }))
  assert.equal(invalidTerms.ok, false)
  assert.equal(invalidTerms.errors.termsDocument, 'TERMS_DOCUMENT_NOT_ALLOWED')

  const invalidPrivacy = validateCompanyOnboarding(validInput({
    legalDocuments: {
      terms: { ...LEGAL_DOCUMENT_ALLOWLIST.terms, accepted: true },
      privacy: {
        ...LEGAL_DOCUMENT_ALLOWLIST.privacy,
        version: '2026-07-16',
        acknowledged: true,
      },
    },
  }))
  assert.equal(invalidPrivacy.ok, false)
  assert.equal(
    invalidPrivacy.errors.privacyDocument,
    'PRIVACY_DOCUMENT_NOT_ALLOWED',
  )

  const missingAcknowledgements = validateCompanyOnboarding(validInput({
    legalDocuments: {
      terms: { ...LEGAL_DOCUMENT_ALLOWLIST.terms, accepted: false },
      privacy: { ...LEGAL_DOCUMENT_ALLOWLIST.privacy, acknowledged: false },
    },
  }))
  assert.equal(
    missingAcknowledgements.errors.termsAccepted,
    'TERMS_ACCEPTANCE_REQUIRED',
  )
  assert.equal(
    missingAcknowledgements.errors.privacyAcknowledged,
    'PRIVACY_ACKNOWLEDGEMENT_REQUIRED',
  )
})

test('marketing decisions are independent booleans and never coerce strings into consent', () => {
  const result = assertCompanyOnboarding(validInput({
    marketing: { email: true, sms: false, phone: 'true' },
  }))

  assert.deepEqual(result.marketing, {
    email: true,
    sms: false,
    phone: false,
  })
})

test('assertion exposes field-level errors without side effects', () => {
  assert.throws(
    () => assertCompanyOnboarding(validInput({ legalName: 'A' })),
    (error) => error instanceof CompanyOnboardingValidationError &&
      error.code === 'INVALID_COMPANY_ONBOARDING' &&
      error.errors.legalName === 'INVALID_LEGAL_NAME',
  )
})
