'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')

test('pulpit pokazuje dokładną liczbę oczekujących propozycji STOP i prowadzi do decyzji', async () => {
  const { buildDashboardStopProposalAttentionAlert } = await import(
    '../web-app/apps/portal-web/src/features/dashboard/dashboardStopProposalAttentionModel.js'
  )

  assert.equal(buildDashboardStopProposalAttentionAlert(0), null)
  assert.deepEqual(buildDashboardStopProposalAttentionAlert(2), {
    tone: 'warning',
    icon: 'ph-clock-countdown',
    title: 'Godziny do weryfikacji (2)',
    meta: 'Propozycje STOP oczekują na decyzję biura',
    route: 'workdayStopProposals',
  })
  assert.equal(buildDashboardStopProposalAttentionAlert(3)?.title, 'Godziny do weryfikacji (3)')
})

test('pulpit wykonuje wyłącznie zawężony odczyt PENDING z limitem jednego rekordu i używa total', () => {
  const dashboard = fs.readFileSync(
    path.join(root, 'web-app', 'apps', 'portal-web', 'src', 'features', 'dashboard', 'index.js'),
    'utf8',
  )

  assert.match(dashboard, /fetchWorkdayStopProposals\(activeOrgId, \{\s*status: 'PENDING',\s*limit: 1,\s*\}\)/s)
  assert.match(dashboard, /DASHBOARD_STOP_PROPOSAL_ATTENTION_CACHE_TTL_MS = DASHBOARD_CHANGE_POLL_INTERVAL_MS/)
  assert.match(dashboard, /pendingStopProposalCount: dashboardStopProposalAttention\.pendingCount/)
  assert.match(dashboard, /const total = Math\.max\(0, Math\.trunc\(Number\(payload\?\.total\) \|\| 0\)\)/)
  assert.match(dashboard, /payload\?\.capability\?\.canApprove === true/)
  assert.match(dashboard, /dashboardRefreshStopProposalAttention\(orgId, \{\s*forceRefresh: options\.forceRefresh === true,\s*\}\)/s)
  assert.match(dashboard, /dashboardRefreshStopProposalAttentionPoll\(\) \{[\s\S]*?forceRefresh: true/)
  assert.match(dashboard, /if \(dashboardStopProposalAttention\.pendingCount !== previousPendingCount\) \{\s*dashboardRerenderStopProposalAttention\(\)/s)
  assert.match(dashboard, /window\.setInterval\(\(\) => \{\s*void dashboardRefreshStopProposalAttentionPoll\(\)\.catch\(\(\) => \{\}\)/s)
})

test('decyzja o propozycji unieważnia pulpit, aby licznik nie czekał na TTL cache', () => {
  const proposals = fs.readFileSync(
    path.join(root, 'web-app', 'apps', 'portal-web', 'src', 'features', 'workers', 'workday-stop-proposals', 'index.js'),
    'utf8',
  )

  assert.match(proposals, /new CustomEvent\('portal:workday-updated', \{\s*detail: \{\s*source: 'workday-stop-proposal-decision'/s)
})
