'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  createOrganizationWithTrial,
  isValidPolishNip,
  normalizeProfileInput,
  profileCompleteness,
  readOrganizationProfile,
} = require('../organization-onboarding')
const {
  enforceRateLimit,
  lookupCompanyByNip,
  parseCompanySearchResult,
} = require('../gus-company-registry')

test('walidacja NIP usuwa formatowanie, ale odrzuca błędną sumę kontrolną', () => {
  assert.equal(isValidPolishNip('526-10-40-828'), true)
  assert.equal(isValidPolishNip('5261040829'), false)
  assert.equal(normalizeProfileInput({ nip: '526-10-40-828' }).nip, '5261040828')
})

test('kompletność profilu rozdziela onboarding bazowy od danych płatniczych', () => {
  const base = {
    nip: '5261040828',
    legalName: 'Cleanzi Sp. z o.o.',
    registeredAddress: 'ul. Testowa 1, 00-001 Warszawa',
    ownerFullName: 'Jan Kowalski',
  }
  assert.equal(profileCompleteness(base, 'TRIAL').completeForPlan, true)
  assert.equal(profileCompleteness(base, 'GO_PLUS').baseComplete, true)
  assert.equal(profileCompleteness(base, 'GO_PLUS').completeForPlan, false)
  assert.deepEqual(profileCompleteness(base, 'GO_PLUS').missingBilling, [
    'billingName', 'billingNip', 'billingAddress', 'billingPostalCode', 'billingCity', 'billingEmail',
  ])
})

test('parser odpowiedzi GUS mapuje nazwę i pełny adres bez ujawniania klucza', () => {
  const encoded = '&lt;root&gt;&lt;dane&gt;&lt;Regon&gt;123456789&lt;/Regon&gt;&lt;Nip&gt;5261040828&lt;/Nip&gt;&lt;Nazwa&gt;Cleanzi Sp. z o.o.&lt;/Nazwa&gt;&lt;Ulica&gt;Testowa&lt;/Ulica&gt;&lt;NrNieruchomosci&gt;1&lt;/NrNieruchomosci&gt;&lt;KodPocztowy&gt;00-001&lt;/KodPocztowy&gt;&lt;Miejscowosc&gt;Warszawa&lt;/Miejscowosc&gt;&lt;/dane&gt;&lt;/root&gt;'
  const company = parseCompanySearchResult(encoded, '5261040828')
  assert.equal(company.legalName, 'Cleanzi Sp. z o.o.')
  assert.equal(company.registeredAddress, 'Testowa 1, 00-001 Warszawa')
})

test('adapter GUS wymusza limit zapytań i mapuje timeout na publiczny błąd', async () => {
  const rateKey = `test-rate-${Date.now()}`
  for (let index = 0; index < 10; index += 1) enforceRateLimit(rateKey, 1000 + index)
  assert.throws(
    () => enforceRateLimit(rateKey, 1011),
    (error) => error.publicCode === 'COMPANY_LOOKUP_RATE_LIMITED',
  )
  await assert.rejects(
    lookupCompanyByNip('5261040828', {
      apiKey: 'server-only-test-key',
      rateLimitKey: `test-timeout-${Date.now()}`,
      fetchImpl: async () => {
        const error = new Error('timeout')
        error.name = 'TimeoutError'
        throw error
      },
    }),
    (error) => error.publicCode === 'GUS_TIMEOUT',
  )
})

test('migracja jest addytywna i nie przepisuje starych subskrypcji', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'Cleanzi-admin', 'migrations', '20260731_portal_plans_onboarding.sql'), 'utf8')
  assert.match(sql, /create table if not exists public\.organization_profile/i)
  assert.match(sql, /create table if not exists public\.billing_provider_event/i)
  assert.doesNotMatch(sql, /delete\s+from\s+public\.organization_subscription/i)
  assert.doesNotMatch(sql, /update\s+public\.organization_subscription/i)
})

test('odczyt profilu preferuje kanoniczny organization_company_profile', async () => {
  const client = {
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim().toLowerCase()
      if (normalized.startsWith('select to_regclass')) {
        return { rows: [{ canonical_profile_ready: true, profile_ready: true }] }
      }
      if (normalized.includes('from public.organization_company_profile')) {
        return { rows: [{
          org_id: 'orgID_7',
          nip: '5261040828',
          regon: '123456789',
          legal_name: 'Cleanzi Test',
          registered_address: 'Testowa 1',
          street: 'Testowa 1',
          postal_code: '00-001',
          city: 'Warszawa',
          country_code: 'PL',
          owner_full_name: 'Jan Kowalski',
          billing_name: 'Cleanzi Test',
          billing_nip: '5261040828',
          billing_address: 'Testowa 1',
          billing_postal_code: '00-001',
          billing_city: 'Warszawa',
          billing_country_code: 'PL',
          billing_email: 'billing@example.com',
          plan_code: 'PRO',
          version: 0,
        }] }
      }
      throw new Error(`Unexpected query: ${normalized}`)
    },
  }
  const result = await readOrganizationProfile(client, 'orgID_7')
  assert.equal(result.source, 'organization_company_profile')
  assert.equal(result.profile.legalName, 'Cleanzi Test')
  assert.equal(result.completeness.completeForPlan, true)
})

test('portal nie tworzy samodzielnie organizacji ani Triala bez próby rejestracji', async () => {
  const calls = []
  const client = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim().toLowerCase()
      calls.push({ sql: normalized, params })
      if (normalized.startsWith('select to_regclass')) {
        return { rows: [{ profile_ready: true, billing_event_ready: true }] }
      }
      return { rows: [] }
    },
  }
  await assert.rejects(
    createOrganizationWithTrial(client, {
      uid: 'firebase-owner-1',
      email: 'owner@example.com',
      organizationName: 'Cleanzi Test',
      ownerFullName: 'Jan Kowalski',
      now: new Date('2026-07-31T10:00:00.000Z'),
    }),
    (error) => error.publicCode === 'REGISTRATION_REQUIRED' && error.statusCode === 409,
  )
  assert.equal(calls.length, 0)
})
