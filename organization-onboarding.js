'use strict'

const crypto = require('node:crypto')
const { buildWorkerId, buildWorkerLogin } = require('./worker-id-policy')
const { normalizePlanCode } = require('./plan-policy')

const TRIAL_DAYS = 7

function text(value, maxLength = 1000) {
  return String(value ?? '').trim().slice(0, maxLength)
}

function publicError(statusCode, publicCode, publicMessage, details = undefined) {
  const error = new Error(publicCode)
  error.statusCode = statusCode
  error.publicCode = publicCode
  error.publicMessage = publicMessage
  if (details !== undefined) error.details = details
  return error
}

function normalizeNip(value) {
  return String(value ?? '').replace(/[^0-9]/g, '')
}

/** @param {unknown} value @returns {boolean} */
function isValidPolishNip(value) {
  const nip = normalizeNip(value)
  if (!/^\d{10}$/.test(nip)) return false
  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7]
  const checksum = weights.reduce((sum, weight, index) => sum + weight * Number(nip[index]), 0) % 11
  return checksum !== 10 && checksum === Number(nip[9])
}

function normalizeEmail(value) {
  const email = text(value, 160).toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''
}

function normalizeCountryCode(value) {
  const countryCode = text(value || 'PL', 2).toUpperCase()
  return /^[A-Z]{2}$/.test(countryCode) ? countryCode : 'PL'
}

function normalizeProfileInput(value = {}) {
  const nip = normalizeNip(value.nip)
  const billingNip = normalizeNip(value.billingNip ?? value.billing_nip)
  if (nip && !isValidPolishNip(nip)) {
    throw publicError(400, 'INVALID_NIP', 'Podaj poprawny polski NIP.')
  }
  if (billingNip && !isValidPolishNip(billingNip)) {
    throw publicError(400, 'INVALID_BILLING_NIP', 'Podaj poprawny NIP do rozliczeń.')
  }

  return {
    nip: nip || null,
    regon: normalizeNip(value.regon).slice(0, 14) || null,
    legalName: text(value.legalName ?? value.legal_name, 300) || null,
    registeredAddress: text(value.registeredAddress ?? value.registered_address, 1000) || null,
    street: text(value.street, 180) || null,
    buildingNumber: text(value.buildingNumber ?? value.building_number, 40) || null,
    unitNumber: text(value.unitNumber ?? value.unit_number, 40) || null,
    postalCode: text(value.postalCode ?? value.postal_code, 12) || null,
    city: text(value.city, 120) || null,
    countryCode: normalizeCountryCode(value.countryCode ?? value.country_code),
    ownerFullName: text(value.ownerFullName ?? value.owner_full_name, 200) || null,
    billingName: text(value.billingName ?? value.billing_name, 300) || null,
    billingNip: billingNip || null,
    billingAddress: text(value.billingAddress ?? value.billing_address, 1000) || null,
    billingPostalCode: text(value.billingPostalCode ?? value.billing_postal_code, 12) || null,
    billingCity: text(value.billingCity ?? value.billing_city, 120) || null,
    billingCountryCode: normalizeCountryCode(value.billingCountryCode ?? value.billing_country_code),
    billingEmail: normalizeEmail(value.billingEmail ?? value.billing_email) || null,
    registryProvider: text(value.registryProvider ?? value.registry_provider, 40) || null,
    registryFetchedAt: value.registryFetchedAt ?? value.registry_fetched_at ?? null,
  }
}

/**
 * Separates mandatory onboarding fields from fields required before paid activation.
 * @param {object} profile
 * @param {string} planCode
 */
function profileCompleteness(profile = {}, planCode = 'TRIAL') {
  const normalized = normalizeProfileInput(profile)
  const missingBase = []
  if (!normalized.nip) missingBase.push('nip')
  if (!normalized.legalName) missingBase.push('legalName')
  if (!normalized.registeredAddress) missingBase.push('registeredAddress')
  if (!normalized.ownerFullName) missingBase.push('ownerFullName')

  const missingBilling = []
  if (!normalized.billingName) missingBilling.push('billingName')
  if (!normalized.billingNip) missingBilling.push('billingNip')
  if (!normalized.billingAddress) missingBilling.push('billingAddress')
  if (!normalized.billingPostalCode) missingBilling.push('billingPostalCode')
  if (!normalized.billingCity) missingBilling.push('billingCity')
  if (!normalized.billingEmail) missingBilling.push('billingEmail')

  const paid = ['GO_PLUS', 'PLUS', 'PRO'].includes(normalizePlanCode(planCode))
  return {
    baseComplete: missingBase.length === 0,
    billingComplete: missingBilling.length === 0,
    completeForPlan: missingBase.length === 0 && (!paid || missingBilling.length === 0),
    missingBase,
    missingBilling,
  }
}

