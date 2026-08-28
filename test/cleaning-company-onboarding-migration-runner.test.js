'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.join(__dirname, '..')
const runner = fs.readFileSync(
  path.join(repoRoot, 'scripts', 'migrate-cleaning-company-onboarding.js'),
  'utf8',
)
const packageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
)
const {
  enrollmentStatusConstraintIsExpected,
} = require(path.join(repoRoot, 'scripts', 'migrate-cleaning-company-onboarding'))

test('runner onboardingu domyslnie wykonuje tylko audyt, a zapis wymaga nazwanego tokenu', () => {
  assert.match(runner, /const audit = !apply/)
  assert.match(runner, /process\.argv\.includes\('--apply'\)/)
  assert.match(runner, /MODE_CONFLICT:choose --audit or --apply/)
  assert.match(runner, /CLZ-DB-20260827-CLEANING-COMPANY-RESUME-01/)
  assert.match(runner, /20260827_cleaning_company_existing_google_enrollment_additive\.sql/)
  assert.match(runner, /PRODUCTION_CONFIRMATION_REQUIRED/)
  assert.match(runner, /PROJECT_MISMATCH/)
  assert.match(runner, /DATABASE_MISMATCH/)
  assert.match(runner, /if \(audit\) return/)
  assert.equal(
    packageJson.scripts['migrate:cleaning-company-onboarding'],
    'node scripts/migrate-cleaning-company-onboarding.js',
  )
})

test('audit pokazuje faktyczne wymagania INSERT dla subscription i bramki uruchomieniowe', () => {
  assert.match(runner, /notNullWithoutDefault: requiredColumns\(subscriptionRequirements\)/)
  assert.match(runner, /insertRequirements: Object\.fromEntries/)
  assert.match(runner, /'organization_member'/)
  assert.match(runner, /'worker'/)
  assert.match(runner, /canonicalCurrentPeriodColumn: 'current_period_started_at'/)
  assert.match(runner, /legacyCurrentPeriodColumnPresent/)
  assert.match(runner, /CLEANING_COMPANY_ONBOARDING_ENABLED/)
  assert.match(runner, /CLEANING_COMPANY_ONBOARDING_AUTO_CONFIRMATION_ENABLED/)
  assert.match(runner, /readyForRuntime: onboardingEnabled && autoConfirmationEnabled/)
  assert.match(runner, /organization_company_profile_nip_cleaning_provider_uidx/)
  assert.match(runner, /cleaning_company_onboarding_enrollment_active_uidx/)
  assert.match(runner, /cleaning_company_onboarding_enrollment_active_email_uidx/)
  assert.match(runner, /columns_csv/)
  assert.match(runner, /foreign_table/)
  assert.match(runner, /foreign_columns_csv/)
  assert.match(runner, /normalizedRelationName/)
  assert.match(runner, /STATUS=ACTIVE/)
  assert.match(runner, /cleaning_company_onboarding_enrollment_command_fk/)
  assert.match(runner, /cleaning_company_onboarding_enrollment_pkey/)
  assert.match(runner, /cleaning_company_onboarding_enrollment_lifecycle_check/)
  assert.match(runner, /constraintsReady/)
  assert.match(runner, /hasNonNullableColumns/)
  assert.match(runner, /cleaning_company_onboarding_enrollment/)
  assert.match(runner, /CLEANING_COMPANY_ONBOARDING_SCHEMA_NOT_READY/)
})

test('postflight akceptuje kanoniczny zapis PostgreSQL dla statusu enrollmentu', () => {
  assert.equal(
    enrollmentStatusConstraintIsExpected({
      definition: "CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'CONSUMED'::character varying, 'EXPIRED'::character varying])::text[])))",
    }),
    true,
  )
  assert.equal(
    enrollmentStatusConstraintIsExpected({
      definition: "CHECK ((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'CONSUMED'::character varying])::text[])))",
    }),
    false,
  )
})
