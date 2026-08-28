'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const migrationPath = path.join(
  __dirname,
  '..',
  'dataconnect',
  'migrations',
  '20260822_cleaning_company_onboarding_v2_additive.sql',
)
const existingGoogleEnrollmentMigrationPath = path.join(
  __dirname,
  '..',
  'dataconnect',
  'migrations',
  '20260827_cleaning_company_existing_google_enrollment_additive.sql',
)

test('migracja onboardingu firmy jest addytywna i nie laczy automatycznie po NIP', () => {
  const source = fs.readFileSync(migrationPath, 'utf8')

  assert.match(source, /add column if not exists organization_kind varchar\(40\)/i)
  assert.match(source, /create table if not exists public\.organization_company_profile/i)
  assert.match(source, /tax_id_normalized varchar\(64\)/i)
  assert.match(source, /declared_employee_count integer/i)
  assert.match(source, /organization_company_profile_nip_cleaning_provider_uidx/i)
  assert.match(source, /create unique index if not exists organization_company_profile_nip_cleaning_provider_uidx/i)
  assert.match(source, /NIP_ALREADY_REGISTERED/i)
  assert.match(source, /automatic membership creation/i)
  assert.match(source, /tax_id_normalized ~ '\^\[0-9\]\{10\}\$'/i)
  assert.doesNotMatch(source, /\bdrop table\b/i)
  assert.doesNotMatch(source, /\btruncate\b/i)
  assert.doesNotMatch(source, /\bupdate\s+public\.organization_company_profile\b/i)
})

test('migracja prowadzi osobny immutable ledger, audit zgod i odkupienie triala', () => {
  const source = fs.readFileSync(migrationPath, 'utf8')

  assert.match(source, /create table if not exists public\.cleaning_company_onboarding_command/i)
  assert.match(source, /command_id uuid not null/i)
  assert.match(source, /payload_hash char\(64\) not null/i)
  assert.match(source, /create table if not exists public\.cleaning_company_onboarding_consent_audit/i)
  assert.match(source, /create table if not exists public\.cleaning_company_trial_redemption/i)
  assert.match(source, /cleaning_company_trial_redemption_uid_unique/i)
  assert.match(source, /cleaning_company_trial_redemption_email_uidx/i)
  assert.match(source, /before update or delete on public\.cleaning_company_onboarding_command/i)
  assert.match(source, /before update or delete on public\.cleaning_company_onboarding_consent_audit/i)
  assert.match(source, /before update or delete on public\.cleaning_company_trial_redemption/i)
  assert.match(source, /CLEANING_COMPANY_ONBOARDING_IMMUTABLE/i)
  assert.doesNotMatch(source, /before update or delete on public\.user_consent/i)
})

test('migracja zachowuje generic user_consent i jawnie audytuje wymagania subskrypcji', () => {
  const source = fs.readFileSync(migrationPath, 'utf8')

  assert.match(source, /create table if not exists public\.user_consent/i)
  assert.match(source, /onboarding_command_id uuid/i)
  assert.match(source, /user_consent_onboarding_command_type_uidx/i)
  assert.match(source, /add column if not exists billing_owner_uid varchar\(128\)/i)
  assert.match(source, /add column if not exists billing_owner_worker_id varchar\(64\)/i)
  assert.match(source, /add column if not exists currency_code varchar\(3\)/i)
  assert.match(source, /current_period_started_at timestamptz/i)
  assert.match(source, /create table if not exists public\.subscription_event/i)
  assert.match(source, /subscription_event_org_occurred_idx/i)
  assert.match(source, /set local lock_timeout = '5s'/i)
  assert.match(source, /set local statement_timeout = '60s'/i)
  assert.match(source, /pg_advisory_xact_lock/i)
})

test('migracja wznowienia rejestracji Google jest addytywna, krótkożyjąca i nie daje dostępu do istniejącej firmy', () => {
  const source = fs.readFileSync(existingGoogleEnrollmentMigrationPath, 'utf8')

  assert.match(source, /create table if not exists public\.cleaning_company_onboarding_enrollment/i)
  assert.match(source, /provider_id varchar\(40\) not null/i)
  assert.match(source, /check \(provider_id = 'google\.com'\)/i)
  assert.match(source, /status in \('ACTIVE', 'CONSUMED', 'EXPIRED'\)/i)
  assert.match(source, /onboarding_command_id uuid/i)
  assert.match(source, /foreign key \(onboarding_command_id\)[\s\S]*references public\.cleaning_company_onboarding_command\(command_id\)/i)
  assert.match(source, /cleaning_company_onboarding_enrollment_active_uidx/i)
  assert.match(source, /cleaning_company_onboarding_enrollment_active_email_uidx/i)
  assert.match(source, /where status = 'ACTIVE'/i)
  assert.match(source, /alter column actor_uid set not null/i)
  assert.match(source, /validate constraint %I/i)
  assert.match(source, /and not convalidated/i)
  assert.match(source, /created only after an authenticated, verified Google user/i)
  assert.match(source, /never creates a company, owner/i)
  assert.match(source, /access to an existing organization/i)
  assert.doesNotMatch(source, /\bdrop table\b/i)
  assert.doesNotMatch(source, /\btruncate\b/i)
  assert.doesNotMatch(source, /\bdelete\s+from\b/i)
})
