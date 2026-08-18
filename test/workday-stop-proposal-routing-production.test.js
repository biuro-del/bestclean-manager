'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

test('STOP proposal jest obsługiwany lokalnie przed workflow i ogólnym proxy', () => {
  const server = read('index.js')
  const directHandler = server.indexOf('if (requestUrl.pathname === MOBILE_WORKDAY_STOP_PROPOSALS_PATH)')
  const mobileWorkflow = server.indexOf('handleMobileWorkflowRequest(req, res, requestUrl)', directHandler)
  const genericProxy = server.indexOf('proxyApiRequest(req, res, requestUrl)', mobileWorkflow)
  const route = server.slice(directHandler, mobileWorkflow)

  assert.ok(directHandler >= 0)
  assert.ok(mobileWorkflow > directHandler)
  assert.ok(genericProxy > mobileWorkflow)
  assert.match(route, /workdayStopProposalApi\.handleMobile\(req, res, requestUrl\)/)
  assert.doesNotMatch(route, /proxyApiRequest/)
})

test('kandydat zachowuje produkcyjną konfigurację DB i nie używa konfiguracji preview', () => {
  const config = read('apphosting.yaml')

  assert.match(config, /value:\s*iclean-room/)
  assert.match(config, /value:\s*iclean-room:europe-west3:iclean-room-instance/)
  assert.match(config, /value:\s*iclean-room-database/)
  assert.match(config, /secret:\s*PORTAL_DB_USER/)
  assert.match(config, /secret:\s*PORTAL_DB_PASS/)
  assert.doesNotMatch(config, /cleanzi-portal-klienta-test|clz-schedule-preview-260812/)
})

test('migracja nadaje portal_app wyłącznie prawa runtime do nowych tabel', () => {
  const migration = read('dataconnect/migrations/20260813_workday_stop_proposals_additive.sql')

  assert.match(migration, /grant usage on schema public to portal_app;/)
  assert.match(migration, /grant select on table public\.workday_time_permission to portal_app;/)
  assert.match(migration, /grant select, insert, update on table public\.workday_stop_proposal to portal_app;/)
  assert.match(migration, /grant select, insert on table public\.workday_stop_proposal_audit to portal_app;/)
  assert.doesNotMatch(migration, /grant\s+create/i)
})
