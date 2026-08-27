'use strict'

const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const root = path.join(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

test('Godziny do weryfikacji są bezpośrednio pod listą pracowników i prowadzą do działającej trasy', () => {
  const layout = read('web-app/apps/portal-web/src/ui/layoutTemplate.js')
  const portalApp = read('web-app/apps/portal-web/src/ui/portalApp.js')
  const router = read('web-app/apps/portal-web/src/ui/router.js')
  const feature = read('web-app/apps/portal-web/src/features/workers/workday-stop-proposals/index.js')
  const template = read('web-app/apps/portal-web/src/features/workers/workday-stop-proposals/template.html')
  const service = read('web-app/apps/portal-web/src/services/workdayStopProposalService.js')

  const workersMenu = layout.slice(layout.indexOf('id="submenu-workers"'), layout.indexOf('id="submenu-reports"'))
  assert.ok(workersMenu.indexOf('data-route="workerProfile"') >= 0)
  assert.ok(workersMenu.indexOf('data-route="workdayStopProposals"') > workersMenu.indexOf('data-route="workerProfile"'))
  assert.match(workersMenu, /Godziny do weryfikacji/)
  assert.match(layout, /id="view-workdayStopProposals"/)

  assert.match(router, /workdayStopProposals: 'view-workdayStopProposals'/)
  assert.match(router, /workdayStopProposals: 'workers'/)
  assert.match(portalApp, /workdayStopProposals: \['workdayStopProposals'\]/)
  assert.match(portalApp, /import\('\.\.\/features\/workers\/workday-stop-proposals\/index\.js'\)/)
  assert.match(portalApp, /await refreshWorkdayStopProposals\(\)/)
  assert.match(template, /Godziny do weryfikacji/)
  assert.match(template, /<option value="PENDING">Weryfikacja<\/option>/)
  assert.match(feature, /PENDING: 'Weryfikacja'/)
  assert.match(feature, /workdayStopProposalStatusLabel\(row\.status\)/)
  assert.match(feature, /workdayStopProposalStatusLabel\(proposal\.status\)/)
  assert.match(feature, /proposal\.status === 'PENDING'/)
  assert.match(feature, /oficjalny czas STOP/)
  assert.match(service, /\/portal\/workday-stop-proposals/)
})
