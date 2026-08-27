const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const sqlDir = path.join(__dirname, '..', 'registration-functions', 'sql')
const base = fs.readFileSync(path.join(sqlDir, '20260826_facility_manager_google_registration_base_preflight.sql'), 'utf8')
const post = fs.readFileSync(path.join(sqlDir, '20260826_facility_manager_google_registration_preflight.sql'), 'utf8')

test('base preflight is read-only and checks the physical schema before registry migration', () => {
  assert.match(base, /BEGIN TRANSACTION READ ONLY;/)
  assert.match(base, /ROLLBACK;/)
  assert.match(base, /FACILITY_MANAGER_BASE_PREFLIGHT_TABLE_MISSING/)
  assert.match(base, /worker_id_normalized/)
  assert.match(base, /worker_identity_normalized_biu/)
  assert.doesNotMatch(base, /\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bCREATE TABLE\b/i)
})

test('post-migration preflight requires the Google registry and all uniqueness guards', () => {
  assert.match(post, /BEGIN TRANSACTION READ ONLY;/)
  assert.match(post, /ROLLBACK;/)
  assert.match(post, /facility_manager_google_identity/)
  assert.match(post, /GOOGLE_IDENTITY_KEY_UNIQUE_MISSING/)
  assert.match(post, /GOOGLE_IDENTITY_ORG_UNIQUE_MISSING/)
  assert.match(post, /GOOGLE_IDENTITY_OPERATION_UNIQUE_MISSING/)
  assert.match(post, /GOOGLE_IDENTITY_AUDIT_UNIQUE_MISSING/)
  assert.match(post, /has_table_privilege\('portal_app', 'public\.facility_manager_google_identity', 'SELECT'\)/)
  assert.match(post, /has_table_privilege\('portal_app', 'public\.facility_manager_google_identity', 'INSERT'\)/)
  assert.match(post, /has_table_privilege\('portal_app', 'public\.facility_manager_google_identity', 'UPDATE'\)/)
  assert.match(post, /PORTAL_APP_REGISTRY_PRIVILEGE_MISSING/)
})

test('new manager modules are isolated from the legacy central V1 registration contract', () => {
  const moduleDir = path.join(__dirname, '..', 'registration-functions', 'src')
  for (const file of [
    'facility-manager-registration-core.js',
    'facility-manager-google-registration-contract.js',
    'facility-manager-firestore-abuse-guard.js',
    'postgres-facility-manager-provisioner.js',
  ]) {
    const source = fs.readFileSync(path.join(moduleDir, file), 'utf8')
    assert.doesNotMatch(source, /from "\.\/registration-contract\.js"/)
  }
})