function profileFromRow(row = {}) {
  return {
    orgId: text(row.org_id, 64),
    nip: text(row.nip, 10),
    regon: text(row.regon, 14),
    legalName: text(row.legal_name, 300),
    registeredAddress: text(row.registered_address),
    street: text(row.street, 180),
    buildingNumber: text(row.building_number, 40),
    unitNumber: text(row.unit_number, 40),
    postalCode: text(row.postal_code, 12),
    city: text(row.city, 120),
    countryCode: text(row.country_code, 2) || 'PL',
    ownerFullName: text(row.owner_full_name, 200),
    billingName: text(row.billing_name, 300),
    billingNip: text(row.billing_nip, 10),
    billingAddress: text(row.billing_address),
    billingPostalCode: text(row.billing_postal_code, 12),
    billingCity: text(row.billing_city, 120),
    billingCountryCode: text(row.billing_country_code, 2) || 'PL',
    billingEmail: text(row.billing_email, 160),
    registryProvider: text(row.registry_provider, 40),
    registryFetchedAt: row.registry_fetched_at || null,
    version: Number(row.version || 0),
    updatedAt: row.updated_at || null,
  }
}

async function assertOnboardingSchemaReady(client) {
  const result = await client.query(
    `select to_regclass('public.organization_company_profile') is not null as canonical_profile_ready,
            to_regclass('public.organization_profile') is not null as profile_ready,
            to_regclass('public.billing_provider_event') is not null as billing_event_ready`,
  )
  if (!result.rows[0]?.canonical_profile_ready && !result.rows[0]?.profile_ready) {
    throw publicError(503, 'ONBOARDING_SCHEMA_NOT_READY', 'Schemat profilu firmy nie jest jeszcze gotowy.')
  }
  return result.rows[0]
}

/**
 * Legacy entry point kept for callers during rollout. New organizations are
 * created only by Registration API after a verified registration attempt.
 * @param {import('pg').PoolClient} client
 * @param {{uid:string,email:string,organizationName:string,ownerFullName:string,now?:Date}} input
 */
async function createOrganizationWithTrial(client, { uid, email, organizationName, ownerFullName, now = new Date() }) {
  void client
  void uid
  void email
  void organizationName
  void ownerFullName
  void now
  throw publicError(
    409,
    'REGISTRATION_REQUIRED',
    'Nowa organizacja musi zostać utworzona z ważnej próby rejestracji Cleanzi.',
  )

  /* c8 ignore start -- legacy implementation retained temporarily for rollback compatibility */
  const ownerUid = text(uid, 128)
  const ownerEmail = normalizeEmail(email)
  const name = text(organizationName, 120)
  const ownerName = text(ownerFullName, 200)
  if (!ownerUid || !ownerEmail) throw publicError(401, 'UNAUTHENTICATED', 'Brak zweryfikowanego konta Firebase.')
  if (name.length < 2) throw publicError(400, 'ORGANIZATION_NAME_REQUIRED', 'Podaj nazwę firmy.')
  if (ownerName.length < 3) throw publicError(400, 'OWNER_NAME_REQUIRED', 'Podaj imię i nazwisko właściciela.')

  await assertOnboardingSchemaReady(client)
  const orgId = `org_${crypto.randomUUID()}`
  const workerId = buildWorkerId(orgId, 1)
  const login = buildWorkerLogin(orgId, 1)
  const startedAt = now instanceof Date ? now : new Date(now)
  const trialEndsAt = new Date(startedAt.getTime() + TRIAL_DAYS * 86400000)

  await client.query('begin')
  try {
    await client.query(
      `insert into public.organizations (
         org_id, name, status, onboarding_status, owner_uid, owner_worker_id, created_at, updated_at
       ) values ($1::text, $2::text, 'ACTIVE', 'IN_PROGRESS', $3::text, $4::text, $5::timestamptz, $5::timestamptz)`,
      [orgId, name, ownerUid, workerId, startedAt],
    )
    await client.query(
      `insert into public.organization_profile (
         org_id, owner_full_name, country_code, billing_country_code, version,
         created_at, updated_at, updated_by_uid
       ) values ($1::text, $2::text, 'PL', 'PL', 0, $3::timestamptz, $3::timestamptz, $4::text)`,
      [orgId, ownerName, startedAt, ownerUid],
    )
    await client.query(
      `insert into public.worker (
         org_id, login, worker_id, full_name, login_email, auth_uid, role,
         active, status, email, worker_type, created_at, updated_at
       ) values (
         $1::text, $2::text, $3::text, $4::text, $5::text, $6::text, 'OWNER',
         true, 'ACTIVE', $5::text, 'OWNER', $7::timestamptz, $7::timestamptz
       )`,
      [orgId, login, workerId, ownerName, ownerEmail, ownerUid, startedAt],
    )
    await client.query(
      `insert into public.organization_member (org_id, uid, role, worker_id, status, created_at)
       values ($1::text, $2::text, 'OWNER', $3::text, 'ACTIVE', $4::timestamptz)`,
      [orgId, ownerUid, workerId, startedAt],
    )
    await client.query(
      `insert into public.organization_subscription (
         org_id, plan_code, status, trial_started_at, trial_ends_at, activated_at,
         created_at, updated_at, version
       ) values (
         $1::text, 'TRIAL', 'TRIALING', $2::timestamptz, $3::timestamptz, $2::timestamptz,
         $2::timestamptz, $2::timestamptz, 0
       )`,
      [orgId, startedAt, trialEndsAt],
    )
    await client.query('commit')
    return { orgId, organizationName: name, workerId, trialEndsAt: trialEndsAt.toISOString() }
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  }
  /* c8 ignore stop */
}

