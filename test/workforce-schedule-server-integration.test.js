const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')
const serverSource = fs.readFileSync(path.join(root, 'index.js'), 'utf8')

function functionBlock(name, nextName) {
  const start = serverSource.indexOf(`function ${name}`)
  assert.ok(start >= 0, `Brak funkcji ${name}`)
  const end = nextName ? serverSource.indexOf(`function ${nextName}`, start + 1) : -1
  assert.ok(end > start, `Brak końca funkcji ${name}`)
  return serverSource.slice(start, end)
}

test('serwer aktywuje Grafik przez wspólną fail-closed politykę rollout', () => {
  const runtimeBlock = functionBlock('isWorkforceScheduleEnabled', 'isWorkforceScheduleOrganizationEnabled')
  const organizationBlock = functionBlock('isWorkforceScheduleOrganizationEnabled', 'normalizeApiProxyTarget')
  assert.match(serverSource, /require\('\.\/workforce-schedule-rollout-policy'\)/)
  assert.match(runtimeBlock, /resolveWorkforceScheduleRollout\(process\.env\)\.enabled/)
  assert.match(organizationBlock, /isWorkforceScheduleOrganizationAllowed/)
  assert.match(organizationBlock, /resolveWorkforceScheduleRollout\(process\.env\)/)
  assert.match(serverSource, /workforceScheduling:\s*false/)
})

test('endpoint Grafiku jest lokalnym API z osobną autoryzacją i nie wpada do ogólnego proxy', () => {
  const apiStart = serverSource.indexOf('const workforceScheduleApi = createWorkforceScheduleApi({')
  const apiEnd = serverSource.indexOf('const portalZoneApi', apiStart)
  assert.ok(apiStart >= 0 && apiEnd > apiStart)
  const apiWiring = serverSource.slice(apiStart, apiEnd)
  assert.match(apiWiring, /assertOrganizationEnabled\(orgId\)/)
  assert.match(apiWiring, /isWorkforceScheduleOrganizationEnabled\(orgId\)/)
  assert.match(apiWiring, /authorize:\s*authorizeWorkforceSchedule/)
  assert.match(apiWiring, /\bverifyFirebaseIdToken\s*,/)
  assert.doesNotMatch(apiWiring, /verifySessionContextFirebaseIdToken|verifyPlatformFirebaseIdToken/)
  const route = serverSource.indexOf('if (workforceScheduleApi.matches(requestUrl.pathname))')
  const proxy = serverSource.indexOf("if (requestUrl.pathname.startsWith('/api/'))")
  assert.ok(route >= 0 && proxy > route)

  const authorization = serverSource.slice(
    serverSource.indexOf('async function authorizeWorkforceSchedule'),
    serverSource.indexOf('function assertMembershipPlanCapability'),
  )
  const membership = serverSource.slice(
    serverSource.indexOf('async function getWorkforceScheduleRequesterMembership'),
    serverSource.indexOf('async function authorizeWorkforceSchedule'),
  )
  assert.match(authorization, /WORKFORCE_SCHEDULE_PLATFORM_CONTEXT_FORBIDDEN/)
  assert.match(authorization, /isWorkforceScheduleOrganizationEnabled\(orgId\)/)
  assert.match(authorization, /assertMembershipPlanCapability\(membership, 'workforceScheduling'\)/)
  assert.match(authorization, /getWorkforceScheduleRequesterMembership\(client, orgId, uid\)/)
  assert.doesNotMatch(authorization, /getRequesterMembership\(client/)
  assert.match(authorization, /WORKFORCE_SCHEDULE_ORGANIZATION_KIND_FORBIDDEN/)
  assert.match(
    authorization,
    /!isWorkforceScheduleOrganizationKindAllowed\(membership\?\.organization_kind\)/,
  )
  assert.match(membership, /from public\.workforce_schedule_authorize_session\(\$1::text, \$2::text\)/)
  assert.doesNotMatch(
    membership,
    /from public\.organization_member|join public\.(?:organizations|organization_subscription|worker)/,
  )
  assert.doesNotMatch(membership, /platformRepository|facility_manager/)
  assert.match(authorization, /normalizedAction === 'CONFIGURE'/)
  assert.match(authorization, /\['EDIT', 'PUBLISH'\]/)

  const sessionContext = serverSource.slice(
    serverSource.indexOf('async function buildOrganizationSessionContext'),
    serverSource.indexOf('function numericCount'),
  )
  assert.match(
    sessionContext,
    /workforceScheduling:[\s\S]*isWorkforceScheduleOrganizationEnabled\(row\?\.org_id\)/,
  )
})

test('Grafik dopuszcza tylko kanoniczny typ CLEANING_PROVIDER i odmawia brak lub stary typ organizacji', () => {
  const source = functionBlock(
    'isWorkforceScheduleOrganizationKindAllowed',
    'getWorkforceScheduleRequesterMembership',
  ).replace(/\s*async\s*$/, '')
  const loadGuard = new Function(
    'normalizeText',
    `${source}\nreturn isWorkforceScheduleOrganizationKindAllowed`,
  )
  const guard = loadGuard((value) => String(value ?? '').trim())

  assert.equal(guard('CLEANING_PROVIDER'), true)
  assert.equal(guard(null), false)
  assert.equal(guard(''), false)
  assert.equal(guard('   '), false)
  assert.equal(guard('CLEANING_COMPANY'), false)
  assert.equal(guard('FACILITY_MANAGER'), false)
})

test('zewnetrzny fallback Grafiku nie ujawnia surowego bledu', () => {
  const routeStart = serverSource.indexOf('if (workforceScheduleApi.matches(requestUrl.pathname))')
  const routeEnd = serverSource.indexOf('if (workdayReconciliationApi.matches(requestUrl.pathname))', routeStart)
  assert.ok(routeStart >= 0 && routeEnd > routeStart)
  const route = serverSource.slice(routeStart, routeEnd)
  assert.match(route, /'WORKFORCE_SCHEDULE_ERROR'/)
  assert.doesNotMatch(route, /error\?\.message|error\.message/)
})
