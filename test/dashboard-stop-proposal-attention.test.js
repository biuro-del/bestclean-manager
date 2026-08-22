'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')

test('pulpit pokazuje alert tylko dla oczekującej propozycji STOP i prowadzi do decyzji', async () => {
  const { buildDashboardStopProposalAttentionAlert } = await import(
    '../web-app/apps/portal-web/src/features/dashboard/dashboardStopProposalAttentionModel.js'
  )

  assert.equal(buildDashboardStopProposalAttentionAlert(false), null)
  assert.deepEqual(buildDashboardStopProposalAttentionAlert(true), {
    tone: 'warning',
    icon: 'ph-clock-countdown',
    title: 'Godziny do weryfikacji',
    meta: 'Propozycje STOP oczekują na decyzję biura',
    route: 'workdayStopProposals',
  })
})

test('pulpit wykonuje wyłącznie zawężony odczyt PENDING z limitem jednego rekordu', () => {
  const dashboard = fs.readFileSync(
    path.join(root, 'web-app', 'apps', 'portal-web', 'src', 'features', 'dashboard', 'index.js'),
    'utf8',
  )

  assert.match(dashboard, /fetchWorkdayStopProposals\(activeOrgId, \{\s*status: 'PENDING',\s*limit: 1,\s*\}\)/s)
  assert.match(dashboard, /DASHBOARD_STOP_PROPOSAL_ATTENTION_CACHE_TTL_MS = 5 \* 60 \* 1000/)
  assert.match(dashboard, /hasPendingStopProposals: dashboardStopProposalAttention\.hasPending/)
  assert.match(dashboard, /dashboardRefreshStopProposalAttention\(orgId, \{\s*forceRefresh: options\.forceRefresh === true,\s*\}\)/s)
})

test('kandydat zachowuje produkcyjną kolejność: pracownik, potem miejsce realizacji', () => {
  const dashboard = fs.readFileSync(
    path.join(root, 'web-app', 'apps', 'portal-web', 'src', 'features', 'dashboard', 'index.js'),
    'utf8',
  )

  assert.match(dashboard, /const workerLabel = workers\.join\(', '\)/)
  assert.match(
    dashboard,
    /<strong>\$\{escapeHtml\(workerLabel\)\}<\/strong>\s*<small>\$\{escapeHtml\(primaryLabel\)\}<\/small>/,
  )
})
