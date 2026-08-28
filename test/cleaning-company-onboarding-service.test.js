'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const { LEGAL_DOCUMENT_ALLOWLIST } = require('../cleaning-company-onboarding-domain')
const {
  CLEANING_COMPANY_REGISTRATION_CHANNEL,
  CLEANING_COMPANY_REGISTRATION_GRANT_VERSION,
  CLEANING_COMPANY_TRIAL_DAYS,
  CleaningCompanyOnboardingError,
  getCleaningCompanyLegalDocuments,
  hashOnboardingPayload,
  isCleaningCompanyOnboardingEnabled,
  provisionCleaningCompany,
  requiresCleaningCompanyAppCheck,
  startExistingGoogleAccountEnrollment,
} = require('../cleaning-company-onboarding-service')

const COMMAND_ID = '3bcd0d64-454d-4e8d-97da-23d90ce9fceb'
const NOW = new Date('2026-08-22T10:30:00.000Z')

function validPayload(overrides = {}) {
  return {
    commandId: COMMAND_ID,
    nip: '856-734-62-15',
    legalName: 'Czysta Firma sp. z o.o.',
    declaredEmployeeCount: 0,
    legalDocuments: {
      terms: { ...LEGAL_DOCUMENT_ALLOWLIST.terms, accepted: true },
      privacy: { ...LEGAL_DOCUMENT_ALLOWLIST.privacy, acknowledged: true },
    },
    marketing: { email: true, sms: false, phone: false },
    ...overrides,
  }
}

function verifiedToken(overrides = {}) {
  return {
    uid: 'firebase-owner-1',
    email: 'owner@example.test',
    email_verified: true,
    cleanziInitialRegistrationChannel: 'registration_cleaning_company',
    cleanziRegistrationGrantVersion: 1,
    name: 'Anna Właścicielka',
    ...overrides,
  }
}

function uuidFactory() {
  let count = 0
  return () => {
    count += 1
    return `00000000-0000-4000-8000-${String(count).padStart(12, '0')}`
  }
}

function createClient({
  command = null,
  registeredNip = null,
  trialRedemption = null,
  activeEnrollment = null,
  consumedEnrollment = null,
} = {}) {
  const calls = []
  return {
    calls,
    async query(sql, values = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim().toLowerCase()
      calls.push({ sql: normalized, values })
      if (normalized.startsWith('select command_id, actor_uid')) {
        return { rows: command ? [command] : [] }
      }
      if (normalized.startsWith('select command_id, org_id from public.cleaning_company_trial_redemption')) {
        return { rows: trialRedemption ? [trialRedemption] : [] }
      }
      if (normalized.startsWith('select org_id from public.organization_company_profile')) {
        return { rows: registeredNip ? [registeredNip] : [] }
      }
      if (normalized.startsWith('select enrollment_id, actor_uid, email_normalized, provider_id, status')) {
        return { rows: activeEnrollment ? [activeEnrollment] : [] }
      }
      if (normalized.startsWith('update public.cleaning_company_onboarding_enrollment')) {
        return { rows: consumedEnrollment ? [consumedEnrollment] : [{ enrollment_id: '00000000-0000-4000-8000-000000000099' }] }
      }
      return { rows: [], rowCount: 1 }
    },
  }
}

