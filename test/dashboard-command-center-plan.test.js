'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const modelModule = import(
  '../web-app/apps/portal-web/src/features/dashboard/commandCenterPlanModel.js'
)

test('plan dnia koreluje postep wyłącznie po zapisanych identyfikatorach', async () => {
  const { buildCommandCenterPlanModel } = await modelModule
  const model = buildCommandCenterPlanModel({
    plannedOrders: [
      { taskId: 'TASK-1', title: 'Obiekt A' },
      { taskId: 'TASK-2', title: 'Obiekt B' },
      { taskId: 'TASK-3', title: 'Obiekt C' },
    ],
    activeOperations: [
      { taskId: 'TASK-2', planned: true },
      { title: 'Obiekt C', planned: true },
    ],
    completedOperations: [
      { taskId: 'TASK-1', planned: true, completionConfirmed: true },
    ],
  })

  assert.equal(model.completedCount, 1)
  assert.equal(model.activeCount, 1)
  assert.equal(model.waitingCount, 1)
  assert.equal(model.progressPercent, 33)
})

test('anulowane pozycje nie obniżają procentu wykonania', async () => {
  const { buildCommandCenterPlanModel } = await modelModule
  const model = buildCommandCenterPlanModel({
    plannedOrders: [
      { taskId: 'TASK-1' },
      { taskId: 'TASK-2', status: 'CANCELLED' },
    ],
    completedOperations: [
      { taskId: 'TASK-1', planned: true, completionConfirmed: true },
    ],
  })

  assert.equal(model.totalCount, 2)
  assert.equal(model.cancelledCount, 1)
  assert.equal(model.progressPercent, 100)
})

test('najbliższe 60 minut pokazuje tylko nierozpoczęty plan w oknie czasu', async () => {
  const { buildCommandCenterPlanModel } = await modelModule
  const nowTs = new Date('2026-07-28T13:00:00+02:00').getTime()
  const model = buildCommandCenterPlanModel({
    nowTs,
    plannedOrders: [
      { taskId: 'ACTIVE', startTs: nowTs + 10 * 60 * 1000 },
      { taskId: 'SOON', startTs: nowTs + 45 * 60 * 1000 },
      { taskId: 'LATER', startTs: nowTs + 90 * 60 * 1000 },
      { taskId: 'DONE', startTs: nowTs + 30 * 60 * 1000 },
    ],
    activeOperations: [{ taskId: 'ACTIVE', planned: true }],
    completedOperations: [
      { taskId: 'DONE', planned: true, completionConfirmed: true },
    ],
  })

  assert.deepEqual(model.upcoming.map((item) => item.taskId), ['SOON'])
})

test('opcja 1 ma aktualnosci po lewej oraz operacje i alerty w prawej kolumnie', () => {
  const layout = fs.readFileSync(
    path.join(__dirname, '../web-app/apps/portal-web/src/ui/layoutTemplate.js'),
    'utf8',
  )

  const workspaceIndex = layout.indexOf('class="dash-command-center__workspace"')
  const feedIndex = layout.indexOf('id="dashActivityFeedTitle"')
  const sideIndex = layout.indexOf('class="dash-command-side"')
  const liveIndex = layout.indexOf('id="dashCommandLivePanel"')
  const alertsIndex = layout.indexOf('id="dashCommandAlertsTitle"')

  assert.ok(workspaceIndex >= 0)
  assert.ok(feedIndex > workspaceIndex)
  assert.ok(sideIndex > feedIndex)
  assert.ok(liveIndex > sideIndex)
  assert.ok(alertsIndex > liveIndex)
  assert.match(
    layout,
    /class="dash-command-center__workspace"[^>]*>\s*<section[^>]*class="[^"]*dash-activity-feed-panel[^"]*"[\s\S]*?<div class="dash-command-side">\s*<article[\s\S]*?id="dashCommandLivePanel"[\s\S]*?<article class="dash-command-alerts"/,
  )
  assert.doesNotMatch(layout, /id="dashCommandMapPanel"/)
  assert.doesNotMatch(layout, /id="dashCommandMapHost"/)
  assert.doesNotMatch(layout, /id="dashCommandUpcomingList"/)
  assert.doesNotMatch(layout, /id="dashCommandMessagesPanel"/)
  assert.doesNotMatch(layout, />Najbliższe 60 minut</)
  assert.doesNotMatch(layout, />Wiadomości</)
  assert.equal(layout.match(/id="dashCommandLivePanel"/g)?.length, 1)
  assert.equal(layout.match(/class="dash-command-alerts"/g)?.length, 1)
  assert.equal(layout.match(/id="dashCommandAlertsTitle"/g)?.length, 1)
  assert.equal(layout.match(/id="dashCommandAlertsCount"/g)?.length, 1)
  assert.equal(layout.match(/id="dashCommandAlertsList"/g)?.length, 1)
  assert.equal(layout.match(/id="dashActivityFeedTitle"/g)?.length, 1)

  const ids = [...layout.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1])
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))]
  assert.deepEqual(duplicateIds, [])
})

