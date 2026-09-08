'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const retiredDemoUrl =
  'https://cleanzi-portal-klienta-test--grafik-demo-20260905-ffwbnzuu.web.app/'

const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')

function routeBlock(source, functionName, routeName) {
  const functionStart = source.indexOf(functionName)
  assert.ok(functionStart >= 0, `Nie znaleziono funkcji ${functionName}`)
  const marker = `if (normalizedRoute === '${routeName}') {`
  const blockStart = source.indexOf(marker, functionStart)
  assert.ok(blockStart >= 0, `Nie znaleziono bloku trasy ${routeName}`)
  const nextBlock = source.indexOf('\n  if (', blockStart + marker.length)
  assert.ok(nextBlock > blockStart, `Nie znaleziono końca bloku trasy ${routeName}`)
  return source.slice(blockStart, nextBlock)
}

test('Grafik jest wewnętrzną trasą bezpośrednio pod Pulpitem', () => {
  const layout = read('web-app', 'apps', 'portal-web', 'src', 'ui', 'layoutTemplate.js')
  const router = read('web-app', 'apps', 'portal-web', 'src', 'ui', 'router.js')

  const menuStart = layout.indexOf('<div class="menu">')
  const menuEnd = layout.indexOf('<div class="menu-group-title">OPERACJE</div>', menuStart)
  const menu = layout.slice(menuStart, menuEnd)
  const dashboard = menu.indexOf('data-route="dashboard"')
  const dashboardEnd = menu.indexOf('</button>', dashboard) + '</button>'.length
  const grafik = menu.indexOf('data-route="workforceSchedule"')
  const grafikStart = menu.lastIndexOf('<button', grafik)
  const grafikEnd = menu.indexOf('</button>', grafik) + '</button>'.length
  const events = menu.indexOf('data-route="events"')
  const eventsStart = menu.lastIndexOf('<button', events)

  assert.ok(dashboard >= 0 && grafik > dashboard && events > grafik)
  assert.equal(menu.slice(dashboardEnd, grafikStart).trim(), '')
  assert.equal(menu.slice(grafikEnd, eventsStart).trim(), '')
  assert.match(menu.slice(grafikStart, grafikEnd), /<span class="mi-label">Grafik<\/span>/)
  assert.match(menu.slice(grafikStart, grafikEnd), /\shidden(?:\s|>)/)
  assert.doesNotMatch(menu.slice(grafikStart, grafikEnd), /href=|target=|Grafik \(demo\)/)
  assert.doesNotMatch(layout, new RegExp(retiredDemoUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(router, /workforceSchedule:\s*'view-workforceSchedule'/)
})

test('portal ładuje Grafik jako samodzielny feature zabezpieczony dwoma flagami', () => {
  const portal = read('web-app', 'apps', 'portal-web', 'src', 'ui', 'portalApp.js')
  const styles = read('web-app', 'apps', 'portal-web', 'src', 'index.css')

  assert.match(portal, /workforceSchedule:\s*\['workforceSchedule'\]/)
  assert.match(portal, /workforceSchedule:\s*'workforceScheduling'/)
  assert.match(portal, /workforceSchedule:\s*'workforceSchedule'/)
  assert.match(portal, /label:\s*'Grafik'.*route:\s*'workforceSchedule'/)
  assert.match(portal, /VITE_WORKFORCE_SCHEDULE_MODE[\s\S]{0,160}===\s*'live'/)
  assert.match(portal, /normalizedRoute === 'workforceSchedule' && !workforceScheduleClientEnabled\(\)/)
  assert.match(portal, /clientEnabled = route !== 'workforceSchedule' \|\| workforceScheduleClientEnabled\(\)/)
  assert.match(portal, /node\.hidden = !allowed/)
  assert.match(
    styles,
    /#portalRoot :where\(\.menu-item, \.menu-section, \.submenu-item\)\[hidden\]\s*\{\s*display:\s*none\s*!important;/,
  )
  assert.match(portal, /import\('\.\.\/features\/workforce-schedule\/index\.js'\)/)
  assert.match(portal, /module\.createWorkforceScheduleFeature\(createWorkforceScheduleFeatureContext\(\)\)/)
  assert.match(portal, /bindWorkforceScheduleViewFunctions\(\)/)
  assert.match(portal, /workforceScheduleFeature\?\.resetSession\?\.\(\)/)
  assert.match(portal, /workforceScheduleFeature\.deactivate\?\.\(\)/)
  assert.match(portal, /workforceScheduleFeature\?\.cleanup\?\.\(\)/)

  const featureList = portal.match(/workforceSchedule:\s*\[([^\]]*)\]/)?.[1] || ''
  assert.equal(featureList.trim(), "'workforceSchedule'")

  const syncBlock = routeBlock(portal, 'async function syncRouteDataNow', 'workforceSchedule')
  assert.match(syncBlock, /refreshWorkforceSchedule\(\{ forceRefresh: force \}\)/)
  assert.doesNotMatch(syncBlock, /calendar|orders|scheduleOrders/i)

  const routeRunnerStart = portal.indexOf('const runPortalRouteAfterReady = async')
  const scheduleBlockStart = portal.indexOf("if (routeName === 'workforceSchedule') {", routeRunnerStart)
  const scheduleBlockEnd = portal.indexOf('\n    if (', scheduleBlockStart + 1)
  const scheduleBlock = portal.slice(scheduleBlockStart, scheduleBlockEnd)
  assert.match(scheduleBlock, /syncRouteData\(routeName\)/)
  assert.doesNotMatch(scheduleBlock, /calendar|orders|scheduleOrders/i)

  const navigationStart = portal.indexOf('const navigatePortalRoute = async')
  const routerGo = portal.indexOf('router.go(route)', navigationStart)
  const routeGuard = portal.indexOf("if (nextRoute === 'workforceSchedule' && !portalRouteExists(nextRoute))", navigationStart)
  assert.ok(routeGuard > navigationStart && routeGuard < routerGo)
})

test('Grafik otrzymuje minimalny kontekst bez funkcji Zleceń i Kalendarza', () => {
  const portal = read('web-app', 'apps', 'portal-web', 'src', 'ui', 'portalApp.js')
  const start = portal.indexOf('function createWorkforceScheduleFeatureContext')
  const end = portal.indexOf('\nfunction bindWorkforceScheduleViewFunctions', start)
  const factory = portal.slice(start, end)

  assert.ok(start >= 0 && end > start)
  assert.match(factory, /appState:/)
  assert.match(factory, /confirm:/)
  assert.match(factory, /showTransientNotice:/)
  assert.match(factory, /workforceScheduleService/)
  assert.doesNotMatch(factory, /calendar|orders|scheduleTaskDataConnect/i)
  assert.doesNotMatch(portal, /module\.createWorkforceScheduleFeature\(portalFeatureContext\)/)
})