test('creates one isolated cleaning company with a 30-day trial and independent consent audit rows', async () => {
  const client = createClient()
  const result = await provisionCleaningCompany(client, {
    decodedToken: verifiedToken(),
    payload: validPayload(),
    request: { locale: 'pl-PL', ipHash: 'hashed-ip', userAgent: 'test agent' },
    now: NOW,
    idFactory: uuidFactory(),
  })

  assert.equal(result.replayed, false)
  assert.match(result.orgId, /^cc_[a-f0-9]{32}$/)
  assert.equal(result.trialEndsAt.toISOString(), '2026-09-21T10:30:00.000Z')
  assert.equal(CLEANING_COMPANY_TRIAL_DAYS, 30)
  assert.equal(client.calls[0].sql, 'begin')
  assert.equal(client.calls.at(-1).sql, 'commit')

  const inserts = client.calls.filter((call) => call.sql.startsWith('insert into'))
  assert.equal(inserts.length, 19)
  assert.equal(
    inserts.filter((call) => call.sql.startsWith('insert into public.user_consent')).length,
    5,
  )
  assert.equal(
    inserts.filter((call) => call.sql.startsWith('insert into public.cleaning_company_onboarding_consent_audit')).length,
    5,
  )
  assert.equal(
    inserts.filter((call) => call.sql.startsWith('insert into public.cleaning_company_trial_redemption')).length,
    1,
  )
  const trialEvent = inserts.find((call) => call.sql.startsWith('insert into public.subscription_event'))
  assert.ok(trialEvent)
  assert.match(trialEvent.sql, /'trial_started'/)
  assert.equal(trialEvent.values.some((value) => String(value).includes('8567346215')), false)
  const subscription = inserts.find((call) => call.sql.startsWith('insert into public.organization_subscription'))
  assert.deepEqual(subscription.values.slice(3), [NOW, result.trialEndsAt])
  const command = inserts.find((call) => call.sql.startsWith('insert into public.cleaning_company_onboarding_command'))
  assert.equal(command.values[3], hashOnboardingPayload(require('../cleaning-company-onboarding-domain').assertCompanyOnboarding(validPayload())))
  assert.equal(command.values.some((value) => String(value).includes('8567346215')), false)
  assert.equal(command.values.some((value) => String(value).includes('Czysta Firma')), false)

  const commandIndex = inserts.findIndex((call) => call === command)
  const firstConsentIndex = inserts.findIndex((call) => call.sql.startsWith('insert into public.user_consent'))
  assert.ok(commandIndex >= 0 && commandIndex < firstConsentIndex)
  assert.match(command.sql, /command_id.*\$1::uuid/s)
  assert.match(subscription.sql, /current_period_started_at.*current_period_ends_at/s)
})

test('refuses a registered NIP without attaching the account or making any insert', async () => {
  const client = createClient({ registeredNip: { org_id: 'existing-provider' } })

  await assert.rejects(
    provisionCleaningCompany(client, {
      decodedToken: verifiedToken(),
      payload: validPayload(),
      now: NOW,
      idFactory: uuidFactory(),
    }),
    (error) => error instanceof CleaningCompanyOnboardingError && error.code === 'NIP_ALREADY_REGISTERED',
  )

  assert.equal(client.calls.some((call) => call.sql.startsWith('insert into')), false)
  assert.equal(client.calls.at(-1).sql, 'rollback')
})

test('refuses a second trial for the same verified Firebase identity without making any insert', async () => {
  const client = createClient({
    trialRedemption: { command_id: 'c510fb1a-43a7-4fa1-8f82-6f9c7e50c44e', org_id: 'cc_previous' },
  })

  await assert.rejects(
    provisionCleaningCompany(client, {
      decodedToken: verifiedToken(),
      payload: validPayload(),
      now: NOW,
      idFactory: uuidFactory(),
    }),
    (error) => error instanceof CleaningCompanyOnboardingError && error.code === 'TRIAL_ALREADY_REDEEMED',
  )

  assert.equal(client.calls.some((call) => call.sql.startsWith('insert into')), false)
  assert.equal(client.calls.at(-1).sql, 'rollback')
})

test('replays a completed command only for its original actor and exact payload', async () => {
  const payload = validPayload()
  const validated = require('../cleaning-company-onboarding-domain').assertCompanyOnboarding(payload)
  const client = createClient({
    command: {
      command_id: COMMAND_ID,
      actor_uid: 'firebase-owner-1',
      payload_hash: hashOnboardingPayload(validated),
      org_id: 'cc_existing',
      result_status: 'COMPLETED',
      trial_ends_at: '2026-09-05T10:30:00.000Z',
    },
  })

  const result = await provisionCleaningCompany(client, {
    decodedToken: verifiedToken(),
    payload,
    now: NOW,
    idFactory: uuidFactory(),
  })

  assert.deepEqual(result, {
    replayed: true,
    orgId: 'cc_existing',
    trialEndsAt: '2026-09-05T10:30:00.000Z',
  })
  assert.equal(client.calls.some((call) => call.sql.startsWith('insert into')), false)
  assert.equal(client.calls.at(-1).sql, 'commit')
})

test('requires a verified e-mail before it can open a database transaction', async () => {
  const client = createClient()
  await assert.rejects(
    provisionCleaningCompany(client, {
      decodedToken: verifiedToken({ email_verified: false }),
      payload: validPayload(),
    }),
    (error) => error instanceof CleaningCompanyOnboardingError && error.code === 'EMAIL_VERIFICATION_REQUIRED',
  )
  assert.deepEqual(client.calls, [])
})