async function readOrganizationProfile(client, orgId) {
  const readiness = await assertOnboardingSchemaReady(client)
  if (readiness.canonical_profile_ready) {
    const canonical = await client.query(
      `select cp.org_id,
              cp.tax_id_value as nip,
              cp.business_registry_id as regon,
              cp.legal_name,
              cp.address_line_1 as registered_address,
              cp.address_line_1 as street,
              null::text as building_number,
              null::text as unit_number,
              cp.postal_code,
              cp.locality as city,
              cp.country_code,
              coalesce(w.full_name, '') as owner_full_name,
              cp.legal_name as billing_name,
              cp.tax_id_value as billing_nip,
              cp.address_line_1 as billing_address,
              cp.postal_code as billing_postal_code,
              cp.locality as billing_city,
              cp.country_code as billing_country_code,
              cp.billing_email,
              'REGISTRATION'::text as registry_provider,
              null::timestamptz as registry_fetched_at,
              0::integer as version,
              cp.updated_at,
              s.plan_code
         from public.organization_company_profile cp
         join public.organizations o on o.org_id = cp.org_id
         left join public.worker w
           on w.org_id = o.org_id
          and w.worker_id = o.owner_worker_id
         left join public.organization_subscription s on s.org_id = cp.org_id
        where cp.org_id = $1::text
        limit 1`,
      [text(orgId, 64)],
    )
    if (canonical.rows[0]) {
      const profile = profileFromRow(canonical.rows[0])
      return {
        profile,
        completeness: profileCompleteness(profile, canonical.rows[0].plan_code),
        source: 'organization_company_profile',
      }
    }
  }

  if (!readiness.profile_ready) {
    throw publicError(404, 'ORGANIZATION_PROFILE_NOT_FOUND', 'Nie znaleziono profilu firmy.')
  }
  const result = await client.query(
    `select p.*, s.plan_code
       from public.organization_profile p
       left join public.organization_subscription s on s.org_id = p.org_id
      where p.org_id = $1::text
      limit 1`,
    [text(orgId, 64)],
  )
  if (!result.rows[0]) throw publicError(404, 'ORGANIZATION_PROFILE_NOT_FOUND', 'Nie znaleziono profilu firmy.')
  const profile = profileFromRow(result.rows[0])
  return {
    profile,
    completeness: profileCompleteness(profile, result.rows[0].plan_code),
    source: 'organization_profile',
  }
}

