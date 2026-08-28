'use strict'

// Database-side orchestration for the first cleaning-company profile.
// The HTTP layer must authenticate the Firebase account and verify App Check
// before it calls this module.  This module intentionally never accepts an
// org id, role, trial duration, or account identity from a browser payload.

const crypto = require('node:crypto')
const {
  LEGAL_DOCUMENT_ALLOWLIST,
  CompanyOnboardingValidationError,
  assertCompanyOnboarding,
} = require('./cleaning-company-onboarding-domain')

const CLEANING_COMPANY_ONBOARDING_REQUIRED = 'CLEANING_COMPANY_ONBOARDING_REQUIRED'
const CLEANING_COMPANY_ONBOARDING_READY = 'READY'
const CLEANING_COMPANY_ORGANIZATION_KIND = 'CLEANING_PROVIDER'
const CLEANING_COMPANY_TRIAL_DAYS = 30
const CLEANING_COMPANY_EXISTING_ACCOUNT_ENROLLMENT_PROVIDER = 'google.com'
const CLEANING_COMPANY_EXISTING_ACCOUNT_ENROLLMENT_ACTIVE = 'ACTIVE'
const CLEANING_COMPANY_EXISTING_ACCOUNT_ENROLLMENT_CONSUMED = 'CONSUMED'
const CLEANING_COMPANY_EXISTING_ACCOUNT_ENROLLMENT_TTL_MS = 30 * 60 * 1000
const MARKETING_CONSENT_COPY_VERSION = '2026-08-22'
// These claims are written only by the central Firebase beforeCreate gate
// after it has consumed a single-use cleaning-company registration grant.
// They are provenance, not organization roles or permissions.
const CLEANING_COMPANY_REGISTRATION_CHANNEL = 'registration_cleaning_company'
const CLEANING_COMPANY_REGISTRATION_GRANT_VERSION = 1

class CleaningCompanyOnboardingError extends Error {
  constructor(code, message, statusCode = 400, details = undefined) {
    super(message)
    this.name = 'CleaningCompanyOnboardingError'
    this.code = code
    this.statusCode = statusCode
    this.details = details
  }
}

function text(value) {
  return String(value ?? '').trim()
}

function isTrue(value) {
  return ['1', 'true', 'yes', 'tak'].includes(text(value).toLowerCase())
}

function isCleaningCompanyOnboardingEnabled(environment = process.env) {
  // The public Terms currently require confirmation by the service provider.
  // A deployment can only make the self-service flow available after the
  // service owner has explicitly approved an automated confirmation policy.
  return isTrue(environment?.CLEANING_COMPANY_ONBOARDING_ENABLED) &&
    isTrue(environment?.CLEANING_COMPANY_ONBOARDING_AUTO_CONFIRMATION_ENABLED)
}

function requiresCleaningCompanyAppCheck(environment = process.env) {
  const configured = text(environment?.CLEANING_COMPANY_ONBOARDING_REQUIRE_APP_CHECK)
  // A public registration endpoint is fail-closed by default.  A non-production
  // test environment may opt out explicitly, never implicitly.
  if (!configured) return true
  return isTrue(configured)
}

function hasVerifiedCompanyEmail(decodedToken) {
  return decodedToken?.email_verified === true && Boolean(normalizeEmail(decodedToken?.email))
}

function hasCleaningCompanyRegistrationProvenance(decodedToken) {
  return text(decodedToken?.cleanziInitialRegistrationChannel) === CLEANING_COMPANY_REGISTRATION_CHANNEL &&
    Number(decodedToken?.cleanziRegistrationGrantVersion) === CLEANING_COMPANY_REGISTRATION_GRANT_VERSION
}

function normalizeEmail(value) {
  const email = text(value).toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 160 ? email : ''
}

