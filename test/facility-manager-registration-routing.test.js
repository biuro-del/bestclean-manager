const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

test('manager registration route is handled before the generic API proxy', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')
  const route = source.indexOf("requestUrl.pathname === FACILITY_MANAGER_REGISTRATION_PATH")
  const proxy = source.indexOf("requestUrl.pathname.startsWith('/api/')")
  assert.ok(route >= 0)
  assert.ok(proxy >= 0)
  assert.ok(route < proxy)
  assert.match(source, /const FACILITY_MANAGER_REGISTRATION_PATH = '\/api\/registration\/facility-manager'/)
})

test('session membership query forwards organization kind to the entitlement policy', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')
  assert.match(source, /o\.name as organization_name,\s*o\.organization_kind,\s*o\.status as organization_status/)
})

test('manager rate limiting targets the explicitly configured named Firestore database', () => {
  const root = path.join(__dirname, '..')
  const source = fs.readFileSync(path.join(root, 'index.js'), 'utf8')
  const appHosting = fs.readFileSync(path.join(root, 'apphosting.yaml'), 'utf8')

  assert.match(source, /getFirestore: getAdminFirestore/)
  assert.match(source, /PORTAL_FIRESTORE_DATABASE_ID/)
  assert.match(source, /PORTAL_PRODUCTION_FIRESTORE_DATABASE_ID = 'cleanzi-portal-eu'/)
  assert.match(source, /getAdminFirestore\(ensureFirebaseAdmin\(\)\.app\(\), databaseId\)/)
  assert.match(appHosting, /variable: PORTAL_FIRESTORE_DATABASE_ID\s+value: cleanzi-portal-eu/)
})
