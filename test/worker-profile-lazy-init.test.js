const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const portalApp = fs.readFileSync(
  path.join(__dirname, '..', 'web-app', 'apps', 'portal-web', 'src', 'ui', 'portalApp.js'),
  'utf8',
)

function functionBody(name, nextName) {
  const start = portalApp.indexOf(`async function ${name}`)
  const end = portalApp.indexOf(`async function ${nextName}`, start + 1)
  assert.notEqual(start, -1, `${name} should exist`)
  assert.notEqual(end, -1, `${nextName} should exist after ${name}`)
  return portalApp.slice(start, end)
}

test('worker profile route initializes its lazy feature before syncing data', () => {
  const source = functionBody(
    'fetchWorkerProfilesForCurrentSession',
    'fetchWorkerAccountForCurrentSession',
  )

  assert.match(source, /await ensurePortalFeatureReady\('workerProfile'\)/)
  assert.match(source, /return getWorkerProfileFeature\(\)\.fetch\(force, options\)/)
})

test('other lazy worker routes initialize their feature before fetching', () => {
  const accountSource = functionBody(
    'fetchWorkerAccountForCurrentSession',
    'refreshWorkerAccountTimeAfterWorkdaySave',
  )
  const detailSource = functionBody(
    'fetchWorkerDetailForCurrentSession',
    'ensureReportsViewReady',
  )

  assert.match(accountSource, /await ensurePortalFeatureReady\('workerAccount'\)/)
  assert.match(detailSource, /await ensurePortalFeatureReady\('workerTimeDetail'\)/)
})