test('refuses a verified identity that was not issued through the cleaning-company registration gate', async () => {
  const client = createClient()
  await assert.rejects(
    provisionCleaningCompany(client, {
      decodedToken: verifiedToken({
        cleanziInitialRegistrationChannel: 'registration_facility_manager',
        cleanziRegistrationGrantVersion: CLEANING_COMPANY_REGISTRATION_GRANT_VERSION,
      }),
      payload: validPayload(),
    }),
    (error) => error instanceof CleaningCompanyOnboardingError && error.code === 'REGISTRATION_PROVENANCE_REQUIRED',
  )
  assert.deepEqual(client.calls, [])
  assert.equal(CLEANING_COMPANY_REGISTRATION_CHANNEL, 'registration_cleaning_company')
})

test('uses a short-lived existing Google enrollment only when it is consumed with the company command', async () => {
  const client = createClient()
  const result = await provisionCleaningCompany(client, {
    decodedToken: verifiedToken({
      cleanziInitialRegistrationChannel: '',
      cleanziRegistrationGrantVersion: 0,
      firebase: { sign_in_provider: 'google.com' },
    }),
    payload: validPayload(),
    existingAccountEnrollment: {
      enrollmentId: '00000000-0000-4000-8000-000000000099',
      actorUid: 'firebase-owner-1',
      email: 'owner@example.test',
      providerId: 'google.com',
      status: 'ACTIVE',
      expiresAt: '2026-08-22T11:00:00.000Z',
    },
    now: NOW,
    idFactory: uuidFactory(),
  })

  assert.equal(result.replayed, false)
  const enrollmentConsume = client.calls.find((call) =>
    call.sql.startsWith('update public.cleaning_company_onboarding_enrollment') &&
    call.sql.includes("set status = 'consumed'"),
  )
  assert.ok(enrollmentConsume)
  assert.equal(enrollmentConsume.values[3], COMMAND_ID)
  assert.equal(enrollmentConsume.values[5], 'google.com')
  const commandInsertIndex = client.calls.findIndex((call) =>
    call.sql.startsWith('insert into public.cleaning_company_onboarding_command'),
  )
  const enrollmentConsumeIndex = client.calls.findIndex((call) => call === enrollmentConsume)
  assert.ok(commandInsertIndex >= 0 && commandInsertIndex < enrollmentConsumeIndex)
})

test('prepares a bounded enrollment only for a verified Google identity with no redeemed trial', async () => {
  const client = createClient()
  const result = await startExistingGoogleAccountEnrollment(client, {
    decodedToken: verifiedToken({ firebase: { sign_in_provider: 'google.com' } }),
    now: NOW,
    idFactory: () => '00000000-0000-4000-8000-000000000099',
  })

  assert.equal(result.replayed, false)
  assert.equal(result.status, 'ACTIVE')
  assert.equal(result.providerId, 'google.com')
  assert.equal(new Date(result.expiresAt).toISOString(), '2026-08-22T11:00:00.000Z')
  assert.ok(client.calls.some((call) =>
    call.sql.startsWith('insert into public.cleaning_company_onboarding_enrollment'),
  ))

  await assert.rejects(
    startExistingGoogleAccountEnrollment(createClient(), {
      decodedToken: verifiedToken({ firebase: { sign_in_provider: 'password' } }),
      now: NOW,
    }),
    (error) => error instanceof CleaningCompanyOnboardingError && error.code === 'GOOGLE_IDENTITY_REQUIRED',
  )
})

test('publishes fixed legal documents and requires App Check unless explicitly disabled', () => {
  const legal = getCleaningCompanyLegalDocuments()
  assert.equal(legal.terms.url, 'https://cleanzi.pl/regulamin')
  assert.equal(legal.privacy.version, '2026-07-30')
  assert.equal(isCleaningCompanyOnboardingEnabled({ CLEANING_COMPANY_ONBOARDING_ENABLED: 'true' }), false)
  assert.equal(
    isCleaningCompanyOnboardingEnabled({
      CLEANING_COMPANY_ONBOARDING_ENABLED: 'true',
      CLEANING_COMPANY_ONBOARDING_AUTO_CONFIRMATION_ENABLED: 'true',
    }),
    true,
  )
  assert.equal(requiresCleaningCompanyAppCheck({}), true)
  assert.equal(requiresCleaningCompanyAppCheck({ CLEANING_COMPANY_ONBOARDING_REQUIRE_APP_CHECK: 'false' }), false)
})