function getCleaningCompanyLegalDocuments() {
  return {
    terms: { ...LEGAL_DOCUMENT_ALLOWLIST.terms },
    privacy: { ...LEGAL_DOCUMENT_ALLOWLIST.privacy },
    marketing: {
      copyVersion: MARKETING_CONSENT_COPY_VERSION,
      channels: ['email', 'sms', 'phone'],
    },
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function hashOnboardingPayload(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex')
}

function addTrialDays(startedAt) {
  const start = new Date(startedAt)
  if (!Number.isFinite(start.getTime())) {
    throw new Error('INVALID_ONBOARDING_CLOCK')
  }
  const trialEndsAt = new Date(start)
  trialEndsAt.setUTCDate(trialEndsAt.getUTCDate() + CLEANING_COMPANY_TRIAL_DAYS)
  return trialEndsAt
}

function createOrganizationId(randomId = crypto.randomUUID) {
  return `cc_${text(randomId()).replace(/[^a-z0-9]/gi, '').toLowerCase()}`.slice(0, 64)
}

function createOwnerLogin(commandId) {
  return `owner_${text(commandId).replace(/-/g, '').slice(0, 20)}`.slice(0, 80)
}

function createOwnerName(decodedToken, email) {
  const candidate = text(decodedToken?.name || decodedToken?.display_name)
  if (candidate && candidate.length <= 200) return candidate
  return email.slice(0, 200)
}

function buildConsentRows({ validated, orgId, uid, now, request, idFactory }) {
  const legal = validated.legalDocuments
  const base = {
    orgId,
    uid,
    locale: text(request?.locale).slice(0, 10) || 'pl-PL',
    ipHash: text(request?.ipHash).slice(0, 128) || null,
    userAgent: text(request?.userAgent).slice(0, 500) || null,
    onboardingCommandId: validated.commandId,
    createdAt: now,
  }
  const legalRows = [
    {
      ...base,
      consentId: idFactory(),
      consentType: 'TERMS',
      documentId: legal.terms.documentId,
      consentVersion: legal.terms.version,
      accepted: true,
      acceptedAt: now,
    },
    {
      ...base,
      consentId: idFactory(),
      consentType: 'PRIVACY_POLICY',
      documentId: legal.privacy.documentId,
      consentVersion: legal.privacy.version,
      accepted: true,
      acceptedAt: now,
    },
  ]
  const marketingRows = [
    ['email', 'MARKETING_EMAIL'],
    ['sms', 'MARKETING_SMS'],
    ['phone', 'MARKETING_PHONE'],
  ].map(([channel, consentType]) => {
    const accepted = validated.marketing[channel] === true
    return {
      ...base,
      consentId: idFactory(),
      consentType,
      documentId: `marketing-${channel}`,
      consentVersion: MARKETING_CONSENT_COPY_VERSION,
      accepted,
      acceptedAt: accepted ? now : null,
    }
  })
  return [...legalRows, ...marketingRows]
}

function duplicateNipError() {
  return new CleaningCompanyOnboardingError(
    'NIP_ALREADY_REGISTERED',
    'Firma o tym NIP jest już zarejestrowana. Nie połączyliśmy kont automatycznie — skontaktuj się z obsługą lub poproś o zaproszenie.',
    409,
  )
}

function duplicateCommandError() {
  return new CleaningCompanyOnboardingError(
    'ONBOARDING_COMMAND_CONFLICT',
    'To żądanie rejestracji nie może zostać bezpiecznie powtórzone z innymi danymi.',
    409,
  )
}

function trialAlreadyRedeemedError() {
  return new CleaningCompanyOnboardingError(
    'TRIAL_ALREADY_REDEEMED',
    'Ten użytkownik wykorzystał już okres próbny. Nie utworzyliśmy ani nie połączyliśmy kolejnej firmy automatycznie.',
    409,
  )
}

function assertAuthenticatedVerifiedOwner(decodedToken, {
  requireRegistrationProvenance = true,
} = {}) {
  const uid = text(decodedToken?.uid || decodedToken?.user_id || decodedToken?.sub)
  const email = normalizeEmail(decodedToken?.email)
  if (!uid || !email || !hasVerifiedCompanyEmail(decodedToken)) {
    throw new CleaningCompanyOnboardingError(
      'EMAIL_VERIFICATION_REQUIRED',
      'Najpierw potwierdź adres e-mail, a potem uzupełnij dane firmy.',
      403,
    )
  }
  if (requireRegistrationProvenance && !hasCleaningCompanyRegistrationProvenance(decodedToken)) {
    throw new CleaningCompanyOnboardingError(
      'REGISTRATION_PROVENANCE_REQUIRED',
      'To konto nie zostało utworzone przez bezpieczną rejestrację firmy sprzątającej.',
      403,
    )
  }
  return { uid, email }
}

function hasGoogleFirebaseIdentity(decodedToken) {
  const provider = text(decodedToken?.firebase?.sign_in_provider).toLowerCase()
  if (provider === CLEANING_COMPANY_EXISTING_ACCOUNT_ENROLLMENT_PROVIDER) return true
  const identities = decodedToken?.firebase?.identities
  return Array.isArray(identities?.[CLEANING_COMPANY_EXISTING_ACCOUNT_ENROLLMENT_PROVIDER]) &&
    identities[CLEANING_COMPANY_EXISTING_ACCOUNT_ENROLLMENT_PROVIDER].length > 0
}

function existingAccountEnrollmentRequiredError() {
  return new CleaningCompanyOnboardingError(
    'REGISTRATION_ENROLLMENT_REQUIRED',
    'Najpierw wybierz rejestrację firmy dla tego konta Google.',
    403,
  )
}

function existingAccountEnrollmentStorageError() {
  return new CleaningCompanyOnboardingError(
    'REGISTRATION_ENROLLMENT_UNAVAILABLE',
    'Rejestracja firmy jest chwilowo przygotowywana. Spróbuj ponownie za chwilę.',
    503,
  )
}

function existingAccountGoogleIdentityRequiredError() {
  return new CleaningCompanyOnboardingError(
    'GOOGLE_IDENTITY_REQUIRED',
    'Aby dokończyć tę rejestrację, zaloguj się kontem Google.',
    403,
  )
}

function isKnownDuplicateNipViolation(error) {
  const constraint = text(error?.constraint).toLowerCase()
  return error?.code === '23505' && (
    constraint.includes('organization_company_profile_nip') ||
    constraint.includes('tax_id_normalized')
  )
}

function isKnownTrialRedemptionViolation(error) {
  const constraint = text(error?.constraint).toLowerCase()
  return error?.code === '23505' && constraint.includes('cleaning_company_trial_redemption')
}

async function readOnboardingCommand(client, commandId) {
  const result = await client.query(
    `select command_id, actor_uid, payload_hash, org_id, result_status, trial_ends_at
       from public.cleaning_company_onboarding_command
       where command_id = $1::uuid
       for update`,
    [commandId],
  )
  return result.rows[0] || null
}

async function findRegisteredNip(client, nip) {
  const result = await client.query(
    `select org_id
       from public.organization_company_profile
       where upper(coalesce(tax_id_type, '')) = 'NIP'
         and tax_id_normalized = $1::text
       limit 1
       for update`,
    [nip],
  )
  return result.rows[0] || null
}

async function findTrialRedemption(client, actor) {
  const result = await client.query(
    `select command_id, org_id
       from public.cleaning_company_trial_redemption
      where uid = $1::text
         or email_normalized = $2::text
      limit 1
      for update`,
    [actor.uid, actor.email],
  )
  return result.rows[0] || null
}

function normalizeEnrollment(row) {
  if (!row || typeof row !== 'object') return null
  const enrollmentId = text(row.enrollment_id ?? row.enrollmentId)
  const actorUid = text(row.actor_uid ?? row.actorUid)
  const email = normalizeEmail(row.email_normalized ?? row.emailNormalized ?? row.email)
  const providerId = text(row.provider_id ?? row.providerId).toLowerCase()
  const status = text(row.status).toUpperCase()
  const expiresAt = row.expires_at ?? row.expiresAt ?? null
  if (!enrollmentId || !actorUid || !email || !providerId || !status || !expiresAt) return null
  return {
    enrollmentId,
    actorUid,
    email,
    providerId,
    status,
    expiresAt,
    onboardingCommandId: text(row.onboarding_command_id ?? row.onboardingCommandId),
  }
}

function enrollmentIsActive(enrollment, now = new Date()) {
  if (!enrollment || enrollment.status !== CLEANING_COMPANY_EXISTING_ACCOUNT_ENROLLMENT_ACTIVE) return false
  const expiresAt = new Date(enrollment.expiresAt)
  return Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() > new Date(now).getTime()
}

function enrollmentStorageMissing(error) {
  return error?.code === '42P01' || /cleaning_company_onboarding_enrollment/i.test(text(error?.message))
}

async function findActiveExistingAccountEnrollment(client, decodedToken, { now = new Date() } = {}) {
  const actor = assertAuthenticatedVerifiedOwner(decodedToken, { requireRegistrationProvenance: false })
  try {
    const result = await client.query(
      `select enrollment_id, actor_uid, email_normalized, provider_id, status,
              expires_at, onboarding_command_id
         from public.cleaning_company_onboarding_enrollment
        where actor_uid = $1::text
          and email_normalized = $2::text
          and status = 'ACTIVE'
          and expires_at > $3::timestamptz
        order by created_at desc
        limit 1`,
      [actor.uid, actor.email, now],
    )
    return normalizeEnrollment(result.rows[0])
  } catch (error) {
    if (enrollmentStorageMissing(error)) return null
    throw error
  }
}

async function findExistingAccountEnrollmentForProvision(client, decodedToken) {
  const actor = assertAuthenticatedVerifiedOwner(decodedToken, { requireRegistrationProvenance: false })
  try {
    const result = await client.query(
      `select enrollment_id, actor_uid, email_normalized, provider_id, status,
              expires_at, onboarding_command_id
         from public.cleaning_company_onboarding_enrollment
        where actor_uid = $1::text
          and email_normalized = $2::text
          and status in ('ACTIVE', 'CONSUMED')
        order by created_at desc
        limit 1`,
      [actor.uid, actor.email],
    )
    return normalizeEnrollment(result.rows[0])
  } catch (error) {
    if (enrollmentStorageMissing(error)) return null
    throw error
  }
}

async function lockExistingAccountEnrollmentKey(client, actor) {
  await client.query(
    `select pg_advisory_xact_lock(hashtext($1::text)),
            pg_advisory_xact_lock(hashtext($2::text))`,
    [
      `cleaning-company-enrollment-uid:${actor.uid}`,
      `cleaning-company-enrollment-email:${actor.email}`,
    ],
  )
}

async function startExistingGoogleAccountEnrollment(client, {
  decodedToken,
  now = new Date(),
  idFactory = crypto.randomUUID,
} = {}) {
  const actor = assertAuthenticatedVerifiedOwner(decodedToken, { requireRegistrationProvenance: false })
  if (!hasGoogleFirebaseIdentity(decodedToken)) {
    throw existingAccountGoogleIdentityRequiredError()
  }

  const startedAt = new Date(now)
  if (!Number.isFinite(startedAt.getTime())) {
    throw new CleaningCompanyOnboardingError('INVALID_ONBOARDING_CLOCK', 'Nie udało się przygotować rejestracji.', 500)
  }
  const expiresAt = new Date(startedAt.getTime() + CLEANING_COMPANY_EXISTING_ACCOUNT_ENROLLMENT_TTL_MS)
  let committed = false

  try {
    await client.query('begin')
    await lockExistingAccountEnrollmentKey(client, actor)

    if (await findTrialRedemption(client, actor)) {
      throw trialAlreadyRedeemedError()
    }

    const existing = await findActiveExistingAccountEnrollment(client, decodedToken, { now: startedAt })
    if (existing) {
      await client.query('commit')
      committed = true
      return { ...existing, replayed: true }
    }

    await client.query(
      `update public.cleaning_company_onboarding_enrollment
          set status = 'EXPIRED', expired_at = $3::timestamptz
        where actor_uid = $1::text
          and email_normalized = $2::text
          and status = 'ACTIVE'`,
      [actor.uid, actor.email, startedAt],
    )

    const enrollmentId = text(idFactory())
    await client.query(
      `insert into public.cleaning_company_onboarding_enrollment (
         enrollment_id, actor_uid, email_normalized, provider_id, status,
         expires_at, created_at, activated_at
       ) values (
         $1::uuid, $2::text, $3::text, $4::text, 'ACTIVE',
         $5::timestamptz, $6::timestamptz, $6::timestamptz
       )`,
      [
        enrollmentId,
        actor.uid,
        actor.email,
        CLEANING_COMPANY_EXISTING_ACCOUNT_ENROLLMENT_PROVIDER,
        expiresAt,
        startedAt,
      ],
    )

    await client.query('commit')
    committed = true
    return {
      enrollmentId,
      actorUid: actor.uid,
      email: actor.email,
      providerId: CLEANING_COMPANY_EXISTING_ACCOUNT_ENROLLMENT_PROVIDER,
      status: CLEANING_COMPANY_EXISTING_ACCOUNT_ENROLLMENT_ACTIVE,
      expiresAt,
      onboardingCommandId: '',
      replayed: false,
    }
  } catch (error) {
    if (!committed) {
      try {
        await client.query('rollback')
      } catch {
        // Keep the original error; the caller must retry safely.
      }
    }
    if (enrollmentStorageMissing(error)) {
      throw existingAccountEnrollmentStorageError()
    }
    throw error
  }
}

async function consumeExistingAccountEnrollment(client, enrollment, actor, commandId, now) {
  const normalized = normalizeEnrollment(enrollment)
  if (!normalized || normalized.status !== CLEANING_COMPANY_EXISTING_ACCOUNT_ENROLLMENT_ACTIVE) {
    throw existingAccountEnrollmentRequiredError()
  }

  try {
    const result = await client.query(
      `update public.cleaning_company_onboarding_enrollment
          set status = 'CONSUMED', consumed_at = $5::timestamptz,
              onboarding_command_id = $4::uuid
        where enrollment_id = $1::uuid
          and actor_uid = $2::text
          and email_normalized = $3::text
          and provider_id = $6::text
          and status = 'ACTIVE'
          and expires_at > $5::timestamptz
        returning enrollment_id`,
      [
        normalized.enrollmentId,
        actor.uid,
        actor.email,
        commandId,
        now,
        CLEANING_COMPANY_EXISTING_ACCOUNT_ENROLLMENT_PROVIDER,
      ],
    )
    if (!result.rows[0]) throw existingAccountEnrollmentRequiredError()
  } catch (error) {
    if (error instanceof CleaningCompanyOnboardingError) throw error
    if (enrollmentStorageMissing(error)) throw existingAccountEnrollmentStorageError()
    throw error
  }
}

async function lockOnboardingKeys(client, commandId, nip, actor) {
  // Advisory locks make retries and concurrent command, NIP, user and e-mail
  // requests deterministic even before a row exists. Database uniqueness is
  // still the final integrity barrier.
  await client.query(
    `select pg_advisory_xact_lock(hashtext($1::text)),
            pg_advisory_xact_lock(hashtext($2::text)),
            pg_advisory_xact_lock(hashtext($3::text)),
            pg_advisory_xact_lock(hashtext($4::text))`,
    [
      `cleaning-company-command:${commandId}`,
      `cleaning-company-nip:${nip}`,
      `cleaning-company-uid:${actor.uid}`,
      `cleaning-company-email:${actor.email}`,
    ],
  )
}

async function insertCompanyRows(client, {
  validated,
  actor,
  request,
  now,
  trialEndsAt,
  orgId,
  ownerWorkerId,
  ownerLogin,
  ownerName,
  idFactory,
}) {
  await client.query(
    `insert into public.organizations (
       org_id, name, status, onboarding_status, owner_uid, owner_worker_id,
       organization_kind, created_at, updated_at
     ) values (
       $1::text, $2::text, 'TRIAL', 'COMPLETED', $3::text, $4::text,
       $5::text, $6::timestamptz, $6::timestamptz
     )`,
    [
      orgId,
      validated.legalName,
      actor.uid,
      ownerWorkerId,
      CLEANING_COMPANY_ORGANIZATION_KIND,
      now,
    ],
  )

  await client.query(
    `insert into public.organization_company_profile (
      org_id, legal_name, registration_country_code, country_code,
      tax_id_type, tax_id_value, tax_id_normalized, declared_employee_count,
      declared_employee_count_source, declared_employee_count_recorded_at,
      created_at, updated_at
    ) values (
      $1::text, $2::text, 'PL', 'PL', 'NIP', $3::text, $3::text, $4::integer,
      'ONBOARDING_V2', $5::timestamptz, $5::timestamptz, $5::timestamptz
    )`,
    [orgId, validated.legalName, validated.nip, validated.declaredEmployeeCount, now],
  )

  await client.query(
    `insert into public.worker_id_reservation (
       org_id, worker_number, worker_id, created_at, created_by_uid
     ) values ($1::text, 1, $2::text, $3::timestamptz, $4::text)`,
    [orgId, ownerWorkerId, now, actor.uid],
  )

  await client.query(
    `insert into public.worker (
       org_id, login, worker_id, full_name, login_email, role, active, status,
       email, worker_type, auth_uid, created_at, updated_at
     ) values (
       $1::text, $2::text, $3::text, $4::text, $5::text, 'OWNER', true, 'ACTIVE',
       $5::text, 'OFFICE', $6::text, $7::timestamptz, $7::timestamptz
     )`,
    [orgId, ownerLogin, ownerWorkerId, ownerName, actor.email, actor.uid, now],
  )

  await client.query(
    `insert into public.organization_member (
       org_id, uid, role, worker_id, status, created_at
     ) values ($1::text, $2::text, 'OWNER', $3::text, 'ACTIVE', $4::timestamptz)`,
    [orgId, actor.uid, ownerWorkerId, now],
  )

  await client.query(
    `insert into public.organization_subscription (
      org_id, billing_owner_uid, billing_owner_worker_id, plan_code, status,
      currency_code, trial_started_at, trial_ends_at,
      current_period_started_at, current_period_ends_at, created_at, updated_at
    ) values (
      $1::text, $2::text, $3::text, 'TRIAL', 'TRIALING', 'PLN',
      $4::timestamptz, $5::timestamptz,
      $4::timestamptz, $5::timestamptz, $4::timestamptz, $4::timestamptz
    )`,
    [orgId, actor.uid, ownerWorkerId, now, trialEndsAt],
  )

  // The command is created before consent and redemption evidence because
  // their immutable tables hold foreign keys to this completed command.
  // The result payload is intentionally minimal and never includes the NIP,
  // company name, Firebase token, or other browser-supplied personal data.
  await client.query(
    `insert into public.cleaning_company_onboarding_command (
       command_id, actor_uid, org_id, schema_version, payload_hash,
       result_status, result_payload, trial_started_at, trial_ends_at,
       created_at, completed_at
     ) values (
       $1::uuid, $2::text, $3::text, 2, $4::text,
       'COMPLETED', $5::jsonb, $6::timestamptz, $7::timestamptz,
       $6::timestamptz, $6::timestamptz
     )`,
    [
      validated.commandId,
      actor.uid,
      orgId,
      hashOnboardingPayload(validated),
      JSON.stringify({ orgId, trialEndsAt: trialEndsAt.toISOString(), schemaVersion: 2 }),
      now,
      trialEndsAt,
    ],
  )

  const consentRows = buildConsentRows({
    validated,
    orgId,
    uid: actor.uid,
    now,
    request,
    idFactory,
  })
  for (const consent of consentRows) {
    await client.query(
      `insert into public.user_consent (
         consent_id, org_id, uid, consent_type, document_id, consent_version,
         accepted, accepted_at, locale, ip_hash, user_agent,
         onboarding_command_id, created_at
        ) values (
          $1::text, $2::text, $3::text, $4::text, $5::text, $6::text,
          $7::boolean, $8::timestamptz, $9::text, $10::text, $11::text,
          $12::uuid, $13::timestamptz
        )`,
      [
        consent.consentId,
        consent.orgId,
        consent.uid,
        consent.consentType,
        consent.documentId,
        consent.consentVersion,
        consent.accepted,
        consent.acceptedAt,
        consent.locale,
        consent.ipHash,
        consent.userAgent,
        consent.onboardingCommandId,
        consent.createdAt,
        ],
      )

    await client.query(
      `insert into public.cleaning_company_onboarding_consent_audit (
         audit_id, command_id, consent_id, org_id, uid, consent_type,
         document_id, consent_version, accepted, accepted_at, locale, source,
         recorded_at
       ) values (
         $1::uuid, $2::uuid, $3::text, $4::text, $5::text, $6::text,
         $7::text, $8::text, $9::boolean, $10::timestamptz, $11::text,
         'company-onboarding', $12::timestamptz
       )`,
      [
        idFactory(),
        validated.commandId,
        consent.consentId,
        consent.orgId,
        consent.uid,
        consent.consentType,
        consent.documentId,
        consent.consentVersion,
        consent.accepted,
        consent.acceptedAt,
        consent.locale,
        now,
      ],
    )
  }

  await client.query(
    `insert into public.cleaning_company_trial_redemption (
       redemption_id, command_id, uid, email_normalized, org_id,
       redeemed_at, created_at
     ) values (
       $1::uuid, $2::uuid, $3::text, $4::text, $5::text,
       $6::timestamptz, $6::timestamptz
     )`,
    [idFactory(), validated.commandId, actor.uid, actor.email, orgId, now],
  )

  await client.query(
    `insert into public.subscription_event (
       org_id, subscription_event_id, event_type, new_status, new_plan_code,
       actor_uid, actor_worker_id, source, reason, metadata, occurred_at,
       created_at
     ) values (
       $1::text, $2::text, 'TRIAL_STARTED', 'TRIALING', 'TRIAL',
       $3::text, $4::text, 'SYSTEM', 'CLEANING_COMPANY_ONBOARDING',
       $5::jsonb, $6::timestamptz, $6::timestamptz
     )`,
    [
      orgId,
      `trial_started_${validated.commandId}`,
      actor.uid,
      ownerWorkerId,
      JSON.stringify({ onboardingCommandId: validated.commandId, trialEndsAt: trialEndsAt.toISOString() }),
      now,
    ],
  )
}

async function provisionCleaningCompany(client, {
  decodedToken,
  payload,
  request = {},
  existingAccountEnrollment = null,
  now = new Date(),
  idFactory = crypto.randomUUID,
} = {}) {
  const usesExistingAccountEnrollment = Boolean(normalizeEnrollment(existingAccountEnrollment))
  const actor = assertAuthenticatedVerifiedOwner(decodedToken, {
    requireRegistrationProvenance: !usesExistingAccountEnrollment,
  })
  let validated
  try {
    validated = assertCompanyOnboarding(payload)
  } catch (error) {
    if (error instanceof CompanyOnboardingValidationError) {
      throw new CleaningCompanyOnboardingError(
        error.code,
        'Uzupełnij wymagane dane firmy i potwierdź dokumenty.',
        400,
        error.errors,
      )
    }
    throw error
  }

  const payloadHash = hashOnboardingPayload(validated)
  const startedAt = new Date(now)
  const trialEndsAt = addTrialDays(startedAt)
  let committed = false

  try {
    await client.query('begin')
    await lockOnboardingKeys(client, validated.commandId, validated.nip, actor)

    const existingCommand = await readOnboardingCommand(client, validated.commandId)
    if (existingCommand) {
      if (
        text(existingCommand.actor_uid) !== actor.uid ||
        text(existingCommand.payload_hash) !== payloadHash
      ) {
        throw duplicateCommandError()
      }
      if (text(existingCommand.result_status).toUpperCase() !== 'COMPLETED' || !text(existingCommand.org_id)) {
        throw new CleaningCompanyOnboardingError(
          'ONBOARDING_COMMAND_NOT_READY',
          'Rejestracja firmy jest jeszcze przetwarzana. Spróbuj ponownie za chwilę.',
          409,
        )
      }
      await client.query('commit')
      committed = true
      return {
        replayed: true,
        orgId: text(existingCommand.org_id),
        trialEndsAt: existingCommand.trial_ends_at || null,
      }
    }

    if (await findTrialRedemption(client, actor)) {
      throw trialAlreadyRedeemedError()
    }

    if (await findRegisteredNip(client, validated.nip)) {
      throw duplicateNipError()
    }

    const orgId = createOrganizationId(idFactory)
    const ownerWorkerId = `worker_${orgId}_1`
    const ownerLogin = createOwnerLogin(validated.commandId)
    const ownerName = createOwnerName(decodedToken, actor.email)
    await insertCompanyRows(client, {
      validated,
      actor,
      request,
      now: startedAt,
      trialEndsAt,
      orgId,
      ownerWorkerId,
      ownerLogin,
      ownerName,
      idFactory,
    })

    // insertCompanyRows writes the immutable onboarding command first.  The
    // existing-account enrollment has a foreign key to that command, so it
    // must be consumed afterwards, still inside the same transaction.  A
    // failed or expired enrollment rolls back every just-created company row.
    if (usesExistingAccountEnrollment) {
      await consumeExistingAccountEnrollment(
        client,
        existingAccountEnrollment,
        actor,
        validated.commandId,
        startedAt,
      )
    }

    await client.query('commit')
    committed = true
    return { replayed: false, orgId, trialEndsAt }
  } catch (error) {
    if (!committed) {
      try {
        await client.query('rollback')
      } catch {
        // Keep the original transaction error; callers cannot safely continue.
      }
    }
    if (isKnownDuplicateNipViolation(error)) {
      throw duplicateNipError()
    }
    if (isKnownTrialRedemptionViolation(error)) {
      throw trialAlreadyRedeemedError()
    }
    throw error
  }
}

module.exports = Object.freeze({
  CLEANING_COMPANY_ONBOARDING_REQUIRED,
  CLEANING_COMPANY_ONBOARDING_READY,
  CLEANING_COMPANY_ORGANIZATION_KIND,
  CLEANING_COMPANY_REGISTRATION_CHANNEL,
  CLEANING_COMPANY_REGISTRATION_GRANT_VERSION,
  CLEANING_COMPANY_TRIAL_DAYS,
  CLEANING_COMPANY_EXISTING_ACCOUNT_ENROLLMENT_ACTIVE,
  CLEANING_COMPANY_EXISTING_ACCOUNT_ENROLLMENT_CONSUMED,
  CLEANING_COMPANY_EXISTING_ACCOUNT_ENROLLMENT_PROVIDER,
  CLEANING_COMPANY_EXISTING_ACCOUNT_ENROLLMENT_TTL_MS,
  MARKETING_CONSENT_COPY_VERSION,
  CleaningCompanyOnboardingError,
  addTrialDays,
  assertAuthenticatedVerifiedOwner,
  consumeExistingAccountEnrollment,
  createOrganizationId,
  findActiveExistingAccountEnrollment,
  findExistingAccountEnrollmentForProvision,
  getCleaningCompanyLegalDocuments,
  hasGoogleFirebaseIdentity,
  hasCleaningCompanyRegistrationProvenance,
  hasVerifiedCompanyEmail,
  hashOnboardingPayload,
  isCleaningCompanyOnboardingEnabled,
  normalizeEmail,
  provisionCleaningCompany,
  requiresCleaningCompanyAppCheck,
  startExistingGoogleAccountEnrollment,
  stableStringify,
})
