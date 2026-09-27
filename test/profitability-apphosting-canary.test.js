'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')
const appHosting = fs.readFileSync(path.join(root, 'apphosting.yaml'), 'utf8')

function variableMarkers(name) {
  return appHosting.match(new RegExp(`^  - variable: ${name}$`, 'gm')) || []
}

function variableBlock(name) {
  const marker = `  - variable: ${name}`
  assert.equal(variableMarkers(name).length, 1, `Expected one App Hosting variable ${name}`)
  const start = appHosting.indexOf(marker)
  const end = appHosting.indexOf('\n  - variable:', start + marker.length)
  return appHosting.slice(start, end >= 0 ? end : appHosting.length)
}

const LITERAL_VALUES = Object.freeze({
  PROFITABILITY_DB_ENABLED: '"true"',
  PROFITABILITY_DB_CONNECTOR: 'cloudsql',
  PROFITABILITY_CLOUD_SQL_IP_TYPE: 'PUBLIC',
  PROFITABILITY_DB_AUTH_TYPE: 'PASSWORD',
  PROFITABILITY_DB_NAME: 'iclean-room-database',
  PROFITABILITY_DB_USER: 'profitability_session',
  PROFITABILITY_ACCESS_PROFILE_V2_ENABLED: '"true"',
  PROFITABILITY_ACCESS_PROFILE_V2_ALLOWED_ORG_IDS: 'bestclean',
  PROFITABILITY_FINANCIAL_MODEL_V21_ENABLED: '"true"',
  PROFITABILITY_FINANCIAL_MODEL_V21_ALLOWED_ORG_IDS: 'bestclean',
})

test('App Hosting enables the profitability canary only for Best Clean at runtime', () => {
  for (const [name, value] of Object.entries(LITERAL_VALUES)) {
    const block = variableBlock(name)
    assert.match(block, new RegExp(`^    value: ${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'))
    assert.match(block, /availability:\r?\n      - RUNTIME/)
    assert.doesNotMatch(block, /\n      - BUILD/)
    assert.doesNotMatch(block, /\n    secret:/)
  }
})

test('profitability password uses exactly its dedicated secret and no portal fallback', () => {
  const block = variableBlock('PROFITABILITY_DB_PASS')
  assert.match(block, /^    secret: PROFITABILITY_DB_PASS$/m)
  assert.match(block, /availability:\r?\n      - RUNTIME/)
  assert.doesNotMatch(block, /\n    value:/)
  assert.doesNotMatch(block, /PORTAL_DB_(?:USER|PASS)|WORKFORCE_SCHEDULE_DB_(?:USER|PASS)/)
  assert.doesNotMatch(variableBlock('PROFITABILITY_DB_USER'), /\n    secret:/)
})

test('profitability canary has no broad or empty allowlist', () => {
  for (const name of [
    'PROFITABILITY_ACCESS_PROFILE_V2_ALLOWED_ORG_IDS',
    'PROFITABILITY_FINANCIAL_MODEL_V21_ALLOWED_ORG_IDS',
  ]) {
    const block = variableBlock(name)
    assert.match(block, /^    value: bestclean$/m)
  }
})