async function updateOrganizationProfile(client, { orgId, uid, version, profile: input }) {
  const readiness = await assertOnboardingSchemaReady(client)
  const profile = normalizeProfileInput(input)
  const expectedVersion = Number(version)
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    throw publicError(400, 'PROFILE_VERSION_REQUIRED', 'Odśwież profil firmy i spróbuj ponownie.')
  }

  await client.query('begin')
  try {
    if (readiness.canonical_profile_ready) {
      const canonical = await client.query(
        `select cp.org_id, s.plan_code
           from public.organization_company_profile cp
           left join public.organization_subscription s on s.org_id = cp.org_id
          where cp.org_id = $1::text
          for update of cp`,
        [text(orgId, 64)],
      )
      if (canonical.rows[0]) {
        const completeness = profileCompleteness(profile, canonical.rows[0].plan_code)
        if (!completeness.baseComplete) {
          throw publicError(400, 'COMPANY_PROFILE_INCOMPLETE', 'Uzupełnij NIP, nazwę prawną, adres i dane właściciela.')
        }
        if (!completeness.completeForPlan) {
          throw publicError(400, 'BILLING_PROFILE_INCOMPLETE', 'Uzupełnij dane rozliczeniowe wymagane dla płatnego planu.')
        }
        const addressLine1 = profile.registeredAddress || [
          profile.street,
          profile.buildingNumber,
          profile.unitNumber ? `/${profile.unitNumber}` : '',
        ].filter(Boolean).join(' ')
        await client.query(
          `update public.organization_company_profile
              set legal_name = $2::text,
                  registration_country_code = $3::text,
                  tax_id_type = case when $3::text = 'PL' then 'NIP' else tax_id_type end,
                  tax_id_value = $4::text,
                  tax_id_normalized = $4::text,
                  address_line_1 = $5::text,
                  locality = $6::text,
                  postal_code = $7::text,
                  country_code = $3::text,
                  billing_email = $8::text,
                  updated_at = now()
            where org_id = $1::text`,
          [
            text(orgId, 64), profile.legalName, profile.countryCode, profile.nip,
            addressLine1, profile.city, profile.postalCode, profile.billingEmail,
          ],
        )
        await client.query(
          `update public.worker w
              set full_name = $3::text, updated_at = now()
             from public.organizations o
            where o.org_id = $1::text
              and w.org_id = o.org_id
              and w.worker_id = o.owner_worker_id
              and o.owner_uid = $2::text`,
          [text(orgId, 64), text(uid, 128), profile.ownerFullName],
        )
        await client.query(
          `update public.organizations
              set name = $2::text, onboarding_status = 'COMPLETED', updated_at = now()
            where org_id = $1::text`,
          [text(orgId, 64), profile.legalName],
        )
        await client.query('commit')
        return readOrganizationProfile(client, orgId)
      }
    }

    if (!readiness.profile_ready) {
      throw publicError(404, 'ORGANIZATION_PROFILE_NOT_FOUND', 'Nie znaleziono profilu firmy.')
    }
    const current = await client.query(
      `select p.version, s.plan_code
         from public.organization_profile p
         left join public.organization_subscription s on s.org_id = p.org_id
        where p.org_id = $1::text
        for update of p`,
      [text(orgId, 64)],
    )
    if (!current.rows[0]) throw publicError(404, 'ORGANIZATION_PROFILE_NOT_FOUND', 'Nie znaleziono profilu firmy.')
    if (Number(current.rows[0].version) !== expectedVersion) {
      throw publicError(409, 'STALE_ORGANIZATION_PROFILE', 'Profil firmy został zmieniony. Odśwież dane.')
    }

    const completeness = profileCompleteness(profile, current.rows[0].plan_code)
    const updated = await client.query(
      `update public.organization_profile
          set nip = $2::text, regon = $3::text, legal_name = $4::text,
              registered_address = $5::text, street = $6::text, building_number = $7::text,
              unit_number = $8::text, postal_code = $9::text, city = $10::text,
              country_code = $11::text, owner_full_name = $12::text,
              billing_name = $13::text, billing_nip = $14::text, billing_address = $15::text,
              billing_postal_code = $16::text, billing_city = $17::text,
              billing_country_code = $18::text, billing_email = $19::text,
              registry_provider = $20::text, registry_fetched_at = $21::timestamptz,
              version = version + 1, updated_by_uid = $22::text
        where org_id = $1::text
        returning *`,
      [
        text(orgId, 64), profile.nip, profile.regon, profile.legalName, profile.registeredAddress,
        profile.street, profile.buildingNumber, profile.unitNumber, profile.postalCode, profile.city,
        profile.countryCode, profile.ownerFullName, profile.billingName, profile.billingNip,
        profile.billingAddress, profile.billingPostalCode, profile.billingCity,
        profile.billingCountryCode, profile.billingEmail, profile.registryProvider,
        profile.registryFetchedAt, text(uid, 128),
      ],
    )
    await client.query(
      `update public.organizations
          set name = coalesce(nullif($2::text, ''), name),
              onboarding_status = $3::text
        where org_id = $1::text`,
      [text(orgId, 64), profile.legalName, completeness.baseComplete ? 'COMPLETED' : 'IN_PROGRESS'],
    )
    await client.query('commit')
    return { profile: profileFromRow(updated.rows[0]), completeness }
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  }
}

module.exports = {
  TRIAL_DAYS,
  assertOnboardingSchemaReady,
  createOrganizationWithTrial,
  isValidPolishNip,
  normalizeNip,
  normalizeProfileInput,
  profileCompleteness,
  profileFromRow,
  publicError,
  readOrganizationProfile,
  updateOrganizationProfile,
}
