'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const dashboard = fs.readFileSync(
  path.join(__dirname, '../web-app/apps/portal-web/src/features/dashboard/index.js'),
  'utf8',
)
const layout = fs.readFileSync(
  path.join(__dirname, '../web-app/apps/portal-web/src/ui/layoutTemplate.js'),
  'utf8',
)
const styles = fs.readFileSync(
  path.join(__dirname, '../web-app/apps/portal-web/src/ui/styles/commandCenter.css'),
  'utf8',
)

test('operacje na zywo renderuja caly strumien zamiast trzech pozycji', () => {
  const renderStart = dashboard.indexOf('function dashboardRenderServiceOperationStream')
  const renderEnd = dashboard.indexOf('function dashboardRenderServiceProgress', renderStart)
  const renderBlock = dashboard.slice(renderStart, renderEnd)

  assert.ok(renderStart >= 0)
  assert.ok(renderEnd > renderStart)
  assert.match(renderBlock, /const previewItems = stream\b/)
  assert.match(renderBlock, /allButton\.hidden = stream\.length === 0/)
  assert.doesNotMatch(dashboard, /DASHBOARD_SERVICE_OPERATIONS_PREVIEW_LIMIT/)
})

test('listy operacji i aktualnosci przewijaja nadmiar, a scroll moze przejsc na strone', () => {
  assert.match(
    layout,
    /class="dash-command-live__header"[\s\S]*?class="dash-command-live__footer"[\s\S]*?class="dash-command-live__body"/,
  )
  assert.match(
    styles,
    /\.dash-command-live__actions \{\s*display: flex;\s*flex: 0 0 auto;/,
  )
  assert.match(
    styles,
    /\.dash-command-live__body,\s*#portalRoot #view-dashboard \.dash-command-live__body > \.dash-insights-panel-body \{\s*min-height: 0 !important;\s*height: calc\(100% - 58px\);/,
  )
  assert.match(
    styles,
    /\.dash-command-live \.dash-operational-list \{\s*display: grid !important;[\s\S]*?overflow-y: auto;\s*overscroll-behavior-y: auto;/,
  )
  assert.match(
    styles,
    /\.dash-activity-feed \{[\s\S]*?overflow-y: auto;\s*overscroll-behavior-y: auto;/,
  )
  assert.match(
    styles,
    /@media \(max-width: 760px\) \{[\s\S]*?\.dash-command-live \.dash-operational-list \{\s*grid-template-columns: minmax\(0, 1fr\);/,
  )
  const workspaceStart = layout.indexOf('class="dash-command-center__workspace"')
  const feedStart = layout.indexOf('id="dashActivityFeedTitle"')
  const sideStart = layout.indexOf('class="dash-command-side"')
  const liveStart = layout.indexOf('id="dashCommandLivePanel"')
  const alertsStart = layout.indexOf('id="dashCommandAlertsTitle"')
  assert.ok(workspaceStart >= 0)
  assert.ok(feedStart > workspaceStart)
  assert.ok(sideStart > feedStart)
  assert.ok(liveStart > sideStart)
  assert.ok(alertsStart > liveStart)
})

test('odswiezenie danych zachowuje aktualna pozycje przewijania', () => {
  const setterStart = dashboard.indexOf('function dashboardSetOperationalListContent')
  const setterEnd = dashboard.indexOf('function dashboardMountCommandCenterPanels', setterStart)
  const setterBlock = dashboard.slice(setterStart, setterEnd)

  assert.ok(setterStart >= 0)
  assert.ok(setterEnd > setterStart)
  assert.match(setterBlock, /const scrollTop = list\.scrollTop/)
  assert.match(setterBlock, /list\.scrollTop = scrollTop/)
})

test('mapa i wiadomosci sa usuniete, a ich miejsce zajmuja aktualnosci', () => {
  assert.doesNotMatch(layout, /id="dashCommandMapPanel"/)
  assert.doesNotMatch(layout, /id="dashCommandMapHost"/)
  assert.doesNotMatch(layout, /id="dashActiveWorkersMap"/)
  assert.doesNotMatch(layout, /id="dashActiveWorkersMapOverlay"/)
  assert.doesNotMatch(layout, />Mapa operacyjna</)
  assert.doesNotMatch(layout, /id="dashCommandMessagesPanel"/)
  assert.doesNotMatch(layout, />Wiadomości</)
  assert.match(layout, /id="dashActivityFeedTitle">Aktualności z dziś</)
  assert.match(layout, /id="dashActivityCalendar" aria-live="polite"/)

  const mapRendererReferences = dashboard.match(/dashboardRenderActiveWorkersMap\(/g) ?? []
  assert.equal(mapRendererReferences.length, 0)
  assert.match(dashboard, /function dashboardRerenderOperationalAlerts\(\)/)
  assert.match(dashboard, /dashboardRenderCommandCenterAlerts\(/)
})
