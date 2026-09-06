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

test('serwer aktywuje Grafik wyłącznie przy bezpiecznym zestawie czterech flag', () => {
  const block = functionBlock('isWorkforceScheduleEnabled', 'normalizeApiProxyTarget')
  assert.match(block, /WORKFORCE_SCHEDULE_ENABLED/)
  assert.match(block, /!isTrue\(process\.env\.WORKFORCE_SCHEDULE_DELIVERY_ENABLED\)/)
  assert.match(block, /!isTrue\(process\.env\.WORKFORCE_SCHEDULE_NOTIFICATIONS_ENABLED\)/)
  assert.match(block, /!isTrue\(process\.env\.WORKFORCE_SCHEDULE_DOWNSTREAM_ENABLED\)/)
  assert.match(serverSource, /workforceScheduling:\s*false/)
})

test('endpoint Grafiku jest lokalnym API z osobną autoryzacją i nie wpada do ogólnego proxy', () => {
  const apiStart = serverSource.indexOf('const workforceScheduleApi = createWorkforceScheduleApi({')
  const apiEnd = serverSource.indexOf('const portalZoneApi', apiStart)
  assert.ok(apiStart >= 0 && apiEnd > apiStart)
  const apiWiring = serverSource.slice(apiStart, apiEnd)
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
  assert.match(authorization, /WORKFORCE_SCHEDULE_PLATFORM_CONTEXT_FORBIDDEN/)
  assert.match(authorization, /assertMembershipPlanCapability\(membership, 'workforceScheduling'\)/)
  assert.match(authorization, /from public\.worker/)
  assert.match(authorization, /active is true/)
  assert.match(authorization, /upper\(btrim\(status\)\) = 'ACTIVE'/)
  assert.match(authorization, /normalizedAction === 'CONFIGURE'/)
  assert.match(authorization, /\['EDIT', 'PUBLISH'\]/)
})