test('desktop ma dwie kolumny opcji 1, tablet jedna kolumne, a mobile karty aktualnosci', () => {
  const styles = fs.readFileSync(
    path.join(__dirname, '../web-app/apps/portal-web/src/ui/styles/commandCenter.css'),
    'utf8',
  )

  const responsiveIndex = styles.lastIndexOf('@media (max-width: 1220px)')
  const workspaceIndex = styles.lastIndexOf(
    '#portalRoot #view-dashboard .dash-command-center__workspace',
    responsiveIndex - 1,
  )
  const responsiveStyles = styles.slice(responsiveIndex)

  assert.match(
    styles,
    /\.dash-command-center__workspace \{\s*display: grid;[\s\S]*?grid-template-columns: minmax\(0, [\d.]+fr\) minmax\(\d+px, 1fr\);/,
  )
  assert.match(
    styles,
    /#portalRoot #view-dashboard > \.dash-grid \{\s*display: block !important;/,
  )
  assert.match(
    styles,
    /\.dash-command-side \{[\s\S]*?min-width: 0;/,
  )
  assert.match(
    styles,
    /\.dash-activity-feed__columns,\s*#portalRoot #view-dashboard \.dash-activity-feed__row \{[\s\S]*?grid-template-columns: 92px/,
  )
  assert.ok(responsiveIndex > workspaceIndex)
  assert.match(responsiveStyles, /\.dash-command-center__workspace \{\s*grid-template-columns: minmax\(0, 1fr\);/)
  assert.match(styles, /@media \(max-width: 760px\) \{[\s\S]*?grid-template-areas:\s*"time status"/)
})

test('aktualności mają filtry klawiaturowe, aria-live i uczciwe przejście do historii pracy', () => {
  const layout = fs.readFileSync(
    path.join(__dirname, '../web-app/apps/portal-web/src/ui/layoutTemplate.js'),
    'utf8',
  )
  const dashboard = fs.readFileSync(
    path.join(__dirname, '../web-app/apps/portal-web/src/features/dashboard/index.js'),
    'utf8',
  )

  assert.match(layout, /id="dashCommandAlertsList"[^>]*aria-live="polite"/)
  assert.match(layout, /id="dashCommandLiveCount"[^>]*aria-live="polite"/)
  assert.match(layout, /class="dash-activity-feed__filters" role="tablist" aria-label="Kategorie aktualności"/)
  assert.equal(layout.match(/role="tab" data-dashboard-activity-filter=/g)?.length, 5)
  assert.equal(layout.match(/aria-controls="dashActivityCalendar"/g)?.length, 5)
  assert.match(layout, /id="dashActivityCalendar" aria-live="polite" aria-busy="true"/)
  assert.equal(layout.match(/data-route="events"/g)?.length >= 2, true)
  assert.match(layout, /Historia zdarzeń pracy/)
  assert.doesNotMatch(layout, />Pełna historia systemu</)
  assert.match(dashboard, /\['ArrowLeft', 'ArrowRight', 'Home', 'End'\]/)
  assert.match(dashboard, /dashboardSetActivityFeedFilter/)
})
