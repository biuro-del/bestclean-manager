const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { pathToFileURL } = require('node:url')

test('manager object API is handled before the generic API proxy', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')
  const route = source.indexOf("requestUrl.pathname === FACILITY_MANAGER_OBJECTS_PATH")
  const proxy = source.indexOf("requestUrl.pathname.startsWith('/api/')")
  assert.ok(route >= 0)
  assert.ok(proxy >= 0)
  assert.ok(route < proxy)
  assert.match(source, /const FACILITY_MANAGER_OBJECTS_PATH = '\/api\/facility-manager\/objects'/)
})

test('manager session contract sends the organization kind to the browser', () => {
  const root = path.join(__dirname, '..')
  const policy = fs.readFileSync(path.join(root, 'auth-session-policy.js'), 'utf8')
  const client = fs.readFileSync(path.join(root, 'web-app', 'apps', 'portal-web', 'src', 'auth', 'authService.js'), 'utf8')
  assert.match(policy, /organizationKind: toStatus\(row\.organization_kind\)/)
  assert.match(client, /organizationKind: toText\(context\.organizationKind\)\.toUpperCase\(\)/)
})

test('legacy organization sessions remain valid when organization kind is not populated yet', () => {
  const client = fs.readFileSync(path.join(__dirname, '..', 'web-app', 'apps', 'portal-web', 'src', 'auth', 'authService.js'), 'utf8')
  assert.doesNotMatch(client, /!platformActor && !toText\(context\.organizationKind\)/)
  assert.match(client, /organization\.orgId && organization\.organizationName && organization\.role/)
  assert.doesNotMatch(client, /organization\.orgId && organization\.organizationName && organization\.organizationKind && organization\.role/)
})

test('manager route is isolated from cleaning-company portal routes', () => {
  const root = path.join(__dirname, '..')
  const router = fs.readFileSync(path.join(root, 'web-app', 'apps', 'portal-web', 'src', 'ui', 'router.js'), 'utf8')
  const portal = fs.readFileSync(path.join(root, 'web-app', 'apps', 'portal-web', 'src', 'ui', 'portalApp.js'), 'utf8')
  assert.match(router, /managerObjects: 'view-managerObjects'/)
  assert.match(portal, /isFacilityManagerSession\(\) && normalizedRoute !== 'managerObjects'/)
  assert.match(portal, /await router\.go\('managerObjects'\)/)
})

test('manager object create retries keep their idempotency key until a confirmed response', () => {
  const feature = fs.readFileSync(path.join(__dirname, '..', 'web-app', 'apps', 'portal-web', 'src', 'features', 'facility-manager-objects', 'index.js'), 'utf8')
  assert.match(feature, /const pendingCreateActions = new Map\(\)/)
  assert.match(feature, /const actionKey = createActionPayloadKey\(payload\)/)
  assert.match(feature, /pendingCreateActions\.get\(actionKey\)/)
  assert.match(feature, /pendingCreateActions\.delete\(action\.actionKey\)/)
  assert.doesNotMatch(feature, /clientActionId:\s*createClientActionId\(\)/)
})

test('manager object requests are invalidated across a session change', async () => {
  const root = path.join(__dirname, '..')
  const guardUrl = pathToFileURL(path.join(
    root,
    'web-app',
    'apps',
    'portal-web',
    'src',
    'features',
    'facility-manager-objects',
    'sessionGuard.js',
  )).href
  const { createSessionEpochGuard } = await import(guardUrl)
  let activeSession = JSON.stringify(['user-a', 'org-a', 'FACILITY_MANAGER'])
  const guard = createSessionEpochGuard(() => activeSession)

  const requestFromUserA = guard.capture()
  activeSession = JSON.stringify(['user-b', 'org-b', 'FACILITY_MANAGER'])
  assert.equal(guard.isCurrent(requestFromUserA), false)

  const firstRequestFromUserB = guard.startRequest()
  const newerRequestFromUserB = guard.startRequest()
  assert.equal(guard.isCurrentRequest(firstRequestFromUserB), false)
  assert.equal(guard.isCurrentRequest(newerRequestFromUserB), true)

  const requestFromUserB = guard.capture()
  guard.invalidate()
  assert.equal(guard.isCurrent(requestFromUserB), false)
})

test('portal reset clears manager-object state before a later session can render', () => {
  const portal = fs.readFileSync(path.join(__dirname, '..', 'web-app', 'apps', 'portal-web', 'src', 'ui', 'portalApp.js'), 'utf8')
  const feature = fs.readFileSync(path.join(__dirname, '..', 'web-app', 'apps', 'portal-web', 'src', 'features', 'facility-manager-objects', 'index.js'), 'utf8')
  assert.match(portal, /facilityManagerObjectsFeature\?\.resetSession\?\.\(\)/)
  assert.match(feature, /sessionGuard\.invalidate\(\)/)
  assert.match(feature, /sessionGuard\.startRequest\(\)/)
  assert.match(feature, /sessionGuard\.isCurrentRequest\(requestToken\)/)
  assert.match(feature, /if \(!isCurrentManagerSession\(requestToken\)\) return/)
  assert.match(feature, /pendingCreateActions\.clear\(\)/)
  assert.match(feature, /facilityManagerObjectForm'\)\?\.reset\(\)/)
})
