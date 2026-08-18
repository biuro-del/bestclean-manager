'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8')

test('pulpit nie renderuje demonstracyjnej karty rentowności kontraktów', () => {
  const layout = read('web-app', 'apps', 'portal-web', 'src', 'ui', 'layoutTemplate.js')
  const dashboard = read('web-app', 'apps', 'portal-web', 'src', 'features', 'dashboard', 'index.js')

  assert.doesNotMatch(layout, /id="dashContractProfitabilityCard"/)
  assert.doesNotMatch(layout, /Dane demonstracyjne — nie pochodzą z danych firmy\./)
  assert.doesNotMatch(dashboard, /dashboardContractProfitability|DASHBOARD_CONTRACT_PROFITABILITY/)
  assert.match(layout, /data-route="contractProfitability"/)
})
