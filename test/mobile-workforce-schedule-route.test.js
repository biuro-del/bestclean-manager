'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { MOBILE_WORKFORCE_SCHEDULE_PATH } = require('../mobile-workforce-schedule-api')

const root = path.join(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'index.js'), 'utf8')

function asyncFunctionBlock(name, nextName) {
  const start = source.indexOf(`async function ${name}`)
  const end = source.indexOf(`async function ${nextName}`, start + 1)
  assert.ok(start >= 0, `Brak funkcji ${name}`)
  assert.ok(end > start, `Brak końca funkcji ${name}`)
  return source.slice(start, end)
}

test('endpoint APK ma dokładną, odrębną ścieżkę mobilną przed generycznym proxy', () => {
  assert.equal(MOBILE_WORKFORCE_SCHEDULE_PATH, '/api/mobile/workforce-schedule')
  assert.match(source, /require\('\.\/mobile-workforce-schedule-api'\)/)
  assert.match(source, /const mobileWorkforceScheduleApi = createMobileWorkforceScheduleApi\(\{/)

  const route = source.indexOf('if (mobileWorkforceScheduleApi.matches(requestUrl.pathname))')
  const genericProxy = source.indexOf("if (requestUrl.pathname.startsWith('/api/'))", route)
  assert.ok(route >= 0)
  assert.ok(genericProxy > route)

  const routeEnd = source.indexOf('if (workdayReconciliationApi.matches', route)
  const routeBlock = source.slice(route, routeEnd)
  assert.match(routeBlock, /MOBILE_WORKFORCE_SCHEDULE_ERROR/)
  assert.doesNotMatch(routeBlock, /error\?\.message|error\.message/)
})

test('sesja mobilna wyprowadza organizację i pracownika wyłącznie z tokenu', () => {
  const resolver = asyncFunctionBlock('resolveMobileWorkforceScheduleSession', 'readPublishedMobileJobCards')
  assert.match(resolver, /resolveMobileOrganizationFromToken\(client, tokenIdentity, ''\)/)
  assert.match(resolver, /resolveMobileWorker\(client, orgId, \{\}, tokenIdentity, membership\)/)
  assert.doesNotMatch(resolver, /requestUrl|searchParams/)
  assert.match(resolver, /client\?\.release\?\.\(\)/)
})

test('autoryzacja APK jest OWN-only i sprawdza aktywne powiązanie pracownika', () => {
  const portalStart = source.indexOf('async function authorizeWorkforceSchedule')
  const mobileStart = source.indexOf('async function authorizeMobileWorkforceSchedule')
  const capabilityStart = source.indexOf('function assertMembershipPlanCapability', mobileStart)
  assert.ok(portalStart >= 0 && mobileStart > portalStart && capabilityStart > mobileStart)
  const mobileAuthorization = source.slice(mobileStart, capabilityStart)

  assert.match(mobileAuthorization, /getWorkforceScheduleRequesterMembership\(client, orgId, uid\)/)
  assert.match(mobileAuthorization, /assertMembershipPlanCapability\(membership, 'workforceScheduling'\)/)
  assert.match(mobileAuthorization, /WORKFORCE_SCHEDULE_PLATFORM_CONTEXT_FORBIDDEN/)
  assert.match(mobileAuthorization, /WORKFORCE_SCHEDULE_ORGANIZATION_KIND_FORBIDDEN/)
  assert.match(mobileAuthorization, /active_worker_id/)
  assert.match(mobileAuthorization, /resolvedWorkerId/)
  assert.match(mobileAuthorization, /scope: 'OWN'/)
})

test('wiring używa izolowanego połączenia Grafiku i zwykłego tokenu Firebase', () => {
  const start = source.indexOf('const mobileWorkforceScheduleApi = createMobileWorkforceScheduleApi({')
  const end = source.indexOf('const portalZoneApi', start)
  assert.ok(start >= 0 && end > start)
  const wiring = source.slice(start, end)
  assert.match(wiring, /authorize:\s*authorizeMobileWorkforceSchedule/)
  assert.match(wiring, /connectDbClient:\s*connectWorkforceScheduleDbClient/)
  assert.match(wiring, /resolveSession:\s*resolveMobileWorkforceScheduleSession/)
  assert.match(wiring, /isDeliveryEnabled:\s*isWorkforceScheduleDeliveryEnabled/)
  assert.match(wiring, /\bverifyFirebaseIdToken\s*,/)
  assert.doesNotMatch(wiring, /verifyPlatformFirebaseIdToken|verifySessionContextFirebaseIdToken/)
})
